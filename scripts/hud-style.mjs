// «Вид HUD» — the interface builder's first module of its own (2026-10-16). The in-game test of that day
// (scripts/make-interface-test.mjs) showed that Valve's small panorama/styles/custom_ui.css, given back as
// Valve's text plus our rules, reaches the whole match HUD — the top bar, the minimap, the lower panel,
// the abilities and the inventory from their own layouts, the shop and the chat. So the HUD is restyled
// by that one file, which has not changed for a year (check-dota-menu.mjs watches it), in its own
// pak03_dir.vpk: the background's pack (pak02) does not touch it.
// hud_reborn.xml includes custom_ui.css before the ability panel's and the inventory's styles, so every
// rule is under `DOTAHud #HUDElements` (a type and an id more than Valve's own selectors) to win over
// them. Which panels are plain backgrounds and decorations — after Egezenn's Minify («Transparent HUD»,
// GPL-3.0); the rules are ours. Nothing here gives an advantage: the lower HUD with the minimap only
// shrinks, never grows past Valve's size.
export const HUD_STYLE = 'panorama/styles/custom_ui.vcss_c';
const ROOT = 'DOTAHud #HUDElements';
// The HUD's own background panels: empty panels with Valve's pictures, so fading or tinting them leaves
// the icons, the numbers and the minimap itself alone.
const BACKDROPS = ['#center_bg', '#HUDSkinMinimap', '#HUDSkinPortrait', '#HUDSkinXPBackground', '#HUDSkinStatBranchBG'];
export const HUD_HIDE = Object.freeze({
  flares: ['#left_flare', '#right_flare'],
  statue: ['DOTAHeroStatue.Visible'],
  shadows: ['.AbilityInsetShadowLeft', '.AbilityInsetShadowRight', '#AbilityBevel'],
  teamItems: ['.CommonItemsTitle']
});
export const HUD_LIMITS = Object.freeze({ lower: [70, 100], top: [70, 120] });
// The scales the preview has Dota's own pictures of (the HUD capture of 2026-10-17, plan r2: one Dota
// launch per static ui-scale pair; docs/hud-capture/README.md). The sliders stop only here, and saved
// values snap to the nearest step (a tie goes up, towards Valve's 100 %), so every scale a pack can carry
// is one the preview shows exactly, never resampled.
export const HUD_STEPS = Object.freeze({ lower: Object.freeze([70, 80, 85, 90, 95, 100]), top: Object.freeze([70, 80, 90, 100, 110, 120]) });
// «Чат» (2026-10-16): the chat in a match (#HudChat, Valve's chat.css: in the middle, 220 px over the
// bottom, 800 × 460 with 162 px of lines in 18 px bold, no background). Our rules are stronger than
// chat.css; Valve raises the chat by 100 px while a spell is channelled, and so do ours.
// «Чат» is dragged in the preview (2026-10-17: «чтобы чат можно было просто двигать, а не ползунками»):
// x is the gap to the screen side it is aligned to (Panorama's margin-left/-right), ignored when centred.
export const CHAT_LIMITS = Object.freeze({ x: [0, 1420], y: [40, 1000], width: [500, 1100], lines: [100, 400], font: [14, 24], back: [0, 90] });
// Chat fonts in 2-px steps up to 24 (the sizes the capture packs carried; 26 never was).
export const CHAT_FONTS = Object.freeze([14, 16, 18, 20, 22, 24]);
// The capture (2026-10-17) showed that the chat's own panels (#ChatLinesContainer, the lines: Valve's
// chat.xml) take no rule from custom_ui.css: the box height, the font and the background stayed Valve's
// in every pack and in C2, which ran these very rules. Only #HudChat itself (place, width) moves. The
// settings stay readable (saved settings, packs already made); the builder no longer offers them.
export const CHAT_IN_GAME = Object.freeze({ align: true, y: true, width: true, lines: false, font: false, back: false });
export const CHAT_DEFAULTS = Object.freeze({ align: 'center', x: 24, y: 220, width: 800, lines: 162, font: 18, back: 0 });
const CHAT_ALIGNS = ['left', 'center', 'right'];
// Places for the chat in one click (the customization page, 2026-10-17: «Как в Dota / Выше / Слева»):
// higher and a little wider; or at the left, right of the minimap (Valve's is about 280 px wide at 1080p).
export const CHAT_PRESETS = Object.freeze({
  dota: CHAT_DEFAULTS,
  up: Object.freeze({ ...CHAT_DEFAULTS, y: 280, width: 900 }),
  left: Object.freeze({ ...CHAT_DEFAULTS, align: 'left', x: 300, y: 300, width: 700 })
});
export const HUD_DEFAULTS = Object.freeze({ opacity: 100, tint: '#7c5cff', tintStrength: 0, hide: [], lower: 100, top: 100, chat: CHAT_DEFAULTS });
// Ready sets of the same settings («Пресеты» in the builder).
export const HUD_PRESETS = Object.freeze({
  dota: HUD_DEFAULTS,
  clear: { ...HUD_DEFAULTS, opacity: 35, hide: ['flares', 'shadows'] },
  dark: { ...HUD_DEFAULTS, tint: '#000000', tintStrength: 55, hide: ['flares'] },
  violet: { ...HUD_DEFAULTS, tint: '#8a5cff', tintStrength: 45 },
  compact: { ...HUD_DEFAULTS, opacity: 70, hide: ['flares', 'statue'], lower: 85, top: 90 }
});

