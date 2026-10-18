// «Подрывник Спун» (Crownfall act IV, Valve's techiemen): the rules, without any drawing
// (tests/minigames-spoon.test.cjs). Valve keeps this game in C++ (CTechiemenGame in client.dll); the
// frame and timing numbers it ships are the @define lines of bp_popup_crownfall_encounter_techiemen.css
// (assets/minigames/spoon/data.json → spoonConfig). The rest — board, stages, enemies, scoring, timers —
// was recovered from client.dll (docs/minigames/reverse/spoon.md; the function names below are Ghidra's).
//
// The game is one mutable object in cell units (a cell centre has integer coordinates). step(game, dt,
// input) advances it and returns the events it caused (sounds, popups, phase changes); the view draws
// from the object.

export const FLOOR = 0, HARD = 1, SOFT = 2, LOCK = 3;
// Valve's direction order (table 0x184ea8570): 0 up, 1 down, 2 left, 3 right.
export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR_NAMES = ['up', 'down', 'left', 'right'];
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

// Score marks of the encounter's rewards (crownfall_chapter4.vdata, techiemen, HighScore style).
export const MARKS = [5000, 10000, 15000, 25000];
// CEnemy::Kill (FUN_183007ff0): 100 a knight, 500 a gold one, 10 a creep let out of the exit, times the
// global multiplier ×1 → ×2 → ×4 that lasts 0.45 s after the last kill. The exit tally: 10 points for
// every 2 seconds left. Power-ups and keys give nothing.
export const SCORE = { creep: 100, charger: 100, elite: 500, exitCreep: 10, tally: 10, chainCap: 4, chainWindow: 0.45 };
export const POWERUPS = ['count', 'size', 'speed', 'kick', 'spiky', 'remote'];
export const KEY_COLORS = ['red', 'green', 'blue'];
// Slots of CTechiemenGame: 16 enemies, 12 bombs on the board (the hero's and the enemies' together).
export const LIMITS = { enemies: 16, bombs: 12 };

export function spoonConfig(defines = {}) {
  const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  const d = defines;
  return {
    cols: num(d.boardWidth, 19), rows: num(d.boardHeight, 11),
    bombDuration: num(d.bombDuration, 3), explosionDuration: num(d.bombExplosionDuration, 0.45),
    kickSpeed: num(d.bombKickSpeed, 5),
    // charWalkSpeedBase is a constant in client.dll (+0xa4 = 2.5); a step never exceeds 0.495 cell.
    walkSpeedBase: 2.5, walkSpeedIncrement: num(d.charWalkSpeedIncrement, 0.75), maxStep: 0.495,
    deathDuration: num(d.deathDuration, 3), exitDuration: num(d.charExitDuration, 2),
    creepDeathDuration: num(d.creep_deathDuration, 1.408),
    // FUN_183004520 / FUN_183011710: 2 spare lives, 4 s safe after the count-in (4 s with the keyhole),
    // 6 s safe after a respawn with walk speed at least level 3 (4 on the HUD), «Game Over» 3 s.
    lives: 2, invulnerable: 4, respawnInvulnerable: 6, respawnSpeed: 4, countIn: 3, opening: 1, closing: 1.1, overDuration: 3,
    tallyDelay: 0.5, tallyInterval: 0.025, timeOutClock: 60,
    maxBombs: 9, maxSize: 9, maxSpeed: 9, flyDuration: 0.5,
    // CCreep::Update: everyone walks 1.5 cells/s, chargers dash 4.5, pause 0.25 s after a turn, bonk 1 s.
    enemy: { walk: 1.5, charge: 4.5, pause: 0.25, bonk: 1, dashChance: 20, bombCooldown: 3.25, exitCooldown: 2, exitInvulnerable: 1 },
    // CDropper: 7 cells/s in, 9 out, the bomb 0.25 s after passing its mark, launched 0.25 s apart.
    dropper: { speed: 7, leaveSpeed: 9, hover: 0.25, gap: 0.25, range: 2 },
    sfx: {
      explosion: d.sfxExplosion || 'Techiemen.Explosion', explosionSpiky: d.sfxExplosionSpiky || 'Techiemen.ExplosionSpiky',
      explosionRemote: d.sfxExplosionRemote || 'Techiemen.ExplosionRemote', bombDrop: d.sfxBombDrop || 'Techiemen.BombDrop',
      creepDeath: d.sfxCreepDeath || 'Techiemen.CreepDeath', playerDeath: d.sfxPlayerDeath || 'Techiemen.PlayerDeath',
      levelExit: d.sfxLevelExit || 'Techiemen.LevelExit', powerUp: d.sfxPowerUp || 'Techiemen.PowerUp',
      countIn: d.sfxCountIn || 'Techiemen.CountIn', wallHit: d.sfxWallHit || 'Techiemen.WallHit', fallIn: d.sfxFallIn || 'Techiemen.FallIn',
      timerTick: d.sfxTimerTick || 'Techiemen.TimerTick', timerExpired: d.sfxTimerExpired || 'Techiemen.TimerExpired',
      unlock: d.sfxUnlock || 'Techiemen.Unlock', dash: d.sfxDash || 'Techiemen.Dash', dropperEnter: d.sfxDropperEnter || 'Techiemen.DropperEnter',
      bombKick: d.sfxBombKick || 'Techiemen.BombKick', bombStop: d.sfxBombStop || 'Techiemen.BombStop', score: d.sfxScore || 'Techiemen.Score',
    },
  };
}

// --- stages (FUN_183004520, FUN_1830037c0) ------------------------------------------------------------
// The clock: 3:00 on stages 1–7, then max(1:30, 3:00 − 20 s · floor((stage − 1) / 6)).
export const stageTime = (stage) => (stage > 7 ? Math.max(90, 180 - 20 * Math.floor((stage - 1) / 6)) : 180);
// Three tile sets in turn: grey hall, blue hall, red vault (Valve's blocks/_02/_03 and their frames).
export const tileset = (stage) => (stage - 1) % 3;
// The vault (Скайсейф 3000): every 3rd stage; three locks on stage 3, six from stage 6 on.
export const isVault = (stage) => stage % 3 === 0;
export const lockCount = (stage) => (stage > 3 ? 6 : 3);
// Every 9th stage is a fixed map (FIXED_MAP), every 7th a rush of gold chargers without bombers.
export const isFixedMap = (stage) => stage % 9 === 0;
export const isRush = (stage) => stage % 7 === 0;
export const hasDroppers = (stage) => stage >= 3 && !isRush(stage);
// Bomber waves: stage 3 — 3 bombers every 8 s, the first after 5 s; from stage 4 — 5 every 5 s.
export function dropperWave(stage) {
  if (!hasDroppers(stage)) return null;
  return stage === 3 ? { count: 3, interval: 8, start: 3 } : { count: 5, interval: 5, start: 0 };
}
// Breakable blocks: every floor cell with x + y ≥ 2, one in four, on every stage.
export const BLOCK_CHANCE = 0.25;

