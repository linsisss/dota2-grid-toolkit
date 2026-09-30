// Everything the hero needs, in its own chunk: loaded only when «За героем» is open.
import manifest from '../../../assets/dota-hero/sf-arcana/hero.json';
import { createHero } from './scene.js';

const BASE = '../../../assets/dota-hero/sf-arcana/';
const files = import.meta.glob('../../../assets/dota-hero/sf-arcana/**/*.{glb,webp}', { query: '?url', import: 'default', eager: true });

export function loadHero(canvas) {
  return createHero(canvas, { manifest, url: (path) => files[BASE + path] });
}
