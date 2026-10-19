import { BarList, Card, Columns, DaysTable, Funnel, SERIES, Table, Tile, dateOf, decimal, number, percent } from './charts.jsx';
import { ASCII_LABELS, CUSTOMIZE_LABELS, DELIVERY_LABELS, EXPORT_LABELS, FILE_LABELS, FROM_LABELS, IMPORT_LABELS, KIND_LABELS, MODE_LABELS, RESULT_LABELS, SCENE_LABELS, SECTION_LABELS, STEP_LABELS,
  TOOL_LABELS, DEVICE_LABELS, label } from './labels.js';

// «Инструменты» and «Воронки» of «Аналитика» (AdminAnalytics.jsx; server/analytics.mjs tools, funnels).
const keyed = (counts, name) => (counts[name] || []).filter((row) => row.key !== '*');
const total = (counts, name, field = 'events') => (counts[name] || []).find((row) => row.key === '*')?.[field] || 0;
const share = (n, base) => (base ? percent(n / base, 1) : '—');
// A table of one event by its key: events, sessions with it, and their share of the page's sessions.
function KeyTable({ counts, name, labels = {}, title, base, empty, keyLabel = 'Что', limit = 10, map }) {
  const rows = keyed(counts, name).map((row) => ({ ...row, label: map ? map(row.key) : label(labels, row.key) }));
  return <Table name={name} bar="sessions" limit={limit} empty={empty || 'Пока ничего'} columns={[{ key: 'label', label: keyLabel }, { key: 'sessions', label: 'Сессий', num: true },
    { key: 'events', label: 'Раз', num: true }, ...(base ? [{ key: 'share', label: title || 'Доля сессий', num: true, sort: (row) => row.sessions, format: (_, row) => share(row.sessions, base) }] : [])]} rows={rows}/>;
}

