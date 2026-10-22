const test = require('node:test');
const assert = require('node:assert/strict');

// Global tables of records of «Мини-игры» (server/minigames.mjs, docs/minigames.md «Таблицы рекордов»):
// run tokens, plausibility bounds from the rules, best only, ranking, weeks, Castle Carnage's sums, HTTP.
const modules = Promise.all([import('../server/catalog-store.mjs'), import('../server/minigames.mjs'), import('../server/accounts.mjs'), import('../server/catalog-api.mjs')]);
const from = (id) => ({ id: Number(id), first_name: `Имя ${id}`, username: `user_${id}`, is_bot: false });

async function fixture(t) {
  const [{ CatalogStore }, M] = await modules;
  let now = Date.UTC(2026, 9, 14, 12); // a Wednesday
  const store = new CatalogStore(':memory:', 'test-minigames', () => now); t.after(() => store.close());
  const boards = new M.MinigameBoards(store);
  // A run that took `seconds` on the server's clock.
  const play = (account, game, board, seconds, score, stats = {}, duration = seconds) => {
    const { token } = boards.start(account, game, board);
    now += seconds * 1000;
    return boards.submit(account, { token, score, duration, stats });
  };
  return { store, boards, M, play, advance: (ms) => { now += ms; }, now: () => now };
}
const refused = (fn, status) => assert.throws(fn, (error) => error.status === status);

test('a token is single use, the account’s own, and its age is the run’s time', async (t) => {
  const { boards, advance } = await fixture(t);
  const { token } = boards.start('1', 'fishing');
  refused(() => boards.submit('2', { token, score: 100, duration: 0, stats: { catches: 1 } }), 404);
  advance(20_000);
  refused(() => boards.submit('1', { token: 'x'.repeat(24), score: 100, stats: { catches: 1 } }), 404);
  refused(() => boards.submit('1', { score: 100, stats: { catches: 1 } }), 422);
  // The page claims more time than the server saw.
  const second = boards.start('1', 'fishing').token; advance(5_000);
  refused(() => boards.submit('1', { token: second, score: 100, duration: 60, stats: { catches: 1 } }), 422);
  // A refused token is spent too: no second try with other numbers.
  refused(() => boards.submit('1', { token: second, score: 100, duration: 5, stats: { catches: 1 } }), 409);
  const result = boards.submit('1', { token, score: 3_000, duration: 20, stats: { catches: 2 } });
  assert.equal(result.all.improved, true); assert.equal(result.all.rank, 1);
  refused(() => boards.submit('1', { token, score: 3_000, duration: 20, stats: { catches: 2 } }), 409);
  // Too old for a table.
  const old = boards.start('1', 'fishing').token; advance(4 * 3_600_000);
  refused(() => boards.submit('1', { token: old, score: 200, duration: 30, stats: { catches: 1 } }), 410);
  refused(() => boards.start('1', 'tetris'), 404);
  refused(() => boards.start('1', 'race', 'laps'), 404);
});

