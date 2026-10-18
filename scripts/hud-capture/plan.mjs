// The HUD capture (plan of 2026-10-16, revised the same day after the first run): Dota renders every
// pixel of the builder's HUD preview. Packs of Valve's panorama/styles/custom_ui.css with our rules after it
// make the match HUD cycle by itself through the states the preview needs — lower HUD toggles, a wash test
// panel, top bar and chat boxes — over black, white, grey and transparent backdrops, while a watcher
// presses F12 in one paused demo. The solver then takes exact per-channel mattes from those screenshots.
// This module is the plan as data (slot tables, marker colours, timings, probe points), the stepped
// keyframe generator and the CSS of the packs, each with self-checks. scripts/make-hud-capture.mjs builds
// the VPKs; planSnapshot() is what the solver and the watcher read.
// Packs, in the order the owner runs them: C1 (everything at 100 %, ~4 min of F12 with the colour-blind
// switch), S ×5 (static ui-scale pairs, each with one static chat font and box height; ~1 min each, one
// Dota launch each) and C2 (acceptance: production hudRules() for one setting). F-bg is the only fallback
// (C1 with the backdrop on .GreenScreen), used if #HUDElements' background never paints.
// First run (2026-10-16): the first C1 animated ui-scale, font-size and height in @keyframes; Dota failed
// with "Unable to load layout file hud_reborn.xml". None of Valve's 1708 @keyframes (2011 styles of
// dota_vpk_updates) animates ui-scale, font-size, height or width, so now every @keyframes property must be
// one Valve animates (VALVE_KEYFRAME_PROPS, checked at build time), every panel runs ONE animation (several
// properties in one @keyframes, as 698 of Valve's do; no comma lists, which only 5 Valve rules use), and
// scale, font and box height are plain static rules, as production writes them. Valve's chat.css is not
// replaced any more (static fonts use production's own rules).
// Proven in the game: a custom_ui.css hook reaches the whole HUD, @keyframes background-color on a HUD
// panel plays, plain opacity / visibility / wash-color rules, static chat y / width / font-size.
import { hudRules, hudSettings } from '../hud-style.mjs';

const freeze = (value) => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

export const SCREEN = freeze({ width: 1920, height: 1080 });
export const SLOT = 1.5, EPS = 0.01;
export const COL = freeze({ K: '#000000ff', W: '#ffffffff', G: '#808080ff', T: '#00000000' });
// Static scale points (ui-scale cannot be animated, and a scaled layout cannot be interpolated or faked
// with transform: every slider stop is its own Dota launch). C1 gives 100 / 100 / 18 px / 162 px; each S
// pack one (lower, top) pair plus one chat font and box height, so 5 launches give lower {70, 80, 85, 90,
// 95, 100}, top {70, 80, 90, 100, 110, 120}, fonts {14, 16, 18, 20, 22, 24} and boxes {100, 162, 250}
// (C2 adds 400). The set keeps the slider ends (lower 70–100, top 70–120), steps of at most 10 %, the
// «Компактный» preset (85 / 90) and C2's 85 / 110. [lower, top, chat font, chat box height].
export const S_PACKS = freeze([[70, 70, 14, 100], [80, 80, 16, 250], [90, 90, 20, 162], [85, 110, 22, 162], [95, 120, 24, 162]]);
export const sPackId = ([lower, top]) => `S-${lower}-${top}`;
export const LOWER_SCALES = freeze([100, ...S_PACKS.map(([l]) => l)].sort((a, b) => b - a));
export const TOP_SCALES = freeze([100, ...S_PACKS.map(([, t]) => t)].sort((a, b) => a - b));
export const FONTS = freeze([18, ...S_PACKS.map(([, , f]) => f)].sort((a, b) => a - b));
export const CHAT_HEIGHTS = freeze([...new Set([162, ...S_PACKS.map(([, , , h]) => h)])].sort((a, b) => a - b));

// Global track on #HUDElements (background-color only): K, W, T repeating. Any 3 consecutive slots hold a
// K and a W, so a region held for 6 s or more gives K and W frames at any clock offset; a T (the world)
// comes every 4.5 s. No grey here: the blend space is decided on the lower HUD's own grey.
export const GLOBAL = freeze(['K', 'W', 'T']);
export const GLOBAL_PERIOD = GLOBAL.length * SLOT;

