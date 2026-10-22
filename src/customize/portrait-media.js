import { ALL_FORMATS, BlobSource, BufferTarget, Input, Output, VideoSampleSink, WebMOutputFormat, canEncodeVideo } from 'mediabunny';
import { mediaKind } from '../../scripts/menu-background.mjs';
import { PORTRAIT_LIMITS, PORTRAIT_MOVIE, PORTRAIT_PLACES, cropRect, movieRect } from '../../scripts/hero-portraits.mjs';
import { t } from '../../scripts/i18n.mjs';
import { dotaCanvasSource } from './dota-frames.js';
import { sampleNudge, sampleTimes } from '../../scripts/video-resample.mjs';

// «Портреты героев» in the browser (scripts/hero-portraits.mjs says what goes where): the user's file
// opened once (its still frame and size), each place's picture cut from it, and the hover movie
// encoded like Valve's: the card's frame stretched to 256 × 256, VP8 (VP9 where the browser has no VP8 encoder), 30 fps, no sound,
// at most PORTRAIT_LIMITS.seconds from the chosen start. A still picture becomes a still movie
// (PORTRAIT_MOVIE.stillSeconds at 1 fps), so hovering the card does not play Valve's.
// Its frames go to the encoder as BT.601 I420 (dota-frames.js), the matrix Dota reads movies with.
export class PortraitError extends Error {}

// A file → { kind: 'image' | 'video', label, mime, width, height, duration (s, video), still: drawable of
// the frame at `start` }. GIFs and animated WebP are videos here (their movie moves).
export async function openPortrait(file, start = 0) {
  if (file.size > PORTRAIT_LIMITS.fileBytes) throw new PortraitError(t('Файл больше {size} МБ.', { size: PORTRAIT_LIMITS.fileBytes / 1_000_000 }));
  const kind = mediaKind(new Uint8Array(await file.slice(0, 32).arrayBuffer()));
  if (!kind) throw new PortraitError(t('Нужна картинка (PNG, JPEG, WebP), GIF или видео (MP4, WebM).'));
  if (kind.type === 'video') return { ...(await videoFrame(file, kind, start)), kind: 'video', label: kind.label, mime: kind.mime };
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new PortraitError(t('Не получилось открыть {kind}. Пересохрани картинку или выбери другую.', { kind: kind.label })); }
  const moving = !kind.still && await animated(file, kind);
  return { kind: moving ? 'video' : 'image', label: kind.label, mime: kind.mime, width: bitmap.width, height: bitmap.height, duration: moving?.duration ?? 0, still: bitmap };
}
// A GIF's or WebP's animation: { duration } when it has more than one frame.
async function animated(file, kind) {
  if (typeof ImageDecoder === 'undefined' || !(await ImageDecoder.isTypeSupported(kind.mime))) return null;
  const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: kind.mime });
  try {
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    if (!track?.animated || track.frameCount < 2) return null;
    let duration = 0;
    for (let index = 0; index < track.frameCount && duration < PORTRAIT_LIMITS.seconds; index++) { const { image } = await decoder.decode({ frameIndex: index }); duration += frameSeconds(image); image.close(); }
    return { duration };
  } catch { return null; } finally { decoder.close(); }
}
const frameSeconds = (image) => { const seconds = (image.duration || 0) / 1e6; return seconds >= 0.02 ? seconds : 0.1; };
async function videoFrame(file, kind, start) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack().catch(() => null);
    if (!track) throw new PortraitError(t('В файле {kind} не нашлось видео, которое браузер может прочитать.', { kind: kind.label }));
    if (!(await track.canDecode())) throw new PortraitError(t('Браузер не может прочитать это видео. Пересохрани его в MP4 (H.264) или WebM.'));
    const first = await track.getFirstTimestamp(), duration = Math.max(0.1, (await track.computeDuration()) - first);
    const sample = await new VideoSampleSink(track).getSample(first + Math.min(start, Math.max(0, duration - 0.05)));
    if (!sample) throw new PortraitError(t('Браузер не может прочитать это видео. Пересохрани его в MP4 (H.264) или WebM.'));
    const canvas = new OffscreenCanvas(sample.displayWidth, sample.displayHeight);
    canvas.getContext('2d').drawImage(sample.toCanvasImageSource(), 0, 0);
    sample.close();
    return { width: canvas.width, height: canvas.height, duration, still: canvas };
  } finally { input.dispose?.(); }
}

// Each place's picture from a frame: { card, wide, icon } as canvases of Valve's sizes.
export function placePictures(still, crop) {
  return Object.fromEntries(Object.entries(PORTRAIT_PLACES).map(([kind, place]) => {
    const canvas = document.createElement('canvas'), r = cropRect(still.width, still.height, place.width, place.height, crop);
    canvas.width = place.width; canvas.height = place.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingQuality = 'high';
    context.drawImage(still, r.x, r.y, r.w, r.h, 0, 0, place.width, place.height);
    return [kind, canvas];
  }));
}
export const pixels = (canvas) => new Uint8Array(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.buffer);

