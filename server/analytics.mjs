// «Админка → Аналитика» (asked for on 2026-10-19: «сейчас она скудная, нужна полноценная аналитика для
// понимания всего, что есть на сайте»; docs/analytics.md). Our own counter, no IP, no third party.
//
// The pages send batches (src/site-stats.js → POST /api/catalog/collect): a visitor (the HMAC of the
// browser's random id), a session (the HMAC of the session's random id), the page, the engaged seconds
// gathered since the last batch and events of the allowlist (scripts/analytics-events.mjs). The first
// batch of a session says where it came from (another site's host, utm_*), its landing page, the screen's
// width bucket and the languages; the server adds the browser's families from the User-Agent (never the
// string itself) and the country from Cloudflare's CF-IPCountry when it is there, else the browser's time
// zone guess. Robots never get here (catalog-api.mjs STAT_ROBOT).
//
// Tables (added, never changed): an_visitors (first seen), an_sessions (400 days), an_events (raw, 90
// days), an_daily (events, sessions and visitors per day, event, key, device and source; 400 days; rolled
// from the raw events — today again every minute it is asked for — and, for the days before the
// analytics, from the old counter: `origin` 1), an_errors (script errors, failed API calls and the
// server's 5xx per day and place; 400 days), an_installs (what the PowerShell installers report; 400
// days). The old counter's visits/stat_events go on being written for «Пользователи», «Сейчас на сайте»
// and the old numbers. Sessions before the analytics are made from those visits once (backfill: one per
// visitor and day, no engaged time), so the history does not start at zero.
import { ANALYTICS_EVENTS, ANALYTICS_PAGE, SCREEN_BUCKETS, eventKeys, eventSpec, validateEvent } from '../scripts/analytics-events.mjs';
import { DAY, MSK, dayStart, engagedBuckets, funnelSteps, mskDay, retentionCohorts, searchText, uaFamilies, weekOf, weekStart, ENGAGED_BUCKETS } from './analytics-math.mjs';
import { SOURCES, sourceOf } from './site-stats.mjs';
import { MINIGAME_NAMES } from './minigames.mjs';

