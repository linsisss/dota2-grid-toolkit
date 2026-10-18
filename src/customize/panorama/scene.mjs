// A Panorama layout as browser elements (the HUD preview, 2026-10-16). Every panel is a custom element
// named after its type (<pa-dotahud id="…" class="…">) so Valve's selectors work as they are; the
// stylesheets are translated by css.mjs and kept in the browser's cascade. Panorama's layout model is
// mapped onto CSS like this:
// - a panel without flow-children is a one-cell grid: its children stack at 0,0 and are placed by
//   horizontal-align / vertical-align (justify-self / align-self) and their margins; fit-children is the
//   grid's auto size;
// - flow-children down/right/up/left are flex columns/rows (cross-axis align from the children's aligns,
//   fill-parent-flow(n) = flex-grow n from a zero basis);
// - the parent's flow is the cascade's (--p-flow), so a small pass reads it and marks every panel
//   (data-flow) for the static rules below — once after the styles change;
// - overflow: squish (Panorama's default) caps the children at the panel's size (max-* stretch), in a
//   flow they shrink;
// - every panel is a stacking context (isolation), as Panorama's z-index orders siblings only;
// - ui-scale is CSS zoom (the layout shrinks too, as in Panorama); wash-color is an SVG colour matrix
//   (washMatrix); visibility: collapse is display: none.
// Custom panels of Dota's C++ (DOTAAbilityPanel, DOTAInventory…) load the layout file they load in the
// game; what C++ fills in (ability icons, numbers) comes from the caller's hooks.
import { readLayout, sourcePath } from './xml.mjs';
import { CUSTOM_PROPERTIES, FONT, parseStyles, tagOf, texturePath, translateStyles } from './css.mjs';

export const SCREEN = { width: 1920, height: 1080 };
const ROOT = '.pano';
// A transparent pixel, for fading a background picture (background-img-opacity).
const CLEAR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==';
// Panorama's Image scaling → object-fit.
const FIT = { none: 'none', stretch: 'fill', 'stretch-x': 'fill', 'stretch-y': 'fill', 'stretch-to-fit-preserve-aspect': 'contain', 'stretch-to-fit-x-preserve-aspect': 'contain', 'stretch-to-fit-y-preserve-aspect': 'contain', 'stretch-to-cover-preserve-aspect': 'cover' };

export const STATIC_CSS = `${CUSTOM_PROPERTIES.map((name) => `@property ${name} { syntax: '*'; inherits: false; }`).join('\n')}
${ROOT} { position: absolute; left: 0; top: 0; width: ${SCREEN.width}px; height: ${SCREEN.height}px; overflow: hidden; display: grid; grid-template: 100% / 100%; transform-origin: 0 0;
  font-family: ${FONT}; font-size: 18px; font-weight: 400; font-synthesis: none; -webkit-text-stroke: 0.3px currentColor; color: #fff; line-height: normal; letter-spacing: normal; text-align: left; white-space: normal; -webkit-font-smoothing: antialiased; }
${ROOT} * { box-sizing: border-box; position: relative; isolation: isolate; display: var(--p-vis, grid); grid-template: 100% / 100%; min-width: 0; min-height: 0; flex-shrink: 0; margin: 0; padding: 0;
  background-image: var(--p-bgi, none), var(--p-bgc, none); background-size: 100% 100%; background-repeat: no-repeat; background-position: 0 0;
  aspect-ratio: var(--p-arw, var(--p-arh, auto)); filter: var(--p-wash,) var(--p-bri,) var(--p-sat,) var(--p-con,) var(--p-hue,) var(--p-blur,) var(--p-ish,); }
${ROOT} :is([data-flow^=down], [data-flow^=up], [data-flow^=right], [data-flow^=left]) { display: var(--p-vis, flex); }
${ROOT} [data-flow^=down] { flex-direction: column; } ${ROOT} [data-flow^=up] { flex-direction: column-reverse; }
${ROOT} [data-flow^=right] { flex-direction: row; } ${ROOT} [data-flow^=left] { flex-direction: row-reverse; }
${ROOT} [data-flow$=wrap] { flex-wrap: wrap; }
${ROOT} [data-flow=none] > * { grid-area: 1 / 1; justify-self: var(--p-ha, start); align-self: var(--p-va, start); }
${ROOT} :is([data-flow^=down], [data-flow^=up]) > * { align-self: var(--p-ha, start); flex-grow: var(--p-fgh, 0); flex-basis: var(--p-fbh, auto); }
${ROOT} :is([data-flow^=right], [data-flow^=left]) > * { align-self: var(--p-va, start); flex-grow: var(--p-fgw, 0); flex-basis: var(--p-fbw, auto); }
${ROOT} [data-sqx] > * { max-width: -webkit-fill-available; max-width: -moz-available; max-width: stretch; }
${ROOT} [data-sqy] > * { max-height: -webkit-fill-available; max-height: -moz-available; max-height: stretch; }
${ROOT} :is([data-flow^=right], [data-flow^=left])[data-sqx] > *, ${ROOT} :is([data-flow^=down], [data-flow^=up])[data-sqy] > * { flex-shrink: 1; }
${ROOT} [data-flow] > [data-ipf] { position: absolute; left: 0; top: 0; max-width: none; max-height: none; }
${ROOT} [data-flow] > [data-ipf][data-ha=center] { left: 50%; translate: -50% 0; } ${ROOT} [data-flow] > [data-ipf][data-ha=end] { left: auto; right: 0; }
${ROOT} [data-flow] > [data-ipf][data-va=center] { top: 50%; translate: 0 -50%; } ${ROOT} [data-flow] > [data-ipf][data-va=end] { top: auto; bottom: 0; }
${ROOT} pa-label { display: var(--p-vis, block); overflow-wrap: break-word; }
${ROOT} pa-label[data-nowrap] { white-space: nowrap; }
${ROOT} pa-label * { display: var(--p-vis, inline); vertical-align: middle; }
${ROOT} img.pa-shot { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; z-index: 20; display: block; filter: none; background: none; pointer-events: none; }
${ROOT} img.pa-img { display: block; width: 100%; height: 100%; grid-area: 1 / 1; filter: none; background: none; }`;

