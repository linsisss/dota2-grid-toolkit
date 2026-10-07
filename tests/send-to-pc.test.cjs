const { test } = require('node:test');
const assert = require('node:assert/strict');
const link = import('../scripts/pc-link.mjs');

test('page codes go to the bot and back to the same page', async () => {
  const { pcCode, pcPage } = await link;
  const pages = ['/', '/editor', '/workshop', '/workshop?backgrounds', '/workshop?id=003ab57d-2da9-4b4d-82f5-f06631a2efb7', '/workshop?creator=-0R9Djf8BuyH',
    '/background', '/background?tab=font', '/background?background=42', '/guides', '/guides?id=6sNSfQeEnZN5'];
  for (const path of pages) {
    const code = pcCode(`https://gridstudio.me${path}`);
    assert.match(code, /^[\w-]{1,61}$/, path); // t.me start payloads: 64 characters with «pc_»
    assert.equal(pcPage(code).path, path);
  }
  assert.equal(pcCode('/catalog?id=003AB57D-2DA9-4B4D-82F5-F06631A2EFB7'), 'w003ab57d2da94b4d82f5f06631a2efb7');
  assert.equal(pcCode('/landing'), '');
  for (const bad of ['', 'x', 'w123', 'b0', 'b-1', 'gshort', 'c../../../../', 'hh', 'toString']) assert.equal(pcPage(bad), null, bad);
});

test('the bot answers /start pc_<code> in a private chat with the page link', async () => {
  const [{ CatalogStore }, { CatalogTelegram }] = await Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-telegram.mjs')]);
  const store = new CatalogStore(':memory:', 'test-only-salt');
  const sent = [];
  const worker = new CatalogTelegram(store, { chatId: '-1', topicId: 6, origin: 'https://gridstudio.me' }, { sendMessage: async (params) => { sent.push(params); return { message_id: 1 }; } }, { log: () => {} });
  const from = { id: 7, is_bot: false }, chat = { id: 7, type: 'private' };
  await worker.pcMessage({ text: '/start pc_f', from, chat });
  await worker.pcMessage({ text: '/start pc_w003ab57d2da94b4d82f5f06631a2efb7', from, chat });
  await worker.pcMessage({ text: '/start pc_f', from, chat: { id: -5, type: 'group' } });
  await worker.pcMessage({ text: '/start pc_nope', from, chat });
  await worker.pcMessage({ text: '/start login_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', from, chat });
  assert.equal(sent.length, 2);
  assert.match(sent[0].text, /Шрифт для Dota/);
  assert.equal(sent[0].reply_markup.inline_keyboard[0][0].url, 'https://gridstudio.me/background?tab=font');
  assert.match(sent[1].text, /Сетка героев/); // a grid that is not published: no title, still the link
  assert.equal(sent[1].reply_markup.inline_keyboard[0][0].url, 'https://gridstudio.me/workshop?id=003ab57d-2da9-4b4d-82f5-f06631a2efb7');
  store.close();
});

test('a bare /start gets a greeting; a pasted login code works without /start', async () => {
  const [{ CatalogStore }, { CatalogTelegram }] = await Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-telegram.mjs')]);
  const store = new CatalogStore(':memory:', 'test-only-salt');
  const sent = [], worker = new CatalogTelegram(store, { chatId: '-1', topicId: 6, origin: 'https://gridstudio.me', token: 't' }, { sendMessage: async (params) => { sent.push(params); return { message_id: sent.length }; } }, { log: () => {}, avatar: async () => { throw new Error('no photo'); } });
  const from = { id: 7, is_bot: false, first_name: 'A' }, chat = { id: 7, type: 'private' };
  await worker.helloMessage({ text: '/start', from, chat });
  assert.match(sent[0].text, /Чтобы войти на сайт/);
  await worker.helloMessage({ text: '/start login_x', from, chat });
  assert.equal(sent.length, 1);
  const login = worker.accounts.begin('ip', 'browser');
  await worker.loginMessage({ text: `login_${login.id}`, from, chat });
  assert.match(sent.at(-1).text, /Войти в GridStudio\?/);
  store.close();
});
