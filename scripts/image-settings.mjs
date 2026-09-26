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
