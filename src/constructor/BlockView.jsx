import { useState } from 'react';
import { Icon } from '../catalog/Common.jsx';
import { t } from '../../scripts/i18n.mjs';
import { BLOCK_TYPES } from '../../scripts/menu-widgets.mjs';
import HEROES from '../../scripts/hero-portraits-data.mjs';
import D from '../../scripts/data.mjs';
import { mediaType, pad, useMediaURL, useNow } from './live.js';
import './widget-editor.css';

// A widget of one's own («Редактор виджета», scripts/menu-widgets.mjs cleanDesign) as Dota will draw it: the
// design's box in its own pixels with its background and corners, its blocks one over another (the first is
// lowest), each at its place and size with its opacity. Texts, clocks and timers are Radiance (the page's
// --kz-wfont, as the menu's widgets), at their size in pixels; a shape's gradient runs the way its direction
// says (diagonal: corner to corner, as Panorama's linear gradient between two points); a progress bar is its
// track with the filled part. A block with hover gets brighter and a little bigger under the cursor (0.12 s),
// and the animations are the ones the menu pack writes: appear (a 0.4 s fade in, once), pulse (scale 1 → 1.04
// and brightness 1 → 1.2 and back every 1.6 s), slide (in from 24 px to the left with a fade, 0.5 s, once).
// `state` of the whole design: 'live' (hover follows the cursor), 'normal', 'hover' or 'press' (the editor's
// tabs: how it looks under the cursor, and pressed). `editing`: an empty picture or video shows where it goes.
export const BLOCK_WEIGHTS = { normal: 400, bold: 700, black: 900 };
// Panorama's «text-shadow: 0px 1px 6px 2.0 #000000cc» (a strength of 2: the shadow twice).
const SHADOW = '0 1px 6px #000000cc, 0 1px 6px #000000cc';

// The fill of a shape: its colour, or a gradient from it to fill2 down, to the right or corner to corner.
export function shapeFill(p, w, h) {
  if (!p.fill2) return p.fill;
  const angle = p.direction === 'right' ? 90 : p.direction === 'diagonal' ? 180 - (Math.atan2(w, h) * 180) / Math.PI : 180;
  return `linear-gradient(${Math.round(angle * 100) / 100}deg, ${p.fill}, ${p.fill2})`;
}
// What a clock and a timer show, as the menu pack's script writes it (WIDGET_RUNTIME in menu-widgets.mjs).
export function clockLine(at, format, seconds) {
  const date = new Date(at);
  let hours = date.getHours(), tail = '';
  if (format === '12') { tail = hours < 12 ? ' AM' : ' PM'; hours = hours % 12 || 12; }
  return `${format === '12' ? hours : pad(hours)}:${pad(date.getMinutes())}${seconds ? `:${pad(date.getSeconds())}` : ''}${tail}`;
}
export function timerLine(at, until) {
  if (!until) return '--:--:--';
  const [y, m, d, hh, mm] = until.split(/[-T:]/).map(Number), left = Math.floor((new Date(y, m - 1, d, hh, mm).getTime() - at) / 1000);
  if (Number.isNaN(left)) return '--:--:--';
  if (left <= 0) return t('Уже началось');
  const days = Math.floor(left / 86400), rest = left % 86400;
  return `${days ? `${days}${t('д')} ` : ''}${pad(Math.floor(rest / 3600))}:${pad(Math.floor((rest % 3600) / 60))}:${pad(rest % 60)}`;
}

// A hero block's hero (Valve's name, scripts/menu-widgets.mjs BLOCK_HEROES): the site's id, its name and portrait.
const PORTRAITS = import.meta.glob('../../assets/portraits/*.webp', { eager: true, import: 'default' });
const HERO_IDS = Object.fromEntries(Object.entries(HEROES).map(([id, hero]) => [hero.name, Number(id)]));
const HERO_TITLES = Object.fromEntries(D.heroes.map((hero) => [hero.id, hero.name]));
export const heroTitle = (name) => HERO_TITLES[HERO_IDS[name]] || name.replace(/_/g, ' ');
export const heroPortrait = (name) => PORTRAITS[`../../assets/portraits/${HERO_IDS[name]}.webp`] || '';

// A block's name in the layers and on its frame: the one given in the editor, else its type and its words.
export function blockName(block, names = {}) {
  if (names[block.id]) return names[block.id];
  const title = t(BLOCK_TYPES[block.type]?.title || block.type), p = block.props || {};
  const words = block.type === 'text' ? p.text : block.type === 'button' ? p.label : block.type === 'hero' ? heroTitle(p.hero) : '';
  const short = (words || '').length > 22 ? `${words.slice(0, 21)}…` : words;
  return short ? `${title} «${short}»` : title;
}

