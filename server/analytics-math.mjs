// The arithmetic of «Аналитика» (server/analytics.mjs, docs/analytics.md), kept pure so it is tested
// (tests/analytics.test.cjs): the period asked for, browser families from a User-Agent, session numbers,
// weekly retention cohorts, funnels, and what a workshop search may keep of its query.
export const DAY = 86_400_000, MSK = 3 * 3_600_000;
export const mskDay = (ms) => Math.floor((ms + MSK) / DAY);
export const dayStart = (day) => day * DAY - MSK;
export const PERIODS = Object.freeze([1, 7, 30, 90, 365]);
export const MAX_SPAN = 400;
const isoDay = (text) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || '')); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY) : null; };
export const dayISO = (day) => new Date(day * DAY).toISOString().slice(0, 10);

// The period: `days` (1 — today, 7/30/90/365, today included) or `from`–`to` (YYYY-MM-DD, Moscow days, both
// included, up to MAX_SPAN days, not past today). → { from, to, span, prevFrom, prevTo } (day numbers).
export function periodOf({ days, from, to } = {}, now = Date.now()) {
  const today = mskDay(now);
  let start = isoDay(from), end = isoDay(to);
  if (start !== null && end !== null) {
    end = Math.min(end, today); start = Math.min(start, end);
    start = Math.max(start, end - MAX_SPAN + 1);
  } else {
    const span = PERIODS.includes(Number(days)) ? Number(days) : 30;
    end = today; start = today - span + 1;
  }
  const span = end - start + 1;
  return { from: start, to: end, span, prevFrom: start - span, prevTo: start - 1, today };
}

// Families only — never the full User-Agent.
export function uaFamilies(agent = '', { touch = false } = {}) {
  const ua = String(agent);
  const os = /Windows NT/.test(ua) ? 'Windows' : /iPhone|iPod/.test(ua) ? 'iOS' : /iPad/.test(ua) ? 'iPadOS' : /Android/.test(ua) ? 'Android' : /CrOS/.test(ua) ? 'ChromeOS'
    : /Mac OS X|Macintosh/.test(ua) ? (touch ? 'iPadOS' : 'macOS') : /Linux|X11/.test(ua) ? 'Linux' : 'Другая';
  const browser = /YaBrowser|YaSearchBrowser|Yowser/.test(ua) ? 'Яндекс Браузер' : /Edg(e|A|iOS)?\//.test(ua) ? 'Edge' : /OPR\/|Opera|OPX\//.test(ua) ? 'Opera'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Telegram|TelegramBot/.test(ua) ? 'Telegram'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) && /Version\//.test(ua) ? 'Safari' : 'Другой';
  const device = /iPad|Tablet/.test(ua) || os === 'iPadOS' || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'tablet' : /Mobi|iPhone|iPod|Android/.test(ua) ? 'phone' : 'desktop';
  return { os, browser, device };
}

// A run of sessions → the numbers the panel shows. Sessions made from the old counter's visits
// (backfill) have no engaged time and stay out of its averages.
export function sessionSummary(rows) {
  const real = rows.filter((row) => !row.backfill), engaged = real.map((row) => row.engaged).sort((a, b) => a - b);
  const sum = (list) => list.reduce((a, b) => a + b, 0);
  const bounces = rows.filter((row) => row.pages <= 1 && (row.backfill || row.engaged < 10)).length;
  return {
    sessions: rows.length,
    pagesPerSession: rows.length ? sum(rows.map((row) => row.pages)) / rows.length : 0,
    bounceRate: rows.length ? bounces / rows.length : 0,
    avgEngaged: engaged.length ? sum(engaged) / engaged.length : 0,
    medianEngaged: engaged.length ? (engaged.length % 2 ? engaged[(engaged.length - 1) / 2] : (engaged[engaged.length / 2 - 1] + engaged[engaged.length / 2]) / 2) : 0,
    measured: real.length,
  };
}
export const ENGAGED_BUCKETS = Object.freeze([[0, '0–10 с'], [10, '10–30 с'], [30, '30–60 с'], [60, '1–3 мин'], [180, '3–10 мин'], [600, '10–30 мин'], [1800, '30+ мин']]);
export function engagedBuckets(rows) {
  const counts = ENGAGED_BUCKETS.map(([, label]) => ({ label, sessions: 0 }));
  for (const row of rows) { if (row.backfill) continue; let i = 0; while (i + 1 < ENGAGED_BUCKETS.length && row.engaged >= ENGAGED_BUCKETS[i + 1][0]) i += 1; counts[i].sessions += 1; }
  return counts;
}

