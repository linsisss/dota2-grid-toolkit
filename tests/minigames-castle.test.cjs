const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const data = require('../assets/minigames/castle/data.json');
const logic = import('../src/minigames/games/castle/logic.mjs');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const ASSETS = path.join(__dirname, '../assets/minigames/castle/');
const W = 1640, H = 800;

async function setup() { const L = await logic; return { L, config: L.castleConfig(data) }; }
// The terrain mask of a level, from its picture (as the game reads it in the browser).
const terrains = new Map();
async function levelTerrain(L, config, name) {
  const file = config.levels[name].images.terrain;
  if (!terrains.has(file)) {
    const img = await loadImage(fs.readFileSync(ASSETS + file));
    const c = createCanvas(W, H), x = c.getContext('2d'); x.drawImage(img, 0, 0);
    terrains.set(file, L.terrainFromRGBA(x.getImageData(0, 0, W, H).data));
  }
  return terrains.get(file);
}
// A flat test world: ground up to y = `ground` everywhere.
function flat(L, ground = 100) {
  const rgba = new Uint8Array(W * H * 4);
  for (let row = H - ground; row < H; row++) for (let col = 0; col < W; col++) rgba[(row * W + col) * 4 + 3] = 255;
  return L.terrainFromRGBA(rgba);
}
// A level with only what a test puts in it: the player at x = 200 on a flat ground, given weapons.
function sandbox(L, config, { weapons = [['default', 5]], objects = [], ground = 100 } = {}) {
  const level = config.levels.__test = { ...config.levels.gatehouse, name: '__test', player: { object: 'player', x: 200, y: ground, facingLeft: false, reposition: true, orders: [] },
    objects: objects.map(([object, x, y, extra = {}]) => ({ object, x, y, facingLeft: null, reposition: true, orders: [], timeOffset: 0, ...extra })),
    weapons: weapons.map(([name, reloads]) => ({ name, reloads })) };
  const game = L.createGame(config, '__test', flat(L, ground));
  L.begin(game);
  assert.equal(level.name, '__test');
  return game;
}
const run = (L, config, game, seconds) => { const events = []; for (let t = 0; t < seconds - 1e-9; t += 1 / 60) events.push(...L.step(game, config, 1 / 60)); return events; };
function shoot(L, config, game, degrees, power, { weapon } = {}) {
  if (weapon !== undefined) L.selectWeapon(game, config, weapon);
  game.reload = 0;
  L.setAim(game, degrees * Math.PI / 180);
  L.press(game, config);
  game.charge = L.currentWeapon(game, config).maxSpeed * power;
  L.release(game, config);
}
const enemies = (game) => game.units.filter((u) => u.kind === 'enemy');

