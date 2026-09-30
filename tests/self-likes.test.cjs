const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const modules = Promise.all([import('../server/catalog-store.mjs'), import('../server/accounts.mjs'), import('../server/catalog-backgrounds.mjs'), import('../server/catalog-api.mjs')]);
const input = x => ({ title: 'Сетка ' + x, author: '', tags: ['Аниме'], grid: { version: 3, configs: [{ config_name: 'Test', categories: [{ category_name: '@', x_position: x, y_position: 30, width: 30, height: 30, hero_ids: [] }] }] } });
const identity = n => ({ browser: `browser-${n}`, ip: `ip-${n}` });
const OWN = 'Свою работу лайкнуть нельзя.';
const own = e => e.status === 403 && e.message === OWN;
// A published grid of `account` (null: a guest's).
function publish(store, x, account = null) {
  const work = store.save(input(x), identity(x), null, null, null, account);
  store.moderate(work.id, { action: 'approve', revision: work.revision });
  return work;
}
const addBackground = (store, title, account = null) => Number(store.run("INSERT INTO backgrounds(title,author,tags,aspect,seconds,bytes,hash,status,account,browser,ip,created,updated) VALUES(?,'','[]','16:9',10,1,?,'approved',?,'b','i',1,1)", title, title, account).lastInsertRowid);
const cleanups = store => store.all("SELECT work, action, actor FROM audit WHERE action LIKE 'likes:self-removed:%' ORDER BY id").map(row => ({ ...row }));

test('an author cannot like their own grid or background; others can, and unliking always works', async t => {
  const [{ CatalogStore }, , { CatalogBackgrounds }] = await modules, dir = mkdtempSync(join(tmpdir(), 'gridstudio-self-likes-'));
  const store = new CatalogStore(':memory:', 'test-self-likes'), gallery = new CatalogBackgrounds(store, { dir });
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const mine = publish(store, 10, 'alice'), guest = publish(store, 20);
  assert.throws(() => store.like(mine.id, 'alice', true), own);
  assert.deepEqual(store.like(mine.id, 'bob', true), { likes: 1, liked: true });
  assert.deepEqual(store.like(mine.id, 'alice', false), { likes: 1, liked: false }, 'taking a like back is never refused');
  assert.deepEqual(store.like(guest.id, 'alice', true), { likes: 1, liked: true }, 'a guest grid is nobody’s');
  const background = addBackground(store, 'Мой', 'alice'), other = addBackground(store, 'Гостевой');
  assert.throws(() => gallery.like(background, 'alice', true), own);
  assert.deepEqual(gallery.like(background, 'bob', true), { likes: 1, liked: true });
  assert.deepEqual(gallery.like(background, 'alice', false), { likes: 1, liked: false });
  assert.deepEqual(gallery.like(other, 'alice', true), { likes: 1, liked: true });
  assert.deepEqual(cleanups(store), [], 'nothing to clean up');
});

test('self-likes from before are removed once at start, one audit row per kind, and a second start changes nothing', async t => {
  const [{ CatalogStore }, , { CatalogBackgrounds }] = await modules, dir = mkdtempSync(join(tmpdir(), 'gridstudio-self-likes-')), file = join(dir, 'catalog.sqlite');
  let store = new CatalogStore(file, 'test-self-likes'), gallery = new CatalogBackgrounds(store, { dir });
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const alices = publish(store, 10, 'alice'), bobs = publish(store, 20, 'bob'), guest = publish(store, 30);
  const background = addBackground(store, 'Мой', 'alice'), guestBackground = addBackground(store, 'Гостевой');
  // Written straight into the tables, as the old like() allowed.
  const like = (work, account) => store.run('INSERT INTO likes VALUES(?,?,1)', work, account);
  like(alices.id, 'alice'); like(alices.id, 'bob'); like(bobs.id, 'bob'); like(bobs.id, 'alice'); like(guest.id, 'alice');
  for (const [id, account] of [[background, 'alice'], [background, 'bob'], [guestBackground, 'alice']]) store.run('INSERT INTO background_likes VALUES(?,?,1)', id, account);
  const likes = () => store.all('SELECT work, account FROM likes ORDER BY work, account').map(row => `${row.work === alices.id ? 'alices' : row.work === bobs.id ? 'bobs' : 'guest'}:${row.account}`).sort();
  const backgroundLikes = () => store.all('SELECT background, account FROM background_likes ORDER BY background, account').map(row => `${row.background}:${row.account}`);
  store.close(); store = new CatalogStore(file, 'test-self-likes');  // the next start of the API or the bot
  assert.deepEqual(likes(), ['alices:bob', 'bobs:alice', 'guest:alice'], 'only the two self-likes are gone');
  assert.deepEqual(cleanups(store), [{ work: null, action: 'likes:self-removed:2', actor: null }]);
  assert.deepEqual(backgroundLikes(), [`${background}:alice`, `${background}:bob`, `${guestBackground}:alice`], 'backgrounds wait for their own module');
  gallery = new CatalogBackgrounds(store, { dir });
  assert.deepEqual(backgroundLikes(), [`${background}:bob`, `${guestBackground}:alice`]);
  assert.deepEqual(cleanups(store), [{ work: null, action: 'likes:self-removed:2', actor: null }, { work: 'bg:*', action: 'likes:self-removed:1', actor: null }]);
  store.close(); store = new CatalogStore(file, 'test-self-likes'); gallery = new CatalogBackgrounds(store, { dir });
  assert.equal(cleanups(store).length, 2, 'a second start removes nothing and writes no row');
  assert.equal(store.publicItem(alices.id, 'alice').likes, 1);
  // The rows match no work, so the account's daily submission budget is untouched.
  assert.equal(store.get("SELECT count(*) n FROM audit a JOIN works w ON w.id=a.work WHERE a.action LIKE 'likes:%'").n, 0);
});

