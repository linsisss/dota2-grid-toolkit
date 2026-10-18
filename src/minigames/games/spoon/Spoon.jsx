// «Подрывник Спун» (Crownfall act IV, Valve's techiemen / Spoon Man): bp_popup_crownfall_encounter_techiemen
// rebuilt for the browser. The rules are logic.mjs, the board is drawn on a canvas by render.js; this file
// is Valve's popup around them — the start screen with its tabs, the HUD, the count-in, pause and «Game
// Over» — with Valve's class roles kept in spoon.css, and it plays Valve's sound events. docs/minigames.md.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createSounds } from '../../core/sound.js';
import { assetBase, bestScore, loadJSON, loadStrings, saveScore } from '../../core/assets.js';
import { CloseButton, CrownfallButton, Fit, MuteButton, sharedImage } from '../../core/ui.jsx';
import { BoardOutcome, Leaderboard, useRun } from '../../core/leaderboard.jsx';
import { MARKS, createGame, formatTime, newGame, nextStage, spoonConfig, step } from './logic.mjs';
import { HEIGHT, WIDTH, drawScene, loadImages } from './render.js';
import { locale, t } from '../../../../scripts/i18n.mjs';
import { useLanguage } from '../../../useLanguage.js';
import './spoon.css';

const BASE = assetBase('spoon'), IMG = `${BASE}images/`, NOVEL = assetBase('novel');
const STORY_KEY = 'gridstudio.minigames.spoon.story';
const LETTERS = ['p', 'r', 'e', 's', 's', 'space', 'b', 'o', 'm', 'b', 'space', 't', 'o', 'space', 's', 't', 'a', 'r', 't'];
const LETTER_DELAY = [0.4, 0.6, 0.8, 1, 1.2, 1.4, 0, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 0, 0.2, 0.4, 0.6, 0.8];
// The story of act IV (novels/crownfall_*.txt, spoonman-*): before stages 1–3, after stage 3, and on return.
const STORY = {
  level1: ['level1_Spoon_0', 'level1_Spoon_1', 'level1_Spoon_2'],
  level2: ['level2_Spoon_0', 'level2_Spoon_1'],
  level3: ['level3_Spoon_0', 'level3_Spoon_1', 'level3_Spoon_2'],
  end: ['end_Spoon_0', 'end_Spoon_1', 'end_Spoon_2'],
  return: ['return_Spoon_0', 'return_Spoon_1'],
};
const BOMBS_FACE = new Set(['level1_Spoon_2', 'level2_Spoon_1', 'end_Spoon_1', 'return_Spoon_1']);
const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down' };
const ACTION_KEYS = new Set(['AltLeft', 'AltRight', 'KeyE']);
let returnShown = false;

const number = (value) => Number(value).toLocaleString(locale);
const readStory = () => { try { return Number(localStorage.getItem(STORY_KEY)) || 0; } catch { return 0; } };
const writeStory = (value) => { try { localStorage.setItem(STORY_KEY, String(value)); } catch { /* Shown again next time. */ } };

