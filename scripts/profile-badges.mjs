// Profile badges (asked for on 2026-10-02): admins give the first four on a creator's profile
// (server/profiles.mjs setBadge, POST /admin/profiles/<key>/badges); the like ones come by themselves from
// the likes on the creator's published grids, backgrounds and guides — only the higher one shows.
// Shared by the server and the profile page (src/catalog/Badges.jsx); `icon` is a name in scripts/icons.mjs,
// `color` the pill's (the same as src/catalog/catalog.css, for the profile's link preview).
export const BADGES = Object.freeze([
  { id: 'developer', label: 'Разработчик', hint: 'Делает GridStudio', icon: 'badgeDev', color: '#a78bfa' },
  { id: 'bughunter', label: 'Bug Hunter', hint: 'Находит баги и сообщает о них', icon: 'bug', color: '#5fd39a' },
  { id: 'idea', label: 'Идейный вдохновитель', hint: 'Идеи этого пользователя появились на сайте', icon: 'badgeIdea', color: '#f3c46d' },
  { id: 'sponsor', label: 'Поддержавший', hint: 'Поддерживает разработку сайта', icon: 'badgeSponsor', color: '#f78fb3' },
  { id: 'likes100', label: '100 лайков', hint: 'Работы собрали 100 лайков', icon: 'heart', likes: 100, color: '#e9a3c9' },
  { id: 'likes500', label: '500 лайков', hint: 'Работы собрали 500 лайков', icon: 'trophy', likes: 500, color: '#ffcf5a' },
]);
// The ones an admin gives.
export const GRANTED_BADGES = Object.freeze(BADGES.filter((badge) => !badge.likes).map((badge) => badge.id));
export const badgeOf = (id) => BADGES.find((badge) => badge.id === id) || null;
// The badges to show: the given ones in the list's order, then the highest like badge reached.
export function profileBadges(granted, likes = 0) {
  const given = BADGES.filter((badge) => !badge.likes && granted.includes(badge.id)).map((badge) => badge.id);
  const earned = BADGES.filter((badge) => badge.likes && likes >= badge.likes).at(-1);
  return earned ? [...given, earned.id] : given;
}
