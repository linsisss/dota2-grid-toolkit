const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { IDBFactory } = require('fake-indexeddb');

// «Оформление» (2026-10-22): the whole of /background as one document (scripts/customize-look.mjs), kept in
// «Студия» (server/studio-looks.mjs, src/customize/look-store.js) and written to .gsdota files.
const HASH = (c) => c.repeat(64);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const full = () => ({
  format: 'gridstudio-dota', version: 1,
  menu: {
    aspect: '21:9', folder: 'english', event: false,
    background: { source: { kind: 'file', name: 'Лес.mp4', size: 1234, type: 'video', label: 'MP4', media: HASH('a') }, fit: 'contain', blur: 30, dim: 40, frame: { zoom: 1.5, x: 0.25, y: 0.75, rotate: 90, flipX: true }, piece: { start: 2, end: 12.5 }, crossfade: 1 },
    buttons: { hide: ['plus', 'shards'], news: { carnival: false, season: true }, profile: true, glass: { bar: 40, friends: 70 } },
    grid: { mode: 'dim', dim: 70, own: { source: { kind: 'workshop', id: 12, title: 'Корги' }, fit: 'cover', blur: 0, dim: 0, frame: { zoom: 1, x: 0.5, y: 0.5 }, piece: null, crossfade: 0 } },
    hero: { mode: 'own', own: { source: { kind: 'file', name: 'hero.gif', size: 99, type: 'image', label: 'GIF', media: HASH('b') }, fit: 'cover', blur: 10, dim: 0, frame: { zoom: 1, x: 0.5, y: 0.5 }, piece: null, crossfade: 0 } },
    loading: { mode: 'menu', own: null }
  },
  hud: { opacity: 60, tint: '#112233', tintStrength: 30, hide: ['statue'], lower: 90, top: 110, chat: { align: 'left', x: 300, y: 400, width: 700, lines: 162, font: 18, back: 0 } },
  texts: { dota_play: 'В БОЙ', npc_dota_hero_axe: 'Топор' },
  cursor: { mode: 'own', pack: null, own: { cursor_default: { scale: 1.2, x: 0.4, y: 0.4, rot: -15, hot: [3, 4], key: 'pabc123', name: 'arrow.png' } }, packed: {} },
  pictures: { pabc123: PNG },
  font: { selected: null, roles: { Radiance: true, Reaver: false, RadianceM: true }, keepGrid: true, own: { name: 'Моя', faces: [{ media: HASH('c'), name: 'my.ttf', size: 2000 }] } },
  d2pfx: { choice: { hudskin: { skin: 'some-skin' }, click: { click: 'purple-click' } } },
  portraits: { heroes: [{ hero: 1, kind: 'video', source: { name: 'am.mp4', size: 777, type: 'video/mp4', media: HASH('f') }, crop: { x: 0.3, y: 0.6, zoom: 1.5 }, start: 2 }] }
});

