import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../catalog/Common.jsx';
import { lang, t } from '../../scripts/i18n.mjs';
import { D2PFX_SECTIONS, D2PFX_SECTION_IDS, cleanChoice, d2pfxPlan } from '../../scripts/d2pfx-mods.mjs';
import { catalog, d2pfxPack } from './d2pfx-pack.js';
import { D2pfxAbout, D2pfxNote, FixNote, PackCredits, creditLine, creditLines } from './d2pfx-ui.jsx';
import { Field, rich, sizeText } from './ui.jsx';
import { skinRender, skinThumb } from './d2pfx-hud.js';
import { track } from '../site-stats.js';

// The d2pfx sections of «Твоя Dota» (2026-10-17, the owner's list): «HUD-скин», «Детали HUD», «Клик»,
// «Пинги», «Денай» in the match, «Детали меню» in the menu, «Иконка голоса» everywhere. Each is a gallery
// of d2pfx's mods with d2pfx's own picture (and video), name and credit; a choice per slot, or Dota's. All
// chosen mods go into one pak04_dir.vpk of the one file (d2pfx-pack.js, scripts/d2pfx-mods.mjs); two
// choices that replace the same file are named at both, with the one that goes in.
const D2pfxClick = lazy(() => import('./D2pfxClick.jsx'));
const ClickThumb = lazy(() => import('./D2pfxClick.jsx').then((module) => ({ default: module.ClickThumb })));
export const D2PFX_MODULES = D2PFX_SECTION_IDS;
const SLOT_TITLES = () => ({ skin: t('Скин'), click: t('Цвет клика'), ping: t('Пинг'), deny: t('Денай'), voice: t('Иконка'),
  minimap: t('Миникарта: цвет'), minimapSize: t('Миникарта: размер'), timer: t('Таймер'), scoreboard: t('Таблица счёта и магазин'),
  topbar: t('Верхняя панель'), playbutton: t('Кнопка «Играть»'), playbg: t('Фон панели поиска игры'), modes: t('Карточки режимов') });
export const SECTION_TITLES = () => ({ hudskin: t('HUD-скин'), hudparts: t('Детали HUD'), click: t('Клик'), pings: t('Пинги'), deny: t('Денай'), menuparts: t('Детали меню'), voice: t('Иконка голоса') });
const NOTES = () => ({
  hudskin: t('HUD-скины взяты с {site}. Все работы принадлежат их авторам — автор указан у каждого скина.'),
  hudparts: t('Детали HUD взяты с {site}. Все работы принадлежат их авторам — автор указан у каждой.'),
  menuparts: t('Детали меню взяты с {site}. Все работы принадлежат их авторам — автор указан у каждой.'),
  click: t('Клики взяты с {site}. Все работы принадлежат их авторам — автор указан у каждого.'),
  pings: t('Пинги взяты с {site}. Все работы принадлежат их авторам — автор указан у каждого.'),
  deny: t('Денаи взяты с {site}. Все работы принадлежат их авторам — автор указан у каждого.'),
  voice: t('Иконка взята с {site}. Все работы принадлежат их авторам.')
});
const HINTS = () => ({
  hudskin: t('Скин рисуется прямо в превью матча: эмулятор Panorama раскладывает HUD с файлами Valve и с файлами скина, и разница ложится на снятый HUD Dota — портрет, иконки и цифры остаются игровыми. «Вид HUD» (подложки, оттенок, размер) работает и поверх скина.'),
  hudparts: t('Миникарта, таймер, таблица счёта и магазин — по отдельности, поверх HUD-скина или без него.'),
  menuparts: t('Верхняя панель, фон панели поиска игры, кнопка «Играть» и карточки режимов в главном меню.'),
  click: t('Правый клик по земле в превью матча — тот же клик: частицы мода разобраны из его файлов и играют здесь так, как их считает Dota.'),
  pings: t('Значок и вспышка, когда отмечаешь место на карте (Alt + клик).'),
  deny: t('Знак над своим крипом, когда добиваешь его (денай).'),
  voice: t('Значок у того, кто говорит в голосовом чате.')
});
const quote = (text) => (lang === 'en' ? `“${text}”` : `«${text}»`);
const labelOf = (mod) => (mod.style ? `${mod.name} ${mod.style}` : mod.name);
for (const mod of Object.values(catalog.mods)) mod.label = labelOf(mod);
const slotMods = (section, slot) => Object.values(catalog.mods).filter((mod) => mod.section === section && mod.slot === slot);

