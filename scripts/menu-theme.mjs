// «Тема интерфейса» (2026-10-31, the owner on d2pfx's «Material You Interface»: «возьмем но доработаем»): the
// menu's colours in the spirit of Material You, from any accent colour, made of Valve's own current
// stylesheets. d2pfx's mod (by Swin-РукаBlood) replaces ~1600 of Valve's layouts to include its sheet and runs
// a script for the accent: it goes stale with every Dota update and loses to our menu pack on shared layouts.
// Here only stylesheets change: each of Valve's is given back with its colours moved onto the accent's
// palettes (no layouts, no scripts), made fresh from Valve's files whenever the theme is built.
//
// The colour rule, in OKLCH (perceptual lightness L, chroma C, hue H):
// - greys and near-greys (C < NEUTRAL_C) take the accent's hue at a low chroma — the «neutral» palette, at
//   their own lightness (surfaces stay as dark or light as Valve made them);
// - colours take the accent's hue at a chroma scaled from their own (capped), again at their own lightness —
//   the «primary» palette; a colour far from the accent in hue but strong keeps a little of its own hue (a
//   tertiary-like shift), so a menu does not turn one flat colour;
// - colours that mean something stay: the players' and teams' colours, rarities, ranks and the like (their
//   @define lines), and the win green and loss red (kept, only pulled 25 % towards the accent's hue).
export const THEME_LIMITS = Object.freeze({ neutralChroma: 0.035, primaryChroma: 0.17, minChroma: 0.06 });
// Valve's stylesheets the theme gives back: everything but the match HUD's (hud/…) and the ones that draw
// heroes', players' or items' own colours.
export const themeFile = (path) => /^[a-z0-9_/]+\.css$/.test(path) && !/^(?:hud\/|dota_hud|custom_game|hero_colors|chat_colors)/.test(path);
// @define names whose colours keep their meaning.
const MEANING = /player|team|radiant|dire|rarity|quality|tier|rank|medal|plus|immortal|arcana|legendary|mythical|rare|uncommon|common|ancient|win|loss|victory|defeat|health|mana|xp|gold/i;

// ——— Colour maths: sRGB ↔ OKLab (Björn Ottosson's), and OKLCH.
const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
export function oklch(r, g, b) {
  const [R, G, B] = [r, g, b].map((v) => toLinear(v / 255));
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(a, bb), (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360];
}
function fromOklab(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
// OKLCH → sRGB bytes, the chroma lowered until the colour fits sRGB (the hue and lightness kept).
export function fromOklch(L, C, H) {
  const h = H * Math.PI / 180;
  let low = 0, high = C, rgb = fromOklab(L, C * Math.cos(h), C * Math.sin(h));
  const inside = (c) => c.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  if (!inside(rgb)) {
    for (let i = 0; i < 18; i++) { const mid = (low + high) / 2, try_ = fromOklab(L, mid * Math.cos(h), mid * Math.sin(h)); if (inside(try_)) { low = mid; rgb = try_; } else high = mid; }
    rgb = fromOklab(L, low * Math.cos(h), low * Math.sin(h));
  }
  return rgb.map((v) => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, v))))) * 255));
}
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const mixHue = (from, to, share) => { let d = ((to - from + 540) % 360) - 180; return (from + d * share + 360) % 360; };

// The accent (#rrggbb) → a function from Valve's colour [r, g, b] to the theme's.
export function themePalette(accent) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(accent));
  if (!m) throw new Error('Акцент — цвет вида #rrggbb.');
  const [, seedC, seedH] = oklch(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16));
  const { neutralChroma, primaryChroma, minChroma } = THEME_LIMITS;
  const accentC = Math.min(primaryChroma, Math.max(minChroma, seedC));
  return (r, g, b, { keep = false } = {}) => {
    const [L, C, H] = oklch(r, g, b);
    if (keep) return [r, g, b];
    if (C < neutralChroma) return fromOklch(L, Math.min(0.02, accentC * 0.18) * Math.min(1, L * 4), seedH);
    // The win green and the loss red keep what they say, pulled a quarter towards the accent.
    if (C > 0.1 && ((H > 120 && H < 160) || H < 35 || H > 350)) return fromOklch(L, C, mixHue(H, seedH, 0.25));
    const far = hueGap(H, seedH) > 90 && C > 0.12;
    return fromOklch(L, Math.min(accentC * 1.15, Math.max(minChroma, C * (accentC / 0.12))), far ? mixHue(seedH, H, 0.3) : seedH);
  };
}

