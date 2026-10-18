// «Рыбалка» (Crownfall act I, Fishing with Tidehunter): Valve's bp_popup_crownfall_encounter_fishing
// rebuilt for the browser. The rules are logic.mjs, the picture is scene.js (a canvas under Valve's
// 1244×700 popup); the menu, the HUD (score, lures, the cast and catch bars, the radial progress, the
// tips) and the score card keep the layout and the classes' roles of Valve's XML and CSS (fishing.css);
// the score card's sounds follow Valve's 31-line script. docs/minigames.md, «Рыбалка».
import { useCallback, useEffect, useRef, useState } from 'react';
import { createSounds } from '../../core/sound.js';
import { assetBase, bestScore, loadJSON, loadStrings, saveScore } from '../../core/assets.js';
import { CloseButton, CrownfallButton, Fit, KeyHint, MuteButton, ResultBand } from '../../core/ui.jsx';
import { BoardOutcome, Leaderboard, useRun } from '../../core/leaderboard.jsx';
import { REWARDS, almostCaught, catchBarSize, catchProgress, createGame, fishOpacity, fishingConfig, nextReward, press, release, aim, reticule, step, verdict } from './logic.mjs';
import { createRenderer, loadScene } from './scene.js';
import { locale, t } from '../../../../scripts/i18n.mjs';
import { useLanguage } from '../../../useLanguage.js';
import './fishing.css';

const BASE = assetBase('fishing'), IMG = `${BASE}images/`, SCENE = `${BASE}scene/`;
const COLLECTION_KEY = 'gridstudio.minigames.fishing.collection', INTRO_KEY = 'gridstudio.minigames.fishing.intro';
const STEP = 1 / 60;
const SND = {
  charge: 'crownfall.fishing.channel_cast', swing: 'crownfall.fishing.swingrod', splash: 'crownfall.fishing.splash', fake: 'crownfall.fishing.fakecatchsplash',
  bite: 'crownfall.fishing.bigsplash', hooked: 'crownfall.fishing.hooked', success: 'crownfall.fishing.success', failure: 'crownfall.fishing.failure',
  vsHooked: 'crownfall.fishing.venge.vo_hooked', vsSuccess: 'crownfall.fishing.venge.vo_success', vsFailure: 'crownfall.fishing.venge.vo_failure',
  tideGreeting: 'crownfall.fishing.tidehunter.greeting', tideBig: 'crownfall.fishing.tidehunter.bigcatch', tideCongrats: 'crownfall.fishing.tidehunter.congratulate',
  tideSad: 'crownfall.fishing.tidehunter.disappointed', tideEat: 'crownfall.fishing.tidehunter.icouldeat',
  tick: 'crownfall.fishing.score.tick', row: 'crownfall.fishing.score.row', prefinal: 'crownfall.fishing.score.prefinal',
  final: 'crownfall.fishing.score.final', finalLow: 'crownfall.fishing.score.final.low', finalHigh: 'crownfall.fishing.score.final.high',
};
// Tidehunter's lines (DOTA_VisualNovel_act1_Dialogue_fishing-*): a key and its number of variants.
const LINES = { early: ['fishing-early', 1], late: ['fishing-late', 1], escape: ['fishing-gotaway', 5], nicecatch: ['fishing-nicecatch', 5], goodjob: ['fishing-goodjob', 4], okayjob: ['fishing-okayjob', 1], badjob: ['fishing-badjob', 4] };
const lineKey = ([name, alts]) => { const i = Math.floor(Math.random() * (alts + 1)); return `${name}${i ? `-alt0${i}` : ''}`; };
const RARE = new Set(['Rare', 'UltraRare']);
// The windup of vs_arcana_cast_rod_fishing: the frame where the rod is furthest back (charging holds it).
const WINDUP = 0.25;

const number = (value) => Number(value).toLocaleString(locale);
const remember = (key, value) => { try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch { /* Not remembered. */ } };
const recall = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const loadCollection = () => { try { return JSON.parse(recall(COLLECTION_KEY) || '{}') || {}; } catch { return {}; } };
const rich = (text) => text.split('\n').map((line, i) => <span key={i} className="fs-line">{line.split(/<b>(.*?)<\/b>/g).map((part, j) => (j % 2 ? <b key={j}>{part}</b> : part))}</span>);
const yawOf = (a) => (a > 12.5 ? 65 : a < -12.5 ? 115 : 90);
const propOf = (fish) => (fish.id === 'reward_trash_shoe' ? 'shoe' : fish.id === 'reward_trash_branch' ? 'stick' : `fish${fish.body}`);

