import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon, Notice } from '../catalog/Common.jsx';
import { t } from '../../scripts/i18n.mjs';
import { WIDGET_ACTIONS, WIDGET_ANCHORS, WIDGET_COLORS, WIDGET_LIMITS, WIDGET_LINK_SITES, WIDGET_TYPES, widgetLink } from '../../scripts/menu-widgets.mjs';
import { Field, Segmented } from '../customize/ui.jsx';
import { fileSize } from '../customize/MenuBackground.jsx';
import { useMediaURL } from './WidgetView.jsx';
import { mediaFile } from '../customize/look-store.js';

// The inspector of a widget (2026-10-31): its place in 1080p pixels with the anchor it keeps on other
// screens, its opacity, a warning when it covers one of Valve's panels, and the settings of its type
// (scripts/menu-widgets.mjs WIDGET_TYPES). Every change goes to the page (`onProps`, `onWidget`), which
// keeps it (widget-store.js) and in its undo history.
const ANCHOR_HINTS = () => ({
  tl: t('к левому верхнему углу'), tc: t('к верхнему краю, по центру'), tr: t('к правому верхнему углу'),
  ml: t('к левому краю'), mc: t('к центру экрана'), mr: t('к правому краю'),
  bl: t('к левому нижнему углу'), bc: t('к нижнему краю, по центру'), br: t('к правому нижнему углу')
});
const ALIGN = () => [['left', t('Слева')], ['center', t('По центру')], ['right', t('Справа')]];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], VIDEO_TYPES = ['video/mp4', 'video/webm'];
const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif', VIDEO_ACCEPT = '.mp4,.webm,video/mp4,video/webm';
const kindOf = (file) => {
  const type = file.type || '', name = (file.name || '').toLowerCase();
  if (IMAGE_TYPES.includes(type) || /\.(png|jpe?g|webp|gif)$/.test(name)) return 'image';
  if (VIDEO_TYPES.includes(type) || /\.(mp4|webm)$/.test(name)) return 'video';
  return '';
};
// The file a picture or video widget can take: its kind, and why not.
export function mediaProblem(file, type) {
  const kind = kindOf(file);
  if (kind !== type) return type === 'image' ? t('Для картинки подойдёт PNG, JPEG, WebP или GIF.') : t('Для видео подойдёт MP4 или WebM.');
  if (file.size > WIDGET_LIMITS.media * 1_000_000) return t('Файл {size}, а можно до {limit} МБ: меню Dota будет открываться дольше.', { size: fileSize(file.size), limit: WIDGET_LIMITS.media });
  return '';
}

// A text field that keeps what is typed (spaces at the end, an empty line) while it has focus; the widget
// gets the cleaned value at once.
export function Draft({ value, onChange, multiline = false, ...props }) {
  const [text, setText] = useState(value), focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(value); }, [value]);
  const Tag = multiline ? 'textarea' : 'input';
  return <Tag {...props} value={text} onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setText(value); }}
    onChange={(event) => { const next = multiline ? event.target.value.replace(/\r?\n/g, ' ') : event.target.value; setText(next); onChange(next); }}/>;
}
export function Toggle({ label, hint, checked, onChange }) {
  return <label className="custom-toggle"><input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)}/><span><b>{label}</b>{hint && <small>{hint}</small>}</span></label>;
}
export function Range({ label, value, min, max, step = 1, unit = '', onChange }) {
  return <label className="custom-slider"><span>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} style={{ '--fill': `${((value - min) / (max - min)) * 100}%` }}/>
    <output>{value}{unit}</output></label>;
}
function Colors({ value, onChange }) {
  return <div className="kz-swatches" role="group" aria-label={t('Цвет')}>
    {WIDGET_COLORS.map((color) => <button key={color} type="button" style={{ '--c': color }} aria-pressed={value === color} title={color} onClick={() => onChange(color)}/>)}
    <label className={`kz-swatch-own${WIDGET_COLORS.includes(value) ? '' : ' is-on'}`} title={t('Свой цвет')}><input type="color" value={value} onChange={(event) => onChange(event.target.value)}/></label>
  </div>;
}
// X, Y, Ш, В: typed, or changed by dragging the letter sideways (Shift: by 10).
export function Num({ label, value, disabled, onChange, onDone }) {
  const [text, setText] = useState(String(value)), focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(String(value)); }, [value]);
  const scrub = (event) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    const start = value, px = event.clientX;
    document.body.classList.add('kz-scrubbing');
    const move = (ev) => onChange(Math.round(start + (ev.clientX - px) * (ev.shiftKey ? 10 : 1)));
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); document.body.classList.remove('kz-scrubbing'); onDone(); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };
  return <label className={`kz-num${disabled ? ' is-off' : ''}`}><span onPointerDown={scrub}>{label}</span>
    <input inputMode="numeric" value={text} disabled={disabled} onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setText(String(value)); onDone(); }}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
      onChange={(event) => { setText(event.target.value); const n = parseInt(event.target.value, 10); if (Number.isFinite(n)) onChange(n); }}/></label>;
}

