# Validation record

Checked on 2026-09-26 in Chromium, against Vite development (port 4173) and the production bundle (port 4174).

## Automated checks

- npm run check: authored editor modules parse.
- npm test: **35 passing tests**.
- npm run build: React/Vite production compilation succeeds; landscape and vertical portrait assets are copied to dist/assets/heroes and dist/assets/portraits (with the half-size portraits in md/).
- Coverage includes Dota v3 round-trips, unknown IDs and metadata, multiple configurations, native project validation, history, fresh IDs, export warnings, conversion edge cases and all 127 portraits.
- New interaction tests verify uniform aspect ratios and fixed opposite anchors for all four corners, free axis scaling, clamping past the opposite corner, repeated Shift toggling from the original geometry, multi-object transforms, zoom-independent handle hit testing and Unicode symbol counts through history.

## Current browser checks

- Dota visual parity: compared the supplied #grind mentality screenshot and JSON with the installed game's Panorama styles. Radiance SemiBold and the Korean YDYGO 540 fallback load from the production bundle. Labels use game size, weight, tracking, uppercase and color; hero portraits use scaled cell margins and 70% saturation. The reference mid row computes 74 × 129 px portraits and 88 px pitch at the screenshot's 115% scale.
- Checked the new layout in editing and preview modes, including empty category names and compact VIBE cards. The selected DEMON group's outline includes its separate 20 px header, and its contextual plus follows the first portrait. Dragged its bottom-right handle: list size 117.39 × 111.30 → 149.39 × 151.30; Ctrl+Z restored the original values. Browser console had no errors or warnings. Temporary viewport overrides were reset.

