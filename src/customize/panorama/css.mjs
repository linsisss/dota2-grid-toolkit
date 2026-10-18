// Panorama's stylesheets for the browser (the HUD preview, 2026-10-16). Valve's .css (as Source 2 Viewer
// writes them) is parsed with its @define constants, the selectors are kept but point at our elements
// (<pa-dotahud> for DOTAHud, .ps-hover for :hover) and every declaration becomes browser CSS:
// - what the browser draws the same way goes straight through (colours, borders, margins, fonts…);
// - what depends on the parent's layout (flow-children, the aligns, fill-parent-flow, visibility) becomes
//   a non-inherited custom property (--p-*) that the scene's static rules and its layout pass read
//   (scene.mjs), so the cascade, the specificity and the order stay the browser's — and our own rules
//   (scripts/hud-style.mjs) win or lose exactly as in the game;
// - the panel filters (wash-color, brightness, saturation…) are custom properties combined into one
//   `filter`; Panorama's gradient() becomes linear-/radial-gradient().
// Sounds, transitions, animations, tooltips are dropped: the preview is a still frame.

// ---------------------------------------------------------------- parsing
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');
// Top-level split on a character, outside brackets and quotes.
export function splitTop(text, separator = ',') {
  const parts = [];
  let depth = 0, quote = '', start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && c === separator) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part, i, all) => part || all.length === 1);
}
// @define names in a value (outside url("…") and strings) become their values.
export function substituteDefines(value, defines) {
  if (!defines?.size) return value;
  return value.replace(/("[^"]*"|'[^']*'|url\([^)]*\))|(-?[A-Za-z_][\w-]*)(?!\s*\()/g, (all, kept, name) => kept ? kept : defines.has(name) ? defines.get(name) : all);
}
// A stylesheet → { rules: [{ selector, decls: [[property, value]] }], imports }. @define constants go
// into `defines` (shared between the files in include order, as dotastyles' colours are used by all).
export function parseStyles(text, defines = new Map()) {
  const source = stripComments(text), rules = [], imports = [];
  let i = 0;
  const skipBlock = (from) => { let depth = 0; for (let j = from; j < source.length; j++) { if (source[j] === '{') depth++; else if (source[j] === '}' && --depth === 0) return j + 1; } return source.length; };
  while (i < source.length) {
    const rest = source.slice(i), lead = rest.match(/^\s*/)[0].length;
    i += lead;
    if (i >= source.length) break;
    if (source[i] === '@') {
      const define = source.slice(i).match(/^@define\s+([\w-]+)\s*:\s*([^;]*);/);
      if (define) { defines.set(define[1], substituteDefines(define[2].trim(), defines)); i += define[0].length; continue; }
      const imported = source.slice(i).match(/^@import\s+url\(\s*["']?([^"')]+)["']?\s*\)\s*;/);
      if (imported) { imports.push(imported[1]); i += imported[0].length; continue; }
      const brace = source.indexOf('{', i), semi = source.indexOf(';', i);
      if (semi !== -1 && (brace === -1 || semi < brace)) { i = semi + 1; continue; }
      i = brace === -1 ? source.length : skipBlock(brace);
      continue;
    }
    const open = source.indexOf('{', i);
    if (open === -1) break;
    const close = source.indexOf('}', open);
    const selector = source.slice(i, open).trim().replace(/\s+/g, ' ');
    const decls = [];
    for (const part of splitTop(source.slice(open + 1, close === -1 ? source.length : close), ';')) {
      const colon = part.indexOf(':');
      if (colon < 1) continue;
      decls.push([part.slice(0, colon).trim().toLowerCase(), substituteDefines(part.slice(colon + 1).trim(), defines)]);
    }
    if (selector) rules.push({ selector, decls });
    i = close === -1 ? source.length : close + 1;
  }
  return { rules, imports };
}

// ---------------------------------------------------------------- selectors
// Panorama's panel types are our custom elements: DOTAHud → <pa-dotahud>.
export const tagOf = (type) => `pa-${type.toLowerCase()}`;
// Panorama's states (:hover, :selected…) are classes the preview sets or not; the panels are enabled.
const STATES = new Set(['hover', 'active', 'focus', 'selected', 'enabled', 'disabled', 'descendantfocus', 'parentdisabled', 'activated', 'layoutloading', 'layoutfailed', 'firstchild', 'lastchild']);
const escapeIdent = (name) => name.replace(/^(\d)/, (d) => `\\3${d} `).replace(/[^\w-]/g, (c) => `\\${c}`);
function translateCompound(compound) {
  let out = '', i = 0;
  const type = compound.match(/^(\*|[A-Za-z_][\w-]*)/);
  if (type) { out += type[1] === '*' ? '*' : tagOf(type[1]); i = type[1].length; }
  while (i < compound.length) {
    const rest = compound.slice(i);
    let m;
    if ((m = rest.match(/^([.#])((?:\\.|[\w-])+)/))) { out += m[1] + escapeIdent(m[2]); i += m[0].length; continue; }
    if ((m = rest.match(/^:not\(/i))) {
      let depth = 1, j = m[0].length;
      for (; j < rest.length && depth; j++) depth += rest[j] === '(' ? 1 : rest[j] === ')' ? -1 : 0;
      out += `:not(${translateSelector(rest.slice(m[0].length, j - 1))})`; i += j; continue;
    }
    if ((m = rest.match(/^:([\w-]+)/))) {
      const state = m[1].toLowerCase();
      out += state === 'enabled' ? ':not(.ps-disabled)' : STATES.has(state) ? `.ps-${state}` : `.ps-${escapeIdent(state)}`;
      i += m[0].length; continue;
    }
    // Something Panorama-only: keep the selector valid but unmatched.
    out += '.ps-unknown'; break;
  }
  return out;
}
// One Panorama selector (no commas) → ours; `scope` adds a condition on the subject (see scene.mjs).
export function translateSelector(selector, scope = '') {
  const parts = [];
  let depth = 0, current = '';
  for (const c of selector.trim()) {
    if (c === '(') depth++;
    else if (c === ')') depth--;
    if (depth === 0 && /[\s>+~]/.test(c)) {
      if (current) parts.push(current);
      current = '';
      if (!/\s/.test(c)) parts.push(c);
      continue;
    }
    current += c;
  }
  if (current) parts.push(current);
  const out = parts.map((part) => (/^[>+~]$/.test(part) ? part : translateCompound(part)));
  if (scope && out.length) out[out.length - 1] += scope;
  return out.join(' ');
}

// ---------------------------------------------------------------- values
const STOP = /^(from|to|color-stop)\s*\(([\s\S]*)\)$/i;
const num = (value) => parseFloat(value);
const round = (value) => Math.round(value * 100) / 100;
// Panorama's gradient( linear, x1 y1, x2 y2, from(c), color-stop(t, c), to(c) ) and
// gradient( radial, cx cy, ox oy, rx ry, stops ) → CSS gradients.
export function gradient(value) {
  const inner = value.trim().match(/^gradient\s*\(([\s\S]*)\)$/i);
  if (!inner) return null;
  const args = splitTop(inner[1]);
  const kind = (args[0] || '').toLowerCase();
  const stops = [];
  for (const arg of args) {
    const stop = arg.match(STOP);
    if (!stop) continue;
    const name = stop[1].toLowerCase();
    if (name === 'color-stop') { const [t, colour] = splitTop(stop[2]); stops.push([num(t), colour]); }
    else stops.push([name === 'from' ? 0 : 1, stop[2].trim()]);
  }
  if (!stops.length) return null;
  if (kind === 'radial') {
    const [centre = '50% 50%', , radius = '50% 50%'] = args.slice(1).filter((arg) => !STOP.test(arg)).map((arg) => arg.trim());
    return `radial-gradient(${radius} at ${centre}, ${stops.map(([t, colour]) => `${colour} ${round(t * 100)}%`).join(', ')})`;
  }
  const points = args.slice(1).filter((arg) => !STOP.test(arg)).map((arg) => arg.split(/\s+/).map(num));
  const [[x1 = 0, y1 = 0] = [], [x2 = 0, y2 = 100] = []] = points;
  let direction, at = (t) => t * 100;
  if (x1 === x2 && y1 !== y2) {
    direction = y2 > y1 ? 'to bottom' : 'to top';
    at = y2 > y1 ? (t) => y1 + t * (y2 - y1) : (t) => (100 - y1) + t * (y1 - y2);
  } else if (y1 === y2 && x1 !== x2) {
    direction = x2 > x1 ? 'to right' : 'to left';
    at = x2 > x1 ? (t) => x1 + t * (x2 - x1) : (t) => (100 - x1) + t * (x1 - x2);
  } else direction = `${round((Math.atan2(x2 - x1, -(y2 - y1)) * 180) / Math.PI)}deg`;
  return `linear-gradient(${direction}, ${stops.map(([t, colour]) => `${colour} ${round(at(t))}%`).join(', ')})`;
}
// A colour or a gradient → a background layer (colours as flat gradients, so layers stack).
const layer = (item) => gradient(item) || `linear-gradient(${item}, ${item})`;
const isGradient = (value) => /^gradient\s*\(/i.test(value.trim());
const firstColour = (value) => { const g = gradient(value); return g ? g.match(/,\s*(#[0-9a-f]+|rgba?\([^)]*\)|[a-z]+)\s+[\d.]+%/i)?.[1] || 'transparent' : value; };
const colourOf = (value) => (value.trim().toLowerCase() === 'none' ? 'transparent' : value);

// Textures: s2r://panorama/images/a/b_psd.vtex → the URL the scene gives (or none if we do not ship it).
export const texturePath = (src) => src.replace(/^s2r:\/\//, '').replace(/^file:\/\/\{images\}\//, 'panorama/images/').replace(/^file:\/\/\{resources\}\//, 'panorama/').replace(/\.vtex(_c)?$/, '').replace(/\.vsvg(_c)?$/, '.svg');
const urls = (value, asset) => value.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g, (all, src) => { const url = asset(texturePath(src)); return url ? `url("${url}")` : 'none'; });

const ALIGN = { left: 'start', top: 'start', center: 'center', middle: 'center', right: 'end', bottom: 'end' };
const WEIGHTS = { thin: 100, light: 300, normal: 400, regular: 400, medium: 500, 'semi-bold': 600, semibold: 600, bold: 700, heavy: 800, black: 900 };
const BLEND = { normal: 'normal', additive: 'plus-lighter', multiply: 'multiply', screen: 'screen', opaque: 'normal' };
// Panorama's fonts: defaultFont and monospaceNumbersFont are Radiance (RadianceM has only Radiance's
// digits), titleFont is Reaver. The scene loads Valve's files under these names (fontFaces); the site's
// StudioRadiance (SemiBold) stands in until they arrive.
export const FONT = "'PanoramaRadiance', 'StudioRadiance', sans-serif";
export const TITLE_FONT = "'PanoramaReaver', 'PanoramaRadiance', 'StudioRadiance', serif";
// RadianceM's digits are heavier than Radiance's at the same weight: its family takes Radiance's
// files one weight up (regular → semibold, semibold → bold).
export const NUMBERS_FONT = "'PanoramaRadianceM', 'PanoramaRadiance', 'StudioRadiance', sans-serif";
export const fontFamily = (value) => (/reaver|titlefont/i.test(value) ? TITLE_FONT : /radiancem|monospacenumbers/i.test(value) ? NUMBERS_FONT : FONT);
const FACE_WEIGHTS = { light: 300, regular: 400, semibold: 600, bold: 700 };
// @font-face rules for { 'radiance-bold': url, 'reaver-regular': url, … }.
const NUMBER_WEIGHTS = { regular: 300, semibold: 400, bold: '500 900' };
const face = (family, url, weight) => `@font-face { font-family: '${family}'; src: url("${url}") format('opentype'); font-weight: ${weight}; font-style: normal; font-display: swap; }`;
export const fontFaces = (files) => Object.entries(files).flatMap(([name, url]) => {
  const [family, weight] = name.split('-'), Family = family[0].toUpperCase() + family.slice(1);
  return [face(`Panorama${Family}`, url, FACE_WEIGHTS[weight] ?? 400), ...(family === 'radiance' && NUMBER_WEIGHTS[weight] ? [face('PanoramaRadianceM', url, NUMBER_WEIGHTS[weight])] : [])];
}).join('\n');
const size = (value, axis) => {
  const v = value.trim(), prop = axis === 'w' ? 'width' : 'height';
  // --p-ws: the width is set, so a label wraps in it (scene.mjs); fit-children labels do not.
  const set = (on) => (axis === 'w' ? [['--p-ws', on ? '1' : 'initial']] : []);
  let m;
  if ((m = v.match(/^fill-parent-flow\(\s*([\d.]+)\s*\)$/i))) return [[prop, '100%'], [`--p-fg${axis}`, `${num(m[1])}`], [`--p-fb${axis}`, '0px'], [`--p-ar${axis}`, 'initial'], ...set(true)];
  // height: width-percentage(50%) = half its own width; width: height-percentage(…) the other way.
  if ((m = v.match(/^(width|height)-percentage\(\s*([\d.]+)%?\s*\)$/i))) {
    const ratio = num(m[2]) / 100;
    return [[prop, 'auto'], [`--p-ar${axis}`, axis === 'w' ? `${round(ratio * 1000) / 1000}` : `${round(1000 / ratio) / 1000}`], [`--p-fg${axis}`, 'initial'], [`--p-fb${axis}`, 'initial'], ...set(true)];
  }
  const reset = [[`--p-fg${axis}`, 'initial'], [`--p-fb${axis}`, 'initial'], [`--p-ar${axis}`, 'initial']];
  // Panorama's 100% is the parent's box less the panel's margins (#AbilityImage: 100% with a 9px
  // margin is inset by 9px), which is CSS's stretch (the browsers' prefixed names first).
  if (v === '100%') return [[prop, '100%'], [prop, '-webkit-fill-available'], [prop, '-moz-available'], [prop, 'stretch'], ...reset, ...set(true)];
  const fit = /^fit-children$/i.test(v);
  return [[prop, fit ? 'auto' : v], ...reset, ...set(!fit)];
};
// Panorama's clip: radial(cx cy, start, sweep) — a pie slice, clockwise from the top.
export function radialClip(value) {
  const m = value.match(/radial\(\s*([-\d.]+)%\s+([-\d.]+)%\s*,\s*([-\d.]+)deg\s*,\s*([-\d.]+)deg\s*\)/i);
  if (!m) return 'none';
  const [cx, cy, start, sweep] = m.slice(1).map(Number);
  if (sweep >= 360) return 'none';
  const points = [`${cx}% ${cy}%`];
  for (let i = 0, steps = Math.max(1, Math.ceil(sweep / 10)); i <= steps; i++) {
    const a = ((start + (sweep * i) / steps) * Math.PI) / 180;
    points.push(`${round(cx + 150 * Math.sin(a))}% ${round(cy - 150 * Math.cos(a))}%`);
  }
  return `polygon(${points.join(', ')})`;
}
// Panorama's text-shadow/img-shadow: x y blur [strength] colour. The strength multiplies the shadow's
// alpha (a faint #ec780e24 at 3.7 is the level's orange glow); past 1 the shadow is drawn twice.
const withAlpha = (colour, k) => {
  const m = colour.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!m || k === 1 || (!m[2] && k > 1)) return colour;
  const alpha = Math.min(1, (m[2] ? parseInt(m[2], 16) / 255 : 1) * k);
  return `#${m[1]}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
};
function shadow(value, fn = '') {
  if (/^none$/i.test(value.trim())) return 'none';
  return splitTop(value).map((one) => {
    const tokens = one.split(/\s+(?![^(]*\))/), colour = tokens.find((token) => /^(#|rgb|[a-z])/i.test(token) && !/^-?[\d.]+(px)?$/.test(token)) || '#000';
    const [x = '0px', y = '0px', blur = '0px', strength] = tokens.filter((token) => token !== colour);
    const k = Number(strength) || 1, shade = withAlpha(colour, k);
    const one_ = fn ? `${fn}(${x} ${y} ${blur} ${shade})` : `${x} ${y} ${blur} ${shade}`;
    return Array(k > 1.5 ? 2 : 1).fill(one_).join(fn ? ' ' : ', ');
  }).join(fn ? ' ' : ', ');
}
// Panorama's box-shadow allows `fill` (the shadow is drawn under the panel too) and the colour first.
const boxShadow = (value) => splitTop(value).map((one) => one.replace(/\bfill\b/gi, '').trim()).join(', ');

// One Panorama declaration → browser declarations ([property, value] pairs; [] when dropped).
// ctx: { asset(path) → url | null, wash(colour) → filter reference }.
export function translateDecl(property, rawValue, ctx = {}) {
  const value = rawValue.replace(/\s*!important\s*$/i, '').trim(), asset = ctx.asset || (() => null);
  const p = property.toLowerCase();
  switch (p) {
    case 'width': return size(value, 'w');
    case 'height': return size(value, 'h');
    case 'flow-children': return [['--p-flow', value.toLowerCase()]];
    case 'horizontal-align': return [['--p-ha', ALIGN[value.toLowerCase()] || 'start']];
    case 'vertical-align': return [['--p-va', ALIGN[value.toLowerCase()] || 'start']];
    case 'align': { const [h, v] = value.toLowerCase().split(/\s+/); return [['--p-ha', ALIGN[h] || 'start'], ['--p-va', ALIGN[v] || 'start']]; }
    case 'ignore-parent-flow': return [['--p-ipf', /^true$/i.test(value) ? '1' : 'initial']];
    case 'visibility': return [['--p-vis', /^collapse$/i.test(value) ? 'none' : 'initial']];
    case 'x': return [['left', value]];
    case 'y': return [['top', value]];
    case 'position': { const [x = '0px', y = '0px'] = value.split(/\s+/); return [['left', x], ['top', y]]; }
    case 'ui-scale': return /%$/.test(value) ? [['zoom', `${num(value) / 100}`]] : [['zoom', value]];
    case 'overflow': {
      const [x, y = x] = value.toLowerCase().split(/\s+/), map = (v) => (v === 'clip' || v === 'scroll' ? 'clip' : 'visible');
      return [['overflow-x', map(x)], ['overflow-y', map(y)], ['--p-ov', `${x} ${y}`]];
    }
    case 'background-color': {
      const items = splitTop(value);
      if (items.length === 1 && !isGradient(items[0])) return [['background-color', colourOf(items[0])], ['--p-bgc', 'initial']];
      return [['background-color', 'transparent'], ['--p-bgc', items.map(layer).join(', ')]];
    }
    case 'background-image': {
      if (/^none$/i.test(value)) return [['--p-bgi', 'initial']];
      const items = splitTop(value).map((item) => (isGradient(item) ? gradient(item) : urls(item, asset)));
      return [['--p-bgi', items.join(', ')]];
    }
    case 'background-size': return [['background-size', value]];
    case 'background-position': return [['background-position', value.split(/\s+/).slice(0, 2).join(' ')]];
    case 'background-repeat': return [['background-repeat', value]];
    // The picture of the background only, faded (Valve's #QuickBuyRows: 0.5); scene.mjs's pass applies it.
    case 'background-img-opacity': return [['--p-bgo', `${Math.max(0, Math.min(1, num(value)))}`]];
    case 'opacity-mask': {
      if (/^none$/i.test(value)) return [['mask-image', 'none']];
      // The number after the picture is the mask's strength: the rest shows through (a flat layer adds it).
      const strength = Number(value.match(/\)\s*([\d.]+)\s*$/)?.[1] ?? 1), image = urls(value.replace(/\)\s*[\d.]+\s*$/, ')'), asset);
      const rest = strength < 1 ? `, linear-gradient(rgba(0, 0, 0, ${round(1 - strength)}), rgba(0, 0, 0, ${round(1 - strength)}))` : '';
      return [['mask-image', `${image}${rest}`], ['mask-size', '100% 100%'], ['mask-repeat', 'no-repeat']];
    }
    // A brush that paints the panel's own picture (Valve colours white SVG icons with it).
    case 'opacity-brush': return [['--p-brush', isGradient(value) ? gradient(value) : `linear-gradient(${value}, ${value})`]];
    case 'wash-color': return /^none$/i.test(value) ? [['--p-wash', 'initial']] : [['--p-wash', ctx.wash ? ctx.wash(value) : 'initial']];
    case 'brightness': return [['--p-bri', `brightness(${value})`]];
    case 'saturation': return [['--p-sat', `saturate(${value})`]];
    case 'contrast': return [['--p-con', `contrast(${value})`]];
    case 'hue-rotation': return [['--p-hue', `hue-rotate(${value})`]];
    case 'blur': { const m = value.match(/gaussian\s*\(\s*([\d.]+)/i); return [['--p-blur', m && num(m[1]) > 0 ? `blur(${round(num(m[1]) / 2)}px)` : 'initial']]; }
    case 'img-shadow': return [['--p-ish', shadow(value, 'drop-shadow')]];
    case 'opacity': return [['opacity', value]];
    case 'z-index': return [['z-index', `${Math.round(num(value)) || 0}`]];
    case 'transform': return [['transform', value]];
    case 'transform-origin': return [['transform-origin', value.split(/\s+/).slice(0, 2).join(' ')]];
    case 'pre-transform-scale2d': return [['scale', splitTop(value).join(' ')]];
    case 'pre-transform-rotate2d': return [['rotate', value]];
    case '-s2-mix-blend-mode': return [['mix-blend-mode', BLEND[value.toLowerCase()] || 'normal']];
    case 'box-shadow': return [['box-shadow', boxShadow(value)]];
    case 'text-shadow': return [['text-shadow', shadow(value)]];
    case 'color': return [['color', isGradient(value) ? firstColour(value) : colourOf(value)]];
    case 'font-family': return [['font-family', fontFamily(value)]];
    case 'font-weight': return [['font-weight', `${WEIGHTS[value.toLowerCase()] ?? (num(value) || 400)}`]];
    // Panorama draws text 1 px smaller than its font-size (measured on 1080p screenshots, 2026-10-02).
    case 'font-size': return [['font-size', /^[\d.]+px$/.test(value) ? `${Math.max(1, num(value) - 1)}px` : value]];
    case 'text-overflow': return [['text-overflow', /^ellipsis$/i.test(value) ? 'ellipsis' : 'clip'], ['--p-shrink', /^shrink$/i.test(value) ? '1' : '0']];
    case 'clip': return [['clip-path', radialClip(value)]];
    // A gradient brush for the border: its first colour.
    case 'border-brush': return isGradient(value) ? [['border-color', firstColour(value)]] : [];
    case 'margin': case 'margin-top': case 'margin-right': case 'margin-bottom': case 'margin-left':
    case 'padding': case 'padding-top': case 'padding-right': case 'padding-bottom': case 'padding-left':
    case 'min-width': case 'max-width': case 'min-height': case 'max-height':
    case 'border': case 'border-top': case 'border-right': case 'border-bottom': case 'border-left':
    case 'border-color': case 'border-width': case 'border-style': case 'border-top-color': case 'border-right-color': case 'border-bottom-color': case 'border-left-color':
    case 'border-top-width': case 'border-right-width': case 'border-bottom-width': case 'border-left-width': case 'border-bottom-style':
    case 'border-radius': case 'border-top-left-radius': case 'border-top-right-radius': case 'border-bottom-left-radius': case 'border-bottom-right-radius':
    case 'font-style': case 'letter-spacing': case 'line-height': case 'text-transform': case 'text-align': case 'text-decoration': case 'white-space':
      return [[p, value]];
    default: return [];
  }
}

// The custom properties the translation uses: not inherited, as Panorama's properties are not.
export const CUSTOM_PROPERTIES = ['--p-flow', '--p-ov', '--p-ws', '--p-shrink', '--p-brush', '--p-ha', '--p-va', '--p-ipf', '--p-vis', '--p-fgw', '--p-fbw', '--p-fgh', '--p-fbh', '--p-arw', '--p-arh',
  '--p-bgc', '--p-bgi', '--p-bgo', '--p-wash', '--p-bri', '--p-sat', '--p-con', '--p-hue', '--p-blur', '--p-ish'];

// A whole stylesheet → browser CSS. `prefix` scopes it under the scene's root, `scope` limits the
// subjects to one layout's panels (scene.mjs).
export function translateStyles(parsed, { prefix = '', scope = '', ...ctx } = {}) {
  const out = [];
  for (const { selector, decls } of parsed.rules) {
    const selectors = splitTop(selector).map((one) => `${prefix}${translateSelector(one, scope)}`);
    const body = decls.flatMap(([property, value]) => translateDecl(property, value, ctx)).map(([property, value]) => `${property}: ${value};`);
    if (body.length) out.push(`${selectors.join(',\n')} { ${body.join(' ')} }`);
  }
  return out.join('\n');
}
