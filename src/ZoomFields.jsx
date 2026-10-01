import { useEffect, useRef, useState } from 'react';
import { MIN_ZOOM, MAX_ZOOM, sliderToZoom, zoomToSlider } from '../scripts/zoom.mjs';
import { t } from '../scripts/i18n.mjs';
const formatPercent = (zoom) => String(Math.round(zoom * 1000) / 10);

export function ZoomFields({ zoom, onChange }) {
  const [value, setValue] = useState(formatPercent(zoom));
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setValue(formatPercent(zoom)); }, [zoom]);
  const apply = () => {
    editing.current = false;
    const parsed = Number(value.replace(',', '.'));
    const next = value.trim() && Number.isFinite(parsed)
      ? Math.min(MAX_ZOOM * 100, Math.max(MIN_ZOOM * 100, parsed)) : zoom * 100;
    setValue(String(Math.round(next * 10) / 10));
    onChange(next / 100);
  };
  return <>
    <input className="zoom-slider" type="range" min="0" max="1000" step="1"
      aria-label={t('Масштаб холста')} aria-valuetext={t('{value} процентов', { value: Math.round(zoom * 100) })}
      value={zoomToSlider(zoom)} onChange={(e) => onChange(sliderToZoom(Number(e.target.value)))} />
    <label className="zoom-percent" data-tooltip={t('Точный масштаб: от 1 до 800%')}>
      <input id="zoomValue" type="text" inputMode="decimal" aria-label={t('Масштаб в процентах')}
        value={value} onFocus={() => { editing.current = true; }}
        onChange={(e) => setValue(e.target.value)} onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            e.stopPropagation(); editing.current = false;
            setValue(formatPercent(zoom));
          }
        }} />
      <span>%</span>
    </label>
  </>;
}
