# Asset sources

Attribute icons in `assets/attributes/` are Valve's original Strength, Agility, Intelligence and Universal icons from `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/hero_{strength,agility,intelligence,universal}.png`, retrieved on 2026-09-26. They are served locally and remain Valve's artwork, outside this repository's MIT license.

Hero names, IDs, attributes and roles are an offline snapshot of [OpenDota dotaconstants](https://github.com/odota/dotaconstants/blob/master/build/heroes.json), retrieved on 2026-09-26. The unmodified snapshot is in `data/heroes-source.json`.

Hero portraits in `assets/heroes/` are Dota 2 assets from Valve's public CDN (`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{name}.png`). Dota 2 and its characters and artwork belong to Valve Corporation. These third-party assets are not covered by this repository's MIT license. This is an independent community editor, not an official Valve product.

Vertical pick-screen portraits in `assets/portraits/` use Valve's `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/heroes/{name}_vert.jpg` catalog (Muerta uses `_vert.png`; Shadow Fiend's `.jpg` endpoint returns PNG bytes). Dawnbreaker, Marci and Primal Beast are Valve artwork mirrored by STRATZ at `https://cdn.stratz.com/images/dota2/heroes/{name}_vert.png`, because those entries are missing from Valve's legacy catalog. All 127 portraits were retrieved on 2026-09-26 and are served locally. The canvas crops these portraits to the tall pick-screen card proportions without stretching them; player cosmetics, hero levels and badges are not included.

The symbol library, frame presets, Canny edge detection, and Zhang–Suen thinning algorithms are adapted from the original MIT-licensed [Dota 2 Grid Toolkit](https://github.com/linsisss/dota2-grid-toolkit). `scripts/build-data.cjs` extracts them from the preserved standalone tools.

The interface uses SF Pro Display, designed by Apple, through the [CDNFonts web-font stylesheet](https://fonts.cdnfonts.com/css/sf-pro-display). The application requests regular, medium and bold WOFF files from `fonts.cdnfonts.com`, with local/system fallbacks. Font binaries are not included in this repository or its MIT license. Font use remains subject to the font owner's terms; see [Apple Fonts](https://developer.apple.com/fonts/). Review suitability of this font source before upstream publication.

The canvas uses the supplied Dota 2 `panorama/fonts/radiance-semibold.otf`, served locally from `assets/fonts/radiance-semibold.otf`. The selected font's internal family is Radiance Semibold, weight 600. It contains Latin/Cyrillic and symbol glyphs; the similarly named RadianceM faces mostly contain tabular digits and are not substitutes for the full text font.

Korean canvas text uses `assets/fonts/ydygo540.ttf` (YDYGO 540 / YD윤고딕 540), extracted from the same Dota installation's `panorama/fonts/nexon.uifont`. Copyright © 1989–2011 YoonDesign Inc. All rights reserved. This is the Korean fallback named in Dota's default font stack. The UI-font package format was read using the [ValveResourceFormat UIFontFilePackage reference](https://github.com/ValveResourceFormat/ValveResourceFormat/blob/master/ValveResourceFormat/ValveFont/UIFontFilePackage.cs). These game fonts retain their original owners' rights and are **not covered by this repository's MIT license**; inclusion here does not grant redistribution rights.

Interface SVG icons are original. Portraits are served with the site, and user projects/images stay in the browser. The font CDN receives ordinary web-font requests; no project data is sent to it.
