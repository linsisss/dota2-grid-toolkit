// «Терновый трон» (Crownfall act IV, Valve's `survivors`): bp_popup_crownfall_encounter_survivors rebuilt for the
// browser. The rules are logic.mjs (numbers from Valve's vdata, data.mjs), the picture render.js (a canvas under
// Valve's 1560×975 popup); the screens — setup, hero select, upgrades and echelons, the HUD, level-up cards,
// pause, the results — keep the classes and layout of Valve's XML and CSS (thorns.css). docs/minigames.md.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createSounds } from '../../core/sound.js';
import { assetBase, bestScore, loadJSON, loadStrings, saveScore } from '../../core/assets.js';
import { CloseButton, CrownfallButton, Fit, MuteButton, sharedImage } from '../../core/ui.jsx';
import { BoardOutcome, Leaderboard, useRun } from '../../core/leaderboard.jsx';
import { OPEN_MAP, ECHELONS, dialogueIndex, thornsConfig } from './data.mjs';
import { TICK, choose, createGame, dash, reroll, step, xpProgress, gainXp, hurtPlayer } from './logic.mjs';
import { POPUP_H, POPUP_W, arenaFromArt, createRenderer, drawMinimap, loadArt, nightLevel } from './render.js';
import { attrLine, attrName, cardInfo, cooldownShare, fmt, iconOf, statRows } from './cards.js';
import { locale, t } from '../../../../scripts/i18n.mjs';
import { useLanguage } from '../../../useLanguage.js';
import './thorns.css';

const BASE = assetBase('thorns'), IMG = `${BASE}images/`, NOVEL_PORTRAITS = './assets/minigames/novel/portraits/';
const PROFILE_KEY = 'gridstudio.minigames.thorns';
const MUSIC = { setup: 'survivors.game_music.setup', active: 'survivors.game_music.active', boss: 'survivors.game_music.boss', win: 'survivors.game_music.win', loss: 'survivors.game_music.loss' };
// The quietest gap between two plays of an event (hits come by the hundred).
const GAP = { 'survivors.xp_pickup': 0.05, 'survivors.gold_pickup': 0.08, 'survivors.magic_missile.hit': 0.08, 'survivors.arcane_bolt.hit': 0.06, 'survivors.arcane_bolt.cast': 0.06, 'survivors.knife_throw.hit': 0.06, 'survivors.knife_throw.cast': 0.06,
  'survivors.chain_frost.hit': 0.1, 'survivors.echo_strike.tick': 0.1, 'survivors.mortimer_kisses.tick': 0.12, 'survivors.land_mine.explode': 0.1, 'survivors.imperia.burning_ground.impact': 0.15, 'survivors.imperia.magic_missile.projectile.hit': 0.1,
  'survivors.death.vase': 0.08, 'survivors.player_hit.shen': 0.6, 'survivors.player_hit.dragonus': 0.6, 'survivors.player_hit.kez': 0.6, 'survivors.kez.innate.crit': 0.1 };
// Hero ids of Valve's CSS classes (SurvivorsHero_N) and their card backgrounds.
const HERO_ID = { shen: 1, dragonus: 2, kez: 3 };
const HERO_BG = { shen: 'faceless_void', dragonus: 'lich', kez: 'slardar' };
const ACTOR_PORTRAIT = { Imperia: 'imperia_portrait_idle', Shen: 'vengeful_spirit_demon_portrait_idle', Dragonus: 'skywrath_mage_portrait_idle', Kestrel: 'kez_portrait_idle', CrownConsul: 'crownconsul_portrait_idle',
  Maiden: 'crystal_maiden_portrait_idle', Screeauk: 'skreeauk_portrait_idle', Bakeet: 'bakeet_portrait_idle', Centaur: 'centaur_portrait_idle', Axe: 'axe_portrait_idle', Lina: 'lina_portrait_idle', Pudge: 'pudge_portrait_idle',
  Gralla: 'gralla_portrait_idle', Squee: 'squee_portrait_idle', Kunkka: 'kunkka_portrait_amused', Spleen: 'novel:spleen_portrait_idle', Spoon: 'novel:spoon_portrait_idle', popup: 'imperia_portrait_shocked' };
const portraitUrl = (actor) => { const p = ACTOR_PORTRAIT[actor] || 'imperia_portrait_idle'; return p.startsWith('novel:') ? `${NOVEL_PORTRAITS}${p.slice(6)}.webp` : `${IMG}portraits/${p}.webp`; };
const ELITE_ICON = { elite_resurrecting_enemy: 'MinimapResurrectorIcon', elite_turrets: 'MinimapArcherIcon', elite_absorber: 'MinimapAbsorberIcon', elite_granite_golem_large: 'MinimapGolemIcon' };
const ELITE_NAME = { elite_resurrecting_enemy: 'DOTA_Survivors_DefeatResurrector', elite_turrets: 'DOTA_Survivors_DefeatArcher', elite_absorber: 'DOTA_Survivors_DefeatAbsorber', elite_granite_golem_large: 'DOTA_Survivors_DefeatGolem' };

const number = (v) => Math.round(Number(v) || 0).toLocaleString(locale);
const clock = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const rich = (text) => String(text).split(/<b>(.*?)<\/b>/g).map((part, j) => (j % 2 ? <b key={j}>{part}</b> : part));
function readProfile() {
  try { return { gold: 0, tiers: {}, unlocked: 1, echelon: 1, hero: 'shen', intro: false, played: false, noDialogue: false, starts: {}, ...JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') }; }
  catch { return { gold: 0, tiers: {}, unlocked: 1, echelon: 1, hero: 'shen', intro: false, played: false, noDialogue: false, starts: {} }; }
}
const writeProfile = (p) => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* Not remembered. */ } };

export default function Thorns({ onExit }) {
  useLanguage();
  const [assets, setAssets] = useState(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([loadJSON(`${BASE}data.json`), loadJSON(`${BASE}sounds.json`), loadStrings('thorns'), loadJSON('./assets/minigames/shared/sounds.json').catch(() => ({})), loadArt(BASE), loadJSON(`${BASE}strings.en.json`)])
      .then(([data, sounds, valve, shared, art, en]) => {
        const config = thornsConfig(data, arenaFromArt(art, OPEN_MAP));
        setAssets({ config, art, valve, dialogue: dialogueIndex(en), sounds: createSounds(BASE, sounds), ui: createSounds('./assets/minigames/shared/', shared) });
      })
      .catch((e) => { console.error(e); setFailed(true); });
  }, []);
  if (failed) return <div className="mg-loading" role="alert">{t('Не удалось загрузить игру. Обнови страницу.')}</div>;
  if (!assets) return <div className="mg-loading" role="status">{t('Загружаем…')}</div>;
  return <ThornsPopup assets={assets} onExit={onExit}/>;
}

