const { tempMedia } = require('./temp-media.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');

// «Админка → Аналитика» (server/analytics.mjs, docs/analytics.md): the allowlist, sessions and engaged
// time, cohorts, funnels, the rollup, the history from the old counter, Metrika and who may look.
const load = () => Promise.all([import('../scripts/analytics-events.mjs'), import('../scripts/analytics-session.mjs'), import('../server/analytics-math.mjs'),
  import('../server/catalog-store.mjs'), import('../server/site-stats.mjs'), import('../server/analytics.mjs')]);
const V = (n) => `visitor${String(n).padStart(15, '0')}`; // 22 characters, like the page's ids
const S = (n) => `session${String(n).padStart(15, '0')}`;

test('event allowlist: unknown events and properties are dropped, values cut to their type', async () => {
  const [{ ANALYTICS_EVENTS, SERVER_EVENTS, validateEvent, eventKeys, ANALYTICS_PAGE, screenBucket }] = await load();
  assert.equal(validateEvent('rm -rf', {}), null);
  assert.equal(validateEvent('auth.login', {}), null, 'the server\'s own events never come from a page');
  assert.deepEqual(validateEvent('auth.login', { fresh: true }, { server: true }), { fresh: true });
  assert.deepEqual(validateEvent('customize.mod', { section: 'hudskin', mod: 'arcana_hud', extra: 'x' }), { section: 'hudskin', mod: 'arcana_hud' });
  assert.deepEqual(validateEvent('customize.mod', { section: '../etc', mod: 'a b' }), {}, 'ids are [A-Za-z0-9_.:-]');
  assert.deepEqual(validateEvent('editor.export', { type: 'exe' }), {}, 'enums');
  assert.deepEqual(validateEvent('dotadle.finish', { mode: 'daily', solved: 'yes', attempts: 99 }), { mode: 'daily', attempts: 6 }, 'ints clamp, bools are bools');
  assert.deepEqual(validateEvent('customize.build-done', { parts: ['bg', 'bg', 'font', '<x>'], mb: -5 }).parts, ['bg', 'font']);
  assert.equal(validateEvent('error.js', { message: '<script>alert(1)</script>'.repeat(30) }).message.length <= 200, true);
  assert.doesNotMatch(validateEvent('error.js', { message: '<b>x</b>' }).message, /[<>]/);
  assert.deepEqual(validateEvent('page.view', null), {}, 'no properties is fine');
  assert.deepEqual(eventKeys('customize.build-done', { parts: ['bg', 'font'] }), ['bg', 'font']);
  assert.deepEqual(eventKeys('editor.edit', {}), ['']);
  // Every entry is well-formed: an area, props with known types, a key that is one of its props.
  for (const [name, spec] of Object.entries({ ...ANALYTICS_EVENTS, ...SERVER_EVENTS })) {
    assert.match(name, /^[a-z]+\.[a-z-]+$/, name);
    assert.ok(spec.area, name);
    for (const type of Object.values(spec.props)) assert.ok(['id', 'int', 'enum', 'bool', 'text', 'ids'].includes(type.t), name);
    if (spec.key) assert.ok(spec.props[spec.key], `${name} key`);
  }
  for (const page of ['home', 'studio', 'customize', 'minigames:race', 'advertise', 'work:0b8f9c1e-1111-4222-8333-444455556666', 'seo:guide/kak-postavit-setku-geroev']) assert.match(page, ANALYTICS_PAGE, page);
  for (const page of ['../x', 'admin', 'minigames:<b>']) assert.doesNotMatch(page, ANALYTICS_PAGE, page);
  assert.equal(screenBucket(390), '360–479'); assert.equal(screenBucket(1920), '1920–2559'); assert.equal(screenBucket(0), '<360');
});

