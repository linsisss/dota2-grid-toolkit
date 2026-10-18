import { useEffect, useRef } from 'react';
import { guideURL, hotOf, roleURL } from './cursor-render.js';
import defs from './click-fx.json';
import { CLICK_COLOURS, ClickEffect, DRAG_RESELECT, SELECT, UNIT_ORDER, camera } from '../../scripts/click-fx.mjs';
import { drawEffect, drawSelectionBox, heroDepthData, heroOccluder } from '../../scripts/click-fx-draw.mjs';
import heroDepthMeta from '../../assets/match-hero/kotl-depth.json';
import heroDepthURL from '../../assets/match-hero/kotl-depth.png?no-inline';

// The chosen cursor under the mouse on a picture of the game (2026-10-17, the owner: «если на Матч наводишь…
// курсор кастомным можно было водить нормально и нажимался он как в доте 1 в 1»). The system cursor hides
// inside the picture and the cursor Dota would show follows the mouse (one transform per animation frame,
// no React render), at its size in the game and with its click point exactly under the mouse:
//   - over the HUD, the world, and the menu: cursor_default (cursor_db_default in the menu);
//   - over our own hero (Keeper of the Light in the captured frame): cursor_default_team;
//   - A (the key, any layout) arms an attack: cursor_attack_default (cursor_attack_team over our hero) until a
//     left click — an attack-move to that point — or a right click / Esc cancels it;
//   - a right click on the ground is a move order, a left click with A an attack-move: Dota's own click
//     particles (scripts/click-fx.mjs: what client.dll plays, its colours, the camera), simulated from the
//     decompiled definitions and drawn here with the game's textures (assets/dota-click). An order on a unit
//     (right click on our hero, A-click on him) plays none, as in the game.
//   - a left click on our hero selects him: select_unit.vpcf (a green ring that shrinks onto him in 0.25 s);
//     a left click on the ground plays nothing; a left drag draws Dota's green selection box
//     (scripts/click-fx-draw.mjs drawSelectionBox) while the button is held.
// Dota's cursor has no pressed picture (resource/cursor has none, no cursor id for it): a click changes nothing
// on the cursor itself.
export const HERO = Object.freeze({ x: 960, y: 545, rx: 112, ry: 96 });
// The hero's silhouette and depth in the captured frame (scripts/make-hero-depth.mjs), loaded with the match
// scene: the cursor is over him on his pixels, and ground effects hide behind him (click-fx-draw.mjs).
let heroDepth = null, heroDepthLoad = null;
export function loadHeroDepth() {
  heroDepthLoad ||= (async () => {
    const blob = await (await fetch(heroDepthURL)).blob(), bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const { w, h } = heroDepthMeta.box, c = Object.assign(document.createElement('canvas'), { width: w, height: h }), cctx = c.getContext('2d', { willReadFrequently: true });
    cctx.drawImage(bitmap, 0, 0); bitmap.close?.();
    heroDepth = heroDepthData(heroDepthMeta, cctx.getImageData(0, 0, w, h).data);
    env.occluder = heroOccluder(heroDepth, env.canvas);
    return heroDepth;
  })().catch(() => { heroDepthLoad = null; return null; });
  return heroDepthLoad;
}
export const onHero = (x, y) => {
  if (!heroDepth) return ((x - HERO.x) / HERO.rx) ** 2 + ((y - HERO.y) / HERO.ry) ** 2 <= 1;
  const { box } = heroDepth, gx = Math.floor(x - box.x), gy = Math.floor(y - box.y);
  return gx >= 0 && gy >= 0 && gx < box.w && gy < box.h && heroDepth.hit[gy * box.w + gx] === 1;
};
export const canHover = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
const CAM = camera();

