
export const IMAGE_DEFAULTS = Object.freeze({
  bright: 0,
  contrast: 15,
  invert: false,
  blur: 1.2,
  sharpness: 0,
  thr: 0.12,
  thinning: true,
  fill: 85,
  gridStep: 4,
  density: 100,
  maxCats: 1000,
  shading: false,
  shadeCharset: '.·:',
  shadeDensity: 30,
  shadeThreshold: 45,
  charset: '.',
  autoOrient: false,
  onlyDots: false
});

export const IMAGE_RANGES = [
  {
    id: 'imageBright',
    key: 'bright',
    label: 'Яркость',
    min: -100,
    max: 100,
    step: 1,
    hint: 'Сдвигает значения серого в светлую или тёмную сторону.'
  },
  {
    id: 'imageContrast',
    key: 'contrast',
    label: 'Контраст',
    min: -100,
    max: 100,
    step: 1,
    hint: 'Меняет разницу между светлыми и тёмными областями.'
  },
  {
    id: 'imageBlur',
    key: 'blur',
    label: 'Сглаживание · Blur σ',
    min: 0,
    max: 4,
    step: 0.1,
    hint: 'Убирает шум перед поиском контуров. Большие значения сглаживают детали.'
  },
  {
    id: 'imageSharpness',
    key: 'sharpness',
    label: 'Резкость, %',
    min: 0,
    max: 200,
    step: 5,
    hint: 'Усиливает локальные границы после сглаживания, перед Sobel.'
  },
  {
    id: 'imageThreshold',
    key: 'thr',
    label: 'Порог контура',
    min: 0.01,
    max: 0.8,
    step: 0.01,
    hint: 'Меньше порог — больше деталей и контуров.'
  },
  {
    id: 'imageFill',
    key: 'fill',
    label: 'Заполнение холста, %',
    min: 20,
    max: 100,
    step: 1,
    hint: 'Размер всего рисунка на холсте с сохранением пропорций.'
  },
  {
    id: 'imageStep',
    key: 'gridStep',
    label: 'Шаг сетки, px',
    min: 2,
    max: 20,
    step: 1,
    hint: 'Меньше шаг — плотнее контуры. Больше — заметнее промежутки.'
  },
  {
    id: 'imageDensity',
    key: 'density',
    label: 'Плотность, %',
    min: 10,
    max: 200,
    step: 5,
    hint: 'Множитель плотности: эффективный шаг равен шагу сетки / (плотность / 100).'
  },
  {
    id: 'imageShadeDensity',
    key: 'shadeDensity',
    label: 'Плотность заливки, %',
    min: 5,
    max: 100,
    step: 5,
    hint: 'Доля точек, которыми заполняются тёмные области.'
  },
  {
    id: 'imageShadeThreshold',
    key: 'shadeThreshold',
    label: 'Порог тени, %',
    min: 10,
    max: 90,
    step: 5,
    hint: 'Чем выше порог, тем больше областей попадает в заливку.'
  }
];

export const IMAGE_CHECKS = [
  { id: 'imageInvert', key: 'invert', label: 'Инверсия' },
  { id: 'imageThinning', key: 'thinning', label: 'Скелетизация · линии в 1 px' },
  { id: 'imageOrient', key: 'autoOrient', label: 'Автоориентация по контуру' },
  { id: 'imageOnlyDots', key: 'onlyDots', label: 'Только первый символ' },
  { id: 'imageShade', key: 'shading', label: 'Заливка тёмных областей' }
];

export const IMAGE_TEXT_FIELDS = [
  { id: 'imageCharset', key: 'charset', label: 'Символы контура' },
  { id: 'imageShadeCharset', key: 'shadeCharset', label: 'Символы заливки' }
];

