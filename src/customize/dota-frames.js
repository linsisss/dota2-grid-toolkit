import { VideoSample, VideoSampleSource } from 'mediabunny';
import { DOTA_VIDEO_COLOR, i420Size, rgbaToI420 } from '../../scripts/dota-video-color.mjs';

// A canvas's frames for a video Dota plays (scripts/dota-video-color.mjs): instead of mediabunny's
// CanvasSource, which lets the browser pick the RGB→YUV matrix (Chrome picked BT.709 and Dota showed it
// magenta), each frame is read back, turned into BT.601 I420 here and encoded as it is. `add(timestamp,
// duration)` takes the canvas as it is now, like CanvasSource.add.
export function dotaCanvasSource(canvas, options) {
  const source = new VideoSampleSource(options), context = canvas.getContext('2d');
  const { width, height } = canvas, data = new Uint8Array(i420Size(width, height));
  async function add(timestamp, duration) {
    rgbaToI420(context.getImageData(0, 0, width, height).data, width, height, data);
    const sample = new VideoSample(data, { format: 'I420', codedWidth: width, codedHeight: height, timestamp, duration, colorSpace: DOTA_VIDEO_COLOR });
    // The encoder copies the frame before add() resolves, so the buffer serves the next one.
    try { await source.add(sample); } finally { sample.close(); }
  }
  return { source, add };
}
