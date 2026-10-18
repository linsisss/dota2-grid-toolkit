# Hero depth for the match preview

`assets/match-hero/kotl-depth.png` + `.json` (what `scripts/make-hero-depth.mjs` writes) come from a render of
Keeper of the Light fitted to the HUD capture's world frame (`assets/dota-hud-capture/world.webp`).

1. Serve a folder with `index.html`, links `three` → `node_modules/three`, `hero` → dota-loadout's
   `assets/heroes/keeper_of_the_light`, `items` → its `assets/items`, and a copy of `world.webp`
   (`python3 -m http.server 8765`).
2. `node fit.cjs 9198,9563 kotl_ti7_immortal_idle` — the pose, yaw and place that fit the frame best
   (Playwright, SwiftShader; the camera is the game's: 1200, pitch 60, FOV 70 for 4:3 widened to 16:9).
3. `node export.cjs 9198,9563 '<pose json>' '{"x":800,"y":400,"w":360,"h":320}' depth.json`.
4. `node scripts/make-hero-depth.mjs depth.json` (in the repo).

The hero in the capture rides the TI7 immortal mount (item 9198, its white wings); the staff is the closest
of the ones tried (9563) — the frame's own pixels make the silhouette, the render gives the depth.