export default function Fishing({ onExit }) {
  useLanguage();
  const [assets, setAssets] = useState(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([loadJSON(`${BASE}data.json`), loadJSON(`${BASE}sounds.json`), loadStrings('fishing'), loadJSON('./assets/minigames/shared/sounds.json').catch(() => ({})), loadScene(SCENE)])
      .then(([data, sounds, valve, shared, scene]) => setAssets({ config: fishingConfig(data), sounds: createSounds(BASE, sounds), ui: createSounds('./assets/minigames/shared/', shared), valve, scene }))
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <div className="mg-loading" role="alert">{t('Не удалось загрузить игру. Обнови страницу.')}</div>;
  if (!assets) return <div className="mg-loading" role="status">{t('Загружаем…')}</div>;
  return <FishingPopup assets={assets} onExit={onExit}/>;
}

function FishingPopup({ assets, onExit }) {
  const { config, sounds, ui, valve, scene } = assets;
  const canvasRef = useRef(null), rootRef = useRef(null), rendererRef = useRef(null), gameRef = useRef(null), runRef = useRef(null), hudRef = useRef({});
  const [screen, setScreen] = useState('menu');                 // menu → play → result
  const [paused, setPaused] = useState(false), [novel, setNovel] = useState(null), [card, setCard] = useState(null), [result, setResult] = useState(null);
  const [best, setBest] = useState(() => bestScore('fishing')), [collection, setCollection] = useState(loadCollection);
  const [playedOnce, setPlayedOnce] = useState(false), [toast, setToast] = useState(false);
  const click = useCallback((name) => ui.play(name), [ui]), table = useRun('fishing');
  const pausedRef = useRef(false); pausedRef.current = paused;
  const novelRef = useRef(null); novelRef.current = novel;
  const bestRef = useRef(best); bestRef.current = best;

  useEffect(() => () => { sounds.stopAll(); ui.stopAll(); }, [sounds, ui]);
  useEffect(() => { rendererRef.current = createRenderer(canvasRef.current, scene); }, [scene]);
  // ?fishdebug=1: the running game for automated checks.
  useEffect(() => { if (new URLSearchParams(location.search).has('fishdebug')) window.__gsFishing = { game: () => gameRef.current, run: () => runRef.current, events: [] }; }, []);

  // The visual novel: a queue of Tidehunter's lines; the game waits while it is open.
  const showLines = useCallback((keys, after) => setNovel({ keys, i: 0, after }), []);
  const nextLine = useCallback(() => {
    const n = novelRef.current; if (!n) return;
    if (n.i + 1 < n.keys.length) setNovel({ ...n, i: n.i + 1 });
    else { setNovel(null); n.after?.(); }
  }, []);
  useEffect(() => { if (!novel || screen === 'menu') return undefined; const id = setTimeout(nextLine, 4200); return () => clearTimeout(id); }, [novel, screen, nextLine]);
  // The intro: the whole of it the first time, the short one later.
  useEffect(() => {
    const seen = recall(INTRO_KEY) === '1';
    sounds.play(SND.tideGreeting);
    showLines(seen ? ['fishing-intro-short'] : ['fishing-intro', 'fishing-intro', 'fishing-intro'].map((k, i) => `${k}#${i}`), () => remember(INTRO_KEY, '1'));
  }, [sounds, showLines]);

  // The menu's picture: the side camera with both heroes.
  useEffect(() => {
    if (screen !== 'menu') return undefined;
    let frame = 0, last = performance.now();
    const paint = () => { const now = performance.now(); rendererRef.current.draw({ view: 'side', vs: 'vs_menu', tide: 'tide_menu' }, (now - last) / 1000); last = now; frame = requestAnimationFrame(paint); };
    paint();
    return () => cancelAnimationFrame(frame);
  }, [screen]);

  const recordCatch = useCallback((fish) => {
    if (fish.trash && !fish.id) return;
    setCollection((old) => {
      const c = { ...old }, e = { n: 0, best: 0, variants: [false, false], ...(c[fish.id] || {}) };
      e.n += 1; e.best = Math.max(e.best, fish.kg); if (fish.variant) e.variants = e.variants.map((v, i) => v || i === fish.variant - 1);
      c[fish.id] = e; remember(COLLECTION_KEY, c); return c;
    });
  }, []);

  const finish = useCallback((game) => {
    const record = saveScore('fishing', game.score);
    if (record) setBest(game.score);
    setPlayedOnce(true);
    setResult({ score: game.score, record, catches: game.catches, log: game.log });
    table.submit({ score: game.score, stats: { catches: game.catches.length } });
    const v = verdict(game.score);
    sounds.play(v === 'goodjob' ? SND.tideCongrats : v === 'badjob' ? SND.tideSad : SND.tideEat);
    showLines([lineKey(LINES[v])], () => setScreen('result'));
  }, [sounds, showLines, table.submit]); // eslint-disable-line react-hooks/exhaustive-deps

  // The score card's sounds (Valve's QueueScoreRowEffects): a row each, the total's «prefinal» and 0.8 s
  // later the coins, lower or higher by the total.
  const handle = useCallback((events, run) => {
    const game = gameRef.current, r = rendererRef.current, b = game.bobber;
    window.__gsFishing?.events.push(...events.map((e) => `${run.clock.toFixed(2)} ${e.type}${e.why ? `:${e.why}` : ''}`));
    for (const e of events) {
      switch (e.type) {
        case 'charge': run.charge = sounds.play(SND.charge); run.chargeAt = run.clock; break;
        case 'cast': run.charge?.stop(0.1); run.charge = null; run.launchFrom = null; sounds.play(SND.swing); run.castAt = run.clock; run.yaw = yawOf(game.aim); break;
        case 'land': sounds.play(SND.splash); r.burst('land', 'overhead', b.x, b.y); break;
        case 'fake': sounds.play(SND.fake); r.burst('fake', 'overhead', b.x, b.y); run.dip = run.clock; break;
        case 'bite': sounds.play(SND.bite); r.burst('big', 'overhead', b.x, b.y); break;
        case 'hooked': sounds.play(SND.hooked); sounds.play(SND.vsHooked); run.hookAt = run.clock; run.nextSplash = run.clock + 0.8; break;
        case 'caught': {
          sounds.play(SND.success); sounds.play(SND.vsSuccess);
          if (RARE.has(e.fish.category)) setTimeout(() => sounds.play(SND.tideBig), 1400);
          r.burst('catch', 'overhead', b.x, b.y);
          run.caughtAt = run.clock; recordCatch(e.fish);
          run.fish = { prop: propOf(e.fish), scale: (e.fish.trash ? 0.62 : 0.55 + 0.03 * e.fish.weight) * (0.85 + 0.3 * e.fish.w) };
          run.nice = RARE.has(e.fish.category) || Math.random() < 0.35;
          break;
        }
        case 'card': setCard({ ...e.card, shown: 0 }); break;
        case 'row': sounds.play(SND.row); setCard((c) => (c ? { ...c, shown: e.index + 1 } : c)); break;
        case 'total': {
          sounds.play(SND.prefinal); setCard((c) => (c ? { ...c, shown: c.rows.length + 1 } : c));
          const total = e.total; setTimeout(() => sounds.play(total < 1000 ? SND.finalLow : total > 2000 ? SND.finalHigh : SND.final), 800);
          break;
        }
        case 'add': {
          run.tally = { from: e.score - e.value, to: e.score, at: run.clock };
          const before = e.score - e.value, reward = REWARDS.find(([at]) => before < at && e.score >= at && bestRef.current < at);
          if (reward) { setToast(true); setTimeout(() => setToast(false), 2600); }
          setCard(null);
          if (run.nice) { run.nice = false; run.pendingLine = lineKey(LINES.nicecatch); }
          break;
        }
        case 'missed':
          run.charge?.stop(0.1);
          sounds.play(SND.failure); sounds.play(SND.vsFailure); setTimeout(() => sounds.play(SND.tideSad), 900);
          if (b?.landed) r.burst('fake', 'overhead', b.x, b.y);
          run.missedAt = run.clock; run.missLine = lineKey(LINES[e.why]);
          break;
        case 'ready': if (run.pendingLine) { const k = run.pendingLine; run.pendingLine = null; showLines([k]); } break;
        case 'over': run.over = true; break;
        default:
      }
    }
  }, [sounds, recordCatch, showLines]);

  // The HUD reads the game every frame without React: Valve's state classes on the popup, the bars,
  // the radial progress, the lures and the score.
  const paintHud = useCallback((game, run) => {
    const h = hudRef.current, root = rootRef.current; if (!root) return;
    const bar = game.bar, ph = game.phase;
    const cls = ['fs-scene',
      ph === 'aim' && 'PreCastStrengthRod', ph === 'charge' && 'PreCastStrengthRod ChargingStrength', ph === 'cast' && 'CastingRod',
      (ph === 'wait' || ph === 'bite' || ph === 'gone') && 'WaitingForBite', ph === 'reel' && 'ReelingFish', ph === 'score' && 'PostCatchShowScore',
      bar && ph === 'reel' && bar.inside && 'FishWithinRange', bar && ph === 'reel' && bar.fish > bar.pos + bar.size && 'FishAboveCatchBar',
      bar && ph === 'reel' && game.holding && 'FishBarMovingUp', ph === 'reel' && almostCaught(game) && 'AlmostCaught',
      // FUN_18291ad30's flags: BigFish w > 0.7, SmallFish w ≤ 0.25, RareFish — Ultra Rare.
      game.hooked && game.hooked.w > 0.7 && 'BigFish', game.hooked && game.hooked.w <= 0.25 && 'SmallFish', game.hooked?.category === 'UltraRare' && 'RareFish',
      bestRef.current < config.tipsBelow && 'ShowTips', ph === 'over' && 'GameOver', run.tally && 'ShowRemainingScore',
      game.score > bestRef.current && bestRef.current > 0 && 'NewHighScore'].filter(Boolean).join(' ');
    if (root.className !== cls) root.className = cls;
    if (h.cast) h.cast.style.height = `${(ph === 'charge' ? game.power : ph === 'cast' && game.bobber ? game.bobber.power : 0) * 100}%`;
    if (bar) {
      if (h.catchBar) { h.catchBar.style.height = `${bar.size}%`; h.catchBar.style.bottom = `${bar.pos}%`; }
      if (h.fish) { h.fish.style.bottom = `${bar.fish}%`; h.fish.style.opacity = String(fishOpacity(game)); }
      if (h.radial) h.radial.style.setProperty('--p', `${catchProgress(game) * 360}deg`);
    }
    if (h.lures) h.lures.textContent = String(game.lures);
    let shown = game.score, remaining = 0;
    if (run.tally) { const u = Math.min(1, (run.clock - run.tally.at) / 0.8); shown = Math.round(run.tally.from + (run.tally.to - run.tally.from) * u); remaining = run.tally.to - shown; if (u >= 1) run.tally = null; }
    else if (game.card && ph === 'score' && game.card.shown > game.card.rows.length) remaining = game.card.total;
    if (h.score) h.score.textContent = number(shown);
    if (h.remaining) h.remaining.textContent = `+${number(remaining)}`;
    if (h.high) h.high.textContent = number(Math.max(bestRef.current, game.score));
    const next = nextReward(Math.max(bestRef.current, game.score));
    if (h.next) h.next.textContent = next ? number(next[0]) : '—';
    if (h.pips && h.pips.dataset.n !== String(next?.[1] ?? 0)) { h.pips.dataset.n = String(next?.[1] ?? 0); h.pips.replaceChildren(...Array.from({ length: next?.[1] ?? 0 }, () => document.createElement('em'))); }
  }, [config]);

  // What the scene shows now: the camera, the heroes' animations, the bobber and the line.
  const sceneState = useCallback((game, run) => {
    const r = rendererRef.current, ph = game.phase, now = run.clock;
    const yaw = ph === 'aim' || ph === 'charge' ? yawOf(game.aim) : run.yaw || 90;
    const s = { view: 'overhead', tide: 'tide_idle', tideTime: now, vs: `vs_idle_${yaw}`, vsTime: now, vsLoop: true };
    const castName = `vs_cast_${yaw}`, castD = r.duration(castName);
    // The pond fish (Valve moves their models in the scene): all but the one on the line.
    if (game.pond) s.pond = game.pond.fish.filter((f) => f.active && !(game.hooked && f.index === game.hooked.index && (ph === 'reel' || ph === 'caught' || ph === 'score')));
    if (ph === 'aim') s.reticule = reticule(game);
    if (ph === 'charge') { s.vs = castName; s.vsLoop = false; s.vsTime = Math.min(now - run.chargeAt, castD * WINDUP); s.reticule = reticule(game); }
    if (['cast', 'wait', 'bite', 'gone', 'reel'].includes(ph) || (ph === 'missed' && game.bobber)) {
      const sinceCast = now - (run.castAt ?? now);
      if (castD * WINDUP + sinceCast < castD) { s.vs = castName; s.vsLoop = false; s.vsTime = castD * WINDUP + sinceCast; } else { s.vs = `vs_wait_${yaw}`; s.vsTime = sinceCast; }
      if (ph === 'reel') { const since = now - run.hookAt, hd = r.duration(`vs_hook_${yaw}`); if (since < hd) { s.vs = `vs_hook_${yaw}`; s.vsLoop = false; s.vsTime = since; } else { s.vs = `vs_reel_${yaw}`; s.vsTime = since - hd; } }
      const b = game.bobber;
      if (b) {
        const launch = b.swing, u = (sinceCast - launch) / b.flight;
        if (ph === 'cast') {
          if (u >= 0) { if (!run.launchFrom) run.launchFrom = run.tip; s.bobber = { x: b.x, y: b.y, flight: Math.min(1, u), from: run.launchFrom }; s.line = true; }
        } else {
          const bob = { x: b.x, y: b.y };
          if (ph === 'bite') bob.sink = 0.45 + 0.4 * Math.sin(now * 16);
          else if (run.dip && now - run.dip < 0.45) bob.sink = 0.5 * Math.sin((now - run.dip) / 0.45 * Math.PI);
          if (ph === 'reel' && game.bar) { bob.dx = (game.bar.fish - 50) * 0.9 + Math.sin(now * 11) * 2; bob.dy = Math.sin(now * 3.7) * 6; bob.sink = 0.35 + 0.15 * Math.sin(now * 9); }
          if (ph !== 'missed') { s.bobber = bob; s.line = true; }
        }
      }
    }
    if (ph === 'missed') {
      const since = now - run.missedAt, dd = r.duration('vs_defeat_90');
      if (since < dd) { s.vs = 'vs_defeat_90'; s.vsLoop = false; s.vsTime = since; }
    }
    if (ph === 'caught' || ph === 'score') {
      s.view = 'centered'; s.tide = 'tide_catch'; s.vs = 'vs_victory'; s.vsLoop = false; s.vsTime = now - run.caughtAt; s.fish = run.fish; s.fishTime = now - run.caughtAt;
    }
    if (ph === 'over') { s.vs = `vs_idle_${run.yaw || 90}`; }
    return s;
  }, [config]);

  // The loop: fixed steps of the rules, a frame of the picture.
  const loop = useCallback(() => {
    const run = runRef.current; if (!run) return;
    const now = performance.now(), dt = Math.min(0.05, (now - run.last) / 1000); run.last = now;
    const game = gameRef.current, r = rendererRef.current;
    const frozen = pausedRef.current || !!novelRef.current;
    if (!frozen) {
      run.clock += dt; run.acc += dt;
      while (run.acc >= STEP) {
        run.acc -= STEP;
        const ev = step(game, STEP); if (ev.length) handle(ev, run);
        if (game.phase === 'missed' && run.missLine && game.phaseTime > 0.9) { const k = run.missLine; run.missLine = null; showLines([k]); break; }
      }
      if (game.phase === 'reel' && run.clock >= run.nextSplash) { sounds.play(SND.splash); r.burst('fake', 'overhead', game.bobber.x + (game.bar.fish - 50) * 1.4, game.bobber.y); run.nextSplash = run.clock + 0.9 + Math.random() * 0.9; }
    }
    const s = sceneState(game, run);
    if (s.view !== run.view) { if (run.view) r.clear(); run.view = s.view; }
    if (run.over && !run.done && game.phaseTime > 0.6) { run.done = true; finish(game); }
    r.draw(s, frozen ? 0 : dt);
    run.tip = r.lastTip;
    if (window.__gsFishing) { run.frames = (run.frames || 0) + 1; }
    paintHud(game, run);
    run.frame = requestAnimationFrame(loop);
  }, [handle, sceneState, paintHud, finish, showLines, sounds]);

  const stopRun = useCallback(() => { if (runRef.current) cancelAnimationFrame(runRef.current.frame); runRef.current = null; }, []);
  useEffect(() => stopRun, [stopRun]);

  const start = useCallback(() => {
    stopRun(); sounds.stopAll();
    const caughtBefore = Object.keys(loadCollection());
    gameRef.current = createGame(config, { caughtBefore, record: bestRef.current });
    rendererRef.current.clear();
    setPaused(false); setCard(null); setResult(null); setToast(false); table.start();
    sounds.preload(Object.values(SND));
    setScreen('play');
    runRef.current = { last: performance.now(), clock: 0, acc: 0, frame: 0, done: false, over: false, yaw: 90 };
    runRef.current.frame = requestAnimationFrame(loop);
  }, [config, sounds, loop, stopRun, table.start]); // eslint-disable-line react-hooks/exhaustive-deps

  const toMenu = useCallback(() => { stopRun(); sounds.stopAll(); if (rootRef.current) rootRef.current.className = 'fs-scene'; setScreen('menu'); setPaused(false); setNovel(null); setCard(null); }, [stopRun, sounds]);

  // Pointer → the spot on the lake under it: the inverse of the overhead camera's projection on the water.
  const aimAt = useCallback((clientX, clientY) => {
    const game = gameRef.current, el = canvasRef.current; if (!game || !el) return;
    const box = el.getBoundingClientRect(), sx = (clientX - box.left) / box.width * 1244, sy = (clientY - box.top) / box.height * 700;
    const r = rendererRef.current;
    let x = 0, y = 700;
    for (let i = 0; i < 8; i++) {
      const p = r.water('overhead', x, y), px = r.water('overhead', x + 1, y), py = r.water('overhead', x, y + 1);
      const a = px[0] - p[0], b = py[0] - p[0], c = px[1] - p[1], d = py[1] - p[1], det = a * d - b * c; if (!det) break;
      const ex = sx - p[0], ey = sy - p[1];
      x += (d * ex - b * ey) / det; y += (-c * ex + a * ey) / det;
      y = Math.max(50, Math.min(3000, y)); x = Math.max(-3000, Math.min(3000, x));
    }
    aim(game, Math.atan2(x, Math.max(1, y)) * 180 / Math.PI, Math.hypot(x, y));
  }, []);

  const down = useCallback(() => {
    const game = gameRef.current, run = runRef.current;
    if (screen !== 'play' || !game || !run || pausedRef.current) return;
    if (novelRef.current) { nextLine(); return; }
    const ev = press(game); if (ev.length) handle(ev, run);
  }, [screen, handle, nextLine]);
  const up = useCallback(() => {
    const game = gameRef.current, run = runRef.current;
    if (!game || !run) return;
    const ev = release(game); if (ev.length) handle(ev, run);
  }, [handle]);

  // Space holds like the left button; Esc pauses, or leaves the menu / the results.
  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.('input, textarea')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (novelRef.current && screen !== 'play') { nextLine(); return; }
        if (screen === 'menu') onExit(); else if (screen === 'result') toMenu();
        else if (gameRef.current && gameRef.current.phase !== 'over') setPaused((v) => !v);
        return;
      }
      if (event.code === 'Space' && screen === 'play') { event.preventDefault(); if (event.type === 'keydown' && !event.repeat) down(); if (event.type === 'keyup') up(); }
    };
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
  }, [screen, onExit, toMenu, down, up, nextLine]);
  // A hidden tab or a lost focus pauses; the button is let go.
  useEffect(() => {
    if (screen !== 'play') return undefined;
    const hide = () => { up(); if (gameRef.current && gameRef.current.phase !== 'over') setPaused(true); };
    const onVis = () => { if (document.hidden) hide(); };
    document.addEventListener('visibilitychange', onVis); window.addEventListener('blur', hide);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('blur', hide); };
  }, [screen, up]);
  useEffect(() => { if (runRef.current) runRef.current.last = performance.now(); }, [paused, novel]);

  const set = (name) => (el) => { hudRef.current[name] = el; };
  const menuOpen = screen === 'menu';
  const classes = ['fs-popup', menuOpen ? 'IntroMenu' : 'fs-running', paused && 'fs-paused', novel && 'ShowVisualNovel', playedOnce && 'PlayedOnce'].filter(Boolean).join(' ');

  return <Fit className="fs-fit">
    <div className={classes} onContextMenu={(event) => event.preventDefault()}>
      <div className="fs-main">
        <div className="fs-gold-dash"/>
        <div className="fs-scene" ref={rootRef}
          onPointerMove={(event) => { if (screen === 'play') aimAt(event.clientX, event.clientY); }}
          onPointerDown={(event) => { if (event.button === 0 || event.pointerType !== 'mouse') { event.preventDefault(); try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* A synthetic or ended pointer. */ } if (screen === 'play' && gameRef.current?.phase === 'aim') aimAt(event.clientX, event.clientY); down(); } }}
          onPointerUp={up} onPointerCancel={up}>
          <canvas ref={canvasRef} width="1244" height="700" className="fs-canvas"/>
          {screen === 'play' && <Hud valve={valve} best={best} set={set} catchBar={gameRef.current ? catchBarSize(gameRef.current) : 24}/>}
          {screen === 'play' && card && <ScoreCard card={card} valve={valve}/>}
          {screen === 'play' && <div className={`fs-toast ${toast ? 'fs-toast-on' : ''}`}><span>{valve('DOTA_Crownfall_Fishing_Hud_RewardEarned')}</span></div>}
        </div>
        {menuOpen && !novel && <MainMenu valve={valve} best={best} collection={collection} config={config} playedOnce={playedOnce} onPlay={start} onExit={onExit} sound={click}/>}
        {novel && <Novel novel={novel} valve={valve} onNext={nextLine}/>}
        {paused && screen === 'play' && <div className="fs-pause"><b>{valve('DOTA_Crownfall_Minesweeper_Paused')}</b>
          <div className="fs-pause-buttons"><CrownfallButton onClick={() => setPaused(false)} sound={click}>{valve('DOTA_Crownfall_Minesweeper_Unpause')}</CrownfallButton>
            <CrownfallButton onClick={toMenu} sound={click}>{t('Покинуть игру')}</CrownfallButton></div></div>}
        {screen === 'result' && result && <Results result={result} valve={valve} best={best} outcome={table.outcome} onAgain={start} onMenu={toMenu} sound={click}/>}
        <CloseButton mode={menuOpen ? 'close' : 'return'} onClick={menuOpen ? onExit : toMenu} label={menuOpen ? t('Закрыть') : t('В меню игры')}/>
        <div className="fs-corner">
          <MuteButton/>
          {screen === 'play' && <KeyHint label={paused ? valve('DOTA_Crownfall_Minesweeper_Unpause') : valve('DOTA_Crownfall_Minesweeper_Pause')} keyName="Esc" onClick={() => setPaused((v) => !v)}/>}
        </div>
      </div>
    </div>
  </Fit>;
}