test('Valve data → config: physics, charge, fall damage, weapons, both modes', async () => {
  const { L, config } = await setup();
  assert.equal(config.gravity, 1200); assert.equal(config.drag, 0.003); assert.equal(config.windAccel, 50); assert.equal(config.chargeRate, 900);
  assert.equal(config.fallDamage, 0.002); assert.equal(config.fallMinVelocity, 50); assert.equal(config.fallMinAir, 0.3); assert.equal(config.climb, 3); assert.equal(config.minY, -300);
  assert.deepEqual(config.shotOffset, [70, 25]);
  assert.equal(config.maxShotSpeed, 1600, 'the power divisor: the greatest m_flMaxSpeed');
  assert.equal(L.TICK, 1 / 60);
  assert.equal(config.objects.player.fallDamagePerVelocity, 1); assert.equal(config.objects.ogre_med.fallDamagePerVelocity, 0);
  assert.equal(config.objects.explosive_barrel.fallDamagePerVelocity, 0);
  assert.equal(config.weapons.default.hitRadius, 8); assert.equal(config.weapons.tunneler.hitRadius, 1);
  const w = config.weapons;
  assert.deepEqual(Object.keys(w).sort(), ['bomblet', 'default', 'dropshot', 'grenade', 'mirv', 'plasma_beam', 'tunneler']);
  assert.equal(w.default.maxSpeed, 1600); assert.equal(w.default.damageRadius, 60); assert.equal(w.default.damage, 1); assert.equal(w.default.points, 100);
  assert.equal(w.grenade.fuse, 1.5); assert.equal(w.grenade.bounceDrag, 0.5); assert.equal(w.grenade.collides, false); assert.equal(w.grenade.damage, 2);
  assert.equal(w.tunneler.explodeTimes, 4); assert.deepEqual(w.tunneler.velocityMultOnExplode, [0.03, 0.4]); assert.equal(w.tunneler.damage, 0);
  assert.equal(w.mirv.maxReloads, 2); assert.equal(w.mirv.splitCount, 4); assert.equal(w.mirv.splitWeapon, 'bomblet');
  assert.equal(w.dropshot.listenForKeypress, true); assert.equal(w.plasma_beam.ray, true); assert.equal(w.plasma_beam.rayDigs, 10);
  assert.equal(w.grenade.action, 'grenade'); assert.equal(w.tunneler.action, 'attack_shotgun'); assert.equal(w.default.action, 'attack_cannon');
  assert.equal(config.modes.normal.length, 9); assert.equal(config.modes.hard.length, 9);
  assert.equal(config.modes.normal[0], 'gatehouse'); assert.equal(config.modes.hard[0], 'h_bridges');
  for (const name of [...config.modes.normal, ...config.modes.hard]) {
    const level = config.levels[name];
    for (const key of ['terrain', 'midground', 'foreground']) if (level.images[key]) assert.ok(fs.existsSync(ASSETS + level.images[key]), `${name} ${key}`);
    assert.equal(level.stars.length, 3);
  }
  assert.equal(config.levels.opposing_walls.images.terrain, 'images/levels/bunker/level.webp');
  assert.equal(config.levels.h_supper_time.images.terrain, 'images/levels/supper_time/h_level.webp');
});

test('score: level complete, the time bonus ramp and shots left; stars', async () => {
  const { L, config } = await setup();
  // client.dll: base 300, max 400, F 4 s, T 30 s after F: 400 → 390 at F → 300 at F + T and 300 for ever.
  const level = config.levels.gatehouse;
  assert.equal(L.timeBonus(level, 0), 400); assert.equal(L.timeBonus(level, 2), 395); assert.equal(L.timeBonus(level, 4), 390);
  assert.equal(L.timeBonus(level, 17), 351); assert.equal(L.timeBonus(level, 33.9), 300); assert.equal(L.timeBonus(level, 34), 300);
  assert.equal(L.timeBonus(level, 30.5), 310); assert.equal(L.timeBonus(level, 600), 300, 'never below the base');
  const result = L.levelScore(config, level, 3, [{ name: 'default', count: 6 }]);
  assert.deepEqual(result.rows.map((r) => r.points), [500, 392, 600]);
  assert.equal(result.total, 1492); assert.equal(result.stars, 3);
  assert.equal(L.levelScore(config, level, 40, [{ name: 'default', count: 2 }]).stars, 1);
  assert.equal(L.starsFor(level, 1100), 2);
});

test('terrain: carving circles, solid tests outside the picture, normals', async () => {
  const { L } = await setup();
  const t = flat(L, 100);
  assert.ok(L.solid(t, 500, 50)); assert.ok(!L.solid(t, 500, 150)); assert.ok(!L.solid(t, -1, 50)); assert.ok(!L.solid(t, 500, -1));
  const removed = L.carve(t, 500, 100, 60);
  assert.ok(removed > 5000 && removed < 6000, `half disc of r 60: ${removed}`);
  assert.ok(!L.solid(t, 500, 60)); assert.ok(L.solid(t, 500, 35)); assert.ok(L.solid(t, 570, 90));
  const [nx, ny] = L.normalAt(t, 800, 100);
  assert.ok(ny > 0.9 && Math.abs(nx) < 0.2);
});

test('every level of both modes: units stand on the ground and 30 s of patrols kill nobody', async () => {
  const { L, config } = await setup();
  for (const name of [...config.modes.normal, ...config.modes.hard]) {
    const game = L.createGame(config, name, await levelTerrain(L, config, name));
    const p = L.player(game);
    assert.ok(p.onGround, `${name}: Snapfire on the ground`);
    L.begin(game);
    const events = run(L, config, game, 30);
    assert.ok(!events.some((e) => e.type === 'death'), `${name}: nobody dies by itself`);
    assert.equal(game.phase, 'combat');
  }
});

