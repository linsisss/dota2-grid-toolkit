import { ALL_FORMATS, BlobSource, BufferTarget, CanvasSource, Input, Output, VideoSampleSink, WebMOutputFormat, canEncodeVideo } from 'mediabunny';
import { MENU_LIMITS, mediaKind, menuBitrate, menuLook } from '../../scripts/menu-background.mjs';

// The upload becomes the menu's WebM right in the browser (WebCodecs through Mediabunny): VP9, or
// VP8 where the browser has no VP9 encoder, no sound (Dota has no Opus decoder), 30 fps, at most
// MENU_LIMITS.seconds and ~14 MB. Frames are drawn on a black screen of the chosen size: `cover`
// crops the edges, `contain` letterboxes; transparency becomes black. A picture is a 10-second
// clip at 1 fps, a GIF or animated WebP keeps its frame timing. A video gives the chosen piece
// (Trim.jsx), resampled to 30 fps; with a crossfade of f seconds the clip starts f seconds into the
// piece and its last f seconds fade into the piece's first f, so the loop has no seam. Blur and dim
// (menuLook) are drawn into every frame.
export class MenuVideoError extends Error {}
const STILL_SECONDS = 10, FPS = 30;

function paint(context, source, sourceWidth, sourceHeight, fit, look, ground = true) {
  const { width, height } = context.canvas;
  if (ground) { context.fillStyle = '#000'; context.fillRect(0, 0, width, height); }
  const scale = (fit === 'cover' ? Math.max : Math.min)(width / sourceWidth, height / sourceHeight) * look.zoom;
  const w = sourceWidth * scale, h = sourceHeight * scale, x = (width - w) / 2, y = (height - h) / 2;
  context.imageSmoothingQuality = 'high';
  if (!look.sigma) return context.drawImage(source, x, y, w, h);
  // The blur runs on a copy k times smaller (σ/k ≥ 4 pixels there), which looks the same once
  // scaled back and is many times faster; the blurred copy is smooth enough for bilinear scaling
  // ('low', bicubic costs ~5× more). Without canvas filters (older Safari) the scaling alone
  // blurs, a few pixels per σ.
  const filter = canFilter(context), k = filter ? Math.max(1, Math.floor(look.sigma / 4)) : Math.max(2, look.sigma / 1.5);
  if (k === 1) { context.filter = `blur(${look.sigma}px)`; context.drawImage(source, x, y, w, h); context.filter = 'none'; return; }
  const small = look.small ??= new OffscreenCanvas(Math.ceil(width / k), Math.ceil(height / k)), tiny = small.getContext('2d');
  tiny.clearRect(0, 0, small.width, small.height); tiny.imageSmoothingQuality = 'high';
  if (filter) tiny.filter = `blur(${look.sigma / k}px)`;
  tiny.drawImage(source, x / k, y / k, w / k, h / k); tiny.filter = 'none';
  context.imageSmoothingQuality = 'low'; context.drawImage(small, 0, 0, small.width * k, small.height * k);
}
const veil = (context, look) => { if (look.veil) { context.fillStyle = `rgba(0,0,0,${look.veil})`; context.fillRect(0, 0, context.canvas.width, context.canvas.height); } };
let filters;
function canFilter(context) {
  if (filters === undefined) { context.filter = 'blur(1px)'; filters = context.filter === 'blur(1px)'; context.filter = 'none'; }
  return filters;
}
async function pickCodec(width, height, bitrate) {
  if (typeof VideoEncoder === 'undefined') throw new MenuVideoError('Этот браузер не умеет собирать видео. Открой страницу в Chrome, Edge, Яндекс Браузере или Firefox.');
  for (const codec of ['vp9', 'vp8']) if (await canEncodeVideo(codec, { width, height, bitrate })) return codec;
  throw new MenuVideoError('Браузер не может кодировать WebM. Открой страницу в Chrome, Edge, Яндекс Браузере или Firefox.');
}

// The frames of a picture: an animation through ImageDecoder where there is one, else one still.
async function* pictureFrames(file, kind) {
  if (typeof ImageDecoder !== 'undefined' && ['image/gif', 'image/webp'].includes(kind.mime) && await ImageDecoder.isTypeSupported(kind.mime)) {
    const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: kind.mime });
    try {
      await decoder.tracks.ready;
      const track = decoder.tracks.selectedTrack;
      if (track?.animated && track.frameCount > 1) {
        for (let index = 0; index < track.frameCount; index++) {
          const { image } = await decoder.decode({ frameIndex: index });
          // Browsers show GIF delays under 20 ms as 100 ms; so does the result.
          const seconds = (image.duration || 0) / 1e6;
          yield { image, width: image.displayWidth, height: image.displayHeight, duration: seconds >= 0.02 ? seconds : 0.1, close: () => image.close() };
        }
        return;
      }
    } finally { decoder.close(); }
  }
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new MenuVideoError(`Не получилось открыть ${kind.label}. Пересохрани картинку или выбери другую.`); }
  yield { image: bitmap, width: bitmap.width, height: bitmap.height, duration: null, close: () => bitmap.close() };
}

