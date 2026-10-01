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
import { t, translateMessage } from '../scripts/i18n.mjs';

// Labels, hints and options come from scripts/image-settings.mjs; translateMessage shows them in the
// site's language whether they arrive Russian or already translated.
const label = (text) => translateMessage(text);

// Ranges whose hint stays visible under the slider.
const NOTED = new Map([[IMAGE_RANGES, ['thr', 'gridStep', 'blur']], [ROW_RANGES, ['detail', 'pitch']], [TRACE_RANGES, ['length', 'spacing']]]);

function Range({ name, fields = IMAGE_RANGES, defaults = IMAGE_DEFAULTS }) {
  const field = fields.find((item) => item.key === name), { id, key, min, max, step } = field;
  const title = label(field.label), hint = label(field.hint);
  return (
    <div className="image-control" title={hint}>
      <div className="image-control-heading">
        <label htmlFor={id}>{title}</label>
        <NumberInput
          id={id + 'Number'}
          type="number"
          aria-label={t('{label} — значение', { label: title })}
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
  const { id, key, label: title, options } = fields.find((field) => field.key === name);
  return (
    <>
      <label className="field-label" htmlFor={id}>
        {label(title)}
      </label>
      <select id={id} defaultValue={defaults[key]}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {label(text)}
          </option>
        ))}
      </select>
    </>
  );
}
function Check({ name }) {
  const { id, key, label: title } = IMAGE_CHECKS.find((field) => field.key === name);
  return (
    <label className="check-row">
      <input id={id} type="checkbox" defaultChecked={IMAGE_DEFAULTS[key]} />
      {label(title)}
    </label>
  );
}
function Charset({ name }) {
  const field = IMAGE_TEXT_FIELDS.find((item) => item.key === name), { id, key } = field, title = label(field.label);
  return (
    <div className="image-charset-field">
      <label className="field-label" htmlFor={id}>
        {title}
      </label>
      <div className="image-charset-input">
        <input id={id} defaultValue={IMAGE_DEFAULTS[key]} maxLength={1000} spellCheck={false} />
        <button
          id={id + 'Add'}
          className="icon-button charset-add"
          aria-label={t('Добавить в {field}', { field: title.toLowerCase() })}
          title={t('Выбрать символы')}
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
      data-method="points"
    >
      <header className="image-dialog-header">
        <div id="imageSource" className="image-dialog-source" hidden>
          <img id="sourcePreview" alt={t('Исходное изображение')} />
          <div>
            <h2 id="imageDialogTitle">{t('Изображение в ASCII')}</h2>
            <span id="sourceName" />
          </div>
        </div>
        <button
          id="closeImage"
          className="icon-button"
          aria-label={t('Отменить добавление изображения')}
        >
          <span data-icon="close" />
        </button>
      </header>
      <div className="image-dialog-body">
        <section className="image-preview-panel" aria-label={t('Предпросмотр изображения')}>
          <div id="imageCategoryWarning" />
          <div className="image-view-controls" role="group" aria-label={t('Сравнение изображения')}>
            <button data-image-view="split" aria-pressed="true">
              {t('Рядом')}
            </button>
            <button data-image-view="source" aria-pressed="false">
              {t('Оригинал')}
            </button>
            <button data-image-view="ascii" aria-pressed="false">
              ASCII
            </button>
          </div>
          <div className="image-comparison">
            <section className="image-original-pane" aria-label={t('Оригинал изображения')}>
              <div className="image-preview-heading">
                <span>{t('Оригинал')}</span>
                <span id="sourceDimensions" />
              </div>
              <div className="image-original-viewport">
                <img id="imageOriginal" alt={t('Оригинал выбранного изображения')} />
              </div>
            </section>
            <section className="image-result-pane" aria-label={t('Результат конвертации')}>
              <div className="image-preview-heading">
                <span>ASCII</span>
                <span id="imageCanvasDimensions">1193 × 593</span>
              </div>
              <div id="imagePreviewViewport" className="image-preview-viewport">
                <canvas
                  id="imagePreview"
                  role="img"
                  aria-label={t('Предпросмотр ASCII перед добавлением на холст')}
                />
              </div>
            </section>
          </div>
          {/* Styles with thumbnails of the loaded picture (app.mjs buildStyleStrip). */}
          <div id="imageStyles" className="image-styles" role="group" aria-label={t('Стиль')} />
          <div id="conversionStatus" className="image-preview-status" role="status">
            {t('Настрой изображение перед добавлением.')}
          </div>
        </section>
        <section className="image-dialog-settings" aria-label={t('Настройки изображения')}>
          <div className="image-recipes" role="group" aria-label={t('Быстрая настройка конвертера')}>
            <button className="button secondary compact" data-image-recipe="line">{t('Контур')}</button>
            <button className="button secondary compact" data-image-recipe="photo">{t('Фото')}</button>
            <button className="button secondary compact" data-image-recipe="light">{t('Меньше символов')}</button>
            <button className="button secondary compact" data-image-recipe="dots">{t('Точки')}</button>
          </div>
          <div className="image-method" role="group" aria-label={t('Способ конвертации')}>
            <button type="button" data-image-method="rows" aria-pressed="false">
              <strong>{t('Строки символов')}</strong>
              <span>{t('Больше деталей, одна категория на строку')}</span>
            </button>
            <button type="button" data-image-method="trace" aria-pressed="false">
              <strong>{t('Точечный рисунок')}</strong>
              <span>{t('Точки ровно по линиям, как от руки')}</span>
            </button>
            <button type="button" data-image-method="points" aria-pressed="true">
              <strong>{t('Контуры и точки')}</strong>
              <span>{t('Прежний способ: символ = категория')}</span>
            </button>
          </div>
          <div className="image-method-panel" data-method-panel="rows">
            <p className="hint">{t('Каждая строка рисунка — одна категория, поэтому даже крупный арт не нагружает Доту. Символы подбираются по форме и ширине в игровом шрифте.')}</p>
            <div className="image-settings-section">
              <h3>{t('Рисунок')}</h3>
              <RowSelect name="mode" />
              <RowSelect name="ink" />
              <RowRange name="fill" />
              <RowRange name="bright" />
              <RowRange name="contrast" />
              <RowRange name="detail" />
              <RowRange name="density" />
            </div>
            <div className="image-settings-section">
              <h3>{t('Символы')}</h3>
              <RowSelect name="glyphs" />
              <div id="rowCustomField" className="image-charset-field" hidden>
                <label className="field-label" htmlFor="rowCustomGlyphs">
                  {t('Свой набор')}
                </label>
                <input id="rowCustomGlyphs" maxLength={300} spellCheck={false} placeholder=".:-=+*%@" />
              </div>
              <p id="rowGlyphsHint" className="hint" hidden />
              <RowRange name="pitch" />
            </div>
          </div>
          <div className="image-method-panel" data-method-panel="trace">
            <p className="hint">{t('Точки ставятся по линиям рисунка с одинаковым шагом, как в дот-артах от руки, и собираются в строки. Лучше всего подходят рисунки с чёткими контурами.')}</p>
            <div className="image-settings-section">
              <h3>{t('Линии')}</h3>
              <TraceSelect name="source" />
              <TraceRange name="fill" />
              <TraceRange name="detail" />
              <TraceRange name="length" />
            </div>
            <div className="image-settings-section">
              <h3>{t('Точки')}</h3>
              <TraceRange name="spacing" />
              <label className="check-row">
                <input id="tracePack" type="checkbox" defaultChecked={TRACE_DEFAULTS.pack} />
                {t('Упаковать точки в строки')}
              </label>
              <p className="hint">{t('Точки почти на одной высоте становятся одной категорией. Каждая сдвигается не больше чем на 1,5 px, на глаз не видно, а категорий в 2–3 раза меньше.')}</p>
            </div>
          </div>
          <div className="image-method-panel" data-method-panel="points">
          <p className="hint">{t('Начни с 1000 символов. Если много шума — увеличь сглаживание и порог контура. Если пропали детали — уменьши шаг.')}</p>
          <label className="field-label" htmlFor="imagePreset">
            {t('Стиль конвертации')}
          </label>
          <select id="imagePreset" />
          <div className="image-settings-section">
            <h3>{t('Изображение')}</h3>
            <Range name="bright" />
            <Range name="contrast" />
            <Check name="invert" />
            <Range name="blur" />
            <Range name="sharpness" />
          </div>
          <div className="image-settings-section">
            <h3>{t('Контуры')}</h3>
            <Range name="thr" />
            <Check name="thinning" />
            <Charset name="charset" />
            <Check name="autoOrient" />
            <Check name="onlyDots" />
          </div>
          <div className="image-settings-section">
            <h3>{t('Размещение')}</h3>
            <Range name="fill" />
            <Range name="gridStep" />
            <Range name="density" />
            <label className="field-label" htmlFor="imageLimit">
              {t('Лимит символов')}
            </label>
            <NumberInput
              id="imageLimit"
              type="number"
              min="100"
              max="10000"
              step="100"
              defaultValue={IMAGE_DEFAULTS.maxCats}
            />
            <p className="hint">{t('Общий предел для контуров и заливки. После 2000 категорий нагрузка на Доту может заметно вырасти.')}</p>
          </div>
          <div className="image-settings-section">
            <h3>{t('Заливка')}</h3>
            <Check name="shading" />
            <Charset name="shadeCharset" />
            <Range name="shadeDensity" />
            <Range name="shadeThreshold" />
          </div>
          <div className="field-pair">
            <button id="importPresets" className="button secondary compact">
              {t('Импорт пресетов')}
            </button>
            <button id="savePreset" className="button secondary compact">
              {t('Сохранить стиль')}
            </button>
          </div>
          </div>
        </section>
      </div>
      <footer className="image-dialog-footer">
        <span>{t('Новый ASCII-слой')}</span>
        <button id="cancelImage" className="button secondary">
          {t('Отмена')}
        </button>
        <button id="applyImage" className="button primary" disabled>
          <span data-icon="plus" />
          {t('Добавить на холст')}
        </button>
      </footer>
    </dialog>
  );
}