test('the document: every section kept as it is, the rest as in Dota; broken ones refused', async () => {
  const look = await import('../scripts/customize-look.mjs');
  const doc = look.lookDocument(full());
  assert.deepEqual(look.lookDocument(JSON.parse(JSON.stringify(doc))), doc, 'a round trip changes nothing');
  assert.deepEqual(doc.menu.background.frame, { zoom: 1.5, x: 0.25, y: 0.75, rotate: 90, flipX: true });
  assert.equal(doc.menu.background.source.media, HASH('a'));
  assert.deepEqual(doc.menu.buttons.glass, { bar: 40, friends: 70, news: 100, header: 100, showcase: 100, party: 100 }, 'keys a document lacks read as 100');
  assert.deepEqual(doc.texts, { dota_play: 'В БОЙ', npc_dota_hero_axe: 'Топор' });
  assert.deepEqual(doc.cursor.own.cursor_default, { scale: 1.2, x: 0.4, y: 0.4, rot: -15, hot: [3, 4], key: 'pabc123', name: 'arrow.png' });
  assert.equal(doc.pictures.pabc123, PNG);
  assert.deepEqual(look.lookParts(doc), ['bg', 'grid', 'hero', 'buttons', 'hud', 'hudskin', 'chat', 'cursor', 'click', 'font', 'texts', 'portraits']);
  assert.deepEqual(Object.keys(look.lookMedia(doc)).sort(), [HASH('a'), HASH('b'), HASH('c'), HASH('f')]);
  assert.deepEqual(doc.portraits, full().portraits, 'hero portraits as the section keeps them');
  // Nothing but the header: everything as in Dota.
  const empty = look.emptyLook();
  assert.deepEqual(look.lookParts(empty), []);
  assert.deepEqual(empty.menu.buttons, { hide: [], news: { carnival: true, season: true }, profile: false, glass: { bar: 100, friends: 100, news: 100, header: 100, showcase: 100, party: 100 } });
  // Unknown fields go; pictures no cursor uses go.
  const extra = look.lookDocument({ ...full(), secret: 1, pictures: { pabc123: PNG, pzzzzz9: PNG }, menu: { ...full().menu, path: 'C:/x' } });
  assert.equal(extra.secret, undefined); assert.equal(extra.menu.path, undefined); assert.deepEqual(Object.keys(extra.pictures), ['pabc123']);
  const wrong = [
    { format: 'other' }, { version: 0 }, { menu: { aspect: '5:4' } }, { menu: { background: { source: { kind: 'url', href: 'x' } } } },
    { menu: { background: { ...full().menu.background, source: { ...full().menu.background.source, media: 'nope' } } } }, { menu: { buttons: { hide: ['play'] } } },
    { menu: { buttons: { glass: { bar: 150 } } } }, { menu: { grid: { mode: 'dark' } } }, { cursor: { mode: 'arrow' } }, { cursor: { own: { cursor_nope: { scale: 1 } } } },
    { cursor: { own: { cursor_default: { scale: 50 } } } }, { cursor: { mode: 'd2pfx', pack: { name: 'x', file: 'https://evil.example/pack.zip', credits: [] } } },
    { pictures: { pabc123: 'data:image/svg+xml;base64,PHN2Zz4=' } }, { font: { selected: '../x' } }, { font: { own: { name: 'x', faces: [{ media: 'x', size: 1 }] } } },
    { d2pfx: { choice: { nope: { skin: 'x' } } } }, { texts: { 'bad token': 'x' } }
  ];
  for (const patch of wrong) assert.throws(() => look.lookDocument({ ...full(), ...patch }), /не читается/, JSON.stringify(patch));
  assert.throws(() => look.lookDocument({ ...full(), version: 2 }), /более новой версии/);
  // A d2pfx pack from d2pfx itself passes.
  const { D2PFX } = await import('../scripts/d2pfx.mjs');
  const pack = { name: 'Pack', preview: '', file: `${D2PFX.raw}/assets/files/cursors/Pack.zip`, page: `${D2PFX.site}?category=cursors&mod=Pack`, date: 1, credits: [{ kind: 'author', name: 'h6rd', url: 'https://github.com/h6rd' }] };
  assert.deepEqual(look.lookDocument({ ...full(), cursor: { mode: 'd2pfx', pack, own: {}, packed: { cursor_move: { gone: true } } } }).cursor.pack, pack);
});

test('size limits: a picture, all of them, the document', async () => {
  const look = await import('../scripts/customize-look.mjs');
  const big = `data:image/png;base64,${'A'.repeat(look.LOOK_LIMITS.picture)}`;
  assert.throws(() => look.lookDocument({ ...full(), pictures: { pabc123: big } }), /не читается/);
  const roles = Object.fromEntries(['cursor_default', 'cursor_move', 'cursor_buy', 'cursor_coach'].map((id, i) => [id, { scale: 1, x: 0.5, y: 0.5, rot: 0, hot: null, key: `pkey00${i}`, name: '' }]));
  const pictures = Object.fromEntries(Object.values(roles).map((role) => [role.key, `data:image/png;base64,${'A'.repeat(look.LOOK_LIMITS.picture - 100)}`]));
  assert.throws(() => look.lookDocument({ ...full(), cursor: { mode: 'own', own: roles }, pictures }), (error) => error.status === 413 && /1,5 МБ/.test(error.message));
  // A .gsdota: the user's files go inside smallest first while they fit.
  assert.deepEqual(look.fileMediaPlan({ [HASH('a')]: 20_000_000, [HASH('b')]: 4_000_000, [HASH('c')]: 3_000_000 }), { inside: [HASH('c'), HASH('b')], outside: [HASH('a')], total: 7_000_000 });
  assert.throws(() => look.readLookFile('x'.repeat(look.LOOK_LIMITS.file * 1.4 + 1)), /слишком большой/);
});

