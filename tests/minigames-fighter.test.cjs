const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../assets/minigames/fighter/data.json');
const sounds = require('../assets/minigames/fighter/sounds.json');
const logic = import('../src/minigames/games/fighter/logic.mjs');

async function setup(left = 'marci', right = 'marci', opts = {}) {
  const L = await logic;
  const config = L.fighterConfig(data);
  const game = L.createMatch(config, { left, right, seed: 3, ...opts });
  // As after the round start: frames already counted (the input windows look back from the current frame).
  game.phase = 'fight'; game.phaseFrame = 0; game.frame = 600;
  return { L, config, game };
}
// Puts the two at a distance (left one at x0).
const place = (game, d, x0 = -d / 2) => { game.fighters[0].x = x0; game.fighters[1].x = x0 + d; game.fighters[0].facing = 1; game.fighters[1].facing = -1; };
function run(L, game, n, keys = () => [0, 0]) { const events = []; for (let i = 0; i < n; i++) events.push(...L.step(game, keys(i))); return events; }
// Ticks until a condition (or a limit).
function until(L, game, cond, keys = () => [0, 0], limit = 600) { const events = []; for (let i = 0; i < limit && !cond(); i++) events.push(...L.step(game, keys(i))); return events; }
// The frame each fighter can act again after the current exchange: ticks until IDLE.
function recovery(L, game) {
  const at = [null, null];
  for (let i = 1; i < 300 && (at[0] === null || at[1] === null); i++) {
    L.step(game, [0, 0]);
    game.fighters.forEach((f, k) => { if (at[k] === null && f.act.id === 'IDLE') at[k] = i; });
  }
  return at;
}

test('vdata → config: Valve\'s numbers and the convars', async () => {
  const { L, config } = await setup();
  const marci = config.heroes.marci;
  assert.equal(Object.keys(marci.actions).length, 24, 'Marci has 24 actions');
  const jab = marci.actions.JAB;
  assert.deepEqual([jab.duration, jab.hitStart, jab.hitLen, jab.onHit, jab.onBlock, jab.damage], [25, 8, 3, 5, -1, 50]);
  const sweep = marci.actions.SWEEP;
  assert.equal(sweep.damage, 150); assert.equal(sweep.onBlock, -10); assert.equal(sweep.hitStop, 10);
  assert.equal(config.heroes.tusk.actions.WALRUS_PUNCH.damage, 450);
  assert.ok(config.heroes.tusk.actions.WALRUS_PUNCH.invuln.strike);
  assert.equal(config.heroes.vengeful.actions.PROJECTILE.projectile.speed, 1600);
  assert.equal(config.heroes.marci.actions.UNLEASH.install.frames, 5940);
  assert.equal(config.heroes.bristleback.actions.JAB.cancels[0].buffer, 6, 'the vdata spelling m_eCancelInputBuffer is read');
  assert.equal(L.CONVARS.roundDuration, 60); assert.equal(L.CONVARS.stageWidth, 2500); assert.equal(L.CONVARS.maxHeroDistance, 1400);
  for (const h of L.HEROES) assert.ok(config.heroes[h].actions.IDLE.cancels.length >= 4, h);
  assert.equal(L.blockClass(3), 'Safe'); assert.equal(L.blockClass(-1), 'TurnOver'); assert.equal(L.blockClass(-30), 'VeryUnsafe');
  assert.equal(L.startupOf(jab), 9);
});

test('move list: named moves from neutral with all their inputs', async () => {
  const { L, config } = await setup();
  const rows = L.moveList(config.heroes.tusk);
  const punch = rows.find((r) => r.to === 'WALRUS_PUNCH');
  assert.deepEqual(punch.inputs, [[1, 4, 1 | 4 | 16], [4 | 32]]);
  assert.equal(L.moveList(config.heroes.marci).filter((r) => r.install).length, 3);
});

test('frame advantage: Marci\'s jab is +5 on hit and −1 on block, exactly', async () => {
  for (const [hold, expect] of [[0, 5], [1, -1]]) {
    const { L, game } = await setup();
    place(game, 400);
    // Right fighter holds back (= right key) to block.
    const keys = (i) => [i === 0 ? L.KEY.ATTACK : 0, hold ? L.KEY.RIGHT : 0];
    const events = until(L, game, () => game.fighters[0].connected, keys, 60);
    assert.ok(events.some((e) => e.type === (hold ? 'block' : 'hit')), hold ? 'blocked' : 'hit');
    // Freeze (hitstop) holds both; then count frames to neutral.
    const [att, def] = recovery(L, game);
    assert.equal(def - att, expect, `advantage ${expect}`);
  }
});

