// «Мини-игры» (/minigames): the site's own hub of the nine Crownfall games — a hero with the game of the day
// (or the last one played) on a tilted wall of gameplay shots, the library with sections, records from this
// browser and a loop on hover, and the credits. ?game=<id> opens a playable game over the page (a lazy
// chunk), Esc or × brings the hub back. 2026-10-17, the owner: look 1 of the variants (no gradient, glow or
// genre badges), no eyebrow, no facts row, no «Как в Dota» anywhere, a random game in the wall's middle on
// every load. What the hub says about the games: hub.mjs; the art: scripts/make-minigames-hub.mjs.
// The games and the shared core: docs/minigames.md.
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brand, Icon } from '../catalog/Common.jsx';
import { AccountButton, AccountProvider } from '../catalog/Account.jsx';
import { CATALOG_PATH, STUDIO_PATH } from '../catalog/api.js';
import { GUIDES_PATH } from '../guides/api.js';
import { CommunityLink } from '../Community.jsx';
import LanguageSwitch from '../LanguageSwitch.jsx';
import { useLanguage } from '../useLanguage.js';
import { useAppMotion } from '../useAppMotion.js';
import { countAction } from '../site-stats.js';
import { locale, t } from '../../scripts/i18n.mjs';
import { GAMES } from './games/index.js';
import { HUB, KINDS, LAST_KEY, bestUnit, hubArt, inKind } from './hub.mjs';
import { bestScore } from './core/assets.js';
import { useRanks } from './core/leaderboard.jsx';

const lazyGames = new Map(GAMES.filter((game) => game.load).map((game) => [game.id, lazy(game.load)]));
const playable = (id) => lazyGames.has(id);
const gameFromURL = () => { const id = new URLSearchParams(location.search).get('game'); return playable(id) ? id : null; };
const hubGame = (id) => HUB.find((game) => game.id === id);
const recall = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const remember = (key, value) => { try { localStorage.setItem(key, value); } catch { /* «Продолжить» just won't show. */ } };
// Loops only where they cost nothing to the reader: a pointer that hovers, motion allowed, no data saver.
const canLoop = () => matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches && !navigator.connection?.saveData;

const CONTROLS = { keyboard: ['keyboard', 'Клавиатура'], mouse: ['mouse', 'Мышь'], touch: ['hand', 'Касание'], gamepad: ['gamepad', 'Геймпад'] };
const formatBest = (id, value) => (bestUnit(id) === 'stars' ? t('{count} ★', { count: value }) : value.toLocaleString(locale));

// Records of this browser (core/assets.js), read again when a game closes.
function useBests(version) {
  return useMemo(() => Object.fromEntries(HUB.map((game) => [game.id, bestScore(game.id)])), [version]); // eslint-disable-line react-hooks/exhaustive-deps
}

// The viewer's place in a game's tables of records (core/leaderboard.jsx): the best of its boards.
const placeOf = (ranks, id) => Object.values(ranks[id] || {}).map((place) => place.rank).filter(Boolean).sort((a, b) => a - b)[0] || 0;

// --- the hero ------------------------------------------------------------------------------------------------

// A muted loop that starts once the page has settled and plays only while it is on screen.
function LoopVideo({ src, poster, className = '', label }) {
  const ref = useRef(null), [on, setOn] = useState(false);
  useEffect(() => {
    if (!src || !canLoop()) return undefined;
    let observer = null;
    const start = () => {
      observer = new IntersectionObserver(([entry]) => {
        const video = ref.current; if (!video) return;
        if (!entry.isIntersecting) { video.pause?.(); return; }
        if (!video.src) video.src = src; // set here, not by React: it must be there before play()
        setOn(true); video.play?.().catch(() => {});
      }, { threshold: 0.25 });
      if (ref.current) observer.observe(ref.current);
    };
    const idle = window.requestIdleCallback ? requestIdleCallback(start, { timeout: 2500 }) : setTimeout(start, 1200);
    return () => { (window.cancelIdleCallback || clearTimeout)(idle); observer?.disconnect(); };
  }, [src]);
  return <video ref={ref} className={`${className} ${on ? 'is-on' : ''}`} poster={poster} muted loop playsInline preload="none" aria-label={label}
    onPlaying={(event) => event.currentTarget.classList.add('is-playing')}/>;
}