test('Mortimer kisses: a charged shot flies further, explodes on the ground and carves 60 px', async () => {
  const { L, config } = await setup();
  const land = (power, drag = config.drag) => {
    const game = sandbox(L, config);
    shoot(L, config, game, 45, power);
    const events = [], c = { ...config, drag };
    for (let t = 0; t < 5; t += 1 / 60) events.push(...L.step(game, c, 1 / 60));
    return events.find((e) => e.type === 'explosion');
  };
  const near = land(0.4), far = land(0.75);
  assert.ok(near && far);
  assert.ok(far.x > near.x + 400, `${near.x} → ${far.x}`);
  assert.equal(far.carve, 60);
  assert.ok(Math.abs(far.y - 100) < 3);
  // client.dll: the drag is 0.003 per SECOND (×(1 − dt·0.003) a tick) — next to nothing.
  const vacuum = land(0.75, 0);
  assert.ok(vacuum.x >= far.x && vacuum.x < far.x + 12, `${far.x} vs ${vacuum.x} without drag`);
});

test('shot speed = max · min(max, charge) / 1600; one tick: move, then gravity and drag per second', async () => {
  const { L, config } = await setup();
  const w = config.weapons;
  const game = sandbox(L, config, { objects: [['ogre_med', 1500, 100]] });
  assert.equal(L.shotSpeed(config, w.default, 5000), 1600);
  assert.equal(L.shotSpeed(config, w.grenade, 5000), 1500 * 1500 / 1600);
  assert.equal(L.shotSpeed(config, w.grenade, 800), 1500 * 800 / 1600);
  assert.equal(L.shotPower(config, w.grenade, 5000), 1500 / 1600);
  L.setAim(game, 0);
  L.press(game, config);
  for (let i = 0; i < 60; i++) L.step(game, config, 1 / 60);
  assert.equal(game.charge, 900 * 1, 'the charge grows 900 a second');
  L.release(game, config);
  assert.ok(Math.abs(game.lastPower - 900 / 1600) < 1e-9);
  let shot = null, x0 = 0;
  for (let i = 0; i < 20 && !shot; i++) { L.step(game, config, 1 / 60); shot = game.shots[0]; }
  x0 = shot.x;
  const vx = shot.vx, vy = shot.vy;
  L.step(game, config, 1 / 60);
  assert.ok(Math.abs(shot.x - (x0 + vx / 60)) < 1e-6, 'moved with the old speed');
  assert.ok(Math.abs(shot.vx - vx * (1 - 0.003 / 60)) < 1e-9);
  assert.ok(Math.abs(shot.vy - (vy - 1200 / 60) * (1 - 0.003 / 60)) < 1e-9);
});

test('aim: elevation −15…85° from the facing side, W/S 28.75°/s, Shift ×0.1; the muzzle formula', async () => {
  const { L, config } = await setup();
  const game = sandbox(L, config), deg = Math.PI / 180;
  L.setAim(game, -60 * deg);
  assert.ok(Math.abs(game.aim + 15 * deg) < 1e-9, 'not below −15°');
  L.setAim(game, 89 * deg);
  assert.ok(Math.abs(game.aim - 85 * deg) < 1e-9, 'not above 85°');
  L.setAim(game, 0);
  L.turnAim(game, 'up', 1);
  assert.ok(Math.abs(game.aim - 28.75 * deg) < 1e-9);
  L.turnAim(game, 'down', 1, true);
  assert.ok(Math.abs(game.aim - 25.875 * deg) < 1e-9);
  L.turnAim(game, 'left', 0.1);
  assert.equal(L.player(game).facing, -1);
  assert.ok(Math.abs(game.aim - (180 - 25.875) * deg) < 1e-9, 'turned around with the same elevation');
  const p = L.player(game), [px, py] = L.cannonPivot(config, p), a = 25.875 * deg;
  const [mx, my] = L.muzzle(config, game);
  assert.ok(Math.abs(mx - (px - 70 * Math.cos(a) - 25 * Math.sin(a))) < 1e-9);
  assert.ok(Math.abs(my - (py + 70 * Math.sin(a) - 25 * Math.cos(a))) < 1e-9);
});

