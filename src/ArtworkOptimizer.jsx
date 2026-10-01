import { useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from 'react';
import C from '../scripts/core.mjs';
import { planOptimization, optimizeCategories } from '../scripts/category-optimization.mjs';
import { packPlan } from '../scripts/dot-packing.mjs';
import { drawCategoryLabel, glyphWidths, measureCategoryWidth } from '../scripts/dota-rendering.mjs';
import { NumberInput } from './NumberInput.jsx';
import { Icon } from './Icon.jsx';
import { t, locale } from '../scripts/i18n.mjs';

function ArtPreview({ doc, label }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const canvas = ref.current, size = C.canvasSize(doc), ctx = canvas.getContext('2d');
    const scale = Math.min(1193 / size.w, 593 / size.h);
    canvas.width = Math.max(1, Math.round(size.w * scale)); canvas.height = Math.max(1, Math.round(size.h * scale));
    ctx.setTransform(canvas.width / size.w, 0, 0, canvas.height / size.h, 0, 0);
    ctx.fillStyle = '#191821'; ctx.fillRect(0, 0, size.w, size.h);
    for (const layer of doc.layers) {
      if (!layer.visible) continue;
      for (const item of doc.entities) {
        if (item.layer !== layer.id) continue;
        if (item.type === 'heroes') {
          ctx.strokeStyle = '#383340'; ctx.strokeRect(item.x, item.y, item.w, C.visualHeight(item));
          drawCategoryLabel(ctx, item.name, item.x, item.y);
        } else for (const glyph of C.textGlyphs(item)) drawCategoryLabel(ctx, glyph.text, glyph.x, glyph.y);
      }
    }
  }, [doc]);
  return <figure><figcaption>{label}</figcaption><canvas ref={ref} role="img" aria-label={label} /></figure>;
}

