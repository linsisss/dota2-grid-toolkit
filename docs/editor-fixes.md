# Editor fixes — 28 September 2026

The editor keeps the approved Focus design and existing browser storage keys. The landing and catalogue are unchanged.

## Data and import

- ID 127 (`Мишень`, searchable as `Target Dummy`) is a special Universal entry, first in the picker. `build-data.cjs` adds it separately from the unmodified hero snapshot. Its local SVG is an original target illustration, not a Valve portrait.
- Dota v3 import accepts finite zero/negative category dimensions. Text-only categories recover invalid axes to 30. Hero categories use the absolute negative dimension, or 340 × 195 defaults for zero axes. Coordinates, positive axes, grid order, IDs and unknown fields are retained. The import dialog reports repaired categories. Malformed coordinates and hero IDs still fail with the grid name and category index.
- The source file is never modified. Recovered values live in the imported document and subsequent export. Import does not stretch art to fit the editor canvas.
- `importRepairs` records recovered category indexes and original dimensions in the native document. Native projects retain per-grid drafts, layers, reference images and canvas dimensions.
- The explicit “Добавить из файла” action opens the existing atomic multi-file importer. “Добавить к текущим” remains the default; the alternative replaces the open collection and is undoable.

## Canvas interactions

- `canvas-input.mjs` maps client pixels through the actual canvas DOM rectangle, independently of its backing resolution. Main editor and drawing window share it.
- Drawing samples represent visible glyph centres. `centerBrushPoints` translates them into Dota category origins using actual Radiance ink metrics, including the category's 4px padding. Preview and committed drawing use identical coordinates. The top/left origin is still clamped.
- Snap starts off. The main canvas toggle and the drawing window's explicit 8px checkbox enable it. Brush spacing is independent of snapping. Mirrors operate on sampled centres.
- Click selects the nearest visible glyph within the topmost unlocked layer. Transparent portions of 30px category boxes no longer intercept neighbours. Shift adds/removes selection; Alt-click selects a whole artwork layer. Marquee intersects ink, and lasso uses glyph centres. Locked and hidden layers are excluded.
- Main canvas pointer ownership ignores other pointers during a gesture. The drawing window also rejects competing pointer IDs and cancels on window blur. Both retain undoable gestures.
- Double-click opens the properties panel before focusing the text field. The field supports line breaks; Ctrl+Enter finishes editing. One text-edit session is one history entry, with live canvas updates.
- Ctrl+C/Ctrl+V already copied selected hero groups with their dimensions; that path remains in place.
- The reference image control is near the top of Drawing. Main-canvas references can be moved/resized via “Переместить / растянуть”; Shift preserves aspect. The separate drawing window retains its own reference tool. References remain excluded from Dota JSON.

## Symbols, frames and converter

- `searchSymbols` supports literal glyphs, category names, common Russian/English symbol names and `U+XXXX`/`0xXXXX`. Search applies across categories in the main brush, drawing window and converter picker. Select-all applies to displayed results.
- Frame presets are applied even when the active brush contains multiple symbols. Frame corners retain their vertices; density dynamics do not resample them away. Four presets add circles, diamonds, stars and arrows from the existing curated alphabet.
- Converter quick starts: Контур, Фото (1000 symbols), Меньше символов (600). They reuse existing conversion algorithms and style presets. The default is still 1000. Important controls also show inline explanations.
- Japanese glyphs are preserved without substitution; export reminds users that game fallback fonts may differ. Glyphs the game does not show at all — Braille, box drawing U+2500–257F, block elements U+2580–259F and a few tested symbols/emoji (`invisibleWarning` in scripts/dota-rendering.mjs, from the in-game symbol test of 29.09.2026) — warn on input and in export warnings.

## Optimization and export

- `artwork-optimization.mjs` removes a user-selected fraction of single-symbol objects in visible unlocked layers. It samples spatially and deterministically, preserves extrema when budget allows, and does not move/resize retained objects. Text runs, heroes and protected layers remain unchanged.
- “Уменьшить плотность” opens original/result previews before applying. Cancel leaves the document unchanged; apply is one undoable transaction. Hero groups appear as outline guides in this art-specific preview. Small details can be lost, so the user chooses the amount explicitly.
- Row compaction still runs only while exporting. An export checkbox disables it entirely. Exact baselines, measured spacing, layers and unknown metadata constrain eligibility; irregular/RTL/combining glyphs stay separate.
- Width measurement during compaction uses a cached single text measurement instead of recomputing every prefix. Editable objects and their IDs never change during export.

## Validation and limits

- `npm test`: 106 tests pass. New regressions cover legacy dimensions, a 4050-symbol mixed Unicode round trip, optional row compaction, CSS coordinate mapping, brush centres, dense picking, search, frame geometry and reversible thinning.
- `npm run check` and `npm run build` pass.
- There is no supplied reproduction file for the reported flattened old artwork. Exact coordinate-preserving fixture tests pass; the specific report remains unconfirmed.
- Public DNS resolves to the expected IPv4 address; no AAAA record was returned. HTTP redirects to HTTPS and `/editor` responds 200. Eleven independent Check-Host probes returned 200, including two Moscow networks and Saint Petersburg: [regional report](https://check-host.net/check-report/4dcfb48cke70), [other regions](https://check-host.net/check-report/4dcf93a9k35c). These are point-in-time hosting probes, not proof of reachability from every residential provider.
- No in-game execution was performed; browser preview cannot guarantee Dota font fallback, FPS or crash behaviour. Existing >2000-category warnings remain.
- Anonymous workshop publishing and GIF/video animation are separate future features, not part of this patch.
