import { useEffect, useState } from 'react';
import { useAccount } from './Account.jsx';
import SubmissionForm from './SubmissionForm.jsx';
import { catalogAPI, editingWork, forgetEditing, ownedWorks } from './api.js';
import { t } from '../../scripts/i18n.mjs';

const STATUS = () => ({ pending: t('на проверке'), rejected: t('нужны изменения'), approved: t('опубликована') });
const ORDER = { rejected: 0, pending: 1, approved: 2 };

// Publishing from the editor either creates a work or updates one of the player's own
// submissions in place, so a pending or rejected grid is edited instead of uploaded again.
export default function PublishTarget({ grid }) {
  const auth = useAccount();
  const [works, setWorks] = useState([]), [target, setTarget] = useState('');
  useEffect(() => {
    if (auth.loading) return;
    let active = true;
    (async () => {
      const account = auth.user ? (await catalogAPI('/mine').catch(() => ({ items: [] }))).items : [];
      const seen = new Set(account.map(item => item.id));
      const guest = await Promise.all(ownedWorks().filter(item => !seen.has(item.id)).slice(0, 20).map(({ id, token }) =>
        catalogAPI(`/manage/${id}`, { token }).then(({ grid: _grid, ...item }) => ({ ...item, token })).catch(() => null)));
      const list = [...account, ...guest.filter(Boolean)].filter(item => !item.blocked)
        .sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) || b.updated - a.updated);
      if (!active) return;
      setWorks(list);
      const remembered = list.find(item => item.id === editingWork() && item.canEdit);
      if (remembered) setTarget(remembered.id);
    })();
    return () => { active = false; };
  }, [auth.loading, auth.user?.id]);
  const existing = works.find(item => item.id === target);
  return <>
    {works.length > 0 && <div className="publish-target">
      <label>{t('Куда отправить')}<select value={target} onChange={event => setTarget(event.target.value)}>
        <option value="">{t('Новая публикация')}</option>
        {works.map(item => <option key={item.id} value={item.id} disabled={!item.canEdit}>
          {t('Обновить «{title}» — {status}', { title: item.title, status: STATUS()[item.status] || item.status })}{item.canEdit ? '' : ` ${t('(изменить можно после входа через Telegram)')}`}
        </option>)}
      </select></label>
      {existing && <p className="catalog-muted">{t('Заявка обновится на месте: сетка, название и теги заменятся, и она снова пройдёт проверку.')}{existing.published ? ` ${t('До одобрения в мастерской останется прежняя версия.')}` : ''}</p>}
    </div>}
    <SubmissionForm key={target || 'new'} grid={grid} existing={existing} token={existing?.token}
      onSaved={() => { if (existing) forgetEditing(); }}/>
  </>;
}
