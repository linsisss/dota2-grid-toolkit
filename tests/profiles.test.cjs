const test = require('node:test');
const assert = require('node:assert/strict');

// Creator profiles (server/profiles.mjs, docs/accounts-workspaces.md): a generated nickname for every
// Telegram account, changed once a week; a description, the @username only when shown, an avatar; the
// works, backgrounds and guides of a signed-in author are signed by the profile.
const modules = Promise.all([import('../server/catalog-store.mjs'), import('../server/accounts.mjs'), import('../server/profiles.mjs'), import('../server/catalog-api.mjs'), import('@napi-rs/canvas')]);
const DAY = 86_400_000;
const from = (id) => ({ id: Number(id), first_name: `Имя ${id}`, username: `user_${id}`, is_bot: false });
const grid = (x) => ({ version: 3, configs: [{ config_name: 'Test', categories: [{ category_name: '@', x_position: x, y_position: 30, width: 30, height: 30, hero_ids: [] }] }] });
const identity = (n) => ({ browser: `browser-${n}`, ip: `ip-${n}` });

async function fixture(t) {
  const [{ CatalogStore }, { Accounts }] = await modules;
  let now = Date.UTC(2026, 9, 2, 12);
  const store = new CatalogStore(':memory:', 'test-profiles', () => now), accounts = new Accounts(store); t.after(() => store.close());
  const login = (id) => { const r = accounts.begin(`ip${id}`, `browser${id}`); accounts.candidate(r.id, from(id)); accounts.approve(r.id, Number(id), true); return accounts.finish(r.id, r.verifier, String(id)); };
  return { store, accounts, profiles: store.profiles, login, advance: (delta) => { now += delta; } };
}
async function png(width, height, color = '#c4b5ed') {
  const { createCanvas } = (await modules)[4];
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, width, height);
  return new Uint8Array(await canvas.encode('png'));
}

test('every account gets a free two-word nickname and a stable key; older accounts get one at start', async (t) => {
  const { store, profiles, login } = await fixture(t);
  const a = login('101'), b = login('102');
  assert.match(a.user.nickname, /^[A-Z][a-z]+[A-Z][a-z]+$/, 'like ScoutingDuck');
  assert.notEqual(a.user.nickname.toLowerCase(), b.user.nickname.toLowerCase());
  assert.match(a.user.profile, /^[\w-]{12}$/);
  assert.equal(profiles.ensure('101').key, a.user.profile, 'the same key next time');
  assert.equal(a.user.avatar, `/api/catalog/profiles/${a.user.profile}/avatar?v=p`, 'the pattern by default');
  assert.equal(a.user.name, 'Имя 101', 'the Telegram name stays the server’s');
  // Accounts signed in before profiles: made when the server starts (Accounts → ensureAll).
  store.run('INSERT INTO accounts(id,name,username,updated) VALUES(?,?,?,?)', '103', 'Старый', 'old_user', Date.UTC(2026, 8, 30));
  store.run("INSERT INTO works(id,owner,browser,ip,created,account) VALUES('w-old','x','b','i',?,'103')", Date.UTC(2026, 8, 25));
  assert.equal(profiles.ensureAll(), 1);
  assert.equal(profiles.ensure('103').created, Date.UTC(2026, 8, 25), 'joined with its first work');
  assert.equal(profiles.ensureAll(), 0);
  assert.match(profiles.creator('103').name, /^[A-Z][a-z]+[A-Z][a-z]+$/);
  assert.equal(profiles.creator(null), null);
});

test('a chosen nickname: the rules, taken ones, once a week', async (t) => {
  const { profiles, login, advance } = await fixture(t);
  const [{ cleanNickname }] = [await import('../server/profiles.mjs')];
  for (const bad of ['ab', 'a'.repeat(21), 'два слова', '12345', '_name', 'name.', 'Admin', 'grid_studio', 'Модератор', 'name!'])
    assert.throws(() => cleanNickname(bad), (e) => e.status === 400, bad);
  for (const good of ['Лиса', 'neo.42', 'x-ray_9', 'Ёжик']) assert.equal(cleanNickname(` ${good} `), good);
  login('201'); login('202');
  const own = profiles.update('201', { nickname: 'Ёжик' });
  assert.equal(own.nickname, 'Ёжик');
  assert.ok(own.nicknameAt > Date.UTC(2026, 9, 8), 'the next change in a week');
  assert.throws(() => profiles.update('202', { nickname: 'ежик' }), (e) => e.status === 409, 'taken, whatever the case and ё');
  const early = (() => { try { profiles.update('201', { nickname: 'Другой' }); } catch (e) { return e; } })();
  assert.equal(early.status, 429); assert.equal(early.extra.nicknameAt, own.nicknameAt); assert.match(early.message, /раз в неделю.*9 октября/);
  assert.equal(profiles.update('201', { nickname: 'Ёжик', bio: 'привет' }).bio, 'привет', 'the same nickname is not a change');
  advance(7 * DAY);
  assert.equal(profiles.update('201', { nickname: 'Другой' }).nickname, 'Другой');
  assert.equal(profiles.update('202', { nickname: 'Ёжик' }).nickname, 'Ёжик', 'a released nickname is free again');
});