// Nine shots on a tilted wall: the featured game in the middle, playing; the columns drift slowly.
function HeroWall({ featured, onOpen }) {
  const others = HUB.filter((game) => game.id !== featured.id);
  const columns = [[others[0], others[1], others[2]], [others[3], featured, others[4]], [others[5], others[6], others[7]]];
  return <div className="mg-wall" aria-hidden="true">
    <div className="mg-wall-plane">
      {columns.map((column, c) => <div className={`mg-wall-column mg-wall-column-${c}`} key={c}>
        {column.map((game) => {
          const art = hubArt(game.id), main = game === featured;
          return <button type="button" tabIndex={-1} key={game.id} className={`mg-wall-tile ${main ? 'is-featured' : ''}`} style={{ '--accent': game.accent }} onClick={() => onOpen(game.id)}>
            <img src={main ? art.poster : art.small} alt="" decoding="async" fetchPriority={main ? 'high' : 'low'}/>
            {main && <LoopVideo className="mg-wall-video" src={art.loop} poster={art.poster}/>}
            <span className="mg-wall-name">{t(game.name)}</span>
          </button>;
        })}
      </div>)}
    </div>
  </div>;
}

function Hero({ featured, wall, isLast, onOpen, onRandom }) {
  return <section className="mg-hero">
    <div className="mg-hero-copy">
      <h1>{t('Мини-игры')} <span className="mg-hero-accent">{t('из Dota 2')}</span></h1>
      <p className="mg-lead">{t('Рыбалка, гонки, файтинг, три в ряд и ещё пять игр из события Crownfall — с графикой и звуками оригинала. Без установки: открыл и играешь.')}</p>
      <div className="mg-hero-actions">
        <button type="button" className="catalog-button primary mg-cta" onClick={() => onOpen(featured.id)}>
          <Icon name="play"/><span>{isLast ? t('Продолжить') : t('Играть')}<b>{t(featured.name)}</b></span></button>
        <button type="button" className="catalog-button mg-random" onClick={onRandom}><Icon name="dice"/>{t('Случайная игра')}</button>
      </div>
    </div>
    <HeroWall featured={wall} onOpen={onOpen}/>
  </section>;
}

// --- the library ---------------------------------------------------------------------------------------------

function GameCard({ game, best, rank, index, onOpen }) {
  const art = hubArt(game.id), video = useRef(null), [hovered, setHovered] = useState(false);
  const enter = (event) => {
    if (event.pointerType !== 'mouse' || !art.loop || !canLoop()) return;
    setHovered(true);
    const node = video.current; if (!node) return;
    if (!node.src) node.src = art.loop;
    node.currentTime = 0; node.play?.().catch(() => {});
  };
  const leave = () => { setHovered(false); video.current?.pause?.(); };
  const phone = game.phone === 'any' ? t('Телефон: в любом положении') : t('Телефон: лучше горизонтально');
  const controls = game.controls;
  return <article className={`mg-card ${hovered ? 'is-hovered' : ''}`} style={{ '--accent': game.accent, '--i': index }} onPointerEnter={enter} onPointerLeave={leave}>
    <button type="button" className="mg-card-art" onClick={() => onOpen(game.id)} aria-label={t('Играть: {name}', { name: t(game.name) })}>
      <img src={art.poster} srcSet={`${art.small} 480w, ${art.poster} 960w`} sizes="(max-width: 760px) 92vw, (max-width: 1100px) 46vw, 31vw" alt="" loading="lazy" decoding="async"/>
      {art.loop && <video ref={video} muted loop playsInline preload="none" aria-hidden="true" onPlaying={(event) => event.currentTarget.classList.add('is-playing')} onPause={(event) => event.currentTarget.classList.remove('is-playing')}/>}
      {(best > 0 || rank > 0) && <span className="mg-card-badges">
        {rank > 0 && <span className="mg-card-best mg-card-rank" title={t('Место в таблице рекордов')}>{t('#{rank} в таблице', { rank })}</span>}
        {best > 0 && <span className="mg-card-best" title={t('Рекорд в этом браузере')}><Icon name="trophy"/>{formatBest(game.id, best)}</span>}</span>}
      <span className="mg-card-play"><Icon name="play"/>{t('Играть')}</span>
    </button>
    <div className="mg-card-body">
      <h3><button type="button" onClick={() => onOpen(game.id)}>{t(game.name)}</button></h3>
      <p>{t(game.pitch)}</p>
      <div className="mg-card-meta">
        <span className="mg-card-genre-text">{t(game.genre)}</span>
        <span className="mg-card-length"><Icon name="timer"/>{t(game.length)}</span>
        <span className="mg-card-controls">{controls.map((name) => <span key={name} title={t(CONTROLS[name][1])} aria-label={t(CONTROLS[name][1])}><Icon name={CONTROLS[name][0]}/></span>)}</span>
        <span className={`mg-card-phone ${game.phone === 'any' ? 'is-any' : ''}`} title={phone} aria-label={phone}><Icon name="phone"/>{game.phone === 'any' ? t('Любой экран') : t('Горизонтально')}</span>
      </div>
    </div>
  </article>;
}

