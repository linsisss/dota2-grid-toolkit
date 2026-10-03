import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Modal, Notice } from '../catalog/Common.jsx';
import catalog from '../../data/dota-fonts.json';
import { dotaFontPack, fontCoverage, readFont } from '../../scripts/dota-font.mjs';
import { buildZip } from '../../scripts/zip.mjs';
import { installCommand } from '../../scripts/installer.mjs';
import { uploadInstallPack } from '../install-pack.js';
import { lang, t } from '../../scripts/i18n.mjs';
import { DELIVERY } from './MenuBackground.jsx';
import { CopyField, Field, InstallWindow, Segmented, rich } from './CustomizeApp.jsx';
import FontScene from './FontScene.jsx';
import { countAction } from '../site-stats.js';

// The Dota font: a catalog font (assets/dota-fonts, data/dota-fonts.json) or the user's own
// .ttf/.otf becomes Valve's font files (scripts/dota-font.mjs), zipped in the browser. Nothing is
// uploaded: «Командой PowerShell» saves the zip under a name with its SHA-256 and gives a command whose
// address carries the SHA-256 and size (scripts/installer.mjs fontScript). The preview (FontScene.jsx)
// puts the font on the game's own screens.
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
const removeCommand = () => installCommand(`${location.origin}/api/catalog/install/font-remove${lang === 'en' ? '-en' : ''}`);
// The archive's read-me (ПРОЧТИ.txt / README.txt), in the site's language; Windows line ends.
const README = (name, license, command) => [t('Шрифт для Dota 2 от GridStudio: {name}.', { name }), license, '',
  ...(command ? [t('Проще всего: вставь в PowerShell команду с сайта — она сама найдёт этот архив и Dota. Вернуть шрифты Dota — вставь в PowerShell:'), removeCommand(), ''] : []),
  t('Установка вручную:'),
  t('1. Закрой Dota 2.'),
  t('2. В Steam: Dota 2 -> «Свойства» -> «Установленные файлы» -> «Обзор».'),
  t('3. Открой game\\dota\\panorama\\fonts. На всякий случай скопируй эту папку fonts куда-нибудь.'),
  t('4. Скопируй туда все файлы из папки fonts этого архива С ЗАМЕНОЙ. Удалять ничего не нужно.'),
  t('5. Если есть папка %TEMP%\\fontconfig (вставь %TEMP% в адресную строку проводника), удали её.'),
  t('6. Запусти Dota 2.'), '',
  t('Вернуть как было: Steam -> Dota 2 -> «Свойства» -> «Установленные файлы» -> «Проверить целостность файлов игры».'),
  t('После больших обновлений Steam может вернуть шрифты Dota: тогда скопируй файлы ещё раз.'), ''].join('\r\n');
