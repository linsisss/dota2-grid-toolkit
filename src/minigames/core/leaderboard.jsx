// Global tables of records («таблица рекордов», server/minigames.mjs, docs/minigames.md «Таблицы
// рекордов»). A game asks for a run token when a run starts (useRun().start) and sends the score at its
// end (useRun().submit) — signed-in accounts only; <Leaderboard> stands where Valve's popup had the friends'
// list (each game passes its own classes of that list), <BoardOutcome> goes on the results screen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { catalogAPI } from '../../catalog/api.js';
import { useAccount } from '../../catalog/Account.jsx';
import { profilePath } from '../../catalog/Creator.jsx';
import { locale, t } from '../../../scripts/i18n.mjs';
import { track } from '../../site-stats.js';

// A result recorded somewhere: open tables and the hub read theirs again.
const bus = typeof EventTarget === 'function' ? new EventTarget() : null;
export const notifyBoards = () => bus?.dispatchEvent(new Event('change'));
export function useBoardsVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => { const on = () => setVersion((v) => v + 1); bus?.addEventListener('change', on); return () => bus?.removeEventListener('change', on); }, []);
  return version;
}

const PERIOD_KEY = 'gridstudio.minigames.board-period';
const recall = () => { try { return localStorage.getItem(PERIOD_KEY) === 'week' ? 'week' : 'all'; } catch { return 'all'; } };
const remember = (value) => { try { localStorage.setItem(PERIOD_KEY, value); } catch { /* The choice is just not kept. */ } };
export const number = (value) => Number(value).toLocaleString(locale);

// A table as the server gives it: { rows, me, total, week, login }, read again after a result.
export function useBoard(game, board, period) {
  const auth = useAccount(), version = useBoardsVersion();
  const [state, setState] = useState({ data: null, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ ...(board ? { board } : {}), period });
    catalogAPI(`/minigames/boards/${game}?${query}`, { signal: controller.signal })
      .then((data) => setState({ data, error: '' }))
      .catch((error) => { if (!controller.signal.aborted) setState((old) => ({ data: old.data, error: error.message })); });
    return () => controller.abort();
  }, [game, board, period, version, auth?.user?.id]);
  return state;
}

// The viewer's places on every board ({ game: { board: { rank, total, score } } }); {} for a guest.
export function useRanks(refresh = 0) {
  const auth = useAccount(), version = useBoardsVersion(), [ranks, setRanks] = useState({});
  useEffect(() => {
    if (!auth?.user) { setRanks({}); return undefined; }
    const controller = new AbortController();
    catalogAPI('/minigames/ranks', { signal: controller.signal }).then((value) => setRanks(value.ranks || {})).catch(() => {});
    return () => controller.abort();
  }, [auth?.user?.id, version, refresh]);
  return ranks;
}

// The analytics' score buckets (minigames.finish).
const scoreBucket = (score) => { const n = Number(score) || 0; return n <= 0 ? '0' : n < 10 ? '1-9' : n < 100 ? '10-99' : n < 1000 ? '100-999' : n <= 10000 ? '1k-10k' : '10k+'; };

