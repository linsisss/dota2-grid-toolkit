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