// Panorama's wash-color as a colour matrix: the panel and its children multiplied by the colour, as
// much as its alpha says (#ffffff is no change, as Valve's own styles rest on it). The in-game blend is
// not documented; this is the closest guess that keeps the pictures' detail. Alpha is untouched.
export function washMatrix(colour) {
  const hex = parseColour(colour);
  if (!hex) return null;
  const [r, g, b, a] = hex, k = (c) => +(1 - a + a * c).toFixed(4);
  return `${k(r)} 0 0 0 0  0 ${k(g)} 0 0 0  0 0 ${k(b)} 0 0  0 0 0 1 0`;
}
export function parseColour(colour) {
  const value = colour.trim().toLowerCase();
  let m;
  if ((m = value.match(/^#([0-9a-f]{3,8})$/))) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
  }
  if ((m = value.match(/^rgba?\(([^)]*)\)$/))) { const [r, g, b, a = 1] = m[1].split(/[\s,]+/).map(Number); return [r / 255, g / 255, b / 255, a]; }
  const named = { white: [1, 1, 1, 1], black: [0, 0, 0, 1], red: [1, 0, 0, 1], transparent: [0, 0, 0, 0] };
  return named[value] || null;
}

// The scene: { element, setStyles(extra), relayout() }.
// options: sources ({ 'panorama/layout/…xml': text, 'panorama/styles/…css': text }), root (layout path),
// layouts ({ DOTAType: layout path }), asset(path) → URL | null, text(raw, el) → string, fill(el, node, api).
export function createScene({ sources, root, layouts = {}, asset = () => null, text = (raw) => raw, fill = () => {}, extra = {}, head = '' }) {
  const doc = globalThis.document;
  const cache = new Map(), order = [], scopes = new Map();
  const load = (path) => { if (!cache.has(path)) cache.set(path, sources[path] ? readLayout(sources[path]) : null); return cache.get(path); };
  // Stylesheets in the order the game meets them; the root layout's apply everywhere, a child layout's
  // only to its own panels (data-ss on the panel that loaded it).
  const addStyles = (paths, global) => {
    const tokens = [];
    for (const path of paths) {
      const imported = (sources[path] || '').match(/@import\s+url\(\s*["']?([^"')]+)["']?\s*\)/g) || [];
      for (const line of imported) { const src = sourcePath(line.match(/url\(\s*["']?([^"')]+)/)[1]); if (sources[src] && !scopes.has(src)) { order.push(src); scopes.set(src, global ? '' : `s${scopes.size}`); } }
      if (!scopes.has(path)) { order.push(path); scopes.set(path, global ? '' : `s${scopes.size}`); }
      if (scopes.get(path)) tokens.push(scopes.get(path));
    }
    return tokens;
  };
  const api = { build: (node, file) => build(node, file), image, asset, doc };
  function image(el, src, scaling) {
    const url = src && asset(texturePath(src));
    el.querySelector(':scope > img.pa-img')?.remove();
    if (!url) return;
    const img = doc.createElement('img');
    img.className = 'pa-img'; img.alt = ''; img.decoding = 'async'; img.src = url; img.style.objectFit = FIT[scaling] || 'contain';
    el.prepend(img);
  }
  function build(node, file) {
    const el = doc.createElement(tagOf(node.type));
    const attrs = { ...node.attrs };
    let children = node.children;
    const childFile = layouts[node.type];
    if (childFile && childFile !== file) {
      const loaded = load(childFile);
      if (loaded) {
        const tokens = addStyles(loaded.styles, false);
        if (tokens.length) el.dataset.ss = tokens.join(' ');
        attrs.class = [loaded.panel.attrs.class, attrs.class].filter(Boolean).join(' ');
        children = [...loaded.panel.children, ...children];
        file = childFile;
      }
    }
    if (attrs.id) el.id = attrs.id;
    if (attrs.class) el.className = attrs.class.trim().split(/\s+/).join(' ');
    el.paNode = { ...node, attrs, file };
    if (attrs.text !== undefined) el.textContent = text(attrs.text, el);
    if (attrs.src && /Image$/i.test(node.type)) image(el, attrs.src, attrs.scaling);
    for (const child of children) el.append(build(child, file));
    fill(el, el.paNode, api);
    return el;
  }

  const top = load(root);
  addStyles(top.styles, true);
  const element = doc.createElement('div');
  element.className = 'pano';
  element.dataset.flow = 'none';
  // One <style> per stylesheet, so a change of our rules re-parses only its own file.
  const sheets = doc.createElement('div'), sheet = new Map(), filters = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  filters.setAttribute('class', 'pa-filters'); filters.setAttribute('aria-hidden', 'true');
  sheets.style.display = 'none'; filters.style.cssText = 'position: absolute; width: 0; height: 0; overflow: hidden;';
  element.append(sheets, filters, build(top.panel, root));

  const washes = new Map();
  const wash = (colour) => {
    const key = colour.trim().toLowerCase();
    if (!washes.has(key)) {
      const matrix = washMatrix(key);
      if (!matrix) return 'initial';
      const id = `pa-wash-${washes.size}`, filter = doc.createElementNS('http://www.w3.org/2000/svg', 'filter');
      filter.id = id; filter.setAttribute('color-interpolation-filters', 'sRGB');
      filter.innerHTML = `<feColorMatrix type="matrix" values="${matrix}"/>`;
      filters.append(filter); washes.set(key, `url(#${id})`);
    }
    return washes.get(key);
  };
  // Valve's styles, each translated once; `extra[path]` (our rules) follows the file it belongs to.
  // (a file's @define constants are kept with it, so a cached file still gives them to the next ones).
  const translated = new Map();
  const css = (path, defines, more = '') => {
    const scope = scopes.get(path) ? `:where([data-ss~="${scopes.get(path)}"], [data-ss~="${scopes.get(path)}"] *)` : '';
    const key = `${path}\n${more}`;
    if (!translated.has(key)) {
      const own = new Map(defines), parsed = parseStyles(`${sources[path] || ''}\n${more}`, own);
      translated.set(key, { text: translateStyles(parsed, { prefix: `${ROOT} `, scope, asset, wash }), defines: [...own].filter(([name, value]) => defines.get(name) !== value) });
    }
    const { text: out, defines: added } = translated.get(key);
    for (const [name, value] of added) defines.set(name, value);
    return out;
  };
  function setStyles(more = extra) {
    const defines = new Map();
    for (const [path, text] of [['', `${head}\n${STATIC_CSS}`], ...order.map((path) => [path, css(path, defines, more[path])])]) {
      if (!sheet.has(path)) { const style = doc.createElement('style'); style.dataset.source = path || 'static'; sheets.append(style); sheet.set(path, style); }
      if (sheet.get(path).textContent !== text) sheet.get(path).textContent = text;
    }
    relayout();
  }
  // The pass that tells every panel its own flow (and the ignore-parent-flow ones their aligns).
  function relayout() {
    const view = doc.defaultView, shrink = [], brushed = [];
    for (const el of element.querySelectorAll('*')) {
      if (!el.tagName.startsWith('PA-')) continue;
      const computed = view.getComputedStyle(el);
      const flow = computed.getPropertyValue('--p-flow').trim() || 'none';
      if (el.dataset.flow !== flow) el.dataset.flow = flow;
      // Panorama's default overflow, squish, shrinks children to the panel; noclip and clip let them out.
      const [x = 'squish', y = x] = (computed.getPropertyValue('--p-ov').trim() || 'squish').split(/\s+/);
      el.toggleAttribute('data-sqx', x === 'squish'); el.toggleAttribute('data-sqy', y === 'squish');
      // A label wraps only in a width it is given; a fit-children one grows with its text.
      if (el.tagName === 'PA-LABEL') {
        el.toggleAttribute('data-nowrap', computed.getPropertyValue('--p-ws').trim() !== '1');
        // Panorama's labels shrink to their box unless told to clip (text-overflow: shrink is the default: the
        // gold's 22 px «99999» is drawn at 18.5 px in the game).
        if (computed.getPropertyValue('--p-shrink').trim() !== '0') shrink.push(el);
      }
      if (computed.getPropertyValue('--p-brush').trim()) brushed.push(el);
      // background-img-opacity: the background's pictures cross-faded with nothing (the colour layer stays).
      const fade = computed.getPropertyValue('--p-bgo').trim();
      el.style.backgroundImage = '';
      if (fade && Number(fade) < 1) {
        const images = view.getComputedStyle(el).backgroundImage;
        if (images.includes('url(')) el.style.backgroundImage = images.replace(/url\("[^"]*"\)/g, (url) => `-webkit-cross-fade(${url}, url("${CLEAR}"), ${Math.round((1 - Number(fade)) * 100)}%)`);
      }
      if (computed.getPropertyValue('--p-ipf').trim() === '1') {
        el.dataset.ipf = ''; el.dataset.ha = computed.getPropertyValue('--p-ha').trim() || 'start'; el.dataset.va = computed.getPropertyValue('--p-va').trim() || 'start';
      } else if ('ipf' in el.dataset) { delete el.dataset.ipf; delete el.dataset.ha; delete el.dataset.va; }
    }
    // text-overflow: shrink — the text gets smaller until it fits its label.
    for (const el of shrink) {
      el.style.fontSize = '';
      // Radiance's own line gap is tall; Panorama fits the glyphs, so a tighter line is measured.
      if (view.getComputedStyle(el).lineHeight === 'normal') el.style.lineHeight = '1.2';
      el.style.letterSpacing = '';
      // The letter-spacing shrinks with the text (the unit's name under the tier frame).
      const start = parseFloat(view.getComputedStyle(el).fontSize), spacing = parseFloat(view.getComputedStyle(el).letterSpacing) || 0;
      let size = start;
      // The text's own box: a right-aligned text overflows to the left, where scrollWidth does not see it
      // (measured against the label's box on screen: both are zoomed by a ui-scale).
      const range = doc.createRange(), textWidth = () => { range.selectNodeContents(el); return range.getBoundingClientRect().width; };
      for (let step = 0; step < 12 && size > 6 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 || textWidth() > el.getBoundingClientRect().width + 1); step++) {
        size *= 0.94; el.style.fontSize = `${size}px`;
        if (spacing) el.style.letterSpacing = `${(spacing * size) / start}px`;
      }
    }
    // opacity-brush: the panel's picture keeps its shape and takes the brush's colours.
    for (const el of brushed) {
      const img = el.querySelector(':scope > img.pa-img'), brush = view.getComputedStyle(el).getPropertyValue('--p-brush').trim();
      if (!img) continue;
      Object.assign(el.style, { maskImage: `url("${img.src}")`, maskSize: img.style.objectFit === 'fill' ? '100% 100%' : 'contain', maskPosition: 'center', maskRepeat: 'no-repeat', backgroundImage: brush });
      img.style.visibility = 'hidden';
    }
  }
  return { element, setStyles, relayout, image, styles: () => order.slice() };
}