export default function Spoon({ onExit }) {
  useLanguage();
  const [assets, setAssets] = useState(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([loadJSON(`${BASE}data.json`), loadJSON(`${BASE}sounds.json`), loadStrings('spoon'), loadJSON('./assets/minigames/shared/sounds.json').catch(() => ({})), loadImages(BASE), loadStrings('novel').catch(() => (key) => key)])
      .then(([data, sounds, valve, shared, images, novelValve]) => setAssets({ defines: data.defines, config: spoonConfig(data.defines), sounds: createSounds(BASE, sounds), ui: createSounds('./assets/minigames/shared/', shared), valve, images, novelValve }))
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <div className="mg-loading" role="alert">{t('Не удалось загрузить игру. Обнови страницу.')}</div>;
  if (!assets) return <div className="mg-loading" role="status">{t('Загружаем…')}</div>;
  return <SpoonPopup assets={assets} onExit={onExit}/>;
}

function SpoonPopup({ assets, onExit }) {
  const { config, defines, sounds, ui, valve, images } = assets;
  const gameRef = useRef(null), canvasRef = useRef(null), musicRef = useRef(null);
  const input = useRef({ held: [], bomb: false, bombHeld: false, action: false });
  const [screen, setScreen] = useState('menu'), [tab, setTab] = useState(() => (bestScore('spoon') ? 0 : 1));
  const [paused, setPaused] = useState(false), [novel, setNovel] = useState(null);
  const [hud, setHud] = useState(null), [label, setLabel] = useState(null);
  const [best, setBest] = useState(() => bestScore('spoon')), [record, setRecord] = useState(false);
  const table = useRun('spoon');
  const click = useCallback((name) => ui.play(name), [ui]);

  const music = useCallback((name) => {
    if (musicRef.current?.name === name) return;
    musicRef.current?.handle?.stop();
    musicRef.current = name ? { name, handle: sounds.play(name, { loop: true }) } : null;
  }, [sounds]);
  useEffect(() => { if (screen === 'menu') music('Techiemen.MusicMenu'); }, [screen, music]);
  // The context is unlocked by the first gesture; the menu music starts then.
  useEffect(() => {
    const retry = () => { if (musicRef.current && !musicRef.current.handle) { const { name } = musicRef.current; musicRef.current = null; music(name); } };
    window.addEventListener('pointerdown', retry); window.addEventListener('keydown', retry);
    return () => { window.removeEventListener('pointerdown', retry); window.removeEventListener('keydown', retry); };
  }, [music]);
  useEffect(() => () => { sounds.stopAll(); ui.stopAll(); }, [sounds, ui]);

  const draw = useCallback((now) => {
    const canvas = canvasRef.current, game = gameRef.current;
    if (!canvas || !game) return;
    drawScene(canvas.getContext('2d'), game, images, defines, now, { keyhole: keyhole(game, config) });
  }, [images, defines, config]);

  const snapshot = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    const p = game.player;
    const next = { bombs: p.bombs, size: p.size, speed: p.speed, kick: p.kick, spiky: p.spiky, remote: p.remote, remoteHint: game.bombs.some((b) => b.kind === 'remote'),
      lives: game.lives, score: game.score, time: formatTime(game.timeLeft), low: game.phase === 'play' && game.timeLeft <= 10.0001 && game.timeLeft > 0, stage: game.stage, phase: game.phase };
    setHud((old) => (old && Object.keys(next).every((key) => old[key] === next[key]) ? old : next));
  }, []);

  const story = useCallback((key) => { setNovel({ key, lines: STORY[key], at: 0 }); }, []);

  const start = useCallback(() => {
    // The first run ends the story on stage 3: its exit lifts the score to 5 000 (Valve's first reward).
    const game = createGame(config, Math.random, { storyStage: readStory() < 4 ? 3 : -1 });
    gameRef.current = game;
    newGame(game);
    setScreen('game'); setPaused(false); setRecord(false); setLabel(null); table.start();
    music('Techiemen.MusicPlaying');
    sounds.preload(Object.values(config.sfx));
    snapshot();
    const seen = readStory();
    if (seen < 1) story('level1');
    else if (seen >= 4 && !returnShown) { returnShown = true; story('return'); }
  }, [config, music, sounds, snapshot, story, table.start]); // eslint-disable-line react-hooks/exhaustive-deps

  const toMenu = useCallback(() => { setScreen('menu'); setPaused(false); setNovel(null); setLabel(null); gameRef.current = null; }, []);

  const finish = useCallback(() => {
    const game = gameRef.current;
    const isRecord = saveScore('spoon', game.score);
    if (isRecord) setBest(game.score);
    setRecord(isRecord); setTab(0);
    table.submit({ score: game.score, stats: { stage: Math.max(1, game.stage) } });
    toMenu();
  }, [toMenu, table.submit]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback(() => {
    const game = gameRef.current;
    nextStage(game);
    const seen = readStory();
    if (game.stage === 2 && seen < 2) story('level2');
    if (game.stage === 3 && seen < 3) story('level3');
    snapshot();
  }, [snapshot, story]);

  const handle = useCallback((events) => {
    const game = gameRef.current;
    for (const event of events) {
      if (event.type === 'sound' && event.name) sounds.play(event.name);
      if (event.type === 'countIn') { setLabel({ key: `c${event.n}${performance.now()}`, text: valve(event.n ? `DOTA_Crownfall_Techiemen_CountIn${event.n}` : 'DOTA_Crownfall_Techiemen_CountInGo') }); if (!event.n) setTimeout(() => setLabel((l) => (l?.text === valve('DOTA_Crownfall_Techiemen_CountInGo') ? null : l)), 1000); }
      if (event.type === 'gameOver') { setLabel({ key: 'over', text: valve('DOTA_Crownfall_Techiemen_GameOver'), over: true }); music(null); }
      if (event.type === 'phase' && event.phase === 'cleared') {
        if (game.stage === 3 && readStory() < 4) { writeStory(4); story('end'); }
        else advance();
      }
      if (event.type === 'phase' && event.phase === 'ended') finish();
    }
  }, [sounds, valve, music, story, advance, finish]);

  // The loop: runs while a game is shown, not paused, without the story box.
  const running = screen === 'game' && !paused && !novel;
  useEffect(() => {
    if (screen !== 'game') return undefined;
    let frame = 0, last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000; last = now;
      const game = gameRef.current;
      if (!game) return;
      if (running) {
        const held = input.current.held;
        const events = step(game, dt, { dir: held[held.length - 1] || null, bomb: input.current.bomb, bombHeld: input.current.bombHeld || input.current.bomb, action: input.current.action });
        input.current.bomb = false; input.current.action = false;
        if (events.length) handle(events);
        snapshot();
      }
      draw(now / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [screen, running, handle, snapshot, draw]);

  // Keys: arrows / WASD move, Space drops a bomb (and starts the game on the start screen), Alt or E is
  // the special button, Esc pauses (Valve's oncancel) or leaves from the start screen.
  useEffect(() => {
    const down = (event) => {
      if (event.target.closest?.('input, textarea')) return;
      const dir = KEYS[event.code];
      if (event.code === 'Escape') {
        event.preventDefault();
        if (novel) { setNovel(null); closeNovel(novel.key); return; }
        if (screen === 'menu') { onExit(); return; }
        const phase = gameRef.current?.phase;
        if (phase === 'over' || phase === 'ended') return;
        setPaused((v) => !v);
        return;
      }
      if (screen === 'menu') { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); if (!event.repeat) { click('General.ButtonClick'); start(); } } return; }
      if (novel) { if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat) { event.preventDefault(); nextLine(); } return; }
      if (dir) { event.preventDefault(); const held = input.current.held; if (!held.includes(dir)) held.push(dir); return; }
      // Space drops a bomb; held, the next one goes down as soon as it can.
      if (event.code === 'Space') { event.preventDefault(); if (!event.repeat && !paused) { input.current.bomb = true; input.current.bombHeld = true; } return; }
      if (ACTION_KEYS.has(event.code)) { event.preventDefault(); if (!event.repeat && !paused) input.current.action = true; }
    };
    const up = (event) => {
      const dir = KEYS[event.code];
      if (dir) input.current.held = input.current.held.filter((d) => d !== dir);
      if (event.code === 'Space') input.current.bombHeld = false;
      if (event.code.startsWith('Alt')) event.preventDefault();
    };
    const blur = () => { input.current.held = []; input.current.bombHeld = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  });

  function nextLine() {
    if (!novel) return;
    if (novel.at + 1 < novel.lines.length) setNovel({ ...novel, at: novel.at + 1 });
    else { setNovel(null); closeNovel(novel.key); }
  }
  function closeNovel(key) {
    const order = { level1: 1, level2: 2, level3: 3 };
    if (order[key] && readStory() < order[key]) writeStory(order[key]);
    if (key === 'end') setTimeout(advance, 0);
  }

  const touch = useCallback((kind, value) => {
    if (kind === 'dir') { const held = input.current.held.filter((d) => d !== value.dir); if (value.on) held.push(value.dir); input.current.held = held; }
    if (kind === 'bomb') { if (screen === 'menu') start(); else input.current.bomb = true; }
    if (kind === 'action') input.current.action = true;
  }, [screen, start]);

  // Development only: the running game for scripted checks (never in the built site).
  if (import.meta.env?.DEV) window.__spoon = { gameRef, start, advance };
  const classes = ['sp-popup', screen === 'menu' ? 'sp-on-menu' : 'sp-in-game', paused && 'Paused', (paused || screen === 'menu') && 'IsOnMenuOrPaused', `SelectedTab${tab}`,
    record && 'NewHighScoreEarned', hud?.kick && 'HasKick', hud?.spiky && 'HasSpikyBombs', hud?.remote && 'HasRemoteBombs', hud?.remoteHint && 'ShowRemoteBombHint',
    hud?.low && 'TimerPulseAnim', novel && 'sp-novel-open'].filter(Boolean).join(' ');

  return <div className="sp-layout">
    <Fit className="sp-fit">
      <div className={classes} onContextMenu={(event) => event.preventDefault()}>
        <div className="sp-main">
          <div className="sp-body">
            <div className="sp-board">
              <div className="sp-playfield">
                <canvas ref={canvasRef} className="sp-renderer DimmedWhenPaused" width={WIDTH} height={HEIGHT} aria-label={valve('DOTA_Crownfall_Archive_Minigame_SpoonMan')}/>
                {screen === 'game' && hud && <Hud hud={hud} valve={valve}/>}
              </div>
              {label && <div key={label.key} className={`sp-intro DimmedWhenPaused ${label.over ? 'sp-gameover' : 'sp-countin'}`}>{label.text}</div>}
              {screen === 'menu' && <MainMenu valve={valve} best={best} outcome={table.outcome} tab={tab} setTab={setTab} onPlay={start} sound={click}/>}
              {novel && <Novel novel={novel} assets={assets} onNext={nextLine}/>}
              {paused && <>
                <div className="sp-pause-band"><span>{valve('DOTA_Crownfall_Techiemen_Paused')}</span></div>
                <div className="sp-pause-buttons">
                  <CrownfallButton onClick={() => setPaused(false)} sound={click}>{valve('DOTA_FightingGame_Arcade_Continue')}</CrownfallButton>
                  <CrownfallButton onClick={finishQuit} sound={click}>{valve('DOTA_FightingGame_Arcade_Quit')}</CrownfallButton>
                </div>
              </>}
              {(screen === 'menu' || paused) && <>
                <CloseButton mode={screen === 'game' ? 'return' : 'close'} onClick={screen === 'game' ? () => finishQuit() : onExit} label={screen === 'game' ? t('В меню игры') : t('Закрыть')}/>
                <div className="sp-sound"><MuteButton/></div>
              </>}
            </div>
          </div>
        </div>
      </div>
    </Fit>
    {screen === 'game' && <TouchPad onTouch={touch} onPause={() => setPaused((v) => !v)} hud={hud}/>}
  </div>;

  // «Выход» from the pause: the run ends here, its score counts like a lost one.
  function finishQuit() { music(null); if (gameRef.current) finish(); else toMenu(); }
}

