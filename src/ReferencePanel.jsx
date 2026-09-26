import { NumberInput } from './NumberInput.jsx';
import { useEffect, useId, useRef, useState } from 'react';
import { readReferenceImage } from '../scripts/reference-image.mjs';

// Shared by the main canvas and the separate drawing draft.
export function ReferencePanel({ value, onChange, onEdit, editing = false, canvasSize }) {
  const input = useRef(null),
    id = useId();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [opacity, setOpacity] = useState(10);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => setOpacity(Math.round((value?.opacity ?? 0.1) * 100)), [value?.opacity]);
  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const image = await readReferenceImage(file, canvasSize);
      if (alive.current) onChange(image);
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function applyOpacity() {
    if (value && opacity !== Math.round(value.opacity * 100))
      onChange({ ...value, opacity: opacity / 100 });
  }
  return (
    <section className="reference-panel" aria-label="Фон для обводки">
      <div className="section-heading">
        <span>ФОН ДЛЯ ОБВОДКИ</span>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
        hidden
        onChange={(e) => {
          upload(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        className="button secondary full"
        disabled={busy}
        onClick={() => input.current.click()}
      >
        {busy ? 'Загрузка…' : value ? 'Заменить фон' : 'Загрузить фон'}
      </button>
      {value && (
        <>
          <div className="reference-preview">
            <img src={value.src} alt="" />
            <span title={value.name}>{value.name}</span>
          </div>
          {onEdit && (
            <button className="button secondary full" aria-pressed={editing} onClick={onEdit}>
              {editing ? 'Фон выделен' : 'Переместить / растянуть'}
            </button>
          )}
          {editing && (
            <p className="hint">Тяни картинку или маркеры рамки. Shift — сохранить пропорции.</p>
          )}
          <label className="range-label" htmlFor={id}>
            Непрозрачность <output>{opacity}%</output>
          </label>
          <input
            id={id}
            aria-label="Непрозрачность фона"
            type="range"
            min="0"
            max="100"
            step="1"
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            onPointerUp={applyOpacity}
            onKeyUp={applyOpacity}
            onBlur={applyOpacity}
          />
          <div className="reference-actions">
            <label className="check-row">
              <input
                type="checkbox"
                checked={value.visible}
                onChange={(e) => onChange({ ...value, visible: e.target.checked })}
              />
              Показывать
            </label>
            <button className="button ghost compact" onClick={() => onChange(null)}>
              Убрать фон
            </button>
          </div>
          <details>
            <summary>Положение фона</summary>
            <div className="reference-fields">
              {[
                ['x', 'X'],
                ['y', 'Y'],
                ['w', 'Ширина'],
                ['h', 'Высота']
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <NumberInput
                    aria-label={`${label} фона`}
                    type="number"
                    key={`${key}-${value[key]}`}
                    defaultValue={Math.round(value[key])}
                    min={key === 'w' || key === 'h' ? 1 : 0}
                    max="10000"
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (
                        e.target.value &&
                        Number.isFinite(n) &&
                        n >= 0 &&
                        n <= 10000 &&
                        (!['w', 'h'].includes(key) || n > 0) &&
                        n !== value[key]
                      )
                        onChange({ ...value, [key]: n });
                    }}
                  />
                </label>
              ))}
            </div>
          </details>
        </>
      )}
      <p className="hint">Только для обводки. Сохраняется в проекте, в Dota JSON не входит.</p>
      {error && (
        <p role="alert" className="drawing-error">
          {error}
        </p>
      )}
    </section>
  );
}
