const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../assets/minigames/zaug/data.json');
const map = require('../assets/minigames/zaug/data/shmup_act3_map.json');
const scene = require('../assets/minigames/zaug/scene/scene.json');
const logic = import('../src/minigames/games/zaug/logic.mjs');

const ticks = async (game, n) => { const { step } = await logic; const events = []; for (let i = 0; i < n; i++) events.push(...step(game)); return events; };
async function fresh(opts = {}) {
  const L = await logic;
  const config = L.zaugConfig(data, map);
  const game = L.createGame(config, { random: L.seeded(7), boss: scene.units.boss, ...opts });
  game.intro = 0;
  return { L, config, game };
}
// An empty field: no track, so a test places what it needs.
async function empty(opts) { const r = await fresh(opts); r.game.trackIndex = r.config.track.length; return r; }

test('Valve data → config: field, player, boss numbers', async () => {
  const { config } = await fresh();
  assert.equal(config.width, 1244); assert.equal(config.height, 700); assert.equal(config.bossTime, 101); assert.equal(config.comboBase, 100);
  const p = config.player;
  assert.equal(p.lives, 5); assert.equal(p.bonusLives, 5); assert.equal(p.maxSpeed, 420); assert.equal(p.accel, 130);
  assert.equal(p.shield, 50); assert.equal(p.heart, 10); assert.equal(p.fire.cooldown, 6); assert.equal(p.fire.speed, 1700);
  assert.equal(p.maxAbsorb, 48); assert.equal(p.specialCost, 6); assert.equal(p.specialDamage, 8); assert.equal(p.swapTicks, 15);
  assert.equal(config.enemies.enemy_boss.hp, 1000); assert.equal(config.enemies.enemy_basic.hp, 2); assert.equal(config.enemies.enemy_wisp.hp, 100);
  assert.equal(config.enemies.enemy_boss.patterns.length, 15);
  assert.equal(Object.keys(config.paths).length, 14);
  assert.equal(config.boss.parts.length, 11);
});

test('paths: Bézier nodes from the map, field coordinates, speed keyframes', async () => {
  const { L, config } = await fresh();
  const curve = config.paths.path_gentle_curve;
  const [x0, y0] = L.toField(...L.pathPoint(curve, 0));
  assert.ok(x0 > 1244 && y0 < 0, 'enters from beyond the top right corner');
  const [x1] = L.toField(...L.pathPoint(curve, curve.length));
  assert.ok(x1 < 0, 'leaves on the left');
  assert.ok(Math.abs(curve.length - 3540) < 40);
  // The familiar's swoop: 600 until 2 s, down to 100 at 3 s (where it shoots), 900 at 5 s.
  const swoop = config.pathDefs.path_swoop_familiar;
  assert.equal(L.pathSpeed(swoop, 1), 600); assert.equal(L.pathSpeed(swoop, 2.5), 350); assert.equal(L.pathSpeed(swoop, 3.5), 100); assert.equal(L.pathSpeed(swoop, 6), 900);
  assert.deepEqual(swoop.actions.map((a) => [a.type, a.t]), [['shoot', 3]]);
  // The ram bird stops, then charges at 2200.
  assert.equal(L.pathSpeed(config.pathDefs.path_linear_ram_bird, 2), 0); assert.equal(L.pathSpeed(config.pathDefs.path_linear_ram_bird, 3), 2200);
});

test('track0: the waves, the intermissions and the boss at Valve\'s times', async () => {
  const { L, config } = await fresh();
  const marks = L.trackMarks(config);
  assert.ok(Math.abs(marks.intermission1 - 30.6) < 1e-6); assert.ok(Math.abs(marks.intermission2 - 92.4) < 1e-6);
  assert.ok(Math.abs(marks.bossWarning - 112.9) < 1e-6); assert.ok(Math.abs(marks.boss - 120.9) < 1e-6);
  const spawns = config.track.filter((e) => config.events[e.event]?.spawns).flatMap((e) => config.events[e.event].spawns);
  assert.equal(spawns.length, 139);
  const kinds = new Set(spawns.map((s) => s.enemy));
  for (const k of ['enemy_basic', 'enemy_familiar', 'enemy_fei_lian', 'enemy_wisp', 'enemy_harpy', 'enemy_pterodactyl', 'enemy_bird', 'enemy_boss']) assert.ok(kinds.has(k), k);
  // The first wave: three basics 0.4 s apart, then three more mirrored and inverted.
  const first = config.track.filter((e) => e.event === 'event_gentle_curve_basic').slice(0, 6);
  assert.deepEqual(first.map((e) => +e.t.toFixed(2)), [1, 1.4, 1.8, 2.5, 2.9, 3.3]);
  assert.deepEqual(first.map((e) => e.flip), [false, false, false, true, true, true]);
});

