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
  // «Still here» from an open tab: no view, but it keeps the visitor on the site now.
  clock += 20 * 60_000; stats.cache.clear();
  assert.equal(stats.report(7).online, 0);
  stats.visit('editor', 'a', { ping: true }); stats.cache.clear();
  const later = stats.report(7);
  assert.equal(later.online, 1); assert.equal(later.series.views[later.days.indexOf(today)], 4, 'no view added');
});

test('statistics over HTTP: pages count visits, only admins read the report', async (t) => {
  const [{ CatalogStore }, , { createCatalogAPI }] = await modules;
  const store = new CatalogStore(':memory:', 'test-site-stats-http');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-site-stats-http', admins: new Set(['900000099']), database: ':memory:', media: '/nonexistent' };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const signIn = (id) => { const r = accounts.begin(`ip-${id}`, `b-${id}`); accounts.candidate(r.id, { id: Number(id), first_name: 'U', is_bot: false }); accounts.approve(r.id, Number(id), true); return accounts.finish(r.id, r.verifier, id).session; };
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const call = (path, { method = 'GET', body, session, agent } = {}) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: config.origin,
    Cookie: session ? `gs_account=${session}` : '', ...(agent ? { 'User-Agent': agent } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  // The page's own id: the same visitor however many requests made cookies (none here, as on a first visit).
  const visitor = 'AbCdEfGhIjKlMnOpQrStUv';
  assert.equal((await call('/hit', { method: 'POST', body: { page: 'workshop', referrer: 'youtube.com', visitor } })).status, 204);
  await call('/hit', { method: 'POST', body: { page: 'editor', visitor } });
  // Robots and programs are not counted.
  await call('/hit', { method: 'POST', body: { page: 'home' }, agent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
  await call('/hit', { method: 'POST', body: { page: 'home' }, agent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/152.0.0.0 Safari/537.36' });
  assert.equal((await call('/hit', { method: 'POST', body: { event: 'grid-export', visitor } })).status, 204);
  assert.equal((await call('/hit', { method: 'POST', body: { event: 'login' } })).status, 204, 'server-only events are ignored, not refused');
  const user = signIn('1102'), admin = signIn('900000099');
  assert.equal((await call('/admin/stats?days=7', { session: user })).status, 403);
  const report = await (await call('/admin/stats?days=7', { session: admin })).json();
  assert.equal(report.period.visitors, 1, 'one visitor, robots aside'); assert.equal(report.period.views, 2); assert.equal(report.top.referrers[0].host, 'youtube.com');
  assert.equal(report.series.gridExports.at(-1), 1);
  assert.equal(report.series.registrations.at(-1), 2);
});

test('statistics: where people and new accounts come from, live numbers', async (t) => {
  const [{ CatalogStore }, { SiteStats, mskDay, sourceOf }] = await modules;
  const store = new CatalogStore(':memory:', 'test-site-stats-sources'); t.after(() => store.close());
  let clock = Date.UTC(2026, 9, 3, 12); store.now = () => clock;
  const stats = new SiteStats(store, { live: false });
  for (const [host, source] of [['t.me', 'telegram'], ['www.youtube.com', 'youtube'], ['m.youtube.com', 'youtube'], ['youtu.be', 'youtube'], ['google.ru', 'google'], ['ya.ru', 'yandex'],
    ['vt.tiktok.com', 'tiktok'], ['tg', 'telegram'], ['discord.gg', 'discord'], ['example.org', 'other'], ['', 'direct'], ['notyoutube.com', 'other']]) assert.equal(sourceOf(host), source, host);

  // A visitor from YouTube who then looks around counts once, for YouTube; another came straight.
  stats.visit('home', 'yt', { referrer: 'youtube.com' }); stats.visit('editor', 'yt'); stats.visit('guides', 'straight');
  // The page's note: the first visit came from a TikTok link with utm marks.
  stats.signup('2001', { referrer: 'www.tiktok.com', page: 'home', utm: { source: 'tiktok', campaign: 'осень<script>' }, at: clock - 60_000, signup: 'editor' });
  // No note (an old page): the browser's first visit on record.
  stats.signup('2002', {}, 'yt');
  // utm_source names a site the referrer does not; an unknown utm site is «другой сайт».
  stats.signup('2003', { referrer: '', page: 'workshop', utm: { source: 'vk' } });
  stats.signup('2004', { utm: { source: 'mysite.net' }, page: 'home' });
  // Nothing at all: unknown. Twice: kept once.
  stats.signup('2005', { referrer: 'javascript:alert(1)', page: '../../etc' });
  stats.signup('2001', { referrer: 'google.com', page: 'home' });
  const rows = Object.fromEntries(store.all('SELECT * FROM signup_sources').map((row) => [row.account, row]));
  assert.deepEqual([rows[2001].source, rows[2001].referrer, rows[2001].landing, rows[2001].signup, JSON.parse(rows[2001].utm)], ['tiktok', 'tiktok.com', 'home', 'editor', { source: 'tiktok', campaign: 'осеньscript' }]);
  assert.equal(rows[2001].first_seen, clock - 60_000);
  assert.deepEqual([rows[2002].source, rows[2002].referrer, rows[2002].landing], ['youtube', 'youtube.com', 'home'], 'from the visits');
  assert.equal(rows[2003].source, 'vk'); assert.deepEqual([rows[2004].source, rows[2004].referrer], ['other', 'mysite.net']);
  assert.deepEqual([rows[2005].source, rows[2005].referrer, rows[2005].landing], ['unknown', '', '']);

  const profile = (account, created) => store.run('INSERT INTO profiles(account, key, nickname, folded, created) VALUES(?,?,?,?,?)', account, `key${account}`.padEnd(12, 'x'), `n${account}`, `n${account}`, created);
  for (const account of ['2001', '2002', '2003', '2005']) profile(account, clock);
  profile('1999', clock - 30 * 86_400_000);
  const report = stats.report(7);
  assert.deepEqual(Object.fromEntries(report.top.sources.map((row) => [row.source, row.visitors])), { youtube: 1, direct: 1 }, 'each visitor once');
  assert.deepEqual(Object.fromEntries(report.top.signups.map((row) => [row.source, row.accounts])), { tiktok: 1, youtube: 1, vk: 1, unknown: 1 }, 'the period\'s new profiles');
  assert.equal(report.top.signups.find((row) => row.source === 'tiktok').label, 'TikTok');

  // Live: who is here now and where, today's numbers, the last hour minute by minute.
  stats.sample(); clock += 60_000; stats.visit('guides', 'late'); stats.sample();
  const live = stats.live();
  assert.equal(live.online, 3); assert.equal(live.at, clock);
  assert.deepEqual(live.pages.find((row) => row.page === 'guides'), { page: 'guides', label: 'Гайды', visitors: 2 });
  assert.equal(live.today.visitors, 3); assert.equal(live.today.registrations, 4);
  assert.deepEqual(live.minutes.map((row) => row.online), [2, 3, 3]);
  clock += 10 * 60_000;
  assert.equal(stats.live().online, 0, 'five minutes without a word');
  for (let i = 0; i < 70; i += 1) stats.sample();
  assert.equal(stats.minutes.length, 60, 'an hour');
  assert.equal(stats.pageLabel('profile:key2001xxxxx'), 'Профиль n2001');
  assert.equal(mskDay(clock), report.today);
});

test('statistics: a new account keeps where it came from at its first sign-in; the live numbers are for admins', async (t) => {
  const [{ CatalogStore }, , { createCatalogAPI }] = await modules;
  const store = new CatalogStore(':memory:', 'test-site-stats-signup');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-site-stats-signup', admins: new Set(['900000099']), database: ':memory:', media: '/nonexistent' };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const call = (path, { method = 'GET', body, cookie = '' } = {}) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: config.origin, Cookie: cookie },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const signIn = async (id, source) => {
    const start = await call('/auth/start', { method: 'POST' }), login = start.headers.get('set-cookie').match(/gs_login=([^;]+)/)[1], { id: request } = await start.json();
    accounts.candidate(request, { id: Number(id), first_name: 'U', is_bot: false }); accounts.approve(request, Number(id), true);
    const finish = await call('/auth/finish', { method: 'POST', body: { id: request, userId: id, source }, cookie: `gs_login=${login}` });
    assert.equal(finish.status, 200);
    return finish.headers.get('set-cookie').match(/gs_account=([^;]+)/)[1];
  };
  const visitor = 'ZyXwVuTsRqPoNmLkJiHgFe';
  await call('/hit', { method: 'POST', body: { page: 'guides', referrer: 'youtube.com', visitor } });
  await signIn('2101', { referrer: 'youtube.com', page: 'guides', utm: { source: 'youtube', campaign: 'guide' }, at: Date.now() - 1000, signup: 'guides', visitor });
  await signIn('2102', { visitor });
  await signIn('2101', { referrer: 'google.com', page: 'home' });
  const rows = Object.fromEntries(store.all('SELECT account, source, landing, signup FROM signup_sources').map((row) => [row.account, row]));
  assert.deepEqual({ ...rows[2101] }, { account: '2101', source: 'youtube', landing: 'guides', signup: 'guides' }, 'kept at the first sign-in, not the next');
  assert.equal(rows[2102].source, 'youtube', 'without a note: the first visit of the same browser');
  const admin = await signIn('900000099', {});
  assert.equal((await call('/admin/stats/live', { cookie: `gs_account=${await signIn('2103', {})}` })).status, 403);
  const live = await (await call('/admin/stats/live', { cookie: `gs_account=${admin}` })).json();
  assert.equal(live.online, 1); assert.deepEqual(live.pages.map((row) => row.label), ['Гайды']); assert.ok(live.today.registrations >= 0);
  const users = await (await call('/admin/users?source=youtube', { cookie: `gs_account=${admin}` })).json();
  assert.deepEqual(users.items.map((user) => user.id).sort(), ['2101', '2102']);
  const anna = users.items.find((user) => user.id === '2101');
  assert.deepEqual({ ...anna.came, firstSeen: typeof anna.came.firstSeen }, { source: 'youtube', label: 'YouTube', site: 'youtube.com', utm: { source: 'youtube', campaign: 'guide' }, landing: 'Гайды', signup: 'Гайды', firstSeen: 'number' });
  assert.equal(users.total, 2); assert.equal(users.all, 4);
  assert.deepEqual(Object.fromEntries(users.sources.map((row) => [row.source, row.accounts])), { youtube: 2, unknown: 2 }, 'nothing known of the others');
});
