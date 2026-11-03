// «Мета героев» in Dota itself (2026-11-02, the owner: «мету … в "Героях" и в момент пика в игре … топ 10 героев на
// каждую позицию, а так же нажать на него чтобы увидеть сборки»). Panorama cannot ask the internet from a script
// ($.AsyncWebRequest sends nothing, tests 6–7), but a web panel (HTML, Steam's browser) can, and Dota tells the script
// every address the panel lands on (HTMLURLChanged; only real loads, tests 11–12). So the widget points a collapsed web
// panel at /w/meta or /w/build, the server answers with a redirect to /w/ok?…&d=<data>, and the widget reads the data
// off that address and draws it with Dota's own panels (scripts/meta-widget.mjs). The data is short text, never JSON:
//   meta   week|p1|…|p5, a position = id:name:wins:share,… — by default the META_TOP best by wins among heroes with
//          META_SHARE of its games; asked with n (11-03, the widget sorts by wins or by pick rate itself): the n most
//          played with at least half of that, in no order
//   build  start|boots|core|more|abilities|skills|talents: an item = Valve's name without «item_» (core and more:
//          name@minute); abilities = the hero's leveled abilities by slot (Valve's names); skills = the skill points in
//          order, each the row of its ability (1…) or «t» for a talent; talents = four tiers (10, 15, 20, 25), each
//          side~left~right with the texts URI-encoded, side 0 or 1 the one most players take
// The items' names and costs come from STRATZ's constants, what they are made of from OpenDota's (STRATZ gives no
// recipes). The skill order (2026-11-02, the owner: «сделай показ прокачки скиллов») is the most common one, point by
// point, of the hero's STRATZ guides on that position (strong players' recent games, whatever the ranks asked); the
// talents are the ranks' own picks. A build is kept BUILD_TTL per hero, position, ranks and language.
import { META_BRACKETS, META_SHARE } from '../scripts/hero-meta.mjs';
import HEROES from '../scripts/hero-portraits-data.mjs';
import { CatalogError } from './catalog-store.mjs';

export const META_TOP = 10;
export const META_MOST = 60;
export const BUILD_TTL = 12 * 3_600_000;
const ITEMS_TTL = 24 * 3_600_000, ENDPOINT = 'https://api.stratz.com/graphql', BUILDS_KEPT = 600;
export const ITEM_PARTS_URL = 'https://raw.githubusercontent.com/odota/dotaconstants/master/build/items.json';
// The talents (2026-11-03, the owner: «много героев у которых вместо талантов - просто»): STRATZ's constants miss whole
// talents of reworked heroes (Phantom Lancer: 3 of 8), so the tree comes from OpenDota's constants (every hero's eight
// by level, their English texts with the numbers), the Russian texts from STRATZ or, where it has none, from Dota's own
// localization (abilities_russian.txt of dota_vpk_updates) with OpenDota's numbers put in. Kept LORE_TTL.
export const TALENT_TREES_URL = 'https://raw.githubusercontent.com/odota/dotaconstants/master/build/hero_abilities.json';
export const TALENT_TEXTS_URL = 'https://raw.githubusercontent.com/odota/dotaconstants/master/build/abilities.json';
export const VALVE_ABILITIES_RU_URL = 'https://raw.githubusercontent.com/spirit-bear-productions/dota_vpk_updates/main/resource/localization/abilities_russian.txt';
const LORE_TTL = 24 * 3_600_000;
const POSITION = (p) => `POSITION_${p}`;
// What a build shows: starting items (as bought), two boots, then the finished items most players buy (core, by the
// minute they are bought) and the ones fewer do (more). Cheap parts, consumables and neutral items are left out.
export const BUILD_RULES = Object.freeze({ start: 6, boots: 2, core: 6, more: 6, coreShare: 0.3, moreShare: 0.08, minCost: 1300, guides: 12, points: 19 });
export const META_LANGUAGES = Object.freeze({ ru: 'RUSSIAN', en: 'ENGLISH' });

const heroName = (id) => HEROES[id]?.name || '';
const percent = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const safe = (name) => /^[a-z0-9_]{1,40}$/.test(name);

