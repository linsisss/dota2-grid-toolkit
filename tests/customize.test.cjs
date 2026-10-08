const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');

const modules = Promise.all([import('../scripts/vpk.mjs'), import('../scripts/menu-background.mjs'), import('../scripts/dota-font.mjs'), import('../scripts/zip.mjs')]);
const md5 = data => new Uint8Array(createHash('md5').update(data).digest());
const bytes = path => new Uint8Array(readFileSync(path));

test('Panorama resources are written exactly as Valve\'s resourcecompiler writes them', async () => {
  const [{ panoramaResource, panoramaSource }] = await modules;
  // Valve's files from the Source 2 Viewer test suite (github.com/ValveResourceFormat), with the
  // source CRC resourcecompiler recorded for them.
  for (const [file, path, sourceCRC] of [
    ['dashboard_page_credits.vxml_c', 'panorama/layout/dashboard_page_credits.vxml_c', 1675273883],
    ['tooltip_spidergraph.vcss_c', 'panorama/styles/tooltips/tooltip_spidergraph.vcss_c', 3187935984],
    // A vector image (.svg → .vsvg_c): the same resource, version 2, its source listed first.
    ['pip-left.vsvg_c', 'panorama/images/dpc/pip-left.vsvg_c', 0xe2e0a7cf]]) {
    const valve = bytes(`tests/fixtures/valve/${file}`);
    assert.deepEqual(panoramaResource(path, panoramaSource(valve), { sourceCRC }), valve, file);
  }
  const layout = '<root><Panel id="Ю" /></root>';
  assert.equal(panoramaSource(panoramaResource('panorama/layout/a.vxml_c', layout)), layout, 'UTF-8 source survives');
  assert.throws(() => panoramaResource('panorama/images/a.vtex_c', 'x'), /Не Panorama-ресурс/);
});

test('VPK v2 packs list, checksum and hash their files', async () => {
  const [{ buildVPK, readVPK, crc32 }] = await modules;
  const files = [{ path: 'panorama/layout/a.vxml_c', data: new Uint8Array([1, 2, 3]) }, { path: 'zxc/zxc.webm', data: new Uint8Array(1000).fill(7) }, { path: 'readme', data: new Uint8Array([9]) }];
  const pack = buildVPK(files, { md5 }), read = readVPK(pack);
  assert.equal(read.version, 2);
  assert.deepEqual(read.files.map(file => [file.path, file.length, file.crc]), files.map(file => [file.path, file.data.length, crc32(file.data)]));
  assert.deepEqual(read.files[1].data, files[1].data);
  // The last 16 bytes hash everything before them; the two before that hash the tree and the (empty) archive list.
  assert.deepEqual(pack.subarray(-16), md5(pack.subarray(0, -16)));
  assert.deepEqual(pack.subarray(-32, -16), md5(new Uint8Array(0)));
  assert.throws(() => buildVPK([{ path: '../evil', data: new Uint8Array(1) }], { md5 }), /Недопустимый путь/);
});

test('the menu pack points Valve\'s dashboard at our video layout', async () => {
  const [{ readVPK, panoramaSource }, { menuBackgroundPack, menuDashboard, MENU_VIDEO, MENU_LAYOUT }] = await modules;
  const dashboard = readFileSync('assets/dota-menu/dashboard.xml', 'utf8'), home = readFileSync('assets/dota-menu/dashboard_page_home.xml', 'utf8');
  const video = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
  const files = Object.fromEntries(readVPK(menuBackgroundPack({ video, dashboard, home, md5 })).files.map(file => [file.path, file.data]));
  assert.deepEqual(Object.keys(files).sort(), ['panorama/layout/dashboard.vxml_c', 'panorama/layout/dashboard_page_home.vxml_c', MENU_LAYOUT, 'panorama/styles/gridstudio_background.vcss_c', MENU_VIDEO].sort());
  const ours = panoramaSource(files['panorama/layout/dashboard.vxml_c']);
  assert.match(ours, new RegExp(`override-background="s2r://${MENU_LAYOUT}"`));
  // Everything else in Valve's layout is kept as it is.
  assert.equal(ours.replace(/override-background="[^"]*"/, ''), dashboard.replace(/override-background="[^"]*"/, ''));
  assert.match(panoramaSource(files[MENU_LAYOUT]), new RegExp(`<MoviePanel[^>]+src="s2r://${MENU_VIDEO}"`));
  assert.doesNotMatch(panoramaSource(files['panorama/layout/dashboard_page_home.vxml_c']), /TodayPages|FrontpageContents/);
  assert.deepEqual(files[MENU_VIDEO], video);
  assert.equal(readVPK(menuBackgroundPack({ video, dashboard, md5 })).files.length, 4, 'the home page stays Valve\'s without "clean"');
  assert.throws(() => menuDashboard('<root/>'), /override-background/);
});

