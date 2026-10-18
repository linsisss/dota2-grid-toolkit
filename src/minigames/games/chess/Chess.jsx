// «Драконьи шахматы» (Crownfall act III, Dragon Chess — Valve's `match3`): bp_popup_crownfall_encounter_match3
// rebuilt for the browser. The rules are logic.mjs; the board, the opponent and the projectiles are drawn
// on canvases by render.js; this file is Valve's popup around them — the setup screen (how to play,
// rewards, the best score, the campaign), the countdown, the opponent's header with its action queue and
// the stage band, the health bars with modifiers, the floating score and damage numbers, the stun and
// «out of moves» overlays, pause, the abilities popup (match3_popup_help), the tooltips and the end —
// with the class names of Valve's layout (chess.css), Valve's sound events and Valve's strings.
// docs/minigames.md («Драконьи шахматы»).
import { useCallback, useEffect, useRef, useState } from 'react';
import { createSounds, unlockAudio } from '../../core/sound.js';
import { assetBase, bestScore, loadJSON, loadStrings, saveScore } from '../../core/assets.js';
import { CloseButton, CrownfallButton, Fit, MuteButton } from '../../core/ui.jsx';
import { BoardOutcome, Leaderboard, useRun } from '../../core/leaderboard.jsx';
import { OPPONENT_AT, PLAYER_AT, REWARDS, actionQueue, canGrab, canPlay, chessConfig, createGame, hasMod, step, tooltipValues, trySwap } from './logic.mjs';
import { BOARD, CELL, HEIGHT, WIDTH, applyEvents, createEffects, drawBoard, drawForeground, drawOpponent, loadArt, opponentArt, stepEffects, toScreen } from './render.js';
import { locale, t } from '../../../../scripts/i18n.mjs';
import { useLanguage } from '../../../useLanguage.js';
import './chess.css';

const BASE = assetBase('chess'), IMG = `${BASE}images/`;
const PROGRESS_KEY = 'gridstudio.minigames.chess';
const MUSIC = { menu: 'match3.match_music', normal: 'match3.match_music.creep', boss: 'match3.match_music.hero', won: 'match3.match_music.win', lost: 'match3.match_music.loss' };
const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('chessdebug');
const number = (value) => Math.round(Number(value) || 0).toLocaleString(locale);
const readJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const writeJSON = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Not remembered. */ } };

// The user's and the opponent's modifiers: their icons and Valve's texts.
const MODS = {
  stun: { image: 'spellicons/chaos_knight_chaos_bolt', name: 'DOTA_HealthBar_Status_Stunned', desc: 'DOTA_Match3_Status_Stunned_Desc' },
  gust: { image: 'spellicons/drow_ranger_wave_of_silence', name: 'DOTA_Tooltip_ability_drow_ranger_wave_of_silence', desc: 'DOTA_Match3_Status_Silenced_Desc' },
  frost_attack: { image: 'spellicons/ghost_frost_attack', name: 'DOTA_Tooltip_ability_ghost_frost_attack', desc: 'DOTA_Match3_OpponentAction_FrostAttack_DebuffDesc' },
  hypothermia: { image: 'spellicons/drow_ranger_glacier', name: 'DOTA_Tooltip_modifier_drow_ranger_frost_arrows_hypothermia', desc: 'DOTA_Match3_OpponentAction_Hypothermia_DebuffDesc' },
  ice_blast: { image: 'spellicons/ancient_apparition_ice_blast', name: 'DOTA_Tooltip_ability_ancient_apparition_ice_blast', desc: 'DOTA_Match3_OpponentAction_IceBlast_DebuffDesc' },
  icefire_bomb: { image: 'spellicons/ice_shaman_incendiary_bomb', name: 'DOTA_Tooltip_ability_ice_shaman_incendiary_bomb', desc: 'DOTA_Match3_OpponentAction_IcefireBomb_DebuffDesc' },
  cold_feet: { image: 'spellicons/ancient_apparition_cold_feet', name: 'DOTA_Tooltip_ability_ancient_apparition_cold_feet', desc: 'DOTA_Match3_OpponentAction_ColdFeet_DebuffDesc' },
  cold_embrace: { image: 'spellicons/winter_wyvern_cold_embrace', name: 'DOTA_Tooltip_ability_winter_wyvern_cold_embrace', desc: 'DOTA_Match3_Ability_WinterWyvern_ColdEmbrace_Buff' },
  insatiable_hunger: { image: 'spellicons/broodmother_insatiable_hunger', name: 'DOTA_Tooltip_ability_broodmother_insatiable_hunger', desc: 'DOTA_Match3_Ability_Broodmother_InsatiableHunger_Buff' },
  healing_salve: { image: 'items/flask', fallback: 'spellicons/winter_wyvern_cold_embrace', name: 'DOTA_Match3_OpponentAbility_HealingSalve', desc: 'DOTA_Match3_OpponentAbility_HealingSalve_Desc' },
  black_king_bar: { image: 'items/black_king_bar', name: 'DOTA_Tooltip_Ability_item_black_king_bar', desc: 'DOTA_Match3_OpponentAction_BlackKingBar_BuffDesc' },
  slow: { image: 'spellicons/crystal_maiden_crystal_nova', name: 'DOTA_Match3_AbilityValue_SlowPercentage', desc: null },
};
const STUN_FROM = { vengefulspirit_magic_missile: 'spellicons/vengefulspirit_magic_missile', lina_light_strike_array: 'spellicons/lina_light_strike_array', chaos_bolt: 'spellicons/chaos_knight_chaos_bolt', cold_feet: 'spellicons/ancient_apparition_cold_feet' };
const SLOW_FROM = { crystal_maiden_crystal_nova: 'spellicons/crystal_maiden_crystal_nova', lich_frost_nova: 'spellicons/lich_frost_nova' };

