const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');

// The HUD preview's Panorama renderer (src/customize/panorama, 2026-10-16): Valve's layouts and styles
// read and translated for the browser.
const modules = Promise.all(['xml', 'css', 'scene', 'textures', 'hud'].map((name) => import(`../src/customize/panorama/${name}.mjs`)));
const decl = (css, property, value, ctx) => Object.fromEntries(css.translateDecl(property, value, ctx).map(([name, out], i, all) => [all.findIndex(([n]) => n === name) === i ? name : `${name}#${i}`, out]));

test('layouts: elements, attributes, entities, includes and snippets', async () => {
  const [xml] = await modules;
  const layout = xml.readLayout(`<!-- xml reconstructed by Source 2 Viewer -->
<root>
  <styles><include src="s2r://panorama/styles/dotastyles.vcss" /><include src="s2r://panorama/styles/hud/dota_hud_xp.vcss" /></styles>
  <scripts><include src="s2r://panorama/scripts/x.vjs" /></scripts>
  <snippets><snippet name="Line"><Panel class="A B" /></snippet></snippets>
  <DOTAXP hittest="false">
    <Label id="LevelLabel" text="{d:level}" />
    <Button onmouseover="UIShowTextTooltip( &apos;#DOTA_ReadyCheck&apos; )"><Label text="a &amp; b" /></Button>
  </DOTAXP>
</root>`);
  assert.deepEqual(layout.styles, ['panorama/styles/dotastyles.css', 'panorama/styles/hud/dota_hud_xp.css']);
  assert.equal(layout.panel.type, 'DOTAXP');
  assert.equal(layout.panel.children[0].attrs.id, 'LevelLabel');
  assert.equal(layout.panel.children[1].attrs.onmouseover, "UIShowTextTooltip( '#DOTA_ReadyCheck' )");
  assert.equal(layout.panel.children[1].children[0].attrs.text, 'a & b');
  assert.equal(layout.snippets.Line.attrs.class, 'A B');
  assert.equal(xml.sourcePath('file://{resources}/layout/hud/hud_reborn.xml'), 'panorama/layout/hud/hud_reborn.xml');
});

test('stylesheets: @define constants (shared between files), comments, @import, @keyframes', async () => {
  const [, css] = await modules;
  const defines = new Map();
  css.parseStyles('@define baseText: #A5ADA2ff;\n@define dotaPlusBrown: #433620;\n@define bg: gradient( linear, 0% 0%, 0% 100%, from( dotaPlusBrown ), to( #000 ) );', defines);
  const sheet = css.parseStyles(`/* Prettified */
@import url("s2r://panorama/styles/split_label.vcss");
@keyframes 'Pulse' { 0% { opacity: 0; } 100% { opacity: 1; } }
#A, .B:hover { color: baseText; background-color: bg; }
Label { background-image: url("s2r://panorama/images/hud/baseText_psd.vtex"); }`, defines);
  assert.deepEqual(sheet.imports, ['s2r://panorama/styles/split_label.vcss']);
  assert.equal(sheet.rules.length, 2, 'keyframes are skipped');
  assert.deepEqual(sheet.rules[0], { selector: '#A, .B:hover', decls: [['color', '#A5ADA2ff'], ['background-color', 'gradient( linear, 0% 0%, 0% 100%, from( #433620 ), to( #000 ) )']] });
  assert.match(sheet.rules[1].decls[0][1], /baseText_psd/, 'names inside url() stay');
});