// Lower blocks. Scale, local backdrop, marker ring and the hidden window all live on #lower_hud itself,
// so they share one clock; the child toggles (#center_bg opacity, flares, inset strips) are their own
// panels and so their own clocks: they are held for the whole block, and guard slots (g1, g2) on either
// side absorb a child-clock offset of up to CHILD_SKEW seconds. The watcher counts only core slots.
//   op: #center_bg opacity, fl: flares, in: inset strips (1 shown, 0 hidden).
const DEF = { op: 1, wash: '#ffffff00', fl: 1, in: 1 };
export const BLOCKS = freeze([
  { id: 'HON', mark: 1, kids: DEF, sweep: 'KWG' },
  { id: 'AON', mark: 2, kids: { ...DEF, op: 0 }, sweep: 'KW' },
  { id: 'AOFF', mark: 3, kids: { ...DEF, op: 0, fl: 0, in: 0 }, sweep: 'KW' },
  { id: 'HOFF', mark: 4, kids: { ...DEF, fl: 0, in: 0 }, sweep: 'KW' },
  // The whole lower HUD and the minimap at opacity 0: the world under them (with a global T) and plates.
  { id: 'HIDE1', mark: 0, kids: DEF, fixed: 'K', core: 4, guard: 0, hidden: true },
  // Real views over the world (local backdrop transparent; the global one cycles K, W, T).
  { id: 'RDEF', mark: 5, kids: DEF, fixed: 'T', core: 6, guard: 2 },
  { id: 'RCLR', mark: 6, kids: { ...DEF, op: 0.35, fl: 0, in: 0 }, fixed: 'T', core: 6, guard: 2 },
  { id: 'RCMP', mark: 7, kids: { ...DEF, op: 0.7, fl: 0 }, fixed: 'T', core: 6, guard: 2 },
  { id: 'HIDE2', mark: 0, kids: DEF, fixed: 'K', core: 4, guard: 0, hidden: true }
]);
export const CHILD_SKEW = 3;
// One lower slot: { block, scale, bg, part, hidden? }, all at one static scale. A sweep block: two guard
// slots (K, W), its sweep twice, two guard slots; the others: guards, core, guards.
export function blockSlots(scale, blocks = BLOCKS) {
  const out = [];
  for (const b of blocks) {
    if (b.sweep) {
      const bgs = [...'KW', ...b.sweep, ...b.sweep, ...'KW'];
      bgs.forEach((bg, i) => out.push({ block: b.id, scale, bg, part: i < 2 ? 'g1' : i >= bgs.length - 2 ? 'g2' : 'core' }));
    } else {
      const n = b.core + 2 * b.guard;
      for (let i = 0; i < n; i++) out.push({ block: b.id, scale, bg: b.fixed, part: i < b.guard ? 'g1' : i >= n - b.guard ? 'g2' : 'core', hidden: !!b.hidden });
    }
  }
  return out;
}
export const lowerSlots = () => blockSlots(100);
export const LOWER = freeze(lowerSlots());
export const LOWER_PERIOD = LOWER.length * SLOT;

// Top bar (C1, at 100 %): shown 12 s, then 6 s hidden; #DayGlow 0.1 / 0.3 for 6 s each (Valve's
// DayNightPulse ends) on a 12-s clock of its own.
export const TOP_HOLD = 12, GLOW_HALF = 6, TOP_HIDE = 6, TOP_PERIOD = TOP_HOLD + TOP_HIDE;
// Chat box (C1 and S): L = the typed lines over the transparent box; M = white box, lines hidden (the
// opacity mask at this box height); HID = box at opacity 0 (the world under it). Font and height static.
export const CHATBOX = freeze([['L', 9], ['M', 6], ['HID', 6]]);
export const CHATBOX_PERIOD = CHATBOX.reduce((sum, [, d]) => sum + d, 0);
// Bevels (#AbilityBevel is made when the hero spawns: a clock of its own), classified per slot from pixels.
export const BEVEL_HALF = 24, BEVEL_PERIOD = 48;
// Rest: the other visible HUDElements children (quick stats, menu buttons…) at opacity 0 for 6 s a minute.
export const REST_PERIOD = 60, REST_HIDE = 6;
// Wash/opacity test panel: #arcana_container styled exactly like #center_bg (#1620346c + ability_bg_psd)
// over the world, so the wash law and the opacity model are fitted here and #center_bg never carries an
// animated wash. [wash-color, opacity], 6 s each.
export const WASHTEST = freeze([['#ffffff00', 1], ['#0000008c', 1], ['#ff0000ff', 1], ['#00ff0080', 1], ['#8a5cff73', 1], ['#2fa8ff4d', 1],
  ['#ffffff00', 0.35], ['#8a5cff73', 0.35], ['#2fa8ff4d', 0.55]]);
export const WASH_HOLD = 6, WASH_PERIOD = WASHTEST.length * WASH_HOLD;

// C2: the production rules of one complex setting; only the backdrop and a 6-s hide-all window every 27 s
// are added.
export const C2_SETTING = freeze({ opacity: 55, tint: '#2fa8ff', tintStrength: 30, hide: ['flares', 'statue', 'shadows', 'teamItems'], lower: 85, top: 110,
  chat: { align: 'center', y: 300, width: 600, lines: 400, font: 22, back: 50 } });
export const KIDS_HIDE = 6, KIDS_PERIOD = 27;
// S packs: bevels on a 16-s clock.
export const S_BEVEL = 8;

// Probe points and rectangles at 1920 × 1080, estimated with the HUD emulator (src/customize/panorama) and
// the 2026-10-16 capture probe; [x, y] points, [x0, y0, x1, y1] rectangles (x1, y1 exclusive).
export const GEOMETRY = freeze({
  // Global backdrop probes: world under no HUD region.
  free: [[1000, 250], [1100, 520], [1700, 420]],
  // #lower_hud (full width, bottom-aligned) is 506 px tall at 100 %: its top is 574 at 100 %, 726 at 70 %.
  lowerHeight: 506,
  // The marker ring: a 6-px box-shadow round #lower_hud (scaled with it), searched on this column.
  ring: { x: 1500, y: [450, 800], spread: 6 },
  // The lower HUD's local backdrop, where its own panels are transparent (inside the box at every scale).
  lowerBackdrop: [[1500, 800], [1560, 900]],
  // Top bar: its bottom is about 130 px at 100 % (156 at 120 %); probes over the backdrop beside it.
  topHeight: 130,
  topProbes: [[600, 12], [1360, 12], [1400, 12]],
  // C1's chat (left 40, y -437, 800 wide): the 162-px lines box, and where the watcher looks for ink.
  chatBox: [40, 280, 840, 442],
  chatInk: [40, 200, 840, 445],
  // The wash clone (#arcana_container: margin 1180 / 200, 489 × 145) and its colour probe.
  clone: [1180, 200, 1669, 345],
  cloneProbe: [1424, 272],
  // Cursor hotspots: A in phase 1, B in phase 2 (the owner places them by eye); a cursor reaches about
  // 40 px right and 44 px down from its hotspot (measured on the probe frame).
  cursorA: [1780, 270],
  cursorB: [1780, 540],
  cursorSize: [40, 44]
});
export const lowerTop = (scale) => SCREEN.height - (GEOMETRY.lowerHeight * scale) / 100;
export const topBottom = (scale) => (GEOMETRY.topHeight * scale) / 100;

