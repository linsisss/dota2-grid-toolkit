import { CATALOG_PATH, CUSTOMIZE_PATH } from './api.js';
import { locale, t } from '../../scripts/i18n.mjs';
import { Icon } from './Common.jsx';
import { BadgeIcons } from './Badges.jsx';

// Creator profiles (server/profiles.mjs): a signed-in author's work, background or guide carries
// `creator` — { key, name, avatar } — and is signed by it; a guest's by the `author` they typed.
// `credit`: whose work it is based on («по мотивам»).
export const profilePath = (key) => `${CATALOG_PATH}?creator=${encodeURIComponent(key)}`;
export const creatorText = (item, fallback = '') => item?.creator?.name || item?.author || fallback;

export function CreatorName({ item, fallback = t('Без подписи'), avatar = true }) {
  const credit = item?.credit ? <span className="creator-credit"> · {t('по мотивам: {credit}', { credit: item.credit })}</span> : null;
  if (!item?.creator) return <>{item?.author || fallback}{credit}</>;
  return <><a className="creator-name" href={profilePath(item.creator.key)} onClick={(event) => event.stopPropagation()}>
    {avatar && <img src={item.creator.avatar} alt="" width="20" height="20" loading="lazy"/>}<span>{item.creator.name}</span><BadgeIcons badges={item.creator.badges}/></a>{credit}</>;
}

// «Оригинал / по мотивам» in place of «Автор» when a signed-in author sends a grid or a background.
export function CreditField({ value, onChange, nickname }) {
  return <label>{t('Оригинал / по мотивам')} <span className="catalog-muted">{t('необязательно')}</span>
    <input value={value} onChange={(event) => onChange(event.target.value)} maxLength={60} placeholder={t('Чья работа взята за основу')}/>
    {nickname !== undefined && <small className="catalog-muted creator-credit-note">{nickname ? t('Автором будет твой ник из профиля: {nickname}.', { nickname }) : t('Автором будет твой ник из профиля.')}</small>}</label>;
}

// How many people downloaded a workshop grid or background (server: one a visitor a day), beside its like.
export function Downloads({ count }) {
  if (!count) return null;
  const label = t('Скачали: {count}', { count: count.toLocaleString(locale) });
  return <span className="catalog-downloads" title={label} aria-label={label}><Icon name="download" size={16}/>{count.toLocaleString(locale)}</span>;
}

// Before sending a grid or a background: the published ones it looks like (server/similarity.mjs), with
// a link to each and a button that names the closest in «Оригинал / по мотивам».
export function SimilarWarning({ items, kind, credit, onCredit }) {
  const link = (item) => (kind === 'background' ? `${CUSTOMIZE_PATH}?background=${item.id}` : `${CATALOG_PATH}?id=${item.work}`);
  const named = (item) => (item.author ? `«${item.title}» — ${item.author}` : `«${item.title}»`);
  const first = items[0], text = named(first).slice(0, 60);
  return <div className="similar-warning" role="note">
    <strong>{kind === 'background' ? t('Похоже на фон из мастерской') : t('Похоже на работу из мастерской')}</strong>
    <ul>{items.map((item) => <li key={item.work || item.id}><a href={link(item)} target="_blank" rel="noreferrer">{named(item)}</a> · {Math.round(item.score * 100)}%</li>)}</ul>
    <p>{t('Если это работа по мотивам — укажи это. Перезалив чужой работы модератор отклонит.')}</p>
    {credit !== text && <button type="button" className="catalog-button" onClick={() => onCredit(text)}>{t('Указать «по мотивам»')}</button>}
  </div>;
}