function ThornsPopup({ assets, onExit }) {
  const { config, art, valve, sounds, ui, dialogue } = assets;
  const canvasRef = useRef(null), minimapRef = useRef(null), rendererRef = useRef(null), gameRef = useRef(null), runRef = useRef(null), hudRef = useRef({}), stateRef = useRef(null);
  const [profile, setProfileState] = useState(readProfile);
  const profileRef = useRef(profile); profileRef.current = profile;
  const setProfile = useCallback((update) => { setProfileState((p) => { const next = typeof update === 'function' ? update(p) : { ...p, ...update }; writeProfile(next); return next; }); }, []);
  const [screen, setScreen] = useState('setup');       // setup → hero → difficulty → play → over
  const [paused, setPaused] = useState(false), [choice, setChoice] = useState(null), [version, setVersion] = useState(0);
  const [novel, setNovel] = useState(null), [chatter, setChatter] = useState(null), [result, setResult] = useState(null), [patchNotes, setPatchNotes] = useState(false);
  const [best, setBest] = useState(() => bestScore('thorns')), [touch, setTouch] = useState(false), [rerolling, setRerolling] = useState(false);
  const pausedRef = useRef(false); pausedRef.current = paused;
  const table = useRun('thorns');
  const novelRef = useRef(null); novelRef.current = novel;
  const screenRef = useRef(screen); screenRef.current = screen;
  const click = useCallback((name) => ui.play(name), [ui]);
  const lastPlayed = useRef({}), music = useRef(null), musicName = useRef(null);

  const play = useCallback((name, opts) => {
    const now = performance.now() / 1000, gap = GAP[name] ?? 0.03;
    if (now - (lastPlayed.current[name] || 0) < gap) return null;
    lastPlayed.current[name] = now;
    return sounds.play(name, opts);
  }, [sounds]);
  const setMusic = useCallback((name) => {
    if (musicName.current === name) return;
    music.current?.stop(0.6); musicName.current = name;
    music.current = name ? sounds.play(name, { loop: name !== MUSIC.win && name !== MUSIC.loss }) : null;
  }, [sounds]);
  // Valve's state classes on the popup root, changed without React (GameState_*, IsPaused, ShowPowerUpChoices…).
  const cls = useCallback((name, on = true) => stateRef.current?.classList.toggle(name, on), []);

  useEffect(() => { rendererRef.current = createRenderer(canvasRef.current, art); }, [art]);
  useEffect(() => () => { cancelAnimationFrame(runRef.current?.frame); sounds.stopAll(); ui.stopAll(); }, [sounds, ui]);
  useEffect(() => { if (screen === 'setup' || screen === 'hero' || screen === 'difficulty') setMusic(MUSIC.setup); }, [screen, setMusic]);
  useEffect(() => { const unlock = () => { if (screenRef.current !== 'play' && screenRef.current !== 'over') setMusic(MUSIC.setup); }; window.addEventListener('pointerdown', unlock, { once: true }); return () => window.removeEventListener('pointerdown', unlock); }, [setMusic]);

  // --- dialogue -----------------------------------------------------------------------------------------
  // A conversation of a topic list: the first topic that has lines; in-run lines play as chatter (top of the
  // screen, 3.4 s a line), the run's opening as Valve's visual novel (click to go on).
  const pickConversation = useCallback((topics, exclude) => {
    for (const topic of topics) {
      const convs = dialogue[topic];
      if (!convs?.length) continue;
      const left = convs.filter((c) => !exclude?.has(c.id));
      const pool = left.length ? left : convs;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    return null;
  }, [dialogue]);
  const chatterQueue = useRef([]);
  const sayChatter = useCallback((topics) => {
    if (profileRef.current.noDialogue) return;
    const conv = pickConversation(topics, gameRef.current?.dialogue.said);
    if (!conv) return;
    gameRef.current?.dialogue.said.add(conv.id);
    chatterQueue.current = conv.lines.slice(0, 4);
    const next = () => {
      const line = chatterQueue.current.shift();
      if (!line) { setChatter(null); return; }
      setChatter({ ...line, until: performance.now() + 3400 });
      clearTimeout(chatterQueue.timer); chatterQueue.timer = setTimeout(next, 3400);
    };
    next();
  }, [pickConversation]);

  // --- HUD painting (every frame, no React) -----------------------------------------------------------------
  const paintHud = useCallback((game) => {
    const h = hudRef.current, p = game.player;
    if (h.timer) h.timer.textContent = clock(game.stage === 'boss' ? game.time : game.floorTime);
    if (h.timeline) h.timeline.style.width = `${Math.min(100, game.floorTime / game.floorLimit * 100)}%`;
    if (h.score) h.score.textContent = number(game.score);
    if (h.gold) h.gold.textContent = number(game.gold);
    if (h.level) h.level.textContent = String(p.level);
    if (h.xp) h.xp.style.setProperty('--xp', `${xpProgress(game) * 360}deg`);
    if (h.hpBar) h.hpBar.style.width = `${Math.max(0, p.hp / p.maxHp * 100)}%`;
    if (h.hpText) h.hpText.textContent = `${Math.ceil(Math.max(0, p.hp))} / ${Math.round(p.maxHp)}`;
    if (h.regen) h.regen.textContent = game.stats.HPRegen ? `+${fmt(game.stats.HPRegen, 1)}` : '';
    for (const ab of game.abilities) {
      const slot = h[`slot_${ab.def.key}`]; if (!slot) continue;
      const share = cooldownShare(game, ab);
      slot.classList.toggle('OnCooldown', share > 0.02 && ab.cooldown > 0.4);
      const bar = slot.querySelector('.PowerUpCooldownProgress'); if (bar) bar.style.height = `${share * 100}%`;
      const label = slot.querySelector('.PowerupCooldownLabel'); if (label) label.textContent = ab.cooldown > 0.4 ? String(Math.ceil(ab.cooldown)) : '';
      slot.classList.toggle('AbilityActive', game.time - (ab.firedAt || -9) < 0.25);
    }
    const b = game.boss;
    if (b && h.bossBar) { h.bossBar.style.width = `${Math.max(0, b.hp / b.maxHp * 100)}%`; h.bossText.textContent = `${number(Math.max(0, b.hp))} / ${number(b.maxHp)}`; }
    if (h.dash) h.dash.dataset.charges = String(p.dashCharges);
    if (minimapRef.current && (game.tick % 4 === 0)) drawMinimap(minimapRef.current, art, game);
    cls('IsInBossStage', game.stage === 'boss');
    cls('IsNight', nightLevel(game) > 0.5);
  }, [art, cls]);

  const flash = useCallback((name, seconds) => { cls(name, false); void stateRef.current?.offsetWidth; cls(name); clearTimeout(flash[name]); flash[name] = setTimeout(() => cls(name, false), seconds * 1000); }, [cls]);

  // --- game events → sounds, banners, dialogue ------------------------------------------------------------
  const handle = useCallback((events, run) => {
    const game = gameRef.current;
    for (const e of events) {
      switch (e.type) {
        case 'sound': play(e.name); break;
        case 'playerHit': flash('PlayerTookDamage', 0.8); run.shake = Math.max(run.shake, 0.35); break;
        case 'shake': run.shake = Math.max(run.shake, 0.6); break;
        case 'flash': run.shake = Math.max(run.shake, 0.3); break;
        case 'choice': setChoice({ ...game.choice }); cls('ShowPowerUpChoices'); break;
        case 'chosen': setVersion((v) => v + 1); break;
        case 'eliteUnlocked': flash('MiniBossWarning', 4); setVersion((v) => v + 1); break;
        case 'minibossArrived': run.banner = valve('DOTA_Survivors_MinibossArrived', { miniboss_name: valve(game.config.spawners[game.elite.active?.spawner]?.displayName || e.name) }); hudRef.current.arrived && (hudRef.current.arrived.textContent = run.banner); flash('MinibossArrived', 3); setVersion((v) => v + 1); break;
        case 'minibossKilled': setVersion((v) => v + 1); break;
        case 'dialogue': sayChatter(e.topics); break;
        case 'bossStage': setMusic(MUSIC.boss); flash('BossFadeIn', 1.5); run.snap = true; setVersion((v) => v + 1); setTimeout(() => flash('ObjectivesIntroBoss', 2.2), 900); break;
        case 'levelUp': break;
        case 'won': case 'lost': run.ending = e.type; break;
        default:
      }
    }
  }, [play, flash, cls, sayChatter, setMusic, valve]);

  // --- the run --------------------------------------------------------------------------------------------
  const finish = useCallback((run) => {
    const game = gameRef.current, res = game.result;
    setMusic(null);
    const gold = game.gold, prof = profileRef.current;
    const unlocked = res.won && game.echelon >= prof.unlocked && game.echelon < ECHELONS.length ? game.echelon + 1 : prof.unlocked;
    const record = saveScore('thorns', res.score);
    if (record) setBest(res.score);
    table.submit({ score: res.score, stats: { echelon: game.echelon, won: !!res.won, level: res.level } });
    setProfile((p) => ({ ...p, gold: p.gold + gold, unlocked: Math.max(p.unlocked, unlocked), played: true }));
    setTimeout(() => {
      if (runRef.current !== run) return;
      setResult({ ...res, record, gold, totalGold: prof.gold + gold, newEchelon: unlocked > prof.unlocked, upgrades: canBuySomething(config, prof.tiers, prof.gold + gold) });
      setScreen('over'); setMusic(res.won ? MUSIC.win : MUSIC.loss);
    }, res.won ? 2600 : 2200);
  }, [setMusic, setProfile, config, table.submit]); // eslint-disable-line react-hooks/exhaustive-deps

  const loop = useCallback(() => {
    const run = runRef.current; if (!run) return;
    const now = performance.now(), dt = Math.min(0.1, (now - run.last) / 1000); run.last = now;
    const game = gameRef.current, r = rendererRef.current;
    if (!pausedRef.current && !novelRef.current && game.phase === 'running') {
      run.acc += dt;
      let n = 0;
      while (run.acc >= TICK && n < 8) {
        run.acc -= TICK; n += 1;
        applyInput(game, run);
        const ev = step(game);
        if (ev.length) handle(ev, run);
        if (game.phase !== 'running') { run.acc = 0; break; }
      }
      if (n >= 8) run.acc = 0;
    } else if (game.phase === 'over') { step(game, dt); }
    if (run.ending && !run.endHandled) { run.endHandled = true; finish(run); }
    // Night thunder (survivors.ambient.lightning) now and then.
    if (nightLevel(game) > 0.6 && game.phase === 'running' && !pausedRef.current && now > (run.thunder || 0)) { run.thunder = now + 18000 + Math.random() * 22000; if (run.thunderReady) { play('survivors.ambient.lightning'); flash('Lightning', 0.6); } run.thunderReady = true; }
    run.shake = Math.max(0, run.shake - dt * 2.5);
    r.draw(game, { time: game.time, shake: run.shake, snap: run.snap }); run.snap = false;
    paintHud(game);
    run.frame = requestAnimationFrame(loop);
  }, [handle, paintHud, finish, play, flash]);

  // «Доживите до 12:00 · Победите Империю» once the opening conversation is over.
  const introPending = useRef(false);
  useEffect(() => {
    if (novel || screen !== 'play' || !introPending.current) return undefined;
    introPending.current = false;
    const id = setTimeout(() => flash('ObjectivesIntro', 4.2), 300);
    return () => clearTimeout(id);
  }, [novel, screen, flash]);
  const stopRun = useCallback(() => { if (runRef.current) cancelAnimationFrame(runRef.current.frame); runRef.current = null; clearTimeout(chatterQueue.timer); setChatter(null); }, []);
  const clearClasses = useCallback(() => { const el = stateRef.current; if (!el) return; for (const c of [...el.classList]) if (/^(IsInBossStage|IsNight|ShowPowerUpChoices|PlayerTookDamage|MiniBossWarning|MinibossArrived|BossFadeIn|ObjectivesIntro|Lightning)/.test(c)) el.classList.remove(c); }, []);

  const begin = useCallback((opts = {}) => {
    stopRun(); clearClasses();
    const prof = profileRef.current;
    const game = createGame(config, { hero: prof.hero, echelon: Math.min(prof.echelon, prof.unlocked), meta: prof.tiers, firstRun: !prof.played });
    gameRef.current = game;
    setPaused(false); setChoice(null); setResult(null); setScreen('play'); setVersion((v) => v + 1); table.start();
    sounds.preload(['survivors.xp_pickup', 'survivors.levelup', 'survivors.gold_pickup', game.hero.hitSound, 'survivors.acquire_item', 'survivors.death.vase', MUSIC.boss]);
    setMusic(MUSIC.active);
    runRef.current = { last: performance.now(), acc: 0, frame: 0, shake: 0, ending: null, endHandled: false, snap: true, keys: new Set(), mouse: null, stick: null };
    runRef.current.frame = requestAnimationFrame(loop);
    // The opening: Valve's start-<hero> conversations in order the first times, then random ones.
    if (!prof.noDialogue && !opts.skipNovel) {
      const seen = new Set(prof.starts?.[prof.hero] || []);
      const own = dialogue[`start-${prof.hero}`] || [], next = own.find((c) => !seen.has(c.id));
      const conv = next || pickConversation(Math.random() < 0.5 ? [`start-${prof.hero}`] : ['start-generic', `start-${prof.hero}`]);
      if (conv) {
        setNovel({ lines: conv.lines, at: 0 });
        if (next) setProfile((p) => ({ ...p, starts: { ...p.starts, [p.hero]: [...(p.starts?.[p.hero] || []), next.id] } }));
      }
    }
    introPending.current = true;
  }, [config, sounds, loop, stopRun, clearClasses, setMusic, dialogue, pickConversation, setProfile, flash]);

  const toMenu = useCallback(() => { stopRun(); clearClasses(); sounds.stopAll(); musicName.current = null; gameRef.current = null; setPaused(false); setChoice(null); setNovel(null); setScreen('setup'); }, [stopRun, clearClasses, sounds]);

  const pick = useCallback((i) => {
    const game = gameRef.current; if (!game?.choice) return;
    const ev = choose(game, i);
    handle(ev, runRef.current);
    setChoice(null); cls('ShowPowerUpChoices', false); setVersion((v) => v + 1);
    if (runRef.current) runRef.current.last = performance.now();
  }, [handle, cls]);
  const doReroll = useCallback(() => {
    const game = gameRef.current; if (!game?.choice || game.rerolls <= 0) return;
    handle(reroll(game), runRef.current);
    setRerolling(true); setTimeout(() => setRerolling(false), 600);
    setChoice({ ...game.choice });
  }, [handle]);
  const nextNovel = useCallback(() => {
    setNovel((n) => { if (!n) return n; click('General.ButtonClick'); if (n.at + 1 >= n.lines.length) { if (runRef.current) runRef.current.last = performance.now(); return null; } return { ...n, at: n.at + 1 }; });
  }, [click]);

  // Debug hooks for Playwright (?thornsdebug=1): the game, jumping ahead, invulnerability, a level.
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('thornsdebug')) return;
    window.__thorns = {
      game: () => gameRef.current, begin: () => begin({ skipNovel: true }), renderer: () => rendererRef.current,
      god: (on = true) => { if (gameRef.current) gameRef.current.godMode = on; },
      skip: (seconds) => { const g = gameRef.current, run = runRef.current; if (!g) return; const until = g.time + seconds; while (g.time < until && (g.phase === 'running' || g.phase === 'choosing')) { if (g.phase === 'choosing') choose(g, 0); const ev = step(g); handle(ev.filter((e) => e.type !== 'sound' && e.type !== 'choice'), run); } setVersion((v) => v + 1); },
      xp: (n) => { const g = gameRef.current; if (g) gainXp(g, n); },
      lose: () => { const g = gameRef.current; if (!g) return; g.godMode = false; g.player.lives = 0; g.player.invulnerable = 0; const ev = []; hurtPlayer(g, 1e6, null, ev); handle(ev, runRef.current); },
    };
  }, [begin, handle]);

  // --- input --------------------------------------------------------------------------------------------
  // WASD / arrows move, holding the left button moves towards the cursor (Valve's «Передвижение»), Space dashes,
  // Esc or F9 pauses; 1–3 pick a card, R re-rolls. Touch: a stick under the thumb and a dash button.
  useEffect(() => {
    const MOVE = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
    const down = (event) => {
      if (event.target.closest?.('input, textarea')) return;
      const game = gameRef.current, run = runRef.current;
      if (event.key === 'Escape' || event.code === 'F9') {
        event.preventDefault();
        if (novelRef.current) { setNovel(null); return; }
        if (screenRef.current === 'setup') { if (patchNotes) setPatchNotes(false); else onExit(); }
        else if (screenRef.current === 'hero') setScreen('setup');
        else if (screenRef.current === 'difficulty') setScreen('hero');
        else if (screenRef.current === 'play' && game && game.phase !== 'over') setPaused((v) => !v);
        else if (screenRef.current === 'over') toMenu();
        return;
      }
      if (novelRef.current && (event.code === 'Space' || event.code === 'Enter')) { event.preventDefault(); nextNovel(); return; }
      if (screenRef.current !== 'play' || !game) return;
      if (game.phase === 'choosing' && !pausedRef.current) {
        const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[event.code];
        if (n != null && n < game.choice.cards.length) { event.preventDefault(); pick(n); return; }
        if (event.code === 'KeyR') { event.preventDefault(); doReroll(); return; }
      }
      if (MOVE[event.code]) { run?.keys.add(event.code); event.preventDefault(); }
      else if (event.code === 'Space' || event.code === 'ShiftLeft') { event.preventDefault(); if (!event.repeat && !pausedRef.current) handle(dash(game), run); }
    };
    const up = (event) => { runRef.current?.keys.delete(event.code); };
    const release = (event) => { if (event.pointerType === 'mouse' && runRef.current) runRef.current.mouse = null; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('pointerup', release);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('pointerup', release); };
  }, [onExit, toMenu, nextNovel, pick, doReroll, handle, patchNotes]);
  useEffect(() => {
    if (screen !== 'play') return undefined;
    const hide = () => { const run = runRef.current; if (run) { run.keys.clear(); run.mouse = null; run.stick = null; } if (gameRef.current?.phase === 'running') setPaused(true); };
    const onVis = () => { if (document.hidden) hide(); };
    document.addEventListener('visibilitychange', onVis); window.addEventListener('blur', hide);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('blur', hide); };
  }, [screen]);
  useEffect(() => { if (runRef.current) runRef.current.last = performance.now(); cls('IsPaused', paused); cls('UserPaused', paused); }, [paused, cls]);

  const popupPoint = (event) => { const rect = canvasRef.current.getBoundingClientRect(); return [(event.clientX - rect.left) / rect.width * POPUP_W, (event.clientY - rect.top) / rect.height * POPUP_H]; };
  const onPointerDown = (event) => {
    const run = runRef.current; if (!run || screenRef.current !== 'play') return;
    if (event.pointerType === 'mouse') { if (event.button === 0) { run.mouse = popupPoint(event); } return; }
    setTouch(true);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Not a live pointer. */ }
    const [x, y] = popupPoint(event);
    run.stick = { id: event.pointerId, ox: x, oy: y, x, y };
    if (hudRef.current.stick) { hudRef.current.stick.style.left = `${x}px`; hudRef.current.stick.style.top = `${y}px`; hudRef.current.stick.classList.add('Active'); }
  };
  const onPointerMove = (event) => {
    const run = runRef.current; if (!run) return;
    if (event.pointerType === 'mouse') { if (run.mouse) run.mouse = popupPoint(event); return; }
    if (run.stick?.id !== event.pointerId) return;
    const [x, y] = popupPoint(event); run.stick.x = x; run.stick.y = y;
    const knob = hudRef.current.knob; if (knob) { const dx = x - run.stick.ox, dy = y - run.stick.oy, l = Math.min(60, Math.hypot(dx, dy)), a = Math.atan2(dy, dx); knob.style.transform = `translate(${Math.cos(a) * l}px, ${Math.sin(a) * l}px)`; }
  };
  const onPointerUp = (event) => {
    const run = runRef.current; if (!run) return;
    if (event.pointerType === 'mouse') { if (event.button === 0) run.mouse = null; return; }
    if (run.stick?.id === event.pointerId) { run.stick = null; hudRef.current.stick?.classList.remove('Active'); if (hudRef.current.knob) hudRef.current.knob.style.transform = ''; }
  };
  function applyInput(game, run) {
    let x = 0, y = 0;
    for (const code of run.keys) { const v = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] }[code]; if (v) { x += v[0]; y += v[1]; } }
    if (run.mouse && !x && !y) {
      const [hx, hy] = rendererRef.current.toScreen(game.player.x, game.player.y, 60);
      const dx = run.mouse[0] - hx, dy = -(run.mouse[1] - hy) / Math.SQRT1_2, l = Math.hypot(dx, dy);
      if (l > 14) { x = dx / l; y = dy / l; }
    }
    if (run.stick) { const dx = run.stick.x - run.stick.ox, dy = -(run.stick.y - run.stick.oy), l = Math.hypot(dx, dy); if (l > 8) { const k = Math.min(1, l / 50) / l; x = dx * k; y = dy * k; } }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    game.input.x = x; game.input.y = y;
  }

  const game = gameRef.current;
  const inGame = screen === 'play' || screen === 'over';
  const rootClasses = ['PopupPanel', 'Survivors', 'th-popup', screen === 'setup' || screen === 'hero' || screen === 'difficulty' ? 'GameState_Setup' : screen === 'over' ? 'GameState_Finished' : choice ? 'GameState_ChoosingPowerUp' : 'GameState_Active',
    screen === 'hero' && 'ShowHeroScreen', screen === 'difficulty' && 'ShowHeroScreen ShowDifficultyScreen', novel && 'GameState_ShowingDialogue ShowVisualNovel', profile.played && 'PlayedOnce', touch && 'th-touch',
    game?.rerolls > 0 && 'HasRerollsLeft', rerolling && 'PowerUpChoiceRerolling'].filter(Boolean).join(' ');

  return <Fit className="th-fit">
    <div className={rootClasses} onContextMenu={(e) => e.preventDefault()}>
      <div className="th-state" ref={stateRef}>
        <div className="MainContents">
          <div id="ArenaSceneContainer"><canvas ref={canvasRef} className="th-canvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}/></div>
          <div className="FadeCover"/>
          <div className="LightningCover"/>
          {inGame && game && <GameUI game={game} valve={valve} config={config} hudRef={hudRef} minimapRef={minimapRef} version={version} chatter={chatter} choice={choice} onPick={pick} onReroll={doReroll} paused={paused}/>}
          {(screen === 'setup' || screen === 'hero' || screen === 'difficulty') && <div className="KeyArtContainer"><img className="KeyArtImage" src={`${IMG}survivors_keyart.webp`} alt=""/></div>}
          {screen === 'setup' && <SetupScreen valve={valve} best={best} profile={profile} setProfile={setProfile} sound={click} onPlay={() => { setScreen('hero'); if (!profile.intro && !profile.noDialogue) { const c = dialogue['start-first-time-intro']?.[0]; if (c) setNovel({ lines: c.lines, at: 0 }); setProfile({ intro: true }); } }} onExit={onExit} patchNotes={patchNotes} setPatchNotes={setPatchNotes}/>}
          {screen === 'hero' && <HeroSelect valve={valve} config={config} art={art} profile={profile} setProfile={setProfile} sound={click} onBack={() => setScreen('setup')} onNext={() => setScreen('difficulty')}/>}
          {screen === 'difficulty' && <DifficultyScreen valve={valve} config={config} profile={profile} setProfile={setProfile} sound={click} onBack={() => setScreen('hero')} onStart={() => begin()}/>}
          {screen === 'play' && paused && <div className="PauseScreen"><div className="PauseScreenContent">
            <div className="PauseText">{valve('DOTA_Survivors_Paused')}</div>
            <CrownfallButton className="ResumeButton" onClick={() => setPaused(false)} sound={click}>{valve('DOTA_Survivors_Resume')}</CrownfallButton></div>
            <CrownfallButton className="LeaveButton Secondary" onClick={toMenu} sound={click}>{valve('DOTA_Survivors_LeaveGame')}</CrownfallButton></div>}
          {screen === 'over' && result && game && <PostGame valve={valve} config={config} art={art} game={game} result={result} best={best} outcome={table.outcome} sound={click}
            onAgain={() => begin({ skipNovel: true })} onHero={() => { toMenu(); setScreen('hero'); }} onUpgrades={() => { toMenu(); setScreen('difficulty'); }}/>}
        </div>
        {novel && <VisualNovel novel={novel} valve={valve} onNext={nextNovel} onSkip={() => setNovel(null)}/>}
        {touch && screen === 'play' && !choice && <>
          <div className="th-stick" ref={(el) => { hudRef.current.stick = el; }}><i ref={(el) => { hudRef.current.knob = el; }}/></div>
          <button type="button" className="th-dash" onPointerDown={(e) => { e.stopPropagation(); const g = gameRef.current; if (g) handle(dash(g), runRef.current); }} aria-label={t('Рывок')}/>
          <button type="button" className="th-pause-touch" onPointerDown={(e) => { e.stopPropagation(); setPaused((v) => !v); }} aria-label={valve('DOTA_Survivors_Pause')}>II</button>
        </>}
        <CloseButton mode={screen === 'play' || screen === 'over' ? 'return' : 'close'} onClick={screen === 'play' || screen === 'over' ? toMenu : onExit} label={screen === 'play' ? t('В меню игры') : t('Закрыть')}/>
        <div className="th-corner">
          <MuteButton/>
          {screen === 'play' && <button type="button" className="PauseHint" onClick={() => setPaused((v) => !v)}>
            <span className="PauseLabelContainer"><span className="PauseLabel">{valve('DOTA_Survivors_Pause')}</span><span className="UnPauseLabel">{valve('DOTA_Survivors_Unpause')}</span></span><kbd className="ControlKey">Esc</kbd></button>}
        </div>
      </div>
    </div>
  </Fit>;
}
function canBuySomething(config, tiers, gold) { return config.meta.some((m) => { const t = tiers[m.key] || 0; return t < m.tiers.length && m.tiers[t].cost <= gold; }); }

