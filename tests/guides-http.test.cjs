const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

// «Гайды» end to end over HTTP (server/guides.mjs, server/guides-api.mjs) and the Telegram queue.
const modules = Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs'), import('../server/catalog-telegram-store.mjs'),
  import('../server/guides.mjs'), import('@napi-rs/canvas')]);

async function setup(t) {
  const [{ CatalogStore }, { createCatalogAPI }] = await modules;
  const dir = mkdtempSync(join(tmpdir(), 'guides-test-'));
  const store = new CatalogStore(':memory:', 'test-guides');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-guides', admins: new Set(['1253427']), database: ':memory:', guides: dir };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const signIn = (id) => { const login = accounts.begin(`ip-${id}`, `browser-${id}`); accounts.candidate(login.id, { id: Number(id), first_name: `U${id}`, is_bot: false });
    accounts.approve(login.id, Number(id), true); return accounts.finish(login.id, login.verifier, id).session; };
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const as = (session) => async (path, method = 'GET', body, extra = {}) => {
    const raw = body instanceof Uint8Array;
    const response = await fetch(base + path, { method, headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json', Origin: config.origin,
      Cookie: session ? `gs_account=${session}` : '', ...extra }, ...(body ? { body: raw ? body : JSON.stringify(body) } : {}) });
    const type = response.headers.get('content-type') || '';
    return { status: response.status, headers: response.headers, body: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
  };
  return { store, dir, signIn, as };
}
async function png(width = 64, height = 48) {
  const { createCanvas } = (await modules)[4];
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c4b5ed'; ctx.fillRect(0, 0, width, height);
  return new Uint8Array(await canvas.encode('png'));
}
// Two parts, the second sent twice (a lost answer), as src/guides/api.js does.
async function upload(call, bytes, kind, name) {
  const start = await call('/guides/uploads', 'POST', { kind, name, size: bytes.length });
  assert.equal(start.status, 201, JSON.stringify(start.body));
  const half = Math.ceil(bytes.length / 2);
  assert.equal((await call(`/guides/uploads/${start.body.id}?offset=0`, 'PUT', bytes.subarray(0, half))).status, 200);
  assert.equal((await call(`/guides/uploads/${start.body.id}?offset=${half}`, 'PUT', bytes.subarray(half))).status, 200);
  assert.equal((await call(`/guides/uploads/${start.body.id}?offset=${half}`, 'PUT', bytes.subarray(half))).status, 200, 'a repeated part is fine');
  return call(`/guides/uploads/${start.body.id}/done`, 'POST', {});
}
const doc = (image, file) => ({ type: 'doc', content: [
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Как собрать минипрофиль' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'Минипрофиль — карточка, которая видна при наведении на ник. Вот как её оформить шаг за шагом.' }] },
  { type: 'image', attrs: { media: image, alt: 'Готовый минипрофиль' } },
  ...(file ? [{ type: 'file', attrs: { media: file } }] : [])
] });

