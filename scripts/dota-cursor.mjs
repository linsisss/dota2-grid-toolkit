// «Курсор» on the customization page (2026-10-16; every cursor of Dota and the d2pfx packs from
// 2026-10-17). Dota draws its cursors from resource/cursor/<id>.bmp — 32-bit BMPs, bottom-up, at four
// sizes for the UI scale (<id>_vsz0..3: 32, 48, 72 and 96 px; .ani files are not used since 2015,
// resource/cursor/source/readme.txt), the hotspot from cursor.res (top-left when an id is not there).
// Tested in game on 2026-10-16: from a VPK they are not taken, as loose files in
// game/dota_russian/resource/cursor they are — and they leave Valve's own files in game/dota alone;
// an id we do not write stays Valve's. The menu has a cursor of its own (cursor_db_default).
import { VALVE_FRAME_HASHES } from './dota-cursor-valve.mjs';

export const CURSOR_SIZES = Object.freeze([32, 48, 72, 96]);
const VALVE_FRAMES = new Set(VALVE_FRAME_HASHES);
export const CURSOR_DIR = 'resource/cursor';
// Every cursor of Dota's resource/cursor, in the order the page lists them: the ids of Valve's workshop
// cursor pack (scripts/workshop_import_templates/template_cursor_pack.txt, without cursor_invisible) and
// the menu's ones that Valve's folder has beside them (cursor_db_*, cursor_hand_*; the d2pfx «Cursor
// Creator» lists 15 of these). `group`: where the page lists it; `hot`: Valve's hotspot in 32-px units
// (cursor.res; their vsz files scale it).
export const CURSOR_ROLES = Object.freeze(Object.fromEntries([
  ['cursor_default', 'default', [0, 0]], ['cursor_default_team', 'default', [0, 0]], ['cursor_default_enemy', 'default', [0, 0]],
  ['cursor_attack_default', 'attack', [0, 0]], ['cursor_attack_team', 'attack', [0, 0]], ['cursor_attack_enemy', 'attack', [0, 0]], ['cursor_attack_illegal', 'attack', [0, 0]],
  ['cursor_spell_default', 'spell', [16, 16]], ['cursor_spell_team', 'spell', [24, 24]], ['cursor_spell_enemy', 'spell', [24, 24]], ['cursor_spell_illegal', 'spell', [16, 16]], ['cursor_spell_walkto', 'spell', [16, 16]],
  ['cursor_move', 'action', [0, 0]], ['cursor_learn_ability', 'action', [0, 0]], ['cursor_item_drop', 'action', [14, 14]], ['cursor_buy', 'action', [14, 14]], ['cursor_cannot_buy', 'action', [14, 14]], ['cursor_coach', 'action', [0, 0]],
  ['cursor_db_default', 'menu', [0, 0]], ['cursor_db_default_highlight', 'menu', [0, 0]], ['cursor_db_ibeam', 'menu', [14, 14]], ['cursor_hand_open', 'menu', [16, 16]], ['cursor_hand_closed', 'menu', [16, 16]]
].map(([id, group, hot]) => [id, Object.freeze({ group, hot: Object.freeze(hot) })])));
export const CURSOR_IDS = Object.freeze(Object.keys(CURSOR_ROLES));
export const CURSOR_GROUPS = Object.freeze(['default', 'attack', 'spell', 'action', 'menu']);
// Valve's cursor.res (hotspots in pixels of each file), as the game has it; ours is written whole when a
// hotspot differs, so the ids we do not touch keep theirs.
const VALVE_HOTSPOTS = {
  cursor_attack_default: [0, 0], cursor_attack_enemy: [0, 0], cursor_attack_illegal: [0, 0], cursor_attack_team: [0, 0],
  cursor_buy: [14, 14], cursor_cannot_buy: [14, 14], cursor_default: [0, 0], cursor_default_enemy: [0, 0], cursor_default_team: [0, 0],
  cursor_item_drop: [14, 14], cursor_learn_ability: [0, 0], cursor_move: [0, 0], cursor_spell_enemy: [24, 24], cursor_spell_team: [24, 24], cursor_db_ibeam: [14, 14],
  ...Object.fromEntries(['cursor_spell_default', 'cursor_spell_illegal', 'cursor_spell_walkto', 'cursor_hand_open', 'cursor_hand_closed']
    .flatMap((id) => CURSOR_SIZES.map((size, i) => [`${id}_vsz${i}`, [Math.round(size / 2), Math.round(size / 2)]])))
};
VALVE_HOTSPOTS.cursor_hand_open_vsz0 = [14, 14]; VALVE_HOTSPOTS.cursor_hand_closed_vsz0 = [14, 14];

