// «Замкобой» (Crownfall act IV, Castle Carnage — Valve's `artillery`): bp_popup_crownfall_encounter_artillery
// rebuilt for the browser. The rules are logic.mjs, the board is drawn on a canvas by render.js; this file
// is Valve's popup around them — the setup screen (splash, logo, difficulty tabs, «Как играть», level
// select), the level intro, the HUD (level title, timer, Snapfire's portrait, weapons with charges,
// restart), «Снаряды закончились», the won / lost / pause panels — with the class names of Valve's
// layout (castle.css), Valve's sound events and Valve's strings. docs/minigames.md («Замкобой»).
import { useCallback, useEffect, useRef, useState } from 'react';
import { createSounds, unlockAudio } from '../../core/sound.js';
import { assetBase, bestScore, loadJSON, loadStrings, saveScore } from '../../core/assets.js';
import { CloseButton, CrownfallButton, Fit, MuteButton, sharedImage } from '../../core/ui.jsx';
import { BoardOutcome, Leaderboard, useRun } from '../../core/leaderboard.jsx';
import {
  begin, cancelCharge, cannonPivot, castleConfig, createGame, currentWeapon, formatTime, hardUnlocked, levelOpen, player as playerOf,
  press, recordResult, release, selectWeapon, setAim, shotSpeed, step, terrainFromRGBA, totalAmmo, totals, trajectory, turnAim,
} from './logic.mjs';
import { HEIGHT, WIDTH, applyEvents, createEffects, drawScene, freshLayers, loadArt, loadLevel, stepEffects, thumbnail, washed, weaponIcon } from './render.js';
import { locale, t } from '../../../../scripts/i18n.mjs';
import { useLanguage } from '../../../useLanguage.js';
import './castle.css';

const BASE = assetBase('castle'), IMG = `${BASE}images/`;
const PROGRESS_KEY = 'gridstudio.minigames.castle', TUTORIAL_KEY = 'gridstudio.minigames.castle.tutorial';
const AIM_KEYS = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
const MUSIC = { menu: 'crownfall.artillery.music.menu', combat: 'crownfall.artillery.music.combat', won: 'crownfall.artillery.music.level_won', lost: 'crownfall.artillery.music.level_lost' };
const VO_GAP = 3500;
const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('castledebug');

const number = (value) => Number(value).toLocaleString(locale);
const readJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const writeJSON = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Not remembered. */ } };
// The normal-mode level where a weapon first appears (its HUD icon wears Valve's «НОВОЕ» there).
const firstSeen = (config, weapon) => config.modes.normal.findIndex((name) => config.levels[name].weapons.some((w) => w.name === weapon));
// Valve's x<b>N</b>.
const richCharges = (text) => text.split(/<b>(.*?)<\/b>/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));

export default function Castle({ onExit }) {
  useLanguage();
  const [assets, setAssets] = useState(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([loadJSON(`${BASE}data.json`), loadJSON(`${BASE}sounds.json`), loadStrings('castle'), loadJSON('./assets/minigames/shared/sounds.json').catch(() => ({})), loadArt(BASE)])
      .then(([data, sounds, valve, shared, art]) => setAssets({ config: castleConfig(data), sounds: createSounds(BASE, sounds), ui: createSounds('./assets/minigames/shared/', shared), valve, art }))
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <div className="mg-loading" role="alert">{t('Не удалось загрузить игру. Обнови страницу.')}</div>;
  if (!assets) return <div className="mg-loading" role="status">{t('Загружаем…')}</div>;
  return <CastlePopup assets={assets} onExit={onExit}/>;
}

// The washed HUD pictures (Panorama wash-color), made once.
function useWashed() {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    let live = true;
    const make = (name, color) => new Promise((done) => { const img = new Image(); img.onload = () => done(washed(img, color).toDataURL()); img.onerror = () => done(null); img.src = `${IMG}${name}`; });
    Promise.all([make('hud_container_background_wide.webp', '#564222'), make('hud_container_border_wide.webp', '#896d47'), make('score_container_background.webp', '#685d47'), make('score_container_border.webp', '#f0ce92')])
      .then(([hudBack, hudBorder, timerBack, timerBorder]) => { if (live) setUrls({ hudBack, hudBorder, timerBack, timerBorder }); });
    return () => { live = false; };
  }, []);
  return urls;
}

