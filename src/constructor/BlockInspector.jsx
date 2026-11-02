import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon, Notice } from '../catalog/Common.jsx';
import { t } from '../../scripts/i18n.mjs';
import { BLOCK_HEROES, BLOCK_LIMITS, BLOCK_SOUNDS, BLOCK_TYPES, WIDGET_ACTIONS, WIDGET_COLORS, WIDGET_LIMITS, WIDGET_LINK_SITES, widgetLink } from '../../scripts/menu-widgets.mjs';
import { WIDGET_VIDEO } from '../customize/widget-pack.js';
import { Field, Segmented } from '../customize/ui.jsx';
import { fileSize } from '../customize/MenuBackground.jsx';
import { mediaFile } from '../customize/look-store.js';
import { mediaType, useMediaURL } from './live.js';
import { heroPortrait, heroTitle } from './BlockView.jsx';
import { Draft, Num, Range, Toggle } from './WidgetInspector.jsx';

// The right panel of «Редактор виджета» (2026-10-31): the selected block — its place and size in the design's
// pixels, opacity, the settings of its type (scripts/menu-widgets.mjs BLOCK_TYPES), hover and animation — or,
// with nothing selected, the design itself (size, background, corners). Every change goes to the editor, which
// checks it (cleanDesign) and keeps it in its undo history; `key` joins changes of one field into one step.
export const BLOCK_MEDIA_MB = 50;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'], VIDEO_TYPES = ['video/mp4', 'video/webm'];
export const MEDIA_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm';
// What a file is for a block: a picture (PNG, JPEG, WebP), or a video (MP4, WebM, and GIF: it moves, so it goes
// in as a video, as the menu pack makes one of it); '' for anything else.
export function mediaKind(file) {
  const type = file?.type || '', name = (file?.name || '').toLowerCase();
  if (type === 'image/gif' || name.endsWith('.gif')) return 'video';
  if (IMAGE_TYPES.includes(type) || /\.(png|jpe?g|webp)$/.test(name)) return 'image';
  if (VIDEO_TYPES.includes(type) || /\.(mp4|webm)$/.test(name)) return 'video';
  return '';
}
// Why a file cannot be a block's picture or video, or ''.
export function mediaProblem(file) {
  if (!mediaKind(file)) return t('Подойдёт картинка PNG, JPEG, WebP, GIF или видео MP4, WebM.');
  if (file.size > BLOCK_MEDIA_MB * 1_000_000) return t('Файл {size}, а можно до {limit} МБ.', { size: fileSize(file.size), limit: BLOCK_MEDIA_MB });
  return '';
}

const ALIGN = () => [['left', t('Слева')], ['center', t('По центру')], ['right', t('Справа')]];
const WEIGHT = () => [['normal', t('Обычный')], ['bold', t('Жирный')], ['black', t('Очень жирный')]];
export const ANIMS = () => [['none', t('Нет')], ['appear', t('Появление')], ['pulse', t('Пульсация')], ['slide', t('Сдвиг')]];
const HEX = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
const FILLS = ['#0d0f18', '#7c5cff', ...WIDGET_COLORS];

// A colour with its opacity (#rrggbb or #rrggbbaa): the palette, one's own colour, the code, and how opaque.
function ColorField({ label, value, onChange, colors = WIDGET_COLORS }) {
  const rgb = value.slice(0, 7), alpha = value.length === 9 ? parseInt(value.slice(7), 16) : 255;
  const make = (hex, a) => (a >= 255 ? hex : `${hex}${a.toString(16).padStart(2, '0')}`).toLowerCase();
  return <Field label={label}>
    <div className="kz-swatches" role="group" aria-label={label}>
      {colors.map((color) => <button key={color} type="button" style={{ '--c': color }} aria-pressed={rgb === color} title={color} onClick={() => onChange(make(color, alpha))}/>)}
      <label className={`kz-swatch-own${colors.includes(rgb) ? '' : ' is-on'}`} title={t('Свой цвет')}><input type="color" value={rgb} onChange={(event) => onChange(make(event.target.value, alpha))}/></label>
    </div>
    <div className="kz-color-row">
      <Draft className="kz-input kz-hex" value={value} maxLength={9} spellCheck={false} aria-label={t('Код цвета')} onChange={(text) => { const clean = text.trim(); if (HEX.test(clean)) onChange(clean.toLowerCase()); }}/>
      <Range label={t('Непрозрачность')} value={Math.round((alpha / 255) * 100)} min={0} max={100} unit="%" onChange={(percent) => onChange(make(rgb, Math.round(percent * 2.55)))}/>
    </div>
  </Field>;
}

