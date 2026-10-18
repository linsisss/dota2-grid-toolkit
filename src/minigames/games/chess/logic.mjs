// «Драконьи шахматы» (Crownfall act III, Dragon Chess — Valve's `match3`): the rules, without any drawing
// (tests/minigames-chess.test.cjs). The numbers come from Valve's five match3_*.vdata
// (assets/minigames/chess/data.json → chessConfig) and the client's convars (dota_match3_*); what the data
// does not say — the damage and score formulas, how abilities play out on the board — is reconstructed from
// Valve's strings, layout and CSS and from players' accounts; docs/minigames.md («Драконьи шахматы») lists both.
//
// The rules recovered from client.dll (docs/minigames/reverse/chess.md) replace the guesses: the score
// table, where an upgraded gem appears, instant novas and Light Strike Array, Chain Frost's 13 flights,
// Nether Swap's random gem, the summed slows, a stun discarding the opponent's action, gravity 50 and the
// 5-s hint.
//
// The game runs in real time. The board is 8×8 cells, row 0 at the top; positions in «board units»
// (1 = a cell, x to the right, y down, a cell's centre at col + 0.5, row + 0.5). The opponent stands to
// the right of the board (OPPONENT_AT), the user's health bar below it (PLAYER_AT): projectiles fly
// between them in the same units. step(game, dt) advances everything and pushes events into
// game.events, which the view drains (sounds, effects, numbers, the end).

export const ROWS = 8, COLS = 8;
export const OPPONENT_AT = { x: 12.35, y: 4.3 };   // the opponent's chest, in board units (layout: 752-px right column)
export const PLAYER_AT = { x: 4, y: 8.75 };        // the user's health bar under the board
const STEP = 1 / 120;
// dota_match3_* convars of the client: disappear 0.15 s, merge 0.258782 s, match projectiles 15 cells/s.
export const DISAPPEAR = 0.15, MERGE = 0.258782, ATTACK_SPEED = 15;
const SWAP_TIME = 0.18;          // a swap (and the way back of a refused one)
const GRAVITY = 50;             // cells/s², no speed limit (client.dll: CMatch3BoardModifier gravity)
const SHUFFLE_TIME = 0.5;
const OUT_OF_MOVES_TIME = 1.6;   // «Ходы закончились / Перемешиваем поле» before the shuffle
const HINT_DELAY = 5;            // s after the board settles before a hint (CMatch3BoardModifier_MatchHints)
// Score events (FUN_182b87fc0): a group of 3/4/5/6/7+ gems gives a fixed sum, no combo multiplier; an
// ability gem going off gives 150 (super) or 450 (ultra). Gems destroyed by abilities give nothing.
export const MATCH_SCORE = [0, 0, 0, 50, 100, 200, 500, 1000];
export const matchScore = (count) => (count < 3 ? 0 : MATCH_SCORE[Math.min(7, count)]);
export const ABILITY_SCORE = { super: 150, ultra: 450 };
const ATTACK_IMPACT = 0.35;      // s from an opponent's attack to its hit (the swing)
const DEATH_TIME = 2, STAGE_INTRO = { normal: 2, boss: 3, friendly: 2 };
const COUNTDOWN = 3;             // 3, 2, 1, «Старт!»
export const REWARDS = [5000, 40000]; // crownfall_act3 rewards: the story's chess piece at 5 000, three tokens at 40 000

// The heroes' and opponents' npc names by Valve hero ID (portraits, help popup).
const HERO_NAMES = { 5: 'crystal_maiden', 6: 'drow_ranger', 20: 'vengefulspirit', 25: 'lina', 31: 'lich', 49: 'dragon_knight', 61: 'broodmother',
  68: 'ancient_apparition', 77: 'lycan', 81: 'chaos_knight', 100: 'tusk', 112: 'winter_wyvern', 2: 'axe', 96: 'centaur', 101: 'skywrath_mage', 120: 'pangolier' };