// The keyhole circle (DOTATechiemenToggleKeyholeEffect) for each phase: opening on the start corner,
// closing on the hero at the exit and at «Game Over».
function keyhole(game, config) {
  const full = 1700, p = game.player;
  const ease = (k) => Math.max(0, Math.min(1, k));
  switch (game.phase) {
    case 'opening': return { x: 0, y: 0, radius: full * ease(game.phaseTime / config.opening) ** 2 };
    case 'closing': return { x: p.x, y: p.y, radius: full * (1 - ease(game.phaseTime / config.closing)) ** 2 };
    case 'cleared': return { x: p.x, y: p.y, radius: 0 };
    case 'over': return { x: p.x, y: p.y, radius: full * (1 - ease(game.phaseTime / config.overDuration)) ** 2 };
    case 'ended': return { x: p.x, y: p.y, radius: 0 };
    default: return null;
  }
}

// HeaderStats: power-ups on the left, the clock in the middle, «Счёт» and lives on the right, the stage
// line under them.
function Hud({ hud, valve }) {
  return <div className="sp-header DimmedWhenPaused">
    <div className="sp-toprow">
      <div className="sp-pickups">
        <img className="BombCountIcon" src={`${IMG}bomb_count_icon.webp`} alt=""/>
        <img className="BombCountIconKick" src={`${IMG}bomb_count_icon_kick.webp`} alt=""/>
        <img className="BombCountIconSpiky" src={`${IMG}bomb_count_icon_spiky.webp`} alt=""/>
        <span className="BombCountIconRemoteContainer"><img className="BombCountIconRemote" src={`${IMG}bomb_count_icon_remote.webp`} alt=""/><kbd className="RemoteBombHint">Alt</kbd></span>
        <b className="sp-ability" title={valve('DOTA_Crownfall_Techiemen_BombCount')}>{hud.bombs}</b>
        <img src={`${IMG}bomb_size_icon.webp`} alt=""/>
        <b className="sp-ability" title={valve('DOTA_Crownfall_Techiemen_BombSize')}>{hud.size}</b>
        <img src={`${IMG}walk_speed_icon.webp`} alt=""/>
        <b className="sp-ability" title={valve('DOTA_Crownfall_Techiemen_WalkSpeed')}>{hud.speed}</b>
      </div>
      <div className="sp-lifestats">
        <span className="sp-score-text">{valve('DOTA_Crownfall_Fishing_Leaderboard_Score')}</span>
        <span className="sp-score">{String(hud.score).padStart(6, '0')}</span>
        <b className="sp-ability">{hud.lives}</b>
        <i className="sp-lives-icon"/>
      </div>
    </div>
    <div className="sp-timer"><img src={`${IMG}timericon.webp`} alt=""/><b className="TimerLabel">{hud.time}</b></div>
    <div className="sp-stage"><i/><span>{valve('DOTA_Crownfall_Techiemen_Stage', { dota_techiemen_stage: hud.stage })}</span><i/></div>
  </div>;
}

