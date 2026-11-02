import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, Notice } from '../catalog/Common.jsx';
import { lang, t } from '../../scripts/i18n.mjs';
import { pcCode } from '../../scripts/pc-link.mjs';
import { track } from '../site-stats.js';
import { openCommunity } from '../Community.jsx';
import { CUSTOMIZE_DIRS } from '../../scripts/customize-pack.mjs';
import { CopyField, InstallWindow, Segmented, rich, sizeText } from './ui.jsx';
import { DotaLanguage, MenuScreen, MenuThumb, MenuUnder, MenuVersion, MenuWindows } from './MenuBackground.jsx';
import { MatchScreen, MatchUnder } from './InterfaceBuilder.jsx';
import { FontScreen, fontCaption } from './FontPicker.jsx';
import { customizeRemoveCommand, CUSTOMIZE_FILE } from './customize-pack.js';
import { BY_HAND, SYSTEM, SYSTEM_NAMES } from '../system.js';
import { PortraitPreview } from './portrait-preview.js';
import { LookBar, LookNotice } from './LookBar.jsx';
import { GROUPS, MODULES, SCENES, STATE_LABELS, startSection, useCustomize } from './useCustomize.js';
import matchThumb from '../../assets/customize/match-thumb.webp';

// «Твоя Dota» (/background, 2026-10-17; the owner's «A · Сцена» of three mockups): everything about Dota
// but grids and guides on one page — the menu's backgrounds and buttons, the HUD, the chat, the cursor,
// the font and the texts — and one file for all of it (scripts/customize-pack.mjs). The preview shows a
// scene of the game (a switcher with live thumbnails above it); the sections sit in an accordion at the
// right, grouped by where they are seen, and opening one shows its scene. The foot of the panel says what
// goes into the file, with each part's size, and makes it: the file, or a PowerShell command that installs
// it. Each module keeps its state in its own hook (MenuBackground.jsx, InterfaceBuilder.jsx, FontPicker.jsx);
// the page's state and the build are shared with the constructor (useCustomize.js, src/constructor/).
export { MODULES, startSection };
export const ASPECT_ORDER = ['16:9', '16:10', '21:9', '4:3'];
const PHONE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function StateChip({ state }) {
  return <span className={`cz-state is-${state}`}>{STATE_LABELS()[state]}</span>;
}

// The scene switcher: a pill that slides to the scene shown; each scene's thumbnail is the scene as it is now.
function Scenes({ scene, onScene, thumb, dots }) {
  const box = useRef(null), [pill, setPill] = useState(null);
  useLayoutEffect(() => {
    const place = () => {
      const on = box.current?.querySelector(`[data-scene="${scene}"]`);
      setPill(on ? { left: on.offsetLeft, width: on.offsetWidth } : null);
      if (on && box.current.scrollWidth > box.current.clientWidth) box.current.scrollTo({ left: on.offsetLeft - 40, behavior: 'smooth' });
    };
    place();
    addEventListener('resize', place);
    return () => removeEventListener('resize', place);
  }, [scene, lang]);
  return <div className="cz-scenes" role="group" aria-label={t('Что показать в превью')} ref={box}>
    <span className="cz-scenes-pill" aria-hidden="true" style={pill ? { width: pill.width, transform: `translateX(${pill.left}px)` } : { opacity: 0 }}/>
    {SCENES().map(([id, title]) => <button key={id} type="button" data-scene={id} aria-pressed={scene === id} onClick={() => onScene(id)}>
      <span className="cz-thumb">{thumb(id)}{dots[id] && <i className="cz-dot" title={t('Здесь есть изменения')}/>}</span>{title}</button>)}
  </div>;
}

// «Что внутри»: each part with its size and a bar of its share (C · «Сборка»), then the files as they lie in the archive.
export function Receipt({ rows, files, total, onOpen }) {
  const biggest = Math.max(1, ...rows.map((row) => row.bytes || 0));
  return <div className="cz-receipt">
    <ul className="cz-receipt-list">{rows.map((row) => <li key={row.id} className={`is-${row.state}`}>
      <button type="button" onClick={() => onOpen(row.id)}><Icon name={row.icon}/><span className="cz-receipt-text">{row.title}<small>{row.line}</small></span>
        <span className="cz-receipt-size">{row.bytes ? sizeText(row.bytes, row.estimate) : row.note}</span>
        <i className="cz-receipt-bar" aria-hidden="true"><b style={{ width: `${row.bytes ? Math.max(2, (row.bytes / biggest) * 100) : 0}%` }}/></i></button></li>)}</ul>
    {files.length > 0 && <ul className="cz-tree" aria-label={t('Файлы в архиве')}>{files.map((file) => <li key={file.path}><Icon name={file.icon}/><code>{file.path}</code><span>{file.what} · {sizeText(file.bytes, file.estimate)}</span></li>)}</ul>}
    {total > 0 && <p className="custom-hint">{t('Размеры — как файлы лягут в игру; архив немного меньше: шрифты и тексты в нём сжаты.')}</p>}
  </div>;
}