// The meta (HeroMeta.get's answer) as the widget's text: the best `top` by wins, or (`most`) the most played.
export function metaText(meta, top = META_TOP, { most = 0 } = {}) {
  const positions = meta.positions.map((rows) => {
    const total = rows.reduce((sum, row) => sum + row.matches, 0), floor = most ? META_SHARE / 2 : META_SHARE;
    return rows.filter((row) => row.matches >= total * floor && safe(heroName(row.id)))
      .sort(most ? (a, b) => b.matches - a.matches : (a, b) => b.wins / b.matches - a.wins / a.matches).slice(0, most || top)
      .map((row) => `${row.id}:${heroName(row.id)}:${percent(row.wins, row.matches)}:${percent(row.matches, total)}`).join(',');
  });
  return [meta.week || '', ...positions].join('|');
}

// The items of a build as STRATZ's own hero page shows them (v=2, 2026-11-03; the owner compared the widget with it): the
// starting items, the boots and the items of each phase of the game — early (before 15 min), mid (15–35), late (35+) —
// each with its pick rate (in % of the hero's games) and win rate: start|boots|early|mid|late, an item
// name@pick@wins. Consumables (but at the start), neutral items and cheap parts go; the widget orders by either rate.
export const PHASES = Object.freeze([['early', 0, 15], ['mid', 15, 35], ['late', 35, Infinity]]);
export const ITEM_RULES = Object.freeze({ start: 8, boots: 4, phase: 10, floor: 2, cheapPart: 1100, cheap: 300 });
export function itemsText({ start = [], boots = [], full = [] }, items) {
  const name = (id) => (items[id] && safe(items[id].name) ? items[id].name : '');
  const games = Math.max(1, ...start.map((row) => row.matchCount || 0), ...boots.map((row) => row.matchCount || 0));
  const one = (n) => Math.round(n * 10) / 10;
  const stat = (key, matches, wins) => `${key}@${one((matches / games) * 100)}@${one(matches ? (wins / matches) * 100 : 0)}`;
  const firsts = new Map();
  for (const row of start) if (!row.wasGiven && (row.instance || 0) === 0 && name(row.itemId)) {
    const seen = firsts.get(row.itemId) || [0, 0];
    firsts.set(row.itemId, [seen[0] + (row.matchCount || 0), seen[1] + (row.winCount || 0)]);
  }
  const startList = [...firsts].sort((a, b) => b[1][0] - a[1][0]).slice(0, ITEM_RULES.start).map(([id, [m, w]]) => stat(name(id), m, w));
  const bootRows = boots.filter((row) => name(row.itemId)).sort((a, b) => b.matchCount - a.matchCount);
  const bootIds = new Set(bootRows.map((row) => row.itemId));
  const finished = bootRows.filter((row) => name(row.itemId) !== 'boots');
  const bootList = (finished.length ? finished : bootRows).slice(0, ITEM_RULES.boots).map((row) => stat(name(row.itemId), row.matchCount || 0, row.winCount || 0));
  const phases = PHASES.map(([, from, to]) => {
    const bought = new Map();
    for (const row of full) {
      const item = items[row.itemId], time = row.time || 0;
      if (time < from || time >= to || !item || !name(row.itemId) || item.neutral || item.quality === 'consumable' || bootIds.has(row.itemId)
        || item.cost < ITEM_RULES.cheap || (item.quality === 'component' && item.cost < ITEM_RULES.cheapPart)) continue;
      const seen = bought.get(row.itemId) || [0, 0];
      bought.set(row.itemId, [seen[0] + (row.matchCount || 0), seen[1] + (row.winCount || 0)]);
    }
    return [...bought].filter(([, [m]]) => (m / games) * 100 >= ITEM_RULES.floor).sort((a, b) => b[1][0] - a[1][0]).slice(0, ITEM_RULES.phase)
      .map(([id, [m, w]]) => stat(name(id), m, w)).join(',');
  });
  return [startList.join(','), bootList.join(','), ...phases].join('|');
}

