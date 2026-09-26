import {
  gaussianBlur,
  sobel,
  nonMaxSuppression,
  hysteresis,
  thinning,
  angleToChar,
  spatialSample
} from './edges.mjs';
import { IMAGE_DEFAULTS } from './image-settings.mjs';

// Unsharp masking strengthens local contrast without changing the shading source.
function sharpen(gray, width, height, amount) {
  if (!amount) return gray;
  const smooth = gaussianBlur(gray, width, height, 1);
  return gray.map((value, index) =>
    Math.max(0, Math.min(1, value + amount * (value - smooth[index])))
  );
}
function convertWithStats(imageData, settings = {}, size = { w: 1193, h: 593 }) {
  settings = { ...IMAGE_DEFAULTS, ...settings };
  const { width: W, height: H, data: px } = imageData;
  const num = (key, fallback, min, max) => {
    const n = Number(settings[key] ?? fallback);
    return Math.max(min, Math.min(max, Number.isFinite(n) ? n : fallback));
  };
  const gray = new Float32Array(W * H),
    grayOrig = new Float32Array(W * H);
  const bright = num('bright', 0, -100, 100) / 100,
    contrast = num('contrast', 15, -100, 100) / 100;
  for (let i = 0; i < gray.length; i++) {
    const alpha = px[i * 4 + 3] / 255;
    let l = (px[i * 4] * 0.2126 + px[i * 4 + 1] * 0.7152 + px[i * 4 + 2] * 0.0722) / 255;
    l = l * alpha + 1 - alpha;
    grayOrig[i] = l;
    if (settings.invert) l = 1 - l;
    gray[i] = Math.max(0, Math.min(1, (l + bright - 0.5) * (1 + contrast * 2) + 0.5));
  }
  const blurred = gaussianBlur(gray, W, H, num('blur', 1.2, 0, 4));
  const sharpened = sharpen(blurred, W, H, num('sharpness', 0, 0, 200) / 100);
  const { mag, ang } = sobel(sharpened, W, H);
  const threshold = num('thr', 0.12, 0.01, 0.8);
  let edges = hysteresis(nonMaxSuppression(mag, ang, W, H), W, H, threshold, threshold * 0.4);
  if (settings.thinning !== false) edges = thinning(edges, W, H);
  const fill = num('fill', 85, 20, 100) / 100;
  const scale = Math.min(((size.w - 30) * fill) / W, ((size.h - 30) * fill) / H);
  const offsetX = (size.w - 30 - W * scale) / 2,
    offsetY = (size.h - 30 - H * scale) / 2;
  const step = num('gridStep', 4, 2, 20) / (num('density', 100, 10, 200) / 100);
  const max = Math.floor(num('maxCats', 1000, 100, 10000));
  const all = [];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) if (edges[y * W + x]) all.push({ x, y, ang: ang[y * W + x] });
  const edgePoints = spatialSample(all, step, settings.shading ? Math.floor(max * 0.75) : max);
  const points = edgePoints.map((p) => ({
    x: offsetX + p.x * scale,
    y: offsetY + p.y * scale,
    ch: angleToChar(p.ang, settings.charset || '.', !!settings.autoOrient, !!settings.onlyDots)
  }));
  let shadeCount = 0;
  if (settings.shading) {
    const chars = Array.from(settings.shadeCharset || '.·:');
    const density = num('shadeDensity', 30, 5, 100) / 100,
      threshold = num('shadeThreshold', 45, 10, 90) / 100;
    const shade = [],
      cell = Math.max(3, Math.round(step));
    for (let y = 1; y < H - 1; y += cell)
      for (let x = 1; x < W - 1; x += cell) {
        const l = settings.invert ? 1 - grayOrig[y * W + x] : grayOrig[y * W + x];
        // Deterministic sampling: adjusting a slider does not flicker or randomize the artwork.
        const random =
          ((Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0) / 4294967295;
        if (l < threshold && !edges[y * W + x] && random < density)
          shade.push({
            x: offsetX + x * scale,
            y: offsetY + y * scale,
            ch: chars[Math.min(chars.length - 1, Math.floor((1 - l / threshold) * chars.length))]
          });
      }
    const sampledShade = spatialSample(shade, 2, Math.max(0, max - points.length));
    shadeCount = sampledShade.length;
    points.unshift(...sampledShade);
  }
  return {
    points,
    stats: {
      contours: edgePoints.length,
      shading: shadeCount,
      total: points.length,
      limit: max,
      width: W,
      height: H,
      effectiveStep: step
    }
  };
}
function convert(imageData, settings) {
  return convertWithStats(imageData, settings).points;
}
export { convert, convertWithStats, sharpen };
