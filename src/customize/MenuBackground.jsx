import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Modal, Notice } from '../catalog/Common.jsx';
import { GRID_DIM, MENU_FRAME, MENU_FRAME_ZOOM, MENU_LIMITS, MENU_SIZES, fitPiece, framePlacement, mediaKind, menuBitrate, menuFrame, menuLook, pieceLength } from '../../scripts/menu-background.mjs';
import menuMeta from '../../assets/dota-menu/meta.json';
import { SEASON_EVENT, folderOf, packBackground } from './background-pack.js';
import { getBackground } from '../../scripts/background-library.mjs';
import { claimBuiltBackground, markPublished, pullRecipes, rememberDownload, saveBuiltBackground } from '../studio-backgrounds.js';
import { useAccount } from '../catalog/Account.jsx';
import { Field, Segmented, rich } from './ui.jsx';
import DotaMenu from './DotaMenu.jsx';
import DotaHeroPage from './DotaHeroPage.jsx';
import DotaGridPage from './DotaGridPage.jsx';
import DotaLoadingPage from './DotaLoadingPage.jsx';
import { GridChoice, GridPicker, usePreviewGrid } from './GridPicker.jsx';
import { LoopPreview, TrimBar } from './Trim.jsx';
import { ShareBackground } from './ShareBackground.jsx';
import { BackgroundPicker, downloadWorkshop } from './BackgroundPicker.jsx';
import { backgroundMedia, useBackgrounds } from '../catalog/BackgroundGallery.jsx';
import profilePreview from '../../assets/dota-menu/ui/profile-preview.webp';
import { CATALOG_PATH, STUDIO_PATH, countDownload } from '../catalog/api.js';
import { lang, locale, t } from '../../scripts/i18n.mjs';

// The main-menu background, made entirely in the browser: the file becomes a WebM
// (menu-video.js, loaded on first use) and then pakNN_dir.vpk with Valve's dashboard pointing at it
// (scripts/menu-background.mjs). Nothing is uploaded.
const ASPECTS = () => ({ '16:9': t('обычный монитор'), '16:10': t('ноутбуки, MacBook'), '21:9': t('широкий монитор'), '4:3': t('растянутое 4:3') });
const FITS = () => ({ cover: t('Края обрежутся, чёрных полос нет.'), contain: t('Картинка целиком, по бокам чёрные полосы.') });
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,.mov';
// Where to find a background: live wallpapers (MP4), GIFs, free stock video.
const SOURCES = () => [
  { name: 'MotionBGs', url: 'https://motionbgs.com/', note: t('Живые обои из игр и аниме, MP4.') },
  { name: 'MoeWalls', url: 'https://moewalls.com/', note: t('Аниме и игровые живые обои, MP4.') },
  { name: 'WallpaperWaifu', url: 'https://www.wallpaperwaifu.com/', note: t('Аниме-обои, MP4.') },
  { name: 'Tenor', url: 'https://tenor.com/', note: t('Гифки на любую тему.') },
  { name: 'Pixabay', url: 'https://pixabay.com/videos/', note: t('Бесплатные видео без ограничений: космос, природа, абстракция.') }
];
// The menu's modules of the one-page customization (CustomizePage.jsx): the main menu's background, the
// one under the hero grid on the «Герои» page (1.6.4; scripts/menu-background.mjs GRID_PAGE), the one
// behind the hero («За героем»; HERO_PAGE), the loading screen of a match (2026-10-16; loadingPage) and the
// menu's buttons (MENU_HIDE, the news cards, the profile buttons). Under the grid: the menu's background
// (default), the same darker, or a video of its own. Behind the hero and on the loading screen: Valve's
// picture, the menu video, or a video of its own. All of them are one pak02_dir.vpk.
const LOADING_MODES = () => [['off', t('Как в Dota')], ['menu', t('Как в меню')], ['own', t('Свой фон')]];
const LOADING_HINTS = () => ({ off: t('Экран загрузки не меняется: логотип Dota или твой экран загрузки из Арсенала.'), menu: t('Пока грузится матч — тот же фон, что в главном меню.'), own: t('Пока грузится матч — свой фон, с теми же настройками, что у меню.') });
// Top bar buttons that can be hidden (MENU_HIDE): never «Играть», the settings, the party or the exit.
const HIDE_OPTIONS = () => [['collection', t('Арсенал')], ['watch', t('Просмотр')], ['learn', t('База знаний')], ['mods', t('Игротека')], ['shards', t('Шарды')], ['armory', t('Щит и меч')], ['plus', t('Dota Plus')]];
const GRID_MODES = () => [['menu', t('Как в меню')], ['dim', t('Темнее')], ['own', t('Свой фон')]];
const GRID_HINTS = () => ({ menu: t('Под сеткой — фон главного меню.'), dim: t('Фон меню под сеткой темнее. Видео второй раз не собирается.'), own: t('Под сеткой — свой фон, с теми же настройками, что у меню.') });
const HERO_MODES = () => [['off', t('Как в Dota')], ['menu', t('Как в меню')], ['own', t('Свой фон')]];
const HERO_HINTS = () => ({ menu: t('За героем крутится тот же фон, что в главном меню.'), own: t('За героем — свой фон, с теми же настройками, что у меню.'), off: t('Страница героя не меняется: за героем картинка Dota.') });
const megabytes = (bytes) => (bytes / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1 });
// A file's size for people: kilobytes under a megabyte, so a small picture is not «0 МБ».
export const fileSize = (bytes) => bytes < 1_000_000 ? t('{size} КБ', { size: Math.max(1, Math.round(bytes / 1000)) }) : t('{size} МБ', { size: megabytes(bytes) });
const tooBig = (bytes) => t('Файл {size} МБ, а можно до {limit} МБ.', { size: megabytes(bytes), limit: megabytes(MENU_LIMITS.bytes) });

function Sources({ onClose }) {
  return <Modal title={t('Где взять фон')} icon="image" onClose={onClose} size="md"><div className="custom-install custom-sources">
    <p>{rich(t('{link}: их можно взять и поменять здесь.'), { link: <a className="catalog-link" href={`${CATALOG_PATH}?backgrounds`}>{t('Готовые фоны пользователей — в мастерской')}</a> })}</p>
    <ul>{SOURCES().map((source) => <li key={source.name}><a href={source.url} target="_blank" rel="noreferrer"><b>{source.name}</b><span>{source.note}</span><Icon name="external"/></a></li>)}</ul>
    <p className="catalog-muted">{t('Лучше всего смотрятся короткие зацикленные ролики в 1080p: видео длиннее 30 секунд обрежется. Скачанный файл перетащи на экран слева. Обои на этих сайтах — чужие работы: бери их для своего фона, а не для продажи.')}</p>
  </div></Modal>;
}

// Which Dota update the menu files come from (scripts/check-dota-menu.mjs watches for new ones).
const updateDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, lang === 'en' ? { dateStyle: 'medium' } : { day: '2-digit', month: '2-digit', year: 'numeric' });
export function MenuVersion() {
  return <p className="catalog-muted">{t('Файлы меню — от обновления Dota {date}.', { date: updateDate(menuMeta.date) })}</p>;
}

// Blur, dim and, once there is a picture, its zoom (menuFrame, 100 to MENU_FRAME_ZOOM × 100 %): one
// row of sliders, and a line about framing by dragging the picture in the preview, with a way back
// to the middle.
function Effects({ blur, onBlur, dim, onDim, frame = null, onFrame }) {
  const value = frame && Math.round(frame.zoom * 100), max = MENU_FRAME_ZOOM * 100;
  const moved = frame && (frame.zoom !== 1 || frame.x !== 0.5 || frame.y !== 0.5 || frame.rotate || frame.flipX || frame.flipY);
  return <>
    <div className={`custom-effects${frame ? ' has-zoom' : ''}`}><Slider label={t('Размытие')} value={blur} onChange={onBlur}/><Slider label={t('Затемнение')} value={dim} onChange={onDim}/>
      {frame && <label className="custom-slider"><span>{t('Масштаб')}</span>
        <input type="range" min="100" max={max} step="5" value={value} onChange={(event) => onFrame(menuFrame({ ...frame, zoom: Number(event.target.value) / 100 }))} style={{ '--fill': `${((value - 100) / (max - 100)) * 100}%` }}/>
        <output>{value}%</output></label>}</div>
    {frame && <p className="custom-hint">{t('Тяни картинку в превью, чтобы выбрать кадр.')}{moved && <> <button type="button" className="catalog-link" onClick={() => onFrame(MENU_FRAME)}>{t('Сбросить кадр')}</button></>}</p>}
  </>;
}
// A 0–100 % slider in the panel; 0 reads «нет».
function Slider({ label, value, onChange }) {
  return <label className="custom-slider"><span>{label}</span>
    <input type="range" min="0" max="100" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} style={{ '--fill': `${value}%` }}/>
    <output>{value ? `${value}%` : t('нет')}</output></label>;
}

