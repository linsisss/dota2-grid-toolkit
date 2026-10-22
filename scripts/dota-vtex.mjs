// Panorama pictures (`*_png.vtex_c`) written without Valve's tools, for the hero portraits
// (scripts/hero-portraits.mjs, 2026-10-22). A compiled texture is a Source 2 resource (header, REDI and
// DATA blocks) followed by the picture itself. Valve's own hero pictures use three of its formats, and
// these are the ones written here (checked against Valve's files and read back by Source 2 Viewer,
// tests/dota-vtex.test.cjs):
//   16 PNG_RGBA8888 — the picture is a PNG file, the game decodes it when it loads it (Valve's
//                     landscape pictures of 24 heroes and 25 portrait cards are this);
//   28 BGRA8888     — raw pixels, top row first (every hero icon, 32 × 32).
// DATA: version 1, flags, reflectivity (the mean of the picture's sRGB values, alpha too), width,
// height, depth 1, format, one mip, and one extra data entry, FALLBACK_BITS: the picture squeezed to
// 32 × 32 as DXT5 (1024 bytes), which Valve's files all carry.
//   https://github.com/ValveResourceFormat/ValveResourceFormat (Resource, Texture, VTexFormat, VTexExtraData)
import { concat, crc32, resourceEditInfo } from './vpk.mjs';

export const VTEX_FORMATS = Object.freeze({ DXT5: 2, PNG_RGBA8888: 16, PNG_DXT5: 18, BGRA8888: 28 });
export const VTEX_FLAGS = Object.freeze({ clampS: 0x1, clampT: 0x2, clampU: 0x4, noLod: 0x8, dilateColor: 0x80, ycocg: 0x100 });
const FALLBACK = 1, FALLBACK_SIDE = 32, HEADER = 52;
const text = (value) => new TextEncoder().encode(value);

// ——— PNG: 8-bit RGBA, no interlace; each row filtered the way that leaves it smallest by the usual
// rule (the least sum of absolute differences: a photo takes about a quarter less than unfiltered);
// zlib by the platform's CompressionStream (the browser's and Node's), so the same module runs on both.
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
function filterRows(rgba, width, height) {
  const stride = width * 4, raw = new Uint8Array((stride + 1) * height), row = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const line = rgba.subarray(y * stride, (y + 1) * stride), up = y ? rgba.subarray((y - 1) * stride, y * stride) : null;
    let best = null, bestSum = Infinity;
    for (let type = 0; type < 5; type++) {
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? line[i - 4] : 0, b = up ? up[i] : 0, c = up && i >= 4 ? up[i - 4] : 0;
        const value = (line[i] - [0, a, b, (a + b) >> 1, paeth(a, b, c)][type]) & 0xff;
        row[i] = value; sum += value < 128 ? value : 256 - value;
      }
      if (sum < bestSum) { bestSum = sum; best = [type, row.slice()]; }
    }
    raw[y * (stride + 1)] = best[0]; raw.set(best[1], y * (stride + 1) + 1);
  }
  return raw;
}
async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function chunk(type, body) {
  const out = new Uint8Array(12 + body.length), view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set(text(type), 4); out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}
