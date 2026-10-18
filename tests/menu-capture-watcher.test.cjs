const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

// The main-menu capture watcher (tools/menu-capture/gs-menu-capture.ps1), hosted as /menu-capture.ps1 and
// run by iex in Windows PowerShell 5.1 or PowerShell 7. Static checks here; with GS_PWSH (a pwsh binary)
// the full -SelfTest runs against packs built offline (fake Dota, synthetic frames, whole sessions).
const REPO = join(__dirname, '..');
const FILE = join(REPO, 'tools/menu-capture/gs-menu-capture.ps1');
const raw = readFileSync(FILE);
const text = raw.toString('utf8').replace(/^﻿/, '');
const csharp = [...text.matchAll(/@'\r?\n([\s\S]*?)\r?\n'@/g)].map((m) => m[1]);

test('menu capture watcher: UTF-8 with BOM, never exits the owner\'s shell, PowerShell 5.1 safe, always restores', () => {
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM (Windows PowerShell 5.1 reads BOM-less files as ANSI)');
  assert.ok(/^param\(/.test(text), 'param block first');
  const code = text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.ok(!/(^|[;{]\s*)exit\b/m.test(code), 'no exit: under iex it closes the PowerShell window');
  assert.ok(!/\$IsWindows|\?\?|\?\.|::new\(/.test(code.replace(/@'[\s\S]*?'@/g, '')), 'no PowerShell 7-only syntax');
  assert.ok(/finally \{[\s\S]{0,200}Restore-Owner/.test(text), 'the owner files are restored in finally');
  assert.match(text, /pak02_dir\.vpk/); assert.match(text, /'pak03_dir\.vpk', 'pak04_dir\.vpk'/);
  assert.match(text, /\.gs-menu-backup/); assert.doesNotMatch(code.replace(/pak03_dir\.vpk\.gs-backup', 'pak03_dir\.vpk\.gs-none/, ''), /\.gs-backup"/, 'never the HUD watcher\'s backup names');
  // $P (the plan) and $p are one variable in PowerShell: no loop over $p where the plan table is built.
  assert.doesNotMatch(text.slice(text.indexOf('function Initialize-Plan'), text.indexOf('function New-PackState')), /foreach \(\$p in/);
});

test('menu capture watcher: C# within C# 5; the Win32 type is the HUD watcher\'s, text for text', () => {
  assert.equal(csharp.length, 3, 'probe, Win32 and the shared grab (tools/capture-common)');
  for (const src of csharp) assert.ok(!/\$"|\?\.|nameof\(|\bout var\b|\)\s*=>|\{ get; (private )?set; \} =|\bis (not )?null\b/.test(src), 'C# 6+ syntax');
  const hud = readFileSync(join(REPO, 'tools/hud-capture/gs-hud-capture.ps1'), 'utf8').replace(/^﻿/, '');
  const hudWin = [...hud.matchAll(/@'\r?\n([\s\S]*?)\r?\n'@/g)].map((m) => m[1])[1];
  assert.match(hudWin, /public static class GsWinV1/);
  assert.equal(csharp[1], hudWin, 'GsWinV1: one session may run both scripts (Add-Type is skipped for a loaded type)');
  assert.match(csharp[0], /public class GsMenuFrameV1/); assert.match(csharp[0], /public static class GsMenuProbeV1/);
});

test('menu capture watcher: the code check and every plan field it reads match the plan', async () => {
  const P = await import('../scripts/menu-capture/plan.mjs');
  const s = JSON.parse(JSON.stringify(P.planSnapshot()));
  assert.equal(s.probes.free.length, 4); assert.equal(s.probes.rows.length, 2);
  for (const k of ['size', 'pitch', 'squares']) assert.equal(typeof s.probes[k], 'number', k);
  assert.ok(s.probes.toggles.bar.length === 2 && s.probes.toggles.rail.length === 2);
  for (const k of ['interval', 'jitter', 'noFrameWarn', 'toggleAfter']) assert.equal(typeof s.watcher[k], 'number', k);
  for (const k of ['m1', 'v1']) { assert.equal(typeof s.watcher[k].min, 'number'); assert.equal(typeof s.watcher[k].cap, 'number'); assert.ok(Array.isArray(s.watcher[k].gRequired)); }
  for (const p of s.packs) { assert.ok(p.code && p.period && p.states.length && p.states.every((x) => x.id && Array.isArray(x.on))); }
  // The C# check square is the plan's.
  assert.match(text, /\(v0 \+ 3 \* v1 \+ 5 \* v2 \+ 1\) % 8/); assert.match(text, /\(v\[0\] \+ 3 \* v\[1\] \+ 5 \* v\[2\] \+ 1\) % 8/);
  assert.equal(P.codeCheck(1, 2, 3), (1 + 6 + 15 + 1) % 8);
});

test('menu capture watcher: -SelfTest', { skip: !process.env.GS_PWSH && 'set GS_PWSH', timeout: 1200000 }, () => {
  const kit = mkdtempSync(join(tmpdir(), 'gs-menu-kit-')), out = mkdtempSync(join(tmpdir(), 'gs-menu-watch-'));
  const b = spawnSync(process.execPath, [join(REPO, 'scripts/make-menu-capture.mjs'), kit, '--offline'], { encoding: 'utf8' });
  assert.equal(b.status, 0, b.stderr);
  const r = spawnSync(process.env.GS_PWSH, ['-NoProfile', '-File', FILE, '-SelfTest', '-KitDir', kit, '-OutDir', out], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const log = (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, '');
  assert.match(log, /Self-test: \d+ passed, 0 failed/, log.slice(-4000));
});
