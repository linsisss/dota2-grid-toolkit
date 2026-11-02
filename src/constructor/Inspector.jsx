import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { Icon } from '../catalog/Common.jsx';
import { t } from '../../scripts/i18n.mjs';
import { sizeText } from '../customize/ui.jsx';
import { ButtonsFields, MenuUnder } from '../customize/MenuBackground.jsx';
import { MatchUnder } from '../customize/InterfaceBuilder.jsx';
import { fontCaption } from '../customize/FontPicker.jsx';
import { StateChip } from '../customize/CustomizePage.jsx';

// The inspector of the constructor (the approved variant B): one card that floats next to what is selected
// on the screen (a widget, one of Valve's panels) or stays at the right (a section opened from the dock, or
// the scene when nothing is selected), and folds to its header.
export const SLOTS = () => ({
  topbar: { title: t('Верхняя панель'), icon: 'template', modules: ['menuparts', 'buttons'], focus: { menuparts: t('Верхняя панель') } },
  friends: { title: t('Друзья и группа'), icon: 'user', modules: ['buttons'] },
  news: { title: t('Новости'), icon: 'news', modules: ['buttons'] },
  chat: { title: t('Чат'), icon: 'chat', modules: ['buttons'] },
  play: { title: t('Кнопка «Играть»'), icon: 'play', modules: ['menuparts'], focus: { menuparts: t('Кнопка «Играть»') } }
});

