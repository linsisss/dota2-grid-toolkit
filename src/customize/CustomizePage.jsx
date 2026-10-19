import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon, Notice } from '../catalog/Common.jsx';
import { lang, t } from '../../scripts/i18n.mjs';
import { pcCode } from '../../scripts/pc-link.mjs';
import { packOf, track } from '../site-stats.js';
import { openCommunity } from '../Community.jsx';
import { CUSTOMIZE_DIRS } from '../../scripts/customize-pack.mjs';
import { CopyField, InstallWindow, Segmented, rich, sizeText } from './ui.jsx';
import { ButtonsFields, BackgroundFields, DotaLanguage, GridFields, HeroFields, LoadingFields, MenuScreen, MenuThumb, MenuUnder, MenuVersion, MenuWindows, useMenuBackground } from './MenuBackground.jsx';
import { ChatFields, CursorFields, HudFields, MatchScreen, MatchUnder, TextsFields, useInterface } from './InterfaceBuilder.jsx';
import { FontFields, FontScreen, fontCaption, useFont } from './FontPicker.jsx';
import { customizeRemoveCommand, customizeZip, deliverCustomize, CUSTOMIZE_FILE } from './customize-pack.js';
import { D2PFX_MODULES, D2pfxFields, useD2pfx } from './D2pfxSections.jsx';
import { creditLine } from './d2pfx-ui.jsx';
import { BY_HAND, SYSTEM, SYSTEM_NAMES } from '../system.js';
import matchThumb from '../../assets/customize/match-thumb.webp';

// «Твоя Dota» (/background, 2026-10-17; the owner's «A · Сцена» of three mockups): everything about Dota
// but grids and guides on one page — the menu's backgrounds and buttons, the HUD, the chat, the cursor,
// the font and the texts — and one file for all of it (scripts/customize-pack.mjs). The preview shows a
// scene of the game (a switcher with live thumbnails above it); the sections sit in an accordion at the
// right, grouped by where they are seen, and opening one shows its scene. The foot of the panel says what
// goes into the file, with each part's size, and makes it: the file, or a PowerShell command that installs
// it. Each module keeps its state in its own hook (MenuBackground.jsx, InterfaceBuilder.jsx, FontPicker.jsx).
const SCENES = () => [['menu', t('Главное меню'), 'image'], ['grid', t('Сетка героев'), 'grid'], ['hero', t('За героем'), 'user'], ['loading', t('Загрузка'), 'film'], ['match', t('Матч'), 'sliders']];
const GROUPS = () => [['menu', t('Главное меню')], ['match', t('Матч')], ['all', t('Везде')]];
export const MODULES = () => [
  { id: 'bg', group: 'menu', icon: 'image', scene: 'menu', title: t('Фон меню'), text: t('Картинка, GIF или видео в главном меню') },
  { id: 'grid', group: 'menu', icon: 'grid', scene: 'grid', title: t('Под сеткой героев'), text: t('Фон страницы «Герои», чтобы сетка читалась') },
  { id: 'hero', group: 'menu', icon: 'user', scene: 'hero', title: t('За героем'), text: t('«Герои» → «Снаряжение», за моделью') },
  { id: 'loading', group: 'menu', icon: 'film', scene: 'loading', title: t('Экран загрузки'), text: t('Пока грузится матч') },
  { id: 'buttons', group: 'menu', icon: 'layers', scene: 'menu', title: t('Кнопки меню'), text: t('Лишние кнопки и карточки на главной') },
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
  { id: 'voice', group: 'all', icon: 'volume', scene: 'match', title: t('Иконка голоса'), d2pfx: true, text: t('Значок говорящего в голосовом чате — с d2pfx') }
];
const STATE_LABELS = () => ({ changed: t('Своё'), follow: t('Как в меню'), default: t('Как в Dota') });
const ASPECT_ORDER = ['16:9', '16:10', '21:9', '4:3'];
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
const PHONE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

function StateChip({ state }) {
  return <span className={`cz-state is-${state}`}>{STATE_LABELS()[state]}</span>;
}

