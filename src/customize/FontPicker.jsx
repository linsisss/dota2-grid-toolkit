import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Notice } from '../catalog/Common.jsx';
import catalog from '../../data/dota-fonts.json';
import { dotaFontPack, fontCoverage, readFont } from '../../scripts/dota-font.mjs';
import { buildZip } from '../../scripts/zip.mjs';
import { fontInstaller } from '../../scripts/installer.mjs';
import { DELIVERY, InstallerSteps } from './MenuBackground.jsx';
import { CopyField, Field, InstallWindow, Segmented } from './CustomizeApp.jsx';

// The Dota font: a catalog font (assets/dota-fonts, data/dota-fonts.json) or the user's own
// .ttf/.otf becomes Valve's font files (scripts/dota-font.mjs), zipped in the browser. Nothing is
// uploaded. The preview draws game text the way Panorama styles it.
const ROLES = [['Radiance', 'Текст'], ['Reaver', 'Заголовки'], ['RadianceM', 'Цифры']];
const ROLE_HINT = 'Текст — чат, подсказки и категории сетки героев. Заголовки — верхнее меню и имена героев. Цифры — таймер и счёт.';
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
const README = (name, license, installer) => `Шрифт для Dota 2 от GridStudio: ${name}.
${license}
${installer ? '\nПроще всего: запусти «Установить шрифт.bat» (Windows сам найдёт Dota 2). Вернуть шрифты Dota — «Удалить шрифт.bat».\n' : ''}
Установка вручную:
1. Закрой Dota 2.
2. В Steam: Dota 2 -> «Свойства» -> «Установленные файлы» -> «Обзор».
3. Открой game\\dota\\panorama\\fonts. На всякий случай скопируй эту папку fonts куда-нибудь.
4. Скопируй туда все файлы из папки fonts этого архива С ЗАМЕНОЙ. Удалять ничего не нужно.
5. Если есть папка %TEMP%\\fontconfig (вставь %TEMP% в адресную строку проводника), удали её.
6. Запусти Dota 2.

Вернуть как было: Steam -> Dota 2 -> «Свойства» -> «Установленные файлы» -> «Проверить целостность файлов игры».
После больших обновлений Steam может вернуть шрифты Dota: тогда скопируй файлы ещё раз.
`.replace(/\n/g, '\r\n');

function FontChip({ font, selected, onSelect }) {
  const face = nearest(font.files, 400), family = `GSFont-${font.id}`, [ready, setReady] = useState(false);
  useEffect(() => { previewFace(family, fontURL(font.id, face.file), face.weight).then(setReady); }, [font.id]);
  return <button type="button" role="radio" aria-checked={selected} onClick={onSelect} title={`${font.family} — ${font.style.toLowerCase()}`}>
    <span style={{ fontFamily: ready ? `'${family}'` : undefined, fontWeight: face.weight, opacity: ready ? 1 : 0.4 }}>{font.family}</span></button>;
}

function GamePreview({ family, roles, text }) {
  const font = (role) => roles[role] && family ? `'${family}', 'StudioRadiance'` : "'StudioRadiance'";
  const heroes = [[1, 2, 7, 14, 18], [8, 11, 6, 44, 67], [5, 22, 25, 74, 86], [120, 135, 136, 137, 53]];
  const names = ['СИЛА', 'ЛОВКОСТЬ', 'ИНТЕЛЛЕКТ', 'УНИВЕРСАЛЫ'];
  return <div className="custom-game" aria-label="Превью шрифта в игре">
    <div className="custom-game-bar" style={{ fontFamily: font('Reaver') }}><b>ГЕРОИ</b><b>АРСЕНАЛ</b><b>МАГАЗИН</b><b>ОБУЧЕНИЕ</b><span style={{ fontFamily: font('RadianceM') }}>23:41</span></div>
    <div className="custom-game-grid">
      {text && <div className="custom-game-category is-own" style={{ fontFamily: font('Radiance') }}><span>{text}</span></div>}
      {names.map((name, index) => <div key={name} className="custom-game-category" style={{ fontFamily: font('Radiance') }}><span>{name}</span>
        <div>{heroes[index].map((id) => <img key={id} src={`./assets/portraits/${id}.webp`} alt="" loading="lazy"/>)}</div></div>)}
    </div>
    <div className="custom-game-chat" style={{ fontFamily: font('Radiance') }}>
      <p><i>[Всем]</i> <b>Пользователь:</b> gg wp, изи катка</p><p><i>[Союзникам]</i> <b>Мипо:</b> рошан через 2 минуты</p>
      <p className="custom-game-score" style={{ fontFamily: font('RadianceM') }}>12 / 3 / 7 · 412 GPM</p>
    </div>
  </div>;
}

