const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../assets/minigames/spoon/data.json');
const logic = import('../src/minigames/games/spoon/logic.mjs');

// A repeatable random source (mulberry32).
function seeded(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const W = 19;
const cell = (c, r) => r * W + c;

// A stage in play on an open board: only the pillars, no enemies, nothing hidden, no bombers, the hero at (0, 0).
async function open(stage = 1, seed = 1) {
  const { createGame, spoonConfig, newGame, startStage, FLOOR, SOFT, LOCK } = await logic;
  const game = createGame(spoonConfig(data.defines), seeded(seed));
  newGame(game);
  if (stage !== 1) startStage(game, stage);
  game.grid = game.grid.map((c) => (c === SOFT || c === LOCK ? FLOOR : c));
  game.locks.clear(); game.items.clear();
  game.enemies = []; game.enemyCount = 0; game.hidden.clear(); game.wave = null;
  game.exit = null;
  game.phase = 'play'; game.phaseTime = 0;
  return game;
}
const run = async (game, seconds, input = {}) => { const { step } = await logic; const events = []; for (let t = 0; t < seconds - 1e-9; t += 1 / 60) events.push(...step(game, 1 / 60, input)); return events; };
const types = (events) => events.map((e) => e.type);
const enemy = (extra) => ({ id: 99, kind: 'creep', charger: false, bombs: false, kick: false, elite: false, fromExit: false, x: 0, y: 0, tx: 0, ty: 0, dir: 'left', state: 'walk', t: 0, anim: 0, cooldown: 0, invulnerable: 0, ...extra, tx: extra.tx ?? extra.x, ty: extra.ty ?? extra.y });
const bomb = (extra) => ({ id: 900 + Math.floor(Math.random() * 1000), owner: 'player', kind: 'normal', fuse: 3, size: 2, passable: false, slide: null, t: 0, ...extra, x: extra.c, y: extra.r });

test('Valve data → config: bomb 3 s, blast 0.45 s, kick 5, walk 2.5 + 0.75 per level, safe 4 s / 6 s', async () => {
  const { spoonConfig } = await logic;
  const config = spoonConfig(data.defines);
  assert.equal(config.cols, 19); assert.equal(config.rows, 11);
  assert.equal(config.bombDuration, 3); assert.equal(config.explosionDuration, 0.45); assert.equal(config.kickSpeed, 5);
  assert.equal(config.walkSpeedBase, 2.5); assert.equal(config.walkSpeedIncrement, 0.75); assert.equal(config.maxStep, 0.495);
  assert.equal(config.deathDuration, 3); assert.equal(config.exitDuration, 2);
  assert.deepEqual([config.lives, config.invulnerable, config.respawnInvulnerable, config.opening + config.countIn, config.overDuration], [2, 4, 6, 4, 3]);
  assert.deepEqual([config.maxBombs, config.maxSize, config.maxSpeed], [9, 9, 9]);
  assert.deepEqual(config.enemy, { walk: 1.5, charge: 4.5, pause: 0.25, bonk: 1, dashChance: 20, bombCooldown: 3.25, exitCooldown: 2, exitInvulnerable: 1 });
  assert.deepEqual(config.dropper, { speed: 7, leaveSpeed: 9, hover: 0.25, gap: 0.25, range: 2 });
  assert.equal(config.sfx.explosion, 'Techiemen.Explosion'); assert.equal(config.sfx.unlock, 'Techiemen.Unlock');
});

test('the clock: 3:00 up to stage 7, then max(1:30, 3:00 − 20 s · floor((stage − 1) / 6))', async () => {
  const { stageTime } = await logic;
  const stages = [1, 7, 8, 12, 13, 18, 19, 24, 25, 30, 31, 42];
  assert.deepEqual(stages.map(stageTime), [180, 180, 160, 160, 140, 140, 120, 120, 100, 100, 90, 90]);
});

test('stage kinds: vault every 3rd (3 locks, then 6), fixed map every 9th, rush every 7th, bomber waves', async () => {
  const { tileset, isVault, lockCount, isRush, isFixedMap, hasDroppers, dropperWave } = await logic;
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(tileset), [0, 1, 2, 0, 1, 2]);
  assert.ok(isVault(3) && isVault(6) && isVault(9) && !isVault(4));
  assert.deepEqual([3, 6, 9, 12].map(lockCount), [3, 6, 6, 6]);
  assert.ok(isFixedMap(9) && isFixedMap(18) && !isFixedMap(3) && !isFixedMap(6));
  assert.ok(isRush(7) && isRush(14) && !isRush(8));
  assert.deepEqual([1, 2, 3, 4, 7, 8, 14].map(hasDroppers), [false, false, true, true, false, true, false]);
  assert.deepEqual(dropperWave(3), { count: 3, interval: 8, start: 3 });
  assert.deepEqual(dropperWave(4), { count: 5, interval: 5, start: 0 });
  assert.equal(dropperWave(2), null); assert.equal(dropperWave(7), null);
});

