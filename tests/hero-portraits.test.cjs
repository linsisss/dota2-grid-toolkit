const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const md5 = (bytes) => new Uint8Array(createHash('md5').update(bytes).digest());
// A WebM's start (EBML header with the «webm» doc type), enough for the checks.
const webm = (size = 3000) => { const bytes = new Uint8Array(size); bytes.set([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84, ...new TextEncoder().encode('webm')]); return bytes; };
const fill = (w, h, value) => new Uint8Array(w * h * 4).fill(value);

// «Портреты героев» (scripts/hero-portraits.mjs, 2026-10-22).

test('the heroes and the files a portrait replaces', async () => {
  const { portraitPaths, portraitHeroIds, PORTRAIT_FILES, portraitName } = await import('../scripts/hero-portraits.mjs');
  const { default: D } = await import('../scripts/data.mjs');
  assert.equal(portraitHeroIds.length, D.heroes.filter((hero) => hero.id !== 127).length, 'every hero of the site but «Мишень»');
  assert.equal(portraitName(8), 'juggernaut');
  assert.deepEqual(portraitPaths(8), {
    card: ['panorama/images/heroes/selection/npc_dota_hero_juggernaut_png.vtex_c', 'panorama/images/heroes/selection/npc_dota_hero_juggernaut_alt1_png.vtex_c', 'panorama/images/heroes/selection/npc_dota_hero_juggernaut_alt2_png.vtex_c'],
    wide: ['panorama/images/heroes/npc_dota_hero_juggernaut_png.vtex_c', 'panorama/images/heroes/npc_dota_hero_juggernaut_alt1_png.vtex_c', 'panorama/images/heroes/npc_dota_hero_juggernaut_alt2_png.vtex_c'],
    icon: ['panorama/images/heroes/icons/npc_dota_hero_juggernaut_png.vtex_c', 'panorama/images/heroes/icons/npc_dota_hero_juggernaut_alt1_png.vtex_c', 'panorama/images/heroes/icons/npc_dota_hero_juggernaut_alt2_png.vtex_c'],
    movie: ['panorama/videos/heroes/npc_dota_hero_juggernaut.webm']
  });
  assert.ok(portraitPaths(1).movie.includes('panorama/videos/heroes/npc_dota_hero_antimage_persona1.webm'), 'a persona’s movie too');
  assert.ok(!PORTRAIT_FILES.has('panorama/images/heroes/npc_dota_hero_shadow_png.vtex_c'));
  assert.throws(() => portraitPaths(127));
});

test('framing: every place cuts its shape around one centre, inside the picture', async () => {
  const { cropRect, movieRect, dragCrop } = await import('../scripts/hero-portraits.mjs');
  const card = cropRect(1920, 1080, 142, 188, { x: 0.5, y: 0.5, zoom: 1 });
  assert.ok(Math.abs(card.h - 1080) < 1e-9 && Math.abs(card.w - 1080 * 142 / 188) < 1e-9 && Math.abs(card.x + card.w / 2 - 960) < 1e-9, 'a wide picture: full height, the middle');
  const corner = cropRect(1000, 1000, 128, 72, { x: 0, y: 0, zoom: 2 });
  assert.deepEqual([corner.x, corner.y], [0, 0], 'never past the edge');
  assert.ok(Math.abs(corner.w - 500) < 1e-9);
  for (const crop of [{ x: 0.5, y: 0.5, zoom: 1 }, { x: 0.1, y: 0.9, zoom: 2.5 }, { x: 1, y: 0, zoom: 6 }])
    assert.deepEqual(movieRect(1920, 1080, crop), cropRect(1920, 1080, 142, 188, crop), 'the movie is drawn from exactly the card’s cut');
  const moved = dragCrop({ x: 0.5, y: 0.5, zoom: 2 }, 1000, 1000, 142, 188, 10, 0);
  assert.ok(moved.x < 0.5 && moved.y === 0.5, 'dragging right shows more of the left');
});

