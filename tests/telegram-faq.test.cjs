const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const origin = 'https://gridstudio.me';
const json = (value) => JSON.parse(JSON.stringify(value));

test('quick answers: every question is found by its words, an empty query lists them all', async () => {
  const { FAQ, faqMatches } = await import('../server/telegram-faq.mjs');
  assert.equal(faqMatches('').length, FAQ.length);
  assert.equal(faqMatches('Подскажите а можно несколько сеток в один файл сбросить чтобы в игре отображались 4-5')[0].id, 'grids-in-file');
  assert.equal(faqMatches('не работает!!!')[0].id, 'not-working');
  assert.equal(faqMatches('Я все сделал правильно, но фона нет')[0].id, 'no-background');
  assert.equal(faqMatches('ЁЛКИ, фОн НЕ появился')[0].id, 'no-background');
  assert.equal(faqMatches('что-то совсем другое').length, FAQ.length, 'unmatched words still list every answer');
  for (const entry of FAQ) {
    assert.ok(Buffer.byteLength(entry.id) <= 64 && entry.title && entry.description, entry.id);
    assert.ok(fs.existsSync(path.join(root, entry.thumbnail)), entry.thumbnail);
    if (entry.image) assert.ok(fs.existsSync(path.join(root, entry.image.file)), entry.image.file);
    assert.doesNotMatch(entry.html(origin, false), /<img/, 'pictures go by file_id (EXTERNAL_MEDIA_NOT_SUPPORTED for links)');
  }
});

test('quick answers: inline results are rich messages with plain emoji and a keyboard; the edit brings custom emoji', async () => {
  const { FAQ, faqResults, faqEdit } = await import('../server/telegram-faq.mjs');
  const results = json(faqResults('', origin));
  assert.equal(results.length, FAQ.length);
  for (const result of results) {
    assert.equal(result.type, 'article');
    const html = result.input_message_content.rich_message.html;
    assert.doesNotMatch(html, /tg-emoji/, 'Telegram drops custom emoji from inline results');
    assert.doesNotMatch(html, /&(?!lt;|gt;|amp;|quot;|apos;|nbsp;|hellip;|mdash;|ndash;|lsquo;|rsquo;|ldquo;|rdquo;|#\d+;)/, 'only the named entities rich html knows');
    assert.ok(result.reply_markup.inline_keyboard.flat().length > 0, 'a keyboard, or the message gets no inline_message_id to edit');
    assert.match(result.thumbnail_url, /^https:\/\/gridstudio\.me\/assets\/og\/\w+\.jpg$/);
    const edit = json(faqEdit(result.id, origin));
    assert.match(edit.rich_message.html, /<tg-emoji emoji-id="\d+">/);
    assert.equal(edit.reply_markup.inline_keyboard.flat().length, result.reply_markup.inline_keyboard.flat().length, 'the edit keeps the buttons');
  }
  // A picture goes by the bot's file_id once uploaded, and not at all before.
  const withPicture = json(faqResults('несколько сеток', origin, { 'grids-in-file': 'AgACfile' }))[0].input_message_content.rich_message;
  assert.match(withPicture.html, /<img src="tg:\/\/photo\?id=grids-in-file"\/>/);
  assert.deepEqual(withPicture.media, [{ id: 'grids-in-file', media: { type: 'photo', media: 'AgACfile' } }]);
  assert.equal(json(faqResults('несколько сеток', origin))[0].input_message_content.rich_message.media, undefined);
  assert.deepEqual(json(faqEdit('grids-in-file', origin, { 'grids-in-file': 'AgACfile' })).rich_message.media, withPicture.media);
  const copy = json(faqResults('фона нет', origin))[0].reply_markup.inline_keyboard.flat().find((b) => b.copy_text);
  assert.equal(copy.copy_text.text, '-language russian');
  assert.equal(faqEdit('unknown', origin), null);
});

test('the bot answers inline queries and edits a chosen answer in', async () => {
  const [{ CatalogStore }, { CatalogTelegram }] = await Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-telegram.mjs')]);
  const store = new CatalogStore(':memory:', 'test-only-salt');
  try {
    const answers = [], edits = [];
    const api = { answerInlineQuery: async (params) => { answers.push(json(params)); return true; }, editMessageText: async (params) => { edits.push(json(params)); return true; } };
    const worker = new CatalogTelegram(store, { chatId: '-1004309207941', topicId: 6, origin, local: false }, api, { log: () => {} });
    await worker.inlineQuery({ id: 'q1', query: 'фона нет' });
    assert.equal(answers[0].inline_query_id, 'q1');
    assert.equal(answers[0].cache_time, 0);
    assert.equal(answers[0].results[0].id, 'no-background');
    await worker.chosenInline({ result_id: 'no-background', inline_message_id: 'AAA' });
    assert.equal(edits[0].inline_message_id, 'AAA');
    assert.match(edits[0].rich_message.html, /tg-emoji/);
    await worker.chosenInline({ result_id: 'no-background' });
    assert.equal(edits.length, 1, 'no keyboard on the sent message — nothing to edit');
    // The picture goes up once (silently, deleted at once), then comes from the saved file_id.
    const photos = [], deleted = [];
    api.sendPhoto = async (params) => { photos.push(params); return { message_id: 7, photo: [{ file_id: 'small' }, { file_id: 'AgACbig' }] }; };
    api.deleteMessage = async (params) => { deleted.push(params); return true; };
    assert.deepEqual(await worker.faqMedia(), { 'grids-in-file': 'AgACbig' });
    assert.equal(photos.length, 1); assert.equal(photos[0].disable_notification, true); assert.equal(photos[0].message_thread_id, 6);
    assert.deepEqual(deleted, [{ chat_id: '-1004309207941', message_id: 7 }]);
    await worker.faqMedia();
    const again = new CatalogTelegram(store, { chatId: '-1004309207941', topicId: 6, origin, local: false }, api, { log: () => {} });
    assert.deepEqual(await again.faqMedia(), { 'grids-in-file': 'AgACbig' });
    assert.equal(photos.length, 1, 'kept across restarts by the file hash');
    await worker.inlineQuery({ id: 'q3', query: 'несколько сеток в файле' });
    assert.equal(answers.at(-1).results[0].input_message_content.rich_message.media[0].media.media, 'AgACbig');
    api.answerInlineQuery = async () => { throw { error_code: 400 }; };
    await worker.inlineQuery({ id: 'q2', query: '' });
  } finally { store.close(); }
});
