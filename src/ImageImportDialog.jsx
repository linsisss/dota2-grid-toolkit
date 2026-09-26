import { NumberInput } from './NumberInput.jsx';
import {
  IMAGE_DEFAULTS,
  IMAGE_RANGES,
  IMAGE_CHECKS,
  IMAGE_TEXT_FIELDS
} from '../scripts/image-settings.mjs';

function Range({ name }) {
  const { id, key, label, min, max, step, hint } = IMAGE_RANGES.find((field) => field.key === name);
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
          defaultValue={IMAGE_DEFAULTS[key]}
        />
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        defaultValue={IMAGE_DEFAULTS[key]}
      />
    </div>
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