test('the roster per stage (FUN_1830037c0)', async () => {
  const { stageEnemies, stageRoster } = await logic;
  assert.deepEqual(stageEnemies(1), { creep: 3, charger: 0, elite: 0, bombers: 0 });
  assert.deepEqual(stageEnemies(2), { creep: 1, charger: 3, elite: 0, bombers: 1 });
  assert.deepEqual(stageEnemies(3), { creep: 3, charger: 3, elite: 0, bombers: 3 });
  assert.deepEqual(stageEnemies(4), { creep: 0, charger: 5, elite: 1, bombers: 1 });
  assert.deepEqual(stageEnemies(5), { creep: 3, charger: 2, elite: 1, bombers: 4 });
  assert.deepEqual(stageEnemies(6), { creep: 0, charger: 5, elite: 1, bombers: 1 });
  assert.deepEqual(stageEnemies(7), { creep: 0, charger: 0, elite: 10, bombers: 5 });
  assert.deepEqual(stageEnemies(9), { creep: 3, charger: 2, elite: 1, bombers: 4 });
  // Stage 1 creeps drop no bombs; the gold one of group B drops bombs and kicks.
  assert.ok(stageRoster(1).every((e) => !e.bombs && !e.charger));
  const four = stageRoster(4, 2);
  assert.deepEqual(four.map((e) => e.elite), [false, false, false, false, false, true]);
  assert.ok(four[5].bombs && four[5].kick && four[5].charger);
  // Rush: group A gold chargers kick but drop no bombs; group B gold ones do both.
  const rush = stageRoster(7);
  assert.ok(rush.slice(0, 5).every((e) => e.elite && e.kick && !e.bombs && e.charger));
  assert.ok(rush.slice(5).every((e) => e.elite && e.kick && e.bombs && e.charger));
});

test('a stage: 19×11, pillars on odd cells, blocks with x + y ≥ 2 at 0.25 on every stage, forced blocks at (2,0) and (0,2)', async () => {
  const { createGame, spoonConfig, newGame, startStage, HARD, SOFT, FLOOR } = await logic;
  for (const stage of [1, 2, 4, 5, 13, 22]) {
    let soft = 0, eligible = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const game = createGame(spoonConfig(data.defines), seeded(seed * 31 + stage));
      newGame(game); if (stage !== 1) startStage(game, stage);
      assert.equal(game.grid.length, 19 * 11);
      for (let r = 0; r < 11; r++) for (let c = 0; c < 19; c++) {
        const v = game.grid[cell(c, r)];
        if (r % 2 && c % 2) { assert.equal(v, HARD); continue; }
        if (c + r < 2) assert.equal(v, FLOOR, `(${c},${r}) stays clear`);
        else if ((c === 2 && r === 0) || (c === 0 && r === 2)) assert.equal(v, SOFT, 'forced block');
        else { eligible++; if (v === SOFT) soft++; }
      }
    }
    const share = soft / eligible;
    assert.ok(share > 0.22 && share < 0.28, `stage ${stage}: ${share.toFixed(3)}`);
  }
});

test('the exit hides under any random block; each stage hides 1 exit + power-ups by the hero\'s state', async () => {
  const { createGame, spoonConfig, newGame, startStage, SOFT } = await logic;
  let near = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const game = createGame(spoonConfig(data.defines), seeded(seed));
    newGame(game);
    assert.equal(game.grid[cell(game.exit.c, game.exit.r)], SOFT);
    assert.equal(game.exit.revealed, false);
    if (game.exit.c + game.exit.r < 10) near++;
    // A fresh hero (1 bomb, speed 1): range and bomb under (2,0)/(0,2), a speed, 2 random ones.
    const forced = [game.hidden.get(cell(2, 0)).type, game.hidden.get(cell(0, 2)).type].sort();
    assert.deepEqual(forced, ['count', 'size']);
    const items = [...game.hidden.values()].filter((h) => h.type !== 'exit');
    assert.equal(items.length, 2 + 1 + 2);
    assert.ok(items.some((h) => h.type === 'speed'));
    for (const [i] of game.hidden) assert.equal(game.grid[i], SOFT);
    // A stronger hero: no forced pair, no forced speed; 3 different picks, never a special he has.
    Object.assign(game.player, { bombs: 3, speed: 2, kick: true });
    startStage(game, 2);
    const later = [...game.hidden.values()].filter((h) => h.type !== 'exit').map((h) => h.type);
    assert.equal(later.length, 3);
    assert.equal(new Set(later).size, 3);
    assert.ok(!later.includes('kick'));
  }
  assert.ok(near > 0, 'the exit can be near the start');
});

