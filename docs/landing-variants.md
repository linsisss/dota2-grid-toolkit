# Focus landing studies

Scope: ten complete first-page landing alternatives at landing.html, in the established Focus world. Mode: Persuade. The gallery preserves the review candidates. Candidate 05 «Сцена» is now selected for the production home; the editor and earlier design.html gallery remain separate.

## Direction contract

THESIS: show the actual customised Dota grid before explaining the tool. Ten compositions give the user a concrete choice; no invented testimonials, usage numbers, feature cards or slogans.

OWN-WORLD: inherit Focus ink, surfaces, lavender controls, SF Pro Display, and the original angular mark. The screenshot is the supplied current editor, never a fabricated UI. Authors use the existing supplied avatars and Telegram links.

STORY: recognise Dota, see what a custom grid can look like, open the working editor. The catalogue action clearly says it is not yet available.

FIRST VIEWPORT: concise copy and primary action on the left; a large, identifiable editor image on the right. Ten treatments: bleed, detached panels, arched opening, hinged spread, stage, selection frame, panorama, selected surface, sliced image, close view. Mobile stacks copy and image without hiding actions. An image click opens the unmodified source in a dialog; its direct original-image link permits closer inspection in the browser.

FORM: user explicitly requested ten implemented alternatives for later selection in the established editor style; code-led comparison gallery, no extra concept-selection round. No seed: pinned ten-variant brief and unavailable context launcher. A single image reveal and user-driven hover/variant transitions carry motion, with reduced-motion support.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Source

- Editor screenshot: https://i.postimg.cc/6pGNCPyL/chrome-h-XKzu-FA8To.png, explicitly provided by the user on 2026-09-27; stored unchanged at assets/design/editor-landing-reference.png (1280 × 675).
- Since 2026-09-29 (1.6: Lucide icons, «Студия») the file is rendered instead of the screenshot: `server/editor-showcase.mjs` with the recaptured editor (`scripts/capture-editor-template.cjs`) and the same «Marci SWAGA» grid from the workshop (the floating tool dock folded to icons, as in the live picture), 2880 × 1520 scaled to 1280 × 675, `cwebp -q 90`. The live landing picture comes from the same renderer.
- Avatars: existing user-provided assets, origins in assets/design/ATTRIBUTION.md.
- Gallery controls are comparison UI, separate from each proposed landing. Query `v=1` through `v=10` selects a candidate; `clean=1` hides comparison controls.

## Implemented candidates

All candidates retain the original angular GridStudio mark, SF Pro Display, the Focus palette, the same description, and both author pills. The composition changes; the product identity and supplied screenshot do not.

| URL | Name | Composition |
| --- | --- | --- |
| `landing.html?v=1` | За край | Tilted editor image extends beyond the right edge. |
| `landing.html?v=2` | Панели | Canvas, inspector, and tool rail are separated using crops of the supplied image. |
| `landing.html?v=3` | Проём | A tall arched opening contains a closer crop of the editor. |
| `landing.html?v=4` | Разворот | The inspector folds away from the canvas along the image's own panel boundary. |
| `landing.html?v=5` | Сцена | A tilted screen sits above a low plane in the editor's dark materials. |
| `landing.html?v=6` | Выделение | The image is framed as a selected object with corner and rotation handles. |
| `landing.html?v=7` | Панорама | A tall image plane enters from the right with a diagonal leading edge. |
| `landing.html?v=8` | Акцент | A solid lavender copy surface sits beside the tilted editor image. |
| `landing.html?v=9` | Лента | Three horizontal slices of the real screenshot align on hover. |
| `landing.html?v=10` | Крупный план | Large GridStudio lettering accompanies an enlarged crop of the editor artwork. |

The exact shared description is: «Grid Studio — сайт, на котором вы можете создать свою сетку героев используя встроенные инструменты и своё воображение.» The authors remain `@linsissya` and `@dissonance`, linking to `tg://resolve?domain=linsissya` and `tg://resolve?domain=dissonance` respectively, with their existing supplied avatars.

## Routes and behavior

- `landing.html` opens candidate 1. `?v=1` through `?v=10` provides direct links; an invalid value falls back to candidate 1. Add `&clean=1` for a candidate without the comparison controls.
- The numbered buttons, previous/next controls, and left/right arrow keys switch candidates and update browser history. Keyboard switching is suspended while the screenshot dialog is open and for editable fields or modifier shortcuts. Back/Forward restores the URL's candidate. The mobile selector scrolls the active candidate into view.
- «Создать свою сетку» and the editor navigation link open `/editor`. The catalogue control reveals «Каталог ещё готовится. Редактор уже доступен.»; it does not imply a populated public catalogue.
- Every image treatment opens the same complete source in a native dialog. The dialog closes with its labelled button, Escape, or an outside click. «Открыть оригинал» opens the original image asset in a separate browser tab.
- At 700px and below, copy, actions, author links, and image stack vertically. The image-inspection control is visible without hover. Focus outlines and reduced-motion handling are retained.
- Implementation lives in `src/landing/LandingGallery.jsx` and `src/landing/landing.css`. Vite builds `landing.html` alongside the editor and the preserved five-direction `design.html` gallery. Candidate 05 is fixed on `index.html` through `src/landing/home.jsx` and `LandingGallery home`; gallery navigation is omitted there. The editor is built from `editor.html`.