// --- the HUD (Valve's .GameUI) ------------------------------------------------------------------------------
function GameUI({ game, valve, config, hudRef, minimapRef, version, chatter, choice, onPick, onReroll, paused }) {
  const set = (name) => (el) => { hudRef.current[name] = el; };
  const elites = game.objectives.elites;
  const slots = Math.max(config.mode.activeSlots + (game.stats.ActiveAbilitySlots || 0), game.abilities.length);
  return <div className="GameUI" data-version={version}>
    <div className="PlayerDamageContainer"/>
    <div className="TimelineBackground"/>
    <div className="TimerContainer">
      <img className="ScoreBackground" src={`${IMG}score_container_background_wide.webp`} alt=""/>
      <img className="ScoreBorder" src={`${IMG}score_container_border_wide.webp`} alt=""/>
      <div className="TimerInfoContainer">
        <div className="ScoreData"><span className="ScoreLabel">{valve('DOTA_Crownfall_Fishing_Leaderboard_Score')}</span><b className="ScoreHUD" ref={set('score')}>0</b></div>
        <div className="Dash"/>
        <div className="GoldData"><span className="GoldLabel">{t('Золото')}</span><div className="GoldDataContainer"><b className="GoldHUD" ref={set('gold')}>0</b><img className="GoldIcon" src={`${IMG}gold_bag.svg`} alt=""/></div></div>
      </div>
      <div className="DifficultyContainer"><img className="EchelonBadge" src={`${IMG}echelon_badge_container.webp`} alt=""/><span className="DifficultyText">{rich(valve('DOTA_Survivors_DifficultyRank', { difficulty_rank: game.echelon }))}</span></div>
    </div>
    <div className="BossHealthContainer">
      <div className="BossLabel">{valve('DOTA_Survivors_BossName')}</div>
      <div className="BossHealthProgressBar"><div className="ProgressBarLeft" ref={set('bossBar')}/></div>
      <div className="ProgressBarLabel" ref={set('bossText')}/>
    </div>
    <div className="TimelineContainer">
      <span className="TimerHUD" ref={set('timer')}>0:00</span>
      <div className="Timeline">
        <div className="TimelineBar"><div className="ProgressBarLeft" ref={set('timeline')}/></div>
        {config.mode.eliteTimes.map((at, i) => { const o = elites.find((x) => x.room === i); return <i key={at} className={`MinibossTimelineIcon ${o ? `Revealed ${ELITE_ICON[o.spawner] || ''}` : ''}`} style={{ left: `${at / game.floorLimit * 100}%` }}/>; })}
        <i className="BossTimelineIcon"/>
      </div>
    </div>
    <div className="MinibossWarningAlertContainer" aria-live="polite">
      <div className="WarningDarkness"/>
      <div className="WarningContainer">
        <img className="Emblem Left" src={`${IMG}label_emblem.webp`} alt=""/>
        <div className="WarningBadge"><div className="WarningBadgeBackground"/><span className="WarningLabel">{valve('DOTA_Survivors_MiniBossWarningLabel')}</span><div className="WarningRed"/></div>
        <img className="Emblem Right" src={`${IMG}label_emblem.webp`} alt=""/>
      </div>
      <div className="WarningTitleContainer"><img className="MultiDash Left" src={`${IMG}multi_dash.webp`} alt=""/><span className="WarningTitle">{valve('DOTA_Survivors_MiniBossWarninTitle')}</span><img className="MultiDash Right" src={`${IMG}multi_dash.webp`} alt=""/></div>
      <img className="BottomEmblem" src={`${IMG}label_emblem_bottom.webp`} alt=""/>
    </div>
    <div className="ObjectivesLogShadow"/>
    <div className={`ObjectivesLogContainer ${elites.length ? 'Revealed' : ''}`}>
      <div className="ObjectivesTitleContainer"><span className="ObjectivesHeading">{valve('DOTA_Survivors_OptionalBossFights')}</span><span className="ObjectivesDescription">{valve('DOTA_Survivors_OptionalBossFightsDescription')}</span></div>
      <div className="OptionalObjectivesContainer">
        {elites.map((o) => <div key={o.room} className={`Objective ${ELITE_ICON[o.spawner] || ''} ${o.state === 'done' ? 'Complete' : ''} ${o.state === 'active' ? 'Active' : ''}`}>
          <i className="ObjectiveImage"/>
          <div className="ObjectiveTextContainer"><span className="ObjectiveName">{valve(ELITE_NAME[o.spawner] || '')}</span><span className="ObjectiveStatusLabel">{o.state === 'active' ? t('Идёт бой') : o.state === 'done' ? '' : t('Доступно')}</span></div>
          <i className="ObjectiveRewardIcon"/>
        </div>)}
      </div>
    </div>
    <div id="ChatterContainer">{chatter && <Chatter line={chatter} valve={valve}/>}</div>
    <div className="ObjectivesIntroContainer">
      <div className="SurviveTitle">{valve('DOTA_Survivors_Survive', { survive_length: clock(game.floorLimit) })}</div>
      <div className="DefeatImperiaTitle">{valve('DOTA_Survivors_DefeatImperia')}</div>
    </div>
    <div className="MinibossIntroContainer"><div className="MinibossArrivedTitle" ref={set('arrived')}/></div>
    <div className="PlayerHudContainer">
      <div className="PlayerExp">
        <div className="PlayerExpContainer" ref={set('xp')}><div className="PlayerExpLevelLabelsContainer"><b className="LevelText" ref={set('level')}>1</b></div></div>
        <div className="GemImage"/>
      </div>
      <img className="HudEndCapImage" src={`${IMG}side_flare_tall.webp`} alt=""/>
      <div className="PlayerHeroPortraitContainer"><img className="HeroPortrait" src={`${IMG}heroes/selection/npc_dota_hero_${{ shen: 'vengefulspirit', dragonus: 'skywrath_mage', kez: 'kez' }[game.hero.key]}.webp`} alt=""/></div>
      <div className="PlayerAbilitiesContainer">
        <div className="PlayerAbilitiesBackground"/>
        <div className="PlayerInnatesAndActiveContainer">
          <div className="PlayerInnateContainer">{game.innates.map((ab) => <Slot key={ab.def.key} ab={ab} valve={valve} config={config} innate/>)}</div>
          <div className="PlayerActiveContainer">{Array.from({ length: slots }, (_, i) => { const ab = game.abilities[i]; return ab ? <Slot key={ab.def.key} ab={ab} valve={valve} config={config} slotRef={set(`slot_${ab.def.key}`)}/> : <div key={`e${i}`} className="PlayerInventorySlot EmptySlot"><div className="PowerUpImageContainer"/></div>; })}</div>
        </div>
        <div className="PlayerHealthContainer">
          <div className="PlayerHealthProgressBar"><div className="ProgressBarLeft" ref={set('hpBar')}/></div>
          <span className="PlayerHealth" ref={set('hpText')}/><span className="PlayerHealthRegen" ref={set('regen')}/>
        </div>
      </div>
      <div className="PlayerItemsContainer"><div className="PlayerPassiveContainer">
        {Array.from({ length: config.mode.passiveSlots }, (_, i) => { const it = game.items[i]; return it ? <Slot key={it.def.key} ab={it} valve={valve} config={config} item/> : <div key={`p${i}`} className="PlayerInventorySlot EmptySlot"><div className="PowerUpImageContainer"/></div>; })}
      </div></div>
      <img className="HudEndCapImage Right" src={`${IMG}side_flare_tall.webp`} alt=""/>
    </div>
    <div className="MinimapWrapper"><canvas className="Minimap" ref={minimapRef} width="240" height="240"/><div className="MinimapBorderShadow"/><div className="MinimapBorder"/><div className="MinimapBorderShine"/>
      <img className="MinimapPlayerIcon" src={`${IMG}heroes/icons/npc_dota_hero_${{ shen: 'vengefulspirit', dragonus: 'skywrath_mage', kez: 'kez' }[game.hero.key]}.webp`} alt=""/></div>
    {(choice || paused) && <div className="PlayerAttributesGroup"><div className="AttributesShadow"/><div className="PlayerAttributesContainer">
      {statRows(game, valve).map((r) => <div key={r.key} className={`PlayerAttribute ${r.bonus ? 'HasBonus' : ''}`}><div className="LeftSide"><span className="AttributeName">{r.name}</span><span className="AttributeValue">{r.base}</span></div><div className="AttributeBuffContainer"><span className="AttributeBuffValue">{r.bonus}</span></div></div>)}
    </div></div>}
    {choice && !paused && <LevelUp game={game} choice={choice} valve={valve} onPick={onPick} onReroll={onReroll}/>}
  </div>;
}