test('the season event stays one click away: a button in Valve\'s dashboard, the event nested in our layout', async () => {
  const [{ readVPK, panoramaSource }, { menuBackgroundPack, menuEvent, MENU_LAYOUT, MENU_STYLE, MENU_UI_STYLE }] = await modules;
  const current = readFileSync('assets/dota-menu/dashboard.xml', 'utf8'), home = readFileSync('assets/dota-menu/dashboard_page_home.xml', 'utf8');
  const heroPage = readFileSync('assets/dota-menu/dashboard_page_hero_new_v2.xml', 'utf8'), event = JSON.parse(readFileSync('assets/dota-menu/event.json', 'utf8'));
  // Since Dota's update of 2026-10-07 the menu shows another layout (Monster Hoard) and Valve's own
  // news cell opens Quartero: the current menu gets no button. The button itself is checked on a menu
  // that still shows the event.
  assert.equal(menuEvent(current, event), null, 'the current menu has no event of ours');
  const dashboard = current.replace(/(override-background=")[^"]*(")/, `$1${event.layout}$2`);
  const sources = (options) => Object.fromEntries(readVPK(menuBackgroundPack({ video: new Uint8Array([1]), dashboard, md5, ...options })).files
    .filter(file => !file.path.endsWith('.webm')).map(file => [file.path, panoramaSource(file.data)]));
  // event.json is the event Valve's menu shows now (check-dota-menu.mjs --update keeps them apart until it is).
  assert.equal(menuEvent(dashboard, event), event);
  const files = sources({ event, home, hero: { page: heroPage } }), board = files['panorama/layout/dashboard.vxml_c'];
  assert.ok(files[MENU_UI_STYLE]);
  assert.match(board, /<include src="s2r:\/\/panorama\/styles\/gridstudio_menu\.vcss_c" \/>/);
  assert.match(board, /<PageManager id="DashboardPages" hittest="false" \/>\s*<Panel id="GridStudioEventLayer" hittest="false">\s*<Button id="GridStudioEventToggle" onactivate="ToggleStyle\( DashboardCore, GridStudioShowEvent \)/);
  assert.ok(board.includes(`text="${event.title}"`) && board.includes(`src="${event.logo}"`) && board.includes('text="#UI_BACK"'));
  assert.ok(files[MENU_LAYOUT].includes(`<CustomLayoutPanel id="GridStudioEvent" layout="${event.layout}" />`));
  assert.match(files[MENU_STYLE], /\.GridStudioShowEvent #GridStudioMovie\s*\{\s*visibility: collapse;/);
  // What Dota needs to load the menu at all (tested in game 01.10.2026): ASCII only, and no event
  // handlers in layouts of our own paths; Valve's files we replace keep theirs.
  for (const [path, source] of Object.entries(files)) {
    assert.doesNotMatch(source, /[^\x00-\x7f]/, path);
    if (path.endsWith('.vxml_c') && !/dashboard|hero_new/.test(path)) assert.doesNotMatch(source, /\son[a-z]+="/, path);
  }
  // Under the event card, or at the column's top with the news hidden.
  assert.match(files[MENU_UI_STYLE], /margin-top: 100px/);
  assert.match(sources({ event })[MENU_UI_STYLE], /margin-top: 600px/);
  // With the play panel open the button goes with the event card: its layer has Valve's rules for the
  // pages (one transition on the base state, for both ways), the button none of its own for that.
  assert.match(files[MENU_UI_STYLE], /#GridStudioEventLayer\s*\{[^}]*transition-property: transform, blur, saturation, wash-color[^}]*transition-duration: 0\.45s;[^}]*ease-in;/);
  assert.match(files[MENU_UI_STYLE], /DOTADashboard\.PlayTabVisible #GridStudioEventLayer\s*\{[^}]*translatex\( -120px \)/);
  assert.doesNotMatch(files[MENU_UI_STYLE], /PlayTabVisible #GridStudioEventToggle/);
  // Without it, or once Valve shows another event, the pack is the one from before.
  const plain = sources({}), stale = sources({ event: { ...event, layout: 's2r://panorama/layout/dashboard_background_other.vxml_c' } });
  assert.deepEqual(stale, plain);
  assert.deepEqual(Object.keys(plain).sort(), ['panorama/layout/dashboard.vxml_c', MENU_LAYOUT, MENU_STYLE].sort());
  assert.doesNotMatch(plain[MENU_LAYOUT] + plain['panorama/layout/dashboard.vxml_c'], /GridStudioEvent/);
});

test('the «Герои» page gets a darker background or a video of its own under the hero grid', async () => {
  const [{ readVPK, panoramaSource }, { menuBackgroundPack, gridPage, GRID_PAGE, GRID_STYLE, GRID_VIDEO }] = await modules;
  const read = (file) => readFileSync(`assets/dota-menu/${file}`, 'utf8'), dashboard = read('dashboard.xml'), page = read('dashboard_page_heroes.xml');
  const files = (grid) => Object.fromEntries(readVPK(menuBackgroundPack({ video: new Uint8Array([1]), dashboard, grid: grid && { page, ...grid }, md5 })).files.map(file => [file.path, file.data]));
  // Darker: a veil under the grid, over the menu's background (which stays).
  const dim = files({ dim: 0.4 }), dimPage = panoramaSource(dim[GRID_PAGE]);
  assert.match(dimPage, /<DOTAHeroesPage class="DashboardPage" defaultfocus="HeroGrid">\s*<Panel id="GridStudioGridVeil" hittest="false" \/>\s*<Panel id="BanDisplayContainer">/);
  assert.match(panoramaSource(dim[GRID_STYLE]), /#GridStudioGridVeil\s*\{\s*background-color: #00000066;/);
  assert.equal(dim[GRID_VIDEO], undefined);
  // Its own video: the menu's background hidden on this page, the movie first (under the grid).
  const own = files({ video: new Uint8Array([7, 7]) }), ownPage = panoramaSource(own[GRID_PAGE]);
  assert.match(ownPage, /<DOTAHeroesPage class="DashboardPage" defaultfocus="HeroGrid" hidebackground="true">\s*<MoviePanel id="GridStudioGridMovie" src="s2r:\/\/panorama\/videos\/gridstudio_grid_background\.webm"/);
  assert.deepEqual(own[GRID_VIDEO], new Uint8Array([7, 7]));
  assert.doesNotMatch(panoramaSource(own[GRID_STYLE]), /background-color/);
  // Raised over the sub-navigation (the page starts 120 px down); the rest of the page is Valve's.
  assert.match(panoramaSource(own[GRID_STYLE]), /margin-top: -120px;/);
  assert.equal(ownPage.replace(/\n\t\t<include src="s2r:\/\/panorama\/styles\/gridstudio_grid\.vcss_c" \/>/, '').replace(' hidebackground="true"', '').replace(/\n\t\t<MoviePanel id="GridStudioGridMovie"[^\n]*/, ''), page);
  assert.equal(files(null)[GRID_PAGE], undefined, 'only when asked');
  assert.throws(() => gridPage('<root/>'), /страница «Герои»/);
});

test('profiles get Stratz and Dotabuff buttons that open the player\'s page', async () => {
  const [{ readVPK, panoramaSource }, { menuBackgroundPack, profilePage, PROFILE_PAGE, PROFILE_STYLE, PROFILE_ICONS }] = await modules;
  const read = (file) => readFileSync(`assets/dota-menu/${file}`, 'utf8'), dashboard = read('dashboard.xml'), page = read('dashboard_page_showcase.xml');
  const icons = { stratz: read('icons/stratz.svg'), dotabuff: read('icons/dotabuff.svg') };
  const files = Object.fromEntries(readVPK(menuBackgroundPack({ video: new Uint8Array([1]), dashboard, profile: { page, icons }, md5 })).files.map(file => [file.path, file.data]));
  const ours = panoramaSource(files[PROFILE_PAGE]);
  // Valve's page with our style after theirs and a row after the status line, inside #ProfileMainCorner.
  assert.match(ours, /dashboard_page_showcase\.vcss_c" \/>\s*<include src="s2r:\/\/panorama\/styles\/gridstudio_profile\.vcss_c" \/>/);
  assert.match(ours, /<\/Panel>\s*<Panel id="GridStudioStatsLinks" hittest="false">[\s\S]*<\/Panel>\s*<\/Panel>\s*<\/Panel>\s*<Label id="PendingApprovalLabel"/);
  // The id joined to the URL by the handler: Valve's Resolve() only localizes arguments that start
  // with «{» (in game, a URL with {s:account_id} inside stayed literal).
  for (const url of ['https://stratz.com/players/', 'https://www.dotabuff.com/players/'])
    assert.ok(ours.includes(`onactivate="$.DispatchEvent( 'ExternalBrowserGoToURL', '${url}' + $.Localize( '{s:account_id}', $.GetContextPanel() ) );"`), url);
  assert.equal(ours.replace(/\n\t\t<include src="s2r:\/\/panorama\/styles\/gridstudio_profile\.vcss_c" \/>/, '').replace(/\n\t*<Panel id="GridStudioStatsLinks"[\s\S]*?\n\t*<\/Panel>(?=\n\t*<\/Panel>\n\t*<\/Panel>\n\t*<Label id="PendingApprovalLabel")/, ''), page, 'the rest is Valve\'s');
  // The logos are Panorama vector images with the SVG inside, referenced without «_c».
  for (const [name, path] of Object.entries(PROFILE_ICONS)) {
    assert.equal(panoramaSource(files[path]), icons[name]);
    assert.ok(ours.includes(`src="s2r://${path.replace(/_c$/, '')}"`), name);
  }
  assert.match(panoramaSource(files[PROFILE_STYLE]), /#GridStudioStatsLinks\s*\{[^}]*margin-top: 22px;/);
  for (const [path, data] of Object.entries(files)) if (!path.endsWith('.webm')) assert.doesNotMatch(panoramaSource(data), /[^\x00-\x7f]/, path);
  assert.throws(() => profilePage('<root/>'), /строка статуса/);
  assert.equal(readVPK(menuBackgroundPack({ video: new Uint8Array([1]), dashboard, md5 })).files.some(file => file.path === PROFILE_PAGE), false, 'only when asked');
});

test('a catalog font becomes Valve\'s font files with Valve\'s names inside', async () => {
  const [, , { readFont, dotaFontPack, fontCoverage, DOTA_FONT_FILES }] = await modules;
  const catalog = JSON.parse(readFileSync('data/dota-fonts.json', 'utf8'));
  assert.ok(catalog.fonts.length >= 4);
  assert.ok(catalog.fonts.every((font) => font.license === 'SIL Open Font License 1.1'), 'only OFL fonts are shipped');
  for (const font of catalog.fonts) for (const face of font.files) {
    const read = readFont(bytes(`assets/dota-fonts/${font.id}/${face.file}`)), missing = fontCoverage(read);
    assert.deepEqual([missing.latin, missing.cyrillic], [[], []], `${font.family} ${face.weight} covers Latin and Cyrillic`);
    assert.equal(read.weight, face.weight);
  }
  const monocraft = catalog.fonts.find(font => font.id === 'monocraft').files.map(face => readFont(bytes(`assets/dota-fonts/monocraft/${face.file}`)));
  const pack = dotaFontPack(monocraft);
  assert.deepEqual(pack.map(file => file.name).sort(), [...DOTA_FONT_FILES].sort());
  const face = name => readFont(pack.find(file => file.name === name).data);
  const semibold = face('radiance-semibold.otf');
  assert.deepEqual([semibold.names[1], semibold.names[2], semibold.names[16], semibold.names[17], semibold.weight, semibold.italic, semibold.fsType], ['Radiance Semibold', 'Regular', 'Radiance', 'Semibold', 600, false, 0]);
  const bold = face('radiance-bold.otf');
  assert.deepEqual([bold.names[1], bold.names[2], bold.names[16], bold.weight], ['Radiance', 'Bold', undefined, 700]);
  assert.deepEqual([face('reaver-regular.otf').names[1], face('radiancem-italic.otf').italic], ['Reaver', true]);
  // Each file is a valid sfnt: its checksum adjustment balances the whole file.
  for (const file of pack) {
    const padded = new Uint8Array((file.data.length + 3) & ~3); padded.set(file.data);
    const view = new DataView(padded.buffer); let sum = 0;
    for (let i = 0; i < padded.length; i += 4) sum = (sum + view.getUint32(i)) >>> 0;
    assert.equal(sum, 0xb1b0afba, file.name);
  }
  // Only the chosen families: Reaver's five files.
  assert.equal(dotaFontPack(monocraft, ['Reaver']).length, 5);
  assert.throws(() => readFont(new TextEncoder().encode('wOF2 not really')), /WOFF/);
});

test('ZIP archives: UTF-8 names, deflate where it helps, valid CRCs', async () => {
  const [{ crc32 }, , , { buildZip }] = await modules;
  const text = 'Привет\r\n'.repeat(40), raw = new Uint8Array([1, 2, 3]);
  const zip = new Uint8Array(await (await buildZip([{ name: 'ПРОЧТИ.txt', data: text }, { name: 'fonts/a.bin', data: raw }])).arrayBuffer());
  const view = new DataView(zip.buffer), end = zip.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 2);
  let at = view.getUint32(end + 16, true);
  const entries = [];
  for (let i = 0; i < 2; i++) {
    const nameLength = view.getUint16(at + 28, true);
    entries.push({ method: view.getUint16(at + 10, true), crc: view.getUint32(at + 16, true), size: view.getUint32(at + 24, true), flags: view.getUint16(at + 8, true),
      name: new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength)) });
    at += 46 + nameLength;
  }
  assert.deepEqual(entries.map(entry => [entry.name, entry.method, entry.flags & 0x800]), [['ПРОЧТИ.txt', 8, 0x800], ['fonts/a.bin', 0, 0x800]]);
  assert.equal(entries[0].crc, crc32(new TextEncoder().encode(text)));
  assert.equal(entries[1].size, 3);
});

test('uploads are recognised by their first bytes; MD5 for VPK checksums works in the browser too', async () => {
  const [{ mediaKind, menuBitrate, MENU_LIMITS }, { md5: browserMD5 }] = await Promise.all([import('../scripts/menu-background.mjs'), import('../scripts/md5.mjs')]);
  const ascii = text => Uint8Array.from(text, ch => ch.charCodeAt(0));
  assert.equal(mediaKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10])).mime, 'image/png');
  assert.equal(mediaKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])).mime, 'image/jpeg');
  assert.equal(mediaKind(ascii('GIF89a')).mime, 'image/gif');
  assert.equal(mediaKind(ascii('RIFF\0\0\0\0WEBPVP8 ')).mime, 'image/webp');
  assert.equal(mediaKind(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])).type, 'video');
  assert.equal(mediaKind(ascii('\0\0\0\x20ftypisom')).mime, 'video/mp4');
  assert.equal(mediaKind(ascii('<html>')), null);
  assert.equal(MENU_LIMITS.bytes, 50_000_000);
  assert.equal(menuBitrate(30), Math.floor(12_000_000 * 8 / 30), 'a 30-second video stays around 12 MB, well under what Dota plays');
  assert.equal(menuBitrate(5), 4_000_000);
  for (const size of [0, 55, 56, 64, 1000, 100_003]) {
    const data = new Uint8Array(size).map((_, i) => (i * 131 + 17) & 255);
    assert.deepEqual(browserMD5(data), md5(data), `${size} bytes`);
  }
});

