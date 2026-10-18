// d2pfx HUD skins and HUD parts in the match preview (2026-10-17): Dota's HUD as the Panorama emulator draws it
// with Valve's files and with each mod's (scripts/make-d2pfx-hud.mjs), at every captured scale; HudCanvas adds
// the difference to the captured plates (scripts/hud-capture/reskin.mjs). Only the chosen mods' layers at the
// scales in use are fetched.
import manifest from '../../assets/d2pfx-hud/hud.json';

const files = import.meta.glob('../../assets/d2pfx-hud/**/*.webp', { query: '?no-inline', import: 'default', eager: true });
const url = (file) => Object.entries(files).find(([path]) => path.endsWith(`/d2pfx-hud/${file}`))?.[1];
// Whether the preview draws a mod: 'drawn', or 'none' (nothing it changes is on the captured screen — the
// minimap's terrain is the engine's, the scoreboard and the shop are closed: d2pfx's picture instead).
// A few hundred changed pixels are the emulator's own noise (a picture decoded a shade apart), not the mod.
export const skinRender = (id) => ((manifest.mods[id]?.changed || 0) > 3000 ? 'drawn' : 'none');
const loads = new Map();
// Valve's and the mod's layer ('lowerF' | 'lowerC' | 'top') at a scale: [V, S] ({ rect, rgba }) or null.
// decode(url) → { width, height, data } (HudCanvas's exact decoder).
// xl: the extra-large minimap is on («Larger Minimap» chosen too) — a minimap colour mod's own layers for it.
export function skinLayers(id, layer, scale, decode, xl = false) {
  const key = `${id}|${layer}|${scale}|${xl}`;
  if (!loads.has(key)) {
    const mod = manifest.mods[id], valve = manifest.layers[layer]?.[scale], own = (xl && mod?.layersXL ? mod.layersXL : mod?.layers)?.[layer]?.[scale];
    loads.set(key, !valve || !own ? Promise.resolve(null) : Promise.all([decode(url(valve.file)), decode(url(own))])
      .then(([v, s]) => [{ rect: valve.rect, rgba: v.data }, { rect: valve.rect, rgba: s.data }])
      .catch((problem) => { loads.delete(key); throw problem; }));
  }
  return loads.get(key);
}
// Valve's text mask of a layer kind ('textLower' | 'textTop') at a scale: { rect, rgba } or null.
export function textMask(kind, scale, decode) {
  const key = `text|${kind}|${scale}`, entry = manifest.layers[kind]?.[scale];
  if (!loads.has(key)) loads.set(key, !entry ? Promise.resolve(null) : decode(url(entry.file)).then((image) => ({ rect: entry.rect, rgba: image.data })).catch((problem) => { loads.delete(key); throw problem; }));
  return loads.get(key);
}
// The mod's (or, with no id, Valve's) thumbnail as the preview draws it.
export const skinThumb = (id) => { const file = id ? manifest.mods[id]?.thumb : manifest.thumb; return file ? url(file) : ''; };
// A mod that moves panels: its render replaces the capture where it changes something (reskin.mjs replace).
export const skinMoves = (id, kind, scale, xl = false) => ((xl && manifest.mods[id]?.replaceXL) || manifest.mods[id]?.replace)?.[kind]?.[scale] || false;
// A HUD part that moves panels changes only those (applyDelta only).
export const partOnly = (id) => manifest.mods[id]?.section === 'hudparts' && !!manifest.mods[id]?.replace;
export { manifest as skinManifest };