// X, Y, Ш, В of the block (following a drag in progress), and its opacity.
function Place({ block, live, locked, onRect, onDone }) {
  const current = useSyncExternalStore(live.subscribe, live.get);
  const rect = current?.id === block.id ? current.rect : block, set = (key) => (value) => onRect({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, [key]: value });
  return <div className="kz-grid2">
    <Num label="X" value={rect.x} disabled={locked} onChange={set('x')} onDone={onDone}/>
    <Num label="Y" value={rect.y} disabled={locked} onChange={set('y')} onDone={onDone}/>
    <Num label={t('Ш')} value={rect.w} disabled={locked} onChange={set('w')} onDone={onDone}/>
    <Num label={t('В')} value={rect.h} disabled={locked} onChange={set('h')} onDone={onDone}/>
  </div>;
}

function MediaFields({ block, onProps, onMedia }) {
  const p = block.props, video = block.type === 'video', input = useRef(null), url = useMediaURL(p.media);
  const [file, setFile] = useState(null), [error, setError] = useState('');
  useEffect(() => { let gone = false; if (p.media) mediaFile(p.media).then((one) => { if (!gone) setFile(one); }); else setFile(null); return () => { gone = true; }; }, [p.media]);
  useEffect(() => setError(''), [block.id]);
  const pick = async (chosen) => {
    if (!chosen) return;
    const problem = mediaProblem(chosen);
    setError(problem);
    if (!problem) { const done = await onMedia(chosen); if (done) setError(done); }
  };
  return <>
    <Field label={t('Файл')} hint={video ? t('MP4, WebM или GIF до {limit} МБ. В Dota — первые {seconds} секунд по кругу, без звука.', { limit: BLOCK_MEDIA_MB, seconds: WIDGET_VIDEO.seconds })
      : t('PNG, JPEG или WebP до {limit} МБ. GIF станет видео — так он сохранит движение.', { limit: BLOCK_MEDIA_MB })}>
      {p.media && file ? <div className="kz-file">{url && (video && mediaType(p.media) !== 'image/gif' ? <video src={url} muted playsInline/> : <img src={url} alt=""/>)}<span><b title={file.name}>{file.name}</b><small>{fileSize(file.size)}</small></span>
        <button type="button" className="catalog-link" onClick={() => input.current?.click()}>{t('Заменить')}</button></div>
        : <button type="button" className="custom-file-empty" onClick={() => input.current?.click()}><Icon name="plus"/>{p.media ? t('Файла нет в этом браузере — выбери его снова') : video ? t('Выбрать видео') : t('Выбрать картинку')}</button>}
      <input ref={input} type="file" className="catalog-file" accept={MEDIA_ACCEPT} onChange={(event) => { const chosen = event.target.files?.[0]; event.target.value = ''; pick(chosen); }}/>
    </Field>
    {error && <Notice error>{error}</Notice>}
    <Field label={t('Как вписать')}><Segmented label={t('Как вписать')} value={p.fit} onChange={(fit) => onProps({ fit })} options={[['cover', t('Заполнить')], ['contain', t('Целиком')]]}/></Field>
    <div className="custom-effects is-one"><Range label={t('Скругление')} value={p.radius} min={0} max={128} unit=" px" onChange={(radius) => onProps({ radius }, 'radius')}/></div>
  </>;
}

