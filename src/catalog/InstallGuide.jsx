import { useEffect, useRef, useState } from 'react';
import { DEFAULT_STEAM_DIRECTORY, steamConfigFolder } from '../../scripts/steam-profile.mjs';
import { findSteamAccount } from '../../scripts/steam-folder.mjs';
import { Icon, Modal, rich } from './Common.jsx';
import { EDITOR_PATH, downloadGrid, gridInstallCommand, gridRestoreCommand } from './api.js';
import { t, translateMessage } from '../../scripts/i18n.mjs';
import VideoGuide from '../VideoGuide.jsx';

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

// How the grid gets into Dota, chosen as in the editor's download window (scripts/app.mjs openExport;
// asked for on 2026-10-02 — the guide with the command on top of the steps was too big): the file
// with the video and the steps (always first), or a PowerShell command (Windows) that puts the grid
// into the folder of the account signed in to Steam (server/grid-installs.mjs, scripts/installer.mjs).
// The command is made only once it is chosen: the grid is kept on the site for it, for a week.
const WINDOWS = /win/i.test(globalThis.navigator?.userAgentData?.platform || globalThis.navigator?.platform || '');

function Methods({ method, onChange }) {
  const card = (value, icon, title, text, disabled = false) => <label className="choice-card">
    <input type="radio" name="installMethod" value={value} checked={method === value} disabled={disabled} onChange={() => onChange(value)}/>
    <span className="choice-icon"><Icon name={icon}/></span><span><strong>{title}</strong><small>{text}</small></span></label>;
  return <fieldset className="choice-cards install-methods"><legend>{t('Как поставить в Dota')}</legend>
    {card('file', 'files', t('Файлом вручную'), t('hero_grid_config.json и инструкция с видео'))}
    {card('command', 'terminal', t('Командой PowerShell'), WINDOWS ? t('Одна команда сама положит сетку в папку твоего аккаунта Steam') : t('Только для Windows'), !WINDOWS)}
  </fieldset>;
}

function CommandSteps({ item, command }) {
  const [status, setStatus] = useState(null);
  const copy = async (text, done) => {
    try { await navigator.clipboard.writeText(text); setStatus({ text: done }); }
    catch { setStatus({ text: t('Не удалось скопировать. Выдели команду и скопируй вручную.'), error: true }); }
  };
  const ready = command?.text, keys = { key: <kbd>Win</kbd>, enter: <kbd>Enter</kbd>, paste: <kbd>Ctrl + V</kbd> };
  return <><ol className="catalog-install is-command">
    <li><strong>{t('Скопируй команду.')}</strong>
      <code className="catalog-install-command" data-state={command?.error ? 'error' : ready ? 'ready' : 'busy'}>{command?.error || ready || t('Готовим команду…')}</code>
      <div className="catalog-install-copy"><button className="catalog-button primary" disabled={!ready} onClick={() => copy(ready, t('Команда скопирована: вставь её в PowerShell'))}>
        <Icon name="copy"/>{t('Скопировать команду')}</button>
        {status && <span className="catalog-muted" role={status.error ? 'alert' : 'status'} data-state={status.error ? 'error' : 'ready'}>{status.text}</span>}</div></li>
    <li><strong>{t('Открой PowerShell.')}</strong> {rich(t('Нажми {key}, набери PowerShell и нажми {enter}.'), keys)}</li>
    <li><strong>{t('Вставь команду и нажми Enter.')}</strong> {rich(t('Правым кликом или {paste}. Команда сама найдёт папку аккаунта, открытого сейчас в Steam, попросит закрыть Dota 2 и заменит сетки, а прежние сохранит копией.'), keys)}</li>
    <li>{rich(t('{start}, открой «Герои» и выбери сетку в списке «Сортировка» внизу слева.'), { start: <strong>{t('Запусти Dota 2')}</strong> })}</li>
  </ol>
  <div className="catalog-install-notes">
    <p>{t('Команда работает 7 дней: сетка хранится на сайте только для неё.')} {rich(t('Хочешь оставить свои сетки? {open} — она добавится к твоему файлу, и ты скачаешь всё одним JSON.'), { open: <a href={`${EDITOR_PATH}?catalog=${item.id}`}>{t('Открой эту сетку в редакторе')}</a> })}</p>
    <p>{t('Вернуть прежние сетки:')} <code className="catalog-install-command is-small">{gridRestoreCommand()}</code>
      <button type="button" className="catalog-icon" aria-label={t('Скопировать команду возврата')} onClick={() => copy(gridRestoreCommand(), t('Команда возврата скопирована'))}><Icon name="copy"/></button></p>
  </div></>;
}

function FileSteps({ item }) {
  const file = <code>hero_grid_config.json</code>;
  return <><div className="catalog-install-video"><VideoGuide/></div><ol className="catalog-install">
    <li><strong>{t('Скачай сетку.')}</strong> {rich(t('Браузер сохранит файл {file} в «Загрузки».'), { file })}
      {item && <button className="catalog-button primary" onClick={() => downloadGrid(item.grid)}><Icon name="download"/>{t('Скачать грид')}</button>}
      <FileNameNote/></li>
    <li><strong>{t('Закрой Dota 2.')}</strong> {rich(t('Если в папке ниже уже есть {file}, сохрани его копию: новый файл заменит все твои сетки.'), { file })}
      <p className="catalog-muted">{rich(t('Хочешь оставить свои сетки? {open} — она добавится к твоему файлу, и ты скачаешь всё одним JSON.'), { open: item ? <a href={`${EDITOR_PATH}?catalog=${item.id}`}>{t('Открой эту сетку в редакторе')}</a> : t('Открой сетку в редакторе') })}</p></li>
    <li><strong>{t('Найди папку с настройками Dota 2.')}</strong><SteamFolder/></li>
    <li><strong>{t('Замени старый файл новым.')}</strong> {rich(t('Скопируй {file} в эту папку. Если Windows спросит про файл с таким же именем, выбери «Заменить файл в папке назначения».'), { file })}
      <p className="catalog-muted">{rich(t('В папке должен остаться один {file}. Файлы с другими именами Dota 2 не читает.'), { file })}</p></li>
    <li>{rich(t('{start}, открой «Герои» и выбери сетку в списке «Сортировка» внизу слева.'), { start: <strong>{t('Запусти Dota 2')}</strong> })}</li>
  </ol></>;
}

// Without a grid (the workshop's header) only the steps by hand.
export function InstallGuide({ item }) {
  const [method, setMethod] = useState('file'), [command, setCommand] = useState(null), asked = useRef(false);
  // Asked once, on the first choice of the command (again after a failure); switching back and forth keeps it.
  useEffect(() => {
    if (method !== 'command' || asked.current || !item) return;
    asked.current = true;
    setCommand(null);
    gridInstallCommand(item.grid).then(text => setCommand({ text }), error => { asked.current = false; setCommand({ error: error.message }); });
  }, [method]);
  if (!item) return <FileSteps/>;
  return <div className="catalog-install-guide"><Methods method={method} onChange={setMethod}/>
    {method === 'command' ? <CommandSteps item={item} command={command}/> : <FileSteps item={item}/>}</div>;
}

export function InstallButton({ item, className = 'catalog-button' }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className={className} onClick={() => setOpen(true)}>{t('Как установить')}</button>
    {open && <Modal title={t('Как установить сетку')} icon="book" size="md" onClose={() => setOpen(false)}><InstallGuide item={item}/></Modal>}</>;
}
