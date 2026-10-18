// The captured HUD with d2pfx mods applied, in Node (scripts/hud-capture/reskin.mjs, the same arithmetic as the
// page's HudCanvas): for the gallery's thumbnails and the check. screen(ids, settings) → RGB bytes of 1920 × 1080.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { atlasPlate, buildLower, commonFromAtlas, composeScreen, hudLayers, lowerFromAtlas } from './hud-capture/compose.mjs';
import { applyDelta, grow, hiddenDecor, reskinLower } from './hud-capture/reskin.mjs';
import { HUD_DEFAULTS, hudSettings } from './hud-style.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'assets/d2pfx-hud'), capDir = join(root, 'assets/dota-hud-capture');
export const capture = JSON.parse(readFileSync(join(capDir, 'hud.json'), 'utf8'));
export const manifest = () => JSON.parse(readFileSync(join(out, 'hud.json'), 'utf8'));
const files = new Map();
export const raw = (file) => {
  if (!files.has(file)) files.set(file, sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true }).then(({ data, info }) => ({ width: info.width, height: info.height, data })));
  return files.get(file);
};
const layer = async (m, kind, scale, file) => file ? { rect: m.layers[kind][scale].rect, rgba: (await raw(join(out, file))).data } : null;
export const world = async () => (await sharp(join(capDir, capture.world)).removeAlpha().raw().toBuffer());
// The captured plates of a scale: { set, top, common }.
export async function plates(lower, top) {
  return { set: lowerFromAtlas(await raw(join(capDir, capture.lower[lower].atlas)), capture.lower[lower]), top: atlasPlate(await raw(join(capDir, capture.top[top].atlas)), capture.top[top].plate),
    common: commonFromAtlas(await raw(join(capDir, capture.common)), capture) };
}
// ids: mods applied in order (a later one wins where both change a pixel: parts after the skin).
export async function screen(ids = [], input = {}, background = null) {
  const s = hudSettings({ ...HUD_DEFAULTS, ...input }), m = manifest(), p = await plates(s.lower, s.top);
  const decor = { flares: !s.hide.includes('flares'), shadows: !s.hide.includes('shadows') };
  let lower = buildLower(p.set, decor), top = p.top;
  const skip = hiddenDecor(p.set, decor);
  for (const id of ids) {
    const mod = m.mods[id];
    if (!mod) continue;
    const xl = ids.includes('larger-minimap') && mod.layersXL;
    const pair = async (kind, scale) => { const own = (xl ? mod.layersXL : mod.layers)[kind]?.[scale]; return own ? [await layer(m, kind, scale, m.layers[kind][scale].file), await layer(m, kind, scale, own)] : null; };
    const replace = (xl ? mod.replaceXL : mod.replace)?.lower?.[s.lower] || false, replaceTop = mod.replace?.top?.[s.top] || false;
    const textLower = await layer(m, 'textLower', s.lower, m.layers.textLower?.[s.lower]?.file), textTop = await layer(m, 'textTop', s.top, m.layers.textTop?.[s.top]?.file);
    lower = reskinLower(lower, { C: await pair('lowerC', s.lower), F: await pair('lowerF', s.lower) }, { skip, replace, only: mod.section === 'hudparts' && !!mod.replace, text: textLower });
    const t = await pair('top', s.top);
    if (t) top = applyDelta(grow(top, t[1].rect), t[0], t[1], { replace: replaceTop, only: mod.section === 'hudparts' && !!mod.replace, text: textTop });
  }
  const key = `${s.lower}|${decor.flares}|${decor.shadows}`;
  return composeScreen(background || await world(), hudLayers(s, { lower: { [s.lower]: p.set }, top: { [s.top]: top }, rest: p.common.rest }, { cache: new Map([[key, lower]]) }));
}
