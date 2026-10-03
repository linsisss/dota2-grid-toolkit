import { useState } from 'react';
import { Icon, Modal } from '../catalog/Common.jsx';
import { profilePath } from '../catalog/Creator.jsx';
import { BadgeIcons } from '../catalog/Badges.jsx';
import { GUIDE_CATEGORIES } from '../../scripts/guide-document.mjs';
import { locale, t } from '../../scripts/i18n.mjs';
import { GUIDES_PATH } from './api.js';

// What the guides' list, a guide's page and a creator's profile (src/catalog/CreatorProfile.jsx) share:
// a guide's card, its author, its section, dates and the «модификация файлов игры» mark.
export const section = (id) => t(GUIDE_CATEGORIES.find((category) => category.id === id)?.title || '');
export const guideLink = (id) => `${GUIDES_PATH}?id=${id}`;
export function day(time) { try { return new Date(time).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; } }
export function ago(time) {
  const seconds = (Date.now() - time) / 1000, format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (seconds < 60) return t('только что');
  for (const [unit, size] of [['minute', 60], ['hour', 3600], ['day', 86400]]) if (seconds < size * (unit === 'day' ? 7 : unit === 'hour' ? 24 : 60)) return format.format(-Math.floor(seconds / size), unit);
  return day(time);
}
// `author`: the creator profile (server/profiles.mjs) — { key, name, avatar }; the name opens the profile.
// `crown`: the author of what is commented («Автор гайда»), a crown by the name (asked for on 2026-10-03).
export function Author({ author, children, crown = '' }) {
  const mark = crown ? <span className="guide-author-crown" title={crown} aria-label={crown} role="img"><Icon name="crown" size={14}/></span> : null;
  const name = author?.key ? <span className="guide-author-line"><a className="guide-author-name" href={profilePath(author.key)}>{author.name}</a>{mark}<BadgeIcons badges={author.badges}/></span>
    : <b>{author?.name || t('Пользователь')}</b>;
  return <span className="guide-author">{author?.avatar ? <img src={author.avatar} alt="" width="28" height="28" loading="lazy"/> : <span className="guide-author-blank"><Icon name="user" size={15}/></span>}
    <span>{name}{children}</span></span>;
}

// «! Используется модификация файлов игры» (asked for on 2026-10-02): the guide changes the game's files
// (fonts, menu backgrounds, mods). The author can put it, only a moderator can take it off
// (server/guides.mjs). On the guide's page under the title; on a card (`compact`) a short chip on the cover,
// opposite the section. A click explains what it means.
export function ModdingTag({ compact = false }) {
  const [open, setOpen] = useState(false);
  const full = t('Используется модификация файлов игры');
  return <>
    {compact ? <button type="button" className="guide-modding-chip" aria-haspopup="dialog" aria-label={`${full}. ${t('Что это значит?')}`} title={`${full}. ${t('Что это значит?')}`} onClick={() => setOpen(true)}>
      <Icon name="alert" size={14}/>{t('Модификация файлов')}</button>
      : <button type="button" className="guide-modding" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <b aria-hidden="true">!</b><span>{full} <span className="guide-modding-more">{t('Что это значит?')}</span></span></button>}
    {open && <ModdingInfo onClose={() => setOpen(false)}/>}
  </>;
}
function ModdingInfo({ onClose }) {
  return <Modal title={t('Модификация файлов игры')} icon="alert" size="md" onClose={onClose}
    lead={t('Гайд советует заменить или добавить файлы в папке Dota 2: шрифты, фон главного меню, звуки, модели или другие моды. Valve такие файлы не делала и не проверяла.')}>
    <div className="catalog-confirm guide-modding-info">
      <h3>{t('Чем это может обернуться')}</h3>
      <ul>
        <li><b>{t('Правила Steam.')}</b> {t('Менять файлы игры они формально не разрешают. Банов за то, что видишь только ты (шрифт, фон меню, интерфейс), не известно: это ничего не даёт в игре. Но моды, которые дают преимущество — показывают больше, чем положено, меняют модели героев или эффекты способностей, — это читы, за них банят.')}</li>
        <li><b>{t('Обновления Dota.')}</b> {t('Steam может вернуть исходные файлы после обновления — тогда изменения пропадут и их придётся поставить заново.')}</li>
        <li><b>{t('Поломки.')}</b> {t('После крупного обновления мод может перестать работать: пропадёт часть меню или интерфейса, а иногда игра не запустится. Тогда удали мод.')}</li>
        <li><b>{t('Чужие файлы.')}</b> {t('Модераторы проверяют вложения в гайдах, но скачивай файлы только у тех, кому доверяешь, и не запускай программы и скрипты из незнакомых источников.')}</li>
      </ul>
      <h3>{t('Как вернуть всё как было')}</h3>
      <p>{t('Steam → Dota 2 → «Свойства» → «Установленные файлы» → «Проверить целостность файлов игры»: Steam сам вернёт исходные файлы. Перед заменой сохрани копию папки, которую меняешь.')}</p>
      <p className="catalog-muted">{t('Пометку ставит автор или модератор. Она не значит, что гайд плохой, — это предупреждение, а решать тебе.')}</p>
      <div className="catalog-actions"><button type="button" className="catalog-button primary" onClick={onClose}>{t('Понятно')}</button></div>
    </div>
  </Modal>;
}