test('damage, chip and guard: blocks cost guard; a breaking block is a hit ×1.2 and GUARDBREAK', async () => {
  const { L, game } = await setup('tusk', 'marci');
  place(game, 475);
  const [att, def] = game.fighters, fin = att.hero.actions.FINISHER;
  const swing = () => { att.act = fin; att.t = 0; att.end = fin.duration; att.connected = null; };
  // Tusk's combo ender has 50 chip and 30 guard damage.
  swing();
  until(L, game, () => att.connected, () => [0, L.KEY.RIGHT], 60);
  assert.equal(def.hp, 1000 - 50); assert.equal(def.guard, 70);
  recovery(L, game);
  def.guard = 5;
  place(game, 475); swing();
  const before = def.hp;
  const ev = until(L, game, () => att.connected, () => [0, L.KEY.RIGHT], 60);
  assert.ok(ev.some((e) => e.type === 'guardBreak'));
  assert.ok(def.guardBroken); assert.equal(def.act.id, 'GUARDBREAK'); assert.equal(def.end, def.hero.actions.GUARDBREAK.duration);
  assert.ok(Math.abs(before - def.hp - (50 + fin.damage * 1.2)) < 1e-9, 'chip + damage × 1.2');
  recovery(L, game);
  // Broken: a block is again ×1.2 and GUARDBREAK; not holding back is a plain hit.
  const jab = att.hero.actions.JAB;
  let hp = def.hp;
  place(game, 475);
  until(L, game, () => att.connected, (i) => [i === 0 ? L.KEY.ATTACK : 0, L.KEY.RIGHT], 60);
  assert.ok(Math.abs(hp - def.hp - jab.chip - jab.damage * 1.2) < 1e-9, 'jab × 1.2 through a broken guard');
  assert.equal(def.act.id, 'GUARDBREAK');
  recovery(L, game); hp = def.hp;
  place(game, 475);
  until(L, game, () => att.connected, (i) => [i === 0 ? L.KEY.ATTACK : 0, 0], 60);
  assert.equal(hp - def.hp, jab.damage, 'not blocking: × 1.0');
  assert.equal(def.act.id, 'HITSTUN');
});

test('guard regen: 3 a second, 20 while broken, no delay, not in stun', async () => {
  const { L, game } = await setup();
  place(game, 1000);
  const f = game.fighters[0];
  f.guard = 50;
  run(L, game, 60);
  assert.ok(Math.abs(f.guard - 53) < 1e-9, `${f.guard}`);
  f.guard = 0; f.guardBroken = true;
  run(L, game, 60);
  assert.ok(Math.abs(f.guard - 20) < 1e-9 && f.guardBroken, `${f.guard}`);
  run(L, game, 245);
  assert.equal(f.guard, 100); assert.equal(f.guardBroken, false);
  f.guard = 10; f.act = f.hero.actions.HITSTUN; f.t = 0; f.end = 30;
  run(L, game, 20);
  assert.equal(f.guard, 10, 'no regen in hit stun');
});

test('cancels: jab → cross → finisher on hit, not on a whiff', async () => {
  const { L, game } = await setup();
  place(game, 400);
  const press = (frames) => (i) => [frames.includes(i) ? L.KEY.ATTACK : 0, 0];
  const seen = [];
  for (let i = 0; i < 120; i++) for (const e of L.step(game, press([0, 14, 30, 31])(i))) if (e.type === 'action' && e.side === 0) seen.push(e.id);
  assert.deepEqual(seen.slice(0, 3), ['JAB', 'CROSS', 'FINISHER']);
  const w = await setup();
  place(w.game, 1200);
  const whiff = [];
  for (let i = 0; i < 120; i++) for (const e of w.L.step(w.game, press([0, 14, 30])(i))) if (e.type === 'action' && e.side === 0) whiff.push(e.id);
  assert.equal(whiff[1], 'JAB', 'after a whiff the second press is a new jab, not a cross');
});