// The scene switcher: a pill that slides to the scene shown; each scene's thumbnail is the scene as it is now.
function Scenes({ scene, onScene, thumb, dots }) {
  const box = useRef(null), [pill, setPill] = useState(null);
  useLayoutEffect(() => {
    const place = () => {
      const on = box.current?.querySelector(`[data-scene="${scene}"]`);
      setPill(on ? { left: on.offsetLeft, width: on.offsetWidth } : null);
      if (on && box.current.scrollWidth > box.current.clientWidth) box.current.scrollTo({ left: on.offsetLeft - 40, behavior: 'smooth' });
    };
    place();
    addEventListener('resize', place);
    return () => removeEventListener('resize', place);
  }, [scene, lang]);
  return <div className="cz-scenes" role="group" aria-label={t('Что показать в превью')} ref={box}>
    <span className="cz-scenes-pill" aria-hidden="true" style={pill ? { width: pill.width, transform: `translateX(${pill.left}px)` } : { opacity: 0 }}/>
    {SCENES().map(([id, title]) => <button key={id} type="button" data-scene={id} aria-pressed={scene === id} onClick={() => onScene(id)}>
      <span className="cz-thumb">{thumb(id)}{dots[id] && <i className="cz-dot" title={t('Здесь есть изменения')}/>}</span>{title}</button>)}
  </div>;
}

// «Что внутри»: each part with its size and a bar of its share (C · «Сборка»), then the files as they lie in the archive.
function Receipt({ rows, files, total, onOpen }) {
  const biggest = Math.max(1, ...rows.map((row) => row.bytes || 0));
  return <div className="cz-receipt">
    <ul className="cz-receipt-list">{rows.map((row) => <li key={row.id} className={`is-${row.state}`}>
      <button type="button" onClick={() => onOpen(row.id)}><Icon name={row.icon}/><span className="cz-receipt-text">{row.title}<small>{row.line}</small></span>
        <span className="cz-receipt-size">{row.bytes ? sizeText(row.bytes, row.estimate) : row.note}</span>
        <i className="cz-receipt-bar" aria-hidden="true"><b style={{ width: `${row.bytes ? Math.max(2, (row.bytes / biggest) * 100) : 0}%` }}/></i></button></li>)}</ul>
    {files.length > 0 && <ul className="cz-tree" aria-label={t('Файлы в архиве')}>{files.map((file) => <li key={file.path}><Icon name={file.icon}/><code>{file.path}</code><span>{file.what} · {sizeText(file.bytes, file.estimate)}</span></li>)}</ul>}
    {total > 0 && <p className="custom-hint">{t('Размеры — как файлы лягут в игру; архив немного меньше: шрифты и тексты в нём сжаты.')}</p>}
  </div>;
}

