const { proof } = require('./captcha-helper.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-arts.mjs'), import('../scripts/art-document.mjs'),
  import('../server/catalog-api.mjs'), import('../server/catalog-telegram.mjs')]);
const identity = (n = 1) => ({ browser: `browser-${n}`, ip: 'shared-network' });
const art = (extra = {}) => ({ name: 'Сердечко', category: 'Другое', author: 'Игрок', text: '\n\n    @@ @@\n    @@@@@\n      @\n\n', ...extra });

test('an art is stored exactly as it will be inserted, within the library limits', async () => {
  const [, , { artSubmission, ART_LIMITS }] = await modules;
  assert.deepEqual(artSubmission(art()), { name: 'Сердечко', author: 'Игрок', category: 'Другое', text: '@@ @@\n@@@@@\n  @' });
  assert.throws(() => artSubmission(art({ category: 'Мемы' })), /категорию/);
  assert.throws(() => artSubmission(art({ name: ' ' })), /Название/);
  assert.throws(() => artSubmission(art({ text: '\n   \n' })), /нет символов/);
  assert.throws(() => artSubmission(art({ text: '⣿⣿\n⣿' })), /Dota не показывает: брайль/);
  assert.throws(() => artSubmission(art({ text: 'a\u0007b' })), /служебные/);
  assert.throws(() => artSubmission(art({ text: Array(ART_LIMITS.rows + 1).fill('#').join('\n') })), /строк/);
  assert.throws(() => artSubmission(art({ text: '#'.repeat(ART_LIMITS.width + 1) })), /длинная строка/);
  assert.equal(artSubmission(art({ text: Array(ART_LIMITS.rows).fill('#'.repeat(ART_LIMITS.width)).join('\n').slice(0, ART_LIMITS.chars) })).text.length, ART_LIMITS.chars);
});

test('arts wait for moderation, reject duplicates and built-in arts, and reach the library only when approved', async t => {
  const [{ CatalogStore }, { CatalogArts }] = await modules;
  const store = new CatalogStore(':memory:', 'test-arts-salt'); t.after(() => store.close());
  const arts = new CatalogArts(store), actor = JSON.stringify({ id: '1253427', name: '@admin · сайт' });
  const first = arts.submit(art(), identity(), '501');
  assert.deepEqual(first, { id: 1, status: 'pending' });
  assert.equal(arts.library().load().length, 0);
  assert.throws(() => arts.submit(art({ name: 'Копия' }), identity(2)), /ждёт проверки/);
  const builtin = require('../data/ascii-arts.json').arts[0];
  assert.throws(() => arts.submit(art({ text: builtin.text }), identity(2)), /уже есть/);
  const before = arts.library().version;
  assert.throws(() => arts.moderate(first.id, { action: 'reject' }), /причину/);
  arts.moderate(first.id, { action: 'approve' }, { actor });
  assert.notEqual(arts.library().version, before);
  assert.deepEqual(arts.library().load().map(row => ({ ...row })), [{ id: 1, name: 'Сердечко', category: 'Другое', author: 'Игрок', text: '@@ @@\n@@@@@\n  @' }]);
  assert.equal(store.get('SELECT account FROM art_notices WHERE art=1').account, '501');
  assert.throws(() => arts.moderate(first.id, { action: 'approve' }), /уже проверен/);
  assert.throws(() => arts.submit(art({ name: 'Копия' }), identity(2)), /уже есть/);
  assert.deepEqual(arts.moderate(first.id, { action: 'edit', name: ' Сердце ', category: 'Существа', author: '' }, { actor }), { name: 'Сердце', category: 'Существа', author: '' });
  arts.moderate(first.id, { action: 'hide', reason: 'Повтор' }, { actor });
  assert.equal(arts.library().load().length, 0);
  assert.deepEqual([arts.moderation('hidden').total, arts.moderation('pending').counts], [1, { pending: 0, approved: 0, hidden: 1 }]);
  // The admin search finds a name or an author, in any case, and keeps the tab counts whole.
  assert.deepEqual([arts.moderation('hidden', 0, 'сердце').items.map(row => row.name), arts.moderation('hidden', 0, 'нет такого').total, arts.moderation('hidden', 0, '50%').total,
    arts.moderation('hidden', 0, 'нет такого').counts.hidden], [['Сердце'], 0, 0, 1]);
  arts.moderate(first.id, { action: 'restore' }, { actor });
  assert.equal(arts.library().load()[0].name, 'Сердце');
  assert.ok(store.all("SELECT actor FROM audit WHERE work='art:1' AND action IN ('approve','edit','hide','restore')").every(row => JSON.parse(row.actor).id === '1253427'));
  // Guests get a small daily budget; a pause stops new arts.
  for (let i = 0; i < 5; i++) arts.submit(art({ text: `${'#'.repeat(i + 2)}\n#` }), identity(3));
  assert.throws(() => arts.submit(art({ text: '@@@' }), identity(3)), error => error.extra?.code === 'art_guest_limit');
  store.setPaused(true);
  assert.throws(() => arts.submit(art({ text: '%%%' }), identity(4)), /приостановлен/);
});

