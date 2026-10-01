// Fonts for Dota 2's Panorama UI. The game draws text with fontconfig 2.11 and FreeType 2.5 from
// loose files in game/dota/panorama/fonts/: the families Radiance (almost all text, including
// hero-grid category names), Reaver (titles and the top menu) and RadianceM (digits). A font
// replaces one of them when it is saved under Valve's file name with Valve's family name inside:
// the pack overwrites those files and nothing else, and «Verify integrity» restores the originals.
// Static TrueType/CFF only: that FreeType predates WOFF2 and fontconfig variable instances.
import { t } from './i18n.mjs';

export const DOTA_FAMILIES = {
  Radiance: { prefix: 'radiance', role: 'text' },
  RadianceM: { prefix: 'radiancem', role: 'numbers' },
  Reaver: { prefix: 'reaver', role: 'titles' }
};
// Valve's files and the identity inside each (name IDs 1, 2, 4, 6, 16, 17 and the weight class),
// read from the game's panorama/fonts. A replacement carries the same identity, so fontconfig
// picks it exactly where it picked Valve's face.
const VALVE_FACES = {
  'radiance-black': ['Radiance Black', 'Regular', 'Radiance Black', 'Radiance-Black', 'Radiance', 'Black', 900],
  'radiance-blackitalic': ['Radiance Black', 'Italic', 'Radiance Black Italic', 'Radiance-BlackItalic', 'Radiance', 'Black Italic', 900],
  'radiance-bold': ['Radiance', 'Bold', 'Radiance Bold', 'Radiance-Bold', null, null, 700],
  'radiance-bolditalic': ['Radiance', 'Bold Italic', 'Radiance Bold Italic', 'Radiance-BoldItalic', null, null, 700],
  'radiance-light': ['Radiance', 'Regular', 'Radiance Light', 'Radiance-Light', null, 'Light', 300],
  'radiance-lightitalic': ['Radiance', 'Italic', 'Radiance Light Italic', 'Radiance-LightItalic', null, 'Light Italic', 300],
  'radiance-regular': ['Radiance', 'Regular', 'Radiance Regular', 'Radiance-Regular', null, null, 400],
  'radiance-regularitalic': ['Radiance', 'Italic', 'Radiance Regular Italic', 'Radiance-RegularItalic', null, 'Regular Italic', 400],
  'radiance-semibold': ['Radiance Semibold', 'Regular', 'Radiance Semibold', 'Radiance-Semibold', 'Radiance', 'Semibold', 600],
  'radiance-semibolditalic': ['Radiance Semibold', 'Italic', 'Radiance Semibold Italic', 'Radiance-SemiboldItalic', 'Radiance', 'Semibold Italic', 600],
  'radiance-ultralight': ['Radiance UltraLight', 'Regular', 'Radiance UltraLight', 'Radiance-UltraLight', 'Radiance', 'UltraLight', 200],
  'radiance-ultralightitalic': ['Radiance', 'Italic', 'Radiance UltraLight Italic', 'Radiance-UltraLightItalic', null, 'UltraLight Italic', 200],
  'radiancem-black': ['RadianceM Black', 'Regular', 'RadianceM Black', 'RadianceM-Black', 'RadianceM', 'Black', 900],
  'radiancem-blackitalic': ['RadianceM Black', 'Italic', 'RadianceM Black Italic', 'RadianceM-BlackItalic', 'RadianceM', 'Black Italic', 900],
  'radiancem-bold': ['RadianceM', 'Bold', 'RadianceM Bold', 'RadianceM-Bold', null, null, 700],
  'radiancem-bolditalic': ['RadianceM', 'Bold Italic', 'RadianceM Bold Italic', 'RadianceM-BoldItalic', null, null, 700],
  'radiancem-italic': ['RadianceM', 'Italic', 'RadianceM Italic', 'RadianceM-Italic', 'RadianceM', 'Italic', 400],
  'radiancem-light': ['RadianceM', 'Regular', 'RadianceM Light', 'RadianceM-Light', 'RadianceM', 'Light', 300],
  'radiancem-lightitalic': ['RadianceM', 'Italic', 'RadianceM Light Italic', 'RadianceM-LightItalic', 'RadianceM', 'Light Italic', 300],
  'radiancem-regular': ['RadianceM', 'Regular', 'RadianceM Regular', 'RadianceM-Regular', null, null, 400],
  'radiancem-regularitalic': ['RadianceM', 'Italic', 'RadianceM Regular Italic', 'RadianceM-RegularItalic', null, 'Regular Italic', 400],
  'radiancem-semibold': ['RadianceM Semibold', 'Regular', 'RadianceM Semibold', 'RadianceM-Semibold', 'RadianceM', 'Semibold', 600],
  'radiancem-semibolditalic': ['RadianceM Semibold', 'Italic', 'RadianceM Semibold Italic', 'RadianceM-SemiboldItalic', 'RadianceM', 'Semibold Italic', 600],
  'radiancem-ultralight': ['RadianceM UltraLight', 'Regular', 'RadianceM UltraLight', 'RadianceM-UltraLight', 'RadianceM', 'UltraLight', 250],
  'reaver-black': ['Reaver Black', 'Regular', 'Reaver Black', 'Reaver-Black', 'Reaver', 'Black', 900],
  'reaver-bold': ['Reaver', 'Bold', 'Reaver Bold', 'Reaver-Bold', null, null, 700],
  'reaver-light': ['Reaver Light', 'Regular', 'Reaver Light', 'Reaver-Light', 'Reaver', 'Light', 300],
  'reaver-regular': ['Reaver', 'Regular', 'Reaver Regular', 'Reaver-Regular', null, null, 400],
  'reaver-semibold': ['Reaver SemiBold', 'Regular', 'Reaver SemiBold', 'Reaver-SemiBold', 'Reaver', 'SemiBold', 600]
};
export const DOTA_FONT_FILES = Object.keys(VALVE_FACES).map((name) => `${name}.otf`);

