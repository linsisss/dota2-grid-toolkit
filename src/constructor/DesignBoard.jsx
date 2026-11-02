import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../catalog/Common.jsx';
import { t } from '../../scripts/i18n.mjs';
import { BLOCK_LIMITS } from '../../scripts/menu-widgets.mjs';
import { BlockInner } from './BlockView.jsx';
import { snapRect } from './geometry.js';

// The canvas of «Редактор виджета» (2026-10-31): the design at its size in its own pixels, zoomed (fit by
// default, Ctrl + wheel), with its blocks drawn as Dota will (BlockView.jsx). A block is moved by dragging and
// resized by its corners and sides (Shift on a corner keeps its shape); it sticks to the design's edges and
// centre, to the 16 px margins and to the other blocks (Alt: not this time), and stays inside the design. Blocks
// come in from the palette (`paletteDrag`), pictures and videos are dropped on it as files (onto a picture or
// video block: its file is replaced). Locked and hidden blocks let the pointer through to what is under them.
// `backdrop`: the main menu around the canvas («На фоне меню»): the whole menu is laid out (and fit) with the
// canvas where the widget stands on it, at the size it has there.
// The board keeps only the drag in progress; the editor keeps the rest (and its undo history).
export const MARGIN = 16;
const CORNERS = ['nw', 'ne', 'sw', 'se'], SIDES = ['n', 'e', 's', 'w'];
const round = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const inside = (event, box) => event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
const isMedia = (block) => block.type === 'image' || block.type === 'video';
const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes('Files');