export function GuideCard({ item, mine = false }) {
  const href = mine && item.status !== 'approved' && item.status !== 'hidden' ? `${GUIDES_PATH}?write=${item.id}` : guideLink(item.id);
  const state = mine ? guideState(item) : null;
  return <article className="guide-card">
    <div className="guide-card-top">
      <a className="guide-card-cover" href={href} tabIndex={-1} aria-hidden="true">
        {item.cover ? <img src={item.cover.url} alt="" loading="lazy" decoding="async"/> : <span className="guide-card-blank"><Icon name="guides" size={34}/></span>}
        <span className="guide-chip">{section(item.category)}</span>
      </a>
      {item.modding && <ModdingTag compact/>}
    </div>
    <div className="guide-card-body">
      <a href={href}><h2>{item.title || t('Без названия')}</h2></a>
      {item.excerpt && <p>{item.excerpt}</p>}
      {state && <p className={`guide-state is-${state.tone}`}><Icon name={state.icon} size={14}/>{state.text}</p>}
      <div className="guide-card-meta"><Author author={item.author}>{item.published && <small>{day(item.published)}</small>}</Author>
        <span className="guide-counts"><span title={t('Лайки')}><Icon name="heart" size={15}/>{item.likes}</span><span title={t('Комментарии')}><Icon name="comment" size={15}/>{item.comments}</span></span></div>
    </div>
  </article>;
}
// What the author sees on their own guide: published, waiting, turned down (why), a draft.
export function guideState(item) {
  const draft = item.draft;
  if (item.status === 'hidden') return { tone: 'bad', icon: 'eyeOff', text: item.reason ? t('Скрыт модератором: {reason}', { reason: item.reason }) : t('Скрыт модератором') };
  if (draft?.status === 'pending') return { tone: 'wait', icon: 'clock', text: item.status === 'approved' ? t('Опубликован · изменения на проверке') : t('На проверке') };
  if (draft?.status === 'rejected') return { tone: 'bad', icon: 'alert', text: draft.reason ? t('Не прошёл проверку: {reason}', { reason: draft.reason }) : t('Не прошёл проверку') };
  if (draft?.status === 'draft') return { tone: 'draft', icon: 'penLine', text: item.status === 'approved' ? t('Опубликован · есть неотправленные правки') : t('Черновик') };
  return { tone: 'ok', icon: 'check', text: t('Опубликован') };
}
