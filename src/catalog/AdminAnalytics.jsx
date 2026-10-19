import { useEffect, useMemo, useState } from 'react';
import { catalogAPI } from './api.js';
import { useReport } from './analytics/use-report.js';
import { Icon, Notice } from './Common.jsx';
import { BarList, Card, Cohorts, DaysTable, Heatmap, LineChart, Columns, SERIES, Spark, Table, Tile, dateOf, decimal, duration, number, percent } from './analytics/charts.jsx';
import { DEVICE_LABELS, LANGUAGE_LABELS, SOURCE_LABELS, countryLabel, label } from './analytics/labels.js';
import { ContentTab, ErrorsTab, AdsTab, MetrikaTab } from './analytics/ContentTabs.jsx';
import { FunnelsTab, ToolsTab } from './analytics/ToolTabs.jsx';
import './analytics/analytics.css';

// «Аналитика» (asked for on 2026-10-19: «нужна полноценная аналитика для понимания всего, что есть на
// сайте»; docs/analytics.md). Admins only (the server checks every request). One row of filters scopes
// the tab below it: the period (7/30/90/365 days or two dates), «Сравнить» (the period before as grey
// lines), the device and the source where they apply. A tab is GET /admin/analytics?tab=…, cached a minute
// on the server; while a new one loads the old one stays, dimmed. Moscow days.
export const TABS = [['overview', 'Обзор', 'gauge'], ['sources', 'Источники', 'link'], ['audience', 'Аудитория', 'user'], ['tools', 'Инструменты', 'sliders'],
  ['funnels', 'Воронки', 'layers'], ['content', 'Контент', 'sparkle'], ['errors', 'Ошибки', 'bug'], ['metrika', 'Метрика', 'eye'], ['ads', 'Реклама', 'news']];
// Which filters a tab has.
const FILTERS = { overview: ['device', 'source'], sources: ['device'], audience: ['device', 'source'], tools: ['device', 'source'], funnels: ['device', 'source'], content: [], errors: [], metrika: [], ads: ['device', 'source'] };
const PERIODS = [[1, 'Сегодня'], [7, '7 дней'], [30, '30 дней'], [90, '90 дней'], [365, 'Год']];
// «Вчера» (2026-10-19): one Moscow day, sent as from = to.
const iso = (date) => date.toISOString().slice(0, 10);
const LIVE_EVERY = 10_000;

function readURL() {
  const params = new URLSearchParams(location.search), tab = params.get('tab');
  return { tab: TABS.some(([id]) => id === tab) ? tab : 'overview', days: Number(params.get('days')) || 30, from: params.get('from') || '', to: params.get('to') || '',
    device: params.get('device') || '', source: params.get('source') || '', compare: params.get('compare') === '1' };
}