export function ToolsTab({ data }) {
  const c = data.counts, base = data.base;
  // Customization: each section — opened, changed, in a built file.
  const sections = Object.keys(CUSTOMIZE_LABELS).map((id) => ({ key: id, label: CUSTOMIZE_LABELS[id],
    opened: keyed(c, 'customize.section').find((r) => r.key === id)?.sessions || 0, changed: keyed(c, 'customize.change').find((r) => r.key === id)?.sessions || 0,
    built: keyed(c, 'customize.build-done').find((r) => r.key === id)?.events || 0 })).filter((row) => row.opened || row.changed || row.built);
  const builds = { start: total(c, 'customize.build-start'), done: total(c, 'customize.build-done'), fail: total(c, 'customize.build-fail') };
  const installRows = ['all', 'bg', 'font', 'grid'].map((kind) => ({ key: kind, label: KIND_LABELS[kind], ...Object.fromEntries(['ok', 'fail', 'removed'].map((r) => [r, data.installs.find((row) => row.kind === kind && row.result === r)?.n || 0])),
    commands: keyed(c, 'install.command').find((row) => row.key === kind)?.events || 0 })).filter((row) => row.ok || row.fail || row.removed || row.commands);
  const workshop = [['workshop.search', 'Поиск'], ['workshop.filter', 'Фильтры и сортировка'], ['workshop.open', 'Открыли работу'], ['workshop.download', 'Скачали или взяли'], ['workshop.command-copy', 'Скопировали команду'],
    ['workshop.install-help', 'Открыли «Как установить»'], ['workshop.like', 'Лайки'], ['workshop.comment', 'Комментарии'], ['workshop.report', 'Жалобы'], ['profile.follow', 'Подписки на авторов']]
    .map(([name, title]) => ({ key: name, label: title, sessions: total(c, name, 'sessions'), events: total(c, name) }));
  const depth = ['25', '50', '75', '100'].map((d) => ({ key: d, label: `${d}% гайда`, value: keyed(c, 'guides.read').find((r) => r.key === d)?.visitors || 0 }));
  return <>
    <h2 className="an-section">Оформление Dota <small>{number(base.customize)} сессий на странице</small></h2>
    <div className="an-tiles">
      <Tile label="Начали сборку" value={builds.start} good="none"/><Tile label="Собрали" value={builds.done} good="none" hint="файл или команда готовы"/>
      <Tile label="Ошибки сборки" value={builds.fail} good="none"/><Tile label="Средний размер, МБ" value={data.avgBuildMb} format={(n) => decimal(n, 1)} good="none"/>
      <Tile label="Скопировали команду" value={total(c, 'customize.command-copy')} good="none"/><Tile label="Скачали файлом" value={total(c, 'customize.download')} good="none"/>
      <Tile label="«Что внутри»" value={total(c, 'customize.inside', 'sessions')} good="none" hint="сессий, где открыли состав сборки"/><Tile label="«Как установить»" value={total(c, 'customize.install-help', 'sessions')} good="none"/>
    </div>
    <div className="an-grid">
      <Card wide title="Разделы" hint="сессий: открыли раздел · изменили его · раз в собранном файле"><Table name="customize-sections" bar="opened" columns={[{ key: 'label', label: 'Раздел' },
        { key: 'opened', label: 'Открыли', num: true }, { key: 'changed', label: 'Изменили', num: true }, { key: 'built', label: 'В сборке', num: true }, { key: 'rate', label: 'Изменили из открывших', num: true, sort: (r) => (r.opened ? r.changed / r.opened : 0), format: (_, r) => share(r.changed, r.opened) }]}
        rows={sections} limit={20}/></Card>
      <Card title="Моды d2pfx" hint="какие выбирают"><KeyTable counts={c} name="customize.mod" keyLabel="Мод" empty="Моды пока не выбирали"/></Card>
      <Card title="Готовые варианты" hint="HUD, чат, шрифты, курсоры, фоны из мастерской"><KeyTable counts={c} name="customize.preset" keyLabel="Вариант" limit={12}/></Card>
      <Card title="Сцены превью"><KeyTable counts={c} name="customize.scene" labels={SCENE_LABELS} keyLabel="Сцена"/></Card>
      <Card title="Как получают сборку"><KeyTable counts={c} name="customize.build-start" labels={DELIVERY_LABELS} keyLabel="Способ"/></Card>
      <Card title="Курсор: свой" hint="окно создания курсора"><BarList name="cursor" share={false} rows={[{ key: 'open', label: 'Открыли', value: keyed(c, 'customize.cursor-creator').find((r) => r.key === 'open')?.events || 0 },
        { key: 'save', label: 'Сохранили', value: keyed(c, 'customize.cursor-creator').find((r) => r.key === 'save')?.events || 0 }, { key: 'drag', label: 'Двигали чат', value: total(c, 'customize.chat-drag', 'sessions') }]}/></Card>
      <Card title="Почему не собралось"><KeyTable counts={c} name="customize.build-fail" keyLabel="Ошибка" empty="Ошибок сборки не было"/></Card>
      <Card wide title="Установки командой" hint="команды (собрано на сайте) и что ответил установщик PowerShell"><Table name="installs" bar="commands" columns={[{ key: 'label', label: 'Что' }, { key: 'commands', label: 'Команд', num: true },
        { key: 'ok', label: 'Поставлено', num: true }, { key: 'fail', label: 'Ошибка', num: true }, { key: 'removed', label: 'Убрано', num: true }, { key: 'rate', label: 'Успешно', num: true, sort: (r) => (r.ok + r.fail ? r.ok / (r.ok + r.fail) : 0), format: (_, r) => share(r.ok, r.ok + r.fail) }]}
        rows={installRows} empty="Установщик пока ничего не сообщал"/>
        {data.installFailures.length > 0 && <BarList name="install-failures" rows={data.installFailures.map((row, i) => ({ key: i, label: `${KIND_LABELS[row.kind] || row.kind}: ${label(STEP_LABELS, row.error)}`, value: row.n }))}/>}</Card>
      <Card wide title="Сборки по дням" table={<DaysTable days={data.days} series={[{ key: 'b', label: 'Сборки', values: data.series.customize }]} name="builds"/>}><Columns days={data.days} values={data.series.customize} label="сборок"/></Card>
    </div>

    <h2 className="an-section">Редактор и «Студия» <small>{number(base.editor)} сессий</small></h2>
    <div className="an-tiles">
      <Tile label="Изменяли файл" value={total(c, 'editor.edit', 'sessions')} good="none" hint="сессий с правкой"/><Tile label="Экспорт" value={total(c, 'editor.export')} good="none"/>
      <Tile label="Публикации" value={total(c, 'editor.publish')} good="none"/><Tile label="Сохранения в «Студии»" value={total(c, 'studio.save')} good="none" hint="по аккаунтам, считает сервер"/>
      <Tile label="Много отмен" value={total(c, 'editor.undo-heavy', 'sessions')} good="none" hint="сессий с 25+ отменами (Ctrl+Z)"/>
    </div>
    <div className="an-grid">
      <Card title="Инструменты" hint="доля — от сессий редактора"><KeyTable counts={c} name="editor.tool" labels={TOOL_LABELS} keyLabel="Инструмент" base={base.editor} limit={15}/></Card>
      <Card title="Режимы"><KeyTable counts={c} name="editor.mode" labels={MODE_LABELS} keyLabel="Режим" base={base.editor}/></Card>
      <Card title="Экспорт"><KeyTable counts={c} name="editor.export" labels={EXPORT_LABELS} keyLabel="Что скачали"/></Card>
      <Card title="Импорт"><KeyTable counts={c} name="editor.import" labels={IMPORT_LABELS} keyLabel="Что добавили"/></Card>
      <Card title="Файлы"><KeyTable counts={c} name="editor.file" labels={FILE_LABELS} keyLabel="Действие"/></Card>
      <Card title="Картинка → символы" hint="способ перевода"><KeyTable counts={c} name="editor.ascii" labels={ASCII_LABELS} keyLabel="Способ"/></Card>
      <Card title="Публикации"><KeyTable counts={c} name="editor.publish" labels={KIND_LABELS} keyLabel="Что"/></Card>
      <Card title="Экспорт по дням" table={<DaysTable days={data.days} series={[{ key: 'e', label: 'Экспорт', values: data.series.editor }]} name="exports"/>}><Columns days={data.days} values={data.series.editor} label="экспортов"/></Card>
    </div>

    <h2 className="an-section">Мастерская <small>{number(base.workshop)} сессий</small></h2>
    <div className="an-grid">
      <Card title="Что делают" hint="доля — от сессий мастерской"><Table name="workshop-actions" bar="sessions" limit={12} columns={[{ key: 'label', label: 'Действие' }, { key: 'sessions', label: 'Сессий', num: true },
        { key: 'events', label: 'Раз', num: true }, { key: 'share', label: 'Доля', num: true, sort: (r) => r.sessions, format: (_, r) => share(r.sessions, base.workshop) }]} rows={workshop}/></Card>
      <Card title="Поиск" hint="запросы за последние 90 дней; длинное и личное не хранится"><Table name="searches" bar="n" columns={[{ key: 'q', label: 'Запрос' }, { key: 'section', label: 'Где', format: (v) => label(SECTION_LABELS, v) },
        { key: 'n', label: 'Раз', num: true }, { key: 'empty', label: 'Без результата', num: true }]} rows={data.searches.map((row, i) => ({ ...row, key: i }))} empty="Поиском пока не пользовались"/></Card>
      <Card title="Фильтры и сортировка"><KeyTable counts={c} name="workshop.filter" keyLabel="Значение" limit={12}/></Card>
      <Card title="Открывали"><KeyTable counts={c} name="workshop.open" labels={KIND_LABELS} keyLabel="Что"/></Card>
      <Card title="Скачивали" hint="по разделу"><KeyTable counts={c} name="workshop.download" labels={KIND_LABELS} keyLabel="Что"/></Card>
      <Card title="Скачивания по дням" table={<DaysTable days={data.days} series={[{ key: 'w', label: 'Скачивания', values: data.series.workshop }]} name="workshop-downloads"/>}><Columns days={data.days} values={data.series.workshop} label="скачиваний"/></Card>
    </div>

    <h2 className="an-section">Гайды <small>{number(data.guideViews)} просмотров гайдов</small></h2>
    <div className="an-grid">
      <Card title="Дочитывание" hint="читателей, дошедших до доли текста"><BarList name="read-depth" rows={depth} share={false}/></Card>
      <Card title="Пишут гайды"><BarList name="guide-write" share={false} rows={[{ key: 'open', label: 'Открыли редактор', value: keyed(c, 'guides.write').find((r) => r.key === 'open')?.events || 0 },
        { key: 'submit', label: 'Отправили на проверку', value: keyed(c, 'guides.write').find((r) => r.key === 'submit')?.events || 0 }]}/></Card>
    </div>

    <h2 className="an-section">Вход и прочее</h2>
    <div className="an-grid">
      <Card title="Откуда начинают вход"><KeyTable counts={c} name="auth.login-start" labels={FROM_LABELS} keyLabel="Откуда"/>
        <p className="an-hint">Вошли: {number(total(c, 'auth.login'))} раз (сервер) · окно входа открыли {number(total(c, 'auth.login-start'))} · вышли {number(total(c, 'auth.logout'))}</p></Card>
      <Card title="«Прислать на ПК»" hint="с телефона"><KeyTable counts={c} name="pc.send" labels={FROM_LABELS} keyLabel="Откуда"/></Card>
    </div>
  </>;
}

