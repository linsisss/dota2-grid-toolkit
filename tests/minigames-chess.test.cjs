// «Драконьи шахматы» (src/minigames/games/chess/logic.mjs): the numbers from Valve's vdata, matching,
// ability gems, abilities, the opponents' clocks and actions, modifiers, the campaign, the score.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const data = require('../assets/minigames/chess/data.json');
const logic = import('../src/minigames/games/chess/logic.mjs');

const ASSETS = path.join(__dirname, '../assets/minigames/chess/');
async function setup() { const L = await logic; return { L, config: L.chessConfig(data) }; }
const run = (L, game, seconds, dt = 1 / 60) => { const events = []; for (let t = 0; t < seconds - 1e-9; t += dt) events.push(...L.step(game, dt)); return events; };
const piece = (id, hero, r, c, kind = 'normal') => ({ id, hero, kind, r, c, x: c, y: r, vy: 0, state: 'idle', t: 0 });
// A board from rows of digits (heroes 0–5); letters s/u after a digit make super/ultra gems: "0s".
function board(L, game, rows) {
  let id = 1000;
  game.grid = rows.map((row, r) => row.trim().split(/\s+/).map((cell, c) => piece(id++, Number(cell[0]), r, c, cell[1] === 's' ? 'super' : cell[1] === 'u' ? 'ultra' : 'normal')));
  game.outOfMoves = 0; game.hint = null;
  return game;
}
// A quiet game in the fight against a level's opponent, the board set, no random refills of matches.
function fight(L, config, level = 0, rows = null) {
  const game = L.createGame(config, { seed: 7, countdown: false, startLevel: level });
  run(L, game, 8); // the stage intro and the opponent's intro actions
  if (rows) board(L, game, rows);
  game.events.length = 0;
  return game;
}
const NO_MATCH = [
  '0 1 2 3 4 5 0 1', '2 3 4 5 0 1 2 3', '4 5 0 1 2 3 4 5', '0 1 2 3 4 5 0 1',
  '2 3 4 5 0 1 2 3', '4 5 0 1 2 3 4 5', '0 1 2 3 4 5 0 1', '2 3 4 5 0 1 2 3',
];

test('the numbers come from the vdata', async () => {
  const { config } = await setup();
  assert.equal(config.rows, 8); assert.equal(config.cols, 8); assert.equal(config.playerHealth, 1000);
  assert.deepEqual(config.heroes.map((h) => h.key), ['lina', 'broodmother', 'crystal_maiden', 'lich', 'vengefulspirit', 'winter_wyvern']);
  assert.equal(Object.keys(data.heroes).filter((k) => k !== 'generic_data_type').length, 10);
  assert.equal(config.levels.length, 13);
  assert.equal(Object.keys(config.opponents).length, 26);
  assert.equal(Object.keys(config.actions).length, 20);
  assert.equal(Object.keys(config.abilities).length, 21);
  assert.equal(config.abilities.lina_dragon_slave.params.damage, 20);
  assert.equal(config.abilities.lich_chain_frost.params.bounces, 12);
  assert.equal(config.opponents.match3_opponent_frost_dragon.maxHealth, 600);
  assert.equal(config.opponents.match3_opponent_chaos_knight.repeat.length, 6);
  assert.deepEqual(config.levels.map((l) => l.kind), ['normal', 'normal', 'boss', 'friendly', 'normal', 'normal', 'boss', 'friendly', 'normal', 'normal', 'boss', 'friendly', 'boss']);
  assert.equal(config.levels.reduce((s, l) => s + l.score, 0), 6200);
  // instance parameters override the action's: the radiant ranged creep hits 30–40, not 20–30
  assert.deepEqual([config.opponents.match3_opponent_ranged_creep_radiant.repeat[0].params.min_damage, config.opponents.match3_opponent_ranged_creep_radiant.repeat[0].params.max_damage], [30, 40]);
});