export default function Chess({ onExit }) {
  useLanguage();
  const [assets, setAssets] = useState(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([loadJSON(`${BASE}data.json`), loadJSON(`${BASE}sounds.json`), loadStrings('chess'), loadJSON('./assets/minigames/shared/sounds.json').catch(() => ({})), loadArt(BASE)])
      .then(([data, sounds, valve, shared, art]) => setAssets({ config: chessConfig(data), sounds: createSounds(BASE, sounds), ui: createSounds('./assets/minigames/shared/', shared), valve, art }))
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <div className="mg-loading" role="alert">{t('Не удалось загрузить игру. Обнови страницу.')}</div>;
  if (!assets) return <div className="mg-loading" role="status">{t('Загружаем…')}</div>;
  return <ChessPopup assets={assets} onExit={onExit}/>;
}

// Panorama's wash-color on the score plate (match3's ScoreBackground #4b381b, ScoreBorder #8b6c38).
function useWashed() {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    let live = true;
    const make = (name, color) => new Promise((done) => {
      const img = new Image();
      img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); x.globalCompositeOperation = 'destination-in'; x.drawImage(img, 0, 0); done(c.toDataURL()); };
      img.onerror = () => done(null); img.src = `${IMG}${name}`;
    });
    Promise.all([make('score_container_background.webp', '#4b381b'), make('score_container_border.webp', '#8b6c38')]).then(([back, border]) => { if (live) setUrls({ back, border }); });
    return () => { live = false; };
  }, []);
  return urls;
}

