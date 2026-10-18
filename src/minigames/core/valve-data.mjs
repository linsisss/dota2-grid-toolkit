// Valve's text formats as the minigames need them, with no DOM: used both by the asset pipeline
// (scripts/make-minigame-assets.mjs, in Node) and by the page (src/minigames/core/*).
// - KeyValues 1 (resource/localization/*.txt): parseKV1, localizationTokens, pickStrings;
// - sound events (soundevents/*.vsndevts, KeyValues 3 parsed by scripts/kv3.mjs): soundEvent, buildSoundTable;
// - Panorama CSS @define constants: cssDefines;
// - Valve resource paths (s2r://…, file://{images}/…) to the pipeline's lookup keys: valveKey;
// - Valve's placeholders ({d:x}, {s:x}, {f:1:x}) and its tiny HTML (<b>, <i>, <br/>): fillValve, richTokens.

// --- KeyValues 1 ---------------------------------------------------------------------------------
// "key" "value" pairs and "key" { … } blocks; // comments; [$WIN32]-style conditions are skipped;
// \" \\ \n \t escapes inside quotes; a value may span lines.
const KV1_TOKEN = /\s+|\/\/[^\n]*|\[\$?[^\]\n]*\]|"((?:[^"\\]|\\[\s\S])*)"|([{}])|([^\s{}"]+)/y;
const unescape = (text) => text.replace(/\\([\s\S])/g, (_, c) => ({ n: '\n', t: '\t' })[c] ?? c);

export function parseKV1(text) {
  const tokens = [];
  KV1_TOKEN.lastIndex = 0;
  const source = text.replace(/^\uFEFF/, '');
  while (KV1_TOKEN.lastIndex < source.length) {
    const at = KV1_TOKEN.lastIndex, m = KV1_TOKEN.exec(source);
    if (!m) throw new Error(`KV1: unexpected text at ${at}: ${JSON.stringify(source.slice(at, at + 30))}`);
    if (m[1] !== undefined) tokens.push(['str', unescape(m[1])]);
    else if (m[2]) tokens.push([m[2]]);
    else if (m[3]) tokens.push(['str', m[3]]);
  }
  let i = 0;
  const block = () => {
    const object = {};
    while (i < tokens.length && tokens[i][0] !== '}') {
      const [type, key] = tokens[i++];
      if (type !== 'str') throw new Error(`KV1: a key was expected, got ${type}`);
      if (i >= tokens.length) break;
      if (tokens[i][0] === '{') { i++; object[key] = block(); i++; }
      else object[key] = tokens[i++][1];
    }
    return object;
  };
  return block();
}

// The flat token table of a localization file: { lang: { Tokens: {…} } } or a novel's { novel: {…} }.
export function localizationTokens(text) {
  const root = parseKV1(text);
  const top = Object.values(root)[0] || {};
  return top.Tokens && typeof top.Tokens === 'object' ? top.Tokens : top;
}

// The tokens whose keys match any of the patterns (RegExp or exact strings), in the file's order.
export function pickStrings(tokens, patterns) {
  const tests = patterns.map((pattern) => (pattern instanceof RegExp ? (key) => pattern.test(key) : (key) => key === pattern));
  const picked = {};
  for (const [key, value] of Object.entries(tokens)) if (typeof value === 'string' && tests.some((test) => test(key))) picked[key] = value;
  return picked;
}

// --- Sound events ---------------------------------------------------------------------------------
const number = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const list = (value) => (Array.isArray(value) ? value : value == null || value === '' ? [] : [value]);

// One event of a .vsndevts file in the shape the page plays (src/minigames/core/sound.js):
// files (Valve paths, 'sounds/null.vsnd' kept: it is a deliberate chance of silence), volume and pitch
// with their random ranges, delay, fades, a second layer, a stop time.
export function soundEvent(raw) {
  const event = { files: list(raw.vsnd_files).map(String), volume: number(raw.volume, 1), pitch: number(raw.pitch, 1) };
  if (raw.volume_rand_min != null || raw.volume_rand_max != null) event.volumeRand = [number(raw.volume_rand_min, 0), number(raw.volume_rand_max, 0)];
  if (raw.pitch_rand_min != null || raw.pitch_rand_max != null) event.pitchRand = [number(raw.pitch_rand_min, 0), number(raw.pitch_rand_max, 0)];
  if (number(raw.delay, 0) > 0) event.delay = number(raw.delay, 0);
  if (number(raw.volume_fade_in, 0) > 0) event.fadeIn = number(raw.volume_fade_in, 0);
  if (number(raw.volume_fade_out, 0) > 0) event.fadeOut = number(raw.volume_fade_out, 0);
  if (raw.soundevent_layer2 && number(raw.soundevent_layer2_on, 0) > 0) event.layers = [String(raw.soundevent_layer2)];
  if (number(raw.stop_at_time, 0) > 0) event.stopAt = number(raw.stop_at_time, 0);
  if (number(raw.limiter_on, 0) > 0) event.limiter = true;
  if (raw.mixgroup) event.mixgroup = String(raw.mixgroup);
  if (number(raw.vsnd_duration, 0) > 0) event.duration = number(raw.vsnd_duration, 0);
  return event;
}