test('the start board has no match and a move', async () => {
  const { L, config } = await setup();
  for (let seed = 1; seed < 30; seed++) {
    const game = L.createGame(config, { seed, countdown: false });
    const heroes = game.grid.map((row) => row.map((p) => p.hero));
    assert.ok(L.hasMove(heroes));
    run(L, game, 2);
    assert.equal(game.matches, 0, `seed ${seed}: no match on the start board`);
  }
});

test('a swap must make a match; a refused one comes back', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 0, NO_MATCH);
  const before = game.grid.map((row) => row.map((p) => p.hero).join('')).join('|');
  assert.equal(L.trySwap(game, [0, 0], [0, 1]), 'refused');
  run(L, game, 1);
  assert.equal(game.grid.map((row) => row.map((p) => p.hero).join('')).join('|'), before);
  assert.equal(L.trySwap(game, [0, 0], [2, 0]), null, 'not neighbours');
  // a match: 0 0 _ 0 in a row
  board(L, game, ['0 0 1 0 2 3 4 5', ...NO_MATCH.slice(1)]);
  assert.equal(L.trySwap(game, [0, 2], [0, 3]), 'swap');
  const events = run(L, game, 0.3);
  const match = events.find((e) => e.type === 'match');
  assert.ok(match); assert.equal(match.count, 3); assert.equal(match.combo, 1); assert.equal(match.score, 50);
});

test('matched gems fall out, new ones fall in, every gem hits the opponent once', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 0, ['0 0 1 0 2 3 4 5', ...NO_MATCH.slice(1)]);
  const hp = game.opponent.health;
  L.trySwap(game, [0, 2], [0, 3]);
  run(L, game, 1.5);
  assert.ok(game.grid.every((row) => row.every((p) => p)), 'the board is full again');
  assert.ok(hp - game.opponent.health >= 3, 'three match attacks landed');
  assert.ok(game.score >= 50);
});

test('four make a super gem, five an ultra gem, where the moved gem went', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 0, ['1 1 0 1 1 2 3 4', ...NO_MATCH.slice(1).map((r) => r.replace(/^1/, '5'))]);
  // 1 1 [0] 1 1 with a 1 below the 0 → swap up makes five in a row
  game.grid[1][2].hero = 1;
  assert.equal(L.trySwap(game, [0, 2], [1, 2]), 'swap');
  const events = run(L, game, 0.8);
  const up = events.find((e) => e.type === 'upgraded');
  assert.ok(up); assert.equal(up.kind, 'ultra');
  const ultra = game.grid.flat().find((p) => p.id === up.id);
  assert.equal(ultra.c, 2); assert.equal(ultra.hero, 1);

  const g2 = fight(L, config, 0, ['1 1 0 1 2 3 4 5', ...NO_MATCH.slice(1)]);
  g2.grid[1][2].hero = 1;
  L.trySwap(g2, [0, 2], [1, 2]);
  const e2 = run(L, g2, 0.8);
  assert.equal(e2.find((e) => e.type === 'upgraded')?.kind, 'super');
});

test('matching an ability gem casts its ability (Lina: Dragon Slave burns the row and hits for 20)', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 1, ['0s 0 3 0 2 3 4 5', ...NO_MATCH.slice(1)]);
  game.opponent.health = 1000; game.opponent.maxHealth = 1000;
  L.trySwap(game, [0, 2], [0, 3]);
  const events = run(L, game, 2.5);
  const cast = events.find((e) => e.type === 'ability');
  assert.equal(cast?.name, 'lina_dragon_slave');
  const magic = events.filter((e) => e.type === 'opponentDamage' && e.kind === 'magic');
  assert.deepEqual(magic.map((e) => e.amount), [20]);
  // the row to the right of the gem burnt: 3 matched + the rest of the row destroyed
  assert.ok(events.filter((e) => e.type === 'clear' && e.cause === 'lina_dragon_slave').length >= 4);
});

