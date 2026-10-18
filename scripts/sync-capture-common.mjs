// Copies the shared screen-grab block (tools/capture-common/gs-capture-common.ps1) into both capture
// watchers, between its marker lines (each watcher is served alone and run by iex, so the block is
// inlined, not dot-sourced). --check: exit 1 when a watcher's copy differs (tests/capture-common.test.cjs).
//   node scripts/sync-capture-common.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const REPO = fileURLToPath(new URL('..', import.meta.url));
export const COMMON = join(REPO, 'tools/capture-common/gs-capture-common.ps1');
export const WATCHERS = ['tools/hud-capture/gs-hud-capture.ps1', 'tools/menu-capture/gs-menu-capture.ps1'].map((p) => join(REPO, p));
const BLOCK = /# >>> gs-capture-common[\s\S]*?# <<< gs-capture-common\r?\n?/;
const BOM = '﻿';
export function inline(watcher, common) {
  const m = BLOCK.exec(watcher);
  if (!m) throw new Error('no gs-capture-common block');
  return watcher.slice(0, m.index) + common.replace(/\r\n/g, '\n').trimEnd() + '\n' + watcher.slice(m.index + m[0].length);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const common = readFileSync(COMMON, 'utf8').replace(/^﻿/, ''), check = process.argv.includes('--check');
  let stale = 0;
  for (const path of WATCHERS) {
    const text = readFileSync(path, 'utf8').replace(/^﻿/, ''), next = inline(text, common);
    if (next === text) continue;
    stale++;
    if (check) console.error(`${path}: gs-capture-common is not the source's`); else { writeFileSync(path, BOM + next); console.log(`${path}: updated`); }
  }
  if (check && stale) process.exit(1);
}
