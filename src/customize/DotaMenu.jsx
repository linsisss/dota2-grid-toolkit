import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import barGround from '../../assets/dota-menu/ui/bar-ground.webp';
import barGlass from '../../assets/dota-menu/ui/bar-glass.webp';
import barMid from '../../assets/dota-menu/ui/bar-mid.webp';
import play from '../../assets/dota-menu/ui/play.webp';
import chat from '../../assets/dota-menu/ui/chat.webp';
import newsCell from '../../assets/dota-menu/ui/news.webp';
import seasonCell from '../../assets/dota-menu/ui/season.webp';
import rail from '../../assets/dota-menu/ui/rail.webp';
import partyGround from '../../assets/dota-menu/ui/party-ground.webp';
import partyGlass from '../../assets/dota-menu/ui/party-glass.webp';
import profileHead from '../../assets/dota-menu/ui/profile-head.webp';
import profileShowcase from '../../assets/dota-menu/ui/profile-showcase.webp';
import avatar from '../../assets/dota-menu/ui/avatar.webp';
import mailOn from '../../assets/dota-menu/ui/mail-on.webp';
import notice from '../../assets/dota-menu/ui/notice.webp';
import eventLogo from '../../assets/dota-menu/ui/event-logo.webp';
import eventTitle from '../../assets/dota-menu/ui/event-title.webp';
import eventBackTitle from '../../assets/dota-menu/ui/event-back-title.webp';
import eventScreen from '../../assets/dota-menu/ui/event-screen.webp';

// Dota 2's main menu over the chosen background, laid out in 1080p pixels like Panorama does it:
// the layer is scaled by min(width / 1920, height / 1080), so on a wide screen the panels move to
// the edges and on 4:3 everything shrinks. It is pictures only, so it looks the same in every
// browser: the top bar, ИГРАТЬ, the chat line and the event card are cut from a real screenshot
// (scripts/make-menu-sprites.mjs), the friends rail with its text is rendered by
// scripts/make-menu-rail.mjs (browsers on Windows would draw Radiance with ClearType, heavier than
// the game). The owner is dissonance, one of GridStudio's authors. Two things are live: an easter
// egg, the envelope opens Dota's notifications popup (scripts/make-menu-notice.mjs), and, with
// `event`, the pack's button to the season event, which shows the event screen and turns into
// «НАЗАД», like in the game: drawn in CSS like the pack's, with the logo and the texts from
// scripts/make-menu-event.mjs (the screen loads on the first hover). `event` is null when the site
// has no event; false keeps the button mounted but away, so turning it on and off both animate.
// news: { carnival, season } — which cards of the news column show (2026-10-08); hiding Dark Carnival
// moves the Quartero card up to the column's top, like the column's flow in the game.
// hide: top bar buttons the pack hides (MENU_HIDE in scripts/menu-background.mjs, 2026-10-16). The bar
// is one picture, so it is cut at the middle of the slanted separators (y 30) into BAR_LEFT and BAR_RIGHT
// pieces; a hidden one drops out and the rest close up, as Dota's tabs flow left and the right-hand
// buttons right. The plain bar fills what is left.
// glass: { bar, friends, news, header, showcase, party } — the see-through panels (MENU_GLASS, 2026-10-22), percents of their ground. The bar is
// two pictures (scripts/make-menu-glass.mjs): Valve's ground at that opacity, the tabs, icons and logo over it
// whole, cut the same way; `bar-mid` is ground. The friends rail's ground is drawn here (RAIL_GROUND, the rail's
// colour, and black under the friend search, as friend_menu.css has them) under the picture of what lies on it
// (scripts/make-menu-rail.mjs). The avatars and the texts stay whole, as in the game.
// The other panels of the same slider group (news, header, showcase, party; 2026-10-22): the mini-profile's header
// ground and its picture (profile-head.webp, profile-showcase.webp from make-menu-rail.mjs) under the owner's
// avatar, name and medal, which stay; the party bar's ground and its slots and button (party-ground.webp,
// party-glass.webp from make-menu-glass.mjs); the news column fades whole (#RightColumn in the pack).
const BAR_LEFT = [['', 0, 550], ['collection', 550, 715], ['watch', 715, 879], ['learn', 879, 1046], ['mods', 1046, 1210], ['', 1210, 1490]];
const BAR_RIGHT = [['', 1851, 1920], ['plus', 1778, 1851], ['armory', 1704, 1778], ['', 1629, 1704], ['shards', 1488, 1629]];
const RAIL_GROUND = [10, 8, 6, 0xf9 / 255];
function BarPieces({ hide, image, ground }) {
  if (!hide.length) return <>
    <div className="dm-bar-left" style={{ backgroundImage: `url(${image})` }}/>
    {ground && <div className="dm-bar-mid" style={{ backgroundImage: `url(${barMid})` }}/>}
    <div className="dm-bar-right" style={{ backgroundImage: `url(${image})` }}/>
  </>;
  const piece = (x0, x1, side, at, height) => <div key={`${side}${x0}`} className="dm-bar-piece" style={{ [side]: at, width: x1 - x0, height, backgroundImage: `url(${image})`, backgroundPosition: `-${x0}px 0` }}/>;
  let left = 0, right = 0;
  return <>
    {ground && <div className="dm-bar-mid is-whole" style={{ backgroundImage: `url(${barMid})` }}/>}
    {BAR_LEFT.filter(([key]) => !hide.includes(key)).map(([, x0, x1]) => { const at = left; left += x1 - x0; return piece(x0, x1, 'left', at, 73); })}
    {BAR_RIGHT.filter(([key]) => !hide.includes(key)).map(([, x0, x1]) => { const at = right; right += x1 - x0; return piece(x0, x1, 'right', at, 61); })}
  </>;
}
function TopBar({ hide, ground }) {
  return <>
    <div className="dm-bar-layer" style={{ opacity: ground }}><BarPieces hide={hide} image={barGround} ground/></div>
    <div className="dm-bar-layer"><BarPieces hide={hide} image={barGlass}/></div>
  </>;
}