async function encodePicture(file, kind, canvas, fit, look, onProgress, signal) {
  const context = canvas.getContext('2d');
  const frames = pictureFrames(file, kind), first = await frames.next();
  const still = first.value.duration === null, seconds = still ? STILL_SECONDS : MENU_LIMITS.seconds;
  const bitrate = menuBitrate(seconds), codec = await pickCodec(canvas.width, canvas.height, bitrate);
  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec, bitrate, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: still ? 1 : 30 });
  await output.start();
  let time = 0, trimmed = false;
  try {
    if (still) {
      paint(context, first.value.image, first.value.width, first.value.height, fit, look); veil(context, look); first.value.close();
      for (let second = 0; second < STILL_SECONDS; second++) {
        if (signal?.aborted) throw new DOMException('Отменено', 'AbortError');
        await source.add(second, 1); onProgress(second / STILL_SECONDS);
      }
      time = STILL_SECONDS;
    } else {
      for (let frame = first; !frame.done; frame = await frames.next()) {
        if (signal?.aborted) { frame.value.close(); throw new DOMException('Отменено', 'AbortError'); }
        if (time >= MENU_LIMITS.seconds) { frame.value.close(); trimmed = true; break; }
        paint(context, frame.value.image, frame.value.width, frame.value.height, fit, look); veil(context, look); frame.value.close();
        const duration = Math.min(frame.value.duration, MENU_LIMITS.seconds - time);
        await source.add(time, duration); time += duration; onProgress(time / MENU_LIMITS.seconds);
      }
    }
    await output.finalize();
  } catch (error) { await output.cancel().catch(() => {}); throw error; }
  finally { await frames.return?.(); }
  return { video: new Uint8Array(output.target.buffer), seconds: time, trimmed, codec };
}

async function encodeVideo(file, kind, canvas, fit, look, onProgress, signal, { piece = null, crossfade = 0 } = {}) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack().catch(() => null);
    if (!track) throw new MenuVideoError(`В файле ${kind.label} не нашлось видео, которое браузер может прочитать.`);
    if (!(await track.canDecode())) throw new MenuVideoError('Браузер не может прочитать это видео. Пересохрани его в MP4 (H.264) или WebM.');
    // Media time 0 is the first frame, as in a <video> element.
    const first = await track.getFirstTimestamp(), length = Math.max(0.1, (await input.computeDuration()) - first);
    const start = Math.max(0, Math.min(piece?.start ?? 0, length - 0.1));
    const end = Math.min(length, piece?.end ?? length, start + MENU_LIMITS.seconds);
    const fade = Math.max(0, Math.min(crossfade, (end - start) / 3));
    const seconds = end - start - fade, frames = Math.max(1, Math.round(seconds * FPS));
    const bitrate = menuBitrate(seconds), codec = await pickCodec(canvas.width, canvas.height, bitrate);
    const context = canvas.getContext('2d');
    const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
    const source = new CanvasSource(canvas, { codec, bitrate, keyFrameInterval: 2 });
    output.addVideoTrack(source, { frameRate: FPS });
    await output.start();
    // One decoder walks the clip frame by frame; a second one, the piece's start for the blend.
    const times = Array.from({ length: frames }, (_, k) => start + fade + k / FPS), blendFrom = end - fade;
    const main = new VideoSampleSink(track).samplesAtTimestamps(times.map((t) => first + t));
    const head = fade ? new VideoSampleSink(track).samplesAtTimestamps(times.filter((t) => t >= blendFrom).map((t) => first + t - (end - start - fade))) : null;
    try {
      for (const [k, t] of times.entries()) {
        if (signal?.aborted) throw new DOMException('Отменено', 'AbortError');
        const { value: sample } = await main.next();
        if (sample) { paint(context, sample.toCanvasImageSource(), sample.displayWidth, sample.displayHeight, fit, look); sample.close(); }
        if (head && t >= blendFrom) {
          const { value: other } = await head.next();
          if (other) {
            context.globalAlpha = Math.min(1, (t - blendFrom) / fade);
            paint(context, other.toCanvasImageSource(), other.displayWidth, other.displayHeight, fit, look, false);
            context.globalAlpha = 1; other.close();
          }
        }
        veil(context, look);
        await source.add(k / FPS, 1 / FPS);
        onProgress((k + 1) / frames);
      }
      await output.finalize();
    } catch (error) { await output.cancel().catch(() => {}); throw error; }
    finally { await main.return?.(); await head?.return?.(); }
    return { video: new Uint8Array(output.target.buffer), seconds, trimmed: start > 0.05 || end < length - 0.05, codec };
  } finally { input.dispose?.(); }
}

// file: File; size: [width, height]; fit: 'cover' | 'contain'; effects: { blur, dim } from 0 to 1.
export async function encodeMenuVideo(file, { size: [width, height], fit, effects = {}, piece = null, crossfade = 0, onProgress = () => {}, signal } = {}) {
  if (file.size > MENU_LIMITS.bytes) throw new MenuVideoError(`Файл больше ${MENU_LIMITS.bytes / 1_000_000} МБ.`);
  const kind = mediaKind(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!kind) throw new MenuVideoError('Нужна картинка (PNG, JPEG, WebP), GIF или видео (MP4, WebM).');
  if (typeof OffscreenCanvas === 'undefined') throw new MenuVideoError('Этот браузер устарел для сборки видео. Открой страницу в Chrome, Edge, Яндекс Браузере или Firefox.');
  const canvas = new OffscreenCanvas(width, height);
  const look = menuLook(effects, height);
  const result = kind.type === 'video' ? await encodeVideo(file, kind, canvas, fit, look, onProgress, signal, { piece, crossfade }) : await encodePicture(file, kind, canvas, fit, look, onProgress, signal);
  onProgress(1);
  return { ...result, kind };
}
