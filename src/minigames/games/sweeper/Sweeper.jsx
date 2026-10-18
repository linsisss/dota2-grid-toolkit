// «Сапёр Сплин» (Crownfall act IV, Spleen Sweeper): Valve's bp_popup_crownfall_encounter_minesweeper
// rebuilt for the browser. The rules are logic.mjs; this file draws the popup the way Valve's layout
// and CSS do (sweeper.css keeps their class roles) and plays Valve's sound events. docs/minigames.md.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createSounds } from '../../core/sound.js';
import { assetBase, bestScore, loadJSON, loadStrings, saveScore } from '../../core/assets.js';
import { CloseButton, CrownfallButton, Fit, HowToRow, KeyHint, Mouse, MuteButton, ResultBand, useCompact } from '../../core/ui.jsx';
import { BoardOutcome, Leaderboard, useRun } from '../../core/leaderboard.jsx';
import { createGame, flag, formatTime, minesLeft, neighbours, nextStage, reveal, score, sweeperConfig, tick, toggleIllusion } from './logic.mjs';
import { locale, t } from '../../../../scripts/i18n.mjs';
import { useLanguage } from '../../../useLanguage.js';
import './sweeper.css';

const BASE = assetBase('sweeper'), IMG = `${BASE}images/`, NOVEL = assetBase('novel');
// Score marks of the encounter's rewards (crownfall_chapter4.vdata, «minesweeper», HighScore style):
// on the site they only light up — there are no tokens to give.
const MARKS = [[5000, 1], [15000, 2], [35000, 3]];
const NOVEL_SEEN = 'gridstudio.minigames.sweeper.novel';
const NEXT_STAGE_LINES = ['Kestrel_0', 'Spleen_0', 'Kestrel_1', 'Spleen_1', 'Kestrel_2', 'Spleen_2'];
const SOUND_OF = {
  reveal: 'minesweeper.cell_reveal', flag: 'minesweeper.cell_flag', unflag: 'minesweeper.cell_unflag', explode: 'minesweeper.cell_explode',
  illusion: 'minesweeper.cell_use_illusion', illusionExplode: 'minesweeper.cell_illusion_explode', invalid: 'minesweeper.invalid_move',
};
const ITEM_SOUND = { itemUse: { mana: 'minesweeper.use_mana_pot', timer: 'minesweeper.use_timer_increase' }, itemLost: { mana: 'minesweeper.lost_mana_pot', timer: 'minesweeper.lost_timer_increase' } };

const number = (value) => Number(value).toLocaleString(locale);
// Valve's rich strings: <b>…</b> and new lines.
const rich = (text) => text.split('\n').map((line, i) => <span key={i} className="ms-line">{line.split(/<b>(.*?)<\/b>/g).map((part, j) => (j % 2 ? <b key={j}>{part}</b> : part))}</span>);

