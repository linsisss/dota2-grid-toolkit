// Yandex Metrika in «Аналитика → Метрика» (docs/analytics.md): read-only, through the Reporting API
// (https://api-metrika.yandex.net/stat/v1/data) with the owner's OAuth token (env METRIKA_TOKEN, scope
// metrika:read; never sent to a page) and the counter of scripts/metrika.mjs. Each report is its own
// request, so one the API refuses leaves the others; the answers are kept an hour per period.
import { METRIKA_ID } from '../scripts/metrika.mjs';

export const METRIKA_API = 'https://api-metrika.yandex.net/stat/v1/data';
// Metrika allows only a few parallel requests per user.
export const METRIKA_PARALLEL = 2;
const LAST = 'lastsign';
// What the tab shows: [id, dimensions, metrics, limit, sort].
export const METRIKA_REPORTS = Object.freeze([
  ['summary', '', 'ym:s:visits,ym:s:users,ym:s:pageviews,ym:s:bounceRate,ym:s:pageDepth,ym:s:avgVisitDurationSeconds,ym:s:percentNewVisitors', 1],
  ['daily', 'ym:s:date', 'ym:s:visits,ym:s:users,ym:s:pageviews', 400, 'ym:s:date'],
  ['sources', `ym:s:${LAST}TrafficSource`, 'ym:s:visits,ym:s:users,ym:s:bounceRate,ym:s:avgVisitDurationSeconds', 20],
  ['engines', `ym:s:${LAST}SearchEngineRoot`, 'ym:s:visits,ym:s:users', 15],
  ['phrases', `ym:s:${LAST}SearchPhrase`, 'ym:s:visits,ym:s:users', 50],
  ['referrers', `ym:s:${LAST}ReferalSource`, 'ym:s:visits,ym:s:users', 30],
  ['social', `ym:s:${LAST}SocialNetwork`, 'ym:s:visits,ym:s:users', 20],
  ['countries', 'ym:s:regionCountry', 'ym:s:visits,ym:s:users', 25],
  ['cities', 'ym:s:regionCity', 'ym:s:visits,ym:s:users', 25],
  ['age', 'ym:s:ageInterval', 'ym:s:visits,ym:s:users', 10],
  ['gender', 'ym:s:gender', 'ym:s:visits,ym:s:users', 5],
  ['devices', 'ym:s:deviceCategory', 'ym:s:visits,ym:s:users,ym:s:bounceRate', 10],
  ['os', 'ym:s:operatingSystemRoot', 'ym:s:visits,ym:s:users', 15],
  ['browsers', 'ym:s:browser', 'ym:s:visits,ym:s:users', 15],
  ['depth', 'ym:s:pageViewsInterval', 'ym:s:visits', 20, 'ym:s:pageViewsInterval'],
  ['duration', 'ym:s:visitDurationInterval', 'ym:s:visits', 20, 'ym:s:visitDurationInterval'],
  ['landings', 'ym:s:startURL', 'ym:s:visits,ym:s:users,ym:s:bounceRate,ym:s:avgVisitDurationSeconds', 30],
].map(([id, dimensions, metrics, limit, sort]) => ({ id, dimensions, metrics: metrics.split(','), limit, sort: sort || (dimensions ? `-${metrics.split(',')[0]}` : '') })));

// One report's rows: { name, values: { metric: number } }, from the API's answer.
export function metrikaRows(report, answer) {
  const short = (metric) => metric.replace(/^ym:s:/, '');
  const rows = (answer?.data || []).map((row) => ({ name: row.dimensions?.map((d) => d?.name ?? '').join(' · ') || '', id: row.dimensions?.[0]?.id ?? null,
    values: Object.fromEntries(report.metrics.map((metric, i) => [short(metric), Number(row.metrics?.[i]) || 0])) }));
  const totals = Object.fromEntries(report.metrics.map((metric, i) => [short(metric), Number(answer?.totals?.[i]) || 0]));
  return { rows, totals, sampled: !!answer?.sampled };
}

export class Metrika {
  constructor({ token = '', counter = METRIKA_ID, fetcher = globalThis.fetch, now = Date.now, ttl = 3_600_000, retryDelay = 1200 } = {}) {
    this.token = token; this.counter = counter; this.fetcher = fetcher; this.now = now; this.ttl = ttl; this.retryDelay = retryDelay; this.cache = new Map();
  }
  get configured() { return !!this.token; }
  async request(report, date1, date2) {
    const url = new URL(METRIKA_API);
    const params = { ids: String(this.counter), date1, date2, metrics: report.metrics.join(','), limit: String(report.limit), lang: 'ru', accuracy: 'full', ...(report.dimensions ? { dimensions: report.dimensions } : {}), ...(report.sort ? { sort: report.sort } : {}) };
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await this.fetcher(url, { headers: { Authorization: `OAuth ${this.token}` }, signal: AbortSignal.timeout(20_000) });
    let body = null;
    try { body = await response.json(); } catch { /* Not JSON. */ }
    if (!response.ok) {
      const message = body?.message || body?.errors?.[0]?.message || `HTTP ${response.status}`;
      throw Object.assign(new Error(response.status === 403 || response.status === 401 ? `Метрика не пустила (${response.status}): проверь токен и доступ к счётчику. ${message}` : `Метрика ответила ошибкой: ${message}`), { status: response.status });
    }
    return metrikaRows(report, body);
  }
  // Every report for [date1, date2] (YYYY-MM-DD). → { configured, counter, date1, date2, reports: { id: { rows, totals } | { error } } }.
  async report(date1, date2) {
    if (!this.configured) return { configured: false, counter: this.counter };
    const key = `${date1}:${date2}`, hit = this.cache.get(key), now = this.now();
    if (hit && now - hit.at < this.ttl) return hit.value;
    // Two at a time, and once more after a pause when Metrika refuses for its quota of parallel requests
    // (2026-10-19: all 17 at once, most were refused) or answers 429.
    const results = [], queue = METRIKA_REPORTS.map((report, i) => [report, i]);
    const attempt = async (report) => {
      for (let tries = 0; ; tries++) {
        try { return { status: 'fulfilled', value: await this.request(report, date1, date2) }; }
        catch (error) {
          const busy = error.status === 429 || /квот|quota|parallel|параллельн/i.test(error.message);
          if (!busy || tries >= 3) return { status: 'rejected', reason: error };
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay * (tries + 1)));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(METRIKA_PARALLEL, queue.length) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) results[next[1]] = await attempt(next[0]);
    }));
    const reports = Object.fromEntries(METRIKA_REPORTS.map((report, i) => [report.id, results[i].status === 'fulfilled' ? results[i].value : { error: results[i].reason?.message || 'Ошибка' }]));
    const value = { configured: true, counter: this.counter, date1, date2, generated: now, reports };
    // A period where every report failed is not kept: the next look tries again.
    if (results.some((result) => result.status === 'fulfilled')) { this.cache.set(key, { at: now, value }); if (this.cache.size > 30) this.cache.delete(this.cache.keys().next().value); }
    return value;
  }
}
