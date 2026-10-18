// «Сапёр Сплин»: the rules, without any drawing (tests/minigames-sweeper.test.cjs). The numbers come
// from Valve's game.vdata (assets/minigames/sweeper/data.json → sweeperConfig); the rules the data does not
// hold — the first click's board, where items appear, the click countdown, the hop off a flag, the rest after
// failed chords, Echo Slash — are Valve's own code from client.dll (docs/minigames/reverse/sweeper.md).
//
// The game is one mutable object; every action returns the events it caused (sounds, effects, phase
// changes) so the view can react, and the view redraws from the object.

export function sweeperConfig(game = {}) {
  const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  return {
    timeLimit: num(game.m_flTimeLimit, 180),
    stageBonusTime: num(game.m_nStageProgressionTimerIncrease, 15),
    mana: num(game.m_player?.m_nInitialMana, 250),
    illusionCost: num(game.m_nIllusionManaCost, 50),
    stages: (game.m_vecStages || [{ m_nBoardRows: 9, m_nBoardCols: 9, m_nMines: 10 }])
      .map((stage) => ({ rows: stage.m_nBoardRows, cols: stage.m_nBoardCols, mines: stage.m_nMines })),
    items: {
      mana: { amount: num(game.m_nManaPotRestoration, 25), max: num(game.m_nMaxConcurrentManaPots, 5), expire: num(game.m_nManaPotExpireClicks, 5), chance: num(game.m_nManaPotChance, 4) },
      timer: { amount: num(game.m_flTimeExtension, 30), max: num(game.m_nMaxConcurrentTimerIncreases, 3), expire: num(game.m_nTimerIncreaseExpireClicks, 5), chance: num(game.m_nTimerIncreaseChance, 3) },
    },
    score: { cell: num(game.m_nScorePerCellRevealed, 15), stage: num(game.m_nScorePerStageCleared, 4000), second: num(game.m_nScorePerSecondsRemaining, 20) },
    chordFails: num(game.m_nFailedChordClickTimes, 6),
    chordCooldown: num(game.m_flFailedChordClickCooldown, 5),
    // client.dll convars: dota_minesweeper_minimum_board_open_threshold, dota_minesweeper_max_board_setup_retries
    openThreshold: 0.1, setupRetries: 20,
  };
}

export function neighbours(board, index) {
  const { rows, cols } = board, row = Math.floor(index / cols), col = index % cols, list = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const r = row + dr, c = col + dc;
    if (r >= 0 && r < rows && c >= 0 && c < cols) list.push(r * cols + c);
  }
  return list;
}

// A fresh field (FUN_182bca7c0): grass of 4 kinds, the mines laid at once, uniformly (a random row and column,
// again if taken). Every cell may roll for an item once (`roll`).
export function createBoard({ rows, cols, mines }, random = Math.random) {
  const cells = Array.from({ length: rows * cols }, () => ({ mine: false, adjacent: 0, revealed: false, flagged: false, item: null, variant: 1 + Math.floor(random() * 4), blast: false, roll: true }));
  const board = { rows, cols, mines, cells, laid: false, first: true, retries: 0 };
  layMines(board, random);
  return board;
}
export function layMines(board, random = Math.random) {
  for (const cell of board.cells) cell.mine = false;
  const n = Math.min(board.mines, board.cells.length);
  for (let i = 0; i < n; i++) {
    let index, tries = 0;
    do index = Math.floor(random() * board.rows) * board.cols + Math.floor(random() * board.cols);
    while (board.cells[index].mine && ++tries < 1000);
    while (board.cells[index].mine) index = (index + 1) % board.cells.length; // (a degenerate random source)
    board.cells[index].mine = true;
  }
  countAdjacent(board);
  board.laid = true;
}
// The cells a click on `start` would open (the flood without touching the board).
function openedFrom(board, start) {
  const seen = new Set(), stack = [start];
  while (stack.length) {
    const index = stack.pop(), cell = board.cells[index];
    if (seen.has(index) || cell.mine || cell.flagged) continue;
    seen.add(index);
    if (cell.adjacent === 0) for (const other of neighbours(board, index)) if (!seen.has(other)) stack.push(other);
  }
  return seen;
}
// Is an opened area a plain rectangle (every row with opened cells has the same count and first column)?
export function isRectangle(board, opened) {
  let width = null, first = null;
  for (let r = 0; r < board.rows; r++) {
    let count = 0, start = -1;
    for (let c = 0; c < board.cols; c++) if (opened.has(r * board.cols + c)) { count++; if (start < 0) start = c; }
    if (!count) continue;
    if (width === null) { width = count; first = start; } else if (count !== width || start !== first) return false;
  }
  return true;
}
// The first left click (FUN_182bc5d00): it stands only on a mine-free zero that opens at least 10 % of the field
// and not as a plain rectangle; otherwise the whole field is laid again and the click tried again. After 20 tries
// any mine-free zero will do (a mine or a number always means another try).
export function firstClick(board, index, config, random = Math.random) {
  const total = board.rows * board.cols;
  for (let guard = 0; guard < 100000; guard++) {
    const cell = board.cells[index];
    if (!cell.mine && cell.adjacent < 1) {
      if (board.retries >= config.setupRetries) break;
      const opened = openedFrom(board, index);
      if (opened.size / total >= config.openThreshold && !isRectangle(board, opened)) break;
    }
    layMines(board, random);
    board.retries++;
  }
  board.first = false;
}