// #MainMenu: the start screen (logo, Spoon in his barrel, «PRESS BOMB TO START») and the
// SetupScreenMenu with the «Правила» and «Счёт» tabs and the «Играть» button.
function MainMenu({ valve, best, outcome, tab, setTab, onPlay, sound }) {
  return <div className="sp-menu">
    <img className="sp-menu-bg" src={`${IMG}startscreen.webp`} alt=""/>
    <div className="sp-logo-box"><i className="sp-logo" role="img" aria-label={valve('DOTA_Crownfall_Archive_Minigame_SpoonMan')}/></div>
    <div className="sp-spoon-box"><i className="sp-spoon"/></div>
    <div className="sp-press"><div className="sp-press-letters">
      {LETTERS.map((letter, i) => <img key={i} src={`${IMG}startscreen_letter_${letter}.webp`} style={{ animationDelay: `${LETTER_DELAY[i]}s` }} alt=""/>)}
    </div></div>
    <div className="sp-setup">
      <div className="sp-tabs">
        <button type="button" className={`sp-tab ${tab === 1 ? 'sp-tab-on' : ''}`} onClick={() => { sound('General.ButtonClick'); setTab(1); }}><i/><span>{valve('DOTA_HowToPlay')}</span></button>
        <button type="button" className={`sp-tab ${tab === 0 ? 'sp-tab-on' : ''}`} onClick={() => { sound('General.ButtonClick'); setTab(0); }}><i/><span>{valve('DOTA_Crownfall_Techiemen_ScoresTab')}</span></button>
      </div>
      <div className="sp-contents">
        <div className="sp-scroll">{tab === 0 ? <Scores valve={valve} best={best} outcome={outcome}/> : <HowToPlay valve={valve}/>}</div>
      </div>
      <CrownfallButton className="sp-play" onClick={onPlay} sound={sound}>{valve('DOTA_Crownfall_Fishing_Play')}</CrownfallButton>
    </div>
  </div>;
}

