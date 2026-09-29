import { useEffect, useRef, useState } from 'react';
import { Icon, Modal, Notice } from '../catalog/Common.jsx';
import { MENU_LIMITS, MENU_SIZES, fitPiece, mediaKind, menuLook } from '../../scripts/menu-background.mjs';
import menuMeta from '../../assets/dota-menu/meta.json';
import { FOLDERS, downloadPack, packBackground } from './background-pack.js';
import { getBackground } from '../../scripts/background-library.mjs';
import { markPublished, pullRecipes, rememberDownload, saveBuiltBackground } from '../studio-backgrounds.js';
import { CopyField, Field, InstallWindow, Segmented } from './CustomizeApp.jsx';
import DotaMenu from './DotaMenu.jsx';
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
  const [blur, setBlur] = useState(0), [dim, setDim] = useState(0);
  const [clean, setClean] = useState(false), [folder, setFolder] = useState('russian'), [delivery, setDelivery] = useState('file');
  const [duration, setDuration] = useState(0), [piece, setPiece] = useState({ start: 0, end: 0 }), [crossfade, setCrossfade] = useState(0);
  const [mediaRatio, setMediaRatio] = useState(0), [progress, setProgress] = useState(null), [result, setResult] = useState(null), [error, setError] = useState(''), [install, setInstall] = useState(false), [sources, setSources] = useState(false), [share, setShare] = useState(false), [dragging, setDragging] = useState(false), [fetching, setFetching] = useState(null);
  const input = useRef(null), running = useRef(null), shownGuide = useRef(false), playhead = useRef(null);
  // What the file is (for the studio recipe), the studio background being changed, the recipe whose
  // piece and crossfade wait for the video's length, and an own file the user is asked to choose.
  const [origin, setOrigin] = useState(null), [pick, setPick] = useState(preset), [studio, setStudio] = useState(null), [wanted, setWanted] = useState(null), [note, setNote] = useState('');
  const studioId = useRef(null), pending = useRef(null), saving = useRef(null);
  useEffect(() => { setPick(preset); }, [preset]);
  useEffect(() => () => source && URL.revokeObjectURL(source), [source]);
  useEffect(() => () => result && URL.revokeObjectURL(result.url), [result]);
  // Changing anything that is baked into the video or the pack makes the result stale.
  useEffect(() => { setResult(null); }, [file, aspect, fit, blur, dim, clean, piece.start, piece.end, crossfade]);
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
      setAspect(recipe.aspect); setFit(recipe.fit); setBlur(recipe.blur); setDim(recipe.dim); setClean(recipe.clean); setFolder(recipe.folder); setDelivery(recipe.delivery);
      pending.current = recipe; studioId.current = record.id; setStudio({ id: record.id, name: record.name, saved: false });
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
    if (!pending.current) { studioId.current = null; setStudio(null); }
    else if (wanted && (next.name !== wanted.name || next.size !== wanted.size)) setNote('Это не тот файл, из которого собран фон: настройки применены, но отрезок может не совпасть.');
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
      const encoded = await encodeMenuVideo(file, { size: MENU_SIZES[aspect], fit, effects: { blur: blur / 100, dim: dim / 100 }, piece: duration ? piece : null, crossfade, signal: controller.signal, onProgress: (value) => setProgress(Math.min(0.99, value)) });
      const blob = packBackground(encoded.video, { clean });
      // Kept in the studio: this browser gets the WebM, a signed-in account the recipe.
      const recipe = { aspect, fit, blur, dim, clean, folder, delivery, piece: duration ? piece : null, crossfade: duration ? crossfade : 0, source: origin };
      saving.current = saveBuiltBackground({ id: studioId.current, recipe, video: encoded.video, codec: encoded.codec, seconds: encoded.seconds });
      saving.current.then((record) => { studioId.current = record.id; setStudio({ id: record.id, name: record.name, saved: true }); })
        .catch(() => setStudio((current) => ({ ...current, failed: true })));
      setResult({ blob, webm: encoded.video, aspect, url: URL.createObjectURL(new Blob([encoded.video], { type: 'video/webm' })), seconds: encoded.seconds, trimmed: encoded.trimmed, codec: encoded.codec, video: encoded.video.length });
      if (publish) return setShare(true);
      await download(blob);
      if (!shownGuide.current) { shownGuide.current = true; setInstall(true); }
    } catch (e) {
      if (!controller.signal.aborted) setError(e?.message || 'Не получилось собрать фон. Попробуй другой файл.');
    } finally { if (running.current === controller) running.current = null; setProgress(null); }
  }
  const video = kind?.type === 'video', shown = result?.url || source;
  // The media is always contained; «Заполнить» scales it up by the cover/contain ratio, so switching
  // the fit or the screen shape animates instead of jumping.
  const [screenWidth, screenHeight] = MENU_SIZES[aspect], screenRatio = screenWidth / screenHeight;
  // Blur and dim as the video will have them: σ as a share of the screen's height (--blur, used with
  // cq units in customize.css), the veil a black layer; the built video has them baked in.
  const look = menuLook({ blur: blur / 100, dim: dim / 100 });
  const zoom = !result ? (fit === 'cover' && mediaRatio ? Math.max(screenRatio / mediaRatio, mediaRatio / screenRatio) : 1) * look.zoom : 1;
  const measured = (width, height) => width && height && setMediaRatio(width / height);
  const mediaStyle = { transform: `scale(${zoom})`, '--blur': result ? 0 : look.sigma / 1080 };
  const drop = { onDragOver: (event) => { event.preventDefault(); setDragging(true); }, onDragLeave: () => setDragging(false),
    onDrop: (event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0]); } };
  return <main className="custom-work">
    <section className={`custom-stage${dragging ? ' is-over' : ''}`} {...drop} aria-label="Превью фона">
      <div className="custom-stage-area">
        <div className="custom-screen" style={{ '--ratio': screenRatio }}>
          {shown ? result ? <video key={shown} className="custom-media" src={shown} autoPlay loop muted playsInline/>
            : video ? <LoopPreview key={source} src={source} piece={duration ? piece : { start: 0, end: 1e9 }} crossfade={duration ? crossfade : 0} style={mediaStyle}
              onMeta={(element) => { measured(element.videoWidth, element.videoHeight); if (Number.isFinite(element.duration)) {
                const length = element.duration, restored = pending.current;
                setDuration(length); setPiece(fitPiece(restored?.piece || { start: 0, end: length }, length, 'start'));
                if (restored) { setCrossfade(restored.crossfade); pending.current = null; }
              } }}
              onTime={(t) => { if (playhead.current && duration) playhead.current.style.left = `${(t / duration) * 100}%`; }}/>
            : <img key={shown} className="custom-media" src={shown} alt="" style={mediaStyle} onLoad={(event) => measured(event.target.naturalWidth, event.target.naturalHeight)}/>
            : !fetching && <div className="custom-drop"><button type="button" className="custom-drop-pick" onClick={() => input.current?.click()}><Icon name="plus"/><strong>Перетащи сюда картинку, GIF или видео</strong><span>или нажми, чтобы выбрать файл</span></button>
              <p className="custom-drop-sources"><span>Где взять:</span><a className="is-workshop" href={`${CATALOG_PATH}?backgrounds`}>Готовые в мастерской</a>{SOURCES.map((source) => <a key={source.name} href={source.url} target="_blank" rel="noreferrer">{source.name}</a>)}</p></div>}
          {shown && <div className="custom-veil" style={{ opacity: result ? 0 : look.veil }}/>}
          <DotaMenu clean={clean}/>
          {fetching && <div className="custom-fetching" role="status"><b>{fetching.title ? `Загружаем «${fetching.title}»` : 'Загружаем фон…'}</b><span><i style={{ width: `${Math.round(fetching.progress * 100)}%` }}/></span></div>}
        </div>
      </div>
      {video && duration > 0 && !result ? <TrimBar duration={duration} piece={piece} crossfade={crossfade} playhead={playhead} onChange={setPiece} onCrossfade={setCrossfade}/>
      : <p className="custom-caption">{result ? <><b>Готовый фон</b> — ровно то видео, что внутри файла.{studio?.saved ? <> <a href={`${STUDIO_PATH}&show=backgrounds`}>Сохранён в студии</a>.</> : studio?.failed ? ' Сохранить в студии не получилось.' : ''}</> : shown ? 'Так фон будет выглядеть в главном меню Dota.' : 'Главное меню Dota с выбранными пропорциями экрана.'}</p>}
    </section>
    <aside className="custom-panel">
      <div className="custom-panel-body">
        <header className="custom-panel-head"><h1>Фон главного меню</h1><p>Картинка, GIF или видео — готовый файл для Dota. Всё собирается в браузере, файл никуда не загружается.</p></header>
        <input ref={input} type="file" accept={ACCEPT} className="catalog-file" onChange={(event) => { choose(event.target.files[0]); event.target.value = ''; }}/>
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
          <div className="custom-effects"><Slider label="Размытие" value={blur} onChange={setBlur}/><Slider label="Затемнение" value={dim} onChange={setDim}/></div></Field>
        <label className="custom-toggle"><input type="checkbox" role="switch" checked={clean} onChange={(event) => setClean(event.target.checked)}/><span><b>Скрыть новости на главной</b><small>Колонка справа не будет закрывать фон</small></span></label>
        <Field label="Папка в Dota" hint={target.hint}><Segmented label="Папка" value={folder} onChange={setFolder} options={[['russian', 'dota_russian'], ['custom', 'dota_123']]}/></Field>
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
