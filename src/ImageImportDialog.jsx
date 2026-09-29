import { NumberInput } from './NumberInput.jsx';
import {
  IMAGE_DEFAULTS,
  IMAGE_RANGES,
  IMAGE_CHECKS,
  IMAGE_TEXT_FIELDS,
  ROW_RANGES,
  ROW_SELECTS,
  TRACE_RANGES,
  TRACE_SELECTS
} from '../scripts/image-settings.mjs';
import { ROW_DEFAULTS } from '../scripts/ascii-rows.mjs';
import { TRACE_DEFAULTS } from '../scripts/dot-trace.mjs';

// Ranges whose hint stays visible under the slider.
const NOTED = new Map([[IMAGE_RANGES, ['thr', 'gridStep', 'blur']], [ROW_RANGES, ['detail', 'pitch']], [TRACE_RANGES, ['length', 'spacing']]]);

function Range({ name, fields = IMAGE_RANGES, defaults = IMAGE_DEFAULTS }) {
  const { id, key, label, min, max, step, hint } = fields.find((field) => field.key === name);
  return (
    <div className="image-control" title={hint}>
      <div className="image-control-heading">
        <label htmlFor={id}>{label}</label>
        <NumberInput
          id={id + 'Number'}
          type="number"
          aria-label={label + ' — значение'}
          min={min}
          max={max}
          step={step}
          defaultValue={defaults[key]}
        />
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        defaultValue={defaults[key]}
      />
      {NOTED.get(fields).includes(key) && (
        <p className="hint image-control-hint">{hint}</p>
      )}
    </div>
  );
}
const RowRange = ({ name }) => <Range name={name} fields={ROW_RANGES} defaults={ROW_DEFAULTS} />;
const TraceRange = ({ name }) => <Range name={name} fields={TRACE_RANGES} defaults={TRACE_DEFAULTS} />;
const TraceSelect = ({ name }) => <RowSelect name={name} fields={TRACE_SELECTS} defaults={TRACE_DEFAULTS} />;
function RowSelect({ name, fields = ROW_SELECTS, defaults = ROW_DEFAULTS }) {
  const { id, key, label, options } = fields.find((field) => field.key === name);
  return (
    <>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} defaultValue={defaults[key]}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </>
  );
}
function Check({ name }) {
  const { id, key, label } = IMAGE_CHECKS.find((field) => field.key === name);
  return (
    <label className="check-row">
      <input id={id} type="checkbox" defaultChecked={IMAGE_DEFAULTS[key]} />
      {label}
    </label>
  );
}
function Charset({ name }) {
  const { id, key, label } = IMAGE_TEXT_FIELDS.find((field) => field.key === name);
  return (
    <div className="image-charset-field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="image-charset-input">
        <input id={id} defaultValue={IMAGE_DEFAULTS[key]} maxLength={1000} spellCheck={false} />
        <button
          id={id + 'Add'}
          className="icon-button charset-add"
          aria-label={'Добавить в ' + label.toLowerCase()}
          title="Выбрать символы"
          aria-haspopup="dialog"
        >
          <span data-icon="plus" />
        </button>
      </div>
    </div>
  );
}

