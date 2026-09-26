import { useEffect, useRef, useState } from 'react';
import C from '../scripts/core.mjs';
import { NumberInput } from './NumberInput.jsx';
import { categorySelection, toggleCategory } from '../scripts/symbol-tools.mjs';

export function CategoryCheckbox({ value, chars, onChange }) {
  const ref = useRef(null),
    state = categorySelection(value, chars);
  useEffect(() => {
    ref.current.indeterminate = state.partial;
  }, [state.partial]);
  return (
    <label className="check-row category-select-all">
      <input
        ref={ref}
        type="checkbox"
        checked={state.all}
        onChange={(e) => onChange(toggleCategory(value, chars, e.target.checked))}
      />
      Выбрать все символы
    </label>
  );
}
export function RecentSymbols({ symbols = [], onPick }) {
  return (
    <div className="recent-symbols" role="toolbar" aria-label="Последние символы">
      <span>Недавние</span>
      {Array.from({ length: 8 }, (_, i) =>
        symbols[i] ? (
          <button
            key={i}
            title={`Взять символ ${symbols[i]}`}
            aria-label={`Взять символ ${symbols[i]}`}
            onClick={() => onPick(symbols[i])}
          >
            {symbols[i]}
          </button>
        ) : (
          <span key={i} className="recent-empty" aria-hidden="true">
            ·
          </span>
        )
      )}
    </div>
  );
}
export function CategoryWarning({ count }) {
  if (count <= 2000) return null;
  return (
    <div className="category-warning" role="alert">
      <span aria-hidden="true">!</span>
      <div>
        <strong>{count.toLocaleString('ru-RU')} категорий — высокая нагрузка</strong>
        <p>Больше 2000 категорий могут вызывать лаги и вылет Dota 2.</p>
      </div>
    </div>
  );
}
export function CanvasSizeFields({ size, onApply }) {
  const [w, setW] = useState(String(size.w)),
    [h, setH] = useState(String(size.h)),
    [error, setError] = useState('');
  useEffect(() => {
    setW(String(size.w));
    setH(String(size.h));
    setError('');
  }, [size.w, size.h]);
  const apply = (width = w, height = h) => {
    try {
      const next = C.validateCanvas({ w: Number(width), h: Number(height) });
      setError('');
      if (next.w !== size.w || next.h !== size.h) onApply(next);
    } catch (error) {
      setError(error.message);
    }
  };
  return (
    <div className="canvas-dimensions-edit">
      <div className="canvas-dimension-inputs" role="group" aria-label="Размер холста">
        <label>
          <span>W</span>
          <NumberInput
            aria-label="Ширина холста"
            type="number"
            min="100"
            max="6000"
            step="1"
            value={w}
            onChange={(e) => setW(e.target.value)}
            onBlur={() => apply()}
            onStep={(value) => {
              setW(value);
              apply(value, h);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setW(String(size.w));
                setH(String(size.h));
                setError('');
                e.stopPropagation();
              }
            }}
          />
        </label>
        <span aria-hidden="true">×</span>
        <label>
          <span>H</span>
          <NumberInput
            aria-label="Высота холста"
            type="number"
            min="100"
            max="6000"
            step="1"
            value={h}
            onChange={(e) => setH(e.target.value)}
            onBlur={() => apply()}
            onStep={(value) => {
              setH(value);
              apply(w, value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setW(String(size.w));
                setH(String(size.h));
                setError('');
                e.stopPropagation();
              }
            }}
          />
        </label>
        <span>px</span>
      </div>
      {error && (
        <span className="canvas-size-note" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
