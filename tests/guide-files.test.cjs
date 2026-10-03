const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');

// Files in guides (scripts/guide-files.mjs): no archives, programs or scripts, under any name.
test('guide files: archives, programs and scripts are refused whatever they are called; real files pass', async () => {
  const { GUIDE_FILE_EXTENSIONS, guideFileProblem } = await import('../scripts/guide-files.mjs');
  const { buildVPK } = await import('../scripts/vpk.mjs');
  const md5 = (bytes) => new Uint8Array(createHash('md5').update(bytes).digest());
  const vpk = (files) => buildVPK(files.map(([p, text]) => ({ path: p, data: new TextEncoder().encode(text) })), { md5 });
  const bytes = (...parts) => new Uint8Array(parts.flatMap((part) => (typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part)));
  for (const ext of ['zip', '7z', 'rar', 'exe', 'ps1', 'bat', 'cmd', 'msi', 'scr', 'js', 'vbs', 'lnk', 'jar', 'apk', 'dll'])
    assert.ok(!GUIDE_FILE_EXTENSIONS.includes(ext), ext);
  const refused = {
    'program as text': [bytes('MZ', [0x90, 0, 3, 0]), 'txt'], 'program as a font': [bytes('MZ', [0x90, 0]), 'ttf'], 'zip as a VPK': [bytes('PK', [3, 4, 20, 0]), 'vpk'],
    'zip as json': [bytes('PK', [3, 4]), 'json'], '7z as a picture': [bytes([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]), 'png'], 'rar as sound': [bytes('Rar!', [0x1a, 7, 0]), 'mp3'],
    'gzip as cfg': [bytes([0x1f, 0x8b, 8]), 'cfg'], 'linux program': [bytes('\x7fELF', [2, 1]), 'kv'], 'shortcut': [bytes([0x4c, 0, 0, 0, 1, 0x14, 2, 0]), 'txt'],
    'installer (msi)': [bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'psd'], 'shell script': [bytes('#!/bin/sh\nrm -rf ~'), 'md'],
    'binary as text': [bytes('hello', [0], 'world'), 'txt'], 'not a font': [bytes('just text'), 'ttf'], 'not a VPK': [bytes('nonsense'), 'vpk'],
    'script inside a VPK': [vpk([['panorama/scripts/hud.vjs_c', 'x'], ['scripts/items.txt', '"items" {}']]), 'vpk'],
    'program inside a VPK': [vpk([['bin/run.exe', 'x']]), 'vpk'], 'archive inside a VPK': [vpk([['data/pack.zip', 'x']]), 'vpk'],
    'program bytes inside a VPK': [vpk([['scripts/items.txt', 'MZ\x90\x00']]), 'vpk'], 'unknown ending': [bytes('x'), 'exe'],
  };
  for (const [name, [file, ext]] of Object.entries(refused)) assert.notEqual(guideFileProblem(file, ext), '', name);
  const allowed = {
    'Dota text': [bytes('"DOTAHeroes"\n{\n}\n'), 'txt'], json: [bytes('{"version":3}'), 'json'], 'a VPK of text': [vpk([['scripts/npc/items.txt', '"items" {}'], ['panorama/styles/x.vcss_c', 'css']]), 'vpk'],
    font: [new Uint8Array(fs.readFileSync(path.join(root, 'assets/dota-fonts/libre-franklin/libre-franklin-700.ttf'))), 'ttf'],
    picture: [new Uint8Array(fs.readFileSync(path.join(root, 'assets/faq/grids-in-file.jpg'))), 'jpg'],
  };
  for (const [name, [file, ext]] of Object.entries(allowed)) assert.equal(guideFileProblem(file, ext), '', name);
});