export default function AdminAnalytics({ denied }) {
  const [view, setView] = useState(readURL);
  const set = (change) => setView((now) => {
    const next = { ...now, ...change }, url = new URL(location.href);
    for (const [key, value] of Object.entries({ tab: next.tab, days: next.from ? '' : next.days, from: next.from, to: next.to, device: next.device, source: next.source, compare: next.compare ? '1' : '' }))
      if (value && !(key === 'days' && value === 30) && !(key === 'tab' && value === 'overview')) url.searchParams.set(key, value); else url.searchParams.delete(key);
    history.replaceState(history.state, '', url);
    return next;
  });
  const allowed = FILTERS[view.tab];
  const query = new URLSearchParams({ tab: view.tab, ...(view.from && view.to ? { from: view.from, to: view.to } : { days: String(view.days) }),
    ...(allowed.includes('device') && view.device ? { device: view.device } : {}), ...(allowed.includes('source') && view.source ? { source: view.source } : {}) }).toString();
  const [tick, setTick] = useState(0);
  const custom = !!(view.from && view.to);
  const today = iso(new Date(Date.now() + 3 * 3_600_000)), yesterday = iso(new Date(Date.now() + 3 * 3_600_000 - 86_400_000));
  const isYesterday = custom && view.from === yesterday && view.to === yesterday;
  return <section className="an">
    {/* The tabs and the filters stick together (2026-10-19: scrolled, the tabs went out of sight under the sticky filters). */}
    <div className="an-head">
    <nav className="an-tabs" aria-label="Разделы аналитики">{TABS.map(([id, title, icon]) => <button key={id} type="button" aria-current={view.tab === id ? 'page' : undefined} onClick={() => set({ tab: id })}><Icon name={icon} size={16}/>{title}</button>)}</nav>
    <div className="an-filters" role="group" aria-label="Фильтры">
      <div className="an-segment" role="radiogroup" aria-label="Период">{PERIODS.slice(0, 1).map(([days, title]) => <button key={days} type="button" role="radio" aria-checked={!custom && view.days === days} onClick={() => set({ days, from: '', to: '' })}>{title}</button>)}
        <button type="button" role="radio" aria-checked={isYesterday} onClick={() => set({ from: yesterday, to: yesterday })}>Вчера</button>
        {PERIODS.slice(1).map(([days, title]) => <button key={days} type="button" role="radio" aria-checked={!custom && view.days === days} onClick={() => set({ days, from: '', to: '' })}>{title}</button>)}
        <button type="button" role="radio" aria-checked={custom && !isYesterday} onClick={() => { if (!custom || isYesterday) { const end = new Date(Date.now() + 3 * 3_600_000), start = new Date(end - (Math.max(7, view.days) - 1) * 86_400_000); set({ from: iso(start), to: iso(end) }); } }}>Свой</button></div>
      {custom && !isYesterday && <span className="an-dates"><input type="date" aria-label="С" value={view.from} max={view.to || today} onChange={(event) => event.target.value && set({ from: event.target.value })}/>—
        <input type="date" aria-label="По" value={view.to} min={view.from} max={today} onChange={(event) => event.target.value && set({ to: event.target.value })}/></span>}
      <button type="button" className="an-toggle" aria-pressed={view.compare} onClick={() => set({ compare: !view.compare })}><i aria-hidden="true"/>Сравнить с прошлым</button>
      {allowed.includes('device') && <Pick label="Устройства" value={view.device} onChange={(device) => set({ device })} options={[['', 'все'], ...['desktop', 'phone', 'tablet'].map((id) => [id, DEVICE_LABELS[id]])]}/>}
      {allowed.includes('source') && <Pick label="Источник" value={view.source} onChange={(source) => set({ source })} options={[['', 'все'], ...Object.entries(SOURCE_LABELS).filter(([id]) => id !== 'unknown')]}/>}
      <button type="button" className="an-chip an-refresh" onClick={() => setTick((n) => n + 1)}><Icon name="replay" size={14}/>Обновить</button>
    </div>
    </div>
    {view.tab === 'metrika' ? <MetrikaTab key={tick} query={query} denied={denied}/> : <TabBody key={`${view.tab}:${tick}`} tab={view.tab} query={`${query}&_=${tick}`} compare={view.compare} denied={denied}/>}
  </section>;
}

// A filter as a chip: «Устройства · все ⌄», the browser's own list under it (a transparent <select> on top).
function Pick({ label: name, value, options, onChange }) {
  const current = options.find(([id]) => id === value)?.[1] || options[0][1];
  return <label className={`an-pick${value ? ' is-set' : ''}`}><span>{name}</span><b>{current}</b><Icon name="chevron" size={14}/>
    <select aria-label={name} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>;
}

function TabBody({ tab, query, compare, denied }) {
  const { data, error, busy } = useReport(`/admin/analytics?${query}`, denied);
  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data) return <p role="status" className="an-loading">Считаем…</p>;
  const Body = { overview: OverviewTab, sources: SourcesTab, audience: AudienceTab, tools: ToolsTab, funnels: FunnelsTab, content: ContentTab, errors: ErrorsTab, ads: AdsTab }[tab];
  return <div className={`an-body${busy ? ' is-busy' : ''}`} aria-busy={busy}>
    <p className="an-period"><b>{dateOf(data.from, { day: 'numeric', month: 'long' })} — {dateOf(data.to, { day: 'numeric', month: 'long', year: 'numeric' })}</b>
      {data.filters.device ? ` · ${DEVICE_LABELS[data.filters.device]}` : ''}{data.filters.source ? ` · ${SOURCE_LABELS[data.filters.source]}` : ''}
      <span title={`События сайта ведутся с ${dateOf(data.since, { day: 'numeric', month: 'long' })}, раньше — по старому счётчику: у дней до этого нет разделов, кнопок и вовлечённого времени.`}> · проценты — к {dateOf(data.prevFrom)}–{dateOf(data.prevTo)} · подробные события с {dateOf(data.since, { day: 'numeric', month: 'long' })} <Icon name="help" size={13}/></span></p>
    <Body data={data} compare={compare} denied={denied}/>
  </div>;
}

