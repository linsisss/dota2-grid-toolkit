// «Крылатые гонки» (Crownfall act II, Bat Racer): Valve's bp_popup_crownfall_encounter_flappy_skywrath
// rebuilt for the browser. The rules are logic.mjs, the picture is scene.js (a canvas over Valve's
// 1244×700 popup), the menu and the HUD keep the classes' roles of Valve's layout and CSS
// (bp_popup_crownfall_encounter_minigame + _flappy_skywrath, race.css). docs/minigames.md.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createSounds } from '../../core/sound.js';
import { assetBase, bestScore, loadJSON, loadStrings, saveScore } from '../../core/assets.js';
import { CloseButton, CrownfallButton, Fit, KeyHint, MuteButton, ResultBand, useCompact } from '../../core/ui.jsx';
import { BoardOutcome, Leaderboard, useRun } from '../../core/leaderboard.jsx';
import { REWARDS, coast, createRace, flap, nextReward, progress, raceConfig, raceShapes, step } from './logic.mjs';
import { createRenderer, loadScene, preloadAround } from './scene.js';
import { locale, t } from '../../../../scripts/i18n.mjs';
import { useLanguage } from '../../../useLanguage.js';
import './race.css';

const BASE = assetBase('race'), IMG = `${BASE}images/`, SCENE = `${BASE}scene/`, NOVEL = assetBase('novel');
const ENDLESS_KEY = 'gridstudio.minigames.race.endless', TIME_KEY = 'gridstudio.minigames.race.time';
const STEP = 1 / 120;
// Valve's AnimateIn (FadeIn 1.3 s) and AnimateOut (ShrinkCircle 2 s: the cover fades in over the first
// half while the hole is 52× its size, the hole closes by 94 %).
const FADE_IN = 1.3, SHRINK = 2, HOLE = 10;
const SND = {
  flap: 'crownfall.flappy.skywrath.flap', hit: 'crownfall.flappy.skywrath.collision', sand: 'crownfall.flappy.skywrath.sand', boost: 'crownfall.flappy.skywrath.boost',
  hurt: 'crownfall.flappy.skywrath.vo_hurt', start: 'crownfall.flappy.skywrath.vo_startrace', win: 'crownfall.flappy.skywrath.vo_victory', fail: 'crownfall.flappy.skywrath.vo_failure',
  batStart: 'crownfall.flappy.batrider.vo_startrace', batWin: 'crownfall.flappy.batrider.vo_victory',
};
// Batrider's lines at the end of a race (DOTA_VisualNovel_act2_Dialogue_flappy-skywrath-*).
const LINES = { player: ['flappy-skywrath-win', 'flappy-skywrath-win-alt01', 'flappy-skywrath-win-alt02'], opponent: ['flappy-skywrath-lose', 'flappy-skywrath-lose-alt01', 'flappy-skywrath-lose-alt02'] };

const number = (value) => Number(value).toLocaleString(locale);
const seconds = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const remember = (key, value) => { try { localStorage.setItem(key, String(value)); } catch { /* Not remembered. */ } };
const recall = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
// Valve's rich strings: <b>…</b> and new lines.
const rich = (text) => text.split('\n').map((line, i) => <span key={i} className="rc-line">{line.split(/<b>(.*?)<\/b>/g).map((part, j) => (j % 2 ? <b key={j}>{part}</b> : part))}</span>);

