import { useEffect, useRef } from 'react';
import { t } from '../../scripts/i18n.mjs';
import { HUD_PORTRAIT, PORTRAIT_LIMITS, hudRect } from '../../scripts/hero-portraits.mjs';
import { SCREEN } from '../../scripts/hud-capture/compose.mjs';

// The heroes' HUD portrait in the match preview (2026-10-24, «Портреты героев» → «Также использовать свой
// портрет в игре»): the captured HUD shows Keeper of the Light's 3D portrait; this layer puts the user's
// picture or video in its window as Dota would (scripts/hero-portraits.mjs HUD_PORTRAIT), under what Dota
// draws over the portrait — #LowerOverlay's fade, the stats' gradient, and the stats themselves and the
// frame's corner, lifted from the composed HUD (its bright pixels there; the 3D hero under them is dark).
// Where the window is, measured on the capture at 100 % (#PortraitGroup 159 × 145 at x 542, on the bottom
// edge) and scaled with the lower HUD's ui-scale around the screen's bottom middle.
const GROUP = Object.freeze({ x: 542, width: 159, height: 145 });
// The capture's parts over the portrait (window px at 100 %): the frame's cut corner with the hero badge,
// the stats column at the right and the attributes' row at the bottom.
const CORNER = 38, COLUMN = 115, ROW = { y: 126, x: 36 };
export const hudWindow = (lower) => {
  const k = lower / 100;
  return { x: SCREEN.width / 2 - (SCREEN.width / 2 - GROUP.x) * k, y: SCREEN.height - GROUP.height * k, width: GROUP.width * k, height: GROUP.height * k, k };
};

// The composed screen's pixels over the portrait that are not the hero: out (RGB of SCREEN) → canvas.
function liftOver(canvas, out, win) {
  const w = Math.round(win.width), h = Math.round(win.height), x0 = Math.round(win.x), y0 = Math.round(win.y);
  canvas.width = w; canvas.height = h;
  const context = canvas.getContext('2d'), image = context.createImageData(w, h), d = image.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = ((y0 + y) * SCREEN.width + x0 + x) * 3, r = out[p], g = out[p + 1], b = out[p + 2];
    const ux = x / win.k, uy = y / win.k, lum = 0.2126 * r + 0.7152 * g + 0.0722 * b, sat = Math.max(r, g, b) - Math.min(r, g, b);
    let alpha = 0;
    if (ux + uy < CORNER) alpha = 1;
    else if (ux >= COLUMN || (uy >= ROW.y && ux >= ROW.x)) alpha = Math.min(1, Math.max(0, (Math.max(lum, sat) - 75) / 75));
    const i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = Math.round(alpha * 255);
  }
  context.putImageData(image, 0, 0);
}

// hud: the preview's hero (HeroPortraits.jsx hudPreview); lower: the lower HUD's scale; out: the composed screen
// (RGB bytes) and frame: a number that changes with it.
export default function HudPortraitLayer({ hud, lower, out, frame }) {
  const top = useRef(null), media = useRef(null), still = useRef(null);
  const win = hudWindow(lower), { panel, view, fade } = HUD_PORTRAIT;
  useEffect(() => { if (top.current && out) liftOver(top.current, out, win); }, [frame, lower, !!out]);
  useEffect(() => {
    const node = still.current;
    if (!node || !hud.picture) return;
    node.width = hud.picture.width; node.height = hud.picture.height;
    node.getContext('2d').drawImage(hud.picture, 0, 0);
  }, [hud.picture]);
  // A video loops from its start for at most PORTRAIT_LIMITS.seconds, as the HUD's movie does.
  useEffect(() => {
    const node = media.current;
    if (!hud.video || !node) return undefined;
    const end = hud.start + PORTRAIT_LIMITS.seconds, loop = () => { if (node.currentTime < hud.start - 0.05 || node.currentTime >= end) node.currentTime = hud.start; };
    node.currentTime = hud.start;
    node.addEventListener('timeupdate', loop);
    return () => node.removeEventListener('timeupdate', loop);
  }, [hud.url, hud.start, hud.video]);
  const pct = (value, of) => `${(value / of) * 100}%`;
  // The portrait's square in the window (it starts 16 px left of and above it), and the picture in the square.
  const square = { left: pct(-view.x, view.width), top: pct(-view.y, view.height), width: pct(panel, view.width), height: pct(panel, view.height) };
  const r = hudRect(hud.width, hud.height, hud.crop), place = { left: pct(-r.x, r.w), top: pct(-r.y, r.h), width: pct(hud.width, r.w), height: pct(hud.height, r.h) };
  const moving = hud.kind === 'video';
  return <>
    {hud.stand && <span className="hp-hud-tag" style={{ left: pct(win.x, SCREEN.width), top: pct(win.y - 22 * win.k, SCREEN.height) }}>{t('{hero} на месте Keeper of the Light — только в превью', { hero: hud.name })}</span>}
    <div className="hp-hud-live" aria-hidden="true" style={{ left: pct(win.x, SCREEN.width), top: pct(win.y, SCREEN.height), width: pct(win.width, SCREEN.width), height: pct(win.height, SCREEN.height) }}>
      <div style={{ position: 'absolute', overflow: 'hidden', background: '#000', ...square }}>
        {moving && hud.video ? <video ref={media} src={hud.url} muted loop playsInline autoPlay style={{ position: 'absolute', maxWidth: 'none', ...place }}/>
          : moving ? <img src={hud.url} alt="" style={{ position: 'absolute', maxWidth: 'none', ...place }}/>
            : <canvas ref={still} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}/>}
        <span className="hp-hud-fade" style={{ height: `${fade * 100}%` }}/>
      </div>
      <span className="hp-hud-stats" style={{ inset: 0 }}/>
      <canvas ref={top} style={{ position: 'absolute', inset: 0 }}/>
    </div>
  </>;
}