test('Lina: Light Strike Array clears radius 2.5 and stuns 5 s; the stun interrupts the opponent', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 1, NO_MATCH.map((r, i) => (i === 4 ? '0u 0 3 0 2 3 4 5' : r)));
  game.opponent.health = 1000;
  L.trySwap(game, [4, 2], [4, 3]);
  const events = run(L, game, 1.2);
  // at once (client.dll): the 13 cells within 2.5 of (4, 0) minus the three matched gems
  assert.equal(events.filter((e) => e.type === 'clear' && e.cause === 'lina_light_strike_array').length, 10);
  assert.ok(L.hasMod(game.opponent, 'stun'));
  assert.ok(game.opponent.interrupted);
  const cd = game.opponent.cooldown;
  run(L, game, 2);
  assert.equal(game.opponent.cooldown, cd, 'the clock stands while stunned');
});

test('Crystal Nova slows the opponent: the cooldown runs at 1/(1 + 50 %)', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 1, NO_MATCH.map((r, i) => (i === 4 ? '2s 2 3 2 0 3 4 5' : r)));
  game.opponent.health = 1000;
  L.trySwap(game, [4, 2], [4, 3]);
  run(L, game, 1);
  assert.ok(L.hasMod(game.opponent, 'slow'));
  game.opponent.cooldown = 3;
  run(L, game, 1.5);
  assert.ok(Math.abs(game.opponent.cooldown - 2) < 0.05, `cooldown ${game.opponent.cooldown}`);
});

test('Vengeful Spirit: Nether Swap turns one hero\'s gems into hers; Magic Missile stuns 2 s', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 1, NO_MATCH.map((r, i) => (i === 7 ? '4u 4 3 4 0 1 2 5' : r)));
  L.trySwap(game, [7, 2], [7, 3]);
  const events = run(L, game, 0.3);
  const converted = events.filter((e) => e.type === 'convert');
  assert.ok(converted.length >= 8);
  assert.ok(converted.every((e) => e.hero === 4));
  const g2 = fight(L, config, 1, NO_MATCH.map((r, i) => (i === 7 ? '4s 4 3 4 0 1 2 5' : r)));
  g2.opponent.health = 1000;
  L.trySwap(g2, [7, 2], [7, 3]);
  run(L, g2, 1.5);
  assert.ok(L.hasMod(g2.opponent, 'stun'));
});

test('Winter Wyvern: Cold Embrace heals 150 over 8 s and blocks physical damage', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 0, NO_MATCH.map((r, i) => (i === 7 ? '5u 5 3 5 0 1 2 4' : r)));
  game.player.health = 500;
  L.trySwap(game, [7, 2], [7, 3]);
  const events = run(L, game, 8.5);
  assert.ok(Math.abs(game.player.health - 650) < 1, `health ${game.player.health}`);
  assert.ok(events.some((e) => e.type === 'blocked' && e.unit === 'player'), 'the creep\'s attacks are blocked');
});

test('Broodmother: Insatiable Hunger heals 200 % of the match damage', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 1, NO_MATCH.map((r, i) => (i === 7 ? '1s 1 3 1 0 2 4 5' : r)));
  game.opponent.health = 1000; game.player.health = 500; game.opponent.current.cooldown = 99; game.opponent.cooldown = 99;
  L.trySwap(game, [7, 2], [7, 3]);
  const events = run(L, game, 1.5);
  // 3 gems matched (with the super gem) → 3 damage → 6 health
  const healed = events.filter((e) => e.type === 'heal' && e.source === 'insatiable_hunger').reduce((sum, e) => sum + e.amount, 0);
  assert.equal(healed, 6);
});

test('Lich: Chain Frost flies 13 times: the opponent at n = 12, 9, 6, 3, 0 (first and last), 8 gems', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 1, NO_MATCH.map((r, i) => (i === 7 ? '3u 3 0 3 1 2 4 5' : r)));
  game.opponent.health = 1000; game.opponent.cooldown = 99;
  L.trySwap(game, [7, 2], [7, 3]);
  const events = run(L, game, 12);
  const hits = events.filter((e) => e.type === 'opponentDamage' && e.source === 'lich_chain_frost');
  assert.equal(hits.length, 5); assert.ok(hits.every((e) => e.amount === 15));
  assert.equal(events.filter((e) => e.type === 'clear' && e.cause === 'lich_chain_frost').length, 8);
  // the first flight goes to the opponent
  const first = events.find((e) => (e.type === 'opponentDamage' && e.source === 'lich_chain_frost') || (e.type === 'clear' && e.cause === 'lich_chain_frost'));
  assert.equal(first.type, 'opponentDamage');
});

