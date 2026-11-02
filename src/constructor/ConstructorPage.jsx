import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brand, Icon, Modal, Notice } from '../catalog/Common.jsx';
import { t } from '../../scripts/i18n.mjs';
import { track } from '../site-stats.js';
import { CATALOG_PATH, GUIDES_PATH, STUDIO_PATH } from '../catalog/api.js';
import { AccountButton } from '../catalog/Account.jsx';
import LanguageSwitch from '../LanguageSwitch.jsx';
import { WIDGET_LIMITS, WIDGET_TYPES, cleanDesign, designWidget } from '../../scripts/menu-widgets.mjs';
import { getWidgets, setWidgets, useWidgets } from '../customize/widget-store.js';
import { DESIGN_LIMIT, deleteDesign, getDesigns, saveDesign, useDesigns } from '../customize/widget-designs.js';
import { keepMedia } from '../customize/look-store.js';
import { useCustomize } from '../customize/useCustomize.js';
import { ASPECT_ORDER, Install, Receipt } from '../customize/CustomizePage.jsx';
import { MenuScreen, MenuWindows } from '../customize/MenuBackground.jsx';
import { MatchScreen } from '../customize/InterfaceBuilder.jsx';
import { FontScreen } from '../customize/FontPicker.jsx';
import { PortraitPreview } from '../customize/portrait-preview.js';
import { LookBar, LookNotice } from '../customize/LookBar.jsx';
import { SEASON_EVENT } from '../customize/background-pack.js';
import { Segmented, sizeText } from '../customize/ui.jsx';
import { BY_HAND, SYSTEM, SYSTEM_NAMES } from '../system.js';
import Board from './Board.jsx';
import WidgetEditor, { blankDesign, clearDraft, readDraft } from './WidgetEditor.jsx';
import WidgetInspector from './WidgetInspector.jsx';
import { freshWidget, rememberMediaURL, widgetName } from './WidgetView.jsx';
import { Head, InspectorShell, ModuleBody, SLOTS, SceneBody, SlotBody, moduleSub } from './Inspector.jsx';
import { CATEGORY_MODULES, Dock, Shelf } from './Shelf.jsx';
import { countUse, takeDesignFiles } from './workshop.js';
import { autoAnchor, fitRect, freePlace, overlap, placeOf, rectOf, screenOf, valveLines, valveZones } from './geometry.js';
import './constructor.css';

