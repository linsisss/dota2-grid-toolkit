const test = require('node:test');
const assert = require('node:assert/strict');

// A STRATZ answer for the five positions: rows [heroId, wins, matches] per position.
const answer = (positions, week = 1788998400) => ({ data: { heroStats: Object.fromEntries(positions.map((rows, i) =>
  [`p${i + 1}`, rows.map(([heroId, winCount, matchCount]) => ({ week, heroId, winCount, matchCount }))])) } });

test('meta ranking: a popularity floor, then win rate; groups, sorting a group, a group\'s position', async () => {
  const { rankHeroes, metaGroups, orderByMeta, positionOfGroup, META_SHARE } = await import('../scripts/hero-meta.mjs');
  assert.equal(META_SHARE, 0.01);
  // 1: 52 % of 5000 games, 2: 60 % but 0.5 % of the games, 3: 55 %, 4: 48 %.
  const rows = [{ id: 1, wins: 2600, matches: 5000 }, { id: 2, wins: 30, matches: 50 }, { id: 3, wins: 1100, matches: 2000 }, { id: 4, wins: 1440, matches: 3000 }];
  assert.deepEqual(rankHeroes(rows).map((hero) => hero.id), [3, 1, 4], 'the rare 60 % pick is left out');
  assert.ok(Math.abs(rankHeroes(rows)[0].winRate - 0.55) < 1e-9);
  assert.deepEqual(rankHeroes(rows, { known: new Set([1, 4]) }).map((hero) => hero.id), [1, 4], 'heroes the site does not know are left out');
  assert.deepEqual(rankHeroes([]), []);
  const meta = { positions: [rows, rows.slice(0, 2), [], rows, rows] };
  assert.deepEqual(metaGroups(meta, 2), [[3, 1], [1], [], [3, 1], [3, 1]]);
  // Pick rate: every match has two players on a position, so it is twice the share (1 → 2 of 10 000).
  assert.ok(Math.abs(rankHeroes(rows)[0].pickRate - 2 * 2000 / 10050) < 1e-9);
  assert.equal((await import('../scripts/hero-meta.mjs')).metaNumber(0.5321), '53,2');
  assert.equal((await import('../scripts/hero-meta.mjs')).metaNumber(0.081, 'en-US'), '8.1');
  assert.deepEqual(metaGroups(meta, 0)[0], [3, 1, 4], '0 is every hero that passes');
  // A group keeps its heroes: ranked ones first, the others after them as they were.
  assert.deepEqual(orderByMeta([9, 4, 2, 1, 3], rows), [3, 1, 4, 9, 2]);
  assert.deepEqual(['КЕРРИ', 'МИД', 'ОФФЛЕЙН', 'ПОДДЕРЖКА', 'ПОЛНАЯ ПОДДЕРЖКА', 'CARRY', 'MID', 'OFFLANE', 'SUPPORT', 'HARD SUPPORT', 'Хард саппорт', 'Мой пул'].map(positionOfGroup),
    [0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 4, 0]);
});