export const ANALYTICS_KEEP = Object.freeze({ raw: 90, days: 400 });
const SCREENS = new Set(SCREEN_BUCKETS.map(([, label]) => label));
const DEVICES = ['desktop', 'phone', 'tablet'];
const cleanHost = (value) => { const host = String(value || '').toLowerCase().replace(/^www\./, '').slice(0, 80); return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : ''; };
const cleanMark = (value) => String(value || '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 60);
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS an_visitors(visitor TEXT PRIMARY KEY, first_day INTEGER NOT NULL, first_at INTEGER NOT NULL, source TEXT NOT NULL DEFAULT '',
    landing TEXT NOT NULL DEFAULT '', device TEXT NOT NULL DEFAULT '') WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS an_visitors_first ON an_visitors(first_day);
  CREATE TABLE IF NOT EXISTS an_sessions(id TEXT PRIMARY KEY, visitor TEXT NOT NULL, account TEXT, day INTEGER NOT NULL, start INTEGER NOT NULL, last INTEGER NOT NULL,
    pages INTEGER NOT NULL DEFAULT 0, engaged INTEGER NOT NULL DEFAULT 0, landing TEXT NOT NULL DEFAULT '', exit TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'direct', referrer TEXT NOT NULL DEFAULT '', utm_source TEXT NOT NULL DEFAULT '', utm_medium TEXT NOT NULL DEFAULT '', utm_campaign TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT '', os TEXT NOT NULL DEFAULT '', browser TEXT NOT NULL DEFAULT '', screen TEXT NOT NULL DEFAULT '', lang TEXT NOT NULL DEFAULT '',
    blang TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', fresh INTEGER NOT NULL DEFAULT 0, version TEXT NOT NULL DEFAULT '', backfill INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS an_sessions_day ON an_sessions(day);
  CREATE INDEX IF NOT EXISTS an_sessions_visitor ON an_sessions(visitor, day);
  CREATE TABLE IF NOT EXISTS an_events(at INTEGER NOT NULL, day INTEGER NOT NULL, name TEXT NOT NULL, session TEXT, visitor TEXT, account TEXT, page TEXT NOT NULL DEFAULT '',
    props TEXT NOT NULL DEFAULT '{}', device TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '');
  CREATE INDEX IF NOT EXISTS an_events_name ON an_events(name, day);
  CREATE INDEX IF NOT EXISTS an_events_day ON an_events(day);
  CREATE TABLE IF NOT EXISTS an_daily(day INTEGER NOT NULL, name TEXT NOT NULL, key TEXT NOT NULL, device TEXT NOT NULL, source TEXT NOT NULL, origin INTEGER NOT NULL DEFAULT 0,
    events INTEGER NOT NULL DEFAULT 0, sessions INTEGER NOT NULL DEFAULT 0, visitors INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day, name, key, device, source, origin)) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS an_daily_name ON an_daily(name, day);
  CREATE TABLE IF NOT EXISTS an_errors(day INTEGER NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, message TEXT NOT NULL DEFAULT '', place TEXT NOT NULL DEFAULT '',
    page TEXT NOT NULL DEFAULT '', version TEXT NOT NULL DEFAULT '', count INTEGER NOT NULL DEFAULT 0, visitors INTEGER NOT NULL DEFAULT 0, last_visitor TEXT NOT NULL DEFAULT '',
    first_at INTEGER NOT NULL, last_at INTEGER NOT NULL, PRIMARY KEY(day, kind, key)) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS an_installs(at INTEGER NOT NULL, day INTEGER NOT NULL, kind TEXT NOT NULL, pack TEXT NOT NULL, result TEXT NOT NULL, error TEXT NOT NULL DEFAULT '');
  CREATE INDEX IF NOT EXISTS an_installs_day ON an_installs(day);
  CREATE INDEX IF NOT EXISTS an_installs_pack ON an_installs(pack);`;
// Old counter's actions → the event they were (backfill).
const LEGACY_EVENTS = { 'grid-export': ['editor.export', 'dota'], 'background-pack': ['customize.build-done', 'bg'], 'font-pack': ['customize.build-done', 'font'],
  'interface-pack': ['customize.build-done', 'hud'], 'customize-pack': ['customize.build-done', null], login: ['auth.login', null], 'studio-save': ['studio.save', null],
  'send-pc': ['pc.send', 'page'], 'dotadle-done': ['dotadle.finish', 'daily'] };
const CUSTOMIZE_PAGES = "('customize','background','font')";

export class Analytics {
  constructor(store, stats, { timers = true } = {}) {
    this.store = store; this.stats = stats; this.statements = new Map(); this.cache = new Map(); this.rolledToday = 0; this.pruned = 0;
    store.db.exec(SCHEMA);
    const since = this.setting('analytics.since');
    if (since === null) {
      this.since = mskDay(store.now()); this.setSetting('analytics.since', this.since);
      // The day the analytics began: its morning from the old counter, before any session of its own.
      this.backfillDay(this.since);
    } else this.since = Number(since);
    if (timers) {
      setTimeout(() => this.backfill().catch((error) => console.error(`Аналитика, история: ${error.message}`)), 5_000).unref?.();
      this.timer = setInterval(() => { try { this.rollup(); this.prune(); } catch (error) { console.error(`Аналитика: ${error.message}`); } }, 3_600_000); this.timer.unref?.();
    }
  }
  q(sql) { let statement = this.statements.get(sql); if (!statement) this.statements.set(sql, statement = this.store.db.prepare(sql)); return statement; }
  setting(key) { return this.store.get('SELECT value FROM settings WHERE key=?', key)?.value ?? null; }
  setSetting(key, value) { this.store.run('INSERT INTO settings(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, String(value)); }
  has(name) { return !!this.q('SELECT 1 x FROM sqlite_master WHERE name=?').get(name); }

  // ——— Writing.
  // A batch from a page. `who`: the visitor's HMAC; `agent`: the User-Agent; `country`: CF-IPCountry.
  // → the number of events kept, or false for a batch that is not one.
  collect(body, { who, account = null, agent = '', country = '' } = {}) {
    if (!body || typeof body !== 'object' || !who || !/^[A-Za-z0-9_-]{22}$/.test(String(body.s || ''))) return false;
    const store = this.store, now = store.now(), id = store.identity('session', body.s).slice(0, 32);
    const page = ANALYTICS_PAGE.test(String(body.p || '')) ? String(body.p) : '';
    const events = Array.isArray(body.e) ? body.e.slice(0, 60) : [];
    const engaged = Math.max(0, Math.min(60, Math.floor(Number(body.hb) || 0)));
    let kept = 0;
    store.tx(() => {
      let session = this.q('SELECT * FROM an_sessions WHERE id=?').get(id);
      if (session && session.visitor !== who) return; // Another browser's session id: not theirs to add to.
      if (!session) session = this.startSession(id, who, account, body.c, agent, country, page, now);
      let views = 0, exit = session.exit;
      for (const entry of events) {
        if (!Array.isArray(entry)) continue;
        const [name, props, age] = entry, spec = ANALYTICS_EVENTS[name];
        if (!spec) continue;
        const clean = validateEvent(name, props);
        if (!clean) continue;
        const at = now - Math.max(0, Math.min(600_000, Number(age) || 0));
        if (name === 'page.view') {
          if (!ANALYTICS_PAGE.test(clean.page || '')) continue;
          views += 1; exit = clean.page;
          this.visit(clean.page, who, { account, referrer: session.pages + views === 1 ? session.referrer : '', mobile: session.device !== 'desktop', lang: session.lang, now });
        }
        if (name.startsWith('error.')) { this.error(name === 'error.js' ? 'js' : 'api', clean, { page, version: session.version, visitor: who, now }); kept += 1; continue; }
        if (name === 'workshop.search') { const q = searchText(clean.q); if (q) clean.q = q; else delete clean.q; }
        this.q('INSERT INTO an_events(at, day, name, session, visitor, account, page, props, device, source) VALUES(?,?,?,?,?,?,?,?,?,?)')
          .run(at, mskDay(at), name, id, who, account, name === 'page.view' ? clean.page : page, JSON.stringify(clean), session.device, session.source);
        this.legacy(name, clean, who);
        kept += 1;
      }
      if (engaged && page && !views) this.visit(page, who, { account, ping: true, now });
      this.q(`UPDATE an_sessions SET last=?, pages=pages+?, engaged=engaged+?, exit=?, account=coalesce(?, account) WHERE id=?`).run(now, views, engaged, exit || page, account, id);
    });
    return kept;
  }
  startSession(id, who, account, context, agent, country, page, now) {
    const c = context && typeof context === 'object' ? context : {};
    const referrer = cleanHost(c.referrer), utm = Object.fromEntries(['source', 'medium', 'campaign'].map((key) => [key, cleanMark(c.utm?.[key])]));
    const landing = ANALYTICS_PAGE.test(String(c.landing || '')) ? String(c.landing) : page;
    const { os, browser, device } = uaFamilies(agent, { touch: c.touch === true });
    const source = utm.source ? sourceOf(utm.source) : referrer ? sourceOf(referrer) : 'direct';
    const header = /^[A-Z]{2}$/.test(String(country || '')) && !['XX', 'T1'].includes(country) ? country : '';
    const day = mskDay(now);
    const fresh = this.q('INSERT OR IGNORE INTO an_visitors(visitor, first_day, first_at, source, landing, device) VALUES(?,?,?,?,?,?)').run(who, day, now, source, landing, device).changes > 0;
    const row = { id, visitor: who, account, day, start: now, last: now, pages: 0, engaged: 0, landing, exit: '', source, referrer, utm_source: utm.source, utm_medium: utm.medium, utm_campaign: utm.campaign,
      device, os, browser, screen: SCREENS.has(c.screen) ? c.screen : '', lang: c.lang === 'en' ? 'en' : 'ru', blang: /^[a-z]{2}$/.test(String(c.blang || '')) ? c.blang : '',
      country: header || (/^[A-Z]{2}$/.test(String(c.zone || '')) ? c.zone : ''), fresh: fresh ? 1 : 0, version: /^[\w.+-]{1,40}$/.test(String(c.ver || '')) ? c.ver : '', backfill: 0 };
    this.q(`INSERT INTO an_sessions(id, visitor, account, day, start, last, pages, engaged, landing, exit, source, referrer, utm_source, utm_medium, utm_campaign, device, os, browser, screen, lang, blang, country, fresh, version, backfill)
      VALUES(:id,:visitor,:account,:day,:start,:last,:pages,:engaged,:landing,:exit,:source,:referrer,:utm_source,:utm_medium,:utm_campaign,:device,:os,:browser,:screen,:lang,:blang,:country,:fresh,:version,:backfill)`).run(row);
    return row;
  }
  // The old counter's visits row (server/site-stats.mjs visit, with prepared statements): «Сейчас на сайте»,
  // «Пользователи» and the funnels' first steps read it.
  visit(page, who, { account = null, referrer = '', mobile = false, lang = 'ru', ping = false, now }) {
    if (ping) return this.q(`INSERT INTO visits(day,page,visitor,account,views,last,mobile,lang) VALUES(?,?,?,?,0,?,?,?)
      ON CONFLICT(day,page,visitor) DO UPDATE SET last=excluded.last, account=coalesce(excluded.account, account)`).run(mskDay(now), page, who, account, now, mobile ? 1 : 0, lang === 'en' ? 'en' : 'ru');
    return this.q(`INSERT INTO visits(day,page,visitor,account,last,mobile,lang,referrer) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(day,page,visitor) DO UPDATE SET views=views+1, last=excluded.last, account=coalesce(excluded.account, account),
        referrer=CASE WHEN referrer='' THEN excluded.referrer ELSE referrer END`).run(mskDay(now), page, who, account, now, mobile ? 1 : 0, lang === 'en' ? 'en' : 'ru', cleanHost(referrer));
  }
  // The old counter's actions go on (its numbers in «Пользователи» and the history's continuity).
  legacy(name, props, who) {
    if (name === 'editor.export' && ['dota', 'command', 'optimized'].includes(props.type)) this.stats.event('grid-export', who);
    else if (name === 'customize.build-done') this.stats.event('customize-pack', who, props.parts || []);
    else if (name === 'pc.send') this.stats.event('send-pc', who);
    else if (name === 'dotadle.finish' && props.mode === 'daily') this.stats.event('dotadle-done', who);
  }
  // The server's own events (scripts/analytics-events.mjs SERVER_EVENTS): no session, an account maybe.
  serverEvent(name, props = {}, { account = null, visitor = null } = {}) {
    const clean = validateEvent(name, props, { server: true });
    if (!clean) return false;
    const now = this.store.now();
    this.q('INSERT INTO an_events(at, day, name, session, visitor, account, page, props) VALUES(?,?,?,NULL,?,?,\'\',?)').run(now, mskDay(now), name, visitor, account ? String(account) : null, JSON.stringify(clean));
    return true;
  }
  // A script error, a failed API call ('js', 'api', from the pages) or the server's own 5xx ('server').
  error(kind, props, { page = '', version = '', visitor = '', now = this.store.now() } = {}) {
    const key = kind === 'js' ? String(props.at || '') : kind === 'api' ? `${props.endpoint}|${props.status}` : `${props.endpoint}|${props.status}`;
    if (!key) return;
    const message = kind === 'js' ? String(props.message || '') : '', place = kind === 'js' ? `${props.file || '?'}:${props.line || 0}` : String(props.endpoint || '');
    this.q(`INSERT INTO an_errors(day, kind, key, message, place, page, version, count, visitors, last_visitor, first_at, last_at) VALUES(?,?,?,?,?,?,?,1,1,?,?,?)
      ON CONFLICT(day, kind, key) DO UPDATE SET count=count+1, visitors=visitors+(CASE WHEN last_visitor=excluded.last_visitor THEN 0 ELSE 1 END), last_visitor=excluded.last_visitor,
        last_at=excluded.last_at, version=CASE WHEN excluded.version<>'' THEN excluded.version ELSE version END, page=excluded.page`)
      .run(mskDay(now), kind, key.slice(0, 120), message.slice(0, 200), place.slice(0, 100), page, version, String(visitor || '').slice(0, 16), now, now);
  }
  // The server answered 500: `path` with its ids replaced (/works/:id/like).
  serverError(method, path, status = 500) {
    const endpoint = `${method} ${String(path).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, ':id').replace(/\/\d+(?=\/|$)/g, '/:n').replace(/\/[A-Za-z0-9_-]{12,}(?=\/|$)/g, '/:key')}`.slice(0, 90);
    try { this.error('server', { endpoint, status }, {}); } catch { /* Never in the way of the answer. */ }
  }
  // What a PowerShell installer reported (scripts/installer.mjs Send-Report → POST /install/report).
  install(pack, result, error = '') {
    const m = /^(grid|bg|font|all)-([A-Za-z0-9_-]{16}|[0-9a-f]{64}|remove)$/.exec(String(pack || ''));
    if (!m || !['ok', 'fail', 'removed'].includes(result)) return false;
    const now = this.store.now();
    this.q('INSERT INTO an_installs(at, day, kind, pack, result, error) VALUES(?,?,?,?,?,?)').run(now, mskDay(now), m[1], String(pack), result, String(error || '').replace(/[^\w .,:'-]/g, '').slice(0, 80));
    this.serverEvent('install.report', { kind: m[1], result });
    return true;
  }

  // ——— Rollup, pruning, history.
  // The raw events of one day into an_daily (origin 0): per event and key, device and source, plus '*' for the event as a whole.
  rollupDay(day) {
    const groups = new Map();
    const add = (name, key, device, source, session, visitor) => {
      const id = `${name}\t${key}\t${device}\t${source}`;
      let group = groups.get(id);
      if (!group) groups.set(id, group = { name, key, device, source, events: 0, sessions: new Set(), visitors: new Set() });
      group.events += 1; if (session) group.sessions.add(session); if (visitor) group.visitors.add(visitor);
    };
    for (const row of this.q('SELECT name, props, session, visitor, account, device, source FROM an_events WHERE day=?').iterate(day)) {
      let props = {};
      try { props = JSON.parse(row.props); } catch { /* Kept as nothing. */ }
      const who = row.visitor || (row.account ? `a:${row.account}` : '');
      add(row.name, '*', row.device, row.source, row.session, who);
      if (eventSpec(row.name)?.key) for (const key of eventKeys(row.name, props)) add(row.name, key.slice(0, 80), row.device, row.source, row.session, who);
    }
    this.store.tx(() => {
      this.q('DELETE FROM an_daily WHERE day=? AND origin=0').run(day);
      const insert = this.q('INSERT INTO an_daily(day, name, key, device, source, origin, events, sessions, visitors) VALUES(?,?,?,?,?,0,?,?,?)');
      for (const g of groups.values()) insert.run(day, g.name, g.key, g.device, g.source, g.events, g.sessions.size, g.visitors.size);
    });
    return groups.size;
  }
  // Every day since the last rolled one (marked once over), and today again (not marked).
  rollup(now = this.store.now()) {
    const today = mskDay(now), last = Number(this.setting('analytics.rolled') ?? this.since - 1);
    for (let day = Math.max(last + 1, this.since, today - ANALYTICS_KEEP.raw); day < today; day += 1) { this.rollupDay(day); this.setSetting('analytics.rolled', day); }
    this.rollupDay(today); this.rolledToday = now;
  }
  // Rolled lately enough for a report (a minute).
  fresh(now = this.store.now()) { if (now - this.rolledToday > 60_000) this.rollup(now); }
  prune(now = this.store.now()) {
    if (now - this.pruned < DAY / 2) return;
    this.pruned = now;
    const today = mskDay(now), raw = today - ANALYTICS_KEEP.raw, old = today - ANALYTICS_KEEP.days;
    this.q('DELETE FROM an_events WHERE day<?').run(raw);
    for (const table of ['an_sessions', 'an_daily', 'an_errors', 'an_installs']) this.q(`DELETE FROM ${table} WHERE day<?`).run(old);
    this.q('DELETE FROM an_visitors WHERE first_day<? AND NOT EXISTS (SELECT 1 FROM an_sessions s WHERE s.visitor=an_visitors.visitor)').run(today - 2 * ANALYTICS_KEEP.days);
  }
  // The old counter's history (once, a day per step so the API stays quick): sessions from visits (one per
  // visitor and day), the first day of every visitor, and its actions as events per day.
  async backfill() {
    if (this.setting('analytics.backfill') === '1' || !this.has('visits')) return 0;
    this.q(`INSERT OR IGNORE INTO an_visitors(visitor, first_day, first_at, source, landing, device)
      SELECT visitor, min(day), min(last), '', '', '' FROM visits GROUP BY visitor`).run();
    const first = this.q('SELECT min(day) d FROM visits').get()?.d;
    let days = 0;
    if (first !== null && first !== undefined) {
      for (let day = Math.max(first, mskDay(this.store.now()) - ANALYTICS_KEEP.days); day < this.since; day += 1) {
        this.backfillDay(day); days += 1;
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    this.setSetting('analytics.backfill', '1');
    return days;
  }
  backfillDay(day) {
    if (!this.has('visits')) return;
    const store = this.store;
    store.tx(() => {
      if (this.q('SELECT 1 x FROM an_sessions WHERE day=? AND backfill=1 LIMIT 1').get(day)) return;
      const rows = this.q(`SELECT visitor, max(account) account, min(last) start, max(last) last, sum(views) views, max(referrer) referrer, max(mobile) mobile, max(lang) lang,
        (SELECT page FROM visits w WHERE w.day=v.day AND w.visitor=v.visitor ORDER BY w.last LIMIT 1) landing,
        (SELECT page FROM visits w WHERE w.day=v.day AND w.visitor=v.visitor ORDER BY w.last DESC LIMIT 1) exit
        FROM visits v WHERE day=? GROUP BY visitor`).all(day);
      const insert = this.q(`INSERT OR IGNORE INTO an_sessions(id, visitor, account, day, start, last, pages, engaged, landing, exit, source, referrer, device, lang, fresh, backfill)
        VALUES(?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,1)`);
      const pages = new Map();
      for (const row of rows) {
        const source = row.referrer ? sourceOf(row.referrer) : 'direct', device = row.mobile ? 'phone' : 'desktop';
        this.q('INSERT OR IGNORE INTO an_visitors(visitor, first_day, first_at) VALUES(?,?,?)').run(row.visitor, day, row.start);
        this.q("UPDATE an_visitors SET source=?, landing=?, device=? WHERE visitor=? AND first_day=? AND source=''").run(source, row.landing || '', device, row.visitor, day);
        const firstDay = this.q('SELECT first_day d FROM an_visitors WHERE visitor=?').get(row.visitor)?.d;
        insert.run(`b${store.identity('backfill', `${day}:${row.visitor}`).slice(0, 31)}`, row.visitor, row.account, day, row.start, row.last, Math.max(1, row.views || 0),
          row.landing || '', row.exit || '', source, row.referrer || '', device, row.lang === 'en' ? 'en' : 'ru', firstDay === day ? 1 : 0);
        for (const view of this.q('SELECT page, views FROM visits WHERE day=? AND visitor=?').all(day, row.visitor)) {
          for (const key of ['*', view.page]) {
            const id = `${key}\t${device}\t${source}`;
            const group = pages.get(id) || { key, device, source, events: 0, visitors: 0 };
            group.events += view.views; group.visitors += key === '*' ? 0 : 1; pages.set(id, group);
          }
        }
        for (const key of ['*']) { const g = pages.get(`${key}\t${device}\t${source}`); if (g) g.visitors += 1; }
      }
      const daily = this.q(`INSERT INTO an_daily(day, name, key, device, source, origin, events, sessions, visitors) VALUES(?,?,?,?,?,1,?,?,?)
        ON CONFLICT(day, name, key, device, source, origin) DO UPDATE SET events=events+excluded.events, sessions=sessions+excluded.sessions, visitors=visitors+excluded.visitors`);
      for (const g of pages.values()) daily.run(day, 'page.view', g.key, g.device, g.source, g.events, g.visitors, g.visitors);
      if (this.has('stat_events')) {
        for (const row of this.q('SELECT name, sum(count) events, count(*) visitors FROM stat_events WHERE day=? GROUP BY name').all(day)) {
          const [event, key] = LEGACY_EVENTS[row.name] || [];
          if (!event) continue;
          daily.run(day, event, '*', '', '', row.events, row.visitors, row.visitors);
          if (key) daily.run(day, event, key, '', '', row.events, row.visitors, row.visitors);
        }
        if (this.has('stat_event_parts')) for (const row of this.q("SELECT part, count FROM stat_event_parts WHERE day=? AND name='customize-pack'").all(day))
          daily.run(day, 'customize.build-done', row.part, '', '', row.count, row.count, row.count);
      }
    });
  }

  // ——— Reading. `p`: the period (analytics-math.mjs periodOf); `f`: { device, source } filters.
  filters(f = {}, alias = '') {
    const a = alias ? `${alias}.` : '', where = [], args = [];
    if (DEVICES.includes(f.device)) { where.push(`${a}device=?`); args.push(f.device); }
    if (f.source && Object.hasOwn(SOURCES, f.source)) { where.push(`${a}source=?`); args.push(f.source); }
    return { sql: where.length ? ` AND ${where.join(' AND ')}` : '', args };
  }
  cached(key, build) {
    const now = this.store.now(), hit = this.cache.get(key);
    if (hit && now - hit.at < 60_000) return hit.value;
    const value = build();
    this.cache.set(key, { at: now, value });
    if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
    return value;
  }
  report(tab, p, f = {}) {
    const run = { overview: () => this.overview(p, f), sources: () => this.sources(p, f), audience: () => this.audience(p, f), tools: () => this.tools(p, f), funnels: () => this.funnels(p, f),
      content: () => this.content(p), errors: () => this.errors(p), ads: () => this.ads(p, f) }[tab];
    if (!run) return null;
    this.fresh();
    return this.cached(`${tab}:${p.from}:${p.to}:${f.device || ''}:${f.source || ''}`, () => ({ tab, from: p.from, to: p.to, span: p.span, prevFrom: p.prevFrom, prevTo: p.prevTo, today: p.today,
      since: this.since, rawFrom: Math.max(p.from, p.today - ANALYTICS_KEEP.raw + 1), generated: this.store.now(), filters: { device: f.device || '', source: f.source || '' }, ...run() }));
  }
  days(p) { return Array.from({ length: p.span }, (_, i) => p.from + i); }
  series(p, rows) { const map = new Map(rows.map((row) => [row.d, row.n])); return this.days(p).map((day) => map.get(day) || 0); }
  // Sessions' totals over [from, to], the shape of sessionSummary (analytics-math.mjs), in SQL.
  sessionTotals(from, to, f = {}) {
    const w = this.filters(f);
    const row = this.q(`SELECT count(*) sessions, count(DISTINCT visitor) visitors, count(DISTINCT CASE WHEN fresh=1 THEN visitor END) fresh, coalesce(sum(pages),0) views,
      coalesce(sum(CASE WHEN pages<=1 AND (backfill=1 OR engaged<10) THEN 1 ELSE 0 END),0) bounces, coalesce(sum(CASE WHEN backfill=0 THEN engaged END),0) engaged,
      coalesce(sum(CASE WHEN backfill=0 THEN 1 ELSE 0 END),0) measured, count(DISTINCT account) members FROM an_sessions WHERE day BETWEEN ? AND ?${w.sql}`).get(from, to, ...w.args);
    return { sessions: row.sessions, visitors: row.visitors, newVisitors: row.fresh, views: row.views, members: row.members,
      pagesPerSession: row.sessions ? row.views / row.sessions : 0, bounceRate: row.sessions ? row.bounces / row.sessions : 0, avgEngaged: row.measured ? row.engaged / row.measured : 0, measured: row.measured };
  }
  daily(name, from, to, f = {}, key = '*', column = 'events') {
    const w = this.filters(f);
    return this.q(`SELECT coalesce(sum(${column}),0) n FROM an_daily WHERE name=? AND key=? AND day BETWEEN ? AND ?${w.sql}`).get(name, key, from, to, ...w.args).n;
  }
  dailySeries(p, name, f = {}, key = '*', column = 'events') {
    const w = this.filters(f);
    return this.series(p, this.q(`SELECT day d, sum(${column}) n FROM an_daily WHERE name=? AND key=? AND day BETWEEN ? AND ?${w.sql} GROUP BY day`).all(name, key, p.from, p.to, ...w.args));
  }
  count(table, column, from, to, where = '1=1') {
    if (!this.has(table)) return 0;
    return this.store.get(`SELECT count(*) n FROM ${table} WHERE ${column} >= ? AND ${column} < ? AND ${where}`, dayStart(from), dayStart(to + 1)).n;
  }
  countSeries(p, table, column, where = '1=1') {
    if (!this.has(table)) return this.days(p).map(() => 0);
    return this.series(p, this.store.all(`SELECT CAST((${column} + ${MSK}) / ${DAY} AS INTEGER) d, count(*) n FROM ${table} WHERE ${column} >= ? AND ${column} < ? AND ${where} GROUP BY d`, dayStart(p.from), dayStart(p.to + 1)));
  }
  kpis(from, to, f) {
    const s = this.sessionTotals(from, to, f), downloads = this.has('downloads') ? this.store.get('SELECT count(*) n FROM downloads WHERE day BETWEEN ? AND ?', from, to).n : 0;
    return { ...s,
      registrations: this.count('profiles', 'created', from, to),
      downloads: downloads + this.daily('editor.export', from, to, f) + this.daily('customize.build-done', from, to, f),
      commands: this.daily('install.command', from, to),
      installs: this.q("SELECT count(*) n FROM an_installs WHERE result='ok' AND day BETWEEN ? AND ?").get(from, to).n,
      works: this.count('revisions', 'created', from, to) + this.count('backgrounds', 'created', from, to) + this.count('arts', 'created', from, to) + this.count('guides', 'published', from, to),
      likes: this.count('likes', 'created', from, to) + this.count('background_likes', 'created', from, to) + this.count('guide_likes', 'created', from, to),
      comments: this.count('guide_comments', 'created', from, to) + this.count('item_comments', 'created', from, to) };
  }
  sessionSeries(p, f, expr) {
    const w = this.filters(f);
    return this.series(p, this.q(`SELECT day d, ${expr} n FROM an_sessions WHERE day BETWEEN ? AND ?${w.sql} GROUP BY day`).all(p.from, p.to, ...w.args));
  }
  overview(p, f) {
    const w = this.filters(f);
    const pages = this.q(`SELECT key page, sum(events) views, sum(visitors) visitors FROM an_daily WHERE name='page.view' AND key<>'*' AND day BETWEEN ? AND ?${w.sql} GROUP BY key ORDER BY views DESC LIMIT 60`).all(p.from, p.to, ...w.args);
    return {
      days: this.days(p), now: this.kpis(p.from, p.to, f), before: this.kpis(p.prevFrom, p.prevTo, f),
      series: {
        visitors: this.sessionSeries(p, f, 'count(DISTINCT visitor)'), newVisitors: this.sessionSeries(p, f, 'count(DISTINCT CASE WHEN fresh=1 THEN visitor END)'),
        sessions: this.sessionSeries(p, f, 'count(*)'), views: this.sessionSeries(p, f, 'sum(pages)'),
        engaged: this.sessionSeries(p, f, 'coalesce(avg(CASE WHEN backfill=0 THEN engaged END),0)'),
        registrations: this.countSeries(p, 'profiles', 'created'),
        downloads: ((workshop, editor, built) => workshop.map((n, i) => n + editor[i] + built[i]))(this.has('downloads') ? this.series(p, this.store.all('SELECT day d, count(*) n FROM downloads WHERE day BETWEEN ? AND ? GROUP BY day', p.from, p.to)) : this.days(p).map(() => 0),
          this.dailySeries(p, 'editor.export', f), this.dailySeries(p, 'customize.build-done', f)),
        installs: this.series(p, this.q("SELECT day d, count(*) n FROM an_installs WHERE result='ok' AND day BETWEEN ? AND ? GROUP BY day").all(p.from, p.to)),
      },
      // The period before, day by day, for «Сравнить».
      seriesBefore: ((q) => ({ visitors: this.sessionSeries(q, f, 'count(DISTINCT visitor)'), sessions: this.sessionSeries(q, f, 'count(*)'), views: this.sessionSeries(q, f, 'sum(pages)') }))({ from: p.prevFrom, to: p.prevTo, span: p.span }),
      pages: pages.map((row) => ({ page: row.page, label: this.stats.pageLabel(row.page), views: row.views, visitors: row.visitors })),
    };
  }
  sources(p, f) {
    const w = this.filters({ device: f.device }), period = [p.from, p.to, ...w.args], before = [p.prevFrom, p.prevTo, ...w.args];
    const group = (column, args, limit = 40, where = '1=1') => this.q(`SELECT ${column} value, count(*) sessions, count(DISTINCT visitor) visitors,
      sum(CASE WHEN pages<=1 AND (backfill=1 OR engaged<10) THEN 1 ELSE 0 END) bounces, sum(CASE WHEN backfill=0 THEN engaged END) engaged, sum(CASE WHEN backfill=0 THEN 1 ELSE 0 END) measured,
      sum(pages) views, sum(fresh) fresh FROM an_sessions WHERE day BETWEEN ? AND ?${w.sql} AND ${where} GROUP BY ${column} ORDER BY sessions DESC LIMIT ${limit}`).all(...args);
    const shape = (row) => ({ sessions: row.sessions, visitors: row.visitors, newVisitors: row.fresh, bounceRate: row.sessions ? row.bounces / row.sessions : 0,
      avgEngaged: row.measured ? row.engaged / row.measured : 0, pagesPerSession: row.sessions ? row.views / row.sessions : 0 });
    const previous = new Map(group('source', before).map((row) => [row.value, row.sessions]));
    const bySource = group('source', period).map((row) => ({ source: row.value, label: SOURCES[row.value] || row.value, ...shape(row), before: previous.get(row.value) || 0 }));
    const top = bySource.slice(0, 5).map((row) => row.source);
    const daily = this.q(`SELECT day d, source s, count(*) n FROM an_sessions WHERE day BETWEEN ? AND ?${w.sql} GROUP BY day, source`).all(...period);
    const series = [...top, 'rest'].map((source) => ({ source, label: source === 'rest' ? 'Остальные' : SOURCES[source] || source,
      values: this.series(p, Object.values(daily.filter((row) => (source === 'rest' ? !top.includes(row.s) : row.s === source)).reduce((sum, row) => { (sum[row.d] ||= { d: row.d, n: 0 }).n += row.n; return sum; }, {}))) }))
      .filter((s) => s.values.some(Boolean));
    const signups = this.has('profiles') ? this.store.all(`SELECT coalesce(s.source, 'unknown') source, count(*) n FROM profiles p LEFT JOIN signup_sources s ON s.account=p.account
      WHERE p.created >= ? AND p.created < ? GROUP BY coalesce(s.source, 'unknown') ORDER BY n DESC`, dayStart(p.from), dayStart(p.to + 1)).map((row) => ({ source: row.source, label: SOURCES[row.source] || row.source, accounts: row.n })) : [];
    return {
      days: this.days(p), bySource, series, signups,
      referrers: group('referrer', period, 40, "referrer<>''").map((row) => ({ host: row.value, ...shape(row) })),
      utm: this.q(`SELECT utm_source, utm_medium, utm_campaign, count(*) sessions, count(DISTINCT visitor) visitors, sum(fresh) fresh FROM an_sessions
        WHERE day BETWEEN ? AND ?${w.sql} AND utm_source<>'' GROUP BY utm_source, utm_medium, utm_campaign ORDER BY sessions DESC LIMIT 50`).all(...period)
        .map((row) => ({ source: row.utm_source, medium: row.utm_medium, campaign: row.utm_campaign, sessions: row.sessions, visitors: row.visitors, newVisitors: row.fresh })),
      landings: group('landing', period, 40, "landing<>''").map((row) => ({ page: row.value, label: this.stats.pageLabel(row.value), ...shape(row) })),
    };
  }
  audience(p, f) {
    const w = this.filters(f), period = [p.from, p.to, ...w.args];
    // Sessions made from the old counter know only the device and the site's language: the rest counts sessions of our own (`real`).
    const dim = (column, real = false) => this.q(`SELECT ${column} value, count(DISTINCT visitor) visitors, count(*) sessions FROM an_sessions WHERE day BETWEEN ? AND ?${w.sql}${real ? ' AND backfill=0' : ''} GROUP BY ${column} ORDER BY visitors DESC LIMIT 30`).all(...period);
    const totals = this.sessionTotals(p.from, p.to, f);
    const measured = this.q(`SELECT count(*) n FROM an_sessions WHERE day BETWEEN ? AND ?${w.sql} AND backfill=0`).get(...period).n;
    const median = measured ? this.q(`SELECT engaged n FROM an_sessions WHERE day BETWEEN ? AND ?${w.sql} AND backfill=0 ORDER BY engaged LIMIT 1 OFFSET ?`).get(...period, Math.floor((measured - 1) / 2)).n : 0;
    const buckets = engagedBuckets(this.q(`SELECT engaged, backfill FROM an_sessions WHERE day BETWEEN ? AND ?${w.sql} AND backfill=0`).all(...period));
    // Weekly cohorts: the weeks of the period (up to the last 12), each followed for up to 12 weeks.
    const toWeek = weekOf(p.to), fromWeek = Math.max(weekOf(p.from), toWeek - 11), cohortFilter = this.filters(f, 'v');
    const firsts = new Map(this.q(`SELECT visitor, first_day FROM an_visitors v WHERE first_day BETWEEN ? AND ?${cohortFilter.sql}`).all(weekStart(fromWeek), weekStart(toWeek) + 6, ...cohortFilter.args)
      .map((row) => [row.visitor, row.first_day]));
    const active = this.q(`SELECT DISTINCT s.visitor, (s.day + 3) / 7 week FROM an_sessions s JOIN an_visitors v ON v.visitor=s.visitor
      WHERE v.first_day BETWEEN ? AND ?${cohortFilter.sql} AND s.day >= ?`).all(weekStart(fromWeek), weekStart(toWeek) + 6, ...cohortFilter.args, weekStart(fromWeek)).map((row) => [row.visitor, weekStart(row.week)]);
    const cohorts = retentionCohorts(firsts, active, { fromWeek, toWeek, todayWeek: weekOf(p.today), maxWeeks: 12 });
    const heat = this.q(`SELECT ((day + 3) % 7) weekday, CAST(((start + ${MSK}) % ${DAY}) / 3600000 AS INTEGER) hour, count(*) n FROM an_sessions WHERE day BETWEEN ? AND ?${w.sql} AND backfill=0 GROUP BY weekday, hour`).all(...period);
    return {
      days: this.days(p), totals: { ...totals, medianEngaged: median, returning: totals.visitors - totals.newVisitors }, before: this.sessionTotals(p.prevFrom, p.prevTo, f),
      series: { newVisitors: this.sessionSeries(p, f, 'count(DISTINCT CASE WHEN fresh=1 THEN visitor END)'), returning: this.sessionSeries(p, f, 'count(DISTINCT CASE WHEN fresh=0 THEN visitor END)'),
        engaged: this.sessionSeries(p, f, 'coalesce(avg(CASE WHEN backfill=0 THEN engaged END),0)'), sessions: this.sessionSeries(p, f, 'count(*)') },
      seriesBefore: ((q) => ({ newVisitors: this.sessionSeries(q, f, 'count(DISTINCT CASE WHEN fresh=1 THEN visitor END)'), returning: this.sessionSeries(q, f, 'count(DISTINCT CASE WHEN fresh=0 THEN visitor END)') }))({ from: p.prevFrom, to: p.prevTo, span: p.span }),
      cohorts, buckets, heat,
      devices: dim('device'), os: dim('os', true), browsers: dim('browser', true), screens: dim('screen', true), countries: dim('country', true), languages: dim('lang'), browserLanguages: dim('blang', true),
    };
  }
  // Every event's numbers by key over the period (an_daily), for the tools' tables.
  eventCounts(p, f, names) {
    const w = this.filters(f), marks = names.map(() => '?').join(',');
    const rows = this.q(`SELECT name, key, sum(events) events, sum(sessions) sessions, sum(visitors) visitors FROM an_daily WHERE name IN (${marks}) AND day BETWEEN ? AND ?${w.sql} GROUP BY name, key`)
      .all(...names, p.from, p.to, ...w.args);
    const out = {};
    for (const row of rows) (out[row.name] ||= []).push({ key: row.key, events: row.events, sessions: row.sessions, visitors: row.visitors });
    for (const list of Object.values(out)) list.sort((a, b) => (a.key === '*' ? -1 : b.key === '*' ? 1 : b.events - a.events));
    return out;
  }
  tools(p, f) {
    const names = [...Object.keys(ANALYTICS_EVENTS).filter((name) => /^(customize|editor|workshop|guides|pc|auth|profile)\./.test(name)), 'studio.save', 'install.command', 'install.report', 'auth.login'];
    const w = this.filters(f), rawFrom = Math.max(p.from, p.today - ANALYTICS_KEEP.raw + 1);
    const searches = this.q(`SELECT json_extract(props, '$.q') q, json_extract(props, '$.section') section, count(*) n, sum(CASE WHEN json_extract(props, '$.results')=0 THEN 1 ELSE 0 END) empty
      FROM an_events WHERE name='workshop.search' AND day BETWEEN ? AND ?${w.sql} AND json_extract(props, '$.q') IS NOT NULL GROUP BY q, section ORDER BY n DESC LIMIT 40`).all(rawFrom, p.to, ...w.args);
    const sizes = this.q(`SELECT coalesce(avg(json_extract(props, '$.mb')),0) mb, count(*) n FROM an_events WHERE name='customize.build-done' AND day BETWEEN ? AND ?${w.sql}`).get(rawFrom, p.to, ...w.args);
    const pageSessions = (pages) => this.q(`SELECT coalesce(sum(sessions),0) n FROM an_daily WHERE name='page.view' AND key IN (${pages.map(() => '?').join(',')}) AND day BETWEEN ? AND ?${w.sql}`).get(...pages, p.from, p.to, ...w.args).n;
    const installs = this.q('SELECT kind, result, count(*) n FROM an_installs WHERE day BETWEEN ? AND ? GROUP BY kind, result').all(p.from, p.to);
    const failures = this.q("SELECT kind, error, count(*) n FROM an_installs WHERE result='fail' AND day BETWEEN ? AND ? GROUP BY kind, error ORDER BY n DESC LIMIT 20").all(p.from, p.to);
    return { days: this.days(p), counts: this.eventCounts(p, f, names), searches, avgBuildMb: sizes.mb, rawFrom,
      base: { customize: pageSessions(['customize', 'background', 'font']), editor: pageSessions(['editor', 'studio']), workshop: pageSessions(['workshop', 'workshop:backgrounds', 'workshop:arts']), guides: pageSessions(['guides']) },
      guideViews: this.q(`SELECT coalesce(sum(events),0) n FROM an_daily WHERE name='page.view' AND key LIKE 'guide:%' AND day BETWEEN ? AND ?${w.sql}`).get(p.from, p.to, ...w.args).n,
      installs, installFailures: failures,
      series: { customize: this.dailySeries(p, 'customize.build-done', f), editor: this.dailySeries(p, 'editor.export', f), workshop: this.dailySeries(p, 'workshop.download', f) } };
  }
  // Funnels over the raw window (the last 90 days of the period). Each step is a set of visitors.
  funnels(p, f) {
    const from = Math.max(p.from, p.today - ANALYTICS_KEEP.raw + 1), to = p.to, store = this.store;
    const set = (sql, ...args) => new Set(store.all(sql, ...args).map((row) => row.visitor).filter(Boolean));
    const union = (...sets) => { const out = new Set(); for (const s of sets) for (const v of s) out.add(v); return out; };
    const events = (names, where = '1=1') => set(`SELECT DISTINCT visitor FROM an_events WHERE name IN (${names.map(() => '?').join(',')}) AND day BETWEEN ? AND ? AND ${where}`, ...names, from, to);
    const legacy = (names) => (this.has('stat_events') ? set(`SELECT DISTINCT visitor FROM stat_events WHERE name IN (${names.map(() => '?').join(',')}) AND day BETWEEN ? AND ?`, ...names, from, to) : new Set());
    const legacyBefore = (names) => (this.has('stat_events') ? set(`SELECT DISTINCT visitor FROM stat_events WHERE name IN (${names.map(() => '?').join(',')}) AND day BETWEEN ? AND ?`, ...names, from, Math.min(to, this.since)) : new Set());
    const visits = (where) => set(`SELECT DISTINCT visitor FROM visits WHERE day BETWEEN ? AND ? AND (${where})`, from, to);
    const installed = (names) => set(`SELECT DISTINCT e.visitor FROM an_events e WHERE e.name IN (${names.map(() => '?').join(',')}) AND e.day BETWEEN ? AND ?
      AND json_extract(e.props, '$.pack') IN (SELECT pack FROM an_installs WHERE result='ok' AND day BETWEEN ? AND ?)`, ...names, from, to, from, to + 7);
    // Who the filters let in: a session of the period with that device and source.
    const w = this.filters(f), allowed = w.sql ? set(`SELECT DISTINCT visitor FROM an_sessions WHERE day BETWEEN ? AND ?${w.sql}`, from, to, ...w.args) : null;
    const devices = new Map(store.all('SELECT visitor, device FROM an_sessions WHERE day BETWEEN ? AND ? GROUP BY visitor', from, to).map((row) => [row.visitor, row.device]));
    const make = (steps) => {
      const kept = allowed ? steps.map((step) => ({ ...step, visitors: new Set([...step.visitors].filter((v) => allowed.has(v))) })) : steps;
      const by = (device) => funnelSteps(kept.map((step) => ({ ...step, visitors: new Set([...step.visitors].filter((v) => devices.get(v) === device)) })));
      return { steps: funnelSteps(kept), byDevice: { desktop: by('desktop'), phone: by('phone'), tablet: by('tablet') } };
    };
    const customizeBuilt = union(events(['customize.build-done']), legacy(['customize-pack', 'background-pack', 'font-pack', 'interface-pack']));
    return { funnelFrom: from, funnelTo: to, funnels: [
      { id: 'customize', title: 'Оформление Dota', ...make([
        { id: 'visit', label: 'Зашёл', visitors: visits(`page IN ${CUSTOMIZE_PAGES} OR page LIKE 'customize:%'`) },
        { id: 'change', label: 'Изменил что-то', visitors: events(['customize.change', 'customize.preset', 'customize.mod']) },
        { id: 'build', label: 'Собрал', visitors: customizeBuilt },
        { id: 'get', label: 'Скачал или скопировал команду', visitors: union(events(['customize.download', 'customize.command-copy']), events(['customize.build-done'], "json_extract(props, '$.delivery')='file'"),
          legacyBefore(['customize-pack', 'background-pack', 'font-pack'])) },
        { id: 'install', label: 'Поставил', visitors: installed(['customize.build-done', 'customize.command-copy']) }]) },
      { id: 'editor', title: 'Редактор', ...make([
        { id: 'visit', label: 'Открыл редактор', visitors: visits("page IN ('editor','studio')") },
        { id: 'edit', label: 'Изменил файл', visitors: union(events(['editor.edit']), legacy(['grid-export'])) },
        { id: 'export', label: 'Скачал или экспортировал', visitors: union(events(['editor.export']), legacy(['grid-export'])) },
        { id: 'publish', label: 'Опубликовал', visitors: events(['editor.publish']) }]) },
      { id: 'workshop', title: 'Мастерская', ...make([
        { id: 'visit', label: 'Зашёл в мастерскую', visitors: visits("page LIKE 'workshop%' OR page LIKE 'work:%' OR page='rules'") },
        { id: 'open', label: 'Открыл работу', visitors: union(events(['workshop.open']), visits("page LIKE 'work:%'")) },
        { id: 'download', label: 'Скачал или взял команду', visitors: events(['workshop.download', 'workshop.command-copy']) },
        { id: 'install', label: 'Поставил командой', visitors: installed(['workshop.command-copy']) }]) },
    ] };
  }
  content(p) {
    const store = this.store, from = dayStart(p.from), to = dayStart(p.to + 1), has = (name) => this.has(name);
    const viewsOf = (prefix) => store.all(`SELECT substr(page, ${prefix.length + 2}) id, count(DISTINCT visitor) visitors, sum(views) views FROM visits WHERE day BETWEEN ? AND ? AND page LIKE ? GROUP BY page ORDER BY visitors DESC LIMIT 25`,
      p.from, p.to, `${prefix}:%`);
    const merge = (lists, title, limit = 20) => {
      const rows = new Map();
      for (const [metric, list] of Object.entries(lists)) for (const row of list) { const item = rows.get(String(row.id)) || { id: String(row.id), views: 0, visitors: 0, downloads: 0, likes: 0, comments: 0, reads: 0 }; item[metric] = row.n ?? row.visitors; if (metric === 'visitors') item.views = row.views; rows.set(String(row.id), item); }
      return [...rows.values()].map((row) => ({ ...row, title: title(row.id) || '—' })).sort((a, b) => b.visitors + b.downloads * 2 + b.likes * 3 - (a.visitors + a.downloads * 2 + a.likes * 3)).slice(0, limit);
    };
    const downloads = (kind) => (has('downloads') ? store.all('SELECT item id, count(*) n FROM downloads WHERE kind=? AND day BETWEEN ? AND ? GROUP BY item ORDER BY n DESC LIMIT 25', kind, p.from, p.to) : []);
    const likes = (table, column) => (has(table) ? store.all(`SELECT ${column} id, count(*) n FROM ${table} WHERE created >= ? AND created < ? GROUP BY ${column} ORDER BY n DESC LIMIT 25`, from, to) : []);
    const works = merge({ visitors: viewsOf('work'), downloads: downloads('work'), likes: likes('likes', 'work'),
      comments: has('item_comments') ? store.all("SELECT item id, count(*) n FROM item_comments WHERE kind='work' AND created >= ? AND created < ? GROUP BY item ORDER BY n DESC LIMIT 25", from, to) : [] }, (id) => this.stats.itemTitle('work', id));
    const backgroundTitle = (id) => (has('backgrounds') ? store.get('SELECT title FROM backgrounds WHERE id=?', Number(id))?.title : '');
    const opens = store.all(`SELECT json_extract(props, '$.id') id, count(DISTINCT visitor) n FROM an_events WHERE name='workshop.open' AND json_extract(props, '$.kind')='background' AND day BETWEEN ? AND ? GROUP BY id ORDER BY n DESC LIMIT 25`, p.from, p.to)
      .filter((row) => row.id);
    const backgrounds = merge({ visitors: opens.map((row) => ({ id: row.id, visitors: row.n, views: row.n })), downloads: downloads('background'), likes: likes('background_likes', 'background'),
      comments: has('item_comments') ? store.all("SELECT item id, count(*) n FROM item_comments WHERE kind='background' AND created >= ? AND created < ? GROUP BY item ORDER BY n DESC LIMIT 25", from, to) : [] }, backgroundTitle);
    const reads = store.all(`SELECT json_extract(props, '$.id') id, count(DISTINCT visitor) n FROM an_events WHERE name='guides.read' AND json_extract(props, '$.depth')='100' AND day BETWEEN ? AND ? GROUP BY id`, p.from, p.to);
    const guides = merge({ visitors: viewsOf('guide'), likes: likes('guide_likes', 'guide'), comments: has('guide_comments') ? store.all('SELECT guide id, count(*) n FROM guide_comments WHERE created >= ? AND created < ? GROUP BY guide ORDER BY n DESC LIMIT 25', from, to) : [],
      reads: reads.filter((row) => row.id) }, (id) => this.stats.itemTitle('guide', id));
    // Authors: likes and downloads their published things got in the period, and what they published.
    const authors = new Map(), credit = (rows, metric) => { for (const row of rows) { if (!row.account) continue; const a = authors.get(row.account) || { account: row.account, likes: 0, downloads: 0, works: 0 }; a[metric] += row.n; authors.set(row.account, a); } };
    if (has('likes')) credit(store.all('SELECT w.account, count(*) n FROM likes l JOIN works w ON w.id=l.work WHERE l.created >= ? AND l.created < ? AND w.account IS NOT NULL GROUP BY w.account', from, to), 'likes');
    if (has('background_likes')) credit(store.all('SELECT b.account, count(*) n FROM background_likes l JOIN backgrounds b ON b.id=l.background WHERE l.created >= ? AND l.created < ? AND b.account IS NOT NULL GROUP BY b.account', from, to), 'likes');
    if (has('guide_likes')) credit(store.all('SELECT g.account, count(*) n FROM guide_likes l JOIN guides g ON g.id=l.guide WHERE l.created >= ? AND l.created < ? GROUP BY g.account', from, to), 'likes');
    if (has('downloads')) {
      credit(store.all("SELECT w.account, count(*) n FROM downloads d JOIN works w ON d.kind='work' AND w.id=d.item WHERE d.day BETWEEN ? AND ? AND w.account IS NOT NULL GROUP BY w.account", p.from, p.to), 'downloads');
      if (has('backgrounds')) credit(store.all("SELECT b.account, count(*) n FROM downloads d JOIN backgrounds b ON d.kind='background' AND b.id=CAST(d.item AS INTEGER) WHERE d.day BETWEEN ? AND ? AND b.account IS NOT NULL GROUP BY b.account", p.from, p.to), 'downloads');
    }
    credit(store.all('SELECT w.account, count(*) n FROM revisions r JOIN works w ON w.id=r.work WHERE r.created >= ? AND r.created < ? AND w.account IS NOT NULL GROUP BY w.account', from, to), 'works');
    if (has('backgrounds')) credit(store.all('SELECT account, count(*) n FROM backgrounds WHERE created >= ? AND created < ? AND account IS NOT NULL GROUP BY account', from, to), 'works');
    if (has('guides')) credit(store.all('SELECT account, count(*) n FROM guides WHERE published >= ? AND published < ? GROUP BY account', from, to), 'works');
    const topAuthors = [...authors.values()].sort((a, b) => b.likes * 3 + b.downloads + b.works * 2 - (a.likes * 3 + a.downloads + a.works * 2)).slice(0, 20)
      .map((a) => { const profile = store.get('SELECT key, nickname FROM profiles WHERE account=?', a.account); return { key: profile?.key || '', name: profile?.nickname || '—', likes: a.likes, downloads: a.downloads, works: a.works }; });
    // Mini-games: the page's events per game and the tables of records.
    const games = {};
    for (const row of store.all(`SELECT name, key, sum(events) n, sum(sessions) s FROM an_daily WHERE name IN ('minigames.open','minigames.start','minigames.finish','minigames.submit','minigames.ranks','minigames.run','minigames.record')
      AND key<>'*' AND day BETWEEN ? AND ? GROUP BY name, key`, p.from, p.to)) (games[row.key] ||= { game: row.key, name: MINIGAME_NAMES[row.key] || row.key })[row.name.split('.')[1]] = row.n;
    if (has('minigame_scores')) for (const row of store.all('SELECT game, count(DISTINCT account) n FROM minigame_scores WHERE updated >= ? AND updated < ? GROUP BY game', from, to))
      (games[row.game] ||= { game: row.game, name: MINIGAME_NAMES[row.game] || row.game }).leaders = row.n;
    const duration = store.all(`SELECT json_extract(props, '$.game') game, avg(json_extract(props, '$.seconds')) s FROM an_events WHERE name='minigames.finish' AND day BETWEEN ? AND ? GROUP BY game`, p.from, p.to);
    for (const row of duration) if (games[row.game]) games[row.game].avgSeconds = row.s;
    // Dotadle: the daily games of the period (dotadle_plays), and practice from the page.
    let dotadle = null;
    if (has('dotadle_plays')) {
      const rows = store.all('SELECT account, guesses, solved, CAST((updated + ?) / ? AS INTEGER) d FROM dotadle_plays WHERE updated >= ? AND updated < ?', MSK, DAY, from, to)
        .map((row) => ({ account: row.account, tries: (() => { try { return JSON.parse(row.guesses).length; } catch { return 0; } })(), solved: !!row.solved, d: row.d }));
      const finished = rows.filter((row) => row.solved || row.tries >= 6), solved = finished.filter((row) => row.solved);
      dotadle = { players: new Set(rows.map((row) => row.account)).size, games: rows.length, finished: finished.length, solved: solved.length,
        solveRate: finished.length ? solved.length / finished.length : 0, avgAttempts: solved.length ? solved.reduce((sum, row) => sum + row.tries, 0) / solved.length : 0,
        distribution: [1, 2, 3, 4, 5, 6].map((n) => solved.filter((row) => row.tries === n).length).concat(finished.length - solved.length),
        series: this.series(p, Object.values(rows.reduce((sum, row) => { (sum[row.d] ||= { d: row.d, set: new Set() }).set.add(row.account); return sum; }, {})).map((row) => ({ d: row.d, n: row.set.size }))),
        practice: this.daily('dotadle.finish', p.from, p.to, {}, 'practice'), shares: this.daily('dotadle.share', p.from, p.to) };
    }
    return { days: this.days(p), works, backgrounds, guides, authors: topAuthors,
      series: { grids: this.countSeries(p, 'revisions', 'created'), backgrounds: this.countSeries(p, 'backgrounds', 'created'), guides: this.countSeries(p, 'guides', 'published'), arts: this.countSeries(p, 'arts', 'created'),
        likes: this.days(p).map((_, i) => ['likes', 'background_likes', 'guide_likes'].reduce((sum, table) => sum + this.countSeries(p, table, 'created')[i], 0)),
        comments: this.days(p).map((_, i) => ['guide_comments', 'item_comments'].reduce((sum, table) => sum + this.countSeries(p, table, 'created')[i], 0)),
        follows: this.countSeries(p, 'subscriptions', 'created') },
      games: Object.values(games).sort((a, b) => (b.open || 0) - (a.open || 0)), dotadle };
  }
  errors(p) {
    const rows = this.q(`SELECT kind, key, message, place, page, max(last_at) last, version, sum(count) count, sum(visitors) visitors, min(first_at) first FROM an_errors
      WHERE day BETWEEN ? AND ? GROUP BY kind, key ORDER BY count DESC LIMIT 300`).all(p.from, p.to);
    const series = (kind) => this.series(p, this.q('SELECT day d, sum(count) n FROM an_errors WHERE kind=? AND day BETWEEN ? AND ? GROUP BY day').all(kind, p.from, p.to));
    const list = (kind) => rows.filter((row) => row.kind === kind).map(({ kind: _, ...row }) => row);
    const sessions = this.sessionTotals(p.from, p.to).sessions;
    return { days: this.days(p), js: list('js'), api: list('api'), server: list('server'), sessions, series: { js: series('js'), api: series('api'), server: series('server') } };
  }
  ads(p, f) {
    const counts = this.eventCounts(p, f, ['spot.view', 'spot.click']), places = {};
    for (const [name, list] of Object.entries(counts)) for (const row of list) if (row.key !== '*') (places[row.key] ||= { place: row.key, views: 0, clicks: 0, viewers: 0 })[name === 'spot.view' ? 'views' : 'clicks'] += row.events;
    for (const row of counts['spot.view'] || []) if (places[row.key]) places[row.key].viewers = row.visitors;
    const w = this.filters(f);
    const banner = this.q(`SELECT json_extract(props, '$.target') target, count(*) n FROM an_events WHERE name='spot.click' AND day BETWEEN ? AND ?${w.sql} GROUP BY target`).all(Math.max(p.from, p.today - ANALYTICS_KEEP.raw + 1), p.to, ...w.args);
    return { days: this.days(p), places: Object.values(places).map((row) => ({ ...row, ctr: row.views ? row.clicks / row.views : 0 })).sort((a, b) => b.views - a.views),
      targets: Object.fromEntries(banner.map((row) => [row.target || '', row.n])),
      series: { views: this.dailySeries(p, 'spot.view', f), clicks: this.dailySeries(p, 'spot.click', f) } };
  }
}
export { ENGAGED_BUCKETS };