export default function Race({ onExit }) {
  useLanguage();
  const [assets, setAssets] = useState(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([loadJSON(`${BASE}data.json`), loadJSON(`${BASE}sounds.json`), loadStrings('race'), loadJSON('./assets/minigames/shared/sounds.json').catch(() => ({})), loadScene(SCENE)])
      .then(([data, sounds, valve, shared, scene]) => setAssets({ config: raceConfig(data, raceShapes(scene.meta)), sounds: createSounds(BASE, sounds), ui: createSounds('./assets/minigames/shared/', shared), valve, scene }))
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <div className="mg-loading" role="alert">{t('Не удалось загрузить игру. Обнови страницу.')}</div>;
  if (!assets) return <div className="mg-loading" role="status">{t('Загружаем…')}</div>;
  return <RacePopup assets={assets} onExit={onExit}/>;
}

function RacePopup({ assets, onExit }) {
  const { config, sounds, ui, valve, scene } = assets;
  const compact = useCompact(), table = useRun('race');
  const canvasRef = useRef(null), rendererRef = useRef(null), gameRef = useRef(null), runRef = useRef(null), hudRef = useRef({});
  const [screen, setScreen] = useState('menu');               // menu → play → result
  const [mode, setMode] = useState('race');
  const [paused, setPaused] = useState(false), [novel, setNovel] = useState(null), [result, setResult] = useState(null), [finishToast, setFinishToast] = useState(false);
  const [endless, setEndless] = useState(() => recall(ENDLESS_KEY) === '1');
  const [best, setBest] = useState(() => bestScore('race')), [bestTime, setBestTime] = useState(() => Number(recall(TIME_KEY)) || 0);
  const [playedOnce, setPlayedOnce] = useState(false);
  const click = useCallback((name) => ui.play(name), [ui]);
  const pausedRef = useRef(false); pausedRef.current = paused;
  // ?racedebug=1: the running game for automated checks (tests drive the hero from outside).
  useEffect(() => { if (new URLSearchParams(location.search).has('racedebug')) window.__gsRace = { game: () => gameRef.current, flap: () => doFlapRef.current?.() }; }, []);
  const doFlapRef = useRef(null);

  useEffect(() => () => { sounds.stopAll(); ui.stopAll(); }, [sounds, ui]);
  useEffect(() => { rendererRef.current = createRenderer(canvasRef.current, scene); }, [scene]);
  // The menu's backdrop: the scene where a race starts (blurred by CSS like Valve's IntroMenu).
  useEffect(() => {
    if (screen !== 'menu') return;
    const backdrop = createRace(config, { mode: 'race' });
    preloadAround(scene, 'race', backdrop.camera.x).then(() => { if (rendererRef.current && !runRef.current) rendererRef.current.draw(backdrop, { time: 0, menu: true }); });
  }, [screen, config, scene]);

  // The HUD reads the game every frame without React: the score, the race bar, «НОВЫЙ!».
  const paintHud = useCallback((game) => {
    const h = hudRef.current;
    if (game.mode === 'endless') {
      if (h.score) h.score.textContent = number(game.score);
      const isNew = game.score > best && best > 0;
      if (h.high) h.high.textContent = number(Math.max(best, game.score));
      h.panel?.classList.toggle('rc-new-high', isNew);
      const next = nextReward(Math.max(best, game.score));
      if (h.next) h.next.textContent = next ? number(next[0]) : '—';
      if (h.pips && h.pips.dataset.n !== String(next?.[1] ?? 0)) { h.pips.dataset.n = String(next?.[1] ?? 0); h.pips.replaceChildren(...Array.from({ length: next?.[1] ?? 0 }, () => document.createElement('em'))); }
    } else {
      const at = progress(game);
      if (h.sky) h.sky.style.left = `${at.player * 100}%`;
      if (h.bat) h.bat.style.left = `${at.opponent * 100}%`;
      if (h.bar) h.bar.style.width = `${Math.max(at.player, at.opponent) * 100}%`;
    }
  }, [best]);

  const finishRun = useCallback((game) => {
    const out = { mode: game.mode, winner: game.winner, score: game.score, time: game.player.finishedAt ?? game.time, hits: game.player.hits, record: false };
    if (game.mode === 'endless') {
      out.record = saveScore('race', game.score);
      if (out.record) setBest(game.score);
      table.submit({ score: game.score, stats: { hits: game.player.hits } });
    } else if (game.winner === 'player') {
      // The table of race times counts in hundredths of a second (server/minigames.mjs).
      table.submit({ score: Math.round(out.time * 100), stats: { hits: game.player.hits } });
      // a won race writes 1 000 to the high score (client.dll), the first reward
      if (saveScore('race', game.score)) setBest(game.score);
      if (!endless) { remember(ENDLESS_KEY, '1'); setEndless(true); out.unlocked = true; }
      if (!bestTime || out.time < bestTime) { remember(TIME_KEY, out.time.toFixed(2)); setBestTime(out.time); out.record = true; }
    } else table.cancel();
    setPlayedOnce(true);
    setResult(out);
  }, [endless, bestTime, table.submit, table.cancel]); // eslint-disable-line react-hooks/exhaustive-deps

  const handle = useCallback((events, run) => {
    const game = gameRef.current, r = rendererRef.current;
    for (const e of events) {
      if (e.type === 'flap') sounds.play(SND.flap);
      else if (e.type === 'hit') {
        sounds.play(SND.hit); r.burst('hit', e.x, e.z);
        if (run.clock - run.lastHurt > 2.5) { run.lastHurt = run.clock; sounds.play(SND.hurt); }
      } else if (e.type === 'land') { sounds.play(SND.sand); r.burst('land', game.player.x, game.player.z); }
      else if (e.type === 'sand') { sounds.play(SND.sand); r.burst('sand', game.player.x, game.player.z); }
      else if (e.type === 'crash') { sounds.play(SND.hit); r.burst('crash', e.x, e.z); setTimeout(() => sounds.play(SND.fail), 500); run.endAt = run.clock; }
      else if (e.type === 'finish') {
        run.endAt = run.clock;
        if (e.winner === 'player') { sounds.play(SND.win); setFinishToast(true); }
        else { sounds.play(SND.batWin); setTimeout(() => sounds.play(SND.fail), 2600); }
      }
    }
  }, [sounds]);

  // The loop: fixed steps of the rules, a frame of the picture, the outro after the end.
  const loop = useCallback(() => {
    const run = runRef.current; if (!run) return;
    const now = performance.now(), dt = Math.min(0.05, (now - run.last) / 1000); run.last = now;
    const game = gameRef.current, r = rendererRef.current;
    if (!pausedRef.current && !run.novelOpen) {
      run.clock += dt; run.acc += dt;
      while (run.acc >= STEP) {
        run.acc -= STEP;
        if (game.phase === 'running') { const ev = step(game, STEP); if (ev.length) handle(ev, run); }
        else coast(game, STEP);
      }
      r.step(dt);
    }
    let circle = null;
    if (game.phase === 'over' && run.endAt !== null) {
      const since = run.clock - run.endAt, wait = game.mode === 'race' ? 1.6 : 1.1;
      if (game.mode === 'race' && since >= wait && !run.novelShown) {
        run.novelShown = true; run.novelOpen = true;
        const lines = LINES[game.winner]; setNovel(lines[Math.floor(Math.random() * lines.length)]);
      }
      const outro = since - wait - (run.novelTime || 0);
      if ((game.mode === 'endless' || (run.novelShown && !run.novelOpen)) && outro > 0) {
        const t2 = outro / SHRINK;
        circle = { opacity: Math.min(1, t2 / 0.5), radius: t2 < 0.5 ? HOLE * 52 : t2 < 0.94 ? HOLE * (52 - 51 * (t2 - 0.5) / 0.44) : 0 };
        if (t2 >= 1 && !run.done) { run.done = true; finishRun(game); setScreen('result'); }
      }
    }
    const fade = Math.max(0, 1 - run.clock / FADE_IN);
    r.draw(game, { time: run.clock, fade: fade * fade, circle });
    paintHud(game);
    if (!run.done) run.frame = requestAnimationFrame(loop);
  }, [handle, finishRun, paintHud]);

  const stopRun = useCallback(() => { if (runRef.current) cancelAnimationFrame(runRef.current.frame); runRef.current = null; }, []);
  useEffect(() => stopRun, [stopRun]);

  const start = useCallback(async (which) => {
    stopRun();
    const game = createRace(config, { mode: which });
    gameRef.current = game;
    rendererRef.current.clear();
    setMode(which); setPaused(false); setNovel(null); setResult(null); setFinishToast(false); table.start(which === 'endless' ? 'endless' : 'time');
    sounds.preload(Object.values(SND));
    await preloadAround(scene, which, game.camera.x);
    setScreen('play');
    sounds.play(SND.start);
    if (which === 'race') { sounds.play(SND.boost); setTimeout(() => { if (gameRef.current === game) sounds.play(SND.batStart); }, 2800); }
    runRef.current = { last: performance.now(), clock: 0, acc: 0, endAt: null, lastHurt: -9, novelShown: false, novelOpen: false, novelTime: 0, done: false, frame: 0 };
    runRef.current.frame = requestAnimationFrame(loop);
  }, [config, scene, sounds, loop, stopRun, table.start]); // eslint-disable-line react-hooks/exhaustive-deps

  const toMenu = useCallback(() => { stopRun(); sounds.stopAll(); setScreen('menu'); setPaused(false); setNovel(null); setFinishToast(false); }, [stopRun, sounds]);

  const closeNovel = useCallback(() => {
    const run = runRef.current; setNovel(null);
    if (run && run.novelOpen) { run.novelOpen = false; run.novelTime = 0; run.endAt = run.clock - 1.6; }
  }, []);
  // The line stays 4 s, or until a click.
  useEffect(() => { if (!novel) return undefined; const id = setTimeout(closeNovel, 4200); return () => clearTimeout(id); }, [novel, closeNovel]);

  const doFlap = useCallback(() => {
    const game = gameRef.current, run = runRef.current;
    if (screen !== 'play' || !game || !run || pausedRef.current) return;
    if (run.novelOpen) { closeNovel(); return; }
    const ev = flap(game); if (ev.length) handle(ev, run);
  }, [screen, handle, closeNovel]);

  doFlapRef.current = doFlap;
  // Space, W, ↑ beat the wings (Valve's Jump buttons); Esc pauses, or leaves the menu / the results.
  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.('input, textarea')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (screen === 'menu') onExit(); else if (screen === 'result') toMenu();
        else if (gameRef.current?.phase === 'running') setPaused((v) => !v);
        return;
      }
      if (event.code === 'Space' || event.code === 'KeyW' || event.code === 'ArrowUp') {
        if (screen !== 'play') return;
        event.preventDefault(); if (!event.repeat) doFlap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, onExit, toMenu, doFlap]);
  // A hidden tab or a lost focus pauses the flight.
  useEffect(() => {
    if (screen !== 'play') return undefined;
    const hide = () => { if (gameRef.current?.phase === 'running') setPaused(true); };
    const onVis = () => { if (document.hidden) hide(); };
    document.addEventListener('visibilitychange', onVis); window.addEventListener('blur', hide);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('blur', hide); };
  }, [screen]);
  useEffect(() => { if (runRef.current) runRef.current.last = performance.now(); }, [paused]);

  const classes = ['rc-popup', screen === 'menu' ? 'rc-intro' : 'rc-running', `rc-mode-${screen === 'menu' ? (endless ? 'endless' : 'race') : mode}`, endless && 'rc-endless-open',
    paused && 'rc-paused', novel && 'rc-novel', playedOnce && 'rc-played', compact && 'rc-compact'].filter(Boolean).join(' ');

  return <Fit className="rc-fit">
    <div className={classes} onContextMenu={(event) => event.preventDefault()}>
      <div className="rc-main">
        <div className="rc-gold-dash"/>
        <div className="rc-scene" onPointerDown={(event) => { if (event.button === 0 || event.pointerType !== 'mouse') { event.preventDefault(); doFlap(); } }}>
          <canvas ref={canvasRef} width="1244" height="700" className="rc-canvas"/>
          {screen === 'menu' && <MenuHeroes/>}
          {screen !== 'menu' && <Hud mode={mode} valve={valve} best={best} hudRef={hudRef}/>}
          {finishToast && screen === 'play' && !novel && <div className="rc-finish-toast">{valve('DOTA_Crownfall_Overworld_Finish')}</div>}
        </div>
        {screen === 'menu' && <MainMenu valve={valve} endless={endless} best={best} bestTime={bestTime} playedOnce={playedOnce} onPlay={start} onExit={onExit} sound={click}/>}
        {novel && <Novel line={novel} valve={valve} onNext={closeNovel}/>}
        {paused && screen === 'play' && <div className="rc-pause"><b>{valve('DOTA_Crownfall_Minesweeper_Paused')}</b>
          <div className="rc-pause-buttons"><CrownfallButton onClick={() => setPaused(false)} sound={click}>{valve('DOTA_Crownfall_Minesweeper_Unpause')}</CrownfallButton>
            <CrownfallButton onClick={toMenu} sound={click}>{t('Покинуть игру')}</CrownfallButton></div></div>}
        {screen === 'result' && result && <Results result={result} valve={valve} best={best} bestTime={bestTime} outcome={table.outcome} onAgain={() => start(result.mode)} onMenu={toMenu} sound={click}/>}
        <CloseButton mode={screen === 'menu' ? 'close' : 'return'} onClick={screen === 'menu' ? onExit : toMenu} label={screen === 'menu' ? t('Закрыть') : t('В меню игры')}/>
        <div className="rc-corner">
          <MuteButton/>
          {screen === 'play' && <KeyHint label={paused ? valve('DOTA_Crownfall_Minesweeper_Unpause') : valve('DOTA_Crownfall_Minesweeper_Pause')} keyName="Esc" onClick={() => { if (gameRef.current?.phase === 'running') setPaused((v) => !v); }}/>}
        </div>
      </div>
    </div>
  </Fit>;
}

