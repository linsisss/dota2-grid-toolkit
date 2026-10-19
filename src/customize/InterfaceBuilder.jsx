import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Notice } from '../catalog/Common.jsx';
import { INTERFACE_PACK_FILE, interfacePack } from '../../scripts/interface-modules.mjs';
import { CHAT_DEFAULTS, CHAT_LIMITS, CHAT_PRESETS, HUD_DEFAULTS, HUD_PRESETS, HUD_STEPS, chatSettings, hudChanged, hudSettings } from '../../scripts/hud-style.mjs';
import { TEXT_LIMITS, heroNames, parseTexts, splitTexts } from '../../scripts/dota-texts.mjs';
import { catalogAPI } from '../catalog/api.js';
import { locale, t } from '../../scripts/i18n.mjs';
import { md5 } from '../../scripts/md5.mjs';
import { track } from '../site-stats.js';
import { CursorFields, useCursors } from './CursorSection.jsx';
import { Field, Segmented } from './ui.jsx';
import customUI from '../../assets/dota-menu/custom_ui.css?raw';

// The match's modules of the one-page customization (CustomizePage.jsx; «Интерфейс» on its own page from
// 2026-10-16): «Вид HUD» and «Чат» (one file, panorama/styles/custom_ui.vcss_c: scripts/hud-style.mjs),
// «Тексты» (Valve's localization files) — together pak03_dir.vpk (scripts/interface-modules.mjs) — and
// «Курсор» (loose files in dota_russian/resource/cursor: scripts/dota-cursor.mjs, CursorSection.jsx).
// The preview is Dota's own pictures of its HUD (the capture of 2026-10-17, HudCanvas), loaded only while
// the match is shown; the emulated renderer (./panorama/HudScene.jsx) is kept, unused, for comparison.
const HudCanvas = lazy(() => import('./HudCanvas.jsx'));
const HUD_HIDE_LABELS = () => [['flares', t('Украшения по бокам')], ['statue', t('Статуя героя')], ['shadows', t('Тени у способностей')], ['teamItems', t('«Командные предметы» в магазине')]];
const PRESETS = () => [['dota', t('Как в Dota')], ['clear', t('Прозрачный')], ['dark', t('Тёмный')], ['violet', t('Фиолетовый')], ['compact', t('Компактный')]];
// Presets set the HUD and leave the chat as it is.
const presetOf = (settings) => Object.keys(HUD_PRESETS).find((key) => JSON.stringify(hudSettings({ ...HUD_PRESETS[key], chat: settings.chat })) === JSON.stringify(hudSettings(settings))) || '';
export const MATCH_MODULES = Object.freeze(['hud', 'chat', 'cursor', 'texts']);

function Range({ label, value, min, max, onChange, unit = '%', step = 1 }) {
  return <label className="custom-slider"><span>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} style={{ '--fill': `${((value - min) / (max - min)) * 100}%` }}/>
    <output>{value}{unit}</output></label>;
}

// A slider over fixed steps (the scales the preview has Dota's pictures of).
function StepRange({ label, value, steps, onChange, unit = '%' }) {
  const index = Math.max(0, steps.indexOf(value));
  return <label className="custom-slider"><span>{label}</span>
    <input type="range" min={0} max={steps.length - 1} step="1" value={index} aria-valuetext={`${value}${unit}`} onChange={(event) => onChange(steps[Number(event.target.value)])} style={{ '--fill': `${(index / (steps.length - 1)) * 100}%` }}/>
    <output>{value}{unit}</output></label>;
}