test('motion inputs and the special button: Walrus Punch two ways, Nasal Goo', async () => {
  const { L, game } = await setup('tusk', 'marci');
  place(game, 900);
  const R = L.KEY.RIGHT, D = L.KEY.DOWN, A = L.KEY.ATTACK, S = L.KEY.SPECIAL;
  const seq = [R, R, D, D, R | D | A];
  const ev = run(L, game, seq.length, (i) => [seq[i], 0]);
  assert.ok(ev.some((e) => e.type === 'action' && e.id === 'WALRUS_PUNCH'));
  const b = await setup('tusk', 'marci'); place(b.game, 900);
  assert.ok(run(L, b.game, 2, (i) => [i === 1 ? D | S : D, 0]).some((e) => e.id === 'WALRUS_PUNCH'), 'down + special');
  const g = await setup('bristleback', 'marci'); place(g.game, 900);
  assert.ok(run(L, g.game, 4, (i) => [[D, D, R, R | A][i], 0]).some((e) => e.id === 'PROJECTILE'), 'down, forward + attack');
  const h = await setup('bristleback', 'marci'); place(h.game, 900);
  assert.ok(run(L, h.game, 2, (i) => [i === 1 ? R | A : R, 0]).some((e) => e.id === 'SWEEP'), 'forward + attack is the heavy');
});

test('dashes: forward twice, 15 frames, projectile-invulnerable', async () => {
  const { L, game } = await setup();
  place(game, 1000);
  const R = L.KEY.RIGHT, x0 = game.fighters[0].x;
  const ev = run(L, game, 4, (i) => [[R, 0, R, R][i], 0]);
  assert.ok(ev.some((e) => e.id === 'DASH'));
  run(L, game, 20);
  assert.ok(game.fighters[0].x - x0 >= 250, `moved ${game.fighters[0].x - x0}`);
  assert.equal(game.fighters[0].hero.actions.DASH.invuln.projectile, true);
});

test('projectiles: Magic Missile flies, hits from afar; two projectiles cancel out', async () => {
  const { L, game } = await setup('vengeful', 'tusk');
  place(game, 1200);
  const ev = until(L, game, () => game.fighters[1].hp < 1000, (i) => [i === 0 ? L.KEY.SPECIAL : 0, 0], 120);
  assert.ok(ev.some((e) => e.type === 'projectile'));
  assert.equal(game.fighters[1].hp, 1000 - 120);
  const c = await setup('vengeful', 'tusk'); place(c.game, 1300);
  const ev2 = run(L, c.game, 90, (i) => [i === 0 ? L.KEY.SPECIAL : 0, i === 0 ? L.KEY.SPECIAL : 0]);
  assert.ok(ev2.some((e) => e.type === 'clash'));
});

test('Nasal Goo amplifies damage for 480 frames; Luminosity heals on hit', async () => {
  const { L, game } = await setup('bristleback', 'tusk');
  place(game, 800);
  until(L, game, () => game.fighters[1].amp > 0, (i) => [i === 0 ? L.KEY.SPECIAL : 0, 0], 120);
  assert.equal(game.fighters[1].amp, 480 - 1 >= 0 ? game.fighters[1].amp : 0);
  assert.equal(game.fighters[1].ampPct, 25);
  const d = await setup('dawnbreaker', 'tusk');
  place(d.game, 450);
  d.game.fighters[0].hp = 500;
  until(L, d.game, () => d.game.fighters[0].connected, (i) => [i === 0 ? L.KEY.SPECIAL | L.KEY.RIGHT : 0, 0], 120);
  assert.equal(d.game.fighters[0].hp, 600);
  assert.equal(d.game.fighters[1].hp, 800);
});

test('Unleash: install opens the stronger chain; single use per round', async () => {
  const { L, game } = await setup();
  place(game, 1200);
  run(L, game, 2, (i) => [i === 1 ? L.KEY.DOWN | L.KEY.SPECIAL : L.KEY.DOWN, 0]);
  assert.equal(game.fighters[0].act.id, 'UNLEASH');
  run(L, game, 90);
  assert.ok(game.fighters[0].install > 5000);
  const ev = run(L, game, 2, (i) => [i === 0 ? L.KEY.ATTACK : 0, 0]);
  assert.ok(ev.some((e) => e.id === 'JAB_2'), 'the install jab');
  run(L, game, 40);
  const again = run(L, game, 3, (i) => [i === 2 ? L.KEY.DOWN | L.KEY.SPECIAL : L.KEY.DOWN, 0]);
  assert.ok(!again.some((e) => e.id === 'UNLEASH'));
});

