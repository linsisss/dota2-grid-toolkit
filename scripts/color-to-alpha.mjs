// Takes a known ground out of a picture (GIMP's «colour to alpha»): what was drawn over the ground is left,
// with the least alpha that gives the same pixel over it again. For the menu preview's see-through panels
// (DotaMenu.jsx, 2026-10-22): the top bar and the friends rail are cut from a screenshot, their ground
// is known (Valve's pictures and colours), so the texts, icons and avatars come off it and the page draws
// the ground under them at any opacity.
// data: RGBA pixels (unpremultiplied), changed in place; groundAt(index of a pixel's red byte) → [r, g, b];
// `noise`: a pixel this close to the ground (the largest channel difference) is the ground itself; `darkNoise`,
// the same below the ground (on a near-black ground every level darker is a big step of alpha, so the
// encoder's specks would come out as black dots).
export function colorToAlpha(data, groundAt, noise = 0, darkNoise = noise) {
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const ground = groundAt(i);
    let alpha = 0, light = 0, dark = 0;
    for (let c = 0; c < 3; c++) {
      const d = data[i + c] - ground[c], span = d > 0 ? 255 - ground[c] : ground[c];
      if (d > 0) light = Math.max(light, d); else dark = Math.max(dark, -d);
      if (span > 0) alpha = Math.max(alpha, Math.abs(d) / span);
    }
    if ((light <= noise && dark <= darkNoise) || alpha <= 0) { data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0; continue; }
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(Math.max(0, Math.min(255, ground[c] + (data[i + c] - ground[c]) / alpha)));
    data[i + 3] = Math.round(alpha * data[i + 3]);
  }
  return data;
}