function ButtonFields({ block, onProps }) {
  const p = block.props, [url, setUrl] = useState(p.url || ''), focused = useRef(false);
  useEffect(() => { if (!focused.current) setUrl(p.url || ''); }, [p.url]);
  const bad = p.action === 'link' && url.trim() && !widgetLink(url);
  return <>
    <Field label={t('Надпись')}><Draft id="kz-block-words" className="kz-input" value={p.label} maxLength={WIDGET_LIMITS.label} onChange={(label) => onProps({ label }, 'label')}/></Field>
    <Field label={t('Что открывает')}>
      <select className="kz-select" value={p.action} onChange={(event) => { const action = event.target.value, old = WIDGET_ACTIONS[p.action];
        onProps({ action, ...(p.label === t(old.title) || p.label === old.title ? { label: t(WIDGET_ACTIONS[action].title) } : {}) }); }}>
        {Object.entries(WIDGET_ACTIONS).map(([id, action]) => <option key={id} value={id}>{id === 'link' ? t('Ссылку в браузере Steam') : t(action.title)}</option>)}
      </select>
    </Field>
    {p.action === 'link' && <Field label={t('Ссылка')} hint={t('Только https и только эти сайты: {list}.', { list: WIDGET_LINK_SITES.join(', ') })}>
      <input className={`kz-input${bad ? ' is-bad' : ''}`} value={url} inputMode="url" placeholder="https://twitch.tv/…" aria-invalid={bad || undefined}
        onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; }}
        onChange={(event) => { const next = event.target.value; setUrl(next); const clean = widgetLink(next); if (clean || !next.trim()) onProps({ url: clean }, 'url'); }}/>
      {bad && <p className="kz-bad">{t('Такую ссылку Dota не откроет: нужна https-ссылка на один из сайтов ниже.')}</p>}
      {!p.url && !bad && <p className="custom-hint">{t('Пока ссылки нет, кнопка ничего не открывает.')}</p>}
    </Field>}
    <ColorField label={t('Заливка')} value={p.fill} colors={FILLS} onChange={(fill) => onProps({ fill }, 'fill')}/>
    <ColorField label={t('Цвет надписи')} value={p.color} onChange={(color) => onProps({ color }, 'color')}/>
    <div className="custom-effects"><Range label={t('Размер шрифта')} value={p.size} min={8} max={64} unit=" px" onChange={(size) => onProps({ size }, 'size')}/>
      <Range label={t('Скругление')} value={p.radius} min={0} max={64} unit=" px" onChange={(radius) => onProps({ radius }, 'radius')}/></div>
    <div className="custom-switches"><Toggle label={t('Заглавными')} checked={p.upper} onChange={(upper) => onProps({ upper })}/></div>
    <Field label={t('Где надпись')}><Segmented label={t('Где надпись')} value={p.align || 'center'} onChange={(align) => onProps({ align })} options={ALIGN()}/></Field>
    <Field label={t('Звук нажатия')} hint={t('Звуки самой Dota — как у её кнопок. На сайте не слышно, только в игре.')}>
      <select className="kz-select" value={p.sound} onChange={(event) => onProps({ sound: event.target.value })}>
        <option value="">{t('Без звука')}</option>
        {Object.entries(BLOCK_SOUNDS).map(([id, sound]) => <option key={id} value={id}>{t(sound.title)}</option>)}
      </select>
    </Field>
    <div className="custom-switches"><Toggle label={t('Тихий звук при наведении')} hint={t('Как у вкладок Dota')} checked={p.hoverSound} onChange={(hoverSound) => onProps({ hoverSound })}/></div>
    <p className="kz-note"><Icon name="shield" size={15}/><span>{t('Кнопка только открывает раздел Dota или ссылку, когда на неё нажимают. Искать игру, менять настройки или делать что-то за пользователя она не умеет.')}</span></p>
  </>;
}