function CastlePopup({ assets, onExit }) {
  const { config, sounds, ui, valve, art } = assets;
  const washedImages = useWashed();
  const canvasRef = useRef(null), gameRef = useRef(null), levelArtRef = useRef(null), layersRef = useRef(null), fxRef = useRef(createEffects());
  const musicRef = useRef(null), chargeRef = useRef(null), voRef = useRef(0), heldRef = useRef(new Set()), shiftRef = useRef(false), pointerRef = useRef(null), iconRef = useRef({});
  const [progress, setProgress] = useState(() => readJSON(PROGRESS_KEY, {}));
  const [mode, setMode] = useState('normal');
  const [state, setState] = useState('pregame');             // pregame · select · loading · intro · combat · won · lost
  const [selected, setSelected] = useState(0), [levelIndex, setLevelIndex] = useState(0);
  const [paused, setPaused] = useState(false), [hud, setHud] = useState(null), [result, setResult] = useState(null);
  const [tutorial, setTutorial] = useState(null), [hardToast, setHardToast] = useState(false), [tip, setTip] = useState(null);
  const click = useCallback((name) => ui.play(name), [ui]);
  const hard = hardUnlocked(config, progress);
  const levels = config.modes[mode];
  const levelName = levels[levelIndex];
  const level = config.levels[levelName];

  // --- sound ---
  const music = useCallback((name) => {
    if (musicRef.current?.name === name) return;
    musicRef.current?.handle?.stop();
    musicRef.current = name ? { name, handle: sounds.play(name, { loop: name === MUSIC.menu || name === MUSIC.combat }) } : null;
  }, [sounds]);
  useEffect(() => {
    const retry = () => { if (musicRef.current && !musicRef.current.handle) { const { name } = musicRef.current; musicRef.current = null; music(name); } };
    window.addEventListener('pointerdown', retry); window.addEventListener('keydown', retry);
    return () => { window.removeEventListener('pointerdown', retry); window.removeEventListener('keydown', retry); };
  }, [music]);
  useEffect(() => () => { sounds.stopAll(); ui.stopAll(); }, [sounds, ui]);
  useEffect(() => { if (state === 'pregame' || state === 'select') music(MUSIC.menu); }, [state, music]);

  // --- a level ---
  const table = useRun('castle');
  const openLevel = useCallback(async (index, levelMode = mode) => {
    const name = config.modes[levelMode][index];
    setState('loading'); setPaused(false); setResult(null); setLevelIndex(index); setMode(levelMode);
    let levelArt = levelArtRef.current;
    if (!levelArt || levelArt.name !== name) { levelArt = { name, ...(await loadLevel(art, config.levels[name])) }; levelArtRef.current = levelArt; }
    const terrain = terrainFromRGBA(levelArt.rgba, WIDTH, HEIGHT);
    gameRef.current = createGame(config, name, terrain, { mode: levelMode, allWeapons: DEBUG && new URLSearchParams(location.search).has('allweapons') });
    layersRef.current = freshLayers(levelArt);
    fxRef.current = createEffects();
    heldRef.current.clear();
    const game = gameRef.current;
    table.start('stars');
    await Promise.all(game.ammo.map((slot) => weaponIcon(art, config.weapons[slot.name].image).then((img) => { iconRef.current[slot.name] = img; })));
    setState('intro');
    music(MUSIC.combat);
    sounds.play('crownfall.artillery.snapfire.new_level');
    sounds.preload(['crownfall.artillery.explosion', 'crownfall.artillery.charge_weapon', 'crownfall.artillery.shoot.default', 'crownfall.artillery.shoot.grenade', 'crownfall.artillery.terrain_only_explosion']);
    snapshot();
    const first = levelMode === 'normal' && index === 0 && !readJSON(TUTORIAL_KEY, false);
    setTutorial(first ? 'aim' : null);
  }, [art, config, mode, music, sounds, table.start]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCombat = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.phase !== 'intro') return;
    begin(game); setState('combat'); unlockAudio();
  }, []);

  const toSelect = useCallback(() => { chargeRef.current?.stop(); setPaused(false); setState('select'); setSelected(levelIndex); gameRef.current = null; setHud(null); }, [levelIndex]);

  // The HUD's numbers, kept in React state only when they change.
  const snapshot = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    const weapon = currentWeapon(game, config);
    const next = { weapon: game.weapon, ammo: game.ammo.map((s) => s.count).join(','), time: formatTime(game.clock), empty: (game.ammo[game.weapon]?.count || 0) <= 0,
      allEmpty: totalAmmo(game) <= 0, phase: game.phase, weaponName: weapon?.name };
    setHud((old) => (old && Object.keys(next).every((key) => old[key] === next[key]) ? old : next));
  }, [config]);

  const handle = useCallback((events) => {
    const game = gameRef.current;
    applyEvents(fxRef.current, layersRef.current, events);
    for (const event of events) {
      if (event.type === 'sound') {
        if (event.limit) { const now = performance.now(); if (now - voRef.current < VO_GAP) continue; voRef.current = now; }
        const handleSound = sounds.play(event.name);
        if (event.handle === 'charge') { chargeRef.current?.stop(); chargeRef.current = handleSound; }
      }
      if (event.type === 'stopCharge') { chargeRef.current?.stop(); chargeRef.current = null; }
      if (event.type === 'fire') { setTutorial((tut) => { if (tut) writeJSON(TUTORIAL_KEY, true); return null; }); }
      if (event.type === 'weapon') iconRef.current.at = performance.now();
      if (event.type === 'won') {
        const res = event.result;
        const next = recordResult(readJSON(PROGRESS_KEY, {}), game.mode, game.level, res);
        const wasHard = hardUnlocked(config, readJSON(PROGRESS_KEY, {}));
        writeJSON(PROGRESS_KEY, next); setProgress(next);
        const all = totals(config, next, 'normal').all;
        saveScore('castle', all);
        // The table: this level's best on the server, the stars and scores of all levels summed there.
        table.submit({ score: res.total, stats: { mode: game.mode, level: game.level, seconds: Math.round(res.seconds * 100) / 100 } });
        if (!wasHard && hardUnlocked(config, next)) setHardToast(true);
        setResult(res); setState('won');
        music(MUSIC.won);
        sounds.play('crownfall.artillery.snapfire.victory');
      }
      if (event.type === 'lost') { setResult({ won: false, reason: event.reason }); setState('lost'); music(MUSIC.lost); }
    }
  }, [config, music, sounds, table.submit]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- the loop ---
  const running = (state === 'intro' || state === 'combat' || state === 'won' || state === 'lost') && !paused;
  useEffect(() => {
    if (!['intro', 'combat', 'won', 'lost'].includes(state)) return undefined;
    let frame = 0, last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const game = gameRef.current, canvas = canvasRef.current;
      if (!game || !canvas) { frame = requestAnimationFrame(tick); return; }
      if (running) {
        if (game.phase === 'combat') for (const dir of heldRef.current) turnAim(game, dir, dt, shiftRef.current);
        const events = step(game, config, dt);
        if (events.length) handle(events);
        stepEffects(fxRef.current, game, dt);
        snapshot();
      }
      const weapon = currentWeapon(game, config);
      const path = weapon?.showTrajectory && game.charging ? trajectory(game, config, shotSpeed(config, weapon, game.charge)) : null;
      drawScene(canvas.getContext('2d'), { art, levelArt: levelArtRef.current, layers: layersRef.current, fx: fxRef.current, game, config, now: now / 1000,
        ui: { path, icon: iconRef.current[game.ammo[game.weapon]?.name] || null, iconAt: iconRef.current.at, empty: (game.ammo[game.weapon]?.count || 0) <= 0 } });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state, running, art, config, handle, snapshot]);

  // The tutorial (Valve's TutorialState_Aim → TutorialState_Shoot) on the first level the first time.
  const aimed = useCallback(() => setTutorial((tut) => (tut === 'aim' ? 'shoot' : tut)), []);

  // --- actions ---
  const fireDown = useCallback(() => {
    const game = gameRef.current;
    if (!game || paused) return;
    if (state === 'intro') { startCombat(); return; }
    if (state !== 'combat') return;
    const r = press(game, config);
    if (r === 'charge' || r === 'fire') aimed();
    handle(game.events.splice(0));
  }, [config, paused, state, startCombat, aimed, handle]);
  const fireUp = useCallback(() => { const game = gameRef.current; if (!game) return; release(game, config); handle(game.events.splice(0)); }, [config, handle]);
  const pick = useCallback((index) => {
    const game = gameRef.current;
    if (!game || paused || (state !== 'combat' && state !== 'intro')) return;
    if (selectWeapon(game, config, index)) { handle(game.events.splice(0)); snapshot(); }
  }, [config, paused, state, handle, snapshot]);
  const restart = useCallback(() => { chargeRef.current?.stop(); click('General.ButtonClick'); openLevel(levelIndex); }, [click, openLevel, levelIndex]);

  // Keys: WASD / arrows aim, Shift — fine aim, Space — hold to charge and release to shoot (and drops a
  // Dropkick Missile in the air), 1–9 — weapons, Esc — pause (Valve's oncancel), Enter — the panel's button.
  useEffect(() => {
    const down = (event) => {
      if (event.target.closest?.('input, textarea, select')) return;
      if (event.key === 'Shift') shiftRef.current = true;
      if (event.code === 'Escape') {
        event.preventDefault();
        if (state === 'pregame') { onExit(); return; }
        if (state === 'select') { setState('pregame'); return; }
        if (state === 'combat' || state === 'intro') { setPaused((v) => !v); if (gameRef.current) { cancelCharge(gameRef.current); handle(gameRef.current.events.splice(0)); } }
        else if (state === 'won' || state === 'lost') toSelect();
        return;
      }
      if (paused) { if (event.code === 'Enter') { event.preventDefault(); setPaused(false); } return; }
      if (state === 'pregame' && (event.code === 'Enter' || event.code === 'Space')) { event.preventDefault(); if (!event.repeat) { click('General.ButtonClick'); setState('select'); } return; }
      if (state === 'select' && (event.code === 'Enter' || event.code === 'Space')) { event.preventDefault(); if (!event.repeat && levelOpen(config, progress, mode, selected)) { click('General.ButtonClick'); openLevel(selected); } return; }
      if (state === 'won' && event.code === 'Enter') { event.preventDefault(); if (levelIndex + 1 < levels.length) openLevel(levelIndex + 1); else toSelect(); return; }
      if (state === 'lost' && (event.code === 'Enter' || event.code === 'KeyR')) { event.preventDefault(); restart(); return; }
      if (state !== 'combat' && state !== 'intro') return;
      if (AIM_KEYS[event.code]) { event.preventDefault(); heldRef.current.add(AIM_KEYS[event.code]); if (state === 'combat') aimed(); return; }
      if (event.code === 'Space' || (state === 'intro' && event.code === 'Enter')) { event.preventDefault(); if (!event.repeat) fireDown(); return; }
      const digit = /^Digit([1-9])$/.exec(event.code);
      if (digit) { event.preventDefault(); pick(Number(digit[1]) - 1); }
    };
    const up = (event) => {
      if (event.key === 'Shift') shiftRef.current = false;
      if (AIM_KEYS[event.code]) heldRef.current.delete(AIM_KEYS[event.code]);
      if (event.code === 'Space') fireUp();
    };
    const blur = () => { heldRef.current.clear(); shiftRef.current = false; const game = gameRef.current; if (game?.charging) { cancelCharge(game); handle(game.events.splice(0)); } };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  });

  // Mouse and touch on the board: the aim follows the pointer (from the cannon), press to charge,
  // release to shoot; the right button cancels a charge; a touch that ends on Snapfire cancels too.
  const toGame = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [(event.clientX - rect.left) * WIDTH / rect.width, HEIGHT - (event.clientY - rect.top) * HEIGHT / rect.height];
  };
  const aimAt = (event) => {
    const game = gameRef.current;
    if (!game || game.phase !== 'combat' || paused) return;
    const p = playerOf(game);
    const [x, y] = toGame(event), [px, py] = cannonPivot(config, p);
    if (Math.hypot(x - px, y - py) < 12) return;
    setAim(game, Math.atan2(y - py, x - px));
  };
  const onPointerMove = (event) => {
    if (pointerRef.current && pointerRef.current.id !== event.pointerId) return;
    if (event.pointerType === 'mouse' || pointerRef.current) aimAt(event);
  };
  const onPointerDown = (event) => {
    if (state === 'intro') { startCombat(); return; }
    if (state !== 'combat' || paused) return;
    const game = gameRef.current;
    if (event.button === 2) { if (game) { cancelCharge(game); handle(game.events.splice(0)); } return; }
    if (event.button !== 0) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic pointers. */ }
    pointerRef.current = { id: event.pointerId, type: event.pointerType };
    aimAt(event); aimed();
    fireDown();
  };
  const onPointerUp = (event) => {
    if (!pointerRef.current || pointerRef.current.id !== event.pointerId) return;
    const touch = pointerRef.current.type !== 'mouse';
    pointerRef.current = null;
    const game = gameRef.current;
    if (!game) return;
    if (touch) {
      const p = playerOf(game), [x, y] = toGame(event);
      if (Math.hypot(x - p.x, y - (p.y + 48)) < 60) { cancelCharge(game); handle(game.events.splice(0)); return; }
    }
    fireUp();
  };

  const debugRef = useRef(null);
  debugRef.current = { gameRef, config, openLevel, startCombat, fireDown, fireUp, pick, setMode, toSelect, progress };
  useEffect(() => { if (DEBUG || import.meta.env?.DEV) window.__castle = debugRef; }, []);

  // --- the picture ---
  const game = gameRef.current;
  const inLevel = ['intro', 'combat', 'won', 'lost', 'loading'].includes(state);
  const classes = ['cc-popup', 'Artillery', `GameState_${{ pregame: 'Pregame', select: 'LevelSelect', loading: 'Loading', intro: 'LevelIntro', combat: 'Combat', won: 'LevelWon', lost: 'LevelLost' }[state]}`,
    paused && 'IsPaused', mode === 'hard' ? 'HardMode' : 'NormalMode', !hard && 'HardModeDisabled', hud?.empty && state === 'combat' && 'CurrentWeaponOutOfAmmo',
    hud?.allEmpty && state === 'combat' && 'AllWeaponsOutOfAmmo', game?.ammo.length > 1 && 'HasMultipleWeapons', tutorial && `TutorialState_${tutorial === 'aim' ? 'Aim' : 'Shoot'}`,
    state === 'won' && levelIndex + 1 >= levels.length && 'IsOnFinalLevel'].filter(Boolean).join(' ');
  const closeLabel = inLevel ? t('Пауза') : t('Закрыть');

  return <div className="cc-layout">
    <Fit className="cc-fit">
      <div className={classes} onContextMenu={(event) => event.preventDefault()}>
        <div className="MainContentsWrapper">
          <div className="MainContents">
            <div id="GameBoard" className="cc-board">
              <canvas ref={canvasRef} className="cc-canvas" width={WIDTH} height={HEIGHT} aria-label={valve('DOTA_Crownfall_Archive_Minigame_CastleCarnage')}
                onPointerMove={onPointerMove} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}/>
              {inLevel && level && <div className="GameBoardHUD">
                <div className="LevelTitle">{levelIndex + 1}. {valve(level.locName)}</div>
                <Tutorial valve={valve}/>
              </div>}
            </div>
            {(state === 'pregame' || state === 'select') && <SetupScreen {...{ valve, config, progress, mode, setMode, hard, state, setState, selected, setSelected, openLevel, click, art, hardToast, setHardToast }}/>}
            {state === 'intro' && game && <div className="LevelIntroScreen GameStateScreen">
              <div className="ScreenTitle">{valve('DOTA_Crownfall_Artillery_LevelNumber', { level: levelIndex + 1 })}</div>
              <div className="LevelName">{valve(level.locName)}</div>
              <div id="LevelIntroWeapons">{game.ammo.map((slot, i) => <Weapon key={slot.name} slot={slot} index={i} config={config} valve={valve} selected={false} onTip={setTip}/>)}</div>
              <CrownfallButton className="PrimaryButton" onClick={startCombat} sound={click}>{valve('DOTA_Crownfall_Artillery_Start')}</CrownfallButton>
            </div>}
            {state === 'won' && result && <LevelWon {...{ valve, config, level, result, click, levelIndex, levels, openLevel, toSelect, restart, hardToast }} outcome={table.outcome}/>}
            {state === 'lost' && result && <div className="LevelLostScreen GameStateScreen">
              <div className="ScreenTitle">{valve(result.reason === 'ammo' ? 'DOTA_Crownfall_Artillery_LevelLost_OutOfAmmo' : 'DOTA_Crownfall_Artillery_LevelLost_PlayerDeath')}</div>
              <CrownfallButton className="PrimaryButton" onClick={restart} sound={click}>{valve('DOTA_Crownfall_Artillery_RetryLevel')}</CrownfallButton>
              <div className="SecondaryButtons"><CrownfallButton className="Secondary" onClick={toSelect} sound={click}>{valve('DOTA_Crownfall_Artillery_LeaveGame')}</CrownfallButton></div>
            </div>}
            {paused && <div className="PauseScreen GameStateScreen">
              <div className="ScreenTitle">{valve('DOTA_Crownfall_Artillery_Paused')}</div>
              <CrownfallButton className="PrimaryButton" onClick={() => setPaused(false)} sound={click}>{valve('DOTA_Crownfall_Artillery_Resume')}</CrownfallButton>
              <div className="SecondaryButtons"><CrownfallButton className="Secondary" onClick={toSelect} sound={click}>{valve('DOTA_Crownfall_Artillery_LeaveGame')}</CrownfallButton></div>
            </div>}
            <div id="CloseButtonContainer">
              <CloseButton mode={inLevel ? 'return' : 'close'} label={closeLabel} onClick={() => {
                if (state === 'pregame') onExit();
                else if (state === 'select') setState('pregame');
                else if (state === 'combat' || state === 'intro') setPaused((v) => !v);
                else toSelect();
              }}/>
            </div>
          </div>
          {inLevel && <div className="TimerContainer">
            {washedImages.timerBack && <img className="ScoreBackground" src={washedImages.timerBack} alt=""/>}
            {washedImages.timerBorder && <img className="ScoreBorder" src={washedImages.timerBorder} alt=""/>}
            <div className="TimerLabelsContainer"><span className="TimerLabel">{valve('DOTA_Crownfall_Artillery_Timer')}</span><b className="TimerHUD">{hud?.time || '0:00'}</b></div>
          </div>}
        </div>
        <div className="LowerHUD">
          <div className="HudBackgroundContainer">
            <div className="HudBackground" style={washedImages.hudBack ? { borderImageSource: `url(${washedImages.hudBack})` } : undefined}/>
            <div className="HudBorder" style={washedImages.hudBorder ? { borderImageSource: `url(${washedImages.hudBorder})` } : undefined}/>
          </div>
          <div className="HudContents">
            <div className="Portrait"><img src="./assets/heroes/128.webp" alt=""/></div>
            <div id="Weapons">{game?.ammo.map((slot, i) => <Weapon key={slot.name} slot={slot} index={i} config={config} valve={valve} selected={i === game.weapon}
              onClick={() => { pick(i); }} onTip={setTip} hotkey={String(i + 1)} isNew={mode === 'normal' && firstSeen(config, slot.name) === levelIndex}/>)}</div>
            <button type="button" className="ResetLevelButton" onClick={restart} title={valve('DOTA_Crownfall_Artillery_RestartLevel')} aria-label={valve('DOTA_Crownfall_Artillery_RestartLevel')}>
              <img className="ResetIcon" src={sharedImage('reset.svg')} alt=""/></button>
          </div>
        </div>
        <div className="OutOfAmmoIndicator">
          <div className="OutOfAmmoTitle">{valve('DOTA_Crownfall_Artillery_OutOfAmmo')}</div>
          <div className="OutOfAmmoDesc">{valve('DOTA_Crownfall_Artillery_SwitchWeapons')}</div>
        </div>
        <div className="cc-sound"><MuteButton/></div>
        {tip && <WeaponTooltip tip={tip} valve={valve} config={config}/>}
      </div>
    </Fit>
  </div>;
}

