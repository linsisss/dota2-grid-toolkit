const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

const modules = Promise.all([import('../scripts/panorama-laco.mjs'), import('../scripts/vpk.mjs')]);
const encode = text => new TextEncoder().encode(text);

// The writers were checked against published mods compiled with Valve's tools (1633 layouts, 1753
// styles, 143 scripts: every KeyValues3 block and every resource comes back byte for byte). Those
// files are not ours to commit; point PANORAMA_LACO_CORPUS at a folder of their pakNN_dir.vpk to
// repeat the check (last test). The rest runs without them.

const LAYOUT = `<root>
	<styles>
		<include src="s2r://panorama/styles/gridstudio_laco_test.vcss" />
	</styles>
	<scripts>
		<include src="s2r://panorama/scripts/gridstudio_laco_test.vjs" />
	</scripts>
	<Panel class="Test &amp; more" hittest="">
		<Label text="Привет" />
		<Button id="Armory" onactivate="DOTAShowArmory();">
			<Label text="Открыть Арсенал" />
		</Button>
		<Image src="s2r://panorama/images/x_png.vtex" />
		<Movie src="file://{resources}/videos/x.webm" />
	</Panel>
</root>
`;

test('a layout with an event handler and Cyrillic compiles to a LaCo syntax tree and back', async () => {
  const [{ lacoLayout, lacoRead, layoutTree, layoutXML, readResource }, { crc32 }] = await modules;
  const bytes = lacoLayout('panorama/layout/gridstudio_laco_test.vxml_c', LAYOUT);
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), bytes.length);
  assert.equal(view.getUint16(4, true), 12, 'header version');
  assert.equal(view.getUint16(6, true), 3, 'resource version');
  const { blocks } = readResource(bytes);
  assert.deepEqual(blocks.map(([name]) => name), ['RED2', 'DATA', 'LaCo']);
  // DATA is a stub: the source's CRC and an empty image table.
  const data = blocks[1][1];
  assert.equal(data.length, 6);
  assert.equal(new DataView(data.buffer, data.byteOffset).getUint32(0, true), crc32(encode(LAYOUT)));

  const { tree, red2, sourceCRC } = lacoRead(bytes);
  assert.equal(sourceCRC, crc32(encode(LAYOUT)));
  const root = tree.m_AST.m_pRoot;
  assert.deepEqual(Object.keys(root), ['eType', 'vecChildren', 'sourceLineColumn']);
  assert.deepEqual(root.sourceLineColumn, [], 'the root has no position');
  const [styles, scripts, panel] = root.vecChildren;
  assert.deepEqual(styles, {
    eType: 'STYLES',
    child: { eType: 'INCLUDE', child: { eType: 'REFERENCE_COMPILED', name: 'panorama/styles/gridstudio_laco_test.vcss' }, sourceLineColumn: [3, 4] },
    sourceLineColumn: [2, 3]
  });
  assert.equal(scripts.child.child.name, 'panorama/scripts/gridstudio_laco_test.vjs');
  // Attributes first (an empty value has no name, entities are decoded), then the child panels.
  assert.deepEqual(panel.vecChildren.slice(0, 2), [
    { eType: 'PANEL_ATTRIBUTE', name: 'class', child: { eType: 'PANEL_ATTRIBUTE_VALUE', name: 'Test & more' } },
    { eType: 'PANEL_ATTRIBUTE', name: 'hittest', child: { eType: 'PANEL_ATTRIBUTE_VALUE' } }]);
  const [label, button, image, movie] = panel.vecChildren.slice(2);
  assert.deepEqual(label, { eType: 'PANEL', name: 'Label', child: { eType: 'PANEL_ATTRIBUTE', name: 'text', child: { eType: 'PANEL_ATTRIBUTE_VALUE', name: 'Привет' } }, sourceLineColumn: [9, 4] });
  assert.deepEqual(button.vecChildren[1], { eType: 'PANEL_ATTRIBUTE', name: 'onactivate', child: { eType: 'PANEL_ATTRIBUTE_VALUE', name: 'DOTAShowArmory();' } });
  assert.equal(button.vecChildren[2].child.child.name, 'Открыть Арсенал');
  assert.deepEqual(button.sourceLineColumn, [10, 4]);
  assert.deepEqual(image.child.child, { eType: 'REFERENCE_COMPILED', name: 'panorama/images/x_png.vtex' });
  assert.deepEqual(movie.child.child, { eType: 'REFERENCE_PASSTHROUGH', name: '{resources}/videos/x.webm' });

  // Decompiled XML compiles back to the same tree; placed at the recorded positions, with them too.
  assert.deepEqual(layoutTree(layoutXML(tree, { positioned: true })), tree);
  const strip = node => JSON.parse(JSON.stringify(node, (key, value) => (key === 'sourceLineColumn' ? undefined : value)));
  assert.deepEqual(strip(layoutTree(layoutXML(tree))), strip(tree));
  assert.equal(layoutTree(LAYOUT).m_AST.m_pRoot.vecChildren[2].vecChildren[3].vecChildren[1].child.name, 'DOTAShowArmory();');

  // The edit info names the compiled file and its source, the compiler (layout compiler 16) and,
  // sorted, every compiled file the layout refers to.
  assert.deepEqual(red2.m_InputDependencies.map(input => [input.m_RelativeFilename, input.m_SearchPath, input.m_nFileCRC.value, input.m_bOptional, input.m_bFileExists]), [
    ['panorama/layout/gridstudio_laco_test.vxml', 'dota_addons/gridstudio', 0, true, false],
    ['panorama/layout/gridstudio_laco_test.xml', 'dota_addons/gridstudio', crc32(encode(LAYOUT)), false, true]]);
  assert.deepEqual(red2.m_SpecialDependencies.map(entry => [entry.m_String, entry.m_CompilerIdentifier, entry.m_nFingerprint.value]), [
    ['Panorama Layout Compiler Version', 'CompilePanorama', 16], ['Panorama Preprocessor Presence/Version', 'CompilePanorama', 0]]);
  assert.deepEqual(red2.m_WeakReferenceList.map(entry => [entry.value, entry.flag]), [
    ['panorama/images/x_png.vtex', 2], ['panorama/scripts/gridstudio_laco_test.vjs', 2], ['panorama/styles/gridstudio_laco_test.vcss', 2]]);
  assert.equal(red2.m_SubassetReferences, null);

  assert.throws(() => lacoLayout('panorama/layout/a.vxml_c', '<root><Label>Привет</Label></root>'), /текст внутри элемента/);
  assert.throws(() => lacoLayout('panorama/layout/a.vxml_c', '<root><Panel></root>'), /не закрывает/);
  assert.throws(() => lacoLayout('panorama/layout/a.vxml_c', '<Panel />'), /<root>/);
  assert.throws(() => lacoLayout('panorama/layout/a.xml', '<root />'), /Не разметка/);
});