test('gradient() becomes linear-/radial-gradient, stops placed on the gradient line', async () => {
  const [, css] = await modules;
  assert.equal(css.gradient('gradient( linear, 0% 0%, 0% 100%, from( #222 ), color-stop( 0.4, #555 ), to( #111 ) )'), 'linear-gradient(to bottom, #222 0%, #555 40%, #111 100%)');
  assert.equal(css.gradient('gradient(linear, 0% 10%, 0% 70%, from(#fff), to(#000))'), 'linear-gradient(to bottom, #fff 10%, #000 70%)');
  assert.equal(css.gradient('gradient(linear, 100% 0%, 0% 0%, from(#fff), to(#000))'), 'linear-gradient(to left, #fff 0%, #000 100%)');
  assert.equal(css.gradient('gradient(linear, 0% 0%, 100% 100%, from(#fff), to(#000))'), 'linear-gradient(135deg, #fff 0%, #000 100%)');
  assert.equal(css.gradient('gradient(radial, 50% 45%, 0% 0%, 58% 58%, from(#a5ff8422), color-stop(0.5, #afff8417), to(#ffffff00))'), 'radial-gradient(58% 58% at 50% 45%, #a5ff8422 0%, #afff8417 50%, #ffffff00 100%)');
  assert.equal(css.gradient('#fff'), null);
});

test('selectors: panel types are our elements, states are classes, a child layout is scoped', async () => {
  const [, css] = await modules;
  assert.equal(css.translateSelector('DOTAHud #HUDElements DOTAChat#HudChat .ChatLine'), 'pa-dotahud #HUDElements pa-dotachat#HudChat .ChatLine');
  assert.equal(css.translateSelector('#Teammates > Panel:not(.LocalPlayer) #MainButton:hover'), '#Teammates > pa-panel:not(.LocalPlayer) #MainButton.ps-hover');
  assert.equal(css.translateSelector('Button:enabled:selected Label'), 'pa-button:not(.ps-disabled).ps-selected pa-label');
  assert.equal(css.translateSelector('.Reborn .a>.b', ':where(x)'), '.Reborn .a > .b:where(x)');
  assert.equal(css.translateSelector('.AspectRatio16x9 #Foo'), '.AspectRatio16x9 #Foo');
});

test('layout properties become the scene\'s custom properties', async () => {
  const [, css] = await modules;
  assert.deepEqual(decl(css, 'flow-children', 'right'), { '--p-flow': 'right' });
  assert.deepEqual(decl(css, 'align', 'right bottom'), { '--p-ha': 'end', '--p-va': 'end' });
  assert.deepEqual(decl(css, 'vertical-align', 'middle'), { '--p-va': 'center' });
  assert.deepEqual(decl(css, 'visibility', 'collapse'), { '--p-vis': 'none' });
  assert.deepEqual(decl(css, 'visibility', 'visible'), { '--p-vis': 'initial' });
  const fill = decl(css, 'width', 'fill-parent-flow( 1.0 )');
  assert.equal(fill.width, '100%'); assert.equal(fill['--p-fgw'], '1'); assert.equal(fill['--p-fbw'], '0px');
  assert.equal(decl(css, 'height', 'fit-children').height, 'auto');
  // 100% is the parent less the margins (#AbilityImage: 100% with a 9px margin).
  assert.deepEqual(css.translateDecl('width', '100%').filter(([name]) => name === 'width').map(([, value]) => value), ['100%', '-webkit-fill-available', '-moz-available', 'stretch']);
  assert.equal(decl(css, 'height', 'width-percentage(100%)')['--p-arh'], '1');
  assert.equal(decl(css, 'width', 'height-percentage(50%)')['--p-arw'], '0.5');
  assert.deepEqual(decl(css, 'ui-scale', '85%'), { zoom: '0.85' });
  assert.deepEqual(decl(css, 'y', '-220px'), { top: '-220px' });
  assert.deepEqual(decl(css, 'overflow', 'squish scroll'), { 'overflow-x': 'visible', 'overflow-y': 'clip', '--p-ov': 'squish scroll' });
  assert.deepEqual(decl(css, 'transition-property', 'opacity'), {});
});

