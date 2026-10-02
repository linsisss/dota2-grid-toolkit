import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { t } from '../scripts/i18n.mjs';
import { COMMUNITY } from '../scripts/community.mjs';

// The editor's welcome, tour and last card, like Figma's: a spotlight glides over one part of the
// editor at a time with a card beside it that says what it is for, and the last card offers a start.
// Shown once per browser (TOUR_KEY), again from «Помощь» → «Обучение» (TOUR_EVENT). A step inside a
// hidden panel opens the panel for its turn and closes it after (REVEAL); a step whose part is not on
// screen (a narrow window) is left out. Titles and texts are Russian keys shown through t(), checked
// against the editor on 02.10.2026 — change them with the editor. While it is open the editor gets
// no keys (← → step, Esc closes, Tab stays in the card).
const TOUR_KEY = 'gridstudio.tour.v1';
export const TOUR_EVENT = 'gridstudio:tour';
const STEPS = [
  { target: '.mode-tabs', icon: 'grid', title: 'Три режима',
    text: '«Сетка» — группы героев и подписи. «Рисование» — кисть из символов, рамки и отражение. «ASCII-арты» — рисунок из картинки или текста и готовые арты. Нажми на режим — откроется его панель.' },
  { target: '.project-templates', reveal: 'library', side: 'right', icon: 'template', title: 'Шаблоны',
    text: 'Готовая сетка в один клик. «По мете» соберёт сильных героев каждой позиции по статистике STRATZ — с пикрейтом и винрейтом под портретами. Ранги и число героев выбираешь сам.' },
  { target: '.tool-dock', side: 'right', icon: 'cursor', title: 'Инструменты',
    text: '«Герои» спросит, какую группу добавить: обычную или по мете для одной позиции. Дальше — выделение, холст, лассо, кисть, текст, пипетка, фигура и ластик.',
    keys: ['V', 'Space', 'L', 'B', 'T', 'I', 'R', 'E'] },
  { target: '#canvasViewport', icon: 'fit', title: 'Холст — это сетка в Dota',
    text: 'По умолчанию 1193 × 593, как страница «Герои» в игре. Холст двигается куда угодно: колесом, пробелом + перетаскиванием или за пустое место вокруг; Ctrl + колесо меняет масштаб. Двойной клик по объекту — сразу к его названию или тексту.' },
  { target: '.canvas-controls', side: 'top', icon: 'gauge', title: 'Категории и оптимизация',
    text: 'Каждая группа, подпись и строка рисунка — категория Dota. Больше 2 000 — возможны лаги и вылет игры; «Оптимизация» сократит их и покажет до и после. Справа — сетка, привязка и масштаб.' },
  { target: '#propertiesPanel', reveal: 'settings', side: 'left', icon: 'sliders', title: 'Свойства',
    text: 'Без выделения — настройки холста. У объекта — позиция, размер, поворот и выравнивание, у группы героев ещё «Упорядочить по мете». Панель прячется кнопкой «Настройки».',
    keys: ['F'] },
  { target: '.layers-panel', reveal: 'settings', side: 'left', icon: 'layers', title: 'Слои и объекты',
    text: 'Всё, что есть на холсте, по слоям. Клик выделяет объект; слой можно скрыть, заблокировать или удалить — скрытый слой не попадает в файл.',
    keys: ['Ctrl + G'] },
  { target: '#previewButton', icon: 'eye', title: 'Превью как в игре',
    text: 'Сетка на фоне Dota, как на странице «Герои». Фон превью меняется: как в игре, градиент или твой фон главного меню.',
    keys: ['P'] },
  { target: '#gridFilePanel', icon: 'files', title: 'Сетки в файле',
    text: 'В одном файле может быть несколько сеток, как в Dota. «+» — новая, «Добавить из файла» — сетки из другого JSON.' },
  { target: '#saveState', icon: 'history', title: 'Автосохранение',
    text: 'Правки сохраняются сами — в браузере, а после входа и в аккаунте. Нажми, чтобы открыть версии проекта: прошлую можно скачать или восстановить.' },
  { target: '.editor-language', icon: 'languages', title: 'Русский или английский',
    text: 'Язык сайта переключается сразу, без перезагрузки: сетка, масштаб и история правок остаются.' },
  { target: '#helpButton', icon: 'help', title: 'Помощь',
    text: 'Горячие клавиши, версии проекта и это обучение — если захочешь пройти его ещё раз.',
    keys: ['?'] },
  { target: '#exportButton', icon: 'export', title: 'Экспорт в Dota',
    text: 'Скачай hero_grid_config.json с инструкцией и видео — или скопируй команду для PowerShell: она сама положит сетку в папку твоего аккаунта Steam. Отсюда же — публикация в мастерскую.' }
];
const isOn = (name) => document.body.classList.contains(name);
// Panels a step opens for its turn: [can it be opened here, open it → put it back (or nothing)].
// `owned`: the tour opened it before the editor was rebuilt (a language switch), so it closes it.
const REVEAL = {
  // The mode panel with the templates: «Сетка» opens it (StudioControls), its «Закрыть» closes it;
  // open on another mode, it gets «Сетка» and then that mode back.
  library: [() => visible('#tab-heroes'), (owned) => {
    const tab = document.getElementById('tab-heroes');
    const close = () => { if (isOn('show-library')) document.querySelector('#libraryDismiss .panel-dismiss')?.click(); };
    if (!isOn('show-library')) { tab?.click(); return close; }
    if (tab?.getAttribute('aria-selected') === 'true') return owned ? close : null;
    const before = document.querySelector('.mode-tabs [aria-selected="true"]');
    tab?.click();
    return () => { if (isOn('show-library')) before?.click(); };
  }],
  // Properties and layers: «Настройки» (F).
  settings: [() => visible('#focusButton'), (owned) => {
    const close = () => { if (!isOn('focus-mode')) document.getElementById('focusButton')?.click(); };
    if (!isOn('focus-mode')) return owned ? close : null;
    document.getElementById('focusButton')?.click();
    return close;
  }]
};
const PAD = 8, GAP = 16, EDGE = 12, LEAVE = 240;
// Kept across the editor's rebuild when the language changes, so the tour goes on where it was:
// { phase, target (the step's part), revealed (the panel the tour has open) }.
let kept = null;