function Tutorial({ valve }) {
  const key = (text) => <span className="ControlKey"><span className="KeyText">{text}</span></span>;
  return <div className="TutorialContainer">
    <div className="TutorialScreen Aim">
      <div className="TutorialTitle">{valve('DOTA_Crownfall_Artillery_Aim')}</div>
      <div className="TutorialDesc">{valve('DOTA_Crownfall_Artillery_AimDesc')}</div>
      <div className="TutorialControls">{key('W')}<div className="KeysRow">{key('A')}{key('S')}{key('D')}</div><small>{t('Или мышью.')}</small></div>
    </div>
    <div className="TutorialScreen Shoot">
      <div className="TutorialTitle">{valve('DOTA_Crownfall_Artillery_Shoot')}</div>
      <div className="TutorialDesc">{valve('DOTA_Crownfall_Artillery_ShootDesc')}</div>
      <div className="TutorialControls"><span className="ControlKey SpaceKey"><img className="KeyText Space" src={sharedImage('space.svg')} alt=""/></span><small>{t('Или кнопкой мыши.')}</small></div>
    </div>
  </div>;
}

// One weapon of the HUD (Valve's Weapon snippet): the icon with its glow, frame and shimmer, the
// red strike when empty, the hotkey and «x<b>N</b>».
function Weapon({ slot, index, config, valve, selected, onClick, onTip, hotkey, isNew }) {
  const weapon = config.weapons[slot.name];
  const ref = useRef(null);
  const show = () => { const rect = ref.current?.getBoundingClientRect(); onTip?.({ name: slot.name, rect }); };
  return <button type="button" ref={ref} className={`Weapon ${selected ? 'selected' : ''} ${slot.count <= 0 ? 'OutOfAmmo' : ''} ${isNew ? 'IsNewWeapon' : ''}`} onClick={onClick}
    onMouseEnter={show} onMouseLeave={() => onTip?.(null)} onFocus={show} onBlur={() => onTip?.(null)} aria-label={valve(weapon.locName)} aria-pressed={selected} data-index={index}>
    <span className="WeaponImageContainer">
      <span className="WeaponImageActiveGlow"/>
      <span className="WeaponImageBackground"/>
      <span className="WeaponImageActiveBorder"/>
      <img id="WeaponImage" src={`${IMG}spellicons/${weapon.image}.webp`} alt=""/>
      <span key={selected ? 'on' : 'off'} className="WeaponImageShimmer"/>
      <span className="WeaponStrikeThru"/>
    </span>
    <span className="NewViolator">{valve('DOTA_ViolatorNew')}</span>
    {hotkey && <span className="HotkeyContainer"><span>{hotkey}</span></span>}
    <span className="ChargesContainer"><span>{richCharges(valve('DOTA_Crownfall_Artillery_Weapons_Charges', { charges: slot.count }))}</span></span>
  </button>;
}

