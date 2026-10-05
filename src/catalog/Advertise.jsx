import { useEffect, useState } from 'react';
import { CATALOG_PATH, catalogAPI } from './api.js';
import { Icon } from './Common.jsx';
import { locale, t } from '../../scripts/i18n.mjs';

// «Реклама» (asked for on 2026-10-05: «страница рекламы, где будет скриншот статистики за вчера и
// позавчера, расписано всё для рекламодателей и куда писать»), from the button at the top of the
// landing page and the workshop. The numbers are not a picture: they come from GET /audience
// (server/site-stats.mjs audience), so they are yesterday's every day. Classes are `mk-*` («media
// kit»), never `mk-*`: EasyList hides `.mk-list` and the like, even from the owner.
export const ADVERTISE_CONTACT = 'https://t.me/gridstudiome?direct';
const number = (value) => Number(value || 0).toLocaleString(locale);
const date = (ms) => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
const ROWS = () => [['visitors', t('Посетители')], ['views', t('Просмотры страниц')]];

function Numbers({ data }) {
  const [yesterday, before] = data.days, week = data.week, share = (n) => (week.visitors ? Math.round((n / week.visitors) * 100) : 0);
  const sources = week.sources.filter((row) => row.visitors).slice(0, 6), top = Math.max(1, ...sources.map((row) => row.visitors));
  return <figure className="mk-stats">
    <figcaption><Icon name="gauge" size={16}/>{t('Статистика GridStudio')}<small>{t('обновлено {time}', { time: new Date(data.generated).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) })}</small></figcaption>
    <div className="mk-days">
      {[[t('Вчера'), yesterday], [t('Позавчера'), before]].map(([label, day]) => <section key={day.day}>
        <h3>{label}<small>{date(day.date)}</small></h3>
        <dl>{ROWS().map(([key, name]) => <div key={key}><dt>{name}</dt><dd>{number(day[key])}</dd></div>)}</dl>
      </section>)}
    </div>
    <div className="mk-week">
      <section><h3>{t('За 7 дней')}</h3>
        <p className="mk-big">{number(week.visitors)}<small>{t('посетителей')}</small></p>
        <div className="mk-split" aria-label={t('Устройства')}><i style={{ width: `${share(week.desktop)}%` }}/></div>
        <p className="mk-legend"><span><b/>{t('Компьютеры {share}%', { share: share(week.desktop) })}</span><span><b className="is-phone"/>{t('Телефоны {share}%', { share: share(week.mobile) })}</span></p>
      </section>
      <section><h3>{t('Откуда приходят')}</h3>
        <ul className="mk-sources">{sources.map((row) => <li key={row.source}><span>{t(row.label)}</span><i style={{ width: `${(row.visitors / top) * 100}%` }}/><b>{number(row.visitors)}</b></li>)}</ul>
      </section>
    </div>
  </figure>;
}

export default function Advertise() {
  const [data, setData] = useState(null), [error, setError] = useState('');
  useEffect(() => { const previous = document.title; document.title = t('Реклама на GridStudio'); return () => { document.title = previous; }; }, []);
  useEffect(() => { catalogAPI('/audience').then(setData, (problem) => setError(problem.message)); }, []);
  const write = <a className="catalog-button primary mk-write" href={ADVERTISE_CONTACT} target="_blank" rel="noopener noreferrer"><Icon name="telegram"/>{t('Написать по рекламе')}</a>;
  return <>
    <a className="catalog-back" href={CATALOG_PATH}><Icon name="back"/>{t('В мастерскую')}</a>
    <article className="mk-page">
      <header className="mk-head"><div>
        <h1>{t('Реклама на GridStudio')}</h1>
        <p>{t('GridStudio — сайт для тех, кто настраивает Dota 2 под себя: сетки героев, фоны главного меню, шрифты и гайды. Сюда приходят люди, которые много играют в Dota и сами меняют её вид.')}</p>
      </div>{write}</header>

      <section><h2>{t('Аудитория')}</h2>
        {data ? <Numbers data={data}/> : error ? <p className="catalog-muted">{error}</p> : <p role="status" className="catalog-muted">{t('Загружаем статистику…')}</p>}
        <p className="catalog-muted mk-note">{t('Цифры живые: обновляются сами, сутки — по московскому времени. Роботы и поисковики не считаются. Подробную статистику за любой период покажем по запросу.')}</p>
      </section>

      <section className="mk-contact"><h2>{t('Как разместить')}</h2>
        <p>{t('Напишите в Telegram: что рекламируете, ссылку и на какой срок.')}</p>
        {write}
      </section>
    </article>
  </>;
}