test('movement (client.dll): 420 at once (m_flAccel is not read), held 45 inside the field', async () => {
  const { game } = await empty();
  game.input.right = true;
  await ticks(game, 1); assert.equal(game.player.vx, 420);
  await ticks(game, 400); assert.equal(game.player.x, 1244 - 45);
  game.input.right = false; game.input.up = true; await ticks(game, 200);
  assert.equal(game.player.y, 45);
});

test('the main attack: two bolts every 7 ticks at 1700; a swap locks for 15 ticks and sets the cooldown to 15 + 6', async () => {
  const { L, game } = await empty();
  game.input.fire = true;
  const ev = await ticks(game, 15);
  assert.equal(ev.filter((e) => e.type === 'shoot').length, 3, 'ticks 1, 8, 15');
  assert.equal(game.shots.length, 6);
  assert.equal(game.shots[0].vx, 1700); assert.equal(Math.abs(game.shots[0].y - game.shots[1].y), 30);
  game.player.cooldown = 0;
  assert.deepEqual(L.swapColor(game), [{ type: 'swap', red: false }]);
  assert.deepEqual(L.swapColor(game), [], 'no second swap while swapping');
  assert.equal(game.player.cooldown, 21);
  const after = await ticks(game, 21); assert.equal(after.filter((e) => e.type === 'shoot').length, 0);
  assert.equal(L.swapColor(game).length, 1);
});

test('shield: bullets of her colour are absorbed (48 max, a charge per 6), the other colour kills at the heart', async () => {
  const { L, game } = await empty();
  const p = game.player;
  const shoot = (red, dx, dy) => game.bullets.push({ x: p.x + dx, y: p.y + dy, vx: 0, vy: 0, r: 10, red, age: 0 });
  shoot(true, 45, 0);
  let ev = await ticks(game, 1);
  assert.equal(p.absorb, 1); assert.ok(ev.some((e) => e.type === 'absorb'));
  for (let i = 0; i < 60; i++) shoot(true, 30, 0);
  ev = await ticks(game, 1);
  assert.equal(p.absorb, 48); assert.equal(L.charges(game), 8); assert.ok(ev.some((e) => e.type === 'chargeMax'));
  // Blue at the shield's edge passes; at the heart it kills.
  shoot(false, 45, 0); await ticks(game, 1);
  assert.ok(p.alive); assert.equal(game.bullets.length, 1);
  game.bullets = []; const lives = p.lives;
  shoot(false, 12, 0); ev = await ticks(game, 1);
  assert.ok(!p.alive); assert.equal(p.lives, lives - 1); assert.ok(ev.some((e) => e.type === 'playerKilled'));
  // knocked off to the left (≥ 1 s, until x < −50), 0.5 s away, then back with 3 s of invulnerability
  ev = await ticks(game, 80);
  assert.ok(!p.alive);
  ev = await ticks(game, 40);
  assert.ok(p.alive && p.state === 'respawning' && p.invulnerable > 2); assert.ok(ev.some((e) => e.type === 'respawn'));
  assert.deepEqual([p.x, p.y], [0.2 * 1244, 350]);
  // a bullet of the other colour at the heart just goes out while she respawns
  shoot(false, 0, 0); await ticks(game, 1);
  assert.ok(p.alive); assert.equal(game.bullets.length, 0);
  await ticks(game, 185);
  assert.equal(p.state, 'alive'); assert.equal(p.invulnerable, 0);
});

test('lives: 5 (+5 the first time), the current one included; the fifth hit is game over', async () => {
  const { L, game } = await empty({ bonus: true });
  assert.equal(game.player.lives, 10); assert.equal(L.reserveLives(game), 9);
  const g2 = (await empty()).game;
  assert.equal(g2.player.lives, 5);
  g2.player.lives = 1;
  g2.bullets.push({ x: g2.player.x, y: g2.player.y, vx: 0, vy: 0, r: 10, red: false, age: 0 });
  const ev = await ticks(g2, 1);
  assert.equal(g2.phase, 'over'); assert.deepEqual(g2.result, { victory: false, reason: 'lives' }); assert.ok(ev.some((e) => e.type === 'gameOver'));
});