export default function Sweeper({ onExit }) {
  useLanguage();
  const [assets, setAssets] = useState(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([loadJSON(`${BASE}data.json`), loadJSON(`${BASE}sounds.json`), loadStrings('sweeper'), loadJSON('./assets/minigames/shared/sounds.json').catch(() => ({}))])
      .then(([data, sounds, valve, shared]) => setAssets({ config: sweeperConfig(data.game), sounds: createSounds(BASE, sounds), ui: createSounds('./assets/minigames/shared/', shared), valve }))
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <div className="mg-loading" role="alert">{t('Не удалось загрузить игру. Обнови страницу.')}</div>;
  if (!assets) return <div className="mg-loading" role="status">{t('Загружаем…')}</div>;
  return <SweeperPopup assets={assets} onExit={onExit}/>;
}

function SweeperPopup({ assets, onExit }) {
  const { config, sounds, ui, valve } = assets;
  const gameRef = useRef(null), musicRef = useRef(null);
  const [, setVersion] = useState(0);
  const redraw = useCallback(() => setVersion((v) => v + 1), []);
  const [screen, setScreen] = useState('menu');
  const [paused, setPaused] = useState(false), [help, setHelp] = useState(false), [novel, setNovel] = useState(null);
  const [fx, setFx] = useState([]), [hints, setHints] = useState([]);
  const [best, setBest] = useState(() => bestScore('sweeper')), [record, setRecord] = useState(false), [playedOnce, setPlayedOnce] = useState(false);
  const game = gameRef.current, compact = useCompact(), table = useRun('sweeper');
  const click = useCallback((name) => ui.play(name), [ui]);

  const music = useCallback((name) => { musicRef.current?.stop(); musicRef.current = name ? sounds.play(name, { loop: name === 'minesweeper.game_music' }) : null; }, [sounds]);
  useEffect(() => () => { sounds.stopAll(); ui.stopAll(); }, [sounds, ui]);

  const addFx = useCallback((kind, index) => {
    const key = `${kind}${index}${performance.now()}`;
    setFx((list) => [...list, { key, kind, index }]);
    setTimeout(() => setFx((list) => list.filter((item) => item.key !== key)), kind === 'explode' ? 1400 : 900);
  }, []);

  const finish = useCallback((current) => {
    const result = score(current);
    const isRecord = saveScore('sweeper', result.total);
    setRecord(isRecord); if (isRecord) setBest(result.total);
    setPlayedOnce(true);
    table.submit({ score: result.total, stats: { cells: result.cells, stages: result.stages, seconds: result.seconds, won: result.won } });
  }, [table.submit]); // eslint-disable-line react-hooks/exhaustive-deps

  const handle = useCallback((events) => {
    const current = gameRef.current;
    for (const event of events) {
      if (SOUND_OF[event.type]) sounds.play(SOUND_OF[event.type]);
      if (ITEM_SOUND[event.type]) { sounds.play(ITEM_SOUND[event.type][event.item]); addFx(`${event.type}-${event.item}`, event.index); }
      if (event.type === 'explode') addFx('explode', event.index);
      if (event.type === 'illusion') addFx('illusion', event.index);
      if (event.type === 'illusionExplode') addFx('explode', event.index);
      if (event.type === 'invalid' && current.last >= 0) {
        const around = neighbours(current.board, current.last).filter((index) => !current.board.cells[index].revealed);
        setHints(around); setTimeout(() => setHints([]), 420);
      }
      if (event.type === 'stageWon' || event.type === 'won') {
        music(null);
        sounds.play('minesweeper.techies_win');
        if (event.type === 'won') { sounds.play('minesweeper.game_music.win'); finish(current); }
        let seen = false;
        try { seen = !!localStorage.getItem(NOVEL_SEEN); } catch { /* Shown every time then. */ }
        const lines = event.type === 'won' ? ['end_Spleen_0'] : seen ? null : NEXT_STAGE_LINES.map((line) => `next-stage_${line}`);
        if (lines) { setNovel({ lines, at: 0 }); if (event.type !== 'won') { try { localStorage.setItem(NOVEL_SEEN, '1'); } catch { /* Not remembered. */ } } }
      }
      if (event.type === 'lost') {
        music(null);
        setTimeout(() => sounds.play('minesweeper.game_music.loss'), event.reason === 'mine' ? 900 : 0);
        finish(current);
      }
    }
    redraw();
  }, [sounds, addFx, music, finish, redraw]);

  const start = useCallback(() => {
    gameRef.current = createGame(config);
    setScreen('game'); setPaused(false); setHelp(false); setNovel(null); setRecord(false); table.start();
    sounds.preload(Object.values(SOUND_OF));
    sounds.play('minesweeper.techies_run');
    music('minesweeper.game_music');
    redraw();
  }, [config, sounds, music, redraw, table.start]); // eslint-disable-line react-hooks/exhaustive-deps

  const toMenu = useCallback(() => { music(null); setScreen('menu'); setPaused(false); setHelp(false); setNovel(null); }, [music]);

  const continueStage = useCallback(() => {
    if (!nextStage(gameRef.current)) return;
    sounds.play(`minesweeper.techies_taunt${1 + Math.floor(Math.random() * 4)}`);
    music('minesweeper.game_music');
    redraw();
  }, [sounds, music, redraw]);

  // The clock: runs while a stage is played, not paused, without the help or the story box open.
  const running = screen === 'game' && game?.phase === 'running' && !paused && !help && !novel;
  useEffect(() => {
    if (!running) return undefined;
    let last = performance.now(), frame = 0;
    const step = (now) => {
      const events = tick(gameRef.current, Math.min(0.25, (now - last) / 1000)); last = now;
      if (events.length) handle(events); else redraw();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [running, handle, redraw]);

  // F1 help, F9 / Esc pause (Valve's oncancel), 1 Echo Slash; Esc in the menu leaves.
  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.('input, textarea')) return;
      const current = gameRef.current;
      if (event.key === 'F1') { event.preventDefault(); if (screen === 'game') setHelp((v) => !v); return; }
      if (event.key === 'Escape' || event.key === 'F9') {
        event.preventDefault();
        if (help) { setHelp(false); return; }
        if (screen === 'menu') { if (event.key === 'Escape') onExit(); return; }
        if (current?.phase === 'running' && !novel) setPaused((v) => !v);
        else if (event.key === 'Escape' && !novel) toMenu();
        return;
      }
      if (event.key === '1' && screen === 'game' && !paused && current) handle(toggleIllusion(current));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, help, paused, novel, onExit, toMenu, handle]);

  const stageClass = screen === 'game' ? `ms-stage${game.stage}` : 'ms-stage0';
  const phase = screen === 'game' ? game.phase : 'menu';
  const classes = ['ms-popup', stageClass, screen === 'menu' ? 'ms-intro' : 'ms-running', `ms-phase-${phase}`, paused && 'ms-paused', help && 'ms-help', novel && 'ms-novel',
    game?.illusion && screen === 'game' && 'ms-illusion', game?.cooldown > 0 && 'ms-cooldown', playedOnce && 'ms-played', compact && 'ms-compact'].filter(Boolean).join(' ');

  return <Fit className="ms-fit" fitHeight={!(compact && screen === 'menu')}>
    <div className={classes} onContextMenu={(event) => event.preventDefault()}>
      <div className="ms-wrapper">
        <div className="ms-main">
          <div className="ms-gold-dash"/>
          {screen === 'menu' ? <MainMenu valve={valve} config={config} best={best} playedOnce={playedOnce} onPlay={start} onExit={onExit} sound={click}/>
            : <Scene game={game} valve={valve} handle={handle} fx={fx} hints={hints} paused={paused} onLeave={toMenu} sound={click}/>}
          {screen === 'game' && <CenterBand game={game} valve={valve} record={record} best={best} novel={novel} outcome={table.outcome} onContinue={continueStage} onMenu={toMenu} sound={click}/>}
          {screen === 'game' && help && <div className="ms-help-layer" onClick={() => setHelp(false)}><div className="ms-help-body" onClick={(event) => event.stopPropagation()}><HowToPlay valve={valve} config={config}/></div></div>}
          {novel && <Novel novel={novel} assets={assets} onNext={() => setNovel((state) => (state.at + 1 < state.lines.length ? { ...state, at: state.at + 1 } : null))}/>}
          <CloseButton mode={screen === 'game' ? 'return' : 'close'} onClick={screen === 'game' ? toMenu : onExit} label={screen === 'game' ? t('В меню игры') : t('Закрыть')}/>
          <div className="ms-corner">
            <MuteButton/>
            {screen === 'game' && <><KeyHint label={valve('DOTA_Crownfall_Minesweeper_Help')} keyName="F1" onClick={() => setHelp((v) => !v)}/>
              <KeyHint label={paused ? valve('DOTA_Crownfall_Minesweeper_Unpause') : valve('DOTA_Crownfall_Minesweeper_Pause')} keyName="F9" onClick={() => { if (game.phase === 'running') setPaused((v) => !v); }}/></>}
          </div>
        </div>
      </div>
    </div>
  </Fit>;
}