// The roster of a stage, in the order Valve spawns it. Group A: n enemies (n = 5 on a rush stage, else
// 3) — chargers on even and rush stages, otherwise creeps that drop bombs from stage 2; on a rush stage
// they are gold (with the kick). Stage 2 adds one bomb-dropping creep. From stage 3, group B: n
// chargers, one of them gold (bombs + kick) from stage 4 (golden = which one), all gold on a rush stage.
export function stageRoster(stage, golden = 0) {
  const rush = isRush(stage), n = rush ? 5 : 3, list = [];
  for (let i = 0; i < n; i++) {
    const charger = stage % 2 === 0 || rush;
    list.push({ group: 'A', charger, bombs: !charger && stage > 1, kick: rush, elite: rush });
  }
  if (stage === 2) list.push({ group: 'A2', charger: false, bombs: true, kick: false, elite: false });
  if (stage > 2) {
    for (let i = 0; i < n; i++) {
      const gold = (i === golden && stage > 3) || rush;
      list.push({ group: 'B', charger: true, bombs: gold, kick: gold, elite: gold });
    }
  }
  return list;
}
export function stageEnemies(stage) {
  const list = stageRoster(stage);
  return {
    creep: list.filter((e) => !e.charger).length, charger: list.filter((e) => e.charger && !e.elite).length,
    elite: list.filter((e) => e.elite).length, bombers: list.filter((e) => e.bombs).length,
  };
}

// The 9th-stage map (FUN_183002e50): # pillar, E exit, R G B locks, r g b keys lying open, s speed
// (only while the hero's speed is low), no random blocks, nothing hidden.
export const FIXED_MAP = [
  '.s#.....#E###......',
  's###.#.##R####.#.#.',
  '..#..#..#G###...#..',
  '.###.#.##B####.###.',
  '..#..#..#b###...#..',
  '.###.#.##g##.#.###.',
  '..#..#..#r......#..',
  '.###.#.###.#.#.###.',
  '..#..#..#########..',
  '.#.#.#.#.#.#.#.#.#.',
  '.....#.............',
];

// --- the game object ---------------------------------------------------------------------------------
// options.storyStage: the stage that ends the story (3 on the first run; −1 afterwards). Reaching its
// exit lifts the score so that the tally ends on exactly 5 000 (FUN_183007aa0, case 6).
export function createGame(config = spoonConfig(), random = Math.random, options = {}) {
  const game = { config, random, stage: 0, score: 0, lives: config.lives, phase: 'idle', phaseTime: 0, events: [], nextId: 1, story: null,
    storyStage: options.storyStage ?? -1, chainMult: 1, chainTimer: 0 };
  game.player = basePlayer();
  return game;
}
// Power-ups in HUD terms: bombs 1…9, range 1…9 (Valve's size 3 + 2n), speed 1…9 (Valve's level 0…8).
const basePlayer = () => ({ x: 0, y: 0, dir: 'down', moving: false, walk: 0, state: 'alive', t: 0, invulnerable: 0, respawned: false,
  bombs: 1, size: 1, speed: 1, kick: false, spiky: false, remote: false, key: null, bombRetry: false });

const inside = (game, c, r) => c >= 0 && r >= 0 && c < game.cols && r < game.rows;
const at = (game, c, r) => r * game.cols + c;
const emit = (game, type, extra = {}) => { game.events.push({ type, ...extra }); };
const sound = (game, name) => emit(game, 'sound', { name: game.config.sfx[name] });
const randInt = (random, lo, hi) => lo + Math.min(hi - lo, Math.floor(random() * (hi - lo + 1)));
// Valve's shuffle: for each i, swap with a random index from i to the end.
function shuffle(list, random) {
  for (let i = 0; i < list.length - 1; i++) { const j = randInt(random, i, list.length - 1); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}
const isExitCell = (game, c, r) => !!game.exit && game.exit.revealed && game.exit.c === c && game.exit.r === r;
// Valve's cell type 0: bare floor — no block, bomb, lying thing or open exit.
export function bareFloor(game, c, r) {
  if (!inside(game, c, r)) return false;
  const i = at(game, c, r);
  return game.grid[i] === FLOOR && !bombAt(game, c, r) && !game.items.has(i) && !isExitCell(game, c, r)
    && !game.explosions.some((ex) => ex.c === c && ex.r === r);
}
function bareFloorCells(game) {
  const list = [];
  for (let r = 0; r < game.rows; r++) for (let c = 0; c < game.cols; c++) if (bareFloor(game, c, r)) list.push([c, r]);
  return list;
}

// A new stage: the board, the hidden things, the enemies.
export function startStage(game, stage) {
  const { config } = game;
  game.stage = stage;
  game.cols = config.cols; game.rows = config.rows;
  game.items = new Map(); game.bombs = [];
  layBoard(game, stage);
  game.explosions = []; game.breaking = new Map(); game.flyers = []; game.droppers = []; game.popups = [];
  game.lastKicked = null;
  game.timeLeft = stageTime(stage); game.lastWhole = Math.ceil(game.timeLeft);
  const wave = dropperWave(stage);
  game.wave = wave ? { ...wave, timer: wave.start, queue: [], gapTimer: 0, launched: 0 } : null;
  game.exitCooldown = 0; game.chainMult = 1; game.chainTimer = 0; game.tally = null;
  const p = game.player;
  Object.assign(p, { x: 0, y: 0, dir: 'down', moving: false, walk: 0, state: 'alive', t: 0, invulnerable: 0, respawned: false, key: null, bombRetry: false, dropCell: undefined });
  spawnEnemies(game, stage);
  game.enemyCount = game.enemies.length;
  setPhase(game, 'opening');
  return game;
}

// FUN_183002e50 + FUN_183004a00.
function layBoard(game, stage) {
  const { random } = game, { cols, rows } = game, p = game.player;
  const grid = game.grid = new Array(cols * rows).fill(FLOOR);
  game.locks = new Map(); game.exit = null; game.hidden = new Map();
  if (isFixedMap(stage)) {
    const keys = { r: 'red', g: 'green', b: 'blue' }, locks = { R: 'red', G: 'green', B: 'blue' };
    FIXED_MAP.forEach((line, r) => [...line].forEach((ch, c) => {
      const i = at(game, c, r);
      if (ch === '#') grid[i] = HARD;
      else if (ch === 'E') game.exit = { c, r, revealed: true, open: false, t: 0 };
      else if (locks[ch]) { grid[i] = LOCK; game.locks.set(i, locks[ch]); }
      else if (keys[ch]) game.items.set(i, { type: 'key', color: keys[ch], t: 0 });
    }));
    // Speed lying at (1, 0) while the hero's level is below 3, and at (0, 1) while below 2.
    if (p.speed < 4) game.items.set(at(game, 1, 0), { type: 'speed', t: 0 });
    if (p.speed < 3) game.items.set(at(game, 0, 1), { type: 'speed', t: 0 });
    return;
  }
  const vault = isVault(stage), zone = vault && stage > 3 ? 7 : 4;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = at(game, c, r);
    if (vault && r < zone && c >= 7 && c <= 11) {
      // The vault: the exit at (9, 0), the locks under it, pillars either side.
      if (c !== 9) grid[i] = HARD;
      else if (r === 0) game.exit = { c, r, revealed: true, open: false, t: 0 };
      else { grid[i] = LOCK; game.locks.set(i, KEY_COLORS[(r - 1) % 3]); }
      continue;
    }
    if (r % 2 === 1 && c % 2 === 1) { if (!(vault && c === 9 && r === zone)) grid[i] = HARD; continue; }
    if (c + r >= 2 && random() < BLOCK_CHANCE) grid[i] = SOFT;
  }
  if (zone === 7) { grid[at(game, 8, 7)] = HARD; grid[at(game, 10, 7)] = HARD; }
  for (const [c, r] of [[2, 0], [0, 2]]) if (grid[at(game, c, r)] === FLOOR) grid[at(game, c, r)] = SOFT;

  // What the blocks hide: the exit (or the keys, twice from stage 6), then the power-ups.
  const list = vault ? KEY_COLORS.concat(stage > 3 ? KEY_COLORS : []).map((color) => ({ type: 'key', color })) : [{ type: 'exit' }];
  let picks = 3;
  if (p.bombs === 1) {
    // A hero with one bomb finds «bomb +1» and «range +1» under the blocks next to the start.
    const flip = randInt(random, 0, 1) !== 0;
    game.hidden.set(flip ? at(game, 2, 0) : at(game, 0, 2), { type: 'size' });
    game.hidden.set(flip ? at(game, 0, 2) : at(game, 2, 0), { type: 'count' });
    picks = 2;
  }
  if (p.speed === 1) list.push({ type: 'speed' });
  const pool = POWERUPS.filter((type) => !(type === 'kick' && p.kick) && !(type === 'spiky' && p.spiky) && !(type === 'remote' && p.remote) && !(type === 'speed' && p.speed === 1));
  shuffle(pool, random);
  for (const type of pool.slice(0, picks)) list.push({ type });
  const blocks = [];
  grid.forEach((cell, i) => { if (cell === SOFT) blocks.push(i); });
  for (let placed = 0; placed < list.length && blocks.length;) {
    const i = blocks.splice(randInt(random, 0, blocks.length - 1), 1)[0];
    if (game.hidden.has(i)) continue;
    const item = list[placed++];
    if (item.type === 'exit') { game.exit = { c: i % cols, r: Math.floor(i / cols), revealed: false, open: false, t: 0 }; game.hidden.set(i, item); }
    else game.hidden.set(i, item);
  }
}