// The watcher's timing (tools/hud-capture/gs-hud-capture.ps1) and the simulation that checks it: F12
// every 0.75 s; C1 phase 1 at least minPhase, a 45–70 s gap for the colour-blind flip, phase 2 at least
// minPhase and until every lower core slot was seen; S packs at least sMin s and until their blocks were
// seen (sCap at most); child clocks within ±3 s, the minimap's within ±30 s.
export const WATCHER = freeze({ interval: 0.75, jitter: 0.08, minPhase: 120, gap: [45, 70], childSkew: CHILD_SKEW, minimapSkew: 30, glowSkew: 1.5, cap: 900, sMin: 60, sCap: 100 });

// ---- The stepped-keyframe generator ----
const H = 'DOTAHud #HUDElements ';
export const ROOT = H.trim();
export const num = (x) => String(+x.toFixed(4));
export const rule = (selectors, body) => `${selectors.join(',\n')}\n{\n${body.map((line) => `\t${line};`).join('\n')}\n}`;
// Adjacent segments with the same value (a string, or an array for a several-property track) become one.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const merge = (segments) => segments.reduce((out, [d, v]) => {
  if (out.length && same(out.at(-1)[1], v)) out.at(-1)[0] += d; else out.push([d, v]);
  return out;
}, []);

// A stepped track: segments [[seconds, value], ...] over their sum. A change happens within EPS seconds
// (Valve's own keyframes use stops like 99.9999 % and 50.0001 % the same way). Self-checks: the value at
// the middle of every segment is that segment's, and no two stops print the same.
// property: one property, or an array of them (then every value is an array of as many values).
export function keyframes(name, property, segments) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) throw new Error(`${name}: bad animation name`);
  const props = [property].flat();
  for (const p of props) if (!VALVE_KEYFRAME_PROPS.includes(p)) throw new Error(`${name}: Valve never animates ${p}`);
  if (Array.isArray(property) && segments.some(([, v]) => !Array.isArray(v) || v.length !== props.length)) throw new Error(`${name}: one value per property`);
  const decl = (v) => props.map((p, i) => `${p}: ${[v].flat()[i]};`).join(' ');
  if (!segments.length || segments.some(([d]) => !(d > 2 * EPS))) throw new Error(`${name}: segments must be longer than ${2 * EPS}s`);
  const period = segments.reduce((sum, [d]) => sum + d, 0), stops = [[0, segments[0][1]]];
  let t = 0;
  segments.forEach(([d, v], i) => {
    if (i > 0 && !same(v, segments[i - 1][1])) stops.push([t - EPS, segments[i - 1][1]], [t, v]);
    t += d;
  });
  stops.push([period, segments.at(-1)[1]]);
  let start = 0;
  for (const [d, v] of segments) {
    const mid = start + d / 2, k = stops.findLastIndex(([x]) => x <= mid);
    const a = stops[k], b = stops[k + 1] || a;
    if (!same(a[1], v) || (!same(b[1], v) && b[0] - mid < 0.2)) throw new Error(`${name}: bad value at ${mid}s`);
    start += d;
  }
  const pct = (x) => `${num((100 * x) / period)}%`;
  if (new Set(stops.map(([x]) => pct(x))).size !== stops.length) throw new Error(`${name}: stops collide`);
  return { name, property, period, segments: segments.map(([d, v]) => [d, v]), stops,
    text: `@keyframes '${name}'\n{\n${stops.map(([x, v]) => `\t${pct(x)} { ${decl(v)} }`).join('\n')}\n}` };
}

// A pack's tracks: each @keyframes once, with the selectors that run it (for the solver).
function packWriter() {
  const tracks = new Map();
  const track = (name, property, segments, period) => {
    const k = keyframes(name, property, segments);
    if (period !== undefined && Math.abs(k.period - period) > 1e-9) throw new Error(`${name}: period ${k.period}s, the plan says ${period}s`);
    if (tracks.has(name)) throw new Error(`${name}: two tracks of one name`);
    tracks.set(name, { ...k, selectors: [] });
    return k;
  };
  // One element, ONE animation (several properties go in one @keyframes, never a comma list).
  const animated = (selectors, a, extra = []) => {
    if (Array.isArray(a)) throw new Error('one animation per panel');
    tracks.get(a.name).selectors.push(...selectors);
    return rule(selectors, [...extra, `animation-name: ${a.name}`, `animation-duration: ${num(a.period)}s`, 'animation-timing-function: linear', 'animation-iteration-count: infinite']);
  };
  const list = () => [...tracks.values()].map(({ name, property, period, segments, selectors }) => ({ name, property, period, segments, selectors }));
  return { track, animated, list };
}

// ---- Static parts shared by the packs ----
// Panels that are empty in the paused demo but could show something (tips, combat log, picker popups…).
export const NOISE_IN = freeze(['#ContextualTips', '#FightRecap', '#combat_log', '#KillCam', '#shop', '#neutral_item_picker', '#inspect', '#CursorCooldown', '#GiveItemIndicator',
  '#DeityBlessingPicker', '#AghanimUpgradePicker', '#ImbueAbilityPicker', '#overlaymap_container', '#NetGraph', '#NetDisconnect', '#QueryUnit', '#scoreboard', '#GG']);
