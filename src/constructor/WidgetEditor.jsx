import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Modal } from '../catalog/Common.jsx';
import { t } from '../../scripts/i18n.mjs';
import { BLOCK_LIMITS, BLOCK_TYPES, WIDGET_ACTIONS, cleanDesign, newBlock } from '../../scripts/menu-widgets.mjs';
import { WIDGET_TEMPLATES, templateDesign } from './widget-templates.js';
import { keepMedia } from '../customize/look-store.js';
import { getDesigns } from '../customize/widget-designs.js';
import { BlockInspector, DesignInspector, mediaKind, mediaProblem, presetOf } from './BlockInspector.jsx';
import { blockName, replayAnimations } from './BlockView.jsx';
import DesignBoard, { MARGIN } from './DesignBoard.jsx';
import { Draft } from './WidgetInspector.jsx';
import { rememberMediaURL } from './live.js';
import { useAccount } from '../catalog/Account.jsx';
import PublishWindow, { PUBLISH_STATES } from './PublishWidget.jsx';
import { publishedState, refreshPublished, usePublished } from './workshop.js';

// «Редактор виджета» (2026-10-31; the approved mockup mockups/constructor/widget.html in the constructor's
// variant-B look): a widget of one's own made of blocks only, no code (the owner's decision). A full-screen mode
// of the constructor (ConstructorPage.jsx, ?app=b&widget=<designId|new>): the blocks to drag in and the layers on
// the left, the widget on its canvas in the middle (alone, or on the main menu where it stands), the selected
// block's settings or the design's on the right, the states (as it is, under the cursor, pressed) and undo
// above. «Сохранить» keeps the design in «Мои виджеты» (widget-designs.js: every menu widget made of it follows),
// «Добавить в меню» puts it on the menu (designWidget). Until it is saved, the work is kept as a draft in this
// browser (a reload brings it back); the editor's own things (locked blocks, names of layers, the view) too.
const DRAFT_KEY = 'gridstudio.widget-draft', PREFS_KEY = 'gridstudio.widget-editor';
const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const write = (key, value) => { try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* This visit only. */ } };
export const readDraft = () => { const draft = read(DRAFT_KEY); return draft && typeof draft.key === 'string' && draft.design ? draft : null; };
export const clearDraft = () => write(DRAFT_KEY, null);
const newId = () => `b${Math.random().toString(36).slice(2, 9)}`;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// A new design: Dota's news card size, a dark panel like Dota's own.
export const blankDesign = () => cleanDesign({ name: t('Мой виджет'), size: [330, 484], background: '#0d0f18e6', radius: 4, blocks: [] });
// A block with its words in the site's language; a button lights up under the cursor.
function freshBlock(type) {
  const block = newBlock(type, { id: newId() });
  if (type === 'text') block.props.text = t('Текст');
  if (type === 'button') { block.props.label = t(WIDGET_ACTIONS[block.props.action].title); block.hover = true; }
  return block;
}
// A picture's or video's shape (height / width), or null.
async function mediaRatio(file) {
  try { const bitmap = await createImageBitmap(file); const ratio = bitmap.height / bitmap.width; bitmap.close(); return ratio; } catch { /* a video */ }
  return new Promise((resolve) => {
    const video = document.createElement('video'), url = URL.createObjectURL(file);
    const done = (value) => { resolve(value); URL.revokeObjectURL(url); };
    video.preload = 'metadata'; video.muted = true;
    video.onloadedmetadata = () => done(video.videoWidth ? video.videoHeight / video.videoWidth : null);
    video.onerror = () => done(null);
    setTimeout(() => done(null), 5000);
    video.src = url;
  });
}
const GROUPS = () => [[t('Основа'), ['image', 'video', 'text', 'button', 'shape']], [t('Время и прогресс'), ['clock', 'timer', 'progress']], [t('Из Dota'), ['avatar', 'nickname', 'hero']]];
const BLOCK_HINTS = () => ({ image: t('PNG, JPEG или WebP'), video: t('MP4, WebM или GIF, без звука'), text: t('Надпись шрифтом Dota'), button: t('Открывает раздел Dota или ссылку'),
  shape: t('Цвет, градиент, рамка'), clock: t('Время на компьютере'), timer: t('Сколько осталось до даты'), progress: t('Полоса с заполнением'),
  avatar: t('Аватар Steam того, у кого стоит Dota'), nickname: t('Ник того, у кого стоит Dota'), hero: t('3D-модель, живой портрет или картинка героя') });