export async function encodePNG(rgba, width, height) {
  const raw = filterRows(rgba, width, height);
  const head = new Uint8Array(13), view = new DataView(head.buffer);
  view.setUint32(0, width); view.setUint32(4, height);
  head.set([8, 6, 0, 0, 0], 8);
  return concat([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0))]);
}
// A PNG's size from its IHDR, or null for something that is not one ending with IEND.
export function pngSize(bytes) {
  const sign = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 45 || !sign.every((byte, i) => bytes[i] === byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return null;
  if (String.fromCharCode(...bytes.subarray(bytes.length - 8, bytes.length - 4)) !== 'IEND') return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

// ——— Pixels.
// RGBA of `width` × `height` resampled to `w` × `h` by area (each output pixel the mean of what it covers).
export function resample(rgba, width, height, w, h) {
  const out = new Uint8Array(w * h * 4), sx = width / w, sy = height / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = x * sx, x1 = x0 + sx, y0 = y * sy, y1 = y0 + sy, sum = [0, 0, 0, 0];
    let area = 0;
    for (let yy = Math.floor(y0); yy < Math.min(height, Math.ceil(y1)); yy++) {
      const fy = Math.min(y1, yy + 1) - Math.max(y0, yy);
      for (let xx = Math.floor(x0); xx < Math.min(width, Math.ceil(x1)); xx++) {
        const f = fy * (Math.min(x1, xx + 1) - Math.max(x0, xx)), at = (yy * width + xx) * 4;
        for (let k = 0; k < 4; k++) sum[k] += rgba[at + k] * f;
        area += f;
      }
    }
    for (let k = 0; k < 4; k++) out[(y * w + x) * 4 + k] = Math.round(sum[k] / (area || 1));
  }
  return out;
}
// The mean of the sRGB values (0–1), as resourcecompiler stores it in «Reflectivity».
export function reflectivity(rgba) {
  const sum = [0, 0, 0, 0], n = rgba.length / 4;
  for (let i = 0; i < rgba.length; i++) sum[i & 3] += rgba[i];
  return sum.map((value) => value / 255 / (n || 1));
}
// DXT5 (BC3): per 4 × 4 block, alpha by its two extremes and eight steps, colour by its box's corners
// (inset a little) and four steps. Width and height are multiples of 4.
const to565 = (r, g, b) => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
const from565 = (c) => [((c >> 11) & 31) * 255 / 31, ((c >> 5) & 63) * 255 / 63, (c & 31) * 255 / 31];
export function encodeDXT5(rgba, width, height) {
  const out = new Uint8Array((width / 4) * (height / 4) * 16);
  let at = 0;
  for (let by = 0; by < height; by += 4) for (let bx = 0; bx < width; bx += 4) {
    const px = [];
    for (let p = 0; p < 16; p++) { const i = ((by + (p >> 2)) * width + bx + (p & 3)) * 4; px.push([rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]); }
    // Alpha.
    const alphas = px.map((p) => p[3]), a0 = Math.max(...alphas), a1 = Math.min(...alphas);
    out[at] = a0; out[at + 1] = a1;
    if (a0 > a1) {
      const levels = [a0, a1, ...[1, 2, 3, 4, 5, 6].map((k) => ((7 - k) * a0 + k * a1) / 7)];
      let bits = 0n;
      alphas.forEach((a, p) => {
        let best = 0;
        for (let k = 1; k < 8; k++) if (Math.abs(levels[k] - a) < Math.abs(levels[best] - a)) best = k;
        bits |= BigInt(best) << BigInt(3 * p);
      });
      for (let k = 0; k < 6; k++) out[at + 2 + k] = Number((bits >> BigInt(8 * k)) & 0xffn);
    }
    // Colour: the ends along the block's main axis (power iteration on the covariance, as stb_dxt does),
    // inset by a sixteenth.
    const mean = [0, 1, 2].map((k) => px.reduce((sum, p) => sum + p[k], 0) / 16), cov = [0, 0, 0, 0, 0, 0];
    for (const p of px) { const r = p[0] - mean[0], g = p[1] - mean[1], b = p[2] - mean[2]; cov[0] += r * r; cov[1] += r * g; cov[2] += r * b; cov[3] += g * g; cov[4] += g * b; cov[5] += b * b; }
    // Starting from the covariance's column of the widest channel (a start of (1, 1, 1) is lost on
    // colours that cancel out, like red and blue).
    const rows = [[cov[0], cov[1], cov[2]], [cov[1], cov[3], cov[4]], [cov[2], cov[4], cov[5]]];
    let axis = rows[[cov[0], cov[3], cov[5]].indexOf(Math.max(cov[0], cov[3], cov[5]))];
    if (Math.hypot(...axis) < 1e-6) axis = [1, 1, 1];
    for (let i = 0; i < 6; i++) {
      const next = [cov[0] * axis[0] + cov[1] * axis[1] + cov[2] * axis[2], cov[1] * axis[0] + cov[3] * axis[1] + cov[4] * axis[2], cov[2] * axis[0] + cov[4] * axis[1] + cov[5] * axis[2]];
      const length = Math.hypot(...next);
      if (length < 1e-6) break;
      axis = next.map((v) => v / length);
    }
    const dot = (p) => p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2];
    let low = px[0], high = px[0];
    for (const p of px) { if (dot(p) < dot(low)) low = p; if (dot(p) > dot(high)) high = p; }
    const inset = (k) => (high[k] - low[k]) / 16;
    let c0 = to565(...[0, 1, 2].map((k) => Math.min(255, Math.max(0, Math.round(high[k] - inset(k)))))), c1 = to565(...[0, 1, 2].map((k) => Math.min(255, Math.max(0, Math.round(low[k] + inset(k))))));
    if (c0 < c1) [c0, c1] = [c1, c0];
    const p0 = from565(c0), p1 = from565(c1), palette = [p0, p1, p0.map((v, k) => (2 * v + p1[k]) / 3), p0.map((v, k) => (v + 2 * p1[k]) / 3)];
    let indices = 0;
    px.forEach((p, i) => {
      let best = 0, bestError = Infinity;
      palette.forEach((c, k) => { const e = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (e < bestError) { bestError = e; best = k; } });
      if (c0 === c1) best = 0;
      indices |= best << (2 * i);
    });
    const view = new DataView(out.buffer, at + 8, 8);
    view.setUint16(0, c0, true); view.setUint16(2, c1, true); view.setUint32(4, indices >>> 0, true);
    at += 16;
  }
  return out;
}
export function decodeDXT5(data, width, height) {
  const out = new Uint8Array(width * height * 4), view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let at = 0;
  for (let by = 0; by < height; by += 4) for (let bx = 0; bx < width; bx += 4) {
    const a0 = data[at], a1 = data[at + 1];
    const levels = a0 > a1 ? [a0, a1, ...[1, 2, 3, 4, 5, 6].map((k) => ((7 - k) * a0 + k * a1) / 7)] : [a0, a1, ...[1, 2, 3, 4].map((k) => ((5 - k) * a0 + k * a1) / 5), 0, 255];
    let bits = 0n;
    for (let k = 0; k < 6; k++) bits |= BigInt(data[at + 2 + k]) << BigInt(8 * k);
    const c0 = view.getUint16(at + 8, true), c1 = view.getUint16(at + 10, true), indices = view.getUint32(at + 12, true);
    const p0 = from565(c0), p1 = from565(c1), palette = [p0, p1, p0.map((v, k) => (2 * v + p1[k]) / 3), p0.map((v, k) => (v + 2 * p1[k]) / 3)];
    for (let p = 0; p < 16; p++) {
      const i = ((by + (p >> 2)) * width + bx + (p & 3)) * 4, c = palette[(indices >>> (2 * p)) & 3];
      out[i] = Math.round(c[0]); out[i + 1] = Math.round(c[1]); out[i + 2] = Math.round(c[2]);
      out[i + 3] = Math.round(levels[Number((bits >> BigInt(3 * p)) & 7n)]);
    }
    at += 16;
  }
  return out;
}

