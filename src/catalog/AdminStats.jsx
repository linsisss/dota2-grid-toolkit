import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { catalogAPI, CATALOG_PATH, CUSTOMIZE_PATH, GUIDES_PATH } from './api.js';
import { Icon, Notice } from './Common.jsx';
import { sourceColor } from './stat-sources.js';

// «Статистика» (server/site-stats.mjs; asked for on 2026-10-03, redone the same day: «счётчики в лайве»,
// «красивее», «откуда пришёл юзер»). On top, live (GET /admin/stats/live every 10 s while the tab is
// shown): who is on the site now with the last hour minute by minute and what they look at, and today's
// numbers, rising with a «+N». Below, the period (the report, again every minute): the cards with their
// days in a line and the change against the days before, then the audience (visits, where people and new
// accounts come from, devices and language), downloads, works and the moderators, activity, the tops and
// everything to date. Moscow days. Charts are drawn here (SVG), no chart library.
const PERIODS = [[7, '7 дней'], [30, '30 дней'], [90, '90 дней'], [365, 'Год']];
const DAY = 86_400_000, MSK = 3 * 3_600_000, LIVE_EVERY = 10_000, REPORT_EVERY = 60_000;
const C = { violet: '#c4b5ed', amber: '#f3c46d', teal: '#7fd1c4', pink: '#f29bc0', blue: '#8fb8ff', green: '#8fe0a8', red: '#ff8a8a' };
const number = (n) => Number(n || 0).toLocaleString('ru-RU');
const dateOf = (day, options) => new Date(day * DAY - MSK + 12 * 3_600_000).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', ...options });
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const sum = (list) => list.reduce((a, b) => a + b, 0);
const add = (...lists) => lists[0].map((_, i) => lists.reduce((total, list) => total + (list[i] || 0), 0));