test('Nether Swap: on hit the two change places', async () => {
  const { L, game } = await setup('vengeful', 'tusk');
  place(game, 900);
  const [a, b] = game.fighters, xa = a.x, xb = b.x;
  const ev = run(L, game, 40, (i) => [i === 1 ? L.KEY.DOWN | L.KEY.SPECIAL : (i === 0 ? L.KEY.DOWN : 0), 0]);
  assert.ok(ev.some((e) => e.type === 'swap'));
  assert.ok(a.x > b.x, 'sides changed'); assert.ok(Math.abs(a.x - xb) < 80 && Math.abs(b.x - xa) < 80);
});

test('Walrus Punch is strike-invulnerable through frames 8–30', async () => {
  const { L, game } = await setup('tusk', 'marci');
  place(game, 420);
  run(L, game, 2, (i) => [i === 1 ? L.KEY.DOWN | L.KEY.SPECIAL : L.KEY.DOWN, 0]);
  run(L, game, 8);
  const ev = run(L, game, 12, (i) => [0, i === 0 ? L.KEY.ATTACK : 0]);
  assert.ok(!ev.some((e) => e.type === 'hit' && e.side === 1), 'Marci\'s jab passes through');
});

test('round flow: KO, best of three, scores, perfect', async () => {
  const { L, game } = await setup('tusk', 'marci');
  const events = [];
  for (let round = 0; round < 2; round++) {
    game.fighters[1].hp = 40; place(game, 475);
    events.push(...until(L, game, () => game.phase === 'ko', (i) => [i % 30 === 0 ? L.KEY.ATTACK : 0, 0], 200));
    assert.equal(game.fighters[1].act.id, 'KNOCKED_DOWN'); assert.equal(game.fighters[1].end, 180);
    assert.ok(game.fighters.every((f) => f.hitstop === 60), 'KO stop 60');
    events.push(...until(L, game, () => game.phase === 'fight' || game.phase === 'matchEnd' || game.phase === 'done', () => [0, 0], 2000));
  }
  assert.equal(game.phase, 'matchEnd');
  assert.equal(game.winner, 0);
  assert.deepEqual(game.fighters.map((f) => f.roundWins), [2, 0]);
  assert.ok(events.some((e) => e.type === 'ko' && e.perfect));
  const r = game.result;
  // Each round: round(1000 × time left / 60) and 1000 for full health; 2:0 adds 1000 + 1000. No First Blood (the
  // target was not at full health); damage/2: Tusk's jab 100 → 50 a round. Perfect gives no points.
  const [r1, r2] = game.rounds;
  assert.equal(r.health, 3000);
  assert.equal(r.time, Math.round(r1.time * 0 + game.records[0].time));
  assert.ok(r.time > 1000 + 2 * 900 && r.time < 3000, JSON.stringify(r));
  assert.equal(r.stylish, 0); assert.equal(r.bonus, 100);
  assert.equal(r.subtotal, r.time + r.health + r.stylish + r.bonus);
  assert.ok(r1 && r2);
  until(L, game, () => game.phase === 'done', () => [0, 0], 1000);
  assert.equal(game.phase, 'done');
});