test('a guide goes from draft through the Telegram topic to the page, with likes and comments', async (t) => {
  const { store, signIn, as } = await setup(t);
  const [, , { TelegramQueue }, { CatalogGuides }] = await modules;
  const author = as(signIn('555')), reader = as(signIn('777')), guest = as(null), admin = as(signIn('1253427'));
  assert.equal((await guest('/guides/uploads', 'POST', { kind: 'image', name: 'a.png', size: 10 })).status, 401, 'uploads need Telegram');
  assert.equal((await author('/guides/uploads', 'POST', { kind: 'file', name: 'setup.exe', size: 10 })).status, 415, 'no programs');
  assert.equal((await author('/guides/uploads', 'POST', { kind: 'image', name: 'big.png', size: 11 * 1024 * 1024 })).status, 413);

  const image = await upload(author, await png(), 'image', 'C:\\Users\\me\\Pictures\\profile.png');
  assert.equal(image.status, 200, JSON.stringify(image.body));
  assert.deepEqual([image.body.kind, image.body.name, image.body.width, image.body.height], ['image', 'profile.png', 64, 48]);
  assert.match(image.body.url, /\.webp$/, 'pictures are re-encoded to WebP');
  const file = await upload(author, new TextEncoder().encode('{"config":1}'), 'file', 'hero_grid_config.json');
  assert.equal(file.status, 200);
  const notPicture = await upload(author, new TextEncoder().encode('not a picture at all, just text bytes'), 'image', 'fake.png');
  assert.equal(notPicture.status, 415);

  // Only the author sees the uploads before publication.
  assert.equal((await reader(image.body.url.replace('/api/catalog', ''))).status, 404);
  assert.equal((await author(image.body.url.replace('/api/catalog', ''))).status, 200);

  const saved = await author('/guides', 'POST', { title: '  Минипрофиль  за 5 минут ', category: 'miniprofiles', doc: doc(image.body.id, file.body.id) });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const id = saved.body.id;
  assert.equal((await reader('/guides', 'POST', { id, title: 'Чужой', doc: doc(image.body.id) })).status, 404, 'not someone else’s guide');
  assert.equal((await reader('/guides', 'POST', { title: 'Чужая картинка', doc: doc(image.body.id) })).status, 400, 'not someone else’s upload');
  assert.equal((await guest(`/guides/${id}`)).status, 404, 'a draft is not public');
  const own = await author(`/guides/${id}`);
  assert.deepEqual([own.body.title, own.body.status, own.body.public], ['Минипрофиль за 5 минут', 'draft', false]);

  assert.equal((await author(`/guides/${id}/submit`, 'POST', {})).status, 200);
  const queue = new TelegramQueue(store, { guides: new CatalogGuides(store, { dir: join(tmpdir(), 'unused'), salt: 'test-guides' }) });
  queue.sync();
  const card = store.get("SELECT * FROM telegram_reviews WHERE kind='guide'");
  const summary = JSON.parse(card.summary);
  assert.deepEqual([summary.title, summary.category, summary.images, summary.files, summary.update], ['Минипрофиль за 5 минут', 'Минипрофили', 1, ['hero_grid_config.json'], false]);
  // The card's review link opens this version and its files for moderators in the topic.
  assert.equal((await guest(`/guides/${id}?review=${summary.review}`)).body.title, 'Минипрофиль за 5 минут');
  assert.equal((await guest(`${file.body.url.replace('/api/catalog', '')}?review=${summary.review}`)).status, 200);
  assert.equal((await guest(`/guides/${id}?review=${summary.review.slice(0, -1)}x`)).status, 404);
  queue.decide(card.id, 'approve', { id: 1, name: 'Модератор' });

  const list = await guest('/guides?category=miniprofiles');
  assert.equal(list.body.items.length, 1);
  // Authors and commenters show as their creator profiles (server/profiles.mjs), not their Telegram names.
  const nick = (account) => store.profiles.creator(account).name;
  assert.deepEqual([list.body.items[0].title, list.body.items[0].author.name, !!list.body.items[0].cover], ['Минипрофиль за 5 минут', nick('555'), true]);
  assert.equal(list.body.items[0].author.key, store.profiles.creator('555').key);
  assert.equal((await guest('/guides?category=profiles')).body.items.length, 0);
  assert.equal((await guest('/guides?q=наведении')).body.items.length, 1, 'search finds the text');
  const page = await guest(`/guides/${id}`);
  assert.equal(page.status, 200);
  assert.equal(page.body.doc.content[2].type, 'image');
  assert.equal(page.body.media[file.body.id].name, 'hero_grid_config.json');
  const download = await guest(file.body.url.replace('/api/catalog', ''));
  assert.match(download.headers.get('content-disposition'), /^attachment;/);
  assert.match(download.headers.get('content-security-policy'), /sandbox/);
  assert.match(download.headers.get('cache-control'), /immutable/);
  assert.equal(store.get('SELECT state FROM guide_notices WHERE guide=?', id).state, 'queued', 'the author hears from the bot');

  // Likes: not one's own.
  assert.equal((await author(`/guides/${id}/like`, 'PUT', { liked: true })).status, 403);
  assert.deepEqual((await reader(`/guides/${id}/like`, 'PUT', { liked: true })).body, { likes: 1, liked: true });
  assert.equal((await guest(`/guides/${id}/like`, 'PUT', { liked: true })).status, 401);

  // Comments: at once; the guide's author removes one; a report goes to the topic and hides another.
  const first = await reader(`/guides/${id}/comments`, 'POST', { body: '  Спасибо, получилось!  ' });
  assert.equal(first.status, 201);
  assert.equal(first.body.body, 'Спасибо, получилось!');
  const reply = await author(`/guides/${id}/comments`, 'POST', { body: 'Рад помочь', reply: first.body.id });
  assert.deepEqual(reply.body.reply, { id: first.body.id, name: nick('777') });
  assert.equal((await guest(`/guides/${id}/comments`, 'POST', { body: 'аноним' })).status, 401);
  const second = await admin(`/guides/${id}/comments`, 'POST', { body: 'Отдельная ветка' });
  const deeper = await reader(`/guides/${id}/comments`, 'POST', { body: 'А ещё вопрос', reply: reply.body.id });
  assert.deepEqual([reply.body.thread, deeper.body.thread, deeper.body.reply.id], [first.body.id, first.body.id, reply.body.id], 'a reply to a reply stays in its thread');
  const thread = await guest(`/guides/${id}/comments`);
  assert.deepEqual(thread.body.items.map((item) => item.body), ['Спасибо, получилось!', 'Рад помочь', 'А ещё вопрос', 'Отдельная ветка'], 'threads together, oldest first');
  assert.equal((await guest(`/guides/${id}/comments?offset=3`)).body.items[0].body, 'Отдельная ветка');
  await author(`/guides/comments/${deeper.body.id}`, 'DELETE'); await admin(`/guides/comments/${second.body.id}`, 'DELETE');
  assert.equal((await reader(`/guides/comments/${reply.body.id}`, 'DELETE')).status, 403, 'not someone else’s comment on someone else’s guide');
  assert.equal((await author(`/guides/comments/${first.body.id}`, 'DELETE')).status, 200, 'the guide’s author may remove it');
  const after = await guest(`/guides/${id}/comments`);
  assert.deepEqual(after.body.items.map((item) => [item.deleted, item.body]), [[true, ''], [false, 'Рад помочь']], 'a removed comment with a reply stays as removed');
  assert.equal(after.body.total, 1);

  const rude = await reader(`/guides/${id}/comments`, 'POST', { body: 'грубость' });
  assert.equal((await author(`/guides/${id}/report`, 'POST', { comment: rude.body.id, reason: 'Оскорбление' })).status, 200);
  queue.sync();
  const report = store.get("SELECT * FROM telegram_reviews WHERE kind='guide-comment-report'");
  assert.equal(JSON.parse(report.summary).comment, 'грубость');
  queue.decide(report.id, 'hide', { id: 1, name: 'Модератор' });
  assert.equal((await guest(`/guides/${id}/comments`)).body.items.some((item) => item.body === 'грубость'), false);

  // An edit waits while the published version stays; approval replaces it.
  const edit = await author(`/guides/${id}/edit`);
  assert.equal(edit.body.revision, null, 'no draft yet: the published version to start from');
  assert.equal((await author('/guides', 'POST', { id, title: 'Минипрофиль: обновлено', category: 'miniprofiles', doc: doc(image.body.id) })).status, 200);
  assert.equal((await guest(`/guides/${id}`)).body.title, 'Минипрофиль за 5 минут');
  assert.equal((await author(`/guides/${id}/submit`, 'POST', {})).status, 200);
  const update = (await admin('/admin/guides?filter=pending')).body.items[0];
  assert.equal(update.update, true);
  assert.equal((await reader(`/admin/guides/${update.revision}`, 'POST', { action: 'approve' })).status, 403);
  assert.equal((await admin(`/admin/guides/${update.revision}`, 'POST', { action: 'reject' })).status, 400, 'a reason is needed');
  assert.equal((await admin(`/admin/guides/${update.revision}`, 'POST', { action: 'approve' })).status, 200);
  assert.equal((await guest(`/guides/${id}`)).body.title, 'Минипрофиль: обновлено');
  assert.deepEqual((await guest(`/guides/${id}`)).body.likes, 1, 'likes stay with the guide');

  // The author deletes it: the page, its comments and the files nothing else uses go.
  assert.equal((await reader(`/guides/${id}`, 'DELETE')).status, 404);
  assert.equal((await author(`/guides/${id}`, 'DELETE')).status, 200);
  assert.equal((await guest(`/guides/${id}`)).status, 404);
  assert.equal((await guest(file.body.url.replace('/api/catalog', ''))).status, 404);
  assert.equal(store.get('SELECT count(*) n FROM guide_comments').n, 0);
});