export function HudFields({ ui }) {
  const settings = ui.hud, set = (patch) => ui.setHud(hudSettings({ ...settings, ...patch }));
  return <>
    <Field label={t('Пресет')}><div className="catalog-tags" role="group" aria-label={t('Пресет')}>{PRESETS().map(([key, label]) =>
      <button key={key} type="button" aria-pressed={presetOf(settings) === key} onClick={() => { track('customize.preset', { section: 'hud', preset: `hud:${key}` }); ui.setHud(hudSettings({ ...HUD_PRESETS[key], chat: settings.chat })); }}>{label}</button>)}</div></Field>
    <Field label={t('Подложки')} aside={t('фон панелей, не иконки')}>
      <div className="custom-effects has-zoom"><Range label={t('Видимость')} value={settings.opacity} min={0} max={100} onChange={(opacity) => set({ opacity })}/>
        <Range label={t('Оттенок')} value={settings.tintStrength} min={0} max={100} onChange={(tintStrength) => set({ tintStrength })}/>
        <label className="custom-slider interface-color"><span>{t('Цвет')}</span><input type="color" value={settings.tint} onChange={(event) => set({ tint: event.target.value, tintStrength: settings.tintStrength || 40 })}/></label></div>
    </Field>
    <Field label={t('Убрать')}><div className="catalog-tags custom-hide" role="group" aria-label={t('Что убрать из HUD')}>{HUD_HIDE_LABELS().map(([key, label]) =>
      <button key={key} type="button" aria-pressed={settings.hide.includes(key)} onClick={() => set({ hide: settings.hide.includes(key) ? settings.hide.filter((x) => x !== key) : [...settings.hide, key] })}>{settings.hide.includes(key) && <Icon name="eyeOff" size={14}/>}{label}</button>)}</div></Field>
    <Field label={t('Размер')} hint={`${t('Нижняя панель с миникартой только уменьшается: больше, чем в Dota, — уже преимущество.')} ${t('Размеры — те, что сняты в самой Dota.')}`}>
      <div className="custom-effects"><StepRange label={t('Нижняя панель')} value={settings.lower} steps={HUD_STEPS.lower} onChange={(lower) => set({ lower })}/>
        <StepRange label={t('Верхняя панель')} value={settings.top} steps={HUD_STEPS.top} onChange={(top) => set({ top })}/></div>
    </Field>
  </>;
}

// «Курсор»: CursorSection.jsx (its state, the d2pfx packs) and CursorCreator.jsx (the creator).
export { CursorFields };

// «Чат»: one click to a ready place, or two sliders; the chat itself is dragged in the preview (HudCanvas).
const choosePlace = (ui, key) => { track('customize.preset', { section: 'chat', preset: `chat:${key}` }); ui.setChat({ ...CHAT_PRESETS[key] }); };
const CHAT_PLACES = () => [['dota', t('Как в Dota')], ['up', t('Выше')], ['left', t('Слева')], ['own', t('Своё')]];
const chatPlace = (chat) => Object.keys(CHAT_PRESETS).find((key) => JSON.stringify(chatSettings(CHAT_PRESETS[key])) === JSON.stringify(chatSettings(chat))) || 'own';
export function ChatFields({ ui }) {
  const c = chatSettings(ui.hud.chat), set = (patch) => ui.setChat({ ...c, ...patch });
  return <>
    <Field label={t('Место')}><Segmented label={t('Место чата')} value={chatPlace(c)} onChange={(key) => key !== 'own' && choosePlace(ui, key)} options={CHAT_PLACES()}/></Field>
    <div className="custom-effects"><Range label={t('Над низом')} value={c.y} min={CHAT_LIMITS.y[0]} max={700} step={10} unit=" px" onChange={(y) => set({ y })}/>
      <Range label={t('Ширина')} value={c.width} min={CHAT_LIMITS.width[0]} max={CHAT_LIMITS.width[1]} step={10} unit=" px" onChange={(width) => set({ width })}/></div>
    <p className="custom-hint">{t('Тяни чат за рамку прямо в превью, за правый край — ширина. У центра и у места «как в Dota» он прилипает. Стрелки двигают на 10 px, с Shift — на 1 px.')}</p>
    <p className="custom-hint">{t('Шрифт и фон чата Dota из этого файла не берёт — это показала съёмка в игре.')}</p>
  </>;
}