// DOTAHud children outside #HUDElements, «Игра приостановлена» (#PausedInfo) among them.
export const NOISE_OUT = freeze(['#predictions_button', '#BigHealthBar', '#OrdersContainer', '#spectator_game_stats', '#SpectatorGraph', '#CoachingControls', '#spectator_quickstats',
  '#HeroIndicators', '#PreGame', '#CustomUIRoot', '#VoiceChat', '#KillGraph', '#player_performance_container', '#WKArcana', '#ErrorMessages',
  '#ChatWheel', '#PingWheel', '#SpectatorItems', '#PausedInfo', '#GuideBrowser', '#Charms', '#Cameraman', '#BotDebug', '#BroadcasterSelection', '#spectator_options',
  '#spectator_overwatch', '#ProjectionDebug', '#LargoUltimateRhythmOverhead', '#GameEndContainer', '#MonsterHunterInvestigationsContainer', '#HelpTipsManager',
  '#SpectatorToastManager', '#Tooltips', '#IngamePredictionsContainer', '#PredictionToastManager', '#BroadcastToastManager', '#BroadcastToastManagerAlpha', '#BountyToastManager']);
// HUDElements children that stay (the "rest" region besides lower/minimap/top/chat).
export const REST_KIDS = freeze(['#HeroRelicProgress', '#combat_events', '#spectator_item', '#spectator_talents', '#river_vial', '#NeutralCampPullTimes', '#TeleportChannelTime',
  '#RuneSpawnTimes', '#NeutralCreepGoldBounty', '#LaneCreepGoldBounty', '#AbilityHeroIcons', '#splash_screen', '#stackable_side_panels', '#mutations', '#Wagering', '#MenuButtons']);
const STATIC_NOISE = rule([...NOISE_IN.map((s) => H + s), ...NOISE_OUT.map((s) => `DOTAHud ${s}`)], ['opacity: 0']);

// Valve's endless HUD loops, stopped. Those visible at level 1 are held at their 0% keyframe (a real frame
// of the game); the others are only stopped. [our selector under DOTAHud #HUDElements, Valve's selector].
// #DayGlow is not here: it has a track of its own (GSDayGlow), so the preview can pulse it exactly.
export const FREEZE = freeze([
  { rules: [['#LevelUpGlow', '#LevelUpGlow']], body: ['animation-name: none', 'opacity: 1'] },
  { rules: [['#levelup #LevelUpButton', '#LevelUpButton']], body: ['animation-name: none', 'box-shadow: #9f9037ff 0px 0px 10px 0px'] },
  { rules: [['#RecommendedUpgradeOverlay .BorderEdge', '#RecommendedUpgradeOverlay .BorderEdge']], body: ['animation-name: none', 'box-shadow: fill #e38f12 0px 0px 1px 0px'] },
  { rules: ['.ConsumeItemPropmt .ConsumeItemPropmtGlow', '#inventory_neutral_level_up .NeutralLevelUpAvailableGlow', '.StashItemAvailable #inventory_neutral_slot',
    '#SilenceIcon', '#MutedIcon', '.PlayerHoldingAegis #PlayerModifierItemImage', '#Spinner'].map((s) => [s, s]), body: ['animation-name: none'] }
]);
// Valve's endless loops left alone, and why (tests/hud-capture-plan.test.cjs derives the full set from
// Valve's styles: every one is either in FREEZE, here, or tracked).
export const FREEZE_SKIP = freeze({
  '.Spinner': 'dotastyles: loading spinners of the menus; the HUD courier spinner is #Spinner (frozen)',
  '.RadialSweep': 'dotastyles: no HUD layout uses it',
  '.TextGlowPulse': 'dotastyles: no HUD layout uses it',
  'Label.ProbablyUnlocalizedText': 'dotastyles: a developer marker for missing tokens',
  '.DOTAViolator .DOTAViolatorOuter': 'dotastyles: menu violators',
  '.DOTAViolator .DOTAViolatorInner': 'dotastyles: menu violators',
  'ProgressBarWithMiddle.AnimatedArrowProgressBar .ProgressBarMiddle .ProgressBarMiddleScroll': 'dotastyles: no HUD layout uses it',
  '#NightGlow': 'collapsed by day (.NightTime only); the capture is at 0:2x of a demo',
  '#InvokerAghsStatusContainer.MakeChoice .InvokerAghsStatusBackgroundChoose': 'Invoker only',
  '#InvokerAghsStatusContainer.MakeChoice .InvokerAghsOrbBorderGlow': 'Invoker only',
  '#InvokerAghsStatusContainer.MakeChoice .InvokerAghsOrbGlow': 'Invoker only'
});
export const FREEZE_TRACKED = freeze({ '#DayGlow': 'GSDayGlow' });
const FREEZE_CSS = FREEZE.map(({ rules, body }) => rule(rules.map(([ours]) => H + ours), body)).join('\n\n');
// Chat lines stay (Valve fades .Expired lines out), with no transitions.
const EXPIRED = rule([`${H}DOTAChat#HudChat .ChatLine.Expired`], ['opacity: 1', 'transition-duration: 0s']);

// The global backdrop under the whole HUD: #HUDElements' background (C1), or Valve's .GreenScreen at
// z-index -1, under #HUDElements and over the world as DOTAPaused already is (F-bg).
function globalBackdrop(w, on = 'HUDElements') {
  const g = w.track('GSGlobal', 'background-color', merge(GLOBAL.map((x) => [SLOT, COL[x]])), GLOBAL_PERIOD);
  const css = on === 'HUDElements' ? [w.animated([ROOT], g, ['background-color: #000000ff'])]
    : [rule([ROOT], ['background-color: #00000000']), w.animated(['DOTAHud .GreenScreen'], g, ['visibility: visible', 'z-index: -1', 'width: 100%', 'height: 100%', 'background-color: #000000ff'])];
  return [...css, g.text].join('\n\n');
}

