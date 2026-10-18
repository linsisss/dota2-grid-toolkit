const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

// The screen grab shared by both capture watchers (tools/capture-common/gs-capture-common.ps1, 2026-10-17:
// Steam ignored the F12 the watchers injected). Both watchers carry the block byte for byte
// (scripts/sync-capture-common.mjs); grabbing is the default, Steam only with -Steam.
const REPO = join(__dirname, '..');
const read = (p) => readFileSync(join(REPO, p), 'utf8').replace(/^﻿/, '');
const common = read('tools/capture-common/gs-capture-common.ps1');
const WATCHERS = ['tools/hud-capture/gs-hud-capture.ps1', 'tools/menu-capture/gs-menu-capture.ps1'];

test('capture common: both watchers carry the source block exactly', () => {
  const r = spawnSync(process.execPath, [join(REPO, 'scripts/sync-capture-common.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  for (const w of WATCHERS) {
    const text = read(w), block = /# >>> gs-capture-common[\s\S]*?# <<< gs-capture-common\n/.exec(text)[0];
    assert.equal(block, common.trimEnd() + '\n', w);
    assert.equal(text.split('# >>> gs-capture-common').length, 2, `${w}: one block`);
  }
});

test('capture common: the grab is plain GDI in C# 5, no System.Drawing, no cursor, DPI-aware', () => {
  const src = /@'\r?\n([\s\S]*?)\r?\n'@/.exec(common)[1];
  assert.ok(!/\$"|\?\.|nameof\(|\bout var\b|\)\s*=>|\{ get; (private )?set; \} =|\bis (not )?null\b/.test(src), 'C# 6+ syntax');
  assert.doesNotMatch(src, /System\.Drawing/, 'no assembly references (PowerShell 7 on .NET 10 needs extra ones)');
  assert.match(src, /BitBlt\(mem, 0, 0, w, h, screen, x, y, SRCCOPY\)/);
  assert.match(src, /SRCCOPY = 0x00CC0020;/, 'no CAPTUREBLT, no cursor drawing');
  assert.doesNotMatch(src, /DrawIcon|CURSORINFO|GetCursorInfo/);
  assert.match(src, /biHeight = -h/, 'top-down rows');
  assert.match(src, /SetProcessDPIAware/);
  assert.match(common, /\[GsGrabV1\]::DpiAware\(\)/);
  // BGRA → RGB, nothing else done to the bytes.
  assert.match(src, /rgb\[o \+ xx \* 3\] = row\[xx \* 4 \+ 2\]; rgb\[o \+ xx \* 3 \+ 1\] = row\[xx \* 4 \+ 1\]; rgb\[o \+ xx \* 3 \+ 2\] = row\[xx \* 4\];/);
});

test('capture common: grabbing is the default, Steam an opt-in; borderless switched and put back', () => {
  for (const w of WATCHERS) {
    const text = read(w), code = text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    assert.match(text, /\[switch\]\$Steam\n\)/, `${w}: -Steam`);
    assert.match(code, /\$script:UseSteam = \[bool\]\$Steam/);
    assert.match(code, /if \(\$script:UseSteam -and \$R\.mode -eq 'auto' -and \$now -ge \$nextPress\)/, `${w}: F12 is sent only on the Steam route`);
    assert.match(code, /if \(-not \$script:UseSteam\) \{\n\s+\$S\.video = Set-DotaBorderless \$root/, `${w}: borderless before the packs`);
    assert.match(code, /finally \{[\s\S]{0,900}Restore-DotaVideo \$root/, `${w}: video.txt put back in finally`);
    assert.match(code, /Restore-DotaVideo \$root\) \{ Say 'Режим экрана Dota с прошлого раза/, `${w}: a leftover video.txt put back at the start`);
    assert.match(code, /Test-GrabUsable \$ctx \$g/, `${w}: grabs checked (size, black, frozen)`);
  }
  // The keys Dota's video.txt uses (Source 2: setting.fullscreen / setting.nowindowborder / defaultres).
  for (const k of ['fullscreen', 'nowindowborder', 'defaultres', 'defaultresheight']) assert.match(common, new RegExp(`'${k}'`));
});