function Scores({ valve, best, outcome }) {
  return <div className="sp-scores">
    <div className="sp-title"><i/><span>{valve('DOTA_FightingGame_Menu_MyHighScore')}</span><i/></div>
    <b className="sp-highscore">{number(best)}</b>
    <span className="sp-newhigh">{valve('DOTA_FightingGame_Arcade_NewHighScore')}</span>
    <BoardOutcome outcome={outcome}/>
    <Leaderboard game="spoon" className="sp-leaders" headClass="sp-leaders-head" label={valve('DOTA_Crownfall_Fishing_Leaderboard_Score')} format={number} rows={7}
      detail={(row) => t('этап {n}', { n: row.extra })}/>
    <h3 className="sp-gold">{t('Рубежи')}</h3>
    <div className="sp-marks">{MARKS.map((at, i) => <div key={at} className={best >= at ? 'sp-mark-done' : ''}><span>{number(at)}</span><i>{Array.from({ length: i + 1 }, (_, n) => <em key={n}/>)}</i></div>)}</div>
  </div>;
}

const Key = ({ icon, label }) => <span className="sp-key">{icon ? <img src={sharedImage(`${icon}.svg`)} alt={label || ''}/> : label}</span>;
const Strip = ({ name }) => <i className="sp-strip" style={{ backgroundImage: `url("${IMG}${name}.webp")` }}/>;