// ——— The resource.
// The edit info as Valve's panorama pictures have it: the source PNG (and its optional .txt), the
// compiler's version, «IsChildResource» (the pictures are compiled as children of the layouts).
function textureEditInfo(path, sourceCRC) {
  const stem = path.replace(/_png\.vtex_c$/, '').replace(/\.vtex_c$/, '');
  return resourceEditInfo([
    { records: [] },
    { records: [[`${stem}.png`, 'dota', sourceCRC, 2], [`${stem}.txt`, 'dota', 0, 1]], order: [0, 1] },
    { records: [['___OverrideInputData___', 'BinaryBlobArg', 0, 0]], order: [0, 1] },
    { records: [['Texture Compiler Version', 'CompileTexture', 11, 0]], order: [1, 0] },
    { records: [] }, { records: [] }, { records: [] },
    { records: [['IsChildResource', 1]], order: [0] },
    { records: [] }, { records: [] }
  ]);
}
// path: the game path (panorama/images/…_png.vtex_c); rgba: the picture, `width` × `height`; format
// 'png' (PNG_RGBA8888) or 'bgra' (BGRA8888); flags: VTEX_FLAGS, as Valve's file at that place has them.
export async function vtexResource({ path, rgba, width, height, format = 'png', flags = VTEX_FLAGS.noLod }) {
  if (!/^[a-z0-9_./-]+\.vtex_c$/.test(path)) throw new Error(`Не текстура: ${path}`);
  if (!(width > 0 && height > 0 && width <= 4096 && height <= 4096) || rgba.length !== width * height * 4) throw new Error('Неверный размер картинки.');
  let payload;
  if (format === 'png') payload = await encodePNG(rgba, width, height);
  else if (format === 'bgra') { payload = new Uint8Array(rgba.length); for (let i = 0; i < rgba.length; i += 4) payload.set([rgba[i + 2], rgba[i + 1], rgba[i], rgba[i + 3]], i); }
  else throw new Error(`Неизвестный формат: ${format}`);
  const fallback = encodeDXT5(resample(rgba, width, height, FALLBACK_SIDE, FALLBACK_SIDE), FALLBACK_SIDE, FALLBACK_SIDE);
  const data = new Uint8Array(HEADER + fallback.length), view = new DataView(data.buffer);
  view.setUint16(0, 1, true);                    // VTEX version
  view.setUint16(2, flags, true);
  reflectivity(rgba).forEach((value, k) => view.setFloat32(4 + 4 * k, value, true));
  view.setUint16(20, width, true); view.setUint16(22, height, true); view.setUint16(24, 1, true);
  data[26] = format === 'png' ? VTEX_FORMATS.PNG_RGBA8888 : VTEX_FORMATS.BGRA8888;
  data[27] = 1;                                  // mip levels
  view.setUint32(28, 0, true);                   // picmip0 resolution
  view.setUint32(32, 8, true);                   // extra data: right after this field and the next
  view.setUint32(36, 1, true);
  view.setUint32(40, FALLBACK, true);
  view.setUint32(44, 8, true);                   // its bytes: after this field and the size
  view.setUint32(48, fallback.length, true);
  data.set(fallback, HEADER);
  const redi = textureEditInfo(path, crc32(payload));
  const align = (n) => (n + 15) & ~15, rediAt = 16 + 2 * 12, dataAt = align(rediAt + redi.length), size = dataAt + data.length;
  const out = new Uint8Array(size + payload.length), head = new DataView(out.buffer);
  head.setUint32(0, size, true);                 // the resource; the picture follows it
  head.setUint16(4, 12, true);                   // header version
  head.setUint16(6, 1, true);                    // resource version (Texture 1)
  head.setUint32(8, 8, true);
  head.setUint32(12, 2, true);
  const block = (at, name, offset, length) => { out.set(text(name), at); head.setUint32(at + 4, offset - (at + 4), true); head.setUint32(at + 8, length, true); };
  block(16, 'REDI', rediAt, redi.length);
  block(28, 'DATA', dataAt, data.length);
  out.set(redi, rediAt); out.set(data, dataAt); out.set(payload, size);
  return out;
}