function LineFields({ block, onProps, words = false }) {
  const p = block.props;
  return <>
    <div className="custom-effects"><Range label={t('Размер')} value={p.size} min={8} max={block.type === 'text' ? 120 : 160} unit=" px" onChange={(size) => onProps({ size }, 'size')}/>
      {words ? <Range label={t('Разрядка')} value={p.spacing} min={0} max={20} unit=" px" onChange={(spacing) => onProps({ spacing }, 'spacing')}/> : <span/>}</div>
    <Field label={t('Насыщенность')}><Segmented label={t('Насыщенность')} value={p.weight} onChange={(weight) => onProps({ weight })} options={WEIGHT()}/></Field>
    <Field label={t('Выравнивание')}><Segmented label={t('Выравнивание')} value={p.align} onChange={(align) => onProps({ align })} options={ALIGN()}/></Field>
    <ColorField label={t('Цвет')} value={p.color} onChange={(color) => onProps({ color }, 'color')}/>
  </>;
}

// The heroes by their names on the site (BlockView.jsx heroTitle).
const heroOptions = () => BLOCK_HEROES.map((name) => [name, heroTitle(name)]).sort((a, b) => a[1].localeCompare(b[1]));
function HeroFields({ block, onProps }) {
  const p = block.props, src = heroPortrait(p.hero);
  return <>
    <Field label={t('Какой герой')}>
      <div className="kz-hero-pick">{src && <img src={src} alt=""/>}
        <select className="kz-select" value={p.hero} onChange={(event) => onProps({ hero: event.target.value })}>
          {heroOptions().map(([name, title]) => <option key={name} value={name}>{title}</option>)}
        </select></div>
    </Field>
    <Field label={t('Как показать')}><Segmented label={t('Как показать')} value={p.view} onChange={(view) => onProps({ view })} options={[['model', t('3D-модель')], ['movie', t('Живой портрет')], ['image', t('Картинка')]]}/></Field>
    {p.view === 'model' && <div className="custom-switches"><Toggle label={t('Крутить мышью')} hint={t('Героя можно повернуть, потянув курсором')} checked={p.rotate} onChange={(rotate) => onProps({ rotate })}/></div>}
    <p className="custom-hint">{{ model: t('Dota рисует героя в 3D сама, в его стандартном облике. На сайте — его портрет.'), movie: t('Портрет из выбора героя: он двигается.'), image: t('Портрет героя, как в выборе героя.') }[p.view]}</p>
  </>;
}