// HowToPlaySection: objective, controls, power-ups, special power-ups.
function HowToPlay({ valve }) {
  const row = (picture, text) => <div className="sp-control-row"><div className="sp-control-col">{picture}</div><span>{text}</span></div>;
  return <div className="sp-howto">
    <h3 className="sp-gold">{valve('DOTA_Crownfall_Techiemen_Objective')}</h3>
    {row(<i className="sp-strip sp-strip-still" style={{ backgroundImage: `url("${IMG}exit_closed.webp")` }}/>, valve('DOTA_Crownfall_Techiemen_FindTheExit'))}
    {row(<i className="sp-strip sp-strip-exit" style={{ backgroundImage: `url("${IMG}exit_open.webp")` }}/>, valve('DOTA_Crownfall_Techiemen_OpenTheExit'))}
    <h3 className="sp-gold">{valve('DOTA_Crownfall_Techiemen_Controls')}</h3>
    {row(<span className="sp-keys"><Key icon="arrow_up"/><span><Key icon="arrow_left"/><Key icon="arrow_down"/><Key icon="arrow_right"/></span></span>, <>{valve('DOTA_Crownfall_Techiemen_Move')} <small>{t('Или WASD.')}</small></>)}
    {row(<Key icon="space"/>, valve('DOTA_Crownfall_Techiemen_DropBomb'))}
    {row(<Key icon="alt"/>, <>{valve('DOTA_Crownfall_Techiemen_PowerupAction')} <small>{t('Или E.')}</small></>)}
    <h3 className="sp-gold">{valve('DOTA_Crownfall_Techiemen_Powerups')}</h3>
    {row(<Strip name="bomb_count_powerup"/>, valve('DOTA_Crownfall_Techiemen_BombCount'))}
    {row(<Strip name="bomb_size_powerup"/>, valve('DOTA_Crownfall_Techiemen_BombSize'))}
    {row(<Strip name="walk_speed_powerup"/>, valve('DOTA_Crownfall_Techiemen_WalkSpeed'))}
    <h3 className="sp-gold">{valve('DOTA_Crownfall_Techiemen_SpecialPowerups')}</h3>
    {row(<Strip name="bomb_kick_powerup"/>, valve('DOTA_Crownfall_Techiemen_Kick'))}
    {row(<Strip name="spiky_bomb_powerup"/>, valve('DOTA_Crownfall_Techiemen_StickyBomb'))}
    {row(<Strip name="bomb_remote_powerup"/>, valve('DOTA_Crownfall_Techiemen_RemoteBomb'))}
  </div>;
}

// The story box (DOTACrownfallVisualNovel in VisualNovelOuterContainer).
function Novel({ novel, assets, onNext }) {
  const line = novel.lines[novel.at];
  const portrait = BOMBS_FACE.has(line) ? 'spoon_portrait_bombs' : 'spoon_portrait_idle';
  useEffect(() => { assets.ui.play('General.ButtonClick'); }, [novel.at, assets.ui]);
  return <div className="sp-novel"><button type="button" className="sp-novel-box" onClick={onNext}>
    <img src={`${NOVEL}portraits/${portrait}.webp`} alt=""/>
    <span className="sp-novel-text"><b>{assets.valve('DOTA_VisualNovel_act4_Actor_Spoon')}</b>{assets.valve(`DOTA_VisualNovel_act4_Dialogue_spoonman-${line}`)}</span>
    <span className="sp-novel-next">{t('Дальше')} ›</span>
  </button></div>;
}

// On touch screens: a cross on the left, the bomb and the special button on the right, pause.
function TouchPad({ onTouch, onPause, hud }) {
  const hold = (dir) => ({
    onPointerDown: (event) => { event.preventDefault(); try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic pointers. */ } onTouch('dir', { dir, on: true }); },
    onPointerUp: () => onTouch('dir', { dir, on: false }), onPointerCancel: () => onTouch('dir', { dir, on: false }), onLostPointerCapture: () => onTouch('dir', { dir, on: false }),
  });
  const tap = (kind) => ({ onPointerDown: (event) => { event.preventDefault(); onTouch(kind); } });
  const special = hud?.remote || hud?.kick;
  return <div className="sp-touch" onContextMenu={(event) => event.preventDefault()}>
    <div className="sp-dpad">
      {['up', 'left', 'right', 'down'].map((dir) => <button type="button" key={dir} className={`sp-dpad-${dir}`} aria-label={dir} {...hold(dir)}><img src={sharedImage(`arrow_${dir}.svg`)} alt=""/></button>)}
    </div>
    <button type="button" className="sp-touch-pause" onClick={onPause} aria-label={t('Пауза')}>II</button>
    <div className="sp-touch-buttons">
      <button type="button" className={`sp-touch-action ${special ? '' : 'sp-touch-off'}`} aria-label="Alt" {...tap('action')}><img src={sharedImage('alt.svg')} alt=""/></button>
      <button type="button" className="sp-touch-bomb" aria-label={t('Бомба')} {...tap('bomb')}><img src={`${IMG}bomb_count_icon.webp`} alt=""/></button>
    </div>
  </div>;
}
