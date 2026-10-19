import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Modal, Notice } from '../catalog/Common.jsx';
import catalog from '../../data/dota-fonts.json';
import { GRID_FONT_FILE, dotaFontPack, fontCoverage, readFont } from '../../scripts/dota-font.mjs';
// Valve's Radiance Semibold, the same file the site draws grids with (styles/game-fonts.css): with
// «Рисунки в сетке не съедут» it goes into the pack in its own place, so an earlier pack's
// replacement is undone too.
import gridFontURL from '../../assets/fonts/radiance-semibold.otf?url';
import { installCommand } from '../../scripts/installer.mjs';
import { lang, t } from '../../scripts/i18n.mjs';
import { CopyField, Field, rich } from './ui.jsx';
import { track } from '../site-stats.js';

// «Шрифт» of the one-page customization (CustomizePage.jsx; its own page /background?tab=font until
// 2026-10-17): a catalog font (assets/dota-fonts, data/dota-fonts.json) or the user's own .ttf/.otf
// becomes Valve's font files (scripts/dota-font.mjs), made in the browser; nothing is uploaded but the
// one file for its PowerShell command. «Шрифт Dota» (the default) changes nothing. The preview
// (FontScene.jsx, loaded only while it is shown) puts the font on the game's own screens.
const FontScene = lazy(() => import('./FontScene.jsx'));
const ROLES = () => [['Radiance', t('Текст')], ['Reaver', t('Заголовки')], ['RadianceM', t('Цифры')]];
const ROLE_HINT = () => t('Текст — чат, подсказки и категории сетки героев. Заголовки — верхнее меню и имена героев. Цифры — таймер и счёт.');
const fontURL = (id, file) => `./assets/dota-fonts/${id}/${file}`;
const loaded = new Map();
// Registers a face for the preview once; resolves when the browser can draw it.
function previewFace(family, source, weight) {
  const key = `${family}:${weight}`;
  if (!loaded.has(key)) loaded.set(key, new FontFace(family, typeof source === 'string' ? `url(${source})` : source, { weight: String(weight) })
    .load().then((face) => { document.fonts.add(face); return true; }).catch(() => false));
  return loaded.get(key);
}
const nearest = (files, weight) => [...files].sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight))[0];
export const fontRemoveCommand = () => installCommand(`${location.origin}/api/catalog/install/font-remove${lang === 'en' ? '-en' : ''}`);

function FontChip({ font, selected, onSelect }) {
  const face = nearest(font.files, 400), family = `GSFont-${font.id}`, [ready, setReady] = useState(false);
  useEffect(() => { previewFace(family, fontURL(font.id, face.file), face.weight).then(setReady); }, [font.id]);
  return <button type="button" role="radio" aria-checked={selected} onClick={onSelect} title={`${font.family} — ${t(font.style).toLowerCase()}`}>
    <span style={{ fontFamily: ready ? `'${family}'` : undefined, fontWeight: face.weight, opacity: ready ? 1 : 0.4 }}>{font.family}</span></button>;
}

// Back to Dota's own fonts, two ways: the command puts back the copy its install kept
// (scripts/installer.mjs fontRemoveScript); by hand, Steam's file check brings back Valve's files.
export function FontRestore({ onClose }) {
  return <Modal title={t('Вернуть обычный шрифт')} icon="undo" onClose={onClose} size="md"><div className="custom-install custom-restore">
    <section><h3>{t('Командой PowerShell')}</h3>
      <p>{t('Если шрифт ставился командой: она сохранила шрифты Dota и вернёт их.')}</p>
      <CopyField value={fontRemoveCommand()}/>
      <p className="catalog-muted">{rich(t('Открой PowerShell ({key}, набери PowerShell, {enter}), вставь команду и нажми {enter}. Закрыть игру она попросит сама.'), { key: <kbd>Win</kbd>, enter: <kbd>Enter</kbd> })}</p></section>
    <section><h3>{t('Файлами')}</h3><ol>
      <li>{t('Закрой Dota 2.')}</li>
      <li>{t('В Steam: Dota 2 → «Свойства» → «Установленные файлы» → «Проверить целостность файлов игры». Steam сам вернёт шрифты Dota.')}</li>
      <li>{rich(t('Или, если перед установкой сохранял папку {folder}, положи её обратно с заменой.'), { folder: <code>game\dota\panorama\fonts</code> })}</li>
      <li>{rich(t('Если есть папка {folder}, удали её: там старый кэш шрифтов.'), { folder: <CopyField value="%TEMP%\fontconfig"/> })}</li>
      <li>{t('Запусти Dota 2.')}</li>
    </ol></section>
  </div></Modal>;
}