function Place({ widget, live, locked, onRect, onAnchor, onDone }) {
  const current = useSyncExternalStore(live.subscribe, live.get);
  const rect = current?.id === widget.id ? current.rect : widget.rect, fixed = !!WIDGET_TYPES[widget.type]?.fixed;
  const anchor = current?.id === widget.id ? current.anchor : widget.anchor;
  // A widget of one's own keeps its design's proportions: one side gives the other.
  const ratio = widget.type === 'custom' && widget.props.design ? widget.props.design.size[0] / widget.props.design.size[1] : 0;
  const set = (key) => (value) => onRect(ratio && key === 'w' ? { ...rect, w: value, h: Math.round(value / ratio) } : ratio && key === 'h' ? { ...rect, h: value, w: Math.round(value * ratio) } : { ...rect, [key]: value });
  return <>
    <div className="kz-place">
      <div className="kz-anchor" role="radiogroup" aria-label={t('Привязка')}>{WIDGET_ANCHORS.map((a) =>
        <button key={a} type="button" role="radio" aria-checked={anchor === a} title={t('Держится {where}', { where: ANCHOR_HINTS()[a] })} onClick={() => onAnchor(a)}/>)}</div>
      <div className="kz-grid2">
        <Num label="X" value={rect.x} disabled={locked} onChange={set('x')} onDone={onDone}/>
        <Num label="Y" value={rect.y} disabled={locked} onChange={set('y')} onDone={onDone}/>
        <Num label={t('Ш')} value={rect.w} disabled={locked || fixed} onChange={set('w')} onDone={onDone}/>
        <Num label={t('В')} value={rect.h} disabled={locked || fixed} onChange={set('h')} onDone={onDone}/>
      </div>
    </div>
    <p className="custom-hint">{anchor === 'mc' ? t('Держится за центр экрана: на экранах 16:10 и 21:9 останется в центре.')
      : t('Держится {where}: на экранах 16:10 и 21:9 сохранит расстояние до этого края.', { where: ANCHOR_HINTS()[anchor] })}{fixed ? ` ${t('Размер этой панели Dota задаёт сама: 340 × 300.')}` : ''}</p>
  </>;
}

function MediaFields({ widget, onProps, onMedia }) {
  const p = widget.props, video = widget.type === 'video', input = useRef(null), url = useMediaURL(p.media);
  const [file, setFile] = useState(null), [error, setError] = useState('');
  useEffect(() => { let gone = false; if (p.media) mediaFile(p.media).then((one) => { if (!gone) setFile(one); }); else setFile(null); return () => { gone = true; }; }, [p.media]);
  const pick = async (chosen) => {
    if (!chosen) return;
    const problem = mediaProblem(chosen, widget.type);
    setError(problem);
    if (!problem) { const done = await onMedia(chosen); if (done) setError(done); }
  };
  return <>
    <Field label={t('Файл')} hint={video ? t('MP4 или WebM до {limit} МБ. Играет по кругу, без звука.', { limit: WIDGET_LIMITS.media }) : t('PNG, JPEG, WebP или GIF до {limit} МБ.', { limit: WIDGET_LIMITS.media })}>
      {p.media && file ? <div className="kz-file">{url && (video ? <video src={url} muted playsInline/> : <img src={url} alt=""/>)}<span><b title={file.name}>{file.name}</b><small>{fileSize(file.size)}</small></span>
        <button type="button" className="catalog-link" onClick={() => input.current?.click()}>{t('Заменить')}</button></div>
        : <button type="button" className="custom-file-empty" onClick={() => input.current?.click()}><Icon name="plus"/>{p.media ? t('Файла нет в этом браузере — выбери его снова') : video ? t('Выбрать видео') : t('Выбрать картинку')}</button>}
      <input ref={input} type="file" className="catalog-file" accept={video ? VIDEO_ACCEPT : IMAGE_ACCEPT} onChange={(event) => { const chosen = event.target.files?.[0]; event.target.value = ''; pick(chosen); }}/>
    </Field>
    {error && <Notice error>{error}</Notice>}
    <Field label={t('Как вписать')}><Segmented label={t('Как вписать')} value={p.fit} onChange={(fit) => onProps({ fit })} options={[['cover', t('Заполнить')], ['contain', t('Целиком')]]}/></Field>
    <div className="custom-effects is-one"><Range label={t('Скругление')} value={p.radius} min={0} max={64} unit=" px" onChange={(radius) => onProps({ radius }, 'radius')}/></div>
  </>;
}