// .OverlayHUD: lures (bottom left), the cast and catch bars and the radial progress (right of the
// middle), the tips (top middle), the score section (top left).
function Hud({ valve, best, set, catchBar }) {
  const next = nextReward(best);
  return <div className="fs-hud">
    <div className="fs-lures"><img className="fs-lure-icon" src={`${IMG}icon_lurecount.webp`} alt=""/><b ref={set('lures')}>5</b></div>
    <div className="fs-outer fs-bar-cast"><div className="fs-progress"><div className="fs-cast-fill" ref={set('cast')}/></div><img className="fs-bar-icon" src={`${IMG}icon_rodcast.webp`} alt=""/></div>
    <div className="fs-outer fs-bar-reel"><div className="fs-progress fs-reel-bg">
      <div className="fs-catch-bar" ref={set('catchBar')} style={{ height: `${catchBar}%` }}/>
      <img className="fs-fish" ref={set('fish')} src={`${IMG}icon_fishhold.webp`} alt=""/>
    </div><img className="fs-bar-icon" src={`${IMG}icon_fishhook.webp`} alt=""/></div>
    <div className="fs-meter"><div className="fs-radial" ref={set('radial')}/></div>
    <div className="fs-tips">
      <div className="fs-tip-icons"><img className="fs-hold-icon" src={`${IMG}icon_mousehold.webp`} alt=""/></div>
      <span className="fs-tip-charge">{valve('DOTA_Crownfall_Fishing_Hud_Tip_Charge')}</span>
      <span className="fs-tip-reel">{valve('DOTA_Crownfall_Fishing_Hud_Tip_Reel')}</span>
    </div>
    <div className="fs-score">
      <div className="fs-score-header"><span className="fs-score-title">{valve('DOTA_Crownfall_Fishing_Title')}</span><img src={`${IMG}divider_graphic_minigame.webp`} alt=""/></div>
      <div className="fs-score-main">
        <span className="fs-score-label">{valve('DOTA_Crownfall_Fishing_Hud_CurrentScore')}</span>
        <span className="fs-score-box"><b className="fs-score-value" ref={set('score')}>0</b><em className="fs-remaining" ref={set('remaining')}>+0</em></span>
        <i className="fs-score-sep"/>
        <span className="fs-high-label">{valve('DOTA_Crownfall_Fishing_Hud_HighScore')}<em>{valve('DOTA_Crownfall_Fishing_Hud_HighScoreNew')}</em></span>
        <b className="fs-high-value" ref={set('high')}>{number(best)}</b>
        <span className="fs-next-label">{valve('DOTA_Crownfall_Fishing_Hud_NextReward')}</span>
        <span className="fs-next"><span className="fs-pips" ref={set('pips')} data-n={next?.[1] ?? 0}>{Array.from({ length: next?.[1] ?? 0 }, (_, i) => <em key={i}/>)}</span><b ref={set('next')}>{next ? number(next[0]) : '—'}</b></span>
      </div>
    </div>
  </div>;
}

