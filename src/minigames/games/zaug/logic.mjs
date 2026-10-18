// «Логово Зауга» (Crownfall act III, Valve's `shmup`): the rules, without any drawing
// (tests/minigames-zaug.test.cjs). The numbers come from Valve's shmup vdata (assets/minigames/zaug/data.json:
// game, enemies, events, paths, track0) and the scene map's path entities (data/shmup_act3_map.json); what
// the data does not say — Zaug's state queue and phases, his fixed aim points, the bullet pattern formulas, the
// score categories and ratings, Shen's lives, death and respawn, the special attack — is Valve's own code,
// recovered from client.dll (docs/minigames/reverse/zaug.md); docs/minigames.md («Логово Зауга») lists what is
// still ours.
//
// Space: the game's 1244×700 field, x to the right, y down (Valve's own: the pterodactyl's «shoot down»
// pattern fires along (0, 1)). The map is in Hammer units seen by its side camera from −y; the field is the
// plane y = 256 of the paths, 2 units per game unit, centred on the camera (x 64, z 320). Time runs in ticks
// of 1/60 s (the cooldowns in the data are ticks). The game is one mutable object: step() advances a tick and
// returns the events it caused (sounds, effects, HUD), the view draws from the object.

export const TICK = 1 / 60;
export const WIDTH = 1244, HEIGHT = 700;
const UNITS_PER_PX = 2, CAMERA_X = 64, CAMERA_Z = 320;
// Map (x, z) → field (x, y).
export const toField = (x, z) => [WIDTH / 2 + (x - CAMERA_X) / UNITS_PER_PX, HEIGHT / 2 - (z - CAMERA_Z) / UNITS_PER_PX];

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const vec = (v, fallback = [0, 0, 0]) => (Array.isArray(v) ? [num(v[0], 0), num(v[1], 0), num(v[2], 0)] : fallback);

// The score categories of the victory screen, in Valve's order (DOTA_Crownfall_Shmup_ScoreCategory_*).
export const CATEGORIES = ['EnemyKill', 'Damage', 'Combo', 'BossKill', 'RemainingLives', 'RemainingTime'];
// client.dll (FUN_182ccb2c0, table 0x184db4ec0): a remaining life is worth 40 000 (the first game's bonus lives
// do not count), a whole second of the boss timer 1 000; the rating thresholds (FUN_1829221b0, 0x184db50d0).
export const LIFE_SCORE = 40000, SECOND_SCORE = 1000;
export const RATINGS = [['SPPPP', 3200000], ['SPPP', 3000000], ['SPP', 2800000], ['SP', 2650000], ['S', 2500000], ['A', 2000000], ['B', 1500000], ['C', 500000], ['F', 0]];
// crownfall_chapter3.vdata, encounter «shmup»: the reward thresholds (here they only light up).
export const REWARDS = [500000, 1500000, 2000000, 2500000];
export const COMBO_MAX = 10;

// --- paths ----------------------------------------------------------------------------------------
// path_simple: each node is [x, y, z, in-tangent xyz, out-tangent xyz] from the entity's origin; a segment is
// the cubic Bézier node → node + out → next + in → next. Sampled by arc length in map units (the paths'
// m_flSpeed is units per second: a familiar at 600 slows to 100 near the middle of the screen, as in the game).
export function buildPath(entity) {
  const o = vec(entity.origin), nodes = entity.pathnodes || [];
  const xs = [], zs = [], s = [];
  let total = 0;
  const push = (x, z) => {
    if (xs.length) total += Math.hypot(x - xs.at(-1), z - zs.at(-1));
    xs.push(x); zs.push(z); s.push(total);
  };
  if (nodes.length) push(o[0] + nodes[0][0], o[2] + nodes[0][2]);
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i], b = nodes[i + 1];
    const p0 = [a[0], a[2]], p1 = [a[0] + a[6], a[2] + a[8]], p2 = [b[0] + b[3], b[2] + b[5]], p3 = [b[0], b[2]];
    for (let k = 1; k <= 24; k++) {
      const t = k / 24, u = 1 - t, w = [u * u * u, 3 * t * u * u, 3 * t * t * u, t * t * t];
      push(o[0] + w[0] * p0[0] + w[1] * p1[0] + w[2] * p2[0] + w[3] * p3[0], o[2] + w[0] * p0[1] + w[1] * p1[1] + w[2] * p2[1] + w[3] * p3[1]);
    }
  }
  return { name: entity.targetname, xs, zs, s, length: total };
}
// The map point (x, z) at `d` units along the path (clamped to its ends).
export function pathPoint(path, d) {
  const { xs, zs, s } = path;
  if (d <= 0 || xs.length < 2) return [xs[0], zs[0]];
  if (d >= path.length) return [xs.at(-1), zs.at(-1)];
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid] <= d) lo = mid; else hi = mid; }
  const f = (d - s[lo]) / (s[hi] - s[lo] || 1);
  return [xs[lo] + (xs[hi] - xs[lo]) * f, zs[lo] + (zs[hi] - zs[lo]) * f];
}

// The speed along a path at time t: the Speed events are keyframes, linear between them; before the first
// the speed goes from m_flSpeed, after the last it stays.
export function pathSpeed(def, t) {
  const keys = def.speeds;
  if (!keys.length) return def.speed;
  if (t <= keys[0][0]) return keys[0][0] > 0 ? def.speed + (keys[0][1] - def.speed) * (t / keys[0][0]) : keys[0][1];
  for (let i = 0; i + 1 < keys.length; i++) {
    const [t0, s0] = keys[i], [t1, s1] = keys[i + 1];
    if (t <= t1) return t1 > t0 ? s0 + (s1 - s0) * (t - t0) / (t1 - t0) : s1;
  }
  return keys.at(-1)[1];
}

