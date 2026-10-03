import { useEffect, useRef, useState } from 'react';
import { Icon, Modal, Notice } from './Common.jsx';
import { catalogAPI } from './api.js';
import { profilePath } from './Creator.jsx';
import { locale, t } from '../../scripts/i18n.mjs';

// One's own creator profile (server/profiles.mjs): the nickname (once a week), a few lines about
// oneself, whether the Telegram @username shows, and the avatar — the pattern, the Telegram photo or a
// picture of one's own (each avatar choice is saved at once). `onSaved`: the account is re-read so the
// header shows the new nickname and avatar.
const BIO = 300;
export default function ProfileSettings({ onClose, onSaved }) {
  const [profile, setProfile] = useState(null), [form, setForm] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const file = useRef(null);
  const take = (value) => { setProfile(value); setForm({ nickname: value.nickname, bio: value.bio, telegram: value.telegram }); };
  useEffect(() => { catalogAPI('/profile').then(take, (e) => setError(e.message)); }, []);
  async function run(request, after = null) {
    setBusy(true); setError('');
    try { const value = await request(); take(value); await onSaved?.(); after?.(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const avatar = (mode) => run(() => catalogAPI('/profile/avatar', { method: 'POST', body: { mode } }));
  const upload = (picked) => picked && run(() => catalogAPI('/profile/avatar', { method: 'PUT', raw: picked }));
  if (!form) return <Modal title={t('Профиль')} icon="user" onClose={onClose}><div className="catalog-login-flow">{error ? <Notice error>{error}</Notice> : <p role="status">{t('Загружаем профиль…')}</p>}</div></Modal>;
  const locked = profile.nicknameAt > Date.now(), changed = form.nickname !== profile.nickname || form.bio !== profile.bio || form.telegram !== profile.telegram;
  return <Modal title={t('Профиль')} icon="user" size="md" lead={t('Так тебя видят в мастерской, фонах и гайдах.')} onClose={onClose}>
    <form className="catalog-confirm profile-settings" onSubmit={(event) => { event.preventDefault(); if (changed) run(() => catalogAPI('/profile', { method: 'PATCH', body: form }), onClose); }}>
      <div className="profile-avatar-row">
        <img className="profile-avatar" src={profile.avatar} alt="" width="72" height="72"/>
        <div className="profile-avatar-choices" role="group" aria-label={t('Аватарка')}>
          <button type="button" className="catalog-button" aria-pressed={profile.avatarMode === 'pattern'} disabled={busy} onClick={() => avatar('pattern')}><Icon name="sparkle"/>{t('Узор')}</button>
          <button type="button" className="catalog-button" aria-pressed={profile.avatarMode === 'telegram'} disabled={busy || !profile.telegramPhoto} onClick={() => avatar('telegram')}
            title={profile.telegramPhoto ? undefined : t('В Telegram нет фото профиля, или оно скрыто от бота.')}><Icon name="telegram"/>{t('Фото из Telegram')}</button>
          <button type="button" className="catalog-button" aria-pressed={profile.avatarMode === 'custom'} disabled={busy} onClick={() => file.current?.click()}><Icon name="image"/>{t('Своя картинка')}</button>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="catalog-file" onChange={(event) => { upload(event.target.files[0]); event.target.value = ''; }}/>
        </div>
      </div>
      <label>{t('Ник')}<input value={form.nickname} maxLength={20} disabled={locked} autoComplete="off" spellCheck={false}
        onChange={(event) => setForm({ ...form, nickname: event.target.value.replace(/\s/g, '') })}/></label>
      <p className="catalog-muted profile-hint">{locked ? t('Ник можно менять раз в неделю. Следующая смена — {date}.', { date: new Date(profile.nicknameAt).toLocaleDateString(locale, { day: 'numeric', month: 'long' }) })
        : t('3–20 символов: буквы, цифры, _ . -. Менять ник можно раз в неделю.')}</p>
      <label>{t('О себе')}<textarea rows={4} maxLength={BIO} value={form.bio} placeholder={t('Что делаешь, где тебя найти')} onChange={(event) => setForm({ ...form, bio: event.target.value })}/></label>
      <p className="catalog-muted profile-hint">{t('Ссылки на Telegram, TikTok и YouTube будут кликабельными.')} {form.bio.length} / {BIO}</p>
      <label className="catalog-check"><input type="checkbox" checked={form.telegram} disabled={!profile.username} onChange={(event) => setForm({ ...form, telegram: event.target.checked })}/>
        {profile.username ? t('Показывать мой Telegram: @{username}', { username: profile.username }) : t('Показывать мой Telegram — в Telegram не задан @username')}</label>
      {error && <Notice error>{error}</Notice>}
      <div className="catalog-actions"><a className="catalog-link" href={profilePath(profile.key)}>{t('Открыть мой профиль')}<Icon name="arrow" size={14}/></a>
        <button type="button" className="catalog-button" onClick={onClose}>{t('Закрыть')}</button>
        <button className="catalog-button primary" disabled={busy || !changed}>{busy ? t('Сохраняем…') : t('Сохранить')}</button></div>
    </form>
  </Modal>;
}