// #FishCatchStats: the catch's name, its rows one by one (WarpIn), the total stamped in.
function ScoreCard({ card, valve }) {
  const { fish } = card;
  const desc = (row) => {
    if (row.key === 'rarity') return valve(`DOTA_Crownfall_Fishing_Rarity_${row.category}`);
    if (row.key === 'variant') return valve(`DOTA_Crownfall_Fishing_Variant${row.variant}`);
    // Valve writes {f:fish_weight} without the digits the core's {f:N:name} has.
    if (row.key === 'weight') return valve(`DOTA_Crownfall_Fishing_WeightClass_${row.weightClass}`).replace(/\{f:(\d+:)?fish_weight\}/, row.kg.toFixed(2));
    return valve({ firstLure: 'DOTA_Crownfall_Fishing_Hud_Score_FirstCatch', finalLure: 'DOTA_Crownfall_Fishing_Hud_Score_FinalCatch', streak3: 'DOTA_Crownfall_Fishing_Hud_Score_CatchStreak3', streak4: 'DOTA_Crownfall_Fishing_Hud_Score_CatchStreak4', streak5: 'DOTA_Crownfall_Fishing_Hud_Score_CatchStreak5', fastCast: 'DOTA_Crownfall_Fishing_Hud_Score_QuickCast', perfectCatch: 'DOTA_Crownfall_Fishing_Hud_Score_PerfectCatch', trash: 'DOTA_Crownfall_Fishing_Hud_Score_TrashBonus', maxPower: 'DOTA_Crownfall_Fishing_Hud_Score_MaxPower' }[row.key]);
  };
  const name = (row) => valve({ rarity: 'DOTA_Crownfall_Fishing_Hud_Score_Rarity', variant: 'DOTA_Crownfall_Fishing_Hud_Score_Variant', weight: 'DOTA_Crownfall_Fishing_Hud_Score_Weight' }[row.key] || '');
  const cls = ['fs-card', `fs-variant${fish.variant}`, RARE.has(fish.category) && `fs-${fish.category}`].filter(Boolean).join(' ');
  return <div className={cls} role="status">
    <div className="fs-fish-name">{valve(fish.name)}</div>
    <div className="fs-rows">{card.rows.slice(0, card.shown).map((row) => <div key={row.key} className={`fs-row fs-row-${row.key} ${row.bonus ? 'fs-bonus' : ''} ${row.percent ? 'fs-percent' : ''}`}>
      {row.bonus ? <span className="fs-bonus-label">{valve('DOTA_Crownfall_Fishing_Hud_Score_Bonus')}</span> : <span className="fs-row-name">{name(row)}:</span>}
      <span className="fs-row-desc">{desc(row)}</span>
      <span className="fs-row-value">{row.percent ? `${row.percent}%` : number(row.value)}</span>
    </div>)}</div>
    <div className={`fs-total ${card.shown > card.rows.length ? 'fs-animating' : ''}`}><span className="fs-total-text">{valve('DOTA_Crownfall_Fishing_Hud_Score_Total')}</span><b>{number(card.total)}</b></div>
  </div>;
}