test('damage: double against the other colour; kills score m_nKillScore, damage scores 1 a point', async () => {
  const { L, config, game } = await empty();
  const spawn = (kind, red) => {
    const e = { id: game.nextId++, kind, def: config.enemies[kind], red, hp: config.enemies[kind].hp, x: 600, y: 400, alive: true, flash: 0, free: true, life: 99, vx: 0, vy: 0, dir: -1 };
    e.minion = false; game.enemies.push(e); return e;
  };
  const harpy = spawn('enemy_harpy', false);   // 8 HP, blue
  game.player.red = true;
  const hit = () => { const [hx, hy] = L.hitboxOf(harpy); game.shots.push({ x: hx - 5, y: hy, vx: 0, vy: 0, r: 8, red: true, damage: 1, special: false, age: 0 }); };
  hit(); await ticks(game, 1); assert.equal(harpy.hp, 6);
  game.player.red = false; game.shots.push({ x: L.hitboxOf(harpy)[0], y: L.hitboxOf(harpy)[1], vx: 0, vy: 0, r: 8, red: false, damage: 1, special: false, age: 0 });
  await ticks(game, 1); assert.equal(harpy.hp, 5);
  for (let i = 0; i < 3; i++) { hit(); await ticks(game, 1); }
  assert.ok(!harpy.alive || harpy.hp <= 0);
  // the Damage category takes every hit whole (2 + 1 + 3 × 2), not cut to the health left
  assert.equal(game.score.EnemyKill, 8000); assert.equal(game.score.Damage, 9);
  // killed while Shen had its colour (blue), the harpy answers with clamp(8 div 2, 3, 6) = 4 bullets at her
  await ticks(game, 1);
  assert.equal(game.bullets.filter((b) => !b.red && b.r === 7).length, 4);
});

test('combo: three of a colour raise it (100 × 2^(n−1), MAX at 10); another colour mid-set breaks it', async () => {
  const { L, config, game } = await empty();
  assert.equal(L.comboScore(config, 1), 100); assert.equal(L.comboScore(config, 6), 3200); assert.equal(L.comboScore(config, 10), 51200); assert.equal(L.comboScore(config, 14), 51200);
  const kill = (red) => L.chainKill(game, red);
  kill(true); kill(true); let ev = kill(true);
  assert.equal(game.combo, 1); assert.deepEqual(ev.map((e) => e.type), ['combo']); assert.equal(game.score.Combo, 100);
  kill(false); kill(false); kill(false);
  assert.equal(game.combo, 2); assert.equal(game.score.Combo, 300);
  kill(true); ev = kill(false);
  assert.equal(game.combo, 0); assert.ok(ev.some((e) => e.type === 'comboBreak'));
  assert.equal(game.maxCombo, 2);
  for (let i = 0; i < 36; i++) kill(true);
  assert.equal(game.combo, 12); assert.equal(game.maxCombo, 12);
});

test('special attack: n = absorbed div 6 shots, one every 2 ticks, a fan up and down, 8 damage', async () => {
  const { L, game } = await empty();
  game.player.absorb = 20;
  assert.deepEqual(L.special(game), [{ type: 'special', count: 3 }]);
  assert.equal(game.player.absorb, 2, 'the cost is taken at once, the rest stays');
  const ev = await ticks(game, 6);
  assert.equal(ev.filter((e) => e.type === 'specialShot').length, 3);
  assert.ok(game.shots.every((s) => s.special && s.damage === 8 && s.r <= 15));
  // shot 0 leaves at 0.4π mirrored upwards, shot 1 at 0.4π downwards
  const [s0, s1] = game.shots;
  assert.ok(s0.vy < 0 && s1.vy > 0);
  assert.deepEqual(L.special(game), [], 'not enough left');
});

test('bullet patterns: Fei Lian\'s five fans, the wisp\'s three rings when it bursts', async () => {
  const { config, game } = await fresh();
  const fei = config.enemies.enemy_fei_lian;
  assert.equal(fei.patterns.length, 5); assert.ok(fei.patterns.every((p) => p.pattern === 'even' && p.count === 30 && p.perWave === 30));
  // Play until the first Fei Lian has fired (its path shoots at 3 s), with Shen out of harm.
  game.godMode = true;
  let fired = 0;
  for (let i = 0; i < 60 * 75 && !fired; i++) { const { step } = await logic; const ev = step(game); fired = ev.filter((e) => e.type === 'enemyShoot' && e.kind === 'enemy_fei_lian').length; }
  assert.equal(fired, 5, 'one Shoot event per pattern');
  // client.dll: one bullet per m_flInterval (0.1 s) — five streams of 30 over 3 s, not five volleys
  const before = game.bullets.length;
  await ticks(game, 60);
  assert.ok(game.bullets.length - before >= 45 && game.bullets.length - before <= 60, `${game.bullets.length - before} more in 1 s`);
  const wisp = config.enemies.enemy_wisp;
  assert.deepEqual(wisp.selfDestroy.map((p) => [p.pattern, p.count]), [['radial', 60], ['radial', 45], ['radial', 30]]);
});