test('visual properties: backgrounds, textures, filters, shadows, text', async () => {
  const [, css] = await modules;
  const asset = (path) => (path === 'panorama/images/hud/reborn/bg_minimap_psd' ? '/a/bg.webp' : path === 'panorama/images/control_icons/24px/x.svg' ? '/a/x.svg' : null);
  assert.deepEqual(decl(css, 'background-image', 'url("s2r://panorama/images/hud/reborn/bg_minimap_psd.vtex")', { asset }), { '--p-bgi': 'url("/a/bg.webp")' });
  assert.deepEqual(decl(css, 'background-image', 'url("s2r://panorama/images/control_icons/24px/x.vsvg")', { asset }), { '--p-bgi': 'url("/a/x.svg")' });
  assert.deepEqual(decl(css, 'background-image', 'url("s2r://panorama/images/missing_png.vtex")', { asset }), { '--p-bgi': 'none' }, 'a texture we do not ship draws nothing');
  assert.deepEqual(decl(css, 'background-color', '#1620346c'), { 'background-color': '#1620346c', '--p-bgc': 'initial' });
  assert.deepEqual(decl(css, 'background-color', 'gradient(linear, 0% 0%, 0% 100%, from(#000), to(#fff))'), { 'background-color': 'transparent', '--p-bgc': 'linear-gradient(to bottom, #000 0%, #fff 100%)' });
  assert.deepEqual(decl(css, 'wash-color', '#7c5cff73', { wash: (colour) => `url(#w-${colour.slice(1)})` }), { '--p-wash': 'url(#w-7c5cff73)' });
  assert.deepEqual(decl(css, 'saturation', '0'), { '--p-sat': 'saturate(0)' });
  assert.deepEqual(decl(css, 'blur', 'gaussian (5)'), { '--p-blur': 'blur(2.5px)' });
  assert.deepEqual(decl(css, 'box-shadow', 'fill #000000ba 16px 0px 11px'), { 'box-shadow': '#000000ba 16px 0px 11px' });
  assert.deepEqual(decl(css, 'text-shadow', '0px 0px 6px 2.0 #000000'), { 'text-shadow': '0px 0px 6px #000000, 0px 0px 6px #000000' });
  assert.deepEqual(decl(css, 'font-size', '18px'), { 'font-size': '17px' }, 'Panorama draws text 1 px smaller');
  assert.deepEqual(decl(css, 'font-weight', 'semi-bold'), { 'font-weight': '600' });
  assert.equal(decl(css, 'font-family', 'titleFont')['font-family'], css.TITLE_FONT);
  assert.equal(decl(css, 'font-family', 'monospaceNumbersFont')['font-family'], css.NUMBERS_FONT);
  assert.equal(decl(css, 'font-family', 'defaultFont')['font-family'], css.FONT);
  // A shadow's strength under 1 fades it (the level's faint orange glow).
  assert.deepEqual(decl(css, 'text-shadow', '0px 0px 3px 3.7 #ec780e24'), { 'text-shadow': '0px 0px 3px #ec780e85, 0px 0px 3px #ec780e85' });
  // Valve's fonts load under the scene's own names; RadianceM's digits take Radiance one weight up.
  const faces = css.fontFaces({ 'radiance-regular': '/r.otf', 'reaver-bold': '/v.otf' });
  assert.match(faces, /font-family: 'PanoramaRadiance'; src: url\("\/r\.otf"\) format\('opentype'\); font-weight: 400;/);
  assert.match(faces, /font-family: 'PanoramaRadianceM'; src: url\("\/r\.otf"\) format\('opentype'\); font-weight: 300;/);
  assert.match(faces, /font-family: 'PanoramaReaver'; src: url\("\/v\.otf"\) format\('opentype'\); font-weight: 700;/);
  // An opacity mask's strength lets the rest show through.
  assert.equal(decl(css, 'opacity-mask', 'url("s2r://panorama/images/hud/reborn/bg_minimap_psd.vtex") 0.6', { asset })['mask-image'], 'url("/a/bg.webp"), linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4))');
  assert.deepEqual(decl(css, 'opacity-mask', 'url("s2r://panorama/images/hud/reborn/bg_minimap_psd.vtex") 1', { asset }), { 'mask-image': 'url("/a/bg.webp")', 'mask-size': '100% 100%', 'mask-repeat': 'no-repeat' });
  assert.equal(decl(css, 'clip', 'radial(50% 50%, 0deg, 360deg)')['clip-path'], 'none');
  assert.match(decl(css, 'clip', 'radial(50% 50%, 0deg, 90deg)')['clip-path'], /^polygon\(50% 50%, 50% -100%, .*200% 50%\)$/);
});

