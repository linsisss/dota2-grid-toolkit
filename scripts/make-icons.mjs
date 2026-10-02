// The site's icons are Lucide (https://lucide.dev, ISC): this picks the ones GridStudio uses from
// @iconify-json/lucide and writes scripts/icons.mjs, which the editor (scripts/app.mjs) and the
// React pages (src/Icon.jsx) share. Each shape keeps Lucide's own stroke attributes, so the icons
// look the same everywhere whatever a page's CSS says about strokes.
//   node scripts/make-icons.mjs   (after changing ICON_NAMES)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lucide = JSON.parse(readFileSync(require.resolve('@iconify-json/lucide/icons.json'), 'utf8'));
// Our name → Lucide's.
const ICON_NAMES = {
  // Pages and files
  studio: 'layout-grid', grid: 'layout-grid', heroes: 'layout-grid', workshop: 'compass', groupPlus: 'grid-2x2-plus',
  archive: 'archive', copy: 'copy', edit: 'pencil', trash: 'trash-2', search: 'search', import: 'file-down', export: 'share',
  download: 'download', upload: 'upload', external: 'external-link', expand: 'maximize', telegram: 'send', bell: 'bell',
  heart: 'heart', flag: 'flag', brush: 'paintbrush', font: 'type', book: 'book-open', alert: 'circle-alert', help: 'circle-help',
  art: 'image', image: 'image', layers: 'layers', shield: 'shield-check', sparkle: 'sparkles', sliders: 'sliders-horizontal',
  // Actions and arrows
  plus: 'plus', minus: 'minus', close: 'x', check: 'check', arrow: 'arrow-right', back: 'arrow-left',
  chevron: 'chevron-down', chevronRight: 'chevron-right', chevronLeft: 'chevron-left', chevronUp: 'chevron-up',
  eye: 'eye', eyeOff: 'eye-off', lock: 'lock', unlock: 'lock-open', pin: 'pin',
  // The video guide's player (src/video-guide.js)
  play: 'play', pause: 'pause', volume: 'volume-2', muted: 'volume-x', shrink: 'minimize', replay: 'rotate-ccw',
  // The editor's tour (src/EditorTour.jsx) and the windows' header tiles (src/window-kit.css)
  template: 'layout-template', replace: 'replace', user: 'user-round', terminal: 'square-terminal',
  // «Чат и новости» (src/CommunityDialog.jsx)
  chat: 'messages-square', news: 'megaphone', bug: 'bug',
  // «Гайды» (src/guides/): the page, the editor's toolbar, comments
  guides: 'book-open-text', bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikethrough', inlineCode: 'code',
  spoiler: 'eye-off', link: 'link', unlink: 'unlink', bulletList: 'list', orderedList: 'list-ordered', quote: 'text-quote',
  codeBlock: 'square-code', heading2: 'heading-2', heading3: 'heading-3', rule: 'separator-horizontal', imagePlus: 'image-plus',
  film: 'film', paperclip: 'paperclip', youtube: 'youtube', comment: 'message-circle', reply: 'reply', send: 'send', clock: 'clock',
  penLine: 'pen-line', idCard: 'id-card', loader: 'loader-circle',
  // «Поддержать разработку» (src/SupportDialog.jsx)
  support: 'coffee', qr: 'qr-code', card: 'credit-card', wallet: 'wallet', files: 'files', gauge: 'gauge', history: 'history', languages: 'languages',
  // Profile badges (scripts/profile-badges.mjs) and the admins' «Значки»
  badgeDev: 'code-xml', badgeIdea: 'lightbulb', badgeSponsor: 'hand-heart', trophy: 'trophy', award: 'award',
  // Editor tools
  cursor: 'mouse-pointer-2', hand: 'hand', lasso: 'lasso', pen: 'brush', text: 'type', eyedropper: 'pipette', rect: 'square',
  eraser: 'eraser', undo: 'undo-2', redo: 'redo-2', gridLines: 'grid-3x3', magnet: 'magnet', fit: 'scan',
  rotate: 'rotate-cw', rotateHandle: 'rotate-ccw', flip: 'flip-horizontal-2', flipVertical: 'flip-vertical-2',
  labelsHide: 'panel-left-close', labelsShow: 'panel-left-open',
  align: 'align-center-vertical', alignLeft: 'align-start-vertical', alignHCenter: 'align-center-vertical', alignRight: 'align-end-vertical',
  alignTop: 'align-start-horizontal', alignVMiddle: 'align-center-horizontal', alignBottom: 'align-end-horizontal',
  distributeX: 'align-horizontal-distribute-center', distributeY: 'align-vertical-distribute-center',
};
const body = (name) => {
  const icon = lucide.icons[name] || lucide.icons[lucide.aliases?.[name]?.parent];
  if (!icon) throw new Error(`Lucide has no «${name}»`);
  if ((icon.width || lucide.width || 24) !== 24 || (icon.height || lucide.height || 24) !== 24) throw new Error(`«${name}» is not 24 × 24`);
  return icon.body;
};
const icons = Object.fromEntries(Object.entries(ICON_NAMES).map(([ours, theirs]) => [ours, body(theirs)]));
// Logos, filled, from Simple Icons (CC0, @iconify-json/simple-icons): Telegram for the users' chat and
// the news channel (src/Community.jsx). No stroke, whatever a page says about strokes.
const simple = JSON.parse(readFileSync(require.resolve('@iconify-json/simple-icons/icons.json'), 'utf8'));
const BRANDS = { telegramLogo: 'telegram' };
for (const [ours, theirs] of Object.entries(BRANDS)) {
  const icon = simple.icons[theirs];
  if (!icon || (icon.width || simple.width || 24) !== 24) throw new Error(`Simple Icons have no 24 × 24 «${theirs}»`);
  icons[ours] = icon.body.replaceAll('<path ', '<path stroke="none" ');
}
writeFileSync(new URL('./icons.mjs', import.meta.url), `// Generated by scripts/make-icons.mjs from Lucide (ISC, https://lucide.dev) and Simple Icons (CC0, logos). Do not edit.
export const ICONS = ${JSON.stringify(icons, null, 1).replace(/\n\s*/g, '\n  ').replace(/\n  }$/, '\n}')};
// An icon as markup, for the editor's imperative DOM; React pages use src/Icon.jsx.
export const iconSVG = (name, className = '') => \`<svg\${className ? \` class="\${className}"\` : ''} viewBox="0 0 24 24" aria-hidden="true">\${ICONS[name] || ICONS.rect}</svg>\`;
`);
console.log(`scripts/icons.mjs: ${Object.keys(icons).length} icons`);

// Coins for «Поддержать разработку»: their own colours, from Web3 Icons Branded (MIT, 0xa3k5,
// @iconify-json/token-branded), 24 × 24 like Lucide.
const tokens = JSON.parse(readFileSync(require.resolve('@iconify-json/token-branded/icons.json'), 'utf8'));
const COINS = { ton: 'ton', usdt: 'usdt', eth: 'eth', btc: 'btc' };
const coins = Object.fromEntries(Object.entries(COINS).map(([ours, theirs]) => {
  const icon = tokens.icons[theirs];
  if (!icon) throw new Error(`Web3 Icons have no «${theirs}»`);
  return [ours, icon.body];
}));
writeFileSync(new URL('./coin-icons.mjs', import.meta.url), `// Generated by scripts/make-icons.mjs from Web3 Icons Branded (MIT, https://github.com/0xa3k5/web3icons). Do not edit.
export const COIN_ICONS = ${JSON.stringify(coins, null, 1).replace(/\n\s*/g, '\n  ').replace(/\n  }$/, '\n}')};
`);
console.log(`scripts/coin-icons.mjs: ${Object.keys(coins).length} coins`);
