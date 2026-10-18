// «Крылатые гонки»: the rules, without any drawing (tests/minigames-race.test.cjs). The numbers come
// from Valve's flappy_skywrath_act2.vdata (assets/minigames/race/data.json → raceConfig); the rules are
// Valve's own code from client.dll (the popup CDOTA_DB_Popup_BP_Crownfall_Encounter_Flappy_Skywrath,
// docs/minigames/reverse/race.md): the start, Batrider's pilot, where the rocks go, the hit, the camera.
// docs/minigames.md («Крылатые гонки») lists what is still ours.
//
// The world is a side view in Valve's units: x runs along the track (both start at 0), z is the
// height (the player's centre stays within vPlayerVerticalBounds). The game is one mutable object;
// flap() and step() return the events they caused (sounds, effects, the end) and the view redraws
// from the object.

const taper = (widths) => ({ step: 50, left: widths.map((w) => -w), right: widths });
const DEFAULT_SHAPES = {
  top: [taper([18, 38, 55, 68, 78, 86, 92, 96, 100, 100, 100, 100, 100, 100, 100, 100, 100])],
  bottom: [taper([40, 58, 66, 70, 72, 72, 72, 72, 72, 72, 72, 72, 72, 72, 72, 72])],
};
// The outlines from the render's metadata (scene.json obstacles: edges in screen pixels every `step`
// pixels), turned into units by its scale.
export function raceShapes(scene) {
  const k = scene?.pxPerUnit, out = {};
  if (!k) return {};
  for (const kind of ['top', 'bottom']) {
    const o = scene.obstacles?.[kind];
    if (!o?.frames?.length) return {};
    out[kind] = o.frames.map((f) => ({ step: o.step / k, left: f.left.map((v) => v / k), right: f.right.map((v) => v / k) }));
  }
  return out;
}
const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function raceConfig(data = {}, shapes = {}) {
  const def = data.flappy_skywrath_act2 || data;
  const level = def.vecDifficulties?.[0] || {};
  const character = (c = {}, fallback) => ({
    initialSpeed: num(c.flInitialSpeed, fallback.initialSpeed), maxSpeed: num(c.flMaxSpeed, fallback.maxSpeed),
    acceleration: num(c.flAcceleration, fallback.acceleration), actionCooldown: num(c.flActionCooldown, fallback.actionCooldown),
  });
  const pair = (value, fallback) => (Array.isArray(value) && value.length >= 2 ? [num(value[0], fallback[0]), num(value[1], fallback[1])] : fallback);
  return {
    gravity: num(def.flGravity, -2000),
    jump: num(def.flJumpPower, 600),
    minimumSpeed: num(def.flMinimumSpeed, 50),
    player: character(level.characterPlayer, { initialSpeed: 340, maxSpeed: 560, acceleration: 30, actionCooldown: 6 }),
    opponent: character(level.characterOpponent, { initialSpeed: 320, maxSpeed: 449, acceleration: 40, actionCooldown: 0.075 }),
    raceDistance: num(level.flRaceDistance, 20000),
    obstacleInterval: num(level.flBaseObstacleDistanceInterval, 450),
    gapStart: num(level.flBaseObstacleGapDistance, 450),
    gapMin: num(level.flMinObstacleGapDistance, 300),
    hitSlowdown: num(level.flCollisionSpeedReduction, 200),
    landedMaxSpeed: num(level.flLandedMaxSpeed, 200),
    hitStun: num(level.flCollisionInputCooldown, 0.5),
    playerSize: pair(def.vPlayerSize, [100, 100]),
    playerBounds: pair(def.vPlayerVerticalBounds, [60, 710]),
    obstacleBounds: pair(def.vObstacleVerticalBounds, [-70, 840]),
    cameraEdges: pair(def.vCameraEdgeThresholds, [-350, 0]),
    cameraAcceleration: num(def.flCameraAcceleration, 300),
    // client.dll constants (not in the data): rocks are placed 1600 ahead of the camera with up to 85 more,
    // the last one 250 before the finish; the endless gap shrinks by (base − min) every 180 s with no floor;
    // Batrider beats his wings below a bottom tip + base gap / 3 and weaves by 100·sin(t); the endless score
    // is x / 2.5; a won race writes 1 000.
    spawnAhead: 1600, spawnJitter: 85, finishClear: 250, endlessGapTime: 180, batWeave: 100, batGiveUp: 2000, batFinishOver: 200,
    scorePerUnit: 0.4, raceWinScore: 1000, endlessBoost: 1.5, fallEase: 2, obstacleWidth: 100,
    // The obstacles' outlines, one per drawn variant: left and right edge (units, from the obstacle's
    // x) every `step` units away from the tip, measured on the rendered models (scene/scene.json via
    // raceShapes); a plain taper if they are missing.
    shapes: shapes.top && shapes.bottom ? shapes : DEFAULT_SHAPES,
  };
}

