import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { drawCatalogGrid } from '../../scripts/catalog-rendering.mjs';
import { DOTA } from '../../scripts/dota-rendering.mjs';
import { portrait } from '../../scripts/portraits.mjs';
import { gameFontsReady, koreanFontReady, needsKoreanFont } from '../typography.js';
import bar from '../../assets/dota-menu/ui/hero-bar.webp';
import barMid from '../../assets/dota-menu/ui/bar-mid.webp';
import subnav from '../../assets/dota-menu/ui/grid-subnav.webp';
import bans from '../../assets/dota-menu/ui/grid-bans.webp';
import sort from '../../assets/dota-menu/ui/grid-sort.webp';
import filters from '../../assets/dota-menu/ui/grid-filters.webp';
import railParty from '../../assets/dota-menu/ui/rail-party.webp';
import avatar from '../../assets/dota-menu/ui/avatar.webp';
import chat from '../../assets/dota-menu/ui/chat.webp';
import play from '../../assets/dota-menu/ui/play.webp';

// Dota 2's «Герои» page over the background under the hero grid, laid out like DotaMenu (1080p
// pixels, scaled by min(width / 1920, height / 1080)): the hero page's top bar with «ГЕРОИ» lit, the
// sub-navigation's band and text, the bans, the sort row (with the shown grid's name) and the filters
// from scripts/make-grid-page-sprites.mjs, centred in a 1920-wide box like the grid; the party bar,
// chat and ИГРАТЬ are the menu's. The grid itself is the one the user picked, drawn as the workshop
// draws it (drawCatalogGrid) without a ground, where the game puts it: 1193 × 593 units at
// DOTA.screenScale from (269, 174) of a 1080p screen (my-background.js, game-preview.mjs).
export const GRID_PLACE = Object.freeze({ x: 269, y: 174 });
const GRID_PIXELS = 1193 * 2;
function GridLayer({ grid }) {
  const canvas = useRef(null), [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    if (!grid) return;
    let active = true;
    const categories = grid.configs[0].categories, ids = [...new Set(categories.flatMap((category) => category.hero_ids))];
    const fonts = categories.some((category) => needsKoreanFont(category.category_name)) ? Promise.all([gameFontsReady, koreanFontReady()]) : gameFontsReady;
    Promise.all([fonts, ...ids.map(portrait)]).then(([, ...images]) => {
      if (!active || !canvas.current) return;
      const element = canvas.current;
      element.width = GRID_PIXELS; element.height = Math.round(593 * GRID_PIXELS / 1193);
      drawCatalogGrid(element.getContext('2d'), grid, new Map(ids.map((id, i) => [id, images[i]])), GRID_PIXELS, false);
      setShown(true);
    }).catch(() => {});
    return () => { active = false; };
  }, [grid]);
  return <canvas ref={canvas} className={`dg-grid${shown ? ' is-shown' : ''}`} style={{ width: 1193 * DOTA.screenScale, height: 593 * DOTA.screenScale }}/>;
}

export default function DotaGridPage({ grid, name }) {
  const frame = useRef(null), layer = useRef(null);
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
  return <div className="dota-grid-page" ref={frame} aria-hidden="true"><div className="dg-layer" ref={layer}>
    <div className="dg-band"/>
    <div className="dg-box">
      <img className="dg-subnav" src={subnav} alt=""/>
      <img className="dg-bans" src={bans} alt=""/>
      <GridLayer grid={grid}/>
      <img className="dg-sort" src={sort} alt=""/>
      {name && <span className="dg-sort-name">{name}</span>}
      <img className="dg-filters" src={filters} alt=""/>
    </div>
    <div className="dh-bar-left" style={{ backgroundImage: `url(${bar})` }}/>
    <div className="dh-bar-mid" style={{ backgroundImage: `url(${barMid})` }}/>
    <div className="dh-bar-right" style={{ backgroundImage: `url(${bar})` }}/>
    <div className="dm-party"><img src={railParty} alt=""/><img className="dm-party-me" src={avatar} alt=""/></div>
    <img className="dm-chat" src={chat} alt=""/>
    <img className="dm-play" src={play} alt=""/>
  </div></div>;
}
