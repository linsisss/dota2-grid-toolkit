// The colours of the videos we make for Dota (measured 22.10.2026, docs/customize.md «Цвета видео»).
// Dota's MoviePanel turns a WebM's YUV into RGB with the BT.601 matrix, limited range, whatever the file
// says: a pack whose VP9 was tagged BT.709 (and was BT.709 inside) showed in the menu exactly as the
// BT.709 numbers read as BT.601 — reds and greens pulled towards magenta (R′ = 0.914R + 0.078G + 0.008B,
// G′ = −0.105R + 1.172G − 0.067B, B′ = 0.010R + 0.032G + 0.958B), while the site, which reads the tags,
// showed the right colours. Which matrix the browser's encoder picks for canvas frames is its own
// business (Chrome on the owner's PC: BT.709; another browser: BT.601). So the builder converts the
// canvas to YUV itself, with the matrix Dota uses, and hands the encoder ready I420 frames.
//
// The tags (DOTA_VIDEO_COLOR) say the same to the browser: the BT.601 matrix, limited range, and the
// canvas's own sRGB primaries and transfer, so the site's preview of the built WebM shows the very
// RGB the canvas had (no gamut conversion, as SMPTE 170M primaries would ask for), as Dota does.
export const DOTA_VIDEO_COLOR = Object.freeze({ matrix: 'smpte170m', primaries: 'bt709', transfer: 'iec61966-2-1', fullRange: false });

// BT.601, limited range, 8 bits: Y = 16…235, Cb and Cr = 16…240 around 128 (ITU-R BT.601, ×2¹⁶).
const K = Object.freeze({
  y: [16829, 33039, 6416], // 0.256788, 0.504129, 0.097906
  u: [-9714, -19070, 28784], // −0.148223, −0.290993, 0.439216
  v: [28784, -24103, -4681] // 0.439216, −0.367788, −0.071427
});
const ROUND = 1 << 15, Y0 = (16 << 16) + ROUND, C0 = (128 << 16) + ROUND;

// Bytes of an I420 frame: the Y plane, then Cb and Cr at half the size each way (rounded up).
export const i420Size = (width, height) => width * height + 2 * Math.ceil(width / 2) * Math.ceil(height / 2);

// RGBA pixels (a canvas's getImageData: not premultiplied) → I420 in `out`. A see-through pixel counts
// as drawn over black, as the encoder did with the canvas before. Chroma is the mean of each 2×2 block.
export function rgbaToI420(rgba, width, height, out = new Uint8Array(i420Size(width, height))) {
  const cw = Math.ceil(width / 2), ch = Math.ceil(height / 2), uAt = width * height, vAt = uAt + cw * ch;
  if (rgba.length < width * height * 4) throw new Error('rgbaToI420: мало пикселей для такого размера.');
  if (out.length < i420Size(width, height)) throw new Error('rgbaToI420: мал буфер I420.');
  const [yr, yg, yb] = K.y, [ur, ug, ub] = K.u, [vr, vg, vb] = K.v;
  if (width % 2 === 0 && height % 2 === 0 && opaque(rgba, width * height * 4)) {
    // The usual frame (even size, nothing see-through): two rows at a time, no checks inside (about twice as fast).
    const row = width * 4;
    for (let cy = 0, c = 0; cy < ch; cy++) {
      for (let cx = 0, p = 2 * cy * row, q = p + row, y = 2 * cy * width; cx < cw; cx++, p += 8, q += 8, y += 2, c++) {
        const r0 = rgba[p], g0 = rgba[p + 1], b0 = rgba[p + 2], r1 = rgba[p + 4], g1 = rgba[p + 5], b1 = rgba[p + 6];
        const r2 = rgba[q], g2 = rgba[q + 1], b2 = rgba[q + 2], r3 = rgba[q + 4], g3 = rgba[q + 5], b3 = rgba[q + 6];
        out[y] = (yr * r0 + yg * g0 + yb * b0 + Y0) >> 16;
        out[y + 1] = (yr * r1 + yg * g1 + yb * b1 + Y0) >> 16;
        out[y + width] = (yr * r2 + yg * g2 + yb * b2 + Y0) >> 16;
        out[y + width + 1] = (yr * r3 + yg * g3 + yb * b3 + Y0) >> 16;
        const sr = r0 + r1 + r2 + r3, sg = g0 + g1 + g2 + g3, sb = b0 + b1 + b2 + b3;
        out[uAt + c] = ((ur * sr + ug * sg + ub * sb) / 4 + C0) >> 16;
        out[vAt + c] = ((vr * sr + vg * sg + vb * sb) / 4 + C0) >> 16;
      }
    }
    return out;
  }
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let dy = 0; dy < 2; dy++) {
        const y = 2 * cy + dy;
        if (y >= height) break;
        for (let dx = 0; dx < 2; dx++) {
          const x = 2 * cx + dx;
          if (x >= width) break;
          const p = (y * width + x) * 4, a = rgba[p + 3];
          let r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
          if (a !== 255) { r = (r * a + 127) / 255 | 0; g = (g * a + 127) / 255 | 0; b = (b * a + 127) / 255 | 0; }
          out[y * width + x] = (yr * r + yg * g + yb * b + Y0) >> 16;
          sr += r; sg += g; sb += b; n++;
        }
      }
      // The block's mean (n pixels, 4 inside the frame) through the chroma rows.
      out[uAt + cy * cw + cx] = ((ur * sr + ug * sg + ub * sb) / n + C0) >> 16;
      out[vAt + cy * cw + cx] = ((vr * sr + vg * sg + vb * sb) / n + C0) >> 16;
    }
  }
  return out;
}

function opaque(rgba, end) {
  for (let i = 3; i < end; i += 4) if (rgba[i] !== 255) return false;
  return true;
}

// What Dota shows for a YUV triple (BT.601, limited range), clamped to 0…255: for tests and checks.
export function dotaRGB(y, u, v) {
  const c = 255 / 219 * (y - 16), d = 255 / 224 * (u - 128), e = 255 / 224 * (v - 128);
  const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
  return [clamp(c + 1.402 * e), clamp(c - 0.344136 * d - 0.714136 * e), clamp(c + 1.772 * d)];
}