test('the .gsdota file: what export writes, import reads back the same', async () => {
  const look = await import('../scripts/customize-look.mjs');
  const doc = look.lookDocument(full()), data = Buffer.from('fake gif').toString('base64');
  const text = look.lookFile(doc, { name: 'Моё  оформление', app: '2.0.5', files: { [HASH('b')]: { name: 'hero.gif', type: 'image/gif', data } } });
  const read = look.readLookFile(`\uFEFF${text}`);
  assert.deepEqual(read.look, doc);
  assert.equal(read.name, 'Моё  оформление');
  assert.deepEqual(read.media, { [HASH('b')]: { name: 'hero.gif', type: 'image/gif', data } });
  // A file the document does not name is not taken; a strange type becomes a plain one.
  const odd = JSON.parse(text); odd.media[HASH('d')] = { name: 'x.exe', type: 'application/x-msdownload', data: 'TVo=' }; odd.media[HASH('b')].type = 'text/html';
  const back = look.readLookFile(JSON.stringify(odd));
  assert.deepEqual(Object.keys(back.media), [HASH('b')]);
  assert.equal(back.media[HASH('b')].type, 'application/octet-stream');
  assert.throws(() => look.readLookFile('{"format":"gridstudio-dota","version":1,"media":{"' + HASH('b') + '":{"data":"<script>"}},"menu":' + JSON.stringify(doc.menu) + '}'), /не читается/);
  assert.throws(() => look.readLookFile('not json'), /не читается/);
});

test('a «Студия» background as an «Оформление»: its menu, its own videos for the user\'s files', async () => {
  const look = await import('../scripts/customize-look.mjs');
  const { studioRecipe } = await import('../scripts/studio-background.mjs');
  const recipe = studioRecipe({ aspect: '16:10', fit: 'contain', blur: 40, dim: 20, frame: { zoom: 1.5, x: 0.25, y: 0.5 }, clean: false, news: { carnival: false, season: true }, folder: 'russian', delivery: 'file',
    piece: { start: 1.5, end: 21.5 }, crossfade: 1, source: { kind: 'file', name: 'Лес.MP4', size: 123, type: 'video', label: 'MP4' }, hero: { mode: 'off' }, event: false, profile: true,
    grid: { mode: 'own', fit: 'cover', blur: 0, dim: 30, frame: null, piece: null, crossfade: 0, source: { kind: 'workshop', id: 3, title: 'Лес' } }, loading: { mode: 'menu' }, hide: ['plus'] });
  // Built in this browser: the menu's video stands in for the file, as it is.
  const made = look.lookFromRecipe(recipe, { built: { bg: { media: HASH('e'), size: 5_000_000 } } });
  assert.deepEqual(made.menu.background, { source: { kind: 'file', name: 'Лес.webm', size: 5_000_000, type: 'video', label: 'WEBM', media: HASH('e') }, fit: 'cover', blur: 0, dim: 0, frame: { zoom: 1, x: 0.5, y: 0.5 }, piece: null, crossfade: 0 });
  assert.deepEqual([made.menu.aspect, made.menu.event, made.menu.hero.mode, made.menu.loading.mode], ['16:10', false, 'off', 'menu']);
  assert.deepEqual(made.menu.buttons, { hide: ['plus'], news: { carnival: false, season: true }, profile: true, glass: { bar: 100, friends: 100, news: 100, header: 100, showcase: 100, party: 100 } });
  assert.deepEqual(made.menu.grid.own.source, { kind: 'workshop', id: 3, title: 'Лес' }, 'a workshop background stays a reference');
  assert.equal(made.menu.grid.own.dim, 30);
  // Not built here (another device): the recipe as it is, the file asked for.
  const recipeOnly = look.lookFromRecipe(recipe);
  assert.deepEqual(recipeOnly.menu.background, { source: recipe.source, fit: 'contain', blur: 40, dim: 20, frame: recipe.frame, piece: recipe.piece, crossfade: 1 });
  assert.deepEqual(look.lookParts(recipeOnly), ['bg', 'grid', 'buttons']);
  // Recipes from before 1.6.4 (no grid, loading, hide, news): as Dota had them.
  const { grid, loading, hide, news, event, profile, ...old } = recipe;
  const before = look.lookFromRecipe(studioRecipe({ ...old, clean: true }));
  assert.deepEqual([before.menu.grid.mode, before.menu.loading.mode, before.menu.buttons.news, before.menu.event], ['menu', 'off', { carnival: false, season: false }, true]);
});

