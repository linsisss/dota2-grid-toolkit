import { t } from './i18n.mjs';

const STEAM_BASE = 76561197960265728n;
const MAX_ACCOUNT = 4294967295n;
export const DEFAULT_STEAM_DIRECTORY = 'C:\\Program Files (x86)\\Steam';
const invalid = () => { throw new Error('Вставь ссылку на профиль steamcommunity.com или числовой код друга.'); };

export function steamAccount(value, steamId = false) {
  if (typeof value !== 'string' || value.length > 20 || !/^\d+$/.test(value)) return invalid();
  const number = BigInt(value), account = steamId ? number - STEAM_BASE : number;
  if (account < 1n || account > MAX_ACCOUNT) return invalid();
  return { accountId: String(account), steamId64: String(STEAM_BASE + account) };
}

export function parseSteamProfile(value) {
  if (typeof value !== 'string' || value.length > 256) return invalid();
  const input = value.trim();
  if (/^\d{1,17}$/.test(input)) return { kind: 'account', ...steamAccount(input, input.length === 17) };
  let url;
  try { url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`); } catch { return invalid(); }
  if (!['http:', 'https:'].includes(url.protocol) || !['steamcommunity.com', 'www.steamcommunity.com'].includes(url.hostname) || url.username || url.password || url.port) return invalid();
  const match = /^\/(id|profiles)\/([A-Za-z0-9_-]{1,64})\/?$/.exec(url.pathname);
  if (!match) return invalid();
  if (match[1] === 'profiles') return { kind: 'account', ...steamAccount(match[2], true) };
  return { kind: 'vanity', vanity: match[2] };
}

export function steamConfigFolder(accountId, directory = DEFAULT_STEAM_DIRECTORY) {
  const root = directory.trim().replace(/^"(.*)"$/, '$1').replaceAll('/', '\\');
  if (!root || root.length > 260 || !/^(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+)/.test(root)) throw new Error('Укажи полный путь к папке Steam, например D:\\Steam.');
  const account = accountId ? steamAccount(String(accountId)).accountId : t('ID АККАУНТА');
  return `${root.replace(/\\+$/, '')}\\userdata\\${account}\\570\\remote\\cfg`;
}