// ——— Обзор.
function Live({ denied }) {
  const [live, setLive] = useState(null);
  useEffect(() => {
    let alive = true, timer;
    const tick = async () => {
      if (document.visibilityState === 'visible') { try { const value = await catalogAPI('/admin/stats/live'); if (alive) setLive(value); } catch (problem) { denied?.(problem); } }
      if (alive) timer = setTimeout(tick, LIVE_EVERY);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  if (!live) return null;
  return <div className="an-live">
    <div className="an-card an-online"><header className="an-card-head"><div><h3><i className="an-pulse"/>Сейчас на сайте</h3><p>за 5 минут · обновляется каждые 10 с</p></div></header>
      <b className="an-hero">{number(live.online)}</b><Spark values={live.minutes.map((m) => m.online)} color={SERIES[2]}/>
      <p className="an-hint">{live.minutes.length > 1 ? `последние ${live.minutes.length} мин · пик ${number(Math.max(...live.minutes.map((m) => m.online)))}` : 'график часа появится через пару минут'}</p></div>
    <Card title="Сейчас смотрят" hint="страницы за 5 минут"><BarList rows={live.pages.map((page) => ({ key: page.page, label: page.label, value: page.visitors }))} empty="Никого — тихо" unit=" чел." share={false} name="live"/></Card>
    <Card title="Сегодня"><div className="an-today">{[['visitors', 'Посетители'], ['views', 'Просмотры'], ['registrations', 'Регистрации'], ['downloads', 'Скачивания'], ['likes', 'Лайки'], ['comments', 'Комментарии']]
      .map(([key, title]) => <div key={key}><span>{title}</span><b>{number(live.today[key])}</b></div>)}</div></Card>
  </div>;
}
function OverviewTab({ data, compare, denied }) {
  const { now, before, series: s, days } = data, prev = data.seriesBefore;
  const tiles = [['visitors', 'Посетители', number, 'up'], ['newVisitors', 'Новые посетители', number, 'up'], ['sessions', 'Сессии', number, 'up'], ['views', 'Просмотры страниц', number, 'up'],
    ['avgEngaged', 'Вовлечённое время за сессию', duration, 'up'], ['pagesPerSession', 'Страниц за сессию', (n) => decimal(n, 2), 'up'], ['bounceRate', 'Отказы', (n) => percent(n, 1), 'down'],
    ['registrations', 'Регистрации', number, 'up'], ['downloads', 'Скачивания и сборки', number, 'up'], ['installs', 'Установки (подтверждены)', number, 'up'],
    ['works', 'Новые работы', number, 'up'], ['likes', 'Лайки', number, 'up'], ['comments', 'Комментарии', number, 'up']];
  const sparks = { visitors: s.visitors, newVisitors: s.newVisitors, sessions: s.sessions, views: s.views, avgEngaged: s.engaged, registrations: s.registrations, downloads: s.downloads, installs: s.installs };
  const main = [{ key: 'visitors', label: 'Посетители', color: SERIES[0], values: s.visitors }, { key: 'sessions', label: 'Сессии', color: SERIES[1], values: s.sessions }];
  return <>
    <Live denied={denied}/>
    <div className="an-tiles is-primary">{[['visitors', 0], ['sessions', 1], ['downloads', 2], ['registrations', 3]].map(([key, color]) => { const [, title, format, good] = tiles.find((t) => t[0] === key);
      return <Tile key={key} primary label={title} value={now[key]} before={before[key]} format={format} good={good} spark={sparks[key]} color={SERIES[color]}/>; })}</div>
    <div className="an-tiles is-strip">{tiles.filter(([key]) => !['visitors', 'sessions', 'downloads', 'registrations'].includes(key)).map(([key, title, format, good]) => <Tile key={key} label={title} value={now[key]} before={before[key]} format={format} good={good}/>)}</div>
    <div className="an-grid">
      <Card wide title="Посещаемость" hint={compare ? 'серые линии — прошлый период, день к дню' : 'посетители и сессии по дням'} table={<DaysTable days={days} series={main} name="visits"/>}>
        <LineChart days={days} series={main} previous={compare ? [{ key: 'visitors', label: 'Посетители, прошлый период', values: prev.visitors }, { key: 'sessions', label: 'Сессии, прошлый период', values: prev.sessions }] : []}/></Card>
      <Card title="Вовлечённое время" hint="в среднем за сессию, по дням" table={<DaysTable days={days} series={[{ key: 'engaged', label: 'Секунд', values: s.engaged }]} format={duration} name="engaged"/>}>
        <Columns days={days} values={s.engaged} format={duration} label="за сессию" color={SERIES[2]}/></Card>
      <Card title="Регистрации" table={<DaysTable days={days} series={[{ key: 'r', label: 'Регистрации', values: s.registrations }]} name="registrations"/>}><Columns days={days} values={s.registrations} label="регистраций" color={SERIES[2]}/></Card>
      <Card title="Скачивания и сборки" hint="мастерская, редактор, оформление" table={<DaysTable days={days} series={[{ key: 'd', label: 'Скачивания', values: s.downloads }]} name="downloads"/>}><Columns days={days} values={s.downloads} label="скачиваний" color={SERIES[0]}/></Card>
      <Card title="Установки командой" hint="подтверждённые установщиком" table={<DaysTable days={days} series={[{ key: 'i', label: 'Установки', values: s.installs }]} name="installs"/>}><Columns days={days} values={s.installs} label="установок" color={SERIES[0]}/></Card>
      <Card wide title="Страницы" hint="просмотры за период"><Table name="pages" bar="views" columns={[{ key: 'label', label: 'Страница' }, { key: 'views', label: 'Просмотры', num: true }, { key: 'visitors', label: 'Посетителей·дней', num: true }]}
        rows={data.pages.map((row) => ({ ...row, key: row.page }))} limit={15}/></Card>
    </div>
  </>;
}

// ——— Источники.
const sessionColumns = (first) => [first, { key: 'sessions', label: 'Сессии', num: true }, { key: 'visitors', label: 'Посетители', num: true }, { key: 'newVisitors', label: 'Новые', num: true },
  { key: 'bounceRate', label: 'Отказы', num: true, format: (n) => percent(n, 1) }, { key: 'avgEngaged', label: 'Время', num: true, format: duration }, { key: 'pagesPerSession', label: 'Стр./сессия', num: true, format: (n) => decimal(n, 2) }];
function SourcesTab({ data }) {
  const lines = data.series.map((s, i) => ({ key: s.source, label: s.label, color: s.source === 'rest' ? SERIES[6] : SERIES[i], values: s.values }));
  return <div className="an-grid">
    <Card wide title="Откуда приходят" hint="сессии по источникам; изменение — к прошлому периоду">
      <Table name="sources" bar="sessions" columns={[...sessionColumns({ key: 'label', label: 'Источник' }), { key: 'change', label: 'К прошлому', num: true, sort: (row) => row.sessions - row.before,
        format: (_, row) => (row.before ? `${row.sessions >= row.before ? '+' : '−'}${percent(Math.abs(row.sessions - row.before) / row.before)}` : 'новый') }]} rows={data.bySource.map((row) => ({ ...row, key: row.source }))}/></Card>
    <Card wide title="Источники по дням" hint="сессии; пять крупных и остальные" table={<DaysTable days={data.days} series={lines} name="sources-days"/>}><LineChart days={data.days} series={lines} area={false}/></Card>
    <Card title="Сайты" hint="откуда перешли по ссылке"><Table name="referrers" bar="sessions" columns={sessionColumns({ key: 'host', label: 'Сайт' }).slice(0, 5)} rows={data.referrers.map((row) => ({ ...row, key: row.host }))} empty="Переходов с других сайтов не было"/></Card>
    <Card title="Новые аккаунты" hint="откуда пришли зарегистрировавшиеся"><BarList name="signups" rows={data.signups.map((row) => ({ key: row.source, label: row.label, value: row.accounts }))} empty="Новых аккаунтов не было"/></Card>
    <Card wide title="UTM-метки" hint="utm_source / utm_medium / utm_campaign из адреса первой страницы"><Table name="utm" bar="sessions" columns={[{ key: 'source', label: 'source' }, { key: 'medium', label: 'medium' }, { key: 'campaign', label: 'campaign' },
      { key: 'sessions', label: 'Сессии', num: true }, { key: 'visitors', label: 'Посетители', num: true }, { key: 'newVisitors', label: 'Новые', num: true }]} rows={data.utm.map((row, i) => ({ ...row, key: i }))} empty="Переходов с UTM-метками не было"/></Card>
    <Card wide title="Страницы входа" hint="первая страница сессии"><Table name="landings" bar="sessions" columns={sessionColumns({ key: 'label', label: 'Страница' })} rows={data.landings.map((row) => ({ ...row, key: row.page }))}/></Card>
  </div>;
}

// ——— Аудитория.
const dimRows = (rows, name = (v) => v) => rows.map((row) => ({ key: row.value || '—', label: name(row.value), value: row.visitors, note: `${number(row.sessions)} сесс.` }));
function AudienceTab({ data, compare }) {
  const t = data.totals, b = data.before, s = data.series, prev = data.seriesBefore;
  const lines = [{ key: 'new', label: 'Новые', color: SERIES[0], values: s.newVisitors }, { key: 'returning', label: 'Вернувшиеся', color: SERIES[1], values: s.returning }];
  return <>
    <div className="an-tiles">
      <Tile label="Посетители" value={t.visitors} before={b.visitors}/><Tile label="Новые" value={t.newVisitors} before={b.newVisitors}/>
      <Tile label="Вернувшиеся" value={t.returning} before={b.visitors - b.newVisitors}/><Tile label="Сессии" value={t.sessions} before={b.sessions}/>
      <Tile label="Среднее время" value={t.avgEngaged} before={b.avgEngaged} format={duration}/><Tile label="Медиана времени" value={t.medianEngaged} format={duration} good="none"/>
      <Tile label="Страниц за сессию" value={t.pagesPerSession} before={b.pagesPerSession} format={(n) => decimal(n, 2)}/><Tile label="Отказы" value={t.bounceRate} before={b.bounceRate} format={(n) => percent(n, 1)} good="down"/>
      <Tile label="Вошли в аккаунт" value={t.members} before={b.members} hint="посетители, вошедшие через Telegram"/>
    </div>
    <div className="an-grid">
      <Card wide title="Новые и вернувшиеся" hint="посетители по дням: впервые на сайте и бывавшие раньше" table={<DaysTable days={data.days} series={lines} name="new-returning"/>}>
        <LineChart days={data.days} series={lines} area={false} previous={compare ? [{ key: 'new', label: 'Новые, прошлый период', values: prev.newVisitors }, { key: 'ret', label: 'Вернувшиеся, прошлый период', values: prev.returning }] : []}/></Card>
      <Card wide title="Удержание по неделям" hint="из пришедших впервые за неделю — доля вернувшихся через 1, 2, … недели; цвет насыщается к 40%"><Cohorts cohorts={data.cohorts}/></Card>
      <Card wide title="Когда заходят" hint="сессии по дням недели и часам · с начала событий сайта"><Heatmap cells={data.heat}/></Card>
      <Card title="Вовлечённое время" hint={`сессии по длительности · измерено ${number(t.measured)}`}><BarList name="engaged" rows={data.buckets.map((row) => ({ key: row.label, label: row.label, value: row.sessions }))} limit={10}/></Card>
      <Card title="Устройства"><BarList name="devices" rows={dimRows(data.devices, (v) => label(DEVICE_LABELS, v))}/></Card>
      <Card title="Системы"><BarList name="os" rows={dimRows(data.os, (v) => v || 'Неизвестно')}/></Card>
      <Card title="Браузеры"><BarList name="browsers" rows={dimRows(data.browsers, (v) => v || 'Неизвестно')}/></Card>
      <Card title="Ширина экрана" hint="CSS-пиксели окна"><BarList name="screens" rows={dimRows(data.screens, (v) => v || 'Неизвестно')}/></Card>
      <Card title="Страны" hint="по Cloudflare, иначе по часовому поясу браузера · с начала событий сайта"><BarList name="countries" rows={dimRows(data.countries, countryLabel)}/></Card>
      <Card title="Язык сайта"><BarList name="languages" rows={dimRows(data.languages, (v) => label(LANGUAGE_LABELS, v))}/></Card>
      <Card title="Язык браузера"><BarList name="browser-languages" rows={dimRows(data.browserLanguages, (v) => label(LANGUAGE_LABELS, v))}/></Card>
    </div>
  </>;
}

