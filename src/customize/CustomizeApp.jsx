import { useEffect, useState } from 'react';
import { Brand, Icon } from '../catalog/Common.jsx';
import { CATALOG_PATH, GUIDES_PATH, STUDIO_PATH } from '../catalog/api.js';
import { useLanguage } from '../useLanguage.js';
import { useAppMotion } from '../useAppMotion.js';
import { t } from '../../scripts/i18n.mjs';
import LanguageSwitch from '../LanguageSwitch.jsx';
import { CommunityLink } from '../Community.jsx';
import { AccountButton } from '../catalog/Account.jsx';
import SendToPC from '../SendToPC.jsx';
import CustomizePage from './CustomizePage.jsx';

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

export { rich, Segmented, Field, CopyField, InstallWindow } from './ui.jsx';

export default function CustomizeApp() {
  useAppMotion();
  // RU / EN redraws the page in place (its files and settings stay).
  const lang = useLanguage();
  const [preset, setPreset] = useState(() => LINKED ? { id: LINKED } : null);
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
    <CustomizePage preset={preset} studioItem={ITEM} onRemove={() => setPreset(null)}/>
  </div>;
}