// The gap between the tips (FUN_1828f98b0): in a race always flBaseObstacleGapDistance (450); in the endless
// mode it shrinks by (base − min) every 180 s of the run, without a lower limit.
export function gapAt(config, time = 0, mode = 'race') {
  if (mode !== 'endless') return config.gapStart;
  return config.gapStart - (config.gapStart - config.gapMin) * (time / config.endlessGapTime);
}

// One obstacle: a stalactite from above and a stone from below, their tips `gap` apart. The bottom tip is
// RandomFloat(low, high − gap) and every pair is independent of the last (no limit on the shift).
export function makeObstacle(config, x, gap = config.gapStart, random = Math.random) {
  const [low, high] = config.obstacleBounds;
  const bottom = low + random() * (high - gap - low);
  return { x, gap, bottom, top: bottom + gap, hit: false, passed: false, variant: Math.floor(random() * 4) };
}

function character(spec, x, z) {
  return { x, z, vz: 0, speed: spec.initialSpeed, stun: 0, landed: false, flapCooldown: 0, flapAt: -1, hits: 0, finishedAt: null };
}

// FUN_182925b50: both start at x = 0; Skywrath halfway up the bounds (385) at 340, Batrider on the ground at 320.
// Batrider is simulated in the endless mode too (unseen): while he is ahead the hero accelerates ×1.5.
export function createRace(config, { mode = 'race', random = Math.random } = {}) {
  const [floor, ceiling] = config.playerBounds;
  const game = {
    config, mode, random, phase: 'running', time: 0,
    player: character(config.player, 0, (floor + ceiling) / 2),
    opponent: character(config.opponent, 0, floor),
    camera: { x: 0, speed: 0 },
    obstacles: [], spawned: 0, lastHit: null,
    finish: mode === 'race' ? config.raceDistance : Infinity,
    score: 0, winner: null, sandTimer: 0,
  };
  return game;
}

// FUN_18293a390: a new pair when fewer than int(camera / interval) were placed (one at a time), at
// camera + 1600 + RandomFloat(0, 85); in a race only while that is short of the finish − 250. Rocks more than
// 1600 behind the camera go.
function spawn(game) {
  const { config } = game, cam = game.camera.x;
  if (game.spawned < Math.floor(cam / config.obstacleInterval)) {
    const x0 = cam + config.spawnAhead;
    if (game.mode === 'endless' || x0 < config.raceDistance - config.finishClear) {
      game.obstacles.push(makeObstacle(config, x0 + game.random() * config.spawnJitter, gapAt(config, game.time, game.mode), game.random));
      game.spawned++;
    }
  }
  while (game.obstacles.length && game.obstacles[0].x < cam - config.spawnAhead) game.obstacles.shift();
}

// An outline's edges `fromTip` units away from its tip: [left, right] relative to the obstacle's x
// (null above or below the model).
export function edgesAt(shape, fromTip) {
  if (fromTip < 0) return null;
  const i = fromTip / shape.step, at = Math.floor(i), n = shape.left.length;
  if (at >= n - 1) return at > n + 40 ? null : [shape.left[n - 1], shape.right[n - 1]];
  const t = i - at;
  return [shape.left[at] + (shape.left[at + 1] - shape.left[at]) * t, shape.right[at] + (shape.right[at + 1] - shape.right[at]) * t];
}
const pick = (list, variant) => list[variant % list.length];

// Does a box of `size` centred at (x, z) touch this obstacle's drawn stalactite or stone? (The picture's
// outlines; the rules use rockHit below, as Valve does.)
export function touches(config, obstacle, x, z, size = config.playerSize) {
  const [w, h] = size, dx = x - obstacle.x;
  if (Math.abs(dx) > w / 2 + 260) return false;
  const top = pick(config.shapes.top, obstacle.variant), bottom = pick(config.shapes.bottom, obstacle.variant);
  for (let k = 0; k <= 4; k++) {
    const y = z - h / 2 + (h * k) / 4;
    const e = y >= obstacle.top ? edgesAt(top, y - obstacle.top) : y <= obstacle.bottom ? edgesAt(bottom, obstacle.bottom - y) : null;
    if (e && dx + w / 2 > e[0] && dx - w / 2 < e[1]) return true;
  }
  return false;
}
// FUN_1828fb380: a rock is a 100-wide segment at its tip; Skywrath is 100×100 but only his centre's x counts:
// |x − rock.x| < 50, then the stone hits when z − 50 < its tip, the stalactite when z + 50 > its tip.
export function rockHit(config, obstacle, x, z) {
  if (Math.abs(x - obstacle.x) >= config.obstacleWidth / 2) return null;
  const half = config.playerSize[1] / 2;
  if (z - half < obstacle.bottom) return 'bottom';
  if (z + half > obstacle.top) return 'top';
  return null;
}