// `preset`: a workshop background to start from; `studioItem`: a «Студия» background to change
// (?item=id): its settings come back, its source is taken again (a workshop background is
// downloaded, the user's own file is asked for), and the next build updates it.
// A picture beside the settings panel while the pointer is over a setting (or focus is in it), for
// what the builder's preview does not show (the profile buttons). Fixed, since the panel scrolls and
// would clip it: left of the panel, level with the row, or above the row where there is no room. It
// lives in .custom-app, outside the panel: the panel's entrance animation (a transform) would make
// `fixed` count from the panel instead of the window.
const PEEK_GAP = 18;
const FIT_OPTIONS = () => [['cover', t('Заполнить')], ['contain', t('Целиком')]];
function Peek({ src, width, height, caption, children }) {
  const row = useRef(null), [at, setAt] = useState(null), [open, setOpen] = useState(false);
  const show = () => {
    const box = row.current.getBoundingClientRect(), tall = height + 64, beside = box.left - width - PEEK_GAP >= 8;
    setAt(beside ? { left: box.left - width - PEEK_GAP, top: Math.max(8, Math.min(innerHeight - tall - 8, box.top + box.height / 2 - tall / 2)), side: 'left' }
      : { left: Math.max(8, Math.min(innerWidth - width - 8, box.left)), top: Math.max(8, box.top - tall - 10), side: 'top' });
    setOpen(true);
  };
  return <div ref={row} onPointerEnter={show} onPointerLeave={() => setOpen(false)} onFocus={show} onBlur={() => setOpen(false)}>
    {children}
    {at && createPortal(<figure className={`custom-peek is-${at.side}${open ? ' is-open' : ''}`} style={{ left: at.left, top: at.top, width }} aria-hidden="true">
      <img src={src} alt="" width={width} height={height}/><figcaption>{caption}</figcaption></figure>, row.current.closest('.custom-app') ?? document.body)}
  </div>;
}

// A background of its own for a second page (under the hero grid, behind the hero): a file with the
// menu's settings — fit, blur, dim, framing, a piece of a video and its crossfade. A studio recipe's
// settings come back at once (restore) and its trim once the video's length is known, when the user
// chooses the file it was built from (`wanted`).
function useOwnBackground(setError) {
  const [file, setFile] = useState(null), [kind, setKind] = useState(null), [source, setSource] = useState(''), [fit, setFit] = useState('cover');
  const [blur, setBlur] = useState(0), [dim, setDim] = useState(0), [frame, setFrame] = useState(MENU_FRAME), [ratio, setRatio] = useState(0), [origin, setOrigin] = useState(null), [wanted, setWanted] = useState(null);
  const [duration, setDuration] = useState(0), [piece, setPiece] = useState({ start: 0, end: 0 }), [crossfade, setCrossfade] = useState(0);
  // `fetching`: a workshop background on its way ({ title, progress }), shown over the preview.
  const [fetching, setFetching] = useState(null);
  const input = useRef(null), playhead = useRef(null), pending = useRef(null), seek = useRef(null), loading = useRef(null);
  useEffect(() => () => source && URL.revokeObjectURL(source), [source]);
  useEffect(() => () => loading.current?.abort(), []);
  // `from`: a workshop background (or the menu's, see `adopt`); otherwise the user's own file.
  async function choose(next, from = null) {
    setError('');
    if (!next) return;
    if (next.size > MENU_LIMITS.bytes) return setError(tooBig(next.size));
    const detected = mediaKind(new Uint8Array(await next.slice(0, 32).arrayBuffer()));
    if (!detected) return setError(t('Подойдёт картинка (PNG, JPEG, WebP), GIF или видео (MP4, WebM).'));
    if (!pending.current) setFrame(MENU_FRAME);
    if (detected.type !== 'video') pending.current = null;
    setWanted(null);
    setOrigin(from || { kind: 'file', name: next.name, size: next.size, type: detected.type, label: detected.label });
    setFile(next); setKind(detected); setRatio(0); setDuration(0); setSource(URL.createObjectURL(next));
  }
  // A workshop background for this page alone (BackgroundPicker), downloaded here with progress.
  function pickWorkshop(item) {
    loading.current?.abort();
    const controller = new AbortController(); loading.current = controller;
    setError(''); setFetching({ title: item.title || '', progress: 0 });
    downloadWorkshop(item, { signal: controller.signal, onProgress: (progress, full) => setFetching({ title: full.title, progress }) })
      .then(({ file: next, origin: from }) => choose(next, from))
      .catch((problem) => { if (!controller.signal.aborted) setError(problem.message, true); })
      .finally(() => { if (loading.current === controller) { loading.current = null; setFetching(null); } });
  }
  // The menu's background as it is now, with its settings, kept for this page: then the menu can
  // take another one (2026-10-16: «когда меняешь в меню, меняется и остальное сразу»).
  function adopt(menu) {
    setFit(menu.fit); setBlur(menu.blur); setDim(menu.dim); setFrame(menu.frame);
    pending.current = menu.piece ? { piece: menu.piece, crossfade: menu.crossfade } : null;
    return choose(menu.file, menu.origin);
  }
  function remove() { loading.current?.abort(); setFetching(null); setFile(null); setKind(null); setSource(''); setRatio(0); setDuration(0); setOrigin(null); pending.current = null; }
  // A workshop source comes back by itself; a file of the user's is asked for (`wanted`).
  function restore(saved) {
    setFit(saved.fit); setBlur(saved.blur); setDim(saved.dim); setFrame(menuFrame(saved.frame)); pending.current = saved;
    if (saved.source?.kind === 'workshop') pickWorkshop({ id: saved.source.id, title: saved.source.title }); else setWanted(saved.source);
  }
  function onMeta(element) {
    if (element.videoWidth && element.videoHeight) setRatio(element.videoWidth / element.videoHeight);
    if (!Number.isFinite(element.duration)) return;
    const length = element.duration, restored = pending.current;
    setDuration(length); setPiece(fitPiece(restored?.piece || { start: 0, end: length }, length, 'start'));
    if (restored) { setCrossfade(restored.crossfade); pending.current = null; }
  }
  return { file, kind, source, video: kind?.type === 'video', fit, setFit, blur, setBlur, dim, setDim, frame, setFrame, ratio, setRatio, wanted, duration, piece, setPiece, crossfade, setCrossfade, input, playhead, seek,
    origin, fetching, choose, pickWorkshop, adopt, remove, restore, onMeta,
    // What the encoder and the studio recipe take, and what makes a built result stale.
    encoding: { fit, effects: { blur: blur / 100, dim: dim / 100 }, frame, piece: duration ? piece : null, crossfade },
    recipe: { fit, blur, dim, frame, piece: duration ? piece : null, crossfade: duration ? crossfade : 0, source: origin },
    stale: [file, fit, blur, dim, frame, piece.start, piece.end, crossfade] };
}
// The panel's fields for such a background: the file asked for again (from the studio), the file,
// and once there is one, how it fits and its effects; until then the page shows the menu's.
function OwnFields({ own, aspect, where, onWorkshop }) {
  return <>
    {own.wanted && own.wanted.kind !== 'workshop' && <Notice>{rich(t('Чтобы собрать фон {where} как раньше, выбери его файл: {name}, {size}. Настройки уже стоят.'), { where, name: <b>{own.wanted.name}</b>, size: fileSize(own.wanted.size) })}</Notice>}
    <Field label={t('Файл')} hint={!own.file && t('PNG, JPEG, WebP, GIF, MP4, WebM до {size} МБ. Пропорции экрана — как у главного меню ({aspect}).', { size: megabytes(MENU_LIMITS.bytes), aspect })}>
      {own.file ? <div className="custom-file-card"><span className="custom-file-kind">{own.kind.label}</span><span className="custom-file-name"><b title={own.file.name}>{own.file.name}</b><small>{fileSize(own.file.size)}</small></span>
        <button type="button" className="catalog-icon custom-file-remove" onClick={own.remove} aria-label={t('Убрать фон {where}', { where })} title={t('Убрать фон')}><Icon name="close"/></button></div>
        : <div className="custom-file-choices"><button type="button" className="custom-file-empty" disabled={!!own.fetching} onClick={() => own.input.current?.click()}><Icon name="plus"/>{t('Выбрать файл')}</button>
          <button type="button" className="custom-file-empty" disabled={!!own.fetching} onClick={onWorkshop}><Icon name="workshop"/>{own.fetching ? t('Загружаем…') : t('Из мастерской')}</button></div>}
    </Field>
    {own.file && own.origin?.kind === 'workshop' && <p className="custom-hint">{t('Фон из мастерской: «{title}».', { title: own.origin.title })}</p>}
    {own.file ? <Field label={t('Картинка')} aside={FITS()[own.fit]}><Segmented label={t('Как вписать фон {where}', { where })} value={own.fit} onChange={own.setFit} options={FIT_OPTIONS()}/>
      <Effects blur={own.blur} onBlur={own.setBlur} dim={own.dim} onDim={own.setDim} frame={own.frame} onFrame={own.setFrame}/></Field>
      : <p className="custom-hint">{t('Пока файл не выбран, {where} будет фон главного меню.', { where })}</p>}
  </>;
}

