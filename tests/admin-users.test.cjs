const test = require('node:test');
const assert = require('node:assert/strict');

// «Админка → Пользователи» (server/admin-users.mjs).
test('admin users: everyone who signed in with Telegram, their profile and Telegram, a search; admins only', async (t) => {
  const [{ CatalogStore }, { createCatalogAPI }] = await Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs')]);
  const store = new CatalogStore(':memory:', 'test-admin-users');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-admin-users', admins: new Set(['900000099']), database: ':memory:', media: '/nonexistent' };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const signIn = (id, user) => { const r = accounts.begin(`ip-${id}`, `b-${id}`); accounts.candidate(r.id, { id: Number(id), is_bot: false, ...user }); accounts.approve(r.id, Number(id), true); return accounts.finish(r.id, r.verifier, id).session; };
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const get = async (path, session) => { const response = await fetch(base + path, { headers: { Origin: config.origin, Cookie: session ? `gs_account=${session}` : '' } }); return { status: response.status, body: await response.json() }; };
  const anna = signIn('1201', { first_name: 'Анна', username: 'anna_tg' }), bob = signIn('1202', { first_name: 'Bob' }), admin = signIn('900000099', { first_name: 'Admin' });
  store.profiles.update('1201', { nickname: 'Совушка', telegram: true });
  const grid = { version: 3, configs: [{ config_name: 'T', categories: [{ category_name: '@', x_position: 1, y_position: 1, width: 30, height: 30, hero_ids: [] }] }] };
  const work = store.save({ title: 'Сетка', author: '', tags: ['Аниме'], grid }, { browser: 'b', ip: 'i' }, null, null, null, '1201');
  store.moderate(work.id, { action: 'approve', revision: work.revision });
  store.run('INSERT INTO blocks(key, reason, until_at) VALUES(?,?,?)', 'account:1202', 'test', Date.now() + 86_400_000);

  assert.equal((await get('/admin/users', bob)).status, 403);
  assert.equal((await get('/admin/users')).status, 401);
  const all = (await get('/admin/users', admin)).body;
  assert.equal(all.all, 3); assert.equal(all.total, 3);
  const a = all.items.find((user) => user.id === '1201');
  assert.equal(a.profile.nickname, 'Совушка'); assert.equal(a.telegram.username, 'anna_tg'); assert.equal(a.telegram.name, 'Анна'); assert.equal(a.telegram.shown, true);
  assert.equal(a.works.grids, 1); assert.equal(a.blocked, 0); assert.equal(a.came.source, 'unknown', 'signed in before sources were kept'); assert.equal(a.online, false);
  const b = all.items.find((user) => user.id === '1202');
  assert.equal(b.telegram.username, ''); assert.equal(b.telegram.shown, false); assert.ok(b.blocked > Date.now());
  for (const [q, id] of [['совуш', '1201'], ['@anna', '1201'], ['анна', '1201'], ['1202', '1202'], ['BOB', '1202']]) {
    const found = (await get(`/admin/users?q=${encodeURIComponent(q)}`, admin)).body;
    assert.deepEqual(found.items.map((user) => user.id), [id], q);
  }
  assert.equal((await get('/admin/users?q=nobody', admin)).body.total, 0);
  assert.equal((await get('/admin/users?sort=works', admin)).body.items[0].id, '1201', 'the most works first');
  assert.equal((await get("/admin/users?q=%25'%20OR%201=1--", admin)).body.total, 0, 'the search is a search');
});
