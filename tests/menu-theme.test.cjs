const test = require('node:test');
const assert = require('node:assert/strict');

const theme = import('../scripts/menu-theme.mjs');

test('the theme keeps Valve\'s picture references and answers each picture rule of the top bar with the same selectors', async () => {
  const t = await theme;
  const valve = `/* comment */
.HighResTopBar #TopBarBackground.TopBarHome
{
	background-image: url("s2r://panorama/images/topbar/topbar_home_png.vtex");
	background-color: #333333;
}

.LowVisualQuality #TopBarBackground,#TopBarBackground
{
	background-image: url("s2r://panorama/images/topbar/topbar_small_png.vtex");
}

#TopBarBackground:hover
{
	background-image: url("s2r://panorama/images/topbar/x_png.vtex");
}

#Other
{
	background-image: url("s2r://panorama/images/other_png.vtex");
}
`;
  const out = t.themeText('dashboard.css', valve, '#8b6cff');
  assert.match(out, /s2r:\/\/panorama\/images\/topbar\/topbar_home_png\.vtex"/, 'pictures stay `.vtex`: with «_c» Dota finds none');
  assert.doesNotMatch(out, /\.vtex_c/);
  assert.doesNotMatch(out, /#333333/, 'colours move to the accent');
  const own = out.slice(out.indexOf('GridStudio'));
  assert.match(own, /\.HighResTopBar #TopBarBackground\.TopBarHome\n\{\n\tbackground-image: none;\n\}/);
  assert.match(own, /\.LowVisualQuality #TopBarBackground,\n#TopBarBackground\n\{\n\tbackground-image: none;\n\}/);
  assert.doesNotMatch(own, /:hover\n\{\n\tbackground-image: none/, 'hover pictures are not the ground');
  assert.doesNotMatch(own, /#Other/);
  assert.match(t.themeText('play.css', '.PlayButton\n{\n\tbackground-image: url("s2r://x_png.vtex");\n}\n', '#8b6cff'), /\.PlayButton\n\{\n\tbackground-image: none;\n\tbackground-color: #/);
});

test('the theme in a pack: each recoloured stylesheet with the mark, none for a file Valve\'s would do, the HUD hook or a d2pfx mod\'s own', async () => {
  const t = await theme;
  const styles = {
    'dashboard.css': '/* Prettified by Source 2 Viewer - https://valveresourceformat.github.io */\n#TopBarBackground\n{\n\tbackground-image: url("s2r://panorama/images/topbar_png.vtex");\n\tbackground-color: #333333;\n}\n',
    'play.css': '.PlayButton\n{\n\tbackground-color: #2a2a2a;\n}\n',
    'popups/popup_x.css': '.Box\n{\n\tcolor: #ffffff;\n\tbackground-color: #1e3a5f;\n}\n',
    'plain.css': '.Box\n{\n\twidth: 10px;\n}\n',
    'custom_ui.css': '.Hud\n{\n\tcolor: #1e3a5f;\n}\n',
    'hud/dota_hud_x.css': '.Hud\n{\n\tcolor: #1e3a5f;\n}\n'
  };
  assert.throws(() => t.themeFiles(styles, 'violet', { version: 'abcdef1' }), /#rrggbb/);
  assert.throws(() => t.themeFiles(styles, '#8b6cff', {}), /версии/);
  const out = t.themeFiles(styles, '#8B6CFF', { version: 'abcdef1', drop: ['panorama/styles/play.vcss_c'] });
  assert.deepEqual(Object.keys(out).sort(), ['panorama/styles/dashboard.vcss_c', 'panorama/styles/popups/popup_x.vcss_c']);
  for (const [path, text] of Object.entries(out)) {
    assert.match(text, t.THEME_MARK);
    assert.equal(t.THEME_MARK.exec(text)[1], '#8b6cff');
    assert.equal(t.themeStyleRel(path), path.replace('panorama/styles/', '').replace('.vcss_c', '.css'));
    assert.doesNotMatch(text, /Source 2 Viewer|https:/, 'Valve\'s first comment line (an outside address) goes');
  }
  assert.equal(t.themeStyleRel('panorama/styles/custom_ui.vcss_c'), null, 'the HUD hook is the match pack\'s');
  assert.equal(t.themeStyleRel('panorama/styles/hud/dota_hud_x.vcss_c'), null);
  assert.equal(t.themeStyleRel('panorama/layout/play.vxml_c'), null);
  // A d2pfx top bar keeps its ground: no flat bar, no simple logo; the tabs' colours stay.
  const bar = t.themeFiles(styles, '#8b6cff', { version: 'abcdef1', topbar: false })['panorama/styles/dashboard.vcss_c'];
  assert.match(bar, /^\/\* GridStudio theme #8b6cff abcdef1 no-topbar \*\/\n/);
  const own = bar.slice(bar.indexOf('the theme\'s own rules'));
  assert.doesNotMatch(own, /background-image: none|#SimpleDotaLogo|#HomeButtonMap/);
  assert.match(own, /\.TopBarMenuItem:selected/);
  const flat = t.themeFiles(styles, '#8b6cff', { version: 'abcdef1' })['panorama/styles/dashboard.vcss_c'];
  assert.match(flat.slice(flat.indexOf('the theme\'s own rules')), /#TopBarBackground\n\{\n\tbackground-image: none;\n\}[\s\S]*#SimpleDotaLogo/);
});
