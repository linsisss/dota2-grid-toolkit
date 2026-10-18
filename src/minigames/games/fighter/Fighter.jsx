// «Сосулечный боец» (Crownfall act III, Valve's Sleet Fighter, internal `fighting`): bp_popup_crownfall_encounter_fighting
// rebuilt for the browser. The fight is logic.mjs (60 ticks a second on the vdata's frame data), the fighters are
// three.js on Valve's models (render.js) over the tavern stage rendered from the scene maps (scripts/fighter-scene),
// the effects are 2D (fx.js); the menu (bp_crownfall_fighting_game_menu), the HUD and announcements
// (dota_fighting_game_panel) and the move list (dota_fighting_game_movelist_panel) keep Valve's classes, sizes and
// transitions (fighter.css). docs/minigames.md, «Сосулечный боец».
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSounds } from '../../core/sound.js';
import { assetBase, bestScore, loadJSON, loadStrings, saveScore } from '../../core/assets.js';
import { CloseButton, CrownfallButton, Fit, MuteButton, sharedImage } from '../../core/ui.jsx';
import { BoardOutcome, Leaderboard, useRun } from '../../core/leaderboard.jsx';
import {
  BIT, CONVARS, FPS, HERO_INFO, KEY, REWARDS, RULES, aiInput, arcadeContinue, arcadeLevel, arcadeResult, blockClass,
  createAI, createArcade, createMatch, fighterConfig, moveList, roundNumber, skipIntro, startupOf, step,
} from './logic.mjs';
import { PANEL_H, PANEL_W, buildHero, createRenderer, poseOf, preloadHero } from './render.js';
import { createFx } from './fx.js';
import { locale, t } from '../../../../scripts/i18n.mjs';
import { useLanguage } from '../../../useLanguage.js';
import './fighter.css';

const BASE = assetBase('fighter'), IMG = `${BASE}images/`;
const PLAYED_KEY = 'gridstudio.minigames.fighter.played', STATS_KEY = 'gridstudio.minigames.fighter';
// The character select order and the portrait backgrounds of #CharacterSelectButton0…4 (Valve's CSS).
const SELECT = [['tusk', 'vengeful_spirit'], ['bristleback', 'clinkz'], ['vengeful', 'witch_doctor'], ['dawnbreaker', 'witch_doctor'], ['marci', 'tinker']];
// arcade_map_opponent_pos_x/y_0…4 and the start (@define in bp_crownfall_fighting_game_menu.css).
const MAP_POS = [[0.65, 0.3], [0.75, 0.7], [0.5, 0.55], [0.25, 0.4], [0.35, 0.8]], MAP_START = [0.5, 1];
const STRIDE = { length: 48, width: 12 };
const VO = (name) => `announcer_dota_fighter_dota_fighter_${name}`;
const HERO_VO = { bristleback: VO('hero_013_bristleback'), dawnbreaker: VO('hero_023_dawnbreaker'), marci: VO('hero_057_marci'), tusk: VO('hero_110_tusk'), vengeful: VO('hero_114_vengeful_spirit') };
const SND = {
  menu: 'fighting_game.menu_music', intro: 'fighting_game.match_intro', music: 'fighting_game.match_music', victory: 'fighting_game.victory_music',
  fight: 'fighting_game.fight', ko: 'fighting_game.ko', timeout: 'fighting_game.timeout', plane: 'fighting_game.plane',
};
// Shen's two arcana styles (her vdata's m_vecHeroStyles: style 1 first); the other fighters wear their default
// items only (their item-set styles and «Custom» need the Steam inventory).
const STYLES = { vengeful: [{ index: 1, name: 'DOTA_Style_Vengeful_Spirit_Arcana_Style1' }, { index: 0, name: 'DOTA_Style_Vengeful_Spirit_Arcana_Style0' }] };
// Valve's videos (panorama/videos/crownfall/fight_text_*.webm, VP9 with alpha) cannot play with alpha in Safari:
// there the texts are drawn instead.
const VIDEO_ALPHA = typeof navigator === 'undefined' || !/^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

const number = (v) => Math.round(Number(v) || 0).toLocaleString(locale);
const remember = (key, value) => { try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch { /* Not remembered. */ } };
const recall = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const readStats = () => { try { return { wins: 0, matches: 0, clears: 0, ...JSON.parse(recall(STATS_KEY) || '{}') }; } catch { return { wins: 0, matches: 0, clears: 0 }; } };
const rich = (text) => String(text).split(/\n/).map((line, i) => <span key={i} className="fg-line">{line.split(/<b>(.*?)<\/b>/g).map((part, j) => (j % 2 ? <b key={j}>{part}</b> : part))}</span>);