test('the description is tidied and limited; the Telegram @username shows only when turned on', async (t) => {
  const { profiles, login } = await fixture(t);
  login('301');
  assert.equal(profiles.update('301', { bio: '  Делаю  сетки\r\n\r\n\r\n\r\nи фоны\u0007  ' }).bio, 'Делаю сетки\n\nи фоны');
  assert.throws(() => profiles.update('301', { bio: 'а'.repeat(301) }), (e) => e.status === 400);
  assert.throws(() => profiles.update('301', { bio: '1\n2\n3\n4\n5\n6\n7' }), (e) => e.status === 400);
  const row = () => profiles.ensure('301');
  assert.equal(profiles.card(row()).telegram, '');
  assert.equal(profiles.update('301', { telegram: true }).telegram, true);
  assert.equal(profiles.card(row()).telegram, '@user_301');
  profiles.update('301', { telegram: false });
  assert.equal(profiles.card(row()).telegram, '');
});

test('avatars: the pattern, a picture of one’s own cut square to 256 px WebP, the Telegram photo only when there is one', async (t) => {
  const { loadImage } = (await modules)[4];
  const { profiles, login } = await fixture(t);
  const { user } = login('401');
  const pattern = profiles.avatar(user.profile);
  assert.equal(pattern.type, 'image/svg+xml'); assert.match(String(pattern.body), /^<svg[^>]+viewBox="0 0 96 96"/);
  assert.equal(String(profiles.avatar(user.profile).body), String(pattern.body), 'the same pattern each time');
  const own = await profiles.setAvatar('401', 'custom', await png(400, 300));
  assert.equal(own.avatarMode, 'custom'); assert.match(own.avatar, /\?v=[0-9a-f]{12}$/);
  const picture = profiles.avatar(user.profile);
  assert.equal(picture.type, 'image/webp');
  const image = await loadImage(Buffer.from(picture.body)); assert.equal(image.width, 256); assert.equal(image.height, 256);
  await assert.rejects(profiles.setAvatar('401', 'custom', new TextEncoder().encode('not a picture')), (e) => e.status === 415);
  await assert.rejects(profiles.setAvatar('401', 'custom', null), (e) => e.status === 400);
  await assert.rejects(profiles.setAvatar('401', 'telegram'), (e) => e.status === 409, 'no photo was taken at sign-in');
  await assert.rejects(profiles.setAvatar('401', 'other'), (e) => e.status === 400);
  assert.equal((await profiles.setAvatar('401', 'pattern')).avatar, `/api/catalog/profiles/${user.profile}/avatar?v=p`);
  assert.equal(profiles.avatar(user.profile).type, 'image/svg+xml');
  assert.throws(() => profiles.byKey('nope'), (e) => e.status === 404);
});

test('a signed-in author’s grid is signed by the profile, with «по мотивам»; the search finds the nickname', async (t) => {
  const { store, profiles, login } = await fixture(t);
  login('501');
  const signed = store.save({ title: 'Сетка', author: 'Подпись', credit: 'Оригинал Васи', tags: ['Аниме'], grid: grid(10) }, identity(1), null, null, null, '501');
  const guest = store.save({ title: 'Гостевая', author: 'Гость', tags: ['Аниме'], grid: grid(20) }, identity(2));
  for (const work of [signed, guest]) store.moderate(work.id, { action: 'approve', revision: work.revision });
  const item = store.publicItem(signed.id);
  assert.equal(item.author, '', 'no signature of their own');
  assert.equal(item.credit, 'Оригинал Васи');
  assert.deepEqual(item.creator, profiles.creator('501'));
  assert.equal(store.publicItem(guest.id).author, 'Гость'); assert.equal(store.publicItem(guest.id).creator, undefined);
  profiles.update('501', { nickname: 'Квортеро' });
  assert.equal(store.publicItem(signed.id).creator.name, 'Квортеро', 'a new nickname shows everywhere at once');
  assert.deepEqual(store.list({ query: 'квор' }).items.map((work) => work.id), [signed.id]);
  assert.deepEqual(store.moderation('published', 0, 'квор').items.map((work) => work.id), [signed.id], 'the admin queue too');
  // An admin's correction keeps the profile as the author and changes only the credit.
  const fixed = store.moderate(signed.id, { action: 'edit', revision: item.revision, title: 'Сетка 2', author: 'Чужой', credit: '', tags: ['Аниме'] });
  assert.equal(fixed.author, ''); assert.equal(fixed.credit, '');
});