// Weeks start on Monday (day 0, 1970-01-01, was a Thursday).
export const weekOf = (day) => Math.floor((day + 3) / 7);
export const weekStart = (week) => week * 7 - 3;
// Weekly retention: `firsts` — Map visitor → the day first seen (ever); `active` — [visitor, day] pairs
// of activity. Cohorts are the weeks [fromWeek, toWeek]; for each, its size and how many of it came back
// in week +0, +1, … +maxWeeks (only weeks that have begun by `today`). Week +0 is the cohort itself (100%).
export function retentionCohorts(firsts, active, { fromWeek, toWeek, todayWeek, maxWeeks = 12 }) {
  const seen = new Map();
  for (const [visitor, day] of active) {
    const first = firsts.get(visitor);
    if (first === undefined) continue;
    const cohort = weekOf(first), k = weekOf(day) - cohort;
    if (cohort < fromWeek || cohort > toWeek || k < 0 || k > maxWeeks) continue;
    let weeks = seen.get(cohort);
    if (!weeks) seen.set(cohort, weeks = Array.from({ length: maxWeeks + 1 }, () => new Set()));
    weeks[k].add(visitor);
  }
  const sizes = new Map();
  for (const first of firsts.values()) { const cohort = weekOf(first); if (cohort >= fromWeek && cohort <= toWeek) sizes.set(cohort, (sizes.get(cohort) || 0) + 1); }
  const out = [];
  for (let week = toWeek; week >= fromWeek; week -= 1) {
    const size = sizes.get(week) || 0, weeks = seen.get(week), open = Math.min(maxWeeks, todayWeek - week);
    if (!size) continue;
    out.push({ week, start: weekStart(week), size, weeks: Array.from({ length: open + 1 }, (_, k) => (k === 0 ? size : weeks ? weeks[k].size : 0)) });
  }
  return out;
}

// A funnel: `steps` — [{ id, label, visitors: Set }]. Everyone counted entered at the first step; one
// who got further counts at every step before it too (a later step implies the earlier ones: a file can
// be built only after something was changed, though the old counter saw only the build). → steps with
// the count, the share of the first step and of the step before, and how many dropped off before it.
export function funnelSteps(steps) {
  const entered = steps[0]?.visitors || new Set();
  const reached = steps.map(() => 0);
  for (const visitor of entered) {
    let furthest = 0;
    for (let i = steps.length - 1; i > 0; i -= 1) if (steps[i].visitors.has(visitor)) { furthest = i; break; }
    for (let i = 0; i <= furthest; i += 1) reached[i] += 1;
  }
  return steps.map((step, i) => ({ id: step.id, label: step.label, visitors: reached[i],
    ofFirst: reached[0] ? reached[i] / reached[0] : 0, ofPrevious: i === 0 ? 1 : reached[i - 1] ? reached[i] / reached[i - 1] : 0, dropped: i === 0 ? 0 : reached[i - 1] - reached[i] }));
}

// What a workshop search keeps of its query (docs/analytics.md): a short plain query — a hero, a tag, a
// nickname — lowercased; nothing that looks like a link, an e-mail, a phone or an id. Else '' (the length
// is kept anyway).
export function searchText(query) {
  const text = String(query || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!text || text.length > 32 || /\d{4,}|@|https?:|www\.|\.(?:ru|com|me|net)\b/.test(text) || !/^[\p{L}\p{N} '.-]+$/u.test(text)) return '';
  return text;
}

// The change against the period before, as a share (null when there was nothing before).
export const change = (now, before) => (before ? (now - before) / before : null);
