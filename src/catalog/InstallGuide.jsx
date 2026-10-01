import { useEffect, useRef, useState } from 'react';
import { DEFAULT_STEAM_DIRECTORY, steamConfigFolder } from '../../scripts/steam-profile.mjs';
import { findSteamAccount } from '../../scripts/steam-folder.mjs';
import { Icon, Modal, rich } from './Common.jsx';
import { EDITOR_PATH, downloadGrid } from './api.js';
import { t, translateMessage } from '../../scripts/i18n.mjs';

// Kept while the page is open, so reopening the guide shows the same folder. Never stored.
const remembered = { profile: '', directory: DEFAULT_STEAM_DIRECTORY, account: null };

function SteamFolder() {
  const [profile, setProfile] = useState(remembered.profile), [directory, setDirectory] = useState(remembered.directory);
  const [account, setAccount] = useState(remembered.account), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(() => remembered.account ? { text: t('Код друга: {id}', { id: remembered.account.accountId }), state: 'ready' } : null);
  const request = useRef(null), [custom] = useState(() => remembered.directory !== DEFAULT_STEAM_DIRECTORY);
  useEffect(() => () => request.current?.abort(), []);
  // The Steam helpers (scripts/steam-*.mjs, the server's lookup) explain in Russian: translated where a dictionary has it.
  let path = '', pathError = '';
  try { path = steamConfigFolder(account?.accountId, directory); } catch (error) { pathError = translateMessage(error.message); }
  const reset = () => { request.current?.abort(); request.current = null; setBusy(false); setAccount(remembered.account = null); setCopied(false); };
  async function find(event) {
    event.preventDefault(); reset(); setStatus(null);
    const current = new AbortController(); request.current = current;
    try {
      const result = await findSteamAccount(profile, { signal: current.signal, onLookup: () => { setBusy(true); setStatus({ text: t('Ищем профиль Steam…') }); } });
      if (current.signal.aborted) return;
      remembered.account = result; remembered.profile = profile;
      setAccount(result); setStatus({ text: t('Код друга: {id}', { id: result.accountId }), state: 'ready' });
    } catch (error) { if (!current.signal.aborted) setStatus({ text: translateMessage(error.message), state: 'error' }); }
    finally { if (request.current === current) { request.current = null; setBusy(false); } }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(path); setCopied(true); }
    catch { setStatus({ text: t('Не удалось скопировать. Выдели путь и скопируй вручную.'), state: 'error' }); }
  }
  return <div className="catalog-steam">
    <form onSubmit={find} noValidate aria-busy={busy || undefined}>
      <label htmlFor="installSteamProfile">{t('Ссылка на Steam или код друга')}</label>
      <div className="catalog-steam-input"><input id="installSteamProfile" value={profile} maxLength={256} autoComplete="off" spellCheck={false}
        placeholder={t('steamcommunity.com/id/… или код друга')} aria-invalid={status?.state === 'error' || undefined} aria-describedby="installSteamStatus"
        onChange={event => { reset(); setStatus(null); setProfile(remembered.profile = event.target.value); }}/>
        <button className="catalog-button" disabled={busy || !profile.trim()}>{busy ? t('Ищем…') : t('Найти папку')}</button></div>
    </form>
    <p id="installSteamStatus" className="catalog-steam-status" data-state={status?.state} role={status?.state === 'error' ? 'alert' : 'status'} hidden={!status}>{status?.text}</p>
    <details className="catalog-steam-location" open={custom || undefined}><summary>{t('Steam установлен в другой папке')}</summary>
      <label>{t('Папка Steam')}<input value={directory} maxLength={260} spellCheck={false} placeholder="D:\Steam" aria-invalid={!!pathError || undefined}
        onChange={event => { setCopied(false); setDirectory(remembered.directory = event.target.value); }}/></label></details>
    <div className="catalog-steam-path"><code>{pathError || path}</code>
      <button type="button" className="catalog-button" disabled={!account || !!pathError} onClick={copy}><Icon name={copied ? 'check' : 'copy'}/>{copied ? t('Скопировано') : t('Скопировать')}</button></div>
    <p className="catalog-muted">{t('Путь можно вставить в адресную строку Проводника. Код друга — это ID аккаунта в Dota 2.')}</p>
  </div>;
}

// Dota reads only hero_grid_config.json. People lose the grid to «hero_grid_config (1).json»
// (a second download) and «hero_grid_config.json.json» (renaming with hidden extensions).
export function FileNameNote() {
  return <div className="catalog-install-name">
    <p><strong>{rich(t('Имя файла должно быть ровно {file}'), { file: <code>hero_grid_config.json</code> })}</strong> {t('— Dota 2 читает только его.')}</p>
    <ul>
      <li>{rich(t('Если в «Загрузках» уже был такой файл, браузер назовёт новый {file}. Переименуй его: убери « (1)».'), { file: <code>hero_grid_config (1).json</code> })}</li>
      <li>{rich(t('Если Windows не показывает «.json» в именах, впиши при переименовании только {name}, иначе получится {file}.'), { name: <code>hero_grid_config</code>, file: <code>hero_grid_config.json.json</code> })}</li>
    </ul>
  </div>;
}

export function InstallGuide({ item }) {
  const file = <code>hero_grid_config.json</code>;
  return <ol className="catalog-install">
    <li><strong>{t('Скачай сетку.')}</strong> {rich(t('Браузер сохранит файл {file} в «Загрузки».'), { file })}
      {item && <button className="catalog-button primary" onClick={() => downloadGrid(item.grid)}><Icon name="download"/>{t('Скачать грид')}</button>}
      <FileNameNote/></li>
    <li><strong>{t('Закрой Dota 2.')}</strong> {rich(t('Если в папке ниже уже есть {file}, сохрани его копию: новый файл заменит все твои сетки.'), { file })}
      <p className="catalog-muted">{rich(t('Хочешь оставить свои сетки? {open} — она добавится к твоему файлу, и ты скачаешь всё одним JSON.'), { open: item ? <a href={`${EDITOR_PATH}?catalog=${item.id}`}>{t('Открой эту сетку в редакторе')}</a> : t('Открой сетку в редакторе') })}</p></li>
    <li><strong>{t('Найди папку с настройками Dota 2.')}</strong><SteamFolder/></li>
    <li><strong>{t('Замени старый файл новым.')}</strong> {rich(t('Скопируй {file} в эту папку. Если Windows спросит про файл с таким же именем, выбери «Заменить файл в папке назначения».'), { file })}
      <p className="catalog-muted">{rich(t('В папке должен остаться один {file}. Файлы с другими именами Dota 2 не читает.'), { file })}</p></li>
    <li>{rich(t('{start}, открой «Герои» и выбери сетку в списке «Сортировка» внизу слева.'), { start: <strong>{t('Запусти Dota 2')}</strong> })}</li>
  </ol>;
}

export function InstallButton({ item, className = 'catalog-button' }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className={className} onClick={() => setOpen(true)}>{t('Как установить')}</button>
    {open && <Modal title={t('Как установить сетку')} size="md" onClose={() => setOpen(false)}><InstallGuide item={item}/></Modal>}</>;
}
