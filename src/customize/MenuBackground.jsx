import { useEffect, useRef, useState } from 'react';
import { Icon, Modal, Notice, SegmentSwitch } from '../catalog/Common.jsx';
import { HERO_OPACITY, MENU_FRAME, MENU_FRAME_ZOOM, MENU_LIMITS, MENU_SIZES, fitPiece, framePlacement, mediaKind, menuFrame, menuLook } from '../../scripts/menu-background.mjs';
import menuMeta from '../../assets/dota-menu/meta.json';
import { FOLDERS, downloadPack, packBackground } from './background-pack.js';
import { getBackground } from '../../scripts/background-library.mjs';
import { markPublished, pullRecipes, rememberDownload, saveBuiltBackground } from '../studio-backgrounds.js';
import { CopyField, Field, InstallWindow, Segmented } from './CustomizeApp.jsx';
import DotaMenu from './DotaMenu.jsx';
import DotaHeroPage from './DotaHeroPage.jsx';
import { LoopPreview, TrimBar } from './Trim.jsx';
import { ShareBackground } from './ShareBackground.jsx';
import { backgroundMedia } from '../catalog/BackgroundGallery.jsx';
import { CATALOG_PATH, STUDIO_PATH, catalogAPI } from '../catalog/api.js';

// The main-menu background, made entirely in the browser: the file becomes a WebM
// (menu-video.js, loaded on first use) and then pakNN_dir.vpk with Valve's dashboard pointing at it
// (scripts/menu-background.mjs). Nothing is uploaded.
const ASPECTS = { '16:9': 'обычный монитор', '16:10': 'ноутбуки, MacBook', '21:9': 'широкий монитор', '4:3': 'растянутое 4:3' };
const FITS = { cover: 'Края обрежутся, чёрных полос нет.', contain: 'Картинка целиком, по бокам чёрные полосы.' };
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,.mov';
// Where to find a background: live wallpapers (MP4), GIFs, free stock video.
const SOURCES = [
  { name: 'MotionBGs', url: 'https://motionbgs.com/', note: 'Живые обои из игр и аниме, MP4.' },
  { name: 'MoeWalls', url: 'https://moewalls.com/', note: 'Аниме и игровые живые обои, MP4.' },
  { name: 'WallpaperWaifu', url: 'https://www.wallpaperwaifu.com/', note: 'Аниме-обои, MP4.' },
  { name: 'Tenor', url: 'https://tenor.com/', note: 'Гифки на любую тему.' },
  { name: 'Pixabay', url: 'https://pixabay.com/videos/', note: 'Бесплатные видео без ограничений: космос, природа, абстракция.' }
];
// Which background the panel edits and the preview shows: the main menu, or the one behind the hero
// on the hero page («За героем»; scripts/menu-background.mjs HERO_PAGE). Behind the hero goes the menu
// video (default), a video of its own, or Valve's picture stays.
const PAGES = [['menu', 'Главное меню'], ['hero', 'За героем']];
const HERO_MODES = [['menu', 'Как в меню'], ['own', 'Свой фон'], ['off', 'Как в Dota']];
const HERO_HINTS = { menu: 'За героем крутится тот же фон, что в главном меню.', own: 'За героем — свой фон, с теми же настройками, что у меню.', off: 'Страница героя не меняется: за героем картинка Dota.' };
// How the result is handed over: the bare pack, or a zip with a Windows installer next to it.
export const DELIVERY = [['file', 'Только файл'], ['installer', 'С установщиком']];
const megabytes = (bytes) => (bytes / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
// A file's size for people: kilobytes under a megabyte, so a small picture is not «0 МБ».
const fileSize = (bytes) => bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} КБ` : `${megabytes(bytes)} МБ`;

function Sources({ onClose }) {
  return <Modal title="Где взять фон" onClose={onClose} size="md"><div className="custom-install custom-sources">
    <p><a className="catalog-link" href={`${CATALOG_PATH}?backgrounds`}>Готовые фоны пользователей — в мастерской</a>: их можно взять и поменять здесь.</p>
    <ul>{SOURCES.map((source) => <li key={source.name}><a href={source.url} target="_blank" rel="noreferrer"><b>{source.name}</b><span>{source.note}</span><Icon name="external"/></a></li>)}</ul>
    <p className="catalog-muted">Лучше всего смотрятся короткие зацикленные ролики в 1080p: видео длиннее 30 секунд обрежется. Скачанный файл перетащи на экран слева. Обои на этих сайтах — чужие работы: бери их для своего фона, а не для продажи.</p>
  </div></Modal>;
}

export function InstallerSteps({ what, run, remove, extra = null }) {
  return <><ol>
    <li>Распакуй скачанный архив в любую папку.</li>
    <li>Запусти <b>«{run}»</b>. Установщик сам найдёт Dota 2 через Steam, закрыть игру он попросит сам. Если не найдёт, спросит папку <code>dota 2 beta</code>.</li>
    <li>Если Windows покажет «Система Windows защитила ваш компьютер»: «Подробнее» → «Выполнить в любом случае». Так она реагирует на любой скачанный .bat; установщик только копирует файлы — его можно открыть блокнотом и прочитать.</li>
    {extra}
    <li>Запусти Dota 2.</li>
  </ol><p className="catalog-muted">Убрать {what}: «{remove}» из той же папки — вернёт всё как было.</p></>;
}

// Which Dota update the menu files come from (scripts/check-dota-menu.mjs watches for new ones).
const russianDate = (iso) => iso.split('-').reverse().join('.');
function MenuVersion() {
  return <p className="catalog-muted">Файлы меню — от обновления Dota {russianDate(menuMeta.date)}.</p>;
}

function Install({ folder, delivery, onClose }) {
  const target = FOLDERS[folder], custom = folder === 'custom';
  if (delivery === 'installer') return <InstallWindow title="Как установить фон" onClose={onClose}>
    <InstallerSteps what="фон" run="Установить фон.bat" remove="Удалить фон.bat" extra={<li>{custom ? 'В Steam: Dota 2 → «Свойства» → «Параметры запуска» — добавь' : 'Если озвучка в игре не русская: Steam → Dota 2 → «Свойства» → «Параметры запуска» — добавь'} <CopyField value={target.launch}/></li>}/>
    <MenuVersion/>
  </InstallWindow>;
  return <InstallWindow title="Как установить фон" onClose={onClose}><ol>
    <li>В Steam: Dota 2 → «Свойства» → «Установленные файлы» → «Обзор». Откроется папка <code>dota 2 beta</code>.</li>
    <li>Зайди в <code>game</code>{custom ? <> и создай там папку <code>{target.folder}</code></> : <> → <code>{target.folder}</code>. Если такой папки нет, поставь в Dota русскую озвучку или создай её сам</>}.</li>
    <li>Положи туда скачанный <code>{target.file}</code>.</li>
    <li>{custom ? 'В Steam: Dota 2 → «Свойства» → «Параметры запуска» — добавь' : 'Если озвучка в игре не русская: Steam → Dota 2 → «Свойства» → «Параметры запуска» — добавь'} <CopyField value={target.launch}/></li>
    <li>Перезапусти Dota 2.</li>
  </ol><p className="catalog-muted">Убрать фон: удали <code>{target.file}</code>{custom ? ' и параметр запуска' : ''}. После крупного обновления Dota меню может смениться: если фон пропал или что-то в меню пропало, удали файл и собери фон здесь заново.</p><MenuVersion/></InstallWindow>;
}

// A 0–100 % slider in the panel; 0 reads «нет».
// Framing (menuFrame): the zoom from 100 to MENU_FRAME_ZOOM × 100 % and, since the place is set by
// dragging the picture in the preview, a hint and a way back to the middle.
function FrameControls({ frame, onChange }) {
  const value = Math.round(frame.zoom * 100), max = MENU_FRAME_ZOOM * 100, moved = frame.zoom !== 1 || frame.x !== 0.5 || frame.y !== 0.5;
  return <div className="custom-frame">
    <label className="custom-slider"><span>Масштаб</span>
      <input type="range" min="100" max={max} step="5" value={value} onChange={(event) => onChange(menuFrame({ ...frame, zoom: Number(event.target.value) / 100 }))} style={{ '--fill': `${((value - 100) / (max - 100)) * 100}%` }}/>
      <output>{value}%</output></label>
    <p className="custom-hint">Перетащи картинку в превью, чтобы выбрать, какая её часть попадёт в кадр.{moved && <> <button type="button" className="catalog-link" onClick={() => onChange(MENU_FRAME)}>Сбросить кадр</button></>}</p>
  </div>;
}
function Slider({ label, value, onChange }) {
  return <label className="custom-slider"><span>{label}</span>
    <input type="range" min="0" max="100" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} style={{ '--fill': `${value}%` }}/>
    <output>{value ? `${value}%` : 'нет'}</output></label>;
}

// `preset`: a workshop background to start from; `studioItem`: a «Студия» background to change
// (?item=id): its settings come back, its source is taken again (a workshop background is
// downloaded, the user's own file is asked for), and the next build updates it.
export default function MenuBackground({ preset = null, studioItem = null, onRemove }) {
  const [file, setFile] = useState(null), [kind, setKind] = useState(null), [source, setSource] = useState(''), [aspect, setAspect] = useState('16:9'), [fit, setFit] = useState('cover');
  const [blur, setBlur] = useState(0), [dim, setDim] = useState(0), [frame, setFrame] = useState(MENU_FRAME), [heroFrame, setHeroFrame] = useState(MENU_FRAME), [framing, setFraming] = useState(null);
  const [clean, setClean] = useState(false), [folder, setFolder] = useState('russian'), [delivery, setDelivery] = useState('file');
  const [duration, setDuration] = useState(0), [piece, setPiece] = useState({ start: 0, end: 0 }), [crossfade, setCrossfade] = useState(0);
  const [mediaRatio, setMediaRatio] = useState(0), [progress, setProgress] = useState(null), [result, setResult] = useState(null), [error, setError] = useState(''), [install, setInstall] = useState(false), [sources, setSources] = useState(false), [share, setShare] = useState(false), [dragging, setDragging] = useState(false), [fetching, setFetching] = useState(null);
  const input = useRef(null), running = useRef(null), shownGuide = useRef(false), playhead = useRef(null);
  // What the file is (for the studio recipe), the studio background being changed, the recipe whose
  // piece and crossfade wait for the video's length, and an own file the user is asked to choose.
  const [origin, setOrigin] = useState(null), [pick, setPick] = useState(preset), [studio, setStudio] = useState(null), [wanted, setWanted] = useState(null), [note, setNote] = useState('');
  // Behind the hero: the mode and, for 'own', a second file with the same settings as the menu's.
  const [page, setPage] = useState('menu'), [heroMode, setHeroMode] = useState('menu');
  const [heroFile, setHeroFile] = useState(null), [heroKind, setHeroKind] = useState(null), [heroSource, setHeroSource] = useState(''), [heroFit, setHeroFit] = useState('cover');
  const [heroBlur, setHeroBlur] = useState(0), [heroDim, setHeroDim] = useState(0), [heroRatio, setHeroRatio] = useState(0), [heroOrigin, setHeroOrigin] = useState(null), [heroWanted, setHeroWanted] = useState(null);
  const [heroDuration, setHeroDuration] = useState(0), [heroPiece, setHeroPiece] = useState({ start: 0, end: 0 }), [heroCrossfade, setHeroCrossfade] = useState(0);
  const heroInput = useRef(null), heroPlayhead = useRef(null), heroPending = useRef(null);
  const studioId = useRef(null), pending = useRef(null), saving = useRef(null);
  useEffect(() => { setPick(preset); }, [preset]);
  useEffect(() => () => source && URL.revokeObjectURL(source), [source]);
  useEffect(() => () => heroSource && URL.revokeObjectURL(heroSource), [heroSource]);
  useEffect(() => () => { if (result) { URL.revokeObjectURL(result.url); if (result.heroUrl) URL.revokeObjectURL(result.heroUrl); } }, [result]);
  // Changing anything that is baked into the videos or the pack makes the result stale.
  useEffect(() => { setResult(null); }, [file, aspect, fit, blur, dim, clean, piece.start, piece.end, crossfade, frame,
    heroMode, heroFile, heroFit, heroBlur, heroDim, heroPiece.start, heroPiece.end, heroCrossfade, heroFrame]);
  useEffect(() => () => running.current?.abort(), []);
  // A background from the studio: settings now, the source next (see `pending`).
  useEffect(() => {
    if (!studioItem) return;
    let stopped = false;
    (async () => {
      const record = await getBackground(studioItem).catch(() => null) || (await pullRecipes().catch(() => [])).find((item) => item.id === studioItem);
      if (stopped) return;
      if (!record) return setError('Этого фона нет в студии: возможно, его удалили.');
      const recipe = record.recipe;
      setAspect(recipe.aspect); setFit(recipe.fit); setBlur(recipe.blur); setDim(recipe.dim); setClean(recipe.clean); setFolder(recipe.folder); setDelivery(recipe.delivery); setFrame(menuFrame(recipe.frame));
      pending.current = recipe; studioId.current = record.id; setStudio({ id: record.id, name: record.name, saved: false });
      const hero = recipe.hero || { mode: 'menu' };
      setHeroMode(hero.mode);
      if (hero.mode === 'own') { setHeroFit(hero.fit); setHeroBlur(hero.blur); setHeroDim(hero.dim); setHeroFrame(menuFrame(hero.frame)); heroPending.current = hero; setHeroWanted(hero.source); }
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
      if (!response.ok || !response.body) throw new Error('Не удалось загрузить фон из галереи. Попробуй ещё раз.');
      const total = Number(response.headers.get('content-length')) || 0, reader = response.body.getReader(), parts = [];
      for (let received = 0; ;) {
        const { done, value } = await reader.read(); if (done) break;
        parts.push(value); received += value.length;
        if (total) setFetching({ title: item.title, progress: received / total });
      }
      await choose(new File(parts, `${item.title}.webm`, { type: 'video/webm' }), { kind: 'workshop', id: item.id, title: item.title });
    })().catch((problem) => { if (!controller.signal.aborted) setError(problem.message); })
      .finally(() => { if (!controller.signal.aborted) setFetching(null); });
    return () => controller.abort();
  }, [pick]);
  const target = FOLDERS[folder];

  // `from`: a workshop background; otherwise the user's own file. A new file starts a new studio
  // background, unless it is the source of the one being changed.
  async function choose(next, from = null) {
    setError(''); setNote('');
    if (!next) return;
    if (next.size > MENU_LIMITS.bytes) return setError(`Файл ${megabytes(next.size)} МБ, а можно до ${megabytes(MENU_LIMITS.bytes)} МБ.`);
    const detected = mediaKind(new Uint8Array(await next.slice(0, 16).arrayBuffer()));
    if (!detected) return setError('Подойдёт картинка (PNG, JPEG, WebP), GIF или видео (MP4, WebM).');
    running.current?.abort(); setProgress(null);
    if (!pending.current) { studioId.current = null; setStudio(null); setFrame(MENU_FRAME); }
    else if (wanted && (next.name !== wanted.name || next.size !== wanted.size)) setNote('Это не тот файл, из которого собран фон: настройки применены, но отрезок может не совпасть.');
    if (detected.type !== 'video') pending.current = null;
    setWanted(null);
    setOrigin(from || { kind: 'file', name: next.name, size: next.size, type: detected.type, label: detected.label });
    setFile(next); setKind(detected); setMediaRatio(0); setDuration(0); setSource(URL.createObjectURL(next));
  }
  // The file behind the hero (mode 'own'): the same checks as the menu's; its trim comes back from
  // the studio recipe when the file is the one it was built from.
  async function chooseHero(next) {
    setError('');
    if (!next) return;
    if (next.size > MENU_LIMITS.bytes) return setError(`Файл ${megabytes(next.size)} МБ, а можно до ${megabytes(MENU_LIMITS.bytes)} МБ.`);
    const detected = mediaKind(new Uint8Array(await next.slice(0, 16).arrayBuffer()));
    if (!detected) return setError('Подойдёт картинка (PNG, JPEG, WebP), GIF или видео (MP4, WebM).');
    if (!heroPending.current) setHeroFrame(MENU_FRAME);
    if (detected.type !== 'video') heroPending.current = null;
    setHeroWanted(null);
    setHeroOrigin({ kind: 'file', name: next.name, size: next.size, type: detected.type, label: detected.label });
    setHeroFile(next); setHeroKind(detected); setHeroRatio(0); setHeroDuration(0); setHeroSource(URL.createObjectURL(next));
  }
  function removeHero() { setHeroFile(null); setHeroKind(null); setHeroSource(''); setHeroRatio(0); setHeroDuration(0); setHeroOrigin(null); heroPending.current = null; }
  // The cross on the file card: back to the empty screen (and the gallery pick is forgotten).
  function remove() {
    running.current?.abort(); setProgress(null); setError('');
    setFile(null); setKind(null); setSource(''); setMediaRatio(0); setDuration(0);
    studioId.current = null; pending.current = null; setStudio(null); setWanted(null); setNote(''); setOrigin(null);
    onRemove?.();
  }
  // The pack as it is, or zipped with «Установить фон.bat» (background-pack.js); the studio copy
  // remembers the folder and the way.
  async function download(pack) {
    await downloadPack(pack, { folder, delivery });
    if (studioId.current) rememberDownload(studioId.current, { folder, delivery }).catch(() => {});
  }
  // `publish`: built for «Опубликовать в мастерскую» — the publish window opens instead of the
  // download and the install guide.
  async function build({ publish = false } = {}) {
    const controller = new AbortController(); running.current = controller;
    setError(''); setResult(null); setProgress(0);
    try {
      const { encodeMenuVideo } = await import('./menu-video.js');
      // Behind the hero: a video of its own only when a file is chosen; otherwise the menu's.
      const ownHero = heroMode === 'own' && !!heroFile, share = ownHero ? 0.5 : 1;
      const encoded = await encodeMenuVideo(file, { size: MENU_SIZES[aspect], fit, effects: { blur: blur / 100, dim: dim / 100 }, frame, piece: duration ? piece : null, crossfade, signal: controller.signal, onProgress: (value) => setProgress(Math.min(0.99, value * share)) });
      const heroEncoded = ownHero ? await encodeMenuVideo(heroFile, { size: MENU_SIZES[aspect], fit: heroFit, effects: { blur: heroBlur / 100, dim: heroDim / 100 }, frame: heroFrame, piece: heroDuration ? heroPiece : null,
        crossfade: heroCrossfade, signal: controller.signal, onProgress: (value) => setProgress(Math.min(0.99, 0.5 + value / 2)) }) : null;
      const hero = ownHero ? { mode: 'own', fit: heroFit, blur: heroBlur, dim: heroDim, frame: heroFrame, piece: heroDuration ? heroPiece : null, crossfade: heroDuration ? heroCrossfade : 0, source: heroOrigin }
        : { mode: heroMode === 'off' ? 'off' : 'menu' };
      const blob = packBackground(encoded.video, { clean, hero }, heroEncoded?.video);
      // Kept in the studio: this browser gets the WebMs, a signed-in account the recipe.
      const recipe = { aspect, fit, blur, dim, frame, clean, folder, delivery, piece: duration ? piece : null, crossfade: duration ? crossfade : 0, source: origin, hero };
      saving.current = saveBuiltBackground({ id: studioId.current, recipe, video: encoded.video, heroVideo: heroEncoded?.video, codec: encoded.codec, seconds: encoded.seconds });
      saving.current.then((record) => { studioId.current = record.id; setStudio({ id: record.id, name: record.name, saved: true }); })
        .catch(() => setStudio((current) => ({ ...current, failed: true })));
      setResult({ blob, webm: encoded.video, aspect, url: URL.createObjectURL(new Blob([encoded.video], { type: 'video/webm' })), seconds: encoded.seconds, trimmed: encoded.trimmed, codec: encoded.codec, video: encoded.video.length,
        heroUrl: heroEncoded ? URL.createObjectURL(new Blob([heroEncoded.video], { type: 'video/webm' })) : null });
      if (publish) return setShare(true);
      await download(blob);
      if (!shownGuide.current) { shownGuide.current = true; setInstall(true); }
    } catch (e) {
      if (!controller.signal.aborted) setError(e?.message || 'Не получилось собрать фон. Попробуй другой файл.');
    } finally { if (running.current === controller) running.current = null; setProgress(null); }
  }
  const video = kind?.type === 'video', shown = result?.url || source;
  const heroVideo = heroKind?.type === 'video', heroShown = result?.heroUrl || heroSource, heroPage = page === 'hero';
  // The media is always contained; «Заполнить» scales it up by the cover/contain ratio, so switching
  // the fit or the screen shape animates instead of jumping.
  const [screenWidth, screenHeight] = MENU_SIZES[aspect], screenRatio = screenWidth / screenHeight;
  // Blur and dim as the video will have them: σ as a share of the screen's height (--blur, used with
  // cq units in customize.css), the veil a black layer; the built video has them baked in.
  const look = menuLook({ blur: blur / 100, dim: dim / 100 });
  // The picture where the video will have it (framePlacement, as menu-video.js draws it); until its
  // size is known, or once the video is built (it is the screen itself), over the whole screen.
  const placed = (place) => ({ left: `${place.x * 100}%`, top: `${place.y * 100}%`, width: `${place.w * 100}%`, height: `${place.h * 100}%` });
  const WHOLE = { x: 0, y: 0, w: 1, h: 1 };
  const mediaFrame = mediaRatio ? framePlacement(screenRatio, mediaRatio, fit, look.zoom, frame) : WHOLE, mediaPlace = result ? WHOLE : mediaFrame;
  const measured = (width, height) => width && height && setMediaRatio(width / height);
  const mediaStyle = { ...placed(mediaPlace), '--blur': result ? 0 : look.sigma / 1080 };
  const heroLook = menuLook({ blur: heroBlur / 100, dim: heroDim / 100 });
  const heroFramed = heroRatio ? framePlacement(screenRatio, heroRatio, heroFit, heroLook.zoom, heroFrame) : WHOLE, heroPlace = result?.heroUrl ? WHOLE : heroFramed;
  const heroStyle = { ...placed(heroPlace), '--blur': result?.heroUrl ? 0 : heroLook.sigma / 1080 };
  const heroMeasured = (width, height) => width && height && setHeroRatio(width / height);
  // Framing by dragging the picture in the preview: the tab's own background (the menu's on «Главное
  // меню», the own file behind the hero), once it is there. The hero on the hero page takes the drags
  // that start on him (hero3d/scene.js stops them).
  const frameTarget = !heroPage ? (shown && mediaRatio ? { place: mediaFrame, frame, set: setFrame } : null)
    : heroMode === 'own' && heroShown && heroRatio ? { place: heroFramed, frame: heroFrame, set: setHeroFrame } : null;
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
    framing.set(menuFrame({ ...from, x: shift((event.clientX - framing.x) / box.width, place.w, from.x), y: shift((event.clientY - framing.y) / box.height, place.h, from.y) }));
  };
  const frameUp = () => setFraming(null);
  const drop = { onDragOver: (event) => { event.preventDefault(); setDragging(true); }, onDragLeave: () => setDragging(false),
    onDrop: (event) => { event.preventDefault(); setDragging(false); (heroPage && heroMode === 'own' ? chooseHero : choose)(event.dataTransfer.files[0]); } };
  return <main className="custom-work">
    <section className={`custom-stage${dragging ? ' is-over' : ''}`} {...drop} aria-label="Превью фона">
      <div className="custom-stage-area">
        <div className={`custom-screen${heroPage ? ' is-hero' : ''}${frameTarget ? ' can-frame' : ''}${framing ? ' is-framing' : ''}`} style={{ '--ratio': screenRatio }}
          onPointerDown={frameDown} onPointerMove={frameMove} onPointerUp={frameUp} onPointerCancel={frameUp} onDragStart={(event) => event.preventDefault()}>
          {/* The hero page shows the menu's background, a video of its own, or Valve's picture, under a copy of the page. */}
          {(!heroPage || heroMode === 'menu') && <>
          {shown ? result ? <video key={shown} className="custom-media" src={shown} autoPlay loop muted playsInline/>
            : video ? <LoopPreview key={source} src={source} piece={duration ? piece : { start: 0, end: 1e9 }} crossfade={duration ? crossfade : 0} style={mediaStyle}
              onMeta={(element) => { measured(element.videoWidth, element.videoHeight); if (Number.isFinite(element.duration)) {
                const length = element.duration, restored = pending.current;
                setDuration(length); setPiece(fitPiece(restored?.piece || { start: 0, end: length }, length, 'start'));
                if (restored) { setCrossfade(restored.crossfade); pending.current = null; }
              } }}
              onTime={(t) => { if (playhead.current && duration) playhead.current.style.left = `${(t / duration) * 100}%`; }}/>
            : <img key={shown} className="custom-media" src={shown} alt="" draggable={false} style={mediaStyle} onLoad={(event) => measured(event.target.naturalWidth, event.target.naturalHeight)}/>
            : !fetching && <div className="custom-drop"><button type="button" className="custom-drop-pick" onClick={() => input.current?.click()}><Icon name="plus"/><strong>Перетащи сюда картинку, GIF или видео</strong><span>или нажми, чтобы выбрать файл</span></button>
              <p className="custom-drop-sources"><span>Где взять:</span><a className="is-workshop" href={`${CATALOG_PATH}?backgrounds`}>Готовые в мастерской</a>{SOURCES.map((source) => <a key={source.name} href={source.url} target="_blank" rel="noreferrer">{source.name}</a>)}</p></div>}
          {shown && <div className="custom-veil" style={{ opacity: result ? 0 : look.veil }}/>}
          </>}
          {heroPage && heroMode === 'own' && (heroShown ? result?.heroUrl ? <video key={heroShown} className="custom-media" src={heroShown} autoPlay loop muted playsInline/>
            : heroVideo ? <LoopPreview key={heroSource} src={heroSource} piece={heroDuration ? heroPiece : { start: 0, end: 1e9 }} crossfade={heroDuration ? heroCrossfade : 0} style={heroStyle}
              onMeta={(element) => { heroMeasured(element.videoWidth, element.videoHeight); if (Number.isFinite(element.duration)) {
                const length = element.duration, restored = heroPending.current;
                setHeroDuration(length); setHeroPiece(fitPiece(restored?.piece || { start: 0, end: length }, length, 'start'));
                if (restored) { setHeroCrossfade(restored.crossfade); heroPending.current = null; }
              } }}
              onTime={(t) => { if (heroPlayhead.current && heroDuration) heroPlayhead.current.style.left = `${(t / heroDuration) * 100}%`; }}/>
            : <img key={heroShown} className="custom-media" src={heroShown} alt="" draggable={false} style={heroStyle} onLoad={(event) => heroMeasured(event.target.naturalWidth, event.target.naturalHeight)}/>
            : <div className="custom-drop"><button type="button" className="custom-drop-pick" onClick={() => heroInput.current?.click()}><Icon name="plus"/><strong>Фон за героем</strong><span>Перетащи картинку, GIF или видео или нажми, чтобы выбрать</span></button></div>)}
          {heroPage && heroMode === 'own' && heroShown && <div className="custom-veil" style={{ opacity: result?.heroUrl ? 0 : heroLook.veil }}/>}
          {heroPage && heroMode === 'off' && <div className="custom-hero-default"/>}
          {/* The hero can be turned once there is a background behind it; until then it stands behind the «+». */}
          {heroPage ? <DotaHeroPage interactive={heroMode === 'off' || Boolean(heroMode === 'own' ? heroShown : shown)}/> : <DotaMenu clean={clean}/>}
          {fetching && <div className="custom-fetching" role="status"><b>{fetching.title ? `Загружаем «${fetching.title}»` : 'Загружаем фон…'}</b><span><i style={{ width: `${Math.round(fetching.progress * 100)}%` }}/></span></div>}
        </div>
      </div>
      {heroPage && heroMode === 'own' && heroVideo && heroDuration > 0 && !result ? <TrimBar duration={heroDuration} piece={heroPiece} crossfade={heroCrossfade} playhead={heroPlayhead} onChange={setHeroPiece} onCrossfade={setHeroCrossfade}/>
      : heroPage ? <p className="custom-caption">{heroMode === 'off' ? 'За героем останется картинка Dota — меняется только главное меню.' : result ? <><b>Готовый фон</b> — так он будет за героем.</> : 'Так фон будет за героем на странице «Герои» → «Снаряжение».'}</p>
      : video && duration > 0 && !result ? <TrimBar duration={duration} piece={piece} crossfade={crossfade} playhead={playhead} onChange={setPiece} onCrossfade={setCrossfade}/>
      : <p className="custom-caption">{result ? <><b>Готовый фон</b> — ровно то видео, что внутри файла.{studio?.saved ? <> <a href={`${STUDIO_PATH}&show=backgrounds`}>Сохранён в студии</a>.</> : studio?.failed ? ' Сохранить в студии не получилось.' : ''}</> : shown ? 'Так фон будет выглядеть в главном меню Dota.' : 'Главное меню Dota с выбранными пропорциями экрана.'}</p>}
    </section>
    <aside className="custom-panel">
      <div className="custom-panel-body">
        <header className="custom-panel-head"><SegmentSwitch label="Какой фон" value={page} options={PAGES} onChange={setPage}/>
          <h1>{heroPage ? 'Фон за героем' : 'Фон главного меню'}</h1>
          <p>{heroPage ? 'На странице героя — «Герои» → «Снаряжение», за моделью героя. Собирается в тот же файл, что и главное меню.' : 'Картинка, GIF или видео — готовый файл для Dota. Всё собирается в браузере, файл никуда не загружается.'}</p></header>
        <input ref={input} type="file" accept={ACCEPT} className="catalog-file" onChange={(event) => { choose(event.target.files[0]); event.target.value = ''; }}/>
        <input ref={heroInput} type="file" accept={ACCEPT} className="catalog-file" onChange={(event) => { chooseHero(event.target.files[0]); event.target.value = ''; }}/>
        {heroPage ? <>
          <Field label="Фон" hint={HERO_HINTS[heroMode]}><Segmented label="Фон за героем" value={heroMode} onChange={setHeroMode} options={HERO_MODES}/></Field>
          {heroMode === 'own' && <>
            {heroWanted && <Notice>Чтобы собрать фон за героем как раньше, выбери его файл: <b>{heroWanted.name}</b>, {fileSize(heroWanted.size)}. Настройки уже стоят.</Notice>}
            <Field label="Файл" hint={<>PNG, JPEG, WebP, GIF, MP4, WebM до {megabytes(MENU_LIMITS.bytes)} МБ. Пропорции экрана — как у главного меню ({aspect}).</>}>
              {heroFile ? <div className="custom-file-card"><span className="custom-file-kind">{heroKind.label}</span><span className="custom-file-name"><b title={heroFile.name}>{heroFile.name}</b><small>{fileSize(heroFile.size)}</small></span>
                <button type="button" className="catalog-icon custom-file-remove" onClick={removeHero} aria-label="Убрать фон за героем" title="Убрать фон"><Icon name="close"/></button></div>
                : <button type="button" className="custom-file-empty" onClick={() => heroInput.current?.click()}><Icon name="plus"/>Выбрать файл</button>}
            </Field>
            {heroFile ? <Field label="Картинка"><Segmented label="Как вписать фон за героем" value={heroFit} onChange={setHeroFit} options={[['cover', 'Заполнить'], ['contain', 'Целиком']]}/>
              <p className="custom-hint">{FITS[heroFit]}</p>
              <div className="custom-effects"><Slider label="Размытие" value={heroBlur} onChange={setHeroBlur}/><Slider label="Затемнение" value={heroDim} onChange={setHeroDim}/></div>
              <FrameControls frame={heroFrame} onChange={setHeroFrame}/></Field>
              : <p className="custom-hint">Пока файл не выбран, за героем будет фон главного меню.</p>}
          </>}
          {!file && heroMode !== 'off' && <Notice>Фон за героем собирается вместе с главным меню: сначала выбери фон на вкладке «Главное меню».</Notice>}
        </> : <>
        {wanted && <Notice>Чтобы изменить «{studio?.name}», выбери исходный файл: <b>{wanted.name}</b>, {fileSize(wanted.size)}. Настройки фона уже стоят.</Notice>}
        {note && <Notice>{note}</Notice>}
        <Field label="Файл" hint={<>PNG, JPEG, WebP, GIF, MP4, WebM до {megabytes(MENU_LIMITS.bytes)} МБ. Из видео выбираешь отрезок до {MENU_LIMITS.seconds} с на шкале под превью, звук убирается. <button type="button" className="catalog-link" onClick={() => setSources(true)}>Где взять фон?</button></>}>
          {file ? <div className="custom-file-card"><span className="custom-file-kind">{kind.label}</span><span className="custom-file-name"><b title={file.name}>{file.name}</b><small>{fileSize(file.size)}</small></span>
            <button type="button" className="catalog-icon custom-file-remove" onClick={remove} aria-label="Убрать фон" title="Убрать фон"><Icon name="close"/></button></div>
            : <button type="button" className="custom-file-empty" onClick={() => input.current?.click()}><Icon name="plus"/>Выбрать файл</button>}
        </Field>
        <Field label="Экран" hint={ASPECTS[aspect]}><Segmented label="Экран" value={aspect} onChange={setAspect} options={Object.keys(ASPECTS).map((value) => [value, value])}/></Field>
        <Field label="Картинка"><Segmented label="Как вписать" value={fit} onChange={setFit} options={[['cover', 'Заполнить'], ['contain', 'Целиком']]}/>
          <p className="custom-hint">{FITS[fit]}</p>
          <div className="custom-effects"><Slider label="Размытие" value={blur} onChange={setBlur}/><Slider label="Затемнение" value={dim} onChange={setDim}/></div>
          {file && <FrameControls frame={frame} onChange={setFrame}/>}</Field>
        <label className="custom-toggle"><input type="checkbox" role="switch" checked={clean} onChange={(event) => setClean(event.target.checked)}/><span><b>Скрыть новости на главной</b><small>Колонка справа не будет закрывать фон</small></span></label>
        <Field label="Папка в Dota" hint={target.hint}><Segmented label="Папка" value={folder} onChange={setFolder} options={[['russian', 'dota_russian'], ['custom', 'dota_123']]}/></Field>
        </>}
      </div>
      <footer className="custom-panel-foot">
        {error && <Notice error>{error}</Notice>}
        <Segmented label="Что скачать" value={delivery} onChange={setDelivery} options={DELIVERY}/>
        {progress !== null ? <div className="custom-progress" role="status"><span style={{ width: `${Math.round(progress * 100)}%` }}/><b>Собираем фон… {Math.round(progress * 100)}%</b>
          <button type="button" className="catalog-icon" aria-label="Отменить" onClick={() => running.current?.abort()}><Icon name="close"/></button></div>
          : result ? <button className="catalog-button primary" title={`${result.codec.toUpperCase()} · ${Math.round(result.seconds)} с${result.trimmed ? ', обрезано' : ''}`} onClick={() => download(result.blob)}><Icon name="download"/>{delivery === 'installer' ? 'Скачать с установщиком' : `Скачать ${target.file}`}<span className="custom-size">{fileSize(result.blob.size)}</span></button>
          : <button className="catalog-button primary" disabled={!file} onClick={() => build()}>Собрать фон</button>}
        {/* Publishing takes the built video; without one, the button builds it first. */}
        <div className="custom-foot-row"><button type="button" className="catalog-link custom-publish" disabled={!file || progress !== null || !!fetching} onClick={() => result ? setShare(true) : build({ publish: true })}><Icon name="upload"/>Опубликовать в мастерскую</button>
          <span className="custom-foot-links">
            <button type="button" className="catalog-link" onClick={() => setInstall(true)}>Как установить</button></span></div>
      </footer>
    </aside>
    {install && <Install folder={folder} delivery={delivery} onClose={() => setInstall(false)}/>}
    {sources && <Sources onClose={() => setSources(false)}/>}
    {share && result && <ShareBackground video={result.webm} aspect={result.aspect} onSent={(published) => saving.current?.then((record) => markPublished(record.id, published)).catch(() => {})} onClose={() => setShare(false)}/>}
  </main>;
}