function Library({ bests, ranks, onOpen }) {
  const [kind, setKind] = useState('all');
  const games = HUB.filter((game) => inKind(game, kind));
  return <section className="mg-library" aria-labelledby="mg-library-title">
    <div className="mg-library-head">
      <div><h2 id="mg-library-title">{t('Все игры')}</h2><p>{t('На минуту между делом, на подумать или погорячее — выбирай под настроение.')}</p></div>
      <div className="mg-library-tools">
        <div className="catalog-tabs mg-kinds" role="group" aria-label={t('Разделы')}>
          {KINDS.map(([id, label]) => <button type="button" key={id} aria-pressed={kind === id} onClick={() => setKind(id)}>{t(label)}<span>{HUB.filter((game) => inKind(game, id)).length}</span></button>)}
        </div>
      </div>
    </div>
    <div className="mg-grid" key={kind}>{games.map((game, index) => <GameCard key={game.id} game={game} best={bests[game.id]} rank={placeOf(ranks, game.id)} index={index} onOpen={onOpen}/>)}</div>
  </section>;
}

// --- the page ------------------------------------------------------------------------------------------------

function Shell() {
  const [game, setGame] = useState(gameFromURL), [version, setVersion] = useState(0);
  const [last, setLast] = useState(() => hubGame(recall(LAST_KEY)) || null);
  // The wall's middle: a random game on every load (the owner, 2026-10-17).
  const [wall] = useState(() => HUB[Math.floor(Math.random() * HUB.length)]);
  const bests = useBests(version), ranks = useRanks(version);
  useEffect(() => {
    const onPop = () => setGame(gameFromURL());
    window.addEventListener('popstate', onPop);
    const onStorage = (event) => { if (!event.key || event.key.startsWith('gridstudio.minigames')) setVersion((v) => v + 1); };
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('storage', onStorage); };
  }, []);
  // A closed game may have left a new record.
  useEffect(() => { if (!game) setVersion((v) => v + 1); }, [game]);
  useEffect(() => { document.body.classList.toggle('mg-locked', !!game); return () => document.body.classList.remove('mg-locked'); }, [game]);
  const open = useCallback((id) => {
    if (!playable(id)) return;
    const url = new URL(location.href); url.searchParams.set('game', id);
    history.pushState({ minigame: id }, '', url);
    setGame(id); countAction(`minigame:${id}`);
    remember(LAST_KEY, id); setLast(hubGame(id));
  }, []);
  const close = () => {
    if (history.state?.minigame) history.back();
    else { const url = new URL(location.href); url.searchParams.delete('game'); history.replaceState(null, '', url); setGame(null); }
  };
  const random = () => { const pool = HUB.filter((item) => item.id !== last?.id); open(pool[Math.floor(Math.random() * pool.length)].id); };
  const featured = last || wall;
  const Game = game ? lazyGames.get(game) : null;
  const title = game ? `${t(hubGame(game)?.name || game)} — ${t('Мини-игры')} — GridStudio` : `${t('Мини-игры')} — GridStudio`;
  useEffect(() => { document.title = title; }, [title]);
  return <div className="catalog-page mg-page mg-hub hub-look-1">
    <header className="catalog-nav"><Brand/><nav><CommunityLink/><a href={CATALOG_PATH}>{t('Мастерская')}</a><a href={GUIDES_PATH}>{t('Гайды')}</a><a href={STUDIO_PATH}>{t('Студия')}<Icon name="arrow"/></a><LanguageSwitch className="mg-nav-language"/><AccountButton/></nav></header>
    <main className="catalog-main mg-main" inert={!!game}>
      <Hero featured={featured} wall={wall} isLast={!!last} onOpen={open} onRandom={random}/>
      <Library bests={bests} ranks={ranks} onOpen={open}/>
      <footer className="mg-credits">
        <Icon name="shield"/>
        <p>{t('Фанатская реконструкция мини-игр Crownfall. Не связана с Valve. Графика и звуки — Valve Corporation.')} <span>{t('Рекорды хранятся в этом браузере, а с входом на сайт попадают в общую таблицу рекордов.')}</span></p>
        <LanguageSwitch className="mg-credits-language"/>
      </footer>
    </main>
    {Game && <div className="mg-layer"><Suspense fallback={<div className="mg-loading" role="status">{t('Загружаем…')}</div>}><Game onExit={close}/></Suspense></div>}
  </div>;
}

export default function MinigamesApp() { useAppMotion(); useLanguage(); return <AccountProvider><Shell/></AccountProvider>; }
