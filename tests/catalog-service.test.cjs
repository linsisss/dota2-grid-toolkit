const { proof } = require('./captcha-helper.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const modules = Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs'), import('../scripts/catalog-document.mjs'), import('../scripts/core.mjs')]);
const grid = (x = 10) => ({ version: 3, configs: [{ config_name: 'Сетка', categories: [
  { category_name: '  ⡏あ  ', x_position: x, y_position: 25, width: 30, height: 30, hero_ids: [] },
  { category_name: 'Мои', x_position: 500, y_position: 100, width: 350, height: 150, hero_ids: [127, 1, 5] }
] }] });
const input = (x = 10) => ({ title: 'Тестовая сетка', author: 'Игрок', tags: ['Аниме'], grid: grid(x) });
const identity = (n = 1) => ({ browser: `browser-${n}`, ip: 'shared-network' });
async function fixture(t, path = ':memory:') {
  const [{ CatalogStore }] = await modules; let now = 1800000000000;
  const store = new CatalogStore(path, 'test-only-hmac-salt-not-a-production-key', () => now);
  t.after(() => store.close()); return { store, advance: ms => { now += ms; } };
}
test('catalog sanitizes one grid, preserves Unicode spaces and strips unrelated metadata', async () => {
  const [, , { catalogSubmission, normalizeCatalogGrid }] = await modules;
  const source = input(); source.grid.configs[0].secret = 'private'; source.grid.configs[0].categories[0].private = 'private';
  const result = catalogSubmission(source);
  assert.equal(result.grid.configs[0].categories[0].category_name, '  ⡏あ  ');
  assert.equal(result.grid.configs[0].secret, undefined); assert.equal(result.grid.configs[0].categories[0].private, undefined);
  assert.deepEqual(result.stats, { categories: 2, heroes: 3, symbols: 2 });
  assert.throws(() => normalizeCatalogGrid({ version: 3, configs: [...grid().configs, ...grid().configs] }), /одна/);
  for (const value of [NaN, Infinity, -10, 10001, '100']) {
    const broken = grid(); broken.configs[0].categories[0].x_position = value; assert.throws(() => normalizeCatalogGrid(broken));
  }
  const tooMany = grid(); tooMany.configs[0].categories = Array(5001).fill(tooMany.configs[0].categories[0]); assert.throws(() => normalizeCatalogGrid(tooMany), /5000/);
});