test('our hud-style rules translate under the scene root, wash-color as a colour matrix', async () => {
  const [, css, scene] = await modules;
  const { hudRules, HUD_PRESETS } = await import('../scripts/hud-style.mjs');
  const washes = [];
  const out = css.translateStyles(css.parseStyles(hudRules({ ...HUD_PRESETS.violet, lower: 80, hide: ['flares'], chat: { align: 'left', y: 300 } })), { prefix: '.pano ', wash: (colour) => { washes.push(colour); return 'url(#w0)'; } });
  assert.match(out, /\.pano pa-dotahud #HUDElements #center_bg,[\s\S]*\{ --p-wash: url\(#w0\); \}/);
  assert.match(out, /\.pano pa-dotahud #HUDElements #lower_hud,\n\.pano pa-dotahud #HUDElements #minimap_container \{ zoom: 0\.8; \}/);
  assert.match(out, /#left_flare,[\s\S]*\{ --p-vis: none; \}/);
  assert.match(out, /pa-dotachat#HudChat \{ --p-ha: start; margin-left: 24px; top: -300px; width: 800px;/);
  assert.deepEqual(washes, ['#8a5cff73']);
  // Multiplied by the colour as strongly as its alpha says; white changes nothing.
  assert.equal(scene.washMatrix('#ffffff'), '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0');
  assert.equal(scene.washMatrix('#00000080').split(/\s+/)[0], '0.498');
  assert.equal(scene.washMatrix('nonsense'), null);
});

test('textures resolve from several roots, the first one wins', async () => {
  const [, , , textures] = await modules;
  const asset = textures.textureResolver(
    [{ '../../assets/dota-hud/panorama/images/hud/a_psd.webp': '/hud/a.webp', '../../assets/dota-hud/panorama/images/control_icons/x.svg': '/hud/x.svg' }, 'assets/dota-hud/'],
    [{ '../../assets/dota-menu-ui/panorama/images/hud/a_psd.webp': '/menu/a.webp', '../../assets/dota-menu-ui/panorama/images/bg.jpeg': '/menu/bg.jpeg' }, 'assets/dota-menu-ui/']);
  assert.equal(asset('panorama/images/hud/a_psd'), '/hud/a.webp');
  assert.equal(asset('panorama/images/control_icons/x.svg'), '/hud/x.svg');
  assert.equal(asset('panorama/images/bg'), '/menu/bg.jpeg');
  assert.equal(asset('panorama/images/none'), null);
});

test('the pictures cut from the game\'s screen ship with the site', () => {
  for (const name of ['portrait', 'minimap', 'topbar-hero', 'innate', 'over-inventory']) assert.ok(existsSync(`assets/dota-hud/preview/${name}.webp`), name);
});

test('every layout and stylesheet the HUD preview loads ships with the site', async () => {
  const [xml, css, , , hud] = await modules;
  const have = (path) => path === 'panorama/styles/custom_ui.css' ? existsSync('assets/dota-menu/custom_ui.css') : existsSync(`assets/dota-hud/${path}`);
  for (const layout of [hud.HUD_ROOT, ...Object.values(hud.HUD_LAYOUTS)]) {
    assert.ok(have(layout), layout);
    for (const style of xml.readLayout(readFileSync(`assets/dota-hud/${layout}`, 'utf8')).styles) assert.ok(have(style), `${layout} → ${style}`);
  }
  // Every stylesheet parses into rules.
  for (const style of ['panorama/styles/dotastyles.css', 'panorama/styles/hud/hud_reborn.css', 'panorama/styles/chat.css']) {
    assert.ok(css.parseStyles(readFileSync(`assets/dota-hud/${style}`, 'utf8')).rules.length > 100, style);
  }
});
