// The site's statistics for «Админка → Статистика» (asked for on 2026-10-03: visits, sign-ups,
// downloads, activity — «полную по сайту»). Visits and the actions no table keeps come from the pages
// (POST /api/catalog/hit, src/site-stats.js): the page shown, once per load, and an action done; the bot
// and the API add sign-ins and «Студия» saves. Everything else is read from the tables that already keep
// it (profiles, downloads, installs, works, backgrounds, guides, arts, likes, comments, subscriptions,
// audit). A visitor is the browser's id (the signed cookie's HMAC, catalog-api identity.browser) — no IP;
// a signed-in visitor's account is kept for «вошедших». Days are Moscow days (UTC+3); a visit or an
// action is one row per day, page and visitor, so «просмотры» add up and «посетители» are distinct.
// Rows older than KEEP_DAYS go. The report is cached for a minute.
export const DAY = 86_400_000;
const MSK = 3 * 3_600_000, KEEP_DAYS = 400;
export const mskDay = (ms) => Math.floor((ms + MSK) / DAY);
export const STAT_PAGE = /^(?:home|editor|workshop|workshop:backgrounds|rules|background|font|guides|work:[0-9a-f-]{36}|guide:[A-Za-z0-9_-]{12}|profile:[A-Za-z0-9_-]{12})$/;
export const STAT_EVENTS = Object.freeze(['grid-export', 'background-pack', 'font-pack', 'login', 'studio-save']);
export const STAT_PERIODS = Object.freeze([7, 30, 90, 365]);
const PAGE_LABELS = { home: 'Главная', editor: 'Студия и редактор', workshop: 'Мастерская: сетки', 'workshop:backgrounds': 'Мастерская: фоны', rules: 'Правила мастерской',
  background: 'Фон главного меню', font: 'Шрифт', guides: 'Гайды' };

