// «Логово Зауга» (Crownfall act III, Valve's shmup): bp_popup_crownfall_encounter_shmup rebuilt for the browser.
// The rules are logic.mjs, the picture render.js (a canvas over Valve's 1720×968 popup .DragonBoss); the menu,
// tutorial, HUD, boss warning, game over and victory keep the classes and timings of Valve's layout, CSS and
// script (zaug.css; the screen sequences of bp_popup_crownfall_encounter_shmup.ts). docs/minigames.md.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createSounds } from '../../core/sound.js';
import { assetBase, bestScore, loadJSON, loadStrings, saveScore } from '../../core/assets.js';
import { CloseButton, CrownfallButton, Fit, KeyHint, Mouse, MuteButton, sharedImage } from '../../core/ui.jsx';
import { BoardOutcome, Leaderboard, useRun } from '../../core/leaderboard.jsx';
import { COMBO_MAX, REWARDS, TICK, WIDTH, HEIGHT, charges, createGame, maxCharges, reserveLives, special, step, swapColor, totalScore, zaugConfig } from './logic.mjs';
import { POPUP_H, POPUP_W, createRenderer, loadArt, loadBackdrop } from './render.js';
import { locale, t } from '../../../../scripts/i18n.mjs';
import { useLanguage } from '../../../useLanguage.js';
import './zaug.css';

const BASE = assetBase('zaug'), IMG = `${BASE}images/`;
const PLAYED_KEY = 'gridstudio.minigames.zaug.played', TUTORIAL_KEY = 'gridstudio.minigames.zaug.tutorial';
const SND = {
  shoot: 'crownfall.shmup.player.shoot', swap: 'crownfall.shmup.player.swap', absorb: 'crownfall.shmup.player.absorb', killed: 'crownfall.shmup.player.killed',
  charge: 'crownfall.shmup.special.gained.charge', chargeMax: 'crownfall.shmup.special.max.charge', chargeLoop: 'crownfall.shmup.special.max.charge.loop',
  homing: 'crownfall.shmup.homing.attack.fire', homingHit: 'crownfall.shmup.homing.attack.explode',
  hit: 'crownfall.shmup.enemy.hit', bonus: 'crownfall.shmup.enemy.hit.bonus.damage', explode: 'crownfall.shmup.enemy.explode', armor: 'crownfall.shmup.enemy.armor',
  combo: 'crownfall.shmup.combo.success', broken: 'crownfall.shmup.combo.broken',
  warning: 'crownfall.shmup.boss.warning', roar: 'crownfall.shmup.boss.roar', breath: 'crownfall.shmup.boss.breath', wing: 'crownfall.shmup.boss.wing',
  splinter: 'crownfall.shmup.boss.splinterblast', embrace: 'crownfall.shmup.boss.coldembrace', shatter: 'crownfall.shmup.boss.coldembrace.shatter',
  attract: 'crownfall.shmup.music.attract', music: 'crownfall.shmup.music', bossMusic: 'crownfall.shmup.boss_music', win: 'crownfall.shmup.music.win', lose: 'crownfall.shmup.music.lose',
};
// The quietest gap between two plays of an event (bullets, hits and absorbs come by the dozen).
const GAP = { [SND.shoot]: 0.09, [SND.absorb]: 0.06, [SND.hit]: 0.05, [SND.bonus]: 0.07, [SND.armor]: 0.25, [SND.homing]: 0.04, [SND.homingHit]: 0.05, [SND.explode]: 0.04 };

const number = (value) => Math.round(Number(value)).toLocaleString(locale);
const remember = (key, value) => { try { localStorage.setItem(key, String(value)); } catch { /* Not remembered. */ } };
const recall = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const wait = (s) => new Promise((done) => setTimeout(done, s * 1000));
// Valve's rich strings: <b>…</b>.
const rich = (text) => String(text).split(/<b>(.*?)<\/b>/g).map((part, j) => (j % 2 ? <b key={j}>{part}</b> : part));

