// HUD capture solver, step 1 — ingest (plan of 2026-10-16, pipeline[0]). The watcher's zip (or a folder)
// holds Steam's uncompressed PNG copies named <pack>_<n>.png (C1_0001.png, C2_0007.png, F-scale-85-110_0003.png
// …) and session.json. Only 8-bit RGB PNGs of the plan's screen size are taken; JPGs and anything else are
// refused with a reason. PNG and ZIP are read here in plain JavaScript (node:zlib only), so a frame's bytes
// are exactly the game's: no colour management, no premultiplication, no dependency that might add either.
// Images everywhere in the solver are { width, height, data } with data = RGB bytes, row-major.
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { crc32, deflateSync, inflateRawSync, inflateSync } from 'node:zlib';

// ---- Rectangles: [x0, y0, x1, y1], x1 and y1 exclusive (the plan's GEOMETRY convention) ----
export const rectW = (r) => r[2] - r[0];
export const rectH = (r) => r[3] - r[1];
export const rectArea = (r) => Math.max(0, rectW(r)) * Math.max(0, rectH(r));
export const rectEmpty = (r) => !r || r[2] <= r[0] || r[3] <= r[1];
export const rectIntersect = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
export const rectUnion = (a, b) => (rectEmpty(a) ? b : rectEmpty(b) ? a : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
export const rectGrow = (r, d) => [r[0] - d, r[1] - d, r[2] + d, r[3] + d];
export const rectClip = (r, width, height) => rectIntersect(r, [0, 0, width, height]);
export const rectContains = (r, x, y) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
export const rectRound = (r) => [Math.floor(r[0]), Math.floor(r[1]), Math.ceil(r[2]), Math.ceil(r[3])];

// ---- Images ----
export function makeImage(width, height, fill = 0) {
  const data = new Uint8Array(width * height * 3);
  if (fill) data.fill(fill);
  return { width, height, data };
}
// A copy of the rectangle (clipped to the image); its pixels outside the image stay 0.
export function crop(img, rect) {
  const r = rectRound(rect), w = rectW(r), h = rectH(r), out = new Uint8Array(Math.max(0, w) * Math.max(0, h) * 3);
  const c = rectClip(r, img.width, img.height);
  for (let y = c[1]; y < c[3]; y++) {
    const from = (y * img.width + c[0]) * 3;
    out.set(img.data.subarray(from, from + rectW(c) * 3), ((y - r[1]) * w + (c[0] - r[0])) * 3);
  }
  return { width: w, height: h, data: out, rect: r };
}
export function paste(img, part, x0, y0) {
  for (let y = 0; y < part.height; y++) {
    const ty = y + y0;
    if (ty < 0 || ty >= img.height) continue;
    const xs = Math.max(0, -x0), xe = Math.min(part.width, img.width - x0);
    if (xe <= xs) continue;
    img.data.set(part.data.subarray((y * part.width + xs) * 3, (y * part.width + xe) * 3), (ty * img.width + x0 + xs) * 3);
  }
  return img;
}
export const pixel = (img, x, y) => { const i = (y * img.width + x) * 3; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };

// ---- PNG ----
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export class FrameError extends Error {}
// 8-bit RGB (colour type 2) or RGBA (6, alpha dropped; info.alphaOpaque says whether it was all 255),
// grey (0) on request; no interlace. info.chunks lists ancillary chunks (sRGB, gAMA, iCCP would mean a
// colour-managed file — Steam's copies have none).
export function decodePNG(buf, { allowGrey = false } = {}) {
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new FrameError('not a PNG');
  let offset = 8, header = null;
  const idat = [], chunks = [];
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('latin1', offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (body.length !== length) throw new FrameError(`PNG: truncated ${type}`);
    if (type === 'IHDR') header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colour: body[9], interlace: body[12] };
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    else if (!chunks.includes(type)) chunks.push(type);
    offset += 12 + length;
  }
  if (!header) throw new FrameError('PNG: no IHDR');
  const { width, height, depth, colour, interlace } = header;
  const channels = { 0: 1, 2: 3, 6: 4 }[colour];
  if (depth !== 8) throw new FrameError(`PNG: ${depth}-bit, 8-bit wanted`);
  if (!channels || (colour === 0 && !allowGrey)) throw new FrameError(`PNG: colour type ${colour}, RGB wanted`);
  if (interlace) throw new FrameError('PNG: interlaced');
  const raw = inflateSync(Buffer.concat(idat)), stride = width * channels;
  if (raw.length < height * (stride + 1)) throw new FrameError('PNG: short image data');
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride, up = row - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[src + x], a = x >= channels ? px[row + x - channels] : 0, b = y ? px[up + x] : 0, c = x >= channels && y ? px[up + x - channels] : 0;
      let p;
      switch (filter) {
        case 0: p = v; break;
        case 1: p = v + a; break;
        case 2: p = v + b; break;
        case 3: p = v + ((a + b) >> 1); break;
        case 4: { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: throw new FrameError(`PNG: filter ${filter}`);
      }
      px[row + x] = p;
    }
  }
  const info = { colour, chunks, alphaOpaque: true };
  if (channels === 3) return { width, height, data: px, info };
  const data = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < width * height; i++, j += channels) {
    if (channels === 1) { data[i * 3] = data[i * 3 + 1] = data[i * 3 + 2] = px[j]; continue; }
    data[i * 3] = px[j]; data[i * 3 + 1] = px[j + 1]; data[i * 3 + 2] = px[j + 2];
    if (px[j + 3] !== 255) info.alphaOpaque = false;
  }
  return { width, height, data, info };
}
function chunk(type, body) {
  const head = Buffer.alloc(8), tail = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0); head.write(type, 4, 'latin1');
  tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), body])) >>> 0, 0);
  return Buffer.concat([head, body, tail]);
}
// RGB (3), RGBA (4) or grey (1) channels; each row gets the filter with the smallest sum of |bytes|.
export function encodePNG({ width, height, data }, { channels = 3, level = 6 } = {}) {
  const stride = width * channels, out = Buffer.alloc(height * (stride + 1)), cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    const row = y * stride, up = row - stride;
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const line = cand[f];
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const v = data[row + x], a = x >= channels ? data[row + x - channels] : 0, b = y ? data[up + x] : 0, c = x >= channels && y ? data[up + x - channels] : 0;
        let p = 0;
        if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
        else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        const d = (v - p) & 255;
        line[x] = d; sum += d < 128 ? d : 256 - d;
        if (sum >= bestSum) break;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    out[y * (stride + 1)] = best;
    // Recompute the chosen row fully (the loop above may have stopped early).
    const line = cand[best];
    for (let x = 0; x < stride; x++) {
      const v = data[row + x], a = x >= channels ? data[row + x - channels] : 0, b = y ? data[up + x] : 0, c = x >= channels && y ? data[up + x - channels] : 0;
      let p = 0;
      if (best === 1) p = a; else if (best === 2) p = b; else if (best === 3) p = (a + b) >> 1;
      else if (best === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[x] = (v - p) & 255;
    }
    line.copy(out, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = { 1: 0, 3: 2, 4: 6 }[channels]; ihdr[10] = ihdr[11] = ihdr[12] = 0;
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(out, { level })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- ZIP (read only; stored and deflated entries, zip64) ----
export function openZip(path) {
  const fd = openSync(path, 'r'), size = fstatSync(fd).size;
  const read = (pos, len) => { const b = Buffer.alloc(len); readSync(fd, b, 0, len, pos); return b; };
  const tailLen = Math.min(size, 65557), tail = read(size - tailLen, tailLen);
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) { closeSync(fd); throw new Error(`${basename(path)}: not a zip`); }
  let count = tail.readUInt16LE(eocd + 10), cdSize = tail.readUInt32LE(eocd + 12), cdOffset = tail.readUInt32LE(eocd + 16);
  const locator = eocd - 20;
  if (locator >= 0 && tail.readUInt32LE(locator) === 0x07064b50) {
    const z64 = read(Number(tail.readBigUInt64LE(locator + 8)), 56);
    if (z64.readUInt32LE(0) === 0x06064b50) { count = Number(z64.readBigUInt64LE(32)); cdSize = Number(z64.readBigUInt64LE(40)); cdOffset = Number(z64.readBigUInt64LE(48)); }
  }
  const cd = read(cdOffset, cdSize), entries = [];
  for (let p = 0, n = 0; n < count && p + 46 <= cd.length; n++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: bad central directory');
    const flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10), crc = cd.readUInt32LE(p + 16);
    let compSize = cd.readUInt32LE(p + 20), rawSize = cd.readUInt32LE(p + 24), local = cd.readUInt32LE(p + 42);
    const nameLen = cd.readUInt16LE(p + 28), extraLen = cd.readUInt16LE(p + 30), commentLen = cd.readUInt16LE(p + 32);
    const name = cd.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLen);
    for (let e = p + 46 + nameLen; e + 4 <= p + 46 + nameLen + extraLen;) {
      const id = cd.readUInt16LE(e), len = cd.readUInt16LE(e + 2);
      if (id === 1) {
        let q = e + 4;
        if (rawSize === 0xffffffff) { rawSize = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (compSize === 0xffffffff) { compSize = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (local === 0xffffffff) { local = Number(cd.readBigUInt64LE(q)); }
      }
      e += 4 + len;
    }
    if (!name.endsWith('/')) entries.push({ name: name.replace(/\\/g, '/'), method, crc, compSize, size: rawSize, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const readEntry = (entry) => {
    const head = read(entry.local, 30);
    if (head.readUInt32LE(0) !== 0x04034b50) throw new Error(`zip: ${entry.name}: bad local header`);
    const data = read(entry.local + 30 + head.readUInt16LE(26) + head.readUInt16LE(28), entry.compSize);
    const out = entry.method === 0 ? data : entry.method === 8 ? inflateRawSync(data) : null;
    if (!out) throw new Error(`zip: ${entry.name}: method ${entry.method}`);
    if ((crc32(out) >>> 0) !== entry.crc) throw new Error(`zip: ${entry.name}: CRC mismatch`);
    return out;
  };
  return { entries, read: readEntry, close: () => closeSync(fd) };
}

// ---- The capture: frames by pack, session.json, plan.json ----
const PACK_RE = /(?:^|\/)(C1|C2|F-bg|F-chat|S-\d+-\d+|F-scale-\d+-\d+)(?:[_/-](?:[^/]*?)?)?(\d+)?\.(png|jpe?g|bmp|tga|webp)$/i;
// Which pack a file belongs to, and its number in that pack (from the name).
export function framePack(name) {
  const m = PACK_RE.exec(name.replace(/\\/g, '/'));
  if (!m) return null;
  const digits = /(\d+)\.[a-z]+$/i.exec(name), id = m[1].replace(/^c/, 'C').replace(/^f-/i, 'F-');
  return { pack: id, seq: digits ? Number(digits[1]) : 0, ext: m[3].toLowerCase() };
}
// The owner's order: C1, the S packs (r2) in the plan's order, C2; the r1 fallbacks after their main pack.
const S_ORDER = ['S-70-70', 'S-80-80', 'S-90-90', 'S-85-110', 'S-95-120'];
const PACK_ORDER = (pack) => (pack === 'C1' ? 0 : pack === 'F-bg' ? 1 : S_ORDER.includes(pack) ? 2 + S_ORDER.indexOf(pack) / 10 : pack.startsWith('S-') || pack.startsWith('F-scale') ? 2.9 : pack === 'F-chat' ? 3 : pack === 'C2' ? 4 : 5);
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name), st = statSync(path);
    if (st.isDirectory()) out.push(...walk(path)); else out.push(path);
  }
  return out;
}
// Session.json as the watcher writes it, read leniently: { packs: [{ id, phases: [{ phase, first, last }],
// verdicts, fallbacks }], shots: [{ file, t }], colourBlindGap: { after, before } }. Unknown fields stay.
export function parseSession(text) {
  if (!text) return null;
  const raw = typeof text === 'string' ? JSON.parse(text.replace(/^﻿/, '')) : text;
  const shots = (raw.shots || raw.f12 || raw.frames || []).map((s) => (typeof s === 'string' ? { file: s } : s));
  const packs = (raw.packs || []).map((p) => ({ ...p, id: p.id || p.pack, phases: p.phases || [] }));
  return { ...raw, shots, packs, synthetic: raw.synthetic === true };
}
// Which phase (1 or 2) of a pack a frame is in, from session.json: by frame number ranges or by file names.
export function sessionPhase(session, frame) {
  const pack = session?.packs?.find((p) => p.id === frame.pack);
  for (const ph of pack?.phases || []) {
    const first = ph.first ?? ph.from ?? ph.start, last = ph.last ?? ph.to ?? ph.end;
    if (typeof first === 'number' && typeof last === 'number' && frame.seq >= first && frame.seq <= last) return ph.phase ?? ph.id ?? null;
    if (typeof first === 'string' && typeof last === 'string' && frame.name >= first && frame.name <= last) return ph.phase ?? ph.id ?? null;
  }
  return null;
}
// The capture from a zip or a folder: frames (sorted by pack, then number) with a read() for their bytes.
export function openCapture(input) {
  if (!existsSync(input)) throw new Error(`${input}: not found`);
  let files, readFile, close = () => {};
  if (statSync(input).isDirectory()) {
    files = walk(input).map((path) => ({ name: relative(input, path).split(sep).join('/'), size: statSync(path).size, read: () => readFileSync(path) }));
  } else {
    const zip = openZip(input);
    files = zip.entries.map((entry) => ({ name: entry.name, size: entry.size, read: () => zip.read(entry) }));
    close = zip.close;
  }
  readFile = (want) => files.find((f) => basename(f.name).toLowerCase() === want)?.read().toString('utf8') ?? null;
  const session = parseSession(readFile('session.json')), plan = readFile('plan.json'), frames = [], rejected = [];
  for (const file of files) {
    if (/(^|\/)(session|plan)\.json$/i.test(file.name) || /\/$/.test(file.name)) continue;
    const id = framePack(file.name);
    if (!id) { if (/\.(png|jpe?g)$/i.test(file.name)) rejected.push({ name: file.name, reason: 'не из пакета съёмки (имя не C1_…, C2_…, F-…)' }); continue; }
    if (id.ext !== 'png') { rejected.push({ name: file.name, reason: `${id.ext.toUpperCase()}: нужен несжатый PNG («Save an uncompressed copy»)` }); continue; }
    frames.push({ name: file.name, pack: id.pack, seq: id.seq, size: file.size, read: file.read });
  }
  frames.sort((a, b) => PACK_ORDER(a.pack) - PACK_ORDER(b.pack) || a.pack.localeCompare(b.pack) || a.seq - b.seq || a.name.localeCompare(b.name));
  // The watcher's record of each frame (format gs-hud-capture-session/1: frames[] with pack, phase, t, probe).
  const byFile = new Map((session?.frames || []).filter((s) => s && typeof s === 'object' && s.file).map((s) => [s.file.toLowerCase(), s]));
  frames.forEach((f, i) => {
    f.index = i;
    const rec = byFile.get(basename(f.name).toLowerCase());
    f.phase = rec?.phase ?? (session ? sessionPhase(session, f) : null);
    if (rec) { f.t = rec.t ?? null; f.probe = rec.probe || null; f.key = rec.key || ''; }
  });
  return { input, session, plan: plan ? JSON.parse(plan) : null, frames, rejected, close };
}
// A frame's image, checked: 8-bit RGB of the plan's size.
export function decodeFrame(bytes, { width, height }) {
  const img = decodePNG(bytes);
  if (img.width !== width || img.height !== height) throw new FrameError(`${img.width}×${img.height}, ${width}×${height} wanted`);
  if (img.info.colour === 6 && !img.info.alphaOpaque) throw new FrameError('PNG with transparency');
  return img;
}
// Frames by index through a small LRU cache (a 1080p frame is 6.2 MB as RGB).
export function frameLoader(frames, { width, height, cacheSize = 12, decode = decodeFrame } = {}) {
  const cache = new Map();
  let decoded = 0;
  const get = (frame) => {
    const key = frame.index;
    if (cache.has(key)) { const img = cache.get(key); cache.delete(key); cache.set(key, img); return img; }
    const img = frame.image || decode(frame.read(), { width, height });
    decoded++;
    cache.set(key, img);
    while (cache.size > cacheSize) cache.delete(cache.keys().next().value);
    return img;
  };
  return { get, stats: () => ({ decoded, cached: cache.size }), clear: () => cache.clear() };
}