test('the browser side: a file opened writes every section\'s key, the page reads the same state back', async (t) => {
  const store = new Map();
  globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) };
  globalThis.indexedDB = new IDBFactory();
  t.after(() => { delete globalThis.localStorage; delete globalThis.indexedDB; });
  const look = await import('../scripts/customize-look.mjs');
  const state = await import('../src/customize/look-state.js');
  const lookStore = await import('../src/customize/look-store.js');
  // The export of a page: the hero's GIF inside, the menu's video too big to go in.
  const gif = Buffer.from('GIF89a fake picture');
  const doc = look.lookDocument(full()), hero = await lookStore.sha256(new Blob([gif]));
  doc.menu.hero.own.source.media = hero;
  const text = look.lookFile(doc, { name: 'Тест', files: { [hero]: { name: 'hero.gif', type: 'image/gif', data: gif.toString('base64') } } });
  // A fresh browser opens it.
  const { look: opened, media } = look.readLookFile(text);
  const files = Object.fromEntries(Object.entries(media).map(([hash, item]) => [hash, new File([Buffer.from(item.data, 'base64')], item.name, { type: item.type })]));
  await state.applyLook(opened, { files });
  assert.deepEqual(JSON.parse(store.get('gridstudio.interface')), { hud: doc.hud, texts: doc.texts });
  assert.deepEqual(JSON.parse(store.get('gridstudio.cursor')), doc.cursor);
  assert.deepEqual(JSON.parse(store.get('gridstudio.d2pfx')), { choice: doc.d2pfx.choice });
  assert.deepEqual(JSON.parse(store.get('gridstudio.font')), doc.font);
  assert.deepEqual(state.readMenuState(), doc.menu);
  assert.deepEqual(JSON.parse(store.get('gridstudio.portraits')), doc.portraits);
  // The page's state read back from those keys is the file's document.
  const back = await state.storedLook();
  assert.deepEqual(back, doc);
  // The GIF is in this browser under its hash; the menu's video is not, so the page will ask for it.
  assert.equal((await lookStore.mediaFile(hero)).size, gif.length);
  assert.equal(await lookStore.mediaFile(HASH('a')), null);
  assert.deepEqual(Object.keys(await state.lookFiles(doc)), [hero]);
  // A wrong hash in a file is not trusted: the file is kept under its real one and the document follows.
  await state.applyLook(opened, { files: { [HASH('b')]: new File([gif], 'hero.gif', { type: 'image/gif' }) } });
  assert.equal(state.readMenuState().hero.own.source.media, hero);
  // The state before, kept once; files no document names go after an hour, named ones stay.
  await state.keepPrevious(doc, { id: randomUUID(), name: 'x' });
  assert.equal((await state.readPrevious()).look.menu.aspect, '21:9');
  assert.equal(await lookStore.pruneMedia(state.namedMedia()), 0);
  assert.ok(state.namedMedia().includes(hero));
  // A broken key does not lose the rest.
  store.set('gridstudio.d2pfx', JSON.stringify({ choice: { nope: { x: 'y' } } }));
  const partly = await state.storedLook();
  assert.deepEqual(partly.d2pfx, { choice: {} }); assert.deepEqual(partly.hud, doc.hud);
});

