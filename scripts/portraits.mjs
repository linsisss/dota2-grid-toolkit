import D from './data.mjs';

// Hero portraits come in two sizes (asked for on 2026-10-03: they were the largest part of a page's
// traffic): the full 284 × 376 in assets/portraits and half of it, 142 × 188, in assets/portraits/md
// (scripts/make-portraits-md.mjs). The half ones are for previews, pictures and lists; the editor takes
// the full one only for a card taller than PORTRAIT_MD_HEIGHT pixels on the screen. A hero with a
// `portraitCrop` (in its full picture's pixels) has only the full one.
export const PORTRAIT_MD_HEIGHT = 188;
export const portraitSource = (hero, full = false) => (full || hero.portraitCrop ? hero.portrait : hero.portrait.replace('assets/portraits/', 'assets/portraits/md/'));

// Half-size portraits for canvas previews (workshop cards, «Студия» pictures), loaded once per page.
const portraits = new Map();
export function portrait(id) {
  if (!portraits.has(id)) portraits.set(id, new Promise((resolve) => {
    const hero = D.heroes.find((hero) => hero.id === id); if (!hero) return resolve(null);
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = portraitSource(hero);
  }));
  return portraits.get(id);
}