function ChessPopup({ assets, onExit }) {
  const { config, sounds, ui, valve, art } = assets;
  const washed = useWashed();
  const boardRef = useRef(null), stageRef = useRef(null), frontRef = useRef(null), gameRef = useRef(null), fxRef = useRef(createEffects());
  const musicRef = useRef(null), dragRef = useRef(null), loopsRef = useRef(new Set()), overlayId = useRef(1), damageRef = useRef(null);
  const [progress, setProgress] = useState(() => readJSON(PROGRESS_KEY, { played: 0, furthest: -1, novel: false }));
  const [screen, setScreen] = useState('setup');            // setup · starting · active · finished (Valve's GameState_*)
  const [paused, setPaused] = useState(false), [help, setHelp] = useState(false), [novel, setNovel] = useState(null);
  const [hud, setHud] = useState(null), [overlay, setOverlay] = useState([]), [countdown, setCountdown] = useState(null);
  const [result, setResult] = useState(null), [tip, setTip] = useState(null), [selected, setSelected] = useState(null), [cursor, setCursor] = useState(null);
  const click = useCallback((name) => ui.play(name), [ui]);

  // --- sound ---
  const music = useCallback((name) => {
    if (musicRef.current?.name === name) return;
    musicRef.current?.handle?.stop(3);
    musicRef.current = name ? { name, handle: sounds.play(name, { loop: name !== MUSIC.won && name !== MUSIC.lost }) } : null;
  }, [sounds]);
  useEffect(() => {
    const retry = () => { if (musicRef.current && !musicRef.current.handle) { const { name } = musicRef.current; musicRef.current = null; music(name); } };
    window.addEventListener('pointerdown', retry); window.addEventListener('keydown', retry);
    return () => { window.removeEventListener('pointerdown', retry); window.removeEventListener('keydown', retry); };
  }, [music]);
  useEffect(() => () => { sounds.stopAll(); ui.stopAll(); }, [sounds, ui]);
  useEffect(() => { if (screen === 'setup') music(MUSIC.menu); }, [screen, music]);
  const table = useRun('chess');
  const stopLoops = useCallback(() => { for (const h of loopsRef.current) h?.stop(0.5); loopsRef.current.clear(); }, []);

  // Portraits of the opponents for the campaign list (sprites/portraits.webp: the heads of the idle strips).
  const faces = Object.entries(art.sprites.opponents).filter(([, o]) => o.portraitIndex != null), count = faces.length;
  const portraits = Object.fromEntries(faces.map(([name, o]) => [name, { backgroundImage: `url(${BASE}sprites/${art.sprites.portraits?.file})`,
    backgroundPosition: `${count > 1 ? (o.portraitIndex / (count - 1)) * 100 : 0}% 0`, backgroundSize: `${count * 100}% 100%` }]));

  // --- a game ---
  const begin = useCallback(() => {
    unlockAudio();
    const game = createGame(config, { seed: Date.now(), startLevel: DEBUG ? Number(new URLSearchParams(location.search).get('stage')) || 0 : 0 });
    gameRef.current = game; fxRef.current = createEffects(); dragRef.current = null;
    setSelected(null); setCursor(null); setResult(null); setPaused(false); setHelp(false); setOverlay([]); table.start();
    setScreen('starting');
    const next = { ...readJSON(PROGRESS_KEY, {}), played: (readJSON(PROGRESS_KEY, {}).played || 0) + 1 };
    writeJSON(PROGRESS_KEY, next); setProgress(next);
    sounds.preload(['match3.piece_matched', 'match3.piece_matched.2', 'match3.piece_matched.3', 'match3.piece_grab', 'match3.piece_released.success', 'match3.piece_released.fail', 'match3.Damage_Melee', 'match3.countdown.tick', 'match3.countdown.go']);
  }, [config, sounds, table.start]); // eslint-disable-line react-hooks/exhaustive-deps
  // «Играть»: the Winter Wyvern's lines first (the long ones the first time, then the short one).
  const play = useCallback(() => {
    const seen = readJSON(PROGRESS_KEY, {}).novel;
    const lines = seen ? ['match3-game-intro-short_WinterWyvern_0'] : ['match3-game-intro_WinterWyvern_0', 'match3-game-intro_WinterWyvern_1', 'match3-game-intro_WinterWyvern_2'];
    writeJSON(PROGRESS_KEY, { ...readJSON(PROGRESS_KEY, {}), novel: true });
    setNovel({ lines, at: 0, then: 'start' });
  }, []);
  const toSetup = useCallback(() => {
    stopLoops(); setPaused(false); setHelp(false); setScreen('setup'); gameRef.current = null; setHud(null); setOverlay([]); dragRef.current = null;
  }, [stopLoops]);

  // Floating numbers (Valve's EventsOverlay snippets) at popup px.
  const float = useCallback((item) => {
    const id = overlayId.current++, life = item.kind === 'crit' ? 1500 : 700;
    setOverlay((list) => [...list.slice(-30), { id, ...item }]);
    setTimeout(() => setOverlay((list) => list.filter((x) => x.id !== id)), life + 50);
  }, []);

  const handle = useCallback((events) => {
    const game = gameRef.current;
    applyEvents(fxRef.current, events, game, art);
    for (const e of events) {
      switch (e.type) {
        case 'sound': { const h = sounds.play(e.name); if (e.handle && h) loopsRef.current.add(h); break; }
        case 'countdown': setCountdown(e.value); break;
        case 'level': {
          const level = config.levels[e.index];
          music(level.kind === 'boss' ? MUSIC.boss : MUSIC.normal);
          opponentArt(art, config.levels[e.index + 1]?.opponent);
          setScreen('active');
          const saved = readJSON(PROGRESS_KEY, {});
          if ((saved.furthest ?? -1) < e.index) { const next = { ...saved, furthest: e.index }; writeJSON(PROGRESS_KEY, next); setProgress(next); }
          break;
        }
        case 'match': {
          const [x, y] = toScreen(e.x, e.y);
          float({ kind: 'score', x, y, title: e.count > 3 ? valve('DOTA_Match3_ScoreEvent_BigMatch', { piece_count: e.count }) : valve('DOTA_Match3_ScoreEvent_Match'), amount: e.score });
          break;
        }
        case 'ability': { // SuperPieceTriggered / UltraPieceTriggered: +150 / +450 under the ability's name
          if (!e.score) break;
          const [x, y] = toScreen(e.x, e.y - 0.6);
          float({ kind: 'score', x, y, title: e.locName ? valve(e.locName) : '', amount: e.score });
          break;
        }
        case 'opponentDefeated': {
          const [x, y] = toScreen(OPPONENT_AT.x, OPPONENT_AT.y - 1.2);
          if (e.score) float({ kind: 'score', x, y, title: valve('DOTA_Match3_ScoreEvent_OpponentDefeated'), amount: e.score, big: true });
          break;
        }
        case 'opponentDamage': {
          // match attacks land one by one: their 1s are summed for a moment into one number
          const now = performance.now(), kind = e.kind;
          const last = damageRef.current;
          if (kind === 'default' && last && now - last.at < 160) { last.amount += e.amount; setOverlay((list) => list.map((x) => (x.id === last.id ? { ...x, amount: last.amount } : x))); break; }
          const [x, y] = toScreen(OPPONENT_AT.x + (Math.random() - 0.5) * 1.6, OPPONENT_AT.y - 0.6 + (Math.random() - 0.5) * 1.2);
          const id = overlayId.current;
          float({ kind, x, y, amount: e.amount });
          if (kind === 'default') damageRef.current = { id, at: now, amount: e.amount };
          break;
        }
        case 'playerDamage': {
          const [x, y] = toScreen(PLAYER_AT.x + (Math.random() - 0.5) * 2, PLAYER_AT.y - 1.1);
          float({ kind: e.kind === 'crit' ? 'crit' : e.kind === 'magic' ? 'magic' : 'default', x, y, amount: e.amount });
          break;
        }
        case 'won': case 'lost': {
          stopLoops();
          const won = e.type === 'won', record = saveScore('chess', e.score);
          setResult({ won, score: e.score, record, level: game.level });
          table.submit({ score: e.score, stats: { level: Math.max(0, game.level), won } });
          music(won ? MUSIC.won : MUSIC.lost);
          setTimeout(() => { if (gameRef.current === game) { setScreen('finished'); setNovel({ lines: [won ? 'match3-game-win_WinterWyvern_0' : 'match3-game-loss_WinterWyvern_0'], at: 0 }); } }, won ? 1800 : 1500);
          break;
        }
        default: break;
      }
    }
  }, [art, config, float, music, sounds, stopLoops, valve, table.submit]); // eslint-disable-line react-hooks/exhaustive-deps

  // The HUD's numbers, kept in React state only when they change.
  const snapshot = useCallback(() => {
    const game = gameRef.current; if (!game) return;
    const o = game.opponent, p = game.player;
    const mods = (unit) => unit.mods.map((m) => `${m.name}:${m.from || ''}:${m.number ?? ''}:${m.buff ? 1 : 0}`).join('|');
    const queue = actionQueue(game);
    const next = {
      health: Math.ceil(p.health), maxHealth: p.maxHealth, score: game.score, playerMods: mods(p), oppMods: o ? mods(o) : '',
      level: game.level, opp: o?.def.name, oppHealth: o ? Math.max(0, Math.ceil(o.health)) : 0, oppMax: o?.maxHealth || 0, oppState: o?.state,
      queue: queue.map((a) => a.index).join(','), cooldown: o?.current ? Math.max(0, Math.ceil(o.cooldown)) : 0, interrupted: !!o?.interrupted,
      stunned: hasMod(p, 'stun'), outOfMoves: !!game.outOfMoves, stageIntro: !!game.stageIntro, frozen: !!game.frozen, phase: game.phase,
      silenced: hasMod(p, 'gust'), attacking: o?.anim && (o.anim.name === 'attack' || o.anim.name === 'cast') && game.time - o.anim.at < 0.6,
    };
    setHud((old) => (old && Object.keys(next).every((k) => old[k] === next[k]) ? old : next));
  }, []);

  // --- the loop ---
  const running = (screen === 'starting' || screen === 'active') && !paused && !help && !novel;
  useEffect(() => {
    if (screen === 'setup') return undefined;
    let frame = 0, last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const game = gameRef.current;
      if (!game) { frame = requestAnimationFrame(tick); return; }
      if (running || game.phase === 'won' || game.phase === 'lost') {
        if (!paused && !help) {
          const events = step(game, dt);
          if (events.length) handle(events);
          stepEffects(fxRef.current, dt);
        }
        snapshot();
      }
      const view = { now: now / 1000, drag: dragRef.current, hint: game.hint, silenced: hasMod(game.player, 'gust') };
      if (boardRef.current) drawBoard(boardRef.current.getContext('2d'), game, art, fxRef.current, view);
      if (stageRef.current) drawOpponent(stageRef.current.getContext('2d'), game, art, fxRef.current, now / 1000);
      if (frontRef.current) drawForeground(frontRef.current.getContext('2d'), game, art, fxRef.current, now / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [screen, running, paused, help, art, handle, snapshot]);
  // Losing the window pauses the game (it runs in real time).
  useEffect(() => {
    const blur = () => { if (gameRef.current?.phase === 'active') setPaused(true); dragRef.current = null; };
    const hidden = () => { if (document.hidden) blur(); };
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', hidden); };
  }, []);

  // --- the board: drag a gem onto its neighbour (or click one, then the other; or arrows + Enter) ---
  const cellAt = (event) => {
    const rect = boardRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) * BOARD / rect.width, y = (event.clientY - rect.top) * BOARD / rect.height;
    return { x, y, r: Math.floor(y / CELL), c: Math.floor(x / CELL) };
  };
  const swap = useCallback((a, b) => {
    const game = gameRef.current; if (!game) return null;
    const r = trySwap(game, a, b);
    handle(game.events.splice(0));
    setSelected(null);
    return r;
  }, [handle]);
  const onPointerDown = (event) => {
    const game = gameRef.current;
    if (!game || paused || screen !== 'active' || event.button > 0) return;
    event.preventDefault();
    const at = cellAt(event);
    if (selected && Math.abs(selected[0] - at.r) + Math.abs(selected[1] - at.c) === 1) { swap(selected, [at.r, at.c]); return; }
    if (!canGrab(game, at.r, at.c)) { if (!canPlay(game)) sounds.play('match3.piece_released.fail'); return; }
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic pointers. */ }
    const p = game.grid[at.r][at.c];
    dragRef.current = { id: p.id, r: at.r, c: at.c, x: at.x, y: at.y, x0: at.x, y0: at.y, pointer: event.pointerId };
    sounds.play('match3.piece_grab');
    setCursor(null);
  };
  const onPointerMove = (event) => {
    const d = dragRef.current; if (!d || d.pointer !== event.pointerId) return;
    const at = cellAt(event); d.x = at.x; d.y = at.y;
    const dx = at.x - d.x0, dy = at.y - d.y0;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > CELL * 0.45) {
      const target = Math.abs(dx) > Math.abs(dy) ? [d.r, d.c + Math.sign(dx)] : [d.r + Math.sign(dy), d.c];
      dragRef.current = null;
      if (target[0] >= 0 && target[0] < 8 && target[1] >= 0 && target[1] < 8) swap([d.r, d.c], target);
    }
  };
  const onPointerUp = (event) => {
    const d = dragRef.current; if (!d || d.pointer !== event.pointerId) return;
    dragRef.current = null;
    // a click without a drag selects the gem; the next click on a neighbour swaps
    setSelected((s) => (s && s[0] === d.r && s[1] === d.c ? null : [d.r, d.c]));
  };

  // Keys: F9 / Esc — pause (Valve's DOTAMatch3TogglePaused, oncancel), arrows — a cursor over the board,
  // Enter / Space — take the gem under it, then an arrow swaps it with that neighbour.
  useEffect(() => {
    const down = (event) => {
      if (event.target.closest?.('input, textarea, select')) return;
      if (novel) { if (['Enter', 'Space', 'Escape'].includes(event.code)) { event.preventDefault(); nextLine(); } return; }
      if (help) { if (event.code === 'Escape' || event.code === 'F9') { event.preventDefault(); setHelp(false); } return; }
      if (event.code === 'Escape' || event.code === 'F9') {
        event.preventDefault();
        if (screen === 'setup') { if (event.code === 'Escape') onExit(); return; }
        if (screen === 'finished') { if (event.code === 'Escape') toSetup(); return; }
        setPaused((v) => !v); dragRef.current = null;
        return;
      }
      if (screen === 'setup' && event.code === 'Enter') { event.preventDefault(); click('General.ButtonClick'); play(); return; }
      if (screen === 'finished' && event.code === 'Enter') { event.preventDefault(); play(); return; }
      if (paused) { if (event.code === 'Enter') { event.preventDefault(); setPaused(false); } return; }
      if (screen !== 'active') return;
      const dirs = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], KeyW: [-1, 0], KeyS: [1, 0], KeyA: [0, -1], KeyD: [0, 1] };
      if (dirs[event.code]) {
        event.preventDefault();
        const [dr, dc] = dirs[event.code];
        if (selected) { const target = [selected[0] + dr, selected[1] + dc]; if (target[0] >= 0 && target[0] < 8 && target[1] >= 0 && target[1] < 8) { swap(selected, target); setCursor(target); } return; }
        setCursor((cur) => { const base = cur || [3, 3]; return [Math.max(0, Math.min(7, base[0] + (cur ? dr : 0))), Math.max(0, Math.min(7, base[1] + (cur ? dc : 0)))]; });
        return;
      }
      if ((event.code === 'Enter' || event.code === 'Space') && !event.repeat) {
        event.preventDefault();
        const cur = cursor || [3, 3];
        if (!cursor) { setCursor(cur); return; }
        if (selected && selected[0] === cur[0] && selected[1] === cur[1]) setSelected(null);
        else if (canGrab(gameRef.current, cur[0], cur[1])) { setSelected(cur); sounds.play('match3.piece_grab'); }
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  });

  const nextLine = useCallback(() => {
    setNovel((state) => {
      if (!state) return null;
      if (state.at + 1 < state.lines.length) return { ...state, at: state.at + 1 };
      if (state.then === 'start') setTimeout(begin, 0);
      return null;
    });
  }, [begin]);

  const debugRef = useRef(null);
  debugRef.current = { gameRef, config, begin, swap, setPaused, art };
  useEffect(() => { if (DEBUG || import.meta.env?.DEV) window.__chess = debugRef; }, []);

  // --- the picture ---
  const game = gameRef.current, o = game?.opponent, level = o ? config.levels[game.level] : null;
  const inGame = screen === 'starting' || screen === 'active';
  const flavor = o?.def.flavor ? valve(o.def.flavor) : '';
  const classes = ['ch-popup', 'PopupPanel', 'Match3', `GameState_${{ setup: 'Setup', starting: 'Starting', active: 'Active', finished: 'Finished' }[screen]}`,
    paused && 'IsPaused', hud?.stunned && screen === 'active' && 'PlayerIsStunned', hud?.outOfMoves && 'OutOfMoves', o && 'HasOpponent',
    o && (hud?.oppState === 'active' || hud?.oppState === 'dying' || hud?.oppState === 'leaving') && !hud?.stageIntro && 'OpponentState_Active',
    hud?.stageIntro && 'StageIntro', level?.kind === 'boss' && 'BossLevel', (hud?.frozen || paused) && inGame && 'GameplayFrozen', flavor && 'HasOpponentFlavor',
    progress.played > 0 && 'PlayedOnce', hud?.attacking && 'OpponentActionIsActive', countdown != null && screen === 'starting' && 'StartingCountdown'].filter(Boolean).join(' ');
  const shake = (fxRef.current.shake || 0) > 0.05 && screen === 'active' ? 'PlayerTookDamage' : '';

  return <div className="ch-layout">
    <Fit className="ch-fit">
      <div className={classes} onContextMenu={(event) => event.preventDefault()}>
        <div className="MainContentsWrapper">
          <div className="MainContents">
            <img id="GameBackground" className={shake} src={`${IMG}match3_background_icewrack.webp`} alt=""/>
            <canvas id="OpponentScene" className={shake} ref={stageRef} width={WIDTH} height={HEIGHT}/>
            <div className="Body">
              <div className="LeftColumn">
                <div className="GameBoardContainer">
                  <canvas id="GameBoard" ref={boardRef} width={BOARD} height={BOARD} aria-label={valve('DOTA_Crownfall_EncounterName_Match3')}
                    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { dragRef.current = null; }}/>
                  {(selected || cursor) && screen === 'active' && <div className="ch-marks">
                    {cursor && <span className="ch-cursor" style={{ left: cursor[1] * CELL, top: cursor[0] * CELL }}/>}
                    {selected && <span className="ch-selected" style={{ left: selected[1] * CELL, top: selected[0] * CELL }}/>}
                  </div>}
                  <div className="GameBoardOverlay">
                    <div className="GameOverlays">
                      <div className="StunnedOverlay StatusOverlay"><div className="Title">{valve('DOTA_HealthBar_Status_Stunned')}</div><div className="Desc">{valve('DOTA_Match3_Status_Stunned_Desc')}</div></div>
                      <div className="OutOfMovesOverlay StatusOverlay"><div className="Title">{valve('DOTA_Match3_OutOfMoves')}</div><div className="Desc">{valve('DOTA_Match3_OutOfMoves_Desc')}</div></div>
                    </div>
                    {paused && <div className="PauseScreen">
                      <div className="PauseText">{valve('DOTA_Match3_Paused')}</div>
                      <CrownfallButton onClick={() => setPaused(false)} sound={click}>{valve('DOTA_Match3_Resume')}</CrownfallButton>
                      <CrownfallButton onClick={() => setHelp(true)} sound={click}>{valve('DOTA_Match3_ViewAbilities')}</CrownfallButton>
                      <CrownfallButton onClick={toSetup} sound={click}>{valve('DOTA_Match3_LeaveGame')}</CrownfallButton>
                    </div>}
                  </div>
                </div>
                <div className="Player">
                  <ModifierList id="PlayerModifiers" unit={game?.player} valve={valve} onTip={setTip} key={hud?.playerMods}/>
                  <div className="PlayerHealthContainer">
                    <Bar id="PlayerHealthProgressBar" value={hud?.health ?? config.playerHealth} max={hud?.maxHealth ?? config.playerHealth}/>
                    <span className="BarLabel">{number(hud?.health ?? config.playerHealth)} / {number(hud?.maxHealth ?? config.playerHealth)}</span>
                  </div>
                </div>
              </div>
              <div className="RightColumn">
                <div className="OpponentHeader">
                  <div className="LevelContainer"><span className="Dash Left"/><span className="OpponentLevel LabelMedium">{level ? valve(level.locName) : ''}</span><span className="Dash Right"/></div>
                  <div className="OpponentName TitleMedium">{o ? valve(o.def.locName) : ''}</div>
                  <div className="OpponentFlavor">{flavor}</div>
                  <div className="DashDotDivider"><span className="Dash Left"/><span className="Dot"/><span className="Dash Right"/></div>
                </div>
                <div id="OpponentActionQueue">{game && hud?.queue && actionQueue(game).map((a, i) => <OpponentAction key={`${hud.level}-${a.index}`} item={a} config={config} valve={valve} current={i === 0}
                  cooldown={hud.cooldown} interrupted={hud.interrupted} onTip={setTip}/>)}</div>
                <div className="StageIntroContainer">
                  <div className="LevelName">{level ? valve(level.locName) : ''}</div>
                  <div className="OpponentName">{o ? valve(o.def.locName) : ''}</div>
                  <div className="BossBattle">{valve('DOTA_Match3_BossBattle')}</div>
                </div>
                <div className="OpponentFooter">
                  <ModifierList id="OpponentModifiers" unit={o} valve={valve} onTip={setTip} key={hud?.oppMods}/>
                  <div className="HealthContainer">
                    <Bar id="OpponentHealthProgressBar" value={hud?.oppHealth ?? 0} max={hud?.oppMax || 1}/>
                    <span className="BarLabel">{number(hud?.oppHealth ?? 0)} / {number(hud?.oppMax ?? 0)}</span>
                  </div>
                </div>
              </div>
            </div>
            <canvas id="ForegroundScene" ref={frontRef} width={WIDTH} height={HEIGHT}/>
            <div id="EventsOverlay">{overlay.map((item) => <FloatingEvent key={item.id} item={item}/>)}</div>
          </div>
          <div className="Score">
            {washed.back && <img className="ScoreBackground" src={washed.back} alt=""/>}
            {washed.border && <img className="ScoreBorder" src={washed.border} alt=""/>}
            <div className="ScoreData"><span className="LabelMedium ScoreLabel">{valve('DOTA_Crownfall_Fishing_Leaderboard_Score')}</span><b className="TitleLarge ScoreValue">{number(hud?.score ?? 0)}</b></div>
          </div>
          {screen === 'setup' && <SetupScreen {...{ valve, config, progress, portraits, click, play, onExit }}/>}
          <div className="StartingScreen" key={countdown}><span>{countdown > 0 ? countdown : valve('DOTA_Match3_Countdown_Go')}</span></div>
          {screen === 'finished' && result && !novel && <div className="FinishedScreen">
            <div className="Title">{valve(result.won ? 'DOTA_Match3_Win_Title' : 'DOTA_Match3_Loss_Title')}</div>
            <div className="FinalScore">{valve('DOTA_Match3_FinalScore', { current_score: '\u0000' }).split('\u0000').map((part, i) => (i ? [<span className="ScoreValue" key="v">{number(result.score)}</span>, stripTags(part)] : stripTags(part)))}</div>
            {!result.won && <div className="ch-reached">{t('Дошли до этапа: {stage}', { stage: valve(config.levels[result.level]?.locName || '') })}</div>}
            {result.record && <div className="ch-record">{t('Новый рекорд!')}</div>}
            <BoardOutcome outcome={table.outcome}/>
            <CrownfallButton className="PlayAgainButton" onClick={play} sound={click}>{valve('DOTA_Match3_PlayAgain')}</CrownfallButton>
            <button type="button" className="ch-link" onClick={toSetup}>{t('В меню игры')}</button>
          </div>}
          <div id="CloseButtonContainer">
            <CloseButton mode={inGame ? 'return' : 'close'} label={inGame ? t('Пауза') : t('Закрыть')} onClick={() => {
              if (screen === 'setup') onExit(); else if (screen === 'finished') toSetup(); else setPaused((v) => !v);
            }}/>
          </div>
          {help && <HelpPopup config={config} valve={valve} onClose={() => setHelp(false)}/>}
          {novel && <Novel novel={novel} valve={valve} onNext={nextLine}/>}
          {tip && <Tooltip tip={tip}/>}
        </div>
        <button type="button" className="PauseHint" onClick={() => { if (inGame) setPaused((v) => !v); }}>
          <span className="PauseLabelContainer"><span className="PauseLabel LabelMedium">{valve('DOTA_Match3_Pause')}</span><span className="UnPauseLabel LabelMedium">{valve('DOTA_FightingGame_HUD_UnPause')}</span></span>
          <kbd className="ControlKey">F9</kbd>
        </button>
        <div className="ch-sound"><MuteButton/></div>
      </div>
    </Fit>
  </div>;
}

