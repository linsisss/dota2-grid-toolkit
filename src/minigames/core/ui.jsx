// The minigames' shared pieces (docs/minigames.md): the Valve popup frame, its buttons, the fitting of a
// fixed-size game into the window, the «Как играть» rows and the results panel. Styles: minigames.css
// (the .mg-* classes); each game styles its own board.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getVolume, isMuted, onMuted, setMuted, setVolume } from './sound.js';
import { t } from '../../../scripts/i18n.mjs';

const SHARED = './assets/minigames/shared/';
export const sharedImage = (name) => `${SHARED}images/${name}`;

// Draws children at their own size, scaled down (never up) to fit the parent; with fitHeight=false only
// the width counts and the box grows to the scaled height (the page scrolls — a tall menu on a phone).
export function Fit({ children, className = '', max = 1, fitHeight = true }) {
  const outer = useRef(null), inner = useRef(null), [scale, setScale] = useState(1), [height, setHeight] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const width = inner.current.offsetWidth, tall = inner.current.offsetHeight;
      const box = outer.current.getBoundingClientRect();
      if (!width || !tall) return;
      const next = Math.min(max, box.width / width, fitHeight ? box.height / tall : Infinity);
      setScale(next); setHeight(fitHeight ? null : Math.ceil(tall * next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer.current); observer.observe(inner.current);
    return () => observer.disconnect();
  }, [max, fitHeight]);
  return <div className={`mg-fit ${fitHeight ? '' : 'mg-fit-scroll'} ${className}`} ref={outer} style={height ? { height } : undefined}>
    <div className="mg-fit-inner" ref={inner} style={{ transform: `translate(-50%, ${fitHeight ? '-50%' : '0'}) scale(${scale})` }}>{children}</div></div>;
}

// Phones and narrow windows: games switch to a compact layout there (the popup hugs the board).
export function useCompact(query = '(max-width: 760px)') {
  const [compact, setCompact] = useState(() => matchMedia(query).matches);
  useEffect(() => { const list = matchMedia(query), on = () => setCompact(list.matches); list.addEventListener('change', on); return () => list.removeEventListener('change', on); }, [query]);
  return compact;
}

// DOTACrownfallButton: the blue plate with gold ends.
export function CrownfallButton({ children, onClick, className = '', disabled = false, sound }) {
  return <button type="button" className={`mg-button ${className}`} disabled={disabled}
    onMouseEnter={() => sound?.('General.Buttonrollover')} onClick={(event) => { sound?.('General.ButtonClick'); onClick?.(event); }}><span>{children}</span></button>;
}

// The popup's corner button: × leaves, ↺ (in a running game) returns to the game's menu.
export function CloseButton({ onClick, mode = 'close', label }) {
  return <button type="button" className={`mg-close mg-close-${mode}`} onClick={onClick} aria-label={label || t('Закрыть')}>
    <img src={sharedImage(mode === 'return' ? 'reset.svg' : 'x_close.svg')} alt=""/></button>;
}

// A hint at the popup's bottom right: «СПРАВКА [F1]», «ПАУЗА [F9]».
export function KeyHint({ label, keyName, onClick }) {
  return <button type="button" className="mg-keyhint" onClick={onClick}><span>{label}</span><kbd>{keyName}</kbd></button>;
}

export function MuteButton() {
  const [muted, set] = useState(isMuted), [volume, setLevel] = useState(getVolume);
  useEffect(() => onMuted((m, v) => { set(m); setLevel(v); }), []);
  const silent = muted || volume === 0, percent = Math.round(volume * 100);
  return <div className="mg-sound">
    <button type="button" className="mg-mute" onClick={() => (volume === 0 ? setVolume(0.4) : setMuted(!muted))} aria-pressed={silent} title={silent ? t('Включить звук') : t('Выключить звук')}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>{silent ? <path d="m16 9 5 6m0-6-5 6"/> : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>}</svg></button>
    <input type="range" className="mg-volume" min="0" max="100" step="5" value={silent ? 0 : percent} aria-label={t('Громкость')} title={t('Громкость: {percent}%', { percent: silent ? 0 : percent })}
      onChange={(event) => setVolume(Number(event.target.value) / 100)} style={{ '--fill': `${silent ? 0 : percent}%` }}/>
  </div>;
}


// A row of «Как играть»: a picture on the left, a title and a line or two on the right.
export function HowToRow({ picture, title, details, tip }) {
  return <div className="mg-howto-row"><div className="mg-howto-picture">{picture}</div>
    <div className="mg-howto-text"><b>{title}{tip && <span className="mg-info" title={tip} aria-label={tip}>i</span>}</b>
      {typeof details === 'string' ? details.split('\n').map((line, i) => <span key={i}>{line}</span>) : <span>{details}</span>}</div></div>;
}
export const Mouse = ({ button }) => <img className="mg-mouse" src={sharedImage(`mouse_${button}click.webp`)} alt=""/>;

// The centre band with a big message, the score lines and buttons (Valve's CenterHUD).
// `board`: the line of the tables of records (core/leaderboard.jsx BoardOutcome) under the score.
export function ResultBand({ message, lines = [], total, totalLabel, children, record, board = null }) {
  return <div className="mg-band" role="status">
    <div className="mg-band-body">
      <div className="mg-band-message">{message}</div>
      {(lines.length > 0 || total !== undefined) && <div className="mg-band-lines">
        {lines.map(([title, value]) => <div className="mg-band-line" key={title}><span>{title}</span><span>{value}</span></div>)}
        {total !== undefined && <div className="mg-band-line mg-band-total"><span>{totalLabel}</span><span>{total}</span></div>}
        {record && <div className="mg-band-record">{record}</div>}
      </div>}
      {board}
    </div>
    <div className="mg-band-actions">{children}</div>
  </div>;
}
