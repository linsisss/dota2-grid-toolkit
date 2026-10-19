import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '../Common.jsx';

// The chart kit of «Аналитика» (AdminAnalytics.jsx), drawn here in SVG — no chart library. It follows the
// dataviz method: the categorical slots in a fixed order, validated against the panel's surface #1b1922
// (dark: every adjacent pair ≥ 8.4 ΔE under colour-blindness, all ≥ 3:1); thin marks (2px lines, bars ≤ 24px
// with a rounded data end and a 2px gap), hairline solid grid, a crosshair tooltip on lines and a tooltip on
// every bar or cell, a legend for two series and more, text in text colours only, and a table (with CSV)
// behind every chart. The previous period is drawn as a thin grey line — never a second axis.
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
export const PREVIOUS = '#7d778a';
export const GOOD = '#0ca30c', BAD = '#e66767';
const DAY = 86_400_000, MSK = 3 * 3_600_000;
export const number = (n) => Number(n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 });
export const decimal = (n, digits = 1) => Number(n || 0).toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
export const percent = (share, digits = 0) => `${(Number(share || 0) * 100).toLocaleString('ru-RU', { maximumFractionDigits: digits })}%`;
export const compact = (n) => { const v = Number(n || 0), a = Math.abs(v); return a >= 1e6 ? `${decimal(v / 1e6)}M` : a >= 1e4 ? `${decimal(v / 1e3, 0)}K` : a >= 1e3 ? `${decimal(v / 1e3)}K` : decimal(v, 1); };
export const duration = (seconds) => { const s = Math.round(Number(seconds) || 0); return s >= 3600 ? `${Math.floor(s / 3600)} ч ${Math.floor((s % 3600) / 60)} мин` : s >= 60 ? `${Math.floor(s / 60)} мин ${s % 60} с` : `${s} с`; };
export const dateOf = (day, options = { day: 'numeric', month: 'short' }) => new Date(day * DAY - MSK + 12 * 3_600_000).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', ...options });
const sum = (list) => list.reduce((a, b) => a + (Number(b) || 0), 0);