function MainMenu({ valve, config, best, playedOnce, onPlay, onExit, sound }) {
  return <div className="ms-menu-area">
    <img className="ms-logo" src={`${IMG}ss_logo_en.webp`} alt={valve('DOTA_Crownfall_Minesweeper_GameTitle')}/>
    <div className="ms-menu">
      <p className="ms-subtitle">{valve('DOTA_Crownfall_Minesweeper_GameDesc')}</p>
      <div className="ms-columns">
        <div className="ms-column1"><HowToPlay valve={valve} config={config}/></div>
        <div className="ms-column2">
          <Leaderboard game="sweeper" className="ms-board-list" headClass="ms-list-head" label={valve('DOTA_Crownfall_Minesweeper_Leaderboard_Score')} local={best} format={number} rows={4}/>
          <h3 className="ms-gold-title">{valve('DOTA_Crownfall_Minesweeper_Scoring')}</h3>
          <div className="ms-score-list">
            <div><span>{valve('DOTA_Crownfall_Minesweeper_StageClear')}</span><b>{number(config.score.stage)}</b></div>
            <div><span>{valve('DOTA_Crownfall_Minesweeper_CellReveal')}</span><b>{number(config.score.cell)}</b></div>
            <div><span>{valve('DOTA_Crownfall_Minesweeper_SecondsRemaining')}</span><b>{number(config.score.second)}</b></div>
          </div>
          <h3 className="ms-gold-title">{t('Рубежи')}</h3>
          <div className="ms-marks">{MARKS.map(([at, pips]) => <div key={at} className={best >= at ? 'ms-mark-done' : ''}><span>{number(at)}</span><i>{Array.from({ length: pips }, (_, i) => <em key={i}/>)}</i></div>)}</div>
        </div>
      </div>
      <div className="ms-bottom-buttons">
        <CrownfallButton onClick={onPlay} sound={sound}>{valve('DOTA_Crownfall_Minesweeper_Play')}</CrownfallButton>
        {playedOnce && <CrownfallButton onClick={onExit} sound={sound}>{t('Покинуть')}</CrownfallButton>}
      </div>
    </div>
  </div>;
}