// On a page that shows the menu's background: keep that one here, so the menu can take another.
function Keep({ onKeep }) {
  return <div className="custom-keep"><button type="button" className="catalog-button" onClick={onKeep}><Icon name="pin"/>{t('Оставить этот фон здесь')}</button>
    <p className="custom-hint">{t('Фон меню станет своим фоном этой страницы — потом в меню можно поставить другой, а здесь останется этот.')}</p></div>;
}

// ——— The state: one place for the menu, the grid page, the hero page, the loading screen and the menu's
// buttons (the one-page customization, 2026-10-17: «всё вообще на одной странице, сборка 1 общего файла»).
// `page`: the scene shown (menu, grid, hero, loading), so a dropped file goes to that page's background.
// What a module is, in the page's three words: 'changed' («Своё»), 'follow' («Как в меню»: the page shows
// the menu's background) or 'default' («Как в Dota»).
const VIDEO_GUESS = { still: 200_000, animation: 4_000_000 };
// The WebM's size before it is encoded (menu-video.js aims at the bitrate for the clip's length and keeps
// under MENU_LIMITS.videoBytes); a still picture is one frame a second.
export function videoGuess({ kind, duration, piece, crossfade }) {
  if (!kind) return 0;
  if (kind.still) return VIDEO_GUESS.still;
  if (kind.type !== 'video') return VIDEO_GUESS.animation;
  if (!duration) return MENU_LIMITS.videoBytes;
  const seconds = Math.min(MENU_LIMITS.seconds, Math.max(1, pieceLength(piece, crossfade)));
  return Math.min(MENU_LIMITS.videoBytes, Math.round((menuBitrate(seconds) * seconds) / 8));
}
const PLACEHOLDER = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
export const MENU_MODULES = Object.freeze(['bg', 'grid', 'hero', 'loading', 'buttons']);