export class SiteStats {
  constructor(store) {
    this.store = store; this.cache = new Map();
    store.db.exec(`CREATE TABLE IF NOT EXISTS visits(day INTEGER NOT NULL, page TEXT NOT NULL, visitor TEXT NOT NULL, account TEXT, views INTEGER NOT NULL DEFAULT 1,
        last INTEGER NOT NULL, mobile INTEGER NOT NULL DEFAULT 0, lang TEXT NOT NULL DEFAULT 'ru', referrer TEXT NOT NULL DEFAULT '', PRIMARY KEY(day, page, visitor));
      CREATE INDEX IF NOT EXISTS visits_last ON visits(last);
      CREATE INDEX IF NOT EXISTS visits_visitor ON visits(visitor, day);
      CREATE INDEX IF NOT EXISTS visits_account ON visits(account, last) WHERE account IS NOT NULL;
      CREATE TABLE IF NOT EXISTS stat_events(day INTEGER NOT NULL, name TEXT NOT NULL, visitor TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(day, name, visitor));`);
    this.pruned = 0;
  }
  // A page shown. `referrer`: the host a visitor came from (another site's), `mobile`: a touch screen.
  visit(page, visitor, { account = null, referrer = '', mobile = false, lang = 'ru' } = {}) {
    if (!STAT_PAGE.test(String(page)) || !visitor) return false;
    const host = String(referrer || '').toLowerCase().replace(/^www\./, '').slice(0, 80);
    const now = this.store.now();
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
    const count = (table, column, start, end, where = '1=1', ...args) => (has(table)
      ? store.get(`SELECT count(*) n FROM ${table} WHERE ${column} >= ? AND ${column} < ? AND ${where}`, sinceMs(start), sinceMs(end), ...args).n : 0);
    const merge = (...lists) => dayList.map((_, i) => lists.reduce((sum, list) => sum + list[i], 0));

    // Visits.
    const visitors = series(store.all('SELECT day d, count(DISTINCT visitor) n FROM visits WHERE day>=? GROUP BY day', from));
    const views = series(store.all('SELECT day d, sum(views) n FROM visits WHERE day>=? GROUP BY day', from));
    const members = series(store.all('SELECT day d, count(DISTINCT account) n FROM visits WHERE day>=? AND account IS NOT NULL GROUP BY day', from));
    const newVisitors = series(store.all('SELECT d, count(*) n FROM (SELECT min(day) d FROM visits GROUP BY visitor) WHERE d>=? GROUP BY d', from));
    const distinct = (start, end) => store.get('SELECT count(DISTINCT visitor) n FROM visits WHERE day>=? AND day<?', start, end).n;
    const viewSum = (start, end) => store.get('SELECT coalesce(sum(views),0) n FROM visits WHERE day>=? AND day<?', start, end).n;
    const events = (name, start = from, end = today + 1) => store.get('SELECT coalesce(sum(count),0) n FROM stat_events WHERE name=? AND day>=? AND day<?', name, start, end).n;
    const eventSeries = (name) => series(store.all('SELECT day d, sum(count) n FROM stat_events WHERE name=? AND day>=? GROUP BY day', name, from));
    const eventPeople = (name) => series(store.all('SELECT day d, count(*) n FROM stat_events WHERE name=? AND day>=? GROUP BY day', name, from));

    // Sign-ups, downloads, installs.
    const registrations = series(byDay('profiles', 'created'));
    const downloadsOf = (kind) => series(has('downloads') ? store.all('SELECT day d, count(*) n FROM downloads WHERE kind=? AND day>=? GROUP BY day', kind, from) : []);
    const gridDownloads = downloadsOf('work'), backgroundDownloads = downloadsOf('background');
    const installs = series(byDay('installs', 'created'));
    const downloadCount = (start, end) => (has('downloads') ? store.get('SELECT count(*) n FROM downloads WHERE day>=? AND day<?', start, end).n : 0);

    // New works and the moderators' decisions.
    const grids = series(byDay('revisions', 'created')), backgrounds = series(byDay('backgrounds', 'created')), arts = series(byDay('arts', 'created'));
    const guides = series(has('guides') ? store.all(`SELECT CAST((published + ${MSK}) / ${DAY} AS INTEGER) d, count(*) n FROM guides WHERE published >= ? GROUP BY d`, sinceMs(from)) : []);
    const approved = series(byDay('audit', 'at', "action='approve'")), rejected = series(byDay('audit', 'at', "action LIKE 'reject%'"));

    // Activity.
    const likes = merge(series(byDay('likes', 'created')), series(byDay('background_likes', 'created')), series(byDay('guide_likes', 'created')));
    const comments = merge(series(byDay('guide_comments', 'created')), series(byDay('item_comments', 'created')));
    const follows = series(byDay('subscriptions', 'created'));
    const works = (start, end) => count('revisions', 'created', start, end) + count('backgrounds', 'created', start, end) + count('arts', 'created', start, end)
      + (has('guides') ? store.get('SELECT count(*) n FROM guides WHERE published >= ? AND published < ?', sinceMs(start), sinceMs(end)).n : 0);
    const likeCount = (start, end) => count('likes', 'created', start, end) + count('background_likes', 'created', start, end) + count('guide_likes', 'created', start, end);
    const commentCount = (start, end) => count('guide_comments', 'created', start, end) + count('item_comments', 'created', start, end);
    const kpi = (start, end) => ({ visitors: distinct(start, end), views: viewSum(start, end), registrations: count('profiles', 'created', start, end),
      downloads: downloadCount(start, end) + events('grid-export', start, end) + events('background-pack', start, end) + events('font-pack', start, end),
      installs: count('installs', 'created', start, end), works: works(start, end), likes: likeCount(start, end), comments: commentCount(start, end) });

    // Tops of the period.
    const pages = store.all('SELECT page, count(DISTINCT visitor) visitors, sum(views) views FROM visits WHERE day>=? GROUP BY page ORDER BY visitors DESC', from);
    const title = {
      work: (id) => store.get('SELECT r.title FROM works w JOIN revisions r ON r.id=w.public_revision WHERE w.id=?', id)?.title,
      guide: (id) => has('guides') && store.get('SELECT r.title FROM guides g JOIN guide_revisions r ON r.id=g.public_revision WHERE g.id=?', id)?.title,
      profile: (key) => store.get('SELECT nickname FROM profiles WHERE key=?', key)?.nickname,
    };
    const itemTop = (prefix) => pages.filter((row) => row.page.startsWith(`${prefix}:`)).slice(0, 10)
      .map((row) => ({ id: row.page.slice(prefix.length + 1), title: title[prefix](row.page.slice(prefix.length + 1)) || '—', visitors: row.visitors, views: row.views }));
    const sections = pages.filter((row) => PAGE_LABELS[row.page]).map((row) => ({ page: row.page, label: PAGE_LABELS[row.page], visitors: row.visitors, views: row.views }));
    const downloadTop = (kind, query) => (has('downloads') ? store.all(`SELECT d.item id, count(*) n, ${query} title FROM downloads d WHERE d.kind=? AND d.day>=? GROUP BY d.item ORDER BY n DESC LIMIT 10`, kind, from) : [])
      .map((row) => ({ id: row.id, title: row.title || '—', downloads: row.n }));
    const referrers = store.all("SELECT referrer host, count(DISTINCT visitor) visitors FROM visits WHERE day>=? AND referrer<>'' GROUP BY referrer ORDER BY visitors DESC LIMIT 12", from)
      .map((row) => ({ host: row.host, visitors: row.visitors }));
    // A visitor once on a touch screen counts as a phone, once in English as English; the rest as the others.
    const seen = store.get("SELECT count(DISTINCT visitor) n, count(DISTINCT CASE WHEN mobile=1 THEN visitor END) mobile, count(DISTINCT CASE WHEN lang='en' THEN visitor END) en FROM visits WHERE day>=?", from);
    const devices = { mobile: seen.mobile, desktop: seen.n - seen.mobile }, languages = { en: seen.en, ru: seen.n - seen.en };

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
      online: store.get('SELECT count(DISTINCT visitor) n FROM visits WHERE last>=?', now - 5 * 60_000).n,
      now: kpi(today, today + 1), period: kpi(from, today + 1), previous: kpi(before, from),
      series: { visitors, views, members, newVisitors, registrations, logins: eventPeople('login'), gridDownloads, backgroundDownloads, installs,
        gridExports: eventSeries('grid-export'), backgroundPacks: eventSeries('background-pack'), fontPacks: eventSeries('font-pack'), studioSavers: eventPeople('studio-save'),
        grids, backgrounds, guides, arts, approved, rejected, likes, comments, follows },
      top: { sections, works: itemTop('work'), guides: itemTop('guide'), profiles: itemTop('profile'), referrers,
        gridDownloads: downloadTop('work', '(SELECT r.title FROM works w JOIN revisions r ON r.id=w.public_revision WHERE w.id=d.item)'),
        backgroundDownloads: downloadTop('background', has('backgrounds') ? '(SELECT b.title FROM backgrounds b WHERE b.id=d.item)' : 'NULL') },
      devices, languages, totals,
    };
  }
}
