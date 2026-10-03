const test = require('node:test');
const assert = require('node:assert/strict');

// «Админка → Статистика» (server/site-stats.mjs): visits and actions from the pages, the rest from the tables.
const modules = Promise.all([import('../server/catalog-store.mjs'), import('../server/site-stats.mjs'), import('../server/catalog-api.mjs')]);
const grid = { version: 3, configs: [{ config_name: 'Test', categories: [{ category_name: '@', x_position: 10, y_position: 30, width: 30, height: 30, hero_ids: [] }] }] };

test('statistics: distinct visitors, views, new visitors, online, sources, devices, downloads and the period before', async (t) => {
  const [{ CatalogStore }, { SiteStats, DAY, mskDay }] = await modules;
  const store = new CatalogStore(':memory:', 'test-site-stats'); t.after(() => store.close());
  let clock = Date.UTC(2026, 9, 3, 12); store.now = () => clock;
  const stats = new SiteStats(store), today = mskDay(clock);
  // Ten days ago: one visitor; today: two, one of them twice, from Telegram, on a phone.
  clock -= 10 * DAY; stats.visit('home', 'old');
  clock += 10 * DAY;
  stats.visit('home', 'a', { referrer: 'www.t.me', mobile: true }); stats.visit('home', 'a', { referrer: 'tiktok.com' }); stats.visit('editor', 'a');
  stats.visit('home', 'old', { account: '1101', lang: 'en' });
  assert.equal(stats.visit('../../etc', 'x'), false, 'unknown pages are not counted');
  assert.equal(stats.visit('home', ''), false);
  stats.event('grid-export', 'a'); stats.event('grid-export', 'a'); stats.event('login', '1101');
  assert.equal(stats.event('rm -rf', 'a'), false);
  const work = store.save({ title: 'Сетка', author: 'Гость', tags: ['Аниме'], grid }, { browser: 'b', ip: 'i' });
  store.moderate(work.id, { action: 'approve', revision: work.revision });
  store.countDownload('work', work.id, 'b:a');

  const report = stats.report(7), i = report.days.indexOf(today);
  assert.equal(report.days.length, 7); assert.equal(report.days.at(-1), today);
  assert.equal(report.series.visitors[i], 2); assert.equal(report.series.views[i], 4);
  assert.equal(report.series.newVisitors[i], 1, '«old» came before');
  assert.equal(report.series.members[i], 1);
  assert.equal(report.online, 2);
  assert.deepEqual(report.top.referrers, [{ host: 't.me', visitors: 1 }], 'the first source of the day, without www');
  assert.deepEqual(report.devices, { mobile: 1, desktop: 1 }); assert.deepEqual(report.languages, { en: 1, ru: 1 });
  assert.equal(report.series.gridExports[i], 2); assert.equal(report.series.logins[i], 1);
  assert.equal(report.series.gridDownloads.reduce((a, b) => a + b, 0), 1);
  assert.deepEqual(report.top.gridDownloads, [{ id: work.id, title: 'Сетка', downloads: 1 }]);
  assert.equal(report.series.grids[i], 1); assert.equal(report.series.approved[i], 1);
  assert.deepEqual(report.top.sections.map((row) => [row.label, row.visitors, row.views]), [['Главная', 2, 3], ['Студия и редактор', 1, 1]]);
  assert.equal(report.period.downloads, 3, 'workshop downloads and editor exports');
  assert.equal(report.period.visitors, 2); assert.equal(report.previous.visitors, 1, 'the ten-days-ago visit is in the week before');
  assert.equal(report.totals.visitors, 2); assert.equal(report.totals.grids, 1);
  assert.equal(stats.report(5).span, 30, 'only the offered periods');
});

test('statistics over HTTP: pages count visits, only admins read the report', async (t) => {
  const [{ CatalogStore }, , { createCatalogAPI }] = await modules;
  const store = new CatalogStore(':memory:', 'test-site-stats-http');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-site-stats-http', admins: new Set(['900000099']), database: ':memory:', media: '/nonexistent' };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const signIn = (id) => { const r = accounts.begin(`ip-${id}`, `b-${id}`); accounts.candidate(r.id, { id: Number(id), first_name: 'U', is_bot: false }); accounts.approve(r.id, Number(id), true); return accounts.finish(r.id, r.verifier, id).session; };
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const call = (path, { method = 'GET', body, session } = {}) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: config.origin, Cookie: session ? `gs_account=${session}` : '' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await call('/hit', { method: 'POST', body: { page: 'workshop', referrer: 'youtube.com' } })).status, 204);
  assert.equal((await call('/hit', { method: 'POST', body: { event: 'grid-export' } })).status, 204);
  assert.equal((await call('/hit', { method: 'POST', body: { event: 'login' } })).status, 204, 'server-only events are ignored, not refused');
  const user = signIn('1102'), admin = signIn('900000099');
  assert.equal((await call('/admin/stats?days=7', { session: user })).status, 403);
  const report = await (await call('/admin/stats?days=7', { session: admin })).json();
  assert.equal(report.period.visitors, 1); assert.equal(report.top.referrers[0].host, 'youtube.com');
  assert.equal(report.series.gridExports.at(-1), 1);
  assert.equal(report.series.registrations.at(-1), 2);
});
