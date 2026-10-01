import { NumberInput } from './NumberInput.jsx';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import C from '../scripts/core.mjs';
import D from '../scripts/data.mjs';
import { canvasPoint, snapPoint, hitItem, hitSelectionFrame, inkFrame, intersectsInk, selectionOnClick, centerBrushPoints } from '../scripts/canvas-input.mjs';
import {
  DRAWING_TOOLS,
  BRUSH_DEFAULTS,
  GRADIENT_CHARS,
  drawingPoints,
  setDrawingShift,
  advanceDrawingStroke,
  lassoContains
} from '../scripts/drawing.mjs';
import {
  eraseSymbols,
  overflow,
  cropSymbols,
  alignItems,
  moveItems,
  referenceHandles,
  referenceHit,
  transformReference
} from '../scripts/edit-operations.mjs';
import { drawCategoryLabel, measureCategoryText, measureCategoryInk } from '../scripts/dota-rendering.mjs';
import { ReferencePanel } from './ReferencePanel.jsx';
import { CategoryCheckbox, RecentSymbols, CategoryWarning } from './SymbolControls.jsx';
import { pickSymbol, toggleSymbol, searchSymbols, MAX_BRUSH_CHARS } from '../scripts/symbol-tools.mjs';
import { ERASER, clampEraser, drawBrushRing, readEraserSize, stepEraserSize, storeEraserSize, wheelEraserSize } from '../scripts/eraser-size.mjs';
import { t, tn, translateMessage } from '../scripts/i18n.mjs';