// Physical damage (Cold Embrace blocks it); the rest of the opponents' damage is magical.
// Hypothermia is magical in client.dll (damage type 2): Cold Embrace does not block it.
const PHYSICAL = new Set(['basic_attack', 'crit_attack', 'chaos_strike', 'butt_slam', 'walrus_punch', 'frost_attack']);

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const key = (text) => String(text || '').replace(/^#/, '');
const image = (path) => String(path || '').replace(/^.*[{/]images}?\//, '').replace(/\.png$/, '');

// --- configuration ------------------------------------------------------------------------------

function params(list) {
  const out = {}, described = [];
  for (const p of list || []) {
    out[p.name] = p.value ?? p.str ?? p.resource;
    if (p.desc) described.push({ name: p.name, desc: key(p.desc) });
  }
  return { values: out, described };
}

export function chessConfig(data) {
  const mode = data.game_modes.crownfall_act3;
  const abilities = {};
  for (const [name, a] of Object.entries(data.abilities)) {
    if (!a || typeof a !== 'object') continue;
    const { values, described } = params(a.m_vecParams);
    abilities[name] = { name, id: a.m_unAbilityID, locName: key(a.m_sLocName), locDesc: key(a.m_sLocDescription), image: image(a.m_sImage), params: values, described };
  }
  const actions = {};
  for (const [name, a] of Object.entries(data.opponent_actions)) {
    if (!a || typeof a !== 'object') continue;
    const { values, described } = params(a.m_vecParams);
    actions[name] = { name, id: a.m_unOpponentActionID, locName: key(a.m_sLocName), locDesc: key(a.m_sLocDescription), image: image(a.m_sImage), params: values, described };
  }
  const heroes = mode.m_vecHeroes.map((name, index) => {
    const h = data.heroes[name];
    return { index, name, key: name.replace('match3_hero_', ''), heroId: h.m_nHeroID, unit: HERO_NAMES[h.m_nHeroID], gem: (h.m_sPieceModel || '').replace(/^.*\//, '').replace(/\.vmdl$/, ''),
      super: h.m_sSuperAbility, ultra: h.m_sUltraAbility };
  });
  const instance = (x) => ({ action: x.m_sActionName, cooldown: num(x.m_flCooldown, 0), params: { ...(actions[x.m_sActionName]?.params || {}), ...(x.m_kvActionParams || {}) } });
  const opponents = {};
  for (const [name, o] of Object.entries(data.opponents)) {
    if (!o || typeof o !== 'object') continue;
    opponents[name] = {
      name, id: o.m_unOpponentID, locName: key(o.m_sLocName), flavor: o.m_sLocFlavor ? key(o.m_sLocFlavor) : null,
      unit: o.m_sUnitName || (o.m_nHeroID ? `npc_dota_hero_${HERO_NAMES[o.m_nHeroID]}` : null), heroId: o.m_nHeroID || null, model: o.m_sModelName || null,
      skin: o.m_nHeroSkinOverride ?? null, maxHealth: num(o.m_flMaxHealth, 100), impactSound: o.m_sAttackImpactSound || null,
      screenEffect: /bite/.test(o.m_sAttackParticleEffect || '') ? 'bite' : 'slash',
      intro: (o.m_vecIntroActions || []).map(instance), repeat: (o.m_vecRepeatingActions || []).map(instance), outro: (o.m_vecOutroActions || []).map(instance),
    };
  }
  const flag = (f) => (f === 'k_eMatch3LevelFlag_Boss' ? 'boss' : f === 'k_eMatch3LevelFlag_Friendly' ? 'friendly' : 'normal');
  const levels = mode.m_vecLevels.map((l, index) => ({ index, locName: key(l.m_sLevelName), opponent: l.m_sOpponentName, score: num(l.m_nCompletionScore, 0), kind: flag(l.m_eLevelFlags) }));
  return { rows: num(mode.m_nBoardRows, ROWS), cols: num(mode.m_nBoardCols, COLS), playerHealth: num(mode.m_flPlayerHealth, 1000), heroes, abilities, actions, opponents, levels,
    locName: key(mode.m_sLocName), background: image(mode.m_sBackgroundImage) };
}

// The text of an action's or ability's tooltip values: [{ desc, value }] (Valve's AbilityValueFormat rows).
export function tooltipValues(def, values = def.params) {
  return def.described.map(({ name, desc }) => ({ desc, value: values[name] }));
}

// --- random ---------------------------------------------------------------------------------------

export function rng(seed = Date.now()) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (game, list) => list[Math.floor(game.random() * list.length)];

// --- the game -------------------------------------------------------------------------------------

export function createGame(config, { seed = Date.now(), startLevel = 0, countdown = true } = {}) {
  const game = {
    config, random: rng(seed), time: 0, events: [], tasks: [], projectiles: [], flying: [], nextId: 1,
    phase: countdown ? 'countdown' : 'active', countdown: countdown ? COUNTDOWN + 1 : 0, // phases: countdown · active · won · lost
    grid: Array.from({ length: config.rows }, () => Array(config.cols).fill(null)),
    player: { health: config.playerHealth, maxHealth: config.playerHealth, mods: [] },
    opponent: null, level: -1, score: 0, combo: 0, matches: 0, piecesCleared: 0, damageDealt: 0,
    lastMove: 0, hint: null, outOfMoves: 0, refillAt: 0, colChain: Array(config.cols).fill(0), stats: { swaps: 0, refused: 0, abilities: 0 },
  };
  fillBoard(game);
  if (!countdown) startLevel_(game, startLevel);
  else { game.startLevel = startLevel; event(game, 'countdown', { value: COUNTDOWN }); sound(game, 'match3.countdown.tick'); }
  return game;
}

const event = (game, type, data = {}) => { game.events.push({ type, t: game.time, ...data }); };
const sound = (game, name, data = {}) => { if (name) event(game, 'sound', { name, ...data }); };
const later = (game, delay, run, owner = null) => { game.tasks.push({ at: game.time + delay, run, owner }); };

function newPiece(game, hero, r, c, y = r) {
  return { id: game.nextId++, hero, kind: 'normal', r, c, x: c, y, vy: 0, state: y === r ? 'idle' : 'fall', t: 0 };
}

// A start board: random heroes, no ready match, at least one move; pieces drop in from above.
function fillBoard(game) {
  const { rows, cols } = game.config;
  for (let attempt = 0; attempt < 100; attempt++) {
    const heroes = randomColours(game, rows, cols);
    if (!hasMove(heroes)) continue;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const p = newPiece(game, heroes[r][c], r, c, r - rows - 0.6 - (rows - r) * 0.15);
      game.grid[r][c] = p;
    }
    return;
  }
}
function randomColours(game, rows, cols) {
  const n = game.config.heroes.length, h = [];
  for (let r = 0; r < rows; r++) {
    h.push([]);
    for (let c = 0; c < cols; c++) {
      let v;
      do v = Math.floor(game.random() * n);
      while ((c >= 2 && h[r][c - 1] === v && h[r][c - 2] === v) || (r >= 2 && h[r - 1][c] === v && h[r - 2][c] === v));
      h[r].push(v);
    }
  }
  return h;
}

// --- matching -------------------------------------------------------------------------------------

const silenced = (game) => hasMod(game.player, 'gust');
// Can this piece take part in a match now? Ability gems cannot while the user is silenced («Самоцветы
// способностей не задействуются»).
const matchable = (game, p) => p && p.state === 'idle' && !(p.kind !== 'normal' && silenced(game));

// Runs of 3+ same-hero pieces (only settled ones), joined where they share pieces: [{ pieces, runs }].
export function findGroups(game) {
  const { rows, cols } = game.config, g = game.grid, runs = [];
  const scan = (cells) => {
    let start = 0;
    for (let i = 1; i <= cells.length; i++) {
      const a = cells[start], b = cells[i];
      const pa = a && g[a[0]][a[1]], pb = b && g[b[0]][b[1]];
      if (i < cells.length && matchable(game, pa) && matchable(game, pb) && pa.hero === pb.hero) continue;
      if (i - start >= 3 && matchable(game, pa)) runs.push(cells.slice(start, i).map(([r, c]) => g[r][c]));
      start = i;
    }
  };
  for (let r = 0; r < rows; r++) scan(Array.from({ length: cols }, (_, c) => [r, c]));
  for (let c = 0; c < cols; c++) scan(Array.from({ length: rows }, (_, r) => [r, c]));
  // union runs that share a piece
  const groups = [];
  for (const run of runs) {
    const joined = groups.filter((grp) => run.some((p) => grp.set.has(p)));
    const grp = { set: new Set(run), runs: [run] };
    for (const j of joined) { for (const p of j.set) grp.set.add(p); grp.runs.push(...j.runs); groups.splice(groups.indexOf(j), 1); }
    groups.push(grp);
  }
  return groups.map((grp) => ({ pieces: [...grp.set], runs: grp.runs, hero: grp.runs[0][0].hero }));
}

// Is there a swap that makes a match? (on a plain colour grid: heroes[r][c] or null)
export function hasMove(heroes) { return !!findMove(heroes); }
export function findMove(heroes) {
  const rows = heroes.length, cols = heroes[0].length;
  const at = (r, c) => (r >= 0 && r < rows && c >= 0 && c < cols ? heroes[r][c] : null);
  const lineAt = (r, c) => {
    const v = at(r, c); if (v == null) return false;
    let h = 1; for (let k = c - 1; at(r, k) === v; k--) h++; for (let k = c + 1; at(r, k) === v; k++) h++;
    let w = 1; for (let k = r - 1; at(k, c) === v; k--) w++; for (let k = r + 1; at(k, c) === v; k++) w++;
    return h >= 3 || w >= 3;
  };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) for (const [dr, dc] of [[0, 1], [1, 0]]) {
    const r2 = r + dr, c2 = c + dc;
    if (r2 >= rows || c2 >= cols || heroes[r][c] == null || heroes[r2][c2] == null || heroes[r][c] === heroes[r2][c2]) continue;
    [heroes[r][c], heroes[r2][c2]] = [heroes[r2][c2], heroes[r][c]];
    const ok = lineAt(r, c) || lineAt(r2, c2);
    [heroes[r][c], heroes[r2][c2]] = [heroes[r2][c2], heroes[r][c]];
    if (ok) return [[r, c], [r2, c2]];
  }
  return null;
}
// The colour grid the move search sees: settled pieces; ability gems are out while silenced.
const colours = (game) => game.grid.map((row) => row.map((p) => (p && p.state === 'idle' && !(p.kind !== 'normal' && silenced(game)) ? p.hero : null)));

export const settled = (game) => game.grid.every((row) => row.every((p) => p && p.state === 'idle')) && !game.flying.length
  && !game.tasks.some((task) => task.owner === 'board') && game.time >= game.refillAt;

// --- the user's moves -----------------------------------------------------------------------------

export const canPlay = (game) => game.phase === 'active' && !hasMod(game.player, 'stun') && !game.frozen && !game.outOfMoves;
export const canGrab = (game, r, c) => canPlay(game) && game.grid[r]?.[c]?.state === 'idle';

// Swaps two neighbouring pieces. Only a swap that makes a match stays («нельзя двигать самоцветы, если
// не собирается ряд»); another one goes back. Returns 'swap', 'refused' or null (not possible now).
export function trySwap(game, a, b) {
  const [r1, c1] = a, [r2, c2] = b;
  if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1 || !canGrab(game, r1, c1) || !canGrab(game, r2, c2)) return null;
  const p = game.grid[r1][c1], q = game.grid[r2][c2];
  const heroes = colours(game);
  [heroes[r1][c1], heroes[r2][c2]] = [heroes[r2][c2], heroes[r1][c1]];
  const line = (r, c) => { const v = heroes[r][c]; if (v == null) return false; let h = 1, w = 1;
    for (let k = c - 1; heroes[r][k] === v; k--) h++; for (let k = c + 1; heroes[r][k] === v; k++) h++;
    for (let k = r - 1; heroes[k]?.[c] === v; k--) w++; for (let k = r + 1; heroes[k]?.[c] === v; k++) w++; return h >= 3 || w >= 3; };
  const ok = line(r1, c1) || line(r2, c2);
  const time = SWAP_TIME * slowFactor(game);
  game.hint = null; game.lastMove = game.time;
  if (!ok) {
    game.stats.refused++;
    for (const [piece, r, c] of [[p, r2, c2], [q, r1, c1]]) Object.assign(piece, { state: 'swap', t: 0, dur: time, fromX: piece.c, fromY: piece.r, toX: c, toY: r, back: true });
    sound(game, 'match3.piece_released.fail');
    return 'refused';
  }
  game.stats.swaps++;
  game.grid[r1][c1] = q; game.grid[r2][c2] = p;
  for (const [piece, r, c] of [[p, r2, c2], [q, r1, c1]]) Object.assign(piece, { state: 'swap', t: 0, dur: time, fromX: piece.c, fromY: piece.r, toX: c, toY: r, back: false, r, c });
  p.moved = game.time; q.moved = game.time;
  sound(game, 'match3.piece_released.success');
  return 'swap';
}

