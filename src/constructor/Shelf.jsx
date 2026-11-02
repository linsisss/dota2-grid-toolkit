import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../catalog/Common.jsx';
import { lang, locale, t } from '../../scripts/i18n.mjs';
import { WIDGET_TYPES, WIDGET_TYPE_IDS } from '../../scripts/menu-widgets.mjs';
import { CUSTOMIZE_PATH, STUDIO_PATH } from '../catalog/api.js';
import { backgroundMedia, useBackgrounds } from '../catalog/BackgroundGallery.jsx';
import { isAdultWork } from '../catalog/Sensitive.jsx';
import { MenuThumb } from '../customize/MenuBackground.jsx';
import { StateChip } from '../customize/CustomizePage.jsx';
import { LookBar } from '../customize/LookBar.jsx';
import { catalog } from '../customize/d2pfx-pack.js';
import { skinThumb } from '../customize/d2pfx-hud.js';
import { creditLine } from '../customize/d2pfx-ui.jsx';
import { lookPosterURL, syncLooks } from '../studio-looks.js';
import { WidgetMini, freshWidget } from './WidgetView.jsx';
import { WORKSHOP_SORTS, WorkshopRow } from './WorkshopShelf.jsx';
import { publishedState, usePublished } from './workshop.js';
import matchThumb from '../../assets/customize/match-thumb.webp';

// The dock at the bottom and the shelf above it (the approved variant B): the widgets to drag onto the
// screen, the sections of every module as cards with live pictures (they open in the inspector), the
// workshop's backgrounds, «Студия»'s customizations, and a search over all of it and d2pfx's mods.
export const CATEGORIES = () => [
  ['widgets', t('Виджеты'), 'groupPlus'], ['backgrounds', t('Фоны'), 'image'], ['d2pfx', 'd2pfx', 'zap'], ['hud', 'HUD', 'sliders'],
  ['cursor', t('Курсор'), 'cursor'], ['font', t('Шрифт'), 'font'], ['mine', t('Мои'), 'studio']
];
export const CATEGORY_MODULES = { backgrounds: ['bg', 'grid', 'hero', 'loading', 'buttons'], d2pfx: ['menuparts', 'hudskin', 'hudparts', 'click', 'pings', 'deny', 'voice'], hud: ['hud', 'chat', 'portraits'], cursor: ['cursor'], font: ['font', 'texts'] };
const TITLES = () => ({ widgets: t('Виджеты'), backgrounds: t('Фоны'), d2pfx: t('Моды d2pfx'), hud: t('HUD и матч'), cursor: t('Курсор'), font: t('Шрифт и тексты'), mine: t('Мои оформления'), search: t('Вся библиотека') });
const HINTS = () => ({
  widgets: t('Перетащи на экран или нажми — встанет в середину. Свой виджет собирается из блоков в редакторе.'),
  backgrounds: t('Фон меню и других экранов, кнопки меню. Фон из мастерской можно бросить прямо на экран.'),
  d2pfx: t('Моды с Dota2PornFX: автор указан у каждого. Открой раздел, чтобы выбрать.'),
  hud: t('Интерфейс в матче: вид HUD, чат, портреты героев.'),
  cursor: t('Курсор в меню и в матче: как в Dota, пак d2pfx или свой.'),
  font: t('Шрифт всех надписей Dota и виджетов, свои тексты.'),
  mine: t('Оформления, сохранённые в «Студии». Открой любое — текущее останется там, где сохранено.'),
  search: t('Разделы, виджеты и моды d2pfx.'),
  workshop: t('Собраны пользователями, проверены модератором.')
});
export const WIDGET_TEXTS = () => ({
  clock: t('Время и дата, 24 или 12 часов'), timer: t('Сколько осталось до твоей даты'), text: t('Любая надпись'), shortcut: t('Открывает раздел Dota или ссылку'),
  image: t('PNG, JPEG, WebP или GIF'), video: t('MP4 или WebM, без звука'), miniProfile: t('Аватар, ник и медаль — панель Dota'), lastMatch: t('Герой, исход и счёт — панель Dota'), topLive: t('Матч в эфире — панель Dota'),
  custom: t('Свой, из блоков')
});
// The ready widgets of the shelf: every type but «Свой виджет» (that one is made in the editor) and «Лайв-матч»:
// Valve no longer puts the top live match on its front page, and in Dota the panel stays empty under its title
// (two in-game tests, 2026-10-31 and 11-01). One already on a menu stays and is built as before.
const READY_TYPES = WIDGET_TYPE_IDS.filter((type) => type !== 'custom' && type !== 'topLive');
const modLabel = (mod) => mod.label || (mod.style ? `${mod.name} ${mod.style}` : mod.name);
const sectionMods = (section) => Object.values(catalog.mods).filter((mod) => mod.section === section);
const modPicture = (mod) => ((mod.section === 'hudskin' || mod.section === 'hudparts') && skinThumb(mod.id)) || mod.preview || '';

