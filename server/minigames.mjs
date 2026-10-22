import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fail } from './catalog-store.mjs';
import { castleConfig, starsFor, timeBonus } from '../src/minigames/games/castle/logic.mjs';

// Global leaderboards of «Мини-игры» (asked for on 2026-10-18: «сделай глобальный лидерборд в играх, где
// это возможно»). Signed-in only: a game asks for a run token when a run starts (POST /minigames/runs) and
// sends it back with the score at the end (POST /minigames/submit). The token is single use, belongs to
// the account and the game, and its age is the run's time as the server saw it: every board has bounds
// from the game's rules (docs/minigames.md, «Таблицы рекордов») that the score must fit in that time.
// A client game can still be faked by someone who plays by hand with a patched page — the bounds only
// keep the numbers believable; an admin removes a row (DELETE /admin/minigames/…).
// Each account keeps its best per board for all time and for the Moscow week (Monday 00:00).

const MSK = 3 * 3_600_000, DAY = 86_400_000;
// Weeks since 1970 starting on Mondays in Moscow (1970-01-01 was a Thursday).
export const minigameWeek = (now = Date.now()) => Math.floor((Math.floor((now + MSK) / DAY) + 3) / 7);
export const TOP = 50;
export const RUN_TTL = 3 * 3_600_000;
const int = (value, min, max) => (Number.isSafeInteger(value) && value >= min && value <= max ? value : null);
const bad = (message = 'Результат не похож на настоящий.') => fail(422, message);

// Sweeper's five fields (vdata m_vecStages): every cell of a field can count as opened — Echo Slash on a mine
// opens that cell too (it was refused as «не похож на настоящий» before, 2026-10-22), so the bound is the
// field's size, not its mine-free cells.
const SWEEPER_CELLS = [[9, 9], [11, 12], [13, 15], [14, 18], [16, 20]].map(([r, c]) => r * c);
let castle = null;
const castleData = () => (castle ||= castleConfig(JSON.parse(readFileSync(new URL('../assets/minigames/castle/data.json', import.meta.url), 'utf8'))));
// The most a Castle Carnage level gives: completion, the full time bonus at that time, every shot kept.
export function castleLevelMax(config, level, seconds) {
  const ammo = level.weapons.reduce((sum, w) => sum + (w.reloads || 0) * (config.weapons[w.name]?.points || 0), 0);
  return level.completePoints + timeBonus(level, Math.max(0, seconds)) + ammo;
}

