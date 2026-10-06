import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Modal, Notice, SegmentSwitch } from '../catalog/Common.jsx';
import { GRID_DIM, MENU_FRAME, MENU_FRAME_ZOOM, MENU_LIMITS, MENU_SIZES, fitPiece, framePlacement, mediaKind, menuFrame, menuLook } from '../../scripts/menu-background.mjs';
import menuMeta from '../../assets/dota-menu/meta.json';
import { SEASON_EVENT, downloadPack, folderOf, packBackground, removeCommand } from './background-pack.js';
import { getBackground } from '../../scripts/background-library.mjs';
import { claimBuiltBackground, markPublished, pullRecipes, rememberDownload, saveBuiltBackground } from '../studio-backgrounds.js';
import { useAccount } from '../catalog/Account.jsx';
import { CopyField, Field, InstallWindow, Segmented, rich } from './CustomizeApp.jsx';
import { BackgroundSteps } from './BackgroundSteps.jsx';
import DotaMenu from './DotaMenu.jsx';
import DotaHeroPage from './DotaHeroPage.jsx';
import DotaGridPage from './DotaGridPage.jsx';
import { GridChoice, GridPicker, usePreviewGrid } from './GridPicker.jsx';
import { LoopPreview, TrimBar } from './Trim.jsx';
import { ShareBackground } from './ShareBackground.jsx';
import profilePreview from '../../assets/dota-menu/ui/profile-preview.webp';
import { backgroundMedia } from '../catalog/BackgroundGallery.jsx';
import { CATALOG_PATH, STUDIO_PATH, catalogAPI, countDownload } from '../catalog/api.js';
import { countAction } from '../site-stats.js';
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
// Which background the panel edits and the preview shows: the main menu, the one under the hero grid
// on the «Герои» page (1.6.4; scripts/menu-background.mjs GRID_PAGE) or the one behind the hero on
// the hero page («За героем»; HERO_PAGE). Under the grid: the menu's background (default), the same
// darker, or a video of its own. Behind the hero: the menu video (default), a video of its own, or
// Valve's picture stays.
const PAGES = () => [['menu', t('Меню')], ['grid', t('Сетка героев')], ['hero', t('За героем')]];
const GRID_MODES = () => [['menu', t('Как в меню')], ['dim', t('Темнее')], ['own', t('Свой фон')]];
const GRID_HINTS = () => ({ menu: t('Под сеткой — фон главного меню.'), dim: t('Фон меню под сеткой темнее. Видео второй раз не собирается.'), own: t('Под сеткой — свой фон, с теми же настройками, что у меню.') });
const HERO_MODES = () => [['menu', t('Как в меню')], ['own', t('Свой фон')], ['off', t('Как в Dota')]];
const HERO_HINTS = () => ({ menu: t('За героем крутится тот же фон, что в главном меню.'), own: t('За героем — свой фон, с теми же настройками, что у меню.'), off: t('Страница героя не меняется: за героем картинка Dota.') });
const TITLES = () => ({ menu: t('Фон главного меню'), grid: t('Фон под сеткой героев'), hero: t('Фон за героем') });
const LEADS = () => ({
  menu: t('Картинка, GIF или видео — готовый файл для Dota. Всё собирается в браузере, файл никуда не загружается.'),
  grid: t('Страница «Герои» с твоей сеткой: чтобы сетка не сливалась с фоном. Собирается в тот же файл, что и главное меню.'),
  hero: t('На странице героя — «Герои» → «Снаряжение», за моделью героя. Собирается в тот же файл, что и главное меню.')
});
// How the result is handed over: the bare file, or with a PowerShell command that installs it
// (background-pack.js downloadPack; the font: FontPicker.jsx).
export const DELIVERY = () => [['file', t('Только файл')], ['command', t('Командой PowerShell')]];
const megabytes = (bytes) => (bytes / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1 });
// A file's size for people: kilobytes under a megabyte, so a small picture is not «0 МБ».
const fileSize = (bytes) => bytes < 1_000_000 ? t('{size} КБ', { size: Math.max(1, Math.round(bytes / 1000)) }) : t('{size} МБ', { size: megabytes(bytes) });
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
function MenuVersion() {
  return <p className="catalog-muted">{t('Файлы меню — от обновления Dota {date}.', { date: updateDate(menuMeta.date) })}</p>;
}

