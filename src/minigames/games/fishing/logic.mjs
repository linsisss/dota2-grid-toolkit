// «Рыбалка»: the rules, without any drawing (tests/minigames-fishing.test.cjs). Valve keeps them in the
// client's C++ (CDOTA_DB_Popup_BP_Crownfall_Encounter_Fishing in client.dll: SetState, Update, the pond's
// layout, ReelingFish, GenerateScore); docs/minigames/reverse/fishing.md has the decompiled functions, the
// numbers come from them, from the convars (dota_crownfall_fishing_*) and from fishing1.vdata (assets/
// minigames/fishing/data.json → fishingConfig). docs/minigames.md («Рыбалка») lists which is which.
//
// One mutable game object; the actions (aim, press, release, step) return the events they caused
// (sounds, effects, lines, the end) and the view redraws from the object. Phases are Valve's states:
// aim (PreCastAimRod; Valve's Ready before it needs a click, here it is skipped) → charge
// (PreCastStrengthRod + ChargingStrength) → cast (CastingRod) → wait / bite / gone (WaitingForBite: before
// the bite, the hook window, after it) → reel (ReelingFish) → caught (PostCatchFishAnim) → score
// (PostCatchShowScore) → the next lure, or missed (early / late / escape) → the next lure; after the fifth:
// over (GameOver). The world is Valve's units on the lake (x to the right, y away from the hero); the
// bars are 0…100. Valve steps per Panorama frame; its per-frame factors (0.99, 0.9, the impulse odds…)
// run here on a fixed 1/60 s frame.

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const lerp = (a, b, t) => a + (b - a) * t;
const RAD = Math.PI / 180;
export const FRAME = 1 / 60;

export const CATEGORIES = ['Trash', 'Common', 'Uncommon', 'Rare', 'UltraRare'];
// The popup's reward rows (crownfall_chapter1.vdata, fishing: 1, 2, 3, 5 tokens).
export const REWARDS = [[1000, 1], [4000, 2], [7000, 3], [10000, 5]];
export const nextReward = (score) => REWARDS.find(([at]) => at > score) || null;