export default function CustomizePage({ preset, studioItem, onRemove }) {
  const query = useMemo(() => new URLSearchParams(location.search), []);
  const MODS = MODULES(), find = (id) => MODS.find((module) => module.id === id);
  const [open, setOpen] = useState(() => startSection(query)), [scene, setScene] = useState(() => find(startSection(query)).scene);
  const [delivery, setDelivery] = useState(BY_HAND ? 'file' : 'command'), [inside, setInside] = useState(false), [install, setInstall] = useState(false), [handed, setHanded] = useState(null);
  const [busy, setBusy] = useState(null), [error, setError] = useState(''), [made, setMade] = useState(null), [hudThumb, setHudThumb] = useState(null);
  const menuPage = ['menu', 'grid', 'hero', 'loading'].includes(scene) ? scene : 'menu';
  const bg = useMenuBackground({ preset, studioItem, page: menuPage, onRemove });
  const ui = useInterface({ open });
  const font = useFont();
  const d2 = useD2pfx();
  // The address names the open section (a reload or a shared link opens it); «Студия»'s ?item stays.
  useEffect(() => {
    const url = new URL(location.href);
    for (const key of ['tab', 'page', 'part']) url.searchParams.delete(key);
    if (open && open !== 'bg') url.searchParams.set('part', open);
    if (url.href !== location.href) history.replaceState(history.state, '', url);
  }, [open]);
  // An old link to a section lower in the panel (?tab=font, ?page=loading…): it is scrolled to.
  useEffect(() => {
    if (open === 'bg' || !open) return undefined;
    const timer = setTimeout(() => document.querySelector(`.cz-mod[data-id="${open}"]`)?.scrollIntoView({ block: 'nearest' }), 450);
    return () => clearTimeout(timer);
  }, []);
  const states = { ...bg.states, ...ui.states, ...d2.states, font: font.state };
  const summary = { ...bg.summary, ...ui.summary, ...d2.summary, font: font.summary };
  const changed = MODS.filter((module) => states[module.id] === 'changed');
  // Each part's size: the menu's from its pack (videos as the encoder aims until built), the match's and
  // the font's made a moment after a change.
  const partSize = (id) => bg.sizes.parts[id] || ui.sizes.parts?.[id] || d2.sizes.parts[id] || (id === 'font' ? font.size : null);
  const rows = MODS.filter((module) => states[module.id] !== 'default').map((module) => {
    const size = partSize(module.id);
    return { id: module.id, icon: module.icon, title: module.title, line: summary[module.id] || module.text, state: states[module.id],
      bytes: states[module.id] === 'changed' ? size?.bytes || 0 : 0, estimate: !!size?.estimate,
      note: states[module.id] === 'follow' ? t('тот же файл') : module.id === 'chat' ? t('в HUD') : t('считаем…') };
  });
  const files = [
    bg.sizes.pak02 && { path: 'dota_russian/pak02_dir.vpk', icon: 'archive', what: t('меню, фоны, кнопки'), ...bg.sizes.pak02 },
    ui.sizes.pak03 && { path: 'dota_russian/pak03_dir.vpk', icon: 'archive', what: t('HUD, чат, тексты'), ...ui.sizes.pak03 },
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
  async function download() {
    setError(''); setBusy({ label: t('Собираем…') });
    const parts = MODS.filter((module) => states[module.id] !== 'default').map((module) => module.id);
    track('customize.build-start', { delivery, parts });
    try {
      const menu = await bg.prepare({ delivery });
      setBusy({ label: t('Собираем…') });
      const [match, fonts, mods] = await Promise.all([ui.files(), font.files(),
        d2.files((share) => setBusy({ label: t('Скачиваем моды с Dota2PornFX… {percent}%', { percent: Math.round(share * 100) }), progress: share }))]);
      setBusy({ label: t('Собираем…') });
      const zip = await customizeZip({ menu: menu?.blob ?? null, match, d2pfx: mods, fonts, titles, credits: ui.cursors.credits, modCredits: d2.credits });
      if (!zip) return;
      const given = await deliverCustomize(zip.blob, { delivery, onProgress: (share) => setBusy({ label: t('Отправляем на GridStudio… {percent}%', { percent: Math.round(share * 100) }), progress: share }) });
      bg.delivered({ delivery });
      const mb = Math.round(zip.blob.size / 1e6);
      track('customize.build-done', { delivery, parts, mb, pack: packOf(given?.command) || '' });
      if (delivery === 'file') track('customize.download', { mb });
      setHanded(given); setMade({ size: zip.blob.size, entries: zip.entries }); setInstall(true);
    } catch (problem) {
      // A cancel is not a failure.
      if (!problem?.aborted) track('customize.build-fail', { delivery, reason: String(problem?.message || 'error').slice(0, 80) });
      if (!problem?.aborted && !problem?.shown) setError(problem?.message || t('Не получилось собрать файл.'));
      if (problem?.shown) setError(problem.message);
    } finally { setBusy(null); }
  }
  const openSection = (id) => {
    const next = open === id ? '' : id;
    setOpen(next);
    if (next) {
      track('customize.section', { section: next });
      setScene(find(next).scene);
      setTimeout(() => document.querySelector(`.cz-mod[data-id="${next}"]`)?.scrollIntoView({ behavior: 'smooth', block: matchMedia('(max-width: 900px)').matches ? 'start' : 'nearest' }), 380);
    }
  };
  const chooseScene = (id) => { track('customize.scene', { scene: id }); setScene(id); if (open === 'font') setOpen(''); };
  const fields = { bg: <BackgroundFields bg={bg}/>, grid: <GridFields bg={bg}/>, hero: <HeroFields bg={bg}/>, loading: <LoadingFields bg={bg}/>, buttons: <ButtonsFields bg={bg}/>,
    hud: <HudFields ui={ui}/>, chat: <ChatFields ui={ui}/>, cursor: <CursorFields cur={ui.cursors}/>, font: <FontFields font={font}/>, texts: <TextsFields ui={ui}/>,
    ...Object.fromEntries(D2PFX_MODULES.map((id) => [id, <D2pfxFields d2={d2} section={id}/>])) };
  const reset = (id) => (id === 'font' ? font.reset() : ['hud', 'chat', 'cursor', 'texts'].includes(id) ? ui.reset(id) : D2PFX_MODULES.includes(id) ? d2.reset(id) : bg.reset(id));
  const thumb = (id) => id === 'match' ? <span className="cz-thumb-screen"><img src={hudThumb || matchThumb} alt=""/></span> : <MenuThumb bg={bg} page={id}/>;
  // The d2pfx mods the shown scene does not draw (the click plays in the match: DotaCursor.jsx; a HUD skin
  // and HUD parts the emulator can draw are in it: HudCanvas).
  const unseen = d2.plan.picks.filter((mod) => (scene === 'menu' ? mod.section === 'menuparts' : scene === 'match' ? !['menuparts', 'click'].includes(mod.section) && !d2.hudMods.includes(mod.id) : false));
  const encoding = bg.progress !== null;
  const footLine = changed.length ? <><b>{changed.map((module) => module.title).join(', ')}</b>{follow ? ` · ${t('ещё {count} с фоном меню', { count: follow })}` : ''}. {t('Остальное — как в Dota.')}</>
    : follow ? t('Пока всё как в Dota.') : t('Пока всё как в Dota. Открой любой раздел справа.');
  const sizeLine = changed.length ? `${t('изменений: {count}', { count: changed.length })} · ${sizeText(total, estimate)}` : t('пока ничего не изменено');

  return <main className={`cz-work${bg.dragging ? ' is-over' : ''}`} onPointerDownCapture={touch} onKeyDownCapture={touch} onDropCapture={touch}>
    <section className="cz-stage" aria-label={t('Превью')} {...(scene !== 'match' && scene !== 'font' ? bg.drop : {})}>
      <div className="cz-scenebar">
        <Scenes scene={scene} onScene={chooseScene} thumb={thumb} dots={dots}/>
        <div className="cz-meta">
          <button type="button" className="cz-chipbtn" title={t('Пропорции экрана для фона меню')} onClick={() => bg.setAspect(ASPECT_ORDER[(ASPECT_ORDER.indexOf(bg.aspect) + 1) % ASPECT_ORDER.length])}><Icon name="expand"/>{bg.aspect}</button>
          <span>{t('Изменено {count} из {all}', { count: changed.length, all: MODS.length })}</span>
        </div>
      </div>
      <div className="custom-stage-area cz-area">
        {scene === 'match' ? <MatchScreen ui={ui} chat={open === 'chat'} onFrame={setHudThumb} mods={d2.hudMods}/> : scene === 'font' ? <FontScreen font={font}/> : <MenuScreen bg={bg} page={menuPage}/>}
      </div>
      <div className="cz-under">{scene === 'match' ? <MatchUnder ui={ui} chat={open === 'chat'}/> : scene === 'font' ? <p className="custom-caption">{fontCaption()}</p> : <MenuUnder bg={bg} page={menuPage}/>}
        {unseen.length > 0 && open !== 'chat' && <p className="custom-caption d2-under"><Icon name="help" size={13}/>{t('Моды d2pfx ({list}) в этом превью не рисуются — их картинки и видео в разделах справа.', { list: unseen.map((mod) => mod.label).join(', ') })}</p>}</div>
    </section>
    <aside className="cz-panel">
      <div className="cz-panel-body">
        <header className="cz-head"><h1>{t('Оформление Dota')}</h1>
          <p>{t('Фон, интерфейс, шрифт и тексты — на одной странице. Меняй что хочешь: превью само покажет нужный экран, а скачается всё одним файлом.')}</p></header>
        {GROUPS().map(([group, title]) => {
          const list = MODS.filter((module) => module.group === group), count = list.filter((module) => states[module.id] === 'changed').length;
          return <section key={group} className="cz-group">
            <div className="custom-label-row"><span className="custom-label">{title}</span><span className="custom-aside">{count ? t('изменено {count} из {all}', { count, all: list.length }) : t('как в Dota')}</span></div>
            <ul className="cz-mods">{list.map((module) => {
              const state = states[module.id], isOpen = open === module.id, size = partSize(module.id);
              return <li key={module.id} className={`cz-mod${isOpen ? ' is-open' : ''}${module.scene === scene ? ' is-scene' : ''}`} data-id={module.id} data-state={state}>
                <button type="button" className="cz-mod-head" aria-expanded={isOpen} onClick={() => openSection(module.id)}>
                  <span className="cz-mod-icon"><Icon name={module.icon}/></span>
                  <span className="cz-mod-text"><b>{module.title}</b><small>{state === 'default' ? module.text : summary[module.id] || module.text}</small></span>
                  <StateChip state={state}/><Icon name="chevron" className="cz-mod-chev"/>
                </button>
                <div className="cz-mod-body"><div>{isOpen && <div className="cz-mod-fields">{fields[module.id]}
                  <div className="cz-mod-foot"><span>{state === 'changed' ? `${t('В сборке')} · ${size?.bytes ? sizeText(size.bytes, size.estimate) : module.id === 'chat' ? t('в HUD') : t('считаем…')}`
                    : state === 'follow' ? t('Собирается вместе с фоном меню') : t('Не меняется — Dota как есть')}</span>
                    {state === 'changed' && <button type="button" className="catalog-link" onClick={() => reset(module.id)}>{t('Сбросить')}</button>}</div>
                </div>}</div></div>
              </li>;
            })}</ul>
          </section>;
        })}
        <p className="custom-hint cz-next">{t('Что сделать следующим?')} <button type="button" className="catalog-link" onClick={() => openCommunity()}>{t('Напиши в чат GridStudio')}</button></p>
      </div>
      <footer className={`cz-build${inside ? ' is-inside' : ''}`}>
        <div className="cz-build-head"><b>{t('Одним файлом')}</b><span>{sizeLine}</span></div>
        <div className="cz-slots">{MODS.map((module) => <button key={module.id} type="button" className={`is-${states[module.id]}`} data-tip={`${module.title}: ${states[module.id] === 'default' ? t('как в Dota') : summary[module.id] || STATE_LABELS()[states[module.id]]}`}
          aria-label={`${module.title}: ${STATE_LABELS()[states[module.id]]}`} onClick={() => openSection(module.id)}><Icon name={module.icon}/></button>)}</div>
        <p className="cz-line">{footLine}</p>
        {inside && <Receipt rows={rows} files={files} total={total} onOpen={(id) => { if (open !== id) openSection(id); }}/>}
        {error && <Notice error report>{error}</Notice>}
        {BY_HAND ? <p className="cz-os-note">{t('Команда PowerShell — только для Windows. На {system} ставь файлом: «Как установить» ниже.', { system: SYSTEM_NAMES[SYSTEM] })}</p>
          : <Segmented label={t('Как поставить')} value={delivery} onChange={(value) => { setDelivery(value); setHanded(null); }} options={[['command', t('Командой PowerShell')], ['file', t('Только файл')]]}/>}
        {busy || encoding ? <div className="custom-progress" role="status"><span style={{ width: `${Math.round((encoding ? bg.progress : busy.progress ?? 0.15) * 100)}%` }}/>
          <b>{encoding ? t('Собираем видео… {percent}%', { percent: Math.round(bg.progress * 100) }) : busy.label}</b>
          {encoding && <button type="button" className="catalog-icon" aria-label={t('Отменить')} onClick={bg.cancel}><Icon name="close"/></button>}</div>
          : <button type="button" className="catalog-button primary cz-download" disabled={!titles.length || !!bg.fetching} onClick={download}>
            <Icon name={delivery === 'command' ? 'terminal' : 'download'}/>{delivery === 'command' ? t('Собрать и получить команду') : t('Скачать всё одним файлом')}</button>}
        <div className="custom-foot-row"><button type="button" className="catalog-link" aria-expanded={inside} onClick={() => { if (!inside) track('customize.inside'); setInside(!inside); }}>{t('Что внутри')}<Icon name={inside ? 'chevron' : 'chevronUp'} size={14}/></button>
          <button type="button" className="catalog-link" onClick={() => { track('customize.install-help'); setInstall(true); }}>{t('Как установить')}</button></div>
      </footer>
    </aside>
    {PHONE && <div className="cz-phone-bar"><div><b>{changed.length ? sizeLine : t('Пока всё как в Dota')}</b>{changed.map((module) => module.title).join(', ') || t('Всё собирается на компьютере')}</div>
      <a className="catalog-button primary" href={`/api/catalog/pc/${pcCode(location)}`} target="_blank" rel="noopener" onClick={() => track('pc.send', { from: 'customize' })}><Icon name="telegram"/>{t('Прислать на ПК')}</a></div>}
    <MenuWindows bg={bg}/>
    {install && <Install delivery={delivery} handed={delivery === 'command' ? handed : null} made={made} bg={bg} onClose={() => setInstall(false)}/>}
  </main>;
}

// How to install the one file: the command (it was just made for this file), or by hand.
function Install({ delivery, handed, made, bg, onClose }) {
  const [way, setWay] = useState(BY_HAND ? 'file' : delivery);
  const fonts = made ? made.entries.some((entry) => entry.name.startsWith(CUSTOMIZE_DIRS.fonts)) : true;
  return <InstallWindow title={t('Как установить')} onClose={onClose}>
    <p className="catalog-muted cz-install-lead">{t('Одна сборка — фон, интерфейс и шрифт сразу.')}{made ? ` ${t('Файл: {name}, {size}.', { name: CUSTOMIZE_FILE, size: sizeText(made.size) })}` : ''}</p>
    {BY_HAND ? <p className="cz-os-note">{t('У тебя {system}: команда PowerShell работает только в Windows, поэтому ставь вручную.', { system: SYSTEM_NAMES[SYSTEM] })}</p>
      : <Segmented label={t('Как поставить')} value={way} onChange={setWay} options={[['command', t('Командой PowerShell')], ['file', t('Вручную')]]}/>}
    {way === 'command' ? <ol>
      <li>{handed ? t('Сборка сохранена на GridStudio на 7 дней — команда скачает именно её, ничего искать не нужно.') : t('Выбери «Командой PowerShell» и нажми «Собрать и получить команду»: сборка отправится на GridStudio на 7 дней, а здесь появится команда именно для неё.')}</li>
      {handed && <li>{t('Скопируй команду:')}<CopyField value={handed.command} onCopy={() => track('customize.command-copy', { pack: packOf(handed.command) })}/></li>}
      <li>{rich(t('Открой PowerShell ({key}, набери PowerShell, {enter}), вставь команду и нажми {enter}.'), { key: <kbd>Win</kbd>, enter: <kbd>Enter</kbd> })}</li>
      <li>{t('Она сама найдёт Dota через Steam, попросит закрыть игру, сохранит файлы Dota, положит фон и интерфейс в dota_russian, шрифт — в panorama\\fonts, и включит русскую озвучку. То, чего больше нет в сборке, она уберёт. Запусти Dota.')}</li>
    </ol> : <ol>
      <li>{t('Закрой Dota 2.')}</li>
      <li>{rich(t('В Steam: Dota 2 → «Свойства» → «Установленные файлы» → «Обзор». Откроется папка {folder}.'), { folder: <code>dota 2 beta</code> })}</li>
      {fonts && <li>{rich(t('На всякий случай скопируй куда-нибудь папку {folder}: шрифт из сборки заменит шрифты Dota.'), { folder: <code>game\dota\panorama\fonts</code> })}</li>}
      <li>{rich(t('Распакуй архив и скопируй его папку {game} в {folder} {replace}.'), { game: <code>game</code>, folder: <code>dota 2 beta</code>, replace: <b>{t('с заменой')}</b> })}</li>
      {fonts && !BY_HAND && <li>{rich(t('Если есть папка {folder}, удали её: там старый кэш шрифтов.'), { folder: <CopyField value="%TEMP%\fontconfig"/> })}</li>}
      <li>{t('В настройках Dota поставь русский язык озвучки: моды Dota читает только из папки dota_russian. Интерфейс можно оставить английским. Если в параметрах запуска Dota есть -language (кроме -language russian), убери его.')}</li>
      <li>{t('Запусти Dota 2.')}</li>
    </ol>}
    <DotaLanguage bg={bg}/>
    {!BY_HAND && <><p className="catalog-muted">{t('Вернуть всё как было — вставь в PowerShell:')}</p><CopyField value={handed?.remove || customizeRemoveCommand()}/></>}
    <p className="catalog-muted">{t('Или в Steam: «Проверить целостность файлов игры» вернёт шрифты; файлы в dota_russian удали сам.')}</p>
    <MenuVersion/>
  </InstallWindow>;
}
