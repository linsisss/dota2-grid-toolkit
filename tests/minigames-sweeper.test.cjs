const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../assets/minigames/sweeper/data.json');
const logic = import('../src/minigames/games/sweeper/logic.mjs');

// A repeatable random source (mulberry32).
function seeded(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const never = () => 0.999;  // no item ever drops (every roll fails)

// A board with mines at fixed places, for exact checks.
async function fixed(rows, cols, mines, config) {
  const { createGame, createBoard, countAdjacent } = await logic;
  const game = createGame(config, never);
  game.board = createBoard({ rows, cols, mines: mines.length }, never);
  for (const cell of game.board.cells) cell.mine = false;
  for (const index of mines) game.board.cells[index].mine = true;
  countAdjacent(game.board); game.board.first = false;
  return game;
}

test('Valve data → config: 5 stages, 180 s, scoring 15 / 4000 / 20', async () => {
  const { sweeperConfig } = await logic;
  const config = sweeperConfig(data.game);
  assert.deepEqual(config.stages.map((s) => [s.rows, s.cols, s.mines]), [[9, 9, 10], [11, 12, 19], [13, 15, 32], [14, 18, 47], [16, 20, 66]]);
  assert.equal(config.timeLimit, 180); assert.equal(config.stageBonusTime, 15); assert.equal(config.mana, 250); assert.equal(config.illusionCost, 50);
  assert.deepEqual(config.score, { cell: 15, stage: 4000, second: 20 });
  assert.equal(config.items.timer.amount, 30); assert.equal(config.items.mana.amount, 25);
});

test('the first click (client.dll): mines laid before it; the field is laid again until the click is a zero opening ≥ 10 % and no rectangle (20 tries)', async () => {
  const { sweeperConfig, createGame, reveal, neighbours, isRectangle } = await logic;
  const config = sweeperConfig(data.game);
  assert.equal(config.openThreshold, 0.1); assert.equal(config.setupRetries, 20);
  for (let seed = 1; seed <= 200; seed++) {
    const game = createGame(config, seeded(seed));
    assert.equal(game.board.cells.filter((cell) => cell.mine).length, 10, 'laid at once');
    const at = Math.floor(seeded(seed + 999)() * 81);
    const events = reveal(game, at);
    assert.equal(game.phase === 'lost', false, `seed ${seed}`);
    const { board } = game;
    assert.equal(board.cells.filter((cell) => cell.mine).length, 10);
    assert.equal(board.cells[at].mine, false);
    assert.equal(board.cells[at].adjacent, 0);
    for (const other of neighbours(board, at)) assert.equal(board.cells[other].mine, false);
    if (board.retries < 20) {
      assert.ok(events[0].cells.length >= 81 * 0.1, `seed ${seed}: ${events[0].cells.length}`);
      assert.equal(isRectangle(board, new Set(events[0].cells)), false);
    }
    board.cells.forEach((cell, index) => assert.equal(cell.adjacent, neighbours(board, index).filter((o) => board.cells[o].mine).length));
  }
  const board = { rows: 3, cols: 3 };
  assert.equal(isRectangle(board, new Set([0, 1, 3, 4])), true);
  assert.equal(isRectangle(board, new Set([0, 1, 3, 4, 5])), false);
});

test('flood fill opens zeros and their border, never past numbers or flags', async () => {
  const { reveal, flag, sweeperConfig } = await logic;
  // 4×4, one mine in the corner (index 15). Flag at 0 stays closed.
  const game = await fixed(4, 4, [15], sweeperConfig(data.game));
  flag(game, 0);
  reveal(game, 5);
  const open = game.board.cells.map((cell) => (cell.revealed ? 1 : 0)).join('');
  assert.equal(open, '0111111111111110');
  assert.equal(game.cellsRevealed, 14);
  assert.equal(game.phase, 'running');  // the flagged safe cell is still closed
  reveal(game, 0);  // a flagged cell does not open
  assert.equal(game.board.cells[0].revealed, false);
  flag(game, 0); reveal(game, 0);
  assert.equal(game.phase, 'stageWon');
  assert.equal(game.board.cells[15].flagged, true, 'mines are flagged when a stage is cleared');
});

test('chords: left opens when flags match, right flags when closed cells match; failures lead to a cooldown', async () => {
  const { reveal, flag, tick, sweeperConfig } = await logic;
  const config = sweeperConfig(data.game);
  // 3×3, mine at 0. Open the centre by hand (it is a 1).
  const game = await fixed(3, 3, [0], config);
  reveal(game, 4);
  assert.equal(game.board.cells[4].revealed, true);
  assert.equal(game.board.cells[1].revealed, false, 'a number does not flood');
  // right chord: 8 closed around, number 1 — fails
  assert.equal(flag(game, 4)[0].type, 'invalid');
  // left chord without the flag — fails
  assert.equal(reveal(game, 4)[0].type, 'invalid');
  flag(game, 0);
  const events = reveal(game, 4);
  assert.equal(events[0].type, 'reveal'); assert.equal(events[0].chord, true);
  assert.equal(game.phase, 'stageWon');
  // right chord on a fresh 2×2 with mines at 0 and 1: the number 2 at 2 flags both
  const second = await fixed(2, 2, [0, 1], config);
  second.board.cells[2].revealed = true; second.board.cells[3].revealed = true;  // a stage still running
  const flagged = flag(second, 2);
  assert.deepEqual(flagged[0].cells.sort(), [0, 1]);
  // six failed chords → the board rests
  const third = await fixed(3, 3, [0], config);
  reveal(third, 4);
  for (let i = 0; i < 5; i++) reveal(third, 4);
  assert.equal(third.cooldown, 0);
  const sixth = reveal(third, 4);
  assert.ok(sixth.some((event) => event.type === 'cooldown'));
  assert.equal(third.cooldown, 5);
  assert.equal(third.chordFails, 0, 'six taken off the counter');
  // the rest blocks only chords: a chord does nothing (and is no failure), a closed cell still opens, flags still go
  assert.ok(!reveal(third, 4).some((event) => event.type === 'invalid'));
  assert.equal(third.chordFails, 0);
  assert.ok(flag(third, 0).some((event) => event.type === 'flag'));
  assert.ok(reveal(third, 1).some((event) => event.type === 'reveal'));
  tick(third, 5);
  assert.equal(third.cooldown, 0);
  // a successful right chord does not reset the counter; an opening left click does
  const fourth = await fixed(3, 3, [0], config);
  reveal(fourth, 4); reveal(fourth, 4); reveal(fourth, 4);
  assert.equal(fourth.chordFails, 2);
  fourth.board.cells.forEach((cell, i) => { if (i !== 0) cell.revealed = true; });
  fourth.board.cells[4].revealed = true;
  flag(fourth, 1); // 1 closed neighbour (0), number 1: flags it
  assert.equal(fourth.chordFails, 2);
});

test('a mine ends the game; Echo Slash removes a mine for 50 mana', async () => {
  const { reveal, echoSlash, toggleIllusion, sweeperConfig, score } = await logic;
  const config = sweeperConfig(data.game);
  const game = await fixed(3, 3, [0, 6, 8], config);
  reveal(game, 2);  // floods 2, 1, 5, 4
  toggleIllusion(game);
  assert.equal(game.illusion, true);
  const events = reveal(game, 0);
  assert.ok(events.some((event) => event.type === 'illusionExplode'));
  assert.equal(game.mana, 200); assert.equal(game.illusion, false);
  assert.equal(game.board.mines, 2); assert.equal(game.board.cells[1].adjacent, 0, 'the number around drops');
  assert.equal(game.board.cells[0].revealed, true);
  assert.equal(game.board.cells[3].revealed, true, 'the cleared cell is a zero now: its area opened (client.dll)');
  assert.equal(echoSlash(game, 3).length, 0, 'only on a closed cell');
  assert.equal(game.mana, 200);
  reveal(game, 8);
  assert.equal(game.phase, 'lost');
  const result = score(game);
  assert.equal(result.secondsScore, 0, 'no time bonus on a loss');
  assert.equal(result.total, result.cells * 15);
});

test('items (client.dll): each closed neighbour of an opened cell rolls once a stage (Clarity first, then the clock)', async () => {
  const { sweeperConfig, createGame, reveal } = await logic;
  const config = sweeperConfig(data.game);
  config.items.timer.chance = 100; config.items.mana.chance = 0;
  const game = createGame(config, seeded(7));
  const events = reveal(game, 40);
  const opened = new Set(events[0].cells);
  const items = game.board.cells.filter((cell) => cell.item);
  assert.equal(items.length, config.items.timer.max);
  assert.ok(items.every((cell) => cell.item.clicks === 5 && !cell.revealed));
  // each one sits right next to an opened cell
  const { neighbours } = await logic;
  for (const [index, cell] of game.board.cells.entries()) if (cell.item) assert.ok(neighbours(game.board, index).some((o) => opened.has(o)));
  // a cell that rolled never rolls again
  const rolled = game.board.cells.filter((cell) => !cell.roll).length;
  assert.ok(rolled >= 3);
  // Clarity first: with both at 100 the first rolls are Clarity until 5 lie on the board
  const both = sweeperConfig(data.game);
  both.items.timer.chance = 100; both.items.mana.chance = 100;
  const g2 = createGame(both, seeded(7));
  reveal(g2, 40);
  assert.equal(g2.board.cells.filter((cell) => cell.item?.type === 'mana').length, 5);
  assert.equal(g2.board.cells.filter((cell) => cell.item?.type === 'timer').length, 3);
});

test('items count down on every left click (even one that opens nothing), not on flags; a hop costs a click and prefers cells by opened ones', async () => {
  const { sweeperConfig, reveal, flag } = await logic;
  const config = sweeperConfig(data.game);
  config.items.timer.chance = 0; config.items.mana.chance = 0;
  const g = await fixed(5, 5, [24, 23, 18], config);
  reveal(g, 0);
  assert.equal(g.phase, 'running');
  const closed = g.board.cells.map((cell, i) => i).filter((i) => !g.board.cells[i].revealed);
  const spot = closed.find((i) => !g.board.cells[i].mine) ?? closed[0];
  g.board.cells[spot].item = { type: 'mana', clicks: 3 };
  // a left click on a flagged cell opens nothing but counts
  const flagCell = closed.find((i) => i !== spot);
  flag(g, flagCell);
  assert.equal(g.board.cells[spot].item.clicks, 3, 'flags are not clicks');
  reveal(g, flagCell);
  assert.equal(g.board.cells[spot].item.clicks, 2, 'a click that opened nothing still counts');
  // the hop: one click less, onto a closed cell next to an opened one
  const hop = flag(g, spot).find((event) => event.type === 'itemMove');
  assert.ok(hop && hop.from === spot && hop.index !== spot);
  const to = g.board.cells[hop.index];
  assert.deepEqual(to.item, { type: 'mana', clicks: 1 });
  assert.ok(!to.revealed && !to.flagged && !to.roll);
  // with one click left the hop loses it
  flag(g, spot);
  g.board.cells[hop.index].item = null; g.board.cells[spot].item = { type: 'mana', clicks: 1 };
  assert.ok(flag(g, spot).some((event) => event.type === 'itemLost'));
});

test('Echo Slash on a mine: it is gone and the cell opens with its area when it is now a zero', async () => {
  const { sweeperConfig, echoSlash } = await logic;
  const config = sweeperConfig(data.game);
  const game = await fixed(4, 4, [0, 15], config);
  const events = echoSlash(game, 0);
  assert.ok(events.some((event) => event.type === 'illusionExplode'));
  assert.ok(game.board.cells[1].revealed && game.board.cells[4].revealed && game.board.cells[5].revealed, 'the zero opened its area');
});

test('stages: clearing one adds 15 s and the next field; the last one wins with the time bonus', async () => {
  const { sweeperConfig, createGame, reveal, nextStage, tick, score } = await logic;
  const config = sweeperConfig(data.game);
  config.items.timer.chance = 0; config.items.mana.chance = 0;
  const game = createGame(config, seeded(3));
  const clear = () => {
    reveal(game, 0);
    game.board.cells.forEach((cell, index) => { if (!cell.mine && !cell.revealed && game.phase === 'running') reveal(game, index); });
  };
  for (let stage = 0; stage < 5; stage++) {
    assert.equal(game.stage, stage);
    const { rows, cols } = config.stages[stage];
    assert.equal(game.board.cells.length, rows * cols);
    tick(game, 10);
    const before = game.timeLeft;
    clear();
    if (stage < 4) {
      assert.equal(game.phase, 'stageWon');
      tick(game, 3);  // time stands while the stage result is shown
      assert.equal(game.timeLeft, before);
      nextStage(game);
      assert.equal(game.timeLeft, before + 15);
    }
  }
  assert.equal(game.phase, 'won');
  const result = score(game);
  assert.equal(result.cells, 71 + 113 + 163 + 205 + 254);
  assert.equal(result.stagesScore, 20000);
  assert.equal(result.seconds, Math.floor(game.timeLeft));
  assert.equal(result.total, result.cells * 15 + 20000 + result.seconds * 20);
});

test('time running out loses the game', async () => {
  const { sweeperConfig, createGame, tick, formatTime } = await logic;
  const game = createGame(sweeperConfig(data.game), never);
  assert.equal(formatTime(game.timeLeft), '03:00');
  tick(game, 0.4);
  assert.equal(formatTime(game.timeLeft), '03:00');
  tick(game, 180);
  assert.equal(game.phase, 'lost'); assert.equal(game.lost, 'time');
});

test('Echo Slash on a mine: opened cells that drop to 0 open their closed neighbours (no 0 left next to a closed cell)', async () => {
  const L = await logic;
  for (let seed = 1; seed < 120; seed++) {
    const config = L.sweeperConfig(data.game); config.items.timer.chance = 0; config.items.mana.chance = 0;
    const game = L.createGame(config, seeded(seed)), board = game.board;
    L.reveal(game, 40);
    const mine = board.cells.findIndex((cell, i) => cell.mine && !cell.revealed && L.neighbours(board, i).some((n) => board.cells[n].revealed));
    if (mine < 0) continue;
    L.toggleIllusion(game); L.echoSlash(game, mine);
    const stuck = board.cells.findIndex((cell, i) => cell.revealed && !cell.mine && cell.adjacent === 0 && L.neighbours(board, i).some((n) => !board.cells[n].revealed && !board.cells[n].flagged));
    assert.equal(stuck, -1, `seed ${seed}: a 0 at ${stuck} next to a closed cell`);
  }
});