test('binary KeyValues3 keeps every type and picks Valve\'s encodings', async () => {
  const [{ kv3Encode, kv3Decode, kv3, KV3Value }] = await modules;
  const value = {
    plain: ['a', '', 'a', true, false, null, -5, 2.5, { nested: [] }],
    numbers: [1, 2, 3],                              // packed in the auxiliary buffer
    objects: [{ x: 1 }, { x: 2 }],
    many: Array.from({ length: 300 }, (_, i) => i),  // over 255: the length takes 4 bytes
    typed: [kv3.uint32(0), kv3.uint32(1), kv3.uint32(4000000000), kv3.int64(0), kv3.int64(2n ** 60n), kv3.double(1), kv3.float(0.5), kv3.int16(-2), kv3.uint8(200)],
    references: [kv3.resourceName('panorama/a.vcss'), kv3.resourceName('panorama/b.vcss')],
    Ключ: 'Значение'
  };
  for (const compression of ['lz4', 'none']) {
    const bytes = kv3Encode(value, { compression });
    const back = kv3Decode(bytes);
    assert.deepEqual(back, value, compression);
    assert.deepEqual(kv3Encode(back, { compression }), bytes, 'decoding and encoding again gives the same bytes');
  }
  const bytes = kv3Encode(value), view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x4b563305, 'KV3 version 5');
  assert.equal(view.getUint32(0x14, true), 1, 'LZ4');
  assert.equal(view.getUint16(0x1a, true), 16384, 'LZ4 frame size');
  assert.equal(view.getUint32(0x6c, true), 4, 'objects: the root, { nested } and the two in objects');
  // Small blocks (under 256 bytes of buffers) stay uncompressed, as in Valve's files.
  const small = kv3Encode({ a: 'b' });
  assert.equal(new DataView(small.buffer).getUint32(0x14, true), 0);
  assert.deepEqual(kv3Decode(small), { a: 'b' });
  assert.ok(kv3Decode(kv3Encode({ v: kv3.uint32(7) })).v instanceof KV3Value);
  assert.throws(() => kv3Encode({ blob: new Uint8Array(1) }), /двоичные блоки/);
});