export function useMenuBackground({ preset = null, studioItem = null, page = 'menu', onRemove }) {
  const [file, setFile] = useState(null), [kind, setKind] = useState(null), [source, setSource] = useState(''), [aspect, setAspect] = useState('16:9'), [fit, setFit] = useState('cover');
  const [blur, setBlur] = useState(0), [dim, setDim] = useState(0), [frame, setFrame] = useState(MENU_FRAME), [framing, setFraming] = useState(null);
  // The Stratz and Dotabuff buttons are off until asked for: on the one page anything on is a change from Dota.
  const [carnival, setCarnival] = useState(true), [seasonCard, setSeasonCard] = useState(true), clean = !carnival && !seasonCard, [seasonButton, setSeasonButton] = useState(true), [profileLinks, setProfileLinks] = useState(false), [folder, setFolder] = useState(lang === 'en' ? 'english' : 'russian');
  const [duration, setDuration] = useState(0), [piece, setPiece] = useState({ start: 0, end: 0 }), [crossfade, setCrossfade] = useState(0);
  const [mediaRatio, setMediaRatio] = useState(0), [progress, setProgress] = useState(null), [result, setResult] = useState(null), [error, setErrorText] = useState(''), [failed, setFailed] = useState(false), [sources, setSources] = useState(false), [share, setShare] = useState(false), [dragging, setDragging] = useState(false), [fetching, setFetching] = useState(null);
  const input = useRef(null), running = useRef(null), playhead = useRef(null), seek = useRef(null);
  // What the file is (for the studio recipe), the studio background being changed, the recipe whose
  // piece and crossfade wait for the video's length, and an own file the user is asked to choose.
  const [origin, setOrigin] = useState(null), [pick, setPick] = useState(preset), [studio, setStudio] = useState(null), [wanted, setWanted] = useState(null), [note, setNote] = useState('');
  // A guest's build is kept in this browser only: the caption asks to sign in, and once signed in
  // here the background goes into the account at once (claimBuiltBackground).
  const auth = useAccount(), userId = auth?.user?.id;
  useEffect(() => {
    if (!userId || !studio?.saved || studio.account) return;
    claimBuiltBackground(studio.id, userId).then((claimed) => claimed && setStudio((current) => current?.id === studio.id ? { ...current, account: userId } : current)).catch(() => {});
  }, [userId, studio?.id, studio?.saved, studio?.account]);
  // The second pages: the mode of each and, for 'own', a file of its own (useOwnBackground); under the
  // grid, how much darker for 'dim' (a percent of GRID_DIM.max) and the grid shown in the preview.
  const [heroMode, setHeroMode] = useState('menu'), [gridMode, setGridMode] = useState('menu'), [gridDim, setGridDim] = useState(55), [picking, setPicking] = useState(false), [browsing, setBrowsing] = useState(null);
  // A failure (the pack did not build or load) offers «Сообщить в чат»; a wrong file does not.
  const setError = (message, failure = false) => { setErrorText(message); setFailed(failure); };
  const heroOwn = useOwnBackground(setError), gridOwn = useOwnBackground(setError), loadingOwn = useOwnBackground(setError), preview = usePreviewGrid(page === 'grid');
  const [loadingMode, setLoadingMode] = useState('off'), [hide, setHide] = useState([]);
  const studioId = useRef(null), pending = useRef(null), saving = useRef(null);
  useEffect(() => { setPick(preset); }, [preset]);
  useEffect(() => () => source && URL.revokeObjectURL(source), [source]);
  useEffect(() => () => { if (result) for (const url of [result.url, result.heroUrl, result.gridUrl, result.loadingUrl]) if (url) URL.revokeObjectURL(url); }, [result]);
  // Changing anything that is baked into the videos or the pack makes the result stale.
  useEffect(() => { setResult(null); }, [file, aspect, fit, blur, dim, carnival, seasonCard, seasonButton, profileLinks, piece.start, piece.end, crossfade, frame,
    heroMode, ...heroOwn.stale, gridMode, gridDim, ...gridOwn.stale, loadingMode, ...loadingOwn.stale, hide.join()]);
  useEffect(() => () => running.current?.abort(), []);
  // A background from the studio: settings now, the source next (see `pending`).
  useEffect(() => {
    if (!studioItem) return;
    let stopped = false;
    (async () => {
      const record = await getBackground(studioItem).catch(() => null) || (await pullRecipes().catch(() => [])).find((item) => item.id === studioItem);
      if (stopped) return;
      if (!record) return setError(t('Этого фона нет в студии: возможно, его удалили.'));
      const recipe = record.recipe;
      setAspect(recipe.aspect); setFit(recipe.fit); setBlur(recipe.blur); setDim(recipe.dim); setCarnival(recipe.news?.carnival ?? !recipe.clean); setSeasonCard(recipe.news?.season ?? !recipe.clean); setSeasonButton(recipe.event ?? true); setProfileLinks(recipe.profile ?? true); setFolder(folderOf(recipe.folder).client); setFrame(menuFrame(recipe.frame));
      pending.current = recipe; studioId.current = record.id; setStudio({ id: record.id, name: record.name, saved: false });
      const hero = recipe.hero || { mode: 'menu' }, grid = recipe.grid || { mode: 'menu' };
      setHeroMode(hero.mode);
      if (hero.mode === 'own') heroOwn.restore(hero);
      setGridMode(grid.mode);
      if (grid.mode === 'dim') setGridDim(grid.dim);
      if (grid.mode === 'own') gridOwn.restore(grid);
      const loading = recipe.loading || { mode: 'off' };
      setLoadingMode(loading.mode);
      if (loading.mode === 'own') loadingOwn.restore(loading);
      setHide(recipe.hide || []);
      if (recipe.source.kind === 'workshop') setPick({ id: recipe.source.id }); else setWanted(recipe.source);
    })();
    return () => { stopped = true; };
  }, [studioItem]);
  // A background taken from the gallery: its screen at once, its video downloaded here with progress.
  useEffect(() => {
    const preset = pick;
    if (!preset) return;
    const controller = new AbortController();
    setError(''); setFetching({ title: preset.title || '', progress: 0 });
    (async () => {
      // A link from the workshop (?background=id) brings only the id.
      let screen = false;
      const { file: next, origin: from } = await downloadWorkshop(preset, { signal: controller.signal, onProgress: (progress, item) => {
        if (!screen) { screen = true; setAspect(pending.current?.aspect || item.aspect); }
        setFetching({ title: item.title, progress });
      } });
      await choose(next, from);
    })().catch((problem) => { if (!controller.signal.aborted) setError(problem.message, true); })
      .finally(() => { if (!controller.signal.aborted) setFetching(null); });
    return () => controller.abort();
  }, [pick]);
  const target = folderOf(folder);

  // `from`: a workshop background; otherwise the user's own file. A new file starts a new studio
  // background, unless it is the source of the one being changed.
  async function choose(next, from = null) {
    setError(''); setNote('');
    if (!next) return;
    if (next.size > MENU_LIMITS.bytes) return setError(tooBig(next.size));
    const detected = mediaKind(new Uint8Array(await next.slice(0, 32).arrayBuffer()));
    if (!detected) return setError(t('Подойдёт картинка (PNG, JPEG, WebP), GIF или видео (MP4, WebM).'));
    running.current?.abort(); setProgress(null);
    if (!pending.current) { studioId.current = null; setStudio(null); setFrame(MENU_FRAME); }
    else if (wanted && (next.name !== wanted.name || next.size !== wanted.size)) setNote(t('Это не тот файл, из которого собран фон: настройки применены, но отрезок может не совпасть.'));
    if (detected.type !== 'video') pending.current = null;
    setWanted(null);
    setOrigin(from || { kind: 'file', name: next.name, size: next.size, type: detected.type, label: detected.label });
    setFile(next); setKind(detected); setMediaRatio(0); setDuration(0); setSource(URL.createObjectURL(next));
  }
  // The cross on the file card: back to the empty screen (and the gallery pick is forgotten).
  function remove() {
    running.current?.abort(); setProgress(null); setError('');
    setFile(null); setKind(null); setSource(''); setMediaRatio(0); setDuration(0);
    studioId.current = null; pending.current = null; setStudio(null); setWanted(null); setNote(''); setOrigin(null); setPick(null);
    onRemove?.();
  }
  // What each module is now (the page's chips): see MENU_MODULES.
  const ownOn = (mode, own) => mode === 'own' && !!own.file;
  const states = {
    bg: file ? 'changed' : 'default',
    grid: ownOn(gridMode, gridOwn) || gridMode === 'dim' ? 'changed' : file ? 'follow' : 'default',
    hero: ownOn(heroMode, heroOwn) ? 'changed' : heroMode !== 'off' && file ? 'follow' : 'default',
    loading: ownOn(loadingMode, loadingOwn) ? 'changed' : loadingMode !== 'off' && file ? 'follow' : 'default',
    buttons: hide.length || !carnival || !seasonCard || profileLinks ? 'changed' : 'default'
  };
  // The settings the pack is made of (packBackground), for the videos that are there.
  const ownHero = ownOn(heroMode, heroOwn), ownGrid = ownOn(gridMode, gridOwn), ownLoading = ownOn(loadingMode, loadingOwn);
  const packSettings = () => ({ news: { carnival, season: seasonCard }, event: seasonButton, profile: profileLinks, hide,
    hero: ownHero ? { mode: 'own', ...heroOwn.recipe } : { mode: heroMode !== 'off' && file ? 'menu' : 'off' },
    grid: ownGrid ? { mode: 'own', ...gridOwn.recipe } : gridMode === 'dim' ? { mode: 'dim', dim: gridDim } : { mode: 'menu' },
    loading: ownLoading ? { mode: 'own', ...loadingOwn.recipe } : { mode: loadingMode !== 'off' && file ? 'menu' : 'off' } });
  const included = Object.values(states).some((state) => state !== 'default');
  // Sizes before anything is encoded: the pack made with stand-in videos (it is only Panorama text, made
  // in a moment) plus each video — its real size once built, the encoder's aim until then (`estimate`).
  const sizeKey = JSON.stringify([states, hide, carnival, seasonCard, profileLinks, seasonButton, gridDim, file && videoGuess({ kind, duration, piece, crossfade }),
    ownHero && videoGuess(heroOwn), ownGrid && videoGuess(gridOwn), ownLoading && videoGuess(loadingOwn), result && [result.blob?.size, result.video, result.heroVideo, result.gridVideo, result.loadingVideo]]);
  const sizes = useMemo(() => {
    const videos = { bg: file ? { bytes: result?.video ?? videoGuess({ kind, duration, piece, crossfade }), estimate: !result } : null,
      hero: ownHero ? { bytes: result?.heroVideo ?? videoGuess(heroOwn), estimate: !result } : null,
      grid: ownGrid ? { bytes: result?.gridVideo ?? videoGuess(gridOwn), estimate: !result } : null,
      loading: ownLoading ? { bytes: result?.loadingVideo ?? videoGuess(loadingOwn), estimate: !result } : null };
    const dry = (settings) => { try { return packBackground(file ? PLACEHOLDER : null, settings, ownHero ? PLACEHOLDER : null, ownGrid ? PLACEHOLDER : null, ownLoading ? PLACEHOLDER : null)?.size ?? 0; } catch { return 0; } };
    const all = included ? dry(packSettings()) : 0;
    // What the buttons and the darker grid page add: the pack without them, the difference.
    const without = { buttons: { news: { carnival: true, season: true }, profile: false, hide: [] }, grid: { grid: { mode: 'menu' } } };
    const extra = Object.fromEntries(Object.entries(without).map(([id, patch]) => [id, (id === 'grid' ? gridMode === 'dim' : states[id] === 'changed') ? Math.max(1, all - dry({ ...packSettings(), ...patch })) : 0]));
    const plain = all - extra.buttons - extra.grid;
    const placeholders = Object.values(videos).filter(Boolean).length * PLACEHOLDER.length;
    const parts = Object.fromEntries(MENU_MODULES.map((id) => [id, null]));
    for (const [id, video] of Object.entries(videos)) if (video) parts[id] = { ...video };
    for (const [id, bytes] of Object.entries(extra)) if (bytes) parts[id] = { bytes: (parts[id]?.bytes || 0) + bytes, estimate: !!parts[id]?.estimate };
    // The pack's own text (the dashboard and pages) goes with the menu's background, or with the buttons.
    const rest = Math.max(0, plain - placeholders), home = parts.bg ? 'bg' : parts.buttons ? 'buttons' : ['grid', 'hero', 'loading'].find((id) => parts[id] || states[id] === 'changed');
    if (home && parts[home]) parts[home].bytes += rest;
    else if (home) parts[home] = { bytes: rest, estimate: false };
    const bytes = result ? result.blob?.size ?? 0 : all ? all - placeholders + Object.values(videos).reduce((sum, video) => sum + (video?.bytes || 0), 0) : 0;
    return { pak02: bytes ? { bytes, estimate: !result && Object.values(videos).some(Boolean) } : null, parts };
  }, [sizeKey]);
  // The pack for the one file: the videos encoded (each in turn, `progress` 0…1 over all of them), the
  // studio copy saved; the result stays until a setting changes. null when nothing here differs from Dota.
  async function prepare({ delivery = 'file' } = {}) {
    if (!included) return null;
    if (result) return result;
    const controller = new AbortController(); running.current = controller;
    setError(''); setProgress(0);
    try {
      const count = !!file + ownHero + ownGrid + ownLoading; let done = 0;
      const { encodeMenuVideo } = count ? await import('./menu-video.js') : {};
      const encode = async (media, options) => {
        const at = done++;
        return encodeMenuVideo(media, { size: MENU_SIZES[aspect], ...options, signal: controller.signal, onProgress: (value) => setProgress(Math.min(0.99, (at + value) / count)) });
      };
      const encoded = file ? await encode(file, { fit, effects: { blur: blur / 100, dim: dim / 100 }, frame, piece: duration ? piece : null, crossfade }) : null;
      const heroEncoded = ownHero ? await encode(heroOwn.file, heroOwn.encoding) : null;
      const loadingEncoded = ownLoading ? await encode(loadingOwn.file, loadingOwn.encoding) : null;
      const gridEncoded = ownGrid ? await encode(gridOwn.file, gridOwn.encoding) : null;
      const settings = packSettings();
      const blob = packBackground(encoded?.video ?? null, settings, heroEncoded?.video, gridEncoded?.video, loadingEncoded?.video);
      // Kept in the studio (a menu background only): this browser gets the WebMs, a signed-in account the recipe.
      if (encoded) {
        const recipe = { aspect, fit, blur, dim, frame, clean, news: settings.news, event: seasonButton, profile: profileLinks, folder, delivery, piece: duration ? piece : null, crossfade: duration ? crossfade : 0, source: origin, hero: settings.hero, grid: settings.grid, loading: settings.loading, hide };
        saving.current = saveBuiltBackground({ id: studioId.current, recipe, video: encoded.video, heroVideo: heroEncoded?.video, gridVideo: gridEncoded?.video, loadingVideo: loadingEncoded?.video, codec: encoded.codec, seconds: encoded.seconds });
        saving.current.then((record) => { studioId.current = record.id; setStudio({ id: record.id, name: record.name, saved: true, account: record.account }); })
          .catch(() => setStudio((current) => ({ ...current, failed: true })));
      }
      const url = (video) => video ? URL.createObjectURL(new Blob([video], { type: 'video/webm' })) : null;
      const made = { blob, webm: encoded?.video ?? null, aspect, url: url(encoded?.video), seconds: encoded?.seconds ?? 0, trimmed: encoded?.trimmed ?? false, codec: encoded?.codec ?? '', video: encoded?.video.length ?? null,
        heroVideo: heroEncoded?.video.length ?? null, gridVideo: gridEncoded?.video.length ?? null, loadingVideo: loadingEncoded?.video.length ?? null,
        heroUrl: url(heroEncoded?.video), gridUrl: url(gridEncoded?.video), loadingUrl: url(loadingEncoded?.video) };
      setResult(made);
      return made;
    } catch (e) {
      if (controller.signal.aborted) throw Object.assign(new Error(t('Сборка отменена.')), { aborted: true });
      const problem = e?.message || t('Не получилось собрать фон. Попробуй другой файл.');
      setError(problem, true);
      throw Object.assign(new Error(problem), { shown: true });
    } finally { if (running.current === controller) running.current = null; setProgress(null); }
  }
  // After the one file went out: every workshop background in it counts once, the studio copy remembers the way.
  function delivered({ delivery }) {
    const counted = new Set([file && origin, ownHero && heroOwn.origin, ownGrid && gridOwn.origin, ownLoading && loadingOwn.origin]
      .filter((from) => from?.kind === 'workshop').map((from) => from.id));
    for (const id of counted) countDownload('background', id);
    if (studioId.current && file) rememberDownload(studioId.current, { folder, delivery }).catch(() => {});
  }
  // «Опубликовать в мастерскую»: the built video, built first when there is none.
  async function publish() {
    try { if (!result?.webm) await prepare(); setShare(true); } catch { /* The error is shown in the section. */ }
  }
  // «Сбросить» of each module: back to what Dota has (the pages that follow the menu go back to it).
  function reset(id) {
    if (id === 'bg') remove();
    if (id === 'grid') { setGridMode('menu'); setGridDim(55); gridOwn.remove(); }
    if (id === 'hero') { setHeroMode('menu'); heroOwn.remove(); }
    if (id === 'loading') { setLoadingMode('off'); loadingOwn.remove(); }
    if (id === 'buttons') { setHide([]); setCarnival(true); setSeasonCard(true); setProfileLinks(false); }
  }
  // A line for each module: what it is now (the page's rows and its list of what goes into the file).
  const ownLine = (own) => own.origin?.kind === 'workshop' ? t('«{title}» из мастерской', { title: own.origin.title }) : own.file ? own.file.name : '';
  const clip = (media) => media.kind?.type === 'video' && media.duration ? t('видео {seconds} с', { seconds: Math.round(pieceLength(media.piece, media.crossfade)) }) : media.kind?.label || '';
  const summary = {
    bg: file ? [ownLine({ origin, file }), clip({ kind, duration, piece, crossfade })].filter(Boolean).join(' · ') : '',
    grid: ownGrid ? t('Свой фон: {name}', { name: ownLine(gridOwn) }) : gridMode === 'dim' ? (file ? t('Фон меню, темнее на {percent}%', { percent: gridDim }) : t('Фон Dota темнее на {percent}%', { percent: gridDim })) : file ? t('Тот же фон, что в меню') : '',
    hero: ownHero ? t('Свой фон: {name}', { name: ownLine(heroOwn) }) : states.hero === 'follow' ? t('Тот же фон, что в меню') : '',
    loading: ownLoading ? t('Свой фон: {name}', { name: ownLine(loadingOwn) }) : states.loading === 'follow' ? t('Тот же фон, что в меню') : '',
    buttons: [hide.length && t('скрыто кнопок: {count}', { count: hide.length }), (!carnival || !seasonCard) && t('скрыто карточек: {count}', { count: !carnival + !seasonCard }), profileLinks && t('Stratz и Dotabuff в профилях')].filter(Boolean).join(', ')
  };
  if (summary.buttons) summary.buttons = summary.buttons[0].toUpperCase() + summary.buttons.slice(1);

  // The page shown: its mode and its own background, when it has one.
  const view = (where) => where === 'hero' ? { mode: heroMode, own: heroOwn, built: result?.heroUrl, where: t('за героем') }
    : where === 'grid' ? { mode: gridMode, own: gridOwn, built: result?.gridUrl, where: t('под сеткой') }
    : where === 'loading' ? { mode: loadingMode, own: loadingOwn, built: result?.loadingUrl, where: t('на экране загрузки') } : null;
  const second = view(page);
  const ownShown = second?.mode === 'own' ? second.built || second.own.source : '';
  const video = kind?.type === 'video', shown = result?.url || source;
  // The media is always contained; «Заполнить» scales it up by the cover/contain ratio, so switching
  // the fit or the screen shape animates instead of jumping.
  const [screenWidth, screenHeight] = MENU_SIZES[aspect], screenRatio = screenWidth / screenHeight;
  const look = menuLook({ blur: blur / 100, dim: dim / 100 });
  const mediaFrame = mediaRatio ? framePlacement(screenRatio, mediaRatio, fit, look.zoom, frame) : WHOLE;
  const own = second?.own, ownLook = own && menuLook({ blur: own.blur / 100, dim: own.dim / 100 });
  const ownFramed = own?.ratio ? framePlacement(screenRatio, own.ratio, own.fit, ownLook.zoom, own.frame) : WHOLE;
  // Framing by dragging the picture in the preview: the page's own background (the menu's on «Главное
  // меню», the own file on a second page), once it is there. The hero on the hero page takes the drags
  // that start on him (hero3d/scene.js stops them).
  const frameTarget = !second ? (shown && mediaRatio && !result ? { place: mediaFrame, frame, set: setFrame } : null)
    : second.mode === 'own' && ownShown && own.ratio && !second.built ? { place: ownFramed, frame: own.frame, set: own.setFrame } : null;
  const frameDown = (event) => {
    if (!frameTarget || event.button !== 0 || progress !== null) return;
    event.preventDefault();  // no text selection, no dragging of the picture itself
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    setFraming({ x: event.clientX, y: event.clientY, box, ...frameTarget });
  };
  const frameMove = (event) => {
    if (!framing) return;
    // The picture follows the pointer: a shift of d screens moves the place by d / (1 − size).
    const shift = (d, size, value) => (Math.abs(1 - size) < 1e-3 ? value : value + d / (1 - size));
    const { place, frame: from, box } = framing;
    framing.set(menuFrame({ ...from, x: shift((event.clientX - framing.x) / box.width, place.bw ?? place.w, from.x), y: shift((event.clientY - framing.y) / box.height, place.bh ?? place.h, from.y) }));
  };
  const frameUp = () => setFraming(null);
  const drop = { onDragOver: (event) => { event.preventDefault(); setDragging(true); }, onDragLeave: () => setDragging(false),
    onDrop: (event) => { event.preventDefault(); setDragging(false); (second?.mode === 'own' ? second.own.choose : choose)(event.dataTransfer.files[0]); } };
  // The menu's video tells its length: the piece fits it (a studio recipe's comes back).
  const onMeta = (element) => {
    if (element.videoWidth && element.videoHeight) setMediaRatio(element.videoWidth / element.videoHeight);
    if (!Number.isFinite(element.duration)) return;
    const length = element.duration, restored = pending.current;
    setDuration(length); setPiece(fitPiece(restored?.piece || { start: 0, end: length }, length, 'start'));
    if (restored) { setCrossfade(restored.crossfade); pending.current = null; }
  };
  // «Оставить этот фон здесь»: the menu's background becomes the page's own, with its settings.
  const keep = (where) => {
    const own = { hero: heroOwn, grid: gridOwn, loading: loadingOwn }[where];
    ({ hero: setHeroMode, grid: setGridMode, loading: setLoadingMode })[where]('own');
    own.adopt({ file, origin, fit, blur, dim, frame, piece: duration ? piece : null, crossfade });
  };
  return {
    page, file, kind, source, aspect, setAspect, fit, setFit, blur, setBlur, dim, setDim, frame, setFrame, framing, carnival, setCarnival, seasonCard, setSeasonCard, seasonButton, setSeasonButton,
    profileLinks, setProfileLinks, folder, setFolder, target, duration, piece, setPiece, crossfade, setCrossfade, mediaRatio, setMediaRatio, progress, result, error, failed, setError,
    sources, setSources, share, setShare, dragging, fetching, input, playhead, seek, origin, studio, wanted, note, auth, heroMode, setHeroMode, gridMode, setGridMode, gridDim, setGridDim,
    picking, setPicking, browsing, setBrowsing, heroOwn, gridOwn, loadingOwn, preview, loadingMode, setLoadingMode, hide, setHide, saving, setPick,
    states, summary, sizes, included, choose, remove, reset, prepare, delivered, publish, cancel: () => running.current?.abort(), view, second, ownShown, video, shown, look,
    mediaFrame, ownFramed, ownLook, screenRatio, frameTarget, frameDown, frameMove, frameUp, drop, onMeta, keep, still: !!kind?.still
  };
}

