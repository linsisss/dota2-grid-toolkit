import { useEffect, useLayoutEffect, useRef } from 'react';
import { HERO_OPACITY } from '../../scripts/menu-background.mjs';
import DotaHeroModel from './DotaHeroModel.jsx';
import { t } from '../../scripts/i18n.mjs';
import bar from '../../assets/dota-menu/ui/hero-bar.webp';
import barMid from '../../assets/dota-menu/ui/bar-mid.webp';
import tabs from '../../assets/dota-menu/ui/hero-tabs.webp';
import prev from '../../assets/dota-menu/ui/hero-prev.webp';
import next from '../../assets/dota-menu/ui/hero-next.webp';
import armory from '../../assets/dota-menu/ui/hero-armory.webp';
import left from '../../assets/dota-menu/ui/hero-left.webp';
import right from '../../assets/dota-menu/ui/hero-right.webp';
import friends from '../../assets/dota-menu/ui/hero-friends.webp';
import railParty from '../../assets/dota-menu/ui/rail-party.webp';
import avatar from '../../assets/dota-menu/ui/avatar.webp';
import chat from '../../assets/dota-menu/ui/chat.webp';
import play from '../../assets/dota-menu/ui/play.webp';
import tauntSound from '../../assets/dota-hero/sounds/taunt-fiendish-swag.mp3';

// Dota 2's hero page («Герои» → «Снаряжение», Shadow Fiend) over the background behind the hero,
// laid out like DotaMenu (1080p pixels, scaled by min(width / 1920, height / 1080)) with Valve's
// rules from dashboard_page_hero_new_v2.css: the columns sit in a centred box at most 1920 wide,
// 90 px from its edges (16:10: 60, 21:9: 0); the set's lit panel (.EquippedBackgroundShard) is
// placed from the screen's centre. The pictures are scripts/make-hero-page-sprites.mjs's: pieces
// of a screenshot, the game's icons and text in its fonts; the party bar, chat and ИГРАТЬ are the
// menu's. Under them, the video as the game shows it: at HERO_OPACITY over black, with Valve's
// vignette (.DarkEdges).
// A small secret: the set's taunt icon plays the taunt «Fiendish Swag!» with its sound, quietly.
const TAUNT_VOLUME = 0.12;
export default function DotaHeroPage({ interactive = true }) {
  const frame = useRef(null), layer = useRef(null), hero = useRef(null), sound = useRef(null);
  // One sound for the taunt: clicking again restarts it (and the taunt) instead of layering another.
  const taunt = () => {
    if (!hero.current?.taunt()) return;
    if (!sound.current) { sound.current = new Audio(tauntSound); sound.current.volume = TAUNT_VOLUME; }
    sound.current.pause(); sound.current.currentTime = 0; sound.current.play().catch(() => {});
  };
  useEffect(() => () => sound.current?.pause(), []);
  // Written straight to the style, so the screen's shape animation does not re-render React.
  useLayoutEffect(() => {
    const fit = () => {
      const { width, height } = frame.current.getBoundingClientRect();
      if (!width || !height) return;
      const scale = Math.min(width / 1920, height / 1080), ratio = width / height;
      Object.assign(layer.current.style, { width: `${width / scale}px`, height: `${height / scale}px`, transform: `scale(${scale})` });
      layer.current.dataset.aspect = ratio > 2 ? '21x9' : ratio > 1.55 && ratio < 1.7 ? '16x10' : '';
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  return <div className="dota-hero" ref={frame} aria-hidden="true">
    <div className="dota-hero-dim" style={{ opacity: 1 - HERO_OPACITY }}/>
    <div className="dota-hero-edges"/>
    <DotaHeroModel interactive={interactive} api={hero}/>
    <div className="dh-layer" ref={layer}>
      <div className="dh-shard"/>
      <div className="dh-content">
        <img className="dh-left" src={left} alt=""/>
        <img className="dh-right" src={right} alt=""/>
        <button type="button" className="dh-taunt" tabIndex={-1} title={t('Насмешка')} aria-label={t('Насмешка')} onClick={(event) => { event.stopPropagation(); taunt(); }}/>
      </div>
      <div className="dh-band"/>
      <img className="dh-prev" src={prev} alt=""/>
      <img className="dh-tabs" src={tabs} alt=""/>
      <img className="dh-next" src={next} alt=""/>
      <img className="dh-armory" src={armory} alt=""/>
      <div className="dh-bar-left" style={{ backgroundImage: `url(${bar})` }}/>
      <div className="dh-bar-mid" style={{ backgroundImage: `url(${barMid})` }}/>
      <div className="dh-bar-right" style={{ backgroundImage: `url(${bar})` }}/>
      <div className="dm-party"><img src={railParty} alt=""/><img className="dm-party-me" src={avatar} alt=""/></div>
      <img className="dh-friends" src={friends} alt=""/>
      <img className="dm-chat" src={chat} alt=""/>
      <img className="dm-play" src={play} alt=""/>
    </div>
  </div>;
}
