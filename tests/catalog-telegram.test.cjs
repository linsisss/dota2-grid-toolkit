const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const modules = Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-telegram.mjs'), import('../server/catalog-telegram-store.mjs')]);
const config = { chatId: '-1004309207941', topicId: 6, origin: 'https://gridstudio.me', local: false };
const input = (x = 10) => ({ title: '<Сетка>', author: 'Игрок & автор', tags: ['Аниме'], grid: { version: 3, configs: [{ config_name: 'Моя', categories: [
  { category_name: '.·:; +*#%@ ←↑→↓ あいう ㄱㄲ 한글 БРАЙЛЬ ⣿', x_position: x, y_position: 20, width: 30, height: 30, hero_ids: [] },
  { category_name: 'MY HEROES', x_position: 200, y_position: 150, width: 500, height: 240, hero_ids: [127, 1, 5, 135] }
] }] } });
const identity = { browser: 'test-browser', ip: 'test-network' };
async function fixture(t, overrides = {}) {
  const [{ CatalogStore }, { CatalogTelegram }] = await modules;
  const store = new CatalogStore(':memory:', 'test-only-salt'); t.after(() => store.close());
  const sent = [], edits = [], answers = [];
  let message = 100;
  const api = {
    getMe: async () => ({ id: 42, username: 'test_bot' }),
    getChat: async () => ({ is_forum: true, title: 'Test' }),
    getChatMember: async ({ user_id }) => ({ status: user_id === 42 ? 'administrator' : 'member' }),
    getWebhookInfo: async () => ({ url: '' }),
    sendPhoto: async params => { sent.push(params); return { message_id: message++, message_thread_id: 6, chat: { id: -1004309207941 } }; },
    editMessageCaption: async params => { edits.push(params); return true; },
    answerCallbackQuery: async params => { answers.push(params); return true; }, ...overrides
  };
  const worker = new CatalogTelegram(store, config, api, { render: async () => Buffer.from('test-png'), log: () => {} });
  await worker.check();
  const saved = store.save(input(), identity);
  return { store, worker, saved, sent, edits, answers, api };
}
// 'reject' is a decision without a reason (gs:rj:n); 'menu' is the «Отклонить» button that opens the reasons.
const callback = (job, action, user = 7) => ({ id: 'callback-id', data: `gs:${{ reject: 'rj:n', menu: 'reject' }[action] || action}:${job.id}`, from: { id: user, first_name: `Игрок ${user}`, is_bot: false },
  message: { message_id: job.message, message_thread_id: 6, chat: { id: -1004309207941 }, from: { id: 42 } } });
const jobOf = f => f.store.get('SELECT * FROM telegram_reviews ORDER BY rowid DESC LIMIT 1');