// v1 (the first widgets, tests 13–15): STRATZ's purchases of a hero on a position as the widget's build text. `items`: id → { name, cost, quality, neutral,
// parts: [names] }. A finished item that is itself a part of another one in the list is left out (Oblivion Staff under
// Orchid, Soul Booster under Octarine Core), and so are plain Boots next to finished ones.
export function buildText({ start = [], boots = [], full = [] }, items) {
  const name = (id) => (items[id] && safe(items[id].name) ? items[id].name : '');
  const games = Math.max(1, ...start.map((row) => row.matchCount || 0), ...boots.map((row) => row.matchCount || 0));
  // Starting items in the order most players buy them, each once (two tangos are one tango).
  const firsts = [...new Set(start.filter((row) => !row.wasGiven && name(row.itemId)).sort((a, b) => b.matchCount - a.matchCount).map((row) => row.itemId))]
    .slice(0, BUILD_RULES.start).map(name);
  const shoes = boots.filter((row) => name(row.itemId)).sort((a, b) => b.matchCount - a.matchCount).map((row) => name(row.itemId));
  const finished = shoes.filter((one) => one !== 'boots');
  shoes.splice(0, shoes.length, ...(finished.length ? finished : shoes).slice(0, BUILD_RULES.boots));
  // The finished items: how many bought each, and the minute half of them had it by.
  const bought = new Map();
  for (const row of full) {
    const item = items[row.itemId];
    if (!item || !name(row.itemId) || item.neutral || item.quality === 'consumable' || item.cost < BUILD_RULES.minCost || shoes.includes(item.name)) continue;
    const one = bought.get(row.itemId) || { count: 0, times: [] };
    one.count += row.matchCount || 0; one.times.push([row.time || 0, row.matchCount || 0]);
    bought.set(row.itemId, one);
  }
  const median = (times) => { const half = times.reduce((sum, [, n]) => sum + n, 0) / 2; let seen = 0; for (const [t, n] of times.sort((a, b) => a[0] - b[0])) { seen += n; if (seen >= half) return t; } return 0; };
  const listed = [...bought].filter(([, one]) => one.count / games >= BUILD_RULES.moreShare).map(([id]) => id);
  const parts = new Set(listed.flatMap((id) => items[id].parts || []));
  const ranked = [...bought].filter(([id]) => !parts.has(items[id].name)).map(([id, one]) => ({ name: name(id), share: one.count / games, minute: median(one.times) })).sort((a, b) => b.share - a.share);
  const pick = (from, to, size) => ranked.filter((one) => one.share >= from && one.share < to).slice(0, size).sort((a, b) => a.minute - b.minute).map((one) => `${one.name}@${one.minute}`);
  return [firsts.join(','), shoes.join(','), pick(BUILD_RULES.coreShare, Infinity, BUILD_RULES.core).join(','), pick(BUILD_RULES.moreShare, BUILD_RULES.coreShare, BUILD_RULES.more).join(',')].join('|');
}