export default function Zaug({ onExit }) {
  useLanguage();
  const [assets, setAssets] = useState(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([loadJSON(`${BASE}data.json`), loadJSON(`${BASE}data/shmup_act3_map.json`), loadJSON(`${BASE}sounds.json`), loadStrings('zaug'), loadJSON('./assets/minigames/shared/sounds.json').catch(() => ({})), loadArt(BASE)])
      .then(([data, map, sounds, valve, shared, art]) => setAssets({ config: zaugConfig(data, map), sounds: createSounds(BASE, sounds), ui: createSounds('./assets/minigames/shared/', shared), valve, art }))
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <div className="mg-loading" role="alert">{t('Не удалось загрузить игру. Обнови страницу.')}</div>;
  if (!assets) return <div className="mg-loading" role="status">{t('Загружаем…')}</div>;
  return <ZaugPopup assets={assets} onExit={onExit}/>;
}

function ZaugPopup({ assets, onExit }) {
  const { config, sounds, ui, valve, art } = assets;
  const canvasRef = useRef(null), rendererRef = useRef(null), gameRef = useRef(null), runRef = useRef(null), hudRef = useRef({}), toastsRef = useRef(null), popupRef = useRef(null);
  const [screen, setScreen] = useState('menu');     // menu → tutorial → play → over | victory
  const [paused, setPaused] = useState(false);
  const [best, setBest] = useState(() => bestScore('zaug')), table = useRun('zaug');
  const [playedOnce, setPlayedOnce] = useState(false), [altControls, setAltControls] = useState(false);
  const [tutorial, setTutorial] = useState(1), [result, setResult] = useState(null), [touch, setTouch] = useState(false);
  const pausedRef = useRef(false); pausedRef.current = paused;
  const screenRef = useRef(screen); screenRef.current = screen;
  const click = useCallback((name) => ui.play(name), [ui]);
  const lastPlayed = useRef({}), music = useRef(null), chargeLoop = useRef(null);

  // Sounds, with a floor on how often the frequent ones repeat.
  const play = useCallback((name, opts) => {
    const now = performance.now() / 1000, gap = GAP[name] || 0;
    if (gap && now - (lastPlayed.current[name] || 0) < gap) return null;
    lastPlayed.current[name] = now;
    return sounds.play(name, opts);
  }, [sounds]);
  const setMusic = useCallback((name) => { music.current?.stop(); music.current = name ? sounds.play(name, { loop: name !== SND.win && name !== SND.lose }) : null; }, [sounds]);

  // Classes on the popup (Valve's state classes): changed without React, they drive zaug.css.
  const cls = useCallback((name, on = true) => popupRef.current?.classList.toggle(name, on), []);

  useEffect(() => { rendererRef.current = createRenderer(canvasRef.current, art); }, [art]);
  useEffect(() => () => { cancelAnimationFrame(runRef.current?.frame); sounds.stopAll(); ui.stopAll(); }, [sounds, ui]);
  useEffect(() => { if (new URLSearchParams(location.search).has('zaugdebug')) window.__zaug = { renderer: () => rendererRef.current, game: () => gameRef.current, start: () => startRef.current?.(true), skip: (s, god) => skipRef.current?.(s, god), run: () => runRef.current }; }, []);

  // The menu: the belt scrolls behind it with Shen in it (Valve's attract camera on her).
  useEffect(() => {
    if (screen !== 'menu') return undefined;
    setMusic(SND.attract);
    let frame = 0; const t0 = performance.now();
    const loop = () => { rendererRef.current?.draw(null, { time: (performance.now() - t0) / 1000, menu: true }); frame = requestAnimationFrame(loop); };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [screen, setMusic]);

  // The HUD reads the game every frame (no React): score, combo and chain pips, reserve, charges, boss bar.
  const paintHud = useCallback((game) => {
    const h = hudRef.current, p = game.player;
    if (h.score) h.score.textContent = number(totalScore(game));
    if (h.combo) h.combo.textContent = String(game.combo);
    if (h.chain) {
      const ch = game.chain, key = `${ch.color}${ch.count}`;
      if (h.chain.dataset.key !== key) { h.chain.dataset.key = key; h.chain.className = `zg-chain ${ch.color === 'red' ? 'zg-chain-red' : ch.color === 'blue' ? 'zg-chain-blue' : ''} zg-chain-${ch.count}`; }
    }
    // the extra lives: Valve's lives count the current one too
    const reserve = reserveLives(game);
    if (h.reserve && h.reserve.dataset.n !== String(reserve)) {
      h.reserve.dataset.n = String(reserve);
      h.reserve.replaceChildren(...Array.from({ length: Math.min(5, reserve) }, (_, i) => { const d = document.createElement('i'); d.className = `zg-reserve-item zg-reserve${i + 1}`; return d; }));
      cls('zg-lives-overflow', reserve > 5);
    }
    const n = charges(game), max = maxCharges(game.config);
    if (h.charges && h.charges.dataset.n !== String(n)) {
      h.charges.dataset.n = String(n);
      [...h.charges.children].forEach((pip, i) => pip.classList.toggle('zg-filled', i < n));
      cls('zg-max-charge', n >= max);
    }
    const b = game.boss;
    if (b && h.hp) { h.hp.style.width = `${b.hp / b.maxHp * 100}%`; h.time.textContent = String(Math.ceil(b.timeLeft)); }
  }, [cls]);

  // A combo notification (Valve's ComboNotification snippet) where the third kill was.
  const toast = useCallback((e) => {
    const layer = toastsRef.current;
    if (!layer) return;
    const el = document.createElement('div');
    const x = e.x / WIDTH * POPUP_W, y = e.y / HEIGHT * POPUP_H;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    if (e.type === 'comboBreak') { el.className = 'zg-combo zg-combo-broken'; el.innerHTML = `<div class="zg-combo-body"><b></b></div>`; el.querySelector('b').textContent = valve('DOTA_Crownfall_Shmup_ComboNotification_Break_Desc'); }
    else {
      const max = e.combo >= COMBO_MAX, tier = max ? 10 : e.combo >= 7 ? 7 : e.combo >= 4 ? 4 : 1;
      el.className = `zg-combo zg-combo-tier${tier} ${max ? 'zg-combo-max' : ''}`;
      el.innerHTML = '<div class="zg-combo-body"><i class="zg-wing zg-wing-l"></i><i class="zg-wing zg-wing-r"></i><img class="zg-score-glow" alt=""/><span class="zg-combo-count"></span><span class="zg-combo-title"></span><span class="zg-combo-score"></span></div>';
      el.querySelector('img').src = `${IMG}score_glow.webp`;
      el.querySelector('.zg-combo-count').textContent = max ? valve('DOTA_Crownfall_Shmup_ComboNotification_ComboMax') : valve('DOTA_Crownfall_Shmup_ComboNotification_ComboCount', { combo_count: e.combo });
      el.querySelector('.zg-combo-title').textContent = valve('DOTA_Crownfall_Shmup_ComboNotification_Title');
      el.querySelector('.zg-combo-score').textContent = valve('DOTA_Crownfall_Shmup_ComboNotification_Desc', { combo_score: number(e.score) });
    }
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }, [valve]);

  // Valve's _BossWarningAnimation.
  const bossWarning = useCallback(async () => {
    cls('zg-warning-active'); await wait(0.05);
    cls('zg-warning-show'); await wait(0.6);
    play(SND.warning);
    cls('zg-warning-play'); await wait(0.3);
    cls('zg-warning-subtitle'); await wait(6);
    cls('zg-warning-show', false); await wait(1);
    cls('zg-warning-play', false); cls('zg-warning-subtitle', false); cls('zg-warning-active', false);
  }, [cls, play]);

  // Game events → sounds, effects, HUD moments.
  const handle = useCallback((events, run) => {
    const game = gameRef.current, r = rendererRef.current;
    for (const e of events) {
      switch (e.type) {
        case 'shoot': play(SND.shoot); break;
        case 'swap': play(SND.swap); break;
        case 'absorb': play(SND.absorb); r.burst('absorb', e.x, e.y, e); game.player.absorbFlash = 0.25; break;
        case 'charge': play(SND.charge); break;
        case 'chargeMax': play(SND.chargeMax); chargeLoop.current?.stop(); chargeLoop.current = sounds.play(SND.chargeLoop, { loop: true }); break;
        case 'special': chargeLoop.current?.stop(); chargeLoop.current = null; break;
        case 'specialShot': play(SND.homing); break;
        case 'specialHit': play(SND.homingHit); r.burst('special', e.x, e.y, e); break;
        case 'hit': play(e.bonus ? SND.bonus : SND.hit); { const en = game.enemies.find((x) => x.id === e.id); if (en) r.burst('hit', en.x + en.def.hitbox[0], en.y + en.def.hitbox[1], e); } break;
        case 'bossHit': play(e.bonus ? SND.bonus : SND.hit); break;
        case 'bossBlocked': play(SND.armor); break;
        case 'kill': play(SND.explode); r.burst('kill', e.x, e.y, { red: e.red, big: e.score >= 25000 }); break;
        case 'selfDestroy': case 'splinterBurst': play(SND.explode); r.burst('kill', e.x, e.y, { red: e.red, big: true }); break;
        case 'combo': play(SND.combo); toast(e); break;
        case 'comboBreak': play(SND.broken); toast(e); break;
        case 'playerKilled': play(SND.killed); r.burst('player', e.x, e.y, e); Object.assign(game.player, { deathAt: run.clock, deadX: e.x, deadY: e.y }); chargeLoop.current?.stop(); chargeLoop.current = null; break;
        case 'ui':
          if (e.name === 'ui.boss_warning') bossWarning();
          else if (e.name === 'music.boss') setMusic(SND.bossMusic);
          else if (e.name === 'music.stop') setMusic(null);
          else if (e.name === 'music.normal') setMusic(SND.music);
          else if (e.name === 'ui.intermission_1' || e.name === 'ui.intermission_2') { run.nextSkin = 'harsh'; run.fadeFrom = run.clock; loadBackdrop(art, 'harsh'); }
          break;
        case 'bossSpawn': play(SND.roar); cls('zg-in-boss'); cls('zg-boss-hud'); break;
        case 'bossAttack': if (e.name === 'embrace') play(SND.embrace); break;
        case 'bossSound': play({ breath: SND.breath, wing: SND.wing, splinter: SND.splinter, roar: SND.roar }[e.name]); break;
        case 'bossShatter': play(SND.shatter); play(SND.roar); r.burst('shatter', game.boss.x - 60, game.boss.y - 200); break;
        case 'bossKilled': play(SND.explode); r.burst('kill', e.x - 40, e.y - 200, { red: true, big: true }); setTimeout(() => r.burst('kill', e.x + 80, e.y - 120, { red: false, big: true }), 300); break;
        case 'bossLeaves': play(SND.roar); break;
        case 'gameOver': run.endAt = run.clock; run.ending = 'over'; break;
        case 'victory': run.endAt = run.clock; run.ending = 'victory'; break;
        default:
      }
    }
  }, [play, sounds, toast, bossWarning, setMusic, cls, art]);

  // Valve's _GameOverAnimation and _VictoryAnimation (with the score counting up).
  const gameOverSequence = useCallback(async (run) => {
    setMusic(SND.lose);
    await wait(1.5); if (runRef.current !== run) return;
    cls('zg-gameover'); cls('zg-fade'); await wait(1.5); if (runRef.current !== run) return;
    cls('zg-gameover-text'); await wait(1); if (runRef.current !== run) return;
    cls('zg-gameover-btns'); setScreen('over');
  }, [cls, setMusic]);
  const victorySequence = useCallback(async (run, game) => {
    const res = game.result;
    const record = saveScore('zaug', Math.round(res.total));
    if (record) setBest(Math.round(res.total));
    setResult({ ...res, record });
    table.submit({ score: Math.round(res.total), stats: { kills: game.kills || 0 } });
    setMusic(SND.win);
    const steps = [[1.5, 'zg-victory-active'], [0, 'zg-fade'], [2, 'zg-victory-show'], [1, 'zg-victory-title'], [2, 'zg-victory-summary'], [1, 'zg-victory-combo-title'], [0.3, 'zg-victory-combo-value'], [0.3, 'zg-victory-score-title'], [0.3, 'zg-victory-score-value']];
    for (const [delay, name] of steps) { if (delay) await wait(delay); if (runRef.current !== run) return; cls(name); }
    setScreen('victory');
    const h = hudRef.current;
    let shown = 0, target = 0;
    const counter = setInterval(() => { if (shown < target) { shown = Math.min(target, shown + Math.max(1, Math.ceil((target - shown) / 23))); if (h.victoryScore) h.victoryScore.textContent = number(shown); } }, 1000 / 60);
    const rows = h.categories ? [...h.categories.children] : [];
    for (const [i, [, value]] of res.scores.entries()) {
      await wait(0.1); rows[i]?.classList.add('zg-show-item');
      await wait(0.6); target += value; await wait(0.1);
    }
    target = Math.round(res.total);
    await wait(1.3); if (runRef.current !== run) { clearInterval(counter); return; }
    cls('zg-victory-rating-title'); await wait(2);
    cls('zg-victory-rating-value'); await wait(0.8);
    cls('zg-shake', false); void popupRef.current?.offsetWidth; cls('zg-shake'); ui.play('General.Coins');
    await wait(2); clearInterval(counter); if (h.victoryScore) h.victoryScore.textContent = number(res.total);
    cls('zg-victory-buttons');
  }, [cls, setMusic, ui, table.submit]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearClasses = useCallback(() => {
    const el = popupRef.current; if (!el) return;
    for (const c of [...el.classList]) if (/^zg-(warning|gameover|fade|victory|in-boss|boss-hud|max-charge|lives-overflow|shake|show-controls)/.test(c)) el.classList.remove(c);
  }, []);

  // The loop: fixed 60 Hz ticks of the rules, a frame of the picture.
  const loop = useCallback(() => {
    const run = runRef.current; if (!run) return;
    const now = performance.now(), dt = Math.min(0.1, (now - run.last) / 1000); run.last = now;
    // ?zaugdebug: window.__zaugFreeze holds the picture (screenshots in a software renderer).
    if (window.__zaugFreeze) { run.frame = requestAnimationFrame(loop); return; }
    const game = gameRef.current, r = rendererRef.current;
    if (!pausedRef.current) {
      run.clock += dt; run.acc += dt;
      while (run.acc >= TICK) {
        run.acc -= TICK;
        const ev = step(game);
        if (ev.length) handle(ev, run);
        if (game.player.absorbFlash) game.player.absorbFlash = Math.max(0, game.player.absorbFlash - TICK);
      }
    }
    if (run.ending && !run.endHandled) { run.endHandled = true; music.current?.stop(); if (run.ending === 'over') gameOverSequence(run); else victorySequence(run, game); }
    let skin = run.skin, nextSkin = null, fade = 0;
    if (run.nextSkin) {
      fade = Math.min(1, (run.clock - run.fadeFrom) / 1.6); nextSkin = run.nextSkin;
      if (fade >= 1) { run.skin = run.nextSkin; skin = run.skin; run.nextSkin = null; nextSkin = null; }
    }
    r.draw(game, { time: run.clock, skin, nextSkin, fade });
    paintHud(game);
    run.frame = requestAnimationFrame(loop);
  }, [handle, paintHud, gameOverSequence, victorySequence]);

  const stopRun = useCallback(() => { if (runRef.current) cancelAnimationFrame(runRef.current.frame); runRef.current = null; chargeLoop.current?.stop(); chargeLoop.current = null; }, []);

  const begin = useCallback(() => {
    stopRun(); clearClasses();
    const first = recall(PLAYED_KEY) !== '1';
    const game = createGame(config, { bonus: first, boss: art.units.boss });
    remember(PLAYED_KEY, '1');
    gameRef.current = game;
    rendererRef.current.clear(); toastsRef.current?.replaceChildren();
    hudRef.current.reserve && (hudRef.current.reserve.dataset.n = '');
    if (hudRef.current.charges) hudRef.current.charges.dataset.n = '';
    setPaused(false); setResult(null); setScreen('play'); setPlayedOnce(true); table.start();
    sounds.preload(Object.values(SND));
    setMusic(SND.music);
    cls('zg-show-controls'); setTimeout(() => { if (gameRef.current === game) cls('zg-show-controls', false); }, 6000);
    runRef.current = { last: performance.now(), clock: 0, acc: 0, frame: 0, skin: 'mellow', nextSkin: null, fadeFrom: 0, ending: null, endHandled: false };
    runRef.current.frame = requestAnimationFrame(loop);
  }, [config, art, sounds, loop, stopRun, clearClasses, setMusic, cls, table.start]); // eslint-disable-line react-hooks/exhaustive-deps

  // «Играть»: the tutorial the first time (Valve's TutorialUI, six steps), then the run.
  const start = useCallback((skipTutorial = false) => {
    if (!skipTutorial && recall(TUTORIAL_KEY) !== '1') { setTutorial(1); setScreen('tutorial'); return; }
    begin();
  }, [begin]);
  const startRef = useRef(null); startRef.current = start;
  const nextTutorial = useCallback(() => {
    if (tutorial < 6) { setTutorial(tutorial + 1); return; }
    remember(TUTORIAL_KEY, '1'); begin();
  }, [tutorial, begin]);

  // Debug: jump ahead (Playwright checks of the later sections and the boss).
  const skipRef = useRef(null);
  skipRef.current = (seconds, god = true) => {
    const game = gameRef.current, run = runRef.current; if (!game || !run) return;
    const until = game.time + seconds;
    while (game.time < until && game.phase === 'running') { game.godMode = !!god; const ev = step(game); if (ev.length) handle(ev.filter((e) => e.type === 'ui' || e.type.startsWith('boss')), run); }
    game.godMode = false;
    run.clock += seconds;
  };

  const toMenu = useCallback(() => { stopRun(); clearClasses(); sounds.stopAll(); gameRef.current = null; setPaused(false); setScreen('menu'); }, [stopRun, clearClasses, sounds]);

  // Input: WASD / arrows move; Z or the left button shoots (held), X or the right button swaps the colour,
  // Space or the middle button fires the special; Esc or F9 pauses. Touch: drag to steer, fire is automatic.
  useEffect(() => {
    const keys = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
    const down = (event) => {
      if (event.target.closest?.('input, textarea')) return;
      const game = gameRef.current, playing = screenRef.current === 'play' && game && !pausedRef.current;
      if (event.key === 'Escape' || event.code === 'F9') {
        event.preventDefault();
        if (screenRef.current === 'menu') onExit();
        else if (screenRef.current === 'tutorial') setScreen('menu');
        else if (screenRef.current === 'play' && game?.phase === 'running') setPaused((v) => !v);
        else if (screenRef.current === 'over' || screenRef.current === 'victory') toMenu();
        return;
      }
      if (!playing) return;
      if (keys[event.code]) { game.input[keys[event.code]] = true; event.preventDefault(); }
      else if (event.code === 'KeyZ') { game.input.fire = true; event.preventDefault(); }
      else if (event.code === 'KeyX') { if (!event.repeat) handle(swapColor(game), runRef.current); event.preventDefault(); }
      else if (event.code === 'Space') { if (!event.repeat) handle(special(game), runRef.current); event.preventDefault(); }
    };
    const up = (event) => {
      const game = gameRef.current; if (!game) return;
      if (keys[event.code]) game.input[keys[event.code]] = false;
      else if (event.code === 'KeyZ') game.input.fire = false;
    };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [onExit, toMenu, handle]);
  // A hidden tab or a lost focus pauses; every held key is let go.
  useEffect(() => {
    if (screen !== 'play') return undefined;
    const hide = () => { const g = gameRef.current; if (g) Object.assign(g.input, { up: false, down: false, left: false, right: false, fire: false, target: null }); if (g?.phase === 'running') setPaused(true); };
    const onVis = () => { if (document.hidden) hide(); };
    document.addEventListener('visibilitychange', onVis); window.addEventListener('blur', hide);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('blur', hide); };
  }, [screen]);
  useEffect(() => { if (runRef.current) runRef.current.last = performance.now(); cls('zg-paused', paused); }, [paused, cls]);

  const drag = useRef(null);
  const fieldPoint = (event) => { const rect = canvasRef.current.getBoundingClientRect(); return [(event.clientX - rect.left) / rect.width * WIDTH, (event.clientY - rect.top) / rect.height * HEIGHT]; };
  const onPointerDown = (event) => {
    const game = gameRef.current;
    if (screenRef.current !== 'play' || !game || pausedRef.current) return;
    event.preventDefault();
    if (event.pointerType === 'mouse') {
      if (event.button === 0) game.input.fire = true;
      else if (event.button === 2) handle(swapColor(game), runRef.current);
      else if (event.button === 1) handle(special(game), runRef.current);
      return;
    }
    setTouch(true);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Not a live pointer. */ }
    drag.current = { id: event.pointerId, from: fieldPoint(event), ship: [game.player.x, game.player.y] };
    game.input.fire = true;
  };
  const onPointerMove = (event) => {
    const game = gameRef.current, d = drag.current;
    if (!game || !d || d.id !== event.pointerId) return;
    const [x, y] = fieldPoint(event);
    game.input.target = [d.ship[0] + (x - d.from[0]) * 1.3, d.ship[1] + (y - d.from[1]) * 1.3];
  };
  const onPointerUp = (event) => {
    const game = gameRef.current; if (!game) return;
    if (event.pointerType === 'mouse') { if (event.button === 0) game.input.fire = false; return; }
    if (drag.current?.id === event.pointerId) { drag.current = null; game.input.target = null; game.input.fire = false; }
  };

  const inGame = screen === 'play' || screen === 'over' || screen === 'victory';
  const classes = ['zg-popup', screen === 'menu' && 'zg-main-menu', screen === 'tutorial' && `zg-tutorial zg-tutorial-step${tutorial}`, inGame && 'zg-running', screen === 'play' && !paused && 'zg-game-running', altControls && 'zg-alt-controls', playedOnce && 'zg-played', touch && 'zg-touch'].filter(Boolean).join(' ');

  return <Fit className="zg-fit">
    <div className={classes} onContextMenu={(event) => event.preventDefault()}>
      {/* The state classes of Valve's script (boss warning, game over, victory steps…) are set on this inner box
          directly: React never rewrites its className. */}
      <div className="zg-state" ref={popupRef}>
      <div className="zg-gameplay">
        <div className="zg-pause-overlay">
          <canvas ref={canvasRef} width={POPUP_W} height={POPUP_H} className="zg-canvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onAuxClick={(e) => e.preventDefault()}/>
          <div className="zg-toasts" ref={toastsRef}/>
          <BossWarning valve={valve}/>
          {inGame && <BossBar valve={valve} hudRef={hudRef}/>}
        </div>
      </div>
      {screen === 'menu' && <MainMenu valve={valve} best={best} playedOnce={playedOnce} onPlay={() => start()} onExit={onExit} sound={click} altControls={altControls} setAltControls={setAltControls}/>}
      {screen === 'tutorial' && <Tutorial valve={valve} step={tutorial} onNext={nextTutorial} sound={click}/>}
      {inGame && <Hud valve={valve} hudRef={hudRef} config={config}/>}
      {inGame && <ControlsDisplay valve={valve}/>}
      {screen === 'play' && paused && <div className="zg-pause-ui"><div className="zg-menu-buttons">
        <CrownfallButton onClick={() => setPaused(false)} sound={click}>{valve('DOTA_Crownfall_Shmup_PauseMenu_Resume')}</CrownfallButton>
        <CrownfallButton onClick={toMenu} sound={click}>{valve('DOTA_Crownfall_Shmup_PauseMenu_Abort')}</CrownfallButton></div></div>}
      {inGame && <div className="zg-gameover-ui">
        <div className="zg-gameover-title">{valve('DOTA_Crownfall_Shmup_GameOver_Title')}</div>
        <div className="zg-gameover-buttons">
          <CrownfallButton onClick={() => start(true)} sound={click}>{valve('DOTA_Crownfall_Shmup_GameOver_Retry')}</CrownfallButton>
          <CrownfallButton onClick={toMenu} sound={click}>{valve('DOTA_Crownfall_Shmup_GameOver_Abort')}</CrownfallButton>
        </div>
        {gameRef.current?.result?.reason === 'time' && <div className="zg-gameover-note">{t('Зауг улетел: время боя вышло.')}</div>}
      </div>}
      {inGame && result && <Victory valve={valve} result={result} outcome={table.outcome} hudRef={hudRef} onAgain={() => start(true)} onMenu={toMenu} sound={click}/>}
      {touch && screen === 'play' && <div className="zg-touch-buttons">
        <button type="button" className="zg-touch-swap" onPointerDown={(e) => { e.stopPropagation(); const g = gameRef.current; if (g) handle(swapColor(g), runRef.current); }} aria-label={valve('DOTA_Crownfall_Shmup_HowToPlay_Swap')}/>
        <button type="button" className="zg-touch-special" onPointerDown={(e) => { e.stopPropagation(); const g = gameRef.current; if (g) handle(special(g), runRef.current); }} aria-label={valve('DOTA_Crownfall_Shmup_HowToPlay_Special')}/>
      </div>}
      <CloseButton mode={screen === 'menu' ? 'close' : 'return'} onClick={screen === 'menu' ? onExit : toMenu} label={screen === 'menu' ? t('Закрыть') : t('В меню игры')}/>
      <div className="zg-corner">
        <MuteButton/>
        {screen === 'play' && <KeyHint label={paused ? valve('DOTA_FightingGame_HUD_UnPause') : valve('DOTA_Crownfall_Shmup_Pause')} keyName="Esc" onClick={() => { if (gameRef.current?.phase === 'running') setPaused((v) => !v); }}/>}
      </div>
      </div>
    </div>
  </Fit>;
}

// .PregameUI: the logo and the MainMenu (how to play in four quadrants, scoring; this browser's best and the
// rewards in the second column), «Играть» / «Уйти».
function MainMenu({ valve, best, playedOnce, onPlay, onExit, sound, altControls, setAltControls }) {
  const Key = ({ k, cls = '' }) => <span className={`zg-key ${cls}`}>{k}</span>;
  const Arrow = ({ dir }) => <span className="zg-key"><img src={sharedImage(`arrow_${dir}.svg`)} alt=""/></span>;
  const quadrant = (main, alt, title, details) => <div className="zg-quadrant">
    <div className="zg-quadrant-contents"><div className="zg-row zg-main-row">{main}</div><div className="zg-row zg-alt-row">{alt}</div></div>
    <div className="zg-quadrant-text"><b>{title}</b>{details && <span>{details}</span>}</div>
  </div>;
  return <div className="zg-pregame">
    <div className="zg-logo" role="img" aria-label={valve('DOTA_Crownfall_Archive_Minigame_ZaugsLair')}/>
    <div className="zg-main-menu-box" role="dialog" aria-label={valve('DOTA_Crownfall_Archive_Minigame_ZaugsLair')}>
      <div className="zg-columns">
        <div className="zg-column1">
          <div className="zg-gold-header">{valve('DOTA_Crownfall_Overworld_HowToPlay')}</div>
          {quadrant(<div className="zg-keys"><Key k="W"/><div><Key k="A"/><Key k="S"/><Key k="D"/></div></div>,
            <div className="zg-keys"><Arrow dir="up"/><div><Arrow dir="left"/><Arrow dir="down"/><Arrow dir="right"/></div></div>, valve('DOTA_Crownfall_Shmup_HowToPlay_Move'))}
          {quadrant(<Mouse button="left"/>, <Key k="Z"/>, valve('DOTA_Crownfall_Shmup_HowToPlay_Shoot'), valve('DOTA_Crownfall_Shmup_HowToPlay_Shoot_Details'))}
          {quadrant(<Mouse button="right"/>, <Key k="X"/>, valve('DOTA_Crownfall_Shmup_HowToPlay_Swap'), valve('DOTA_Crownfall_Shmup_HowToPlay_Swap_Details'))}
          {quadrant(<Mouse button="middle"/>, <span className="zg-key zg-key-space"><img src={sharedImage('space.svg')} alt=""/></span>, valve('DOTA_Crownfall_Shmup_HowToPlay_Special'), valve('DOTA_Crownfall_Shmup_HowToPlay_Special_Details'))}
          <div className="zg-quadrant zg-alt-quadrant">
            <button type="button" className={`zg-toggle ${altControls ? 'zg-on' : ''}`} onClick={() => setAltControls(!altControls)} aria-pressed={altControls}><i/>{valve('DOTA_Crownfall_Shmup_HowToPlay_ShowAltControls')}</button>
          </div>
          <div className="zg-scoring">
            <div className="zg-gold-header">{valve('DOTA_Crownfall_Shmup_HowToPlay_Score')}</div>
            <p>{valve('DOTA_Crownfall_Shmup_HowToPlay_Score_Details')}</p>
          </div>
        </div>
        <div className="zg-column2">
          <Leaderboard game="zaug" className="zg-board" headClass="zg-leader-head" label={valve('DOTA_Crownfall_Fishing_Leaderboard_Score')} format={number} local={best} rows={3}/>
          <p className="zg-encounter-desc"><b>{valve('DOTA_Crownfall_EncounterName_FinalShmup')}</b>{valve('DOTA_Crownfall_EncounterDesc_FinalShmup')}</p>
          <div className="zg-rewards-title" title={valve('DOTA_Crownfall_Shmup_HowToPlay_RewardsInfo')}><span className="zg-gold-header">{valve('DOTA_Crownfall_Fishing_Rewards')}</span><span className="mg-info">i</span></div>
          <div className="zg-rewards">{REWARDS.map((at, i) => <div key={at} className={`zg-reward-row ${best >= at ? 'zg-unlocked' : ''}`}><span>{number(at)}</span><i>{Array.from({ length: i === 0 ? 1 : 2 }, (_, k) => <em key={k}/>)}</i></div>)}</div>
          <p className="zg-rewards-info">{valve('DOTA_Crownfall_Shmup_HowToPlay_RewardsInfo')}</p>
          <p className="zg-touch-note">{t('На телефоне: ведите пальцем — Шен летит и стреляет сама, кнопки справа меняют цвет и запускают особую атаку.')}</p>
        </div>
      </div>
      <div className="zg-bottom-buttons">
        <CrownfallButton className="zg-start" onClick={onPlay} sound={sound}>{valve('DOTA_Crownfall_Fishing_Play')}</CrownfallButton>
        {playedOnce && <CrownfallButton onClick={onExit} sound={sound}>{valve('DOTA_Crownfall_Encounter_Leave')}</CrownfallButton>}
      </div>
    </div>
  </div>;
}

// .TutorialUI: six steps, Valve's two looping videos (shmup_1 for 1–4, shmup_2 for 5–6), «Ясно».
function Tutorial({ valve, step, onNext, sound }) {
  return <div className="zg-tutorial-ui">
    <div className="zg-logo zg-logo2" aria-hidden="true"/>
    <div className="zg-tutorial-contents">
      <div className="zg-movies">
        <video className={`zg-movie ${step <= 4 ? 'zg-on' : ''}`} src={`${BASE}videos/shmup_1.webm`} autoPlay loop muted playsInline/>
        <video className={`zg-movie ${step >= 5 ? 'zg-on' : ''}`} src={`${BASE}videos/shmup_2.webm`} autoPlay loop muted playsInline/>
      </div>
      <div className="zg-tutorial-text">{[1, 2, 3, 4, 5, 6].map((n) => <p key={n} className={n === step ? 'zg-on' : ''}><span>{rich(valve(`DOTA_Crownfall_Shmup_Tutorial_${n}`))}</span></p>)}</div>
      <div className="zg-tutorial-steps">{[1, 2, 3, 4, 5, 6].map((n) => <i key={n} className={n <= step ? 'zg-on' : ''}/>)}</div>
      <CrownfallButton className="zg-next" onClick={onNext} sound={sound}>{valve('DOTA_Crownfall_Shmup_Tutorial_GotIt')}</CrownfallButton>
    </div>
  </div>;
}

// .InGameUI: ScoreBar (score, combo + three chain pips), StatusReserve (extra lives), ChargeContainer.
function Hud({ valve, hudRef, config }) {
  const set = (name) => (el) => { hudRef.current[name] = el; };
  return <div className="zg-ingame">
    <div className="zg-scorebar">
      <div className="zg-status-score"><span className="zg-score-title">{valve('DOTA_Crownfall_Shmup_Game_Score_Title')}</span><b className="zg-score" ref={set('score')}>0</b></div>
      <div className="zg-combo-score"><span className="zg-score-title">{valve('DOTA_Crownfall_Shmup_Game_Combo_Title')}</span>
        <div className="zg-combo-value"><b ref={set('combo')}>0</b><span className="zg-chain" ref={set('chain')}><i className="zg-pip1"/><i className="zg-pip2"/><i className="zg-pip3"/></span></div></div>
    </div>
    <div className="zg-status-reserve"><span className="zg-score-title">{valve('DOTA_Crownfall_Shmup_Game_Lives_Title')}</span><div className="zg-reserve" ref={set('reserve')}/></div>
    <div className="zg-charge-container">
      <div className="zg-charge-text"><span>{valve('DOTA_Crownfall_Shmup_Game_Charges')}</span><span className="zg-max-text">{valve('DOTA_Crownfall_Shmup_Game_Max')}</span></div>
      <div className="zg-charge-meter" ref={set('charges')}>{Array.from({ length: maxCharges(config) }, (_, i) => <i key={i} className="zg-charge-pip"/>)}</div>
    </div>
  </div>;
}
// .BossFight: «ЗАУГ», the health bar, «Время» and the seconds left.
function BossBar({ valve, hudRef }) {
  const set = (name) => (el) => { hudRef.current[name] = el; };
  return <div className="zg-boss-fight">
    <div className="zg-boss-title">{valve('DOTA_Crownfall_Shmup_BossHealthBar_Title')}</div>
    <div className="zg-hp-bar"><div className="zg-hp-left" ref={set('hp')}/></div>
    <div className="zg-boss-time">{valve('DOTA_Crownfall_Shmup_BossHealthBar_Time')}</div>
    <div className="zg-boss-time-left" ref={set('time')}>101</div>
  </div>;
}
function BossWarning({ valve }) {
  const title = valve('DOTA_Crownfall_Shmup_BossWarning_Title'), desc = valve('DOTA_Crownfall_Shmup_BossWarning_Desc');
  return <div className="zg-boss-warning" aria-live="polite">
    <div className="zg-warning-bg"/>
    <div className="zg-chevrons zg-chevrons-top"><i/></div><div className="zg-chevrons zg-chevrons-bottom"><i/></div>
    <div className="zg-warning-layout">
      <div className="zg-warning-title"><span className="zg-main">{title}</span><span className="zg-blur" aria-hidden="true">{title}</span></div>
      <div className="zg-warning-desc"><span className="zg-main">{desc}</span><span className="zg-blur" aria-hidden="true">{desc}</span></div>
    </div>
  </div>;
}
// #ControlsDisplay: at the start of a run and while paused.
function ControlsDisplay({ valve }) {
  const Key = ({ k, wide }) => <span className={`zg-key ${wide ? 'zg-key-wide' : ''}`}>{k}</span>;
  const Arrow = ({ dir }) => <span className="zg-key"><img src={sharedImage(`arrow_${dir}.svg`)} alt=""/></span>;
  return <div className="zg-controls-display" aria-hidden="true">
    <div className="zg-keys"><Key k="W"/><div><Key k="A"/><Key k="S"/><Key k="D"/></div></div>
    <Mouse button="left"/><Mouse button="right"/><Mouse button="middle"/>
    <span className="zg-or">{valve('DOTA_Crownfall_Shmup_ControlDisplay_Separator')}</span>
    <div className="zg-keys"><div><Key k="Z"/><Key k="X"/></div><Key k="Space" wide/></div>
    <div className="zg-keys"><Arrow dir="up"/><div><Arrow dir="left"/><Arrow dir="down"/><Arrow dir="right"/></div></div>
  </div>;
}
// .VictoryUI: title, subtitle, «Результаты», max combo, score (counting up), rating stamp; the score categories.
function Victory({ valve, result, outcome, hudRef, onAgain, onMenu, sound }) {
  const set = (name) => (el) => { hudRef.current[name] = el; };
  return <div className="zg-victory-ui">
    <div className="zg-victory-main">
      <div className="zg-v zg-victory-title-text">{valve('DOTA_Crownfall_Shmup_Victory_Title')}</div>
      <div className="zg-v zg-victory-subtitle">{valve('DOTA_Crownfall_Shmup_Victory_Subtitle')}</div>
      <div className="zg-v zg-victory-desc">{valve('DOTA_Crownfall_Shmup_Victory_Desc')}</div>
      <div className="zg-v zg-victory-combo-t">{valve('DOTA_Crownfall_Shmup_Victory_Combo_Title')}</div>
      <div className="zg-v zg-victory-combo-v">{result.maxCombo}</div>
      <div className="zg-v zg-victory-score-t">{valve('DOTA_Crownfall_Shmup_Victory_Score_Title')}</div>
      <div className="zg-v zg-victory-score-v" ref={set('victoryScore')}>0</div>
      <div className="zg-v zg-victory-rating-t">{valve('DOTA_Crownfall_Shmup_Victory_Rating_Title')}</div>
      <div className="zg-v zg-victory-rating-v">{valve(`DOTA_Crownfall_Shmup_ScoreRating_${result.rating}`)}</div>
      {result.record && <div className="zg-v zg-victory-record">{t('Новый рекорд!')}</div>}
      {outcome && <div className="zg-v zg-victory-record zg-victory-board"><BoardOutcome outcome={outcome}/></div>}
      <div className="zg-v zg-victory-buttons-row">
        <CrownfallButton onClick={onAgain} sound={sound}>{valve('DOTA_Crownfall_Shmup_Victory_Retry')}</CrownfallButton>
        <CrownfallButton onClick={onMenu} sound={sound}>{valve('DOTA_Crownfall_Shmup_Victory_Abort')}</CrownfallButton>
      </div>
    </div>
    <div className="zg-victory-categories" ref={set('categories')}>
      {/* categories with no points are not listed (Valve's results screen) */}
      {result.scores.map(([key, value]) => <div key={key} className="zg-score-item"><span>{valve(`DOTA_Crownfall_Shmup_ScoreCategory_${key}`)}</span><b>{number(value)}</b></div>)}
    </div>
  </div>;
}
