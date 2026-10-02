import { CATALOG_PATH } from './api.js';
import { t } from '../../scripts/i18n.mjs';
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
    <small className="catalog-muted creator-credit-note">{nickname ? t('Автором будет твой ник из профиля: {nickname}.', { nickname }) : t('Автором будет твой ник из профиля.')}</small></label>;
}
