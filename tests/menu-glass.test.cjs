const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { createHash } = require('node:crypto');

// The see-through top bar and friends rail (2026-10-22, «Кнопки меню» → «Фон панелей»; MENU_GLASS in
// scripts/menu-background.mjs).
const modules = Promise.all([import('../scripts/vpk.mjs'), import('../scripts/menu-background.mjs')]);
const md5 = (data) => new Uint8Array(createHash('md5').update(data).digest());
const read = (file) => readFileSync(`assets/dota-menu/${file}`, 'utf8');
const dashboard = read('dashboard.xml'), friends = read('friend_menu.xml'), home = read('dashboard_page_home.xml'), miniProfile = read('mini_showcase.xml');
const ALL = { bar: 100, friends: 100, news: 100, header: 100, showcase: 100, party: 100 };
const unpack = (vpk) => Object.fromEntries(vpk.files.map((file) => [file.path, file]));

test('at 100 % nothing changes; below it, only the panels’ grounds', async () => {
  const [{ readVPK, panoramaSource }, m] = await modules;
  assert.deepEqual(m.MENU_GLASS, ALL);
  assert.equal(m.menuBackgroundPack({ video: null, dashboard, home, news: { carnival: true, season: true }, friends, miniProfile, glass: m.MENU_GLASS, md5 }), null, 'as in Dota: no pack');
  assert.equal(m.menuBackgroundPack({ video: null, dashboard, friends, glass: { bar: '', friends: null }, md5 }), null, 'not a number reads as 100');

  const files = unpack(readVPK(m.menuBackgroundPack({ video: null, dashboard, friends, glass: { bar: 40, friends: 40 }, md5 })));
  assert.deepEqual(Object.keys(files).sort(), ['panorama/layout/dashboard.vxml_c', m.FRIENDS_PAGE, m.FRIENDS_STYLE, m.GLASS_STYLE].sort());
  const text = (path) => panoramaSource(files[path].data);
  // The top bar: our style last in the dashboard, the rest Valve's; opacity on the ground only.
  const board = text('panorama/layout/dashboard.vxml_c');
  assert.match(board, /dashboard_search_results\.vcss_c" \/>\n\t\t<include src="s2r:\/\/panorama\/styles\/gridstudio_menu_glass\.vcss_c" \/>\n\t<\/styles>/);
  assert.equal(board.replace('\n\t\t<include src="s2r://panorama/styles/gridstudio_menu_glass.vcss_c" />', ''), dashboard);
  assert.equal(text(m.GLASS_STYLE), `/* GridStudio: the top bar's ground at 40 percent, so the menu background shows through. */
#TopBarBackground,
#TopBarContent .TopPixelFix
{
	opacity: 0.40;
}
`);
  // The friends rail: our style after Valve's two in friend_menu.xml, the colours with alpha × 0.4.
  const page = text(m.FRIENDS_PAGE);
  assert.match(page, /friend_menu_home\.vcss_c" \/>\n\t\t<include src="s2r:\/\/panorama\/styles\/gridstudio_friends_glass\.vcss_c" \/>\n\t<\/styles>/);
  assert.equal(page.replace('\n\t\t<include src="s2r://panorama/styles/gridstudio_friends_glass.vcss_c" />', ''), friends, 'the rest is Valve’s');
  const rail = text(m.FRIENDS_STYLE);
  for (const [selector, colour] of [['.LeftRailContain', '00000066'], ['.OnHomePage .LeftRailContain', '0000005f'], ['.Season_MonsterHunter .LeftRailContain', '0b0c1264'],
    ['.Season_Dark_Carnival .LeftRailContain', '09070664'], ['#FriendsPanelHeader', '00000066']])
    assert.ok(rail.includes(`\n${selector}\n{\n\tbackground-color: #${colour};`), selector);
  assert.ok(rail.includes('\tbox-shadow: fill #00000014 0px 0px 24px 0px;\n'), 'the filled shadow too');
  // Content stays: no opacity, no visibility, nothing animated, only grounds.
  assert.doesNotMatch(rail, /opacity|visibility|transition|animation|@keyframes|wash-color/);
  assert.doesNotMatch(text(m.GLASS_STYLE).replace(/\/\*.*?\*\//g, ''), /transition|animation|@keyframes|visibility|background-/);
  for (const path of [m.GLASS_STYLE, m.FRIENDS_STYLE, m.FRIENDS_PAGE]) assert.ok(m.MENU_PACK_PATHS.includes(path), path);
});

test('each panel on its own; with hidden buttons and a menu video', async () => {
  const [{ readVPK, panoramaSource }, m] = await modules;
  const paths = (options) => Object.keys(unpack(readVPK(m.menuBackgroundPack({ dashboard, friends, md5, video: null, ...options }))));
  assert.deepEqual(paths({ glass: { bar: 0 } }).sort(), ['panorama/layout/dashboard.vxml_c', m.GLASS_STYLE].sort());
  assert.deepEqual(paths({ glass: { friends: 99 } }).sort(), [m.FRIENDS_PAGE, m.FRIENDS_STYLE].sort(), 'the rail alone does not touch the dashboard');
  const zero = unpack(readVPK(m.menuBackgroundPack({ video: null, dashboard, friends, glass: { bar: 0, friends: 0 }, md5 })));
  assert.match(panoramaSource(zero[m.GLASS_STYLE].data), /opacity: 0\.00;/);
  assert.equal((panoramaSource(zero[m.FRIENDS_STYLE].data).match(/background-color: #[0-9a-f]{6}00;/g) || []).length, m.RAIL_GROUNDS.length);
  // Hidden buttons and the see-through bar share the dashboard: both styles, hidden ones first.
  const both = unpack(readVPK(m.menuBackgroundPack({ video: new Uint8Array([1]), dashboard, friends, hide: ['plus'], glass: { bar: 55 }, md5 })));
  const board = panoramaSource(both['panorama/layout/dashboard.vxml_c'].data);
  assert.match(board, /gridstudio_menu_hide\.vcss_c" \/>\n\t\t<include src="s2r:\/\/panorama\/styles\/gridstudio_menu_glass\.vcss_c" \/>\n\t<\/styles>/);
  assert.match(board, /override-background="s2r:\/\/panorama\/layout\/gridstudio_background\.vxml_c"/);
  assert.match(panoramaSource(both[m.GLASS_STYLE].data), /opacity: 0\.55;/);
  // Percents are whole and inside 0…100.
  assert.deepEqual(m.menuGlass({ bar: 140, friends: -3 }), { ...ALL, bar: 100, friends: 0 });
  assert.deepEqual(m.menuGlass({ bar: 40.4, friends: '35', party: 7.6, unknown: 3 }), { ...ALL, bar: 40, friends: 35, party: 8 });
  assert.deepEqual(m.menuGlass(null), m.MENU_GLASS);
  assert.throws(() => m.menuBackgroundPack({ video: null, dashboard, glass: { friends: 50 }, md5 }), /friend_menu\.xml/);
  assert.throws(() => m.friendsPage('<root/>'), /панель друзей/);
  assert.throws(() => m.styleDashboard(dashboard.replace('id="TopBarBackground"', 'id="Other"'), [m.GLASS_STYLE]), /подложки верхней панели/);
});

test('every selector names a panel of Valve’s current layouts', async () => {
  const [, m] = await modules;
  const { bar, friends: rail } = m.menuGlassText({ bar: 40, friends: 40 });
  const selectors = (css) => [...css.matchAll(/(?:^|\n)([^{}\n/][^{}]*?)\s*\{/g)].flatMap((match) => match[1].split(',').map((s) => s.trim()));
  // The panel each rule styles is its last compound; the ones before are Dota's state classes on the
  // dashboard (OnHomePage, Season_*), which the client sets and no layout names.
  const has = (layout, compound) => compound.split(/(?=[#.])/).every((part) => part.startsWith('#')
    ? layout.includes(`id="${part.slice(1)}"`) : new RegExp(`class="(?:[^"]* )?${part.slice(1)}(?: [^"]*)?"`).test(layout));
  for (const [css, layout, name] of [[bar, dashboard, 'dashboard.xml'], [rail, friends, 'friend_menu.xml']]) {
    const list = selectors(css);
    assert.ok(list.length >= 2, name);
    for (const selector of list) {
      const compounds = selector.split(/\s+/), last = compounds.at(-1);
      assert.ok(has(layout, last), `${selector}: ${last} in ${name}`);
      for (const state of compounds.slice(0, -1)) {
        if (state.startsWith('#')) assert.ok(has(layout, state), `${selector}: ${state} in ${name}`);
        else assert.match(state, /^\.(OnHomePage|Season_MonsterHunter|Season_Dark_Carnival)$/, selector);
      }
    }
  }
  // The bar's ground holds no content: only its plates and hover glows are inside #TopBarBackground.
  const ground = dashboard.match(/<Panel id="TopBarBackground" hittest="false">([\s\S]*?)\n\t*<\/Panel>/)[1];
  assert.deepEqual([...ground.matchAll(/<(\w+) /g)].map((match) => match[1]), Array(7).fill('Panel'));
  assert.doesNotMatch(ground, /Label|Button|Image|DOTA/);
  assert.match(dashboard, /<Panel class="TopPixelFix" \/>/);
  // Our copy of friend_menu.xml is Valve's, watched like the others (scripts/check-dota-menu.mjs).
  assert.ok(readFileSync('scripts/check-dota-menu.mjs', 'utf8').includes("'friend_menu.xml'"));
});

test('studio recipes keep the panels only when they differ from Dota', async () => {
  const { studioRecipe } = await import('../scripts/studio-background.mjs');
  const recipe = { aspect: '16:9', fit: 'cover', folder: 'russian', delivery: 'file', clean: false, crossfade: 0, blur: 0, dim: 0, source: { kind: 'workshop', id: 3, title: 'x' } };
  assert.deepEqual(studioRecipe({ ...recipe, glass: { bar: 40 } }).glass, { ...ALL, bar: 40 });
  assert.deepEqual(studioRecipe({ ...recipe, glass: { news: 0, showcase: 55 } }).glass, { ...ALL, news: 0, showcase: 55 });
  assert.throws(() => studioRecipe({ ...recipe, glass: { party: 101 } }));
  assert.throws(() => studioRecipe({ ...recipe, glass: { header: '40' } }));
  assert.equal(studioRecipe({ ...recipe, glass: { bar: 100, friends: 100 } }).glass, undefined);
  assert.equal(studioRecipe(recipe).glass, undefined, 'recipes before it stay as they were');
  assert.throws(() => studioRecipe({ ...recipe, glass: { bar: 140 } }));
  assert.throws(() => studioRecipe({ ...recipe, glass: { friends: 4.5 } }));
});

test('colour to alpha: the ground comes off, ground + the rest give the picture back', async () => {
  const { colorToAlpha } = await import('../scripts/color-to-alpha.mjs');
  const ground = [20, 22, 30];
  const over = (rgb, a) => rgb.map((c, i) => Math.round(c * a + ground[i] * (1 - a)));
  const pixels = new Uint8ClampedArray([...over([255, 255, 255], 0.5), 255, ...ground, 255, ...over([200, 120, 40], 1), 255, 21, 22, 30, 255, 0, 0, 0, 255, 9, 9, 9, 0]);
  const before = pixels.slice();
  colorToAlpha(pixels, () => ground, 2);
  for (let i = 0; i < pixels.length; i += 4) {
    if (!before[i + 3]) { assert.equal(pixels[i + 3], 0); continue; }
    const a = pixels[i + 3] / 255;
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(pixels[i + c] * a + ground[c] * (1 - a) - before[i + c]) <= 1.5, `pixel ${i / 4} channel ${c}`);
  }
  assert.equal(pixels[7], 0, 'the ground itself is gone');
  assert.equal(pixels[15], 0, 'within the noise is ground');
  assert.equal(pixels[19], 255, 'black is opaque on a lighter ground');
  assert.ok(pixels[11] > 150, 'a colour far from the ground keeps most of its alpha');
  assert.ok(pixels[3] > 120 && pixels[3] < 135 && pixels[0] === 255, 'half white');
  // Darker than the ground: its own noise.
  const dark = new Uint8ClampedArray([14, 16, 24, 255]);
  assert.equal(colorToAlpha(dark.slice(), () => ground, 2, 6)[3], 0);
  assert.ok(colorToAlpha(dark.slice(), () => ground, 2, 2)[3] > 0);
});

test('the preview’s pictures: the bar split into ground and the rest, the rail without its ground', async () => {
  for (const file of ['bar-ground.webp', 'bar-glass.webp', 'rail.webp']) assert.ok(existsSync(`assets/dota-menu/ui/${file}`), file);
  const menu = readFileSync('src/customize/DotaMenu.jsx', 'utf8');
  assert.match(menu, /bar-ground\.webp/);
  assert.match(menu, /bar-glass\.webp/);
  assert.doesNotMatch(menu, /ui\/bar\.webp/, 'the whole bar is not drawn any more');
  // The WebP's alpha (VP8X flag 0x10): the rail and the rest of the bar are see-through pictures now.
  for (const file of ['bar-glass.webp', 'rail.webp']) {
    const head = readFileSync(`assets/dota-menu/ui/${file}`);
    assert.equal(head.toString('ascii', 12, 16), 'VP8X', file);
    assert.ok(head[20] & 0x10, `${file} has alpha`);
  }
});

// The second round (2026-10-22): the news column, the mini-profile's header and picture, the party bar.
test('the news column, the mini-profile and the party bar: exact rules, each in its layout’s scope', async () => {
  const [{ readVPK, panoramaSource }, m] = await modules;
  const pack = (glass, options = {}) => unpack(readVPK(m.menuBackgroundPack({ video: null, dashboard, home, news: { carnival: true, season: true }, friends, miniProfile, glass, md5, ...options })));
  const text = (files, path) => panoramaSource(files[path].data);
  const files = pack({ news: 40, header: 40, showcase: 40, party: 40 });
  assert.deepEqual(Object.keys(files).sort(), ['panorama/layout/dashboard.vxml_c', 'panorama/layout/dashboard_page_home.vxml_c', m.HOME_STYLE, m.GLASS_STYLE, m.MINI_PROFILE_PAGE, m.MINI_PROFILE_STYLE].sort());
  // The news column: our style last in the home page, the rest Valve's; the whole column fades.
  const page = text(files, 'panorama/layout/dashboard_page_home.vxml_c');
  assert.equal(page.replace('\n\t\t<include src="s2r://panorama/styles/gridstudio_home.vcss_c" />', ''), home, 'the rest is Valve’s');
  assert.match(page, /frontpage_shared\.vcss_c" \/>\n\t\t<include src="s2r:\/\/panorama\/styles\/gridstudio_home\.vcss_c" \/>\n\t<\/styles>/);
  assert.equal(text(files, m.HOME_STYLE), `/* GridStudio: the news column at 40 percent, so the menu background shows through. */
#RightColumn
{
	width: 388px;
	opacity: 0.40;
	opacity-brush: gradient( linear, 0% 0%, 100% 0%, from( white ), color-stop( 0.8506, white ), color-stop( 0.8531, #ffffff00 ), to( #ffffff00 ) );
}

/* The cards' shadows stay out of the gap between them (and, on the right, of the column's free edge). */
#FrontpageContents
{
	height: 734px;
	opacity-brush: gradient( linear, 0% 0%, 0% 100%, from( white ), color-stop( 0.6595, white ), color-stop( 0.6608, #ffffff00 ), color-stop( 0.6798, #ffffff00 ), color-stop( 0.6811, white ), to( white ) );
}

#FrontpageContents .FrontpageCell
{
	box-shadow: 0px 6px 48px -4px rgba( 0, 0, 0, 0 );
}
`);
  // The party bar, with the top bar's style in the dashboard: the picture's alpha and the border's, both of Valve's borders.
  assert.equal(text(files, m.GLASS_STYLE), `/* GridStudio: the party bar's ground at 40 percent, so the menu background shows through. */
#FriendlistBottom
{
	background-img-opacity: 0.40;
	border: 1px solid #3D414420;
}

.OnHomePage #FriendlistBottom
{
	border: 1px solid #3D41443a;
}
`);
  const board = text(files, 'panorama/layout/dashboard.vxml_c');
  assert.equal(board.replace('\n\t\t<include src="s2r://panorama/styles/gridstudio_menu_glass.vcss_c" />', ''), dashboard);
  // The mini-profile: Valve's layout with our style after theirs; the header's ground thins, the picture fades whole.
  const mini = text(files, m.MINI_PROFILE_PAGE);
  assert.match(mini, /mini_showcase\.vcss_c" \/>\n\t\t<include src="s2r:\/\/panorama\/styles\/gridstudio_mini_profile_glass\.vcss_c" \/>\n\t<\/styles>/);
  assert.equal(mini.replace('\n\t\t<include src="s2r://panorama/styles/gridstudio_mini_profile_glass.vcss_c" />', ''), miniProfile, 'the rest is Valve’s, handlers and all');
  assert.equal(text(files, m.MINI_PROFILE_STYLE), `/* GridStudio: the mini-profile's header row, its ground at 40 percent (the avatar, the name and the medal stay). */
.LeftRailContain .Header
{
	background-color: #00000066;
	background-img-opacity: 0.40;
	border-bottom: 1px solid #00000066;
}

/* GridStudio: the mini-profile's picture at 40 percent, whole, so the menu background shows through. */
.LeftRailContain .ShowcaseData
{
	opacity: 0.40;
}
`);
  // Nothing animated anywhere, and no rule for a panel at 100.
  for (const path of [m.HOME_STYLE, m.GLASS_STYLE, m.MINI_PROFILE_STYLE]) assert.doesNotMatch(text(files, path), /transition|animation|@keyframes|visibility|wash-color/, path);
  const header = pack({ header: 0 });
  assert.deepEqual(Object.keys(header).sort(), [m.MINI_PROFILE_PAGE, m.MINI_PROFILE_STYLE].sort(), 'one slider, one layout');
  assert.doesNotMatch(text(header, m.MINI_PROFILE_STYLE), /ShowcaseData/);
  assert.match(text(header, m.MINI_PROFILE_STYLE), /background-color: #00000000;\n\tbackground-img-opacity: 0\.00;/);
  assert.doesNotMatch(text(pack({ showcase: 10 }), m.MINI_PROFILE_STYLE), /\.Header/);
  assert.deepEqual(Object.keys(pack({ party: 0 })).sort(), ['panorama/layout/dashboard.vxml_c', m.GLASS_STYLE].sort());
  assert.deepEqual(Object.keys(pack({ news: 99 })).sort(), ['panorama/layout/dashboard_page_home.vxml_c', m.HOME_STYLE].sort());
  // With the top bar too: one style for both; with a hidden card: one home style for both.
  const both = pack({ bar: 50, party: 50 });
  assert.match(text(both, m.GLASS_STYLE), /^\/\* GridStudio: the top bar's ground at 50 percent[\s\S]*\n\/\* GridStudio: the party bar's ground at 50 percent/);
  const card = pack({ news: 30 }, { news: { carnival: false, season: true } });
  assert.match(text(card, m.HOME_STYLE), /^\/\* GridStudio: news cards hidden on the home page\. \*\/\n\.FrontPageDarkCarnivalCell\n\{\n\tvisibility: collapse;\n\}\n\n\/\* GridStudio: the news column at 30 percent/);
  // Both cards hidden: no column, nothing to fade.
  const none = pack({ news: 30 }, { news: { carnival: false, season: false } });
  assert.equal(none[m.HOME_STYLE], undefined);
  assert.doesNotMatch(panoramaSource(none['panorama/layout/dashboard_page_home.vxml_c'].data), /TodayPages|gridstudio_home/);
  // Each needs its Valve layout.
  assert.throws(() => m.menuBackgroundPack({ video: null, dashboard, glass: { header: 50 }, md5 }), /mini_showcase\.xml/);
  assert.throws(() => m.menuBackgroundPack({ video: null, dashboard, glass: { news: 50 }, md5 }), /dashboard_page_home\.xml/);
  assert.throws(() => m.miniProfilePage('<root/>'), /мини-профиль/);
  assert.throws(() => m.styleDashboard(dashboard.replace('<Panel id="FriendlistBottom">', '<Panel id="Other">'), [m.GLASS_STYLE]), /группы/);
  for (const path of [m.MINI_PROFILE_PAGE, m.MINI_PROFILE_STYLE, m.HOME_STYLE, m.GLASS_STYLE]) assert.ok(m.MENU_PACK_PATHS.includes(path), path);
  assert.equal(m.glassChanged(m.MENU_GLASS), false);
  assert.equal(m.glassChanged({ party: 99 }), true);
});

test('the new rules name panels of Valve’s current layouts, in the scope that includes them', async () => {
  const [, m] = await modules;
  const t = m.menuGlassText({ news: 40, header: 40, showcase: 40, party: 40 });
  // The news column: #RightColumn is the home page's own panel (not a card's: those are layouts of their own).
  assert.match(home, /<Panel id="RightColumn" hittest="false">\n\t*<DOTAFrontpageContents id="FrontpageContents" \/>/);
  assert.match(t.home, /^#RightColumn$/m);
  // The party bar: #FriendlistBottom holds the slots and buttons (children, so the picture's alpha leaves them).
  assert.match(dashboard, /<Panel id="FriendlistBottom">[\s\S]*<DOTAParty id="CurrentParty"[\s\S]*<Button id="GuildButton"/);
  assert.deepEqual([...t.party.matchAll(/^([^\s/{}][^{}\n]*)$/gm)].map((x) => x[1]), ['#FriendlistBottom', '.OnHomePage #FriendlistBottom']);
  // The mini-profile: .Header holds the avatar and the name; the rank medal is its sibling; .ShowcaseData is the picture.
  // .LeftRailContain is friend_menu.xml's, around the DOTAMiniShowcase that loads mini_showcase.xml.
  const header = miniProfile.match(/<Panel class="Header">([\s\S]*?)\n\t\t\t<\/Panel>\n/)[1];
  assert.match(header, /<DOTAAvatarImage id="AvatarImage" \/>/);
  assert.match(header, /<DOTAUserName id="UserName" \/>/);
  assert.doesNotMatch(header, /RankTierContainer/);
  assert.match(miniProfile, /<\/Panel>\n\t\t\t<DOTARankBadge id="RankTierContainer" \/>\n\t\t<\/Panel>/);
  assert.match(miniProfile, /<AsyncDataPanel class="ShowcaseData"/);
  assert.match(friends, /<Panel class="LeftRailContain">\n\t+<Panel class="MiniShowcaseContainer">\n\t+<DOTAMiniShowcase id="MiniShowcase"/);
  assert.deepEqual([...t.miniProfile.matchAll(/^([^\s/{}][^{}\n]*)$/gm)].map((x) => x[1]), ['.LeftRailContain .Header', '.LeftRailContain .ShowcaseData']);
  // Watched like the others.
  const check = readFileSync('scripts/check-dota-menu.mjs', 'utf8');
  assert.ok(check.includes("'showcase/mini_showcase.xml'"));
  assert.ok(check.includes('PARTY_BORDERS') && check.includes('#RightColumn') && check.includes('.ShowcaseData'));
});

test('looks keep the new panels; documents without them read as Dota', async () => {
  const { lookDocument, lookParts, LOOK_FORMAT } = await import('../scripts/customize-look.mjs');
  const doc = (glass) => lookDocument({ format: LOOK_FORMAT, version: 1, menu: { buttons: { glass } } });
  assert.deepEqual(doc({ bar: 40, friends: 70 }).menu.buttons.glass, { ...ALL, bar: 40, friends: 70 }, 'a document of the first round');
  assert.deepEqual(doc({ news: 0, header: 20, showcase: 30, party: 40 }).menu.buttons.glass, { ...ALL, news: 0, header: 20, showcase: 30, party: 40 });
  assert.deepEqual(lookParts(doc({ party: 99 })), ['buttons']);
  assert.deepEqual(lookParts(doc({})), []);
  assert.throws(() => doc({ showcase: 101 }));
  assert.throws(() => doc({ news: 2.5 }));
});

test('the preview’s pictures of the new panels', async () => {
  for (const file of ['profile-head.webp', 'profile-showcase.webp', 'party-ground.webp', 'party-glass.webp']) assert.ok(existsSync(`assets/dota-menu/ui/${file}`), file);
  const menu = readFileSync('src/customize/DotaMenu.jsx', 'utf8');
  for (const key of ['news', 'header', 'showcase', 'party']) assert.ok(menu.includes(`see('${key}')`), key);
  const head = readFileSync('assets/dota-menu/ui/party-glass.webp');
  assert.ok(head.toString('ascii', 12, 16) === 'VP8X' && head[20] & 0x10, 'the party bar’s slots are a see-through picture');
});

test('the server takes a pack with every panel see-through for the PowerShell command', async () => {
  const [, m] = await modules;
  const { packProblem } = await import('../server/install-packs.mjs');
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
  const glass = { bar: 30, friends: 30, news: 30, header: 30, showcase: 30, party: 30 };
  const pack = m.menuBackgroundPack({ video: webm, dashboard, home, news: { carnival: true, season: true }, friends, miniProfile, glass, md5 });
  assert.equal(packProblem('bg', pack), '');
});

// The owner's in-game check (2026-10-22): faded, the column read as one grey box — the cards' shadows filled the gap.
test('the see-through news column masks the cards’ shadows out of the gap and the free right edge', async () => {
  const [, m] = await modules;
  const { width, cell, top, bottom } = m.NEWS_COLUMN, css = m.menuGlassText({ news: 40 }).home;
  // The masks follow Valve's cells as our copy of frontpage_contents.xml places them (watched by check-dota-menu.mjs).
  const contents = read('frontpage_contents.xml');
  assert.match(contents, /<DOTAFrontpageCellDarkCarnival class="FrontpageCell TopCell TallCell" \/>/);
  assert.match(contents, /<CustomLayoutPanel class="FrontpageCell BottomCell" id="QuarteroCell"/);
  assert.equal((contents.match(/class="FrontpageCell /g) || []).length, 2, 'two cells, no third one the masks would cut');
  assert.deepEqual([width, cell, top, bottom], [388, 330, [0, 484], [500, 734]]);
  // Vertical: opaque over the top card, clear between its bottom and the next card's top, opaque again.
  const stops = (rule) => [...rule.matchAll(/color-stop\( ([\d.]+), (white|#ffffff00) \)/g)].map(([, at, colour]) => [Number(at), colour === 'white']);
  const column = css.match(/#FrontpageContents\n\{([^}]*)\}/)[1], right = css.match(/#RightColumn\n\{([^}]*)\}/)[1];
  assert.match(column, new RegExp(`height: ${bottom[1]}px;`));
  const alphaAt = (list, x) => { let last = [0, true]; for (const s of list) if (s[0] <= x) last = s; return last[1]; };
  const v = stops(column);
  for (const y of [0, 100, top[1] - 1]) assert.equal(alphaAt(v, y / bottom[1]), true, `card at ${y}`);
  for (const y of [top[1] + 2, (top[1] + bottom[0]) / 2, bottom[0] - 2]) assert.equal(alphaAt(v, y / bottom[1]), false, `gap at ${y}`);
  for (const y of [bottom[0], 600, bottom[1] - 1]) assert.equal(alphaAt(v, y / bottom[1]), true, `card at ${y}`);
  // Horizontal: the cards' width opaque, the column's free right edge clear.
  assert.match(right, new RegExp(`width: ${width}px;`));
  const h = stops(right);
  assert.equal(alphaAt(h, (cell - 1) / width), true);
  assert.equal(alphaAt(h, (cell + 2) / width), false);
  assert.equal(alphaAt(h, 0.99), false);
  // Static only, the cards stay clickable (no hittest, no visibility), and the hide-one-card rules still come first.
  assert.doesNotMatch(css, /transition|animation|visibility|hittest/);
  assert.ok(readFileSync('scripts/check-dota-menu.mjs', 'utf8').includes("'frontpage_contents.xml'"));
  // The preview drops the cards' shadow the same way.
  assert.match(readFileSync('src/customize/customize.css', 'utf8'), /\.dm-news-column\.is-glass \.dm-news \{ box-shadow:none; \}/);
});