test('a direct hit kills an enemy; a shot at her own feet kills Snapfire (Вы погибли)', async () => {
  const { L, config } = await setup();
  const game = sandbox(L, config, { objects: [['ogre_med', 700, 100]] });
  const target = enemies(game)[0];
  let hit = false;
  for (let deg = 10; deg <= 80 && !hit; deg += 1) for (let p = 0.3; p <= 1.001 && !hit; p += 0.02) {
    const copy = structuredClone(game);
    shoot(L, config, copy, deg, p);
    run(L, config, copy, 4);
    if (enemies(copy)[0]?.dead || !copy.units.some((u) => u.id === target.id)) hit = true;
  }
  assert.ok(hit, 'some shot kills the ogre');
  // A shot never hits Snapfire directly — only its blast does.
  const self = sandbox(L, config, { objects: [['ogre_med', 1400, 100]] });
  shoot(L, config, self, 85, 0.3);
  const events = run(L, config, self, 4);
  assert.ok(events.some((e) => e.type === 'death' && e.kind === 'player'));
  assert.equal(self.phase, 'lost'); assert.equal(self.result.reason, 'death');
});

test('grenade: bounces off the ground, goes through units, explodes 1.5 s after its first touch', async () => {
  const { L, config } = await setup();
  const game = sandbox(L, config, { weapons: [['grenade', 3]], objects: [['skeleton_melee', 1400, 100]] });
  shoot(L, config, game, 30, 0.6);
  const events = [];
  let explodedAt = null, landedAt = null;
  for (let t = 0; t < 4; t += 1 / 60) {
    const now = L.step(game, config, 1 / 60);
    events.push(...now);
    if (landedAt === null && now.some((e) => e.type === 'bounce')) landedAt = game.time;
    if (explodedAt === null && now.some((e) => e.type === 'explosion')) explodedAt = game.time;
  }
  assert.ok(events.filter((e) => e.type === 'bounce').length > 1);
  assert.ok(landedAt < explodedAt);
  // The fuse burns from the first touch and fires on a touch of the ground (none in the air).
  assert.ok(explodedAt - landedAt >= 1.5 - 1e-9 && explodedAt - landedAt < 1.9, `fuse from the first touch: ${landedAt} → ${explodedAt}`);
  assert.ok(Math.abs(events.find((e) => e.type === 'explosion').y - 100) < 3, 'on the ground');
  assert.ok(!enemies(game)[0].dead, 'it flew through the skeleton');
  assert.equal(events.find((e) => e.type === 'explosion').carve, 80);
});

test('tunneler: four terrain-only explosions dig a shaft and hurt nobody', async () => {
  const { L, config } = await setup();
  const game = sandbox(L, config, { weapons: [['tunneler', 2]], ground: 400, objects: [['skeleton_melee', 900, 400]] });
  let best = null;
  for (let p = 0.3; p <= 1.001; p += 0.05) {
    const copy = structuredClone(game);
    shoot(L, config, copy, 45, p);
    const events = run(L, config, copy, 5).filter((e) => e.type === 'explosion');
    if (!best || Math.abs(events[0]?.x - 820) < Math.abs(best.events[0]?.x - 820)) best = { copy, events };
  }
  const { events } = best;
  assert.equal(events.length, 4);
  assert.ok(events.every((e) => e.kind === 'terrain' && e.carve === 65));
  assert.ok(events[0].y - events[3].y > 150, `depth ${events[0].y - events[3].y}`);
  assert.ok(Math.abs(events[0].x - events[3].x) < 40, 'straight down');
  assert.ok(best.copy.units.every((u) => !u.dead || u.cause === 'fall'), 'no blast damage');
});

