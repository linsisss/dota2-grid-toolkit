import D from './data.mjs';

// Hero portraits for canvas previews (workshop cards, «Студия» pictures), loaded once per page.
const portraits = new Map();
export function portrait(id) {
  if (!portraits.has(id)) portraits.set(id, new Promise((resolve) => {
    const hero = D.heroes.find((hero) => hero.id === id); if (!hero) return resolve(null);
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = hero.portrait;
  }));
  return portraits.get(id);
}