// ——— A stylesheet's colours → the theme's: hex (#rgb, #rgba, #rrggbb, #rrggbbaa) and rgb()/rgba(); alpha kept.
const hex2 = (n) => n.toString(16).padStart(2, '0');
export function themeStyle(text, map) {
  let changed = 0;
  const recolor = (r, g, b, keep) => { const out = map(r, g, b, { keep }); if (out[0] !== r || out[1] !== g || out[2] !== b) changed++; return out; };
  const lines = text.split('\n').map((line) => {
    const keep = /^\s*@define\s+([\w-]+)/.exec(line) && MEANING.test(/^\s*@define\s+([\w-]+)/.exec(line)[1]);
    return line.replace(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g, (whole, digits) => {
      const full = digits.length <= 4 ? [...digits].map((d) => d + d).join('') : digits;
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)), alpha = full.length === 8 ? full.slice(6) : '';
      const [R, G, B] = recolor(r, g, b, keep);
      return `#${hex2(R)}${hex2(G)}${hex2(B)}${alpha}`;
    }).replace(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(,\s*[\d.]+\s*)?\)/g, (whole, r, g, b, a) => {
      const [R, G, B] = recolor(Number(r), Number(g), Number(b), keep);
      return a ? `rgba( ${R}, ${G}, ${B}${a.replace(/\s+/g, ' ')})` : `rgb( ${R}, ${G}, ${B} )`;
    });
  });
  return { text: lines.join('\n'), changed };
}

