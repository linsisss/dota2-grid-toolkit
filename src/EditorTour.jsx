import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Icon } from './Icon.jsx';

// The editor's welcome and first-steps tour, like Figma's: a spotlight on one part of the editor
// and a card that says what it is for. Shown once per browser (TOUR_KEY), again from «Помощь»
// (the «Обучение» button dispatches TOUR_EVENT). A step whose target is not on screen (a hidden
// panel, a narrow window) is skipped.
const TOUR_KEY = 'gridstudio.tour.v1';
export const TOUR_EVENT = 'gridstudio:tour';
const STEPS = [
  { target: '.mode-tabs', title: 'Три режима', text: '«Сетка» — герои и подписи. «Рисование» — кисть из символов, рамки и отражение. «ASCII-арты» — рисунок из картинки или текста и готовые арты.' },
  { target: '.tool-dock', title: 'Инструменты', text: '«Герои» добавляет новую группу. Дальше выделение (V), перемещение холста, лассо (L), кисть (B), текст (T), пипетка (I), фигура (R) и ластик (E). Внизу — «Скрыть подписи».' },
  { target: '#canvasViewport', title: 'Холст — это сетка в Dota', text: '1193 × 593, как на странице «Герои». Колесо листает, Ctrl + колесо меняет масштаб, пробел + перетаскивание двигает холст. Двойной клик по тексту — изменить его.' },
  { target: '#propertiesPanel', title: 'Свойства', text: 'Без выделения — настройки холста. С выделением — позиция, размер, поворот и выравнивание объекта. F прячет и показывает панель.' },
  { target: '.layers-panel', title: 'Слои и объекты', text: 'Всё, что есть на холсте: можно скрыть, закрепить, переименовать и поменять порядок. Ctrl + G объединяет выделенное в группу.' },
  { target: '#gridFilePanel', title: 'Сетки в файле', text: 'В одном файле может быть несколько сеток, как в Dota. «+» — новая, «Добавить из файла» — взять сетки из другого JSON.' },
  { target: '.canvas-controls', title: 'Категории и оптимизация', text: 'Каждая подпись и каждый символ — отдельная категория Dota. Больше 2 000 — возможны лаги; «Оптимизация» сокращает их без потери вида. Тут же сетка, привязка и масштаб.' },
  { target: '#previewButton', title: 'Превью как в игре', text: 'Показывает сетку на фоне Dota, как на странице «Герои». Фон превью можно сменить — в том числе на свой фон главного меню.' },
  { target: '#exportButton', title: 'Скачать для Dota', text: 'Готовый hero_grid_config.json и пошаговая инструкция, куда его положить. Оттуда же — публикация в мастерскую.' },
  { target: '#helpButton', title: 'Помощь', text: 'Горячие клавиши, версии проекта и это обучение — если захочешь пройти его ещё раз.' }
];
const PAD = 8, GAP = 14, CARD = 340;

function seen() { try { return localStorage.getItem(TOUR_KEY) === 'done'; } catch { return true; } }
function remember() { try { localStorage.setItem(TOUR_KEY, 'done'); } catch { /* Shown again next time. */ } }
function visible(selector) {
  const node = document.querySelector(selector);
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return rect.width > 4 && rect.height > 4 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth ? rect : null;
}
// The card goes where it fits: below, above, right or left of the spotlight, kept on screen.
function place(rect) {
  const width = Math.min(CARD, innerWidth - 24), height = 190;
  const clampX = (x) => Math.max(12, Math.min(innerWidth - width - 12, x)), clampY = (y) => Math.max(12, Math.min(innerHeight - height - 12, y));
  if (rect.bottom + GAP + height < innerHeight) return { left: clampX(rect.left), top: rect.bottom + PAD + GAP, width };
  if (rect.top - GAP - height > 0) return { left: clampX(rect.left), top: rect.top - PAD - GAP - height, width };
  if (rect.right + GAP + width < innerWidth) return { left: rect.right + PAD + GAP, top: clampY(rect.top), width };
  return { left: Math.max(12, rect.left - PAD - GAP - width), top: clampY(rect.top), width };
}

export default function EditorTour() {
  // welcome → the first card; step → an index in STEPS; null → nothing on screen.
  const [phase, setPhase] = useState(null), [step, setStep] = useState(0), [rect, setRect] = useState(null);
  const steps = STEPS.filter((item) => phase !== 'tour' || visible(item.target));
  const close = useCallback(() => { remember(); setPhase(null); }, []);
  // The first visit: once the editor is idle (no dialog open), after a moment.
  useEffect(() => {
    const start = () => { setStep(0); setPhase('welcome'); };
    const again = () => { setStep(0); setPhase('tour'); };
    window.addEventListener(TOUR_EVENT, again);
    let timer = 0;
    if (!seen()) {
      const wait = () => { timer = setTimeout(() => document.querySelector('dialog[open]') ? wait() : start(), 900); };
      wait();
    }
    return () => { clearTimeout(timer); window.removeEventListener(TOUR_EVENT, again); };
  }, []);
  const current = phase === 'tour' ? steps[step] : null;
  useLayoutEffect(() => {
    if (!current) return setRect(null);
    const measure = () => setRect(visible(current.target));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [current?.target, phase]);
  useEffect(() => {
    if (!phase) return;
    const keys = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (phase === 'tour' && event.key === 'ArrowRight') setStep((value) => Math.min(value + 1, steps.length - 1));
      if (phase === 'tour' && event.key === 'ArrowLeft') setStep((value) => Math.max(value - 1, 0));
    };
    document.addEventListener('keydown', keys, true);
    return () => document.removeEventListener('keydown', keys, true);
  }, [phase, steps.length, close]);
  if (!phase) return null;
  if (phase === 'welcome') return <div className="tour-backdrop" role="dialog" aria-modal="true" aria-labelledby="tourWelcome">
    <div className="tour-welcome">
      <svg className="tour-logo" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m5 4 23 24M5 18v10h10M18 4h10v10"/></svg>
      <h2 id="tourWelcome">Добро пожаловать в редактор</h2>
      <p>Здесь собираются сетки героев Dota 2: группы героев, подписи, символы и рисунки из картинок. Короткое знакомство покажет, где что, — это меньше минуты.</p>
      <div className="tour-actions"><button type="button" className="button secondary" onClick={close}>Разберусь сам</button>
        <button type="button" className="button primary" autoFocus onClick={() => { setStep(0); setPhase('tour'); }}>Показать, где что<Icon name="arrow" size={18}/></button></div>
      <p className="tour-note">Обучение всегда можно открыть снова в «Помощи» (?).</p>
    </div>
  </div>;
  if (!current || !rect) return null;
  const card = place(rect), last = step === steps.length - 1;
  return <div className="tour-layer" role="dialog" aria-modal="true" aria-labelledby="tourTitle">
    <div className="tour-spotlight" style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}/>
    <section className="tour-card" key={step} style={card}>
      <header><span className="tour-count">{step + 1} / {steps.length}</span><button type="button" className="tour-skip" onClick={close}>Пропустить</button></header>
      <h3 id="tourTitle">{current.title}</h3>
      <p>{current.text}</p>
      <footer>
        <span className="tour-dots" aria-hidden="true">{steps.map((_, index) => <i key={index} className={index === step ? 'is-on' : ''}/>)}</span>
        {step > 0 && <button type="button" className="button secondary" onClick={() => setStep(step - 1)}>Назад</button>}
        <button type="button" className="button primary" autoFocus onClick={() => last ? close() : setStep(step + 1)}>{last ? 'Готово' : 'Далее'}</button>
      </footer>
    </section>
  </div>;
}