// The click mods' decompiled particles (scripts/make-d2pfx-click.mjs) and their own textures.
const clickFx = import.meta.glob('../../assets/d2pfx-click/*/fx.json', { import: 'default' });
const clickPng = import.meta.glob('../../assets/d2pfx-click/*/*.png', { import: 'default', eager: true });
async function clickSkin(id) {
  const load = id && Object.entries(clickFx).find(([path]) => path.includes(`/${id}/`))?.[1];
  if (!load) return null;
  const fx = await load();
  const images = Object.fromEntries(fx.textures.map((name) => [name, Object.entries(clickPng).find(([path]) => path.endsWith(`/${id}/${name}.png`))?.[1]]));
  return { systems: fx.systems, images };
}

// Kept in this browser: the choice per section and slot (cleaned against the list, so a mod gone from d2pfx drops out).
const SAVED = 'gridstudio.d2pfx';
const readSaved = () => { try { return cleanChoice(JSON.parse(localStorage.getItem(SAVED) || '{}').choice, catalog); } catch { return {}; } };

export function useD2pfx() {
  const [choice, setChoice] = useState(readSaved), [clickKey, setClickKey] = useState('');
  useEffect(() => { try { localStorage.setItem(SAVED, JSON.stringify({ choice, commit: catalog.commit })); } catch { /* This visit only. */ } }, [choice]);
  const plan = useMemo(() => d2pfxPlan(choice, catalog), [choice]);
  // The chosen click plays in the match preview (and in «Клик»'s scene).
  const clickId = choice.click?.click || '';
  useEffect(() => {
    let gone = false;
    Promise.all([clickSkin(clickId), import('./DotaCursor.jsx')]).then(([skin, cursor]) => { if (gone) return; cursor.setClickSkin(skin); setClickKey(clickId || 'valve'); }).catch(() => {});
    return () => { gone = true; };
  }, [clickId]);
  const picksOf = (section) => plan.picks.filter((mod) => mod.section === section);
  const states = Object.fromEntries(D2PFX_SECTION_IDS.map((id) => [id, picksOf(id).length ? 'changed' : 'default']));
  const summary = Object.fromEntries(D2PFX_SECTION_IDS.map((id) => {
    const picks = picksOf(id);
    const line = picks.length === 1 ? `${picks[0].label} · ${creditLine(picks[0].credits)}` : picks.map((mod) => mod.label).join(', ');
    return [id, picks.length && plan.conflicts.some((c) => c.winner.section === id || c.loser.section === id) ? `${line} · ${t('есть общие файлы')}` : line];
  }));
  const conflictsOf = (section) => plan.conflicts.filter((c) => c.winner.section === section || c.loser.section === section);
  // Sizes: each mod's game files as d2pfx has them; a file another choice keeps makes it «≈».
  const parts = Object.fromEntries(D2PFX_SECTION_IDS.map((id) => [id, picksOf(id).length ? { bytes: picksOf(id).reduce((sum, mod) => sum + mod.bytes, 0), estimate: conflictsOf(id).some((c) => c.loser.section === id) } : null]));
  const total = plan.picks.reduce((sum, mod) => sum + mod.bytes, 0);
  const sizes = { parts, pak: plan.picks.length ? { bytes: total, estimate: plan.conflicts.length > 0, count: plan.picks.length } : null };
  const set = (section, slot, id) => setChoice((now) => {
    const next = { ...now, [section]: { ...(now[section] || {}) } };
    if (id) next[section][slot] = id; else delete next[section][slot];
    if (!Object.keys(next[section]).length) delete next[section];
    return next;
  });
  const reset = (section) => setChoice((now) => { const next = { ...now }; delete next[section]; return next; });
  // The read-me's lines: each chosen mod, where it is from and whose it is.
  const credits = plan.picks.flatMap((mod) => creditLines(SECTION_TITLES()[mod.section], mod));
  const files = (onProgress) => d2pfxPack(choice, onProgress);
  // What the match preview draws (skinRender, d2pfx-hud.js): the HUD skin, then the HUD parts over it — a part
  // keeps the files it shares with the skin in the game, so it goes last here too.
  // The minimap's colour last: over «Larger Minimap»'s bigger box when that is chosen too.
  const colourLast = (mod) => (/-minimap$/.test(mod.id) && mod.id !== 'larger-minimap' ? 1 : 0);
  const hudMods = [...picksOf('hudskin'), ...picksOf('hudparts').sort((a, b) => colourLast(a) - colourLast(b))].map((mod) => mod.id).filter((id) => skinRender(id) !== 'none');
  return { choice, set, reset, plan, states, summary, sizes, credits, files, conflictsOf, picksOf, clickKey, hudMods, key: JSON.stringify(choice) };
}