// The menu's 3D heroes of Valve's IntroMenu: Dragonus on the left, Batrider on the right.
function MenuHeroes() {
  return <div className="rc-menu-heroes" aria-hidden="true"><img className="rc-menu-sky" src={`${SCENE}sky_menu.webp`} alt=""/><img className="rc-menu-bat" src={`${SCENE}bat_menu.webp`} alt=""/></div>;
}

// #FlappyMainMenu: the title, «Как играть», the rewards and the friends' list (here: this browser's
// best) in the endless mode, «Играть» / «Уйти».
function MainMenu({ valve, endless, best, bestTime, playedOnce, onPlay, onExit, sound }) {
  return <div className="rc-menu-area">
    <div className="rc-menu" role="dialog" aria-label={valve('DOTA_Crownfall_EncounterName_FlappySkywrath')}>
      <div className="rc-menu-header">
        <div className="rc-title-box">
          <div className="rc-title" role="heading" aria-level="2">{valve('DOTA_Crownfall_EncounterName_FlappySkywrath')}</div>
          {endless && <div className="rc-subtitle">{valve('DOTA_Crownfall_FlappySkywrath_EndlessMode')}</div>}
        </div>
        <img className="rc-encounter-graphic" src={`${IMG}hed_graphic_minigame.webp`} alt=""/>
      </div>
      <div className="rc-columns">
        <div className="rc-column1">
          <div className="rc-howto-title" role="heading" aria-level="3">{valve('DOTA_Crownfall_Fishing_HowToPlay')}</div>
          <p className="rc-howto">{rich(valve('DOTA_Crownfall_FlappySkywrath_HowToPlay'))}</p>
          <p className="rc-keys">{t('Взмах — пробел, W, ↑, клик или касание. Пауза — Esc.')}</p>
          {!endless && <p className="rc-desc">{valve('DOTA_Crownfall_EncounterDesc_FlappySkywrath')}</p>}
          {!endless && <p className="rc-unlock">{t('Обгони Летучего всадника — откроется бесконечный режим.')}</p>}
          {endless && <>
            <div className="rc-howto-title rc-rewards-label" role="heading" aria-level="3">{valve('DOTA_Crownfall_Fishing_Rewards')}</div>
            <div className="rc-rewards">{REWARDS.map(([at, pips]) => <div key={at} className={`rc-reward-row ${best >= at ? 'rc-reward-done' : ''}`}>
              <span>{number(at)}</span><i>{Array.from({ length: pips }, (_, i) => <em key={i}/>)}</i></div>)}</div>
          </>}
        </div>
        {endless && <div className="rc-column2">
          <Leaderboard game="race" boards={[['endless', valve('DOTA_Crownfall_FlappySkywrath_EndlessMode')], ['time', t('Время гонки')]]} headClass="rc-leader-head" rows={9}
            label={(board) => valve(board === 'time' ? 'DOTA_Crownfall_Shmup_BossHealthBar_Time' : 'DOTA_Crownfall_Fishing_Leaderboard_Score')} format={(score, row, board) => (board === 'time' ? seconds(score / 100) : number(score))}
            local={best} localFormat={number}/>
          {bestTime > 0 && <div className="mg-lb-local rc-best-time"><span>{t('Время гонки в этом браузере')}</span><b>{seconds(bestTime)}</b></div>}
        </div>}
      </div>
      <div className="rc-bottom-buttons">
        <CrownfallButton onClick={() => onPlay(endless ? 'endless' : 'race')} sound={sound}>{valve('DOTA_Crownfall_Fishing_Play')}</CrownfallButton>
        {endless && <CrownfallButton className="rc-race-again" onClick={() => onPlay('race')} sound={sound}>{t('Гонка')}</CrownfallButton>}
        {playedOnce && <CrownfallButton onClick={onExit} sound={sound}>{valve('DOTA_Crownfall_Encounter_Leave')}</CrownfallButton>}
      </div>
    </div>
  </div>;
}