test('plausibility bounds from the rules of every game', async (t) => {
  const { play } = await fixture(t);
  // Сапёр: the score must add up; a win is five fields; cells within the fields reached.
  assert.ok(play('1', 'sweeper', '', 150, 15 * 806 + 5 * 4000 + 20 * 40, { cells: 806, stages: 5, seconds: 40, won: true }).all.improved);
  refused(() => play('1', 'sweeper', '', 150, 30_000, { cells: 806, stages: 5, seconds: 40, won: true }), 422);
  refused(() => play('1', 'sweeper', '', 150, 15 * 200, { cells: 200, stages: 0, seconds: 0, won: false }), 422); // 81 cells on the first field
  // Echo Slash on a mine opens that cell too: the first field cleared with two mines blown up is 73 cells.
  assert.ok(play('2', 'sweeper', '', 150, 15 * 73 + 4000, { cells: 73, stages: 1, seconds: 0, won: false }).all.improved);
  refused(() => play('1', 'sweeper', '', 150, 4000 + 15 * 71 + 20, { cells: 71, stages: 1, seconds: 1, won: false }), 422); // seconds only for a win
  refused(() => play('1', 'sweeper', '', 10, 15 * 300 + 4 * 4000, { cells: 300, stages: 4, seconds: 0, won: false }), 422); // four fields in 10 s
  // Гонки: 224 points a second at most; a race time between 35 and 90 s and not shorter than the run.
  assert.ok(play('1', 'race', 'endless', 60, 13_000, { hits: 2 }).all.improved);
  refused(() => play('1', 'race', 'endless', 60, 20_000), 422);
  assert.ok(play('1', 'race', 'time', 45, 3_890).all.improved);
  refused(() => play('1', 'race', 'time', 45, 2_000), 422);
  refused(() => play('1', 'race', 'time', 30, 3_890), 422);
  // Спун: ≤ 22 000 a stage (+5 000 of the story), ≥ 8 s a stage.
  assert.ok(play('1', 'spoon', '', 200, 60_000, { stage: 4 }).all.improved);
  refused(() => play('1', 'spoon', '', 200, 200_000, { stage: 4 }), 422);
  refused(() => play('1', 'spoon', '', 30, 60_000, { stage: 10 }), 422);
  refused(() => play('1', 'spoon', '', 30, 6_000, {}), 422);
  // Рыбалка: five lures, ≤ 6 000 a catch, ≥ 3 s a catch.
  refused(() => play('1', 'fishing', '', 60, 31_000, { catches: 5 }), 422);
  refused(() => play('1', 'fishing', '', 60, 13_000, { catches: 2 }), 422);
  refused(() => play('1', 'fishing', '', 5, 13_000, { catches: 5 }), 422);
  // Зауг: a win, after 120.9 s at least.
  assert.ok(play('1', 'zaug', '', 190, 2_400_000).all.improved);
  refused(() => play('1', 'zaug', '', 60, 900_000), 422);
  refused(() => play('1', 'zaug', '', 300, 9_000_000), 422);
  // Шахматы: ≤ 6 200 + 300 a second.
  assert.ok(play('1', 'chess', '', 600, 40_000, { level: 5, won: false }).all.improved);
  refused(() => play('1', 'chess', '', 60, 40_000, { level: 5 }), 422);
  // Терновый трон: a multiple of the echelon, a win takes the 12 minutes of the first floor.
  assert.ok(play('1', 'thorns', '', 800, 3 * 70_000, { echelon: 3, won: true }).all.improved);
  refused(() => play('1', 'thorns', '', 800, 3 * 70_000 + 1, { echelon: 3 }), 422);
  refused(() => play('1', 'thorns', '', 300, 2 * 60_000, { echelon: 2, won: true }), 422);
  refused(() => play('1', 'thorns', '', 30, 8 * 100_000, { echelon: 8 }), 422);
  refused(() => play('1', 'thorns', '', 900, 9 * 1000, { echelon: 9 }), 422);
  // Боец: ≤ 80 000, ≤ 800 a second.
  assert.ok(play('1', 'fighter', '', 400, 30_000, { stage: 5, won: true }).all.improved);
  refused(() => play('1', 'fighter', '', 10, 30_000, { stage: 1 }), 422);
  refused(() => play('1', 'fighter', '', 4000, 100_000, { stage: 5 }), 422);
  refused(() => play('1', 'fighter', '', 60, 0, { stage: 1 }), 422);
});

