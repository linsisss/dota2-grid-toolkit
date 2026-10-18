const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../assets/minigames/race/data.json');
const scene = require('../assets/minigames/race/scene/scene.json');
const logic = import('../src/minigames/games/race/logic.mjs');

// A repeatable random source (mulberry32).
function seeded(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DT = 1 / 120;
// Runs until `until(game)` or the time limit; returns every event.
async function run(game, seconds, { until, onStep } = {}) {
  const { step } = await logic;
  const events = [];
  for (let t = 0; t < seconds && game.phase === 'running'; t += DT) {
    onStep?.(game);
    events.push(...step(game, DT));
    if (until?.(game)) break;
  }
  return events;
}
// A decent pilot: beats the wings to reach the middle of the next gap (kept 40 inside its rocks and the bounds).
async function autopilot(game) {
  const { flap } = await logic;
  return (g) => {
    const p = g.player, next = g.obstacles.filter((o) => o.x + 50 > p.x).sort((a, b) => a.x - b.x)[0];
    let target = 385;
    if (next) target = Math.min(Math.max(next.bottom + next.gap / 2, Math.max(60, next.bottom + 50) + 40), Math.min(710, next.top - 50) - 40);
    if (p.z < target - 30 && p.vz < 300) flap(g);
  };
}

test('Valve data → config: physics, speeds, race and obstacle numbers', async () => {
  const { raceConfig } = await logic;
  const c = raceConfig(data);
  assert.equal(c.gravity, -2000); assert.equal(c.jump, 600); assert.equal(c.minimumSpeed, 50);
  assert.deepEqual(c.player, { initialSpeed: 340, maxSpeed: 560, acceleration: 30, actionCooldown: 6 });
  assert.deepEqual(c.opponent, { initialSpeed: 320, maxSpeed: 449, acceleration: 40, actionCooldown: 0.075 });
  assert.equal(c.raceDistance, 20000); assert.equal(c.obstacleInterval, 450);
  assert.equal(c.gapStart, 450); assert.equal(c.gapMin, 300);
  assert.equal(c.hitSlowdown, 200); assert.equal(c.landedMaxSpeed, 200); assert.equal(c.hitStun, 0.5);
  assert.deepEqual(c.playerBounds, [60, 710]); assert.deepEqual(c.obstacleBounds, [-70, 840]); assert.deepEqual(c.cameraEdges, [-350, 0]);
});

test('gravity and the flap: the climb speed becomes 600, then −2000 u/s² pulls down', async () => {
  const { raceConfig, createRace, flap, step } = await logic;
  const game = createRace(raceConfig(data), { random: seeded(1) });
  game.time = 5; game.player.z = 400; game.player.vz = 0;
  assert.deepEqual(flap(game), [{ type: 'flap' }]);
  assert.equal(game.player.vz, 600);
  step(game, 0.1);
  assert.ok(Math.abs(game.player.vz - 400) < 1e-9);
  assert.ok(Math.abs(game.player.z - (400 + 400 * 0.1)) < 1e-9);
  // Never above the top bound.
  for (let i = 0; i < 40; i++) { flap(game); step(game, 0.05); }
  assert.ok(game.player.z <= 710);
});

test('start (client.dll): both at x = 0, Skywrath at 385 and 340, Batrider on the ground at 320; speeds +30 / +40', async () => {
  const { raceConfig, createRace } = await logic;
  const game = createRace(raceConfig(data), { random: seeded(2) });
  assert.equal(game.player.speed, 340); assert.equal(game.opponent.speed, 320);
  assert.equal(game.player.x, 0); assert.equal(game.opponent.x, 0);
  assert.equal(game.player.z, 385); assert.equal(game.opponent.z, 60);
  const fly = await autopilot(game);
  await run(game, 2, { onStep: (g) => { g.obstacles.length = 0; fly(g); } });
  assert.ok(Math.abs(game.player.speed - 400) < 1);
  assert.ok(Math.abs(game.opponent.speed - 400) < 1);
  await run(game, 10, { onStep: (g) => { g.obstacles.length = 0; fly(g); } });
  assert.equal(game.player.speed, 560); assert.equal(game.opponent.speed, 449);
});

test('obstacles (client.dll): one per 450 of camera, 1600 + 0…85 ahead; race gap always 450, endless −150 per 180 s with no floor; no shift limit', async () => {
  const { raceConfig, makeObstacle, gapAt, createRace, step } = await logic;
  const c = raceConfig(data);
  assert.equal(gapAt(c, 0), 450); assert.equal(gapAt(c, 300), 450, 'a race keeps 450');
  assert.equal(gapAt(c, 0, 'endless'), 450); assert.equal(gapAt(c, 180, 'endless'), 300); assert.equal(gapAt(c, 360, 'endless'), 150);
  const random = seeded(3);
  let maxShift = 0, previous = null;
  for (let i = 0; i < 2000; i++) {
    const o = makeObstacle(c, i * 450, 450, random);
    assert.ok(o.bottom >= -70 - 1e-9 && o.top <= 840 + 1e-9, `${o.bottom} ${o.top}`);
    assert.equal(o.top - o.bottom, 450);
    if (previous) maxShift = Math.max(maxShift, Math.abs(o.bottom - previous.bottom));
    previous = o;
  }
  assert.ok(maxShift > 400, `neighbours move freely (${maxShift})`);
  const game = createRace(c, { random: seeded(4) });
  const fly = await autopilot(game);
  await run(game, 40, { onStep: fly });
  assert.ok(game.spawned > 30);
  for (const o of game.obstacles) assert.ok(o.x < c.raceDistance - 250 + 85);
  const first = createRace(c, { random: seeded(5) });
  for (let i = 0; i < 2000 && !first.obstacles.length; i++) { first.player.vz = Math.max(first.player.vz, 0); step(first, DT); }
  assert.ok(first.obstacles[0].x >= 2050 && first.obstacles[0].x <= 2135, `${first.obstacles[0].x}`);
});

test('a hit: −200 speed, 0.5 s without control, the rock counts once', async () => {
  const { raceConfig, createRace, flap, step } = await logic;
  const game = createRace(raceConfig(data), { random: seeded(5) });
  game.time = 5;
  game.player.speed = 500;
  game.obstacles = [{ x: game.player.x + 30, gap: 400, bottom: 300, top: 700, hit: false, passed: false, variant: 0 }];
  game.spawned = Infinity;
  game.player.z = 200; game.player.vz = 0;
  const events = step(game, DT);
  assert.equal(events.filter((e) => e.type === 'hit').length, 1);
  assert.ok(Math.abs(game.player.speed - (500 + 30 * DT - 200)) < 1e-6);
  assert.equal(game.player.stun, 0.5);
  // 0.5 s hanging: no gravity, no acceleration, the climb speed is 0
  const z = game.player.z, speed = game.player.speed;
  step(game, 0.1);
  assert.equal(game.player.vz, 0); assert.equal(game.player.z, z); assert.equal(game.player.speed, speed);
  assert.deepEqual(flap(game), []);
  step(game, 0.3);
  assert.deepEqual(flap(game), []);
  assert.equal(step(game, DT).filter((e) => e.type === 'hit').length, 0);
  step(game, 0.25);
  assert.deepEqual(flap(game), [{ type: 'flap' }]);
  // Never below the minimum speed.
  game.player.speed = 120; game.player.stun = 0;
  game.obstacles = [{ x: game.player.x + 10, gap: 400, bottom: 900, top: 1300, hit: false, passed: false, variant: 0 }];
  step(game, DT);
  assert.equal(game.player.speed, 50);
});

test('on the ground (race) the speed drops to 200 and sand plays; a flap lifts off', async () => {
  const { raceConfig, createRace, step, flap } = await logic;
  const game = createRace(raceConfig(data), { random: seeded(6) });
  game.time = 5; game.obstacles = []; game.spawned = Infinity;
  game.player.speed = 560; game.player.z = 70; game.player.vz = -100;
  const events = [];
  for (let i = 0; i < 240; i++) events.push(...step(game, DT));
  assert.ok(events.some((e) => e.type === 'land'));
  assert.ok(events.some((e) => e.type === 'sand'));
  assert.equal(game.player.landed, true);
  assert.equal(game.player.speed, 200);
  flap(game); step(game, DT);
  assert.equal(game.player.landed, false);
});

test('endless: rocks and the ground end the run; the score is 0.4 per unit', async () => {
  const { raceConfig, createRace, step } = await logic;
  const c = raceConfig(data);
  const game = createRace(c, { mode: 'endless', random: seeded(7) });
  assert.equal(game.finish, Infinity);
  game.time = 5; game.obstacles = []; game.spawned = Infinity;
  game.player.z = 300; game.player.vz = 0;
  for (let i = 0; i < 30; i++) step(game, DT);
  assert.equal(game.score, Math.floor(game.player.x * 0.4));
  game.player.z = 61; game.player.vz = -300;
  const events = step(game, DT);
  assert.equal(game.phase, 'over');
  assert.deepEqual(events.at(-1).type, 'crash');
  assert.equal(events.at(-1).what, 'ground');

  const again = createRace(c, { mode: 'endless', random: seeded(8) });
  again.obstacles = [{ x: again.player.x + 20, gap: 300, bottom: 500, top: 800, hit: false, passed: false, variant: 0 }];
  again.spawned = Infinity; again.player.z = 400;
  const hit = step(again, DT);
  assert.equal(hit.at(-1).what, 'rock');
});

test('the camera keeps the hero within its edge thresholds', async () => {
  const { raceConfig, createRace } = await logic;
  const game = createRace(raceConfig(data), { random: seeded(9) });
  const fly = await autopilot(game);
  await run(game, 20, { onStep: (g) => { fly(g); const rel = g.player.x - g.camera.x; assert.ok(rel >= -350 - 1e-6 && rel <= 1e-6, `rel ${rel}`); } });
});

test('a clean race beats Batrider in about 37 s; flying into the ground loses', async () => {
  const { raceConfig, raceShapes, createRace } = await logic;
  const c = raceConfig(data, raceShapes(scene));
  const game = createRace(c, { random: seeded(10) });
  const fly = await autopilot(game);
  const events = await run(game, 80, { onStep: fly });
  const finish = events.find((e) => e.type === 'finish');
  assert.ok(finish, 'the race ends');
  assert.equal(finish.winner, 'player');
  assert.ok(game.time > 34 && game.time < 43, `time ${game.time}`);
  assert.ok(game.player.hits <= 3, `hits ${game.player.hits}`);
  assert.equal(game.score, 1000, 'a won race writes 1 000');

  // never flapping: Batrider is over the line while the hero is more than 1 800 short of it — lost at once
  const lazy = createRace(c, { random: seeded(11) });
  const lost = await run(lazy, 120);
  assert.equal(lost.find((e) => e.type === 'finish')?.winner, 'opponent');
  assert.ok(lazy.player.x < c.raceDistance - 1800);
});

test('Batrider (client.dll): beats below a bottom tip + 150, every 0.075 s at most; weaves by 100·sin(t); no collisions', async () => {
  const { raceConfig, createRace, step } = await logic;
  const c = raceConfig(data);
  const game = createRace(c, { random: seeded(13) });
  game.spawned = Infinity;
  game.obstacles = [{ x: 400, gap: 450, bottom: 200, top: 650, hit: false, passed: false, variant: 0 }];
  const o = game.opponent;
  step(game, DT);
  assert.equal(o.vz, c.jump + c.gravity * DT, 'below 200 + 150: a beat');
  assert.ok(o.flapCooldown > 0);
  // the weave: with the speed held, x moves by (v + 100·sin t)·dt
  game.obstacles = [];
  o.speed = 449; o.x = 1000; game.time = Math.PI / 2 - DT;
  step(game, DT);
  assert.ok(Math.abs(o.x - (1000 + (449 + 100) * DT)) < 1e-6, `${o.x}`);
});

test('endless (client.dll): an unseen Batrider; while he is ahead the hero accelerates ×1.5 (+45)', async () => {
  const { raceConfig, createRace, step } = await logic;
  const c = raceConfig(data);
  const game = createRace(c, { mode: 'endless', random: seeded(14) });
  game.spawned = Infinity; game.time = 5;
  game.opponent.x = 500; game.player.x = 0; game.player.speed = 400; game.player.z = 400;
  step(game, 0.1);
  assert.ok(Math.abs(game.player.speed - 404.5) < 1e-9);
  game.opponent.x = -1000;
  step(game, 0.1);
  assert.ok(Math.abs(game.player.speed - 407.5) < 1e-9);
  const race = createRace(c, { random: seeded(15) });
  race.spawned = Infinity; race.time = 5; race.opponent.x = 500; race.player.speed = 400; race.player.z = 400;
  step(race, 0.1);
  assert.ok(Math.abs(race.player.speed - 403) < 1e-9, 'a race always +30');
});

test('flyable: in a race (gap 450) every pair of neighbours can be passed — a decent pilot wins every seed', async () => {
  const { raceConfig, createRace } = await logic;
  const c = raceConfig(data);
  // worst case: centres 460 apart, ≥ 265 units of free x at ≤ 560: climb 110 at 600/s, fall 110 freely
  const room = (365 - 100) / 560, need = (840 - 450 + 70) - (450 - 100);
  assert.ok(600 * room > need && 1000 * room * room > need);
  for (let seed = 20; seed < 40; seed++) {
    const game = createRace(c, { random: seeded(seed) });
    const fly = await autopilot(game);
    await run(game, 90, { onStep: fly });
    assert.equal(game.winner, 'player', `seed ${seed}`);
  }
});

test('the endless run (Valve: the gap keeps shrinking, so it does end) with a decent pilot lasts 30 s and scores ~224 a second at full speed', async () => {
  const { raceConfig, raceShapes, createRace } = await logic;
  const game = createRace(raceConfig(data, raceShapes(scene)), { mode: 'endless', random: seeded(29) });
  const fly = await autopilot(game);
  await run(game, 30, { onStep: fly });
  assert.equal(game.phase, 'running', `crashed at ${game.time}`);
  const before = game.score;
  await run(game, 1, { onStep: fly });
  assert.ok(Math.abs(game.score - before - 224) <= 2, `${game.score - before}`);
});

test('the rendered outlines: four of each kind, edges around the tip, narrower near it', async () => {
  const { raceShapes, edgesAt } = await logic;
  const shapes = raceShapes(scene);
  assert.equal(shapes.top.length, 4); assert.equal(shapes.bottom.length, 4);
  for (const shape of [...shapes.top, ...shapes.bottom]) {
    const near = edgesAt(shape, 10), far = edgesAt(shape, 200);
    assert.ok(near[0] <= near[1] && far[0] < 0 && far[1] > 0);
    assert.ok(far[1] - far[0] > near[1] - near[0]);
  }
  assert.equal(edgesAt(shapes.top[0], -5), null);
});

test('rewards: next mark after a score', async () => {
  const { nextReward, REWARDS } = await logic;
  assert.deepEqual(REWARDS.map(([at]) => at), [1000, 5000, 12000]);
  assert.deepEqual(nextReward(0), [1000, 1]);
  assert.deepEqual(nextReward(1000), [5000, 2]);
  assert.equal(nextReward(12000), null);
});
