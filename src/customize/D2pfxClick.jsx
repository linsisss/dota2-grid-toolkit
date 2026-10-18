import { useEffect, useRef } from 'react';
import { drawClick, startClick } from './DotaCursor.jsx';
import defs from './click-fx.json';
import { CLICK_COLOURS, ClickEffect, camera } from '../../scripts/click-fx.mjs';
import { drawEffect } from '../../scripts/click-fx-draw.mjs';

// «Клик»'s own little scene: a move click on the ground of the captured match, again and again — the same
// simulation the match preview plays on a right click (DotaCursor.jsx), with the chosen mod's particles
// (setClickSkin) or Valve's. The window is a 420 × 210 game-pixel crop around the ground point.
const VIEW = { x: 960, y: 700, width: 420, height: 210 };
export default function D2pfxClick({ skin }) {
  const box = useRef(null);
  useEffect(() => {
    const canvas = box.current, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let world = null, frame = 0, effect = null, born = 0, gone = false;
    import('./hud-capture-assets.js').then(({ fileURL, manifest }) => {
      const image = new Image();
      image.onload = () => { if (!gone) { world = image; frame ||= requestAnimationFrame(draw); } };
      image.src = fileURL(manifest.world);
    }).catch(() => {});
    const draw = (now) => {
      frame = 0;
      if (gone) return;
      const dpr = devicePixelRatio || 1, width = canvas.clientWidth, height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
      const ctx = canvas.getContext('2d'), k = width / VIEW.width;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (world) ctx.drawImage(world, VIEW.x - VIEW.width / 2, VIEW.y - VIEW.height / 2, VIEW.width, VIEW.height, 0, 0, canvas.width, canvas.height);
      if (!effect || (!effect.alive && now - born > 650)) { effect = startClick('move', VIEW.x, VIEW.y); born = now; }
      effect.advance((now - born) / 1000);
      if (effect.alive) drawClick(ctx, effect, ([x, y]) => [(x - VIEW.x + VIEW.width / 2) * k, (y - VIEW.y + VIEW.height / 2) * k], dpr);
      if (!reduce || effect.alive) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { gone = true; cancelAnimationFrame(frame); };
  }, [skin]);
  return <canvas ref={box} className="d2-click-scene" aria-hidden="true"/>;
}

// A card's picture for a click mod: one frame (0.26 s in: the arrows meeting the ring) of the mod's own
// particles (assets/d2pfx-click, decompiled by scripts/make-d2pfx-click.mjs) or Valve's, drawn by the same
// simulation over the captured ground — our render, not d2pfx's picture.
const valvePng = import.meta.glob('../../assets/dota-click/*.png', { import: 'default', eager: true });
const modPng = import.meta.glob('../../assets/d2pfx-click/*/*.png', { import: 'default', eager: true });
const modFx = import.meta.glob('../../assets/d2pfx-click/*/fx.json', { import: 'default', eager: true });
const CAM = camera(), THUMB = { x: 960, y: 700, width: 180, height: 101 };
const images = new Map();
const load = (url) => {
  if (!images.has(url)) images.set(url, new Promise((resolve) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = url; }));
  return images.get(url);
};
export function ClickThumb({ id = '' }) {
  const box = useRef(null);
  useEffect(() => {
    let gone = false;
    (async () => {
      const fx = id ? Object.entries(modFx).find(([path]) => path.includes(`/${id}/`))?.[1] : null;
      const systems = fx ? { ...defs.systems, ...fx.systems } : defs.systems, own = {};
      for (const name of fx?.textures || []) own[name] = await load(Object.entries(modPng).find(([path]) => path.endsWith(`/${id}/${name}.png`))?.[1]);
      const valve = {};
      for (const [path, url] of Object.entries(valvePng)) valve[path.split('/').pop().replace('.png', '')] = await load(url);
      const { fileURL, manifest } = await import('./hud-capture-assets.js'), world = await load(fileURL(manifest.world));
      const canvas = box.current;
      if (gone || !canvas) return;
      const dpr = Math.min(2, devicePixelRatio || 1), width = canvas.clientWidth || 160, height = canvas.clientHeight || 90;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext('2d'), k = width / THUMB.width;
      if (world) ctx.drawImage(world, THUMB.x - THUMB.width / 2, THUMB.y - THUMB.height / 2, THUMB.width, THUMB.height, 0, 0, canvas.width, canvas.height);
      const env = { image: (name) => own[name] || valve[name] || null, canvas: (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }), modLayers: null };
      const effect = new ClickEffect({ ...defs, systems }, defs.roots.move, { origin: CAM.ground(THUMB.x, THUMB.y), colour: CLICK_COLOURS.move, seed: 3 });
      effect.advance(0.26);
      drawEffect(ctx, effect, ([x, y]) => [(x - THUMB.x + THUMB.width / 2) * k, (y - THUMB.y + THUMB.height / 2) * k], dpr, env, CAM);
    })().catch(() => {});
    return () => { gone = true; };
  }, [id]);
  return <canvas ref={box} className="d2-click-thumb" aria-hidden="true"/>;
}