test('the vault: exit at (9,0) behind red, green, blue locks with pillars either side; 6 locks and extra pillars from stage 6', async () => {
  const { createGame, spoonConfig, newGame, startStage, LOCK, SOFT, HARD, FLOOR } = await logic;
  const game = createGame(spoonConfig(data.defines), seeded(3));
  newGame(game); startStage(game, 3);
  assert.deepEqual([1, 2, 3].map((r) => game.grid[cell(9, r)]), [LOCK, LOCK, LOCK]);
  assert.deepEqual([...game.locks.values()], ['red', 'green', 'blue']);
  for (let r = 0; r < 4; r++) for (const c of [7, 8, 10, 11]) assert.equal(game.grid[cell(c, r)], HARD);
  assert.deepEqual({ c: game.exit.c, r: game.exit.r, revealed: game.exit.revealed }, { c: 9, r: 0, revealed: true });
  const keys = [...game.hidden].filter(([, item]) => item.type === 'key');
  assert.deepEqual(keys.map(([, k]) => k.color).sort(), ['blue', 'green', 'red']);
  for (const [i] of keys) assert.equal(game.grid[i], SOFT);
  startStage(game, 6);
  assert.equal(game.locks.size, 6);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((r) => game.locks.get(cell(9, r))), ['red', 'green', 'blue', 'red', 'green', 'blue']);
  for (let r = 0; r < 7; r++) for (const c of [7, 8, 10, 11]) assert.equal(game.grid[cell(c, r)], HARD);
  assert.equal(game.grid[cell(8, 7)], HARD); assert.equal(game.grid[cell(10, 7)], HARD); assert.equal(game.grid[cell(9, 7)], FLOOR);
  assert.equal([...game.hidden.values()].filter((h) => h.type === 'key').length, 6);
});

test('every 9th stage is Valve\'s fixed map: no blocks, nothing hidden, keys lying open, speed while slow', async () => {
  const { createGame, spoonConfig, newGame, startStage, FIXED_MAP, HARD, LOCK, FLOOR, SOFT } = await logic;
  const game = createGame(spoonConfig(data.defines), seeded(9));
  newGame(game); startStage(game, 9);
  FIXED_MAP.forEach((line, r) => [...line].forEach((ch, c) => {
    const v = game.grid[cell(c, r)];
    assert.equal(v, ch === '#' ? HARD : 'RGB'.includes(ch) ? LOCK : FLOOR, `(${c},${r}) ${ch}`);
  }));
  assert.ok(!game.grid.includes(SOFT));
  assert.equal(game.hidden.size, 0);
  assert.deepEqual({ c: game.exit.c, r: game.exit.r, revealed: game.exit.revealed }, { c: 9, r: 0, revealed: true });
  assert.deepEqual([4, 5, 6].map((r) => game.items.get(cell(9, r)).color), ['blue', 'green', 'red']);
  assert.equal(game.items.get(cell(1, 0)).type, 'speed'); assert.equal(game.items.get(cell(0, 1)).type, 'speed');
  game.player.speed = 3; startStage(game, 18);
  assert.equal(game.items.get(cell(1, 0)).type, 'speed'); assert.equal(game.items.has(cell(0, 1)), false);
  game.player.speed = 4; startStage(game, 27);
  assert.equal(game.items.has(cell(1, 0)), false);
});

test('enemies spawn on bare floor outside the 3×3 round the hero, round the quarters starting top right', async () => {
  const { createGame, spoonConfig, newGame, startStage, stageRoster, FLOOR } = await logic;
  for (let seed = 1; seed <= 30; seed++) {
    const game = createGame(spoonConfig(data.defines), seeded(seed));
    newGame(game);
    for (const stage of [1, 2, 4, 7]) {
      if (stage !== 1) startStage(game, stage);
      assert.equal(game.enemies.length, stageRoster(stage).length);
      for (const e of game.enemies) { assert.equal(game.grid[cell(e.x, e.y)], FLOOR); assert.ok(e.x >= 2 || e.y >= 2); assert.notEqual(e.dir, undefined); }
      const [first, second, third, fourth] = game.enemies;
      assert.ok(first.x >= 9 && first.y < 5, 'top right'); assert.ok(second.x >= 9 && second.y >= 5, 'bottom right');
      assert.ok(third.x < 9 && third.y >= 5, 'bottom left');
      if (fourth) assert.ok(fourth.x < 9 && fourth.y < 5, 'top left');
    }
  }
});

test('count-in: keyhole, 3-2-1-«Старт!» after 4 s; then 4 s safe', async () => {
  const { createGame, spoonConfig, newGame } = await logic;
  const game = createGame(spoonConfig(data.defines), seeded(5));
  newGame(game);
  const events = await run(game, 4.05);
  assert.deepEqual(events.filter((e) => e.type === 'countIn').map((e) => e.n), [3, 2, 1, 0]);
  assert.equal(game.phase, 'play');
  assert.ok(game.player.invulnerable > 3.9);
});

test('moving: corridors only, round corners, no walking through pillars', async () => {
  const game = await open();
  await run(game, 1, { dir: 'right' });
  assert.ok(game.player.x > 2 && game.player.y === 0);
  assert.ok(Math.abs(game.player.x - 2.5) < 0.05, 'speed 1 walks 2.5 cells/s');
  game.player.x = 2; game.player.y = 0;
  await run(game, 1, { dir: 'down' });
  assert.equal(game.player.x, 2); assert.ok(game.player.y > 2);
  game.player.x = 1; game.player.y = 0;
  await run(game, 0.5, { dir: 'down' });
  assert.equal(game.player.y, 0);
  game.player.x = 2.3; game.player.y = 0;
  await run(game, 0.5, { dir: 'down' });
  assert.equal(game.player.x, 2); assert.ok(game.player.y > 0.5);
});

