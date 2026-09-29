const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { proof } = require('./captcha-helper.cjs');
const modules = Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs')]);
const DAY = 86_400_000;
const identity = n => ({ browser: `browser-${n}`, ip: 'shared-ip' });
const input = x => ({ title: 'Сетка', tags: [], grid: { version: 3, configs: [{ config_name: 'Сетка', categories: [
  { category_name: '@', x_position: x, y_position: 20, width: 30, height: 30, hero_ids: [] }
] }] } });
async function fixture(t) {
  const [{ CatalogStore }] = await modules; let now = Date.now();
  const store = new CatalogStore(':memory:', 'test-only-salt', () => now);
  t.after(() => store.close());
  return { store, advance: ms => { now += ms; } };
}

test('guest quota explains the actual remaining wait and releases one slot at a time', async t => {
  const { store, advance } = await fixture(t), first = store.now();
  store.save(input(1), identity(1)); advance(3_600_000);
  store.save(input(2), identity(1)); store.save(input(3), identity(1));
  assert.throws(() => store.save(input(4), identity(1)), error => {
    assert.equal(error.status, 429); assert.equal(error.extra.code, 'submission_guest_limit');
    assert.equal(error.extra.retryAfter, 23 * 3600); assert.equal(error.extra.retryAt, first + DAY);
    assert.match(error.message, /Без входа.*3 сетки/); assert.match(error.message, /23 ч\./);
    return true;
  });
  advance(23 * 3_600_000);
  store.save(input(4), identity(1));
  assert.throws(() => store.save(input(5), identity(1)), error => error.extra.retryAfter === 3600);
});

test('Telegram account can submit after the browser guest budget was exhausted', async t => {
  const { store } = await fixture(t);
  for (let i = 1; i <= 3; i++) store.save(input(i), identity(1));
  for (let i = 4; i <= 13; i++) store.save(input(i), identity(i), null, null, null, 'account-a');
  assert.throws(() => store.save(input(14), identity('new-browser'), null, null, null, 'account-a'), error => {
    assert.equal(error.extra.code, 'submission_account_limit'); assert.match(error.message, /10 отправок/); return true;
  });
  store.save(input(15), identity(1), null, null, null, 'account-b');
  assert.throws(() => store.save(input(16), identity(1)), error => error.extra.code === 'submission_guest_limit');
});

test('trusted authors (CATALOG_UNLIMITED_TELEGRAM_IDS) have no account limit; others keep it', async t => {
  const [, { catalogConfig }] = await modules;
  const config = catalogConfig({ CATALOG_DEV: '1', CATALOG_SECRET: 'x'.repeat(40), CATALOG_UNLIMITED_TELEGRAM_IDS: '424242424, 42' });
  assert.deepEqual([...config.unlimited], ['424242424', '42']);
  assert.throws(() => catalogConfig({ CATALOG_DEV: '1', CATALOG_SECRET: 'x'.repeat(40), CATALOG_UNLIMITED_TELEGRAM_IDS: '@someone' }), /UNLIMITED/);
  const { store } = await fixture(t);
  store.unlimited = config.unlimited;
  for (let i = 1; i <= 14; i++) store.save(input(i), identity(i), null, null, null, '424242424');
  for (let i = 15; i <= 24; i++) store.save(input(i), identity(i), null, null, null, 'account-a');
  assert.throws(() => store.save(input(25), identity(25), null, null, null, 'account-a'), error => error.extra.code === 'submission_account_limit');
});

test('account quota includes updates, deleted works and legacy claims across restarts', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'gridstudio-quota-'));
  const [{ CatalogStore }] = await modules; let now = Date.now();
  const path = join(directory, 'catalog.sqlite'); let store = new CatalogStore(path, 'test-only-salt', () => now);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const legacy = store.save(input(1), identity(1));
  // Existing guest records retain their original audit when claimed by an account.
  store.run('UPDATE works SET account=? WHERE id=?', 'account-a', legacy.id);
  store.remove(legacy.id, null, 'account-a');
  let current = store.save(input(2), identity(1), null, null, null, 'account-a');
  for (let i = 3; i <= 10; i++) current = store.save(input(i), identity(2), current.id, null, current.revision, 'account-a');
  store.close(); store = new CatalogStore(path, 'test-only-salt', () => now);
  assert.throws(() => store.save(input(11), identity(3), null, null, null, 'account-a'), error => error.extra.code === 'submission_account_limit');
  now += DAY;
  store.save(input(11), identity(3), null, null, null, 'account-a');
});

