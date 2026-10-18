// Final capture plan (design scratch): the tracks of capture C1 and the shared global track, as data.
// Every track is a list of [seconds, value] segments over its own period; keyframes are generated
// with EPS-wide steps. Used by gen.mjs (CSS) and sim.mjs (coverage over random clock offsets).
export const SLOT = 1.5, EPS = 0.01;
export const COL = { K: '#000000ff', W: '#ffffffff', G: '#808080ff', T: '#00000000' };
export const LOWER_SCALES = [100, 95, 90, 85, 80, 75, 70];
export const TOP_SCALES = [100, 105, 110, 115, 120, 95, 90, 85, 80, 75, 70];
export const FONTS = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26];

// Global track on #HUDElements (background-color only): K, W, T repeating. Any 3 consecutive full slots
// hold a K and a W; a T comes every 4.5 s. No gray here: the blend space is decided on the lower HUD's
// own gray, and the top bar / chat / rest have no additive or screen blends.
export const GLOBAL = ['K', 'W', 'T'];
export const GLOBAL_PERIOD = GLOBAL.length * SLOT;

// Lower blocks: child toggles held for the whole block (center_bg, flares, insets live on their own
// panels); scale + local backdrop + marker live on #lower_hud itself, so they can never drift apart.
const DEF = { op: 1, wash: '#ffffff00', fl: 1, in: 1 };
export const BLOCKS = [
  { id: 'HON', mark: 1, kids: DEF, sweep: 'KWG' },
  { id: 'AON', mark: 2, kids: { ...DEF, op: 0 }, sweep: 'KW' },
  { id: 'AOFF', mark: 3, kids: { ...DEF, op: 0, fl: 0, in: 0 }, sweep: 'KW' },
  { id: 'HOFF', mark: 4, kids: { ...DEF, fl: 0, in: 0 }, sweep: 'KW' },
  // The whole lower HUD and the minimap at opacity 0: the world under them (with a global T) and plates.
  { id: 'HIDE1', mark: 0, kids: DEF, fixed: 'K', core: 4, guard: 0, hidden: true },
  // Real views over the world (local backdrop transparent; the global one cycles K, W, T).
  { id: 'RDEF', mark: 5, kids: DEF, fixed: 'T', core: 6, guard: 2 },
  { id: 'RCLR', mark: 6, kids: { ...DEF, op: 0.35, fl: 0, in: 0 }, fixed: 'T', core: 6, guard: 2 },
  { id: 'RCMP', mark: 7, kids: { ...DEF, op: 0.7, fl: 0 }, fixed: 'T', core: 6, guard: 2, scale: 85 },
  { id: 'HIDE2', mark: 0, kids: DEF, fixed: 'K', core: 4, guard: 0, hidden: true }
];
// One lower slot: { block, scale, bg, part }. Guards absorb a child-clock offset of up to 3 s on either
// side (center_bg / flares / insets are their own panels); the watcher counts only 'core' slots.
export function lowerSlots() {
  const out = [];
  for (const b of BLOCKS) {
    if (b.sweep) {
      const order = [LOWER_SCALES.at(-1), ...LOWER_SCALES, LOWER_SCALES[0]];
      order.forEach((s, i) => { for (const bg of b.sweep) out.push({ block: b.id, scale: s, bg, part: i === 0 ? 'g1' : i === order.length - 1 ? 'g2' : 'core' }); });
    } else {
      const n = b.core + 2 * b.guard;
      for (let i = 0; i < n; i++) out.push({ block: b.id, scale: b.scale || 100, bg: b.fixed.length === 1 ? b.fixed : b.fixed[i % b.fixed.length], part: i < b.guard ? 'g1' : i >= n - b.guard ? 'g2' : 'core', hidden: !!b.hidden });
    }
  }
  return out;
}
export const LOWER = lowerSlots();
export const LOWER_PERIOD = LOWER.length * SLOT;

// Top bar: scale held 12 s, #DayGlow 0.1 / 0.3 for 6 s each (DayNightPulse ends).
export const TOP_HOLD = 12, GLOW_HALF = 6, TOP_HIDE = 6, TOP_PERIOD = TOP_SCALES.length * TOP_HOLD + TOP_HIDE; // + 6 s hidden
// Chat: font on the lines (clock restarts when the chat input closes), 7.5 s each.
export const FONT_HOLD = 7.5, FONT_PERIOD = FONTS.length * FONT_HOLD;
// Chat box: L = lines over the transparent box at Valve's 162 px (97.5 s); M = white box, lines hidden, 250 px then 100 px
// (7.5 s each: the opacity mask's stretch and how Panorama fits a taller box in the 460 px chat); HID = box at opacity 0 (6 s).
export const CHATBOX = [['L', 97.5], ['M250', 7.5], ['M100', 7.5], ['HID', 6]];
export const CHATBOX_PERIOD = CHATBOX.reduce((a, [, d]) => a + d, 0);
// Bevels (#AbilityBevel lives in the ability/item panels, made when the hero spawns: own clock).
export const BEVEL_HALF = 24, BEVEL_PERIOD = 48;
// Rest-hide: the other visible HUDElements children (quick stats, menu buttons ...) at opacity 0 for 6 s a minute.
export const REST_PERIOD = 60, REST_HIDE = 6;

// Wash/opacity test panel (#arcana_container styled exactly like #center_bg, over the world, top right):
// the wash law and the opacity model are fitted here, so #center_bg itself never carries a wash-color.
export const WASHTEST = [['#ffffff00', 1], ['#0000008c', 1], ['#ff0000ff', 1], ['#00ff0080', 1], ['#8a5cff73', 1], ['#2fa8ff4d', 1],
  ['#ffffff00', 0.35], ['#8a5cff73', 0.35], ['#2fa8ff4d', 0.55]];
export const WASH_HOLD = 6, WASH_PERIOD = WASHTEST.length * WASH_HOLD;