test('a bomb: once per cell, walked off but not back, 3 s, the first block breaks without burning', async () => {
  const { step, SOFT, FLOOR } = await logic;
  const game = await open();
  game.player.invulnerable = 99;
  game.grid[cell(2, 0)] = SOFT; game.grid[cell(3, 0)] = SOFT;
  game.player.size = 3;
  const dropped = step(game, 1 / 60, { bomb: true });
  assert.ok(types(dropped).includes('bomb'));
  assert.equal(game.bombs[0].size, 3);
  assert.ok(!types(step(game, 1 / 60, { bomb: true })).includes('bomb'), 'one bomb at a time');
  await run(game, 0.6, { dir: 'down' });
  assert.equal(game.bombs[0].passable, false);
  await run(game, 0.6, { dir: 'up' });
  assert.ok(game.player.y >= 0.999, 'cannot walk back onto the bomb');
  const events = await run(game, 1.9);
  assert.ok(types(events).includes('explode'));
  assert.equal(game.explosions[0].arms.right, 1, 'the block cell does not burn');
  await run(game, 0.6);
  assert.equal(game.grid[cell(2, 0)], FLOOR, 'the first block breaks');
  assert.equal(game.grid[cell(3, 0)], SOFT, 'the one behind it stays');
});

test('holding the bomb button drops the next bomb as soon as it can', async () => {
  const { step } = await logic;
  const game = await open();
  game.player.invulnerable = 99; game.player.bombs = 1;
  step(game, 1 / 60, { bomb: true, bombHeld: true });
  assert.equal(game.bombs.length, 1);
  await run(game, 0.5, { dir: 'right', bombHeld: true });
  assert.equal(game.bombs.length, 1, 'the only bomb is out');
  game.player.bombs = 2;
  step(game, 1 / 60, { bombHeld: true });
  assert.equal(game.bombs.length, 1, 'the retry waits for a failed press');
  step(game, 1 / 60, { bomb: true, bombHeld: true });
  assert.equal(game.bombs.length, 2);
});

test('spiky bombs reach 2·range + 1 cells and burn through breakable blocks', async () => {
  const { step, detonate, SOFT } = await logic;
  const game = await open();
  game.player.invulnerable = 99; game.player.spiky = true; game.player.size = 2;
  step(game, 1 / 60, { bomb: true });
  assert.deepEqual([game.bombs[0].kind, game.bombs[0].size], ['spiky', 5]);
  game.bombs = [];
  game.grid[cell(4, 0)] = SOFT; game.grid[cell(5, 0)] = SOFT;
  game.bombs.push(bomb({ kind: 'spiky', c: 3, r: 0, size: 3 }));
  const ex = detonate(game, game.bombs[0]);
  assert.equal(ex.arms.right, 3);
  assert.ok(game.breaking.has(cell(4, 0)) && game.breaking.has(cell(5, 0)));
});

test('fire goes on through bombs and sets them off', async () => {
  const { detonate } = await logic;
  const game = await open();
  game.bombs.push(bomb({ c: 4, r: 0, size: 4 }));
  game.bombs.push(bomb({ c: 6, r: 0, size: 1 }));
  const ex = detonate(game, game.bombs[0]);
  assert.equal(ex.arms.right, 4, 'past the second bomb');
  assert.equal(game.bombs.length, 0, 'the second bomb went off too');
  assert.equal(game.explosions.length, 2);
});

test('power-ups and keys in the fire fly to a random bare cell instead of burning; with nowhere to go a power-up burns, a key stays', async () => {
  const { detonate, HARD, FLOOR } = await logic;
  const game = await open();
  game.items.set(cell(4, 0), { type: 'count', t: 1 });
  game.items.set(cell(2, 0), { type: 'key', color: 'red', t: 1 });
  game.bombs.push(bomb({ c: 3, r: 0, size: 3 }));
  const ex = detonate(game, game.bombs[0]);
  assert.equal(ex.arms.right, 0); assert.equal(ex.arms.left, 0);
  assert.ok(!game.items.has(cell(4, 0)) && !game.items.has(cell(2, 0)));
  assert.equal(game.flyers.length, 2);
  for (const f of game.flyers) assert.equal(game.items.get(cell(f.c, f.r)).landing, true);
  await run(game, 0.55);
  assert.equal(game.flyers.length, 0);
  const landed = [...game.items.values()];
  assert.deepEqual(landed.map((i) => i.type).sort(), ['count', 'key']);
  assert.ok(landed.every((i) => !i.landing));
  // A full board: nothing bare left.
  const full = await open();
  full.grid = full.grid.map(() => HARD);
  for (const c of [2, 3, 4]) full.grid[cell(c, 0)] = FLOOR;
  full.items.set(cell(4, 0), { type: 'size', t: 1 });
  full.items.set(cell(2, 0), { type: 'key', color: 'blue', t: 1 });
  full.bombs.push(bomb({ c: 3, r: 0, size: 3 }));
  detonate(full, full.bombs[0]);
  assert.equal(full.items.get(cell(4, 0)).burning, 0);
  assert.equal(full.items.get(cell(2, 0)).burning, undefined);
});