test('the boss: 101 s; out of time — after the current attack Zaug flees for 5 s (still vulnerable), then the game is over', async () => {
  const { L, game } = await fresh();
  game.godMode = true;
  await ticks(game, Math.round(121 * 60));
  assert.ok(game.boss, 'Zaug came'); assert.ok(Math.abs(game.boss.timeLeft - 101) < 0.2);
  let fled = null;
  for (let i = 0; i < 60 * 115 && game.phase === 'running'; i++) { L.step(game); if (game.boss.state === 'flee' && fled == null) { fled = game.tick; assert.equal(game.boss.invulnerable, false); } }
  assert.ok(fled && game.tick - fled >= 299, 'five seconds of fleeing');
  assert.equal(game.phase, 'over'); assert.deepEqual(game.result, { victory: false, reason: 'time' });
});

test('Zaug\'s queue (client.dll): intro, then wings, laser; Cold Embrace once below 50 %, no healing; phase 2 splinters / blanket', async () => {
  const { L, config, game } = await empty();
  game.godMode = true;
  const states = [], ev = [];
  // bring Zaug in directly
  game.config.track.push({ t: game.time + 0.01, event: 'event_boss', offset: [0, 0, 0], flip: false, invert: false });
  game.trackIndex = config.track.length - 1;
  for (let i = 0; i < 60 * 14; i++) { const e = L.step(game); ev.push(...e); for (const x of e) if (x.type === 'bossState') states.push(x.state); }
  config.track.pop();
  assert.deepEqual(states.slice(0, 9), ['intro', 'idle', 'wingTell', 'wing', 'wing', 'swap', 'idle', 'charge', 'laser4']);
  assert.ok(ev.some((e) => e.type === 'spawn' && e.kind === 'enemy_minion_dragon'), 'two minions at the wing tell');
  const b = game.boss;
  assert.equal(b.red, true, 'ice at first, one swap before the laser');
  // the laser aims at (0, 350): its bullets' mean direction from the head points there
  // Cold Embrace below 50 %: invulnerable, no healing, the minions leave
  b.hp = 499;
  const seen = [];
  let left = null;
  for (let i = 0; i < 60 * 12; i++) {
    for (const x of L.step(game)) if (x.type === 'bossState') seen.push(x.state);
    if (b.state === 'embrace') { assert.equal(b.invulnerable, true); assert.equal(b.hp, 499); if (left == null) left = game.enemies.filter((e) => e.minion).every((e) => e.leaving); }
  }
  const at = seen.indexOf('embrace');
  assert.ok(at >= 0);
  assert.deepEqual(seen.slice(at, at + 5), ['embrace', 'idle', 'splinterTell', 'splinter', 'idle']);
  assert.equal(b.phase, 2);
  assert.equal(left, true, 'the minions fly off at Cold Embrace');
});

test('bullet patterns (client.dll): width ×π, one sine half-wave, stagger on even waves, radial starts to the left', async () => {
  const { L, config } = await fresh();
  const laser = config.enemies.enemy_boss.patterns[1];
  // even: the first and last bullet of a wave at aim ∓ 0.36π
  assert.ok(Math.abs(L.patternAngle(laser, 0, 0) - (-0.36 * Math.PI + laser.stagger)) < 1e-9);
  assert.ok(Math.abs(L.patternAngle(laser, 5, 0) - (0.36 * Math.PI + laser.stagger + 5 * laser.offsetPer)) < 1e-9);
  const radial = config.enemies.enemy_boss.patterns[5];
  assert.ok(Math.abs(Math.abs(L.patternAngle(radial, 0, 0)) - Math.PI) < 1e-9, 'bullet 0 to the left');
  const sine = config.enemies.enemy_boss.patterns[9]; // 210 bullets, 7 a wave → 30 waves: sin(wave·π/30)·0.4
  const a = (i) => L.patternAngle(sine, i, 0);
  assert.ok(Math.abs(a(15 * 7) - a(0) - (0.4 * Math.sin(Math.PI / 2) + 15 * 7 * sine.offsetPer)) < 1e-9);
});

test('hit regions: 0 full, 1–2 half (at least 1), 3+ nothing', async () => {
  const { L } = await fresh();
  assert.deepEqual([[2, 0], [2, 1], [1, 2], [8, 1], [5, 3]].map(([d, r]) => L.regionDamage(d, r)), [2, 1, 1, 4, 0]);
});