// The boards: `order` 'desc' (more is better) or 'asc' (a time), `week` whether there is a weekly table,
// `check(score, run)` — the plausibility bounds; it returns { extra, stats } (extra breaks ties and is
// shown next to the score) or throws. `run.elapsed` is the server's seconds since the token, `run.duration`
// the page's own count (never more than elapsed), `run.stats` the few numbers the page sent.
export const MINIGAME_BOARDS = {
  // 15 a cell, 4000 a field, 20 a second left (a win only): the sum must add up exactly.
  sweeper: { score: { order: 'desc', week: true, check(score, { elapsed, stats }) {
    const cells = int(stats.cells, 0, 1000), stages = int(stats.stages, 0, 5), seconds = int(stats.seconds, 0, 1200), won = stats.won === true;
    if (cells === null || stages === null || seconds === null) bad();
    if (won !== (stages === 5) || (!won && seconds)) bad();
    if (cells > SWEEPER_CELLS.slice(0, Math.min(5, stages + 1)).reduce((a, b) => a + b, 0)) bad();
    if (score !== cells * 15 + stages * 4000 + seconds * 20) bad();
    if (elapsed < 3 + stages * 4) bad('Слишком быстро для такого счёта.');
    return { extra: 0, stats: { cells, stages, seconds, won } };
  } } },
  // Endless: 0.4 a unit, the hero flies at most 560 units a second → 224 a second.
  race: {
    endless: { order: 'desc', week: true, check(score, { elapsed, stats }) {
      if (score > 230 * elapsed + 20) bad('Слишком быстро для такого счёта.');
      return { extra: 0, stats: { hits: int(stats.hits, 0, 10_000) ?? 0 } };
    } },
    // The race won, in hundredths of a second: 20 000 units from 340 to 560 a second take ≥ 37 s; Batrider
    // finishes in about 45 s, so a later time cannot be a win.
    time: { order: 'asc', week: true, check(score, { elapsed, stats }) {
      if (score < 3_500 || score > 9_000) bad();
      if (elapsed + 1 < score / 100) bad('Слишком быстро для такого времени.');
      return { extra: 0, stats: { hits: int(stats.hits, 0, 10_000) ?? 0 } };
    } },
  },
  // A stage gives at most 10 gold chargers × 500 × 4 + the tally and the creeps ≈ 22 000; the story's
  // first exit lifts the score to 5 000; a stage takes ≥ 8 s (the count-in alone is 4).
  spoon: { score: { order: 'desc', week: true, check(score, { elapsed, stats }) {
    const stage = int(stats.stage, 1, 10_000);
    if (stage === null) bad();
    if (score > 5_000 + stage * 22_000) bad();
    if (elapsed < (stage - 1) * 8) bad('Слишком быстро для такого этапа.');
    return { extra: stage, stats: { stage } };
  } } },
  // Five lures; a catch gives at most ≈ 5 900 (rarity, variant, weight and every bonus with +10 % +10 %),
  // and a cast with the bite takes ≥ 3 s.
  fishing: { score: { order: 'desc', week: true, check(score, { elapsed, stats }) {
    const catches = int(stats.catches, 0, 5);
    if (catches === null) bad();
    if (score > 6_000 * Math.max(1, catches) || score > 30_000) bad();
    if (elapsed < 3 * Math.max(1, catches)) bad('Слишком быстро для такого улова.');
    return { extra: 0, stats: { catches } };
  } } },
  // A win only (as the page's own record): Zaug comes at 120.9 s of the track; S++++ starts at 3.2 million.
  zaug: { score: { order: 'desc', week: true, check(score, { elapsed, stats }) {
    if (score > 4_500_000) bad();
    if (elapsed < 118) bad('Слишком быстро для победы над Заугом.');
    return { extra: 0, stats: { kills: int(stats.kills, 0, 100_000) ?? 0 } };
  } } },
  // Rows of 3–7+ give 50–1000, abilities 150/450, the opponents 6 200 together.
  chess: { score: { order: 'desc', week: true, check(score, { elapsed, stats }) {
    const level = int(stats.level, 0, 50);
    if (level === null) bad();
    if (score > 6_200 + 300 * elapsed || score > 2_000_000) bad('Слишком быстро для такого счёта.');
    if (elapsed < 20) bad('Слишком быстро для такого счёта.');
    return { extra: level, stats: { level, won: stats.won === true } };
  } } },
  // Everything × the echelon (1–8): kills, crystals and chests, 10 000 for the throne room and 50 000 for
  // the Empire; the first floor lasts 12:00 (13:00 from the 6th echelon), so a win takes that long.
  thorns: { score: { order: 'desc', week: true, check(score, { elapsed, stats }) {
    const echelon = int(stats.echelon, 1, 8), won = stats.won === true;
    if (echelon === null) bad();
    if (score % echelon) bad();
    if (score > echelon * (61_000 + 1_000 * elapsed)) bad('Слишком быстро для такого счёта.');
    if (won && elapsed < 12 * 60 - 5) bad('Слишком быстро для победы.');
    return { extra: echelon, stats: { echelon, won, level: int(stats.level, 1, 100) ?? 1 } };
  } } },
  // The story: five matches; first blood, counters, damage / 2, time and health of a won round, finishers.
  fighter: { arcade: { order: 'desc', week: true, check(score, { elapsed, stats }) {
    const stage = int(stats.stage, 0, 5);
    if (stage === null) bad();
    if (score > 80_000 || score > 800 * elapsed) bad('Слишком быстро для такого счёта.');
    return { extra: stage, stats: { stage, won: stats.won === true } };
  } } },
  // Castle Carnage: a run is one level; the board is the stars of all levels (both modes), then their
  // scores (sum of the best of each level), all time only.
  castle: { stars: { order: 'desc', week: false, levels: true, check(score, { elapsed, duration, stats }) {
    const config = castleData(), mode = stats.mode === 'hard' ? 'hard' : stats.mode === 'normal' ? 'normal' : null, name = String(stats.level || '');
    if (!mode || !config.modes[mode].includes(name)) bad('Нет такого уровня.');
    const level = config.levels[name], seconds = Number(stats.seconds);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > elapsed + 1 || duration > elapsed + 1) bad();
    if (elapsed < 1) bad('Слишком быстро.');
    if (score > castleLevelMax(config, level, seconds)) bad();
    return { level: `${mode}:${name}`, stars: starsFor(level, score), stats: { mode, level: name, seconds: Math.round(seconds * 10) / 10 } };
  } } },
};
// The games' names for the admin journal (server/admin-journal.mjs).
export const MINIGAME_NAMES = { sweeper: 'Сапёр Сплин', race: 'Крылатые гонки', spoon: 'Подрывник Спун', fishing: 'Рыбалка', zaug: 'Логово Зауга',
  chess: 'Драконьи шахматы', thorns: 'Терновый трон', fighter: 'Сосулечный боец', castle: 'Замкобой' };
