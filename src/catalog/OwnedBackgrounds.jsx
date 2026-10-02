import { useEffect, useState } from 'react';
import { listBackgrounds } from '../../scripts/background-library.mjs';
import { publicationStatus } from '../studio-backgrounds.js';
import { BackgroundCard } from './BackgroundGallery.jsx';
import { Icon, Notice } from './Common.jsx';
import { catalogAPI, CUSTOMIZE_PATH, STUDIO_PATH } from './api.js';
import { t, translateMessage } from '../../scripts/i18n.mjs';

const STATUS = () => ({ approved: t('Опубликован'), pending: t('На проверке'), rejected: t('Отклонён'), hidden: t('Скрыт из мастерской') });
const STATUS_CLASS = { approved: 'approved', pending: 'pending', rejected: 'rejected', hidden: 'blocked' };

// A guest's submissions are the studio's backgrounds of this browser that were published (they keep
// the gallery id and the status token, scripts/background-library.mjs); the poster is their own.
async function browserSubmissions() {
  const records = (await listBackgrounds().catch(() => [])).filter((record) => record.published);
  return Promise.all(records.map(async (record) => {
    const status = await publicationStatus(record.published).catch(() => null);
    return { id: record.published.id, title: record.name, author: '', tags: [], aspect: record.recipe.aspect, seconds: record.seconds || 0,
      status: status?.status || null, reason: status?.reason || '', created: record.created, poster: record.poster instanceof Blob ? URL.createObjectURL(record.poster) : null, local: true };
  }));
}

// The workshop's «Мои публикации» for menu backgrounds, as for grids (OwnedPublications.jsx): the
// Telegram account's backgrounds from the server and, too, those published from this browser.
export default function OwnedBackgrounds({ auth }) {
  const [remote, setRemote] = useState(null), [local, setLocal] = useState(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    if (!auth.user) { setRemote([]); return () => controller.abort(); }
    setRemote(null);
    catalogAPI('/backgrounds/mine', { signal: controller.signal }).then((data) => setRemote(data.items)).catch((problem) => { if (!controller.signal.aborted) { setError(problem.message); setRemote([]); } });
    return () => controller.abort();
  }, [auth.user?.id, retry]);
  useEffect(() => {
    let alive = true, made = [];
    browserSubmissions().then((items) => { made = items; if (alive) setLocal(items); else items.forEach((item) => item.poster && URL.revokeObjectURL(item.poster)); });
    return () => { alive = false; made.forEach((item) => item.poster && URL.revokeObjectURL(item.poster)); };
  }, [retry]);
  if (!remote || !local) return <p role="status">{t('Загружаем публикации…')}</p>;
  const items = [...remote, ...local.filter((item) => !remote.some((own) => own.id === item.id))];
  return <section className="catalog-owned" aria-label={t('Мои фоны')}>
    <div className="catalog-results publication-summary"><span>{t('Публикаций: {count}', { count: items.length })}</span>
      {!auth.user && <p>{t('Без входа видны фоны, опубликованные из этого браузера.')} <button className="catalog-link" onClick={() => auth.requestLogin()}>{t('Войти через Telegram')}</button></p>}
    </div>
    {error && <Notice error report>{error}<button className="catalog-link" onClick={() => setRetry((x) => x + 1)}>{t('Попробовать снова')}</button></Notice>}
    {items.length ? <div className="background-grid">{items.map((item) => {
      const approved = item.status === 'approved';
      return <BackgroundCard key={`${item.local ? 'local' : 'own'}:${item.id}`} item={item} poster={approved ? null : item.poster} playable={approved || !item.local}
        footer={<div className="background-card-status"><span className={`publication-status status-${STATUS_CLASS[item.status] || 'loading'}`}><i aria-hidden="true"/>{STATUS()[item.status] || t('Не удалось узнать статус')}</span>
          {item.reason && <p className="publication-reason">{translateMessage(item.reason)}</p>}</div>}>
        <div className="background-card-actions">
          {item.local && <a className="catalog-icon" href={`${STUDIO_PATH}&show=backgrounds`} aria-label={t('«{title}» в студии', { title: item.title })} title={t('Открыть в студии')}><Icon name="studio"/></a>}
          {approved && <a className="catalog-button" href={`${CUSTOMIZE_PATH}?background=${item.id}`}>{t('Использовать')}</a>}
        </div>
      </BackgroundCard>;
    })}</div> : <div className="catalog-empty"><Icon name="image"/><h2>{t('Публикаций пока нет')}</h2><p>{t('Собери фон и нажми «Опубликовать в мастерскую».')}</p><a className="catalog-button" href={CUSTOMIZE_PATH}>{t('Собрать фон')}</a></div>}
  </section>;
}