export function fishingConfig(data = {}) {
  const def = data.fishing1 || data;
  const category = (name) => String(name || '').replace(/^k_eFishingGameFishCategory_/, '');
  const fish = (def.m_vecFishTypes || []).map((f) => ({
    id: f.m_strID, name: String(f.m_strLocName || '').replace(/^#/, ''), category: category(f.m_eCategory),
    weight: num(f.m_flAverageWeight, 1), body: num(f.m_nSceneModelBodyIndex, 0), scale: num(f.m_flBaseModelScale, 1),
    flat: !!f.m_strFlatSceneModel, bonus: num(f.m_flBonusDifficulty, 0),
  }));
  const difficulty = {};
  for (const [k, v] of Object.entries(def.m_mapCategoryToDifficulty || {})) difficulty[category(k)] = num(v, 4);
  return {
    fish, difficulty,
    // dota_crownfall_fishing_* convars.
    lures: 5, aimFov: 50, castMin: 400, castMax: 1050,
    biteMin: 2.5, biteMax: 6.5, escapeMin: 0.7, escapeMax: 1.5,
    barMax: 100, catchBar: 24, catchBarPerMiss: 3, catchBarUpgrades: 4,
    energyInitial: 2, energyNeeded: 5.5, energyEscape: 1, grace: 0.25, tireTime: 7,
    caughtAnim: 1, postCatchAnim: 1, tipsBelow: 1000,
    // client.dll, the aim and the cast (FUN_182945500, Update case 5): the strength starts at 1 and grows 50
    // a second while held; past max_cast_strength 80 the rod casts by itself (Max Power). The aim is soft
    // past 0.8 of the half cone (20°): 20 + √(a − 20), at most ±(25 + 5)°. Vengeful Spirit's swing 0.4 s,
    // then the bobber flies 0.5 + 0.5·power s.
    strengthStart: 1, strengthRate: 50, strengthMax: 80, aimSoft: 0.8, aimOver: 5, swing: 0.4,
    // WaitingForBite: «too late» by itself 3 s after the window; one fake splash at U(bite_min, bite) − 0.75,
    // only for a fish heavier than w 0.5.
    lateAfter: 3, fakeLead: 0.75, fakeMinW: 0.5,
    // ReelingFish (FUN_182945930): the catch bar ±84 /s², at the top ×0.9 a frame, at the bottom ×−0.3; the
    // fish: impulses of U(0.5, 1)·(4D + 20) at 0.013 + 0.0015·D a frame or after 2 s, ×0.99 a frame, ×−0.7
    // off the ends, shown halfway to where it is each frame; turns back at 0.1 a impulse (0.65 swimming away
    // from the middle, not twice in 0.5 s); after tire_time 7 s −0.1 a second, at most −0.5.
    barAccel: 84, barTopDamp: 0.9, barBounce: -0.3,
    fishDrag: 0.99, fishBounce: -0.7, fishFollow: 0.5, impulseEvery: 2, reverseGap: 0.5, reverseOdds: 0.1, reverseAway: 0.65,
    tireRate: 0.1, tireMax: 0.5, almostCaught: 0.4,
    // The pond (FUN_182925dd0, on entering PreCastAimRod): 8 fish, their spots around hero + forward·725.
    pond: {
      size: 8, ultraRare: 0.05, rare: 0.15, uncommon: 0.5, beginnerBelow: 500, spreadX: 450, spreadY: 250, special: 200,
      variantOdds: 0.2, variant2Odds: 0.2, maxVariants: 2, variantMinW: 0.25,
    },
    // The pond fish swimming (FUN_182942db0): a school around their home spots.
    school: { speed: 70, variantSpeed: 140, cohesion: 190, separation: 90, home: 300, flee: 300, fleeWaiting: 200, near: 120, nearSlow: 70 },
    // How long the catch's score card and a miss stay before the next lure (Valve waits for a click).
    scoreRow: 0.35, scoreHold: 2.4, missedTime: 2.2,
    // GenerateScore (FUN_182910750).
    score: {
      rarity: { Trash: 100, Common: 200, Uncommon: 500, Rare: 800, UltraRare: 1000 },
      variant: [0, 750, 1500],
      trash: 100, firstLure: 100, streak3: 100, streak4: 250, streak5: 400, maxPower: 200, fastCast: 200,
      finalLurePercent: 10, perfectPercent: 10,
    },
    // QuickCast: the charge started less than 1 s after entering PreCastAimRod.
    fastCastWithin: 1,
  };
}

// Weight class by w, the weight's share 0…1 between the species' min and max.
export const weightClass = (w) => (w < 0.1 ? 'Tiny' : w < 0.4 ? 'Small' : w < 0.6 ? 'Average' : w < 0.9 ? 'Large' : 'Huge');
// The weight row: 100 − (int)(w·−1400) in Valve's floats (100…1500).
export const weightScore = (w) => 100 - Math.trunc(Math.fround(Math.fround(w) * -1400));
// The weight: min / max of a species are its average ×0.8 / ×1.2 (when vdata loads).
export const fishKg = (average, w) => { const min = average * 0.8, max = average * 1.2; return min + (max - min) * w; };

// Valve's debug line «Fish Difficulty: %f + %f + %f + %f = %f»: the category's, the variant's (7), 5·w and
// the species' bonus (0 for every fish of fishing1).
export function fishDifficulty(config, fish) {
  const parts = [config.difficulty[fish.category] ?? 4, fish.variant ? 7 : 0, 5 * fish.w, fish.bonus || 0];
  return { parts, value: parts.reduce((a, b) => a + b, 0) };
}

// The pond for one lure: 8 fish, each with a category, w and a variant, at a spot around the pond's
// centre (hero + forward·725; Valve's world x is our x across the lake, Valve's y — ours, away from the
// hero). The counters of Ultra Rare, Rare and variants are the pond's: at most one of each rare kind.
// A beginner (act I, the best score ≤ 499) gets only Common fish and at most one variant.
export function layPond(config, { record = 0, random = Math.random } = {}) {
  const p = config.pond, U = (a = 0, b = 1) => a + (b - a) * random();
  const beginner = record < p.beginnerBelow;
  const centre = [0, lerp(config.castMin, config.castMax, 0.5)];
  let ultra = 0, rare = 0, variants = 0, heavy = 0;
  const fish = [];
  for (let index = 0; index < p.size; index++) {
    const yaw = U(0, 360);
    let w = U() * U();
    if (heavy > 2) w *= U();
    const r = U();
    let category, special = false;
    if (beginner) { category = 'Common'; w = U(0, 0.7) * U(); }
    else if (r < p.ultraRare && ultra === 0) { category = 'UltraRare'; if (w < 0.7) w = U(0.7, 1); ultra += 1; special = true; }
    else if (r < p.rare && rare === 0) { category = 'Rare'; if (w < 0.7) w = U(0.7, 1); rare += 1; special = true; }
    else if (r < p.uncommon) category = 'Uncommon';
    else { category = 'Common'; if (w > 0.6) w = U(0, 0.6); if (w < 0.15) { category = 'Trash'; w = 0; } }
    let variant = 0;
    if (category !== 'Trash' && U() < p.variantOdds && variants < (beginner ? 1 : p.maxVariants)) {
      variants += 1; w = Math.max(w, p.variantMinW); special = true;
      variant = U() < p.variant2Odds ? 2 : 1;
    }
    const kinds = config.fish.filter((f) => f.category === category);
    const type = kinds.length ? kinds[Math.floor(U() * kinds.length) % kinds.length] : { id: '', name: '', category, weight: 1, body: 0, scale: 1 };
    if (w > 0.6) heavy += 1;
    const dx = U(-p.spreadX, p.spreadX), dy = U(-p.spreadY, p.spreadY) + (special ? p.special : 0);
    fish.push({
      ...type, category, index, w, variant, special, trash: category === 'Trash', active: true,
      x: centre[0] + dx, y: centre[1] + dy, yaw, home: [centre[0], centre[1] + (special ? p.special : 0)],
    });
  }
  return { centre, fish, beginner };
}

// The fish the bobber catches: the active pond fish nearest to it, at any distance (SetState case 8).
export function nearestFish(pond, x, y) {
  let best = null, bestD = Infinity;
  for (const f of pond.fish) {
    if (!f.active) continue;
    const d = (f.x - x) ** 2 + (f.y - y) ** 2;
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

// The hooked fish (FUN_18291ad30): its weight, class and difficulty.
export function catchOf(config, f) {
  const fish = { id: f.id, name: f.name, category: f.category, weight: f.weight, body: f.body, scale: f.scale, flat: f.flat, bonus: f.bonus || 0,
    index: f.index, trash: f.category === 'Trash', w: f.w, variant: f.variant };
  fish.ratio = 0.8 + 0.4 * f.w;
  fish.kg = Math.round(fishKg(f.weight, f.w) * 100) / 100;
  fish.weightClass = weightClass(f.w);
  const d = fishDifficulty(config, fish);
  fish.difficultyParts = d.parts; fish.difficulty = d.value;
  return fish;
}

export function createGame(config, { random = Math.random, record = 0, caughtBefore = [] } = {}) {
  const game = {
    config, random, record, phase: 'aim', time: 0, phaseTime: 0, acc: 0,
    lures: config.lures, lure: 0, score: 0, streak: 0, misses: 0, catches: [], log: [],
    caughtBefore: new Set(caughtBefore),
    aim: 0, aimDist: lerp(config.castMin, config.castMax, 0.45), strength: config.strengthStart, power: 0, holding: false,
    maxPower: false, castFast: false, pond: null,
    bobber: null, hooked: null, bar: null, card: null, missed: null, waitTime: 0, biteAt: 0, fakeAt: 0, faked: false, escapeAt: 0, aimStart: 0,
  };
  enterAim(game);
  return game;
}

// The catch bar's height (%): 24, +3 for each lure lost so far (Upgrade1…4).
export const catchBarSize = (game) => game.config.catchBar + game.config.catchBarPerMiss * Math.min(game.misses, game.config.catchBarUpgrades);

function enter(game, phase) { game.phase = phase; game.phaseTime = 0; }

// A new lure: Valve's Ready (the bite's time, the fake splash, the strength back to 1) and PreCastAimRod
// (the pond laid out anew).
function enterAim(game) {
  const { config, random } = game;
  enter(game, 'aim'); game.aimStart = game.time;
  game.strength = config.strengthStart; game.power = game.strength / config.strengthMax;
  game.maxPower = false; game.castFast = false; game.faked = false; game.waitTime = 0;
  game.biteAt = lerp(config.biteMin, config.biteMax, random());
  game.fakeAt = lerp(config.biteMin, game.biteAt, random()) - config.fakeLead;
  game.pond = layPond(config, { record: game.record, random });
}

// The aim's soft edge: straight up to 0.8 of the half cone, then 20 + √(a − 20), at most ±30°.
export function softAim(config, angle) {
  const half = config.aimFov / 2, soft = half * config.aimSoft;
  if (!(Math.abs(angle) > soft)) return angle || 0;
  const a = Math.sign(angle) * (soft + Math.sqrt(Math.abs(angle) - soft));
  return clamp(a, -half - config.aimOver, half + config.aimOver);
}

// Where the mouse points on the lake (an angle off straight ahead, degrees, and a distance); frozen while
// charging, as in Valve.
export function aim(game, angle, distance = null) {
  if (game.phase !== 'aim') return [];
  game.aim = softAim(game.config, angle);
  if (distance != null) game.aimDist = clamp(distance, game.config.castMin, game.config.castMax);
  return [];
}

// The left button (or Space, or a touch) goes down.
export function press(game) {
  const ev = [];
  if (game.phase === 'aim') {
    game.castFast = game.phaseTime < game.config.fastCastWithin;
    enter(game, 'charge'); game.holding = true; ev.push({ type: 'charge' });
  } else if (game.phase === 'wait') ev.push(...miss(game, 'early'));
  else if (game.phase === 'bite') ev.push(...hook(game));
  else if (game.phase === 'gone') ev.push(...miss(game, 'late'));
  else if (game.phase === 'reel') game.holding = true;
  return ev;
}

// The button comes up: a charging cast flies.
export function release(game) {
  game.holding = false;
  if (game.phase !== 'charge') return [];
  return cast(game, false);
}

function cast(game, max) {
  const { config } = game;
  const power = game.strength / config.strengthMax;
  const dist = lerp(config.castMin, config.castMax, power), a = game.aim * RAD;
  game.power = power; game.maxPower = max;
  game.lure += 1; game.lures -= 1;
  game.bobber = { power, dist, angle: game.aim, x: Math.sin(a) * dist, y: Math.cos(a) * dist, landed: false, swing: config.swing, flight: 0.5 + 0.5 * power };
  enter(game, 'cast');
  return [{ type: 'cast', power, max }];
}

function hook(game) {
  const { config } = game, fish = game.hooked;
  const v = 4 * fish.difficulty + 20;
  game.bar = {
    pos: 0, v: 0, size: catchBarSize(game), fish: 0, fishPos: 0, fv: v, speed: v, dir: 1, odds: 0.013 + 0.0015 * fish.difficulty,
    lastImpulse: 0, lastTurn: 0, energy: config.energyInitial, outFor: 0, perfect: true, time: 0, inside: true,
  };
  enter(game, 'reel');
  game.holding = true;
  return [{ type: 'hooked', fish }];
}

function miss(game, why) {
  game.streak = 0; game.misses += 1; game.holding = false;
  game.missed = { why, fish: game.hooked };
  game.log.push({ lure: game.lure, missed: why });
  enter(game, 'missed');
  return [{ type: 'missed', why, fish: game.hooked }];
}

// The score card of a catch (GenerateScore): its rows in Valve's order and the total. The percent rows
// (the final lure, then Perfect) add ⌊percent·sum/100⌋ of the sum so far.
export function scoreCatch(game, fish, { power = 0, maxPower = power >= 1, perfect = false, fast = false } = {}) {
  const s = game.config.score, rows = [];
  const bonus = (key, value) => rows.push({ key, value, bonus: true });
  rows.push({ key: 'rarity', value: s.rarity[fish.category] ?? 0, category: fish.category });
  if (fish.variant) rows.push({ key: 'variant', value: s.variant[fish.variant], variant: fish.variant });
  if (!fish.trash) rows.push({ key: 'weight', value: weightScore(fish.w), weightClass: fish.weightClass ?? weightClass(fish.w), kg: fish.kg });
  else bonus('trash', s.trash);
  if (game.lure === 1) bonus('firstLure', s.firstLure);
  if (game.streak === 3) bonus('streak3', s.streak3);
  else if (game.streak === 4) bonus('streak4', s.streak4);
  else if (game.streak === 5) bonus('streak5', s.streak5);
  if (maxPower) bonus('maxPower', s.maxPower);
  if (fast) bonus('fastCast', s.fastCast);
  if (game.lure === game.config.lures) rows.push({ key: 'finalLure', percent: s.finalLurePercent, bonus: true, value: 0 });
  if (perfect) rows.push({ key: 'perfectCatch', percent: s.perfectPercent, bonus: true, value: 0 });
  let total = 0;
  for (const row of rows) { if (row.percent) row.value = Math.floor(row.percent * total / 100); total += row.value; }
  return { rows, total };
}

function caught(game) {
  const fish = game.hooked, bar = game.bar;
  game.streak += 1;
  const card = scoreCatch(game, fish, { maxPower: game.maxPower, perfect: bar.perfect, fast: game.castFast });
  game.card = { fish, ...card, shown: 0 };
  game.catches.push({ ...fish, score: card.total, lure: game.lure });
  game.log.push({ lure: game.lure, caught: fish.id, score: card.total });
  if (!fish.trash) game.caughtBefore.add(fish.id);
  enter(game, 'caught');
  game.holding = false;
  return [{ type: 'caught', fish, card: game.card }];
}

function nextLure(game) {
  game.bobber = null; game.hooked = null; game.bar = null; game.card = null; game.missed = null;
  if (game.lures <= 0) { enter(game, 'over'); return [{ type: 'over', score: game.score }]; }
  enterAim(game);
  return [{ type: 'ready' }];
}

// How long a score card stays: its rows come one by one, then the total.
export const cardTime = (game) => (game.card ? game.config.scoreRow * (game.card.rows.length + 1) + game.config.scoreHold : 0);

// The fish and the catch bar (ReelingFish), one frame.
function reel(game, dt) {
  const { config, random } = game, bar = game.bar, ev = [];
  const t = bar.time, top = config.barMax;
  // The fish: an impulse now and then; it turns back at the ends, sometimes in the middle.
  if (random() < bar.odds || t - bar.lastImpulse > config.impulseEvery) {
    if (bar.fish < 5) bar.dir = 1;
    else if (bar.fish > top - 5) bar.dir = -1;
    else {
      const away = (bar.dir > 0) !== (bar.fish < top / 2);
      const odds = away ? Math.min(0.75, config.reverseOdds * 6.5) : config.reverseOdds;
      if (random() < odds && bar.lastTurn + config.reverseGap < t) { bar.lastTurn = t; bar.dir = -bar.dir; }
    }
    const tire = t > config.tireTime ? 1 - Math.min((t - config.tireTime) * config.tireRate, config.tireMax) : 1;
    bar.lastImpulse = t;
    bar.fv = lerp(0.5, 1, random()) * tire * bar.speed * bar.dir;
  }
  if (!bar.tired && t > config.tireTime) { bar.tired = true; ev.push({ type: 'tired' }); }
  const v0 = bar.fv, v1 = v0 * config.fishDrag;
  bar.fv = v1;
  let p = bar.fishPos + v0 * dt;
  if (p < 0) { p = 0; if (v1 < 0) bar.fv = v1 * config.fishBounce; }
  else if (p > top) { p = top; if (v1 > 0) bar.fv = v1 * config.fishBounce; }
  bar.fishPos = p;
  bar.fish += (p - bar.fish) * config.fishFollow;
  // The catch bar: ±84 /s², no speed limit; it slides along the top, bounces off the bottom.
  const a = game.holding ? config.barAccel : -config.barAccel;
  bar.v += a * dt;
  let x = a * 0.5 * dt * dt + bar.v * dt + bar.pos;
  if (x > 0) { if (x + bar.size > top) { x = top - bar.size; if (bar.v > 0) bar.v *= config.barTopDamp; } }
  else { x = 0; if (bar.v < 0) bar.v *= config.barBounce; }
  bar.pos = x;
  // The catch energy: +1/s while the fish is in the bar; out of it, after 0.25 s, −1/s and no Perfect.
  const inside = !(bar.fish + 1e-4 < x || x + bar.size < bar.fish - 1e-4);
  if (inside !== bar.inside) { bar.inside = inside; ev.push({ type: inside ? 'enter' : 'leave' }); }
  if (inside) { bar.outFor = 0; bar.energy += dt; }
  else { bar.outFor += dt; if (bar.outFor >= config.grace) { bar.perfect = false; bar.energy -= dt; } }
  bar.time += dt;
  if (bar.energy > config.energyNeeded) ev.push(...caught(game));
  else if (bar.energy < -config.energyEscape) ev.push(...miss(game, 'escape'));
  return ev;
}

// The pond fish (FUN_182942db0), one frame: a school around the home spots; near a waiting bobber they
// nose up to it; once the bite is missed or a fish is on the line the rest flee from the bobber.
const angleDiff = (to, from) => { let d = (to - from) % 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return d; };
const forward = (yaw) => [Math.cos(yaw * RAD), Math.sin(yaw * RAD)];
const unit = (x, y) => { const l = Math.hypot(x, y); return l > 1e-17 ? [x / l, y / l] : [0, 0]; };
function swim(game, dt) {
  const pond = game.pond; if (!pond) return;
  const s = game.config.school, ph = game.phase, b = game.bobber?.landed ? game.bobber : null, F = pond.fish;
  const waiting = ph === 'wait' || ph === 'bite' || ph === 'gone';
  const hookedAt = game.hooked ? game.hooked.index : -1;
  const coh2 = s.cohesion ** 2, sep2 = s.separation ** 2, home2 = s.home ** 2;
  for (const f of F) {
    if (!f.active) continue;
    if (f.index === hookedAt && (ph === 'reel' || ph === 'wait' || ph === 'bite')) continue;
    let speed, flee = false;
    if (b && (ph === 'reel' || ph === 'missed')) { flee = true; speed = s.flee; }
    else if (b && waiting && game.waitTime > game.escapeAt + f.index * 0.2) { flee = true; speed = s.fleeWaiting; }
    if (flee) {
      const to = Math.atan2(f.y - b.y, f.x - b.x) / RAD;
      f.yaw += (angleDiff(to, f.yaw) + Math.sin((f.index * 0.03 + 4) * game.phaseTime + f.index * 531) * 60) * dt;
      const [fx, fy] = forward(f.yaw);
      f.x += fx * speed * dt; f.y += fy * speed * dt;
      continue;
    }
    if (b && waiting) {
      const d2 = (b.x - f.x) ** 2 + (b.y - f.y) ** 2;
      if (d2 < s.near ** 2) {
        const to = Math.atan2(b.y - f.y, b.x - f.x) / RAD;
        f.yaw += angleDiff(to, f.yaw) * dt * 0.3;
        const [fx, fy] = forward(f.yaw), v = d2 < s.nearSlow ** 2 ? 1 : 15;
        f.x += fx * v * dt; f.y += fy * v * dt;
        continue;
      }
    }
    // Boids: cohesion within 190, alignment, separation within 90, back home past 300.
    let cx = 0, cy = 0, n = 0, ax = 0, ay = 0, sx = 0, sy = 0, m = 0;
    for (const o of F) {
      if (o === f || !o.active) continue;
      const dx = o.x - f.x, dy = o.y - f.y, d2 = dx * dx + dy * dy;
      if (d2 >= coh2) continue;
      cx += dx; cy += dy; n += 1;
      const [ox, oy] = forward(o.yaw); ax += ox; ay += oy;
      if (d2 < sep2) { sx += dx; sy += dy; m += 1; }
    }
    const hx = f.home[0] - f.x, hy = f.home[1] - f.y;
    const [px, py] = hx * hx + hy * hy > home2 ? [hx / s.home, hy / s.home] : [0, 0];
    let [kx, ky] = n ? unit(cx / n, cy / n) : [0, 0];
    let [lx, ly] = n ? [ax / n, ay / n] : [0, 0];
    const [qx, qy] = m ? unit(sx / m, sy / m).map((v) => -v) : [0, 0];
    const heavy = f.w >= 0.6, kc = heavy ? 0.02 : 0.06, kl = heavy ? 0.01 : 0.02;
    kx *= kc; ky *= kc; lx *= kl; ly *= kl;
    const [fx, fy] = forward(f.yaw);
    const [dx, dy] = unit(qx * 0.15 + kx + fx * 0.5 + px * 0.05 + lx, qy * 0.15 + ky + fy * 0.5 + py * 0.05 + ly);
    const v = (f.variant ? s.variantSpeed : s.speed) + (f.index % 3) * 10 - 10;
    const mx = dx * v * dt, my = dy * v * dt;
    if (mx || my) f.yaw += angleDiff(Math.atan2(my, mx) / RAD, f.yaw) * 0.1;
    f.x += mx; f.y += my;
  }
}

// One frame of the rules.
function frame(game, dt) {
  const { config } = game, ev = [];
  game.time += dt; game.phaseTime += dt;
  switch (game.phase) {
    case 'charge': {
      const next = game.strength + config.strengthRate * dt;
      if (next <= config.strengthMax) { game.strength = next; game.power = next / config.strengthMax; }
      else { game.strength = config.strengthMax; ev.push(...cast(game, true)); }
      break;
    }
    case 'cast':
      if (!game.bobber.landed && game.phaseTime > game.bobber.swing + game.bobber.flight) {
        game.bobber.landed = true;
        const f = nearestFish(game.pond, game.bobber.x, game.bobber.y);
        game.hooked = catchOf(config, f);
        game.escapeAt = game.biteAt + config.escapeMin + (config.escapeMax - config.escapeMin) * (1 - game.hooked.w);
        game.waitTime = 0;
        enter(game, 'wait');
        ev.push({ type: 'land', bobber: game.bobber, fish: game.hooked });
      }
      break;
    case 'wait': case 'bite': case 'gone':
      game.waitTime += dt;
      if (!game.faked && game.phase === 'wait' && game.hooked.w > config.fakeMinW && game.waitTime >= game.fakeAt) { game.faked = true; ev.push({ type: 'fake' }); }
      if (game.phase === 'wait' && game.waitTime >= game.biteAt) { enter(game, 'bite'); ev.push({ type: 'bite' }); }
      if (game.phase === 'bite' && game.waitTime >= game.escapeAt) { enter(game, 'gone'); ev.push({ type: 'gone' }); }
      if (game.phase === 'gone' && game.waitTime > game.escapeAt + config.lateAfter) ev.push(...miss(game, 'late'));
      break;
    case 'reel':
      ev.push(...reel(game, dt));
      break;
    case 'caught':
      if (game.phaseTime >= config.caughtAnim) { enter(game, 'score'); ev.push({ type: 'card', card: game.card }); }
      break;
    case 'score': {
      const rows = game.card.rows.length, shown = Math.min(rows + 1, Math.floor(game.phaseTime / config.scoreRow));
      while (game.card.shown < shown) { game.card.shown += 1; ev.push(game.card.shown <= rows ? { type: 'row', row: game.card.rows[game.card.shown - 1], index: game.card.shown - 1 } : { type: 'total', total: game.card.total }); }
      if (game.phaseTime >= cardTime(game)) { game.score += game.card.total; ev.push({ type: 'add', value: game.card.total, score: game.score }); ev.push(...nextLure(game)); }
      break;
    }
    case 'missed':
      if (game.phaseTime >= config.missedTime) ev.push(...nextLure(game));
      break;
    default:
  }
  if (game.phase !== 'over') swim(game, dt);
  return ev;
}

// Advances the game by dt seconds in whole 1/60 s frames (the rest waits for the next call).
export function step(game, dt) {
  const ev = [];
  game.acc += dt;
  while (game.acc >= FRAME - 1e-9) { game.acc -= FRAME; ev.push(...frame(game, FRAME)); }
  return ev;
}

// The radial progress of the catch (ProgressMeterRadial): (energy / (needed − 0.4))², 0…1.
export function catchProgress(game) {
  if (!game.bar) return 0;
  const f = game.bar.energy / (game.config.energyNeeded - game.config.almostCaught);
  return f > 0 ? Math.min(1, f * f) : 0;
}
// AlmostCaught: the energy past needed − 0.4.
export const almostCaught = (game) => !!game.bar && game.bar.energy > game.config.energyNeeded - game.config.almostCaught;
// The fish icon fades as the energy goes below zero towards the escape.
export const fishOpacity = (game) => (game.bar ? clamp(1 - Math.max(0, -game.bar.energy / game.config.energyEscape), 0, 1) : 1);
// Where the bobber is on the lake, given the hero's spot (Source units).
export const bobberAt = (bobber, hero) => [hero[0] + bobber.x, hero[1] + bobber.y];
// The reticule's spot: the aim's direction at the distance of the strength (1 of 80 while aiming, growing
// while charging), as Valve places it.
export function reticule(game) {
  const { config } = game, a = game.aim * RAD;
  const d = lerp(config.castMin, config.castMax, game.strength / config.strengthMax);
  return [Math.sin(a) * d, Math.cos(a) * d];
}
// Tidehunter's verdict at the end (fishing-goodjob / okayjob / badjob): goodjob from 6001.
export const verdict = (score) => (score >= 6001 ? 'goodjob' : score > 0 ? 'okayjob' : 'badjob');
