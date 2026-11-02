import { t } from '../../scripts/i18n.mjs';
import { cleanDesign, newBlock } from '../../scripts/menu-widgets.mjs';

// «Редактор виджета»'s templates (2026-11-02, the owner: «сделай готовые виджеты и шаблоны более проработанными по
// дизайну … чтобы не выглядели как нейрослоп»; one streamer's card with a purple gradient and a pulsing purple button
// before). Dota's own look, as the ready widgets have it (scripts/menu-widgets.mjs PANEL): a graphite ground, a thin
// line of gold along the top, captions in small spaced capitals, one accent — Dota's gold — and nothing that pulses.
const GOLD = '#e8c66a', INK = '#eef2f6', CAPTION = '#8b96a5', DARK = '#111418', GROUND = '#0d1014f2', RULE = '#ffffff14';

function make(type, [x, y, w, h], props = {}, extra = {}) {
  const block = newBlock(type, { x, y });
  return { ...block, w, h, ...extra, props: { ...block.props, ...props } };
}
const caption = (place, text, extra = {}) => make('text', place, { text, size: 11, color: CAPTION, weight: 'bold', upper: true, spacing: 3, shadow: false, ...extra });
const edge = (w) => make('shape', [0, 0, w, 2], { fill: GOLD, fill2: `${GOLD}00`, direction: 'right' });
const rule = (place) => make('shape', place, { fill: RULE });
const week = () => {
  const day = new Date(Date.now() + 7 * 86400_000), two = (n) => String(n).padStart(2, '0');
  return `${day.getFullYear()}-${two(day.getMonth() + 1)}-${two(day.getDate())}T20:00`;
};

export const WIDGET_TEMPLATES = () => [
  { id: 'stream', title: t('Стрим'), text: t('обложка, эфир, цель, кнопка'), design: () => ({ name: t('Стрим'), size: [330, 484], background: GROUND, radius: 6, blocks: [
    make('image', [0, 0, 330, 186]),
    make('shape', [0, 106, 330, 80], { fill: '#0d101400', fill2: '#0d1014', direction: 'down' }),
    edge(330),
    make('shape', [16, 16, 84, 22], { fill: '#d6453d', radius: 11 }),
    make('text', [16, 16, 84, 22], { text: t('В эфире'), size: 11, color: '#ffffff', weight: 'bold', align: 'center', upper: true, spacing: 2, shadow: false }),
    caption([20, 196, 290, 16], t('Сегодня в 20:00')),
    make('text', [20, 216, 290, 64], { text: t('Учу Invoker с нуля до 5к'), size: 26, color: INK, weight: 'bold', shadow: false }, { anim: 'appear' }),
    rule([20, 292, 290, 1]),
    caption([20, 306, 290, 16], t('До начала')),
    make('timer', [20, 326, 290, 34], { until: week(), size: 26, color: GOLD, weight: 'bold' }),
    make('text', [20, 380, 220, 18], { text: t('Цель стрима — 3 победы'), size: 13, color: '#c8cfd8', weight: 'normal', shadow: false }),
    make('text', [240, 380, 70, 18], { text: '2 / 3', size: 13, color: INK, weight: 'bold', align: 'right', shadow: false }),
    make('progress', [20, 404, 290, 6], { value: 66, fill: GOLD, track: RULE, radius: 3 }),
    // A link that works as it is (test 7: an empty one opened nothing); the user puts in their own channel.
    make('button', [20, 424, 290, 44], { label: t('Смотреть на Twitch'), action: 'link', url: 'https://www.twitch.tv/directory/category/dota-2', fill: GOLD, color: DARK, radius: 4, size: 14, upper: true, sound: 'click' },
      { hover: true, tip: t('Откроется в браузере Steam') })
  ] }) },
  { id: 'profile', title: t('Мой профиль'), text: t('аватар, ник, 3D-герой'), design: () => ({ name: t('Мой профиль'), size: [440, 260], background: GROUND, radius: 6, blocks: [
    make('hero', [300, 64, 140, 196], { hero: 'juggernaut', view: 'model', rotate: false }),
    make('shape', [270, 64, 60, 196], { fill: '#0d1014', fill2: '#0d101400', direction: 'right' }),
    edge(440),
    make('avatar', [24, 28, 72, 72], { radius: 36, border: GOLD, borderWidth: 2 }, { tip: t('Аватар Steam') }),
    make('nickname', [112, 38, 310, 32], { size: 22, color: INK, weight: 'bold', shadow: false }),
    make('text', [112, 72, 310, 20], { text: t('Сегодня только победы'), size: 13, color: CAPTION, weight: 'normal', shadow: false }),
    rule([24, 124, 270, 1]),
    make('button', [24, 144, 270, 40], { label: t('Мой профиль'), action: 'profile', fill: '#232930', color: INK, radius: 4, size: 13, upper: true, sound: 'soft' }, { hover: true }),
    make('button', [24, 194, 270, 40], { label: t('Боевой отчёт'), action: 'battleReport', fill: '#232930', color: INK, radius: 4, size: 13, upper: true, sound: 'soft' }, { hover: true })
  ] }) },
  { id: 'countdown', title: t('Отсчёт'), text: t('событие, таймер, кнопка'), design: () => ({ name: t('Отсчёт'), size: [600, 160], background: GROUND, radius: 6, blocks: [
    edge(600),
    caption([24, 24, 380, 16], t('Турнир · гранд-финал')),
    make('text', [24, 44, 380, 40], { text: t('The International'), size: 30, color: INK, weight: 'bold', shadow: false }),
    make('timer', [24, 98, 380, 38], { until: week(), size: 28, color: GOLD, weight: 'bold' }),
    rule([416, 28, 1, 104]),
    make('button', [436, 52, 140, 56], { label: t('Смотреть'), action: 'link', url: 'https://liquipedia.net/dota2/The_International', fill: GOLD, color: DARK, radius: 4, size: 14, upper: true, sound: 'click' }, { hover: true })
  ] }) },
  { id: 'links', title: t('Быстрый доступ'), text: t('четыре раздела Dota'), design: () => ({ name: t('Быстрый доступ'), size: [260, 236], background: GROUND, radius: 6, blocks: [
    edge(260),
    caption([20, 18, 220, 16], t('Быстрый доступ')),
    ...[['heroes', t('Герои')], ['armory', t('Арсенал')], ['patches', t('Обновления игры')], ['settings', t('Настройки')]].flatMap(([action, label], i) => [
      make('button', [12, 44 + i * 46, 236, 40], { label, action, fill: '#ffffff08', color: INK, radius: 4, size: 13, upper: true, align: 'left', sound: 'soft' }, { hover: true }),
      make('shape', [12, 54 + i * 46, 2, 20], { fill: GOLD })])
  ] }) }
];
export const templateDesign = (template) => cleanDesign(template.design());