const STATES = () => [['normal', t('Обычный')], ['hover', t('Наведение')], ['press', t('Нажатие')]];
const ANIM_TAGS = () => ({ appear: t('появление'), pulse: t('пульсация'), slide: t('сдвиг') });
function liveStore() {
  let value = null;
  const listeners = new Set();
  return { get: () => value, set: (next) => { value = next; for (const listener of listeners) listener(); }, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } };
}

// `start`: { key: designId | 'new', design, from: the menu widget it was opened from, restore: take the draft
// of this key }. `menu`: { node (the main menu's picture), dims, place(design, key, from) → the widget's rect on
// it }. `control`: a ref the page asks (the browser's Back: unsaved changes?).
export default function WidgetEditor({ start, menu, fontStyle, inMenu, onSave, onAddToMenu, onClose, onKey, control, onOpenWorkshop = () => {} }) {
  const first = useMemo(() => {
    const draft = start.restore ? readDraft() : null, mine = draft && draft.key === start.key;
    const design = cleanDesign(mine ? draft.design : start.design), opened = JSON.stringify(cleanDesign(start.design));
    // `base`: what the work started from (a new design left as it came needs no question on leaving).
    return { key: start.key, from: mine ? draft.from ?? start.from : start.from, design, saved: start.key === 'new' ? '' : opened, base: mine && typeof draft.base === 'string' ? draft.base : opened };
  }, []);
  const [key, setKey] = useState(first.key), [from] = useState(first.from), [saved, setSaved] = useState(first.saved);
  const history = useRef({ stack: [first.design], at: 0, key: '', time: 0 }), [, setTick] = useState(0);
  const h = history.current, design = h.stack[h.at];
  const [selected, setSelected] = useState(null), [state, setState] = useState('normal'), [zoom, setZoom] = useState(0), [scale, setScale] = useState(0);
  const [prefs, setPrefsState] = useState(() => ({ context: 'alone', meta: {}, ...(read(PREFS_KEY) || {}) }));
  // Kept at once (not in an effect): «Сохранить» and closing come in one step, and the editor is gone after it.
  const prefsNow = useRef(prefs);
  const setPrefs = (change) => { const next = typeof change === 'function' ? change(prefsNow.current) : change; prefsNow.current = next; write(PREFS_KEY, next); setPrefsState(next); };
  const [toast, setToast] = useState(null), [asking, setAsking] = useState(false), [renaming, setRenaming] = useState(null);
  const board = useRef(null), live = useMemo(liveStore, []), shown = useRef({});
  const meta = prefs.meta?.[key] || {}, locked = useMemo(() => new Set(meta.locked || []), [meta.locked]), names = meta.names || {};
  const sel = selected ? design.blocks.find((b) => b.id === selected) || null : null;
  const dirty = JSON.stringify(design) !== (saved || first.base);
  useEffect(() => { if (selected && !sel) setSelected(null); }, [selected, sel]);
  // The work in progress, for a reload (cleared when the editor closes).
  useEffect(() => { write(DRAFT_KEY, { key, from, design, saved, base: first.base }); }, [design, key, saved]);
  const setMeta = (patch) => setPrefs((value) => ({ ...value, meta: { ...value.meta, [key]: { ...(value.meta?.[key] || {}), ...patch } } }));
  // The things of designs no longer in «Мои виджеты» go (kept: the open one and a new one).
  useEffect(() => {
    const ids = new Set(getDesigns().map((item) => item.id)), all = prefsNow.current.meta || {};
    const keep = Object.fromEntries(Object.entries(all).filter(([id]) => id === key || id === 'new' || ids.has(id)));
    if (Object.keys(keep).length !== Object.keys(all).length) setPrefs((value) => ({ ...value, meta: keep }));
  }, []);

  const timer = useRef(0);
  const say = (text, undoable = false, tone = '') => { clearTimeout(timer.current); setToast({ text, undoable, tone, at: Date.now() }); timer.current = setTimeout(() => setToast(null), 3400); };
  useEffect(() => () => clearTimeout(timer.current), []);

  // ——— Changes and their history ———
  // Every change is checked (cleanDesign: blocks inside the design, each field of its kind); `key`: changes of
  // the same field one after another are one step.
  const commit = (next, step = '') => {
    const now = h.stack[h.at], value = cleanDesign(typeof next === 'function' ? next(now) : next);
    if (JSON.stringify(value) === JSON.stringify(now)) return now;
    if (step && h.key === step && Date.now() - h.time < 1500 && h.at === h.stack.length - 1) h.stack[h.at] = value;
    else { h.stack = [...h.stack.slice(0, h.at + 1), value].slice(-150); h.at = h.stack.length - 1; }
    h.key = step; h.time = Date.now(); setTick((n) => n + 1);
    return value;
  };
  const undo = () => { if (h.at <= 0) return; h.at -= 1; h.key = ''; setTick((n) => n + 1); say(t('Отменено')); };
  const redo = () => { if (h.at >= h.stack.length - 1) return; h.at += 1; h.key = ''; setTick((n) => n + 1); say(t('Повторено')); };
  const canUndo = h.at > 0, canRedo = h.at < h.stack.length - 1;
  const patchBlock = (id, patch, step = '') => commit((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...(typeof patch === 'function' ? patch(b) : patch) } : b)) }), step);

  // ——— Blocks ———
  function addBlock(type, rect = null, extra = {}) {
    if (design.blocks.length >= BLOCK_LIMITS.blocks) { say(t('Блоков уже {count} — больше в один виджет не поместить.', { count: BLOCK_LIMITS.blocks }), false, 'warn'); return null; }
    const block = freshBlock(type), [W, H] = design.size, w = Math.min(block.w, W), h0 = Math.min(block.h, H);
    const made = { ...block, ...(rect || { x: Math.round((W - w) / 2), y: Math.round((H - h0) / 2), w, h: h0 }), ...extra, props: { ...block.props, ...(extra.props || {}) } };
    const next = commit((d) => ({ ...d, blocks: [...d.blocks, made] }));
    const added = next.blocks.find((b) => b.id === made.id) || next.blocks.at(-1);
    setSelected(added.id);
    say(t('Добавлен блок: {name}', { name: blockName(added) }), true);
    return added;
  }
  function tool(act, id) {
    const list = design.blocks, index = list.findIndex((b) => b.id === id), block = list[index];
    if (!block) return;
    if (act === 'dup') {
      if (list.length >= BLOCK_LIMITS.blocks) { say(t('Блоков уже {count} — больше в один виджет не поместить.', { count: BLOCK_LIMITS.blocks }), false, 'warn'); return; }
      const [W, H] = design.size, copy = { ...structuredClone(block), id: newId(), x: clamp(block.x + 12, 0, W - block.w), y: clamp(block.y + 12, 0, H - block.h) };
      commit({ ...design, blocks: [...list.slice(0, index + 1), copy, ...list.slice(index + 1)] });
      if (names[id]) setMeta({ names: { ...names, [copy.id]: t('{name} — копия', { name: names[id] }) } });
      setSelected(copy.id); say(t('Дублировано: {name}', { name: blockName(block, names) }), true);
    }
    if (act === 'up' && index < list.length - 1) commit({ ...design, blocks: [...list.slice(0, index), list[index + 1], block, ...list.slice(index + 2)] });
    if (act === 'down' && index > 0) commit({ ...design, blocks: [...list.slice(0, index - 1), block, list[index - 1], ...list.slice(index + 1)] });
    if (act === 'lock') setMeta({ locked: locked.has(id) ? [...locked].filter((one) => one !== id) : [...locked, id] });
    if (act === 'hide') {
      if (block.opacity > 0) { shown.current[id] = block.opacity; patchBlock(id, { opacity: 0 }); }
      else patchBlock(id, { opacity: shown.current[id] || 100 });
    }
    if (act === 'delete') {
      commit({ ...design, blocks: list.filter((b) => b.id !== id) }); setSelected(null);
      say(t('Удалено: {name}', { name: blockName(block, names) }), true);
    }
  }
  const setRect = (id, rect, step = `geo:${id}`) => {
    const [W, H] = design.size, w = clamp(Math.round(rect.w), BLOCK_LIMITS.min, W), hh = clamp(Math.round(rect.h), BLOCK_LIMITS.min, H);
    patchBlock(id, { x: clamp(Math.round(rect.x), 0, W - w), y: clamp(Math.round(rect.y), 0, H - hh), w, h: hh }, step);
  };

  // ——— Pictures and videos: a block's file, or a new block from a file dropped on the canvas ———
  // → '' or what went wrong.
  async function takeFile(file, at = null, target = null) {
    const problem = mediaProblem(file);
    if (problem) { if (!target || at) say(problem, false, 'warn'); return problem; }
    const kind = mediaKind(file), hash = await keepMedia(file);
    if (!hash) { const text = t('Браузеру не хватило места для файла. Освободи место или выбери файл поменьше.'); say(text, false, 'warn'); return text; }
    rememberMediaURL(hash, file);
    const ratio = await mediaRatio(file);
    if (target) {
      // The block takes the file (a GIF or a video makes it a video block); an empty one takes its shape too.
      commit((d) => ({ ...d, blocks: d.blocks.map((b) => {
        if (b.id !== target) return b;
        const shape = !b.props.media && ratio ? { h: clamp(Math.round(b.w * ratio), BLOCK_LIMITS.min, d.size[1] - b.y) } : {};
        return { ...b, type: kind, ...shape, props: { ...b.props, media: hash } };
      }) }));
      setSelected(target);
      if (kind !== design.blocks.find((b) => b.id === target)?.type) say(kind === 'video' ? t('Блок стал видео: так файл сохранит движение.') : t('Блок стал картинкой.'));
    } else {
      const [W, H] = design.size, room = { w: Math.max(BLOCK_LIMITS.min, W - MARGIN * 2), h: Math.max(BLOCK_LIMITS.min, Math.round(H * 0.6)) };
      const r = ratio || 9 / 16, w = Math.round(Math.min(room.w, room.h / r)), hh = Math.max(BLOCK_LIMITS.min, Math.round(w * r));
      const cx = at ? at.x : W / 2, cy = at ? at.y : H / 2;
      addBlock(kind, { x: clamp(Math.round(cx - w / 2), 0, W - w), y: clamp(Math.round(cy - hh / 2), 0, H - hh), w, h: Math.min(hh, H) }, { props: { media: hash } });
    }
    return '';
  }

  // ——— Saving ———
  const status = !saved ? 'new' : dirty ? 'changed' : 'saved';
  // `value`: the design to keep (the publish window may have just renamed it).
  function save(value = design) {
    const clean = cleanDesign(value), id = onSave(clean, key, from);
    if (key !== id) {
      // The editor's things of a new design move under its id.
      setPrefs((value) => { const all = { ...value.meta }; if (all[key]) { all[id] = all[key]; delete all[key]; } return { ...value, meta: all }; });
      setKey(id); onKey(id);
    }
    setSaved(JSON.stringify(clean));
    return id;
  }
  const saveNow = () => { const id = save(); const count = inMenu(id); say(count ? t('Сохранено — виджет в меню тоже обновился') : t('Сохранено в «Мои виджеты»')); };
  const addToMenu = () => { const id = save(); const problem = onAddToMenu(cleanDesign(design), id); if (problem) say(problem, false, 'warn'); };
  const leave = () => { if (dirty) setAsking(true); else onClose(); };

  // ——— «Опубликовать в мастерскую» (PublishWidget.jsx, workshop.js) ———
  // Signed in only. The button tells what became of the design as it was sent (a changed one may be sent again).
  const auth = useAccount(), record = usePublished()[key], shared = publishedState(record, design);
  const [publishing, setPublishing] = useState(false);
  useEffect(() => { if (record && auth?.user) refreshPublished(key, record); }, [key, auth?.user?.id]);
  const publish = () => {
    if (!auth?.user) { auth?.requestLogin(t('Войди, чтобы опубликовать виджет в мастерской.'), 'widget'); return; }
    if (!shared && !design.blocks.length) { say(t('В виджете нет ни одного блока — добавь хотя бы один.'), false, 'warn'); return; }
    setPublishing(true);
  };
  // The window's «Опубликовать»: the name it was given, saved in «Мои виджеты» first → the design and its id.
  const keepForPublishing = (name) => { const next = name && name !== design.name ? commit((d) => ({ ...d, name }), 'name') : design; const id = save(next); h.key = ''; return { design: cleanDesign(next), id }; };
  if (control) control.current = { dirty: () => JSON.stringify(history.current.stack[history.current.at]) !== (saved || first.base), ask: () => setAsking(true) };

  // ——— The palette ———
  const pick = (event, type) => {
    const sample = freshBlock(type);
    board.current?.paletteDrag(event, { block: sample, drop: (rect) => addBlock(type, rect), click: () => addBlock(type) });
  };
  const replay = (id = null) => {
    const root = board.current?.layer();
    replayAnimations(id ? root?.querySelector(`[data-id="${id}"]`) : root);
  };
  // A double click on a text or a button: its words in the inspector.
  const editText = (block) => { if (block.type === 'text' || block.type === 'button') setTimeout(() => { const field = document.getElementById('kz-block-words'); field?.focus(); field?.select?.(); }, 30); };

  // ——— Keyboard ———
  const keys = useRef(null);
  keys.current = (event) => {
    if (document.querySelector('dialog[open]')) return;
    const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]'), mod = event.ctrlKey || event.metaKey, letter = event.key.toLowerCase();
    if (mod && letter === 's') { event.preventDefault(); saveNow(); return; }
    if (mod && letter === 'z' && !typing) { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
    if (mod && letter === 'y' && !typing) { event.preventDefault(); redo(); return; }
    if (event.key === 'Escape') { if (renaming) return; if (typing) event.target.blur(); else setSelected(null); return; }
    if (typing || !sel) return;
    if (mod && letter === 'd') { event.preventDefault(); tool('dup', sel.id); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); tool('delete', sel.id); return; }
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (step && !locked.has(sel.id)) {
      event.preventDefault();
      const by = event.shiftKey ? 10 : 1;
      setRect(sel.id, { ...sel, x: sel.x + step[0] * by, y: sel.y + step[1] * by }, `nudge:${sel.id}`);
    }
  };
  useEffect(() => { const down = (event) => keys.current(event); addEventListener('keydown', down); return () => removeEventListener('keydown', down); }, []);

  // ——— What is shown ———
  const [W, H] = design.size, preset = presetOf(design.size);
  const backdrop = prefs.context === 'menu' ? { node: menu.node, dims: menu.dims, place: menu.place(design, key, from) } : null;
  const count = inMenu(key, from);
  const toolbar = (block) => {
    const still = locked.has(block.id);
    return <>
      <button type="button" title={t('Дублировать (Ctrl+D)')} aria-label={t('Дублировать')} onClick={() => tool('dup', block.id)}><Icon name="copy" size={15}/></button>
      <button type="button" title={t('Слой выше')} aria-label={t('Слой выше')} onClick={() => tool('up', block.id)}><Icon name="chevronUp" size={15}/></button>
      <button type="button" title={t('Слой ниже')} aria-label={t('Слой ниже')} onClick={() => tool('down', block.id)}><Icon name="chevron" size={15}/></button>
      <i className="kz-sep"/>
      <button type="button" title={still ? t('Открепить') : t('Закрепить')} aria-label={still ? t('Открепить') : t('Закрепить')} aria-pressed={still} onClick={() => tool('lock', block.id)}><Icon name={still ? 'lock' : 'unlock'} size={15}/></button>
      <button type="button" className="is-danger" title={t('Удалить (Delete)')} aria-label={t('Удалить')} onClick={() => tool('delete', block.id)}><Icon name="trash" size={15}/></button>
    </>;
  };
  const empty = <><Icon name="layers" size={22}/><b>{t('Пустой виджет')}</b><span>{t('Перетащи блок слева или брось сюда картинку, GIF или видео.')}</span>
    <span className="kz-ed-tpl-h">{t('или начни с шаблона')}</span>
    <div className="kz-ed-tpls">{WIDGET_TEMPLATES().map((template) => <button key={template.id} type="button" className="kz-ghostbtn kz-ed-tpl"
      onClick={() => { const made = templateDesign(template); commit((d) => ({ ...d, size: made.size, background: made.background, radius: made.radius, blocks: made.blocks })); setSelected(null);
        say(t('Готово: шаблон «{name}». Меняй что угодно.', { name: template.title }), true); }}>
      <b>{template.title}</b><small>{template.text}</small></button>)}</div></>;

  return <div className="kz kz-ed" style={fontStyle} onDragOver={(event) => { if ([...(event.dataTransfer?.types || [])].includes('Files')) event.preventDefault(); }} onDrop={(event) => event.preventDefault()}>
    <DesignBoard ref={board} design={design} zoom={zoom} onZoom={setZoom} onScale={setScale} selected={selected} onSelect={setSelected} locked={locked} snap state={state}
      backdrop={backdrop} onCommit={(id, rect) => setRect(id, rect, '')} live={live} toolbar={toolbar} labelOf={(block) => blockName(block, names)}
      onFile={(file, at, target) => takeFile(file, at, target)} onEditText={editText} empty={empty}>
      <div className="kz-ed-ctx">
        <div className="kz-glass kz-pill kz-ed-seg" role="radiogroup" aria-label={t('Фон под виджетом')}>
          {[['alone', t('Отдельно')], ['menu', t('На фоне меню')]].map(([id, title]) => <button key={id} type="button" role="radio" aria-checked={prefs.context === id} className="kz-ghostbtn"
            onClick={() => { setPrefs((value) => ({ ...value, context: id })); setZoom(0); }}>{title}</button>)}
        </div>
        <span className="kz-ed-size">{W} × {H}{preset ? ` — ${preset[1].toLowerCase()}` : ''}{backdrop && count ? ` · ${t('там, где стоит в меню')}` : ''}</span>
      </div>
      {state !== 'normal' && <div className="kz-ed-badge" role="status"><Icon name="cursor" size={15}/>{state === 'hover' ? t('Так блоки с наведением выглядят под курсором') : t('Так — в момент нажатия')}</div>}
      <div className="kz-glass kz-pill kz-ed-zoom">
        <button type="button" className="kz-iconbtn" title={t('Мельче')} aria-label={t('Мельче')} onClick={() => setZoom(clamp((scale || 1) / 1.2, 0.1, 4))}><Icon name="minus" size={16}/></button>
        <button type="button" className="kz-ghostbtn kz-zoom-val" title={t('Вписать в окно')} onClick={() => setZoom(0)}>{Math.round((scale || 0) * 100)}%</button>
        <button type="button" className="kz-iconbtn" title={t('Крупнее')} aria-label={t('Крупнее')} onClick={() => setZoom(clamp((scale || 1) * 1.2, 0.1, 4))}><Icon name="plus" size={16}/></button>
        <span className="kz-vr" aria-hidden="true"/>
        <button type="button" className="kz-ghostbtn" onClick={() => replay()} disabled={!design.blocks.some((b) => b.anim !== 'none')} title={t('Появление и сдвиг ещё раз с начала')}><Icon name="play" size={15}/>{t('Проиграть анимации')}</button>
      </div>
    </DesignBoard>

    <header className="kz-top kz-ed-top">
      <div className="kz-glass kz-pill kz-ed-title">
        <button type="button" className="kz-ghostbtn kz-ed-back" onClick={leave} title={t('Вернуться в конструктор')}><Icon name="chevronLeft" size={16}/><span>{t('Конструктор')}</span></button>
        <span className="kz-vr" aria-hidden="true"/>
        <Draft className="kz-ed-name" value={design.name} maxLength={BLOCK_LIMITS.name} aria-label={t('Название виджета')} spellCheck={false}
          onChange={(name) => commit((d) => ({ ...d, name }), 'name')} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}/>
        <span className={`kz-ed-chip is-${status}`}>{{ new: t('не сохранён'), changed: t('есть изменения'), saved: t('сохранён') }[status]}</span>
      </div>
      <nav className="kz-glass kz-pill kz-scenes kz-ed-states" aria-label={t('Как выглядит')}>
        {STATES().map(([id, title]) => <button key={id} type="button" aria-pressed={state === id} onClick={() => setState(id)}>{title}</button>)}
      </nav>
      <div className="kz-glass kz-pill kz-tools-pill kz-ed-actions">
        <button type="button" className="kz-iconbtn" disabled={!canUndo} title={t('Отменить (Ctrl+Z)')} aria-label={t('Отменить')} onClick={undo}><Icon name="undo" size={17}/></button>
        <button type="button" className="kz-iconbtn" disabled={!canRedo} title={t('Повторить (Ctrl+Shift+Z)')} aria-label={t('Повторить')} onClick={redo}><Icon name="redo" size={17}/></button>
        <span className="kz-vr" aria-hidden="true"/>
        <button type="button" className="kz-ghostbtn" onClick={saveNow} disabled={status === 'saved'} title={t('Сохранить в «Мои виджеты» (Ctrl+S)')}><Icon name="check" size={16}/><span className="kz-label">{t('Сохранить')}</span></button>
        <button type="button" className={`kz-ghostbtn kz-ed-pub${shared ? ` is-${shared.status}` : ''}`} onClick={publish}
          title={shared ? PUBLISH_STATES()[shared.status].hint : t('Поделиться виджетом: после проверки его смогут добавить в меню другие пользователи')}>
          <Icon name={shared ? PUBLISH_STATES()[shared.status].icon : 'upload'} size={16}/><span className="kz-label">{shared ? PUBLISH_STATES()[shared.status].label : t('Опубликовать в мастерскую')}</span></button>
        <button type="button" className="catalog-button primary kz-build" onClick={addToMenu}><Icon name={count ? 'check' : 'groupPlus'} size={17}/>{count ? t('Сохранить и в меню') : t('Добавить в меню')}</button>
      </div>
    </header>

    <aside className="kz-glass kz-ed-left" aria-label={t('Блоки и слои')}>
      <div className="kz-ed-h"><h2>{t('Блоки')}</h2><span>{t('тяни на виджет')}</span></div>
      <div className="kz-ed-palette">
        {GROUPS().map(([title, types]) => <Fragment key={title}><span className="kz-ed-group">{title}</span>
          <div className="kz-ed-pal">{types.map((type) => <button key={type} type="button" className="kz-ed-blk" title={BLOCK_HINTS()[type]} onPointerDown={(event) => pick(event, type)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); addBlock(type); } }}>
            <span className={`kz-ed-ic is-${type}`}><Icon name={type === 'shape' ? 'rect' : BLOCK_TYPES[type].icon} size={15}/></span><span>{t(BLOCK_TYPES[type].title)}</span></button>)}</div></Fragment>)}
        <p className="kz-note kz-ed-only"><Icon name="shield" size={15}/><span>{t('Только блоки, без кода. Картинку или видео можно просто бросить на виджет.')}</span></p>
      </div>
      <div className="kz-ed-h is-layers"><h2>{t('Слои')}<span className="kz-ed-count">{design.blocks.length}</span></h2><span>{t('тяни за точки')}</span></div>
      <BlockLayers blocks={design.blocks} names={names} selected={selected} locked={locked} renaming={renaming} onRename={setRenaming}
        onName={(id, name) => { const next = { ...names }; if (name.trim()) next[id] = name.trim().slice(0, 40); else delete next[id]; setMeta({ names: next }); }}
        onSelect={setSelected} onTool={tool} onReorder={(ids) => { commit((d) => ({ ...d, blocks: ids.map((id) => d.blocks.find((b) => b.id === id)).filter(Boolean) })); say(t('Порядок слоёв изменён'), true); }}/>
    </aside>

    <aside className="kz-glass kz-ed-insp" aria-label={t('Свойства')}>
      {sel ? <>
        <header className="kz-insp-head"><div className="kz-head"><span className="kz-tile-ico"><Icon name={sel.type === 'shape' ? 'rect' : BLOCK_TYPES[sel.type].icon} size={18}/></span>
          <div><b>{blockName(sel, names)}</b><small>{t('Блок')} · {t(BLOCK_TYPES[sel.type].title)}{locked.has(sel.id) ? ` · ${t('закреплён')}` : ''}</small></div></div>
          <button type="button" className="kz-iconbtn" title={t('К настройкам виджета (Esc)')} aria-label={t('К настройкам виджета')} onClick={() => setSelected(null)}><Icon name="close" size={16}/></button></header>
        <div className="kz-insp-body" key={sel.id}>
          <BlockInspector block={sel} live={live} locked={locked.has(sel.id)} state={state} onRect={(rect) => setRect(sel.id, rect)} onDone={() => { h.key = ''; }}
            onBlock={(patch, step) => patchBlock(sel.id, patch, step ? `${step}:${sel.id}` : '')}
            onProps={(patch, step) => patchBlock(sel.id, (b) => ({ props: { ...b.props, ...patch } }), step ? `props:${sel.id}:${step}` : '')}
            onMedia={(file) => takeFile(file, null, sel.id)} onReplay={() => replay(sel.id)} onTool={(act) => tool(act, sel.id)}/>
        </div>
      </> : <>
        <header className="kz-insp-head"><div className="kz-head"><span className="kz-tile-ico"><Icon name="groupPlus" size={18}/></span>
          <div><b>{design.name}</b><small>{t('Свой виджет')} · {W} × {H}</small></div></div></header>
        <div className="kz-insp-body">
          <DesignInspector design={design} inMenu={count} onDone={() => { h.key = ''; }}
            onDesign={(patch, step) => commit((d) => ({ ...d, ...patch }), step ? `design:${step}` : '')} onSize={(size, step) => commit((d) => ({ ...d, size }), step ? 'design:size' : '')}/>
        </div>
      </>}
    </aside>

    {toast && <div className={`kz-toast${toast.tone ? ` is-${toast.tone}` : ''}`} role="status" key={toast.at}><Icon name={toast.tone === 'warn' ? 'alert' : 'check'} size={16}/><span>{toast.text}</span>
      {toast.undoable && canUndo && <button type="button" className="kz-ghostbtn" onClick={() => { undo(); setToast(null); }}>{t('Отменить')}</button>}</div>}

    {publishing && <PublishWindow design={design} shared={shared} before={!shared && record && ['pending', 'approved'].includes(record.status) ? record : null} user={auth?.user} onKeep={keepForPublishing} onClose={() => setPublishing(false)}
      onOpenWorkshop={() => { setPublishing(false); onOpenWorkshop(); }}/>}

    {asking && <Modal title={t('Сохранить виджет?')} icon="alert" onClose={() => setAsking(false)} lead={t('В «{name}» есть несохранённые изменения.', { name: design.name })}>
      <div className="catalog-confirm"><p>{t('Сохранённый виджет появится в «Моих виджетах» на полке «Виджеты» — его можно поставить в меню и потом поменять.')}</p>
        <div className="catalog-actions">
          <button type="button" className="catalog-button" onClick={() => { setAsking(false); onClose(); }}>{t('Не сохранять')}</button>
          <button type="button" className="catalog-button primary" onClick={() => { save(); setAsking(false); onClose(); }}><Icon name="check"/>{t('Сохранить')}</button>
        </div></div>
    </Modal>}
  </div>;
}