// dota_ui_minesweeper_help.xml: the 3×3 sample field, the mouse buttons, Echo Slash, the items.
function HowToPlay({ valve, config }) {
  const sample = [[1, 'h'], [2, 'h'], [3, 'h'], [2, 'h'], [1, 'r2'], [3, 'h'], [4, 'h'], [0, 'r'], [0, 'r']];
  return <div className="ms-howto">
    <h3 className="ms-gold-title">{t('Как играть')}</h3>
    <HowToRow picture={<div className="ms-help-board">{sample.map(([variant, kind], i) => <span key={i} className={`ms-cell v${variant || 1} ${kind === 'h' ? 'ms-help-hint' : 'ms-revealed'} ${kind === 'r2' ? 'n2' : ''}`}>{kind === 'r2' && <b className="ms-count">2</b>}</span>)}</div>}
      title={valve('DOTA_Crownfall_Minesweeper_GreenSpace')} details={<>{valve('DOTA_Crownfall_Minesweeper_GreenSpace_Details')}<b className="ms-subhead">{valve('DOTA_Crownfall_Minesweeper_NumberedSpace')}</b>{valve('DOTA_Crownfall_Minesweeper_NumberedSpace_Details')}</>}/>
    <HowToRow picture={<Mouse button="left"/>} title={valve('DOTA_Crownfall_Minesweeper_Reveal')} details={valve('DOTA_Crownfall_Minesweeper_Reveal_Details')} tip={valve('DOTA_Crownfall_Minesweeper_ChordLeftClick_Details')}/>
    <HowToRow picture={<Mouse button="right"/>} title={valve('DOTA_Crownfall_Minesweeper_Flag')} details={valve('DOTA_Crownfall_Minesweeper_Flag_Details')} tip={valve('DOTA_Crownfall_Minesweeper_ChordRightClick_Details')}/>
    <HowToRow picture={<span className="ms-help-ability"><img src={`${IMG}echo_slash.webp`} alt=""/><kbd>1</kbd></span>} title={valve('DOTA_Crownfall_Minesweeper_Illusion')} details={valve('DOTA_Crownfall_Minesweeper_Illusion_Details')}/>
    <HowToRow picture={<span className="ms-help-items"><i className="ms-strip ms-strip-timer"/><i className="ms-strip ms-strip-mana"/></span>} title={valve('DOTA_Crownfall_Minesweeper_ItemDrops')}
      details={rich(valve('DOTA_Crownfall_Minesweeper_ItemDrops_Details', { clarity_mana_amount: config.items.mana.amount, clock_timer_amount: config.items.timer.amount }))}/>
    <p className="ms-touch-note">{t('На телефоне флаг ставится долгим нажатием.')}</p>
  </div>;
}

