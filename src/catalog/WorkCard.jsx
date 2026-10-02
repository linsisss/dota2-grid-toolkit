import { CATALOG_PATH } from './api.js';
import GridPreview from './GridPreview.jsx';
import { SensitiveArt } from './Sensitive.jsx';
import { AdminEditButton } from './AdminEdit.jsx';
import { LikeButton } from './Account.jsx';
import { CreatorName } from './Creator.jsx';
import { locale, t } from '../../scripts/i18n.mjs';

// A published grid's card: the workshop's list and a creator's profile. `onChange`: a like or an admin's
// correction of this card.
export default function WorkCard({ item, onChange }) {
  return <article className="catalog-card"><SensitiveArt item={item}><a className="catalog-card-art" href={`${CATALOG_PATH}?id=${item.id}`}><GridPreview id={item.id} revision={item.revision} title={item.title}/></a></SensitiveArt>
    <div className="catalog-card-info"><div><a href={`${CATALOG_PATH}?id=${item.id}`}><h2>{item.title}</h2></a><p><CreatorName item={item}/></p></div>
      <div className="catalog-card-actions"><AdminEditButton item={item} compact onSaved={onChange}/><LikeButton item={item} onChange={onChange}/></div></div>
    <div className="catalog-card-meta"><span>{t('Символов: {symbols} · категорий: {categories}', { symbols: (item.stats.symbols || 0).toLocaleString(locale), categories: item.stats.categories.toLocaleString(locale) })}</span><span>{item.tags.map(tag => t(tag)).join(', ')}</span></div></article>;
}
