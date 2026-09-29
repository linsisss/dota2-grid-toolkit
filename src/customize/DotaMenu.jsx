import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import bar from '../../assets/dota-menu/ui/bar.webp';
import barMid from '../../assets/dota-menu/ui/bar-mid.webp';
import play from '../../assets/dota-menu/ui/play.webp';
import chat from '../../assets/dota-menu/ui/chat.webp';
import news from '../../assets/dota-menu/ui/news.webp';
import rail from '../../assets/dota-menu/ui/rail.webp';
import railParty from '../../assets/dota-menu/ui/rail-party.webp';
import avatar from '../../assets/dota-menu/ui/avatar.webp';
import mailOn from '../../assets/dota-menu/ui/mail-on.webp';
import notice from '../../assets/dota-menu/ui/notice.webp';

// Dota 2's main menu over the chosen background, laid out in 1080p pixels like Panorama does it:
// the layer is scaled by min(width / 1920, height / 1080), so on a wide screen the panels move to
// the edges and on 4:3 everything shrinks. It is pictures only, so it looks the same in every
// browser: the top bar, ИГРАТЬ, the chat line and the event card are cut from a real screenshot
// (scripts/make-menu-sprites.mjs), the friends rail with its text is rendered by
// scripts/make-menu-rail.mjs (browsers on Windows would draw Radiance with ClearType, heavier than
// the game). The owner is dissonance, one of GridStudio's authors. The one live thing is an easter
// egg: the envelope opens Dota's notifications popup (scripts/make-menu-notice.mjs).
export default function DotaMenu({ clean }) {
  const frame = useRef(null), layer = useRef(null), mail = useRef(null), [open, setOpen] = useState(false);
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
  return <div className="dota-menu" ref={frame} aria-hidden="true"><div className="dm-layer" ref={layer}>
    <div className="dm-bar-left" style={{ backgroundImage: `url(${bar})` }}/>
    <div className="dm-bar-mid" style={{ backgroundImage: `url(${barMid})` }}/>
    <div className="dm-bar-right" style={{ backgroundImage: `url(${bar})` }}/>
    <div className="dm-rail"><img src={rail} alt=""/></div>
    <div className="dm-party"><img src={railParty} alt=""/><img className="dm-party-me" src={avatar} alt=""/></div>
    {/* Stays mounted, so hiding and showing the news both animate. */}
    <img className={`dm-news${clean ? ' is-hidden' : ''}`} src={news} alt=""/>
    <img className="dm-chat" src={chat} alt=""/>
    <img className="dm-play" src={play} alt=""/>
    <button ref={mail} type="button" tabIndex={-1} className={`dm-mail${open ? ' is-open' : ''}`} onClick={() => setOpen((value) => !value)}><img src={mailOn} alt=""/></button>
    <img className={`dm-notice${open ? ' is-open' : ''}`} src={notice} alt=""/>
  </div></div>;
}