// artillery_tooltip_weapon: the icon, the name and Valve's description.
function WeaponTooltip({ tip, valve, config }) {
  const weapon = config.weapons[tip.name];
  const popup = tip.rect && document.querySelector('.cc-popup')?.getBoundingClientRect();
  const fit = document.querySelector('.cc-popup');
  const scale = fit && popup ? popup.width / fit.offsetWidth : 1;
  const style = tip.rect && popup ? { left: (tip.rect.left + tip.rect.width / 2 - popup.left) / scale, top: (tip.rect.top - popup.top) / scale } : {};
  return <div className="ArtilleryTooltipWeapon" style={style} role="tooltip">
    <div className="WeaponInfoContainer">
      <img id="WeaponImage" src={`${IMG}spellicons/${weapon.image}.webp`} alt=""/>
      <div className="WeaponDetails"><div className="WeaponName">{valve(weapon.locName)}</div><div className="WeaponDesc">{valve(weapon.locDesc)}</div></div>
    </div>
  </div>;
}

function LevelWon({ valve, config, level, result, outcome, click, levelIndex, levels, openLevel, toSelect, restart, hardToast }) {
  const final = levelIndex + 1 >= levels.length;
  const label = (row) => (row.kind === 'complete' ? valve('DOTA_Crownfall_Artillery_PointSource_LevelComplete')
    : row.kind === 'time' ? valve('DOTA_Crownfall_Artillery_PointSource_TimeBonus')
      : valve('DOTA_Crownfall_Artillery_PointSource_Ammo', { weapon_name: valve(config.weapons[row.weapon].locName), ammo_count: row.count }));
  return <div className="LevelWonScreen GameStateScreen">
    <div className="ScreenTitle">{valve('DOTA_Crownfall_Artillery_LevelComplete')}</div>
    <div className="PointsWonTable">
      <div id="LevelWonPointsRows">{result.rows.map((row, i) => <div className="LevelWonPointsRow" key={i}><span className="PointsSource">{label(row)}</span><span className="PointsValue">{number(row.points)}</span></div>)}</div>
      <div className="TotalRow"><span className="TotalLabel">{valve('DOTA_Crownfall_Artillery_LevelScoreLabel')}</span><b className="TotalValue">{number(result.total)}</b></div>
    </div>
    <div id="LevelWonStars">{level.stars.map((at, i) => <div key={at} className={`LevelWonStar ${i < result.stars ? 'Achieved' : ''}`} style={{ animationDelay: `${0.25 + i * 0.25}s` }}>
      <span className="StarImage"/><span className="StarValue">{number(at)}</span></div>)}</div>
    <BoardOutcome outcome={outcome} className="cc-board-outcome"/>
    {hardToast && <div className="cc-hard-toast">{valve('DOTA_Crownfall_Artillery_HardModeTooltip')}</div>}
    {!final && <CrownfallButton className="NextLevelButton PrimaryButton" onClick={() => openLevel(levelIndex + 1)} sound={click}>{valve('DOTA_Crownfall_Artillery_NextLevel')}</CrownfallButton>}
    {final && <CrownfallButton className="MainMenuButton PrimaryButton" onClick={toSelect} sound={click}>{valve('DOTA_Crownfall_Artillery_ReturnToMainMenu')}</CrownfallButton>}
    <div className="SecondaryButtons">
      <CrownfallButton className="Secondary" onClick={restart} sound={click}>{valve('DOTA_Crownfall_Artillery_RetryLevel')}</CrownfallButton>
      <CrownfallButton className="Secondary" onClick={toSelect} sound={click}>{valve('DOTA_Crownfall_Artillery_LeaveGame')}</CrownfallButton>
    </div>
  </div>;
}