// .OverlayHUD: the race bar in a race (#BigRaceBarContainer), the score section in the endless mode.
function Hud({ mode, valve, best, hudRef }) {
  const set = (name) => (el) => { hudRef.current[name] = el; };
  if (mode === 'race') {
    return <div className="rc-hud"><div className="rc-racebar-box"><div className="rc-racebar">
      <div className="rc-progress"><div className="rc-progress-left" ref={set('bar')}/></div>
      <img ref={set('sky')} className="rc-hero-icon rc-icon-sky" src={`${IMG}npc_dota_hero_skywrath_mage_alt1.webp`} alt=""/>
      <img ref={set('bat')} className="rc-hero-icon rc-icon-bat" src={`${IMG}npc_dota_hero_batrider.webp`} alt=""/>
      <img className="rc-finish-icon" src={`${IMG}finish_icon.webp`} alt=""/>
    </div></div></div>;
  }
  const next = nextReward(best);
  return <div className="rc-hud"><div className="rc-score-section" ref={set('panel')}>
    <div className="rc-score-header"><span className="rc-score-title">{valve('DOTA_Crownfall_EncounterName_FlappySkywrath')}</span><img src={`${IMG}divider_graphic_minigame.webp`} alt=""/></div>
    <div className="rc-score-main">
      <span className="rc-score-label">{valve('DOTA_Crownfall_Fishing_Hud_CurrentScore')}</span>
      <b className="rc-score-value" ref={set('score')}>0</b>
      <i className="rc-score-sep"/>
      <span className="rc-high-label">{valve('DOTA_Crownfall_Fishing_Hud_HighScore')}<em>{valve('DOTA_Crownfall_Fishing_Hud_HighScoreNew')}</em></span>
      <b className="rc-high-value" ref={set('high')}>{number(best)}</b>
      <span className="rc-next-label">{valve('DOTA_Crownfall_Fishing_Hud_NextReward')}</span>
      <span className="rc-next"><span className="rc-pips" ref={set('pips')} data-n={next?.[1] ?? 0}>{Array.from({ length: next?.[1] ?? 0 }, (_, i) => <em key={i}/>)}</span><b ref={set('next')}>{next ? number(next[0]) : '—'}</b></span>
    </div>
  </div></div>;
}

