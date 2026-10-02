// Hero meta for grids (docs/catalog.md «Мета»): every hero's ranked All Pick games and wins on each of
// the five positions, for a group of ranks, over the last week STRATZ has (https://stratz.com/api).
// The server asks with its own key (STRATZ_API_TOKEN, never sent to browsers) and keeps an answer for
// META_TTL per rank group; while STRATZ fails, the last answer is served. scripts/hero-meta.mjs ranks.
import { META_BRACKETS } from '../scripts/hero-meta.mjs';
import { CatalogError } from './catalog-store.mjs';

export const META_TTL = 6 * 3_600_000;
const ENDPOINT = 'https://api.stratz.com/graphql';
const POSITIONS = ['POSITION_1', 'POSITION_2', 'POSITION_3', 'POSITION_4', 'POSITION_5'];

// One request for the five positions. Ranks are enum names, written into the query (no user text).
function query(ranks) {
  const brackets = ranks ? `bracketIds: [${ranks.join(', ')}], ` : '';
  return `{ heroStats { ${POSITIONS.map((position, i) =>
    `p${i + 1}: winWeek(take: 1, ${brackets}positionIds: [${position}], gameModeIds: [ALL_PICK_RANKED], groupBy: HERO_ID) { week heroId winCount matchCount }`).join(' ')} } }`;
}
// [[{ id, wins, matches }] × 5] and the week (its first day, YYYY-MM-DD), from STRATZ's answer.
function readAnswer(data) {
  const stats = data?.data?.heroStats;
  if (!stats) throw new CatalogError(502, 'STRATZ вернул пустой ответ.');
  let week = 0;
  const positions = POSITIONS.map((_, i) => (Array.isArray(stats[`p${i + 1}`]) ? stats[`p${i + 1}`] : []).filter((row) =>
    Number.isSafeInteger(row?.heroId) && row.heroId > 0 && Number.isSafeInteger(row.matchCount) && row.matchCount > 0
      && Number.isSafeInteger(row.winCount) && row.winCount >= 0 && row.winCount <= row.matchCount)
    .map((row) => { week = Math.max(week, Number(row.week) || 0); return { id: row.heroId, wins: row.winCount, matches: row.matchCount }; }));
  if (!positions.some((rows) => rows.length)) throw new CatalogError(502, 'STRATZ вернул пустой ответ.');
  return { week: week ? new Date(week * 1000).toISOString().slice(0, 10) : null, positions };
}

export class HeroMeta {
  constructor({ token = '', fetch = globalThis.fetch, now = Date.now, ttl = META_TTL } = {}) {
    Object.assign(this, { token, fetch, now, ttl });
    this.cache = new Map();  // bracket → { at, value } or { pending }
  }
  get available() { return !!this.token; }
  async get(bracket) {
    if (!Object.hasOwn(META_BRACKETS, bracket)) throw new CatalogError(400, 'Неизвестная группа рангов.');
    if (!this.token) throw new CatalogError(503, 'Мета пока недоступна.');
    const kept = this.cache.get(bracket);
    if (kept?.value && this.now() - kept.at < this.ttl) return kept.value;
    if (kept?.pending) return kept.pending;
    const pending = this.load(bracket).then((value) => {
      this.cache.set(bracket, { at: this.now(), value });
      return value;
    }, (error) => {
      // An older answer is better than none while STRATZ is down.
      if (kept?.value) { this.cache.set(bracket, { ...kept, at: this.now() - this.ttl + 10 * 60_000 }); return kept.value; }
      this.cache.delete(bracket);
      throw error;
    });
    this.cache.set(bracket, { ...kept, pending });
    return pending;
  }
  async load(bracket) {
    let response;
    try {
      response = await this.fetch(ENDPOINT, {
        method: 'POST', signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', 'User-Agent': 'STRATZ_API' },
        body: JSON.stringify({ query: query(META_BRACKETS[bracket]) })
      });
    } catch { throw new CatalogError(502, 'STRATZ не отвечает. Попробуй позже.'); }
    if (!response.ok) throw new CatalogError(502, 'STRATZ не отвечает. Попробуй позже.');
    const value = readAnswer(await response.json().catch(() => null));
    return { bracket, updated: this.now(), ...value };
  }
}