test('MIRV: at the top of its arc it splits into 4 bomblets at ±250 and ±500', async () => {
  const { L, config } = await setup();
  const game = sandbox(L, config, { weapons: [['mirv', 5]] });
  assert.equal(game.ammo[0].count, 2, 'm_nMaxReloads caps the ammo');
  shoot(L, config, game, 60, 0.8);
  let split = null;
  for (let t = 0; t < 3 && !split; t += 1 / 60) { const ev = L.step(game, config, 1 / 60).find((e) => e.type === 'split'); if (ev) split = ev; }
  assert.ok(split);
  const bomblets = game.shots.filter((s) => s.weapon === 'bomblet');
  assert.equal(bomblets.length, 4);
  assert.deepEqual(bomblets.map((b) => Math.round(b.vx)), [250, -250, 500, -500]);
  const events = run(L, config, game, 4);
  assert.equal(events.filter((e) => e.type === 'explosion').length, 4);
});

test('Dropkick Missile: the fire key in flight drops it straight down; no second missile meanwhile', async () => {
  const { L, config } = await setup();
  const game = sandbox(L, config, { weapons: [['dropshot', 3]] });
  shoot(L, config, game, 45, 1);
  run(L, config, game, 0.6);
  assert.equal(L.canShoot(game, config), false, 'no shooting while it flies');
  const missile = game.shots[0];
  const x = missile.x;
  assert.equal(L.press(game, config), 'trigger');
  assert.equal(missile.vx, 0); assert.equal(missile.vy, 0);
  const events = run(L, config, game, 3);
  const boom = events.find((e) => e.type === 'explosion');
  assert.ok(Math.abs(boom.x - x) < 2, `${x} → ${boom.x}`);
  assert.equal(game.ammo[0].count, 2);
});

test('Plasma Tunneler (debug weapon): a straight ray that digs ten times', async () => {
  const { L, config } = await setup();
  const game = sandbox(L, config, { weapons: [['plasma_beam', 1]], ground: 300 });
  L.setAim(game, -0.2);
  assert.equal(L.press(game, config), 'fire', 'm_flLockedPower: no charging');
  const digs = run(L, config, game, 3).filter((e) => e.type === 'explosion' && e.kind === 'dig');
  assert.equal(digs.length, 10);
  assert.ok(digs.every((e) => e.carve === 20));
});

test('fall damage: only Snapfire takes it (speed·k·0.002 from 50 up); enemies die only out of the world', async () => {
  const { L, config } = await setup();
  assert.equal(L.fallDamage(config, { air: 0.5, vx: 0, vy: -500, fallDamagePerVelocity: 1 }), 1);
  assert.equal(L.fallDamage(config, { air: 0.5, vx: 0, vy: -49, fallDamagePerVelocity: 1 }), 0, '50 is a threshold');
  assert.ok(Math.abs(L.fallDamage(config, { air: 0.5, vx: 0, vy: -50, fallDamagePerVelocity: 1 }) - 0.1) < 1e-12, 'no −50');
  assert.equal(L.fallDamage(config, { air: 0.3, vx: 0, vy: -900, fallDamagePerVelocity: 1 }), 0, 'more than 0.3 s in the air');
  assert.equal(L.fallDamage(config, { air: 1, vx: 0, vy: -900, fallDamagePerVelocity: 0 }), 0);
  const game = sandbox(L, config, { objects: [['ogre_med', 800, 100], ['ogre_med', 1100, 100], ['ogre_med', 1400, 100]] });
  const [high, low, out] = enemies(game);
  high.y = 400; high.onGround = false;
  low.y = 140; low.onGround = false;
  out.x = 1700; out.onGround = false;
  run(L, config, game, 3);
  assert.equal(high.dead, false, 'an ogre survives any fall');
  assert.equal(low.dead, false);
  assert.equal(out.dead, true); assert.equal(out.cause, 'fall');
  const drop = sandbox(L, config, { objects: [['ogre_med', 1400, 100]] });
  const p = L.player(drop);
  p.y = 400; p.onGround = false;
  run(L, config, drop, 3);
  assert.equal(p.dead, true); assert.equal(p.cause, 'fall');
  const hop = sandbox(L, config, { objects: [['ogre_med', 1400, 100]] });
  L.player(hop).y = 180; L.player(hop).onGround = false;
  run(L, config, hop, 3);
  assert.equal(L.player(hop).dead, false, 'v ≈ 440 < 500: Snapfire (1 HP) survives');
});