export default function Fighter({ onExit }) {
  useLanguage();
  const [assets, setAssets] = useState(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([loadJSON(`${BASE}data.json`), loadJSON(`${BASE}sounds.json`), loadStrings('fighter'), loadJSON('./assets/minigames/shared/sounds.json').catch(() => ({})), loadJSON(`${IMG}stage/stage.json`)])
      .then(([data, sounds, valve, shared, stage]) => setAssets({ config: fighterConfig(data), sounds: createSounds(BASE, sounds), ui: createSounds('./assets/minigames/shared/', shared), valve, stage }))
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <div className="mg-loading" role="alert">{t('Не удалось загрузить игру. Обнови страницу.')}</div>;
  if (!assets) return <div className="mg-loading" role="status">{t('Загружаем…')}</div>;
  return <FighterPopup assets={assets} onExit={onExit}/>;
}

// ---- input -------------------------------------------------------------------------------------------------------
const P1_KEYS = { KeyA: KEY.LEFT, KeyD: KEY.RIGHT, KeyW: KEY.UP, KeyS: KEY.DOWN, Space: KEY.ATTACK, KeyJ: KEY.ATTACK, AltLeft: KEY.SPECIAL, AltRight: KEY.SPECIAL, KeyK: KEY.SPECIAL };
const ARROWS = { ArrowLeft: KEY.LEFT, ArrowRight: KEY.RIGHT, ArrowUp: KEY.UP, ArrowDown: KEY.DOWN };
const P2_KEYS = { ...ARROWS, Numpad4: KEY.LEFT, Numpad6: KEY.RIGHT, Numpad8: KEY.UP, Numpad5: KEY.DOWN, Numpad2: KEY.DOWN, Numpad0: KEY.ATTACK, Period: KEY.ATTACK, NumpadDecimal: KEY.SPECIAL, Slash: KEY.SPECIAL };
function padKeys(pad) {
  if (!pad) return 0;
  const b = (i) => !!pad.buttons[i]?.pressed, ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
  let k = 0;
  if (b(14) || ax < -0.45) k |= KEY.LEFT;
  if (b(15) || ax > 0.45) k |= KEY.RIGHT;
  if (b(12) || ay < -0.55) k |= KEY.UP;
  if (b(13) || ay > 0.55) k |= KEY.DOWN;
  if (b(0) || b(2)) k |= KEY.ATTACK;
  if (b(1) || b(3)) k |= KEY.SPECIAL;
  return k;
}

function FighterPopup({ assets, onExit }) {
  const { config, sounds, ui, valve, stage } = assets;
  const heroName = useCallback((key) => (HERO_INFO[key].token ? valve(HERO_INFO[key].token) : HERO_INFO[key].name), [valve]);
  // Screens (Valve's DOTAFightingGameMenu classes): menu → CharacterSelect → ArcadeMapScreen → Fighting.
  const [screen, setScreen] = useState('menu');
  const [tab, setTab] = useState(0);
  const [mode, setMode] = useState('arcade'); // arcade | versus (local multiplayer)
  const [pick, setPick] = useState({ cursor: [0, 2], confirmed: [false, false], style: [0, 0], styleStep: [false, false] });
  const [arcade, setArcade] = useState(null);
  const [overlay, setOverlay] = useState(null); // continue | gameover | victory | rematch
  const [paused, setPaused] = useState(false);
  const [best, setBest] = useState(() => bestScore('fighter'));
  const [stats, setStats] = useState(readStats);
  const [loading, setLoading] = useState(false);
  const [breakdown, setBreakdown] = useState(null);
  const [newRecord, setNewRecord] = useState(false), table = useRun('fighter');
  const [mapStage, setMapStage] = useState(0);
  const [matchId, setMatchId] = useState(0);
  const [touch, setTouch] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
  const firstFight = useRef(recall(PLAYED_KEY) !== '1');

  const stateRef = useRef(null), canvasRef = useRef(null), fxRef = useRef(null), bgRef = useRef(null), fgRef = useRef(null), hudRef = useRef({});
  const rendererRef = useRef(null), fxApi = useRef(null), gameRef = useRef(null), aiRef = useRef(null), runRef = useRef(null), heroesRef = useRef([null, null]);
  const videosRef = useRef({}), keysRef = useRef(new Set()), tapsRef = useRef(new Set()), touchRef = useRef(0), musicRef = useRef(null), timers = useRef([]);
  const screenRef = useRef(screen); screenRef.current = screen;
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const pickRef = useRef(pick); pickRef.current = pick;
  const modeRef = useRef(mode); modeRef.current = mode;
  const arcadeRef = useRef(arcade); arcadeRef.current = arcade;
  const overlayRef = useRef(overlay); overlayRef.current = overlay;
  const click = useCallback((name) => ui.play(name), [ui]);
  const cls = useCallback((name, on = true) => stateRef.current?.classList.toggle(name, on), []);
  const later = useCallback((s, fn) => { const id = setTimeout(fn, s * 1000); timers.current.push(id); return id; }, []);
  const clearLater = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  const setMusic = useCallback((name) => {
    if (musicRef.current?.name === name) return;
    musicRef.current?.handle?.stop();
    musicRef.current = name ? { name, handle: sounds.play(name, { loop: name !== SND.victory && name !== SND.intro }) } : null;
  }, [sounds]);

  // ---- the 3D layer: made once, used by the character select and the fight -----------------------------------
  useEffect(() => {
    const renderer = createRenderer(canvasRef.current);
    rendererRef.current = renderer; fxApi.current = createFx(fxRef.current);
    return () => { cancelAnimationFrame(runRef.current?.frame); renderer.dispose(); sounds.stopAll(); ui.stopAll(); clearLater(); };
  }, [sounds, ui, clearLater]);
  useEffect(() => { sounds.preload(Object.values(SND)); }, [sounds]);
  useEffect(() => { if (screen === 'menu' || screen === 'select' || screen === 'map') setMusic(SND.menu); }, [screen, setMusic]);
  useEffect(() => { if (new URLSearchParams(location.search).has('fighterdebug')) window.__fighter = { game: () => gameRef.current, step: (n = 1, keys = [0, 0]) => { for (let i = 0; i < n; i++) handleRef.current(step(gameRef.current, keys)); }, start: (l, r, m) => startRef.current?.(l, r, m), skip: () => skipIntro(gameRef.current), renderer: () => rendererRef.current, overlay: (o, a) => { if (a) setArcade(a); setOverlay(o); } }; }, []);

  // Fighters for a pair of heroes (models load once and are cloned).
  const setFighters = useCallback(async (left, right, styles = [1, 1]) => {
    const r = rendererRef.current;
    setLoading(true);
    try {
      const [a, b] = await Promise.all([buildHero(BASE, left, styles[0]), right ? buildHero(BASE, right, styles[1]) : null]);
      heroesRef.current = [a, b];
      r.setHero(0, a); r.setHero(1, b);
    } finally { setLoading(false); }
  }, []);

  // ---- character select ---------------------------------------------------------------------------------------
  const selectKey = (i) => SELECT[i][0];
  const stylesOf = (key) => STYLES[key] || [{ index: 0, name: 'DOTA_FightingGame_Style_Default' }];
  // The big previews: each side's highlighted hero, posed like the game's hero pick (m_HeroPick_* of the vdata).
  const previewKey = useRef('');
  useEffect(() => {
    if (screen !== 'select') return;
    const p = pick, versus = mode === 'versus';
    const left = selectKey(p.cursor[0]), right = versus ? selectKey(p.cursor[1]) : null;
    const want = `${left}:${p.style[0]}|${right}:${p.style[1]}`;
    if (previewKey.current === want) return;
    previewKey.current = want;
    const s = [stylesOf(left)[p.style[0]]?.index ?? 1, right ? (stylesOf(right)[p.style[1]]?.index ?? 1) : 1];
    setFighters(left, right, s);
  }, [screen, pick, mode, setFighters]);
  // The models load when the select opens (the highlighted fighter first); the menu itself needs none.
  useEffect(() => { if (screen === 'select') for (const [key] of SELECT) preloadHero(BASE, key).catch(() => {}); }, [screen]);

  const startArcadeOrVersus = useRef(null);
  const moveCursor = useCallback((side, d) => {
    setPick((p) => {
      if (p.confirmed[side]) {
        if (!p.styleStep[side]) return p;
        const key = selectKey(p.cursor[side]), n = stylesOf(key).length, style = [...p.style];
        style[side] = (style[side] + d + n) % n; return { ...p, style };
      }
      const cursor = [...p.cursor]; cursor[side] = (cursor[side] + d + SELECT.length) % SELECT.length;
      const style = [...p.style]; style[side] = 0;
      return { ...p, cursor, style };
    });
    click('General.Buttonrollover');
  }, [click]);
  const confirm = useCallback((side) => {
    const p = pickRef.current, key = selectKey(p.cursor[side]);
    if (p.confirmed[side] && !p.styleStep[side]) return;
    const confirmed = [...p.confirmed], styleStep = [...p.styleStep];
    if (!confirmed[side]) {
      confirmed[side] = true;
      // ConfirmHero, then ConfirmStyle — when the hero has more than one style here.
      styleStep[side] = stylesOf(key).length > 1;
      sounds.play(HERO_VO[key]);
      cls('fg-confirmed-flash', false); void stateRef.current?.offsetWidth; cls('fg-confirmed-flash');
    } else styleStep[side] = false;
    const next = { ...p, confirmed, styleStep };
    setPick(next);
    click('General.ButtonClick');
    const versus = modeRef.current === 'versus';
    const done = (s) => next.confirmed[s] && !next.styleStep[s];
    if (done(0) && (!versus || done(1))) later(0.6, () => startArcadeOrVersus.current?.(next));
  }, [click, cls, later, sounds]);
  const back = useCallback((side = 0) => {
    const p = pickRef.current;
    if (p.confirmed[side]) { const confirmed = [...p.confirmed], styleStep = [...p.styleStep]; confirmed[side] = false; styleStep[side] = false; setPick({ ...p, confirmed, styleStep }); return; }
    setScreen('menu'); rendererRef.current?.setHero(0, null); rendererRef.current?.setHero(1, null); previewKey.current = '';
  }, []);
  const openSelect = useCallback((m) => {
    setMode(m); setPick({ cursor: [0, 2], confirmed: [false, false], style: [0, 0], styleStep: [false, false] }); previewKey.current = '';
    setOverlay(null); setScreen('select');
  }, []);

  // ---- the fight loop ----------------------------------------------------------------------------------------------
  const handleRef = useRef(() => {});
  const paintHud = useCallback((game) => {
    const h = hudRef.current;
    game.fighters.forEach((f, i) => {
      const s = h[i]; if (!s?.hp || !s.mid || !s.shield) return;
      const hp = f.hp / RULES.maxHp;
      s.hp.style.width = `${hp * 100}%`;
      // HPBarMID: the lost health stays white for half a second, then drains to the bar.
      if (s.lastHp === undefined || hp > s.mid.v) { s.mid.v = hp; s.since = 0; }
      if (hp < (s.lastHp ?? hp)) s.since = 0; else s.since = (s.since || 0) + 1;
      if (s.since > 30) s.mid.v = Math.max(hp, s.mid.v - 0.012);
      s.lastHp = hp;
      s.mid.style.width = `${s.mid.v * 100}%`;
      s.shield.style.width = `${f.guard / RULES.maxGuard * 100}%`;
      cls(`P${i + 1}HealthLow`, hp <= 0.25 && hp > 0);
      cls(`P${i + 1}ShieldBroken`, f.guardBroken);
      cls(`P${i + 1}RoundWins1`, f.roundWins === 1); cls(`P${i + 1}RoundWins2`, f.roundWins >= 2);
      if (s.single) {
        const act = Object.values(f.hero.actions).find((a) => a.singleUse);
        s.single.classList.toggle('HasSingleUseAction', !!act);
        s.single.classList.toggle('SingleUseActionUnavailable', !!act && f.used.has(act.id));
      }
    });
    if (h.timer) { const sec = Math.max(0, Math.ceil(game.timer / FPS)); if (h.timer.textContent !== String(sec)) h.timer.textContent = String(sec); cls('TimerLow', sec <= 5 && game.phase === 'fight'); }
    if (h.round) h.round.textContent = valve('DOTA_FightingGame_HUD_RoundCounter', { round_number: roundNumber(game) });
    if (h.score) h.score.textContent = number((arcadeRef.current?.score || 0) + game.bonus);
  }, [cls, valve]);

  const announce = useCallback((side, kind, text) => {
    const el = hudRef.current.announce?.[side]?.[kind];
    if (el && text !== undefined) el.querySelector('.fg-points, .ComboCount').textContent = text;
    const name = `P${side + 1}Show${kind}`;
    cls(name, false); void stateRef.current?.offsetWidth; cls(name);
    clearTimeout(hudRef.current[`t${name}`]);
    hudRef.current[`t${name}`] = setTimeout(() => cls(name, false), CONVARS.scoreAnnouncementDuration * 1000);
  }, [cls]);

  const playVideo = useCallback((name) => {
    const v = videosRef.current[name];
    if (!v || !VIDEO_ALPHA) { cls(`fg-text-${name}`, false); void stateRef.current?.offsetWidth; cls(`fg-text-${name}`); later(3, () => cls(`fg-text-${name}`, false)); return; }
    try { v.currentTime = 0; v.play().catch(() => {}); } catch { /* Not ready. */ }
  }, [cls, later]);

  const panelOf = (game, x, y) => rendererRef.current.toPanel(x, y);
  handleRef.current = (events) => {
    const game = gameRef.current, fx = fxApi.current, single = modeRef.current !== 'versus';
    for (const e of events) {
      switch (e.type) {
        case 'intro': {
          ['MatchStateIntro'].forEach((c) => cls(c));
          setMusic(SND.intro);
          const [a, b] = game.fighters;
          later(0.5, () => sounds.play(HERO_VO[a.hero.key])); later(1.9, () => sounds.play(VO('versus'))); later(2.8, () => sounds.play(HERO_VO[b.hero.key]));
          break;
        }
        case 'preRound':
          for (const c of ['MatchStateIntro', 'KOHappening', 'Perfect', 'TimeOutHappening', 'MatchStateRoundInProgress']) cls(c, false);
          fx.clear(); break;
        case 'roundStart': {
          cls(`MatchStateRound${Math.min(3, e.round)}Start`); cls('ShowMovie');
          playVideo(`round${Math.min(3, e.round)}`);
          sounds.play(e.final ? VO('round_final') : VO(`round_0${Math.min(3, e.round)}`));
          later(3.2, () => { for (const n of [1, 2, 3]) cls(`MatchStateRound${n}Start`, false); cls('ShowMovie', false); });
          break;
        }
        case 'fightCall': sounds.play(VO('fight_01')); sounds.play(SND.fight); break;
        case 'fight': cls('MatchStateRoundInProgress'); if (musicRef.current?.name !== SND.music) setMusic(SND.music); break;
        case 'action': {
          if (e.sound) sounds.play(e.sound);
          const f = game.fighters[e.side];
          if (e.id === 'LUMINOSITY') { const [x, y] = panelOf(game, f.x, 300); fx.spawn('luminosity', x, y); }
          break;
        }
        case 'particle': {
          const f = game.fighters[e.side], [x, y] = panelOf(game, f.x + f.facing * (e.offset?.[0] || 0), 300 - (e.offset?.[1] || 0) * 0);
          if (/quill/.test(e.particle || '')) fx.spawn('quills', x, y - 40);
          else if (/starbreaker/.test(e.particle || '')) fx.spawn('starbreaker', x + f.facing * 120, y, { dir: f.facing });
          else if (/luminosity/.test(e.particle || '')) fx.spawn('starbreaker', x + f.facing * 120, y, { dir: f.facing });
          break;
        }
        case 'hit': {
          if (e.sound) sounds.play(e.sound);
          const [x, y] = panelOf(game, e.x, e.y), att = game.fighters[e.side];
          fx.spawn('hit', x, y, { shake: e.shake, dir: att.facing, color: e.special ? [255, 190, 110] : undefined });
          if (e.combo >= 2) announce(e.side, 'ComboCounter', String(e.combo));
          break;
        }
        case 'block': { const [x, y] = panelOf(game, e.x, e.y); fx.spawn('block', x, y, { dir: game.fighters[e.side].facing }); break; }
        case 'guardBreak': { const [x, y] = panelOf(game, e.x, e.y); fx.spawn('guardBreak', x, y); sounds.play('Hero_Tusk.Snowball.Stun.Small'); break; }
        case 'clash': { const [x, y] = panelOf(game, e.x, e.y); fx.spawn('clash', x, y); break; }
        case 'heal': { const f = game.fighters[e.side], [x, y] = panelOf(game, f.x, 200); fx.spawn('heal', x, y); break; }
        case 'install': { const f = game.fighters[e.side], [x, y] = panelOf(game, f.x, 300); fx.spawn('unleash', x, y); sounds.play(f.act.hitSound || 'Hero_Marci.Unleash.Cast'); break; }
        case 'swap': game.fighters.forEach((f) => { const [x, y] = panelOf(game, f.x, 300); fx.spawn('swap', x, y); }); break;
        case 'announce': {
          const pts = single && e.side === 0 && !game.firstFight ? valve(`DOTA_FightingGame_HUD_${e.kind === 'FirstBlood' ? 'FirstBlood' : e.kind === 'CounterHit' ? 'CounterHit' : 'PunishCounter'}Points`, { first_blood_points: e.points, counter_hit_points: e.points, punish_points: e.points }) : '';
          announce(e.side, e.kind === 'PunishCounter' ? 'Punish' : e.kind, pts);
          break;
        }
        case 'ko': {
          const loser = game.fighters[1 - e.side], [x, y] = panelOf(game, loser.x, 300);
          fx.spawn('ko', x, y);
          cls('KOHappening'); cls('Perfect', !!e.perfect);
          playVideo(e.perfect ? 'perfect' : 'ko');
          sounds.play(VO('ko_01')); sounds.play(SND.ko);
          break;
        }
        case 'timeOut': cls('TimeOutHappening'); sounds.play(SND.timeout); break;
        case 'roundEnd': break;
        case 'matchEnd': {
          for (const c of ['KOHappening', 'Perfect', 'TimeOutHappening', 'MatchStateRoundInProgress']) cls(c, false);
          cls('MatchStateMatchEnd'); cls(e.winner === 0 ? 'P0WonMatch' : e.winner === 1 ? 'P1WonMatch' : 'DrewMatch');
          setMusic(null);
          if (single) sounds.play(e.winner === 0 ? VO('victory_01') : VO('lose_01')); else sounds.play(VO('victory_01'));
          if (e.winner !== null) sounds.play(SND.victory);
          if (single && !game.firstFight) setBreakdown({ ...e.result, total: (arcadeRef.current?.score || 0) + e.result.subtotal });
          break;
        }
        case 'done': later(0.2, () => matchDone(game)); break;
        default:
      }
    }
  };

  // After a match: the arcade's next step, or the rematch of a local fight.
  const matchDone = useCallback((game) => {
    const st = readStats();
    st.matches++; if (game.winner === 0) st.wins++;
    if (modeRef.current === 'versus') { remember(STATS_KEY, st); setStats(st); setOverlay('rematch'); return; }
    remember(PLAYED_KEY, '1'); firstFight.current = false;
    const a = { ...arcadeRef.current };
    const next = arcadeResult(a, game.result);
    if (a.over && a.won) st.clears++;
    remember(STATS_KEY, st); setStats(st);
    setArcade(a);
    if (next === 'next' && !a.over) { setMapStage(a.stage); setBreakdown(null); goMap(a); return; }
    if (a.over) {
      table.submit({ score: Math.round(a.score), stats: { stage: a.defeated?.length ?? 0, won: !!a.won } });
      const record = saveScore('fighter', Math.round(a.score));
      if (record) setBest(Math.round(a.score));
      setNewRecord(record);
      setOverlay(a.won ? 'victory' : 'gameover');
      if (a.won) setMusic(SND.victory);
      return;
    }
    setOverlay('continue');
  }, [setMusic, table.submit]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRun = useCallback(() => { if (runRef.current) cancelAnimationFrame(runRef.current.frame); runRef.current = null; }, []);
  const clearFightClasses = useCallback(() => {
    const el = stateRef.current; if (!el) return;
    for (const c of [...el.classList]) if (/^(MatchState|KOHappening|Perfect|TimeOutHappening|P\d(Won|Show|Health|Shield|RoundWins)|DrewMatch|ShowMovie|TimerLow|fg-text-)/.test(c)) el.classList.remove(c);
    for (const v of Object.values(videosRef.current)) { try { v.pause(); v.currentTime = 0; } catch { /* Not loaded. */ } }
  }, []);

  // Draws a frame: the heroes (interpolated between ticks), the stage panning with the fight, the effects, the HUD.
  const draw = useCallback((alpha, dt, now) => {
    const game = gameRef.current, r = rendererRef.current;
    if (!r) return;
    if (game) {
      const run = runRef.current, prev = run?.prev || [game.fighters[0].x, game.fighters[1].x, game.camera];
      const lerp = (a, b) => a + (b - a) * alpha;
      const sh = game.shake, k = sh ? sh.frames / CONVARS.camShakeDuration : 0, wob = () => (Math.random() * 2 - 1) * k;
      const shake = sh ? [sh.x * CONVARS.camShakeOrtho * wob(), sh.y * CONVARS.camShakeOrtho * wob()] : [0, 0];
      const camera = lerp(prev[2], game.camera);
      const fighters = game.fighters.map((f, i) => {
        // A fighter in hitstop shakes on the spot.
        const jitter = f.hitstop > 0 && f.act.id === 'HITSTUN' ? (Math.random() * 2 - 1) * 6 : 0;
        return { x: lerp(prev[i], f.x) + jitter, facing: f.facing, pose: poseOf(f, f.hitstop > 0 ? 0 : alpha, now / 1000), flash: f.flash > 0 ? f.flash / 8 : 0, visible: true };
      });
      r.draw({ camera, shake, fighters, shadows: true }, dt);
      const pan = stage.pan / (CONVARS.stageWidth / 2 - CONVARS.camWidth / 2);
      if (bgRef.current) bgRef.current.style.transform = `translate(${-stage.pan - camera * pan + shake[0] * CONVARS.camShakeBg / CONVARS.camShakeOrtho}px, ${shake[1] * CONVARS.camShakeBg / CONVARS.camShakeOrtho}px)`;
      if (fgRef.current) fgRef.current.style.transform = `translate(${-stage.pan - camera * 1.25 + shake[0] * 0.6}px, ${shake[1] * 0.6}px)`;
      const fx = fxApi.current, projectiles = game.projectiles.map((p) => { const [px, py] = r.toPanel(p.x, 300); return { px, py: p.act.hit[3] < -100 ? py - 60 : py, dir: p.dir, hero: game.fighters[p.side].hero.key }; });
      const auras = [];
      game.fighters.forEach((f) => {
        const [x, top] = r.toPanel(f.x, 560), [, bottom] = r.toPanel(f.x, 0);
        if (f.install > 0) auras.push({ kind: 'unleash', x, top, bottom });
        if (f.amp > 0) auras.push({ kind: 'goo', x, top, bottom });
        if (f.guardBroken) auras.push({ kind: 'broken', x, top, bottom });
      });
      fx.draw(dt, { time: now / 1000, projectiles, auras });
      paintHud(game);
    } else if (screenRef.current === 'select') {
      // The character select: the heroes large at the sides (Valve's LargeHeroPreview), idling.
      const p = pickRef.current, versus = modeRef.current === 'versus';
      const fighters = [0, 1].map((side) => {
        const key = selectKey(p.cursor[side]), hero = config.heroes[key], pk = hero.pick;
        const f = { act: hero.actions.IDLE, t: 0, install: 0, hero, walk: 0, guarding: false };
        const left = side === 0;
        return { x: left ? -640 + pk.xLeft * 2 : 640 - pk.xRight * 2, y: -40 + pk.height, facing: left ? 1 : -1, scale: 1.05 * pk.scale, yaw: (left ? pk.angleLeft : pk.angleRight) * Math.PI / 180 * 0.3, pose: poseOf(f, 0, now / 1000), visible: left || versus };
      });
      r.draw({ camera: 0, fighters, shadows: false }, dt);
    }
  }, [config, paintHud, stage]);

  // One loop for the whole popup: in a fight it runs the ticks; in the select it just draws.
  useEffect(() => {
    let frame = 0, last = performance.now();
    const loop = () => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      const run = runRef.current, game = gameRef.current;
      if (run && game && !pausedRef.current) {
        run.acc += dt;
        let n = 0;
        while (run.acc >= 1 / FPS && n < 6) {
          run.acc -= 1 / FPS; n++;
          run.prev = [game.fighters[0].x, game.fighters[1].x, game.camera];
          const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
          const versus = modeRef.current === 'versus';
          let k1 = 0, k2 = 0;
          // Keys down now, and keys pressed and let go since the last tick (a tap shorter than a frame still counts).
          for (const code of new Set([...keysRef.current, ...tapsRef.current])) { k1 |= P1_KEYS[code] || (!versus ? ARROWS[code] || 0 : 0); if (versus) k2 |= P2_KEYS[code] || 0; }
          tapsRef.current.clear();
          k1 |= touchRef.current | padKeys(pads[0]);
          if (versus) k2 |= padKeys(pads[1]); else if (aiRef.current && !window.__fighterIdleCpu) k2 = aiInput(game, aiRef.current);
          handleRef.current(step(game, [k1, k2]));
        }
        if (run.acc > 1 / FPS) run.acc = 0;
      }
      if (screenRef.current === 'fight' || screenRef.current === 'select') draw(run ? run.acc * FPS : 0, dt, now);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  // Starts a match (arcade: against the stage's opponent; versus: the two picks).
  const startMatch = useCallback(async (left, right, { styles = [1, 1], level = null } = {}) => {
    clearLater(); clearFightClasses(); setOverlay(null); setBreakdown(null); setPaused(false); setNewRecord(false);
    const versus = modeRef.current === 'versus';
    await setFighters(left, right, styles);
    const game = createMatch(config, { left, right, seed: Date.now() & 0xffff, single: !versus, firstFight: !versus && firstFight.current, aiLevel: level });
    gameRef.current = game;
    aiRef.current = versus ? null : createAI(game, 1, level || 'MEDIUM', Date.now() & 0xffff);
    hudRef.current = {};
    cls('SinglePlayer', !versus); cls('FirstFight', !versus && firstFight.current); cls('LocalMultiplayer', versus);
    fxApi.current?.clear();
    setMatchId((n) => n + 1);
    setScreen('fight');
    runRef.current = { acc: 0, prev: null };
  }, [config, setFighters, clearLater, clearFightClasses, cls]);
  const startRef = useRef(null); startRef.current = startMatch;

  // The arcade map (ArcadeMapScreen): the floorplan, the opponents, footsteps to the next one; then the fight.
  const goMap = useCallback((a) => {
    gameRef.current = null; stopRun(); clearFightClasses();
    setScreen('map'); sounds.play(SND.plane);
    if (a.stage === a.opponents.length - 1) later(0.8, () => sounds.play(VO('challenger_01')));
    later(CONVARS.matchEnd / 60 + 1.2, () => {
      const opp = a.opponents[a.stage];
      // The counterpart of the mirror match wears the other style when there is one.
      const styles = [stylesOf(a.hero)[pickRef.current.style[0]]?.index ?? 1, opp === a.hero && STYLES[opp] ? (stylesOf(a.hero)[pickRef.current.style[0]]?.index === 1 ? 0 : 1) : 1];
      startMatch(a.hero, opp, { styles, level: arcadeLevel(a) });
    });
  }, [stopRun, clearFightClasses, sounds, later, startMatch]);

  startArcadeOrVersus.current = (p) => {
    const left = selectKey(p.cursor[0]);
    if (modeRef.current === 'versus') {
      const right = selectKey(p.cursor[1]);
      startMatch(left, right, { styles: [stylesOf(left)[p.style[0]]?.index ?? 1, stylesOf(right)[p.style[1]]?.index ?? 1] });
      return;
    }
    const a = createArcade(left, Date.now());
    setArcade(a); setMapStage(0); table.start('arcade');
    goMap(a);
  };

  const toMenu = useCallback(() => {
    clearLater(); stopRun(); clearFightClasses(); gameRef.current = null; aiRef.current = null;
    rendererRef.current?.setHero(0, null); rendererRef.current?.setHero(1, null); previewKey.current = '';
    fxApi.current?.clear(); setPaused(false); setOverlay(null); setBreakdown(null); setArcade(null); setScreen('menu');
  }, [clearLater, stopRun, clearFightClasses]);

  const continueArcade = useCallback(() => {
    const a = { ...arcadeRef.current }; arcadeContinue(a); setArcade(a); setOverlay(null); goMap(a);
  }, [goMap]);
  const quitArcade = useCallback(() => {
    const a = { ...arcadeRef.current, over: true };
    table.submit({ score: Math.round(a.score), stats: { stage: a.defeated?.length ?? 0, won: false } });
    const record = saveScore('fighter', Math.round(a.score));
    if (record) setBest(Math.round(a.score));
    setNewRecord(record); setArcade(a); setOverlay('gameover');
  }, []);
  const rematch = useCallback(() => { const g = gameRef.current; if (g) startMatch(g.fighters[0].hero.key, g.fighters[1].hero.key, { styles: heroesRef.current.map((h) => h?.style ?? 1) }); }, [startMatch]);

  // ---- keys ------------------------------------------------------------------------------------------------------
  useEffect(() => {
    const down = (event) => {
      if (event.target.closest?.('input, textarea')) return;
      const code = event.code, sc = screenRef.current;
      if (code === 'Escape' || code === 'F9' || (code === 'KeyP' && sc === 'fight')) {
        event.preventDefault();
        if (sc === 'menu') { if (code === 'Escape') onExit(); return; }
        if (sc === 'select') { back(0); return; }
        if (sc === 'fight') {
          const g = gameRef.current;
          if (g && g.phase !== 'done' && !overlayRef.current) setPaused((v) => !v);
          else if (overlayRef.current && code === 'Escape') toMenu();
        }
        return;
      }
      if (P1_KEYS[code] || ARROWS[code] || P2_KEYS[code] || code === 'Enter') event.preventDefault();
      if (event.repeat) return;
      keysRef.current.add(code); tapsRef.current.add(code);
      if (sc === 'fight' && gameRef.current?.phase === 'intro' && (P1_KEYS[code] === KEY.ATTACK || code === 'Enter')) skipIntro(gameRef.current);
      if (sc === 'select') {
        const versus = modeRef.current === 'versus';
        if (code === 'KeyA' || (!versus && code === 'ArrowLeft')) moveCursor(0, -1);
        else if (code === 'KeyD' || (!versus && code === 'ArrowRight')) moveCursor(0, 1);
        else if (code === 'Space' || code === 'KeyJ' || (!versus && code === 'Enter')) confirm(0);
        else if (versus && (code === 'ArrowLeft' || code === 'Numpad4')) moveCursor(1, -1);
        else if (versus && (code === 'ArrowRight' || code === 'Numpad6')) moveCursor(1, 1);
        else if (versus && (code === 'Numpad0' || code === 'Period' || code === 'Enter' || code === 'NumpadEnter')) confirm(1);
      }
    };
    const up = (event) => { keysRef.current.delete(event.code); if (event.key === 'Alt') event.preventDefault(); };
    const blur = () => { keysRef.current.clear(); touchRef.current = 0; const g = gameRef.current; if (g && screenRef.current === 'fight' && g.phase === 'fight' && !overlayRef.current) setPaused(true); };
    const vis = () => { if (document.hidden) blur(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', vis); };
  }, [onExit, back, moveCursor, confirm, toMenu]);
  // Gamepads outside the fight: Start pauses; in the select the cross or stick moves, A confirms, B goes back;
  // on the menu A fights.
  useEffect(() => {
    let frame = 0, was = [0, 0];
    const poll = () => {
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
      const sc = screenRef.current;
      pads.slice(0, 2).forEach((pad, i) => {
        const b = (n) => !!pad.buttons[n]?.pressed, ax = pad.axes[0] || 0;
        const now = (b(9) ? 1 : 0) | (b(14) || ax < -0.6 ? 2 : 0) | (b(15) || ax > 0.6 ? 4 : 0) | (b(0) ? 8 : 0) | (b(1) ? 16 : 0);
        const hit = now & ~was[i];
        was[i] = now;
        if (!hit) return;
        if (hit & 1 && sc === 'fight' && gameRef.current?.phase !== 'done' && !overlayRef.current) setPaused((v) => !v);
        const side = modeRef.current === 'versus' ? i : 0;
        if (sc === 'select') {
          if (hit & 2) moveCursor(side, -1);
          if (hit & 4) moveCursor(side, 1);
          if (hit & 8) confirm(side);
          if (hit & 16) back(side);
        } else if (sc === 'menu' && hit & 8 && i === 0) openSelect('arcade');
        else if (sc === 'fight' && hit & 8 && gameRef.current?.phase === 'intro') skipIntro(gameRef.current);
      });
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, [moveCursor, confirm, back, openSelect]);
  useEffect(() => { cls('Paused', paused); }, [paused, cls]);

  const menuClass = { menu: '', select: 'CharacterSelect', map: 'ArcadeMapScreen', fight: 'Fighting' }[screen];
  const classes = ['fg-popup', 'PopupPanel', 'FightingGame', menuClass, `SelectedTab${tab}`, screen === 'fight' && 'fg-fighting',
    overlay === 'continue' && 'ArcadeContinue', overlay === 'gameover' && 'ArcadeGameOver', overlay === 'victory' && 'ArcadeVictory', overlay === 'rematch' && 'OnlineRematch',
    newRecord && 'NewHighScoreEarned', mode === 'versus' && 'LocalMultiplayer', pick.confirmed[0] && 'ConfirmedHero', pick.confirmed[0] && !pick.styleStep[0] && 'ConfirmedStyle',
    pick.confirmed[1] && 'ConfirmedHero2', pick.confirmed[1] && !pick.styleStep[1] && 'ConfirmedStyle2', pick.styleStep[0] && 'ShowStyleSelectLeft', pick.styleStep[1] && 'ShowStyleSelectRight',
    mode !== 'versus' && 'HideRightCharacter', touch && 'fg-touch', !VIDEO_ALPHA && 'fg-no-video'].filter(Boolean).join(' ');
  const game = gameRef.current;

  return <Fit className="fg-fit">
    <div className={classes} onContextMenu={(e) => e.preventDefault()} onPointerDown={(e) => { if (e.pointerType === 'touch' && !touch) setTouch(true); }}>
      <div className="fg-state" ref={stateRef}>
        {/* DOTAFightingGamePanel: the stage, the fighters, the foreground, the effects, the HUD. */}
        <div className="fg-panel">
          <div className="fg-stage"><img ref={bgRef} className="fg-background" src={`${IMG}stage/background.webp`} alt="" draggable="false"/></div>
          <canvas ref={canvasRef} className="fg-heroes" width={PANEL_W} height={PANEL_H}/>
          <div className="fg-stage fg-stage-front"><img ref={fgRef} className="fg-foreground" src={`${IMG}stage/foreground.webp`} alt="" draggable="false" style={{ left: stage.foreground.left, top: stage.foreground.top, width: stage.foreground.width, height: stage.foreground.height }}/></div>
          <canvas ref={fxRef} className="fg-fx" width={PANEL_W} height={PANEL_H}/>
          {screen === 'fight' && game && <Hud key={`h${matchId}`} valve={valve} game={game} hudRef={hudRef} heroName={heroName} single={mode !== 'versus'}/>}
          {screen === 'fight' && game && <Announcements key={`a${matchId}`} valve={valve} game={game} heroName={heroName} hudRef={hudRef} videosRef={videosRef} breakdown={breakdown}/>}
          {screen === 'fight' && game && <Pause key={`p${matchId}`} valve={valve} game={game} config={config} heroName={heroName} onQuit={toMenu} onResume={() => setPaused(false)} sound={click} versus={mode === 'versus'}/>}
          {screen === 'fight' && <div className="PauseHint"><div className="PauseLabelContainer"><span className="PauseLabel">{valve('DOTA_FightingGame_HUD_Pause')}</span><span className="UnPauseLabel">{valve('DOTA_FightingGame_HUD_UnPause')}</span></div><button type="button" className="ControlKey" onClick={() => { if (gameRef.current?.phase !== 'done' && !overlay) setPaused((v) => !v); }}><span className="KeyText">F9</span></button></div>}
          {screen === 'fight' && <ControlsDisplay/>}
        </div>
        {/* DOTAFightingGameMenu */}
        {screen !== 'fight' && <MenuBackground/>}
        {screen === 'menu' && <FrontPage valve={valve} tab={tab} setTab={setTab} best={best} stats={stats} sound={click} onFight={() => openSelect('arcade')} onLocal={() => openSelect('versus')}/>}
        {screen === 'select' && <CharacterSelect valve={valve} pick={pick} mode={mode} heroName={heroName} onHover={(side, i) => setPick((p) => (p.confirmed[side] ? p : { ...p, cursor: Object.assign([...p.cursor], { [side]: i }), style: Object.assign([...p.style], { [side]: 0 }) }))}
          onConfirm={confirm} onStyle={(side, i) => setPick((p) => ({ ...p, style: Object.assign([...p.style], { [side]: i }) }))} onBack={() => back(0)} sound={click} loading={loading} stylesOf={stylesOf}/>}
        {screen === 'map' && arcade && <ArcadeMap valve={valve} arcade={arcade} stage={mapStage} heroName={heroName}/>}
        {overlay && <Outcome valve={valve} overlay={overlay} arcade={arcade} best={best} outcome={table.outcome} sound={click} onContinue={continueArcade} onQuit={quitArcade} onMenu={toMenu} onRematch={rematch}/>}
        {touch && screen === 'fight' && <TouchControls touchRef={touchRef}/>}
        <CloseButton mode={screen === 'menu' ? 'close' : 'return'} onClick={screen === 'menu' ? onExit : toMenu} label={screen === 'menu' ? t('Закрыть') : t('В меню игры')}/>
        <div className="fg-corner"><MuteButton/></div>
      </div>
    </div>
  </Fit>;
}

// ---- the menu ------------------------------------------------------------------------------------------------------
function MenuBackground() {
  return <div className="fg-menu-bg"><div id="MenuBackgroundScene"/><img className="KeyArt" src={`${IMG}sleetfighter_titlescreen_art.webp`} alt=""/></div>;
}

// FrontPageContents: the logo, the tabs «Сюжет» / «Сетевая игра», the story section (controls, rewards, the best
// score of this browser where Valve has the friends' leaderboard) and «В БОЙ!».
function FrontPage({ valve, tab, setTab, best, stats, sound, onFight, onLocal }) {
  return <div className="FrontPageContents">
    <img className="IntroLogo" src={`${IMG}crownfall_fighting_title_screen.webp`} alt={valve('DOTA_Crownfall_Archive_Minigame_SleetFighter')}/>
    <div className="FightingGameTabs"><div className="FightingGameTabsBackground"/>
      <div className="TabsContainer" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 0} id="OfflineTab" className="TabItem" onClick={() => { setTab(0); sound('General.ButtonClick'); }}><span className="TabItemBg"/><span>{valve('DOTA_FightingGame_Menu_StoryMode')}</span></button>
        <button type="button" role="tab" aria-selected={tab === 1} id="OnlineTab" className="TabItem" onClick={() => { setTab(1); sound('General.ButtonClick'); }}><span className="TabItemBg"/><span>{valve('DOTA_FightingGame_Menu_Multiplayer')}</span></button>
      </div>
    </div>
    <div className="FrontPageSectionsContainer">
      <div className="PlayOfflineSection">
        <p className="IntroText">{valve('DOTA_FightingGame_Menu_Title')}</p>
        <div className="Columns">
          <div className="ColumnLeft">
            <h3>{valve('DOTA_FightingGame_Menu_Controls')}</h3>
            <p className="fg-controls-text">{rich(valve('DOTA_FightingGame_Menu_Controls_Text'))}</p>
            <p className="fg-controls-more">{t('Или стрелки, J — атака, K — способность. Пауза и приёмы — F9 или Esc.')}</p>
            <div className="fg-stats"><span>{t('Победы в боях')}</span><b>{number(stats.wins)}</b><span>{t('Пройдено сюжетов')}</span><b>{number(stats.clears)}</b></div>
          </div>
          <div className="ColumnRight">
            <h3>{valve('DOTA_FightingGame_Menu_Rewards')}</h3>
            <div className="RewardsSection">{REWARDS.map((r) => <div key={r} className={`RewardRow ${best >= r ? 'Unlocked' : ''}`}><span className="RewardScore">{number(r)}</span><span className="RewardValue">{best >= r ? '✓' : ''}</span></div>)}</div>
            <Leaderboard game="fighter" className="fg-board" label={valve('DOTA_FightingGame_HUD_Score')} format={number} rows={3}/>
          </div>
        </div>
        <div className="MyHighScore"><div className="TitleContainer"><span className="Dash Left"/><span className="fg-gold">{valve('DOTA_FightingGame_Menu_MyHighScore')}</span><span className="Dash Right"/></div>
          <div className="HighScore">{number(best)}</div></div>
      </div>
      <div className="PlayOnlineSection">
        <div className="ChallengeFriendsLabel">{valve('DOTA_FightingGame_Menu_ChallengeText')}</div>
        <div className="ChallengeListContainer"><span className="NoPeersLabel">{valve('DOTA_FightingGame_Menu_NoPeers')}</span>
          <span className="fg-local-note">{t('Вдвоём за одной клавиатурой: первый — WASD, пробел и Alt; второй — стрелки, «.» (или Num 0) и «/» (или Num .). Геймпады тоже подходят.')}</span></div>
        <CrownfallButton className="PlayLocalMultiplayer" onClick={onLocal} sound={sound}>{valve('DOTA_FightingGame_Menu_LocalMultiplayer')}</CrownfallButton>
      </div>
      <div className="TopGoldDash Top"/><div className="TopGoldDash Bottom"/>
    </div>
    <CrownfallButton className="PlayButton" onClick={onFight} sound={sound}>{valve('DOTA_FightingGame_Menu_Fight')}</CrownfallButton>
  </div>;
}

// CharacterSelectContents: the logo, «Выберите бойца», five cards, the big previews (the 3D layer under it),
// the style selector, back and confirm.
function CharacterSelect({ valve, pick, mode, heroName, onHover, onConfirm, onStyle, onBack, sound, loading, stylesOf }) {
  const versus = mode === 'versus';
  const styleBox = (side) => {
    const key = SELECT[pick.cursor[side]][0], styles = stylesOf(key);
    return <div className={`StyleSelector ${side ? 'Right' : 'Left'}`}>
      <div className="StyleSelectorTitle">{valve('DOTA_FightingGame_Menu_StyleSelect')}</div>
      <div className="RadioGroupContainer">{styles.map((s, i) => <button type="button" key={s.name} className={`fg-radio ${pick.style[side] === i ? 'on' : ''}`} aria-label={valve(s.name)} onClick={() => { onStyle(side, i); sound('General.ButtonClick'); }}/>)}</div>
      <div className="fg-style-name">{valve(styles[pick.style[side]]?.name || 'DOTA_FightingGame_Style_Default')}</div>
    </div>;
  };
  const confirmBox = (side) => <div className={`ConfirmCharacterButtonContainer ${side ? 'LocalPlayer2' : ''}`}>
    {!pick.confirmed[side] && <CrownfallButton className="GlowButton" onClick={() => onConfirm(side)} sound={sound}>{valve('DOTA_FightingGame_Menu_ConfirmHero')}</CrownfallButton>}
    {pick.confirmed[side] && pick.styleStep[side] && <CrownfallButton className="GlowButton" onClick={() => onConfirm(side)} sound={sound}>{valve('DOTA_FightingGame_Menu_ConfirmStyle')}</CrownfallButton>}
    {pick.confirmed[side] && !pick.styleStep[side] && <span className={`LockedInText${side + 1}`}>{valve('DOTA_FightingGame_WaitingOpponent')}</span>}
  </div>;
  return <div className="CharacterSelectContents">
    <div className="Background">
      <div className="HeroPreview Left"><span id="LeftHeroName">{heroName(SELECT[pick.cursor[0]][0])}</span></div>
      {versus && <div className="HeroPreview Right"><span id="RightHeroName">{heroName(SELECT[pick.cursor[1]][0])}</span></div>}
      {styleBox(0)}{versus && styleBox(1)}
    </div>
    <img className="TitleLogo" src={`${IMG}crownfall_fighting_title_screen.webp`} alt=""/>
    <div className="Top"><img className="TimerBackground" src={`${IMG}timer_background.webp`} alt=""/><div className="ChooseFighterText">{valve('DOTA_FightingGame_Menu_ChooseYourFighter')}</div></div>
    <div id="CharacterSelectList">
      {SELECT.map(([key, bg], i) => {
        const p1 = pick.cursor[0] === i, p2 = versus && pick.cursor[1] === i;
        return <button type="button" key={key} className={`CharacterSelectButton ${p1 ? 'Player1' : ''} ${p2 ? 'Player2' : ''}`} style={{ transitionDelay: `${0.4 + i * 0.1}s` }}
          onMouseEnter={() => { if (!pick.confirmed[0]) { onHover(0, i); sound('General.Buttonrollover'); } }} onClick={() => { if (!pick.confirmed[0]) { onHover(0, i); onConfirm(0); } else if (versus && !pick.confirmed[1]) { onHover(1, i); onConfirm(1); } }}
          aria-label={heroName(key)}>
          <span className="CharacterBackground"/>
          <span className="Portrait" style={{ backgroundImage: `url(${IMG}portrait_backgrounds/${bg}.webp)` }}><img src={`${IMG}heroes/selection/${HERO_INFO[key].npc}.webp`} alt=""/></span>
          <span className="fg-card-name">{heroName(key)}</span>
          <span className="SelectedShimmer"/><span className="SelectedBorder"/>
          <span className="P1Label">1P</span><span className="P2Label">2P</span>
        </button>;
      })}
    </div>
    <div className="Bottom">
      <button type="button" className="BackArrowButton" onClick={() => { onBack(); sound('General.ButtonClick'); }} aria-label={t('Назад')}><img src={sharedImage('arrow_left.svg')} alt=""/></button>
      {confirmBox(0)}{versus && confirmBox(1)}
    </div>
    {loading && <div className="fg-loading-models">{t('Загружаем…')}</div>}
    <p className="fg-select-hint">{versus ? t('Первый: A / D и пробел. Второй: ← / → и «.» (или Num 0).') : t('A / D или стрелки — выбор, пробел или Enter — подтвердить, Esc — назад.')}</p>
  </div>;
}

// ArcadeMap: the tavern floorplan, the five opponents (defeated ones struck through, the next one pulsing) and
// the footsteps from the last fight to the next.
function ArcadeMap({ valve, arcade, stage, heroName }) {
  const from = stage === 0 ? MAP_START : MAP_POS[stage - 1], to = MAP_POS[stage];
  const steps = useMemo(() => {
    const W = PANEL_W, H = PANEL_H, x0 = from[0] * W, y0 = from[1] * H + (stage === 0 ? -40 : 150), x1 = to[0] * W, y1 = to[1] * H + 150;
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(len / STRIDE.length), ang = Math.atan2(y1 - y0, x1 - x0);
    return Array.from({ length: n }, (_, i) => { const k = (i + 0.5) / n, side = i % 2 ? 1 : -1; return { x: x0 + (x1 - x0) * k - Math.sin(ang) * STRIDE.width * side, y: y0 + (y1 - y0) * k + Math.cos(ang) * STRIDE.width * side, a: ang * 180 / Math.PI + 90, d: i * 0.06 + 0.8 }; });
  }, [from, to]);
  return <div className="ArcadeMap">
    <img className="FloorplanImage" src={`${IMG}tavern_map/tavern_floorplan.webp`} alt=""/>
    <div className="ArcadeMapTitle">{valve('DOTA_FightingGame_Arcade_NextOpponent')}</div>
    {steps.map((s, i) => <img key={i} className="Footprint" src={`${IMG}tavern_map/footprint.webp`} alt="" style={{ left: s.x - 20, top: s.y - 20, transform: `rotate(${s.a}deg)`, animationDelay: `${s.d}s` }}/>)}
    {arcade.opponents.map((key, i) => {
      const [x, y] = MAP_POS[i];
      return <div key={i} className={`ArcadeMapDestination ${i < stage ? 'Defeated' : ''} ${i === stage ? 'UpNext' : ''}`} style={{ left: x * PANEL_W - 110, top: y * PANEL_H - 120 }}>
        <div className="HeroPortraitContainer"><img className="fg-map-portrait" src={`${IMG}heroes/selection/${HERO_INFO[key].npc}.webp`} alt=""/><span className="HeroBorder"/></div>
        <div className="HeroName">{heroName(key)}</div>
        <img className="Strikethrough" src={`${IMG}tavern_map/slash.webp`} alt=""/>
      </div>;
    })}
    <div className="fg-map-credits">{valve('DOTA_FightingGame_Arcade_Credits', { remaining_credits: arcade.credits })} · {valve('DOTA_FightingGame_HUD_Score')}: {number(arcade.score)}</div>
  </div>;
}

// ArcadeContinueOptions / ArcadeGameOverOptions / ArcadeVictoryOptions / OnlineRematchOptions.
function Outcome({ valve, overlay, arcade, outcome, sound, onContinue, onQuit, onMenu, onRematch }) {
  if (overlay === 'continue') return <div className="ArcadeContinueOptions fg-outcome">
    <div className="ArcadeOutcomeLabel">{valve('DOTA_FightingGame_Arcade_Continue')}?</div>
    <div className="ArcadeContinueOptionButtons">
      <CrownfallButton onClick={onQuit} sound={sound}>{valve('DOTA_FightingGame_Arcade_Quit')}</CrownfallButton>
      <CrownfallButton className="GlowButton" onClick={onContinue} sound={sound}>{valve('DOTA_FightingGame_Arcade_Continue')}</CrownfallButton>
    </div>
    <div className="RemainingCredits">{valve('DOTA_FightingGame_Arcade_Credits', { remaining_credits: arcade?.credits ?? 0 })}</div>
  </div>;
  if (overlay === 'gameover') return <div className="ArcadeGameOverOptions fg-outcome">
    <div className="ArcadeOutcomeLabel">{valve('DOTA_FightingGame_Arcade_GameOver')}</div>
    <div className="ArcadeOutcomeText NewHighScore">{valve('DOTA_FightingGame_Arcade_NewHighScore')}</div>
    <div className="ArcadeOutcomeRow"><span>{valve('DOTA_FightingGame_Arcade_FinalScore')}</span><span>{number(arcade?.score)}</span></div>
    <BoardOutcome outcome={outcome}/>
    <div className="ButtonRow"><CrownfallButton className="GlowButton" onClick={onMenu} sound={sound}>{valve('DOTA_FightingGame_Arcade_AcceptLoss')}</CrownfallButton></div>
  </div>;
  if (overlay === 'victory') return <div className="ArcadeVictoryOptions fg-outcome">
    <div className="ArcadeOutcomeLabel">{valve('DOTA_FightingGame_Arcade_Victory')}</div>
    <div className="TitleContainer"><span className="Dash Left"/><span>{valve('DOTA_FightingGame_Arcade_FinalScore')}</span><span className="Dash Right"/></div>
    <div className="HighScore">{number(arcade?.score)}</div>
    <div className="ArcadeOutcomeText NewHighScore">{valve('DOTA_FightingGame_Arcade_NewHighScore')}</div>
    <BoardOutcome outcome={outcome}/>
    <CrownfallButton className="GlowButton" onClick={onMenu} sound={sound}>{valve('DOTA_FightingGame_Arcade_AcceptVictory')}</CrownfallButton>
  </div>;
  return <div className="OnlineRematchOptions fg-outcome"><div className="ButtonRow">
    <CrownfallButton onClick={onMenu} sound={sound}>{valve('DOTA_FightingGame_Online_Quit')}</CrownfallButton>
    <CrownfallButton className="GlowButton" onClick={onRematch} sound={sound}>{valve('DOTA_FightingGame_Online_Rematch')}</CrownfallButton>
  </div></div>;
}

// ---- the HUD (HUDContainer) ---------------------------------------------------------------------------------------
function Hud({ valve, game, hudRef, heroName, single }) {
  const side = (i) => {
    const f = game.fighters[i], key = f.hero.key, act = Object.values(f.hero.actions).find((a) => a.singleUse);
    const ref = (name) => (el) => { hudRef.current[i] = hudRef.current[i] || {}; hudRef.current[i][name] = el; };
    return <div className={`HUDHeroContainer ${i ? 'Right' : 'Left'}`}>
      <div className="PortraitAndSheildContainer">
        <div className="HeroPortraitContainer"><img className="HeroPortrait" src={`${IMG}heroes/${HERO_INFO[key].npc}.webp`} alt=""/></div>
        <div className="ShieldContainer">
          <div className="ShieldIconContainer"><img className="ShieldIcon" src={`${IMG}hud/shield_icon.webp`} alt=""/><img className="ShieldIconBroken" src={`${IMG}hud/shield_icon_broken.webp`} alt=""/></div>
          <div className="ShieldBarContainer"><div className="ShieldBarBackground"/><div className="ShieldBar" ref={ref('shield')}/></div>
        </div>
        {i === 0 && single && <div className="ScoreContainer"><span className="ScoreLabel">{valve('DOTA_FightingGame_HUD_Score')}</span><span className="LeftRightFlow"><span className="ScoreValue" ref={(el) => { hudRef.current.score = el; }}>0</span><span className="ScorePTS">{valve('DOTA_FightingGame_HUD_PTS_Label')}</span></span></div>}
      </div>
      <div className="HPBarInfoContainer">
        <div className="StatusContainer" id={i ? 'RightHeroStatusContainer' : 'LeftHeroStatusContainer'}>
          <div className="HPBarBG"/><div className="HPBarMID" ref={ref('mid')}/><div className="HPBarFG" ref={ref('hp')}/>
        </div>
        <div className="HeroNameContainer"><span className="HeroName">{heroName(key)}</span><span className="FillWidth"/>
          <span className="RoundPips"><span className="RoundPipIcon RoundPip1"/><span className="RoundPipIcon RoundPip2"/></span></div>
        <div className={`SingleUseActionContainer ${act ? 'HasSingleUseAction' : ''}`} ref={ref('single')}>{act?.icon && <img className="AbilityImage" src={`${IMG}spellicons/${act.icon}.webp`} alt=""/>}</div>
      </div>
    </div>;
  };
  return <div className="HUDContainer">
    <img className="HUDBackground" src={`${IMG}hud/hud_background.webp`} alt=""/>
    <div className="RedGlow Left"/><div className="RedGlow Right"/>
    {side(0)}
    <div id="CountdownContainer">
      <img className="TimerShadow" src={`${IMG}hud/timer_shadow.webp`} alt=""/>
      <img className="TimerBackgroundImage" src={`${IMG}hud/timer_background_image.webp`} alt=""/>
      <img className="TimerBorder" src={`${IMG}hud/timer_border.webp`} alt=""/>
      <div className="RoundTimerContainer"><span id="RoundCounter" ref={(el) => { hudRef.current.round = el; }}/><span id="TimeCountdown" ref={(el) => { hudRef.current.timer = el; }}>{CONVARS.roundDuration}</span></div>
    </div>
    {side(1)}
  </div>;
}

const ICONS = {
  FirstBlood: <svg viewBox="0 0 48 48"><path d="M24 4C18 15 11 22 11 31a13 13 0 0 0 26 0C37 22 30 15 24 4z" fill="#fff"/></svg>,
  CounterHit: <svg viewBox="0 0 48 48"><path d="M8 36 L22 14 L28 26 L40 10" fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round"/><path d="M32 8h10v10" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round"/></svg>,
  Punish: <svg viewBox="0 0 48 48"><path d="M10 22a6 6 0 0 1 6-6h18a6 6 0 0 1 6 6v8a10 10 0 0 1-10 10H20a10 10 0 0 1-10-10z M16 16v-4a4 4 0 0 1 8 0v4 M24 16v-5a4 4 0 0 1 8 0v5" fill="#fff"/></svg>,
};
// The intro names shrink to fit (Valve's max-width 820px with text-overflow: shrink).
const introSize = (name) => `${Math.min(150, Math.floor(820 / (String(name).length * 0.72)))}px`;
// ForegroundUILayer: score announcements by the sides, the intro names, the round and KO videos, match end texts,
// the score breakdown.
function Announcements({ valve, game, heroName, hudRef, videosRef, breakdown }) {
  const [a, b] = game.fighters;
  const box = (side, kind, label, iconKind, points) => <div className={`${kind} ScoreAnnouncement`} ref={(el) => { hudRef.current.announce = hudRef.current.announce || [{}, {}]; hudRef.current.announce[side][kind === 'PunishCounter' ? 'Punish' : kind] = el; }}>
    <span className="ScoreGlow"/><span className="ScoreAnnouncementBackground"/><span className="ScoreAnnouncementIconBackground"/><span className="ScoreAnnouncementShimmer"/>
    <span className="ScoreAnnouncementInfoContainer">
      {iconKind ? <span className="ScoreAnnouncementIcon">{ICONS[iconKind]}</span> : <span className="ComboCount">2</span>}
      <span className="ScoreDataContainer"><span className="ScoreAnnouncementLabel">{label}</span>{points && <span className="ScoreAnnouncementPoints fg-points"/>}</span>
    </span>
  </div>;
  const side = (s) => <div className={`ScoreAnnouncementContainer ${s ? 'Right' : 'Left'}`}>
    {box(s, 'ComboCounter', valve('DOTA_FightingGame_HUD_ComboCounterHits'), null, false)}
    {box(s, 'FirstBlood', valve('DOTA_FightingGame_HUD_FirstBloodLabel'), 'FirstBlood', true)}
    {box(s, 'CounterHit', valve('DOTA_FightingGame_HUD_CounterHitLabel'), 'CounterHit', true)}
    {box(s, 'PunishCounter', valve('DOTA_FightingGame_HUD_PunishCounterLabel'), 'Punish', true)}
  </div>;
  const video = (name, file, extra = '') => <video key={name} className={`fg-video ${extra}`} muted playsInline preload="auto" src={`${BASE}videos/${file}.webm`} ref={(el) => { if (el) videosRef.current[name] = el; }}/>;
  const winsText = (key) => valve(key, { Left_Hero_Name: heroName(a.hero.key), Right_Hero_Name: heroName(b.hero.key) });
  return <div className="ForegroundUILayer">
    {side(0)}{side(1)}
    <div id="AnnouncementContainer">
      <div className="IntroTextContainer">
        <span className="HeroName1Label" style={{ fontSize: introSize(heroName(a.hero.key)) }}>{heroName(a.hero.key)}</span><span className="VSLabel">{valve('DOTA_FightingGame_Announcements_VS')}</span>
        <span className="HeroName2Label" style={{ fontSize: introSize(heroName(b.hero.key)) }}>{heroName(b.hero.key)}</span>
        <span className="Spattering"/>
      </div>
      <div className="Announcement MatchEndText LeftHeroWins">{rich(winsText('DOTA_FightingGame_Announcements_LeftHeroWins'))}</div>
      <div className="Announcement MatchEndText RightHeroWins">{rich(winsText('DOTA_FightingGame_Announcements_RightHeroWins'))}</div>
      <div className="Announcement MatchEndText Draw">{valve('DOTA_FightingGame_Announcements_Draw')}</div>
      <div className="Announcement TimeOutText">{valve('DOTA_FightingGame_Announcements_Timeout')}</div>
    </div>
    {video('round1', 'round1', 'RoundIntroMovie Round1Movie')}{video('round2', 'round2', 'RoundIntroMovie Round2Movie')}{video('round3', 'round3', 'RoundIntroMovie Round3Movie')}
    {video('ko', 'ko', 'KOMovie')}{video('perfect', 'perfect', 'PerfectMovie')}
    {/* Without the videos (Safari: no VP9 alpha): Valve's words drawn in their place. */}
    <div className="fg-text fg-text-round1">ROUND <b>ONE</b><i>FIGHT!</i></div><div className="fg-text fg-text-round2">ROUND <b>TWO</b><i>FIGHT!</i></div>
    <div className="fg-text fg-text-round3">ROUND <b>THREE</b><i>FIGHT!</i></div><div className="fg-text fg-text-ko"><b>K.O.</b></div><div className="fg-text fg-text-perfect"><b>PERFECT</b></div>
    {breakdown && <div id="ScoreBreakdownContainer">
      <div className="ScoreHeadingContainer"><img className="ScoreBackground" src={`${IMG}score_background.webp`} alt=""/><span className="ScoreHeading">{valve('DOTA_FightingGame_HUD_Score')}</span></div>
      <div className="ScoreBreakdownRow"><span>{valve('DOTA_FightingGame_HUD_Time')}</span><b>{number(breakdown.time)}</b></div>
      <div className="ScoreBreakdownRow"><span>{valve('DOTA_FightingGame_HUD_Health')}</span><b>{number(breakdown.health)}</b></div>
      <div className="ScoreBreakdownRow"><span>{valve('DOTA_FightingGame_HUD_SpecialMoveFinish')}</span><b>{number(breakdown.stylish)}</b></div>
      <div className="ScoreBreakdownRow"><span>{t('Бонусы боя')}</span><b>{number(breakdown.bonus)}</b></div>
      <div className="ScoreBreakdownRow Total"><span>{valve('DOTA_FightingGame_HUD_Total')}</span><b>{number(breakdown.total)}</b></div>
    </div>}
  </div>;
}

// PauseContainer: «Пауза» and the move list (DOTAFightingGameMoveListPanel) of the left fighter.
const INPUT_ICON = { 1: 'Forward', 2: 'Back', 4: 'Down', 8: 'Up', 5: 'DownForward', 6: 'DownBack' };
function Command({ inputs }) {
  const out = [];
  inputs.forEach((bits, i) => {
    const dirs = bits & 15, buttons = bits & 48;
    if (dirs) out.push(<span key={`d${i}`} className={`fg-cmd ${INPUT_ICON[dirs] || 'Forward'}`}/>);
    if (buttons & BIT.A) out.push(<span key={`a${i}`} className="fg-cmd Attack"/>);
    if (buttons & BIT.S) out.push(<span key={`s${i}`} className="fg-cmd Special"/>);
  });
  return <span className="Command">{out}</span>;
}
function Pause({ valve, game, config, heroName, onQuit, onResume, sound, versus }) {
  const [side, setSide] = useState(0);
  const hero = config.heroes[game.fighters[side].hero.key];
  const rows = moveList(hero), normal = rows.filter((r) => !r.install), install = rows.filter((r) => r.install);
  const installName = install.length ? valve(rows.find((r) => r.action.install)?.name || '') : '';
  const entry = (r) => {
    const a = r.action, cls = a.hit ? blockClass(a.onBlock) : '';
    return <div key={`${r.to}${r.install}`} className={`MoveListEntry ${cls}`}>
      <span className="Name">{valve(r.name)}</span>
      <span className="fg-commands">{r.inputs.map((inp, i) => <Command key={i} inputs={inp}/>)}</span>
      <span className="Startup">{startupOf(a) ?? '—'}</span>
      <span className="OnBlock">{a.hit ? (a.onBlock > 0 ? `+${a.onBlock}` : a.onBlock) : '—'}</span>
      <span className="OnHit">{a.hit ? (a.onHit > 0 ? `+${a.onHit}` : a.onHit) : '—'}</span>
      <span className="Damage">{a.hit ? a.damage : '—'}</span>
    </div>;
  };
  const basic = [[valve('DOTA_FightingGame_Block'), [[2]]], [valve('DOTA_FightingGame_Dash'), [[1, 1]]], [valve('DOTA_FightingGame_BackDash'), [[2, 2]]]];
  return <div id="PauseContainer">
    <div id="PauseTextContainer"><img className="PauseIcon" src={sharedImage('controller.svg')} alt=""/><span id="PauseText">{t('Пауза')}</span>
      <div className="fg-pause-buttons"><CrownfallButton className="GlowButton" onClick={onResume} sound={sound}>{valve('DOTA_FightingGame_HUD_UnPause')}</CrownfallButton>
        <CrownfallButton onClick={onQuit} sound={sound}>{valve('DOTA_FightingGame_Menu_Quit')}</CrownfallButton></div></div>
    <div id="MoveListPanel">
      <div id="MoveListTitle">{rich(valve('DOTA_FightingGame_MovelistTitle', { hero_name: heroName(hero.key) }))}
        {versus && <span className="fg-movelist-tabs">{[0, 1].map((s) => <button type="button" key={s} className={side === s ? 'on' : ''} onClick={() => setSide(s)}>{s + 1}P</button>)}</span>}</div>
      <div className="MoveList">
        <div className="MoveListHeader"><span className="FillWidth"/><span className="Command">{valve('DOTA_FightingGame_Movelist_Input')}</span><span>{valve('DOTA_FightingGame_Movelist_Startup')}</span><span>{valve('DOTA_FightingGame_Movelist_OnBlock')}</span><span>{valve('DOTA_FightingGame_Movelist_OnHit')}</span><span>{valve('DOTA_FightingGame_Movelist_Damage')}</span></div>
        <div id="MoveListContainer">
          {basic.map(([name, inputs]) => <div key={name} className="MoveListEntry"><span className="Name">{name}</span><span className="fg-commands">{inputs.map((inp, i) => <Command key={i} inputs={inp}/>)}</span><span className="Startup">—</span><span className="OnBlock">—</span><span className="OnHit">—</span><span className="Damage">—</span></div>)}
          {normal.map(entry)}
          {install.length > 0 && <div className="MoveListInstallHeader">{valve('DOTA_FightingGame_InstallRequirementHeader', { move_name: installName })}</div>}
          {install.map(entry)}
          <div className="fg-chain-note">{t('Атака, атака, атака — серия ударов. Приёмы можно отменять в другие, если удар попал.')}</div>
        </div>
      </div>
    </div>
  </div>;
}

// ControlsDisplay (first fight): W A S D or the arrows, Alt and Space.
function ControlsDisplay() {
  const key = (k, extra = '') => <span className={`ControlKey ${extra}`}><span className="KeyText">{k}</span></span>;
  const arrow = (dir) => <span className="ControlKey"><img className="KeyText" src={sharedImage(`arrow_${dir}.svg`)} alt=""/></span>;
  return <div id="ControlsDisplay">
    <div className="Column">{key('W')}<div className="Row">{key('A')}{key('S')}{key('D')}</div></div>
    <span className="OrText">{t('или')}</span>
    <div className="Column">{arrow('up')}<div className="Row">{arrow('left')}{arrow('down')}{arrow('right')}</div></div>
    <div className="Column"><div className="Row">{key('Alt', 'Medium')}{key('Space', 'ExtraLarge')}</div></div>
  </div>;
}

// On a touch screen: a cross on the left, attack and special on the right.
function TouchControls({ touchRef }) {
  const held = useRef(new Map());
  const update = () => { let k = 0; for (const v of held.current.values()) k |= v; touchRef.current = k; };
  const bind = (bits) => ({
    onPointerDown: (e) => { e.preventDefault(); e.stopPropagation(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ } held.current.set(e.pointerId, bits); update(); },
    onPointerUp: (e) => { held.current.delete(e.pointerId); update(); },
    onPointerCancel: (e) => { held.current.delete(e.pointerId); update(); },
  });
  useEffect(() => () => { touchRef.current = 0; }, [touchRef]);
  return <div className="fg-touch-controls">
    <div className="fg-dpad">
      <button type="button" className="fg-pad-up" aria-label="↑" {...bind(KEY.UP)}/><button type="button" className="fg-pad-left" aria-label="←" {...bind(KEY.LEFT)}/>
      <button type="button" className="fg-pad-down" aria-label="↓" {...bind(KEY.DOWN)}/><button type="button" className="fg-pad-right" aria-label="→" {...bind(KEY.RIGHT)}/>
      <button type="button" className="fg-pad-dl" aria-label="↙" {...bind(KEY.DOWN | KEY.LEFT)}/><button type="button" className="fg-pad-dr" aria-label="↘" {...bind(KEY.DOWN | KEY.RIGHT)}/>
    </div>
    <div className="fg-buttons">
      <button type="button" className="fg-pad-special" aria-label="Alt" {...bind(KEY.SPECIAL)}>Alt</button>
      <button type="button" className="fg-pad-attack" aria-label="Space" {...bind(KEY.ATTACK)}><img src={sharedImage('space.svg')} alt=""/></button>
    </div>
  </div>;
}