// The lower-HUD marker: a 6-px ring (box-shadow) round #lower_hud, on #lower_hud's own clock. R = 255,
// G = 20 × block, B = 0 core / 120 first guard / 240 last guard; transparent while hidden. Its height on
// the screen gives the scale.
const hex = (v) => v.toString(16).padStart(2, '0');
export function markColour(slot) {
  const b = BLOCKS.find((x) => x.id === slot.block);
  if (!b) throw new Error(`${slot.block}: no such block`);
  if (b.hidden) return '#00000000';
  return `#ff${hex(20 * b.mark)}${hex(slot.part === 'core' ? 0 : slot.part === 'g1' ? 120 : 240)}ff`;
}
export const MARKS = freeze([...new Map(LOWER.filter((s) => !s.hidden).map((s) => [markColour(s), { colour: markColour(s), block: s.block, part: s.part }])).values()]);
const kidOf = (slot, key) => BLOCKS.find((b) => b.id === slot.block).kids[key];

// Every property used inside an @keyframes of Valve's 2011 Panorama styles (spirit-bear-productions/
// dota_vpk_updates, 2026-10-16; uses in brackets). Nothing else may be animated: Valve never animates
// ui-scale, font-size, height or width, and a pack that did failed to load hud_reborn.xml.
export const VALVE_KEYFRAME_PROPS = freeze(['transform' /* 2724 */, 'opacity' /* 1220 */, 'brightness' /* 1087 */, 'box-shadow' /* 563 */,
  'pre-transform-scale2d' /* 516 */, 'background-color' /* 376 */, 'wash-color' /* 356 */, 'text-shadow' /* 201 */, 'border' /* 113 */, 'color' /* 99 */,
  'opacity-brush' /* 87 */, 'blur' /* 85 */, 'saturation' /* 83 */, 'hue-rotation' /* 27 */, 'opacity-mask' /* 18 */, 'clip' /* 15 */, 'img-shadow' /* 14 */,
  'border-brush' /* 7 */, 'pre-transform-rotate2d' /* 7 */, 'contrast' /* 7 */, 'y' /* 7 */, 'opacity-mask-threshold' /* 4 */, 'background-position' /* 3 */,
  'opacity-mask-position' /* 2 */, 'border-left' /* 2 */, 'opacity-mask-scale' /* 1 */]);

// The chat, parked over the world on the left, clear of every other region; production's own font rules
// (hudRules) when the font is not Valve's 18 px, a static box height; the box cycle L / M / HID.
const CHAT_PARK = rule([`${H}DOTAChat#HudChat`, `${H}DOTAChat#HudChat.Channeling`], ['horizontal-align: left', 'margin-left: 40px', 'y: -437px', 'width: 800px', 'transition-duration: 0s']);
function chatRules(w, font, height) {
  const box = w.track('GSChatBox', ['background-color', 'opacity'], merge(CHATBOX.map(([s, d]) => [d, [s === 'M' ? '#ffffffff' : '#00000000', s === 'HID' ? '0' : '1']])), CHATBOX_PERIOD);
  const lines = w.track('GSChatLines', 'opacity', merge(CHATBOX.map(([s, d]) => [d, s === 'M' ? '0' : '1'])), CHATBOX_PERIOD);
  return [EXPIRED, CHAT_PARK,
    rule([`${H}DOTAChat#HudChat #ChatLinesContainer`, `${H}DOTAChat#HudChat #ChatLinesPanel`], ['transition-duration: 0s']),
    ...(font !== 18 ? [rule([`${H}DOTAChat#HudChat .ChatLine`], [`font-size: ${font}px`]),
      rule([`${H}DOTAChat#HudChat .ChatTarget`, `${H}DOTAChat#HudChat .GameAllChat`, `${H}DOTAChat#HudChat .GameAlliesChat`], [`font-size: ${font}px`])] : []),
    ...(height !== 162 ? [rule([`${H}DOTAChat#HudChat #ChatLinesContainer`], [`height: ${height}px`])] : []),
    w.animated([`${H}DOTAChat#HudChat #ChatLinesContainer`], box), box.text,
    w.animated([`${H}DOTAChat#HudChat #ChatLinesPanel`], lines), lines.text];
}
// #lower_hud's one animation: local backdrop, marker ring and opacity together (one clock); the minimap
// gets the opacity alone (its own clock); then the child toggles, each on its own panel.
function lowerRules(w, slots, period, bevelHalf) {
  const seg = (f) => merge(slots.map((s) => [SLOT, f(s)]));
  const lower = w.track('GSLower', ['background-color', 'box-shadow', 'opacity'],
    seg((s) => [s.hidden ? COL.T : COL[s.bg], `${markColour(s)} 0px 0px 0px 6px`, s.hidden ? '0' : '1']), period);
  const mini = w.track('GSMiniOp', 'opacity', seg((s) => (s.hidden ? '0' : '1')), period);
  const cOp = w.track('GSCenterBgOp', 'opacity', seg((s) => num(kidOf(s, 'op'))), period);
  const fl = w.track('GSFlare', 'opacity', seg((s) => num(kidOf(s, 'fl'))), period);
  const ins = w.track('GSInset', 'opacity', seg((s) => num(kidOf(s, 'in'))), period);
  const bev = w.track('GSBevel', 'opacity', [[bevelHalf, '1'], [bevelHalf, '0']], 2 * bevelHalf);
  return ['/* The minimap is painted after #lower_hud, so the lower HUD\'s own backdrop lies under it too (no content of the two overlaps). */',
    rule([`${H}#minimap_container`], ['z-index: 3']),
    w.animated([`${H}#lower_hud`], lower), lower.text, w.animated([`${H}#minimap_container`], mini), mini.text,
    w.animated([`${H}#center_bg`], cOp), cOp.text, w.animated([`${H}#left_flare`, `${H}#right_flare`], fl), fl.text,
    w.animated([`${H}.AbilityInsetShadowLeft`, `${H}.AbilityInsetShadowRight`], ins), ins.text, w.animated([`${H}#AbilityBevel`], bev), bev.text];
}
const dayGlow = (w) => { const g = w.track('GSDayGlow', 'opacity', [[GLOW_HALF, '0.1'], [TOP_HOLD - GLOW_HALF, '0.3']], TOP_HOLD); return [w.animated([`${H}#topbar #DayGlow`], g), g.text]; };