test('publication has no symbol cap; the card reports the count instead', async () => {
  const [, , { catalogSubmission }] = await modules;
  const categories = Array.from({ length: 12 }, (_, i) => ({ category_name: '●'.repeat(2000), x_position: 10, y_position: 10 + i * 40, width: 30, height: 30, hero_ids: [] }));
  const result = catalogSubmission({ ...input(), grid: { version: 3, configs: [{ config_name: 'Много точек', categories }] } });
  assert.equal(result.stats.symbols, 24000);
  const tooMany = grid(); tooMany.configs[0].categories = Array(5001).fill(tooMany.configs[0].categories[0]);
  assert.throws(() => catalogSubmission({ ...input(), grid: tooMany }), /5000/);
});
test('publication accepts the gallery tags and rejects retired or excessive selections', async () => {
  const [, , { catalogSubmission }] = await modules;
  for (const tag of ['Аниме', 'Милота', '18+', 'Рамки', 'С упором на героя', 'Мемы', 'Dead inside'])
    assert.deepEqual(catalogSubmission({ ...input(), tags: [tag] }).tags, [tag]);
  assert.throws(() => catalogSubmission({ ...input(), tags: ['Арт'] }), /тегов/);
  assert.throws(() => catalogSubmission({ ...input(), tags: ['Аниме', 'Милота', '18+', 'Рамки'] }), /трёх/);
});
test('publishing extracts only active visible grid and never exports references, hidden layers or other grids', async () => {
  const [, , { selectedCatalogGrid, appendCatalogGrid }, { default: C }] = await modules;
  let doc = C.importDota(grid()); doc = appendCatalogGrid(doc, grid(400));
  assert.equal(doc.source.configs.length, 2); assert.equal(doc.configIndex, 1);
  const hidden = doc.layers.find(l => l.id === 'decor'); hidden.visible = false;
  const before = JSON.stringify(doc); const result = selectedCatalogGrid(doc);
  assert.equal(result.configs.length, 1); assert.equal(result.configs[0].categories.length, 1);
  assert.deepEqual(result.configs[0].categories[0].hero_ids, [127, 1, 5]); assert.equal(JSON.stringify(doc), before);
});
test('pending works stay private; approval exposes only canonical data, searching Cyrillic and tags works', async t => {
  const { store } = await fixture(t); const saved = store.save(input(), identity());
  assert.equal(store.list().total, 0); assert.throws(() => store.publicItem(saved.id), e => e.status === 404);
  assert.throws(() => store.ownerView(saved.id, 'wrong-key'), e => e.status === 404);
  assert.equal(store.ownerView(saved.id, saved.managementToken).status, 'pending');
  store.moderate(saved.id, { revision: saved.revision, action: 'approve', featured: true });
  assert.equal(store.list({ query: 'ТЕСТОВАЯ', tag: 'Аниме', featured: true }).total, 1);
  assert.equal(store.list({ query: '%_\'' }).total, 0); assert.equal(store.publicItem(saved.id).owner, undefined);
  assert.equal(store.list().items[0].grid, undefined);
});
test('content duplicates ignore name and category order; duplicate error does not expose pending ID', async t => {
  const { store } = await fixture(t); const saved = store.save(input(), identity());
  const changed = input(); changed.title = 'Другое имя'; changed.grid.configs[0].config_name = 'Переименована'; changed.grid.configs[0].categories.reverse();
  assert.throws(() => store.save(changed, identity(2)), e => e.status === 409 && !e.extra.duplicateId);
  store.moderate(saved.id, { revision: saved.revision, action: 'approve' });
  assert.throws(() => store.save(changed, identity(2)), e => e.extra.duplicateId === saved.id);
});
test('new revisions require review; rejected updates leave previous published grid untouched', async t => {
  const { store } = await fixture(t); const saved = store.save(input(), identity());
  store.moderate(saved.id, { action: 'approve', revision: saved.revision });
  const update = store.save({ ...input(99), title: 'Новая' }, identity(), saved.id, saved.managementToken, saved.revision);
  assert.equal(store.publicItem(saved.id).title, 'Тестовая сетка');
  store.moderate(saved.id, { action: 'reject', revision: update.revision, reason: 'Проверь подпись' });
  assert.equal(store.publicItem(saved.id).title, 'Тестовая сетка'); assert.equal(store.ownerView(saved.id, saved.managementToken).reason, 'Проверь подпись');
  const retry = store.save(input(98), identity(), saved.id, saved.managementToken, update.revision);
  store.moderate(saved.id, { action: 'approve', revision: retry.revision });
  assert.equal(store.publicItem(saved.id).grid.configs[0].categories[0].x_position, 98);
});
test('stale owner and moderator revisions cannot overwrite a newer submission', async t => {
  const { store } = await fixture(t), saved = store.save(input(), identity());
  const updated = store.save(input(33), identity(), saved.id, saved.managementToken, saved.revision);
  assert.throws(() => store.moderate(saved.id, { revision: saved.revision, action: 'approve' }), e => e.status === 409);
  assert.throws(() => store.save(input(45), identity(), saved.id, saved.managementToken, saved.revision), e => e.status === 409);
  store.moderate(saved.id, { revision: updated.revision, action: 'approve' });
});
test('browser daily limit is transactional and shared IP permits separate people; quotas survive restarts', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'gridstudio-catalog-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const [{ CatalogStore }] = await modules, path = join(directory, 'test.sqlite'); let store = new CatalogStore(path, 'test-salt');
  for (let i = 0; i < 3; i++) store.save(input(50 + i), identity());
  assert.throws(() => store.save(input(54), identity()), e => e.status === 429);
  store.save(input(55), identity(2)); store.close(); store = new CatalogStore(path, 'test-salt');
  try { assert.throws(() => store.save(input(56), identity()), e => e.status === 429); assert.equal(store.moderation().total, 4); } finally { store.close(); }
});
test('deletion revokes public access but does not refund submission budget', async t => {
  const { store } = await fixture(t); const saved = store.save(input(), identity()); store.moderate(saved.id, { action: 'approve', revision: saved.revision });
  store.remove(saved.id, saved.managementToken); assert.equal(store.list().total, 0);
  assert.throws(() => store.publicItem(saved.id), e => e.status === 404); assert.throws(() => store.ownerView(saved.id, saved.managementToken), e => e.status === 410);
  store.save(input(20), identity()); store.save(input(30), identity()); assert.throws(() => store.save(input(40), identity()), e => e.status === 429);
});
test('moderation pause keeps catalog readable, block affects browser without blocking all shared IP users', async t => {
  const { store } = await fixture(t); const saved = store.save(input(), identity()); store.moderate(saved.id, { action: 'approve', revision: saved.revision });
  store.setPaused(true); assert.equal(store.list().total, 1); assert.throws(() => store.save(input(40), identity(2)), e => e.status === 503);
  store.setPaused(false); store.moderate(saved.id, { action: 'block', revision: saved.revision, reason: 'Спам' });
  assert.equal(store.list().total, 0); assert.throws(() => store.save(input(40), identity()), e => e.status === 403);
  store.save(input(41), identity(2)); assert.throws(() => store.save(input(42), identity(2), saved.id, saved.managementToken, saved.revision), e => e.status === 403);
});
test('reports are deduplicated, moderated and hidden from public responses', async t => {
  const { store } = await fixture(t); const saved = store.save(input(), identity()); store.moderate(saved.id, { action: 'approve', revision: saved.revision });
  store.report(saved.id, identity(2), 'Реклама'); store.report(saved.id, identity(2), 'Повтор');
  assert.equal(store.moderation('reports').items[0].reports.length, 1); assert.equal(store.publicItem(saved.id).reports, undefined);
  store.moderate(saved.id, { action: 'resolve', revision: saved.revision }); assert.equal(store.moderation('reports').total, 0);
});
test('production configuration requires HTTPS and a secret without external captcha keys', async () => {
  const [, { catalogConfig }] = await modules;
  assert.throws(() => catalogConfig({}), /CATALOG_SECRET/);
  assert.throws(() => catalogConfig({ CATALOG_DEV: '1', CATALOG_ORIGIN: 'https://gridstudio.me' }), /loopback/);
  assert.equal(catalogConfig({ CATALOG_SECRET: 'x'.repeat(32) }).origin, 'https://gridstudio.me');
  assert.throws(() => catalogConfig({ CATALOG_SECRET: 'x'.repeat(32), CATALOG_ORIGIN: 'http://gridstudio.me' }), /HTTPS/);
});
test('HTTP flow protects origin, Telegram admin access, owner tokens and retries after lost submission responses', async t => {
  const [{ CatalogStore }, { createCatalogAPI }] = await modules;
  const store = new CatalogStore(':memory:', 'test-http-salt');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-http-salt', admins: new Set(['1253427']), database: ':memory:' };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const signIn = id => { const login = accounts.begin('ip', 'browser'); accounts.candidate(login.id, { id: Number(id), first_name: `U${id}`, is_bot: false });
    accounts.approve(login.id, Number(id), true); return accounts.finish(login.id, login.verifier, id).session; };
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  let cookie = '';
  async function call(path, method = 'GET', body, extra = {}) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: config.origin, Cookie: cookie, ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
    for (const set of response.headers.getSetCookie()) { const name = set.split('=')[0]; cookie = cookie.split('; ').filter(value => value && !value.startsWith(name + '=')).concat(set.split(';')[0]).join('; '); }
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  assert.equal((await call('/config')).status, 200);
  assert.equal((await call('/admin/works')).status, 401);
  assert.equal((await call('/works', 'POST', input(), { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('/works', 'POST', input(), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await call('/works', 'POST', input())).status, 400);
  assert.equal((await call('/captcha/challenge?action=submit','GET',undefined,{'Sec-Fetch-Site':'cross-site'})).status,403);
  const request = { ...input(), captcha: await proof(call), requestId: '81d705ab-a9db-41e7-9c73-8c5be6893aab', managementToken: 't'.repeat(43) };
  const saved = await call('/works', 'POST', request); assert.equal(saved.status, 201);
  const retry = await call('/works', 'POST', request); assert.equal(retry.status, 200); assert.equal(retry.body.id, saved.body.id);
  assert.equal(store.moderation().total, 1);
  assert.equal((await call(`/manage/${saved.body.id}`)).status, 404);
  assert.equal((await call(`/manage/${saved.body.id}`, 'GET', null, { Authorization: `Bearer ${request.managementToken}` })).status, 200);
  // No password login any more: only the configured Telegram accounts, checked on every request.
  assert.equal((await call('/admin/login', 'POST', { password: 'local-test-moderator-password' })).status, 401);
  const fan = signIn('777'), admin = signIn('1253427');
  assert.equal((await call('/admin/works', 'GET', null, { Cookie: `${cookie}; gs_account=${fan}` })).status, 403);
  assert.equal((await call('/auth/me', 'GET', null, { Cookie: `${cookie}; gs_account=${fan}` })).body.admin, false);
  cookie += `; gs_account=${admin}`;
  assert.equal((await call('/auth/me')).body.admin, true);
  assert.equal((await call('/admin/session')).status, 200);
  assert.equal((await call(`/admin/works/${saved.body.id}`, 'POST', { action: 'approve', revision: saved.body.revision })).status, 200);
  assert.deepEqual(JSON.parse(store.get("SELECT actor FROM audit WHERE action='approve'").actor), { id: '1253427', name: 'U1253427 · сайт' });
  assert.equal((await call('/works','POST',{...input(40),captcha:request.captcha})).status,400);
  assert.equal((await call(`/works/${saved.body.id}/report`,'POST',{reason:'Guest report'},{Cookie:cookie.replace(/; gs_account=[^;]*/g,'')})).status,401);
  assert.equal((await call(`/works/${saved.body.id}/report`,'POST',{reason:'Test report'})).status,200);
  const download = await call(`/works/${saved.body.id}/download`); assert.equal(download.body.configs.length, 1); assert.match(download.headers.get('content-disposition'), /attachment/);
  const edited = { ...input(42), revision: saved.body.revision };
  assert.equal((await call(`/manage/${saved.body.id}`, 'PATCH', edited, { Authorization: `Bearer ${'z'.repeat(43)}` })).status, 404);
  assert.equal((await call(`/manage/${saved.body.id}`, 'PATCH', edited, { Authorization: `Bearer ${request.managementToken}` })).status, 401);
  assert.equal((await call(`/works/${saved.body.id}`)).body.grid.configs[0].categories[0].x_position, 10);
  await call('/auth/logout', 'POST', {}); assert.equal((await call('/admin/session')).status, 401);
});
test('admin search finds grids by title or author in any case; the tab counts stay whole', async t => {
  const { store } = await fixture(t);
  store.save({ ...input(60), title: 'Корги на пляже' }, identity(1));
  store.save({ ...input(61), title: 'Лес', author: 'КОРГИ-фан' }, identity(2));
  store.save({ ...input(62), title: 'Горы' }, identity(3));
  const found = store.moderation('pending', 0, 'корги');
  assert.deepEqual(found.items.map(item => item.title).sort(), ['Корги на пляже', 'Лес']);
  assert.equal(found.total, 2); assert.equal(found.counts.pending, 3);
  assert.equal(store.moderation('pending', 0, '100%').total, 0, 'LIKE wildcards are plain text');
});