test('Telegram cards go to topic 6 with server PNG, escaped text and bounded callback data, no owner token', async t => {
  const f = await fixture(t); await f.worker.deliverOne(); await f.worker.deliverOne();
  assert.equal(f.sent.length, 1); const payload = f.sent[0];
  assert.equal(payload.chat_id, config.chatId); assert.equal(payload.message_thread_id, 6);
  assert.ok(payload.photo); assert.match(payload.caption, /&lt;Сетка&gt;/);
  assert.equal(payload.parse_mode, 'HTML');
  assert.match(payload.caption, /<tg-emoji emoji-id="5879813604068298387">❗️<\/tg-emoji> <b>Новая сетка на проверку:<\/b> "&lt;Сетка&gt;"/);
  assert.match(payload.caption, /<tg-emoji emoji-id="5920344347152224466">👤<\/tg-emoji> Автор: Игрок &amp; автор/);
  assert.match(payload.caption, /<tg-emoji emoji-id="5960551395730919906">📝<\/tg-emoji> Количество категорий: 2/);
  assert.match(payload.caption, /<tg-emoji emoji-id="5886436057091673541">💬<\/tg-emoji> Теги: Аниме/);
  assert.match(payload.caption, /\n\n<tg-emoji emoji-id="5776213190387961618">🕓<\/tg-emoji> Ожидает принятия решения$/);
  assert.doesNotMatch(payload.caption, /Символы:|Герои:|версия |Любой участник/);
  assert.deepEqual(payload.reply_markup.inline_keyboard[0].map(({text,icon_custom_emoji_id})=>({text,icon_custom_emoji_id})),[
    {text:'Одобрить',icon_custom_emoji_id:'5985596818912712352'},
    {text:'Отклонить',icon_custom_emoji_id:'5985346521103604145'}
  ]);
  assert.equal(JSON.stringify(payload).includes(f.saved.managementToken), false);
  for (const button of payload.reply_markup.inline_keyboard[0]) assert.ok(Buffer.byteLength(button.callback_data) <= 64);
});
test('any ordinary current chat member can approve; second click cannot reverse the first decision', async t => {
  const f = await fixture(t); await f.worker.deliverOne(); const job = jobOf(f);
  await f.worker.callback(callback(job, 'approve'));
  assert.equal(f.store.list().total, 1); assert.equal(jobOf(f).outcome, 'approve');
  await f.worker.callback(callback(job, 'reject', 8));
  assert.equal(jobOf(f).outcome, 'approve'); assert.match(f.answers.at(-1).text, /Игрок 7/);
  assert.equal(f.edits[0].reply_markup.inline_keyboard[0][0].text, 'Открыть в мастерской');
  assert.match(f.edits[0].caption, /<tg-emoji emoji-id="5985596818912712352">✅<\/tg-emoji> Одобрено · Игрок 7 \(ID 7\)$/);
  assert.doesNotMatch(f.edits[0].caption, /Ожидает принятия решения|5776213190387961618/);
  assert.match(f.store.all('SELECT action FROM audit').at(-1).action, /telegram:approve.*user:7/);
});
test('reject is available to an ordinary participant and appears in author status', async t => {
  const f = await fixture(t); await f.worker.deliverOne(); await f.worker.callback(callback(jobOf(f), 'reject'));
  assert.equal(f.store.list().total, 0); assert.equal(f.store.ownerView(f.saved.id, f.saved.managementToken).status, 'rejected');
  assert.match(f.store.ownerView(f.saved.id, f.saved.managementToken).reason, /Telegram/);
  assert.equal(f.edits[0].reply_markup.inline_keyboard.length, 0);
  assert.match(f.edits[0].caption, /<tg-emoji emoji-id="5985346521103604145">❌<\/tg-emoji> Отклонено · Игрок 7 \(ID 7\)$/);
  assert.doesNotMatch(f.edits[0].caption, /Ожидает принятия решения|5776213190387961618/);
});