// What Dota does with the pictures (measured 22.10.2026 on Valve's files and the owner's screenshots).
test('the hover movie: the card’s cut stretched to the square, as Valve’s movies are', async () => {
  const { movieRect, PORTRAIT_MOVIE, PORTRAIT_PLACES, HOVER_CARD } = await import('../scripts/hero-portraits.mjs');
  // Valve's Juggernaut: his 142 × 188 card maps onto his 256 × 256 movie's first frame with x × 256/142,
  // y × 256/188 and no offset (registered to NCC 0.995: 284 × 376 → 0.90, 0.68 per pixel, origin 0.25, −0.6).
  assert.ok(Math.abs(2 * 0.9 - PORTRAIT_MOVIE.side / PORTRAIT_PLACES.card.width) < 0.01 && Math.abs(2 * 0.68 - PORTRAIT_MOVIE.side / PORTRAIT_PLACES.card.height) < 0.01);
  // Ours: a picture's point lands where the card puts it, at the card's place in the movie, both ways.
  const source = [1600, 900], crop = { x: 0.62, y: 0.35, zoom: 1.7 }, r = movieRect(...source, crop);
  const toMovie = ([x, y]) => [(x - r.x) * PORTRAIT_MOVIE.side / r.w, (y - r.y) * PORTRAIT_MOVIE.side / r.h];
  const toCard = ([x, y]) => [(x - r.x) * PORTRAIT_PLACES.card.width / r.w, (y - r.y) * PORTRAIT_PLACES.card.height / r.h];
  for (const point of [[r.x, r.y], [r.x + r.w, r.y + r.h], [1000, 300]]) {
    const [mx, my] = toMovie(point), [cx, cy] = toCard(point);
    // Dota stretches the movie over the 151 × 200 hover card; the card picture covers the same box.
    const hoverFromMovie = [mx * HOVER_CARD.width / PORTRAIT_MOVIE.side, my * HOVER_CARD.height / PORTRAIT_MOVIE.side];
    const hoverFromCard = [cx * HOVER_CARD.width / PORTRAIT_PLACES.card.width, cy * HOVER_CARD.height / PORTRAIT_PLACES.card.height];
    assert.ok(Math.hypot(hoverFromMovie[0] - hoverFromCard[0], hoverFromMovie[1] - hoverFromCard[1]) < 1e-9, `${point}: the hover shows the card, nothing stretched or moved`);
  }
  // The card's shape is the hover's shape (no visible stretch between them: < 0.1 %).
  assert.ok(Math.abs(PORTRAIT_PLACES.card.width / PORTRAIT_PLACES.card.height / (HOVER_CARD.width / HOVER_CARD.height) - 1) < 0.001);
});

test('the grid card: the picture’s whole height, the middle 76 % of its width', async () => {
  const { gridCardRect, coverRect, GRID_CARD } = await import('../scripts/hero-portraits.mjs');
  const { default: C } = await import('../scripts/core.mjs');
  const { DOTA } = await import('../scripts/dota-rendering.mjs');
  const r = gridCardRect();
  assert.ok(Math.abs(r.h - 188) < 1e-9 && Math.abs(r.y) < 1e-9, 'whole height');
  assert.ok(Math.abs(r.w - 188 * 43 / 75) < 1e-9 && Math.abs(r.x + r.w / 2 - 71) < 1e-9, 'the middle');
  assert.ok(Math.abs(r.w / 142 - 0.759) < 0.001);
  // The grid's card shape is the editor's (core.heroLayout: 51 × 83 cells, 4 px margins) at any size.
  const layout = C.heroLayout({ w: 400, h: 200, heroIds: [1, 2, 3, 4, 5, 6, 7] });
  assert.ok(Math.abs(layout.cardW / layout.cardH - GRID_CARD.width / GRID_CARD.height) < 1e-9);
  assert.equal(DOTA.cellWidth - 8, GRID_CARD.width); assert.equal(DOTA.cellHeight - 8, GRID_CARD.height);
  // The owner's Keeper of the Light (22.10.2026): his card in the game, 58 × 103 px, registered onto the
  // site's hover card of the same picture, 104 × 138 px: one scale both ways (1.3475 × 1.345, NCC 0.93) and
  // the same rows. So the cards differ only by height (138 / 103) and by the sides the grid card cuts.
  const measured = { scale: 1.345, game: [58, 103], site: [104, 138] };
  assert.ok(Math.abs(measured.site[1] / measured.game[1] - measured.scale) < 0.01, 'whole height in both');
  assert.ok(Math.abs(measured.game[0] * measured.scale / measured.site[0] - r.w / 142) < 0.02, 'the game card holds the middle 76 %');
  // A wide place shows the picture's whole width and its middle rows.
  const wide = coverRect(142, 188, 128, 72);
  assert.ok(Math.abs(wide.w - 142) < 1e-9 && Math.abs(wide.y + wide.h / 2 - 94) < 1e-9);
});

test('Panorama’s saturation: toward the brightest channel in linear light, not toward grey', async () => {
  const { panoramaSaturation } = await import('../scripts/hero-portraits.mjs');
  const one = (rgb, amount = 0.7) => [...panoramaSaturation(new Uint8ClampedArray([...rgb, 255]), amount).slice(0, 3)];
  assert.deepEqual(one([200, 30, 40]).slice(0, 1), [200], 'the brightest channel stays');
  const [, g, b] = one([200, 30, 40]);
  assert.ok(g > 90 && b > 90, `a deep red turns pink (${g}, ${b}), as the owner’s card did`);
  assert.deepEqual(one([90, 90, 90]), [90, 90, 90], 'grey stays');
  assert.deepEqual(one([12, 200, 77], 1), [12, 200, 77], 'saturation 1 changes nothing');
  assert.deepEqual(one([12, 200, 77], 0), [200, 200, 200], 'saturation 0: the brightest channel everywhere');
  const pixels = new Uint8ClampedArray([10, 20, 30, 7]);
  panoramaSaturation(pixels);
  assert.equal(pixels[3], 7, 'alpha stays');
});