test('the best only, ties to whoever was first, ranks, the week, a time board that counts down', async (t) => {
  const { boards, play, advance } = await fixture(t);
  play('a', 'race', 'endless', 60, 5_000); advance(1000);
  play('b', 'race', 'endless', 60, 9_000); advance(1000);
  play('c', 'race', 'endless', 60, 5_000); advance(1000);
  let result = play('a', 'race', 'endless', 60, 4_000);
  assert.equal(result.all.improved, false); assert.equal(result.all.rank, 2); assert.equal(result.all.score, 5_000);
  let table = boards.top('race', 'endless', 'all', 'c');
  assert.deepEqual(table.rows.map((row) => row.score), [9_000, 5_000, 5_000]);
  assert.equal(table.me.rank, 3); // the same score, reached later
  assert.equal(table.rows[2].mine, true); assert.ok(table.rows[0].profile.key && table.rows[0].profile.name && table.rows[0].profile.avatar);
  // The race time: less is better.
  play('a', 'race', 'time', 50, 4_200); play('b', 'race', 'time', 50, 3_950);
  result = play('a', 'race', 'time', 50, 4_500);
  assert.equal(result.all.improved, false); assert.equal(result.all.score, 4_200); assert.equal(result.all.rank, 2);
  assert.equal(play('a', 'race', 'time', 50, 3_900).all.rank, 1);
  // Next week: the weekly table is new, the all-time one stays.
  advance(7 * 86_400_000);
  result = play('c', 'race', 'endless', 30, 1_000);
  assert.equal(result.week.rank, 1); assert.equal(result.week.total, 1); assert.equal(result.all.improved, false);
  assert.equal(boards.top('race', 'endless', 'week').rows.length, 1);
  assert.equal(boards.top('race', 'endless', 'all').total, 3);
  // The viewer's places on every board, and a profile's best ones.
  assert.deepEqual(Object.keys(boards.ranks('a').race).sort(), ['endless', 'time']);
  assert.deepEqual(boards.placements('a').map((p) => [p.board, p.rank]), [['time', 1], ['endless', 2]]);
  // Fifty rows at most; the viewer below them still gets the place.
  for (let i = 0; i < 55; i++) play(`u${i}`, 'race', 'endless', 60, 6_000 + i);
  table = boards.top('race', 'endless', 'all', 'c');
  assert.equal(table.rows.length, 50); assert.equal(table.total, 58); assert.equal(table.me.rank, 58);
  // An admin takes an account off; with a ban it cannot come back.
  assert.equal(boards.remove('race', 'b', { ban: true }).removed, 4); // two boards × all time and the week
  refused(() => play('b', 'race', 'endless', 60, 10_000), 403);
  assert.equal(boards.top('race', 'endless', 'all').total, 57);
});

test('Castle Carnage: a level a run, the table is the stars of all levels, then their scores', async (t) => {
  const { boards, play, M } = await fixture(t);
  const castle = require('../assets/minigames/castle/data.json');
  const { castleConfig, starsFor } = await import('../src/minigames/games/castle/logic.mjs');
  const config = castleConfig(castle), [first, second] = config.modes.normal, level = config.levels[first];
  const max = M.castleLevelMax(config, level, 5);
  refused(() => play('1', 'castle', 'stars', 6, max + 1, { mode: 'normal', level: first, seconds: 5 }), 422);
  refused(() => play('1', 'castle', 'stars', 6, 900, { mode: 'normal', level: 'barracks', seconds: 5 }), 422);
  refused(() => play('1', 'castle', 'stars', 3, 900, { mode: 'normal', level: first, seconds: 20 }), 422);
  let result = play('1', 'castle', 'stars', 20, 1_000, { mode: 'normal', level: first, seconds: 15 });
  assert.equal(result.level.stars, starsFor(level, 1_000)); assert.equal(result.score, starsFor(level, 1_000)); assert.equal(result.extra, 1_000);
  result = play('1', 'castle', 'stars', 20, 900, { mode: 'normal', level: first, seconds: 15 });
  assert.equal(result.level.improved, false); assert.equal(result.all.improved, false);
  result = play('1', 'castle', 'stars', 20, 950, { mode: 'normal', level: second, seconds: 15 });
  assert.equal(result.extra, 1_950); assert.equal(result.all.improved, true);
  play('2', 'castle', 'stars', 20, 1_000, { mode: 'normal', level: first, seconds: 15 });
  const table = boards.top('castle', '', 'week', '2');
  assert.equal(table.period, 'all'); assert.equal(table.week, false);
  assert.deepEqual(table.rows.map((row) => row.extra), [1_950, 1_000]); assert.equal(table.me.rank, 2);
});

