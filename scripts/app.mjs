/* Grid Studio: one canvas, one document, one history for all three workflows. */
import C from './core.mjs';
import D from './data.mjs';
import { numberButtons, stepNumber } from './form-controls.mjs';
import { gamePreviewLayout } from './game-preview.mjs';
import { layoutAsciiArt, placeAsciiArt } from './ascii-library.mjs';
import { DRAWING_TOOLS, GRADIENT_CHARS, drawingPoints, lassoContains } from './drawing.mjs';
import {
  categorySelection,
  toggleCategory,
  toggleSymbol,
  rememberSymbols as updateRecents,
  pickSymbol,
  MAX_BRUSH_CHARS
} from './symbol-tools.mjs';
import {
  mergeRows,
  overflow,
  cropSymbols,
  alignItems,
  eraseSymbols,
  moveItems,
  reflectItems
} from './edit-operations.mjs';
import { convertWithStats } from './converter.mjs';
import {
  IMAGE_DEFAULTS,
  IMAGE_RANGES,
  IMAGE_CHECKS,
  IMAGE_TEXT_FIELDS
} from './image-settings.mjs';
import { DOTA, drawCategoryLabel, measureCategoryText } from './dota-rendering.mjs';
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M8 22a10 10 0 1 1 16-9M19 7l5 6 5-5" fill="none" stroke="#10151a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 22a10 10 0 1 1 16-9M19 7l5 6 5-5" fill="none" stroke="#efeaf5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>')}") 16 16, grab`;
export function createStudio() {
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
  const STORAGE_KEY = 'dota-grid-studio.document.v1';
  const PRESETS_KEY = 'dota-grid-studio.presets.v1';
  const icons = {
    groupPlus:
      '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17.5 13v9M13 17.5h9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    chevron: '<path d="m8 10 4 4 4-4"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    import: '<path d="M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5"/>',
    export: '<path d="M12 15V3m-4 4 4-4 4 4M5 15v5h14v-5"/>',
    heroes:
      '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    pen: '<path d="m4 16 12-12 4 4L8 20l-5 1 1-5Zm10-10 4 4"/>',
    eyedropper: '<path d="m15 3 6 6-3 3-2-2-9 9-4 2 2-4 9-9-2-2 3-3Z"/>',
    lasso: '<ellipse cx="12" cy="9" rx="9" ry="6"/><path d="M6 13c-5 5 0 10 4 7 3-3-1-5-3-2"/>',
    image:
      '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    cursor: '<path d="m5 3 14 10-7 1-3 7-4-18Z"/>',
    hand: '<path d="M8 12V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 4-2 6-6 6h-2c-2 0-3-1-4-3l-4-6c-1-2 1-3 2-2l2 2Z"/>',
    text: '<path d="M4 5h16M12 5v15M8 20h8M4 5v3m16-3v3"/>',
    rect: '<rect x="4" y="4" width="16" height="16" rx="1"/>',
    eraser: '<path d="m14 3 7 7-11 11H5l-3-3L14 3Zm-7 9 7 7M10 21h11"/>',
    undo: '<path d="M4 10h10a6 6 0 0 1 0 12M8 5l-5 5 5 5" transform="translate(0 -2)"/>',
    redo: '<path d="M20 10H10a6 6 0 0 0 0 12m6-17 5 5-5 5" transform="translate(0 -2)"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff:
      '<path d="m3 3 18 18M9 5a11 11 0 0 1 3 0c6 0 10 7 10 7a17 17 0 0 1-3 4M6 6a20 20 0 0 0-4 6s4 7 10 7a11 11 0 0 0 5-1"/>',
    grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
    magnet: '<path d="M4 4h5v9a3 3 0 0 0 6 0V4h5v9a8 8 0 0 1-16 0V4ZM4 8h5m6 0h5"/>',
    fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8Z"/>',
    help: '<path d="M12 6c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v15M5 9h4M5 13h4m6-4h4m-4 4h4"/>',
    sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    sliders:
      '<path d="M5 3v4m0 4v10M12 3v10m0 4v4M19 3v3m0 4v11M2 7h6v4H2Zm7 6h6v4H9Zm7-7h6v4h-6Z"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    layers: '<path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
    unlock:
      '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0m-4 9v2"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M9 10v7m6-7v7"/>',
    flip: '<path d="M12 2v20M3 6l6 6-6 6V6Zm18 0-6 6 6 6V6Z"/>',
    rotate: '<path d="M4 10a8 8 0 1 1 0 5M4 4v6h6"/>',
    align: '<path d="M12 2v20M5 5h14v5H5ZM8 14h8v5H8Z"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<path d="m5 12 4 4L19 6"/>'
  };
  const icon = (name) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.rect}</svg>`;
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
  let doc = C.demoDocument(),
    storageAvailable = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      doc = C.importProject(JSON.parse(raw));
    }
  } catch {
    storageAvailable = false;
  }
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
    snap = true,
    focused = true;
  let clipboard = [],
    clipboardArtwork = [],
    imagePixels = null,
    conversionPoints = [],
    convertTimer,
    convertRevision = 0,
    imageRequest = 0,
    sourceFilename = '',
    sourceImageURL = null;
  let imageSettings = { ...IMAGE_DEFAULTS };
  let customPresets = {},
    saveTimer,
    toastTimer,
    gesture = null,
    spaceDown = false,
    lastPoint = { x: 60, y: 60 },
    drawFrame = null;
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
    referenceRevision = 0;
  let inspectorSelection = '',
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
  function save() {
    clearTimeout(saveTimer);
    $('saveState').innerHTML = '<span class="status-dot"></span>Сохраняем…';
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
        storageAvailable = true;
        $('saveState').innerHTML = '<span class="status-dot"></span>Сохранено на устройстве';
      } catch {
        storageAvailable = false;
        $('saveState').textContent = 'Скачай проект, чтобы сохранить';
        toast('Не удалось сохранить в браузере. Скачай файл проекта через «Экспорт».', true);
      }
    }, 450);
  }
  listen(window, 'pagehide', () => {
    if (saveTimer) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
      } catch {
        /* Download remains available. */
      }
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
    const before = C.clone(doc);
    try {
      mutate();
      combineRows();
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
  function combineRows() {
    const ids = mergeRows(doc, (text) => measureCategoryText(ctx, text));
    selected = new Set([...selected].map((id) => ids.get(id) || id));
  }
  function undo() {
    finishLiveEdit();
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
    $('projectName').textContent = doc.name;
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
    tool = next;
    if (changeMode && !['select', 'hand', 'text'].includes(next) && mode !== 'draw')
      setMode('draw');
    document.querySelectorAll('[data-tool]').forEach((b) => {
      const active = b.dataset.tool === tool;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', active);
    });
    viewport.classList.toggle('drawing', !['select', 'hand'].includes(tool));
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
    if (!preview) zoom = C.clamp(zoom, fit ? 0.01 : 0.15, 2.5);
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
    $('zoomValue').textContent = Math.round(zoom * 100) + '%';
    draw();
  }
  function zoomBy(factor) {
    if (preview) return;
    fit = false;
    zoom *= factor;
    updateZoom();
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
    if (disposed || framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      if (!disposed) paint();
    });
  }
  function paint() {
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
      ctx.globalAlpha = r.opacity;
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
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        const handle = 6 / zoom;
        for (const [x, y] of [
          [b.x, b.y],
          [b.x + b.w, b.y],
          [b.x, b.y + b.h],
          [b.x + b.w, b.y + b.h]
        ]) {
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
    }
  }
  function drawEntity(e) {
    if (e.rotation) prepareTextMetrics([e]);
    const b = C.bounds([e], true);
    if (b.x + b.w < 0 || b.y + b.h < 0 || b.x > workspace().w || b.y > workspace().h) return;
    ctx.save();
    if (e.type === 'heroes') {
      // Titles may overflow their list width in Panorama. Do not squeeze them.
      drawCategoryLabel(ctx, e.name, e.x, e.y);
      const best = C.heroLayout(e);
      ctx.beginPath();
      ctx.rect(e.x, e.y + DOTA.header, e.w, e.h);
      ctx.clip();
      if (best)
        e.heroIds.forEach((id, i) => {
          const x = e.x + best.left + (i % best.cols) * best.stepX,
            y = e.y + best.top + Math.floor(i / best.cols) * best.stepY,
            img = loadPortrait(id);
          ctx.fillStyle = '#202831';
          ctx.fillRect(x, y, best.cardW, best.cardH);
          if (img?.complete && img.naturalWidth) {
            // Cover crop, never stretch a portrait; no names, levels or badges on cards.
            const scale = Math.max(best.cardW / img.naturalWidth, best.cardH / img.naturalHeight),
              sw = best.cardW / scale,
              sh = best.cardH / scale;
            ctx.filter = 'saturate(0.7)';
            ctx.drawImage(
              img,
              (img.naturalWidth - sw) / 2,
              (img.naturalHeight - sh) / 2,
              sw,
              sh,
              x,
              y,
              best.cardW,
              best.cardH
            );
            ctx.filter = 'none';
          }
        });
    } else {
      for (const glyph of C.textGlyphs(e)) drawCategoryLabel(ctx, glyph.text, glyph.x, glyph.y);
    }
    ctx.restore();
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
      if (event.key === 'Enter') input.blur();
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
    if (!selectionChanged && liveEdit?.input === document.activeElement) return;
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
      `<h3>${wholeArtwork ? 'ASCII-слой' : items.length === 1 ? (e.type === 'heroes' ? 'Группа героев' : e.type === 'symbol' ? 'Символ' : 'Текст') : 'Выделение объектов'}</h3>${wholeArtwork ? `<label class="field-label" for="artworkName">Название слоя</label><input id="artworkName" value="${esc(artLayer.name)}" maxlength="200" ${locked ? 'disabled' : ''}>` : items.length === 1 ? `<label class="field-label" for="objectName">${e.type === 'heroes' ? 'Название группы' : 'Текст / символ'}</label><input id="objectName" value="${esc(e.type === 'heroes' ? e.name : e.text)}" maxlength="5000" ${locked ? 'disabled' : ''}>` : `<p class="hint">${items.length} объектов · перемещай и изменяй вместе</p>`}<label class="field-label">Позиция</label><div class="field-pair">${numericField('x', 'X', b.x, locked)}${numericField('y', 'Y', b.y, locked)}</div><label class="field-label">Размер</label><div class="field-pair">${numericField('w', 'W', b.w, locked)}${numericField('h', 'H', b.h, locked)}</div>${rotatable ? `<label class="field-label">Поворот расположения</label>${numericField('rotation', 'Угол, °', C.selectionFrame(items).rotation, locked)}<p class="hint">Символы остаются прямыми. Shift — шаг 15°.</p>` : ''}<label class="field-label">Выровнять по холсту</label><div class="align-actions"><button data-action="align-left" title="По левому краю" aria-label="По левому краю">⊢</button><button data-action="align-center" title="По горизонтальному центру" aria-label="По горизонтальному центру">↔</button><button data-action="align-right" title="По правому краю" aria-label="По правому краю">⊣</button></div><label class="field-label" for="objectLayer">Слой</label><select id="objectLayer" ${locked ? 'disabled' : ''}>${doc.layers.map((l) => `<option value="${l.id}" ${l.id === e.layer ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select><div class="selection-actions"><button class="icon-button" data-action="duplicate" title="Дублировать (Ctrl+D)" aria-label="Дублировать">${icon('copy')}</button><button class="icon-button" data-action="center" title="По центру холста" aria-label="По центру холста">${icon('align')}</button><button class="icon-button" data-action="flip" title="Отразить позиции по горизонтали" aria-label="Отразить позиции по горизонтали">${icon('flip')}</button><button class="icon-button" data-action="rotate" title="${rotatable ? 'Повернуть на 90°' : 'Повернуть расположение на 90°'}" aria-label="${rotatable ? 'Повернуть на 90 градусов' : 'Повернуть расположение на 90 градусов'}">${icon('rotate')}</button><button class="icon-button danger" data-action="delete" title="Удалить (Delete)" aria-label="Удалить">${icon('trash')}</button></div>${locked ? '<p class="hint">Слой заблокирован или скрыт. Открой его в списке слоёв для редактирования.</p>' : ''}${items.length === 1 && e.type === 'heroes' ? `<div class="hero-chips">${e.heroIds.map((id, i) => `<span class="hero-chip">${heroById.has(id) ? `<img src="assets/heroes/${id}.png" alt="">` : ''}${esc(heroById.get(id)?.name || '#' + id)}<button data-remove-hero="${i}" aria-label="Убрать ${esc(heroById.get(id)?.name || id)}" ${locked ? 'disabled' : ''}>×</button></span>`).join('')}</div><button id="editGroupHeroes" class="button secondary full compact" ${locked ? 'disabled' : ''}>+ Выбрать героев</button><p class="hint">Тяни за любой угол. Shift сохраняет пропорции.</p>` : ''}`;
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
              const frame = C.selectionFrame(items);
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
        name: 'НОВАЯ ГРУППА',
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
          name: 'НОВАЯ ГРУППА',
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
        copies.push(...C.addArtwork(doc, inputs, layer.name).items);
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
    commit(() => {
      if (action.startsWith('align-')) alignItems(items, action.slice(6), workspace());
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
        const copies = wholeLayer
          ? C.addArtwork(doc, inputs, sourceLayer.name).items
          : inputs.map((e) => C.entity(doc, e));
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
        combineRows();
      }
      if (action === 'rotate' && items.every((item) => item.type !== 'heroes')) {
        prepareTextMetrics(items);
        const rotated = C.rotateItems(items, C.selectionFrame(items), 90);
        items.forEach((item, index) => Object.assign(item, rotated[index]));
      } else if (action === 'rotate')
        for (const e of items) {
          const x = e.x,
            y = e.y,
            w = e.w;
          e.x = b.x + b.w / 2 - (y - b.y - b.h / 2) - e.h;
          e.y = b.y + b.h / 2 + (x - b.x - b.w / 2);
          e.w = e.h;
          e.h = w;
        }
      if (['center', 'flip', 'rotate'].includes(action)) moveItems(items);
    });
  }
  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
  }
  function snapped(p) {
    return snap ? { x: Math.round(p.x / 8) * 8, y: Math.round(p.y / 8) * 8 } : p;
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
    for (const layer of [...doc.layers].reverse()) {
      if (!layer.visible) continue;
      for (let i = doc.entities.length - 1; i >= 0; i--) {
        const e = doc.entities[i];
        if (e.layer === layer.id && C.containsPoint(e, p)) return e;
      }
    }
    return null;
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
    drawFrame = drawingPoints(
      gesture.tool,
      gesture.path,
      gesture.settings,
      gesture.seed,
      shift,
      Array.from(gesture.settings.chars.trim()).length <= 1 ? frameStyle : null,
      workspace()
    );
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
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const p = point(event);
    lastPoint = p;
    if (tool === 'hand' || spaceDown || event.button === 1) {
      gesture = {
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
        b = C.selectionFrame(items),
        handle = C.transformHandle(b, p, zoom, canRotateSelection());
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
        if (target) {
          const artwork =
            !event.altKey && doc.layers.find((l) => l.id === target.layer)?.kind === 'artwork';
          const ids = artwork
            ? doc.entities.filter((e) => e.layer === target.layer).map((e) => e.id)
            : [target.id];
          if (event.shiftKey) {
            const remove = ids.every((id) => selected.has(id));
            for (const id of ids) remove ? selected.delete(id) : selected.add(id);
          } else if (event.altKey || !ids.every((id) => selected.has(id))) selected = new Set(ids);
          if (editable(target) && selected.has(target.id))
            gesture = {
              type: 'move',
              start: p,
              before: C.clone(doc),
              items: C.clone(editableSelection())
            };
          renderInspector();
          renderLayers();
          draw();
        } else {
          const previous = event.shiftKey ? [...selected] : [];
          if (!event.shiftKey) selected.clear();
          gesture = { type: 'marquee', start: p, current: p, previous };
          draw();
        }
      }
    } else if (tool === 'lasso') {
      gesture = { type: 'lasso', path: [p], previous: event.shiftKey ? [...selected] : [] };
      if (!event.shiftKey) selected.clear();
      draw();
    } else {
      const layer = doc.layers.find((l) => l.id === $('drawLayer').value);
      if (tool !== 'eraser' && (layer.locked || !layer.visible)) {
        toast('Выбранный слой скрыт или заблокирован.', true);
        return;
      }
      gesture = {
        type: tool === 'eraser' ? 'erase' : 'draw',
        tool,
        path: [snapped(p)],
        settings: brushSettings(),
        seed: Math.floor(Math.random() * 0x7fffffff),
        start: snapped(p),
        last: snapped(p),
        current: snapped(p),
        before: C.clone(doc),
        seen: new Set()
      };
      selected.clear();
      if (gesture.type === 'draw') updateStroke(event.shiftKey);
      if (gesture.type === 'erase') eraseAt(p);
      $('emptyCanvas').hidden = true;
      draw();
    }
    if (gesture) canvas.setPointerCapture(event.pointerId);
  });
  function eraseAt(p) {
    eraseSymbols(doc, p);
  }
  listen(canvas, 'pointermove', (event) => {
    const p = point(event);
    lastPoint = p;
    if (!gesture) {
      const frame = C.selectionFrame(editableSelection());
      const handle =
        tool === 'select' && !preview
          ? C.transformHandle(frame, p, zoom, canRotateSelection())
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
            : '';
      return;
    }
    if (gesture.type === 'pan') {
      viewport.scrollLeft = gesture.scrollLeft - (event.clientX - gesture.clientX);
      viewport.scrollTop = gesture.scrollTop - (event.clientY - gesture.clientY);
      return;
    }
    gesture.current = p;
    if (gesture.type === 'move') {
      let dx = p.x - gesture.start.x,
        dy = p.y - gesture.start.y;
      if (snap) {
        dx = Math.round(dx / 8) * 8;
        dy = Math.round(dy / 8) * 8;
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
      gesture.path.push(snapped(p));
      updateStroke(event.shiftKey);
    }
    if (gesture.type === 'lasso') gesture.path.push(p);
    if (gesture.type === 'erase') eraseAt(p);
    draw();
  });
  function finishGesture(event, cancel = false) {
    if (!gesture) return;
    if (cancel && gesture.before) doc = gesture.before;
    else if (!cancel && gesture.type === 'draw')
      for (const p of drawFrame || [])
        doc.entities.push(
          C.entity(doc, {
            type: 'symbol',
            text: p.ch,
            name: p.ch,
            x: p.x,
            y: p.y,
            w: 30,
            h: 30,
            layer: $('drawLayer').value
          })
        );
    else if (!cancel && gesture.type === 'lasso')
      selected = new Set([
        ...gesture.previous,
        ...doc.entities
          .filter((e) => editable(e) && lassoContains(e, gesture.path))
          .map((e) => e.id)
      ]);
    else if (gesture.type === 'marquee') {
      const b = box(gesture.start, gesture.current);
      selected = new Set([
        ...gesture.previous,
        ...doc.entities
          .filter((e) => {
            const bounds = C.bounds([e], true);
            return (
              editable(e) &&
              bounds.x < b.x + b.w &&
              bounds.x + bounds.w > b.x &&
              bounds.y < b.y + b.h &&
              bounds.y + bounds.h > b.y
            );
          })
          .map((e) => e.id)
      ]);
    }
    if (!cancel && gesture.before) {
      try {
        combineRows();
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
    const wasLasso = gesture.type === 'lasso';
    gesture = null;
    if (wasLasso && !cancel) setTool('select');
    canvas.style.cursor = '';
    drawFrame = null;
    if (event && canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
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
        zoomBy(event.deltaY > 0 ? 0.9 : 1.1);
      }
    },
    { passive: false }
  );
  listen(canvas, 'dblclick', (event) => {
    if (preview || tool !== 'select') return;
    const e = hit(point(event));
    if (e) {
      select([e.id]);
      $('objectName')?.focus();
      $('objectName')?.select();
    }
  });

  let modalCloseTimer;
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
  function openModal(title, body, footer = '') {
    clearTimeout(modalCloseTimer);
    modal.classList.remove('closing');
    $('modalContent').innerHTML =
      `<div class="modal-header"><h2>${esc(title)}</h2><button class="icon-button" data-close aria-label="Закрыть">${icon('close')}</button></div><div class="modal-body">${body}</div>${footer ? `<div class="modal-footer">${footer}</div>` : ''}`;
    $('modalContent')
      .querySelectorAll('[data-close]')
      .forEach((b) => (b.onclick = closeModal));
    if (!modal.open) modal.showModal();
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
  function renameProject() {
    openModal(
      'Переименовать сетку',
      `<label class="field-label" for="projectNameInput">Название сетки</label><input id="projectNameInput" value="${esc(doc.name)}" maxlength="200">`,
      '<button class="button secondary" data-close>Отмена</button><button id="confirmName" class="button primary">Сохранить</button>'
    );
    const apply = () => {
      const name = $('projectNameInput').value.trim();
      if (!name) return;
      commit(() => (doc.name = name));
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
  function openExport() {
    for (const state of [doc, ...Object.values(doc.configDrafts || {})])
      prepareTextMetrics(state.entities.filter((e) => e.rotation));
    let output;
    try {
      output = C.exportDota(doc);
    } catch (error) {
      toast(error.message, true);
      return;
    }
    const categories = output.configs[doc.configIndex].categories,
      issues = C.warnings(doc);
    const heroCount = categories.reduce((n, c) => n + c.hero_ids.length, 0);
    openModal(
      'Скачать файл с сетками',
      `<p>Все сетки (${output.configs.length}) и изменения в них сохранятся в одном JSON.</p><p class="hint">Объекты и герои ниже — в выбранной сетке «${esc(doc.name)}».</p><div class="export-summary"><div><strong>${categories.length}</strong>КАТЕГОРИЙ</div><div><strong>${heroCount}</strong>ГЕРОЕВ</div><div><strong>${output.configs.length}</strong>СЕТОК В ФАЙЛЕ</div></div>${issues.length ? issues.map((w) => `<div class="export-warning">${esc(w)}</div>`).join('') : `<div class="export-ok">${icon('check')}Объекты находятся внутри холста</div>`}<label class="field-label" for="exportName">Название сетки в игре</label><input id="exportName" maxlength="200" value="${esc(doc.name)}"><section class="export-guide"><h3>Как использовать в Dota 2</h3><ol><li>Закрой Dota 2 и сделай резервную копию существующего <strong>hero_grid_config.json</strong>.</li><li>Открой папку:<code>C:&#92;Program Files (x86)&#92;Steam&#92;userdata&#92;ID АККАУНТА&#92;570&#92;remote&#92;cfg</code><p><strong>ID АККАУНТА — ID из Dota 2 или код друга в Steam.</strong> Путь может отличаться, если Steam установлен в другую папку.</p></li><li>Помести скачанный <strong>hero_grid_config.json</strong> в эту папку, затем запусти игру и выбери сетку в разделе героев.</li></ol><p>Если импортирован файл с несколькими сетками, остальные сетки сохранятся в экспорте.</p><p>Отображение шрифта и портретов в игре может отличаться от превью.</p></section>`,
      '<button id="downloadProject" class="button secondary">Сохранить проект</button><button id="downloadDota" class="button primary">Скачать весь JSON</button>'
    );
    $('downloadProject').onclick = downloadProject;
    $('downloadDota').onclick = () => {
      const name = $('exportName').value.trim();
      if (!name) {
        $('exportName').focus();
        return;
      }
      if (name !== doc.name) commit(() => (doc.name = name));
      download(JSON.stringify(C.exportDota(doc), null, 2), 'hero_grid_config.json');
      closeModal();
      toast('hero_grid_config.json скачан');
    };
  }
  async function importFile(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast('Файл слишком большой. Максимум — 20 МБ.', true);
      return;
    }
    if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
      await loadImage(file);
      return;
    }
    try {
      const data = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
      const imported = data.app === 'dota-grid-studio' ? C.importProject(data) : C.importDota(data);
      if (data.app !== 'dota-grid-studio') imported.fileName = file.name;
      const opened = commit(() => {
        doc = imported;
        selected.clear();
        pickerGroupId = null;
      }, 'Файл открыт · сеток: ' + imported.source.configs.length);
      if (opened) {
        resetGridView();
        if (modal.open) closeModal();
      }
    } catch (error) {
      toast(
        error instanceof SyntaxError ? 'Этот файл не является корректным JSON.' : error.message,
        true
      );
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
    convertRevision++;
    clearTimeout(convertTimer);
    imagePixels = null;
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
  function scheduleConversion() {
    imageSettings = readImageSettings();
    for (const { id } of IMAGE_RANGES) $(id + 'Number').value = $(id).value;
    $('imageOrient').disabled = imageSettings.onlyDots;
    clearTimeout(convertTimer);
    const revision = ++convertRevision;
    if (!imagePixels || !imageDialog.open) return;
    if (!$('imageLimit').value || !$('imageLimit').checkValidity()) {
      $('applyImage').disabled = true;
      $('conversionStatus').textContent = 'Лимит: от 100 до 10 000 символов, с шагом 100.';
      return;
    }
    $('conversionStatus').textContent = 'Ищем контуры…';
    $('applyImage').disabled = true;
    convertTimer = setTimeout(() => {
      if (disposed || revision !== convertRevision || !imagePixels || !imageDialog.open) return;
      try {
        const result = convertWithStats(imagePixels, imageSettings, workspace());
        conversionPoints = result.points;
        $('imageCategoryWarning').innerHTML =
          conversionPoints.length > 2000
            ? `<div class="category-warning" role="alert"><span>!</span><div><strong>${conversionPoints.length.toLocaleString('ru-RU')} категорий в изображении</strong><p>Больше 2000 категорий могут вызывать лаги и вылет Dota 2.</p></div></div>`
            : '';
        const { contours, shading, limit, width, height } = result.stats;
        $('conversionStatus').textContent = conversionPoints.length
          ? `${conversionPoints.length} / ${limit} символов · контуры ${contours} · заливка ${shading} · ${width} × ${height} px`
          : 'Контуры не найдены. Попробуй другой стиль или более контрастный арт.';
        $('applyImage').disabled = !conversionPoints.length;
        renderImagePreview();
      } catch {
        conversionPoints = [];
        $('imageCategoryWarning').replaceChildren();
        $('conversionStatus').textContent =
          'Не удалось обработать изображение. Попробуй другой файл.';
        renderImagePreview();
      }
    }, 160);
  }
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
        )}</select><label class="check-row category-select-all"><input id="charsetSelectAll" type="checkbox">Выбрать все символы</label><div id="charsetChoices" class="charset-choices" aria-label="Символы выбранного стиля"></div><div class="charset-selection"><span>Текущий набор</span><output id="charsetCurrent" dir="ltr"></output></div><p id="charsetStatus" class="hint" role="status">Нажми на символ, чтобы выбрать его или снять выбор.</p>`,
      '<button class="button primary" data-close>Готово</button>'
    );
    const render = () => {
      $('charsetChoices').innerHTML = D.symbols[$('charsetCategory').value]
        .map(
          (char) =>
            `<button class="charset-choice ${input.value.includes(char) ? 'active' : ''}" type="button" data-char="${esc(char)}" aria-pressed="${input.value.includes(char)}" aria-label="Символ ${esc(char)}">${esc(char)}</button>`
        )
        .join('');
      $('charsetCurrent').textContent = input.value || '—';
      const chosen = categorySelection(input.value, D.symbols[$('charsetCategory').value]);
      $('charsetSelectAll').checked = chosen.all;
      $('charsetSelectAll').indeterminate = chosen.partial;
    };
    $('charsetCategory').onchange = render;
    $('charsetSelectAll').onchange = (e) => {
      const next = toggleCategory(
        input.value,
        D.symbols[$('charsetCategory').value],
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
    const chars = D.symbols[$('symbolCategory').value] || D.symbols['База'];
    $('symbolLibrary').innerHTML = chars
      .map(
        (ch) =>
          `<button data-symbol="${esc(ch)}" title="Символ ${esc(ch)}" aria-pressed="${$('brushInput').value.includes(ch)}" class="${$('brushInput').value.includes(ch) ? 'active' : ''}">${esc(ch)}</button>`
      )
      .join('');
    $('brushPreview').textContent = Array.from($('brushInput').value).slice(0, 6).join('') || '·';
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
      ['Поворот текста', 'Снаружи угла'],
      ['Поворот с шагом 15°', 'Shift + поворот']
    ];
    openModal(
      'Работа с холстом',
      `<p>Выбери группу на холсте и нажми «+» после последнего героя. В попапе можно искать героев и выбирать атрибут. На вкладке «Рисование» можно рисовать символами, а «ASCII» превращает изображение в редактируемый рисунок.</p><p>Тяни объекты для перемещения. Любой угол выделения меняет размер. Удерживай <kbd>Shift</kbd>, чтобы сохранить пропорции. Для поворота текста тяни снаружи угла рамки или за круглую ручку; <kbd>Shift</kbd> задаёт шаг 15°. Точный угол можно ввести в свойствах. <kbd>Shift</kbd> + клик добавляет объект к выделению. Протяни рамку на пустом месте, чтобы выделить несколько объектов.</p><h3>Горячие клавиши</h3><div class="shortcuts-grid">${shortcuts.map(([text, key]) => `<div><span>${text}</span><kbd>${key}</kbd></div>`).join('')}</div><h3>О сохранении</h3><p class="hint">Проект автоматически сохраняется в этом браузере. Режим инкогнито и очистка данных браузера удаляют локальную копию. Для переноса скачай проект через «Экспорт». Исходное изображение не сохраняется; добавленные на холст символы сохраняются.</p><p class="hint">Превью приблизительное: файл Dota не хранит цвета и произвольные размеры шрифта. Поворот меняет расположение символов и сохраняется в Dota JSON. Можно загрузить локальный Radiance для более близкого отображения текста.</p><p><a class="source-link" href="https://github.com/linsisss/dota2-grid-toolkit" target="_blank" rel="noreferrer">Исходный репозиторий ↗</a></p>`,
      '<button class="button primary" data-close>Всё понятно</button>'
    );
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
      D.symbols[$('symbolCategory').value],
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
  const frameNames = {
    simple: 'Простая',
    heavy: 'Квадраты',
    star: 'Звёздная',
    heart: 'Сердечки',
    music: 'Ноты',
    spade: 'Пики',
    dotdec: 'Точки',
    geometric: 'Геометрия'
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
  $('renameProject').onclick = renameProject;
  $('newProject').onclick = () => chooseTemplate('blank');
  const templateRoles = () => chooseTemplate('roles');
  const templateMinimal = () => chooseTemplate('minimal');
  $('importButton').onclick = () => $('fileInput').click();
  $('exportButton').onclick = openExport;
  $('fileInput').onchange = async () => {
    await importFile($('fileInput').files[0]);
    $('fileInput').value = '';
  };
  $('undoButton').onclick = undo;
  $('redoButton').onclick = redo;
  function setPreview(next, fullscreen = true) {
    if (preview === next) return;
    finishLiveEdit();
    if (next) {
      closeContextMenu();
      previewView = { zoom, fit, x: viewport.scrollLeft, y: viewport.scrollTop };
      for (const node of document.querySelectorAll(
        '.app-header, .studio-navigation, .library-panel, .inspector-panel, .editor-shell > :not(#canvasViewport):not(#closePreview)'
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
  $('zoomIn').onclick = () => zoomBy(1.2);
  $('zoomOut').onclick = () => zoomBy(1 / 1.2);
  $('zoomValue').onclick = () => {
    fit = false;
    zoom = 1;
    updateZoom();
  };
  $('fitButton').onclick = () => {
    fit = true;
    updateZoom();
    viewport.scrollTo(0, 0);
  };
  $('helpButton').onclick = openHelp;
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
    listen($(id), 'input', customizeImage);
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
  $('imagePreset').onchange = () => {
    const preset = { ...D.presets, ...customPresets }[$('imagePreset').value];
    if (preset) applyPreset(preset);
  };
  $('applyImage').onclick = () => {
    if (!imageDialog.open || $('applyImage').disabled || !conversionPoints.length) return;
    let artwork;
    const applied = commit(() => {
      artwork = C.addArtwork(
        doc,
        conversionPoints.map((p) => ({
          type: 'symbol',
          name: p.ch,
          text: p.ch,
          x: p.x,
          y: p.y,
          w: 30,
          h: 30
        })),
        sourceFilename.replace(/\.[^.]+$/, '') || 'ASCII'
      );
      selected = new Set(artwork.items.map((e) => e.id));
    }, 'Создан отдельный ASCII-слой');
    if (!applied) return;
    remember(conversionPoints.map((point) => point.ch).join(''));
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
    else if (event.dataTransfer.files[0]) await importFile(event.dataTransfer.files[0]);
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
        $('closePreview').focus();
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
  if (!storageAvailable) {
    $('saveState').textContent = 'Автосохранение недоступно';
    toast('Сохранённый проект недоступен. Для надёжного сохранения скачай файл проекта.', true);
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
      canvas: workspace(),
      recentSymbols,
      categories: C.categoryCount(doc),
      reference: doc.reference || null,
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
      proportional: !!gesture?.proportional,
      rotationFrame: canRotateSelection() ? activeSelectionFrame(items) : null,
      rotating: gesture?.type === 'rotate',
      rotationSnapped: !!gesture?.angleSnap,
      symbols: C.countSymbols(doc),
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
      if (force || item.textMetrics?.text !== item.text.toUpperCase())
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
    return C.selectionFrame(items);
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
      start: p,
      current: p,
      previous: p,
      angle: 0,
      appliedAngle: 0,
      angleSnap: event.shiftKey,
      before: C.clone(doc),
      items: C.clone(items),
      bounds: C.selectionFrame(items)
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
      else selectionAction(action);
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
    setReference: (reference) =>
      commit(() => {
        if (reference) doc.reference = reference;
        else delete doc.reference;
      }),
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
        const rotated = C.rotateItems(items, C.selectionFrame(items), delta);
        items.forEach((item, index) => Object.assign(item, rotated[index]));
        moveItems(items);
      });
    },
    refresh: () => {
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
    getSnapshot: () => snapshot,
    switchGrid,
    newGrid: () => chooseTemplate('blank'),
    renameGrid: renameProject,
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
      if (preview) setPreview(false);
      if (saveTimer) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
        } catch {
          /* Storage may be full. */
        }
      }
      disposed = true;
      if (referenceImage) referenceImage.onload = null;
      if (customCanvasFont) document.fonts.delete(customCanvasFont);
      abort.abort();
      resizeObserver.disconnect();
      imageResizeObserver.disconnect();
      subscribers.clear();
      clearTimeout(saveTimer);
      clearTimeout(toastTimer);
      clearTimeout(convertTimer);
      clearTimeout(modalCloseTimer);
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