// A run of a game for the tables. start(board) when it begins (nothing for a guest), submit({ score, stats })
// at its end; `outcome` is what <BoardOutcome> shows: { guest } | { sending } | { result } | { error }.
// Every game goes through here, so the analytics' minigames.start / finish / submit do too (guests included).
export function useRun(game) {
  const auth = useAccount(), user = auth?.user || null;
  const run = useRef(null), began = useRef(0), [outcome, setOutcome] = useState(null);
  const start = useCallback((board = '') => {
    setOutcome(null);
    began.current = performance.now(); track('minigames.start', { game });
    if (!user) { run.current = null; return; }
    // The run's time counts from when the server has issued the token, the moment the server counts from.
    const current = { started: performance.now() };
    current.token = catalogAPI('/minigames/runs', { method: 'POST', body: { game, board } }).then((value) => { current.started = performance.now(); return value.token; }, () => null);
    run.current = current;
  }, [game, user]);
  const cancel = useCallback(() => { run.current = null; began.current = 0; setOutcome(null); }, []);
  const submit = useCallback(async ({ score, stats = {} }) => {
    const current = run.current; run.current = null;
    // Once per run: a game that ends twice (the fighter's last round) reports the first.
    if (began.current) { track('minigames.finish', { game, seconds: (performance.now() - began.current) / 1000, score: scoreBucket(score) }); began.current = 0; }
    if (!(score > 0)) { setOutcome(null); return null; }
    if (!user) { setOutcome({ guest: true }); return null; }
    if (!current) { setOutcome(null); return null; }
    setOutcome({ sending: true });
    const token = await current.token;
    if (!token) { setOutcome({ error: t('Не удалось связаться с таблицей рекордов.') }); return null; }
    const duration = Math.round((performance.now() - current.started) / 100) / 10;
    try {
      const result = await catalogAPI('/minigames/submit', { method: 'POST', body: { token, score: Math.round(score), duration, stats } });
      track('minigames.submit', { game });
      setOutcome({ result }); notifyBoards();
      return result;
    } catch (error) { setOutcome({ error: error.message }); return null; }
  }, [user, game]);
  return { start, submit, cancel, outcome, clear: () => setOutcome(null) };
}

// The line of the results screen: a new best in the table and the place, or why the result is not there.
export function BoardOutcome({ outcome, className = '' }) {
  const auth = useAccount();
  if (!outcome) return null;
  const box = (children, extra = '') => <div className={`mg-lb-outcome ${extra} ${className}`} role="status">{children}</div>;
  if (outcome.guest) return box(<><span>{t('Войди, чтобы попасть в таблицу')}</span>
    <button type="button" className="mg-lb-login-button" onClick={() => auth?.requestLogin(t('Войди, чтобы попасть в таблицу рекордов мини-игр.'))}>{t('Войти')}</button></>, 'is-guest');
  if (outcome.sending) return box(t('Записываем в таблицу рекордов…'), 'is-sending');
  if (outcome.error) return box(t('Не записано в таблицу: {error}', { error: outcome.error }), 'is-error');
  const { all, week } = outcome.result;
  if (all?.improved) return box(<><b>{t('Новый рекорд в таблице!')}</b><span>{t('#{rank} из {total}', { rank: all.rank, total: all.total })}</span></>, 'is-record');
  if (week?.improved) return box(<><b>{t('Рекорд недели в таблице!')}</b><span>{t('#{rank} за неделю · #{all} за всё время', { rank: week.rank, all: all.rank })}</span></>, 'is-record');
  if (outcome.result.level?.improved) return box(<><b>{t('Новый рекорд уровня')}</b><span>{t('#{rank} в таблице', { rank: all.rank })}</span></>, 'is-record');
  return all?.rank ? box(t('#{rank} в таблице рекордов', { rank: all.rank })) : null;
}

