import { memo } from 'react';
import { Icon } from './Icon.jsx';
import { NumberInput } from './NumberInput.jsx';
import { ImageImportDialog } from './ImageImportDialog.jsx';
import LanguageSwitch from './LanguageSwitch.jsx';
import { t, locale } from '../scripts/i18n.mjs';
// Stable shell: the editor exclusively owns the canvas and empty imperative hosts.
export const StudioLayout = memo(function StudioLayout({ onBack }) {
  return (
    <>
      <header className="app-header">
        <button className="workspace-back" onClick={onBack} aria-label={t('Вернуться в студию')}><Icon name="back" /><span>{t('Студия')}</span></button>
        <a className="brand" href="./" aria-label={t('Grid Studio, главная')}>
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
        <button id="saveState" className="save-state" data-state="saved" aria-label={t('Изменения сохранены. Открыть версии проекта')} aria-haspopup="dialog" data-tooltip={t('Открыть версии проекта')}>
          <span className="save-state-dot" aria-hidden="true" />
          <span id="saveStateLabel">{t('Изменения сохранены')}</span>
        </button>
        <div className="header-actions">
          <button id="importButton" className="button secondary" aria-label={t('Импортировать')}>
            <span data-icon="import"></span>
            <span>{t('Импортировать')}</span>
          </button>
          <button id="exportButton" className="button primary">
            <span data-icon="export"></span>
            <span>{t('Экспортировать')}</span>
          </button>
        </div>
      </header>

      <nav className="studio-navigation" aria-label={t('Рабочее пространство')}>
        <div className="mode-tabs" role="tablist" aria-label={t('Режим редактора')}>
          <button
            role="tab"
            id="tab-heroes"
            aria-controls="panel-heroes"
            aria-selected="true"
            data-mode="heroes"
          >
            <span data-icon="heroes"></span>{t('Сетка')}
          </button>
          <button
            role="tab"
            id="tab-draw"
            aria-controls="panel-draw"
            aria-selected="false"
            tabIndex="-1"
            data-mode="draw"
          >
            <span data-icon="pen"></span>{t('Рисование')}
          </button>
          <button
            role="tab"
            id="tab-image"
            aria-controls="panel-image"
            aria-selected="false"
            tabIndex="-1"
            data-mode="image"
          >
            <span data-icon="image"></span>{t('ASCII-арты')}
          </button>
        </div>
        <div id="gridFilePanel" />
        <button
          id="focusButton"
          className="button secondary settings-toggle"
          aria-controls="propertiesPanel"
          aria-expanded="false"
          title={t('Показать настройки (F)')}
        >
          <span data-icon="sliders" />
          <span>{t('Настройки')}</span>
        </button>
        <LanguageSwitch className="editor-language" />
        <button
          id="helpButton"
          className="icon-button help-button"
          aria-label={t('Помощь и горячие клавиши')}
          title={t('Помощь и горячие клавиши (?)')}
        >
          <span data-icon="help"></span>
        </button>
      </nav>

      <div className="app-layout">
        <aside id="libraryPanel" className="library-panel" aria-label={t('Библиотека и инструменты')}>
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
              <span data-icon="pen"></span>{t('В отдельном окне')}
            </button>
            <button id="addAscii" className="button secondary full">
              <span data-icon="text"></span>{t('Вставить ASCII-арт или текст')}
            </button>
            <div id="referencePanel" />
            <div className="section-heading">
              <span>{t('ИНСТРУМЕНТЫ')}</span>
              <span className="muted">B</span>
            </div>
            <div id="drawingTools" className="drawing-tools"></div>
            <div id="eraserSizeField" hidden>
              <label className="range-label" htmlFor="eraserSize">
                <span id="eraserSizeName">{t('Размер ластика')}</span> <output id="eraserSizeValue">44 px</output>
              </label>
              <input id="eraserSize" type="range" min="6" max="400" defaultValue="44" />
              <p className="hint">{t('Колесо мыши над холстом или [ и ] — меньше и больше. Ctrl + колесо — масштаб.')}</p>
            </div>
            {/* «Распыление»: how far the glyphs under the brush fly and how widely they fan out. */}
            <div id="scatterField" hidden>
              <label className="range-label" htmlFor="scatterDistance">{t('Дальность')} <output id="scatterDistanceValue">×{(2.5).toLocaleString(locale)}</output></label>
              <input id="scatterDistance" type="range" min="5" max="60" defaultValue="25" onInput={(event) => { document.getElementById('scatterDistanceValue').textContent = `×${(Number(event.currentTarget.value) / 10).toLocaleString(locale)}`; }} />
              <label className="range-label" htmlFor="scatterSpread">{t('Разброс')} <output id="scatterSpreadValue">35°</output></label>
              <input id="scatterSpread" type="range" min="0" max="90" defaultValue="35" onInput={(event) => { document.getElementById('scatterSpreadValue').textContent = `${event.currentTarget.value}°`; }} />
              <p className="hint">{t('Веди кистью по рисунку: точки под ней разлетятся в сторону движения, будто рисунок крошится. Клик без движения — тает вниз.')}</p>
            </div>
            <div className="section-heading">
              <span>{t('СИМВОЛЫ КИСТИ')}</span>
              <span id="brushPreview">★</span>
            </div>
            <input id="symbolSearch" type="search" aria-label={t('Поиск символов')} placeholder={t('Символ, название или U+…')} />
            <select id="symbolCategory" aria-label={t('Категория символов')}></select>
            <label className="check-row category-select-all">
              <input id="brushSelectAll" type="checkbox" />
              {t('Выбрать все символы')}
            </label>
            <div id="symbolLibrary" className="symbol-library"></div>
            <label className="field-label" htmlFor="brushInput">
              {t('Свой символ или набор')}
            </label>
            <input id="brushInput" type="text" defaultValue="★" maxLength="1000" />
            <button id="clearBrush" className="button ghost compact">
              {t('Очистить набор')}
            </button>
            <label className="field-label" htmlFor="brushOrder">
              {t('Порядок символов')}
            </label>
            <select id="brushOrder">
              <option value="sequence">{t('Чередовать')}</option>
              <option value="random">{t('Случайно')}</option>
              <option value="gradient">{t('Плавный переход')}</option>
            </select>
            <label id="brushGradientField" className="field-label" hidden>
              {t('Длина градиента, px')}
              <NumberInput
                id="brushGradientLength"
                aria-label={t('Длина градиента')}
                type="number"
                min="10"
                max="6000"
                defaultValue="350"
              />
            </label>
            <label className="range-label" htmlFor="brushStep">
              {t('Шаг кисти')} <output id="brushStepValue">16 px</output>
            </label>
            <input id="brushStep" type="range" min="5" max="40" defaultValue="16" />
            <label className="field-label" htmlFor="brushDynamics">
              {t('Динамика кисти')}
            </label>
            <select id="brushDynamics">
              <option value="constant">{t('Постоянная плотность')}</option>
              <option value="denser">{t('От редкого к плотному')}</option>
              <option value="sparser">{t('От плотного к редкому')}</option>
            </select>
            <div id="brushDynamicsFields" className="field-pair" hidden>
              <label>
                {t('Конечный шаг, px')}
                <NumberInput
                  id="brushEndStep"
                  aria-label={t('Конечный шаг')}
                  min="3"
                  max="120"
                  defaultValue="40"
                />
              </label>
              <label>
                {t('Длина перехода, px')}
                <NumberInput
                  id="brushLength"
                  aria-label={t('Длина перехода')}
                  min="30"
                  max="2000"
                  defaultValue="350"
                />
              </label>
            </div>
            <p className="hint">{t('Shift во время рисования — сдвинуть фигуру. У кисти — ровная линия по ближайшей оси.')}</p>
            <div className="field-pair">
              <label className="check-row">
                <input id="mirrorH" type="checkbox" />
                {t('Симметрия X')}
              </label>
              <label className="check-row">
                <input id="mirrorV" type="checkbox" />
                {t('Симметрия Y')}
              </label>
            </div>
            <label className="field-label" htmlFor="drawLayer">
              {t('Рисовать на слое')}
            </label>
            <select id="drawLayer">
              <option value="decor">{t('Декор')}</option>
              <option value="background">{t('Фон')}</option>
            </select>
            <details>
              <summary>{t('Конструктор рамки')}</summary>
              <select id="frameStyle" aria-label={t('Стиль рамки')}></select>
              <div id="frameBuilder" className="frame-builder"></div>
              <p className="hint">
                {t('Измени символы рамки и протяни её на холсте инструментом «Рамка».')}
              </p>
            </details>
          </section>
          <section
            id="panel-image"
            role="tabpanel"
            aria-labelledby="tab-image"
            className="mode-panel padded"
            hidden
          >
            <div className="section-heading">
              <span>{t('ИЗОБРАЖЕНИЕ В ASCII')}</span>
            </div>
            <p className="hint">{t('Выбери картинку, настрой ASCII и добавь отдельным слоем.')}</p>
            <button id="imageUpload" className="image-upload">
              <span data-icon="image"></span>
              <strong>{t('Выбрать изображение')}</strong>
              <span>{t('PNG, JPG, WebP · до 20 МБ')}</span>
            </button>
            <div id="textArtHost" />
            <div id="asciiLibrary" />
          </section>
        </aside>

        <main className="workspace">
          <div className="editor-shell">
            <div className="editor-toolbar">
              <div
                className="toolbar-group tool-dock"
                role="toolbar"
                aria-label={t('Инструменты холста')}
              >
                <button
                  id="dockAddGroup"
                  className="tool-button dock-add-group"
                  title={t('Добавить группу героев')}
                  aria-label={t('Добавить группу героев')}
                >
                  <span data-icon="groupPlus" />
                  <span className="dock-tool-label">{t('Герои')}</span>
                </button>
                <span className="toolbar-separator" />
                <button
                  className="tool-button active"
                  data-tool="select"
                  title={t('Выделение (V)')}
                  aria-label={t('Выделение')}
                  aria-pressed="true"
                >
                  <span data-icon="cursor"></span>
                  <span className="dock-tool-label">{t('Выделить')}</span>
                </button>
                <button
                  className="tool-button"
                  data-tool="hand"
                  title={t('Перемещение холста (Space)')}
                  aria-label={t('Перемещение холста')}
                  aria-pressed="false"
                >
                  <span data-icon="hand"></span>
                  <span className="dock-tool-label">{t('Холст')}</span>
                </button>
                <span className="toolbar-separator"></span>
                <button
                  className="tool-button"
                  data-tool="lasso"
                  title={t('Лассо (L)')}
                  aria-label={t('Лассо')}
                  aria-pressed="false"
                >
                  <span data-icon="lasso"></span>
                  <span className="dock-tool-label">{t('Лассо')}</span>
                </button>
                <button
                  className="tool-button"
                  data-tool="pencil"
                  title={t('Кисть (B)')}
                  aria-label={t('Кисть')}
                  aria-pressed="false"
                >
                  <span data-icon="pen"></span>
                  <span className="dock-tool-label">{t('Кисть')}</span>
                </button>
                <button
                  className="tool-button"
                  data-tool="text"
                  title={t('Текст (T)')}
                  aria-label={t('Текст')}
                  aria-pressed="false"
                >
                  <span data-icon="text"></span>
                  <span className="dock-tool-label">{t('Текст')}</span>
                </button>
                <button
                  className="tool-button"
                  data-tool="eyedropper"
                  title={t('Взять символ (I)')}
                  aria-label={t('Взять символ')}
                  aria-pressed="false"
                >
                  <span data-icon="eyedropper"></span>
                  <span className="dock-tool-label">{t('Пипетка')}</span>
                </button>
                <button
                  className="tool-button"
                  data-tool="rect"
                  title={t('Прямоугольник (R)')}
                  aria-label={t('Прямоугольник')}
                  aria-pressed="false"
                >
                  <span data-icon="rect"></span>
                  <span className="dock-tool-label">{t('Фигура')}</span>
                </button>
                <button
                  className="tool-button"
                  data-tool="eraser"
                  title={t('Ластик (E)')}
                  aria-label={t('Ластик')}
                  aria-pressed="false"
                >
                  <span data-icon="eraser"></span>
                  <span className="dock-tool-label">{t('Ластик')}</span>
                </button>
                <span className="toolbar-separator" />
                <div id="dockLabels" />
              </div>
              <div className="toolbar-group history-buttons">
                <button
                  id="undoButton"
                  className="tool-button"
                  title={t('Отменить (Ctrl+Z)')}
                  aria-label={t('Отменить')}
                  disabled
                >
                  <span data-icon="undo"></span>
                </button>
                <button
                  id="redoButton"
                  className="tool-button"
                  title={t('Повторить (Ctrl+Shift+Z)')}
                  aria-label={t('Повторить')}
                  disabled
                >
                  <span data-icon="redo"></span>
                </button>
                <span className="toolbar-separator"></span>
                <button
                  id="previewButton"
                  className="button ghost compact"
                  aria-pressed="false"
                  aria-label={t('Превью холста')}
                >
                  <span data-icon="eye"></span>
                  <span>{t('Превью')}</span>
                </button>
              </div>
            </div>
            <button id="closePreview" className="preview-exit" hidden>
              <span data-icon="close" />
              <span>{t('Закрыть превью')}</span>
              <kbd>Esc</kbd>
            </button>
            <button id="previewBackground" className="preview-exit preview-background" hidden aria-label={t('Фон превью')}>
              <span id="previewBackgroundLabel">{t('Фон: как в Dota')}</span>
            </button>
            <div id="canvasTopTools" />
            <div className="canvas-caption">
              <span>
                <i className="canvas-dot"></i>
                <span id="canvasName">{t('Новая сетка')}</span>
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
                  aria-label={t('Холст сетки Dota 2. Для доступного редактирования используйте список объектов и панель свойств.')}
                ></canvas>
                <div id="canvasReactOverlay" className="canvas-react-overlay" />
              </div>
              <div id="dropOverlay" className="drop-overlay" hidden>
                <span data-icon="import"></span>
                <strong>{t('Отпусти файл здесь')}</strong>
                <span>{t('JSON-проект или изображение')}</span>
              </div>
              <div id="emptyCanvas" className="empty-canvas" hidden>
                <span data-icon="heroes"></span>
                <strong>{t('Нет объектов')}</strong>
                <span>
                  {t('Добавь группу героев, нарисуй что-нибудь')}
                  <br />
                  {t('или перетащи изображение.')}
                </span>
                <button id="emptyAddGroup" className="button primary">
                  {t('Добавить группу')}
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
                  title={t('Сетка (G)')}
                >
                  <span data-icon="gridLines"></span>
                  <span>{t('Сетка')}</span>
                </button>
                <button
                  id="snapToggle"
                  className="button ghost compact active"
                  aria-pressed="true"
                  title={t('Привязка к сетке')}
                >
                  <span data-icon="magnet"></span>
                  <span>{t('Привязка')}</span>
                </button>
              </div>
              <div className="toolbar-group zoom-controls">
                <button id="zoomOut" className="icon-button" aria-label={t('Уменьшить масштаб')}>
                  <span data-icon="minus"></span>
                </button>
                <span id="zoomFields" />
                <button id="zoomIn" className="icon-button" aria-label={t('Увеличить масштаб')}>
                  <span data-icon="plus"></span>
                </button>
                <span className="toolbar-separator"></span>
                <button
                  id="fitButton"
                  className="icon-button"
                  title={t('Вписать холст (0)')}
                  aria-label={t('Вписать холст')}
                >
                  <span data-icon="fit"></span>
                </button>
              </div>
            </div>
          </div>
        </main>

        <aside id="propertiesPanel" className="inspector-panel" aria-label={t('Свойства и слои')}>
          <div id="inspectorDismiss" />
          <div className="inspector-title">
            <span data-icon="sliders"></span>
            <h2>{t('Свойства')}</h2>
            <span id="selectionCount" className="count-badge">
              {t('Холст')}
            </span>
          </div>
          <div id="inspectorContent" className="inspector-content"></div>
          <div className="layers-panel">
            <div className="section-heading">
              <span>{t('СЛОИ И ОБЪЕКТЫ')}</span>
              <span id="objectCount" className="count-badge">
                6
              </span>
            </div>
            <div id="layerList"></div>
            <button id="addGroup" className="button secondary full">
              <span data-icon="plus"></span>{t('Добавить группу героев')}
            </button>
          </div>
        </aside>
      </div>
      <div id="toast" className="toast" role="status" aria-live="polite" hidden></div>
      <ImageImportDialog />
      <dialog id="modal" className="modal" tabIndex={-1}>
        <div id="modalContent"></div>
      </dialog>
      <input id="fileInput" type="file" accept=".json,application/json" multiple hidden />
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