test('fire on the open exit lets out a creep (once in 2 s, safe for 1 s, worth 10)', async () => {
  const { detonate, killEnemy } = await logic;
  const game = await open();
  game.player.invulnerable = 99;
  game.exit = { c: 5, r: 0, revealed: true, open: false, t: 0 };
  game.bombs.push(bomb({ c: 3, r: 0, size: 3 }));
  const ex = detonate(game, game.bombs[0]);
  assert.equal(ex.arms.right, 1, 'the exit stops the ray');
  assert.equal(game.enemies.length, 1);
  const creep = game.enemies[0];
  assert.deepEqual([creep.x, creep.y, creep.fromExit, creep.invulnerable, creep.kind], [5, 0, true, 1, 'creep']);
  game.bombs.push(bomb({ c: 3, r: 0, size: 3 }));
  detonate(game, game.bombs[0]);
  assert.equal(game.enemies.length, 1, 'cooldown 2 s');
  assert.equal(killEnemy(game, creep), 10);
});

test('score: 100 / 500 times a global multiplier ×1 → ×2 → ×4 held 0.45 s after the last kill', async () => {
  const { killEnemy } = await logic;
  const game = await open();
  const scores = [1, 2, 3, 4].map((n) => killEnemy(game, enemy({ x: n, y: 2 })));
  assert.deepEqual(scores, [100, 200, 400, 400]);
  assert.equal(killEnemy(game, enemy({ kind: 'elite', elite: true, x: 1, y: 2 })), 2000);
  await run(game, 0.4);
  assert.equal(killEnemy(game, enemy({ x: 1, y: 2 })), 400, 'still within 0.45 s');
  await run(game, 0.5);
  assert.equal(killEnemy(game, enemy({ kind: 'elite', elite: true, x: 1, y: 2 })), 500, 'back to ×1');
  assert.equal(killEnemy(game, enemy({ x: 1, y: 2 }), false), 0, 'removed without points');
});

test('any fire kills enemies and scores; the exit opens when the last one is gone', async () => {
  const game = await open();
  game.player.invulnerable = 99;
  game.exit = { c: 18, r: 10, revealed: true, open: false, t: 0 };
  game.enemies = [enemy({ x: 4, y: 0 })]; game.enemyCount = 1;
  game.bombs.push(bomb({ owner: 'dropper', kind: 'enemy', c: 3, r: 0, fuse: 0.01, size: 2 }));
  const events = await run(game, 0.2);
  assert.ok(types(events).includes('kill'));
  assert.equal(game.score, 100);
  assert.equal(game.exit.open, false, 'not before the death animation ends');
  const later = await run(game, 1.5);
  assert.ok(types(later).includes('exitOpen'));
  assert.equal(game.exit.open, true);
});

test('the exit: the clock is tallied 2 s for 10 points every 0.025 s from 0.5 s on, alongside the exit animation', async () => {
  const { nextStage } = await logic;
  const game = await open();
  game.exit = { c: 2, r: 0, revealed: true, open: true, t: 0 };
  game.timeLeft = 100.5;
  await run(game, 1.4, { dir: 'right' });
  assert.equal(game.phase, 'exiting');
  assert.ok(game.phaseTime < 2 && game.score > 0 && game.score < 500, 'tallying during the animation');
  await run(game, 4);
  assert.equal(game.phase, 'cleared');
  assert.equal(game.score, 500, "100 s left → 50 steps of 10");
  nextStage(game);
  assert.equal(game.stage, 2);
  assert.equal(game.timeLeft, 180);
});

test('no exit while any enemy is left, also in the vault', async () => {
  const game = await open(3);
  game.exit = { c: 9, r: 0, revealed: true, open: false, t: 0 };
  game.enemies = [enemy({ x: 18, y: 10, dir: 'up' })]; game.enemyCount = 1;
  game.player.invulnerable = 99; game.player.x = 9; game.player.y = 2;
  await run(game, 1, { dir: 'up' });
  assert.equal(game.phase, 'play');
  assert.equal(game.exit.open, false);
  game.enemies = [];
  await run(game, 0.1, { dir: 'up' });
  assert.equal(game.phase, 'exiting');
});

test('the last stage of the story ends the tally on exactly 5 000', async () => {
  const game = await open();
  game.storyStage = 1;
  game.score = 1230;
  game.exit = { c: 2, r: 0, revealed: true, open: true, t: 0 };
  game.timeLeft = 77.2;
  await run(game, 6, { dir: 'right' });
  assert.equal(game.phase, 'cleared');
  assert.equal(game.score, 5000);
});

test('death: power-ups fly to bare cells outside the 3×3, the hero gets up in place, 6 s safe and fast; then «Game Over»', async () => {
  const { killPlayer, walkSpeed } = await logic;
  const game = await open();
  game.player.x = 6; game.player.y = 4;
  Object.assign(game.player, { bombs: 4, size: 3, speed: 2, kick: true, key: 'red' });
  killPlayer(game, 'test');
  assert.equal(game.phase, 'dying');
  assert.deepEqual([game.player.bombs, game.player.size, game.player.speed, game.player.kick, game.player.key], [1, 1, 1, false, null]);
  assert.equal(game.flyers.length, 3 + 2 + 1 + 1 + 1);
  for (const f of game.flyers) { assert.ok(Math.abs(f.c - 6) >= 2 || Math.abs(f.r - 4) >= 2); assert.equal(f.duration, 0.5); }
  await run(game, 3.05);
  assert.equal(game.lives, 1); assert.equal(game.phase, 'play');
  assert.deepEqual([game.player.x, game.player.y], [6, 4], 'in the same place');
  assert.ok(game.player.invulnerable > 5.9);
  assert.equal(walkSpeed(game), 2.5 + 3 * 0.75, 'at least level 3 while safe');
  game.player.invulnerable = 0;
  assert.equal(walkSpeed(game), 2.5);
  const landed = [...game.items.values()];
  assert.equal(landed.length, 8);
  assert.ok(landed.every((i) => !i.landing));
  game.lives = 0;
  killPlayer(game, 'test');
  await run(game, 3.05);
  assert.equal(game.phase, 'over');
  await run(game, 3.05);
  assert.equal(game.phase, 'ended');
});

