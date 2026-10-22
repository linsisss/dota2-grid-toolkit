const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { inflateSync } = require('node:zlib');

// Panorama pictures written by scripts/dota-vtex.mjs (the heroes' portraits, 2026-10-22).
const picture = (width, height) => {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    rgba.set([(x * 255 / width) | 0, (y * 255 / height) | 0, ((x ^ y) * 7) & 255, x < 3 ? 128 : 255], i);
  }
  return rgba;
};
// PNG's pixels back (8-bit RGBA, any filter), to check our encoder by an independent decoder.
function decodePNG(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), width = view.getUint32(16), height = view.getUint32(20);
  const idat = [];
  for (let at = 8; at < bytes.length;) { const length = view.getUint32(at), type = String.fromCharCode(...bytes.subarray(at + 4, at + 8)); if (type === 'IDAT') idat.push(bytes.subarray(at + 8, at + 8 + length)); at += 12 + length; }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * 4, out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const v = raw[y * (stride + 1) + 1 + i], a = i >= 4 ? out[y * stride + i - 4] : 0, b = y ? out[(y - 1) * stride + i] : 0, c = y && i >= 4 ? out[(y - 1) * stride + i - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      out[y * stride + i] = (v + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][type]) & 255;
    }
  }
  return { width, height, rgba: out };
}

test('a PNG_RGBA8888 texture: the resource Valve writes, its PNG after it', async () => {
  const { vtexResource, readVtex, pngSize, VTEX_FORMATS, decodeDXT5 } = await import('../scripts/dota-vtex.mjs');
  const rgba = picture(142, 188), bytes = await vtexResource({ path: 'panorama/images/heroes/selection/npc_dota_hero_axe_png.vtex_c', rgba, width: 142, height: 188, format: 'png', flags: 0x88 });
  const texture = readVtex(bytes);
  assert.deepEqual(texture.blocks, ['REDI', 'DATA']);
  assert.equal(texture.version, 1, 'resource version 1, as Valve’s textures');
  assert.deepEqual([texture.vtexVersion, texture.width, texture.height, texture.depth, texture.format, texture.mips, texture.flags], [1, 142, 188, 1, VTEX_FORMATS.PNG_RGBA8888, 1, 0x88]);
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), texture.size, 'the header’s size ends at the DATA block; the picture follows');
  assert.deepEqual(pngSize(texture.payload), { width: 142, height: 188 });
  assert.deepEqual(decodePNG(texture.payload).rgba, rgba, 'the PNG holds the picture exactly');
  // Reflectivity: the mean of the sRGB values, alpha too.
  const mean = [0, 1, 2, 3].map((k) => rgba.filter((_, i) => i % 4 === k).reduce((s, v) => s + v, 0) / (142 * 188) / 255);
  texture.reflectivity.forEach((value, k) => assert.ok(Math.abs(value - mean[k]) < 1e-5, `reflectivity ${k}`));
  // FALLBACK_BITS: the picture at 32 × 32 as DXT5.
  assert.equal(texture.extra.length, 1);
  assert.equal(texture.extra[0].type, 1);
  assert.equal(texture.extra[0].data.length, 1024);
  const fallback = decodeDXT5(texture.extra[0].data, 32, 32);
  assert.ok(Math.abs(fallback[0] - rgba[0]) < 24 && Math.abs(fallback[31 * 4] - 255 * 31 / 32) < 40, 'the fallback is the picture, small');
  // The REDI names the source as resourcecompiler does.
  assert.ok(new TextDecoder().decode(bytes.subarray(40, texture.size)).includes('panorama/images/heroes/selection/npc_dota_hero_axe.png'));
});

test('a BGRA8888 texture: raw pixels, top row first', async () => {
  const { vtexResource, readVtex, VTEX_FORMATS } = await import('../scripts/dota-vtex.mjs');
  const rgba = picture(32, 32), bytes = await vtexResource({ path: 'panorama/images/heroes/icons/npc_dota_hero_axe_png.vtex_c', rgba, width: 32, height: 32, format: 'bgra', flags: 0x0f });
  const texture = readVtex(bytes);
  assert.equal(texture.format, VTEX_FORMATS.BGRA8888);
  assert.equal(texture.payload.length, 32 * 32 * 4);
  for (let i = 0; i < rgba.length; i += 4) assert.deepEqual([...texture.payload.subarray(i, i + 4)], [rgba[i + 2], rgba[i + 1], rgba[i], rgba[i + 3]]);
  await assert.rejects(vtexResource({ path: 'panorama/images/a_png.vtex_c', rgba, width: 31, height: 32, format: 'bgra' }), /размер/);
  assert.throws(() => readVtex(new Uint8Array(100)), /Не текстура/);
});

test('DXT5: a flat block and a two-colour block survive', async () => {
  const { encodeDXT5, decodeDXT5 } = await import('../scripts/dota-vtex.mjs');
  const flat = new Uint8Array(16 * 4).fill(200);
  assert.deepEqual([...decodeDXT5(encodeDXT5(flat, 4, 4), 4, 4)].map((v) => Math.abs(v - 200) <= 8), Array(64).fill(true));
  const two = new Uint8Array(16 * 4);
  for (let p = 0; p < 16; p++) two.set(p < 8 ? [255, 0, 0, 255] : [0, 0, 255, 0], p * 4);
  const back = decodeDXT5(encodeDXT5(two, 4, 4), 4, 4);
  assert.deepEqual([back[0] > 230, back[2] < 24, back[3], back[8 * 4] < 24, back[8 * 4 + 2] > 230, back[8 * 4 + 3]], [true, true, 255, true, true, 0], "red stays red, blue stays blue (a sixteenth inset)");
});

// Read back by Source 2 Viewer (ValveResourceFormat's CLI), when it is on this machine: S2V_CLI, or the
// copy the project's tools keep. Its decoded picture must be ours, pixel for pixel.
const S2V = process.env.S2V_CLI || '/home/code/dota-loadout/.cache/vrf-20.0/Source2Viewer-CLI';
test('Source 2 Viewer reads our textures back pixel for pixel', { skip: !fs.existsSync(S2V) && 'no Source2Viewer-CLI here' }, async () => {
  const { vtexResource } = await import('../scripts/dota-vtex.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-vtex-'));
  try {
    for (const [name, width, height, format] of [['card', 142, 188, 'png'], ['wide', 128, 72, 'png'], ['icon', 32, 32, 'bgra']]) {
      const rgba = picture(width, height), file = path.join(dir, `${name}.vtex_c`), out = path.join(dir, name);
      fs.writeFileSync(file, await vtexResource({ path: `panorama/images/heroes/${name}_png.vtex_c`, rgba, width, height, format }));
      const info = execFileSync(S2V, ['-i', file, '-b', 'DATA'], { encoding: 'utf8' });
      assert.match(info, new RegExp(`Width\\s+= ${width}\\b[\\s\\S]*Height\\s+= ${height}\\b`), name);
      assert.match(info, format === 'png' ? /VTEX_FORMAT_PNG_RGBA8888/ : /VTEX_FORMAT_BGRA8888/, name);
      fs.mkdirSync(out);
      execFileSync(S2V, ['-i', file, '-d', '-o', path.join(out, 'x.png')]);
      const decoded = decodePNG(fs.readFileSync(path.join(out, fs.readdirSync(out)[0])));
      assert.deepEqual([decoded.width, decoded.height], [width, height]);
      assert.deepEqual(decoded.rgba, rgba, `${name}: decoded = ours, alpha too`);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