function Slot({ ab, valve, config, innate, item, slotRef }) {
  const name = valve(ab.def.name), level = ab.level;
  return <div className={`PlayerInventorySlot ${ab.scepter ? 'ScepterUpgrade' : ''} ${ab.shard ? 'ShardUpgrade' : ''}`} ref={slotRef} title={`${name}${item || !innate ? ` — ${valve('DOTA_Survivors_StatsAbilityLevel')} ${level}` : ''}`}>
    <div className="PowerUpImageContainer">
      <img className="PowerUpImage" src={iconOf(BASE, ab.def.image)} alt={name}/>
      <div className="PowerUpCooldownContainer"><div className="PowerUpCooldownProgress"/><span className="PowerupCooldownLabel"/></div>
      <div className="PowerUpImageBorder"/>
    </div>
    {(ab.scepter || ab.shard) && <div className="ShardScepterImageContainer"><div className="ShardScepterBackground"/><div className="AbilityShardScepterImage"/></div>}
    {!innate && <span className="PowerUpLevel">{level >= ab.def.maxLevel ? valve('DOTA_Survivors_MaxLevel') : level}</span>}
  </div>;
}

// Valve's PlayerLevelUpChoiceWrapper: three PowerUpChoice cards, «Замена (осталось: N)».
function LevelUp({ game, choice, valve, onPick, onReroll }) {
  const cards = choice.cards.map((card) => ({ card, info: cardInfo(game, card, valve, BASE) }));
  return <div className="PlayerLevelUpChoiceWrapper">
    <div className="LevelUpTitle">{valve('DOTA_Survivors_PowerupPopupDescription')}</div>
    <div className="PlayerLevelUpChoiceContainer">
      {cards.map(({ card, info }, i) => <div key={`${card.def.key}${i}${card.kind}`} id={`PowerUp${i}`} className={['PowerUpChoice', info.hero && 'HasHero', info.isNew ? 'PowerupNew' : 'PowerupExisting', info.scepter && 'ScepterUpgrade', info.shard && 'ShardUpgrade', card.kind === 'combine' && 'Combination'].filter(Boolean).join(' ')}
        onClick={() => onPick(i)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onPick(i); }}>
        {info.hero && <div className="HeroImageContainer"><img className="ActorShadow" src={`${IMG}novel/shadow.webp`} alt=""/><div className="ActorBackground"/><img className="ActorBorderUnder" src="./assets/minigames/novel/images/border_under_simple.webp" alt=""/><img className="HeroImage" src={info.hero} alt=""/><img className="ActorBorderOver" src="./assets/minigames/novel/images/border_over_simple.webp" alt=""/></div>}
        <div className="PowerUpContainer">
          <div className="PowerUpBackground" style={{ backgroundImage: `url("${info.image}")` }}/>
          {!info.scepter && !info.shard && <span className="PowerupLabel">{info.type}</span>}
          {info.scepter && <span className="ScepterLabel">{valve('DOTA_AbilityTooltip_Aghs_Scepter')}</span>}
          {info.shard && <span className="ShardLabel">{valve('DOTA_AbilityTooltip_Aghs_Shard')}</span>}
          <img className="PowerupTexture" src={`${IMG}powerup_texture.webp`} alt=""/>
          {(info.scepter || info.shard) && <div className="ShardScepterImageContainer"><div className="AbilityShardScepterImage"/></div>}
          <div className="AbilityImageContainer"><img className="AbilityImage" src={info.image} alt=""/><div className="AbilityImageShine"/></div>
          <div className="AbilityName">{info.name}</div>
          {info.combine && <div className="AbilityCombinationItemsContainer"><span>{valve('DOTA_Survivors_CombinedItemTooltip')}</span><div className="AbilityCombinationItems">{info.combine.map((c) => <img key={c.name} src={c.image} alt={c.name} title={c.name}/>)}</div></div>}
          {info.lines.length > 0 && <div className="TooltipVariableLines">{info.lines.map((l, j) => <div key={j} className={`TooltipVariableLine ${l.kind}`}><span className="TooltipVariable">{l.text}</span></div>)}</div>}
          {info.attrs.length > 0 && <div className="AttributeDescriptionLines">{info.attrs.map((a, j) => <div key={j} className={`AttributeDescriptionLine ${info.physical ? 'PhysicalDamage' : ''}`}><span className="AttributeDetails">{rich(a)}</span></div>)}</div>}
          <div className="PowerUpDescription">{rich(info.desc)}</div>
          {info.isNew && <div className="NewPowerup"><img className="NewPowerupBadge" src={`${IMG}new_badge_container.webp`} alt=""/><span className="NewPowerupLabel">{valve('DOTA_Survivors_NewPowerup')}</span></div>}
          {info.level && !info.isNew && <div className="LevelUpgradeInfo">{rich(info.level)}</div>}
          <span className="ControlKey Small"><span className="KeyText">{i + 1}</span></span>
        </div>
        <div className="PowerUpContainerBorder"/>
        <CrownfallButton className="ChooseButton" onClick={(e) => { e.stopPropagation(); onPick(i); }}>{info.button}</CrownfallButton>
      </div>)}
    </div>
    {choice.kind !== 'shard' && <div className="PlayerLevelUpActionsContainer">
      <CrownfallButton className="Secondary Wide RerollButton" disabled={game.rerolls <= 0} onClick={onReroll}>{valve('DOTA_Survivors_Reroll', { rerolls_remaining: game.rerolls })} <kbd>R</kbd></CrownfallButton>
    </div>}
  </div>;
}

