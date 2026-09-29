import { useEffect, useRef, useState } from 'react';
import { DEFAULT_STEAM_DIRECTORY, steamConfigFolder } from '../../scripts/steam-profile.mjs';
import { findSteamAccount } from '../../scripts/steam-folder.mjs';
import { Icon, Modal } from './Common.jsx';
import { EDITOR_PATH, downloadGrid } from './api.js';

// Kept while the page is open, so reopening the guide shows the same folder. Never stored.
const remembered = { profile: '', directory: DEFAULT_STEAM_DIRECTORY, account: null };

function SteamFolder() {
  const [profile, setProfile] = useState(remembered.profile), [directory, setDirectory] = useState(remembered.directory);
  const [account, setAccount] = useState(remembered.account), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(() => remembered.account ? { text: `Код друга: ${remembered.account.accountId}`, state: 'ready' } : null);
  const request = useRef(null), [custom] = useState(() => remembered.directory !== DEFAULT_STEAM_DIRECTORY);
  useEffect(() => () => request.current?.abort(), []);
  let path = '', pathError = '';
  try { path = steamConfigFolder(account?.accountId, directory); } catch (error) { pathError = error.message; }
  const reset = () => { request.current?.abort(); request.current = null; setBusy(false); setAccount(remembered.account = null); setCopied(false); };
  async function find(event) {
    event.preventDefault(); reset(); setStatus(null);
    const current = new AbortController(); request.current = current;
    try {
      const result = await findSteamAccount(profile, { signal: current.signal, onLookup: () => { setBusy(true); setStatus({ text: 'Ищем профиль Steam…' }); } });
      if (current.signal.aborted) return;
      remembered.account = result; remembered.profile = profile;
      setAccount(result); setStatus({ text: `Код друга: ${result.accountId}`, state: 'ready' });
    } catch (error) { if (!current.signal.aborted) setStatus({ text: error.message, state: 'error' }); }
    finally { if (request.current === current) { request.current = null; setBusy(false); } }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(path); setCopied(true); }
    catch { setStatus({ text: 'Не удалось скопировать. Выдели путь и скопируй вручную.', state: 'error' }); }
  }
  return <div className="catalog-steam">
    <form onSubmit={find} noValidate aria-busy={busy || undefined}>
      <label htmlFor="installSteamProfile">Ссылка на Steam или код друга</label>
      <div className="catalog-steam-input"><input id="installSteamProfile" value={profile} maxLength={256} autoComplete="off" spellCheck={false}
        placeholder="steamcommunity.com/id/… или код друга" aria-invalid={status?.state === 'error' || undefined} aria-describedby="installSteamStatus"
        onChange={event => { reset(); setStatus(null); setProfile(remembered.profile = event.target.value); }}/>
        <button className="catalog-button" disabled={busy || !profile.trim()}>{busy ? 'Ищем…' : 'Найти папку'}</button></div>
    </form>
    <p id="installSteamStatus" className="catalog-steam-status" data-state={status?.state} role={status?.state === 'error' ? 'alert' : 'status'} hidden={!status}>{status?.text}</p>
    <details className="catalog-steam-location" open={custom || undefined}><summary>Steam установлен в другой папке</summary>
      <label>Папка Steam<input value={directory} maxLength={260} spellCheck={false} placeholder="D:\Steam" aria-invalid={!!pathError || undefined}
        onChange={event => { setCopied(false); setDirectory(remembered.directory = event.target.value); }}/></label></details>
    <div className="catalog-steam-path"><code>{pathError || path}</code>
      <button type="button" className="catalog-button" disabled={!account || !!pathError} onClick={copy}><Icon name={copied ? 'check' : 'copy'}/>{copied ? 'Скопировано' : 'Скопировать'}</button></div>
    <p className="catalog-muted">Путь можно вставить в адресную строку Проводника. Код друга — это ID аккаунта в Dota 2.</p>
  </div>;
}

// Dota reads only hero_grid_config.json. People lose the grid to «hero_grid_config (1).json»
// (a second download) and «hero_grid_config.json.json» (renaming with hidden extensions).
export function FileNameNote() {
  return <div className="catalog-install-name">
    <p><strong>Имя файла должно быть ровно <code>hero_grid_config.json</code></strong> — Dota 2 читает только его.</p>
    <ul>
      <li>Если в «Загрузках» уже был такой файл, браузер назовёт новый <code>hero_grid_config (1).json</code>. Переименуй его: убери « (1)».</li>
      <li>Если Windows не показывает «.json» в именах, впиши при переименовании только <code>hero_grid_config</code>, иначе получится <code>hero_grid_config.json.json</code>.</li>
    </ul>
  </div>;
}

export function InstallGuide({ item }) {
  return <ol className="catalog-install">
    <li><strong>Скачай сетку.</strong> Браузер сохранит файл <code>hero_grid_config.json</code> в «Загрузки».
      {item && <button className="catalog-button primary" onClick={() => downloadGrid(item.grid)}><Icon name="download"/>Скачать грид</button>}
      <FileNameNote/></li>
    <li><strong>Закрой Dota 2.</strong> Если в папке ниже уже есть <code>hero_grid_config.json</code>, сохрани его копию: новый файл заменит все твои сетки.
      <p className="catalog-muted">Хочешь оставить свои сетки? {item ? <a href={`${EDITOR_PATH}?catalog=${item.id}`}>Открой эту сетку в редакторе</a> : 'Открой сетку в редакторе'} — она добавится к твоему файлу, и ты скачаешь всё одним JSON.</p></li>
    <li><strong>Найди папку с настройками Dota 2.</strong><SteamFolder/></li>
    <li><strong>Замени старый файл новым.</strong> Скопируй <code>hero_grid_config.json</code> в эту папку. Если Windows спросит про файл с таким же именем, выбери «Заменить файл в папке назначения».
      <p className="catalog-muted">В папке должен остаться один <code>hero_grid_config.json</code>. Файлы с другими именами Dota 2 не читает.</p></li>
    <li><strong>Запусти Dota 2</strong>, открой «Герои» и выбери сетку в списке «Сортировка» внизу слева.</li>
  </ol>;
}

export function InstallButton({ item, className = 'catalog-button' }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className={className} onClick={() => setOpen(true)}>Как установить</button>
    {open && <Modal title="Как установить сетку" size="md" onClose={() => setOpen(false)}><InstallGuide item={item}/></Modal>}</>;
}
