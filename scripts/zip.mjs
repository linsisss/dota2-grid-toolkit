import { crc32 } from './vpk.mjs';

// A ZIP archive built in the browser (or Node): entries are deflated with the platform's
// CompressionStream when there is one and it helps, stored otherwise. UTF-8 names.
async function deflate(data) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch { return null; }
}
// entries: [{ name: 'fonts/radiance-regular.otf', data: Uint8Array | string }]
export async function buildZip(entries, { date = new Date() } = {}) {
  const encoder = new TextEncoder(), local = [], central = [];
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  let offset = 0;
  for (const entry of entries) {
    const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data, name = encoder.encode(entry.name);
    const packed = await deflate(data), deflated = packed && packed.length < data.length;
    const body = deflated ? packed : data, crc = crc32(data);
    const header = new Uint8Array(30 + name.length), view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true);
    view.setUint16(8, deflated ? 8 : 0, true); view.setUint16(10, time, true); view.setUint16(12, day, true);
    view.setUint32(14, crc, true); view.setUint32(18, body.length, true); view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true); header.set(name, 30);
    const record = new Uint8Array(46 + name.length), cview = new DataView(record.buffer);
    cview.setUint32(0, 0x02014b50, true); cview.setUint16(4, 20, true); cview.setUint16(6, 20, true); cview.setUint16(8, 0x0800, true);
    cview.setUint16(10, deflated ? 8 : 0, true); cview.setUint16(12, time, true); cview.setUint16(14, day, true);
    cview.setUint32(16, crc, true); cview.setUint32(20, body.length, true); cview.setUint32(24, data.length, true);
    cview.setUint16(28, name.length, true); cview.setUint32(42, offset, true); record.set(name, 46);
    local.push(header, body); central.push(record); offset += header.length + body.length;
  }
  const size = central.reduce((sum, part) => sum + part.length, 0), end = new Uint8Array(22), eview = new DataView(end.buffer);
  eview.setUint32(0, 0x06054b50, true); eview.setUint16(8, entries.length, true); eview.setUint16(10, entries.length, true);
  eview.setUint32(12, size, true); eview.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], { type: 'application/zip' });
}

// The entries of a ZIP read in the browser (or Node): [{ name, data }], stored or deflated (the
// platform's DecompressionStream); `want(name)` picks which to unpack, `limit` caps the unpacked bytes.
// Folders and other methods are skipped. Used for the d2pfx cursor packs (src/customize/d2pfx.js).
async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function readZip(bytes, { want = () => true, limit = 64_000_000 } = {}) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), decoder = new TextDecoder();
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65_557); at--) if (view.getUint32(at, true) === 0x06054b50) { end = at; break; }
  if (end < 0) throw new Error('not a zip');
  const count = view.getUint16(end + 10, true), entries = [];
  let at = view.getUint32(end + 16, true), total = 0;
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('bad zip');
    const method = view.getUint16(at + 10, true), packed = view.getUint32(at + 20, true), size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true), local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extra + comment;
    if (name.endsWith('/') || ![0, 8].includes(method) || !want(name)) continue;
    if ((total += size) > limit) throw new Error('zip too big');
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error('bad zip');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true), raw = bytes.subarray(start, start + packed);
    const data = method === 8 ? await inflate(raw) : raw.slice();
    if (data.length !== size) throw new Error('bad zip');
    entries.push({ name, data });
  }
  return entries;
}
