// Generates the CSS appended to Valve's panorama/styles/custom_ui.css for every capture pack
// (design scratch; the repo port is scripts/hud-capture/plan.mjs + scripts/make-hud-capture.mjs).
//   node gen.mjs  -> out/*.css, out/plan.json
import { mkdirSync, writeFileSync } from 'node:fs';
import * as P from './plan.mjs';

const H = 'DOTAHud #HUDElements ';
const OUT = new URL('./out/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const num = (x) => String(+x.toFixed(4));
const rule = (sels, body) => `${sels.join(',\n')}\n{\n${body.map((l) => `\t${l};`).join('\n')}\n}`;

// A stepped track: segments [[seconds, value], ...] over `period`. Steps are EPS wide.
function keyframes(name, prop, segments) {
  const period = segments.reduce((a, [d]) => a + d, 0), stops = [[0, segments[0][1]]];
  let t = 0;
  segments.forEach(([d, v], i) => {
    if (i > 0 && v !== segments[i - 1][1]) stops.push([t - P.EPS, segments[i - 1][1]], [t, v]);
    t += d;
  });
  stops.push([period, segments.at(-1)[1]]);
  // Self-check: linear interpolation at the middle of every segment gives that segment's value.
  let s = 0;
  for (const [d, v] of segments) {
    const mid = s + d / 2, k = stops.findLastIndex(([x]) => x <= mid);
    const a = stops[k], b = stops[k + 1] || a;
    if (a[1] !== v || (b[1] !== v && b[0] - mid < 0.2)) throw new Error(`${name}: bad value at ${mid}`);
    s += d;
  }
  const pct = (x) => `${num((100 * x) / period)}%`;
  if (new Set(stops.map(([x]) => pct(x))).size !== stops.length) throw new Error(`${name}: stops collide`);
  return { name, period, text: `@keyframes '${name}'\n{\n${stops.map(([x, v]) => `\t${pct(x)} { ${prop}: ${v}; }`).join('\n')}\n}` };
}
const merge = (segs) => segs.reduce((out, [d, v]) => { if (out.length && out.at(-1)[1] === v) out.at(-1)[0] += d; else out.push([d, v]); return out; }, []);
// One element, its animations (comma lists, as Valve's own crownfall styles do).
function animated(sels, anims, extra = []) {
  return rule(sels, [...extra, `animation-name: ${anims.map((a) => a.name).join(', ')}`, `animation-duration: ${anims.map((a) => `${num(a.period)}s`).join(', ')}`,
    `animation-timing-function: ${anims.map(() => 'linear').join(', ')}`, `animation-iteration-count: ${anims.map(() => 'infinite').join(', ')}`]);
}

// ---- Static parts shared by the packs ----
const NOISE_IN = ['#ContextualTips', '#FightRecap', '#combat_log', '#KillCam', '#shop', '#neutral_item_picker', '#inspect', '#CursorCooldown', '#GiveItemIndicator',
  '#DeityBlessingPicker', '#AghanimUpgradePicker', '#ImbueAbilityPicker', '#overlaymap_container', '#NetGraph', '#NetDisconnect', '#QueryUnit', '#scoreboard', '#GG'];
const NOISE_OUT = ['#predictions_button', '#BigHealthBar', '#OrdersContainer', '#spectator_game_stats', '#SpectatorGraph', '#CoachingControls', '#spectator_quickstats',
  '#HeroIndicators', '#PreGame', '#CustomUIRoot', '#VoiceChat', '#KillGraph', '#player_performance_container', '#WKArcana', '#ErrorMessages',
  '#ChatWheel', '#PingWheel', '#SpectatorItems', '#PausedInfo', '#GuideBrowser', '#Charms', '#Cameraman', '#BotDebug', '#BroadcasterSelection', '#spectator_options',
  '#spectator_overwatch', '#ProjectionDebug', '#LargoUltimateRhythmOverhead', '#GameEndContainer', '#MonsterHunterInvestigationsContainer', '#HelpTipsManager',
  '#SpectatorToastManager', '#Tooltips', '#IngamePredictionsContainer', '#PredictionToastManager', '#BroadcastToastManager', '#BroadcastToastManagerAlpha', '#BountyToastManager'];
// HUDElements children that stay (the "rest" region besides lower/minimap/top/chat).
export const REST_KIDS = ['#HeroRelicProgress', '#combat_events', '#spectator_item', '#spectator_talents', '#river_vial', '#NeutralCampPullTimes', '#TeleportChannelTime',
  '#RuneSpawnTimes', '#NeutralCreepGoldBounty', '#LaneCreepGoldBounty', '#AbilityHeroIcons', '#splash_screen', '#stackable_side_panels', '#mutations', '#Wagering', '#MenuButtons'];
const STATIC_NOISE = rule([...NOISE_IN.map((s) => H + s), ...NOISE_OUT.map((s) => `DOTAHud ${s}`)], ['opacity: 0']);
// Valve's endless HUD loops frozen at their 0% keyframe (a real frame of the game). #DayGlow gets its own track.
const FREEZE = [
  rule([`${H}#LevelUpGlow`], ['animation-name: none', 'opacity: 1']),
  rule([`${H}#levelup #LevelUpButton`], ['animation-name: none', 'box-shadow: #9f9037ff 0px 0px 10px 0px']),
  rule([`${H}#RecommendedUpgradeOverlay .BorderEdge`], ['animation-name: none', 'box-shadow: fill #e38f12 0px 0px 1px 0px']),
  rule([`${H}.ConsumeItemPropmt .ConsumeItemPropmtGlow`, `${H}#inventory_neutral_level_up .NeutralLevelUpAvailableGlow`, `${H}.StashItemAvailable #inventory_neutral_slot`,
    `${H}#SilenceIcon`, `${H}#MutedIcon`, `${H}.PlayerHoldingAegis #PlayerModifierItemImage`, `${H}#Spinner`], ['animation-name: none'])
].join('\n\n');
const EXPIRED = rule([`${H}DOTAChat#HudChat .ChatLine.Expired`], ['opacity: 1', 'transition-duration: 0s']);

// ---- Global backdrop under the whole HUD (#HUDElements background) ----
const gBg = keyframes('GSGlobal', 'background-color', merge(P.GLOBAL.map((x) => [P.SLOT, P.COL[x]])));
const globalCss = [animated([H.trim()], [gBg], ['background-color: #000000ff']), gBg.text].join('\n\n');

// Lower-HUD marker: a 6 px ring (box-shadow) round #lower_hud, on #lower_hud's own clock. R = 255,
// G = 20 x block, B = 0 core / 120 first guard / 240 last guard. Its height on screen gives the scale.
const hex = (v) => v.toString(16).padStart(2, '0');
export function markColour(s) {
  const b = P.BLOCKS.find((x) => x.id === s.block);
  if (b.hidden) return '#00000000';
  return `#ff${hex(20 * b.mark)}${hex(s.part === 'core' ? 0 : s.part === 'g1' ? 120 : 240)}ff`;
}

// ---- C1 ----
function c1() {
  const L = P.LOWER, seg = (f) => merge(L.map((s) => [P.SLOT, f(s)]));
  const block = (id) => P.BLOCKS.find((b) => b.id === id);
  const kid = (s, k) => block(s.block).kids[k];
  const markOf = (s) => markColour(s);
  const lScale = keyframes('GSLowerScale', 'ui-scale', seg((s) => `${s.scale}%`));
  const lBg = keyframes('GSLowerBg', 'background-color', seg((s) => (s.hidden ? P.COL.T : P.COL[s.bg])));
  const lMark = keyframes('GSLowerMark', 'box-shadow', seg((s) => `${markOf(s)} 0px 0px 0px 6px`));
  const lOp = keyframes('GSLowerOp', 'opacity', seg((s) => (s.hidden ? '0' : '1')));
  const cOp = keyframes('GSCenterBgOp', 'opacity', seg((s) => num(kid(s, 'op'))));
  const wWash = keyframes('GSWashTest', 'wash-color', merge(P.WASHTEST.map(([w]) => [P.WASH_HOLD, w])));
  const wOp = keyframes('GSWashTestOp', 'opacity', merge(P.WASHTEST.map(([, o]) => [P.WASH_HOLD, num(o)])));
  const fl = keyframes('GSFlare', 'opacity', seg((s) => num(kid(s, 'fl'))));
  const ins = keyframes('GSInset', 'opacity', seg((s) => num(kid(s, 'in'))));
  const bev = keyframes('GSBevel', 'opacity', [[P.BEVEL_HALF, '1'], [P.BEVEL_PERIOD - P.BEVEL_HALF, '0']]);
  const topSegs = [...P.TOP_SCALES.map((s) => [P.TOP_HOLD, s]), [P.TOP_HIDE, 'HID']];
  const tScale = keyframes('GSTopScale', 'ui-scale', merge(topSegs.map(([d, s]) => [d, `${s === 'HID' ? 100 : s}%`])));
  const tOp = keyframes('GSTopOp', 'opacity', merge(topSegs.map(([d, s]) => [d, s === 'HID' ? '0' : '1'])));
  const glow = keyframes('GSDayGlow', 'opacity', [[P.GLOW_HALF, '0.1'], [P.TOP_HOLD - P.GLOW_HALF, '0.3']]);
  const font = keyframes('GSChatFont', 'font-size', P.FONTS.map((f) => [P.FONT_HOLD, `${f}px`]));
  const boxBg = keyframes('GSChatBoxBg', 'background-color', merge(P.CHATBOX.map(([s, d]) => [d, s.startsWith('M') ? '#ffffffff' : '#00000000'])));
  const boxH = keyframes('GSChatBoxH', 'height', merge(P.CHATBOX.map(([s, d]) => [d, s === 'M250' ? '250px' : s === 'M100' ? '100px' : '162px'])));
  const boxOp = keyframes('GSChatBoxOp', 'opacity', merge(P.CHATBOX.map(([s, d]) => [d, s === 'HID' ? '0' : '1'])));
  const panelOp = keyframes('GSChatLinesOp', 'opacity', merge(P.CHATBOX.map(([s, d]) => [d, s.startsWith('M') ? '0' : '1'])));
  const rest = keyframes('GSRestOp', 'opacity', [[P.REST_HIDE, '0'], [P.REST_PERIOD - P.REST_HIDE, '1']]);
  const css = [
    '/* GridStudio HUD capture C1 (not for play). Appended to Valve\'s custom_ui.css. */',
    STATIC_NOISE, FREEZE, EXPIRED,
    '/* Chat parked over the world, left, clear of every other region; no transitions. */',
    rule([`${H}DOTAChat#HudChat`, `${H}DOTAChat#HudChat.Channeling`], ['horizontal-align: left', 'margin-left: 40px', 'y: -437px', 'width: 800px', 'transition-duration: 0s']),
    rule([`${H}DOTAChat#HudChat #ChatLinesContainer`, `${H}DOTAChat#HudChat #ChatLinesPanel`], ['transition-duration: 0s']),
    '/* The minimap is painted after #lower_hud, so the lower HUD\'s own backdrop lies under it too (no content of the two overlaps). */',
    rule([`${H}#minimap_container`], ['z-index: 3']),
    globalCss,
    animated([`${H}#lower_hud`], [lScale, lBg, lMark, lOp]), lScale.text, lBg.text, lMark.text, lOp.text,
    animated([`${H}#minimap_container`], [lScale, lOp]),
    animated([`${H}#center_bg`], [cOp]), cOp.text,
    '/* Wash/opacity test panel: a copy of #center_bg\'s look over the world, top right (DOTAHud child, drawn over the global backdrop). */',
    animated(['DOTAHud #arcana_container'], [wWash, wOp], ['horizontal-align: left', 'vertical-align: top', 'margin-left: 1180px', 'margin-top: 200px', 'width: 489px', 'height: 145px',
      'flow-children: none', 'background-color: #1620346c', 'background-image: url("s2r://panorama/images/hud/reborn/ability_bg_psd.vtex_c")', 'background-size: 100%']), wWash.text, wOp.text,
    animated([`${H}#left_flare`, `${H}#right_flare`], [fl]), fl.text,
    animated([`${H}.AbilityInsetShadowLeft`, `${H}.AbilityInsetShadowRight`], [ins]), ins.text,
    animated([`${H}#AbilityBevel`], [bev]), bev.text,
    animated([`${H}#topbar`], [tScale, tOp]), tScale.text, tOp.text,
    animated([`${H}#topbar #DayGlow`], [glow]), glow.text,
    animated([`${H}DOTAChat#HudChat:not(.Active) .ChatLine`], [font]), font.text,
    animated([`${H}DOTAChat#HudChat #ChatLinesContainer`], [boxBg, boxH, boxOp]), boxBg.text, boxH.text, boxOp.text,
    animated([`${H}DOTAChat#HudChat #ChatLinesPanel`], [panelOp]), panelOp.text,
    animated(REST_KIDS.map((s) => H + s), [rest]), rest.text
  ].join('\n\n') + '\n';
  const marks = [...new Map(L.map((s) => [markOf(s), `${s.block}.${s.part}`]))].map(([c, k]) => ({ colour: c, slot: k }));
  return { css, marks };
}

// ---- C2: the real production rules for one setting, plus only the backdrop and a hide-all window ----
async function c2() {
  const { hudRules } = await import('/home/code/gridstudio/repo/scripts/hud-style.mjs');
  const SETTING = { opacity: 55, tint: '#2fa8ff', tintStrength: 30, hide: ['flares', 'statue', 'shadows', 'teamItems'], lower: 85, top: 110,
    chat: { align: 'center', y: 300, width: 600, lines: 400, font: 22, back: 50 } };
  const kids = keyframes('GSKidsOp', 'opacity', [[6, '0'], [21, '1']]);
  const css = ['/* GridStudio HUD capture C2 (not for play): production rules for one setting + backdrop. */',
    `/* setting: ${JSON.stringify(SETTING)} */`, hudRules(SETTING), STATIC_NOISE, FREEZE, EXPIRED, globalCss,
    animated(['#lower_hud', '#minimap_container', '#topbar', 'DOTAChat#HudChat', ...REST_KIDS].map((s) => H + s), [kids]), kids.text].join('\n\n') + '\n';
  return { css, SETTING };
}

// ---- Fallbacks (only when the C1 watcher reports a mechanism did not work) ----
// F-bg: the global backdrop moved to Valve's .GreenScreen, put under #HUDElements with z-index -1.
function fBg(c1css) {
  const from = animated([H.trim()], [gBg], ['background-color: #000000ff']);
  if (!c1css.includes(from)) throw new Error('F-bg: global rule not found');
  return c1css.replace('capture C1 (not for play)', 'capture F-bg (not for play)').replace(from, [rule([H.trim()], ['background-color: #00000000']),
    animated(['DOTAHud .GreenScreen'], [gBg], ['visibility: visible', 'z-index: -1', 'width: 100%', 'height: 100%', 'background-color: #000000ff'])].join('\n\n'));
}
// F-scale: one static (lower, top) pair; the lower blocks without a sweep. No chat, no world needed.
function fScale(lower, top) {
  const slots = [];
  for (const b of P.BLOCKS.filter((x) => x.sweep)) {
    const bgs = [...'KW', ...[...b.sweep, ...b.sweep], ...'KW'];
    bgs.forEach((bg, i) => slots.push({ block: b.id, scale: lower, bg, part: i < 2 ? 'g1' : i >= bgs.length - 2 ? 'g2' : 'core' }));
  }
  for (let i = 0; i < 4; i++) slots.push({ block: 'HIDE1', scale: lower, bg: 'K', part: 'core', hidden: true });
  const seg = (f) => merge(slots.map((s) => [P.SLOT, f(s)])), kid = (s, k) => P.BLOCKS.find((b) => b.id === s.block).kids[k];
  const lBg = keyframes('GSLowerBg', 'background-color', seg((s) => (s.hidden ? P.COL.T : P.COL[s.bg])));
  const lMark = keyframes('GSLowerMark', 'box-shadow', seg((s) => `${markColour(s)} 0px 0px 0px 6px`));
  const lOp = keyframes('GSLowerOp', 'opacity', seg((s) => (s.hidden ? '0' : '1')));
  const cOp = keyframes('GSCenterBgOp', 'opacity', seg((s) => num(kid(s, 'op'))));
  const fl = keyframes('GSFlare', 'opacity', seg((s) => num(kid(s, 'fl'))));
  const ins = keyframes('GSInset', 'opacity', seg((s) => num(kid(s, 'in'))));
  const bev = keyframes('GSBevel', 'opacity', [[8, '1'], [8, '0']]);
  const glow = keyframes('GSDayGlow', 'opacity', [[P.GLOW_HALF, '0.1'], [P.TOP_HOLD - P.GLOW_HALF, '0.3']]);
  return [`/* GridStudio HUD capture F-scale ${lower}/${top} (not for play). */`, STATIC_NOISE, FREEZE,
    rule([`${H}#lower_hud`, `${H}#minimap_container`], [`ui-scale: ${lower}%`]), rule([`${H}#topbar`], [`ui-scale: ${top}%`]),
    rule([`${H}DOTAChat#HudChat`], ['opacity: 0']), rule([`${H}#minimap_container`], ['z-index: 3']), globalCss,
    animated([`${H}#lower_hud`], [lBg, lMark, lOp]), lBg.text, lMark.text, lOp.text, animated([`${H}#minimap_container`], [lOp]),
    animated([`${H}#center_bg`], [cOp]), cOp.text, animated([`${H}#left_flare`, `${H}#right_flare`], [fl]), fl.text,
    animated([`${H}.AbilityInsetShadowLeft`, `${H}.AbilityInsetShadowRight`], [ins]), ins.text,
    animated([`${H}#AbilityBevel`], [bev]), bev.text, animated([`${H}#topbar #DayGlow`], [glow]), glow.text].join('\n\n') + '\n';
}
// F-chat: static fonts by line position (3 phrases typed 6 times = 18 lines; 18 px comes from C1; 8 groups for safety).
function fChat() {
  const fonts = [14, 16, 20, 22, 24, 26, 26, 26], rules = [];
  for (let k = 1; k <= 24; k++) rules.push(rule([`${H}DOTAChat#HudChat .ChatLine:nth-child(${k})`], [`font-size: ${fonts[Math.floor((k - 1) / 3)]}px`]));
  return ['/* GridStudio HUD capture F-chat (not for play). */', STATIC_NOISE, FREEZE, EXPIRED,
    rule(['#lower_hud', '#minimap_container', '#topbar', ...REST_KIDS].map((s) => H + s), ['opacity: 0']),
    rule([`${H}DOTAChat#HudChat`, `${H}DOTAChat#HudChat.Channeling`], ['horizontal-align: left', 'margin-left: 40px', 'y: -20px', 'height: 940px', 'width: 800px', 'transition-duration: 0s']),
    rule([`${H}DOTAChat#HudChat #ChatLinesContainer`], ['height: 640px', 'transition-duration: 0s']), ...rules, globalCss].join('\n\n') + '\n';
}

const one = c1(), two = await c2();
const F_SCALE = [[70, 70], [80, 80], [90, 90], [85, 110], [95, 120]];
const extra = [['f-bg-append.css', fBg(one.css)], ...F_SCALE.map(([l, t]) => [`f-scale-${l}-${t}-append.css`, fScale(l, t)]), ['f-chat-append.css', fChat()]];
for (const [name, text] of [['c1-append.css', one.css], ['c2-append.css', two.css], ...extra]) {
  if (/[^\x00-\x7f]/.test(text)) throw new Error(`${name}: not ASCII`);
  writeFileSync(new URL(name, OUT), text);
  console.log(`${name}: ${text.length} bytes, ${(text.match(/@keyframes/g) || []).length} keyframes`);
}
writeFileSync(new URL('plan.json', OUT), JSON.stringify({ slot: P.SLOT, global: P.GLOBAL, lower: P.LOWER, lowerPeriod: P.LOWER_PERIOD, marks: one.marks,
  top: { scales: P.TOP_SCALES, hold: P.TOP_HOLD, hide: P.TOP_HIDE, period: P.TOP_PERIOD }, fonts: P.FONTS, chatbox: P.CHATBOX, bevel: P.BEVEL_PERIOD, rest: [P.REST_PERIOD, P.REST_HIDE], c2: two.SETTING }, null, 1));
