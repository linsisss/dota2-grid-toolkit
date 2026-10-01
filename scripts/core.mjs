import { DOTA, advanceAt, foreignGlyphs, foreignNoticeable, foreignSample, invisibleGlyphs, invisibleWarning } from './dota-rendering.mjs';
import { compactCategoryRows, packPickRows, plainCategory } from './export-rows.mjs';
import { t } from './i18n.mjs';

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
// The base layers keep these Russian names in every document; they are shown in the page's language.
const layerName = (layer) => (layers().some((base) => base.id === layer.id && base.name === layer.name) ? t(layer.name) : layer.name);
function canvasSize(doc) {
  return doc?.canvas || { w: WIDTH, h: HEIGHT };
}
function validateCanvas(size) {
  if (
    !size ||
    !['w', 'h'].every((key) => Number.isInteger(size[key]) && size[key] >= 100 && size[key] <= 6000)
  )
    throw new Error(t('Размеры холста — целые числа от 100 до 6000 px.'));
  return { w: size.w, h: size.h };
}
function createDocument(name = t('Новая сетка')) {
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
  if (!inputs.length) throw new Error(t('Нет символов для добавления.'));
  if (doc.layers.length >= MAX_LAYERS) throw new Error(t('В проекте допускается до 128 слоёв.'));
  if (doc.entities.length + inputs.length > MAX_ENTITIES)
    throw new Error(t('Лимит — 10 000 объектов.'));
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
// Groups are artwork layers flagged `group`: the project format is unchanged, a click
// selects the whole group, Alt+click one member, and the layers panel lists it.
function groupEntities(doc, ids) {
  const chosen = new Set(ids), members = doc.entities.filter((e) => chosen.has(e.id));
  if (members.length < 2) throw new Error(t('Выдели хотя бы два объекта, чтобы объединить их.'));
  const sources = [...new Set(members.map((e) => e.layer))];
  const only = sources.length === 1 ? doc.layers.find((l) => l.id === sources[0]) : null;
  if (only?.kind === 'artwork' && doc.entities.every((e) => e.layer !== only.id || chosen.has(e.id))) {
    only.group = true;
    return only;
  }
  if (doc.layers.length >= MAX_LAYERS) throw new Error(t('В проекте допускается до 128 слоёв.'));
  let n = doc.layers.filter((l) => l.group).length + 1;
  while (doc.layers.some((l) => l.name === t('Группа {n}', { n }))) n++;
  const layer = { id: `art-${doc.nextId++}`, name: t('Группа {n}', { n }), kind: 'artwork', group: true, visible: true, locked: false };
  // Keep the group where its topmost member was drawn.
  doc.layers.splice(Math.max(...sources.map((id) => doc.layers.findIndex((l) => l.id === id))) + 1, 0, layer);
  for (const e of members) e.layer = layer.id;
  doc.layers = doc.layers.filter((l) => l.kind !== 'artwork' || l === layer || doc.entities.some((e) => e.layer === l.id));
  return layer;
}
// Dissolves groups (or ASCII layers) into loose objects on the base layers.
function ungroupLayers(doc, layerIds) {
  const targets = doc.layers.filter((l) => layerIds.includes(l.id) && l.kind === 'artwork' && !l.locked);
  const ids = new Set(targets.map((l) => l.id));
  for (const e of doc.entities) if (ids.has(e.layer)) e.layer = e.type === 'heroes' ? 'heroes' : 'decor';
  doc.layers = doc.layers.filter((l) => !ids.has(l.id));
  return targets.length;
}
function importDota(data, index = 0) {
  if (!data || data.version !== 3 || !Array.isArray(data.configs) || !data.configs.length)
    throw new Error(t('Ожидается Dota JSON версии 3 с массивом configs.'));
  if (data.configs.length > MAX_CONFIGS)
    throw new Error(t('В файле слишком много сеток (максимум 100).'));
  const normalized = clone(data), repairs = [];
  for (const [configIndex, config] of normalized.configs.entries()) {
    if (
      !config ||
      typeof config.config_name !== 'string' ||
      config.config_name.length > 200 ||
      !Array.isArray(config.categories)
    )
      throw new Error(t('У сетки должны быть config_name и categories.'));
    if (config.categories.length > MAX_ENTITIES)
      throw new Error(t('В одной сетке допускается до 10 000 объектов.'));
    for (const [categoryIndex, c] of config.categories.entries()) {
      if (
        !c ||
        typeof c.category_name !== 'string' ||
        c.category_name.length > 5000 ||
        !['x_position', 'y_position', 'width', 'height'].every((k) => finite(c[k])) ||
        Math.abs(c.x_position) > 100000 ||
        Math.abs(c.y_position) > 100000 ||
        Math.abs(c.width) > 100000 ||
        Math.abs(c.height) > 100000 ||
        !Array.isArray(c.hero_ids) ||
        c.hero_ids.length > 1000 ||
        c.hero_ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
      )
        throw new Error(
          t('Сетка «{grid}», категория {category}: координаты и размеры должны быть конечными числами, hero_ids — массивом положительных целых ID.', { grid: config.config_name, category: categoryIndex + 1 })
        );
      if (c.width <= 0 || c.height <= 0) {
        repairs.push({ configIndex, categoryIndex, width: c.width, height: c.height });
        // Legacy tools wrote zero/negative boxes even though text is rendered
        // at a fixed font size. Recover boxes, never rescale artwork positions.
        if (c.width <= 0) c.width = c.hero_ids.length ? Math.abs(c.width) || 340 : 30;
        if (c.height <= 0) c.height = c.hero_ids.length ? Math.abs(c.height) || 195 : 30;
      }
    }
  }
  if (!Number.isInteger(index) || index < 0 || index >= data.configs.length)
    throw new Error(t('Сетка не найдена.'));
  const config = normalized.configs[index],
    doc = createDocument(config.config_name);
  doc.source = normalized;
  if (repairs.length) doc.importRepairs = repairs;
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
function categoryEntries(state) {
    const hidden = new Set(state.layers.filter((l) => !l.visible).map((l) => l.id));
    return state.entities
      .filter((e) => !hidden.has(e.layer))
      .flatMap((item) =>
        item.rowText && !normalizeAngle(item.rotation || 0)
          ? [{ ...item, text: item.rowText }]
          : textGlyphs(item)
      )
      .map((e) => ({ layer: e.layer, entityId: e.id, category: {
        ...(e.extra || {}),
        category_name: e.type === 'heroes' ? e.name : e.text,
        x_position: +e.x.toFixed(6),
        y_position: +e.y.toFixed(6),
        width: +e.w.toFixed(6),
        height: +e.h.toFixed(6),
        hero_ids: e.type === 'heroes' ? [...e.heroIds] : []
      } }));
}
// A download for every screen (docs/zoom-and-optimization.md «Экран выбора героя»). Dota's hero-
// pick screen shows only the first line of a name, and it and every resolution but 1080p set
// the glyphs of one name apart from where the «Герои» page puts them. So every multi-line name
// becomes one category per line (the page's line step, DOTA.header); every row of art glyphs
// (no letters or digits, or runs of spaces: rows of the ASCII methods, rows from 1.5 files) and
// every single glyph becomes glyphs at the page's advances, which join again into rows that
// hold on every screen (export-rows.mjs packPickRows) — or, without `rows`, stay one per
// category. `singles: false` leaves one-glyph names where they are (grids from before 1.5 are
// exact everywhere already). Plain text lines and lines Dota does not draw at all (braille)
// stay whole. Hero categories go last: drawn on top, nothing covers
// their cards and takes their clicks.
// widths(line) → raw glyph widths of one upper-cased line (dota-rendering glyphWidths).
const artLine = (line) => /\s{2,}/u.test(line) || !/[\p{L}\p{N}]/u.test(line);
function pickSafeCategories(categories, widths, { rows = true, singles = true } = {}) {
  const heroes = [], out = [], points = [];
  categories.forEach((category, index) => {
    const name = category.category_name;
    if (category.hero_ids?.length) return void heroes.push(category);
    if (typeof name !== 'string' || !plainCategory(category)) return void out.push({ category, index, x: 0 });
    const lines = name.split('\n');
    lines.forEach((line, row) => {
      if (!line.trim()) return;
      const y = +(category.y_position + row * DOTA.header).toFixed(6), chars = Array.from(line);
      const upper = chars.map((char) => char.toUpperCase());
      const glyphs = chars.filter((char) => !/\s/u.test(char)), shown = glyphs.filter((char) => !invisibleGlyphs(char).length).length;
      if ((glyphs.length > 1 && !artLine(line)) || !shown || (!singles && glyphs.length === 1) || upper.some((char) => Array.from(char).length !== 1)) {
        out.push({ category: lines.length === 1 ? category : { ...category, category_name: line, y_position: y }, index, row, x: 0 });
        return;
      }
      const steps = widths(upper.join(''));
      let pen = category.x_position;
      chars.forEach((char, k) => {
        if (!/\s/u.test(char)) points.push({ ch: char, x: pen, y, base: category, index, row });
        pen += advanceAt(steps[k]);
      });
    });
  });
  const cards = heroes.flatMap((c) => {
    const layout = heroLayout({ w: c.width, h: c.height, heroIds: c.hero_ids });
    return c.hero_ids.map((_, i) => ({ x: c.x_position + layout.left + (i % layout.cols) * layout.stepX,
      y: c.y_position + layout.top + Math.floor(i / layout.cols) * layout.stepY, w: layout.cardW, h: layout.cardH }));
  });
  const pairs = new Map();
  const width = (before, char) => {
    const key = before + '\u0000' + char;
    if (!pairs.has(key)) {
      const upper = (before + char).toUpperCase(), steps = widths(upper);
      pairs.set(key, steps[steps.length - 1]);
    }
    return pairs.get(key);
  };
  const glyphs = rows ? packPickRows(points, width, { cards })
    : points.map((point, i) => ({ text: point.ch, x: point.x, y: point.y, members: [i] }));
  for (const glyph of glyphs) {
    const first = points[glyph.members[0]];
    out.push({ category: { ...first.base, category_name: glyph.text, x_position: +glyph.x.toFixed(6), y_position: +glyph.y.toFixed(6) },
      index: first.index, row: first.row, x: glyph.x });
  }
  out.sort((a, b) => a.index - b.index || (a.row ?? 0) - (b.row ?? 0) || a.x - b.x);
  return [...out.map((item) => item.category), ...heroes];
}
// compactRows: glyphs of one line merged into rows. widths: a download for every screen
// (pickSafeCategories); without it rows are merged for the 1080p «Герои» page only (publishing,
// previews: the workshop makes its download safe itself, src/catalog/pick-safe.js).
function exportDota(doc, measure = null, { compactRows = true, widths = null } = {}) {
  if (!compactRows) measure = null;
  assertCategoryLimit(doc);
  const result = clone(doc.source);
  const states = { ...(doc.configDrafts || {}), [doc.configIndex]: doc };
  for (const [index, state] of Object.entries(states)) {
    const entries = categoryEntries(state);
    const categories = widths ? pickSafeCategories(entries.map((entry) => entry.category), widths, { rows: compactRows })
      : compactCategoryRows(entries, measure);
    if (categories.length > MAX_ENTITIES)
      throw new Error(
        compactRows ? t('После разделения текста получается больше 10 000 категорий. Уменьши количество символов.')
          : t('Больше 10 000 категорий. Включи «Склеивать символы одной линии в строки» или сократи детали в «Оптимизации».')
      );
    result.configs[index] = { ...result.configs[index], config_name: state.name, categories };
  }
  // Dota does not store an editor canvas size. Only category positions and hero
  // dimensions are exported; every category without heroes has a 30px box.
  for (const [index, config] of result.configs.entries()) {
    if (widths && !Object.hasOwn(states, index)) config.categories = pickSafeCategories(config.categories, widths, { rows: compactRows });
    else if (measure && !Object.hasOwn(states, index))
      config.categories = compactCategoryRows(config.categories.map((category) => ({
        category, layer: category.hero_ids.length ? 'heroes' : 'decor'
      })), measure);
    for (const category of config.categories)
      if (!category.hero_ids.length) {
        category.width = 30;
        category.height = 30;
      }
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
          t('После разделения текста получается больше 10 000 категорий. Уменьши количество символов.')
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
function gridDraft(state) {
  return clone({
    name: state.name, nextId: state.nextId, entities: state.entities,
    layers: state.layers, canvas: canvasSize(state),
    ...(state.reference ? { reference: state.reference } : {})
  });
}
function appendConfigs(doc, documents) {
  const incoming = documents.map((data) => importProject(data));
  if (doc.source.configs.length + incoming.reduce((n, item) => n + item.source.configs.length, 0) > MAX_CONFIGS)
    throw new Error(t('В одном файле допускается до 100 сеток. Открой файлы отдельно.'));
  const next = clone(doc);
  const names = new Set(configurations(next).map((config) => config.name));
  next.configDrafts ||= {};
  for (const imported of incoming) {
    // Keep non-conflicting file metadata; the current file wins conflicts.
    next.source = { ...imported.source, ...next.source };
    for (const [index, config] of imported.source.configs.entries()) {
      const state = index === imported.configIndex ? imported : imported.configDrafts?.[index];
      const base = state ? state.name : config.config_name;
      let name = base, suffix = 2;
      while (names.has(name)) name = `${base.slice(0, 190)} (${suffix++})`;
      names.add(name);
      const destination = next.source.configs.length;
      next.source.configs.push({ ...clone(config), config_name: name });
      if (state) next.configDrafts[destination] = { ...gridDraft(state), name };
    }
  }
  return next;
}
function configurations(doc) {
  return doc.source.configs.map((config, index) => {
    const state = index === doc.configIndex ? doc : doc.configDrafts?.[index];
    return { index, name: state ? state.name : config.config_name };
  });
}
function renameConfig(doc, index, value) {
  if (!Number.isInteger(index) || !doc.source.configs[index]) throw new Error(t('Сетка не найдена.'));
  const name = String(value).trim();
  if (!name || name.length > 200) throw new Error(t('Название должно содержать от 1 до 200 символов.'));
  const next = clone(doc);
  next.source.configs[index].config_name = name;
  if (index === next.configIndex) next.name = name;
  if (next.configDrafts?.[index]) next.configDrafts[index].name = name;
  return next;
}
// Deletes one grid of the file. Every other grid keeps its edits, drafts and metadata;
// deleting the active grid opens its neighbour. Callers commit it as one undoable step.
function removeConfig(doc, index) {
  if (!Number.isInteger(index) || !doc.source.configs[index]) throw new Error(t('Сетка не найдена.'));
  if (doc.source.configs.length < 2) throw new Error(t('В файле должна остаться хотя бы одна сетка.'));
  const drafts = { ...clone(doc.configDrafts || {}), [doc.configIndex]: gridDraft(doc) };
  const source = clone(doc.source);
  source.configs.splice(index, 1);
  const configDrafts = {};
  for (const [key, draft] of Object.entries(drafts)) {
    const at = Number(key);
    if (at !== index && at < doc.source.configs.length) configDrafts[at > index ? at - 1 : at] = draft;
  }
  const active = doc.configIndex === index ? Math.min(index, source.configs.length - 1) : doc.configIndex - (doc.configIndex > index ? 1 : 0);
  const next = importDota(source, active);
  if (configDrafts[active]) Object.assign(next, clone(configDrafts[active]));
  next.configDrafts = configDrafts;
  if (doc.fileName !== undefined) next.fileName = doc.fileName;
  return next;
}
function addConfig(doc, name = t('Новая сетка'), kind = 'blank') {
  if (doc.source.configs.length >= MAX_CONFIGS)
    throw new Error(t('В одном файле допускается до 100 сеток.'));
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 200)
    throw new Error(t('Название сетки должно содержать от 1 до 200 символов.'));
  if (!['blank', 'roles', 'minimal'].includes(kind)) throw new Error(t('Неизвестный шаблон сетки.'));
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
    throw new Error(t('Не удалось прочитать проект Grid Studio.'));
  const importedSource = importDota(data.source, data.configIndex);
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
      throw new Error(t('Некорректный фон-ориентир.'));
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
      throw new Error(t('Некорректный слой проекта.'));
    layerIds.add(layer.id);
  }
  if ([...baseLayers].some((id) => !layerIds.has(id)))
    throw new Error(t('В проекте отсутствует основной слой.'));
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
      throw new Error(t('В проекте есть некорректный объект.'));
    ids.add(e.id);
  }
  const copy = clone(data);
  copy.source = importedSource.source;
  if (importedSource.importRepairs) copy.importRepairs = importedSource.importRepairs;
  if (copy.configDrafts !== undefined) {
    if (
      !copy.configDrafts ||
      typeof copy.configDrafts !== 'object' ||
      Array.isArray(copy.configDrafts)
    )
      throw new Error(t('Некорректные черновики сеток.'));
    for (const [index, draft] of Object.entries(copy.configDrafts)) {
      if (
        !/^\d+$/.test(index) ||
        Number(index) >= copy.source.configs.length ||
        !draft ||
        typeof draft !== 'object'
      )
        throw new Error(t('Некорректный черновик сетки.'));
      const restored = importProject({
        ...draft,
        app: 'dota-grid-studio',
        schema: 1,
        source: copy.source,
        configIndex: Number(index),
        configDrafts: undefined
      });
      copy.configDrafts[index] = gridDraft(restored);
    }
  }
  importDota(exportDota(copy), copy.configIndex);
  // Older autosaves may contain rows created by automatic grouping. Restore
  // their independent glyphs once, retaining IDs, geometry and layer metadata.
  copy.entities = copy.entities.flatMap((item) => {
    if (!item.rowGlyphs) return [item];
    return textGlyphs(item).map((glyph, index) => {
      const clean = clone(glyph);
      delete clean.rowGlyphs;
      delete clean.rowText;
      delete clean.textMetrics;
      return index ? entity(copy, clean) : clean;
    });
  });
  if (copy.entities.length > MAX_ENTITIES)
    throw new Error(t('После восстановления символов получается больше 10 000 объектов.'));
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
function warnings(doc, exportedCount = categoryCount(doc)) {
  const visible = doc.entities.filter((e) => doc.layers.find((l) => l.id === e.layer)?.visible);
  const issues = [];
  const count = visible.filter((e) => outside(e, canvasSize(doc))).length;
  if (count) issues.push(t('{count} объект(а) выходят за границы холста.', { count }));
  const hidden = invisibleWarning(visible.map((e) => (e.type === 'heroes' ? e.name : e.text) || '').join(''));
  if (hidden) issues.push(hidden);
  const foreign = foreignGlyphs(visible.filter((e) => e.type !== 'heroes').map((e) => e.text));
  if (foreignNoticeable(foreign))
    issues.push(t('{count} символов нет в шрифте Dota ({sample}): игра рисует их шрифтом Windows, и в Dota они выглядят иначе, чем здесь.', { count: foreign.count, sample: foreignSample(foreign) }));
  else if (visible.some((e) => /[\u3040-\u30ff]/u.test(e.text)))
    issues.push(t('Японские символы сохранены без замены. Проверь их в игре: отображение зависит от шрифтов Dota.'));
  if (exportedCount > 2000)
    issues.push(t('Более 2 000 категорий: возможны лаги и вылет Dota 2.'));
  if (doc.layers.some((l) => !l.visible && doc.entities.some((e) => e.layer === l.id)))
    issues.push(t('Скрытые слои не попадут в Dota JSON. В проекте они сохранятся.'));
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
    kind === 'blank' ? t('Новая сетка') : kind === 'minimal' ? t('Мой пул героев') : t('Сетка по ролям')
  );
  if (kind === 'blank') return doc;
  // The templates' names are content made in the page's language (Russian on the server and in tests).
  const groups =
    kind === 'minimal'
      ? [
          [t('МОЙ ПУЛ'), [1, 8, 44, 11, 13, 14, 25, 5, 86], 120, 145, 420, 265],
          [t('ХОЧУ ОСВОИТЬ'), [74, 129, 138, 19, 128, 123], 650, 145, 420, 265]
        ]
      : [
          [t('КЕРРИ'), [1, 8, 44, 67, 10, 54], 45, 92, 340, 195],
          [t('МИД'), [11, 13, 74, 25, 39, 106], 425, 92, 340, 195],
          [t('ОФФЛЕЙН'), [2, 129, 28, 29, 96, 137], 805, 92, 340, 195],
          [t('ПОДДЕРЖКА'), [14, 86, 26, 20, 9, 107], 235, 330, 340, 195],
          [t('ПОЛНАЯ ПОДДЕРЖКА'), [5, 30, 111, 87, 64, 66], 615, 330, 340, 195]
        ];
  for (const [name, heroIds, x, y, w, h] of groups)
    doc.entities.push(entity(doc, { type: 'heroes', name, heroIds, x, y, w, h, layer: 'heroes' }));
  doc.entities.push(
    entity(doc, {
      type: 'text',
      name: t('Заголовок'),
      text: kind === 'minimal' ? t('МОЙ ПУЛ') : t('ГЕРОИ ПО РОЛЯМ'),
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
  categoryEntries,
  clone,
  clamp,
  createDocument,
  layerName,
  entity,
  addArtwork,
  deleteArtwork,
  importDota,
  exportDota,
  pickSafeCategories,
  assertCategoryLimit,
  importProject,
  switchConfig,
  configurations,
  renameConfig,
  removeConfig,
  groupEntities,
  ungroupLayers,
  addConfig,
  appendConfigs,
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
