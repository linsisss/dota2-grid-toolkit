import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogStore, CatalogError, digest, equal, secret, fail } from './catalog-store.mjs';
import { CATALOG_TAGS, CATALOG_LIMITS, catalogText } from '../scripts/catalog-document.mjs';
import { Accounts, SESSION_AGE } from './accounts.mjs';
import { CatalogCaptcha } from './catalog-captcha.mjs';
import { SteamProfiles } from './steam-profile.mjs';
import { CatalogArts } from './catalog-arts.mjs';
import { ART_CATEGORIES, ART_LIMITS, artSubmission } from '../scripts/art-document.mjs';

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
  const moderationChat = env.CATALOG_TELEGRAM_CHAT_ID || '-1004309207941';
  const moderationTopic = Number(env.CATALOG_TELEGRAM_TOPIC_ID || 6);
  if (!/^-100\d+$/.test(moderationChat) || !Number.isSafeInteger(moderationTopic) || moderationTopic < 1) throw new Error('Неверный чат или топик модерации.');
  const botUsername = env.CATALOG_TELEGRAM_BOT_USERNAME || 'grid_studio_bot';
  if (!/^[A-Za-z0-9_]{5,32}$/.test(botUsername)) throw new Error('Неверное имя Telegram-бота.');
  return { development, origin, salt, admins: new Set(adminIds), botUsername, steamApiKey: env.STEAM_WEB_API_KEY || '',
    moderationUrl: `https://t.me/c/${moderationChat.slice(4)}/${moderationTopic}`,
    trustProxy: env.CATALOG_TRUST_PROXY === 'loopback', database: env.CATALOG_DB || '.catalog-data/catalog.sqlite' };
}
async function readJSON(request, limit = CATALOG_LIMITS.bytes) {
  if (!(request.headers['content-type'] || '').startsWith('application/json')) fail(415, 'Нужен Content-Type application/json.');
  if (Number(request.headers['content-length']) > limit) fail(413, `Файл больше ${limit / 1_000_000} МБ.`);
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > limit) fail(413, 'Файл слишком большой.'); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw 0; return value; }
  catch { fail(400, 'Не удалось прочитать JSON.'); }
}
export function createCatalogAPI(config, { store = new CatalogStore(config.database, config.salt), steamProfiles = new SteamProfiles({ apiKey: config.steamApiKey }) } = {}) {
  const accounts = new Accounts(store), arts = new CatalogArts(store);
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
      if (path === '/captcha/challenge' && method === 'GET') {
        if (request.headers['sec-fetch-site'] === 'cross-site' || (request.headers.origin && request.headers.origin !== config.origin)) fail(403, 'Проверка доступна только на GridStudio.');
        return send(200, await captcha.issue(identity, url.searchParams.get('action')));
      }
      if (path === '/config' && method === 'GET') return send(200, { captcha: 'altcha', development: config.development, paused: store.paused(), tags: CATALOG_TAGS, limits: CATALOG_LIMITS,
        artCategories: ART_CATEGORIES, artLimits: ART_LIMITS, moderationUrl: config.moderationUrl });
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
          if (operation === 'download') { response.setHeader('Content-Disposition', 'attachment; filename="hero_grid_config.json"'); return send(200, item.grid); }
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
          artsPending: store.get("SELECT count(*) n FROM arts WHERE status='pending'").n });
        if (path === '/admin/settings' && method === 'PATCH') { const body = await readJSON(request); if (typeof body.paused !== 'boolean') fail(400, 'Неверная настройка.'); store.setPaused(body.paused, actor); return send(200, { paused: store.paused() }); }
        if (path === '/admin/arts' && method === 'GET') return send(200, arts.moderation(url.searchParams.get('filter'), Math.max(0, Math.min(1000, Number(url.searchParams.get('page')) || 0)) | 0));
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