// --- the track ------------------------------------------------------------------------------------
// track0: entries one after another, each m_flDelay after the previous one started; m_nCount repeats every
// m_flRepeatInterval (moved by m_vRepeatOffset each time); children run from their parent's start the same
// way; offsets add up, path flips and colour inversions toggle down the tree.
export function scheduleTrack(entries, base = { t: 0, offset: [0, 0, 0], flip: false, invert: false }, out = []) {
  let cursor = base.t;
  for (const e of entries || []) {
    cursor += num(e.m_flDelay, 0);
    const count = Math.max(1, num(e.m_nCount, 1)), every = num(e.m_flRepeatInterval, 0);
    const offset = vec(e.m_vOffset), step = vec(e.m_vRepeatOffset);
    for (let k = 0; k < count; k++) {
      const at = { t: cursor + k * every, offset: base.offset.map((v, i) => v + offset[i] + step[i] * k), flip: base.flip !== !!e.m_bPathFlipped, invert: base.invert !== !!e.m_bInvertColors };
      if (e.m_strEventName) out.push({ ...at, event: e.m_strEventName });
      if (e.m_children?.length) scheduleTrack(e.m_children, at, out);
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

// --- config ---------------------------------------------------------------------------------------
const PATTERN = { k_eShmupBulletPattern_Radial: 'radial', k_eShmupBulletPattern_HorizontalLeft: 'left', k_eShmupBulletPattern_HorizontalRight: 'right', k_eShmupBulletPattern_VerticalInwards: 'inwards', k_eShmupBulletPattern_VerticalOutwards: 'outwards', k_eShmupBulletPattern_FixedDirection: 'fixed', k_eShmupBulletPattern_Player: 'player', k_eShmupBulletPattern_PlayerSpreadRandom: 'random', k_eShmupBulletPattern_PlayerSpreadEven: 'even' };
function bulletInfo(b = {}) {
  const dir = Array.isArray(b.m_vFixedDirection) ? b.m_vFixedDirection : [-1, 0];
  return {
    pattern: PATTERN[b.m_pattern] || 'player', count: num(b.m_nCount, 1), speed: num(b.m_flSpeed, 150), radius: num(b.m_flRadius, 8),
    perWave: num(b.m_nBulletsPerWave, 6), width: num(b.m_flAngleWidth, 0.08), offset: num(b.m_flAngleOffset, 0),
    speedPer: num(b.m_flSpeedPerBullet, 0), radiusPer: num(b.m_flRadiusPerBullet, 0), offsetPer: num(b.m_flAngleOffsetPerBullet, 0),
    offsetPerWave: num(b.m_flAngleOffsetPerWave, 0), stagger: num(b.m_flAngleStaggerPerWave, 0), sine: num(b.m_flAngleSinWaveOffset, 0),
    swap: !!b.m_bSwapColorPerBullet, interval: num(b.m_flInterval, 0), fixed: [num(dir[0], -1), num(dir[1], 0)], stored: !!b.m_bUseStoredPlayerLocation,
    jitter: [num(b.m_flRandomTargetingOffsetMin, 0), num(b.m_flRandomTargetingOffsetMax, 0)],
  };
}
const PATH_EVENT = { k_eShmupPathEventType_Speed: 'speed', k_eShmupPathEventType_Shoot: 'shoot', k_eShmupPathEventType_StorePlayerPosition: 'store', k_eShmupPathEventType_DestroySelf: 'destroy' };

export function zaugConfig(data = {}, map = {}) {
  const game = data.game || {}, p = game.m_player || {}, b = game.m_boss || {};
  const paths = {};
  for (const e of map.entities || []) if (e.classname === 'path_simple') paths[e.targetname] = buildPath(e);
  const pathDefs = {};
  for (const [name, d] of Object.entries(data.paths || {})) {
    if (!d || typeof d !== 'object' || !d.m_strNameInMap) continue;
    const events = (d.m_vecPathEvents || []).map((e) => ({ type: PATH_EVENT[e.m_type], t: num(e.m_flTime, 0), speed: num(e.m_flSpeed, 0), pattern: num(e.m_nBulletPatternIndex, 0) }));
    pathDefs[name] = {
      name, path: d.m_strNameInMap, speed: num(d.m_flSpeed, 400), offset: vec(d.m_vPathOffset),
      speeds: events.filter((e) => e.type === 'speed').map((e) => [e.t, e.speed]).sort((x, y) => x[0] - y[0]),
      actions: events.filter((e) => e.type !== 'speed').sort((x, y) => x.t - y.t),
    };
  }
  const enemies = {};
  for (const [name, e] of Object.entries(data.enemies || {})) {
    if (!e || typeof e !== 'object' || !e.m_strNameInMap) continue;
    const off = vec(e.m_vHitboxOffsetWS);
    enemies[name] = {
      name, model: e.m_strNameInMap, hp: num(e.m_nHealth, 1), radius: num(e.m_flHitboxRadius, 1), score: num(e.m_nKillScore, 0), boss: !!e.m_bIsBoss,
      scale: num(e.m_flModelScale, 1), hitbox: [off[0] / UNITS_PER_PX, -off[2] / UNITS_PER_PX],
      patterns: (e.m_vecBulletPatterns || []).map(bulletInfo), onDeath: (e.m_vecOnDeathBulletPatterns || []).map(bulletInfo), selfDestroy: (e.m_vecSelfDestroyBulletPatterns || []).map(bulletInfo),
    };
  }
  const events = {};
  for (const [name, e] of Object.entries(data.events || {})) {
    if (!e || typeof e !== 'object' || !e.m_type) continue;
    events[name] = e.m_type === 'k_eShmupEventType_UI' ? { ui: e.m_strUIEvent } : { path: e.m_strPathName, spawns: (e.m_vecEnemySpawns || []).map((s) => ({ enemy: s.m_strEnemyName, red: !!s.m_bRed, offset: vec(s.m_vOffset) })) };
  }
  const bossParts = (b.m_vecBodyParts || []).map((part) => ({ attach: part.m_strAttachName, radius: num(part.m_flRadius, 1), region: num(part.m_nHitRegionIndex, 0), multiplier: num(part.m_nDamageMultiplier, 1) }));
  return {
    width: num(game.m_flGameWidth, WIDTH), height: num(game.m_flGameHeight, HEIGHT), bossTime: num(game.m_flBossFightDuration, 101), comboBase: num(game.m_nComboBaseScore, 100),
    player: {
      lives: num(p.m_nLives, 5), bonusLives: num(p.m_nFirstTimeBonusLives, 5), scale: num(p.m_flModelScale, 1.5), shield: num(p.m_flShieldRadius, 50), heart: num(p.m_flHeartRadius, 10),
      maxSpeed: num(p.m_flMaxSpeed, 420), accel: num(p.m_flAccel, 130), launch: num(p.m_flAttackLaunchDistance, -5),
      swapCooldown: num(p.m_nModeSwapExtraAttackCooldown, 15), swapTicks: num(p.m_nModeSwapTicks, 15), collideDamage: num(p.m_nEnemyCollideDamage, 20),
      fire: { cooldown: num(p.m_nFireAttackCooldown, 6), radius: num(p.m_flFireAttackRadius, 8), speed: num(p.m_flFireAttackSpeed, 1700) },
      ice: { cooldown: num(p.m_nIceAttackCooldown, 6), radius: num(p.m_flIceAttackRadius, 8), speed: num(p.m_flIceAttackSpeed, 1700) },
      specialSpeed: num(p.m_flSpecialAttackSpeed, 1400), specialTicks: num(p.m_nTicksPerSpecialAttack, 1), specialDamage: num(p.m_nSpecialAttackDamage, 8),
      specialCost: num(p.m_nSpecialAttackAbsorptionCost, 6), maxAbsorb: num(p.m_nMaxBulletAbsorption, 48), spread: num(p.m_flBulletSpread, 30),
    },
    boss: {
      intro: num(b.m_flIntroDuration, 3), laser: [num(b.m_flMouthLaserChargeTime, 0.35), num(b.m_flMouthLaserDuration, 2)], wing: [num(b.m_flWingBarrageChargeTime, 0.7), num(b.m_flWingBarrageDuration, 3.4)],
      splinter: [num(b.m_fSplinterBlastChargeTime, 0.5), num(b.m_flSplinterBlastDuration, 1)], splinterCount: num(b.m_nSplinterBlastCount, 2), embrace: num(b.m_flColdEmbraceDuration, 5), parts: bossParts,
    },
    paths, pathDefs, enemies, events,
    track: scheduleTrack(data.track0?.m_vecEvents || []),
  };
}

// The boss's hit circles relative to its position (field units, y down) — the attachments of
// m_vecBodyParts on the rendered Winter Wyvern (scene.json → bossPartOffsets); a rough body if missing.
const DEFAULT_PARTS = {
  attach_head: [-97, -306], attach_neck: [-36, -272], attach_spine_1: [-80, -305], attach_spine_2: [41, -214], attach_spine_3: [101, -190],
  attach_spine_4: [129, -139], attach_spine_5: [156, -88], attach_knee_l: [95, -75], attach_knee_r: [81, -69], attach_tail_1: [218, -32], attach_tail_2: [299, -30],
};
// The frame of a boss clip at time t (scene.json units.boss.clips): loops wrap; a one-shot that has ended
// goes back to the idle loop. Shared by the rules (hit circles) and the picture.
export function bossFrame(clips, anim, t) {
  const c = clips?.[anim] || clips?.idle;
  if (!c) return { clip: 'idle', frame: 0 };
  const n = Math.floor(t * c.fps);
  if (c.loop) return { clip: clips[anim] ? anim : 'idle', frame: ((n % c.frames) + c.frames) % c.frames };
  if (n < c.frames) return { clip: anim, frame: Math.max(0, n) };
  return bossFrame(clips, 'idle', t - c.frames / c.fps);
}

// --- random ----------------------------------------------------------------------------------------
export function seeded(seed = 1) {
  let s = seed | 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// --- the game -----------------------------------------------------------------------------------------
export const PLAYER_START = [200, 350];
// Shen's death (FUN_182cfffd0): knocked off to the left (dying, ≥ 1 s and until x < −50), then placed at
// (0.2·W, 0.5·H) and 0.5 s later back (respawning: 3 s of invulnerability). INTRO_TIME: ours, no shots at the start.
export const DEAD_TIME = 0.5, INVULNERABLE = 3, INTRO_TIME = 1.2, FIELD_MARGIN = 45;
export const RESPAWN_POINT = [0.2 * WIDTH, 0.5 * HEIGHT];

// sprites: scene.json's units.boss ({ clips, parts }) — the hit circles follow the drawn frame.
export function createGame(config, { random = Math.random, bonus = false, boss = null } = {}) {
  const p = config.player;
  return {
    config, random, tick: 0, time: 0, phase: 'running', intro: INTRO_TIME,
    trackIndex: 0, section: 0, bossWarned: false, bossPhase: 0, minionCooldown: 0,
    input: { up: false, down: false, left: false, right: false, fire: false, target: null },
    player: {
      x: PLAYER_START[0], y: PLAYER_START[1], vx: 0, vy: 0, red: true, alive: true, state: 'alive', stateAt: 0, invulnerable: 0,
      cooldown: 0, swap: 0, absorb: 0, specialQueue: 0, specialTick: 0, special: null, lives: p.lives + (bonus ? p.bonusLives : 0), bonusLives: bonus ? p.bonusLives : 0, deaths: 0,
    },
    enemies: [], bullets: [], shots: [], emitters: [], nextId: 1,
    chain: { color: null, count: 0 }, combo: 0, maxCombo: 0,
    score: { EnemyKill: 0, Damage: 0, Combo: 0, BossKill: 0, RemainingLives: 0, RemainingTime: 0 },
    kills: 0, boss: null, bossSprite: boss?.parts ? boss : null, result: null,
  };
}
export const totalScore = (game) => CATEGORIES.reduce((sum, key) => sum + game.score[key], 0);
export const charges = (game) => Math.floor(game.player.absorb / game.config.player.specialCost);
export const maxCharges = (config) => Math.floor(config.player.maxAbsorb / config.player.specialCost);
// m_nComboBaseScore << min(combo − 1, 9): 100 … 51 200 (combo counted after the raise).
export const comboScore = (config, combo) => config.comboBase * 2 ** (Math.min(combo, COMBO_MAX) - 1);
// The extra lives the HUD shows: the lives left besides the current one.
export const reserveLives = (game) => Math.max(0, game.player.lives - 1);
export function ratingOf(total, kills, bossKill = 1) {
  if (kills === 0 && bossKill) return 'Assassin';
  return RATINGS.find(([, at]) => total >= at)[0];
}
const canAct = (p) => p.state === 'alive' || p.state === 'respawning';

// --- input ----------------------------------------------------------------------------------------
// A colour swap blocks swapping for m_nModeSwapTicks and sets the shot cooldown to
// m_nModeSwapExtraAttackCooldown + the new colour's cooldown (an assignment, not a max).
export function swapColor(game) {
  const p = game.player, c = game.config.player;
  if (game.phase !== 'running' || !canAct(p) || p.swap > 0) return [];
  p.red = !p.red; p.swap = c.swapTicks; p.cooldown = c.swapCooldown + (p.red ? c.fire : c.ice).cooldown;
  return [{ type: 'swap', red: p.red }];
}
// The special attack (FUN_182cfbf00): n = absorbed div cost shots (the rest of the absorption stays); the targets
// are the enemies by distance (×1.1 for those left of Shen), shot k going for target k mod their number.
export function special(game) {
  const p = game.player, c = game.config.player;
  if (game.phase !== 'running' || p.specialQueue > 0) return [];
  const n = Math.floor(p.absorb / c.specialCost);
  if (n < 1) return [];
  p.absorb -= n * c.specialCost;
  const targets = specialTargets(game);
  p.special = { n, k: 0, targets, next: game.tick };
  p.specialQueue = n; p.specialTick = 0;
  return [{ type: 'special', count: n }];
}
function targetPoint(game, t) {
  if (t === game.boss) { const head = bossPartCircles(game)[0]; return head ? [head.x, head.y, head.radius] : null; }
  const [hx, hy] = hitboxOf(t); return [hx, hy, t.def.radius];
}
function specialTargets(game) {
  const p = game.player, list = [];
  for (const e of game.enemies) if (e.alive && onField(...hitboxOf(e), 0)) list.push(e);
  if (game.boss?.alive && (game.boss.state !== 'dying')) list.push(game.boss);
  const dist = (t) => { const pt = targetPoint(game, t); if (!pt) return Infinity; const d = Math.hypot(pt[0] - p.x, pt[1] - p.y); return pt[0] < p.x ? d * 1.1 : d; };
  return list.map((t) => [dist(t), t]).sort((a, b) => a[0] - b[0]).map(([, t]) => t);
}

// --- spawning -------------------------------------------------------------------------------------------
function spawnEvent(game, entry, events) {
  const def = game.config.events[entry.event];
  if (!def) return;
  if (def.ui) {
    if (def.ui === 'ui.intermission_1') game.section = 1;
    if (def.ui === 'ui.intermission_2') game.section = 2;
    if (def.ui === 'ui.boss_warning') game.bossWarned = true;
    events.push({ type: 'ui', name: def.ui });
    return;
  }
  const pathDef = game.config.pathDefs[def.path];
  const path = pathDef && game.config.paths[pathDef.path];
  if (!path) return;
  for (const s of def.spawns) {
    const kind = game.config.enemies[s.enemy];
    if (!kind) continue;
    const offset = [0, 1, 2].map((i) => entry.offset[i] + s.offset[i] + pathDef.offset[i]);
    if (kind.boss) { spawnBoss(game, kind, events); continue; }
    const enemy = {
      id: game.nextId++, kind: s.enemy, def: kind, pathDef, path, offset, flip: entry.flip, red: s.red !== entry.invert,
      hp: kind.hp, t: 0, d: 0, x: 0, y: 0, next: 0, stored: null, alive: true, flash: 0, dir: -1,
    };
    placeEnemy(enemy);
    game.enemies.push(enemy);
    events.push({ type: 'spawn', id: enemy.id, kind: enemy.kind });
  }
}
function fieldOf(pathDef, path, offset, flip, d) {
  const [x, z] = pathPoint(path, d);
  const [fx, fy] = toField(x + offset[0], z + offset[2]);
  return [fx, flip ? HEIGHT - fy : fy];
}
function placeEnemy(e) {
  const [x, y] = fieldOf(e.pathDef, e.path, e.offset, e.flip, e.d);
  if (x !== e.x) e.dir = x < e.x ? -1 : 1;
  e.x = x; e.y = y;
}
// The hit circle's centre: the model position plus the vdata hitbox offset (world units → field).
export const hitboxOf = (e) => [e.x + e.def.hitbox[0], e.y + e.def.hitbox[1]];
const onField = (x, y, margin = 0) => x >= -margin && x <= WIDTH + margin && y >= -margin && y <= HEIGHT + margin;

// --- bullets (FUN_182cfab70) ----------------------------------------------------------------------------------
// A command fires `count` bullets: one per m_flInterval (all at once without one), counted from the command's
// start minus its delay; a late bullet is placed where it would be had it left on time. Angles (y down):
// - radial: i·2π/count + i·offsetPerBullet, direction (−cos a, sin a) — bullet 0 to the left;
// - left: (−1, 0); fixed: m_vFixedDirection at speed + i·speedPerBullet; right / inwards / outwards fire nothing;
// - player: at Shen now (plus a random offset), + i·offsetPerBullet;
// - random: uniform in aim ± width·π, + offset + i·offsetPerBullet + (i div perWave)·offsetPerWave;
// - even: aim − width·π + offset + j·2·width·π/(perWave − 1) + i·offsetPerBullet + wave·offsetPerWave
//   + (wave even ? stagger : 0) + sin(wave·π / nWaves)·sine, with wave = i div perWave, j = i mod perWave;
// random and even aim at the point stored when the command started, from where the source is now.
const angleTo = (x, y, tx, ty) => Math.atan2(ty - y, tx - x);
function startPattern(game, owner, info, { red, origin, target = null, delay = 0 }) {
  const em = { owner, info, red, k: 0, start: game.tick, delay, origin, aim: target || [game.player.x, game.player.y] };
  game.emitters.push(em);
  return em;
}
export function patternAngle(info, i, aim, random = Math.random, toShen = aim) {
  const PI = Math.PI;
  switch (info.pattern) {
    case 'radial': return Math.atan2(Math.sin(i * 2 * PI / info.count + i * info.offsetPer), -Math.cos(i * 2 * PI / info.count + i * info.offsetPer));
    case 'left': return PI;
    case 'fixed': return Math.atan2(info.fixed[1], info.fixed[0]);
    case 'player': return toShen + i * info.offsetPer;
    case 'random': return aim - info.width * PI + random() * 2 * info.width * PI + info.offset + i * info.offsetPer + Math.floor(i / Math.max(1, info.perWave)) * info.offsetPerWave;
    case 'even': {
      const per = Math.max(1, info.perWave), wave = Math.floor(i / per), j = i % per, waves = Math.floor(info.count / per);
      return aim - info.width * PI + info.offset + (per > 1 ? j * 2 * info.width * PI / (per - 1) : info.width * PI) + i * info.offsetPer + wave * info.offsetPerWave
        + (wave % 2 === 0 ? info.stagger : 0) + (waves > 0 ? Math.sin(wave * PI / waves) * info.sine : 0);
    }
    default: return null;
  }
}
function emitBullet(game, em, i, late) {
  const { info } = em, p = game.player;
  if (info.pattern === 'right' || info.pattern === 'inwards' || info.pattern === 'outwards') return;
  const [ox, oy] = em.origin();
  let toShen = 0;
  if (info.pattern === 'player') {
    const [lo, hi] = info.jitter, r = lo + (hi - lo) * game.random(), a = game.random() * Math.PI * 2;
    toShen = angleTo(ox, oy, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
  }
  const angle = patternAngle(info, i, angleTo(ox, oy, em.aim[0], em.aim[1]), game.random, toShen);
  const spread = info.pattern === 'random' || info.pattern === 'even';
  const speed = info.speed + (spread || info.pattern === 'fixed' ? info.speedPer * i : 0);
  const radius = Math.max(2, info.radius + (spread ? info.radiusPer * i : 0));
  const red = info.swap && i % 2 === 1 ? !em.red : em.red;
  const vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
  game.bullets.push({ x: ox + vx * late, y: oy + vy * late, vx, vy, r: radius, red, age: late });
}
function runEmitters(game) {
  for (const em of game.emitters) {
    if (em.owner && em.owner !== game.boss && em.owner.alive === false) { em.done = true; continue; }
    const t = (game.tick - em.start) * TICK - em.delay, { info } = em;
    if (t < -1e-9) continue;
    const released = info.interval > 0 ? Math.min(info.count, Math.floor(t / info.interval + 1e-6) + 1) : info.count;
    for (; em.k < released; em.k++) emitBullet(game, em, em.k, Math.max(0, t - em.k * info.interval));
    if (em.k >= info.count) em.done = true;
  }
  game.emitters = game.emitters.filter((em) => !em.done);
}

// --- damage, kills and the combo -------------------------------------------------------------------------
// FUN_182ccb840: the whole hit (×2 against the other colour) goes to the Damage category — not cut to the health
// left; body collisions score nothing.
function damageEnemy(game, e, amount, events, source = {}) {
  if (!e.alive || amount <= 0) return;
  e.hp -= amount; e.flash = 0.08;
  if (!source.collide) game.score.Damage += amount;
  if (e.hp > 0) { events.push({ type: 'hit', id: e.id, bonus: source.bonus || false }); return; }
  e.alive = false;
  const [hx, hy] = hitboxOf(e);
  game.score.EnemyKill += e.def.score;
  if (e.def.score > 0) game.kills++;
  events.push({ type: 'kill', id: e.id, kind: e.kind, x: hx, y: hy, red: e.red, score: e.def.score });
  for (const info of e.def.onDeath) startPattern(game, null, info, { red: e.red, origin: () => [hx, hy] });
  // FUN_182cc1350: killed while Shen has its colour, an enemy answers with a burst at her — clamp(maxHP div 2, 3, 6)
  // bullets of its colour (she can absorb them).
  if (game.player.red === e.red) {
    startPattern(game, null, sameColourBurst(e.def.hp), { red: e.red, origin: () => [hx, hy], target: [game.player.x, game.player.y] });
    events.push({ type: 'burst', x: hx, y: hy, red: e.red });
  }
  if (game.bossPhase === 0) chainKill(game, e.red, hx, hy, events);
}
export const sameColourBurst = (hp) => ({ pattern: 'random', count: clamp(Math.floor(hp / 2), 3, 6), speed: 340, speedPer: 5, radius: 7, radiusPer: 0, width: 0.02, perWave: 6, offset: 0, offsetPer: 0, offsetPerWave: 0, stagger: 0, sine: 0, swap: false, interval: 0, fixed: [-1, 0], stored: false, jitter: [0, 0] });
// FUN_182ce6450, before Zaug comes only: three kills of one colour in a row raise the combo (100 × 2^(combo−1),
// «MAX» from 10 on); a kill of the other colour in the middle of a set breaks it.
export function chainKill(game, red, x = 0, y = 0, events = []) {
  const ch = game.chain, color = red ? 'red' : 'blue';
  if (ch.count > 0 && ch.color !== color) {
    if (game.combo > 0) events.push({ type: 'comboBreak', x, y });
    game.combo = 0; ch.count = 0;
  }
  if (ch.count === 0) ch.color = color;
  ch.count++;
  if (ch.count >= 3) {
    game.combo++; game.maxCombo = Math.max(game.maxCombo, game.combo);
    const bonus = comboScore(game.config, game.combo);
    game.score.Combo += bonus;
    events.push({ type: 'combo', combo: game.combo, score: bonus, x, y, color });
    ch.count = 0;
  } else events.push({ type: 'chain', count: ch.count, color });
  return events;
}

// FUN_182ccbb00: a hit costs a life; fewer than one left is the end.
function killPlayer(game, events) {
  const p = game.player;
  if (p.state !== 'alive' || game.phase !== 'running' || game.godMode) return false; // godMode: tests and the debug hook
  p.lives--; p.deaths++;
  p.alive = false; p.state = 'dying'; p.stateAt = game.time; p.deathX = p.x; p.deathY = p.y;
  events.push({ type: 'playerKilled', x: p.x, y: p.y, red: p.red });
  if (p.lives < 1) { game.phase = 'over'; game.result = { victory: false, reason: 'lives' }; events.push({ type: 'gameOver', reason: 'lives' }); }
  return true;
}
function stepPlayerState(game, events) {
  const p = game.player, t = game.time - p.stateAt;
  if (p.state === 'dying') {
    p.vx = -300 - 500 * t; p.vy = 100 + 200 * t;
    p.x += p.vx * TICK; p.y += p.vy * TICK;
    if (t > 1 && p.x < -50) { p.state = 'dead'; p.stateAt = game.time; p.x = RESPAWN_POINT[0]; p.y = RESPAWN_POINT[1]; p.vx = 0; p.vy = 0; }
  } else if (p.state === 'dead') {
    if (p.lives >= 1 && t > DEAD_TIME) {
      p.state = 'respawning'; p.stateAt = game.time; p.alive = true; p.invulnerable = INVULNERABLE;
      game.combo = 0; game.chain.count = 0; game.chain.color = null; // silently
      events.push({ type: 'respawn' });
    }
  } else if (p.state === 'respawning') {
    p.invulnerable = Math.max(0, INVULNERABLE - t);
    if (t > INVULNERABLE) { p.state = 'alive'; p.invulnerable = 0; }
  }
}

// --- the boss (FUN_182cfd740 / FUN_182ce9280 / FUN_182cebe80) ---------------------------------------------------
// A state machine with a queue of (state, duration). Valve's positions are the hit box's centre; the model (and
// b.x, b.y here) stands at pos − (100, −300). Every attack aims at a fixed point on the left edge.
export const BOSS_IDLE = [900, 600];
const V = (x, y) => [x - 100, y + 300];
const STATE = {
  intro: { to: [1000, 300], speed: 900 }, idle: { to: [1000, 300], speed: 100 }, charge: { to: [1000, 450], speed: 800 }, laser4: { speed: 500 },
  laser7: { to: [1400, 400], speed: 500 }, laser8: { to: [1400, 600], speed: 500 }, wingTell: { to: [900, 290], speed: 500 }, wing: { to: [900, 290], speed: 500 },
  embrace: { to: [1100, 400], speed: 300 }, splinterTell: { to: [1000, 300], speed: 500 }, splinter: { to: [1000, 300], speed: 500 }, swap: { speed: 500 },
  blanket: { to: [1100, 320], speed: 500 }, flee: { to: [400, -800] }, escaped: { speed: 500 },
};
const ANIM = { intro: 'idle', idle: 'idle', charge: 'laser', laser4: 'laser', laser7: 'laser', laser8: 'laser', wingTell: 'wing', wing: 'wing', embrace: 'embrace', splinterTell: 'splinter', splinter: 'splinter', blanket: 'wing', flee: 'idle' };
const ATTACK = { charge: 'laser', laser4: 'laser', laser7: 'laser', laser8: 'laser', wingTell: 'wing', wing: 'wing', embrace: 'embrace', splinterTell: 'splinter', splinter: 'splinter', blanket: 'blanket' };
function stateDuration(game, state, dur) {
  if (dur > 0) return dur;
  const c = game.config.boss;
  return { intro: c.intro, charge: c.laser[0], laser4: c.laser[1], laser7: c.laser[1], laser8: c.laser[1], wingTell: c.wing[0], wing: c.wing[1], embrace: c.embrace,
    splinterTell: c.splinter[0], splinter: c.splinter[1], blanket: 4.25, flee: 5, escaped: 120 }[state] || 0;
}
function spawnBoss(game, kind, events) {
  const [x, y] = V(2400, 300);
  game.boss = {
    def: kind, hp: kind.hp, maxHp: kind.hp, x, y, alive: true, flash: 0, red: false, phase: 1, invulnerable: true,
    state: null, stateTime: 0, stateEnd: 0, queue: [], target: V(1000, 300), speed: 900, counter: 0, lastSeries: null, fled: false,
    fightEnd: game.tick + Math.round(game.config.bossTime / TICK), timeLeft: game.config.bossTime, attack: null, charge: 0, anim: 'idle', animTime: 0, embraceSound: 0,
  };
  game.bossPhase = 1;
  enterBoss(game, 'intro', 0, events);
  events.push({ type: 'bossSpawn' });
}
export function bossOffsets(game) {
  const b = game.boss, s = game.bossSprite;
  if (!b || !s) return DEFAULT_PARTS;
  const { clip, frame } = bossFrame(s.clips, b.anim, b.animTime);
  return s.parts[clip]?.[frame] || DEFAULT_PARTS;
}
export function bossPartCircles(game) {
  const b = game.boss;
  if (!b) return [];
  const offsets = bossOffsets(game);
  return game.config.boss.parts.map((part) => {
    const off = offsets[part.attach] || [0, 0];
    return { ...part, x: b.x + off[0], y: b.y + off[1] };
  });
}
const setAnim = (b, name) => { if (b.anim !== name) { b.anim = name; b.animTime = 0; } };
const partAt = (game, attach) => () => { const off = bossOffsets(game)[attach] || [0, 0]; return [game.boss.x + off[0], game.boss.y + off[1]]; };
function enterBoss(game, state, dur, events) {
  const b = game.boss, pats = b.def.patterns, prev = b.state;
  // leaving Cold Embrace: the ice shatters into three rings (patterns 6, 7, 8) of Zaug's colour
  if (prev === 'embrace') {
    for (const i of [6, 7, 8]) if (pats[i]) startPattern(game, b, pats[i], { red: b.red, origin: partAt(game, 'attach_spine_2') });
    events.push({ type: 'bossShatter' });
  }
  const st = STATE[state] || {};
  b.counter++; b.state = state; b.stateTime = 0; b.duration = stateDuration(game, state, dur);
  b.stateEnd = game.tick + Math.max(1, Math.round(b.duration / TICK));
  b.speed = 500; b.invulnerable = false;
  if (st.to) b.target = V(...st.to);
  if (st.speed) b.speed = st.speed;
  b.attack = ATTACK[state] || null; b.charge = state === 'charge' ? b.duration : 0;
  if (ANIM[state]) setAnim(b, ANIM[state]);
  const head = partAt(game, 'attach_head'), spine = partAt(game, 'attach_spine_2'), H = HEIGHT;
  switch (state) {
    case 'intro': b.invulnerable = true; break;
    case 'laser4': if (pats[1]) startPattern(game, b, pats[1], { red: b.red, origin: head, target: [0, H * 0.5], delay: 0.6 }); events.push({ type: 'bossSound', name: 'breath' }); break;
    case 'laser7': case 'laser8':
      if (pats[4]) startPattern(game, b, pats[4], { red: b.red, origin: head, target: [0, state === 'laser7' ? 210 : 525], delay: 0.6 });
      events.push({ type: 'bossSound', name: 'breath' }); break;
    case 'wingTell': spawnMinions(game, events); break;
    case 'wing': if (pats[0]) startPattern(game, b, pats[0], { red: b.red, origin: spine, target: [0, H * 0.5] }); events.push({ type: 'bossSound', name: 'wing' }); break;
    case 'embrace':
      b.invulnerable = true; b.phase = 2; game.bossPhase = 2; b.embraceSound = game.tick + Math.round(0.6 / TICK);
      for (const e of game.enemies) if (e.alive && e.minion) e.leaving = true;
      events.push({ type: 'bossSound', name: 'roar' });
      break;
    case 'splinter': spawnSplinters(game, events); events.push({ type: 'bossSound', name: 'splinter' }); break;
    case 'swap': b.red = !b.red; break;
    case 'blanket': {
      const base = b.counter & 1 ? 9 : 12;
      for (const i of [base, base + 1]) if (pats[i]) startPattern(game, b, pats[i], { red: b.red, origin: spine, target: [0, H * 0.5], delay: 0.5 });
      events.push({ type: 'bossSound', name: 'breath' });
      break;
    }
    case 'flee': { b.speed = Math.hypot(b.target[0] - b.x, b.target[1] - b.y) / 5; events.push({ type: 'bossLeaves' }); break; }
    case 'escaped':
      game.phase = 'over'; game.result = { victory: false, reason: 'time' };
      events.push({ type: 'gameOver', reason: 'time' });
      break;
    default:
  }
  events.push({ type: 'bossState', state });
}
// The next series, decided when a state ends with the queue empty.
function bossSeries(game) {
  const b = game.boss, q = b.queue, push = (state, dur = 0) => q.push([state, dur]);
  if (b.state === 'intro') { push('idle', 0.5); push('wingTell'); push('wing'); push('wing'); push('swap'); push('idle', 0.9); push('charge'); push('laser4'); return; }
  if (b.phase < 2) {
    push('swap'); push('wingTell'); push('wing'); push('wing'); push('swap'); push('idle', 0.9); push('charge'); push('laser4');
    if (game.random() < 0.3) { push('swap'); push('idle', 0.5); push('charge'); push('laser4'); }
    return;
  }
  const splinters = game.enemies.some((e) => e.alive && e.kind === 'enemy_splinter_blast');
  if (!splinters && b.lastSeries !== 'A') {
    b.lastSeries = 'A';
    push('splinterTell'); push('splinter'); push('idle', 1);
    if (game.random() < 0.5) { push('swap'); push('charge'); push('laser7'); push('swap'); push('charge'); push('laser8'); }
    else { push('charge'); push('laser8'); push('swap'); push('charge'); push('laser7'); }
    push('idle', 0.5);
    return;
  }
  b.lastSeries = 'B';
  push('swap'); push('wingTell'); push('blanket'); push('blanket'); push('idle', 1);
}
function spawnMinions(game, events) {
  const kind = game.config.enemies.enemy_minion_dragon, b = game.boss;
  for (const e of game.enemies) if (e.alive && e.minion) e.leaving = true;
  if (!kind) return;
  for (let i = 0; i < 2; i++) {
    const e = { id: game.nextId++, kind: 'enemy_minion_dragon', def: kind, red: !b.red, hp: kind.hp, x: b.x + 500, y: b.y, alive: true, flash: 0, free: true, minion: true, dir: -1,
      home: [WIDTH - 40, i === 0 ? 160 : HEIGHT] };
    game.enemies.push(e);
    events.push({ type: 'spawn', id: e.id, kind: e.kind });
  }
}
function spawnSplinters(game, events) {
  const kind = game.config.enemies.enemy_splinter_blast, b = game.boss, n = game.config.boss.splinterCount;
  if (!kind) return;
  const [kx, ky] = partAt(game, 'attach_knee_l')();
  for (let i = 0; i < n; i++) {
    const to = [0.6 * WIDTH, i / n * (HEIGHT - 10) + 130];
    const e = { id: game.nextId++, kind: 'enemy_splinter_blast', def: kind, red: i % 2 ? !b.red : b.red, hp: kind.hp, x: kx, y: ky, from: [kx, ky], to, born: game.tick, release: b.stateEnd,
      fuse: i === 1 ? 300 : 180, alive: true, flash: 0, free: true, splinter: true, dir: -1, scale: 0.2 };
    game.enemies.push(e);
    events.push({ type: 'spawn', id: e.id, kind: e.kind });
  }
}
function stepBoss(game, events) {
  const b = game.boss;
  if (!b) return;
  b.stateTime += TICK; b.animTime += TICK; b.flash = Math.max(0, b.flash - TICK);
  if (b.state === 'dying') return;
  b.timeLeft = Math.max(0, (b.fightEnd - game.tick) * TICK);
  if (b.embraceSound && game.tick >= b.embraceSound) { b.embraceSound = 0; events.push({ type: 'bossAttack', name: 'embrace' }); }
  // pos += normalize(target − pos) · min(|target − pos|, speed / 60)
  const dx = b.target[0] - b.x, dy = b.target[1] - b.y, d = Math.hypot(dx, dy);
  if (d > 1e-9) { const k = Math.min(d, b.speed * TICK) / d; b.x += dx * k; b.y += dy * k; }
  if (game.tick < b.stateEnd || game.phase !== 'running') return;
  if (game.tick >= b.fightEnd) {
    if (!b.fled) { b.fled = true; b.queue = [['flee', 0], ['escaped', 0]]; }
  } else if (b.phase < 2 && b.hp < Math.floor(b.maxHp / 2)) {
    b.queue = [['embrace', 0], ['idle', 1.5], ['splinterTell', 0], ['splinter', 0], ['idle', 1]];
  }
  if (!b.queue.length) bossSeries(game);
  const [state, dur] = b.queue.shift();
  enterBoss(game, state, dur, events);
}
// FUN_182ccb840: hit region 0 (head, neck) full damage, 1–2 max(1, damage div 2), 3+ none; m_nDamageMultiplier is
// not read. An invulnerable Zaug (Intro, Cold Embrace) takes nothing and scores nothing.
export const regionDamage = (amount, region) => (region >= 3 ? 0 : region === 0 ? amount : Math.max(1, Math.floor(amount / 2)));
function damageBoss(game, amount, region, events, { bonus = false, collide = false } = {}) {
  const b = game.boss;
  if (!b || !b.alive || b.state === 'dying' || amount <= 0) return;
  if (b.invulnerable) { events.push({ type: 'bossBlocked' }); return; }
  if (!collide) game.score.Damage += amount;
  b.hp -= regionDamage(amount, region); b.flash = 0.06;
  events.push({ type: 'bossHit', bonus });
  if (b.hp <= 0) bossKilled(game, events);
}
function bossKilled(game, events) {
  const b = game.boss, p = game.player;
  b.hp = 0; b.alive = false; b.state = 'dying'; setAnim(b, 'death');
  game.score.BossKill += b.def.score;
  game.emitters = []; game.bullets = [];
  for (const e of game.enemies) if (e.alive) { e.alive = false; events.push({ type: 'kill', id: e.id, kind: e.kind, x: hitboxOf(e)[0], y: hitboxOf(e)[1], red: e.red, score: 0 }); }
  const seconds = Math.floor((b.fightEnd - game.tick) * TICK);
  if (seconds > 0) game.score.RemainingTime += seconds * SECOND_SCORE;
  game.score.RemainingLives += Math.max(0, p.lives - p.bonusLives) * LIFE_SCORE;
  game.phase = 'victory';
  const total = totalScore(game);
  game.result = { victory: true, total, rating: ratingOf(total, game.kills, game.score.BossKill), maxCombo: game.maxCombo,
    scores: CATEGORIES.map((key) => [key, game.score[key]]).filter(([, v]) => v > 0) };
  events.push({ type: 'bossKilled', x: b.x, y: b.y }, { type: 'victory' });
}

// --- one tick ---------------------------------------------------------------------------------------------
export function step(game) {
  const events = [];
  if (game.phase !== 'running') { coast(game); return events; }
  const cfg = game.config, pc = cfg.player, p = game.player, input = game.input;
  game.tick++; game.time += TICK;
  if (game.intro > 0) game.intro -= TICK;

  // The track.
  while (game.trackIndex < cfg.track.length && cfg.track[game.trackIndex].t <= game.time) spawnEvent(game, cfg.track[game.trackIndex++], events);

  stepPlayerState(game, events);
  if (canAct(p)) {
    // FUN_182cf9210: velocity = input × m_flMaxSpeed at once (m_flAccel is never read); held 45 inside the field.
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0), dy = (input.down ? 1 : 0) - (input.up ? 1 : 0), want = pc.maxSpeed;
    if (input.target) {
      dx = input.target[0] - p.x; dy = input.target[1] - p.y;
      const dist = Math.hypot(dx, dy);
      want = Math.min(pc.maxSpeed, dist / TICK);
      if (dist < 0.5) { dx = 0; dy = 0; }
    }
    const len = Math.hypot(dx, dy) || 1;
    p.vx = dx ? dx / len * want : 0; p.vy = dy ? dy / len * want : 0;
    p.x = clamp(p.x + p.vx * TICK, FIELD_MARGIN, WIDTH - FIELD_MARGIN); p.y = clamp(p.y + p.vy * TICK, FIELD_MARGIN, HEIGHT - FIELD_MARGIN);
    if (p.swap > 0) p.swap--;
    // The main attack: with the cooldown above zero it only counts down; otherwise two bolts m_flBulletSpread
    // apart and the cooldown is set to 6 — a shot every 7 ticks.
    if (p.cooldown > 0) p.cooldown--;
    else if (input.fire && game.intro <= 0) {
      const a = p.red ? pc.fire : pc.ice;
      for (const side of [-1, 1]) game.shots.push({ x: p.x - pc.launch + 40, y: p.y + side * pc.spread / 2, vx: a.speed, vy: 0, r: a.radius, red: p.red, damage: 1, special: false, age: 0 });
      p.cooldown = a.cooldown;
      events.push({ type: 'shoot', red: p.red });
    }
  }
  // The special attack goes on whatever happens to Shen: shot k every m_nTicksPerSpecialAttack + 1 ticks.
  const sp = p.special;
  if (sp && sp.k < sp.n && game.tick >= sp.next) {
    const k = sp.k++;
    sp.next = game.tick + pc.specialTicks + 1;
    p.specialQueue = sp.n - sp.k;
    const a = (Math.floor(k / 2) * 0.05 + 0.4) * Math.PI, dir = [Math.cos(a), k % 2 === 0 ? -Math.sin(a) : Math.sin(a)];
    const speed = Math.min(600, 600 / (k + 1)) + (pc.specialSpeed - 600);
    const target = sp.targets.length ? sp.targets[k % sp.targets.length] : null;
    game.shots.push({ x: p.x + 20, y: p.y, vx: dir[0] * speed, vy: dir[1] * speed, r: 15, red: p.red, damage: pc.specialDamage, special: true, age: 0, k, target, list: sp.targets });
    events.push({ type: 'specialShot', red: p.red });
    if (sp.k >= sp.n) { p.special = null; p.specialQueue = 0; }
  }

  // Enemies along their paths (the boss's minions and splinters fly free).
  for (const e of game.enemies) {
    if (!e.alive) continue;
    e.flash = Math.max(0, e.flash - TICK);
    if (e.free) { stepFree(game, e, events); continue; }
    const prevT = e.t;
    e.t += TICK;
    e.d += pathSpeed(e.pathDef, e.t) * TICK;
    placeEnemy(e);
    for (const a of e.pathDef.actions) if (a.t > prevT && a.t <= e.t) pathAction(game, e, a, events);
    if (e.alive && e.d >= e.path.length) { e.alive = false; e.escaped = true; }
  }
  stepMinionFire(game, events);
  stepBoss(game, events);
  runEmitters(game);

  // Enemy bullets: absorbed by the shield when of her colour; the other colour at the heart costs a life — or, while
  // she respawns, just goes out.
  const keep = [];
  for (const b of game.bullets) {
    b.x += b.vx * TICK; b.y += b.vy * TICK; b.age += TICK;
    if (!onField(b.x, b.y, 60)) continue;
    if (canAct(p) && game.phase === 'running') {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (b.red === p.red && d < pc.shield + b.r) {
        const before = Math.floor(p.absorb / pc.specialCost);
        p.absorb = Math.min(pc.maxAbsorb, p.absorb + 1);
        const after = Math.floor(p.absorb / pc.specialCost);
        events.push({ type: 'absorb', x: b.x, y: b.y, red: b.red });
        if (after > before) events.push({ type: after * pc.specialCost >= pc.maxAbsorb ? 'chargeMax' : 'charge', charges: after });
        continue;
      }
      if (b.red !== p.red && d < pc.heart + b.r) {
        if (p.state === 'respawning') continue;
        killPlayer(game, events); continue;
      }
    }
    keep.push(b);
  }
  game.bullets = keep;

  // The player's shots against enemies and the boss.
  const shots = [];
  for (const s of game.shots) {
    if (s.special) steerShot(game, s);
    s.x += s.vx * TICK; s.y += s.vy * TICK; s.age += TICK;
    if (!onField(s.x, s.y, s.special ? 200 : 40) || s.age > (s.special ? 6 : 3)) continue;
    let used = false;
    if (s.special) {
      // a special shot hits only its own target, once it is closer than the target's radius
      const t = s.target;
      if (t && game.phase === 'running') {
        const pt = targetPoint(game, t);
        if (pt && Math.hypot(s.x - pt[0], s.y - pt[1]) < pt[2]) {
          used = true;
          const bonus = s.red !== t.red;
          if (t === game.boss) damageBoss(game, s.damage * (bonus ? 2 : 1), 0, events, { bonus });
          else damageEnemy(game, t, s.damage * (bonus ? 2 : 1), events, { bonus });
          events.push({ type: 'specialHit', x: s.x, y: s.y, red: s.red });
        }
      }
      if (!used) shots.push(s);
      continue;
    }
    for (const e of game.enemies) {
      if (!e.alive || (e.splinter && !e.hittable)) continue;
      const [hx, hy] = hitboxOf(e);
      if (!onField(hx, hy, -4)) continue;
      if (Math.hypot(s.x - hx, s.y - hy) < e.def.radius + s.r) {
        const bonus = s.red !== e.red;
        damageEnemy(game, e, s.damage * (bonus ? 2 : 1), events, { bonus });
        used = true; break;
      }
    }
    const b = game.boss;
    if (!used && b?.alive && b.state !== 'dying') {
      for (const part of bossPartCircles(game)) {
        if (Math.hypot(s.x - part.x, s.y - part.y) < part.radius + s.r) {
          used = true;
          const bonus = s.red !== b.red;
          damageBoss(game, s.damage * (bonus ? 2 : 1), part.region, events, { bonus });
          break;
        }
      }
    }
    if (!used) shots.push(s);
  }
  game.shots = game.phase === 'running' ? shots : [];

  // Touching an enemy costs a life (and the enemy m_nEnemyCollideDamage); while respawning it does nothing.
  if (p.state === 'alive' && game.phase === 'running') {
    for (const e of game.enemies) {
      if (!e.alive || (e.splinter && !e.hittable)) continue;
      const [hx, hy] = hitboxOf(e);
      if (Math.hypot(p.x - hx, p.y - hy) < e.def.radius + pc.heart) {
        if (killPlayer(game, events)) damageEnemy(game, e, pc.collideDamage, events, { collide: true });
        break;
      }
    }
    const b = game.boss;
    if (p.state === 'alive' && b?.alive && b.state !== 'dying') for (const part of bossPartCircles(game)) {
      if (Math.hypot(p.x - part.x, p.y - part.y) < part.radius + pc.heart) {
        if (killPlayer(game, events)) damageBoss(game, pc.collideDamage, part.region, events, { collide: true });
        break;
      }
    }
  }
  game.enemies = game.enemies.filter((e) => e.alive);
  return events;
}
// After the end: bullets and the boss keep moving, nothing hits.
export function coast(game) {
  game.time += TICK;
  for (const b of game.bullets) { b.x += b.vx * TICK; b.y += b.vy * TICK; }
  game.bullets = game.bullets.filter((b) => onField(b.x, b.y, 60));
  const b = game.boss;
  if (b) {
    b.stateTime += TICK; b.animTime += TICK;
    if (b.state !== 'dying') { const dx = b.target[0] - b.x, dy = b.target[1] - b.y, d = Math.hypot(dx, dy); if (d > 1e-9) { const k = Math.min(d, Math.max(b.speed, 300) * TICK) / d; b.x += dx * k; b.y += dy * k; } }
  }
  const p = game.player;
  if (p.state === 'dying') { const t = game.time - p.stateAt; p.x += (-300 - 500 * t) * TICK; p.y += (100 + 200 * t) * TICK; }
  for (const e of game.enemies) if (e.alive && !e.free) { e.t += TICK; e.d += pathSpeed(e.pathDef, e.t) * TICK; placeEnemy(e); }
}

function pathAction(game, e, a, events) {
  if (a.type === 'store') { e.stored = [game.player.x, game.player.y]; return; }
  if (a.type === 'destroy') {
    // The wisp bursts at the end of its run: m_vecSelfDestroyBulletPatterns, no score.
    const [hx, hy] = hitboxOf(e);
    for (const info of e.def.selfDestroy) startPattern(game, null, info, { red: e.red, origin: () => [hx, hy] });
    e.alive = false; e.escaped = true;
    events.push({ type: 'selfDestroy', id: e.id, x: hx, y: hy, red: e.red });
    return;
  }
  if (a.type === 'shoot') {
    const info = e.def.patterns[a.pattern];
    if (!info) return;
    const [hx, hy] = hitboxOf(e);
    if (!onField(hx, hy, 20)) return;
    // the spread patterns aim where Shen is now (or the stored point); the source moves on with the enemy
    startPattern(game, e, info, { red: e.red, origin: () => hitboxOf(e), target: info.stored && e.stored ? e.stored : [game.player.x, game.player.y] });
    events.push({ type: 'enemyShoot', id: e.id, kind: e.kind });
  }
}
// The minion dragons share one fire cooldown of 40 ticks: when it is 0 each one shoots (pattern 0, at Shen) with
// a 50 % chance, and if any did the cooldown starts again.
function stepMinionFire(game, events) {
  if (game.minionCooldown > 0) { game.minionCooldown--; return; }
  let fired = false;
  for (const e of game.enemies) {
    if (!e.alive || !e.minion || e.leaving || !e.def.patterns[0]) continue;
    if (game.random() < 0.5) { fired = true; startPattern(game, e, e.def.patterns[0], { red: e.red, origin: () => hitboxOf(e) }); events.push({ type: 'enemyShoot', id: e.id, kind: e.kind }); }
  }
  if (fired) game.minionCooldown = 40;
}
function stepFree(game, e, events) {
  if (e.minion) {
    // fly to their spot (at most 10 units a tick) and hover there while alive; sent away, they leave to the right
    if (e.leaving) { e.x += 15; e.dir = 1; if (e.x > WIDTH + 40) { e.alive = false; e.escaped = true; } return; }
    const dx = e.home[0] - e.x, dy = e.home[1] - e.y, d = Math.hypot(dx, dy);
    if (d > 1e-9) { const k = Math.min(d, 10) / d; e.x += dx * k; e.y += dy * k; }
    e.dir = -1;
    return;
  }
  // A splinter: during the 1-s state it flies from the knee to its point (growing), can be shot once it reaches
  // the field's plane; then it drifts left 2 a tick, speeds up over its last 90 ticks and bursts into the full
  // ring of pattern 5 180 (the first) or 300 (the second) ticks after the state.
  if (game.tick <= e.release) {
    const k = clamp((game.tick - e.born) / Math.max(1, e.release - e.born), 0, 1);
    e.x = e.from[0] + (e.to[0] - e.from[0]) * k; e.y = e.from[1] + (e.to[1] - e.from[1]) * k; e.scale = 0.2 + 0.8 * k;
    e.hittable = k >= 0.8;
    return;
  }
  e.hittable = true; e.scale = 1;
  const t = game.tick - e.release;
  e.x -= 2;
  if (t > e.fuse - 90) { e.x -= (t - e.fuse + 90) / 10; e.blink = t > e.fuse - 30 ? Math.floor(t / 10) % 2 === 0 : Math.floor(t / 20) % 2 === 0; }
  if (t >= e.fuse) {
    e.alive = false;
    const pats = game.boss?.def.patterns || [];
    if (pats[5]) startPattern(game, null, pats[5], { red: e.red, origin: () => [e.x, e.y] });
    events.push({ type: 'splinterBurst', x: e.x, y: e.y, red: e.red });
  }
}
// Homing (FUN_182cfefc0): each tick the shot turns at most 0.019·t + (t > 0.015·k ? min(1, 2t)·0.69 / max(1, √k) : 0)
// radians towards its target; speed min(600, 600/(k+1) + 500·t) + (m_flSpecialAttackSpeed − 600) − 300·turn.
// A dead target hands over to the next live one in the list; with none the shot flies straight and shrinks.
function steerShot(game, s) {
  const pc = game.config.player, t = s.age, k = s.k || 0;
  const live = (x) => x && (x === game.boss ? x.alive && x.state !== 'dying' : x.alive);
  if (!live(s.target)) {
    const i = s.list.indexOf(s.target);
    s.target = null;
    for (let j = 1; j <= s.list.length; j++) { const c = s.list[(i + j + s.list.length) % s.list.length]; if (live(c)) { s.target = c; break; } }
  }
  const pt = s.target && targetPoint(game, s.target);
  if (!pt) { s.r = Math.max(3, s.r * 0.9); return; }
  const cur = Math.atan2(s.vy, s.vx), want = Math.atan2(pt[1] - s.y, pt[0] - s.x);
  let turn = want - cur; while (turn > Math.PI) turn -= Math.PI * 2; while (turn < -Math.PI) turn += Math.PI * 2;
  const max = 0.019 * t + (t > 0.015 * k ? Math.min(1, 2 * t) * 0.69 / Math.max(1, Math.sqrt(k)) : 0);
  turn = clamp(turn, -max, max);
  const speed = Math.min(600, 600 / (k + 1) + 500 * t) + (pc.specialSpeed - 600) - 300 * turn, a = cur + turn;
  s.vx = Math.cos(a) * speed; s.vy = Math.sin(a) * speed;
}

// For the HUD and tests: when the boss arrives (the track's last spawn) and the intermissions.
export function trackMarks(config) {
  const at = (name) => config.track.find((e) => e.event === name)?.t ?? null;
  return { intermission1: at('ui.intermission_1'), intermission2: at('ui.intermission_2'), bossWarning: at('ui.boss_warning'), boss: at('event_boss'), musicBoss: at('music.boss') };
}
