# Grid Studio architecture

Text and symbol entities may carry an optional clockwise `rotation` in degrees. This describes the arrangement only: glyphs are always drawn upright, matching Dota. Individual symbols already have their final x/y. Rotated text runs expand through core.textGlyphs() using stored `textMetrics` (uppercase text and measured advances, including spaces and newlines). The same function supplies canvas drawing, upright hit boxes, bounds and Dota export, so exported positions match the preview. Native projects keep the editable text run; Dota export emits one 30 × 30 category per visible glyph. A single symbol has no rotation control. Older saved rotation fields use this corrected meaning automatically. There is no warning about losing tilt, because no glyph is tilted.

The oriented transform frame remains separate from upright glyph hit boxes so repeated/reversed transforms retain a stable pivot. Gestures accumulate angular deltas across ±180° from their initial geometry; pointer-up creates one history entry and Escape/cancel restores the original document. Shift snaps to 15°. Rotation survives native saves, autosave, clipboard, history, grid drafts and Dota JSON through final character coordinates. Export, native validation, committed edits and gesture completion enforce the 10,000-category limit after text expansion. Hero cards do not rotate.

The site is a React 19 application built with Vite. src/main.jsx mounts a single root, retained across entry-module updates; App.jsx is a separate Fast Refresh boundary and owns the editor lifecycle. StudioLayout.jsx declares the stable shell; StudioControls.jsx implements the project panel, contextual canvas controls, counter, responsive panel access and hero picker. StudioPortal.jsx resolves portal hosts after DOM commit, allowing hosts to mount or be replaced without crashing the editor. The root index.html requires HTTP. The original standalone tools remain in tools/.

## State and ownership

scripts/app.mjs provides createStudio(), which owns the document, canvas renderer, gestures and transactions. React subscribes through useSyncExternalStore to cached immutable UI snapshots, and invokes editor commands. React owns its components and portal contents, including the keyed LayersPanel.jsx. The engine owns the canvas and explicitly empty hosts for properties and drawing/conversion controls; it never rewrites React-owned children. The stable layout is memoized so initial attributes do not overwrite live editor state.

Disposal aborts DOM listeners, disconnects observers, clears timers, detaches portrait callbacks, flushes autosave and stops queued paints. Typography loads independently and requests a repaint when ready.

scripts/core.mjs has no browser dependencies. It contains validation, import/export, history, geometry, hero layout and symbol counting. Every mode edits one document at logical coordinates **1193 × 593**, independent of zoom and pixel density.

One pointer gesture is one history entry. Escape or pointer cancellation restores the original document. New edits invalidate redo. Templates and imports are undoable. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z use physical key codes so they work with Russian layouts. Text fields retain native editing shortcuts. The picker permits document undo/redo when focus is outside its search field.

## Interaction and layout

A selected, editable hero group shows a React + control after its last portrait, vertically centered on that portrait, or a placeholder when empty. Shared geometry positions both portraits and this control. The modal picker supports all four attributes, search, toggling heroes, empty results, keyboard focus, Escape and focus restoration.

Canvas hero cards use local vertical portraits with a cover crop at a 0.575 width/height ratio. The group label is separate, and cards have no captions, badges, levels or permanent enclosing group box. Editing and preview share the same geometry. Art sources are documented in assets/ATTRIBUTION.md.

All four resize handles work. Holding Shift uses a uniform scale anchored at the opposite corner. Pressing or releasing Shift during the gesture recomputes from its original geometry. Deltas are snapped before the aspect constraint, and minimum dimensions prevent inversion.

The page fills 100dvh. The editor uses the remaining height after the header and footer. Fit considers both available dimensions. The canvas viewport has no scrollbars; zoomed content can be panned with Space or the hand tool. Long side-panel and picker content scrolls within those panels. Narrow screens reveal panels using explicit controls instead of stacking the canvas below them.

GridFilePanel.jsx is always available in the left panel, independently of tool mode or selection. It shows the imported filename and every configuration, using draft names when edited. Creating a blank/template grid appends to the current file through addConfig(), preserving other grids, custom metadata and native layers. Creation, switching and edits share undo history. Grid changes cancel transient image conversion and reset the viewport; they never flatten hidden layers into Dota JSON. Export downloads all configurations together. Imports accept UTF-8 BOMs and show the file immediately, without a one-off grid-selection dialog.

The count includes Unicode code points in text/symbol entities on all layers, excluding whitespace and hero/group names. It updates during edits and history navigation, and differs from Dota's category count. Reduced-motion preferences disable interface transitions and animations.

## Data and conversion

Dota v3 export preserves other grids, unknown metadata and unknown positive hero IDs. Hidden layers are excluded; locks only prevent editing. Native \*.gridstudio.json projects retain IDs, layers, locks, visibility, metadata and drafts per configuration. The same format backs browser autosave. History and source image pixels are session-only; committed symbols persist.