const u16 = (view, at) => view.getUint16(at), u32 = (view, at) => view.getUint32(at);
const tag = (bytes, at) => String.fromCharCode(...bytes.subarray(at, at + 4));

export function readFont(input) {
  // A plain view even for a Node Buffer, whose slice() does not copy.
  const bytes = ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = (message) => { throw Object.assign(new Error(message), { code: 'font' }); };
  if (bytes.length < 12) fail(t('Файл слишком маленький для шрифта.'));
  const signature = tag(bytes, 0);
  if (signature === 'wOFF' || signature === 'wOF2') fail(t('Это веб-шрифт (WOFF). Нужен файл .ttf или .otf.'));
  if (signature === 'ttcf') fail(t('Это коллекция шрифтов (.ttc). Нужен один шрифт .ttf или .otf.'));
  const version = u32(view, 0);
  if (version !== 0x00010000 && signature !== 'OTTO' && signature !== 'true') fail(t('Это не шрифт TrueType или OpenType.'));
  const count = u16(view, 4), tables = {};
  if (12 + count * 16 > bytes.length) fail(t('Шрифт повреждён.'));
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16, offset = u32(view, at + 8), length = u32(view, at + 12);
    if (offset + length > bytes.length) fail(t('Шрифт повреждён.'));
    tables[tag(bytes, at)] = bytes.subarray(offset, offset + length);
  }
  for (const need of ['head', 'name', 'cmap', 'OS/2', 'hhea', 'hmtx', 'maxp']) if (!tables[need]) fail(t('В шрифте нет таблицы {table}.', { table: need }));
  if (tables.fvar) fail(t('Это вариативный шрифт. Dota понимает только статичные: скачай отдельные начертания (Regular, Bold…).'));
  const tableView = (name) => new DataView(tables[name].buffer, tables[name].byteOffset, tables[name].byteLength);
  const os2 = tableView('OS/2');
  return {
    bytes, signature, tables,
    names: readNames(tables.name),
    weight: u16(os2, 4), italic: !!(u16(os2, 62) & 1), fsType: u16(os2, 8),
    covers: cmapCoverage(tables.cmap)
  };
}