test('sessions and engaged time: 30 minutes of nothing ends a session; hidden or idle time is not engaged', async () => {
  const [, { nextSession, Engagement, SESSION_IDLE, IDLE_AFTER, zoneCountry, shortHash }] = await load();
  let n = 0; const make = () => `id${String(++n).padStart(20, '0')}`;
  const first = nextSession(null, 1000, make);
  assert.equal(first.fresh, true);
  const again = nextSession(first, 1000 + SESSION_IDLE - 1, make);
  assert.deepEqual([again.id, again.fresh, again.start], [first.id, false, 1000]);
  assert.equal(nextSession(again, again.last + SESSION_IDLE, make).fresh, true, 'idle for 30 minutes');
  assert.equal(nextSession({ id: 'short' , start: 0, last: 0 }, 10, make).fresh, true, 'a broken record starts anew');

  const e = new Engagement(0, true);
  e.input(0);
  assert.equal(e.take(30_000), 30, 'shown and active');
  e.setVisible(false, 40_000);
  assert.equal(e.take(100_000), 10, 'hidden from 40 s');
  e.setVisible(true, 100_000);
  assert.equal(e.take(100_000 + IDLE_AFTER + 60_000), IDLE_AFTER / 1000, 'no input: counted only up to the idle limit');
  e.input(400_000);
  assert.equal(e.take(405_500), 5, 'whole seconds');
  assert.equal(e.take(406_000), 1, 'the half second left is kept');
  assert.equal(zoneCountry('Europe/Moscow'), 'RU'); assert.equal(zoneCountry('Mars/Base'), '');
  assert.equal(shortHash('a.js:1:2'), shortHash('a.js:1:2')); assert.match(shortHash('x'), /^[0-9a-f]{8}$/);
});