function TypeFields({ block, onProps, onMedia }) {
  const p = block.props;
  switch (block.type) {
    case 'text': return <>
      <Field label={t('Текст')}><Draft id="kz-block-words" multiline rows={2} className="kz-input" value={p.text} maxLength={WIDGET_LIMITS.text} onChange={(text) => onProps({ text }, 'text')}/></Field>
      <LineFields block={block} onProps={onProps} words/>
      <div className="custom-switches"><Toggle label={t('Тень')} hint={t('Читается на любом фоне')} checked={p.shadow} onChange={(shadow) => onProps({ shadow })}/>
        <Toggle label={t('Заглавными')} checked={p.upper} onChange={(upper) => onProps({ upper })}/></div>
    </>;
    case 'button': return <ButtonFields block={block} onProps={onProps}/>;
    case 'shape': return <>
      <ColorField label={p.fill2 ? t('Первый цвет') : t('Заливка')} value={p.fill} colors={FILLS} onChange={(fill) => onProps({ fill }, 'fill')}/>
      <div className="custom-switches"><Toggle label={t('Градиент')} hint={t('Плавный переход во второй цвет')} checked={!!p.fill2} onChange={(on) => onProps({ fill2: on ? '#00000000' : '' })}/></div>
      {p.fill2 && <>
        <ColorField label={t('Второй цвет')} value={p.fill2} colors={FILLS} onChange={(fill2) => onProps({ fill2 }, 'fill2')}/>
        <Field label={t('Направление')}><Segmented label={t('Направление')} value={p.direction} onChange={(direction) => onProps({ direction })} options={[['down', t('Вниз')], ['right', t('Вправо')], ['diagonal', t('По диагонали')]]}/></Field>
      </>}
      <div className="custom-effects is-one"><Range label={t('Скругление')} value={p.radius} min={0} max={256} unit=" px" onChange={(radius) => onProps({ radius }, 'radius')}/></div>
      <div className="custom-switches"><Toggle label={t('Рамка')} checked={!!p.border && p.borderWidth > 0} onChange={(on) => onProps(on ? { border: p.border || '#ffffff33', borderWidth: p.borderWidth || 1 } : { border: '', borderWidth: 0 })}/></div>
      {p.border && p.borderWidth > 0 && <>
        <ColorField label={t('Цвет рамки')} value={p.border} onChange={(border) => onProps({ border }, 'border')}/>
        <div className="custom-effects is-one"><Range label={t('Толщина рамки')} value={p.borderWidth} min={1} max={16} unit=" px" onChange={(borderWidth) => onProps({ borderWidth }, 'borderWidth')}/></div>
      </>}
    </>;
    case 'progress': return <>
      <div className="custom-effects is-one"><Range label={t('Заполнено')} value={p.value} min={0} max={100} unit="%" onChange={(value) => onProps({ value }, 'value')}/></div>
      <p className="custom-hint">{t('Полоса стоит на этом значении — сама она не движется.')}</p>
      <ColorField label={t('Заполненная часть')} value={p.fill} onChange={(fill) => onProps({ fill }, 'fill')}/>
      <ColorField label={t('Дорожка')} value={p.track} onChange={(track) => onProps({ track }, 'track')}/>
      <div className="custom-effects is-one"><Range label={t('Скругление')} value={p.radius} min={0} max={64} unit=" px" onChange={(radius) => onProps({ radius }, 'radius')}/></div>
    </>;
    case 'clock': return <>
      <Field label={t('Формат')}><Segmented label={t('Формат')} value={p.format} onChange={(format) => onProps({ format })} options={[['24', t('24 часа')], ['12', t('12 часов')]]}/></Field>
      <div className="custom-switches"><Toggle label={t('Секунды')} checked={p.seconds} onChange={(seconds) => onProps({ seconds })}/></div>
      <LineFields block={block} onProps={onProps}/>
      <p className="custom-hint">{t('Время — то, что на компьютере, где стоит Dota.')}</p>
    </>;
    case 'timer': return <>
      <Field label={t('Дата и время')} hint={p.until ? t('Время — то, что на компьютере, где стоит Dota. Когда наступит, таймер напишет «Уже началось».') : t('Пока даты нет, таймер показывает прочерки.')}>
        <input className="kz-input" type="datetime-local" value={p.until} onChange={(event) => onProps({ until: event.target.value.slice(0, 16) })}/></Field>
      <LineFields block={block} onProps={onProps}/>
    </>;
    case 'image': case 'video': return <MediaFields block={block} onProps={onProps} onMedia={onMedia}/>;
    case 'avatar': return <>
      <div className="custom-effects is-one"><Range label={t('Скругление')} value={p.radius} min={0} max={256} unit=" px" onChange={(radius) => onProps({ radius }, 'radius')}/></div>
      <div className="custom-switches"><Toggle label={t('Рамка')} checked={!!p.border && p.borderWidth > 0} onChange={(on) => onProps(on ? { border: p.border || '#ffffff55', borderWidth: p.borderWidth || 2 } : { border: '', borderWidth: 0 })}/></div>
      {p.border && p.borderWidth > 0 && <>
        <ColorField label={t('Цвет рамки')} value={p.border} onChange={(border) => onProps({ border }, 'border')}/>
        <div className="custom-effects is-one"><Range label={t('Толщина рамки')} value={p.borderWidth} min={1} max={16} unit=" px" onChange={(borderWidth) => onProps({ borderWidth }, 'borderWidth')}/></div>
      </>}
      <p className="custom-hint">{t('В Dota здесь будет аватар Steam того, у кого стоит Dota. Скругление в половину стороны — круг.')}</p>
    </>;
    case 'nickname': return <>
      <LineFields block={block} onProps={onProps}/>
      <div className="custom-switches"><Toggle label={t('Тень')} hint={t('Читается на любом фоне')} checked={p.shadow} onChange={(shadow) => onProps({ shadow })}/>
        <Toggle label={t('Заглавными')} checked={p.upper} onChange={(upper) => onProps({ upper })}/></div>
      <p className="custom-hint">{t('В Dota здесь будет ник того, у кого она стоит. На сайте — пример.')}</p>
    </>;
    case 'hero': return <HeroFields block={block} onProps={onProps}/>;
    default: return null;
  }
}