Each applied image and multiline ASCII insertion creates an artwork layer (kind: artwork, id: art-N). Its ID shares the document's monotonic nextId source. Base layers are retained, and previous three-layer projects remain readable under schema 1. Up to 128 layers are validated per configuration. Whole-artwork selection, duplication, clipboard insertion, layer rename, visibility, locks and deletion use the shared undo history. Alt-click selects a single entity. Dota export omits hidden art and flattens visible entities into categories; Dota files cannot retain studio layer metadata.

The layer list uses stable React keys so unrelated edits do not replay entry animations or destroy focus. Collapsed lists retain inert children during the height transition. Selection scrolls within the layer panel, without moving the document. CSS motion and inspector animations respect reduced-motion preferences; direct canvas gestures remain immediate.

scripts/edges.mjs contains the original Canny/NMS/hysteresis and Zhang–Suen algorithms. scripts/converter.mjs returns symbol positions from pixels and settings. Images are bounded to 500 pixels on either axis, transparent pixels composite to white, blank images produce no contours, and contours/shading share a budget. Conversion is debounced on the main thread. After a successful file decode, ImageImportDialog opens as a native modal with its own preview canvas, conversion settings and explicit Add/Cancel actions. Preview never draws on or modifies the main document. Cancel invalidates pending image/debounce callbacks and creates no history entry; Add commits one artwork layer. Document shortcuts are blocked while either dialog is open, and the style-saving dialog can sit above the image dialog.

data/symbols.json is the canonical user-curated catalog: 442 unique symbols in 14 categories. scripts/build-data.cjs regenerates data.mjs and edges.mjs and synchronizes both standalone HTML symbol libraries plus data/symbols.txt without network access. Built-in frame presets use only catalog symbols. Image presets in presets/presets.json preserve all 29 upstream presets and their own contour/shading alphabets independently of the picker; never filter them through the curated catalog. Existing documents and custom input stay unrestricted. Portraits are served with the site. SF Pro Display uses an external web-font source; attribution is in assets/ATTRIBUTION.md.

## Build and validation

Use Node 22.19+, npm ci and npm run dev. npm run build emits dist/ with local portraits copied by the Vite plugin. Relative asset paths support hosting in a subdirectory. Run npm run check and npm test; CI also builds production. Browser coverage and in-game verification are in docs/qa.md.

Canvas rendering follows the installed game's `hero_grid_new` / `dotastyles` definitions. `dota-rendering.mjs` centralizes 16 px Radiance SemiBold labels, uppercase, 2 px tracking, the #808fa6 color and text shadow. Radiance is bundled; Korean characters use Dota's YDYGO 540 fallback. Interface fonts remain SF Pro Display. The canvas backing resolution follows the displayed zoom and device pixel ratio so labels do not depend on CSS bitmap scaling.

The JSON category height represents its HeroList, excluding the fixed 20 px title row (even for an empty title). HeroList has 4 px padding; 51 × 83 cells fit its available area and their 4 px image insets scale with the cells. The resulting portrait ratio is 43:75 and gaps scale with card size. Selection/hit geometry includes the extra title height, while numeric properties and exports retain the original JSON height. Titles are allowed to overflow the list width without horizontal text compression. Artwork, text and hero-group names all use the same game label renderer. Preview changes the backdrop and hides guides without changing geometry.

Dota JSON does not encode arbitrary fonts, colors, player cosmetics or individual glyph rotations. Static website portraits do not reproduce equipped cosmetics or animated game portraits. Pixel antialiasing may vary between Panorama and the browser; final in-game verification is still useful.

Image settings live in scripts/image-settings.mjs and are shared by the React fields and engine. All processing controls are visible in the dialog, with synchronized range/number fields, a 1,000-symbol default budget and a 10,000 maximum. Sharpness applies an unsharp mask after Gaussian blur and before Sobel; shading uses the original alpha-composited grayscale with inversion. convertWithStats returns points and actual contour/shading counts. The charset + buttons open the shared modal above the image dialog and append individual glyphs from the curated categories. Settings (including sharpness and OnlyDots) round-trip through presets. Export entities retain fixed 30×30 dimensions.

## Drawing and row operations

DrawingDialog owns a separate draft and history; applying it creates one artwork layer and one main-history entry. Both canvases share drawing.mjs for distance-based sampling, Shift constraints, seeded character order, dynamics, smart strokes and lasso geometry. edit-operations.mjs groups same-baseline glyphs within each unlocked visible layer, preserving exact positions in rowGlyphs. rowText is used for a compact Dota category only when measured spacing reproduces the positions. Otherwise export expands the row without moving glyphs. Cropping and erasing operate on individual glyphs; alignment uses visible bounds.

Reference images live in optional doc.reference, persist in native projects and grid drafts, and never enter Dota exports. ReferencePanel reduces images locally. The model validates the data URL and geometry. Game preview hides references. Large data URLs are excluded from the snapshot comparison key.