test('STRATZ is asked by the server with its key, once per rank group for hours, and the last answer outlives an outage', async () => {
  const { HeroMeta, META_TTL } = await import('../server/hero-meta.mjs');
  let now = 1_000_000, calls = [], fail = false;
  const fetch = async (url, options) => {
    calls.push({ url, options });
    if (fail) throw new Error('down');
    return { ok: true, json: async () => answer([[[1, 52, 100], [2, 48, 100]], [[3, 10, 20]], [], [], [[4, 1, 2], [5, -1, 2], [0, 1, 1]]]) };
  };
  const meta = new HeroMeta({ token: 'secret', fetch, now: () => now });
  const [first, same] = await Promise.all([meta.get('divine_immortal'), meta.get('divine_immortal')]);
  assert.equal(calls.length, 1, 'requests at the same time share one');
  assert.equal(first, same);
  assert.equal(calls[0].url, 'https://api.stratz.com/graphql');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret');
  const { query } = JSON.parse(calls[0].options.body);
  assert.match(query, /bracketIds: \[DIVINE, IMMORTAL\]/);
  for (let position = 1; position <= 5; position++) assert.match(query, new RegExp(`p${position}: winWeek\\(take: 1, .*positionIds: \\[POSITION_${position}\\], gameModeIds: \\[ALL_PICK_RANKED\\]`));
  assert.equal(first.week, '2026-09-10');
  assert.deepEqual(first.positions[0], [{ id: 1, wins: 52, matches: 100 }, { id: 2, wins: 48, matches: 100 }]);
  assert.deepEqual(first.positions[4], [{ id: 4, wins: 1, matches: 2 }], 'rows that make no sense are dropped');
  await meta.get('divine_immortal');
  assert.equal(calls.length, 1, 'kept for the TTL');
  await meta.get('all');
  assert.doesNotMatch(JSON.parse(calls[1].options.body).query, /bracketIds/, 'every rank: no rank filter');
  // After the TTL STRATZ is asked again; when it is down, the last answer is served.
  now += META_TTL + 1; fail = true;
  assert.equal(await meta.get('divine_immortal'), first);
  assert.equal(calls.length, 3);
  await assert.rejects(new HeroMeta({ token: 'secret', fetch, now: () => now }).get('divine_immortal'), (error) => error.status === 502);
  await assert.rejects(meta.get('immortal_only'), (error) => error.status === 400);
  await assert.rejects(new HeroMeta({ token: '', fetch }).get('all'), (error) => error.status === 503);
});