test('over HTTP: one’s own profile and its settings, the public page with works and likes, the avatar', async (t) => {
  const [{ CatalogStore }, , , { createCatalogAPI }] = await modules;
  const store = new CatalogStore(':memory:', 'test-profiles-http');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-profiles-http', admins: new Set(['900000009']), database: ':memory:' };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const signIn = (id) => { const r = accounts.begin(`ip-${id}`, `browser-${id}`); accounts.candidate(r.id, from(id)); accounts.approve(r.id, Number(id), true); return accounts.finish(r.id, r.verifier, id).session; };
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const as = (session) => async (path, method = 'GET', body) => {
    const raw = body instanceof Uint8Array;
    const response = await fetch(base + path, { method, headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json', Origin: config.origin,
      Cookie: session ? `gs_account=${session}` : '' }, ...(body ? { body: raw ? body : JSON.stringify(body) } : {}) });
    const type = response.headers.get('content-type') || '';
    return { status: response.status, headers: response.headers, body: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
  };
  const author = as(signIn('601')), fan = as(signIn('602')), guest = as(null);
  assert.equal((await guest('/profile')).status, 401);
  assert.equal((await guest('/profile', 'PATCH', { bio: 'x' })).status, 401);
  const mine = (await author('/profile')).body;
  assert.equal(mine.username, 'user_601'); assert.equal(mine.avatarMode, 'pattern'); assert.equal(mine.nicknameAt, 0);
  const saved = await author('/profile', 'PATCH', { nickname: 'Квортеро', bio: 'Сетки и фоны', telegram: true });
  assert.equal(saved.status, 200); assert.equal(saved.body.nickname, 'Квортеро');
  assert.equal((await author('/profile', 'PATCH', { nickname: 'Снова' })).status, 429);
  assert.equal((await fan('/profile', 'PATCH', { nickname: 'квортеро' })).status, 409);
  assert.equal((await author('/auth/me')).body.user.nickname, 'Квортеро');
  // A picture of one's own, sent as it is.
  const uploaded = await author('/profile/avatar', 'PUT', await png(300, 300, '#335577'));
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body)); assert.equal(uploaded.body.avatarMode, 'custom');
  const picture = await guest(uploaded.body.avatar.replace('/api/catalog', ''));
  assert.equal(picture.status, 200); assert.equal(picture.headers.get('content-type'), 'image/webp');
  assert.match(picture.headers.get('cache-control'), /immutable/);
  assert.equal((await author('/profile/avatar', 'POST', { mode: 'telegram' })).status, 409);
  assert.equal((await author('/profile/avatar', 'POST', { mode: 'pattern' })).body.avatarMode, 'pattern');
  // A published grid and a like from someone else.
  const work = store.save({ title: 'Сетка', author: '', tags: ['Аниме'], grid: grid(10) }, identity(1), null, null, null, '601');
  store.moderate(work.id, { action: 'approve', revision: work.revision });
  store.like(work.id, '602', true);
  const page = await fan(`/profiles/${mine.key}`);
  assert.equal(page.status, 200);
  assert.equal(page.body.nickname, 'Квортеро'); assert.equal(page.body.bio, 'Сетки и фоны'); assert.equal(page.body.telegram, '@user_601');
  assert.equal(page.body.mine, false);
  assert.deepEqual(page.body.stats, { grids: 1, backgrounds: 0, guides: 0, likes: 1 });
  assert.equal(page.body.grids[0].id, work.id); assert.equal(page.body.grids[0].liked, true); assert.equal(page.body.grids[0].grid, undefined, 'no grids in the list');
  assert.deepEqual(page.body.backgrounds, []); assert.deepEqual(page.body.guides, []);
  assert.equal((await author(`/profiles/${mine.key}`)).body.mine, true);
  assert.equal((await guest('/profiles/xxxxxxxxxxxx')).status, 404);
  // «Понравилось»: what one liked, newest first, only for oneself; hidden or deleted works drop out.
  const other = store.save({ title: 'Вторая', author: 'Гость', tags: ['Аниме'], grid: grid(30) }, identity(2));
  store.moderate(other.id, { action: 'approve', revision: other.revision });
  store.like(other.id, '602', true);
  assert.equal((await guest('/profile/likes')).status, 401);
  const likes = await fan('/profile/likes');
  assert.equal(likes.status, 200); assert.equal(likes.headers.get('cache-control'), 'no-store');
  assert.deepEqual(likes.body.grids.map((item) => item.id), [other.id, work.id]);
  assert.ok(likes.body.grids.every((item) => item.liked && item.grid === undefined));
  assert.deepEqual(likes.body.backgrounds, []); assert.deepEqual(likes.body.guides, []);
  assert.deepEqual((await author('/profile/likes')).body.grids, [], 'someone else’s likes are not shown');
  store.moderate(other.id, { action: 'block', revision: other.revision, reason: 'тест' });
  assert.deepEqual((await fan('/profile/likes')).body.grids.map((item) => item.id), [work.id]);
  // Badges: an admin gives them on the profile, «Журнал» records it; likes give their own.
  const admin = as(signIn('900000009'));
  assert.deepEqual(page.body.badges, [], 'one like is no badge yet');
  assert.equal((await author(`/admin/profiles/${mine.key}/badges`, 'POST', { badge: 'developer', on: true })).status, 403, 'not for the owner');
  assert.equal((await admin(`/admin/profiles/${mine.key}/badges`, 'POST', { badge: 'likes100', on: true })).status, 400, 'like badges are not given by hand');
  assert.equal((await admin(`/admin/profiles/${mine.key}/badges`, 'POST', { badge: 'nope', on: true })).status, 400);
  assert.deepEqual((await admin(`/admin/profiles/${mine.key}/badges`, 'POST', { badge: 'sponsor', on: true })).body.badges, ['sponsor']);
  assert.deepEqual((await admin(`/admin/profiles/${mine.key}/badges`, 'POST', { badge: 'developer', on: true })).body.badges, ['developer', 'sponsor'], 'in the list’s order');
  assert.deepEqual((await admin(`/admin/profiles/${mine.key}/badges`, 'POST', { badge: 'developer', on: true })).body.badges, ['developer', 'sponsor'], 'twice is once');
  assert.deepEqual((await guest(`/profiles/${mine.key}`)).body.badges, ['developer', 'sponsor']);
  assert.deepEqual((await admin(`/admin/profiles/${mine.key}/badges`, 'POST', { badge: 'sponsor', on: false })).body.badges, ['developer']);
  // The badges show by the name on the author's cards too.
  assert.deepEqual((await guest(`/works/${work.id}`)).body.creator.badges, ['developer']);
  // Following from the profile: the bot will write about the creator's next new grid.
  assert.equal(page.body.followable, true); assert.equal(page.body.subscribed, false);
  assert.equal((await guest(`/profiles/${mine.key}/subscribe`, 'PUT', { subscribed: true })).status, 401);
  assert.equal((await author(`/profiles/${mine.key}/subscribe`, 'PUT', { subscribed: true })).status, 400, 'not oneself');
  assert.equal((await author(`/profiles/${mine.key}`)).body.followable, false);
  assert.deepEqual((await fan(`/profiles/${mine.key}/subscribe`, 'PUT', { subscribed: true })).body, { followable: true, subscribed: true });
  assert.equal((await fan(`/profiles/${mine.key}`)).body.subscribed, true);
  assert.equal((await fan(`/works/${work.id}`)).body.subscribed, true, 'the same subscription as on a grid’s page');
  const next = store.save({ title: 'Третья', author: '', tags: ['Аниме'], grid: grid(50) }, identity(1), null, null, null, '601');
  store.moderate(next.id, { action: 'approve', revision: next.revision });
  assert.equal(store.get('SELECT count(*) n FROM notifications WHERE account=? AND work=?', '602', next.id).n, 1);
  assert.equal((await fan(`/profiles/${mine.key}/subscribe`, 'PUT', { subscribed: false })).body.subscribed, false);
  const journal = (await admin('/admin/journal')).body.items.filter((item) => item.kind === 'profile');
  assert.deepEqual(journal.map((item) => item.label), ['Значок снят: Поддержавший', 'Значок выдан: Разработчик', 'Значок выдан: Поддержавший'], 'the repeated one is not recorded');
  assert.equal(journal[0].title, 'Квортеро'); assert.equal(journal[0].link, `workshop?creator=${mine.key}`);
  const svg = await guest(`/profiles/${mine.key}/avatar?v=p`);
  assert.equal(svg.headers.get('content-type'), 'image/svg+xml'); assert.match(svg.headers.get('content-security-policy') || '', /default-src 'none'/);
});