- Multi-grid update: loaded the supplied hero_grid_config.json (4 grids: Custom Layout, p1, Main, #grind mentality). Changed the mid group's X position in p1 from 0 to 1, switched to Main and back, and verified X remained 1. Added a fifth grid, undid and redid its creation, and verified export included five grids. The original file was read only.
- Reload restored all five grids and the selected new grid. At 390 × 844 the file panel remained accessible in the tools drawer; page dimensions exactly matched the viewport and switching grids worked. The production console had no errors or warnings. Restored the viewport and reloaded the compatibility fixture on the isolated test origin.
- A separate exact-data check loaded the supplied file, switched through all four grids, and verified export matched the original parsed JSON. Adding a template retained all four original configurations; edits in separate grids and native-project save/restore retained metadata and the new fifth grid.

- Latest refinements were checked on the isolated production origin (4174), preserving the user's active 4173 project. Two images created layers named `5` (1800 symbols) and `136` (270 symbols). Their separate visibility/lock states survived reload. Ctrl+Z and Ctrl+Shift+Z undid/redid both changes independently.
- Duplicating `136` created `136 (2)` as an independent layer; deleting it and undoing restored the full layer. Multiline ASCII produced a separate `ASCII` layer, and the symbol counter increased by six.
- Dragged a two-row ASCII layer from (41, 331) to (81, 363); both rows moved together and its 43.2 × 52 bounds remained unchanged. Handle hit areas now leave a draggable center in small objects.
- Selected Alchemist, Crystal Maiden, Keeper of the Light and Arc Warden through the picker. The canvas showed tall portraits, a separate uppercase group name, and no lower captions, levels, badge icons or permanent group background.
- Checked the wider inspector: 310 px at desktop size, 13 px labels and 14 px values. Verified page/workspace fit at 1280 × 720, 1024 × 768 and 390 × 844; the mobile properties drawer remained readable. Restored the viewport override. Latest production console had no errors or warnings.
- Checked stable keyed layer rows, animated folds, picker choices, modal opening/closing and the updated count. Reduced-motion paths are enforced in CSS and JavaScript, but the operating-system preference was not changed during this run.

- Selected a group through the layer list; the contextual + appeared beside the first hero. A new empty group showed its own + placeholder.
- Opened the React picker, filtered Strength, searched Axe, added him and used Ctrl+Z / Ctrl+Shift+Z inside the picker: count 6 → 7 → 6 → 7. Repeated clicks toggle membership without closing the picker.
- Checked Universal filtering, zero search results, Escape and focus restoration.
- Resized a group on the actual canvas from 340 × 195 to 404 × 243 and used Ctrl+Z to restore 340 × 195 in one step.
- Added two rows containing four non-whitespace characters; the counter changed 12 → 16 → 12 → 16 with undo/redo.
- Verified SF Pro Display loading through the browser FontFaceSet: regular, medium and bold all loaded. The served regular WOFF contains Latin, Cyrillic and ё mappings. Font binaries were inspected in memory and are not bundled in the repository.
- Verified viewport fit at 1280 × 720, 1366 × 768, 1440 × 900, 900 × 600 and 390 × 844. Page dimensions matched the viewport. The workspace and fitted canvas had no overflow, and the counter remained below the canvas. At 1024 × 768 the properties panel collapsed behind its button; at phone width both panel controls worked.
- Production bundle: imported the two-configuration fixture, chose Compatibility A, converted a local portrait into 710 symbols and applied it alongside existing objects. The counter changed 1 → 711 → 1 → 711 through undo/redo. Export reported 712 categories, 3 heroes, 2 configurations and no out-of-bounds objects. No production console errors or warnings occurred.

## Earlier compatibility checks retained

Before the React migration, browser checks exercised drawing, combined history, autosave restoration, project/Dota downloads, multi-grid switching and hidden layer preservation. The actual downloaded JSON files were parsed and round-tripped through the shared core. These algorithms remain covered by the current tests. Root-page direct-file launching has intentionally been replaced by HTTP module loading and is no longer a supported release target.

## Remaining release checks

- Exercise a physical Shift + corner drag, including pressing/releasing Shift mid-drag, in target browsers. The available browser automation only exposes an unmodified drag; proportional geometry and modifier wiring were checked separately through tests and code review.
- Import exported output into the current Dota 2 client and check positions, glyphs, group dimensions and portrait packing. The game was not launched or modified; its font and packing may differ from the browser preview.
- Test touch hardware and a screen reader. Accessible names, native modal focus and reduced-motion styles are implemented, but those device/assistive combinations were not exercised.
- Browser automation's virtual clipboard blocked a Ctrl+V trial with an empty external clipboard. Artwork duplication was verified through the UI; native clipboard insertion retains separate layers in the implementation but still needs a physical keyboard check.

## Regression checklist

- Invalid imports leave the document intact; valid imports and templates are undoable.
- Layer locks prevent edits; hidden objects stay in project files and are omitted from Dota export.
- One pointer gesture creates one history entry; Escape cancels it.
- The hero + follows zoom/movement and appears only for an editable selected group.
- The counter excludes whitespace and group names but includes text, artwork and hidden layers.
- Typing keeps native text shortcuts; document shortcuts work outside fields.
- Font/network failures fall back to system fonts without blocking the editor.
- Restore viewport overrides and the isolated test-origin example after browser testing; never replace the user's active project for QA.

## Curated symbols and image import dialog — 2026-09-26

- Check, production build and all 37 tests pass. Catalog tests cover all three libraries, duplicate removal, frame presets and actual converter output for every built-in preset. Regeneration was checked for identical output.
- Production browser check on isolated port 4174: choosing a local portrait opened the settings dialog; changing the preset updated its separate preview. Cancel left the original 526 entities, 627-character counter and disabled Undo unchanged.
- Add created a 1,000-symbol artwork layer; Ctrl+Z returned to 526 entities and Ctrl+Shift+Z restored it. A second image created its own named layer and retained the first one (2,526 entities total).
- Escape from the nested Save style dialog returned to image settings. Layout checked at 1280 × 720 and 390 × 844: preview and footer stayed visible while settings scrolled internally. No console warnings or errors.
- Radiance's cmap lacks box-drawing and shaded-block samples; browser fallback explains why preview alone is not proof of in-game glyph support. No Dota client test was performed for this change.

## Full converter controls and sharpness — 2026-09-26

- All 41 tests pass; production build and syntax check pass. Added coverage for sharpness (flat-area stability, local contrast and no source mutation), shading from original grayscale, inversion, OnlyDots priority, fixed 30px bounds at 100% fill, default 1,000-point shared budget and statistics.
- Browser: all settings are visible without an advanced-settings accordion, default limit is 1,000, numeric fields and sliders synchronize. Sharpness 125%, shade density 65%, OnlyDots, contour .→ and shade .·:@ were saved to a test preset. Switching to a built-in preset reset new fields to defaults; selecting the saved preset restored all tested values.
- Both charset + buttons open a category picker above the image dialog. Adding a specific arrow or @ updates only the intended charset and its live preview. Escape closes the image draft without enabling Undo.
- Final layout checked at 1280 × 720 and 390 × 844, including the 66px numeric fields, symbol + button, statistics and persistent Add/Cancel footer. No console warnings or errors. Viewport was reset and the test tab closed; user's 4173 project was not changed.

## Original image preset alphabets restored — 2026-09-26

- Restored presets/presets.json from the upstream repository: all 29 parsed presets match the downloaded source exactly, including contour/shading alphabets and orientation flags. Generated data.mjs matches the same source. The curated picker remains 442 symbols; it does not restrict image presets.
- All 43 tests, syntax check and production build pass. Regression checks exercise actual line orientations, hatching, Japanese symbols and dot-only output against each preset's own alphabet.
- Production browser on isolated port 4174: «Чистый line-art» sets the original four directional strokes, enables orientation and disables OnlyDots. A local portrait produced 798 contour symbols; its preview visibly uses strokes instead of dots. No change to the user's active 4173 document.

## Free text rotation — 2026-09-26

The glyph-tilt behavior described in this historical section was superseded by the positioning-only correction below.

- All 50 tests, syntax check and production build pass. New coverage includes arbitrary angles, rigid ASCII selection geometry, ±180° crossings/full turns, rotated hit tests and corner handles at 15–250% zoom, fixed opposite corners during resizing, history, duplication, grid drafts, native persistence, validation and export limitations.
- Isolated production browser: dragged the corner rotation handle to 58.24° and visually checked the tilted glyphs and oriented frame. Ctrl+Z restored 0°; Ctrl+Shift+Z restored 58.24°. Typed 37.25°, then used the handle's keyboard arrow to reach 38.25°. Resized the tilted object, undid that resize, reloaded and confirmed dimensions and 38.25° were retained.
- Selected the two-row ASCII layer and rotated it by 15° with Shift+ArrowRight. Locking the layer removed the rotation handle and disabled the angle input. The export dialog explicitly explained that Dota JSON does not store glyph tilt; the native project retains it. No console errors or warnings.
- Pointer Shift snapping and Escape/pointer cancellation are wired into the existing gesture lifecycle; a modifier-held pointer drag was not available in the browser automation. Unit geometry and the keyboard 15° step were checked. No in-game rendering claim is made for tilted glyphs.

## Rotate positions, keep glyphs upright — 2026-09-26

- Corrected rotation to change character positions only. Rotated text uses measured advances and expands into upright characters shared by preview, hit testing and Dota export. Native text remains editable. Single characters have no rotation handle.
- All 53 tests, syntax check and production build pass. Added coverage for measured spacing/newlines, upright glyph bounds, unchanged dimensions, the expanded Dota category budget, metrics validation, exact preview/export coordinate correspondence, Dota round-trips and reversal without pivot drift for unequal text runs.
- Production browser on isolated 4174: a previously saved 38.25° text layout loaded with upright characters; 90° produced a vertical sequence of upright letters. Ctrl+Z / Ctrl+Shift+Z restored 38.25° / 90°. Export reported 31 character categories for the three rotated text runs and showed no obsolete glyph-tilt warning. No console errors or warnings. The game itself was not launched.

## Drawing workspace, brushes and layout tools — 2026-09-26

- Syntax checks, production build and all 68 tests pass. Fifteen new tests cover Shift constraints in four directions, event-frequency-independent stroke sampling, sequential/random alphabets, dynamic spacing, eight smart-brush directions, shapes and symmetry, concave lassos, row geometry/metadata/native round-trips, row transforms, per-glyph crop/erase, alignment and reference validation/grid drafts.
- Browser on isolated 4174: the new drawing dialog turned 31 sequential ABC marks into one row. Draft Ctrl+Z cleared the stroke, Ctrl+Shift+Z restored it; Add created one independent artwork layer and raised the main count from 31 to 62. A later 53-character smart-brush draft was cancelled with the main count still 62 and Undo still disabled after reload.
- Left-align moved the selected row to X=0. Moving it to X=1160 reported 30 outside characters; Crop kept its one in-bounds character (main count 32). Ctrl+Z restored all 62 and the warning.
- The attribute picker loaded all four original icons; selecting all Strength heroes added the 36 filtered heroes, disabled the completed bulk action and displayed + after the final portrait at its vertical center.
- A local image loaded as a reference at 10% opacity. It survived reload and appeared in a new drawing draft. Dialog layout was visually checked at 1280×720 and 390×844: canvas and Add/Cancel remain visible while settings scroll internally. The viewport override was reset.
- Final production preview: a main-canvas AB stroke added 31 symbols as one row; a single Ctrl+Z restored the preceding document. No console errors or warnings in this fresh production tab. A transient React createRoot warning occurred earlier during development HMR, not in the production run.
- Shift-held pointer drags and a freehand polygon were covered by the shared geometry tests; the browser automation only supports straight pointer drags. Dota itself was not launched. The test fixture was restored, temporary tabs closed and preview servers stopped. The user's 4173 project was not replaced for QA.

## White-screen regression — 2026-09-26

- The active 4173 tab failed with createPortal's “Target container is not a DOM element” during UI refresh. Its server also served an empty transformed ReferencePanel module despite a nonempty source file, resulting in a missing named export after reload.
- StudioPortal now resolves hosts in useLayoutEffect after the shell commits, supports absent/replaced hosts, and only mounts into connected elements. App is a separate Fast Refresh boundary; the entry retains a single React root. Font callbacks skip disposed editor instances.
- Vite's watcher waits for a stable completed file write (200 ms), preventing a transient truncated file from becoming a cached empty module. The stale transform was invalidated and ReferencePanel, App and StudioPortal all returned their expected exports.
- Browser regression fixture: portal-before-host initial mount, host removal, host replacement and a subsequent content update all passed without console errors. Reloading the affected user tab restored «Моя идеальная пятёрка» and its 12-character count without replacing the saved document.
- A live App-module edit on isolated 4174 refreshed successfully; the drawing panel and dialog opened afterwards without console errors or warnings. Production build passed. The temporary test tab and server were closed; the user's recovered 4173 tab and server remain open.


## Reference transforms, canvas alignment and live names — 2026-09-26

- 72 tests pass, including a 36-hero height-limited group packing 7 columns, rigid selection alignment to the canvas, origin constraints with right/bottom overflow, reference handles/drag/stretch/proportional anchors, default sequential brushes and negative stroke clipping.
- Isolated browser 4174: typing «Живое имя сейчас» immediately updated canvas/picker/layers, focus and caret stayed in the name input; a single Undo restored «СИЛА». The imported Strength fixture visibly displayed 7 columns with one hero in the sixth row.
- Two unequal text rows retained their offsets when aligned to X=0. Native keyboard entry Y=-90 resulted in Y=0; X=1300 was allowed and reported 12 outside characters. Dragging a two-row artwork past the origin stopped at X=0/Y=0; additional Left/Up did not move it.
- Main brush ABC produced ABCABCABCABCABCABCABCABC in sequence mode and BBACBACBABBCABCAAAAABACC in random mode. The draft independently produced 25 sequential and 25 random symbols, grouped into two rows.
- Draft reference uploaded from the user-provided screenshot at 10% opacity and auto-selected. After setting 400×200, a pointer drag moved X≈22/Y=0 to X≈227/Y≈117; southeast drag changed size to 544×273. Undo restored 400×200 without undoing the move. Shift aspect/anchor preservation is unit-tested; modifier-held pointer drag is unavailable in this automation.
- Add transferred the 50-symbol draft as its own artwork plus its reference, raising the main count from 60 to 110. No browser errors/warnings. The user document on 4173 was not replaced with test data. Game files and the running Dota client were not touched.
- Final production preview was reloaded after the last build: the first live rename enabled Undo even with an initially empty history; Undo restored the group name. No console errors/warnings. The 4173 page still rendered its existing document; temporary 4174 tab/server were closed.


## Symbol tools, category limits and canvas size — 2026-09-26

- Added eight tests covering category selection/removal without disturbing other sets, Unicode MRU ordering, distance-based gradient sampling, glyph-level eyedropper across merged/rotated/hidden content, all-config 30×30 non-hero export, expanded category counts and threshold boundaries, per-grid/native/history dimension persistence, and custom-size alignment/crop/symmetry/conversion.
- Isolated browser 4174: changed canvas to 1600×900; both immediate dialog warning and persistent red canvas note appeared. Switching to the second grid restored 1193×593; switching back and reloading retained 1600×900, existing objects and the eight-symbol palette. The page remained within 1280×720 without document overflow.
- Main gradient stroke produced .·:;+*#%@ in increasing density, then repeated @ after its distance limit. Eyedropper clicked the B inside ABC and changed the brush to B, returning to the pen. A recent-symbol button changed it to @. Main category checkbox selected all geometry symbols and cleared them.
- Separate drawing dialog inherited 1600×900, produced 52 gradient marks merged into one row, and picked @ from that row. Category selection preserved an existing @ from another category. Cancel left the main document at its prior 43 symbols.
- Converter preview used 1600×900. Selecting all Japanese symbols, adding all Latin letters, then removing Latin preserved the Japanese set and the original dot. Selection states were reflected in the individual buttons and category checkbox.
- Imported 2010 symbols: merging into 34 editor rows still reported 2010 exported categories. A persistent red warning appeared above the canvas, and the export dialog showed the same count and lag/crash warning. At 390×844 the warning and eight recent buttons stayed within the viewport; document dimensions equalled the viewport. Viewport override reset afterwards.
- No warnings or errors in the browser console during these interactions. Dota itself was not launched; the game config and the user's 4173 project were not replaced for testing.


- Final checks: all 80 tests, syntax checks and production build passed. The production page changed width to 1500, Undo restored 1193, Redo restored 1500, and the drawing dialog opened with the current dimensions. No console warnings/errors. The test fixture was restored to standard dimensions; the temporary browser tab and 4174 preview server were closed.

## Batch import and export-only rows — 2026-09-27

- All 98 tests, syntax checks and production build pass. New coverage includes 3+3 grids, preserving active edits/native drafts/metadata, duplicate names, undo/redo, arbitrary filenames/extensions/MIME, BOM, batch validation, exact export spacing, unchanged editor entities, legacy row migration, RTL exclusions and Dota typography constants.
- Browser file upload to the local QA page was blocked by the browser security policy. It was not retried or bypassed. File import scenarios are covered by automated tests; no manual end-to-end import claim is made.
- The supplied game CSS confirms normal custom-grid category labels use 16px, SemiBold and 2px tracking. The existing renderer already uses these values; 26px is the separate NewPlayerPool override. Dota itself was not launched.
- Public-site verification on https://gridstudio.me/: loaded the new production bundle with no console warnings/errors. A horizontal drawing stroke produced 35 symbols / 35 objects; dragging one symbol moved only it. Cancelling the draft preserved the original grid (12 symbols / 6 categories). The JSON picker exposes multiple selection with no filename filter. No file upload was attempted on the public site.
- The server also passed all 98 tests before publication. HTTPS returns the new build; HTTP redirects to HTTPS. The preceding release remains available for rollback.

## Ten Focus landing candidates — 2026-09-27

- New isolated landing.html entry with ten variants, v=1..10 deep links and clean=1. Working editor remains index.html; earlier five-design gallery remains design.html.
- Public https://gridstudio.me/landing.html tested at desktop1280×720 and mobile390×844 for all ten variants. Full-page captures: .impeccable/review/landing/. All mobile documents fit horizontally; source screenshot preserved unchanged.
- Fixed the second variant's detached tool rail overlap and kept selected candidate visible in the mobile comparison strip. Verified catalogue explanation, original screenshot dialog, Escape dismissal and arrow-key candidate navigation; console warnings/errors empty.
- Independent finish review requested one material fix: mobile image inspection at full resolution. Added a direct original-image link and recaptured desktop/mobile dialogs. Verdict: ship for the scored fix, remaining clear, no visible regressions.
- Automated Impeccable detector could not run because engine0.1.6 was unavailable and its cache path was not writable. Visual/manual review completed; no automated design-detector result is claimed.
- All98 existing tests, syntax checks and production build passed. No editor document storage is read or written by the gallery.

## Selected home and editor route — 2026-09-27

- Production home uses candidate 05 without comparison controls. Reduced image tilt and unbroken «героев Dota 2.» verified at desktop 1280px, intermediate 900px and mobile 390/320px; no horizontal overflow. Captures: .impeccable/review/home/.
- Primary CTA opens /editor; reloading /editor keeps the editor; its logo returns home. Existing saved grid and game portraits load. Browser console warnings/errors empty.
- Both public HTTPS HTML responses return 200 and match local dist SHA256. /editor/?check=route returns 308 to /editor?check=route. Nginx configuration check passed.
- Production build, syntax checks and all 98 tests passed. No changes to editor document storage or formats.

## Landing scene and controls — 2026-09-27

- Production build and syntax checks passed. This change affects landing presentation and entry-point favicons, not the editor engine.
- Verified published / at 1280×720, 900px, 390px and 320px. Both action buttons share a row; author text, Apple heart and pills share one line. No horizontal overflow. Final desktop document is exactly 1280×720 after reducing stage spacing.
- All images loaded. Landing and /editor point to favicon-focus-BvRxixGJ.svg. Catalogue toggles its truthful preparation notice; screenshot click opens no dialog (no dialog remains in DOM). Header contains only home brand; footer links the original GitHub repo.
- Primary CTA opens the working editor, including saved document and portraits. Console warnings/errors empty. Reduced-motion and fine-pointer guards verified in source; viewport override reset. Captures: .impeccable/review/scene/.

### Устойчивая опора сцены — 27 сентября 2026

Экран и платформа находятся в одном .stage-assembly и делят rotateY(-8deg), с общим параллаксом до ±0.6°. Отдельные наклоны X/Z и отражение удалены: нижний край опирается на узкую планку с контактной тенью, передняя грань основания согласована с перспективой экрана. В «Каталог сеток» добавлена SVG-иконка из четырёх ячеек. На 320px две кнопки остаются в одном ряду. Сборка прошла; опубликованная страница проверена на 1280×720, 390px и 320px, каталог работает, консоль без предупреждений/ошибок. Снимки: .impeccable/review/stage-support/.

### Единая 3D-камера сцены — 27 сентября 2026

Предыдущая платформа была плоской SVG-трапецией, повторно повёрнутой вместе со скриншотом. Заменена CSS-геометрией: stage-camera задаёт perspective 220cqw, stage-world с preserve-3d поворачивает сцену на rotateX(-10deg) rotateY(-7deg). Верх платформы повёрнут на 90° к вертикальному экрану; оба сходятся на y=100%. Передняя/боковые грани расположены на соответствующих координатах глубины. Размеры в cqw масштабируются вместе. Фоновой знак использует ту же камеру. Параллакс и анимация камеры удалены. Не применять filter/opacity к stage-world: они сводят 3D-иерархию в плоскость.

Сборка прошла. Публичная версия проверена на 1280×720 и 390px: сцена загружается, главная помещается в desktop-экран, горизонтального переполнения нет, консоль без предупреждений/ошибок. Иконка каталога сохранена. Снимки: .impeccable/review/stage-camera/.

27 сентября 2026: по просьбе пользователя возвращено исходное направление наклона варианта 05, сверенное с .impeccable/review/landing/desktop-05.png. Экран откинут назад rotateX(14deg) вокруг нижнего края, общая сцена rotateZ(1.5deg) rotateX(-10deg) rotateY(-12deg). Нижняя грань остаётся на платформе; предыдущий вертикальный ракурс отменён. Иконка каталога сохранена. Сборка и публичная desktop/mobile проверка прошли, консоль без ошибок; снимки .impeccable/review/original-tilt/.

### Editor regression patch — 2026-09-28

See [editor-fixes.md](editor-fixes.md) for the compatibility changes and their limits. All 106 Node tests, syntax checks and the production build pass. Public browser checks covered the target-first hero picker, multiline live category names, individual dense-symbol selection, reversible density reduction, symbol search, frame previews and export options. Desktop and narrow-screen smoke checks produced no console errors. Clipboard keyboard simulation was unavailable in the browser harness; file-input and native-game behaviour were not claimed as browser-tested.
### Continuous zoom and category optimizer — 28 September 2026

111 tests, syntax checks and the production build pass. Public UI checks cover 137.5%, 800%, slider increments, fit, a 54-to-30 category budget and Ctrl+Z restoration. Details and limits: [zoom-and-optimization.md](zoom-and-optimization.md).