test('the opponent\'s queue: basic attacks every 3 s for 20–30 (Dire melee creep)', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 0, NO_MATCH);
  const events = run(L, game, 12.5);
  const hits = events.filter((e) => e.type === 'playerDamage');
  assert.ok(hits.length >= 3 && hits.length <= 5, `${hits.length} hits`);
  assert.ok(hits.every((e) => e.amount >= 20 && e.amount <= 30));
  assert.equal(L.actionQueue(game)[0].action, 'basic_attack');
});

test('Chaos Knight: Chaos Bolt stuns the user 3 s; Chaos Strike crits and heals him', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 2, NO_MATCH);
  game.player.health = 10000; game.player.maxHealth = 10000;
  game.opponent.health = 200;
  const events = run(L, game, 30);
  assert.ok(events.some((e) => e.type === 'modifier' && e.name === 'stun'), 'stunned by Chaos Bolt');
  const strike = events.find((e) => e.type === 'playerDamage' && e.source === 'chaos_strike');
  assert.ok(strike && strike.kind === 'crit' && strike.amount >= 60 && strike.amount <= 80, JSON.stringify(strike));
  assert.ok(events.some((e) => e.type === 'opponentHeal'));
});

test('a stunned user cannot swap', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 0, ['0 0 1 0 2 3 4 5', ...NO_MATCH.slice(1)]);
  game.player.mods.push({ name: 'stun', left: 3, duration: 3, tick: 0 });
  assert.equal(L.trySwap(game, [0, 2], [0, 3]), null);
  run(L, game, 3.2);
  assert.equal(L.trySwap(game, [0, 2], [0, 3]), 'swap');
});

test('Cold Feet: five matches dispel it, otherwise a 4-s stun', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 6, NO_MATCH);
  game.player.health = 10000;
  // put Cold Feet on directly
  const action = config.opponents.match3_opponent_angry_icicle.repeat.find((a) => a.action === 'cold_feet');
  game.opponent.actionIndex = config.opponents.match3_opponent_angry_icicle.repeat.indexOf(action); game.opponent.current = action; game.opponent.cooldown = 0.01;
  run(L, game, 0.6);
  assert.ok(L.hasMod(game.player, 'cold_feet'));
  run(L, game, 5);
  assert.ok(L.hasMod(game.player, 'stun'));
});

test('Gust silences: ability gems do not match', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 0, ['0s 0 3 0 2 3 4 5', ...NO_MATCH.slice(1)]);
  game.player.mods.push({ name: 'gust', left: 10, duration: 10, tick: 0 });
  assert.equal(L.trySwap(game, [0, 2], [0, 3]), 'refused', 'only two gems can match');
});

test('Frost Attack slows the board: a swap takes 4× as long', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 0, ['0 0 1 0 2 3 4 5', ...NO_MATCH.slice(1)]);
  game.player.mods.push({ name: 'frost_attack', left: 10, duration: 10, tick: 0, slow: 300 });
  L.trySwap(game, [0, 2], [0, 3]);
  run(L, game, 0.3);
  assert.equal(game.matches, 0, 'still swapping');
  run(L, game, 0.6);
  assert.equal(game.matches, 1);
});

test('Body Slam throws every gem off; new ones come after the wait', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 9, NO_MATCH);
  game.player.health = 10000;
  const action = config.opponents.match3_opponent_ancient_frostbitten_golem.repeat.find((a) => a.action === 'butt_slam');
  game.opponent.current = action; game.opponent.actionIndex = 2; game.opponent.cooldown = 0.01;
  run(L, game, 0.5);
  assert.ok(game.grid.every((row) => row.every((p) => p === null)));
  assert.equal(game.flying.length, 64);
  run(L, game, 3.5);
  assert.ok(game.grid.every((row) => row.every((p) => p)));
});

