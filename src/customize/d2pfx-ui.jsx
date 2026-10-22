import { Icon, Modal } from '../catalog/Common.jsx';
import { t } from '../../scripts/i18n.mjs';
import { D2PFX, creditText } from '../../scripts/d2pfx.mjs';
import { d2pfxFixNotes } from '../../scripts/d2pfx-mods.mjs';
import { rich } from './ui.jsx';

// Whose work a d2pfx mod is, wherever the page uses one (the cursor's packs, CursorSection.jsx; the HUD skins,
// clicks, pings, denies, parts and the voice icon, D2pfxSections.jsx): the credit as d2pfx shows it, the
// note that the works are their authors', and «Про d2pfx» with the licence and the links d2pfx asks for.
const LABELS = () => ({ source: t('Источник'), sender: t('Прислал'), modded: t('Переделал'), author: t('Автор') });
export function PackCredits({ pack, compact = false }) {
  return <span className={`cur-credits${compact ? ' is-compact' : ''}`}>{pack.credits.map((credit, i) => {
    const name = credit.kind === 'source' ? (credit.name || t('ссылка')) : credit.name || creditText(credit);
    return <span key={i}>{LABELS()[credit.kind] || LABELS().author}: {credit.url ? <a href={credit.url} target="_blank" rel="noopener noreferrer">{name}</a> : name}</span>;
  })}</span>;
}
// Our fixes to a mod (D2PFX_FIXES in scripts/d2pfx-mods.mjs), next to its credit: «исправлено GridStudio:
// портрет героя» — the file in the pack is then not d2pfx's byte for byte, and the page says so.
export const fixLine = (mod) => { const notes = d2pfxFixNotes(mod.id); return notes.length ? t('исправлено GridStudio: {what}', { what: notes.map((note) => t(note)).join(', ') }) : ''; };
export function FixNote({ mod, compact = false }) {
  const line = fixLine(mod);
  return line ? <span className={`cur-credits d2-fixed${compact ? ' is-compact' : ''}`} title={t('GridStudio исправил ошибку в стилях мода: добавил после его правил своё, остальное — файлы d2pfx без изменений.')}>
    <Icon name="check" size={12}/>{line}</span> : null;
}
// One line for «Что внутри», the summaries and the read-me: «VPKDota, Миша Талант (переделал)».
export const creditLine = (credits) => credits.map((credit) => `${creditText(credit, { links: false })}${credit.kind === 'modded' ? ` (${t('переделал')})` : credit.kind === 'sender' ? ` (${t('прислал')})` : ''}`).join(', ');
// The read-me's lines for one mod: «HUD-скин: «Black Hud» с Dota2PornFX (<page>)», then each credit with its link.
export const creditLines = (what, mod) => [t('{what}: «{name}» с {site} ({page}).', { what, name: mod.label || mod.name, site: D2PFX.name, page: mod.page }),
  ...mod.credits.map((credit) => `  ${credit.kind === 'source' ? t('Источник:') : credit.kind === 'sender' ? t('Прислал:') : credit.kind === 'modded' ? t('Переделал:') : t('Автор:')} ${creditText(credit)}`),
  ...(fixLine(mod) ? [`  ${fixLine(mod)} (${t('одно правило стиля добавлено после правил мода, остальное без изменений')}).`] : [])];
export const creditsClosing = () => t('Моды взяты с Dota2PornFX ({site}, {repo}). Все работы принадлежат их авторам; GridStudio только собрал их в файлы для Dota. Авторы модов d2pfx: {credits}', { site: D2PFX.site, repo: D2PFX.repo, credits: D2PFX.credits });

// Where the mods come from, at the top of every d2pfx choice. `text`: the section's own sentence with {site}.
export function D2pfxNote({ text, href = D2PFX.site, onMore }) {
  return <div className="cur-note" role="note"><Icon name="help" size={16}/>
    <p>{rich(text, { site: <a href={href} target="_blank" rel="noopener noreferrer">Dota2PornFX</a> })}{' '}
      <button type="button" className="catalog-link" onClick={onMore}>{t('Подробнее')}</button></p></div>;
}
export function D2pfxAbout({ onClose }) {
  const link = (href, text) => <a href={href} target="_blank" rel="noopener noreferrer">{text}</a>;
  return <Modal title={t('Моды с Dota2PornFX')} icon="help" onClose={onClose} size="md"><div className="custom-install cur-about">
    <p>{rich(t('Паки курсоров, HUD-скины, клики, пинги, денаи, детали интерфейса и иконка голоса с пометкой d2pfx взяты с {site} — открытой коллекции модов Dota 2 от h6rd. GridStudio показывает их список и картинки прямо оттуда, скачивает выбранные моды с GitHub d2pfx и собирает их в файлы для Dota.'), { site: link(D2PFX.site, 'Dota2PornFX (d2pfx)') })}</p>
    <p><b>{t('Все работы принадлежат их авторам.')}</b> {t('У каждого мода указан автор — так же, как на d2pfx, с той же ссылкой. Если автор не указан, d2pfx просит считать автором h6rd / Dota2PornFx.')}</p>
    <p>{rich(t('Код и моды самого d2pfx — под лицензией GPL-3.0 с условием указывать авторов ({rules}); моды других авторов и файлы Valve этой лицензией не покрываются и остаются у владельцев ({attribution}).'), { rules: link(`${D2PFX.repo}#-attribution--reuse`, t('правила')), attribution: link(D2PFX.attribution, 'ATTRIBUTION.md') })}</p>
    <ul className="cur-about-links"><li>{link(D2PFX.site, t('Сайт Dota2PornFX'))}</li><li>{link(D2PFX.credits, t('Список авторов модов'))}</li><li>{link(D2PFX.repo, t('Репозиторий d2pfx на GitHub'))}</li></ul>
    <p className="catalog-muted">{t('Автор каждого мода попадает и в «Что внутри», и в ПРОЧТИ.txt внутри архива.')}</p>
  </div></Modal>;
}