test('uploads refuse parts out of order and a rejected guide tells its author why', async (t) => {
  const { store, signIn, as } = await setup(t);
  const author = as(signIn('555')), admin = as(signIn('1253427'));
  const bytes = await png();
  const start = await author('/guides/uploads', 'POST', { kind: 'image', name: 'a.png', size: bytes.length });
  const skipped = await author(`/guides/uploads/${start.body.id}?offset=10`, 'PUT', bytes.subarray(10));
  assert.equal(skipped.status, 409);
  assert.equal(skipped.body.received, 0);
  assert.equal((await author(`/guides/uploads/${start.body.id}/done`, 'POST', {})).status, 409, 'not finished');
  const image = await upload(author, bytes, 'image', 'b.png');
  const saved = await author('/guides', 'POST', { title: 'Профиль', category: 'profiles', doc: doc(image.body.id) });
  assert.equal((await author(`/guides/${saved.body.id}/submit`, 'POST', {})).status, 200);
  const pending = (await admin('/admin/guides')).body.items[0];
  assert.equal((await admin(`/admin/guides/${pending.revision}`, 'POST', { action: 'reject', reason: 'Мало подробностей' })).status, 200);
  const mine = await author('/guides/mine');
  assert.deepEqual([mine.body.items[0].status, mine.body.items[0].draft.status, mine.body.items[0].draft.reason], ['rejected', 'rejected', 'Мало подробностей']);
  assert.equal(store.get("SELECT kind FROM reject_notices").kind, 'guide');
  // Editing a rejected draft makes it a draft again, to send once more.
  assert.equal((await author('/guides', 'POST', { id: saved.body.id, title: 'Профиль подробно', category: 'profiles', doc: doc(image.body.id) })).body.status, 'draft');
  assert.equal((await author('/guides/mine')).body.items[0].status, 'draft');
});

