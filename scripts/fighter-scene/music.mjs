#!/usr/bin/env node
// «Сосулечный боец»: shrinks the sounds the asset pipeline copied into assets/minigames/fighter/sounds/ and makes
// sounds.json tell their real lengths. Music to 64 kbit/s (the menu theme keeps its loop points: it loops
// 95.17–116.32 s), the victory stinger cut to 20 s with a fade (it plays under the results), the announcer and the
// effects to 96 kbit/s mono when they are above that; the countdown (fighting_game.match_intro) was cut to 30 s
// when it was copied, its event still said 153 s. Run after scripts/make-minigame-assets.mjs.
//   node scripts/fighter-scene/music.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), DIR = join(ROOT, 'assets/minigames/fighter');
const table = JSON.parse(readFileSync(join(DIR, 'sounds.json'), 'utf8'));
const MUSIC = new Set(['fighting_game.menu_music', 'fighting_game.match_music', 'fighting_game.victory_music', 'fighting_game.match_intro']);
const CUT = { 'fighting_game.victory_music': 20 };
const duration = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
const kbps = (file) => Math.round(statSync(file).size * 8 / duration(file) / 1000);
let before = 0, after = 0;
const done = new Set();
for (const [name, event] of Object.entries(table.events)) for (const rel of event.files || []) {
  if (!rel || done.has(rel)) continue;
  done.add(rel);
  const file = join(DIR, rel), music = MUSIC.has(name), cut = CUT[name], target = music ? 64 : 96;
  if (kbps(file) > target + 8 || cut) {
    before += statSync(file).size;
    const tmp = `${file}.tmp.mp3`, filters = cut ? ['-af', `afade=t=out:st=${cut - 3}:d=3`, '-t', String(cut)] : [];
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, ...filters, '-map_metadata', '-1', '-codec:a', 'libmp3lame', '-b:a', `${target}k`, '-ar', '44100', ...(music ? [] : ['-ac', '1']), tmp]);
    renameSync(tmp, file);
    after += statSync(file).size;
  }
  const d = +duration(file).toFixed(6), old = table.files[rel];
  if (old) table.files[rel] = { ...old, duration: d, ...(old.loop ? { loop: [Math.min(old.loop[0], d), Math.min(old.loop[1], d)] } : {}) };
}
for (const event of Object.values(table.events)) {
  const lengths = (event.files || []).filter(Boolean).map((f) => table.files[f]?.duration ?? duration(join(DIR, f)));
  if (lengths.length) event.duration = +Math.max(...lengths).toFixed(6);
}
writeFileSync(join(DIR, 'sounds.json'), JSON.stringify(table, null, 1));
console.log(`sounds: ${(before / 1048576).toFixed(2)} MB → ${(after / 1048576).toFixed(2)} MB`);
