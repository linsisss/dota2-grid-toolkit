const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../scripts/data.mjs').default;
const { convert } = require('../scripts/converter.mjs');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const allowed = new Set(Object.values(JSON.parse(read('data/symbols.json'))).join(''));

test('all three symbol libraries share the curated catalog without duplicates', () => {
  const pixel = read('tools/pixel-ascii-editor.html');
  const converter = read('tools/lineart-converter.html');
  const pixelLibrary = vm.runInNewContext(
    pixel.slice(pixel.indexOf('const SYMBOL_LIB ='), pixel.indexOf('const TOOLS =')) +
      '\nJSON.stringify(SYMBOL_LIB)'
  );
  const converterLibrary = vm.runInNewContext(
    converter.slice(converter.indexOf('const LIBRARY ='), converter.indexOf('const DOTA_W =')) +
      '\nJSON.stringify(LIBRARY)'
  );
  assert.deepEqual(JSON.parse(pixelLibrary), D.symbols);
  assert.deepEqual(
    Object.fromEntries(
      JSON.parse(converterLibrary).map(({ name, chars }) => [name, Array.from(chars)])
    ),
    D.symbols
  );
  const characters = Object.values(D.symbols).flat();
  assert.equal(characters.length, allowed.size);
  assert.deepEqual(new Set(characters), allowed);
  assert.deepEqual(
    new Set(Array.from(read('data/symbols.txt')).filter((c) => !/\s/u.test(c))),
    allowed
  );
  assert.ok(!characters.some((c) => /[\u2500-\u259f\ufe0f]/u.test(c)));
});

test('built-in frames use the curated symbol catalog', () => {
  for (const [name, frame] of Object.entries(D.frames))
    for (const glyph of Object.values(frame)) assert.ok(allowed.has(glyph), `${name}: ${glyph}`);
});

test('image presets preserve their own contour and shading alphabets independently of the picker', () => {
  assert.deepEqual(D.presets, JSON.parse(read('presets/presets.json')).presets);
  const width = 48,
    height = 48,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const dark = x > 9 && x < 36 && y > 9 && y < 36;
      data.set([dark ? 0 : 255, dark ? 0 : 255, dark ? 0 : 255, 255], (y * width + x) * 4);
    }
  for (const [name, preset] of Object.entries(D.presets)) {
    const presetAlphabet = new Set(
      Array.from(preset.charset + (preset.shading ? preset.shadeCharset : ''))
    );
    const output = convert({ width, height, data }, preset);
    assert.ok(output.length > 0, name);
    for (const { ch } of output) assert.ok(presetAlphabet.has(ch), `${name} output: ${ch}`);
  }
});

test('upstream line, hatching and Unicode presets cannot regress to dot-only replacements', () => {
  const line = D.presets['Чистый line-art'];
  const hatching = D.presets['Гравюра (штриховка)'];
  const logo = D.presets['Логотип / иконка'];
  const japanese = D.presets['Японский стиль (иероглифы)'];
  assert.equal(line.charset, '-\\|/');
  assert.equal(line.autoOrient, true);
  assert.equal(line.onlyDots, false);
  assert.equal(hatching.charset, '-\\|/');
  assert.equal(hatching.shadeCharset, '-/\\|');
  assert.equal(logo.charset, '-\\|/─╲│╱');
  assert.equal(japanese.charset, 'あいうえおかきくけこ');
  const width = 96,
    height = 96,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const value = (x - 48) ** 2 + (y - 48) ** 2 < 30 ** 2 ? 0 : 255;
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  const letters = (preset) =>
    new Set(convert({ width, height, data }, preset).map((point) => point.ch));
  const strokes = letters(line);
  assert.ok(strokes.size >= 3, 'Line preset must actually render differently oriented strokes');
  assert.ok([...strokes].every((char) => '-\\|/'.includes(char)));
  assert.ok(
    [...letters(japanese)].some((char) => japanese.charset.includes(char)),
    'Japanese contours must use Japanese glyphs'
  );
  const dots = letters(D.presets['Тонкие точки (без заливки)']);
  assert.deepEqual(dots, new Set(['.']));
});