// The most common skill order of the guides' games, point by point (each game a list of ability ids as leveled), with
// the hero's leveled abilities as rows by slot. `hero`: { abilities: [{ slot, id, name }], talents: [{ slot, id }] }.
// A point is a talent when the id is one of the hero's talents, any «special_bonus» or an id STRATZ does not know (a
// talent newer than its constants: left out, it moved every later point a level up).
export function skillsText(games, hero, names = new Map()) {
  const rowOf = new Map(hero.abilities.filter((one) => safe(one.name) && one.name !== 'generic_hidden').sort((a, b) => a.slot - b.slot).map((one) => [one.id, one]));
  const isTalent = (id) => !rowOf.has(id) && (hero.talents.some((one) => one.id === id) || !names.has(id) || /^special_bonus/.test(names.get(id)));
  const talentIds = { has: isTalent };
  const sequences = games.map((ids) => ids.filter((id) => talentIds.has(id) || rowOf.has(id))).filter((ids) => ids.length >= 6);
  const order = [];
  for (let point = 0; point < BUILD_RULES.points; point += 1) {
    const counts = new Map();
    for (const ids of sequences) if (ids[point] !== undefined) { const key = talentIds.has(ids[point]) ? 't' : ids[point]; counts.set(key, (counts.get(key) || 0) + 1); }
    if (!counts.size) break;
    order.push([...counts].sort((a, b) => b[1] - a[1])[0][0]);
  }
  const used = [...rowOf.values()].filter((one) => order.includes(one.id));
  const row = new Map(used.map((one, i) => [one.id, i + 1]));
  return [used.map((one) => one.name).join(','), order.map((key) => (key === 't' ? 't' : row.get(key))).join(',')];
}
// The four talent tiers as Dota's tree shows them (the owner, 2026-11-03: «таланты будто отзеркалены»): of a level's
// two talents in the hero's file the first stands on the right, the second on the left. `tree`: [[name, level]] (OpenDota),
// `text(name)`: the talent's words; `picks`: name → games it was taken in (STRATZ, for the ranks), `games`: the hero's
// games on the position. The side lit is the one taken more; with one side unknown to STRATZ, the known one when taken
// in a good share of the games (less is asked at the levels fewer games reach), the other when hardly ever; else none.
// `games`: the same set's games (STRATZ's starting purchases).
// A tier: side~left~right, side 0 (left), 1 (right) or - (none), the texts URI-encoded.
const REACH = [0.4, 0.35, 0.25, 0.15];
export function talentsText(tree, text, picks, games) {
  const tiers = [];
  for (let level = 1; level <= 4; level += 1) {
    const pair = tree.filter(([, at]) => at === level).map(([name]) => name);
    const right = pair[0] || '', left = pair[1] || '';
    const l = left ? picks.get(left) : undefined, r = right ? picks.get(right) : undefined, floor = REACH[level - 1] * Math.max(1, games);
    let side = '-';
    if (l !== undefined && r !== undefined) side = l === r ? '-' : r > l ? '1' : '0';
    else if (l !== undefined) side = l >= floor ? '0' : l < floor / 3 && right ? '1' : '-';
    else if (r !== undefined) side = r >= floor ? '1' : r < floor / 3 && left ? '0' : '-';
    tiers.push([side, encodeURIComponent(left ? text(left) : ''), encodeURIComponent(right ? text(right) : '')].join('~'));
  }
  return tiers.some((tier) => /~[^~]/.test(tier)) ? tiers.join(',') : '';
}
// Dota's Russian template with OpenDota's numbers in its places ({s:…}, in order); null when they do not match.
export function fillTemplate(template, english) {
  if (!template || !english) return null;
  const numbers = english.match(/\d+(?:\.\d+)?/g) || [], places = template.match(/\{s:[^}]+\}/g) || [];
  if (places.length !== numbers.length || !places.length) return null;
  let i = 0;
  return template.replace(/\{s:[^}]+\}/g, () => numbers[i++]).replace(/%%/g, '%').replace(/<[^>]*>/g, '').trim();
}

