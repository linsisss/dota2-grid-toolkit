import { useEffect, useRef } from 'react';
import { fitPiece, MENU_LIMITS, pieceLength } from '../../scripts/menu-background.mjs';
import { locale, t } from '../../scripts/i18n.mjs';

// Choosing the piece of a video that becomes the background, and how it loops.
// The loop joins the end back to the start: with a crossfade of f seconds the last f seconds fade
// into the first f, and the clip starts f seconds in, so its end flows into its start. The preview
// plays exactly that with two video elements, before anything is encoded.
const secondsText = (value) => t('{seconds} с', { seconds: value.toLocaleString(locale, { maximumFractionDigits: 1 }) });
export const CROSSFADES = () => [[0, t('Нет')], [0.5, secondsText(0.5)], [1, secondsText(1)], [2, secondsText(2)]];
// The decimal mark of the site's language: 0:12,5 in Russian, 0:12.5 in English.
const DECIMAL = () => (0.5).toLocaleString(locale).charAt(1);
const clock = (seconds) => {
  const whole = Math.max(0, seconds), minutes = Math.floor(whole / 60), rest = whole - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0').replace('.', DECIMAL())}`;
};
export function LoopPreview({ src, piece, crossfade, style, onMeta, onTime }) {
  const first = useRef(null), second = useRef(null), front = useRef(0), time = useRef(onTime);
  time.current = onTime;
  useEffect(() => {
    let frame;
    const videos = () => [first.current, second.current];
    const fade = Math.min(crossfade, (piece.end - piece.start) / 3), entry = piece.start + fade;
    // Start inside the piece whenever it changes, where the encoded clip starts.
    const [main, spare] = front.current ? [second.current, first.current] : [first.current, second.current];
    if (main && (main.currentTime < piece.start || main.currentTime > piece.end)) main.currentTime = entry;
    if (spare) { spare.pause(); spare.style.opacity = 0; }
    const tick = () => {
      const [a, b] = videos(); if (!a || !b) return;
      const main = front.current ? b : a, next = front.current ? a : b, t = main.currentTime;
      main.style.opacity = 1; main.style.zIndex = 1; next.style.zIndex = 2;
      if (main.paused && !main.ended && main.readyState >= 2) main.play().catch(() => {});
      if (fade > 0 && t >= piece.end - fade) {
        // The piece's start fades in over its end; at the end the start takes over.
        if (next.paused) { next.currentTime = piece.start + (t - (piece.end - fade)); next.play().catch(() => {}); }
        next.style.opacity = Math.min(1, (t - (piece.end - fade)) / fade);
        if (t >= piece.end - 0.03 || main.ended) { main.pause(); main.style.opacity = 0; front.current = 1 - front.current; }
      } else if (t >= piece.end || main.ended) { main.currentTime = entry; main.play().catch(() => {}); }
      else if (!next.paused) { next.pause(); next.style.opacity = 0; }
      time.current?.(t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [piece.start, piece.end, crossfade]);
  return <div className="custom-loop" style={style}>
    <video ref={first} src={src} muted playsInline autoPlay preload="auto" onLoadedMetadata={(event) => onMeta?.(event.target)}/>
    <video ref={second} src={src} muted playsInline preload="auto" style={{ opacity: 0 }}/>
  </div>;
}

// The timeline: the whole video, the chosen piece with two handles, the playhead.
export function TrimBar({ duration, piece, crossfade, playhead, onChange, onCrossfade }) {
  const track = useRef(null), drag = useRef(null);
  const at = (event) => { const box = track.current.getBoundingClientRect(); return Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * duration; };
  const down = (what) => (event) => {
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { what, from: at(event), piece };
  };
  const move = (event) => {
    const d = drag.current; if (!d) return;
    const now = at(event), shift = now - d.from;
    if (d.what === 'start') onChange(fitPiece({ start: now, end: d.piece.end }, duration, 'start'));
    else if (d.what === 'end') onChange(fitPiece({ start: d.piece.start, end: now }, duration, 'end'));
    else {
      const length = d.piece.end - d.piece.start, start = Math.max(0, Math.min(duration - length, d.piece.start + shift));
      onChange({ start, end: start + length });
    }
  };
  const up = () => { drag.current = null; };
  const percent = (value) => `${(value / duration) * 100}%`;
  const fade = Math.min(crossfade, (piece.end - piece.start) / 3);
  // Keyboard: arrows move a handle by a tenth of a second, with Shift by a second.
  const key = (what) => (event) => {
    const step = event.shiftKey ? 1 : 0.1, delta = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    if (!delta) return; event.preventDefault();
    onChange(fitPiece(what === 'start' ? { start: piece.start + delta, end: piece.end } : { start: piece.start, end: piece.end + delta }, duration, what));
  };
  return <div className="custom-trim">
    <div className="custom-trim-head">
      <span><b>{clock(piece.start)}</b> — <b>{clock(piece.end)}</b></span>
      <span className="catalog-muted">{t('в фоне {length} с из {limit}', { length: pieceLength(piece, crossfade).toLocaleString(locale, { maximumFractionDigits: 1 }), limit: MENU_LIMITS.seconds })}</span>
      <span className="custom-trim-loop"><span className="catalog-muted">{t('Склейка')}</span>
        <span className="custom-seg has-thumb is-compact" role="radiogroup" aria-label={t('Плавная склейка')} style={{ '--count': CROSSFADES().length, '--index': CROSSFADES().findIndex(([value]) => value === crossfade) }}>
          <span className="custom-seg-thumb" aria-hidden="true"/>{CROSSFADES().map(([value, label]) =>
          <button key={value} type="button" role="radio" aria-checked={crossfade === value} onClick={() => onCrossfade(value)}>{label}</button>)}</span></span>
    </div>
    <div className="custom-trim-track" ref={track} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onPointerDown={(event) => { const t = at(event), length = piece.end - piece.start, start = Math.max(0, Math.min(duration - length, t - length / 2)); onChange({ start, end: start + length }); }}>
      <span className="custom-trim-piece" style={{ left: percent(piece.start), width: percent(piece.end - piece.start) }} onPointerDown={down('move')}>
        {fade > 0 && <><i className="custom-trim-fade is-in" style={{ width: `${(fade / (piece.end - piece.start)) * 100}%` }}/><i className="custom-trim-fade is-out" style={{ width: `${(fade / (piece.end - piece.start)) * 100}%` }}/></>}
      </span>
      <span className="custom-trim-handle" role="slider" tabIndex={0} aria-label={t('Начало')} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={piece.start} style={{ left: percent(piece.start) }} onPointerDown={down('start')} onKeyDown={key('start')}/>
      <span className="custom-trim-handle" role="slider" tabIndex={0} aria-label={t('Конец')} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={piece.end} style={{ left: percent(piece.end) }} onPointerDown={down('end')} onKeyDown={key('end')}/>
      {/* Moved by the preview itself (LoopPreview onTime), not by React. */}
      <span className="custom-trim-playhead" ref={playhead}/>
    </div>
  </div>;
}
