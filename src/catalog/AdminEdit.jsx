import { useState } from 'react';
import { CATALOG_TAGS } from '../../scripts/catalog-document.mjs';
import { useAccount } from './Account.jsx';
import { Icon, Modal, Notice } from './Common.jsx';
import { catalogAPI } from './api.js';

// Admins fix a work's title, author and tags right where they see it. The server checks
// the Telegram admin on the request; for everyone else this renders nothing.
export function AdminEditButton({ item, onSaved, compact = false }) {
  const auth = useAccount(), [open, setOpen] = useState(false);
  if (!auth.admin) return null;
  return <>
    <button type="button" className={compact ? 'catalog-icon catalog-admin-edit' : 'catalog-button'} aria-label={`Изменить название, автора и теги «${item.title}»`}
      data-tooltip="Изменить название, автора и теги" onClick={() => setOpen(true)}><Icon name="edit"/>{!compact && 'Изменить данные'}</button>
    {open && <Modal title="Изменить данные сетки" onClose={() => setOpen(false)}><MetaForm item={item} onSaved={value => { onSaved(value); setOpen(false); }}/></Modal>}
  </>;
}

function MetaForm({ item, onSaved }) {
  const [title, setTitle] = useState(item.title), [author, setAuthor] = useState(item.author || '');
  const [tags, setTags] = useState(item.tags?.filter(tag => CATALOG_TAGS.includes(tag)) || []);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <form className="catalog-report catalog-meta-form" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const saved = await catalogAPI(`/admin/works/${item.id}`, { method: 'POST', body: { action: 'edit', revision: item.revision, title, author, tags } });
      onSaved({ title: saved.title, author: saved.author, tags: saved.tags });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }}>
    <label>Название<input value={title} onChange={event => setTitle(event.target.value)} maxLength={80} required autoFocus/></label>
    <label>Автор <span className="catalog-muted">необязательно</span><input value={author} onChange={event => setAuthor(event.target.value)} maxLength={40}/></label>
    <fieldset><legend>Теги <span className="catalog-muted">до трёх</span></legend><div className="catalog-tags">{CATALOG_TAGS.map(tag =>
      <button type="button" key={tag} aria-pressed={tags.includes(tag)} disabled={!tags.includes(tag) && tags.length >= 3}
        onClick={() => setTags(current => current.includes(tag) ? current.filter(value => value !== tag) : [...current, tag])}>{tag}</button>)}</div></fieldset>
    <p className="catalog-muted">Изменения видны в мастерской сразу, без повторной проверки. Действие записывается в журнал с твоим именем.</p>
    {error && <Notice error>{error}</Notice>}
    <button className="catalog-button primary" disabled={busy || !title.trim()}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
  </form>;
}