const DesignBoard = forwardRef(function DesignBoard({ design, zoom, onZoom, onScale, selected, onSelect, locked, snap, state, backdrop, onCommit, live, toolbar, labelOf,
  onFile, onEditText, empty, children }, ref) {
  const area = useRef(null), canvas = useRef(null), tools = useRef(null), layer = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 }), [drag, setDrag] = useState(null), [ghost, setGhost] = useState(null), [hover, setHover] = useState(null);
  const [fileOver, setFileOver] = useState(null);
  const dragging = useRef(null);
  const [W, H] = design.size;
  // On the menu one design pixel is `k` of the menu's (the widget's width there / the design's), and the menu fits.
  const k = backdrop ? backdrop.place.w / W : 1;
  const fitScale = !box.w || !box.h ? 0 : backdrop ? Math.min(box.w / backdrop.dims.W, box.h / backdrop.dims.H) * k : clamp(Math.min(box.w / W, box.h / H), 0.1, 2);
  const scale = zoom || fitScale;
  const latest = useRef({}); latest.current = { design, scale, snap, locked, onCommit, live };

  // The area's free room (without its padding) → the scale that fits the design.
  useLayoutEffect(() => {
    const node = area.current;
    const measure = () => {
      const style = getComputedStyle(node);
      setBox({ w: node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), h: node.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (scale) onScale?.(scale, fitScale); }, [scale, fitScale]);
  // Ctrl + wheel zooms.
  useEffect(() => {
    const node = area.current;
    const wheel = (event) => { if (!(event.ctrlKey || event.metaKey)) return; event.preventDefault(); onZoom(clamp(latest.current.scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1), 0.1, 4)); };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [onZoom]);
  // A new zoom, or the menu around: the canvas in the middle of what is seen.
  useLayoutEffect(() => {
    const node = area.current, c = canvas.current;
    if (!node || !c || !scale) return;
    const a = node.getBoundingClientRect(), r = c.getBoundingClientRect();
    node.scrollLeft += r.left + r.width / 2 - (a.left + a.width / 2);
    node.scrollTop += r.top + r.height / 2 - (a.top + a.height / 2);
  }, [scale, !!backdrop]);

  const blocksNow = () => latest.current.design.blocks;
  const others = (id) => blocksNow().filter((b) => b.id !== id && b.opacity > 0).map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  const snapped = (rect, mode, event, skip) => {
    const { snap: on, design: d, scale: s } = latest.current, [w, h] = d.size;
    const lines = { x: [[MARGIN, 'margin'], [w - MARGIN, 'margin']], y: [[MARGIN, 'margin'], [h - MARGIN, 'margin']] };
    return on && !event.altKey ? snapRect(rect, mode, { dims: { W: w, H: h }, others: others(skip), lines, threshold: 6 / s, top: 0 }) : { rect, guides: [] };
  };
  // A pointer drag: nothing until it moved 3 px, then `onMove(dx, dy, event)` in the design's pixels.
  function follow(event, onMove, onEnd) {
    const px = event.clientX, py = event.clientY;
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - px, ev.clientY - py) < 3) return;
      if (!moved) { moved = true; document.body.classList.add('kz-dragging'); setHover(null); }
      onMove((ev.clientX - px) / latest.current.scale, (ev.clientY - py) / latest.current.scale, ev);
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      document.body.classList.remove('kz-dragging');
      onEnd(moved);
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  const show = (next) => { dragging.current = next; setDrag(next); latest.current.live.set(next && { id: next.id, rect: next.rect }); };
  const finish = (moved) => {
    const done = dragging.current;
    if (moved && done) latest.current.onCommit(done.id, done.rect, done.how);
    show(null);
  };
  function startMove(event, block) {
    const start = { x: block.x, y: block.y, w: block.w, h: block.h };
    follow(event, (dx, dy, ev) => {
      const [w, h] = latest.current.design.size;
      const res = snapped({ ...start, x: start.x + dx, y: start.y + dy }, 'move', ev, block.id);
      const r = round({ ...res.rect, x: clamp(res.rect.x, 0, w - start.w), y: clamp(res.rect.y, 0, h - start.h) });
      show({ id: block.id, how: 'move', rect: r, guides: res.guides, tag: `X ${r.x} · Y ${r.y}` });
    }, finish);
  }
  function startResize(event, block, mode) {
    const start = { x: block.x, y: block.y, w: block.w, h: block.h }, ratio = start.w / start.h, min = BLOCK_LIMITS.min;
    follow(event, (dx, dy, ev) => {
      const [w, h] = latest.current.design.size;
      let r = { ...start };
      if (mode.includes('e')) r.w = start.w + dx;
      if (mode.includes('s')) r.h = start.h + dy;
      if (mode.includes('w')) { r.x = start.x + dx; r.w = start.w - dx; }
      if (mode.includes('n')) { r.y = start.y + dy; r.h = start.h - dy; }
      const keep = ev.shiftKey && mode.length === 2;
      const res = snapped(r, keep ? mode.replace(/[ns]/g, '') : mode, ev, block.id);
      r = res.rect;
      const guides = keep ? res.guides.filter((g) => g.axis === 'v') : res.guides;
      if (r.x < 0) { r.w += r.x; r.x = 0; }
      if (r.x + r.w > w) r.w = w - r.x;
      if (r.y < 0) { r.h += r.y; r.y = 0; }
      if (r.y + r.h > h) r.h = h - r.y;
      r.w = Math.max(min, r.w); r.h = Math.max(min, r.h);
      if (keep) {
        const roomW = mode.includes('w') ? start.x + start.w : w - start.x, roomH = mode.includes('n') ? start.y + start.h : h - start.y;
        r.h = r.w / ratio;
        if (r.h > roomH) { r.h = roomH; r.w = r.h * ratio; }
        if (r.w > roomW) { r.w = roomW; r.h = r.w / ratio; }
        if (r.h < min) { r.h = min; r.w = r.h * ratio; }
      }
      if (mode.includes('w')) r.x = start.x + start.w - r.w;
      if (mode.includes('n')) r.y = start.y + start.h - r.h;
      r = round(r);
      show({ id: block.id, how: 'resize', rect: r, guides, tag: `${r.w} × ${r.h}` });
    }, finish);
  }

  // ——— A block dragged in from the palette: spec { block (its type, size, props), drop(rect), click() } ———
  function paletteDrag(event, spec) {
    if (event.button !== 0) return;
    const source = event.currentTarget, from = source.getBoundingClientRect(), px = event.clientX, py = event.clientY, width = Math.min(from.width, 200);
    let card = null, over = false, last = null;
    const move = (ev) => {
      if (!card) {
        if (Math.hypot(ev.clientX - px, ev.clientY - py) < 5) return;
        card = source.cloneNode(true); card.classList.add('kz-drag-card'); card.style.width = `${width}px`;
        document.body.append(card); document.body.classList.add('kz-dragging'); setHover(null);
      }
      card.style.transform = `translate(${ev.clientX - width / 2}px, ${ev.clientY - 20}px) rotate(-2deg)`;
      const c = canvas.current?.getBoundingClientRect();
      over = !!c && inside(ev, area.current.getBoundingClientRect()) && !ev.target.closest?.('.kz-glass');
      card.classList.toggle('is-over', over);
      if (!over) { last = null; setGhost(null); return; }
      const { design: d, scale: s } = latest.current, [dw, dh] = d.size, bw = Math.min(spec.block.w, dw), bh = Math.min(spec.block.h, dh);
      const res = snapped({ x: (ev.clientX - c.left) / s - bw / 2, y: (ev.clientY - c.top) / s - bh / 2, w: bw, h: bh }, 'move', ev, null);
      last = round({ ...res.rect, x: clamp(res.rect.x, 0, dw - bw), y: clamp(res.rect.y, 0, dh - bh) });
      setGhost({ block: { ...spec.block, ...last }, guides: res.guides });
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      document.body.classList.remove('kz-dragging');
      setGhost(null);
      if (!card) { spec.click?.(); return; }
      if (over && last) { card.remove(); spec.drop(last); return; }
      card.classList.add('is-back'); card.style.transform = `translate(${from.left}px, ${from.top}px)`;
      setTimeout(() => card.remove(), 340);
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  useImperativeHandle(ref, () => ({ paletteDrag, layer: () => layer.current, fitScale: () => fitScale }));

  // ——— Files dropped on the canvas: where, and onto which picture or video block ———
  const filePoint = (event) => {
    const c = canvas.current?.getBoundingClientRect(), s = latest.current.scale;
    if (!c || !inside(event, c)) return { at: null, target: null };
    const x = (event.clientX - c.left) / s, y = (event.clientY - c.top) / s;
    const target = [...blocksNow()].reverse().find((b) => isMedia(b) && b.opacity > 0 && !latest.current.locked.has(b.id) && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    return { at: { x: Math.round(x), y: Math.round(y) }, target: target?.id || null };
  };
  const fileDrag = {
    onDragOver: (event) => { if (!hasFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; const point = filePoint(event); setFileOver((old) => (old?.target === point.target && !!old?.at === !!point.at ? old : point)); },
    onDragLeave: (event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFileOver(null); },
    onDrop: (event) => { if (!hasFiles(event)) return; event.preventDefault(); const point = filePoint(event), file = event.dataTransfer.files?.[0]; setFileOver(null); if (file) onFile(file, point.at, point.target); }
  };

  const blocks = design.blocks;
  const sel = selected ? blocks.find((b) => b.id === selected) || null : null;
  const selRect = sel ? (drag?.id === sel.id ? drag.rect : sel) : null;
  const guides = drag?.guides || ghost?.guides || [];
  const toolbarNode = !drag && sel ? toolbar?.(sel) : null;
  const s = scale || 0.0001;
  const px = (r) => ({ left: r.x * s, top: r.y * s, width: r.w * s, height: r.h * s });
  // The toolbar under the selection (above it when there is no room), inside the stage.
  useLayoutEffect(() => {
    const node = tools.current;
    if (!node || !selRect || !scale) return;
    const tw = node.offsetWidth, th = node.offsetHeight;
    let top = (selRect.y + selRect.h) * scale + 14;
    if (top + th > H * scale + 64) top = selRect.y * scale - th - 30;
    node.style.left = `${Math.round((selRect.x + selRect.w / 2) * scale - tw / 2)}px`;
    node.style.top = `${Math.round(top)}px`;
  });

  const pressArea = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('.kz-b, .kz-tools, .kz-handle, .kz-de-empty')) return;
    onSelect(null);
  };
  const pressBlock = (event, block) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    if (selected !== block.id) onSelect(block.id);
    startMove(event, block);
  };
  const pressHandle = (event, mode) => {
    event.preventDefault(); event.stopPropagation();
    if (sel && !locked.has(sel.id)) startResize(event, sel, mode);
  };
  // Corners, and sides where there is room for them; a thin block (a progress bar) by its sides only.
  const hw = selRect ? selRect.w * s : 0, hh = selRect ? selRect.h * s : 0;
  const handles = !sel || locked.has(sel.id) ? [] : hh < 22 ? ['w', 'e', 's'] : hw < 22 ? ['n', 's', 'e']
    : [...CORNERS, ...SIDES.filter((side) => (side === 'n' || side === 's' ? hw : hh) >= 60)];
  // The menu around the canvas: page pixels per menu pixel, the widget at its place on it.
  const m = s / k, place = backdrop?.place;

  const board = <div className={`kz-de-canvas${fileOver?.at && !fileOver.target ? ' is-drop' : ''}`} ref={canvas}
    style={{ width: W * s, height: H * s, visibility: scale ? 'visible' : 'hidden', borderRadius: design.radius * s, ...(place ? { position: 'absolute', left: place.x * m, top: place.y * m, margin: 0 } : {}) }}>
        <div className="kz-de-layer" ref={layer} style={{ width: W, height: H, transform: `scale(${s})` }}>
          <div className={`kz-d is-${state}`} style={{ width: W, height: H, background: design.background || undefined, borderRadius: design.radius || undefined }}>
            {blocks.map((block) => {
              const r = drag?.id === block.id ? drag.rect : block, off = block.opacity === 0, still = locked.has(block.id);
              return <div key={block.id} className={`kz-b is-edit${off ? ' is-off' : ''}${still ? ' is-locked' : ''}${fileOver?.target === block.id ? ' is-drop' : ''}`} data-id={block.id}
                style={{ left: r.x, top: r.y, width: r.w, height: r.h, opacity: block.opacity / 100 }}
                onPointerDown={(event) => pressBlock(event, block)} onDragStart={(event) => event.preventDefault()} onDoubleClick={() => onEditText?.(block)}
                onPointerEnter={() => !dragging.current && setHover(block.id)} onPointerLeave={() => setHover(null)}>
                <BlockInner block={block} editing/></div>;
            })}
            {ghost && <div className="kz-b is-ghost" style={{ left: ghost.block.x, top: ghost.block.y, width: ghost.block.w, height: ghost.block.h }}><BlockInner block={ghost.block} editing/></div>}
          </div>
        </div>
        <div className="kz-overlay kz-de-overlay">
          {drag && <div className="kz-de-margins" style={{ inset: MARGIN * s }} aria-hidden="true"/>}
          {hover && !drag && hover !== selected && blocks.find((b) => b.id === hover) && <div className="kz-hover" style={px(blocks.find((b) => b.id === hover))}/>}
          {guides.map((g, i) => <div key={i} className={`kz-guide is-${g.axis}${g.valve ? ' is-valve' : ''}`} style={g.axis === 'v' ? { left: g.at * s } : { top: g.at * s }}>
            {g.label === 'margin' && <span>{t('поле {size} px', { size: MARGIN })}</span>}{g.label === 'centre' && <span>{t('центр')}</span>}</div>)}
          {selRect && <div className={`kz-sel${locked.has(sel.id) ? ' is-locked' : ''}${selRect.y * s < 24 ? ' is-top' : ''}`} style={px(selRect)}>
            <span className="kz-name">{locked.has(sel.id) && <Icon name="lock" size={11}/>}{labelOf(sel)}</span>
            {drag && <span className="kz-dims">{drag.tag}</span>}
            {handles.map((mode) => <i key={mode} className="kz-handle" data-h={mode} onPointerDown={(event) => pressHandle(event, mode)}/>)}
          </div>}
          {fileOver?.at && <div className="kz-de-droptag" role="status">{fileOver.target ? t('Отпусти — заменим файл блока') : t('Отпусти — добавим блок')}</div>}
          {!blocks.length && !ghost && empty && <div className="kz-de-empty">{empty}</div>}
          {toolbarNode && <div className="kz-tools" ref={tools} onPointerDown={(event) => event.stopPropagation()}>{toolbarNode}</div>}
        </div>
      </div>;
  return <div className={`kz-de-stage${backdrop ? ' is-menu' : ''}`}>
    <div className="kz-de-area" ref={area} onPointerDown={pressArea} {...fileDrag}>
      {backdrop ? <div className="kz-de-menu" style={{ width: backdrop.dims.W * m, height: backdrop.dims.H * m, visibility: scale ? 'visible' : 'hidden' }}>
        <div className="kz-de-backdrop kz-screen" inert>{backdrop.node}</div>{board}</div> : board}
    </div>
    {children}
  </div>;
});
export default DesignBoard;
