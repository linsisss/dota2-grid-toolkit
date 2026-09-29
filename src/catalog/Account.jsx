import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { catalogAPI, CATALOG_PATH } from './api.js';
import { Icon, Modal, Notice } from './Common.jsx';
import { attachGuestWorkspaces, openWorkspaceRegistry } from '../../scripts/workspaces.mjs';

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
export const accountLabel = user => user?.username ? `@${user.username}` : 'Telegram';
export function AccountAvatar({ user }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user?.id, user?.avatar]);
  return <span className="account-avatar" aria-hidden="true">{user?.avatar && !failed ? <img src={user.avatar} alt="" width="32" height="32" onError={() => setFailed(true)}/> : user?.username ? user.username[0].toUpperCase() : <Icon name="telegram"/>}</span>;
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
  return <Modal title="Войти через Telegram" onClose={onClose}><div className="catalog-login-flow">
    {reason && <p>{reason}</p>}
    <p className="catalog-muted">После входа файлы этого браузера сохранятся в аккаунте.</p>
    {request ? <><p>Нажми «Войти» в боте. Сайт подключит аккаунт автоматически.</p><p role="status">{finishing ? 'Входим…' : 'Ждём подтверждение в Telegram…'}</p><a className="catalog-link" href={request.url} target="_blank" rel="noreferrer">Telegram не открылся?<Icon name="arrow"/></a></> : !error && <p role="status">Открываем Telegram…</p>}
    {error && <><Notice error>{error}</Notice><button className="catalog-button" onClick={() => { telegramWindow.current = openTelegramWindow(); setAttempt(x => x + 1); }}>Начать заново</button></>}
    <button className="catalog-link" onClick={onClose}>Продолжить без входа</button>
  </div></Modal>;
}
export function AccountButton() {
  const auth = useAccount(); const [open, setOpen] = useState(false), [error, setError] = useState('');
  return <><button className="catalog-button account-button" disabled={auth.loading} onClick={() => auth.user ? setOpen(true) : auth.requestLogin()}>
    {auth.user ? <AccountAvatar user={auth.user}/> : <Icon name="telegram"/>}<span className="account-label">{auth.user ? accountLabel(auth.user) : 'Войти через Telegram'}</span></button>
    {open && <Modal title="Аккаунт" onClose={() => setOpen(false)}><div className="catalog-login-flow"><div className="account-profile"><AccountAvatar user={auth.user}/><h3>{accountLabel(auth.user)}</h3></div>{!auth.user?.username && <p className="catalog-muted">В Telegram не задан @username.</p>}<p>Файлы автоматически сохраняются в аккаунте и доступны на других устройствах.</p>{auth.admin && <a className="catalog-button" href={`${CATALOG_PATH}?moderate`}>Админка<Icon name="arrow"/></a>}{auth.fileSync.busy && <p role="status">Сохраняем файлы…</p>}{auth.fileSync.error && <Notice error>{auth.fileSync.error}<button className="catalog-link" onClick={() => auth.syncFiles()}>Повторить сохранение</button></Notice>}<button className="catalog-button" onClick={async () => { try { await auth.logout(); setOpen(false); } catch (e) { setError(e.message); } }}>Выйти</button>{error && <Notice error>{error}</Notice>}</div></Modal>}
  </>;
}
export function LikeButton({ item, onChange }) {
  const auth = useAccount(); const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <span className="catalog-like-wrap"><button className={`catalog-like${item.liked ? ' is-liked' : ''}`} aria-label={item.liked ? 'Убрать лайк' : 'Поставить лайк'} aria-pressed={!!item.liked} disabled={busy} onClick={async () => {
    if (!auth.user) return auth.requestLogin('Войди через Telegram, чтобы поставить лайк.');
    setBusy(true); setError(''); try { const result = await catalogAPI(`/works/${item.id}/like`, { method: 'PUT', body: { liked: !item.liked } }); onChange(result); }
    catch (e) { setError(e.message); if (e.status === 401) auth.requestLogin(); } finally { setBusy(false); }
  }}><Icon name="heart"/>{item.likes || 0}</button>{error && <span className="catalog-like-error" role="alert">{error}</span>}</span>;
}
// Followers get a Telegram message from the bot when this author publishes a new grid.
export function SubscribeButton({ item, onChange }) {
  const auth = useAccount(); const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!item.followable) return null;
  return <div className="catalog-subscribe">
    <button className={`catalog-button${item.subscribed ? ' is-subscribed' : ''}`} aria-pressed={!!item.subscribed} disabled={busy} onClick={async () => {
      if (!auth.user) return auth.requestLogin('Войди через Telegram, чтобы подписаться на автора. О новых сетках напишет бот.');
      setBusy(true); setError('');
      try { onChange(await catalogAPI(`/works/${item.id}/subscribe`, { method: 'PUT', body: { subscribed: !item.subscribed } })); }
      catch (e) { setError(e.message); if (e.status === 401) auth.requestLogin(); } finally { setBusy(false); }
    }}><Icon name={item.subscribed ? 'check' : 'bell'}/>{item.subscribed ? 'Вы подписаны на автора' : 'Подписаться на автора'}</button>
    <p className="catalog-muted">{item.subscribed ? 'Бот пришлёт ссылку, когда автор выложит новую сетку.' : 'Новые сетки автора — сообщением от бота в Telegram.'}</p>
    {error && <Notice error>{error}</Notice>}
  </div>;
}
