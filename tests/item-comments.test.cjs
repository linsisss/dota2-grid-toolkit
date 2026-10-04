const { tempMedia } = require('./temp-media.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');

// Comments under workshop grids and backgrounds (server/item-comments.mjs): threads, who may delete,
// reports as Telegram cards.
const modules = Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs'), import('../server/catalog-telegram-store.mjs')]);
const grid = (x) => ({ version: 3, configs: [{ config_name: 'Test', categories: [{ category_name: '@', x_position: x, y_position: 30, width: 30, height: 30, hero_ids: [] }] }] });

test('comments under a grid: a thread, deleting, a report that becomes a moderation card', async (t) => {
  const [{ CatalogStore }, { createCatalogAPI }, { TelegramQueue }] = await modules;
  const store = new CatalogStore(':memory:', 'test-item-comments');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-item-comments', admins: new Set(['900000099']), database: ':memory:', media: tempMedia() };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const signIn = (id) => { const r = accounts.begin(`ip-${id}`, `b-${id}`); accounts.candidate(r.id, { id: Number(id), first_name: 'U', is_bot: false }); accounts.approve(r.id, Number(id), true); return accounts.finish(r.id, r.verifier, id).session; };
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const as = (session) => async (path, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: config.origin, Cookie: session ? `gs_account=${session}` : '' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const author = as(signIn('1101')), fan = as(signIn('1102')), other = as(signIn('1103')), admin = as(signIn('900000099')), guest = as(null);
  const work = store.save({ title: 'Сетка', author: '', tags: ['Аниме'], grid: grid(10) }, { browser: 'b', ip: 'i' }, null, null, null, '1101');
  assert.equal((await guest(`/works/${work.id}/comments`)).status, 404, 'not published yet');
  store.moderate(work.id, { action: 'approve', revision: work.revision });
  assert.equal((await guest(`/works/${work.id}/comments`, 'POST', { body: 'привет' })).status, 401);
  const first = (await fan(`/works/${work.id}/comments`, 'POST', { body: '  Классная сетка!  ' })).body;
  assert.equal(first.body, 'Классная сетка!'); assert.equal(first.author.name, store.profiles.creator('1102').name); assert.equal(first.removable, true);
  const reply = (await author(`/works/${work.id}/comments`, 'POST', { body: 'Спасибо', reply: first.id })).body;
  assert.equal(reply.thread, first.id); assert.equal(reply.reply.id, first.id);
  const list = (await guest(`/works/${work.id}/comments`)).body;
  assert.deepEqual(list.items.map((c) => c.body), ['Классная сетка!', 'Спасибо']); assert.equal(list.total, 2);
  assert.equal(list.items[0].removable, false, 'a guest deletes nothing');
  assert.equal((await guest(`/works/${work.id}`)).body.comments, 2);
  // Who may delete: not someone else; the work's author may.
  assert.equal((await other(`/comments/${first.id}`, 'DELETE')).status, 403);
  // A report becomes a card; «Удалить комментарий» hides it.
  assert.equal((await other(`/comments/${reply.id}/report`, 'POST', { reason: 'Спам' })).body.reported, true);
  const queue = new TelegramQueue(store); queue.sync();
  const job = store.get("SELECT * FROM telegram_reviews WHERE kind='item-comment-report'");
  assert.ok(job); assert.equal(JSON.parse(job.summary).comment, 'Спасибо'); assert.equal(JSON.parse(job.summary).title, 'Сетка');
  queue.decide(job.id, 'hide', { id: 1, name: 'Модератор' });
  assert.equal((await guest(`/works/${work.id}`)).body.comments, 1);
  assert.equal((await author(`/comments/${first.id}`, 'DELETE')).body.deleted, true, 'the work’s author deletes under their work');
  assert.equal((await guest(`/works/${work.id}/comments`)).body.total, 0);
  // An admin deletes anything.
  const third = (await other(`/works/${work.id}/comments`, 'POST', { body: 'ещё' })).body;
  assert.equal((await admin(`/comments/${third.id}`, 'DELETE')).body.deleted, true);
});
