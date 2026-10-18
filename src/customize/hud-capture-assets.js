// What the HUD preview loads (2026-10-17), in a chunk of its own: hud.json (where every plate of the
// owner's capture sits) and the URLs of the WebP atlases (scripts/hud-capture-solve.mjs writes both into
// assets/dota-hud-capture). The atlases stay files: only the scales in use are fetched.
import manifest from '../../assets/dota-hud-capture/hud.json';

const files = import.meta.glob('../../assets/dota-hud-capture/*.webp', { query: '?no-inline', import: 'default', eager: true });
export const fileURL = (name) => Object.entries(files).find(([path]) => path.endsWith(`/${name}`))?.[1];
export { manifest };
