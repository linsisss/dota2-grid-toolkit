const test = require('node:test');
const assert = require('node:assert/strict');

// The bot's messages about comments (server/comment-notices.mjs, catalog-telegram.mjs deliverCommentNotices)
// and the switches for every kind of the bot's messages (scripts/profile-notifications.mjs, server/profiles.mjs).
const modules = Promise.all([import('../server/catalog-store.mjs'), import('../server/item-comments.mjs'), import('../server/catalog-telegram.mjs'), import('../scripts/profile-notifications.mjs'), import('../server/accounts.mjs')]);
const grid = { version: 3, configs: [{ config_name: 'Test', categories: [{ category_name: '@', x_position: 10, y_position: 30, width: 30, height: 30, hero_ids: [] }] }] };

test('comments under a grid: the author hears of comments, a commenter of replies, each can switch them off', async (t) => {
  const [{ CatalogStore }, { ItemComments }, { CatalogTelegram }, { NOTIFICATION_IDS }, { Accounts }] = await modules;
  const store = new CatalogStore(':memory:', 'test-comment-notices'); t.after(() => store.close());
  new Accounts(store);
  const comments = new ItemComments(store);
  const work = store.save({ title: 'Сетка <1>', author: '', tags: ['Аниме'], grid }, { browser: 'b', ip: 'i' }, null, null, null, '1101');
  store.moderate(work.id, { action: 'approve', revision: work.revision });

  const first = comments.add('work', work.id, '1102', { body: 'Классная <сетка>!' });
  const answer = comments.add('work', work.id, '1101', { body: 'Спасибо', reply: first.id });
  comments.add('work', work.id, '1101', { body: 'Сам себе' });
  const back = comments.add('work', work.id, '1102', { body: 'А как поставить?', reply: answer.id });
  assert.deepEqual([first.byAuthor, answer.byAuthor], [false, true], 'the crown is the author’s');
  assert.deepEqual(store.all('SELECT account, reason FROM comment_notices ORDER BY id').map((row) => [row.account, row.reason]),
    [['1101', 'comment'], ['1102', 'reply'], ['1101', 'reply']], 'nothing about one’s own words; a reply to the author is a reply');

  // Every kind is on until switched off; unknown kinds and non-booleans are refused.
  assert.deepEqual(store.profiles.notifications('1101'), Object.fromEntries(NOTIFICATION_IDS.map((id) => [id, true])));
  store.profiles.update('1102', { notifications: { replies: false } });
  assert.equal(store.profiles.own('1102').notifications.replies, false);
  assert.equal(store.profiles.own('1102').notifications.comments, true);
  assert.throws(() => store.profiles.update('1102', { notifications: { spam: false } }), /уведомлений/);
  assert.throws(() => store.profiles.update('1102', { notifications: { review: 'no' } }), /уведомлений/);

  const sent = [], answers = [], markups = [];
  const api = { sendMessage: async (params) => { sent.push(params); return { message_id: 1 }; }, answerCallbackQuery: async (params) => { answers.push(params); return true; },
    editMessageReplyMarkup: async (params) => { markups.push(params); return true; } };
  const worker = new CatalogTelegram(store, { chatId: '-1004309207941', topicId: 6, origin: 'https://gridstudio.me', local: false }, api, { log: () => {} });
  worker.botId = 42;
  // A comment deleted before the message goes is not told about.
  comments.remove(back.id, '1102');
  await worker.deliverCommentNotices();
  assert.equal(sent.length, 1, 'the reply to 1102 is switched off, the reply to 1101 was deleted');
  assert.equal(sent[0].chat_id, '1101');
  assert.match(sent[0].text, /Новый комментарий к твоей сетке «Сетка &lt;1&gt;» от <b>[^<]+<\/b>:\n<blockquote>Классная &lt;сетка&gt;!<\/blockquote>/);
  assert.equal(sent[0].reply_markup.inline_keyboard[0][0].url, `https://gridstudio.me/workshop?id=${work.id}#comment-${first.id}`);
  assert.equal(sent[0].reply_markup.inline_keyboard[1][0].callback_data, 'nt:off:comments');
  assert.deepEqual(store.all('SELECT state FROM comment_notices ORDER BY id').map((row) => row.state), ['sent', 'muted', 'dropped']);

  // «Не присылать такие» switches that kind off, only in the private chat with the bot.
  const message = { chat: { id: 1101, type: 'private' }, from: { id: 42 }, message_id: 5, reply_markup: sent[0].reply_markup };
  await worker.callback({ id: 'c1', data: 'nt:off:comments', from: { id: 1101 }, message });
  assert.equal(store.profiles.wants('1101', 'comments'), false);
  assert.match(answers.at(-1).text, /Больше не пришлю: «Комментарии к моим работам»/);
  assert.deepEqual(markups.at(-1).reply_markup.inline_keyboard, [sent[0].reply_markup.inline_keyboard[0]], 'the button goes, the link stays');
  await worker.callback({ id: 'c2', data: 'nt:off:badges', from: { id: 1101 }, message: { ...message, chat: { id: -5, type: 'group' } } });
  assert.equal(store.profiles.wants('1101', 'badges'), true);

  // The other messages obey the switches too.
  comments.add('work', work.id, '1102', { body: 'Ещё один' });
  await worker.deliverCommentNotices();
  assert.equal(sent.length, 1, 'comments are off for 1101 now');
  store.profiles.update('1101', { notifications: { badges: false } });
  store.profiles.setBadge(store.profiles.ensure('1101').key, 'bughunter', true);
  await worker.deliverBadgeNotices();
  assert.equal(sent.length, 1);
  assert.equal(store.get('SELECT state FROM badge_notices WHERE account=?', '1101').state, 'muted');
});
