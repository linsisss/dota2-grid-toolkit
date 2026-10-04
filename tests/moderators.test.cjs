const test = require('node:test');
const assert = require('node:assert/strict');

// Moderators (server/moderators.mjs): an admin gives the role in «Пользователи»; a moderator only approves or
// turns down grids, backgrounds and guides waiting for a decision.
test('a moderator approves or turns down what waits, and nothing else; only admins give the role', async (t) => {
  const [{ CatalogStore }, { createCatalogAPI }, { moderatorAllows }] = await Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs'), import('../server/moderators.mjs')]);
  const store = new CatalogStore(':memory:', 'test-moderators');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-moderators', admins: new Set(['900000099']), database: ':memory:', media: '/nonexistent' };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const signIn = (id) => { const r = accounts.begin(`ip-${id}`, `b-${id}`); accounts.candidate(r.id, { id: Number(id), first_name: `U${id}`, is_bot: false }); accounts.approve(r.id, Number(id), true); return accounts.finish(r.id, r.verifier, id).session; };
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const call = async (path, session, { method = 'GET', body } = {}) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: config.origin, Cookie: session ? `gs_account=${session}` : '' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  const admin = signIn('900000099'), mod = signIn('1301'), user = signIn('1302');
  const grid = { version: 3, configs: [{ config_name: 'T', categories: [{ category_name: '@', x_position: 1, y_position: 1, width: 30, height: 30, hero_ids: [] }] }] };
  let n = 0;
  const work = (title) => store.save({ title, author: '', tags: ['Аниме'], grid: { ...grid, configs: [{ config_name: title, categories: [{ ...grid.configs[0].categories[0], x_position: 100 * ++n }] }] } }, { browser: `b-${title}`, ip: 'i' }, null, null, null, '1302');
  const published = work('Опубликованная'); store.moderate(published.id, { action: 'approve', revision: published.revision });
  const first = work('Первая'), second = work('Вторая');

  assert.deepEqual((await call('/auth/me', mod)).body.moderator, false);
  assert.equal((await call('/admin/works', mod)).status, 403);
  // Only an admin gives the role; an admin needs none; a stranger's id is refused.
  assert.equal((await call('/admin/users/1301/moderator', user, { method: 'POST', body: { on: true } })).status, 403);
  assert.equal((await call('/admin/users/900000099/moderator', admin, { method: 'POST', body: { on: true } })).status, 409);
  assert.equal((await call('/admin/users/555/moderator', admin, { method: 'POST', body: { on: true } })).status, 404);
  assert.deepEqual((await call('/admin/users/1301/moderator', admin, { method: 'POST', body: { on: true } })).body, { moderator: true });
  assert.equal((await call('/admin/journal', admin)).body.items[0].label, 'Выдана роль модератора');
  const roles = Object.fromEntries((await call('/admin/users', admin)).body.items.map((item) => [item.id, item.role]));
  assert.deepEqual(roles, { 900000099: 'admin', 1301: 'moderator', 1302: null });

  // The role's badge on the profile; it is not given by hand.
  const key = store.profiles.creator('1301').key;
  assert.ok((await call(`/profiles/${key}`)).body.badges.includes('moderator'));
  assert.equal((await call(`/admin/profiles/${key}/badges`, admin, { method: 'POST', body: { badge: 'moderator', on: false } })).status, 400);
  const me = (await call('/auth/me', mod)).body;
  assert.deepEqual([me.admin, me.moderator], [false, true]);
  assert.deepEqual((await call('/admin/session', mod)).body, { admin: false, moderator: true });
  assert.equal((await call('/admin/summary', mod)).status, 200);
  // Their lists are what waits, whatever tab is asked for.
  const list = (await call('/admin/works?filter=published', mod)).body;
  assert.deepEqual(list.items.map((item) => item.title).sort(), ['Вторая', 'Первая']);
  // Approve and turn down; no corrections, hiding, featuring or blocking.
  for (const action of ['edit', 'block', 'feature', 'resolve'])
    assert.equal((await call(`/admin/works/${first.id}`, mod, { method: 'POST', body: { action, revision: first.revision, title: 'Чужое', tags: ['Аниме'], reason: 'x' } })).status, 403, action);
  assert.equal((await call(`/admin/works/${first.id}`, mod, { method: 'POST', body: { action: 'approve', revision: first.revision } })).status, 200);
  assert.equal((await call(`/admin/works/${second.id}`, mod, { method: 'POST', body: { action: 'reject', revision: second.revision, reason: 'Дубликат' } })).status, 200);
  assert.equal(store.publicItem(first.id).title, 'Первая');
  assert.equal(JSON.parse(store.get("SELECT actor FROM audit WHERE work=? AND action='approve'", first.id).actor).id, '1301');
  // Nothing else of the admin panel.
  for (const [path, method, body] of [['/admin/stats', 'GET'], ['/admin/stats/live', 'GET'], ['/admin/users', 'GET'], ['/admin/journal', 'GET'], ['/admin/arts', 'GET'],
    ['/admin/settings', 'PATCH', { paused: true }], ['/admin/users/1302/moderator', 'POST', { on: true }], ['/admin/guides/abcdefghijkl/modding', 'POST', { modding: true }], ['/admin/arts/1', 'POST', { action: 'approve' }]])
    assert.equal((await call(path, mod, { method, body })).status, 403, path);
  assert.equal(store.paused(), false);
  assert.deepEqual([moderatorAllows('GET', '/admin/backgrounds'), moderatorAllows('POST', '/admin/backgrounds/12'), moderatorAllows('POST', '/admin/guides/7'), moderatorAllows('DELETE', '/admin/works')], [true, true, true, false]);

  // Taken back: the panel closes at once.
  assert.deepEqual((await call('/admin/users/1301/moderator', admin, { method: 'POST', body: { on: false } })).body, { moderator: false });
  assert.equal((await call('/admin/works', mod)).status, 403);
  assert.equal((await call('/admin/journal', admin)).body.items[0].label, 'Снята роль модератора');
  assert.equal((await call(`/profiles/${key}`)).body.badges.includes('moderator'), false, 'the badge goes with the role');
});
