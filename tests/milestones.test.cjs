const { test } = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-telegram.mjs'), import('../server/milestones.mjs'), import('../server/dotadle.mjs')]);

const WORK = '11111111-2222-3333-4444-555555555555';
async function fixture() {
  const [{ CatalogStore }, { CatalogTelegram }, milestones, dotadle] = await modules;
  const store = new CatalogStore(':memory:', 'test-only-salt'); let now = Date.UTC(2026, 9, 10, 6, 0);
  store.now = () => now;
  store.run("INSERT INTO works(id,owner,browser,ip,public_revision,state,created,account) VALUES(?,?,?,?,1,'active',0,'77')", WORK, 'o', 'b', 'i');
  store.run("INSERT INTO revisions(id,work,title,author,tags,grid,stats,hash,status,created) VALUES(1,?,'Моя <сетка>','','[]','{}','{}','h','approved',0)", WORK);
  const sent = [], edits = [];
  const worker = new CatalogTelegram(store, { chatId: '-1', topicId: 6, origin: 'https://gridstudio.me' }, {
    sendMessage: async (params) => { sent.push(params); return { message_id: sent.length }; },
    answerCallbackQuery: async () => true, editMessageReplyMarkup: async (params) => { edits.push(params); return true; } }, { log: () => {} });
  worker.botId = 42;
  const like = (n) => { for (let i = 0; i < n; i++) store.run('INSERT INTO likes VALUES(?,?,?)', WORK, `liker${store.get('SELECT count(*) n FROM likes').n}`, now); };
  const download = (n) => { for (let i = 0; i < n; i++) store.run("INSERT INTO downloads VALUES('work',?,?,1)", WORK, `who${store.get('SELECT count(*) n FROM downloads').n}`); };
  return { store, worker, sent, edits, like, download, milestones, dotadle, tick: (ms) => { now += ms; } };
}

test('a work passing 10 likes or 50 downloads gets one message; what was reached before the first scan does not', async () => {
  const { store, worker, sent, like, download, milestones, tick } = await fixture();
  like(12); // already over 10 before the bot ever looked
  await worker.deliverMilestones();
  assert.equal(sent.length, 0);
  like(14); download(120); tick(600_000); // 26 likes → 25; 120 downloads → 100 (not 50 as well)
  await worker.deliverMilestones();
  assert.equal(sent.length, 2);
  const texts = sent.map((message) => message.text).join('\n');
  assert.match(texts, /Твою сетку <b>«Моя &lt;сетка&gt;»<\/b> скачали уже <b>100<\/b> раз/);
  assert.match(texts, /Твоя сетка <b>«Моя &lt;сетка&gt;»<\/b> набрала <b>25<\/b> лайков/);
  assert.equal(sent[0].chat_id, '77');
  assert.equal(sent[0].reply_markup.inline_keyboard[1][0].callback_data, 'nt:off:milestones');
  tick(600_000); await worker.deliverMilestones();
  assert.equal(sent.length, 2); // nothing new
  // Switched off in the profile: muted.
  store.profiles.update('77', { notifications: { milestones: false } });
  like(30); tick(600_000); await worker.deliverMilestones();
  assert.equal(sent.length, 2);
  assert.equal(store.get("SELECT state FROM milestone_notices ORDER BY id DESC LIMIT 1").state, 'muted');
  assert.equal(milestones.milestoneLevel('downloads', 49), 0);
  assert.equal(milestones.milestoneLevel('likes', 1000), 1000);
});

test('the Dotadle reminder goes at 10:00 Moscow time to those who asked and have not played', async () => {
  const { store, worker, sent, edits, dotadle, tick } = await fixture();
  dotadle.dotadleTables(store);
  store.run('INSERT INTO dotadle_reminders VALUES(?,0)', '501'); store.run('INSERT INTO dotadle_reminders VALUES(?,0)', '502');
  await worker.deliverDotadleReminders(); // 09:00 in Moscow
  assert.equal(sent.length, 0);
  tick(3_600_000); // 10:00
  const number = dotadle.dotadleNumber(store.now());
  store.run('INSERT INTO dotadle_plays VALUES(?,?,?,1,0)', '502', number, '[1]'); // already won today
  store.run('INSERT INTO dotadle_plays VALUES(?,?,?,1,0)', '501', number - 1, '[1]'); // won yesterday: a streak of 1
  await worker.deliverDotadleReminders();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chat_id, '501');
  assert.match(sent[0].text, new RegExp(`Dotadle #${number}`));
  assert.match(sent[0].text, /серия: <b>1<\/b>/);
  await worker.deliverDotadleReminders();
  assert.equal(sent.length, 1); // once a day
  await worker.callback({ id: 'q', data: 'dl:off', from: { id: 501 }, message: { chat: { id: 501, type: 'private' }, from: { id: 42 }, message_id: 1, reply_markup: sent[0].reply_markup } });
  assert.equal(store.get('SELECT count(*) n FROM dotadle_reminders WHERE account=?', '501').n, 0);
  assert.equal(edits[0].reply_markup.inline_keyboard.length, 1);
});