// --- modifiers ------------------------------------------------------------------------------------

export const hasMod = (unit, name) => !!unit?.mods.some((m) => m.name === name);
const getMod = (unit, name) => unit?.mods.find((m) => m.name === name);
function addMod(game, unit, name, duration, data = {}) {
  let m = getMod(unit, name);
  if (m) Object.assign(m, { left: Math.max(m.left, duration), duration: Math.max(m.duration, duration) }, data);
  else { m = { name, left: duration, duration, tick: 0, ...data }; unit.mods.push(m); }
  event(game, 'modifier', { unit: unit === game.player ? 'player' : 'opponent', name });
  return m;
}
// Frost Attack: «самоцветы двигаются медленнее» — slow 300 % = everything on the board takes 4× as long.
const slowFactor = (game) => { const m = getMod(game.player, 'frost_attack'); return m ? 1 + m.slow / 100 : 1; };
const magicImmune = (opp) => hasMod(opp, 'black_king_bar');
// The opponent's time runs at 1 / clamp(1 + Σ slow % / 100, 0.1, 10) (FUN_182bb2c60): every slow is its own
// modifier with its own timer, and their percentages add up.
export const opponentTimeScale = (opp) => 1 / clamp(1 + (opp?.mods || []).reduce((sum, m) => sum + (m.name === 'slow' ? m.pct : 0), 0) / 100, 0.1, 10);

// The user's health. Cold Embrace blocks physical damage; Ice Blast stops all healing; each Hypothermia
// stack takes 25 % off it.
function hurtPlayer(game, amount, { kind = 'default', physical = false, source = null } = {}) {
  if (game.phase !== 'active' || amount <= 0) return 0;
  if (physical && hasMod(game.player, 'cold_embrace')) { event(game, 'blocked', { unit: 'player' }); return 0; }
  const p = game.player;
  p.health = Math.max(0, p.health - amount);
  event(game, 'playerDamage', { amount: Math.round(amount), kind, source });
  if (p.health <= 0) lose(game);
  return amount;
}
export function healPlayer(game, amount, source = null, quiet = false) {
  if (amount <= 0 || game.phase === 'lost') return 0;
  const p = game.player;
  if (hasMod(p, 'ice_blast')) return 0;
  const hypo = getMod(p, 'hypothermia');
  const factor = hypo ? Math.max(0, 1 - hypo.stacks * hypo.reduction / 100) : 1;
  const gained = Math.min(p.maxHealth - p.health, amount * factor);
  p.health += gained;
  if (gained > 0 && !quiet) event(game, 'heal', { amount: gained, source });
  return gained;
}

function tickMods(game, dt) {
  // the user's
  const p = game.player;
  for (const m of [...p.mods]) {
    m.left -= dt;
    if (m.dps) { // damage over time: a tick a second (damage_interval 1)
      m.tick += dt;
      // a tick every damage_interval for damage / floor(duration / interval), magical (FUN_182b9a150)
      while (m.tick >= m.interval && m.left > -1e-9) { m.tick -= m.interval; hurtPlayer(game, m.perTick ?? m.dps * m.interval, { kind: 'magic', source: m.name }); sound(game, m.tickSound); }
    }
    if (m.hps) {
      m.healed = (m.healed || 0) + healPlayer(game, m.hps * Math.min(dt, Math.max(0, m.left + dt)), m.name, true);
      m.healTick = (m.healTick || 0) + dt;
      if ((m.healTick >= 1 || m.left <= 0) && m.healed > 0.5) { event(game, 'heal', { amount: m.healed, source: m.name }); m.healed = 0; m.healTick = 0; }
    }
    if (m.left <= 0) {
      p.mods.splice(p.mods.indexOf(m), 1);
      event(game, 'modifierEnd', { unit: 'player', name: m.name });
      if (m.name === 'cold_feet' && m.matchesLeft > 0 && game.phase === 'active') {
        addMod(game, p, 'stun', m.stun, { from: 'cold_feet' });
        sound(game, 'match3.ancient_apparition.cold_feet.freeze');
      }
    }
  }
  // the opponent's
  const o = game.opponent;
  if (o) for (const m of [...o.mods]) {
    m.left -= dt;
    if (m.left <= 0) { o.mods.splice(o.mods.indexOf(m), 1); event(game, 'modifierEnd', { unit: 'opponent', name: m.name }); }
  }
}

// --- the opponent ---------------------------------------------------------------------------------

function startLevel_(game, index) {
  const { config } = game, level = config.levels[index];
  game.level = index;
  const def = config.opponents[level.opponent];
  game.opponent = { def, level, health: def.maxHealth, maxHealth: def.maxHealth, mods: [], state: 'intro', serial: (game.opponent?.serial || 0) + 1,
    queue: def.intro.slice(), current: null, actionIndex: 0, cooldown: 0, interrupted: false, anim: null };
  game.frozen = true;
  event(game, 'level', { index, opponent: def.name, kind: level.kind });
  nextIntro(game);
}

// Intro actions one after the other: stage_intro (the «Уровень 1-1 / name» band: 2 s, boss 3 s,
// friendly 2 s; the board is frozen), activity/spawn animations, the Winter Cleric's Healing Salve.
function nextIntro(game) {
  const o = game.opponent, serial = o.serial;
  const item = o.queue.shift();
  if (!item) { beginFight(game); return; }
  const run = () => {
    if (game.opponent?.serial !== serial) return;
    const kind = o.level.kind;
    let duration = 0;
    switch (item.action) {
      case 'stage_intro': case 'stage_intro_boss': case 'stage_intro_friendly':
        duration = STAGE_INTRO[kind] ?? num(item.params.duration, 2);
        game.stageIntro = true;
        event(game, 'stageIntro', { kind, duration });
        later(game, duration, () => { if (game.opponent?.serial === serial) { game.stageIntro = false; game.frozen = false; o.state = 'active'; event(game, 'opponentActive'); } }, 'opp');
        break;
      case 'spawn_animation': duration = 1.2; o.anim = { name: 'spawn', at: game.time }; break;
      case 'activity_animation': {
        const low = num(item.params.min_duration, 0), high = num(item.params.max_duration, 0);
        duration = item.params.activity === 'ACT_DOTA_FLEE' ? 0 : (high > 0 ? low + game.random() * (high - low) : 1.5);
        o.anim = { name: { ACT_DOTA_VICTORY: 'victory', ACT_DOTA_GREET: 'greet', ACT_DOTA_FLEE: 'flee', ACT_DOTA_ATTACK: 'attack' }[item.params.activity] || 'idle', at: game.time };
        if (item.params.activity === 'ACT_DOTA_FLEE') { o.state = 'leaving'; event(game, 'opponentLeaves'); duration = 1.2; }
        break;
      }
      case 'healing_salve':
        duration = 0.6;
        o.anim = { name: 'cast', at: game.time };
        sound(game, 'match3.healing_salve');
        addMod(game, game.player, 'healing_salve', num(item.params.heal_duration, 3), { hps: num(item.params.heal_amount, 300) / num(item.params.heal_duration, 3), buff: true });
        event(game, 'opponentAction', { action: 'healing_salve' });
        break;
      default: duration = num(item.params.duration, 0);
    }
    // the board thaws once the stage band is gone even when the rest of the intro is still playing
    if (!game.frozen && o.state === 'intro') { o.state = 'active'; event(game, 'opponentActive'); }
    later(game, duration, () => { if (game.opponent?.serial === serial) nextIntro(game); }, 'opp');
  };
  // An action's m_flCooldown before it (the Cleric waits 3 s before she flees).
  if (item.cooldown > 0) later(game, item.cooldown, run, 'opp'); else run();
}