// A number that runs to its new value.
function Count({ value }) {
  const [shown, setShown] = useState(value), from = useRef(value);
  useEffect(() => {
    if (reduced() || from.current === value) { setShown(value); from.current = value; return undefined; }
    const start = performance.now(), a = from.current, b = value;
    let frame;
    const step = (now) => { const k = Math.min(1, (now - start) / 700), eased = 1 - (1 - k) ** 3; setShown(Math.round(a + (b - a) * eased)); if (k < 1) frame = requestAnimationFrame(step); else from.current = b; };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{number(shown)}</>;
}
// «+N» for a few seconds after a live number rose.
function Rise({ value }) {
  const last = useRef(value), [rise, setRise] = useState(null);
  useEffect(() => {
    if (value > last.current) { setRise({ n: value - last.current, at: Date.now() }); const timer = setTimeout(() => setRise(null), 4000); last.current = value; return () => clearTimeout(timer); }
    last.current = value; return undefined;
  }, [value]);
  return rise ? <span key={rise.at} className="admin-rise">+{number(rise.n)}</span> : null;
}

// The axis' top: 1, 2 or 5 times a power of ten, just above the largest value.
function niceMax(value) {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value)), step = [1, 2, 5, 10].find((m) => m * power >= value / 4) * power;
  return Math.ceil(value / step) * step;
}
// A small line of values, filled under.
function Spark({ values, color = C.violet, height = 36 }) {
  const id = useId().replace(/:/g, ''), W = 120, n = values.length;
  if (n < 2) return <svg className="admin-spark" viewBox={`0 0 ${W} ${height}`} aria-hidden="true"/>;
  const top = Math.max(1, ...values), x = (i) => (i / (n - 1)) * W, y = (v) => height - 2 - (v / top) * (height - 6);
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return <svg className="admin-spark" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={`s${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs>
    <polygon points={`0,${height} ${line} ${W},${height}`} fill={`url(#s${id})`}/><polyline points={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke"/>
  </svg>;
}
// Bars (stacked, rounded) and lines (with a soft fill) over the days; hovering a day shows its values.
// Drawn at the card's own width, so the labels keep their size in a wide card and a narrow one.
function Chart({ days, series, height = 200 }) {
  const wrap = useRef(null), box = useRef(null), id = useId().replace(/:/g, ''), [at, setAt] = useState(-1), [W, setW] = useState(640);
  useEffect(() => {
    if (!wrap.current || typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(260, Math.round(entry.contentRect.width))));
    observer.observe(wrap.current);
    return () => observer.disconnect();
  }, []);
  const H = height, L = 40, R = 8, T = 12, B = 24, n = days.length, slot = (W - L - R) / n;
  const bars = series.filter((s) => s.kind === 'bar'), lines = series.filter((s) => s.kind !== 'bar');
  const stack = days.map((_, i) => bars.reduce((total, s) => total + s.values[i], 0));
  const top = niceMax(Math.max(1, ...stack, ...lines.flatMap((s) => s.values)));
  const y = (v) => T + (H - T - B) * (1 - v / top), x = (i) => L + slot * (i + 0.5);
  const ticks = [0, 0.5, 1].map((f) => Math.round(top * f));
  const count = Math.max(2, Math.min(n, Math.floor((W - L - R) / 90))), labels = n <= count ? days.map((_, i) => i) : Array.from({ length: count }, (_, k) => Math.round((k * (n - 1)) / (count - 1)));
  const pick = (event) => {
    const rect = box.current.getBoundingClientRect(), px = ((event.clientX - rect.left) / rect.width) * W;
    setAt(Math.max(0, Math.min(n - 1, Math.floor((px - L) / slot))));
  };
  const barWidth = Math.max(0.8, slot * 0.66), radius = Math.min(3, barWidth / 2);
  return <div className="admin-chart" ref={wrap}>
    <svg ref={box} viewBox={`0 0 ${W} ${H}`} role="img" onMouseMove={pick} onMouseLeave={() => setAt(-1)}>
      <defs>{lines.map((s) => <linearGradient key={s.key} id={`g${id}${s.key}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity=".22"/><stop offset="1" stopColor={s.color} stopOpacity="0"/></linearGradient>)}</defs>
      {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="admin-chart-grid"/><text x={L - 8} y={y(v) + 4} textAnchor="end">{number(v)}</text></g>)}
      {days.map((day, i) => { let base = 0; return <g key={day}>{bars.map((s, j) => { const v = s.values[i]; if (!v) return null;
        const r = <rect key={s.key} x={L + slot * i + (slot - barWidth) / 2} width={barWidth} y={y(base + v)} height={Math.max(0, y(base) - y(base + v))} rx={j === bars.length - 1 || !bars.slice(j + 1).some((next) => next.values[i]) ? radius : 0}
          fill={s.color} opacity={at < 0 || at === i ? 0.95 : 0.4}/>; base += v; return r; })}</g>; })}
      {lines.map((s) => { const points = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
        return <g key={s.key}>{!s.thin && <polygon points={`${x(0)},${y(0)} ${points} ${x(n - 1)},${y(0)}`} fill={`url(#g${id}${s.key})`}/>}
          <polyline points={points} fill="none" stroke={s.color} strokeWidth={s.thin ? 1.5 : 2.2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '4 4' : undefined}/></g>; })}
      {at >= 0 && <line x1={x(at)} x2={x(at)} y1={T} y2={H - B} className="admin-chart-cursor"/>}
      {at >= 0 && lines.map((s) => <circle key={s.key} cx={x(at)} cy={y(s.values[at])} r="3.5" fill="#15141a" stroke={s.color} strokeWidth="2"/>)}
      {labels.map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor="middle">{dateOf(days[i], { day: 'numeric', month: 'short' })}</text>)}
    </svg>
    {at >= 0 && <div className={`admin-chart-tip${at > n * 0.6 ? ' is-left' : ''}`} style={{ left: `${(x(at) / W) * 100}%` }}>
      <b>{dateOf(days[at], { day: 'numeric', month: 'long', weekday: 'short' })}</b>
      {series.map((s) => <span key={s.key}><i style={{ background: s.swatch || s.color }}/>{s.label}<strong>{number(s.values[at])}</strong></span>)}
    </div>}
    <div className="admin-legend">{series.map((s) => <span key={s.key}><i className={s.kind === 'bar' ? '' : 'is-line'} style={{ background: s.swatch || s.color }}/>{s.label}<strong>{number(sum(s.values))}</strong></span>)}</div>
  </div>;
}

function Delta({ now, before }) {
  if (!before) return now ? <span className="admin-delta is-up">новое</span> : <span className="admin-delta">—</span>;
  const change = Math.round(((now - before) / before) * 100);
  return <span className={`admin-delta ${change > 0 ? 'is-up' : change < 0 ? 'is-down' : ''}`} title={`До этого: ${number(before)}`}>{change > 0 ? '↑' : change < 0 ? '↓' : '±'} {Math.abs(change)}%</span>;
}

// Rows with a bar for their share of the largest.
function Bars({ rows, empty = 'Пока пусто', unit, columns }) {
  if (!rows.length) return <p className="admin-empty-line">{empty}</p>;
  const top = Math.max(1, ...rows.map((row) => row.value)), total = sum(rows.map((row) => row.value)) || 1;
  return <ol className={`admin-bars${columns ? ' is-columns' : ''}`}>{rows.map((row) => <li key={row.key}>
    <span className="admin-bars-fill" style={{ width: `${(row.value / top) * 100}%`, background: row.color ? `${row.color}2e` : undefined }}/>
    <span className="admin-bars-name">{row.color && <i style={{ background: row.color }}/>}<span className="admin-bars-text">{row.href ? <a href={row.href} target="_blank" rel="noreferrer">{row.name}</a> : row.name}</span>{row.note && <small>{row.note}</small>}</span>
    <span className="admin-bars-value">{number(row.value)}{unit ? <small>{unit}</small> : <small>{Math.round((row.value / total) * 100)}%</small>}</span>
  </li>)}</ol>;
}

function Card({ title, hint, wide, children }) {
  return <div className={`admin-card${wide ? ' is-wide' : ''}`}><div className="admin-card-head"><h3>{title}</h3>{hint && <span>{hint}</span>}</div>{children}</div>;
}

// «Обновлено N с назад».
function Fresh({ at }) {
  const [, tick] = useState(0);
  useEffect(() => { const timer = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  return <span className="admin-fresh"><i/>в реальном времени · {seconds < 5 ? 'только что' : `${seconds} с назад`}</span>;
}

const TODAY = [['visitors', 'Посетители', 'user'], ['views', 'Просмотры', 'eye'], ['registrations', 'Регистрации', 'idCard'], ['downloads', 'Скачивания', 'download'],
  ['installs', 'Установки командой', 'terminal'], ['works', 'Новые работы', 'sparkle'], ['likes', 'Лайки', 'heart'], ['comments', 'Комментарии', 'comment']];

export default function AdminStats({ denied }) {
  const [days, setDays] = useState(30), [data, setData] = useState(null), [live, setLive] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = (quiet = false) => {
    if (!quiet) setBusy(true);
    return catalogAPI(`/admin/stats?days=${days}`).then((value) => { setData(value); setError(''); }, (problem) => { if (!quiet) { denied?.(problem); setError(problem.message); } }).finally(() => setBusy(false));
  };
  useEffect(() => { load(); const timer = setInterval(() => { if (document.visibilityState === 'visible') load(true); }, REPORT_EVERY); return () => clearInterval(timer); }, [days]);
  useEffect(() => {
    let alive = true, timer;
    const tick = async () => {
      if (document.visibilityState === 'visible') { try { const value = await catalogAPI('/admin/stats/live'); if (alive) setLive(value); } catch { /* The next tick tries again. */ } }
      if (alive) timer = setTimeout(tick, LIVE_EVERY);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  const view = useMemo(() => {
    if (!data) return null;
    const s = data.series;
    const downloads = add(s.gridExports, s.gridDownloads, s.backgroundPacks, s.backgroundDownloads, s.fontPacks), works = add(s.grids, s.backgrounds, s.guides, s.arts);
    return { s, cards: [['Посетители', 'visitors', 'user', s.visitors, C.violet], ['Просмотры', 'views', 'eye', s.views, C.blue], ['Регистрации', 'registrations', 'idCard', s.registrations, C.green],
      ['Скачивания', 'downloads', 'download', downloads, C.amber], ['Установки командой', 'installs', 'terminal', s.installs, C.teal], ['Новые работы', 'works', 'sparkle', works, C.pink],
      ['Лайки', 'likes', 'heart', s.likes, C.red], ['Комментарии', 'comments', 'comment', s.comments, C.violet]] };
  }, [data]);
  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data) return <p role="status">Считаем статистику…</p>;
  const { s } = view, t = data.top, totals = data.totals, now = live || { online: data.online, pages: [], today: data.now, minutes: [], at: data.generated };
  const periodName = PERIODS.find(([v]) => v === days)[1].toLowerCase();
  return <section className="admin-stats">
    <div className="admin-stats-head">
      <div className="catalog-tabs" aria-label="Период">{PERIODS.map(([value, label]) => <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>{label}</button>)}</div>
      <Fresh at={now.at}/>
      <button type="button" className="catalog-button" disabled={busy} onClick={() => load()}><Icon name="replay" size={15}/>{busy ? 'Считаем…' : 'Обновить'}</button>
    </div>

    <div className="admin-live">
      <div className="admin-card admin-online-card">
        <div className="admin-card-head"><h3><i className="admin-pulse"/>Сейчас на сайте</h3><span>за 5 минут</span></div>
        <b className="admin-online-number"><Count value={now.online}/></b>
        <div className="admin-online-spark"><Spark values={now.minutes.map((m) => m.online)} color="#8fe0a8" height={54}/>
          <span>{now.minutes.length > 1 ? `последние ${now.minutes.length} мин · пик ${number(Math.max(...now.minutes.map((m) => m.online)))}` : 'график последнего часа появится через пару минут'}</span></div>
      </div>
      <div className="admin-card admin-today">
        <div className="admin-card-head"><h3>Сегодня</h3><span>{dateOf(data.today, { day: 'numeric', month: 'long', weekday: 'long' })}</span></div>
        <div className="admin-today-grid">{TODAY.map(([key, label, icon]) => <div key={key}><span><Icon name={icon} size={14}/>{label}</span><b><Count value={now.today[key]}/><Rise value={now.today[key]}/></b></div>)}</div>
      </div>
      <div className="admin-card admin-watching">
        <div className="admin-card-head"><h3>Сейчас смотрят</h3><span>страницы за 5 минут</span></div>
        <Bars rows={now.pages.map((page) => ({ key: page.page, name: page.label, value: page.visitors }))} unit="чел." empty="Никого — тихо" columns/>
      </div>
    </div>

    <div className="admin-section-title"><h2>За {periodName}</h2><span>изменение — к таким же дням до этого · московское время{totals.since ? ` · посещения считаются с ${dateOf(totals.since, { day: 'numeric', month: 'long' })}` : ''}</span></div>
    <div className="admin-kpis">{view.cards.map(([label, key, icon, values, color]) => <div key={key} className="admin-kpi">
      <span className="admin-kpi-label"><Icon name={icon} size={15}/>{label}</span>
      <div className="admin-kpi-value"><b><Count value={data.period[key]}/></b><Delta now={data.period[key]} before={data.previous[key]}/></div>
      <Spark values={values} color={color}/>
    </div>)}</div>

    <div className="admin-section-title"><h2>Аудитория</h2></div>
    <div className="admin-grid">
      <Card title="Посещаемость" wide><Chart days={data.days} series={[
        { key: 'views', label: 'Просмотры', color: '#c4b5ed33', swatch: '#c4b5ed80', values: s.views, kind: 'bar' },
        { key: 'visitors', label: 'Посетители', color: C.violet, values: s.visitors },
        { key: 'new', label: 'Новые посетители', color: C.teal, values: s.newVisitors, thin: true },
        { key: 'members', label: 'Вошедшие в аккаунт', color: C.amber, values: s.members, thin: true }]}/></Card>
      <Card title="Откуда приходят" hint="посетители по сайтам"><Bars rows={(t.sources || []).map((row) => ({ key: row.source, name: row.label, color: sourceColor(row.source), value: row.visitors }))}/>
        {t.referrers.length > 0 && <details className="admin-more"><summary>Все сайты</summary><Bars rows={t.referrers.map((row) => ({ key: row.host, name: row.host, value: row.visitors }))}/></details>}</Card>
      <Card title="Откуда регистрируются" hint="новые аккаунты"><Bars rows={(t.signups || []).map((row) => ({ key: row.source, name: row.label, color: sourceColor(row.source), value: row.accounts }))} empty="Новых аккаунтов не было"/>
        <p className="admin-footnote">Источник запоминается с 3 октября; у аккаунтов до этого — «Неизвестно».</p></Card>
      <Card title="Устройства и язык">
        <Bars rows={[{ key: 'desktop', name: 'Компьютер', color: C.violet, value: data.devices.desktop }, { key: 'mobile', name: 'Телефон и планшет', color: C.amber, value: data.devices.mobile }]}/>
        <Bars rows={[{ key: 'ru', name: 'Русский', color: C.blue, value: data.languages.ru }, { key: 'en', name: 'English', color: C.teal, value: data.languages.en }]}/>
      </Card>
      <Card title="Пользователи"><Chart days={data.days} height={170} series={[
        { key: 'registrations', label: 'Регистрации', color: C.green, values: s.registrations, kind: 'bar' },
        { key: 'logins', label: 'Входили через Telegram', color: C.blue, values: s.logins },
        { key: 'studio', label: 'Сохраняли в «Студии»', color: C.amber, values: s.studioSavers, thin: true }]}/></Card>
    </div>

    <div className="admin-section-title"><h2>Скачивания и работы</h2></div>
    <div className="admin-grid">
      <Card title="Скачивания и установки" wide><Chart days={data.days} series={[
        { key: 'exports', label: 'Сетки из редактора', color: C.violet, values: s.gridExports, kind: 'bar' },
        { key: 'grids', label: 'Сетки из мастерской', color: C.blue, values: s.gridDownloads, kind: 'bar' },
        { key: 'packs', label: 'Собранные фоны', color: C.amber, values: s.backgroundPacks, kind: 'bar' },
        { key: 'backgrounds', label: 'Фоны из мастерской', color: C.pink, values: s.backgroundDownloads, kind: 'bar' },
        { key: 'fonts', label: 'Шрифты', color: C.teal, values: s.fontPacks, kind: 'bar' },
        { key: 'installs', label: 'Сетки командой PowerShell', color: C.green, values: s.installs }]}/></Card>
      <Card title="Новые работы и проверка"><Chart days={data.days} height={170} series={[
        { key: 'grids', label: 'Сетки и правки', color: C.violet, values: s.grids, kind: 'bar' },
        { key: 'backgrounds', label: 'Фоны', color: C.pink, values: s.backgrounds, kind: 'bar' },
        { key: 'guides', label: 'Гайды', color: C.amber, values: s.guides, kind: 'bar' },
        { key: 'arts', label: 'Арты', color: C.teal, values: s.arts, kind: 'bar' },
        { key: 'approved', label: 'Одобрено', color: C.green, values: s.approved, thin: true },
        { key: 'rejected', label: 'Отклонено', color: C.red, values: s.rejected, thin: true, dashed: true }]}/></Card>
      <Card title="Активность"><Chart days={data.days} height={170} series={[
        { key: 'likes', label: 'Лайки', color: C.pink, values: s.likes },
        { key: 'comments', label: 'Комментарии', color: C.violet, values: s.comments, thin: true },
        { key: 'follows', label: 'Подписки на авторов', color: C.teal, values: s.follows, thin: true }]}/></Card>
    </div>

    <div className="admin-section-title"><h2>Топ за {periodName}</h2></div>
    <div className="admin-grid admin-tops">
      <Card title="Разделы сайта" hint="посетители"><Bars rows={t.sections.map((row) => ({ key: row.page, name: row.label, note: `${number(row.views)} просм.`, value: row.visitors }))}/></Card>
      <Card title="Сетки: скачивания"><Bars rows={t.gridDownloads.map((row) => ({ key: row.id, name: row.title, href: `${CATALOG_PATH}?id=${row.id}`, value: row.downloads }))} unit="скач."/></Card>
      <Card title="Сетки: просмотры"><Bars rows={t.works.map((row) => ({ key: row.id, name: row.title, href: `${CATALOG_PATH}?id=${row.id}`, value: row.visitors }))} unit="чел."/></Card>
      <Card title="Фоны: скачивания"><Bars rows={t.backgroundDownloads.map((row) => ({ key: row.id, name: row.title, href: `${CUSTOMIZE_PATH}?background=${row.id}`, value: row.downloads }))} unit="скач."/></Card>
      <Card title="Гайды: просмотры"><Bars rows={t.guides.map((row) => ({ key: row.id, name: row.title, href: `${GUIDES_PATH}?id=${row.id}`, value: row.visitors }))} unit="чел."/></Card>
      <Card title="Профили: просмотры"><Bars rows={t.profiles.map((row) => ({ key: row.id, name: row.title, href: `${CATALOG_PATH}?creator=${row.id}`, value: row.visitors }))} unit="чел."/></Card>
    </div>

    <div className="admin-section-title"><h2>За всё время</h2></div>
    <div className="admin-totals">{[
      ['Аккаунтов', totals.accounts, 'user'], ['Сеток в мастерской', totals.grids, 'grid'], ['Фонов', totals.backgrounds, 'brush'], ['Гайдов', totals.guides, 'guides'],
      ['Артов', totals.arts, 'art'], ['Лайков', totals.likes, 'heart'], ['Комментариев', totals.comments, 'comment'], ['Скачиваний из мастерской', totals.downloads, 'download'],
      ['Установок командой', totals.installs, 'terminal'], ['Подписок на авторов', totals.follows, 'bell'], ['Файлов в «Студии»', totals.workspaces, 'files'], ['Посетителей с начала счёта', totals.visitors, 'eye'],
    ].map(([label, value, icon]) => <div key={label}><Icon name={icon} size={16}/><b>{number(value)}</b><span>{label}</span></div>)}</div>
  </section>;
}