test('caption escapes submitted markup and reviewer name, fits Telegram limits, and marks stale cards without a fake reviewer', async()=>{
  const [, {reviewCaption,reviewKeyboard}]=await modules;
  const summary={title:'<b>'.repeat(26),author:'&'.repeat(48),tags:['С упором на героя','Dead inside','Аниме'],stats:{categories:2001},reason:'<a href="bad">&'.repeat(30)};
  const job={kind:'report',id:'example',revision:1,summary:JSON.stringify(summary),outcome:'reject',actor:JSON.stringify({name:'<b>&'.repeat(25),id:1234567890123})};
  const text=reviewCaption(job,{...config,local:true});
  assert.match(text,/Локальная проверка/);assert.match(text,/Более 2 000 категорий/);assert.match(text,/&lt;a href=&quot;bad&quot;&gt;&amp;/);
  assert.match(text,/&lt;b&gt;&amp;/);assert.doesNotMatch(text,/<a href=/);
  const visible=text.replace(/<[^>]+>/g,'').replace(/&(?:amp|lt|gt|quot);/g,'x');
  assert.ok(visible.length<=1024,`Caption length: ${visible.length}`);
  const outdated=reviewCaption({...job,outcome:'outdated',actor:''},config);
  assert.match(outdated,/Заявка уже проверена, изменена или удалена/);assert.doesNotMatch(outdated,/Ожидает принятия решения|\(ID /);
  assert.deepEqual(reviewKeyboard({...job,outcome:'outdated'},config).inline_keyboard,[]);
  const pending=reviewCaption({...job,outcome:'',actor:'',summary:JSON.stringify({...summary,author:'',tags:[],reason:''})},config);
  assert.match(pending,/Автор: не указан/);assert.match(pending,/Теги: не указаны/);
});
test('left, kicked and nonmember restricted users cannot moderate, restricted members can', async t => {
  const [, { isChatMember }] = await modules;
  assert.equal(isChatMember({ status: 'restricted', is_member: true }), true);
  for (const status of ['left', 'kicked', 'restricted']) {
    const f = await fixture(t); await f.worker.deliverOne();
    f.api.getChatMember = async () => ({ status, is_member: false });
    await f.worker.callback(callback(jobOf(f), 'approve'));
    assert.equal(f.store.list().total, 0); assert.match(f.answers.at(-1).text, /только участники/);
  }
});
test('foreign chat/topic/message/bot and unavailable membership checks fail closed', async t => {
  const f = await fixture(t); await f.worker.deliverOne(); const job = jobOf(f);
  for (const mutate of [q => q.message.chat.id = -1001111, q => q.message.message_thread_id = 2, q => q.message.message_id++, q => q.message.from.id++, q => q.from.is_bot = true]) {
    const q = callback(job, 'approve'); mutate(q); await f.worker.callback(q); assert.equal(f.store.list().total, 0);
  }
  f.api.getChatMember = async () => { throw new Error('offline'); };
  await f.worker.callback(callback(job, 'approve')); assert.equal(f.store.list().total, 0);
});
test('two concurrent Telegram decisions publish or reject once even across awaited membership calls', async t => {
  const f = await fixture(t); await f.worker.deliverOne(); const job = jobOf(f);
  await Promise.all([f.worker.callback(callback(job, 'approve')), f.worker.callback(callback(job, 'reject', 8))]);
  assert.equal(f.store.list().total, 1);
  assert.equal(f.store.all("SELECT * FROM audit WHERE action LIKE 'telegram:%'").length, 1);
});
test('outdated and deleted cards never publish the replacement; updates have a separate card', async t => {
  const f = await fixture(t); await f.worker.deliverOne(); const first = jobOf(f);
  const updated = f.store.save(input(40), identity, f.saved.id, f.saved.managementToken, f.saved.revision);
  await f.worker.callback(callback(first, 'approve')); assert.equal(f.store.list().total, 0);
  await f.worker.deliverOne(); assert.equal(f.sent.length, 2); assert.equal(jobOf(f).revision, updated.revision);
  const second = jobOf(f); f.store.remove(f.saved.id, f.saved.managementToken);
  await f.worker.callback(callback(second, 'approve')); assert.equal(f.store.list().total, 0);
});
test('lost send response is not blindly retried; actual callback recovers its receipt', async t => {
  const f = await fixture(t, { sendPhoto: async () => { throw new Error('timeout'); } });
  await f.worker.deliverOne(); assert.equal(jobOf(f).state, 'uncertain');
  assert.equal(await f.worker.deliverOne(), false);
  const job = { ...jobOf(f), message: 222 };
  await f.worker.callback(callback(job, 'approve')); assert.equal(f.store.list().total, 1); assert.equal(jobOf(f).message, 222);
});
test('Telegram 429 backs off, permanent errors stay visible and previews retry without sending', async t => {
  const f = await fixture(t, { sendPhoto: async () => { const { ApiError } = await import('puregram'); throw new ApiError({ error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 45 } }); } });
  await f.worker.deliverOne(); assert.equal(jobOf(f).state, 'queued'); assert.ok(jobOf(f).next_at > Date.now() + 40_000);
  f.worker.queue.retry(jobOf(f), 'queued', 0); f.api.sendPhoto = async () => { throw { error_code: 400 }; };
  await f.worker.deliverOne(); assert.equal(jobOf(f).state, 'failed');
  f.worker.queue.retry(jobOf(f), 'queued', 0); f.worker.render = async () => { throw Error('font'); };
  await f.worker.deliverOne(); assert.equal(jobOf(f).state, 'queued');
});
test('pending notification, upload uncertainty and single-worker lease survive restart', async t => {
  const [{ CatalogStore }, , { TelegramQueue }] = await modules;
  const dir = mkdtempSync(join(tmpdir(), 'gridstudio-telegram-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'db.sqlite'); let store = new CatalogStore(path, 'salt'), q = new TelegramQueue(store);
  store.save(input(), identity); q.sync(); const job = q.claim(); q.sending(job, config);
  assert.equal(q.lease('a'), true); assert.equal(q.lease('b'), false); q.release('a'); store.close();
  store = new CatalogStore(path, 'salt'); q = new TelegramQueue(store);
  try { q.recover(); q.sync(); assert.equal(q.get(job.id).state, 'uncertain'); assert.equal(q.lease('b'), true); assert.equal(q.claim(), undefined); }
  finally { store.close(); }
});
test('report card can dismiss a complaint or hide its exact public revision without approving a draft', async t => {
  const f = await fixture(t); await f.worker.deliverOne(); await f.worker.callback(callback(jobOf(f), 'approve'));
  f.store.report(f.saved.id, { browser: 'reporter', ip: 'other-ip' }, 'Реклама'); await f.worker.deliverOne();
  assert.equal(jobOf(f).kind, 'report'); await f.worker.callback(callback(jobOf(f), 'keep')); assert.equal(f.store.list().total, 1);
  f.store.report(f.saved.id, { browser: 'reporter', ip: 'other-ip' }, 'Новая жалоба'); await f.worker.deliverOne(); const report = jobOf(f);
  f.store.save(input(60), identity, f.saved.id, f.saved.managementToken, f.saved.revision);
  await f.worker.callback(callback(report, 'hide')); assert.equal(f.store.list().total, 0);
  assert.equal(f.store.ownerView(f.saved.id, f.saved.managementToken).blocked, true);
});
test('the admin panel opens only for configured Telegram administrators; there is no password login', async t => {
  const [{ CatalogStore }] = await modules; const { createCatalogAPI, catalogConfig } = await import('../server/catalog-api.mjs');
  const store = new CatalogStore(':memory:', 'salt'), settings = { ...config, salt: 'salt', development: true, admins: new Set(['1253427', '669713603']) };
  const { server, accounts } = createCatalogAPI(settings, { store }); await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise(r => server.close(r)); store.close(); });
  const signIn = id => { const login = accounts.begin('ip', 'browser'); accounts.candidate(login.id, { id: Number(id), first_name: 'Admin', username: 'admin', is_bot: false });
    accounts.approve(login.id, Number(id), true); return accounts.finish(login.id, login.verifier, id).session; };
  const call = async (path, session, method = 'GET', body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/catalog${path}`, { method,
      headers: { Origin: config.origin, 'Content-Type': 'application/json', ...(session ? { Cookie: `gs_account=${session}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json() };
  };
  assert.equal((await call('/admin/login', null, 'POST', { password: 'long-existing-secret-value' })).status, 401);
  assert.equal((await call('/admin/works')).status, 401);
  const stranger = signIn('42424242'), admin = signIn('669713603');
  assert.equal((await call('/admin/works', stranger)).status, 403);
  assert.equal((await call('/admin/settings', stranger, 'PATCH', { paused: true })).status, 403);
  const listed = await call('/admin/works?filter=pending', admin);
  assert.equal(listed.status, 200); assert.deepEqual(Object.keys(listed.body.counts), ['pending', 'reports', 'published', 'blocked']);
  assert.equal((await call('/admin/settings', admin, 'PATCH', { paused: true })).body.paused, true);
  assert.equal(JSON.parse(store.get("SELECT actor FROM audit WHERE action='pause'").actor).id, '669713603');
  const env = extra => ({ CATALOG_DEV: '1', CATALOG_SECRET: 'x'.repeat(40), ...extra });
  assert.deepEqual([...catalogConfig(env({ CATALOG_ADMIN_TELEGRAM_IDS: '1253427, 669713603' })).admins], ['1253427', '669713603']);
  assert.equal(catalogConfig(env({})).admins.size, 0);
  assert.throws(() => catalogConfig(env({ CATALOG_ADMIN_TELEGRAM_IDS: '1253427,@admin' })), /числовые/);
});
test('a decision taken on the site shows on the Telegram card with its admin, and a block can be undone', async t => {
  const f = await fixture(t); await f.worker.deliverOne(); const job = jobOf(f);
  const actor = JSON.stringify({ id: '1253427', name: '@admin · сайт' });
  f.store.moderate(f.saved.id, { action: 'approve', revision: f.saved.revision }, { actor });
  f.worker.queue.sync(); await f.worker.refreshCards();
  assert.equal(f.store.get('SELECT outcome FROM telegram_reviews WHERE id=?', job.id).outcome, 'approve');
  assert.match(f.edits.at(-1).caption, /Одобрено · @admin · сайт \(ID 1253427\)/);
  f.store.moderate(f.saved.id, { action: 'block', revision: f.saved.revision, reason: 'spam' }, { actor });
  assert.equal(f.store.moderation('blocked').counts.blocked, 1);
  f.store.moderate(f.saved.id, { action: 'unblock', revision: f.saved.revision }, { actor });
  const listed = f.store.moderation('published');
  assert.deepEqual([listed.counts.blocked, listed.counts.published], [0, 1]);
  assert.equal(f.store.get('SELECT count(*) n FROM blocks').n, 0);
  assert.throws(() => f.store.moderate(f.saved.id, { action: 'unblock', revision: f.saved.revision }), /не заблокирована/);
  assert.ok(f.store.all("SELECT actor FROM audit WHERE action IN ('approve','block','unblock')").every(row => JSON.parse(row.actor).id === '1253427'));
});
test('server preview is a PNG in Dota dimensions, handles local portrait formats and is deterministic', async () => {
  const { renderCatalogPreview } = await import('../server/catalog-preview.mjs');
  const a = await renderCatalogPreview(input().grid), b = await renderCatalogPreview(input().grid);
  assert.equal(a.subarray(1, 4).toString(), 'PNG'); assert.equal(a.readUInt32BE(16), 1193); assert.equal(a.readUInt32BE(20), 593);
  assert.deepEqual(a, b); assert.ok(a.length > 10000);
});

