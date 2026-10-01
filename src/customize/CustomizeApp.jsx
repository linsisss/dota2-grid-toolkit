import { Fragment, useEffect, useState } from 'react';
import { Brand, Icon, Modal } from '../catalog/Common.jsx';
import { CATALOG_PATH, STUDIO_PATH } from '../catalog/api.js';
import { useLanguage } from '../useLanguage.js';
import { useAppMotion } from '../useAppMotion.js';
import { t } from '../../scripts/i18n.mjs';
import LanguageSwitch from '../LanguageSwitch.jsx';
import MenuBackground from './MenuBackground.jsx';
import FontPicker from './FontPicker.jsx';

// Two separate tools on one entry: the menu background builder, and with ?tab=font the font. Each
// is one screen with no page scroll on a desktop: the preview takes the space, the settings sit in
// a panel with the action at its foot, installation opens in a window. Ready backgrounds are in the
// workshop («Фоны»), where an old ?tab=gallery link now goes.
const TAB = new URLSearchParams(location.search).get('tab');
const PAGE = TAB === 'font' ? 'font' : TAB === 'gallery' ? 'gallery' : 'background';
if (PAGE === 'gallery') location.replace(`${CATALOG_PATH}?backgrounds`);
// ?background=<id>: the workshop's «Использовать» opens that background in the builder; the parameter is
// dropped once read, so a reload starts clean.
// ?item=<id>: a «Студия» background opened for changes (the address keeps it, so a reload reopens it).
const ITEM = (() => { const id = new URLSearchParams(location.search).get('item') || ''; return /^[a-f0-9-]{36}$/.test(id) ? id : null; })();
const LINKED = (() => { const id = Number(new URLSearchParams(location.search).get('background')); return Number.isInteger(id) && id > 0 ? id : 0; })();

// A translated text with React parts in its {placeholders}: rich(t('Запусти {file}.'), { file: <b>…</b> }).
export const rich = (text, parts) => text.split(/\{(\w+)\}/).map((piece, i) => (i % 2 ? <Fragment key={i}>{piece in parts ? parts[piece] : `{${piece}}`}</Fragment> : piece));
// Equal segments with a thumb that slides to the chosen one (--count, --index drive the CSS).
export function Segmented({ label, value, options, onChange }) {
  const index = Math.max(0, options.findIndex(([id]) => id === value));
  return <div className="custom-seg has-thumb" role="radiogroup" aria-label={label} style={{ '--count': options.length, '--index': index }}>
    <span className="custom-seg-thumb" aria-hidden="true"/>{options.map(([id, text]) =>
    <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)}>{text}</button>)}</div>;
}
// `aside`: a short note on the label's line (right), so it costs no line of its own.
export function Field({ label, aside, hint, children }) {
  return <div className="custom-field">{aside ? <span className="custom-label-row"><span className="custom-label">{label}</span><span className="custom-aside">{aside}</span></span>
    : <span className="custom-label">{label}</span>}{children}{hint && <p className="custom-hint">{hint}</p>}</div>;
}
export function CopyField({ value }) {
  const [copied, setCopied] = useState(false);
  return <span className="custom-copy"><code>{value}</code><button type="button" className="catalog-icon" aria-label={t('Скопировать {value}', { value })} onClick={async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* The value stays visible to copy by hand. */ }
  }}><Icon name={copied ? 'check' : 'copy'}/></button></span>;
}
// Installation steps plus the honest part about changing game files.
export function InstallWindow({ title, children, onClose }) {
  return <Modal title={title} onClose={onClose} size="md"><div className="custom-install">{children}
    <p className="custom-safety"><Icon name="alert" size={18}/><span><b>{t('Это безопасно?')}</b> {t('Это изменение файлов игры. Банов за шрифты и фоны меню не известно: они ничего не дают в игре. Но правила Steam изменение файлов формально не разрешают, так что решение за тобой. Всё возвращается проверкой целостности файлов в Steam.')}</span></p>
  </div></Modal>;
}

export default function CustomizeApp() {
  useAppMotion();
  // RU / EN redraws the builder in place (its file and settings stay).
  const lang = useLanguage();
  const [preset, setPreset] = useState(() => LINKED ? { id: LINKED } : null);
  useEffect(() => { document.title = PAGE === 'font' ? t('Шрифт для Dota — GridStudio') : t('Фон меню Dota — GridStudio'); }, [lang]);
  useEffect(() => {
    if (!LINKED) return;
    const url = new URL(location.href); url.searchParams.delete('background'); history.replaceState(history.state, '', url);
  }, []);
  if (PAGE === 'gallery') return null;
  return <div className="catalog-page custom-app">
    <header className="custom-top">
      <Brand/>
      <nav className="custom-links"><a href={CATALOG_PATH}>{t('Мастерская')}</a><a href={STUDIO_PATH}>{t('Студия')}<Icon name="arrow"/></a><LanguageSwitch/></nav>
    </header>
    {PAGE === 'font' ? <FontPicker/> : <MenuBackground preset={preset} studioItem={ITEM} onRemove={() => setPreset(null)}/>}
  </div>;
}