export function DrawingDialog({ editor, reference, canvasSize, recentSymbols }) {
  const dialog = useRef(null),
    canvas = useRef(null),
    viewport = useRef(null),
    stroke = useRef(null),
    activePointer = useRef(null),
    image = useRef(null),
    history = useRef(new C.History(25));
  const [doc, setDoc] = useState(() => ({
    ...C.createDocument('Рисунок'),
    canvas: canvasSize || C.canvasSize(),
    ...(reference ? { reference: C.clone(reference) } : {})
  }));
  const latest = useRef(doc);
  const board = C.canvasSize(doc);
  latest.current = doc;
  const [tool, setTool] = useState('pencil'),
    [brush, setBrush] = useState({ ...BRUSH_DEFAULTS }),
    [category, setCategory] = useState('Геом'),
    [query, setQuery] = useState(''),
    [snap, setSnap] = useState(false),
    [frameStyle, setFrameStyle] = useState('simple'),
    [selected, setSelected] = useState([]),
    [preview, setPreview] = useState([]),
    [path, setPath] = useState([]),
    [size, setSize] = useState({ w: 800, h: 398 }),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    // The opacity slider while it moves, drawn only: its release commits one history step.
    // It belongs to that reference object, so a commit or undo leaves it behind.
    [referencePreview, setReferencePreview] = useState(null);
  const selectionRef = useRef(selected);
  selectionRef.current = selected;
  // Eraser ring lives on its own overlay canvas: hovering never repaints the drawing or re-renders React.
  const [eraserSize, setEraserSize] = useState(readEraserSize);
  const ring = useRef(null), eraserHover = useRef(null), eraserRef = useRef(eraserSize), eraserLabelUntil = useRef(0), eraserLabelTimer = useRef(0);
  const live = useRef({});
  live.current = { tool, board, size, paintRing: paintEraserRing, changeEraser };
  function paintEraserRing() {
    const node = ring.current;
    if (!node) return;
    const ratio = Math.min(devicePixelRatio || 1, 2), w = Math.round(size.w * ratio), h = Math.round(size.h * ratio);
    if (node.width !== w || node.height !== h) Object.assign(node, { width: w, height: h });
    const ctx = node.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const p = eraserHover.current;
    if (tool !== 'eraser' || !p) return;
    ctx.setTransform(w / board.w, 0, 0, h / board.h, 0, 0);
    drawBrushRing(ctx, p, eraserRef.current / 2, board.w / size.w, performance.now() < eraserLabelUntil.current ? `${Math.round(eraserRef.current)} px` : '');
  }
  function changeEraser(value) {
    const next = clampEraser(value);
    eraserRef.current = next;
    setEraserSize(next);
    storeEraserSize(next);
    eraserLabelUntil.current = performance.now() + 900;
    paintEraserRing();
    clearTimeout(eraserLabelTimer.current);
    eraserLabelTimer.current = setTimeout(() => live.current.paintRing(), 950);
  }
  useEffect(() => paintEraserRing(), [tool, size, board.w, board.h]);
  useEffect(() => {
    const node = canvas.current;
    // React wheel listeners are passive; this one must cancel page scrolling.
    const wheel = (event) => {
      const { tool: current, board: area, changeEraser: change } = live.current;
      if (current !== 'eraser' || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      eraserHover.current = canvasPoint(event, node.getBoundingClientRect(), area);
      change(wheelEraserSize(eraserRef.current, event.deltaY, event.deltaMode));
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => { node.removeEventListener('wheel', wheel); clearTimeout(eraserLabelTimer.current); };
  }, []);
  // «Распыление» works on the editor's canvas only (scripts/app.mjs scatterAt).
  const tools = [
    ['select', '↖', t('Выделение')],
    ['reference', '▧', t('Переместить фон')],
    ...DRAWING_TOOLS.filter(([id]) => id !== 'scatter')
  ];
  const bounds = overflow(doc);
  const matchingSymbols = searchSymbols(D.symbols, query, category);
  // Ink bounds per text, cached: selection frames are measured on every pointer move.
  const inkCache = useRef(new Map());
  const ink = (text) => {
    const cache = inkCache.current;
    if (!cache.has(text)) { if (cache.size > 5000) cache.clear(); cache.set(text, measureCategoryInk(canvas.current.getContext('2d'), text)); }
    return cache.get(text);
  };
  useLayoutEffect(() => {
    const trigger = document.activeElement,
      node = dialog.current;
    node.showModal();
    canvas.current.focus();
    const observer = new ResizeObserver(() => {
      const b = viewport.current.getBoundingClientRect(),
        scale = Math.min((b.width - 24) / board.w, (b.height - 24) / board.h);
      setSize({ w: Math.max(1, board.w * scale), h: Math.max(1, board.h * scale) });
    });
    observer.observe(viewport.current);
    return () => {
      observer.disconnect();
      node.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    image.current = null;
    if (!doc.reference) return;
    const img = new Image();
    img.onload = () => {
      image.current = img;
      setRevision((n) => n + 1);
    };
    img.src = doc.reference.src;
    return () => {
      img.onload = null;
    };
  }, [doc.reference?.src]);
  useEffect(() => {
    const cancel = () => { if (stroke.current) finish(null, true); };
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, []);
  useLayoutEffect(() => {
    const node = canvas.current,
      ratio = Math.min(devicePixelRatio || 1, 2);
    node.width = Math.round(size.w * ratio);
    node.height = Math.round(size.h * ratio);
    const ctx = node.getContext('2d');
    ctx.setTransform(node.width / board.w, 0, 0, node.height / board.h, 0, 0);
    ctx.fillStyle = '#191821';
    ctx.fillRect(0, 0, board.w, board.h);
    const r = doc.reference;
    if (r?.visible && image.current) {
      ctx.save();
      ctx.globalAlpha = referencePreview?.reference === r ? referencePreview.opacity : r.opacity;
      ctx.drawImage(image.current, r.x, r.y, r.w, r.h);
      ctx.restore();
    }
    ctx.fillStyle = '#38465770';
    for (let y = 16; y < board.h; y += 16)
      for (let x = 16; x < board.w; x += 16) ctx.fillRect(x, y, 1, 1);
    for (const item of doc.entities) {
      for (const g of C.textGlyphs(item)) drawCategoryLabel(ctx, g.text, g.x, g.y);
    }
    for (const p of preview) drawCategoryLabel(ctx, p.ch, p.x, p.y, '#d6c8f7');
    ctx.strokeStyle = '#c4b5ed';
    ctx.lineWidth = board.w / size.w;
    if (selected.length) {
      // The glyphs' own ink, as in the editor, a hairline off them.
      const b = inkFrame(doc.entities.filter((e) => selected.includes(e.id)), ink), gap = (2 * board.w) / size.w;
      ctx.strokeRect(b.x - gap, b.y - gap, b.w + gap * 2, b.h + gap * 2);
    }
    if (tool === 'reference' && r?.visible) {
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      const half = (4 * board.w) / size.w;
      for (const p of referenceHandles(r)) {
        ctx.fillStyle = '#191821';
        ctx.fillRect(p.x - half, p.y - half, half * 2, half * 2);
        ctx.strokeRect(p.x - half, p.y - half, half * 2, half * 2);
      }
    }
    if (path.length) {
      ctx.beginPath();
      path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = '#d6c8f71a';
      ctx.fill();
      ctx.setLineDash([5, 5]);
      ctx.stroke();
    }
  }, [doc, preview, path, selected, size, revision, tool, referencePreview]);
  function update(next) {
    latest.current = next;
    setDoc(next);
  }
  function commit(next, before = latest.current) {
    try {
      C.assertCategoryLimit(next);
      if (next.entities.length > C.MAX_ENTITIES) throw Error(t('Лимит — 10 000 объектов.'));
      if (JSON.stringify(next) === JSON.stringify(before)) return;
      history.current.push(C.clone(before));
      update(next);
      setSelected([]);
      setError('');
      return true;
    } catch (e) {
      update(before);
      setError(translateMessage(e.message));
    }
  }
  function undo(redo = false) {
    const h = history.current;
    if (!(redo ? h.future : h.past).length) return;
    update(redo ? h.redo(latest.current) : h.undo(latest.current));
    setSelected([]);
    setError('');
  }
  function point(e) {
    return canvasPoint(e, canvas.current.getBoundingClientRect(), board);
  }
  function placedPoints(s, shift) {
    return centerBrushPoints(drawingPoints(s.tool, s.path, s.brush, s.seed, shift && !s.repositioning,
      D.frames[s.frameStyle], board), ink);
  }
  function previewStroke(shift) {
    const s = stroke.current;
    if (s?.type === 'draw') {
      setDrawingShift(s, shift);
      canvas.current.style.cursor = s.repositioning ? 'move' : 'crosshair';
      setPreview(placedPoints(s, shift));
    }
  }

  function down(e) {
    if (e.button !== 0 || stroke.current) return;
    e.preventDefault();
    activePointer.current = e.pointerId;
    canvas.current.focus();
    canvas.current.setPointerCapture(e.pointerId);
    const p = point(e),
      before = C.clone(latest.current);
    if (tool === 'eyedropper') {
      const char = pickSymbol(before, p, (text) =>
        measureCategoryText(canvas.current.getContext('2d'), text)
      );
      if (char) useSymbol(char);
      else setError(t('Нажми на существующий символ.'));
      return;
    }
    if (tool === 'reference') {
      const handle = referenceHit(before.reference, p, (9 * board.w) / size.w);
      setSelected([]);
      if (handle) stroke.current = { type: 'reference', before, start: p, handle };
      return;
    }
    if (tool === 'lasso') {
      stroke.current = {
        type: 'lasso',
        path: [p],
        previous: e.shiftKey ? selectionRef.current : []
      };
      setPath([p]);
      return;
    }
    if (tool === 'select') {
      const frame = inkFrame(before.entities.filter(item => selectionRef.current.includes(item.id)), ink);
      if (!e.shiftKey && hitSelectionFrame(frame, p)) {
        stroke.current = { type: 'move', before, start: p, ids: [...selectionRef.current] };
        canvas.current.style.cursor = 'move';
        return;
      }
      const hit = hitItem(before, p, ink, 3 * board.w / size.w);
      const ids = hit ? [...selectionOnClick(new Set(selectionRef.current), hit.id, e.shiftKey)] : e.shiftKey ? selectionRef.current : [];
      setSelected(ids);
      if (hit && ids.includes(hit.id)) stroke.current = { type: 'move', before, start: p, ids };
      if (!hit) stroke.current = { type: 'marquee', before, start: p, current: p, previous: ids };
      return;
    }

    stroke.current = {
      type: tool === 'eraser' ? 'erase' : 'draw',
      tool,
      path: [snapPoint(p, snap)],
      frameStyle,
      before,
      brush: { ...brush },
      shift: e.shiftKey,
      seed: Math.floor(Math.random() * 0x7fffffff)
    };
    setSelected([]);
    if (tool === 'eraser') {
      const next = C.clone(before);
      eraseSymbols(next, p, eraserRef.current / 2, ink);
      update(next);
    } else previewStroke(e.shiftKey);
  }
  function move(e) {
    const s = stroke.current;
    if (s && e.pointerId !== activePointer.current) return;
    const p = point(e);
    if (tool === 'eraser') {
      eraserHover.current = p;
      paintEraserRing();
    }
    if (!s) {
      if (tool === 'reference') {
        const handle = referenceHit(doc.reference, p, (9 * board.w) / size.w);
        canvas.current.style.cursor = referenceCursor(handle);
      } else if (tool === 'select') {
        const frame = inkFrame(latest.current.entities.filter(item => selectionRef.current.includes(item.id)), ink);
        canvas.current.style.cursor = hitSelectionFrame(frame, p) ? 'move' : '';
      }
      return;
    }
    s.shift = e.shiftKey;
    if (s.type === 'move') {
      const next = C.clone(s.before);
      moveItems(
        next.entities.filter((item) => s.ids.includes(item.id)),
        p.x - s.start.x,
        p.y - s.start.y
      );
      update(next);
    } else if (s.type === 'reference') {
      const next = C.clone(s.before);
      next.reference = transformReference(
        s.before.reference,
        { x: p.x - s.start.x, y: p.y - s.start.y },
        s.handle,
        e.shiftKey
      );
      update(next);
    } else if (s.type === 'marquee') {
      s.current = p;
      setPath([s.start, { x:p.x, y:s.start.y }, p, { x:s.start.x, y:p.y }]);
    } else if (s.type === 'erase') {
      const next = C.clone(latest.current);
      eraseSymbols(next, p, eraserRef.current / 2, ink);
      update(next);
    } else if (s.type === 'draw') {
      advanceDrawingStroke(s, snapPoint(p, snap), e.shiftKey);
      previewStroke(e.shiftKey);
    } else if (s.type === 'lasso') {
      s.path.push(p);
      setPath([...s.path]);
    }
  }
  function finish(e, cancel = false) {
    const s = stroke.current;
    if (!s || (e && e.pointerId !== activePointer.current)) return;
    if (cancel) {
      if (s.before) update(s.before);
    } else if (s.type === 'lasso') {
      setSelected([
        ...new Set([
          ...s.previous,
          ...latest.current.entities
            .filter((item) => lassoContains(item, s.path, ink))
            .map((item) => item.id)
        ])
      ]);
      setTool('select');
    } else if (s.type === 'marquee') {
      const b = { x:Math.min(s.start.x,s.current.x), y:Math.min(s.start.y,s.current.y),
        w:Math.abs(s.current.x-s.start.x), h:Math.abs(s.current.y-s.start.y) };
      setSelected([...new Set([...s.previous, ...latest.current.entities.filter((item) => intersectsInk(item,b,ink)).map((item) => item.id)])]);
    } else if (s.type === 'draw') {
      if (e) advanceDrawingStroke(s, snapPoint(point(e), snap), e.shiftKey);
      const next = C.clone(s.before);
      const points = placedPoints(s, s.shift ?? e?.shiftKey ?? false);
      for (const p of points)
        next.entities.push(
          C.entity(next, {
            type: 'symbol',
            text: p.ch,
            name: p.ch,
            x: p.x,
            y: p.y,
            w: 30,
            h: 30,
            layer: 'decor'
          })
        );
      if (commit(next, s.before)) editor.rememberSymbols(points.map((p) => p.ch).join(''));
    } else {
      commit(C.clone(latest.current), s.before);
      if (s.type === 'move') setSelected(s.ids);
    }
    stroke.current = null;
    setPreview([]);
    setPath([]);
    canvas.current.style.cursor = tool === 'select' ? 'default' : tool === 'reference' ? 'move' : 'crosshair';
    if (canvas.current.hasPointerCapture(activePointer.current))
      canvas.current.releasePointerCapture(activePointer.current);
    activePointer.current = null;
  }
  function keyboard(e) {
    if (e.target.closest('input,select,textarea')) return;
    const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : e.key.toLowerCase();
    if (stroke.current) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(null, true);
      }
      if (e.key === 'Shift') {
        stroke.current.shift = true;
        previewStroke(true);
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(key)) {
      e.preventDefault();
      undo(key === 'y' || e.shiftKey);
    }
    if ((e.ctrlKey || e.metaKey) && key === 'a') {
      e.preventDefault();
      setSelected(doc.entities.map((item) => item.id));
      setTool('select');
    }
    if (['Delete', 'Backspace'].includes(e.key) && selected.length) {
      e.preventDefault();
      const next = C.clone(doc);
      next.entities = next.entities.filter((item) => !selected.includes(item.id));
      commit(next);
    }
    if (tool === 'eraser' && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
      e.preventDefault();
      changeEraser(stepEraserSize(eraserRef.current, e.code === 'BracketRight' ? 1 : -1));
    }
    if (!e.ctrlKey && !e.metaKey) {
      if (key === 'l') setTool('lasso');
      if (key === 'b') setTool('pencil');
      if (key === 'v') setTool('select');
      if (key === 'e') setTool('eraser');
      if (key === 'i') setTool('eyedropper');
    }
  }
  function useSymbol(char) {
    setBrush((prev) => ({ ...prev, chars: char, order: 'sequence' }));
    setTool('pencil');
    setError('');
    editor.rememberSymbols(char);
  }
  return (
    <dialog
      ref={dialog}
      className="drawing-dialog"
      aria-labelledby="drawingTitle"
      onCancel={(e) => {
        e.preventDefault();
        if (stroke.current) finish(null, true);
        else editor.closeDrawing();
      }}
      onKeyDown={keyboard}
      onKeyUp={(e) => {
        if (e.key === 'Shift' && stroke.current) {
          stroke.current.shift = false;
          previewStroke(false);
        }
      }}
    >
      <header className="drawing-heading">
        <div>
          <span className="eyebrow">{t('РИСОВАНИЕ')}</span>
          <h2 id="drawingTitle">{t('Новый рисунок')}</h2>
        </div>
        <div className="drawing-history">
          <button
            className="button secondary compact"
            disabled={!history.current.past.length}
            onClick={() => undo()}
          >
            ↶ {t('Отменить')}
          </button>
          <button
            className="button secondary compact"
            disabled={!history.current.future.length}
            onClick={() => undo(true)}
          >
            ↷ {t('Вернуть')}
          </button>
        </div>
        <button
          className="picker-close"
          aria-label={t('Закрыть рисование')}
          onClick={editor.closeDrawing}
        >
          ×
        </button>
      </header>
      <div className="drawing-body">
        <div className="drawing-workspace">
          <div className="drawing-toolbar" role="toolbar" aria-label={t('Инструменты рисунка')}>
            {tools.map(([key, glyph, label]) => (
              <button
                key={key}
                title={translateMessage(label)}
                aria-label={translateMessage(label)}
                aria-pressed={tool === key}
                className={tool === key ? 'active' : ''}
                disabled={key === 'reference' && !doc.reference?.visible}
                onClick={() => {
                  setTool(key);
                  if (key === 'gradient')
                    setBrush({ ...brush, chars: GRADIENT_CHARS, order: 'gradient' });
                  if (key === 'reference') setSelected([]);
                }}
              >
                {glyph}
              </button>
            ))}
          </div>
          <CategoryWarning count={C.categoryCount(doc)} />
          <RecentSymbols symbols={recentSymbols} onPick={useSymbol} />
          <div ref={viewport} className="drawing-viewport">
            <div className="drawing-canvas-frame">
            <canvas
              ref={canvas}
              aria-label={t('Холст нового рисунка')}
              tabIndex="0"
              style={{
                width: size.w,
                height: size.h,
                cursor: tool === 'reference' ? 'move' : tool === 'select' ? 'default' : tool === 'eraser' ? 'none' : 'crosshair'
              }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={finish}
              onPointerLeave={() => { eraserHover.current = null; paintEraserRing(); }}
              onPointerCancel={(e) => finish(e, true)}
              onLostPointerCapture={(e) => {
                if (stroke.current) finish(e, true);
              }}
            />
            <canvas ref={ring} className="drawing-eraser-ring" aria-hidden="true" style={{ width: size.w, height: size.h }} />
            </div>
          </div>
          <div className="drawing-status">
            <span>
              {board.w} × {board.h}
            </span>
            <span>
              {t('Символов:')} <strong>{C.countSymbols(doc)}</strong>
            </span>
            <span>{t('Строк и объектов: {count}', { count: doc.entities.length })}</span>
          </div>
          {!!bounds.count && (
            <div className="canvas-warning" role="status">
              <span>{t('За границами:')} {tn(bounds.count, ['символ', 'символа', 'символов'], ['symbol', 'symbols'])}</span>
              <button
                onClick={() => {
                  const next = C.clone(doc);
                  cropSymbols(next);
                  commit(next);
                }}
              >
                {t('Обрезать')}
              </button>
            </div>
          )}
          <p className="drawing-shortcuts">
            {t('Shift — сдвинуть фигуру, у кисти — прямая по оси · V — перемещение · Ctrl Z — отмена')}
          </p>
        </div>
        <aside className="drawing-settings" aria-label={t('Настройки рисунка')}>
          <button className="button secondary full" onClick={() => document.getElementById('draftReferencePanel').scrollIntoView({ block:'nearest', behavior:'smooth' })}>{t('Фон для обводки')}</button>
          <label className="check-row"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />{t('Привязка к сетке 8 px')}</label>
          {tool === 'eraser' && <><label className="range-label" htmlFor="draftEraserSize">{t('Размер ластика')} <output>{Math.round(eraserSize)} px</output></label>
            <input id="draftEraserSize" type="range" min={ERASER.min} max={ERASER.max} value={Math.round(eraserSize)} onChange={(e) => changeEraser(Number(e.target.value))} />
            <p className="hint">{t('Колесо мыши над холстом или [ и ] — меньше и больше.')}</p></>}
          {tool === 'frame' && <><label className="field-label" htmlFor="draftFrame">{t('Стиль рамки')}</label>
            <select id="draftFrame" value={frameStyle} onChange={(e) => setFrameStyle(e.target.value)}>
              {Object.entries(D.frames).map(([key, frame]) => <option key={key} value={key}>{frame.tl} {frame.h} {frame.tr} · {frame.v}</option>)}
            </select></>}
          <label className="field-label" htmlFor="draftChars">
            {t('Символы кисти')}
          </label>
          <input
            id="draftChars"
            value={brush.chars}
            maxLength={MAX_BRUSH_CHARS}
            onChange={(e) => setBrush({ ...brush, chars: e.target.value })}
          />
          <button
            className="button ghost compact"
            onClick={() => setBrush({ ...brush, chars: '' })}
          >
            {t('Очистить набор')}
          </button>
          <label className="field-label" htmlFor="draftOrder">
            {t('Порядок символов')}
          </label>
          <select
            id="draftOrder"
            value={brush.order}
            onChange={(e) => {
              setBrush({ ...brush, order: e.target.value });
              if (tool === 'gradient' && e.target.value !== 'gradient') setTool('pencil');
            }}
          >
            <option value="sequence">{t('Чередовать')}</option>
            <option value="random">{t('Случайно')}</option>
            <option value="gradient">{t('Плавный переход')}</option>
          </select>
          {brush.order === 'gradient' && (
            <label className="field-label">
              {t('Длина градиента, px')}
              <NumberInput
                aria-label={t('Длина градиента')}
                type="number"
                min="10"
                max="6000"
                value={brush.gradientLength}
                onChange={(e) => setBrush({ ...brush, gradientLength: Number(e.target.value) })}
              />
            </label>
          )}
          <label className="field-label" htmlFor="draftCategory">
            {t('Библиотека символов')}
          </label>
          <input type="search" aria-label={t('Поиск символов')} placeholder={t('Символ, название или U+…')} value={query} onChange={(e) => setQuery(e.target.value)} />
          <select id="draftCategory" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.keys(D.symbols).map((name) => (
              <option key={name} value={name}>{t(name)}</option>
            ))}
          </select>
          <CategoryCheckbox
            value={brush.chars}
            chars={matchingSymbols}
            onChange={(chars) => setBrush({ ...brush, chars: chars.slice(0, MAX_BRUSH_CHARS) })}
          />
          <div className="symbol-library draft-symbols">
            {!matchingSymbols.length && <p className="hint">{t('Символы не найдены. Попробуй название категории или вставь сам символ.')}</p>}
            {matchingSymbols.map((ch, i) => (
              <button
                key={i}
                title={t('Добавить {symbol}', { symbol: ch })}
                aria-pressed={brush.chars.includes(ch)}
                className={brush.chars.includes(ch) ? 'active' : ''}
                onClick={() =>
                  setBrush({
                    ...brush,
                    chars: toggleSymbol(brush.chars, ch).slice(0, MAX_BRUSH_CHARS)
                  })
                }
              >
                {ch}
              </button>
            ))}
          </div>
          {tool === 'smart' && (
            <p className="hint">{t('Умная кисть ставит −, |, / и \\ по направлению движения.')}</p>
          )}
          <label className="range-label" htmlFor="draftStep">
            {t('Шаг кисти')} <output>{brush.step} px</output>
          </label>
          <input
            id="draftStep"
            type="range"
            min="3"
            max="80"
            value={brush.step}
            onChange={(e) => setBrush({ ...brush, step: Number(e.target.value) })}
          />
          <label className="field-label" htmlFor="draftDynamics">
            {t('Динамика кисти')}
          </label>
          <select
            id="draftDynamics"
            value={brush.dynamics}
            onChange={(e) =>
              setBrush({
                ...brush,
                dynamics: e.target.value,
                endStep: e.target.value === 'denser' ? 5 : 40
              })
            }
          >
            <option value="constant">{t('Постоянная плотность')}</option>
            <option value="denser">{t('От редкого к плотному')}</option>
            <option value="sparser">{t('От плотного к редкому')}</option>
          </select>
          {brush.dynamics !== 'constant' && (
            <div className="field-pair">
              <label>
                {t('Конечный шаг')}
                <NumberInput
                  aria-label={t('Конечный шаг')}
                  type="number"
                  min="3"
                  max="120"
                  value={brush.endStep}
                  onChange={(e) => setBrush({ ...brush, endStep: Number(e.target.value) })}
                />
              </label>
              <label>
                {t('Длина перехода')}
                <NumberInput
                  aria-label={t('Длина перехода')}
                  type="number"
                  min="30"
                  max="2000"
                  value={brush.length}
                  onChange={(e) => setBrush({ ...brush, length: Number(e.target.value) })}
                />
              </label>
            </div>
          )}
          <div className="field-pair">
            {[
              ['mirrorH', t('Симметрия X')],
              ['mirrorV', t('Симметрия Y')]
            ].map(([key, label]) => (
              <label key={key} className="check-row">
                <input
                  type="checkbox"
                  checked={brush[key]}
                  onChange={(e) => setBrush({ ...brush, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <>
              <div className="section-heading">{t('ВЫДЕЛЕНО: {count}', { count: selected.length })}</div>
              <div className="align-actions">
                {[
                  ['left', t('По левому краю'), '⊢'],
                  ['center', t('По горизонтальному центру'), '↔'],
                  ['right', t('По правому краю'), '⊣']
                ].map(([side, label, glyph]) => (
                  <button
                    key={side}
                    title={label}
                    aria-label={label}
                    onClick={() => {
                      const next = C.clone(doc);
                      alignItems(
                        next.entities.filter((item) => selected.includes(item.id)),
                        side,
                        board
                      );
                      commit(next);
                    }}
                  >
                    {glyph}
                  </button>
                ))}
              </div>
            </>
          )}
          <div id="draftReferencePanel"><ReferencePanel
            value={doc.reference}
            canvasSize={board}
            editing={tool === 'reference'}
            onEdit={() => {
              setTool('reference');
              setSelected([]);
            }}
            onChange={(reference) => {
              const next = C.clone(doc);
              if (reference) next.reference = reference;
              else delete next.reference;
              commit(next);
              if (reference && reference.src !== doc.reference?.src) setTool('reference');
              if (!reference) setTool('pencil');
            }}
            onPreview={(opacity) => setReferencePreview(opacity == null || !doc.reference ? null : { reference: doc.reference, opacity })}
          /></div>
        </aside>
      </div>
      <footer className="drawing-footer">
        <span role="alert" className="drawing-error">
          {error}
        </span>
        <button className="button secondary" onClick={editor.closeDrawing}>
          {t('Отмена')}
        </button>
        <button
          className="button primary"
          disabled={!doc.entities.length}
          onClick={() => editor.addDrawing(doc.entities, doc.reference || null)}
        >
          {t('Добавить на холст')}
        </button>
      </footer>
    </dialog>
  );
}

function referenceCursor(handle) {
  if (!handle) return 'default';
  if (handle === 'move') return 'move';
  if (['nw', 'se'].includes(handle)) return 'nwse-resize';
  if (['ne', 'sw'].includes(handle)) return 'nesw-resize';
  return ['n', 's'].includes(handle) ? 'ns-resize' : 'ew-resize';
}