const clampInt = (value, [low, high], fallback) => Number.isFinite(Number(value)) ? Math.round(Math.min(high, Math.max(low, Number(value)))) : fallback;
// The nearest step (ties go to the larger one); anything not a number is the fallback.
export const snapStep = (value, steps, fallback) => {
  if (value === null || value === '' || !Number.isFinite(Number(value))) return fallback;
  const v = Number(value);
  return steps.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) || (Math.abs(s - v) === Math.abs(best - v) && s > best) ? s : best), steps[0]);
};
// The settings as they may be: numbers in range, a #rrggbb colour, known keys to hide.
export function hudSettings(input = {}) {
  const tint = /^#[0-9a-f]{6}$/i.test(input.tint ?? '') ? input.tint.toLowerCase() : HUD_DEFAULTS.tint;
  return {
    opacity: clampInt(input.opacity, [0, 100], HUD_DEFAULTS.opacity), tint, tintStrength: clampInt(input.tintStrength, [0, 100], 0),
    hide: Object.keys(HUD_HIDE).filter((key) => (input.hide || []).includes(key)),
    lower: snapStep(input.lower, HUD_STEPS.lower, 100), top: snapStep(input.top, HUD_STEPS.top, 100), chat: chatSettings(input.chat)
  };
}
export function chatSettings(input = {}) {
  const value = (key) => clampInt(input?.[key], CHAT_LIMITS[key], CHAT_DEFAULTS[key]), width = value('width');
  return { align: CHAT_ALIGNS.includes(input?.align) ? input.align : 'center', x: clampInt(input?.x, [0, 1920 - width], CHAT_DEFAULTS.x), y: value('y'), width, lines: value('lines'), font: snapStep(input?.font, CHAT_FONTS, CHAT_DEFAULTS.font), back: value('back') };
}
export const hudChanged = (input) => JSON.stringify(hudSettings(input)) !== JSON.stringify(hudSettings(HUD_DEFAULTS));

const rule = (selectors, body) => `${selectors.map((selector) => `${ROOT} ${selector}`).join(',\n')}\n{\n${body.map((line) => `\t${line};`).join('\n')}\n}`;
// Our rules (ASCII, as Panorama wants).
export function hudRules(input) {
  const s = hudSettings(input), rules = [];
  const backdrop = [];
  if (s.opacity < 100) backdrop.push(`opacity: ${(s.opacity / 100).toFixed(2)}`);
  if (s.tintStrength > 0) backdrop.push(`wash-color: ${s.tint}${Math.round((s.tintStrength / 100) * 255).toString(16).padStart(2, '0')}`);
  if (backdrop.length) rules.push(rule(BACKDROPS, backdrop));
  const hidden = s.hide.flatMap((key) => HUD_HIDE[key]);
  if (hidden.length) rules.push(rule(hidden, ['visibility: collapse']));
  if (s.lower < 100) rules.push(rule(['#lower_hud', '#minimap_container'], [`ui-scale: ${s.lower}%`]));
  if (s.top !== 100) rules.push(rule(['#topbar'], [`ui-scale: ${s.top}%`]));
  rules.push(...chatRules(s.chat));
  return rules.join('\n\n');
}
function chatRules(c) {
  const rules = [], d = CHAT_DEFAULTS;
  if (c.align !== d.align || (c.align !== 'center' && c.x !== d.x) || c.y !== d.y || c.width !== d.width) {
    const side = c.align === 'center' ? [] : [`margin-${c.align}: ${c.x}px`];
    rules.push(rule(['DOTAChat#HudChat'], [`horizontal-align: ${c.align}`, ...side, `y: -${c.y}px`, `width: ${c.width}px`]));
    rules.push(rule(['DOTAChat#HudChat.Channeling'], [`y: -${c.y + 100}px`]));
  }
  if (c.width !== d.width || c.font !== d.font) rules.push(rule(['DOTAChat#HudChat .ChatLine'], [`width: ${c.width - 50}px`, `max-width: ${c.width - 50}px`, ...(c.font !== d.font ? [`font-size: ${c.font}px`] : [])]));
  if (c.font !== d.font) rules.push(rule(['DOTAChat#HudChat .ChatTarget', 'DOTAChat#HudChat .GameAllChat', 'DOTAChat#HudChat .GameAlliesChat'], [`font-size: ${c.font}px`]));
  if (c.lines !== d.lines) rules.push(rule(['DOTAChat#HudChat #ChatLinesContainer'], [`height: ${c.lines}px`]));
  if (c.back > 0) rules.push(rule(['DOTAChat#HudChat #ChatLinesContainer'], [`background-color: #000000${Math.round((c.back / 100) * 255).toString(16).padStart(2, '0')}`]));
  return rules;
}
// Valve's custom_ui.css with our rules after it.
export function hudStyle(valve, input) {
  const rules = hudRules(input);
  return `${valve.trimEnd()}\n\n/* GridStudio: the HUD's look (gridstudio.me/customize?part=hud). */\n${rules}\n`;
}
