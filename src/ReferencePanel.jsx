import { NumberInput } from './NumberInput.jsx';
import { useEffect, useId, useRef, useState } from 'react';
import { readReferenceImage } from '../scripts/reference-image.mjs';
import { referenceAngle } from '../scripts/edit-operations.mjs';
import { Icon } from './Icon.jsx';
import { t, translateMessage } from '../scripts/i18n.mjs';

// Shared by the main canvas and the separate drawing draft.
// onPreview(opacity | null): the opacity to draw while the slider moves, without a history step.
export function ReferencePanel({ value, onChange, onPreview, onEdit, editing = false, canvasSize }) {
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
      if (alive.current) setError(translateMessage(e.message));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  // Letting the slider go commits once, so one undo takes the whole drag back.
  function applyOpacity() {
    if (value && opacity !== Math.round(value.opacity * 100))
      onChange({ ...value, opacity: opacity / 100 });
    onPreview?.(null);
  }
  return (
    <section className="reference-panel" aria-label={t('Фон для обводки')}>
      <div className="section-heading">
        <span>{t('ФОН ДЛЯ ОБВОДКИ')}</span>
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
        {busy ? t('Загрузка…') : value ? t('Заменить фон') : t('Загрузить фон')}
      </button>
      {value && (
        <>
          <div className="reference-preview">
            <img src={value.src} alt="" />
            <span title={value.name}>{value.name}</span>
          </div>
          {onEdit && (
            <button className="button secondary full" aria-pressed={editing} onClick={onEdit}>
              {editing ? t('Фон выделен') : t('Переместить / растянуть')}
            </button>
          )}
          {editing && (
            <p className="hint">{t('Тяни картинку или маркеры рамки. Shift — сохранить пропорции. Круглый маркер сверху поворачивает, с Shift — по 15°.')}</p>
          )}
          {/* Turn and mirror it (asked for on 2026-10-05): steps here, any angle by the round handle or in «Положение фона». */}
          <div className="reference-turns" role="group" aria-label={t('Повернуть фон')}>
            {[[-90, '↺ 90°'], [-45, '↺ 45°'], [45, '↻ 45°'], [90, '↻ 90°'], [180, '180°']].map(([step, label]) => (
              <button key={step} type="button" className="button secondary compact" onClick={() => onChange({ ...value, rotate: referenceAngle((value.rotate || 0) + step) })}>{label}</button>
            ))}
          </div>
          <div className="reference-turns is-mirror" role="group" aria-label={t('Отразить фон')}>
            <button type="button" className="button secondary compact" aria-pressed={!!value.flipX} onClick={() => onChange({ ...value, flipX: !value.flipX })}><Icon name="flip" size={15}/>{t('По горизонтали')}</button>
            <button type="button" className="button secondary compact" aria-pressed={!!value.flipY} onClick={() => onChange({ ...value, flipY: !value.flipY })}><Icon name="flipVertical" size={15}/>{t('По вертикали')}</button>
          </div>
          <label className="range-label" htmlFor={id}>
            {t('Непрозрачность')} <output>{opacity}%</output>
          </label>
          <input
            id={id}
            aria-label={t('Непрозрачность фона')}
            type="range"
            min="0"
            max="100"
            step="1"
            value={opacity}
            onChange={(e) => {
              setOpacity(Number(e.target.value));
              onPreview?.(Number(e.target.value) / 100);
            }}
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
              {t('Показывать')}
            </label>
            <button className="button ghost compact" onClick={() => onChange(null)}>
              {t('Убрать фон')}
            </button>
          </div>
          <details>
            <summary>{t('Положение фона')}</summary>
            <div className="reference-fields">
              {[
                ['x', 'X'],
                ['y', 'Y'],
                ['w', t('Ширина')],
                ['h', t('Высота')]
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <NumberInput
                    aria-label={t('{label} фона', { label })}
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
              <label>
                {t('Угол')}
                <NumberInput
                  aria-label={t('Угол поворота фона')}
                  type="number"
                  key={`rotate-${value.rotate || 0}`}
                  defaultValue={Math.round((value.rotate || 0) * 10) / 10}
                  min="-180"
                  max="180"
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (e.target.value !== '' && Number.isFinite(n) && referenceAngle(n) !== (value.rotate || 0)) onChange({ ...value, rotate: referenceAngle(n) });
                  }}
                />
              </label>
            </div>
          </details>
        </>
      )}
      <p className="hint">{t('Только для обводки. Сохраняется в проекте, в Dota JSON не входит.')}</p>
      {error && (
        <p role="alert" className="drawing-error">
          {error}
        </p>
      )}
    </section>
  );
}
