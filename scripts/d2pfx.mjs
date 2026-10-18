// Dota2PornFX (d2pfx, https://h6rd.github.io/Dota2PornFxWeb/, by h6rd) — the cursor packs of its
// «Cursors» category for «Курсор» → «d2pfx» on the customization page (asked for on 2026-10-17: «добавь
// туда выбор пака курсоров… Обязательно указывай автора (с ссылками как d2pfx)»). Its site is built from
// the GitHub repository h6rd/Dota2PornFxWeb (GPL-3.0 with attribution terms; other authors' mods stay
// theirs, ATTRIBUTION.md): assets/data/mods.json lists the mods by category ({ name, preview, file,
// links: [{ type: 'author' | 'source' | 'sender', url }] }), assets/data/constants.json maps nicknames to
// links (MOD_AUTHOR, MOD_SENDER), the packs are assets/files/cursors/<file>.zip («<Pack>/cursor/*.bmp,
// cursor.res»), the pictures assets/previews/cursors/<preview>. The page reads all of it from there
// (raw.githubusercontent.com and GitHub Pages answer with Access-Control-Allow-Origin: *): nothing is
// copied to GridStudio, and every pack is shown and shipped with its credit, the way d2pfx shows it.
export const D2PFX = Object.freeze({
  name: 'Dota2PornFX',
  site: 'https://h6rd.github.io/Dota2PornFxWeb/',
  cursors: 'https://h6rd.github.io/Dota2PornFxWeb/?category=cursors',
  repo: 'https://github.com/h6rd/Dota2PornFxWeb',
  credits: 'https://github.com/h6rd/Dota2PornFxWeb#credits',
  attribution: 'https://github.com/h6rd/Dota2PornFxWeb/blob/main/ATTRIBUTION.md',
  raw: 'https://raw.githubusercontent.com/h6rd/Dota2PornFxWeb/main',
  // Mods without a listed author or source are h6rd's own, and d2pfx asks to credit them so (README, «Attribution & Reuse»).
  owner: 'h6rd / Dota2PornFx'
});
export const D2PFX_INDEX = Object.freeze({ mods: `${D2PFX.raw}/assets/data/mods.json`, constants: `${D2PFX.raw}/assets/data/constants.json` });
export const d2pfxPath = (value) => encodeURIComponent(value).replace(/%2F/g, '/');
const path = d2pfxPath;
const linkOf = (value) => (/^https?:\/\//i.test(String(value || '')) ? String(value) : '');

// A mod's credits as d2pfx renders its link buttons (script.js generateLinkButtonsHtml): an author or
// sender by nickname with the link from MOD_AUTHOR / MOD_SENDER, the one who reworked it («modded», by
// MOD_AUTHOR), a source as a link; with no author and no source, h6rd / Dota2PornFx (`owner: true`) — the
// README's rule for mods without a listed author. → [{ kind: 'author' | 'modded' | 'sender' | 'source', name, url }].
export function d2pfxCredits(mod, constants = {}) {
  const authors = constants.MOD_AUTHOR || {}, senders = constants.MOD_SENDER || {}, credits = [];
  for (const link of Array.isArray(mod?.links) ? mod.links : []) {
    const value = String(link?.url || '');
    if (!value) continue;
    if (link.type === 'author' || link.type === 'modded') credits.push({ kind: link.type, name: linkOf(value) ? '' : value, url: linkOf(authors[value]) || linkOf(value) });
    else if (link.type === 'sender') credits.push({ kind: 'sender', name: link.name || (linkOf(value) ? '' : value), url: linkOf(senders[value]) || linkOf(value) });
    else if (link.type === 'source' && linkOf(value)) credits.push({ kind: 'source', name: '', url: value });
  }
  if (!credits.some((credit) => ['author', 'modded', 'source'].includes(credit.kind))) credits.unshift({ kind: 'author', name: D2PFX.owner, url: D2PFX.repo, owner: true });
  return credits;
}

// mods.json + constants.json → [{ name, preview, file, page, date, credits }] of the «Cursors» category.
export function d2pfxCursorPacks(mods, constants = {}) {
  const list = mods?.modsData?.cursors;
  if (!Array.isArray(list)) throw new Error('d2pfx: no cursors in mods.json');
  return list.filter((mod) => mod && typeof mod.name === 'string' && typeof mod.file === 'string' && /\.zip$/i.test(mod.file)).map((mod) => ({
    name: mod.name,
    preview: mod.preview ? `${D2PFX.site}assets/previews/cursors/${path(mod.preview)}` : '',
    file: `${D2PFX.raw}/assets/files/cursors/${path(mod.file)}`,
    page: `${D2PFX.site}?category=cursors&mod=${encodeURIComponent(mod.name)}`,
    date: Number(mod.meta?.date) || 0,
    credits: d2pfxCredits(mod, constants)
  }));
}

// One line of credit, for the read-me and the summaries: «Timmyone (https://t.me/timmyone)».
export const creditText = (credit, { links = true } = {}) => {
  const name = credit.name || credit.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  return links && credit.url && credit.name ? `${name} (${credit.url})` : name;
};
