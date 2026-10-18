#!/usr/bin/env node
// «Сосулечный боец»: the round, K.O. and Perfect videos of the fight (panorama/videos/crownfall/fight_text_*.webm,
// outside pak01: 1920 × 1080 VP9 with alpha, ≈17 MB) re-encoded for the page into assets/minigames/fighter/videos/
// at 960 × 540, still VP9 with alpha, without sound (Valve's MoviePanels play them with disableaudio). ≈1.7 MB.
//   node scripts/fighter-scene/videos.mjs --src <dir with fight_text_*.webm>
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), OUT = join(ROOT, 'assets/minigames/fighter/videos');
const args = process.argv.slice(2), src = resolve(args[args.indexOf('--src') + 1] || '.');
mkdirSync(OUT, { recursive: true });
// round1-3 and perfect exist per language (_english); the K.O. one has no text to translate.
const VIDEOS = { round1: 'fight_text_round1_english', round2: 'fight_text_round2_english', round3: 'fight_text_round3_english', perfect: 'fight_text_perfect_english', ko: 'fight_text_ko' };
for (const [name, file] of Object.entries(VIDEOS)) {
  const out = join(OUT, `${name}.webm`);
  // libvpx-vp9 as the decoder keeps the alpha channel (the default decoder drops it).
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-c:v', 'libvpx-vp9', '-i', join(src, `${file}.webm`), '-vf', 'scale=960:540', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p',
    '-b:v', '0', '-crf', '42', '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1', '-auto-alt-ref', '0', '-an', out]);
  console.log(`${name}.webm ${(statSync(out).size / 1024).toFixed(0)} KB`);
}