test('the state: only what can be built, the rest dropped', async () => {
  const { portraitsState, PORTRAIT_LIMITS } = await import('../scripts/hero-portraits.mjs');
  const media = 'ab'.repeat(32);
  assert.deepEqual(portraitsState({ heroes: [{ hero: 8, kind: 'video', source: { name: 'a.mp4', size: 10, type: 'video/mp4', media }, crop: { x: 2, y: -1, zoom: 99 }, start: 1.5 },
    { hero: 8, kind: 'image' }, { hero: 127 }, { hero: 'x' }, null] }),
  { heroes: [{ hero: 8, kind: 'video', source: { name: 'a.mp4', size: 10, type: 'video/mp4', media }, crop: { x: 1, y: 0, zoom: PORTRAIT_LIMITS.zoom[1] }, start: 1.5 }] });
  assert.deepEqual(portraitsState(null), { heroes: [] });
  assert.equal(portraitsState({ heroes: [{ hero: 1, source: { media: 'nope' } }] }).heroes[0].source.media, undefined);
});

test('the pack: Valve’s sizes at Valve’s paths, variants share one copy, and the server takes only that', async () => {
  const { heroPortraitsPack, portraitsPackProblem, portraitPaths, PORTRAIT_PLACES } = await import('../scripts/hero-portraits.mjs');
  const { readVPK, buildVPK } = await import('../scripts/vpk.mjs');
  const { readVtex, vtexResource } = await import('../scripts/dota-vtex.mjs');
  const { packProblem } = await import('../server/install-packs.mjs');
  const { buildZip } = await import('../scripts/zip.mjs');
  const { CUSTOMIZE_DIRS, CUSTOMIZE_PAKS } = await import('../scripts/customize-pack.mjs');
  const item = (hero, movie = webm()) => ({ hero, card: fill(142, 188, 90), wide: fill(128, 72, 120), icon: fill(32, 32, 200), movie });
  const pack = await heroPortraitsPack([item(8), item(14, webm(5000))], { md5 });
  const { files } = readVPK(pack);
  const expected = [...Object.values(portraitPaths(8)).flat(), ...Object.values(portraitPaths(14)).flat()];
  assert.deepEqual(files.map((file) => file.path).sort(), expected.sort());
  for (const file of files) {
    if (file.path.endsWith('.webm')) continue;
    const kind = file.path.includes('/selection/') ? 'card' : file.path.includes('/icons/') ? 'icon' : 'wide', texture = readVtex(file.data);
    assert.deepEqual([texture.width, texture.height], [PORTRAIT_PLACES[kind].width, PORTRAIT_PLACES[kind].height], file.path);
  }
  const offsets = files.filter((file) => file.path.includes('/selection/npc_dota_hero_juggernaut')).map((file) => file.offset);
  assert.equal(new Set(offsets).size, 1, 'Juggernaut’s three cards are one copy');
  assert.equal(portraitsPackProblem(pack), '');
  assert.equal(await heroPortraitsPack([], { md5 }), null);
  await assert.rejects(heroPortraitsPack([{ ...item(8), movie: new Uint8Array(10) }], { md5 }), /видео/);

  // The one file with it passes the command's check; anything else at those places does not.
  const zip = async (entries) => new Uint8Array(await (await buildZip(entries)).arrayBuffer());
  const name = `${CUSTOMIZE_DIRS.russian}${CUSTOMIZE_PAKS.portraits}`;
  assert.equal(packProblem('all', await zip([{ name, data: pack }, { name: 'ПРОЧТИ.txt', data: 'текст' }])), '');
  const card = portraitPaths(8).card[0], picture = (width, height, format = 'png') => vtexResource({ path: card, rgba: fill(width, height, 1), width, height, format, flags: PORTRAIT_PLACES.card.flags });
  const refused = {
    'another game file': [{ path: 'panorama/layout/dashboard.vxml_c', data: new Uint8Array(40) }],
    'a picture of another hero name': [{ path: 'panorama/images/heroes/selection/npc_dota_hero_evil_png.vtex_c', data: await picture(142, 188) }],
    'a card of the wrong size': [{ path: card, data: await picture(284, 376) }],
    'a card in the wrong format': [{ path: card, data: await picture(142, 188, 'bgra') }],
    'a card that is not a texture': [{ path: card, data: new TextEncoder().encode('MZ'.repeat(40)) }],
    'a movie that is not a WebM': [{ path: portraitPaths(8).movie[0], data: new Uint8Array(4000) }],
    'a movie too big': [{ path: portraitPaths(8).movie[0], data: webm(4_000_001) }]
  };
  for (const [why, entries] of Object.entries(refused)) {
    const bad = buildVPK(entries, { md5 });
    assert.notEqual(portraitsPackProblem(bad), '', why);
    assert.notEqual(packProblem('all', await zip([{ name, data: bad }])), '', `${why} (the one file)`);
  }
  assert.notEqual(packProblem('all', await zip([{ name: `${CUSTOMIZE_DIRS.russian}pak06_dir.vpk`, data: pack }])), '', 'no other pak name');
});