// The theme's roles (Material 3 names) from the accent, for our own rules below: dark surfaces with the
// accent's hue, light accent for what is pressed and chosen.
export function themeRoles(accent) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(accent));
  if (!m) throw new Error('Акцент — цвет вида #rrggbb.');
  const [, seedC, h] = oklch(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)), c = Math.min(THEME_LIMITS.primaryChroma, Math.max(THEME_LIMITS.minChroma, seedC));
  const hex = (L, C) => `#${fromOklch(L, C, h).map(hex2).join('')}`;
  return { surface: hex(0.17, 0.014), surfaceHigh: hex(0.23, 0.02), outline: hex(0.42, 0.03), onSurface: hex(0.93, 0.012), onSurfaceVariant: hex(0.76, 0.025),
    primary: hex(0.8, c * 0.8), onPrimary: hex(0.26, c * 0.55), primaryContainer: hex(0.36, c * 0.75), onPrimaryContainer: hex(0.92, c * 0.3), logo: logoTurn(h, seedC) };
}
// The simple Dota logo in the accent (2026-11-02, the owner: «логотип доты можем красить в тему?»): a picture, so
// it is turned with Panorama's `hue-rotation` (Valve's own property, 554 uses) and `saturation`, keeping its drawing.
// The turn is the one that brings the logo's red closest to the accent's hue, by the matrix CSS's hue-rotate and
// Panorama use (rotation about the grey axis, luminance kept); a grey accent makes a grey logo.
const LOGO_RED = [200, 55, 42];
function hueRotate([r, g, b], degrees) {
  const a = degrees * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  const m = [0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.140, 0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072];
  const clamp = (v) => Math.min(255, Math.max(0, Math.round(v)));
  return [clamp(m[0] * r + m[1] * g + m[2] * b), clamp(m[3] * r + m[4] * g + m[5] * b), clamp(m[6] * r + m[7] * g + m[8] * b)];
}
export function logoTurn(hue, chroma) {
  let best = 0, gap = Infinity;
  for (let degrees = 0; degrees < 360; degrees++) {
    const [, , h] = oklch(...hueRotate(LOGO_RED, degrees)), d = Math.abs(((h - hue + 540) % 360) - 180);
    if (d < gap) { gap = d; best = degrees; }
  }
  const [, logoChroma] = oklch(...LOGO_RED);
  return { rotate: best > 180 ? best - 360 : best, saturation: +Math.min(1, Math.max(0.12, chroma / logoChroma)).toFixed(2) };
}
// The top bar's flat ground and the simple Dota logo (the first part of dashboard.css's rules).
const TOP_BAR_GROUND = (r) => `#TopBarBackground
{
	background-image: none;
	background-color: ${r.surface};
	height: 64px;
	border-bottom: 1px solid ${r.outline}66;
}

#TopBarBackground #TopBarDefaultBackground,
#TopBarBackground #TopBarPlusBackground,
#TopBarBackground #TopBarArmoryBackground,
#TopBarBackground .TopBarRightBackground
{
	background-image: none;
	background-color: transparent;
}

#HomeButtonMap
{
	visibility: collapse;
}

#SimpleDotaLogo
{
	opacity: 1;
	hue-rotation: ${r.logo.rotate}deg;
	saturation: ${r.logo.saturation};
}

`;
// Our rules, each at the end of the Valve stylesheet whose layout draws those panels (styles reach only the
// panels of the layout that includes them). By the look of d2pfx's «Material You Interface» (Swin-РукаBlood):
// a flat top bar with the simple Dota logo, light tab names with the accent under the chosen one, a pill «Играть»,
// rounded news cards.
// `topbar`: false (a d2pfx top bar is chosen, 2026-11-01) leaves the bar's ground and the Dota logo to it: its
// pictures are the bar's background-images, which the flat ground would take away; the tabs' colours stay ours.
export function themeRules(roles, { topbar = true } = {}) {
  const r = roles;
  return {
    'dashboard.css': `${topbar ? TOP_BAR_GROUND(r) : ''}.TopBarMenuItem Label
{
	color: ${r.onSurfaceVariant};
	text-shadow: none;
}

.TopBarMenuItem:hover Label,
.TopBarMenuItem:selected Label
{
	color: ${r.onSurface};
}

.TopBarMenuItem:selected
{
	border-bottom: 3px solid ${r.primary};
}

#DOTAQuitButton
{
	wash-color: ${r.primary};
}

#DOTAQuitButton:hover
{
	wash-color: ${r.onPrimaryContainer};
}
`,
    'play.css': `.PlayButton
{
	background-image: none;
	background-color: ${r.primary};
	border: 0px;
	border-radius: 24px;
	box-shadow: 0px 6px 18px 0px ${r.primary}44;
}

.PlayButton Label
{
	color: ${r.onPrimary};
	text-shadow: none;
}
`,
    'frontpage_shared.css': `.FrontpageCell
{
	border-radius: 16px;
}
`,
    // Shared by nearly every layout: the controls everywhere — tonal pill buttons of the dialogs (their green, blue and
    // red kinds keep their colour: `.PopupButton.Green` is more precise), rounded fields and lists, thin thumbs.
    'dotastyles.css': `.PopupButton
{
	background-color: ${r.primaryContainer};
	border-radius: 20px;
}

TextEntry,
DropDown,
DOTASettingsEnumDropDown,
.ButtonBevel,
.ButtonDark
{
	border-radius: 8px;
}

VerticalScrollBar .ScrollThumb,
HTMLVerticalScrollBar .ScrollThumb,
HorizontalScrollBar .ScrollThumb,
HTMLHorizontalScrollBar .ScrollThumb
{
	background-color: ${r.outline};
	border-radius: 4px;
}
`,
    // The dialogs that include Valve's base sheet instead of dotastyles (the generic popup: «Выход», confirmations; the
    // in-game check 2026-11-02 found «Выход» with Valve's grey bevelled buttons): the same tonal pills, and the dialog
    // itself a rounded surface.
    'gamestyles.css': `.PopupButton,
.PopupButton:active
{
	background-color: ${r.primaryContainer};
	border: 1px solid transparent;
	border-radius: 20px;
}

.PopupButton:enabled:hover
{
	background-color: ${r.primary};
}

.PopupButton:enabled:hover Label
{
	color: ${r.onPrimary};
}
`,
    'popups/popups_shared.css': `.PopupPanel
{
	background-color: ${r.surface}f2;
	border: 1px solid ${r.outline}88;
	border-radius: 16px;
}
`,
    // Settings: the chosen section and tab as the accent's tonal pill.
    'popups/popup_settings_reborn.css': `#SettingsNavigationContainer .SettingsNavigationButton
{
	border-radius: 20px;
}

#SettingsNavigationContainer .SettingsNavigationButton:selected,
#SettingsNavigationContainer .SettingsNavigationButton:hover:selected
{
	background-color: ${r.primaryContainer};
	border: 1px solid transparent;
}

.SettingsTabButton:selected
{
	background-color: ${r.primaryContainer};
	border: 1px solid ${r.primary};
}
`
  };
}
// The panels whose pictures the theme takes away (a flat ground instead), by stylesheet. Valve gives them their
// pictures under many more precise selectors (`.HighResTopBar #TopBarBackground.TopBarHome` …), which a plain
// `#TopBarBackground { background-image: none; }` loses to (the second test, 2026-10-31: the top bar kept its
// picture, «Играть» its lines): so each of Valve's rules that sets such a picture is answered by the same selectors.
const FLAT = {
  'dashboard.css': /#TopBarBackground|#TopBarDefaultBackground|#TopBarArmoryBackground|#TopBarPlusBackground|\.TopBarRightBackground/,
  'play.css': /\.PlayButton\b|#PlayButton\b/,
  // The dialogs' buttons («Принять», «Отмена» …) wear the play button's lines too.
  'dotastyles.css': /\.PopupButton\b/
};
export function flatRules(path, valveText, { topbar = true } = {}) {
  const test = FLAT[path];
  if (!test || (path === 'dashboard.css' && !topbar)) return '';
  const lists = new Set();
  for (const [, selectors, body] of valveText.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const list = selectors.trim().replace(/\s+/g, ' ');
    if (test.test(list) && /background-image\s*:/.test(body) && !/:hover|:active/.test(list)) lists.add(list);
  }
  return [...lists].map((list) => `${list.split(',').map((one) => one.trim()).join(',\n')}\n{\n\tbackground-image: none;\n}\n`).join('\n');
}
// One of Valve's stylesheets as the theme gives it back: its colours moved (themeStyle) and our rules after them.
// `map`, `rules`: the accent's palette and rules, when the caller makes many (themeFiles).
export const themeText = (path, valveText, accent, options) => themed(path, valveText, accent, options).text;
// → { text, changed }: `changed` counts the colours moved and our rules (0: Valve's file would do).
function themed(path, valveText, accent, { topbar = true, map = themePalette(accent), rules = themeRules(themeRoles(accent), { topbar }) } = {}) {
  const valve = valveText.replace(/^\/\*[^\n]*\*\/\r?\n/, ''), { text: body, changed } = themeStyle(valve, map);
  const extra = [flatRules(path, valve, { topbar }), rules[path] || ''].filter(Boolean).join('\n');
  return extra ? { text: `${body.trimEnd()}\n\n/* GridStudio: the theme's own rules. */\n${extra}`, changed: changed + 1 } : { text: body, changed };
}