export default function DotaMenu({ news = { carnival: true, season: true }, event = null, hide = [], glass = null }) {
  const see = (key) => (glass?.[key] ?? 100) / 100, bar = see('bar'), friends = see('friends');
  const clean = !news.carnival;
  // The envelope moves right by the right-hand buttons hidden after it.
  const shift = BAR_RIGHT.filter(([key, x0]) => key && x0 > 1704 && hide.includes(key)).reduce((sum, [, x0, x1]) => sum + x1 - x0, 0);
  const frame = useRef(null), layer = useRef(null), mail = useRef(null), [open, setOpen] = useState(false);
  const [season, setSeason] = useState(false), [warm, setWarm] = useState(false), [loaded, setLoaded] = useState(false);
  useEffect(() => { if (!event) setSeason(false); }, [event]);
  // Written straight to the style, so the screen's shape animation does not re-render React.
  useLayoutEffect(() => {
    const fit = () => {
      const { width, height } = frame.current.getBoundingClientRect();
      if (!width || !height) return;
      const scale = Math.min(width / 1920, height / 1080);
      Object.assign(layer.current.style, { width: `${width / scale}px`, height: `${height / scale}px`, transform: `scale(${scale})` });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  // Like in the game, a click anywhere else or Escape closes the popup.
  useEffect(() => {
    if (!open) return;
    const away = (event) => { if (!mail.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="dota-menu" ref={frame} aria-hidden="true"><div className={`dm-layer${season ? ' is-event' : ''}`} ref={layer}>
    {/* The screen comes in once its picture is there, so a slow load does not pop it in halfway. */}
    {warm && <div className={`dm-event${loaded ? ' is-loaded' : ''}`} style={{ '--event': `url(${eventScreen})` }}><img src={eventScreen} alt="" onLoad={() => setLoaded(true)}/></div>}
    <TopBar hide={hide} ground={bar}/>
    <div className="dm-rail" style={{ backgroundColor: `rgba(${RAIL_GROUND.slice(0, 3).join(', ')}, ${+(RAIL_GROUND[3] * friends).toFixed(3)})` }}>
      <i className="dm-rail-head" style={{ opacity: friends }}/>
      <img className="dm-profile-head" src={profileHead} alt="" style={{ opacity: see('header') }}/>
      <img className="dm-profile-showcase" src={profileShowcase} alt="" style={{ opacity: see('showcase') }}/>
      <img src={rail} alt=""/></div>
    <div className="dm-party"><img src={partyGround} alt="" style={{ opacity: see('party') }}/><img className="dm-party-glass" src={partyGlass} alt=""/><img className="dm-party-me" src={avatar} alt=""/></div>
    {/* Stays mounted, so hiding and showing the news both animate. Under the event card, since Dota's
        update of 2026-10-07, Valve's own «Диковинки Квортеро» cell (scripts/make-menu-season.mjs). */}
    {/* Valve's cards cast a soft shadow; with the column see-through the pack masks it out of the gap and the free right
        edge (GLASS_NEWS_TEXT), so the preview drops it there too. */}
    <div className={`dm-news-column${see('news') < 1 ? ' is-glass' : ''}`} style={{ opacity: see('news') }}>
      <img className={`dm-news${news.carnival ? '' : ' is-hidden'}`} src={newsCell} alt=""/>
      <img className={`dm-news dm-season${news.season ? '' : ' is-hidden'}${news.carnival ? '' : ' is-top'}`} src={seasonCell} alt=""/>
    </div>
    {/* Under the event card, or at the column's top when the news are hidden (MENU_UI in menu-background.mjs). */}
    {event !== null && <button type="button" tabIndex={-1} className={`dm-event-toggle${clean ? ' is-top' : ''}${event ? '' : ' is-off'}`} onPointerEnter={() => setWarm(true)}
      onPointerDown={(e) => e.stopPropagation()} onClick={() => { setWarm(true); setSeason((value) => !value); }}>
      <img className="dm-event-logo" src={eventLogo} alt=""/><img className="dm-event-title" src={eventTitle} alt=""/><img className="dm-event-title is-back" src={eventBackTitle} alt=""/></button>}
    <img className="dm-chat" src={chat} alt=""/>
    <img className="dm-play" src={play} alt=""/>
    <button ref={mail} type="button" tabIndex={-1} className={`dm-mail${open ? ' is-open' : ''}`} style={shift ? { right: 218 - shift } : undefined} onClick={() => setOpen((value) => !value)}><img src={mailOn} alt=""/></button>
    <img className={`dm-notice${open ? ' is-open' : ''}`} src={notice} alt="" style={shift ? { right: 84 - shift } : undefined}/>
  </div></div>;
}
