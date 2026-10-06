import { Icon } from './catalog/Common.jsx';
import { countAction } from './site-stats.js';
import { pcCode } from '../scripts/pc-link.mjs';
import { t } from '../scripts/i18n.mjs';

// «Прислать на ПК» (1.8.18): on a phone (a coarse pointer, as site-stats.js counts it) a strip that
// opens the bot, which sends a link to this page to open in Telegram on the computer. `code`: the
// page's code when the address is about to change (the builder drops ?background=); else from it.
const PHONE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export default function SendToPC({ text, code = pcCode(location) }) {
  if (!PHONE || !code) return null;
  return <aside className="send-pc"><Icon name="telegram"/><p>{text}</p>
    <a className="catalog-button" href={`/api/catalog/pc/${code}`} target="_blank" rel="noopener" onClick={() => countAction('send-pc')}>{t('Прислать в Telegram')}</a></aside>;
}