function ShortcutFields({ widget, onProps }) {
  const p = widget.props, [url, setUrl] = useState(p.url || ''), focused = useRef(false);
  useEffect(() => { if (!focused.current) setUrl(p.url || ''); }, [p.url]);
  const bad = p.action === 'link' && url.trim() && !widgetLink(url);
  return <>
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
      {p.action === 'link' && !p.url && !bad && <p className="custom-hint">{t('Пока ссылки нет, кнопка ничего не открывает.')}</p>}
    </Field>}
    <Field label={t('Надпись')}><Draft className="kz-input" value={p.label} maxLength={WIDGET_LIMITS.label} onChange={(label) => onProps({ label }, 'label')}/></Field>
    <Field label={t('Вид')}><Segmented label={t('Вид кнопки')} value={p.style} onChange={(style) => onProps({ style })} options={[['panel', t('Панель')], ['plain', t('Текст')], ['accent', t('Цветная')]]}/></Field>
    <Field label={t('Цвет')}><Colors value={p.color} onChange={(color) => onProps({ color }, 'color')}/></Field>
    <p className="kz-note"><Icon name="shield" size={15}/><span>{t('Ярлык только открывает раздел Dota или ссылку, когда на него нажимают. Искать игру, менять настройки или нажимать что-то за тебя он не умеет.')}</span></p>
  </>;
}

function TypeFields({ widget, onProps, onWidget, onMedia, onEdit, inLibrary }) {
  const p = widget.props;
  switch (widget.type) {
    case 'custom': return <>
      <div className="kz-design-card"><b>{p.design?.name}</b><small>{t('Из блоков: {count}', { count: p.design?.blocks.length || 0 })} · {p.design?.size.join(' × ')}</small>
        <button type="button" className="catalog-button primary" onClick={onEdit}><Icon name="edit"/>{t('Изменить')}</button></div>
      <p className="custom-hint">{inLibrary ? t('Изменения в редакторе сразу попадут во все копии этого виджета в меню.') : t('Этого виджета нет в «Моих виджетах» этого браузера — после «Сохранить» в редакторе он появится там.')}</p>
      <p className="custom-hint">{t('Растягивается целиком, с пропорциями из редактора. Двойной клик по виджету тоже открывает редактор.')}</p>
    </>;
    case 'clock': return <>
      <Field label={t('Вид')}><Segmented label={t('Вид')} value={p.look} options={[['digital', t('Цифры')], ['round', t('Стрелки')]]}
        onChange={(look) => { onProps({ look }); if (look === 'round' && widget.w > widget.h * 1.3) onWidget?.({ w: Math.max(widget.h, 160), h: Math.max(widget.h, 160) }); }}/></Field>
      {p.look !== 'round' && <Field label={t('Формат')}><Segmented label={t('Формат')} value={p.format} onChange={(format) => onProps({ format })} options={[['24', t('24 часа')], ['12', t('12 часов')]]}/></Field>}
      <div className="custom-switches"><Toggle label={t('Секунды')} checked={p.seconds} onChange={(seconds) => onProps({ seconds })}/>
        <Toggle label={p.look === 'round' ? t('Дата на циферблате') : t('Дата под временем')} checked={p.date} onChange={(date) => onProps({ date })}/>
        <Toggle label={t('Подложка')} hint={t('Тёмная панель, как у Dota')} checked={p.panel} onChange={(panel) => onProps({ panel })}/></div>
      {p.look !== 'round' && <Field label={t('Выравнивание')}><Segmented label={t('Выравнивание')} value={p.align} onChange={(align) => onProps({ align })} options={ALIGN()}/></Field>}
      <Field label={p.look === 'round' ? t('Цвет меток и секундной стрелки') : t('Цвет цифр')}><Colors value={p.color} onChange={(color) => onProps({ color }, 'color')}/></Field>
    </>;
    case 'timer': return <>
      <Field label={t('Вид')}><Segmented label={t('Вид')} value={p.look} onChange={(look) => onProps({ look })} options={[['cells', t('Ячейки')], ['line', t('Строкой')]]}/></Field>
      <Field label={t('Надпись')}><Draft className="kz-input" value={p.title} maxLength={WIDGET_LIMITS.title} placeholder={t('До события')} onChange={(title) => onProps({ title }, 'title')}/></Field>
      <Field label={t('Дата и время')} hint={p.until ? t('Время — то, что на компьютере, где стоит Dota.') : t('Пока даты нет, таймер показывает прочерки.')}>
        <input className="kz-input" type="datetime-local" value={p.until} onChange={(event) => onProps({ until: event.target.value.slice(0, 16) })}/></Field>
      <div className="custom-switches"><Toggle label={t('Подложка')} hint={t('Тёмная панель, как у Dota')} checked={p.panel} onChange={(panel) => onProps({ panel })}/></div>
      <Field label={t('Цвет')}><Colors value={p.color} onChange={(color) => onProps({ color }, 'color')}/></Field>
    </>;
    case 'text': return <>
      <Field label={t('Текст')}><Draft multiline rows={2} className="kz-input" value={p.text} maxLength={WIDGET_LIMITS.text} onChange={(text) => onProps({ text }, 'text')}/></Field>
      <div className="custom-effects is-one"><Range label={t('Размер')} value={p.size} min={12} max={96} unit=" px" onChange={(size) => onProps({ size }, 'size')}/></div>
      <Field label={t('Насыщенность')}><Segmented label={t('Насыщенность')} value={p.weight} onChange={(weight) => onProps({ weight })} options={[['normal', t('Обычный')], ['bold', t('Жирный')], ['black', t('Очень жирный')]]}/></Field>
      <Field label={t('Выравнивание')}><Segmented label={t('Выравнивание')} value={p.align} onChange={(align) => onProps({ align })} options={ALIGN()}/></Field>
      <div className="custom-switches"><Toggle label={t('Тень')} hint={t('Читается на любом фоне')} checked={p.shadow} onChange={(shadow) => onProps({ shadow })}/>
        <Toggle label={t('Заглавными')} checked={p.upper} onChange={(upper) => onProps({ upper })}/></div>
      <Field label={t('Цвет')}><Colors value={p.color} onChange={(color) => onProps({ color }, 'color')}/></Field>
    </>;
    case 'shortcut': return <ShortcutFields widget={widget} onProps={onProps}/>;
    case 'image': case 'video': return <MediaFields widget={widget} onProps={onProps} onMedia={onMedia}/>;
    case 'miniProfile': return <p className="kz-note"><Icon name="user" size={15}/><span>{t('Панель самой Dota: аватар, ник, медаль и витрина профиля того, кто поставил сборку. У каждого пользователя — свои.')}</span></p>;
    case 'lastMatch': return <>
      <Field label={t('Вид')}><Segmented label={t('Вид')} value={p.look} onChange={(look) => onProps({ look })} options={[['gridstudio', 'GridStudio'], ['dota', t('Как в Dota')]]}/></Field>
      <p className="kz-note"><Icon name="trophy" size={15}/><span>{t('Панель самой Dota: герой, исход и счёт последнего матча того, кто поставил сборку. «GridStudio» — та же панель в виде наших карточек.')}</span></p>
    </>;
    case 'topLive': return <p className="kz-note"><Icon name="eye" size={15}/><span>{t('Панель самой Dota: самый популярный матч в эфире. Сейчас Dota оставляет её пустой, под одним заголовком: Valve больше не показывает лайв-матч на главной.')}</span></p>;
    default: return null;
  }
}