export default function CustomizePage({ preset, studioItem, onRemove, replace, notice = null, onNotice = () => {}, openError = '' }) {
  const page = useCustomize({ preset, studioItem, onRemove, replace, notice, onNotice });
  const { MODS, find, open, setOpen, scene, setScene, menuPage, chooseScene, bg, ui, font, d2, pt, looks, undoLook, dropLook, states, summary, changed, partSize, rows, files, total, estimate,
    titles, follow, dots, touch, fields, reset, unseen, encoding, delivery, setDelivery, install, setInstall, handed, setHanded, busy, error, made, hudThumb, setHudThumb, download } = page;
  const [inside, setInside] = useState(false);
  // An old link to a section lower in the panel (?tab=font, ?page=loading…): it is scrolled to.
  useEffect(() => {
    if (open === 'bg' || !open) return undefined;
    const timer = setTimeout(() => document.querySelector(`.cz-mod[data-id="${open}"]`)?.scrollIntoView({ block: 'nearest' }), 450);
    return () => clearTimeout(timer);
  }, []);
  const openSection = (id) => {
    const next = open === id ? '' : id;
    setOpen(next);
    if (next) {
      track('customize.section', { section: next });
      setScene(find(next).scene);
      setTimeout(() => document.querySelector(`.cz-mod[data-id="${next}"]`)?.scrollIntoView({ behavior: 'smooth', block: matchMedia('(max-width: 900px)').matches ? 'start' : 'nearest' }), 380);
    }
  };
  const thumb = (id) => id === 'match' ? <span className="cz-thumb-screen"><img src={hudThumb || matchThumb} alt=""/></span> : <MenuThumb bg={bg} page={id}/>;
  const footLine = changed.length ? <><b>{changed.map((module) => module.title).join(', ')}</b>{follow ? ` · ${t('ещё {count} с фоном меню', { count: follow })}` : ''}. {t('Остальное — как в Dota.')}</>
    : follow ? t('Пока всё как в Dota.') : t('Пока всё как в Dota. Открой любой раздел справа.');
  const sizeLine = changed.length ? `${t('изменений: {count}', { count: changed.length })} · ${sizeText(total, estimate)}` : t('пока ничего не изменено');

  return <main className={`cz-work${bg.dragging ? ' is-over' : ''}`} onPointerDownCapture={touch} onKeyDownCapture={touch} onDropCapture={(event) => { touch(); dropLook(event); }}
    onDragOver={(event) => { if ([...(event.dataTransfer?.types || [])].includes('Files')) event.preventDefault(); }} onDrop={(event) => event.preventDefault()}>
    <section className="cz-stage" aria-label={t('Превью')} {...(open === 'portraits' && pt.active ? pt.drop : scene !== 'match' && scene !== 'font' ? bg.drop : {})}>
      <div className="cz-scenebar">
        <Scenes scene={scene} onScene={chooseScene} thumb={thumb} dots={dots}/>
        <div className="cz-meta">
          <button type="button" className="cz-chipbtn" title={t('Пропорции экрана для фона меню')} onClick={() => bg.setAspect(ASPECT_ORDER[(ASPECT_ORDER.indexOf(bg.aspect) + 1) % ASPECT_ORDER.length])}><Icon name="expand"/>{bg.aspect}</button>
          <span>{t('Изменено {count} из {all}', { count: changed.length, all: MODS.length })}</span>
        </div>
      </div>
      <PortraitPreview.Provider value={pt.preview}><div className="custom-stage-area cz-area">
        {scene === 'match' ? <MatchScreen ui={ui} chat={open === 'chat'} onFrame={setHudThumb} mods={d2.hudMods}/> : scene === 'font' ? <FontScreen font={font}/> : <MenuScreen bg={bg} page={menuPage} mods={d2.menuLook}/>}
      </div></PortraitPreview.Provider>
      <div className="cz-under">{scene === 'match' ? <MatchUnder ui={ui} chat={open === 'chat'}/> : scene === 'font' ? <p className="custom-caption">{fontCaption()}</p> : <MenuUnder bg={bg} page={menuPage}/>}
        {unseen.length > 0 && open !== 'chat' && <p className="custom-caption d2-under"><Icon name="help" size={13}/>{t('Моды d2pfx ({list}) в этом превью не рисуются — их картинки и видео в разделах справа.', { list: unseen.map((mod) => mod.label).join(', ') })}</p>}</div>
    </section>
    <aside className="cz-panel">
      <div className="cz-panel-body">
        <header className="cz-head"><h1>{t('Оформление Dota')}</h1>
          <p>{t('Фон, интерфейс, шрифт и тексты — на одной странице. Меняй что хочешь: превью само покажет нужный экран, а скачается всё одним файлом.')}</p>
          <LookBar looks={looks} auth={bg.auth}/>
          {openError && <Notice error>{openError}</Notice>}
          <LookNotice notice={notice} onUndo={undoLook} onClose={() => onNotice(null)}/></header>
        {GROUPS().map(([group, title]) => {
          const list = MODS.filter((module) => module.group === group), count = list.filter((module) => states[module.id] === 'changed').length;
          return <section key={group} className="cz-group">
            <div className="custom-label-row"><span className="custom-label">{title}</span><span className="custom-aside">{count ? t('изменено {count} из {all}', { count, all: list.length }) : t('как в Dota')}</span></div>
            <ul className="cz-mods">{list.map((module) => {
              const state = states[module.id], isOpen = open === module.id, size = partSize(module.id);
              return <li key={module.id} className={`cz-mod${isOpen ? ' is-open' : ''}${module.scene === scene ? ' is-scene' : ''}`} data-id={module.id} data-state={state}>
                <button type="button" className="cz-mod-head" aria-expanded={isOpen} onClick={() => openSection(module.id)}>
                  <span className="cz-mod-icon"><Icon name={module.icon}/></span>
                  <span className="cz-mod-text"><b>{module.title}</b><small>{state === 'default' ? module.text : summary[module.id] || module.text}</small></span>
                  <StateChip state={state}/><Icon name="chevron" className="cz-mod-chev"/>
                </button>
                <div className="cz-mod-body"><div>{isOpen && <div className="cz-mod-fields">{fields[module.id]}
                  <div className="cz-mod-foot"><span>{state === 'changed' ? `${t('В сборке')} · ${size?.bytes ? sizeText(size.bytes, size.estimate) : module.id === 'chat' ? t('в HUD') : t('считаем…')}`
                    : state === 'follow' ? t('Собирается вместе с фоном меню') : t('Не меняется — Dota как есть')}</span>
                    {state === 'changed' && <button type="button" className="catalog-link" onClick={() => reset(module.id)}>{t('Сбросить')}</button>}</div>
                </div>}</div></div>
              </li>;
            })}</ul>
          </section>;
        })}
        <p className="custom-hint cz-next">{t('Что сделать следующим?')} <button type="button" className="catalog-link" onClick={() => openCommunity()}>{t('Напиши в чат GridStudio')}</button></p>
      </div>
      <footer className={`cz-build${inside ? ' is-inside' : ''}`}>
        <div className="cz-build-head"><b>{t('Одним файлом')}</b><span>{sizeLine}</span></div>
        <div className="cz-slots">{MODS.map((module) => <button key={module.id} type="button" className={`is-${states[module.id]}`} data-tip={`${module.title}: ${states[module.id] === 'default' ? t('как в Dota') : summary[module.id] || STATE_LABELS()[states[module.id]]}`}
          aria-label={`${module.title}: ${STATE_LABELS()[states[module.id]]}`} onClick={() => openSection(module.id)}><Icon name={module.icon}/></button>)}</div>
        <p className="cz-line">{footLine}</p>
        {inside && <Receipt rows={rows} files={files} total={total} onOpen={(id) => { if (open !== id) openSection(id); }}/>}
        {error && <Notice error report>{error}</Notice>}
        {BY_HAND ? <p className="cz-os-note">{t('Команда PowerShell — только для Windows. На {system} ставь файлом: «Как установить» ниже.', { system: SYSTEM_NAMES[SYSTEM] })}</p>
          : <Segmented label={t('Как поставить')} value={delivery} onChange={(value) => { setDelivery(value); setHanded(null); }} options={[['command', t('Командой PowerShell')], ['file', t('Только файл')]]}/>}
        {busy || encoding ? <div className="custom-progress" role="status"><span style={{ width: `${Math.round((encoding ? bg.progress : busy.progress ?? 0.15) * 100)}%` }}/>
          <b>{encoding ? t('Собираем видео… {percent}%', { percent: Math.round(bg.progress * 100) }) : busy.label}</b>
          {encoding && <button type="button" className="catalog-icon" aria-label={t('Отменить')} onClick={bg.cancel}><Icon name="close"/></button>}</div>
          : <button type="button" className="catalog-button primary cz-download" disabled={!titles.length || !!bg.fetching} onClick={download}>
            <Icon name={delivery === 'command' ? 'terminal' : 'download'}/>{delivery === 'command' ? t('Собрать и получить команду') : t('Скачать всё одним файлом')}</button>}
        <div className="custom-foot-row"><button type="button" className="catalog-link" aria-expanded={inside} onClick={() => { if (!inside) track('customize.inside'); setInside(!inside); }}>{t('Что внутри')}<Icon name={inside ? 'chevron' : 'chevronUp'} size={14}/></button>
          <button type="button" className="catalog-link" onClick={() => { track('customize.install-help'); setInstall(true); }}>{t('Как установить')}</button></div>
      </footer>
    </aside>
    {PHONE && <div className="cz-phone-bar"><div><b>{changed.length ? sizeLine : t('Пока всё как в Dota')}</b>{changed.map((module) => module.title).join(', ') || t('Всё собирается на компьютере')}</div>
      <a className="catalog-button primary" href={`/api/catalog/pc/${pcCode(location)}`} target="_blank" rel="noopener" onClick={() => track('pc.send', { from: 'customize' })}><Icon name="telegram"/>{t('Прислать на ПК')}</a></div>}
    <MenuWindows bg={bg}/>
    {install && <Install delivery={delivery} handed={delivery === 'command' ? handed : null} made={made} bg={bg} onClose={() => setInstall(false)}/>}
  </main>;
}

