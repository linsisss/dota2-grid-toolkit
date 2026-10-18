// What the HUD preview loads, in a chunk of its own (2026-10-16): Valve's layouts and styles of the
// match HUD (assets/dota-hud/panorama/{layout,styles}, ~0.8 MB of text, ~0.1 MB gzipped) and the URLs
// of its pictures. The pictures stay files: a browser fetches only those a shown panel uses.
import { textureResolver } from './textures.mjs';
import { fontFaces } from './css.mjs';
import customUI from '../../../assets/dota-menu/custom_ui.css?raw';
import world from '../../../assets/dota-hud/world.webp';

const files = import.meta.glob('../../../assets/dota-hud/panorama/{layout,styles}/**/*.{xml,css}', { query: '?raw', import: 'default', eager: true });
// Valve's custom_ui.css is the one the interface pack is built from (check-dota-menu.mjs watches it).
export const sources = { ...Object.fromEntries(Object.entries(files).map(([path, text]) => [path.slice(path.indexOf('panorama/')), text])), 'panorama/styles/custom_ui.css': customUI };
const images = import.meta.glob('../../../assets/dota-hud/panorama/images/**/*.{webp,svg,jpeg}', { query: '?no-inline', import: 'default', eager: true });
export const asset = textureResolver([images, 'assets/dota-hud/']);
// The game world without the HUD (the same demo, every #HUDElements child hidden by a test pack), so
// faded or tinted panels show what is behind them, as in the game.
export const worldImage = world;
// Valve's Radiance and Reaver (assets/fonts, from the user's game) for the HUD's texts — loaded by this
// preview only, when a panel uses them (assets/ATTRIBUTION.md).
const fontFiles = import.meta.glob('../../../assets/fonts/{radiance,reaver}-*.otf', { query: '?url', import: 'default', eager: true });
export const fonts = fontFaces(Object.fromEntries(Object.entries(fontFiles).map(([path, url]) => [path.split('/').pop().replace('.otf', ''), url])));
// What Dota draws itself, cut from the user's screenshots (scripts/make-hud-preview.mjs).
const shots = import.meta.glob('../../../assets/dota-hud/preview/*.webp', { query: '?no-inline', import: 'default', eager: true });
const shot = (name) => Object.entries(shots).find(([path]) => path.endsWith(`/${name}.webp`))?.[1];
export const previews = { portrait: shot('portrait'), minimap: shot('minimap'), topbarHero: shot('topbar-hero'), innate: shot('innate'), overInventory: shot('over-inventory') };
