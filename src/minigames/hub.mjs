// The «Мини-игры» hub (src/minigames/MinigamesApp.jsx): what the page says about every game. The order is
// the hub's own (action and quick ones first), not Valve's popup order (games/index.js keeps that one).
// name — Russian title (English in src/i18n/en/minigames.js), pitch — a line or two in the site's voice,
// genre and length — the tags on a card, kinds — the hub's sections, controls — what it is played with,
// phone — 'any' (fine in any orientation) or 'landscape' (playable, better sideways), accent — the card's glow.
// The art (assets/minigames/hub/<id>.webp, <id>-480.webp and <id>.webm) is made by scripts/make-minigames-hub.mjs.
export const HUB = [
  { id: 'thorns', name: 'Терновый трон', genre: 'Выживание', length: '≈15 мин', kinds: ['action'], controls: ['keyboard', 'mouse', 'touch'], phone: 'landscape', accent: '#e57ad0',
    pitch: 'Орды Империи против одного героя. Выбирай улучшения, собирай связки и доживи до тронного зала.' },
  { id: 'zaug', name: 'Логово Зауга', genre: 'Шмап', length: '≈3 мин', kinds: ['action'], controls: ['keyboard', 'mouse', 'touch'], phone: 'landscape', accent: '#8f8cff',
    pitch: 'Стрелялка со сменой цвета: щит глотает пули своего цвета, враги другого получают двойной урон. В финале — сам Зауг.' },
  { id: 'race', name: 'Крылатые гонки', genre: 'Раннер', length: '≈1 мин', kinds: ['quick'], controls: ['keyboard', 'mouse', 'touch'], phone: 'any', accent: '#f0a95b',
    pitch: 'Гонка через каньон на одной кнопке. Обгони всадника на летучей мыши — откроется бесконечный забег.' },
  { id: 'fighter', name: 'Сосулечный боец', genre: 'Файтинг', length: '≈10 мин', kinds: ['action'], controls: ['keyboard', 'gamepad', 'touch'], phone: 'landscape', accent: '#f07a5b',
    pitch: 'Файтинг в таверне: пять героев, приёмы и связки. Сюжет против четырёх соперников или бой вдвоём за одной клавиатурой.' },
  { id: 'chess', name: 'Драконьи шахматы', genre: 'Три в ряд', length: '10–20 мин', kinds: ['think'], controls: ['mouse', 'keyboard', 'touch'], phone: 'landscape', accent: '#7fb4ff',
    pitch: 'Три в ряд, где каждый ряд — удар по противнику. Четыре и пять самоцветов дают способности героев.' },
  { id: 'castle', name: 'Замкобой', genre: 'Артиллерия', length: '18 уровней', kinds: ['think'], controls: ['keyboard', 'mouse', 'touch'], phone: 'landscape', accent: '#7cc8f0',
    pitch: 'Снэпфайр на драконьей жабе против укреплений. Угол, сила, оружие — и как можно меньше выстрелов на три звезды.' },
  { id: 'fishing', name: 'Рыбалка', genre: 'На реакцию', length: '≈3 мин', kinds: ['quick'], controls: ['mouse', 'keyboard', 'touch'], phone: 'landscape', accent: '#5fd0bd',
    pitch: 'Пять приманок и озеро с Левиафаном. Забрось, дождись поклёвки и удержи рыбу в полосе.' },
  { id: 'spoon', name: 'Подрывник Спун', genre: 'Бомбермен', length: 'этап — 3 мин', kinds: ['action'], controls: ['keyboard', 'touch'], phone: 'landscape', accent: '#f2c14e',
    pitch: 'Взрывай стены, собирай улучшения и ключи, не попади под собственный огонь. Каждый этап быстрее прошлого.' },
  { id: 'sweeper', name: 'Сапёр Сплин', genre: 'Головоломка', length: '3 мин', kinds: ['quick', 'think'], controls: ['mouse', 'touch'], phone: 'any', accent: '#93d46b',
    pitch: 'Сапёр на время с умением: Echo Slash вскрывает клетку без риска, часы добавляют секунды. Пять полей за три минуты.' },
];

// Sections of the hub: [id, label].
export const KINDS = [['all', 'Все'], ['quick', 'Быстрые'], ['think', 'На подумать'], ['action', 'Экшен']];
export const inKind = (game, kind) => kind === 'all' || game.kinds.includes(kind);

// The art of a game: the poster in two sizes and the loop (none for sweeper: a still board).
export const HUB_ART = './assets/minigames/hub/';
export const hubArt = (id) => ({ poster: `${HUB_ART}${id}.webp`, small: `${HUB_ART}${id}-480.webp`, loop: id === 'sweeper' ? null : `${HUB_ART}${id}.webm` });

// «Игра дня»: the same one for everybody on a date (local), a different one the next day.
export function gameOfDay(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return HUB[((day * 7) % HUB.length + HUB.length) % HUB.length];
}

// What a best score means: Замкобой keeps the stars of all levels, the others points.
export const bestUnit = (id) => (id === 'castle' ? 'stars' : 'points');

// The last game opened from the hub (for «Продолжить»).
export const LAST_KEY = 'gridstudio.minigames.last';