// The SetupScreen: splash art, logo and the menu on the right (difficulty tabs, then «Как играть» or
// the level select).
function SetupScreen({ valve, config, progress, mode, setMode, hard, state, setState, selected, setSelected, openLevel, click, art, hardToast, setHardToast }) {
  const sum = totals(config, progress, mode);
  const best = bestScore('castle');
  const levels = config.modes[mode];
  const open = levelOpen(config, progress, mode, selected);
  const chooseMode = (next) => {
    if (next === 'hard' && !hard) return;
    click('General.ButtonClick'); setMode(next); setSelected(0); setHardToast(false);
  };
  return <div className="SetupScreen">
    <img className="EncounterSplashArt" src={`${IMG}artillery_splash.webp`} alt=""/>
    <img className="MinigameLogoEn" src={`${IMG}artillery_logo.webp`} alt={valve('DOTA_Crownfall_EncounterName_Artillery')}/>
    <div className="SetupScreenMenu">
      <div className="DifficultySelectTabs">
        <div className="DifficultySelectTabsBackground"/>
        <div className="TabsContainer" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'normal'} id="NormalModeTab" className="TabItem" onClick={() => chooseMode('normal')}><span className="TabItemBg"/><span>{valve('DOTA_Crownfall_Artillery_DifficultyNormal')}</span></button>
          <button type="button" role="tab" aria-selected={mode === 'hard'} aria-disabled={!hard} id="HardModeTab" className={`TabItem ${hardToast ? 'cc-glow' : ''}`} onClick={() => chooseMode('hard')}
            title={hard ? valve('DOTA_Crownfall_Artillery_HardModeTooltip') : valve('DOTA_Crownfall_Artillery_ModeLocked')}><span className="TabItemBg"/><span>{valve('DOTA_Crownfall_Artillery_DifficultyHard')}</span></button>
        </div>
      </div>
      <div className="SetupScreenContents">
        <div className="TopGoldDash Top"/><div className="TopGoldDash Bottom"/>
        {state === 'pregame' ? <Pregame valve={valve} best={best}/> : <div className="LevelSelectSection">
          <div id="LevelSelectLevelsList">{[0, 3, 6].map((row) => <div className="LevelSelectLevelsRow" key={row}>
            {levels.slice(row, row + 3).map((name, k) => <LevelCard key={name} index={row + k} name={name} {...{ valve, config, progress, mode, art, selected, setSelected, openLevel, click }}/>)}
          </div>)}</div>
          <div className="LevelSelectFooter">
            <div className="LevelSelectTotals">
              <div className="GoldHeader StarsEarnedHeader">{valve('DOTA_Crownfall_Artillery_TotalStarsEarned')}</div>
              <div className="StarsEarnedContainer"><span className="StarIcon"/><span>{sum.stars} / {sum.available}</span></div>
            </div>
            <div className="LevelSelectTotals">
              <div className="GoldHeader LeaderboardScoreHeader">{valve('DOTA_Crownfall_Artillery_TotalScore')}</div>
              <div className="LeaderboardScore">{number(sum.score)}</div>
            </div>
          </div>
        </div>}
      </div>
      <div className="BottomButtons">
        {state === 'pregame' && <CrownfallButton className="LevelSelectButton GlowButton" onClick={() => setState('select')} sound={click}>{valve('DOTA_Crownfall_Artillery_LevelSelect')}</CrownfallButton>}
        {state === 'select' && <CrownfallButton className="StartGameButton GlowButton" disabled={!open} onClick={() => openLevel(selected, mode)} sound={click}>{valve('DOTA_Crownfall_Fishing_Play')}</CrownfallButton>}
      </div>
    </div>
  </div>;
}