test('out of moves: the board is shuffled into one with a move', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 0, [
    '0 1 0 1 0 1 0 1', '2 3 2 3 2 3 2 3', '4 5 4 5 4 5 4 5', '1 0 1 0 1 0 1 0',
    '3 2 3 2 3 2 3 2', '5 4 5 4 5 4 5 4', '0 1 0 1 0 1 0 1', '2 3 2 3 2 3 2 3']);
  assert.equal(L.findMove(game.grid.map((row) => row.map((p) => p.hero))), null);
  const events = run(L, game, 2.5);
  assert.ok(events.some((e) => e.type === 'outOfMoves'));
  assert.ok(events.some((e) => e.type === 'shuffle'));
  run(L, game, 1);
  assert.ok(L.findMove(game.grid.map((row) => row.map((p) => p.hero))));
});

test('the combo grows by one a group and only picks the sound; the score stays the table\'s', async () => {
  const { L, config } = await setup();
  const g = L.createGame(config, { seed: 3, countdown: false });
  const events = [];
  for (let i = 0; i < 6000 && !events.some((e) => e.type === 'match' && e.combo >= 2); i++) {
    events.push(...L.step(g, 1 / 60));
    if (i % 30 === 0 && L.canPlay(g)) { const m = L.findMove(g.grid.map((row) => row.map((p) => (p && p.state === 'idle' ? p.hero : null)))); if (m) L.trySwap(g, m[0], m[1]); }
  }
  const second = events.find((e) => e.type === 'match' && e.combo >= 2);
  assert.ok(second, 'a cascade happened');
  assert.equal(second.score, L.matchScore(second.count));
  assert.ok(events.some((e) => e.type === 'sound' && /^match3\.piece_matched\.[2-8]$/.test(e.name)));
});

test('the campaign: the Winter Cleric heals 300 and leaves; a beaten opponent gives its completion score', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 2, NO_MATCH);
  game.player.health = 400;
  game.opponent.health = 1; // the Chaos Knight
  const score = game.score;
  // one match attack finishes him
  board(L, game, ['0 0 1 0 2 3 4 5', ...NO_MATCH.slice(1)]);
  L.trySwap(game, [0, 2], [0, 3]);
  const events = run(L, game, 3);
  assert.ok(events.some((e) => e.type === 'opponentDefeated' && e.score === 500));
  assert.ok(game.score >= score + 500);
  assert.equal(game.level, 3); // the Winter Cleric
  run(L, game, 12);
  assert.ok(game.player.health >= 690, `healed to ${game.player.health}`);
  assert.equal(game.level, 4, 'the next chapter');
});

test('losing all health ends the game; beating the Dragon King wins it', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 0, NO_MATCH);
  game.player.health = 5;
  const events = run(L, game, 5);
  assert.ok(events.some((e) => e.type === 'lost'));
  assert.equal(game.phase, 'lost');
  const g2 = fight(L, config, 12, ['0 0 1 0 2 3 4 5', ...NO_MATCH.slice(1)]);
  g2.opponent.health = 1; g2.player.health = 10000;
  L.trySwap(g2, [0, 2], [0, 3]);
  const e2 = run(L, g2, 4);
  assert.ok(e2.some((e) => e.type === 'won'));
  assert.ok(g2.score >= 2000);
});

test('a bot playing a move a second gets a score like the users\' (10–20 k), a quick one clears the campaign', async () => {
  const { L, config } = await setup();
  const play = (seed, every) => {
    const game = L.createGame(config, { seed });
    let next = 0;
    for (let t = 0; t < 900 && (game.phase === 'active' || game.phase === 'countdown'); t += 1 / 30) {
      L.step(game, 1 / 30);
      if (game.time >= next && L.canPlay(game)) {
        const m = L.findMove(game.grid.map((row) => row.map((p) => (p && p.state === 'idle' ? p.hero : null))));
        if (m) { L.trySwap(game, m[0], m[1]); next = game.time + every; }
      }
    }
    return game;
  };
  const slow = play(1, 1);
  assert.equal(slow.phase, 'lost');
  assert.ok(slow.score > 3000 && slow.score < 30000, `slow ${slow.score}`);
  const quick = play(2, 0.3);
  assert.equal(quick.phase, 'won');
  assert.ok(quick.score > 30000 && quick.score < 80000, `quick ${quick.score}`);
});