test('pictures come upright and small, GIFs stay animated, the file name stays a name', async () => {
  const [, , , { imageInfo, cleanFileName }] = await modules;
  assert.equal(cleanFileName('..\\..\\evil<>.json'), 'evil.json');
  assert.equal(cleanFileName('...'), 'file');
  const gif = Buffer.from('474946383961' + '0a00' + '0500' + '00'.repeat(30), 'hex');
  assert.deepEqual(imageInfo(new Uint8Array(gif)), { type: 'gif', width: 10, height: 5 });
  assert.equal(imageInfo(new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))), null, 'no SVG');
});

test('admins correct and publish someone else’s guide at once, hide, restore and delete it', async (t) => {
  const { store, signIn, as } = await setup(t);
  const author = as(signIn('555')), reader = as(signIn('777')), admin = as(signIn('1253427')), guest = as(null);
  const image = await upload(author, await png(), 'image', 'a.png');
  const id = (await author('/guides', 'POST', { title: 'Профиль', category: 'profiles', doc: doc(image.body.id) })).body.id;
  assert.equal((await reader(`/guides/${id}/edit`)).status, 404, 'not someone else’s draft');
  const edit = await admin(`/guides/${id}/edit`);
  assert.deepEqual([edit.body.foreign, edit.body.author.name], [true, store.profiles.creator('555').name]);
  const own = await upload(admin, await png(32, 32), 'image', 'admin.png');
  assert.equal((await admin('/guides', 'POST', { id, revision: edit.body.revision, title: 'Профиль: поправлено', category: 'profiles', doc: doc(own.body.id) })).status, 200,
    'an admin’s own picture goes into the author’s guide');
  assert.equal((await reader(`/guides/${id}/publish`, 'POST', {})).status, 403);
  assert.equal((await author(`/guides/${id}/publish`, 'POST', {})).status, 403, 'authors go through review');
  assert.equal((await admin(`/guides/${id}/publish`, 'POST', {})).status, 200);
  const page = await guest(`/guides/${id}`);
  assert.equal(page.body.title, 'Профиль: поправлено');
  assert.equal((await guest(own.body.url.replace('/api/catalog', ''))).status, 200);
  const view = await admin(`/guides/${id}`);
  assert.deepEqual([view.body.guideStatus, view.body.publicRevision], ['approved', page.body.revision]);
  assert.equal((await admin(`/admin/guides/${view.body.publicRevision}`, 'POST', { action: 'hide', reason: 'Проверка' })).status, 200);
  assert.equal((await guest(`/guides/${id}`)).status, 404);
  assert.equal((await admin(`/guides/${id}`)).body.guideStatus, 'hidden', 'admins still open a hidden guide');
  assert.equal((await admin(`/admin/guides/${view.body.publicRevision}`, 'POST', { action: 'restore' })).status, 200);
  assert.equal((await guest(`/guides/${id}`)).status, 200);
  assert.equal((await admin(`/guides/${id}`, 'DELETE')).status, 404, 'deleting someone else’s guide is said out loud (?admin)');
  assert.equal((await admin(`/guides/${id}?admin=1`, 'DELETE')).status, 200);
  assert.equal((await guest(`/guides/${id}`)).status, 404);
});