test('followers get one message for an author\'s new work, none for updates or guest works, and can unsubscribe from it', async t => {
  const direct = [], markups = [];
  let fail = null;
  const f = await fixture(t, {
    sendMessage: async params => { if (fail) throw fail; direct.push(params); return { message_id: 900 + direct.length }; },
    editMessageReplyMarkup: async params => { markups.push(params); return true; }
  });
  f.store.run("INSERT INTO accounts VALUES('501','Автор','author_nick',0),('502','Фанат','',0),('503','Второй','',0)");
  const approve = saved => f.store.moderate(saved.id, { action: 'approve', revision: saved.revision });
  const first = f.store.save(input(40), identity, null, null, null, '501'); approve(first);
  approve(f.saved);
  assert.throws(() => f.store.subscribe('502', f.saved.id, true), /не входил на сайт/);
  assert.throws(() => f.store.subscribe('501', first.id, true), /твоя/);
  assert.deepEqual(f.store.subscribe('502', first.id, true), { followable: true, subscribed: true });
  assert.deepEqual(f.store.subscribe('502', first.id, true), { followable: true, subscribed: true });
  assert.equal(f.store.publicItem(first.id, '502').subscribed, true);
  assert.deepEqual([f.store.publicItem(first.id, '501').followable, f.store.publicItem(f.saved.id).followable], [false, false]);
  // An update of an already public work is not "new"; a new work is, exactly once.
  const update = f.store.save(input(41), identity, first.id, '', first.revision, '501'); approve(update);
  const second = f.store.save(input(42), identity, null, null, null, '501'); approve(second);
  assert.equal(f.store.get('SELECT count(*) n FROM notifications').n, 1);
  await f.worker.deliverNotifications(); await f.worker.deliverNotifications();
  assert.equal(direct.length, 1);
  assert.equal(direct[0].chat_id, '502');
  // The author's profile nickname, not their signature or Telegram name.
  assert.match(direct[0].text, new RegExp(`^Новая сетка героев от <b>${f.store.profiles.creator('501').name}</b>: `));
  assert.match(direct[0].text, /<\/b>: <a href="https:\/\/gridstudio\.me\/workshop\?id=[0-9a-f-]{36}">«&lt;Сетка&gt;»<\/a>$/);
  assert.equal(direct[0].reply_markup.inline_keyboard[1][0].callback_data, `sub:off:p:${f.store.profiles.creator('501').key}`);
  // Whole values and standalone numbers only: the work UUID in the link may contain «501».
  const values = []; JSON.stringify(direct[0], (key, value) => { values.push(value); return value; });
  assert.ok(!values.includes('501') && !values.includes(501) && !/(^|[^0-9a-f])501([^0-9a-f]|$)/i.test(direct[0].text), 'the author account id stays private');
  // The button in the private chat unsubscribes; foreign chats cannot.
  const button = (user, chat = user) => ({ id: 'q', data: `sub:off:p:${f.store.profiles.creator('501').key}`, from: { id: user, is_bot: false },
    message: { message_id: 901, chat: { id: chat, type: 'private' }, from: { id: 42 }, reply_markup: direct[0].reply_markup } });
  await f.worker.callback(button(502, 503));
  assert.equal(f.store.publicItem(first.id, '502').subscribed, true);
  await f.worker.callback(button(502));
  assert.equal(f.store.publicItem(first.id, '502').subscribed, false);
  assert.deepEqual(markups.at(-1).reply_markup.inline_keyboard, [direct[0].reply_markup.inline_keyboard[0]]);
  // A blocked bot is dropped; rate limits wait without losing the message.
  f.store.subscribe('502', first.id, true); f.store.subscribe('503', first.id, true);
  const third = f.store.save(input(43), identity, null, null, null, '501'); approve(third);
  fail = Object.assign(new Error('Too Many Requests'), { error_code: 429, parameters: { retry_after: 7 } });
  await f.worker.deliverNotifications();
  assert.equal(f.store.get("SELECT count(*) n FROM notifications WHERE state='queued' AND next_at>0").n, 1);
  f.store.run("UPDATE notifications SET next_at=0");
  fail = Object.assign(new Error('Forbidden: bot was blocked by the user'), { error_code: 403 });
  await f.worker.deliverNotifications();
  assert.equal(f.store.get("SELECT count(*) n FROM notifications WHERE state='failed'").n, 2);
});
test('a Telegram-linked author hears once per approved version, from the site or the topic; guests and stale versions get nothing', async t => {
  const direct = [];
  let fail = null;
  const f = await fixture(t, { sendMessage: async params => { if (fail) throw fail; direct.push(params); return { message_id: 900 + direct.length }; } });
  f.store.run("INSERT INTO accounts VALUES('501','Автор','author_nick',0)");
  const first = f.store.save(input(40), identity, null, null, null, '501');
  f.store.moderate(first.id, { action: 'approve', revision: first.revision }, { actor: JSON.stringify({ id: '1253427', name: '@admin · сайт' }) });
  f.store.moderate(f.saved.id, { action: 'approve', revision: f.saved.revision });
  await f.worker.deliverAuthorNotices(); await f.worker.deliverAuthorNotices();
  assert.equal(direct.length, 1, 'the guest work sends nothing, a second round repeats nothing');
  assert.equal(direct[0].chat_id, '501');
  const url = `https://gridstudio.me/workshop?id=${first.id}`;
  assert.equal(direct[0].text, `<tg-emoji emoji-id="5985596818912712352">✅</tg-emoji> Твоя сетка <a href="${url}">«&lt;Сетка&gt;»</a> одобрена и опубликована в мастерской.`);
  assert.deepEqual(direct[0].reply_markup.inline_keyboard, [[{ text: 'Открыть в мастерской', url }]]);
  // An update approved with the card in the moderation topic.
  const update = f.store.save(input(41), identity, first.id, '', first.revision, '501');
  await f.worker.deliverOne(); await f.worker.callback(callback(jobOf(f), 'approve'));
  await f.worker.deliverAuthorNotices();
  assert.equal(direct.length, 2);
  assert.match(direct[1].text, /Изменения в сетке <a href="[^"]+">«&lt;Сетка&gt;»<\/a> одобрены — в мастерской уже новая версия\.$/);
  // Two quick approvals send only the version that is live; a hidden work sends nothing.
  for (const x of [42, 43]) { const next = f.store.save(input(x), identity, first.id, '', f.store.publicItem(first.id).revision, '501'); f.store.moderate(first.id, { action: 'approve', revision: next.revision }); }
  const second = f.store.save(input(44), { browser: 'other-browser', ip: 'other-network' }, null, null, null, '501'); f.store.moderate(second.id, { action: 'approve', revision: second.revision });
  f.store.moderate(second.id, { action: 'block', revision: second.revision, reason: 'Спам' });
  await f.worker.deliverAuthorNotices();
  assert.equal(direct.length, 3);
  assert.equal(f.store.get("SELECT count(*) n FROM author_notices WHERE state='dropped'").n, 2);
  assert.equal(f.store.get("SELECT count(*) n FROM notifications").n, 0, 'the author is not their own follower');
  // A player who blocked the bot is not retried.
  const third = f.store.save(input(45), identity, null, null, null, '501'); f.store.moderate(third.id, { action: 'approve', revision: third.revision });
  fail = Object.assign(new Error('Forbidden: bot was blocked by the user'), { error_code: 403 });
  await f.worker.deliverAuthorNotices(); await f.worker.deliverAuthorNotices();
  assert.equal(f.store.get("SELECT state FROM author_notices WHERE work=?", third.id).state, 'failed');
});
test('a Telegram-linked author gets the rejection reason once, from the site or the topic; guests and replaced versions get nothing', async t => {
  const direct = [];
  const f = await fixture(t, { sendMessage: async params => { direct.push(params); return { message_id: 900 + direct.length }; } });
  const { CatalogBackgrounds } = await import('../server/catalog-backgrounds.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'gs-reject-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const backgrounds = new CatalogBackgrounds(f.store, { dir }); f.worker.queue.backgrounds = backgrounds;
  f.store.run("INSERT INTO accounts VALUES('501','Автор','author_nick',0)");
  const reject = '<tg-emoji emoji-id="5985346521103604145">❌</tg-emoji>';
  const first = f.store.save(input(40), identity, null, null, null, '501');
  f.store.moderate(first.id, { action: 'reject', revision: first.revision, reason: 'В вашей сетке <мало> деталей.' });
  f.store.moderate(f.saved.id, { action: 'reject', revision: f.saved.revision, reason: 'Гостю не пишем' });
  await f.worker.deliverRejectNotices(); await f.worker.deliverRejectNotices();
  assert.equal(direct.length, 1, 'the guest work sends nothing, a second round repeats nothing');
  assert.equal(direct[0].chat_id, '501');
  assert.equal(direct[0].text, `${reject} Сетка <b>«&lt;Сетка&gt;»</b> не прошла проверку.\n\nПричина: В вашей сетке &lt;мало&gt; деталей.`);
  assert.deepEqual(direct[0].reply_markup.inline_keyboard, [[{ text: 'Мои публикации', url: 'https://gridstudio.me/workshop?mine=1' }]]);
  // Rejected with the card in the moderation topic: the topic's reason.
  const update = f.store.save(input(41), identity, first.id, '', first.revision, '501');
  await f.worker.deliverOne(); await f.worker.callback(callback(jobOf(f), 'reject'));
  await f.worker.deliverRejectNotices();
  assert.equal(direct.length, 2);
  assert.match(direct[1].text, /Причина: Отклонено участником команды в Telegram\.$/);
  // A version the author replaced before the message went out is not announced.
  const again = f.store.save(input(42), identity, first.id, '', update.revision, '501');
  f.store.moderate(first.id, { action: 'reject', revision: again.revision, reason: 'Старая причина' });
  f.store.save(input(43), identity, first.id, '', again.revision, '501');
  await f.worker.deliverRejectNotices();
  assert.equal(direct.length, 2);
  assert.equal(f.store.get("SELECT state FROM reject_notices WHERE item=?", String(again.revision)).state, 'dropped');
  // Backgrounds and arts: their own words; an art has no page to link.
  const now = f.store.now();
  const { id: background } = f.store.get(`INSERT INTO backgrounds(title,author,aspect,seconds,bytes,hash,account,browser,ip,created,updated)
    VALUES('Лес','','16:9',10,1000,'h','501','b','i',?,?) RETURNING id`, now, now);
  backgrounds.moderate(background, { action: 'reject', reason: 'Ваш фон слишком низкого качества.' });
  const art = f.worker.queue.arts.submit({ name: 'Сердце', category: 'Другое', author: '', text: '@@ @@\n@@@@@' }, identity, '501');
  f.worker.queue.arts.moderate(art.id, { action: 'reject', reason: 'Нарушение правил' });
  await f.worker.deliverRejectNotices();
  assert.equal(direct.length, 4);
  assert.equal(direct[2].text, `${reject} Фон <b>«Лес»</b> не прошёл проверку.\n\nПричина: Ваш фон слишком низкого качества.`);
  assert.deepEqual(direct[2].reply_markup.inline_keyboard, [[{ text: 'Мои публикации', url: 'https://gridstudio.me/workshop?backgrounds&mine=1' }]]);
  assert.equal(direct[3].text, `${reject} Арт <b>«Сердце»</b> не прошёл проверку.\n\nПричина: Нарушение правил`);
  assert.equal(direct[3].reply_markup, undefined);
});
test('admins correct the title, author and tags of the public version or a pending update, with the same rules as players', async t => {
  const f = await fixture(t), actor = JSON.stringify({ id: '1253427', name: '@admin · сайт' });
  f.store.moderate(f.saved.id, { action: 'approve', revision: f.saved.revision });
  const update = f.store.save({ ...input(55), title: 'Обновление автора' }, identity, f.saved.id, f.saved.managementToken, f.saved.revision);
  const meta = f.store.moderate(f.saved.id, { action: 'edit', revision: f.saved.revision, title: '  Сетка дня ', author: 'Команда', tags: ['Мемы', 'Аниме', 'Мемы'] }, { actor });
  assert.deepEqual(meta, { title: 'Сетка дня', author: 'Команда', credit: '', tags: ['Аниме', 'Мемы'] });
  const card = f.store.publicItem(f.saved.id);
  assert.deepEqual([card.title, card.author, card.tags, card.grid.configs[0].config_name], ['Сетка дня', 'Команда', ['Аниме', 'Мемы'], 'Сетка дня']);
  assert.equal(f.store.revision(update.revision).title, 'Обновление автора', 'the pending update keeps its own title');
  f.store.moderate(f.saved.id, { action: 'edit', revision: update.revision, title: 'Исправлено', author: '', tags: [] }, { actor });
  assert.equal(f.store.revision(update.revision).title, 'Исправлено');
  assert.throws(() => f.store.moderate(f.saved.id, { action: 'edit', revision: f.saved.revision, title: '', author: '', tags: [] }), /Название/);
  assert.throws(() => f.store.moderate(f.saved.id, { action: 'edit', revision: f.saved.revision, title: 'X', author: '', tags: ['Арт'] }), /тегов/);
  assert.throws(() => f.store.moderate(f.saved.id, { action: 'edit', revision: 999999, title: 'X', author: '', tags: [] }), /изменилась/);
  assert.equal(JSON.parse(f.store.get("SELECT actor FROM audit WHERE action='edit' ORDER BY id DESC").actor).id, '1253427');
});
test('«Отклонить» on the card opens the reasons; a reason reaches the author word for word, a near copy is linked', async t => {
  const markups = [];
  const f = await fixture(t, { editMessageReplyMarkup: async params => { markups.push(params); return true; } });
  await f.worker.deliverOne();
  const job = jobOf(f);
  await f.worker.callback(callback(job, 'menu'));
  const menu = markups.at(-1).reply_markup.inline_keyboard.map((row) => row.map((button) => button.text));
  assert.deepEqual(menu, [['Не хватает деталей'], ['Плохое качество'], ['Уже есть в мастерской'], ['Это арт, а не сетка'], ['Нарушение правил'], ['Без причины', 'Назад']]);
  assert.equal(f.store.get('SELECT status FROM revisions WHERE id=?', job.revision).status, 'pending', 'the menu decides nothing');
  await f.worker.callback(callback(job, 'back'));
  assert.deepEqual(markups.at(-1).reply_markup.inline_keyboard.at(-1).map((button) => button.text), ['Одобрить', 'Отклонить']);
  await f.worker.callback(callback(job, 'rj:a'));
  assert.equal(f.store.get('SELECT reason FROM revisions WHERE id=?', job.revision).reason,
    'Это арт, а не полноценная сетка. Отправьте его в «ASCII-арты» в редакторе: «Готовые арты» → «Предложить свой арт».');
  // «Уже есть в мастерской» names the near copy's original when the card has one.
  const { cardReasons } = await import('../server/catalog-telegram.mjs');
  const reasons = cardReasons({ kind: 'submission', summary: JSON.stringify({ similar: [{ work: f.saved.id, title: 'x', score: 1 }] }) }, { origin: 'https://gridstudio.me' });
  assert.equal(reasons.find((r) => r.code === 'c').text, `Такая работа уже есть в мастерской — https://gridstudio.me/workshop?id=${f.saved.id}`);
  assert.equal(cardReasons({ kind: 'background', summary: JSON.stringify({ similar: [{ id: 7 }] }) }, { origin: 'https://gridstudio.me' }).find((r) => r.code === 'c').text,
    'Такой фон уже есть в мастерской — https://gridstudio.me/background?background=7');
  // «Картинка» only for backgrounds.
  assert.equal(cardReasons({ kind: 'background', summary: '{}' }, { origin: 'https://gridstudio.me' }).find((r) => r.code === 'p').text, 'Картинки не пропускаем');
  assert.equal(cardReasons({ kind: 'submission', summary: '{}' }, { origin: 'https://gridstudio.me' }).some((r) => r.code === 'p'), false);
});
