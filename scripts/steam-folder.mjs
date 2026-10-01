import { DEFAULT_STEAM_DIRECTORY, parseSteamProfile, steamConfigFolder } from './steam-profile.mjs';
import { t, translateMessage } from './i18n.mjs';

// Convenience within this page only; never part of a grid or an exported file.
const remembered = { profile: '', directory: DEFAULT_STEAM_DIRECTORY, account: null };

// Steam link or friend code → { accountId, steamId64 }. Custom profile names are resolved by the
// catalog API; onLookup runs only before that network request. Shared by the editor and the workshop.
export async function findSteamAccount(value, { signal, onLookup } = {}) {
  const parsed = parseSteamProfile(value);
  if (parsed.kind !== 'vanity') return parsed;
  onLookup?.();
  let response, result;
  try {
    response = await fetch(`/api/catalog/steam/resolve?${new URLSearchParams({ profile: value.trim() })}`,
      { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(t('Steam сейчас недоступен. Попробуй ещё раз или введи код друга.'));
  }
  try { result = await response.json(); } catch { throw new Error(t('Не удалось связаться с сервером. Попробуй ещё раз или введи код друга.')); }
  if (!response.ok) throw new Error(translateMessage(result.error) || t('Не удалось найти профиль. Введи код друга.'));
  const checked = parseSteamProfile(result.steamId64);
  if (checked.kind !== 'account' || checked.accountId !== result.accountId) throw new Error(t('Не удалось определить код друга. Введи его вручную.'));
  return result;
}
export function steamFolderMarkup() {
  return `<div class="steam-folder" id="steamFolder">
    <form class="steam-folder-form" novalidate>
      <label for="steamProfile">${t('Ссылка на Steam или код друга')}</label>
      <div class="steam-folder-input"><input id="steamProfile" type="text" placeholder="${t('steamcommunity.com/id/… или код друга')}" maxlength="256" autocomplete="off" spellcheck="false" aria-describedby="steamFolderStatus"><button class="button secondary" type="submit">${t('Найти папку')}</button></div>
    </form>
    <p id="steamFolderStatus" class="steam-folder-status" role="status" aria-live="polite" hidden></p>
    <details class="steam-folder-location"><summary>${t('Steam установлен в другой папке')}</summary><label for="steamDirectory">${t('Папка Steam')}<input id="steamDirectory" type="text" maxlength="260" spellcheck="false" placeholder="D:\\Steam"></label></details>
    <div class="steam-folder-path"><code></code><button type="button" class="button secondary" data-copy-folder disabled>${t('Скопировать')}</button></div>
  </div>`;
}

export function mountSteamFolder(host, icon) {
  const lifetime = new AbortController(), form = host.querySelector('form'), input = host.querySelector('#steamProfile');
  const directory = host.querySelector('#steamDirectory'), submit = form.querySelector('button'), copy = host.querySelector('[data-copy-folder]');
  const code = host.querySelector('code'), status = host.querySelector('#steamFolderStatus');
  let request, account = remembered.account;
  input.value = remembered.profile; directory.value = remembered.directory;
  host.querySelector('details').open = directory.value !== DEFAULT_STEAM_DIRECTORY;
  const copyLabel = () => { copy.innerHTML = `${icon('copy')}${t('Скопировать')}`; };
  function message(text = '', state = '') {
    status.textContent = text; status.hidden = !text; status.dataset.state = state;
    status.setAttribute('role', state === 'error' ? 'alert' : 'status');
  }
  function updatePath() {
    copyLabel();
    try { code.textContent = steamConfigFolder(account?.accountId, directory.value); copy.disabled = !account; directory.removeAttribute('aria-invalid'); }
    catch (error) { code.textContent = error.message; copy.disabled = true; directory.setAttribute('aria-invalid', 'true'); }
  }
  function clearRequest() { request?.abort(); request = null; submit.disabled = false; submit.textContent = t('Найти папку'); form.removeAttribute('aria-busy'); }
  input.addEventListener('input', () => {
    clearRequest(); account = remembered.account = null; remembered.profile = input.value;
    input.removeAttribute('aria-invalid'); message(); updatePath();
  }, { signal: lifetime.signal });
  directory.addEventListener('input', () => { remembered.directory = directory.value; updatePath(); }, { signal: lifetime.signal });
  form.addEventListener('submit', async event => {
    event.preventDefault(); clearRequest(); account = remembered.account = null; updatePath();
    const current = new AbortController(); request = current;
    try {
      const result = await findSteamAccount(input.value, { signal: current.signal, onLookup: () => {
        submit.disabled = true; submit.textContent = t('Ищем…'); form.setAttribute('aria-busy', 'true'); message(t('Ищем профиль Steam…'));
      } });
      if (current.signal.aborted || lifetime.signal.aborted) return;
      account = remembered.account = result; remembered.profile = input.value;
      input.removeAttribute('aria-invalid'); updatePath(); message(t('Код друга: {id}', { id: result.accountId }), 'ready');
    } catch (error) {
      if (!current.signal.aborted && !lifetime.signal.aborted) { input.setAttribute('aria-invalid', 'true'); message(error.message, 'error'); }
    } finally { if (request === current) clearRequest(); }
  }, { signal: lifetime.signal });
  copy.addEventListener('click', async () => {
    if (copy.disabled) return;
    const path = code.textContent;
    try { await navigator.clipboard.writeText(path); if (!lifetime.signal.aborted && code.textContent === path) copy.innerHTML = `${icon('check')}${t('Скопировано')}`; }
    catch { if (!lifetime.signal.aborted) message(t('Не удалось скопировать. Выдели путь ниже и скопируй вручную.'), 'error'); }
  }, { signal: lifetime.signal });
  updatePath(); if (account) message(t('Код друга: {id}', { id: account.accountId }), 'ready');
  return () => { lifetime.abort(); clearRequest(); };
}
