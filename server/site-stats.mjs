// The site's statistics for «Админка → Статистика» (asked for on 2026-10-03: visits, sign-ups,
// downloads, activity — «полную по сайту»). Visits and the actions no table keeps come from the pages
// (POST /api/catalog/hit, src/site-stats.js): the page shown, once per load, and an action done; the bot
// and the API add sign-ins and «Студия» saves. Everything else is read from the tables that already keep
// it (profiles, downloads, installs, works, backgrounds, guides, arts, likes, comments, subscriptions,
// audit). A visitor is the HMAC of the page's own random id (src/site-stats.js), else of the browser
// cookie — no IP; a signed-in visitor's account is kept for «вошедших». Days are Moscow days (UTC+3); a
// visit or an action is one row per day, page and visitor, so «просмотры» add up and «посетители» are
// distinct. Rows older than KEEP_DAYS go. The report is cached for a minute; `live` (who is here now,
// today's numbers, the last hour minute by minute) is for polling every few seconds. Where a new account
// came from (`signup`, asked for on 2026-10-03: «откуда зарегался юзер, что его привело») is kept once,
// when it first signs in: the other site of its first visit, the address' utm_* marks, its first page
// and the page it signed in on.
export const DAY = 86_400_000;
const MSK = 3 * 3_600_000, KEEP_DAYS = 400;
export const mskDay = (ms) => Math.floor((ms + MSK) / DAY);
export const STAT_PAGE = /^(?:home|editor|workshop|workshop:backgrounds|rules|background|font|guides|work:[0-9a-f-]{36}|guide:[A-Za-z0-9_-]{12}|profile:[A-Za-z0-9_-]{12}|dotadle|seo:(?:backgrounds|grids)(?:\/[a-z0-9-]{1,40})?)$/;
export const STAT_EVENTS = Object.freeze(['grid-export', 'background-pack', 'font-pack', 'login', 'studio-save', 'send-pc', 'dotadle-done']);
export const STAT_PERIODS = Object.freeze([7, 30, 90, 365]);
// User-Agents of robots, crawlers, link previews, monitors and scripts: their hits are not counted.
export const STAT_ROBOT = /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|phantom|puppeteer|playwright|selenium|python|curl|wget|httpclient|java\/|go-http|okhttp|axios|libwww|preview|scanner|monitor|uptime|facebookexternalhit|telegrambot|whatsapp|discordbot/i;
const PAGE_LABELS = { home: 'Главная', editor: 'Студия и редактор', workshop: 'Мастерская: сетки', 'workshop:backgrounds': 'Мастерская: фоны', rules: 'Правила мастерской',
  background: 'Фон главного меню', font: 'Шрифт', guides: 'Гайды', dotadle: 'Dotadle' };
// Where people come from: a site (its host, or the name in utm_source) as one of these; any other site
// is 'other' (its host kept), no site at all 'direct', an account from before 03.10.2026 'unknown'.
export const SOURCES = Object.freeze({ telegram: 'Telegram', tiktok: 'TikTok', youtube: 'YouTube', google: 'Google', yandex: 'Яндекс', vk: 'ВКонтакте', discord: 'Discord',
  twitch: 'Twitch', steam: 'Steam', reddit: 'Reddit', bing: 'Bing', duckduckgo: 'DuckDuckGo', other: 'Другой сайт', direct: 'Прямой заход', unknown: 'Неизвестно' });
const SOURCE_HOSTS = [[/(^|\.)(t\.me|telegram\.(org|me))$|^tg$|^telegram$/, 'telegram'], [/(^|\.)tiktok\.com$|^(tiktok|tt)$/, 'tiktok'], [/(^|\.)(youtube\.com|youtu\.be)$|^(youtube|yt)$/, 'youtube'],
  [/(^|\.)google\.[a-z.]+$|^google$/, 'google'], [/(^|\.)(yandex\.[a-z.]+|ya\.ru)$|^(yandex|ya)$/, 'yandex'], [/(^|\.)vk\.(com|ru)$|^(vk|vkontakte)$/, 'vk'],
  [/(^|\.)(discord\.(com|gg)|discordapp\.com)$|^discord$/, 'discord'], [/(^|\.)twitch\.tv$|^twitch$/, 'twitch'], [/(^|\.)(steamcommunity|steampowered)\.com$|^steam$/, 'steam'],
  [/(^|\.)reddit\.com$|^reddit$/, 'reddit'], [/(^|\.)bing\.com$|^bing$/, 'bing'], [/(^|\.)duckduckgo\.com$|^duckduckgo$/, 'duckduckgo']];