function beginFight(game) {
  const o = game.opponent;
  if (!o.def.repeat.length) { // the Winter Cleric: heals, leaves, the next stage comes
    o.state = 'gone';
    later(game, 0.4, () => nextLevel(game), 'opp');
    return;
  }
  o.state = 'active'; game.frozen = false; game.stageIntro = false;
  o.actionIndex = 0; setAction(game, 0);
  event(game, 'fight');
}
function setAction(game, index) {
  const o = game.opponent;
  o.actionIndex = index % o.def.repeat.length;
  o.current = o.def.repeat[o.actionIndex];
  o.cooldown = o.current.cooldown; o.interrupted = false;
}

// The opponent's clock (CMatch3Opponent::Think, FUN_182bcad70): the current action's cooldown runs down
// at the slowed time scale, and the action goes off at zero; a stun stops the clock and interrupts the
// action («--»): once the stun is over the interrupted action is thrown away and the next one's cooldown
// starts (FUN_182bcd620).
function tickOpponent(game, dt) {
  const o = game.opponent;
  if (!o || o.state !== 'active' || !o.current || game.phase !== 'active') return;
  if (hasMod(o, 'stun')) { if (!o.interrupted) { o.interrupted = true; event(game, 'interrupted'); } return; }
  if (o.interrupted) { setAction(game, o.actionIndex + 1); }
  o.cooldown -= dt * opponentTimeScale(o);
  if (o.cooldown <= 0) {
    const action = o.current;
    perform(game, action);
    setAction(game, o.actionIndex + 1);
  }
}

// A damage-over-time modifier's numbers: a tick each `interval` for damage / floor(duration / interval).
const dot = (damage, duration, interval, tickSound) => ({ dps: damage / duration, perTick: damage / Math.max(1, Math.floor(duration / interval + 1e-9)), interval, tickSound });

function perform(game, item) {
  const o = game.opponent, serial = o.serial, P = item.params, def = game.config.actions[item.action];
  o.anim = { name: item.action === 'basic_attack' || item.action === 'crit_attack' || item.action === 'chaos_strike' || item.action === 'hypothermia' ? 'attack' : 'cast', at: game.time };
  event(game, 'opponentAction', { action: item.action, image: def?.image });
  const hit = (fn) => later(game, ATTACK_IMPACT, () => { if (game.opponent?.serial === serial && o.state === 'active' && game.phase === 'active') fn(); }, 'opp');
  // RandomFloat(min_damage, max_damage); crits multiply it by crit_percent / 100, nothing is rounded
  const attackRoll = () => { const low = num(P.min_damage, 20), high = num(P.max_damage, 30); return low + game.random() * (high - low); };
  const impact = () => { sound(game, o.def.impactSound); event(game, 'screenHit', { effect: o.def.screenEffect }); };
  switch (item.action) {
    case 'basic_attack':
      hit(() => { impact(); hurtPlayer(game, attackRoll(), { physical: true, source: 'basic_attack' }); });
      break;
    case 'crit_attack':
      hit(() => { impact(); hurtPlayer(game, attackRoll() * num(P.crit_percent, 200) / 100, { kind: 'crit', physical: true, source: 'crit_attack' }); });
      break;
    case 'chaos_strike':
      hit(() => {
        sound(game, 'match3.chaos_knight.chaos_strike'); event(game, 'screenHit', { effect: o.def.screenEffect });
        const dealt = hurtPlayer(game, attackRoll() * num(P.crit_percent, 200) / 100, { kind: 'crit', physical: true, source: 'chaos_strike' });
        if (dealt > 0) healOpponent(game, dealt * num(P.lifesteal_percent, 70) / 100);
      });
      break;
    case 'chaos_bolt':
      sound(game, 'match3.chaos_knight.chaos_bolt.cast');
      projectile(game, { kind: 'chaos_bolt', from: OPPONENT_AT, to: PLAYER_AT, speed: 12, owner: 'opp', onArrive: () => {
        if (game.opponent?.serial !== serial || game.phase !== 'active') return;
        sound(game, 'match3.chaos_knight.chaos_bolt.impact');
        hurtPlayer(game, num(P.damage, 20), { kind: 'magic', source: 'chaos_bolt' });
        addMod(game, game.player, 'stun', num(P.stun_duration, 3), { from: 'chaos_bolt' });
      } });
      break;
    case 'cold_feet':
      sound(game, 'match3.ancient_apparition.cold_feet.cast');
      hit(() => addMod(game, game.player, 'cold_feet', num(P.debuff_duration, 5), { ...dot(num(P.damage, 25), num(P.debuff_duration, 5), num(P.damage_interval, 1), 'match3.ancient_apparition.cold_feet.tick'), matchesLeft: num(P.match_count, 5), stun: num(P.stun_duration, 4), number: num(P.match_count, 5) }));
      break;
    case 'ice_blast':
      hit(() => {
        sound(game, 'match3.ancient_apparition.ice_blast.impact');
        hurtPlayer(game, num(P.impact_damage, 20), { kind: 'magic', source: 'ice_blast' });
        addMod(game, game.player, 'ice_blast', num(P.duration, 10), dot(num(P.damage_over_time, 30), num(P.duration, 10), num(P.damage_interval, 1), 'match3.ancient_apparition.ice_blast.tick'));
      });
      break;
    case 'icefire_bomb':
      sound(game, 'match3.ancient_ice_shaman.icefire_bomb.cast');
      projectile(game, { kind: 'icefire_bomb', from: OPPONENT_AT, to: PLAYER_AT, speed: 10, owner: 'opp', onArrive: () => {
        if (game.opponent?.serial !== serial || game.phase !== 'active') return;
        hurtPlayer(game, num(P.impact_damage, 20), { kind: 'magic', source: 'icefire_bomb' });
        addMod(game, game.player, 'icefire_bomb', num(P.duration, 4), dot(num(P.damage_over_time, 20), num(P.duration, 4), num(P.damage_interval, 1), 'match3.ancient_ice_shaman.icefire_bomb.tick'));
      } });
      break;
    case 'butt_slam':
      hit(() => {
        sound(game, 'match3.ancient_frostbitten_golem.butt_slam');
        event(game, 'shake', { strength: 2 });
        hurtPlayer(game, num(P.damage, 50), { physical: true, source: 'butt_slam' });
        slamBoard(game, P);
      });
      break;
    case 'hypothermia':
      hit(() => {
        sound(game, 'match3.drow_ranger.attack'); impact();
        hurtPlayer(game, num(P.damage, 35), { kind: 'magic', source: 'hypothermia' }); // magical: Cold Embrace does not stop it
        const m = getMod(game.player, 'hypothermia');
        const stacks = (m?.stacks || 0) + 1;
        addMod(game, game.player, 'hypothermia', num(P.duration, 30), { stacks, number: stacks, reduction: num(P.heal_reduction_percent, 25) });
        getMod(game.player, 'hypothermia').left = num(P.duration, 30);
      });
      break;
    case 'gust':
      sound(game, 'match3.drow_ranger.gust');
      hit(() => addMod(game, game.player, 'gust', num(P.duration, 10)));
      break;
    case 'black_king_bar':
      sound(game, 'match3.black_king_bar');
      // magic immunity: stuns and slows already on stay, new ones do not land (except Frost Nova's slow)
      addMod(game, o, 'black_king_bar', num(P.duration, 10), { buff: true });
      break;
    case 'frost_attack':
      sound(game, 'match3.frost_dragon.frost_attack');
      projectile(game, { kind: 'frost_attack', from: OPPONENT_AT, to: PLAYER_AT, speed: 14, owner: 'opp', onArrive: () => {
        if (game.opponent?.serial !== serial || game.phase !== 'active') return;
        impact();
        hurtPlayer(game, num(P.damage, 35), { physical: true, source: 'frost_attack' });
        addMod(game, game.player, 'frost_attack', num(P.duration, 10), { slow: num(P.slow_percent, 300) });
      } });
      break;
    case 'walrus_punch':
      hit(() => { sound(game, 'match3.tusk.walrus_punch'); impact(); hurtPlayer(game, attackRoll() * num(P.crit_percent, 200) / 100, { kind: 'crit', physical: true, source: 'walrus_punch' }); });
      break;
    default: break;
  }
}