function Scene({ game, valve, handle, fx, hints, paused, onLeave, sound }) {
  const { board } = game, press = useRef({ timer: 0, long: false });
  const act = (events) => { if (events.length) handle(events); };
  const onPointerDown = (event, index) => {
    if (event.pointerType === 'mouse') { if (event.button === 2) act(flag(game, index)); return; }
    press.current.long = false;
    clearTimeout(press.current.timer);
    press.current.timer = setTimeout(() => { press.current.long = true; act(flag(game, index)); navigator.vibrate?.(15); }, 420);
  };
  const cancelPress = () => clearTimeout(press.current.timer);
  const onClick = (index) => { cancelPress(); if (press.current.long) { press.current.long = false; return; } act(reveal(game, index)); };
  const hinted = new Set(hints);
  const cost = game.config.illusionCost;
  return <div className="ms-scene">
    <div className="ms-hud">
      <span className="ms-hud-logo"/>
      <span className="ms-timer"><img src={`${IMG}timericon.webp`} alt=""/><b>{formatTime(game.timeLeft)}</b></span>
      <span className="ms-flagged" title={t('Мин осталось')}><img src={`${IMG}flaggedicon.webp`} alt=""/><b>{valve('DOTA_Crownfall_Minesweeper_FlaggedText', { mines_left: minesLeft(board) })}</b></span>
    </div>
    <div className="ms-stage-row"><i/><span>{valve('DOTA_Crownfall_Minesweeper_StageText', { current_stage: game.stage + 1, max_stages: game.config.stages.length })}</span><i/></div>
    <div className="ms-board-container">
      <div className="ms-board-border">
        <div className="ms-board" style={{ '--cols': board.cols, '--rows': board.rows }}>
          {board.cells.map((cell, index) => {
            const classes = ['ms-cell', `v${cell.variant}`, cell.revealed && 'ms-revealed', cell.revealed && cell.adjacent && !cell.blast && `n${cell.adjacent}`, cell.blast && 'ms-mine',
              cell.flagged && !cell.revealed && 'ms-flag', cell.item && `ms-item ms-item-${cell.item.type}`, hinted.has(index) && 'ms-hint'].filter(Boolean).join(' ');
            return <button type="button" key={`${game.stage}-${index}`} className={classes} onClick={() => onClick(index)} onPointerDown={(event) => onPointerDown(event, index)}
              onPointerUp={cancelPress} onPointerLeave={cancelPress} aria-label={cell.revealed ? String(cell.adjacent) : cell.flagged ? t('Флаг') : t('Закрытая клетка')}>
              {cell.revealed && cell.adjacent > 0 && !cell.blast && <b className="ms-count">{cell.adjacent}</b>}
              {cell.flagged && !cell.revealed && <i className="ms-flag-icon"/>}
              {cell.item && <><i className={`ms-strip ms-strip-${cell.item.type}`}/><em className="ms-clicks">{cell.item.clicks}</em></>}
            </button>;
          })}
          {fx.map((item) => <i key={item.key} className={`ms-fx ms-fx-${item.kind}`} style={{ '--x': item.index % board.cols, '--y': Math.floor(item.index / board.cols) }}/>)}
        </div>
      </div>
      {paused && <div className="ms-paused-screen"><b>{valve('DOTA_Crownfall_Minesweeper_Paused')}</b><CrownfallButton onClick={onLeave} sound={sound}>{t('Покинуть игру')}</CrownfallButton></div>}
      {game.cooldown > 0 && <div className="ms-cooldown-screen"><b>{valve('DOTA_Crownfall_Minesweeper_OnCooldown', { board_cooldown: game.cooldown.toFixed(1) })}</b></div>}
    </div>
    <div className="ms-ability-row">
      <button type="button" className={`ms-ability ${game.mana < cost ? 'ms-ability-off' : ''}`} onClick={() => act(toggleIllusion(game))} title={valve('DOTA_Crownfall_Minesweeper_UseIllusion')} aria-pressed={game.illusion}>
        <img src={`${IMG}echo_slash.webp`} alt={valve('DOTA_Crownfall_Minesweeper_Illusion')}/><kbd>1</kbd><span className="ms-mana-cost">{cost}</span>
      </button>
      <div className="ms-mana"><div className="ms-mana-fill" style={{ width: `${(game.mana / game.config.mana) * 100}%` }}/><span>{game.mana} / {game.config.mana}</span></div>
    </div>
  </div>;
}

