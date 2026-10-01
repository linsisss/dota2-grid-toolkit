// Valve pack files (VPK v1/v2) and compiled Panorama resources, written without Valve's tools.
// Only what a menu-background pack needs: one _dir.vpk with the data after the tree, and
// Panorama layouts/styles in the classic compiled format (a REDI block plus the source text in
// DATA), the format resourcecompiler wrote before layouts were precompiled. The game still loads
// it: custom games compiled that way years ago keep working. Both writers are checked byte for
// byte against Valve's files (tests/vpk.test.cjs).
//   VPK: https://developer.valvesoftware.com/wiki/VPK_(file_format)
//   Resources: https://github.com/ValveResourceFormat/ValveResourceFormat (Resource, ResourceEditInfo, Panorama)

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const text = (value) => new TextEncoder().encode(value);
export function concat(parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

// files: [{ path: 'panorama/layout/x.vxml_c', data: Uint8Array }]; md5(Uint8Array) → Uint8Array(16) for v2.
export function buildVPK(files, { version = 2, md5 = null } = {}) {
  if (version === 2 && !md5) throw new Error('VPK v2 needs an MD5 function.');
  const tree = new Map(); // extension → directory → entries, the order the tree is written in
  for (const file of files) {
    const path = file.path.replace(/\\/g, '/').toLowerCase();
    if (!/^[a-z0-9_./-]+$/.test(path) || path.startsWith('/') || path.includes('..')) throw new Error(`Недопустимый путь в VPK: ${file.path}`);
    const slash = path.lastIndexOf('/'), dir = slash < 0 ? ' ' : path.slice(0, slash);
    const base = path.slice(slash + 1), dot = base.lastIndexOf('.');
    const ext = dot < 0 ? ' ' : base.slice(dot + 1), name = dot < 0 ? base : base.slice(0, dot);
    if (!tree.has(ext)) tree.set(ext, new Map());
    const dirs = tree.get(ext);
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir).push({ name, data: file.data });
  }
  const parts = [], data = [];
  const string = (value) => parts.push(text(value), new Uint8Array([0]));
  let offset = 0;
  for (const [ext, dirs] of tree) {
    string(ext);
    for (const [dir, entries] of dirs) {
      string(dir);
      for (const entry of entries) {
        string(entry.name);
        const record = new Uint8Array(18), view = new DataView(record.buffer);
        view.setUint32(0, crc32(entry.data), true);
        view.setUint16(4, 0, true);            // preload bytes
        view.setUint16(6, 0x7fff, true);       // archive index: the data follows the tree in this file
        view.setUint32(8, offset, true);
        view.setUint32(12, entry.data.length, true);
        view.setUint16(16, 0xffff, true);
        parts.push(record); data.push(entry.data); offset += entry.data.length;
      }
      parts.push(new Uint8Array([0]));
    }
    parts.push(new Uint8Array([0]));
  }
  parts.push(new Uint8Array([0]));
  const treeBytes = concat(parts), dataBytes = concat(data);
  const header = new Uint8Array(version === 2 ? 28 : 12), view = new DataView(header.buffer);
  view.setUint32(0, 0x55aa1234, true);
  view.setUint32(4, version, true);
  view.setUint32(8, treeBytes.length, true);
  if (version !== 2) return concat([header, treeBytes, dataBytes]);
  view.setUint32(12, dataBytes.length, true);
  view.setUint32(16, 0, true);   // archive MD5 section: no numbered archives
  view.setUint32(20, 48, true);  // other MD5 section: tree, archive section, whole file
  view.setUint32(24, 0, true);   // unsigned
  const treeMD5 = md5(treeBytes), archiveMD5 = md5(new Uint8Array(0));
  return concat([header, treeBytes, dataBytes, treeMD5, archiveMD5, md5(concat([header, treeBytes, dataBytes, treeMD5, archiveMD5]))]);
}

// The directory listing of a VPK (for tests and checks): [{ path, crc, offset, length }].
export function readVPK(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x55aa1234) throw new Error('Это не VPK.');
  const version = view.getUint32(4, true), treeSize = view.getUint32(8, true), start = version === 2 ? 28 : 12;
  let at = start;
  const string = () => { const end = bytes.indexOf(0, at); const value = new TextDecoder().decode(bytes.subarray(at, end)); at = end + 1; return value; };
  const files = [];
  for (let ext; (ext = string());) for (let dir; (dir = string());) for (let name; (name = string());) {
    const crc = view.getUint32(at, true), preload = view.getUint16(at + 4, true), offset = view.getUint32(at + 8, true), length = view.getUint32(at + 12, true);
    at += 18 + preload;
    const path = `${dir === ' ' ? '' : dir + '/'}${name}${ext === ' ' ? '' : '.' + ext}`;
    const data = bytes.subarray(start + treeSize + offset, start + treeSize + offset + length);
    files.push({ path, crc, offset, length, data });
  }
  return { version, files };
}

