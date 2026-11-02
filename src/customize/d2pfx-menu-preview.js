// d2pfx's menu parts in the menu's preview (2026-11-02, the owner: «почему не применяются стили допустим для кнопки играть
// сразу в предпросмотре?»; DotaMenu.jsx draws the menu from a screenshot's pieces, and a mod replaces Valve's files under
// them). From the chosen mods' own files (d2pfx-pack.js loadMod, the same download the file is built from):
// - a top bar mod: its ground, Valve's topbar_home_png texture (a PNG inside the vtex), drawn as Valve does (#TopBarBackground:
//   1920 × 164 from the top left, 112 high);
// - a play button mod: its button read off its stylesheet (play_button.css, or its whole play.css) — the gradient or colour,
//   its own picture, borders, corners, shadow; the words' colour, size and shadow.
import { useEffect, useState } from 'react';
import { catalog, loadMod } from './d2pfx-pack.js';
import { decodeDXT5, encodePNG, readVtex } from '../../scripts/dota-vtex.mjs';
import { panoramaSource } from '../../scripts/vpk.mjs';
import { kv3Decode, readResource } from '../../scripts/panorama-laco.mjs';

const TOPBAR = ['panorama/images/topbar/topbar_home_png.vtex_c', 'panorama/images/topbar/topbar_png.vtex_c', 'panorama/images/topbar/topbar_home_small_png.vtex_c'];
const PLAY_STYLES = ['panorama/styles/play_button.vcss_c', 'panorama/styles/play.vcss_c'];

// A texture of a mod as a picture's address: a PNG inside (PNG_RGBA8888, PNG_DXT5) as it is; DXT5 decoded, and from YCoCg
// when the compiler converted it (its edit info says «… YCoCg Conversion»: the sky play button's clouds came out orange without it).
// The edit info (RED2, KV3 that LZ4 may squeeze: the words are not all in the file as they are) names the conversion.
function ycocg(bytes) {
  try {
    const red2 = readResource(bytes).blocks.find(([name]) => name === 'RED2')?.[1];
    return !!red2 && JSON.stringify(kv3Decode(red2), (key, value) => (typeof value === 'bigint' ? String(value) : value)).includes('YCoCg Conversion');
  } catch { return false; }
}
async function textureURL(bytes) {
  const v = readVtex(bytes);
  if (v.format === 16 || v.format === 18) return URL.createObjectURL(new Blob([v.payload], { type: 'image/png' }));
  if (v.format !== 2) return null;
  const px = decodeDXT5(v.payload, v.width, v.height);
  if (ycocg(bytes)) {
    const c = (x) => Math.max(0, Math.min(255, Math.round(x * 255)));
    for (let i = 0; i < px.length; i += 4) {
      const scale = px[i + 2] / 8 + 1, co = (px[i] / 255 - 0.5) / scale, cg = (px[i + 1] / 255 - 0.5) / scale, y = px[i + 3] / 255;
      px[i] = c(y + co - cg); px[i + 1] = c(y + cg); px[i + 2] = c(y - co - cg); px[i + 3] = 255;
    }
  }
  return URL.createObjectURL(new Blob([await encodePNG(px, v.width, v.height)], { type: 'image/png' }));
}