test('score: First Blood, Counter vs Punish, damage/2, stylish finish, time formula', async () => {
  const { L, game } = await setup('marci', 'marci');
  place(game, 400);
  const [a, b] = game.fighters;
  // b is in the startup of its sweep: a's jab is a Counter Hit; both were at full health: First Blood.
  b.act = b.hero.actions.SWEEP; b.t = 0; b.end = b.act.duration;
  const ev = until(L, game, () => a.connected, (i) => [i === 0 ? L.KEY.ATTACK : 0, 0], 30);
  const kinds = ev.filter((e) => e.type === 'announce').map((e) => e.kind);
  assert.deepEqual(kinds, ['FirstBlood', 'CounterHit']);
  assert.equal(game.records[0].firstBlood, 200); assert.equal(game.records[0].counter, 100);
  assert.equal(game.records[0].damage, 25, 'jab 50 → 25');
  recovery(L, game);
  // Recovery of a whiffed move: Punish.
  place(game, 400);
  b.act = b.hero.actions.SWEEP; b.t = b.act.hitStart + b.act.hitLen + 1; b.end = b.act.duration; b.connected = 'hit';
  const ev2 = until(L, game, () => a.connected, (i) => [i === 0 ? L.KEY.ATTACK : 0, 0], 30);
  assert.deepEqual(ev2.filter((e) => e.type === 'announce').map((e) => e.kind), ['PunishCounter']);
  // A KO by a special move: 500.
  recovery(L, game);
  const g = (await setup('tusk', 'marci')).game;
  place(g, 475);
  g.fighters[1].hp = 10;
  run(L, g, 2, (i) => [i === 1 ? L.KEY.DOWN | L.KEY.SPECIAL : L.KEY.DOWN, 0]);
  until(L, g, () => g.phase === 'ko', () => [0, 0], 120);
  assert.equal(g.records[0].stylish, 500);
});

test('time out: the healthier one wins; a draw gives the round to both', async () => {
  const { L, game } = await setup();
  game.timer = 3; game.fighters[0].hp = 600;
  const ev = until(L, game, () => game.phase === 'timeOut', () => [0, 0], 10);
  assert.ok(ev.some((e) => e.type === 'timeOut' && e.winner === 1));
  assert.ok(game.fighters.every((f) => f.hitstop === 180));
  const d = await setup(); d.game.timer = 2;
  const ev2 = until(L, d.game, () => d.game.phase === 'roundEnd', () => [0, 0], 400);
  assert.ok(ev2.some((e) => e.type === 'roundEnd' && e.winner === null));
  assert.deepEqual(d.game.fighters.map((f) => f.roundWins), [1, 1]);
  assert.equal(d.game.records[0].time, 0, 'no time left: 0');
  assert.equal(d.game.records[0].health, 1000);
});

test('the intro (720 frames, skipped by attack), round start and FIGHT come in Valve\'s order', async () => {
  const L = await logic;
  const game = L.createMatch(L.fighterConfig(data), { left: 'marci', right: 'tusk' });
  const types = [];
  let frames = 0;
  for (let i = 0; i < 2000 && game.phase !== 'fight'; i++) { frames++; for (const e of L.step(game, [0, 0])) types.push(e.type); }
  assert.deepEqual(types.filter((t) => ['intro', 'preRound', 'roundStart', 'fightCall', 'fight'].includes(t)), ['intro', 'preRound', 'roundStart', 'fightCall', 'fight']);
  assert.equal(frames, 720 + 180 + 180, 'intro, pre-round start, round start');
  assert.equal(game.fighters[0].act.id, 'IDLE', 'no input before FIGHT');
  const s = L.createMatch(L.fighterConfig(data), { left: 'marci', right: 'tusk' });
  for (let i = 0; i < 10; i++) L.step(s, [i === 5 ? L.KEY.ATTACK : 0, 0]);
  assert.equal(s.phase, 'preRound', 'a press of attack skips the intro');
  assert.deepEqual([s.fighters[0].x, s.fighters[1].x], [-500, 500]);
});

test('the CPU fights: whole matches end, HARD beats EASY more often than not', async () => {
  const L = await logic;
  const config = L.fighterConfig(data);
  let hardWins = 0, games = 0;
  for (const [a, b] of [['marci', 'tusk'], ['tusk', 'bristleback'], ['vengeful', 'dawnbreaker'], ['dawnbreaker', 'marci'], ['bristleback', 'vengeful'], ['tusk', 'marci']]) {
    const game = L.createMatch(config, { left: a, right: b, seed: games + 1 });
    const ai = [L.createAI(game, 0, 'HARD', games + 2), L.createAI(game, 1, 'EASY', games + 3)];
    let hits = 0;
    for (let i = 0; i < 60 * 60 * 6 && game.phase !== 'done'; i++) for (const e of L.step(game, [L.aiInput(game, ai[0]), L.aiInput(game, ai[1])])) if (e.type === 'hit') hits++;
    assert.equal(game.phase, 'done', `${a} vs ${b} ends`);
    assert.ok(hits > 5, 'they hit each other');
    games++; if (game.winner === 0) hardWins++;
  }
  assert.ok(hardWins >= 4, `HARD won ${hardWins} of ${games}`);
});