// How to install: the command (it also makes Russian the audio language), or by hand (BackgroundSteps).
function Install({ folder, delivery, handed, onClose }) {
  const target = folderOf(folder), english = target.client === 'english';
  const voice = english ? t('Интерфейс останется английским, а герои без русского пакета озвучки — с английскими голосами.') : '';
  // The command of the pack just sent to the site (its fingerprint is in it); before a build, a word on it.
  if (delivery === 'command') return <InstallWindow title={t('Как установить фон')} onClose={onClose}><ol>
    <li>{handed ? t('Фон сохранён на GridStudio на 7 дней — команда скачает именно его, ничего искать не нужно.') : t('Собери фон: он сразу отправится на GridStudio, а здесь появится команда для него.')}</li>
    {handed && <li>{t('Скопируй команду:')}<CopyField value={handed.command}/></li>}
    <li>{rich(t('Открой PowerShell ({key}, набери PowerShell, {enter}), вставь команду и нажми {enter}.'), { key: <kbd>Win</kbd>, enter: <kbd>Enter</kbd> })}</li>
    <li>{t('Она сама скачает этот фон, найдёт Dota через Steam, попросит закрыть игру, положит фон в dota_russian и включит русскую озвучку: только с ней Dota читает папку с фоном.')} {voice}</li>
    <li>{t('Перезапусти Dota 2.')}</li>
  </ol><p className="catalog-muted">{t('Убрать фон — вставь в PowerShell:')}</p><CopyField value={handed?.remove || removeCommand()}/>
    <MenuVersion/></InstallWindow>;
  return <InstallWindow title={t('Как установить фон')} onClose={onClose}><BackgroundSteps target={target}>
    {t('После крупного обновления Dota меню может смениться: если фон пропал или что-то в меню пропало, удали файл и собери фон здесь заново.')}</BackgroundSteps><MenuVersion/></InstallWindow>;
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
  const input = useRef(null), playhead = useRef(null), pending = useRef(null);
  useEffect(() => () => source && URL.revokeObjectURL(source), [source]);
  async function choose(next) {
    setError('');
    if (!next) return;
    if (next.size > MENU_LIMITS.bytes) return setError(tooBig(next.size));
    const detected = mediaKind(new Uint8Array(await next.slice(0, 16).arrayBuffer()));
    if (!detected) return setError(t('Подойдёт картинка (PNG, JPEG, WebP), GIF или видео (MP4, WebM).'));
    if (!pending.current) setFrame(MENU_FRAME);
    if (detected.type !== 'video') pending.current = null;
    setWanted(null);
    setOrigin({ kind: 'file', name: next.name, size: next.size, type: detected.type, label: detected.label });
    setFile(next); setKind(detected); setRatio(0); setDuration(0); setSource(URL.createObjectURL(next));
  }
  function remove() { setFile(null); setKind(null); setSource(''); setRatio(0); setDuration(0); setOrigin(null); pending.current = null; }
  function restore(saved) { setFit(saved.fit); setBlur(saved.blur); setDim(saved.dim); setFrame(menuFrame(saved.frame)); pending.current = saved; setWanted(saved.source); }
  function onMeta(element) {
    if (element.videoWidth && element.videoHeight) setRatio(element.videoWidth / element.videoHeight);
    if (!Number.isFinite(element.duration)) return;
    const length = element.duration, restored = pending.current;
    setDuration(length); setPiece(fitPiece(restored?.piece || { start: 0, end: length }, length, 'start'));
    if (restored) { setCrossfade(restored.crossfade); pending.current = null; }
  }
  return { file, kind, source, video: kind?.type === 'video', fit, setFit, blur, setBlur, dim, setDim, frame, setFrame, ratio, setRatio, wanted, duration, piece, setPiece, crossfade, setCrossfade, input, playhead,
    choose, remove, restore, onMeta,
    // What the encoder and the studio recipe take, and what makes a built result stale.
    encoding: { fit, effects: { blur: blur / 100, dim: dim / 100 }, frame, piece: duration ? piece : null, crossfade },
    recipe: { fit, blur, dim, frame, piece: duration ? piece : null, crossfade: duration ? crossfade : 0, source: origin },
    stale: [file, fit, blur, dim, frame, piece.start, piece.end, crossfade] };
}
// The panel's fields for such a background: the file asked for again (from the studio), the file,
// and once there is one, how it fits and its effects; until then the page shows the menu's.
function OwnFields({ own, aspect, where }) {
  return <>
    {own.wanted && <Notice>{rich(t('Чтобы собрать фон {where} как раньше, выбери его файл: {name}, {size}. Настройки уже стоят.'), { where, name: <b>{own.wanted.name}</b>, size: fileSize(own.wanted.size) })}</Notice>}
    <Field label={t('Файл')} hint={!own.file && t('PNG, JPEG, WebP, GIF, MP4, WebM до {size} МБ. Пропорции экрана — как у главного меню ({aspect}).', { size: megabytes(MENU_LIMITS.bytes), aspect })}>
      {own.file ? <div className="custom-file-card"><span className="custom-file-kind">{own.kind.label}</span><span className="custom-file-name"><b title={own.file.name}>{own.file.name}</b><small>{fileSize(own.file.size)}</small></span>
        <button type="button" className="catalog-icon custom-file-remove" onClick={own.remove} aria-label={t('Убрать фон {where}', { where })} title={t('Убрать фон')}><Icon name="close"/></button></div>
        : <button type="button" className="custom-file-empty" onClick={() => own.input.current?.click()}><Icon name="plus"/>{t('Выбрать файл')}</button>}
    </Field>
    {own.file ? <Field label={t('Картинка')} aside={FITS()[own.fit]}><Segmented label={t('Как вписать фон {where}', { where })} value={own.fit} onChange={own.setFit} options={FIT_OPTIONS()}/>
      <Effects blur={own.blur} onBlur={own.setBlur} dim={own.dim} onDim={own.setDim} frame={own.frame} onFrame={own.setFrame}/></Field>
      : <p className="custom-hint">{t('Пока файл не выбран, {where} будет фон главного меню.', { where })}</p>}
  </>;
}