// «Конструктор» (2026-10-31, the owner picked the mockup's variant B: «Вариант B нравится куда больше. Пока
// делай его и работай с ним»): the same «Оформление Dota» as /customize (useCustomize.js — every module, the
// one file, «Студия»), laid out as an editor: Dota's screen fills the window, the library is a dock with a
// shelf at the bottom, the inspector floats next to what is selected, the layers and what goes into the file
// fold into the corners. New here: widgets on the main menu (scripts/menu-widgets.mjs, widget-store.js) —
// dragged in from the shelf, moved, resized, stuck to edges and Valve's columns, with undo. Opens with
// on a computer by default (CustomizeApp.jsx; ?app=a, phones and narrow windows get the page).
// «Редактор виджета» (WidgetEditor.jsx) is a full-screen mode of it, ?widget=<designId|new>: a widget of
// one's own made of blocks, opened from the shelf («Создать свой виджет», «Мои виджеты») or from a placed one.
const PREFS = 'gridstudio.constructor';
const readPrefs = () => { try { return { zones: false, snap: true, layers: false, fold: { scene: true, widget: false, module: false, slot: false }, locked: [], ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch { return { zones: false, snap: true, layers: false, fold: { scene: true }, locked: [] }; } };
const ASPECTS = () => ({ '16:9': t('обычный монитор'), '16:10': t('ноутбуки, MacBook'), '21:9': t('широкий монитор'), '4:3': t('растянутое 4:3') });
const ZONE_LABELS = () => ({ topbar: t('Верхняя панель'), friends: t('Друзья и группа'), news: t('Новости'), chat: t('Чат'), play: t('Играть'),
  '@edge': t('край экрана'), '@centre': t('центр'), '@friends': t('край друзей'), '@news': t('колонка новостей'), '@newsEdge': t('край новостей'), '@chat': t('край чата'),
  '@topbar': t('под верхней панелью'), '@columns': t('верх колонок'), '@newsEnd': t('низ новостей'), '@play': t('над «Играть»'), '@party': t('над группой') });
// The drag in progress, for what follows it without the whole page drawing again (the inspector's numbers).
function liveStore() {
  let value = null;
  const listeners = new Set();
  return { get: () => value, set: (next) => { value = next; for (const listener of listeners) listener(); }, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } };
}
const newId = () => `w${Math.random().toString(36).slice(2, 9)}`;
// The editor an address opens (?widget=new or a design of «Мои виджеты»; a reload brings back its draft).
function editorFromURL(want) {
  if (!want) return null;
  if (want === 'new') return { key: 'new', design: blankDesign(), from: readDraft()?.key === 'new' ? readDraft().from : null, restore: true, n: 1 };
  const found = getDesigns().find((item) => item.id === want), draft = readDraft();
  if (found) return { key: want, design: found.design, from: null, restore: true, n: 1 };
  if (draft?.key === want) return { key: want, design: draft.design, from: draft.from ?? null, restore: true, n: 1 };
  return null;
}
const editorURL = (key) => { const url = new URL(location.href); if (key) url.searchParams.set('widget', key); else url.searchParams.delete('widget'); return url; };

export default function ConstructorPage({ preset, studioItem, onRemove, replace, notice = null, onNotice = () => {}, openError = '' }) {
  const query = useMemo(() => new URLSearchParams(location.search), []);
  const named = ['part', 'tab', 'page'].some((key) => query.has(key)) || !!preset || !!studioItem;
  const page = useCustomize({ preset, studioItem, onRemove, replace, notice, onNotice, first: named ? undefined : '' });
  const { MODS, find, open, setOpen, scene, setScene, menuPage, bg, ui, font, d2, pt, looks, states, rows, files, total, estimate, titles } = page;
  const [widgets] = useWidgets();
  const designs = useDesigns();
  // «Редактор виджета»: { key: designId | 'new', design, from: the menu widget it was opened from, restore, n }.
  const [editing, setEditing] = useState(() => editorFromURL(query.get('widget')));
  const editorControl = useRef(null), leavingEditor = useRef(false);
  const [selection, setSelection] = useState(null), [slotTab, setSlotTab] = useState('');
  const [shelf, setShelf] = useState(''), [search, setSearch] = useState('');
  // The shelf «Виджеты»: one's own and the ready ones, or «Мастерская виджетов» (WorkshopShelf.jsx).
  const [widgetTab, setWidgetTab] = useState(() => { try { return sessionStorage.getItem('gridstudio.widget-shelf') === 'workshop' ? 'workshop' : 'library'; } catch { return 'library'; } });
  const showWidgetTab = (tab) => { setWidgetTab(tab); try { sessionStorage.setItem('gridstudio.widget-shelf', tab); } catch { /* This visit only. */ } };
  const [zoom, setZoom] = useState(0), [scale, setScale] = useState(0), [layout, setLayout] = useState(0);
  const [prefs, setPrefs] = useState(readPrefs), [summaryOpen, setSummaryOpen] = useState(false), [building, setBuilding] = useState(false), [docOpen, setDocOpen] = useState(false), [ratioOpen, setRatioOpen] = useState(false);
  const [toast, setToast] = useState(null), [, setTick] = useState(0);
  const board = useRef(null), live = useMemo(liveStore, []);
  useEffect(() => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* This visit only. */ } }, [prefs]);
  const locked = useMemo(() => new Set(prefs.locked), [prefs.locked]);
  const pref = (patch) => setPrefs((value) => ({ ...value, ...patch }));

  // ——— The screen ———
  const onMenu = scene === 'menu';
  const dims = useMemo(() => (['menu', 'grid', 'hero', 'loading'].includes(scene) ? screenOf(bg.aspect) : { W: 1920, H: 1080 }), [scene, bg.aspect]);
  const zones = useMemo(() => (onMenu ? valveZones(dims, { carnival: bg.carnival, season: bg.seasonCard, event: !!(SEASON_EVENT && bg.file && bg.seasonButton), valve: bg.valve }) : []), [onMenu, dims, bg.carnival, bg.seasonCard, bg.file, bg.seasonButton, bg.valve]);
  // Valve's panels that move (menu-background.mjs menuValve: the chat, the friends rail with the party bar, the news column) are
  // dragged on the screen by their shift: from where they were.
  const dragFrom = useRef(null);
  const slotDrag = (id, dx, dy, done) => {
    if (!['chat', 'friends', 'news'].includes(id)) return false;
    if (!dragFrom.current) dragFrom.current = { ...bg.valve[id] };
    const from = dragFrom.current;
    bg.setValve((value) => ({ ...value, [id]: { x: Math.round(from.x + dx), y: Math.round(from.y + dy) } }));
    if (done) { dragFrom.current = null; if (dx || dy) track('customize.valve', { part: id }); }
    return true;
  };
  const lines = useMemo(() => (onMenu ? valveLines(dims, zones) : { x: [], y: [] }), [onMenu, dims, zones]);
  // The main menu's screen, for a widget dropped while another scene was shown (the drop comes after it switched).
  const menuDims = useRef(dims); menuDims.current = screenOf(bg.aspect);
  const shownWidgets = onMenu ? widgets : [];
  const selected = selection?.kind === 'widget' ? widgets.find((w) => w.id === selection.id) || null : null;
  const slot = selection?.kind === 'slot' && onMenu ? selection.id : null;
  // Leaving the main menu leaves its selection; a widget gone (undo, another tab) is not selected.
  useEffect(() => { if (!onMenu && selection) setSelection(null); }, [onMenu]);
  useEffect(() => { if (selection?.kind === 'widget' && !selected) setSelection(null); }, [selected, selection]);

  // ——— Undo and redo of the widgets ———
  const history = useRef({ stack: [getWidgets()], at: 0, key: '', time: 0 });
  const record = (list, key) => {
    const h = history.current, at = Date.now();
    if (key && h.key === key && at - h.time < 1500 && h.at === h.stack.length - 1) h.stack[h.at] = list;
    else { h.stack = [...h.stack.slice(0, h.at + 1), list].slice(-120); h.at = h.stack.length - 1; }
    h.key = key || ''; h.time = at; setTick((n) => n + 1);
  };
  // Every change of the widgets: kept (cleaned, widget-store.js) and in the history (`key`: changes of the same
  // field one after another count as one step).
  const apply = (next, key = '') => {
    const before = getWidgets(), list = setWidgets(next);
    if (list !== before) record(list, key);
    return list;
  };
  const undo = () => { const h = history.current; if (h.at <= 0) return; h.at -= 1; h.key = ''; setWidgets(h.stack[h.at]); setTick((n) => n + 1); say(t('Отменено')); };
  const redo = () => { const h = history.current; if (h.at >= h.stack.length - 1) return; h.at += 1; h.key = ''; setWidgets(h.stack[h.at]); setTick((n) => n + 1); say(t('Повторено')); };
  const canUndo = history.current.at > 0, canRedo = history.current.at < history.current.stack.length - 1;

  const timer = useRef(0);
  const say = (text, undoable = false) => { clearTimeout(timer.current); setToast({ text, undoable, at: Date.now() }); timer.current = setTimeout(() => setToast(null), 3400); };
  useEffect(() => () => clearTimeout(timer.current), []);

  // ——— Widgets ———
  const patchWidget = (id, patch, key) => apply((list) => list.map((w) => (w.id === id ? { ...w, ...(typeof patch === 'function' ? patch(w) : patch) } : w)), key);
  // `made`: the widget to add (a type's fresh one by default; a design's: designWidget).
  function addWidget(type, rect = null, anchor = null, made = freshWidget(type)) {
    if (getWidgets().length >= WIDGET_LIMITS.count) { say(t('Виджетов уже {count} — больше в меню не поместить.', { count: WIDGET_LIMITS.count })); return null; }
    const w = made.w, h = made.h, n = getWidgets().length % 6, d = menuDims.current;
    const at = rect || { x: Math.round(d.W / 2 - w / 2 + n * 24), y: Math.round(d.H / 2 - h / 2 + n * 24), w, h };
    const fit = fitRect(at, anchor || autoAnchor(at, d), d);
    const widget = { ...made, id: newId(), ...placeOf(fit.rect, fit.anchor, d), anchor: fit.anchor };
    const list = apply((now) => [...now, widget]);
    const added = list.find((one) => one.id === widget.id) || list.at(-1);
    if (scene !== 'menu') setScene('menu');
    setOpen('');
    setSelection({ kind: 'widget', id: added.id });
    track('customize.widget', { action: 'add', type });
    say(t('Добавлено: {name}', { name: widgetName(added) }), true);
    return added;
  }
  const addDesign = (item, rect = null, anchor = null) => addWidget('custom', rect, anchor, designWidget(item.design, { designId: item.id }));
  function tool(act, id) {
    const list = getWidgets(), index = list.findIndex((w) => w.id === id), widget = list[index];
    if (!widget) return;
    if (act === 'dup') {
      if (list.length >= WIDGET_LIMITS.count) { say(t('Виджетов уже {count} — больше в меню не поместить.', { count: WIDGET_LIMITS.count })); return; }
      const copy = { ...structuredClone(widget), id: newId(), x: widget.x + 24, y: widget.y + 24 };
      apply([...list.slice(0, index + 1), copy, ...list.slice(index + 1)]);
      setSelection({ kind: 'widget', id: copy.id }); say(t('Дублировано: {name}', { name: widgetName(widget) }), true);
    }
    if (act === 'up' && index < list.length - 1) apply([...list.slice(0, index), list[index + 1], widget, ...list.slice(index + 2)]);
    if (act === 'down' && index > 0) apply([...list.slice(0, index - 1), widget, list[index - 1], ...list.slice(index + 1)]);
    if (act === 'lock') pref({ locked: locked.has(id) ? prefs.locked.filter((one) => one !== id) : [...prefs.locked, id] });
    if (act === 'hide') apply(list.map((w) => (w.id === id ? { ...w, hidden: !w.hidden } : w)));
    if (act === 'delete') {
      apply(list.filter((w) => w.id !== id)); setSelection(null);
      track('customize.widget', { action: 'delete', type: widget.type });
      say(t('Удалено: {name}', { name: widgetName(widget) }), true);
    }
  }
  const commitRect = (id, rect, anchor) => { const place = placeOf(rect, anchor, dims); patchWidget(id, { ...place, anchor }); };
  const setRect = (widget, rect) => {
    const fit = fitRect({ ...rect, w: Math.max(1, rect.w), h: Math.max(1, rect.h) }, widget.anchor, dims);
    patchWidget(widget.id, { ...placeOf(fit.rect, fit.anchor, dims), anchor: fit.anchor }, `geo:${widget.id}`);
  };
  const setAnchor = (widget, anchor) => { const rect = rectOf(widget, dims); patchWidget(widget.id, { ...placeOf(rect, anchor, dims), anchor }); };
  const fixOverlap = (widget) => {
    const place = freePlace(rectOf(widget, dims), zones, dims);
    if (!place) { say(t('Свободного места рядом нет — уменьши виджет.')); return; }
    const fit = fitRect(place, widget.anchor, dims);
    patchWidget(widget.id, { ...placeOf(fit.rect, fit.anchor, dims), anchor: fit.anchor });
    say(t('Подвинули: теперь ничего не закрывает.'), true);
  };
  // A picture or video for a widget: kept in this browser by its hash (look-store.js); a picture's shape
  // is taken by the widget (its width stays). → '' or what went wrong.
  async function setMedia(widget, file) {
    const hash = await keepMedia(file);
    if (!hash) return t('Браузеру не хватило места для файла. Освободи место или выбери файл поменьше.');
    rememberMediaURL(hash, file);
    let shape = null;
    if (widget.type === 'image') shape = await createImageBitmap(file).then((bitmap) => { const ratio = bitmap.height / bitmap.width; bitmap.close(); return ratio; }).catch(() => null);
    patchWidget(widget.id, (w) => ({ props: { ...w.props, media: hash }, ...(shape ? { h: Math.max(WIDGET_TYPES.image.min[1], Math.min(1023, Math.round(w.w * shape))) } : {}) }));
    track('customize.widget', { action: 'media', type: widget.type });
    return '';
  }

  // ——— «Редактор виджета» ———
  // Opened for a design of «Мои виджеты» (`id`), a new one, or a placed widget (`from`: its design, or a copy
  // of it when it is not in this browser's library). The address names it, so a reload keeps it.
  function openEditor({ id = null, from = null } = {}) {
    const widget = from ? getWidgets().find((w) => w.id === from && w.type === 'custom') : null, designId = id || widget?.props.designId || '';
    const found = designId ? getDesigns().find((item) => item.id === designId) : null;
    const key = found ? found.id : 'new', design = found ? found.design : widget ? widget.props.design : blankDesign();
    clearDraft();
    setShelf(''); setSelection(widget ? { kind: 'widget', id: widget.id } : selection);
    if (scene !== 'menu') setScene('menu');
    setEditing({ key, design, from: widget?.id || null, restore: false, n: (editing?.n || 0) + 1 });
    window.history.pushState({ ...(window.history.state || {}), kzWidget: key, kzPushed: true }, '', editorURL(key));
  }
  function closeEditor() {
    clearDraft(); setEditing(null);
    // Back to the constructor's own entry when the editor was opened here (not by an address or a reload of one).
    if (window.history.state?.kzPushed) { leavingEditor.current = true; window.history.back(); }
    else window.history.replaceState(window.history.state, '', editorURL(null));
  }
  const editingRef = useRef(editing); editingRef.current = editing;
  // The browser's Back closes the editor (with unsaved changes, it asks first); Forward opens it again.
  useEffect(() => {
    const pop = () => {
      const want = new URLSearchParams(location.search).get('widget');
      if (leavingEditor.current) { leavingEditor.current = false; return; }
      if (!want && editingRef.current) {
        if (editorControl.current?.dirty()) { window.history.pushState({ ...(window.history.state || {}), kzWidget: editingRef.current.key, kzPushed: true }, '', editorURL(editingRef.current.key)); editorControl.current.ask(); return; }
        clearDraft(); setEditing(null);
      } else if (want && !editingRef.current) setEditing(editorFromURL(want));
    };
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
  }, []);
  // An address naming a design this browser does not have: the constructor, without it.
  useEffect(() => { if (query.get('widget') && !editing) window.history.replaceState(window.history.state, '', editorURL(null)); }, []);
  // The undo history keeps the menu's copies of a design current (an undo never brings back an old copy).
  const followDesign = (id, design) => {
    const h = history.current, fix = (list) => list.map((w) => (w.type === 'custom' && w.props.designId === id ? { ...w, props: { ...w.props, design } } : w));
    h.stack = h.stack.map(fix);
  };
  // «Сохранить»: into «Мои виджеты» (every menu widget made of it follows); a widget opened from the menu whose
  // design was not in the library now names the saved one. → the design's id.
  function saveFromEditor(design, key, from) {
    const id = saveDesign(design, key === 'new' ? null : key), clean = cleanDesign(design);
    if (from) setWidgets((list) => list.map((w) => (w.id === from && w.type === 'custom' && w.props.designId !== id ? { ...w, props: { ...w.props, designId: id, design: clean } } : w)));
    followDesign(id, clean);
    const h = history.current; h.stack[h.at] = getWidgets(); setTick((n) => n + 1);
    return id;
  }
  // «Добавить в меню»: the design on the menu (or, when it is there already, that widget), selected. → '' or why not.
  function addFromEditor(design, id) {
    const there = getWidgets().find((w) => w.type === 'custom' && w.props.designId === id);
    if (there) { closeEditor(); setScene('menu'); setOpen(''); setSelection({ kind: 'widget', id: there.id }); say(t('В меню: {name}', { name: widgetName(there) })); return ''; }
    if (getWidgets().length >= WIDGET_LIMITS.count) return t('Виджетов уже {count} — больше в меню не поместить.', { count: WIDGET_LIMITS.count });
    closeEditor();
    addDesign({ id, design });
    return '';
  }
  // How many menu widgets are made of a design (or are the one it was opened from).
  const designsInMenu = (id, from = null) => widgets.filter((w) => w.type === 'custom' && ((id && id !== 'new' && w.props.designId === id) || (from && w.id === from))).length;
  // Where the design stands on the menu («На фоне меню»): its widget, else where «Добавить в меню» puts it.
  const designPlace = (design, key, from) => {
    const d = screenOf(bg.aspect), list = getWidgets();
    const widget = list.find((w) => w.id === from && w.type === 'custom') || (key !== 'new' && list.find((w) => w.type === 'custom' && w.props.designId === key));
    if (widget) return rectOf(widget, d);
    const [w, h] = design.size;
    return { x: Math.round(d.W / 2 - w / 2), y: Math.round(d.H / 2 - h / 2), w, h };
  };
  const [removingDesign, setRemovingDesign] = useState(null);

  // ——— «Мастерская виджетов» (workshop.js) ———
  // «В меню» (or a drag, or a click on its picture): its files into this browser first, then the widget on the
  // menu like a design of one's own (not in «Мои виджеты» until saved from the editor); counted on the server.
  async function addFromWorkshop(card, rect = null, anchor = null) {
    if (getWidgets().length >= WIDGET_LIMITS.count) { say(t('Виджетов уже {count} — больше в меню не поместить.', { count: WIDGET_LIMITS.count })); return; }
    const slow = setTimeout(() => say(t('Загружаем «{name}»…', { name: card.name })), 250);
    try { await takeDesignFiles(card.design); } catch (error) { clearTimeout(slow); say(error.message); return; }
    clearTimeout(slow);
    if (getWidgets().length >= WIDGET_LIMITS.count) { say(t('Виджетов уже {count} — больше в меню не поместить.', { count: WIDGET_LIMITS.count })); return; }
    if (addWidget('custom', rect, anchor, designWidget(card.design))) countUse(card.id);
  }
  const pickWorkshopWidget = (event, card) => {
    board.current?.paletteDrag(event, { kind: 'widget', widget: designWidget(card.design),
      start: () => { takeDesignFiles(card.design).catch(() => {}); if (scene !== 'menu') { setSelection(null); setScene('menu'); } },
      drop: (rect, anchor) => addFromWorkshop(card, rect, anchor), click: () => addFromWorkshop(card) });
  };
  // «В мои»: a copy in «Мои виджеты» (its files into this browser first), to change in the editor.
  async function saveFromWorkshop(card) {
    const clean = JSON.stringify(cleanDesign(card.design));
    if (getDesigns().some((item) => JSON.stringify(item.design) === clean)) { say(t('Уже в «Моих виджетах»: {name}', { name: card.name })); return; }
    if (getDesigns().length >= DESIGN_LIMIT) { say(t('В «Моих виджетах» уже {count} виджетов — удали ненужные.', { count: DESIGN_LIMIT })); return; }
    try { await takeDesignFiles(card.design); } catch (error) { say(error.message); return; }
    saveDesign(card.design);
    say(t('Сохранено в «Мои виджеты»: {name}', { name: card.name }));
  }
  // From the editor's «Опубликовать» window: the shelf's workshop.
  const openWorkshop = () => { closeEditor(); showWidgetTab('workshop'); setShelf('widgets'); };

  // ——— Sections and Valve's panels ———
  function openModule(id) {
    setSelection(null); setOpen(id);
    const module = find(id);
    if (module) { setScene(module.scene); track('customize.section', { section: id }); }
    pref({ fold: { ...prefs.fold, module: false } });
  }
  const selectSlot = (id) => { setOpen(''); setSelection({ kind: 'slot', id }); setSlotTab(SLOTS()[id].modules[0] || ''); };
  const select = (next) => {
    if (next?.kind === 'slot') return selectSlot(next.id);
    if (next) setOpen('');
    setSelection(next);
  };
  const chooseScene = (id) => { if (id === scene) return; setSelection(null); if (open && find(open)?.scene !== id) setOpen(''); page.chooseScene(id); };
  // The section the inspector shows (the chat's handle and «Тексты» load by it, as on the page).
  const shownModule = slot ? slotTab : selection ? '' : open;
  // Framing the background by dragging it: only while its section is open, so a click on the screen never moves it.
  const framing = ['bg', 'grid', 'hero', 'loading'].includes(shownModule) && find(shownModule)?.scene === scene;
  const screenBg = framing ? bg : { ...bg, frameTarget: null, frameDown: () => {} };

  // ——— Dragging in from the shelf ———
  const pickWidget = (event, type) => {
    const def = WIDGET_TYPES[type], [w, h] = def.size;
    board.current?.paletteDrag(event, { kind: 'widget', widget: { ...freshWidget(type), w, h },
      start: () => { if (scene !== 'menu') { setSelection(null); setScene('menu'); } },
      drop: (rect, anchor) => addWidget(type, rect, anchor), click: () => addWidget(type) });
  };
  // A design of «Мои виджеты» dragged onto the screen (or clicked: into the middle).
  const pickDesign = (event, item) => {
    const made = designWidget(item.design, { designId: item.id });
    board.current?.paletteDrag(event, { kind: 'widget', widget: made,
      start: () => { if (scene !== 'menu') { setSelection(null); setScene('menu'); } },
      drop: (rect, anchor) => addDesign(item, rect, anchor), click: () => addDesign(item) });
  };
  const pickWorkshop = (event, item) => {
    const use = () => { track('customize.preset', { section: 'bg', preset: `workshop:${item.id}` }); bg.setPick(item); openModule('bg'); say(t('Фон меню: «{title}». Загружаем…', { title: item.title })); };
    board.current?.paletteDrag(event, { kind: 'apply', label: t('Отпусти — фон «{title}»', { title: item.title }), start: () => { if (scene !== 'menu') setScene('menu'); }, drop: use, click: use });
  };
  const pickMod = (mod) => {
    const on = d2.choice[mod.section]?.[mod.slot] === mod.id;
    if (!on) { track('customize.mod', { section: mod.section, mod: mod.id }); d2.set(mod.section, mod.slot, mod.id); }
    openModule(mod.section);
    if (!on) say(t('«{name}» — в сборке.', { name: mod.label || mod.name }), false);
  };

  // ——— Keyboard ———
  const keys = useRef(null);
  keys.current = (event) => {
    if (editing) return;   // the editor has keys of its own
    const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]'), dialog = document.querySelector('dialog[open]');
    if (dialog) return;
    const mod = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
    if (mod && key === 'z' && !typing) { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
    if (mod && key === 'y' && !typing) { event.preventDefault(); redo(); return; }
    if (event.key === 'Escape') {
      if (docOpen || ratioOpen) { setDocOpen(false); setRatioOpen(false); return; }
      if (shelf) { setShelf(''); return; }
      if (summaryOpen) { setSummaryOpen(false); return; }
      if (!typing) { setSelection(null); setOpen(''); }
      return;
    }
    if (typing || !selected) return;
    if (event.key === 'Enter' && selected.type === 'custom') { event.preventDefault(); openEditor({ from: selected.id }); return; }
    if (mod && key === 'd') { event.preventDefault(); tool('dup', selected.id); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); tool('delete', selected.id); return; }
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (step && !locked.has(selected.id)) {
      event.preventDefault();
      const by = event.shiftKey ? 10 : 1, rect = rectOf(selected, dims);
      setRect(selected, { ...rect, x: rect.x + step[0] * by, y: rect.y + step[1] * by });
    }
  };
  useEffect(() => { const down = (event) => keys.current(event); addEventListener('keydown', down); return () => removeEventListener('keydown', down); }, []);
  // A popover closes with a press anywhere else (not in a window it opened: «Сохранить в Студию»).
  useEffect(() => {
    if (!docOpen && !ratioOpen) return undefined;
    const away = (event) => { if (!event.target.closest?.('.kz-pop, .kz-pop-toggle, dialog')) { setDocOpen(false); setRatioOpen(false); } };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [docOpen, ratioOpen]);
  // The shelf closes with a press anywhere but on it, the dock, the inspector (the shelf's sections open there)
  // and the windows they open. The press still does what it does there (selects a widget, say).
  useEffect(() => {
    if (!shelf) return undefined;
    const away = (event) => { if (!event.target.closest?.('.kz-shelf, .kz-dock, .kz-insp, .kz-toast, dialog')) setShelf(''); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [shelf]);

  // ——— What goes into the file ———
  // The widgets go into the menu's pak02 (MenuBackground.jsx counts them there, scripts/menu-widgets.mjs).
  const widgetPart = page.bg.sizes.parts.widgets, widgetBytes = widgets.length ? widgetPart?.bytes || 0 : 0;
  const widgetRow = widgets.length ? { id: 'widgets', icon: 'groupPlus', title: t('Виджеты: {count}', { count: widgets.length }), line: widgets.slice(-3).reverse().map(widgetName).join(', ') + (widgets.length > 3 ? '…' : ''),
    state: 'changed', bytes: widgetBytes, estimate: !!widgetPart?.estimate, note: t('в паке меню') } : null;
  const sum = total, sumEstimate = estimate;
  const buildRows = widgetRow ? [widgetRow, ...rows] : rows;
  const partsCount = buildRows.length;
  const canBuild = titles.length > 0 || widgets.length > 0;
  async function build() {
    const done = await page.download();
    if (done) setBuilding(false);
    else if (done === null) setBuildNote(t('Пока нечего собирать: всё как в Dota.'));
  }
  const [buildNote, setBuildNote] = useState('');
  const openBuild = () => { page.setError(''); setBuildNote(''); setBuilding(true); track('customize.build-open'); };

  // ——— The inspector ———
  const kind = selected ? 'widget' : slot ? 'slot' : open ? 'module' : 'scene';
  const folded = !!prefs.fold?.[kind];
  const fold = () => pref({ fold: { ...prefs.fold, [kind]: !folded } });
  const selRect = selected ? rectOf(selected, dims) : slot ? zones.find((zone) => zone.id === slot) : null;
  const covers = selected && onMenu ? zones.filter((zone) => overlap(rectOf(selected, dims), zone)).map((zone) => ZONE_LABELS()[zone.id]) : [];
  let head, body;
  if (selected) {
    const def = WIDGET_TYPES[selected.type];
    head = <Head icon={def.icon} title={widgetName(selected)} sub={`${t('Виджет')} · ${t(def.title)}${locked.has(selected.id) ? ` · ${t('закреплён')}` : ''}`}/>;
    body = <WidgetInspector widget={{ ...selected, rect: rectOf(selected, dims) }} live={live} locked={locked.has(selected.id)} covers={covers}
      onRect={(rect) => setRect(selected, rect)} onAnchor={(anchor) => setAnchor(selected, anchor)} onDone={() => { history.current.key = ''; }}
      onProps={(patch, key) => patchWidget(selected.id, (w) => ({ props: { ...w.props, ...patch } }), key ? `props:${selected.id}:${key}` : '')}
      onWidget={(patch, key) => patchWidget(selected.id, patch, key ? `w:${selected.id}:${key}` : '')}
      onMedia={(file) => setMedia(selected, file)} onFix={() => fixOverlap(selected)} onTool={(act) => tool(act, selected.id)}
      onEdit={() => openEditor({ from: selected.id })} inLibrary={selected.type === 'custom' && designs.some((item) => item.id === selected.props.designId)}/>;
  } else if (slot) {
    const def = SLOTS()[slot];
    head = <Head icon={def.icon} title={def.title} sub={slot === 'topbar' || slot === 'play' ? t('Панель Valve · двигать нельзя, можно настроить') : t('Панель Valve · тяни, чтобы сдвинуть')} tone="zone"/>;
    body = <SlotBody page={page} slot={slot} tab={slotTab} onTab={setSlotTab} onModule={openModule}/>;
  } else if (open && find(open)) {
    const module = find(open);
    head = <><Head icon={module.icon} title={module.title} sub={moduleSub(page, open)}/>
      <button type="button" className="kz-iconbtn kz-close" title={t('Закрыть')} aria-label={t('Закрыть')} onClick={() => setOpen('')}><Icon name="close" size={16}/></button></>;
    body = <ModuleBody page={page} id={open}/>;
  } else {
    const title = { menu: t('Главное меню'), grid: t('Сетка героев'), hero: t('За героем'), loading: t('Загрузка'), match: t('Матч'), font: t('Шрифт') }[scene];
    head = <Head icon="expand" title={title} sub={`${t('Сцена')} · ${['menu', 'grid', 'hero', 'loading'].includes(scene) ? bg.aspect : '16:9'} · ${dims.W} × ${dims.H}`}/>;
    body = <SceneBody page={page} onModule={openModule} onSlot={selectSlot} zones={prefs.zones} onZones={(value) => pref({ zones: value })} snap={prefs.snap} onSnap={(value) => pref({ snap: value })} widgetsCount={widgets.length}/>;
  }

  const toolbar = (sel) => {
    if (sel?.kind === 'slot') {
      if (sel.id === 'news') return <button type="button" onClick={() => { const show = !bg.carnival && !bg.seasonCard; bg.setCarnival(show); bg.setSeasonCard(show); say(show ? t('Новости снова на месте.') : t('Новости скрыты — колонка свободна для виджетов.')); }}>
        <Icon name={bg.carnival || bg.seasonCard ? 'eyeOff' : 'eye'} size={15}/>{bg.carnival || bg.seasonCard ? t('Скрыть новости') : t('Показать новости')}</button>;
      if (sel.id === 'topbar' || sel.id === 'play') return <button type="button" onClick={() => { setShelf('search'); setSearch(find('menuparts').title); }}><Icon name="zap" size={15}/>{t('Моды d2pfx')}</button>;
      return null;
    }
    const widget = sel && widgets.find((w) => w.id === sel.id);
    if (!widget) return null;
    const isLocked = locked.has(widget.id);
    return <>
      {widget.type === 'custom' && <><button type="button" title={t('Изменить в редакторе (Enter)')} onClick={() => openEditor({ from: widget.id })}><Icon name="edit" size={15}/>{t('Изменить')}</button><i className="kz-sep"/></>}
      <button type="button" title={t('Дублировать (Ctrl+D)')} aria-label={t('Дублировать')} onClick={() => tool('dup', widget.id)}><Icon name="copy" size={15}/></button>
      <button type="button" title={t('Слой выше')} aria-label={t('Слой выше')} onClick={() => tool('up', widget.id)}><Icon name="chevronUp" size={15}/></button>
      <button type="button" title={t('Слой ниже')} aria-label={t('Слой ниже')} onClick={() => tool('down', widget.id)}><Icon name="chevron" size={15}/></button>
      <i className="kz-sep"/>
      <button type="button" title={isLocked ? t('Открепить') : t('Закрепить')} aria-label={isLocked ? t('Открепить') : t('Закрепить')} aria-pressed={isLocked} onClick={() => tool('lock', widget.id)}><Icon name={isLocked ? 'lock' : 'unlock'} size={15}/></button>
      <button type="button" className="is-danger" title={t('Удалить (Delete)')} aria-label={t('Удалить')} onClick={() => tool('delete', widget.id)}><Icon name="trash" size={15}/></button>
    </>;
  };

  // ——— The scene on the screen ———
  const screen = <PortraitPreview.Provider value={pt.preview}>
    {scene === 'match' ? <MatchScreen ui={ui} chat={shownModule === 'chat'} onFrame={page.setHudThumb} mods={d2.hudMods}/> : scene === 'font' ? <FontScreen font={font}/> : <MenuScreen bg={screenBg} page={menuPage} mods={d2.menuLook}/>}
  </PortraitPreview.Provider>;
  const fontStyle = { '--kz-wfont': font.changed && font.roles?.Radiance && font.previewFamily ? `'${font.previewFamily}', KzRadiance, sans-serif` : 'KzRadiance, sans-serif' };
  const drop = shownModule === 'portraits' && pt.active ? pt.drop : scene !== 'match' && scene !== 'font' ? bg.drop : {};
  const sceneCount = (id) => MODS.filter((module) => module.scene === id && states[module.id] === 'changed').length + (id === 'menu' ? widgets.length : 0);
  const docName = looks.link?.name || t('Моё меню');
  // The main menu with Dota's own background: how to put one there.
  const hint = onMenu && !bg.file && !bg.fetching && !bg.wanted && open !== 'bg' ? <><Icon name="image" size={15}/><span>{t('Фон как в Dota. Перетащи сюда картинку, GIF или видео')}</span>
    <button type="button" className="kz-ghostbtn" onClick={() => openModule('bg')}>{t('Выбрать фон')}</button></> : null;
  const onLayout = useCallback(() => setLayout((n) => n + 1), []);

  if (editing) {
    // The editor in place of the constructor; the main menu as it is now, for «На фоне меню».
    const menuNode = <PortraitPreview.Provider value={pt.preview}><MenuScreen bg={{ ...bg, frameTarget: null, frameDown: () => {} }} page="menu" mods={d2.menuLook}/></PortraitPreview.Provider>;
    return <WidgetEditor key={editing.n} start={editing} menu={{ node: menuNode, dims: screenOf(bg.aspect), place: designPlace }} fontStyle={fontStyle} control={editorControl}
      inMenu={designsInMenu} onSave={saveFromEditor} onAddToMenu={addFromEditor} onClose={closeEditor} onOpenWorkshop={openWorkshop}
      onKey={(id) => { setEditing((value) => value && { ...value, key: id }); window.history.replaceState({ ...(window.history.state || {}), kzWidget: id }, '', editorURL(id)); }}/>;
  }

  return <div className={`kz${bg.dragging ? ' is-over' : ''}`} onPointerDownCapture={page.touch} onKeyDownCapture={page.touch} onDropCapture={(event) => { page.touch(); page.dropLook(event); }}
    onDragOver={(event) => { if ([...(event.dataTransfer?.types || [])].includes('Files')) event.preventDefault(); }} onDrop={(event) => event.preventDefault()}>
    <div className="kz-stage" {...drop}>
      <Board ref={board} dims={dims} zoom={zoom} onZoom={setZoom} onScale={setScale} onLayout={onLayout} widgets={shownWidgets} locked={locked} selected={selection} onSelect={select} onSlotDrag={slotDrag}
        zones={zones} zoneLabels={ZONE_LABELS()} slots={onMenu ? zones.filter((zone) => zone.id !== 'news' || bg.carnival || bg.seasonCard) : []} showZones={prefs.zones && onMenu} lines={lines} snap={prefs.snap}
        onCommit={commitRect} live={live} toolbar={toolbar} onOpen={(widget) => { if (widget.type === 'custom') openEditor({ from: widget.id }); }} slotLabel={(id) => `${SLOTS()[id]?.title} · Valve`} widgetLabel={widgetName} fontStyle={fontStyle} hint={hint}>{screen}</Board>
    </div>

    <header className="kz-top">
      <div className="kz-glass kz-pill kz-brand"><Brand/>
        <button type="button" className="kz-doc kz-pop-toggle" aria-expanded={docOpen} onClick={() => { setDocOpen((value) => !value); setRatioOpen(false); }} title={t('Сохранение, файл настроек, аккаунт')}>
          <span>{docName}</span><small>{looks.link ? (looks.status === 'saving' || looks.status === 'pending' ? t('сохраняем…') : t('в «Студии»')) : t('в этом браузере')}</small><Icon name="chevron" size={14}/></button></div>
      <nav className="kz-glass kz-pill kz-scenes" aria-label={t('Экраны Dota')}>
        {[['menu', t('Главное меню'), t('Меню')], ['grid', t('Сетка героев'), t('Сетка')], ['hero', t('За героем'), t('Герой')], ['loading', t('Загрузка'), t('Загрузка')], ['match', t('Матч (HUD)'), t('Матч')]].map(([id, long, short]) =>
          <button key={id} type="button" aria-pressed={scene === id} onClick={() => chooseScene(id)} title={long}><span className="kz-long">{long}</span><span className="kz-short">{short}</span>{sceneCount(id) > 0 && <em>{sceneCount(id)}</em>}</button>)}
      </nav>
      <div className="kz-glass kz-pill kz-tools-pill">
        <button type="button" className="kz-iconbtn" disabled={!canUndo} title={t('Отменить (Ctrl+Z)')} aria-label={t('Отменить')} onClick={undo}><Icon name="undo" size={17}/></button>
        <button type="button" className="kz-iconbtn" disabled={!canRedo} title={t('Повторить (Ctrl+Shift+Z)')} aria-label={t('Повторить')} onClick={redo}><Icon name="redo" size={17}/></button>
        <span className="kz-vr" aria-hidden="true"/>
        <button type="button" className="kz-ghostbtn kz-pop-toggle" aria-expanded={!!ratioOpen} title={t('Пропорции экрана')} onClick={(event) => { const box = event.currentTarget.getBoundingClientRect(); setRatioOpen((value) => (value ? false : { left: box.left, top: box.bottom + 8 })); setDocOpen(false); }}><Icon name="expand" size={16}/><b>{bg.aspect}</b></button>
        <button type="button" className="catalog-button primary kz-build" onClick={openBuild}><Icon name="archive" size={17}/>{t('Собрать и установить')}</button>
      </div>
    </header>

    {ratioOpen && <div className="kz-glass kz-pop kz-ratio" role="menu" style={{ left: Math.min(ratioOpen.left, innerWidth - 240), top: ratioOpen.top }}>{ASPECT_ORDER.map((value) => <button key={value} type="button" role="menuitemradio" aria-checked={bg.aspect === value}
      onClick={() => { bg.setAspect(value); setRatioOpen(false); say(t('Экран {ratio}: панели Valve встали как на таком мониторе.', { ratio: value })); }}>
      <span className="kz-ratio-ic" style={{ width: value === '21:9' ? 30 : value === '4:3' ? 18 : value === '16:10' ? 22 : 24 }}/><span>{value}<small>{ASPECTS()[value]}</small></span></button>)}</div>}
    {docOpen && <div className="kz-glass kz-pop kz-docpop">
      <LookBar looks={looks} auth={bg.auth}/>
      <nav className="kz-doc-links"><a href={CATALOG_PATH}>{t('Мастерская')}</a><a href={GUIDES_PATH}>{t('Гайды')}</a><a href={STUDIO_PATH}>{t('Студия')}</a>
        <a href={(() => { const url = new URL(location.href); url.searchParams.set('app', 'a'); url.searchParams.delete('widget'); return url.pathname + url.search; })()}>{t('Прежняя страница')}</a></nav>
      <div className="kz-doc-account"><LanguageSwitch/><AccountButton/></div>
    </div>}
    {(notice || openError) && <div className="kz-glass kz-notice">{openError && <Notice error>{openError}</Notice>}<LookNotice notice={notice} onUndo={page.undoLook} onClose={() => onNotice(null)}/></div>}

    <aside className={`kz-glass kz-layers${prefs.layers ? ' is-open' : ''}`} aria-label={t('Слои')}>
      <button type="button" className="kz-layers-head" aria-expanded={!!prefs.layers} onClick={() => pref({ layers: !prefs.layers })}><Icon name="layers" size={16}/>{t('Слои')}<span>{widgets.length}</span><Icon name="chevron" size={15} className="kz-chev"/></button>
      {prefs.layers && <Layers widgets={widgets} selected={selection} locked={locked} onSelect={(id) => { if (scene !== 'menu') setScene('menu'); select({ kind: 'widget', id }); }}
        onTool={tool} onReorder={(ids) => { apply(ids.map((id) => getWidgets().find((w) => w.id === id)).filter(Boolean)); say(t('Порядок слоёв изменён'), true); }}
        bg={bg} onBackground={() => openModule('bg')} onValve={() => { if (scene !== 'menu') setScene('menu'); pref({ zones: true }); }}/>}
    </aside>

    <InspectorShell kind={kind} rect={selRect} board={board} live={live} folded={folded} onFold={fold} wide={kind === 'module' || kind === 'slot'} head={head} layoutKey={`${layout}:${scale}:${kind}:${selection?.id}:${shelf}`}>{body}</InspectorShell>

    <div className="kz-sum">
      {summaryOpen && <div className="kz-glass kz-sum-panel">
        <h3>{t('Что войдёт в сборку')}</h3>
        {buildRows.length ? <Receipt rows={buildRows} files={files} total={total} onOpen={(id) => { if (id === 'widgets') { chooseScene('menu'); pref({ layers: true }); } else openModule(id); }}/>
          : <p className="custom-hint">{t('Пока всё как в Dota. Добавь виджет или открой любой раздел в доке внизу.')}</p>}
        {sum > 0 && <div className="kz-sum-total"><span>{t('Одна сборка для Dota')}</span><b>{sizeText(sum, sumEstimate)}</b></div>}
        <button type="button" className="catalog-button primary kz-sum-build" onClick={() => { setSummaryOpen(false); openBuild(); }}><Icon name="archive" size={16}/>{t('Собрать и установить')}</button>
      </div>}
      <button type="button" className="kz-glass kz-sum-chip" aria-expanded={summaryOpen} onClick={() => setSummaryOpen((value) => !value)}>
        <Icon name="archive" size={17}/>{partsCount ? <><span>{t('В сборке: {count}', { count: partsCount })}</span><b>{sum ? sizeText(sum, sumEstimate) : ''}</b></> : <span>{t('Пока всё как в Dota')}</span>}</button>
    </div>

    <Shelf shelf={shelf} onShelf={(value) => { setShelf(value); setSearch(''); }} query={search} onQuery={setSearch} page={page} open={shownModule}
      onModule={(id) => { openModule(id); }} onPick={pickWidget} onWorkshop={pickWorkshop} onMod={pickMod}
      designs={designs} onDesign={pickDesign} onPlace={(item) => addDesign(item)} onCreate={() => openEditor()} onEditDesign={(id) => openEditor({ id })} onDeleteDesign={(item) => setRemovingDesign(item)}
      widgetTab={widgetTab} onWidgetTab={showWidgetTab} onWorkshopPick={pickWorkshopWidget} onWorkshopAdd={(card) => addFromWorkshop(card)} onWorkshopSave={saveFromWorkshop} onSay={(text) => say(text)}/>
    <Dock shelf={shelf} onShelf={(value) => { setShelf(value); setSearch(''); if (value) track('customize.shelf', { shelf: value }); if (CATEGORY_MODULES[value]?.length === 1) openModule(CATEGORY_MODULES[value][0]); }}/>

    <div className="kz-glass kz-pill kz-zoom">
      <button type="button" className="kz-iconbtn" title={t('Мельче')} aria-label={t('Мельче')} onClick={() => setZoom(Math.max(0.15, (scale || 1) / 1.2))}><Icon name="minus" size={16}/></button>
      <button type="button" className="kz-ghostbtn kz-zoom-val" title={t('Вписать в окно')} onClick={() => setZoom(0)}>{Math.round((scale || 0) * 100)}%</button>
      <button type="button" className="kz-iconbtn" title={t('Крупнее')} aria-label={t('Крупнее')} onClick={() => setZoom(Math.min(3, (scale || 1) * 1.2))}><Icon name="plus" size={16}/></button>
      <span className="kz-vr" aria-hidden="true"/>
      <button type="button" className="kz-ghostbtn" aria-pressed={!!prefs.zones} disabled={!onMenu} title={t('Где лежат панели самой Dota')} onClick={() => pref({ zones: !prefs.zones })}><Icon name="fit" size={16}/><span className="kz-label">{t('Зоны Valve')}</span></button>
      <button type="button" className="kz-ghostbtn" aria-pressed={!!prefs.snap} title={t('Прилипание к краям и колонкам. Alt — временно без него')} onClick={() => pref({ snap: !prefs.snap })}><Icon name="magnet" size={16}/><span className="kz-label">{t('Прилипание')}</span></button>
    </div>

    {toast && <div className="kz-toast" role="status" key={toast.at}><Icon name="check" size={16}/><span>{toast.text}</span>
      {toast.undoable && canUndo && <button type="button" className="kz-ghostbtn" onClick={() => { undo(); setToast(null); }}>{t('Отменить')}</button>}</div>}

    <MenuWindows bg={bg}/>
    {removingDesign && <Modal title={t('Удалить виджет?')} icon="trash" tone="danger" onClose={() => setRemovingDesign(null)}>
      <div className="catalog-confirm"><p>{t('«{name}» исчезнет из «Моих виджетов».', { name: removingDesign.design.name })} {designsInMenu(removingDesign.id) ? t('В меню он останется: там его копия, её можно поменять в редакторе.') : ''}</p>
        <div className="catalog-actions"><button type="button" className="catalog-button" onClick={() => setRemovingDesign(null)}>{t('Оставить')}</button>
          <button type="button" className="catalog-button danger" onClick={() => { deleteDesign(removingDesign.id); say(t('Удалено: {name}', { name: removingDesign.design.name })); setRemovingDesign(null); }}><Icon name="trash"/>{t('Удалить')}</button></div></div>
    </Modal>}
    {building && <BuildWindow page={page} rows={buildRows} sum={sum} sumEstimate={sumEstimate} canBuild={canBuild} note={buildNote} onBuild={build} onClose={() => setBuilding(false)} onOpen={(id) => { setBuilding(false); if (id !== 'widgets') openModule(id); }}/>}
    {page.install && <Install delivery={page.delivery} handed={page.delivery === 'command' ? page.handed : null} made={page.made} bg={bg} onClose={() => page.setInstall(false)}/>}
  </div>;
}

// «Слои»: the widgets top first (drag the grip to change the order), then Valve's menu and the background.
function Layers({ widgets, selected, locked, onSelect, onTool, onReorder, bg, onBackground, onValve }) {
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
      const before = [...widgets].reverse().map((w) => w.id).join();
      if (ids.join() !== before) onReorder(ids.reverse());
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };
  return <ul className="kz-layer-list" ref={list}>
    {[...widgets].reverse().map((widget) => <li key={widget.id} data-id={widget.id} className={`kz-layer${selected?.id === widget.id ? ' is-sel' : ''}${widget.hidden ? ' is-hidden' : ''}`} onClick={() => onSelect(widget.id)}
      tabIndex={0} aria-current={selected?.id === widget.id || undefined} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(widget.id); } }}>
      <span className="kz-grip" title={t('Перетащи, чтобы поменять порядок')} onPointerDown={(event) => grab(event, widget.id)}/>
      <span className="kz-row-ico"><Icon name={WIDGET_TYPES[widget.type].icon} size={14}/></span><span className="kz-layer-name">{widgetName(widget)}</span>
      <button type="button" className={`kz-act${locked.has(widget.id) ? ' is-on' : ''}`} title={locked.has(widget.id) ? t('Открепить') : t('Закрепить')} aria-label={locked.has(widget.id) ? t('Открепить') : t('Закрепить')} onClick={(event) => { event.stopPropagation(); onTool('lock', widget.id); }}><Icon name={locked.has(widget.id) ? 'lock' : 'unlock'} size={14}/></button>
      <button type="button" className={`kz-act${widget.hidden ? ' is-on' : ''}`} title={widget.hidden ? t('Показать') : t('Скрыть')} aria-label={widget.hidden ? t('Показать') : t('Скрыть')} onClick={(event) => { event.stopPropagation(); onTool('hide', widget.id); }}><Icon name={widget.hidden ? 'eyeOff' : 'eye'} size={14}/></button>
    </li>)}
    {!widgets.length && <li className="kz-layer is-fixed"><span className="kz-layer-name is-muted">{t('Виджетов пока нет — перетащи из «Виджетов»')}</span></li>}
    <li className="kz-layer-sep" role="presentation"/>
    <li className="kz-layer is-fixed" onClick={onValve} title={t('Панели самой Dota: их не подвинуть, только настроить или сменить модом')}><span className="kz-row-ico"><Icon name="layers" size={14}/></span><span className="kz-layer-name">{t('Меню Dota')}<small>Valve</small></span><Icon name="lock" size={13}/></li>
    <li className="kz-layer is-fixed" onClick={onBackground}><span className="kz-row-ico"><Icon name="image" size={14}/></span><span className="kz-layer-name">{t('Фон')}<small>{bg.file ? (bg.origin?.kind === 'workshop' ? bg.origin.title : bg.file.name) : t('как в Dota')}</small></span></li>
  </ul>;
}

