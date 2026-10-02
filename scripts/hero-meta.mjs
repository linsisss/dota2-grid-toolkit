// Hero meta (docs/catalog.md «Мета»): which heroes are strong on a position, from STRATZ's week of
// ranked All Pick (server/hero-meta.mjs fetches it). Shared by the server, the editor and tests.

// Rank groups the user picks from, as STRATZ's RankBracket names; `all` asks for every rank.
export const META_BRACKETS = Object.freeze({
  herald_guardian: ['HERALD', 'GUARDIAN'], crusader_archon: ['CRUSADER', 'ARCHON'],
  legend_ancient: ['LEGEND', 'ANCIENT'], divine_immortal: ['DIVINE', 'IMMORTAL'], all: null
});
// Named as the Russian client names the ranks (the page translates them, i18n): Рекрут, Страж,
// Рыцарь, Герой, Легенда, Властелин, Божество, Титан.
export const META_BRACKET_NAMES = Object.freeze({
  herald_guardian: 'Рекрут–Страж', crusader_archon: 'Рыцарь–Герой', legend_ancient: 'Легенда–Властелин', divine_immortal: 'Божество–Титан', all: 'Все ранги'
});
// The rank medals (assets/ranks/rank1…8, from the game's rank_tier_icons) each group shows.
export const META_BRACKET_MEDALS = Object.freeze({
  herald_guardian: [1, 2], crusader_archon: [3, 4], legend_ancient: [5, 6], divine_immortal: [7, 8], all: [1, 5, 8]
});
// The user's choice (02.10.2026): high ranks by default; a row of ten heroes a position with their
// pick and win rates under them (core addMetaConfig), so at most ten.
export const META_DEFAULTS = Object.freeze({ bracket: 'divine_immortal', size: 10 });
export const META_SIZES = Object.freeze([5, 8, 10]);
// The five positions, named as the editor's «По ролям» template names its groups.
export const META_POSITIONS = Object.freeze(['КЕРРИ', 'МИД', 'ОФФЛЕЙН', 'ПОДДЕРЖКА', 'ПОЛНАЯ ПОДДЕРЖКА']);
// The same in the window's buttons (with the game's position icons, assets/ranks/position1…5).
export const META_POSITION_TITLES = Object.freeze(['Керри', 'Мид', 'Оффлейн', 'Поддержка', 'Полная поддержка']);
// A hero counts on a position when it has at least this share of the position's games, so a rare pick
// with 60 % in 200 games does not top the list (the user's choice: win rate with a popularity floor).
// Every match has two players on each position, so the share is half the pick rate: 1 % is 2 %.
export const META_SHARE = 0.01;

// One position's heroes that pass META_SHARE, strongest first: { id, winRate, pickRate (of matches,
// on this position), share, matches }.
export function rankHeroes(rows = [], { share = META_SHARE, known = null } = {}) {
  const total = rows.reduce((sum, row) => sum + row.matches, 0);
  if (!total) return [];
  return rows.filter((row) => row.matches / total >= share && (!known || known.has(row.id)))
    .map((row) => ({ id: row.id, winRate: row.wins / row.matches, pickRate: (2 * row.matches) / total, share: row.matches / total, matches: row.matches }))
    .sort((a, b) => b.winRate - a.winRate || b.matches - a.matches || a.id - b.id);
}
// A rate as the grid writes it under a portrait: percent with one decimal, no sign («53,2»; the
// legend says «%»), in the page's language.
export const metaNumber = (value, locale = 'ru-RU') => (value * 100).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// The five groups of a meta grid: hero ids per position, `size` of them (0: all that pass).
export function metaGroups(meta, size = META_DEFAULTS.size, known = null) {
  return meta.positions.map((rows) => {
    const ranked = rankHeroes(rows, { known }).map((hero) => hero.id);
    return size ? ranked.slice(0, size) : ranked;
  });
}
// A group's heroes in meta order for one position: those that pass META_SHARE strongest first, the
// rest after them as they were. No hero is added or removed.
export function orderByMeta(heroIds, rows) {
  const rank = new Map(rankHeroes(rows).map((hero, i) => [hero.id, i]));
  const ranked = heroIds.filter((id) => rank.has(id)).sort((a, b) => rank.get(a) - rank.get(b));
  return [...ranked, ...heroIds.filter((id) => !rank.has(id))];
}
// The position a group is for, by its name (the «По ролям» and meta templates' names), else carry.
export function positionOfGroup(name = '') {
  const text = String(name).toUpperCase();
  if (/ПОЛН|ХАРД ?САП|HARD|ПЯТ|\b5\b|POS ?5/.test(text)) return 4;
  if (/ПОДДЕРЖ|САППОРТ|SUPPORT|\b4\b|POS ?4/.test(text)) return 3;
  if (/ОФФ|OFF|ХАРД|\b3\b|POS ?3/.test(text)) return 2;
  if (/МИД|MID|\b2\b|POS ?2/.test(text)) return 1;
  return 0;
}