test('every sound event the game plays is in sounds.json; the sprites exist', async () => {
  const sounds = require('../assets/minigames/chess/sounds.json');
  const src = fs.readFileSync(path.join(__dirname, '../src/minigames/games/chess/logic.mjs'), 'utf8') + fs.readFileSync(path.join(__dirname, '../src/minigames/games/chess/Chess.jsx'), 'utf8');
  const used = [...new Set(src.match(/match3\.[a-z0-9_.]+[a-z0-9]/gi))].filter((n) => !n.endsWith('.piece_matched.'));
  for (const name of used) assert.ok(sounds.events[name], name);
  const sprites = JSON.parse(fs.readFileSync(path.join(ASSETS, 'sprites/sprites.json'), 'utf8'));
  assert.ok(fs.existsSync(path.join(ASSETS, 'sprites', sprites.gems.file)));
  assert.equal(sprites.gems.heroes.length, 6);
  for (const o of Object.values(sprites.opponents)) assert.ok(fs.existsSync(path.join(ASSETS, 'sprites', o.file)), o.file);
});

test('the score table (client.dll FUN_182b87fc0): 50/100/200/500/1000 a group, +150/+450 an ability gem', async () => {
  const { L } = await setup();
  assert.deepEqual([3, 4, 5, 6, 7, 9].map(L.matchScore), [50, 100, 200, 500, 1000, 1000]);
  assert.deepEqual(L.ABILITY_SCORE, { super: 150, ultra: 450 });
});

test('a matched super gem adds 150; gems destroyed by its ability add nothing', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 1, NO_MATCH.map((r, i) => (i === 4 ? '2s 2 3 2 0 3 4 5' : r)));
  game.opponent.health = 1000; game.opponent.cooldown = 99;
  const before = game.score;
  L.trySwap(game, [4, 2], [4, 3]);
  const events = run(L, game, 0.25); // before anything that fell in can match
  const nova = events.filter((e) => e.type === 'clear' && e.cause === 'crystal_maiden_crystal_nova');
  assert.ok(nova.length >= 3, 'Crystal Nova took the neighbours at once');
  assert.equal(game.score - before, 50 + 150);
  assert.equal(events.find((e) => e.type === 'ability')?.score, 150);
});

test('the upgraded gem appears at the group\'s median (least sum of Manhattan distances)', async () => {
  const { L } = await setup();
  const at = (cells) => cells.map(([r, c]) => ({ r, c }));
  const pos = (p) => [p.r, p.c];
  assert.deepEqual(pos(L.upgradeTarget(at([[0, 0], [0, 1], [0, 2], [0, 3]]))), [0, 1], '4 in a row: the second');
  assert.deepEqual(pos(L.upgradeTarget(at([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]))), [0, 2], '5 in a row: the centre');
  assert.deepEqual(pos(L.upgradeTarget(at([[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]]))), [0, 0], 'L: the corner');
  assert.deepEqual(pos(L.upgradeTarget(at([[1, 0], [1, 1], [1, 2], [0, 1], [2, 1]]))), [1, 1], 'T/+: the crossing');
});

test('slows add up: Crystal Nova 50 % + Frost Nova 100 % → the opponent\'s clock at 1/2.5', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 1, NO_MATCH);
  game.opponent.mods.push({ name: 'slow', left: 6, duration: 6, pct: 50 }, { name: 'slow', left: 3, duration: 3, pct: 100 });
  assert.equal(L.opponentTimeScale(game.opponent), 1 / 2.5);
  game.opponent.cooldown = 5;
  run(L, game, 1);
  assert.ok(Math.abs(game.opponent.cooldown - 4.6) < 0.02, `cooldown ${game.opponent.cooldown}`);
  game.opponent.mods.push({ name: 'slow', left: 9, duration: 9, pct: 2000 });
  assert.equal(L.opponentTimeScale(game.opponent), 0.1, 'clamped to 10×');
});