function Install({ delivery, onClose }) {
  if (delivery === 'installer') return <InstallWindow title="Как установить шрифт" onClose={onClose}><InstallerSteps what="шрифт" run="Установить шрифт.bat" remove="Удалить шрифт.bat"/></InstallWindow>;
  return <InstallWindow title="Как установить шрифт" onClose={onClose}><ol>
    <li>Закрой Dota 2.</li>
    <li>В Steam: Dota 2 → «Свойства» → «Установленные файлы» → «Обзор».</li>
    <li>Открой <code>game\dota\panorama\fonts</code> и на всякий случай скопируй эту папку куда-нибудь.</li>
    <li>Распакуй архив и скопируй файлы из его папки <code>fonts</code> туда <b>с заменой</b>. Удалять ничего не нужно.</li>
    <li>Если есть папка <CopyField value="%TEMP%\fontconfig"/>, удали её: там старый кэш шрифтов.</li>
    <li>Запусти Dota 2.</li>
  </ol><p className="catalog-muted">Вернуть шрифт Dota: Steam → Dota 2 → «Свойства» → «Установленные файлы» → «Проверить целостность файлов игры». После больших обновлений Steam иногда сам возвращает шрифты: тогда скопируй файлы ещё раз.</p></InstallWindow>;
}

export default function FontPicker() {
  const [selected, setSelected] = useState(catalog.fonts[0].id), [own, setOwn] = useState(null);
  const [roles, setRoles] = useState({ Radiance: true, Reaver: true, RadianceM: true }), [text, setText] = useState('');
  const [delivery, setDelivery] = useState('file'), [previewFamily, setPreviewFamily] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [install, setInstall] = useState(false);
  const input = useRef(null), shownGuide = useRef(false);
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
    return [cyrillic.size && `Нет русских букв: ${[...cyrillic].slice(0, 12).join(' ')}${cyrillic.size > 12 ? '…' : ''}. Их Dota возьмёт из другого шрифта.`,
      latin.size && `Нет латинских букв или цифр: ${[...latin].slice(0, 12).join(' ')}.`].filter(Boolean);
  }, [own]);

  async function upload(files) {
    setError('');
    try {
      const faces = [];
      for (const file of files) {
        if (file.size > 30_000_000) throw new Error(`${file.name}: файл больше 30 МБ.`);
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
      const families = ROLES.map(([role]) => role).filter((role) => roles[role]);
      let fonts, license, name, slug;
      if (own) {
        fonts = own.faces.map((face) => face.font); name = own.name; slug = 'own';
        license = 'Свой шрифт: убедись, что его лицензия разрешает такое использование.';
      } else {
        fonts = await Promise.all(chosen.files.map(async (file) => {
          const response = await fetch(fontURL(chosen.id, file.file));
          if (!response.ok) throw new Error('Не удалось загрузить шрифт. Обнови страницу.');
          return readFont(new Uint8Array(await response.arrayBuffer()));
        }));
        name = chosen.family; slug = chosen.id;
        license = `${chosen.license}, текст лицензии — OFL.txt. Шрифт можно свободно использовать; продавать его нельзя.`;
      }
      const files = dotaFontPack(fonts, families).map((file) => ({ name: `fonts/${file.name}`, data: file.data }));
      if (!own) files.push({ name: 'OFL.txt', data: await (await fetch(fontURL(chosen.id, 'OFL.txt'))).text() });
      if (delivery === 'installer') files.push(...fontInstaller());
      files.push({ name: 'ПРОЧТИ.txt', data: new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README(name, license, delivery === 'installer'))]) });
      const zip = await buildZip(files), url = URL.createObjectURL(zip), link = document.createElement('a');
      link.href = url; link.download = `gridstudio-font-${slug}.zip`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (!shownGuide.current) { shownGuide.current = true; setInstall(true); }
    } catch (e) { setError(e.message || 'Не удалось собрать шрифт.'); }
    finally { setBusy(false); }
  }
  const noRole = !Object.values(roles).some(Boolean);
  return <main className="custom-work">
    <section className="custom-stage" aria-label="Превью шрифта">
      <div className="custom-stage-area"><div className="custom-screen" style={{ '--ratio': 16 / 9 }}><GamePreview family={previewFamily} roles={roles} text={text.trim().toUpperCase().slice(0, 40)}/></div></div>
      <div className="custom-caption custom-try"><input value={text} maxLength={40} aria-label="Свой текст для превью" placeholder="Напиши название своей категории" onChange={(event) => setText(event.target.value)}/>
        <span>Категории — как в сетке героев: полужирный, 16 px, заглавные. Меню, чат и цифры — схематично.</span></div>
    </section>
    <aside className="custom-panel">
      <div className="custom-panel-body">
        <header className="custom-panel-head"><h1>Шрифт Dota</h1><p>Любой шрифт с кириллицей в чате, меню и сетке героев. Архив собирается в браузере.</p></header>
        <Field label="Шрифт">
          <div className="custom-fonts" role="radiogroup" aria-label="Шрифт">{catalog.fonts.map((font) =>
            <FontChip key={font.id} font={font} selected={!own && selected === font.id} onSelect={() => { setOwn(null); setSelected(font.id); }}/>)}
            <button type="button" role="radio" aria-checked={!!own} className="custom-font-own" onClick={() => input.current?.click()}><Icon name="plus"/>{own ? `Свой: ${own.name}` : 'Свой шрифт .ttf / .otf'}</button>
          </div>
          <input ref={input} type="file" multiple accept=".ttf,.otf,font/ttf,font/otf" className="catalog-file" onChange={(event) => { upload([...event.target.files]); event.target.value = ''; }}/>
          {own && <p className="custom-hint">Можно выбрать сразу несколько начертаний (Regular, SemiBold, Bold) — каждое встанет на своё место.</p>}
          {warnings.map((warning) => <Notice key={warning}>{warning}</Notice>)}
        </Field>
        <Field label="Заменить" hint={ROLE_HINT}>
          <div className="custom-seg is-multi" role="group" aria-label="Что заменить">{ROLES.map(([role, label]) =>
            <button key={role} type="button" aria-pressed={roles[role]} onClick={() => setRoles((value) => ({ ...value, [role]: !value[role] }))}>{roles[role] && <Icon name="check"/>}{label}</button>)}</div>
        </Field>
      </div>
      <footer className="custom-panel-foot">
        {error && <Notice error>{error}</Notice>}
        <Segmented label="Что скачать" value={delivery} onChange={setDelivery} options={DELIVERY}/>
        <button className="catalog-button primary" disabled={busy || noRole || (!own && !chosen)} onClick={download}><Icon name="download"/>{busy ? 'Собираем…' : 'Скачать шрифт для Dota'}</button>
        <div className="custom-foot-row"><span className="catalog-muted">{own ? own.name : chosen?.family} · {own ? 'свой шрифт' : chosen?.license.replace('SIL Open Font License 1.1', 'бесплатный, OFL')}</span>
          <button type="button" className="catalog-link" onClick={() => setInstall(true)}>Как установить</button></div>
      </footer>
    </aside>
    {install && <Install delivery={delivery} onClose={() => setInstall(false)}/>}
  </main>;
}
