import { useEffect, useState } from 'react';
import { gridBackground, gridBackgroundImage, onGridBackground } from '../scripts/grid-background.mjs';
import { myGridBackground } from './my-background.js';

// The ground under the Studio's transparent grid pictures, as a CSS background: the preview
// switch's choice (Dota backdrop, the old gradient or «Мой фон»), made once per page.
const GRADIENT = 'linear-gradient(#261e12, #140f0a)';
const grounds = new Map();
function ground(value) {
  if (value === 'gradient') return Promise.resolve(GRADIENT);
  if (!grounds.has(value)) grounds.set(value, (async () => {
    let url = null;
    if (value === 'mine') {
      const canvas = await myGridBackground(false).catch(() => null);
      if (canvas) url = URL.createObjectURL(await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88)));
    }
    // «Мой фон» without a background built here falls back to the Dota backdrop, as in previews.
    url ||= (await gridBackgroundImage(false).catch(() => null))?.src;
    return url ? `url("${url}") center / 100% 100% no-repeat` : GRADIENT;
  })());
  return grounds.get(value);
}
export function useGridGround() {
  const [value, setValue] = useState(gridBackground), [css, setCSS] = useState('');
  useEffect(() => onGridBackground(setValue), []);
  useEffect(() => { let active = true; ground(value).then((next) => { if (active) setCSS(next); }); return () => { active = false; }; }, [value]);
  return css;
}
