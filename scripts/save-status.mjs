import { t } from './i18n.mjs';
// The statuses are compared as they come (Russian, scripts/workspaces.mjs) and in the page's
// language, in case the caller translated them; the editor translates the result when it shows it.
const known = (texts) => new Set(texts.flatMap((text) => (text ? [text, t(text)] : [text])));
const CLOUD_IDLE = known(['', 'Файл в аккаунте', 'Файл на устройстве', 'Сохранено в аккаунте']);
const CLOUD_PENDING = known(['Сохраняем в аккаунт…', 'Сохранено локально · ждёт синхронизации']);

// A local failure must never be masked by a later successful cloud response.
export function saveIndicator(local = { text: 'Изменения сохранены', warning: false }, cloud = '') {
  if (local.warning) return local;
  if (!CLOUD_IDLE.has(cloud) && !CLOUD_PENDING.has(cloud))
    return { text: 'Не синхронизировано', warning: true, detail: cloud };
  if (CLOUD_PENDING.has(cloud)) return { text: 'Сохраняем…', warning: false };
  return local;
}
