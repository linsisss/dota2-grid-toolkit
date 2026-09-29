import { createServer } from 'node:http';
import { createHash, createHmac } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogStore, CatalogError, digest, equal, secret, fail } from './catalog-store.mjs';
import { CATALOG_TAGS, CATALOG_LIMITS, catalogText } from '../scripts/catalog-document.mjs';
import { Accounts, SESSION_AGE } from './accounts.mjs';
import { CatalogCaptcha } from './catalog-captcha.mjs';
import { SteamProfiles } from './steam-profile.mjs';
import { CatalogArts } from './catalog-arts.mjs';
import { ART_CATEGORIES, ART_LIMITS, artSubmission } from '../scripts/art-document.mjs';
import { CatalogBackgrounds } from './catalog-backgrounds.mjs';
import { StudioBackgrounds } from './studio-backgrounds.mjs';
import { pickSafeGrid } from './catalog-preview.mjs';
import { BACKGROUND_TAGS, BACKGROUND_LIMITS, backgroundMeta, unpackBackgroundUpload } from '../scripts/background-document.mjs';

const cookies = (request) => Object.fromEntries((request.headers.cookie || '').split(';').map(pair => {
  const at = pair.indexOf('='); return at < 0 ? ['', ''] : [pair.slice(0, at).trim(), pair.slice(at + 1)];
}));
const local = (host) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
export function catalogConfig(env = process.env) {
  const development = env.CATALOG_DEV === '1';
  const origin = env.CATALOG_ORIGIN || (development ? 'http://127.0.0.1:4173' : 'https://gridstudio.me');
  const url = new URL(origin);
  if (url.origin !== origin || (development ? !local(url.hostname) : url.protocol !== 'https:')) throw new Error('CATALOG_ORIGIN должен быть HTTPS origin; локальный режим разрешён только на loopback.');
  let salt = env.CATALOG_SECRET;
  if (!salt && development) {
    mkdirSync('.catalog-data', { recursive: true });
    const path = '.catalog-data/local-secret';
    if (!existsSync(path)) writeFileSync(path, secret(), { mode: 0o600, flag: 'wx' });
    salt = readFileSync(path, 'utf8').trim();
  }
  if (!salt || salt.length < 32) throw new Error('Задай CATALOG_SECRET длиной от 32 символов.');
  // The site admin panel opens only for these Telegram accounts (signed in through the bot).
  // There is no password fallback; without the list nobody gets in.
  const adminIds = String(env.CATALOG_ADMIN_TELEGRAM_IDS || '').split(/[\s,]+/).filter(Boolean);
  if (adminIds.some(id => !/^[1-9]\d{0,15}$/.test(id))) throw new Error('CATALOG_ADMIN_TELEGRAM_IDS: укажи числовые Telegram ID через запятую.');
  // Trusted authors whose Telegram accounts have no daily publication limit (the network limit stays).
  const unlimitedIds = String(env.CATALOG_UNLIMITED_TELEGRAM_IDS || '').split(/[\s,]+/).filter(Boolean);
  if (unlimitedIds.some(id => !/^[1-9]\d{0,15}$/.test(id))) throw new Error('CATALOG_UNLIMITED_TELEGRAM_IDS: укажи числовые Telegram ID через запятую.');
  const moderationChat = env.CATALOG_TELEGRAM_CHAT_ID || '-1004309207941';
  const moderationTopic = Number(env.CATALOG_TELEGRAM_TOPIC_ID || 6);
  if (!/^-100\d+$/.test(moderationChat) || !Number.isSafeInteger(moderationTopic) || moderationTopic < 1) throw new Error('Неверный чат или топик модерации.');
  const botUsername = env.CATALOG_TELEGRAM_BOT_USERNAME || 'grid_studio_bot';
  if (!/^[A-Za-z0-9_]{5,32}$/.test(botUsername)) throw new Error('Неверное имя Telegram-бота.');
  return { development, origin, salt, admins: new Set(adminIds), unlimited: new Set(unlimitedIds), botUsername, steamApiKey: env.STEAM_WEB_API_KEY || '',
    moderationUrl: `https://t.me/c/${moderationChat.slice(4)}/${moderationTopic}`,
    trustProxy: env.CATALOG_TRUST_PROXY === 'loopback', database: env.CATALOG_DB || '.catalog-data/catalog.sqlite',
    // Shared menu backgrounds' files, next to the database unless set.
    media: env.CATALOG_MEDIA || join(dirname(env.CATALOG_DB || '.catalog-data/catalog.sqlite'), 'backgrounds') };
}
async function readJSON(request, limit = CATALOG_LIMITS.bytes) {
  if (!(request.headers['content-type'] || '').startsWith('application/json')) fail(415, 'Нужен Content-Type application/json.');
  if (Number(request.headers['content-length']) > limit) fail(413, `Файл больше ${limit / 1_000_000} МБ.`);
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > limit) fail(413, 'Файл слишком большой.'); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw 0; return value; }
  catch { fail(400, 'Не удалось прочитать JSON.'); }
}
// A raw upload (a shared menu background), bounded like JSON bodies.
async function readBytes(request, limit) {
  if (Number(request.headers['content-length']) > limit) fail(413, `Файл больше ${Math.floor(limit / 1_000_000)} МБ.`);
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > limit) fail(413, `Файл больше ${Math.floor(limit / 1_000_000)} МБ.`); chunks.push(chunk); }
  return new Uint8Array(Buffer.concat(chunks));
}
// Sends a file with Range support, so <video> can seek in a shared background.
function sendFile(request, response, { path, size }, type, cache) {
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || '');
  let start = 0, end = size - 1;
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (start > end || start >= size) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }); return response.end(); }
  }
  response.writeHead(range ? 206 : 200, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': cache,
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
  createReadStream(path, { start, end }).pipe(response);
}
// The landing's picture sizes (server/editor-showcase.mjs SHOWCASE_WIDTHS), kept here so the API
// module does not load the canvas renderer until a picture is asked for.
const LANDING_WIDTHS = [1440, 2160, 2880];
export function createCatalogAPI(config, { store = new CatalogStore(config.database, config.salt), steamProfiles = new SteamProfiles({ apiKey: config.steamApiKey }), backgrounds = null } = {}) {
  const accounts = new Accounts(store), arts = new CatalogArts(store);
  // Shared menu backgrounds keep files next to the database (config.media).
  let galleries = backgrounds;
  const gallery = () => (galleries ||= new CatalogBackgrounds(store, { dir: config.media || mkdtempSync(join(tmpdir(), 'gridstudio-backgrounds-')) }));
  store.unlimited = config.unlimited || new Set();
  let studios = null;
  const studio = () => (studios ||= new StudioBackgrounds(store));
  // Landing pictures (the grid opened in the editor) by work revision, up to 24 grids (~0.4 MB each
  // for all sizes); the renderer loads on first use.
  const landingImages = new Map();
  // The editor captures behind the picture (assets/landing, scripts/capture-editor-template.cjs) go
  // into its address, so browsers that kept a picture for a day fetch a new one after a recapture.
  let landingVersion = '';
  const captures = () => (landingVersion ||= ['editor-template.webp', 'editor-rows.webp', 'editor-template.json']
    .reduce((hash, name) => hash.update(readFileSync(new URL(`../assets/landing/${name}`, import.meta.url))), createHash('sha1')).digest('hex').slice(0, 10));
  const landingImage = (item) => {
    const key = `${item.id}:${item.revision}`;
    if (!landingImages.has(key)) {
      const rendering = import('./editor-showcase.mjs').then(({ renderEditorShowcase }) => renderEditorShowcase(item.grid, LANDING_WIDTHS));
      rendering.catch(() => landingImages.delete(key));
      landingImages.set(key, rendering);
      if (landingImages.size > 24) landingImages.delete(landingImages.keys().next().value);
    }
    return landingImages.get(key);
  };
  const captcha = new CatalogCaptcha(store, config.salt);
  const signature = (value) => createHmac('sha256', config.salt).update(value).digest('base64url');
  const cookie = (name, value, age) => `${name}=${value}; Path=/api/catalog; HttpOnly; SameSite=Strict; Max-Age=${age}${config.development ? '' : '; Secure'}`;
  const token = request => /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization || '')?.[1] || '';
  const isAdmin = user => !!user && !!config.admins?.has(String(user.id));
  const handler = async (request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer'); response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const send = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(body)); };
    try {
      const url = new URL(request.url, config.origin), path = url.pathname.replace(/^\/api\/catalog/, '');
      const method = request.method;
      if (!url.pathname.startsWith('/api/catalog/')) fail(404, 'Не найдено.');
      const remote = request.socket.remoteAddress || '';
      const forwarded = config.trustProxy && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote);
      const ip = forwarded ? String(request.headers['x-forwarded-for'] || remote).split(',').at(-1).trim() : remote;
      const ipHash = store.identity('ip', ip);
      if (!['GET','HEAD'].includes(method)) {
        if (request.headers.origin !== config.origin || request.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Отправка разрешена только с сайта GridStudio.');
        store.rate(`http:${ipHash}`, 90, 60_000);
      } else store.burst(`read:${ipHash}`, 600, 60_000);
      let browser = cookies(request).gs_catalog_browser || '';
      const [value, proof] = browser.split('.');
      if (!value || !proof || value.length !== 43 || !equal(proof, signature(value))) {
        browser = secret(); response.setHeader('Set-Cookie', cookie('gs_catalog_browser', `${browser}.${signature(browser)}`, 365 * 86400));
      } else browser = value;
      const identity = { browser: store.identity('browser', browser), ip: ipHash };
      const session = cookies(request).gs_account, user = accounts.user(session);
      const requireUser = () => accounts.require(session);
      // Checked on every admin request against the live Telegram session, never cached.
      const requireAdmin = () => {
        const member = accounts.user(session);
        if (!member) fail(401, 'Войди через Telegram, чтобы открыть админку.');
        if (!isAdmin(member)) fail(403, 'Админка доступна только администраторам GridStudio.');
        return member;
      };
      const setCookie = value => response.appendHeader('Set-Cookie', value);
      const loginCookie = () => {
        const [id, verifier] = (cookies(request).gs_login || '').split('.');
        if (!id || !verifier) fail(401, 'Начни вход в этом браузере.');
        return { id, verifier };
      };
      if (path === '/auth/me' && method === 'GET') return send(200, { user, admin: isAdmin(user) });
      if (path === '/steam/resolve' && method === 'GET') {
        store.rate(`steam:${ipHash}`, 20, 60_000);
        store.rate('steam:global', 300, 60_000);
        return send(200, await steamProfiles.resolve(url.searchParams.get('profile')));
      }
      if (path === '/auth/avatar' && method === 'GET') {
        const photo = accounts.avatar(requireUser());
        if (!photo) fail(404, 'Фото профиля недоступно.');
        response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': photo.length });
        return response.end(photo);
      }
      if (path === '/auth/start' && method === 'POST') {
        const login = accounts.begin(ipHash, identity.browser);
        setCookie(cookie('gs_login', `${login.id}.${login.verifier}`, 300));
        return send(201, { id: login.id, expires: login.expires, url: `https://t.me/${config.botUsername || 'grid_studio_bot'}?start=login_${login.id}` });
      }
      if (path === '/auth/status' && method === 'GET') {
        const login = loginCookie(); if (url.searchParams.get('id') !== login.id) fail(409, 'В другой вкладке начат новый вход. Начни заново.');
        return send(200, accounts.poll(login.id, login.verifier));
      }
      if (path === '/auth/finish' && method === 'POST') {
        const login = loginCookie(), body = await readJSON(request);
        if (body.id !== login.id) fail(409, 'Попытка входа изменилась.');
        const result = accounts.finish(login.id, login.verifier, body.userId, session);
        setCookie(cookie('gs_account', result.session, SESSION_AGE)); setCookie(cookie('gs_login', '', 0));
        return send(200, { user: result.user });
      }
      if (path === '/auth/logout' && method === 'POST') { accounts.logout(session); setCookie(cookie('gs_account', '', 0)); return send(200, { user: null }); }
      if (path === '/mine' && method === 'GET') return send(200, { items: accounts.publications(requireUser()) });
      if (path === '/spaces' && method === 'GET') return send(200, { items: accounts.listSpaces(requireUser(), url.searchParams.get('archived') === '1') });
      const spaceMatch = /^\/spaces\/([a-f0-9-]{36})$/.exec(path);
      if (spaceMatch) {
        const member = requireUser(), id = spaceMatch[1];
        if (method === 'GET') return send(200, accounts.space(id, member));
        if (method === 'PUT') { const body = await readJSON(request, 8_500_000); return send(200, accounts.saveSpace(id, member, body)); }
        if (method === 'PATCH') { const body = await readJSON(request); if (typeof body.archived !== 'boolean') fail(400, 'Неверная настройка архива.'); return send(200, accounts.archiveSpace(id, member, body.revision, body.archived)); }
      }
      // «Студия» backgrounds of the signed-in account: recipes and posters only (server/studio-backgrounds.mjs).
      if (path === '/studio/backgrounds' && method === 'GET') return send(200, { items: studio().list(requireUser()) });
      const studioMatch = /^\/studio\/backgrounds\/([a-f0-9-]{36})(\/poster\.jpg)?$/.exec(path);
      if (studioMatch) {
        const member = requireUser(), id = studioMatch[1];
        if (studioMatch[2] && method === 'GET') {
          const image = studio().poster(member, id);
          response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': image.length, 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff' });
          return response.end(image);
        }
        if (!studioMatch[2] && method === 'PUT') return send(200, studio().save(member, id, await readJSON(request, 120_000)));
        if (!studioMatch[2] && method === 'DELETE') return send(200, studio().remove(member, id));
      }
      if (path === '/captcha/challenge' && method === 'GET') {
        if (request.headers['sec-fetch-site'] === 'cross-site' || (request.headers.origin && request.headers.origin !== config.origin)) fail(403, 'Проверка доступна только на GridStudio.');
        return send(200, await captcha.issue(identity, url.searchParams.get('action')));
      }
      if (path === '/config' && method === 'GET') return send(200, { captcha: 'altcha', development: config.development, paused: store.paused(), tags: CATALOG_TAGS, limits: CATALOG_LIMITS,
        artCategories: ART_CATEGORIES, artLimits: ART_LIMITS, backgroundTags: BACKGROUND_TAGS, backgroundLimits: BACKGROUND_LIMITS, moderationUrl: config.moderationUrl });
      if (path === '/arts' && method === 'GET') {
        const library = arts.library(), tag = `"arts-${library.version}"`;
        response.setHeader('Cache-Control', 'no-cache'); response.setHeader('ETag', tag);
        if (request.headers['if-none-match'] === tag) { response.writeHead(304); return response.end(); }
        return send(200, { items: library.load() });
      }
      if (path === '/arts' && method === 'POST') {
        const body = await readJSON(request, 200_000);
        artSubmission(body); // Spare the captcha when the art itself is not accepted.
        await captcha.verify(body.captcha, identity, 'art');
        return send(201, arts.submit(body, identity, user?.id));
      }
      // Shared menu backgrounds (the workshop's «Фоны», docs/customize.md).
      if (path === '/backgrounds' && method === 'GET') {
        const tag = url.searchParams.get('tag') || '', query = (url.searchParams.get('q') || '').trim().slice(0, 80);
        if (tag && !BACKGROUND_TAGS.includes(tag)) fail(400, 'Неизвестный тег.');
        return send(200, gallery().list({ query, tag, popular: url.searchParams.get('sort') === 'popular', account: user?.id || null, page: Math.min(1000, Math.max(0, Number(url.searchParams.get('page')) || 0)) | 0 }));
      }
      if (path === '/backgrounds' && method === 'POST') {
        const upload = unpackBackgroundUpload(await readBytes(request, BACKGROUND_LIMITS.video + BACKGROUND_LIMITS.poster + 8_000));
        backgroundMeta(upload.meta); // Spare the captcha when the form itself is wrong.
        await captcha.verify(upload.meta.captcha, identity, 'background');
        return send(201, await gallery().submit(upload.meta, upload.poster, upload.video, identity, user?.id));
      }
      // One background, for a link that opens it in the builder (the workshop's «Использовать»).
      const backgroundItem = /^\/backgrounds\/([1-9]\d{0,12})$/.exec(path);
      if (backgroundItem && method === 'GET') return send(200, gallery().item(Number(backgroundItem[1]), user?.id || null));
      // Likes (Telegram accounts) and reports (anyone, with the captcha) as for grids.
      const backgroundAction = /^\/backgrounds\/([1-9]\d{0,12})\/(like|report)$/.exec(path);
      if (backgroundAction && backgroundAction[2] === 'like' && method === 'PUT') {
        const member = requireUser(), body = await readJSON(request);
        if (typeof body.liked !== 'boolean') fail(400, 'Неверное значение лайка.');
        store.rate(`like:${member.id}`, 90, 60_000); return send(200, gallery().like(Number(backgroundAction[1]), member.id, body.liked));
      }
      if (backgroundAction && backgroundAction[2] === 'report' && method === 'POST') {
        const body = await readJSON(request), reason = catalogText(body.reason, 500, 'Причина жалобы', true);
        await captcha.verify(body.captcha, identity, 'report'); return send(200, gallery().report(Number(backgroundAction[1]), identity, reason));
      }
      // The author's view of a submission: pending, approved, rejected (with the reason) or hidden.
      const backgroundStatus = /^\/backgrounds\/([1-9]\d{0,12})\/status$/.exec(path);
      if (backgroundStatus && method === 'GET') { response.setHeader('Cache-Control', 'no-store'); return send(200, gallery().status(Number(backgroundStatus[1]), url.searchParams.get('token') || '')); }
      const backgroundFile = /^\/backgrounds\/([1-9]\d{0,12})\/(poster\.jpg|video\.webm)$/.exec(path);
      if (backgroundFile && ['GET', 'HEAD'].includes(method)) {
        const kind = backgroundFile[2] === 'poster.jpg' ? 'poster' : 'video';
        const file = gallery().media(Number(backgroundFile[1]), kind, isAdmin(user));
        // A background's files never change; pending ones stay private to admins.
        return sendFile(request, response, file, kind === 'poster' ? 'image/jpeg' : 'video/webm', file.public ? 'public, max-age=31536000, immutable' : 'private, no-store');
      }
      // The landing page's random well-liked grid. Never cached, so every visit draws again. The
      // picture is rendered only for grids that may be on the landing, once per revision.
      if (path === '/landing' && method === 'GET') {
        const item = store.landingWork(url.searchParams.get('except') || '');
        response.setHeader('Cache-Control', 'no-store');
        const src = (width) => `/api/catalog/landing.webp?id=${item.id}&revision=${item.revision}&w=${width}&v=${captures()}`;
        return send(200, { item: item && { id: item.id, revision: item.revision, title: item.title, author: item.author, likes: item.likes,
          image: src(LANDING_WIDTHS[0]), srcset: LANDING_WIDTHS.map((width) => `${src(width)} ${width}w`).join(', ') } });
      }
      if (path === '/landing.webp' && method === 'GET') {
        const id = url.searchParams.get('id') || '';
        if (!store.landingEligible(id)) fail(404, 'Этой сетки нет на главной.');
        const item = store.publicItem(id), width = Number(url.searchParams.get('w')) || LANDING_WIDTHS[0];
        if (!LANDING_WIDTHS.includes(width)) fail(400, 'Нет такого размера.');
        const image = (await landingImage(item)).get(width);
        response.writeHead(200, { 'Content-Type': 'image/webp', 'Content-Length': image.length,
          'Cache-Control': url.searchParams.get('revision') === String(item.revision) ? 'public, max-age=86400' : 'no-cache' });
        return response.end(image);
      }
      if (path === '/works' && method === 'GET') return send(200, store.list({ query: (url.searchParams.get('q') || '').slice(0, 80), tag: url.searchParams.get('tag') || '', popular: url.searchParams.get('sort') === 'popular', account: user?.id, page: Math.min(1000, Math.max(0, Number(url.searchParams.get('page')) || 0)) | 0 }));
      if (path === '/works' && method === 'POST') {
        const body = await readJSON(request);
        const receipt = store.receipt(body.requestId, body.managementToken, user?.id);
        if (receipt) return send(200, receipt);
        await captcha.verify(body.captcha, identity, 'submit');
        const concurrentReceipt = store.receipt(body.requestId, body.managementToken, user?.id);
        if (concurrentReceipt) return send(200, concurrentReceipt);
        return send(201, store.save(body, identity, null, null, null, user?.id));
      }
      const match = /^\/(works|manage)\/([0-9a-f-]{36})(?:\/(download|report|like|claim|grid|subscribe))?$/.exec(path);
      if (match) {
        const [, scope, id, operation] = match;
        if (scope === 'works' && operation === 'grid' && method === 'GET') {
          // A revision's grid never changes. A link to an outdated revision still gets the current grid, uncached.
          const { revision, grid } = store.publicGrid(id);
          if (url.searchParams.get('revision') === String(revision)) response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
          response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return response.end(grid);
        }
        if (scope === 'manage' && !operation) {
          if (method === 'GET') return send(200, store.ownerView(id, token(request), user?.id));
          if (method === 'DELETE') { store.remove(id, token(request), user?.id); return send(200, { deleted: true }); }
          if (method === 'PATCH') {
            const work = store.owned(id, token(request), user?.id);
            if (work.public_revision && (!user || work.account !== user.id)) fail(401, 'Для изменения опубликованной сетки войди через Telegram и привяжи её к аккаунту.');
            const body = await readJSON(request);
            await captcha.verify(body.captcha, identity, 'submit');
            return send(200, store.save(body, identity, id, token(request), body.revision, user?.id));
          }
        }
        if (scope === 'works' && method === 'GET') {
          const item = store.publicItem(id, user?.id);
          if (operation === 'download') { response.setHeader('Content-Disposition', 'attachment; filename="hero_grid_config.json"'); return send(200, pickSafeGrid(item.grid)); }
          if (!operation) return send(200, item);
        }
        if (scope === 'manage' && operation === 'claim' && method === 'POST') return send(200, accounts.claim(id, token(request), requireUser()));
        if (scope === 'works' && operation === 'like' && method === 'PUT') {
          const member = requireUser(), body = await readJSON(request);
          if (typeof body.liked !== 'boolean') fail(400, 'Неверное значение лайка.');
          store.rate(`like:${member.id}`, 90, 60_000); return send(200, store.like(id, member.id, body.liked));
        }
        if (scope === 'works' && operation === 'subscribe' && method === 'PUT') {
          const member = requireUser(), body = await readJSON(request);
          if (typeof body.subscribed !== 'boolean') fail(400, 'Неверное значение подписки.');
          store.rate(`subscribe:${member.id}`, 60, 60_000); return send(200, store.subscribe(member.id, id, body.subscribed));
        }
        if (scope === 'works' && operation === 'report' && method === 'POST') {
          const body = await readJSON(request), reason = catalogText(body.reason, 500, 'Причина жалобы', true);
          await captcha.verify(body.captcha, identity, 'report'); store.report(id, identity, reason);
          return send(200, { reported: true });
        }
      }
      if (path.startsWith('/admin/')) {
        const member = requireAdmin();
        // Recorded in the audit log and shown on the Telegram moderation card.
        const actor = JSON.stringify({ id: String(member.id), name: `${member.username ? `@${member.username}` : member.name} · сайт`.slice(0, 100) });
        if (path === '/admin/session' && method === 'GET') return send(200, { admin: true });
        if (path === '/admin/works' && method === 'GET') return send(200, { ...store.moderation(url.searchParams.get('filter'), Math.max(0, Math.min(1000, Number(url.searchParams.get('page')) || 0)) | 0),
          artsPending: store.get("SELECT count(*) n FROM arts WHERE status='pending'").n,
          backgroundsPending: (store.get("SELECT count(*) n FROM sqlite_master WHERE name='backgrounds'").n ? store.get("SELECT count(*) n FROM backgrounds WHERE status='pending'").n : 0)
            // Open reports on published backgrounds need a look too.
            + (store.get("SELECT count(*) n FROM sqlite_master WHERE name='background_reports'").n ? store.get("SELECT count(DISTINCT p.background) n FROM background_reports p JOIN backgrounds b ON b.id=p.background WHERE p.resolved=0 AND b.status='approved'").n : 0) });
        if (path === '/admin/settings' && method === 'PATCH') { const body = await readJSON(request); if (typeof body.paused !== 'boolean') fail(400, 'Неверная настройка.'); store.setPaused(body.paused, actor); return send(200, { paused: store.paused() }); }
        if (path === '/admin/arts' && method === 'GET') return send(200, arts.moderation(url.searchParams.get('filter'), Math.max(0, Math.min(1000, Number(url.searchParams.get('page')) || 0)) | 0));
        if (path === '/admin/backgrounds' && method === 'GET') return send(200, gallery().moderation(url.searchParams.get('filter'), Math.max(0, Math.min(1000, Number(url.searchParams.get('page')) || 0)) | 0));
        const backgroundReview = /^\/admin\/backgrounds\/([1-9]\d{0,12})$/.exec(path);
        if (backgroundReview && method === 'POST') { const body = await readJSON(request); body.reason = catalogText(body.reason ?? '', 500, 'Причина'); const result = gallery().moderate(Number(backgroundReview[1]), body, { actor }); return send(200, { reviewed: true, ...result }); }
        const artReview = /^\/admin\/arts\/([1-9]\d{0,12})$/.exec(path);
        if (artReview && method === 'POST') { const body = await readJSON(request); body.reason = catalogText(body.reason ?? '', 500, 'Причина'); const result = arts.moderate(Number(artReview[1]), body, { actor }); return send(200, { reviewed: true, ...result }); }
        const review = /^\/admin\/works\/([0-9a-f-]{36})$/.exec(path);
        if (review && method === 'POST') { const body = await readJSON(request); body.reason = catalogText(body.reason ?? '', 500, 'Причина'); const result = store.moderate(review[1], body, { actor }); return send(200, { reviewed: true, ...(body.action === 'edit' ? result : {}) }); }
      }
      fail(404, 'Не найдено.');
    } catch (error) {
      const status = error instanceof CatalogError || error.status === 400 ? error.status : 500;
      if (error.extra?.retryAfter) response.setHeader('Retry-After', error.extra.retryAfter);
      send(status, { error: status === 500 ? 'Не удалось сохранить данные. Попробуй ещё раз.' : error.message, ...(error.extra || {}) });
    }
  };
  const server = createServer(handler); server.requestTimeout = 15000; server.headersTimeout = 10000;
  return { server, store, accounts, handler };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = catalogConfig();
  const { server, store } = createCatalogAPI(config);
  const port = Number(process.env.CATALOG_PORT || 4174);
  server.listen(port, '127.0.0.1', () => console.log(`Catalog API: http://127.0.0.1:${port} (${config.development ? 'local testing; ALTCHA enabled' : 'production'})`));
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => server.close(() => { store.close(); process.exit(0); }));
}