test('periods, browser families, retention cohorts, funnels and search text', async () => {
  const [, , { periodOf, uaFamilies, retentionCohorts, weekOf, weekStart, funnelSteps, searchText, sessionSummary, mskDay, dayISO }] = await load();
  const now = Date.UTC(2026, 9, 19, 12), today = mskDay(now);
  assert.deepEqual(periodOf({ days: 7 }, now), { from: today - 6, to: today, span: 7, prevFrom: today - 13, prevTo: today - 7, today });
  assert.equal(periodOf({ days: 5 }, now).span, 30, 'only the offered spans');
  const custom = periodOf({ from: '2026-10-01', to: '2026-12-31' }, now);
  assert.deepEqual([dayISO(custom.from), dayISO(custom.to), custom.span], ['2026-10-01', '2026-10-19', 19], 'not past today');
  assert.equal(periodOf({ from: '2020-01-01', to: '2026-10-19' }, now).span, 400);

  const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  assert.deepEqual(uaFamilies(chrome), { os: 'Windows', browser: 'Chrome', device: 'desktop' });
  assert.deepEqual(uaFamilies('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), { os: 'iOS', browser: 'Safari', device: 'phone' });
  assert.deepEqual(uaFamilies('Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 YaBrowser/25.8 Mobile Safari/537.36'), { os: 'Android', browser: 'Яндекс Браузер', device: 'phone' });
  assert.equal(uaFamilies('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', { touch: true }).device, 'tablet', 'an iPad says Macintosh');

  // Cohorts: three visitors of week w0, two of week w1; who came back in which week.
  const w0 = weekOf(today) - 2, d0 = weekStart(w0);
  const firsts = new Map([['a', d0], ['b', d0 + 1], ['c', d0 + 6], ['d', d0 + 7], ['e', d0 + 8], ['old', d0 - 30]]);
  const active = [['a', d0], ['a', d0 + 8], ['b', d0 + 1], ['b', d0 + 15], ['c', d0 + 6], ['c', d0 + 9], ['d', d0 + 7], ['d', d0 + 7], ['e', d0 + 8], ['e', d0 + 14], ['old', d0 + 1], ['zzz', d0]];
  const cohorts = retentionCohorts(firsts, active, { fromWeek: w0, toWeek: w0 + 2, todayWeek: w0 + 2, maxWeeks: 12 });
  assert.deepEqual(cohorts.map((c) => [c.week - w0, c.size, c.weeks]), [[1, 2, [2, 1]], [0, 3, [3, 2, 1]]], 'newest first; only weeks that began; week 0 is everyone');
  assert.equal(cohorts[1].start, d0);

  const steps = funnelSteps([{ id: 'visit', label: 'v', visitors: new Set(['a', 'b', 'c', 'd']) }, { id: 'change', label: 'c', visitors: new Set(['a', 'b']) },
    { id: 'build', label: 'b', visitors: new Set(['a', 'c', 'x']) }, { id: 'install', label: 'i', visitors: new Set(['c']) }]);
  assert.deepEqual(steps.map((s) => s.visitors), [4, 3, 2, 1], 'a later step implies the ones before; x never entered');
  assert.deepEqual(steps.map((s) => s.dropped), [0, 1, 1, 1]);
  assert.equal(steps[2].ofPrevious, 2 / 3); assert.equal(steps[3].ofFirst, 0.25);
  assert.deepEqual(funnelSteps([{ id: 'a', label: 'a', visitors: new Set() }, { id: 'b', label: 'b', visitors: new Set(['q']) }]).map((s) => [s.visitors, s.ofPrevious]), [[0, 1], [0, 0]]);

  assert.equal(searchText('  Pudge  Arcana '), 'pudge arcana');
  for (const query of ['+7 999 123 45 67', 'me@mail.ru', 'https://x.com', 'a'.repeat(40), '<script>']) assert.equal(searchText(query), '', query);
  const summary = sessionSummary([{ pages: 1, engaged: 3 }, { pages: 3, engaged: 100 }, { pages: 1, engaged: 0, backfill: 1 }, { pages: 2, engaged: 41 }]);
  assert.deepEqual(summary, { sessions: 4, pagesPerSession: 7 / 4, bounceRate: 2 / 4, avgEngaged: 48, medianEngaged: 41, measured: 3 });
});

async function setup(t, now = Date.UTC(2026, 9, 19, 9)) {
  const [, , math, { CatalogStore }, { SiteStats }, { Analytics }] = await load();
  const store = new CatalogStore(':memory:', 'test-analytics'); t.after(() => store.close());
  let clock = now; store.now = () => clock;
  const stats = new SiteStats(store, { live: false }), analytics = new Analytics(store, stats, { timers: false });
  return { store, stats, analytics, math, tick: (ms) => { clock += ms; }, now: () => clock };
}
const ctx = (extra = {}) => ({ referrer: 'www.youtube.com', utm: { source: '', campaign: '' }, landing: 'customize', screen: '1920–2559', touch: false, lang: 'ru', blang: 'ru', zone: 'RU', ver: '2.1.0', ...extra });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const PHONE = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';

test('collect: sessions, engaged time, events, legacy counters; rollup by key, device and source; prune', async (t) => {
  const { store, analytics, math, tick, now } = await setup(t);
  const who = store.identity('visitor', V(1)), today = math.mskDay(now());
  assert.equal(analytics.collect({ s: 'bad', v: V(1) }, { who }), false);
  analytics.collect({ s: S(1), p: 'customize', hb: 0, c: ctx(), e: [['page.view', { page: 'customize' }, 0], ['customize.section', { section: 'hud' }, 100],
    ['customize.build-done', { delivery: 'command', parts: ['bg', 'font'], mb: 12, pack: `all-${'a'.repeat(64)}` }, 0], ['nope', {}, 0], ['auth.login', { fresh: true }, 0],
    ['workshop.search', { section: 'grids', length: 18, results: 0, q: '+7 999 123 45 67' }, 0], ['workshop.search', { section: 'grids', length: 5, results: 3, q: 'Pudge' }, 0],
    ['error.js', { message: 'boom', at: 'abcd1234', file: 'app.js', line: 3 }, 0]] }, { who, agent: UA, country: 'DE' });
  tick(30_000);
  analytics.collect({ s: S(1), p: 'customize', hb: 28, e: [] }, { who, agent: UA });
  analytics.collect({ s: S(1), p: 'editor', hb: 500, e: [['page.view', { page: 'editor' }, 0], ['editor.tool', { tool: 'pencil' }, 0]] }, { who, agent: UA, account: '777' });
  // Someone else's session id is not theirs to write into.
  analytics.collect({ s: S(1), p: 'home', hb: 30, e: [['page.view', { page: 'home' }, 0]] }, { who: store.identity('visitor', V(2)), agent: UA });
  const session = store.get('SELECT * FROM an_sessions');
  assert.equal(store.get('SELECT count(*) n FROM an_sessions').n, 1);
  assert.deepEqual({ pages: session.pages, engaged: session.engaged, landing: session.landing, exit: session.exit, source: session.source, referrer: session.referrer, device: session.device,
    os: session.os, browser: session.browser, country: session.country, fresh: session.fresh, account: session.account, version: session.version },
  { pages: 2, engaged: 88, landing: 'customize', exit: 'editor', source: 'youtube', referrer: 'youtube.com', device: 'desktop', os: 'Windows', browser: 'Chrome', country: 'DE', fresh: 1, account: '777', version: '2.1.0' },
  'a heartbeat adds at most 60 s; Cloudflare\'s country wins over the time zone');
  assert.equal(store.get("SELECT count(*) n FROM an_events WHERE name='auth.login'").n, 0, 'server-only names from a page are dropped');
  assert.deepEqual(store.all("SELECT props FROM an_events WHERE name='workshop.search' ORDER BY rowid").map((r) => JSON.parse(r.props).q ?? null), [null, 'pudge'], 'a phone number is not kept');
  assert.equal(store.get("SELECT count(*) n FROM an_events WHERE name LIKE 'error.%'").n, 0, 'errors are kept apart');
  assert.deepEqual({ ...store.get('SELECT kind, key, message, place, page, version, count FROM an_errors') }, { kind: 'js', key: 'abcd1234', message: 'boom', place: 'app.js:3', page: 'customize', version: '2.1.0', count: 1 });
  assert.equal(store.get("SELECT sum(views) n FROM visits WHERE visitor=?", who).n, 2, 'the old counter\'s visits go on');
  assert.equal(store.get("SELECT count(*) n FROM stat_events WHERE name='customize-pack'").n, 1);

  // A second visitor, on a phone, from Telegram; new tomorrow is not new any more.
  const two = store.identity('visitor', V(3));
  analytics.collect({ s: S(3), p: 'workshop', c: ctx({ referrer: 't.me', landing: 'workshop', touch: true }), e: [['page.view', { page: 'workshop' }, 0], ['customize.section', { section: 'hud' }, 0], ['customize.section', { section: 'bg' }, 0]] }, { who: two, agent: PHONE });
  analytics.rollupDay(today);
  const daily = (name, key, extra = '') => store.all(`SELECT device, source, events, sessions, visitors FROM an_daily WHERE day=? AND name=? AND key=? ${extra} ORDER BY device`, today, name, key).map((r) => ({ ...r }));
  assert.deepEqual(daily('customize.section', '*'), [{ device: 'desktop', source: 'youtube', events: 1, sessions: 1, visitors: 1 }, { device: 'phone', source: 'telegram', events: 2, sessions: 1, visitors: 1 }]);
  assert.deepEqual(daily('customize.section', 'hud').map((r) => r.events), [1, 1]);
  assert.deepEqual(daily('customize.build-done', 'font').map((r) => r.events), [1], 'a list property counts each item');
  assert.equal(analytics.rollupDay(today) > 0, true, 'rolled again, same numbers');
  assert.deepEqual(daily('customize.section', '*').map((r) => r.events), [1, 2]);

  tick(math.DAY);
  analytics.collect({ s: S(4), p: 'home', c: ctx({ referrer: '' }), e: [['page.view', { page: 'home' }, 0]] }, { who, agent: UA });
  assert.equal(store.get('SELECT fresh FROM an_sessions WHERE day=?', today + 1).fresh, 0, 'returning');
  assert.equal(store.get('SELECT source FROM an_sessions WHERE day=?', today + 1).source, 'direct');

  // Raw events go after 90 days, the rest after 400.
  tick(95 * math.DAY); analytics.prune();
  assert.equal(store.get('SELECT count(*) n FROM an_events').n, 0);
  assert.equal(store.get('SELECT count(*) n FROM an_sessions').n, 3);
  tick(310 * math.DAY); analytics.pruned = 0; analytics.prune();
  assert.equal(store.get('SELECT count(*) n FROM an_sessions').n, 0);
  assert.equal(store.get('SELECT count(*) n FROM an_daily').n, 0);
});

test('session numbers in SQL match the arithmetic; reports for every tab; funnels end at the installer\'s report', async (t) => {
  const { store, analytics, math, now } = await setup(t);
  const p = math.periodOf({ days: 7 }, now());
  // Ten sessions with pages and engaged time; a few bounces.
  for (let i = 0; i < 10; i += 1) {
    const who = store.identity('visitor', V(100 + i)), pages = i % 3 === 0 ? 1 : i % 4 + 1;
    const events = Array.from({ length: pages }, (_, k) => ['page.view', { page: k ? 'editor' : 'customize' }, 0]);
    analytics.collect({ s: S(100 + i), p: 'customize', hb: i * 5, c: ctx({ referrer: i % 2 ? 't.me' : '' }), e: events }, { who, agent: i % 4 === 0 ? PHONE : UA });
  }
  const rows = store.all('SELECT pages, engaged, backfill FROM an_sessions');
  const sql = analytics.sessionTotals(p.from, p.to), js = math.sessionSummary(rows);
  for (const key of ['sessions', 'pagesPerSession', 'bounceRate', 'avgEngaged', 'measured']) assert.equal(sql[key], js[key], key);
  assert.equal(analytics.sessionTotals(p.from, p.to, { device: 'phone' }).sessions, 3);
  assert.equal(analytics.sessionTotals(p.from, p.to, { source: 'telegram' }).sessions, 5);
  assert.equal(analytics.sessionTotals(p.from, p.to, { source: 'nonsense' }).sessions, 10, 'an unknown filter is no filter');

  // The customization funnel: visit → change → build → command → installed (the installer said ok).
  const a = store.identity('visitor', V(100)), b = store.identity('visitor', V(101)), pack = `all-${'b'.repeat(64)}`;
  analytics.collect({ s: S(100), p: 'customize', e: [['customize.change', { section: 'bg', part: 'bg' }, 0], ['customize.build-done', { delivery: 'command', parts: ['bg'], pack }, 0],
    ['customize.command-copy', { pack }, 0]] }, { who: a, agent: PHONE });
  analytics.collect({ s: S(101), p: 'customize', e: [['customize.preset', { section: 'hud', preset: 'hud:clean' }, 0]] }, { who: b, agent: UA });
  assert.equal(analytics.install(pack, 'ok'), true);
  assert.equal(analytics.install('all-zzz', 'ok'), false); assert.equal(analytics.install(pack, 'maybe'), false);
  analytics.install('grid-remove', 'removed');
  const funnels = analytics.report('funnels', p, {});
  const customize = funnels.funnels.find((f) => f.id === 'customize');
  assert.deepEqual(customize.steps.map((s) => s.visitors), [10, 2, 1, 1, 1]);
  assert.equal(customize.byDevice.phone[4].visitors, 1);
  assert.deepEqual(analytics.report('funnels', p, { device: 'desktop' }).funnels[0].steps.map((s) => s.visitors), [7, 1, 0, 0, 0]);

  for (const tab of ['overview', 'sources', 'audience', 'tools', 'content', 'errors', 'ads']) {
    const report = analytics.report(tab, p, {});
    assert.equal(report.tab, tab); assert.equal(report.from, p.from);
  }
  assert.equal(analytics.report('nope', p, {}), null);
  const overview = analytics.report('overview', p, {});
  assert.equal(overview.now.sessions, 10); assert.equal(overview.now.installs, 1); assert.equal(overview.series.sessions.at(-1), 10);
  assert.equal(overview.series.downloads.at(-1), 1, 'the build');
  const audience = analytics.report('audience', p, {});
  assert.equal(audience.cohorts[0].size, 10); assert.deepEqual(audience.devices.map((r) => [r.value, r.visitors]), [['desktop', 7], ['phone', 3]]);
  const tools = analytics.report('tools', p, {});
  assert.equal(tools.counts['customize.preset'].find((r) => r.key === 'hud:clean').events, 1);
  assert.deepEqual(tools.installs.map((r) => ({ ...r })).sort((x, y) => x.kind.localeCompare(y.kind)), [{ kind: 'all', result: 'ok', n: 1 }, { kind: 'grid', result: 'removed', n: 1 }]);
  assert.equal(analytics.report('sources', p, {}).bySource.find((r) => r.source === 'telegram').sessions, 5);
});

test('history: sessions and events from the old counter, not counted twice', async (t) => {
  const [, , math, { CatalogStore }, { SiteStats }, { Analytics }] = await load();
  const store = new CatalogStore(':memory:', 'test-analytics-backfill'); t.after(() => store.close());
  let clock = Date.UTC(2026, 9, 10, 9); store.now = () => clock;
  const stats = new SiteStats(store, { live: false }), day0 = math.mskDay(clock);
  stats.visit('home', 'old', { referrer: 't.me', mobile: true }); stats.visit('editor', 'old'); stats.visit('home', 'old');
  stats.visit('background', 'other');
  stats.event('grid-export', 'old'); stats.event('grid-export', 'old'); stats.event('customize-pack', 'other', ['bg', 'hud']);
  clock += math.DAY; stats.visit('home', 'old');
  clock += 2 * math.DAY;
  const analytics = new Analytics(store, stats, { timers: false });
  assert.equal(analytics.since, day0 + 3);
  assert.equal(await analytics.backfill(), 3);
  assert.equal(await analytics.backfill(), 0, 'once');
  const sessions = store.all('SELECT day, visitor, pages, landing, exit, source, device, fresh, backfill FROM an_sessions ORDER BY day, visitor').map((r) => ({ ...r }));
  assert.deepEqual(sessions, [
    { day: day0, visitor: 'old', pages: 3, landing: 'home', exit: 'home', source: 'telegram', device: 'phone', fresh: 1, backfill: 1 },
    { day: day0, visitor: 'other', pages: 1, landing: 'background', exit: 'background', source: 'direct', device: 'desktop', fresh: 1, backfill: 1 },
    { day: day0 + 1, visitor: 'old', pages: 1, landing: 'home', exit: 'home', source: 'direct', device: 'desktop', fresh: 0, backfill: 1 }]);
  const p = { from: day0, to: day0 + 3, span: 4, prevFrom: day0 - 4, prevTo: day0 - 1, today: day0 + 3 };
  assert.equal(analytics.daily('editor.export', p.from, p.to), 2); assert.equal(analytics.daily('editor.export', p.from, p.to, {}, 'dota'), 2);
  assert.equal(analytics.daily('customize.build-done', p.from, p.to, {}, 'hud'), 1);
  assert.equal(analytics.daily('page.view', p.from, p.to), 5); assert.equal(analytics.daily('page.view', p.from, p.to, {}, 'home', 'visitors'), 2);
  analytics.rollup();
  assert.equal(analytics.daily('page.view', p.from, p.to), 5, 'the rollup leaves the history alone');
  const report = analytics.report('overview', p, {});
  assert.equal(report.now.visitors, 2); assert.equal(report.now.sessions, 3); assert.equal(report.now.newVisitors, 2);
  const funnel = analytics.report('funnels', p, {}).funnels.find((f) => f.id === 'customize');
  assert.deepEqual(funnel.steps.map((s) => s.visitors), [1, 1, 1, 1, 0], 'a build implies a change; the old pack event was a delivery');
});

test('Metrika: reports from the API (mocked), an hour in memory, a how-to without a token', async () => {
  const { Metrika, METRIKA_REPORTS, metrikaRows } = await import('../server/metrika.mjs');
  assert.deepEqual(await new Metrika({ token: '' }).report('2026-10-01', '2026-10-19'), { configured: false, counter: 113559366 });
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url: new URL(url), auth: options.headers.Authorization });
    const dimensions = new URL(url).searchParams.get('dimensions');
    if (dimensions === 'ym:s:ageInterval') return new Response(JSON.stringify({ errors: [{ message: 'нет данных' }], message: 'Wrong parameter' }), { status: 400 });
    return new Response(JSON.stringify({ data: dimensions ? [{ dimensions: [{ name: 'Россия', id: '225' }], metrics: [120, 80, 0.25, 61] }] : [{ dimensions: [], metrics: [10, 9, 30, 20, 2.5, 70, 55] }],
      totals: [120, 80, 0.25, 61], sampled: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  let clock = 0;
  const metrika = new Metrika({ token: 'secret-token', fetcher, now: () => clock });
  const value = await metrika.report('2026-10-01', '2026-10-19');
  assert.equal(calls.length, METRIKA_REPORTS.length);
  assert.ok(calls.every((call) => call.auth === 'OAuth secret-token' && call.url.searchParams.get('ids') === '113559366' && call.url.searchParams.get('date1') === '2026-10-01'));
  assert.ok(calls.every((call) => !call.url.href.includes('secret-token')), 'the token goes in the header only');
  assert.deepEqual(value.reports.countries.rows[0], { name: 'Россия', id: '225', values: { visits: 120, users: 80 } });
  assert.match(value.reports.age.error, /Wrong parameter/, 'one refused report leaves the others');
  assert.equal(value.reports.summary.rows[0].values.pageDepth, 2.5);
  await metrika.report('2026-10-01', '2026-10-19'); assert.equal(calls.length, METRIKA_REPORTS.length, 'kept an hour');
  clock += 3_600_001; await metrika.report('2026-10-01', '2026-10-19'); assert.equal(calls.length, 2 * METRIKA_REPORTS.length);
  assert.deepEqual(metrikaRows(METRIKA_REPORTS[2], {}).rows, []);
  const denied = new Metrika({ token: 'x', fetcher: async () => new Response('{"message":"Access denied"}', { status: 403 }) });
  const refused = await denied.report('2026-10-01', '2026-10-02');
  assert.match(refused.reports.summary.error, /не пустила/);
});

test('over HTTP: beacons and installer reports are counted; robots are not; only admins read «Аналитика»', async (t) => {
  const [, , , { CatalogStore }, , ] = await load();
  const { createCatalogAPI } = await import('../server/catalog-api.mjs');
  const { Moderators } = await import('../server/moderators.mjs');
  const store = new CatalogStore(':memory:', 'test-analytics-http');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-analytics-http', admins: new Set(['900000099']), database: ':memory:', media: tempMedia() };
  const fetcher = async () => new Response(JSON.stringify({ data: [], totals: [] }), { status: 200 });
  const { server, accounts } = createCatalogAPI(config, { store, metrika: new (await import('../server/metrika.mjs')).Metrika({ token: 't', fetcher }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const signIn = (id) => { const r = accounts.begin(`ip-${id}`, `b-${id}`); accounts.candidate(r.id, { id: Number(id), first_name: 'U', is_bot: false }); accounts.approve(r.id, Number(id), true); return accounts.finish(r.id, r.verifier, id).session; };
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const call = (path, { method = 'GET', body, session, agent = UA, origin = config.origin, site } = {}) => fetch(base + path, { method,
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), ...(site ? { 'Sec-Fetch-Site': site } : {}), Cookie: session ? `gs_account=${session}` : '', 'User-Agent': agent },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const batch = { v: V(9), s: S(9), p: 'home', c: ctx({ landing: 'home' }), e: [['page.view', { page: 'home' }, 0]] };
  assert.equal((await call('/collect', { method: 'POST', body: batch, origin: null })).status, 204, 'a beacon without Origin');
  assert.equal((await call('/collect', { method: 'POST', body: { ...batch, s: S(10) }, origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('/collect', { method: 'POST', body: { ...batch, s: S(11) }, origin: null, site: 'cross-site' })).status, 403);
  await call('/collect', { method: 'POST', body: { ...batch, s: S(12) }, agent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' });
  assert.equal(store.get('SELECT count(*) n FROM an_sessions').n, 1, 'one session, the robot\'s not counted');
  // The installer: PowerShell sends no Origin.
  const pack = `bg-${'c'.repeat(64)}`;
  assert.equal((await call('/install/report', { method: 'POST', body: { pack, result: 'fail', error: 'find' }, origin: null, agent: 'Mozilla/5.0 (Windows NT; Windows NT 10.0; ru-RU) WindowsPowerShell/5.1' })).status, 204);
  assert.deepEqual({ ...store.get('SELECT kind, pack, result, error FROM an_installs') }, { kind: 'bg', pack, result: 'fail', error: 'find' });
  // The script the command runs reports to that address with its pack.
  const script = await (await fetch(`${base}/install/${pack}-1234`)).text();
  assert.match(script, new RegExp(`Invoke-RestMethod -Uri '${config.origin}/api/catalog/install/report'[^\\n]*"pack":"${pack}"`));
  assert.match(script, /Send-Report 'ok'/); assert.match(script, /Send-Report 'fail' \$step/);

  const user = signIn('1201'), admin = signIn('900000099'), moderator = signIn('1202');
  new Moderators(store).set('1202', true);
  assert.equal((await call('/admin/analytics?tab=overview')).status, 401);
  assert.equal((await call('/admin/analytics?tab=overview', { session: user })).status, 403);
  assert.equal((await call('/admin/analytics?tab=overview', { session: moderator })).status, 403);
  assert.equal((await call('/admin/analytics/metrika?days=7', { session: moderator })).status, 403);
  const overview = await (await call('/admin/analytics?tab=overview&days=7', { session: admin })).json();
  assert.equal(overview.now.sessions, 1); assert.equal(overview.span, 7);
  assert.equal((await call('/admin/analytics?tab=nope', { session: admin })).status, 404);
  const custom = await (await call('/admin/analytics?tab=audience&from=2026-01-01&to=2026-01-31&device=phone', { session: admin })).json();
  assert.equal(custom.span, 31); assert.equal(custom.filters.device, 'phone');
  const metrika = await (await call('/admin/analytics/metrika?days=30', { session: admin })).json();
  assert.equal(metrika.configured, true); assert.ok(!JSON.stringify(metrika).includes('"t"'), 'no token in the answer');
});

test('write cost: a burst of batches', async (t) => {
  const { store, analytics } = await setup(t);
  const started = process.hrtime.bigint(), batches = 2000;
  for (let i = 0; i < batches; i += 1) {
    const who = store.identity('visitor', V(i % 400));
    analytics.collect({ s: S(i % 400), p: 'editor', hb: 30, c: ctx(), e: [['page.view', { page: 'editor' }, 0], ['editor.tool', { tool: 'pencil' }, 0], ['editor.edit', {}, 0], ['editor.export', { type: 'png' }, 0], ['spot.view', { place: 'landing' }, 0]] }, { who, agent: UA });
  }
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  t.diagnostic(`${batches} batches × 5 events: ${ms.toFixed(0)} ms, ${(ms / batches).toFixed(3)} ms per batch`);
  assert.ok(ms / batches < 5, 'well under 5 ms a batch');
  assert.equal(store.get('SELECT count(*) n FROM an_events').n, batches * 5);
});

test('sign-in funnel: windows, the way to the bot, the bot\'s steps, the finish and the way back', async (t) => {
  const [, , , { CatalogStore }, { SiteStats }, { Analytics, loginStep }] = await load();
  const { backPath, backLink } = await import('../server/accounts.mjs');
  const store = new CatalogStore(':memory:', 'test-analytics-login'); t.after(() => store.close());
  const analytics = new Analytics(store, new SiteStats(store, { live: false }), { timers: false });
  const id = (n) => `login${String(n).padStart(27, '0')}`; // 32 characters, like a login request's id
  const phone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1';
  for (let n = 1; n <= 5; n += 1) assert.ok(analytics.loginBegin(id(n), n <= 3 ? 'dotadle' : 'evil<x>', n === 5 ? phone : 'Windows NT 10.0'));
  assert.equal(analytics.loginBegin('short', 'header'), false);
  assert.ok(analytics.loginStep(id(1), 'opened', 'link')); assert.equal(analytics.loginStep(id(1), 'opened', 'app'), false, 'the first way stays');
  assert.equal(analytics.loginStep(id(2), 'opened', 'carrier-pigeon'), false);
  analytics.loginStep(id(2), 'opened', 'code');
  for (const n of [1, 2]) loginStep(store, id(n), 'started');
  loginStep(store, id(1), 'approved', true); loginStep(store, id(2), 'approved', true);
  analytics.loginStep(id(1), 'finished'); analytics.loginStep(id(1), 'fresh', true); analytics.loginStep(id(1), 'back');
  loginStep(store, id(3), 'started'); loginStep(store, id(3), 'approved', false);
  assert.equal(loginStep(store, id(99), 'started'), false, 'no window, nothing marked');
  const day = Math.floor((store.now() + 3 * 3_600_000) / 86_400_000), p = { from: day - 6, to: day, today: day };
  const login = analytics.funnels(p, {}).funnels.find((funnel) => funnel.id === 'login');
  assert.deepEqual(login.steps.map((step) => step.visitors), [5, 3, 3, 2, 1], 'started without a click on the site still went to the bot');
  assert.deepEqual({ back: login.back, lost: login.lost, cancelled: login.cancelled, fresh: login.fresh }, { back: 1, lost: 1, cancelled: 1, fresh: 1 });
  assert.deepEqual(login.ways, { link: 1, app: 0, code: 1 });
  assert.deepEqual(login.byOrigin.map((row) => [row.origin, row.windows, row.finished]), [['dotadle', 3, 1], ['header', 2, 0]], 'an origin that is not an id is the header\'s');
  assert.equal(login.byDevice.phone[0].visitors, 1);
  assert.equal(analytics.funnels(p, { device: 'phone' }).funnels.find((funnel) => funnel.id === 'login').steps[0].visitors, 1, 'the device filter applies');
  // The way back: only this site's pages, no earlier mark.
  assert.equal(backPath('/workshop?backgrounds&login=x'), '/workshop?backgrounds=');
  for (const bad of ['//evil.example', 'https://evil.example/', '/\\evil.example', '', '/a b']) assert.equal(backPath(bad), '/', bad);
  assert.equal(backLink('https://gridstudio.me', '/dotadle', id(1)), `https://gridstudio.me/dotadle?login=${id(1)}`);
});

test('repeat downloads: the same file on a later day, by visitor, with the gap', async (t) => {
  const { store, analytics } = await setup(t);
  const day = Math.floor((store.now() + 3 * 3_600_000) / 86_400_000);
  const put = (visitor, at, kind, id) => store.run("INSERT INTO an_events(at, day, name, visitor, props) VALUES(?,?,'workshop.download',?,?)", 0, at, visitor, JSON.stringify({ kind, way: 'file', id }));
  put('v1', day - 6, 'grid', 'g1'); put('v1', day - 2, 'grid', 'g1'); // the same grid four days later
  put('v2', day - 5, 'grid', 'g1'); put('v2', day - 5, 'grid', 'g2'); put('v2', day - 1, 'grid', 'g3'); // two days, never the same
  put('v3', day - 3, 'grid', 'g2'); put('v3', day - 3, 'grid', 'g2'); // twice the same day: not again
  put('v4', day - 4, 'background', '7'); put('v4', day, 'background', '7');
  const r = analytics.repeats({ from: day - 29, to: day, today: day });
  assert.deepEqual({ ...r.kinds.grid, top: undefined }, { visitors: 3, onTwoDays: 2, sameAgain: 1, medianGap: 4, top: undefined });
  assert.deepEqual(r.kinds.grid.top.map((row) => [row.id, row.visitors]), [['g1', 1]]);
  assert.deepEqual([r.kinds.background.sameAgain, r.kinds.background.medianGap], [1, 4]);
});
