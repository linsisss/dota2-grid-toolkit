import { useEffect, useRef, useState } from 'react';
import C from '../scripts/core.mjs';
import { NumberInput } from './NumberInput.jsx';
import { categorySelection, toggleCategory } from '../scripts/symbol-tools.mjs';
import { foreignNoticeable, foreignSample } from '../scripts/dota-rendering.mjs';
import { t, tn, translateMessage } from '../scripts/i18n.mjs';

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
        disabled={!Array.from(chars).length}
        onChange={(e) => onChange(toggleCategory(value, chars, e.target.checked))}
      />
      {t('Выбрать все символы')}
    </label>
  );
}
export function RecentSymbols({ symbols = [], onPick }) {
  return (
    <div className="recent-symbols" role="toolbar" aria-label={t('Последние символы')}>
      <span>{t('Недавние')}</span>
      {Array.from({ length: 8 }, (_, i) =>
        symbols[i] ? (
          <button
            key={i}
            title={t('Взять символ {symbol}', { symbol: symbols[i] })}
            aria-label={t('Взять символ {symbol}', { symbol: symbols[i] })}
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
// The «… категорий — высокая нагрузка» banner shows once per browser session, in the editor or the
// drawing window, whichever crosses 2000 first: it closes by its cross or by itself after 15 s and
// does not come back until the tab is opened anew. The optimizer and the download keep their own
// warnings, which stay.
const CATEGORY_WARNING_SEEN = 'gridstudio.categoryWarningSeen', CATEGORY_WARNING_MS = 15000;
const categoryWarningSeen = () => { try { return sessionStorage.getItem(CATEGORY_WARNING_SEEN) === '1'; } catch { return false; } };
export function CategoryWarning({ count, onOptimize }) {
  const over = count > 2000, [state, setState] = useState(() => (categoryWarningSeen() ? 'done' : 'waiting'));
  useEffect(() => {
    if (!over || state !== 'waiting') return;
    try { sessionStorage.setItem(CATEGORY_WARNING_SEEN, '1'); } catch { /* Shown again next time; harmless. */ }
    setState('open');
  }, [over, state]);
  useEffect(() => {
    if (state !== 'open') return;
    const timer = setTimeout(() => setState('done'), CATEGORY_WARNING_MS);
    return () => clearTimeout(timer);
  }, [state]);
  if (!over || state !== 'open') return null;
  return (
    <div className="category-warning" role="alert">
      <span aria-hidden="true">!</span>
      <div>
        <strong>{t('{count} — высокая нагрузка', { count: tn(count, ['категория', 'категории', 'категорий'], ['category', 'categories']) })}</strong>
        <p>{t('Больше 2000 категорий могут вызывать лаги и вылет Dota 2.')}</p>
      </div>
      {onOptimize && <button className="button secondary compact" onClick={onOptimize}>{t('Сократить категории')}</button>}
      <button type="button" className="category-warning-close" aria-label={t('Скрыть предупреждение')} onClick={() => setState('done')}>×</button>
    </div>
  );
}
// Characters missing from Dota's font (dota-rendering inDotaFont), when they are a noticeable part
// of the picture: the game draws them with a Windows font, so they look different there. Closed,
// it stays closed for these characters this session and comes back when others are added.
const FONT_WARNING_SEEN = 'gridstudio.fontWarningSeen';
export function FontWarning({ foreign, onSelect }) {
  const chars = (foreign?.chars || []).map(([char]) => char), key = chars.slice().sort().join('');
  const [closed, setClosed] = useState(() => { try { return sessionStorage.getItem(FONT_WARNING_SEEN) || ''; } catch { return ''; } });
  if (!foreign || !foreignNoticeable(foreign) || closed === key) return null;
  const close = () => { try { sessionStorage.setItem(FONT_WARNING_SEEN, key); } catch { /* Shown again after a reload; harmless. */ } setClosed(key); };
  return (
    <div className="category-warning font-warning" role="status">
      <span aria-hidden="true">Aa</span>
      <div>
        <strong>{t('{count} нет в шрифте Dota: {sample}', { count: tn(foreign.count, ['символа', 'символов', 'символов'], ['symbol is', 'symbols are']), sample: foreignSample(foreign) })}</strong>
        <p>{t('Игра рисует их шрифтом Windows — в Dota они выглядят иначе, чем здесь, и на разных компьютерах по-разному.')}</p>
      </div>
      {onSelect && <button className="button secondary compact" onClick={() => onSelect(chars)}>{t('Выделить')}</button>}
      <button type="button" className="category-warning-close" aria-label={t('Скрыть предупреждение')} onClick={close}>×</button>
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
      setError(translateMessage(error.message));
    }
  };
  return (
    <div className="canvas-dimensions-edit">
      <div className="canvas-dimension-inputs" role="group" aria-label={t('Размер холста')}>
        <label>
          <span>W</span>
          <NumberInput
            aria-label={t('Ширина холста')}
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
            aria-label={t('Высота холста')}
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