// CSV for Excel in Russian: «;» between fields, UTF-8 with a BOM.
export function downloadCSV(name, columns, rows) {
  const cell = (value) => { const text = value === null || value === undefined ? '' : String(value); return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
  const lines = [columns.map((c) => cell(c.label)).join(';'), ...rows.map((row) => columns.map((c) => cell(c.csv ? c.csv(row) : row[c.key])).join(';'))];
  const url = URL.createObjectURL(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `${name}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useWidth(min = 260) {
  const ref = useRef(null), [width, setWidth] = useState(640);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(min, Math.round(entry.contentRect.width))));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
// The axis' top: a clean number just above the largest value, and its ticks.
function scale(max) {
  if (max <= 0) return { top: 4, ticks: [0, 2, 4] };
  // Whole steps: the values are counts (and seconds).
  const raw = max / 4, power = 10 ** Math.floor(Math.log10(raw)), step = Math.max(1, [1, 2, 2.5, 5, 10].find((m) => m * power >= raw) * power);
  const top = Math.ceil(max / step) * step;
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}

// A card: the title, a note, and the switch to the table (with the CSV) when `table` is given.
export function Card({ title, hint, wide, table, csv, children, className = '' }) {
  const [asTable, setAsTable] = useState(false);
  return <section className={`an-card${wide ? ' is-wide' : ''} ${className}`.trim()}>
    <header className="an-card-head"><div><h3>{title}</h3>{hint && <p>{hint}</p>}</div>
      <div className="an-card-tools">
        {table && <button type="button" className="an-chip" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}><Icon name={asTable ? 'gauge' : 'bulletList'} size={14}/>{asTable ? 'График' : 'Таблица'}</button>}
        {csv && <button type="button" className="an-chip" onClick={csv} title="Скачать CSV"><Icon name="download" size={14}/>CSV</button>}
      </div></header>
    {asTable && table ? table : children}
  </section>;
}

// A number with its change against the period before. `good`: 'up' (more is better), 'down' or 'none'.
// Redesigned on 2026-10-19: no «раньше — 0» (a period before the counter is not a change); a zero with nothing
// before is muted; `primary` — a big number with an area chart of the period under it.
export function Tile({ label, value, format = number, before, good = 'up', spark, hint, primary = false, color = SERIES[0] }) {
  const change = before ? (value - before) / before : null;
  const tone = change === null || Math.abs(change) < 0.005 || good === 'none' ? '' : (change > 0) === (good === 'up') ? 'is-good' : 'is-bad';
  const quiet = !value && !before;
  return <div className={`an-tile${primary ? ' is-primary' : ''}${quiet ? ' is-quiet' : ''}`} title={hint}>
    <span className="an-tile-label">{label}</span>
    <span className="an-tile-row"><b className="an-tile-value">{format(value)}</b>
      {change !== null && <span className={`an-delta ${tone}`} title={`было ${format(before)}`}><Icon name={change >= 0 ? 'chevronUp' : 'chevron'} size={12}/>{percent(Math.abs(change))}</span>}</span>
    {spark && spark.some(Boolean) && <Spark values={spark} color={color} area={primary}/>}
  </div>;
}
export function Spark({ values, color = SERIES[0], area = false }) {
  const n = values.length, W = 240, H = area ? 56 : 28, id = `an-spark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (n < 2) return <svg className="an-spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true"/>;
  const top = Math.max(1, ...values), x = (i) => (i / (n - 1)) * W, y = (v) => H - 2 - (v / top) * (H - 6);
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return <svg className={`an-spark${area ? ' is-area' : ''}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
    {area && <><defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".32"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      <polygon points={`0,${H} ${line} ${W},${H}`} fill={`url(#${id})`}/></>}
    <polyline points={line} fill="none" stroke={area ? color : PREVIOUS} strokeWidth={area ? 2 : 1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round"/>
    <circle cx={x(n - 1)} cy={y(values[n - 1])} r="2.5" fill={color}/>
  </svg>;
}

// A table of rows: sortable by a column, a bar under the first numeric column when `bar`, CSV of all rows.
export function Table({ columns, rows, limit = 12, bar, empty = 'Пока пусто', name = 'table', sortable = true }) {
  const [sort, setSort] = useState(null), [all, setAll] = useState(false);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key), value = (row) => (column.sort ? column.sort(row) : row[column.key]);
    return [...rows].sort((a, b) => { const x = value(a), y = value(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'ru')) * sort.dir; });
  }, [rows, sort]);
  // All zeros says nothing yet (2026-10-19): shown like an empty table, so its card folds.
  const numeric = columns.filter((c) => c.num);
  if (!rows.length || (numeric.length && rows.every((row) => numeric.every((c) => !Number(row[c.key]))))) return <p className="an-empty">{empty}</p>;
  const shown = all ? sorted : sorted.slice(0, limit), top = bar ? Math.max(1, ...rows.map((row) => Number(row[bar]) || 0)) : 1;
  return <div className="an-table-wrap">
    <table className="an-table"><thead><tr>{columns.map((c) => <th key={c.key} className={c.num ? 'is-num' : ''} scope="col">
      {sortable ? <button type="button" onClick={() => setSort(sort?.key === c.key ? { key: c.key, dir: -sort.dir } : { key: c.key, dir: c.num ? -1 : 1 })}>{c.label}{sort?.key === c.key && <Icon name={sort.dir > 0 ? 'chevronUp' : 'chevron'} size={12}/>}</button> : c.label}</th>)}</tr></thead>
      <tbody>{shown.map((row, i) => <tr key={row.id ?? row.key ?? i}>{columns.map((c, j) => <td key={c.key} className={c.num ? 'is-num' : ''}>
        {bar && c.key === bar ? <span className="an-cell-bar"><i style={{ width: `${((Number(row[bar]) || 0) / top) * 100}%` }}/><span>{c.format ? c.format(row[c.key], row) : number(row[c.key])}</span></span>
          : c.format ? c.format(row[c.key], row) : c.num ? number(row[c.key]) : (row[c.key] ?? '—')}
        {j === 0 && row.note && <small className="an-note">{row.note}</small>}</td>)}</tr>)}</tbody></table>
    <div className="an-table-foot">
      {rows.length > limit && <button type="button" className="an-chip" onClick={() => setAll(!all)}>{all ? 'Свернуть' : `Показать все (${rows.length})`}</button>}
      <button type="button" className="an-chip" onClick={() => downloadCSV(name, columns, sorted)}><Icon name="download" size={14}/>CSV</button>
    </div>
  </div>;
}

// Ranked rows with a bar: one series, one colour; the value at the bar's end and its share.
export function BarList({ rows, limit = 10, empty = 'Пока пусто', format = number, share = true, name = 'list', unit = '' }) {
  const [all, setAll] = useState(false);
  if (!rows.length || rows.every((row) => !row.value)) return <p className="an-empty">{empty}</p>;
  const top = Math.max(1, ...rows.map((row) => row.value)), total = sum(rows.map((row) => row.value)) || 1, shown = all ? rows : rows.slice(0, limit);
  return <div>
    <ol className="an-bars">{shown.map((row) => <li key={row.key} title={`${row.label}: ${format(row.value)}${unit}`}>
      <span className="an-bars-label">{row.href ? <a href={row.href} target="_blank" rel="noreferrer">{row.label}</a> : row.label}{row.note && <small>{row.note}</small>}</span>
      <span className="an-bars-track"><i style={{ width: `${Math.max(1.5, (row.value / top) * 100)}%` }}/></span>
      <span className="an-bars-value">{format(row.value)}{unit}{share && <small>{percent(row.value / total)}</small>}</span>
    </li>)}</ol>
    <div className="an-table-foot">
      {rows.length > limit && <button type="button" className="an-chip" onClick={() => setAll(!all)}>{all ? 'Свернуть' : `Показать все (${rows.length})`}</button>}
      <button type="button" className="an-chip" onClick={() => downloadCSV(name, [{ key: 'label', label: 'Название' }, { key: 'value', label: 'Значение' }], rows)}><Icon name="download" size={14}/>CSV</button>
    </div>
  </div>;
}

// Lines over the days, with a crosshair that snaps to the day and lists every series; `previous`: the
// same series of the period before, thin and grey, by position (day 1 against day 1).
export function LineChart({ days, series, previous = [], height = 220, format = number, area = series.length === 1 }) {
  const [wrap, W] = useWidth(), id = useId().replace(/:/g, ''), [at, setAt] = useState(-1), box = useRef(null);
  const H = height, L = 44, R = 10, T = 12, B = 26, n = days.length;
  if (![...series, ...previous].some((s) => s.values.some((v) => Number(v)))) return <p className="an-empty">Пока нет данных</p>;
  const all = [...series, ...previous], { top, ticks } = scale(Math.max(0, ...all.flatMap((s) => s.values)));
  const x = (i) => (n <= 1 ? L + (W - L - R) / 2 : L + ((W - L - R) * i) / (n - 1)), y = (v) => T + (H - T - B) * (1 - (Number(v) || 0) / top);
  const labels = Math.max(2, Math.min(n, Math.floor((W - L - R) / 80))), marks = n <= labels ? days.map((_, i) => i) : Array.from({ length: labels }, (_, k) => Math.round((k * (n - 1)) / (labels - 1)));
  const pick = (event) => { const rect = box.current.getBoundingClientRect(), px = ((event.clientX - rect.left) / rect.width) * W; setAt(Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1))))); };
  const key = (event) => { if (event.key === 'ArrowRight') setAt((i) => Math.min(n - 1, i + 1)); if (event.key === 'ArrowLeft') setAt((i) => Math.max(0, (i < 0 ? n : i) - 1)); };
  return <div className="an-chart" ref={wrap}>
    <svg ref={box} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.label).join(', ')} tabIndex={0} onKeyDown={key} onFocus={() => setAt(n - 1)} onBlur={() => setAt(-1)}
      onPointerMove={pick} onPointerLeave={() => setAt(-1)}>
      {area && series[0] && <defs><linearGradient id={`a${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={series[0].color} stopOpacity=".16"/><stop offset="1" stopColor={series[0].color} stopOpacity=".02"/></linearGradient></defs>}
      {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v ? 'an-gridline' : 'an-axis'}/><text x={L - 8} y={y(v) + 4} textAnchor="end">{compact(v)}</text></g>)}
      {marks.map((i) => <text key={i} x={x(i)} y={H - 7} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{dateOf(days[i])}</text>)}
      {previous.map((s) => <polyline key={`p${s.key}`} points={s.values.slice(0, n).map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={PREVIOUS} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity=".8"/>)}
      {area && series[0] && n > 1 && <polygon points={`${x(0)},${y(0)} ${series[0].values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} ${x(n - 1)},${y(0)}`} fill={`url(#a${id})`}/>}
      {series.map((s) => <polyline key={s.key} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>)}
      {n === 1 && series.map((s) => <circle key={s.key} cx={x(0)} cy={y(s.values[0])} r="4" fill={s.color}/>)}
      {at >= 0 && <line x1={x(at)} x2={x(at)} y1={T} y2={H - B} className="an-cursor"/>}
      {at >= 0 && series.map((s) => <circle key={s.key} cx={x(at)} cy={y(s.values[at])} r="4" fill={s.color} stroke="#1b1922" strokeWidth="2"/>)}
    </svg>
    {at >= 0 && <div className={`an-tip${at > n * 0.6 ? ' is-left' : ''}`} style={{ left: `${(x(at) / W) * 100}%` }} role="status">
      <b>{dateOf(days[at], { day: 'numeric', month: 'long', weekday: 'short' })}</b>
      {series.map((s) => <span key={s.key}><i style={{ background: s.color }}/><strong>{format(s.values[at])}</strong>{s.label}</span>)}
      {previous.map((s) => <span key={`p${s.key}`}><i style={{ background: PREVIOUS }}/><strong>{format(s.values[at])}</strong>{s.label}</span>)}
    </div>}
    {series.length + previous.length > 1 && <div className="an-legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }}/>{s.label}</span>)}
      {previous.map((s) => <span key={`p${s.key}`}><i style={{ background: PREVIOUS }}/>{s.label}</span>)}</div>}
  </div>;
}
// The table twin of a chart over days.
export function DaysTable({ days, series, format = number, name = 'days' }) {
  const columns = [{ key: 'date', label: 'День' }, ...series.map((s) => ({ key: s.key, label: s.label, num: true, format }))];
  const rows = days.map((day, i) => ({ id: day, date: dateOf(day, { day: 'numeric', month: 'short', year: 'numeric' }), ...Object.fromEntries(series.map((s) => [s.key, s.values[i]])) })).reverse();
  return <Table columns={columns} rows={rows} limit={14} name={name} sortable={false}/>;
}

// Columns over the days, one series: ≤24px, a rounded top, 2px apart; each column has its tooltip.
export function Columns({ days, values, color = SERIES[0], height = 150, format = number, label = '' }) {
  const [wrap, W] = useWidth(200), [at, setAt] = useState(-1);
  const H = height, L = 40, R = 6, T = 10, B = 24, n = days.length, slot = (W - L - R) / Math.max(1, n), width = Math.max(1, Math.min(24, slot - 2));
  if (!values.some((v) => Number(v))) return <p className="an-empty">Пока нет данных</p>;
  const { top, ticks } = scale(Math.max(0, ...values)), y = (v) => T + (H - T - B) * (1 - (Number(v) || 0) / top);
  const labels = Math.max(2, Math.min(n, Math.floor((W - L - R) / 80))), marks = n <= labels ? days.map((_, i) => i) : Array.from({ length: labels }, (_, k) => Math.round((k * (n - 1)) / (labels - 1)));
  return <div className="an-chart" ref={wrap}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerLeave={() => setAt(-1)}>
      {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v ? 'an-gridline' : 'an-axis'}/><text x={L - 8} y={y(v) + 4} textAnchor="end">{compact(v)}</text></g>)}
      {values.map((v, i) => { const x0 = L + slot * i + (slot - width) / 2, h = Math.max(0, y(0) - y(v)), r = Math.min(4, width / 2, h);
        return <g key={days[i]} onPointerEnter={() => setAt(i)}>
          <rect x={L + slot * i} y={T} width={slot} height={H - T - B} fill="transparent"/>
          {v > 0 && <path d={`M${x0},${y(0)} V${y(v) + r} Q${x0},${y(v)} ${x0 + r},${y(v)} H${x0 + width - r} Q${x0 + width},${y(v)} ${x0 + width},${y(v) + r} V${y(0)} Z`} fill={color} opacity={at < 0 || at === i ? 1 : 0.55}/>}
        </g>; })}
      {marks.map((i) => <text key={i} x={L + slot * (i + 0.5)} y={H - 7} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{dateOf(days[i])}</text>)}
    </svg>
    {at >= 0 && <div className={`an-tip${at > n * 0.6 ? ' is-left' : ''}`} style={{ left: `${((L + slot * (at + 0.5)) / W) * 100}%` }} role="status">
      <b>{dateOf(days[at], { day: 'numeric', month: 'long', weekday: 'short' })}</b><span><i style={{ background: color }}/><strong>{format(values[at])}</strong>{label}</span></div>}
  </div>;
}