// .MainMenu: the title over the header graphic, «Как играть» and the rewards; in place of the friends'
// list — this browser's best and the collection of the lake's catches.
function MainMenu({ valve, best, collection, config, playedOnce, onPlay, onExit, sound }) {
  const kinds = config.fish;
  const caught = kinds.filter((f) => collection[f.id]).length;
  return <div className="fs-menu-area">
    <div className="fs-menu" role="dialog" aria-label={valve('DOTA_Crownfall_EncounterName_Fishing')}>
      <div className="fs-menu-header">
        <img className="fs-encounter-graphic" src={`${IMG}hed_graphic_minigame.webp`} alt=""/>
        <div className="fs-title" role="heading" aria-level="2">{valve('DOTA_Crownfall_Fishing_Title')}</div>
      </div>
      <div className="fs-columns">
        <div className="fs-column1">
          <div className="fs-howto-title" role="heading" aria-level="3">{valve('DOTA_Crownfall_Fishing_HowToPlay')}</div>
          <p className="fs-howto">{rich(valve('DOTA_Crownfall_Fishing_HowToPlay_Description'))}</p>
          <div className="fs-howto-title fs-rewards-label" role="heading" aria-level="3">{valve('DOTA_Crownfall_Fishing_Rewards')}</div>
          <div className="fs-rewards">{REWARDS.map(([at, pips]) => <div key={at} className={`fs-reward-row ${best >= at ? 'fs-unlocked' : ''}`}>
            <span>{number(at)}</span><i>{Array.from({ length: pips }, (_, i) => <em key={i}/>)}</i></div>)}</div>
        </div>
        <div className="fs-column2">
          <Leaderboard game="fishing" headClass="fs-leader-head" label={valve('DOTA_Crownfall_Fishing_Leaderboard_Score')} format={number} local={best} rows={5}/>
          <div className="fs-leader-head fs-collection-head"><span>{t('Коллекция')}</span><span>{caught} / {kinds.length}</span></div>
          <div className="fs-collection">{kinds.map((f) => { const c = collection[f.id]; return <div key={f.id} className={`fs-col-cell ${c ? '' : 'fs-col-missing'}`} title={c ? valve(f.name) : '?'}>
            <span className="fs-col-pic"><img src={`${SCENE}${propOf(f)}.webp`} alt=""/></span>
            <span className="fs-col-text"><b>{c ? valve(f.name) : '???'}</b><small>{c ? `${valve(`DOTA_Crownfall_Fishing_Rarity_${f.category}`)} · ×${c.n}${f.category !== 'Trash' ? ` · ${c.best.toFixed(2)} ${t('кг')}` : ''}` : valve(`DOTA_Crownfall_Fishing_Rarity_${f.category}`)}</small></span>
          </div>; })}</div>
          <p className="fs-keys">{t('Держать — левая кнопка мыши, пробел или палец на экране. Пауза — Esc.')}</p>
        </div>
      </div>
      <div className="fs-bottom-buttons">
        <CrownfallButton onClick={onPlay} sound={sound}>{valve('DOTA_Crownfall_Fishing_Play')}</CrownfallButton>
        {playedOnce && <CrownfallButton onClick={onExit} sound={sound}>{valve('DOTA_Crownfall_Encounter_Leave')}</CrownfallButton>}
      </div>
    </div>
  </div>;
}