export function sourceOf(host) {
  const value = String(host || '').toLowerCase().replace(/^www\./, '');
  if (!value) return 'direct';
  return SOURCE_HOSTS.find(([pattern]) => pattern.test(value))?.[1] || 'other';
}
const cleanHost = (value) => { const host = String(value || '').toLowerCase().replace(/^www\./, '').slice(0, 80); return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : ''; };
const cleanMark = (value) => String(value || '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 60);

export class SiteStats {
  constructor(store, { live = true } = {}) {
    this.store = store; this.cache = new Map();
    store.db.exec(`CREATE TABLE IF NOT EXISTS visits(day INTEGER NOT NULL, page TEXT NOT NULL, visitor TEXT NOT NULL, account TEXT, views INTEGER NOT NULL DEFAULT 1,
        last INTEGER NOT NULL, mobile INTEGER NOT NULL DEFAULT 0, lang TEXT NOT NULL DEFAULT 'ru', referrer TEXT NOT NULL DEFAULT '', PRIMARY KEY(day, page, visitor));
      CREATE INDEX IF NOT EXISTS visits_last ON visits(last);
      CREATE INDEX IF NOT EXISTS visits_visitor ON visits(visitor, day);
      CREATE INDEX IF NOT EXISTS visits_account ON visits(account, last) WHERE account IS NOT NULL;
      CREATE TABLE IF NOT EXISTS stat_events(day INTEGER NOT NULL, name TEXT NOT NULL, visitor TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(day, name, visitor));
      CREATE TABLE IF NOT EXISTS signup_sources(account TEXT PRIMARY KEY, source TEXT NOT NULL, referrer TEXT NOT NULL DEFAULT '', landing TEXT NOT NULL DEFAULT '',
        signup TEXT NOT NULL DEFAULT '', utm TEXT NOT NULL DEFAULT '', first_seen INTEGER, created INTEGER NOT NULL);`);
    this.pruned = 0; this.minutes = [];
    // «Сейчас на сайте» minute by minute for the last hour (kept in memory; a restart starts it again).
    if (live) { this.timer = setInterval(() => this.sample(), 60_000); this.timer.unref?.(); }
  }
  sample(now = this.store.now()) {
    this.minutes.push({ at: now, online: this.online(now) });
    if (this.minutes.length > 60) this.minutes.shift();
  }
  online(now = this.store.now()) { return this.store.get('SELECT count(DISTINCT visitor) n FROM visits WHERE last>=?', now - 5 * 60_000).n; }
  // A new account's first sign-in: where it came from (src/site-stats.js signupSource: the first visit's
  // site, utm_* marks, first page and when, and the page it signed in on). Without the page's note, the
  // first visit of its browser on record. Kept once.
  signup(account, note = {}, visitor = null) {
    const store = this.store, now = store.now(), given = note && typeof note === 'object' ? note : {};
    let referrer = cleanHost(given.referrer), landing = STAT_PAGE.test(String(given.page || '')) ? String(given.page) : '';
    let firstSeen = Number.isSafeInteger(given.at) && given.at > now - 400 * DAY && given.at <= now ? given.at : null;
    if (!referrer && !landing && visitor) {
      const first = store.get('SELECT page, referrer, last FROM visits WHERE visitor=? ORDER BY day, last LIMIT 1', String(visitor));
      if (first) { referrer = first.referrer; landing = first.page; firstSeen = first.last; }
    }
    const utm = Object.fromEntries(['source', 'medium', 'campaign'].map((key) => [key, cleanMark(given.utm?.[key])]).filter(([, value]) => value));
    const source = utm.source ? sourceOf(utm.source) : referrer ? sourceOf(referrer) : landing ? 'direct' : 'unknown';
    store.run('INSERT OR IGNORE INTO signup_sources(account,source,referrer,landing,signup,utm,first_seen,created) VALUES(?,?,?,?,?,?,?,?)', String(account), source,
      referrer || (source === 'other' && utm.source ? cleanHost(utm.source) : ''), landing, STAT_PAGE.test(String(given.signup || '')) ? String(given.signup) : '',
      Object.keys(utm).length ? JSON.stringify(utm) : '', firstSeen, now);
  }
  has(name) { return !!this.store.get('SELECT 1 x FROM sqlite_master WHERE name=?', name); }
  // A page's words: a section's name, or a grid's, guide's or profile's title.
  itemTitle(kind, id) {
    const store = this.store;
    if (kind === 'work') return store.get('SELECT r.title FROM works w JOIN revisions r ON r.id=w.public_revision WHERE w.id=?', id)?.title;
    if (kind === 'guide') return this.has('guides') ? store.get('SELECT r.title FROM guides g JOIN guide_revisions r ON r.id=g.public_revision WHERE g.id=?', id)?.title : undefined;
    if (kind === 'profile') return store.get('SELECT nickname FROM profiles WHERE key=?', id)?.nickname;
    return undefined;
  }
  pageLabel(page) {
    if (!page) return '';
    if (PAGE_LABELS[page]) return PAGE_LABELS[page];
    const [kind, id] = String(page).split(':'), title = this.itemTitle(kind, id);
    return { work: `Сетка «${title || '—'}»`, guide: `Гайд «${title || '—'}»`, profile: `Профиль ${title || '—'}`, seo: `Страница для поиска /${id}` }[kind] || page;
  }
  // The period's numbers, days [start, end).
  kpi(start, end) {
    const store = this.store, since = (day) => day * DAY - MSK;
    const count = (table, column, where = '1=1') => (this.has(table) ? store.get(`SELECT count(*) n FROM ${table} WHERE ${column} >= ? AND ${column} < ? AND ${where}`, since(start), since(end)).n : 0);
    const events = (name) => store.get('SELECT coalesce(sum(count),0) n FROM stat_events WHERE name=? AND day>=? AND day<?', name, start, end).n;
    return {
      visitors: store.get('SELECT count(DISTINCT visitor) n FROM visits WHERE day>=? AND day<?', start, end).n,
      views: store.get('SELECT coalesce(sum(views),0) n FROM visits WHERE day>=? AND day<?', start, end).n,
      registrations: count('profiles', 'created'),
      downloads: (this.has('downloads') ? store.get('SELECT count(*) n FROM downloads WHERE day>=? AND day<?', start, end).n : 0) + events('grid-export') + events('background-pack') + events('font-pack'),
      installs: count('installs', 'created'),
      works: count('revisions', 'created') + count('backgrounds', 'created') + count('arts', 'created') + count('guides', 'published'),
      likes: count('likes', 'created') + count('background_likes', 'created') + count('guide_likes', 'created'),
      comments: count('guide_comments', 'created') + count('item_comments', 'created'),
    };
  }
  // For polling: who is here now and on which pages, today's numbers, the last hour minute by minute.
  live() {
    const store = this.store, now = store.now(), today = mskDay(now);
    const pages = store.all('SELECT page, count(DISTINCT visitor) visitors FROM visits WHERE last>=? GROUP BY page ORDER BY visitors DESC LIMIT 8', now - 5 * 60_000)
      .map((row) => ({ page: row.page, label: this.pageLabel(row.page), visitors: row.visitors }));
    const online = this.online(now);
    return { at: now, online, pages, today: this.kpi(today, today + 1), minutes: [...this.minutes.map(({ at, online }) => ({ at, online })), { at: now, online }] };
  }
  // A page shown. `referrer`: the host a visitor came from (another site's), `mobile`: a touch screen.
  // `ping`: the page is still open and shown (src/site-stats.js, every two minutes) — no view, only
  // «сейчас на сайте»; after midnight it starts the new day's row with no views.
  visit(page, visitor, { account = null, referrer = '', mobile = false, lang = 'ru', ping = false } = {}) {
    if (!STAT_PAGE.test(String(page)) || !visitor) return false;
    const host = String(referrer || '').toLowerCase().replace(/^www\./, '').slice(0, 80);
    const now = this.store.now();
    if (ping) {
      this.store.run(`INSERT INTO visits(day,page,visitor,account,views,last,mobile,lang) VALUES(?,?,?,?,0,?,?,?)
        ON CONFLICT(day,page,visitor) DO UPDATE SET last=excluded.last, account=coalesce(excluded.account, account)`,
        mskDay(now), page, String(visitor), account ? String(account) : null, now, mobile ? 1 : 0, lang === 'en' ? 'en' : 'ru');
      return true;
    }
    this.store.run(`INSERT INTO visits(day,page,visitor,account,last,mobile,lang,referrer) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(day,page,visitor) DO UPDATE SET views=views+1, last=excluded.last, account=coalesce(excluded.account, account),
        referrer=CASE WHEN referrer='' THEN excluded.referrer ELSE referrer END`,
      mskDay(now), page, String(visitor), account ? String(account) : null, now, mobile ? 1 : 0, lang === 'en' ? 'en' : 'ru', /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : '');
    this.prune(now);
    return true;
  }
  // An action: a grid saved from the editor, a background pack built, a font downloaded, a sign-in,
  // a «Студия» save. `who`: the browser's id, or the account for the server's own.
  event(name, who) {
    if (!STAT_EVENTS.includes(name) || !who) return false;
    this.store.run('INSERT INTO stat_events(day,name,visitor) VALUES(?,?,?) ON CONFLICT(day,name,visitor) DO UPDATE SET count=count+1', mskDay(this.store.now()), name, String(who));
    return true;
  }
  prune(now) {
    if (now - this.pruned < DAY) return;
    this.pruned = now;
    const before = mskDay(now) - KEEP_DAYS;
    this.store.run('DELETE FROM visits WHERE day<?', before); this.store.run('DELETE FROM stat_events WHERE day<?', before);
  }

  // The report for the last `days` days (today included), with the days before as the comparison.
  // For advertisers (the workshop's «Реклама», asked for on 2026-10-05): yesterday's and the day
  // before's visitors and views, the last 7 full days' devices and sources. Public, so nothing more;
  // worked out once in 10 minutes.
  audience() {
    const now = this.store.now();
    if (this.audienceCache && now - this.audienceCache.at < 600_000) return this.audienceCache.value;
    const store = this.store, today = mskDay(now), from = today - 7;
    const day = (d) => { const { visitors, views } = this.kpi(d, d + 1); return { day: d, date: d * DAY - MSK, visitors, views }; };
    const seen = store.get('SELECT count(DISTINCT visitor) n, count(DISTINCT CASE WHEN mobile=1 THEN visitor END) mobile FROM visits WHERE day>=? AND day<?', from, today);
    const sources = Object.entries(store.all('SELECT host, count(*) visitors FROM (SELECT max(referrer) host FROM visits WHERE day>=? AND day<? GROUP BY visitor) GROUP BY host', from, today)
      .reduce((sum, row) => { const key = row.host ? sourceOf(row.host) : 'direct'; sum[key] = (sum[key] || 0) + row.visitors; return sum; }, {}))
      .map(([source, visitors]) => ({ source, label: SOURCES[source], visitors })).sort((a, b) => b.visitors - a.visitors);
    const value = { generated: now, days: [day(today - 1), day(today - 2)],
      week: { visitors: seen.n, mobile: seen.mobile, desktop: seen.n - seen.mobile, sources } };
    this.audienceCache = { at: now, value };
    return value;
  }
  report(days = 30) {
    const span = STAT_PERIODS.includes(Number(days)) ? Number(days) : 30, now = this.store.now(), cached = this.cache.get(span);
    if (cached && now - cached.at < 60_000) return cached.value;
    const value = this.build(span, now);
    this.cache.set(span, { at: now, value });
    return value;
  }
  build(span, now) {
    const store = this.store, today = mskDay(now), from = today - span + 1, before = from - span;
    const has = (name) => !!store.get('SELECT 1 x FROM sqlite_master WHERE name=?', name);
    const sinceMs = (day) => day * DAY - MSK;
    const dayList = Array.from({ length: span }, (_, i) => from + i);
    // A per-day series from a query that returns rows { d, n }.
    const series = (rows) => { const map = new Map(rows.map((row) => [row.d, row.n])); return dayList.map((day) => map.get(day) || 0); };
    const byDay = (table, column, where = '1=1', ...args) => (has(table)
      ? store.all(`SELECT CAST((${column} + ${MSK}) / ${DAY} AS INTEGER) d, count(*) n FROM ${table} WHERE ${column} >= ? AND ${where} GROUP BY d`, sinceMs(from), ...args) : []);
    const merge = (...lists) => dayList.map((_, i) => lists.reduce((sum, list) => sum + list[i], 0));

    // Visits.
    const visitors = series(store.all('SELECT day d, count(DISTINCT visitor) n FROM visits WHERE day>=? GROUP BY day', from));
    const views = series(store.all('SELECT day d, sum(views) n FROM visits WHERE day>=? GROUP BY day', from));
    const members = series(store.all('SELECT day d, count(DISTINCT account) n FROM visits WHERE day>=? AND account IS NOT NULL GROUP BY day', from));
    const newVisitors = series(store.all('SELECT d, count(*) n FROM (SELECT min(day) d FROM visits GROUP BY visitor) WHERE d>=? GROUP BY d', from));
    const eventSeries = (name) => series(store.all('SELECT day d, sum(count) n FROM stat_events WHERE name=? AND day>=? GROUP BY day', name, from));
    const eventPeople = (name) => series(store.all('SELECT day d, count(*) n FROM stat_events WHERE name=? AND day>=? GROUP BY day', name, from));

    // Sign-ups, downloads, installs.
    const registrations = series(byDay('profiles', 'created'));
    const downloadsOf = (kind) => series(has('downloads') ? store.all('SELECT day d, count(*) n FROM downloads WHERE kind=? AND day>=? GROUP BY day', kind, from) : []);
    const gridDownloads = downloadsOf('work'), backgroundDownloads = downloadsOf('background');
    const installs = series(byDay('installs', 'created'));

    // New works and the moderators' decisions.
    const grids = series(byDay('revisions', 'created')), backgrounds = series(byDay('backgrounds', 'created')), arts = series(byDay('arts', 'created'));
    const guides = series(has('guides') ? store.all(`SELECT CAST((published + ${MSK}) / ${DAY} AS INTEGER) d, count(*) n FROM guides WHERE published >= ? GROUP BY d`, sinceMs(from)) : []);
    const approved = series(byDay('audit', 'at', "action='approve'")), rejected = series(byDay('audit', 'at', "action LIKE 'reject%'"));

    // Activity.
    const likes = merge(series(byDay('likes', 'created')), series(byDay('background_likes', 'created')), series(byDay('guide_likes', 'created')));
    const comments = merge(series(byDay('guide_comments', 'created')), series(byDay('item_comments', 'created')));
    const follows = series(byDay('subscriptions', 'created'));

    // Tops of the period.
    const pages = store.all('SELECT page, count(DISTINCT visitor) visitors, sum(views) views FROM visits WHERE day>=? GROUP BY page ORDER BY visitors DESC', from);
    const itemTop = (prefix) => pages.filter((row) => row.page.startsWith(`${prefix}:`)).slice(0, 10)
      .map((row) => ({ id: row.page.slice(prefix.length + 1), title: this.itemTitle(prefix, row.page.slice(prefix.length + 1)) || '—', visitors: row.visitors, views: row.views }));
    const sections = pages.filter((row) => PAGE_LABELS[row.page]).map((row) => ({ page: row.page, label: PAGE_LABELS[row.page], visitors: row.visitors, views: row.views }));
    const downloadTop = (kind, query) => (has('downloads') ? store.all(`SELECT d.item id, count(*) n, ${query} title FROM downloads d WHERE d.kind=? AND d.day>=? GROUP BY d.item ORDER BY n DESC LIMIT 10`, kind, from) : [])
      .map((row) => ({ id: row.id, title: row.title || '—', downloads: row.n }));
    const referrers = store.all("SELECT referrer host, count(DISTINCT visitor) visitors FROM visits WHERE day>=? AND referrer<>'' GROUP BY referrer ORDER BY visitors DESC LIMIT 12", from)
      .map((row) => ({ host: row.host, visitors: row.visitors }));
    // A visitor once on a touch screen counts as a phone, once in English as English; the rest as the others.
    const seen = store.get("SELECT count(DISTINCT visitor) n, count(DISTINCT CASE WHEN mobile=1 THEN visitor END) mobile, count(DISTINCT CASE WHEN lang='en' THEN visitor END) en FROM visits WHERE day>=?", from);
    const devices = { mobile: seen.mobile, desktop: seen.n - seen.mobile }, languages = { en: seen.en, ru: seen.n - seen.en };
    // Where the period's new accounts came from (accounts from before the sources are 'unknown').
    const signups = store.all(`SELECT coalesce(s.source, 'unknown') source, count(*) n FROM profiles p LEFT JOIN signup_sources s ON s.account=p.account
      WHERE p.created >= ? GROUP BY coalesce(s.source, 'unknown') ORDER BY n DESC`, sinceMs(from)).map((row) => ({ source: row.source, label: SOURCES[row.source] || row.source, accounts: row.n }));
    // Each visitor once: the other site they came from in the period (any of them), else «Прямой заход».
    const sources = store.all("SELECT host, count(*) visitors FROM (SELECT max(referrer) host FROM visits WHERE day>=? GROUP BY visitor) GROUP BY host", from).reduce((sum, row) => {
      const key = row.host ? sourceOf(row.host) : 'direct'; sum[key] = (sum[key] || 0) + row.visitors; return sum; }, {});

    // All time.
    const total = (sql, ...args) => { try { return store.get(sql, ...args).n; } catch { return 0; } };
    const totals = {
      accounts: total('SELECT count(*) n FROM profiles'),
      grids: total("SELECT count(*) n FROM works WHERE state='active' AND public_revision IS NOT NULL"),
      backgrounds: total("SELECT count(*) n FROM backgrounds WHERE status='approved'"),
      guides: total("SELECT count(*) n FROM guides WHERE status='approved'"),
      arts: total("SELECT count(*) n FROM arts WHERE status='approved'"),
      likes: total('SELECT (SELECT count(*) FROM likes) + (SELECT count(*) FROM background_likes) + coalesce((SELECT count(*) FROM guide_likes), 0) n'),
      comments: total("SELECT (SELECT count(*) FROM guide_comments WHERE state='visible') + (SELECT count(*) FROM item_comments WHERE state='visible') n"),
      downloads: total('SELECT count(*) n FROM downloads'),
      installs: total('SELECT count(*) n FROM installs'),
      follows: total('SELECT count(*) n FROM subscriptions'),
      workspaces: total('SELECT count(*) n FROM workspaces'),
      visitors: total('SELECT count(DISTINCT visitor) n FROM visits'),
      since: store.get('SELECT min(day) d FROM visits')?.d ?? null,
    };
    return {
      days: dayList, today, span, generated: now,
      online: this.online(now),
      now: this.kpi(today, today + 1), period: this.kpi(from, today + 1), previous: this.kpi(before, from),
      series: { visitors, views, members, newVisitors, registrations, logins: eventPeople('login'), gridDownloads, backgroundDownloads, installs,
        gridExports: eventSeries('grid-export'), backgroundPacks: eventSeries('background-pack'), fontPacks: eventSeries('font-pack'), studioSavers: eventPeople('studio-save'),
        grids, backgrounds, guides, arts, approved, rejected, likes, comments, follows },
      top: { sections, works: itemTop('work'), guides: itemTop('guide'), profiles: itemTop('profile'), referrers, signups,
        sources: Object.entries(sources).map(([source, visitors]) => ({ source, label: SOURCES[source], visitors })).sort((a, b) => b.visitors - a.visitors),
        gridDownloads: downloadTop('work', '(SELECT r.title FROM works w JOIN revisions r ON r.id=w.public_revision WHERE w.id=d.item)'),
        backgroundDownloads: downloadTop('background', has('backgrounds') ? '(SELECT b.title FROM backgrounds b WHERE b.id=d.item)' : 'NULL') },
      devices, languages, totals,
    };
  }
}