export function countAdjacent(board) {
  board.cells.forEach((cell, index) => { cell.adjacent = neighbours(board, index).filter((other) => board.cells[other].mine).length; });
}

export const minesLeft = (board) => board.mines - board.cells.filter((cell) => cell.flagged && !cell.revealed).length;
export const safeLeft = (board) => board.cells.filter((cell) => !cell.mine && !cell.revealed).length;

export function createGame(config, random = Math.random) {
  const game = { config, random, stage: 0, phase: 'running', timeLeft: config.timeLimit, mana: config.mana, cellsRevealed: 0, stagesCleared: 0, chordFails: 0, cooldown: 0, illusion: false, lost: null, board: null, last: -1 };
  game.board = createBoard(config.stages[0], random);
  return game;
}

// Opens a cell and, from a zero, everything around it. Returns the cells opened.
function flood(game, start) {
  const { board } = game, opened = [], stack = [start];
  while (stack.length) {
    const index = stack.pop(), cell = board.cells[index];
    if (cell.revealed || cell.mine) continue;
    cell.revealed = true; cell.flagged = false;
    opened.push(index);
    if (cell.adjacent === 0) for (const other of neighbours(board, index)) if (!board.cells[other].revealed && !board.cells[other].flagged) stack.push(other);
  }
  game.cellsRevealed += opened.length;
  return opened;
}

const canPlay = (game) => game.phase === 'running';
// After 6 failed chords the board rests (FUN_18291fef0) — but only chords are blocked meanwhile.
const canChord = (game) => game.cooldown <= 0.001;
const itemsOf = (board, type) => board.cells.filter((cell) => cell.item?.type === type).length;

// FUN_182bcd9b0, after every left click on the board and every Echo Slash: items on the opened cells are taken;
// every other item loses a click (gone at 0) — whether or not the click opened anything; then each neighbour of
// a newly opened cell that is closed, unflagged and has never rolled rolls once: Clarity (below 5 on the board,
// RandomInt(1, 100) ≤ 4), else the clock (below 3, ≤ 3). Mined cells may get one.
function afterClick(game, opened, events) {
  const { board, config } = game;
  for (const index of opened) {
    const cell = board.cells[index];
    if (cell.item) { if (!cell.mine) collect(game, cell.item, events, index); cell.item = null; }
  }
  for (const [index, cell] of board.cells.entries()) {
    if (!cell.item || cell.revealed) continue;
    cell.item.clicks = Math.max(0, cell.item.clicks - 1);
    if (cell.item.clicks <= 0) { events.push({ type: 'itemLost', item: cell.item.type, index }); cell.item = null; }
  }
  if (game.phase !== 'running') return;
  if (safeLeft(board) === 0) return winStage(game, events);
  const { mana, timer } = config.items;
  let pots = itemsOf(board, 'mana'), clocks = itemsOf(board, 'timer');
  const roll = () => 1 + Math.floor(game.random() * 100);
  outer: for (const index of opened) {
    for (const other of neighbours(board, index)) {
      if (pots >= mana.max && clocks >= timer.max) break outer;
      const cell = board.cells[other];
      if (!cell.roll || cell.revealed || cell.flagged) continue;
      cell.roll = false;
      if (pots < mana.max && roll() <= mana.chance) { cell.item = { type: 'mana', clicks: mana.expire }; pots++; events.push({ type: 'itemDrop', item: 'mana', index: other }); }
      else if (clocks < timer.max && roll() <= timer.chance) { cell.item = { type: 'timer', clicks: timer.expire }; clocks++; events.push({ type: 'itemDrop', item: 'timer', index: other }); }
    }
  }
}