test('the combo counts only before Zaug comes; respawning resets it silently', async () => {
  const { L, game } = await empty();
  L.chainKill(game, true); L.chainKill(game, true); L.chainKill(game, true); L.chainKill(game, true);
  assert.equal(game.combo, 1); assert.equal(game.chain.count, 1);
  game.bullets.push({ x: game.player.x, y: game.player.y, vx: 0, vy: 0, r: 10, red: !game.player.red, age: 0 });
  const ev = await ticks(game, 130);
  assert.equal(game.combo, 0); assert.equal(game.chain.count, 0);
  assert.ok(!ev.some((e) => e.type === 'comboBreak'));
});

test('a whole run: a pilot that matches colours and aims at the head beats Zaug; the results add up', async () => {
  const { L, game } = await fresh({ bonus: true });
  let guard = 0;
  while (game.phase === 'running' && guard++ < 60 * 400) {
    const p = game.player;
    const tgt = game.enemies.filter((e) => e.x < 1244 && e.x > p.x).sort((a, b) => a.x - b.x)[0];
    const head = game.boss && L.bossPartCircles(game).find((c) => c.multiplier === 2);
    const ty = tgt ? L.hitboxOf(tgt)[1] : head ? head.y : 350;
    game.input.up = p.y > ty + 8; game.input.down = p.y < ty - 8; game.input.fire = true;
    game.input.left = p.x > 220; game.input.right = p.x < 180;
    game.godMode = true;
    const near = game.bullets.filter((b) => Math.hypot(b.x - p.x, b.y - p.y) < 140).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (near && near.red !== p.red) L.swapColor(game);
    if (L.charges(game) >= 8) L.special(game);
    L.step(game);
  }
  assert.equal(game.phase, 'victory');
  const r = game.result;
  assert.equal(r.victory, true);
  assert.equal(game.score.BossKill, 500000);
  assert.equal(game.score.RemainingLives, Math.max(0, game.player.lives - game.player.bonusLives) * L.LIFE_SCORE);
  assert.equal(L.LIFE_SCORE, 40000);
  assert.ok(game.score.RemainingTime >= 0 && game.score.RemainingTime % 1000 === 0);
  assert.equal(r.total, L.CATEGORIES.reduce((s, k) => s + game.score[k], 0));
  assert.ok(Number.isInteger(r.total));
  assert.ok(game.kills > 100 && r.maxCombo >= 5);
  assert.ok(r.scores.every(([, v]) => v > 0), 'empty categories are not listed');
  assert.equal(r.rating, L.ratingOf(r.total, game.kills));
});

test('ratings: thresholds and the Assassin', async () => {
  const { L } = await fresh();
  // client.dll 0x184db50d0: F < 500 000 ≤ C < 1 500 000 ≤ B < 2 000 000 ≤ A < 2 500 000 ≤ S < 2 650 000 ≤ S+ < 2 800 000 ≤ S++ < 3 000 000 ≤ S+++ < 3 200 000 ≤ S++++
  assert.deepEqual([499999, 500000, 1500000, 2000000, 2500000, 2650000, 2800000, 3000000, 3200000].map((t) => L.ratingOf(t, 10)), ['F', 'C', 'B', 'A', 'S', 'SP', 'SPP', 'SPPP', 'SPPPP']);
  assert.equal(L.ratingOf(900000, 0), 'Assassin');
});

test('scene.json: every unit drawn, the boss\'s attachments per frame, two backdrops', () => {
  for (const u of ['shen', 'boss', 'enemy_basic', 'enemy_familiar', 'enemy_fei_lian', 'enemy_wisp', 'enemy_harpy', 'enemy_pterodactyl', 'enemy_bird', 'enemy_minion_dragon', 'enemy_splinter_blast']) assert.ok(scene.units[u], u);
  const boss = scene.units.boss;
  assert.equal(boss.parts.idle.length, boss.clips.idle.frames);
  assert.equal(Object.keys(boss.parts.idle[0]).length, 11);
  for (const skin of ['mellow', 'harsh']) assert.ok(scene.backdrops[skin].layers.length >= 4, skin);
});

test('sounds: every crownfall.shmup event exists in sounds.json', async () => {
  const sounds = require('../assets/minigames/zaug/sounds.json');
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/minigames/games/zaug/Zaug.jsx'), 'utf8');
  for (const name of Object.keys(sounds.events)) assert.ok(src.includes(`'${name}'`), name);
});