function seen() { try { return localStorage.getItem(TOUR_KEY) === 'done'; } catch { return true; } }
function remember() { try { localStorage.setItem(TOUR_KEY, 'done'); } catch { /* Shown again next time. */ } }
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// The part on screen, cut to the window; nothing when it is hidden or mostly outside.
function visible(selector) {
  const node = document.querySelector(selector);
  if (!node || node.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false) return null;
  const rect = node.getBoundingClientRect();
  const left = Math.max(rect.left, 0), top = Math.max(rect.top, 0);
  const width = Math.min(rect.right, innerWidth) - left, height = Math.min(rect.bottom, innerHeight) - top;
  if (rect.width < 8 || rect.height < 8 || width <= 0 || height <= 0 || (width * height) / (rect.width * rect.height) < 0.6) return null;
  return { left, top, width, height };
}
const available = () => STEPS.filter((step) => visible(step.target) || (step.reveal && matchMedia('(min-width: 901px)').matches && REVEAL[step.reveal][0]()));
// The card goes beside the part — the step's side first, then below, above, right, left — kept on
// screen, its pointer at the part's middle; a part too big for any side (the canvas) holds the card
// inside, at its bottom.
function place(rect, { width, height }) {
  if (!rect) return { side: 'none', x: (innerWidth - width) / 2, y: (innerHeight - height) / 2 };
  const hole = { left: rect.left - PAD, top: rect.top - PAD, right: rect.left + rect.width + PAD, bottom: rect.top + rect.height + PAD };
  const middle = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const x = (value) => Math.max(EDGE, Math.min(innerWidth - width - EDGE, value)), y = (value) => Math.max(EDGE, Math.min(innerHeight - height - EDGE, value));
  const sides = {
    bottom: hole.bottom + GAP + height + EDGE <= innerHeight && { x: x(middle.x - width / 2), y: hole.bottom + GAP },
    top: hole.top - GAP - height >= EDGE && { x: x(middle.x - width / 2), y: hole.top - GAP - height },
    right: hole.right + GAP + width + EDGE <= innerWidth && { x: hole.right + GAP, y: y(middle.y - height / 2) },
    left: hole.left - GAP - width >= EDGE && { x: hole.left - GAP - width, y: y(middle.y - height / 2) }
  };
  for (const side of [rect.prefer, 'bottom', 'top', 'right', 'left']) {
    const spot = side && sides[side];
    if (!spot) continue;
    const across = side === 'bottom' || side === 'top';
    return { side, ...spot, pointer: Math.max(22, Math.min((across ? width : height) - 22, across ? middle.x - spot.x : middle.y - spot.y)) };
  }
  return { side: 'inside', x: x(middle.x - width / 2), y: y(hole.bottom - height - 28) };
}