// One mod in a gallery: d2pfx's picture, the name, the credit.
// The picture: our own render where we have one (a click: the simulation with the mod's particles; a HUD
// skin: the captured HUD with its textures), d2pfx's picture only for what we cannot draw.
function Picture({ mod }) {
  if (mod.section === 'click') return <Suspense fallback={null}><ClickThumb id={mod.id}/></Suspense>;
  const hud = mod.section === 'hudskin' || mod.section === 'hudparts', own = hud && skinRender(mod.id) !== 'none' ? skinThumb(mod.id) : '';
  if (own) return <img src={own} alt="" loading="lazy" decoding="async"/>;
  return <>{mod.preview && <img src={mod.preview} alt="" loading="lazy" decoding="async"/>}{mod.video && <span className="d2-video-mark" title={t('Есть видео')}><Icon name="play" size={12}/></span>}
    {hud && <span className="d2-shot-mark">{t('картинка d2pfx')}</span>}</>;
}
function ModCard({ mod, chosen, onChoose }) {
  return <li className={`cur-pack${chosen ? ' is-chosen' : ''}`}>
    <button type="button" aria-pressed={chosen} onClick={onChoose}>
      <span className="cur-pack-shot"><Picture mod={mod}/>{chosen && <span className="cur-pack-check"><Icon name="check" size={14}/></span>}</span>
      <b title={mod.label}>{mod.label}</b></button>
    <PackCredits pack={mod} compact/><FixNote mod={mod} compact/>
  </li>;
}
function DotaCard({ chosen, onChoose, section }) {
  const picture = section === 'click' ? <Suspense fallback={null}><ClickThumb/></Suspense> : (section === 'hudskin' || section === 'hudparts') && skinThumb('') ? <img src={skinThumb('')} alt="" loading="lazy" decoding="async"/>
    : <span className="d2-dota-face"><Icon name="replay" size={20}/>{t('Как в Dota')}</span>;
  return <li className={`cur-pack d2-dota${chosen ? ' is-chosen' : ''}`}>
    <button type="button" aria-pressed={chosen} onClick={onChoose}>
      <span className="cur-pack-shot">{picture}{chosen && <span className="cur-pack-check"><Icon name="check" size={14}/></span>}</span>
      <b>{t('Как в Dota')}</b></button>
    <span className="cur-credits is-compact">{t('ничего не меняется')}</span>
  </li>;
}

