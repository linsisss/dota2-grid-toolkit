import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { catalogAPI, CATALOG_PATH } from './api.js';
import { Icon, Modal, Notice } from './Common.jsx';
import { profilePath } from './Creator.jsx';
import ProfileSettings from './ProfileSettings.jsx';
import { attachGuestWorkspaces, openWorkspaceRegistry } from '../../scripts/workspaces.mjs';
import { t } from '../../scripts/i18n.mjs';

const Context = createContext(null);
const AUTH_RECHECK = 5 * 60_000;
function openTelegramWindow() {
  const popup = window.open('about:blank', '_blank');
  if (popup) popup.opener = null;
  return popup;
}
export function AccountProvider({ children }) {
  const [user, setUser] = useState(null), [admin, setAdmin] = useState(false), [loading, setLoading] = useState(true), [login, setLogin] = useState(false), [reason, setReason] = useState('');
  const telegramWindow = useRef(null);
  const userRef = useRef(null), transferQueue = useRef(Promise.resolve()), checked = useRef(0), channel = useRef(null);
  const [fileSync, setFileSync] = useState({ busy: false, error: '', revision: 0 });
  async function refresh() { try { const result = await catalogAPI('/auth/me'); checked.current = Date.now(); userRef.current = result.user; setUser(result.user); setAdmin(!!result.admin); return result.user; } finally { setLoading(false); } }
  const announce = () => { try { channel.current?.postMessage('auth'); } catch { /* The other tabs catch up on their next recheck. */ } };
  function syncFiles() {
    const account = userRef.current;
    if (!account) return Promise.resolve();
    const current = () => userRef.current?.id === account.id;
    transferQueue.current = transferQueue.current.catch(() => {}).then(async () => {
      if (!current()) return;
      setFileSync(state => ({ ...state, busy: true, error: '' }));
      let registry, error = '';
      try { registry = await openWorkspaceRegistry(); error = (await attachGuestWorkspaces(registry, catalogAPI, account, current)).join('\n'); }
      catch (e) { error = e.message; }
      finally { registry?.database?.close(); if (current()) setFileSync(state => ({ busy: false, error, revision: state.revision + 1 })); }
    });
    return transferQueue.current;
  }
  useEffect(() => {
    refresh().catch(() => {});
    // Login and logout in another tab arrive at once. Switching back from Dota
    // only rechecks a session that is a few minutes old, not on every Alt+Tab.
    const recheck = () => refresh().then(() => syncFiles()).catch(() => {});
    const focus = () => { if (Date.now() - checked.current >= AUTH_RECHECK) recheck(); };
    channel.current = typeof BroadcastChannel === 'function' ? new BroadcastChannel('gridstudio-auth') : null;
    if (channel.current) channel.current.onmessage = recheck;
    window.addEventListener('focus', focus); window.addEventListener('online', recheck);
    return () => { channel.current?.close(); channel.current = null; window.removeEventListener('focus', focus); window.removeEventListener('online', recheck); };
  }, []);
  useEffect(() => { if (user) syncFiles(); else setFileSync(state => ({ ...state, busy: false, error: '' })); }, [user?.id]);
  return <Context.Provider value={{ user, admin, loading, refresh, fileSync, syncFiles, requestLogin: text => { telegramWindow.current = openTelegramWindow(); setReason(text || ''); setLogin(true); }, logout: async () => { await catalogAPI('/auth/logout', { method: 'POST', body: {} }); userRef.current = null; setUser(null); setAdmin(false); announce(); } }}>
    {children}{login && <LoginDialog telegramWindow={telegramWindow} reason={reason} onClose={() => setLogin(false)} onSuccess={async () => { await refresh(); announce(); setLogin(false); }}/>}</Context.Provider>;
}
export const useAccount = () => useContext(Context);
// The account's creator profile nickname (server/profiles.mjs) — the name the site shows for it.
export const accountLabel = user => user?.nickname || (user?.username ? `@${user.username}` : 'Telegram');
export function AccountAvatar({ user }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user?.id, user?.avatar]);
  const name = accountLabel(user);
  return <span className="account-avatar" aria-hidden="true">{user?.avatar && !failed ? <img src={user.avatar} alt="" width="32" height="32" onError={() => setFailed(true)}/> : user ? name[0].toUpperCase() : <Icon name="telegram"/>}</span>;
}
function LoginDialog({ telegramWindow, reason, onClose, onSuccess }) {
  const [request, setRequest] = useState(null), [error, setError] = useState(''), [finishing, setFinishing] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true, timer, polling = false; const controller = new AbortController(); setError(''); setRequest(null); setFinishing(false);
    let poll = () => {};
    const focus = () => { clearTimeout(timer); poll(); };
    catalogAPI('/auth/start', { method: 'POST', body: {}, signal: controller.signal }).then(value => {
      if (!active) return; setRequest(value);
      try { if (telegramWindow.current && !telegramWindow.current.closed) telegramWindow.current.location.replace(value.url); } catch { /* The visible link also works when a browser blocks the popup. */ }
      poll = async () => {
        if (polling || !active) return; polling = true;
        try { const result = await catalogAPI(`/auth/status?id=${value.id}`, { signal: controller.signal }); if (!active) return;
          if (result.state === 'approved') {
            setFinishing(true);
            await catalogAPI('/auth/finish', { method: 'POST', body: { id: value.id, userId: result.user.id }, signal: controller.signal });
            if (active) await onSuccess(); return;
          }
          timer = setTimeout(poll, 2000);
        } catch (e) { if (active) { setError(e.message); setFinishing(false); } }
        finally { polling = false; }
      }; timer = setTimeout(poll, 1500); window.addEventListener('focus', focus);
    }).catch(e => { if (active) { setError(e.message); try { telegramWindow.current?.close(); } catch { /* Already closed. */ } } });
    return () => { active = false; clearTimeout(timer); controller.abort(); window.removeEventListener('focus', focus); };
  }, [attempt]);
  return <Modal title={t('Войти через Telegram')} icon="telegram" onClose={onClose}><div className="catalog-login-flow">
    {reason && <p>{reason}</p>}
    <p className="catalog-muted">{t('После входа файлы этого браузера сохранятся в аккаунте.')}</p>
    {request ? <><p>{t('Нажми «Войти» в боте. Сайт подключит аккаунт автоматически.')}</p><p role="status">{finishing ? t('Входим…') : t('Ждём подтверждение в Telegram…')}</p><a className="catalog-link" href={request.url} target="_blank" rel="noreferrer">{t('Telegram не открылся?')}<Icon name="arrow"/></a></> : !error && <p role="status">{t('Открываем Telegram…')}</p>}
    {error && <><Notice error>{error}</Notice><button className="catalog-button" onClick={() => { telegramWindow.current = openTelegramWindow(); setAttempt(x => x + 1); }}>{t('Начать заново')}</button></>}
    <button className="catalog-link" onClick={onClose}>{t('Продолжить без входа')}</button>
  </div></Modal>;
}
// The signed-in account's menu drops down under the button (asked for on 2026-10-02 instead of a window):
// the profile, its settings, the admin panel, the files' sync state, signing out. Closes on a click
// outside, Escape or a choice; ↑ ↓ move between the items.
export function AccountButton() {
  const auth = useAccount(); const [open, setOpen] = useState(false), [settings, setSettings] = useState(false), [error, setError] = useState(''), [leaving, setLeaving] = useState(false);
  const box = useRef(null), button = useRef(null), menu = useRef(null);
  const close = (focus = false) => { setOpen(false); setError(''); if (focus) button.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector('[role=menuitem]')?.focus({ preventScroll: true });
    const away = (event) => { if (!box.current?.contains(event.target)) close(); };
    const keys = (event) => {
      if (event.key === 'Escape') return close(true);
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const items = [...(menu.current?.querySelectorAll('[role=menuitem]:not(:disabled)') || [])], at = items.indexOf(document.activeElement);
      if (!items.length) return;
      event.preventDefault();
      items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', keys);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', keys); };
  }, [open]);
  useEffect(() => { if (!auth.user) setOpen(false); }, [auth.user]);
  async function logout() {
    setLeaving(true); setError('');
    try { await auth.logout(); close(true); } catch (e) { setError(e.message); } finally { setLeaving(false); }
  }
  return <div className="account-wrap" ref={box}>
    <button ref={button} className="catalog-button account-button" disabled={auth.loading} aria-haspopup={auth.user ? 'menu' : undefined} aria-expanded={auth.user ? open : undefined}
      onClick={() => auth.user ? setOpen((value) => !value) : auth.requestLogin()}>
      {auth.user ? <AccountAvatar user={auth.user}/> : <Icon name="telegram"/>}<span className="account-label">{auth.user ? accountLabel(auth.user) : t('Войти через Telegram')}</span>
      {auth.user && <Icon name="chevron" size={15} className="account-chevron"/>}</button>
    {open && auth.user && <div className="account-menu" role="menu" ref={menu} aria-label={t('Аккаунт')}>
      <div className="account-menu-head"><AccountAvatar user={auth.user}/><span><b>{accountLabel(auth.user)}</b>{auth.user.username && <small>{t('Telegram: @{username}', { username: auth.user.username })}</small>}</span></div>
      <a role="menuitem" href={profilePath(auth.user.profile)}><Icon name="user"/>{t('Мой профиль')}</a>
      <a role="menuitem" href={`${profilePath(auth.user.profile)}&tab=liked`}><Icon name="heart"/>{t('Понравилось')}</a>
      <button role="menuitem" onClick={() => { close(); setSettings(true); }}><Icon name="sliders"/>{t('Настройки профиля')}</button>
      {auth.admin && <a role="menuitem" href={`${CATALOG_PATH}?moderate`}><Icon name="shield"/>Админка</a>}
      <hr/>
      <p className="account-menu-note">{auth.fileSync.busy ? <><Icon name="loader" size={14}/>{t('Сохраняем файлы…')}</> : t('Файлы автоматически сохраняются в аккаунте и доступны на других устройствах.')}</p>
      {auth.fileSync.error && <div className="account-menu-error" role="alert">{auth.fileSync.error}<button role="menuitem" className="catalog-link" onClick={() => auth.syncFiles()}>{t('Повторить сохранение')}</button></div>}
      <button role="menuitem" className="account-menu-out" disabled={leaving} onClick={logout}><Icon name="back"/>{leaving ? t('Выходим…') : t('Выйти')}</button>
      {error && <div className="account-menu-error" role="alert">{error}</div>}
    </div>}
    {settings && <ProfileSettings onClose={() => setSettings(false)} onSaved={() => auth.refresh().catch(() => {})}/>}
  </div>;
}
// `path`: the like endpoint — a grid's by default, `/backgrounds/:id/like` for a menu background,
// `/guides/:id/like` for a guide (with its own `ownLabel`).
// `item.mine` (the viewer's own grid or background): the server refuses the like, so the button
// stays in place with the count but is switched off.
export function LikeButton({ item, onChange, path = `/works/${item.id}/like`, ownLabel = '' }) {
  const auth = useAccount(); const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const own = item.mine ? ownLabel || t('Свою работу лайкнуть нельзя') : '';
  return <span className="catalog-like-wrap"><button className={`catalog-like${item.liked ? ' is-liked' : ''}${own ? ' is-own' : ''}`} aria-label={own || (item.liked ? t('Убрать лайк') : t('Поставить лайк'))} title={own || undefined} aria-pressed={!!item.liked} disabled={busy || !!own} onClick={async () => {
    if (!auth.user) return auth.requestLogin(t('Войди через Telegram, чтобы поставить лайк.'));
    setBusy(true); setError(''); try { const result = await catalogAPI(path, { method: 'PUT', body: { liked: !item.liked } }); onChange(result); }
    catch (e) { setError(e.message); if (e.status === 401) auth.requestLogin(); } finally { setBusy(false); }
  }}><Icon name="heart"/>{item.likes || 0}</button>{error && <span className="catalog-like-error" role="alert">{error}</span>}</span>;
}
// Followers get a Telegram message from the bot when this author publishes a new grid. `path`: a grid's
// by default, `/profiles/<key>/subscribe` on a creator's profile.
export function SubscribeButton({ item, onChange, path = `/works/${item.id}/subscribe` }) {
  const auth = useAccount(); const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!item.followable) return null;
  return <div className="catalog-subscribe">
    <button className={`catalog-button${item.subscribed ? ' is-subscribed' : ''}`} aria-pressed={!!item.subscribed} disabled={busy} onClick={async () => {
      if (!auth.user) return auth.requestLogin(t('Войди через Telegram, чтобы подписаться на автора. О новых сетках напишет бот.'));
      setBusy(true); setError('');
      try { onChange(await catalogAPI(path, { method: 'PUT', body: { subscribed: !item.subscribed } })); }
      catch (e) { setError(e.message); if (e.status === 401) auth.requestLogin(); } finally { setBusy(false); }
    }}><Icon name={item.subscribed ? 'check' : 'bell'}/>{item.subscribed ? t('Вы подписаны на автора') : t('Подписаться на автора')}</button>
    <p className="catalog-muted">{item.subscribed ? t('Бот пришлёт ссылку, когда автор выложит новую сетку.') : t('Новые сетки автора — сообщением от бота в Telegram.')}</p>
    {error && <Notice error>{error}</Notice>}
  </div>;
}
