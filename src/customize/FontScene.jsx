import { useEffect, useRef, useState } from 'react';
import { t } from '../../scripts/i18n.mjs';
import scenes from './font-scene.json';

// The font preview (asked for on 2026-09-30): the main menu and a moment of a match, split by a slanted
// line «/» that can be dragged; in the match the scoreboard (Tab, `, or its button at the top left)
// and the shop (a click on the gold) open as in the game. Built from the user's 1920×1080 screenshots
// of the Russian client: each scene is the screenshot with its text removed (the plate) and the text
// drawn again on top — in the chosen font for the roles it replaces, as the game's own pixels (a layer
// per role) for the others. Each label's style is Panorama's (Valve's CSS), its place and rounding were
// fitted to the screenshot with Valve's fonts (not shipped); see docs/customize.md.
const asset = (file) => `./assets/font-scene/${file}`;
const W = scenes.width, H = scenes.height;

// Panorama's layout, redone for the chosen font: glyph by glyph, each advance rounded to a pixel the way
// the label was (m: f down, r to the nearest, x not at all), plus the letter spacing; a shrinking label
// (k) starts from its size cs and scales down to fit k px; a cut one (e) loses letters for «…» until it fits.
const ruler = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
const widths = new Map();
const ROUND = { f: Math.floor, r: Math.round, x: (value) => value };
function advance(css, ch) {
  const key = `${css}|${ch}`;
  if (!widths.has(key)) { ruler.font = css; widths.set(key, ruler.measureText(ch).width); }
  return widths.get(key);
}
function lay(part, family, text, size) {
  const css = `${part.w} ${size}px '${family}', sans-serif`, xs = [];
  let pen = 0;
  for (const ch of Array.from(text)) { xs.push(pen); pen += ROUND[part.m](advance(css, ch)) + part.l; }
  return { text, size, xs, pen };
}
function set(part, family) {
  let size = part.s;
  if (part.k) {
    size = part.cs;
    const wide = lay(part, family, part.t, size).pen;
    if (wide > part.k) size = Math.max(4, (size * part.k) / wide);
  }
  let done = lay(part, family, part.t, size);
  if (part.e && done.pen > part.e) {
    const chars = Array.from(part.t), dots = part.el || '…';
    let n = chars.length - 1;
    while (n > 1 && lay(part, family, `${chars.slice(0, n).join('').trimEnd()}${dots}`, size).pen > part.e) n--;
    done = lay(part, family, `${chars.slice(0, n).join('').trimEnd()}${dots}`, size);
  }
  return done;
}
// A label and the next ones of its row: laid out together and anchored as Panorama anchored the row;
// a part whose role is not replaced keeps Valve's width (its own pixels stay in the layer).
function row(label, family, roles) {
  const parts = [label, ...(label.f || [])].map((part) => ({ part, done: roles[part.r] ? set(part, family) : null }));
  const total = parts.reduce((sum, { part, done }, index) => sum + (index ? part.g : 0) + (done ? done.pen : part.p), 0);
  let x = label.a === 'middle' ? label.x - total / 2 : label.a === 'end' ? label.x - total : label.x, y = label.y;
  return parts.map(({ part, done }, index) => {
    if (index) { x += part.g; y += part.dy; }
    const at = { x, y, part, done };
    x += done ? done.pen : part.p;
    return at;
  }).filter((at) => at.done);
}

function Scene({ id, family, roles, hidden = false }) {
  const scene = scenes.scenes[id];
  if (!scene) return null;
  return <svg className={`font-scene-layer${hidden ? ' is-hidden' : ''}`} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
    <image href={asset(scene.plate)} x="0" y="0" width={W} height={H} preserveAspectRatio="none"/>
    {Object.entries(scene.layers).map(([role, file]) => !(roles[role] && family)
      && <image key={role} href={asset(file)} x="0" y="0" width={W} height={H} preserveAspectRatio="none"/>)}
    {family && ruler && <g className="font-scene-text" fontFamily={`'${family}', sans-serif`}>{scene.labels.flatMap((label) => row(label, family, roles).map(({ x, y, part, done }, index) =>
      <text key={`${label.id}-${index}`} x={done.xs.map((at) => +(x + at).toFixed(2)).join(' ')} y={y} fontWeight={part.w} fontSize={+done.size.toFixed(2)} fill={part.c}>{done.text}</text>))}</g>}
  </svg>;
}