test('failed account saves do not consume budget; the shared IP cap still applies', async t => {
  const { store } = await fixture(t);
  const first = store.save(input(1), identity(1), null, null, null, 'account-a');
  assert.throws(() => store.save(input(1), identity(1), null, null, null, 'account-a'), error => error.status === 409);
  assert.throws(() => store.save(input(2), identity(1), first.id, null, -1, 'account-a'), error => error.status === 409);
  for (let i = 2; i <= 10; i++) store.save(input(i), identity(1), null, null, null, 'account-a');
  for (let i = 11; i <= 60; i++) store.save(input(i), identity(i), null, null, null, `account-${i}`);
  assert.throws(() => store.save(input(61), identity(61), null, null, null, 'fresh-account'), error => error.extra.code === 'submission_network_limit');
  assert.equal(store.get("SELECT count(*) n FROM audit WHERE action='submit'").n, 60);
  assert.equal(store.get('SELECT count(*) n FROM works WHERE account=?', 'fresh-account').n, 0);
});

test('generic request limit returns remaining seconds instead of a fresh full window', async t => {
  const { store, advance } = await fixture(t);
  store.rate('test', 2, 60_000); advance(10_000); store.rate('test', 2, 60_000); advance(20_000);
  assert.throws(() => store.rate('test', 2, 60_000), error => error.extra.retryAfter === 30 && /30 сек\./.test(error.message));
  advance(30_000); store.rate('test', 2, 60_000);
  assert.throws(() => store.rate('test', 2, 60_000), error => error.extra.retryAfter === 10);
});

test('read limit keeps the same sliding window in memory and forgets idle visitors', async t => {
  const { store, advance } = await fixture(t);
  store.burst('read:a', 2, 60_000); advance(10_000); store.burst('read:a', 2, 60_000); advance(20_000);
  assert.throws(() => store.burst('read:a', 2, 60_000), error => error.status === 429 && error.extra.retryAfter === 30 && /30 сек\./.test(error.message));
  advance(30_000); store.burst('read:a', 2, 60_000); store.burst('read:b', 2, 60_000);
  assert.equal(store.get('SELECT count(*) n FROM limits').n, 0);
  advance(3_600_000); store.burst('read:c', 2, 60_000);
  assert.deepEqual([...store.bursts.keys()], ['read:c']);
});

test('durable limits still drop day-old rows while pruning at most once a minute', async t => {
  const { store, advance } = await fixture(t);
  store.rate('old', 5, DAY); advance(DAY + 1); store.rate('fresh', 5, 60_000);
  assert.deepEqual(store.all('SELECT key FROM limits').map(row => row.key), ['fresh']);
  advance(1_000); store.rate('fresh', 5, 60_000);
  assert.equal(store.get('SELECT count(*) n FROM limits').n, 2);
});

test('catalog reads write nothing to SQLite and published grids are cacheable per revision', async t => {
  const [{ CatalogStore }, { createCatalogAPI }] = await modules;
  const store = new CatalogStore(':memory:', 'test-only-salt');
  const config = { origin: 'http://127.0.0.1:4173', development: true, salt: 'test-only-salt' };
  const { server } = createCatalogAPI(config, { store });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const get = path => fetch(`http://127.0.0.1:${server.address().port}/api/catalog${path}`);
  const saved = store.save(input(7), identity(1)), rows = store.get('SELECT count(*) n FROM limits').n;
  assert.equal((await get(`/works/${saved.id}/grid?revision=${saved.revision}`)).status, 404);
  store.moderate(saved.id, { action: 'approve', revision: saved.revision });
  const current = await get(`/works/${saved.id}/grid?revision=${saved.revision}`);
  assert.equal(current.status, 200); assert.match(current.headers.get('cache-control'), /immutable/);
  assert.equal((await current.json()).configs[0].categories[0].x_position, 7);
  const outdated = await get(`/works/${saved.id}/grid?revision=${saved.revision + 1}`);
  assert.equal(outdated.headers.get('cache-control'), 'no-store'); assert.equal((await outdated.json()).configs[0].categories[0].x_position, 7);
  assert.equal((await (await get('/works')).json()).items[0].revision, saved.revision);
  assert.equal((await get('/auth/me')).status, 200);
  assert.equal((await get('/works/00000000-0000-4000-8000-000000000000/grid')).status, 404);
  assert.equal(store.get('SELECT count(*) n FROM limits').n, rows);
});