// «Строки символов» (scripts/ascii-rows.mjs): its own controls, so switching the method
// never mixes the two sets of settings.
export const ROW_RANGES = [
  { id: 'rowFill', key: 'fill', label: 'Размер на холсте, %', min: 20, max: 100, step: 1,
    hint: 'Рисунок вписывается в холст с сохранением пропорций. Больше размер — больше деталей и строк.' },
  { id: 'rowBright', key: 'bright', label: 'Яркость', min: -100, max: 100, step: 1,
    hint: 'Сдвигает изображение в светлую или тёмную сторону.' },
  { id: 'rowContrast', key: 'contrast', label: 'Контраст', min: -100, max: 100, step: 1,
    hint: 'Меняет разницу между светлыми и тёмными областями.' },
  { id: 'rowDetail', key: 'detail', label: 'Детализация, %', min: 0, max: 100, step: 5,
    hint: 'Вытягивает мелкие детали: черты лица, складки, текстуру.' },
  { id: 'rowDensity', key: 'density', label: 'Насыщенность, %', min: 30, max: 100, step: 5,
    hint: 'Насколько плотные символы брать для самых ярких мест. Меньше — легче и воздушнее.' },
  { id: 'rowPitch', key: 'pitch', label: 'Шаг строк, px', min: 10, max: 20, step: 1,
    hint: 'Расстояние между строками. Меньше шаг — больше деталей по высоте и больше строк.' }
];
export const ROW_SELECTS = [
  { id: 'rowMode', key: 'mode', label: 'Что передавать',
    options: [['mix', 'Тон и контуры'], ['tone', 'Тон, как на фото'], ['lines', 'Только контуры']] },
  { id: 'rowInk', key: 'ink', label: 'Рисовать символами',
    options: [['auto', 'Определить по фону'], ['light', 'Светлые места'], ['dark', 'Тёмные места']] },
  { id: 'rowGlyphs', key: 'glyphs', label: 'Символы',
    options: [['signs', 'Знаки — классический ASCII'], ['dots', 'Точки'], ['all', 'Знаки, буквы и цифры'], ['letters', 'Только буквы и цифры'], ['custom', 'Свой набор']] }
];
// The three quick buttons for this method.
// «Точки» switches to the dot set with dotted outlines; the others keep the chosen glyphs,
// except that they leave the dot set.
export const ROW_RECIPES = Object.freeze({
  line: { mode: 'lines', detail: 30, density: 85 },
  photo: { mode: 'mix', detail: 60, density: 80 },
  light: { mode: 'lines', fill: 60, pitch: 15, density: 70 },
  dots: { glyphs: 'dots', mode: 'lines', detail: 30, density: 100 }
});

// «Точечный рисунок» (scripts/dot-trace.mjs): dots evenly spaced along the lines.
export const TRACE_RANGES = [
  { id: 'traceFill', key: 'fill', label: 'Размер на холсте, %', min: 20, max: 100, step: 1,
    hint: 'Рисунок вписывается в холст с сохранением пропорций.' },
  { id: 'traceDetail', key: 'detail', label: 'Детализация, %', min: 0, max: 100, step: 5,
    hint: 'Больше — находятся и слабые линии, меньше — только чёткие.' },
  { id: 'traceLength', key: 'length', label: 'Линии от, px', min: 0, max: 80, step: 2,
    hint: 'Линии короче не рисуются. Больше — только главные линии, меньше — мелкие детали и шум.' },
  { id: 'traceSpacing', key: 'spacing', label: 'Шаг точек, px', min: 3, max: 10, step: 0.5,
    hint: 'Расстояние между соседними точками на линии. Меньше шаг — линия плотнее.' }
];
export const TRACE_SELECTS = [
  { id: 'traceSource', key: 'source', label: 'Откуда брать линии',
    options: [['auto', 'Определить по картинке'], ['lines', 'Линии рисунка (лайн-арт)'], ['edges', 'Границы, как на фото']] }
];
// The quick buttons for this method; a recipe without a source keeps the chosen one.
export const TRACE_RECIPES = Object.freeze({
  line: { source: 'lines', detail: 60, length: 16, spacing: 4.5 },
  photo: { source: 'edges', detail: 50, length: 30, spacing: 4.5 },
  light: { fill: 70, length: 24, spacing: 5.5 },
  dots: { source: 'auto', fill: 85, detail: 60, length: 16, spacing: 4.5 }
});

// The style strip of «Изображение в ASCII»: a card per look with a thumbnail of the loaded picture,
// so a style is picked by eye. method: which conversion; preset: a points style (D.presets name);
// rows / trace: settings over ROW_DEFAULTS / TRACE_DEFAULTS.
export const IMAGE_STYLES = Object.freeze([
  { id: 'contour', label: 'Контур', method: 'points', preset: 'Чистый line-art' },
  { id: 'sketch', label: 'Рисунок', method: 'points', preset: 'Карандашный рисунок' },
  { id: 'dashed', label: 'Пунктир', method: 'points', preset: 'Пунктир редкий' },
  { id: 'dotted', label: 'Точечный', method: 'trace', trace: {} },
  { id: 'engraving', label: 'Тени', method: 'points', preset: 'Гравюра (штриховка)' },
  { id: 'photo', label: 'Фото', method: 'rows', rows: { mode: 'mix', detail: 60, density: 80 } },
  { id: 'halftone', label: 'ASCII-полутона', method: 'rows', rows: { mode: 'tone', glyphs: 'signs' } },
  { id: 'silhouette', label: 'Силуэт', method: 'points', preset: 'Силуэт' },
  { id: 'anime', label: 'Аниме точки', method: 'points', preset: 'Аниме точки (базовый)' },
  { id: 'kanji', label: 'Иероглифы', method: 'points', preset: 'Японский стиль (иероглифы)' },
  { id: 'letters', label: 'Буквы', method: 'rows', rows: { mode: 'mix', glyphs: 'letters' } },
  { id: 'minimal', label: 'Минимализм', method: 'points', preset: 'Минимализм (мало символов)', maxCats: 600 },
  { id: 'tattoo', label: 'Тату', method: 'points', preset: 'Тату-эскиз' },
  { id: 'meme', label: 'Мем', method: 'points', preset: 'Мем (толстые линии)' }
]);