const files = import.meta.glob('../../assets/dota-click/*.png', { import: 'default', eager: true });
const textures = {};
// A d2pfx click mod (D2pfxSections.jsx, assets/d2pfx-click): its systems over Valve's and its own textures
// ({ systems, images: { name: url } }), or null for Valve's click. Clicks started after it plays it.
let skin = null, skinned = defs;
export function setClickSkin(next) { skin = next; skinned = next ? { ...defs, systems: { ...defs.systems, ...next.systems } } : defs; }
function texture(name) {
  if (!textures[name]) {
    const image = new Image();
    image.src = skin?.images?.[name] || Object.entries(files).find(([path]) => path.endsWith(`/${name}.png`))?.[1] || '';
    textures[name] = image;
  }
  const image = textures[name];
  return image.complete && image.naturalWidth ? image : null;
}
// Canvases for the click's drawing (scripts/click-fx-draw.mjs), with the textures as they load.
const scratches = new WeakMap();
const env = { image: texture, canvas: (width, height) => Object.assign(document.createElement('canvas'), { width, height }), modLayers: null, occluder: null,
  // A canvas the size of the one drawn on, for the depth-tested quads (click-fx-draw.mjs).
  scratch(ctx) { const target = ctx.canvas; let c = scratches.get(target); if (!c || c.width !== target.width || c.height !== target.height) { c = env.canvas(target.width, target.height); scratches.set(target, c); } return c; } };
export const drawClick = (ctx, effect, css, dpr) => drawEffect(ctx, effect, css, dpr, env, CAM);
let clicks = 0;
// A click at game pixel (gx, gy): the ground under it, the effect started there.
export function startClick(kind, gx, gy, seed = ++clicks) {
  // On our hero (his origin is the look-at point, the world's 0).
  if (kind === 'select') return new ClickEffect(defs, defs.roots.select, { origin: [0, 0, 0], colour: SELECT.colour, points: SELECT.points, seed });
  if (kind === 'unitOrder') return new ClickEffect(defs, defs.roots.unitOrder, { origin: [0, 0, 0], colour: UNIT_ORDER.colour, points: UNIT_ORDER.select, seed });
  if (kind === 'ringHit') return new ClickEffect(defs, defs.roots.ringHit, { origin: [0, 0, 0], colour: UNIT_ORDER.colour, points: UNIT_ORDER.hit, seed });
  if (kind === 'dragReselect') return new ClickEffect(defs, defs.roots.dragReselect, { origin: [0, 0, 0], colour: DRAG_RESELECT.colour, points: DRAG_RESELECT.points, seed });
  const origin = CAM.ground(gx, gy);
  return new ClickEffect(skinned, skinned.roots[kind], { origin, colour: CLICK_COLOURS[kind], seed });
}

