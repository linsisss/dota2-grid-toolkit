const test = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory } = require('fake-indexeddb');
const C = require('../scripts/core.mjs').default;
const { ProjectStorage, openProjectDatabase, PROJECT_KEY, JOURNAL_PREFIX } = require('../scripts/project-storage.mjs');

class MemoryStorage {
  data = new Map();
  fail = () => false;
  get length() { return this.data.size; }
  key(i) { return [...this.data.keys()][i]; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { if (this.fail(key)) throw new Error('QuotaExceededError'); this.data.set(key, value); }
  removeItem(key) { this.data.delete(key); }
}
const doc = (name = 'Мой проект') => C.createDocument(name);
const open = async (storage = new MemoryStorage(), version = '1.0.0', database = null, extra = {}) => {
  const store = new ProjectStorage({ storage, database, importProject: C.importProject, version, ...extra });
  const initial = await store.load();
  return { store, initial, storage };
};
const db = () => openProjectDatabase(new IDBFactory());

test('legacy project is preserved byte-for-byte before migration, with all grids and reference image', async () => {
  const storage = new MemoryStorage(), database = await db();
  let original = doc();
  original.reference = { src: 'data:image/png;base64,AAAA', name: 'Reference', x: 3, y: 4, w: 60, h: 70, opacity: .1, visible: true };
  original = C.appendConfigs(original, [doc('Вторая сетка')]);
  const raw = JSON.stringify(original, null, 2);
  storage.setItem(PROJECT_KEY, raw);
  const { store, initial } = await open(storage, '1.0.0', database);
  assert.equal(initial.doc.reference.x, 3);
  assert.equal(C.configurations(initial.doc).length, 2);
  const changed = C.clone(initial.doc); changed.name = 'Изменено';
  assert.equal((await store.save(changed)).saved, true);
  assert.ok((await database.list()).some((r) => r.key.startsWith('protected:') && r.raw === raw));
  const reloaded = await open(storage, '1.0.1', database);
  assert.equal(reloaded.initial.doc.name, 'Изменено');
  assert.ok((await database.list()).some((r) => r.key.startsWith('protected:') && JSON.parse(r.raw)._studioSave?.version === '1.0.0'));
  database.close();
});

test('corrupt sole original cannot be overwritten with demo or blank project', async () => {
  const storage = new MemoryStorage(); storage.setItem(PROJECT_KEY, '{broken');
  const { store, initial } = await open(storage);
  assert.equal(initial.doc, null); assert.equal(initial.hasData, true);
  const result = await store.save(doc('Новая работа'));
  assert.equal(result.blocked, true); assert.equal(result.saved, true);
  assert.equal(storage.getItem(PROJECT_KEY), '{broken');
  assert.ok((await store.records()).some((r) => !r.valid && r.raw === '{broken'));
});

test('valid database copy recovers after local corruption without destroying raw broken data', async () => {
  const storage = new MemoryStorage(), database = await db();
  const first = await open(storage, '1.0.0', database);
  await first.store.save(doc('Сохранённая работа'));
  storage.setItem(PROJECT_KEY, '{broken');
  const next = await open(storage, '1.0.1', database);
  assert.equal(next.initial.doc.name, 'Сохранённая работа');
  await next.store.save(doc('Продолжение'));
  assert.ok((await database.list()).some((r) => r.raw === '{broken'));
  database.close();
});

test('pending journal recovers the last edit on reload before async commit', async () => {
  const { store, storage } = await open();
  await store.save(doc('Старое'));
  store.checkpoint(doc('Последний ввод'));
  assert.equal((await open(storage)).initial.doc.name, 'Последний ввод');
});

test('pending edit with legacy parent is recovered after an interrupted first upgrade', async () => {
  const storage = new MemoryStorage(); storage.setItem(PROJECT_KEY, JSON.stringify(doc('Legacy')));
  const { store } = await open(storage);
  store.checkpoint(doc('Последний ввод'));
  assert.equal((await open(storage)).initial.doc.name, 'Последний ввод');
});

test('IndexedDB saves and reopens latest work when localStorage fills up', async () => {
  const storage = new MemoryStorage(), database = await db();
  storage.setItem(PROJECT_KEY, JSON.stringify(doc('Legacy')));
  const { store } = await open(storage, '1.0.0', database);
  storage.fail = () => true;
  const result = await store.save(doc('Большой арт'));
  assert.equal(result.saved, true); assert.equal(result.redundant, false);
  assert.equal((await open(storage, '1.0.1', database)).initial.doc.name, 'Большой арт');
  database.close();
});

test('unavailable localStorage falls back to IndexedDB', async () => {
  const database = await db(), { store } = await open(null, '1.0.0', database);
  assert.equal((await store.save(doc())).saved, true);
  assert.equal((await open(null, '1.0.0', database)).initial.doc.name, 'Мой проект');
  database.close();
});

test('quota failure leaves the last good document intact and reports failure', async () => {
  const { store, storage } = await open();
  await store.save(doc('Сохранено')); const good = storage.getItem(PROJECT_KEY);
  storage.fail = () => true;
  const result = await store.save(doc('Не помещается'));
  assert.equal(result.saved, false); assert.equal(result.failed, true);
  assert.equal(storage.getItem(PROJECT_KEY), good);
});

test('failure to protect old project blocks destructive replacement', async () => {
  const storage = new MemoryStorage(), raw = JSON.stringify(doc('Legacy'));
  storage.setItem(PROJECT_KEY, raw); storage.fail = () => true;
  const { store, initial } = await open(storage);
  assert.equal(initial.doc.name, 'Legacy'); assert.ok(initial.issue);
  assert.equal((await store.save(doc('New'))).blocked, true);
  assert.equal(storage.getItem(PROJECT_KEY), raw);
});

test('second tab preserves its branch instead of overwriting the first tab', async () => {
  const storage = new MemoryStorage(), database = await db();
  const first = await open(storage, '1.0.0', database), second = await open(storage, '1.0.0', database);
  await first.store.save(doc('Первая вкладка'));
  const result = await second.store.save(doc('Вторая вкладка'));
  assert.equal(result.saved, true); assert.equal(result.conflict, true);
  assert.equal((await open(storage, '1.0.0', database)).initial.doc.name, 'Первая вкладка');
  assert.ok((await second.store.records()).some((r) => r.name === 'Вторая вкладка'));
  database.close();
});

test('simultaneous database commits without localStorage use atomic comparison', async () => {
  const database = await db();
  const first = await open(null, '1.0.0', database), second = await open(null, '1.0.0', database);
  const results = await Promise.all([first.store.save(doc('A')), second.store.save(doc('B'))]);
  assert.equal(results.filter((result) => result.conflict).length, 1);
  const records = await database.list();
  assert.ok(records.some((r) => JSON.parse(r.raw).name === 'A'));
  assert.ok(records.some((r) => JSON.parse(r.raw).name === 'B'));
  database.close();
});

test('restore protects current edits, rebases and can resume a conflicted tab', async () => {
  const storage = new MemoryStorage(), database = await db();
  const first = await open(storage, '1.0.0', database), second = await open(storage, '1.0.0', database);
  await first.store.save(doc('A'));
  await second.store.save(doc('B'));
  const raw = (await second.store.records()).find((r) => r.name === 'B').raw;
  const restored = await second.store.prepareRestore(raw, doc('Несохранённое C'));
  assert.equal((await second.store.save(restored)).conflict, false);
  assert.equal((await open(storage, '1.0.0', database)).initial.doc.name, 'B');
  const records = await database.list();
  assert.ok(records.some((r) => JSON.parse(r.raw).name === 'A'));
  assert.ok(records.some((r) => JSON.parse(r.raw).name === 'Несохранённое C'));
  database.close();
});

test('save queue preserves edit order and does not remove a newer checkpoint', async () => {
  const database = await db(), { store, storage } = await open(new MemoryStorage(), '1.0.0', database);
  const a = store.save(doc('A')), b = store.save(doc('B'));
  store.checkpoint(doc('C'));
  await Promise.all([a, b]);
  assert.equal(JSON.parse(storage.getItem(PROJECT_KEY)).name, 'B');
  assert.equal((await open(storage, '1.0.0', database)).initial.doc.name, 'C');
  database.close();
});

test('rolling snapshots are bounded and pre-update copies survive many saves', async () => {
  const database = await db(), storage = new MemoryStorage(); let time = 1;
  const raw = JSON.stringify(doc('Legacy')); storage.setItem(PROJECT_KEY, raw);
  const { store } = await open(storage, '1.0.0', database, { now: () => time });
  for (let n = 0; n < 20; n++) { time += 60000; await store.save(doc(String(n))); }
  const records = await database.list();
  assert.equal(records.filter((r) => r.key.startsWith('rolling:')).length, 10);
  assert.ok(records.some((r) => r.key.startsWith('protected:') && r.raw === raw));
  assert.equal(storage.length, 1);
  database.close();
});

test('storage names stay fixed across releases so an update never orphans saved projects', async () => {
  // Renaming any of these hides every existing autosave after a deploy; old data would still be there, but unread.
  assert.equal(PROJECT_KEY, 'dota-grid-studio.document.v1');
  assert.equal(JOURNAL_PREFIX, 'dota-grid-studio.document.v1.pending.');
  const factory = new IDBFactory();
  await openProjectDatabase(factory);
  assert.deepEqual((await factory.databases()).map(({ name, version }) => ({ name, version })), [{ name: 'gridstudio-projects', version: 1 }]);
});