test('LZ4 is LZ4HC level 12, byte for byte', async () => {
  const [{ lz4Compress, lz4Decompress }] = await modules;
  // Expected blocks from liblz4 1.9.4 (LZ4_compress_HC, level 12): the level Valve's KeyValues3 use.
  const cell = encode(Array.from({ length: 24 }, (_, i) => `<Panel id="Cell${i % 7}" class="Row${i % 3}" />`).join(''));
  const runs = new Uint8Array([...encode('ab'.repeat(150) + 'xyz'), ...new Uint8Array(300), ...encode('abcd'.repeat(40) + 'end of input!')]);
  const hex = bytes => Buffer.from(bytes).toString('hex');
  assert.equal(hex(lz4Compress(cell)), 'fb123c50616e656c2069643d2243656c6c302220636c6173733d22526f773022202f3e2100183121002e31222100183221002e322221001f3363000d1f3463000d1f3563000d1f3663000d1f3063000d1f3163000d1f3263000d1f3363000d1f3463000d1f3563000d1f3663000d1f3063000d1f3163000d1f3263000d1f3363000d1f3463000d1f3563000d1e3663000fb5024a503222202f3e');
  assert.equal(hex(lz4Compress(runs)), '2f61620200ff184f78797a000100ff194f61626364040089d0656e64206f6620696e70757421');
  let seed = 7;
  const random = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32;
  for (const input of [new Uint8Array(0), encode('short'), Uint8Array.from({ length: 70000 }, () => random() * 6), Uint8Array.from({ length: 5000 }, () => random() * 256)]) {
    assert.deepEqual(lz4Decompress(lz4Compress(input), input.length), input);
  }
});

test('styles are minified with a source map as Valve\'s compiler does', async () => {
  const [{ newStyle, minifyStyle, readResource, kv3Decode }, { crc32 }] = await modules;
  const source = `/* GridStudio */
.A ,
 .B  {
	color : red;
	background-image: url( "s2r://panorama/images/x_png.vtex" );
	box-shadow: fill #000000&80 0px 0px 4px 0px;
}
@define bright: #ff00ff;
@keyframes 'Pulse'
{
	0% { opacity: 1.0; }
}
`;
  const { css, map } = minifyStyle(source);
  assert.equal(css, `.A,.B{color: red;background-image: url("s2r://panorama/images/x_png.vtex");box-shadow: fill #000000&80 0px 0px 4px 0px;}@define bright: #ff00ff;@keyframes 'Pulse'{0%{opacity: 1.0;}}`);
  // Each piece: [byte offset in css, source line, source column]; ; and } point back at their start.
  assert.deepEqual(map.slice(0, 6), [[0, 2, 1], [6, 4, 2], [12, 4, 9], [13, 4, 10], [16, 4, 2], [17, 5, 2]]);
  assert.deepEqual(map.find(([at]) => css[at] === '&'), [css.indexOf('&'), 6, 26]);

  const bytes = newStyle('panorama/styles/gridstudio_laco_test.vcss_c', source);
  const blocks = Object.fromEntries(readResource(bytes).blocks);
  assert.deepEqual(Object.keys(blocks), ['RED2', 'DATA', 'SrMa']);
  const body = blocks.DATA.subarray(6);
  assert.equal(new TextDecoder().decode(body), css);
  assert.equal(new DataView(blocks.DATA.buffer, blocks.DATA.byteOffset).getUint32(0, true), (crc32(encode(source)) ^ crc32(body)) >>> 0, 'source CRC xor text CRC');
  assert.deepEqual(kv3Decode(blocks.SrMa), { DBITSLC: map });
  const red2 = kv3Decode(blocks.RED2);
  assert.deepEqual(red2.m_WeakReferenceList.map(entry => entry.value), ['panorama/images/x_png.vtex']);
  assert.deepEqual(red2.m_SpecialDependencies.map(entry => [entry.m_String, entry.m_nFingerprint.value]), [['Panorama Preprocessor Presence/Version', 0], ['Panorama Style Compiler Version', 11]]);
  assert.deepEqual(kv3Decode(Object.fromEntries(readResource(newStyle('panorama/styles/e.vcss_c', '/* nothing */')).blocks).SrMa), { DBITSLC: null });
});