function healOpponent(game, amount) {
  const o = game.opponent; if (!o || amount <= 0) return;
  const gained = Math.min(o.maxHealth - o.health, amount);
  o.health += gained;
  if (gained > 0) event(game, 'opponentHeal', { amount: gained });
}

// Damage to the opponent: matched pieces (physical, 1 each), abilities (magical — none under Black King Bar).
function hurtOpponent(game, amount, { magic = false, source = null, at = null } = {}) {
  const o = game.opponent;
  if (!o || o.state !== 'active' || o.level.kind === 'friendly' || game.phase !== 'active' || amount <= 0) return 0;
  if (magic && magicImmune(o)) { event(game, 'blocked', { unit: 'opponent', source }); return 0; }
  const dealt = Math.min(o.health, amount);
  o.health -= amount;
  game.damageDealt += dealt;
  event(game, 'opponentDamage', { amount, kind: magic ? 'magic' : 'default', source, at });
  if (o.anim?.name !== 'attack' && o.anim?.name !== 'cast') o.anim = { name: 'hit', at: game.time };
  // Insatiable Hunger: lifesteal off every match attack (200 %).
  const hunger = getMod(game.player, 'insatiable_hunger');
  if (hunger && source === 'match') healPlayer(game, dealt * hunger.lifesteal / 100, 'insatiable_hunger');
  if (o.health <= 0) opponentDies(game);
  return dealt;
}
function stunOpponent(game, duration, from) {
  const o = game.opponent; if (!o || o.state !== 'active' || magicImmune(o)) return;
  addMod(game, o, 'stun', duration, { from });
}
// Every slow is a modifier of its own (they add up, see opponentTimeScale); Frost Nova's lands even under
// Black King Bar (`ignoreImmunity`).
function slowOpponent(game, pct, duration, from, ignoreImmunity = false) {
  const o = game.opponent; if (!o || o.state !== 'active' || (!ignoreImmunity && magicImmune(o))) return;
  o.mods.push({ name: 'slow', left: duration, duration, tick: 0, pct, from });
  event(game, 'modifier', { unit: 'opponent', name: 'slow' });
}

function opponentDies(game) {
  const o = game.opponent, level = o.level;
  o.state = 'dying'; o.health = 0; o.anim = { name: 'death', at: game.time };
  game.frozen = true;
  game.score += level.score;
  event(game, 'opponentDefeated', { score: level.score, opponent: o.def.name });
  game.tasks = game.tasks.filter((task) => task.owner !== 'opp');
  game.projectiles = game.projectiles.filter((pr) => pr.owner !== 'opp');
  const last = game.level >= game.config.levels.length - 1;
  later(game, o.def.outro.find((x) => x.action === 'death_animation')?.params.max_duration === 4 ? 3 : DEATH_TIME, () => (last ? win(game) : nextLevel(game)));
}
function nextLevel(game) {
  if (game.phase !== 'active') return;
  if (game.level + 1 >= game.config.levels.length) { win(game); return; }
  startLevel_(game, game.level + 1);
}
function win(game) {
  if (game.phase !== 'active') return;
  game.phase = 'won'; game.frozen = true;
  event(game, 'won', { score: game.score });
}
function lose(game) {
  if (game.phase !== 'active') return;
  game.phase = 'lost'; game.frozen = true;
  if (game.opponent) game.opponent.anim = { name: 'victory', at: game.time };
  event(game, 'lost', { score: game.score });
}

// --- projectiles ----------------------------------------------------------------------------------

// A projectile from → to (board units) at `speed` cells/s; `via` is a list of points to pass through.
function projectile(game, { kind, from, to, speed, hero = null, owner = 'board', onArrive, via = [] }) {
  const points = [from, ...via, to];
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  const duration = Math.max(0.05, length / speed);
  const pr = { id: game.nextId++, kind, hero, points, t0: game.time, t1: game.time + duration, owner };
  game.projectiles.push(pr);
  later(game, duration, () => { game.projectiles.splice(game.projectiles.indexOf(pr), 1); onArrive?.(); }, owner === 'opp' ? 'opp' : 'fx');
  return pr;
}
export function projectileAt(pr, time) {
  const f = clamp((time - pr.t0) / (pr.t1 - pr.t0), 0, 1), pts = pr.points;
  let total = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); total += d; }
  let along = f * total;
  for (let i = 0; i < seg.length; i++) {
    if (along <= seg[i] || i === seg.length - 1) { const k = seg[i] ? clamp(along / seg[i], 0, 1) : 1; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k, f }; }
    along -= seg[i];
  }
  return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, f };
}
const centre = (p) => ({ x: p.c + 0.5, y: p.r + 0.5 });

// --- clearing pieces --------------------------------------------------------------------------------

// A piece leaves the board (matched or destroyed): it disappears (0.15 s), a match attack flies to the
// opponent for 1 damage, and an ability gem casts its ability. A gem destroyed by an ability is handled as
// a group of one (FUN_182b891b0): no score of its own, the combo does not grow. Returns whether it was taken.
function clearPiece(game, p, { cause = 'match', combo = 1 } = {}) {
  if (!p || (p.state !== 'idle' && p.state !== 'fall' && p.state !== 'convert')) return false;
  p.state = 'clear'; p.t = 0; p.dur = DISAPPEAR; p.cause = cause; p.combo = Math.max(p.combo || 0, combo);
  game.piecesCleared++;
  event(game, 'clear', { id: p.id, hero: p.hero, kind: p.kind, x: p.c + 0.5, y: Math.min(p.y, p.r) + 0.5, cause });
  const from = { x: p.c + 0.5, y: p.y + 0.5 };
  projectile(game, { kind: 'attack', hero: p.hero, from, to: OPPONENT_AT, speed: ATTACK_SPEED, onArrive: () => hurtOpponent(game, 1, { source: 'match', at: from }) });
  if (p.kind !== 'normal') {
    if (silenced(game)) event(game, 'silencedGem', { x: from.x, y: from.y });
    else if (game.deferred) game.deferred.push(p); // a match's gems go off once the whole group is taken
    else cast(game, p);
  }
  return true;
}