// Stable controls are owned by the editor, just like StudioLayout's imperative hosts.
export function ImageImportDialog() {
  return (
    <dialog
      id="imageDialog"
      className="modal image-dialog"
      aria-labelledby="imageDialogTitle"
      data-view="split"
      data-method="rows"
    >
      <header className="image-dialog-header">
        <div id="imageSource" className="image-dialog-source" hidden>
          <img id="sourcePreview" alt="Исходное изображение" />
          <div>
            <h2 id="imageDialogTitle">Изображение в ASCII</h2>
            <span id="sourceName" />
          </div>
        </div>
        <button
          id="closeImage"
          className="icon-button"
          aria-label="Отменить добавление изображения"
        >
          <span data-icon="close" />
        </button>
      </header>
      <div className="image-dialog-body">
        <section className="image-preview-panel" aria-label="Предпросмотр изображения">
          <div id="imageCategoryWarning" />
          <div className="image-view-controls" role="group" aria-label="Сравнение изображения">
            <button data-image-view="split" aria-pressed="true">
              Рядом
            </button>
            <button data-image-view="source" aria-pressed="false">
              Оригинал
            </button>
            <button data-image-view="ascii" aria-pressed="false">
              ASCII
            </button>
          </div>
          <div className="image-comparison">
            <section className="image-original-pane" aria-label="Оригинал изображения">
              <div className="image-preview-heading">
                <span>Оригинал</span>
                <span id="sourceDimensions" />
              </div>
              <div className="image-original-viewport">
                <img id="imageOriginal" alt="Оригинал выбранного изображения" />
              </div>
            </section>
            <section className="image-result-pane" aria-label="Результат конвертации">
              <div className="image-preview-heading">
                <span>ASCII</span>
                <span id="imageCanvasDimensions">1193 × 593</span>
              </div>
              <div id="imagePreviewViewport" className="image-preview-viewport">
                <canvas
                  id="imagePreview"
                  role="img"
                  aria-label="Предпросмотр ASCII перед добавлением на холст"
                />
              </div>
            </section>
          </div>
          <div id="conversionStatus" className="image-preview-status" role="status">
            Настрой изображение перед добавлением.
          </div>
        </section>
        <section className="image-dialog-settings" aria-label="Настройки изображения">
          <div className="image-recipes" role="group" aria-label="Быстрая настройка конвертера">
            <button className="button secondary compact" data-image-recipe="line">Контур</button>
            <button className="button secondary compact" data-image-recipe="photo">Фото</button>
            <button className="button secondary compact" data-image-recipe="light">Меньше символов</button>
            <button className="button secondary compact" data-image-recipe="dots">Точки</button>
          </div>
          <div className="image-method" role="group" aria-label="Способ конвертации">
            <button type="button" data-image-method="rows" aria-pressed="true">
              <strong>Строки символов</strong>
              <span>Больше деталей, одна категория на строку</span>
            </button>
            <button type="button" data-image-method="trace" aria-pressed="false">
              <strong>Точечный рисунок</strong>
              <span>Точки ровно по линиям, как от руки</span>
            </button>
            <button type="button" data-image-method="points" aria-pressed="false">
              <strong>Контуры и точки</strong>
              <span>Прежний способ: символ = категория</span>
            </button>
          </div>
          <div className="image-method-panel" data-method-panel="rows">
            <p className="hint">Каждая строка рисунка — одна категория, поэтому даже крупный арт не нагружает Доту. Символы подбираются по форме и ширине в игровом шрифте.</p>
            <div className="image-settings-section">
              <h3>Рисунок</h3>
              <RowSelect name="mode" />
              <RowSelect name="ink" />
              <RowRange name="fill" />
              <RowRange name="bright" />
              <RowRange name="contrast" />
              <RowRange name="detail" />
              <RowRange name="density" />
            </div>
            <div className="image-settings-section">
              <h3>Символы</h3>
              <RowSelect name="glyphs" />
              <div id="rowCustomField" className="image-charset-field" hidden>
                <label className="field-label" htmlFor="rowCustomGlyphs">
                  Свой набор
                </label>
                <input id="rowCustomGlyphs" maxLength={300} spellCheck={false} placeholder=".:-=+*%@" />
              </div>
              <p id="rowGlyphsHint" className="hint" hidden />
              <RowRange name="pitch" />
            </div>
          </div>
          <div className="image-method-panel" data-method-panel="trace">
            <p className="hint">Точки ставятся по линиям рисунка с одинаковым шагом, как в дот-артах от руки, и собираются в строки. Лучше всего подходят рисунки с чёткими контурами.</p>
            <div className="image-settings-section">
              <h3>Линии</h3>
              <TraceSelect name="source" />
              <TraceRange name="fill" />
              <TraceRange name="detail" />
              <TraceRange name="length" />
            </div>
            <div className="image-settings-section">
              <h3>Точки</h3>
              <TraceRange name="spacing" />
              <label className="check-row">
                <input id="tracePack" type="checkbox" defaultChecked={TRACE_DEFAULTS.pack} />
                Упаковать точки в строки
              </label>
              <p className="hint">Точки почти на одной высоте становятся одной категорией. Каждая сдвигается не больше чем на 1,5 px, на глаз не видно, а категорий в 2–3 раза меньше.</p>
            </div>
          </div>
          <div className="image-method-panel" data-method-panel="points">
          <p className="hint">Начни с 1000 символов. Если много шума — увеличь сглаживание и порог контура. Если пропали детали — уменьши шаг.</p>
          <label className="field-label" htmlFor="imagePreset">
            Стиль конвертации
          </label>
          <select id="imagePreset" />
          <div className="image-settings-section">
            <h3>Изображение</h3>
            <Range name="bright" />
            <Range name="contrast" />
            <Check name="invert" />
            <Range name="blur" />
            <Range name="sharpness" />
          </div>
          <div className="image-settings-section">
            <h3>Контуры</h3>
            <Range name="thr" />
            <Check name="thinning" />
            <Charset name="charset" />
            <Check name="autoOrient" />
            <Check name="onlyDots" />
          </div>
          <div className="image-settings-section">
            <h3>Размещение</h3>
            <Range name="fill" />
            <Range name="gridStep" />
            <Range name="density" />
            <label className="field-label" htmlFor="imageLimit">
              Лимит символов
            </label>
            <NumberInput
              id="imageLimit"
              type="number"
              min="100"
              max="10000"
              step="100"
              defaultValue={IMAGE_DEFAULTS.maxCats}
            />
            <p className="hint">Общий предел для контуров и заливки. После 2000 категорий нагрузка на Доту может заметно вырасти.</p>
          </div>
          <div className="image-settings-section">
            <h3>Заливка</h3>
            <Check name="shading" />
            <Charset name="shadeCharset" />
            <Range name="shadeDensity" />
            <Range name="shadeThreshold" />
          </div>
          <div className="field-pair">
            <button id="importPresets" className="button secondary compact">
              Импорт пресетов
            </button>
            <button id="savePreset" className="button secondary compact">
              Сохранить стиль
            </button>
          </div>
          </div>
        </section>
      </div>
      <footer className="image-dialog-footer">
        <span>Новый ASCII-слой</span>
        <button id="cancelImage" className="button secondary">
          Отмена
        </button>
        <button id="applyImage" className="button primary" disabled>
          <span data-icon="plus" />
          Добавить на холст
        </button>
      </footer>
    </dialog>
  );
}