test('trusted authors (CATALOG_UNLIMITED_TELEGRAM_IDS) have no account limit for arts; others keep it', async t => {
  const [{ CatalogStore }, { CatalogArts }, { ART_LIMITS }] = await modules;
  const store = new CatalogStore(':memory:', 'test-arts-trusted'); t.after(() => store.close());
  store.unlimited = new Set(['424242424']);
  const arts = new CatalogArts(store), unique = n => art({ text: `${'#'.repeat(n % 50 + 1)}\n${'@'.repeat(Math.floor(n / 50) + 1)}` });
  let n = 0;
  for (let i = 0; i <= ART_LIMITS.accountDaily; i++) arts.submit(unique(n++), { browser: `trusted-${i}`, ip: 'trusted-network' }, '424242424');
  for (let i = 0; i < ART_LIMITS.accountDaily; i++) arts.submit(unique(n++), { browser: `other-${i}`, ip: 'other-network' }, 'account-a');
  assert.throws(() => arts.submit(unique(n++), { browser: 'other-new', ip: 'other-network' }, 'account-a'), error => error.extra?.code === 'art_account_limit');
});

test('HTTP: players submit arts with a captcha, the library revalidates cheaply, only Telegram admins moderate', async t => {
  const [{ CatalogStore }, , , { createCatalogAPI }] = await modules;
  const store = new CatalogStore(':memory:', 'test-arts-http');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-arts-http', admins: new Set(['1253427']), database: ':memory:' };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const signIn = id => { const login = accounts.begin('ip', 'browser'); accounts.candidate(login.id, { id: Number(id), first_name: `U${id}`, is_bot: false });
    accounts.approve(login.id, Number(id), true); return accounts.finish(login.id, login.verifier, id).session; };
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  let cookie = '';
  async function call(path, method = 'GET', body, extra = {}) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: config.origin, Cookie: cookie, ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
    for (const set of response.headers.getSetCookie()) { const name = set.split('=')[0]; cookie = cookie.split('; ').filter(value => value && !value.startsWith(name + '=')).concat(set.split(';')[0]).join('; '); }
    return { status: response.status, body: response.status === 304 ? null : await response.json(), headers: response.headers };
  }
  const config2 = (await call('/config')).body;
  assert.ok(config2.artCategories.includes('Другое'));
  assert.equal((await call('/arts', 'POST', art({ category: 'Нет такой' }))).status, 400, 'a bad art is refused before the captcha');
  assert.equal((await call('/arts', 'POST', art())).status, 400, 'no captcha');
  const sent = await call('/arts', 'POST', { ...art(), captcha: await proof(call, 'art') });
  assert.equal(sent.status, 201);
  const empty = await call('/arts');
  assert.deepEqual(empty.body.items, []);
  assert.equal(empty.headers.get('cache-control'), 'no-cache');
  const tag = empty.headers.get('etag');
  assert.equal((await call('/arts', 'GET', null, { 'If-None-Match': tag })).status, 304);
  assert.equal((await call('/admin/arts')).status, 401);
  const fan = signIn('777'), admin = signIn('1253427');
  assert.equal((await call(`/admin/arts/${sent.body.id}`, 'POST', { action: 'approve' }, { Cookie: `${cookie}; gs_account=${fan}` })).status, 403);
  cookie += `; gs_account=${admin}`;
  const queue = await call('/admin/arts?filter=pending');
  assert.deepEqual([queue.body.total, queue.body.items[0].name, queue.body.items[0].linked], [1, 'Сердечко', false]);
  assert.equal((await call(`/admin/arts/${sent.body.id}`, 'POST', { action: 'approve' })).status, 200);
  const library = await call('/arts', 'GET', null, { 'If-None-Match': tag });
  assert.equal(library.status, 200);
  assert.equal(library.body.items[0].name, 'Сердечко');
});

