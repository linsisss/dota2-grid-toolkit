import { useState, useSyncExternalStore } from 'react';
import { Icon, Modal } from './Common.jsx';

// The viewer confirms their age once; the answer is remembered in this browser only
// and applies to every 18+ grid on the page at once.
const KEY = 'gridstudio.catalog.adult.v1';
const listeners = new Set();
let confirmed = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
function confirmAdult() {
  confirmed = true;
  try { localStorage.setItem(KEY, '1'); } catch { /* Private mode: the answer lasts until reload. */ }
  listeners.forEach(listener => listener());
}
export const isAdultWork = item => !!item?.tags?.includes('18+');
export const useAdultConfirmed = () => useSyncExternalStore(subscribe, () => confirmed, () => false);

export function SensitiveArt({ item, children }) {
  const adult = useAdultConfirmed(), [asking, setAsking] = useState(false);
  if (!isAdultWork(item) || adult) return children;
  return <div className="catalog-nsfw">
    <div className="catalog-nsfw-art" inert>{children}</div>
    <button className="catalog-nsfw-reveal" aria-label={`Показать сетку 18+ «${item.title}»`} onClick={() => setAsking(true)}>
      <Icon name="eye"/><span>18+</span><small>Нажми, чтобы показать</small>
    </button>
    {asking && <Modal title="Тебе есть 18?" onClose={() => setAsking(false)}><div className="catalog-confirm">
      <p>Автор отметил эту сетку как 18+: в ней может быть откровенный контент.</p>
      <p className="catalog-muted">Если подтвердишь, все сетки 18+ будут показываться без размытия в этом браузере.</p>
      <div className="catalog-actions"><button className="catalog-button" onClick={() => setAsking(false)}>Нет</button>
        <button className="catalog-button primary" onClick={() => { confirmAdult(); setAsking(false); }} autoFocus>Мне есть 18</button></div>
    </div></Modal>}
  </div>;
}
