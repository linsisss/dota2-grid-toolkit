import { useEffect, useState } from 'react';
import { catalogAPI, CATALOG_PATH, ownedToken, rememberEditing } from './api.js';
import { Icon, Modal, Notice } from './Common.jsx';
import PublishTarget from './PublishTarget.jsx';
import GridPreview from './GridPreview.jsx';
import { t } from '../../scripts/i18n.mjs';
import './catalog.css';

export default function EditorCatalog({ editor }) {
  const [sharing, setSharing] = useState(null), [incoming, setIncoming] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    const share = event => setSharing(event.detail);
    window.addEventListener('gridstudio:share', share);
    return () => window.removeEventListener('gridstudio:share', share);
  }, []);
  useEffect(() => {
    const url = new URL(location.href), id = url.searchParams.get('catalog'); if (!id) return;
    // ?manage=1 opens the player's own submission (also pending or rejected) for editing.
    const own = url.searchParams.has('manage'), c = new AbortController();
    catalogAPI(own ? `/manage/${id}` : `/works/${id}`, { token: own ? ownedToken(id) : undefined, signal: c.signal })
      .then(item => setIncoming({ ...item, own })).catch(e => { if (!c.signal.aborted) setError(e.message); });
    return () => c.abort();
  }, []);
  function dismiss() { setIncoming(null); setError(''); const url = new URL(location.href); url.searchParams.delete('catalog'); url.searchParams.delete('manage'); history.replaceState(null, '', url); }
  return <>
    {sharing && <Modal title={t('Опубликовать в мастерскую')} icon="workshop" size="lg" onClose={() => setSharing(null)}><PublishTarget grid={sharing}/></Modal>}
    {(incoming || error) && <Modal title={incoming?.own ? t('Редактировать заявку') : t('Сетка из мастерской')} icon="workshop" size="md" onClose={dismiss}><div className="catalog-report">{incoming && <><h3>{incoming.title}</h3><GridPreview grid={incoming.grid} title={incoming.title} large/>{incoming.own
          ? <p>{t('Сетка добавится к текущему файлу. Когда закончишь, нажми «Опубликовать» и выбери «Обновить «{title}»»: заявка обновится на месте, новая не создастся.', { title: incoming.title })}</p>
          : <p>{t('Добавить эту сетку к текущему файлу? Твои сетки и правки сохранятся. Добавление можно отменить через Ctrl+Z.')}</p>}<div className="catalog-actions"><button className="catalog-button primary" onClick={() => { if (editor.addCatalogGrid(incoming.grid)) { if (incoming.own) rememberEditing(incoming.id); dismiss(); } }}>{t('Добавить к моим сеткам')}<Icon name="plus"/></button><button className="catalog-button" onClick={dismiss}>{t('Отмена')}</button></div></>}{error && <Notice error>{error}</Notice>}<a className="catalog-link" href={CATALOG_PATH}>{t('Открыть мастерскую')}</a></div></Modal>}
  </>;
}