export function Dock({ shelf, onShelf }) {
  return <nav className="kz-glass kz-dock" aria-label={t('Библиотека')}>
    {CATEGORIES().map(([id, title, icon]) => <button key={id} type="button" aria-pressed={shelf === id} onClick={() => onShelf(shelf === id ? '' : id)}><Icon name={icon}/><span>{title}</span></button>)}
    <span className="kz-vr" aria-hidden="true"/>
    <button type="button" aria-pressed={shelf === 'search'} onClick={() => onShelf(shelf === 'search' ? '' : 'search')}><Icon name="search"/><span>{t('Найти')}</span></button>
  </nav>;
}

// A widget's card: its live picture; dragged onto the screen, or clicked to land in the middle.
function WidgetCard({ type, onPick }) {
  const sample = useMemo(() => freshWidget(type, { id: `wcard${type.length}` }), [type]);
  return <button type="button" className="kz-tile" onPointerDown={(event) => onPick(event, type)} title={WIDGET_TEXTS()[type]}>
    <span className="kz-tile-pv is-widget"><WidgetMini widget={sample} box={[164, 102]}/></span>
    <b>{t(WIDGET_TYPES[type].title)}</b><small>{WIDGET_TEXTS()[type]}</small></button>;
}
// «Создать свой виджет»: «Редактор виджета» with a new design.
function CreateCard({ onCreate }) {
  return <button type="button" className="kz-tile is-new kz-create" onClick={onCreate}><Icon name="edit"/><b>{t('Создать свой виджет')}</b><small>{t('из блоков: текст, кнопки, картинки')}</small></button>;
}
// A design of «Мои виджеты»: its live picture; dragged onto the screen or clicked (into the middle); edit, delete.
const SHARED = () => ({ pending: t('на проверке'), approved: t('в мастерской'), rejected: t('отклонён'), hidden: t('скрыт') });
function DesignCard({ item, onDesign, onPlace, onEdit, onDelete }) {
  const sample = useMemo(() => ({ type: 'custom', w: item.design.size[0], h: item.design.size[1], props: { design: item.design } }), [item]);
  // Sent to «Мастерская виджетов» as it is now (workshop.js): its state there.
  const shared = publishedState(usePublished()[item.id], item.design);
  return <div role="button" tabIndex={0} className="kz-tile kz-design-tile" title={t('Перетащи на экран или нажми — встанет в середину')}
    onPointerDown={(event) => { if (!event.target.closest('.kz-tile-acts')) onDesign(event, item); }}
    onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onPlace(item); } }}>
    <span className="kz-tile-pv is-widget"><WidgetMini widget={sample} box={[164, 102]}/>{shared && <span className={`kz-wk-state is-${shared.status} is-small`}>{SHARED()[shared.status]}</span>}</span>
    <span className="kz-tile-acts">
      <button type="button" title={t('Изменить в редакторе')} aria-label={t('Изменить «{name}»', { name: item.design.name })} onPointerDown={(event) => event.stopPropagation()} onClick={() => onEdit(item.id)}><Icon name="edit" size={14}/></button>
      <button type="button" className="is-danger" title={t('Удалить')} aria-label={t('Удалить «{name}»', { name: item.design.name })} onPointerDown={(event) => event.stopPropagation()} onClick={() => onDelete(item)}><Icon name="trash" size={14}/></button>
    </span>
    <b>{item.design.name}</b><small>{item.design.size.join(' × ')} · {new Date(item.updated).toLocaleDateString(locale, { day: 'numeric', month: 'long' })}</small></div>;
}
// A section's card: what it looks like now, its state; it opens in the inspector.
function ModuleCard({ page, id, active, onModule }) {
  const module = page.find(id), state = page.states[id], { bg, d2, font } = page;
  let picture;
  if (['bg', 'grid', 'hero', 'loading'].includes(id) || id === 'buttons' || id === 'texts') picture = <span className="kz-thumb"><MenuThumb bg={bg} page={['bg', 'buttons', 'texts'].includes(id) ? 'menu' : id} mods={d2.menuLook}/></span>;
  else if (id === 'hud' || id === 'chat') picture = <img src={page.hudThumb || matchThumb} alt=""/>;
  else if (module.d2pfx) {
    const chosen = d2.picksOf(id)[0], src = chosen ? modPicture(chosen) : modPicture(sectionMods(id).find((mod) => modPicture(mod)) || {});
    picture = src ? <img src={src} alt="" loading="lazy" decoding="async"/> : <span className="kz-tile-face"><Icon name={module.icon} size={26}/></span>;
  } else if (id === 'font') picture = <span className="kz-tile-face is-font" style={font.changed && font.previewFamily ? { fontFamily: `'${font.previewFamily}'` } : undefined}>{t('Аа Привет, Dota')}</span>;
  else picture = <span className="kz-tile-face"><Icon name={module.icon} size={26}/></span>;
  // Not a <button>: the menu's live picture (DotaMenu.jsx) has buttons of its own.
  return <div role="button" tabIndex={0} className={`kz-tile is-module${active ? ' is-on' : ''}`} onClick={() => onModule(id)}
    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onModule(id); } }}>
    <span className="kz-tile-pv" inert>{picture}<StateChip state={state}/></span>
    <b>{module.title}</b><small>{state === 'default' ? module.text : page.summary[id] || module.text}</small></div>;
}
const authorOf = (item) => item.creator?.nickname || item.creator?.name || item.author || '';
// The workshop's popular backgrounds for this screen: a click, or a drop on the screen, puts one in «Фон меню».
function Workshop({ page, onWorkshop }) {
  const { items } = useBackgrounds({ sort: 'popular', aspect: page.bg.aspect });
  const list = (items || []).filter((item) => !isAdultWork(item)).slice(0, 10), chosen = page.bg.origin?.kind === 'workshop' ? page.bg.origin.id : null;
  return <>
    <span className="kz-sub">{t('Из мастерской')}</span>
    {items === null && [0, 1, 2].map((i) => <span key={i} className="kz-tile is-empty"><span className="kz-tile-pv"/></span>)}
    {list.map((item) => <button key={item.id} type="button" className={`kz-tile${chosen === item.id ? ' is-on' : ''}`} title={item.title} onPointerDown={(event) => onWorkshop(event, item)}>
      <span className="kz-tile-pv"><img src={backgroundMedia(item.id, 'poster.jpg')} alt="" loading="lazy" draggable={false}/></span><b>{item.title}</b><small>{authorOf(item) || t('Без подписи')}</small></button>)}
    <button type="button" className="kz-tile is-new" onClick={() => page.bg.setBrowsing('menu')}><Icon name="workshop"/><b>{t('Все фоны')}</b><small>{t('мастерская')}</small></button>
    <button type="button" className="kz-tile is-new" onClick={() => page.bg.input.current?.click()}><Icon name="upload"/><b>{t('Свой файл')}</b><small>{t('картинка, GIF или видео')}</small></button>
  </>;
}
// «Мои»: «Студия»'s customizations; opening one replaces the page's state (CustomizeApp.jsx ?look).
function Mine({ page }) {
  const { looks, bg } = page, user = bg.auth?.user?.id || null, [list, setList] = useState(null);
  useEffect(() => {
    if (bg.auth?.loading) return undefined;
    let gone = false;
    syncLooks(user).then(({ items }) => { if (!gone) setList(items); }).catch(() => !gone && setList([]));
    return () => { gone = true; };
  }, [user, bg.auth?.loading, looks.link?.id]);
  const posters = useMemo(() => new Map((list || []).filter((item) => item.poster instanceof Blob).map((item) => [item.id, URL.createObjectURL(item.poster)])), [list]);
  useEffect(() => () => { for (const url of posters.values()) URL.revokeObjectURL(url); }, [posters]);
  const open = (item) => { location.href = `${CUSTOMIZE_PATH}?look=${item.id}`; };
  return <>
    <div className="kz-tile kz-mine-bar"><LookBar looks={looks} auth={bg.auth}/></div>
    {list === null && <p className="kz-shelf-empty">{t('Загружаем…')}</p>}
    {list?.map((item) => <button key={item.id} type="button" className={`kz-tile${looks.link?.id === item.id ? ' is-on' : ''}`} onClick={() => open(item)} disabled={looks.link?.id === item.id} title={item.name}>
      <span className="kz-tile-pv">{posters.get(item.id) || item.cloud ? <img src={posters.get(item.id) || lookPosterURL(item.id)} alt="" loading="lazy"/> : <span className="kz-tile-face"><Icon name="template" size={26}/></span>}
        {looks.link?.id === item.id && <span className="cz-state is-changed">{t('Открыто')}</span>}</span>
      <b>{item.name}</b><small>{new Date(item.updated).toLocaleDateString(locale, { day: 'numeric', month: 'long' })}{item.cloud ? ` · ${t('в аккаунте')}` : ''}</small></button>)}
    {list?.length === 0 && <p className="kz-shelf-empty">{t('Пока ничего не сохранено. «Сохранить в Студию» слева — и здесь появится это оформление.')}</p>}
    <a className="kz-tile is-new" href={`${STUDIO_PATH}&show=looks`}><Icon name="studio"/><b>{t('Студия')}</b><small>{t('все оформления')}</small></a>
  </>;
}
// The search: sections, widgets and d2pfx's mods.
function Found({ page, query, onModule, onPick, onMod, open, mine }) {
  const q = query.trim().toLowerCase(), has = (...texts) => texts.some((text) => text && String(text).toLowerCase().includes(q));
  const modules = page.MODS.filter((module) => !q || has(module.title, module.text, page.summary[module.id]));
  const widgets = READY_TYPES.filter((type) => !q || has(t(WIDGET_TYPES[type].title), WIDGET_TEXTS()[type]));
  const designs = mine.designs.filter((item) => !q || has(item.design.name, t('Свой виджет')));
  const mods = q.length >= 2 ? Object.values(catalog.mods).filter((mod) => has(modLabel(mod), mod.name, creditLine(mod.credits), page.find(mod.section)?.title)).slice(0, 30) : [];
  if (!modules.length && !widgets.length && !mods.length && !designs.length) return <p className="kz-shelf-empty">{t('Ничего не нашлось. Попробуй «часы», «курсор» или «фон».')}</p>;
  return <>
    {designs.length > 0 && <><span className="kz-sub">{t('Мои виджеты')}</span>{designs.map((item) => <DesignCard key={item.id} item={item} {...mine.actions}/>)}</>}
    {widgets.length > 0 && <><span className="kz-sub">{t('Виджеты')}</span>{widgets.map((type) => <WidgetCard key={type} type={type} onPick={onPick}/>)}</>}
    {modules.length > 0 && <><span className="kz-sub">{t('Разделы')}</span>{modules.map((module) => <ModuleCard key={module.id} page={page} id={module.id} active={open === module.id} onModule={onModule}/>)}</>}
    {mods.length > 0 && <><span className="kz-sub">{t('Моды d2pfx')}</span>{mods.map((mod) => {
      const chosen = page.d2.choice[mod.section]?.[mod.slot] === mod.id, src = modPicture(mod);
      return <button key={mod.id} type="button" className={`kz-tile${chosen ? ' is-on' : ''}`} onClick={() => onMod(mod)} title={modLabel(mod)}>
        <span className="kz-tile-pv">{src ? <img src={src} alt="" loading="lazy" decoding="async"/> : <span className="kz-tile-face"><Icon name="zap" size={26}/></span>}</span>
        <b>{modLabel(mod)}</b><small>{page.find(mod.section)?.title} · {creditLine(mod.credits)}</small></button>;
    })}</>}
  </>;
}

