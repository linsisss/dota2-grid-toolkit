const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

// The HUD capture watcher (tools/hud-capture/gs-hud-capture.ps1), hosted as /hud-capture.ps1 and run
// by iex in Windows PowerShell 5.1 or PowerShell 7. Static checks here; the full -SelfTest (fake Dota,
// synthetic frames, whole sessions) runs when GS_PWSH (a pwsh binary) and GS_HUD_KIT (the built packs
// folder with manifest.json and plan.json) are set; GS_HUD_PROBE adds real Steam frames.
const FILE = join(__dirname, '..', 'tools/hud-capture/gs-hud-capture.ps1');
const raw = readFileSync(FILE);
const text = raw.toString('utf8').replace(/^﻿/, '');
const csharp = [...text.matchAll(/@'\r?\n([\s\S]*?)\r?\n'@/g)].map((m) => m[1]);

test('HUD capture watcher: UTF-8 with BOM, never exits the owner\'s shell, PowerShell 5.1 safe', () => {
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM (Windows PowerShell 5.1 reads BOM-less files as ANSI)');
  assert.ok(/^param\(/.test(text), 'param block first');
  const code = text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.ok(!/(^|[;{]\s*)exit\b/m.test(code), 'no exit: under iex it closes the PowerShell window');
  assert.ok(!/\$IsWindows|\?\?|\?\.|::new\(/.test(code.replace(/@'[\s\S]*?'@/g, '')), 'no PowerShell 7-only syntax');
  assert.ok(/finally \{[\s\S]{0,200}Restore-Owner/.test(text), 'the owner pak03 is restored in finally');
});

test('HUD capture watcher: C# stays within C# 5 (the .NET Framework compiler of Windows PowerShell 5.1)', () => {
  assert.equal(csharp.length, 3, 'probe, Win32 and the shared grab (tools/capture-common)');
  for (const src of csharp) {
    assert.ok(!/\$"|\?\.|nameof\(|\bout var\b|\)\s*=>|\{ get; (private )?set; \} =|\bis (not )?null\b/.test(src), 'C# 6+ syntax');
  }
  assert.match(csharp[1], /0x7B/); assert.match(csharp[1], /0x58/);
});

test('HUD capture watcher: every plan field it reads is in the snapshot', async () => {
  const P = await import('../scripts/hud-capture/plan.mjs');
  const s = JSON.parse(JSON.stringify(P.planSnapshot()));
  const g = s.geometry;
  assert.equal(g.free.length, 3); assert.equal(g.lowerBackdrop.length, 2); assert.equal(g.chatInk.length, 4); assert.equal(g.cloneProbe.length, 2);
  assert.ok(g.ring.x && g.ring.y.length === 2 && g.ring.spread && g.lowerHeight);
  for (const k of ['minPhase', 'interval', 'jitter', 'cap', 'sMin', 'sCap']) assert.equal(typeof s.watcher[k], 'number', k);
  assert.ok(s.lower.period && s.lower.scales.length && s.lower.slots.length);
  // The owner's queue: C1, the static-scale S packs, C2; every S pack carries its slots, scale and chat.
  assert.deepEqual(s.queue, s.packs.filter((p) => p.role !== 'fallback').map((p) => p.id));
  for (const p of s.packs.filter((x) => x.role === 'scale')) assert.ok(/^S-\d+-\d+$/.test(p.id) && p.lower.length && p.scale.top && p.chat.font, p.id);
  assert.equal(s.packs.find((p) => p.id === 'C1').scale.top, 100);
  assert.ok(s.lower.blocks.every((b) => Number.isInteger(b.mark)));
  // Mark colours decode as the probe decodes them: R 255, G = 20·mark, B 0/120/240.
  for (const m of s.lower.marks) {
    const [r, gg, b] = [1, 3, 5].map((i) => parseInt(m.colour.slice(i, i + 2), 16));
    const block = s.lower.blocks.find((x) => x.id === m.block);
    assert.equal(r, 255); assert.equal(gg, 20 * block.mark); assert.equal(b, { core: 0, g1: 120, g2: 240 }[m.part]);
  }
  assert.deepEqual(s.lower.blocks.filter((b) => b.sweep).map((b) => b.id), ['HON', 'AON', 'AOFF', 'HOFF']);
  assert.deepEqual(s.lower.blocks.filter((b) => b.fixed === 'T').map((b) => b.id), ['RDEF', 'RCLR', 'RCMP']);
  assert.ok(s.top.scales.length && s.chat.fonts.length);
  // The watcher's pack roles cover every pack.
  assert.deepEqual(s.packs.map((p) => p.id).filter((id) => !/^(C1|C2|F-bg|S-\d+-\d+)$/.test(id)), []);
  // No pack animates what Valve never animates (the first C1 crashed Dota on hud_reborn.xml).
  for (const p of s.packs) for (const t of p.tracks) for (const q of [t.property].flat()) assert.ok(P.VALVE_KEYFRAME_PROPS.includes(q), `${p.id} ${t.name} ${q}`);
});

test('HUD capture watcher: -SelfTest', { skip: !(process.env.GS_PWSH && process.env.GS_HUD_KIT) && 'set GS_PWSH and GS_HUD_KIT', timeout: 900000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'gs-hud-watch-'));
  const args = ['-NoProfile', '-File', FILE, '-SelfTest', '-KitDir', process.env.GS_HUD_KIT, '-OutDir', out];
  if (process.env.GS_HUD_PROBE) args.push('-ProbeDir', process.env.GS_HUD_PROBE);
  const r = spawnSync(process.env.GS_PWSH, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  const log = (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, '');
  assert.match(log, /Self-test: \d+ passed, 0 failed/, log.slice(-4000));
});