test('Telegram: an art card goes to the moderation topic, a button decides it, the author hears once', async t => {
  const [{ CatalogStore }, { CatalogArts }, , , { CatalogTelegram }] = await modules;
  const store = new CatalogStore(':memory:', 'test-arts-tg'); t.after(() => store.close());
  const photos = [], edits = [], direct = [], arts = [];
  let message = 100;
  const api = {
    getMe: async () => ({ id: 42, username: 'test_bot' }), getChat: async () => ({ is_forum: true, title: 'Test' }),
    getChatMember: async ({ user_id }) => ({ status: user_id === 42 ? 'administrator' : 'member' }), getWebhookInfo: async () => ({ url: '' }),
    sendPhoto: async params => { photos.push(params); return { message_id: message++, message_thread_id: 6, chat: { id: -1004309207941 } }; },
    editMessageCaption: async params => { edits.push(params); return true; }, answerCallbackQuery: async () => true,
    sendMessage: async params => { direct.push(params); return { message_id: 900 }; }
  };
  const config = { chatId: '-1004309207941', topicId: 6, origin: 'https://gridstudio.me', local: false };
  const worker = new CatalogTelegram(store, config, api, { render: async () => Buffer.from('grid'), renderArt: async text => { arts.push(text); return Buffer.from('art'); }, log: () => {} });
  await worker.check();
  const library = new CatalogArts(store);
  store.run("INSERT INTO accounts VALUES('501','Автор','author_nick',0)");
  const first = library.submit(art({ name: '<Сердце>' }), identity(), '501');
  const second = library.submit(art({ name: 'Второй', text: '###\n# #' }), identity(2));
  await worker.deliverOne(); await worker.deliverOne();
  assert.equal(photos.length, 2);
  assert.deepEqual(arts, ['@@ @@\n@@@@@\n  @', '###\n# #']);
  assert.match(photos[0].caption, /Новый арт на проверку:<\/b> "&lt;Сердце&gt;"/);
  assert.match(photos[0].caption, /Строк: 3, ширина: 5 символов/);
  assert.match(photos[0].caption, /Категория: Другое\n\n.*Ожидает принятия решения$/);
  const job = store.get("SELECT * FROM telegram_reviews WHERE kind='art' AND revision=?", first.id);
  await worker.callback({ id: 'q', data: `gs:approve:${job.id}`, from: { id: 7, first_name: 'Игрок', is_bot: false },
    message: { message_id: job.message, message_thread_id: 6, chat: { id: -1004309207941 }, from: { id: 42 } } });
  assert.equal(library.get(first.id).status, 'approved');
  assert.match(edits.at(-1).caption, /Одобрено · Игрок \(ID 7\)$/);
  assert.deepEqual(edits.at(-1).reply_markup.inline_keyboard, [], 'an art has no public page to link');
  // A decision on the site shows on the card with the admin's name.
  library.moderate(second.id, { action: 'reject', reason: 'Спам' }, { actor: JSON.stringify({ id: '1253427', name: '@admin · сайт' }) });
  worker.queue.sync(); await worker.refreshCards();
  assert.match(edits.at(-1).caption, /Отклонено · @admin · сайт \(ID 1253427\)$/);
  await worker.deliverArtNotices(); await worker.deliverArtNotices();
  assert.equal(direct.length, 1);
  assert.equal(direct[0].chat_id, '501');
  assert.equal(direct[0].text, '<tg-emoji emoji-id="5985596818912712352">✅</tg-emoji> Твой арт <b>«&lt;Сердце&gt;»</b> одобрен и появился в «Готовых артах» редактора.');
  assert.deepEqual(direct[0].reply_markup.inline_keyboard, [[{ text: 'Открыть редактор', url: 'https://gridstudio.me/editor' }]]);
});