test('time out at limit + 0.1 s: the hero dies, enemies go without points, the clock is set to 1:00', async () => {
  const game = await open();
  game.timeLeft = 10.5; game.lastWhole = 11; game.player.invulnerable = 0;
  game.enemies = [enemy({ x: 18, y: 10, dir: 'up' }), enemy({ x: 18, y: 0, dir: 'down', elite: true, kind: 'elite' })];
  const events = await run(game, 10.55);
  assert.equal(events.filter((e) => e.type === 'tick').length, 10);
  assert.ok(!types(events).includes('timeUp'));
  const more = await run(game, 0.1);
  assert.ok(types(more).includes('timeUp'));
  assert.equal(game.player.state, 'dying');
  assert.ok(game.enemies.every((e) => e.state === 'dying'));
  assert.equal(game.score, 0);
  assert.ok(game.timeLeft > 59.8 && game.timeLeft <= 60);
});

test('picking up: no points, capped at 9, kick / spiky / remote replace each other and the old one flies off', async () => {
  const game = await open();
  for (const [c, type] of [[1, 'count'], [2, 'size'], [3, 'speed'], [4, 'spiky'], [5, 'remote']]) game.items.set(cell(c, 0), { type, t: 1 });
  game.player.invulnerable = 99;
  await run(game, 2.2, { dir: 'right' });
  const p = game.player;
  assert.deepEqual([p.bombs, p.size, p.speed, p.spiky, p.remote], [2, 2, 2, false, true]);
  assert.equal(game.score, 0);
  assert.ok(game.flyers.some((f) => f.type === 'spiky') || [...game.items.values()].some((i) => i.type === 'spiky'), 'spiky ejected');
  Object.assign(p, { bombs: 9, size: 9, speed: 9 });
  game.items.set(cell(Math.round(p.x) + 1, 0), { type: 'count', t: 1 });
  await run(game, 0.5, { dir: 'right' });
  assert.equal(p.bombs, 9);
});

test('losing the remote to another special sets off the remote bombs', async () => {
  const { step } = await logic;
  const game = await open();
  game.player.remote = true; game.player.invulnerable = 99; game.player.bombs = 2;
  step(game, 1 / 60, { bomb: true });
  assert.equal(game.bombs[0].kind, 'remote');
  game.items.set(cell(1, 0), { type: 'kick', t: 1 });
  const events = await run(game, 0.5, { dir: 'right' });
  assert.ok(types(events).includes('explode'));
  assert.equal(game.player.kick, true); assert.equal(game.player.remote, false);
});

test('remote bombs wait for Alt, which sets off all of them at once', async () => {
  const { step } = await logic;
  const game = await open();
  game.player.remote = true; game.player.invulnerable = 99; game.player.bombs = 3;
  step(game, 1 / 60, { bomb: true });
  game.player.x = 2; step(game, 1 / 60, { bomb: true });
  game.player.x = 4; step(game, 1 / 60, { bomb: true });
  assert.equal(game.bombs.length, 3);
  await run(game, 5);
  assert.equal(game.bombs.length, 3);
  const events = step(game, 1 / 60, { action: true });
  assert.equal(events.filter((e) => e.type === 'explode').length, 3);
});

test('the kick sends a bomb sliding until something stops it; Alt stops the last kicked bomb', async () => {
  const { step, HARD } = await logic;
  const game = await open();
  game.player.kick = true; game.player.invulnerable = 99;
  game.bombs.push(bomb({ c: 1, r: 0, fuse: 30, size: 1 }));
  game.grid[cell(9, 0)] = HARD;
  const events = await run(game, 0.2, { dir: 'right' });
  assert.ok(types(events).includes('kick'));
  await run(game, 2);
  assert.equal(game.bombs[0].c, 8, 'stops before the wall');
  game.grid[cell(9, 0)] = 0; game.player.x = 7; game.player.y = 0;
  await run(game, 0.2, { dir: 'right' });
  await run(game, 0.15);
  assert.ok(game.bombs[0].slide);
  step(game, 1 / 60, { action: true });
  assert.equal(game.bombs[0].slide, null);
  assert.equal(game.bombs[0].x, game.bombs[0].c);
});