// A 32-bit BMP (BGRA, bottom-up, like Valve's) from canvas RGBA pixels.
export function cursorBMP(width, height, rgba) {
  const bmp = new Uint8Array(54 + width * height * 4), view = new DataView(bmp.buffer);
  bmp.set([0x42, 0x4d]); view.setUint32(2, bmp.length, true); view.setUint32(10, 54, true); view.setUint32(14, 40, true);
  view.setInt32(18, width, true); view.setInt32(22, height, true); view.setUint16(26, 1, true); view.setUint16(28, 32, true); view.setUint32(34, width * height * 4, true);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = (y * width + x) * 4, to = 54 + ((height - 1 - y) * width + x) * 4;
    bmp[to] = rgba[from + 2]; bmp[to + 1] = rgba[from + 1]; bmp[to + 2] = rgba[from]; bmp[to + 3] = rgba[from + 3];
  }
  return bmp;
}

// A BMP of a cursor pack → { width, height, rgba } (top-down RGBA), or null: 32-, 24-bit and paletted,
// bottom-up or top-down, uncompressed or BI_BITFIELDS. Like Valve's loader: 32-bit with no alpha at all
// is opaque, and without alpha magenta (#ff00ff) is the transparent colour.
export function decodeCursorBMP(bytes) {
  if (!bytes || bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = view.getUint32(10, true), header = view.getUint32(14, true), width = view.getInt32(18, true), signed = view.getInt32(22, true);
  const bits = view.getUint16(28, true), compression = view.getUint32(30, true), height = Math.abs(signed), topDown = signed < 0;
  if (header < 40 || ![0, 3].includes(compression) || ![1, 4, 8, 24, 32].includes(bits) || width <= 0 || height <= 0 || width > 2048 || height > 2048) return null;
  const stride = Math.floor((bits * width + 31) / 32) * 4;
  if (offset + stride * (height - 1) + Math.ceil((bits * width) / 8) > bytes.length) return null;
  let palette = null;
  if (bits <= 8) {
    const count = view.getUint32(46, true) || 1 << bits;
    palette = Array.from({ length: count }, (_, i) => { const at = 14 + header + i * 4; return at + 2 < bytes.length ? [bytes[at + 2], bytes[at + 1], bytes[at]] : [0, 0, 0]; });
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  let alpha = false;
  for (let y = 0; y < height; y++) {
    const row = offset + (topDown ? y : height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const to = (y * width + x) * 4;
      if (bits === 32) { const at = row + x * 4; rgba[to] = bytes[at + 2]; rgba[to + 1] = bytes[at + 1]; rgba[to + 2] = bytes[at]; rgba[to + 3] = bytes[at + 3]; if (bytes[at + 3]) alpha = true; continue; }
      let colour;
      if (bits === 24) { const at = row + x * 3; colour = [bytes[at + 2], bytes[at + 1], bytes[at]]; }
      else { const perByte = 8 / bits, byte = bytes[row + Math.floor(x / perByte)], shift = 8 - bits * ((x % perByte) + 1); colour = palette[(byte >> shift) & ((1 << bits) - 1)] || [0, 0, 0]; }
      rgba.set([...colour, 255], to);
    }
  }
  if (bits === 32 && !alpha) for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  if (!alpha) for (let i = 0; i < rgba.length; i += 4) if (rgba[i] === 255 && rgba[i + 1] === 0 && rgba[i + 2] === 255) rgba[i + 3] = 0;
  return { width, height, rgba };
}

// A fingerprint of a decoded picture (FNV-1a over its size and RGBA), to know Valve's own pictures in a pack.
export function frameHash({ width, height, rgba }) {
  let hash = 0x811c9dc5;
  const step = (byte) => { hash ^= byte; hash = Math.imul(hash, 0x01000193) >>> 0; };
  [width & 255, width >> 8, height & 255, height >> 8].forEach(step);
  for (let i = 0; i < rgba.length; i++) step(rgba[i]);
  return hash.toString(16).padStart(8, '0');
}

// A cursor.res → { <id or id_vszN>: [x, y] } (Valve's KeyValues: an id, then "hotx" and "hoty").
export function parseCursorRes(text) {
  const out = {}, body = String(text).replace(/\/\/[^\n]*/g, '');
  for (const [, id, inner] of body.matchAll(/([A-Za-z0-9_]+)\s*\{([^{}]*)\}/g)) {
    const x = /"hotx"\s*"(-?\d+)"/.exec(inner), y = /"hoty"\s*"(-?\d+)"/.exec(inner);
    if (x && y) out[id.toLowerCase()] = [Number(x[1]), Number(y[1])];
  }
  return out;
}

// The size of a file name's picture (<id>.bmp is 32 px, <id>_vszN at CURSOR_SIZES[N]).
const fileSize = (vsz) => CURSOR_SIZES[vsz ?? 0];
// Names other packs use for an id (SpearMa's «cursor_learnability»).
const ALIASES = { cursor_learnability: 'cursor_learn_ability', cursor_learn: 'cursor_learn_ability' };
// A cursor pack's files ([{ name, data }], any folders: d2pfx's «<Pack>/cursor/…») → for every id of
// CURSOR_ROLES it has: { frames: [{ width, height, rgba, size }] largest first, hot: [x, y] in 32-px
// units or null when it is Valve's }. Pictures that do not decode are skipped.
export function packCursors(entries) {
  const found = {}, hotspots = {};
  for (const { name, data } of entries) {
    const base = name.split('/').pop().toLowerCase();
    if (base === 'cursor.res') { Object.assign(hotspots, parseCursorRes(new TextDecoder().decode(data))); continue; }
    const match = /^(cursor_[a-z_]+?)(?:_vsz([0-3]))?\.bmp$/.exec(base);
    if (!match) continue;
    const id = ALIASES[match[1]] || match[1];
    if (!CURSOR_ROLES[id]) continue;
    const picture = decodeCursorBMP(data);
    if (!picture) continue;
    (found[id] ||= []).push({ ...picture, size: fileSize(match[2] === undefined ? undefined : Number(match[2])) });
  }
  // Most packs are Valve's folder with some pictures replaced (often only the 32-px <id>.bmp, the vsz files
  // left as Valve's): Valve's own pictures are dropped, so the pack's art makes every size, and an id the
  // pack does not change stays Dota's. A pack that changes nothing (d2pfx's «Default Cursor») is kept whole.
  const own = (frames) => frames.filter((frame) => !VALVE_FRAMES.has(frameHash(frame)));
  const changes = Object.values(found).some((frames) => own(frames).length);
  const out = {};
  for (const [id, all] of Object.entries(found)) {
    const frames = changes ? own(all) : all;
    if (!frames.length) continue;
    frames.sort((a, b) => b.width - a.width);
    out[id] = { frames, hot: packHot(id, hotspots) };
  }
  return out;
}
// The ids Valve ships at 32 px only (no _vsz files): their own line in cursor.res is the one that counts.
const PLAIN_IDS = new Set(['cursor_buy', 'cursor_cannot_buy', 'cursor_item_drop', 'cursor_spell_team', 'cursor_spell_enemy', 'cursor_db_ibeam', 'cursor_db_default_highlight']);
// A pack's hotspot for an id in 32-px units, or null when its lines say what Valve's do. Packs often carry
// an old cursor.res (spells at 14, 14 for their 32-px pictures) beside vsz pictures drawn like Valve's:
// for an id with vsz files only a vsz line counts.
function packHot(id, hotspots) {
  const role = CURSOR_ROLES[id].hot, scaled = (point, size) => point.map((v) => Math.round((v * size) / 32));
  const lines = Object.entries(hotspots).filter(([key]) => key === id || key.startsWith(`${id}_vsz`));
  const valve = (key) => VALVE_HOTSPOTS[key] || (key === id ? role : scaled(role, CURSOR_SIZES[Number(key.slice(-1))] || 32));
  if (lines.every(([key, [x, y]]) => { const [vx, vy] = valve(key); return vx === x && vy === y; })) return null;
  let hot = null;
  const vsz = CURSOR_SIZES.map((size, i) => [size, hotspots[`${id}_vsz${i}`]]).find(([, value]) => value);
  if (vsz) hot = vsz[1].map((v) => Math.round((v * 32) / vsz[0]));
  else if (PLAIN_IDS.has(id) && hotspots[id]) hot = hotspots[id];
  return hot && (hot[0] !== role[0] || hot[1] !== role[1]) ? hot.map((v) => Math.max(0, Math.min(31, v))) : null;
}

// cursor.res: Valve's hotspots with the given ones over them; null when nothing differs from Valve's.
export function cursorRes(changes) {
  const all = { ...VALVE_HOTSPOTS }, valve = JSON.stringify(all);
  Object.assign(all, changes);
  if (JSON.stringify(all) === valve) return null;
  const body = Object.entries(all).map(([id, [x, y]]) => `\t${id}\n\t{\n\t\t"hotx"\t\t"${x}"\n\t\t"hoty"\t\t"${y}"\n\t}`).join('\n\n');
  return `// Hotspots of Dota's cursors (Valve's, with GridStudio's cursors).\n"resource/cursor/cursor.res"\n{\n${body}\n}\n`;
}

// The loose files for game/dota_russian: chosen = { <id>: { hot: [x, y] in 32-px units or null (Valve's),
// render(size) → RGBA } }. Every id gets its picture at the four sizes (and the plain <id>.bmp at 32 px);
// cursor.res when a hotspot is not Valve's.
export function cursorFiles(chosen) {
  const files = [], hotspots = {};
  for (const [id, { hot, render }] of Object.entries(chosen)) {
    if (!CURSOR_ROLES[id] || typeof render !== 'function') continue;
    const pictures = CURSOR_SIZES.map((size) => cursorBMP(size, size, render(size)));
    files.push({ name: `${CURSOR_DIR}/${id}.bmp`, data: pictures[0] });
    pictures.forEach((data, i) => files.push({ name: `${CURSOR_DIR}/${id}_vsz${i}.bmp`, data }));
    // Valve's hotspot (null): its own lines stay, and the files Valve has no line for (the vsz files of an
    // id it ships at 32 px only) get Valve's point scaled, so no size falls back to the corner.
    const at = (size, point) => point.map((v) => Math.max(0, Math.min(size - 1, Math.round((v * size) / 32))));
    const point = (file, size) => (hot ? at(size, hot) : VALVE_HOTSPOTS[file] || at(size, CURSOR_ROLES[id].hot));
    hotspots[id] = point(id, 32);
    CURSOR_SIZES.forEach((size, i) => { hotspots[`${id}_vsz${i}`] = point(`${id}_vsz${i}`, size); });
  }
  // Only the ids whose hotspot Valve's cursor.res does not already give the same way.
  const changes = Object.fromEntries(Object.entries(hotspots).filter(([id, [x, y]]) => {
    const valve = VALVE_HOTSPOTS[id];
    return valve ? valve[0] !== x || valve[1] !== y : x !== 0 || y !== 0;
  }));
  const res = cursorRes(changes);
  if (res) files.push({ name: `${CURSOR_DIR}/cursor.res`, data: new TextEncoder().encode(res) });
  return files;
}
