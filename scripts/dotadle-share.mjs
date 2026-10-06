// A Dotadle result as squares: each guess's five, in the hints table's order (attribute, attack, roles,
// speed, range) — 2 green, 1 yellow, 0 red. The copied text draws them as emoji; a shared link
// (/dotadle?r=<short code>, server/dotadle.mjs shareFor) gets a picture of them (server/link-preview.mjs).
export function shareRow({ correct, hints }) {
  if (correct) return '22222';
  const mark = (ok) => ok ? '2' : '0';
  return mark(hints.attr === 'same') + mark(hints.attack === 'same') + (hints.roles.same ? '2' : hints.roles.common ? '1' : '0') + mark(hints.speed === 'same') + mark(hints.range === 'same');
}
export const SHARE_CODE = /^[A-Za-z0-9]{3,8}$/;
