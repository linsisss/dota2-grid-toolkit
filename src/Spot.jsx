import { useEffect, useRef, useState } from 'react';
import { t } from '../scripts/i18n.mjs';
import { track } from './site-stats.js';
import './spot.css';

// The advertising place (asked for on 2026-10-04): one banner on the landing page, in the workshop's
// grids and backgrounds and in the guides — after the first row of cards, across the whole row — and
// under it the offer to advertise here. The admin panel's «Реклама» (server/site-spot.mjs) hides it
// everywhere or on some pages, changes the banner and both links; the pages read that from
// GET /api/catalog/spot, once per page. The names say «spot», not «ad»: generic ad-blocker lists
// (EasyList `##.ad-slot`) hid the first version of this first-party banner even from the site's owner.
let pending = null;
function loadSpot() {
  pending ||= fetch('/api/catalog/spot', { credentials: 'omit' }).then((response) => (response.ok ? response.json() : null)).catch(() => null);
  return pending;
}
// undefined until the answer, null without one (no API), else the place.
export function useSpot() {
  const [spot, setSpot] = useState(undefined);
  useEffect(() => { let active = true; loadSpot().then((value) => { if (active) setSpot(value); }); return () => { active = false; }; }, []);
  return spot;
}

// `place`: landing, grids, backgrounds or guides. `className` places it: 'is-in-grid' takes a whole
// row of a card grid (the grid needs grid-auto-flow: dense, so the cards after it fill the first row).
export function Spot({ place, className = '' }) {
  const spot = useSpot();
  if (!spot?.places?.[place]) return null;
  return <SpotView spot={spot} className={className} place={place}/>;
}

// Also the admin panel's preview (no `place`: not counted). With `place`, spot.view once half of it is in
// view, spot.click on the banner and the offer.
export function SpotView({ spot, className = '', place = '' }) {
  const box = useRef(null);
  useEffect(() => {
    if (!place || !box.current || typeof IntersectionObserver !== 'function') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect(); track('spot.view', { place });
    }, { threshold: 0.5 });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, [place]);
  const clicked = (target) => () => { if (place) track('spot.click', { place, target }); };
  const picture = <img src={spot.image} srcSet={`${spot.small} 960w, ${spot.image} ${spot.width}w`} sizes="(max-width: 760px) 100vw, 860px"
    alt={spot.alt} width={spot.width} height={spot.height} loading="lazy" decoding="async"/>;
  return <aside ref={box} className={`gs-spot ${className}`.trim()} aria-labelledby="gsSpotMark" style={{ '--spot-ratio': spot.width / spot.height }}>
    <div className="gs-spot-frame">
      <img className="gs-spot-glow" src={spot.small} alt="" aria-hidden="true" loading="lazy" decoding="async"/>
      {spot.href ? <a className="gs-spot-picture" href={spot.href} target="_blank" rel="noopener sponsored" onClick={clicked('banner')}>{picture}</a> : <div className="gs-spot-picture">{picture}</div>}
    </div>
    {/* The mark under the banner, not on it: on a phone it covered the banner's own text. */}
    <p className="gs-spot-caption"><span id="gsSpotMark" className="gs-spot-mark">{t('Реклама')}</span>
      {spot.contact && <a className="gs-spot-offer" href={spot.contact} target="_blank" rel="noopener noreferrer" onClick={clicked('offer')}>{t('Здесь может быть ваша реклама')}</a>}</p>
  </aside>;
}