export default function EditorTour({ editor }) {
  // welcome → tour (an index in `list`) → done; null: nothing. `leaving` is the part fading out.
  const [phase, setPhase] = useState(null), [step, setStep] = useState(0);
  const [list, setList] = useState([]), [leaving, setLeaving] = useState(null);
  const [rect, setRect] = useState(null), [size, setSize] = useState({ width: 360, height: 230 }), [dir, setDir] = useState('next');
  // The spotlight flies out of the middle of the screen to the first part.
  const [flown, setFlown] = useState(false);
  const card = useRef(null), primary = useRef(null), timer = useRef(0), live = useRef({ phase, step });
  // The panel the tour opened (REVEAL), one it owned before a rebuild, and whether it is going away.
  const revealed = useRef(null), owned = useRef(null), unmounting = useRef(false);
  live.current = { phase, step, target: list[step]?.target };
  const current = phase === 'tour' ? list[step] : null;
  const swap = useCallback((next, from) => {
    clearTimeout(timer.current);
    setLeaving(from);
    setPhase(next);
    timer.current = setTimeout(() => setLeaving(null), still() ? 0 : LEAVE);
  }, []);
  const close = useCallback(() => { remember(); swap(null, live.current.phase); }, [swap]);
  const begin = useCallback((at = 0) => {
    const steps = available();
    if (!steps.length) return close();
    setList(steps); setDir('next'); setStep(Math.min(at, steps.length - 1));
    swap('tour', live.current.phase);
  }, [swap, close]);
  const go = useCallback((delta) => {
    const { phase: now, step: at } = live.current;
    if (now !== 'tour') return;
    if (at + delta >= list.length) { remember(); return swap('done', 'tour'); }
    if (at + delta < 0) return;
    setDir(delta > 0 ? 'next' : 'back'); setStep(at + delta);
  }, [list.length, swap]);

  // The first visit: once the editor is idle (no dialog or menu open), after a moment. Through the
  // language switch's rebuild it goes on at the same step, once the controls are in (the file's
  // grids, the panels), with the panel it had open.
  useEffect(() => {
    unmounting.current = false;
    const again = () => begin(0);
    window.addEventListener(TOUR_EVENT, again);
    let wait = 0, frame = 0;
    const was = kept;
    kept = null;
    if (was) frame = requestAnimationFrame(() => {
      const steps = available();
      if (!steps.length) return;
      owned.current = was.revealed;
      setList(steps); setStep(Math.max(0, steps.findIndex((item) => item.target === was.target))); setPhase(was.phase);
    });
    else if (!seen()) {
      const later = () => { wait = setTimeout(() => (document.querySelector('dialog[open], .group-choice') ? later() : setPhase('welcome')), 900); };
      later();
    }
    return () => {
      // Before the other effects' cleanups: a panel the tour opened stays open for the next editor.
      unmounting.current = true;
      clearTimeout(wait); clearTimeout(timer.current); cancelAnimationFrame(frame);
      window.removeEventListener(TOUR_EVENT, again);
      kept = live.current.phase ? { ...live.current, revealed: revealed.current } : null;
    };
  }, [begin]);

  // A step's hidden panel: open for its turn, closed when the tour moves past it or ends; the card
  // keeps the focus. A passive effect: React drops clicks made while it commits (a layout cleanup).
  const reveal = current?.reveal ?? null;
  useEffect(() => {
    if (!reveal) return;
    const undo = REVEAL[reveal][1](owned.current === reveal);
    owned.current = null;
    revealed.current = undo ? reveal : null;
    const frame = requestAnimationFrame(() => primary.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      if (unmounting.current) return;
      revealed.current = null;
      undo?.();
    };
  }, [reveal]);
  // The spotlight follows its part every frame for a moment (a panel slides in, the canvas refits),
  // then on resize.
  useLayoutEffect(() => {
    if (!current) return;
    let frame = 0, until = 0, last = '';
    const measure = () => {
      const found = visible(current.target);
      const key = found ? [found.left, found.top, found.width, found.height].map(Math.round).join() : '';
      if (key !== last) { last = key; setRect(found && { ...found, prefer: current.side }); }
      if (performance.now() < until) frame = requestAnimationFrame(measure);
    };
    const follow = (ms) => { until = performance.now() + ms; cancelAnimationFrame(frame); measure(); };
    follow(900);
    const resize = () => follow(300);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); };
  }, [current]);
  // The card's own size places it; it changes with the text.
  useLayoutEffect(() => {
    const node = card.current;
    if (!node) return;
    const read = () => setSize((was) => (was.width === node.offsetWidth && was.height === node.offsetHeight ? was : { width: node.offsetWidth, height: node.offsetHeight }));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [phase]);
  useEffect(() => {
    if (phase !== 'tour') return setFlown(false);
    const frame = requestAnimationFrame(() => setFlown(true));
    return () => cancelAnimationFrame(frame);
  }, [phase]);
  // The main button has the focus, unless it is on another button of the card already.
  useEffect(() => {
    if (!phase) return;
    const frame = requestAnimationFrame(() => { if (!card.current?.contains(document.activeElement)) primary.current?.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(frame);
  }, [phase, step]);

  // Keys: the tour's own, Tab kept inside the card, nothing reaches the editor's shortcuts.
  useEffect(() => {
    if (!phase) return;
    const keys = (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (event.key === 'ArrowRight' && phase === 'tour') { event.preventDefault(); go(1); }
      else if (event.key === 'ArrowLeft' && phase === 'tour') { event.preventDefault(); go(-1); }
      else if (event.key === 'Tab') {
        const items = [...(card.current?.querySelectorAll('button:not(:disabled)') || [])];
        if (!items.length) return;
        event.preventDefault();
        const at = items.indexOf(document.activeElement);
        items[(at + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus();
      }
    };
    window.addEventListener('keydown', keys, true);
    return () => window.removeEventListener('keydown', keys, true);
  }, [phase, go, close]);

  const shown = (name) => phase === name || leaving === name;
  const fading = (name) => (leaving === name ? ' is-leaving' : '');
  const spot = place(rect, size);
  const hole = rect && flown
    ? { left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const item = current || list[step];
  return <div className="tour-root">
    {shown('welcome') && <div className={`tour-backdrop${fading('welcome')}`} role="dialog" aria-modal="true" aria-labelledby="tourWelcome">
      <section className="tour-welcome" ref={phase === 'welcome' ? card : null}>
        <span className="tour-mark tour-rise" style={{ '--i': 0 }} aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none"><path pathLength="1" d="m5 4 23 24M5 18v10h10M18 4h10v10"/></svg>
        </span>
        <h2 id="tourWelcome" className="tour-rise" style={{ '--i': 1 }}>{t('Добро пожаловать в редактор')}</h2>
        <p className="tour-rise" style={{ '--i': 2 }}>{t('Здесь собираются сетки героев Dota 2: группы героев, подписи, рисунки из символов и картинок. Покажем, где что, — это около минуты.')}</p>
        <ul className="tour-features">
          {[['heroes', 'Группы героев'], ['sparkle', 'Мета STRATZ'], ['brush', 'Рисунки']].map(([icon, label], index) =>
            <li key={icon} className="tour-rise" style={{ '--i': 3 + index }}><Icon name={icon} size={18}/>{t(label)}</li>)}
        </ul>
        <div className="tour-actions tour-rise" style={{ '--i': 6 }}>
          <button type="button" className="button secondary" onClick={close}>{t('Разберусь сам')}</button>
          <button type="button" className="button primary" ref={phase === 'welcome' ? primary : null} onClick={() => begin(0)}>{t('Показать, где что')}<Icon name="arrow" size={18}/></button>
        </div>
        <p className="tour-note tour-rise" style={{ '--i': 7 }}>{t('Листай стрелками ← →, Esc закрывает. Обучение всегда можно открыть снова в «Помощи» (?).')}</p>
      </section>
    </div>}

    {shown('tour') && item && <div className={`tour-layer${fading('tour')}`} role="dialog" aria-modal="true" aria-labelledby="tourTitle">
      <div className={`tour-spotlight${rect && flown ? '' : ' is-empty'}`} style={{ ...hole,
        '--pulse-x': 1 + 16 / Math.max(hole.width, 1), '--pulse-y': 1 + 16 / Math.max(hole.height, 1) }}/>
      <section className="tour-card" data-side={spot.side} ref={phase === 'tour' ? card : null}
        style={{ translate: `${Math.round(spot.x)}px ${Math.round(spot.y)}px`, '--pointer': `${spot.pointer ?? 0}px`, '--progress': (step + 1) / list.length }}>
        <span className="tour-pointer" aria-hidden="true"/>
        <span className="tour-progress" aria-hidden="true"><i/></span>
        <div className="tour-body" key={step} data-dir={dir}>
          <header className="tour-head">
            <span className="tour-icon"><Icon name={item.icon} size={20}/></span>
            <span className="tour-heading">
              <span className="tour-eyebrow tour-item" style={{ '--i': 0 }}>{t('Шаг {step} из {count}', { step: step + 1, count: list.length })}</span>
              <h3 id="tourTitle" className="tour-item" style={{ '--i': 1 }}>{t(item.title)}</h3>
            </span>
            <button type="button" className="tour-skip" onClick={close} aria-label={t('Закрыть обучение')} title={t('Пропустить')}><Icon name="close" size={16}/></button>
          </header>
          <p className="tour-item" style={{ '--i': 2 }}>{t(item.text)}</p>
          {item.keys && <span className="tour-keys tour-item" style={{ '--i': 3 }}>{item.keys.map((key) => <kbd key={key}>{key === 'Space' ? t('Пробел') : key}</kbd>)}</span>}
        </div>
        <footer className="tour-foot">
          <span className="tour-hint" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd></span>
          {step > 0 && <button type="button" className="button secondary" onClick={() => go(-1)}>{t('Назад')}</button>}
          <button type="button" className="button primary" ref={phase === 'tour' ? primary : null} onClick={() => go(1)}>
            {step === list.length - 1 ? <>{t('Готово')}<Icon name="check" size={16}/></> : <>{t('Далее')}<Icon name="arrow" size={16}/></>}
          </button>
        </footer>
      </section>
    </div>}

    {shown('done') && <div className={`tour-backdrop is-light${fading('done')}`} role="dialog" aria-modal="true" aria-labelledby="tourDone">
      <section className="tour-welcome tour-finish" ref={phase === 'done' ? card : null}>
        <span className="tour-burst" aria-hidden="true"><i/><i/>
          <svg viewBox="0 0 24 24" fill="none"><path pathLength="1" d="M5 12.5 10 17.5 19 7.5"/></svg>
        </span>
        <h2 id="tourDone" className="tour-rise" style={{ '--i': 1 }}>{t('Теперь ты знаешь, где что')}</h2>
        <p className="tour-rise" style={{ '--i': 2 }}>{t('С чего начнём?')}</p>
        <div className="tour-starts">
          {editor?.openMeta && <button type="button" className="tour-start is-meta tour-rise" style={{ '--i': 3 }} ref={phase === 'done' ? primary : null}
            onClick={() => { close(); editor.openMeta(); }}>
            <span className="tour-start-icon"><Icon name="sparkle" size={22}/></span>
            <span><strong>{t('Сетка по мете')}<em>STRATZ</em></strong><small>{t('Сильные герои каждой позиции за неделю')}</small></span>
            <Icon name="chevronRight" size={16}/>
          </button>}
          <button type="button" className="tour-start tour-rise" style={{ '--i': 4 }} ref={phase === 'done' && !editor?.openMeta ? primary : null} onClick={close}>
            <span className="tour-start-icon"><Icon name="edit" size={22}/></span>
            <span><strong>{t('Начать с нуля')}</strong><small>{t('Пустой холст — дальше сам')}</small></span>
            <Icon name="chevronRight" size={16}/>
          </button>
          <a className="tour-start is-chat tour-rise" style={{ '--i': 5 }} href={COMMUNITY.chat} target="_blank" rel="noreferrer" onClick={close}>
            <span className="tour-start-icon"><Icon name="telegramLogo" size={22}/></span>
            <span><strong>{t('Чат пользователей')}</strong><small>{t('Вопросы, баги и идеи — отвечаем там же')}</small></span>
            <Icon name="external" size={16}/>
          </a>
        </div>
        <p className="tour-note tour-rise" style={{ '--i': 6 }}>{t('Обучение всегда можно открыть снова в «Помощи» (?).')}</p>
      </section>
    </div>}
  </div>;
}