function readNames(table) {
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength), count = u16(view, 2), storage = u16(view, 4), names = {};
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12, platform = u16(view, at), encoding = u16(view, at + 2), language = u16(view, at + 4), id = u16(view, at + 6);
    const length = u16(view, at + 8), offset = u16(view, at + 10), raw = table.subarray(storage + offset, storage + offset + length);
    let value;
    if (platform === 3 || platform === 0) { value = ''; for (let j = 0; j + 1 < raw.length; j += 2) value += String.fromCharCode((raw[j] << 8) | raw[j + 1]); }
    else if (platform === 1 && encoding === 0) value = String.fromCharCode(...raw);
    else continue;
    const english = platform === 3 ? language === 0x409 : platform === 1 ? language === 0 : true;
    if (!(id in names) || english) names[id] = value;
  }
  return names;
}

// A function telling whether the font maps a code point (cmap formats 4 and 12).
function cmapCoverage(table) {
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength), count = u16(view, 2), ranges = [];
  let best = null;
  for (let i = 0; i < count; i++) {
    const platform = u16(view, 4 + i * 8), encoding = u16(view, 6 + i * 8), offset = u32(view, 8 + i * 8), format = u16(view, offset);
    if (format === 12 && (platform === 3 && encoding === 10 || platform === 0)) { best = { format, offset }; break; }
    if (format === 4 && (platform === 3 && encoding === 1 || platform === 0) && !best) best = { format, offset };
  }
  if (best?.format === 12) {
    const groups = u32(view, best.offset + 12);
    for (let i = 0; i < groups; i++) { const at = best.offset + 16 + i * 12; ranges.push([u32(view, at), u32(view, at + 4)]); }
  } else if (best) {
    const segments = u16(view, best.offset + 6) / 2, ends = best.offset + 14, starts = ends + segments * 2 + 2;
    for (let i = 0; i < segments; i++) { const start = u16(view, starts + i * 2), end = u16(view, ends + i * 2); if (start !== 0xffff) ranges.push([start, end]); }
  }
  // Glyph-zero mappings inside a format 4 range are rare in real fonts; ranges are good enough here.
  return (code) => ranges.some(([start, end]) => code >= start && code <= end);
}
const CYRILLIC = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя';
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function fontCoverage(font) {
  const missing = (letters) => Array.from(letters).filter((ch) => !font.covers(ch.codePointAt(0)));
  return { latin: missing(LATIN), cyrillic: missing(CYRILLIC) };
}