function Chatter({ line, valve }) {
  const name = line.actor === 'popup' ? '' : valve(`DOTA_VisualNovel_act4_Actor_${line.actor}`);
  return <div className="th-chatter" key={line.key}>
    <img src={portraitUrl(line.actor)} alt=""/>
    <div className="th-chatter-text">{name && <b>{name}</b>}<span>{valve(line.key)}</span></div>
  </div>;
}
// Valve's VisualNovelOuterContainer: the run's opening conversation, a click or Space for the next line.
function VisualNovel({ novel, valve, onNext, onSkip }) {
  const line = novel.lines[novel.at], popup = line.actor === 'popup';
  return <div className="VisualNovelOuterContainer" onClick={onNext} role="dialog">
    <div className="VisualNovelBackground"/>
    <div className={`th-novel ${popup ? 'th-novel-popup' : ''}`}>
      {!popup && <div className="th-novel-actor"><img className="th-novel-under" src="./assets/minigames/novel/images/border_under_simple.webp" alt=""/><img className="th-novel-portrait" src={portraitUrl(line.actor)} alt=""/><img className="th-novel-over" src="./assets/minigames/novel/images/border_over_simple.webp" alt=""/></div>}
      <div className="th-novel-box">
        {!popup && <div className="th-novel-name">{valve(`DOTA_VisualNovel_act4_Actor_${line.actor}`)}</div>}
        <div className="th-novel-text">{valve(line.key)}</div>
        <div className="th-novel-next">{t('Дальше')} ›</div>
      </div>
    </div>
    <button type="button" className="th-novel-skip" onClick={(e) => { e.stopPropagation(); onSkip(); }}>{t('Пропустить')} <kbd>Esc</kbd></button>
  </div>;
}