// A flag on an item's cell (FUN_182bc1f10) takes the item off with one click less (gone at 0) and puts it, at
// random, on a neighbour of the flagged cells that is closed, unflagged, without an item and touching an opened
// cell; else on any such neighbour; else on any such cell of the field touching an opened one; else it is lost.
// Mined cells may take it; the cell that takes it never rolls for an item.
function hopItems(game, flagged, events) {
  const { board } = game;
  const free = (index) => { const cell = board.cells[index]; return !cell.revealed && !cell.flagged && !cell.item; };
  const byOpened = (index) => neighbours(board, index).some((other) => board.cells[other].revealed);
  for (const index of flagged) {
    const item = board.cells[index].item;
    if (!item) continue;
    board.cells[index].item = null;
    const clicks = item.clicks - 1;
    if (clicks <= 0) { events.push({ type: 'itemLost', item: item.type, index }); continue; }
    const around = [...new Set(flagged.flatMap((cell) => neighbours(board, cell)))].filter(free);
    let spots = around.filter(byOpened);
    if (!spots.length) spots = around;
    if (!spots.length) spots = board.cells.map((_, other) => other).filter((other) => free(other) && byOpened(other));
    if (!spots.length) { events.push({ type: 'itemLost', item: item.type, index }); continue; }
    const to = spots[Math.floor(game.random() * spots.length)];
    board.cells[to].item = { type: item.type, clicks };
    board.cells[to].roll = false;
    events.push({ type: 'itemMove', item: item.type, from: index, index: to });
  }
}

function collect(game, item, events, index) {
  const rule = game.config.items[item.type];
  if (item.type === 'mana') game.mana = Math.min(game.config.mana, game.mana + rule.amount);
  else game.timeLeft += rule.amount;
  events.push({ type: 'itemUse', item: item.type, index });
}

function winStage(game, events) {
  const { board } = game;
  board.cells.forEach((cell) => { if (cell.mine) cell.flagged = true; cell.item = null; });
  game.stagesCleared += 1;
  game.illusion = false;
  game.phase = game.stage + 1 >= game.config.stages.length ? 'won' : 'stageWon';
  events.push({ type: game.phase });
}

function lose(game, index, events, reason = 'mine') {
  const cell = game.board.cells[index];
  if (cell) { cell.revealed = true; cell.blast = true; cell.item = null; } // an item on the mine goes with it
  game.phase = 'lost'; game.lost = reason; game.illusion = false;
  events.push({ type: 'explode', index }, { type: 'lost', reason });
}

// A failed chord: one more on the counter; at 6 the counter drops by 6 and the board rests 5 s longer.
function failChord(game, events) {
  game.chordFails += 1;
  events.push({ type: 'invalid' });
  if (game.chordFails >= game.config.chordFails) { game.chordFails -= game.config.chordFails; game.cooldown += game.config.chordCooldown; events.push({ type: 'cooldown' }); }
}

// Left click: open a closed cell; on an opened number with as many flags around, open the rest. Every left
// click on the board counts down the items, even one that opens nothing.
export function reveal(game, index) {
  const events = [], { board } = game, cell = board.cells[index];
  if (!canPlay(game) || !cell) return events;
  if (game.illusion && !cell.revealed && !cell.flagged) return echoSlash(game, index);
  game.last = index;
  const done = (opened) => { afterClick(game, opened, events); return events; };
  if (cell.flagged) return done([]);
  if (!cell.revealed) {
    if (board.first) firstClick(board, index, game.config, game.random);
    if (cell.mine) { lose(game, index, events); return events; }
    const opened = flood(game, index);
    game.chordFails = 0;
    events.push({ type: 'reveal', cells: opened });
    return done(opened);
  }
  if (!cell.adjacent || !canChord(game)) return done([]);
  const around = neighbours(board, index), flags = around.filter((other) => board.cells[other].flagged && !board.cells[other].revealed).length;
  const closed = around.filter((other) => !board.cells[other].revealed && !board.cells[other].flagged);
  if (flags !== cell.adjacent || !closed.length) { failChord(game, events); return done([]); }
  const mine = closed.find((other) => board.cells[other].mine);
  if (mine !== undefined) { lose(game, mine, events); return events; }
  const opened = closed.flatMap((other) => flood(game, other));
  game.chordFails = 0;
  events.push({ type: 'reveal', cells: opened, chord: true });
  return done(opened);
}