// d2pfx's picture or video full screen (2026-10-17: «чтобы можно было расширить картинку»): Esc, a click or × closes.
function Zoom({ mod, onClose }) {
  useEffect(() => {
    const key = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  // Into <body>: the side panel's animation makes it the containing block of anything fixed inside it.
  return createPortal(<div className="d2-zoom" role="dialog" aria-modal="true" aria-label={mod.label} onClick={onClose}>
    {mod.video ? <video src={mod.video} poster={mod.preview || undefined} muted loop autoPlay playsInline controls onClick={(event) => event.stopPropagation()}/> : <img src={mod.preview} alt={mod.label} decoding="async"/>}
    <button type="button" className="d2-zoom-close" aria-label={t('Закрыть')} onClick={onClose}><Icon name="close"/></button>
  </div>, document.body);
}

// The chosen mod, bigger: d2pfx's video or picture, the whole credit, where it is on d2pfx, what it replaces.
function Chosen({ mod, d2, section }) {
  const lost = d2.plan.conflicts.filter((c) => c.loser.id === mod.id), kept = d2.plan.conflicts.filter((c) => c.winner.id === mod.id);
  const where = (other) => (other.section === section ? '' : ` (${SECTION_TITLES()[other.section]})`);
  // A click plays in the scene above and in the match preview, a drawable HUD skin in the match preview:
  // no d2pfx picture for them. d2pfx's video or picture only for what we cannot draw.
  const hud = mod.section === 'hudskin' || mod.section === 'hudparts', drawn = mod.section === 'click' || (hud && skinRender(mod.id) !== 'none');
  const media = drawn ? null : mod.video ? <video key={mod.video} src={mod.video} poster={mod.preview || undefined} muted loop autoPlay playsInline preload="metadata"/> : mod.preview ? <img src={mod.preview} alt="" decoding="async"/> : null;
  const render = hud ? skinRender(mod.id) : '';
  const [zoom, setZoom] = useState(false);
  return <div className="d2-chosen">
    {media && <div className="d2-chosen-media">{media}<button type="button" className="d2-chosen-expand" onClick={() => setZoom(true)} aria-label={t('Открыть крупно')} title={t('Открыть крупно')}><Icon name="expand" size={15}/></button></div>}
    {zoom && <Zoom mod={mod} onClose={() => setZoom(false)}/>}
    <div className="d2-chosen-text">
      <b>{mod.label}</b><PackCredits pack={mod}/><FixNote mod={mod}/>
      <small>{t('Файлов: {count}', { count: mod.count })} · {sizeText(mod.bytes)} · <a href={mod.page} target="_blank" rel="noopener noreferrer">{t('мод на d2pfx')}</a>{mod.youtube && <> · <a href={mod.youtube} target="_blank" rel="noopener noreferrer">{t('видео')}</a></>}</small>
      {render === 'drawn' && <small className="d2-ok"><Icon name="check" size={13}/>{t('В превью матча слева: его текстуры, стили и разметку раскладывает эмулятор Panorama, а на снятый HUD Dota переносится только то, что мод меняет.')} <button type="button" className="d2-link" onClick={() => setZoom(true)}>{mod.video ? t('видео d2pfx') : t('картинка d2pfx')}</button></small>}
      {render === 'none' && <small className="d2-warn">{mod.section === 'hudparts' && /minimap/.test(mod.id) ? t('Цвет миникарты рисует сам движок Dota, не интерфейс — в превью его нет, поэтому здесь картинка d2pfx.') : mod.section === 'hudparts' ? t('Таблица счёта и магазин в превью закрыты — поэтому здесь картинка d2pfx.') : t('Этот мод в превью не нарисовать — поэтому здесь картинка d2pfx.')}</small>}
      {/^(grey|purple)-minimap$/.test(mod.id) && <small className="d2-warn">{t('Меняет упрощённую миникарту: работает с настройкой Dota «Упрощённая миникарта». Превью показывает её картинку на основной карте, без значков (миникарта в снятом HUD — карта демо-режима).')}</small>}
      {mod.id === 'larger-minimap' && <small className="d2-warn">{t('Работает только с настройкой Dota «Очень большая миникарта» — превью показывает её включённой.')}</small>}
      {(mod.restyle || mod.layout) && <small className="d2-warn">{mod.layout ? t('Заменяет разметку и стили HUD Dota целиком.') : t('Заменяет стили Dota целиком.')} {t('После крупного обновления Dota вид может съехать — тогда сбрось или собери файл заново, когда мод обновят на d2pfx.')}</small>}
      {lost.map((c) => <small key={c.winner.id} className="d2-clash" role="note"><Icon name="alert" size={13}/><span>{rich(t('Файлов, общих с {them}: {count}. Из двух файлов в игре может быть только один — в сборку идут файлы {them}, остальное от «{name}» остаётся.'), { them: <b>{quote(c.winner.label)}{where(c.winner)}</b>, count: c.paths.length, name: mod.label })}</span></small>)}
      {kept.map((c) => <small key={c.loser.id} className="d2-clash" role="note"><Icon name="alert" size={13}/><span>{rich(t('Файлов, общих с {them}: {count}. Из двух файлов в игре может быть только один — в сборку идут файлы «{name}».'), { them: <b>{quote(c.loser.label)}{where(c.loser)}</b>, count: c.paths.length, name: mod.label })}</span></small>)}
    </div>
  </div>;
}

export function D2pfxFields({ d2, section }) {
  const [about, setAbout] = useState(false), def = D2PFX_SECTIONS[section], slots = Object.keys(def.slots), many = slots.length > 1;
  return <>
    <D2pfxNote text={NOTES()[section]} href={`https://h6rd.github.io/Dota2PornFxWeb/?category=${def.category}`} onMore={() => setAbout(true)}/>
    {section === 'click' && <div className="d2-click"><Suspense fallback={<span className="d2-click-scene"/>}><D2pfxClick skin={d2.clickKey}/></Suspense>
      <span className="d2-click-label">{d2.choice.click?.click ? catalog.mods[d2.choice.click.click].label : t('Как в Dota')}</span></div>}
    <p className="custom-hint">{HINTS()[section]}</p>
    {slots.map((slot) => {
      const id = d2.choice[section]?.[slot], mod = id && catalog.mods[id], list = slotMods(section, slot);
      const gallery = <>
        {mod && <Chosen mod={mod} d2={d2} section={section}/>}
        <ul className={`cur-packs d2-gallery${section === 'voice' ? ' is-small' : ''}`} aria-label={`${SECTION_TITLES()[section]}: ${SLOT_TITLES()[slot]}`}>
          <DotaCard section={section} chosen={!id} onChoose={() => d2.set(section, slot, null)}/>
          {list.map((item) => <ModCard key={item.id} mod={item} chosen={item.id === id} onChoose={() => { if (item.id !== id) track('customize.mod', { section, mod: item.id }); d2.set(section, slot, item.id === id ? null : item.id); }}/>)}
        </ul></>;
      return many ? <Field key={slot} label={SLOT_TITLES()[slot]} aside={mod ? mod.label : t('как в Dota')}>{gallery}</Field> : <div key={slot} className="custom-field">{gallery}</div>;
    })}
    {about && <D2pfxAbout onClose={() => setAbout(false)}/>}
  </>;
}