// «Тексты»: Valve's latest dota_russian.txt from the API (server/dota-texts.mjs), loaded once; the user's
// texts by token, kept in this browser.
let textsLoad = null, heroesLoad = null;
const loadTexts = () => (textsLoad ||= catalogAPI('/dota-texts/russian').then((data) => ({ ...data, list: parseTexts(data.text) })).catch((problem) => { textsLoad = null; throw problem; }));
// Hero names: abilities_russian.txt (scripts/dota-texts.mjs heroNames), loaded when «Герои» opens or to build them.
const loadHeroes = () => (heroesLoad ||= catalogAPI('/dota-texts/abilities').then((data) => ({ ...data, heroes: heroNames(data.text) })).catch((problem) => { heroesLoad = null; throw problem; }));
const cleanEdits = (edits) => { const { dota, abilities } = splitTexts(edits); return { ...dota, ...abilities }; };
// The play button is {s:play_button_label} in play.xml: «dota_play» (found in game on 2026-10-16).
const MENU_TOKENS = ['dota_play', 'DOTA_MainMenu_Heroes', 'DOTA_MainMenu_Armory', 'DOTA_MainMenu_Watch', 'DOTA_MainMenu_Learn', 'DOTA_MainMenu_Mods'];
const isHero = (token) => /^npc_dota_hero_/i.test(token);
const TEXT_TABS = () => [['menu', t('Меню')], ['heroes', t('Герои')], ['search', t('Поиск')], ['changed', t('Изменено')]];
function TextRow({ token, original, value, onChange }) {
  return <li className="interface-text">
    <span className="interface-text-head"><small title={token}>{token}</small>{value !== undefined && <button type="button" className="catalog-link" onClick={() => onChange(undefined)}>{t('Вернуть')}</button>}</span>
    <input value={value ?? original} maxLength={TEXT_LIMITS.value} placeholder={original} onChange={(event) => onChange(event.target.value === original ? undefined : event.target.value)}/>
  </li>;
}
export function TextsFields({ ui }) {
  const { edits, texts: data, textsError: error } = ui, onChange = ui.setEdits;
  const [tab, setTab] = useState('menu'), [query, setQuery] = useState(''), [heroes, setHeroes] = useState(null), [heroesError, setHeroesError] = useState('');
  useEffect(() => { if (tab === 'heroes' && !heroes) loadHeroes().then(setHeroes, (problem) => setHeroesError(problem.message)); }, [tab]);
  const heroName = useMemo(() => new Map((heroes?.heroes || []).map((row) => [row.token.toLowerCase(), row.name])), [heroes]);
  const set = (token, value) => { const next = { ...edits }; if (value === undefined) delete next[token]; else next[token] = value; onChange(next); };
  const byToken = useMemo(() => new Map((data?.list || []).map((row) => [row.token.toLowerCase(), row])), [data]);
  const original = (token) => heroName.get(token.toLowerCase()) ?? byToken.get(token.toLowerCase())?.text ?? '';
  const rows = useMemo(() => {
    if (tab === 'menu') return MENU_TOKENS.filter((token) => byToken.has(token.toLowerCase())).map((token) => byToken.get(token.toLowerCase()).token);
    if (tab === 'heroes') { const q = query.trim().toLowerCase(); return (heroes?.heroes || []).filter((row) => !q || row.name.toLowerCase().includes(q) || row.token.includes(q)).map((row) => row.token); }
    if (tab === 'changed') return Object.keys(edits);
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return (data?.list || []).filter((row) => !isHero(row.token) && row.text.toLowerCase().includes(q) || row.token.toLowerCase().includes(q)).slice(0, 60).map((row) => row.token);
  }, [tab, query, data, edits, byToken, heroes]);
  const count = Object.keys(edits).length;
  return <>
    <Segmented compact label={t('Какие тексты')} value={tab} onChange={setTab} options={TEXT_TABS().map(([id, label]) => [id, id === 'changed' && count ? `${label} ${count}` : label])}/>
    {(tab === 'search' || tab === 'heroes') && <label className="catalog-search interface-text-search"><Icon name="search"/><input aria-label={t('Поиск по текстам')} placeholder={tab === 'heroes' ? t('Имя героя') : t('Текст или токен, от двух букв')} value={query} onChange={(event) => setQuery(event.target.value)}/></label>}
    {tab === 'heroes' && (heroesError ? <Notice error>{heroesError}</Notice> : !heroes && <p role="status" className="custom-hint">{t('Загружаем имена героев…')}</p>)}
    {error ? <Notice error>{error}</Notice> : !data || (tab === 'heroes' && !heroes) ? <p role="status" className="custom-hint">{t('Загружаем тексты Dota — около 1 МБ…')}</p>
      : <ul className="interface-texts">{rows.map((token) => <TextRow key={token} token={token} original={original(token)} value={edits[token]} onChange={(value) => set(token, value)}/>)}
        {!rows.length && <li className="custom-hint">{tab === 'changed' ? t('Пока ничего не изменено.') : tab === 'search' ? t('Набери слово из игры: «Рошан», «Магазин»…') : t('Ничего не нашлось.')}</li>}</ul>}
    {data && <p className="custom-hint">{t('Тексты Dota от {date}. Они меняются почти с каждым обновлением Dota — после обновления скачай сборку заново, иначе новые надписи будут видны как служебные слова.', { date: new Date(data.updated).toLocaleDateString(locale, { day: 'numeric', month: 'long' }) })}</p>}
    {tab === 'heroes' && <p className="custom-hint">{t('Имя меняется там, где Dota пишет героя. Род (мужской или женский) для фраз Dota остаётся как у Valve.')}</p>}
  </>;
}