// A click, Space, W or ↑ (Valve's vecInputActions «Jump», on the press): the climb speed becomes the jump
// power. Ignored while stunned after a hit and once the run is over (no cooldown for Skywrath).
export function flap(game) {
  const p = game.player;
  if (game.phase !== 'running' || p.stun > 0 || p.finishedAt !== null) return [];
  p.vz = game.config.jump; p.flapAt = game.time;
  if (p.landed) p.landed = false;
  return [{ type: 'flap' }];
}

// FUN_18293d690 (the hero) / FUN_18293a5f0 (Batrider): speed += acceleration·dt within [minimum, max]; while
// stunned no gravity and no acceleration. The hero's fall is eased for the first 2 s (vz × min(1, t/2)). The
// ceiling only holds the height; the ground holds it, stops the fall and (the hero) caps the speed at 200.
function move(game, who, spec, dt, events, isPlayer) {
  const { config } = game, [floor, ceiling] = config.playerBounds;
  const stunned = who.stun > 0;
  let accel = stunned ? 0 : spec.acceleration;
  if (isPlayer && !stunned && game.mode === 'endless' && game.opponent.x > who.x) accel *= config.endlessBoost;
  if (!stunned) who.vz += config.gravity * dt;
  who.speed = clamp(who.speed + accel * dt, config.minimumSpeed, spec.maxSpeed);
  // (Valve multiplies once a frame; here once per 1/60 s whatever the step)
  if (isPlayer && who.vz < 0) who.vz *= Math.min(1, game.time / config.fallEase) ** (dt * 60);
  who.x += (who.speed + (isPlayer ? 0 : config.batWeave * Math.sin(game.time))) * dt;
  who.z += who.vz * dt;
  if (who.z >= ceiling) who.z = ceiling;
  if (who.z <= floor) {
    who.z = floor; who.vz = 0;
    if (isPlayer) who.speed = Math.min(who.speed, config.landedMaxSpeed);
    if (!who.landed) { who.landed = true; if (isPlayer) events.push({ type: 'land' }); }
  } else if (who.z > floor + 4) who.landed = false;
  who.stun = Math.max(0, who.stun - dt);
  who.flapCooldown = Math.max(0, who.flapCooldown - dt);
}

// Batrider's pilot (FUN_18293a5f0): the nearest bottom stone ahead of him; below its tip + base gap / 3 he beats
// his wings (600), no more often than flActionCooldown. He ignores the stalactites and never hits anything.
function pilot(game, who, spec) {
  if (who.flapCooldown > 0 || who.finishedAt !== null) return;
  let next = null;
  for (const o of game.obstacles) if (o.x > who.x && (!next || o.x < next.x)) next = o;
  if (next && who.z < next.bottom + game.config.gapStart / 3) { who.vz = game.config.jump; who.flapCooldown = spec.actionCooldown; who.flapAt = game.time; }
}

// FUN_182931940: the camera keeps up to 350 ahead of the hero: further behind it jumps to x + 350 at his speed,
// ahead of it it stands on him; in between its speed grows by remap(−350…0 → 0…1)·300 a second.
function moveCamera(game, dt) {
  const { config } = game, cam = game.camera, p = game.player;
  if (game.mode === 'race' && cam.x >= game.finish) return;
  const [back, front] = config.cameraEdges, rel = p.x - cam.x;
  if (rel < back) { cam.x = p.x - back; cam.speed = p.speed; }
  else if (rel > front) cam.x = p.x - front;
  else cam.speed += (rel - back) / (front - back || 1) * config.cameraAcceleration * dt;
  cam.x += cam.speed * dt;
  if (game.mode === 'race') cam.x = Math.min(cam.x, game.finish);
}