// One frame of the movie: the card's cut stretched over the whole square, as Valve's movies are (Dota
// stretches it back into the hover card: scripts/hero-portraits.mjs), so the hover shows the card.
function paintMovie(context, source, width, height, crop) {
  const side = PORTRAIT_MOVIE.side, r = movieRect(width, height, crop);
  context.drawImage(source, r.x, r.y, r.w, r.h, 0, 0, side, side);
}
async function encoder(canvas) {
  if (typeof VideoEncoder === 'undefined') throw new PortraitError(t('Этот браузер не умеет собирать видео. Открой страницу в Chrome, Edge, Яндекс Браузере или Firefox.'));
  const bitrate = PORTRAIT_MOVIE.bitrate, size = { width: canvas.width, height: canvas.height, bitrate };
  for (const codec of ['vp8', 'vp9']) {
    if (await canEncodeVideo(codec, { ...size, hardwareAcceleration: 'prefer-software' })) return { codec, bitrate, hardwareAcceleration: 'prefer-software', keyFrameInterval: 2 };
    if (await canEncodeVideo(codec, size)) return { codec, bitrate, keyFrameInterval: 2 };
  }
  throw new PortraitError(t('Браузер не может кодировать WebM. Открой страницу в Chrome, Edge, Яндекс Браузере или Firefox.'));
}
// The movie of a hero: file + its opened source (openPortrait), crop, start → Uint8Array (WebM).
export async function encodePortraitMovie(file, opened, { crop, start = 0, onProgress = () => {}, signal } = {}) {
  const side = PORTRAIT_MOVIE.side, canvas = new OffscreenCanvas(side, side), context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  const options = await encoder(canvas), output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  const { source, add } = dotaCanvasSource(canvas, options);
  const still = opened.kind === 'image';
  output.addVideoTrack(source, { frameRate: still ? 1 : PORTRAIT_MOVIE.fps });
  await output.start();
  const stop = () => { if (signal?.aborted) throw new DOMException('Отменено', 'AbortError'); };
  try {
    if (still) {
      paintMovie(context, opened.still, opened.width, opened.height, crop);
      for (let second = 0; second < PORTRAIT_MOVIE.stillSeconds; second++) { stop(); await add(second, 1); }
    } else if (opened.mime === 'image/gif' || opened.mime === 'image/webp') await gifFrames(file, opened, crop, context, add, stop, onProgress);
    else await videoFrames(file, opened, crop, start, context, add, stop, onProgress);
    await output.finalize();
  } catch (error) { await output.cancel().catch(() => {}); throw error; }
  onProgress(1);
  return new Uint8Array(output.target.buffer);
}
async function gifFrames(file, opened, crop, context, add, stop, onProgress) {
  const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: opened.mime });
  try {
    await decoder.tracks.ready;
    let time = 0;
    for (let index = 0; index < decoder.tracks.selectedTrack.frameCount && time < PORTRAIT_LIMITS.seconds; index++) {
      stop();
      const { image } = await decoder.decode({ frameIndex: index }), seconds = Math.min(frameSeconds(image), PORTRAIT_LIMITS.seconds - time);
      paintMovie(context, image, image.displayWidth, image.displayHeight, crop); image.close();
      await add(time, seconds); time += seconds; onProgress(time / PORTRAIT_LIMITS.seconds);
    }
  } finally { decoder.close(); }
}
async function videoFrames(file, opened, crop, start, context, add, stop, onProgress) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack(), first = await track.getFirstTimestamp();
    const from = Math.max(0, Math.min(start, opened.duration - 0.1)), to = Math.min(opened.duration, from + PORTRAIT_LIMITS.seconds);
    // The source frame nearest to each output time (scripts/video-resample.mjs: rounded timestamps made repeats).
    const nudge = sampleNudge((await track.computePacketStats(120).catch(() => null))?.averagePacketRate, PORTRAIT_MOVIE.fps);
    const frames = Math.max(1, Math.round((to - from) * PORTRAIT_MOVIE.fps)), times = sampleTimes({ first, from, frames, fps: PORTRAIT_MOVIE.fps, nudge });
    const samples = new VideoSampleSink(track).samplesAtTimestamps(times);
    try {
      for (let k = 0; k < frames; k++) {
        stop();
        const { value: sample } = await samples.next();
        if (sample) { paintMovie(context, sample.toCanvasImageSource(), sample.displayWidth, sample.displayHeight, crop); sample.close(); }
        await add(k / PORTRAIT_MOVIE.fps, 1 / PORTRAIT_MOVIE.fps);
        onProgress((k + 1) / frames);
      }
    } finally { await samples.return?.(); }
  } finally { input.dispose?.(); }
}
// The movie's size before it is made: the bitrate over its length (a still one is a few KB).
export const movieGuess = (opened, start = 0) => (opened.kind === 'image' ? 15_000 : Math.round(PORTRAIT_MOVIE.bitrate / 8 * Math.min(PORTRAIT_LIMITS.seconds, Math.max(0.5, (opened.duration || PORTRAIT_LIMITS.seconds) - start))));