// The card: where it is (next to `rect` on the screen, else docked at the right), folded or not, away
// while something is dragged.
export function InspectorShell({ kind, rect, board, live, folded, onFold, wide, children, head, layoutKey }) {
  const card = useRef(null), dragging = useSyncExternalStore(live.subscribe, live.get);
  const place = () => {
    const node = card.current;
    if (!node) return;
    // Above the shelf while it is open, above the dock otherwise.
    const shelf = document.querySelector('.kz-shelf:not(.is-closed)')?.getBoundingClientRect(), bottom0 = shelf ? shelf.top - 12 : innerHeight - 96, top0 = 68;
    node.style.maxHeight = `${Math.max(180, Math.min(680, bottom0 - top0))}px`;
    const page = rect && board.current?.toPage(rect);
    if (!page) { node.classList.add('is-docked'); node.style.left = ''; node.style.top = ''; return; }
    node.classList.remove('is-docked');
    const width = node.offsetWidth, height = node.offsetHeight, gap = 16;
    let left = page.right + gap;
    if (left + width > innerWidth - 12) left = page.left - gap - width;
    if (left < 12) left = innerWidth - width - 16;
    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(Math.max(top0, Math.min(bottom0 - height, page.top)))}px`;
  };
  const latest = useRef(place); latest.current = place;
  useLayoutEffect(place);
  useEffect(() => { const resize = () => latest.current(); addEventListener('resize', resize); return () => removeEventListener('resize', resize); }, []);
  useEffect(() => { place(); }, [layoutKey]);
  return <aside ref={card} className={`kz-glass kz-insp is-${kind}${wide ? ' is-wide' : ''}${folded ? ' is-folded' : ''}${dragging ? ' is-away' : ''}`} aria-label={t('Свойства')}>
    <header className="kz-insp-head">{head}
      <button type="button" className="kz-iconbtn kz-fold" aria-expanded={!folded} title={folded ? t('Развернуть') : t('Свернуть')} onClick={onFold}><Icon name="chevronUp" size={16}/></button></header>
    {!folded && <div className="kz-insp-body">{children}</div>}
  </aside>;
}
export function Head({ icon, title, sub, tone = '' }) {
  return <div className="kz-head"><span className={`kz-tile-ico${tone ? ` is-${tone}` : ''}`}><Icon name={icon} size={18}/></span><div><b>{title}</b>{sub && <small>{sub}</small>}</div></div>;
}

// What a module's foot says: in the file and its size, or why not.
function Foot({ page, id }) {
  const state = page.states[id], size = page.partSize(id);
  return <footer className="kz-insp-foot"><span>{state === 'changed' ? `${t('В сборке')} · ${size?.bytes ? sizeText(size.bytes, size.estimate) : id === 'chat' ? t('в HUD') : t('считаем…')}`
    : state === 'follow' ? t('Собирается вместе с фоном меню') : t('Не меняется — Dota как есть')}</span>
    {state === 'changed' && <button type="button" className="catalog-link" onClick={() => page.reset(id)}>{t('Сбросить')}</button>}</footer>;
}
// Above a module's settings: what lives under the old page's preview (the video's piece, the chat's places, the font's line).
function Under({ page, id }) {
  const { bg, ui, menuPage, scene } = page;
  // The piece of a video (and what the preview is) once there is a background to show.
  const own = id === 'bg' ? bg.file : bg.view(id)?.mode === 'own' ? bg.view(id).own.file : bg.file && bg.view(id)?.mode !== 'off';
  if (['bg', 'grid', 'hero', 'loading'].includes(id) && page.find(id).scene === scene && own) return <div className="kz-under"><MenuUnder bg={bg} page={menuPage}/></div>;
  if (id === 'chat' && scene === 'match') return <div className="kz-under"><MatchUnder ui={ui} chat/></div>;
  if (id === 'font') return <div className="kz-under"><p className="custom-caption">{fontCaption()}</p></div>;
  return null;
}
// `part`: of «Кнопки меню», only what is about one of Valve's panels (MenuBackground.jsx ButtonsFields).
export function ModuleBody({ page, id, part = null }) {
  const unseen = page.unseen.filter((mod) => mod.section === id);
  return <>
    <Under page={page} id={id}/>
    <div className="kz-sec kz-fields cz-mod-fields">{id === 'buttons' && part ? <ButtonsFields bg={page.bg} part={part}/> : page.fields[id]}</div>
    {unseen.length > 0 && <p className="custom-caption kz-unseen"><Icon name="help" size={13}/>{t('В этом превью не рисуется — смотри картинку и видео мода выше.')}</p>}
    <Foot page={page} id={id}/>
  </>;
}
export const moduleSub = (page, id) => {
  const state = page.states[id], size = page.partSize(id);
  const label = { changed: t('Своё'), follow: t('Как в меню'), default: t('Как в Dota') }[state];
  return state === 'changed' && size?.bytes ? `${label} · ${sizeText(size.bytes, size.estimate)}` : label;
};

// One of Valve's panels: its sections (a tab each), scrolled to the part about this panel.
export function SlotBody({ page, slot, tab, onTab, onModule }) {
  const def = SLOTS()[slot], body = useRef(null);
  useEffect(() => {
    const want = def.focus?.[tab];
    if (!want) return undefined;
    const timer = setTimeout(() => {
      const found = [...(body.current?.querySelectorAll('.custom-label, .custom-toggle b') || [])].find((node) => node.textContent.trim() === want);
      const row = found?.closest('.custom-field, .custom-toggle');
      if (!row) return;
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      row.classList.remove('kz-flash'); void row.offsetWidth; row.classList.add('kz-flash');
    }, 120);
    return () => clearTimeout(timer);
  }, [slot, tab]);
  return <div ref={body}>
    {def.modules.length > 1 && <div className="kz-tabs" role="tablist">{def.modules.map((id) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => onTab(id)}>
      {page.find(id).title}{page.states[id] === 'changed' && <i className="kz-dot"/>}</button>)}</div>}
    <ModuleBody page={page} id={tab} part={tab === 'buttons' ? slot : null}/>
    {slot === 'chat' && <div className="kz-sec"><p className="kz-note"><Icon name="chat" size={15}/><span>{t('Здесь — чат главного меню. Место и ширину чата в матче меняй в разделе «Чат».')}</span></p>
      <button type="button" className="catalog-button" onClick={() => onModule('chat')}><Icon name="chat"/>{t('Открыть «Чат» матча')}</button></div>}
  </div>;
}

// Nothing selected: the scene, its sections, Valve's panels (on the main menu), the canvas' switches.
export function SceneBody({ page, onModule, onSlot, zones, onZones, snap, onSnap, widgetsCount }) {
  const { scene, MODS, states, summary } = page, list = MODS.filter((module) => module.scene === scene);
  return <>
    {scene === 'menu' && <p className="custom-hint kz-sec">{widgetsCount ? t('Тяни виджеты по экрану, углы меняют размер (Shift — с теми же пропорциями). Клик по панели Valve открывает её настройки.')
      : t('Перетащи виджет из «Виджетов» внизу на экран — он встанет в меню Dota туда же. Клик по панели Valve открывает её настройки.')}</p>}
    <div className="kz-sec"><span className="custom-label">{t('Разделы этой сцены')}</span>
      <ul className="kz-rows">{list.map((module) => <li key={module.id}><button type="button" onClick={() => onModule(module.id)}><span className="kz-row-ico"><Icon name={module.icon} size={15}/></span>
        <span className="kz-row-text">{module.title}<small>{states[module.id] === 'default' ? module.text : summary[module.id] || module.text}</small></span><StateChip state={states[module.id]}/></button></li>)}</ul></div>
    {scene === 'menu' && <div className="kz-sec"><span className="custom-label">{t('Панели Valve')}</span>
      <ul className="kz-rows">{Object.entries(SLOTS()).map(([id, def]) => <li key={id}><button type="button" onClick={() => onSlot(id)}><span className="kz-row-ico is-zone"><Icon name={def.icon} size={15}/></span>
        <span className="kz-row-text">{def.title}</span><Icon name="chevronRight" size={15}/></button></li>)}</ul></div>}
    {page.unseen.length > 0 && <p className="custom-caption kz-sec kz-unseen"><Icon name="help" size={13}/>{t('Моды d2pfx ({list}) в этом превью не рисуются — их картинки и видео в их разделах.', { list: page.unseen.map((mod) => mod.label).join(', ') })}</p>}
    <div className="kz-sec custom-switches">
      <label className="custom-toggle"><input type="checkbox" role="switch" checked={zones} onChange={(event) => onZones(event.target.checked)}/><span><b>{t('Зоны Valve')}</b><small>{t('Где лежат панели самой Dota')}</small></span></label>
      <label className="custom-toggle"><input type="checkbox" role="switch" checked={snap} onChange={(event) => onSnap(event.target.checked)}/><span><b>{t('Прилипание')}</b><small>{t('К краям, центру и колонкам Valve. Alt — временно без него')}</small></span></label>
    </div>
  </>;
}