test('an enemy stuck for 5 ticks skips to the end of its order', async () => {
  const { L, config } = await setup();
  const game = sandbox(L, config, { objects: [['skeleton_melee', 1000, 100, { orders: [{ duration: 10, move: 1 }, { duration: 10, move: -1 }] }]] });
  const unit = enemies(game)[0];
  // a wall right in front of it
  const rgba = game.terrain;
  for (let row = rgba.height - 300; row < rgba.height - 100; row++) for (let col = 1050; col < 1090; col++) rgba.mask[row * rgba.width + col] = 1;
  run(L, config, game, 1.5);
  assert.ok(unit.orderClock >= 10, `skipped the blocked order: clock ${unit.orderClock.toFixed(2)}`);
  run(L, config, game, 1);
  assert.ok(unit.x < 1000, 'walks back');
});

test('explosive barrel: killed, it swells for 0.3 s and blows up 200 px around', async () => {
  const { L, config } = await setup();
  const game = sandbox(L, config, { objects: [['explosive_barrel', 900, 100], ['skeleton_melee', 1050, 100], ['skeleton_melee', 1500, 100]] });
  const barrel = game.units.find((u) => u.kind === 'barrel');
  let killed = false;
  for (let deg = 10; deg <= 80 && !killed; deg += 1) for (let p = 0.3; p <= 1.001 && !killed; p += 0.02) {
    const copy = structuredClone(game);
    shoot(L, config, copy, deg, p);
    const events = run(L, config, copy, 5);
    const [nearId, farId] = enemies(game).map((u) => u.id), dead = (id) => events.some((e) => e.type === 'death' && e.id === id);
    if (events.some((e) => e.type === 'death' && e.kind === 'barrel') && events.some((e) => e.kind === 'barrel' && e.type === 'explosion')) {
      killed = true;
      const boom = events.find((e) => e.kind === 'barrel' && e.type === 'explosion');
      assert.equal(boom.radius, 200);
      assert.ok(dead(nearId), 'the skeleton 150 px away dies'); assert.ok(!dead(farId), 'the one 600 px away does not');
    }
  }
  assert.ok(killed);
  assert.equal(barrel.kind, 'barrel');
});

test('out of ammo: «Снаряды закончились» only when nothing can still kill an enemy', async () => {
  const { L, config } = await setup();
  const game = sandbox(L, config, { weapons: [['default', 1]], objects: [['ogre_med', 1400, 100]] });
  shoot(L, config, game, 20, 0.4);
  const events = run(L, config, game, 8);
  assert.ok(events.some((e) => e.type === 'sound' && e.name === 'crownfall.artillery.snapfire.out_of_ammo'));
  assert.equal(game.phase, 'lost'); assert.equal(game.result.reason, 'ammo');
  // A patrol that will walk the last enemy into a hole out of the world: the level waits for it and is won.
  const pit = sandbox(L, config, { weapons: [['default', 1]], objects: [['skeleton_melee', 1000, 100, { orders: [{ duration: 3, move: 0 }, { duration: 6, move: 1 }] }]] });
  L.carve(pit.terrain, 1300, 100, 90); L.carve(pit.terrain, 1300, 20, 90);
  for (let x = 1210; x <= 1390; x += 20) L.carve(pit.terrain, x, 0, 40);
  shoot(L, config, pit, 20, 0.4);
  run(L, config, pit, 12);
  assert.equal(pit.phase, 'won');
});

test('Level 1 «Враг у ворот» is won with three shots for three stars', async () => {
  const { L, config } = await setup();
  const game = L.createGame(config, 'gatehouse', await levelTerrain(L, config, 'gatehouse'));
  L.begin(game);
  // Found by a search over angles and powers (each shot fired as soon as the last one settled).
  for (const [deg, power] of [[27, 0.95], [63, 0.6], [69, 0.85]]) {
    shoot(L, config, game, deg, power);
    for (let i = 0; i < 300; i++) {
      L.step(game, config, 1 / 60);
      if (i > 30 && !game.shots.length && !game.pending && !game.blasts.length && !game.units.some((u) => (!u.onGround && !u.dead) || (u.dead && !u.gone && u.kind !== 'player'))) break;
    }
  }
  run(L, config, game, 10);
  assert.equal(game.phase, 'won');
  assert.equal(game.result.stars, 3);
  assert.equal(game.fired, 3);
});