// A funnel: one bar per step (one colour), its share of the first step, the step's conversion and who dropped off before it.
export function Funnel({ steps }) {
  if (!steps.length || !steps[0].visitors) return <p className="an-empty">За этот период сюда никто не заходил.</p>;
  return <ol className="an-funnel">{steps.map((step, i) => <li key={step.id}>
    <div className="an-funnel-head"><span>{i + 1}. {step.label}</span><b>{number(step.visitors)}</b></div>
    <div className="an-funnel-track" title={`${step.label}: ${number(step.visitors)} · ${percent(step.ofFirst, 1)} от первого шага`}><i style={{ width: `${step.visitors ? Math.max(0.8, step.ofFirst * 100) : 0}%` }}/></div>
    <div className="an-funnel-note"><span>{percent(step.ofFirst, 1)} от первого шага</span>{i > 0 && <span>конверсия шага {percent(step.ofPrevious, 1)} · ушли {number(step.dropped)}</span>}</div>
  </li>)}</ol>;
}

// A sequential colour for a share 0–1: from near the surface to the slot-1 blue's light end.
export function heat(share) {
  const k = Math.max(0, Math.min(1, share)), a = [0x24, 0x2c, 0x44], b = [0x8c, 0xbb, 0xf2];
  return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * k)).join(',')})`;
}
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
// Sessions by weekday and hour (Moscow time).
export function Heatmap({ cells }) {
  const [at, setAt] = useState(null);
  const grid = WEEKDAYS.map(() => Array(24).fill(0));
  for (const cell of cells) grid[cell.weekday][cell.hour] = cell.n;
  const top = Math.max(1, ...grid.flat());
  return <div className="an-heat-wrap">
    <div className="an-heat" role="table" aria-label="Сессии по дням недели и часам" onPointerLeave={() => setAt(null)}>
      <span/>{Array.from({ length: 24 }, (_, h) => <span key={h} className="an-heat-hour">{h % 3 ? '' : h}</span>)}
      {grid.map((row, d) => [<span key={`d${d}`} className="an-heat-day">{WEEKDAYS[d]}</span>, ...row.map((n, h) => <i key={`${d}:${h}`} style={{ background: heat(n / top) }} onPointerEnter={() => setAt({ d, h, n })} title={`${WEEKDAYS[d]}, ${h}:00–${h + 1}:00 — ${number(n)}`}/>)])}
    </div>
    <p className="an-heat-note">{at ? <><b>{WEEKDAYS[at.d]}, {at.h}:00–{at.h + 1}:00</b> · {number(at.n)} сессий</> : <>Больше сессий — светлее · максимум {number(top)} в час · московское время</>}</p>
  </div>;
}

// Weekly cohorts: of those who first came in a week, the share back in each later week.
export function Cohorts({ cohorts }) {
  if (!cohorts.length) return <p className="an-empty">Пока нет когорт за этот период.</p>;
  const weeks = Math.max(...cohorts.map((c) => c.weeks.length));
  const columns = [{ key: 'week', label: 'Неделя' }, { key: 'size', label: 'Новых', num: true }, ...Array.from({ length: weeks - 1 }, (_, k) => ({ key: `w${k + 1}`, label: `+${k + 1}`, num: true }))];
  const rows = cohorts.map((c) => ({ week: `с ${dateOf(c.start)}`, size: c.size, ...Object.fromEntries(c.weeks.slice(1).map((n, k) => [`w${k + 1}`, percent(n / c.size, 1)])) }));
  return <div className="an-table-wrap">
    <table className="an-cohorts"><thead><tr><th scope="col">Первая неделя</th><th scope="col" className="is-num">Новых</th>{Array.from({ length: weeks - 1 }, (_, k) => <th key={k} scope="col" className="is-num">+{k + 1} нед.</th>)}</tr></thead>
      <tbody>{cohorts.map((c) => <tr key={c.week}><th scope="row">с {dateOf(c.start)}</th><td className="is-num">{number(c.size)}</td>
        {Array.from({ length: weeks - 1 }, (_, k) => { const n = c.weeks[k + 1]; if (n === undefined) return <td key={k} className="is-blank"/>;
          const share = n / c.size; return <td key={k} className="is-num" style={{ background: heat(Math.min(1, share * 2.5)), color: share * 2.5 > 0.55 ? '#10131c' : undefined }} title={`${number(n)} из ${number(c.size)}`}>{percent(share, share < 0.1 ? 1 : 0)}</td>; })}</tr>)}</tbody></table>
    <div className="an-table-foot"><button type="button" className="an-chip" onClick={() => downloadCSV('cohorts', columns, rows)}><Icon name="download" size={14}/>CSV</button></div>
  </div>;
}