// Where the line «/» crosses the middle (a share of the width), its limits and how far it leans.
const LEAN = 0.07, MIN = 0.06, MAX = 0.94;
const clamp = (value) => Math.max(MIN, Math.min(MAX, value));
export default function FontScene({ family, roles }) {
  const [open, setOpen] = useState(''), [split, setSplit] = useState(0.4), [dragging, setDragging] = useState(false), box = useRef(null);
  const toggle = (what) => setOpen(open === what ? '' : what);
  // Tab and ` toggle the scoreboard while the preview has the focus (Tab still leaves it with Shift).
  const onKey = (event) => {
    if ((event.key === 'Tab' && !event.shiftKey) || event.key === '`' || event.key === 'ё') { event.preventDefault(); toggle('scoreboard'); }
    else if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(''); }
    else if (event.key.toLowerCase() === 'b' || event.key.toLowerCase() === 'и') toggle('shop');
  };
  const move = (event) => {
    if (!dragging) return;
    const rect = box.current.getBoundingClientRect();
    const fx = (event.clientX - rect.left) / rect.width, fy = (event.clientY - rect.top) / rect.height;
    // The line at height fy is at split + LEAN - 2·LEAN·fy.
    setSplit(clamp(fx - LEAN + 2 * LEAN * fy));
  };
  useEffect(() => {
    if (!dragging) return undefined;
    const up = () => setDragging(false);
    addEventListener('pointerup', up);
    return () => removeEventListener('pointerup', up);
  }, [dragging]);
  // The scoreboard is at the left, under the menu: while it is open the menu slides away.
  const away = open === 'scoreboard', line = away ? -LEAN - 0.01 : split;
  const top = (line + LEAN) * 100, bottom = (line - LEAN) * 100;
  const percent = (x, y, w, h) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, width: `${(w / W) * 100}%`, height: `${(h / H) * 100}%` });
  return <div ref={box} className={`font-scene${dragging ? ' is-dragging' : ''}`} tabIndex={0} onKeyDown={onKey} onPointerMove={move}
    aria-label={t('Превью шрифта: главное меню и матч. Перетащи черту, чтобы показать больше одного или другого.')}>
    <div className="font-scene-game">
      <Scene id="hud" family={family} roles={roles}/>
      <Scene id="shop" family={family} roles={roles} hidden={open !== 'shop'}/>
      <Scene id="scoreboard" family={family} roles={roles} hidden={open !== 'scoreboard'}/>
      <button type="button" className="font-scene-hit" style={percent(150, 10, 38, 36)} aria-pressed={open === 'scoreboard'} title={t('Таблица счёта (Tab)')} onClick={() => toggle('scoreboard')}/>
      <button type="button" className="font-scene-hit" style={percent(1630, 1026, 110, 44)} aria-pressed={open === 'shop'} title={t('Магазин')} onClick={() => toggle('shop')}/>
    </div>
    {scenes.scenes.menu && <div className="font-scene-menu" style={{ clipPath: `polygon(0 0, ${top}% 0, ${bottom}% 100%, 0 100%)` }}>
      <Scene id="menu" family={family} roles={roles}/>
    </div>}
    {scenes.scenes.menu && <div className={`font-scene-split${away ? ' is-away' : ''}`}>
      <i style={{ clipPath: `polygon(calc(${top}% - 1px) 0, calc(${top}% + 1px) 0, calc(${bottom}% + 1px) 100%, calc(${bottom}% - 1px) 100%)` }}/>
      <button type="button" className="font-scene-handle" style={{ left: `${line * 100}%` }} aria-label={t('Сдвинуть черту')} tabIndex={away ? -1 : 0}
        onPointerDown={(event) => { setDragging(true); event.currentTarget.setPointerCapture?.(event.pointerId); }}
        onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); setSplit((value) => clamp(value + (event.key === 'ArrowLeft' ? -0.04 : 0.04))); } }}>
        <span/></button>
    </div>}
  </div>;
}
