import { DOTA } from './dota-rendering.mjs';

const WIDTH = 1193,
  HEIGHT = 593,
  MAX_ENTITIES = 10000,
  MAX_LAYERS = 128,
  MAX_CONFIGS = 100;
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const layers = () => [
  { id: 'background', name: 'Фон', visible: true, locked: false },
  { id: 'heroes', name: 'Герои', visible: true, locked: false },
  { id: 'decor', name: 'Декор', visible: true, locked: false }
];
function canvasSize(doc) {
  return doc?.canvas || { w: WIDTH, h: HEIGHT };
}
function validateCanvas(size) {
  if (
    !size ||
    !['w', 'h'].every((key) => Number.isInteger(size[key]) && size[key] >= 100 && size[key] <= 6000)
  )
    throw new Error('Размеры холста — целые числа от 100 до 6000 px.');
  return { w: size.w, h: size.h };
}
function createDocument(name = 'Новая сетка') {
  return {
    app: 'dota-grid-studio',
    schema: 1,
    name,
    canvas: { w: WIDTH, h: HEIGHT },
    nextId: 1,
    entities: [],
    layers: layers(),
    source: { version: 3, configs: [{ config_name: name, categories: [] }] },
    configIndex: 0
  };
}
function entity(doc, input) {
  return {
    type: 'text',
    name: '',
    text: '',
    x: 50,
    y: 50,
    w: 180,
    h: 30,
    heroIds: [],
    layer: 'decor',
    ...input,
    id: doc.nextId++
  };
}
function addArtwork(doc, inputs, name = 'ASCII') {
  if (!inputs.length) throw new Error('Нет символов для добавления.');
  if (doc.layers.length >= MAX_LAYERS) throw new Error('В проекте допускается до 128 слоёв.');
  if (doc.entities.length + inputs.length > MAX_ENTITIES)
    throw new Error('Лимит — 10 000 объектов.');
  const baseName = String(name).trim().slice(0, 180) || 'ASCII';
  let label = baseName,
    suffix = 2;
  while (doc.layers.some((layer) => layer.name === label)) label = `${baseName} (${suffix++})`;
  // Layer IDs share the monotonic ID source, so deleting a layer never reuses its ID.
  const layer = {
    id: `art-${doc.nextId++}`,
    name: label,
    kind: 'artwork',
    visible: true,
    locked: false
  };
  const index = doc.layers.findIndex((l) => l.id === 'heroes');
  doc.layers.splice(index < 0 ? doc.layers.length : index, 0, layer);
  const items = inputs.map((input) => entity(doc, { ...input, layer: layer.id }));
  doc.entities.push(...items);
  return { layer, items };
}
function deleteArtwork(doc, layerId) {
  const layer = doc.layers.find((l) => l.id === layerId);
  if (!layer || layer.kind !== 'artwork' || layer.locked) return false;
  doc.entities = doc.entities.filter((e) => e.layer !== layerId);
  doc.layers = doc.layers.filter((l) => l.id !== layerId);
  return true;
}
function importDota(data, index = 0) {
  if (!data || data.version !== 3 || !Array.isArray(data.configs) || !data.configs.length)
    throw new Error('Ожидается Dota JSON версии 3 с массивом configs.');
  if (data.configs.length > MAX_CONFIGS)
    throw new Error('В файле слишком много сеток (максимум 100).');
  for (const config of data.configs) {
    if (
      !config ||
      typeof config.config_name !== 'string' ||
      config.config_name.length > 200 ||
      !Array.isArray(config.categories)
    )
      throw new Error('У сетки должны быть config_name и categories.');
    if (config.categories.length > MAX_ENTITIES)
      throw new Error('В одной сетке допускается до 10 000 объектов.');
    for (const c of config.categories) {
      if (
        !c ||
        typeof c.category_name !== 'string' ||
        c.category_name.length > 5000 ||
        !['x_position', 'y_position', 'width', 'height'].every((k) => finite(c[k])) ||
        c.width <= 0 ||
        c.height <= 0 ||
        Math.abs(c.x_position) > 100000 ||
        Math.abs(c.y_position) > 100000 ||
        c.width > 100000 ||
        c.height > 100000 ||
        !Array.isArray(c.hero_ids) ||
        c.hero_ids.length > 1000 ||
        c.hero_ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
      )
        throw new Error(
          'В файле есть некорректная категория: проверьте координаты, размеры и ID героев.'
        );
    }
  }
  if (!Number.isInteger(index) || index < 0 || index >= data.configs.length)
    throw new Error('Сетка не найдена.');
  const config = data.configs[index],
    doc = createDocument(config.config_name);
  doc.source = clone(data);
  doc.configIndex = index;
  doc.entities = config.categories.map((c) =>
    entity(doc, {
      type: c.hero_ids.length
        ? 'heroes'
        : Array.from(c.category_name).length === 1
          ? 'symbol'
          : 'text',
      name: c.category_name,
      text: c.category_name,
      x: c.x_position,
      y: c.y_position,
      w: c.width,
      h: c.height,
      heroIds: [...c.hero_ids],
      layer: c.hero_ids.length ? 'heroes' : 'decor',
      extra: clone(c)
    })
  );
  return doc;
}
function exportDota(doc) {
  assertCategoryLimit(doc);
  const result = clone(doc.source);
  const states = { ...(doc.configDrafts || {}), [doc.configIndex]: doc };
  for (const [index, state] of Object.entries(states)) {
    const hidden = new Set(state.layers.filter((l) => !l.visible).map((l) => l.id));
    const categories = state.entities
      .filter((e) => !hidden.has(e.layer))
      .flatMap((item) =>
        item.rowText && !normalizeAngle(item.rotation || 0)
          ? [{ ...item, text: item.rowText }]
          : textGlyphs(item)
      )
      .map((e) => ({
        ...(e.extra || {}),
        category_name: e.type === 'heroes' ? e.name : e.text,
        x_position: +e.x.toFixed(6),
        y_position: +e.y.toFixed(6),
        width: +e.w.toFixed(6),
        height: +e.h.toFixed(6),
        hero_ids: e.type === 'heroes' ? [...e.heroIds] : []
      }));
    if (categories.length > MAX_ENTITIES)
      throw new Error(
        'После разделения текста получается больше 10 000 категорий. Уменьши количество символов.'
      );
    result.configs[index] = { ...result.configs[index], config_name: state.name, categories };
  }
  // Dota does not store an editor canvas size. Only category positions and hero
  // dimensions are exported; every category without heroes has a 30px box.
  for (const config of result.configs)
    for (const category of config.categories)
      if (!category.hero_ids.length) {
        category.width = 30;
        category.height = 30;
      }
  return result;
}
function categoryCount(state) {
  const hidden = new Set(state.layers.filter((layer) => !layer.visible).map((layer) => layer.id));
  return state.entities.reduce((count, item) => {
    if (hidden.has(item.layer)) return count;
    return (
      count +
      (item.rowGlyphs
        ? item.rowText && !normalizeAngle(item.rotation || 0)
          ? 1
          : item.rowGlyphs.length
        : item.type !== 'heroes' &&
            normalizeAngle(item.rotation || 0) &&
            Array.from(item.text).length > 1
          ? Array.from(item.text.toUpperCase()).filter((char) => !/\s/u.test(char)).length
          : 1)
    );
  }, 0);
}
function assertCategoryLimit(doc) {
  const states = { ...(doc.configDrafts || {}), [doc.configIndex]: doc };
  for (const state of Object.values(states)) {
    const hidden = new Set(state.layers.filter((layer) => !layer.visible).map((layer) => layer.id));
    let count = 0;
    for (const item of state.entities) {
      if (hidden.has(item.layer)) continue;
      count += item.rowGlyphs
        ? item.rowText && !normalizeAngle(item.rotation || 0)
          ? 1
          : item.rowGlyphs.length
        : item.type !== 'heroes' &&
            normalizeAngle(item.rotation || 0) &&
            Array.from(item.text).length > 1
          ? Array.from(item.text.toUpperCase()).filter((char) => !/\s/u.test(char)).length
          : 1;
      if (count > MAX_ENTITIES)
        throw new Error(
          'После разделения текста получается больше 10 000 категорий. Уменьши количество символов.'
        );
    }
  }
}
function switchConfig(doc, index) {
  const drafts = clone(doc.configDrafts || {});
  drafts[doc.configIndex] = clone({
    name: doc.name,
    nextId: doc.nextId,
    entities: doc.entities,
    layers: doc.layers,
    canvas: canvasSize(doc),
    ...(doc.reference ? { reference: doc.reference } : {})
  });
  const next = importDota(doc.source, index);
  if (drafts[index]) Object.assign(next, clone(drafts[index]));
  next.configDrafts = drafts;
  if (doc.fileName !== undefined) next.fileName = doc.fileName;
  return next;
}
function configurations(doc) {
  return doc.source.configs.map((config, index) => {
    const state = index === doc.configIndex ? doc : doc.configDrafts?.[index];
    return { index, name: state ? state.name : config.config_name };
  });
}
function addConfig(doc, name = 'Новая сетка', kind = 'blank') {
  if (doc.source.configs.length >= MAX_CONFIGS)
    throw new Error('В одном файле допускается до 100 сеток.');
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 200)
    throw new Error('Название сетки должно содержать от 1 до 200 символов.');
  if (!['blank', 'roles', 'minimal'].includes(kind)) throw new Error('Неизвестный шаблон сетки.');
  const names = new Set(configurations(doc).map((config) => config.name));
  const baseName = name.trim();
  let title = baseName,
    suffix = 2;
  while (names.has(title)) title = `${baseName.slice(0, 190)} (${suffix++})`;
  const source = clone(doc.source);
  source.configs.push({ config_name: title, categories: [] });
  // Cache the current grid before adding another; never flatten away hidden studio layers.
  const next = switchConfig({ ...doc, source }, source.configs.length - 1);
  const template = demoDocument(kind);
  Object.assign(next, {
    name: title,
    nextId: template.nextId,
    entities: template.entities,
    layers: template.layers
  });
  return next;
}
function importProject(data) {
  if (
    !data ||
    data.app !== 'dota-grid-studio' ||
    data.schema !== 1 ||
    !Array.isArray(data.entities) ||
    data.entities.length > MAX_ENTITIES ||
    !Array.isArray(data.layers) ||
    data.layers.length < 3 ||
    data.layers.length > MAX_LAYERS ||
    typeof data.name !== 'string' ||
    data.name.length > 200 ||
    (data.fileName !== undefined &&
      (typeof data.fileName !== 'string' || data.fileName.length > 255)) ||
    !Number.isSafeInteger(data.nextId) ||
    data.nextId < 1
  )
    throw new Error('Не удалось прочитать проект Grid Studio.');
  importDota(data.source, data.configIndex);
  if (data.canvas !== undefined) validateCanvas(data.canvas);
  const ids = new Set(),
    baseLayers = new Set(['background', 'heroes', 'decor']);
  if (data.reference !== undefined) {
    const r = data.reference;
    if (
      !r ||
      typeof r.src !== 'string' ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(r.src) ||
      r.src.length > 2500000 ||
      typeof r.name !== 'string' ||
      r.name.length > 200 ||
      !['x', 'y', 'w', 'h', 'opacity'].every((key) => finite(r[key])) ||
      r.w <= 0 ||
      r.h <= 0 ||
      r.w > 100000 ||
      r.h > 100000 ||
      Math.abs(r.x) > 100000 ||
      Math.abs(r.y) > 100000 ||
      r.opacity < 0 ||
      r.opacity > 1 ||
      typeof r.visible !== 'boolean'
    )
      throw new Error('Некорректный фон-ориентир.');
  }
  const layerIds = new Set();
  for (const layer of data.layers) {
    if (
      !layer ||
      typeof layer.id !== 'string' ||
      (!baseLayers.has(layer.id) && !/^art-[1-9]\d*$/.test(layer.id)) ||
      (!baseLayers.has(layer.id) &&
        (layer.kind !== 'artwork' || Number(layer.id.slice(4)) >= data.nextId)) ||
      layerIds.has(layer.id) ||
      typeof layer.name !== 'string' ||
      layer.name.length > 200 ||
      typeof layer.visible !== 'boolean' ||
      typeof layer.locked !== 'boolean'
    )
      throw new Error('Некорректный слой проекта.');
    layerIds.add(layer.id);
  }
  if ([...baseLayers].some((id) => !layerIds.has(id)))
    throw new Error('В проекте отсутствует основной слой.');
  for (const e of data.entities) {
    if (
      !e ||
      !Number.isSafeInteger(e.id) ||
      e.id < 1 ||
      e.id >= data.nextId ||
      ids.has(e.id) ||
      !['heroes', 'text', 'symbol'].includes(e.type) ||
      !layerIds.has(e.layer) ||
      !['x', 'y', 'w', 'h'].every((k) => finite(e[k])) ||
      (e.rotation !== undefined &&
        (!finite(e.rotation) ||
          Math.abs(e.rotation) > 360000 ||
          (e.type === 'heroes' && e.rotation !== 0))) ||
      (e.textMetrics !== undefined &&
        (!e.textMetrics ||
          typeof e.textMetrics.text !== 'string' ||
          e.textMetrics.text.length > 10000 ||
          !Array.isArray(e.textMetrics.advances) ||
          e.textMetrics.advances.length !== Array.from(e.textMetrics.text).length ||
          e.textMetrics.advances.some(
            (advance) => !finite(advance) || advance < 0 || advance > 10000
          ))) ||
      (e.rowGlyphs !== undefined &&
        (!Array.isArray(e.rowGlyphs) ||
          !e.rowGlyphs.length ||
          e.rowGlyphs.length > 5000 ||
          e.rowGlyphs.some(
            (g) =>
              !g ||
              typeof g.text !== 'string' ||
              Array.from(g.text).length !== 1 ||
              !['x', 'w', 'h'].every((key) => finite(g[key])) ||
              g.w <= 0 ||
              g.h <= 0 ||
              Math.abs(g.x) > 100000 ||
              g.w > 100000 ||
              g.h > 100000
          ) ||
          e.rowGlyphs.map((g) => g.text).join('') !== e.text)) ||
      (e.rowText !== undefined &&
        (!e.rowGlyphs ||
          typeof e.rowText !== 'string' ||
          e.rowText.length > 5000 ||
          e.rowText.replace(/\s/gu, '') !== e.text.replace(/\s/gu, ''))) ||
      e.w <= 0 ||
      e.h <= 0 ||
      e.w > 100000 ||
      e.h > 100000 ||
      Math.abs(e.x) > 100000 ||
      Math.abs(e.y) > 100000 ||
      typeof e.name !== 'string' ||
      e.name.length > 5000 ||
      typeof e.text !== 'string' ||
      e.text.length > 5000 ||
      !Array.isArray(e.heroIds) ||
      e.heroIds.length > 1000 ||
      e.heroIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
    )
      throw new Error('В проекте есть некорректный объект.');
    ids.add(e.id);
  }
  const copy = clone(data);
  if (copy.configDrafts !== undefined) {
    if (
      !copy.configDrafts ||
      typeof copy.configDrafts !== 'object' ||
      Array.isArray(copy.configDrafts)
    )
      throw new Error('Некорректные черновики сеток.');
    for (const [index, draft] of Object.entries(copy.configDrafts)) {
      if (
        !/^\d+$/.test(index) ||
        Number(index) >= copy.source.configs.length ||
        !draft ||
        typeof draft !== 'object'
      )
        throw new Error('Некорректный черновик сетки.');
      importProject({
        ...draft,
        app: 'dota-grid-studio',
        schema: 1,
        source: copy.source,
        configIndex: Number(index),
        configDrafts: undefined
      });
    }
  }
  importDota(exportDota(copy), copy.configIndex);
  return copy;
}
function visualHeight(e) {
  // Dota stores the HeroList height; its category header is outside that height.
  return e.h + (e.type === 'heroes' ? DOTA.header : 0);
}
// Rotation describes the arrangement of upright characters, never glyph tilt.
// Single-character entities already have their final x/y; only text runs expand.
function textGlyphs(item, force = false) {
  if (item.rowGlyphs)
    return item.rowGlyphs.map((glyph) => {
      const center = rotatePoint(
        { x: item.x + glyph.x + glyph.w / 2, y: item.y + glyph.h / 2 },
        frameCenter(entityFrame(item)),
        item.rotation || 0
      );
      return {
        ...item,
        ...glyph,
        type: 'symbol',
        name: glyph.text,
        x: center.x - glyph.w / 2,
        y: center.y - glyph.h / 2,
        rotation: 0,
        rowGlyphs: undefined,
        rowText: undefined,
        extra: glyph.extra || item.extra
      };
    });
  if (
    item.type === 'heroes' ||
    (!force && !normalizeAngle(item.rotation || 0)) ||
    Array.from(item.text || '').length < 2
  )
    return [item.rotation ? { ...item, rotation: 0 } : item];
  const text = String(item.text).toUpperCase();
  const advances = item.textMetrics?.text === text ? item.textMetrics.advances : null;
  const result = [],
    center = frameCenter(entityFrame(item));
  let x = item.x,
    y = item.y;
  Array.from(text).forEach((char, index) => {
    if (char === '\n') {
      x = item.x;
      y += DOTA.header;
      return;
    }
    if (!/\s/u.test(char)) {
      // Every exported glyph keeps the same upright 30 × 30 Dota category.
      const position = rotatePoint({ x: x + 15, y: y + 15 }, center, item.rotation || 0);
      result.push({
        ...item,
        type: 'symbol',
        text: char,
        name: char,
        x: position.x - 15,
        y: position.y - 15,
        w: 30,
        h: 30,
        rotation: 0
      });
    }
    x += advances?.[index] ?? 10.8;
  });
  return result;
}
function normalizeAngle(angle) {
  const result = ((angle % 360) + 360) % 360;
  return Math.abs(result) < 1e-9 || Math.abs(result - 360) < 1e-9 ? 0 : result;
}
function rotatePoint(point, center, angle) {
  const radians = (angle * Math.PI) / 180,
    cos = Math.cos(radians),
    sin = Math.sin(radians);
  const x = point.x - center.x,
    y = point.y - center.y;
  return { x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos };
}
function frameCenter(frame) {
  return { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };
}
function frameCorners(frame) {
  return [
    { corner: 'nw', x: frame.x, y: frame.y },
    { corner: 'ne', x: frame.x + frame.w, y: frame.y },
    { corner: 'sw', x: frame.x, y: frame.y + frame.h },
    { corner: 'se', x: frame.x + frame.w, y: frame.y + frame.h }
  ].map((p) => ({ ...p, ...rotatePoint(p, frameCenter(frame), frame.rotation || 0) }));
}
function entityFrame(item, visual = true) {
  return {
    x: item.x,
    y: item.y,
    w: item.w,
    h: visual ? visualHeight(item) : item.h,
    rotation: item.rotation || 0
  };
}
function containsPoint(item, point) {
  return textGlyphs(item).some(
    (glyph) =>
      point.x >= glyph.x &&
      point.y >= glyph.y &&
      point.x <= glyph.x + glyph.w &&
      point.y <= glyph.y + visualHeight(glyph)
  );
}
function selectionFrame(items) {
  if (!items.length) return null;
  if (items.length === 1)
    return { ...entityFrame(items[0]), rotation: normalizeAngle(items[0].rotation || 0) };
  const rotation = normalizeAngle(items[0].rotation || 0);
  if (rotation === 0 && items.every((item) => !normalizeAngle(item.rotation || 0)))
    return { ...bounds(items, true), rotation: 0 };
  if (!items.every((item) => Math.abs(normalizeAngle(item.rotation || 0) - rotation) < 1e-8))
    return { ...bounds(items, true), rotation: 0 };
  const points = items
    // Keep the transform pivot stable; upright glyph hit boxes are calculated separately.
    .flatMap((item) => frameCorners(entityFrame(item)))
    .map((p) => rotatePoint(p, { x: 0, y: 0 }, -rotation));
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  const w = Math.max(...points.map((p) => p.x)) - x,
    h = Math.max(...points.map((p) => p.y)) - y;
  const center = rotatePoint({ x: x + w / 2, y: y + h / 2 }, { x: 0, y: 0 }, rotation);
  return { x: center.x - w / 2, y: center.y - h / 2, w, h, rotation };
}
function rotateItems(items, frame, delta) {
  return items.map((item) => {
    const center = rotatePoint(frameCenter(entityFrame(item)), frameCenter(frame), delta);
    return {
      x: center.x - item.w / 2,
      y: center.y - visualHeight(item) / 2,
      rotation: normalizeAngle((item.rotation || 0) + delta)
    };
  });
}
function rotationDelta(center, previous, current) {
  if (Math.hypot(current.x - center.x, current.y - center.y) < 1e-6) return 0;
  const angle = (p) => (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI;
  return ((angle(current) - angle(previous) + 540) % 360) - 180;
}
function transformHandle(frame, point, zoom, allowRotate = false) {
  if (!frame) return null;
  const local = rotatePoint(point, frameCenter(frame), -(frame.rotation || 0));
  const corner = resizeCorner(frame, local, 10 / zoom);
  if (corner) return { type: 'resize', corner };
  if (
    !allowRotate ||
    (local.x >= frame.x &&
      local.y >= frame.y &&
      local.x <= frame.x + frame.w &&
      local.y <= frame.y + frame.h)
  )
    return null;
  const nearest = frameCorners(frame).sort(
    (a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y)
  )[0];
  return Math.hypot(nearest.x - point.x, nearest.y - point.y) <= 28 / zoom
    ? { type: 'rotate', corner: nearest.corner }
    : null;
}
function resizeInFrame(items, frame, delta, corner, proportional, minSize = 10) {
  const localDelta = rotatePoint(delta, { x: 0, y: 0 }, -(frame.rotation || 0));
  const next = resizeBounds(frame, localDelta, corner, proportional, minSize);
  return items.map((item) => {
    const center = rotatePoint(
      frameCenter(entityFrame(item)),
      frameCenter(frame),
      -(frame.rotation || 0)
    );
    const localItem = { ...item, x: center.x - item.w / 2, y: center.y - visualHeight(item) / 2 };
    const resized = transformBounds(localItem, frame, next, true);
    const worldCenter = rotatePoint(
      frameCenter(entityFrame({ ...item, ...resized })),
      frameCenter(frame),
      frame.rotation || 0
    );
    return {
      ...resized,
      x: worldCenter.x - resized.w / 2,
      y: worldCenter.y - visualHeight({ ...item, ...resized }) / 2
    };
  });
}
function bounds(items, visual = false) {
  if (!items.length) return null;
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const e of visual ? items.flatMap((item) => textGlyphs(item)) : items) {
    const points = [
      { x: e.x, y: e.y },
      { x: e.x + e.w, y: e.y + (visual ? visualHeight(e) : e.h) }
    ];
    for (const p of points) {
      x = Math.min(x, p.x);
      y = Math.min(y, p.y);
      right = Math.max(right, p.x);
      bottom = Math.max(bottom, p.y);
    }
  }
  return { x, y, w: right - x, h: bottom - y };
}
function outside(e, size = { w: WIDTH, h: HEIGHT }) {
  const b = bounds([e], true);
  return b.x < 0 || b.y < 0 || b.x + b.w > size.w || b.y + b.h > size.h;
}
function warnings(doc) {
  const visible = doc.entities.filter((e) => doc.layers.find((l) => l.id === e.layer)?.visible);
  const issues = [];
  const count = visible.filter((e) => outside(e, canvasSize(doc))).length;
  if (count) issues.push(`${count} объект(а) выходят за границы холста.`);
  if (visible.some((e) => /[║═]/u.test(e.text)))
    issues.push('Символы ║ и ═ могут отображаться в Dota некорректно.');
  if (categoryCount(doc) > 2000)
    issues.push('Более 2 000 категорий: возможны лаги и вылет Dota 2.');
  if (doc.layers.some((l) => !l.visible && doc.entities.some((e) => e.layer === l.id)))
    issues.push('Скрытые слои не попадут в Dota JSON. В проекте они сохранятся.');
  return issues;
}
class History {
  constructor(limit = 50) {
    this.limit = limit;
    this.past = [];
    this.future = [];
  }
  push(doc) {
    this.past.push(JSON.stringify(doc));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
  undo(doc) {
    if (!this.past.length) return doc;
    this.future.push(JSON.stringify(doc));
    return JSON.parse(this.past.pop());
  }
  redo(doc) {
    if (!this.future.length) return doc;
    this.past.push(JSON.stringify(doc));
    return JSON.parse(this.future.pop());
  }
}
function sampleLine(a, b, step = 10) {
  const count = Math.min(2000, Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step)));
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / count,
    y: a.y + ((b.y - a.y) * i) / count
  }));
}
function shapePoints(tool, a, b, step = 14) {
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y),
    w = Math.abs(a.x - b.x),
    h = Math.abs(a.y - b.y);
  if (tool === 'line') return sampleLine(a, b, step);
  if (tool === 'hline') return sampleLine(a, { x: b.x, y: a.y }, step);
  if (tool === 'vline') return sampleLine(a, { x: a.x, y: b.y }, step);
  if (tool === 'rectfill' || tool === 'fill') {
    const points = [];
    for (let yy = y; yy <= y + h; yy += step)
      for (let xx = x; xx <= x + w; xx += step) {
        if (points.length < MAX_ENTITIES) points.push({ x: xx, y: yy });
      }
    return points;
  }
  if (tool === 'ellipse' || tool === 'spiral' || tool === 'wave') {
    const count = Math.max(12, Math.ceil((Math.PI * (w + h)) / step));
    return Array.from({ length: count + 1 }, (_, i) => {
      const t = i / count,
        angle = t * Math.PI * (tool === 'spiral' ? 6 : 2),
        radius = tool === 'spiral' ? t : 1;
      return tool === 'wave'
        ? { x: x + t * w, y: y + h / 2 + (Math.sin(t * Math.PI * 6) * h) / 2 }
        : {
            x: x + w / 2 + ((Math.cos(angle) * w) / 2) * radius,
            y: y + h / 2 + ((Math.sin(angle) * h) / 2) * radius
          };
    });
  }
  let vertices;
  if (tool === 'diamond')
    vertices = [
      { x: x + w / 2, y },
      { x: x + w, y: y + h / 2 },
      { x: x + w / 2, y: y + h },
      { x, y: y + h / 2 }
    ];
  else if (tool === 'triangle')
    vertices = [
      { x: x + w / 2, y },
      { x: x + w, y: y + h },
      { x, y: y + h }
    ];
  else if (tool === 'star')
    vertices = Array.from({ length: 10 }, (_, i) => {
      const a = (i * Math.PI) / 5 - Math.PI / 2,
        r = i % 2 ? 0.43 : 1;
      return {
        x: x + w / 2 + ((Math.cos(a) * w) / 2) * r,
        y: y + h / 2 + ((Math.sin(a) * h) / 2) * r
      };
    });
  else
    vertices = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h }
    ];
  return vertices.flatMap((p, i) => sampleLine(p, vertices[(i + 1) % vertices.length], step));
}
function demoDocument(kind = 'roles') {
  const doc = createDocument(
    kind === 'blank' ? 'Новая сетка' : kind === 'minimal' ? 'Мой пул героев' : 'Сетка по ролям'
  );
  if (kind === 'blank') return doc;
  const groups =
    kind === 'minimal'
      ? [
          ['МОЙ ПУЛ', [1, 8, 44, 11, 13, 14, 25, 5, 86], 120, 145, 420, 265],
          ['ХОЧУ ОСВОИТЬ', [74, 129, 138, 19, 128, 123], 650, 145, 420, 265]
        ]
      : [
          ['КЕРРИ', [1, 8, 44, 67, 10, 54], 45, 92, 340, 195],
          ['МИД', [11, 13, 74, 25, 39, 106], 425, 92, 340, 195],
          ['ОФФЛЕЙН', [2, 129, 28, 29, 96, 137], 805, 92, 340, 195],
          ['ПОДДЕРЖКА', [14, 86, 26, 20, 9, 107], 235, 330, 340, 195],
          ['ПОЛНАЯ ПОДДЕРЖКА', [5, 30, 111, 87, 64, 66], 615, 330, 340, 195]
        ];
  for (const [name, heroIds, x, y, w, h] of groups)
    doc.entities.push(entity(doc, { type: 'heroes', name, heroIds, x, y, w, h, layer: 'heroes' }));
  doc.entities.push(
    entity(doc, {
      type: 'text',
      name: 'Заголовок',
      text: kind === 'minimal' ? 'МОЙ ПУЛ' : 'ГЕРОИ ПО РОЛЯМ',
      x: 425,
      y: 28,
      w: 370,
      h: 30,
      layer: 'decor'
    })
  );
  return doc;
}
// Drag deltas preserve the initial click offset and keep the opposite corner fixed.
function resizeBounds(b, delta, corner = 'se', proportional = false, minSize = 10) {
  const west = corner.includes('w'),
    north = corner.includes('n');
  let sx = (b.w + delta.x * (west ? -1 : 1)) / b.w;
  let sy = (b.h + delta.y * (north ? -1 : 1)) / b.h;
  if (proportional) {
    const scale = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
    sx = sy = Math.max(minSize / b.w, minSize / b.h, scale);
  } else {
    sx = Math.max(minSize / b.w, sx);
    sy = Math.max(minSize / b.h, sy);
  }
  return {
    x: west ? b.x + b.w - b.w * sx : b.x,
    y: north ? b.y + b.h - b.h * sy : b.y,
    w: b.w * sx,
    h: b.h * sy
  };
}
function resizeCorner(b, point, tolerance) {
  if (!b) return null;
  // Leave a draggable center even when an object is smaller than the handle hit areas.
  tolerance = Math.min(tolerance, b.w / 4, b.h / 4);
  const corners = [
    ['nw', b.x, b.y],
    ['ne', b.x + b.w, b.y],
    ['sw', b.x, b.y + b.h],
    ['se', b.x + b.w, b.y + b.h]
  ];
  return (
    corners
      .filter(
        ([, x, y]) => Math.abs(point.x - x) <= tolerance && Math.abs(point.y - y) <= tolerance
      )
      .sort(
        (a, z) =>
          Math.hypot(point.x - a[1], point.y - a[2]) - Math.hypot(point.x - z[1], point.y - z[2])
      )[0]?.[0] || null
  );
}
function transformBounds(item, before, after, visual = false) {
  const sx = after.w / before.w,
    sy = after.h / before.h;
  return {
    ...(item.rowGlyphs
      ? {
          rowGlyphs: item.rowGlyphs.map((g) => ({ ...g, x: g.x * sx, w: g.w * sx, h: g.h * sy })),
          rowText: undefined
        }
      : {}),
    x: after.x + (item.x - before.x) * sx,
    y: after.y + (item.y - before.y) * sy,
    w: Math.max(1, item.w * sx),
    h: Math.max(
      1,
      (visual ? visualHeight(item) : item.h) * sy -
        (visual && item.type === 'heroes' ? DOTA.header : 0)
    )
  };
}
function heroLayout(group, pad = DOTA.listPadding) {
  // Fit 51 × 83 cells in the HeroList. Its fixed padding is outside the scaled
  // cards; each image has a 4 px inset that scales with its cell, as in Dota.
  const aw = Math.max(1, group.w - pad * 2),
    ah = Math.max(1, group.h - pad * 2);
  let best = null;
  for (let cols = 1; cols <= group.heroIds.length; cols++) {
    const rows = Math.ceil(group.heroIds.length / cols);
    const scale = Math.min(aw / (cols * DOTA.cellWidth), ah / (rows * DOTA.cellHeight));
    // The game packs every column that fits at the winning card scale.
    // Equal scales occur when height limits several adjacent column counts.
    if (!best || scale >= best.scale - 1e-10) {
      const inset = DOTA.imageMargin * scale,
        cardW = (DOTA.cellWidth - DOTA.imageMargin * 2) * scale,
        cardH = (DOTA.cellHeight - DOTA.imageMargin * 2) * scale;
      best = {
        cols,
        rows,
        scale,
        cardW,
        cardH,
        size: cardW,
        gap: inset * 2,
        pad,
        left: pad + inset,
        top: DOTA.header + pad + inset,
        stepX: DOTA.cellWidth * scale,
        stepY: DOTA.cellHeight * scale
      };
    }
  }
  return best;
}
// Unicode code points, excluding whitespace; hero and group names are not artwork.
function countSymbols(doc) {
  return doc.entities.reduce(
    (total, e) =>
      total + (e.type === 'heroes' ? 0 : [...e.text].filter((ch) => !/\s/u.test(ch)).length),
    0
  );
}
export default {
  WIDTH,
  HEIGHT,
  MAX_ENTITIES,
  MAX_LAYERS,
  MAX_CONFIGS,
  canvasSize,
  validateCanvas,
  categoryCount,
  clone,
  clamp,
  createDocument,
  entity,
  addArtwork,
  deleteArtwork,
  importDota,
  exportDota,
  assertCategoryLimit,
  importProject,
  switchConfig,
  configurations,
  addConfig,
  bounds,
  visualHeight,
  outside,
  warnings,
  History,
  sampleLine,
  shapePoints,
  demoDocument,
  resizeBounds,
  resizeCorner,
  normalizeAngle,
  rotatePoint,
  frameCenter,
  frameCorners,
  entityFrame,
  containsPoint,
  selectionFrame,
  rotateItems,
  textGlyphs,
  rotationDelta,
  transformHandle,
  resizeInFrame,
  transformBounds,
  heroLayout,
  countSymbols
};
