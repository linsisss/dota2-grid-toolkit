/* Grid Studio: one canvas, one document, one history for all three workflows. */
import C from './core.mjs';
import { APP_VERSION } from './version.mjs';
import { placeTextArt } from './text-art.mjs';
import { saveIndicator } from './save-status.mjs';
import { steamFolderMarkup, mountSteamFolder } from './steam-folder.mjs';
import { selectedCatalogGrid, appendCatalogGrid } from './catalog-document.mjs';
import D from './data.mjs';
import { readGridFiles } from './grid-import.mjs';
import { clampZoom, wheelZoom } from './zoom.mjs';
import { simplifyArtwork, simplifiableItems } from './artwork-optimization.mjs';
import { planOptimization, optimizeCategories } from './category-optimization.mjs';
import { canvasPoint, snapPoint, hitItem, hitSelectionFrame, inkFrame, intersectsInk, selectionOnClick, centerBrushPoints } from './canvas-input.mjs';
import { moveHero, heroAt, heroDropIndex, createHeroMotion, targetHeroMotion, advanceHeroMotion } from './hero-order.mjs';
import { editLayout } from './hero-chrome.mjs';
import { numberButtons, stepNumber } from './form-controls.mjs';
import { gamePreviewLayout } from './game-preview.mjs';
import { layoutAsciiArt, placeAsciiArt } from './ascii-library.mjs';
import { BRUSH_TOOLS, DRAWING_TOOLS, GRADIENT_CHARS, bentLine, constrainAxis, drawingPoints, lassoContains, setDrawingShift, advanceDrawingStroke } from './drawing.mjs';
import { clampEraser, readEraserSize, stepEraserSize, storeEraserSize, wheelEraserSize, drawBrushRing } from './eraser-size.mjs';
import { guideLines, snapMove } from './smart-guides.mjs';
import { ALIGN_ACTIONS, DISTRIBUTE_ACTIONS, alignIconSVG } from './align-icons.mjs';
import { iconSVG } from './icons.mjs';
import { applyMyBackground, hasMyBackground } from '../src/my-background.js';
import {
  searchSymbols,
  categorySelection,
  toggleCategory,
  toggleSymbol,
  rememberSymbols as updateRecents,
  pickSymbol,
  MAX_BRUSH_CHARS
} from './symbol-tools.mjs';
import {
  overflow,
  cropSymbols,
  eraseSymbols,
  scatterSymbols,
  SCATTER_DEFAULTS,
  replaceGlyphs,
  glyphCounts,
  selectionUnits,
  alignUnits,
  distributeUnits,
  moveItems,
  reflectItems, referenceHandles, referenceHit, transformReference
} from './edit-operations.mjs';
import { convertWithStats } from './converter.mjs';
import { IMAGE_STYLES,
  IMAGE_DEFAULTS,
  IMAGE_RANGES,
  IMAGE_CHECKS,
  IMAGE_TEXT_FIELDS,
  ROW_RANGES,
  ROW_SELECTS,
  ROW_RECIPES,
  TRACE_RANGES,
  TRACE_SELECTS,
  TRACE_RECIPES
} from './image-settings.mjs';
import { ROW_DEFAULTS, ROW_FONT, ROW_GLYPH_SETS, rowAtlas, rowBandTop, rowDraftScale, rowGlyphs } from './ascii-rows.mjs';
import { TRACE_DEFAULTS, TRACE_MAX_DOTS } from './dot-trace.mjs';
import { packGlyphs, packSymbols } from './dot-packing.mjs';
import { gridBackground, onGridBackground, setGridBackground } from './grid-background.mjs';
import { DOTA, TEXT_MODEL, invisibleWarning, drawCategoryLabel, measureCategoryText, measureCategoryInk, measureCategoryWidth, glyphWidths, portraitSourceRect } from './dota-rendering.mjs';
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M8 22a10 10 0 1 1 16-9M19 7l5 6 5-5" fill="none" stroke="#10151a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 22a10 10 0 1 1 16-9M19 7l5 6 5-5" fill="none" stroke="#efeaf5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>')}") 16 16, grab`;
const IMAGE_METHOD_KEY = 'gridstudio.image-method';
// «Контуры и точки» is the default again (1.6); a method the user picked is remembered.
function readImageMethod() {
  try {
    const method = localStorage.getItem(IMAGE_METHOD_KEY);
    return method === 'rows' || method === 'trace' ? method : 'points';
  } catch { return 'points'; }
}
// The picture at the art's size on the canvas; transparent parts count as white, as in the
// contour method.
function rowLuma(pixels, width, height) {
  const source = document.createElement('canvas');
  source.width = pixels.width; source.height = pixels.height;
  source.getContext('2d').putImageData(pixels, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data, luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i++) luma[i] = (data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 + data[i * 4 + 2] * 0.0722) / 255;
  return luma;
}
const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
export function createStudio(projectStorage, initial) {
  const $ = (id) => document.getElementById(id);
  const abort = new AbortController();
  let disposed = false;
  const listen = (target, type, handler, options = {}) =>
    target.addEventListener(type, handler, { ...options, signal: abort.signal });
  const subscribers = new Set();
  let snapshot = {},
    snapshotKey = '',
    pickerGroupId = null,
    drawingOpen = false,
    contextMenu = null;
  let customCanvasFont = null;
  const PRESETS_KEY = 'dota-grid-studio.presets.v1';
  // Lucide icons, shared with the React pages (scripts/icons.mjs).
  const icon = (name) => iconSVG(name);
  function hydrateIcons(scope = document) {
    scope.querySelectorAll('[data-icon]').forEach((el) => {
      el.innerHTML = icon(el.dataset.icon);
    });
  }
  const esc = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const heroById = new Map(D.heroes.map((h) => [h.id, h]));
  let doc = initial.doc || C.createDocument();
  const history = new C.History(35);
  const workspace = () => C.canvasSize(doc);
  let canvasGeometryKey = '',
    recentSymbols = [];
  try {
    const stored = JSON.parse(localStorage.getItem('dota-grid-studio.recent-symbols.v1') || '[]');
    if (Array.isArray(stored))
      recentSymbols = updateRecents(
        [],
        stored
          .filter((ch) => typeof ch === 'string' && Array.from(ch).length === 1)
          .slice(0, 8)
          .reverse()
          .join('')
      );
  } catch {
    /* Optional preference. */
  }
  function remember(used) {
    recentSymbols = updateRecents(recentSymbols, used);
    try {
      localStorage.setItem('dota-grid-studio.recent-symbols.v1', JSON.stringify(recentSymbols));
    } catch {
      /* Optional preference. */
    }
    publishUI();
  }
  function useBrushSymbol(char) {
    $('brushInput').value = char;
    $('brushOrder').value = 'sequence';
    renderSymbols();
    remember(char);
    setTool('pencil');
  }
  let selected = new Set(),
    mode = 'heroes',
    tool = 'select',
    zoom = 1,
    fit = true,
    preview = false,
    showGrid = true,
    snap = false,
    focused = true;
  let clipboard = [],
    clipboardArtwork = [],
    imagePixels = null,
    conversionPoints = [],
    // The preview's conversion (requestConversion): the pending frame, the newest request,
    // the newest full-quality request, the result on screen and whether it is final.
    convertFrame = 0,
    convertRevision = 0,
    fullRevision = 0,
    shownRevision = 0,
    conversionFinal = false,
    // A slider is moving (drafts), by a held key; the drag's first frame is still to measure.
    sliding = false,
    slidingKey = false,
    liveProbe = false,
    pointsDraftPixels = null,
    imageMethod = readImageMethod(),
    rowsJobs = { worker: null, busy: false },
    traceJobs = { worker: null, busy: false },
    rowDrafts = { worker: null, busy: false, waiting: null },
    traceDrafts = { worker: null, busy: false, waiting: null },
    rowAtlases = new Map(),
    imageRequest = 0,
    sourceFilename = '',
    sourceImageURL = null;
  let imageSettings = { ...IMAGE_DEFAULTS };
  let customPresets = {},
    saveTimer,
    saveDeadline,
    saveRevision = 0,
    saveDirty = false,
    saveInFlight = false,
    saveWarning = '',
    cloudSaveStatus = '',
    localSaveStatus = { text: 'Изменения сохранены', warning: false },
    toastTimer,
    gesture = null,
    spaceDown = false,
    lastPoint = { x: 60, y: 60 },
    drawFrame = null;
  let referenceEditing = false;
  let heroMotion = null;
  let eraserSize = readEraserSize(), eraserHover = null, eraserLabelUntil = 0, eraserLabelTimer;
  // «Изогнутая линия»: the line just drawn keeps a handle in its middle; dragging it bends the line
  // through that point (drawing.mjs bentLine), a step of its own in the history. The handle stays
  // while those glyphs are untouched and the line tool is on.
  let bendable = null, bendHints = (() => { try { return Number(localStorage.getItem('gridstudio.bendHints')) || 0; } catch { return 0; } })();
  const bendSignature = (ids) => JSON.stringify(ids.map((id) => { const e = doc.entities.find((item) => item.id === id); return e ? [e.id, e.x, e.y, e.text] : null; }));
  const bendableNow = () => (tool === 'line' && bendable && !preview && bendable.ids.length && bendSignature(bendable.ids) === bendable.signature ? bendable : null);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frameStyle = { ...D.frames.simple },
    framePending = false;
  const collapsed = new Set(['background']);
  const canvas = $('stage'),
    ctx = canvas.getContext('2d'),
    viewport = $('canvasViewport'),
    modal = $('modal'),
    imageDialog = $('imageDialog');
  const portraits = new Map();
  let previewView = null,
    previewOwnsFullscreen = false;
  const previewInert = new Map();
  let referenceImage = null,
    referenceSource = '',
    uiReferenceSource = '',
    referenceRevision = 0,
    // The opacity slider while it moves: drawn only, committed on release (setReference). It
    // belongs to that reference object, so any commit, undo or redo leaves it behind.
    referencePreview = null;
  let inspectorSelection = '',
    inspectorDocument = null,
    liveEdit = null;
  let density = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = 1;
  canvas.height = 1;
  canvas.style.width = workspace().w + 'px';
  canvas.style.height = workspace().h + 'px';
  try {
    customPresets = JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}');
    if (!customPresets || typeof customPresets !== 'object' || Array.isArray(customPresets))
      customPresets = {};
  } catch {
    customPresets = {};
  }
  function toast(message, error = false) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').classList.toggle('error', error);
    $('toast').hidden = false;
    $('toast').classList.remove('leaving');
    toastTimer = setTimeout(
      () => {
        $('toast').classList.add('leaving');
        toastTimer = setTimeout(() => ($('toast').hidden = true), 180);
      },
      error ? 6500 : 3800
    );
  }
  function renderSaveIndicator() {
    if (disposed) return;
    const view = saveIndicator(localSaveStatus, cloudSaveStatus), button = $('saveState');
    $('saveStateLabel').textContent = view.text;
    button.classList.toggle('save-warning', view.warning);
    button.dataset.state = view.warning ? 'warning' : view.text === 'Изменения сохранены' ? 'saved' : 'saving';
    button.setAttribute('aria-label', `${view.text}. Открыть версии проекта`);
    button.dataset.tooltip = view.detail ? `${view.detail} Открыть версии проекта` : 'Открыть версии проекта';
  }
  function setLocalSaveStatus(text, warning = false, detail = '') {
    localSaveStatus = { text, warning, detail };
    renderSaveIndicator();
  }
  function save() {
    clearTimeout(saveTimer);
    saveDirty = true;
    saveRevision++;
    if (!localSaveStatus.warning) setLocalSaveStatus('Сохраняем…');
    saveTimer = setTimeout(flushSave, 250);
    saveDeadline ||= setTimeout(flushSave, 1000);
  }
  function flushSave() {
    clearTimeout(saveTimer);
    clearTimeout(saveDeadline);
    saveTimer = saveDeadline = null;
    if (!saveDirty) return;
    const revision = saveRevision;
    saveInFlight = true;
    return projectStorage.save(doc).then((result) => {
      if (disposed || revision !== saveRevision) return;
      saveInFlight = false;
      saveDirty = !result.saved;
      const warning = result.conflict
        ? 'Проект изменён в другой вкладке. Твоя работа сохраняется отдельной копией — нажми на статус сохранения.'
        : result.blocked ? 'Основное сохранение защищено. Текущая работа доступна в копиях проекта.'
        : result.recoveryOnly ? 'Работа сохранена в резервную копию. Скачай проект для надёжного хранения.'
        : !result.saved ? 'Не удалось сохранить работу в браузере. Скачай проект.' : '';
      setLocalSaveStatus(warning ? result.saved ? 'Сохранено в копии · открыть' : 'Не сохранено · скачать' : 'Изменения сохранены', Boolean(warning), warning);
      if (warning && warning !== saveWarning) toast(warning, true);
      saveWarning = warning;
    }).catch(() => {
      if (!disposed && revision === saveRevision) {
        saveInFlight = false;
        setLocalSaveStatus('Не сохранено · скачать', true, 'Не удалось сохранить работу. Скачай проект.');
        toast('Не удалось сохранить работу. Скачай проект через меню сохранения.', true);
      }
    });
  }
  listen(window, 'pagehide', flushSave);
  listen(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
  listen(window, 'beforeunload', (event) => {
    if ((saveDirty || saveInFlight) && !projectStorage.checkpoint(doc).local) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  function editable(e) {
    const l = doc.layers.find((l) => l.id === e.layer);
    return !!l && !l.locked && l.visible;
  }
  function selection() {
    return doc.entities.filter((e) => selected.has(e.id));
  }
  function editableSelection() {
    return selection().filter(editable);
  }
  function commit(mutate, message) {
    finishLiveEdit();
    heroMotion = null;
    const before = C.clone(doc);
    try {
      mutate();
      if (doc.entities.length > C.MAX_ENTITIES)
        throw new Error('Лимит — 10 000 объектов. Уменьши плотность рисунка.');
      C.assertCategoryLimit(doc);
      if (JSON.stringify(before) === JSON.stringify(doc)) return false;
      history.push(before);
      selected = new Set([...selected].filter((id) => doc.entities.some((e) => e.id === id)));
      save();
      render();
      if (message) toast(message);
      return true;
    } catch (error) {
      doc = before;
      render();
      toast(error.message, true);
      return false;
    }
  }
  function undo() {
    finishLiveEdit();
    heroMotion = null;
    if (!history.past.length) return;
    const previousIndex = doc.configIndex,
      previousFile = doc.fileName;
    doc = history.undo(doc);
    if (previousIndex !== doc.configIndex || previousFile !== doc.fileName) resetGridView();
    selected = new Set([...selected].filter((id) => doc.entities.some((e) => e.id === id)));
    save();
    render();
  }
  function redo() {
    finishLiveEdit();
    heroMotion = null;
    if (!history.future.length) return;
    const previousIndex = doc.configIndex,
      previousFile = doc.fileName;
    doc = history.redo(doc);
    if (previousIndex !== doc.configIndex || previousFile !== doc.fileName) resetGridView();
    selected = new Set([...selected].filter((id) => doc.entities.some((e) => e.id === id)));
    save();
    render();
  }
  function select(ids) {
    selected = new Set(ids);
    renderInspector();
    renderLayers();
    draw();
  }
  function render() {
    const key = `${workspace().w}:${workspace().h}`;
    if (canvasGeometryKey !== key) {
      canvasGeometryKey = key;
      updateZoom();
    }
    $('canvasName').textContent = doc.name;
    $('undoButton').disabled = !history.past.length;
    $('redoButton').disabled = !history.future.length;
    $('objectCount').textContent = doc.entities.length.toLocaleString('ru-RU');
    $('emptyCanvas').hidden = doc.entities.length > 0 || mode === 'draw' || !!gesture;
    renderInspector();
    renderLayers();
    draw();
  }
  function setMode(next) {
    mode = next;
    document
      .querySelector('.mode-tabs')
      .style.setProperty('--tab-index', ['heroes', 'draw', 'image'].indexOf(next));
    document.querySelectorAll('[data-mode]').forEach((b) => {
      const active = b.dataset.mode === next;
      b.setAttribute('aria-selected', active);
      b.tabIndex = active ? 0 : -1;
    });
    for (const name of ['heroes', 'draw', 'image']) $('panel-' + name).hidden = name !== next;
    if (next === 'heroes' || next === 'image') setTool('select', false);
    if (next === 'draw' && ['select', 'hand'].includes(tool)) setTool('pencil', false);
    $('emptyCanvas').hidden = doc.entities.length > 0 || mode === 'draw';
    draw();
  }
  function setTool(next, changeMode = true) {
    if (next === 'gradient') {
      $('brushInput').value = GRADIENT_CHARS;
      $('brushOrder').value = 'gradient';
      renderSymbols();
    }
    referenceEditing = false;
    tool = next;
    if (changeMode && !['select', 'hand', 'text'].includes(next) && mode !== 'draw')
      setMode('draw');
    document.querySelectorAll('[data-tool]').forEach((b) => {
      const active = b.dataset.tool === tool;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', active);
    });
    viewport.classList.toggle('drawing', !['select', 'hand'].includes(tool));
    $('eraserSizeField').hidden = !BRUSH_TOOLS.has(tool);
    $('eraserSizeName').textContent = tool === 'scatter' ? 'Размер кисти' : 'Размер ластика';
    $('scatterField').hidden = tool !== 'scatter';
    if (!BRUSH_TOOLS.has(tool)) eraserHover = null;
    if (tool !== 'line') bendable = null;
    viewport.classList.toggle('panning', tool === 'hand');
    draw();
  }
  function updateZoom() {
    if (preview) {
      const frame = gamePreviewLayout(window.innerWidth, window.innerHeight);
      zoom = frame.scale;
      for (const [key, value] of Object.entries(frame))
        document.documentElement.style.setProperty(
          '--preview-' + key,
          value + (key === 'scale' ? '' : 'px')
        );
    } else if (fit)
      zoom = Math.min(
        (viewport.clientWidth - 18) / workspace().w,
        (viewport.clientHeight - 18) / workspace().h,
        1.5
      );
    if (!preview) zoom = clampZoom(zoom);
    // Rasterize at the displayed size: CSS-only down/upscaling blurs game labels.
    density = Math.min(
      Math.min(window.devicePixelRatio || 1, 2) * zoom,
      Math.sqrt(16000000 / (workspace().w * workspace().h))
    );
    const pixelWidth = Math.round(workspace().w * density),
      pixelHeight = Math.round(workspace().h * density);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.width = workspace().w * zoom + 'px';
    canvas.style.height = workspace().h * zoom + 'px';
    $('stageWrap').style.width = workspace().w * zoom + 'px';
    $('stageWrap').style.height = workspace().h * zoom + 'px';
    if (fit && !preview) {
      viewport.scrollTop = 0;
      viewport.scrollLeft = 0;
    }
    draw();
  }
  function setZoom(value, anchor) {
    if (preview) return;
    const view = viewport.getBoundingClientRect();
    const fixed = anchor || { clientX: view.left + viewport.clientWidth / 2, clientY: view.top + viewport.clientHeight / 2 };
    const before = point(fixed);
    fit = false;
    zoom = clampZoom(value);
    updateZoom();
    const rect = canvas.getBoundingClientRect();
    viewport.scrollLeft += rect.left + before.x / workspace().w * rect.width - fixed.clientX;
    viewport.scrollTop += rect.top + before.y / workspace().h * rect.height - fixed.clientY;
  }
  function zoomBy(factor) {
    setZoom(zoom * factor);
  }
  function loadPortrait(id) {
    if (!heroById.has(id)) return null;
    if (!portraits.has(id)) {
      const img = new Image();
      img.onload = draw;
      img.onerror = () => {
        portraits.set(id, null);
        draw();
      };
      img.src = heroById.get(id).portrait;
      portraits.set(id, img);
    }
    return portraits.get(id);
  }
  function roundRect(x, y, w, h, radius, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.min(radius, w / 2, h / 2));
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }
  function draw() {
    publishUI();
    requestPaint();
  }
  function requestPaint() {
    if (disposed || framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      if (!disposed) paint();
    });
  }
  function paint() {
    let heroesMoving = false;
    if (heroMotion) {
      heroesMoving = advanceHeroMotion(heroMotion, performance.now(), reducedMotion.matches);
      if (!heroMotion.active && !heroesMoving) { heroMotion = null; publishUI(); }
    }
    ctx.setTransform(canvas.width / workspace().w, 0, 0, canvas.height / workspace().h, 0, 0);
    ctx.clearRect(0, 0, workspace().w, workspace().h);
    if (!preview) {
      ctx.fillStyle = '#191821';
      ctx.fillRect(0, 0, workspace().w, workspace().h);
    }
    if (!preview && (workspace().w > C.WIDTH || workspace().h > C.HEIGHT)) {
      ctx.fillStyle = '#07060b4a';
      if (workspace().w > C.WIDTH) ctx.fillRect(C.WIDTH, 0, workspace().w - C.WIDTH, workspace().h);
      if (workspace().h > C.HEIGHT)
        ctx.fillRect(0, C.HEIGHT, Math.min(C.WIDTH, workspace().w), workspace().h - C.HEIGHT);
    }
    if (doc.reference?.src !== referenceSource) {
      if (referenceImage) referenceImage.onload = null;
      referenceSource = doc.reference?.src;
      referenceImage = referenceSource ? new Image() : null;
      if (referenceImage) {
        referenceImage.onload = draw;
        referenceImage.src = referenceSource;
      }
    }
    if (
      !preview &&
      doc.reference?.visible &&
      referenceImage?.complete &&
      referenceImage.naturalWidth
    ) {
      const r = doc.reference;
      ctx.save();
      ctx.globalAlpha = referencePreview?.reference === r ? referencePreview.opacity : r.opacity;
      ctx.drawImage(referenceImage, r.x, r.y, r.w, r.h);
      ctx.restore();
    }
    if (showGrid && !preview) {
      ctx.fillStyle = '#3d4a583d';
      for (let y = 12; y < workspace().h; y += 16)
        for (let x = 12; x < workspace().w; x += 16) ctx.fillRect(x, y, 1.2, 1.2);
    }
    if (!preview) {
      ctx.strokeStyle = '#435a633b';
      ctx.setLineDash([5, 7]);
      ctx.strokeRect(15.5, 15.5, workspace().w - 31, workspace().h - 31);
      ctx.setLineDash([]);
    }
    for (const layer of doc.layers)
      if (layer.visible) for (const e of doc.entities) if (e.layer === layer.id) drawEntity(e);
    if (heroMotion?.active && !preview) {
      const { layout, positions, from, ids, valid } = heroMotion, position = positions[from];
      ctx.save();
      ctx.shadowColor = '#00000090'; ctx.shadowBlur = 12 * zoom * density; ctx.shadowOffsetY = 5 * zoom * density;
      ctx.globalAlpha = valid ? 1 : 0.6;
      drawHeroPortrait(ids[from], position.x, position.y, layout.cardW, layout.cardH);
      ctx.shadowColor = 'transparent'; ctx.strokeStyle = valid ? '#c4b5ed' : '#df9ba9'; ctx.lineWidth = 1.5 / zoom;
      ctx.strokeRect(position.x, position.y, layout.cardW, layout.cardH);
      ctx.restore();
    }
    if (!preview && (workspace().w > C.WIDTH || workspace().h > C.HEIGHT)) {
      ctx.save();
      ctx.strokeStyle = '#c4b5ed';
      ctx.lineWidth = 1.3 / zoom;
      ctx.setLineDash([7 / zoom, 5 / zoom]);
      ctx.strokeRect(0, 0, C.WIDTH, C.HEIGHT);
      ctx.restore();
    }
    if (drawFrame) {
      ctx.save();
      for (const p of drawFrame)
        drawCategoryLabel(ctx, p.ch || brushChar(false), p.x, p.y, '#d6c8f7');
      ctx.restore();
    }
    if (!preview && referenceEditing && doc.reference?.visible) {
      const r = doc.reference, half = 4 / zoom;
      ctx.save(); ctx.strokeStyle = '#c4b5ed'; ctx.lineWidth = 1 / zoom;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      for (const p of referenceHandles(r)) {
        ctx.fillStyle = '#211e29'; ctx.fillRect(p.x-half,p.y-half,half*2,half*2);
        ctx.strokeRect(p.x-half,p.y-half,half*2,half*2);
      }
      ctx.restore();
    }
    if (!preview) {
      const items = selection().filter((e) => doc.layers.find((l) => l.id === e.layer)?.visible);
      if (items.length) {
        const b = activeSelectionFrame(items),
          center = C.frameCenter(b);
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(((b.rotation || 0) * Math.PI) / 180);
        ctx.translate(-center.x, -center.y);
        ctx.strokeStyle = '#c4b5ed';
        ctx.lineWidth = 1.5 / zoom;
        // A hairline off the glyphs, so the frame never covers what it selects.
        const gap = 2 / zoom;
        ctx.strokeRect(b.x - gap, b.y - gap, b.w + gap * 2, b.h + gap * 2);
        const handle = 6 / zoom;
        for (const [x, y] of resizable(items) ? [
          [b.x, b.y],
          [b.x + b.w, b.y],
          [b.x, b.y + b.h],
          [b.x + b.w, b.y + b.h]
        ] : []) {
          ctx.fillStyle = '#211e29';
          ctx.fillRect(x - handle / 2, y - handle / 2, handle, handle);
          ctx.strokeRect(x - handle / 2, y - handle / 2, handle, handle);
        }
        if (gesture?.type === 'rotate') {
          ctx.beginPath();
          ctx.moveTo(center.x - 5 / zoom, center.y);
          ctx.lineTo(center.x + 5 / zoom, center.y);
          ctx.moveTo(center.x, center.y - 5 / zoom);
          ctx.lineTo(center.x, center.y + 5 / zoom);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (gesture?.type === 'marquee') {
        const b = box(gesture.start, gesture.current);
        ctx.fillStyle = '#c4b5ed18';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = '#c4b5ed';
        ctx.lineWidth = 1 / zoom;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }
      if (gesture?.type === 'lasso') {
        ctx.beginPath();
        gesture.path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.fillStyle = '#c4b5ed18';
        ctx.fill();
        ctx.strokeStyle = '#c4b5ed';
        ctx.lineWidth = 1 / zoom;
        ctx.setLineDash([5 / zoom, 4 / zoom]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (BRUSH_TOOLS.has(tool) && eraserHover) drawEraserRing(eraserHover);
      if (!gesture || gesture.type === 'bend') drawBendHandle();
      if (guideFades.size || (gesture?.type === 'move' && gesture.guides?.length)) drawGuides(gesture?.type === 'move' ? gesture.guides || [] : []);
    }
    if (heroesMoving) requestPaint();
  }
  // The handle in the middle of the line just drawn: pull it to bend the line.
  function drawBendHandle() {
    const line = bendableNow();
    if (!line) return;
    const { x, y } = line.through;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, 6 / zoom, 0, Math.PI * 2);
    ctx.fillStyle = '#c4b5ed'; ctx.fill();
    ctx.lineWidth = 2 / zoom; ctx.strokeStyle = '#15141a'; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 9 / zoom, 0, Math.PI * 2);
    ctx.lineWidth = 1 / zoom; ctx.strokeStyle = '#efeaf5aa'; ctx.stroke();
    ctx.restore();
  }
  const onBendHandle = (p) => { const line = bendableNow(); return !!line && Math.hypot(p.x - line.through.x, p.y - line.through.y) <= 11 / zoom; };
  function bendTo(p) {
    const line = bendable;
    const points = centerBrushPoints(drawingPoints('pencil', bentLine(line.a, line.b, p), line.settings, line.seed, false, frameStyle, workspace()), ink);
    doc.entities = doc.entities.filter((e) => !line.ids.includes(e.id));
    const made = points.map((q) => C.entity(doc, { type: 'symbol', text: q.ch, name: q.ch, x: q.x, y: q.y, w: 30, h: 30, layer: line.layer }));
    doc.entities.push(...made);
    line.ids = made.map((e) => e.id); line.through = { ...p }; line.signature = bendSignature(line.ids);
  }
  // «Распыление»: the brush throws what it touches along the stroke, a point every half radius.
  function scatterSettings() {
    return { distance: Number($('scatterDistance').value) / 10, spread: Number($('scatterSpread').value) };
  }
  function scatterAt(p, direction = null) {
    const radius = eraserSize / 2, from = gesture.last, dx = p.x - from.x, dy = p.y - from.y, length = Math.hypot(dx, dy);
    if (!direction) {
      if (length < 2 / zoom) return;
      const step = { x: dx / length, y: dy / length }, previous = gesture.direction;
      const mixed = previous ? { x: previous.x * 0.6 + step.x * 0.4, y: previous.y * 0.6 + step.y * 0.4 } : step, norm = Math.hypot(mixed.x, mixed.y) || 1;
      gesture.direction = { x: mixed.x / norm, y: mixed.y / norm };
    }
    const heading = direction || gesture.direction, settings = scatterSettings(), steps = Math.max(1, Math.ceil(length / Math.max(2, radius / 2)));
    for (let i = 1; i <= steps; i++)
      scatterSymbols(doc, { x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps }, radius, heading, { ...settings, seed: gesture.seed, thrown: gesture.thrown, ink });
    gesture.last = { ...p }; gesture.moved = true;
  }
  // Photoshop-style brush outline: the ring is exactly the area eraseSymbols clears (eraser-size.mjs drawBrushRing).
  function drawEraserRing(p) {
    drawBrushRing(ctx, p, eraserSize / 2, 1 / zoom, performance.now() < eraserLabelUntil ? `${Math.round(eraserSize)} px` : '');
  }
  function setEraserSize(value) {
    eraserSize = clampEraser(value);
    $('eraserSize').value = Math.round(eraserSize);
    $('eraserSizeValue').textContent = `${Math.round(eraserSize)} px`;
    storeEraserSize(eraserSize);
    eraserLabelUntil = performance.now() + 900;
    clearTimeout(eraserLabelTimer);
    eraserLabelTimer = setTimeout(requestPaint, 950);
    requestPaint();
  }
  function drawHeroPortrait(id, x, y, width, height) {
    const img = loadPortrait(id);
    ctx.fillStyle = '#202831'; ctx.fillRect(x, y, width, height);
    if (img?.complete && img.naturalWidth) {
      ctx.filter = 'saturate(0.7)';
      ctx.drawImage(img, ...portraitSourceRect(img, width, height, heroById.get(id)?.portraitCrop), x, y, width, height);
      ctx.filter = 'none';
    }
  }
  function drawEntity(e) {
    if (e.rotation) prepareTextMetrics([e]);
    const b = C.bounds([e], true);
    if (b.x + b.w < 0 || b.y + b.h < 0 || b.x > workspace().w || b.y > workspace().h) return;
    ctx.save();
    if (e.type === 'heroes') {
      // A selected group shows its list area, as in Dota's edit mode; otherwise the group
      // looks as in the game: its title and heroes only.
      if (!preview && selected.has(e.id)) {
        ctx.fillStyle = '#0000004d';
        ctx.fillRect(e.x, e.y + DOTA.header, e.w, e.h);
      }
      // Titles may overflow their list width in Panorama. Do not squeeze them.
      drawCategoryLabel(ctx, e.name, e.x, e.y);
      const motion = heroMotion?.groupId === e.id ? heroMotion : null;
      const best = motion?.layout || heroLayoutFor(e);
      ctx.beginPath();
      ctx.rect(e.x, e.y + DOTA.header, e.w, e.h);
      ctx.clip();
      if (best)
        (motion?.ids || e.heroIds).forEach((id, i) => {
          if (motion?.active && i === motion.from) return;
          const x = motion ? motion.positions[i].x : e.x + best.left + (i % best.cols) * best.stepX,
            y = motion ? motion.positions[i].y : e.y + best.top + Math.floor(i / best.cols) * best.stepY;
          drawHeroPortrait(id, x, y, best.cardW, best.cardH);
        });
      if (motion?.active) {
        const slot = motion.slots[motion.to];
        ctx.fillStyle = '#c4b5ed14'; ctx.fillRect(slot.x, slot.y, best.cardW, best.cardH);
        ctx.strokeStyle = '#c4b5ed'; ctx.lineWidth = 1 / zoom; ctx.setLineDash([4 / zoom, 3 / zoom]);
        ctx.strokeRect(slot.x, slot.y, best.cardW, best.cardH); ctx.setLineDash([]);
      }
    } else {
      for (const glyph of C.textGlyphs(e)) drawCategoryLabel(ctx, glyph.text, glyph.x, glyph.y);
    }
    ctx.restore();
  }
  // Figma-style: several objects align to each other, a single object to the canvas.
  function alignSection(items) {
    const count = selectionUnits(doc, items).length;
    const buttons = (actions) => actions.map(([action, label, icon]) => `<button data-action="${action}" title="${label}" aria-label="${label}">${alignIconSVG(icon)}</button>`).join('');
    return `<label class="field-label">${count > 1 ? 'Выровнять объекты' : 'Выровнять по холсту'}</label><div class="align-actions">${buttons(ALIGN_ACTIONS)}</div>${count > 2 ? `<div class="align-actions">${buttons(DISTRIBUTE_ACTIONS)}</div>` : ''}`;
  }
  // Replace one character (or all) across the selected symbols and text, e.g. dots to hearts.
  function openReplaceGlyphs() {
    const counts = glyphCounts(editableSelection());
    if (!counts.length) {
      toast('В выделении нет символов.', true);
      return;
    }
    const total = counts.reduce((sum, [, n]) => sum + n, 0);
    const brush = Array.from($('brushInput')?.value || '').find((ch) => !/\s/u.test(ch)) || '♥';
    openModal(
      'Заменить символы',
      `<label class="field-label" for="replaceFrom">Что заменить</label><select id="replaceFrom">${counts.length > 1 ? `<option value="">Все символы · ${total}</option>` : ''}${counts
        .slice(0, 60)
        .map(([ch, n]) => `<option value="${esc(ch)}">${esc(ch)} · ${n}</option>`)
        .join('')}</select><label class="field-label" for="replaceTo">На какой символ</label><input id="replaceTo" class="glyph-replace-to" value="${esc(brush)}" maxlength="8"><p class="hint">Позиции символов не меняются. Отменить — Ctrl+Z.</p>`,
      '<button class="button secondary" data-close>Отмена</button><button id="replaceGlyphs" class="button primary">Заменить</button>'
    );
    const replace = () => {
      const to = $('replaceTo').value, from = $('replaceFrom').value;
      let count = 0, failed = true;
      // commit() restores the document and reports the error itself when replacing throws.
      const changed = commit(() => {
        const targets = editableSelection();
        count = replaceGlyphs(targets, from, to);
        failed = false;
        for (const item of targets)
          if (item.type !== 'heroes' && typeof item.text === 'string') {
            item.type = Array.from(item.text).length === 1 ? 'symbol' : 'text';
            if (item.type === 'text' && !C.normalizeAngle(item.rotation || 0))
              item.w = Math.max(30, measureCategoryText(ctx, item.text).advances.reduce((a, b) => a + b, 0) + 30);
          }
        prepareTextMetrics(targets);
      });
      if (failed) return;
      closeModal();
      toast(changed ? `Заменено символов: ${count}` : 'Нечего заменять: символы уже такие.');
    };
    $('replaceGlyphs').onclick = replace;
    $('replaceTo').onkeydown = (event) => {
      if (event.key === 'Enter') replace();
    };
    $('replaceTo').focus();
    $('replaceTo').select();
  }
  // Whole artwork layers (groups or ASCII) inside a selection.
  function wholeArtworkLayers(items) {
    const chosen = new Set(items.map((e) => e.id));
    return [...new Set(items.map((e) => e.layer))].filter((id) =>
      doc.layers.find((l) => l.id === id)?.kind === 'artwork' && doc.entities.every((e) => e.layer !== id || chosen.has(e.id)));
  }
  // A rectangle takes whole groups and ASCII art, like Figma; Alt + rectangle and the lasso pick parts.
  function expandGroups(ids) {
    const groups = new Set(doc.layers.filter((l) => l.kind === 'artwork').map((l) => l.id));
    const touched = new Set(doc.entities.filter((e) => ids.has(e.id) && groups.has(e.layer)).map((e) => e.layer));
    if (!touched.size) return ids;
    return new Set([...ids, ...doc.entities.filter((e) => touched.has(e.layer) && editable(e)).map((e) => e.id)]);
  }
  // Other objects the dragged selection can snap to: groups and ASCII layers count as one frame.
  function guideFrames() {
    const moving = new Set(selected), frames = [], layers = new Map();
    const artwork = new Set(doc.layers.filter((l) => l.kind === 'artwork').map((l) => l.id));
    const visible = new Set(doc.layers.filter((l) => l.visible).map((l) => l.id));
    for (const e of doc.entities) {
      if (moving.has(e.id) || !visible.has(e.layer)) continue;
      if (artwork.has(e.layer)) layers.set(e.layer, [...(layers.get(e.layer) || []), e]);
      else frames.push(frameOf([e]));
    }
    for (const items of layers.values()) frames.push(frameOf(items));
    return frames;
  }
  // Smart guides fade in and out (about 0.1 s) instead of blinking, in the selection's
  // lavender rather than a loud magenta. `current` are the guides of this frame.
  const guideFades = new Map();
  let guideClock = 0;
  function drawGuides(current) {
    // At most one frame's worth per paint: after an idle pause the fade still takes ~0.1 s.
    const now = performance.now(), step = reducedMotion.matches ? 1 : 1 - Math.exp(-Math.min(32, Math.max(0, now - (guideClock || now))) / 45);
    guideClock = now;
    for (const fade of guideFades.values()) fade.target = 0;
    for (const g of current) {
      const key = `${g.axis}:${g.v.toFixed(2)}`, fade = guideFades.get(key);
      if (fade) Object.assign(fade, { from: g.from, to: g.to, target: 1 });
      else guideFades.set(key, { ...g, alpha: reducedMotion.matches ? 1 : 0, target: 1 });
    }
    let moving = false;
    ctx.save();
    ctx.strokeStyle = '#c4b5ed';
    ctx.lineCap = 'round';
    for (const [key, fade] of guideFades) {
      fade.alpha += (fade.target - fade.alpha) * step;
      if (Math.abs(fade.target - fade.alpha) < 0.02) fade.alpha = fade.target;
      else moving = true;
      if (!fade.alpha) { guideFades.delete(key); continue; }
      const tick = 3 / zoom;
      ctx.globalAlpha = fade.alpha * 0.85;
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      if (fade.axis === 'x') {
        ctx.moveTo(fade.v, fade.from); ctx.lineTo(fade.v, fade.to);
        ctx.moveTo(fade.v - tick, fade.from); ctx.lineTo(fade.v + tick, fade.from);
        ctx.moveTo(fade.v - tick, fade.to); ctx.lineTo(fade.v + tick, fade.to);
      } else {
        ctx.moveTo(fade.from, fade.v); ctx.lineTo(fade.to, fade.v);
        ctx.moveTo(fade.from, fade.v - tick); ctx.lineTo(fade.from, fade.v + tick);
        ctx.moveTo(fade.to, fade.v - tick); ctx.lineTo(fade.to, fade.v + tick);
      }
      ctx.stroke();
    }
    ctx.restore();
    if (moving) requestPaint();
    else if (!guideFades.size) guideClock = 0;
  }
  function arrangeState() {
    const items = editableSelection();
    if (!items.length) return { units: 0, canGroup: false, canUngroup: false, rotation: [], canReplace: false };
    const units = selectionUnits(doc, items).length, layers = wholeArtworkLayers(items);
    const heroes = items.some((e) => e.type === 'heroes');
    return {
      units,
      canGroup: units > 1,
      canUngroup: layers.length > 0,
      rotation: canRotateSelection() ? [-90, -45, 45, 90, 180] : heroes && (units > 1 || items.length === 1) ? [-90, 90, 180] : [],
      canReplace: glyphCounts(items).length > 0
    };
  }
  function numericField(key, label, value, disabled) {
    return `<label class="input-unit number-field"><span>${key === 'rotation' ? '∠' : label}</span><input data-property="${key}" aria-label="${label}" type="number" step="${key === 'rotation' ? '0.1' : '1'}" value="${Math.round(value * 100) / 100}" ${disabled ? 'disabled' : ''}>${numberButtons(label)}</label>`;
  }
  listen(document, 'pointerdown', (event) => {
    if (event.target.closest('[data-number-step]')) event.preventDefault();
  });
  listen(document, 'click', (event) => {
    const button = event.target.closest('[data-number-step]');
    if (!button) return;
    const input = button.closest('.number-field')?.querySelector('input');
    if (!input || input.disabled || input.readOnly) return;
    input.focus({ preventScroll: true });
    stepNumber(input, Number(button.dataset.numberStep), event.shiftKey ? 10 : 1);
    input.blur();
  });
  function finishLiveEdit() {
    if (!liveEdit) return;
    const { before } = liveEdit;
    liveEdit = null;
    if (JSON.stringify(before) !== JSON.stringify(doc)) history.push(before);
    $('undoButton').disabled = !history.past.length;
    $('redoButton').disabled = !history.future.length;
  }
  function bindLiveText(input, apply) {
    if (!input) return;
    input.oninput = () => {
      if (!liveEdit) liveEdit = { input, before: C.clone(doc) };
      try {
        apply(input.value);
        prepareTextMetrics(selection());
        C.assertCategoryLimit(doc);
        // Keep the input node and caret intact while refreshing the artwork and layer names.
        save();
        renderLayers();
        draw();
        $('undoButton').disabled = false;
        $('redoButton').disabled = true;
        const items = selection(),
          b = C.bounds(items);
        $('inspectorContent')
          .querySelectorAll('[data-property]')
          .forEach((field) => {
            const key = field.dataset.property;
            const value = key === 'rotation' ? C.selectionFrame(items).rotation : b[key];
            field.value = Math.round(value * 100) / 100;
          });
      } catch (error) {
        doc = liveEdit.before;
        liveEdit = null;
        save();
        render();
        toast(error.message, true);
      }
    };
    input.onblur = finishLiveEdit;
    input.onkeydown = (event) => {
      if (event.key === 'Enter' && (input.tagName !== 'TEXTAREA' || event.ctrlKey || event.metaKey)) input.blur();
      if (event.key === 'Escape' && liveEdit) {
        doc = liveEdit.before;
        liveEdit = null;
        save();
        render();
      }
    };
  }
  function renderInspector() {
    const signature = [...selected].join(',');
    const selectionChanged = signature !== inspectorSelection;
    if (!selectionChanged && inspectorDocument === doc && (liveEdit?.input === document.activeElement ||
        ['objectName', 'artworkName'].includes(document.activeElement?.id))) return;
    finishLiveEdit();
    if (selectionChanged) {
      $('inspectorContent').scrollTop = 0;
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        $('inspectorContent').animate(
          [
            { opacity: 0.4, transform: 'translateY(5px)' },
            { opacity: 1, transform: 'translateY(0)' }
          ],
          { duration: 180, easing: 'ease-out' }
        );
    }
    inspectorSelection = signature;
    inspectorDocument = doc;
    const items = selection(),
      e = items[0],
      locked = items.some((e) => !editable(e));
    $('selectionCount').textContent = items.length ? `${items.length} выбрано` : 'Холст';
    if (!items.length) {
      $('inspectorContent').innerHTML =
        `<h3>Настройки холста</h3><label class="field-label">Размер рабочей области</label><div class="field-pair"><div class="input-unit number-field"><span>W</span><input data-canvas-axis="w" type="number" min="100" max="6000" step="1" aria-label="Ширина холста" value="${workspace().w}">${numberButtons('ширину холста')}<span class="unit">px</span></div><div class="input-unit number-field"><span>H</span><input data-canvas-axis="h" type="number" min="100" max="6000" step="1" aria-label="Высота холста" value="${workspace().h}">${numberButtons('высоту холста')}<span class="unit">px</span></div></div><p id="canvasSizeError" class="canvas-size-note" role="alert" hidden></p><button id="resetCanvasSize" class="button secondary full compact">Вернуть 1193 × 593</button><button id="loadFont" class="button secondary full compact" style="margin-top:5px">Сменить шрифт холста</button><p class="inspector-hint">${icon('shield')}<span>Radiance SemiBold · шрифт сетки Dota 2.</span></p>`;
      $('resetCanvasSize').onclick = () => resizeCanvas({ w: C.WIDTH, h: C.HEIGHT });
      $('inspectorContent')
        .querySelectorAll('[data-canvas-axis]')
        .forEach((input) => {
          input.onkeydown = (event) => {
            if (event.key === 'Enter') input.blur();
            if (event.key === 'Escape') input.value = workspace()[input.dataset.canvasAxis];
          };
          input.onblur = (event) => {
            const nextFocus = event.relatedTarget?.dataset.canvasAxis;
            try {
              const size = {
                w: Number(document.querySelector('[data-canvas-axis="w"]').value),
                h: Number(document.querySelector('[data-canvas-axis="h"]').value)
              };
              const changed = resizeCanvas(size);
              if (!changed) $('canvasSizeError').hidden = true;
              if (nextFocus)
                document
                  .querySelector(`[data-canvas-axis="${nextFocus}"]`)
                  ?.focus({ preventScroll: true });
            } catch (error) {
              $('canvasSizeError').hidden = false;
              $('canvasSizeError').textContent = error.message;
            }
          };
        });
      $('loadFont').onclick = () => $('fontInput').click();
      return;
    }
    const b = C.bounds(items),
      rotatable =
        items.every((item) => item.type !== 'heroes') &&
        (items.length > 1 || Array.from(e.text || '').filter((ch) => !/\s/u.test(ch)).length > 1),
      artLayer = doc.layers.find((l) => l.id === e.layer && l.kind === 'artwork'),
      wholeArtwork =
        artLayer &&
        items.every((item) => item.layer === artLayer.id) &&
        doc.entities.filter((item) => item.layer === artLayer.id).length === items.length;
    $('inspectorContent').innerHTML =
      `<h3>${wholeArtwork ? (artLayer.group ? 'Группа' : 'ASCII-слой') : items.length === 1 ? (e.type === 'heroes' ? 'Группа героев' : e.type === 'symbol' ? 'Символ' : 'Текст') : 'Выделение объектов'}</h3>${wholeArtwork ? `<label class="field-label" for="artworkName">Название слоя</label><input id="artworkName" value="${esc(artLayer.name)}" maxlength="200" ${locked ? 'disabled' : ''}>` : items.length === 1 ? `<label class="field-label" for="objectName">${e.type === 'heroes' ? 'Название группы' : 'Текст / символ'}</label><textarea id="objectName" rows="3" maxlength="5000" ${locked ? 'disabled' : ''}>${esc(e.type === 'heroes' ? e.name : e.text)}</textarea>` : `<p class="hint">${items.length} объектов · перемещай и изменяй вместе</p>`}<label class="field-label">Позиция</label><div class="field-pair">${numericField('x', 'X', b.x, locked)}${numericField('y', 'Y', b.y, locked)}</div><label class="field-label">Размер</label><div class="field-pair">${numericField('w', 'W', b.w, locked)}${numericField('h', 'H', b.h, locked)}</div>${rotatable ? `<label class="field-label">Поворот расположения</label>${numericField('rotation', 'Угол, °', C.selectionFrame(items).rotation, locked)}<p class="hint">Символы остаются прямыми. Shift — шаг 15°. Быстрый поворот — правой кнопкой мыши.</p>` : ''}${alignSection(items)}<label class="field-label" for="objectLayer">Слой</label><select id="objectLayer" ${locked ? 'disabled' : ''}>${doc.layers.map((l) => `<option value="${l.id}" ${l.id === e.layer ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select><div class="selection-actions"><button class="icon-button" data-action="duplicate" title="Дублировать (Ctrl+D)" aria-label="Дублировать">${icon('copy')}</button><button class="icon-button" data-action="center" title="По центру холста" aria-label="По центру холста">${icon('align')}</button><button class="icon-button" data-action="flip" title="Отразить позиции по горизонтали" aria-label="Отразить позиции по горизонтали">${icon('flip')}</button><button class="icon-button" data-action="rotate" title="${rotatable ? 'Повернуть на 90°' : 'Повернуть расположение на 90°'}" aria-label="${rotatable ? 'Повернуть на 90 градусов' : 'Повернуть расположение на 90 градусов'}">${icon('rotate')}</button><button class="icon-button danger" data-action="delete" title="Удалить (Delete)" aria-label="Удалить">${icon('trash')}</button></div>${locked ? '<p class="hint">Слой заблокирован или скрыт. Открой его в списке слоёв для редактирования.</p>' : ''}${items.length === 1 && e.type === 'heroes' ? `<div class="hero-chips">${e.heroIds.map((id, i) => `<span class="hero-chip" data-hero-order="${i}" tabindex="${locked ? -1 : 0}" role="group" aria-label="${esc(heroById.get(id)?.name || id)}: ${i + 1} из ${e.heroIds.length}" aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight">${heroById.has(id) ? `<img src="${heroById.get(id)?.thumbnail || `assets/heroes/${id}.webp`}" alt="">` : ''}${esc(heroById.get(id)?.name || '#' + id)}<button data-remove-hero="${i}" aria-label="Убрать ${esc(heroById.get(id)?.name || id)}" ${locked ? 'disabled' : ''}>×</button></span>`).join('')}</div><button id="editGroupHeroes" class="button secondary full compact" ${locked ? 'disabled' : ''}>+ Выбрать героев</button><p class="hint">Перетаскивай портреты, чтобы менять порядок. С клавиатуры: выбери героя в списке и нажми Alt + ← / →. Всю группу можно двигать за название или свободное место; Shift сохраняет пропорции при изменении размера.</p>` : ''}`;
    if (wholeArtwork && items.length === 1)
      $('artworkName').insertAdjacentHTML(
        'afterend',
        `<label class="field-label" for="objectName">Текст / символ</label><input id="objectName" value="${esc(e.text)}" maxlength="5000" ${locked ? 'disabled' : ''}>`
      );
    bindLiveText($('artworkName'), (value) => {
      artLayer.name = value || 'Рисунок';
    });
    if ($('editGroupHeroes')) $('editGroupHeroes').onclick = () => openHeroPicker(e.id);
    bindLiveText($('objectName'), (value) => {
      if (e.type === 'heroes') e.name = value;
      else {
        e.text = value;
        e.name = value;
        e.type = Array.from(value).length === 1 ? 'symbol' : 'text';
        if (e.rowGlyphs) {
          const chars = Array.from(value);
          if (chars.length === e.rowGlyphs.length && chars.every((ch) => !/[\r\n]/.test(ch)))
            e.rowGlyphs.forEach((g, i) => (g.text = chars[i]));
          else {
            delete e.rowGlyphs;
            e.w = Math.max(
              30,
              measureCategoryText(ctx, value).advances.reduce((a, b) => a + b, 0) + 30
            );
          }
          delete e.rowText;
        }
        delete e.textMetrics;
      }
    });
    $('inspectorContent')
      .querySelectorAll('[data-property]')
      .forEach((input) => {
        input.onkeydown = (event) => {
          if (event.key === 'Enter') input.blur();
        };
        input.onchange = () => {
          const key = input.dataset.property,
            value = Number(input.value),
            b = C.bounds(items);
          if (
            !input.value.trim() ||
            !Number.isFinite(value) ||
            Math.abs(value) > 10000 ||
            ((key === 'w' || key === 'h') && value < 1)
          ) {
            toast('Введи допустимое число. Размер должен быть больше нуля.', true);
            renderInspector();
            return;
          }
          const changed = commit(() => {
            if (key === 'rotation') {
              prepareTextMetrics(items);
              const frame = frameOf(items);
              const rotated = C.rotateItems(items, frame, value - frame.rotation);
              items.forEach((item, index) => Object.assign(item, rotated[index]));
              moveItems(items);
              return;
            }
            for (const item of items) {
              if (key === 'x' || key === 'y') item[key] += value - b[key];
              else {
                const position = key === 'w' ? 'x' : 'y',
                  ratio = value / Math.max(1, b[key]);
                item[position] = b[position] + (item[position] - b[position]) * ratio;
                item[key] = Math.max(1, item[key] * ratio);
                if (item.rowGlyphs) {
                  for (const g of item.rowGlyphs) {
                    if (key === 'w') {
                      g.x *= ratio;
                      g.w *= ratio;
                    } else g.h *= ratio;
                  }
                  delete item.rowText;
                }
              }
            }
            moveItems(items);
          });
          if (!changed) renderInspector();
        };
      });
    $('objectLayer').onchange = (event) => {
      const layer = doc.layers.find((l) => l.id === event.target.value);
      if (layer.locked || !layer.visible) {
        toast('Сначала открой и разблокируй целевой слой.', true);
        renderInspector();
        return;
      }
      commit(() => items.forEach((item) => (item.layer = layer.id)));
    };
    $('inspectorContent').querySelectorAll('[data-hero-order]').forEach(chip => {
      chip.onkeydown = event => {
        if (event.target !== chip || !event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const from = Number(chip.dataset.heroOrder), to = from + (event.key === 'ArrowLeft' ? -1 : 1);
        if (reorderGroupHero(e.id, from, to)) requestAnimationFrame(() => {
          $('inspectorContent').querySelector(`[data-hero-order="${to}"]`)?.focus({ preventScroll: true });
        });
      };
    });
    $('inspectorContent')
      .querySelectorAll('[data-action]')
      .forEach((button) => {
        button.disabled = locked;
        button.onclick = () => selectionAction(button.dataset.action);
      });
    $('inspectorContent')
      .querySelectorAll('[data-remove-hero]')
      .forEach(
        (button) =>
          (button.onclick = () =>
            commit(() => e.heroIds.splice(Number(button.dataset.removeHero), 1)))
      );
  }
  function renderLayers() {
    publishUI();
  }
  function addGroup(
    point = { x: 80 + doc.entities.filter((e) => e.type === 'heroes').length * 24, y: 110 }
  ) {
    const layer = doc.layers.find((l) => l.id === 'heroes');
    if (layer.locked || !layer.visible) {
      toast('Открой и разблокируй слой «Герои».', true);
      return;
    }
    commit(() => {
      const e = C.entity(doc, {
        type: 'heroes',
        name: 'НОВАЯ КАТЕГОРИЯ',
        x: C.clamp(point.x, 0, Math.max(0, workspace().w - 340)),
        y: C.clamp(point.y, 0, Math.max(0, workspace().h - 195)),
        w: 340,
        h: 195,
        layer: 'heroes'
      });
      doc.entities.push(e);
      selected = new Set([e.id]);
    });
    setTool('select');
  }
  function addHero(id, point) {
    let group = point ? hit(point) : selection().find((e) => e.type === 'heroes');
    if (group?.type !== 'heroes') group = null;
    const layer = doc.layers.find((l) => l.id === 'heroes');
    if ((group && !editable(group)) || (!group && (layer.locked || !layer.visible))) {
      toast('Эта группа заблокирована. Разблокируй слой.', true);
      return;
    }
    if (group?.heroIds.includes(id)) {
      toast('Этот герой уже есть в выбранной группе');
      return;
    }
    commit(() => {
      if (!group) {
        const p = point || { x: 80, y: 110 };
        group = C.entity(doc, {
          type: 'heroes',
          name: 'НОВАЯ КАТЕГОРИЯ',
          x: C.clamp(p.x, 0, Math.max(0, workspace().w - 340)),
          y: C.clamp(p.y, 0, Math.max(0, workspace().h - 195)),
          w: 340,
          h: 195,
          layer: 'heroes'
        });
        doc.entities.push(group);
      }
      group.heroIds.push(id);
      selected = new Set([group.id]);
    });
    setTool('select');
  }
  function copySelection() {
    if (!selected.size) return;
    clipboard = C.clone(selection());
    clipboardArtwork = C.clone(
      doc.layers.filter(
        (layer) => layer.kind === 'artwork' && clipboard.some((e) => e.layer === layer.id)
      )
    );
    toast('Выделение скопировано');
    publishUI();
  }

  function pasteSelection(anchor) {
    if (!clipboard.length) return;
    const bounds = C.bounds(clipboard, true),
      dx = anchor ? anchor.x - bounds.x : 20,
      dy = anchor ? anchor.y - bounds.y : 20;
    commit(() => {
      const copies = [];
      const artworkIds = new Set(clipboardArtwork.map((layer) => layer.id));
      for (const layer of clipboardArtwork) {
        const inputs = clipboard
          .filter((e) => e.layer === layer.id)
          .map((e) => ({ ...e, x: e.x + dx, y: e.y + dy }));
        const pasted = C.addArtwork(doc, inputs, layer.name);
        if (layer.group) pasted.layer.group = true;
        copies.push(...pasted.items);
      }
      const ordinary = clipboard
        .filter((e) => !artworkIds.has(e.layer))
        .map((e) => {
          const copy = C.clone(e);
          delete copy.id;
          const layer = doc.layers.find((l) => l.id === copy.layer);
          if (layer.locked || !layer.visible)
            throw new Error('Слой вставки скрыт или заблокирован.');
          return C.entity(doc, { ...copy, x: copy.x + dx, y: copy.y + dy });
        });
      doc.entities.push(...ordinary);
      copies.push(...ordinary);
      selected = new Set(copies.map((e) => e.id));
    });
  }

  function selectionAction(action) {
    const items = editableSelection();
    if (!items.length) return;
    const b = C.bounds(items, true);
    const changed = commit(() => {
      if (action.startsWith('align-'))
        alignUnits(selectionUnits(doc, items), { center: 'hcenter' }[action.slice(6)] || action.slice(6), workspace(), frameOf);
      if (action.startsWith('distribute-')) distributeUnits(selectionUnits(doc, items), action.slice(11), frameOf);
      if (action === 'group') C.groupEntities(doc, items.map((e) => e.id));
      if (action === 'ungroup') C.ungroupLayers(doc, wholeArtworkLayers(items));
      if (action === 'delete') {
        const ids = new Set(items.map((e) => e.id));
        doc.entities = doc.entities.filter((e) => !ids.has(e.id));
        selected.clear();
      }
      if (action === 'duplicate') {
        const sourceLayer = doc.layers.find((l) => l.id === items[0].layer && l.kind === 'artwork');
        const wholeLayer =
          sourceLayer &&
          items.every((e) => e.layer === sourceLayer.id) &&
          doc.entities.filter((e) => e.layer === sourceLayer.id).length === items.length;
        const inputs = items.map((e) => ({ ...C.clone(e), x: e.x + 20, y: e.y + 20 }));
        const added = wholeLayer ? C.addArtwork(doc, inputs, sourceLayer.name) : null;
        if (added && sourceLayer.group) added.layer.group = true;
        const copies = added ? added.items : inputs.map((e) => C.entity(doc, e));
        if (!wholeLayer) doc.entities.push(...copies);
        selected = new Set(copies.map((e) => e.id));
      }
      if (action === 'center')
        for (const e of items) {
          e.x += (workspace().w - b.w) / 2 - b.x;
          e.y += (workspace().h - b.h) / 2 - b.y;
        }
      if (action === 'flip' || action.startsWith('flip-')) {
        prepareTextMetrics(items);
        const reflected = reflectItems(
          doc,
          new Set(items.map((e) => e.id)),
          action === 'flip-vertical' ? 'vertical' : 'horizontal'
        );
        selected = new Set(reflected.map((e) => e.id));
      }
      // "rotate" is the classic quarter turn; "rotate:-45" etc. come from the quick-turn buttons.
      const turn = action === 'rotate' ? 90 : /^rotate:-?\d+$/.test(action) ? Number(action.slice(7)) : null;
      if (turn !== null && items.every((item) => item.type !== 'heroes')) {
        prepareTextMetrics(items);
        const rotated = C.rotateItems(items, frameOf(items), turn);
        items.forEach((item, index) => Object.assign(item, rotated[index]));
      } else if (turn !== null && turn % 90 === 0)
        // Hero cards stay upright, so groups turn by whole quarters: positions rotate, boxes transpose.
        for (let n = (((turn / 90) % 4) + 4) % 4; n > 0; n--) {
          const frame = C.bounds(items, true);
          for (const e of items) {
            const x = e.x,
              y = e.y,
              w = e.w;
            e.x = frame.x + frame.w / 2 - (y - frame.y - frame.h / 2) - e.h;
            e.y = frame.y + frame.h / 2 + (x - frame.x - frame.w / 2);
            e.w = e.h;
            e.h = w;
          }
        }
      if (['center', 'flip'].includes(action) || turn !== null) moveItems(items);
    });
    if (changed && action === 'group') toast('Объединено в группу · Alt + клик — объект внутри');
    if (changed && action === 'ungroup') toast('Группа разъединена');
  }
  function point(event) {
    return canvasPoint(event, canvas.getBoundingClientRect(), workspace());
  }
  function snapped(p) {
    return snapPoint(p, snap);
  }
  function box(a, b) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(a.x - b.x),
      h: Math.abs(a.y - b.y)
    };
  }
  function hit(p) {
    return hitItem(doc, p, ink, 3 / zoom);
  }
  // A selected group is in Dota's edit mode: its «+» card is one more item of the list.
  function heroLayoutFor(group) {
    return !preview && selected.has(group.id) ? editLayout(group) : C.heroLayout(group);
  }

  const inkCache = new Map();
  function ink(text) {
    if (!inkCache.has(text)) inkCache.set(text, measureCategoryInk(ctx, text));
    return inkCache.get(text);
  }
  // What the user sees and grabs: glyph ink, not the 30px category boxes of text and symbols.
  function frameOf(items) {
    return inkFrame(items, ink);
  }
  // A lone symbol or text row has the game font's size: it moves and turns, but has nothing
  // to resize. Several glyphs spread apart; hero groups change their list size.
  function resizable(items) {
    return items.length > 1 || items.some((item) => item.type === 'heroes');
  }
  function selectionHandle(items, frame, p) {
    const handle = C.transformHandle(frame, p, zoom, canRotateSelection());
    return handle?.type === 'resize' && !resizable(items) ? null : handle;
  }
  function brushSettings() {
    return {
      chars: $('brushInput').value,
      order: $('brushOrder').value,
      step: Number($('brushStep').value),
      dynamics: $('brushDynamics').value,
      endStep: Number($('brushEndStep').value),
      length: Number($('brushLength').value),
      gradientLength: Number($('brushGradientLength').value),
      mirrorH: $('mirrorH').checked,
      mirrorV: $('mirrorV').checked
    };
  }
  function brushChar() {
    return Array.from($('brushInput').value || '·')[0] || '·';
  }
  function updateStroke(shift) {
    setDrawingShift(gesture, shift);
    canvas.style.cursor = gesture.repositioning ? 'move' : '';
    drawFrame = centerBrushPoints(drawingPoints(
      gesture.tool,
      gesture.path,
      gesture.settings,
      gesture.seed,
      shift && !gesture.repositioning,
      frameStyle,
      workspace()
    ), ink);
    draw();
  }
  listen(viewport, 'contextmenu', (event) => {
    if (preview) {
      event.preventDefault();
      return;
    }
    if (event.target.closest('button,input,select,textarea') || gesture) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const keyboard = event.clientX === 0 && event.clientY === 0;
    const p = keyboard ? { x: workspace().w / 2, y: workspace().h / 2 } : point(event);
    const target = hit(p);
    if (target && !selected.has(target.id)) select([target.id]);
    contextMenu = {
      x: keyboard ? rect.x + rect.width / 2 : event.clientX,
      y: keyboard ? rect.y + rect.height / 2 : event.clientY,
      point: { x: Math.max(0, p.x), y: Math.max(0, p.y) }
    };
    publishUI();
  });
  function closeContextMenu(restore = false) {
    contextMenu = null;
    publishUI();
    if (restore) canvas.focus({ preventScroll: true });
  }
  function resizeCanvas(size) {
    const next = C.validateCanvas(size);
    if (next.w === workspace().w && next.h === workspace().h) return false;
    fit = true;
    return commit(() => {
      doc.canvas = next;
    }, 'Размер холста изменён');
  }
  listen(canvas, 'pointerdown', (event) => {
    if (preview) return;
    if ((event.button !== 0 && event.button !== 1) || gesture) return;
    heroMotion = null;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const p = point(event);
    lastPoint = p;
    if (referenceEditing && !spaceDown && event.button === 0) {
      const handle = referenceHit(doc.reference, p, 8 / zoom);
      if (handle) {
        gesture = { type: 'reference', handle, start: p, before: C.clone(doc), pointerId: event.pointerId };
        canvas.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (tool === 'hand' || spaceDown || event.button === 1) {
      gesture = {
        pointerId: event.pointerId,
        type: 'pan',
        clientX: event.clientX,
        clientY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (preview) return;
    if (tool === 'eyedropper') {
      const char = pickSymbol(doc, p, (text) => measureCategoryText(ctx, text));
      if (char) useBrushSymbol(char);
      else toast('Нажми на существующий символ.');
      return;
    }
    if (tool === 'text') {
      openText(p);
      return;
    }
    if (tool === 'select') {
      const items = editableSelection(),
        b = frameOf(items),
        handle = selectionHandle(items, b, p);
      if (handle?.type === 'rotate') {
        startRotation(event);
      } else if (handle) {
        gesture = {
          type: 'resize',
          corner: handle.corner,
          proportional: event.shiftKey,
          current: p,
          start: p,
          before: C.clone(doc),
          items: C.clone(items),
          bounds: b
        };
      } else {
        const target = hit(p);
        const selectedHero = target?.type === 'heroes' && selected.size === 1 && selected.has(target.id) && heroAt(target, p, heroLayoutFor(target)) >= 0;
        if (!event.shiftKey && !event.altKey && hitSelectionFrame(b, p) && !selectedHero) {
          gesture = { type: 'move', start: p, before: C.clone(doc), items: C.clone(items) };
          canvas.style.cursor = 'move';
        } else if (target) {
          const targetLayer = doc.layers.find((l) => l.id === target.layer);
          // Groups and ASCII art behave alike, as in Figma: a click takes the whole piece,
          // Alt+click (or a double click) one member, and a picked member stays picked.
          const deep = selected.has(target.id) && doc.entities.some((e) => e.layer === target.layer && !selected.has(e.id));
          const artwork = targetLayer?.kind === 'artwork' && !event.altKey && !deep;
          const ids = artwork
            ? doc.entities.filter((e) => e.layer === target.layer).map((e) => e.id)
            : [target.id];
          // The hero under the pointer, in the layout that was on screen before this click.
          const shown = target.type === 'heroes' ? heroLayoutFor(target) : null;
          if (event.shiftKey) {
            const remove = ids.every((id) => selected.has(id));
            for (const id of ids) remove ? selected.delete(id) : selected.add(id);
          } else if (artwork) selected = new Set(ids);
          else selected = selectionOnClick(selected, target.id);
          if (editable(target) && selected.has(target.id)) {
            const from = target.type === 'heroes' && selected.size === 1 && !event.shiftKey && !event.altKey
              ? heroAt(target, p, shown) : -1;
            gesture = from >= 0 ? {
              type: 'hero-reorder', groupId: target.id, from, start: p, current: p,
              clientX: event.clientX, clientY: event.clientY, before: C.clone(doc)
            } : { type: 'move', start: p, before: C.clone(doc), items: C.clone(editableSelection()) };
          }
          renderInspector();
          renderLayers();
          draw();
        } else {
          const previous = event.shiftKey ? [...selected] : [];
          if (!event.shiftKey) selected.clear();
          gesture = { type: 'marquee', start: p, current: p, previous, precise: event.altKey };
          draw();
        }
      }
    } else if (tool === 'lasso') {
      prepareTextMetrics(doc.entities);
      gesture = { type: 'lasso', path: [p], previous: event.shiftKey ? [...selected] : [] };
      if (!event.shiftKey) selected.clear();
      draw();
    } else {
      const layer = doc.layers.find((l) => l.id === $('drawLayer').value);
      if (tool === 'line' && onBendHandle(p)) {
        gesture = { type: 'bend', before: C.clone(doc), bendBefore: structuredClone(bendable) };
        canvas.style.cursor = 'grabbing';
        gesture.pointerId = event.pointerId; canvas.setPointerCapture(event.pointerId);
        return;
      }
      if (!BRUSH_TOOLS.has(tool) && (layer.locked || !layer.visible)) {
        toast('Выбранный слой скрыт или заблокирован.', true);
        return;
      }
      gesture = {
        type: tool === 'eraser' ? 'erase' : tool === 'scatter' ? 'scatter' : 'draw',
        tool,
        path: [snapped(p)],
        settings: brushSettings(),
        seed: Math.floor(Math.random() * 0x7fffffff),
        start: snapped(p),
        last: snapped(p),
        current: snapped(p),
        before: C.clone(doc),
        seen: new Set(),
        thrown: new Set()
      };
      if (gesture.type === 'scatter') gesture.last = { ...p };
      selected.clear();
      if (gesture.type === 'draw') updateStroke(event.shiftKey);
      if (gesture.type === 'erase') eraseAt(p);
      $('emptyCanvas').hidden = true;
      draw();
    }
    if (gesture) { gesture.pointerId = event.pointerId; canvas.setPointerCapture(event.pointerId); }
  });
  function eraseAt(p) {
    eraseSymbols(doc, p, eraserSize / 2, ink);
  }
  function reorderGroupHero(groupId, from, to) {
    const group = doc.entities.find(e => e.id === groupId && e.type === 'heroes');
    if (!group || !editable(group) || preview || gesture || from === to ||
        ![from, to].every(index => Number.isInteger(index) && index >= 0 && index < group.heroIds.length)) return false;
    const motion = createHeroMotion(group, from, performance.now(), heroLayoutFor(group));
    if (!commit(() => { group.heroIds = moveHero(group.heroIds, from, to); })) return false;
    targetHeroMotion(motion, to); motion.active = false; heroMotion = motion; draw();
    return true;
  }
  function updateHeroDrag(event, p) {
    const group = doc.entities.find(e => e.id === gesture.groupId);
    if (!group || !editable(group)) return;
    if (!heroMotion) {
      if (Math.hypot(event.clientX - gesture.clientX, event.clientY - gesture.clientY) < 5) return;
      heroMotion = createHeroMotion(group, gesture.from, performance.now(), heroLayoutFor(group));
      const slot = heroMotion.slots[gesture.from];
      gesture.offset = { x: gesture.start.x - slot.x, y: gesture.start.y - slot.y };
    }
    const to = heroDropIndex(group, p, heroMotion.layout);
    heroMotion.valid = to >= 0;
    if (to >= 0 && to !== heroMotion.to) targetHeroMotion(heroMotion, to);
    heroMotion.positions[gesture.from] = { x: p.x - gesture.offset.x, y: p.y - gesture.offset.y };
    canvas.style.cursor = to >= 0 ? 'grabbing' : 'not-allowed';
  }
  listen(canvas, 'pointermove', (event) => {
    if (gesture && gesture.pointerId !== event.pointerId) return;
    const p = point(event);
    lastPoint = p;
    if (BRUSH_TOOLS.has(tool)) {
      eraserHover = p;
      requestPaint();
    }
    if (!gesture) {
      const frame = frameOf(editableSelection());
      const handle =
        tool === 'select' && !preview
          ? selectionHandle(editableSelection(), frame, p)
          : null;
      const resizeCursors = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'];
      canvas.style.cursor =
        handle?.type === 'rotate'
          ? ROTATE_CURSOR
          : handle
            ? resizeCursors[
                (((Math.round((frame.rotation || 0) / 45) +
                  (handle.corner === 'nw' || handle.corner === 'se' ? 0 : 2)) %
                  4) +
                  4) %
                  4
              ]
            : tool === 'select' && !preview && !spaceDown ? (() => {
                const group = hit(p);
                const inside = hitSelectionFrame(frame, p);
                const reorder = group?.type === 'heroes' && (selected.size <= 1 || !selected.has(group.id)) &&
                  (!inside || selected.has(group.id)) && heroAt(group, p, heroLayoutFor(group)) >= 0;
                return reorder ? 'grab' : inside ? 'move' : '';
              })() : BRUSH_TOOLS.has(tool) && !preview ? 'none' : onBendHandle(p) ? 'grab' : '';
      return;
    }
    if (gesture.type === 'pan') {
      viewport.scrollLeft = gesture.scrollLeft - (event.clientX - gesture.clientX);
      viewport.scrollTop = gesture.scrollTop - (event.clientY - gesture.clientY);
      return;
    }
    gesture.current = p;
    if (gesture.type === 'hero-reorder') updateHeroDrag(event, p);
    if (gesture.type === 'reference') doc.reference = transformReference(gesture.before.reference,
      { x: p.x - gesture.start.x, y: p.y - gesture.start.y }, gesture.handle, event.shiftKey);
    if (gesture.type === 'move') {
      let dx = p.x - gesture.start.x,
        dy = p.y - gesture.start.y;
      gesture.guides = [];
      if (snap) {
        dx = Math.round(dx / 8) * 8;
        dy = Math.round(dy / 8) * 8;
      } else if (!event.ctrlKey && !event.metaKey) {
        // Figma-style smart guides; Ctrl/Cmd while dragging ignores them.
        gesture.lines ||= guideLines(guideFrames(), workspace());
        gesture.frame ||= frameOf(gesture.items);
        const snapped = snapMove({ ...gesture.frame, x: gesture.frame.x + dx, y: gesture.frame.y + dy }, gesture.lines, 6 / zoom);
        dx += snapped.dx;
        dy += snapped.dy;
        gesture.guides = snapped.guides;
      }
      for (const original of gesture.items) {
        const e = doc.entities.find((e) => e.id === original.id);
        e.x = original.x + dx;
        e.y = original.y + dy;
      }
      moveItems(editableSelection());
    }
    if (gesture.type === 'resize') updateResize(p, event.shiftKey);
    if (gesture.type === 'rotate') updateRotation(p, event.shiftKey);
    if (gesture.type === 'draw') {
      advanceDrawingStroke(gesture, snapped(p), event.shiftKey);
      updateStroke(event.shiftKey);
    }
    if (gesture.type === 'lasso') gesture.path.push(p);
    if (gesture.type === 'erase') eraseAt(p);
    if (gesture.type === 'scatter') scatterAt(p);
    if (gesture.type === 'bend') bendTo(p);
    draw();
  });
  function finishGesture(event, cancel = false) {
    if (!gesture || (event && gesture.pointerId !== event.pointerId)) return;
    if (!cancel && event && gesture.type === 'draw') {
      advanceDrawingStroke(gesture, snapped(point(event)), event.shiftKey);
      updateStroke(event.shiftKey);
    }
    if (gesture.type === 'hero-reorder') {
      if (!cancel && event) updateHeroDrag(event, point(event));
      if (heroMotion) {
        const group = doc.entities.find(e => e.id === gesture.groupId);
        cancel ||= !heroMotion.valid || !group || !editable(group);
        if (!cancel) group.heroIds = moveHero(heroMotion.ids, heroMotion.from, heroMotion.to);
        else targetHeroMotion(heroMotion, heroMotion.from);
        heroMotion.active = false;
      }
    }
    // A click without moving melts what is under the brush: it falls down.
    if (!cancel && gesture.type === 'scatter' && !gesture.moved) scatterAt(gesture.last, { x: 0, y: 1 });
    if (cancel && gesture.before) { doc = gesture.before; if (gesture.type === 'bend') bendable = gesture.bendBefore; }
    else if (!cancel && gesture.type === 'draw') {
      const made = (drawFrame || []).map((p) =>
        C.entity(doc, {
          type: 'symbol',
          text: p.ch,
          name: p.ch,
          x: p.x,
          y: p.y,
          w: 30,
          h: 30,
          layer: $('drawLayer').value
        }));
      doc.entities.push(...made);
      // A straight line can be bent afterwards by its middle.
      if (gesture.tool === 'line' && made.length > 1) {
        const a = gesture.path[0], last = gesture.path.at(-1), b = gesture.shift && !gesture.repositioning ? constrainAxis(a, last) : last;
        bendable = { ids: made.map((e) => e.id), a: { ...a }, b: { ...b }, through: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, settings: gesture.settings, seed: gesture.seed, layer: $('drawLayer').value };
        bendable.signature = bendSignature(bendable.ids);
        if (bendHints < 3) { bendHints++; try { localStorage.setItem('gridstudio.bendHints', String(bendHints)); } catch {} toast('Потяни за точку посередине, чтобы выгнуть линию дугой.'); }
      }
    }
    else if (!cancel && gesture.type === 'lasso')
      selected = new Set([
        ...gesture.previous,
        ...doc.entities
          .filter((e) => editable(e) && lassoContains(e, gesture.path, ink))
          .map((e) => e.id)
      ]);
    else if (!cancel && gesture.type === 'marquee') {
      const b = box(gesture.start, gesture.current);
      const picked = new Set([
        ...gesture.previous,
        ...doc.entities
          .filter((e) => {
            return editable(e) && intersectsInk(e, b, ink);
          })
          .map((e) => e.id)
      ]);
      selected = gesture.precise ? picked : expandGroups(picked);
    }
    if (!cancel && gesture.before) {
      try {
        if (doc.entities.length > C.MAX_ENTITIES)
          throw new Error('Лимит — 10 000 объектов. Уменьши плотность рисунка.');
        C.assertCategoryLimit(doc);
      } catch (error) {
        doc = gesture.before;
        cancel = true;
        toast(error.message, true);
      }
    }
    if (!cancel && gesture.before && JSON.stringify(gesture.before) !== JSON.stringify(doc)) {
      history.push(gesture.before);
      if (gesture.type === 'draw') remember((drawFrame || []).map((p) => p.ch).join(''));
      save();
    }
    const wasLasso = gesture.type === 'lasso', pointerId = gesture.pointerId;
    gesture = null;
    if (wasLasso && !cancel) setTool('select');
    canvas.style.cursor = '';
    drawFrame = null;
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    render();
  }
  listen(canvas, 'pointerup', (event) => finishGesture(event));
  listen(canvas, 'pointercancel', (event) => finishGesture(event, true));
  listen(canvas, 'lostpointercapture', (event) => {
    if (gesture) finishGesture(event, true);
  });
  listen(
    canvas,
    'wheel',
    (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        setZoom(wheelZoom(zoom, event.deltaY, event.deltaMode, viewport.clientHeight), event);
      } else if (BRUSH_TOOLS.has(tool) && !preview) {
        // Plain wheel resizes the eraser; Ctrl/Cmd + wheel still zooms.
        event.preventDefault();
        eraserHover = point(event);
        setEraserSize(wheelEraserSize(eraserSize, event.deltaY, event.deltaMode));
      }
    },
    { passive: false }
  );
  listen(canvas, 'dblclick', (event) => {
    if (preview || tool !== 'select') return;
    const e = hit(point(event));
    if (e) {
      select([e.id]);
      setFocus(false);
      // A visibility transition still makes the first opening frame unfocusable.
      // Wait for the panel itself, then avoid stealing focus after another action.
      requestAnimationFrame(async () => {
        await Promise.allSettled($('propertiesPanel').getAnimations().map((animation) => animation.finished));
        if (disposed || focused || selected.size !== 1 || !selected.has(e.id)) return;
        if (document.activeElement !== canvas && !document.activeElement?.closest('#inspectorDismiss')) return;
        $('objectName')?.focus({ preventScroll: true });
        $('objectName')?.select();
      });
    }
  });

  let modalCloseTimer, exportGuideCleanup;
  listen(modal, 'close', () => { exportGuideCleanup?.(); exportGuideCleanup = null; });
  function closeModal() {
    if (!modal.open || modal.classList.contains('closing')) return;
    modal.classList.add('closing');
    modalCloseTimer = setTimeout(
      () => {
        modal.close();
        modal.classList.remove('closing');
      },
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150
    );
  }
  listen(modal, 'cancel', (event) => {
    event.preventDefault();
    closeModal();
  });
  function openModal(title, body, footer = '', view = '') {
    exportGuideCleanup?.(); exportGuideCleanup = null;
    clearTimeout(modalCloseTimer);
    modal.classList.remove('closing');
    modal.dataset.view = view;
    $('modalContent').innerHTML =
      `<div class="modal-header"><h2>${esc(title)}</h2><button class="icon-button" data-close aria-label="Закрыть">${icon('close')}</button></div><div class="modal-body">${body}</div>${footer ? `<div class="modal-footer">${footer}</div>` : ''}`;
    $('modalContent')
      .querySelectorAll('[data-close]')
      .forEach((b) => (b.onclick = closeModal));
    if (!modal.open) modal.showModal();
    // Start in the first field, or on the window itself: never with a focus ring on the close button.
    const field = [...modal.querySelectorAll('.modal-body :is(input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select)')]
      .find((element) => !element.disabled && element.getClientRects().length);
    (field || modal).focus({ preventScroll: true });
  }
  listen(modal, 'click', (event) => {
    if (event.target === modal) {
      const b = modal.getBoundingClientRect();
      if (
        event.clientX < b.left ||
        event.clientX > b.right ||
        event.clientY < b.top ||
        event.clientY > b.bottom
      )
        closeModal();
    }
  });
  function renameProject(index = doc.configIndex) {
    const config = C.configurations(doc).find(item => item.index === index);
    if (!config) return;
    openModal(
      'Переименовать сетку',
      `<label class="field-label" for="projectNameInput">Название сетки</label><input id="projectNameInput" value="${esc(config.name)}" maxlength="200">`,
      '<button class="button secondary" data-close>Отмена</button><button id="confirmName" class="button primary">Сохранить</button>'
    );
    const apply = () => {
      const name = $('projectNameInput').value.trim();
      if (!name) return;
      commit(() => (doc = C.renameConfig(doc, index, name)));
      closeModal();
    };
    $('confirmName').onclick = apply;
    $('projectNameInput').onkeydown = (e) => {
      if (e.key === 'Enter') apply();
    };
    $('projectNameInput').focus();
    $('projectNameInput').select();
  }
  function openText(p = { x: 100, y: 100 }) {
    openModal(
      'Добавить текст или ASCII',
      '<p>Многострочный ASCII добавляется отдельным слоем.</p><textarea id="asciiText" rows="7" placeholder="Текст или ASCII-арт…" maxlength="30000" aria-label="Текст или ASCII-арт"></textarea><div class="text-mode"><label><input type="radio" name="asciiMode" value="lines" checked>По строкам</label><label><input type="radio" name="asciiMode" value="symbols">Каждый символ отдельно</label></div>',
      '<button class="button secondary" data-close>Отмена</button><button id="confirmText" class="button primary">Добавить на холст</button>'
    );
    $('confirmText').onclick = () => {
      const text = $('asciiText').value,
        separate = document.querySelector('input[name="asciiMode"]:checked').value === 'symbols';
      if (!text.trim()) return;
      const rows = text.replace(/\r/g, '').split('\n');
      if (rows.length > 3000 || rows.some((line) => line.length > 5000)) {
        toast('ASCII слишком большой: максимум 3 000 строк и 5 000 символов в строке.', true);
        return;
      }
      const layer = doc.layers.find((l) => l.id === $('drawLayer').value),
        newLayer = rows.length > 1 || separate;
      if (!newLayer && (layer.locked || !layer.visible)) {
        toast('Открой и разблокируй слой для рисования.', true);
        return;
      }
      const applied = commit(() => {
        const inputs = [];
        text
          .replace(/\r/g, '')
          .split('\n')
          .forEach((line, row) => {
            const chunks = separate
              ? Array.from(line).map((ch, i) => ({ text: ch, column: i }))
              : [{ text: line, column: 0 }];
            for (const chunk of chunks) {
              if (!chunk.text.trim()) continue;
              inputs.push({
                type: separate ? 'symbol' : 'text',
                name: chunk.text,
                text: chunk.text,
                x: p.x + chunk.column * 10.8,
                y: p.y + row * 22,
                w: separate ? 30 : Math.max(30, Array.from(chunk.text).length * 10.8),
                h: 30,
                layer: layer.id
              });
            }
          });
        const items = newLayer
          ? C.addArtwork(doc, inputs).items
          : inputs.map((input) => C.entity(doc, input));
        if (!newLayer) doc.entities.push(...items);
        selected = new Set(items.map((e) => e.id));
      });
      if (!applied) return;
      closeModal();
      setTool('select');
    };
    $('asciiText').focus();
  }
  function resetGridView() {
    heroMotion = null;
    selected.clear();
    pickerGroupId = null;
    closeImageDialog();
    setMode('heroes');
    fit = true;
    updateZoom();
    render();
  }
  function switchGrid(index) {
    if (index === doc.configIndex) return;
    if (gesture) finishGesture(null, true);
    const changed = commit(() => {
      doc = C.switchConfig(doc, index);
      selected.clear();
      pickerGroupId = null;
    });
    if (changed) resetGridView();
  }
  function deleteGrid(index) {
    const config = C.configurations(doc).find((item) => item.index === index);
    if (!config || doc.source.configs.length < 2) return;
    openModal(
      'Удалить сетку?',
      `<p>«${esc(config.name)}» исчезнет из этого файла. Остальные сетки не изменятся. Вернуть можно через Ctrl+Z.</p>`,
      '<button class="button secondary" data-close>Отмена</button><button id="confirmDeleteGrid" class="button primary">Удалить сетку</button>'
    );
    $('confirmDeleteGrid').onclick = () => {
      if (gesture) finishGesture(null, true);
      const wasOpen = index === doc.configIndex;
      const removed = commit(() => {
        doc = C.removeConfig(doc, index);
        selected.clear();
        pickerGroupId = null;
      }, 'Сетка удалена · Ctrl+Z вернёт её');
      closeModal();
      if (removed && wasOpen) resetGridView();
    };
    $('confirmDeleteGrid').focus();
  }
  function chooseTemplate(kind = 'blank') {
    if (doc.source.configs.length >= C.MAX_CONFIGS) {
      toast('В одном файле допускается до 100 сеток.', true);
      return;
    }
    const defaultName =
      kind === 'roles' ? 'Сетка по ролям' : kind === 'minimal' ? 'Мой пул героев' : 'Новая сетка';
    openModal(
      'Новая сетка',
      '<p>Добавится в ' +
        esc(doc.fileName || 'hero_grid_config.json') +
        ' рядом с существующими сетками.</p><label class="field-label" for="newGridName">Название сетки</label><input id="newGridName" maxlength="200" value="' +
        esc(defaultName) +
        '"><label class="field-label" for="newGridTemplate">Начать с</label><select id="newGridTemplate"><option value="blank">Пустая сетка</option><option value="roles">Шаблон по ролям</option><option value="minimal">Шаблон «Мой пул»</option></select>',
      '<button class="button secondary" data-close>Отмена</button><button id="confirmNewGrid" class="button primary">Создать сетку</button>'
    );
    $('newGridTemplate').value = kind;
    const create = () => {
      const name = $('newGridName').value.trim();
      if (!name) {
        $('newGridName').focus();
        return;
      }
      const template = $('newGridTemplate').value;
      const added = commit(() => {
        doc = C.addConfig(doc, name, template);
        selected.clear();
        pickerGroupId = null;
      }, 'Сетка добавлена в файл');
      if (!added) return;
      closeModal();
      resetGridView();
    };
    $('confirmNewGrid').onclick = create;
    $('newGridName').onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        create();
      }
    };
    $('newGridName').focus();
    $('newGridName').select();
  }
  function download(data, filename, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([data], { type })),
      a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function downloadProject() {
    download(
      JSON.stringify(doc, null, 2),
      (doc.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').slice(0, 80) || 'grid') + '.gridstudio.json'
    );
    toast('Проект скачан: слои и настройки сохранены');
  }
  async function openRecovery() {
    finishLiveEdit();
    openModal('Версии проекта', '<p role="status">Читаем сохранённые версии…</p>', '<button id="downloadCurrentProject" class="button primary">Скачать текущий проект</button>', 'versions');
    $('downloadCurrentProject').onclick = downloadProject;
    const records = await projectStorage.records();
    if (disposed || !modal.open || !$('downloadCurrentProject')) return;
    const seen = new Set();
    const unique = records.filter((record) => { if (seen.has(record.raw)) return false; seen.add(record.raw); return true; });
    const warning = saveIndicator(localSaveStatus, cloudSaveStatus).detail || saveWarning || initial.issue;
    $('modalContent').querySelector('.modal-body').innerHTML =
      `<p>Перед восстановлением текущая работа сохраняется отдельной копией. Файл проекта содержит все сетки, слои и подложку.</p>${warning ? `<p class="recovery-warning" role="status">${esc(warning)}</p>` : ''}<div class="recovery-list">${unique.length ? unique.map((record, i) => `<div class="recovery-row"><div><strong>${esc(record.name)}</strong><small>${record.savedAt ? esc(new Date(record.savedAt).toLocaleString('ru-RU')) : 'Сохранение старой версии'} · ${esc(record.reason)} · ${esc(record.version)}</small></div><div class="recovery-actions"><button class="button secondary compact" data-recovery-download="${i}">Скачать</button>${record.valid ? `<button class="button secondary compact" data-recovery-restore="${i}">Восстановить</button>` : '<span class="recovery-warning">Не удалось прочитать</span>'}</div></div>`).join('') : '<p class="hint">Пока нет копий. Они появятся после первого изменения.</p>'}</div>`;
    $('modalContent').querySelectorAll('[data-recovery-download]').forEach((button) => {
      button.onclick = () => download(unique[Number(button.dataset.recoveryDownload)].raw, `GridStudio-backup-${Date.now()}.gridstudio.json`);
    });
    $('modalContent').querySelectorAll('[data-recovery-restore]').forEach((button) => {
      button.onclick = async () => {
        button.disabled = true;
        try {
          const restored = await projectStorage.prepareRestore(unique[Number(button.dataset.recoveryRestore)].raw, doc);
          commit(() => { doc = restored; selected.clear(); }, 'Копия восстановлена. Отмена — Ctrl+Z');
          closeModal();
        } catch (error) { toast(error.message, true); button.disabled = false; }
      };
    });
  }
  // Downloads hold on the hero-pick screen and at every resolution (core.mjs pickSafeCategories).
  const pickWidths = (line) => glyphWidths(ctx, line);
  const pickCount = (entries) => C.pickSafeCategories(entries.map((entry) => entry.category), pickWidths).length;
  function openExport() {
    finishLiveEdit();
    for (const state of [doc, ...Object.values(doc.configDrafts || {})])
      prepareTextMetrics(state.entities.filter((e) => e.rotation));
    let output;
    try {
      output = C.exportDota(doc, null, { widths: pickWidths });
    } catch (error) {
      toast(error.message, true);
      return;
    }
    // The load warning follows the row option below (exportWarnings), so it is not listed here.
    const categories = output.configs[doc.configIndex].categories,
      issues = C.warnings(doc, 0);
    const heroCount = categories.reduce((n, c) => n + c.hero_ids.length, 0);
    openModal(
      'Скачать файл с сетками',
      `<p>Все сетки (${output.configs.length}) и изменения в них сохранятся в одном JSON.</p><p class="hint">Объекты и герои ниже — в выбранной сетке «${esc(doc.name)}».</p><div class="export-summary"><div><strong id="exportCategoryCount">${categories.length}</strong>КАТЕГОРИЙ</div><div><strong>${heroCount}</strong>ГЕРОЕВ</div><div><strong>${output.configs.length}</strong>СЕТОК В ФАЙЛЕ</div></div>${issues.length ? issues.map((w) => `<div class="export-warning">${esc(w)}</div>`).join('') : `<div class="export-ok">${icon('check')}Объекты находятся внутри холста</div>`}<label class="check-row export-row-option"><input id="compactExportRows" type="checkbox" checked>Склеивать символы одной линии в строки</label><p class="hint">Символы одной линии становятся одной категорией — файл в разы легче. Строки собраны так, что рисунок стоит на месте и на экране выбора героя, и при любом разрешении. Без склейки каждый символ — отдельная категория.</p><details class="export-guide"><summary>Как использовать в Dota 2</summary><ol><li>Нажми «Скачать файл для DOTA» — браузер сохранит <strong>hero_grid_config.json</strong> в «Загрузки».<div class="export-name-note"><p><strong>Имя файла должно быть ровно <code>hero_grid_config.json</code></strong> — Dota 2 читает только его.</p><ul><li>Если в «Загрузках» уже был такой файл, браузер назовёт новый <code>hero_grid_config (1).json</code>. Переименуй его: убери « (1)».</li><li>Если Windows не показывает «.json» в именах, впиши при переименовании только <code>hero_grid_config</code>, иначе получится <code>hero_grid_config.json.json</code>.</li></ul></div></li><li>Закрой Dota 2 и сделай резервную копию существующего <strong>hero_grid_config.json</strong>.</li><li>Найди папку своего аккаунта:${steamFolderMarkup()}<p class="steam-folder-note">Код друга — это ID аккаунта в Dota 2. Если Steam установлен в другую папку, укажи её выше.</p></li><li><strong>Замени старый файл новым:</strong> скопируй <strong>hero_grid_config.json</strong> в эту папку. Если Windows спросит про файл с таким же именем, выбери «Заменить файл в папке назначения». В папке должен остаться один <strong>hero_grid_config.json</strong>, файлы с другими именами Dota 2 не читает.</li><li>Запусти Dota 2, открой «Герои» и выбери сетку в списке «Сортировка» внизу слева.</li></ol><p>Если импортирован файл с несколькими сетками, остальные сетки сохранятся в экспорте.</p><p>Отображение шрифта и портретов в игре может отличаться от превью.</p></details>`,
      '<button id="shareCatalogGrid" class="button secondary">Опубликовать в мастерскую</button><button id="downloadProject" class="button secondary">Сохранить JSON проекта</button><button id="downloadDota" class="button primary">Скачать файл для DOTA</button>',
      'export'
    );
    exportGuideCleanup = mountSteamFolder($('steamFolder'), icon);
    const exportCurrent = () => C.exportDota(doc, null, { compactRows: $('compactExportRows').checked, widths: pickWidths });
    const exportWarnings = document.createElement('div');
    $('compactExportRows').closest('label').before(exportWarnings);
    // The count and the load warning follow the option (rows make fewer categories).
    const showCount = () => {
      let count;
      try { count = exportCurrent().configs[doc.configIndex].categories.length; } catch (error) { exportWarnings.innerHTML = `<div class="export-warning" role="alert">${esc(error.message)}</div>`; return; }
      $('exportCategoryCount').textContent = count;
      exportWarnings.innerHTML = count > 2000
        ? '<div class="export-warning" role="alert">Более 2 000 категорий: возможны лаги и вылет Dota 2.</div>'
        : '';
    };
    $('compactExportRows').onchange = showCount;
    exportWarnings.innerHTML = categories.length > 2000 ? '<div class="export-warning">Более 2 000 категорий: возможны лаги и вылет Dota 2.</div>' : '';
    $('downloadProject').onclick = downloadProject;
    $('downloadDota').onclick = () => {
      let output;
      try { output = exportCurrent(); } catch (error) { toast(error.message, true); return; }
      download(JSON.stringify(output, null, 2), 'hero_grid_config.json');
      closeModal();
      toast('hero_grid_config.json скачан');
    };
    $('shareCatalogGrid').onclick = () => {
      try {
        const grid = selectedCatalogGrid(doc, (text) => measureCategoryWidth(ctx, text));
        modal.close();
        window.dispatchEvent(new CustomEvent('gridstudio:share', { detail: grid }));
      } catch (error) { toast(error.message, true); }
    };
  }
  let importRequest = 0;
  async function importFiles(files) {
    if (!files.length) return;
    finishLiveEdit();
    const request = ++importRequest;
    $('importButton').disabled = true;
    $('importButton').setAttribute('aria-busy', 'true');
    try {
      const imported = await readGridFiles(files);
      if (disposed || request !== importRequest) return;
      const count = imported.reduce((n, file) => n + file.doc.source.configs.length, 0);
      const repaired = imported.reduce((n, file) => n + (file.doc.importRepairs?.length || 0), 0);
      const current = doc.source.configs.length;
      const canAppend = current + count <= C.MAX_CONFIGS;
      openModal(
        'Загрузить сетки',
        `<p>Выбрано файлов: <strong>${imported.length}</strong> · сеток: <strong>${count}</strong></p><ul class="grid-import-files">${imported.map(({ name, doc: incoming }) => `<li><strong>${esc(name)}</strong><span>${C.configurations(incoming).map((grid) => esc(grid.name || 'Без названия')).join(' · ')}</span></li>`).join('')}</ul>${repaired ? `<div class="export-warning">Исправлены нулевые или отрицательные размеры ${repaired} категорий. Позиции символов и пропорции рисунка сохранены. Для текста восстановлен блок 30 × 30; для героев — положительные размеры.</div>` : ''}<fieldset class="grid-import-modes"><legend>Как загрузить</legend><label class="grid-import-option"><input type="radio" name="gridImportMode" value="append" ${canAppend ? 'checked' : 'disabled'}><span><strong>Добавить к текущим</strong><small>${canAppend ? `Текущие ${current} + выбранные ${count} = ${current + count} сеток. Текущая сетка останется открытой.` : 'Вместе получится больше 100 сеток. Открой выбранные файлы отдельно.'}</small></span></label><label class="grid-import-option"><input type="radio" name="gridImportMode" value="replace" ${canAppend ? '' : 'checked'}><span><strong>Открыть вместо текущих</strong><small>В файле будет ${count} сеток. Замену можно отменить через Ctrl+Z.</small></span></label></fieldset><p class="hint">Сетки с одинаковыми именами сохранятся отдельно. Название и расширение файла не имеют значения.</p>`,
        '<button class="button secondary" data-close>Отмена</button><button id="confirmGridImport" class="button primary">Добавить сетки</button>'
      );
      const chosenMode = () => $('modalContent').querySelector('[name="gridImportMode"]:checked').value;
      const updateAction = () => {
        $('confirmGridImport').textContent = chosenMode() === 'append' ? 'Добавить сетки' : 'Открыть сетки';
      };
      $('modalContent').querySelectorAll('[name="gridImportMode"]').forEach((input) => {
        input.onchange = updateAction;
      });
      updateAction();
      $('confirmGridImport').onclick = () => {
        const append = chosenMode() === 'append';
        const opened = commit(() => {
          const incoming = imported.map((file) => file.doc);
          doc = append ? C.appendConfigs(doc, incoming) : C.appendConfigs(incoming[0], incoming.slice(1));
          if (!append) {
            selected.clear();
            pickerGroupId = null;
          }
        }, `Сетки ${append ? 'добавлены' : 'открыты'} · всего: ${append ? current + count : count}`);
        if (opened) {
          if (!append) resetGridView();
          closeModal();
        }
      };
    } catch (error) {
      if (!disposed && request === importRequest) toast(error.message, true);
    } finally {
      if (!disposed && request === importRequest) {
        $('importButton').disabled = false;
        $('importButton').removeAttribute('aria-busy');
      }
    }
  }
  let imageCloseTimer;
  function releaseSourceImage() {
    $('imageOriginal').removeAttribute('src');
    $('sourcePreview').removeAttribute('src');
    if (sourceImageURL) URL.revokeObjectURL(sourceImageURL);
    sourceImageURL = null;
  }
  function clearImageDraft() {
    imageRequest++;
    shownRevision = fullRevision = ++convertRevision;
    styleRevision++;
    cancelAnimationFrame(convertFrame);
    dropDraft(rowDrafts);
    dropDraft(traceDrafts);
    sliding = false;
    conversionFinal = false;
    imagePixels = null;
    pointsDraftPixels = null;
    conversionPoints = [];
    sourceFilename = '';
    $('applyImage').disabled = true;
    $('imageCategoryWarning').replaceChildren();
  }
  function closeImageDialog() {
    clearImageDraft();
    if (!imageDialog.open || imageDialog.classList.contains('closing')) return;
    imageDialog.classList.add('closing');
    imageCloseTimer = setTimeout(
      () => {
        imageDialog.close();
        imageDialog.classList.remove('closing');
        releaseSourceImage();
        $('imageSource').hidden = true;
      },
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150
    );
  }
  function renderImagePreview() {
    $('imageCanvasDimensions').textContent = `${workspace().w} × ${workspace().h}`;
    if (disposed || !imageDialog.open) return;
    const host = $('imagePreviewViewport'),
      previewCanvas = $('imagePreview');
    if (!host.clientWidth || !host.clientHeight) return;
    const scale = Math.max(
      0.05,
      Math.min((host.clientWidth - 32) / workspace().w, (host.clientHeight - 32) / workspace().h)
    );
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    previewCanvas.width = Math.round(workspace().w * scale * dpr);
    previewCanvas.height = Math.round(workspace().h * scale * dpr);
    previewCanvas.style.width = workspace().w * scale + 'px';
    previewCanvas.style.height = workspace().h * scale + 'px';
    const context = previewCanvas.getContext('2d');
    context.setTransform(
      previewCanvas.width / workspace().w,
      0,
      0,
      previewCanvas.height / workspace().h,
      0,
      0
    );
    context.fillStyle = '#191821';
    context.fillRect(0, 0, workspace().w, workspace().h);
    for (const point of conversionPoints) drawCategoryLabel(context, point.ch, point.x, point.y);
  }
  document.querySelectorAll('[data-image-view]').forEach((button) => {
    button.onclick = () => {
      imageDialog.dataset.view = button.dataset.imageView;
      document.querySelectorAll('[data-image-view]').forEach((item) => {
        item.setAttribute('aria-pressed', String(item === button));
      });
      renderImagePreview();
    };
  });
  $('closeImage').onclick = closeImageDialog;
  $('cancelImage').onclick = closeImageDialog;
  listen(imageDialog, 'cancel', (event) => {
    event.preventDefault();
    closeImageDialog();
  });
  listen(imageDialog, 'click', (event) => {
    if (event.target !== imageDialog) return;
    const bounds = imageDialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      closeImageDialog();
  });
  async function loadImage(file) {
    if (disposed || !file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast('Максимальный размер изображения — 20 МБ.', true);
      return;
    }
    if (
      !/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type) &&
      !/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)
    ) {
      toast('Поддерживаются PNG, JPG, WebP, GIF и BMP.', true);
      return;
    }
    const request = ++imageRequest,
      url = URL.createObjectURL(file),
      img = new Image();
    img.onload = () => {
      if (disposed || request !== imageRequest) {
        URL.revokeObjectURL(url);
        return;
      }
      if (img.naturalWidth * img.naturalHeight > 60000000) {
        URL.revokeObjectURL(url);
        toast('Изображение больше 60 мегапикселей. Уменьши его перед загрузкой.', true);
        return;
      }
      const scale = Math.min(500 / img.naturalWidth, 500 / img.naturalHeight, 1),
        cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * scale));
      cv.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = cv.getContext('2d', { willReadFrequently: true });
      c.drawImage(img, 0, 0, cv.width, cv.height);
      imagePixels = c.getImageData(0, 0, cv.width, cv.height);
      releaseSourceImage();
      sourceImageURL = url;
      $('imageOriginal').src = url;
      $('sourceDimensions').textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
      $('sourcePreview').src = cv.toDataURL('image/png');
      $('sourceName').textContent = file.name;
      sourceFilename = file.name;
      $('imageSource').hidden = false;
      if (gesture) finishGesture(null, true);
      pickerGroupId = null;
      publishUI();
      clearTimeout(imageCloseTimer);
      imageDialog.classList.remove('closing');
      conversionPoints = [];
      $('imageCategoryWarning').replaceChildren();
      if (!imageDialog.open) imageDialog.showModal();
      renderImagePreview();
      scheduleConversion();
      buildStyleStrip();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (disposed || request !== imageRequest) return;
      toast('Не удалось прочитать изображение.', true);
    };
    img.src = url;
  }
  function readImageSettings() {
    const settings = { ...imageSettings, maxCats: Number($('imageLimit').value) };
    for (const { id, key } of IMAGE_RANGES) settings[key] = Number($(id).value);
    for (const { id, key } of IMAGE_CHECKS) settings[key] = $(id).checked;
    for (const { id, key } of IMAGE_TEXT_FIELDS) settings[key] = $(id).value || IMAGE_DEFAULTS[key];
    return settings;
  }
  function readRowSettings() {
    const settings = { ...ROW_DEFAULTS };
    for (const { id, key } of ROW_RANGES) settings[key] = Number($(id).value);
    for (const { id, key } of ROW_SELECTS) settings[key] = $(id).value;
    settings.customGlyphs = $('rowCustomGlyphs').value;
    return settings;
  }
  function readTraceSettings() {
    const settings = { ...TRACE_DEFAULTS };
    for (const { id, key } of TRACE_RANGES) settings[key] = Number($(id).value);
    for (const { id, key } of TRACE_SELECTS) settings[key] = $(id).value;
    settings.pack = $('tracePack').checked;
    return settings;
  }
  // The style strip (IMAGE_STYLES): a card per look with a thumbnail of the loaded picture. The
  // thumbnails are computed one after another, rows and dots in workers of their own, so the main
  // preview is never cancelled; a newer picture drops them (styleRevision).
  let styleRevision = 0, styleSelected = null;
  const thumbJobs = { rows: { worker: null, busy: false }, trace: { worker: null, busy: false } };
  function styleSettings(style) {
    if (style.method === 'rows') return { ...ROW_DEFAULTS, ...style.rows };
    if (style.method === 'trace') return { ...TRACE_DEFAULTS, ...style.trace };
    const settings = { ...IMAGE_DEFAULTS, ...D.presets[style.preset], maxCats: style.maxCats || 1000 };
    for (const { key } of IMAGE_RANGES) settings[key] = Number(settings[key]);
    for (const { key } of IMAGE_CHECKS) settings[key] = !!settings[key];
    return settings;
  }
  async function stylePoints(style, settings) {
    const area = workspace();
    if (style.method === 'points') return convertWithStats(imagePixels, settings, area).points;
    const fill = settings.fill / 100;
    const scale = Math.min(((area.w - 30) * fill) / imagePixels.width, ((area.h - 30) * fill) / imagePixels.height);
    const width = Math.max(8, Math.round(imagePixels.width * scale)), height = Math.max(8, Math.round(imagePixels.height * scale));
    const luma = rowLuma(imagePixels, width, height), left = (area.w - width) / 2, top = (area.h - height) / 2;
    if (style.method === 'rows') {
      const atlas = await rowAtlasFor(ROW_GLYPH_SETS[settings.glyphs] || ROW_GLYPH_SETS.all, rowBandTop(settings));
      const result = await workerJob(thumbJobs.rows, () => new Worker(new URL('./ascii-rows.worker.mjs', import.meta.url), { type: 'module' }),
        { id: 0, luma, width, height, settings, glyphs: atlas.glyphs, pairs: atlas.pairs });
      return result.rows.map((row) => ({ ch: row.text, x: left + row.x - DOTA.listPadding, y: top + row.y - atlas.bandTop }));
    }
    const result = await workerJob(thumbJobs.trace, () => new Worker(new URL('./dot-trace.worker.mjs', import.meta.url), { type: 'module' }), { id: 0, luma, width, height, settings });
    const ink = measureCategoryInk(ctx, '.');
    return result.dots.map(([x, y]) => ({ ch: '.', x: left + x - ink.x - ink.w / 2, y: top + y - ink.y - ink.h / 2 }));
  }
  // A thumbnail: every label drawn small in the game font, on the editor's canvas colour.
  function drawStyleThumb(canvas, points) {
    const area = workspace(), ratio = Math.min(2, devicePixelRatio || 1), width = canvas.clientWidth || 132;
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(width * ratio * area.h / area.w);
    const context = canvas.getContext('2d'), scale = canvas.width / area.w;
    context.fillStyle = '#191821'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#c3cad6'; context.font = `600 ${Math.max(3, DOTA.fontSize * scale * 1.3)}px StudioRadiance, sans-serif`;
    for (const point of points) context.fillText(String(point.ch).toUpperCase(), (point.x + DOTA.listPadding) * scale, (point.y + DOTA.fontSize * 0.857) * scale);
  }
  async function buildStyleStrip() {
    const revision = ++styleRevision, strip = $('imageStyles');
    strip.replaceChildren(...IMAGE_STYLES.map((style) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'image-style'; button.dataset.style = style.id;
      button.setAttribute('aria-pressed', String(style.id === styleSelected));
      button.innerHTML = `<canvas aria-hidden="true"></canvas><span>${esc(style.label)}</span>`;
      button.onclick = () => applyStyle(style);
      return button;
    }));
    await document.fonts.load(ROW_FONT).catch(() => {});
    for (const style of IMAGE_STYLES) {
      if (disposed || revision !== styleRevision || !imagePixels || !imageDialog.open) return;
      const button = strip.querySelector(`[data-style="${style.id}"]`);
      try {
        const points = await stylePoints(style, styleSettings(style));
        if (revision !== styleRevision) return;
        drawStyleThumb(button.querySelector('canvas'), points);
        button.classList.add('is-ready');
      } catch { button.classList.add('is-failed'); }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  function applyStyle(style) {
    styleSelected = style.id;
    $('imageStyles').querySelectorAll('[data-style]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.style === style.id)));
    const settings = styleSettings(style);
    if (imageMethod !== style.method) {
      imageMethod = style.method;
      try { localStorage.setItem(IMAGE_METHOD_KEY, imageMethod); } catch { /* Only the choice is forgotten. */ }
      showImageMethod(); conversionPoints = []; renderImagePreview();
    }
    if (style.method === 'points') { applyPreset(settings); $('imagePreset').value = style.preset; return; }
    const fields = style.method === 'rows' ? [...ROW_RANGES, ...ROW_SELECTS] : [...TRACE_RANGES, ...TRACE_SELECTS];
    for (const { id, key } of fields) if (key in settings) $(id).value = settings[key];
    if (style.method === 'trace') $('tracePack').checked = !!settings.pack;
    scheduleConversion();
  }
  // Rows and dots are computed in workers; a newer request replaces one that is still running.
  function workerJob(jobs, create, message) {
    if (jobs.worker && jobs.busy) { jobs.worker.terminate(); jobs.worker = null; }
    const worker = (jobs.worker ||= create());
    jobs.busy = true;
    return new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => { jobs.busy = false; if (data.error) reject(new Error(data.error)); else resolve(data); };
      worker.onerror = (event) => { jobs.busy = false; event.preventDefault(); reject(new Error('Image worker failed')); };
      worker.postMessage(message, [message.luma.buffer]);
    });
  }
  // A full-quality job that a newer request made stale only takes a core: stop it.
  function stopJob(jobs) {
    if (jobs.worker && jobs.busy) { jobs.worker.terminate(); jobs.worker = null; jobs.busy = false; }
  }
  // Drafts while a slider moves are never cut short: replacing the running one every frame
  // would show nothing until the slider stopped. A busy draft worker keeps only the newest
  // request (an older waiting one resolves with null) and takes it when it is done; build()
  // makes the message then, so skipped requests cost nothing.
  function draftJob(jobs, create, build) {
    return new Promise((resolve, reject) => {
      jobs.waiting?.resolve(null);
      jobs.waiting = { build, resolve, reject };
      if (!jobs.busy) nextDraft(jobs, create);
    });
  }
  function dropDraft(jobs) {
    jobs.waiting?.resolve(null);
    jobs.waiting = null;
  }
  function nextDraft(jobs, create) {
    const job = jobs.waiting;
    jobs.waiting = null;
    if (!job || disposed) return;
    let message;
    try { message = job.build(); } catch (error) { job.reject(error); nextDraft(jobs, create); return; }
    const worker = (jobs.worker ||= create());
    jobs.busy = true;
    const settle = (finish) => { jobs.busy = false; finish(); nextDraft(jobs, create); };
    worker.onmessage = ({ data }) => settle(() => (data.error ? job.reject(new Error(data.error)) : job.resolve(data)));
    worker.onerror = (event) => {
      event.preventDefault(); worker.terminate(); jobs.worker = null;
      settle(() => job.reject(new Error('Image worker failed')));
    };
    worker.postMessage(message, [message.luma.buffer]);
  }
  const rowsWorker = () => new Worker(new URL('./ascii-rows.worker.mjs', import.meta.url), { type: 'module' });
  const traceWorker = () => new Worker(new URL('./dot-trace.worker.mjs', import.meta.url), { type: 'module' });
  function rowAtlasFor(glyphs, bandTop) {
    const key = `${bandTop}:${glyphs}`;
    if (!rowAtlases.has(key))
      rowAtlases.set(key, document.fonts.load(ROW_FONT).then(() =>
        rowAtlas(glyphs, (width, height) => Object.assign(document.createElement('canvas'), { width, height }), ROW_FONT, bandTop)));
    return rowAtlases.get(key);
  }
  // Live sliders, like the menu background's. While a slider moves the preview is converted
  // once a frame with the newest value. A method whose last full conversion took longer than
  // LIVE_MS is drafted from a smaller picture meanwhile, and the full result follows on
  // release. The draft's scale follows its timings: the cost grows about as scale^2.5 in all
  // three methods. Apply stays disabled until the preview shows a full result of the current
  // settings.
  const LIVE_MS = 50, DRAFT_MS = { points: 25, rows: 40, trace: 40 };
  const DRAFT_STATUS = 'Черновой предпросмотр — точный результат, когда отпустишь ползунок.';
  const liveCost = { points: 0, rows: 0, trace: 0 }, liveScale = { points: 1, rows: 1, trace: 1 };
  function noteCost(method, scale, spent) {
    if (!(spent > 0)) return;
    if (scale === 1) liveCost[method] = spent;
    liveScale[method] = scale * (DRAFT_MS[method] / spent) ** 0.4;
  }
  function draftScale(method) {
    // A drag's first frame measures the full conversion again when the last one was close:
    // the first conversion of a picture runs cold and slower.
    const probe = liveProbe && liveCost[method] <= LIVE_MS * 2;
    liveProbe = false;
    if (probe || liveCost[method] <= LIVE_MS) return 1;
    // Steps of 0.05 keep a scaled picture cached through a drag.
    return Math.round(Math.max(0.25, Math.min(0.9, liveScale[method])) * 20) / 20;
  }
  // What the preview shows: a newer result replaces an older one, and once a full result is
  // asked for, a draft asked for before it is not shown any more.
  const fresh = (revision) => !disposed && !!imagePixels && imageDialog.open && revision > shownRevision && revision >= fullRevision;
  function showDraft(revision, points) {
    shownRevision = revision;
    conversionPoints = points;
    $('conversionStatus').textContent = DRAFT_STATUS;
    renderImagePreview();
  }
  // A full result; Apply only if nothing newer was asked for since.
  function showFinal(revision, points) {
    shownRevision = revision;
    conversionPoints = points;
    conversionFinal = revision === convertRevision;
    $('applyImage').disabled = !points.length || !conversionFinal;
  }
  function showFailure(revision) {
    shownRevision = revision;
    conversionPoints = [];
    $('imageCategoryWarning').replaceChildren();
    $('conversionStatus').textContent = 'Не удалось обработать изображение. Попробуй другой файл.';
    renderImagePreview();
  }
  // The art box on the canvas: the picture fitted at `fill` percent.
  function artSize(percent) {
    const area = workspace(), fill = percent / 100;
    const scale = Math.min(((area.w - 30) * fill) / imagePixels.width, ((area.h - 30) * fill) / imagePixels.height);
    return { area, width: Math.max(8, Math.round(imagePixels.width * scale)), height: Math.max(8, Math.round(imagePixels.height * scale)) };
  }
  function prepareRows(draft) {
    const settings = readRowSettings();
    for (const { id } of ROW_RANGES) $(id + 'Number').value = $(id).value;
    const custom = settings.glyphs === 'custom';
    const { glyphs, skipped } = custom ? rowGlyphs(settings.customGlyphs) : { glyphs: ROW_GLYPH_SETS[settings.glyphs] || ROW_GLYPH_SETS.all, skipped: '' };
    $('rowCustomField').hidden = !custom;
    // Dots set their own row step.
    $('rowPitch').disabled = $('rowPitchNumber').disabled = settings.glyphs === 'dots';
    $('rowGlyphsHint').hidden = !custom;
    $('rowGlyphsHint').textContent = skipped
      ? `Нет в шрифте Dota, пропущены: ${skipped}`
      : 'Пробел добавляется сам. Строчные буквы игра показывает заглавными.';
    if (!imagePixels || !imageDialog.open) return null;
    $('imageCategoryWarning').replaceChildren();
    $('applyImage').disabled = true;
    if (Array.from(glyphs).length < 2) {
      shownRevision = convertRevision;
      conversionPoints = [];
      $('conversionStatus').textContent = 'Добавь в набор хотя бы один символ, кроме пробела.';
      renderImagePreview();
      return null;
    }
    return (revision) => convertRows(revision, settings, glyphs, draft);
  }
  async function convertRows(revision, settings, glyphs, draft) {
    // The row step must stay whole pixels at a draft's size (rowDraftScale).
    const scale = draft ? rowDraftScale(settings, draftScale('rows')) : 1;
    // A live full-size conversion keeps the last result's line: no flicker every frame.
    if (scale < 1 || !draft) $('conversionStatus').textContent = scale < 1 ? DRAFT_STATUS : 'Подбираем символы…';
    try {
      const { area, width, height } = artSize(settings.fill);
      const atlas = await rowAtlasFor(glyphs, rowBandTop(settings));
      if (!fresh(revision)) return;
      let result;
      if (!draft) {
        dropDraft(rowDrafts);
        result = await workerJob(rowsJobs, rowsWorker, { id: revision, luma: rowLuma(imagePixels, width, height), width, height, settings, glyphs: atlas.glyphs, pairs: atlas.pairs });
      } else {
        stopJob(rowsJobs);
        result = await draftJob(rowDrafts, rowsWorker, () => {
          const w = Math.max(4, Math.round(width * scale)), h = Math.max(4, Math.round(height * scale));
          return { id: revision, luma: rowLuma(imagePixels, w, h), width: w, height: h, settings, glyphs: atlas.glyphs, pairs: atlas.pairs, scale };
        });
      }
      if (!result || !fresh(revision)) return;
      noteCost('rows', scale, result.spent);
      // Row positions are pen positions inside the art; a label draws its text 4px in.
      const left = (area.w - width) / 2, top = (area.h - height) / 2;
      const points = result.rows.map((row) => ({ ch: row.text, x: left + row.x / scale - DOTA.listPadding, y: top + row.y / scale - atlas.bandTop }));
      if (scale < 1) return showDraft(revision, points);
      showFinal(revision, points);
      const count = points.length, chars = result.rows.reduce((sum, row) => sum + Array.from(row.text.replace(/ /g, '')).length, 0);
      $('conversionStatus').textContent = count
        ? `${count} ${plural(count, 'строка', 'строки', 'строк')} = ${count} ${plural(count, 'категория', 'категории', 'категорий')} · ${chars.toLocaleString('ru-RU')} ${plural(chars, 'символ', 'символа', 'символов')} · ${width} × ${height} px · символами ${result.ink === 'dark' ? 'тёмные' : 'светлые'} места`
        : 'Рисунок получился пустым. Попробуй другой режим или «Рисовать символами».';
      renderImagePreview();
    } catch {
      if (fresh(revision)) showFailure(revision);
    }
  }
  function categoryAlert(count) {
    $('imageCategoryWarning').innerHTML = count > 2000
      ? `<div class="category-warning" role="alert"><span>!</span><div><strong>${count.toLocaleString('ru-RU')} категорий в изображении</strong><p>Больше 2000 категорий могут вызывать лаги и вылет Dota 2.</p></div></div>`
      : '';
  }
  function prepareTrace(draft) {
    const settings = readTraceSettings();
    for (const { id } of TRACE_RANGES) $(id + 'Number').value = $(id).value;
    if (!imagePixels || !imageDialog.open) return null;
    $('imageCategoryWarning').replaceChildren();
    $('applyImage').disabled = true;
    return (revision) => convertTrace(revision, settings, draft);
  }
  async function convertTrace(revision, settings, draft) {
    const scale = draft ? draftScale('trace') : 1;
    if (scale < 1 || !draft) $('conversionStatus').textContent = scale < 1 ? DRAFT_STATUS : 'Ищем линии…';
    try {
      const { area, width, height } = artSize(settings.fill);
      let result;
      if (!draft) {
        dropDraft(traceDrafts);
        result = await workerJob(traceJobs, traceWorker, { id: revision, luma: rowLuma(imagePixels, width, height), width, height, settings });
      } else {
        stopJob(traceJobs);
        // A draft traces a smaller picture; its dots come back in its own pixels.
        result = await draftJob(traceDrafts, traceWorker, () => {
          const w = scale < 1 ? Math.max(4, Math.round(width * scale)) : width, h = scale < 1 ? Math.max(4, Math.round(height * scale)) : height;
          return { id: revision, luma: rowLuma(imagePixels, w, h), width: w, height: h, settings: scale < 1 ? { ...settings, scale } : settings };
        });
      }
      if (!result || !fresh(revision)) return;
      noteCost('trace', scale, result.spent);
      await document.fonts.load(ROW_FONT);
      if (!fresh(revision)) return;
      // Dot centres in the picture → category positions: a label draws its dot this far in.
      const ink = measureCategoryInk(ctx, '.'), left = (area.w - width) / 2 - ink.x - ink.w / 2, top = (area.h - height) / 2 - ink.y - ink.h / 2;
      const dots = result.dots.map(([x, y]) => ({ ch: '.', x: +(left + x / scale).toFixed(2), y: +(top + y / scale).toFixed(2) }));
      // A draft is not packed: packing moves a dot by 1.5 px at most, invisible in the preview.
      if (scale < 1) return showDraft(revision, dots);
      const points = settings.pack
        ? packGlyphs(dots, (text) => measureCategoryWidth(ctx, text)).map((row) => ({ ch: row.text, x: +row.x.toFixed(2), y: +row.y.toFixed(2) }))
        : dots;
      showFinal(revision, points);
      const count = points.length, total = dots.length;
      categoryAlert(count);
      $('conversionStatus').textContent = count
        ? `${total.toLocaleString('ru-RU')} ${plural(total, 'точка', 'точки', 'точек')}${settings.pack ? ' →' : ' ='} ${count.toLocaleString('ru-RU')} ${plural(count, 'категория', 'категории', 'категорий')} · ${result.source === 'lines' ? 'линии рисунка' : 'границы, как на фото'} · ${width} × ${height} px${result.limited ? ` · достигнут предел ${TRACE_MAX_DOTS.toLocaleString('ru-RU')} точек` : ''}`
        : 'Линии не найдены. Увеличь детализацию или уменьши «Линии от».';
      renderImagePreview();
    } catch {
      if (fresh(revision)) showFailure(revision);
    }
  }
  function showImageMethod() {
    imageDialog.dataset.method = imageMethod;
    document.querySelectorAll('[data-image-method]').forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.imageMethod === imageMethod)));
  }
  // «Контуры и точки» runs on the main thread (a picture of 500 px at most, usually 15–45 ms).
  // A draft converts the picture at a smaller size; blur and grid step are picture pixels,
  // so they shrink with it and the symbols keep their spacing on the canvas.
  function scaledPixels(scale) {
    if (pointsDraftPixels?.source === imagePixels && pointsDraftPixels.scale === scale) return pointsDraftPixels.pixels;
    const source = document.createElement('canvas'), canvas = document.createElement('canvas');
    source.width = imagePixels.width; source.height = imagePixels.height;
    source.getContext('2d').putImageData(imagePixels, 0, 0);
    canvas.width = Math.max(8, Math.round(imagePixels.width * scale)); canvas.height = Math.max(8, Math.round(imagePixels.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    pointsDraftPixels = { source: imagePixels, scale, pixels: context.getImageData(0, 0, canvas.width, canvas.height) };
    return pointsDraftPixels.pixels;
  }
  function draftPointSettings(settings, scale) {
    const step = (settings.gridStep / (settings.density / 100)) * scale, gridStep = Math.min(20, Math.max(2, step));
    return { ...settings, blur: settings.blur * scale, gridStep, density: Math.min(200, (100 * gridStep) / step) };
  }
  function preparePoints(draft) {
    imageSettings = readImageSettings();
    for (const { id } of IMAGE_RANGES) $(id + 'Number').value = $(id).value;
    $('imageOrient').disabled = imageSettings.onlyDots;
    if (!imagePixels || !imageDialog.open) return null;
    $('applyImage').disabled = true;
    if (!$('imageLimit').value || !$('imageLimit').checkValidity()) {
      $('conversionStatus').textContent = 'Лимит: от 100 до 10 000 символов, с шагом 100.';
      return null;
    }
    const settings = imageSettings;
    $('conversionStatus').textContent = 'Ищем контуры…';
    return (revision) => convertPoints(revision, settings, draft);
  }
  function convertPoints(revision, settings, draft) {
    const scale = draft ? draftScale('points') : 1;
    try {
      const started = performance.now();
      const result = scale < 1
        ? convertWithStats(scaledPixels(scale), draftPointSettings(settings, scale), workspace())
        : convertWithStats(imagePixels, settings, workspace());
      noteCost('points', scale, performance.now() - started);
      if (scale < 1) return showDraft(revision, result.points);
      showFinal(revision, result.points);
      categoryAlert(result.points.length);
      const { contours, shading, limit, width, height } = result.stats;
      // A saved or imported style may still carry glyphs the game does not show.
      const hidden = invisibleWarning(settings.charset + (settings.shading ? settings.shadeCharset : ''));
      $('conversionStatus').textContent = (hidden ? hidden + ' ' : '') + (result.points.length
        ? `${result.points.length} / ${limit} символов · контуры ${contours} · заливка ${shading} · ${width} × ${height} px`
        : 'Контуры не найдены. Попробуй другой стиль или более контрастный арт.');
      renderImagePreview();
    } catch {
      showFailure(revision);
    }
  }
  // Every change converts on the next frame; changes between two frames are one conversion.
  // draft: a slider is still moving (see LIVE_MS).
  function requestConversion(draft) {
    const revision = ++convertRevision;
    if (!draft) { fullRevision = revision; sliding = false; }
    conversionFinal = false;
    cancelAnimationFrame(convertFrame);
    const run = imageMethod === 'rows' ? prepareRows(draft) : imageMethod === 'trace' ? prepareTrace(draft) : preparePoints(draft);
    if (!run) return;
    convertFrame = requestAnimationFrame(() => {
      convertFrame = 0;
      if (!disposed && revision === convertRevision && imagePixels && imageDialog.open) run(revision);
    });
  }
  function scheduleConversion() {
    requestConversion(false);
  }
  // A slider's input is a draft frame; letting it go (change, pointerup, key up, blur) asks
  // for the full result once. A held arrow key repeats input and change: its release waits
  // for keyup. A drag back to the start value fires no change, hence pointerup.
  function slide() {
    if (!sliding) liveProbe = true;
    sliding = true;
    requestConversion(true);
  }
  function slideEnd() {
    if (sliding && !slidingKey) scheduleConversion();
  }
  function bindSlider(input, onInput) {
    // A new worker loads its modules before its first draft: start it as the slider is taken.
    listen(input, 'pointerdown', () => {
      if (imageMethod === 'rows') rowDrafts.worker ||= rowsWorker();
      if (imageMethod === 'trace') traceDrafts.worker ||= traceWorker();
    });
    listen(input, 'input', onInput);
    listen(input, 'change', slideEnd);
    listen(input, 'keydown', (event) => { if (/^(Arrow|Page|Home|End)/.test(event.key)) slidingKey = true; });
    for (const type of ['keyup', 'blur']) listen(input, type, () => { slidingKey = false; slideEnd(); });
  }
  // Released anywhere, the thumb may no longer be under the pointer.
  for (const type of ['pointerup', 'pointercancel']) listen(window, type, slideEnd, { capture: true });
  function applyPreset(settings) {
    imageSettings = { ...IMAGE_DEFAULTS, ...settings };
    for (const { id, key } of [...IMAGE_RANGES, ...IMAGE_TEXT_FIELDS])
      $(id).value = imageSettings[key];
    for (const { id, key } of IMAGE_CHECKS) $(id).checked = !!imageSettings[key];
    $('imageLimit').value = imageSettings.maxCats;
    scheduleConversion();
  }
  function renderPresets() {
    $('imagePreset').innerHTML =
      '<option value="">Свой стиль</option>' +
      Object.keys({ ...D.presets, ...customPresets })
        .map((name) => `<option value="${esc(name)}">${esc(name)}</option>`)
        .join('');
  }
  function openCharsetPicker({ id, label }) {
    const input = $(id);
    openModal(
      label,
      `<label class="field-label" for="charsetCategory">Стиль символов</label><select id="charsetCategory">${Object.keys(
        D.symbols
      )
        .map((name) => `<option>${esc(name)}</option>`)
        .join(
          ''
        )}</select><input id="charsetSearch" type="search" aria-label="Поиск символов" placeholder="Символ, название или U+…"><label class="check-row category-select-all"><input id="charsetSelectAll" type="checkbox">Выбрать все символы</label><div id="charsetChoices" class="charset-choices" aria-label="Символы выбранного стиля"></div><div class="charset-selection"><span>Текущий набор</span><output id="charsetCurrent" dir="ltr"></output></div><p id="charsetStatus" class="hint" role="status">Нажми на символ, чтобы выбрать его или снять выбор.</p>`,
      '<button class="button primary" data-close>Готово</button>'
    );
    const choices = () => searchSymbols(D.symbols, $('charsetSearch').value, $('charsetCategory').value);
    const render = () => {
      $('charsetChoices').innerHTML = choices()
        .map(
          (char) =>
            `<button class="charset-choice ${input.value.includes(char) ? 'active' : ''}" type="button" data-char="${esc(char)}" aria-pressed="${input.value.includes(char)}" aria-label="Символ ${esc(char)}">${esc(char)}</button>`
        )
        .join('');
      $('charsetCurrent').textContent = input.value || '—';
      if (!choices().length) $('charsetChoices').innerHTML = '<p class="hint">Символы не найдены.</p>';
      $('charsetSelectAll').disabled = !choices().length;
      const chosen = categorySelection(input.value, choices());
      $('charsetSelectAll').checked = chosen.all;
      $('charsetSelectAll').indeterminate = chosen.partial;
    };
    $('charsetCategory').onchange = render;
    $('charsetSearch').oninput = render;
    $('charsetSelectAll').onchange = (e) => {
      const next = toggleCategory(
        input.value,
        choices(),
        e.target.checked
      );
      if (next.length > input.maxLength) {
        $('charsetStatus').textContent = 'Набор заполнен.';
        render();
        return;
      }
      input.value = next;
      $('imagePreset').value = '';
      scheduleConversion();
      render();
    };
    $('charsetChoices').onclick = (event) => {
      const button = event.target.closest('[data-char]');
      if (!button) return;
      const next = toggleSymbol(input.value, button.dataset.char);
      if (next.length > input.maxLength) {
        $('charsetStatus').textContent = 'Набор заполнен.';
        return;
      }
      input.value = next;
      $('charsetStatus').textContent = input.value.includes(button.dataset.char)
        ? `Добавлен ${button.dataset.char}`
        : `Убран ${button.dataset.char}`;
      $('imagePreset').value = '';
      scheduleConversion();
      render();
    };
    render();
  }
  function renderSymbols() {
    const chars = searchSymbols(D.symbols, $('symbolSearch').value, $('symbolCategory').value);
    $('symbolLibrary').innerHTML = chars
      .map(
        (ch) =>
          `<button data-symbol="${esc(ch)}" title="Символ ${esc(ch)}" aria-pressed="${$('brushInput').value.includes(ch)}" class="${$('brushInput').value.includes(ch) ? 'active' : ''}">${esc(ch)}</button>`
      )
      .join('');
    $('brushPreview').textContent = Array.from($('brushInput').value).slice(0, 6).join('') || '·';
    if (!chars.length) $('symbolLibrary').innerHTML = '<p class="hint">Символы не найдены. Попробуй название категории или вставь сам символ.</p>';
    $('brushSelectAll').disabled = !chars.length;
    const chosen = categorySelection($('brushInput').value, chars);
    $('brushSelectAll').checked = chosen.all;
    $('brushSelectAll').indeterminate = chosen.partial;
    $('brushGradientField').hidden = $('brushOrder').value !== 'gradient';
  }
  function renderFrame() {
    const fields = [
      ['tl', 'Левый верхний угол'],
      ['h', 'Горизонталь'],
      ['tr', 'Правый верхний угол'],
      ['v', 'Вертикаль'],
      ['', 'Центр'],
      ['v', 'Вертикаль'],
      ['bl', 'Левый нижний угол'],
      ['h', 'Горизонталь'],
      ['br', 'Правый нижний угол']
    ];
    $('frameBuilder').innerHTML = fields
      .map(
        ([key, label]) =>
          `<input ${key ? `data-frame="${key}" value="${esc(frameStyle[key])}"` : 'value="·" disabled'} aria-label="${label}" maxlength="2">`
      )
      .join('');
    $('frameBuilder')
      .querySelectorAll('[data-frame]')
      .forEach(
        (input) =>
          (input.onchange = () => {
            frameStyle[input.dataset.frame] = Array.from(input.value)[0] || '·';
            renderFrame();
            setTool('frame');
          })
      );
  }
  function openHelp() {
    const shortcuts = [
      ['Выделение', 'V'],
      ['Кисть', 'B'],
      ['Взять символ', 'I'],
      ['Текст', 'T'],
      ['Ластик', 'E'],
      ['Прямоугольник', 'R'],
      ['Сетка', 'G'],
      ['Перемещение', 'Space + drag'],
      ['Вписать холст', '0'],
      ['Показать / скрыть настройки', 'F'],
      ['Отменить', 'Ctrl + Z'],
      ['Повторить', 'Ctrl + Shift + Z'],
      ['Выделить всё', 'Ctrl + A'],
      ['Дублировать', 'Ctrl + D'],
      ['Копировать / вставить', 'Ctrl + C / V'],
      ['Удалить', 'Delete'],
      ['Переместить на 1 / 10 px', 'Shift + ↑↓←→'],
      ['Выбор героев', '/'],
      ['Сохранить пропорции', 'Shift + угол'],
      ['Размер ластика', '[ ] или колесо'],
      ['Объединить / разъединить', 'Ctrl + G / Ctrl + Shift + G'],
      ['Символ из ASCII-арта или группы', 'Alt + клик или двойной клик'],
      ['Часть арта рамкой', 'Alt + рамка или лассо (L)'],
      ['Перетащить без направляющих', 'Ctrl + перетаскивание'],
      ['Сдвинуть фигуру во время рисования', 'Удерживать Shift'],
      ['Поворот текста', 'Снаружи угла'],
      ['Поворот с шагом 15°', 'Shift + поворот']
    ];
    openModal(
      `GridStudio ${APP_VERSION} · Работа с холстом`,
      `<p>Выбери группу на холсте и нажми «+» после последнего героя. В попапе можно искать героев и выбирать атрибут. Перетаскивай портреты внутри группы, чтобы менять их порядок; за название или свободное место перемещается вся группа. Esc отменяет перетаскивание, Ctrl+Z — готовую перестановку. На вкладке «Рисование» можно рисовать символами, а «ASCII-арты» превращают картинку или текст в редактируемый рисунок.</p><p>Тяни объекты для перемещения. Любой угол выделения меняет размер. Удерживай <kbd>Shift</kbd>, чтобы сохранить пропорции. Для поворота текста тяни снаружи угла рамки или за круглую ручку; <kbd>Shift</kbd> задаёт шаг 15°. Точный угол можно ввести в свойствах. <kbd>Shift</kbd> + клик добавляет объект к выделению. Протяни рамку на пустом месте, чтобы выделить несколько объектов. <kbd>Alt</kbd> + клик выбирает весь слой рисунка. Двойной клик открывает редактирование текста.</p><h3>Горячие клавиши</h3><div class="shortcuts-grid">${shortcuts.map(([text, key]) => `<div><span>${text}</span><kbd>${key}</kbd></div>`).join('')}</div><h3>О сохранении</h3><p class="hint">Проект сохраняется в этом браузере вместе со всеми сетками, слоями и подложкой. Перед обновлением сохраняется резервная копия. Нажми «Изменения сохранены» в шапке или «Версии проекта» в этой справке, чтобы скачать или восстановить сохранение. Очистка данных браузера удаляет локальные копии — для независимого хранения скачай файл проекта. Картинка конвертера и рисунок в отдельном окне сохранятся в проект только после добавления на холст.</p><p class="hint">Превью приблизительное: файл Dota не хранит цвета и произвольные размеры шрифта. Поворот меняет расположение символов и сохраняется в Dota JSON. Можно загрузить локальный Radiance для более близкого отображения текста.</p><p><a class="source-link" href="https://github.com/linsisss/dota2-grid-toolkit" target="_blank" rel="noreferrer">Исходный репозиторий ↗</a></p>`,
      '<button id="helpTour" class="button secondary">Обучение</button><button id="helpRecovery" class="button secondary">Версии проекта</button><button class="button primary" data-close>Всё понятно</button>',
      'help'
    );
    $('helpRecovery').onclick = openRecovery;
    // src/EditorTour.jsx listens for this and walks through the editor again.
    $('helpTour').onclick = () => { closeModal(); window.dispatchEvent(new CustomEvent('gridstudio:tour')); };
  }

  hydrateIcons();
  const focusButton = $('focusButton');
  function setFocus(next) {
    focused = next;
    document.body.classList.toggle('focus-mode', focused);
    focusButton.classList.toggle('active', !focused);
    focusButton.setAttribute('aria-expanded', String(!focused));
    focusButton.title = focused ? 'Показать настройки (F)' : 'Скрыть настройки (F)';
    $('propertiesPanel').inert = focused;
    fit = true;
    updateZoom();
    publishUI();
  }
  focusButton.onclick = () => setFocus(!focused);
  setFocus(true);
  // Typed or pasted glyphs the game never shows (Braille, box drawing, blocks, a few emoji):
  // say once per field, and again after the field was cleared of them.
  const invisibleWarned = new WeakSet();
  listen(document, 'input', (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
    const warning = invisibleWarning(field.value);
    if (!warning) return void invisibleWarned.delete(field);
    if (invisibleWarned.has(field)) return;
    invisibleWarned.add(field);
    toast(warning, true);
  });
  $('dockAddGroup').onclick = () => {
    setMode('heroes');
    addGroup();
  };
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.onclick = () => setMode(button.dataset.mode);
    button.onkeydown = (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const modes = ['heroes', 'draw', 'image'],
          next = modes[(modes.indexOf(mode) + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
        setMode(next);
        $('tab-' + next).focus();
      }
    };
  });
  document
    .querySelectorAll('[data-tool]')
    .forEach((button) => (button.onclick = () => setTool(button.dataset.tool)));
  const tools = DRAWING_TOOLS;
  $('drawingTools').innerHTML = tools
    .map(
      ([id, glyph, name]) =>
        `<button data-tool="${id}" title="${name}" aria-label="${name}" aria-pressed="false">${glyph}<small>${name}</small></button>`
    )
    .join('');
  $('drawingTools')
    .querySelectorAll('[data-tool]')
    .forEach((button) => (button.onclick = () => setTool(button.dataset.tool)));
  $('symbolCategory').innerHTML = Object.keys(D.symbols)
    .map((name) => `<option>${esc(name)}</option>`)
    .join('');
  $('symbolCategory').value = 'Геом';
  $('symbolCategory').onchange = renderSymbols;
  $('symbolSearch').oninput = renderSymbols;
  $('symbolLibrary').onclick = (event) => {
    const b = event.target.closest('[data-symbol]');
    if (b) {
      $('brushInput').value = toggleSymbol($('brushInput').value, b.dataset.symbol).slice(
        0,
        MAX_BRUSH_CHARS
      );
      if ($('brushInput').value.includes(b.dataset.symbol)) remember(b.dataset.symbol);
      renderSymbols();
    }
  };
  $('brushInput').oninput = renderSymbols;
  $('brushSelectAll').onchange = (e) => {
    $('brushInput').value = toggleCategory(
      $('brushInput').value,
      searchSymbols(D.symbols, $('symbolSearch').value, $('symbolCategory').value),
      e.target.checked
    ).slice(0, MAX_BRUSH_CHARS);
    renderSymbols();
  };
  $('brushOrder').onchange = () => {
    if (tool === 'gradient' && $('brushOrder').value !== 'gradient') setTool('pencil');
    renderSymbols();
  };
  $('clearBrush').onclick = () => {
    $('brushInput').value = '';
    renderSymbols();
    $('brushInput').focus();
  };
  $('openDrawing').onclick = () => {
    drawingOpen = true;
    publishUI();
  };
  $('brushDynamics').onchange = () => {
    const mode = $('brushDynamics').value;
    $('brushDynamicsFields').hidden = mode === 'constant';
    $('brushEndStep').value = mode === 'denser' ? '5' : '40';
  };
  $('brushStep').oninput = () => ($('brushStepValue').textContent = $('brushStep').value + ' px');
  $('eraserSize').oninput = () => setEraserSize(Number($('eraserSize').value));
  $('eraserSize').value = Math.round(eraserSize);
  $('eraserSizeValue').textContent = `${Math.round(eraserSize)} px`;
  listen(canvas, 'pointerleave', () => {
    if (!eraserHover) return;
    eraserHover = null;
    requestPaint();
  });
  const frameNames = {
    simple: 'Простая',
    heavy: 'Квадраты',
    star: 'Звёздная',
    heart: 'Сердечки',
    music: 'Ноты',
    spade: 'Пики',
    dotdec: 'Точки',
    geometric: 'Геометрия', circles: 'Кольца', diamonds: 'Ромбы', stars: 'Созвездие', arrows: 'Стрелки'
  };
  $('frameStyle').innerHTML = Object.keys(D.frames)
    .map((name) => `<option value="${name}">${frameNames[name] || name}</option>`)
    .join('');
  $('frameStyle').value = 'simple';
  $('frameStyle').onchange = () => {
    frameStyle = { ...D.frames[$('frameStyle').value] };
    renderFrame();
    setTool('frame');
  };
  $('addGroup').onclick = () => addGroup();
  $('emptyAddGroup').onclick = () => addGroup();
  const templateRoles = () => chooseTemplate('roles');
  const templateMinimal = () => chooseTemplate('minimal');
  $('importButton').onclick = () => $('fileInput').click();
  $('exportButton').onclick = openExport;
  $('fileInput').onchange = async () => {
    await importFiles(Array.from($('fileInput').files));
    $('fileInput').value = '';
  };
  $('undoButton').onclick = undo;
  $('redoButton').onclick = redo;
  function setPreview(next, fullscreen = true) {
    if (preview === next) return;
    if (gesture?.type === 'hero-reorder') finishGesture(null, true);
    heroMotion = null;
    finishLiveEdit();
    if (next) {
      closeContextMenu();
      previewView = { zoom, fit, x: viewport.scrollLeft, y: viewport.scrollTop };
      for (const node of document.querySelectorAll(
        '.app-header, .studio-navigation, .library-panel, .inspector-panel, .editor-shell > :not(#canvasViewport):not(#closePreview):not(#previewBackground)'
      )) {
        previewInert.set(node, node.inert);
        node.inert = true;
      }
    }
    preview = next;
    $('previewButton').setAttribute('aria-pressed', preview);
    $('previewButton').classList.toggle('active', preview);
    document.querySelector('.editor-shell').classList.toggle('preview-mode', preview);
    document.body.classList.toggle('game-preview', preview);
    $('closePreview').hidden = !preview;
    $('previewBackground').hidden = !preview;
    if (preview) {
      viewport.scrollTo(0, 0);
      $('closePreview').focus({ preventScroll: true });
      if (fullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement
          .requestFullscreen()
          .then(() => {
            previewOwnsFullscreen = true;
            if (!preview) document.exitFullscreen().catch(() => {});
          })
          .catch(() => {}); // Embedded browsers can still show the viewport-wide preview.
      }
    } else {
      for (const [node, inert] of previewInert) node.inert = inert;
      previewInert.clear();
      if (previewView) {
        zoom = previewView.zoom;
        fit = previewView.fit;
      }
      if (previewOwnsFullscreen && document.fullscreenElement)
        document.exitFullscreen().catch(() => {});
      previewOwnsFullscreen = false;
      $('previewButton').focus({ preventScroll: true });
    }
    updateZoom();
    if (!preview && previewView) viewport.scrollTo(previewView.x, previewView.y);
  }
  $('previewButton').onclick = () => setPreview(!preview);
  $('closePreview').onclick = () => setPreview(false);
  // Preview backdrop: the game's hero screen, the old gradient or «Мой фон» (the user's menu
  // background from «Студия», when this browser has one), shared with the workshop.
  const PREVIEW_BACKGROUNDS = { dota: 'Фон: как в Dota', gradient: 'Фон: градиент', mine: 'Фон: мой' };
  const showPreviewBackground = (value) => {
    $('previewBackgroundLabel').textContent = PREVIEW_BACKGROUNDS[value] || PREVIEW_BACKGROUNDS.dota;
    if (value === 'mine') applyMyBackground();
  };
  showPreviewBackground(gridBackground());
  $('previewBackground').onclick = async () => {
    const order = ['dota', 'gradient', ...(await hasMyBackground() ? ['mine'] : [])];
    setGridBackground(order[(order.indexOf(gridBackground()) + 1) % order.length]);
  };
  const stopPreviewBackground = onGridBackground(showPreviewBackground);
  listen(document, 'fullscreenchange', () => {
    if (!document.fullscreenElement && previewOwnsFullscreen) setPreview(false, false);
    else updateZoom();
  });
  listen(window, 'resize', () => {
    if (preview) updateZoom();
  });
  $('gridToggle').onclick = () => {
    showGrid = !showGrid;
    $('gridToggle').classList.toggle('active', showGrid);
    $('gridToggle').setAttribute('aria-pressed', showGrid);
    draw();
  };
  $('snapToggle').onclick = () => {
    snap = !snap;
    $('snapToggle').classList.toggle('active', snap);
    $('snapToggle').setAttribute('aria-pressed', snap);
  };
  $('snapToggle').classList.toggle('active', snap);
  $('snapToggle').setAttribute('aria-pressed', String(snap));
  $('zoomIn').onclick = () => zoomBy(1.2);
  $('zoomOut').onclick = () => zoomBy(1 / 1.2);
  $('fitButton').onclick = () => {
    fit = true;
    updateZoom();
    viewport.scrollTo(0, 0);
  };
  $('helpButton').onclick = openHelp;
  $('saveState').onclick = openRecovery;
  $('addAscii').onclick = () => openText();
  $('imageUpload').onclick = () => $('imageInput').click();
  const quickImage = () => {
    setMode('image');
    $('imageInput').click();
  };
  $('imageInput').onchange = async () => {
    const file = $('imageInput').files[0];
    if (file) await loadImage(file);
    $('imageInput').value = '';
  };
  const customizeImage = () => {
    $('imagePreset').value = '';
    scheduleConversion();
  };
  for (const { id } of IMAGE_RANGES) {
    bindSlider($(id), () => {
      $('imagePreset').value = '';
      slide();
    });
    // A typed value applies at full quality.
    listen($(id + 'Number'), 'input', () => {
      const field = $(id + 'Number');
      if (field.value === '' || !Number.isFinite(field.valueAsNumber)) return;
      $(id).value = field.value;
      customizeImage();
    });
    listen($(id + 'Number'), 'blur', () => {
      $(id + 'Number').value = $(id).value;
    });
  }
  for (const { id } of [...IMAGE_CHECKS, ...IMAGE_TEXT_FIELDS, { id: 'imageLimit' }])
    listen($(id), 'input', customizeImage);
  for (const field of IMAGE_TEXT_FIELDS)
    $(field.id + 'Add').onclick = () => openCharsetPicker(field);
  showImageMethod();
  document.querySelectorAll('[data-image-method]').forEach((button) => {
    button.onclick = () => {
      if (imageMethod === button.dataset.imageMethod) return;
      imageMethod = button.dataset.imageMethod;
      try { localStorage.setItem(IMAGE_METHOD_KEY, imageMethod); } catch { /* Only the choice is forgotten. */ }
      showImageMethod();
      conversionPoints = [];
      renderImagePreview();
      scheduleConversion();
    };
  });
  for (const { id } of [...ROW_RANGES, ...TRACE_RANGES]) {
    bindSlider($(id), slide);
    listen($(id + 'Number'), 'input', () => {
      const field = $(id + 'Number');
      if (field.value === '' || !Number.isFinite(field.valueAsNumber)) return;
      $(id).value = field.value;
      scheduleConversion();
    });
    listen($(id + 'Number'), 'blur', () => {
      $(id + 'Number').value = $(id).value;
    });
  }
  for (const { id } of [...ROW_SELECTS, ...TRACE_SELECTS]) listen($(id), 'change', scheduleConversion);
  listen($('tracePack'), 'change', scheduleConversion);
  listen($('rowCustomGlyphs'), 'input', scheduleConversion);
  document.querySelectorAll('[data-image-recipe]').forEach((button) => {
    button.onclick = () => {
      if (imageMethod === 'rows') {
        // The chosen ink side stays; so do the glyphs, unless the recipe picks them
        // («Точки») or leaves the dot set.
        const own = ROW_RECIPES[button.dataset.imageRecipe], recipe = { ...ROW_DEFAULTS, ...own };
        if (!own.glyphs && $('rowGlyphs').value !== 'dots') delete recipe.glyphs;
        for (const { id, key } of [...ROW_RANGES, ...ROW_SELECTS]) if (key !== 'ink' && key in recipe) $(id).value = recipe[key];
        scheduleConversion();
        return;
      }
      if (imageMethod === 'trace') {
        const own = TRACE_RECIPES[button.dataset.imageRecipe], recipe = { ...TRACE_DEFAULTS, ...own };
        if (!own.source) delete recipe.source;
        for (const { id, key } of [...TRACE_RANGES, ...TRACE_SELECTS]) if (key in recipe) $(id).value = recipe[key];
        scheduleConversion();
        return;
      }
      const recipes = { line: 'Чистый line-art', photo: 'Портрет фото', light: 'Минимализм (мало символов)', dots: 'Аниме точки (базовый)' };
      const name = recipes[button.dataset.imageRecipe];
      applyPreset({ ...D.presets[name], maxCats: button.dataset.imageRecipe === 'light' ? 600 : 1000 });
      $('imagePreset').value = name;
    };
  });
  $('imagePreset').onchange = () => {
    const preset = { ...D.presets, ...customPresets }[$('imagePreset').value];
    if (preset) applyPreset(preset);
  };
  $('applyImage').onclick = () => {
    // Never a draft: Apply waits for the full result of the current settings.
    if (!imageDialog.open || $('applyImage').disabled || !conversionFinal || !conversionPoints.length) return;
    let artwork;
    // Rows and packed dots are text lines; a dot that joined no row stays a symbol.
    const rows = imageMethod !== 'points';
    const applied = commit(() => {
      artwork = C.addArtwork(
        doc,
        conversionPoints.map((p) => rows && !(imageMethod === 'trace' && Array.from(p.ch).length === 1)
          ? { type: 'text', name: p.ch, text: p.ch, x: p.x, y: p.y, h: 30,
              w: Math.max(30, measureCategoryText(ctx, p.ch).advances.reduce((a, b) => a + b, 0) + 8) }
          : { type: 'symbol', name: p.ch, text: p.ch, x: p.x, y: p.y, w: 30, h: 30 }),
        sourceFilename.replace(/\.[^.]+$/, '') || 'ASCII'
      );
      selected = new Set(artwork.items.map((e) => e.id));
    }, 'Создан отдельный ASCII-слой');
    if (!applied) return;
    if (!rows) remember(conversionPoints.map((point) => point.ch).join(''));
    closeImageDialog();
    setMode('heroes');
    render();
  };
  $('importPresets').onclick = () => $('presetInput').click();
  $('presetInput').onchange = async () => {
    const file = $('presetInput').files[0];
    $('presetInput').value = '';
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Файл пресетов слишком большой.');
      const parsed = JSON.parse(await file.text());
      if (
        !parsed.presets ||
        typeof parsed.presets !== 'object' ||
        Array.isArray(parsed.presets) ||
        Object.keys(parsed.presets).length > 100
      )
        throw new Error('Нужен файл пресетов Line-Art Converter.');
      for (const [name, preset] of Object.entries(parsed.presets)) {
        if (
          !preset ||
          typeof preset !== 'object' ||
          name.length > 100 ||
          ['__proto__', 'constructor', 'prototype'].includes(name)
        )
          throw new Error('Некорректный пресет.');
      }
      customPresets = { ...customPresets, ...parsed.presets };
      localStorage.setItem(PRESETS_KEY, JSON.stringify(customPresets));
      renderPresets();
      toast('Пресеты импортированы');
    } catch (e) {
      toast(e.message, true);
    }
  };
  $('savePreset').onclick = () => {
    openModal(
      'Сохранить стиль',
      '<label class="field-label" for="presetName">Имя пресета</label><input id="presetName" value="Мой стиль" maxlength="100">',
      '<button class="button secondary" data-close>Отмена</button><button id="confirmPreset" class="button primary">Сохранить</button>'
    );
    $('confirmPreset').onclick = () => {
      const name = $('presetName').value.trim();
      if (!name || ['__proto__', 'constructor', 'prototype'].includes(name)) return;
      customPresets[name] = readImageSettings();
      try {
        localStorage.setItem(PRESETS_KEY, JSON.stringify(customPresets));
      } catch {
        toast('Стиль доступен в этой вкладке. Файл пресета будет скачан.', true);
      }
      download(
        JSON.stringify(
          { version: 1, app: 'lineart-converter', presets: { [name]: customPresets[name] } },
          null,
          2
        ),
        'grid-style.json'
      );
      renderPresets();
      $('imagePreset').value = name;
      closeModal();
    };
  };
  $('fontInput').onchange = async () => {
    const file = $('fontInput').files[0];
    $('fontInput').value = '';
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error();
      const font = new FontFace('StudioRadiance', await file.arrayBuffer(), { weight: '600' });
      await font.load();
      if (disposed) return;
      if (customCanvasFont) document.fonts.delete(customCanvasFont);
      document.fonts.add(font);
      customCanvasFont = font;
      draw();
      toast('Шрифт загружен для этой вкладки');
    } catch {
      toast('Не удалось загрузить шрифт.', true);
    }
  };
  let dragDepth = 0;
  listen(document, 'dragover', (event) => event.preventDefault());
  listen(document, 'drop', (event) => event.preventDefault());
  listen(viewport, 'dragenter', (event) => {
    event.preventDefault();
    dragDepth++;
    if (event.dataTransfer.types.includes('Files')) $('dropOverlay').hidden = false;
  });
  listen(viewport, 'dragleave', () => {
    dragDepth--;
    if (dragDepth <= 0) $('dropOverlay').hidden = true;
  });
  listen(viewport, 'drop', async (event) => {
    event.preventDefault();
    dragDepth = 0;
    $('dropOverlay').hidden = true;
    const id = Number(event.dataTransfer.getData('application/x-grid-hero'));
    if (heroById.has(id)) addHero(id, point(event));
    else if (event.dataTransfer.files.length === 1 && event.dataTransfer.files[0].type.startsWith('image/'))
      await loadImage(event.dataTransfer.files[0]);
    else if (event.dataTransfer.files.length) await importFiles(Array.from(event.dataTransfer.files));
  });
  listen($('imageUpload'), 'drop', (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) loadImage(file);
  });
  listen(document, 'keydown', (event) => {
    if (preview) {
      if (event.key === 'Escape' || event.code === 'KeyP') {
        event.preventDefault();
        setPreview(false);
      } else if (
        event.ctrlKey ||
        event.metaKey ||
        event.key === 'Delete' ||
        event.key === 'Backspace'
      )
        event.preventDefault();
      else if (event.key === 'Tab') {
        event.preventDefault();
        (document.activeElement === $('closePreview') ? $('previewBackground') : $('closePreview')).focus();
      }
      return;
    }
    const typing = event.target.closest('input,textarea,select,[contenteditable=true]');
    if (contextMenu || document.querySelector('dialog[open]') || drawingOpen) return;
    if (typing) {
      if (event.key === 'Escape') event.target.blur();
      return;
    }
    const key = /^Key[A-Z]$/.test(event.code)
        ? event.code.slice(3).toLowerCase()
        : event.key.toLowerCase(),
      mod = event.ctrlKey || event.metaKey;
    if (pickerGroupId) {
      if (mod && (key === 'z' || key === 'y')) {
        event.preventDefault();
        key === 'y' || event.shiftKey ? redo() : undo();
      }
      return;
    }
    if (gesture && event.key === 'Escape') {
      event.preventDefault();
      finishGesture(null, true);
      return;
    }
    if (gesture?.type === 'resize' && event.key === 'Shift') updateResize(gesture.current, true);
    if (gesture?.type === 'rotate' && event.key === 'Shift') updateRotation(gesture.current, true);
    if (gesture?.type === 'draw' && event.key === 'Shift') updateStroke(true);
    if (gesture) return;
    if (mod) {
      if (key === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }
      if (key === 'y') {
        event.preventDefault();
        redo();
      }
      if (key === 'a') {
        event.preventDefault();
        select(doc.entities.filter(editable).map((e) => e.id));
      }
      if (key === 'd') {
        event.preventDefault();
        selectionAction('duplicate');
      }
      if (key === 'g') {
        event.preventDefault();
        selectionAction(event.shiftKey ? 'ungroup' : 'group');
      }
      if (key === 'c' && selected.size) {
        event.preventDefault();
        copySelection();
      }
      if (key === 'v' && clipboard.length) {
        event.preventDefault();
        pasteSelection();
      }
      if (key === 's') {
        event.preventDefault();
        downloadProject();
      }
      if (key === 'o') {
        event.preventDefault();
        $('fileInput').click();
      }
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      spaceDown = true;
      viewport.classList.add('panning');
    }
    if (key === 'v') setTool('select');
    if (key === 'b') setTool('pencil');
    if (key === 'i') setTool('eyedropper');
    if (key === 'l') setTool('lasso');
    if (key === 't') setTool('text');
    if (key === 'e') setTool('eraser');
    if (key === 'r') setTool('rect');
    if (key === 'g') $('gridToggle').click();
    if (key === 'p') $('previewButton').click();
    if (key === 'f') focusButton.click();
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      selectionAction('delete');
    }
    if (event.key === 'Escape') {
      if (preview) $('previewButton').click();
      else select([]);
    }
    if (event.key === '/') {
      event.preventDefault();
      setMode('heroes');
      const group = selection().find((e) => e.type === 'heroes');
      if (group) openHeroPicker(group.id);
      else {
        addGroup();
        openHeroPicker([...selected][0]);
      }
    }
    if (event.key === '?') openHelp();
    if (BRUSH_TOOLS.has(tool) && (event.code === 'BracketLeft' || event.code === 'BracketRight')) {
      event.preventDefault();
      setEraserSize(stepEraserSize(eraserSize, event.code === 'BracketRight' ? 1 : -1));
    }
    if (key === '0') $('fitButton').click();
    if (key === '+' || key === '=') zoomBy(1.2);
    if (key === '-') zoomBy(1 / 1.2);
    if (event.key.startsWith('Arrow') && selected.size) {
      event.preventDefault();
      const amount = event.shiftKey ? 10 : 1;
      const dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
      const dy = event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0;
      commit(() => moveItems(editableSelection(), dx, dy));
    }
  });
  listen(document, 'keyup', (event) => {
    if (gesture?.type === 'resize' && event.key === 'Shift') updateResize(gesture.current, false);
    if (gesture?.type === 'rotate' && event.key === 'Shift') updateRotation(gesture.current, false);
    if (gesture?.type === 'draw' && event.key === 'Shift') updateStroke(false);
    if (event.key === ' ') {
      spaceDown = false;
      viewport.classList.toggle('panning', tool === 'hand');
    }
  });
  listen(window, 'blur', () => {
    spaceDown = false;
    if (gesture) finishGesture(null, true);
  });
  const resizeObserver = new ResizeObserver(() => {
    if (fit) updateZoom();
  });
  resizeObserver.observe(viewport);
  const imageResizeObserver = new ResizeObserver(renderImagePreview);
  imageResizeObserver.observe($('imagePreviewViewport'));
  renderSymbols();
  renderFrame();
  renderPresets();
  render();
  requestAnimationFrame(() => {
    if (!disposed) updateZoom();
  });
  document.fonts.ready.then(() => {
    if (!disposed) draw();
  });
  if (initial.issue) {
    setLocalSaveStatus('Проверить версии проекта', true, initial.issue);
    toast(initial.issue, true);
  }
  function openHeroPicker(id) {
    const group = doc.entities.find((e) => e.id === id && e.type === 'heroes');
    if (!group || !editable(group)) return;
    pickerGroupId = id;
    publishUI();
  }
  function publishUI() {
    if (disposed) return;
    prepareTextMetrics(doc.entities);
    if (uiReferenceSource !== doc.reference?.src) {
      uiReferenceSource = doc.reference?.src;
      referenceRevision++;
    }
    const items = selection(),
      group =
        items.length === 1 && items[0].type === 'heroes' && editable(items[0]) ? items[0] : null;
    let picker = doc.entities.find(
      (e) => e.id === pickerGroupId && e.type === 'heroes' && editable(e)
    );
    if (!picker) pickerGroupId = null;
    const layerItems = new Map(doc.layers.map((layer) => [layer.id, []]));
    for (const entity of doc.entities) layerItems.get(entity.layer)?.push(entity);
    const next = {
      fileName: doc.fileName || 'hero_grid_config.json',
      drawingOpen,
      contextMenu,
      selectedCount: selected.size,
      editableCount: editableSelection().length,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      canPaste: clipboard.length > 0,
      arrange: arrangeState(),
      canvas: workspace(),
      recentSymbols,
      categories: C.categoryCount(doc),
      reference: doc.reference || null,
      referenceEditing,
      overflow: overflow(doc),
      configIndex: doc.configIndex,
      configurations: C.configurations(doc),
      layers: [...doc.layers].reverse().map((layer) => {
        const entities = layerItems.get(layer.id),
          symbols = entities.filter((e) => e.type === 'symbol');
        return {
          ...layer,
          expanded: !collapsed.has(layer.id),
          count: entities.length,
          selected: entities.length > 0 && entities.every((e) => selected.has(e.id)),
          symbolCount: symbols.length,
          symbolsSelected: symbols.some((e) => selected.has(e.id)),
          entries: entities
            .filter((e) => e.type !== 'symbol')
            .slice(0, 80)
            .map((e) => ({
              id: e.id,
              name: e.name || e.text || 'Без названия',
              type: e.type,
              count: e.heroIds.length,
              selected: selected.has(e.id)
            }))
        };
      }),
      group: group ? { ...group, heroIds: [...group.heroIds] } : null,
      picker: picker ? { id: picker.id, name: picker.name, heroIds: [...picker.heroIds] } : null,
      zoom,
      focused,
      preview,
      tool,
      mode,
      resizing: gesture?.type === 'resize',
      reorderingHeroes: !!heroMotion,
      proportional: !!gesture?.proportional,
      rotationFrame: canRotateSelection() ? activeSelectionFrame(items) : null,
      rotating: gesture?.type === 'rotate',
      rotationSnapped: !!gesture?.angleSnap,
      symbols: C.countSymbols(doc),
      optimizable: simplifiableItems(doc).length,
      groups: doc.entities.filter((e) => e.type === 'heroes').length,
      heroes: doc.entities.reduce((n, e) => n + e.heroIds.length, 0)
    };
    const key = JSON.stringify({
      ...next,
      reference: next.reference ? { ...next.reference, src: referenceRevision } : null
    });
    if (key === snapshotKey) return;
    snapshotKey = key;
    snapshot = next;
    subscribers.forEach((fn) => fn());
  }
  function updateResize(p, proportional) {
    const delta = { x: p.x - gesture.start.x, y: p.y - gesture.start.y };
    if (snap) {
      delta.x = Math.round(delta.x / 8) * 8;
      delta.y = Math.round(delta.y / 8) * 8;
    }
    const minSize = gesture.items.some((item) => item.type === 'heroes') ? DOTA.header + 10 : 10;
    const resized = C.resizeInFrame(
      gesture.items,
      gesture.bounds,
      delta,
      gesture.corner,
      proportional,
      minSize
    );
    const byId = new Map(doc.entities.map((item) => [item.id, item]));
    for (const [index, original] of gesture.items.entries())
      Object.assign(byId.get(original.id), resized[index]);
    moveItems(gesture.items.map((item) => byId.get(item.id)));
    gesture.proportional = proportional;
    draw();
  }
  function canRotateSelection() {
    const items = selection();
    return (
      items.length > 0 &&
      items.every((item) => item.type !== 'heroes' && editable(item)) &&
      (items.length > 1 ||
        Array.from(items[0].text || '').filter((ch) => !/\s/u.test(ch)).length > 1)
    );
  }
  function prepareTextMetrics(items, force = false) {
    for (const item of items) {
      if (item.type === 'heroes' || item.rowGlyphs || Array.from(item.text).length < 2) continue;
      if (force || item.textMetrics?.text !== item.text.toUpperCase() || item.textMetrics.model !== TEXT_MODEL)
        item.textMetrics = measureCategoryText(ctx, item.text);
    }
  }
  function activeSelectionFrame(items = selection()) {
    if (gesture?.type === 'rotate')
      return {
        ...gesture.bounds,
        x: gesture.bounds.x + (gesture.originOffset?.x || 0),
        y: gesture.bounds.y + (gesture.originOffset?.y || 0),
        rotation: C.normalizeAngle(gesture.bounds.rotation + gesture.appliedAngle)
      };
    return frameOf(items);
  }
  function startRotation(event) {
    if (event.button !== 0 || gesture || preview || tool !== 'select' || !canRotateSelection())
      return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const p = point(event),
      items = editableSelection();
    prepareTextMetrics(items);
    gesture = {
      type: 'rotate',
      pointerId: event.pointerId,
      start: p,
      current: p,
      previous: p,
      angle: 0,
      appliedAngle: 0,
      angleSnap: event.shiftKey,
      before: C.clone(doc),
      items: C.clone(items),
      bounds: frameOf(items)
    };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = ROTATE_CURSOR;
    draw();
  }
  function updateRotation(p, angleSnap) {
    const center = C.frameCenter(gesture.bounds);
    // Accumulate shortest deltas to cross ±180° continuously, including full turns.
    if (Math.hypot(p.x - center.x, p.y - center.y) > 2 / zoom) {
      gesture.angle += C.rotationDelta(center, gesture.previous, p);
      gesture.previous = p;
    }
    const absolute = gesture.bounds.rotation + gesture.angle;
    gesture.appliedAngle =
      (angleSnap ? Math.round(absolute / 15) * 15 : absolute) - gesture.bounds.rotation;
    gesture.angleSnap = angleSnap;
    const rotated = C.rotateItems(gesture.items, gesture.bounds, gesture.appliedAngle);
    const byId = new Map(doc.entities.map((item) => [item.id, item]));
    gesture.items.forEach((original, index) =>
      Object.assign(byId.get(original.id), rotated[index])
    );
    gesture.originOffset = moveItems(gesture.items.map((item) => byId.get(item.id)));
    draw();
  }
  publishUI();
  return {
    useBrushSymbol,
    rememberSymbols: remember,
    resizeCanvas,
    setZoom,
    getDocument: () => C.clone(doc),
    addCatalogGrid: (grid) => {
      const added = commit(() => {
        doc = appendCatalogGrid(doc, grid);
        selected.clear(); pickerGroupId = null;
      }, 'Сетка из мастерской добавлена');
      if (added) resetGridView();
      return added;
    },
    simplifyArt: (percent) => commit(() => { doc = simplifyArtwork(doc, percent).doc; }, 'Плотность уменьшена. Ctrl+Z — отменить'),
    // pack: «Упаковать точки» (dot-packing.mjs), exactly as the optimizer dialog previews it.
    optimizeArt: (target, pack = false) => commit(() => {
      doc = optimizeCategories(planOptimization(doc, (text) => measureCategoryWidth(ctx, text), { pack, count: pickCount }), target).doc;
    }, pack ? 'Точки упакованы в строки. Ctrl+Z — отменить' : 'Категории сокращены. Ctrl+Z — отменить'),
    downloadOptimized: (target, pack = false) => {
      try {
        const measure = (text) => measureCategoryWidth(ctx, text);
        const outputDoc = target === null ? (pack ? packSymbols(doc, measure).doc : doc)
          : optimizeCategories(planOptimization(doc, measure, { pack, count: pickCount }), target).doc;
        const output = C.exportDota(outputDoc, null, { widths: pickWidths });
        download(JSON.stringify(output, null, 2), 'hero_grid_config.json');
        toast('Оптимизированный JSON скачан');
        return true;
      } catch (error) { toast(error.message, true); return false; }
    },
    importGrids: () => $('fileInput').click(),
    setSyncStatus: text => { cloudSaveStatus = text || ''; renderSaveIndicator(); },
    closeContextMenu,
    runContextAction: (action) => {
      const anchor = contextMenu?.point;
      closeContextMenu(true);
      if (action.startsWith('tool:')) setTool(action.slice(5));
      else if (action === 'undo') undo();
      else if (action === 'redo') redo();
      else if (action === 'copy') copySelection();
      else if (action === 'paste') pasteSelection(anchor);
      else if (action === 'add-group') {
        setMode('heroes');
        addGroup(anchor);
      } else if (action === 'add-text') openText(anchor);
      else if (action === 'select-all') select(doc.entities.filter(editable).map((e) => e.id));
      else if (action === 'fit') $('fitButton').click();
      else if (action === 'replace-glyphs') openReplaceGlyphs();
      else selectionAction(action);
    },
    // «Текст в ASCII» (src/TextArtDialog.jsx): one symbol per glyph in its cell (scripts/text-art.mjs).
    addTextArt: (art, name) => {
      const done = commit(() => {
        const result = C.addArtwork(doc, placeTextArt(art, workspace(), ink), name ? `Текст «${name}»` : 'Текст');
        selected = new Set(result.items.map((item) => item.id));
      }, 'Надпись добавлена');
      if (done) setTool('select');
      return done;
    },
    addAsciiArt: (art) => {
      const layout = layoutAsciiArt(art.text, (text) =>
        measureCategoryText(ctx, text).advances.reduce((a, b) => a + b, 0)
      );
      const done = commit(() => {
        const result = C.addArtwork(doc, placeAsciiArt(layout, workspace()), art.name);
        selected = new Set(result.items.map((item) => item.id));
      }, 'Арт добавлен');
      if (done) setTool('select');
      return done;
    },
    closeDrawing: () => {
      drawingOpen = false;
      publishUI();
    },
    addDrawing: (items, reference) => {
      const done = commit(() => {
        const result = C.addArtwork(doc, items, 'Рисунок');
        selected = new Set(result.items.map((e) => e.id));
        if (reference) doc.reference = reference;
      }, 'Рисунок добавлен');
      if (done) {
        drawingOpen = false;
        setTool('select');
        publishUI();
      }
      return done;
    },
    editReference: () => {
      const next = !referenceEditing;
      setTool('select'); selected.clear(); referenceEditing = next; draw();
    },
    previewReference: (opacity) => {
      referencePreview = opacity == null || !doc.reference ? null : { reference: doc.reference, opacity };
      requestPaint();
    },
    setReference: (reference) => {
      const added = reference && reference.src !== doc.reference?.src;
      commit(() => { if (reference) doc.reference = reference; else delete doc.reference; });
      if (added) { setTool('select'); selected.clear(); referenceEditing = true; draw(); }
      if (!reference) { referenceEditing = false; draw(); }
    },
    cropOverflow: () =>
      commit(() => {
        prepareTextMetrics(doc.entities);
        cropSymbols(doc);
      }, 'Символы за границами удалены'),
    selectAllHeroes: (ids) => {
      const group = doc.entities.find((e) => e.id === pickerGroupId);
      if (!group || !editable(group)) return;
      commit(() => {
        group.heroIds = [...new Set([...group.heroIds, ...ids.filter((id) => heroById.has(id))])];
        selected = new Set([group.id]);
      });
    },
    startRotation,
    rotateSelection: (delta) => {
      if (!canRotateSelection() || gesture) return;
      commit(() => {
        const items = editableSelection();
        prepareTextMetrics(items);
        const rotated = C.rotateItems(items, frameOf(items), delta);
        items.forEach((item, index) => Object.assign(item, rotated[index]));
        moveItems(items);
      });
    },
    refresh: () => {
      inkCache.clear();
      for (const state of [doc, ...Object.values(doc.configDrafts || {})])
        prepareTextMetrics(
          state.entities.filter((e) => e.rotation),
          true
        );
      draw();
      renderImagePreview();
    },
    subscribe: (callback) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    flush: async () => {
      finishLiveEdit();
      await flushSave();
      await projectStorage.queue;
      if (saveDirty || saveInFlight) throw new Error('Не удалось сохранить файл. Скачай проект перед выходом.');
      // The local document is durable. A slow network must not trap the user in a file.
      projectStorage.syncPending?.();
    },
    getSnapshot: () => snapshot,
    switchGrid,
    newGrid: () => chooseTemplate('blank'),
    renameGrid: renameProject,
    deleteGrid,
    fitCanvas: () => { if (!preview) { fit = true; updateZoom(); } },
    selectEntity: (id, additive = false) => {
      if (additive) {
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        select(selected);
      } else select([id]);
      setTool('select');
    },
    selectLayer: (id, symbolsOnly = false) => {
      select(
        doc.entities
          .filter((e) => e.layer === id && (!symbolsOnly || e.type === 'symbol'))
          .map((e) => e.id)
      );
      setTool('select');
    },
    collapseLayer: (id) => {
      if (collapsed.has(id)) collapsed.delete(id);
      else collapsed.add(id);
      publishUI();
    },
    toggleLayer: (id, property) => {
      if (!['visible', 'locked'].includes(property)) return;
      const layer = doc.layers.find((l) => l.id === id);
      if (!layer) return;
      commit(() => {
        layer[property] = !layer[property];
      });
    },
    deleteLayer: (id) => commit(() => C.deleteArtwork(doc, id), 'Слой удалён'),
    openHeroPicker,
    removeHero: (groupId, index, heroId) => {
      const group = doc.entities.find((e) => e.id === groupId && e.type === 'heroes');
      if (!group || !editable(group) || preview || gesture || group.heroIds[index] !== heroId) return;
      commit(() => {
        group.heroIds.splice(index, 1);
        selected = new Set([group.id]);
      });
    },
    closeHeroPicker: () => {
      pickerGroupId = null;
      publishUI();
    },
    toggleHero: (id) => {
      const group = doc.entities.find((e) => e.id === pickerGroupId);
      if (!group || !editable(group) || !heroById.has(id)) return;
      commit(() => {
        group.heroIds = group.heroIds.includes(id)
          ? group.heroIds.filter((h) => h !== id)
          : [...group.heroIds, id];
        selected = new Set([group.id]);
      });
    },
    addGroup: () => {
      setMode('heroes');
      addGroup();
    },
    setMode,
    closeSettings: () => setFocus(true),
    templateRoles,
    templateMinimal,
    quickImage,
    dispose: () => {
      if (disposed) return;
      if (gesture?.type === 'hero-reorder') finishGesture(null, true);
      heroMotion = null;
      if (preview) setPreview(false);
      flushSave();
      disposed = true;
      stopPreviewBackground();
      if (referenceImage) referenceImage.onload = null;
      if (customCanvasFont) document.fonts.delete(customCanvasFont);
      abort.abort();
      resizeObserver.disconnect();
      imageResizeObserver.disconnect();
      subscribers.clear();
      clearTimeout(saveTimer);
      clearTimeout(saveDeadline);
      clearTimeout(toastTimer);
      cancelAnimationFrame(convertFrame);
      for (const jobs of [rowsJobs, traceJobs, rowDrafts, traceDrafts]) jobs.worker?.terminate();
      clearTimeout(modalCloseTimer);
      exportGuideCleanup?.();
      clearTimeout(imageCloseTimer);
      imageRequest++;
      imageDialog.close();
      focusButton.onclick = null;
      releaseSourceImage();
      $('propertiesPanel').inert = false;
      document.body.classList.remove('focus-mode');
      for (const img of portraits.values())
        if (img) {
          img.onload = null;
          img.onerror = null;
        }
    }
  };
}
