import { useState, useSyncExternalStore } from 'react';
import { Icon, Modal } from './Common.jsx';
import { t } from '../../scripts/i18n.mjs';

// The viewer confirms their age for this page only: it applies to every 18+ grid and background at
// once, and after a reload they are blurred again; «Скрыть 18+» blurs them at once. Until 1.6.1 the answer
// was kept in the browser for good (KEY), so that old answer is dropped.
const KEY = 'gridstudio.catalog.adult.v1';
try { localStorage.removeItem(KEY); } catch { /* Nothing was stored. */ }
const listeners = new Set();
let confirmed = false;
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
function setAdult(value) {
  confirmed = value;
  listeners.forEach(listener => listener());
}
export const isAdultWork = item => !!item?.tags?.includes('18+');
export const useAdultConfirmed = () => useSyncExternalStore(subscribe, () => confirmed, () => false);
// Shown once 18+ works are uncovered, to blur them again without a reload.
export function HideAdultButton() {
  if (!useAdultConfirmed()) return null;
  return <button type="button" className="catalog-hide-adult" onClick={() => setAdult(false)}><Icon name="eyeOff" size={16}/>{t('Скрыть 18+')}</button>;
}

// kind: 'grid' or 'background', for the words.
export function SensitiveArt({ item, kind = 'grid', className = '', children }) {
  const adult = useAdultConfirmed(), [asking, setAsking] = useState(false);
  if (!isAdultWork(item) || adult) return children;
  const background = kind === 'background';
  return <div className={`catalog-nsfw ${className}`.trim()}>
    <div className="catalog-nsfw-art" inert>{children}</div>
    <button className="catalog-nsfw-reveal" aria-label={background ? t('Показать фон 18+ «{title}»', { title: item.title }) : t('Показать сетку 18+ «{title}»', { title: item.title })} onClick={() => setAsking(true)}>
      <Icon name="eye"/><span>18+</span><small>{t('Нажми, чтобы показать')}</small>
    </button>
    {asking && <Modal title={t('Тебе есть 18?')} icon="shield" onClose={() => setAsking(false)}><div className="catalog-confirm">
      <p>{background ? t('Автор отметил этот фон как 18+: в нём может быть откровенный контент.') : t('Автор отметил эту сетку как 18+: в ней может быть откровенный контент.')}</p>
      <p className="catalog-muted">{t('Если подтвердишь, сетки и фоны 18+ будут показываться без размытия, пока ты не перезагрузишь страницу. Скрыть их раньше — кнопка «Скрыть 18+».')}</p>
      <div className="catalog-actions"><button className="catalog-button" onClick={() => setAsking(false)}>{t('Нет')}</button>
        <button className="catalog-button primary" onClick={() => { setAdult(true); setAsking(false); }} autoFocus>{t('Мне есть 18')}</button></div>
    </div></Modal>}
  </div>;
}
