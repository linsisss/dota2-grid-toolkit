import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../catalog/Common.jsx';
import { WIDGET_SCREEN } from '../../scripts/menu-widgets.mjs';
import WidgetView from './WidgetView.jsx';
import { autoAnchor, fitRect, fixedOf, minOf, overlap, rectOf, shiftOf, snapRect } from './geometry.js';

// The constructor's screen (the approved mockup's board, 2026-10-31): the scene the page draws (MenuScreen,
// MatchScreen, FontScreen) fills it, and over the main menu lie the widgets in 1080p pixels, scaled with it.
// A widget is moved by dragging and resized by its corners (Shift keeps its shape); it sticks to the screen's
// edges and centre, to the other widgets and to Valve's columns (Alt: not this time). Valve's own panels can
// be clicked (they open their settings) and shown as zones; a widget dragged over one marks it. Widgets come
// in from the shelf by `paletteDrag`; a double click opens one (a widget of one's own: «Редактор виджета»). The
// board keeps only the drag in progress; the page keeps the rest.
const HANDLES = ['nw', 'ne', 'sw', 'se'];
const round = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
const inside = (event, box) => event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;

const Board = forwardRef(function Board({ dims, zoom, onZoom, onScale, onLayout, children, widgets, locked, selected, onSelect, zones, zoneLabels, slots, showZones, lines, snap,
  onCommit, live, toolbar, slotLabel, widgetLabel, fontStyle, hint = null, interactive = true, onOpen, onSlotDrag = null }, ref) {
  const area = useRef(null), canvas = useRef(null), tools = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 }), [drag, setDrag] = useState(null), [ghost, setGhost] = useState(null), [target, setTarget] = useState(null), [hover, setHover] = useState(null);
  const dragging = useRef(null);
  const fitScale = box.w && box.h ? Math.max(0.05, Math.min(box.w / dims.W, box.h / dims.H)) : 0;
  const scale = zoom || fitScale;
  const latest = useRef({}); latest.current = { dims, scale, widgets, snap, lines, locked, onCommit, live, onSelect };

  // The area's free room (without its padding) → the scale that fits the screen.
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
  useLayoutEffect(() => { onLayout?.(); }, [scale, dims.W, dims.H, box.w, box.h]);
  // Ctrl + wheel zooms.
  useEffect(() => {
    const node = area.current;
    const wheel = (event) => { if (!(event.ctrlKey || event.metaKey)) return; event.preventDefault(); onZoom(Math.min(3, Math.max(0.15, latest.current.scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1)))); };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [onZoom]);

  const others = (id) => latest.current.widgets.filter((w) => w.id !== id && !w.hidden).map((w) => rectOf(w, latest.current.dims));
  const snapped = (rect, mode, event, skip) => {
    const { snap: on, dims: d, lines: l, scale: s } = latest.current;
    return on && !event.altKey ? snapRect(rect, mode, { dims: d, others: others(skip), lines: l, threshold: 7 / s }) : { rect, guides: [] };
  };
  // A pointer drag: nothing until it moved 3 px, then `onMove(dx, dy, event)` in screen pixels.
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
  const show = (next) => { dragging.current = next; setDrag(next); latest.current.live.set(next && { id: next.id, rect: next.rect, anchor: next.anchor }); };
  const finish = (moved) => {
    const done = dragging.current;
    if (moved && done) latest.current.onCommit(done.id, done.rect, done.anchor, done.how);
    show(null);
  };
  function startMove(event, widget) {
    const d = latest.current.dims, start = rectOf(widget, d);
    follow(event, (dx, dy, ev) => {
      const { rect, guides } = snapped({ ...start, x: start.x + dx, y: start.y + dy }, 'move', ev, widget.id);
      const fit = fitRect(round(rect), widget.anchor, d);
      show({ id: widget.id, how: 'move', rect: fit.rect, anchor: fit.anchor, guides, tag: `X ${fit.rect.x} · Y ${fit.rect.y}` });
    }, finish);
  }
  function startResize(event, widget, corner) {
    const d = latest.current.dims, start = rectOf(widget, d), ratio = start.w / start.h, [minW, minH] = minOf(widget.type);
    const { dx: fx, dy: fy } = shiftOf(widget.anchor, d), bounds = { left: fx, right: fx + WIDGET_SCREEN.width, top: fy + WIDGET_SCREEN.top, bottom: fy + WIDGET_SCREEN.height };
    follow(event, (dx, dy, ev) => {
      let r = { ...start };
      if (corner.includes('e')) r.w = start.w + dx;
      if (corner.includes('s')) r.h = start.h + dy;
      if (corner.includes('w')) { r.x = start.x + dx; r.w = start.w - dx; }
      if (corner.includes('n')) { r.y = start.y + dy; r.h = start.h - dy; }
      // A widget of one's own keeps its design's proportions (the store would anyway).
      const keep = ev.shiftKey || widget.type === 'custom';
      const res = snapped(r, keep ? corner.replace(/[ns]/g, '') : corner, ev, widget.id);
      r = res.rect;
      let guides = keep ? res.guides.filter((g) => g.axis === 'v') : res.guides;
      // The frame: the screen under the top bar, as the anchor has it.
      if (r.x < bounds.left) { r.w -= bounds.left - r.x; r.x = bounds.left; }
      if (r.x + r.w > bounds.right) r.w = bounds.right - r.x;
      if (r.y < bounds.top) { r.h -= bounds.top - r.y; r.y = bounds.top; }
      if (r.y + r.h > bounds.bottom) r.h = bounds.bottom - r.y;
      r.w = Math.max(minW, r.w); r.h = Math.max(minH, r.h);
      if (keep) {
        r.h = r.w / ratio;
        const room = corner.includes('n') ? start.y + start.h - bounds.top : bounds.bottom - start.y;
        if (r.h > room) { r.h = room; r.w = r.h * ratio; }
        if (r.h < minH) { r.h = minH; r.w = r.h * ratio; }
        guides = guides.filter((g) => g.axis === 'v');
      }
      if (corner.includes('w')) r.x = start.x + start.w - r.w;
      if (corner.includes('n')) r.y = start.y + start.h - r.h;
      r = round(r);
      show({ id: widget.id, how: 'resize', rect: r, anchor: widget.anchor, guides, tag: `${r.w} × ${r.h}` });
    }, finish);
  }

  // ——— Dragging something in from the shelf ———
  // spec: { kind: 'widget', widget (its type, size, props), drop(rect, anchor), click() } or
  // { kind: 'apply', label, drop(), click() }; `start()` when the drag begins.
  function paletteDrag(event, spec) {
    if (event.button !== 0) return;
    const source = event.currentTarget, from = source.getBoundingClientRect(), px = event.clientX, py = event.clientY, width = Math.min(from.width, 220);
    let card = null, over = false, last = null;
    const move = (ev) => {
      if (!card) {
        if (Math.hypot(ev.clientX - px, ev.clientY - py) < 5) return;
        card = source.cloneNode(true); card.classList.add('kz-drag-card'); card.style.width = `${width}px`;
        document.body.append(card); document.body.classList.add('kz-dragging'); setHover(null);
        spec.start?.();
      }
      card.style.transform = `translate(${ev.clientX - width / 2}px, ${ev.clientY - 24}px) rotate(-2deg)`;
      const c = canvas.current?.getBoundingClientRect();
      over = !!c && inside(ev, c) && inside(ev, area.current.getBoundingClientRect()) && !ev.target.closest?.('.kz-glass');
      card.classList.toggle('is-over', over && spec.kind === 'widget');
      if (spec.kind === 'widget') {
        if (!over) { last = null; setGhost(null); return; }
        const { dims: d, scale: s } = latest.current, w = spec.widget.w, h = spec.widget.h;
        const at = { x: (ev.clientX - c.left) / s - w / 2, y: (ev.clientY - c.top) / s - h / 2, w, h };
        const { rect, guides } = snapped(at, 'move', ev, null);
        const anchor = autoAnchor(rect, d), fit = fitRect(round(rect), anchor, d);
        last = fit;
        setGhost({ widget: { ...spec.widget, ...placeHolder(fit.rect) }, rect: fit.rect, guides });
      } else setTarget(over ? { label: spec.label } : null);
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      document.body.classList.remove('kz-dragging');
      setGhost(null); setTarget(null);
      if (!card) { spec.click?.(); return; }
      if (over && (spec.kind !== 'widget' || last)) { card.remove(); spec.drop(last?.rect, last?.anchor); return; }
      card.classList.add('is-back'); card.style.transform = `translate(${from.left}px, ${from.top}px)`;
      setTimeout(() => card.remove(), 340);
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  const placeHolder = (rect) => ({ w: rect.w, h: rect.h });
  useImperativeHandle(ref, () => ({
    paletteDrag,
    // A rect of the screen on the page (for what floats next to the selection).
    toPage(rect) {
      const c = canvas.current?.getBoundingClientRect(), s = latest.current.scale;
      return c ? { left: c.left + rect.x * s, top: c.top + rect.y * s, right: c.left + (rect.x + rect.w) * s, bottom: c.top + (rect.y + rect.h) * s } : null;
    },
    fitScale: () => fitScale
  }));

  const sel = selected && (selected.kind === 'widget' ? widgets.find((w) => w.id === selected.id) : null);
  const selSlot = selected?.kind === 'slot' ? slots.find((zone) => zone.id === selected.id) : null;
  const selRect = drag && sel && drag.id === sel.id ? drag.rect : sel ? rectOf(sel, dims) : selSlot;
  const hit = drag?.rect || ghost?.rect || null;
  const zonesOn = showZones || !!drag || !!ghost;
  const guides = drag?.guides || ghost?.guides || [];
  const toolbarNode = !drag && selRect && interactive ? toolbar?.(selected) : null;
  // The toolbar under the selection (above it when there is no room), inside the screen.
  useLayoutEffect(() => {
    const node = tools.current;
    if (!node || !selRect || !scale) return;
    const cw = dims.W * scale, ch = dims.H * scale, tw = node.offsetWidth, th = node.offsetHeight;
    let top = (selRect.y + selRect.h) * scale + 12;
    if (top + th > ch - 4) top = selRect.y * scale - th - 30;
    if (top < 4) top = Math.min(ch - th - 8, selRect.y * scale + 8);
    node.style.left = `${Math.max(4, Math.min(cw - tw - 4, (selRect.x + selRect.w / 2) * scale - tw / 2))}px`;
    node.style.top = `${top}px`;
  });

  const pressArea = (event) => {
    if (event.button !== 0 || !interactive) return;
    if (event.target.closest('.kz-item, .kz-slot, .kz-tools, .kz-handle')) return;
    onSelect(null);
  };
  const pressItem = (event, widget) => {
    if (event.button !== 0 || !interactive) return;
    event.preventDefault(); event.stopPropagation();
    if (selected?.kind !== 'widget' || selected.id !== widget.id) onSelect({ kind: 'widget', id: widget.id });
    if (!locked.has(widget.id)) startMove(event, widget);
  };
  const pressHandle = (event, corner) => {
    event.preventDefault(); event.stopPropagation();
    if (sel && !locked.has(sel.id)) startResize(event, sel, corner);
  };
  const s = scale || 0.0001;
  const px = (r) => ({ left: r.x * s, top: r.y * s, width: r.w * s, height: r.h * s });

  return <div className="kz-area" ref={area} onPointerDown={pressArea} onScroll={() => onLayout?.()}>
    <div className="kz-canvas" ref={canvas} style={{ width: dims.W * s, height: dims.H * s, visibility: scale ? 'visible' : 'hidden' }}>
      <div className="kz-clip">
        <div className="kz-screen">{children}</div>
        <div className="kz-layer" style={{ width: dims.W, height: dims.H, transform: `scale(${s})`, ...fontStyle }}>
          {slots.map((zone) => <div key={zone.id} className={`kz-slot${selSlot?.id === zone.id ? ' is-on' : ''}`} data-slot={zone.id} style={{ left: zone.x, top: zone.y, width: zone.w, height: zone.h }}
            onPointerDown={(event) => {
              if (event.button !== 0 || !interactive) return;
              event.stopPropagation(); onSelect({ kind: 'slot', id: zone.id });
              // A panel Valve lets move (the chat, 2026-11-02): dragged by its shift (onSlotDrag(id, dx, dy, done)).
              if (!onSlotDrag?.(zone.id, 0, 0, false)) return;
              event.preventDefault();
              const x0 = event.clientX, y0 = event.clientY, scaleNow = latest.current.scale;
              const move = (e) => onSlotDrag(zone.id, (e.clientX - x0) / scaleNow, (e.clientY - y0) / scaleNow, false);
              const up = (e) => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); onSlotDrag(zone.id, (e.clientX - x0) / scaleNow, (e.clientY - y0) / scaleNow, true); };
              addEventListener('pointermove', move); addEventListener('pointerup', up);
            }}
            onPointerEnter={() => !dragging.current && setHover({ rect: zone, slot: true, id: `slot:${zone.id}` })} onPointerLeave={() => setHover(null)}/>)}
          {widgets.map((widget, i) => {
            const r = drag?.id === widget.id ? drag.rect : rectOf(widget, dims);
            return <div key={widget.id} className={`kz-item${widget.hidden ? ' is-hidden' : ''}${locked.has(widget.id) ? ' is-locked' : ''}`} data-id={widget.id}
              style={{ left: r.x, top: r.y, width: r.w, height: r.h, opacity: widget.opacity / 100, zIndex: i + 1 }}
              onPointerDown={(event) => pressItem(event, widget)} onDragStart={(event) => event.preventDefault()} onDoubleClick={() => interactive && onOpen?.(widget)}
              onPointerEnter={() => !dragging.current && setHover({ rect: rectOf(widget, dims), id: widget.id })} onPointerLeave={() => setHover(null)}>
              <WidgetView widget={widget}/></div>;
          })}
          {ghost && <div className="kz-item is-ghost" style={{ left: ghost.rect.x, top: ghost.rect.y, width: ghost.rect.w, height: ghost.rect.h, zIndex: 999 }}><WidgetView widget={{ ...ghost.widget, ...ghost.rect }}/></div>}
          {zonesOn && <div className="kz-zones" aria-hidden="true">{zones.map((zone) => <div key={zone.id} className={`kz-zone${hit && overlap(hit, zone) ? ' is-hit' : ''}`} style={{ left: zone.x, top: zone.y, width: zone.w, height: zone.h }}>
            <span>{zoneLabels[zone.id]}</span></div>)}</div>}
        </div>
      </div>
      <div className="kz-overlay">
        {hover && !drag && hover.id !== (selected?.kind === 'slot' ? `slot:${selected.id}` : selected?.id) && <div className={`kz-hover${hover.slot ? ' is-slot' : ''}`} style={px(hover.rect)}/>}
        {guides.map((g, i) => <div key={i} className={`kz-guide is-${g.axis}${g.valve ? ' is-valve' : ''}`} style={g.axis === 'v' ? { left: g.at * s } : { top: g.at * s }}>{g.label && zoneLabels[`@${g.label}`] && <span>{zoneLabels[`@${g.label}`]}</span>}</div>)}
        {selRect && <div className={`kz-sel${selSlot ? ' is-slot' : ''}${sel && locked.has(sel.id) ? ' is-locked' : ''}${selRect.y * s < 24 ? ' is-top' : ''}`} style={px(selRect)}>
          <span className="kz-name">{sel && locked.has(sel.id) && <Icon name="lock" size={11}/>}{sel ? widgetLabel(sel) : slotLabel(selSlot.id)}</span>
          {drag && <span className="kz-dims">{drag.tag}</span>}
          {sel && !locked.has(sel.id) && !fixedOf(sel.type) && interactive && HANDLES.map((corner) => <i key={corner} className="kz-handle" data-h={corner} onPointerDown={(event) => pressHandle(event, corner)}/>)}
        </div>}
        {hint && !drag && !ghost && <div className="kz-hint" style={{ bottom: Math.round(78 * s) }} onPointerDown={(event) => event.stopPropagation()}>{hint}</div>}
        {target && <div className="kz-target"><span>{target.label}</span></div>}
        {toolbarNode && <div className="kz-tools" ref={tools} onPointerDown={(event) => event.stopPropagation()}>{toolbarNode}</div>}
      </div>
    </div>
  </div>;
});
export default Board;
