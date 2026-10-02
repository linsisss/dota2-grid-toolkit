import { useState } from 'react';
import { Icon, Modal, Notice } from './Common.jsx';
import { catalogAPI } from './api.js';
import { BADGES, GRANTED_BADGES, badgeOf } from '../../scripts/profile-badges.mjs';
import { t } from '../../scripts/i18n.mjs';

// Profile badges (scripts/profile-badges.mjs): the row under a creator's nickname, and the admins' window
// that gives or takes them back (POST /admin/profiles/<key>/badges, recorded in «Журнал»).
export function BadgeList({ badges }) {
  const shown = badges.map(badgeOf).filter(Boolean);
  if (!shown.length) return null;
  return <ul className="profile-badges" aria-label={t('Значки')}>{shown.map((badge) =>
    <li key={badge.id} className={`profile-badge is-${badge.id}`} title={t(badge.hint)}><Icon name={badge.icon} size={15}/>{t(badge.label)}</li>)}</ul>;
}

// The badges as small icons right after a nickname (cards, a grid's page, guides, comments); the
// name of each in its tooltip.
export function BadgeIcons({ badges }) {
  const shown = (badges || []).map(badgeOf).filter(Boolean);
  if (!shown.length) return null;
  return <span className="badge-icons">{shown.map((badge) =>
    <span key={badge.id} className={`badge-icon is-${badge.id}`} title={t(badge.label)} role="img" aria-label={t(badge.label)}><Icon name={badge.icon} size={12}/></span>)}</span>;
}

export function BadgeEditor({ profile, onChange, onClose }) {
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  async function toggle(id) {
    setBusy(id); setError('');
    try { onChange((await catalogAPI(`/admin/profiles/${profile.key}/badges`, { method: 'POST', body: { badge: id, on: !profile.badges.includes(id) } })).badges); }
    catch (e) { setError(e.message); } finally { setBusy(''); }
  }
  return <Modal title="Значки" icon="award" size="md" lead={`Выдать или снять значок у ${profile.nickname}. Значок виден в профиле сразу; действие записывается в «Журнал».`} onClose={onClose}>
    <div className="catalog-confirm badge-editor">
      <div className="badge-editor-list">{GRANTED_BADGES.map(badgeOf).map((badge) => {
        const on = profile.badges.includes(badge.id);
        return <button key={badge.id} type="button" className={`badge-editor-item${on ? ' is-on' : ''}`} aria-pressed={on} disabled={!!busy} onClick={() => toggle(badge.id)}>
          <span className={`profile-badge is-${badge.id}`}><Icon name={badge.icon} size={15}/>{badge.label}</span>
          <small>{badge.hint}</small>
          <span className="badge-editor-state">{busy === badge.id ? 'Сохраняем…' : on ? <><Icon name="check" size={15}/>Выдан</> : 'Выдать'}</span>
        </button>;
      })}</div>
      <p className="catalog-muted">{BADGES.filter((badge) => badge.likes).map((badge) => badge.label).join(' и ')} выдаются сами по сумме лайков на сетках, фонах и гайдах автора (сейчас — {profile.stats.likes}).</p>
      {error && <Notice error>{error}</Notice>}
      <div className="catalog-actions"><button type="button" className="catalog-button" onClick={onClose}>Готово</button></div>
    </div>
  </Modal>;
}
