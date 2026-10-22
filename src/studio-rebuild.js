import { MENU_SIZES, menuFrame } from '../scripts/menu-background.mjs';
import { VIDEO_ENCODER, freshVideo } from '../scripts/video-resample.mjs';
import { getBackground, staleBuilt, updateBackground } from '../scripts/background-library.mjs';
import { builtStandIn, lookFromRecipe } from '../scripts/customize-look.mjs';
import { findMedia, keepMedia } from './customize/look-store.js';

// Videos built before the builder's fix of 22.10.2026 (scripts/video-resample.mjs sampleNudge) repeat every
// third frame and skip the next: smooth on the site, jerky in Dota. «Студия» keeps them in this browser and
// gave them out again as they were. Now a background or an «Оформление» whose kept video has no
// VIDEO_ENCODER mark is built again from what it was made of: a workshop background downloaded again, the
// user's own file when this browser still has it (look-store.js). Without the source the old video is
// used and OLD_VIDEO says so; it is replaced only once new ones are built.
export const OLD_VIDEO = 'Этот фон собран старой версией и может дёргаться в Dota — открой его и выбери исходный файл, чтобы пересобрать';

// Each video of a «Студия» background and what it is built from: the menu's (`video`, the recipe itself)
// and every page with a video of its own.
const PAGES = [['hero', 'heroVideo'], ['grid', 'gridVideo'], ['loading', 'loadingVideo']];
export function builtParts(recipe) {
  const out = recipe?.source ? [{ part: 'bg', field: 'video', settings: recipe }] : [];
  for (const [part, field] of PAGES) if (recipe?.[part]?.mode === 'own' && recipe[part].source) out.push({ part, field, settings: recipe[part] });
  return out;
}
// encodeMenuVideo's options for a part, as the builder (MenuBackground.jsx prepare) gives them.
export const encodeOptions = (settings, aspect) => ({ size: MENU_SIZES[aspect], fit: settings.fit, effects: { blur: settings.blur / 100, dim: settings.dim / 100 },
  frame: menuFrame(settings.frame), piece: settings.piece ?? null, crossfade: settings.crossfade ?? 0 });

const defaults = {
  workshop: async (item) => (await (await import('./customize/BackgroundPicker.jsx')).downloadWorkshop(item)).file,
  encode: async (file, options) => (await import('./customize/menu-video.js')).encodeMenuVideo(file, options),
  findFile: findMedia
};
// The file a source names, or null: the workshop's video (null when it is gone or does not load), the user's file kept here.
async function sourceFile(source, { workshop, findFile }) {
  try { return source.kind === 'workshop' ? await workshop({ id: source.id, title: source.title }) : await findFile(source); } catch { return null; }
}

// A «Студия» background about to be given out again («Скачать»): built again when its videos are old.
// → { record, rebuilt, old }: `rebuilt` — new videos replaced the old ones in this browser; `old` — the old
// ones are given as they are (a source is missing, or the build failed), OLD_VIDEO to show.
// onProgress(stage, share): 'source' while the files come, 'build' 0…1 while the videos are encoded.
export async function refreshBackground(record, { workshop = defaults.workshop, encode = defaults.encode, findFile = defaults.findFile, onProgress = () => {} } = {}) {
  if (!staleBuilt(record)) return { record, rebuilt: false, old: false };
  const parts = builtParts(record.recipe);
  if (!parts.length) return { record, rebuilt: false, old: true };
  try {
    onProgress('source', 0);
    const files = [];
    for (const { settings } of parts) {
      const file = await sourceFile(settings.source, { workshop, findFile });
      if (!file) return { record, rebuilt: false, old: true };
      files.push(file);
    }
    const made = {};
    for (const [index, { field, settings }] of parts.entries()) {
      onProgress('build', index / parts.length);
      made[field] = await encode(files[index], { ...encodeOptions(settings, record.recipe.aspect), onProgress: (share) => onProgress('build', (index + Math.min(1, share)) / parts.length) });
    }
    const blob = (result) => (result?.video ? new Blob([result.video], { type: 'video/webm' }) : null);
    const patch = { video: blob(made.video), heroVideo: blob(made.heroVideo), gridVideo: blob(made.gridVideo), loadingVideo: blob(made.loadingVideo),
      codec: made.video?.codec || record.codec, seconds: made.video?.seconds ?? record.seconds, encoder: VIDEO_ENCODER };
    const next = await updateBackground(record.id, patch);
    return { record: next || { ...record, ...patch }, rebuilt: true, old: false };
  } catch { return { record, rebuilt: false, old: true }; }
}

