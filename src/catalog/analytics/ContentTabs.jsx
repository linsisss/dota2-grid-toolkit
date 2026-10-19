import { useEffect, useState } from 'react';
import { catalogAPI, CATALOG_PATH, CUSTOMIZE_PATH, GUIDES_PATH } from '../api.js';
import { Notice } from '../Common.jsx';
import { BarList, Card, Columns, DaysTable, LineChart, SERIES, Table, Tile, dateOf, decimal, duration, percent } from './charts.jsx';
import { PLACE_LABELS, label } from './labels.js';
import { useReport } from './use-report.js';

// «Контент», «Ошибки», «Реклама» and «Метрика» of «Аналитика» (AdminAnalytics.jsx; server/analytics.mjs
// content, errors, ads; server/metrika.mjs).
const link = (href, text) => <a href={href} target="_blank" rel="noreferrer">{text}</a>;

// What Dotadle's hero search did not find this week (server/dotadle.mjs miss): candidates for nicknames in ALIASES.
function DotadleMisses() {
  const [items, setItems] = useState(null);
  useEffect(() => { catalogAPI('/admin/dotadle/misses').then((value) => setItems(value.items)).catch(() => setItems([])); }, []);
  if (!items) return null;
  return <Card title="Dotadle: поиск не нашёл" hint="за 7 дней · что вводили и кого потом выбрали — кандидаты в клички">
    <BarList name="dotadle-misses" share={false} unit=" раз" rows={items.map((row) => ({ key: `${row.text}:${row.hero}`, label: `«${row.text}»${row.name ? ` → ${row.name}` : ''}`, value: row.count }))} empty="Пока пусто: всё, что вводили, нашлось."/></Card>;
}

// Downloading again (server/analytics.mjs repeats): the same grid or background on a later day — Dota or
// Steam Cloud dropping the grid would show here.
function Repeats({ data }) {
  const kinds = [['grid', 'Сетки', (id) => `${CATALOG_PATH}?id=${id}`], ['background', 'Фоны', (id) => `${CUSTOMIZE_PATH}?background=${id}`]];
  return <>
    <h2 className="an-section">Повторные скачивания</h2>
    <p className="an-hint">По посетителям, кто скачивал файлом, командой или в редактор{data.from ? ` — с ${dateOf(data.from, { day: 'numeric', month: 'long' })}` : ''}: тот же файл в другой день значит, что его ставили заново.</p>
    <div className="an-grid">{kinds.map(([kind, title, href]) => { const k = data.kinds[kind]; if (!k) return null;
      return <Card key={kind} title={title} hint="кто скачал тот же файл ещё раз в другой день">
        <div className="an-tiles is-strip">
          <Tile label="Скачивали" value={k.visitors} good="none"/>
          <Tile label={`В разные дни${k.visitors ? ` · ${percent(k.onTwoDays / k.visitors, 1)}` : ''}`} value={k.onTwoDays} good="none"/>
          <Tile label={`Тот же файл снова${k.visitors ? ` · ${percent(k.sameAgain / k.visitors, 1)}` : ''}`} value={k.sameAgain} good="none"/>
          <Tile label="Через, дней (медиана)" value={k.medianGap} good="none"/>
        </div>
        <Table name={`repeats-${kind}`} bar="visitors" limit={10} empty="Пока никто не скачивал заново" rows={k.top.map((row) => ({ ...row, key: row.id }))}
          columns={[{ key: 'title', label: 'Название', format: (value, row) => link(href(row.id), value) }, { key: 'visitors', label: 'Скачали снова', num: true }]}/>
      </Card>; })}</div>
  </>;
}

