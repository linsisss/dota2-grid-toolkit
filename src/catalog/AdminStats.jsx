import { useEffect, useMemo, useRef, useState } from 'react';
import { catalogAPI, CATALOG_PATH, CUSTOMIZE_PATH, GUIDES_PATH } from './api.js';
import { Icon, Notice } from './Common.jsx';

// «Статистика» (server/site-stats.mjs; asked for on 2026-10-03: visits, sign-ups, downloads, activity —
// «полную по сайту»): who is on the site now, the period's numbers against the period before, a chart
// for each part with the day's values on hover, the tops, devices and languages, and everything to
// date. Moscow days. Charts are drawn here (SVG), no chart library.
const PERIODS = [[7, '7 дней'], [30, '30 дней'], [90, '90 дней'], [365, 'Год']];
const DAY = 86_400_000, MSK = 3 * 3_600_000;
const C = { violet: '#c4b5ed', amber: '#f3c46d', teal: '#7fd1c4', pink: '#f29bc0', blue: '#8fb8ff', green: '#9fd99a', red: '#ff8a8a', grey: '#8d86a0' };
const number = (n) => Number(n || 0).toLocaleString('ru-RU');
const dateOf = (day, options) => new Date(day * DAY - MSK + 12 * 3_600_000).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', ...options });

// The axis' top: 1, 2 or 5 times a power of ten, just above the largest value.
function niceMax(value) {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value)), step = [1, 2, 5, 10].find((m) => m * power >= value / 4) * power;
  return Math.ceil(value / step) * step;
}

// Bars (stacked) and lines over the days; hovering a day shows its values.
function Chart({ days, series, height = 190 }) {
  const box = useRef(null), [at, setAt] = useState(-1);
  const W = 640, H = height, L = 40, R = 8, T = 10, B = 24, n = days.length, slot = (W - L - R) / n;
  const bars = series.filter((s) => s.kind === 'bar'), lines = series.filter((s) => s.kind !== 'bar');
  const stack = days.map((_, i) => bars.reduce((sum, s) => sum + s.values[i], 0));
  const top = niceMax(Math.max(1, ...stack, ...lines.flatMap((s) => s.values)));
  const y = (v) => T + (H - T - B) * (1 - v / top), x = (i) => L + slot * (i + 0.5);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const labels = n <= 7 ? days.map((_, i) => i) : [0, Math.floor((n - 1) / 3), Math.floor((2 * (n - 1)) / 3), n - 1];
  const pick = (event) => {
    const rect = box.current.getBoundingClientRect(), px = ((event.clientX - rect.left) / rect.width) * W;
    setAt(Math.max(0, Math.min(n - 1, Math.floor((px - L) / slot))));
  };
  return <div className="admin-chart">
    <svg ref={box} viewBox={`0 0 ${W} ${H}`} role="img" onMouseMove={pick} onMouseLeave={() => setAt(-1)}>
      {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="admin-chart-grid"/><text x={L - 6} y={y(v) + 4} textAnchor="end">{number(v)}</text></g>)}
      {days.map((day, i) => { let base = 0; return <g key={day}>{bars.map((s) => { const v = s.values[i]; const r = <rect key={s.key} x={L + slot * i + slot * 0.14} width={Math.max(0.6, slot * 0.72)} y={y(base + v)} height={Math.max(0, y(base) - y(base + v))} fill={s.color} opacity={at < 0 || at === i ? 0.9 : 0.45}/>; base += v; return r; })}</g>; })}
      {lines.map((s) => <polyline key={s.key} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round"/>)}
      {at >= 0 && <line x1={x(at)} x2={x(at)} y1={T} y2={H - B} className="admin-chart-cursor"/>}
      {at >= 0 && lines.map((s) => <circle key={s.key} cx={x(at)} cy={y(s.values[at])} r="3.5" fill={s.color}/>)}
      {labels.map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor="middle">{dateOf(days[i], { day: 'numeric', month: 'short' })}</text>)}
    </svg>
    {at >= 0 && <div className="admin-chart-tip" style={{ left: `${(x(at) / W) * 100}%` }}>
      <b>{dateOf(days[at], { day: 'numeric', month: 'long', weekday: 'short' })}</b>
      {series.map((s) => <span key={s.key}><i style={{ background: s.color }}/>{s.label}<strong>{number(s.values[at])}</strong></span>)}
    </div>}
    <div className="admin-chart-legend">{series.map((s) => <span key={s.key}><i className={s.kind === 'bar' ? '' : 'is-line'} style={{ background: s.color }}/>{s.label}
      <strong>{number(s.values.reduce((a, b) => a + b, 0))}</strong></span>)}</div>
  </div>;
}

