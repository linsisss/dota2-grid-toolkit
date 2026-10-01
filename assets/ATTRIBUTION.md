# Asset sources

The ID 127 target uses `assets/portraits/127.png`, the unmodified Dota 2 screenshot supplied by the user on 2026-09-28. The hero-card renderer displays the portrait area above the screenshot's nameplate (`portraitCrop` in the generated hero data). The model and artwork belong to Valve, outside this repository's MIT license. It is a special Agility entry added first by the data build script. The earlier geometric placeholder `127.svg` is no longer used by the current hero catalog.

Attribute icons in `assets/attributes/` are Valve's original Strength, Agility, Intelligence and Universal icons from `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/hero_{strength,agility,intelligence,universal}.png`, retrieved on 2026-09-26. They are served locally and remain Valve's artwork, outside this repository's MIT license.

Hero names, IDs, attributes and roles are an offline snapshot of [OpenDota dotaconstants](https://github.com/odota/dotaconstants/blob/master/build/heroes.json), retrieved on 2026-09-26. The unmodified snapshot is in `data/heroes-source.json`.

Hero portraits in `assets/heroes/` are Dota 2 assets from Valve's public CDN (`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{name}.png`). Dota 2 and its characters and artwork belong to Valve Corporation. These third-party assets are not covered by this repository's MIT license. This is an independent community editor, not an official Valve product.

Vertical hero portraits in `assets/portraits/{id}.webp` are the in-game hero selection art (`panorama/images/heroes/selection/npc_dota_hero_*.png`), taken from the Spectral.gg Resources Hub (`https://courier.spectral.gg/images/dota/portraits_vert_lg/{name}.png`, 284 × 376, by leamare), retrieved on 2026-09-29 and served locally, never hotlinked. They replace Valve's legacy `_vert.jpg` catalog, which carries outdated art for some heroes, and STRATZ 71 × 94 copies for the newest heroes. Converted with `cwebp -q 85 -m 6 -sharp_yuv`; `node scripts/build-data.cjs` then points the hero data at the WebP files. For a new hero, download its `{name}.png` from the same folder, convert it to `{id}.webp` and rebuild the data. The canvas crops these 71:94 portraits to the tall hero-grid card proportions without stretching them; player cosmetics, hero levels and badges are not included. The artwork belongs to Valve Corporation and is not covered by this repository's MIT license.

Hero-screen backdrops in `assets/backgrounds/` come from the Dota 2 panorama texture `fall_background_png.vtex_c` (…/backgrounds/fall_background.png, 3840 × 2164) supplied by the user on 2026-09-29; its VTEX format 16 stores a plain PNG after the resource blocks. `scripts/make-grid-background.mjs` darkens it the way the game does, fitted to a clean 1080p screenshot of the empty hero grid supplied the same day: `dota-grid.webp` (2×) and `dota-grid-1x.webp` are the part under the 1193 × 593 grid, `dota-screen.webp` the whole 1920 × 1080 screen; lossless WebP, because lossy encoding bands this dark image. The artwork belongs to Valve Corporation and is not covered by this repository's MIT license.

Fonts in `assets/dota-fonts/` (Montserrat, Rubik, Nunito, Comfortaa, Exo 2, Oswald, Unbounded, Jura, Tektur, Russo One, Play, Press Start 2P, JetBrains Mono, Philosopher, Caveat, Lobster) are static instances downloaded from Google Fonts by `scripts/fetch-dota-fonts.mjs`. Each is licensed under the SIL Open Font License 1.1; its `OFL.txt` (from github.com/google/fonts) sits next to the font files and goes into every downloaded archive. The customization page renames them inside to Dota's family names only in the archive the user downloads; the files in the repository are unmodified.

The customization page converts menu backgrounds in the browser with [Mediabunny](https://github.com/Vanilagy/mediabunny) by Vanilagy, used unmodified as an npm dependency under the Mozilla Public License 2.0.

Main-menu pieces in `assets/dota-menu/ui/` (top bar, ИГРАТЬ button, the chat line, the Dark Carnival event card, the friends rail's search row, category headers, empty slot, watch button, star, leader crown and party bar) are cut by `scripts/make-menu-sprites.mjs` from a 1920 × 1080 screenshot of the Russian Dota 2 main menu supplied by the user on 2026-09-29; the shards count is painted over, and the user's own avatar and chat picture in the party bar are replaced. They are Valve's interface and artwork and are not covered by this repository's MIT license.

Hero-page pieces in `assets/dota-menu/ui/hero-*.webp` (the preview of the background behind the hero) are made by `scripts/make-hero-page-sprites.mjs` from a 1920 × 1080 screenshot of the Russian Dota 2 hero page (Shadow Fiend, «Снаряжение») supplied by the user on 2026-09-30 and from the same user's export of `pak01_dir.vpk` (`panorama/images/…`: attribute, complexity, role, stat and Aghanim's icons, `control_icons/24px` SVG icons). Only opaque pieces of the screenshot are cut (top bar with the shards count painted over, abilities, item slots, health and mana bars, buttons, the level badge and notes button lifted off by colour); the text is rendered with Valve's Radiance and Reaver fonts, matched to the screenshot. `hero-friends.webp` is the round friends button from that screenshot. `assets/fonts/reaver-{regular,semibold,bold}.otf` come from the user's `game/dota/panorama/fonts/` (Copyright Valve Corporation) and are used by that script only; the site does not serve them. All of it is Valve's interface and artwork, not covered by this repository's MIT license.

The hero in the hero-page preview, `assets/dota-hero/sf-arcana/`, is made by `scripts/make-hero-3d.mjs` from the user's Dota 2 installation (files exported from `pak01` on 2026-09-30): Shadow Fiend's Demon Eater arcana with its head, the Souls Tyrant shoulders, the Arms of Desolation and the arcana pedestal (models with two loadout animations and the «Fiendish Swag!» taunt, material parameters and textures, the fresnel warp texture), the set's particle systems as JSON with their textures, particle snapshots and model attachments, and the hero page's light for Shadow Fiend from `scripts/npc/portraits_full_body_loadout.txt`. Conversion is done by the [Source 2 Viewer](https://github.com/ValveResourceFormat/ValveResourceFormat) command line (release 20.0, MIT). The material follows the formulas of the game's compiled hero shader (`shaders_pc_000.vpk`, `hero_pc_50_ps.vcs`), read with `vkd3d-compiler` and `spirv-cross` (Ubuntu packages); no shader code is shipped. All of it is Valve's game content and is not covered by this repository's MIT license.

`assets/dota-hero/sounds/taunt-fiendish-swag.mp3` is the sound of Shadow Fiend's taunt «Fiendish Swag!» from Dota 2, downloaded on 2026-09-30 at the user's request from the Dota 2 Wiki (`https://static.wikia.nocookie.net/dota2_gamepedia/images/4/46/Taunt_Shadow_Fiend_Fiendish_Swag.mp3`), unmodified; the page plays it at 12 % volume. It is Valve's game audio and is not covered by this repository's MIT license.

`src/customize/hero3d/fx.js` is a JavaScript port of parts of Source 2 Viewer's particle simulation and renderers (`ValveResourceFormat/Particles`, `Renderer/Particles`), with additions of our own for model-bound functions; that code is used under the MIT License:

> The MIT License (MIT)
>
> Copyright (c) 2015 ValveResourceFormat Contributors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

`assets/dota-menu/ui/miniprofile-rock.webp` and `assets/dota-menu/ui/rank-medal.webp` are Dota 2's `panorama/images/textures/miniprofile_rock_psd` and `panorama/images/rank_tier_icons/rank8inactive_psd` (the «Титан» medal without a leaderboard plate) textures, exported by the user with Source 2 Viewer on 2026-09-29. `assets/fonts/radiance-{light,regular,bold}.otf` come from the same user's `game/dota/panorama/fonts/` (Copyright Valve Corporation); `scripts/make-menu-rail.mjs` and `scripts/make-menu-notice.mjs` use them to render the menu preview's friends rail and notifications popup, the site does not serve them. Both are Valve's property and not covered by this repository's MIT license.

`assets/dota-menu/ui/avatar.webp` and `avatar-linsissya.webp` are the avatars of GridStudio's authors dissonance and linsissya, and `avatar-etokrov.webp` the friends-rail entry «Etokrovь», all supplied by the user for the menu preview.

Main-menu and hero-page layouts in `assets/dota-menu/` (`dashboard.xml`, `dashboard_page_home.xml`, `dashboard_page_hero_new_v2.xml`) are Valve's Panorama layouts from the Dota 2 client, as decompiled by Source 2 Viewer in [spirit-bear-productions/dota_vpk_updates](https://github.com/spirit-bear-productions/dota_vpk_updates) (client 6942, 2026-09-29). They belong to Valve Corporation and are not covered by this repository's MIT license. `tests/fixtures/valve/` holds two compiled Panorama files from the [Source 2 Viewer](https://github.com/ValveResourceFormat/ValveResourceFormat) test suite, used to check that `scripts/vpk.mjs` writes resources exactly like Valve's compiler; they are Valve's files as well.

The symbol library, frame presets, Canny edge detection, and Zhang–Suen thinning algorithms are adapted from the original MIT-licensed [Dota 2 Grid Toolkit](https://github.com/linsisss/dota2-grid-toolkit). `scripts/build-data.cjs` extracts them from the preserved standalone tools.

The interface uses SF Pro Display, designed by Apple, through the [CDNFonts web-font stylesheet](https://fonts.cdnfonts.com/css/sf-pro-display). The application requests regular, medium and bold WOFF files from `fonts.cdnfonts.com`, with local/system fallbacks. Font binaries are not included in this repository or its MIT license. Font use remains subject to the font owner's terms; see [Apple Fonts](https://developer.apple.com/fonts/). Review suitability of this font source before upstream publication.

The canvas uses the supplied Dota 2 `panorama/fonts/radiance-semibold.otf`, served locally from `assets/fonts/radiance-semibold.otf`. The selected font's internal family is Radiance Semibold, weight 600. It contains Latin/Cyrillic and symbol glyphs; the similarly named RadianceM faces mostly contain tabular digits and are not substitutes for the full text font.

Korean canvas text uses `assets/fonts/ydygo540.ttf` (YDYGO 540 / YD윤고딕 540), extracted from the same Dota installation's `panorama/fonts/nexon.uifont`. Copyright © 1989–2011 YoonDesign Inc. All rights reserved. This is the Korean fallback named in Dota's default font stack. The UI-font package format was read using the [ValveResourceFormat UIFontFilePackage reference](https://github.com/ValveResourceFormat/ValveResourceFormat/blob/master/ValveResourceFormat/ValveFont/UIFontFilePackage.cs). These game fonts retain their original owners' rights and are **not covered by this repository's MIT license**; inclusion here does not grant redistribution rights.

Interface icons are [Lucide](https://lucide.dev) (ISC License), picked by `scripts/make-icons.mjs` into `scripts/icons.mjs`; the GridStudio logo and the Dota-style «+» hero card are original.

> ISC License. Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.
> Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

 Portraits are served with the site, and user projects/images stay in the browser. The font CDN receives ordinary web-font requests; no project data is sent to it.

## FIGlet fonts («Текст в ASCII»)

`scripts/text-art.mjs` uses [figlet.js](https://github.com/patorjk/figlet.js) (MIT, © Patrick Gillespie and contributors) and the FIGlet fonts it ships (Standard, Slant, Big, Doom, Banner, Graceful, Star Wars, Epic, Alligator2, Larry 3D, 3D-ASCII, Graffiti, Big Money-ne, Merlin1, Fire Font-k, Modular, Rounded, Speed, Ogre, Fender, Shadow, Small, Small Slant, Small Shadow, Rectangles, Cyberlarge), made by FIGlet's authors and contributors; their headers keep their credits. The fonts are loaded only when the «Текст в ASCII» window opens. The «Жирные точки» style follows the lettering of the workshop grid «Seijūrō Akashi» by anesthesia (the technique, not its dots).