export class MetaWidget {
  constructor({ heroMeta, token = '', fetch = globalThis.fetch, now = Date.now } = {}) {
    Object.assign(this, { heroMeta, token, fetch, now });
    this.builds = new Map();  // hero:position:bracket → { at, value } or { pending }
    this.items = null;
  }
  async meta(bracket, most = 0) { return metaText(await this.heroMeta.get(bracket), META_TOP, { most: Math.max(0, Math.min(META_MOST, most | 0)) }); }
  async build(hero, position, bracket, lang = 'ru', version = 1) {
    if (!heroName(hero)) throw new CatalogError(400, 'Неизвестный герой.');
    if (!(position >= 1 && position <= 5)) throw new CatalogError(400, 'Неизвестная позиция.');
    if (!Object.hasOwn(META_BRACKETS, bracket)) throw new CatalogError(400, 'Неизвестная группа рангов.');
    if (!Object.hasOwn(META_LANGUAGES, lang)) lang = 'ru';
    if (!this.token) throw new CatalogError(503, 'Мета пока недоступна.');
    const key = `${hero}:${position}:${bracket}:${lang}:${version}`, kept = this.builds.get(key);
    if (kept?.value && this.now() - kept.at < BUILD_TTL) return kept.value;
    if (kept?.pending) return kept.pending;
    const pending = this.load(hero, position, bracket, lang, version).then((value) => {
      this.builds.delete(key); this.builds.set(key, { at: this.now(), value });
      while (this.builds.size > BUILDS_KEPT) this.builds.delete(this.builds.keys().next().value);
      return value;
    }, (error) => { if (kept?.value) return kept.value; this.builds.delete(key); throw error; });
    this.builds.set(key, { ...kept, pending });
    return pending;
  }
  // Two questions to STRATZ: the ranks' purchases and talents, the guides and the hero's abilities; then the guides'
  // games and the talents' texts.
  async load(hero, position, bracket, lang, version) {
    const [first, items, lore] = await Promise.all([this.ask(buildQuery(hero, position, bracket)), this.itemTable(), this.lore()]);
    const stats = first?.data?.heroStats, constants = first?.data?.constants?.hero;
    if (!stats || !constants) throw new CatalogError(502, 'STRATZ вернул пустой ответ.');
    const abilities = (constants.abilities || []).map((one) => ({ slot: one.slot, id: one.abilityId, name: one.ability?.name || '' })).filter((one) => Number.isSafeInteger(one.id));
    const talents = (constants.talents || []).filter((one) => Number.isSafeInteger(one.abilityId) && Number.isSafeInteger(one.slot)).map((one) => ({ slot: one.slot, id: one.abilityId }));
    const matches = (stats.guides || []).flatMap((list) => list?.guides || []).map((one) => one?.matchId).filter((id) => Number.isSafeInteger(id)).slice(0, BUILD_RULES.guides);
    const second = matches.length ? await this.ask(`{ ${matches.map((id, i) => `m${i}: match(id: ${id}) { players { heroId abilities { abilityId } } }`).join(' ')} }`).catch(() => null) : null;
    const games = matches.map((_, i) => (second?.data?.[`m${i}`]?.players || []).find((player) => player?.heroId === hero)?.abilities?.map((one) => one?.abilityId) || []);
    // The talents: the tree and the English words from OpenDota, the Russian ones from STRATZ or Dota's template.
    const tree = lore.trees.get(heroName(hero)) || [];
    const text = (name) => String((lang === 'ru' && (lore.ru.get(name) || fillTemplate(lore.valve.get(name), lore.en.get(name)))) || lore.en.get(name) || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    const picks = new Map();
    for (const one of stats.talents || []) { const name = lore.names.get(one.abilityId); if (name) picks.set(name, (picks.get(name) || 0) + (one.matchCount || 0)); }
    // The games the talents were counted over: STRATZ's own count of the same set, its starting purchases (the week's meta is another set).
    const played = Math.max(1, ...(stats.start || []).map((row) => row.matchCount || 0));
    const hero_ = { abilities, talents };
    return [version === 2 ? itemsText(stats, items) : buildText(stats, items), ...skillsText(games, hero_, lore.names), talentsText(tree, text, picks, played)].join('|');
  }
  // OpenDota's talent trees and words, STRATZ's ability names (by id) and Russian words, Dota's Russian templates; a day.
  async lore() {
    if (this.lored?.value && this.now() - this.lored.at < LORE_TTL) return this.lored.value;
    if (this.lored?.pending) return this.lored.pending;
    const kept = this.lored;
    const json = (url) => this.fetch(url, { signal: AbortSignal.timeout(30_000) }).then((response) => (response.ok ? response.json() : null)).catch(() => null);
    const plain = (url) => this.fetch(url, { signal: AbortSignal.timeout(30_000) }).then((response) => (response.ok ? response.text() : '')).catch(() => '');
    const pending = Promise.all([json(TALENT_TREES_URL), json(TALENT_TEXTS_URL), plain(VALVE_ABILITIES_RU_URL),
      this.ask('{ constants { abilities(language: RUSSIAN) { id name language { displayName } } } }').catch(() => null)]).then(([trees, words, valve, stratz]) => {
      const value = { trees: new Map(), en: new Map(), valve: new Map(), names: new Map(), ru: new Map() };
      for (const [key, hero] of Object.entries(trees || {})) if (/^npc_dota_hero_/.test(key) && Array.isArray(hero?.talents))
        value.trees.set(key.slice(14), hero.talents.filter((one) => /^special_bonus_[a-z0-9_]{1,90}$/.test(one?.name || '') && one.level >= 1 && one.level <= 4).map((one) => [one.name, one.level]));
      for (const [name, one] of Object.entries(words || {})) if (/^special_bonus/.test(name) && typeof one?.dname === 'string') value.en.set(name, one.dname);
      for (const [, name, line] of String(valve).matchAll(/"DOTA_Tooltip_ability_(special_bonus_[a-z0-9_]+)"\s+"([^"\n]*)"/gi)) value.valve.set(name.toLowerCase(), line);
      for (const one of stratz?.data?.constants?.abilities || []) if (Number.isSafeInteger(one?.id) && typeof one.name === 'string') {
        value.names.set(one.id, one.name);
        if (one.language?.displayName && /^special_bonus/.test(one.name)) value.ru.set(one.name, one.language.displayName);
      }
      if (!value.trees.size && kept?.value) return kept.value;
      this.lored = { at: this.now(), value };
      return value;
    }, (error) => { if (kept?.value) { this.lored = kept; return kept.value; } this.lored = null; throw error; });
    this.lored = { ...kept, pending };
    return pending;
  }
  async itemTable() {
    if (this.items?.value && this.now() - this.items.at < ITEMS_TTL) return this.items.value;
    if (this.items?.pending) return this.items.pending;
    const kept = this.items;
    // Without OpenDota's recipes a build only keeps some parts in it.
    const recipes = this.fetch(ITEM_PARTS_URL, { signal: AbortSignal.timeout(15_000) }).then((response) => (response.ok ? response.json() : {})).catch(() => ({}));
    const pending = Promise.all([this.ask('{ constants { items { id shortName stat { cost quality neutralItemTier } } } }'), recipes]).then(([data, made]) => {
      const value = {};
      for (const item of data?.data?.constants?.items || []) if (Number.isSafeInteger(item?.id) && typeof item.shortName === 'string')
        value[item.id] = { name: item.shortName, cost: Number(item.stat?.cost) || 0, quality: item.stat?.quality || '', neutral: item.stat?.neutralItemTier != null,
          parts: (Array.isArray(made?.[item.shortName]?.components) ? made[item.shortName].components : []).filter((part) => typeof part === 'string' && part) };
      if (!Object.keys(value).length) throw new CatalogError(502, 'STRATZ вернул пустой ответ.');
      this.items = { at: this.now(), value };
      return value;
    }, (error) => { if (kept?.value) { this.items = kept; return kept.value; } this.items = null; throw error; });
    this.items = { ...kept, pending };
    return pending;
  }
  async ask(query) {
    let response;
    try {
      response = await this.fetch(ENDPOINT, {
        method: 'POST', signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', 'User-Agent': 'STRATZ_API' },
        body: JSON.stringify({ query })
      });
    } catch { throw new CatalogError(502, 'STRATZ не отвечает. Попробуй позже.'); }
    if (!response.ok) throw new CatalogError(502, 'STRATZ не отвечает. Попробуй позже.');
    return response.json().catch(() => null);
  }
}
// Numbers and enum names only go into the query (no user text). The rank groups are STRATZ's basic brackets by name
// (herald_guardian → HERALD_GUARDIAN); `all` asks for every rank.
function buildQuery(hero, position, bracket) {
  const where = `heroId: ${hero}, positionIds: [${POSITION(position)}]${META_BRACKETS[bracket] ? `, bracketBasicIds: [${bracket.toUpperCase()}]` : ''}`;
  return `{ heroStats { start: itemStartingPurchase(${where}) { itemId instance wasGiven matchCount winCount } boots: itemBootPurchase(${where}) { itemId matchCount winCount } full: itemFullPurchase(${where}) { itemId time matchCount winCount } talents: talent(${where}) { abilityId matchCount } guides: guide(heroId: ${hero}, positionId: ${POSITION(position)}, take: ${BUILD_RULES.guides}) { guides { matchId } } } constants { hero(id: ${hero}) { abilities { slot abilityId ability { name } } talents { slot abilityId } } } }`;
}
