#!/usr/bin/env node
// «Драконьи шахматы»: shrinks the music the asset pipeline copied into assets/minigames/chess/sounds/
// (match3_main, the creep and hero fight tracks, the win and loss music: ≈6 MB of Valve's ~100 kbit/s MP3)
// to 64 kbit/s, and cuts the two end tracks (92 s and 53 s, heard behind the result screen) to 45 s with a
// fade. Run after scripts/make-minigame-assets.mjs; the pipeline does not convert these files again while
// their sources are unchanged. Updates the durations and loop points in sounds.json.
//   node scripts/chess-scene/music.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), DIR = join(ROOT, 'assets/minigames/chess');
const table = JSON.parse(readFileSync(join(DIR, 'sounds.json'), 'utf8'));
const MUSIC = ['match3.match_music', 'match3.match_music.creep', 'match3.match_music.hero', 'match3.match_music.win', 'match3.match_music.loss'];
const CUT = { 'match3.match_music.win': 45, 'match3.match_music.loss': 45 };
const duration = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
const kbps = (file) => Math.round(statSync(file).size * 8 / duration(file) / 1000);
let before = 0, after = 0;
for (const name of MUSIC) for (const rel of table.events[name]?.files || []) {
  const file = join(DIR, rel), cut = CUT[name];
  if (kbps(file) > 70) {
  before += statSync(file).size;
  const tmp = `${file}.tmp.mp3`;
  const filters = cut ? ['-af', `afade=t=out:st=${cut - 3}:d=3`, '-t', String(cut)] : [];
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, ...filters, '-map_metadata', '-1', '-codec:a', 'libmp3lame', '-b:a', '64k', '-ar', '44100', tmp]);
  renameSync(tmp, file);
  after += statSync(file).size;
  } else console.log('already small:', rel);
  const d = +duration(file).toFixed(6);
  table.files[rel] = { ...table.files[rel], duration: d, ...(table.files[rel]?.loop ? { loop: [0, d] } : {}) };
  if (table.events[name].duration > d || cut) table.events[name].duration = Math.max(...table.events[name].files.map((f) => table.files[f]?.duration || 0));
  console.log(`${rel}: ${kbps(file)} kbit/s, ${d.toFixed(1)} s`);
}
writeFileSync(join(DIR, 'sounds.json'), JSON.stringify(table, null, 1));
console.log(`music: ${(before / 1048576).toFixed(2)} MB → ${(after / 1048576).toFixed(2)} MB`);
