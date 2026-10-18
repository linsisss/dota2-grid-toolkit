import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Notice } from '../catalog/Common.jsx';
import { t } from '../../scripts/i18n.mjs';
import { CURSOR_IDS, CURSOR_ROLES, cursorFiles } from '../../scripts/dota-cursor.mjs';
import { D2PFX, creditText } from '../../scripts/d2pfx.mjs';
import { D2pfxAbout, D2pfxNote, PackCredits, creditLine as creditsLine, creditsClosing } from './d2pfx-ui.jsx';
import { Field, Segmented } from './ui.jsx';
import { guideURL, pictureOf, placed, roleRGBA, roleURL } from './cursor-render.js';
import { keepPictures, loadPictures, newPictureKey, savePicture } from './cursor-store.js';
import { loadPack, loadPacks } from './d2pfx.js';

// «Курсор» (2026-10-17, the owner: «Создание курсора сделай примерно как тут в Cursor Creator… Вариант
// стрелка убери, вместо нее сделай d2pfx… Обязательно указывай автора»): «Вид» is Dota's cursors (nothing
// written), a d2pfx pack (scripts/d2pfx.mjs; its author named wherever it is used: here, in «Что внутри»,
// in the archive's read-me) or one's own, made in the creator (CursorCreator.jsx) for every cursor of
// Dota (CURSOR_ROLES). A pack's cursors open in the same creator to be changed. Each way keeps its own
// cursors, so switching loses nothing.
const CursorCreator = lazy(() => import('./CursorCreator.jsx'));
export const CURSOR_MODES = () => [['dota', t('Как в Dota')], ['d2pfx', 'd2pfx'], ['own', t('Своя')]];
const MODES = ['dota', 'd2pfx', 'own'];

// ——— Kept in this browser: the way, the pack (with its credit) and each cursor's place; the pictures in
// IndexedDB (cursor-store.js). The «Стрелка» of before was never saved, so nothing old needs mapping:
// an unknown way reads as Dota's.
const SAVED = 'gridstudio.cursor';
function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED) || '{}');
    return { mode: MODES.includes(saved.mode) ? saved.mode : 'dota', pack: saved.pack?.file ? saved.pack : null, own: saved.own || {}, packed: saved.packed || {} };
  } catch { return { mode: 'dota', pack: null, own: {}, packed: {} }; }
}
const place = (role) => ({ scale: role.scale, x: role.x, y: role.y, rot: role.rot, hot: role.hot || null });
const clean = (value) => Object.fromEntries(Object.entries(value).filter(([id]) => CURSOR_ROLES[id]));