const WHOLE = { x: 0, y: 0, w: 1, h: 1 };
// The picture where the video will have it (framePlacement, as menu-video.js draws it); until its
// size is known, or once the video is built (it is the screen itself), over the whole screen.
const placed = (place) => ({ left: `${place.x * 100}%`, top: `${place.y * 100}%`, width: `${place.w * 100}%`, height: `${place.h * 100}%`,
  ...(place.rotate || place.flipX || place.flipY ? { transform: `rotate(${place.rotate}deg) scale(${place.flipX ? -1 : 1}, ${place.flipY ? -1 : 1})` } : {}) });

// ——— The preview of a menu scene: the background as the video will have it, under a copy of the page.
export function MenuScreen({ bg, page }) {
  const { result, shown, video, source, duration, piece, crossfade, seek, playhead, look, second, ownShown, fetching } = bg;
  const own = second?.own;
  const mediaStyle = { ...placed(result ? WHOLE : bg.mediaFrame), '--blur': result ? 0 : look.sigma / 1080 };
  const ownStyle = own && { ...placed(second.built ? WHOLE : bg.ownFramed), '--blur': second.built ? 0 : bg.ownLook.sigma / 1080 };
  // Which picture lies under the page's interface: the menu's (also when darker), or the page's own.
  const showsMenu = !second || second.mode === 'menu' || second.mode === 'dim';
  const loadingNow = fetching || (second?.mode === 'own' ? own.fetching : null);
  const heroOff = page === 'hero' && (bg.heroMode === 'off' || (bg.heroMode === 'menu' && !bg.file));
  const loadingOff = page === 'loading' && (bg.loadingMode === 'off' || (bg.loadingMode === 'menu' && !bg.file));
  return <div className={`custom-screen${page !== 'menu' ? ` is-${page}` : ''}${bg.frameTarget ? ' can-frame' : ''}${bg.framing ? ' is-framing' : ''}`} style={{ '--ratio': bg.screenRatio }}
    onPointerDown={bg.frameDown} onPointerMove={bg.frameMove} onPointerUp={bg.frameUp} onPointerCancel={bg.frameUp} onDragStart={(event) => event.preventDefault()}>
    {/* A second page shows the menu's background (darker under the grid), a video of its own, or Valve's picture, under a copy of the page. */}
    {showsMenu && !heroOff && !loadingOff && <>
      {shown ? result?.url ? <video key={shown} className="custom-media" src={shown} autoPlay loop muted playsInline/>
        : video ? <LoopPreview key={source} src={source} piece={duration ? piece : { start: 0, end: 1e9 }} crossfade={duration ? crossfade : 0} style={mediaStyle}
          onMeta={bg.onMeta} seek={seek} onTime={(t) => { if (playhead.current && duration) playhead.current.style.left = `${(t / duration) * 100}%`; }}/>
        : <img key={shown} className="custom-media" src={shown} alt="" draggable={false} style={mediaStyle} onLoad={(event) => bg.setMediaRatio(event.target.naturalWidth / event.target.naturalHeight)}/>
        : !fetching && (page === 'menu' ? <div className="custom-drop"><button type="button" className="custom-drop-pick" onClick={() => bg.input.current?.click()}><Icon name="plus"/><strong>{t('Перетащи сюда картинку, GIF или видео')}</strong><span>{t('или нажми, чтобы выбрать файл')}</span></button>
          <p className="custom-drop-sources"><span>{t('Где взять:')}</span><button type="button" className="is-workshop" onClick={() => bg.setBrowsing('menu')}>{t('Готовые в мастерской')}</button>{SOURCES().map((source) => <a key={source.name} href={source.url} target="_blank" rel="noreferrer">{source.name}</a>)}</p></div>
          : <div className="custom-dota-default"/>)}
      {shown && <div className="custom-veil" style={{ opacity: result ? 0 : look.veil }}/>}
    </>}
    {page === 'grid' && <div className="custom-veil custom-grid-veil" style={{ opacity: bg.gridMode === 'dim' ? (bg.gridDim / 100) * GRID_DIM.max : 0 }}/>}
    {second?.mode === 'own' && (ownShown ? second.built ? <video key={ownShown} className="custom-media" src={ownShown} autoPlay loop muted playsInline/>
      : own.video ? <LoopPreview key={own.source} src={own.source} piece={own.duration ? own.piece : { start: 0, end: 1e9 }} crossfade={own.duration ? own.crossfade : 0} style={ownStyle}
        seek={own.seek} onMeta={own.onMeta} onTime={(t) => { if (own.playhead.current && own.duration) own.playhead.current.style.left = `${(t / own.duration) * 100}%`; }}/>
      : <img key={ownShown} className="custom-media" src={ownShown} alt="" draggable={false} style={ownStyle} onLoad={(event) => own.setRatio(event.target.naturalWidth / event.target.naturalHeight)}/>
      : <div className="custom-drop"><button type="button" className="custom-drop-pick" onClick={() => own.input.current?.click()}><Icon name="plus"/><strong>{page === 'grid' ? t('Фон под сеткой') : page === 'hero' ? t('Фон за героем') : t('Фон экрана загрузки')}</strong><span>{t('Перетащи картинку, GIF или видео или нажми, чтобы выбрать')}</span></button></div>)}
    {second?.mode === 'own' && ownShown && <div className="custom-veil" style={{ opacity: second.built ? 0 : bg.ownLook.veil }}/>}
    {heroOff && <div className="custom-hero-default"/>}
    {loadingOff && <div className="custom-loading-default"><span>{t('Логотип Dota или твой экран загрузки из Арсенала')}</span></div>}
    {/* The hero can be turned once there is a background behind it; until then it stands behind the «+». */}
    {page === 'hero' ? <DotaHeroPage interactive={heroOff || Boolean(bg.heroMode === 'own' ? ownShown : shown)}/>
      : page === 'grid' ? <DotaGridPage grid={bg.preview.grid} name={bg.preview.name}/>
      : page === 'loading' ? <DotaLoadingPage/>
      : <DotaMenu news={{ carnival: bg.carnival, season: bg.seasonCard }} event={SEASON_EVENT && bg.file ? bg.seasonButton : null} hide={bg.hide}/>}
    {loadingNow && <div className="custom-fetching" role="status"><b>{loadingNow.title ? t('Загружаем «{title}»', { title: loadingNow.title }) : t('Загружаем фон…')}</b><span><i style={{ width: `${Math.round(loadingNow.progress * 100)}%` }}/></span></div>}
  </div>;
}