export const boardsOf = (game) => Object.keys(MINIGAME_BOARDS[game] || {});
const ruleOf = (game, board) => MINIGAME_BOARDS[game]?.[board] || null;

export function minigameTables(store) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS minigame_runs(token TEXT PRIMARY KEY, account TEXT NOT NULL, game TEXT NOT NULL, board TEXT NOT NULL,
      started INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS minigame_runs_started ON minigame_runs(started);
    CREATE TABLE IF NOT EXISTS minigame_scores(game TEXT NOT NULL, board TEXT NOT NULL, period TEXT NOT NULL, account TEXT NOT NULL,
      score INTEGER NOT NULL, extra INTEGER NOT NULL DEFAULT 0, duration REAL NOT NULL DEFAULT 0, stats TEXT NOT NULL DEFAULT '{}', updated INTEGER NOT NULL,
      PRIMARY KEY(game, board, period, account));
    CREATE INDEX IF NOT EXISTS minigame_scores_rank ON minigame_scores(game, board, period, score, extra, updated);
    CREATE TABLE IF NOT EXISTS minigame_levels(account TEXT NOT NULL, game TEXT NOT NULL, level TEXT NOT NULL, score INTEGER NOT NULL, stars INTEGER NOT NULL,
      updated INTEGER NOT NULL, PRIMARY KEY(account, game, level));
    CREATE TABLE IF NOT EXISTS minigame_bans(account TEXT NOT NULL, game TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(account, game))`);
}

export class MinigameBoards {
  constructor(store) { this.store = store; minigameTables(store); this.swept = 0; }
  now() { return this.store.now(); }
  periodKey(period) { return period === 'week' ? `w${minigameWeek(this.now())}` : 'all'; }
  board(game, board) {
    const name = board || boardsOf(game)[0], rule = ruleOf(game, name);
    if (!rule) fail(404, 'Нет такой таблицы.');
    return { name, rule };
  }
  // A run starts: a single-use token for the account, the game and the board.
  start(account, game, boardName) {
    const { name } = this.board(game, boardName), now = this.now();
    if (!(now - this.swept < 600_000)) { this.swept = now; this.store.run('DELETE FROM minigame_runs WHERE started<?', now - DAY); }
    const token = randomBytes(18).toString('base64url');
    this.store.run('INSERT INTO minigame_runs(token,account,game,board,started) VALUES(?,?,?,?,?)', token, String(account), game, name, now);
    return { token, game, board: name };
  }
  // The end of a run: checks the token and the bounds, keeps the best per account and period, answers with
  // the place in the table (all time and this week) and whether it is a new best there.
  submit(account, { token, score, duration, stats } = {}) {
    const id = String(account), now = this.now();
    if (typeof token !== 'string' || !/^[\w-]{24}$/.test(token)) bad('Нет токена забега.');
    const run = this.store.get('SELECT * FROM minigame_runs WHERE token=?', token);
    if (!run || run.account !== id) fail(404, 'Забег не найден. Начни новый.');
    // Spent before anything is checked: a refused result cannot be sent again with other numbers.
    if (!this.store.run('UPDATE minigame_runs SET used=1 WHERE token=? AND used=0', token).changes) fail(409, 'Этот забег уже записан.');
    return this.store.tx(() => {
      const elapsed = (now - run.started) / 1000;
      if (elapsed > RUN_TTL / 1000) fail(410, 'Забег слишком долгий для таблицы.');
      if (this.store.get('SELECT 1 x FROM minigame_bans WHERE account=? AND game=?', id, run.game)) fail(403, 'Таблица рекордов этой игры для тебя закрыта.');
      const value = Number(score), time = Number(duration ?? 0);
      if (!Number.isSafeInteger(value) || value < 1 || value > 1e9) bad();
      if (!Number.isFinite(time) || time < 0 || time > elapsed + 5) bad('Время забега не сходится.');
      const rule = ruleOf(run.game, run.board);
      const checked = rule.check(value, { elapsed, duration: time, stats: stats && typeof stats === 'object' ? stats : {} });
      if (rule.levels) return this.submitLevel(id, run, value, time, checked);
      const result = { game: run.game, board: run.board, score: value };
      for (const period of rule.week ? ['all', `w${minigameWeek(now)}`] : ['all']) {
        const improved = this.keep(run.game, run.board, period, id, value, checked.extra, time, checked.stats, rule.order);
        result[period === 'all' ? 'all' : 'week'] = { improved, ...this.place(run.game, run.board, period, id) };
      }
      return result;
    });
  }
  // Castle Carnage: the level's best, then the account's sums go to the board.
  submitLevel(id, run, value, time, { level, stars, stats }) {
    const old = this.store.get('SELECT score, stars FROM minigame_levels WHERE account=? AND game=? AND level=?', id, run.game, level);
    const levelImproved = !old || value > old.score;
    if (levelImproved) this.store.run(`INSERT INTO minigame_levels(account,game,level,score,stars,updated) VALUES(?,?,?,?,?,?)
      ON CONFLICT(account,game,level) DO UPDATE SET score=excluded.score, stars=max(stars, excluded.stars), updated=excluded.updated`, id, run.game, level, value, stars, this.now());
    else if (stars > old.stars) this.store.run('UPDATE minigame_levels SET stars=? WHERE account=? AND game=? AND level=?', stars, id, run.game, level);
    const sum = this.store.get('SELECT coalesce(sum(stars),0) stars, coalesce(sum(score),0) score, count(*) levels FROM minigame_levels WHERE account=? AND game=?', id, run.game);
    const improved = this.keep(run.game, run.board, 'all', id, sum.stars, sum.score, time, { levels: sum.levels, ...stats }, 'desc');
    return { game: run.game, board: run.board, score: sum.stars, extra: sum.score, level: { improved: levelImproved, score: value, stars },
      all: { improved, ...this.place(run.game, run.board, 'all', id) } };
  }
  keep(game, board, period, account, score, extra, duration, stats, order) {
    const old = this.store.get('SELECT score, extra FROM minigame_scores WHERE game=? AND board=? AND period=? AND account=?', game, board, period, account);
    const better = !old || (order === 'asc' ? score < old.score : score > old.score || (score === old.score && extra > old.extra));
    if (!better) return false;
    this.store.run(`INSERT INTO minigame_scores(game,board,period,account,score,extra,duration,stats,updated) VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(game,board,period,account) DO UPDATE SET score=excluded.score, extra=excluded.extra, duration=excluded.duration, stats=excluded.stats, updated=excluded.updated`,
    game, board, period, account, score, extra, Math.round(duration * 10) / 10, JSON.stringify(stats || {}), this.now());
    return true;
  }
  // The rows ahead of a row: a better score, the same with a better extra, or the same reached earlier.
  better(order) {
    return order === 'asc' ? '(score<? OR (score=? AND (extra>? OR (extra=? AND updated<?))))' : '(score>? OR (score=? AND (extra>? OR (extra=? AND updated<?))))';
  }
  place(game, board, period, account) {
    const rule = ruleOf(game, board), row = this.store.get('SELECT score, extra, updated FROM minigame_scores WHERE game=? AND board=? AND period=? AND account=?', game, board, period, account);
    const total = this.store.get('SELECT count(*) n FROM minigame_scores WHERE game=? AND board=? AND period=?', game, board, period).n;
    if (!row) return { rank: null, total };
    const ahead = this.store.get(`SELECT count(*) n FROM minigame_scores WHERE game=? AND board=? AND period=? AND ${this.better(rule.order)}`,
      game, board, period, row.score, row.score, row.extra, row.extra, row.updated).n;
    return { rank: ahead + 1, total, score: row.score, extra: row.extra };
  }
  // A table: the top 50 with nicknames and avatars (profiles), the viewer's own place.
  top(game, boardName, period = 'all', viewer = null) {
    const { name, rule } = this.board(game, boardName);
    const when = rule.week && period === 'week' ? 'week' : 'all', key = this.periodKey(when);
    const rows = this.store.all(`SELECT account, score, extra, duration, stats, updated FROM minigame_scores WHERE game=? AND board=? AND period=?
      ORDER BY score ${rule.order === 'asc' ? 'ASC' : 'DESC'}, extra DESC, updated ASC LIMIT ${TOP}`, game, name, key);
    const profiles = this.store.profiles;
    const items = rows.map((row, i) => {
      const profile = profiles.ensure(row.account);
      return { rank: i + 1, profile: { key: profile.key, name: profile.nickname, avatar: profiles.avatarURL(profile) }, score: row.score, extra: row.extra,
        duration: row.duration, stats: JSON.parse(row.stats || '{}'), updated: row.updated, mine: viewer !== null && row.account === String(viewer) };
    });
    const me = viewer ? this.place(game, name, key, String(viewer)) : null;
    return { game, board: name, boards: boardsOf(game), period: when, week: !!rule.week, order: rule.order, top: TOP,
      total: me?.total ?? this.store.get('SELECT count(*) n FROM minigame_scores WHERE game=? AND board=? AND period=?', game, name, key).n,
      rows: items, me: me && me.rank ? { rank: me.rank, score: me.score, extra: me.extra } : null };
  }
  // The viewer's all-time places on every board (the hub's cards, the profile).
  ranks(account) {
    const out = {};
    const rows = this.store.all("SELECT game, board FROM minigame_scores WHERE account=? AND period='all'", String(account));
    for (const { game, board } of rows) {
      if (!ruleOf(game, board)) continue;
      const place = this.place(game, board, 'all', String(account));
      (out[game] ||= {})[board] = { rank: place.rank, total: place.total, score: place.score, extra: place.extra };
    }
    return out;
  }
  // A profile's best places: up to `limit`, the best rank first.
  placements(account, limit = 3) {
    const list = [];
    for (const [game, boards] of Object.entries(this.ranks(account))) for (const [board, place] of Object.entries(boards)) list.push({ game, board, ...place });
    return list.filter((item) => item.rank <= TOP).sort((a, b) => a.rank - b.rank || b.total - a.total).slice(0, limit);
  }
  // An admin takes an account off a game's tables (all boards and periods); `ban` keeps it off.
  remove(game, account, { ban = false } = {}) {
    if (!MINIGAME_BOARDS[game]) fail(404, 'Нет такой игры.');
    return this.store.tx(() => {
      const removed = Number(this.store.run('DELETE FROM minigame_scores WHERE game=? AND account=?', game, String(account)).changes);
      this.store.run('DELETE FROM minigame_levels WHERE game=? AND account=?', game, String(account));
      if (ban) this.store.run('INSERT OR IGNORE INTO minigame_bans(account,game,created) VALUES(?,?,?)', String(account), game, this.now());
      else this.store.run('DELETE FROM minigame_bans WHERE account=? AND game=?', String(account), game);
      return { removed, banned: !!ban };
    });
  }
}