test('badges: the given ones in order, then only the highest like badge reached', async () => {
  const { profileBadges, GRANTED_BADGES, BADGES } = await import('../scripts/profile-badges.mjs');
  assert.deepEqual(GRANTED_BADGES, ['developer', 'bughunter', 'idea', 'sponsor']);
  assert.ok(BADGES.every((badge) => badge.label && badge.hint && badge.icon));
  assert.deepEqual(profileBadges(['sponsor', 'developer', 'likes500', 'other'], 0), ['developer', 'sponsor'], 'stored like badges or strangers do not count');
  assert.deepEqual(profileBadges([], 99), []);
  assert.deepEqual(profileBadges([], 100), ['likes100']);
  assert.deepEqual(profileBadges(['idea'], 1200), ['idea', 'likes500']);
});

test('the bot writes once when an admin gives a badge, not when it was taken back before', async (t) => {
  const { store, profiles, login } = await fixture(t);
  const { CatalogTelegram } = await import('../server/catalog-telegram.mjs');
  const sent = [];
  const worker = new CatalogTelegram(store, { chatId: '-1004309207941', topicId: 6, origin: 'https://gridstudio.me', local: false },
    { sendMessage: async (message) => { sent.push(message); return { message_id: sent.length }; } }, { log: () => {} });
  const { user } = login('701');
  profiles.setBadge(user.profile, 'developer', true);
  profiles.setBadge(user.profile, 'idea', true); profiles.setBadge(user.profile, 'idea', false);
  await worker.deliverBadgeNotices(); await worker.deliverBadgeNotices();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chat_id, '701');
  assert.equal(sent[0].text, '🏅 На GridStudio тебе выдали значок <b>«Разработчик»</b>.\n\nДелает GridStudio. Значок виден в профиле рядом с ником.');
  assert.deepEqual(sent[0].reply_markup.inline_keyboard, [[{ text: 'Открыть профиль', url: `https://gridstudio.me/workshop?creator=${user.profile}` }]]);
  assert.equal(store.get("SELECT state FROM badge_notices WHERE badge='idea'").state, 'dropped');
  // Taken back and given again: no second message.
  profiles.setBadge(user.profile, 'developer', false); profiles.setBadge(user.profile, 'developer', true);
  await worker.deliverBadgeNotices();
  assert.equal(sent.length, 1);
});

