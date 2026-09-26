import { NumberInput } from './NumberInput.jsx';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import C from '../scripts/core.mjs';
import D from '../scripts/data.mjs';
import {
  DRAWING_TOOLS,
  BRUSH_DEFAULTS,
  GRADIENT_CHARS,
  drawingPoints,
  lassoContains
} from '../scripts/drawing.mjs';
import {
  mergeRows,
  eraseSymbols,
  overflow,
  cropSymbols,
  alignItems,
  moveItems,
  referenceHandles,
  referenceHit,
  transformReference
} from '../scripts/edit-operations.mjs';
import { drawCategoryLabel, measureCategoryText } from '../scripts/dota-rendering.mjs';
import { ReferencePanel } from './ReferencePanel.jsx';
import { CategoryCheckbox, RecentSymbols, CategoryWarning } from './SymbolControls.jsx';
import { pickSymbol, toggleSymbol, MAX_BRUSH_CHARS } from '../scripts/symbol-tools.mjs';

export function DrawingDialog({ editor, reference, canvasSize, recentSymbols }) {
  const dialog = useRef(null),
    canvas = useRef(null),
    viewport = useRef(null),
    stroke = useRef(null),
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
    [selected, setSelected] = useState([]),
    [preview, setPreview] = useState([]),
    [path, setPath] = useState([]),
    [size, setSize] = useState({ w: 800, h: 398 }),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const selectionRef = useRef(selected);
  selectionRef.current = selected;
  const tools = [
    ['select', '↖', 'Выделение'],
    ['reference', '▧', 'Переместить фон'],
    ...DRAWING_TOOLS
  ];
  const bounds = overflow(doc);
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
      ctx.globalAlpha = r.opacity;
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
      const b = C.bounds(
        doc.entities.filter((e) => selected.includes(e.id)),
        true
      );
      ctx.strokeRect(b.x, b.y, b.w, b.h);
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
  }, [doc, preview, path, selected, size, revision, tool]);
  function update(next) {
    latest.current = next;
    setDoc(next);
  }
  function commit(next, before = latest.current) {
    try {
      mergeRows(next, (text) => measureCategoryText(canvas.current.getContext('2d'), text));
      C.assertCategoryLimit(next);
      if (next.entities.length > C.MAX_ENTITIES) throw Error('Лимит — 10 000 объектов.');
      if (JSON.stringify(next) === JSON.stringify(before)) return;
      history.current.push(C.clone(before));
      update(next);
      setSelected([]);
      setError('');
      return true;
    } catch (e) {
      update(before);
      setError(e.message);
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
    const b = canvas.current.getBoundingClientRect();
    return {
      x: ((e.clientX - b.left) * board.w) / b.width,
      y: ((e.clientY - b.top) * board.h) / b.height
    };
  }
  function previewStroke(shift) {
    const s = stroke.current;
    if (s?.type === 'draw')
      setPreview(
        drawingPoints(
          s.tool,
          s.path,
          s.brush,
          s.seed,
          shift,
          Array.from(s.brush.chars.trim()).length <= 1 ? D.frames.simple : null,
          board
        )
      );
  }
  function down(e) {
    if (e.button !== 0 || stroke.current) return;
    e.preventDefault();
    canvas.current.focus();
    canvas.current.setPointerCapture(e.pointerId);
    const p = point(e),
      before = C.clone(latest.current);
    if (tool === 'eyedropper') {
      const char = pickSymbol(before, p, (text) =>
        measureCategoryText(canvas.current.getContext('2d'), text)
      );
      if (char) useSymbol(char);
      else setError('Нажми на существующий символ.');
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
      const hit = [...before.entities].reverse().find((item) => C.containsPoint(item, p));
      const ids = hit
        ? selectionRef.current.includes(hit.id)
          ? selectionRef.current
          : [...(e.shiftKey ? selectionRef.current : []), hit.id]
        : [];
      setSelected(ids);
      if (hit) stroke.current = { type: 'move', before, start: p, ids };
      return;
    }
    stroke.current = {
      type: tool === 'eraser' ? 'erase' : 'draw',
      tool,
      path: [p],
      before,
      brush: { ...brush },
      shift: e.shiftKey,
      seed: Math.floor(Math.random() * 0x7fffffff)
    };
    setSelected([]);
    if (tool === 'eraser') {
      const next = C.clone(before);
      eraseSymbols(next, p);
      update(next);
    } else previewStroke(e.shiftKey);
  }
  function move(e) {
    const s = stroke.current;
    const p = point(e);
    if (!s) {
      if (tool === 'reference') {
        const handle = referenceHit(doc.reference, p, (9 * board.w) / size.w);
        canvas.current.style.cursor = referenceCursor(handle);
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
    } else if (s.type === 'erase') {
      const next = C.clone(latest.current);
      eraseSymbols(next, p);
      update(next);
    } else {
      s.path.push(p);
      if (s.type === 'lasso') setPath([...s.path]);
      else previewStroke(e.shiftKey);
    }
  }
  function finish(e, cancel = false) {
    const s = stroke.current;
    if (!s) return;
    if (cancel) {
      if (s.before) update(s.before);
    } else if (s.type === 'lasso') {
      setSelected([
        ...new Set([
          ...s.previous,
          ...latest.current.entities
            .filter((item) => lassoContains(item, s.path))
            .map((item) => item.id)
        ])
      ]);
      setTool('select');
    } else if (s.type === 'draw') {
      const next = C.clone(s.before);
      const points = drawingPoints(
        s.tool,
        s.path,
        s.brush,
        s.seed,
        s.shift ?? e?.shiftKey ?? false,
        Array.from(s.brush.chars.trim()).length <= 1 ? D.frames.simple : null,
        board
      );
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
    } else commit(C.clone(latest.current), s.before);
    stroke.current = null;
    setPreview([]);
    setPath([]);
    if (e && canvas.current.hasPointerCapture(e.pointerId))
      canvas.current.releasePointerCapture(e.pointerId);
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
          <span className="eyebrow">РИСОВАНИЕ</span>
          <h2 id="drawingTitle">Новый рисунок</h2>
        </div>
        <div className="drawing-history">
          <button
            className="button secondary compact"
            disabled={!history.current.past.length}
            onClick={() => undo()}
          >
            ↶ Отменить
          </button>
          <button
            className="button secondary compact"
            disabled={!history.current.future.length}
            onClick={() => undo(true)}
          >
            ↷ Вернуть
          </button>
        </div>
        <button
          className="picker-close"
          aria-label="Закрыть рисование"
          onClick={editor.closeDrawing}
        >
          ×
        </button>
      </header>
      <div className="drawing-body">
        <div className="drawing-workspace">
          <div className="drawing-toolbar" role="toolbar" aria-label="Инструменты рисунка">
            {tools.map(([key, glyph, label]) => (
              <button
                key={key}
                title={label}
                aria-label={label}
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
            <canvas
              ref={canvas}
              aria-label="Холст нового рисунка"
              tabIndex="0"
              style={{
                width: size.w,
                height: size.h,
                cursor: tool === 'reference' ? 'move' : tool === 'select' ? 'default' : 'crosshair'
              }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={finish}
              onPointerCancel={(e) => finish(e, true)}
              onLostPointerCapture={(e) => {
                if (stroke.current) finish(e, true);
              }}
            />
          </div>
          <div className="drawing-status">
            <span>
              {board.w} × {board.h}
            </span>
            <span>
              Символов: <strong>{C.countSymbols(doc)}</strong>
            </span>
            <span>Строк и объектов: {doc.entities.length}</span>
          </div>
          {!!bounds.count && (
            <div className="canvas-warning" role="status">
              <span>За границами: {bounds.count} символов</span>
              <button
                onClick={() => {
                  const next = C.clone(doc);
                  cropSymbols(next);
                  commit(next);
                }}
              >
                Обрезать
              </button>
            </div>
          )}
          <p className="drawing-shortcuts">
            Shift — прямая по оси · I — взять символ · L — лассо · V — перемещение · Ctrl Z — отмена
          </p>
        </div>
        <aside className="drawing-settings" aria-label="Настройки рисунка">
          <label className="field-label" htmlFor="draftChars">
            Символы кисти
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
            Очистить набор
          </button>
          <label className="field-label" htmlFor="draftOrder">
            Порядок символов
          </label>
          <select
            id="draftOrder"
            value={brush.order}
            onChange={(e) => {
              setBrush({ ...brush, order: e.target.value });
              if (tool === 'gradient' && e.target.value !== 'gradient') setTool('pencil');
            }}
          >
            <option value="sequence">Чередовать</option>
            <option value="random">Случайно</option>
            <option value="gradient">Плавный переход</option>
          </select>
          {brush.order === 'gradient' && (
            <label className="field-label">
              Длина градиента, px
              <NumberInput
                aria-label="Длина градиента"
                type="number"
                min="10"
                max="6000"
                value={brush.gradientLength}
                onChange={(e) => setBrush({ ...brush, gradientLength: Number(e.target.value) })}
              />
            </label>
          )}
          <label className="field-label" htmlFor="draftCategory">
            Библиотека символов
          </label>
          <select id="draftCategory" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.keys(D.symbols).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <CategoryCheckbox
            value={brush.chars}
            chars={D.symbols[category] || ''}
            onChange={(chars) => setBrush({ ...brush, chars: chars.slice(0, MAX_BRUSH_CHARS) })}
          />
          <div className="symbol-library draft-symbols">
            {Array.from(D.symbols[category] || '').map((ch, i) => (
              <button
                key={i}
                title={`Добавить ${ch}`}
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
            <p className="hint">Умная кисть ставит −, |, / и \ по направлению движения.</p>
          )}
          <label className="range-label" htmlFor="draftStep">
            Шаг кисти <output>{brush.step} px</output>
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
            Динамика кисти
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
            <option value="constant">Постоянная плотность</option>
            <option value="denser">От редкого к плотному</option>
            <option value="sparser">От плотного к редкому</option>
          </select>
          {brush.dynamics !== 'constant' && (
            <div className="field-pair">
              <label>
                Конечный шаг
                <NumberInput
                  aria-label="Конечный шаг"
                  type="number"
                  min="3"
                  max="120"
                  value={brush.endStep}
                  onChange={(e) => setBrush({ ...brush, endStep: Number(e.target.value) })}
                />
              </label>
              <label>
                Длина перехода
                <NumberInput
                  aria-label="Длина перехода"
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
              ['mirrorH', 'Симметрия X'],
              ['mirrorV', 'Симметрия Y']
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
              <div className="section-heading">ВЫДЕЛЕНО: {selected.length}</div>
              <div className="align-actions">
                {[
                  ['left', 'По левому краю', '⊢'],
                  ['center', 'По горизонтальному центру', '↔'],
                  ['right', 'По правому краю', '⊣']
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
          <ReferencePanel
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
          />
        </aside>
      </div>
      <footer className="drawing-footer">
        <span role="alert" className="drawing-error">
          {error}
        </span>
        <button className="button secondary" onClick={editor.closeDrawing}>
          Отмена
        </button>
        <button
          className="button primary"
          disabled={!doc.entities.length}
          onClick={() => editor.addDrawing(doc.entities, doc.reference || null)}
        >
          Добавить на холст
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