test('the admin journal lists people’s decisions, on the site and in Telegram, with what they were about', async (t) => {
  const { store, signIn, as } = await setup(t);
  const [, , { TelegramQueue }, { CatalogGuides }] = await modules;
  const author = as(signIn('555')), admin = as(signIn('1253427')), reader = as(signIn('777'));
  const image = await upload(author, await png(), 'image', 'a.png');
  const make = async (title) => { const id = (await author('/guides', 'POST', { title, category: 'profiles', doc: doc(image.body.id) })).body.id; await author(`/guides/${id}/submit`, 'POST', {}); return id; };
  const first = await make('Первый гайд'), second = await make('Второй гайд');
  const pending = (await admin('/admin/guides')).body.items;
  await admin(`/admin/guides/${pending.find((item) => item.guide === first).revision}`, 'POST', { action: 'approve' });
  const queue = new TelegramQueue(store, { guides: new CatalogGuides(store, { dir: join(tmpdir(), 'unused'), salt: 'test-guides' }) });
  queue.sync();
  const card = store.get("SELECT * FROM telegram_reviews WHERE kind='guide' AND state<>'finished'");
  queue.decide(card.id, 'reject', { id: 42, name: 'Модератор в Telegram' });
  assert.equal((await reader('/admin/journal')).status, 403);
  const journal = (await admin('/admin/journal')).body.items;
  assert.deepEqual(journal.slice(0, 2).map((item) => [item.label, item.via, item.kindLabel, item.title, item.actor.name]),
    [['Отклонено', 'telegram', 'Гайд', 'Второй гайд', 'Модератор в Telegram'], ['Одобрено', 'site', 'Гайд', 'Первый гайд', 'U1253427']]);
  assert.equal(journal[1].link, `guides?id=${first}`);
  assert.equal(second.length, 12);
});

test('«модификация файлов игры»: the author puts the mark, only a moderator takes it off; the page, the list and the Telegram card show it', async (t) => {
  const { store, signIn, as } = await setup(t);
  const [, , { TelegramQueue }, { CatalogGuides }] = await modules;
  const author = as(signIn('555')), stranger = as(signIn('777')), admin = as(signIn('1253427')), guest = as(null);
  const image = (await upload(author, await png(), 'image', 'a.png')).body.id;
  const saved = await author('/guides', 'POST', { title: 'Шрифт в Dota', category: 'profiles', doc: doc(image), modding: true });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.modding, true);
  const id = saved.body.id;
  // The author's «off» changes nothing.
  const again = await author('/guides', 'POST', { id, revision: saved.body.revision, title: 'Шрифт в Dota', category: 'profiles', doc: doc(image), modding: false });
  assert.equal(again.body.modding, true, 'the author cannot take the mark off');
  assert.equal((await author(`/guides/${id}/edit`)).body.modding, true);
  // The Telegram card says so.
  assert.equal((await author(`/guides/${id}/submit`, 'POST', {})).status, 200);
  const queue = new TelegramQueue(store, { guides: new CatalogGuides(store, { dir: join(tmpdir(), 'unused'), salt: 'test-guides' }) });
  queue.sync();
  const card = store.all("SELECT summary FROM telegram_reviews WHERE kind='guide'").map((row) => JSON.parse(row.summary));
  assert.equal(card.length, 1);
  assert.equal(card[0].modding, true, 'the moderators see the mark');
  // Published: readers see it on the page and in the list.
  assert.equal((await admin(`/guides/${id}/publish`, 'POST', {})).status, 200);
  assert.equal((await guest(`/guides/${id}`)).body.modding, true);
  assert.equal((await guest('/guides')).body.items.find((item) => item.id === id).modding, true);
  // Only admins reach the switch; an admin takes the mark off and puts it back.
  assert.equal((await stranger(`/admin/guides/${id}/modding`, 'POST', { modding: false })).status, 403);
  assert.equal((await author(`/admin/guides/${id}/modding`, 'POST', { modding: false })).status, 403);
  assert.equal((await admin(`/admin/guides/${id}/modding`, 'POST', { modding: 'no' })).status, 400);
  assert.deepEqual((await admin(`/admin/guides/${id}/modding`, 'POST', { modding: false })).body, { id, modding: false });
  assert.equal((await guest(`/guides/${id}`)).body.modding, false);
  assert.equal((await admin(`/admin/guides/${id}/modding`, 'POST', { modding: true })).status, 200);
  assert.equal((await admin('/admin/guides?filter=approved')).body.items.find((item) => item.guide === id).modding, true, 'the review shows it');
  // An admin editing the guide may also take it off there.
  const edit = await admin(`/guides/${id}/edit`);
  assert.equal((await admin('/guides', 'POST', { id, title: edit.body.title, category: edit.body.category, doc: edit.body.doc, modding: false })).body.modding, false);
});