test('client.dll constants: 1000 HP, 100 guard, walk 6 forward / 5 back, start at ±500', async () => {
  const { L, game } = await setup();
  assert.equal(L.RULES.maxHp, 1000); assert.equal(L.RULES.maxGuard, 100);
  const [a, b] = game.fighters;
  place(game, 1000);
  const x0 = a.x, y0 = b.x;
  run(L, game, 10, () => [L.KEY.RIGHT, L.KEY.RIGHT]);
  assert.equal(a.x - x0, 60, 'forward 6 a frame'); assert.equal(b.x - y0, 50, 'back 5 a frame');
  const fresh = L.createMatch(game.config, { left: 'tusk', right: 'marci' });
  assert.deepEqual(fresh.fighters.map((f) => [f.x, f.facing, f.hp, f.guard]), [[-500, 1, 1000, 100], [500, -1, 1000, 100]]);
});

test('bodies: the minimum distance is the SUM of both widths; the walker pushes at half its step; 1400 at most', async () => {
  for (const [l, r, w] of [['marci', 'marci', 400], ['tusk', 'tusk', 550], ['tusk', 'marci', 475]]) {
    const { L, game } = await setup(l, r);
    place(game, 700);
    run(L, game, 120, () => [L.KEY.RIGHT, 0]);
    const [a, b] = game.fighters;
    assert.equal(b.x - a.x, w, `${l}×${r}`);
  }
  const { L, game } = await setup();
  place(game, 400, -200);
  const [a, b] = game.fighters, xb = b.x;
  run(L, game, 10, () => [L.KEY.RIGHT, 0]);
  assert.equal(b.x - xb, 30, 'pushed 3 a frame'); assert.equal(b.x - a.x, 400);
  place(game, 1390, -695);
  run(L, game, 20, () => [L.KEY.LEFT, L.KEY.RIGHT]);
  assert.ok(b.x - a.x <= 1400, `${b.x - a.x}`);
  // Two walking into each other both stay.
  place(game, 400);
  const ax = a.x, bx = b.x;
  run(L, game, 10, () => [L.KEY.RIGHT, L.KEY.LEFT]);
  assert.deepEqual([a.x, b.x], [ax, bx]);
});

test('input windows: 8 frames per element of a cancel option', async () => {
  const { L } = await setup('tusk', 'marci');
  const R = L.KEY.RIGHT, D = L.KEY.DOWN, A = L.KEY.ATTACK;
  // Walrus Punch: forward, down, down-forward + attack — three elements, 24 frames in all.
  const tryIt = async (gapA, gapB) => {
    const { game } = await setup('tusk', 'marci'); place(game, 900);
    const seq = [];
    seq[0] = R; for (let i = 1; i <= gapA; i++) seq[i] = 0; seq[gapA] = D; for (let i = gapA + 1; i < gapA + gapB; i++) seq[i] = 0; seq[gapA + gapB] = R | D | A;
    return run(L, game, seq.length, (i) => [seq[i] || 0, 0]).some((e) => e.id === 'WALRUS_PUNCH');
  };
  assert.equal(await tryIt(10, 10), true, 'within 24 frames');
  assert.equal(await tryIt(14, 12), false, 'the first element 26 frames back');
  // One element: a press within 8 frames is still taken when the fighter can act.
  const { game } = await setup('marci', 'marci'); place(game, 1200);
  const f = game.fighters[0];
  f.act = f.hero.actions.HITSTUN; f.t = 0; f.end = 6;
  const ev = run(L, game, 12, (i) => [i === 1 ? A : 0, 0]);
  assert.ok(ev.some((e) => e.id === 'JAB'), 'a press in the last 8 frames of a stun comes out');
});