// The name table, rebuilt: the family/style names Dota looks for, other records kept (copyright,
// license, designer — the OFL requires keeping them).
function nameTable(original, names) {
  const view = new DataView(original.buffer, original.byteOffset, original.byteLength), count = u16(view, 2), storage = u16(view, 4);
  const replaced = new Set(Object.keys(names).map(Number)), records = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12, id = u16(view, at + 6);
    if (replaced.has(id)) continue;
    const length = u16(view, at + 8), offset = u16(view, at + 10);
    records.push({ platform: u16(view, at), encoding: u16(view, at + 2), language: u16(view, at + 4), id, data: original.subarray(storage + offset, storage + offset + length) });
  }
  for (const [id, value] of Object.entries(names)) {
    if (value == null) continue; // removed, not replaced
    const utf16 = new Uint8Array(value.length * 2);
    for (let i = 0; i < value.length; i++) { utf16[i * 2] = value.charCodeAt(i) >> 8; utf16[i * 2 + 1] = value.charCodeAt(i) & 0xff; }
    records.push({ platform: 3, encoding: 1, language: 0x409, id: Number(id), data: utf16 });
    records.push({ platform: 1, encoding: 0, language: 0, id: Number(id), data: Uint8Array.from(value, (ch) => ch.charCodeAt(0) & 0x7f) });
  }
  records.sort((a, b) => a.platform - b.platform || a.encoding - b.encoding || a.language - b.language || a.id - b.id);
  const head = 6 + records.length * 12, out = new Uint8Array(head + records.reduce((sum, r) => sum + r.data.length, 0)), out16 = new DataView(out.buffer);
  out16.setUint16(0, 0); out16.setUint16(2, records.length); out16.setUint16(4, head);
  let offset = 0;
  records.forEach((record, i) => {
    const at = 6 + i * 12;
    [record.platform, record.encoding, record.language, record.id, record.data.length, offset].forEach((value, j) => out16.setUint16(at + j * 2, value));
    out.set(record.data, head + offset); offset += record.data.length;
  });
  return out;
}
function checksum(bytes) {
  const padded = new Uint8Array((bytes.length + 3) & ~3); padded.set(bytes);
  const view = new DataView(padded.buffer); let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + view.getUint32(i)) >>> 0;
  return sum;
}
function writeFont(signature, tables) {
  const tags = Object.keys(tables).sort(), count = tags.length;
  const entrySelector = Math.floor(Math.log2(count)), searchRange = 2 ** entrySelector * 16;
  let size = 12 + count * 16;
  const offsets = tags.map((name) => { const at = size; size += (tables[name].length + 3) & ~3; return at; });
  const out = new Uint8Array(size), view = new DataView(out.buffer);
  view.setUint32(0, signature === 'OTTO' ? 0x4f54544f : 0x00010000);
  view.setUint16(4, count); view.setUint16(6, searchRange); view.setUint16(8, entrySelector); view.setUint16(10, count * 16 - searchRange);
  tags.forEach((name, i) => {
    const at = 12 + i * 16, table = tables[name];
    for (let j = 0; j < 4; j++) out[at + j] = name.charCodeAt(j);
    view.setUint32(at + 4, checksum(table)); view.setUint32(at + 8, offsets[i]); view.setUint32(at + 12, table.length);
    out.set(table, offsets[i]);
  });
  const headAt = offsets[tags.indexOf('head')];
  view.setUint32(headAt + 8, (0xb1b0afba - checksum(out)) >>> 0);
  return out;
}

// One of Valve's font files (name without .otf) made from `font` (readFont).
export function dotaFace(font, file) {
  const face = VALVE_FACES[file];
  if (!face) throw new Error(`Нет файла ${file}.otf в шрифтах Dota.`);
  const [family, style, full, postscript, typographic, typographicStyle, weight] = face;
  const italic = /Italic/.test(style), bold = /Bold/.test(style), regular = style === 'Regular';
  const tables = { ...font.tables };
  // IDs 16/17 are written only where Valve's file has them; stale ones from the source font go.
  tables.name = nameTable(font.tables.name, { 1: family, 2: style, 4: full, 6: postscript, 16: typographic, 17: typographicStyle });
  const os2 = tables['OS/2'] = new Uint8Array(font.tables['OS/2']), os2View = new DataView(os2.buffer);
  os2View.setUint16(4, weight);
  os2View.setUint16(8, 0); // installable: nothing restricts use
  os2View.setUint16(62, (os2View.getUint16(62) & ~0b1100001) | (italic ? 1 : 0) | (bold ? 0b100000 : 0) | (regular ? 0b1000000 : 0));
  const head = tables.head = new Uint8Array(font.tables.head), headView = new DataView(head.buffer);
  headView.setUint32(8, 0);
  headView.setUint16(44, (bold ? 1 : 0) | (italic ? 2 : 0)); // macStyle
  return writeFont(font.signature, tables);
}

// The pack: fonts = the chosen faces (readFont results); families = which Dota families to
// replace. Each of Valve's files gets the face closest in weight, an italic where there is one.
export function dotaFontPack(fonts, families = ['Radiance', 'RadianceM', 'Reaver']) {
  if (!fonts.length) throw new Error('Нет шрифта.');
  const files = [];
  for (const [file, face] of Object.entries(VALVE_FACES)) {
    const family = face[4] || face[0];
    if (!families.includes(family)) continue;
    const weight = face[6], italic = /Italic/.test(face[1]);
    const pick = [...fonts].sort((a, b) => (a.italic !== italic) - (b.italic !== italic) || Math.abs(a.weight - weight) - Math.abs(b.weight - weight) || b.weight - a.weight)[0];
    files.push({ name: `${file}.otf`, data: dotaFace(pick, file) });
  }
  return files;
}