// Panorama resources. kind: layout (.xml → .vxml_c), style (.css → .vcss_c), script (.js → .vjs_c),
// vector (.svg → .vsvg_c: Panorama's vector images, the same text-in-DATA resource, version 2).
const PANORAMA = {
  layout: { compiled: 'vxml', source: 'xml', compiler: 'Panorama Layout Compiler Version' },
  style: { compiled: 'vcss', source: 'css', compiler: 'Panorama Style Compiler Version' },
  script: { compiled: 'vjs', source: 'js', compiler: 'Panorama Script Compiler Version' },
  vector: { compiled: 'vsvg', source: 'svg', compiler: 'Vector Graphic Version', compile: 'CompileVectorGraphic', compilerVersion: 2, resourceVersion: 2, sourceFirst: true }
};
// The edit-info block: ten lists of records, each list followed by its own strings (not shared
// between records); string fields hold offsets relative to the field. `order` is the order the
// record's strings are stored in, as resourcecompiler does it.
function editInfo({ path, kind, sourceCRC, searchPath }) {
  const type = PANORAMA[kind], stem = path.replace(/\.[^.\/]+$/, '');
  const lists = [
    // Input dependencies: the compiled name (optional, absent) and the source file (vector images
    // list the source first).
    { records: ((inputs) => (type.sourceFirst ? inputs.reverse() : inputs))([[`${stem}.${type.compiled}`, searchPath, 0, 1], [`${stem}.${type.source}`, searchPath, sourceCRC, 2]]), order: [0, 1] },
    { records: [] },
    { records: [['___OverrideInputData___', 'BinaryBlobArg', 0, 0]], order: [0, 1] }, // argument dependencies
    { records: [[type.compiler, type.compile ?? 'CompilePanorama', type.compilerVersion ?? 1, 0]], order: [1, 0] }, // special dependencies
    { records: [] }, { records: [] }, { records: [] },
    { records: [['IsChildResource', 0]], order: [0] },                                 // searchable user data (int)
    { records: [] }, { records: [] }
  ];
  const chunks = [];
  let size = lists.length * 8;
  const head = new DataView(new ArrayBuffer(size));
  chunks.push(new Uint8Array(head.buffer));
  lists.forEach(({ records, order }, index) => {
    if (!records.length) return;
    // Lists start on 4 bytes; the searchable user data (list 7) on 8 (seen in a vsvg_c of Valve's).
    size = index === 7 ? (size + 7) & ~7 : (size + 3) & ~3;
    const start = size, width = records[0].length * 4, recordBytes = new Uint8Array(records.length * width), view = new DataView(recordBytes.buffer);
    head.setUint32(index * 8, start - index * 8, true);
    head.setUint32(index * 8 + 4, records.length, true);
    let at = start + recordBytes.length;
    const strings = [];
    records.forEach((record, row) => {
      record.forEach((field, column) => { if (typeof field !== 'string') view.setUint32(row * width + column * 4, field >>> 0, true); });
      for (const column of order) {
        const bytes = text(record[column]), fieldAt = start + row * width + column * 4;
        view.setUint32(row * width + column * 4, at - fieldAt, true);
        strings.push(bytes, new Uint8Array([0])); at += bytes.length + 1;
      }
    });
    chunks.push(new Uint8Array(start - chunks.reduce((sum, chunk) => sum + chunk.length, 0)), recordBytes, ...strings);
    size = at;
  });
  return concat(chunks);
}
// path: the compiled file's path in the game (panorama/layout/x.vxml_c); source: its text.
export function panoramaResource(path, source, { searchPath = 'dota', sourceCRC } = {}) {
  const kind = { vxml_c: 'layout', vcss_c: 'style', vjs_c: 'script', vsvg_c: 'vector' }[path.split('.').pop()];
  if (!kind) throw new Error(`Не Panorama-ресурс: ${path}`);
  const body = typeof source === 'string' ? text(source) : source;
  const redi = editInfo({ path, kind, sourceCRC: sourceCRC ?? crc32(body), searchPath });
  const data = new Uint8Array(6 + body.length), dataView = new DataView(data.buffer);
  dataView.setUint32(0, crc32(body), true);
  dataView.setUint16(4, 0, true); // no image table
  data.set(body, 6);
  const align = (n) => (n + 15) & ~15;
  const rediAt = 16 + 2 * 12, dataAt = align(rediAt + redi.length);
  const out = new Uint8Array(dataAt + data.length), view = new DataView(out.buffer);
  view.setUint32(0, out.length, true);
  view.setUint16(4, 12, true);  // header version
  view.setUint16(6, PANORAMA[kind].resourceVersion ?? 3, true);   // resource version
  view.setUint32(8, 8, true);   // block table follows the header
  view.setUint32(12, 2, true);
  const block = (at, name, offset, size) => { out.set(text(name), at); view.setUint32(at + 4, offset - (at + 4), true); view.setUint32(at + 8, size, true); };
  block(16, 'REDI', rediAt, redi.length);
  block(28, 'DATA', dataAt, data.length);
  out.set(redi, rediAt);
  out.set(data, dataAt);
  return out;
}
// The source text back from a classic compiled resource (tests, and checking a pack).
export function panoramaSource(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), count = view.getUint32(12, true);
  for (let i = 0; i < count; i++) {
    const at = 16 + i * 12;
    if (new TextDecoder().decode(bytes.subarray(at, at + 4)) !== 'DATA') continue;
    const offset = at + 4 + view.getUint32(at + 4, true), size = view.getUint32(at + 8, true);
    if (view.getUint16(offset + 4, true)) throw new Error('Ресурс с таблицей картинок не поддерживается.');
    return new TextDecoder().decode(bytes.subarray(offset + 6, offset + size));
  }
  throw new Error('В ресурсе нет блока DATA.');
}