test('the API serves the meta without the key and the meta grid fits the canvas', async (t) => {
  const [{ CatalogStore }, { createCatalogAPI }, { HeroMeta }, { default: C }] = await Promise.all([
    import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs'), import('../server/hero-meta.mjs'), import('../scripts/core.mjs')]);
  const store = new CatalogStore(':memory:', 'test-meta');
  const heroMeta = new HeroMeta({ token: 'secret', fetch: async () => ({ ok: true, json: async () => answer([[[1, 5, 9]], [], [], [], []]) }) });
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-meta', admins: new Set(), database: ':memory:' };
  const { server } = createCatalogAPI(config, { store, heroMeta });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const ok = await fetch(`${base}/meta?bracket=legend_ancient`);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('cache-control'), /max-age=3600/);
  const body = await ok.text();
  assert.doesNotMatch(body, /secret/, 'the key never leaves the server');
  assert.deepEqual(JSON.parse(body).positions[0], [{ id: 1, wins: 5, matches: 9 }]);
  assert.equal((await fetch(`${base}/meta?bracket=nope`)).status, 400);

  // The user's look (02.10.2026): a meta group per position — a row of portraits with the pick and
  // win rates under each hero and «PICKRATE / WINRATE» to the left; two columns, inside 1193 × 593.
  const measure = (text) => text.length * 9;
  const ten = Array.from({ length: 10 }, (_, i) => i + 1);
  const groups = [ten, [16], ten.map((id) => id + 20), [], [17, 18]];
  const labels = groups.map((ids) => ids.map((id) => [`${id},1`, `5${id % 10},2`]));
  let doc = C.addMetaConfig(C.createDocument('x'), 'Мета · Divine–Immortal', 'МЕТА · DIVINE–IMMORTAL', groups, { labels, legend: ['STRATZ · НЕДЕЛЯ С 10.09'], measure });
  const rows = doc.entities.filter((e) => e.type === 'heroes');
  assert.deepEqual(rows.map((row) => row.name), ['КЕРРИ', 'МИД', 'ОФФЛЕЙН', 'ПОДДЕРЖКА', 'ПОЛНАЯ ПОДДЕРЖКА']);
  assert.deepEqual(rows.map((row) => row.heroIds.length), [10, 1, 10, 0, 2]);
  assert.deepEqual(doc.entities.filter((e) => e.type !== 'heroes').map((e) => e.text), ['STRATZ · НЕДЕЛЯ С 10.09', 'МЕТА · DIVINE–IMMORTAL'], 'the numbers are the groups\' own');
  assert.equal(C.warnings(doc, 0).length, 0, 'nothing outside the grid, numbers and captions included');
  const layout = C.heroLayout(rows[0]);
  assert.deepEqual([layout.cols, layout.rows], [10, 1], 'one row of ten');
  assert.ok(rows[3].x > rows[0].x + rows[0].w && rows[3].y === rows[0].y && rows[1].x === rows[0].x && rows[1].y > rows[0].y, 'two columns');
  // Under every hero its two numbers, centred; the captions left of the first portrait, on their lines.
  const placed = (row) => C.metaLabels(row);
  const first = placed(rows[0]);
  assert.equal(first.length, 10 * 2 + 2);
  const centre = (label) => label.x + 4 + label.w / 2;
  assert.ok(Math.abs(centre(first.find((l) => l.text === '1,1')) - (rows[0].x + layout.left + layout.cardW / 2)) < 0.1);
  assert.ok(Math.abs(centre(first.find((l) => l.text === '10,1')) - (rows[0].x + layout.left + 9 * layout.stepX + layout.cardW / 2)) < 0.1);
  const [pick, win] = ['PICKRATE', 'WINRATE'].map((text) => first.find((l) => l.text === text));
  assert.ok(pick.x + 4 + pick.w < rows[0].x + layout.left && pick.y === first.find((l) => l.text === '1,1').y && win.y === first.find((l) => l.text === '51,2').y);
  assert.ok(first.find((l) => l.text === '1,1').y >= rows[0].y + layout.top + layout.cardH, 'under the portraits');
  // Download: the numbers and captions are categories without heroes (counted for the limit).
  const exported = C.exportDota(doc).configs[doc.configIndex].categories;
  assert.ok(exported.some((c) => c.category_name === 'PICKRATE' && !c.hero_ids.length) && exported.some((c) => c.category_name === '53,2'));
  assert.equal(C.categoryCount(doc), 5 + 2 + 23 * 2 + 2 * 4, "five groups, two texts, two numbers a hero, captions for the four groups with heroes");
  // The numbers belong to their heroes: moved, reordered, a hero removed — they follow.
  const carry = rows[0];
  carry.x += 30; carry.heroIds = [2, 1, ...carry.heroIds.slice(2)];
  const moved = C.metaLabels(carry), lay = C.heroLayout(carry);
  assert.ok(Math.abs(centre(moved.find((l) => l.text === '2,1')) - (carry.x + lay.left + lay.cardW / 2)) < 0.1, 'hero 2 is first now, its numbers too');
  carry.heroIds = carry.heroIds.filter((id) => id !== 3);
  assert.ok(!C.metaLabels(carry).some((l) => l.text === '3,1'));
  // Kept in the project file; a malformed one is dropped.
  const saved = C.importProject(C.exportProject ? C.exportProject(doc) : JSON.parse(JSON.stringify({ ...doc, app: 'dota-grid-studio', schema: 1 })));
  assert.deepEqual(saved.entities.find((e) => e.type === 'heroes').meta.captions.map(([text]) => text), ['PICKRATE', 'WINRATE']);
  assert.equal(C.cleanMeta({ rows: { 1: [['x', 'wide']] } }).rows[1], undefined);
  assert.equal(C.cleanMeta('nope'), undefined);
  assert.throws(() => C.addMetaConfig(C.createDocument('x'), 'М', 'М', [[1]]));
  assert.throws(() => C.addMetaConfig(C.createDocument('x'), 'М', 'М', [Array.from({ length: 11 }, (_, i) => i + 1), [], [], [], []]), 'at most ten a row');
});