test('«Оформление» in an account: signed-in only, per account, limits; backgrounds untouched', async (t) => {
  const [{ CatalogStore }, { createCatalogAPI }, look] = await Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs'), import('../scripts/customize-look.mjs')]);
  const store = new CatalogStore(':memory:', 'test-looks');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-looks', admins: new Set(), database: ':memory:' };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const signIn = (telegram, where) => { const login = accounts.begin(where, where); accounts.candidate(login.id, { id: telegram, first_name: 'A', is_bot: false }); accounts.approve(login.id, telegram, true); return `gs_account=${accounts.finish(login.id, login.verifier, String(telegram)).session}`; };
  const call = async (path, { method = 'GET', body, raw, cookie = '' } = {}) => {
    const response = await fetch(base + path, { method, headers: { Origin: config.origin, Cookie: cookie, ...(body || raw ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : raw ? { body: raw } : {}) });
    const type = response.headers.get('content-type') || '';
    return { status: response.status, headers: response.headers, body: type.startsWith('application/json') ? await response.json() : new Uint8Array(await response.arrayBuffer()) };
  };
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64'), id = randomUUID(), doc = look.lookDocument(full());
  assert.equal((await call('/studio/looks')).status, 401, 'only with Telegram');
  const alice = signIn(2001, 'a'), bob = signIn(2002, 'b');
  const saved = await call(`/studio/looks/${id}`, { method: 'PUT', cookie: alice, body: { name: '  Тёмное   меню ', look: { ...full(), extra: true }, poster: jpeg } });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.parts, look.lookParts(doc));
  const list = (await call('/studio/looks', { cookie: alice })).body.items;
  assert.deepEqual(list.map(({ id, name, parts, poster }) => ({ id, name, parts, poster })), [{ id, name: 'Тёмное меню', parts: look.lookParts(doc), poster: true }]);
  assert.equal(list[0].look, undefined, 'the list is light: no documents');
  const one = await call(`/studio/looks/${id}`, { cookie: alice });
  assert.deepEqual(one.body.look, doc);
  assert.equal((await call(`/studio/looks/${id}/poster.jpg`, { cookie: alice })).headers.get('content-type'), 'image/jpeg');
  assert.deepEqual((await call('/studio/looks', { cookie: bob })).body.items, [], 'another account sees nothing');
  assert.equal((await call(`/studio/looks/${id}`, { cookie: bob })).status, 404);
  assert.equal((await call(`/studio/looks/${id}`, { method: 'DELETE', cookie: bob })).status, 200);
  assert.equal((await call('/studio/looks', { cookie: alice })).body.items.length, 1, 'bob cannot delete alice’s');
  // Renaming without a poster keeps it; checks.
  assert.equal((await call(`/studio/looks/${id}`, { method: 'PUT', cookie: alice, body: { name: 'Меню', look: doc } })).status, 200);
  assert.equal((await call(`/studio/looks/${id}/poster.jpg`, { cookie: alice })).status, 200, 'poster kept');
  assert.equal((await call(`/studio/looks/${randomUUID()}`, { method: 'PUT', cookie: alice, body: { name: ' ', look: doc } })).status, 400);
  assert.equal((await call(`/studio/looks/${randomUUID()}`, { method: 'PUT', cookie: alice, body: { name: 'x', look: { ...doc, menu: { aspect: '5:4' } } } })).status, 400);
  assert.equal((await call(`/studio/looks/${randomUUID()}`, { method: 'PUT', cookie: alice, body: { name: 'x', look: doc, poster: Buffer.from('<svg/>').toString('base64') } })).status, 415);
  const heavy = { ...doc, pictures: {}, cursor: { mode: 'own', packed: {}, own: Object.fromEntries(['cursor_default', 'cursor_move', 'cursor_buy', 'cursor_coach'].map((role, i) => [role, { scale: 1, x: 0.5, y: 0.5, rot: 0, hot: null, key: `pkey00${i}`, name: '' }])) } };
  heavy.pictures = Object.fromEntries(Object.values(heavy.cursor.own).map((role) => [role.key, `data:image/png;base64,${'A'.repeat(look.LOOK_LIMITS.picture - 100)}`]));
  assert.equal((await call(`/studio/looks/${randomUUID()}`, { method: 'PUT', cookie: alice, body: { name: 'x', look: heavy } })).status, 413, 'over 1.5 MB');
  assert.equal((await call(`/studio/looks/${randomUUID()}`, { method: 'PUT', cookie: alice, raw: JSON.stringify({ name: 'x', look: doc, pad: 'x'.repeat(2_300_000) }) })).status, 413, 'a request over 2.2 MB');
  // At most LOOK_LIMITS.perAccount per account, and LOOK_LIMITS.accountBytes together.
  const bobId = (await call('/auth/me', { cookie: bob })).body.user.id;
  for (let i = 0; i < look.LOOK_LIMITS.perAccount; i++) store.run('INSERT INTO studio_looks(account,id,name,look,parts,created,updated) VALUES(?,?,?,?,?,1,1)', bobId, randomUUID(), 'x', '{}', '[]');
  assert.equal((await call(`/studio/looks/${randomUUID()}`, { method: 'PUT', cookie: bob, body: { name: 'ещё', look: doc } })).status, 409);
  const carol = signIn(2003, 'c'), carolId = (await call('/auth/me', { cookie: carol })).body.user.id;
  store.run('INSERT INTO studio_looks(account,id,name,look,parts,created,updated) VALUES(?,?,?,?,?,1,1)', carolId, randomUUID(), 'big', 'x'.repeat(look.LOOK_LIMITS.accountBytes - 100), '[]');
  assert.equal((await call(`/studio/looks/${randomUUID()}`, { method: 'PUT', cookie: carol, body: { name: 'ещё', look: doc } })).status, 413);
  // The studio backgrounds of the same account are where they were.
  const { studioRecipe } = await import('../scripts/studio-background.mjs');
  const recipe = studioRecipe({ aspect: '16:9', fit: 'cover', blur: 0, dim: 0, clean: false, folder: 'russian', delivery: 'file', piece: null, crossfade: 0, source: { kind: 'workshop', id: 7, title: 'Корги' } });
  const backgroundId = randomUUID();
  assert.equal((await call(`/studio/backgrounds/${backgroundId}`, { method: 'PUT', cookie: alice, body: { name: 'Корги', recipe } })).status, 200);
  assert.deepEqual((await call('/studio/backgrounds', { cookie: alice })).body.items.map((item) => item.id), [backgroundId]);
  assert.deepEqual((await call('/studio/looks', { cookie: alice })).body.items.map((item) => item.id), [id]);
  assert.equal((await call(`/studio/looks/${id}`, { method: 'DELETE', cookie: alice })).status, 200);
  assert.deepEqual((await call('/studio/looks', { cookie: alice })).body.items, []);
  assert.equal((await call('/studio/backgrounds', { cookie: alice })).body.items.length, 1, 'deleting an «Оформление» leaves the backgrounds');
});

test('no room in the browser: the page keeps the settings and names the file, nothing breaks', async (t) => {
  const store = new Map();
  globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) };
  const saved = globalThis.indexedDB; delete globalThis.indexedDB;
  t.after(() => { delete globalThis.localStorage; if (saved) globalThis.indexedDB = saved; });
  const look = await import('../scripts/customize-look.mjs');
  const state = await import('../src/customize/look-state.js?quota');
  const lookStore = await import('../src/customize/look-store.js?quota');
  assert.equal(await lookStore.keepMedia(new File([Buffer.from('x')], 'a.png', { type: 'image/png' })), null, 'not kept: only the name stays');
  assert.equal(await lookStore.mediaFile(HASH('a')), null);
  const doc = look.lookDocument(full());
  const applied = await state.applyLook(doc, { files: { [HASH('b')]: new File([Buffer.from('gif')], 'hero.gif') } });
  assert.deepEqual(state.readMenuState(), applied.menu, 'the settings are written even without IndexedDB');
  assert.equal(await state.keepPrevious(doc, null), false, 'no backup place: said so, not thrown');
  assert.equal(await lookStore.pruneMedia([]), 0);
});