export function useCursors() {
  const saved = useMemo(readSaved, []);
  const [mode, setModeState] = useState(saved.mode), [pack, setPack] = useState(saved.pack);
  // own / packed: { <id>: role } (cursor-render.js); in packed, null = a cursor of the pack taken out.
  const [own, setOwn] = useState({}), [packed, setPacked] = useState({}), [packBase, setPackBase] = useState({});
  const [ready, setReady] = useState(false), [packLoad, setPackLoad] = useState({ file: '', error: '' });
  const tweaks = useRef(clean(saved.packed));

  // Back from the last visit: one's own pictures; a pack's from d2pfx again, with the changes made to it.
  useEffect(() => {
    let gone = false;
    const ownSaved = clean(saved.own);
    loadPictures(Object.values(ownSaved).map((role) => role.key).filter(Boolean)).then((pictures) => {
      if (gone) return;
      setOwn(Object.fromEntries(Object.entries(ownSaved).filter(([, role]) => pictures[role.key]).map(([id, role]) => [id, { ...place(role), image: pictures[role.key], key: role.key, name: role.name || '' }])));
      setReady(true);
    });
    return () => { gone = true; };
  }, []);
  async function applyPack(meta, changes = {}) {
    setPackLoad({ file: meta.file, error: '' });
    try {
      const base = await loadPack(meta), keys = Object.values(changes).map((change) => change?.key).filter(Boolean), pictures = keys.length ? await loadPictures(keys) : {};
      const roles = { ...base };
      for (const [id, change] of Object.entries(changes)) {
        if (change?.gone) { roles[id] = null; continue; }
        if (change?.key && pictures[change.key]) roles[id] = { ...place(change), image: pictures[change.key], key: change.key, name: change.name || '', edited: true };
        else if (roles[id]) roles[id] = { ...roles[id], ...place(change), edited: true };
      }
      setPackBase(base); setPacked(roles); setPack(meta); setPackLoad({ file: '', error: '' });
      return true;
    } catch (problem) { setPackLoad({ file: '', error: problem.message }); return false; }
  }
  const packWanted = mode === 'd2pfx' && pack && !Object.keys(packBase).length;
  useEffect(() => { if (packWanted && !packLoad.file) applyPack(pack, tweaks.current); }, [packWanted]);

  // Saved a moment after a change; pictures no cursor uses any more leave IndexedDB.
  useEffect(() => {
    if (!ready) return undefined;
    const timer = setTimeout(() => {
      const ownOut = Object.fromEntries(Object.entries(own).filter(([, role]) => role?.image).map(([id, role]) => [id, { ...place(role), key: role.key, name: role.name }]));
      const packedOut = Object.keys(packBase).length ? Object.fromEntries(Object.entries(packed).filter(([, role]) => role === null || role.edited)
        .map(([id, role]) => [id, role === null ? { gone: true } : { ...place(role), ...(role.key ? { key: role.key, name: role.name } : {}) }])) : tweaks.current;
      tweaks.current = packedOut;
      try { localStorage.setItem(SAVED, JSON.stringify({ mode, pack, own: ownOut, packed: packedOut })); } catch { /* This visit only. */ }
      keepPictures([...Object.values(ownOut), ...Object.values(packedOut)].map((role) => role?.key).filter(Boolean));
    }, 300);
    return () => clearTimeout(timer);
  }, [ready, mode, pack, own, packed, packBase]);

  const roles = mode === 'own' ? own : mode === 'd2pfx' ? packed : {};
  const setRoles = mode === 'own' ? setOwn : setPacked;
  const active = Object.entries(roles).filter(([, role]) => role?.image);
  // A cursor changed in the creator: `patch` over it (null takes it out).
  function setRole(id, patch) {
    setRoles((all) => {
      if (patch === null) { const next = { ...all }; if (mode === 'own') delete next[id]; else next[id] = null; return next; }
      return { ...all, [id]: { ...(all[id] || {}), ...patch, edited: true } };
    });
  }
  // A picture for one cursor or for all (one key): fitted the way each cursor clicks.
  async function pickPicture(ids, file) {
    if (!file) return;
    if (file.size > 15_000_000) throw new Error(t('Картинка больше 15 МБ.'));
    let image;
    try { image = await pictureOf(file); } catch { throw new Error(t('Это не картинка: подойдёт PNG, WebP, JPEG или GIF.')); }
    const key = newPictureKey();
    savePicture(key, image);
    setRoles((all) => ({ ...all, ...Object.fromEntries(ids.map((id) => [id, { image, key, name: file.name, ...placed(id, image), hot: null, frames: null, pack: false, edited: true }])) }));
  }
  // «Сбросить» in the creator: the cursor's place back (a pack's cursor, even one given another picture, as the pack has it).
  function resetRole(id) {
    const role = roles[id];
    if (mode === 'd2pfx' && packBase[id]) setPacked((all) => ({ ...all, [id]: packBase[id] }));
    else if (role?.image) setRoles((all) => ({ ...all, [id]: { ...role, ...placed(id, role.image), hot: null } }));
  }
  async function choosePack(meta) {
    tweaks.current = {};
    return applyPack(meta);
  }
  function setMode(next) { setModeState(next); }
  function reset() {
    if (mode === 'own') setOwn({});
    if (mode === 'd2pfx') { setPack(null); setPacked({}); setPackBase({}); tweaks.current = {}; }
    setModeState('dota');
  }

  const fromPack = mode === 'd2pfx' && pack && active.some(([, role]) => role.pack || !role.key);
  const edited = mode === 'd2pfx' ? Object.values(packed).filter((role) => role === null || role.edited).length : 0;
  const files = () => cursorFiles(Object.fromEntries(active.map(([id, role]) => [id, { hot: role.hot || null, render: (size) => roleRGBA(role, size) }])));
  const creditLine = fromPack ? creditsLine(pack.credits) : '';
  const summary = !active.length ? '' : mode === 'own' ? t('Свой курсор: {count} из {all}', { count: active.length, all: CURSOR_IDS.length })
    : `${t('d2pfx: «{name}» · автор: {author}', { name: pack?.name, author: creditLine })}${edited ? ` · ${t('изменено: {count}', { count: edited })}` : ''}`;
  // The archive's read-me: the pack, where it is from and who made it.
  const credits = fromPack ? [t('Курсоры: пак «{name}» с {site} ({page}).', { name: pack.name, site: D2PFX.name, page: pack.page }),
    ...pack.credits.map((credit) => `${credit.kind === 'source' ? t('Источник:') : credit.kind === 'sender' ? t('Прислал:') : credit.kind === 'modded' ? t('Переделал:') : t('Автор:')} ${creditText(credit)}`),
    creditsClosing()] : [];
  const key = JSON.stringify([mode, pack?.file, active.map(([id, role]) => [id, role.key || role.pack, role.scale, role.x, role.y, role.rot, role.hot])]);
  const preview = roleURL((roles.cursor_default?.image && roles.cursor_default) || active[0]?.[1], 32);
  return { mode, setMode, roles, active, setRole, pickPicture, resetRole, pack, packs: loadPacks, choosePack, packLoad, ready, edited, fromPack,
    state: active.length ? 'changed' : 'default', summary, credits, creditLine, files, key, preview, reset };
}