const ranksSeen = new Set();
// The table. `boards`: [[id, label]] when a game has several (a switch above the list); `format(score, row)`
// writes a score (board: the one shown), `detail(row, board)` a short note beside the name; `local` is this browser's best (a line under
// the list); `headClass` / `rowClass` are the game's own classes of Valve's leaderboard list; `hint` — a line
// for a signed-in account not in the table yet (where there is room for it).
export function Leaderboard({ game, boards = null, board: initial = '', format = number, detail = null, local = null, localFormat = number,
  label = t('Счёт'), headClass = '', rowClass = '', className = '', rows = 8, hint = false }) {
  const auth = useAccount();
  const [board, setBoard] = useState(initial || boards?.[0]?.[0] || ''), [period, setPeriodState] = useState(recall);
  useEffect(() => { if (initial) setBoard(initial); }, [initial]);
  const setPeriod = (value) => { setPeriodState(value); remember(value); };
  const { data, error } = useBoard(game, board, period);
  const list = useRef(null);
  // minigames.ranks: the table shown — it stands in each game's menu, so once per game and page load.
  useEffect(() => { if (!ranksSeen.has(game)) { ranksSeen.add(game); track('minigames.ranks', { game }); } }, [game]);
  // The viewer's own row in view once the table arrives.
  useEffect(() => { const mine = list.current?.querySelector('.is-mine'); if (mine && list.current) list.current.scrollTop = Math.max(0, mine.offsetTop - list.current.clientHeight / 2); }, [data]);
  const remove = async (row) => {
    if (!confirm(t('Убрать {name} из таблиц этой игры? Отмена — оставить.', { name: row.profile.name }))) return;
    const ban = confirm(t('Запретить {name} снова попадать в таблицы этой игры?', { name: row.profile.name }));
    try { await catalogAPI(`/admin/minigames/${game}/${row.profile.key}${ban ? '?ban=1' : ''}`, { method: 'DELETE' }); notifyBoards(); }
    catch (e) { alert(e.message); }
  };
  const shownPeriod = data?.week === false ? 'all' : period;
  const mineShown = data?.rows.some((row) => row.mine);
  return <div className={`mg-lb ${className}`} style={{ '--mg-lb-rows': rows }}>
    {boards && boards.length > 1 && <div className="mg-lb-boards" role="group" aria-label={t('Таблица')}>
      {boards.map(([id, name]) => <button type="button" key={id} aria-pressed={board === id} onClick={() => setBoard(id)}>{name}</button>)}</div>}
    <div className={`mg-lb-head ${headClass}`}>
      {data?.week === false ? <span className="mg-lb-title">{t('Таблица рекордов')}</span>
        : <span className="mg-lb-periods" role="group" aria-label={t('Таблица рекордов')}>
          <button type="button" aria-pressed={shownPeriod === 'all'} onClick={() => setPeriod('all')}>{t('Всё время')}</button>
          <button type="button" aria-pressed={shownPeriod === 'week'} onClick={() => setPeriod('week')}>{t('Неделя')}</button></span>}
      <span>{typeof label === 'function' ? label(board) : label}</span>
    </div>
    {!data ? <div className={`mg-lb-note ${rowClass}`}>{error ? t('Таблица рекордов недоступна.') : t('Загружаем…')}</div>
      : <ol className="mg-lb-list" ref={list} aria-label={t('Таблица рекордов')}>
        {data.rows.length === 0 && <li className={`mg-lb-note ${rowClass}`}>{shownPeriod === 'week' ? t('На этой неделе пока никого — стань первым.') : t('Пока никого — стань первым.')}</li>}
        {data.rows.map((row) => <li key={row.profile.key} className={`mg-lb-row ${rowClass} ${row.mine ? 'is-mine' : ''} ${row.rank <= 3 ? `is-top is-top-${row.rank}` : ''}`}>
          <span className="mg-lb-rank">{row.rank}</span>
          <a className="mg-lb-name" href={profilePath(row.profile.key)} target="_blank" rel="noopener" title={t('Профиль: {name}', { name: row.profile.name })}>
            <img src={row.profile.avatar} alt="" width="20" height="20" loading="lazy" decoding="async"/><span>{row.profile.name}</span></a>
          {detail && detail(row, board) && <small className="mg-lb-detail">{detail(row, board)}</small>}
          <b className="mg-lb-value">{format(row.score, row, board)}</b>
          {auth?.admin && <button type="button" className="mg-lb-remove" onClick={() => remove(row)} title={t('Убрать из таблицы')} aria-label={t('Убрать из таблицы')}>×</button>}
        </li>)}
      </ol>}
    {data?.me && !mineShown && <div className={`mg-lb-row mg-lb-me is-mine ${rowClass}`}>
      <span className="mg-lb-rank">{data.me.rank}</span><span className="mg-lb-name"><span>{t('Ты')}</span></span>
      <b className="mg-lb-value">{format(data.me.score, data.me, board)}</b></div>}
    {data && !auth?.user && <div className="mg-lb-login">
      <span>{t('Войди, чтобы попасть в таблицу')}</span>
      <button type="button" className="mg-lb-login-button" onClick={() => auth?.requestLogin(t('Войди, чтобы попасть в таблицу рекордов мини-игр.'))}>{t('Войти')}</button></div>}
    {hint && data && auth?.user && !data.me && <div className="mg-lb-note mg-lb-hint">{t('Сыграй — и твой лучший результат попадёт в таблицу.')}</div>}
    {local !== null && <div className="mg-lb-local"><span>{t('В этом браузере')}</span><b>{local ? localFormat(local) : '—'}</b></div>}
  </div>;
}