test('a stun throws the interrupted action away: the next one\'s cooldown starts', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 2, NO_MATCH); // the Chaos Knight: six actions
  game.player.health = 10000; game.player.maxHealth = 10000;
  while (!game.opponent.current) L.step(game, 1 / 60);
  game.opponent.cooldown = 2;
  const index = game.opponent.actionIndex;
  game.opponent.mods.push({ name: 'stun', left: 0.5, duration: 0.5, tick: 0 });
  run(L, game, 0.6);
  const repeat = config.opponents.match3_opponent_chaos_knight.repeat;
  assert.equal(game.opponent.actionIndex, (index + 1) % repeat.length);
  assert.ok(game.opponent.cooldown > repeat[(index + 1) % repeat.length].cooldown - 0.2);
});

test('Hypothermia is magical: Cold Embrace does not block it', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 8, NO_MATCH);
  game.player.health = 10000; game.player.maxHealth = 10000;
  game.player.mods.push({ name: 'cold_embrace', left: 30, duration: 30, tick: 0 });
  const repeat = game.opponent.def.repeat, i = repeat.findIndex((a) => a.action === 'hypothermia');
  if (i < 0) return; // (not this opponent's action)
  game.opponent.actionIndex = i; game.opponent.current = repeat[i]; game.opponent.cooldown = 0.01;
  const events = run(L, game, 0.6);
  assert.ok(events.some((e) => e.type === 'playerDamage' && e.source === 'hypothermia' && e.kind === 'magic'));
});

test('Nether Swap picks a random gem of another hero (a hero with more gems is likelier)', async () => {
  const { L, config } = await setup();
  const tally = {};
  for (let seed = 1; seed <= 60; seed++) {
    const game = L.createGame(config, { seed, countdown: false, startLevel: 1 });
    run(L, game, 8);
    // one hero (0) owns most of the board, hero 1 a single gem; the Vengeful Spirit ultra at (7, 0)
    board(L, game, ['0 0 2 0 0 2 0 0', '2 0 0 2 0 0 2 0', '0 2 0 0 2 0 0 2', '0 0 2 0 0 2 0 0', '2 0 0 2 0 0 2 0', '0 2 0 0 2 0 0 2', '0 0 2 0 0 2 0 1', '4u 4 3 4 2 0 2 0']);
    game.events.length = 0;
    L.trySwap(game, [7, 2], [7, 3]);
    const converted = run(L, game, 0.25).filter((e) => e.type === 'convert');
    const was = converted.length > 3 ? 'many' : converted.length ? 'few' : 'none';
    tally[was] = (tally[was] || 0) + 1;
  }
  assert.ok((tally.many || 0) > (tally.few || 0) * 3, JSON.stringify(tally));
});

test('the board: gravity 50 cells/s² without a speed limit, a hint 5 s after it settles', async () => {
  const { L, config } = await setup();
  const game = fight(L, config, 0, ['0 0 1 0 2 3 4 5', ...NO_MATCH.slice(1)]);
  game.opponent.cooldown = 99; game.player.health = 10000;
  game.lastMove = game.time;
  const events = run(L, game, 4.9);
  assert.ok(!events.some((e) => e.type === 'hint'));
  const more = run(L, game, 0.3);
  assert.ok(more.some((e) => e.type === 'hint'));
  // a piece dropped from 8 cells above takes sqrt(2·8/50) ≈ 0.566 s
  const g = fight(L, config, 0, NO_MATCH);
  g.opponent.cooldown = 99;
  const p = g.grid[7][7]; Object.assign(p, { state: 'fall', y: -1, vy: 0 });
  let t = 0; while (p.state === 'fall' && t < 2) { L.step(g, 1 / 120); t += 1 / 120; }
  assert.ok(Math.abs(t - Math.sqrt(2 * 8 / 50)) < 0.02, `fell in ${t}`);
});
