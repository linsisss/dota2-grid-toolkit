import { Fragment } from 'react';
import { Icon } from '../catalog/Common.jsx';
import { lang, locale, t } from '../../scripts/i18n.mjs';
import { WIDGET_ACTIONS, WIDGET_TYPES, newWidget } from '../../scripts/menu-widgets.mjs';
import { pad, useMediaURL, useNow } from './live.js';
import { DesignView } from './BlockView.jsx';
import avatar from '../../assets/dota-menu/ui/avatar.webp';
import medal from '../../assets/dota-menu/ui/rank-medal.webp';
import showcase from '../../assets/dota-menu/ui/profile-showcase.webp';
import profileHead from '../../assets/dota-menu/ui/profile-head.webp';
import invoker from '../../assets/heroes/74.webp';

// A widget as Dota will draw it on the main menu (scripts/menu-widgets.mjs), in 1080p pixels: its box is
// the widget's size, so the same drawing serves the screen (scaled with it) and the shelf's cards. Clocks
// and timers tick, a video plays muted. Dota's own panels (the mini-profile, the last match, the top live
// match) are drawn by the game with the data of whoever installs the file: here, stand-ins of their look.
// The text is Radiance, the game's font (or the font chosen in «Шрифт» for it).

// The ticking clock and the user's files as addresses live in live.js (the blocks of «Редактор виджета» use them too).
export { pad, rememberMediaURL, useMediaURL, useNow } from './live.js';

// A new widget with its words in the site's language (Dota shows them as they are).
export function freshWidget(type, place) {
  const widget = newWidget(type, place), p = widget.props;
  if (type === 'text') p.text = t(p.text);
  if (type === 'timer') p.title = t(p.title);
  if (type === 'shortcut') p.label = t(WIDGET_ACTIONS[p.action].title);
  return widget;
}

// A widget's name in the layers and on its frame: its type, and its own words where it has them.
export function widgetName(widget) {
  const def = WIDGET_TYPES[widget.type], title = t(def?.title || widget.type), p = widget.props || {};
  if (widget.type === 'custom') return p.design?.name || title;
  const words = widget.type === 'text' ? p.text : widget.type === 'shortcut' ? p.label : widget.type === 'timer' ? p.title : '';
  const short = (words || '').length > 22 ? `${words.slice(0, 21)}…` : words;
  return short ? `${title} «${short}»` : title;
}