test('scripts keep their text as it is, resource version 4', async () => {
  const [{ newScript, readResource, kv3Decode }, { crc32 }] = await modules;
  const js = "$.Schedule(1, function () { $('#Label').text = 'Скрипт работает'; });\n";
  const bytes = newScript('panorama/scripts/gridstudio_laco_test.vjs_c', js);
  assert.equal(new DataView(bytes.buffer).getUint16(6, true), 4);
  const blocks = Object.fromEntries(readResource(bytes).blocks);
  assert.equal(new TextDecoder().decode(blocks.DATA), js);
  const red2 = kv3Decode(blocks.RED2);
  assert.deepEqual(red2.m_InputDependencies.map(input => [input.m_RelativeFilename, input.m_nFileCRC.value]), [
    ['panorama/scripts/gridstudio_laco_test.js', crc32(encode(js))], ['panorama/scripts/gridstudio_laco_test.vjs', 0]]);
  assert.deepEqual(red2.m_SpecialDependencies.map(entry => [entry.m_String, entry.m_CompilerIdentifier, entry.m_nFingerprint.value]), [
    ['JavaScript Compiler Version', 'CompileJavaScript', 4], ['Panorama Preprocessor Presence/Version', 'CompileJavaScript', 0]]);
});

test('compiled mods re-encode byte for byte', { skip: !process.env.PANORAMA_LACO_CORPUS && 'set PANORAMA_LACO_CORPUS to a folder of compiled pakNN_dir.vpk' }, async () => {
  const [laco, { readVPK }] = await modules;
  const vpks = [];
  const walk = dir => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const path = join(dir, entry.name); if (entry.isDirectory()) walk(path); else if (entry.name.endsWith('_dir.vpk')) vpks.push(path); } };
  walk(process.env.PANORAMA_LACO_CORPUS);
  let checked = 0;
  for (const vpk of vpks) for (const file of readVPK(new Uint8Array(readFileSync(vpk))).files) {
    if (!/\.(vxml_c|vcss_c|vjs_c)$/.test(file.path)) continue;
    const { blocks, version } = laco.readResource(file.data);
    if (!blocks.some(([name]) => name === 'RED2')) continue;
    // Every KeyValues3 block decodes and encodes back to its bytes, and so does the whole file.
    const again = laco.writeResource(version, blocks.map(([name, data]) => [name, name === 'DATA' ? data : laco.kv3Encode(laco.kv3Decode(data))]));
    assert.deepEqual(again, file.data, file.path);
    if (file.path.endsWith('.vxml_c')) {
      const { tree, red2, sourceCRC } = laco.lacoRead(file.data), compiled = red2.m_InputDependencies.find(input => input.m_bOptional);
      assert.deepEqual(laco.compiledLayout(`${compiled.m_RelativeFilename}_c`, tree, { searchPath: compiled.m_SearchPath, sourceCRC }), file.data, file.path);
      assert.deepEqual(laco.layoutTree(laco.layoutXML(tree, { positioned: true })), tree, file.path);
    }
    checked++;
  }
  assert.ok(checked > 0, 'no compiled Panorama files found');
});
