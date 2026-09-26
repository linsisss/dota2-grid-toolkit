import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StudioPortal } from './StudioPortal.jsx';
import D from '../scripts/data.mjs';
import C from '../scripts/core.mjs';
import { LayersPanel } from './LayersPanel.jsx';
import { GridFilePanel } from './GridFilePanel.jsx';
import { DrawingDialog } from './DrawingDialog.jsx';
import { ReferencePanel } from './ReferencePanel.jsx';
import { RecentSymbols, CategoryWarning, CanvasSizeFields } from './SymbolControls.jsx';

import { AsciiLibrary } from './AsciiLibrary.jsx';
import { CanvasContextMenu, DockLabels, Tooltips } from './EditorActions.jsx';

const attributes = [
  ['any', 'Все герои'],
  ['str', 'Сила'],
  ['agi', 'Ловкость'],
  ['int', 'Интеллект'],
  ['all', 'Универсальные']
];
const knownHeroes = new Set(D.heroes.map((hero) => hero.id));
const attributeIcons = { str: 'strength', agi: 'agility', int: 'intelligence', all: 'universal' };
function AttributeIcon({ attribute }) {
  return (
    <img
      className="attribute-icon"
      src={`assets/attributes/${attributeIcons[attribute]}.png`}
      alt=""
      width="22"
      height="22"
    />
  );
}
function Plus() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ProjectPanel({ editor, state }) {
  return (
    <div className="project-panel">
      <div className="project-overview">
        <span className="eyebrow">СЕТКА</span>
        <div>
          <strong>{state.groups}</strong>
          <span>групп</span>
          <i />
          <strong>{state.heroes}</strong>
          <span>героев</span>
        </div>
      </div>
      <button className="create-group-card" onClick={editor.addGroup}>
        <span className="create-group-icon">
          <Plus />
        </span>
        <strong>Новая группа</strong>
        <span>Герои и название</span>
        <span className="card-arrow">↗</span>
      </button>
      <div className="canvas-guide">
        <p>
          Нажми <b>+</b> на группе, чтобы выбрать героев.
        </p>
      </div>
      <div className="project-templates">
        <span className="eyebrow">ШАБЛОНЫ</span>
        <button onClick={editor.templateRoles}>
          <span className="template-icon">▥</span>
          <span>
            <strong>По ролям</strong>
            <small>Пять групп по позициям</small>
          </span>
          <span>↗</span>
        </button>
        <button onClick={editor.templateMinimal}>
          <span className="template-icon">▦</span>
          <span>
            <strong>Мой пул</strong>
            <small>Две группы героев</small>
          </span>
          <span>↗</span>
        </button>
        <button onClick={editor.quickImage}>
          <span className="template-icon">✦</span>
          <span>
            <strong>Из изображения</strong>
            <small>Конвертация в ASCII</small>
          </span>
          <span>↗</span>
        </button>
      </div>
      <div className="project-note">
        <kbd>Shift</kbd>
        <span>
          Сохраняет пропорции
          <br />
          при изменении размера
        </span>
      </div>
    </div>
  );
}

function GroupControl({ editor, state }) {
  const group = state.group;
  if (!group || state.preview || state.tool !== 'select') return null;
  const first = C.heroLayout(group),
    empty = !first;
  const last = group.heroIds.length - 1;
  const left =
    (group.x + (empty ? 8 : first.left + (last % first.cols) * first.stepX + first.cardW)) *
      state.zoom +
    (empty ? 0 : 10);
  const top =
    (group.y +
      (empty ? 28 : first.top + Math.floor(last / first.cols) * first.stepY + first.cardH / 2)) *
    state.zoom;
  return (
    <>
      <button
        key={group.id}
        className={`group-add ${empty ? 'empty' : ''}`}
        aria-label={`Выбрать героев: ${group.name}`}
        title="Выбрать героев (/)"
        style={{ left, top }}
        onClick={() => editor.openHeroPicker(group.id)}
      >
        <Plus />
        {empty && <span>Добавить</span>}
      </button>
      {state.resizing && (
        <div
          className={`resize-hint ${state.proportional ? 'locked' : ''}`}
          style={{
            left: (group.x + group.w / 2) * state.zoom,
            top: (group.y + C.visualHeight(group)) * state.zoom + 15
          }}
        >
          <kbd>Shift</kbd>
          {state.proportional ? 'Пропорции сохранены' : 'Сохранить пропорции'}
        </div>
      )}
    </>
  );
}