test('the API and the bot starting together: the start that finds the self-likes gone under the write lock records nothing', async t => {
  const [{ CatalogStore }] = await modules, dir = mkdtempSync(join(tmpdir(), 'gridstudio-self-likes-')), file = join(dir, 'catalog.sqlite');
  const api = new CatalogStore(file, 'test-self-likes'), bot = new CatalogStore(file, 'test-self-likes');
  t.after(() => { api.close(); bot.close(); rmSync(dir, { recursive: true, force: true }); });
  const work = publish(api, 10, 'alice');
  api.run('INSERT INTO likes VALUES(?,?,1)', work.id, 'alice'); api.run('INSERT INTO likes VALUES(?,?,1)', work.id, 'bob');
  // The bot saw the self-like before taking the write lock; the API removed it in between.
  const tx = bot.tx.bind(bot); bot.tx = fn => { assert.equal(api.removeSelfLikes('likes', 'work', 'works'), 1); return tx(fn); };
  assert.equal(bot.removeSelfLikes('likes', 'work', 'works'), 0);
  assert.deepEqual(cleanups(bot), [{ work: null, action: 'likes:self-removed:1', actor: null }]);
  assert.deepEqual(bot.all('SELECT account FROM likes').map(row => row.account), ['bob']);
});

test('claiming a guest grid removes the claimer’s own like on it, not other likes', async t => {
  const [{ CatalogStore }, { Accounts }] = await modules;
  const store = new CatalogStore(':memory:', 'test-self-likes'), accounts = new Accounts(store); t.after(() => store.close());
  const work = publish(store, 10);
  store.like(work.id, 'alice', true); store.like(work.id, 'bob', true);
  accounts.claim(work.id, work.managementToken, { id: 'alice' });
  assert.deepEqual((({ likes, liked, mine }) => ({ likes, liked, mine }))(store.publicItem(work.id, 'alice')), { likes: 1, liked: false, mine: true });
  assert.equal(store.publicItem(work.id, 'bob').liked, true);
  assert.throws(() => store.like(work.id, 'alice', true), own);
  assert.deepEqual(accounts.claim(work.id, work.managementToken, { id: 'alice' }), { linked: true }, 'claiming again changes nothing');
  assert.equal(store.publicItem(work.id).likes, 1);
});

test('HTTP: 403 for liking your own grid or background; `mine` on backgrounds only for their owner', async t => {
  const [{ CatalogStore }, , { CatalogBackgrounds }, { createCatalogAPI }] = await modules, media = mkdtempSync(join(tmpdir(), 'gridstudio-self-likes-'));
  const store = new CatalogStore(':memory:', 'test-self-likes'), config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-self-likes', database: ':memory:', media };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); rmSync(media, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  let session = '';
  const call = async (path, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: { Origin: config.origin, Cookie: session, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const signIn = telegram => { const login = accounts.begin(`ip${telegram}`, `b${telegram}`); accounts.candidate(login.id, { id: telegram, first_name: 'A', is_bot: false }); accounts.approve(login.id, telegram, true); return `gs_account=${accounts.finish(login.id, login.verifier, String(telegram)).session}`; };
  const alice = signIn(3001), bob = signIn(3002);
  new CatalogBackgrounds(store, { dir: media });
  const hers = addBackground(store, 'Её фон', '3001'), guests = addBackground(store, 'Гостевой');
  const work = publish(store, 10, '3001');

  session = alice;
  assert.deepEqual(await call(`/works/${work.id}/like`, 'PUT', { liked: true }), { status: 403, body: { error: OWN } });
  assert.deepEqual(await call(`/backgrounds/${hers}/like`, 'PUT', { liked: true }), { status: 403, body: { error: OWN } });
  assert.deepEqual((await call(`/backgrounds/${hers}/like`, 'PUT', { liked: false })).body, { likes: 0, liked: false });
  const mine = async () => Object.fromEntries((await call('/backgrounds')).body.items.map(item => [item.title, item.mine]));
  assert.deepEqual(await mine(), { 'Её фон': true, 'Гостевой': false });
  assert.equal((await call(`/backgrounds/${hers}`)).body.mine, true);
  assert.equal((await call(`/works/${work.id}`)).body.mine, true);
  session = bob;
  assert.deepEqual(await mine(), { 'Её фон': false, 'Гостевой': false }, 'per viewer, not cached from the owner’s request');
  assert.equal((await call(`/backgrounds/${hers}`)).body.mine, false);
  assert.deepEqual(await call(`/works/${work.id}/like`, 'PUT', { liked: true }), { status: 200, body: { likes: 1, liked: true } });
  assert.deepEqual(await call(`/backgrounds/${hers}/like`, 'PUT', { liked: true }), { status: 200, body: { likes: 1, liked: true } });
  assert.deepEqual(await call(`/backgrounds/${guests}/like`, 'PUT', { liked: true }), { status: 200, body: { likes: 1, liked: true } });
  session = '';
  assert.deepEqual(await mine(), { 'Её фон': false, 'Гостевой': false });
});
