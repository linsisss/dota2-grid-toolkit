import { useEffect, useRef, useState } from 'react';
import { BACKGROUND_TAGS } from '../../scripts/background-document.mjs';
import { isAdultWork, SensitiveArt, useAdultConfirmed } from './Sensitive.jsx';
import { catalogAPI } from './api.js';
import { locale, t } from '../../scripts/i18n.mjs';

// Shared menu backgrounds (server/catalog-backgrounds.mjs): the workshop's «Фоны» lists them with
// these cards, the builder's publish window picks tags here. Kept apart from the builder, so the
// workshop does not load its video encoder.
export const backgroundMedia = (id, file) => `/api/catalog/backgrounds/${id}/${file}`;
const seconds = (value) => t('{seconds} с', { seconds: (Math.round(value * 10) / 10).toLocaleString(locale) });

// Approved backgrounds with a tag and a search (title or author), 24 a page; `more` appends the
// next page. Typing waits a moment, like the grids' search.
export function useBackgrounds({ tag = '', query = '', sort = 'new' } = {}) {
  const [items, setItems] = useState(null), [total, setTotal] = useState(0), [page, setPage] = useState(0), [error, setError] = useState('');
  useEffect(() => { setItems(null); setPage(0); }, [tag, query, sort]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => catalogAPI(`/backgrounds?${new URLSearchParams({ tag, q: query, sort, page: String(page) })}`, { signal: controller.signal })
      .then((data) => { setItems((current) => page ? [...(current || []), ...data.items] : data.items); setTotal(data.total); setError(''); })
      .catch((problem) => { if (!controller.signal.aborted) setError(problem.message); }), query && !page ? 220 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [tag, query, sort, page]);
  const update = (id, patch) => setItems((current) => current?.map((item) => item.id === id ? { ...item, ...patch } : item));
  return { items, total, error, more: () => setPage((value) => value + 1), update };
}

// «Все теги» and the tags, as above the grids.
export function BackgroundTagFilter({ value, onChange }) {
  return <div className="catalog-tags catalog-filters"><button aria-pressed={!value} onClick={() => onChange('')}>{t('Все теги')}</button>{BACKGROUND_TAGS.map((tag) =>
    <button key={tag} aria-pressed={value === tag} onClick={() => onChange(value === tag ? '' : tag)}>{t(tag)}</button>)}</div>;
}
// Choosing up to three tags when publishing or moderating.
export function BackgroundTagPicker({ value, onChange }) {
  return <fieldset><legend>{t('Теги')} <span className="catalog-muted">{t('до трёх, необязательно')}</span></legend><div className="catalog-tags">{BACKGROUND_TAGS.map((tag) =>
    <button type="button" key={tag} aria-pressed={value.includes(tag)} disabled={!value.includes(tag) && value.length === 3} onClick={() => onChange(value.includes(tag) ? value.filter((x) => x !== tag) : [...value, tag])}>{t(tag)}</button>)}</div></fieldset>;
}

// A card like a grid's: the poster (the video while the pointer is on it), title, author and one
// action («Использовать»), then the screen and length on the left and the tags on the right.
// An 18+ background stays blurred (Sensitive.jsx) and does not play until the viewer confirms their age.
// «Мои публикации» give a poster of their own (a guest's submission kept in this browser, whose
// files the server does not show yet) and a status line (`footer`).
export function BackgroundCard({ item, children, poster = null, playable = true, footer = null }) {
  const video = useRef(null), covered = isAdultWork(item) && !useAdultConfirmed();
  const play = () => { const node = video.current; if (!node || covered || !playable) return; if (!node.src) node.src = backgroundMedia(item.id, 'video.webm'); node.play().catch(() => {}); };
  const stop = () => { video.current?.pause(); };
  return <article className="background-card" onPointerEnter={play} onPointerLeave={stop} onFocus={play} onBlur={stop}>
    <SensitiveArt item={item} kind="background" className="background-card-nsfw"><div className="background-card-picture">
      <img src={poster || backgroundMedia(item.id, 'poster.jpg')} alt="" loading="lazy"/>
      <video ref={video} muted loop playsInline preload="none"/>
    </div></SensitiveArt>
    <div className="background-card-info"><div><h3 title={item.title}>{item.title}</h3><p>{item.author || t('Без подписи')}</p></div>{children}</div>
    <div className="background-card-meta"><span>{item.aspect}{item.seconds ? ` · ${seconds(item.seconds)}` : ''}</span><span>{item.tags.map((tag) => t(tag)).join(', ')}</span></div>
    {footer}
  </article>;
}
