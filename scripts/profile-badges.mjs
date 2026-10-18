// Profile badges (asked for on 2026-10-02): admins give the first four on a creator's profile
// (server/profiles.mjs setBadge, POST /admin/profiles/<key>/badges); «Модератор» (2026-10-04) shows while the
// account has the moderator role (server/moderators.mjs) and goes with it; the like ones come by themselves
// from the likes on the creator's published grids, backgrounds and guides — only the higher one shows.
// Shared by the server and the pages (src/catalog/Badges.jsx). How a badge looks: a small medal drawn by
// scripts/badge-marks.mjs (by `id`; «Медали Dota», 2026-10-18); `rare` ones (gold, the wax seal) come first
// wherever badges are listed.
export const BADGES = Object.freeze([
  { id: 'developer', label: 'Разработчик', hint: 'Делает GridStudio', rare: true },
  { id: 'moderator', label: 'Модератор', hint: 'Проверяет сетки, арты, фоны и гайды', role: true },
  { id: 'bughunter', label: 'Ловец багов', hint: 'Находит баги и сообщает о них' },
  { id: 'idea', label: 'Автор идей', hint: 'Идеи этого пользователя появились на сайте' },
  { id: 'sponsor', label: 'Поддержавший', hint: 'Поддерживает разработку сайта', rare: true },
  { id: 'likes100', label: '100 лайков', hint: 'Работы собрали 100 лайков', likes: 100 },
  { id: 'likes500', label: '500 лайков', hint: 'Работы собрали 500 лайков', likes: 500, rare: true },
  // Dotadle (asked for on 2026-10-06): the best streak of guessed heroes of the day; kept once reached.
  { id: 'dotadle7', label: '7 дней подряд в Dotadle', hint: 'Угадал героя дня 7 дней подряд', streak: 7 },
  { id: 'dotadle21', label: '21 день подряд в Dotadle', hint: 'Угадал героя дня 21 день подряд', streak: 21, rare: true },
]);
// The ones an admin gives (the moderator one comes with the role, given in «Пользователи»).
export const GRANTED_BADGES = Object.freeze(BADGES.filter((badge) => !badge.likes && !badge.role && !badge.streak).map((badge) => badge.id));
export const badgeOf = (id) => BADGES.find((badge) => badge.id === id) || null;
// The badges to draw, the rare ones first (each group in the list's order): the profile labels the first
// ones, a nickname shows at most two (src/catalog/Badges.jsx).
export const badgesByWeight = (ids) => (ids || []).map(badgeOf).filter(Boolean).sort((a, b) => (b.rare ? 1 : 0) - (a.rare ? 1 : 0));
// The badges to show: the given ones and the role's in the list's order, then the highest like badge
// reached, then the highest Dotadle streak badge (by the best streak).
export function profileBadges(granted, likes = 0, { moderator = false, streak = 0 } = {}) {
  const given = BADGES.filter((badge) => (badge.role ? moderator : !badge.likes && !badge.streak && granted.includes(badge.id))).map((badge) => badge.id);
  const earned = BADGES.filter((badge) => badge.likes && likes >= badge.likes).at(-1), played = BADGES.filter((badge) => badge.streak && streak >= badge.streak).at(-1);
  return [...given, ...(earned ? [earned.id] : []), ...(played ? [played.id] : [])];
}
// The streak badge a best streak of `best` has just reached, or null.
export const streakBadge = (before, after) => BADGES.find((badge) => badge.streak && before < badge.streak && after >= badge.streak) || null;
