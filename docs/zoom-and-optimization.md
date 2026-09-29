# Continuous zoom and category optimization

## Zoom

`ZoomFields.jsx` adds a continuous logarithmic slider and an editable percentage (including decimal percentages). `scripts/zoom.mjs` defines a 1–800% range. The plus/minus buttons remain shortcuts, not the only available values. Ctrl+wheel uses the actual wheel delta, normalized for pixel/line/page events, instead of one fixed jump per event.

`setZoom` anchors the content under the pointer for wheel zoom and under the viewport centre for slider/typed changes. Canvas scrolling stays inside the studio, with Space-drag still available. Fit restores the automatic viewport scale. Zoom is a view setting and does not alter hero dimensions, symbol coordinates or exports. The existing 16-million-pixel canvas raster limit still applies at large scales.

## Optimizer

The counter action is “Оптимизация”; the >2000-category warning also offers the action. Default mode reports the download's row joining. «Упаковать точки в строки» moves symbols by up to 1.5 px, so it is off until the user ticks it (user decision, 29.09.2026: nothing that shifts symbols happens automatically, the download stays below half a pixel). Detail reduction is an explicit checkbox, followed by an editable category budget and before/after previews.

### Joining rows on download

`export-rows.planCategoryRows` (used by every download and by the optimizer) joins single glyphs of one layer into text rows when the row's measured text — the calibrated label advances with kerning, `packGlyphs` — puts every glyph back within half a 1080p screen pixel of its own position (`EXACT_PACK`: 0.43 grid units sideways, rows 0.87 high). The game cannot show that difference. Until 29.09.2026 the check demanded an exact baseline and 0.01 px, which hand-placed and converted art never meets: the workshop arts joined 0–6 of thousands of categories; now they shrink 1.35–2.6×.

Glyph roles (`glyphRole`): game-font glyphs anywhere in a row; `#` never first (a label starting with it is a localization key); glyphs Dota draws with a fallback font (⁎, ★, kana) only at the end, because their width in the game is unknown; spaces, right-to-left letters and combining marks never. Heroes and categories with unknown fields stay as they are. `planCategoryRows` also returns the entry indexes of every category.

«Упаковать точки» (`dot-packing.mjs`) is the same packing with 1.5 px sideways and 2 px rows, applied to the document (`packPlan` + `applyPacking`: text rows in place of the symbols).

### Reducing detail

`category-optimization.mjs`:

1. Eligible: single symbols on visible, unlocked layers. Hero groups, text, hidden and locked layers are protected and counted once.
2. Units: what one category of the result holds — the download's joined rows, or the packed rows with «Упаковать точки». A unit is removed whole; taking one glyph out of a row saves nothing.
3. Order (`eliminationOrder`): weighted sample elimination (Yuksel 2015). A glyph's crowding is Σ (1 − d/R)^8 over glyphs closer than R (R starts at three typical spacings); its uniqueness is 1 / (1 + 20·crowding), ×0.6 crowding for glyphs other than the layer's usual one. Glyphs of small separate shapes — joined by links shorter than twice the median nearest-neighbour distance, at most 70 px across and 60 glyphs: a mouth, an eye, a button — count ×0.25 crowding, so they stay whole until lines are thinned by about half. The unit with the smallest summed uniqueness goes; its neighbours' crowding drops. Units whose glyphs all sit on earlier glyphs go first. When no unit is crowded, R doubles. Result: overlaps first, then every other row of dense fills, then every other dot of lines — even thinning, never random holes. Every layer keeps one unit.
4. A budget of N categories keeps the first N − protected units; the actual download count is recomputed (and the kept count lowered if joining differs). Kept symbols keep their IDs, glyphs, positions and metadata; with packing, the kept packed rows become text entities.

“Применить к холсту” is one undoable transaction. “Скачать JSON” exports the chosen result without changing the editor. Other grid drafts and the imported collection remain in the file.

## Validation

- 111 tests passed, including arbitrary/decimal zoom values, normalized wheel deltas, row-aware category budgets, contour retention versus a dense fill, protected data, exact retained geometry, deterministic results and a 10000-symbol case with coincident points.
- Syntax checks and production build passed.
- Public-browser verification: 137.5% and 800%, slider fine increments, fit reset, internal scrolling, 54 → 30 category reduction, and undo restoring 54 then the original 6 categories. Browser console had no warnings/errors.
- Layout inspected at 1280×800, 652×695 and 390×844. No page-width overflow at the tested scales. The narrow counter is inset to avoid the floating dock.
- In-game appearance and performance were not tested.