// DOTACrownfallVisualNovel: Tidehunter's line over the fish pattern.
function Novel({ novel, valve, onNext }) {
  const raw = novel.keys[novel.i], [key, part] = raw.split('#');
  const text = valve(`DOTA_VisualNovel_act1_Dialogue_${key}_${part ?? 0}_Tidehunter`);
  return <button type="button" className="fs-novel-box" onClick={onNext}>
    <span className="fs-novel-band"/>
    <span className="fs-novel-text">{text}</span>
    <span className="fs-novel-portrait"><img src={`${BASE}portraits/tidehunter_portrait_idle.webp`} alt=""/><i className="fs-border-under"/><i className="fs-border-over"/>
      <span className="fs-name-plate">{valve('DOTA_VisualNovel_act1_Actor_Tidehunter')}</span></span>
    <span className="fs-novel-next">{t('Дальше')} ›</span>
  </button>;
}

function Results({ result, valve, best, outcome, onAgain, onMenu, sound }) {
  const lines = result.catches.map((c) => [`${valve(c.name)}${c.trash ? '' : ` (${c.kg.toFixed(2)} ${t('кг')})`}`, number(c.score)]);
  const missed = result.log.filter((l) => l.missed).length;
  if (missed) lines.push([t('Сорвалось'), String(missed)]);
  lines.push([valve('DOTA_Crownfall_Fishing_Hud_HighScore'), number(Math.max(best, result.score))]);
  const next = nextReward(Math.max(best, result.score));
  if (next) lines.push([valve('DOTA_Crownfall_Fishing_Hud_NextReward'), number(next[0])]);
  return <div className="fs-results"><ResultBand message={number(result.score)} lines={lines} record={result.record ? t('Новый рекорд!') : null} board={<BoardOutcome outcome={outcome}/>}>
    <CrownfallButton onClick={onAgain} sound={sound}>{valve('DOTA_Crownfall_Fishing_TryAgain')}</CrownfallButton>
    <CrownfallButton onClick={onMenu} sound={sound}>{t('В меню игры')}</CrownfallButton>
  </ResultBand></div>;
}
