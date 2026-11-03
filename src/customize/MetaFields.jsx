// «Мета героев» (2026-11-03, scripts/meta-widget.mjs): a tab at the edge of the «Герои» page and of the pick screen,
// closed until pressed — each position's heroes by win rate or pick rate (STRATZ's week), and a hero's build: items,
// the skill order, the talents. Where it shows, which ranks it counts, its accent, the side and height of its tab and
// its language (switched in the widget too); it goes into the menu's pack.
import { lang, t } from '../../scripts/i18n.mjs';
import { META_BRACKETS, META_BRACKET_NAMES } from '../../scripts/hero-meta.mjs';
import { META_ACCENTS, META_ACCENT_NAMES, META_WIDGET_DEFAULTS } from '../../scripts/meta-widget.mjs';
import { Field, Segmented } from './ui.jsx';

const BRACKETS = () => Object.keys(META_BRACKETS).reverse().map((id) => [id, t(META_BRACKET_NAMES[id])]);
const SIDES = () => [['left', t('Слева')], ['right', t('Справа')]];
const LANGS = () => [['ru', 'Русский'], ['en', 'English']];

export function MetaFields({ bg }) {
  const meta = bg.meta || { ...META_WIDGET_DEFAULTS, heroes: false, pick: false, lang: lang === 'en' ? 'en' : 'ru' };
  const on = meta.heroes || meta.pick;
  const set = (patch) => bg.setMeta({ ...meta, ...patch });
  return <>
    <p className="custom-hint">{t('Вкладка «МЕТА» у края экрана, закрытая, пока её не нажмёшь: герои каждой позиции с винрейтом и пикрейтом за неделю — по любому из них по порядку, а по клику на героя — его сборка, прокачка скиллов, таланты и страница на STRATZ. Данные STRATZ, обновляются сами.')}</p>
    <div className="custom-switches">
      <label className="custom-toggle"><input type="checkbox" role="switch" checked={meta.heroes} onChange={(event) => set({ heroes: event.target.checked })}/><span><b>{t('На странице «Герои»')}</b><small>{t('В главном меню, рядом с сеткой героев.')}</small></span></label>
      <label className="custom-toggle"><input type="checkbox" role="switch" checked={meta.pick} onChange={(event) => set({ pick: event.target.checked })}/><span><b>{t('На выборе героя в матче')}</b><small>{t('Пока идёт пик и время стратегии; с экраном выбора уходит и вкладка. В сам выбор она не вмешивается.')}</small></span></label>
    </div>
    {on && <>
      <Field label={t('Ранги')} aside={t(META_BRACKET_NAMES[meta.bracket])}>
        <select className="kz-select meta-ranks" aria-label={t('Чьи игры считать')} value={meta.bracket} onChange={(event) => set({ bracket: event.target.value })}>
          {BRACKETS().map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select>
      </Field>
      <Field label={t('Акцент')} aside={t(META_ACCENT_NAMES[meta.accent])}>
        <div className="d2-theme-colors" role="radiogroup" aria-label={t('Цвет акцента')}>
          {META_ACCENTS.map((color) => <button key={color} type="button" role="radio" aria-checked={meta.accent === color} aria-label={t(META_ACCENT_NAMES[color])} title={t(META_ACCENT_NAMES[color])}
            className={`d2-theme-color${meta.accent === color ? ' is-on' : ''}`} style={{ '--c': color }} onClick={() => set({ accent: color })}/>)}
        </div>
      </Field>
      <Field label={t('Вкладка')} hint={t('Окно открывается с той же стороны, рядом с вкладкой.')}>
        <Segmented label={t('С какой стороны экрана')} value={meta.side} onChange={(side) => set({ side })} options={SIDES()}/>
      </Field>
      <label className="custom-slider"><span>{t('Высота')}</span>
        <input type="range" min="0" max="100" step="1" value={meta.top} onChange={(event) => set({ top: Number(event.target.value) })} style={{ '--fill': `${meta.top}%` }}/>
        <output>{meta.top <= 5 ? t('вверху') : meta.top >= 95 ? t('внизу') : `${meta.top}%`}</output></label>
      <Field label={t('Язык виджета')} hint={t('Его можно переключить и в самом виджете.')}>
        <Segmented label={t('Язык виджета')} value={meta.lang} onChange={(value) => set({ lang: value })} options={LANGS()}/>
      </Field>
      <p className="custom-hint">{t('В игре акцент, место вкладки и язык меняются и в самом виджете (шестерёнка или перетащить вкладку) и сохраняются на компьютере — до тех пор, пока не соберёшь файл с другими настройками здесь.')}</p>
      <p className="custom-hint">{t('Предметы — как на STRATZ: старт, обувь, ранние, середина и поздние, по выбранным рангам; прокачка — по свежим матчам сильных игроков на этой позиции. Собери и установи файл заново после крупного обновления Dota.')}</p>
    </>}
  </>;
}