// Valve's sound path ('sounds/ui/buttonclick.vsnd', with or without _c) to its name under sounds/
// ('ui/buttonclick'); null for the silent 'sounds/null.vsnd'.
export function vsndName(path) {
  const name = String(path).replace(/\\/g, '/').replace(/^sounds\//, '').replace(/\.vsnd(_c)?$/, '');
  return name === 'null' ? null : name;
}

// The events of parsed .vsndevts files (objects name → raw event) that match, with every file mapped by
// `fileFor(name)` (vsndName's result) to the URL path the page loads, or to undefined when the file was
// not exported (listed in `missing`; an event with none of its files left is dropped). Layers pull in
// the events they name even when those do not match.
export function buildSoundTable(sources, { match = () => true, fileFor }) {
  const all = Object.assign({}, ...sources), events = {}, missing = {};
  const wanted = Object.keys(all).filter((name) => match(name));
  const queue = [...wanted];
  for (let i = 0; i < queue.length; i++) {
    const name = queue[i];
    if (!all[name]) { missing[name] = []; continue; }
    const event = soundEvent(all[name]);
    const files = [], lost = [];
    for (const path of event.files) {
      const file = vsndName(path);
      if (file === null) { files.push(null); continue; }
      const out = fileFor(file);
      if (out) files.push(out); else lost.push(path);
    }
    if (lost.length) missing[name] = lost;
    if (!files.some(Boolean)) { missing[name] = lost; continue; }
    event.files = files;
    events[name] = event;
    for (const layer of event.layers || []) if (!queue.includes(layer)) queue.push(layer);
  }
  return { events, missing };
}

// --- Panorama CSS -------------------------------------------------------------------------------
// @define name: value; → { name: value } (numbers as numbers, the rest as written).
export function cssDefines(text) {
  const defines = {};
  for (const m of String(text).matchAll(/@define\s+([A-Za-z_][\w-]*)\s*:\s*([^;]*);/g)) {
    const value = m[2].trim();
    defines[m[1]] = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
  }
  return defines;
}

// --- Valve paths --------------------------------------------------------------------------------
// A resource as Valve's layouts, CSS and data name it, to the key the pipeline's manifest uses:
//   s2r://panorama/images/events/crownfall/minesweeper/cellflagicon_psd.vtex → panorama/images/events/crownfall/minesweeper/cellflagicon_psd
//   file://{images}/events/crownfall/fishing/fish_bg.png                   → panorama/images/events/crownfall/fishing/fish_bg_png
//   sounds/ui/buttonclick.vsnd                                             → sounds/ui/buttonclick
export function valveKey(path) {
  let value = String(path).trim().replace(/\\/g, '/').replace(/^url\(\s*["']?|["']?\s*\)$/g, '');
  const images = /^file:\/\/\{images\}\/(.*)\.(png|psd|tga|jpg)$/i.exec(value);
  if (images) return `panorama/images/${images[1]}_${images[2].toLowerCase()}`.toLowerCase();
  value = value.replace(/^s2r:\/\//, '').replace(/^file:\/\/\{images\}\//, 'panorama/images/').replace(/^file:\/\/\{resources\}\//, 'panorama/');
  return value.replace(/\.(vtex|vsvg|vsnd|vdata|vpcf|vmdl|vmat)(_c)?$/i, '').replace(/\.(png|svg|wav|mp3|webp|glb|json)$/i, '').toLowerCase();
}

// --- Strings --------------------------------------------------------------------------------------
// Valve's placeholders: {d:name} (whole number), {s:name} (text), {f:name} and {f:2:name} (a number
// with that many decimals; {f:name} drops trailing zeros), {i:name}; %s1-style ones take values[1].
export function fillValve(text, values = {}, locale = 'ru-RU') {
  return String(text)
    .replace(/\{([dsfgit])(?::(\d+))?:([\w-]+)\}/g, (whole, type, digits, name) => {
      if (!(name in values)) return whole;
      const value = values[name];
      if (type === 's' || type === 'g' || type === 't') return String(value);
      const n = Number(value);
      if (!Number.isFinite(n)) return String(value);
      if (type === 'd' || type === 'i') return Math.round(n).toLocaleString(locale);
      return digits != null ? n.toLocaleString(locale, { minimumFractionDigits: Number(digits), maximumFractionDigits: Number(digits) }) : n.toLocaleString(locale, { maximumFractionDigits: 2 });
    })
    .replace(/%s(\d)/g, (whole, index) => (index in values ? String(values[index]) : whole));
}

// The bit of HTML Valve's strings carry, as safe tokens: text, <b>/<i>/<u> on and off, <br/>, and
// <span class="…"> / <font color="…"> as a colour span. Every other tag is dropped; text stays text.
export function richTokens(text) {
  const tokens = [];
  const allowed = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', span: 'span', font: 'span' };
  for (const m of String(text).replace(/\r\n?/g, '\n').matchAll(/<\s*(\/?)\s*([a-zA-Z]+)([^>]*)>|([^<]+)|(<)/g)) {
    if (m[4] !== undefined || m[5] !== undefined) { pushText(tokens, m[4] ?? m[5]); continue; }
    const closing = !!m[1], tag = m[2].toLowerCase(), attributes = m[3] || '';
    if (tag === 'br') { tokens.push({ br: true }); continue; }
    const name = allowed[tag];
    if (!name) continue;
    if (closing) { tokens.push({ close: name }); continue; }
    const token = { open: name };
    if (name === 'span') {
      const className = /class\s*=\s*["']([\w\s-]+)["']/i.exec(attributes)?.[1];
      const color = /color\s*=\s*["'](#[0-9a-f]{3,8}|[a-z]+)["']/i.exec(attributes)?.[1];
      if (className) token.className = className.trim();
      if (color) token.color = color;
    }
    tokens.push(token);
  }
  return tokens;
}
function pushText(tokens, text) {
  const last = tokens[tokens.length - 1];
  if (last && last.text !== undefined) last.text += text; else tokens.push({ text });
}
// The visible length of a string with Valve's HTML (what a typewriter counts).
export const visibleLength = (text) => richTokens(text).reduce((sum, token) => sum + (token.text ? [...token.text].length : token.br ? 1 : 0), 0);