function saveFile(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FontChip({ font, selected, onSelect }) {
  const face = nearest(font.files, 400), family = `GSFont-${font.id}`, [ready, setReady] = useState(false);
  useEffect(() => { previewFace(family, fontURL(font.id, face.file), face.weight).then(setReady); }, [font.id]);
  return <button type="button" role="radio" aria-checked={selected} onClick={onSelect} title={`${font.family} — ${t(font.style).toLowerCase()}`}>
    <span style={{ fontFamily: ready ? `'${family}'` : undefined, fontWeight: face.weight, opacity: ready ? 1 : 0.4 }}>{font.family}</span></button>;
}

// The command of the archive just sent to the site (its fingerprint is in it); before that, a word on it.
function Install({ delivery, handed, onClose }) {
  if (delivery === 'command') return <InstallWindow title={t('Как установить шрифт')} onClose={onClose}><ol>
    <li>{handed ? t('Шрифт сохранён на GridStudio на 7 дней — команда скачает именно его, ничего искать не нужно.') : t('Нажми «Получить команду»: шрифт отправится на GridStudio, а здесь появится команда для него.')}</li>
    {handed && <li>{t('Скопируй команду:')}<CopyField value={handed.command}/></li>}
    <li>{rich(t('Открой PowerShell ({key}, набери PowerShell, {enter}), вставь команду и нажми {enter}.'), { key: <kbd>Win</kbd>, enter: <kbd>Enter</kbd> })}</li>
    <li>{t('Она сама скачает этот шрифт, найдёт Dota через Steam, попросит закрыть игру, сохранит шрифты Dota и положит новые.')}</li>
    <li>{t('Запусти Dota 2.')}</li>
  </ol><p className="catalog-muted">{t('Вернуть шрифты Dota — вставь в PowerShell:')}</p><CopyField value={handed?.remove || removeCommand()}/></InstallWindow>;
  return <InstallWindow title={t('Как установить шрифт')} onClose={onClose}><ol>
    <li>{t('Закрой Dota 2.')}</li>
    <li>{t('В Steam: Dota 2 → «Свойства» → «Установленные файлы» → «Обзор».')}</li>
    <li>{rich(t('Открой {folder} и на всякий случай скопируй эту папку куда-нибудь.'), { folder: <code>game\dota\panorama\fonts</code> })}</li>
    <li>{rich(t('Распакуй архив и скопируй файлы из его папки {fonts} туда {replace}. Удалять ничего не нужно.'), { fonts: <code>fonts</code>, replace: <b>{t('с заменой')}</b> })}</li>
    <li>{rich(t('Если есть папка {folder}, удали её: там старый кэш шрифтов.'), { folder: <CopyField value="%TEMP%\fontconfig"/> })}</li>
    <li>{t('Запусти Dota 2.')}</li>
  </ol><p className="catalog-muted">{t('Вернуть шрифт Dota: Steam → Dota 2 → «Свойства» → «Установленные файлы» → «Проверить целостность файлов игры». После больших обновлений Steam иногда сам возвращает шрифты: тогда скопируй файлы ещё раз.')}</p></InstallWindow>;
}

// Back to Dota's own fonts, two ways: the command puts back the copy its install kept
// (scripts/installer.mjs fontRemoveScript); by hand, Steam's file check brings back Valve's files.
function Restore({ onClose }) {
  return <Modal title={t('Вернуть обычный шрифт')} icon="undo" onClose={onClose} size="md"><div className="custom-install custom-restore">
    <section><h3>{t('Командой PowerShell')}</h3>
      <p>{t('Если шрифт ставился командой: она сохранила шрифты Dota и вернёт их.')}</p>
      <CopyField value={removeCommand()}/>
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

export default function FontPicker() {
  const [selected, setSelected] = useState(catalog.fonts[0].id), [own, setOwn] = useState(null);
  const [roles, setRoles] = useState({ Radiance: true, Reaver: true, RadianceM: true });
  const [delivery, setDelivery] = useState('file'), [previewFamily, setPreviewFamily] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [install, setInstall] = useState(false), [sending, setSending] = useState(null);
  const [handed, setHanded] = useState(null), [restore, setRestore] = useState(false);
  const input = useRef(null);
  const chosen = own ? null : catalog.fonts.find((font) => font.id === selected);
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
  async function download() {
    setBusy(true); setError('');
    try {
      const families = ROLES().map(([role]) => role).filter((role) => roles[role]);
      let fonts, license, name, slug;
      if (own) {
        fonts = own.faces.map((face) => face.font); name = own.name; slug = 'own';
        license = t('Свой шрифт: убедись, что его лицензия разрешает такое использование.');
      } else {
        fonts = await Promise.all(chosen.files.map(async (file) => {
          const response = await fetch(fontURL(chosen.id, file.file));
          if (!response.ok) throw new Error(t('Не удалось загрузить шрифт. Обнови страницу.'));
          return readFont(new Uint8Array(await response.arrayBuffer()));
        }));
        name = chosen.family; slug = chosen.id;
        license = t('{license}, текст лицензии — OFL.txt. Шрифт можно свободно использовать; продавать его нельзя.', { license: chosen.license });
      }
      const files = dotaFontPack(fonts, families).map((file) => ({ name: `fonts/${file.name}`, data: file.data }));
      if (!own) files.push({ name: 'OFL.txt', data: await (await fetch(fontURL(chosen.id, 'OFL.txt'))).text() });
      files.push({ name: t('ПРОЧТИ.txt'), data: new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README(name, license, delivery === 'command'))]) });
      const zip = await buildZip(files);
      if (delivery === 'command') {
        // Sent to the site; the command downloads exactly this archive (src/install-pack.js).
        try { setHanded({ command: await uploadInstallPack('font', new Uint8Array(await zip.arrayBuffer()), setSending), remove: removeCommand() }); }
        finally { setSending(null); }
      } else saveFile(zip, `gridstudio-font-${slug}.zip`);
      countAction('font-pack');
      // The install window after every download: the command, or the steps by hand.
      setInstall(true);
    } catch (e) { setError(e.message || t('Не удалось собрать шрифт.')); }
    finally { setBusy(false); }
  }
  const noRole = !Object.values(roles).some(Boolean);
  return <main className="custom-work">
    <section className="custom-stage" aria-label={t('Превью шрифта')}>
      <div className="custom-stage-area"><div className="custom-screen" style={{ '--ratio': 16 / 9 }}><FontScene family={previewFamily} roles={roles}/></div></div>
      <p className="custom-caption">{rich(t('Перетащи черту между меню и матчем. В матче {tab} — таблица счёта, клик по золоту — магазин.'), { tab: <b>Tab</b> })}</p>
    </section>
    <aside className="custom-panel">
      <div className="custom-panel-body">
        <header className="custom-panel-head"><h1>{t('Шрифт Dota')}</h1><p>{t('Любой шрифт с кириллицей в чате, меню и сетке героев. Архив собирается в браузере.')}</p></header>
        <Field label={t('Шрифт')}>
          <div className="custom-fonts" role="radiogroup" aria-label={t('Шрифт')}>{catalog.fonts.map((font) =>
            <FontChip key={font.id} font={font} selected={!own && selected === font.id} onSelect={() => { setOwn(null); setSelected(font.id); }}/>)}
            <button type="button" role="radio" aria-checked={!!own} className="custom-font-own" onClick={() => input.current?.click()}><Icon name="plus"/>{own ? t('Свой: {name}', { name: own.name }) : t('Свой шрифт .ttf / .otf')}</button>
          </div>
          <input ref={input} type="file" multiple accept=".ttf,.otf,font/ttf,font/otf" className="catalog-file" onChange={(event) => { upload([...event.target.files]); event.target.value = ''; }}/>
          {own && <p className="custom-hint">{t('Можно выбрать сразу несколько начертаний (Regular, SemiBold, Bold) — каждое встанет на своё место.')}</p>}
          {warnings.map((warning) => <Notice key={warning}>{warning}</Notice>)}
        </Field>
        <Field label={t('Заменить')} hint={ROLE_HINT()}>
          <div className="custom-seg is-multi" role="group" aria-label={t('Что заменить')}>{ROLES().map(([role, label]) =>
            <button key={role} type="button" aria-pressed={roles[role]} onClick={() => setRoles((value) => ({ ...value, [role]: !value[role] }))}>{roles[role] && <Icon name="check"/>}{label}</button>)}</div>
        </Field>
      </div>
      <footer className="custom-panel-foot">
        {error && <Notice error>{error}</Notice>}
        <Segmented label={t('Что скачать')} value={delivery} onChange={(value) => { setDelivery(value); setHanded(null); }} options={DELIVERY()}/>
        <button className="catalog-button primary" disabled={busy || noRole || (!own && !chosen)} onClick={download}><Icon name={delivery === 'command' ? 'terminal' : 'download'}/>
          {sending !== null ? t('Отправляем на GridStudio… {percent}%', { percent: Math.round(sending * 100) }) : busy ? t('Собираем…') : delivery === 'command' ? t('Получить команду') : t('Скачать шрифт для Dota')}</button>
        <div className="custom-foot-row"><button type="button" className="catalog-link" onClick={() => setRestore(true)}>{t('Вернуть обычный шрифт')}</button>
          <button type="button" className="catalog-link" onClick={() => setInstall(true)}>{t('Как установить')}</button></div>
      </footer>
    </aside>
    {install && <Install delivery={delivery} handed={delivery === 'command' ? handed : null} onClose={() => setInstall(false)}/>}
    {restore && <Restore onClose={() => setRestore(false)}/>}
  </main>;
}
