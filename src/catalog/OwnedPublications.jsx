import { useEffect, useRef, useState } from 'react';
import { Icon } from './Common.jsx';
import GridPreview from './GridPreview.jsx';
import { catalogAPI, CATALOG_PATH, downloadGrid, managementLink } from './api.js';
import { locale, t, translateMessage } from '../../scripts/i18n.mjs';

function PublicationCard({ entry, token, accountId }) {
  const card = useRef(null);
  const [detail, setDetail] = useState(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setDetail(null); setError('');
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(item => item.isIntersecting)) return;
      observer.disconnect();
      catalogAPI(`/manage/${entry.id}`, { token, signal: controller.signal })
        .then(value => { if (!controller.signal.aborted) setDetail(value); })
        .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    }, { rootMargin: '150px' });
    observer.observe(card.current);
    return () => { observer.disconnect(); controller.abort(); };
  }, [entry.id, entry.revision, token, accountId, retry]);
  const item = detail || entry;
  const href = token ? managementLink(entry.id, token) : `${CATALOG_PATH}?id=${entry.id}&manage=1`;
  const status = item.blocked ? 'blocked' : item.status;
  const statusLabel = { approved: t('Опубликована'), pending: item.published ? t('Обновление на проверке') : t('На проверке'), rejected: t('Нужны изменения'), blocked: t('Заблокирована') }[status];
  const date = item.updated ? new Date(item.updated) : null;
  const canEdit = detail?.canEdit && !item.blocked;
  return <article ref={card} className="catalog-card publication-file">
    <a className="catalog-card-art publication-preview" href={href} aria-label={t('Открыть публикацию «{title}»', { title: item.title })}>
      {detail?.grid ? <GridPreview grid={detail.grid} title={item.title}/> : <span className="publication-placeholder"><Icon name="grid"/><span>{error ? t('Превью недоступно') : t('Загружаем превью…')}</span></span>}
    </a>
    <div className="catalog-card-info publication-info">
      <div><a href={href}><h2>{item.title}</h2></a>
        <div className="publication-meta"><span className={`publication-status status-${status || 'loading'}`}><i aria-hidden="true"/>{statusLabel || (error ? t('Не удалось загрузить статус') : t('Проверяем статус…'))}</span>{!item.linked && token && <span>{t('Без привязки')}</span>}</div>
      </div>
      {date && !Number.isNaN(date.getTime()) && <time dateTime={date.toISOString()}>{date.toLocaleDateString(locale)}</time>}
    </div>
    <div className="publication-actions">
      <a className="catalog-icon publication-action" href={href} aria-label={canEdit ? t('Изменить публикацию «{title}»', { title: item.title }) : t('Управлять публикацией «{title}»', { title: item.title })}><Icon name={canEdit ? 'edit' : 'sliders'}/><span className="publication-action-tooltip" aria-hidden="true">{canEdit ? t('Изменить публикацию') : t('Управление')}</span></a>
      <button className="catalog-icon publication-action" disabled={!detail?.grid} onClick={() => downloadGrid(detail.grid)} aria-label={t('Скачать сетку «{title}»', { title: item.title })}><Icon name="download"/><span className="publication-action-tooltip" aria-hidden="true">{t('Скачать сетку')}</span></button>
      {item.published && !item.blocked && <a className="catalog-icon publication-action" href={`${CATALOG_PATH}?id=${entry.id}`} aria-label={t('Открыть «{title}» в мастерской', { title: item.title })}><Icon name="external"/><span className="publication-action-tooltip" aria-hidden="true">{t('Открыть в мастерской')}</span></a>}
      {!item.linked && token && <a className="catalog-link" href={href}>{t('Привязать к аккаунту')}</a>}
    </div>
    {error && <p className="publication-error">{error} <button className="catalog-link" onClick={() => setRetry(value => value + 1)}>{t('Попробовать снова')}</button></p>}
    {item.reason && !error && <p className="publication-reason">{translateMessage(item.reason)}</p>}
  </article>;
}

export default function OwnedPublications({ items, guestItems, auth }) {
  const count = items.length + guestItems.length;
  return <section className="catalog-owned" aria-label={t('Мои публикации')}>
    <div className="catalog-results publication-summary"><span>{t('Публикаций: {count}', { count })}</span>
      {!auth.user && <p>{t('Без входа доступны заявки этого браузера.')} <button className="catalog-link" onClick={() => auth.requestLogin()}>{t('Войти')}</button></p>}
    </div>
    {count ? <div className="catalog-grid publication-files">
      {items.map(item => <PublicationCard key={`${auth.user?.id}:${item.id}`} entry={item} accountId={auth.user?.id}/>)}
      {guestItems.map(item => <PublicationCard key={`guest:${item.id}`} entry={item} token={item.token} accountId={auth.user?.id}/>)}
    </div> : <div className="catalog-empty"><Icon name="grid"/><h2>{t('Публикаций пока нет')}</h2><p>{t('Отправь сетку через «Экспортировать» → «Опубликовать в мастерскую».')}</p></div>}
  </section>;
}