function Line({ block, text }) {
  const p = block.props;
  return <div className={`kz-bk-text is-${p.align}`} style={{ color: p.color, fontSize: p.size, fontWeight: BLOCK_WEIGHTS[p.weight] || 700, letterSpacing: p.spacing || undefined,
    textShadow: p.shadow ? SHADOW : undefined, textTransform: p.upper ? 'uppercase' : undefined }}><span>{text}</span></div>;
}
function ClockBlock({ block }) {
  const at = useNow();
  return <Line block={block} text={clockLine(at, block.props.format, block.props.seconds)}/>;
}
function TimerBlock({ block }) {
  const at = useNow();
  return <Line block={block} text={timerLine(at, block.props.until)}/>;
}
// Dota's own blocks: on the site a stand-in (the user's avatar and name are known only in Dota); the hero is its
// portrait, with what Dota shows there instead (3D, moving) on a tag while editing.
function AvatarBlock({ block }) {
  const p = block.props;
  return <div className="kz-bk-avatar" style={{ borderRadius: p.radius, border: p.border && p.borderWidth ? `${p.borderWidth}px solid ${p.border}` : undefined }}>
    <Icon name="user" size={Math.max(12, Math.min(block.w, block.h) * 0.5)}/></div>;
}
function HeroBlock({ block, editing }) {
  const p = block.props, src = heroPortrait(p.hero);
  return <div className="kz-bk-hero">{src && <img src={src} alt="" draggable={false}/>}
    {editing && p.view !== 'image' && <span className="kz-bk-tag">{p.view === 'model' ? t('3D в Dota') : t('Движется в Dota')}</span>}</div>;
}
function MediaBlock({ block, editing }) {
  const p = block.props, url = useMediaURL(p.media), video = block.type === 'video';
  // A file from the workshop has no type known beforehand: a GIF in a video block is drawn as a picture once
  // the <video> refuses it.
  const [still, setStill] = useState('');
  if (!url) return editing ? <div className="kz-bk-empty" style={{ borderRadius: p.radius }}><Icon name={video ? 'film' : 'image'} size={Math.max(12, Math.min(28, block.w * 0.3, block.h * 0.4))}/>
    {block.h >= 70 && block.w >= 130 && <span>{p.media ? t('Файла нет в этом браузере') : t('Перетащи файл сюда')}</span>}</div> : null;
  const style = { objectFit: p.fit, borderRadius: p.radius };
  return video && mediaType(p.media) !== 'image/gif' && still !== url ? <video className="kz-bk-media" src={url} style={style} autoPlay loop muted playsInline onError={() => setStill(url)}/>
    : <img className="kz-bk-media" src={url} alt="" style={style} draggable={false}/>;
}
function BlockContent({ block, editing }) {
  const p = block.props;
  switch (block.type) {
    case 'text': return <Line block={block} text={p.text}/>;
    case 'clock': return <ClockBlock block={block}/>;
    case 'timer': return <TimerBlock block={block}/>;
    case 'button': return <div className={`kz-bk-button is-${p.align || 'center'}${p.upper ? ' is-upper' : ''}`} style={{ background: p.fill, color: p.color, borderRadius: p.radius, fontSize: p.size }}><span>{p.label}</span></div>;
    case 'shape': return <div className="kz-bk-fill" style={{ background: shapeFill(p, block.w, block.h), borderRadius: p.radius, border: p.border && p.borderWidth ? `${p.borderWidth}px solid ${p.border}` : undefined }}/>;
    case 'progress': return <div className="kz-bk-track" style={{ background: p.track, borderRadius: p.radius }}><i style={{ width: `${p.value}%`, background: p.fill, borderRadius: p.radius }}/></div>;
    case 'image': case 'video': return <MediaBlock block={block} editing={editing}/>;
    case 'avatar': return <AvatarBlock block={block}/>;
    case 'nickname': return <Line block={block} text={t('Твой ник')}/>;
    case 'hero': return <HeroBlock block={block} editing={editing}/>;
    default: return null;
  }
}
// One block without its place: the hover layer (brighter and bigger), the animation's layer, what it shows.
export function BlockInner({ block, editing = false }) {
  return <div className={`kz-bh${block.hover ? ' has-hover' : ''}`}><div className={`kz-ba${block.anim !== 'none' ? ` is-${block.anim}` : ''}`}><BlockContent block={block} editing={editing}/></div></div>;
}
// The whole design at its own size, scaled from its top left corner by `scale`.
export function DesignView({ design, scale = 1, state = 'live', editing = false }) {
  const [W, H] = design.size;
  return <div className={`kz-d is-${state}`} style={{ width: W, height: H, transform: scale !== 1 ? `scale(${scale})` : undefined, background: design.background || undefined, borderRadius: design.radius || undefined }}>
    {design.blocks.map((block) => <div key={block.id} className="kz-b" style={{ left: block.x, top: block.y, width: block.w, height: block.h, opacity: block.opacity / 100 }}>
      <BlockInner block={block} editing={editing}/></div>)}
  </div>;
}
// The animations of what is under `root` played again from the start (the editor's «Проиграть»).
export function replayAnimations(root) {
  for (const animation of root?.getAnimations?.({ subtree: true }) || []) {
    if (!String(animation.animationName || '').startsWith('kz-anim-')) continue;
    animation.currentTime = 0; animation.play();
  }
}