// A «Студия» background as an «Оформление» document (src/studio-looks.js lookFromBackground): its videos
// stand in for the user's files when they are new; old ones give way to the file itself when this browser
// has it (a workshop source is downloaded again by the page anyway). → { look, built: { hash: version }, old }.
export async function backgroundLook(background, { findFile = defaults.findFile, keep = keepMedia } = {}) {
  const fresh = !staleBuilt(background), version = fresh ? VIDEO_ENCODER : 1, built = {}, media = {}, marks = {};
  let old = false;
  for (const { part, field, settings } of builtParts(background.recipe)) {
    const video = background[field];
    if (!(video instanceof Blob) || settings.source.kind !== 'file') continue;
    if (!fresh) {
      const file = await findFile(settings.source).catch(() => null), hash = file && await keep(file);
      if (hash) { media[part] = hash; continue; }
      old = true;
    }
    const hash = await keep(new File([video], `${background.name || 'GridStudio'}.webm`, { type: 'video/webm' }), version);
    if (hash) { built[part] = { media: hash, size: video.size }; marks[hash] = version; }
  }
  return { look: lookFromRecipe(background.recipe, { built, media }), built: marks, old };
}

// An «Оформление» about to open on /background: a page whose background is a built video from before the
// fix gets the recipe's own source again (the user's file kept here, or the workshop's), or the background's
// new video when it was built again since. Items made before the marks (`from` a background, no `built`)
// are recognised by the stand-in's shape. → { record, changed, old }; `save(record)` keeps a changed one.
const LOOK_PARTS = [['bg', 'video', (menu) => menu.background], ['hero', 'heroVideo', (menu) => menu.hero.own], ['grid', 'gridVideo', (menu) => menu.grid.own], ['loading', 'loadingVideo', (menu) => menu.loading.own]];
export async function freshenLook(record, { save = async (next) => next, findFile = defaults.findFile, keep = keepMedia, getRecord = getBackground } = {}) {
  const menu = record?.look?.menu;
  if (!menu) return { record, changed: false, old: false };
  const marks = record.built || null, legacy = !marks && !!record.from;
  if (!marks && !legacy) return { record, changed: false, old: false };
  const background = record.from ? await getRecord(record.from).catch(() => null) : null;
  const recipe = background?.recipe || null, next = { ...menu, grid: { ...menu.grid }, hero: { ...menu.hero }, loading: { ...menu.loading } }, nextMarks = { ...(marks || {}) };
  let changed = false, old = false;
  for (const [part, field, pick] of LOOK_PARTS) {
    const now = pick(menu), hash = now?.source?.media;
    if (!hash) continue;
    const recipePart = recipe ? (part === 'bg' ? recipe : recipe[part]?.mode === 'own' ? recipe[part] : null) : null;
    const stale = marks ? hash in marks && !freshVideo(marks[hash]) : recipe ? !!recipePart && builtStandIn(now, recipePart) : builtStandIn(now);
    if (!stale) continue;
    let replacement = null;
    if (recipePart?.source) {
      // The source itself, with the recipe's settings: the page builds it again.
      const file = recipePart.source.kind === 'file' ? await findFile(recipePart.source).catch(() => null) : null, kept = file && await keep(file);
      if (recipePart.source.kind === 'workshop' || kept) {
        replacement = pick(lookFromRecipe(recipe, { media: kept ? { [part]: kept } : {} }).menu);
      }
    }
    if (!replacement && background && !staleBuilt(background) && background[field] instanceof Blob) {
      // The background was built again since: its new video stands in.
      const kept = await keep(new File([background[field]], `${background.name || 'GridStudio'}.webm`, { type: 'video/webm' }), VIDEO_ENCODER);
      if (kept) { replacement = { ...now, source: { ...now.source, media: kept, size: background[field].size } }; nextMarks[kept] = VIDEO_ENCODER; }
    }
    if (!replacement) { old = true; nextMarks[hash] = marks?.[hash] ?? 1; continue; }
    delete nextMarks[hash];
    if (part === 'bg') next.background = replacement; else next[part] = { ...next[part], own: replacement };
    changed = true;
  }
  if (!changed) return { record, changed: false, old };
  const updated = { ...record, look: { ...record.look, menu: next }, built: nextMarks };
  return { record: (await save(updated)) || updated, changed: true, old };
}