test('profile description: only Telegram, TikTok and YouTube links become links', async () => {
  const { bioParts } = await import('../scripts/profile-links.mjs');
  const links = (text) => bioParts(text).filter((part) => part.href).map((part) => [part.text, part.href]);
  assert.deepEqual(links('Мой тг: t.me/linsissya, ютуб — https://www.youtube.com/@linsis!'),
    [['t.me/linsissya', 'https://t.me/linsissya'], ['https://www.youtube.com/@linsis', 'https://www.youtube.com/@linsis']]);
  assert.deepEqual(links('tiktok: https://vm.tiktok.com/ZMabc123/ и youtu.be/dQw4w9WgXcQ?t=10)'),
    [['https://vm.tiktok.com/ZMabc123/', 'https://vm.tiktok.com/ZMabc123/'], ['youtu.be/dQw4w9WgXcQ?t=10', 'https://youtu.be/dQw4w9WgXcQ?t=10']]);
  assert.deepEqual(links('сайт https://evil.com/t.me и gridstudio.me'), [], 'other sites stay text');
  assert.deepEqual(links('me@t.me.ru, nott.me/x, http://t.me:8080/x, https://user:pass@t.me/x, javascript:alert(1)'), []);
  assert.deepEqual(links('T.ME/Upper'), [['T.ME/Upper', 'https://t.me/Upper']]);
  // The text around the links is kept whole.
  assert.equal(bioParts('a t.me/x b').map((part) => part.text).join(''), 'a t.me/x b');
});