// How to install the one file: the command (it was just made for this file), or by hand.
export function Install({ delivery, handed, made, bg, onClose }) {
  const [way, setWay] = useState(BY_HAND ? 'file' : delivery);
  const fonts = made ? made.entries.some((entry) => entry.name.startsWith(CUSTOMIZE_DIRS.fonts)) : true;
  return <InstallWindow title={t('Как установить')} onClose={onClose}>
    <p className="catalog-muted cz-install-lead">{t('Одна сборка — фон, интерфейс и шрифт сразу.')}{made ? ` ${t('Файл: {name}, {size}.', { name: CUSTOMIZE_FILE, size: sizeText(made.size) })}` : ''}</p>
    {BY_HAND ? <p className="cz-os-note">{t('У тебя {system}: команда PowerShell работает только в Windows, поэтому ставь вручную.', { system: SYSTEM_NAMES[SYSTEM] })}</p>
      : <Segmented label={t('Как поставить')} value={way} onChange={setWay} options={[['command', t('Командой PowerShell')], ['file', t('Вручную')]]}/>}
    {way === 'command' ? <ol>
      <li>{handed ? t('Сборка сохранена на GridStudio на 7 дней — команда скачает именно её, ничего искать не нужно.') : t('Выбери «Командой PowerShell» и нажми «Собрать и получить команду»: сборка отправится на GridStudio на 7 дней, а здесь появится команда именно для неё.')}</li>
      {handed && <li>{t('Скопируй команду:')}<CopyField value={handed.command} onCopy={() => track('customize.command-copy', { pack: packOf(handed.command) })}/></li>}
      <li>{rich(t('Открой PowerShell ({key}, набери PowerShell, {enter}), вставь команду и нажми {enter}.'), { key: <kbd>Win</kbd>, enter: <kbd>Enter</kbd> })}</li>
      <li>{t('Она сама найдёт Dota через Steam, попросит закрыть игру, сохранит файлы Dota, положит фон и интерфейс в dota_russian, шрифт — в panorama\\fonts, и включит русскую озвучку. То, чего больше нет в сборке, она уберёт. Запусти Dota.')}</li>
    </ol> : <ol>
      <li>{t('Закрой Dota 2.')}</li>
      <li>{rich(t('В Steam: Dota 2 → «Свойства» → «Установленные файлы» → «Обзор». Откроется папка {folder}.'), { folder: <code>dota 2 beta</code> })}</li>
      {fonts && <li>{rich(t('На всякий случай скопируй куда-нибудь папку {folder}: шрифт из сборки заменит шрифты Dota.'), { folder: <code>game\dota\panorama\fonts</code> })}</li>}
      <li>{rich(t('Распакуй архив и скопируй его папку {game} в {folder} {replace}.'), { game: <code>game</code>, folder: <code>dota 2 beta</code>, replace: <b>{t('с заменой')}</b> })}</li>
      {fonts && !BY_HAND && <li>{rich(t('Если есть папка {folder}, удали её: там старый кэш шрифтов.'), { folder: <CopyField value="%TEMP%\fontconfig"/> })}</li>}
      <li>{t('В настройках Dota поставь русский язык озвучки: моды Dota читает только из папки dota_russian. Интерфейс можно оставить английским. Если в параметрах запуска Dota есть -language (кроме -language russian), убери его.')}</li>
      <li>{t('Запусти Dota 2.')}</li>
    </ol>}
    <DotaLanguage bg={bg}/>
    {!BY_HAND && <><p className="catalog-muted">{t('Вернуть всё как было — вставь в PowerShell:')}</p><CopyField value={handed?.remove || customizeRemoveCommand()}/></>}
    <p className="catalog-muted">{t('Или в Steam: «Проверить целостность файлов игры» вернёт шрифты; файлы в dota_russian удали сам.')}</p>
    <MenuVersion/>
  </InstallWindow>;
}