// Under the preview: the piece of the video (the page's own background, or the menu's), or a caption.
export function MenuUnder({ bg, page }) {
  const { second, result, studio, auth } = bg, own = second?.own;
  if (second?.mode === 'own' && own.video && own.duration > 0 && !second.built)
    return <TrimBar duration={own.duration} piece={own.piece} crossfade={own.crossfade} playhead={own.playhead} onChange={own.setPiece} onCrossfade={own.setCrossfade} onSeek={(t) => own.seek.current?.(t)}/>;
  if (!second && bg.video && bg.duration > 0 && !result)
    return <TrimBar duration={bg.duration} piece={bg.piece} crossfade={bg.crossfade} playhead={bg.playhead} onChange={bg.setPiece} onCrossfade={bg.setCrossfade} onSeek={(t) => bg.seek.current?.(t)}/>;
  const ready = { ready: <b>{t('Готовый фон')}</b> };
  const caption = page === 'grid'
    ? bg.gridMode === 'own' && result?.gridUrl ? rich(t('{ready} — так он будет под сеткой.'), ready) : [{ menu: bg.file ? t('Под сеткой — фон главного меню, как в Dota сейчас.') : t('Под сеткой — фон Dota.'), dim: t('Фон под сеткой темнее, чтобы сетка не сливалась.'), own: t('Так фон будет под сеткой героев на странице «Герои».') }[bg.gridMode], bg.preview.name && t('Сетка: «{name}».', { name: bg.preview.name })].filter(Boolean).join(' ')
    : page === 'loading' ? (bg.states.loading === 'default' ? t('Экран загрузки останется как в Dota.') : result?.loadingUrl ? rich(t('{ready} — так он будет на экране загрузки.'), ready) : t('Так фон будет на экране загрузки матча (схематично: советы и полоса загрузки в Dota свои).'))
    : page === 'hero' ? (bg.states.hero === 'default' ? t('За героем останется картинка Dota. Героя можно крутить мышкой.') : result?.heroUrl ? rich(t('{ready} — так он будет за героем.'), ready) : t('Так фон будет за героем на странице «Герои» → «Снаряжение». Героя можно крутить мышкой.'))
    : result?.url ? <>{rich(t('{ready} — ровно то видео, что внутри файла.'), ready)}{studio?.saved ? auth && !auth.loading && !auth.user && !studio.account
      ? <> {rich(t('{saved} только в этом браузере. {login}, чтобы он не потерялся.'), { saved: <a href={`${STUDIO_PATH}&show=backgrounds`}>{t('Сохранён в студии')}</a>,
        login: <button type="button" className="catalog-link" onClick={() => auth.requestLogin(t('Войди, чтобы фон сохранился в аккаунте: его настройки не пропадут вместе с браузером и откроются на другом компьютере.'))}>{t('Войди')}</button> })}</>
      : <> <a href={`${STUDIO_PATH}&show=backgrounds`}>{t('Сохранён в студии')}</a>.</> : studio?.failed ? ` ${t('Сохранить в студии не получилось.')}` : ''}</>
    : bg.shown ? t('Так будет главное меню Dota. Картинку можно тянуть, чтобы выбрать кадр.') : t('Главное меню Dota с выбранными пропорциями экрана.');
  return <p className="custom-caption">{caption}</p>;
}

