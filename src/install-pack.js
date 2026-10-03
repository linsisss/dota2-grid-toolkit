import { catalogAPI } from './catalog/api.js';
import { installCommand } from '../scripts/installer.mjs';
import { lang, t } from '../scripts/i18n.mjs';

// The menu background's or the font's pack for «Командой PowerShell» (asked for on 2026-10-03: the
// command must download the chosen pack itself, so nothing can be mixed up): sent to the site in parts
// (server/install-packs.mjs keeps it a week, resumes an interrupted upload and keeps one copy of the
// same pack), then the command whose address carries the pack's SHA-256 and size — its script downloads
// exactly this file (scripts/installer.mjs). `kind`: 'bg' or 'font'; `onProgress`: the share sent, 0–1.
const PART = 4 * 1024 * 1024;
export async function sha256Hex(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function uploadInstallPack(kind, bytes, onProgress) {
  const hash = await sha256Hex(bytes);
  let state = await catalogAPI('/install/packs', { method: 'POST', body: { kind, sha256: hash, size: bytes.length } }), stalls = 0;
  onProgress?.(state.received / bytes.length);
  while (!state.ready) {
    const from = state.received;
    state = await catalogAPI(`/install/packs/${state.id}?offset=${from}`, { method: 'PUT', raw: bytes.subarray(from, Math.min(bytes.length, from + PART)) });
    stalls = state.received > from ? 0 : stalls + 1;
    if (stalls > 2) throw new Error(t('Не получилось отправить файл на сайт. Попробуй ещё раз.'));
    onProgress?.(state.received / bytes.length);
  }
  return installCommand(`${location.origin}/api/catalog/install/${kind}-${hash}-${bytes.length}${lang === 'en' ? '-en' : ''}`);
}