test('a video piece stays inside the video, up to 30 s; a crossfade shortens the clip', async () => {
  const { fitPiece, pieceLength } = await import('../scripts/menu-background.mjs');
  assert.deepEqual(fitPiece({ start: 0, end: 45 }, 45, 'start'), { start: 0, end: 30 });
  assert.deepEqual(fitPiece({ start: 9, end: 45 }, 45, 'start'), { start: 9, end: 39 }, 'moving the start pulls the end along');
  assert.deepEqual(fitPiece({ start: 2, end: 44 }, 45, 'end'), { start: 14, end: 44 }, 'moving the end pulls the start');
  assert.deepEqual(fitPiece({ start: 10, end: 10.2 }, 45, 'end'), { start: 10, end: 11 }, 'at least a second');
  assert.deepEqual(fitPiece({ start: -3, end: 99 }, 8, 'start'), { start: 0, end: 8 });
  assert.equal(pieceLength({ start: 0, end: 30 }, 2), 28);
  assert.equal(pieceLength({ start: 0, end: 3 }, 2), 2, 'the crossfade is at most a third of the piece');
});

test('blur and dim: σ in 1080p pixels scaled to the screen, a black veil, a zoom that hides the blurred edges', async () => {
  const { menuLook, MENU_EFFECTS } = await import('../scripts/menu-background.mjs');
  assert.deepEqual(menuLook(), { sigma: 0, veil: 0, zoom: 1 });
  const full = menuLook({ blur: 1, dim: 1 });
  assert.equal(full.sigma, MENU_EFFECTS.blur); assert.equal(full.veil, MENU_EFFECTS.dim); assert.equal(full.zoom, 1 + 5 * MENU_EFFECTS.blur / 1080);
  assert.equal(menuLook({ blur: 0.5 }, 1200).sigma, MENU_EFFECTS.blur * 0.5 * 1200 / 1080, 'the same share of the height on 16:10');
  assert.equal(menuLook({ blur: 0.5 }, 1200).zoom, menuLook({ blur: 0.5 }).zoom);
  assert.deepEqual(menuLook({ blur: 7, dim: -1 }), menuLook({ blur: 1, dim: 0 }), 'clamped');
});

