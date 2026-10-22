import { catalogAPI } from './catalog/api.js';
import { LOOK_LIMITS, lookName, lookParts } from '../scripts/customize-look.mjs';
import { deleteLook, getLook, listLooks, putLook, updateLook } from './customize/look-store.js';
import { backgroundLook, freshenLook } from './studio-rebuild.js';
import { t } from '../scripts/i18n.mjs';

// «Оформление» items of «Студия» between this browser and a Telegram account (2026-10-22): the browser keeps
// the documents with their posters and the user's files (src/customize/look-store.js); the account keeps
// the documents and posters (server/studio-looks.mjs), never the files — like studio backgrounds
// (src/studio-backgrounds.js). Used by /background (save, open) and by the studio list.
export const lookPosterURL = (id) => `/api/catalog/studio/looks/${id}/poster.jpg`;
const REQUEST_BYTES = 2_150_000;

async function base64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
export async function pushLook(record) {
  return catalogAPI(`/studio/looks/${record.id}`, { method: 'PUT', maxBytes: REQUEST_BYTES,
    body: { name: record.name, look: record.look, ...(record.poster instanceof Blob ? { poster: await base64(record.poster) } : {}) } });
}
export const pullLooks = async () => (await catalogAPI('/studio/looks')).items;
export const fetchLook = (id) => catalogAPI(`/studio/looks/${id}`);
export const dropLook = (id) => catalogAPI(`/studio/looks/${id}`, { method: 'DELETE' });
const mine = (record, user) => !record.account || record.account === user;

// Kept here, then sent to the account when one is signed in (a guest's item joins the account that signs
// in; one of another account is never sent: a new item is made instead). → the record, `syncError` when
// the account did not take it (it stays here and the studio tries again).
// `built`: { hash: VIDEO_ENCODER } of the built videos the document holds (src/studio-rebuild.js), kept as it was when not given.
export async function saveLookItem({ id = null, name, look, poster = null, user = null, from = null, built = null }) {
  const old = id ? await getLook(id).catch(() => null) : null, usable = old && mine(old, user), now = Date.now();
  const record = { id: usable ? old.id : crypto.randomUUID(), name: lookName(name, t('Оформление')), account: usable ? old.account || user : user, look, parts: lookParts(look),
    poster: poster || (usable ? old.poster : null) || null, created: usable ? old.created : now, updated: now, synced: false, from: usable ? old.from ?? from : from,
    ...((built || (usable && old.built)) ? { built: built || old.built } : {}) };
  await putLook(record);
  if (user && record.account === user) {
    try { const saved = await pushLook(record); Object.assign(record, { synced: true, updated: saved.updated }); await updateLook(record.id, { synced: true, updated: saved.updated }); }
    catch (problem) { record.syncError = problem.message; }
  }
  return record;
}

// An item to open: this browser's, or the account's (kept here from then on).
export async function openLookItem(id, user = null) {
  const local = await getLook(id).catch(() => null);
  if (local && mine(local, user)) {
    if (!user || !local.synced) return local;
    // A newer version from another device replaces this one.
    const remote = await fetchLook(id).catch(() => null);
    if (remote && remote.updated > local.updated) return updateLook(id, { name: remote.name, look: remote.look, parts: remote.parts, updated: remote.updated });
    return local;
  }
  if (!user) throw new Error(t('Этого оформления нет в этом браузере. Войди, если оно сохранено в аккаунте.'));
  const remote = await fetchLook(id);
  let poster = null;
  if (remote.poster) poster = await fetch(lookPosterURL(id), { credentials: 'same-origin' }).then((response) => (response.ok ? response.blob() : null)).catch(() => null);
  const record = { id, name: remote.name, account: user, look: remote.look, parts: remote.parts, poster, created: remote.created, updated: remote.updated, synced: true, from: null };
  await putLook(record);
  return record;
}

// The studio list: this browser's items (a guest's, or this account's) merged with the account's. Not yet
// synced ones go up; synced ones gone from the account were deleted on another device; a newer one from
// the account replaces this one's document. Items only in the account are listed with `cloud: true`.
export async function syncLooks(user) {
  let local = (await listLooks().catch(() => [])).filter((record) => mine(record, user));
  if (!user) return { items: local, error: '' };
  let error = '';
  try {
    const remote = await pullLooks();
    for (const record of local) {
      const copy = remote.find((row) => row.id === record.id);
      try {
        if (!record.synced) { const saved = await pushLook({ ...record, account: user }); await updateLook(record.id, { account: user, synced: true, updated: saved.updated }); }
        else if (!copy) await deleteLook(record.id);
        else if (copy.updated > record.updated) { const full = await fetchLook(record.id); await updateLook(record.id, { name: full.name, look: full.look, parts: full.parts, updated: full.updated }); }
      } catch (problem) { error ||= problem.message; }
    }
    local = (await listLooks()).filter((record) => mine(record, user));
    const cloud = remote.filter((row) => !local.some((record) => record.id === row.id)).map((row) => ({ ...row, account: user, cloud: true }));
    return { items: [...local, ...cloud], error };
  } catch (problem) { return { items: local, error: problem.message }; }
}

export async function renameLookItem(item, name, user = null) {
  const next = { ...item, name: lookName(name, item.name), updated: Date.now() };
  if (item.cloud) { const full = await fetchLook(item.id); await pushLook({ ...full, name: next.name, id: item.id }); return next; }
  const saved = await updateLook(item.id, { name: next.name, updated: next.updated, synced: false });
  if (user && saved?.account === user) { const done = await pushLook(saved); await updateLook(item.id, { synced: true, updated: done.updated }); }
  return next;
}
export async function duplicateLookItem(item, name, user = null) {
  const source = item.cloud ? await openLookItem(item.id, user) : item;
  return saveLookItem({ name, look: source.look, poster: source.poster, user, from: source.from, built: source.built || null });
}
export async function removeLookItem(item, user = null) {
  if (!item.cloud) await deleteLook(item.id);
  if (user && item.account === user && (item.synced || item.cloud)) await dropLook(item.id);
}

// A «Студия» background as an «Оформление» (its menu, the rest as in Dota): its own videos built in this
// browser stand in for the user's files (scripts/customize-look.mjs lookFromRecipe); old ones (built before
// 22.10.2026) give way to the file itself when this browser has it (src/studio-rebuild.js). The background stays.
export async function lookFromBackground(background, user = null) {
  const { look, built } = await backgroundLook(background);
  return saveLookItem({ name: background.name, look, poster: background.poster instanceof Blob && background.poster.size <= LOOK_LIMITS.poster ? background.poster : null, user, from: background.id, built });
}
// An item about to open (CustomizeApp.jsx): old built videos in it replaced by their sources where it can.
export async function freshenLookItem(record, user = null) {
  return freshenLook(record, { save: (next) => saveLookItem({ id: next.id, name: next.name, look: next.look, poster: next.poster, user, from: next.from, built: next.built }) });
}