// «Собрать и установить»: what goes in, how to install, and the build itself (useCustomize download()).
function BuildWindow({ page, rows, sum, sumEstimate, canBuild, note, onBuild, onClose, onOpen }) {
  const { bg, busy, encoding, delivery, setDelivery, setHanded, error, total, files } = page;
  return <Modal title={t('Собрать и установить')} icon="archive" size="md" onClose={onClose} lead={t('Всё, что на этой странице, — одной сборкой для Dota.')}>
    <div className="kz-build-win">
      {rows.length ? <Receipt rows={rows} files={files} total={total} onOpen={onOpen}/> : <p className="custom-hint">{t('Пока всё как в Dota: добавь виджет или открой любой раздел в доке внизу.')}</p>}
      {sum > 0 && <p className="kz-build-total"><span>{t('Примерный размер')}</span><b>{sizeText(sum, sumEstimate)}</b></p>}
      {error && <Notice error report>{error}</Notice>}
      {note && <Notice>{note}</Notice>}
      {BY_HAND ? <p className="cz-os-note">{t('Команда PowerShell — только для Windows. На {system} ставь файлом: «Как установить» ниже.', { system: SYSTEM_NAMES[SYSTEM] })}</p>
        : <Segmented label={t('Как поставить')} value={delivery} onChange={(value) => { setDelivery(value); setHanded(null); }} options={[['command', t('Командой PowerShell')], ['file', t('Только файл')]]}/>}
      {busy || encoding ? <div className="custom-progress" role="status"><span style={{ width: `${Math.round((encoding ? bg.progress : busy.progress ?? 0.15) * 100)}%` }}/>
        <b>{encoding ? t('Собираем видео… {percent}%', { percent: Math.round(bg.progress * 100) }) : busy.label}</b>
        {encoding && <button type="button" className="catalog-icon" aria-label={t('Отменить')} onClick={bg.cancel}><Icon name="close"/></button>}</div>
        : <button type="button" className="catalog-button primary kz-build-go" disabled={!canBuild || !!bg.fetching} onClick={onBuild}>
          <Icon name={delivery === 'command' ? 'terminal' : 'download'}/>{delivery === 'command' ? t('Собрать и получить команду') : t('Скачать всё одним файлом')}</button>}
      <button type="button" className="catalog-link kz-build-help" onClick={() => page.setInstall(true)}>{t('Как установить')}</button>
    </div>
  </Modal>;
}

