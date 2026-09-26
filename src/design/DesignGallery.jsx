import { useEffect, useState } from 'react';
import D from '../../scripts/data.mjs';
import currentEditor from '../../assets/design/editor-current.png';
import linsissya from '../../assets/design/linsissya.png';
import dissonance from '../../assets/design/dissonance.png';

const DIRECTIONS = [
  {
    id: 'ancient',
    name: 'Ancient',
    detail: 'Тёплый, игровой, с характером Dota.',
    color: '#c5a470'
  },
  {
    id: 'canvas',
    name: 'Canvas',
    detail: 'Светлая студия. Больше воздуха и ясности.',
    color: '#5367d4'
  },
  {
    id: 'focus',
    name: 'Focus',
    detail: 'Тёмный редактор. Всё внимание — работе.',
    color: '#bda8e6'
  },
  {
    id: 'play',
    name: 'Play',
    detail: 'Выразительный цвет и свободная композиция.',
    color: '#b59be9'
  },
  { id: 'atlas', name: 'Atlas', detail: 'Тактическая схема. Точная и спокойная.', color: '#45816e' }
];
const DESCRIPTION =
  'Grid Studio — сайт, на котором вы можете создать свою сетку героев используя встроенные инструменты и своё воображение.';
const HEROES = new Map(D.heroes.map((h) => [h.id, h]));
const INITIAL_GROUPS = [
  { name: 'Мой мид', ids: [25, 13, 74, 106, 11], x: 100, y: 118 },
  { name: 'Керри', ids: [1, 8, 44, 10, 67], x: 682, y: 118 },
  { name: 'Поддержка', ids: [5, 86, 26, 20, 9], x: 100, y: 355 },
  { name: 'По настроению', ids: [14, 129, 113, 22, 123], x: 682, y: 355 }
];
const TOOLS = [
  ['cursor', 'Выделение'],
  ['hand', 'Перемещение'],
  ['pen', 'Перо'],
  ['text', 'Текст'],
  ['pipette', 'Взять символ'],
  ['image', 'Изображение'],
  ['box', 'Фигура']
];
const SYMBOLS = ['★', '·', '♡', '@', '◆', 'あ', '+', '✪'];

