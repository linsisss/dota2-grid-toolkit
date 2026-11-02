const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const read = (file) => readFileSync(`assets/dota-menu/${file}`, 'utf8');
const modules = Promise.all([import('../scripts/menu-widgets.mjs'), import('../scripts/menu-background.mjs'), import('../scripts/vpk.mjs'), import('../scripts/md5.mjs')]);

test('a widget is kept inside the screen, under the top bar, with its type\'s fields only', async () => {
  const [w] = await modules;
  const clock = w.newWidget('clock', { x: 960, y: 300 });
  assert.equal(clock.type, 'clock');
  assert.deepEqual([clock.w, clock.h], w.WIDGET_TYPES.clock.size);
  assert.equal(clock.x, 960 - clock.w / 2);
  const out = w.cleanWidget({ ...clock, x: -50, y: 0, w: 99999, h: 5, props: { ...clock.props, color: 'red', evil: 1 }, anchor: 'zz', opacity: 0, extra: true });
  assert.equal(out.x, 0); assert.equal(out.y, w.WIDGET_SCREEN.top, 'never over Dota\'s top bar');
  assert.equal(out.w, w.WIDGET_SCREEN.width); assert.equal(out.h, w.WIDGET_TYPES.clock.min[1]);
  assert.equal(out.props.color, '#ffffff'); assert.equal(out.props.evil, undefined); assert.equal(out.extra, undefined);
  assert.equal(out.anchor, 'tl'); assert.equal(out.opacity, 5);
  const native = w.cleanWidget({ type: 'lastMatch', x: 10, y: 100, w: 10, h: 10 });
  assert.deepEqual([native.w, native.h], [340, 300], 'Dota draws its own panels at their own size');
  assert.equal(w.cleanWidget({ type: 'autopick' }), null, 'unknown types go');
  const many = w.cleanWidgets(Array.from({ length: 40 }, () => ({ ...clock })));
  assert.equal(many.length, w.WIDGET_LIMITS.count);
  assert.equal(new Set(many.map((item) => item.id)).size, many.length, 'ids stay unique');
});

test('a shortcut opens a page of Dota or an https page of the allowed sites, nothing else', async () => {
  const [w] = await modules;
  assert.equal(w.widgetLink('https://twitch.tv/dissonance'), 'https://twitch.tv/dissonance');
  assert.equal(w.widgetLink('https://www.youtube.com/watch?v=x'), 'https://www.youtube.com/watch?v=x');
  for (const bad of ['http://twitch.tv/x', 'https://evil.example/x', 'https://twitch.tv.evil.example/', 'javascript:alert(1)', "https://twitch.tv/a'b", 'https://user@twitch.tv/', 'https://twitch.tv:8443/'])
    assert.equal(w.widgetLink(bad), '', bad);
  const link = w.cleanWidget({ type: 'shortcut', x: 0, y: 100, w: 200, h: 50, props: { action: 'link', url: 'https://evil.example/', label: '' } });
  assert.equal(link.props.url, '');
  assert.equal(link.props.label, 'Ссылка', 'an empty label takes the action\'s name');
  assert.equal(w.cleanWidget({ type: 'shortcut', x: 0, y: 100, w: 200, h: 50, props: { action: 'select_hero' } }).props.action, 'armory');
});