// Settings kept in this browser between visits (the cursor keeps its own: CursorSection.jsx).
const SAVED = 'gridstudio.interface';
const readSaved = () => { try { return JSON.parse(localStorage.getItem(SAVED) || '{}'); } catch { return {}; } };

// ——— The state of the match's modules: one place, remembered in this browser. `open`: the section open
// on the page, so Valve's texts load only when «Тексты» is opened or there are texts to build.
export function useInterface({ open = '' } = {}) {
  const [hud, setHud] = useState(() => hudSettings(readSaved().hud || HUD_DEFAULTS)), cursors = useCursors(), [edits, setEdits] = useState(() => cleanEdits(readSaved().texts));
  const [texts, setTexts] = useState(null), [textsError, setTextsError] = useState('');
  useEffect(() => { try { localStorage.setItem(SAVED, JSON.stringify({ hud, texts: edits })); } catch { /* This visit only. */ } }, [hud, edits]);
  const textsWanted = open === 'texts' || Object.keys(edits).length > 0;
  useEffect(() => { if (textsWanted && !texts) loadTexts().then(setTexts, (problem) => setTextsError(problem.message)); }, [textsWanted]);
  const hudOnly = hudChanged({ ...hud, chat: CHAT_DEFAULTS }), chatSet = JSON.stringify(chatSettings(hud.chat)) !== JSON.stringify(CHAT_DEFAULTS);
  const cursorSet = cursors.state === 'changed', textsSet = Object.keys(edits).length > 0;
  const states = { hud: hudOnly ? 'changed' : 'default', chat: chatSet ? 'changed' : 'default', cursor: cursorSet ? 'changed' : 'default', texts: textsSet ? 'changed' : 'default' };
  // The files of these modules: pak03_dir.vpk (HUD, chat, texts) and the cursor's loose files.
  async function files() {
    const parts = splitTexts(edits);
    const [valveTexts, abilities] = await Promise.all([Object.keys(parts.dota).length ? (texts || loadTexts()) : null, Object.keys(parts.abilities).length ? loadHeroes() : null]);
    const pack = interfacePack({ hud, ...(textsSet ? { texts: { edits } } : {}) }, { md5, valve: { 'custom_ui.css': customUI, 'dota_russian.txt': valveTexts?.text, 'abilities_russian.txt': abilities?.text } });
    const loose = cursors.files();
    return { pak03: pack, cursors: loose };
  }
  // Real sizes, made a moment after a change (the same files() the download takes): each module's share
  // of pak03 (the HUD and chat file, the texts) and the cursor's files.
  const [sizes, setSizes] = useState({ pak03: null, parts: {} });
  const key = JSON.stringify([hud, edits, cursors.key, !!texts]);
  useEffect(() => {
    if (!hudOnly && !chatSet && !cursorSet && !textsSet) { setSizes({ pak03: null, parts: {} }); return undefined; }
    let gone = false;
    const timer = setTimeout(() => {
      const hudPart = hudOnly || chatSet ? interfacePack({ hud }, { md5, valve: { 'custom_ui.css': customUI } }) : null;
      files().then(({ pak03, cursors: loose }) => {
        if (gone) return;
        const style = hudPart?.length ?? 0, all = pak03?.length ?? 0, cursorBytes = loose.reduce((sum, file) => sum + file.data.length, 0);
        setSizes({ pak03: pak03 ? { bytes: all } : null, cursors: loose.length ? { bytes: cursorBytes, count: loose.length } : null,
          parts: { hud: hudOnly ? { bytes: style } : null, chat: chatSet && !hudOnly ? { bytes: style } : null, texts: textsSet ? { bytes: Math.max(1, all - style) } : null, cursor: cursorSet ? { bytes: cursorBytes } : null } });
      }).catch(() => {});
    }, 350);
    return () => { gone = true; clearTimeout(timer); };
  }, [key]);
  const setChat = (chat) => setHud(hudSettings({ ...hud, chat }));
  function reset(id) {
    if (id === 'hud') setHud(hudSettings({ ...HUD_DEFAULTS, chat: hud.chat }));
    if (id === 'chat') setChat({ ...CHAT_DEFAULTS });
    if (id === 'cursor') cursors.reset();
    if (id === 'texts') setEdits({});
  }
  const preset = presetOf(hud), c = chatSettings(hud.chat), place = chatPlace(c);
  const firstEdit = Object.entries(edits)[0];
  const summary = {
    hud: hudOnly ? (preset && preset !== 'dota' ? t('Пресет «{name}»', { name: Object.fromEntries(PRESETS())[preset] }) : t('Свой вид')) : '',
    chat: chatSet ? place !== 'own' ? `${Object.fromEntries(CHAT_PLACES())[place]} · ${c.width} px` : chatLabel(c) + ` · ${c.width} px` : '',
    cursor: cursors.summary,
    texts: textsSet ? t('Надписей: {count}, «{from}» → «{to}»', { count: Object.keys(edits).length, from: firstEdit[0], to: firstEdit[1] }) : ''
  };
  return { hud, setHud, setChat, cursors, edits, setEdits, texts, textsError, states, summary, sizes, files, reset, cursorPreview: cursors.preview };
}
// Where the chat is, in words: «по центру · 280 px над низом», «300 px слева · …».
export const chatLabel = (chat) => {
  const c = chatSettings(chat);
  return `${c.align === 'center' ? t('по центру') : c.align === 'left' ? t('{px} px слева', { px: c.x }) : t('{px} px справа', { px: c.x })} · ${t('{px} px над низом', { px: c.y })}`;
};