function Delta({ now, before }) {
  if (!before) return now ? <small className="admin-delta is-new">новое</small> : null;
  const change = Math.round(((now - before) / before) * 100);
  return <small className={`admin-delta ${change > 0 ? 'is-up' : change < 0 ? 'is-down' : ''}`}>{change > 0 ? '+' : change < 0 ? '−' : '±'}{Math.abs(change)}%</small>;
}

function Top({ title, rows, columns, empty = 'Пока пусто' }) {
  return <div className="admin-top-list"><h3>{title}</h3>
    {rows.length ? <table><thead><tr><th/>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i}><td>{row.href ? <a href={row.href} target="_blank" rel="noreferrer">{row.name}</a> : row.name}</td>
        {columns.map(([key]) => <td key={key}>{number(row[key])}</td>)}</tr>)}</tbody></table>
      : <p className="catalog-muted">{empty}</p>}</div>;
}

function Split({ title, parts }) {
  const sum = parts.reduce((a, [, v]) => a + v, 0) || 1;
  return <div className="admin-split"><h3>{title}</h3><div className="admin-split-bar">{parts.map(([label, v, color]) => <i key={label} style={{ width: `${(v / sum) * 100}%`, background: color }}/>)}</div>
    <div className="admin-chart-legend">{parts.map(([label, v, color]) => <span key={label}><i style={{ background: color }}/>{label}<strong>{number(v)} · {Math.round((v / sum) * 100)}%</strong></span>)}</div></div>;
}

