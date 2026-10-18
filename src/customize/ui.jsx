import { Fragment, useState } from 'react';
import { Icon, Modal } from '../catalog/Common.jsx';
import { locale, t } from '../../scripts/i18n.mjs';

// The customization page's small shared parts (CustomizePage.jsx and its modules' sections).
// A translated text with React parts in its {placeholders}: rich(t('Запусти {file}.'), { file: <b>…</b> }).
export const rich = (text, parts) => text.split(/\{(\w+)\}/).map((piece, i) => (i % 2 ? <Fragment key={i}>{piece in parts ? parts[piece] : `{${piece}}`}</Fragment> : piece));
// Equal segments with a thumb that slides to the chosen one (--count, --index drive the CSS).
export function Segmented({ label, value, options, onChange, compact = false }) {
  const found = options.findIndex(([id]) => id === value), index = Math.max(0, found);
  return <div className={`custom-seg has-thumb${compact ? ' is-compact' : ''}${found < 0 ? ' is-none' : ''}`} role="radiogroup" aria-label={label} style={{ '--count': options.length, '--index': index }}>
    <span className="custom-seg-thumb" aria-hidden="true"/>{options.map(([id, text]) =>
    <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)}>{text}</button>)}</div>;
}
// `aside`: a short note on the label's line (right), so it costs no line of its own.
export function Field({ label, aside, hint, children }) {
  return <div className="custom-field">{aside ? <span className="custom-label-row"><span className="custom-label">{label}</span><span className="custom-aside">{aside}</span></span>
    : <span className="custom-label">{label}</span>}{children}{hint && <p className="custom-hint">{hint}</p>}</div>;
}
export function CopyField({ value }) {
  const [copied, setCopied] = useState(false);
  return <span className="custom-copy"><code>{value}</code><button type="button" className="catalog-icon" aria-label={t('Скопировать {value}', { value })} onClick={async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* The value stays visible to copy by hand. */ }
  }}><Icon name={copied ? 'check' : 'copy'}/></button></span>;
}
// Installation steps plus the honest part about changing game files.
export function InstallWindow({ title, children, onClose }) {
  return <Modal title={title} icon="download" onClose={onClose} size="md"><div className="custom-install">{children}
    <p className="custom-safety"><Icon name="alert" size={18}/><span><b>{t('Это безопасно?')}</b> {t('Это изменение файлов игры. Банов за шрифты, фоны и вид интерфейса не известно: они ничего не дают в игре. Но правила Steam изменение файлов формально не разрешают, так что решение за тобой. Всё возвращается проверкой целостности файлов в Steam.')}</span></p>
  </div></Modal>;
}
// A size for people: kilobytes under a megabyte, so a small file is not «0 МБ»; `about`: «≈» before it
// (a video not encoded yet).
export const sizeText = (bytes, about = false) => `${about ? '≈ ' : ''}${bytes < 1_000_000 ? t('{size} КБ', { size: Math.max(1, Math.round(bytes / 1000)) })
  : t('{size} МБ', { size: (bytes / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1 }) })}`;
