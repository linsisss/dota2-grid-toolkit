import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import bar from '../../assets/dota-menu/ui/bar.webp';
import barMid from '../../assets/dota-menu/ui/bar-mid.webp';
import play from '../../assets/dota-menu/ui/play.webp';
import chat from '../../assets/dota-menu/ui/chat.webp';
import newsCell from '../../assets/dota-menu/ui/news.webp';
import seasonCell from '../../assets/dota-menu/ui/season.webp';
import rail from '../../assets/dota-menu/ui/rail.webp';
import railParty from '../../assets/dota-menu/ui/rail-party.webp';
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
export default function DotaMenu({ news = { carnival: true, season: true }, event = null }) {
  const clean = !news.carnival;
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
    <div className="dm-bar-left" style={{ backgroundImage: `url(${bar})` }}/>
    <div className="dm-bar-mid" style={{ backgroundImage: `url(${barMid})` }}/>
    <div className="dm-bar-right" style={{ backgroundImage: `url(${bar})` }}/>
    <div className="dm-rail"><img src={rail} alt=""/></div>
    <div className="dm-party"><img src={railParty} alt=""/><img className="dm-party-me" src={avatar} alt=""/></div>
    {/* Stays mounted, so hiding and showing the news both animate. Under the event card, since Dota's
        update of 2026-10-07, Valve's own «Диковинки Квортеро» cell (scripts/make-menu-season.mjs). */}
    <img className={`dm-news${news.carnival ? '' : ' is-hidden'}`} src={newsCell} alt=""/>
    <img className={`dm-news dm-season${news.season ? '' : ' is-hidden'}${news.carnival ? '' : ' is-top'}`} src={seasonCell} alt=""/>
    {/* Under the event card, or at the column's top when the news are hidden (MENU_UI in menu-background.mjs). */}
    {event !== null && <button type="button" tabIndex={-1} className={`dm-event-toggle${clean ? ' is-top' : ''}${event ? '' : ' is-off'}`} onPointerEnter={() => setWarm(true)}
      onPointerDown={(e) => e.stopPropagation()} onClick={() => { setWarm(true); setSeason((value) => !value); }}>
      <img className="dm-event-logo" src={eventLogo} alt=""/><img className="dm-event-title" src={eventTitle} alt=""/><img className="dm-event-title is-back" src={eventBackTitle} alt=""/></button>}
    <img className="dm-chat" src={chat} alt=""/>
    <img className="dm-play" src={play} alt=""/>
    <button ref={mail} type="button" tabIndex={-1} className={`dm-mail${open ? ' is-open' : ''}`} onClick={() => setOpen((value) => !value)}><img src={mailOn} alt=""/></button>
    <img className={`dm-notice${open ? ' is-open' : ''}`} src={notice} alt=""/>
  </div></div>;
}