// FUN_1830037c0: bare floor away from the hero (not in the 3×3 round him) with an open neighbour,
// shuffled and split into quarters (x < 9, y < 5); enemies go round them: top right, bottom right,
// bottom left, top left. A quarter that runs out starts over.
function spawnEnemies(game, stage) {
  const { random } = game, p = game.player;
  const half = [Math.floor(game.cols / 2), Math.floor(game.rows / 2)];
  const candidates = bareFloorCells(game).filter(([c, r]) => Math.abs(c - p.x) >= 2 || Math.abs(r - p.y) >= 2);
  shuffle(candidates, random);
  const quarters = [[], [], [], []];
  for (const [c, r] of candidates) {
    if (!DIR_NAMES.some((dir) => { const [dx, dy] = DIRS[dir]; return walkable(game, c + dx, r + dy); })) continue;
    quarters[c < half[0] ? (r < half[1] ? 3 : 2) : (r < half[1] ? 0 : 1)].push([c, r]);
  }
  const index = [0, 0, 0, 0];
  let q = 0;
  const pick = () => {
    for (let tries = 0; tries < 4; tries++) {
      const list = quarters[q], i = index[q];
      index[q] = list.length ? (i + 1) % list.length : 0;
      q = (q + 1) % 4;
      if (i < list.length) return list[i];
    }
    return null;
  };
  game.enemies = [];
  const n = isRush(stage) ? 5 : 3;
  const golden = stage > 2 ? randInt(random, 0, n - 1) : 0;
  for (const spec of stageRoster(stage, golden)) {
    const spot = pick();
    if (!spot || game.enemies.length >= LIMITS.enemies) continue;
    const enemy = newEnemy(game, spec, spot[0], spot[1]);
    // The first direction: a random open one other than «up» (FUN_18300cf40 from direction 0).
    enemy.dir = wallTurn(game, spot[0], spot[1], 'up');
    game.enemies.push(enemy);
  }
}
function newEnemy(game, spec, c, r) {
  const kind = spec.elite ? 'elite' : spec.charger ? 'charger' : 'creep';
  return { id: game.nextId++, kind, charger: !!spec.charger, bombs: !!spec.bombs, kick: !!spec.kick, elite: !!spec.elite, fromExit: !!spec.fromExit,
    x: c, y: r, tx: c, ty: r, dir: spec.dir || 'up', state: 'walk', t: 0, anim: 0, cooldown: 0, invulnerable: spec.invulnerable || 0 };
}
function setPhase(game, phase) { game.phase = phase; game.phaseTime = 0; emit(game, 'phase', { phase }); }

export function newGame(game) {
  game.score = 0; game.lives = game.config.lives; game.player = basePlayer();
  game.events = [];
  startStage(game, 1);
  return game.events.splice(0);
}
// After the closing keyhole of a cleared stage (and the story box, if any).
export function nextStage(game) {
  game.events = [];
  startStage(game, game.stage + 1);
  return game.events.splice(0);
}