// Panorama's values as CSS: gradient( linear, x1 y1, x2 y2, from( a ), to( b ) ) → linear-gradient; its shadows' «fill» and
// strength dropped.
function cssGradient(value) {
  const m = /gradient\(\s*linear\s*,\s*([\d.]+)%\s+([\d.]+)%\s*,\s*([\d.]+)%\s+([\d.]+)%\s*,([\s\S]*)\)\s*$/.exec(value);
  if (!m) return /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|transparent|white|black)$/i.test(value.trim()) ? value.trim() : null;
  const [x1, y1, x2, y2] = m.slice(1, 5).map(Number), angle = Math.round((Math.atan2(x2 - x1, -(y2 - y1)) * 180) / Math.PI + 360) % 360;
  const stops = [...m[5].matchAll(/(from|to|color-stop)\(\s*(?:([\d.]+)\s*,\s*)?([^()]+?|rgba?\([^)]*\))\s*\)/g)].map(([, kind, at, color]) => `${color.trim()} ${kind === 'from' ? 0 : kind === 'to' ? 100 : Number(at) * 100}%`);
  return stops.length >= 2 ? `linear-gradient(${angle}deg, ${stops.join(', ')})` : null;
}
const cssShadow = (value) => value.replace(/\bfill\b/g, '').replace(/(-?[\d.]+px\s+-?[\d.]+px\s+-?[\d.]+px)\s+[\d.]+\s+(#|rgba?)/g, '$1 $2').trim();

// The rules' declarations for those selectors, the less precise first (a later rule of the same weight wins, as in Panorama;
// «Play Black» ends with one rule for all of them, every value !important).
function declarations(text, groups) {
  const rules = [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({ selectors: selectors.split(',').map((one) => one.trim().replace(/\s+/g, ' ')), body }));
  const out = {};
  for (const group of groups) for (const rule of rules) if (rule.selectors.some((one) => group.includes(one)))
    for (const [, name, value] of rule.body.matchAll(/([a-z-]+)\s*:\s*([^;]+);?/g)) out[name] = value.replace(/\s*!important\s*$/, '').trim();
  return out;
}
export async function playLook(cssText, files) {
  const box = declarations(cssText, [['.PlayButton', '#PlayButton'], ['DOTAPlay.PlayButtonStartsSearching #PlayButton']]);
  const words = declarations(cssText, [['.PlayButton Label', '#PlayButton Label']]);
  if (!box['background-color'] && !box['background-image']) return null;
  const layers = [];
  const picture = /url\(\s*"s2r:\/\/([^"]+\.vtex)"\s*\)/.exec(box['background-image'] || '')?.[1];
  const own = picture && files.find((file) => file.path === `${picture}_c`);
  if (own) { const url = await textureURL(own.data); if (url) layers.push(`url(${url}) center / ${box['background-size'] && !/auto/.test(box['background-size']) ? box['background-size'] : '100% 100%'} no-repeat`); }
  const ground = box['background-color'] && cssGradient(box['background-color']);
  if (ground) layers.push(ground);
  const style = { background: layers.join(', ') || undefined };
  for (const side of ['border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius']) if (box[side]) style[side.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = box[side];
  if (box['box-shadow'] && box['box-shadow'] !== 'none') style.boxShadow = cssShadow(box['box-shadow']);
  const label = { color: words.color, textShadow: words['text-shadow'] ? cssShadow(words['text-shadow']) : undefined, letterSpacing: words['letter-spacing'], fontSize: words['font-size'] };
  return { style, label };
}

const cache = new Map();
async function modLook(id, slot) {
  const key = `${slot}:${id}`;
  if (!cache.has(key)) cache.set(key, (async () => {
    const files = await loadMod(catalog.mods[id]);
    if (slot === 'topbar') { const file = TOPBAR.map((path) => files.find((one) => one.path === path)).find(Boolean); return file ? textureURL(file.data) : null; }
    const style = PLAY_STYLES.map((path) => files.find((one) => one.path === path)).find(Boolean);
    let text = '';
    try { text = style ? panoramaSource(style.data) : ''; } catch { return null; }
    return playLook(text, files);
  })().catch(() => { cache.delete(key); return null; }));
  return cache.get(key);
}
// The chosen top bar and play button mods drawn: { bar: address | null, play: { style, label } | null, drawn: [mod ids] }.
export function useMenuModsLook(choice) {
  const bar = choice?.menuparts?.topbar || '', play = choice?.menuparts?.playbutton || '';
  const [look, setLook] = useState({ bar: null, play: null, drawn: [] });
  useEffect(() => {
    let gone = false;
    Promise.all([bar ? modLook(bar, 'topbar') : null, play ? modLook(play, 'playbutton') : null]).then(([barURL, playLookOf]) => {
      if (!gone) setLook({ bar: barURL, play: playLookOf, drawn: [barURL && bar, playLookOf && play].filter(Boolean) });
    });
    return () => { gone = true; };
  }, [bar, play]);
  return look;
}