// A match (FUN_182b87fc0): its pieces go; 4 in a group make an ability gem of the hero's super ability,
// 5 or more its ultra ability. The upgraded gem is the group's «median»: the gem with the least sum of
// Manhattan distances to all the others (the first one on a tie); the others merge into it (0.26 s).
// Score: a fixed sum by the group's size (MATCH_SCORE). The combo grows by one for every group and resets
// once the board is at rest; it only picks the sound piece_matched(.2…8).
export function upgradeTarget(pieces) {
  let best = null, bestSum = Infinity;
  for (const p of pieces) {
    let sum = 0;
    for (const q of pieces) sum += Math.abs(p.c - q.c) + Math.abs(p.r - q.r);
    if (sum < bestSum) { best = p; bestSum = sum; }
  }
  return best;
}
function resolveMatch(game, group) {
  const { pieces, runs } = group;
  game.combo++; game.matches++;
  const combo = game.combo, count = pieces.length;
  const longest = runs.reduce((a, b) => (b.length > a.length ? b : a));
  const upgrade = count >= 4 ? upgradeTarget(pieces) : null;
  const score = matchScore(count);
  game.score += score;
  const mid = upgrade || longest[Math.floor(longest.length / 2)];
  event(game, 'match', { hero: group.hero, count, combo, score, x: mid.c + 0.5, y: mid.r + 0.5, ids: pieces.map((p) => p.id) });
  if (!upgrade) sound(game, combo <= 1 ? 'match3.piece_matched' : `match3.piece_matched.${Math.min(8, combo)}`);
  // Cold Feet: matches dispel it
  const feet = getMod(game.player, 'cold_feet');
  if (feet) { feet.matchesLeft--; feet.number = Math.max(0, feet.matchesLeft); if (feet.matchesLeft <= 0) { game.player.mods.splice(game.player.mods.indexOf(feet), 1); event(game, 'modifierEnd', { unit: 'player', name: 'cold_feet', dispelled: true }); } }
  // every gem of the group is taken first, then the ability gems among them go off (as in client.dll)
  const deferred = game.deferred = [];
  for (const p of pieces) {
    if (p === upgrade) continue;
    if (upgrade) {
      clearPiece(game, p, { cause: 'merge', combo });
      Object.assign(p, { state: 'merge', t: 0, dur: MERGE * slowFactor(game), fromX: p.c, fromY: p.r, toX: upgrade.c, toY: upgrade.r });
    } else clearPiece(game, p, { combo });
  }
  if (upgrade) {
    const kind = count >= 5 ? 'ultra' : 'super';
    // the upgraded gem still counts as matched: its attack flies too, and an ability gem there goes off
    const from = centre(upgrade);
    projectile(game, { kind: 'attack', hero: upgrade.hero, from, to: OPPONENT_AT, speed: ATTACK_SPEED, onArrive: () => hurtOpponent(game, 1, { source: 'match', at: from }) });
    if (upgrade.kind !== 'normal') { if (silenced(game)) event(game, 'silencedGem', { x: from.x, y: from.y }); else deferred.push({ ...upgrade }); }
    upgrade.state = 'upgrade'; upgrade.t = 0; upgrade.dur = MERGE * slowFactor(game); upgrade.next = kind;
    game.piecesCleared++;
    sound(game, kind === 'ultra' ? 'match3.piece_merged.ultra' : 'match3.piece_merged.super');
  }
  game.deferred = null;
  for (const p of deferred) cast(game, p);
}

// --- abilities --------------------------------------------------------------------------------------

function cellsWithin(game, r0, c0, radius) {
  const out = [];
  for (let r = 0; r < game.config.rows; r++) for (let c = 0; c < game.config.cols; c++) if (Math.hypot(r - r0, c - c0) <= radius + 1e-9) out.push([r, c]);
  return out;
}
const destroyAt = (game, r, c, cause) => clearPiece(game, game.grid[r]?.[c], { cause });
// Gems an ability may target (FUN_182bb8ee0): any gem nothing else is busy with, ability gems and the
// caster's own hero included.
const available = (p) => !!p && (p.state === 'idle' || p.state === 'fall') && !p.reserved;
const randomPieces = (game, filter, n) => {
  const list = [];
  for (const row of game.grid) for (const p of row) if (available(p) && filter(p)) list.push(p);
  const out = [];
  while (out.length < n && list.length) out.push(list.splice(Math.floor(game.random() * list.length), 1)[0]);
  return out;
};