// --- queries -------------------------------------------------------------------------------------
export const bombAt = (game, c, r) => game.bombs.find((b) => b.c === c && b.r === r);
// Walk speed in cells/s: 2.5 + 0.75 per level; while safe after a respawn the level is at least 3.
export function walkSpeed(game) {
  const p = game.player, { config } = game;
  const level = p.invulnerable > 0 && p.respawned ? Math.max(p.speed, config.respawnSpeed) : p.speed;
  return config.walkSpeedBase + (level - 1) * config.walkSpeedIncrement;
}
export const formatTime = (seconds) => { const s = Math.max(0, Math.ceil(seconds - 1e-9)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const aliveEnemies = (game) => game.enemies.filter((e) => e.state !== 'dying');
// The range of the hero's next bomb in cells: a spiky bomb reaches 2·range + 1 (Valve: size / (2 − spiky)).
export const bombRange = (player) => (player.spiky ? 2 * player.size + 1 : player.size);
// A cell where fire burns now (the explosions' arms).
export function fireAt(game, c, r) {
  for (const ex of game.explosions) {
    if (ex.c === c && ex.r === r) return ex;
    if (ex.r === r && ((c < ex.c && ex.c - c <= ex.arms.left) || (c > ex.c && c - ex.c <= ex.arms.right))) return ex;
    if (ex.c === c && ((r < ex.r && ex.r - r <= ex.arms.up) || (r > ex.r && r - ex.r <= ex.arms.down))) return ex;
  }
  return null;
}
function solid(game, c, r) { return !inside(game, c, r) || game.grid[at(game, c, r)] !== FLOOR; }
function playerFree(game, c, r) {
  if (solid(game, c, r)) return false;
  const bomb = bombAt(game, c, r);
  return !bomb || bomb.passable;
}
// Where enemies walk: floor, lying things, the exit; not bombs, blocks or locks.
function walkable(game, c, r) { return !solid(game, c, r) && !bombAt(game, c, r); }

// --- the step --------------------------------------------------------------------------------------
// input: { dir: 'left'|'right'|'up'|'down'|null, bomb: pressed this frame, bombHeld: held, action: pressed this frame }
export function step(game, dt, input = {}) {
  game.events = [];
  dt = Math.min(dt, 0.05);
  game.phaseTime += dt;
  const { config } = game;
  switch (game.phase) {
    case 'opening': if (game.phaseTime >= config.opening) { setPhase(game, 'intro'); sound(game, 'countIn'); emit(game, 'countIn', { n: 3 }); } break;
    case 'intro': {
      const n = 3 - Math.floor(game.phaseTime);
      if (n !== game.countShown && n > 0) { game.countShown = n; if (n < 3) { sound(game, 'countIn'); emit(game, 'countIn', { n }); } }
      if (game.phaseTime >= config.countIn) {
        game.countShown = null;
        setPhase(game, 'play'); emit(game, 'countIn', { n: 0 }); sound(game, 'countIn'); sound(game, 'fallIn');
        game.player.invulnerable = config.invulnerable;
      }
      break;
    }
    case 'play': case 'dying': world(game, dt, game.phase === 'play' ? input : {}); break;
    case 'exiting': exiting(game, dt); break;
    case 'closing': if (game.phaseTime >= config.closing) setPhase(game, 'cleared'); break;
    case 'over': world(game, dt, {}, true); if (game.phaseTime >= config.overDuration) setPhase(game, 'ended'); break;
    default: break;
  }
  return game.events;
}

// State 3 of FUN_183011710: the exit animation (2 s) and, in parallel, after 0.5 s, every 0.025 s
// two seconds come off the clock for 10 points.
function exiting(game, dt) {
  const { config } = game, tally = game.tally;
  game.player.t += dt;
  if (game.phaseTime < config.exitDuration || tally.seconds > 0) {
    if (game.phaseTime > config.tallyDelay && tally.seconds > 0) {
      tally.acc += dt;
      if (tally.acc > config.tallyInterval) {
        tally.acc = 0; tally.seconds -= 2;
        if (tally.seconds >= 0) { game.score += SCORE.tally; game.tallied = (game.tallied || 0) + SCORE.tally; sound(game, 'score'); }
      }
    }
    game.timeLeft = Math.max(0, tally.seconds);
  } else setPhase(game, 'closing');
}

function world(game, dt, input, frozenPlayer = false) {
  // The kill multiplier falls back to ×1 0.45 s after the last kill.
  if (game.chainTimer <= 0) game.chainMult = 1; else game.chainTimer -= dt;
  if (game.exitCooldown > 0) game.exitCooldown -= dt;
  updateBreaking(game, dt);
  updateBombs(game, dt, input);
  updateExplosions(game, dt);
  if (game.phase === 'play' || game.phase === 'dying') { clock(game, dt); updateWave(game, dt); }
  if (!frozenPlayer) updatePlayer(game, dt, input);
  updateEnemies(game, dt);
  updateDroppers(game, dt);
  updateFlyers(game, dt);
  for (const item of game.items.values()) item.t += dt;
  game.popups = game.popups.filter((popup) => (popup.t += dt) < 1);
  if (game.exit) {
    game.exit.t += dt;
    // The exit opens when no enemy is left (also in the vault, where the locks bar the way to it).
    const count = game.enemies.length, open = game.exit.revealed && count === 0;
    if (open && !game.exit.open) game.exit.t = 0;
    if (count === 0 && game.enemyCount > 0 && game.exit.revealed) { sound(game, 'unlock'); emit(game, 'exitOpen'); }
    game.exit.open = open;
  }
  game.enemyCount = game.enemies.length;
}

// FUN_183014b10: ticks for the last 10 seconds; at limit + 0.1 s the hero dies, every enemy is removed
// without points and the clock is set to 60 seconds.
function clock(game, dt) {
  const { config } = game;
  game.timeLeft -= dt;
  const whole = Math.max(0, Math.ceil(game.timeLeft - 1e-9));
  if (whole !== game.lastWhole) {
    game.lastWhole = whole;
    if (whole <= 10) {
      if (whole > 0) { sound(game, 'timerTick'); emit(game, 'tick', { seconds: whole }); }
      else sound(game, 'timerExpired');
    }
  }
  if (game.timeLeft <= -0.1) {
    emit(game, 'timeUp');
    killPlayer(game, 'time');
    for (const enemy of game.enemies) if (enemy.state !== 'dying') killEnemy(game, enemy, false);
    game.timeLeft = config.timeOutClock; game.lastWhole = Math.ceil(game.timeLeft);
  }
}

// The hero (FUN_1830140f0): fire, moving along the corridors (sliding round corners), bombs, pick-ups.
function updatePlayer(game, dt, input) {
  const { config } = game, p = game.player;
  if (p.state === 'dying') {
    p.t += dt;
    if (p.t >= config.deathDuration) {
      if (game.lives < 1) { setPhase(game, 'over'); emit(game, 'gameOver'); }
      else { game.lives -= 1; respawn(game); emit(game, 'lives', { lives: game.lives }); }
    }
    return;
  }
  if (p.state !== 'alive') return;
  if (p.invulnerable <= 0) {
    if (fireAt(game, Math.round(p.x), Math.round(p.y))) { killPlayer(game, 'fire'); return; }
  } else p.invulnerable = Math.max(0, p.invulnerable - dt);
  p.moving = false;
  if (input.dir) {
    p.dir = input.dir;
    const before = p.x + p.y;
    movePlayer(game, input.dir, Math.min(walkSpeed(game) * dt, config.maxStep));
    p.moving = Math.abs(p.x + p.y - before) > 1e-6;
    if (p.moving) p.walk += dt;
  }
  // Bombs dropped under the hero can be walked off, not back onto.
  for (const bomb of game.bombs) if (bomb.passable && (Math.abs(p.x - bomb.x) >= 0.999 || Math.abs(p.y - bomb.y) >= 0.999)) bomb.passable = false;
  // The bomb button: a bomb at once; held, as soon as one can be dropped (FUN_1830105e0).
  const held = input.bombHeld ?? !!input.bomb;
  if (!held) p.bombRetry = false;
  else if (input.bomb || p.bombRetry) p.bombRetry = !placeBomb(game);
  if (input.action) action(game);
  const c = Math.round(p.x), r = Math.round(p.y);
  // Pick-ups: power-ups and keys in the hero's cell.
  if (p.dropCell !== undefined && p.dropCell !== at(game, c, r)) p.dropCell = undefined;
  const item = p.dropCell === at(game, c, r) ? null : game.items.get(at(game, c, r));
  if (item && item.burning === undefined && !item.landing) pickUp(game, c, r, item);
  // The open exit: only with no enemy left.
  if (game.exit?.revealed && game.exit.c === c && game.exit.r === r && game.enemies.length === 0) enterExit(game, c, r);
}
function enterExit(game, c, r) {
  const p = game.player;
  p.x = c; p.y = r; p.state = 'exiting'; p.t = 0; p.moving = false;
  const seconds = Math.max(0, Math.ceil(game.timeLeft - 1e-9));
  game.tally = { seconds, acc: 0 }; game.tallied = 0;
  // The last stage of the story: the tally ends on exactly 5 000.
  if (game.stage === game.storyStage) {
    const lift = (500 - Math.floor(seconds / 2)) * 10 - game.score;
    if (lift > 0) { game.score += lift; emit(game, 'storyBonus', { points: lift }); }
  }
  sound(game, 'levelExit'); setPhase(game, 'exiting');
}

function movePlayer(game, dir, dist) {
  const p = game.player, [dx, dy] = DIRS[dir], horizontal = dx !== 0, d = horizontal ? dx : dy;
  const free = (along, lane) => (horizontal ? playerFree(game, along, lane) : playerFree(game, lane, along));
  let a = horizontal ? p.x : p.y, q = horizontal ? p.y : p.x;
  const lane = Math.round(q), off = q - lane, ca = Math.round(a), ahead = ca + d;
  const beforeCentre = (ca - a) * d > 1e-9;
  if (Math.abs(off) > 1e-6) {
    if (beforeCentre || free(ahead, lane)) {
      // Line up with the corridor first, then go on.
      const move = Math.min(dist, Math.abs(off));
      q -= Math.sign(off) * move; dist -= move;
    } else {
      // Blocked in this lane: a hero mostly past the corner slides into the next one.
      const s = Math.sign(off), other = lane + s;
      if (Math.abs(off) > 0.2 && free(ca, other) && free(ahead, other)) { q += s * Math.min(dist, 1 - Math.abs(off)); dist = 0; }
      else { dist = 0; bump(game, dir, horizontal ? ahead : lane, horizontal ? lane : ahead); }
    }
  }
  if (dist > 0) {
    const lane2 = Math.round(q);
    if (Math.abs(q - lane2) < 1e-6) {
      const ca2 = Math.round(a), ahead2 = ca2 + d, centreGap = (ca2 - a) * d;
      if (free(ahead2, lane2)) a += d * dist;
      else {
        const move = Math.max(0, Math.min(dist, centreGap));
        a += d * move;
        if (move < dist) bump(game, dir, horizontal ? ahead2 : lane2, horizontal ? lane2 : ahead2);
      }
    }
  }
  if (horizontal) { p.x = a; p.y = q; } else { p.y = a; p.x = q; }
}

// Walking into something: a bomb is kicked (with the kick), a lock opens with its key and breaks like
// a block (FUN_182ff9c50, FUN_183007aa0).
function bump(game, dir, c, r) {
  const p = game.player;
  if (!inside(game, c, r)) return;
  const bomb = bombAt(game, c, r);
  if (bomb && p.kick && !bomb.slide) {
    if (canSlide(game, bomb, dir)) { bomb.slide = dir; game.lastKicked = bomb; sound(game, 'bombKick'); emit(game, 'kick'); }
    return;
  }
  const i = at(game, c, r);
  if (game.grid[i] === LOCK && p.key && !game.breaking.has(i)) {
    if (game.locks.get(i) === p.key) {
      game.locks.delete(i); p.key = null;
      game.breaking.set(i, 0);
      sound(game, 'unlock'); emit(game, 'unlock', { c, r });
    } else emit(game, 'wrongKey', { c, r });
  }
}
const enemyAtCell = (game, c, r) => game.enemies.some((e) => e.state !== 'dying' && Math.round(e.x) === c && Math.round(e.y) === r);
// A kicked bomb moves on into bare floor only: no lying thing, enemy, hero or exit in the way.
function canSlide(game, bomb, dir) {
  const [dx, dy] = DIRS[dir], nc = bomb.c + dx, nr = bomb.r + dy, p = game.player;
  if (!bareFloor(game, nc, nr) || enemyAtCell(game, nc, nr)) return false;
  return !(p.state === 'alive' && Math.round(p.x) === nc && Math.round(p.y) === nr);
}

function newBomb(game, { owner, kind, c, r, range, falling = 0 }) {
  const bomb = { id: game.nextId++, owner, kind, c, r, x: c, y: r, fuse: kind === 'remote' ? Infinity : game.config.bombDuration, size: range, passable: owner === 'player', slide: null, t: 0, falling };
  game.bombs.push(bomb);
  return bomb;
}
// On bare floor only (not on a lying thing or the exit), within the hero's count and the 12 slots.
function placeBomb(game) {
  const p = game.player, c = Math.round(p.x), r = Math.round(p.y);
  const own = game.bombs.filter((b) => b.owner === 'player').length;
  if (own >= p.bombs || game.bombs.length >= LIMITS.bombs || !bareFloor(game, c, r)) return false;
  const kind = p.remote ? 'remote' : p.spiky ? 'spiky' : 'normal';
  newBomb(game, { owner: 'player', kind, c, r, range: bombRange(p) });
  sound(game, 'bombDrop'); emit(game, 'bomb', { c, r });
  return true;
}
// The special button (Alt): sets off every remote bomb at once and stops the last kicked bomb.
function action(game) {
  let any = false;
  if (game.player.remote && detonateRemotes(game)) any = true;
  const kicked = game.lastKicked;
  if (kicked && kicked.slide && game.bombs.includes(kicked)) { stopBomb(game, kicked); any = true; }
  return any;
}
function detonateRemotes(game) {
  const remotes = game.bombs.filter((b) => b.kind === 'remote');
  for (const bomb of remotes) detonate(game, bomb);
  return remotes.length > 0;
}
function stopBomb(game, bomb) {
  bomb.slide = null;
  if (game.lastKicked === bomb) game.lastKicked = null;
  bomb.c = Math.round(bomb.x); bomb.r = Math.round(bomb.y); bomb.x = bomb.c; bomb.y = bomb.r;
  sound(game, 'bombStop'); emit(game, 'bombStop');
}

// FUN_183007aa0: power-ups (capped at 9), the three specials replace each other (the old one flies off;
// losing the remote sets off its bombs), keys (the old key flies to a random bare cell). No points.
function pickUp(game, c, r, item) {
  const p = game.player, { config } = game, i = at(game, c, r);
  // The picked thing stays in its cell until the end, so nothing flies back into it.
  if (item.type === 'key') {
    const old = p.key;
    if (old && !launchFlyer(game, c, r, { type: 'key', color: old })) {
      // Nowhere to fly: the keys swap places.
      game.items.set(i, { type: 'key', color: old, t: 0 }); p.dropCell = i;
    } else game.items.delete(i);
    p.key = item.color;
  } else {
    if (item.type === 'count') p.bombs = Math.min(config.maxBombs, p.bombs + 1);
    if (item.type === 'size') p.size = Math.min(config.maxSize, p.size + 1);
    if (item.type === 'speed') p.speed = Math.min(config.maxSpeed, p.speed + 1);
    if (['kick', 'spiky', 'remote'].includes(item.type) && !p[item.type]) {
      p[item.type] = true;
      for (const other of ['kick', 'spiky', 'remote']) {
        if (other === item.type || !p[other]) continue;
        p[other] = false;
        if (other === 'remote') detonateRemotes(game);
        launchFlyer(game, c, r, { type: other });
      }
    }
    game.items.delete(i);
  }
  sound(game, 'powerUp'); emit(game, 'pickup', { item: item.type, c, r });
}

// FUN_1830080c0: the hero dies where he stands; his power-ups fly (0.5 s) to random bare cells outside
// the 3×3 round him — bombs down to 1, range down to 1, speed down to 1, the special, the key — as far
// as there are cells for them.
export function killPlayer(game, reason) {
  const p = game.player;
  if (p.state !== 'alive') return;
  p.state = 'dying'; p.t = 0; p.moving = false; p.bombRetry = false;
  sound(game, 'playerDeath'); emit(game, 'death', { reason });
  if (game.phase === 'play') setPhase(game, 'dying');
  const c = Math.round(p.x), r = Math.round(p.y);
  const spots = bareFloorCells(game).filter(([cc, rr]) => Math.abs(cc - c) >= 2 || Math.abs(rr - r) >= 2);
  shuffle(spots, game.random);
  const fly = (item) => {
    const spot = spots.shift();
    if (!spot) return false;
    sendFlyer(game, c, r, spot[0], spot[1], item);
    return true;
  };
  while (p.bombs > 1 && fly({ type: 'count' })) p.bombs -= 1;
  while (p.size > 1 && fly({ type: 'size' })) p.size -= 1;
  while (p.speed > 1 && fly({ type: 'speed' })) p.speed -= 1;
  for (const type of ['kick', 'spiky', 'remote']) if (p[type] && fly({ type })) { p[type] = false; if (type === 'remote') detonateRemotes(game); }
  if (p.key && fly({ type: 'key', color: p.key })) p.key = null;
}
// FUN_183011710: after 3 s the hero gets up in the same place, safe for 6 s.
function respawn(game) {
  const p = game.player, { config } = game;
  Object.assign(p, { state: 'alive', t: 0, walk: 0, invulnerable: config.respawnInvulnerable, respawned: true });
  sound(game, 'fallIn');
  setPhase(game, 'play');
}

// --- flying things (CFlyingPowerup) ------------------------------------------------------------------
// A thing flies 0.5 s to a random bare floor cell (reserved while it flies).
function launchFlyer(game, c, r, item) {
  const spots = bareFloorCells(game);
  if (!spots.length) return false;
  const [tc, tr] = spots[randInt(game.random, 0, spots.length - 1)];
  sendFlyer(game, c, r, tc, tr, item);
  return true;
}
function sendFlyer(game, x, y, c, r, item) {
  game.flyers.push({ ...item, x, y, c, r, t: 0, duration: game.config.flyDuration });
  game.items.set(at(game, c, r), { ...item, t: 0, landing: true });
}
function updateFlyers(game, dt) {
  const done = [];
  for (const flyer of game.flyers) {
    flyer.t += dt;
    if (flyer.t < flyer.duration) continue;
    const i = at(game, flyer.c, flyer.r);
    if (fireAt(game, flyer.c, flyer.r)) {
      // Landing in fire: off again to another cell.
      const spots = bareFloorCells(game).filter(([c, r]) => c !== flyer.c || r !== flyer.r);
      if (spots.length) {
        game.items.delete(i);
        const [c, r] = spots[randInt(game.random, 0, spots.length - 1)];
        Object.assign(flyer, { x: flyer.c, y: flyer.r, c, r, t: 0 });
        game.items.set(at(game, c, r), { type: flyer.type, color: flyer.color, t: 0, landing: true });
        continue;
      }
    }
    const item = game.items.get(i);
    if (item) { item.landing = false; item.t = 0; }
    done.push(flyer);
  }
  game.flyers = game.flyers.filter((f) => !done.includes(f));
}

// --- bombs and fire (FUN_1830107e0, FUN_182ffd0f0, FUN_182ffd1d0) -----------------------------------
function updateBombs(game, dt) {
  for (const bomb of [...game.bombs]) {
    if (!game.bombs.includes(bomb)) continue;
    bomb.t += dt;
    if (bomb.falling) bomb.falling = Math.max(0, bomb.falling - dt);
    if (bomb.slide) slideBomb(game, bomb, dt);
    if (bomb.kind !== 'remote') bomb.fuse -= dt;
    if (bomb.fuse <= 0 || fireAt(game, bomb.c, bomb.r)) detonate(game, bomb);
  }
}
function slideBomb(game, bomb, dt) {
  const [dx, dy] = DIRS[bomb.slide];
  let move = game.config.kickSpeed * dt;
  while (move > 1e-9 && bomb.slide) {
    if (bomb.x === bomb.c && bomb.y === bomb.r) {
      if (!canSlide(game, bomb, bomb.slide)) { stopBomb(game, bomb); break; }
      bomb.tc = bomb.c + dx; bomb.tr = bomb.r + dy;
    }
    const remain = Math.abs(bomb.tc - bomb.x) + Math.abs(bomb.tr - bomb.y), m = Math.min(move, remain);
    bomb.x += dx * m; bomb.y += dy * m; move -= m;
    if (m >= remain - 1e-9) { bomb.x = bomb.c = bomb.tc; bomb.y = bomb.r = bomb.tr; }
  }
}

// The blast: fire in the bomb's cell and along four rays of the bomb's range. Floor and bombs burn and
// the ray goes on (a bomb in it goes off too); a breakable block starts breaking and stops the ray
// without burning (a spiky ray burns it and goes on); pillars, breaking blocks, locks and burning things
// stop it. A lying power-up or key is not burnt: it flies off to a random bare cell and stops the ray
// (a power-up burns only when there is nowhere to fly; a key never). Fire on the open exit lets out a
// creep (once in 2 s) and stops the ray. Spiky rays go on through all of these but pillars and locks.
export function detonate(game, bomb) {
  if (!game.bombs.includes(bomb)) return null;
  game.bombs.splice(game.bombs.indexOf(bomb), 1);
  if (game.lastKicked === bomb) game.lastKicked = null;
  const c = bomb.c, r = bomb.r, spiky = bomb.kind === 'spiky', arms = {}, later = [];
  // The bomb's cell stays taken while it burns (Valve's type 4 until the blast is over).
  const explosion = { id: game.nextId++, c, r, arms, t: 0, owner: bomb.owner, red: spiky || bomb.owner !== 'player' };
  game.explosions.push(explosion);
  for (const dir of ['up', 'right', 'down', 'left']) {
    const [dx, dy] = DIRS[dir];
    let reach = 0;
    for (let n = 1; n <= bomb.size; n++) {
      const cc = c + dx * n, rr = r + dy * n;
      if (!inside(game, cc, rr)) break;
      const i = at(game, cc, rr), cell = game.grid[i];
      if (cell === HARD || cell === LOCK || game.breaking.has(i)) break;
      if (cell === SOFT) {
        game.breaking.set(i, 0); emit(game, 'break', { c: cc, r: rr });
        if (!spiky) break;
        reach = n; continue;
      }
      const other = bombAt(game, cc, rr);
      if (other) { reach = n; later.push(other); continue; }
      const item = game.items.get(i);
      if (item && item.burning !== undefined) break;
      if (item && !item.landing) {
        if (launchFlyer(game, cc, rr, { type: item.type, color: item.color })) game.items.delete(i);
        else if (item.type !== 'key') item.burning = 0;
        if (!spiky) break;
        reach = n; continue;
      }
      if (isExitCell(game, cc, rr)) {
        spawnExitCreep(game, cc, rr);
        if (!spiky) break;
        reach = n; continue;
      }
      reach = n;
    }
    arms[dir] = reach;
  }
  sound(game, spiky ? 'explosionSpiky' : bomb.kind === 'remote' ? 'explosionRemote' : 'explosion');
  emit(game, 'explode', { c, r, kind: bomb.kind });
  for (const other of later) detonate(game, other);
  return explosion;
}
// A creep out of the exit: once in 2 s, safe for 1 s, worth 10 points.
function spawnExitCreep(game, c, r) {
  if (game.exitCooldown > 0) return null;
  game.exitCooldown = game.config.enemy.exitCooldown;
  if (game.enemies.length >= LIMITS.enemies) return null;
  const enemy = newEnemy(game, { charger: false, fromExit: true, invulnerable: game.config.enemy.exitInvulnerable, dir: 'up' }, c, r);
  game.enemies.push(enemy);
  emit(game, 'exitCreep', { c, r });
  return enemy;
}

function updateExplosions(game, dt) {
  for (const ex of game.explosions) ex.t += dt;
  game.explosions = game.explosions.filter((ex) => ex.t < game.config.explosionDuration);
}
// CEnemy::Kill: points times the global multiplier, which doubles (up to ×4) and holds for 0.45 s.
export function killEnemy(game, enemy, scored = true) {
  enemy.state = 'dying'; enemy.t = 0;
  let points = 0;
  if (scored) {
    const base = enemy.fromExit ? SCORE.exitCreep : enemy.elite || enemy.kind === 'elite' ? SCORE.elite : SCORE.creep;
    const multiplier = game.chainMult || 1;
    game.chainMult = Math.min(SCORE.chainCap, multiplier * 2); game.chainTimer = SCORE.chainWindow;
    points = base * multiplier;
    game.score += points;
    game.popups.push({ x: enemy.x, y: enemy.y, text: String(points), t: 0 });
  }
  sound(game, 'creepDeath'); emit(game, 'kill', { kind: enemy.kind, points });
  return points;
}

function updateBreaking(game, dt) {
  for (const [i, t] of game.breaking) {
    const next = t + dt;
    if (next < game.config.explosionDuration) { game.breaking.set(i, next); continue; }
    game.breaking.delete(i);
    game.grid[i] = FLOOR;
    game.locks.delete(i);
    const hidden = game.hidden.get(i);
    if (hidden) {
      game.hidden.delete(i);
      if (hidden.type === 'exit') { game.exit.revealed = true; game.exit.t = 0; emit(game, 'reveal', { item: 'exit' }); }
      else { game.items.set(i, { ...hidden, t: 0 }); emit(game, 'reveal', { item: hidden.type }); }
    }
  }
  for (const [i, item] of game.items) if (item.burning !== undefined) { item.burning += dt; if (item.burning >= game.config.explosionDuration) game.items.delete(i); }
}

// --- enemies (CCreep::Update, FUN_183010ce0) -----------------------------------------------------------
// Everyone walks straight on at 1.5 cells/s. Walking into a wall: a random open direction other than
// the current one (back included) and a 0.25 s pause. Chargers dash (4.5 cells/s) at the hero when he is
// ahead in line with a clear path, or by themselves (1 in 20 at a cell centre); the dash ends in the
// wall with a 1 s bonk. Gold ones turn at crossings (always away from a bomb or fire ≤ 2 cells ahead,
// otherwise 1 in 4) and face the hero when they see him. Bomb droppers leave a bomb when they see the
// hero and have another corridor to flee into. Contact = the same rounded cell.
function updateEnemies(game, dt) {
  const { config } = game, spec = config.enemy;
  for (const e of game.enemies) {
    e.anim += dt;
    if (e.state === 'dying') { e.t += dt; continue; }
    if (e.invulnerable > 0) e.invulnerable -= dt;
    else if (fireAt(game, Math.round(e.x), Math.round(e.y))) { killEnemy(game, e, true); continue; }
    if (e.state === 'bonk') { e.t += dt; if (e.t >= spec.bonk) { e.state = 'walk'; e.t = 0; e.ready = atCentre(e); } continue; }
    touchHero(game, e);
    if (e.state === 'pause') {
      e.t += dt;
      if (e.t >= spec.pause) { e.state = 'walk'; e.t = 0; e.ready = atCentre(e); }
      continue;
    }
    if (e.cooldown > 0) e.cooldown -= dt;
    if (e.charger && e.state === 'walk' && heroAhead(game, e)) startCharge(game, e);
    let move = (e.state === 'charge' ? spec.charge : spec.walk) * dt, guard = 0;
    while (move > 1e-9 && guard++ < 6) {
      if (atCentre(e)) {
        const arrived = !e.ready;
        e.ready = false;
        if (!decide(game, e, arrived)) break;
        continue;
      }
      if (!walkable(game, e.tx, e.ty)) {
        // The cell ahead was blocked on the way: back to the one just left.
        const [dx, dy] = DIRS[e.dir];
        e.tx -= dx; e.ty -= dy; e.dir = OPPOSITE[e.dir];
        if (e.state === 'charge') bonk(game, e); else { e.state = 'pause'; e.t = 0; }
        break;
      }
      const dist = Math.abs(e.tx - e.x) + Math.abs(e.ty - e.y), m = Math.min(move, dist);
      e.x += Math.sign(e.tx - e.x) * m; e.y += Math.sign(e.ty - e.y) * m; move -= m;
      if (m >= dist - 1e-9) { e.x = e.tx; e.y = e.ty; }
    }
  }
  game.enemies = game.enemies.filter((e) => e.state !== 'dying' || e.t < config.creepDeathDuration);
}
const atCentre = (e) => e.x === e.tx && e.y === e.ty;
function touchHero(game, e) {
  const p = game.player;
  if (p.state === 'alive' && p.invulnerable <= 0 && Math.round(e.x) === Math.round(p.x) && Math.round(e.y) === Math.round(p.y)) killPlayer(game, 'enemy');
}
function startCharge(game, e) { e.state = 'charge'; sound(game, 'dash'); emit(game, 'dash'); }
function bonk(game, e) { e.state = 'bonk'; e.t = 0; sound(game, 'wallHit'); emit(game, 'bonk'); }

// At a cell centre: returns true when the enemy walks on to the next cell, false when it stops this frame.
function decide(game, e, arrived) {
  const c = e.x, r = e.y, spec = game.config.enemy;
  if (e.charger && e.state === 'walk' && randInt(game.random, 0, spec.dashChance - 1) === 0) startCharge(game, e);
  if (e.kick) kickAhead(game, e, c, r);
  if (e.bombs && e.state === 'walk' && e.cooldown <= 0) {
    const flee = fleeDirection(game, c, r);
    if ((!e.elite || randInt(game.random, 0, 2) === 0) && flee && bareFloor(game, c, r) && game.bombs.length < LIMITS.bombs) {
      newBomb(game, { owner: 'enemy', kind: 'enemy', c, r, range: e.elite ? 2 : 1 });
      sound(game, 'bombDrop'); emit(game, 'enemyBomb', { c, r });
      e.dir = flee; e.state = 'pause'; e.t = 0; e.cooldown = spec.bombCooldown;
      return false;
    }
  }
  let [dx, dy] = DIRS[e.dir];
  if (!walkable(game, c + dx, r + dy)) {
    e.dir = wallTurn(game, c, r, e.dir);
    if (e.state === 'charge') bonk(game, e); else { e.state = 'pause'; e.t = 0; }
    return false;
  }
  if (e.elite && e.state !== 'charge' && arrived && goldTurn(game, e, c, r)) { e.state = 'pause'; e.t = 0; return false; }
  [dx, dy] = DIRS[e.dir];
  if (!walkable(game, c + dx, r + dy)) return false;
  e.tx = c + dx; e.ty = r + dy;
  return true;
}
// FUN_18300cf40: a random open direction other than the current one; none — keep it.
function wallTurn(game, c, r, current) {
  const options = ['right', 'left', 'down', 'up'].filter((dir) => { if (dir === current) return false; const [dx, dy] = DIRS[dir]; return walkable(game, c + dx, r + dy); });
  return options.length ? options[randInt(game.random, 0, options.length - 1)] : current;
}
// FUN_182ff98b0: the hero in the same row or column, ahead in the walking direction, with nothing but
// floor and lying things between.
function heroAhead(game, e) {
  const p = game.player, [dx, dy] = DIRS[e.dir];
  const pc = Math.round(p.x), pr = Math.round(p.y);
  let c = atCentre(e) ? e.x : e.tx - dx, r = atCentre(e) ? e.y : e.ty - dy;
  if ((dx !== 0 && r !== pr) || (dy !== 0 && c !== pc)) return false;
  for (;;) {
    c += dx; r += dy;
    if (!walkable(game, c, r)) return false;
    if (c === pc && r === pr) return true;
  }
}
// FUN_182ff9a80: a gold enemy at a cell centre facing a bomb (not spiky, not moving) kicks it.
function kickAhead(game, e, c, r) {
  const [dx, dy] = DIRS[e.dir], bomb = bombAt(game, c + dx, r + dy);
  if (!bomb || bomb.slide || bomb.kind === 'spiky') return;
  if (canSlide(game, bomb, e.dir)) { bomb.slide = e.dir; sound(game, 'bombKick'); emit(game, 'kick', { by: 'enemy' }); }
}
// FUN_1830001e0: the hero seen down a corridor and another corridor longer than 2 cells to flee into.
function fleeDirection(game, c, r) {
  const p = game.player, pc = Math.round(p.x), pr = Math.round(p.y);
  let seen = null;
  const options = [];
  for (const dir of DIR_NAMES) {
    const [dx, dy] = DIRS[dir];
    let n = 0;
    for (let cc = c + dx, rr = r + dy; walkable(game, cc, rr); cc += dx, rr += dy) { n++; if (cc === pc && rr === pr) seen = dir; }
    if (n > 2 && seen !== dir) options.push(dir);
  }
  if (!seen) return null;
  const list = options.filter((dir) => dir !== seen);
  if (!list.length) return null;
  return list.length === 1 ? list[0] : list[randInt(game.random, 0, list.length - 1)];
}
// FUN_182ffa200: a gold enemy arriving at a cell centre turns to face the hero if it sees him (fire
// blocks the view), then may turn into another corridor with no bomb or fire at its end — always if a
// bomb or fire is 2 cells ahead or closer, otherwise 1 in 4. Returns true after a random turn.
function goldTurn(game, e, c, r) {
  const p = game.player, pc = Math.round(p.x), pr = Math.round(p.y);
  const count = {}, danger = {};
  let seen = null;
  for (const dir of DIR_NAMES) {
    const [dx, dy] = DIRS[dir];
    let n = 0, cc = c + dx, rr = r + dy;
    while (inside(game, cc, rr) && !solid(game, cc, rr) && !bombAt(game, cc, rr) && !fireAt(game, cc, rr)) {
      if (cc === pc && rr === pr) seen = dir;
      n++; cc += dx; rr += dy;
    }
    count[dir] = n;
    danger[dir] = inside(game, cc, rr) && (bombAt(game, cc, rr) || fireAt(game, cc, rr)) ? n : null;
  }
  if (seen && seen !== e.dir) e.dir = seen;
  const candidates = DIR_NAMES.filter((dir) => dir !== e.dir && danger[dir] === null && count[dir] > 0);
  if (!candidates.length) return false;
  const pick = candidates.length === 1 ? candidates[0] : candidates[randInt(game.random, 0, candidates.length - 1)];
  const ahead = danger[e.dir], always = ahead !== null && ahead <= 2;
  if (always || randInt(game.random, 0, 3) === 0) { e.dir = pick; return true; }
  return false;
}

// --- bombers (CDropper, FUN_1830147e0 / FUN_182ff65a0 / FUN_183011130) --------------------------------
// The wave timer runs while a stage is played; when it is up, random bare floor cells anywhere become
// targets: the first bomber starts at once, the others one every 0.25 s, and the timer starts again
// after the last one.
function updateWave(game, dt) {
  const wave = game.wave;
  if (!wave) return;
  const gap = game.config.dropper.gap;
  if (wave.timer >= wave.interval) {
    wave.gapTimer += dt;
    if (wave.gapTimer < gap) return;
    const target = wave.queue.shift();
    if (!target) { wave.timer = 0; wave.launched = 0; return; }
    launchDropper(game, target[0], target[1]);
    wave.launched += 1;
    if (wave.launched >= wave.count || !wave.queue.length) { wave.timer = 0; wave.launched = 0; wave.queue = []; }
    else wave.gapTimer = 0;
    return;
  }
  wave.timer += dt;
  if (wave.timer < wave.interval) return;
  const cells = shuffle(bareFloorCells(game), game.random);
  if (!cells.length) { wave.timer = 0; return; }
  launchDropper(game, cells[0][0], cells[0][1]);
  if (wave.count < 2) { wave.timer = 0; return; }
  wave.queue = cells.slice(1, wave.count);
  wave.launched = 1; wave.gapTimer = 0;
  if (!wave.queue.length) { wave.timer = 0; wave.launched = 0; }
  emit(game, 'dropper', { count: wave.count });
}
// A bomber flies in from a random side along its target's row or column (from beyond the frame).
export function launchDropper(game, c, r, dirIndex = randInt(game.random, 0, 3)) {
  const { cols, rows } = game, dir = DIR_NAMES[dirIndex];
  let x = c, y = r;
  if (dir === 'up') y = rows + 5 + Math.max(0, r - rows + 3);
  else if (dir === 'down') y = -1 - Math.max(0, 3 - r);
  else if (dir === 'left') x = cols + 2 + Math.max(0, c - cols + 3);
  else x = -1 - Math.max(0, 3 - c);
  const dropper = { id: game.nextId++, dir, x, y, target: { c, r }, state: 'fly', t: 0, anim: 0 };
  game.droppers.push(dropper);
  sound(game, 'dropperEnter');
  return dropper;
}
// 7 cells/s; over its mark (rounded) it keeps flying for 0.25 s, then drops a bomb of range 2 with the
// usual fuse on the mark if it is still floor or a bomb (onto a bomb — the new one goes off at once),
// and leaves at 9 cells/s. Bombers cannot be hurt.
function updateDroppers(game, dt) {
  const { cols, rows } = game, cfg = game.config.dropper;
  for (const d of game.droppers) {
    d.anim += dt;
    const [dx, dy] = DIRS[d.dir], speed = d.state === 'leave' ? cfg.leaveSpeed : cfg.speed;
    d.x += dx * speed * dt; d.y += dy * speed * dt;
    const { c, r } = d.target, open = () => !solid(game, c, r) && !game.items.has(at(game, c, r)) && !isExitCell(game, c, r);
    if (d.state === 'fly' && Math.round(d.x) === c && Math.round(d.y) === r) {
      if (open()) { d.state = 'hover'; d.t = 0; } else d.state = 'leave';
    } else if (d.state === 'hover') {
      d.t += dt;
      if (d.t >= cfg.hover) {
        d.state = 'leave';
        if (open() && game.bombs.length < LIMITS.bombs) {
          const there = bombAt(game, c, r);
          const bomb = newBomb(game, { owner: 'dropper', kind: 'enemy', c, r, range: cfg.range, falling: 0.15 });
          emit(game, 'drop', { c, r });
          if (there) detonate(game, bomb);
        }
      }
    }
    if (d.state !== 'hover') {
      const gone = d.dir === 'up' ? d.y < -4 : d.dir === 'down' ? d.y > rows + 5 : d.dir === 'left' ? d.x < -4 : d.x > cols + 4;
      if (gone) d.gone = true;
    }
  }
  game.droppers = game.droppers.filter((d) => !d.gone);
}

// --- the special: test helpers used by the view's debug and by tests ---------------------------------
export function playerCell(game) { return [Math.round(game.player.x), Math.round(game.player.y)]; }