// Remembered in this browser: the catalog font, the roles, the grid option (one's own font file is not).
const SAVED = 'gridstudio.font';
const readSaved = () => { try { return JSON.parse(localStorage.getItem(SAVED) || '{}') || {}; } catch { return {}; } };

// ——— The font's state, one place. `selected`: a catalog font's id, or null for Dota's own fonts.
export function useFont() {
  const saved = useMemo(readSaved, []);
  const [selected, setSelected] = useState(() => catalog.fonts.some((font) => font.id === saved.selected) ? saved.selected : null), [own, setOwn] = useState(null);
  const [roles, setRoles] = useState(() => ({ Radiance: true, Reaver: true, RadianceM: true, ...(saved.roles || {}) })), [keepGrid, setKeepGrid] = useState(!!saved.keepGrid);
  const [previewFamily, setPreviewFamily] = useState(''), [error, setError] = useState(''), [restore, setRestore] = useState(false);
  const chosen = own ? null : catalog.fonts.find((font) => font.id === selected) || null;
  useEffect(() => { try { localStorage.setItem(SAVED, JSON.stringify({ selected, roles, keepGrid })); } catch { /* This visit only. */ } }, [selected, roles, keepGrid]);
  // The preview family: every weight of the chosen font, so bold and semi-bold text look right.
  useEffect(() => {
    let cancelled = false; setPreviewFamily('');
    if (own) Promise.all(own.faces.map((face) => previewFace(own.family, face.bytes.slice().buffer, face.font.weight))).then(() => !cancelled && setPreviewFamily(own.family));
    else if (chosen) Promise.all(chosen.files.map((file) => previewFace(`GSFont-${chosen.id}`, fontURL(chosen.id, file.file), file.weight))).then(() => !cancelled && setPreviewFamily(`GSFont-${chosen.id}`));
    return () => { cancelled = true; };
  }, [selected, own]);
  const warnings = useMemo(() => {
    if (!own) return [];
    const missing = own.faces.map((face) => fontCoverage(face.font)), cyrillic = new Set(missing.flatMap((m) => m.cyrillic)), latin = new Set(missing.flatMap((m) => m.latin));
    return [cyrillic.size && t('Нет русских букв: {letters}. Их Dota возьмёт из другого шрифта.', { letters: `${[...cyrillic].slice(0, 12).join(' ')}${cyrillic.size > 12 ? '…' : ''}` }),
      latin.size && t('Нет латинских букв или цифр: {letters}.', { letters: [...latin].slice(0, 12).join(' ') })].filter(Boolean);
  }, [own]);
  async function upload(files) {
    setError('');
    try {
      const faces = [];
      for (const file of files) {
        if (file.size > 30_000_000) throw new Error(t('{name}: файл больше 30 МБ.', { name: file.name }));
        const bytes = new Uint8Array(await file.arrayBuffer());
        try { faces.push({ name: file.name, bytes, font: readFont(bytes) }); }
        catch (e) { throw new Error(`${file.name}: ${e.message}`); }
      }
      if (!faces.length) return;
      faces.sort((a, b) => a.font.weight - b.font.weight);
      setOwn({ family: `GSFont-own-${Date.now()}`, name: faces[0].font.names[16] || faces[0].font.names[1] || faces[0].name, faces });
    } catch (e) { setError(e.message); }
  }
  const families = ROLES().map(([role]) => role).filter((role) => roles[role]);
  const changed = (!!own || !!chosen) && families.length > 0;
  // The fonts for game/dota/panorama/fonts and the licence: [{ name: 'fonts/<Valve's file>.otf' | 'OFL.txt', data }].
  async function files() {
    if (!changed) return [];
    let fonts;
    if (own) fonts = own.faces.map((face) => face.font);
    else fonts = await Promise.all(chosen.files.map(async (file) => {
      const response = await fetch(fontURL(chosen.id, file.file));
      if (!response.ok) throw new Error(t('Не удалось загрузить шрифт. Обнови страницу.'));
      return readFont(new Uint8Array(await response.arrayBuffer()));
    }));
    const keep = keepGrid && families.includes('Radiance');
    const out = dotaFontPack(fonts, families, { keep: keep ? [GRID_FONT_FILE] : [] }).map((file) => ({ name: `fonts/${file.name}`, data: file.data }));
    if (keep) {
      const response = await fetch(gridFontURL);
      if (!response.ok) throw new Error(t('Не удалось загрузить шрифт. Обнови страницу.'));
      out.push({ name: `fonts/${GRID_FONT_FILE}.otf`, data: new Uint8Array(await response.arrayBuffer()) });
    }
    if (!own) out.push({ name: 'OFL.txt', data: new TextEncoder().encode(await (await fetch(fontURL(chosen.id, 'OFL.txt'))).text()) });
    return out;
  }
  // The real size, made a moment after a change (the font files are fetched once and cached by the browser).
  const [size, setSize] = useState(null);
  useEffect(() => {
    if (!changed) { setSize(null); return undefined; }
    let gone = false;
    const timer = setTimeout(() => files().then((list) => !gone && setSize({ bytes: list.filter((file) => file.name.startsWith('fonts/')).reduce((sum, file) => sum + file.data.length, 0), count: list.length })).catch(() => {}), 300);
    return () => { gone = true; clearTimeout(timer); };
  }, [changed, selected, own, roles.Radiance, roles.Reaver, roles.RadianceM, keepGrid]);
  const name = own ? own.name : chosen?.family || '';
  const summary = changed ? `${name} · ${ROLES().filter(([role]) => roles[role]).map(([, label]) => label.toLowerCase()).join(', ')}` : '';
  const choose = (id) => { setOwn(null); setSelected(id); };
  const reset = () => { setOwn(null); setSelected(null); };
  return { selected, choose, own, setOwn, upload, roles, setRoles, keepGrid, setKeepGrid, previewFamily, warnings, error, changed, files, size, summary, name, license: own ? 'own' : chosen?.license || '', reset,
    restore, setRestore, state: changed ? 'changed' : 'default', families };
}

