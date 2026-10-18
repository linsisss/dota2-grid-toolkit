// Panorama texture paths → the site's files (2026-10-16). Valve's styles name a texture as
// s2r://panorama/images/hud/reborn/bg_minimap_psd.vtex (a .vsvg for vector icons); the site keeps the
// game's pictures under the same paths as .webp (.svg, a few .jpeg), converted from the user's game.
// Several roots (the HUD's, the menu's) can serve one scene: the first that has a picture wins.
// `files` are import.meta.glob results ({ '../../assets/dota-hud/panorama/images/a_psd.webp': url }),
// `base` the folder that comes before «panorama/» in their keys.
export function textureResolver(...roots) {
  const map = new Map();
  for (const [files, base] of roots) {
    for (const [path, url] of Object.entries(files)) {
      const at = path.indexOf(base);
      if (at < 0) continue;
      const key = path.slice(at + base.length).replace(/\.(webp|png|jpe?g)$/i, '');
      if (!map.has(key)) map.set(key, url);
    }
  }
  // texturePath() gives «panorama/images/x_psd» for a vtex and «panorama/images/x.svg» for a vsvg.
  return (path) => map.get(path) ?? map.get(path.replace(/\.svg$/i, '')) ?? null;
}
