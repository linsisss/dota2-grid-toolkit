const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../assets/minigames/fishing/data.json');
const logic = import('../src/minigames/games/fishing/logic.mjs');

// A repeatable random source (mulberry32).
function seeded(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DT = 1 / 60;
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} vs ${b}`);
async function run(game, seconds, { until, each } = {}) {
  const { step } = await logic;
  const events = [];
  for (let t = 0; t < seconds; t += DT) { each?.(game); events.push(...step(game, DT)); if (until?.(game, events)) break; }
  return events;
}
// Exactly n frames of 1/60 s.
async function frames(game, n, each) {
  const { step } = await logic;
  const events = [];
  for (let i = 0; i < n; i++) { each?.(game); events.push(...step(game, DT)); }
  return events;
}
async function newGame(seed, opts = {}) {
  const { fishingConfig, createGame } = await logic;
  return createGame(fishingConfig(data), { random: seeded(seed), record: 1000, ...opts });
}
// Casts at a given power (released as soon as it is reached) and waits until the bobber is in the water.
async function castAt(game, power) {
  const { press, release } = await logic;
  press(game);
  await run(game, 3, { until: (g) => g.phase !== 'charge' || g.power >= power - 1e-9 });
  release(game);
  await run(game, 3, { until: (g) => g.phase === 'wait' });
}
async function toBite(game, power = 0.5) {
  await castAt(game, power);
  await run(game, 8, { until: (x) => x.phase === 'bite' });
}
// A pilot that keeps the bar on the fish: hold while the fish is above the bar's middle, allowing for speed.
const pilot = (g) => { const b = g.bar; if (!b) return; g.holding = b.fish > b.pos + b.size * 0.5 + b.v * 0.3; };

test('vdata → config: fish, categories, difficulty, convars and client.dll constants', async () => {
  const { fishingConfig } = await logic;
  const c = fishingConfig(data);
  assert.equal(c.fish.length, 10);
  assert.deepEqual(c.fish.map((f) => f.category), ['Trash', 'Trash', 'Common', 'Common', 'Uncommon', 'Rare', 'Rare', 'UltraRare', 'Rare', 'UltraRare']);
  assert.deepEqual(c.difficulty, { Trash: 2, Common: 4, Uncommon: 5, Rare: 6, UltraRare: 7 });
  assert.equal(c.fish.find((f) => f.id === 'rewardfish7').weight, 10.1);
  assert.equal(c.fish.find((f) => f.id === 'rewardfish7').body, 7);
  assert.equal(c.fish[0].name, 'DOTA_Crownfall_Fishing_FishName_Shoe');
  assert.equal(c.lures, 5); assert.equal(c.castMin, 400); assert.equal(c.castMax, 1050);
  assert.equal(c.catchBar, 24); assert.equal(c.energyInitial, 2); assert.equal(c.energyNeeded, 5.5); assert.equal(c.energyEscape, 1);
  assert.equal(c.strengthStart, 1); assert.equal(c.strengthRate, 50); assert.equal(c.strengthMax, 80); assert.equal(c.swing, 0.4);
  assert.equal(c.barAccel, 84); assert.equal(c.barTopDamp, 0.9); assert.equal(c.barBounce, -0.3);
  assert.deepEqual([c.pond.size, c.pond.ultraRare, c.pond.rare, c.pond.spreadX, c.pond.spreadY, c.pond.special], [8, 0.05, 0.15, 450, 250, 200]);
  assert.deepEqual([c.school.speed, c.school.variantSpeed, c.school.cohesion, c.school.separation, c.school.home], [70, 140, 190, 90, 300]);
  assert.equal(c.fastCastWithin, 1);
});

test('weight: min/max = average ×0.8/×1.2, classes by w, the weight row 100 + trunc(1400w) fits the videos', async () => {
  const { weightScore, weightClass, fishKg } = await logic;
  near(fishKg(10, 0), 8, 1e-9); near(fishKg(10, 1), 12, 1e-9); near(fishKg(10, 0.5), 10, 1e-9);
  assert.equal(weightScore(0), 100); assert.equal(weightScore(1), 1500); assert.equal(weightScore(0.5), 800); assert.equal(weightScore(0.25), 450);
  // (kg, average) → points on the video's cards: w = (kg/avg − 0.8)/0.4.
  for (const [kg, avg, pts] of [[12.12, 10.1, 1499], [12.0, 10.1, 1457], [10.98, 10.1, 1104], [7.13, 6.1, 1389], [10.65, 8.9, 1488], [11.62, 9.9, 1407], [0.855, 0.95, 450]]) {
    const w = (kg / avg - 0.8) / 0.4;
    assert.ok(Math.abs(weightScore(w) - pts) <= 3, `${kg}/${avg}: ${weightScore(w)} vs ${pts}`);
  }
  assert.deepEqual([0, 0.099, 0.1, 0.399, 0.4, 0.599, 0.6, 0.899, 0.9, 1].map(weightClass),
    ['Tiny', 'Tiny', 'Small', 'Small', 'Average', 'Average', 'Large', 'Large', 'Huge', 'Huge']);
});

test('difficulty D = category + 7·variant + 5w + bonus; impulse 4D+20 and 0.013+0.0015D; hook window 0.7+0.8(1−w)', async () => {
  const { fishingConfig, fishDifficulty, catchOf } = await logic;
  const c = fishingConfig(data);
  const trout = c.fish.find((f) => f.id === 'rewardfish7');
  assert.equal(fishDifficulty(c, { category: 'UltraRare', variant: 2, w: 1 }).value, 19);
  assert.deepEqual(fishDifficulty(c, { category: 'Common', variant: 0, w: 0.5 }).parts, [4, 0, 2.5, 0]);
  const fish = catchOf(c, { ...trout, index: 0, w: 0.5, variant: 1 });
  assert.equal(fish.difficulty, 7 + 7 + 2.5);
  near(fish.kg, 10.1, 0.01); assert.equal(fish.weightClass, 'Average');
  // Through the game: the hooked fish's window and the reel's numbers.
  for (let seed = 1; seed <= 12; seed++) {
    const g = await newGame(seed);
    await toBite(g);
    near(g.escapeAt - g.biteAt, 0.7 + 0.8 * (1 - g.hooked.w), 1e-9, 'window');
    const { press } = await logic; press(g);
    near(g.bar.speed, 4 * g.hooked.difficulty + 20, 1e-9); near(g.bar.odds, 0.013 + 0.0015 * g.hooked.difficulty, 1e-12);
    near(g.hooked.difficulty, c.difficulty[g.hooked.category] + (g.hooked.variant ? 7 : 0) + 5 * g.hooked.w, 1e-9);
  }
});

test('the pond: 8 fish, at most one Ultra Rare and one Rare, ≤ 2 variants, the rules of w, spots and homes', async () => {
  const { fishingConfig, layPond } = await logic;
  const c = fishingConfig(data), random = seeded(77);
  let ponds = 0, withUR = 0, withRare = 0, fishN = 0, variants = 0, nonTrash = 0, trash = 0;
  for (let i = 0; i < 3000; i++) {
    const pond = layPond(c, { record: 500, random });
    ponds += 1;
    assert.equal(pond.fish.length, 8); assert.equal(pond.beginner, false);
    assert.deepEqual(pond.centre, [0, 725]);
    const count = (cat) => pond.fish.filter((f) => f.category === cat).length;
    assert.ok(count('UltraRare') <= 1); assert.ok(count('Rare') <= 1);
    assert.ok(pond.fish.filter((f) => f.variant).length <= 2);
    if (count('UltraRare')) withUR += 1; if (count('Rare')) withRare += 1;
    for (const f of pond.fish) {
      fishN += 1;
      assert.equal(c.fish.find((t) => t.id === f.id).category, f.category);
      if (f.trash) { trash += 1; assert.equal(f.w, 0); assert.equal(f.variant, 0); } else nonTrash += 1;
      if (f.category === 'Rare' || f.category === 'UltraRare') assert.ok(f.w >= 0.7);
      if (f.category === 'Common' && !f.variant) assert.ok(f.w >= 0.15 && f.w <= 0.6);
      if (f.variant) { variants += 1; assert.ok(f.w >= 0.25); assert.ok(f.variant === 1 || f.variant === 2); }
      const special = f.variant > 0 || f.category === 'Rare' || f.category === 'UltraRare';
      assert.equal(f.special, special);
      assert.deepEqual(f.home, [0, 725 + (special ? 200 : 0)]);
      assert.ok(Math.abs(f.x) <= 450 && Math.abs(f.y - f.home[1]) <= 250);
      assert.ok(f.w >= 0 && f.w <= 1); assert.ok(f.yaw >= 0 && f.yaw <= 360);
    }
  }
  // An Ultra Rare in 1 − 0.95⁸ ≈ 34 % of the ponds.
  near(withUR / ponds, 1 - 0.95 ** 8, 0.03, 'UR ponds');
  assert.ok(withRare / ponds > 0.55 && withRare / ponds < 0.8, String(withRare / ponds));
  // Variants: 20 % of non-trash fish, minus the cap.
  assert.ok(variants / nonTrash > 0.15 && variants / nonTrash < 0.2, String(variants / nonTrash));
  assert.ok(trash / fishN > 0.15 && trash / fishN < 0.3, String(trash / fishN));
});

test('the beginner pond (best ≤ 499): Common only, w < 0.7, at most one variant', async () => {
  const { fishingConfig, layPond } = await logic;
  const c = fishingConfig(data), random = seeded(5);
  for (let i = 0; i < 1000; i++) {
    const pond = layPond(c, { record: 499, random });
    assert.equal(pond.beginner, true);
    assert.ok(pond.fish.every((f) => f.category === 'Common' && f.w < 0.7));
    assert.ok(pond.fish.filter((f) => f.variant).length <= 1);
  }
  assert.equal(layPond(c, { record: 500, random }).beginner, false);
});

test('the aim: soft past 20°, at most ±30°, frozen while charging', async () => {
  const { aim, press, softAim, fishingConfig } = await logic;
  const c = fishingConfig(data);
  near(softAim(c, 10), 10, 1e-12); near(softAim(c, 20), 20, 1e-12);
  near(softAim(c, 45), 25, 1e-12); near(softAim(c, -24), -22, 1e-12); near(softAim(c, 120), 30, 1e-12); assert.equal(softAim(c, 500), 30);
  const g = await newGame(1);
  aim(g, 45, 5000); near(g.aim, 25, 1e-12);
  press(g); aim(g, -10); near(g.aim, 25, 1e-12);
});

test('the strength: 1 → 80 at 50/s while held; at 80 the rod casts by itself with Max Power; flight 0.4 + 0.5 + 0.5p', async () => {
  const { press, release, reticule } = await logic;
  const g = await newGame(1);
  near(g.power, 1 / 80, 1e-12);
  near(reticule(g)[1], 400 + 650 / 80, 1e-9); // the reticule sits at the strength's distance while aiming
  assert.deepEqual(press(g), [{ type: 'charge' }]);
  assert.equal(g.phase, 'charge');
  await frames(g, 30);
  near(g.strength, 26, 1e-9);
  const ev = await run(g, 2, { until: (x) => x.phase === 'cast' });
  near(g.phaseTime, 0, 1e-9);
  assert.deepEqual(ev.at(-1), { type: 'cast', power: 1, max: true });
  near(g.time, 79 / 50, DT + 1e-6, 'auto cast');
  assert.equal(g.lures, 4); assert.equal(g.lure, 1); assert.equal(g.maxPower, true);
  assert.equal(g.bobber.dist, 1050); near(g.bobber.y, 1050, 1e-9);
  assert.deepEqual(release(g), []);
  const landed = await run(g, 3, { until: (x) => x.phase === 'wait' });
  assert.equal(landed.at(-1).type, 'land');
  near(g.time - 79 / 50, 0.4 + 1, 2 * DT, 'flight');
  // Released early: the current power, no Max Power; a quick release flies shorter.
  const h = await newGame(2);
  press(h); await run(h, 0.6); const cast = release(h);
  near(cast[0].power, (1 + 50 * 0.6) / 80, 0.02); assert.equal(cast[0].max, false); assert.equal(h.maxPower, false);
  const t0 = h.time; await run(h, 3, { until: (x) => x.phase === 'wait' });
  near(h.time - t0, 0.4 + 0.5 + 0.5 * cast[0].power, 2 * DT);
});

test('QuickCast: the charge started less than 1 s after the aim began', async () => {
  const { press } = await logic;
  const g = await newGame(3);
  await run(g, 0.9); press(g); assert.equal(g.castFast, true);
  const h = await newGame(3);
  await run(h, 1.05); press(h); assert.equal(h.castFast, false);
});

test('the bobber catches the nearest pond fish', async () => {
  for (let seed = 1; seed <= 25; seed++) {
    const g = await newGame(seed);
    const { aim } = await logic;
    aim(g, (seed % 7) * 8 - 24);
    await castAt(g, (seed % 5) / 5 + 0.1);
    const b = g.bobber, d = (f) => Math.hypot(f.x - b.x, f.y - b.y);
    const hooked = g.pond.fish[g.hooked.index];
    assert.equal(hooked.id, g.hooked.id); assert.equal(hooked.w, g.hooked.w);
    for (const f of g.pond.fish) assert.ok(d(hooked) <= d(f) + 2 * 145 * DT, `${seed}: ${d(hooked)} vs ${d(f)}`);
  }
});

test('the bite 2.5…6.5 s after landing; one fake splash only for w > 0.5; early, late, and late by itself 3 s after the window', async () => {
  const { press, catchBarSize } = await logic;
  let fakes = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const g = await newGame(seed);
    await castAt(g, 0.5);
    const ev = await run(g, 8, { until: (x) => x.phase === 'bite' });
    assert.ok(g.waitTime >= 2.5 - DT && g.waitTime <= 6.5 + DT, String(g.waitTime));
    near(g.waitTime, g.biteAt, DT + 1e-9);
    const f = ev.filter((e) => e.type === 'fake');
    assert.ok(f.length <= 1);
    assert.equal(f.length, g.hooked.w > 0.5 ? 1 : 0);
    fakes += f.length;
    assert.ok(ev.every((e) => e.type === 'fake' || e.type === 'bite'));
  }
  assert.ok(fakes > 0);
  // Too early.
  const g = await newGame(3);
  await castAt(g, 0.5);
  assert.deepEqual(press(g).map((e) => [e.type, e.why]), [['missed', 'early']]);
  assert.equal(g.misses, 1); assert.equal(catchBarSize(g), 27);
  // Late by itself: deadline + 3 s.
  await run(g, 3, { until: (x) => x.phase === 'aim' });
  await toBite(g);
  const gone = await run(g, 3, { until: (x) => x.phase === 'gone' });
  assert.equal(gone.at(-1).type, 'gone'); near(g.waitTime, g.escapeAt, DT + 1e-9);
  const ev = await run(g, 5, { until: (x) => x.phase === 'missed' });
  assert.equal(ev.at(-1).why, 'late'); near(g.log.at(-1).missed === 'late' ? 1 : 0, 1, 0);
  assert.equal(catchBarSize(g), 30);
  // A click after the window: late at once.
  const h = await newGame(4);
  await toBite(h); await run(h, 3, { until: (x) => x.phase === 'gone' });
  assert.deepEqual(press(h).map((e) => [e.type, e.why]), [['missed', 'late']]);
});

test('the catch bar: ±84 /s², no speed limit, ×0.9 a frame at the top, bounces ×−0.3 off the bottom', async () => {
  const { press } = await logic;
  const g = await newGame(4);
  await toBite(g); press(g); assert.equal(g.phase, 'reel');
  const b = g.bar, keep = (x) => { x.bar.energy = 3; };
  assert.equal(b.size, 24); assert.equal(b.pos, 0); assert.equal(b.v, 0);
  g.holding = true; await frames(g, 30, keep);
  near(b.v, 42, 1e-9); near(b.pos, 84 * DT * DT * (30 * 30 / 2 + 30), 1e-9); // x += a·dt²/2 + v·dt with v already updated
  // Top: v → (v + 84/60)·0.9 each frame, the bar stays at 100 − size.
  b.pos = 75; b.v = 50; await frames(g, 120, keep);
  near(b.pos, 76, 1e-9); near(b.v, 84 / 60 * 0.9 / 0.1, 0.01);
  // Bottom: a bounce.
  g.holding = false; b.pos = 0.1; b.v = -30; await run(g, DT * 0.999, { each: keep });
  near(b.pos, 0, 1e-12); near(b.v, (-30 - 84 / 60) * -0.3, 1e-9);
  // No speed limit: falling from the top for a second reaches 84.
  b.pos = 76; b.v = 0; await frames(g, 45, keep);
  near(b.v, -84 * 0.75, 1e-9);
});

test('the fish in the bar: starts at the bottom going up at 4D+20, ×0.99 a frame, shown halfway, an impulse after 2 s, ×−0.7 off the top', async () => {
  const { press } = await logic;
  const g = await newGame(6);
  await toBite(g); press(g);
  const b = g.bar, speed = b.speed;
  b.odds = 0;
  await run(g, DT * 0.999, { each: (x) => { x.bar.energy = 3; } });
  near(b.fishPos, speed / 60, 1e-9); near(b.fish, speed / 120, 1e-9); near(b.fv, speed * 0.99, 1e-9);
  await run(g, 2.05, { each: (x) => { x.bar.energy = 3; x.bar.odds = 0; } });
  near(b.lastImpulse, 2 + DT, DT + 1e-6, 'impulse after 2 s');
  b.fishPos = 99.9; b.fv = 100; b.lastImpulse = b.time; b.odds = 0;
  await run(g, DT * 0.999, { each: (x) => { x.bar.energy = 3; } });
  near(b.fishPos, 100, 1e-12); near(b.fv, 100 * 0.99 * -0.7, 1e-9);
});

test('catch energy: from 2, +1/s in the bar; out of it −1/s after 0.25 s; > 5.5 catches, < −1 loses; Perfect lost only after 0.25 s out', async () => {
  const { press } = await logic;
  const g = await newGame(5);
  await toBite(g); press(g);
  const keepIn = (x) => { if (x.bar) { x.bar.fish = x.bar.fishPos = x.bar.pos + x.bar.size / 2; x.bar.fv = 0; x.bar.odds = 0; x.bar.lastImpulse = x.bar.time; } };
  let out = 0;
  const t0 = g.time;
  // A short trip out (0.2 s) keeps Perfect.
  const ev = await run(g, 10, { each: (x) => { keepIn(x); if (x.bar && x.bar.time > 1 && out < 0.2) { x.bar.fish = x.bar.fishPos = 99; out += DT; } }, until: (x) => x.phase !== 'reel' });
  assert.equal(ev.at(-1).type, 'caught');
  near(g.time - t0, 3.5 + 0.2, 0.05);
  assert.ok(g.card.rows.some((r) => r.key === 'perfectCatch'));
  // 0.3 s out loses Perfect.
  const p = await newGame(5);
  await toBite(p); press(p); out = 0;
  await run(p, 10, { each: (x) => { keepIn(x); if (x.bar && x.bar.time > 1 && out < 0.3) { x.bar.fish = x.bar.fishPos = 99; out += DT; } }, until: (x) => x.phase !== 'reel' });
  assert.equal(p.phase, 'caught'); assert.ok(!p.card.rows.some((r) => r.key === 'perfectCatch'));
  // Out of the bar: 0.25 s of grace, then 3 s from 2 to below −1.
  const h = await newGame(6);
  await toBite(h); press(h); h.holding = false;
  const keepOut = (x) => { if (x.bar) { x.bar.fish = x.bar.fishPos = 99; x.bar.fv = 0; x.bar.odds = 0; x.bar.lastImpulse = x.bar.time; x.bar.pos = 0; x.bar.v = 0; } };
  const t1 = h.time;
  const lost = await run(h, 6, { each: keepOut, until: (x) => x.phase !== 'reel' });
  assert.equal(lost.at(-1).why, 'escape');
  near(h.time - t1, 3.25, 0.05);
});

test('the score card: Valve’s rows and values, the percent rows in order, no Unique Catch', async () => {
  const { fishingConfig, createGame, scoreCatch, catchOf } = await logic;
  const g = createGame(fishingConfig(data));
  const fish = (id, ratio, variant = 0) => { const t = g.config.fish.find((f) => f.id === id); return catchOf(g.config, { ...t, index: 0, w: t.category === 'Trash' ? 0 : (ratio - 0.8) / 0.4, variant }); };
  // Sunken Isles Sunfish, Rare, 11.62 kg, Perfect Streak, Maximum Power, Final Lure → 3,087 (video).
  g.lure = 5; g.streak = 5;
  let card = scoreCatch(g, fish('rewardfish6', 11.62 / 9.9), { maxPower: true });
  assert.deepEqual(card.rows.map((r) => r.key), ['rarity', 'weight', 'streak5', 'maxPower', 'finalLure']);
  assert.ok(Math.abs(card.total - 3087) <= 2, String(card.total));
  assert.equal(card.rows.at(-1).value, Math.floor(0.1 * (card.total - card.rows.at(-1).value)));
  // Final, then Perfect, each 10 % of the sum so far.
  card = scoreCatch(g, fish('rewardfish0', 0.8 + 0.4 * (500 / 1400)), { perfect: true });
  const base = 200 + 600 + 400;
  assert.deepEqual(card.rows.slice(-2).map((r) => [r.key, r.percent, r.value]), [['finalLure', 10, base / 10], ['perfectCatch', 10, Math.floor((base * 1.1) / 10)]]);
  assert.equal(card.total, base + 120 + 132);
  // Shadeshore Snapper, Uncommon, Lustrous, Small → 1,700 (video).
  g.lure = 2; g.streak = 1;
  card = scoreCatch(g, fish('rewardfish2', 0.9, 1));
  assert.deepEqual(card.rows.map((r) => [r.key, r.value]), [['rarity', 500], ['variant', 750], ['weight', 450]]);
  assert.equal(card.total, 1700);
  // Variant 2: 1500. Streaks 3 / 4: 100 / 250. QuickCast 200.
  g.lure = 3; g.streak = 3;
  card = scoreCatch(g, fish('rewardfish0', 0.9, 2), { fast: true });
  assert.deepEqual(card.rows.map((r) => [r.key, r.value]), [['rarity', 200], ['variant', 1500], ['weight', 450], ['streak3', 100], ['fastCast', 200]]);
  g.streak = 4; assert.ok(scoreCatch(g, fish('rewardfish0', 0.9)).rows.some((r) => r.key === 'streak4' && r.value === 250));
  // The first lure; never a Unique Catch, even for a species never caught.
  g.lure = 1; g.streak = 1; g.caughtBefore.clear();
  card = scoreCatch(g, fish('rewardfish7', 1.2));
  assert.deepEqual(card.rows.map((r) => [r.key, r.value]), [['rarity', 1000], ['weight', 1500], ['firstLure', 100]]);
  // Trash: 100 + the Trash Bonus 100, no weight row.
  g.lure = 2; card = scoreCatch(g, fish('reward_trash_shoe', 1));
  assert.deepEqual(card.rows.map((r) => [r.key, r.value]), [['rarity', 100], ['trash', 100]]);
  assert.equal(card.total, 200);
});

test('Tidehunter’s verdict: goodjob from 6001, okayjob above 0, badjob at 0', async () => {
  const { verdict } = await logic;
  assert.equal(verdict(6001), 'goodjob'); assert.equal(verdict(6000), 'okayjob'); assert.equal(verdict(1), 'okayjob'); assert.equal(verdict(0), 'badjob');
});

test('the pond fish swim: a school near home at 70 u/s (variants 140); they keep still on the line and flee a missed bobber', async () => {
  const { press } = await logic;
  const g = await newGame(9);
  const before = g.pond.fish.map((f) => [f.x, f.y]);
  await run(g, DT * 0.999);
  for (const f of g.pond.fish) {
    const [x, y] = before[f.index], v = Math.hypot(f.x - x, f.y - y) * 60;
    near(v, (f.variant ? 140 : 70) + (f.index % 3) * 10 - 10, 1e-6, `fish ${f.index}`);
  }
  await run(g, 0.9);
  // The school stays around home (pulled back past 300).
  const h = await newGame(10);
  const { aim } = await logic;
  for (let i = 0; i < 20 * 60; i++) { await run(h, DT * 0.999); h.phaseTime = 0; aim(h, 0); }
  assert.equal(h.phase, 'aim');
  for (const f of h.pond.fish) assert.ok(Math.hypot(f.x - f.home[0], f.y - f.home[1]) < 700, `${f.index}: ${f.x}, ${f.y}`);
  // On the line: the hooked fish waits; a miss scatters the rest at 300 u/s.
  await castAt(g, 0.6);
  const hooked = g.pond.fish[g.hooked.index], at = [hooked.x, hooked.y];
  await run(g, 1);
  assert.deepEqual([hooked.x, hooked.y], at);
  press(g); assert.equal(g.phase, 'missed');
  const b = g.bobber, dist = () => g.pond.fish.map((f) => Math.hypot(f.x - b.x, f.y - b.y));
  const d0 = dist(); await run(g, 1); const d1 = dist();
  assert.ok(d1.every((d, i) => d > d0[i] + 100), JSON.stringify([d0, d1]));
});

test('a whole game with a good pilot: five lures, catches, a score, the end', async () => {
  const { press, release, step } = await logic;
  for (const seed of [11, 12, 13]) {
    const g = await newGame(seed);
    const events = [];
    for (let t = 0; t < 200 && g.phase !== 'over'; t += DT) {
      if (g.phase === 'aim' && g.phaseTime > 0.3) press(g);
      if (g.phase === 'bite' && g.phaseTime > 0.2) press(g);
      if (g.phase === 'reel') pilot(g);
      events.push(...step(g, DT));
    }
    assert.equal(g.phase, 'over');
    assert.equal(g.lures, 0);
    assert.equal(g.log.length, 5);
    const caughtN = g.log.filter((l) => l.caught).length;
    assert.ok(caughtN >= 3, JSON.stringify(g.log));
    assert.equal(g.score, g.catches.reduce((s, c) => s + c.score, 0));
    assert.ok(events.some((e) => e.type === 'over'));
    assert.ok(events.filter((e) => e.type === 'row').length >= caughtN * 2);
    // Held to the end: every cast was Max Power and quick.
    for (const c of g.catches) assert.ok(c.score > 0);
    void release;
  }
});

test('a pilot that keeps the bar away from the fish loses every fish', async () => {
  const { press, release, step } = await logic;
  const g = await newGame(12);
  for (let t = 0; t < 200 && g.phase !== 'over'; t += DT) {
    if (g.phase === 'aim') press(g);
    if (g.phase === 'charge' && g.power > 0.5) release(g);
    if (g.phase === 'bite') press(g);
    if (g.phase === 'reel') g.holding = g.bar.fish < 50;
    step(g, DT);
  }
  assert.equal(g.phase, 'over');
  assert.equal(g.score, 0);
  assert.ok(g.log.every((l) => l.missed));
});