// The layer over a picture of the game. `cursor(id)` → { url, hot: [x, y] in 32-px units } for an id;
// `place(x, y, w, h)` → { gx, gy, k } — the point in the 1920 × 1080 game screen and CSS px per game px;
// `regionAt(gx, gy)` → 'hud' | 'hero' | 'world'; `scene`: 'match' | 'menu'. Mounted inside the picture's box.
export function DotaCursorLayer({ cursor, place, regionAt = () => 'world', scene = 'match' }) {
  const root = useRef(null), image = useRef(null), fx = useRef(null), mul = useRef(null), dodge = useRef(null);
  const props = useRef({}); props.current = { cursor, place, regionAt, scene };
  useEffect(() => {
    const layer = root.current, box = layer?.parentElement;
    if (!box || !canHover()) return undefined;
    if (props.current.scene !== 'menu') loadHeroDepth();
    const s = { x: 0, y: 0, inside: false, system: false, mode: 'normal', frame: 0, markers: [], src: '', fxFrame: 0 };
    const img = image.current, canvas = fx.current, mulCanvas = mul.current, dodgeCanvas = dodge.current;
    // MOD2X sprites go to two canvases the page blends over the picture (CSS multiply and color-dodge).
    const layers = { multiply: mulCanvas.getContext('2d'), dodge: dodgeCanvas.getContext('2d'), multiplyMode: 'source-over', dodgeMode: 'source-over' };
    const draw = () => {
      s.frame = 0;
      const { cursor: get, place: at, regionAt: region, scene: where } = props.current;
      const rect = box.getBoundingClientRect(), show = s.inside && !s.system;
      box.classList.toggle('has-dota-cursor', s.inside);
      box.classList.toggle('is-system-cursor', s.inside && s.system);
      if (!show) { img.style.visibility = 'hidden'; return; }
      const { gx, gy, k } = at(s.x, s.y, rect.width, rect.height), over = where === 'menu' ? 'menu' : region(gx, gy);
      const id = where === 'menu' ? 'cursor_db_default' : s.mode === 'attack' ? (over === 'hero' ? 'cursor_attack_team' : 'cursor_attack_default') : over === 'hero' ? 'cursor_default_team' : 'cursor_default';
      const { url, hot } = get(id), size = 32 * k;
      if (url !== s.src) { img.src = url; s.src = url; }
      img.dataset.cursor = id;
      img.style.width = img.style.height = `${size}px`;
      img.style.transform = `translate3d(${s.x - hot[0] * k}px, ${s.y - hot[1] * k}px, 0)`;
      img.style.visibility = 'visible';
      s.over = over;
    };
    const schedule = () => { s.frame ||= requestAnimationFrame(draw); };
    const animate = (now) => {
      s.fxFrame = 0;
      const rect = box.getBoundingClientRect(), dpr = devicePixelRatio || 1, w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
      for (const c of [canvas, mulCanvas, dodgeCanvas]) if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const ctx = canvas.getContext('2d');
      for (const c of [ctx, layers.multiply, layers.dodge]) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h); }
      env.modLayers = () => layers;
      s.markers = s.markers.filter((m) => {
        m.effect.advance((now - m.born) / 1000);
        if (!m.effect.alive) return false;
        drawClick(ctx, m.effect, ([x, y]) => [m.x + (x - m.gx) * m.k, m.y + (y - m.gy) * m.k], dpr);
        return true;
      });
      const d = s.drag;
      if (d) {
        const rect = [d.gx, d.gy, d.gx + (s.x - d.x) / d.k, d.gy + (s.y - d.y) / d.k];
        d.shown = drawSelectionBox(ctx, rect, ([x, y]) => [d.x + (x - d.gx) * d.k, d.y + (y - d.gy) * d.k], dpr) || d.shown;
        // Our hero (selected) inside the drawn box: his ring flashes while he stays in it.
        const inside = d.shown && HERO.x >= Math.min(rect[0], rect[2]) && HERO.x <= Math.max(rect[0], rect[2]) && HERO.y >= Math.min(rect[1], rect[3]) && HERO.y <= Math.max(rect[1], rect[3]);
        if (inside && !d.reselect) d.reselect = mark('dragReselect', d.gx, d.gy, d.k, d.x, d.y);
        if (!inside && d.reselect) { s.markers = s.markers.filter((m) => m !== d.reselect); d.reselect = null; }
      }
      if (s.markers.length || d) s.fxFrame = requestAnimationFrame(animate);
    };
    const mark = (kind, gx, gy, k, x = s.x, y = s.y) => {
      const marker = { effect: startClick(kind, gx, gy), x, y, gx, gy, k, born: performance.now() };
      s.markers.push(marker);
      layer.dataset.lastClick = kind; // for checks: what the last click played
      s.fxFrame ||= requestAnimationFrame(animate);
      return marker;
    };
    const systemZone = (target) => !!target?.closest?.('.hud-chat-handle, [data-system-cursor]');
    const move = (event) => {
      const rect = box.getBoundingClientRect();
      s.x = event.clientX - rect.left; s.y = event.clientY - rect.top;
      // A drag keeps going outside the picture, held at its edge, as the box stays on the screen.
      if (s.drag) { s.x = Math.max(0, Math.min(rect.width - 1, s.x)); s.y = Math.max(0, Math.min(rect.height - 1, s.y)); s.fxFrame ||= requestAnimationFrame(animate); }
      s.inside = s.drag ? true : event.clientX >= rect.left && event.clientX < rect.right && event.clientY >= rect.top && event.clientY < rect.bottom;
      s.system = !s.drag && systemZone(event.target);
      schedule();
    };
    const leave = () => { if (s.drag) return; s.inside = false; s.mode = 'normal'; schedule(); };
    const down = (event) => {
      if (systemZone(event.target) || props.current.scene === 'menu') return;
      move(event);
      const { gx, gy, k } = props.current.place(s.x, s.y, box.clientWidth, box.clientHeight), over = props.current.regionAt(gx, gy);
      // An order on our hero (A-click: attack him; right click: move to him) plays the unit-order feedback.
      const onUnit = () => { mark('unitOrder', gx, gy, k); mark('ringHit', gx, gy, k); };
      if (event.button === 0 && s.mode === 'attack') { if (over === 'world') mark('attack', gx, gy, k); else if (over === 'hero') onUnit(); s.mode = 'normal'; }
      else if (event.button === 0 && over !== 'hud') {
        s.drag = { x: s.x, y: s.y, gx, gy, k, over, shown: false };
        box.setPointerCapture?.(event.pointerId);
        s.fxFrame ||= requestAnimationFrame(animate);
      }
      else if (event.button === 2) { if (s.mode === 'attack') s.mode = 'normal'; else if (over === 'world') mark('move', gx, gy, k); else if (over === 'hero') onUnit(); }
      schedule();
    };
    // Release: a box that was drawn ends there (our hero, already selected, stays so); a click on him selects him.
    const up = (event) => {
      const d = s.drag;
      if (!d || event.button !== 0) return;
      s.drag = null;
      if (d.reselect) s.markers = s.markers.filter((m) => m !== d.reselect);
      if (!d.shown && d.over === 'hero') mark('select', d.gx, d.gy, d.k, d.x, d.y);
      s.fxFrame ||= requestAnimationFrame(animate);
      schedule();
    };
    const menu = (event) => { if (!systemZone(event.target)) event.preventDefault(); };
    const key = (event) => {
      if (!s.inside || event.target?.closest?.('input, textarea, [contenteditable=true]') || props.current.scene === 'menu') return;
      if (event.code === 'KeyA' && !event.ctrlKey && !event.metaKey && !event.altKey) { s.mode = 'attack'; schedule(); }
      else if (event.key === 'Escape' && s.mode === 'attack') { s.mode = 'normal'; event.preventDefault(); event.stopPropagation(); schedule(); }
    };
    box.addEventListener('pointermove', move); box.addEventListener('pointerenter', move); box.addEventListener('pointerleave', leave);
    box.addEventListener('pointerdown', down); box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up); box.addEventListener('contextmenu', menu);
    addEventListener('keydown', key, true);
    return () => {
      cancelAnimationFrame(s.frame); cancelAnimationFrame(s.fxFrame);
      box.removeEventListener('pointermove', move); box.removeEventListener('pointerenter', move); box.removeEventListener('pointerleave', leave);
      box.removeEventListener('pointerdown', down); box.removeEventListener('pointerup', up); box.removeEventListener('pointercancel', up); box.removeEventListener('contextmenu', menu);
      removeEventListener('keydown', key, true);
      box.classList.remove('has-dota-cursor', 'is-system-cursor');
    };
  }, []);
  return <div ref={root} className="dota-cursor-layer" aria-hidden="true">
    <canvas ref={mul} className="is-multiply"/><canvas ref={dodge} className="is-dodge"/><canvas ref={fx}/><img ref={image} alt="" draggable="false" style={{ visibility: 'hidden' }}/>
  </div>;
}

// The cursor of an id in a set of roles (CursorSection.jsx): the user's picture (its 96-px rendering, drawn
// at the game's size) or Valve's own, with its click point.
export function cursorOf(roles, id) {
  const role = roles?.[id];
  return role?.image ? { url: roleURL(role, 96), hot: hotOf(id, role) } : { url: guideURL(id), hot: hotOf(id, null) };
}