// With client.dll's physics (drag per second, the fuse from the first touch, slides) the hard levels the
// old port needed a mid-air grenade for are still won — sequences found by a greedy search.
test('hard mode: «Горячая картошка», «Прыг-скок-бум» and «Промеж башен» are won for three stars', async () => {
  const { L, config } = await setup();
  const plans = {
    h_supper_time: [[69, 1], [69, 0.9], [72, 0.95], [63, 0.9]],
    h_bastion: [[0, 0.75], [-3, 0.75], [54, 0.9], [15, 0.6], [51, 1], [54, 1]],
    h_three_towers: [[54, 0.8], [60, 0.5], [51, 1], [51, 1], [6, 0.8]],
  };
  for (const [name, plan] of Object.entries(plans)) {
    const game = L.createGame(config, name, await levelTerrain(L, config, name));
    L.begin(game);
    for (const [deg, power] of plan) {
      shoot(L, config, game, deg, power);
      for (let i = 0; i < 360; i++) {
        L.step(game, config, 1 / 60);
        if (game.phase !== 'combat' || (i > 30 && !game.shots.length && !game.pending && !game.blasts.length && !game.units.some((u) => (!u.onGround && !u.dead) || (u.dead && !u.gone)))) break;
      }
    }
    run(L, config, game, 10);
    assert.equal(game.phase, 'won', name);
    assert.equal(game.result.stars, 3, name);
  }
});

test('progress: best stars and score are kept; hard mode and the level locks', async () => {
  const { L, config } = await setup();
  let progress = {};
  assert.equal(L.levelOpen(config, progress, 'normal', 0), true);
  assert.equal(L.levelOpen(config, progress, 'normal', 1), false);
  assert.equal(L.hardUnlocked(config, progress), false);
  progress = L.recordResult(progress, 'normal', 'gatehouse', { stars: 2, total: 1200 });
  progress = L.recordResult(progress, 'normal', 'gatehouse', { stars: 1, total: 900 });
  assert.deepEqual(progress.normal.gatehouse, { stars: 2, score: 1200 });
  assert.equal(L.levelOpen(config, progress, 'normal', 1), true);
  for (const name of config.modes.normal) progress = L.recordResult(progress, 'normal', name, { stars: name === 'bastion' ? 0 : 1, total: 600 });
  assert.equal(L.hardUnlocked(config, progress), false, 'a level without a star keeps hard mode locked');
  progress = L.recordResult(progress, 'normal', 'bastion', { stars: 1, total: 900 });
  assert.equal(L.hardUnlocked(config, progress), true);
  assert.equal(L.levelOpen(config, progress, 'hard', 0), true);
  const sum = L.totals(config, progress, 'normal');
  assert.equal(sum.available, 27); assert.equal(sum.stars, 10);
});

test('sounds: every one of Valve\'s 24 artillery events is in sounds.json and the logic uses only those', async () => {
  const sounds = require('../assets/minigames/castle/sounds.json');
  const names = Object.keys(sounds.events);
  assert.equal(names.length, 24);
  const source = fs.readFileSync(path.join(__dirname, '../src/minigames/games/castle/logic.mjs'), 'utf8') + fs.readFileSync(path.join(__dirname, '../src/minigames/games/castle/Castle.jsx'), 'utf8');
  const { config } = await setup();
  const used = new Set([...source.matchAll(/'(crownfall\.artillery\.[a-z_.]+)'/g)].map((m) => m[1]));
  for (const w of Object.values(config.weapons)) { if (w.fireSound) used.add(w.fireSound); if (w.swapSound) used.add(w.swapSound); }
  for (const o of Object.values(config.objects)) if (o.deathSound) used.add(o.deathSound);
  for (const name of used) assert.ok(names.includes(name), name);
  for (const name of names) assert.ok(used.has(name), `unused: ${name}`);
});