export function ArtworkOptimizer({ editor, source, onClose }) {
  const dialog = useRef(null);
  const measure = useMemo(() => {
    const ctx = document.createElement('canvas').getContext('2d'), cache = new Map();
    return (text) => {
      if (!cache.has(text)) cache.set(text, measureCategoryWidth(ctx, text));
      return cache.get(text);
    };
  }, []);
  // Counts as the download makes them (core.mjs pickSafeCategories).
  const count = useMemo(() => {
    const ctx = document.createElement('canvas').getContext('2d'), widths = (line) => glyphWidths(ctx, line);
    return (entries) => C.pickSafeCategories(entries.map((entry) => entry.category), widths).length;
  }, []);
  const canPack = useMemo(() => packPlan(source, measure).rows.some((row) => row.members.length > 1), [source, measure]);
  const [pack, setPack] = useState(false);
  const packed = pack && canPack;
  const plan = useMemo(() => planOptimization(source, measure, { pack: packed, count }), [packed, source, measure, count]);
  const initialTarget = (p) => Math.max(p.minimum, Math.min(2000, Math.round(p.losslessCount * 0.75)));
  const [reduce, setReduce] = useState(false);
  const [target, setTarget] = useState(() => initialTarget(plan));
  const [targetText, setTargetText] = useState(String(target));
  const [targetPlan, setTargetPlan] = useState(plan);
  // Packing changes what the budget counts; start again from its default.
  if (targetPlan !== plan) {
    const next = initialTarget(plan);
    setTargetPlan(plan); setTarget(next); setTargetText(String(next));
  }
  const budget = reduce ? target : plan.losslessCount;
  const deferredBudget = useDeferredValue(budget), pending = deferredBudget !== budget;
  const result = useMemo(() => optimizeCategories(plan, deferredBudget), [plan, deferredBudget]);
  const canReduce = plan.minimum < plan.losslessCount;
  const setBudget = (value) => {
    const next = Math.max(plan.minimum, Math.min(plan.losslessCount, Math.round(value)));
    setTarget(next); setTargetText(String(next));
  };
  useLayoutEffect(() => {
    const trigger = document.activeElement, node = dialog.current;
    node.showModal();
    return () => { node.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  return <dialog className="artwork-optimizer" ref={dialog} aria-labelledby="optimizeTitle"
    onCancel={(e) => { e.preventDefault(); onClose(); }}>
    <header className="modal-header"><h2 id="optimizeTitle">{t('Оптимизация категорий')}</h2>
      <button className="icon-button" aria-label={t('Закрыть оптимизацию')} onClick={onClose}><Icon name="close" /></button></header>
    <div className="optimizer-body">
      <p>{t('При скачивании символы одной линии и так объединяются в строки — со сдвигом меньше полпикселя экрана, в игре это не видно. Если категорий всё ещё много, упакуй точки или сократи детали.')}</p>
      <div className="optimizer-stats" role="status" aria-live="polite">
        <span>{t('На холсте')}<strong>{plan.rawCount.toLocaleString(locale)}</strong></span>
        <span>{packed ? t('После упаковки') : t('После объединения')}<strong>{plan.losslessCount.toLocaleString(locale)}</strong></span>
        <span>{t('В итоговом JSON')}<strong>{result.count.toLocaleString(locale)}</strong></span>
      </div>
      <label className="check-row optimizer-reduce"><input type="checkbox" checked={packed} disabled={!canPack}
        onChange={(e) => setPack(e.target.checked)} />{t('Упаковать точки в строки')}</label>
      <p className="hint">{canPack
        ? t('Отдельные символы почти на одной высоте становятся одной строкой-категорией. Каждый сдвигается не больше чем на 1,5 px, на глаз не видно. На точечных артах категорий в 2–3 раза меньше.')
        : t('Упаковывать нечего: нет отдельных символов, стоящих рядом на одной высоте.')}</p>
      <label className="check-row optimizer-reduce"><input type="checkbox" checked={reduce} disabled={!canReduce}
        onChange={(e) => setReduce(e.target.checked)} />{t('Сократить детали рисунка')}</label>
      <p className="hint">{t('Строка — это одна категория, поэтому убираются строки целиком, начиная с самых незаметных: сначала символы друг на друге и вплотную, потом плотные заливки теряют каждую вторую строку, а линии — каждую вторую точку, равномерно, без дыр. Редкие символы (глаза, блики) держатся дольше. Герои, текст и заблокированные слои не трогаются.')}</p>
      {reduce && <div className="optimizer-budget">
        <label htmlFor="optimizeBudget">{t('Целевое число категорий')}</label>
        <NumberInput id="optimizeBudget" aria-label={t('Целевое число категорий')} min={plan.minimum} max={plan.losslessCount} step="1"
          value={targetText} onChange={(e) => {
            setTargetText(e.target.value);
            if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber))
              setTarget(Math.max(plan.minimum, Math.min(plan.losslessCount, e.target.valueAsNumber)));
          }} onStep={(value) => setBudget(Number(value))}
          onBlur={() => setBudget(Number(targetText) || target)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <input id="optimizeRange" type="range" aria-label={t('Бюджет категорий')} min={plan.minimum} max={plan.losslessCount} step="1"
          value={target} onChange={(e) => setBudget(Number(e.target.value))} />
      </div>}
      {!canReduce && <p className="hint">{t('Отдельных символов для сокращения нет. При скачивании символы одной линии всё равно объединятся в строки.')}</p>}
      {reduce && plan.minimum > 2000 && <p className="export-warning">{t('Защищённые объекты и слои не позволяют уменьшить эту сетку до 2000 категорий.')}</p>}
      <div className="optimizer-comparison">
        <ArtPreview doc={source} label={t('Исходный рисунок')} />
        <ArtPreview doc={result.doc} label={pending ? t('Пересчитываем…') : t('Результат')} />
      </div>
      <p role="status">{[
        packed && result.packed && t('В строки упаковано символов: {count}, каждый сдвинут не больше чем на 1,5 px.', { count: result.packed.toLocaleString(locale) }),
        result.removed ? `${t('Будет убрано символов: {count}.', { count: result.removed.toLocaleString(locale) })}${packed ? '' : ` ${t('Оставшиеся не перемещаются.')}`}` : !packed && t('Все символы и их расположение сохраняются.')
      ].filter(Boolean).join(' ')}</p>
      {result.count > 2000 && <p className="export-warning">{t('Больше 2000 категорий: возможны лаги и вылет Dota 2.')}</p>}
      <p className="hint">{t('Сравни детали перед применением. Герои в этом превью показаны рамками. Оптимизируется выбранная сетка; остальные сохранятся в файле.')}</p>
    </div>
    <footer className="modal-footer"><button className="button secondary" onClick={onClose}>{t('Отмена')}</button>
      <button className="button secondary" disabled={!(result.removed || result.packed) || pending} onClick={() => { if (editor.optimizeArt(result.budget, packed)) onClose(); }}>{t('Применить к холсту')}</button>
      <button className="button primary" disabled={pending} onClick={() => { if (editor.downloadOptimized(reduce ? result.budget : null, packed)) onClose(); }}>{t('Скачать JSON')}</button></footer>
  </dialog>;
}