// The ready widgets' look (scripts/menu-widgets.mjs widgetRules, 2026-11-02): the graphite card with its light top edge and
// the line of the widget's colour; captions in small spaced capitals. Sizes as the menu pack computes them.
const Edge = ({ on }) => (on ? <i className="kz-w-edge"/> : null);
// The dial (look 'round'): twelve marks, the hands turned by the time, the date under the middle (menu-widgets.mjs).
function Dial({ widget }) {
  const at = useNow(), p = widget.props, now = new Date(at), d = Math.min(widget.w, widget.h);
  const sec = now.getSeconds(), min = now.getMinutes() + sec / 60, hour = (now.getHours() % 12) + min / 60;
  const date = lang === 'en' ? now.toLocaleDateString(locale, { month: 'short', day: 'numeric' }) : now.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  return <div className={`kz-w kz-w-dial${p.panel ? ' is-card' : ''}`} style={{ '--tone': p.color, '--d': `${d}px` }}>
    <div className="kz-w-face">
      {Array.from({ length: 12 }, (_, i) => <i key={i} className={`kz-w-mark${i % 3 ? '' : ' is-major'}`} style={{ transform: `rotate(${i * 30}deg)` }}/>)}
      {p.date && <span className="kz-w-dialdate">{date}</span>}
      <i className="kz-w-hand is-hh" style={{ transform: `rotate(${hour * 30}deg)` }}/>
      <i className="kz-w-hand is-mh" style={{ transform: `rotate(${min * 6}deg)` }}/>
      {p.seconds && <i className="kz-w-hand is-sh" style={{ transform: `rotate(${sec * 6}deg)` }}/>}
      <i className="kz-w-pin"/>
    </div></div>;
}
const Clock = ({ widget }) => (widget.props.look === 'round' ? <Dial widget={widget}/> : <Digital widget={widget}/>);
function Digital({ widget }) {
  const at = useNow(), p = widget.props, now = new Date(at);
  let hours = now.getHours(), half = '';
  if (p.format === '12') { half = hours < 12 ? 'AM' : 'PM'; hours = hours % 12 || 12; }
  const chars = 5 + (p.seconds ? 1.5 : 0) + (p.format === '12' ? 1.2 : 0), size = Math.max(10, Math.min(widget.h * (p.date ? 0.56 : 0.74), widget.w / (chars * 0.6)));
  return <div className={`kz-w kz-w-clock is-${p.align}${p.panel ? ' kz-w-card' : ''}`} style={{ '--tone': p.color, '--size': `${size}px`, '--date': `${Math.max(9, size * 0.2)}px` }}>
    <Edge on={p.panel}/>
    <div className="kz-w-row"><span className="kz-w-time">{p.format === '12' ? hours : pad(hours)}:{pad(now.getMinutes())}</span>
      {p.seconds && <span className="kz-w-sec">:{pad(now.getSeconds())}</span>}{half && <span className="kz-w-half">{half}</span>}</div>
    {p.date && <div className="kz-w-row kz-w-dates"><span className="kz-w-day">{now.toLocaleDateString(locale, { weekday: 'long' })}</span><i className="kz-w-dot"/>
      <span>{now.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}</span></div>}
  </div>;
}
const UNITS = () => [t('дн'), t('ч'), t('мин'), t('сек')];
function Timer({ widget }) {
  const at = useNow(), p = widget.props, left = Math.floor(((p.until ? new Date(p.until).getTime() : NaN) - at) / 1000), known = Number.isFinite(left), rest = Math.max(0, left);
  if (p.look === 'line') {
    const size = Math.max(10, Math.min(widget.h * 0.36, widget.w / 11)), days = Math.floor(rest / 86400);
    const line = !known ? '--:--:--' : left <= 0 ? t('Уже началось') : `${days ? `${days}${t('д')} ` : ''}${pad(Math.floor((rest % 86400) / 3600))}:${pad(Math.floor((rest % 3600) / 60))}:${pad(rest % 60)}`;
    return <div className={`kz-w kz-w-timer${p.panel ? ' kz-w-card' : ''}`} style={{ '--tone': p.color }}>
      <Edge on={p.panel}/>
      {p.title && <div className="kz-w-cap" style={{ fontSize: Math.max(9, size * 0.3), marginBottom: size * 0.2 }}>{p.title}</div>}
      <div className="kz-w-count" style={{ fontSize: size }}>{line}</div>
    </div>;
  }
  const num = Math.max(10, Math.min(widget.h * (p.title ? 0.38 : 0.46), widget.w / 8.4));
  const values = known ? [String(Math.floor(rest / 86400)), pad(Math.floor((rest % 86400) / 3600)), pad(Math.floor((rest % 3600) / 60)), pad(rest % 60)] : ['-', '--', '--', '--'];
  return <div className={`kz-w kz-w-timer${p.panel ? ' kz-w-card' : ''}`} style={{ '--tone': p.color, '--num': `${num}px`, '--unit': `${Math.max(8, num * 0.26)}px` }}>
    <Edge on={p.panel}/>
    {p.title && <div className="kz-w-cap" style={{ fontSize: Math.max(9, num * 0.3), marginBottom: num * 0.22 }}>{p.title}</div>}
    {known && left <= 0 ? <div className="kz-w-done" style={{ fontSize: Math.max(10, num * 0.5) }}>{t('Уже началось')}</div>
      : <div className="kz-w-segs">{values.map((value, i) => <Fragment key={i}>{i > 0 && <i className="kz-w-sep"/>}<div className="kz-w-seg"><b>{value}</b><small>{UNITS()[i]}</small></div></Fragment>)}</div>}
  </div>;
}
const WEIGHTS = { normal: 400, bold: 700, black: 900 };
function Text({ widget }) {
  const p = widget.props;
  return <div className={`kz-w kz-w-text is-${p.align}${p.shadow ? ' has-shadow' : ''}${p.upper ? ' is-upper' : ''}`} style={{ '--tone': p.color, fontSize: p.size, fontWeight: WEIGHTS[p.weight] || 700 }}>
    <span>{p.text || t('Текст')}</span></div>;
}
function Shortcut({ widget }) {
  const p = widget.props, size = Math.max(10, Math.min(widget.h * 0.34, 24));
  return <div className={`kz-w kz-w-button is-${p.style}${p.action === 'link' ? ' is-link' : ''}`}
    style={{ '--tone': p.color, '--arrow': `${Math.round(Math.max(6, size * 0.42))}px`, fontSize: size, paddingLeft: p.style === 'plain' ? 2 : Math.round(Math.max(10, size * 0.9)), paddingRight: Math.max(8, size * 0.8) }}>
    <span>{p.label || t(WIDGET_ACTIONS[p.action]?.title || '')}</span><i className="kz-w-arrow"/>
  </div>;
}
function Media({ widget }) {
  const p = widget.props, url = useMediaURL(p.media), video = widget.type === 'video';
  const style = { objectFit: p.fit, borderRadius: p.radius };
  if (!url) return <div className="kz-w kz-w-empty" style={{ borderRadius: p.radius }}><Icon name={video ? 'film' : 'image'} size={Math.max(16, Math.min(widget.w, widget.h) * 0.22)}/>
    {widget.h >= 90 && <span>{p.media ? t('Файла нет в этом браузере') : video ? t('Выбери видео в свойствах') : t('Выбери картинку в свойствах')}</span>}</div>;
  return <div className="kz-w kz-w-media" style={{ borderRadius: p.radius }}>
    {video ? <video key={url} src={url} style={style} autoPlay loop muted playsInline/> : <img src={url} alt="" style={style} draggable={false}/>}</div>;
}
// Dota's own panels: stand-ins of their look, with sample data.
function MiniProfile() {
  return <div className="kz-w kz-w-native kz-w-profile">
    <div className="kz-np-head" style={{ backgroundImage: `url(${profileHead})` }}>
      <img className="kz-np-avatar" src={avatar} alt=""/>
      <div><b>dissonance</b><small>{t('В главном меню')}</small></div>
      <img className="kz-np-medal" src={medal} alt=""/>
    </div>
    <div className="kz-np-show" style={{ backgroundImage: `url(${showcase})` }}/>
  </div>;
}
// Valve's last match panel (frontpage_lastmatch.xml) with sample data: GridStudio's card (menu-widgets.mjs LASTMATCH_RULES)
// or Dota's own look.
function LastMatch({ widget }) {
  const rows = [[t('Режим'), t('Турбо')], [t('У / С / П'), '12 / 3 / 17'], [t('Время'), '38:12'], [t('Итог'), t('Победа'), 'is-win']];
  return <div className={`kz-w kz-w-lm is-${widget.props.look === 'dota' ? 'dota' : 'gridstudio'}`}>
    <div className="kz-lm-head"><b>{t('Последний матч')}</b><span>{t('2 ч назад')}</span></div>
    <div className="kz-lm-details"><span className="kz-lm-hero"><img src={invoker} alt=""/></span>
      <div><b className="kz-lm-name">Invoker</b>{rows.map(([name, value, cls]) => <span key={name} className="kz-lm-row"><i>{name}</i><em className={cls}>{value}</em></span>)}</div></div>
    <div className="kz-lm-items-head">{t('Предметы')}</div>
    <div className="kz-lm-items">{Array.from({ length: 6 }, (_, i) => <i key={i}/>)}</div>
    <div className="kz-lm-recent">{t('Недавние матчи')}</div>
  </div>;
}
const LIVE_HEROES = [1, 8, 106, 11, 39, 14, 17, 126, 35, 74];
const heroPictures = import.meta.glob('../../assets/heroes/{1,8,106,11,39,14,17,126,35,74}.webp', { eager: true, import: 'default' });
const heroPicture = (id) => Object.entries(heroPictures).find(([path]) => path.endsWith(`/${id}.webp`))?.[1];
const LIVE_START = Date.now() - (24 * 60 + 31) * 1000;
function TopLive() {
  const at = useNow(), seconds = Math.floor((at - LIVE_START) / 1000);
  return <div className="kz-w kz-w-native kz-w-live">
    <div className="kz-np-title"><span className="kz-np-onair">{t('В эфире')}</span>DreamLeague</div>
    <div className="kz-np-teams"><span>Team Spirit</span><b>1 : 0</b><span>Tundra</span></div>
    <div className="kz-np-picks">{LIVE_HEROES.map((id) => <img key={id} src={heroPicture(id)} alt=""/>)}</div>
    <small>{t('Карта {map}', { map: 2 })} · {pad(Math.floor(seconds / 60))}:{pad(seconds % 60)}</small>
  </div>;
}

// A widget of one's own («Редактор виджета»): its design drawn at the widget's size (the store keeps its proportions).
function Custom({ widget }) {
  const design = widget.props.design;
  return design ? <div className="kz-w"><DesignView design={design} scale={widget.w / design.size[0]}/></div> : null;
}

const VIEWS = { clock: Clock, timer: Timer, text: Text, shortcut: Shortcut, image: Media, video: Media, miniProfile: MiniProfile, lastMatch: LastMatch, topLive: TopLive, custom: Custom };
export default function WidgetView({ widget }) {
  const View = VIEWS[widget.type];
  return View ? <View widget={widget}/> : null;
}

// A widget drawn small (the shelf's cards): its own size, scaled into the box it is given.
export function WidgetMini({ widget, box }) {
  const scale = Math.min(box[0] / widget.w, box[1] / widget.h) * 0.86;
  return <span className="kz-mini" aria-hidden="true"><span className="kz-mini-in kz-wfont" style={{ width: widget.w, height: widget.h, transform: `scale(${scale}) translate(-50%, -50%)` }}>
    <WidgetView widget={widget}/></span></span>;
}