function Icon({ name, size = 20, ...props }) {
  const paths = {
    cursor: <path d="m5 3 14 10-7 1-3 7L5 3Z" />,
    hand: (
      <>
        <path d="M8 11V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v10c0 4-3 7-7 7-3 0-5-2-7-5l-3-5a2 2 0 0 1 3-2l2 3" />
      </>
    ),
    pen: (
      <>
        <path d="m4 20 1-6L16 3l5 5-11 11-6 1ZM13 6l5 5" />
      </>
    ),
    text: <path d="M4 6V3h16v3M12 3v18m-4 0h8" />,
    pipette: (
      <>
        <path d="m14 3 7 7m-5-5 3-3M5 20l-2 1 1-4L15 6l3 3L7 20H5Z" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8" cy="8" r="1.5" />
        <path d="m3 17 6-6 4 4 3-3 5 5" />
      </>
    ),
    box: <rect x="4" y="4" width="16" height="16" rx="1" />,
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 10 5-10 5L2 8l10-5Zm-9 10 9 5 9-5M3 18l9 5 9-5" />
      </>
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
    down: <path d="m5 9 7 7 7-7" />,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V3M7 8l5-5 5 5M4 16v5h16v-5" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    undo: (
      <>
        <path d="m8 4-5 5 5 5M3 9h11c8 0 8 12 0 12" />
      </>
    ),
    redo: (
      <>
        <path d="m16 4 5 5-5 5m5-5H10C2 9 2 21 10 21" />
      </>
    ),
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    link: (
      <>
        <path d="M14 3h7v7m0-7L10 14M10 4H4v16h16v-6" />
      </>
    ),
    check: <path d="m4 12 5 5L20 6" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    heart: <path d="M20 5c-3-3-7-1-8 1-1-2-5-4-8-1-5 5 2 10 8 15 6-5 13-10 8-15Z" />,
    search: (
      <>
        <circle cx="10" cy="10" r="7" />
        <path d="m15 15 6 6" />
      </>
    ),
    align: <path d="M3 3v18M7 6h14M7 12h9M7 18h14" />,
    home: (
      <>
        <path d="m3 10 9-7 9 7v11H3V10Z" />
        <path d="M9 21v-8h6v8" />
      </>
    ),
    close: <path d="m5 5 14 14M19 5 5 19" />
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.grid}
    </svg>
  );
}
function Mark() {
  return (
    <svg
      className="brand-mark"
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
    >
      <path d="M3 3h8v8H3zm14 0h8v8h-8zM3 17h8v8H3z" fill="currentColor" />
      <path d="m17 17 8 8m0-8-8 8" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}
function Brand({ onClick }) {
  return (
    <button className="brand" onClick={onClick} aria-label="GridStudio — лендинг">
      <Mark />
      <span>GridStudio</span>
    </button>
  );
}
function Authors() {
  return (
    <div className="authors">
      <span>
        Сделано с <span className="real-heart">❤️</span>
      </span>
      <div className="author-links">
        <a href="tg://resolve?domain=linsissya" className="author">
          <img src={linsissya} alt="" width="26" height="26" />
          <span>@linsissya</span>
        </a>
        <span className="author-and">&</span>
        <a href="tg://resolve?domain=dissonance" className="author">
          <img src={dissonance} alt="" width="26" height="26" />
          <span>@dissonance</span>
        </a>
      </div>
    </div>
  );
}
function SiteNav({ goEditor, notify }) {
  return (
    <header className="site-nav">
      <Brand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
      <nav aria-label="Навигация GridStudio">
        <button onClick={goEditor}>Редактор сетки</button>
        <button onClick={() => notify('Каталог пользовательских сеток появится позже.')}>
          Каталог <span className="soon">Скоро</span>
        </button>
      </nav>
      <span className="site-domain">gridstudio.me</span>
    </header>
  );
}
function Landing({ direction, goEditor, notify }) {
  return (
    <article
      className={`concept landing theme-${direction.id}`}
      aria-label={`Лендинг ${direction.name}`}
    >
      <SiteNav goEditor={goEditor} notify={notify} />
      <main className="land-body">
        {direction.id === 'play' && (
          <h1 className="play-title">
            GridStudio<span className="title-dot">✳</span>
          </h1>
        )}
        <figure className="editor-proof">
          <div className="proof-decoration" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <button
            className="proof-image"
            onClick={goEditor}
            aria-label="Посмотреть концепт редактора"
          >
            <img
              src={currentEditor}
              alt="Скриншот актуального редактора GridStudio: группы героев, холст, инструменты и свойства"
              width="1280"
              height="720"
              fetchPriority="high"
            />
          </button>
          <figcaption>
            <span>Редактор сетки героев</span>
            <button onClick={goEditor}>
              Посмотреть <Icon name="expand" size={14} />
            </button>
          </figcaption>
          {direction.id === 'play' && (
            <span className="play-sticker" aria-hidden="true">
              Твой пул.
              <br />
              Твои правила.
            </span>
          )}
          {direction.id === 'atlas' && (
            <div className="proof-coordinates" aria-hidden="true">
              <span>1193 px</span>
              <span>593 px</span>
            </div>
          )}
        </figure>
        <section className="land-copy">
          {direction.id !== 'play' && (
            <h1>
              {direction.id === 'ancient' ? (
                <>
                  Grid<span>Studio</span>
                </>
              ) : (
                'GridStudio'
              )}
            </h1>
          )}
          <p className="land-description">{DESCRIPTION}</p>
          <Authors />
          <div className="land-actions">
            <button className="primary-action" onClick={goEditor}>
              Создать свою сетку <Icon name="arrow" size={18} />
            </button>
            <button
              className="secondary-action"
              onClick={() =>
                notify(
                  'Каталог пользовательских сеток появится позже. Сейчас можно создать свою сетку в редакторе.'
                )
              }
            >
              Каталог пользовательских сеток <Icon name="grid" size={17} />
            </button>
          </div>
        </section>
      </main>
      <footer className="land-footer">
        <span>Кастомизация Dota 2</span>
        <div className="footer-symbols" aria-hidden="true">
          . · : + * # % @
        </div>
        <a href="https://github.com/linsisss/dota2-grid-toolkit" target="_blank" rel="noreferrer">
          Исходный репозиторий <Icon name="link" size={13} />
        </a>
      </footer>
    </article>
  );
}

function ToolButton({ name, label, active, onClick }) {
  return (
    <button
      className={`tool-button ${active ? 'active' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon name={name} />
    </button>
  );
}
function GroupList({ groups, selected, onSelect }) {
  return (
    <div className="mock-groups">
      {groups.map((group, i) => (
        <button key={i} className={selected === i ? 'selected' : ''} onClick={() => onSelect(i)}>
          <Icon name="grid" size={16} />
          <span>{group.name}</span>
          <small>{group.ids.length}</small>
          <Icon name="eye" size={14} />
        </button>
      ))}
    </div>
  );
}
function HeroGrid({ groups, selected, onSelect, showGrid, preview, zoom, addHero }) {
  return (
    <svg
      className={`mock-grid ${showGrid ? 'with-grid' : ''}`}
      viewBox="0 0 1193 593"
      aria-label="Демонстрационная сетка героев"
      style={{ transform: `scale(${zoom / 100})` }}
    >
      <defs>
        <pattern id="canvas-dots" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".75" fill="currentColor" opacity=".13" />
        </pattern>
      </defs>
      <rect width="1193" height="593" fill="var(--board)" />
      {showGrid && <rect width="1193" height="593" fill="url(#canvas-dots)" />}
      <text x="596.5" y="53" textAnchor="middle" className="grid-heading">
        МОЯ СЕТКА ГЕРОЕВ
      </text>
      {groups.map((group, index) => {
        const width = group.ids.length * 61 - 8;
        return (
          <g
            key={index}
            className="hero-group"
            role="button"
            tabIndex="0"
            aria-label={`Выбрать группу ${group.name}`}
            onClick={() => onSelect(index)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(index);
              }
            }}
          >
            <text x={group.x} y={group.y - 23} className="hero-group-label">
              {group.name.toUpperCase()}
            </text>
            {group.ids.map((id, j) => (
              <image
                key={`${id}-${j}`}
                href={HEROES.get(id)?.portrait}
                x={group.x + j * 61}
                y={group.y}
                width="53"
                height="91"
                preserveAspectRatio="xMidYMid slice"
              />
            ))}
            <rect
              x={group.x - 8}
              y={group.y - 46}
              width={width + 16}
              height="145"
              fill="transparent"
              stroke={selected === index && !preview ? 'var(--accent)' : 'transparent'}
              strokeWidth="1.5"
            />
            {selected === index && !preview && (
              <>
                {[
                  [group.x - 8, group.y - 46],
                  [group.x + width + 8, group.y - 46],
                  [group.x - 8, group.y + 99],
                  [group.x + width + 8, group.y + 99]
                ].map(([x, y], k) => (
                  <rect
                    key={k}
                    x={x - 3}
                    y={y - 3}
                    width="6"
                    height="6"
                    fill="var(--surface)"
                    stroke="var(--accent)"
                  />
                ))}
                <g
                  role="button"
                  tabIndex="0"
                  aria-label="Добавить героя в выбранную группу"
                  onClick={(e) => {
                    e.stopPropagation();
                    addHero();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      addHero();
                    }
                  }}
                >
                  <circle cx={group.x + width + 33} cy={group.y + 45} r="14" fill="var(--accent)" />
                  <path
                    d={`M${group.x + width + 27} ${group.y + 45}h12m-6-6v12`}
                    stroke="var(--accent-ink)"
                    strokeWidth="1.5"
                  />
                </g>
              </>
            )}
          </g>
        );
      })}
      <text x="596.5" y="558" textAnchor="middle" className="grid-ornament">
        · · · ◆ · · ·
      </text>
    </svg>
  );
}
function Editor({ direction, goLanding, notify }) {
  const [groups, setGroups] = useState(INITIAL_GROUPS.map((g) => ({ ...g, ids: [...g.ids] }))),
    [selected, setSelected] = useState(0),
    [tool, setTool] = useState('cursor'),
    [symbol, setSymbol] = useState('★'),
    [zoom, setZoom] = useState(100),
    [showGrid, setShowGrid] = useState(true),
    [preview, setPreview] = useState(false),
    [past, setPast] = useState([]),
    [future, setFuture] = useState([]);
  const current = groups[selected];
  const updateGroups = (next) => {
    setPast([...past, groups]);
    setGroups(next);
    setFuture([]);
  };
  const addHero = () => {
    const next = groups.map((g) => ({ ...g, ids: [...g.ids] }));
    if (next[selected].ids.length >= 7) {
      notify('В этой демонстрационной группе уже 7 героев.');
      return;
    }
    const id = [35, 22, 50, 31, 68].find((id) => !next[selected].ids.includes(id));
    next[selected].ids.push(id);
    updateGroups(next);
  };
  const download = () => {
    const categories = groups.map((g) => ({
      category_name: g.name.toUpperCase(),
      x_position: g.x,
      y_position: g.y - 30,
      width: g.ids.length * 61,
      height: 110,
      hero_ids: g.ids
    }));
    const data = {
      version: 3,
      configs: [{ config_name: 'GridStudio — демонстрационная сетка', categories }]
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gridstudio-demo.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Демонстрационный JSON скачан.');
  };
  return (
    <article
      className={`concept editor theme-${direction.id}`}
      aria-label={`Редактор ${direction.name}`}
    >
      <header className="editor-head">
        <Brand onClick={goLanding} />
        <div className="document-name">
          <span className="doc-separator" />
          <Icon name="grid" size={17} />
          <span>Моя сетка героев</span>
          <Icon name="down" size={14} />
        </div>
        <div className="editor-head-actions">
          <span className="demo-state">Демо-проект</span>
          <a href="./index.html" target="_blank" rel="noreferrer" className="import-link">
            <Icon name="link" size={16} />
            <span>Открыть редактор</span>
          </a>
          <button className="primary-action compact" onClick={download}>
            <Icon name="download" size={16} />
            <span>Скачать JSON</span>
          </button>
        </div>
      </header>
      <div className="editor-modebar">
        <div className="editor-mode-tabs">
          {[
            ['grid', 'Сетка'],
            ['pen', 'Рисование'],
            ['image', 'ASCII']
          ].map(([id, label]) => (
            <button
              key={id}
              className={
                (id === 'grid' && tool === 'cursor') ||
                (id === 'pen' && tool === 'pen') ||
                (id === 'image' && tool === 'image')
                  ? 'active'
                  : ''
              }
              onClick={() => setTool(id === 'grid' ? 'cursor' : id)}
            >
              <Icon name={id} size={16} />
              {label}
            </button>
          ))}
        </div>
        <div className="inline-properties">
          <span>{current.name}</span>
          <span>
            X <b>{current.x}</b>
          </span>
          <span>
            Y <b>{current.y}</b>
          </span>
          <span>
            W <b>{current.ids.length * 61}</b>
          </span>
          <span>
            H <b>110</b>
          </span>
        </div>
        <span className="mode-help">Редактор сетки героев</span>
      </div>
      <div className="editor-body">
        <aside className="editor-library">
          <h2>Моя сетка</h2>
          <p className="panel-caption">Группы героев</p>
          <GroupList groups={groups} selected={selected} onSelect={setSelected} />
          <div className="library-tools">
            <p className="panel-caption">Инструменты</p>
            <div className="named-tools">
              {TOOLS.map(([id, label]) => (
                <button
                  key={id}
                  className={tool === id ? 'active' : ''}
                  onClick={() => setTool(id)}
                >
                  <Icon name={id} size={18} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="library-bottom">
            <Icon name="layers" />
            <span>
              4 группы
              <br />
              <small>{groups.reduce((sum, g) => sum + g.ids.length, 0)} героев на холсте</small>
            </span>
          </div>
        </aside>
        <section className="editor-workspace" aria-label="Рабочее пространство">
          <div className="workspace-toolbar">
            <div className="drawing-dock">
              {TOOLS.map(([id, label]) => (
                <ToolButton
                  key={id}
                  name={id}
                  label={label}
                  active={tool === id}
                  onClick={() => setTool(id)}
                />
              ))}
            </div>
            <div className="history-actions">
              <button
                className="tool-button"
                title="Отменить"
                aria-label="Отменить"
                disabled={!past.length}
                onClick={() => {
                  setFuture([groups, ...future]);
                  setGroups(past.at(-1));
                  setPast(past.slice(0, -1));
                }}
              >
                <Icon name="undo" size={18} />
              </button>
              <button
                className="tool-button"
                title="Повторить"
                aria-label="Повторить"
                disabled={!future.length}
                onClick={() => {
                  setPast([...past, groups]);
                  setGroups(future[0]);
                  setFuture(future.slice(1));
                }}
              >
                <Icon name="redo" size={18} />
              </button>
              <button
                className={`preview-toggle ${preview ? 'active' : ''}`}
                aria-pressed={preview}
                onClick={() => setPreview(!preview)}
              >
                <Icon name="eye" size={16} />
                <span>Превью</span>
              </button>
            </div>
          </div>
          <div className="mock-recent">
            <span>Недавние</span>
            {SYMBOLS.map((ch) => (
              <button
                key={ch}
                className={symbol === ch ? 'active' : ''}
                aria-label={`Взять символ ${ch}`}
                aria-pressed={symbol === ch}
                onClick={() => {
                  setSymbol(ch);
                  setTool('pen');
                }}
              >
                {ch}
              </button>
            ))}
            <span className="board-size">1193 × 593</span>
          </div>
          <div className="mock-canvas-wrap">
            <div className="canvas-project-caption">
              <span>Моя сетка героев</span>
              <span>{preview ? 'Превью' : 'Холст'}</span>
            </div>
            <HeroGrid
              groups={groups}
              selected={selected}
              onSelect={setSelected}
              showGrid={showGrid}
              preview={preview}
              zoom={zoom}
              addHero={addHero}
            />
          </div>
          <div className="editor-bottom">
            <span className="count-symbols">
              <span>Aa</span> Символов <b>14</b>
            </span>
            <label>
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              <span>Сетка</span>
            </label>
            <div className="zoom-control">
              <button
                aria-label="Уменьшить масштаб"
                onClick={() => setZoom(Math.max(50, zoom - 10))}
              >
                <Icon name="minus" size={15} />
              </button>
              <button aria-label="Сбросить масштаб" onClick={() => setZoom(100)}>
                {zoom}%
              </button>
              <button
                aria-label="Увеличить масштаб"
                onClick={() => setZoom(Math.min(140, zoom + 10))}
              >
                <Icon name="plus" size={15} />
              </button>
            </div>
          </div>
          <div className="group-filmstrip">
            <GroupList groups={groups} selected={selected} onSelect={setSelected} />
          </div>
        </section>
        <aside className="editor-inspector">
          <div className="inspector-title">
            <h2>Свойства</h2>
            <span>Группа</span>
          </div>
          <label className="mock-field">
            Название
            <input
              value={current.name}
              onChange={(e) => {
                const next = groups.map((g) => ({ ...g, ids: [...g.ids] }));
                next[selected].name = e.target.value;
                setGroups(next);
              }}
            />
          </label>
          <div className="mock-field-pair">
            <label className="mock-field">
              X
              <input
                type="number"
                value={current.x}
                min="0"
                max="950"
                onChange={(e) =>
                  setGroups(
                    groups.map((g, i) =>
                      i === selected
                        ? { ...g, x: Math.max(0, Math.min(950, Number(e.target.value))) }
                        : g
                    )
                  )
                }
              />
            </label>
            <label className="mock-field">
              Y
              <input
                type="number"
                value={current.y}
                min="40"
                max="480"
                onChange={(e) =>
                  setGroups(
                    groups.map((g, i) =>
                      i === selected
                        ? { ...g, y: Math.max(40, Math.min(480, Number(e.target.value))) }
                        : g
                    )
                  )
                }
              />
            </label>
          </div>
          <div className="mock-field-pair">
            <div className="readout">
              <span>Ширина</span>
              <strong>
                {current.ids.length * 61}
                <small>px</small>
              </strong>
            </div>
            <div className="readout">
              <span>Высота</span>
              <strong>
                110<small>px</small>
              </strong>
            </div>
          </div>
          <div className="inspector-divider" />
          <div className="inspector-subtitle">
            <h3>Герои в группе</h3>
            <span>{current.ids.length}</span>
          </div>
          <div className="selected-portraits">
            {current.ids.map((id, i) => (
              <img key={`${id}-${i}`} src={HEROES.get(id)?.portrait} alt={HEROES.get(id)?.name} />
            ))}
            <button aria-label="Добавить героя" onClick={addHero}>
              <Icon name="plus" size={17} />
            </button>
          </div>
          <button className="add-heroes" onClick={addHero}>
            <Icon name="plus" size={16} />
            Добавить героя
          </button>
          <div className="inspector-divider" />
          <div className="inspector-subtitle">
            <h3>Слои</h3>
            <Icon name="layers" size={16} />
          </div>
          <GroupList groups={groups} selected={selected} onSelect={setSelected} />
          <div className="inspector-tip">
            <kbd>Shift</kbd>
            <span>Сохранять пропорции</span>
          </div>
        </aside>
      </div>
      <footer className="editor-footer">
        <span>gridstudio.me</span>
        <span>{tool === 'pen' ? `Перо: ${symbol}` : TOOLS.find((t) => t[0] === tool)?.[1]}</span>
        <a href="https://github.com/linsisss/dota2-grid-toolkit" target="_blank" rel="noreferrer">
          Исходный репозиторий <Icon name="link" size={12} />
        </a>
      </footer>
    </article>
  );
}

function readRoute() {
  const [id, screen] = window.location.hash.slice(1).split('/');
  return {
    id: DIRECTIONS.some((d) => d.id === id) ? id : 'ancient',
    screen: screen === 'editor' ? 'editor' : 'landing'
  };
}
export default function DesignGallery() {
  const [route, setRoute] = useState(readRoute),
    [notice, setNotice] = useState('');
  useEffect(() => {
    const change = () => setRoute(readRoute());
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 4200);
    return () => clearTimeout(timeout);
  }, [notice]);
  const navigate = (id, screen) => {
    window.location.hash = `${id}/${screen}`;
    setNotice('');
  };
  const direction = DIRECTIONS.find((d) => d.id === route.id);
  return (
    <div className="design-gallery">
      <header className="gallery-bar">
        <div className="gallery-heading">
          <strong>
            GridStudio <span>/</span> Направления
          </strong>
          <span>Пять вариантов. Лендинг + редактор.</span>
        </div>
        <div className="direction-tabs" role="tablist" aria-label="Направление дизайна">
          {DIRECTIONS.map((d, i) => (
            <button
              key={d.id}
              role="tab"
              aria-selected={d.id === route.id}
              onClick={() => navigate(d.id, route.screen)}
            >
              <span className="direction-dot" style={{ background: d.color }} />
              <span>
                {i + 1}. {d.name}
              </span>
            </button>
          ))}
        </div>
        <div className="screen-tabs" role="tablist" aria-label="Экран">
          <button
            role="tab"
            aria-selected={route.screen === 'landing'}
            onClick={() => navigate(route.id, 'landing')}
          >
            Лендинг
          </button>
          <button
            role="tab"
            aria-selected={route.screen === 'editor'}
            onClick={() => navigate(route.id, 'editor')}
          >
            Редактор
          </button>
        </div>
      </header>
      <div className="gallery-caption">
        <span>
          <b>{DIRECTIONS.findIndex((d) => d.id === route.id) + 1} / 5</b>
          {direction.detail}
        </span>
        <span className="prototype-note">
          {route.screen === 'landing'
            ? 'Концепт главной страницы'
            : 'Визуальный прототип редактора'}
        </span>
      </div>
      <div className="design-stage" key={`${route.id}-${route.screen}`}>
        {route.screen === 'landing' ? (
          <Landing
            direction={direction}
            goEditor={() => navigate(route.id, 'editor')}
            notify={setNotice}
          />
        ) : (
          <Editor
            direction={direction}
            goLanding={() => navigate(route.id, 'landing')}
            notify={setNotice}
          />
        )}
      </div>
      {notice && (
        <div className="design-notice" role="status">
          <span>{notice}</span>
          <button aria-label="Закрыть уведомление" onClick={() => setNotice('')}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