test('Windows installers: the menu background and the font by a command that downloads the uploaded pack itself', async (t) => {
  const { backgroundScript, backgroundRemoveScript, fontScript, fontRemoveScript, PACK_NAME, FONT_NAME } = await import('../scripts/installer.mjs');
  // The background: the page uploads the pack (server/install-packs.mjs); the address carries its SHA-256
  // and size and the script downloads exactly that file from the site, checks it and installs it — it
  // never looks into Downloads, so nothing can be mixed up.
  const sha256 = 'ab'.repeat(32), url = `https://gridstudio.me/api/catalog/install/file/bg-${sha256}`;
  assert.equal(PACK_NAME(sha256), 'gridstudio-background-abababab.vpk');
  const script = backgroundScript({ sha256, size: 1234, url }, { remove: 'https://gridstudio.me/api/catalog/install/bg-remove', language: 'ru' });
  const remove = backgroundRemoveScript('ru');
  for (const body of [script, remove]) {
    assert.match(body, /^# GridStudio[^\n]*\n& \{\n\$ErrorActionPreference = 'Stop'\n/, 'its own scope');
    assert.match(body, /libraryfolders\.vdf/);
    assert.match(body, /\$boot = Join-Path \$dota 'game\\dota\\cfg\\boot\.vcfg'/);
    assert.doesNotMatch(body, /UILanguage|DownloadString|Start-Process|shell:Downloads|OpenFileDialog/);
    assert.doesNotMatch(body, /[‘’“”]/);
  }
  assert.doesNotMatch(remove, /Invoke-WebRequest/, 'taking it away downloads nothing');
  assert.match(script, new RegExp(`Invoke-WebRequest -Uri '${url}' -OutFile \\$file -UseBasicParsing`));
  assert.match(script, /GetTempPath\(\)/);
  assert.match(script, /\.Length -ne 1234 -or/);
  assert.match(script, new RegExp(`Get-FileHash -LiteralPath \\$file -Algorithm SHA256\\)\\.Hash -ne '${sha256.toUpperCase()}'`));
  assert.match(script, /if \(\$status -eq 404\) \{ throw 'Команда устарела/);
  assert.match(script, /finally \{ if \(\$pack\) \{ Remove-Item -LiteralPath \$pack/, 'the downloaded file goes');
  assert.throws(() => backgroundScript({ sha256, size: 1234, url: "https://x/a' ; rm -r ~ ; '" }), 'the address is checked before it goes into the script');
  assert.match(script, /\$ProgressPreference = 'SilentlyContinue'/);
  assert.match(script, /'game\\dota_russian'/);
  assert.match(script, /Set-RussianAudio\n/);
  assert.match(script, /irm https:\/\/gridstudio\.me\/api\/catalog\/install\/bg-remove \| iex/);
  assert.match(remove, /Restore-Audio\n/);
  assert.match(remove, /gridstudio-backup/);
  assert.throws(() => backgroundScript({ sha256: 'x', size: 1 }));
  // The font, the same way: the archive by its fingerprint, only fonts/<name>.otf|ttf out of it, the
  // game's files kept once in panorama/fonts/gridstudio-backup, fontconfig's cache dropped.
  assert.equal(FONT_NAME(sha256), 'gridstudio-font-abababab.zip');
  const font = fontScript({ sha256, size: 4321, url: `https://gridstudio.me/api/catalog/install/file/font-${sha256}` }, { remove: 'https://gridstudio.me/api/catalog/install/font-remove', language: 'ru' });
  const fontRemove = fontRemoveScript('ru');
  for (const body of [font, fontRemove]) {
    assert.match(body, /^# GridStudio[^\n]*\n& \{\n\$ErrorActionPreference = 'Stop'\n/, 'its own scope');
    assert.match(body, /libraryfolders\.vdf/);
    assert.match(body, /'game\\dota\\panorama\\fonts'/);
    assert.match(body, /gridstudio-backup/);
    assert.match(body, /Join-Path \$env:TEMP 'fontconfig'/);
    assert.doesNotMatch(body, /DownloadString|Start-Process|\.bat|shell:Downloads|OpenFileDialog/);
    assert.doesNotMatch(body, /[‘’“”]/);
  }
  assert.match(font, /Invoke-WebRequest -Uri 'https:\/\/gridstudio\.me\/api\/catalog\/install\/file\/font-a/);
  assert.doesNotMatch(fontRemove, /Invoke-WebRequest/);
  assert.match(font, /\.Length -ne 4321 -or/);
  assert.match(font, /ZipFile\]::OpenRead\(\$pack\)/);
  assert.match(font, /'\^fonts\/\[A-Za-z0-9\._-\]\+\\\.\(otf\|ttf\)\$'/, 'only font files, no paths');
  assert.match(font, /if \(-not \(Test-Path -LiteralPath \$backup\)\)/, 'the first backup is kept');
  assert.match(font, /irm https:\/\/gridstudio\.me\/api\/catalog\/install\/font-remove \| iex/);
  assert.throws(() => fontScript({ sha256, size: 0 }));
  // Served by the API from the address alone.
  const [{ CatalogStore }, { createCatalogAPI }] = await Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs')]);
  const store = new CatalogStore(':memory:', 'test-bg');
  const { server } = createCatalogAPI({ development: true, origin: 'http://127.0.0.1:4173', salt: 'test-bg', admins: new Set(), database: ':memory:' }, { store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/catalog/install`;
  assert.match(await (await fetch(`${base}/bg-${sha256}-1234-en`)).text(), new RegExp(`Downloading the background[\\s\\S]*/api/catalog/install/file/bg-${sha256}`));
  assert.match(await (await fetch(`${base}/bg-${sha256}-1234`)).text(), /install\/bg-remove \| iex/);
  assert.match(await (await fetch(`${base}/bg-remove`)).text(), /Restore-Audio/);
  assert.match(await (await fetch(`${base}/font-${sha256}-4321-en`)).text(), new RegExp(`Downloading the font[\\s\\S]*/api/catalog/install/file/font-${sha256}`));
  assert.match(await (await fetch(`${base}/font-${sha256}-4321`)).text(), /install\/font-remove \| iex/);
  assert.match(await (await fetch(`${base}/font-remove-en`)).text(), /Dota fonts are back/);
});

test('grid by a PowerShell command: a script in its own scope that downloads the grid and puts it into the folder of the account signed in to Steam', async (t) => {
  const { gridScript, gridRestoreScript, installCommand, gridExpiredScript } = await import('../scripts/installer.mjs');
  const sha256 = 'cd'.repeat(32), url = 'https://gridstudio.me/api/catalog/install/file/grid-AbCdEf0123456789';
  const script = gridScript({ url, sha256, size: 777 }, { restore: 'https://gridstudio.me/api/catalog/install/restore', language: 'ru' });
  const restore = gridRestoreScript('ru');
  assert.equal(installCommand('https://gridstudio.me/api/catalog/install/AbCdEf0123456789'),
    "[Net.ServicePointManager]::SecurityProtocol = 'Tls12'; irm https://gridstudio.me/api/catalog/install/AbCdEf0123456789 | iex");
  for (const text of [script, restore]) {
    assert.match(text, /^# GridStudio[^\n]*\n& \{\n\$ErrorActionPreference = 'Stop'\n/, 'its own scope: the PowerShell it runs in keeps its settings');
    assert.match(text, /\n\}\n$/);
    assert.match(text, /HKCU:\\Software\\Valve\\Steam\\ActiveProcess/, 'the account signed in now');
    assert.match(text, /config\\loginusers\.vdf/, 'else the last one');
    assert.match(text, /\$active \+= \[int64\]4294967296/, 'ActiveUser is a DWORD');
    assert.match(text, /'userdata\\' \+ \$account \+ '\\570'/);
    assert.match(text, /Get-Process -Name dota2/);
    assert.doesNotMatch(text, /DownloadString|Start-Process|Read-Host 'Нажми Enter|shell:Downloads|\$grid = @'/, 'nothing started; no grid text inside; the console stays open by itself');
    assert.doesNotMatch(text, /[‘’“”]/, 'PowerShell takes typographic quotes for its own');
  }
  // The grid is downloaded as bytes (the encoding plays no part), checked and copied as it is.
  assert.match(script, new RegExp(`Invoke-WebRequest -Uri '${url}' -OutFile \\$file -UseBasicParsing`));
  assert.match(script, /\.Length -ne 777 -or/);
  assert.match(script, new RegExp(`Hash -ne '${sha256.toUpperCase()}'`));
  assert.match(script, /Copy-Item -LiteralPath \$file -Destination \$dest -Force/);
  assert.match(script, /finally \{ Remove-Item -LiteralPath \$file/);
  assert.match(script, /remote\\cfg/);
  assert.match(script, /gridstudio-backup/);
  assert.match(script, /irm https:\/\/gridstudio\.me\/api\/catalog\/install\/restore \| iex/, 'it says how to go back');
  assert.doesNotMatch(restore, /Invoke-WebRequest/, 'going back downloads nothing');
  assert.match(restore, /Sort-Object Name \| Select-Object -Last 1/);
  assert.match(gridScript({ url, sha256, size: 1 }, { language: 'en' }), /Done: /);
  assert.throws(() => gridScript({ url: "https://x/a'; rm ~", sha256, size: 1 }));
  assert.match(gridExpiredScript('ru'), /устарела/);
  // Over HTTP: the command's script names the file, the file is the grid, byte for byte.
  const [{ CatalogStore }, { createCatalogAPI }] = await Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs')]);
  const store = new CatalogStore(':memory:', 'test-grid-install');
  const { server } = createCatalogAPI({ development: true, origin: 'http://127.0.0.1:4173', salt: 'test-grid-install', admins: new Set(), database: ':memory:' }, { store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const grid = { version: 3, configs: [{ config_name: 'Мета «x»', categories: [{ category_name: "'@ #> \"$x\"\n", x_position: 1, y_position: 2, width: 3, height: 4, hero_ids: [1] }] }] };
  const saved = await (await fetch(`${base}/install`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4173' }, body: JSON.stringify({ grid, lang: 'ru' }) })).json();
  const local = (address) => `http://127.0.0.1:${server.address().port}${new URL(address).pathname}`;
  const body = await (await fetch(local(saved.address))).text();
  const file = /Invoke-WebRequest -Uri '([^']+)'/.exec(body)[1], size = Number(/\.Length -ne (\d+) -or/.exec(body)[1]), hash = /Hash -ne '([0-9A-F]{64})'/.exec(body)[1];
  assert.match(file, new RegExp(`/api/catalog/install/file/grid-${saved.id}$`));
  const bytes = Buffer.from(await (await fetch(local(file))).arrayBuffer());
  assert.equal(bytes.length, size);
  assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex').toUpperCase(), hash);
  assert.ok(JSON.parse(bytes.toString('utf8')).configs[0].categories.some((c) => c.category_name === grid.configs[0].categories[0].category_name), 'the grid, letters and quotes as they were');
  assert.equal((await fetch(`${base}/install/file/grid-AAAAAAAAAAAAAAAA`)).status, 404);
});

test('the API keeps a grid for the command for a week and serves its script', async (t) => {
  const [{ CatalogStore }, { createCatalogAPI }, { GRID_INSTALL_TTL }] = await Promise.all([
    import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs'), import('../server/grid-installs.mjs')]);
  let now = 1_000_000;
  const store = new CatalogStore(':memory:', 'test-install', () => now);
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-install', admins: new Set(), database: ':memory:' };
  const { server } = createCatalogAPI(config, { store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const post = (body) => fetch(`${base}/install`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: config.origin }, body: JSON.stringify(body) });
  const grid = { version: 3, configs: [{ config_name: 'Мета', categories: [{ category_name: 'КЕРРИ', x: 0, y: 0, width: 100, height: 100, hero_ids: [1, 2] }] }] };
  const saved = await post({ grid, lang: 'ru' });
  assert.equal(saved.status, 201);
  const { id, address } = await saved.json();
  assert.match(id, /^[A-Za-z0-9_-]{16}$/);
  assert.equal(address, `${config.origin}/api/catalog/install/${id}`);
  assert.equal((await (await post({ grid, lang: 'ru' })).json()).id, id, 'the same grid keeps its address');
  const script = await fetch(`${base}/install/${id}`);
  assert.equal(script.headers.get('content-type'), 'text/plain; charset=utf-8', 'PowerShell reads the page as UTF-8 only when told so');
  const text = await script.text();
  assert.match(text, new RegExp(`Invoke-WebRequest -Uri '${config.origin}/api/catalog/install/file/grid-${id}'`), 'the script downloads the grid');
  const file = await (await fetch(`${base}/install/file/grid-${id}`)).text();
  assert.match(file, /^\{"_comment":"Сетка создана и скачана с gridstudio\.me","version":3,"configs":\[\{"config_name":"Мета"/, 'the site\'s note first');
  assert.match(text, /install\/restore \| iex/);
  assert.match(await (await fetch(`${base}/install/restore-en`)).text(), /Brought the previous grids back/);
  assert.equal((await post({ grid: { configs: [] } })).status, 400, 'only a grid file');
  now += GRID_INSTALL_TTL + 1;
  assert.match(await (await fetch(`${base}/install/${id}`)).text(), /устарела/, 'after a week the address says so instead of failing');
  assert.equal((await fetch(`${base}/install/file/grid-${id}`)).status, 404, 'and its file is gone');
});

test('every grid the site hands out carries its note first; reading a grid ignores it', async () => {
  const { withGridNote, ensureGridNote, GRID_NOTE } = await import('../scripts/grid-note.mjs');
  const grid = { version: 3, configs: [{ config_name: 'А', categories: [] }] };
  const noted = withGridNote(grid);
  assert.deepEqual(Object.keys(noted), ['_comment', 'version', 'configs']);
  assert.equal(noted._comment, GRID_NOTE);
  assert.deepEqual(Object.keys(withGridNote(noted, 'Grid made and downloaded at gridstudio.me')), ['_comment', 'version', 'configs'], 'replaced, not doubled');
  assert.equal(ensureGridNote({ _comment: 'Grid made and downloaded at gridstudio.me', ...grid })._comment, 'Grid made and downloaded at gridstudio.me', 'the page\'s language is kept');
  assert.equal(ensureGridNote({ _comment: 5, ...grid })._comment, GRID_NOTE);
  assert.equal(grid._comment, undefined, 'the grid itself is not changed');
  const C = await import('../scripts/core.mjs');
  assert.doesNotThrow(() => (C.default || C).importDota(noted));
});


// The news column's cards one by one (2026-10-08): one hidden — the column stays with a style of ours
// that collapses that cell; both hidden — the column goes, as before; none — Valve's home page as it is.
test('news cards hide one by one; both hidden is the clean home page of before', async () => {
  const [{ readVPK, panoramaSource }, { menuBackgroundPack, HOME_STYLE, NEWS_CELLS, MENU_PACK_PATHS }] = await modules;
  const dashboard = readFileSync('assets/dota-menu/dashboard.xml', 'utf8'), home = readFileSync('assets/dota-menu/dashboard_page_home.xml', 'utf8');
  const video = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 1, 2, 3]);
  const pack = (news) => Object.fromEntries(readVPK(menuBackgroundPack({ video, dashboard, home, news, md5 })).files.map((file) => [file.path, file.data]));
  const homeOf = (files) => panoramaSource(files['panorama/layout/dashboard_page_home.vxml_c']);
  const one = pack({ carnival: false, season: true });
  assert.match(homeOf(one), new RegExp(`<include src="s2r://${HOME_STYLE}" />`));
  assert.match(homeOf(one), /<Panel id="TodayPages"/, 'the column stays');
  const style = panoramaSource(one[HOME_STYLE]);
  assert.match(style, new RegExp(`\\.${NEWS_CELLS.carnival}\\s*\\{\\s*visibility: collapse;`));
  assert.doesNotMatch(style, new RegExp(NEWS_CELLS.season));
  assert.match(panoramaSource(pack({ carnival: true, season: false })[HOME_STYLE]), new RegExp(NEWS_CELLS.season));
  const both = pack({ carnival: false, season: false });
  assert.doesNotMatch(homeOf(both), /TodayPages/, 'both hidden: no column');
  assert.equal(both[HOME_STYLE], undefined);
  const none = pack({ carnival: true, season: true });
  assert.equal(none['panorama/layout/dashboard_page_home.vxml_c'], undefined, 'nothing hidden: Valve\'s home page');
  assert.ok(MENU_PACK_PATHS.includes(HOME_STYLE), 'the server takes the style in a PowerShell pack');
  // Studio recipes keep the choice; recipes before it have `clean` only.
  const { studioRecipe } = await import('../scripts/studio-background.mjs');
  const recipe = { aspect: '16:9', fit: 'cover', blur: 0, dim: 0, clean: false, folder: 'russian', delivery: 'file', crossfade: 0, source: { kind: 'file', name: 'a.png', size: 1, type: 'image', label: 'PNG' } };
  assert.deepEqual(studioRecipe({ ...recipe, news: { carnival: false, season: true } }).news, { carnival: false, season: true });
  assert.equal('news' in studioRecipe(recipe), false);
  assert.throws(() => studioRecipe({ ...recipe, news: { carnival: 'no', season: true } }));
});