export function BlockInspector({ block, live, locked, state, onRect, onDone, onBlock, onProps, onMedia, onReplay, onTool }) {
  const def = BLOCK_TYPES[block.type];
  return <>
    <section className="kz-sec">
      <div className="kz-sec-head"><span className="custom-label">{t('Место и размер')}</span><span className="custom-aside">{t('в пикселях виджета')}</span></div>
      <Place block={block} live={live} locked={locked} onRect={onRect} onDone={onDone}/>
      <div className="custom-effects is-one"><Range label={t('Видимость')} value={block.opacity} min={0} max={100} unit="%" onChange={(opacity) => onBlock({ opacity }, 'opacity')}/></div>
      {block.opacity === 0 && <p className="custom-hint">{t('Блок скрыт: в Dota его не будет видно.')}</p>}
    </section>
    <section className="kz-sec kz-fields cz-mod-fields">
      <span className="custom-label">{t(def.title)}</span>
      <TypeFields block={block} onProps={onProps} onMedia={onMedia}/>
    </section>
    <section className="kz-sec kz-fields cz-mod-fields">
      <Field label={t('Подсказка')} hint={t('Окошко Dota с этими словами, когда на блок наводят курсор. Пусто — без подсказки.')}>
        <Draft className="kz-input" value={block.tip || ''} maxLength={BLOCK_LIMITS.tip} placeholder={t('Например: «Мой Twitch — заходи!»')} onChange={(tip) => onBlock({ tip }, 'tip')}/></Field>
    </section>
    <section className={`kz-sec${state !== 'normal' ? ' is-focus' : ''}`}>
      <div className="kz-sec-head"><span className="custom-label">{t('При наведении')}</span>{state !== 'normal' && <span className="custom-aside">{state === 'hover' ? t('смотришь наведение') : t('смотришь нажатие')}</span>}</div>
      <div className="custom-switches"><Toggle label={t('Ярче и чуть крупнее')} hint={block.type === 'button' ? t('Так кнопка показывает, что на неё можно нажать') : t('Под курсором блок светлеет и подрастает')} checked={block.hover} onChange={(hover) => onBlock({ hover })}/></div>
    </section>
    <section className="kz-sec">
      <div className="kz-sec-head"><span className="custom-label">{t('Анимация')}</span>{block.anim !== 'none' && <button type="button" className="catalog-link kz-replay" onClick={onReplay}><Icon name="play" size={13}/>{t('Проиграть')}</button>}</div>
      <Segmented label={t('Анимация')} value={block.anim} onChange={(anim) => onBlock({ anim })} options={ANIMS()} compact/>
      <p className="custom-hint">{{ none: t('Блок просто стоит на месте.'), appear: t('Плавно проявляется, когда открывается меню.'), pulse: t('Мягко пульсирует, всё время.'), slide: t('Выезжает слева, когда открывается меню.') }[block.anim]}</p>
    </section>
    <section className="kz-sec kz-sec-actions">
      <button type="button" className="catalog-button" onClick={() => onTool('dup')}><Icon name="copy"/>{t('Дублировать')}</button>
      <button type="button" className="catalog-button danger" onClick={() => onTool('delete')}><Icon name="trash"/>{t('Удалить')}</button>
    </section>
  </>;
}