// «Слои»: the blocks, top first (drag the grip to change the order; a double click renames one in the list).
function BlockLayers({ blocks, names, selected, locked, renaming, onRename, onName, onSelect, onTool, onReorder }) {
  const list = useRef(null);
  const grab = (event, id) => {
    event.preventDefault(); event.stopPropagation();
    const rows = [...list.current.querySelectorAll('[data-id]')], row = rows.find((one) => one.dataset.id === id), box = row.getBoundingClientRect(), py = event.clientY;
    const others = rows.filter((one) => one !== row), gap = row.cloneNode(true);
    gap.classList.add('is-gap'); row.after(gap); row.classList.add('is-lift');
    Object.assign(row.style, { position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px` });
    document.body.classList.add('kz-dragging');
    let to = others.length;
    const move = (ev) => {
      row.style.top = `${box.top + ev.clientY - py}px`;
      to = others.length;
      for (let i = 0; i < others.length; i++) { const r = others[i].getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { to = i; break; } }
      if (to < others.length) others[to].before(gap); else others.at(-1)?.after(gap);
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      document.body.classList.remove('kz-dragging'); gap.remove(); row.removeAttribute('style'); row.classList.remove('is-lift');
      const ids = others.map((one) => one.dataset.id); ids.splice(to, 0, id);
      const before = [...blocks].reverse().map((b) => b.id).join();
      if (ids.join() !== before) onReorder(ids.reverse());
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };
  return <ul className="kz-layer-list kz-ed-layers" ref={list}>
    {[...blocks].reverse().map((block) => {
      const off = block.opacity === 0, still = locked.has(block.id);
      return <li key={block.id} data-id={block.id} className={`kz-layer${selected === block.id ? ' is-sel' : ''}${off ? ' is-hidden' : ''}`} onClick={() => onSelect(block.id)}
        tabIndex={0} aria-current={selected === block.id || undefined} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(block.id); } }}>
        <span className="kz-grip" title={t('Перетащи, чтобы поменять порядок')} onPointerDown={(event) => grab(event, block.id)}/>
        <span className="kz-row-ico"><Icon name={block.type === 'shape' ? 'rect' : BLOCK_TYPES[block.type].icon} size={14}/></span>
        {renaming === block.id ? <input className="kz-layer-rename" autoFocus defaultValue={blockName(block, names)} maxLength={40} aria-label={t('Название слоя')} onClick={(event) => event.stopPropagation()}
          onBlur={(event) => { onName(block.id, event.target.value === blockName(block, {}) ? '' : event.target.value); onRename(null); }}
          onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.currentTarget.value = blockName(block, names); event.currentTarget.blur(); } }}/>
          : <span className="kz-layer-name" title={t('Двойной клик — переименовать')} onDoubleClick={(event) => { event.stopPropagation(); onRename(block.id); }}>{blockName(block, names)}{block.anim !== 'none' && <small>{ANIM_TAGS()[block.anim]}</small>}</span>}
        <button type="button" className={`kz-act${still ? ' is-on' : ''}`} title={still ? t('Открепить') : t('Закрепить')} aria-label={still ? t('Открепить') : t('Закрепить')} onClick={(event) => { event.stopPropagation(); onTool('lock', block.id); }}><Icon name={still ? 'lock' : 'unlock'} size={14}/></button>
        <button type="button" className={`kz-act${off ? ' is-on' : ''}`} title={off ? t('Показать') : t('Скрыть')} aria-label={off ? t('Показать') : t('Скрыть')} onClick={(event) => { event.stopPropagation(); onTool('hide', block.id); }}><Icon name={off ? 'eyeOff' : 'eye'} size={14}/></button>
      </li>;
    })}
    {!blocks.length && <li className="kz-layer is-fixed"><span className="kz-layer-name is-muted">{t('Блоков пока нет — перетащи из «Блоков» выше')}</span></li>}
  </ul>;
}