test('keys open their locks from the bottom; the vault exit opens with no enemy left', async () => {
  const { createGame, spoonConfig, newGame, startStage, FLOOR, SOFT, LOCK } = await logic;
  const game = createGame(spoonConfig(data.defines), seeded(7));
  newGame(game); startStage(game, 3);
  game.grid = game.grid.map((c) => (c === SOFT ? FLOOR : c));
  game.enemies = []; game.hidden.clear(); game.wave = null; game.phase = 'play';
  game.player.invulnerable = 99;
  for (const [color, row] of [['blue', 3], ['green', 2], ['red', 1]]) {
    Object.assign(game.player, { x: 9, y: row + 1, key: color === 'blue' ? 'red' : color });
    let events = await run(game, 0.3, { dir: 'up' });
    if (color === 'blue') { assert.ok(types(events).includes('wrongKey')); assert.equal(game.grid[cell(9, row)], LOCK); game.player.key = 'blue'; events = await run(game, 0.3, { dir: 'up' }); }
    assert.ok(types(events).includes('unlock'), color);
    await run(game, 0.5);
    assert.equal(game.grid[cell(9, row)], FLOOR, 'the lock breaks like a block');
  }
  assert.equal(game.exit.open, true);
});

test('keys: walking over another one, the old key flies to a random bare cell', async () => {
  const game = await open();
  game.player.invulnerable = 99;
  game.items.set(cell(2, 0), { type: 'key', color: 'red', t: 1 });
  game.items.set(cell(4, 0), { type: 'key', color: 'green', t: 1 });
  await run(game, 1.8, { dir: 'right' });
  assert.equal(game.player.key, 'green');
  assert.ok(!game.items.has(cell(4, 0)));
  const red = [...game.items.values()].find((i) => i.color === 'red');
  assert.ok(red, 'the red key flew somewhere');
});

test('enemies walk 1.5 cells/s straight on (no turns at crossings), pause 0.25 s at a wall and pick another way', async () => {
  const { HARD } = await logic;
  const game = await open();
  game.player.invulnerable = 99; game.player.x = 0; game.player.y = 10;
  game.random = () => 0.5;
  game.enemies = [enemy({ x: 2, y: 0, dir: 'right' })];
  game.grid[cell(10, 0)] = HARD;
  await run(game, 2);
  assert.ok(Math.abs(game.enemies[0].x - 5) < 0.05 && game.enemies[0].y === 0, `straight past the crossings: ${game.enemies[0].x}`);
  await run(game, 2.8);
  const e = game.enemies[0];
  assert.equal(e.x, 9); assert.equal(e.state, 'pause');
  assert.notEqual(e.dir, 'right');
  await run(game, 0.3);
  assert.equal(e.state, 'walk');
});

test('chargers dash (4.5 cells/s) at the hero ahead in line, not behind; the dash ends in a 1 s bonk', async () => {
  const game = await open();
  game.random = () => 0.5;
  game.player.invulnerable = 99; game.player.x = 0; game.player.y = 4;
  game.enemies = [enemy({ kind: 'charger', charger: true, x: 6, y: 4, dir: 'right' })];
  await run(game, 0.1);
  assert.equal(game.enemies[0].state, 'walk', 'the hero is behind');
  game.enemies = [enemy({ kind: 'charger', charger: true, x: 6, y: 4, dir: 'left' })];
  const events = await run(game, 0.05);
  assert.ok(types(events).includes('dash'));
  assert.equal(game.enemies[0].state, 'charge');
  const before = game.enemies[0].x;
  await run(game, 0.2);
  assert.ok(Math.abs(before - game.enemies[0].x - 0.9) < 0.05, 'dashing 4.5 cells/s');
  game.player.y = 2; game.player.x = 1;
  await run(game, 1.5);
  assert.equal(game.enemies[0].state, 'bonk');
  await run(game, 1.05);
  assert.notEqual(game.enemies[0].state, 'bonk');
});

test('touching: the same rounded cell kills the hero', async () => {
  const game = await open();
  game.player.invulnerable = 0;
  game.enemies = [enemy({ x: 0.6, y: 0, tx: 1, ty: 0, dir: 'right' })];
  let events = await run(game, 1 / 60);
  assert.ok(!types(events).includes('death'));
  game.enemies = [enemy({ x: 0.45, y: 0, tx: 0, ty: 0, dir: 'left' })];
  events = await run(game, 1 / 60);
  assert.ok(types(events).includes('death'));
});

test('bomb-dropping creeps leave a range-1 bomb when they see the hero and can flee; cooldown 3.25 s', async () => {
  const game = await open(2);
  game.random = () => 0.5;
  game.player.invulnerable = 99; game.player.x = 0; game.player.y = 4;
  game.enemies = [enemy({ x: 6, y: 4, dir: 'left', bombs: true })];
  const events = await run(game, 1 / 60);
  assert.ok(types(events).includes('enemyBomb'));
  assert.deepEqual([game.bombs[0].c, game.bombs[0].r, game.bombs[0].size, game.bombs[0].owner], [6, 4, 1, 'enemy']);
  const e = game.enemies[0];
  assert.equal(e.state, 'pause'); assert.equal(e.cooldown, 3.25);
  assert.ok(['right', 'up', 'down'].includes(e.dir));
});