// --- the menus ----------------------------------------------------------------------------------------------
function SetupScreen({ valve, best, profile, setProfile, sound, onPlay, onExit, patchNotes, setPatchNotes }) {
  const Key = ({ dir }) => <span className="ControlKey"><img src={sharedImage(`arrow_${dir}.svg`)} alt=""/></span>;
  return <div className="SetupScreen">
    {patchNotes && <div className="PatchNotesMenu" onClick={() => setPatchNotes(false)}>
      <div className="GoldHeader">{valve('DOTA_Survivors_PatchNotes')}</div><div className="LabelLarge">1.1</div>
      <div className="LabelMedium">{valve('DOTA_Survivors_PatchNotes_Items')}</div>{[1, 2].map((n) => <p key={n}>{rich(valve(`DOTA_Survivors_PatchNotes_1_1_Items_00${n}`))}</p>)}
      <div className="LabelMedium">{valve('DOTA_Survivors_PatchNotes_Abilities')}</div>{Array.from({ length: 15 }, (_, i) => <p key={i}>{rich(valve(`DOTA_Survivors_PatchNotes_1_1_Abilities_${String(i + 1).padStart(3, '0')}`))}</p>)}
      <div className="LabelMedium">{valve('DOTA_Survivors_PatchNotes_Other')}</div>{Array.from({ length: 6 }, (_, i) => <p key={i}>{valve(`DOTA_Survivors_PatchNotes_1_1_Other_00${i + 1}`)}</p>)}
    </div>}
    <div className="SetupScreenMenu">
      <img className="MinigameLogoEn" src={`${IMG}logo_en.webp`} alt={valve('DOTA_Crownfall_Archive_Minigame_NestOfThorns')}/>
      <div className="PlaySectionContent">
        <div className="PlaySectionCol Left"><div className="HowToPlaySection">
          <div className="GoldHeader PlaySectionHeader">{valve('DOTA_Crownfall_Fishing_HowToPlay')}</div>
          <div className="DescriptionContainer"><span className="SubHeader">{valve('DOTA_Crownfall_Controls_Move')}</span><span className="Details">{valve('DOTA_Crownfall_Controls_MoveDescription')}</span></div>
          <div className="ControlDescriptionBlock">
            <img className="th-mouse" src={sharedImage('mouse_leftclick.webp')} alt=""/>
            <span className="OrSeparator">{valve('or')}</span>
            <div className="KeysColumn"><Key dir="up"/><div className="KeysRow"><Key dir="left"/><Key dir="down"/><Key dir="right"/></div></div>
          </div>
          <div className="DescriptionContainer"><span className="Details">{t('Или WASD. Рывок — пробел, пауза — Esc.')}</span><span className="Details th-touch-note">{t('На телефоне: ведите пальцем — герой идёт следом, кнопка справа — рывок.')}</span></div>
          <button type="button" className="PatchNotesButton" onClick={() => { sound('General.ButtonClick'); setPatchNotes(true); }}>{valve('DOTA_Survivors_ViewPatchNotes')}</button>
          <label className="th-check"><input type="checkbox" checked={!!profile.noDialogue} onChange={(e) => setProfile({ noDialogue: e.target.checked })}/><i/>{valve('DOTA_Survivors_DisableDialogue')}</label>
        </div></div>
        <div className="PlaySectionCol Right"><div className="LeaderboardContainer">
          <Leaderboard game="thorns" headClass="LeaderListHeader" label={valve('DOTA_Crownfall_Fishing_Leaderboard_Score')} format={number} rows={6}
            detail={(row) => t('эшелон {n}', { n: row.extra })}/>
          <div className="LeaderboardRow"><span className="LeaderListName">{t('В этом браузере')}</span><b className="LeaderListValue">{best ? number(best) : '—'}</b></div>
          <div className="LeaderboardRow"><span className="LeaderListName">{valve('DOTA_Survivors_TotalGold')}</span><b className="LeaderListValue GoldText">{number(profile.gold)}</b></div>
          <div className="LeaderboardRow"><span className="LeaderListName">{valve('DOTA_Survivors_DifficultyEchelon')}</span><b className="LeaderListValue">{profile.unlocked} / {ECHELONS.length}</b></div>
          <p className="th-encounter"><b>{valve('DOTA_Crownfall_EncounterName_Survivors')}</b>{valve('DOTA_Crownfall_EncounterDesc_Survivors')}</p>
        </div></div>
      </div>
    </div>
    <div className="BottomButtons">
      <CrownfallButton className="StartGameButton GlowButton" onClick={onPlay} sound={sound}>{valve('DOTA_Crownfall_Fishing_Play')}</CrownfallButton>
      {profile.played && <CrownfallButton onClick={onExit} sound={sound}>{valve('DOTA_Crownfall_Encounter_Leave')}</CrownfallButton>}
    </div>
  </div>;
}