// DOTACrownfallVisualNovel at the end of a race: Batrider's line.
function Novel({ line, valve, onNext }) {
  return <button type="button" className="rc-novel-box" onClick={onNext}>
    <span className="rc-novel-band"/>
    <span className="rc-novel-text">{valve(`DOTA_VisualNovel_act2_Dialogue_${line}_0_Batrider`)}</span>
    <span className="rc-novel-portrait"><img src={`${NOVEL}portraits/batrider_portrait_idle.webp`} alt=""/><i className="rc-border-under"/><i className="rc-border-over"/>
      <span className="rc-name-plate">{valve('DOTA_VisualNovel_act2_Actor_Batrider')}</span></span>
    <span className="rc-novel-next">{t('Дальше')} ›</span>
  </button>;
}

function Results({ result, valve, best, bestTime, outcome, onAgain, onMenu, sound }) {
  let message, lines = [], record = null;
  if (result.mode === 'race') {
    message = result.winner === 'player' ? valve('DOTA_Crownfall_Minesweeper_WinText') : valve('DOTA_Crownfall_Minesweeper_LoseText');
    lines = [[valve('DOTA_Crownfall_Shmup_BossHealthBar_Time'), result.winner === 'player' ? seconds(result.time) : '—'], [t('Столкновения'), String(result.hits)]];
    if (result.winner === 'player') record = result.record ? t('Новый рекорд!') : bestTime ? t('Рекорд: {score}', { score: seconds(bestTime) }) : null;
    if (result.unlocked) record = `${record ? `${record} · ` : ''}${valve('DOTA_Crownfall_FlappySkywrath_EndlessMode')} ✓`;
  } else {
    message = number(result.score);
    lines = [[valve('DOTA_Crownfall_Fishing_Hud_HighScore'), number(Math.max(best, result.score))]];
    const next = nextReward(Math.max(best, result.score));
    if (next) lines.push([valve('DOTA_Crownfall_Fishing_Hud_NextReward'), number(next[0])]);
    record = result.record ? t('Новый рекорд!') : null;
  }
  return <div className="rc-results"><ResultBand message={message} lines={lines} record={record} board={<BoardOutcome outcome={outcome}/>}>
    <CrownfallButton onClick={onAgain} sound={sound}>{valve('DOTA_Crownfall_Fishing_Play')}</CrownfallButton>
    <CrownfallButton onClick={onMenu} sound={sound}>{t('В меню игры')}</CrownfallButton>
  </ResultBand></div>;
}