## Inherited design system

The landing's `--lp-*` primitives mirror the established editor background, panel, raised surface, line, text, muted text, accent, and accent-ink values documented in `DESIGN.md`. They are scoped aliases for this gallery. The ten compositions do not replace the editor tokens or the earlier gallery namespaces in `DESIGN.md` and `.impeccable/design.json`.

## Review

All ten candidates were visually inspected on desktop and mobile. Review corrections moved candidate 2's extracted tool rail clear of the copy and kept the active mobile selector in view. The independent finish review identified closer image inspection on mobile as the remaining issue; the dialog now includes a direct original-image link. Final desktop and mobile captures verified that link, and the independent reviewer marked the issue resolved with a **ship** disposition and no visible regressions in those captures. The final verdict covers the scored image-inspection fix; the subsequent user choice is candidate 05 «Сцена».

Browser checks passed for the catalogue explanation, image dialog opening and Escape dismissal, left/right keyboard navigation, and the current public HTTPS build. The browser console was empty. All 98 existing tests, the syntax check, and the production build passed. Final dialog captures are recorded in `.impeccable/review/landing/mobile-dialog.png` and `.impeccable/review/landing/desktop-dialog.png`; the broader candidate captures are in `.impeccable/review/landing/`.

The Impeccable context launcher and automated detector were unavailable because the expected engine 0.1.6 runtime was missing and its cache location was not writable. No automated detector success is claimed. The supplied screenshot remains unchanged at 1280 × 675; its provenance and both avatar sources remain in `assets/design/ATTRIBUTION.md`.


## Selected home — 2026-09-27

Candidate 05 «Сцена» now serves https://gridstudio.me/. The screenshot tilt is reduced to Y −12°, X 4°, Z 1.5°; «героев Dota 2.» remains one unbroken line. The heading scales with its copy column. Production omits gallery controls; the existing comparison gallery remains available. Primary navigation opens /editor, with the editor logo returning home. Verified at 1280, 900, 390 and 320px, including editor navigation and reload. No new visual defects or console warnings/errors were observed.

## Scene refinement — 2026-09-27

This update supersedes earlier image-dialog and navigation descriptions above. The user requested a richer stage and fewer controls. StageArtwork.jsx now renders a bevelled screenshot frame, layered deck, subtle reflection and the original angular logo as background geometry. Its base inclination remains restrained; pointer movement adds only ±1° and is disabled for reduced motion/coarse pointers.

Image inspection is removed. The header has only the brand; GitHub moves to the footer. Both actions are adjacent buttons, and the author credit is one line with a locally stored Apple heart. The Focus favicon has a fresh hashed URL on every entry point. Public desktop/mobile checks passed; the home fits 1280×720, while 390/320px retain adjacent actions and a single-line credit without horizontal overflow. Current captures: .impeccable/review/scene/. The earlier gallery remains a reference, with its shared navigation updated.

### Устойчивая опора сцены — 27 сентября 2026

Экран и платформа находятся в одном .stage-assembly и делят rotateY(-8deg), с общим параллаксом до ±0.6°. Отдельные наклоны X/Z и отражение удалены: нижний край опирается на узкую планку с контактной тенью, передняя грань основания согласована с перспективой экрана. В «Каталог сеток» добавлена SVG-иконка из четырёх ячеек. На 320px две кнопки остаются в одном ряду. Сборка прошла; опубликованная страница проверена на 1280×720, 390px и 320px, каталог работает, консоль без предупреждений/ошибок. Снимки: .impeccable/review/stage-support/.

### Единая 3D-камера сцены — 27 сентября 2026

Предыдущая платформа была плоской SVG-трапецией, повторно повёрнутой вместе со скриншотом. Заменена CSS-геометрией: stage-camera задаёт perspective 220cqw, stage-world с preserve-3d поворачивает сцену на rotateX(-10deg) rotateY(-7deg). Верх платформы повёрнут на 90° к вертикальному экрану; оба сходятся на y=100%. Передняя/боковые грани расположены на соответствующих координатах глубины. Размеры в cqw масштабируются вместе. Фоновой знак использует ту же камеру. Параллакс и анимация камеры удалены. Не применять filter/opacity к stage-world: они сводят 3D-иерархию в плоскость.

Сборка прошла. Публичная версия проверена на 1280×720 и 390px: сцена загружается, главная помещается в desktop-экран, горизонтального переполнения нет, консоль без предупреждений/ошибок. Иконка каталога сохранена. Снимки: .impeccable/review/stage-camera/.

27 сентября 2026: по просьбе пользователя возвращено исходное направление наклона варианта 05, сверенное с .impeccable/review/landing/desktop-05.png. Экран откинут назад rotateX(14deg) вокруг нижнего края, общая сцена rotateZ(1.5deg) rotateX(-10deg) rotateY(-12deg). Нижняя грань остаётся на платформе; предыдущий вертикальный ракурс отменён. Иконка каталога сохранена. Сборка и публичная desktop/mobile проверка прошли, консоль без ошибок; снимки .impeccable/review/original-tilt/.