test('HTTP publication uses the verified account quota, keeps ALTCHA and returns Retry-After', async t => {
  const [{ CatalogStore }, { createCatalogAPI }] = await modules;
  const store = new CatalogStore(':memory:', 'test-only-salt');
  const config = { origin: 'http://127.0.0.1:4173', development: true, salt: 'test-only-salt' };
  const { server, accounts } = createCatalogAPI(config, { store });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const login = accounts.begin('ip', 'browser');
  accounts.candidate(login.id, { id: 123, first_name: 'Test', is_bot: false }); accounts.approve(login.id, 123, true);
  const session = accounts.finish(login.id, login.verifier, '123');
  let cookie = `gs_account=${session.session}`;
  async function call(path, method = 'GET', body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/catalog${path}`, {
      method, headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    for (const value of response.headers.getSetCookie()) cookie += '; ' + value.split(';')[0];
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  for (let i = 1; i <= 3; i++) store.save(input(i), identity(1), null, null, null, '123');
  const request = { ...input(4), captcha: await proof(call), requestId: 'a8e0802b-f404-40bc-94a7-99aad26ed7b2', managementToken: 't'.repeat(43) };
  assert.equal((await call('/works', 'POST', request)).status, 201);
  for (let i = 5; i <= 10; i++) store.save(input(i), identity(i), null, null, null, '123');
  assert.equal((await call('/works', 'POST', request)).status, 200); // Receipt retry is free.
  assert.equal((await call('/works', 'POST', input(11))).status, 400); // No captcha bypass.
  const blocked = await call('/works', 'POST', { ...input(11), captcha: await proof(call) });
  assert.equal(blocked.status, 429); assert.equal(blocked.body.code, 'submission_account_limit');
  assert.equal(Number(blocked.headers.get('Retry-After')), blocked.body.retryAfter);
  assert.equal(store.get("SELECT count(*) n FROM audit WHERE action='submit'").n, 10);
});

test('subscribing over HTTP needs Telegram, shows in the work card and refuses guest authors', async t => {
  const [{ CatalogStore }, { createCatalogAPI }] = await modules;
  const store = new CatalogStore(':memory:', 'test-only-salt');
  const config = { origin: 'http://127.0.0.1:4173', development: true, salt: 'test-only-salt' };
  const { server, accounts } = createCatalogAPI(config, { store });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const login = accounts.begin('ip', 'browser');
  accounts.candidate(login.id, { id: 123, first_name: 'Fan', is_bot: false }); accounts.approve(login.id, 123, true);
  const session = accounts.finish(login.id, login.verifier, '123').session;
  const call = async (path, method = 'GET', body, signedIn = true) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/catalog${path}`, { method,
      headers: { Origin: config.origin, 'Content-Type': 'application/json', ...(signedIn ? { Cookie: `gs_account=${session}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const linked = store.save(input(1), identity(1), null, null, null, '777'), guest = store.save(input(2), identity(2));
  for (const work of [linked, guest]) store.moderate(work.id, { action: 'approve', revision: work.revision });
  assert.equal((await call(`/works/${linked.id}/subscribe`, 'PUT', { subscribed: true }, false)).status, 401);
  assert.deepEqual((await call(`/works/${linked.id}/subscribe`, 'PUT', { subscribed: true })).body, { followable: true, subscribed: true });
  const card = (await call(`/works/${linked.id}`)).body;
  assert.equal(card.subscribed, true); assert.equal(card.followable, true);
  // The author's account never reaches the public card. Match keys and whole values: a
  // substring check also hit '777' inside timestamps and IDs now and then.
  const seen = []; JSON.stringify(card, (key, value) => { seen.push(key, value); return value; });
  assert.ok(!seen.includes('account') && !seen.includes('777') && !seen.includes(777), 'no account in the card');
  assert.equal((await call(`/works/${guest.id}/subscribe`, 'PUT', { subscribed: true })).status, 409);
  assert.equal((await call(`/works/${linked.id}/subscribe`, 'PUT', { subscribed: 'yes' })).status, 400);
  assert.deepEqual((await call(`/works/${linked.id}/subscribe`, 'PUT', { subscribed: false })).body, { followable: true, subscribed: false });
});
