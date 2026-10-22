import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Brand, Icon } from '../catalog/Common.jsx';
import { CATALOG_PATH, GUIDES_PATH, STUDIO_PATH } from '../catalog/api.js';
import { useLanguage } from '../useLanguage.js';
import { useAppMotion } from '../useAppMotion.js';
import { t } from '../../scripts/i18n.mjs';
import LanguageSwitch from '../LanguageSwitch.jsx';
import { CommunityLink } from '../Community.jsx';
import { AccountButton, useAccount } from '../catalog/Account.jsx';
import SendToPC from '../SendToPC.jsx';
import CustomizePage from './CustomizePage.jsx';
import { lookMedia } from '../../scripts/customize-look.mjs';
import { applyLook, keepPrevious, lookFiles, namedMedia, readLink, storedLook, writeLink } from './look-state.js';
import { pruneMedia } from './look-store.js';
import { freshenLookItem, openLookItem } from '../studio-looks.js';

// /background: «Твоя Dota», one page for everything about Dota but grids and guides (CustomizePage.jsx,
// 2026-10-17). It was three tools on one entry — the menu background, ?tab=font the font, ?tab=interface the
// interface — and their addresses open their sections now. Ready backgrounds are in the workshop («Фоны»),
// where an old ?tab=gallery link goes.
const QUERY = new URLSearchParams(location.search);
const GALLERY = QUERY.get('tab') === 'gallery';
if (GALLERY) location.replace(`${CATALOG_PATH}?backgrounds`);
// ?background=<id>: the workshop's «Использовать» opens that background in «Фон меню»; the parameter is
// dropped once read, so a reload starts clean.
// ?item=<id>: a «Студия» background opened for changes (the address keeps it, so a reload reopens it).
const ITEM = (() => { const id = QUERY.get('item') || ''; return /^[a-f0-9-]{36}$/.test(id) ? id : null; })();
const LINKED = (() => { const id = Number(QUERY.get('background')); return Number.isInteger(id) && id > 0 ? id : 0; })();
// ?look=<id>: a «Студия» «Оформление» opened (2026-10-22): it replaces the page's state (the one before is
// kept for «Вернуть как было»), the page saves into it from then on, and the parameter is dropped.
const LOOK = (() => { const id = QUERY.get('look') || ''; return /^[a-f0-9-]{36}$/.test(id) ? id : null; })();
// A «Студия» background opened by itself (?item) is not saved into the «Оформление» the page was saving into.
if (ITEM && !LOOK) writeLink(null);

export { rich, Segmented, Field, CopyField, InstallWindow } from './ui.jsx';

export default function CustomizeApp() {
  useAppMotion();
  // RU / EN redraws the page in place (its files and settings stay).
  const lang = useLanguage();
  const [preset, setPreset] = useState(() => LINKED ? { id: LINKED } : null);
  // A document in place of the page's state (look-state.js applyLook): the page is taken away, the sections'
  // keys are written, and it is mounted again (`generation`), so each section reads them its usual way.
  const auth = useAccount(), [generation, setGeneration] = useState(0), [hold, setHold] = useState(!!LOOK), [notice, setNotice] = useState(null), [openError, setOpenError] = useState('');
  const missingFiles = async (look) => Object.keys(lookMedia(look)).length > Object.keys(await lookFiles(look)).length;
  async function replace(look, { files = {}, link = null, name = '', from = 'item', before = null, beforeLink = null } = {}) {
    if (before) await keepPrevious(before, beforeLink);
    flushSync(() => { setHold(true); setPreset(null); });
    let applied = look;
    try { applied = await applyLook(look, { files }); writeLink(link); }
    finally { setGeneration((value) => value + 1); setHold(false); }
    setNotice({ from, name, undo: !!before, missing: await missingFiles(applied).catch(() => false) });
  }
  // The user's files nothing names any more leave this browser (a minute in, once a visit; look-store.js).
  useEffect(() => { const timer = setTimeout(() => pruneMedia(namedMedia()), 60_000); return () => clearTimeout(timer); }, []);
  useEffect(() => {
    if (!LOOK || auth?.loading) return;
    (async () => {
      try {
        // A background video built before 22.10.2026 in it gives way to its source (src/studio-rebuild.js), or is
        // kept with a note when this browser has no source.
        const opened = await openLookItem(LOOK, auth?.user?.id || null);
        const { record, old } = await freshenLookItem(opened, auth?.user?.id || null).catch(() => ({ record: opened, old: false }));
        await keepPrevious(await storedLook(), readLink());
        await applyLook(record.look);
        writeLink({ id: record.id, name: record.name });
        setNotice({ from: QUERY.get('from') === 'background' ? 'background' : 'item', name: record.name, undo: true, missing: await missingFiles(record.look).catch(() => false), old });
      } catch (problem) { setOpenError(problem.message); }
      const url = new URL(location.href); url.searchParams.delete('look'); url.searchParams.delete('from'); history.replaceState(history.state, '', url);
      setGeneration((value) => value + 1); setHold(false);
    })();
  }, [auth?.loading]);
  useEffect(() => { document.title = t('Оформление Dota: фон, интерфейс и шрифт — GridStudio'); }, [lang]);
  useEffect(() => {
    if (!LINKED) return;
    const url = new URL(location.href); url.searchParams.delete('background'); history.replaceState(history.state, '', url);
  }, []);
  if (GALLERY) return null;
  return <div className="catalog-page custom-app cz-app">
    <header className="custom-top">
      <Brand/>
      <nav className="custom-links"><CommunityLink/><a href={CATALOG_PATH}>{t('Мастерская')}</a><a href={GUIDES_PATH}>{t('Гайды')}</a><a href={STUDIO_PATH}>{t('Студия')}<Icon name="arrow"/></a><LanguageSwitch/><AccountButton/></nav>
    </header>
    <SendToPC code={LINKED ? `b${LINKED}` : undefined} text={t('Всё собирается и ставится на компьютере. Пришлём ссылку в Telegram — открой её на ПК.')}/>
    {hold ? <main className="cz-work cz-holding"><p className="custom-hint" role="status">{t('Открываем оформление…')}</p></main>
      : <CustomizePage key={generation} preset={preset} studioItem={generation ? null : ITEM} onRemove={() => setPreset(null)} replace={replace} notice={notice} onNotice={setNotice} openError={openError}/>}
  </div>;
}
