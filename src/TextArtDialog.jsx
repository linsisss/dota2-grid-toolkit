import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import C from '../scripts/core.mjs';
import { TEXT_ART_LIMITS, TEXT_ART_STYLES, loadTextArtFonts, placeTextArt, renderTextArt, textArtCategories } from '../scripts/text-art.mjs';
import { drawCategoryLabel, glyphWidths, measureCategoryInk } from '../scripts/dota-rendering.mjs';
import { t, tn, translateMessage } from '../scripts/i18n.mjs';

// «Текст в ASCII» (scripts/text-art.mjs): the text in every lettering at once, each drawn as it will
// stand on the canvas — glyph by glyph, in Dota's font; a click picks one. The footer counts the
// categories the download makes of it (glyphs joined into rows where they can be).
const canvasFactory = (width, height) => Object.assign(document.createElement('canvas'), { width, height });
const inks = new Map();
let measuring = null;
function ink(char) {
  measuring ||= canvasFactory(8, 8).getContext('2d');
  if (!inks.has(char)) inks.set(char, measureCategoryInk(measuring, char));
  return inks.get(char);
}
const STYLE_KEY = 'gridstudio.textArtStyle';
const savedStyle = () => { try { return localStorage.getItem(STYLE_KEY) || 'dots-bold'; } catch { return 'dots-bold'; } };

function ArtCanvas({ art, color = '#d6c8f7', max = 2 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current, host = canvas.parentElement;
    const paint = () => {
      const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
      const dpr = Math.min(devicePixelRatio || 1, 2), ctx = canvas.getContext('2d');
      Object.assign(canvas, { width: Math.round(w * dpr), height: Math.round(h * dpr) });
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!art) return;
      const size = { w: art.w, h: art.h }, pad = 12, scale = Math.min((w - pad * 2) / size.w, (h - pad * 2) / size.h, max);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (w - size.w * scale) / 2, dpr * (h - size.h * scale) / 2);
      for (const glyph of placeTextArt(art, size, ink)) drawCategoryLabel(ctx, glyph.text, glyph.x, glyph.y, color);
    };
    paint();
    const observer = new ResizeObserver(paint); observer.observe(host);
    // Radiance is a web font: paint again once it is in.
    document.fonts.load('600 16px StudioRadiance', '|/_').then(paint).catch(() => {});
    return () => observer.disconnect();
  }, [art, color, max]);
  return <canvas ref={ref} aria-hidden="true"/>;
}