const stripTags = (text) => String(text).replace(/<[^>]+>/g, '');

function Bar({ id, value, max }) {
  return <div id={id} className="ProgressBar" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemax={max}>
    <div className="ProgressBarLeft" style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%` }}/>
  </div>;
}

// Valve's EventsOverlay snippets: ScoreEvent, DefaultDamageEvent, CritDamageEvent, MagicDamageEvent.
function FloatingEvent({ item }) {
  const style = { left: item.x, top: item.y };
  if (item.kind === 'score') return <div className={`ScoreEvent ${item.big ? 'ch-big' : ''}`} style={style}><div className="Contents"><span className="EventTitle">{item.title}</span><span className="ScoreAmount">+{number(item.amount)}</span></div></div>;
  if (item.kind === 'crit') return <div className="CritDamageEvent DamageEvent" style={style}><div className="Contents"><span className="Icon"/><span className="DamageAmount">{number(item.amount)}</span></div></div>;
  if (item.kind === 'magic') return <div className="MagicDamageEvent DamageEvent" style={style}><div className="Contents"><span className="Icon"/><span className="DamageAmount">{number(item.amount)}</span></div></div>;
  return <div className="DefaultDamageEvent DamageEvent" style={style}><span className="DamageAmount">{number(item.amount)}</span></div>;
}

// The Modifier snippet: an icon in the buff outline (red, green for buffs), the stacks or matches left.
function ModifierList({ id, unit, valve, onTip }) {
  if (!unit) return <div id={id} className="ModifierList"/>;
  return <div id={id} className="ModifierList">{unit.mods.map((m, index) => {
    const def = MODS[m.name] || {};
    const image = m.name === 'stun' ? STUN_FROM[m.from] || def.image : m.name === 'slow' ? SLOW_FROM[m.from] || def.image : def.image;
    const show = (event) => onTip({ rect: event.currentTarget.getBoundingClientRect(), title: valve(def.name || m.name), desc: def.desc ? valve(def.desc) : '' });
    return <div key={`${m.name}-${index}`} className={`Modifier ${m.buff ? 'IsBuff' : ''} ${m.number != null ? 'ShowNumber' : ''}`} onMouseEnter={show} onMouseLeave={() => onTip(null)}>
      <img id="ModifierImage" src={`${IMG}${image}.webp`} alt="" onError={(event) => { if (def.fallback) event.currentTarget.src = `${IMG}${def.fallback}.webp`; }}/>
      <span id="ModifierBorder"/>
      <span className="ModifierNumber">{m.number}</span>
    </div>;
  })}</div>;
}

// The OpponentAction snippet: the current one big, with its cooldown, «--» when interrupted by a stun.
function OpponentAction({ item, config, valve, current, cooldown, interrupted, onTip }) {
  const def = config.actions[item.action];
  const show = (event) => {
    const fill = (text) => String(text).replace(/\$\{(\w+)\}/g, (all, name) => item.params[name] ?? all);
    onTip({ rect: event.currentTarget.getBoundingClientRect(), title: valve(def.locName), desc: def.locDesc ? fill(valve(def.locDesc)) : '',
      values: tooltipValues(def, item.params).filter((v) => v.value != null).map((v) => `${valve(v.desc)}: ${v.value}`) });
  };
  return <div className={`OpponentAction Showing ${current ? 'IsCurrentAction' : ''} ${current && cooldown > 0 ? 'OnCooldown' : ''} ${current && interrupted ? 'IsInterrupted' : ''}`}
    onMouseEnter={show} onMouseLeave={() => onTip(null)}>
    <img id="ActionImage" src={`${IMG}${def.image || 'spellicons/action_attack'}.webp`} alt=""/>
    <span id="CooldownOverlay"/>
    <span className="CooldownTime">{cooldown}</span>
    <span className="InterruptedOverlay">--</span>
  </div>;
}

// match3_tooltip_ability / _opponent_action.
function Tooltip({ tip }) {
  const popup = document.querySelector('.ch-popup'), box = popup?.getBoundingClientRect();
  const scale = box && popup.offsetWidth ? box.width / popup.offsetWidth : 1;
  const style = tip.rect && box ? { left: (tip.rect.right - box.left) / scale + 12, top: (tip.rect.top - box.top) / scale } : {};
  return <div className="Match3TooltipOpponentAction ch-tooltip" style={style} role="tooltip">
    <div className="AbilityName">{tip.title}</div>
    {tip.desc && <div className="AbilityDescription">{tip.desc}</div>}
    {tip.values?.length > 0 && <div id="AbilityValues">{tip.values.map((v) => <div key={v}>{v}</div>)}</div>}
  </div>;
}

// match3_popup_help: every hero with the gem's super (4) and ultra (5+) abilities.
function HelpPopup({ config, valve, onClose }) {
  const value = (v) => (typeof v === 'number' ? Number(v.toFixed(2)) : v);
  const ability = (name, type) => {
    const a = config.abilities[name];
    return <div className="Ability">
      <div className="AbilityImageContainer"><img id="AbilityImage" src={`${IMG}${a.image}.webp`} alt=""/><span className="AbilityType">{valve(type)}</span></div>
      <div className="AbilityDetails">
        <div className="AbilityName">{valve(a.locName)}</div>
        <div className="AbilityDescription">{valve(a.locDesc)}</div>
        <div id="AbilityValues">{tooltipValues(a).map((v) => <div key={v.desc}>{valve(v.desc)}: <span className="GameplayVariable">{value(v.value)}</span></div>)}</div>
      </div>
    </div>;
  };
  return <div className="ch-help-layer" onClick={onClose}>
    <div className="DOTAMatch3PopupHelp" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
      <div className="PopupContents">
        <div className="Title">{valve('DOTA_Match3_HelpTitle')}</div>
        <div id="HeroesList">{config.heroes.map((h) => <div className="Hero" key={h.key}>
          <img id="HeroMovie" src={`${IMG}heroes/selection/${h.unit ? `npc_dota_hero_${h.unit}` : ''}.webp`} alt=""/>
          {ability(h.super, 'DOTA_Match3_HeroAbilityType_Super')}
          <span className="Spacer"/>
          {ability(h.ultra, 'DOTA_Match3_HeroAbilityType_Ultra')}
        </div>)}</div>
      </div>
      <CloseButton onClick={onClose}/>
    </div>
  </div>;
}

// The Winter Wyvern's lines (crownfall act III's visual novel: match3-game-intro, -intro-short, -win, -loss).
function Novel({ novel, valve, onNext }) {
  const key = novel.lines[novel.at];
  return <button type="button" className="ch-novel" onClick={onNext}>
    <img className="ch-novel-portrait" src={`${IMG}novel/wyvern_portrait_idle.webp`} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }}/>
    <span className="ch-novel-box">
      <b>{valve('DOTA_VisualNovel_act3_Actor_WinterWyvern')}</b>
      <span>{valve(`DOTA_VisualNovel_act3_Dialogue_${key}`)}</span>
      <span className="ch-novel-next">{t('Дальше')} ›</span>
    </span>
  </button>;
}

// Valve's HowToPlay: <b>…</b> and <br>.
function rich(text) {
  return String(text).split(/<br\s*\/?>|\n/).map((line, i) => <span key={i} className="ch-line">{line.split(/<b>(.*?)<\/b>/g).map((part, k) => (k % 2 ? <b key={k}>{part}</b> : part))}</span>);
}

function SetupScreen({ valve, config, progress, portraits, click, play, onExit }) {
  const best = bestScore('chess');
  const reached = progress.furthest ?? -1;
  return <div className="SetupScreen">
    <div className="Header">
      <img className="EncounterGraphic" src={`${IMG}hed_graphic_minigame.webp`} alt=""/>
      <div className="Title">{valve('DOTA_Crownfall_EncounterName_Match3')}</div>
    </div>
    <div className="ColumnContainer">
      <div className="Column1">
        <div className="HowToPlaySection">
          <div className="HowToPlayTitle">{valve('DOTA_Crownfall_Fishing_HowToPlay')}</div>
          <div className="HowToPlayDescription">{rich(valve('DOTA_Match3_HowToPlay'))}</div>
          <div className="HowToPlayDescription ch-controls">{t('Тяните самоцвет на соседнюю клетку или щёлкните два соседних. Клавиатура: стрелки, Enter — взять, стрелка — поменять. F9 или Esc — пауза и список способностей.')}</div>
        </div>
        <div className="RewardsLabel">{t('Рубежи')}</div>
        <div id="RewardsList" className="RewardsSection">{REWARDS.map((at) => <div className={`RewardRow HasReward ${best >= at ? 'ch-got' : ''}`} key={at}>
          <span className="RewardScore">{number(at)}</span><span className="RewardValue">{best >= at ? '✓' : ''}</span></div>)}</div>
      </div>
      <div className="Column2">
        <Leaderboard game="chess" className="LeaderboardContainer" headClass="LeaderListHeader" label={valve('DOTA_Crownfall_Fishing_Leaderboard_Score')} format={number} local={best} rows={5}/>
        <div className="ch-campaign">
          <div className="ch-campaign-title">{t('Путь к победе')}</div>
          <ol>{config.levels.map((l) => {
            const def = config.opponents[l.opponent];
            return <li key={l.index} className={`ch-stage ch-${l.kind} ${l.index <= reached ? 'ch-reached' : ''}`}>
              <span className="ch-stage-face"><span style={portraits[l.opponent]}/></span>
              <span className="ch-stage-text"><small>{valve(l.locName)}</small>{valve(def.locName)}</span>
              {l.kind === 'boss' && <span className="ch-stage-boss">{valve('DOTA_Match3_BossBattle')}</span>}
            </li>;
          })}</ol>
        </div>
      </div>
    </div>
    <div className="BottomButtons">
      <CrownfallButton className="StartGameButton GlowButton" onClick={play} sound={click}>{valve('DOTA_Crownfall_Fishing_Play')}</CrownfallButton>
      <CrownfallButton className="ExitButton" onClick={onExit} sound={click}>{valve('DOTA_Crownfall_Encounter_Leave')}</CrownfallButton>
    </div>
  </div>;
}