// ---- C1 (and F-bg, the same with the backdrop moved): everything at 100 %, Valve's 18-px chat ----
function c1Pack(id = 'C1') {
  const w = packWriter();
  const wash = w.track('GSWashTest', ['wash-color', 'opacity'], merge(WASHTEST.map(([wc, o]) => [WASH_HOLD, [wc, num(o)]])), WASH_PERIOD);
  const tOp = w.track('GSTopOp', 'opacity', [[TOP_HOLD, '1'], [TOP_HIDE, '0']], TOP_PERIOD);
  const rest = w.track('GSRestOp', 'opacity', [[REST_HIDE, '0'], [REST_PERIOD - REST_HIDE, '1']], REST_PERIOD);
  const css = [
    `/* GridStudio HUD capture ${id} (not for play). Appended to Valve's custom_ui.css. */`,
    STATIC_NOISE, FREEZE_CSS,
    globalBackdrop(w, id === 'F-bg' ? 'GreenScreen' : 'HUDElements'),
    ...lowerRules(w, LOWER, LOWER_PERIOD, BEVEL_HALF),
    '/* Wash/opacity test panel: a copy of #center_bg\'s look over the world, top right (DOTAHud child, drawn over the global backdrop). */',
    w.animated(['DOTAHud #arcana_container'], wash, ['horizontal-align: left', 'vertical-align: top', 'margin-left: 1180px', 'margin-top: 200px', 'width: 489px', 'height: 145px',
      'flow-children: none', 'background-color: #1620346c', 'background-image: url("s2r://panorama/images/hud/reborn/ability_bg_psd.vtex_c")', 'background-size: 100%']), wash.text,
    w.animated([`${H}#topbar`], tOp), tOp.text, ...dayGlow(w),
    ...chatRules(w, 18, 162),
    w.animated(REST_KIDS.map((s) => H + s), rest), rest.text
  ].join('\n\n') + '\n';
  return { append: css, tracks: w.list(), lower: LOWER, scale: { lower: 100, top: 100 }, chat: { font: 18, height: 162 } };
}

// ---- C2: the real production rules for one setting, plus only the backdrop and a hide-all window ----
function c2Pack() {
  const w = packWriter(), production = hudRules(C2_SETTING);
  if (!production) throw new Error('C2: hudRules() gave nothing for the C2 setting');
  const kids = w.track('GSKidsOp', 'opacity', [[KIDS_HIDE, '0'], [KIDS_PERIOD - KIDS_HIDE, '1']], KIDS_PERIOD);
  const css = ['/* GridStudio HUD capture C2 (not for play): production rules for one setting + backdrop. */',
    `/* setting: ${JSON.stringify(C2_SETTING)} */`, production, STATIC_NOISE, FREEZE_CSS, EXPIRED, globalBackdrop(w),
    w.animated(['#lower_hud', '#minimap_container', '#topbar', 'DOTAChat#HudChat', ...REST_KIDS].map((s) => H + s), kids), kids.text].join('\n\n') + '\n';
  return { append: css, tracks: w.list(), production, setting: hudSettings(C2_SETTING) };
}

// ---- S: one static (lower, top) pair, plus one static chat font and box height; the four lower toggle
// blocks (HON with a local grey) and a hidden window, bevel on a 16-s clock, DayGlow lo/hi, the chat box
// cycle. Static ui-scale and font-size exactly as production writes them. ----
export const sSlots = (lower) => blockSlots(lower, BLOCKS.filter((b) => b.sweep || b.id === 'HIDE1'));
function sPack([lower, top, font, height]) {
  const w = packWriter(), slots = sSlots(lower), period = slots.length * SLOT;
  const css = [`/* GridStudio HUD capture ${sPackId([lower, top])} (not for play): lower ${lower} %, top ${top} %, chat ${font} px / ${height} px. */`, STATIC_NOISE, FREEZE_CSS,
    rule([`${H}#lower_hud`, `${H}#minimap_container`], [`ui-scale: ${lower}%`]), rule([`${H}#topbar`], [`ui-scale: ${top}%`]),
    globalBackdrop(w), ...lowerRules(w, slots, period, S_BEVEL), ...dayGlow(w), ...chatRules(w, font, height)].join('\n\n') + '\n';
  return { append: css, tracks: w.list(), lower: slots, scale: { lower, top }, chat: { font, height } };
}

// ---- The packs ----
export const CUSTOM_UI = 'panorama/styles/custom_ui.vcss_c';
// role: main (C1), scale (S), acceptance (C2), fallback (F-bg; when: the watcher's verdict that runs it).
// seconds: the auto-F12 run after the owner's first F12 (C1: two phases and the gap). The owner's queue:
// C1, the S packs, C2 — one Dota launch each.
export const PACKS = freeze([
  { id: 'C1', role: 'main', seconds: [245, 330], purpose: 'Lower HUD at 100 % × four toggle states × K/W(/G), real views, top bar 100 % × DayGlow and a hidden window, chat at 18 px / 162 px (lines, mask, hidden), rest, wash clone, world; both colour-blind modes.' },
  ...S_PACKS.map((s) => ({ id: sPackId(s), role: 'scale', seconds: [60, 100],
    purpose: `Static ui-scale: lower ${s[0]} %, top ${s[1]} %; chat ${s[2]} px in a ${s[3]}-px box; the four lower toggle blocks, bevel, DayGlow and a hidden window.` })),
  { id: 'C2', role: 'acceptance', seconds: [60, 90], purpose: 'Production hudRules() for one complex setting, the global backdrop and a 6-s hide-all window every 27 s.' },
  { id: 'F-bg', role: 'fallback', seconds: [245, 330], when: 'global backdrop never exact K/W at the free points', purpose: 'C1 with the global backdrop on .GreenScreen at z-index -1.' }
]);
export const QUEUE = freeze(PACKS.filter((p) => p.role !== 'fallback').map((p) => p.id));