export function step(game, dt) {
  const events = [];
  if (game.phase !== 'running' || dt <= 0) return events;
  const { config } = game, p = game.player, o = game.opponent;
  game.time += dt;
  move(game, p, config.player, dt, events, true);
  // Batrider: no collisions; past the finish he stops 200 beyond it.
  pilot(game, o, config.opponent); move(game, o, config.opponent, dt, events, false);
  if (o.x > config.raceDistance) {
    if (o.finishedAt === null) o.finishedAt = game.time;
    o.x = Math.min(o.x, config.raceDistance + config.batFinishOver);
    // more than 2000 ahead of the hero once over the line: the race is lost at once
    if (o.x > p.x + config.batGiveUp) { game.winner = 'opponent'; p.stun = 99; return end(game, events, game.mode === 'race' ? { type: 'finish', winner: 'opponent' } : { type: 'crash', what: 'bat', x: p.x, z: p.z }); }
  }
  moveCamera(game, dt);
  spawn(game);

  // Rocks: a hit costs 200 speed, stops the climb and leaves 0.5 s without control, gravity or acceleration;
  // the rock that hit last does not hit again; in the endless mode it ends the run.
  if (p.stun <= 0) {
    for (const obstacle of game.obstacles) {
      if (!obstacle.passed && obstacle.x + config.obstacleWidth / 2 < p.x - config.playerSize[0] / 2) obstacle.passed = true;
      const part = rockHit(config, obstacle, p.x, p.z);
      if (!part || (game.lastHit?.obstacle === obstacle && game.lastHit.part === part)) continue;
      game.lastHit = { obstacle, part };
      obstacle.hit = true;
      p.hits++;
      if (game.mode === 'endless') { p.vz = Math.min(p.vz, 0); return end(game, events, { type: 'crash', what: 'rock', x: p.x, z: p.z }); }
      p.vz = 0;
      p.speed = Math.max(config.minimumSpeed, p.speed - config.hitSlowdown);
      p.stun = config.hitStun;
      events.push({ type: 'hit', x: p.x, z: p.z, top: part === 'top' });
      break;
    }
  }
  if (game.mode === 'endless' && p.landed) return end(game, events, { type: 'crash', what: 'ground', x: p.x, z: p.z });
  if (p.landed) {
    game.sandTimer -= dt;
    if (game.sandTimer <= 0) { events.push({ type: 'sand' }); game.sandTimer = 0.25 + game.random() * 0.25; }
  } else game.sandTimer = 0;

  if (game.mode === 'endless') {
    game.score = Math.floor(Math.max(0, p.x) * config.scorePerUnit);
    return events;
  }
  // The hero crosses the line: won if Batrider is not over it yet.
  if (p.finishedAt === null && p.x > game.finish) {
    p.x = game.finish; p.finishedAt = game.time; p.stun = 99;
    game.winner = o.x < game.finish ? 'player' : 'opponent';
    if (game.winner === 'player') game.score = config.raceWinScore;
    return end(game, events, { type: 'finish', winner: game.winner });
  }
  return events;
}

function end(game, events, event) {
  game.phase = 'over';
  game.endedAt = game.time;
  events.push(event);
  return events;
}

// After the end the scene still moves for the outro (the hero glides on, then the circle closes).
export function coast(game, dt) {
  if (game.phase !== 'over') return;
  const { config } = game, p = game.player;
  game.time += dt;
  if (game.mode === 'race' && game.winner === 'player') {
    // Past the finish he glides down and lands by the banners.
    p.speed = Math.max(0, p.speed - 300 * dt);
    p.x += p.speed * dt;
    p.vz = Math.max(p.vz + config.gravity * 0.35 * dt, -250);
    p.z = Math.max(config.playerBounds[0], p.z + p.vz * dt);
  } else {
    p.speed = Math.max(0, p.speed - 500 * dt);
    p.x += p.speed * dt;
    p.vz += config.gravity * dt;
    p.z = Math.max(config.playerBounds[0], p.z + p.vz * dt);
  }
  const o = game.opponent;
  if (game.mode === 'race') { o.speed = Math.max(o.finishedAt !== null ? 0 : o.speed - 200 * dt, 0); o.x = Math.min(o.x + o.speed * dt, config.raceDistance + config.batFinishOver); pilot(game, o, config.opponent); o.vz += config.gravity * dt; o.z = clamp(o.z + o.vz * dt, config.playerBounds[0], config.playerBounds[1]); o.flapCooldown = Math.max(0, o.flapCooldown - dt); }
  // after the end the camera eases onto the hero: cam += (x − cam)·0.06 a frame (60 a second)
  const cam = game.camera;
  cam.x += (p.x - cam.x) * (1 - Math.pow(0.94, dt * 60));
  if (game.mode === 'race') cam.x = Math.min(cam.x, game.finish);
}

// The race bar (#RaceProgressBar): where each of them is, 0 at the start, 1 at the finish.
export function progress(game) {
  const at = (x) => clamp(x / game.finish, 0, 1);
  return { player: at(game.player.x), opponent: at(game.opponent.x) };
}

// The encounter's rewards (crownfall_chapter2.vdata, flappy_skywrath_act2, HighScore style).
export const REWARDS = [[1000, 1], [5000, 2], [12000, 4]];
export const nextReward = (score) => REWARDS.find(([at]) => at > score) || null;