export default function WidgetInspector({ widget, live, locked, covers, onRect, onAnchor, onDone, onProps, onWidget, onMedia, onFix, onTool, onEdit, inLibrary }) {
  const def = WIDGET_TYPES[widget.type];
  return <>
    <section className="kz-sec">
      <div className="kz-sec-head"><span className="custom-label">{t('Место на экране')}</span><span className="custom-aside">{t('в пикселях 1080p')}</span></div>
      <Place widget={widget} live={live} locked={locked} onRect={onRect} onAnchor={onAnchor} onDone={onDone}/>
      <div className="custom-effects is-one"><Range label={t('Видимость')} value={widget.opacity} min={5} max={100} unit="%" onChange={(opacity) => onWidget({ opacity }, 'opacity')}/></div>
      {covers.length > 0 && <div className="kz-warn" role="note"><Icon name="alert" size={16}/><div>
        {t('Закрывает «{list}». В игре виджет ляжет поверх панели Valve.', { list: covers.join('», «') })}
        {!locked && <button type="button" className="catalog-link" onClick={onFix}>{t('Подвинуть в свободное место')}</button>}</div></div>}
    </section>
    <section className="kz-sec kz-fields cz-mod-fields">
      <span className="custom-label">{t(def.title)}</span>
      <TypeFields widget={widget} onProps={onProps} onWidget={onWidget} onMedia={onMedia} onEdit={onEdit} inLibrary={inLibrary}/>
    </section>
    <section className="kz-sec kz-sec-actions">
      <button type="button" className="catalog-button" onClick={() => onTool('dup')}><Icon name="copy"/>{t('Дублировать')}</button>
      <button type="button" className="catalog-button danger" onClick={() => onTool('delete')}><Icon name="trash"/>{t('Удалить')}</button>
    </section>
  </>;
}