// A unit's sprite, animated (hero select, results).
function UnitPreview({ art, unit, clip = 'idle', dir = 6, scale = 1, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const u = art.units[unit], cv = ref.current; if (!u || !cv) return undefined;
    const ctx = cv.getContext('2d'); let frame = 0; const t0 = performance.now();
    const draw = () => {
      const c = u.clips[clip] || u.clips.walk; const entry0 = c?.dirs[dir]; const mirror = entry0?.mirror != null; const entry = mirror ? c.dirs[entry0.mirror] : entry0;
      const frames = entry?.frames || [];
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (frames.length) {
        const f = frames[Math.floor((performance.now() - t0) / 1000 * c.fps) % frames.length], img = art.atlases.get(u.atlases[f[0]]);
        if (img) { const k = scale * Math.min(1.6, cv.height * 0.55 / (u.height * u.ppu)); ctx.save(); ctx.translate(cv.width / 2, cv.height * 0.74); if (mirror) ctx.scale(-1, 1); ctx.drawImage(img, f[1], f[2], f[3], f[4], -f[5] * k, -f[6] * k, f[3] * k, f[4] * k); ctx.restore(); }
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [art, unit, clip, dir, scale]);
  return <canvas ref={ref} className={className} width="420" height="560"/>;
}

function HeroSelect({ valve, config, art, profile, setProfile, sound, onBack, onNext }) {
  return <div className="HeroSelectScreen">
    <div className="ChooseHeroTitle">{valve('DOTA_Survivors_ChooseHeroTitle')}</div>
    <div className="HeroSelect">
      {config.heroOrder.map((key) => {
        const hero = config.heroes[key], start = config.powerups[hero.start[0]], innate = config.powerups[hero.innate[0]];
        return <button type="button" key={key} className={`ChooseHeroButton SurvivorsHero_${HERO_ID[key]} ${profile.hero === key ? 'selected' : ''}`} onClick={() => { sound('General.ButtonClick'); setProfile({ hero: key }); }} onDoubleClick={onNext}>
          <div className="ChooseHeroBackground"/>
          <div className="ChooseHeroCustomBackground" style={{ backgroundImage: `url("${IMG}portrait_backgrounds/${HERO_BG[key]}.webp")` }}/>
          <img className="ChooseHeroTexture" src={`${IMG}powerup_texture.webp`} alt=""/>
          <UnitPreview art={art} unit={key} className="HeroModel" clip={profile.hero === key ? 'idle' : 'idle'}/>
          <div className="HeroDetails">
            <div className="HeroName">{valve(hero.name)}</div>
            <div className="StartingAbilityLabel">{valve('DOTA_Survivors_StartingAbilityLabel')}</div>
            <div className="LeftRightFlow">
              <div className="InnateImageContainer" title={`${valve(innate.name)} — ${valve(innate.desc)}`}><img src={iconOf(BASE, innate.image)} alt=""/></div>
              <div className="AbilityImageContainer" title={`${valve(start.name)} — ${valve(start.desc)}`}><img src={iconOf(BASE, start.image)} alt=""/></div>
            </div>
            <div className="th-hero-innate"><b>{valve(innate.name)}</b>{valve(innate.desc)}</div>
          </div>
          <div className="ChooseHeroBorder"/>
        </button>;
      })}
    </div>
    <div className="HeroSelectActions">
      <button type="button" className="BackArrowButton" onClick={() => { sound('General.ButtonClick'); onBack(); }} aria-label={t('Назад')}><img src={sharedImage('arrow_left.svg')} alt=""/></button>
      <CrownfallButton className="FinishHeroSelectButton GlowButton" onClick={onNext} sound={sound}>{valve('DOTA_Survivors_Next')}</CrownfallButton>
    </div>
  </div>;
}

function DifficultyScreen({ valve, config, profile, setProfile, sound, onBack, onStart }) {
  const buy = (m) => {
    const tier = profile.tiers[m.key] || 0, next = m.tiers[tier];
    if (!next || profile.gold < next.cost) return;
    sound('General.Coins');
    setProfile((p) => ({ ...p, gold: p.gold - next.cost, tiers: { ...p.tiers, [m.key]: tier + 1 } }));
  };
  return <div className="DifficultySelectScreen">
    <div className="Container">
      <div className="MetaProgressionSelection">
        <div className="UpgradesTitle">{valve('DOTA_Survivors_UpgradesTitle')}</div>
        <div className="DifficultyIntroDescription">{valve('DOTA_Survivors_UpgradesDescription')}</div>
        <div className="UpgradesSection">
          <div className="MetaUpgradesContainer">
            {config.meta.map((m) => {
              const tier = profile.tiers[m.key] || 0, max = tier >= m.tiers.length, next = m.tiers[tier], cur = tier ? m.tiers[tier - 1].value : 0;
              return <div key={m.key} className={`MetaUpgradeAttribute ${max ? 'MaxLevel' : profile.gold < next.cost ? 'CantAffordUpgrade' : 'UpgradesAvailable'}`}>
                <div className="MetaUpgradeAttributeContainer">
                  <span className="AttributeName">{attrName(valve, m.key)}</span>
                  <div className="UpgradePipsContainer">{m.tiers.map((_, i) => <div key={i} className={`UpgradePipOuter ${i < tier ? 'Upgraded' : ''}`}><div className="UpgradePip"/></div>)}</div>
                  <span className="AttributeValue AddedValue">{rich(attrLine(valve, config, m.key, max ? cur : next.value))}</span>
                  {!max && <><div className="CostLabelContainer"><i className="LineBreak"/><span className="CostLabel">{valve('DOTA_Survivors_Cost')}</span><i className="LineBreak Right"/></div>
                    <div className="CostContainer"><span className="CurrencyCost GoldText">{number(next.cost)}</span><img className="GoldIcon" src={`${IMG}gold_coins.svg`} alt=""/></div></>}
                  {max ? <div className="CostContainer"><span className="CurrencyCost">{valve('DOTA_Survivors_MaxLevel')}</span></div>
                    : <button type="button" className="UpgradeButton" disabled={profile.gold < next.cost} onClick={() => buy(m)}>{valve('DOTA_Survivors_Upgrade')}</button>}
                </div>
                <div className="SelectedDifficultyBorder"/>
              </div>;
            })}
          </div>
          <div className="ResourceContainer"><div className="TotalGoldContainer"><span className="TotalGoldLabel GoldText">{valve('DOTA_Survivors_TotalGold')}</span>
            <div className="LeftRightFlow"><b className="TotalGoldValue GoldText">{number(profile.gold)}</b><img className="GoldIcon" src={`${IMG}gold_bag.svg`} alt=""/></div></div></div>
        </div>
      </div>
      <div className="DifficultySelectionContainer">
        <div className="DifficultyTitle">{valve('DOTA_Survivors_DifficultyTitle')}</div>
        <div className="DifficultyIntroDescription">{rich(valve('DOTA_Survivors_DifficultyDescription'))}</div>
        <div className="ParentDifficultyLevelsContainer"><div className="DifficultyLevelsContainer">
          {ECHELONS.map((key, i) => {
            const d = config.difficulties[key], rank = i + 1, locked = rank > profile.unlocked, selected = rank === Math.min(profile.echelon, profile.unlocked);
            return <button type="button" key={key} className={`DifficultyLevelItem ${locked ? 'Locked' : ''} ${selected ? 'Selected' : ''}`} disabled={locked} onClick={() => { sound('General.ButtonClick'); setProfile({ echelon: rank }); }}>
              <div className="DifficultyLevelItemContent">
                <div className="EchelonContainer"><div className="EchelonBadge"/><div className="EchelonContent"><span className="RankLabel">{valve('DOTA_Survivors_DifficultyEchelon')}</span><span className="RankValue">{rank}</span></div></div>
                <div className="VerticalDivider"/>
                <div className="DifficultyDescriptionContainer"><span className="DifficultyName">{valve(d.name)}</span>
                  <span className="DifficultyDescription">{locked ? valve('DOTA_Survivors_DifficultyLocked') : rich(valve(d.desc))}</span></div>
              </div>
              <div className="LockedPattern"/><div className="DifficultyBorder"/><div className="SelectedDifficultyBorder"/>
            </button>;
          })}
        </div></div>
      </div>
    </div>
    <div className="HeroSelectActions">
      <button type="button" className="BackArrowButton" onClick={() => { sound('General.ButtonClick'); onBack(); }} aria-label={t('Назад')}><img src={sharedImage('arrow_left.svg')} alt=""/></button>
      <CrownfallButton className="FinishHeroSelectButton GlowButton" onClick={onStart} sound={sound}>{valve('DOTA_Start')}</CrownfallButton>
    </div>
  </div>;
}

// Valve's PostGameScreen: the outcome, the hero, abilities (level, damage, time held, DPS), items, the final row.
function PostGame({ valve, config, art, game, result, best, outcome, sound, onAgain, onHero, onUpgrades }) {
  const time = (s) => clock(s);
  const abilities = [...game.abilities];
  return <div className={`FinishedScreen PostGameScreen SurvivorsHeroID_${HERO_ID[game.hero.key]}`}>
    <div className="FinalScreenBackground"/>
    <div className="Title">{valve(result.won ? 'DOTA_Survivors_Win_Title' : 'DOTA_Survivors_Loss_Title')}</div>
    <div className="FinalMainContainer">
      <div className="FinalAbilitiesContainer">
        <div className="AbilitiesStatsHeading">{['StatsAbilityLevel', 'StatsAbilityTotalDamage', 'StatsAbilityTimeHeld', 'StatsAbilityDPS'].map((k) => <span key={k} className={`HeaderLabel ${k.replace('StatsAbility', 'Ability').replace('TotalDamage', 'Damage')}`}>{valve(`DOTA_Survivors_${k}`)}</span>)}</div>
        <div className="AbilitiesStatsContainer">
          {Array.from({ length: Math.max(config.mode.activeSlots, abilities.length) }, (_, i) => { const ab = abilities[i]; if (!ab) return <div key={i} className="AbilityStats EmptySlot"><div className="AbilityImageContainer"><i className="AbilityImage"/></div></div>;
            const held = Math.max(1, game.time - ab.since);
            return <div key={ab.def.key} className="AbilityStats"><div className="AbilityImageContainer" title={valve(ab.def.name)}><img className="AbilityImage" src={iconOf(BASE, ab.def.image)} alt=""/></div><span className="FillWidth"/>
              <i className={`AbilityShardScepterImage ${ab.scepter && ab.shard ? 'ShardScepter' : ab.scepter ? 'Scepter' : ab.shard ? 'Shard' : 'Empty'}`}/>
              <div className="AbilityLevelContainer"><span>{ab.level}</span></div>
              <span className="AbilityStatLabel AbilityDamage">{number(ab.damage)}</span><span className="AbilityStatLabel AbilityTimeHeld">{time(held)}</span><span className="AbilityStatLabel AbilityDPS">{fmt(ab.damage / held, 1)}</span></div>; })}
        </div>
      </div>
      <div className="FinalHeroContainer"><div className="FinalHeroBackground"/><div className="FinalHeroBorder Under"/><UnitPreview art={art} unit={game.hero.key} className="FinalHeroModel" clip="idle" scale={1.25}/><div className="FinalHeroBorder Over"/></div>
      <div className="FinalItemsContainer">
        <div className="ItemsStatsHeading"><span className="HeaderLabel ItemName">{valve('DOTA_Survivors_StatsItemName')}</span><span className="HeaderLabel ItemLevel">{valve('DOTA_Survivors_StatsAbilityLevel')}</span><span className="HeaderLabel ItemTimeHeld">{valve('DOTA_Survivors_StatsItemTimeHeld')}</span></div>
        <div className="ItemsStatsContainer">
          {Array.from({ length: config.mode.passiveSlots }, (_, i) => { const it = game.items[i]; if (!it) return <div key={i} className="ItemStats EmptySlot"><i className="ItemImage"/></div>;
            return <div key={it.def.key} className="ItemStats"><img className="ItemImage" src={iconOf(BASE, it.def.image)} alt=""/><span className="ItemName">{valve(it.def.name)}</span><div className="AbilityLevelContainer"><span>{it.level}</span></div><span className="ItemTimeHeld">{time(game.time - it.since)}</span></div>; })}
        </div>
      </div>
    </div>
    <div className="FinalEnemyStatsContainer"><span className="EnemiesDefeatedTitle">{valve('DOTA_Survivors_EnemiesDefeated')}: {number(result.kills)}</span></div>
    <div className="FinalStatsContainer">
      <div className="DashDotDivider"><i className="Dash Left"/><span className="FinalScoreLabel">{valve('DOTA_Survivors_FinalScore')}</span><i className="Dash Right"/></div>
      <div className="FinalStats">
        <div className="FinalStatBlock"><span className="FinalStatLabel">{valve('DOTA_Survivors_TimeSurvived')}</span><span className="FinalStatValue">{time(result.time)}</span></div><i className="VerticalDash"/>
        <div className="FinalStatBlock"><span className="FinalStatLabel">{valve('DOTA_Survivors_GameStatsPlayerLevel')}</span><span className="FinalStatValue">{result.level}</span></div><i className="VerticalDash"/>
        <div className="FinalStatBlock FinalScoreBlock"><span className="FinalStatValue">{valve('DOTA_Survivors_FinalScoreValue', { final_score: number(result.score) })}</span>{result.record ? <span className="th-record">{t('Новый рекорд!')}</span> : best ? <span className="th-record th-dim">{t('Рекорд: {score}', { score: number(best) })}</span> : null}</div><i className="VerticalDash"/>
        <div className="FinalStatBlock"><span className="FinalStatLabel">{valve('DOTA_Survivors_GoldEarned')}</span><span className="FinalStatValue FinalStatGold">{number(result.gold)}</span></div><i className="VerticalDash"/>
        <div className="FinalStatBlock"><span className="FinalStatLabel">{valve('DOTA_Survivors_TotalGold')}</span><span className="FinalStatValue FinalStatGold">{number(result.totalGold)}</span></div>
      </div>
      <div className="DashDotDivider"><i className="Dash Left"/><div className="DifficultyContainer"><img className="EchelonBadge" src={`${IMG}echelon_badge_container.webp`} alt=""/><span className="DifficultyText">{rich(valve('DOTA_Survivors_DifficultyRank', { difficulty_rank: game.echelon }))}</span></div><i className="Dash Right"/></div>
    </div>
    {(result.newEchelon || result.upgrades) && <div className="PostGameDifficultyContainer">{result.newEchelon && <span className="DifficultyUnlockedLabel">{valve('DOTA_Survivors_NewDifficultyUnlocked')}</span>}{result.upgrades && <span className="UpgradesAvailableLabel">{valve('DOTA_Survivors_UpgradesAvailable')}</span>}</div>}
    <BoardOutcome outcome={outcome} className="th-board-outcome"/>
    <div className="PostGameButtonsContainer">
      <CrownfallButton className="Secondary HeroSelectButton" onClick={onHero} sound={sound}>{valve('DOTA_Survivors_HeroSelectButton')}</CrownfallButton>
      <CrownfallButton className="Secondary UpgradesButton" onClick={onUpgrades} sound={sound}>{valve('DOTA_Survivors_UpgradesDifficultyButton')}</CrownfallButton>
    </div>
    <div className="PlayButtonContainer"><CrownfallButton className="PlayAgainButton" onClick={onAgain} sound={sound}>{valve('DOTA_Survivors_PlayAgainButtonLabel')}</CrownfallButton></div>
  </div>;
}