export function FunnelsTab({ data }) {
  return <>
    <p className="an-hint">Воронки считаются по посетителям: дошедший до шага считается и на всех шагах до него. Сырые события хранятся 90 дней{data.funnelFrom > data.from ? ` — период обрезан: с ${dateOf(data.funnelFrom, { day: 'numeric', month: 'long' })}` : ''}.
      «Поставил» — установщик PowerShell сообщил об успехе для файла или команды этого посетителя.</p>
    <div className="an-grid">{data.funnels.map((funnel) => <Card key={funnel.id} wide title={funnel.title} table={<FunnelTable funnel={funnel}/>}>
      <div className="an-funnel-row"><Funnel steps={funnel.steps}/>
        <div className="an-funnel-devices"><h4>По устройствам</h4><FunnelTable funnel={funnel} compact/></div></div>
    </Card>)}</div>
  </>;
}
function FunnelTable({ funnel, compact }) {
  const devices = ['desktop', 'phone', 'tablet'].filter((d) => funnel.byDevice[d][0]?.visitors);
  const columns = [{ key: 'label', label: 'Шаг' }, ...(compact ? [] : [{ key: 'visitors', label: 'Всего', num: true }, { key: 'ofFirst', label: 'От первого', num: true, format: (n) => percent(n, 1) }, { key: 'ofPrevious', label: 'Конверсия шага', num: true, format: (n) => percent(n, 1) }, { key: 'dropped', label: 'Ушли', num: true }]),
    ...devices.map((d) => ({ key: d, label: DEVICE_LABELS[d], num: true, format: (v) => v }))];
  const rows = funnel.steps.map((step, i) => ({ ...step, key: step.id, ...Object.fromEntries(devices.map((d) => { const s = funnel.byDevice[d][i]; return [d, `${number(s.visitors)} · ${percent(s.ofFirst, 1)}`]; })) }));
  return <Table name={`funnel-${funnel.id}`} columns={columns} rows={rows} sortable={false} limit={10} empty="Нет данных"/>;
}