function TextArtDialog({ editor, canvas, close }) {
  const ref = useRef(null), [text, setText] = useState(''), [style, setStyle] = useState(savedStyle), [ready, setReady] = useState(false);
  useEffect(() => {
    const trigger = document.activeElement;
    ref.current.showModal();
    loadTextArtFonts().then(() => setReady(true)).catch(() => setReady(true));
    return () => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  // Every style at once; an empty field shows a sample so the styles can be compared before typing.
  // The dot styles take a few dozen milliseconds each, so they are drawn once typing pauses.
  const [typed, setTyped] = useState('');
  useEffect(() => { const timer = setTimeout(() => setTyped(text), text ? 220 : 0); return () => clearTimeout(timer); }, [text]);
  const sample = typed.trim() ? typed : 'GG WP';
  // Size in canvas pixels: the width or the height the user typed (the other follows), for the dot styles
  // and «Пиксели»; FIGlet styles keep their font's size. Empty — the style's own size.
  const [target, setTarget] = useState(null);
  const arts = useMemo(() => (ready ? Object.fromEntries(TEXT_ART_STYLES.map((s) => [s.id, renderTextArt(sample, s, { canvas: canvasFactory })])) : {}), [ready, sample]);
  // Styles that can write the text come first; when the chosen one cannot, the first that can stands in
  // (the choice itself is kept for the next text).
  const ordered = ready ? [...TEXT_ART_STYLES.filter((s) => arts[s.id]), ...TEXT_ART_STYLES.filter((s) => !arts[s.id])] : TEXT_ART_STYLES;
  const shown = arts[style] ? style : ordered.find((s) => arts[s.id])?.id;
  const base = typed.trim() && shown ? arts[shown] : null, sizedStyle = TEXT_ART_STYLES.find((s) => s.id === shown)?.sized;
  const art = useMemo(() => {
    if (!base || !target || !sizedStyle) return base;
    const s = TEXT_ART_STYLES.find((x) => x.id === shown), want = (r) => (target.w ? target.w / r.w : target.h / r.h);
    // Two passes: the size does not grow quite in proportion (padding, rounding to pixels).
    const first = renderTextArt(typed, s, { canvas: canvasFactory, scale: want(base) });
    return first && renderTextArt(typed, s, { canvas: canvasFactory, scale: want(base) * want(first) }) || first;
  }, [base, target, shown, typed]);
  const categories = useMemo(() => {
    if (!art) return 0;
    measuring ||= canvasFactory(8, 8).getContext('2d');
    return textArtCategories(placeTextArt(art, canvas, ink), C.pickSafeCategories, (line) => glyphWidths(measuring, line));
  }, [art, canvas.w, canvas.h]);
  const pick = (id) => { setStyle(id); try { localStorage.setItem(STYLE_KEY, id); } catch { /* Remembered for this window only. */ } };
  return (
    <dialog ref={ref} className="art-dialog text-art-dialog" aria-labelledby="textArtTitle" onCancel={close}>
      <header className="art-dialog-heading">
        <div><h2 id="textArtTitle">{t('Текст в ASCII')}</h2><span>{t('Надпись из символов и точек — как её покажет Dota')}</span></div>
        <button className="icon-button" aria-label={t('Закрыть')} onClick={close}>×</button>
      </header>
      <div className="text-art-body">
        <textarea className="text-art-input" rows={2} maxLength={TEXT_ART_LIMITS.text} value={text} autoFocus placeholder={t('Напиши текст, например: GG WP')} aria-label={t('Текст')} onChange={(e) => setText(e.target.value)}/>
        <div className="text-art-size" role="group" aria-label={t('Размер надписи')}>
          <span>{t('Размер')}</span>
          <label>{t('Ш')}<input type="number" min={20} max={2400} disabled={!art || !sizedStyle} value={art ? (target?.w ?? Math.round(art.w)) : ''}
            onChange={(e) => setTarget(e.target.value ? { w: Math.min(2400, Math.max(20, +e.target.value)) } : null)}/></label>
          <span aria-hidden="true">×</span>
          <label>{t('В')}<input type="number" min={10} max={1200} disabled={!art || !sizedStyle} value={art ? (target?.h ?? Math.round(art.h)) : ''}
            onChange={(e) => setTarget(e.target.value ? { h: Math.min(1200, Math.max(10, +e.target.value)) } : null)}/></label>
          <span>px</span>
          {target && sizedStyle && <button type="button" className="button secondary compact" onClick={() => setTarget(null)}>{t('Как у стиля')}</button>}
          {art && !sizedStyle && <em>{t('У буквенных стилей размер задаёт сам шрифт')}</em>}
        </div>
        <div className="text-art-large">{art ? <ArtCanvas art={art} max={2.4}/> : <p>{!ready ? t('Загружаем шрифты…') : text.trim() ? t('Ни один стиль не умеет написать такие символы.') : t('Напиши текст — ниже он сразу появится во всех стилях.')}</p>}</div>
        <div className="text-art-styles" role="listbox" aria-label={t('Стиль букв')}>
          {ordered.map((s) => {
            const sampleArt = arts[s.id];
            return <button key={s.id} role="option" aria-selected={shown === s.id} disabled={ready && !sampleArt} onClick={() => pick(s.id)}
              title={ready && !sampleArt ? t('В этом стиле нет некоторых символов текста (кириллицы, цифр)') : translateMessage(s.name)}>
              <span className="text-art-thumb">{sampleArt && <ArtCanvas art={sampleArt} max={1}/>}</span>
              <span>{translateMessage(s.name)}{ready && !sampleArt ? ` · ${t('не пишет')}` : ''}</span>
            </button>;
          })}
        </div>
      </div>
      <footer className="art-dialog-footer">
        <div>
          {art ? <span>{t('{w} × {h} px · {categories} в Dota', { w: Math.round(art.w), h: Math.round(art.h), categories: tn(categories, ['категория', 'категории', 'категорий'], ['category', 'categories']) })}</span> : <span>{t('Кириллицу пишут точечные стили, «Пиксели», Banner и Graceful.')}</span>}
          {art && (art.w > canvas.w || art.h > canvas.h) && <p className="canvas-size-note">{t('Надпись больше холста. После вставки можно увеличить холст или уменьшить надпись.')}</p>}
        </div>
        <button className="button secondary" onClick={close}>{t('Отмена')}</button>
        <button className="button primary" disabled={!art} onClick={() => { if (editor.addTextArt(art, text.trim().replace(/\s+/g, ' ').slice(0, 40))) close(); }}>{t('Добавить на холст')}</button>
      </footer>
    </dialog>
  );
}

export function TextArtButton({ editor, canvas }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="image-upload text-upload" onClick={() => setOpen(true)}>
      <Icon name="text" size={18}/>
      <strong>{t('Текст в ASCII')}</strong>
      <span>{t('Надпись из символов и точек')}</span>
    </button>
    {open && <TextArtDialog editor={editor} canvas={canvas} close={() => setOpen(false)}/>}
  </>;
}