function RotationControl({ editor, state }) {
  const frame = state.rotationFrame;
  if (!frame || state.preview || state.tool !== 'select') return null;
  const anchor = C.rotatePoint(
    { x: frame.x + frame.w + 18 / state.zoom, y: frame.y - 18 / state.zoom },
    C.frameCenter(frame),
    frame.rotation
  );
  const left = anchor.x * state.zoom,
    top = anchor.y * state.zoom;
  const angle = Math.round(C.normalizeAngle(frame.rotation) * 10) / 10;
  return (
    <>
      <button
        className="rotation-handle"
        aria-label="Повернуть выделение"
        title="Тяни для поворота · Shift — шаг 15° · ← → — 1°"
        style={{ left, top }}
        onPointerDown={editor.startRotation}
        onKeyDown={(event) => {
          const delta = { ArrowLeft: -1, ArrowRight: 1, Enter: 1, ' ': 1 }[event.key];
          if (delta === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          editor.rotateSelection(delta * (event.shiftKey ? 15 : 1));
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 15a7 7 0 1 1 11 3M4 9l1 6 6-1" />
        </svg>
      </button>
      {state.rotating && (
        <output
          className={`rotation-angle ${state.rotationSnapped ? 'snapped' : ''}`}
          aria-label="Угол поворота"
          style={{ left, top: top + 23 }}
        >
          {angle}°<span>{state.rotationSnapped ? 'Шаг 15°' : 'Shift — шаг 15°'}</span>
        </output>
      )}
    </>
  );
}

function HeroPicker({ editor, group }) {
  const dialog = useRef(null),
    search = useRef(null),
    grid = useRef(null),
    closeTimer = useRef(null);
  const [query, setQuery] = useState(''),
    [attribute, setAttribute] = useState('any'),
    [closing, setClosing] = useState(false);
  const chosen = new Set(group.heroIds);
  const normalized = query.trim().toLowerCase();
  const heroes = D.heroes.filter(
    (hero) =>
      (attribute === 'any' || hero.attr === attribute) &&
      (hero.name.toLowerCase().includes(normalized) || String(hero.id) === normalized)
  );
  useLayoutEffect(() => {
    const trigger = document.activeElement,
      node = dialog.current;
    node.showModal();
    search.current.focus({ preventScroll: true });
    return () => {
      clearTimeout(closeTimer.current);
      node.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    grid.current.scrollTop = 0;
  }, [attribute, query]);
  function close() {
    if (closing) return;
    setClosing(true);
    closeTimer.current = setTimeout(
      editor.closeHeroPicker,
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150
    );
  }
  return (
    <dialog
      ref={dialog}
      className={`hero-picker ${closing ? 'leaving' : ''}`}
      aria-labelledby="heroPickerTitle"
      aria-describedby="heroPickerDescription"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) {
          const b = dialog.current.getBoundingClientRect();
          if (
            event.clientX < b.left ||
            event.clientX > b.right ||
            event.clientY < b.top ||
            event.clientY > b.bottom
          )
            close();
        }
      }}
    >
      <div className="picker-heading">
        <div>
          <span className="eyebrow">ГЕРОИ</span>
          <h2 id="heroPickerTitle">Выбор героев</h2>
          <p id="heroPickerDescription">
            Группа <strong>{group.name}</strong> · нажми на героя, чтобы добавить или убрать
          </p>
        </div>
        <button className="picker-close" aria-label="Закрыть выбор героев" onClick={close}>
          ×
        </button>
      </div>
      <div className="picker-search">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <input
          ref={search}
          type="search"
          aria-label="Поиск героев"
          placeholder="Имя героя или ID…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <kbd>Esc</kbd>
      </div>
      <div className="picker-filters" role="group" aria-label="Атрибут героя">
        {attributes.map(([key, label]) => (
          <button
            key={key}
            aria-pressed={attribute === key}
            className={attribute === key ? 'active' : ''}
            onClick={() => setAttribute(key)}
          >
            {key !== 'any' && <AttributeIcon attribute={key} />}
            {label}
          </button>
        ))}
      </div>
      <div className="picker-results-heading">
        <span>{normalized ? 'РЕЗУЛЬТАТЫ ПОИСКА' : 'ГЕРОИ DOTA 2'}</span>
        <span>{heroes.length} найдено</span>
        <button
          className="button secondary compact"
          disabled={!heroes.length || heroes.every((hero) => chosen.has(hero.id))}
          onClick={() => editor.selectAllHeroes(heroes.map((hero) => hero.id))}
        >
          Выбрать всех героев
        </button>
      </div>
      <div ref={grid} className="picker-grid" tabIndex="0" aria-label="Герои по выбранному фильтру">
        {heroes.map((hero) => (
          <button
            key={hero.id}
            className={`picker-hero ${chosen.has(hero.id) ? 'chosen' : ''}`}
            aria-label={hero.name}
            aria-pressed={chosen.has(hero.id)}
            onClick={() => editor.toggleHero(hero.id)}
          >
            <div className="picker-portrait">
              <img
                src={`assets/heroes/${hero.id}.png`}
                alt=""
                loading="lazy"
                width="256"
                height="144"
              />
              <span className="picker-check">{chosen.has(hero.id) ? '✓' : '+'}</span>
            </div>
            <span className="picker-name">
              <AttributeIcon attribute={hero.attr} />
              {hero.name}
            </span>
          </button>
        ))}
        {!heroes.length && (
          <div className="picker-empty">
            <span>⌕</span>
            <strong>Герой не найден</strong>
            <p>Попробуй другое имя или выбери все атрибуты.</p>
            <button
              className="button secondary"
              onClick={() => {
                setQuery('');
                setAttribute('any');
                search.current.focus();
              }}
            >
              Сбросить фильтры
            </button>
          </div>
        )}
      </div>
      <div className="picker-footer">
        <div className="picked-summary">
          <div className="picked-portraits">
            {group.heroIds
              .filter((id) => knownHeroes.has(id))
              .slice(-5)
              .map((id) => (
                <img key={id} src={`assets/heroes/${id}.png`} alt="" />
              ))}
          </div>
          <span role="status" aria-live="polite">
            В группе: <strong>{group.heroIds.length}</strong>
          </span>
        </div>
        <button className="button primary picker-done" onClick={close}>
          Готово <span>↵</span>
        </button>
      </div>
    </dialog>
  );
}

export function StudioControls({ editor }) {
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot);
  const [panel, setPanel] = useState(null);
  const panelTrigger = useRef(null);
  const panelMode = useRef(null);
  const closeLibrary = () => {
    setPanel(null);
    panelTrigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    const openModeSettings = (event) => {
      if (event.target.closest('#dockAddGroup')) {
        setPanel(null);
        return;
      }
      const trigger = event.target.closest('[data-mode]');
      if (trigger) {
        panelTrigger.current = trigger;
        const sameMode = panelMode.current === trigger.dataset.mode;
        panelMode.current = trigger.dataset.mode;
        setPanel((current) => (current === 'library' && sameMode ? null : 'library'));
        if (window.matchMedia('(max-width: 900px)').matches) editor.closeSettings();
      }
    };
    document.addEventListener('click', openModeSettings);
    return () => document.removeEventListener('click', openModeSettings);
  }, [editor]);
  useEffect(() => {
    if (!state.focused && window.matchMedia('(max-width: 900px)').matches) {
      setPanel(null);
      document.querySelector('#inspectorDismiss button')?.focus({ preventScroll: true });
    }
  }, [state.focused]);
  useEffect(() => {
    const closeSettingsOnEscape = (event) => {
      if (
        event.key === 'Escape' &&
        !panel &&
        !state.focused &&
        !document.querySelector('dialog[open]')
      ) {
        editor.closeSettings();
        document.getElementById('focusButton').focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', closeSettingsOnEscape);
    return () => document.removeEventListener('keydown', closeSettingsOnEscape);
  }, [editor, panel, state.focused]);
  useEffect(() => {
    document.body.classList.toggle('show-library', panel === 'library');
    const library = document.getElementById('libraryPanel');
    library.inert = panel !== 'library';
    if (panel) {
      panelTrigger.current = document.activeElement;
      const target = document.getElementById('libraryDismiss');
      target.querySelector('button')?.focus({ preventScroll: true });
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && panel && !document.querySelector('dialog[open]')) {
        setPanel(null);
        panelTrigger.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.classList.remove('show-library');
      library.inert = false;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [panel]);
  return (
    <>
      <StudioPortal targetId="libraryTitle">
        {state.mode === 'draw' ? 'Рисование' : state.mode === 'image' ? 'ASCII' : 'Сетка героев'}
      </StudioPortal>
      <StudioPortal targetId="gridFilePanel">
        <GridFilePanel editor={editor} state={state} />
      </StudioPortal>
      <StudioPortal targetId="canvasTopTools">
        <CategoryWarning count={state.categories} />
        <RecentSymbols symbols={state.recentSymbols} onPick={editor.useBrushSymbol} />
        {(state.canvas.w !== C.WIDTH || state.canvas.h !== C.HEIGHT) && (
          <p className="canvas-size-note canvas-size-persistent">
            При изменении размеров холста в Доте появятся ползунки.
            {(state.canvas.w > C.WIDTH || state.canvas.h > C.HEIGHT) && (
              <span className="default-area-legend">Пунктир — стандартная область 1193 × 593</span>
            )}
          </p>
        )}
      </StudioPortal>
      <StudioPortal targetId="canvasDimensions">
        <CanvasSizeFields size={state.canvas} onApply={editor.resizeCanvas} />
      </StudioPortal>
      <StudioPortal targetId="asciiLibrary">
        <AsciiLibrary editor={editor} canvas={state.canvas} />
      </StudioPortal>
      <CanvasContextMenu editor={editor} state={state} />
      <StudioPortal targetId="dockLabels">
        <DockLabels />
      </StudioPortal>
      <Tooltips />
      <StudioPortal targetId="layerList">
        <LayersPanel editor={editor} layers={state.layers} />
      </StudioPortal>
      <StudioPortal targetId="libraryDismiss">
        <button className="panel-dismiss" onClick={closeLibrary}>
          Закрыть ×
        </button>
      </StudioPortal>
      <StudioPortal targetId="inspectorDismiss">
        <button
          className="panel-dismiss"
          onClick={() => {
            editor.closeSettings();
            document.getElementById('focusButton').focus();
          }}
        >
          Закрыть ×
        </button>
      </StudioPortal>
      <StudioPortal targetId="projectPanel">
        <ProjectPanel editor={editor} state={state} />
      </StudioPortal>
      <StudioPortal targetId="referencePanel">
        <ReferencePanel
          key={`${state.fileName}:${state.configIndex}`}
          value={state.reference}
          canvasSize={state.canvas}
          onChange={editor.setReference}
        />
      </StudioPortal>
      <StudioPortal targetId="canvasNotices">
        {state.overflow.count > 0 ? (
          <div className="canvas-warning" role="status">
            <span>
              За границами {state.canvas.w} × {state.canvas.h}:{' '}
              <strong>{state.overflow.count} символов</strong>
            </span>
            <button
              onClick={editor.cropOverflow}
              disabled={!state.overflow.editable}
              title={
                state.overflow.editable
                  ? 'Удалить символы, которые выходят за границы'
                  : 'Разблокируй слой для обрезки'
              }
            >
              Обрезать
            </button>
          </div>
        ) : null}
      </StudioPortal>
      <StudioPortal targetId="canvasReactOverlay">
        <>
          <GroupControl editor={editor} state={state} />
          <RotationControl editor={editor} state={state} />
        </>
      </StudioPortal>
      <StudioPortal targetId="symbolCounter">
        <>
          <span className="symbol-count-icon" aria-hidden="true">
            Aa
          </span>
          <span title="Символы рисунка и текста во всех слоях. Пробелы, переносы строк и названия групп не учитываются.">
            Символов{' '}
            <strong key={state.symbols} className="count-update">
              {state.symbols.toLocaleString('ru-RU')}
            </strong>
          </span>
          <span className="category-counter">
            Категорий <strong>{state.categories.toLocaleString('ru-RU')}</strong>
          </span>
        </>
      </StudioPortal>
      {state.picker && <HeroPicker key={state.picker.id} editor={editor} group={state.picker} />}
      {state.drawingOpen && (
        <DrawingDialog
          editor={editor}
          reference={state.reference}
          canvasSize={state.canvas}
          recentSymbols={state.recentSymbols}
        />
      )}
    </>
  );
}