function Pregame({ valve, best }) {
  const key = (content, extra = '') => <span className={`ControlKey ${extra}`}>{content}</span>;
  const arrow = (dir) => key(<img className="KeyText" src={sharedImage(`arrow_${dir}.svg`)} alt=""/>);
  return <div className="PregameSection">
    <div className="GameIntroDescription">{valve('DOTA_Crownfall_EncounterDesc_Artillery')}</div>
    <div className="PlaySectionContent">
      <div className="PlaySectionCol Left">
        <div className="HowToPlaySection">
          <div className="GoldHeader PlaySectionHeader">{valve('DOTA_Crownfall_Fishing_HowToPlay')}</div>
          <div className="DescriptionContainer"><div className="SubHeader">{valve('DOTA_Crownfall_Artillery_Aim')}</div><div className="Details">{valve('DOTA_Crownfall_Artillery_AimDesc')}</div></div>
          <div className="ControlDescriptionBlock">
            <div className="KeysColumn">{key(<span className="KeyText">W</span>)}<div className="KeysRow">{key(<span className="KeyText">A</span>)}{key(<span className="KeyText">S</span>)}{key(<span className="KeyText">D</span>)}</div></div>
            <span className="OrSeparator">{valve('or')}</span>
            <div className="KeysColumn">{arrow('up')}<div className="KeysRow">{arrow('left')}{arrow('down')}{arrow('right')}</div></div>
          </div>
          <div className="DescriptionContainer ShootDescription"><div className="SubHeader">{valve('DOTA_Crownfall_Artillery_FineControl')}</div><div className="Details">{valve('DOTA_Crownfall_Artillery_FineControlDesc')}</div></div>
          <div className="ControlDescriptionBlock">{key(<span className="KeyText Shift">{valve('DOTA_Keybind_SHIFT')}</span>, 'ShiftKey')}</div>
          <div className="DescriptionContainer ShootDescription"><div className="SubHeader">{valve('DOTA_Crownfall_Artillery_Shoot')}</div><div className="Details">{valve('DOTA_Crownfall_Artillery_ShootDesc')}</div></div>
          <div className="ControlDescriptionBlock">{key(<img className="KeyText Space" src={sharedImage('space.svg')} alt="Space"/>, 'SpaceKey')}</div>
        </div>
      </div>
      <div className="PlaySectionCol Right">
        <Leaderboard game="castle" className="LeaderboardContainer" headClass="LeaderListHeader" label={t('Звёзды · счёт')} rows={4}
          format={(score) => t('{count} ★', { count: score })} detail={(row) => number(row.extra)} local={best} localFormat={number}/>
        <div className="cc-mouse-help">
          <div className="SubHeader">{t('Мышь и касание')}</div>
          <div className="Details">{t('Прицел следует за курсором. Зажмите кнопку мыши, чтобы зарядить выстрел, отпустите — выстрел. Правая кнопка отменяет заряд.')}</div>
          <div className="Details">{t('На сенсорном экране: коснитесь поля и ведите пальцем, отпустите — выстрел. Отпустите на Снэпфайр — отмена.')}</div>
          <div className="Details">{t('1–9 — оружие. Esc — пауза.')}</div>
          <div className="Details">{t('Падучая ракета: нажмите ещё раз в полёте — она упадёт вниз.')}</div>
        </div>
      </div>
    </div>
  </div>;
}