// Right click: flag or unflag a closed cell; on an opened number whose closed neighbours are exactly
// that many, flag them all (a chord: blocked while the board rests; a success does not reset the counter).
export function flag(game, index) {
  const events = [], { board } = game, cell = board.cells[index];
  if (!canPlay(game) || !cell) return events;
  if (!cell.revealed) {
    cell.flagged = !cell.flagged;
    events.push({ type: cell.flagged ? 'flag' : 'unflag', cells: [index] });
    if (cell.flagged) hopItems(game, [index], events);
    return events;
  }
  if (!cell.adjacent || !canChord(game)) return events;
  const closed = neighbours(board, index).filter((other) => !board.cells[other].revealed);
  if (closed.length !== cell.adjacent || closed.every((other) => board.cells[other].flagged)) { failChord(game, events); return events; }
  const cells = closed.filter((other) => !board.cells[other].flagged);
  cells.forEach((other) => { board.cells[other].flagged = true; });
  events.push({ type: 'flag', cells, chord: true });
  hopItems(game, cells, events);
  return events;
}

export function toggleIllusion(game) {
  if (game.phase !== 'running') return [];
  if (!game.illusion && game.mana < game.config.illusionCost) return [{ type: 'invalid' }];
  game.illusion = !game.illusion;
  return [{ type: 'illusionMode', on: game.illusion }];
}

// Echo Slash (FUN_182bce420): an illusion checks a closed, unflagged cell for 50 mana. A mine there blows up the
// illusion instead of Spleen and is gone (the numbers around drop) and the cell opens like any other — with its
// area when it is now a zero; a safe cell just opens. It counts down the items like a click. As a first action it
// gets no first-click protection.
export function echoSlash(game, index) {
  const events = [], { board } = game, cell = board.cells[index];
  game.illusion = false;
  if (!canPlay(game) || !cell || cell.revealed || cell.flagged || game.mana < game.config.illusionCost) return events;
  game.mana -= game.config.illusionCost;
  game.last = index;
  board.first = false;
  events.push({ type: 'illusion', index });
  if (cell.mine) {
    cell.mine = false; board.mines -= 1;
    countAdjacent(board);
    cell.blast = true;
    events.push({ type: 'illusionExplode', index });
  }
  const opened = flood(game, index);
  events.push({ type: 'reveal', cells: opened });
  afterClick(game, opened, events);
  return events;
}

// Time passes only while a stage is played; the chord cooldown runs out with it.
export function tick(game, seconds) {
  const events = [];
  if (game.phase !== 'running') return events;
  if (game.cooldown > 0) { game.cooldown = Math.max(0, game.cooldown - seconds); if (!game.cooldown) events.push({ type: 'cooldownEnd' }); }
  game.timeLeft = Math.max(0, game.timeLeft - seconds);
  if (game.timeLeft <= 0) { game.phase = 'lost'; game.lost = 'time'; events.push({ type: 'lost', reason: 'time' }); }
  return events;
}

export function nextStage(game) {
  if (game.phase !== 'stageWon') return false;
  game.stage += 1;
  game.timeLeft += game.config.stageBonusTime;
  game.board = createBoard(game.config.stages[game.stage], game.random);
  game.phase = 'running'; game.chordFails = 0; game.cooldown = 0; game.last = -1;
  return true;
}

// The results: seconds left count only after the last stage («Оставшееся время» is not shown on a loss).
export function score(game) {
  const { config } = game, won = game.phase === 'won', seconds = won ? Math.floor(game.timeLeft) : 0;
  const result = {
    cells: game.cellsRevealed, cellsScore: game.cellsRevealed * config.score.cell,
    stages: game.stagesCleared, stagesScore: game.stagesCleared * config.score.stage,
    seconds, secondsScore: seconds * config.score.second, won,
  };
  result.total = result.cellsScore + result.stagesScore + result.secondsScore;
  return result;
}

export const formatTime = (seconds) => { const whole = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`; };
