import { useEffect, useRef, useState } from 'react';
import { Icon, Modal, Notice } from './Common.jsx';
import { catalogAPI } from './api.js';
import { BadgeMark } from './BadgeMark.jsx';
import { BADGES, GRANTED_BADGES, badgeOf, badgesByWeight } from '../../scripts/profile-badges.mjs';
import { t, tn } from '../../scripts/i18n.mjs';

// Profile badges (scripts/profile-badges.mjs, medals from scripts/badge-marks.mjs; «Медали Dota», 2026-10-18):
// the row under a creator's nickname, the small medals after a nickname, and the admins' window that gives
// or takes them back (POST /admin/profiles/<key>/badges, recorded in «Журнал»).

// What a badge says in its tooltip and in «Все значки», with the numbers the profile knows: the likes
// now, the best Dotadle streak.
function badgeDetail(badge, { likes, best } = {}) {
  if (badge.likes && likes >= badge.likes) return t('{hint}. Сейчас — {count}', { hint: t(badge.hint), count: tn(likes, ['лайк', 'лайка', 'лайков'], ['like', 'likes']) });
  if (badge.streak && best >= badge.streak) return t('{hint}. Лучшая серия — {count}', { hint: t(badge.hint), count: tn(best, ['день', 'дня', 'дней'], ['day', 'days']) });
  return t(badge.hint);
}

// On the profile: the rare ones first; up to three are named, with more only the first two, the rest are
// medals alone; any of them or «Все значки» opens the list with what each one is for.
export function BadgeList({ badges, likes, best }) {
  const shown = badgesByWeight(badges), [open, setOpen] = useState(false), box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (event) => { if (!box.current?.contains(event.target)) setOpen(false); };
    const key = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]);
  if (!shown.length) return null;
  const named = shown.length > 3 ? 2 : shown.length, numbers = { likes, best };
  const toggle = () => setOpen((value) => !value);
  return <div className="profile-badges" ref={box} role="group" aria-label={t('Значки')}>
    {shown.map((badge, i) => <button key={badge.id} type="button" className={`profile-badge${badge.rare ? ' is-rare' : ''}${i < named ? '' : ' is-mark'}`}
      title={`${t(badge.label)} — ${badgeDetail(badge, numbers)}`} aria-label={i < named ? undefined : t(badge.label)} aria-expanded={open} onClick={toggle}>
      <BadgeMark badge={badge} size={24}/>{i < named && <span>{t(badge.label)}</span>}</button>)}
    {shown.length > named && <button type="button" className="profile-badges-all" aria-expanded={open} onClick={toggle}>{t('Все значки · {count}', { count: shown.length })}</button>}
    {open && <div className="badge-popover" role="dialog" aria-label={t('Значки')}>
      <header><b>{t('Значки')}</b><span>{shown.length}</span></header>
      <ul>{shown.map((badge) => <li key={badge.id}><BadgeMark badge={badge} size={36}/><div><b>{t(badge.label)}</b><small>{badgeDetail(badge, numbers)}</small></div></li>)}</ul>
    </div>}
  </div>;
}

// After a nickname (cards, a grid's page, guides, comments): the two weightiest medals; all the names in
// the tooltip, so the rest are not lost.
export function BadgeIcons({ badges }) {
  const shown = badgesByWeight(badges);
  if (!shown.length) return null;
  const names = shown.map((badge) => t(badge.label)).join(', ');
  return <span className="badge-icons" title={names} role="img" aria-label={t('Значки: {names}', { names })}>{shown.slice(0, 2).map((badge) =>
    <BadgeMark key={badge.id} badge={badge} size={18}/>)}</span>;
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
          <span className={`profile-badge${badge.rare ? ' is-rare' : ''}`}><BadgeMark badge={badge} size={28}/>{badge.label}</span>
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