// A small live copy of a menu scene for the page's scene switcher: the background the page will have (a
// still frame) under the page's own pictures; the hero page without its 3D hero.
export function MenuThumb({ bg, page }) {
  const second = bg.view(page), own = second?.own;
  const off = (page === 'hero' && (bg.heroMode === 'off' || (bg.heroMode === 'menu' && !bg.file))) || (page === 'loading' && (bg.loadingMode === 'off' || (bg.loadingMode === 'menu' && !bg.file)));
  const ownMedia = second?.mode === 'own' && own.file ? { url: second.built || own.source, video: !!second.built || own.video } : null;
  const media = off ? null : ownMedia || (bg.shown ? { url: bg.shown, video: !!bg.result?.url || bg.video } : null);
  return <span className="cz-thumb-screen" aria-hidden="true">
    {media ? media.video ? <video src={media.url} muted playsInline preload="metadata"/> : <img src={media.url} alt=""/> : <i className={`cz-thumb-empty is-${page}`}/>}
    {page === 'grid' && bg.gridMode === 'dim' && <i className="cz-thumb-veil" style={{ opacity: (bg.gridDim / 100) * GRID_DIM.max }}/>}
    {page === 'hero' ? <DotaHeroPage interactive={false} model={false}/> : page === 'grid' ? <DotaGridPage grid={null}/> : page === 'loading' ? <DotaLoadingPage/>
      : <DotaMenu news={{ carnival: bg.carnival, season: bg.seasonCard }} hide={bg.hide}/>}
  </span>;
}