// Valve's CenterHUD: «Этап пройден» + «Продолжить»; «Победа!» / «Поражение...» with the score.
function CenterBand({ game, valve, record, best, novel, outcome, onContinue, onMenu, sound }) {
  if (novel || !['stageWon', 'won', 'lost'].includes(game.phase)) return null;
  if (game.phase === 'stageWon') {
    return <div className="ms-center ms-center-stage"><ResultBand message={valve('DOTA_Crownfall_Minesweeper_NextStageText')}>
      <CrownfallButton onClick={onContinue} sound={sound}>{valve('DOTA_Crownfall_Minesweeper_Continue')}</CrownfallButton></ResultBand></div>;
  }
  const result = score(game), { config } = game;
  const lines = [
    [valve('DOTA_Crownfall_Minesweeper_ScoringCellsRevealed', { cells_revealed: result.cells, score_per_cell_revealed: config.score.cell }), number(result.cellsScore)],
    [valve('DOTA_Crownfall_Minesweeper_ScoringStagesCleared', { stages_cleared: result.stages, score_per_stages_cleared: number(config.score.stage) }), number(result.stagesScore)],
  ];
  if (result.won) lines.push([valve('DOTA_Crownfall_Minesweeper_ScoringTimeRemaining', { seconds_remaining: result.seconds, score_per_seconds_remaining: config.score.second }), number(result.secondsScore)]);
  return <div className={`ms-center ${game.lost === 'mine' ? 'ms-center-late' : ''}`}><ResultBand message={result.won ? valve('DOTA_Crownfall_Minesweeper_WinText') : valve('DOTA_Crownfall_Minesweeper_LoseText')}
    lines={lines} total={number(result.total)} totalLabel={valve('DOTA_Crownfall_Minesweeper_ScoringTotal')}
    record={record ? t('Новый рекорд!') : best ? t('Рекорд: {score}', { score: number(best) }) : null} board={<BoardOutcome outcome={outcome}/>}>
    <CrownfallButton onClick={onMenu} sound={sound}>{valve('DOTA_Crownfall_Minesweeper_PlayAgain')}</CrownfallButton>
  </ResultBand></div>;
}

// The story box (DOTACrownfallVisualNovel): Kez and Spleen after the first stage, Spleen at the end.
function Novel({ novel, assets, onNext }) {
  const key = novel.lines[novel.at], actor = key.includes('Kestrel') ? 'Kestrel' : 'Spleen';
  const portrait = actor === 'Kestrel' ? 'kestrel_parka_portrait_idle' : 'spleen_portrait_idle';
  useEffect(() => { assets.ui.play('General.ButtonClick'); }, [novel.at, assets.ui]);
  return <button type="button" className={`ms-novel-box ms-novel-${actor.toLowerCase()}`} onClick={onNext}>
    <img src={`${NOVEL}portraits/${portrait}.webp`} alt=""/>
    <span className="ms-novel-text"><b>{assets.valve(`DOTA_VisualNovel_act4_Actor_${actor}`)}</b>{assets.valve(`DOTA_VisualNovel_act4_Dialogue_minesweeper-${key}`)}</span>
    <span className="ms-novel-next">{t('Дальше')} ›</span>
  </button>;
}