export function FontFields({ font }) {
  const input = useRef(null), dota = !font.own && !font.selected;
  return <>
    <div className="custom-fonts" role="radiogroup" aria-label={t('Шрифт')}>
      <button type="button" role="radio" aria-checked={dota} className="custom-font-dota" onClick={() => font.choose(null)}><span>{t('Шрифт Dota')}</span></button>
      {catalog.fonts.map((item) => <FontChip key={item.id} font={item} selected={!font.own && font.selected === item.id} onSelect={() => { track('customize.preset', { section: 'font', preset: `font:${item.id}` }); font.choose(item.id); }}/>)}
      <button type="button" role="radio" aria-checked={!!font.own} className="custom-font-own" onClick={() => input.current?.click()}><Icon name="plus"/>{font.own ? t('Свой: {name}', { name: font.own.name }) : t('Свой шрифт .ttf / .otf')}</button>
    </div>
    <input ref={input} type="file" multiple accept=".ttf,.otf,font/ttf,font/otf" className="catalog-file" onChange={(event) => { font.upload([...event.target.files]); event.target.value = ''; }}/>
    {font.own && <p className="custom-hint">{t('Можно выбрать сразу несколько начертаний (Regular, SemiBold, Bold) — каждое встанет на своё место.')}</p>}
    {font.warnings.map((warning) => <Notice key={warning}>{warning}</Notice>)}
    {font.error && <Notice error>{font.error}</Notice>}
    {!dota && <Field label={t('Заменить')} hint={ROLE_HINT()}>
      <div className="custom-seg is-multi" role="group" aria-label={t('Что заменить')}>{ROLES().map(([role, label]) =>
        <button key={role} type="button" aria-pressed={font.roles[role]} onClick={() => font.setRoles((value) => ({ ...value, [role]: !value[role] }))}>{font.roles[role] && <Icon name="check"/>}{label}</button>)}</div>
    </Field>}
    {!dota && font.roles.Radiance && <label className="custom-toggle custom-font-keep"><input type="checkbox" role="switch" checked={font.keepGrid} onChange={(event) => font.setKeepGrid(event.target.checked)}/>
      <span><b>{t('Рисунки в сетке героев не съедут')}</b><small>{t('Категории сетки останутся шрифтом Dota: рисунки собраны под его ширину. Часть подписей в меню тоже останется обычной.')}</small></span></label>}
    <p className="custom-hint"><button type="button" className="catalog-link" onClick={() => font.setRestore(true)}>{t('Вернуть обычный шрифт')}</button></p>
    {font.restore && <FontRestore onClose={() => font.setRestore(false)}/>}
  </>;
}

// The font on the game's own screens: the menu and a match, split by a line that can be dragged.
export function FontScreen({ font }) {
  return <div className="custom-screen is-font" style={{ '--ratio': 16 / 9 }}>
    <Suspense fallback={<p className="custom-hint cz-loading" role="status">{t('Загружаем…')}</p>}><FontScene family={font.changed ? font.previewFamily : ''} roles={font.roles}/></Suspense>
  </div>;
}
export const fontCaption = () => rich(t('Перетащи черту между меню и матчем. В матче {tab} — таблица счёта, клик по золоту — магазин.'), { tab: <b>Tab</b> });