// ——— The match on the page: the HUD as Dota drew it; the chat with its handle while «Чат» is open.
// `mods`: d2pfx HUD skin and parts drawn into the preview (D2pfxSections.jsx, HudCanvas).
export function MatchScreen({ ui, chat = false, onFrame, mods = [] }) {
  return <div className="custom-screen is-match" style={{ '--ratio': 16 / 9 }}>
    <Suspense fallback={<p className="custom-hint cz-loading" role="status">{t('Загружаем интерфейс Dota…')}</p>}>
      <HudCanvas settings={ui.hud} cursor={ui.cursorPreview} roles={ui.cursors.roles} chat={chat || ui.states.chat === 'changed'} onChatMove={chat ? ui.setChat : null} label={chatLabel} onFrame={onFrame} mods={mods}/>
    </Suspense>
  </div>;
}
// Under the match: the chat's places and nudges while «Чат» is open, else what the preview is.
export function MatchUnder({ ui, chat = false }) {
  if (!chat) return <p className="custom-caption">{t('Интерфейс снят в самой Dota: превью складывает слои, которые нарисовала игра, по твоим настройкам.')}</p>;
  const c = chatSettings(ui.hud.chat), place = chatPlace(c);
  // A nudge moves the box on the screen (left/right in px, up/down in px), whichever side it is aligned to.
  const nudge = (dx, dy) => {
    const width = c.width, left = c.align === 'center' ? Math.round((1920 - width) / 2) : c.align === 'left' ? c.x : 1920 - c.x - width, x = Math.max(0, Math.min(1920 - width, left + dx));
    const y = Math.max(CHAT_LIMITS.y[0], Math.min(CHAT_LIMITS.y[1], c.y - dy)), right = 1920 - x - width;
    ui.setChat(Math.abs(x + width / 2 - 960) < 1 ? { ...c, align: 'center', y } : x <= right ? { ...c, align: 'left', x, y } : { ...c, align: 'right', x: right, y });
  };
  return <div className="cz-chat-bar">
    <span className="catalog-muted">{t('Чат:')}</span>
    <Segmented compact label={t('Место чата')} value={place === 'own' ? '' : place} onChange={(key) => choosePlace(ui, key)} options={CHAT_PLACES().slice(0, 3)}/>
    <span className="cz-nudge" role="group" aria-label={t('Подвинуть чат')}>
      {[['chevronLeft', -10, 0, t('Левее')], ['chevronUp', 0, -10, t('Выше')], ['chevron', 0, 10, t('Ниже')], ['chevronRight', 10, 0, t('Правее')]].map(([icon, dx, dy, label]) =>
        <button key={icon} type="button" aria-label={label} title={label} onClick={(event) => nudge(event.shiftKey ? Math.sign(dx) : dx, event.shiftKey ? Math.sign(dy) : dy)}><Icon name={icon}/></button>)}
    </span>
    <span className="catalog-muted cz-chat-keys">{t('или тяни рамку ·')} <kbd>←</kbd><kbd>→</kbd> {t('по 10 px, с')} <kbd>Shift</kbd> {t('— по 1 px')}</span>
  </div>;
}
export { INTERFACE_PACK_FILE };