// The appended CSS of every pack (no Valve text needed): { id: { append, tracks, ... } }.
export function packAppends() {
  const out = {};
  for (const p of PACKS) {
    if (p.id === 'C1' || p.id === 'F-bg') out[p.id] = c1Pack(p.id);
    else if (p.id === 'C2') out[p.id] = c2Pack();
    else out[p.id] = sPack(S_PACKS.find((s) => sPackId(s) === p.id));
    checkCss(p.id, out[p.id].append);
  }
  return out;
}
// Valve's custom_ui.css with a pack's rules after it.
export const customUIText = (valve, append) => `${valve.replace(/\r\n/g, '\n').trimEnd()}\n\n${append}`;
// The Panorama files of every pack (custom_ui only; Valve's chat.css is never replaced):
// [{ ...PACKS[i], append, tracks, files: [{ path, text }] }].
export function buildPacks({ customUI }) {
  const appends = packAppends();
  return PACKS.map((p) => {
    const files = [{ path: CUSTOM_UI, text: customUIText(customUI, appends[p.id].append) }];
    for (const f of files) checkCss(`${p.id} ${f.path}`, f.text);
    return { ...p, ...appends[p.id], files };
  });
}

// ---- Checks on CSS text ----
// Valve's @keyframes form: @keyframes 'Name' { 0% { prop: value; } … } (whitespace aside).
const KEYFRAMES_RE = /@keyframes\s+'([A-Za-z0-9_-]+)'\s*\{((?:\s*\d+(?:\.\d+)?%\s*\{[^{}]*\})+)\s*\}/g;
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
export function parseKeyframes(css) {
  const text = stripComments(css), found = [...text.matchAll(KEYFRAMES_RE)];
  if (found.length !== (text.match(/@keyframes/g) || []).length) throw new Error('an @keyframes block is not in Valve\'s form');
  return found.map(([, name, body]) => ({ name, stops: [...body.matchAll(/(\d+(?:\.\d+)?)%\s*\{([^{}]*)\}/g)].map(([, at, decls]) => ({
    at: +at, decls: decls.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const i = d.indexOf(':'); return [d.slice(0, i).trim(), d.slice(i + 1).trim()]; })
  })) }));
}
// The style rules (not @keyframes): [{ selectors: [...], decls: [[prop, value]] }].
export function parseRules(css) {
  const text = stripComments(css).replace(KEYFRAMES_RE, '').replace(/@[a-z-]+[^;{}]*;/g, '');
  return [...text.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
    selectors: sel.split(',').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean),
    decls: body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const i = d.indexOf(':'); return [d.slice(0, i).trim(), d.slice(i + 1).trim()]; })
  }));
}
// ASCII (Panorama wants it), balanced braces, every @keyframes in Valve's form with ascending stops from 0%
// to 100%, only properties Valve animates (VALVE_KEYFRAME_PROPS) and the same ones at every stop of ours,
// every animation-name defined, and one animation per rule of ours (no comma lists).
export function checkCss(name, css) {
  if (/[^\x00-\x7f]/.test(css)) throw new Error(`${name}: not ASCII`);
  const bare = stripComments(css);
  let depth = 0;
  for (const ch of bare) { depth += ch === '{' ? 1 : ch === '}' ? -1 : 0; if (depth < 0 || depth > 2) throw new Error(`${name}: braces`); }
  if (depth) throw new Error(`${name}: braces`);
  const frames = parseKeyframes(css), names = new Map(frames.map((k) => [k.name, k]));
  if (names.size !== frames.length) throw new Error(`${name}: two @keyframes of one name`);
  for (const k of frames) for (const s of k.stops) for (const [p] of s.decls) {
    if (!VALVE_KEYFRAME_PROPS.includes(p)) throw new Error(`${name}: ${k.name}: Valve never animates ${p} (Panorama refuses the stylesheet)`);
  }
  for (const k of frames.filter((f) => f.name.startsWith('GS'))) {
    const at = k.stops.map((s) => s.at);
    if (at[0] !== 0 || at.at(-1) !== 100 || at.some((x, i) => i && x <= at[i - 1])) throw new Error(`${name}: ${k.name}: stops`);
    const props = k.stops.map((s) => s.decls.map(([p]) => p).join(','));
    if (new Set(props).size !== 1 || new Set(props[0].split(',')).size !== props[0].split(',').length) throw new Error(`${name}: ${k.name}: the same properties at every stop`);
  }
  for (const r of parseRules(css)) {
    const get = (p) => r.decls.find(([q]) => q === p)?.[1];
    const anim = get('animation-name');
    if (!anim || anim === 'none') continue;
    const list = anim.split(',').map((s) => s.trim());
    for (const n of list) if (n.startsWith('GS') && !names.has(n)) throw new Error(`${name}: ${n} not defined`);
    if (!list.some((n) => n.startsWith('GS'))) continue;
    if (list.length !== 1) throw new Error(`${name}: ${r.selectors[0]}: one animation per panel, not a list`);
    for (const p of ['animation-duration', 'animation-timing-function', 'animation-iteration-count']) {
      const v = get(p)?.split(',').map((s) => s.trim());
      if (!v || v.length !== list.length) throw new Error(`${name}: ${r.selectors[0]}: ${p} list`);
    }
  }
  return true;
}