// The design's sizes to start from: Dota's news card, a strip, a square; or one's own.
export const SIZE_PRESETS = () => [['news', t('Как карточка новостей'), 330, 484], ['strip', t('Полоса'), 600, 120], ['square', t('Квадрат'), 300, 300]];
export const presetOf = ([w, h]) => SIZE_PRESETS().find(([, , pw, ph]) => pw === w && ph === h) || null;

export function DesignInspector({ design, inMenu, onDesign, onSize, onDone }) {
  const [W, H] = design.size, preset = presetOf(design.size), [own, setOwn] = useState(!preset);
  useEffect(() => { if (!preset) setOwn(true); }, [preset]);
  const media = design.blocks.filter((b) => (b.type === 'image' || b.type === 'video') && b.props.media).length;
  return <>
    <section className="kz-sec">
      <span className="custom-label">{t('Размер')}</span>
      <div className="kz-presets" role="radiogroup" aria-label={t('Размер')}>
        {SIZE_PRESETS().map(([id, title, w, h]) => <button key={id} type="button" role="radio" aria-checked={!own && preset?.[0] === id} onClick={() => { setOwn(false); onSize([w, h]); }}>
          <span className="kz-preset-box"><span className="kz-preset-ic" style={{ width: Math.round(w * Math.min(26 / w, 18 / h)), height: Math.round(h * Math.min(26 / w, 18 / h)) }}/></span><span>{title}</span><small>{w} × {h}</small></button>)}
        <button type="button" role="radio" aria-checked={own} onClick={() => setOwn(true)}><span className="kz-preset-box"><span className="kz-preset-ic is-own"/></span><span>{t('Свой размер')}</span>{own && <small>{W} × {H}</small>}</button>
      </div>
      {own && <div className="kz-grid2">
        <Num label={t('Ш')} value={W} onChange={(w) => onSize([w, H], 'size')} onDone={onDone}/>
        <Num label={t('В')} value={H} onChange={(h) => onSize([W, h], 'size')} onDone={onDone}/>
      </div>}
      <p className="custom-hint">{t('В пикселях экрана 1080p. В конструкторе виджет можно растянуть целиком — блоки вырастут вместе с ним.')}</p>
    </section>
    <section className="kz-sec kz-fields cz-mod-fields">
      <div className="custom-switches"><Toggle label={t('Фон виджета')} hint={t('Без фона сквозь виджет видно меню')} checked={!!design.background} onChange={(on) => onDesign({ background: on ? '#0d0f18e6' : '' })}/></div>
      {design.background && <ColorField label={t('Цвет фона')} value={design.background} colors={FILLS} onChange={(background) => onDesign({ background }, 'background')}/>}
      <div className="custom-effects is-one"><Range label={t('Скругление углов')} value={design.radius} min={0} max={128} unit=" px" onChange={(radius) => onDesign({ radius }, 'radius')}/></div>
    </section>
    <section className="kz-sec">
      <ul className="kz-facts">
        <li><Icon name="layers" size={15}/><span>{t('Блоков: {count} из {limit}', { count: design.blocks.length, limit: BLOCK_LIMITS.blocks })}</span></li>
        {media > 0 && <li><Icon name="image" size={15}/><span>{t('Картинок и видео: {count}', { count: media })}</span></li>}
        <li><Icon name="groupPlus" size={15}/><span>{inMenu ? t('Стоит в меню: {count}', { count: inMenu }) : t('Пока не в меню')}</span></li>
      </ul>
      <p className="kz-note"><Icon name="shield" size={15}/><span>{t('Виджет собирается только из блоков, без кода: кнопки открывают лишь разделы Dota и ссылки из списка.')}</span></p>
      <p className="kz-note"><Icon name="mouse" size={15}/><span>{t('Блок можно бросить на виджет из списка слева или просто нажать — встанет в середину. Alt — без прилипания, Shift — с пропорциями, стрелки двигают на 1 px (с Shift — на 10).')}</span></p>
    </section>
  </>;
}
