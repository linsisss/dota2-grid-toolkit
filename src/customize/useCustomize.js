import { createElement as h, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../scripts/i18n.mjs';
import { packOf, track } from '../site-stats.js';
import { ButtonsFields, BackgroundFields, GridFields, HeroFields, LoadingFields, useMenuBackground } from './MenuBackground.jsx';
import { ChatFields, CursorFields, HudFields, TextsFields, useInterface } from './InterfaceBuilder.jsx';
import { FontFields, useFont } from './FontPicker.jsx';
import { customizeZip, deliverCustomize } from './customize-pack.js';
import { D2PFX_MODULES, D2pfxFields, useD2pfx } from './D2pfxSections.jsx';
import { creditLine } from './d2pfx-ui.jsx';
import { BY_HAND } from '../system.js';
import { PortraitsFields, useHeroPortraits } from './HeroPortraits.jsx';
import { HUD_PORTRAIT } from '../../scripts/hero-portraits.mjs';
import { isLookFile, useLooks } from './LookBar.jsx';
import { readPrevious } from './look-state.js';
import { getWidgets } from './widget-store.js';
import { menuTheme } from './menu-theme-pack.js';
import { readVPK } from '../../scripts/vpk.mjs';

// The state of «Оформление Dota» (2026-10-31), shared by the page (CustomizePage.jsx, the accordion) and the
// constructor (src/constructor/, ?app=b): every module's hook (MenuBackground.jsx, InterfaceBuilder.jsx,
// FontPicker.jsx, D2pfxSections.jsx, HeroPortraits.jsx), «Студия» (LookBar.jsx), what goes into the one
// file with its sizes, each module's settings (`fields`) and the build itself (`download`). The pages
// only lay it out.
export const SCENES = () => [['menu', t('Главное меню'), 'image'], ['grid', t('Сетка героев'), 'grid'], ['hero', t('За героем'), 'user'], ['loading', t('Загрузка'), 'film'], ['match', t('Матч'), 'sliders']];
export const GROUPS = () => [['menu', t('Главное меню')], ['match', t('Матч')], ['all', t('Везде')]];
export const MODULES = () => [
  { id: 'bg', group: 'menu', icon: 'image', scene: 'menu', title: t('Фон меню'), text: t('Картинка, GIF или видео в главном меню') },
  { id: 'grid', group: 'menu', icon: 'grid', scene: 'grid', title: t('Под сеткой героев'), text: t('Фон страницы «Герои», чтобы сетка читалась') },
  { id: 'hero', group: 'menu', icon: 'user', scene: 'hero', title: t('За героем'), text: t('«Герои» → «Снаряжение», за моделью') },
  { id: 'loading', group: 'menu', icon: 'film', scene: 'loading', title: t('Экран загрузки'), text: t('Пока грузится матч') },
  { id: 'buttons', group: 'menu', icon: 'layers', scene: 'menu', title: t('Кнопки меню'), text: t('Лишние кнопки, карточки на главной, прозрачные панели') },
  { id: 'menuparts', group: 'menu', icon: 'template', scene: 'menu', title: t('Детали меню'), d2pfx: true, text: t('Верхняя панель, поиск игры, кнопка «Играть» — с d2pfx') },
  { id: 'hud', group: 'match', icon: 'sliders', scene: 'match', title: t('Вид HUD'), text: t('Подложки, украшения, размер панелей') },
  { id: 'hudskin', group: 'match', icon: 'brush', scene: 'match', title: t('HUD-скин'), d2pfx: true, text: t('Готовые скины HUD с d2pfx') },
  { id: 'hudparts', group: 'match', icon: 'gauge', scene: 'match', title: t('Детали HUD'), d2pfx: true, text: t('Миникарта, таймер, счёт и магазин — с d2pfx') },
  { id: 'chat', group: 'match', icon: 'chat', scene: 'match', title: t('Чат'), text: t('Место и ширина чата в матче') },
  { id: 'cursor', group: 'match', icon: 'cursor', scene: 'match', title: t('Курсор'), text: t('Свой курсор в меню и в матче') },
  { id: 'click', group: 'match', icon: 'mouse', scene: 'match', title: t('Клик'), d2pfx: true, text: t('Цвет стрелок приказа «идти» — с d2pfx') },
  { id: 'pings', group: 'match', icon: 'flag', scene: 'match', title: t('Пинги'), d2pfx: true, text: t('Значок сигнала на карте — с d2pfx') },
  { id: 'deny', group: 'match', icon: 'swords', scene: 'match', title: t('Денай'), d2pfx: true, text: t('Знак над добитым своим крипом — с d2pfx') },
  { id: 'font', group: 'all', icon: 'font', scene: 'font', title: t('Шрифт'), text: t('Любой шрифт с кириллицей в чате и меню') },
  { id: 'texts', group: 'all', icon: 'languages', scene: 'menu', title: t('Тексты'), text: t('Свои названия героев, вкладок и кнопок') },
  { id: 'portraits', group: 'all', icon: 'idCard', scene: 'grid', title: t('Портреты героев'), text: t('Своя картинка или видео вместо портрета героя') },
  { id: 'voice', group: 'all', icon: 'volume', scene: 'match', title: t('Иконка голоса'), d2pfx: true, text: t('Значок говорящего в голосовом чате — с d2pfx') }
];
export const STATE_LABELS = () => ({ changed: t('Своё'), follow: t('Как в меню'), default: t('Как в Dota') });
// Old addresses open their section (CustomizeApp.jsx reads them): ?tab=font, ?tab=interface (the HUD),
// ?page=grid|hero|loading, ?part=<module>; a workshop or «Студия» background opens «Фон меню».
export function startSection(query) {
  const ids = MODULES().map((module) => module.id), part = query.get('part'), page = query.get('page'), tab = query.get('tab');
  if (ids.includes(part)) return part;
  if (tab === 'font') return 'font';
  if (tab === 'interface') return 'hud';
  if (['grid', 'hero', 'loading'].includes(page)) return page;
  return 'bg';
}

// `first`: the section open at the start ('' for none; by default the one the address names, else «Фон меню»).
export function useCustomize({ preset, studioItem, onRemove, replace, notice = null, onNotice = () => {}, first }) {
  const query = useMemo(() => new URLSearchParams(location.search), []);
  const MODS = MODULES(), find = (id) => MODS.find((module) => module.id === id);
  const [open, setOpen] = useState(() => (first === undefined ? startSection(query) : first)), [scene, setScene] = useState(() => find(open)?.scene || 'menu');
  const [delivery, setDelivery] = useState(BY_HAND ? 'file' : 'command'), [install, setInstall] = useState(false), [handed, setHanded] = useState(null);
  const [busy, setBusy] = useState(null), [error, setError] = useState(''), [made, setMade] = useState(null), [hudThumb, setHudThumb] = useState(null);
  const menuPage = ['menu', 'grid', 'hero', 'loading'].includes(scene) ? scene : 'menu';
  const bg = useMenuBackground({ preset, studioItem, page: menuPage, onRemove });
  const ui = useInterface({ open });
  const font = useFont();
  const d2 = useD2pfx();
  const pt = useHeroPortraits({ open: open === 'portraits' });
  // «Оформление»: «Сохранить в Студию», the settings file both ways (LookBar.jsx).
  const looks = useLooks({ bg, ui, font, d2, pt, replace, suggested: notice?.from === 'file' ? notice.name : '' });
  const undoLook = async () => {
    const previous = await readPrevious();
    if (!previous?.look) return onNotice(null);
    const before = await looks.snapshot().catch(() => null);
    replace(previous.look, { link: previous.link, from: 'previous', before, beforeLink: looks.link });
  };
  // A .gsdota dropped anywhere on the page opens; other files go where they always went (the preview).
  const dropLook = (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (!isLookFile(file)) return;
    event.preventDefault(); event.stopPropagation(); bg.drop.onDragLeave();
    looks.importFile(file);
  };
  // The address names the open section (a reload or a shared link opens it); «Студия»'s ?item stays.
  useEffect(() => {
    const url = new URL(location.href);
    for (const key of ['tab', 'page', 'part']) url.searchParams.delete(key);
    if (open && open !== 'bg') url.searchParams.set('part', open);
    if (url.href !== location.href) history.replaceState(history.state, '', url);
  }, [open]);
  // «Тема меню» (2026-11-01) is one of «Детали меню»'s choices (its state lives with the menu's pack, MenuBackground.jsx).
  const themeLine = bg.theme ? t('Тема меню GridStudio · {accent}', { accent: bg.theme }) : '';
  const states = { ...bg.states, ...ui.states, ...d2.states, font: font.state, portraits: pt.state, ...(bg.theme ? { menuparts: 'changed' } : {}) };
  const summary = { ...bg.summary, ...ui.summary, ...d2.summary, font: font.summary, portraits: pt.summary, ...(bg.theme ? { menuparts: [themeLine, d2.summary.menuparts].filter(Boolean).join(', ') } : {}) };
  const changed = MODS.filter((module) => states[module.id] === 'changed');
  // Each part's size: the menu's from its pack (videos as the encoder aims until built), the match's and
  // the font's made a moment after a change.
  const partSize = (id) => (id === 'menuparts' && bg.sizes.parts.theme ? { bytes: bg.sizes.parts.theme.bytes + (d2.sizes.parts.menuparts?.bytes || 0), estimate: true }
    : bg.sizes.parts[id] || ui.sizes.parts?.[id] || d2.sizes.parts[id] || (id === 'font' ? font.size : id === 'portraits' ? pt.size : null));
  const rows = MODS.filter((module) => states[module.id] !== 'default').map((module) => {
    const size = partSize(module.id);
    return { id: module.id, icon: module.icon, title: module.title, line: summary[module.id] || module.text, state: states[module.id],
      bytes: states[module.id] === 'changed' ? size?.bytes || 0 : 0, estimate: !!size?.estimate,
      note: states[module.id] === 'follow' ? t('тот же файл') : module.id === 'chat' ? t('в HUD') : t('считаем…') };
  });
  const files = [
    bg.sizes.pak02 && { path: 'dota_russian/pak02_dir.vpk', icon: 'archive', what: t('меню, фоны, кнопки'), ...bg.sizes.pak02 },
    ui.sizes.pak03 && { path: 'dota_russian/pak03_dir.vpk', icon: 'archive', what: t('HUD, чат, тексты'), ...ui.sizes.pak03 },
    pt.size && { path: 'dota_russian/pak05_dir.vpk', icon: 'archive', what: `${t('портреты героев: {list}', { list: pt.names.join(', ') })}${pt.hudNames.length ? ` · ${t('в HUD: {list}', { list: pt.hudNames.join(', ') })}` : ''}`, ...pt.size },
    d2.sizes.pak && { path: 'dota_russian/pak04_dir.vpk', icon: 'archive', what: t('моды d2pfx: {list}', { list: d2.plan.picks.map((mod) => `«${mod.label}» (${creditLine(mod.credits)})`).join(', ') }), ...d2.sizes.pak },
    ui.sizes.cursors && { path: 'dota_russian/resource/cursor/', icon: 'cursor', what: `${t('курсор, файлов: {count}', { count: ui.sizes.cursors.count })}${ui.cursors.fromPack ? ` · ${t('пак «{name}» с d2pfx, автор: {author}', { name: ui.cursors.pack.name, author: ui.cursors.creditLine })}` : ''}`, ...ui.sizes.cursors },
    font.size && { path: 'dota/panorama/fonts/', icon: 'font', what: t('шрифт, файлов: {count}', { count: font.size.count }), bytes: font.size.bytes }
  ].filter(Boolean);
  const total = files.reduce((sum, file) => sum + file.bytes, 0), estimate = files.some((file) => file.estimate);
  const titles = MODS.filter((module) => states[module.id] !== 'default').map((module) => module.title);
  const follow = MODS.filter((module) => states[module.id] === 'follow').length;
  const dots = Object.fromEntries(SCENES().map(([id]) => [id, MODS.some((module) => module.scene === id && states[module.id] === 'changed') || (id === 'menu' && states.texts === 'changed')]));
  // «customize.change»: a section that becomes «Своё» after the user did something on the page; what comes
  // back by itself (saved settings, cursor pictures from IndexedDB, a studio recipe) is not a change.
  const seen = useRef(states), touched = useRef(false);
  const stateKey = MODS.map((module) => states[module.id]).join();
  useEffect(() => {
    for (const module of MODS) if (touched.current && states[module.id] === 'changed' && seen.current[module.id] !== 'changed') track('customize.change', { section: module.id, part: module.id });
    seen.current = states;
  }, [stateKey]);
  const touch = () => { touched.current = true; };

  // The one file: the menu's videos encoded (once), every part made, zipped; then saved, or sent to the
  // site for the command. The statistics: its start, then its parts, size and pack, or why it failed.
  // → true once the file went out, null when there was nothing to put in it, false when it failed or was cancelled.
  async function download() {
    setError(''); setBusy({ label: t('Собираем…') });
    const parts = [...MODS.filter((module) => states[module.id] !== 'default').map((module) => module.id), ...(getWidgets().some((widget) => !widget.hidden) ? ['widgets'] : [])];
    track('customize.build-start', { delivery, parts });
    try {
      // The d2pfx mods: with «Тема меню» they are fetched first, since a chosen mod's own stylesheets stay its own
      // (our pak02 would win over its pak04) and a chosen d2pfx top bar keeps its ground (menu-theme-pack.js).
      const fetchMods = () => d2.files((share) => setBusy({ label: t('Скачиваем моды с Dota2PornFX… {percent}%', { percent: Math.round(share * 100) }), progress: share }), { skip: pt.hudOn ? [HUD_PORTRAIT.layout] : [] });
      const modsLoad = bg.theme && d2.plan.picks.length ? fetchMods() : null;
      modsLoad?.catch(() => {});
      const themeOf = (accent) => (d2.choice.menuparts?.theme ? Promise.resolve(null) : (modsLoad || Promise.resolve(null)).then((pak) => menuTheme(accent, {
        drop: pak ? readVPK(pak).files.map((file) => file.path) : [], topbar: !d2.choice.menuparts?.topbar })));
      const menu = await bg.prepare({ delivery, themeOf });
      setBusy({ label: t('Собираем…') });
      const [match, fonts, mods, portraits] = await Promise.all([ui.files(), font.files(), modsLoad || fetchMods(),
        pt.files((share) => setBusy({ label: t('Собираем портреты героев… {percent}%', { percent: Math.round(share * 100) }), progress: share }))]);
      setBusy({ label: t('Собираем…') });
      const zip = await customizeZip({ menu: menu?.blob ?? null, match, d2pfx: mods, portraits, portraitNames: pt.names, portraitHud: pt.hudNames, fonts, titles: getWidgets().some((widget) => !widget.hidden) ? [...titles, t('Виджеты главного меню')] : titles, credits: ui.cursors.credits, modCredits: d2.credits });
      if (!zip) return null;
      const given = await deliverCustomize(zip.blob, { delivery, onProgress: (share) => setBusy({ label: t('Отправляем на GridStudio… {percent}%', { percent: Math.round(share * 100) }), progress: share }) });
      bg.delivered({ delivery });
      const mb = Math.round(zip.blob.size / 1e6);
      track('customize.build-done', { delivery, parts, mb, pack: packOf(given?.command) || '' });
      if (delivery === 'file') track('customize.download', { mb });
      setHanded(given); setMade({ size: zip.blob.size, entries: zip.entries }); setInstall(true);
      return true;
    } catch (problem) {
      // A cancel is not a failure.
      if (!problem?.aborted) track('customize.build-fail', { delivery, reason: String(problem?.message || 'error').slice(0, 80) });
      if (!problem?.aborted && !problem?.shown) setError(problem?.message || t('Не получилось собрать файл.'));
      if (problem?.shown) setError(problem.message);
      return false;
    } finally { setBusy(null); }
  }
  const chooseScene = (id) => { track('customize.scene', { scene: id }); setScene(id); if (open === 'font') setOpen(''); };
  const fields = { bg: h(BackgroundFields, { bg }), grid: h(GridFields, { bg }), hero: h(HeroFields, { bg }), loading: h(LoadingFields, { bg }), buttons: h(ButtonsFields, { bg }),
    hud: h(HudFields, { ui }), chat: h(ChatFields, { ui }), cursor: h(CursorFields, { cur: ui.cursors }), font: h(FontFields, { font }), texts: h(TextsFields, { ui }), portraits: h(PortraitsFields, { pt, d2, onMatch: () => chooseScene('match') }),
    ...Object.fromEntries(D2PFX_MODULES.map((id) => [id, h(D2pfxFields, { d2, section: id, ...(id === 'menuparts' ? { theme: { accent: bg.theme, set: bg.setTheme } } : {}) })])) };
  const reset = (id) => { if (id === 'menuparts') bg.setTheme(''); return id === 'portraits' ? pt.reset() : id === 'font' ? font.reset() : ['hud', 'chat', 'cursor', 'texts'].includes(id) ? ui.reset(id) : D2PFX_MODULES.includes(id) ? d2.reset(id) : bg.reset(id); };
  // The d2pfx mods the shown scene does not draw (the click plays in the match: DotaCursor.jsx; a HUD skin
  // and HUD parts the emulator can draw are in it: HudCanvas).
  const unseen = d2.plan.picks.filter((mod) => (scene === 'menu' ? mod.section === 'menuparts' && !d2.menuLook.drawn.includes(mod.id) : scene === 'match' ? !['menuparts', 'click'].includes(mod.section) && !d2.hudMods.includes(mod.id) : false));
  const encoding = bg.progress !== null;
  return {
    MODS, find, query, open, setOpen, scene, setScene, menuPage, chooseScene, bg, ui, font, d2, pt, looks, undoLook, dropLook,
    states, summary, changed, partSize, rows, files, total, estimate, titles, follow, dots, touch, fields, reset, unseen, encoding,
    delivery, setDelivery, install, setInstall, handed, setHanded, busy, error, setError, made, hudThumb, setHudThumb, download
  };
}