// LevelSelectLevel: the level's three layers over the background, «N. name», stars, score on hover,
// the lock when it is not open yet.
function LevelCard({ index, name, valve, config, progress, mode, art, selected, setSelected, openLevel, click }) {
  const level = config.levels[name];
  const done = progress?.[mode]?.[name];
  const open = levelOpen(config, progress, mode, index);
  const [thumb, setThumb] = useState(null);
  useEffect(() => { let live = true; thumbnail(art, level).then((url) => { if (live) setThumb(url); }); return () => { live = false; }; }, [art, level]);
  return <button type="button" className={`LevelSelectLevel ${selected === index ? 'selected' : ''} ${done ? 'HasScore' : ''}`} disabled={!open}
    onClick={() => { click('General.ButtonClick'); setSelected(index); }} onDoubleClick={() => open && openLevel(index, mode)} aria-pressed={selected === index}>
    <span className="Contents">
      {thumb && <img id="LevelImage" src={thumb} alt=""/>}
      <span className="LevelName">{index + 1}. {valve(level.locName)}</span>
      <span id="LevelSelectStars">{level.stars.map((at, i) => <span key={at} className={`LevelSelectStar ${i < (done?.stars || 0) ? 'Achieved' : ''}`}><span className="StarImage"/></span>)}</span>
      <span className="LevelScore">{valve('DOTA_Crownfall_Artillery_LevelScore', { level_score: number(done?.score || 0) })}</span>
      <span className="LockIcon"/>
      <span className="LockedPattern"/>
    </span>
  </button>;
}