// The CPU's odds from Valve's decision tree, measured on fresh decisions.
function aiOdds(L, game, level, n = 4000) {
  const out = new Map();
  for (let i = 0; i < n; i++) {
    const ai = L.createAI(game, 1, level, i + 1);
    const k = L.aiInput(game, ai);
    out.set(k, (out.get(k) || 0) + 1);
  }
  return out;
}
test('the CPU: Valve\'s decision tree with its odds per level', async () => {
  const { L, game } = await setup('marci', 'marci');
  const share = (m, k, n = 4000) => (m.get(k) || 0) / n;
  // Far away: forward (toward the left fighter).
  place(game, 1400, -1000);
  let m = aiOdds(L, game, 'EASY');
  assert.equal(share(m, L.KEY.LEFT), 1);
  // In reach, the opponent idle: EASY 10 % fastest / 9 % farthest / 81 % nothing; MEDIUM/HARD 25 / 49.5 / 25.5.
  place(game, 400, -800);
  m = aiOdds(L, game, 'EASY');
  assert.ok(Math.abs(share(m, 0) - 0.81) < 0.03, `EASY waits ${share(m, 0)}`);
  m = aiOdds(L, game, 'HARD');
  assert.ok(Math.abs(share(m, 0) - 0.255) < 0.03, `HARD waits ${share(m, 0)}`);
  // The opponent's active hit box reaches: HARD holds back (block) 70 %, MEDIUM 50 %, EASY never.
  const a = game.fighters[0];
  a.act = a.hero.actions.SWEEP; a.t = a.act.hitStart; a.end = a.act.duration;
  m = aiOdds(L, game, 'HARD');
  assert.ok(Math.abs(share(m, L.KEY.RIGHT) - 0.7) < 0.03, `HARD blocks ${share(m, L.KEY.RIGHT)}`);
  m = aiOdds(L, game, 'MEDIUM');
  assert.ok(Math.abs(share(m, L.KEY.RIGHT) - 0.5) < 0.03, `MEDIUM blocks ${share(m, L.KEY.RIGHT)}`);
  m = aiOdds(L, game, 'EASY');
  assert.equal(share(m, L.KEY.RIGHT), 0, 'EASY does not block');
  // Not in IDLE: nothing.
  game.fighters[1].act = game.fighters[1].hero.actions.JAB;
  assert.equal(share(aiOdds(L, game, 'HARD', 50), 0, 50), 1);
});

test('arcade: four others then the mirror match, credits, score', async () => {
  const L = await logic;
  const arcade = L.createArcade('tusk', 5);
  assert.equal(arcade.opponents.length, 5);
  assert.equal(arcade.opponents[4], 'tusk');
  assert.deepEqual([...arcade.opponents.slice(0, 4)].sort(), ['bristleback', 'dawnbreaker', 'marci', 'vengeful']);
  assert.equal(L.arcadeResult(arcade, { won: true, subtotal: 5000 }), 'next');
  assert.equal(arcade.stage, 1); assert.equal(arcade.score, 5000);
  for (let i = 0; i < L.ARCADE.credits; i++) { assert.equal(L.arcadeResult(arcade, { won: false, subtotal: 100 }), 'continue'); L.arcadeContinue(arcade); }
  assert.equal(arcade.score, 5000, 'a lost match (continued) gives nothing');
  assert.equal(L.arcadeResult(arcade, { won: false, subtotal: 0 }), 'gameOver');
  assert.ok(arcade.over && !arcade.won);
  assert.deepEqual(L.ARCADE.levels, ['EASY', 'EASY', 'MEDIUM', 'MEDIUM', 'HARD']);
});

test('sounds: every vdata sound and the game\'s events are there; music durations are real', async () => {
  const want = new Set(Object.keys(sounds.events));
  for (const hero of ['bristleback', 'dawnbreaker', 'marci', 'tusk', 'vengeful']) {
    const d = data[hero];
    for (const k of ['m_pszBasicSwingSound', 'm_pszBasicHitSound']) assert.ok(want.has(d[k]), d[k]);
    for (const a of d.m_vecActionDefinitions) for (const k of ['m_pszSwingSound', 'm_pszHitSound']) if (a[k]) assert.ok(want.has(a[k]), a[k]);
  }
  for (const e of ['fighting_game.fight', 'fighting_game.ko', 'fighting_game.match_intro', 'fighting_game.match_music', 'fighting_game.menu_music', 'fighting_game.timeout', 'fighting_game.victory_music']) assert.ok(want.has(e), e);
  for (const [file, info] of Object.entries(sounds.files)) assert.ok(info.duration < 120, file);
  assert.ok(sounds.events['fighting_game.match_intro'].duration <= 31, 'countdown cut to 30 s');
});