export default function AdminStats({ denied }) {
  const [days, setDays] = useState(30), [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = () => { setBusy(true); catalogAPI(`/admin/stats?days=${days}`).then((value) => { setData(value); setError(''); }, (problem) => { denied?.(problem); setError(problem.message); }).finally(() => setBusy(false)); };
  useEffect(load, [days]);
  const view = useMemo(() => data && {
    kpis: [['Посетители', 'visitors', 'user'], ['Просмотры', 'views', 'eye'], ['Регистрации', 'registrations', 'idCard'], ['Скачивания', 'downloads', 'download'],
      ['Установки командой', 'installs', 'terminal'], ['Новые работы', 'works', 'sparkle'], ['Лайки', 'likes', 'heart'], ['Комментарии', 'comments', 'comment']],
    s: data.series,
  }, [data]);
  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data) return <p role="status">Считаем статистику…</p>;
  const { s } = view, t = data.top, totals = data.totals;
  return <section className="admin-stats">
    <div className="admin-stats-head">
      <div className="catalog-tabs" aria-label="Период">{PERIODS.map(([value, label]) => <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>{label}</button>)}</div>
      <span className="admin-online"><i/>Сейчас на сайте: <b>{number(data.online)}</b></span>
      <button type="button" className="catalog-button" disabled={busy} onClick={load}><Icon name="replay" size={15}/>{busy ? 'Считаем…' : 'Обновить'}</button>
    </div>
    <p className="catalog-muted admin-hint">За {PERIODS.find(([v]) => v === days)[1].toLowerCase()} по московскому времени; в скобках — изменение к таким же дням до этого. Посетители — разные браузеры, просмотры — все открытия страниц.
      {totals.since ? ` Посещения считаются с ${dateOf(totals.since, { day: 'numeric', month: 'long' })}.` : ' Посещения начнут считаться с первых заходов после выкладки.'}</p>
    <div className="admin-kpis">{view.kpis.map(([label, key, icon]) => <div key={key} className="admin-kpi"><span><Icon name={icon} size={15}/>{label}</span>
      <b>{number(data.period[key])}<Delta now={data.period[key]} before={data.previous[key]}/></b><small>сегодня {number(data.now[key])}</small></div>)}</div>
    <div className="admin-charts">
      <div className="admin-card"><h3>Посещаемость</h3><Chart days={data.days} series={[
        { key: 'views', label: 'Просмотры', color: '#c4b5ed40', values: s.views, kind: 'bar' },
        { key: 'visitors', label: 'Посетители', color: C.violet, values: s.visitors },
        { key: 'new', label: 'Новые посетители', color: C.teal, values: s.newVisitors },
        { key: 'members', label: 'Вошедшие в аккаунт', color: C.amber, values: s.members }]}/></div>
      <div className="admin-card"><h3>Пользователи</h3><Chart days={data.days} series={[
        { key: 'registrations', label: 'Регистрации', color: C.green, values: s.registrations, kind: 'bar' },
        { key: 'logins', label: 'Входили через Telegram', color: C.blue, values: s.logins },
        { key: 'studio', label: 'Сохраняли в «Студии»', color: C.amber, values: s.studioSavers }]}/></div>
      <div className="admin-card"><h3>Скачивания и установки</h3><Chart days={data.days} series={[
        { key: 'exports', label: 'Сетки из редактора', color: C.violet, values: s.gridExports, kind: 'bar' },
        { key: 'grids', label: 'Сетки из мастерской', color: C.blue, values: s.gridDownloads, kind: 'bar' },
        { key: 'packs', label: 'Собранные фоны', color: C.amber, values: s.backgroundPacks, kind: 'bar' },
        { key: 'backgrounds', label: 'Фоны из мастерской', color: C.pink, values: s.backgroundDownloads, kind: 'bar' },
        { key: 'fonts', label: 'Шрифты', color: C.teal, values: s.fontPacks, kind: 'bar' },
        { key: 'installs', label: 'Сетки командой PowerShell', color: C.green, values: s.installs }]}/></div>
      <div className="admin-card"><h3>Новые работы и проверка</h3><Chart days={data.days} series={[
        { key: 'grids', label: 'Сетки и правки', color: C.violet, values: s.grids, kind: 'bar' },
        { key: 'backgrounds', label: 'Фоны', color: C.pink, values: s.backgrounds, kind: 'bar' },
        { key: 'guides', label: 'Гайды', color: C.amber, values: s.guides, kind: 'bar' },
        { key: 'arts', label: 'Арты', color: C.teal, values: s.arts, kind: 'bar' },
        { key: 'approved', label: 'Одобрено', color: C.green, values: s.approved },
        { key: 'rejected', label: 'Отклонено', color: C.red, values: s.rejected }]}/></div>
      <div className="admin-card"><h3>Активность</h3><Chart days={data.days} series={[
        { key: 'likes', label: 'Лайки', color: C.pink, values: s.likes },
        { key: 'comments', label: 'Комментарии', color: C.violet, values: s.comments },
        { key: 'follows', label: 'Подписки на авторов', color: C.teal, values: s.follows }]}/></div>
      <div className="admin-card admin-splits">
        <Split title="Устройства" parts={[['Компьютер', data.devices.desktop, C.violet], ['Телефон и планшет', data.devices.mobile, C.amber]]}/>
        <Split title="Язык сайта" parts={[['Русский', data.languages.ru, C.violet], ['English', data.languages.en, C.teal]]}/>
      </div>
    </div>
    <div className="admin-tops">
      <Top title="Разделы сайта" rows={t.sections.map((row) => ({ name: row.label, visitors: row.visitors, views: row.views }))} columns={[['visitors', 'Посетители'], ['views', 'Просмотры']]}/>
      <Top title="Откуда приходят" rows={t.referrers.map((row) => ({ name: row.host, visitors: row.visitors }))} columns={[['visitors', 'Посетители']]} empty="Пока никто не пришёл с других сайтов"/>
      <Top title="Сетки: скачивания" rows={t.gridDownloads.map((row) => ({ name: row.title, href: `${CATALOG_PATH}?id=${row.id}`, downloads: row.downloads }))} columns={[['downloads', 'Скачали']]}/>
      <Top title="Сетки: просмотры страниц" rows={t.works.map((row) => ({ name: row.title, href: `${CATALOG_PATH}?id=${row.id}`, visitors: row.visitors, views: row.views }))} columns={[['visitors', 'Посетители'], ['views', 'Просмотры']]}/>
      <Top title="Фоны: скачивания" rows={t.backgroundDownloads.map((row) => ({ name: row.title, href: `${CUSTOMIZE_PATH}?background=${row.id}`, downloads: row.downloads }))} columns={[['downloads', 'Скачали']]}/>
      <Top title="Гайды: просмотры" rows={t.guides.map((row) => ({ name: row.title, href: `${GUIDES_PATH}?id=${row.id}`, visitors: row.visitors, views: row.views }))} columns={[['visitors', 'Посетители'], ['views', 'Просмотры']]}/>
      <Top title="Профили: просмотры" rows={t.profiles.map((row) => ({ name: row.title, href: `${CATALOG_PATH}?creator=${row.id}`, visitors: row.visitors, views: row.views }))} columns={[['visitors', 'Посетители'], ['views', 'Просмотры']]}/>
    </div>
    <div className="admin-card"><h3>За всё время</h3><div className="admin-totals">{[
      ['Аккаунтов', totals.accounts], ['Сеток в мастерской', totals.grids], ['Фонов', totals.backgrounds], ['Гайдов', totals.guides], ['Артов', totals.arts],
      ['Лайков', totals.likes], ['Комментариев', totals.comments], ['Скачиваний из мастерской', totals.downloads], ['Установок командой', totals.installs],
      ['Подписок на авторов', totals.follows], ['Файлов в «Студии»', totals.workspaces], ['Посетителей с начала счёта', totals.visitors],
    ].map(([label, value]) => <div key={label}><b>{number(value)}</b><span>{label}</span></div>)}</div></div>
  </section>;
}
