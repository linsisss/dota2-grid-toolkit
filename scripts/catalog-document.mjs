import C from './core.mjs';

export const CATALOG_TAGS = ['Аниме', 'Милота', '18+', 'Рамки', 'С упором на героя', 'Мемы', 'Dead inside'];
// No symbol cap: the card shows the count and players decide. Size and category limits protect the server.
export const CATALOG_LIMITS = Object.freeze({ bytes: 2_000_000, categories: 5000, heroes: 500, daily: 3, accountDaily: 10 });
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
class ValidationError extends Error { constructor(message) { super(message); this.status = 400; } }
export function catalogText(value, max, label, required = false) {
  if (typeof value !== 'string' || value.length > max || controls.test(value)) throw new ValidationError(`${label}: допустимо до ${max} символов.`);
  const text = value.trim();
  if (required && !text) throw new ValidationError(`Заполни поле «${label}».`);
  return text;
}
export function normalizeCatalogGrid(input) {
  if (!input || input.version !== 3 || !Array.isArray(input.configs) || input.configs.length !== 1)
    throw new ValidationError('Для публикации нужна одна сетка Dota JSON версии 3.');
  const config = input.configs[0];
  if (!config || !Array.isArray(config.categories) || !config.categories.length || config.categories.length > CATALOG_LIMITS.categories)
    throw new ValidationError(`В сетке должно быть от 1 до ${CATALOG_LIMITS.categories} категорий. Используй оптимизацию перед публикацией.`);
  let symbols = 0, heroes = 0;
  const categories = config.categories.map((item) => {
    if (!item || !Array.isArray(item.hero_ids) || item.hero_ids.length > 200 || item.hero_ids.some(id => !Number.isSafeInteger(id) || id < 1 || id > 10000))
      throw new ValidationError('В сетке некорректные ID героев.');
    catalogText(item.category_name, 2000, 'Название категории');
    const category_name = item.category_name;
    const box = {};
    for (const field of ['x_position', 'y_position', 'width', 'height']) {
      const value = item[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000 || (['width', 'height'].includes(field) && !value))
        throw new ValidationError('Координаты и размеры категорий должны быть положительными и не больше 10 000.');
      box[field] = +value.toFixed(6);
    }
    heroes += item.hero_ids.length;
    if (!item.hero_ids.length) symbols += Array.from(category_name).filter(c => !/\s/u.test(c)).length;
    return { category_name, ...box, width: item.hero_ids.length ? box.width : 30, height: item.hero_ids.length ? box.height : 30, hero_ids: [...item.hero_ids] };
  });
  if (heroes > CATALOG_LIMITS.heroes) throw new ValidationError(`Сетка слишком сложная: максимум ${CATALOG_LIMITS.heroes} портретов.`);
  if (!heroes && !symbols) throw new ValidationError('В сетке пока нет героев или символов.');
  return { grid: { version: 3, configs: [{ config_name: catalogText(config.config_name, 200, 'Имя сетки'), categories }] }, stats: { categories: categories.length, heroes, symbols } };
}
// Title, author and tags: the same rules for a player's submission and an admin's correction.
export function catalogMeta(input) {
  const title = catalogText(input?.title, 80, 'Название', true);
  const author = catalogText(input?.author ?? '', 40, 'Автор');
  if (!Array.isArray(input?.tags) || input.tags.length > 3 || input.tags.some(tag => !CATALOG_TAGS.includes(tag))) throw new ValidationError('Выбери до трёх тегов из списка.');
  return { title, author, tags: [...new Set(input.tags)].sort() };
}
export function catalogSubmission(input) {
  const meta = catalogMeta(input);
  const { grid, stats } = normalizeCatalogGrid(input.grid);
  grid.configs[0].config_name = meta.title;
  return { ...meta, grid, stats };
}
export function selectedCatalogGrid(document, measure = null) {
  const doc = C.clone(document);
  doc.source = { version: 3, configs: [doc.source.configs[doc.configIndex]] };
  doc.configIndex = 0;
  doc.configDrafts = {};
  return normalizeCatalogGrid(C.exportDota(doc, measure)).grid;
}
export function appendCatalogGrid(document, grid) {
  const next = C.appendConfigs(document, [C.importDota(normalizeCatalogGrid(grid).grid)]);
  return C.switchConfig(next, next.source.configs.length - 1);
}