// ——— The page's sections: each the fields of one module.
const MenuError = ({ bg }) => bg.error ? <Notice error report={bg.failed}>{bg.error}</Notice> : null;
// «Готовые в мастерской»: three popular backgrounds for this screen and the whole list in a window.
function WorkshopRow({ bg }) {
  const { items } = useBackgrounds({ sort: 'popular', aspect: bg.aspect });
  const chosen = bg.origin?.kind === 'workshop' ? bg.origin.id : null;
  return <Field label={t('Готовые в мастерской')} aside={<a className="catalog-link" href={`${CATALOG_PATH}?backgrounds`}>{t('Мастерская')}</a>}>
    <div className="cz-picks">{(items || [null, null, null]).slice(0, 3).map((item, i) => item
      ? <button key={item.id} type="button" aria-pressed={chosen === item.id} title={item.title} disabled={!!bg.fetching} onClick={() => bg.setPick(item)}><img src={backgroundMedia(item.id, 'poster.jpg')} alt={item.title} loading="lazy"/></button>
      : <span key={i} className="cz-picks-empty"/>)}
      <button type="button" className="cz-picks-more" onClick={() => bg.setBrowsing('menu')}>{t('Все фоны')}</button></div>
  </Field>;
}
export function BackgroundFields({ bg }) {
  const { file, kind } = bg;
  return <>
    {bg.wanted && <Notice>{rich(t('Чтобы изменить «{title}», выбери исходный файл: {name}, {size}. Настройки фона уже стоят.'), { title: bg.studio?.name, name: <b>{bg.wanted.name}</b>, size: fileSize(bg.wanted.size) })}</Notice>}
    {bg.note && <Notice>{bg.note}</Notice>}
    <MenuError bg={bg}/>
    <Field label={t('Файл')} hint={!file && <>{t('PNG, JPEG, WebP, GIF, MP4, WebM до {size} МБ. Из видео выбираешь отрезок до {seconds} с на шкале под превью, звук убирается.', { size: megabytes(MENU_LIMITS.bytes), seconds: MENU_LIMITS.seconds })} <button type="button" className="catalog-link" onClick={() => bg.setSources(true)}>{t('Где взять фон?')}</button></>}>
      {file ? <div className="custom-file-card">{bg.origin?.kind === 'workshop' ? <img className="custom-file-poster" src={backgroundMedia(bg.origin.id, 'poster.jpg')} alt=""/> : <span className="custom-file-kind">{kind.label}</span>}<span className="custom-file-name"><b title={file.name}>{bg.origin?.kind === 'workshop' ? bg.origin.title : file.name}</b><small>{[bg.origin?.kind === 'workshop' && t('из мастерской'), bg.duration ? t('видео {seconds} с', { seconds: Math.round(bg.duration) }) : kind.label, fileSize(file.size)].filter(Boolean).join(' · ')}</small></span>
        <button type="button" className="catalog-icon custom-file-remove" onClick={bg.remove} aria-label={t('Убрать фон')} title={t('Убрать фон')}><Icon name="close"/></button></div>
        : <button type="button" className="custom-file-empty" disabled={!!bg.fetching} onClick={() => bg.input.current?.click()}><Icon name="plus"/>{bg.fetching ? t('Загружаем…') : t('Свой файл: картинка, GIF или видео')}</button>}
    </Field>
    <WorkshopRow bg={bg}/>
    {file && <button type="button" className="custom-file-empty" disabled={!!bg.fetching} onClick={() => bg.input.current?.click()}><Icon name="plus"/>{t('Свой файл: картинка, GIF или видео')}</button>}
    <Field label={t('Экран')} aside={ASPECTS()[bg.aspect]}><Segmented label={t('Экран')} value={bg.aspect} onChange={bg.setAspect} options={Object.keys(ASPECTS()).map((value) => [value, value])}/></Field>
    {file && <Field label={t('Картинка')} aside={FITS()[bg.fit]}><Segmented label={t('Как вписать')} value={bg.fit} onChange={bg.setFit} options={FIT_OPTIONS()}/>
      <Effects blur={bg.blur} onBlur={bg.setBlur} dim={bg.dim} onDim={bg.setDim} frame={bg.frame} onFrame={bg.setFrame}/></Field>}
    {file && SEASON_EVENT && <label className="custom-toggle"><input type="checkbox" role="switch" checked={bg.seasonButton} onChange={(event) => bg.setSeasonButton(event.target.checked)}/><span><b>{t('Кнопка «{name}»', { name: t(SEASON_EVENT.name) })}</b><small>{t('Ивент с наградами в один клик — нажми в превью')}</small></span></label>}
    {file && <p className="custom-hint">{bg.still ? t('Картинки в мастерскую не публикуются: только GIF или видео.')
      : <button type="button" className="catalog-link custom-publish" disabled={bg.progress !== null || !!bg.fetching} onClick={bg.publish}><Icon name="upload"/>{t('Опубликовать в мастерскую')}</button>}</p>}
  </>;
}
export function GridFields({ bg }) {
  return <>
    <MenuError bg={bg}/>
    <Field label={t('Под сеткой')} hint={GRID_HINTS()[bg.gridMode]}><Segmented label={t('Фон под сеткой')} value={bg.gridMode} onChange={bg.setGridMode} options={GRID_MODES()}/></Field>
    {bg.gridMode === 'dim' && <div className="custom-effects is-one"><Slider label={t('Насколько темнее')} value={bg.gridDim} onChange={bg.setGridDim}/></div>}
    {bg.gridMode === 'own' && <OwnFields own={bg.gridOwn} aspect={bg.aspect} where={t('под сеткой')} onWorkshop={() => bg.setBrowsing('grid')}/>}
    {bg.gridMode !== 'own' && bg.file && <Keep onKeep={() => bg.keep('grid')}/>}
    <Field label={t('Сетка в превью')} hint={t('Только чтобы видеть, не сливается ли она с фоном. В файл она не попадает.')}><GridChoice preview={bg.preview} onOpen={() => bg.setPicking(true)}/></Field>
  </>;
}
export function HeroFields({ bg }) {
  return <>
    <MenuError bg={bg}/>
    <Field label={t('За героем')} hint={HERO_HINTS()[bg.heroMode]}><Segmented label={t('Фон за героем')} value={bg.heroMode} onChange={bg.setHeroMode} options={HERO_MODES()}/></Field>
    {bg.heroMode === 'own' && <OwnFields own={bg.heroOwn} aspect={bg.aspect} where={t('за героем')} onWorkshop={() => bg.setBrowsing('hero')}/>}
    {bg.heroMode === 'menu' && bg.file && <Keep onKeep={() => bg.keep('hero')}/>}
    {!bg.file && bg.heroMode === 'menu' && <p className="custom-hint">{t('Пока в меню фон Dota, здесь тоже всё как в Dota. Выбери фон меню или свой фон для этой страницы.')}</p>}
  </>;
}
export function LoadingFields({ bg }) {
  return <>
    <MenuError bg={bg}/>
    <Field label={t('Пока грузится матч')} hint={LOADING_HINTS()[bg.loadingMode]}><Segmented label={t('Экран загрузки')} value={bg.loadingMode} onChange={bg.setLoadingMode} options={LOADING_MODES()}/></Field>
    {bg.loadingMode === 'own' && <OwnFields own={bg.loadingOwn} aspect={bg.aspect} where={t('на экране загрузки')} onWorkshop={() => bg.setBrowsing('loading')}/>}
    {bg.loadingMode === 'menu' && bg.file && <Keep onKeep={() => bg.keep('loading')}/>}
    {!bg.file && bg.loadingMode === 'menu' && <p className="custom-hint">{t('Пока в меню фон Dota, здесь тоже всё как в Dota. Выбери фон меню или свой фон для этой страницы.')}</p>}
    <p className="custom-hint">{t('Ещё не проверено в игре — если что-то не так, напиши в чат.')}</p>
  </>;
}
export function ButtonsFields({ bg }) {
  return <>
    <Field label={t('Кнопки сверху')} aside={t('нажми, чтобы скрыть')}>
      <div className="catalog-tags custom-hide" role="group" aria-label={t('Какие кнопки верхней панели скрыть')}>{HIDE_OPTIONS().map(([key, label]) =>
        <button key={key} type="button" aria-pressed={bg.hide.includes(key)} onClick={() => bg.setHide((value) => value.includes(key) ? value.filter((x) => x !== key) : [...value, key])}>{bg.hide.includes(key) && <Icon name="eyeOff" size={14}/>}{label}</button>)}</div>
      {bg.hide.length > 0 && <p className="custom-hint">{t('Скрытые кнопки пропадут из верхней панели Dota, остальные сдвинутся. «Играть», настройки и выход не скрываются. Ещё не проверено в игре.')}</p>}
    </Field>
    <div className="custom-switches">
      {/* The news column's two cards, each its own switch (2026-10-08): Dark Carnival and Valve's own «Диковинки Квортеро». */}
      <label className="custom-toggle"><input type="checkbox" role="switch" checked={bg.carnival} onChange={(event) => bg.setCarnival(event.target.checked)}/><span><b>{t('Карточка Dark Carnival на главной')}</b><small>{t('Выключи, чтобы она не закрывала фон')}</small></span></label>
      <label className="custom-toggle"><input type="checkbox" role="switch" checked={bg.seasonCard} onChange={(event) => bg.setSeasonCard(event.target.checked)}/><span><b>{t('Карточка «Диковинки Квортеро» на главной')}</b><small>{t('Выключи, чтобы она не закрывала фон')}</small></span></label>
      <Peek src={profilePreview} width={480} height={144} caption={t('Так кнопки встанут в профиле любого пользователя Dota, под статусом: открывают его страницу на Stratz и Dotabuff.')}>
        <label className="custom-toggle"><input type="checkbox" role="switch" checked={bg.profileLinks} onChange={(event) => bg.setProfileLinks(event.target.checked)}/><span><b>{t('Кнопки Stratz и Dotabuff в профилях')}</b><small>{t('Наведи, чтобы увидеть, как это выглядит')}</small></span></label>
      </Peek>
    </div>
  </>;
}

// The file inputs and the windows of the menu's modules; mounted whatever section is open.
export function MenuWindows({ bg }) {
  const where = { menu: t('для меню'), hero: t('за героем'), grid: t('под сеткой'), loading: t('на экране загрузки') };
  return <>
    <input ref={bg.input} type="file" accept={ACCEPT} className="catalog-file" onChange={(event) => { bg.choose(event.target.files[0]); event.target.value = ''; }}/>
    {[bg.heroOwn, bg.gridOwn, bg.loadingOwn].map((one, i) => <input key={i} ref={one.input} type="file" accept={ACCEPT} className="catalog-file" onChange={(event) => { one.choose(event.target.files[0]); event.target.value = ''; }}/>)}
    {bg.sources && <Sources onClose={() => bg.setSources(false)}/>}
    {bg.picking && <GridPicker chosen={bg.preview.choice} onChoose={bg.preview.choose} onClose={() => bg.setPicking(false)}/>}
    {bg.browsing && <BackgroundPicker aspect={bg.aspect} where={where[bg.browsing]} onClose={() => bg.setBrowsing(null)}
      onChoose={(item) => { if (bg.browsing === 'menu') bg.setPick(item); else ({ hero: bg.heroOwn, grid: bg.gridOwn, loading: bg.loadingOwn })[bg.browsing].pickWorkshop(item); bg.setBrowsing(null); }}/>}
    {bg.share && bg.result?.webm && <ShareBackground video={bg.result.webm} aspect={bg.result.aspect} onSent={(published) => bg.saving.current?.then((record) => markPublished(record.id, published)).catch(() => {})} onClose={() => bg.setShare(false)}/>}
  </>;
}
// The language of the user's Dota, for the install window: the files go to dota_russian either way;
// an English Dota needs a word on why.
export function DotaLanguage({ bg }) {
  return <div className="custom-field"><div className="custom-inline"><span className="custom-label">{t('Язык Dota')}</span><Segmented label={t('Язык Dota')} value={bg.target.client} onChange={bg.setFolder} options={[['russian', 'Русский'], ['english', 'English']]}/></div>
    {bg.target.client === 'english' && <p className="custom-hint">{t('Файлы тоже лягут в dota_russian: моды Dota читает только из папки языка озвучки. Команда PowerShell включит русскую озвучку, интерфейс останется английским.')}</p>}</div>;
}
