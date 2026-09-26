import { memo } from 'react';
import { NumberInput } from './NumberInput.jsx';
import { ImageImportDialog } from './ImageImportDialog.jsx';
// Stable shell: the editor exclusively owns the canvas and empty imperative hosts.
export const StudioLayout = memo(function StudioLayout() {
  return (
    <>
      <header className="app-header">
        <a className="brand" href="index.html" aria-label="Grid Studio, главная">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32">
              <path d="m5 4 23 24M5 18v10h10M18 4h10v10" />
            </svg>
          </span>
          <span>
            GRID<span className="brand-light">STUDIO</span>
            <small>DOTA 2 TOOLKIT</small>
          </span>
        </a>
        <div className="header-divider"></div>
        <div className="project-heading">
          <button id="renameProject" className="project-name" title="Переименовать сетку">
            <span id="projectName">Сетка по ролям</span>
            <span data-icon="chevron" className="small-icon"></span>
          </button>
        </div>
        <span id="saveState" className="save-state">
          <span className="status-dot"></span>Сохранено на устройстве
        </span>
        <div className="header-actions">
          <button
            id="newProject"
            className="button ghost"
            title="Новая сетка в этом файле"
            aria-label="Новая сетка"
          >
            <span data-icon="plus"></span>
          </button>
          <button id="importButton" className="button secondary" aria-label="Загрузить JSON">
            <span data-icon="import"></span>
            <span>Загрузить JSON</span>
          </button>
          <button id="exportButton" className="button primary">
            <span data-icon="export"></span>
            <span>Скачать JSON</span>
          </button>
        </div>
      </header>

      <nav className="studio-navigation" aria-label="Рабочее пространство">
        <div className="mode-tabs" role="tablist" aria-label="Режим редактора">
          <button
            role="tab"
            id="tab-heroes"
            aria-controls="panel-heroes"
            aria-selected="true"
            data-mode="heroes"
          >
            <span data-icon="heroes"></span>Сетка
          </button>
          <button
            role="tab"
            id="tab-draw"
            aria-controls="panel-draw"
            aria-selected="false"
            tabIndex="-1"
            data-mode="draw"
          >
            <span data-icon="pen"></span>Рисование
          </button>
          <button
            role="tab"
            id="tab-image"
            aria-controls="panel-image"
            aria-selected="false"
            tabIndex="-1"
            data-mode="image"
          >
            <span data-icon="image"></span>ASCII
          </button>
        </div>
        <div id="gridFilePanel" />
        <button
          id="focusButton"
          className="button secondary settings-toggle"
          aria-controls="propertiesPanel"
          aria-expanded="false"
          title="Показать настройки (F)"
        >
          <span data-icon="sliders" />
          <span>Настройки</span>
        </button>
        <button
          id="helpButton"
          className="icon-button help-button"
          aria-label="Помощь и горячие клавиши"
          title="Помощь и горячие клавиши (?)"
        >
          <span data-icon="help"></span>
        </button>
      </nav>

      <div className="app-layout">
        <aside id="libraryPanel" className="library-panel" aria-label="Библиотека и инструменты">
          <div id="libraryDismiss" />
          <div className="panel-intro">
            <h1 id="libraryTitle" />
          </div>
          <section
            id="panel-heroes"
            role="tabpanel"
            aria-labelledby="tab-heroes"
            className="mode-panel"
          >
            <div id="projectPanel" />
          </section>
          <section
            id="panel-draw"
            role="tabpanel"
            aria-labelledby="tab-draw"
            className="mode-panel padded"
            hidden
          >
            <button id="openDrawing" className="button primary full drawing-window-button">
              <span data-icon="pen"></span>В отдельном окне
            </button>
            <button id="addAscii" className="button secondary full">
              <span data-icon="text"></span>Вставить ASCII-арт или текст
            </button>
            <div className="section-heading">
              <span>ИНСТРУМЕНТЫ</span>
              <span className="muted">B</span>
            </div>
            <div id="drawingTools" className="drawing-tools"></div>
            <div className="section-heading">
              <span>СИМВОЛЫ КИСТИ</span>
              <span id="brushPreview">★</span>
            </div>
            <select id="symbolCategory" aria-label="Категория символов"></select>
            <label className="check-row category-select-all">
              <input id="brushSelectAll" type="checkbox" />
              Выбрать все символы
            </label>
            <div id="symbolLibrary" className="symbol-library"></div>
            <label className="field-label" htmlFor="brushInput">
              Свой символ или набор
            </label>
            <input id="brushInput" type="text" defaultValue="★" maxLength="1000" />
            <button id="clearBrush" className="button ghost compact">
              Очистить набор
            </button>
            <label className="field-label" htmlFor="brushOrder">
              Порядок символов
            </label>
            <select id="brushOrder">
              <option value="sequence">Чередовать</option>
              <option value="random">Случайно</option>
              <option value="gradient">Плавный переход</option>
            </select>
            <label id="brushGradientField" className="field-label" hidden>
              Длина градиента, px
              <NumberInput
                id="brushGradientLength"
                aria-label="Длина градиента"
                type="number"
                min="10"
                max="6000"
                defaultValue="350"
              />
            </label>
            <label className="range-label" htmlFor="brushStep">
              Шаг кисти <output id="brushStepValue">16 px</output>
            </label>
            <input id="brushStep" type="range" min="5" max="40" defaultValue="16" />
            <label className="field-label" htmlFor="brushDynamics">
              Динамика кисти
            </label>
            <select id="brushDynamics">
              <option value="constant">Постоянная плотность</option>
              <option value="denser">От редкого к плотному</option>
              <option value="sparser">От плотного к редкому</option>
            </select>
            <div id="brushDynamicsFields" className="field-pair" hidden>
              <label>
                Конечный шаг, px
                <NumberInput
                  id="brushEndStep"
                  aria-label="Конечный шаг"
                  min="3"
                  max="120"
                  defaultValue="40"
                />
              </label>
              <label>
                Длина перехода, px
                <NumberInput
                  id="brushLength"
                  aria-label="Длина перехода"
                  min="30"
                  max="2000"
                  defaultValue="350"
                />
              </label>
            </div>
            <p className="hint">Shift — ровная линия по ближайшей оси.</p>
            <div className="field-pair">
              <label className="check-row">
                <input id="mirrorH" type="checkbox" />
                Симметрия X
              </label>
              <label className="check-row">
                <input id="mirrorV" type="checkbox" />
                Симметрия Y
              </label>
            </div>
            <label className="field-label" htmlFor="drawLayer">
              Рисовать на слое
            </label>
            <select id="drawLayer">
              <option value="decor">Декор</option>
              <option value="background">Фон</option>
            </select>
            <details>
              <summary>Конструктор рамки</summary>
              <select id="frameStyle" aria-label="Стиль рамки"></select>
              <div id="frameBuilder" className="frame-builder"></div>
              <p className="hint">
                Измени символы рамки и протяни её на холсте инструментом «Рамка».
              </p>
            </details>
            <div id="referencePanel" />
          </section>
          <section
            id="panel-image"
            role="tabpanel"
            aria-labelledby="tab-image"
            className="mode-panel padded"
            hidden
          >
            <div className="section-heading">
              <span>ИЗОБРАЖЕНИЕ В ASCII</span>
            </div>
            <p className="hint">Выбери картинку, настрой ASCII и добавь отдельным слоем.</p>
            <button id="imageUpload" className="image-upload">
              <span data-icon="image"></span>
              <strong>Выбрать изображение</strong>
              <span>PNG, JPG, WebP · до 20 МБ</span>
            </button>
            <div id="asciiLibrary" />
          </section>
        </aside>

        <main className="workspace">
          <div className="editor-shell">
            <div className="editor-toolbar">
              <div
                className="toolbar-group tool-dock"
                role="toolbar"
                aria-label="Инструменты холста"
              >
                <button
                  id="dockAddGroup"
                  className="tool-button dock-add-group"
                  title="Добавить группу героев"
                  aria-label="Добавить группу героев"
                >
                  <span data-icon="groupPlus" />
                  <span className="dock-tool-label">Герои</span>
                </button>
                <span className="toolbar-separator" />
                <button
                  className="tool-button active"
                  data-tool="select"
                  title="Выделение (V)"
                  aria-label="Выделение"
                  aria-pressed="true"
                >
                  <span data-icon="cursor"></span>
                  <span className="dock-tool-label">Выделить</span>
                </button>
                <button
                  className="tool-button"
                  data-tool="hand"
                  title="Перемещение холста (Space)"
                  aria-label="Перемещение холста"
                  aria-pressed="false"
                >
                  <span data-icon="hand"></span>
                  <span className="dock-tool-label">Холст</span>
                </button>
                <span className="toolbar-separator"></span>
                <button
                  className="tool-button"
                  data-tool="lasso"
                  title="Лассо (L)"
                  aria-label="Лассо"
                  aria-pressed="false"
                >
                  <span data-icon="lasso"></span>
                  <span className="dock-tool-label">Лассо</span>
                </button>
                <button
                  className="tool-button"
                  data-tool="pencil"
                  title="Кисть (B)"
                  aria-label="Кисть"
                  aria-pressed="false"
                >
                  <span data-icon="pen"></span>
                  <span className="dock-tool-label">Кисть</span>
                </button>
                <button
                  className="tool-button"
                  data-tool="text"
                  title="Текст (T)"
                  aria-label="Текст"
                  aria-pressed="false"
                >
                  <span data-icon="text"></span>
                  <span className="dock-tool-label">Текст</span>
                </button>
                <button
                  className="tool-button"
                  data-tool="eyedropper"
                  title="Взять символ (I)"
                  aria-label="Взять символ"
                  aria-pressed="false"
                >
                  <span data-icon="eyedropper"></span>
                  <span className="dock-tool-label">Пипетка</span>
                </button>
                <button
                  className="tool-button"
                  data-tool="rect"
                  title="Прямоугольник (R)"
                  aria-label="Прямоугольник"
                  aria-pressed="false"
                >
                  <span data-icon="rect"></span>
                  <span className="dock-tool-label">Фигура</span>
                </button>
                <button
                  className="tool-button"
                  data-tool="eraser"
                  title="Ластик (E)"
                  aria-label="Ластик"
                  aria-pressed="false"
                >
                  <span data-icon="eraser"></span>
                  <span className="dock-tool-label">Ластик</span>
                </button>
                <span className="toolbar-separator" />
                <div id="dockLabels" />
              </div>
              <div className="toolbar-group history-buttons">
                <button
                  id="undoButton"
                  className="tool-button"
                  title="Отменить (Ctrl+Z)"
                  aria-label="Отменить"
                  disabled
                >
                  <span data-icon="undo"></span>
                </button>
                <button
                  id="redoButton"
                  className="tool-button"
                  title="Повторить (Ctrl+Shift+Z)"
                  aria-label="Повторить"
                  disabled
                >
                  <span data-icon="redo"></span>
                </button>
                <span className="toolbar-separator"></span>
                <button
                  id="previewButton"
                  className="button ghost compact"
                  aria-pressed="false"
                  aria-label="Превью холста"
                >
                  <span data-icon="eye"></span>
                  <span>Превью</span>
                </button>
              </div>
            </div>
            <button id="closePreview" className="preview-exit" hidden>
              <span data-icon="close" />
              <span>Закрыть превью</span>
              <kbd>Esc</kbd>
            </button>
            <div id="canvasTopTools" />
            <div className="canvas-caption">
              <span>
                <i className="canvas-dot"></i>
                <span id="canvasName">Сетка по ролям</span>
              </span>
              <span id="canvasDimensions" />
            </div>
            <div id="canvasViewport" className="canvas-viewport">
              <div id="stageWrap" className="stage-wrap">
                <canvas
                  id="stage"
                  width="1193"
                  height="593"
                  tabIndex="0"
                  role="img"
                  aria-label="Холст сетки Dota 2. Для доступного редактирования используйте список объектов и панель свойств."
                ></canvas>
                <div id="canvasReactOverlay" className="canvas-react-overlay" />
              </div>
              <div id="dropOverlay" className="drop-overlay" hidden>
                <span data-icon="import"></span>
                <strong>Отпусти файл здесь</strong>
                <span>JSON-проект или изображение</span>
              </div>
              <div id="emptyCanvas" className="empty-canvas" hidden>
                <span data-icon="heroes"></span>
                <strong>Нет объектов</strong>
                <span>
                  Добавь группу героев, нарисуй что-нибудь
                  <br />
                  или перетащи изображение.
                </span>
                <button id="emptyAddGroup" className="button primary">
                  Добавить группу
                </button>
              </div>
            </div>
            <div id="canvasNotices" />
            <div className="canvas-controls">
              <div
                id="symbolCounter"
                className="symbol-counter"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              ></div>
              <div className="toolbar-group">
                <button
                  id="gridToggle"
                  className="button ghost compact active"
                  aria-pressed="true"
                  title="Сетка (G)"
                >
                  <span data-icon="grid"></span>
                  <span>Сетка</span>
                </button>
                <button
                  id="snapToggle"
                  className="button ghost compact active"
                  aria-pressed="true"
                  title="Привязка к сетке"
                >
                  <span data-icon="magnet"></span>
                  <span>Привязка</span>
                </button>
              </div>
              <div className="toolbar-group zoom-controls">
                <button id="zoomOut" className="icon-button" aria-label="Уменьшить масштаб">
                  <span data-icon="minus"></span>
                </button>
                <button id="zoomValue" className="zoom-value" title="Масштаб 100%">
                  100%
                </button>
                <button id="zoomIn" className="icon-button" aria-label="Увеличить масштаб">
                  <span data-icon="plus"></span>
                </button>
                <span className="toolbar-separator"></span>
                <button
                  id="fitButton"
                  className="icon-button"
                  title="Вписать холст (0)"
                  aria-label="Вписать холст"
                >
                  <span data-icon="fit"></span>
                </button>
              </div>
            </div>
          </div>
        </main>

        <aside id="propertiesPanel" className="inspector-panel" aria-label="Свойства и слои">
          <div id="inspectorDismiss" />
          <div className="inspector-title">
            <span data-icon="sliders"></span>
            <h2>Свойства</h2>
            <span id="selectionCount" className="count-badge">
              Холст
            </span>
          </div>
          <div id="inspectorContent" className="inspector-content"></div>
          <div className="layers-panel">
            <div className="section-heading">
              <span>СЛОИ И ОБЪЕКТЫ</span>
              <span id="objectCount" className="count-badge">
                6
              </span>
            </div>
            <div id="layerList"></div>
            <button id="addGroup" className="button secondary full">
              <span data-icon="plus"></span>Добавить группу героев
            </button>
          </div>
        </aside>
      </div>
      <div id="toast" className="toast" role="status" aria-live="polite" hidden></div>
      <ImageImportDialog />
      <dialog id="modal" className="modal">
        <div id="modalContent"></div>
      </dialog>
      <input id="fileInput" type="file" accept=".json,application/json" hidden />
      <input
        id="imageInput"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
        hidden
      />
      <input id="presetInput" type="file" accept=".json,application/json" hidden />
      <input id="fontInput" type="file" accept=".ttf,.woff,.woff2,.otf" hidden />
    </>
  );
});