export function ContentTab({ data }) {
  const s = data.series, d = data.dotadle;
  const publications = [{ key: 'grids', label: 'Сетки и правки', color: SERIES[0], values: s.grids }, { key: 'backgrounds', label: 'Фоны', color: SERIES[1], values: s.backgrounds },
    { key: 'guides', label: 'Гайды', color: SERIES[2], values: s.guides }, { key: 'arts', label: 'Арты', color: SERIES[3], values: s.arts }];
  const activity = [{ key: 'likes', label: 'Лайки', color: SERIES[0], values: s.likes }, { key: 'comments', label: 'Комментарии', color: SERIES[1], values: s.comments }, { key: 'follows', label: 'Подписки', color: SERIES[2], values: s.follows }];
  const item = (href) => ({ key: 'title', label: 'Название', format: (title, row) => link(href(row.id), title) });
  return <>
    <div className="an-grid">
      <Card wide title="Публикации" hint="присланные на проверку, по дням" table={<DaysTable days={data.days} series={publications} name="publications"/>}><LineChart days={data.days} series={publications} area={false}/></Card>
      <Card wide title="Лайки, комментарии, подписки" table={<DaysTable days={data.days} series={activity} name="activity"/>}><LineChart days={data.days} series={activity} area={false}/></Card>
      <Card wide title="Сетки" hint="посетители страницы сетки, скачивания, лайки и комментарии за период"><Table name="top-works" bar="visitors" columns={[item((id) => `${CATALOG_PATH}?id=${id}`),
        { key: 'visitors', label: 'Посетители', num: true }, { key: 'views', label: 'Просмотры', num: true }, { key: 'downloads', label: 'Скачивания', num: true }, { key: 'likes', label: 'Лайки', num: true }, { key: 'comments', label: 'Комм.', num: true }]} rows={data.works}/></Card>
      <Card wide title="Фоны" hint="открыли в мастерской, скачали собранным, лайки, комментарии"><Table name="top-backgrounds" bar="downloads" columns={[item((id) => `${CUSTOMIZE_PATH}?background=${id}`),
        { key: 'visitors', label: 'Открыли', num: true }, { key: 'downloads', label: 'Скачивания', num: true }, { key: 'likes', label: 'Лайки', num: true }, { key: 'comments', label: 'Комм.', num: true }]} rows={data.backgrounds}/></Card>
      <Card wide title="Гайды" hint="читатели, лайки, комментарии и дочитавшие до конца"><Table name="top-guides" bar="visitors" columns={[item((id) => `${GUIDES_PATH}?id=${id}`),
        { key: 'visitors', label: 'Читатели', num: true }, { key: 'views', label: 'Просмотры', num: true }, { key: 'reads', label: 'Дочитали', num: true }, { key: 'likes', label: 'Лайки', num: true }, { key: 'comments', label: 'Комм.', num: true }]} rows={data.guides}/></Card>
      <Card wide title="Авторы" hint="лайки и скачивания их работ за период, их новые публикации"><Table name="top-authors" bar="likes" columns={[{ key: 'name', label: 'Автор', format: (name, row) => (row.key ? link(`${CATALOG_PATH}?creator=${row.key}`, name) : name) },
        { key: 'likes', label: 'Лайков получили', num: true }, { key: 'downloads', label: 'Скачиваний', num: true }, { key: 'works', label: 'Публикаций', num: true }]} rows={data.authors.map((row, i) => ({ ...row, id: row.key || i }))}/></Card>
      <Card wide title="Мини-игры" hint="открыли, начали и закончили забег (по странице), прислали рекорд, людей в таблицах рекордов"><Table name="minigames" bar="open" limit={12} columns={[{ key: 'name', label: 'Игра' },
        { key: 'open', label: 'Открыли', num: true }, { key: 'start', label: 'Начали', num: true }, { key: 'finish', label: 'Закончили', num: true },
        { key: 'rate', label: 'Доигрывают', num: true, sort: (r) => (r.start ? (r.finish || 0) / r.start : 0), format: (_, r) => (r.start ? percent((r.finish || 0) / r.start) : '—') },
        { key: 'avgSeconds', label: 'Забег', num: true, format: (v) => (v ? duration(v) : '—') }, { key: 'record', label: 'Рекордов', num: true }, { key: 'leaders', label: 'В таблицах', num: true }]}
        rows={data.games.map((row) => ({ ...row, id: row.game }))} empty="В мини-игры за период не играли"/></Card>
    </div>
    {data.repeats && <Repeats data={data.repeats}/>}
    <h2 className="an-section">Dotadle</h2>
    {d ? <>
      <div className="an-tiles">
        <Tile label="Пользователей" value={d.players} good="none"/><Tile label="Игр дня" value={d.games} good="none"/><Tile label="Отгадали" value={d.solveRate} format={(n) => percent(n, 1)} good="none" hint="из законченных игр"/>
        <Tile label="Попыток в среднем" value={d.avgAttempts} format={(n) => decimal(n, 2)} good="none" hint="у отгаданных"/><Tile label="Тренировок" value={d.practice} good="none"/><Tile label="Поделились" value={d.shares} good="none"/>
      </div>
      <div className="an-grid">
        <Card title="Пользователи по дням" table={<DaysTable days={data.days} series={[{ key: 'p', label: 'Пользователи', values: d.series }]} name="dotadle-days"/>}><Columns days={data.days} values={d.series} label="пользователей"/></Card>
        <Card title="С какой попытки" hint="отгаданные игры; X — не отгадали"><BarList name="dotadle-tries" rows={d.distribution.map((n, i) => ({ key: i, label: i < 6 ? `${i + 1}-я попытка` : 'X — не отгадали', value: n }))} limit={7}/></Card>
        <DotadleMisses/>
      </div>
    </> : <p className="an-empty">Dotadle ещё не запускался.</p>}
  </>;
}