// ——— The theme in a pack (2026-11-01). Each of its stylesheets starts with the mark: the accent and the version of
// Valve's styles it was made from (server/dota-styles.mjs), «no-topbar» when the top bar is left to d2pfx. The
// server takes a Valve stylesheet into a pack only with it (server/install-packs.mjs).
export const THEME_MARK = /^\/\* GridStudio theme (#[0-9a-f]{6}) ([0-9a-f]{7,40})( no-topbar)? \*\/\n/;
export const themeMark = (accent, version, { topbar = true } = {}) => `/* GridStudio theme ${accent.toLowerCase()} ${version}${topbar ? '' : ' no-topbar'} */\n`;
export const THEME_ACCENT = /^#[0-9a-f]{6}$/i;
// Valve's stylesheet `rel` (as in panorama/styles: 'play.css', 'popups/x.css') ↔ its file in a pack.
export const themeStylePath = (rel) => `panorama/styles/${rel.replace(/\.css$/, '.vcss_c')}`;
export function themeStyleRel(path) {
  const m = /^panorama\/styles\/([a-z0-9_/]+)\.vcss_c$/.exec(path), rel = m && `${m[1]}.css`;
  return rel && themeFile(rel) && rel !== THEME_SKIP ? rel : null;
}
// custom_ui.css is the HUD's hook, the match pack's own (scripts/hud-style.mjs).
const THEME_SKIP = 'custom_ui.css';
// The theme for one accent from Valve's current stylesheets (styles: { 'play.css': text, … }, as
// server/dota-styles.mjs hands them; `version` theirs) → { [pack path]: text }: every stylesheet whose colours
// move or that carries our rules (a text Dota would not read, not ASCII, is left as Valve's). `drop`: pack paths
// another pack keeps (a chosen d2pfx mod's own stylesheet stays whole: our pak02 would win over its pak04);
// `topbar`: false leaves the top bar to a chosen d2pfx top bar.
export function themeFiles(styles, accent, { version, drop = [], topbar = true } = {}) {
  if (!THEME_ACCENT.test(accent)) throw new Error('Акцент — цвет вида #rrggbb.');
  if (!/^[0-9a-f]{7,40}$/.test(version || '')) throw new Error('Нет версии стилей Dota.');
  const map = themePalette(accent), rules = themeRules(themeRoles(accent), { topbar }), mark = themeMark(accent, version, { topbar }), skip = new Set(drop), out = {};
  for (const [rel, valve] of Object.entries(styles)) {
    const path = themeStylePath(rel);
    if (!themeStyleRel(path) || skip.has(path)) continue;
    const { text, changed } = themed(rel, valve.replace(/\r\n/g, '\n'), accent, { topbar, map, rules });
    if (!changed || /[^\x00-\x7f]/.test(text)) continue;
    out[path] = mark + text;
  }
  return out;
}