test('over HTTP: tables for guests, runs and results for accounts, a rate limit, the hub and the profile', async (t) => {
  const [{ CatalogStore }, , , { createCatalogAPI }] = await modules;
  let now = Date.UTC(2026, 9, 14, 12);
  const store = new CatalogStore(':memory:', 'test-minigames-http', () => now);
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-minigames-http', admins: new Set(['900000009']), database: ':memory:' };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const signIn = (id) => { const r = accounts.begin(`ip-${id}`, `browser-${id}`); accounts.candidate(r.id, from(id)); accounts.approve(r.id, Number(id), true); return accounts.finish(r.id, r.verifier, id).session; };
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const as = (session) => async (path, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: config.origin, Cookie: session ? `gs_account=${session}` : '' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const player = as(signIn('701')), admin = as(signIn('900000009')), guest = as(null);
  let table = await guest('/minigames/boards/fishing');
  assert.equal(table.status, 200); assert.equal(table.body.login, true); assert.deepEqual(table.body.rows, []); assert.equal(table.body.me, null);
  assert.equal((await guest('/minigames/runs', 'POST', { game: 'fishing' })).status, 401);
  assert.equal((await guest('/minigames/boards/tetris')).status, 404);
  assert.deepEqual((await guest('/minigames/ranks')).body, { ranks: {} });
  const run = await player('/minigames/runs', 'POST', { game: 'fishing' });
  assert.equal(run.status, 200); assert.equal(run.body.board, 'score');
  now += 40_000;
  const sent = await player('/minigames/submit', 'POST', { token: run.body.token, score: 4_321, duration: 39.5, stats: { catches: 3 } });
  assert.equal(sent.status, 200, JSON.stringify(sent.body)); assert.equal(sent.body.all.improved, true); assert.equal(sent.body.all.rank, 1); assert.equal(sent.body.week.rank, 1);
  assert.equal((await player('/minigames/submit', 'POST', { token: run.body.token, score: 4_321, duration: 39.5, stats: { catches: 3 } })).status, 409);
  table = await player('/minigames/boards/fishing?period=week');
  assert.equal(table.body.login, false); assert.equal(table.body.me.rank, 1); assert.equal(table.body.rows[0].score, 4_321); assert.equal(table.body.rows[0].mine, true);
  assert.equal((await player('/minigames/ranks')).body.ranks.fishing.score.rank, 1);
  const key = table.body.rows[0].profile.key;
  const profile = await guest(`/profiles/${key}`);
  assert.deepEqual(profile.body.minigames.map((p) => [p.game, p.rank]), [['fishing', 1]]);
  // A run every 2 s: 120 results in ten minutes, then a pause.
  let last;
  for (let i = 0; i < 121; i++) {
    const { body } = await player('/minigames/runs', 'POST', { game: 'race', board: 'endless' });
    now += 2_000; // two requests in 2 s: under the site's 90 a minute
    last = await player('/minigames/submit', 'POST', { token: body.token, score: 100 + i, duration: 1 });
    if (last.status !== 200) break;
  }
  assert.equal(last.status, 429); assert.match(last.body.error, /подряд/);
  now += 120_000; // past the site's own limit of requests a minute
  // Admin removal: not for an account that is not an admin.
  assert.equal((await player(`/admin/minigames/fishing/${key}`, 'DELETE')).status, 403);
  const removed = await admin(`/admin/minigames/fishing/${key}`, 'DELETE');
  assert.equal(removed.status, 200); assert.equal(removed.body.removed, 2);
  assert.equal((await guest('/minigames/boards/fishing')).body.total, 0);
  const journal = (await admin('/admin/journal')).body.items;
  assert.equal(journal[0].label, 'Убран из таблиц рекордов: Рыбалка'); assert.equal(journal[0].kind, 'profile');
});