function cast(game, p) {
  const hero = game.config.heroes[p.hero], name = p.kind === 'ultra' ? hero.ultra : hero.super;
  const ab = game.config.abilities[name], P = ab?.params || {};
  const r0 = p.r, c0 = p.c, at = centre(p);
  game.stats.abilities++;
  // SuperPieceTriggered / UltraPieceTriggered score events: 150 / 450, titled with the ability's name
  const score = ABILITY_SCORE[p.kind] || 0;
  game.score += score;
  event(game, 'ability', { name, hero: p.hero, kind: p.kind, x: at.x, y: at.y, score, locName: ab?.locName });
  switch (name) {
    case 'lina_dragon_slave': { // a wave of fire straight from the gem to the opponent: every gem under it, then 20 damage
      sound(game, 'match3.lina.dragon_slave');
      const speed = num(P.projectile_speed, 10);
      // FUN_182b8f8e0 / FUN_182b90e20: each step the wave destroys the gem in the cell it is flying over
      const dx = OPPONENT_AT.x - at.x, dy = OPPONENT_AT.y - at.y, length = Math.hypot(dx, dy), seen = new Set([`${r0},${c0}`]);
      for (let d = 0; d <= length; d += 0.05) {
        const x = at.x + dx * d / length, y = at.y + dy * d / length;
        if (x < 0 || y < 0 || x >= game.config.cols || y >= game.config.rows) continue;
        const r = Math.floor(y), c = Math.floor(x), k = `${r},${c}`;
        if (seen.has(k)) continue;
        seen.add(k);
        later(game, d / speed, () => destroyAt(game, r, c, name), 'board');
      }
      projectile(game, { kind: 'dragon_slave', hero: p.hero, from: at, to: OPPONENT_AT, speed, onArrive: () => hurtOpponent(game, num(P.damage, 20), { magic: true, source: name }) });
      break;
    }
    case 'lina_light_strike_array': // at once: every gem within 2.5, 25 damage and a 5-s stun (FUN_182b8fb40)
      sound(game, 'match3.lina.light_strike_array');
      for (const [r, c] of cellsWithin(game, r0, c0, num(P.radius, 2.5))) destroyAt(game, r, c, name);
      if (hurtOpponent(game, num(P.damage, 25), { magic: true, source: name }) > 0) stunOpponent(game, num(P.stun_duration, 5), name);
      break;
    case 'crystal_maiden_crystal_nova': // at once: gems within 1.5, 10 damage, slow 50 % for 6 s (explosion_delay is not read)
      sound(game, 'match3.crystal_maiden.crystal_nova');
      for (const [r, c] of cellsWithin(game, r0, c0, num(P.radius, 1.5))) destroyAt(game, r, c, name);
      hurtOpponent(game, num(P.damage, 10), { magic: true, source: name });
      slowOpponent(game, num(P.slow_percentage, 50), num(P.slow_duration, 6), name);
      break;
    case 'crystal_maiden_freezing_field': { // 30 ice shards over 10 s (at T/n, 2T/n … T), each takes a random gem within 2.5
      const n = num(P.explosions, 30), duration = num(P.duration, 10), radius = num(P.radius, 2.5);
      const wind = { name: 'match3.crystal_maiden.freezing_field.wind' };
      sound(game, wind.name, { handle: 'freezing_field', duration });
      event(game, 'freezingField', { x: at.x, y: at.y, radius, duration });
      for (let i = 1; i <= n; i++) later(game, i * duration / n, () => {
        const cells = cellsWithin(game, r0, c0, radius).filter(([r, c]) => available(game.grid[r][c]));
        if (!cells.length) return;
        const [r, c] = pick(game, cells);
        sound(game, 'match3.crystal_maiden.freezing_field.explosion');
        event(game, 'iceShard', { x: c + 0.5, y: r + 0.5 });
        destroyAt(game, r, c, name);
      }, 'fx');
      break;
    }
    case 'lich_frost_nova': // at once: gems within 1.5, 15 damage, slow 100 % for 3 s — the slow lands even under BKB
      sound(game, 'match3.lich.frost_nova');
      for (const [r, c] of cellsWithin(game, r0, c0, num(P.radius, 1.5))) destroyAt(game, r, c, name);
      hurtOpponent(game, num(P.damage, 15), { magic: true, source: name });
      slowOpponent(game, num(P.slow_percentage, 100), num(P.slow_duration, 3), name, true);
      break;
    case 'lich_chain_frost': { // n = bounces (12) down to 0: the opponent when n % interval == 0 (n = 12, 9, 6, 3, 0), a random gem otherwise
      sound(game, 'match3.lich.chain_frost.cast');
      const bounces = num(P.bounces, 12), every = num(P.opponent_bounce_interval, 3), speed = num(P.projectile_speed, 10);
      let from = at;
      const flight = (n) => {
        if (n < 0 || game.phase !== 'active') return;
        if (n % every === 0) {
          projectile(game, { kind: 'chain_frost', hero: p.hero, from, to: OPPONENT_AT, speed, onArrive: () => {
            sound(game, 'match3.lich.chain_frost.impact.hero');
            hurtOpponent(game, num(P.damage, 15), { magic: true, source: name });
            from = OPPONENT_AT; flight(n - 1);
          } });
        } else {
          const [target] = randomPieces(game, () => true, 1);
          if (!target) return; // no gem to bounce to: the chain breaks
          target.reserved = true;
          const to = centre(target);
          projectile(game, { kind: 'chain_frost', hero: p.hero, from, to, speed, onArrive: () => {
            target.reserved = false;
            sound(game, 'match3.lich.chain_frost.impact.creep');
            if (game.grid[target.r]?.[target.c] === target) clearPiece(game, target, { cause: name });
            from = centre(target); flight(n - 1);
          } });
        }
      };
      flight(bounces);
      break;
    }
    case 'vengefulspirit_magic_missile': // 20 damage and a 2-s stun
      sound(game, 'match3.vengefulspirit.magic_missile.cast');
      projectile(game, { kind: 'magic_missile', hero: p.hero, from: at, to: OPPONENT_AT, speed: num(P.projectile_speed, 10), onArrive: () => {
        sound(game, 'match3.vengefulspirit.magic_missile.impact');
        if (hurtOpponent(game, num(P.damage, 20), { magic: true, source: name }) > 0) stunOpponent(game, num(P.stun_duration, 2), name);
      } });
      break;
    case 'vengefulspirit_nether_swap': { // a random gem of another hero: every gem of that hero becomes Vengeful Spirit's
      sound(game, 'match3.vengefulspirit.nether_swap');
      // FUN_182b90220 picks a gem, not a hero: a hero with more gems on the board is likelier
      const [victim] = randomPieces(game, (q) => q.hero !== p.hero, 1);
      if (!victim) break;
      convert(game, (q) => q.hero === victim.hero && !q.reserved, p.hero, num(P.swap_duration, 0.6), Infinity);
      break;
    }
    case 'broodmother_spawn_spiderlings': { // 12 spiderlings turn random other pieces into Broodmother's
      sound(game, 'match3.broodmother.spawn_spiderlings.cast');
      const targets = randomPieces(game, (q) => q.hero !== p.hero, num(P.spider_count, 12));
      for (const q of targets) {
        q.reserved = true;
        projectile(game, { kind: 'spiderling', hero: p.hero, from: at, to: centre(q), speed: num(P.projectile_speed, 7), onArrive: () => {
          q.reserved = false;
          if (game.grid[q.r]?.[q.c] !== q || (q.state !== 'idle' && q.state !== 'fall')) return;
          sound(game, 'match3.broodmother.spawn_spiderlings.impact');
          convert(game, (x) => x === q, p.hero, num(P.swap_duration, 0.6), 1);
        } });
      }
      break;
    }
    case 'broodmother_insatiable_hunger': // lifesteal 200 % off matches for 10 s
      sound(game, 'match3.broodmother.insatiable_hunger', { handle: 'insatiable_hunger' });
      addMod(game, game.player, 'insatiable_hunger', num(P.duration, 10), { lifesteal: num(P.lifesteal_percent, 200), buff: true, image: ab.image });
      break;
    case 'broodmother_spin_web': // not in crownfall_act3's heroes; kept for completeness: free drag within 2.5
      sound(game, 'match3.broodmother.spin_web.cast');
      game.web = { r: r0, c: c0, radius: num(P.radius, 2.5), until: game.time + num(P.duration, 10) };
      break;
    case 'winter_wyvern_splinter_blast': { // 5 splinters: the first hits the opponent (15), the others take random pieces
      sound(game, 'match3.winter_wyvern.splinter_blast.target');
      const n = num(P.splinter_count, 5), speed = num(P.projectile_speed, 5);
      projectile(game, { kind: 'splinter', hero: p.hero, from: at, to: OPPONENT_AT, speed, onArrive: () => { sound(game, 'match3.winter_wyvern.splinter_blast.splinter'); hurtOpponent(game, num(P.damage, 15), { magic: true, source: name }); } });
      for (const q of randomPieces(game, (x) => x !== p, n - 1)) {
        q.reserved = true;
        projectile(game, { kind: 'splinter', hero: p.hero, from: at, to: centre(q), speed, onArrive: () => {
          q.reserved = false; sound(game, 'match3.winter_wyvern.splinter_blast.splinter');
          if (game.grid[q.r]?.[q.c] === q) clearPiece(game, q, { cause: name });
        } });
      }
      break;
    }
    case 'winter_wyvern_cold_embrace': // heals 150 over 8 s; no physical damage meanwhile
      sound(game, 'match3.winter_wyvern.cold_embrace');
      addMod(game, game.player, 'cold_embrace', num(P.duration, 8), { hps: num(P.heal, 150) / num(P.duration, 8), buff: true, image: ab.image });
      break;
    default: break; // the four unused heroes' abilities have no parameters in the data
  }
}

// Pieces change hero (Nether Swap, spiderlings): a short transformation, then they can match again.
function convert(game, filter, hero, duration, limit) {
  let n = 0;
  for (const row of game.grid) for (const q of row) {
    if (n >= limit || !q || (q.state !== 'idle' && q.state !== 'fall') || !filter(q)) continue;
    q.prevHero = q.hero; q.hero = hero; q.state = 'convert'; q.t = 0; q.dur = duration; n++;
    event(game, 'convert', { id: q.id, hero, x: q.c + 0.5, y: q.r + 0.5 });
  }
  return n;
}

// Body Slam: every piece is thrown off the board; after the wait new ones fall in.
function slamBoard(game, P) {
  const wait = num(P.wait_duration, 2.4), spread = num(P.spread_duration, 0.3);
  for (const row of game.grid) for (let c = 0; c < row.length; c++) {
    const p = row[c]; if (!p) continue;
    if (p.state === 'clear' || p.state === 'merge') continue;
    const angle = (num(P.min_angle_offset, 45) + game.random() * (num(P.max_angle_offset, 315) - num(P.min_angle_offset, 45))) * Math.PI / 180 - Math.PI / 2;
    const speed = 6 + game.random() * 6;
    game.flying.push({ ...p, state: 'slam', vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 8, delay: game.random() * spread, spin: (game.random() - 0.5) * 12, t: 0 });
    row[c] = null;
  }
  game.refillAt = game.time + wait;
  game.hint = null;
  event(game, 'slam');
}

// --- the board's motion ---------------------------------------------------------------------------