// ---- Selectors against Valve's layouts ----
// The parts of one selector: [{ kind: 'type' | 'id' | 'class', name }]; :not(…) is looked into, :nth-child()
// and other pseudo-classes are skipped.
export function selectorTokens(selector) {
  const out = [], text = selector.replace(/:not\(([^)]*)\)/g, ' $1').replace(/:[a-z-]+(\([^)]*\))?/g, '');
  for (const compound of text.split(/[\s>+~]+/).filter(Boolean)) {
    const type = compound.match(/^[A-Za-z][A-Za-z0-9_-]*/);
    if (type) out.push({ kind: 'type', name: type[0] });
    for (const [, sign, name] of compound.matchAll(/([#.])([A-Za-z0-9_-]+)/g)) out.push({ kind: sign === '#' ? 'id' : 'class', name });
  }
  return out;
}
const LAYOUT_META = new Set(['root', 'styles', 'scripts', 'include', 'snippets', 'snippet']);
// ids, classes and panel types of Valve layouts (XML texts).
export function layoutIndex(texts) {
  const index = { type: new Set(), id: new Set(), class: new Set() };
  for (const text of texts) {
    const bare = text.replace(/<!--[\s\S]*?-->/g, '');
    for (const [, type] of bare.matchAll(/<([A-Za-z][A-Za-z0-9_]*)\b/g)) if (!LAYOUT_META.has(type)) index.type.add(type);
    for (const [, id] of bare.matchAll(/\sid="([^"]+)"/g)) index.id.add(id);
    for (const [, cls] of bare.matchAll(/\sclass="([^"]*)"/g)) cls.split(/\s+/).filter(Boolean).forEach((c) => index.class.add(c));
  }
  return index;
}
// ids, classes and types Valve's own styles select (for state classes and panels C++ makes).
export function styleIndex(texts) {
  const index = { type: new Set(), id: new Set(), class: new Set() };
  for (const text of texts) for (const r of parseRules(text)) for (const s of r.selectors) for (const t of selectorTokens(s)) index[t.kind].add(t.name);
  return index;
}
// Every selector of every pack's own rules (C2's production rules included).
export function packSelectors(appends = packAppends()) {
  return [...new Set(Object.values(appends).flatMap(({ append }) => parseRules(append).flatMap((r) => r.selectors)))];
}
// Tokens of `selectors` not in the layouts: in Valve's styles (runtime: classes C++ sets, panels C++ makes)
// or nowhere (missing).
export function auditSelectors(selectors, layouts, styles) {
  const runtime = new Map(), missing = new Map();
  for (const selector of selectors) for (const t of selectorTokens(selector)) {
    if (layouts[t.kind].has(t.name)) continue;
    const key = `${t.kind === 'id' ? '#' : t.kind === 'class' ? '.' : ''}${t.name}`;
    (styles && styles[t.kind].has(t.name) ? runtime : missing).set(key, selector);
  }
  return { runtime: Object.fromEntries(runtime), missing: Object.fromEntries(missing) };
}
// Tokens no layout in assets/dota-hud/panorama has, but a layout of Valve's does (fetched by
// make-hud-capture.mjs, and by the test with HUD_CAPTURE_ONLINE=1).
export const EXTERNAL_LAYOUTS = freeze({
  '.CommonItemsTitle': 'panorama/layout/hud/dota_hud_common_items.xml'
});
// Tokens only C++ sets or makes (state classes, generated panels); Valve's styles select each of them.
export const RUNTIME_TOKENS = freeze(['.Expired', '.ChatLine', '.Channeling', '.StashItemAvailable', '.PlayerHoldingAegis', '#PlayerModifierItemImage',
  '.ChatTarget', '.GameAllChat', '.GameAlliesChat', '.Visible']);

// ---- What the solver and the watcher read ----
export function planSnapshot(appends = packAppends()) {
  const c2 = appends.C2;
  return {
    plan: 'hud-capture 2026-10-16 r2 (static scales)', screen: SCREEN, slot: SLOT, eps: EPS, colours: COL,
    global: { order: GLOBAL, period: GLOBAL_PERIOD, track: 'GSGlobal' },
    lower: { scales: LOWER_SCALES, blocks: BLOCKS, slots: LOWER, period: LOWER_PERIOD, marks: MARKS, childSkew: CHILD_SKEW },
    top: { scales: TOP_SCALES, hold: TOP_HOLD, hide: TOP_HIDE, period: TOP_PERIOD, glow: { values: ['0.1', '0.3'], half: GLOW_HALF, period: TOP_HOLD } },
    chat: { fonts: FONTS, heights: CHAT_HEIGHTS, box: CHATBOX, boxPeriod: CHATBOX_PERIOD },
    bevel: { half: BEVEL_HALF, period: BEVEL_PERIOD }, rest: { period: REST_PERIOD, hide: REST_HIDE, panels: REST_KIDS },
    wash: { tests: WASHTEST, hold: WASH_HOLD, period: WASH_PERIOD, panel: '#arcana_container', like: '#center_bg' },
    freeze: FREEZE.map(({ rules, body }) => ({ selectors: rules.map(([ours]) => H + ours), body })),
    c2: { setting: C2_SETTING, normalized: c2.setting, production: c2.production, kids: { hide: KIDS_HIDE, period: KIDS_PERIOD } },
    scalePacks: S_PACKS.map((s) => ({ id: sPackId(s), lower: s[0], top: s[1], font: s[2], chatHeight: s[3] })), queue: QUEUE,
    geometry: GEOMETRY, watcher: WATCHER,
    packs: PACKS.map((p) => ({ id: p.id, role: p.role, when: p.when, seconds: p.seconds, tracks: appends[p.id].tracks,
      ...(appends[p.id].scale ? { scale: appends[p.id].scale, chat: appends[p.id].chat } : {}),
      ...(p.role === 'scale' ? { lower: appends[p.id].lower } : {}) }))
  };
}