export function ErrorsTab({ data }) {
  const total = (list) => list.reduce((sum, row) => sum + row.count, 0);
  const lines = [{ key: 'js', label: 'Ошибки скриптов', color: SERIES[0], values: data.series.js }, { key: 'api', label: 'Ошибки запросов к API', color: SERIES[1], values: data.series.api },
    { key: 'server', label: 'Ошибки сервера 5xx', color: SERIES[2], values: data.series.server }];
  const when = (at) => (at ? new Date(at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  return <>
    <div className="an-tiles">
      <Tile label="Ошибки скриптов" value={total(data.js)} good="none"/><Tile label="Неудачные запросы" value={total(data.api)} good="none"/>
      <Tile label="Ошибки сервера" value={total(data.server)} good="none"/><Tile label="На 1000 сессий" value={data.sessions ? ((total(data.js) + total(data.api)) / data.sessions) * 1000 : 0} format={(n) => decimal(n, 1)} good="none" hint="ошибки скриптов и запросов"/>
    </div>
    <div className="an-grid">
      <Card wide title="Ошибки по дням" table={<DaysTable days={data.days} series={lines} name="errors-days"/>}><LineChart days={data.days} series={lines} area={false}/></Card>
      <Card wide title="Ошибки скриптов" hint="по сообщению и месту в коде; версия — последняя, где видели"><Table name="js-errors" bar="count" columns={[{ key: 'message', label: 'Сообщение' }, { key: 'place', label: 'Где' },
        { key: 'count', label: 'Раз', num: true }, { key: 'visitors', label: 'У скольких', num: true }, { key: 'page', label: 'Страница' }, { key: 'version', label: 'Версия' }, { key: 'last', label: 'Последний раз', format: when }]}
        rows={data.js.map((row) => ({ ...row, id: row.key }))} empty="Ошибок скриптов не было"/></Card>
      <Card wide title="Неудачные запросы к API" hint="адрес и ответ; 0 — нет связи"><Table name="api-errors" bar="count" columns={[{ key: 'place', label: 'Адрес' }, { key: 'status', label: 'Ответ', sort: (r) => Number(r.key.split('|')[1]), format: (_, r) => r.key.split('|')[1] },
        { key: 'count', label: 'Раз', num: true }, { key: 'visitors', label: 'У скольких', num: true }, { key: 'page', label: 'Страница' }, { key: 'last', label: 'Последний раз', format: when }]}
        rows={data.api.map((row) => ({ ...row, id: row.key }))} empty="Неудачных запросов не было"/></Card>
      <Card wide title="Ошибки сервера" hint="ответы 5xx нашего API"><Table name="server-errors" bar="count" columns={[{ key: 'place', label: 'Запрос' }, { key: 'status', label: 'Ответ', format: (_, r) => r.key.split('|')[1] },
        { key: 'count', label: 'Раз', num: true }, { key: 'last', label: 'Последний раз', format: when }]} rows={data.server.map((row) => ({ ...row, id: row.key }))} empty="Сервер не ошибался"/></Card>
    </div>
  </>;
}

export function AdsTab({ data }) {
  const views = data.places.reduce((sum, row) => sum + row.views, 0), clicks = data.places.reduce((sum, row) => sum + row.clicks, 0);
  return <>
    <div className="an-tiles">
      <Tile label="Показы" value={views} good="none" hint="баннер виден хотя бы наполовину; раз за сессию на месте"/><Tile label="Клики" value={clicks} good="none"/>
      <Tile label="CTR" value={views ? clicks / views : 0} format={(n) => percent(n, 2)} good="none"/>
      <Tile label="Клики по «Здесь может быть ваша реклама»" value={data.targets.offer || 0} good="none" hint="за последние 90 дней"/>
    </div>
    <div className="an-grid">
      <Card wide title="По местам"><Table name="spot-places" bar="views" columns={[{ key: 'label', label: 'Место' }, { key: 'views', label: 'Показы', num: true }, { key: 'viewers', label: 'Людей·дней', num: true },
        { key: 'clicks', label: 'Клики', num: true }, { key: 'ctr', label: 'CTR', num: true, format: (n) => percent(n, 2) }]} rows={data.places.map((row) => ({ ...row, key: row.place, label: label(PLACE_LABELS, row.place) }))} empty="Показов не было"/></Card>
      <Card title="Показы по дням" table={<DaysTable days={data.days} series={[{ key: 'v', label: 'Показы', values: data.series.views }]} name="spot-views"/>}><Columns days={data.days} values={data.series.views} label="показов"/></Card>
      <Card title="Клики по дням" table={<DaysTable days={data.days} series={[{ key: 'c', label: 'Клики', values: data.series.clicks }]} name="spot-clicks"/>}><Columns days={data.days} values={data.series.clicks} label="кликов" color={SERIES[1]}/></Card>
    </div>
  </>;
}

// ——— Метрика (server/metrika.mjs).
const METRIKA_HOWTO = ['Открой oauth.yandex.ru → «Создать приложение» (для веб-сервисов), в доступах выбери «Яндекс.Метрика: Получение статистики, чтение параметров своих и доверенных счётчиков» (metrika:read).',
  'Войди тем аккаунтом Яндекса, у которого есть доступ к счётчику 113559366, и получи токен: https://oauth.yandex.ru/authorize?response_type=token&client_id=<ID приложения>.',
  'Впиши токен в shared/catalog.env строкой METRIKA_TOKEN=<токен> (для dev — dev/shared/catalog.env).',
  'Перезапусти API: systemctl restart gridstudio-api (dev — gridstudio-dev-api). Токен остаётся на сервере и в браузер не попадает.'];
const mrows = (report, metric = 'visits', name = (v) => v) => (report?.rows || []).map((row, i) => ({ key: `${row.name}:${i}`, label: name(row.name) || 'Не определено', value: row.values[metric] || 0 }));
function MetrikaBlock({ title, hint, report, wide, children }) {
  return <Card title={title} hint={hint} wide={wide}>{report?.error ? <Notice error>{report.error}</Notice> : !report ? <p className="an-empty">Нет данных</p> : children}</Card>;
}
export function MetrikaTab({ query, denied }) {
  const { data, error, busy } = useReport(`/admin/analytics/metrika?${query}`, denied);
  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data) return <p role="status" className="an-loading">Спрашиваем Метрику…</p>;
  if (!data.configured) return <section className="an-card an-howto"><h3>Метрика не подключена</h3>
    <p>Чтобы видеть здесь данные Яндекс Метрики (поисковые фразы, пол и возраст, города, глубину и время визитов), серверу нужен OAuth-токен только для чтения:</p>
    <ol>{METRIKA_HOWTO.map((line) => <li key={line}>{line}</li>)}</ol></section>;
  const r = data.reports, sum = r.summary?.rows?.[0]?.values || {};
  const daily = r.daily?.rows || [], days = daily.map((row) => Math.floor(Date.parse(`${row.name}T00:00:00Z`) / 86_400_000));
  return <div className={`an-body${busy ? ' is-busy' : ''}`}>
    <p className="an-period">Данные Яндекс Метрики (счётчик {data.counter}) за {data.date1} — {data.date2}; обновляются раз в час · фильтры устройства и источника сюда не применяются</p>
    {r.summary?.error ? <Notice error>{r.summary.error}</Notice> : <div className="an-tiles">
      <Tile label="Визиты" value={sum.visits} good="none"/><Tile label="Посетители" value={sum.users} good="none"/><Tile label="Просмотры" value={sum.pageviews} good="none"/>
      <Tile label="Отказы" value={(sum.bounceRate || 0) / 100} format={(n) => percent(n, 1)} good="none"/><Tile label="Глубина" value={sum.pageDepth} format={(n) => decimal(n, 2)} good="none" hint="страниц за визит"/>
      <Tile label="Время на сайте" value={sum.avgVisitDurationSeconds} format={duration} good="none"/><Tile label="Новые посетители" value={(sum.percentNewVisitors || 0) / 100} format={(n) => percent(n, 1)} good="none"/>
    </div>}
    <div className="an-grid">
      <MetrikaBlock wide title="Визиты по дням" report={r.daily}>{days.length > 0 ? <LineChart days={days} series={[{ key: 'visits', label: 'Визиты', color: SERIES[0], values: daily.map((row) => row.values.visits) },
        { key: 'users', label: 'Посетители', color: SERIES[1], values: daily.map((row) => row.values.users) }]} area={false}/> : <p className="an-empty">Нет данных</p>}</MetrikaBlock>
      <MetrikaBlock title="Источники трафика" report={r.sources}><BarList name="metrika-sources" rows={mrows(r.sources)}/></MetrikaBlock>
      <MetrikaBlock title="Поисковые системы" report={r.engines}><BarList name="metrika-engines" rows={mrows(r.engines)}/></MetrikaBlock>
      <MetrikaBlock wide title="Поисковые фразы" hint="последний значимый источник" report={r.phrases}><Table name="metrika-phrases" bar="visits" columns={[{ key: 'name', label: 'Фраза' }, { key: 'visits', label: 'Визиты', num: true }, { key: 'users', label: 'Посетители', num: true }]}
        rows={(r.phrases?.rows || []).map((row, i) => ({ id: i, name: row.name || 'Не определено', ...row.values }))} limit={15} empty="Фраз нет (Яндекс и Google часто их скрывают)"/></MetrikaBlock>
      <MetrikaBlock title="Сайты" report={r.referrers}><BarList name="metrika-referrers" rows={mrows(r.referrers)}/></MetrikaBlock>
      <MetrikaBlock title="Соцсети" report={r.social}><BarList name="metrika-social" rows={mrows(r.social)}/></MetrikaBlock>
      <MetrikaBlock title="Страны" report={r.countries}><BarList name="metrika-countries" rows={mrows(r.countries)}/></MetrikaBlock>
      <MetrikaBlock title="Города" report={r.cities}><BarList name="metrika-cities" rows={mrows(r.cities)}/></MetrikaBlock>
      <MetrikaBlock title="Возраст" report={r.age}><BarList name="metrika-age" rows={mrows(r.age)} limit={8}/></MetrikaBlock>
      <MetrikaBlock title="Пол" report={r.gender}><BarList name="metrika-gender" rows={mrows(r.gender)}/></MetrikaBlock>
      <MetrikaBlock title="Устройства" report={r.devices}><BarList name="metrika-devices" rows={mrows(r.devices)}/></MetrikaBlock>
      <MetrikaBlock title="Системы" report={r.os}><BarList name="metrika-os" rows={mrows(r.os)}/></MetrikaBlock>
      <MetrikaBlock title="Браузеры" report={r.browsers}><BarList name="metrika-browsers" rows={mrows(r.browsers)}/></MetrikaBlock>
      <MetrikaBlock title="Глубина просмотра" hint="страниц за визит" report={r.depth}><BarList name="metrika-depth" rows={mrows(r.depth)} limit={12}/></MetrikaBlock>
      <MetrikaBlock title="Время на сайте" report={r.duration}><BarList name="metrika-duration" rows={mrows(r.duration)} limit={12}/></MetrikaBlock>
      <MetrikaBlock wide title="Страницы входа" report={r.landings}><Table name="metrika-landings" bar="visits" columns={[{ key: 'name', label: 'Адрес' }, { key: 'visits', label: 'Визиты', num: true }, { key: 'users', label: 'Посетители', num: true },
        { key: 'bounceRate', label: 'Отказы', num: true, format: (n) => `${decimal(n, 1)}%` }, { key: 'avgVisitDurationSeconds', label: 'Время', num: true, format: duration }]}
        rows={(r.landings?.rows || []).map((row, i) => ({ id: i, name: row.name, ...row.values }))} limit={15}/></MetrikaBlock>
    </div>
  </div>;
}
