const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const recipe = (extra = {}) => ({ aspect: '16:9', fit: 'cover', blur: 40, dim: 20, clean: false, folder: 'russian', delivery: 'file',
  piece: { start: 1.5, end: 21.5 }, crossfade: 1, source: { kind: 'workshop', id: 7, title: 'Корги' }, ...extra });

test('studio recipes: the settings and the source, nothing else', async () => {
  const { studioRecipe, defaultStudioName } = await import('../scripts/studio-background.mjs');
  assert.deepEqual(studioRecipe(recipe()), recipe());
  const own = studioRecipe(recipe({ piece: null, crossfade: 0, source: { kind: 'file', name: 'Лес.MP4', size: 123, type: 'video', label: 'MP4', path: 'C:/x' } }));
  assert.deepEqual(own.source, { kind: 'file', name: 'Лес.MP4', size: 123, type: 'video', label: 'MP4' }, 'only what identifies the file');
  assert.equal(defaultStudioName(own.source), 'Лес');
  assert.equal(defaultStudioName(recipe().source), 'Корги');
  for (const wrong of [{ aspect: '5:4' }, { blur: 101 }, { dim: 1.5 }, { crossfade: 3 }, { folder: 'dota' }, { piece: { start: 5, end: 5 } }, { source: { kind: 'url', href: 'x' } }, { clean: 'yes' }])
    assert.throws(() => studioRecipe(recipe(wrong)), /не читаются/, JSON.stringify(wrong));
});

test('studio backgrounds API: signed-in only, per account, recipes and posters without video', async t => {
  const [{ CatalogStore }, { createCatalogAPI }] = await Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs')]);
  const store = new CatalogStore(':memory:', 'test-studio');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-studio', admins: new Set(), database: ':memory:' };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const signIn = (telegram, where) => { const login = accounts.begin(where, where); accounts.candidate(login.id, { id: telegram, first_name: 'A', is_bot: false }); accounts.approve(login.id, telegram, true); return `gs_account=${accounts.finish(login.id, login.verifier, String(telegram)).session}`; };
  const call = async (path, { method = 'GET', body, cookie = '' } = {}) => {
    const response = await fetch(base + path, { method, headers: { Origin: config.origin, Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const type = response.headers.get('content-type') || '';
    return { status: response.status, headers: response.headers, body: type.startsWith('application/json') ? await response.json() : new Uint8Array(await response.arrayBuffer()) };
  };
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64'), id = randomUUID();
  assert.equal((await call('/studio/backgrounds')).status, 401, 'only with Telegram');
  const alice = signIn(1001, 'a'), bob = signIn(1002, 'b');
  const saved = await call(`/studio/backgrounds/${id}`, { method: 'PUT', cookie: alice, body: { name: '  Корги  на веранде ', recipe: recipe(), poster: jpeg, published: { id: 5, token: 'a'.repeat(32) } } });
  assert.equal(saved.status, 200);
  const list = (await call('/studio/backgrounds', { cookie: alice })).body.items;
  assert.deepEqual(list.map(({ id, name, recipe, poster, published }) => ({ id, name, recipe, poster, published })), [{ id, name: 'Корги на веранде', recipe: recipe(), poster: true, published: { id: 5, token: 'a'.repeat(32) } }]);
  const poster = await call(`/studio/backgrounds/${id}/poster.jpg`, { cookie: alice });
  assert.equal(poster.status, 200); assert.equal(poster.headers.get('content-type'), 'image/jpeg'); assert.match(poster.headers.get('cache-control'), /private/);
  assert.deepEqual((await call('/studio/backgrounds', { cookie: bob })).body.items, [], 'another account sees nothing');
  assert.equal((await call(`/studio/backgrounds/${id}/poster.jpg`, { cookie: bob })).status, 404);
  // Renaming keeps the poster; a poster must be a JPEG; the recipe is checked.
  assert.equal((await call(`/studio/backgrounds/${id}`, { method: 'PUT', cookie: alice, body: { name: 'Корги', recipe: recipe({ blur: 0 }) } })).status, 200);
  assert.equal((await call(`/studio/backgrounds/${id}/poster.jpg`, { cookie: alice })).status, 200, 'poster kept');
  assert.deepEqual((await call('/studio/backgrounds', { cookie: alice })).body.items[0].published, { id: 5, token: 'a'.repeat(32) }, 'and the submission');
  assert.equal((await call(`/studio/backgrounds/${randomUUID()}`, { method: 'PUT', cookie: alice, body: { name: 'x', recipe: recipe(), published: { id: 5, token: 'nope' } } })).status, 400);
  assert.equal((await call(`/studio/backgrounds/${randomUUID()}`, { method: 'PUT', cookie: alice, body: { name: 'x', recipe: recipe(), poster: Buffer.from('<svg/>').toString('base64') } })).status, 415);
  assert.equal((await call(`/studio/backgrounds/${randomUUID()}`, { method: 'PUT', cookie: alice, body: { name: 'x', recipe: recipe({ fit: 'stretch' }) } })).status, 400);
  assert.equal((await call(`/studio/backgrounds/${randomUUID()}`, { method: 'PUT', cookie: alice, body: { name: ' ', recipe: recipe() } })).status, 400);
  assert.equal((await call(`/studio/backgrounds/${id}`, { method: 'DELETE', cookie: bob })).status, 200);
  assert.equal((await call('/studio/backgrounds', { cookie: alice })).body.items.length, 1, 'bob cannot delete alice’s');
  assert.equal((await call(`/studio/backgrounds/${id}`, { method: 'DELETE', cookie: alice })).status, 200);
  assert.deepEqual((await call('/studio/backgrounds', { cookie: alice })).body.items, []);
  // At most STUDIO_BACKGROUND_LIMITS.perAccount per account.
  const { STUDIO_BACKGROUND_LIMITS } = await import('../scripts/studio-background.mjs');
  const bobId = (await call('/auth/me', { cookie: bob })).body.user.id;
  for (let i = 0; i < STUDIO_BACKGROUND_LIMITS.perAccount; i++) store.run('INSERT INTO studio_backgrounds(account,id,name,recipe,created,updated) VALUES(?,?,?,?,1,1)', bobId, randomUUID(), 'x', '{}');
  const full = await call(`/studio/backgrounds/${randomUUID()}`, { method: 'PUT', cookie: bob, body: { name: 'ещё', recipe: recipe() } });
  assert.equal(full.status, 409);
});
