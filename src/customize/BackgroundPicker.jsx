import { useState } from 'react';
import { Icon, Modal, Notice } from '../catalog/Common.jsx';
import { BackgroundCard, BackgroundTagFilter, backgroundMedia, useBackgrounds } from '../catalog/BackgroundGallery.jsx';
import { catalogAPI } from '../catalog/api.js';
import { t } from '../../scripts/i18n.mjs';

// A workshop background's video as a File, downloaded with progress (`onProgress(0…1)`). `item` is the
// gallery's item or only { id } (a ?background= link, a studio recipe): then it is asked for first.
export async function downloadWorkshop(item, { signal, onProgress = () => {} } = {}) {
  const full = item.aspect ? item : await catalogAPI(`/backgrounds/${item.id}`, { signal });
  onProgress(0, full);
  const response = await fetch(backgroundMedia(full.id, 'video.webm'), { signal });
  if (!response.ok || !response.body) throw new Error(t('Не удалось загрузить фон из галереи. Попробуй ещё раз.'));
  const total = Number(response.headers.get('content-length')) || 0, reader = response.body.getReader(), parts = [];
  for (let received = 0; ;) {
    const { done, value } = await reader.read(); if (done) break;
    parts.push(value); received += value.length;
    if (total) onProgress(received / total, full);
  }
  return { item: full, file: new File(parts, `${full.title}.webm`, { type: 'video/webm' }), origin: { kind: 'workshop', id: full.id, title: full.title } };
}

// The workshop's backgrounds in a window, for the grid page or the hero page (asked for on 2026-10-16:
// a background from the workshop under the grid or behind the hero, and the menu one's own). The
// builder's screen first; «Любой экран» shows the rest.
export function BackgroundPicker({ aspect, where, onChoose, onClose }) {
  const [sort, setSort] = useState('popular'), [tag, setTag] = useState(''), [query, setQuery] = useState(''), [any, setAny] = useState(false);
  const { items, total, error, more } = useBackgrounds({ tag, query, sort, aspect: any ? '' : aspect });
  return <Modal title={t('Фон из мастерской {where}', { where })} icon="image" size="lg" onClose={onClose}><div className="background-picker">
    <div className="background-picker-bar">
      <div className="catalog-tabs" aria-label={t('Подборка')}>{[['popular', t('Популярные')], ['downloads', t('Скачивания')], ['new', t('Новые')]].map(([value, label]) =>
        <button key={value} type="button" aria-pressed={sort === value} onClick={() => setSort(value)}>{label}</button>)}</div>
      <label className="catalog-search"><Icon name="search"/><input aria-label={t('Поиск фонов')} placeholder={t('Название или автор')} value={query} maxLength={80} onChange={(event) => setQuery(event.target.value)}/></label>
    </div>
    <BackgroundTagFilter value={tag} onChange={setTag}/>
    <label className="catalog-check"><input type="checkbox" checked={any} onChange={(event) => setAny(event.target.checked)}/>{t('Фоны для других экранов тоже (не {aspect})', { aspect })}</label>
    {error && <Notice error>{error}</Notice>}
    {!items ? !error && <p role="status">{t('Загружаем фоны…')}</p> : items.length ? <>
      <section className="background-grid background-picker-grid" aria-label={t('Фоны мастерской')}>{items.map((item) => <BackgroundCard key={item.id} item={item}>
        <div className="background-card-actions"><button type="button" className="catalog-button primary" onClick={() => onChoose(item)}>{t('Выбрать')}</button></div></BackgroundCard>)}</section>
      {items.length < total && <button type="button" className="catalog-button background-more" onClick={more}>{t('Показать ещё')}</button>}
    </> : <p className="catalog-muted">{t('Таких фонов пока нет')}</p>}
  </div></Modal>;
}