test('the widgets as files: ASCII panels and style, the script carries the texts and is exactly ours', async () => {
  const [w] = await modules;
  const list = [w.newWidget('clock', { x: 960, y: 200 }), w.newWidget('text', { x: 400, y: 700 }), w.newWidget('shortcut', { x: 960, y: 900 }), w.newWidget('miniProfile', { x: 700, y: 500 }),
    w.newWidget('image', { x: 1500, y: 500 })];
  list[1].props.text = 'Привет, мир';
  list[2].props = { label: 'Стрим', action: 'link', url: 'https://twitch.tv/dissonance', style: 'accent', color: '#c4b5ed' };
  list[2].anchor = 'bc';
  const made = w.widgetsPanorama(list, { lang: 'ru' });
  assert.doesNotMatch(made.panels + made.style + made.script, /[^\x00-\x7f]/, 'Dota takes our classic files in ASCII only');
  assert.doesNotMatch(made.panels, /GSWImage/, 'an image without its texture is left out');
  assert.match(made.panels, /<DOTAMiniShowcase accountid="local" \/>/);
  assert.match(made.panels, /onactivate="\$\.DispatchEvent\( 'ExternalBrowserGoToURL', 'https:\/\/twitch\.tv\/dissonance' \);"/);
  assert.match(made.script, /\\u041f\\u0440\\u0438\\u0432\\u0435\\u0442/, 'the Cyrillic text goes through the script');
  assert.ok(w.widgetScriptData(made.script));
  assert.equal(w.widgetScriptData(made.script.replace('tick();', 'Game.ServerCmd("x"); tick();')), null, 'another code is refused');
  assert.equal(w.widgetScriptData(made.script.replace('"lang":"ru"', '"lang":"ru","run":"x"')), null, 'other data is refused');
  // A bottom-centre widget keeps its distance to the bottom and its offset from the middle.
  const bc = made.style.slice(made.style.indexOf(`#GSW_${list[2].id}\n`));
  assert.match(bc, /horizontal-align: center;[\s\S]*vertical-align: bottom;\n\tmargin-bottom: \d+px;\n\ttransform: translateX\( 0px \) translateY\( 0px \);|horizontal-align: center;[\s\S]*vertical-align: bottom;\n\tmargin-bottom: \d+px;/);
  assert.equal(w.widgetsPanorama([]), null);
  assert.equal(w.widgetsPanorama([{ ...list[0], hidden: true }]), null, 'hidden widgets stay out');
  // As the preview draws them (the first test in Dota, 2026-10-31; the look of 2026-11-02): the time over the weekday and
  // the date, stacked in the middle of the box; the timer's title over four cells and «Уже началось» in their place once
  // it is time; the «Панель» button with its colour's strip on the left, the words and an arrow.
  const timer = w.newWidget('timer', { x: 960, y: 500 }), panel = { ...list[2], props: { ...list[2].props, style: 'panel' } };
  const look = w.widgetsPanorama([list[0], timer, panel], { lang: 'ru' }), clockId = `GSW_${list[0].id}`, timerId = `GSW_${timer.id}`;
  assert.match(look.panels, new RegExp(`<Panel id="${clockId}_box" class="GSWStack" hittest="false"><Panel id="${clockId}_row" hittest="false"><Label id="${clockId}_time"[^>]*/></Panel><Panel id="${clockId}_dates" hittest="false"><Label id="${clockId}_day"`));
  assert.match(look.style, new RegExp(`#${clockId}_box\\n\\{\\n\\twidth: 100%;\\n\\tflow-children: down;\\n\\tvertical-align: center;`));
  assert.match(look.panels, new RegExp(`<Panel id="${timerId}_edge" hittest="false" /><Panel id="${timerId}_box" class="GSWStack"`), 'the card\'s line of colour');
  for (const unit of ['d', 'h', 'm', 's']) assert.match(look.panels, new RegExp(`<Label id="${timerId}_${unit}n" class="GSWNum"[^>]*/><Label id="${timerId}_${unit}c" class="GSWUnit"`));
  assert.match(look.style, new RegExp(`#${timerId}\\.GSWDone #${timerId}_segs\\n\\{\\n\\tvisibility: collapse;`));
  assert.match(look.panels, new RegExp(`<Button id="GSW_${panel.id}"[^>]*><Panel id="GSW_${panel.id}_bar" hittest="false" /><Label id="GSW_${panel.id}_label"[^>]*/><Panel id="GSW_${panel.id}_arrow" hittest="false" />`));
  assert.match(look.style, new RegExp(`#GSW_${panel.id}_arrow\\n\\{[^}]*transform: rotateZ\\( 0deg \\);`), 'a link\'s arrow points up and to the right');
  assert.match(look.script, /SetHasClass\( 'GSWDone'/);
  assert.ok(w.widgetScriptData(look.script));
  assert.doesNotMatch(look.style, /LowVisualQuality/, 'no video, no rule for videos');
  // Valve collapses the home page's MoviePanels at low visual quality (frontpage_shared.css): the widgets' videos stay.
  const video = { ...w.newWidget('video', { x: 960, y: 500 }) };
  video.props.media = 'a'.repeat(64);
  const withVideo = w.widgetsPanorama([video], { media: { [`video:${'a'.repeat(64)}`]: w.widgetMediaPath('video', 'a'.repeat(64)) } });
  assert.match(withVideo.style, /\.LowVisualQuality #GridStudioWidgets MoviePanel\n\{\n\tvisibility: visible;\n\}/);
});

test('the menu pack with widgets: our copy of the home page, the style, the script, and the server takes it', async () => {
  const [w, m, { readVPK, panoramaSource, buildVPK, panoramaResource }, { md5 }] = await modules;
  const { packProblem } = await import('../server/install-packs.mjs');
  const { readResource } = await import('../scripts/panorama-laco.mjs');
  const { buildZip } = await import('../scripts/zip.mjs');
  const { vtexResource } = await import('../scripts/dota-vtex.mjs');
  const { CUSTOMIZE_DIRS } = await import('../scripts/customize-pack.mjs');
  const hash = 'a'.repeat(64), path = w.widgetMediaPath('image', hash);
  const image = { path, data: await vtexResource({ path, rgba: new Uint8Array(8 * 8 * 4).fill(200), width: 8, height: 8 }) };
  const list = [w.newWidget('clock', { x: 960, y: 200 }), w.newWidget('shortcut', { x: 960, y: 900 }), { ...w.newWidget('image', { x: 1400, y: 500 }), props: { media: hash, fit: 'cover', radius: 8 } }];
  list[1].props = { label: 'Стрим', action: 'link', url: 'https://twitch.tv/dissonance', style: 'panel' };
  const made = w.widgetsPanorama(list, { media: { [`image:${hash}`]: path } });
  const pack = m.menuBackgroundPack({ video: null, dashboard: read('dashboard.xml'), home: read('dashboard_page_home.xml'), widgets: { made, media: [image] }, md5 });
  const files = Object.fromEntries(readVPK(pack).files.map((file) => [file.path, file.data]));
  assert.deepEqual(Object.keys(files).sort(), ['panorama/layout/dashboard_page_home.vxml_c', w.WIDGET_STYLE, w.WIDGET_SCRIPT, path].sort());
  const home = panoramaSource(files['panorama/layout/dashboard_page_home.vxml_c']);
  assert.match(home, /<include src="s2r:\/\/panorama\/scripts\/gridstudio_widgets\.vjs" \/>/, 'named as Valve names its scripts');
  assert.match(home, /<DOTAHomePage [^>]*>\n\t\t<Panel id="GridStudioWidgets" hittest="false">/);
  assert.match(home, new RegExp(`src="s2r://${path.replace(/_c$/, '').replace(/[.]/g, '\\.')}"`));
  const zip = async (data) => new Uint8Array(await (await buildZip([{ name: `${CUSTOMIZE_DIRS.russian}pak02_dir.vpk`, data }])).arrayBuffer());
  assert.equal(packProblem('all', await zip(pack)), '', 'the site\'s own widgets pass for the command');
  // Anything else under the widgets' names does not.
  const swap = (target, data) => buildVPK(readVPK(pack).files.map((file) => (file.path === target ? { path: target, data } : file)), { version: 2, md5 });
  // The script in Valve's new format (test 5 in Dota, 2026-11-02: the classic one no longer ran), exactly as the site makes it.
  const script = w.widgetScriptText(files[w.WIDGET_SCRIPT]);
  assert.ok(script && w.widgetScriptData(script));
  assert.equal(readResource(files[w.WIDGET_SCRIPT]).version, 4);
  assert.match(packProblem('all', await zip(swap(w.WIDGET_SCRIPT, w.widgetScriptFile(script.replace('tick();', 'Game.ServerCmd( "quit" ); tick();'))))), /скрипт/);
  assert.match(packProblem('all', await zip(swap(w.WIDGET_SCRIPT, panoramaResource(w.WIDGET_SCRIPT, script)))), /скрипт/, 'only the file the site makes');
  assert.match(packProblem('all', await zip(swap('panorama/layout/dashboard_page_home.vxml_c', panoramaResource('panorama/layout/dashboard_page_home.vxml_c', home.replace('https://twitch.tv/dissonance', 'https://evil.example/x'))))), /адрес|обработчик/);
  assert.match(packProblem('all', await zip(swap(path, new Uint8Array([1, 2, 3])))), /виджета/);
  assert.throws(() => m.menuBackgroundPack({ video: null, dashboard: read('dashboard.xml'), widgets: { made, media: [] }, md5 }), /dashboard_page_home/);
});

test('a widget of one\'s own: its design checked, placed at its proportions, its blocks scaled, and the server takes it', async () => {
  const [w, m, { readVPK, panoramaSource }, { md5 }] = await modules;
  const { packProblem } = await import('../server/install-packs.mjs');
  const { buildZip } = await import('../scripts/zip.mjs');
  const { CUSTOMIZE_DIRS } = await import('../scripts/customize-pack.mjs');
  const design = w.cleanDesign({ name: 'Стрим', size: [330, 484], background: '#0d0f18ee', radius: 8, blocks: [
    { ...w.newBlock('shape'), w: 330, h: 200, props: { fill: '#7c5cff', fill2: '#0d0f18', direction: 'down' } },
    { ...w.newBlock('text', { x: 20, y: 220 }), props: { text: 'Учу Invoker с нуля', size: 28 } },
    { ...w.newBlock('button', { x: 20, y: 420 }), anim: 'pulse', hover: true, props: { label: 'Смотреть стрим', action: 'link', url: 'https://twitch.tv/x' } },
    { ...w.newBlock('clock', { x: 20, y: 300 }), props: { seconds: true } }, { type: 'script', x: 0, y: 0 }, { ...w.newBlock('text'), x: 9000, y: -5 }] });
  assert.equal(design.blocks.length, 5, 'an unknown block goes');
  assert.deepEqual([design.blocks[4].x, design.blocks[4].y], [330 - design.blocks[4].w, 0], 'a block stays inside its design');
  const widget = w.cleanWidget({ ...w.designWidget(design, { designId: 'dstream' }), w: 495, h: 10 });
  assert.equal(widget.h, Math.round(495 * 484 / 330), 'the design\'s proportions');
  assert.equal(widget.props.designId, 'dstream');
  const made = w.widgetsPanorama([widget]);
  assert.doesNotMatch(made.panels + made.style + made.script, /[^\x00-\x7f]/);
  assert.match(made.style, new RegExp(`#GSW_${widget.id}_${design.blocks[1].id}\\n\\{\\n\\tx: 30px;\\n\\ty: 330px;\\n\\twidth: 330px;`), 'blocks scaled by 1.5');
  assert.match(made.style, /@keyframes 'GSWPulseAnim'/);
  for (const [, body] of made.style.matchAll(/@keyframes '[A-Za-z]+'\n\{([^]*?)\n\}/g))
    for (const [, prop] of body.matchAll(/([a-z0-9-]+):/g)) assert.ok(['opacity', 'transform', 'pre-transform-scale2d', 'brightness'].includes(prop), `Valve animates ${prop}`);
  assert.match(made.script, /"type":"bclock"/);
  assert.ok(w.widgetScriptData(made.script));
  const pack = m.menuBackgroundPack({ video: null, dashboard: read('dashboard.xml'), home: read('dashboard_page_home.xml'), widgets: { made, media: [] }, md5 });
  const zip = new Uint8Array(await (await buildZip([{ name: `${CUSTOMIZE_DIRS.russian}pak02_dir.vpk`, data: pack }])).arrayBuffer());
  assert.equal(packProblem('all', zip), '');
  assert.match(panoramaSource(readVPK(pack).files.find((file) => file.path.endsWith('home.vxml_c')).data), /class="GSWB GSWAnimPulse GSWHover GSWButton" onactivate="\$\.DispatchEvent\( 'ExternalBrowserGoToURL', 'https:\/\/twitch\.tv\/x' \);"/);
  assert.deepEqual(w.widgetMedia([widget]), []);
});

test('Dota\'s own blocks, sounds, tooltips and the new pages: as Valve\'s layouts have them, and the server takes them', async () => {
  const [w, m, { readVPK, panoramaSource }, { md5 }] = await modules;
  const { packProblem } = await import('../server/install-packs.mjs');
  const { buildZip } = await import('../scripts/zip.mjs');
  const { CUSTOMIZE_DIRS } = await import('../scripts/customize-pack.mjs');
  const design = w.cleanDesign({ name: 'Профиль', size: [400, 520], blocks: [
    { ...w.newBlock('avatar', { x: 10, y: 10 }), props: { radius: 48, border: '#c4b5ed', borderWidth: 2 } },
    { ...w.newBlock('nickname', { x: 120, y: 30 }), tip: 'Это мой ник' },
    { ...w.newBlock('hero', { x: 10, y: 120 }), props: { hero: 'invoker', view: 'model', rotate: true } },
    { ...w.newBlock('hero', { x: 260, y: 120 }), props: { hero: 'pudge', view: 'movie' } },
    { ...w.newBlock('hero', { x: 260, y: 300 }), w: 100, h: 140, props: { hero: 'not_a_hero', view: 'tank' } },
    { ...w.newBlock('button', { x: 10, y: 460 }), props: { label: 'Настройки', action: 'settings', sound: 'click', hoverSound: true } },
    { ...w.newBlock('button', { x: 240, y: 460 }), w: 150, props: { label: 'Боты', action: 'start_bot_match', sound: 'boom' } }] });
  assert.deepEqual(design.blocks.slice(2, 5).map((b) => [b.props.hero, b.props.view]), [['invoker', 'model'], ['pudge', 'movie'], ['lina', 'model']], 'only Dota\'s heroes and views');
  assert.deepEqual([design.blocks[6].props.action, design.blocks[6].props.sound], ['armory', ''], 'no unknown action or sound');
  assert.equal(design.blocks[1].tip, 'Это мой ник');
  assert.equal(w.cleanBlock({ ...w.newBlock('text'), tip: 'x'.repeat(500) }, [400, 400]).tip.length, w.BLOCK_LIMITS.tip);
  const widget = w.designWidget(design), made = w.widgetsPanorama([widget]), id = (b) => `GSW_${widget.id}_${b.id}`;
  assert.doesNotMatch(made.panels + made.style + made.script, /[^\x00-\x7f]/);
  assert.match(made.panels, new RegExp(`<DOTAAvatarImage id="${id(design.blocks[0])}" class="GSWB" steamid="local" nocompendiumborder="true" hittest="false" />`));
  assert.match(made.panels, new RegExp(`<Panel id="${id(design.blocks[1])}" class="GSWB" hittest="true"><DOTAUserName id="${id(design.blocks[1])}_n" steamid="local" hittest="false" /></Panel>`), 'a block with a tooltip takes the mouse');
  assert.match(made.panels, /<DOTAScenePanel [^>]*unit="npc_dota_hero_invoker" particleonly="false" antialias="true" drawbackground="false" allowrotation="true" hittest="true" \/>/);
  assert.match(made.panels, /<DOTAHeroMovie [^>]*heroname="pudge" heroimagestyle="portrait"/);
  assert.match(made.panels, /onactivate="DOTAShowSettingsRebornPopup\(\);"/);
  assert.match(made.style, new RegExp(`#${id(design.blocks[5])}:active\\n\\{\\n\\tsound: "ui_generic_button_click";\\n\\}`));
  assert.match(made.style, new RegExp(`#${id(design.blocks[5])}:hover\\n\\{\\n\\tsound: "ui_rollover_micro";\\n\\}`));
  assert.match(made.style, new RegExp(`#${id(design.blocks[0])} #AvatarImage\\n\\{\\n\\tborder-radius: 48px;`));
  const data = w.widgetScriptData(made.script);
  assert.deepEqual(data.items.filter((item) => item.type === 'tip'), [{ id: id(design.blocks[1]), type: 'tip', text: 'Это мой ник' }]);
  assert.match(made.script, /'UIShowTextTooltip', panel, item\.text/);
  assert.equal(w.widgetScriptData(made.script.replace('"type":"tip","text"', '"type":"tip","run":"x","text"')), null, 'a tooltip carries its words only');
  const pack = m.menuBackgroundPack({ video: null, dashboard: read('dashboard.xml'), home: read('dashboard_page_home.xml'), widgets: { made, media: [] }, md5 });
  const zip = new Uint8Array(await (await buildZip([{ name: `${CUSTOMIZE_DIRS.russian}pak02_dir.vpk`, data: pack }])).arrayBuffer());
  assert.equal(packProblem('all', zip), '');
  assert.match(panoramaSource(readVPK(pack).files.find((file) => file.path === w.WIDGET_STYLE).data), /sound: "ui_generic_button_click";/);
  for (const action of Object.values(w.WIDGET_ACTIONS)) if (action.call) assert.match(action.call, /^DOTA[A-Za-z]+\( ?(?:TopBar[A-Za-z]+|0)? ?\);$/, 'a page of Dota, nothing else');
});

test('the friends list closed on the home page: our copy closes it where Valve\'s opens it, and the server takes it', async () => {
  const [, m, { readVPK, panoramaSource }, { md5 }] = await modules;
  const { packProblem } = await import('../server/install-packs.mjs');
  const { buildZip } = await import('../scripts/zip.mjs');
  const { CUSTOMIZE_DIRS } = await import('../scripts/customize-pack.mjs');
  const { studioRecipe } = await import('../scripts/studio-background.mjs');
  const { lookMenu, lookParts } = await import('../scripts/customize-look.mjs').then((mod) => ({ lookMenu: mod.lookDocument, lookParts: mod.lookParts }));
  const home = read('dashboard_page_home.xml');
  assert.match(home, /onnavigatedto="DOTASetFriendsMenuVisible\( true \)"/, 'Valve\'s home page opens the list');
  const pack = m.menuBackgroundPack({ video: null, dashboard: read('dashboard.xml'), home, news: { carnival: true, season: true }, friendsClosed: true, md5 });
  const files = readVPK(pack).files;
  assert.deepEqual(files.map((file) => file.path), ['panorama/layout/dashboard_page_home.vxml_c'], 'the home page alone');
  const page = panoramaSource(files[0].data);
  assert.match(page, /onnavigatedto="DOTASetFriendsMenuVisible\( false \)"/);
  assert.match(page, /onnavigatedaway="DOTASetFriendsMenuVisible\( false \)"/);
  assert.match(page, /<Panel id="TodayPages"/, 'the news stay');
  const zip = new Uint8Array(await (await buildZip([{ name: `${CUSTOMIZE_DIRS.russian}pak02_dir.vpk`, data: pack }])).arrayBuffer());
  assert.equal(packProblem('all', zip), '');
  const both = panoramaSource(readVPK(m.menuBackgroundPack({ video: null, dashboard: read('dashboard.xml'), home, news: { carnival: false, season: false }, friendsClosed: true, md5 })).files[0].data);
  assert.ok(!both.includes('id="TodayPages"') && both.includes('DOTASetFriendsMenuVisible( false )"'), 'with the news column gone too');
  assert.equal(m.menuBackgroundPack({ video: null, dashboard: read('dashboard.xml'), home, news: { carnival: true, season: true }, md5 }), null, 'off: nothing to change');
  assert.throws(() => m.friendsClosedPage(home.replace('( true )', '( 1 )')), /список друзей/);
  const recipe = { aspect: '16:9', fit: 'cover', blur: 0, dim: 0, clean: false, folder: 'russian', delivery: 'file', crossfade: 0, source: { kind: 'workshop', id: 3, title: 'x' } };
  assert.equal(studioRecipe({ ...recipe, friendsClosed: true }).friendsClosed, true);
  assert.equal(studioRecipe(recipe).friendsClosed, undefined);
  assert.equal(studioRecipe({ ...recipe, profileBg: 'dim' }).profileBg, 'dim', 'the profile\'s background is kept too');
  assert.throws(() => studioRecipe({ ...recipe, friendsClosed: 'yes' }));
  const look = lookMenu({ format: 'gridstudio-dota', version: 1, menu: { buttons: { friendsClosed: true } } });
  assert.equal(look.menu.buttons.friendsClosed, true);
  assert.deepEqual(lookParts(look), ['buttons'], 'the menu\'s buttons are changed');
});

test('the editor\'s templates: their blocks kept as made, Dota\'s look (no neon, nothing pulsing), and the server takes them', async () => {
  const [w, m, , { md5 }] = await modules;
  const { WIDGET_TEMPLATES, templateDesign } = await import('../src/constructor/widget-templates.js');
  const { packProblem } = await import('../server/install-packs.mjs');
  const { buildZip } = await import('../scripts/zip.mjs');
  const { CUSTOMIZE_DIRS } = await import('../scripts/customize-pack.mjs');
  const templates = WIDGET_TEMPLATES();
  assert.ok(templates.length >= 4);
  const widgets = [];
  for (const template of templates) {
    const raw = template.design(), design = templateDesign(template);
    assert.equal(design.blocks.length, raw.blocks.length, template.id);
    design.blocks.forEach((b, i) => assert.deepEqual([b.x, b.y, b.w, b.h], [raw.blocks[i].x, raw.blocks[i].y, raw.blocks[i].w, raw.blocks[i].h], `${template.id}: a block where it was put`));
    assert.ok(design.blocks.every((b) => b.anim !== 'pulse'), `${template.id}: nothing pulses`);
    assert.ok(design.blocks.every((b) => !['#7c5cff', '#c4b5ed'].includes(b.props.fill)), `${template.id}: no purple`);
    widgets.push(w.designWidget(design));
  }
  const made = w.widgetsPanorama(widgets, { lang: 'ru' });
  assert.doesNotMatch(made.panels + made.style + made.script, /[^\x00-\x7f]/);
  const pack = m.menuBackgroundPack({ video: null, dashboard: read('dashboard.xml'), home: read('dashboard_page_home.xml'), widgets: { made, media: [] }, md5 });
  const zip = new Uint8Array(await (await buildZip([{ name: `${CUSTOMIZE_DIRS.russian}pak02_dir.vpk`, data: pack }])).arrayBuffer());
  assert.equal(packProblem('all', zip), '');
});

test('Valve\'s panels set by hand: the chat by its margins, the tabs in their order, the news cards smaller or small icons', async () => {
  const [, m, { readVPK, panoramaSource }, { md5 }] = await modules;
  const { packProblem } = await import('../server/install-packs.mjs');
  const { buildZip } = await import('../scripts/zip.mjs');
  const { CUSTOMIZE_DIRS } = await import('../scripts/customize-pack.mjs');
  const base = { video: null, dashboard: read('dashboard.xml'), home: read('dashboard_page_home.xml'), frontpage: read('frontpage_contents.css'), contents: read('frontpage_contents.xml'),
    banners: { carnival: read('front_page_dark_carnival.xml'), season: read('front_page_seasonal_reward_line.xml') }, news: { carnival: true, season: true }, md5 };
  const build = (valve, extra = {}) => { const pack = m.menuBackgroundPack({ ...base, ...extra, valve }); return pack && Object.fromEntries(readVPK(pack).files.map((f) => [f.path, panoramaSource(f.data)])); };
  const passes = async (valve, extra) => { const pack = m.menuBackgroundPack({ ...base, ...extra, valve }); const zip = new Uint8Array(await (await buildZip([{ name: `${CUSTOMIZE_DIRS.russian}pak02_dir.vpk`, data: pack }])).arrayBuffer()); return packProblem('all', zip); };
  assert.equal(build(m.MENU_VALVE), null, 'as in Dota: nothing to change');
  assert.deepEqual(m.menuValve({ chat: { x: 9999, y: 'up' }, tabs: ['mods', 'heroes'], cards: { carnival: { icon: 'yes', scale: 5, size: 999 } } }),
    { chat: { x: 640, y: 0 }, friends: { x: 0, y: 0 }, news: { x: 0, y: 0 }, tabs: [...m.MENU_TABS], cards: { carnival: { icon: false, scale: 40, size: 160 }, season: { icon: false, scale: 100, size: 96 } } }, 'kept within its limits');
  // The friends rail with the party bar in the dashboard's style; the news column in the home page's; «Играть» stays (test 10).
  const moves = build({ friends: { x: 200, y: -40 }, play: { x: -100, y: -300 }, news: { x: -500, y: 120 } });
  assert.doesNotMatch(moves[m.MENU_LAYOUT_STYLE], /#Play\b/);
  assert.match(moves[m.MENU_LAYOUT_STYLE], /#FriendMenuContainer\n\{\n\tmargin-left: 232px;\n\tmargin-bottom: 130px;\n\}/);
  assert.match(moves[m.MENU_LAYOUT_STYLE], /#SocialControls\n\{\n\tmargin-left: 232px;\n\tmargin-bottom: 61px;\n\}/);
  assert.match(moves['panorama/layout/dashboard_page_home.vxml_c'], new RegExp(`<include src="s2r://${m.HOME_STYLE}" />`));
  assert.match(moves[m.HOME_STYLE], /#FrontpageContents\n\{\n\tmargin-right: 500px;\n\tmargin-top: 120px;\n\}/);
  assert.equal(await passes({ friends: { x: 200, y: -40 }, news: { x: -500, y: 120 } }), '');
  // The tabs: Valve's own markup moved, after the Dota logo.
  const tabs = build({ tabs: ['collection', 'heroes', 'mods', 'watch', 'learn'] });
  assert.deepEqual(Object.keys(tabs), ['panorama/layout/dashboard.vxml_c']);
  assert.deepEqual([...tabs['panorama/layout/dashboard.vxml_c'].matchAll(/<RadioButton id="(TopBar\w+)"/g)].map((x) => x[1]).slice(0, 6), ['TopBarHome', 'TopBarCollection', 'TopBarHeroes', 'TopBarMods', 'TopBarWatch', 'TopBarLearn']);
  // The chat: margins, so Valve's own transforms (the play panel) still move it.
  const chat = build({ chat: { x: -150, y: -60 } });
  assert.match(chat['panorama/layout/dashboard.vxml_c'], new RegExp(`<include src="s2r://${m.MENU_LAYOUT_STYLE}" />`));
  assert.match(chat[m.MENU_LAYOUT_STYLE], /\.AspectRatio16x10\.NoEmbedChatInPage #Chat,\n\.AspectRatio4x3\.NoEmbedChatInPage #Chat\n\{\n\tmargin-left: 0px;\n\tmargin-right: 328px;\n\tmargin-bottom: 190px;/);
  assert.doesNotMatch(chat[m.MENU_LAYOUT_STYLE], /transform/);
  // The cards: smaller towards the top right corner, the next one under it; or our small icons with the cards' own calls.
  const small = build({ cards: { carnival: { scale: 50 } } });
  assert.match(small[m.NEWS_STYLE], /\.TopCell\n\{\n\tpre-transform-scale2d: 0\.50;\n\ttransform: translateX\( 83px \) translateY\( -121px \);\n\}/, 'its top right corner kept (Panorama scales about the middle)');
  assert.match(small[m.NEWS_STYLE], /#QuarteroCell\n\{\n\ty: 258px;\n\}/);
  const icons = build({ cards: { carnival: { icon: true, size: 90 }, season: { icon: true, size: 100 } } });
  assert.match(icons[m.NEWS_LAYOUT], /<Button id="GSCarnivalIcon" class="GSNewsIcon" onactivate="DOTAShowDarkCarnivalOverworldPage\( \d+ \)"><Image class="GSNewsIconArt" src="s2r:\/\/panorama\/images\/[^"]+\.vtex"/);
  assert.match(icons[m.NEWS_LAYOUT], /<Button id="GSSeasonIcon"[^>]*onactivate="DOTAShowSeasonalRewardsPage\( EVENT_ID_\w+ \)"><Image [^>]*\/><DOTAEventStatus class="Quartero" eventID="EVENT_ID_\w+"/);
  assert.doesNotMatch(icons[m.NEWS_LAYOUT], /DOTAFrontpageCellDarkCarnival|QuarteroCell/);
  assert.match(icons[m.NEWS_STYLE], /#GSSeasonIcon\n\{\n\ty: 102px;\n\tx: 230px;\n\twidth: 100px;\n\theight: 100px;/, 'at the cards\' right edge');
  const hiddenIcon = build({ cards: { carnival: { icon: true } } }, { news: { carnival: false, season: true } });
  assert.deepEqual(Object.keys(hiddenIcon), [m.NEWS_STYLE], 'a hidden card is no icon: only hidden');
  for (const valve of [{ tabs: ['mods', 'learn', 'watch', 'collection', 'heroes'], chat: { x: 40, y: -300 } }, { cards: { carnival: { icon: true }, season: { scale: 60 } } }]) assert.equal(await passes(valve), '', JSON.stringify(valve));
  assert.throws(() => m.menuBackgroundPack({ ...base, contents: null, valve: { cards: { season: { icon: true } } } }), /значк/);
});

test('«Последний матч»: GridStudio\'s card only for the panels of that look, Dota\'s own beside it (test 10)', async () => {
  const [w, m, { readVPK, panoramaSource }, { md5 }] = await modules;
  const card = { ...w.newWidget('lastMatch'), x: 400, y: 300 }, dota = { ...w.newWidget('lastMatch'), x: 800, y: 300, props: { look: 'dota' } };
  const made = w.widgetsPanorama([card, dota]);
  assert.match(made.panels, new RegExp(`<Panel id="GSW_${card.id}"[^>]*><DOTAFrontpageLastMatch class="GSWCard" /></Panel>`));
  assert.match(made.panels, new RegExp(`<Panel id="GSW_${dota.id}"[^>]*><DOTAFrontpageLastMatch /></Panel>`));
  const pack = m.menuBackgroundPack({ video: null, dashboard: read('dashboard.xml'), home: read('dashboard_page_home.xml'), lastmatch: read('frontpage_lastmatch.css'), widgets: { made, media: [] }, md5 });
  const style = panoramaSource(readVPK(pack).files.find((f) => f.path === w.LASTMATCH_STYLE).data), ours = style.slice(style.indexOf('/* GridStudio'));
  assert.ok(style.startsWith(read('frontpage_lastmatch.css').trimEnd()), 'Valve\'s stylesheet first');
  for (const [, selector] of ours.matchAll(/\n([^\n{}\t][^\n{}]*)\n\{/g)) assert.match(selector, /^DOTAFrontpageLastMatch\.GSWCard\b/, selector);
  assert.equal(w.widgetsPanorama([dota]).lastMatch, false, 'only Dota\'s look: Valve\'s stylesheet stays');
});

test('«Мой профиль»: no call of the button\'s own, the script opens the profile with the local avatar\'s account (test 9)', async () => {
  const [w] = await modules;
  const shortcut = { ...w.newWidget('shortcut'), props: { ...w.newWidget('shortcut').props, action: 'profile', label: 'Мой профиль' } };
  const design = w.cleanDesign({ size: [300, 100], blocks: [{ ...w.newBlock('button'), props: { ...w.newBlock('button').props, action: 'profile' } }] });
  const made = w.widgetsPanorama([shortcut, w.designWidget(design)]);
  assert.doesNotMatch(made.panels, /onactivate="DOTAShow(Showcase|Profile)Page/, 'Valve\'s call from our Button opened nothing');
  assert.equal((made.panels.match(/<DOTAAvatarImage id="GSWAccount" accountid="local" hittest="false" \/>/g) || []).length, 1, 'one avatar for the account');
  assert.match(made.style, /#GSWAccount\n\{\n\twidth: 1px;\n\theight: 1px;\n\topacity: 0;/);
  assert.deepEqual(w.widgetScriptData(made.script).items.filter((item) => item.type === 'profile').length, 2);
  assert.match(made.script, /\$\.DispatchEvent\( 'DOTAShowShowcasePage', account \)/);
  assert.doesNotMatch(w.widgetsPanorama([w.newWidget('shortcut')]).panels, /GSWAccount/, 'no avatar without the button');
});

test('«Мастерская виджетов» over HTTP: files by hash, signed-in sharing, moderation, likes, the gallery', async (t) => {
  const [w] = await modules;
  const { createHash } = require('node:crypto');
  const { mkdtempSync, rmSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const { join } = require('node:path');
  const [{ CatalogStore }, { createCatalogAPI }] = await Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs')]);
  const store = new CatalogStore(':memory:', 'test-widgets'), dir = mkdtempSync(join(tmpdir(), 'gs-widgets-'));
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-widgets', admins: new Set(['3003']), database: ':memory:', widgetMedia: dir };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const signIn = (telegram, where) => { const login = accounts.begin(where, where); accounts.candidate(login.id, { id: telegram, first_name: 'A', is_bot: false }); accounts.approve(login.id, telegram, true); return `gs_account=${accounts.finish(login.id, login.verifier, String(telegram)).session}`; };
  const call = async (path, { method = 'GET', body, bytes, cookie = '' } = {}) => {
    const response = await fetch(base + path, { method, headers: { Origin: config.origin, Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : bytes ? { 'Content-Type': 'application/octet-stream' } : {}) }, ...(body ? { body: JSON.stringify(body) } : bytes ? { body: bytes } : {}) });
    const type = response.headers.get('content-type') || '';
    return { status: response.status, body: method === 'HEAD' ? null : type.startsWith('application/json') ? await response.json() : new Uint8Array(await response.arrayBuffer()), type };
  };
  const alice = signIn(2001, 'a'), bob = signIn(2002, 'b'), admin = signIn(3003, 'c');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]), hash = createHash('sha256').update(png).digest('hex');
  assert.equal((await call(`/widget-media/${hash}`, { method: 'PUT', bytes: png })).status, 401, 'files only from signed-in authors');
  assert.equal((await call(`/widget-media/${'0'.repeat(64)}`, { method: 'PUT', bytes: png, cookie: alice })).status, 400, 'the hash must be the file\'s');
  const exe = Buffer.from('MZ\x90\x00 not a picture'), exeHash = createHash('sha256').update(exe).digest('hex');
  assert.equal((await call(`/widget-media/${exeHash}`, { method: 'PUT', bytes: exe, cookie: alice })).status, 415);
  assert.equal((await call(`/widget-media/${hash}`, { method: 'PUT', bytes: png, cookie: alice })).status, 201);
  const file = await call(`/widget-media/${hash}`);
  assert.equal(file.type, 'image/png'); assert.equal(Buffer.compare(Buffer.from(file.body), png), 0);
  const design = { name: 'Стрим', size: [330, 484], blocks: [{ ...w.newBlock('image'), props: { media: hash } }, { ...w.newBlock('text'), props: { text: 'Сегодня в эфире' } }] };
  assert.equal((await call('/widgets', { method: 'POST', body: { design } })).status, 401);
  assert.equal((await call('/widgets', { method: 'POST', cookie: alice, body: { design: { ...design, blocks: [{ ...w.newBlock('image'), props: { media: 'f'.repeat(64) } }] } } })).status, 409, 'its files first');
  const sent = await call('/widgets', { method: 'POST', cookie: alice, body: { design } });
  assert.equal(sent.status, 201); assert.equal(sent.body.status, 'pending');
  assert.equal((await call('/widgets', { method: 'POST', cookie: alice, body: { design } })).status, 409, 'the same design waits already');
  assert.deepEqual((await call('/widgets')).body.items, [], 'pending widgets are not in the gallery');
  assert.equal((await call('/widgets', { cookie: alice })).body.own[0].status, 'pending', 'the author sees their own');
  assert.equal((await call(`/widgets/${sent.body.id}`, { cookie: bob })).status, 404);
  assert.equal((await call(`/admin/widgets/${sent.body.id}`, { method: 'POST', cookie: bob, body: { action: 'approve' } })).status, 403);
  assert.equal((await call('/admin/widgets', { cookie: admin })).body.counts.pending, 1);
  assert.equal((await call('/admin/summary', { cookie: admin })).body.counts.widgets.pending, 1, 'the admin panel\'s badge');
  assert.equal((await call('/admin/widgets?q=%D1%81%D1%82%D1%80%D0%B8%D0%BC', { cookie: admin })).body.total, 1, 'searched by name');
  assert.equal((await call(`/widget-media/${hash}`, { method: 'HEAD' })).status, 200);
  assert.equal((await call(`/widget-media/${'e'.repeat(64)}`, { method: 'HEAD' })).status, 404);
  // A moderator may approve or turn down widgets too.
  const carol = signIn(2004, 'd'), carolId = (await call('/auth/me', { cookie: carol })).body.user.id;
  store.run('INSERT INTO moderators(account,created) VALUES(?,?)', carolId, Date.now());
  assert.equal((await call('/admin/widgets', { cookie: carol })).status, 200);
  assert.equal((await call(`/admin/widgets/${sent.body.id}`, { method: 'POST', cookie: carol, body: { action: 'hide' } })).status, 403, 'only approve or reject');
  assert.equal((await call(`/admin/widgets/${sent.body.id}`, { method: 'POST', cookie: admin, body: { action: 'approve' } })).body.status, 'approved');
  const gallery = (await call('/widgets', { cookie: bob })).body.items;
  assert.match(gallery[0].creator.key, /^[A-Za-z0-9_-]{12}$/, 'the author\'s profile');
  assert.equal(gallery.length, 1); assert.equal(gallery[0].design.blocks[1].props.text, 'Сегодня в эфире'); assert.equal(gallery[0].liked, false);
  assert.equal((await call(`/widgets/${sent.body.id}/like`, { method: 'POST', cookie: alice, body: { liked: true } })).status, 403, 'not one\'s own');
  assert.equal((await call(`/widgets/${sent.body.id}/like`, { method: 'POST', cookie: bob, body: { liked: true } })).body.likes, 1);
  assert.equal((await call(`/widgets/${sent.body.id}/use`, { method: 'POST' })).status, 200);
  assert.equal((await call(`/widgets/${sent.body.id}`)).body.uses, 1);
  assert.equal((await call(`/widgets/${sent.body.id}`, { method: 'DELETE', cookie: bob })).status, 404, 'only the author deletes');
  assert.equal((await call(`/widgets/${sent.body.id}`, { method: 'DELETE', cookie: alice })).status, 200);
  assert.deepEqual((await call('/widgets')).body.items, []);
});
