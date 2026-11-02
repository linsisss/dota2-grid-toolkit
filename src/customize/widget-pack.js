// The main menu's widgets for the menu pack, in the browser (scripts/menu-widgets.mjs says what they are):
// each picture widget's file becomes a texture of the widget's size (PNG inside, as the heroes' portraits:
// scripts/dota-vtex.mjs), each video widget's a WebM of its size made the way the portraits' movies are
// (portrait-media.js encodeMovie: BT.601, the source frames sampled exactly), then widgetsPanorama writes the
// panels, the style and the script. → { made, media: [{ path, data }], bytes } or null with no widget to build.
import { cleanWidgets, widgetMediaJobs, widgetMediaPath, widgetsPanorama } from '../../scripts/menu-widgets.mjs';
import { vtexResource } from '../../scripts/dota-vtex.mjs';
import { lang } from '../../scripts/i18n.mjs';
import { mediaFile } from './look-store.js';
import { encodeMovie, openPortrait, pixels } from './portrait-media.js';

// The biggest side a widget's picture or video is made at (a widget is at most the screen, 1920 × 1023).
const SIDE = { image: 1024, video: 960 };
export const WIDGET_VIDEO = Object.freeze({ seconds: 15, fps: 30 });
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
// The widget's box at most `side` on its longer edge (its own proportions).
function boxOf(widget, side) {
  const scale = Math.min(1, side / Math.max(widget.w, widget.h));
  return { width: even(widget.w * scale), height: even(widget.h * scale) };
}
// One frame of the file into the box: `cover` fills it (the edges cut), `contain` fits it whole.
function paintInto(context, source, width, height, fit) {
  const { width: W, height: H } = context.canvas, scale = fit === 'contain' ? Math.min(W / width, H / height) : Math.max(W / width, H / height);
  const w = width * scale, h = height * scale;
  context.drawImage(source, (W - w) / 2, (H - h) / 2, w, h);
}

export async function widgetFiles(list, { onProgress = () => {}, signal } = {}) {
  const widgets = cleanWidgets(list).filter((w) => !w.hidden);
  if (!widgets.length) return null;
  const jobs = widgetMediaJobs(widgets);
  const media = {}, files = [];
  let done = 0;
  for (const widget of jobs) {
    const { hash, kind, key } = widget, path = widgetMediaPath(kind, hash);
    if (media[key]) { onProgress(++done / jobs.length); continue; }
    const file = await mediaFile(hash);
    if (!file) { onProgress(++done / jobs.length); continue; }   // the file is not in this browser: the widget stays out
    const opened = await openPortrait(file);
    if (kind === 'image') {
      const { width, height } = boxOf(widget, SIDE.image), canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d');
      context.imageSmoothingQuality = 'high';
      paintInto(context, opened.still, opened.width, opened.height, widget.fit);
      files.push({ path, data: await vtexResource({ path, rgba: pixels(canvas), width, height }) });
    } else {
      const { width, height } = boxOf(widget, SIDE.video);
      const bitrate = Math.round(Math.min(3_000_000, Math.max(800_000, width * height * 30 * 0.12)));
      const data = await encodeMovie(file, opened, { width, height, seconds: WIDGET_VIDEO.seconds, fps: WIDGET_VIDEO.fps, bitrate, signal,
        paint: (context, source, w, h) => { context.fillStyle = '#000'; context.fillRect(0, 0, width, height); paintInto(context, source, w, h, widget.fit); },
        onProgress: (share) => onProgress((done + share) / jobs.length) });
      files.push({ path, data });
    }
    media[key] = path;
    onProgress(++done / jobs.length);
  }
  const made = widgetsPanorama(widgets, { media, lang: lang === 'en' ? 'en' : 'ru' });
  if (!made) return null;
  return { made, media: files, bytes: files.reduce((sum, file) => sum + file.data.length, 0) + made.panels.length + made.style.length + (made.script?.length || 0) };
}