// `widgetTab`: the shelf «Виджеты» shows 'library' (one's own and the ready ones) or 'workshop' («Мастерская
// виджетов», WorkshopShelf.jsx: its sort and search are the head's while it is shown).
export function Shelf({ shelf, onShelf, query, onQuery, page, open, onModule, onPick, onWorkshop, onMod, designs = [], onDesign, onPlace, onCreate, onEditDesign, onDeleteDesign,
  widgetTab = 'library', onWidgetTab = () => {}, onWorkshopPick, onWorkshopAdd, onWorkshopSave, onSay = () => {} }) {
  const row = useRef(null), input = useRef(null);
  const [workSort, setWorkSort] = useState('popular'), [workQuery, setWorkQuery] = useState('');
  const workshop = shelf === 'widgets' && widgetTab === 'workshop';
  useEffect(() => { if (row.current) row.current.scrollLeft = 0; }, [shelf, query, widgetTab, workSort, workQuery]);
  useEffect(() => { if (shelf === 'search') input.current?.focus(); }, [shelf]);
  // The wheel scrolls the row sideways (Firefox counts it in lines, ~40 px each, or pages). The row has no
  // scroll-snap: it took each step of the wheel back to the nearest card, so the row did not move at all.
  useEffect(() => {
    const node = row.current;
    if (!node) return undefined;
    const wheel = (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      node.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? node.clientWidth : 1); event.preventDefault();
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [shelf]);
  const searching = !workshop && (shelf === 'search' || query.trim());
  const title = query.trim() && !workshop ? t('Найдено: «{query}»', { query: query.trim() }) : TITLES()[shelf];
  let content = null;
  const mine = { designs, actions: { onDesign, onPlace, onEdit: onEditDesign, onDelete: onDeleteDesign } };
  if (searching) content = <Found page={page} query={query} onModule={onModule} onPick={onPick} onMod={onMod} open={open} mine={mine}/>;
  else if (workshop) content = <WorkshopRow sort={workSort} query={workQuery} onPick={onWorkshopPick} onAdd={onWorkshopAdd} onSave={onWorkshopSave} onCreate={onCreate} onSay={onSay}/>;
  else if (shelf === 'widgets') content = <>
    <CreateCard onCreate={onCreate}/>
    {designs.length > 0 && <><span className="kz-sub">{t('Мои виджеты')}</span>{designs.map((item) => <DesignCard key={item.id} item={item} {...mine.actions}/>)}</>}
    <span className="kz-sub">{t('Готовые')}</span>
    {READY_TYPES.map((type) => <WidgetCard key={type} type={type} onPick={onPick}/>)}
  </>;
  else if (shelf === 'mine') content = <Mine page={page}/>;
  else if (CATEGORY_MODULES[shelf]) content = <>{CATEGORY_MODULES[shelf].map((id) => <ModuleCard key={id} page={page} id={id} active={open === id} onModule={onModule}/>)}
    {shelf === 'backgrounds' && <Workshop page={page} onWorkshop={onWorkshop}/>}</>;
  return <section className={`kz-glass kz-shelf${shelf ? '' : ' is-closed'}`} aria-label={t('Библиотека')} aria-hidden={!shelf}>
    {shelf && <>
      <div className={`kz-shelf-head${shelf === 'widgets' && !searching ? ' has-tabs' : ''}`}><h2>{title}</h2>
        {shelf === 'widgets' && !searching && <div className="kz-shelf-tabs" role="tablist" aria-label={t('Какие виджеты')}>
          {[['library', t('Свои и готовые')], ['workshop', t('Мастерская')]].map(([id, text]) => <button key={id} type="button" role="tab" aria-selected={widgetTab === id}
            onClick={() => { onWidgetTab(id); if (id === 'workshop') onQuery(''); }}>{id === 'workshop' && <Icon name="workshop" size={14}/>}{text}</button>)}</div>}
        {workshop ? <div className="kz-shelf-hint kz-wk-head"><div className="kz-wk-sort" role="radiogroup" aria-label={t('Порядок')}>{WORKSHOP_SORTS().map(([id, text]) =>
          <button key={id} type="button" role="radio" aria-checked={workSort === id} onClick={() => setWorkSort(id)}>{text}</button>)}</div>
          <span title={HINTS().workshop}>{HINTS().workshop}</span></div>
          : <span className="kz-shelf-hint">{searching ? HINTS().search : HINTS()[shelf]}</span>}
        {workshop ? <label className="kz-search"><Icon name="search" size={15}/><input type="search" value={workQuery} placeholder={t('Найти в мастерской')} autoComplete="off" maxLength={60} aria-label={t('Найти в мастерской виджетов')} onChange={(event) => setWorkQuery(event.target.value)}/></label>
          : <label className="kz-search"><Icon name="search" size={15}/><input ref={input} type="search" value={query} placeholder={t('Найти во всей библиотеке')} autoComplete="off" aria-label={t('Найти во всей библиотеке')} onChange={(event) => onQuery(event.target.value)}/></label>}
        <button type="button" className="kz-iconbtn" title={t('Закрыть (Esc)')} aria-label={t('Закрыть')} onClick={() => onShelf('')}><Icon name="close" size={16}/></button></div>
      <div className="kz-shelf-row" ref={row} lang={lang}>{content}</div>
    </>}
  </section>;
}