// The credit, the note and «Про d2pfx» are shared with the other d2pfx sections (d2pfx-ui.jsx).
export { PackCredits };

// The packs: d2pfx's own picture, the name and the credit; a press takes the pack.
function PackGallery({ cur }) {
  const [list, setList] = useState(null), [error, setError] = useState('');
  useEffect(() => { cur.packs().then(setList, (problem) => setError(problem.message)); }, []);
  if (error) return <Notice error>{error} <button type="button" className="catalog-link" onClick={() => { setError(''); cur.packs().then(setList, (problem) => setError(problem.message)); }}>{t('Ещё раз')}</button></Notice>;
  if (!list) return <p className="custom-hint" role="status">{t('Загружаем паки с Dota2PornFX…')}</p>;
  return <ul className="cur-packs" aria-label={t('Паки курсоров d2pfx')}>{list.map((pack) => {
    const chosen = cur.pack?.file === pack.file, loading = cur.packLoad.file === pack.file;
    return <li key={pack.file} className={`cur-pack${chosen ? ' is-chosen' : ''}`}>
      <button type="button" aria-pressed={chosen} disabled={loading} onClick={() => cur.choosePack(pack)}>
        <span className="cur-pack-shot">{pack.preview && <img src={pack.preview} alt="" loading="lazy" decoding="async"/>}{loading && <span className="cur-pack-busy"><Icon name="loader"/></span>}{chosen && <span className="cur-pack-check"><Icon name="check" size={14}/></span>}</span>
        <b>{pack.name}</b></button>
      <PackCredits pack={pack} compact/>
    </li>;
  })}</ul>;
}

// ——— The section: the way, then the packs or one's own cursors, and the creator for both.
export function CursorFields({ cur }) {
  const [creator, setCreator] = useState(false), [about, setAbout] = useState(false);
  const choose = (mode) => { cur.setMode(mode); if (mode === 'own') setCreator(true); };
  const count = cur.active.length;
  return <>
    <Field label={t('Вид')} aside={<button type="button" className="catalog-link cur-about-link" onClick={() => setAbout(true)}><Icon name="help" size={13}/>{t('Про d2pfx')}</button>}>
      <Segmented label={t('Вид курсора')} value={cur.mode} onChange={choose} options={CURSOR_MODES()}/></Field>
    {cur.mode === 'd2pfx' && <>
      <D2pfxNote text={t('Курсоры взяты с {site}. Все работы принадлежат их авторам — автор указан у каждого пака.')} href={D2PFX.cursors} onMore={() => setAbout(true)}/>
      {cur.packLoad.error && <Notice error>{cur.packLoad.error}</Notice>}
      {cur.pack && count > 0 && <div className="cur-chosen">
        <span className="cur-chosen-icons" aria-hidden="true">{cur.active.slice(0, 6).map(([id, role]) => <img key={id} src={roleURL(role, 32)} width="24" height="24" alt=""/>)}</span>
        <span className="cur-chosen-text"><b>{cur.pack.name}</b><PackCredits pack={cur.pack}/>
          <small>{t('Курсоров: {count}', { count })}{cur.edited ? ` · ${t('изменено: {count}', { count: cur.edited })}` : ''} · <a href={cur.pack.page} target="_blank" rel="noopener noreferrer">{t('пак на d2pfx')}</a></small></span>
        <button type="button" className="catalog-button" onClick={() => setCreator(true)}><Icon name="edit"/>{t('Изменить')}</button>
      </div>}
      <PackGallery cur={cur}/>
    </>}
    {cur.mode === 'own' && <div className="cur-own">
      <span className="cur-own-icons" aria-hidden="true">{CURSOR_IDS.slice(0, 12).map((id) => {
        const role = cur.roles[id];
        return <img key={id} src={role?.image ? roleURL(role, 32) : guideURL(id)} className={role?.image ? '' : 'is-valve'} width="24" height="24" alt=""/>;
      })}</span>
      <p className="custom-hint">{count ? t('Своих курсоров: {count} из {all}. Остальные — как в Dota.', { count, all: CURSOR_IDS.length }) : t('Пока все курсоры как в Dota. Открой редактор и дай картинку хотя бы одному.')}</p>
      <button type="button" className="catalog-button primary" onClick={() => setCreator(true)}><Icon name="cursor"/>{count ? t('Открыть редактор курсора') : t('Создать курсор')}</button>
    </div>}
    <p className="custom-hint">{t('Размер в игре — от 32 px при обычном масштабе интерфейса; в файл идут все четыре размера Dota: 32, 48, 72 и 96 px.')}</p>
    {creator && <Suspense fallback={null}><CursorCreator cur={cur} onClose={() => setCreator(false)}/></Suspense>}
    {about && <D2pfxAbout onClose={() => setAbout(false)}/>}
  </>;
}