function stepBoard(game, dt) {
  const { rows, cols } = game.config, slow = slowFactor(game);
  // timers of pieces in motion
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const p = game.grid[r][c];
    if (!p) continue;
    if (p.state === 'swap' || p.state === 'merge' || p.state === 'upgrade' || p.state === 'convert' || p.state === 'clear' || p.state === 'shuffle') {
      p.t += dt;
      if (p.t < p.dur) continue;
      if (p.state === 'swap' && p.back) { // a refused swap comes back
        Object.assign(p, { t: 0, fromX: p.toX, fromY: p.toY, toX: p.c, toY: p.r, back: false, returning: true });
        continue;
      }
      if (p.state === 'clear' || p.state === 'merge') { game.grid[r][c] = null; game.colChain[c] = Math.max(game.colChain[c] || 0, p.combo || 1); continue; }
      if (p.state === 'upgrade') { p.kind = p.next; event(game, 'upgraded', { id: p.id, kind: p.kind, hero: p.hero }); }
      p.state = 'idle'; p.returning = false; p.y = p.r; p.x = p.c; p.vy = 0;
    }
  }
  // gravity: pieces above a hole fall into it; a piece busy with something else holds the ones above
  if (game.time >= game.refillAt) {
    for (let c = 0; c < cols; c++) {
      let target = rows - 1;
      for (let r = rows - 1; r >= 0; r--) {
        const p = game.grid[r][c];
        if (!p) continue;
        if (p.state !== 'idle' && p.state !== 'fall') { target = r - 1; continue; }
        if (r !== target) {
          game.grid[target][c] = p; game.grid[r][c] = null; p.r = target;
          if (p.state === 'idle') { p.state = 'fall'; p.vy = 0; }
          p.chain = Math.max(p.chain || 0, game.colChain[c] || 0);
        }
        target--;
      }
      // new pieces into the empty cells at the top (only when nothing holds them)
      let topBusy = false;
      for (let r = 0; r <= target; r++) if (game.grid[r][c]) topBusy = true;
      if (!topBusy && target >= 0) {
        let above = 0; // (new pieces start above the column's highest one)
        for (let r = 0; r < rows; r++) { const p = game.grid[r][c]; if (p) { above = Math.min(above, p.y); break; } }
        // CMatch3BoardModifier_NewPieces: one cell apart, starting a cell above the column's top gem
        let y = above - 1;
        for (let r = target; r >= 0; r--) {
          const p = newPiece(game, Math.floor(game.random() * game.config.heroes.length), r, c, y);
          p.state = 'fall'; p.vy = 0; p.chain = game.colChain[c] || 0; game.grid[r][c] = p; y -= 1;
        }
      }
    }
  }
  // falling
  for (let c = 0; c < cols; c++) for (let r = rows - 1; r >= 0; r--) {
    const p = game.grid[r][c];
    if (!p || p.state !== 'fall') continue;
    // speed += 50 cells/s² × the user's time (dt / slow), no speed limit (FUN_182bcbfd0)
    p.vy += GRAVITY / slow / slow * dt;
    p.y += p.vy * dt;
    const below = game.grid[r + 1]?.[c];
    if (below && below.state === 'fall' && p.y > below.y - 1) { p.y = below.y - 1; p.vy = Math.min(p.vy, below.vy); }
    if (p.y >= p.r) { p.y = p.r; p.state = 'idle'; p.landed = game.time; p.vy = 0; event(game, 'land', { id: p.id }); }
  }
  for (let c = 0; c < cols; c++) if (game.colChain[c] && !game.grid.some((row) => row[c]?.state === 'fall' || row[c]?.state === 'clear' || row[c]?.state === 'merge')) game.colChain[c] = 0;
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const p = game.grid[r][c];
    if (p && p.state === 'idle' && p.chain && p.landed !== game.time) p.chain = 0;
  }
  // thrown pieces (Body Slam)
  for (const f of [...game.flying]) {
    f.t += dt;
    if (f.t < f.delay) continue;
    f.vy += 30 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.y > rows + 4 || f.x < -6 || f.x > cols + 6) game.flying.splice(game.flying.indexOf(f), 1);
  }
}

// --- the loop ---------------------------------------------------------------------------------------

export function step(game, dt) {
  let left = Math.min(dt, 0.25);
  while (left > 1e-9) { const h = Math.min(STEP, left); tick(game, h); left -= h; }
  return game.events.splice(0);
}

function tick(game, dt) {
  game.time += dt;
  // the countdown before the first stage (the board fills meanwhile)
  if (game.phase === 'countdown') {
    const before = Math.ceil(game.countdown);
    game.countdown -= dt;
    const now = Math.ceil(game.countdown);
    if (now !== before && now >= 1) {
      event(game, 'countdown', { value: now - 1 });
      sound(game, now - 1 === 0 ? 'match3.countdown.go' : 'match3.countdown.tick');
    }
    if (game.countdown <= 0) { game.phase = 'active'; startLevel_(game, game.startLevel || 0); }
  }
  // tasks
  if (game.tasks.length) {
    const due = game.tasks.filter((task) => task.at <= game.time);
    if (due.length) {
      game.tasks = game.tasks.filter((task) => task.at > game.time);
      due.sort((a, b) => a.at - b.at);
      for (const task of due) task.run();
    }
  }
  if (game.phase === 'active') { tickMods(game, dt); tickOpponent(game, dt); }
  stepBoard(game, dt);
  if (game.phase === 'won' || game.phase === 'lost') return;
  // matches among settled pieces
  const groups = findGroups(game);
  for (const group of groups) resolveMatch(game, group);
  if (game.phase !== 'active' && game.phase !== 'countdown') return;
  // the combo resets once everything has come to rest; hints; out of moves → shuffle
  if (settled(game)) {
    game.combo = 0;
    if (game.phase === 'active' && !game.outOfMoves) {
      const move = findMove(colours(game));
      if (!move) { game.outOfMoves = game.time + OUT_OF_MOVES_TIME; game.hint = null; event(game, 'outOfMoves'); }
      else if (!game.hint && !game.frozen && game.time - Math.max(game.lastMove, game.settledAt || 0) > HINT_DELAY) { game.hint = { cells: move, at: game.time }; event(game, 'hint', { cells: move }); }
    }
    if (game.settledAt == null) game.settledAt = game.time;
  } else { game.settledAt = null; if (game.hint && !settled(game)) game.hint = null; }
  if (game.outOfMoves && game.time >= game.outOfMoves) { game.outOfMoves = 0; shuffle(game); }
}

// The board shuffled in place (Valve's BoardShuffler): the same pieces, no ready match, at least one move.
export function shuffle(game) {
  const { rows, cols } = game.config;
  const pieces = game.grid.flat().filter(Boolean);
  for (let attempt = 0; attempt < 400; attempt++) {
    for (let i = pieces.length - 1; i > 0; i--) { const j = Math.floor(game.random() * (i + 1)); [pieces[i], pieces[j]] = [pieces[j], pieces[i]]; }
    const heroes = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => pieces[r * cols + c]?.hero ?? null));
    const tooMany = (r, c) => { const v = heroes[r][c]; return (c >= 2 && heroes[r][c - 1] === v && heroes[r][c - 2] === v) || (r >= 2 && heroes[r - 1][c] === v && heroes[r - 2][c] === v); };
    let clean = true;
    for (let r = 0; r < rows && clean; r++) for (let c = 0; c < cols && clean; c++) if (tooMany(r, c)) clean = false;
    if (!clean || !hasMove(heroes)) {
      if (attempt > 300) for (const p of pieces) if (p.kind === 'normal') p.hero = Math.floor(game.random() * game.config.heroes.length); // a stubborn board gets new colours
      continue;
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const p = pieces[r * cols + c];
      Object.assign(p, { state: 'shuffle', t: 0, dur: SHUFFLE_TIME, fromX: p.c, fromY: p.r, toX: c, toY: r, r, c });
      game.grid[r][c] = p;
    }
    sound(game, 'match3.piece_grab');
    event(game, 'shuffle');
    return true;
  }
  return false;
}

// Where a piece is drawn now (board units, top-left of its cell) and how far its timer is.
export function piecePosition(p) {
  if (p.state === 'swap' || p.state === 'merge' || p.state === 'shuffle') {
    const k = clamp(p.t / p.dur, 0, 1), e = p.state === 'merge' ? k * k : k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);
    return { x: p.fromX + (p.toX - p.fromX) * e, y: p.fromY + (p.toY - p.fromY) * e };
  }
  if (p.state === 'slam') return { x: p.x, y: p.y };
  return { x: p.c, y: p.state === 'fall' ? p.y : p.r };
}

// The opponents' queue as the HUD shows it: the current action first, then the rest of the cycle.
export function actionQueue(game) {
  const o = game.opponent;
  if (!o || !o.def.repeat.length) return [];
  const n = o.def.repeat.length, out = [];
  for (let i = 0; i < n; i++) out.push({ ...o.def.repeat[(o.actionIndex + i) % n], index: (o.actionIndex + i) % n, current: i === 0 });
  return out;
}

// Rewards reached with a score (the setup screen's rows).
export const rewardsReached = (score) => REWARDS.filter((at) => score >= at).length;