// A compiled texture read back (tests, and the server's check of a pack): its blocks, the DATA fields,
// the extra data and the picture after the resource. Throws on anything that is not one.
export function readVtex(bytes) {
  const bad = (why) => { throw new Error(`Не текстура: ${why}`); };
  if (!(bytes instanceof Uint8Array) || bytes.length < 40) bad('мало данных');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = view.getUint32(0, true), headerVersion = view.getUint16(4, true), version = view.getUint16(6, true), tableAt = 8 + view.getUint32(8, true), count = view.getUint32(12, true);
  if (headerVersion !== 12 || size > bytes.length || count < 1 || count > 4 || tableAt + count * 12 > size) bad('заголовок');
  const blocks = {};
  for (let i = 0; i < count; i++) {
    const at = tableAt + i * 12, name = String.fromCharCode(...bytes.subarray(at, at + 4)), offset = at + 4 + view.getUint32(at + 4, true), length = view.getUint32(at + 8, true);
    if (!/^[A-Z0-9]{4}$/.test(name) || offset + length > size || blocks[name]) bad('блоки');
    blocks[name] = { offset, length };
  }
  const d = blocks.DATA;
  if (!d || d.length < 40) bad('нет DATA');
  const o = d.offset, extraAt = o + 32 + view.getUint32(o + 32, true), extraCount = view.getUint32(o + 36, true);
  if (extraCount > 8 || extraAt + extraCount * 12 > o + d.length) bad('доп. данные');
  const extra = [];
  for (let k = 0; k < extraCount; k++) {
    const e = extraAt + k * 12, type = view.getUint32(e, true), at = e + 4 + view.getUint32(e + 4, true), length = view.getUint32(e + 8, true);
    if (at + length > o + d.length) bad('доп. данные');
    extra.push({ type, data: bytes.subarray(at, at + length) });
  }
  return {
    version, blocks: Object.keys(blocks), size,
    vtexVersion: view.getUint16(o, true), flags: view.getUint16(o + 2, true), reflectivity: [0, 1, 2, 3].map((k) => view.getFloat32(o + 4 + 4 * k, true)),
    width: view.getUint16(o + 20, true), height: view.getUint16(o + 22, true), depth: view.getUint16(o + 24, true), format: bytes[o + 26], mips: bytes[o + 27],
    extra, payload: bytes.subarray(size)
  };
}
