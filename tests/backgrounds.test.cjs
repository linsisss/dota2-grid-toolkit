const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { proof } = require('./captcha-helper.cjs');

const hasFFmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const webm = (size, seconds = 2, color = '0x6040a0') => new Uint8Array(spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=${size}:r=30:d=${seconds}`,
  '-c:v', 'libvpx-vp9', '-b:v', '200k', '-deadline', 'realtime', '-cpu-used', '8', '-an', '-f', 'webm', '-'], { maxBuffer: 5e7 }).stdout);

test('shared backgrounds: captcha, ffprobe-checked upload, moderation, gallery, ranged video, limits', { skip: !hasFFmpeg && 'ffmpeg is not installed' }, async t => {
  const [{ CatalogStore }, { createCatalogAPI }, { packBackgroundUpload }, { TelegramQueue }, { createCanvas }] = await Promise.all([
    import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs'), import('../scripts/background-document.mjs'), import('../server/catalog-telegram-store.mjs'), import('@napi-rs/canvas')]);
  const media = mkdtempSync(join(tmpdir(), 'gridstudio-backgrounds-'));
  const store = new CatalogStore(':memory:', 'test-backgrounds');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-backgrounds', admins: new Set(['1253427']), database: ':memory:', media };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); rmSync(media, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  let cookie = '';
  async function call(path, method = 'GET', body, headers = {}) {
    const response = await fetch(base + path, { method, headers: { Origin: config.origin, Cookie: cookie, ...(body && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body ? { body: body instanceof Uint8Array ? body : JSON.stringify(body) } : {}) });
    for (const set of response.headers.getSetCookie()) { const name = set.split('=')[0]; cookie = cookie.split('; ').filter(value => value && !value.startsWith(name + '=')).concat(set.split(';')[0]).join('; '); }
    const type = response.headers.get('content-type') || '';
    return { status: response.status, headers: response.headers, body: type.startsWith('application/json') ? await response.json() : new Uint8Array(await response.arrayBuffer()) };
  }
  const poster = new Uint8Array(await createCanvas(320, 180).encode('jpeg', 80));
  const video = webm('1920x1080');
  const meta = (extra = {}) => ({ title: 'Лес', author: 'тест', tags: ['Природа', 'Космос'], aspect: '16:9', ...extra });
  const upload = async (m, v = video) => call('/backgrounds', 'POST', packBackgroundUpload({ ...m, captcha: await proof(call, 'background') }, poster, v), { 'Content-Type': 'application/octet-stream' });

  assert.ok((await call('/config')).body.backgroundTags.includes('Аниме'));
  assert.equal((await call('/backgrounds', 'POST', packBackgroundUpload(meta(), poster, video), { 'Content-Type': 'application/octet-stream' })).status, 400, 'no captcha');
  assert.equal((await upload(meta({ tags: ['Нет такого'] }))).status, 400);
  assert.equal((await upload(meta({ tags: ['Аниме', 'Игры', 'Мемы', 'Космос'] }))).status, 400, 'at most three tags');
  const wrong = await upload(meta(), webm('640x360'));
  assert.equal(wrong.status, 415); assert.match(wrong.body.error, /640×360.*1920×1080/);
  const sent = await upload(meta());
  assert.equal(sent.status, 201); assert.equal(sent.body.status, 'pending');
  const id = sent.body.id;
  assert.equal((await call('/backgrounds')).body.total, 0, 'pending ones are not public');
  assert.equal((await call(`/backgrounds/${id}/video.webm`)).status, 404);
  assert.equal((await call(`/backgrounds/${id}`)).status, 404, 'a pending one is not found by id either');
  // The author follows the moderation with the token from the answer.
  assert.match(sent.body.token, /^[a-f0-9]{32}$/);
  const status = async (token = sent.body.token) => call(`/backgrounds/${id}/status?token=${token}`);
  assert.deepEqual((await status()).body, { id, status: 'pending', reason: '' });
  assert.equal((await status('0'.repeat(32))).status, 404, 'a wrong token tells nothing');
  assert.equal((await upload(meta())).status, 409, 'the same video twice');

  // The Telegram topic gets a card; approving it there publishes the background.
  const { CatalogBackgrounds } = await import('../server/catalog-backgrounds.mjs');
  const queue = new TelegramQueue(store, { backgrounds: new CatalogBackgrounds(store, { dir: media }) });
  queue.sync();
  const card = store.get("SELECT * FROM telegram_reviews WHERE kind='background'");
  assert.equal(card.revision, id); assert.equal(JSON.parse(card.summary).aspect, '16:9');
  queue.decide(card.id, 'approve', { id: '1253427', name: 'admin' });

  assert.equal((await status()).body.status, 'approved');
  const list = (await call('/backgrounds')).body;
  assert.equal(list.total, 1); assert.deepEqual([list.items[0].title, list.items[0].aspect, list.items[0].tags], ['Лес', '16:9', ['Космос', 'Природа']]);
  assert.ok(list.items[0].seconds > 1.5 && list.items[0].seconds < 2.5);
  assert.deepEqual((({ title, aspect }) => ({ title, aspect }))((await call(`/backgrounds/${id}`)).body), { title: 'Лес', aspect: '16:9' });
  const full = await call(`/backgrounds/${id}/video.webm`);
  assert.equal(full.status, 200); assert.equal(full.body.length, video.length); assert.match(full.headers.get('cache-control'), /immutable/);
  const part = await call(`/backgrounds/${id}/video.webm`, 'GET', null, { Range: 'bytes=10-99' });
  assert.equal(part.status, 206); assert.equal(part.body.length, 90); assert.deepEqual([...part.body], [...video.subarray(10, 100)]);
  const cover = await call(`/backgrounds/${id}/poster.jpg`);
  assert.equal(cover.status, 200); assert.equal(cover.headers.get('content-type'), 'image/jpeg');
  assert.equal((await call('/backgrounds?tag=Аниме')).body.total, 0);
  assert.equal((await call('/backgrounds?tag=Космос')).body.total, 1);
  assert.equal((await call('/backgrounds?tag=Нет')).status, 400);
  assert.equal((await call(`/backgrounds?q=${encodeURIComponent('лЕс')}`)).body.total, 1, 'search ignores case');
  assert.equal((await call('/backgrounds?q=тест')).body.total, 1, 'and finds the author');
  assert.equal((await call('/backgrounds?q=100%')).body.total, 0);

  // Guests: three a day (the rejected upload above did not count).
  assert.equal((await upload(meta({ title: 'Два' }), webm('1920x1080', 2, '0x204060'))).status, 201);
  assert.equal((await upload(meta({ title: 'Три' }), webm('1920x1080', 2, '0x602040'))).status, 201);
  const limited = await upload(meta({ title: 'Четыре' }), webm('1920x1080', 2, '0x406020'));
  assert.equal(limited.status, 429); assert.equal(limited.body.code, 'background_guest_limit');

  // Admins moderate on the site; others are refused.
  assert.equal((await call('/admin/backgrounds')).status, 401);
  const login = accounts.begin('ip', 'browser'); accounts.candidate(login.id, { id: 1253427, first_name: 'A', is_bot: false }); accounts.approve(login.id, 1253427, true);
  cookie += `; gs_account=${accounts.finish(login.id, login.verifier, '1253427').session}`;
  const pending = (await call('/admin/backgrounds')).body;
  assert.equal(pending.counts.pending, 2);
  assert.equal((await call(`/backgrounds/${pending.items[0].id}/video.webm`)).status, 200, 'admins can watch pending ones');
  assert.equal((await call(`/admin/backgrounds/${pending.items[0].id}`, 'POST', { action: 'reject', reason: '' })).status, 400, 'a reason is needed');
  assert.equal((await call(`/admin/backgrounds/${pending.items[0].id}`, 'POST', { action: 'reject', reason: 'Не подходит' })).body.status, 'rejected');
  assert.equal((await call(`/admin/backgrounds/${id}`, 'POST', { action: 'hide', reason: 'Повтор' })).body.status, 'hidden');
  assert.deepEqual((await status()).body, { id, status: 'hidden', reason: 'Повтор' }, 'hidden, with the reason');
  assert.equal((await call('/backgrounds')).body.total, 0);
});

test('backgrounds from before tags: the category becomes the only tag, «Другое» none', async t => {
  const [{ CatalogStore }, { CatalogBackgrounds }] = await Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-backgrounds.mjs')]);
  const dir = mkdtempSync(join(tmpdir(), 'gridstudio-backgrounds-')), store = new CatalogStore(':memory:', 'test-migration');
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  store.db.exec(`CREATE TABLE backgrounds(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, author TEXT NOT NULL, category TEXT NOT NULL,
    aspect TEXT NOT NULL, seconds REAL NOT NULL, bytes INTEGER NOT NULL, hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reason TEXT NOT NULL DEFAULT '',
    account TEXT, browser TEXT NOT NULL, ip TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL);`);
  for (const [title, category] of [['Корги', 'Аниме'], ['Что-то', 'Другое']])
    store.run("INSERT INTO backgrounds(title,author,category,aspect,seconds,bytes,hash,status,browser,ip,created,updated) VALUES(?,?,?,'16:9',30,1,?,'approved','b','i',1,1)", title, '', category, title);
  const gallery = new CatalogBackgrounds(store, { dir });
  assert.deepEqual(gallery.list().items.map(item => [item.title, item.tags]).sort(), [['Корги', ['Аниме']], ['Что-то', []]]);
  assert.ok(!store.all('PRAGMA table_info(backgrounds)').some(column => column.name === 'category'));
  new CatalogBackgrounds(store, { dir });  // a second start changes nothing
  assert.equal(gallery.list({ tag: 'Аниме' }).total, 1);
});

test('background likes, the popular order and reports, moderated in Telegram and on the site', async t => {
  const [{ CatalogStore }, { createCatalogAPI }, { TelegramQueue }, { CatalogBackgrounds }] = await Promise.all([
    import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs'), import('../server/catalog-telegram-store.mjs'), import('../server/catalog-backgrounds.mjs')]);
  const media = mkdtempSync(join(tmpdir(), 'gridstudio-backgrounds-')), store = new CatalogStore(':memory:', 'test-background-likes');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-background-likes', admins: new Set(['1253427']), database: ':memory:', media };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); rmSync(media, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  let cookie = '';
  async function call(path, method = 'GET', body, headers = {}) {
    const response = await fetch(base + path, { method, headers: { Origin: config.origin, Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    for (const set of response.headers.getSetCookie()) { const name = set.split('=')[0]; cookie = cookie.split('; ').filter(value => value && !value.startsWith(name + '=')).concat(set.split(';')[0]).join('; '); }
    return { status: response.status, body: await response.json().catch(() => null) };
  }
  const signIn = (telegram) => { const login = accounts.begin(`ip${telegram}`, `b${telegram}`); accounts.candidate(login.id, { id: telegram, first_name: 'A', is_bot: false }); accounts.approve(login.id, telegram, true); return `gs_account=${accounts.finish(login.id, login.verifier, String(telegram)).session}`; };
  const as = (session) => { cookie = cookie.split('; ').filter(value => value && !value.startsWith('gs_account=')).concat(session ? [session] : []).join('; '); };
  const gallery = new CatalogBackgrounds(store, { dir: media });
  const add = (title, updated, status = 'approved') => Number(store.run("INSERT INTO backgrounds(title,author,tags,aspect,seconds,bytes,hash,status,browser,ip,created,updated) VALUES(?,'','[]','16:9',10,1,?,?,'b','i',?,?)", title, title, status, updated, updated).lastInsertRowid);
  const older = add('Старый', 1), newer = add('Новый', 2), pending = add('Ждёт', 3, 'pending');
  const order = async (sort = '') => (await call(`/backgrounds${sort ? `?sort=${sort}` : ''}`)).body.items.map(item => [item.title, item.likes, item.liked]);

  assert.equal((await call(`/backgrounds/${older}/like`, 'PUT', { liked: true })).status, 401, 'likes need Telegram');
  const alice = signIn(2001), bob = signIn(2002);
  as(alice); assert.deepEqual((await call(`/backgrounds/${older}/like`, 'PUT', { liked: true })).body, { likes: 1, liked: true });
  as(bob); assert.deepEqual((await call(`/backgrounds/${older}/like`, 'PUT', { liked: true })).body, { likes: 2, liked: true });
  assert.equal((await call(`/backgrounds/${pending}/like`, 'PUT', { liked: true })).status, 404, 'only approved ones');
  as(alice);
  assert.deepEqual(await order(), [['Новый', 0, false], ['Старый', 2, true]], 'newest first');
  assert.deepEqual(await order('popular'), [['Старый', 2, true], ['Новый', 0, false]], 'most liked first');
  assert.deepEqual((await call(`/backgrounds/${older}/like`, 'PUT', { liked: false })).body, { likes: 1, liked: false });
  as(null); assert.deepEqual((await call(`/backgrounds/${older}`)).body.liked, false);

  // Reports: the captcha, one open report per browser, then the Telegram topic and the admin tab.
  assert.equal((await call(`/backgrounds/${newer}/report`, 'POST', { reason: 'Чужое видео' })).status, 400, 'no captcha');
  assert.deepEqual((await call(`/backgrounds/${newer}/report`, 'POST', { reason: 'Чужое видео', captcha: await proof(call, 'report') })).body, { reported: true });
  const queue = new TelegramQueue(store, { backgrounds: gallery }); queue.sync();
  const card = store.get("SELECT * FROM telegram_reviews WHERE kind='background-report'");
  assert.equal(card.revision, newer); assert.equal(JSON.parse(card.summary).reason, 'Чужое видео');
  as(signIn(1253427));
  const reported = (await call('/admin/backgrounds?filter=reports')).body;
  assert.equal(reported.counts.reports, 1); assert.deepEqual(reported.items[0].reports.map(report => report.reason), ['Чужое видео']);
  queue.decide(card.id, 'keep', { id: '1253427', name: 'admin' });
  assert.equal((await call('/admin/backgrounds?filter=reports')).body.counts.reports, 0, 'kept: the report is closed');
  assert.equal((await call(`/backgrounds/${newer}`)).status, 200);
  // A new report, hidden from the site this time; the Telegram card follows.
  as(null); await call(`/backgrounds/${newer}/report`, 'POST', { reason: 'Снова', captcha: await proof(call, 'report') });
  queue.sync(); const second = store.get("SELECT * FROM telegram_reviews WHERE kind='background-report' AND state!='finished'");
  as(signIn(1253427)); assert.equal((await call(`/admin/backgrounds/${newer}`, 'POST', { action: 'hide', reason: 'Жалоба подтвердилась' })).body.status, 'hidden');
  queue.sync(); assert.equal(queue.get(second.id).outcome, 'hide');
  assert.equal((await call(`/backgrounds/${newer}`)).status, 404);
});