test('gold enemies kick bombs in their way', async () => {
  const game = await open(4);
  game.random = () => 0.9;
  game.player.invulnerable = 99; game.player.x = 0; game.player.y = 10;
  game.enemies = [enemy({ kind: 'elite', elite: true, charger: true, kick: true, x: 4, y: 0, dir: 'right' })];
  game.bombs.push(bomb({ owner: 'enemy', kind: 'enemy', c: 5, r: 0, fuse: 30, size: 1 }));
  const events = await run(game, 1 / 60);
  assert.ok(types(events).includes('kick'));
  assert.equal(game.bombs[0].slide, 'right');
});

test('bombers: stage 4 sends 5 every 5 s, launched 0.25 s apart, onto bare floor; bombs of range 2', async () => {
  const game = await open(4);
  const { dropperWave } = await logic;
  game.wave = { ...dropperWave(4), timer: 0, queue: [], gapTimer: 0, launched: 0 };
  game.player.invulnerable = 999;
  let events = await run(game, 4.95);
  assert.equal(events.filter((e) => e.type === 'sound' && e.name === 'Techiemen.DropperEnter').length, 0);
  events = await run(game, 0.1);
  assert.equal(game.droppers.length, 1, 'the first at once');
  events = await run(game, 1.05);
  assert.equal(events.filter((e) => e.type === 'sound' && e.name === 'Techiemen.DropperEnter').length, 4);
  assert.equal(game.wave.timer < 1, true, 'the interval restarts after the last one');
  events = await run(game, 1.5);
  const drops = [...events].filter((e) => e.type === 'drop');
  assert.ok(drops.length >= 1);
  assert.ok(game.bombs.every((b) => b.size === 2 && b.owner === 'dropper'));
});

test('bombers on stage 3: 3 of them, the first after 5 s, then every 8 s', async () => {
  const game = await open(3);
  const { dropperWave } = await logic;
  game.wave = { ...dropperWave(3), timer: dropperWave(3).start, queue: [], gapTimer: 0, launched: 0 };
  game.player.invulnerable = 999;
  const count = (events) => events.filter((e) => e.type === 'sound' && e.name === 'Techiemen.DropperEnter').length;
  assert.equal(count(await run(game, 4.9)), 0);
  assert.equal(count(await run(game, 0.7)), 3);
  assert.equal(count(await run(game, 7.5)), 0);
  assert.equal(count(await run(game, 1)), 3);
});

test('a bomber flies along the row or column of its mark at 7 cells/s, drops 0.25 s after the mark, leaves at 9', async () => {
  const { launchDropper, LIMITS } = await logic;
  const game = await open(4);
  game.player.invulnerable = 999;
  const d = launchDropper(game, 6, 4, 3);
  assert.deepEqual([d.dir, d.y, d.x], ['right', 4, -1]);
  await run(game, 1);
  assert.ok(['hover', 'leave'].includes(d.state));
  assert.ok(Math.abs(d.x - 6) < 1.8);
  const events = await run(game, 0.3);
  assert.ok(types(events).includes('drop'));
  assert.deepEqual([game.bombs[0].c, game.bombs[0].r, game.bombs[0].size], [6, 4, 2]);
  assert.equal(d.state, 'leave');
  const x = d.x; await run(game, 0.2);
  assert.ok(Math.abs(d.x - x - 1.8) < 0.05, 'leaving at 9 cells/s');
  assert.equal(LIMITS.bombs, 12);
  // Onto a bomb: the new one goes off at once.
  const other = launchDropper(game, 2, 2, 1);
  game.bombs.push(bomb({ owner: 'player', c: 2, r: 2, fuse: 30, size: 1 }));
  const later = await run(game, 1.2);
  assert.ok(later.some((e) => e.type === 'explode' && e.c === 2 && e.r === 2));
  void other;
});

test('a long random game never breaks the rules', async () => {
  const { createGame, spoonConfig, newGame, nextStage, step } = await logic;
  for (let seed = 1; seed <= 6; seed++) {
    const random = seeded(seed), game = createGame(spoonConfig(data.defines), random);
    newGame(game);
    const dirs = ['left', 'right', 'up', 'down'];
    let dir = 'right';
    for (let frame = 0; frame < 60 * 240; frame++) {
      if (frame % 30 === 0) dir = dirs[Math.floor(random() * 4)];
      step(game, 1 / 60, { dir, bomb: random() < 0.02, action: random() < 0.01 });
      if (game.phase === 'cleared') nextStage(game);
      if (game.phase === 'ended') break;
      const p = game.player;
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
      assert.ok(p.x >= -0.01 && p.y >= -0.01 && p.x <= 18.01 && p.y <= 10.01, `inside: ${p.x},${p.y}`);
      if (p.state === 'alive') assert.notEqual(game.grid[Math.round(p.y) * 19 + Math.round(p.x)], 1, 'never inside a pillar');
      for (const e of game.enemies) { assert.ok(Number.isFinite(e.x) && e.x >= -0.01 && e.x <= 18.01 && e.y >= -0.01 && e.y <= 10.01); assert.notEqual(game.grid[Math.round(e.y) * 19 + Math.round(e.x)], 1); }
      assert.ok(game.bombs.length <= 12 && game.enemies.length <= 16);
      assert.ok(game.score >= 0);
    }
  }
});