export default function MenuBackground({ preset = null, studioItem = null, onRemove }) {
  const [file, setFile] = useState(null), [kind, setKind] = useState(null), [source, setSource] = useState(''), [aspect, setAspect] = useState('16:9'), [fit, setFit] = useState('cover');
  const [blur, setBlur] = useState(0), [dim, setDim] = useState(0), [frame, setFrame] = useState(MENU_FRAME), [framing, setFraming] = useState(null);
  const [clean, setClean] = useState(false), [seasonButton, setSeasonButton] = useState(true), [profileLinks, setProfileLinks] = useState(true), [folder, setFolder] = useState(lang === 'en' ? 'english' : 'russian'), [delivery, setDelivery] = useState('file');
  const [duration, setDuration] = useState(0), [piece, setPiece] = useState({ start: 0, end: 0 }), [crossfade, setCrossfade] = useState(0);
  const [mediaRatio, setMediaRatio] = useState(0), [progress, setProgress] = useState(null), [result, setResult] = useState(null), [error, setErrorText] = useState(''), [failed, setFailed] = useState(false), [install, setInstall] = useState(false), [handed, setHanded] = useState(null), [sources, setSources] = useState(false), [share, setShare] = useState(false), [dragging, setDragging] = useState(false), [fetching, setFetching] = useState(null), [sending, setSending] = useState(null);
  const input = useRef(null), running = useRef(null), playhead = useRef(null);
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
  const [page, setPage] = useState('menu'), [heroMode, setHeroMode] = useState('menu'), [gridMode, setGridMode] = useState('menu'), [gridDim, setGridDim] = useState(55), [picking, setPicking] = useState(false);
  // A failure (the pack did not build or load) offers «Сообщить в чат»; a wrong file does not.
  const setError = (message, failure = false) => { setErrorText(message); setFailed(failure); };
  const heroOwn = useOwnBackground(setError), gridOwn = useOwnBackground(setError), preview = usePreviewGrid(page === 'grid');
  const studioId = useRef(null), pending = useRef(null), saving = useRef(null);
  useEffect(() => { setPick(preset); }, [preset]);
  useEffect(() => () => source && URL.revokeObjectURL(source), [source]);
  useEffect(() => () => { if (result) for (const url of [result.url, result.heroUrl, result.gridUrl]) if (url) URL.revokeObjectURL(url); }, [result]);
  // Changing anything that is baked into the videos or the pack makes the result stale.
  useEffect(() => { setResult(null); }, [file, aspect, fit, blur, dim, clean, seasonButton, profileLinks, piece.start, piece.end, crossfade, frame,
    heroMode, ...heroOwn.stale, gridMode, gridDim, ...gridOwn.stale]);
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
      setAspect(recipe.aspect); setFit(recipe.fit); setBlur(recipe.blur); setDim(recipe.dim); setClean(recipe.clean); setSeasonButton(recipe.event ?? true); setProfileLinks(recipe.profile ?? true); setFolder(folderOf(recipe.folder).client); setDelivery(recipe.delivery === 'installer' ? 'command' : recipe.delivery); setFrame(menuFrame(recipe.frame));
      pending.current = recipe; studioId.current = record.id; setStudio({ id: record.id, name: record.name, saved: false });
      const hero = recipe.hero || { mode: 'menu' }, grid = recipe.grid || { mode: 'menu' };
      setHeroMode(hero.mode);
      if (hero.mode === 'own') heroOwn.restore(hero);
      setGridMode(grid.mode);
      if (grid.mode === 'dim') setGridDim(grid.dim);
      if (grid.mode === 'own') gridOwn.restore(grid);
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
      const item = preset.aspect ? preset : await catalogAPI(`/backgrounds/${preset.id}`, { signal: controller.signal });
      setAspect(pending.current?.aspect || item.aspect); setFetching({ title: item.title, progress: 0 });
      const response = await fetch(backgroundMedia(item.id, 'video.webm'), { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(t('Не удалось загрузить фон из галереи. Попробуй ещё раз.'));
      const total = Number(response.headers.get('content-length')) || 0, reader = response.body.getReader(), parts = [];
      for (let received = 0; ;) {
        const { done, value } = await reader.read(); if (done) break;
        parts.push(value); received += value.length;
        if (total) setFetching({ title: item.title, progress: received / total });
      }
      await choose(new File(parts, `${item.title}.webm`, { type: 'video/webm' }), { kind: 'workshop', id: item.id, title: item.title });
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
    const detected = mediaKind(new Uint8Array(await next.slice(0, 16).arrayBuffer()));
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
    studioId.current = null; pending.current = null; setStudio(null); setWanted(null); setNote(''); setOrigin(null);
    onRemove?.();
  }
  // The pack as it is, or under a name of its own with its PowerShell command (background-pack.js);
  // the install window opens after every download, with the command or the steps by hand. The studio
  // copy remembers the folder and the way.
  async function download(pack) {
    setProgress(null);
    let given;
    try { given = await downloadPack(pack, { folder, delivery, onProgress: setSending }); }
    catch (e) { setError(e?.message || t('Не получилось отправить фон на GridStudio. Попробуй ещё раз.'), true); return; }
    finally { setSending(null); }
    if (origin?.kind === 'workshop') countDownload('background', origin.id);
    countAction('background-pack');
    if (studioId.current) rememberDownload(studioId.current, { folder, delivery }).catch(() => {});
    setHanded(given); setInstall(true);
  }
  // `publish`: built for «Опубликовать в мастерскую» — the publish window opens instead of the
  // download and the install guide.
  async function build({ publish = false } = {}) {
    const controller = new AbortController(); running.current = controller;
    setError(''); setResult(null); setProgress(0);
    try {
      const { encodeMenuVideo } = await import('./menu-video.js');
      // A second page gets a video of its own only when a file is chosen; otherwise the menu's.
      const ownHero = heroMode === 'own' && !!heroOwn.file, ownGrid = gridMode === 'own' && !!gridOwn.file;
      const count = 1 + ownHero + ownGrid; let done = 0;
      const encode = async (media, options) => {
        const at = done++;
        return encodeMenuVideo(media, { size: MENU_SIZES[aspect], ...options, signal: controller.signal, onProgress: (value) => setProgress(Math.min(0.99, (at + value) / count)) });
      };
      const encoded = await encode(file, { fit, effects: { blur: blur / 100, dim: dim / 100 }, frame, piece: duration ? piece : null, crossfade });
      const heroEncoded = ownHero ? await encode(heroOwn.file, heroOwn.encoding) : null;
      const gridEncoded = ownGrid ? await encode(gridOwn.file, gridOwn.encoding) : null;
      const hero = ownHero ? { mode: 'own', ...heroOwn.recipe } : { mode: heroMode === 'off' ? 'off' : 'menu' };
      const grid = ownGrid ? { mode: 'own', ...gridOwn.recipe } : gridMode === 'dim' ? { mode: 'dim', dim: gridDim } : { mode: 'menu' };
      const blob = packBackground(encoded.video, { clean, hero, event: seasonButton, profile: profileLinks, grid }, heroEncoded?.video, gridEncoded?.video);
      // Kept in the studio: this browser gets the WebMs, a signed-in account the recipe.
      const recipe = { aspect, fit, blur, dim, frame, clean, event: seasonButton, profile: profileLinks, folder, delivery, piece: duration ? piece : null, crossfade: duration ? crossfade : 0, source: origin, hero, grid };
      saving.current = saveBuiltBackground({ id: studioId.current, recipe, video: encoded.video, heroVideo: heroEncoded?.video, gridVideo: gridEncoded?.video, codec: encoded.codec, seconds: encoded.seconds });
      saving.current.then((record) => { studioId.current = record.id; setStudio({ id: record.id, name: record.name, saved: true, account: record.account }); })
        .catch(() => setStudio((current) => ({ ...current, failed: true })));
      const url = (video) => video ? URL.createObjectURL(new Blob([video], { type: 'video/webm' })) : null;
      setResult({ blob, webm: encoded.video, aspect, url: url(encoded.video), seconds: encoded.seconds, trimmed: encoded.trimmed, codec: encoded.codec, video: encoded.video.length,
        heroUrl: url(heroEncoded?.video), gridUrl: url(gridEncoded?.video) });
      if (publish) return setShare(true);
      await download(blob);
    } catch (e) {
      if (!controller.signal.aborted) setError(e?.message || t('Не получилось собрать фон. Попробуй другой файл.'), true);
    } finally { if (running.current === controller) running.current = null; setProgress(null); }
  }
  const video = kind?.type === 'video', shown = result?.url || source;
  // The page shown: its mode and its own background, when it has one.
  const second = page === 'hero' ? { mode: heroMode, own: heroOwn, built: result?.heroUrl, where: t('за героем') }
    : page === 'grid' ? { mode: gridMode, own: gridOwn, built: result?.gridUrl, where: t('под сеткой') } : null;
  const ownShown = second?.mode === 'own' ? second.built || second.own.source : '';
  // The media is always contained; «Заполнить» scales it up by the cover/contain ratio, so switching
  // the fit or the screen shape animates instead of jumping.
  const [screenWidth, screenHeight] = MENU_SIZES[aspect], screenRatio = screenWidth / screenHeight;
  // Blur and dim as the video will have them: σ as a share of the screen's height (--blur, used with
  // cq units in customize.css), the veil a black layer; the built video has them baked in.
  const look = menuLook({ blur: blur / 100, dim: dim / 100 });
  // The picture where the video will have it (framePlacement, as menu-video.js draws it); until its
  // size is known, or once the video is built (it is the screen itself), over the whole screen.
  const placed = (place) => ({ left: `${place.x * 100}%`, top: `${place.y * 100}%`, width: `${place.w * 100}%`, height: `${place.h * 100}%`,
    ...(place.rotate || place.flipX || place.flipY ? { transform: `rotate(${place.rotate}deg) scale(${place.flipX ? -1 : 1}, ${place.flipY ? -1 : 1})` } : {}) });
  const WHOLE = { x: 0, y: 0, w: 1, h: 1 };
  const mediaFrame = mediaRatio ? framePlacement(screenRatio, mediaRatio, fit, look.zoom, frame) : WHOLE, mediaPlace = result ? WHOLE : mediaFrame;
  const measured = (width, height) => width && height && setMediaRatio(width / height);
  const mediaStyle = { ...placed(mediaPlace), '--blur': result ? 0 : look.sigma / 1080 };
  const own = second?.own, ownLook = own && menuLook({ blur: own.blur / 100, dim: own.dim / 100 });
  const ownFramed = own?.ratio ? framePlacement(screenRatio, own.ratio, own.fit, ownLook.zoom, own.frame) : WHOLE;
  const ownStyle = own && { ...placed(second.built ? WHOLE : ownFramed), '--blur': second.built ? 0 : ownLook.sigma / 1080 };
  // Framing by dragging the picture in the preview: the tab's own background (the menu's on «Главное
  // меню», the own file on a second page), once it is there. The hero on the hero page takes the drags
  // that start on him (hero3d/scene.js stops them).
  const frameTarget = !second ? (shown && mediaRatio ? { place: mediaFrame, frame, set: setFrame } : null)
    : second.mode === 'own' && ownShown && own.ratio ? { place: ownFramed, frame: own.frame, set: own.setFrame } : null;
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
  // Which picture lies under the page's interface: the menu's (also when darker), or the page's own.
  const showsMenu = !second || second.mode === 'menu' || second.mode === 'dim';
  const ready = { ready: <b>{t('Готовый фон')}</b> };
  const caption = page === 'grid'
    ? gridMode === 'own' && result?.gridUrl ? rich(t('{ready} — так он будет под сеткой.'), ready) : [{ menu: t('Под сеткой — фон главного меню, как в Dota сейчас.'), dim: t('Фон меню под сеткой темнее, чтобы сетка не сливалась.'), own: t('Так фон будет под сеткой героев на странице «Герои».') }[gridMode], preview.name && t('Сетка: «{name}».', { name: preview.name })].filter(Boolean).join(' ')
    : page === 'hero' ? (heroMode === 'off' ? t('За героем останется картинка Dota — меняется только главное меню.') : result?.heroUrl ? rich(t('{ready} — так он будет за героем.'), ready) : t('Так фон будет за героем на странице «Герои» → «Снаряжение».'))
    : result ? <>{rich(t('{ready} — ровно то видео, что внутри файла.'), ready)}{studio?.saved ? auth && !auth.loading && !auth.user && !studio.account
      ? <> {rich(t('{saved} только в этом браузере. {login}, чтобы он не потерялся.'), { saved: <a href={`${STUDIO_PATH}&show=backgrounds`}>{t('Сохранён в студии')}</a>,
        login: <button type="button" className="catalog-link" onClick={() => auth.requestLogin(t('Войди через Telegram, чтобы фон сохранился в аккаунте: его настройки не пропадут вместе с браузером и откроются на другом компьютере.'))}>{t('Войди через Telegram')}</button> })}</>
      : <> <a href={`${STUDIO_PATH}&show=backgrounds`}>{t('Сохранён в студии')}</a>.</> : studio?.failed ? ` ${t('Сохранить в студии не получилось.')}` : ''}</> : shown ? t('Так фон будет выглядеть в главном меню Dota.') : t('Главное меню Dota с выбранными пропорциями экрана.');
  return <main className="custom-work">
    <section className={`custom-stage${dragging ? ' is-over' : ''}`} {...drop} aria-label={t('Превью фона')}>
      <div className="custom-stage-area">
        <div className={`custom-screen${page !== 'menu' ? ` is-${page}` : ''}${frameTarget ? ' can-frame' : ''}${framing ? ' is-framing' : ''}`} style={{ '--ratio': screenRatio }}
          onPointerDown={frameDown} onPointerMove={frameMove} onPointerUp={frameUp} onPointerCancel={frameUp} onDragStart={(event) => event.preventDefault()}>
          {/* A second page shows the menu's background (darker under the grid), a video of its own, or Valve's picture, under a copy of the page. */}
          {showsMenu && <>
          {shown ? result ? <video key={shown} className="custom-media" src={shown} autoPlay loop muted playsInline/>
            : video ? <LoopPreview key={source} src={source} piece={duration ? piece : { start: 0, end: 1e9 }} crossfade={duration ? crossfade : 0} style={mediaStyle}
              onMeta={(element) => { measured(element.videoWidth, element.videoHeight); if (Number.isFinite(element.duration)) {
                const length = element.duration, restored = pending.current;
                setDuration(length); setPiece(fitPiece(restored?.piece || { start: 0, end: length }, length, 'start'));
                if (restored) { setCrossfade(restored.crossfade); pending.current = null; }
              } }}
              onTime={(t) => { if (playhead.current && duration) playhead.current.style.left = `${(t / duration) * 100}%`; }}/>
            : <img key={shown} className="custom-media" src={shown} alt="" draggable={false} style={mediaStyle} onLoad={(event) => measured(event.target.naturalWidth, event.target.naturalHeight)}/>
            : !fetching && <div className="custom-drop"><button type="button" className="custom-drop-pick" onClick={() => input.current?.click()}><Icon name="plus"/><strong>{t('Перетащи сюда картинку, GIF или видео')}</strong><span>{t('или нажми, чтобы выбрать файл')}</span></button>
              <p className="custom-drop-sources"><span>{t('Где взять:')}</span><a className="is-workshop" href={`${CATALOG_PATH}?backgrounds`}>{t('Готовые в мастерской')}</a>{SOURCES().map((source) => <a key={source.name} href={source.url} target="_blank" rel="noreferrer">{source.name}</a>)}</p></div>}
          {shown && <div className="custom-veil" style={{ opacity: result ? 0 : look.veil }}/>}
          </>}
          {page === 'grid' && <div className="custom-veil custom-grid-veil" style={{ opacity: gridMode === 'dim' ? (gridDim / 100) * GRID_DIM.max : 0 }}/>}
          {second?.mode === 'own' && (ownShown ? second.built ? <video key={ownShown} className="custom-media" src={ownShown} autoPlay loop muted playsInline/>
            : own.video ? <LoopPreview key={own.source} src={own.source} piece={own.duration ? own.piece : { start: 0, end: 1e9 }} crossfade={own.duration ? own.crossfade : 0} style={ownStyle}
              onMeta={own.onMeta} onTime={(t) => { if (own.playhead.current && own.duration) own.playhead.current.style.left = `${(t / own.duration) * 100}%`; }}/>
            : <img key={ownShown} className="custom-media" src={ownShown} alt="" draggable={false} style={ownStyle} onLoad={(event) => own.setRatio(event.target.naturalWidth / event.target.naturalHeight)}/>
            : <div className="custom-drop"><button type="button" className="custom-drop-pick" onClick={() => own.input.current?.click()}><Icon name="plus"/><strong>{page === 'grid' ? t('Фон под сеткой') : t('Фон за героем')}</strong><span>{t('Перетащи картинку, GIF или видео или нажми, чтобы выбрать')}</span></button></div>)}
          {second?.mode === 'own' && ownShown && <div className="custom-veil" style={{ opacity: second.built ? 0 : ownLook.veil }}/>}
          {page === 'hero' && heroMode === 'off' && <div className="custom-hero-default"/>}
          {/* The hero can be turned once there is a background behind it; until then it stands behind the «+». */}
          {page === 'hero' ? <DotaHeroPage interactive={heroMode === 'off' || Boolean(heroMode === 'own' ? ownShown : shown)}/>
            : page === 'grid' ? <DotaGridPage grid={preview.grid} name={preview.name}/>
            : <DotaMenu clean={clean} event={SEASON_EVENT ? seasonButton : null}/>}
          {fetching && <div className="custom-fetching" role="status"><b>{fetching.title ? t('Загружаем «{title}»', { title: fetching.title }) : t('Загружаем фон…')}</b><span><i style={{ width: `${Math.round(fetching.progress * 100)}%` }}/></span></div>}
        </div>
      </div>
      {second?.mode === 'own' && own.video && own.duration > 0 && !second.built ? <TrimBar duration={own.duration} piece={own.piece} crossfade={own.crossfade} playhead={own.playhead} onChange={own.setPiece} onCrossfade={own.setCrossfade}/>
      : !second && video && duration > 0 && !result ? <TrimBar duration={duration} piece={piece} crossfade={crossfade} playhead={playhead} onChange={setPiece} onCrossfade={setCrossfade}/>
      : <p className="custom-caption">{caption}</p>}
    </section>
    <aside className="custom-panel">
      <div className="custom-panel-body">
        <header className="custom-panel-head"><SegmentSwitch label={t('Какой фон')} value={page} options={PAGES()} onChange={setPage}/>
          <h1>{TITLES()[page]}</h1>
          <p>{LEADS()[page]}</p></header>
        <input ref={input} type="file" accept={ACCEPT} className="catalog-file" onChange={(event) => { choose(event.target.files[0]); event.target.value = ''; }}/>
        {[heroOwn, gridOwn].map((one, i) => <input key={i} ref={one.input} type="file" accept={ACCEPT} className="catalog-file" onChange={(event) => { one.choose(event.target.files[0]); event.target.value = ''; }}/>)}
        {page === 'hero' ? <>
          <Field label={t('Фон')} hint={HERO_HINTS()[heroMode]}><Segmented label={t('Фон за героем')} value={heroMode} onChange={setHeroMode} options={HERO_MODES()}/></Field>
          {heroMode === 'own' && <OwnFields own={heroOwn} aspect={aspect} where={t('за героем')}/>}
          {!file && heroMode !== 'off' && <Notice>{t('Фон за героем собирается вместе с главным меню: сначала выбери фон на вкладке «Меню».')}</Notice>}
        </> : page === 'grid' ? <>
          <Field label={t('Фон')} hint={GRID_HINTS()[gridMode]}><Segmented label={t('Фон под сеткой')} value={gridMode} onChange={setGridMode} options={GRID_MODES()}/></Field>
          {gridMode === 'dim' && <Field label={t('Насколько темнее')}><div className="custom-effects"><Slider label={t('Затемнение')} value={gridDim} onChange={setGridDim}/></div></Field>}
          {gridMode === 'own' && <OwnFields own={gridOwn} aspect={aspect} where={t('под сеткой')}/>}
          <Field label={t('Сетка в превью')}><GridChoice preview={preview} onOpen={() => setPicking(true)}/></Field>
          {!file && <Notice>{t('Фон под сеткой собирается вместе с главным меню: сначала выбери фон на вкладке «Меню».')}</Notice>}
        </> : <>
        {wanted && <Notice>{rich(t('Чтобы изменить «{title}», выбери исходный файл: {name}, {size}. Настройки фона уже стоят.'), { title: studio?.name, name: <b>{wanted.name}</b>, size: fileSize(wanted.size) })}</Notice>}
        {note && <Notice>{note}</Notice>}
        <Field label={t('Файл')} hint={!file && <>{t('PNG, JPEG, WebP, GIF, MP4, WebM до {size} МБ. Из видео выбираешь отрезок до {seconds} с на шкале под превью, звук убирается.', { size: megabytes(MENU_LIMITS.bytes), seconds: MENU_LIMITS.seconds })} <button type="button" className="catalog-link" onClick={() => setSources(true)}>{t('Где взять фон?')}</button></>}>
          {file ? <div className="custom-file-card"><span className="custom-file-kind">{kind.label}</span><span className="custom-file-name"><b title={file.name}>{file.name}</b><small>{fileSize(file.size)}</small></span>
            <button type="button" className="catalog-icon custom-file-remove" onClick={remove} aria-label={t('Убрать фон')} title={t('Убрать фон')}><Icon name="close"/></button></div>
            : <button type="button" className="custom-file-empty" onClick={() => input.current?.click()}><Icon name="plus"/>{t('Выбрать файл')}</button>}
        </Field>
        <Field label={t('Экран')} aside={ASPECTS()[aspect]}><Segmented label={t('Экран')} value={aspect} onChange={setAspect} options={Object.keys(ASPECTS()).map((value) => [value, value])}/></Field>
        <Field label={t('Картинка')} aside={FITS()[fit]}><Segmented label={t('Как вписать')} value={fit} onChange={setFit} options={FIT_OPTIONS()}/>
          <Effects blur={blur} onBlur={setBlur} dim={dim} onDim={setDim} frame={file ? frame : null} onFrame={setFrame}/></Field>
        <div className="custom-switches">
          <label className="custom-toggle"><input type="checkbox" role="switch" checked={!clean} onChange={(event) => setClean(!event.target.checked)}/><span><b>{t('Отображать новости на главной')}</b><small>{t('Выключи, чтобы колонка справа не закрывала фон')}</small></span></label>
          {SEASON_EVENT && <label className="custom-toggle"><input type="checkbox" role="switch" checked={seasonButton} onChange={(event) => setSeasonButton(event.target.checked)}/><span><b>{t('Кнопка «{name}»', { name: t(SEASON_EVENT.name) })}</b><small>{t('Ивент с наградами в один клик — нажми в превью')}</small></span></label>}
          <Peek src={profilePreview} width={480} height={144} caption={t('Так кнопки встанут в профиле любого пользователя Dota, под статусом: открывают его страницу на Stratz и Dotabuff.')}>
            <label className="custom-toggle"><input type="checkbox" role="switch" checked={profileLinks} onChange={(event) => setProfileLinks(event.target.checked)}/><span><b>{t('Кнопки Stratz и Dotabuff в профилях')}</b><small>{t('Наведи, чтобы увидеть, как это выглядит')}</small></span></label>
          </Peek>
        </div>
        {/* The language of the user's Dota, on one line: the file goes to dota_russian either way;
            an English Dota needs a word on why. */}
        <div className="custom-field"><div className="custom-inline"><span className="custom-label">{t('Язык Dota')}</span><Segmented label={t('Язык Dota')} value={target.client} onChange={setFolder} options={[['russian', 'Русский'], ['english', 'English']]}/></div>
          {target.client === 'english' && <p className="custom-hint">{t('Файл тоже ляжет в dota_russian: моды Dota читает только из папки языка озвучки. Команда PowerShell включит русскую озвучку, интерфейс останется английским.')}</p>}</div>
        </>}
      </div>
      <footer className="custom-panel-foot">
        {error && <Notice error report={failed}>{error}</Notice>}
        <Segmented label={t('Что скачать')} value={delivery} onChange={(value) => { setDelivery(value); setHanded(null); }} options={DELIVERY()}/>
        {sending !== null ? <div className="custom-progress" role="status"><span style={{ width: `${Math.round(sending * 100)}%` }}/><b>{t('Отправляем фон на GridStudio… {percent}%', { percent: Math.round(sending * 100) })}</b></div>
        : progress !== null ? <div className="custom-progress" role="status"><span style={{ width: `${Math.round(progress * 100)}%` }}/><b>{t('Собираем фон… {percent}%', { percent: Math.round(progress * 100) })}</b>
          <button type="button" className="catalog-icon" aria-label={t('Отменить')} onClick={() => running.current?.abort()}><Icon name="close"/></button></div>
          : result ? <button className="catalog-button primary" title={`${t('{codec} · {seconds} с', { codec: result.codec.toUpperCase(), seconds: Math.round(result.seconds) })}${result.trimmed ? t(', обрезано') : ''}`} onClick={() => download(result.blob)}><Icon name="download"/>{delivery === 'command' ? t('Скачать и получить команду') : t('Скачать {file}', { file: target.file })}<span className="custom-size">{fileSize(result.blob.size)}</span></button>
          : <button className="catalog-button primary" disabled={!file} onClick={() => build()}>{t('Собрать фон')}</button>}
        {/* Publishing takes the built video; without one, the button builds it first. */}
        <div className="custom-foot-row"><button type="button" className="catalog-link custom-publish" disabled={!file || progress !== null || sending !== null || !!fetching} onClick={() => result ? setShare(true) : build({ publish: true })}><Icon name="upload"/>{t('Опубликовать в мастерскую')}</button>
          <span className="custom-foot-links">
            <button type="button" className="catalog-link" onClick={() => setInstall(true)}>{t('Как установить')}</button></span></div>
      </footer>
    </aside>
    {install && <Install folder={folder} delivery={delivery} handed={delivery === 'command' ? handed : null} onClose={() => setInstall(false)}/>}
    {sources && <Sources onClose={() => setSources(false)}/>}
    {picking && <GridPicker chosen={preview.choice} onChoose={preview.choose} onClose={() => setPicking(false)}/>}
    {share && result && <ShareBackground video={result.webm} aspect={result.aspect} onSent={(published) => saving.current?.then((record) => markPublished(record.id, published)).catch(() => {})} onClose={() => setShare(false)}/>}
  </main>;
}
