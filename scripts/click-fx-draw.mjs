// Drawing a click (scripts/click-fx.mjs) on a 2D canvas, in the browser or in Node (@napi-rs/canvas):
// each system, its renderers in order, each over all its particles, as Source draws them. Trails are
// camera-facing quads from the particle back along its way (the texture's bottom — the arrow's tip, as
// m_flFinalTextureScaleV −1 flips it — at the head); world-Z-aligned sprites lie on the ground, projected.
// Colour: the texture times the renderer's colour (shade()), alpha-blended or added. `env` = { image(name)
// → a loaded image or null, canvas(w, h) → a canvas }; `css([x, y])` maps game pixels to the target's.
import { groundQuad, shade, trailQuad } from './click-fx.mjs';

// Sheet textures: a sprite shows the sequence its system names (m_nConstantSequenceNumber, 0-based like the
// sheet's own list — lens_flare.vtex has 10 single-frame sequences from lens_flare_01…11.tga, no 05), its
// uvCropped rect inside the uvUncropped cell, so the picture keeps its place and size in the quad.
// From lens_flare.vtex's VTEX_EXTRA_DATA_SHEET: sequences 8 and 9 are cropped by 8 px of 256 at the top-left
// and 7 px at the bottom-right.
const SHEET = { lens_flare: { crop: [0.03137, 0.03137, 0.02745, 0.02745] } };
const textureOf = (renderer, system) => {
  const name = renderer.m_vecTexturesInput?.[0]?.texture;
  return SHEET[name] ? { name: `${name}_seq${system.def.m_nConstantSequenceNumber ?? 0}`, crop: SHEET[name].crop } : { name, crop: null };
};
const tinted = new Map();
function tint(env, name, colour) {
  const image = env.image(name);
  if (!image) return null;
  const [r, g, b] = colour.map((v) => Math.round(v * 255)), key = `${name}|${r},${g},${b}`;
  if (!tinted.has(key)) {
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height, canvas = env.canvas(width, height), ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(image, 0, 0);
    tinted.set(key, canvas);
  }
  return tinted.get(key);
}
// One textured quad: origin + u (the texture's width) + v (its height), in target px times `scale`.
function quad(ctx, image, [ox, oy], [ux, uy], [vx, vy], scale, { alpha, additive, mode }) {
  if (!Number.isFinite(ox + oy + ux + uy + vx + vy)) return;
  ctx.setTransform((ux * scale) / image.width, (uy * scale) / image.width, (vx * scale) / image.height, (vy * scale) / image.height, ox * scale, oy * scale);
  ctx.globalCompositeOperation = mode || (additive ? 'lighter' : 'source-over');
  ctx.globalAlpha = alpha;
  ctx.drawImage(image, 0, 0);
}
// MOD2X (dst × 2 × src, src = texture × colour faded to 0.5 grey by alpha) cannot be done in one canvas
// pass: the factor m = 1 + (2 · colour · tex − 1) · texA · alpha goes up to 2. It is split exactly into a
// multiply by min(m, 1) and a colour-dodge by 1 − 1 / max(m, 1) (dodge: dst / (1 − s) = dst · m).
const modulated = new Map();
function modulate(env, name, colour, alpha) {
  const image = env.image(name);
  if (!image) return null;
  const a = Math.round(alpha * 64) / 64, key = `${name}|${colour.join(',')}|${a}`;
  if (!modulated.has(key)) {
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height, source = env.canvas(width, height), sctx = source.getContext('2d');
    sctx.drawImage(image, 0, 0);
    const pixels = sctx.getImageData(0, 0, width, height).data, mul = env.canvas(width, height), dodge = env.canvas(width, height);
    const mctx = mul.getContext('2d'), dctx = dodge.getContext('2d'), mdata = mctx.createImageData(width, height), ddata = dctx.createImageData(width, height);
    for (let i = 0; i < pixels.length; i += 4) {
      const ta = (pixels[i + 3] / 255) * a;
      for (let c = 0; c < 3; c++) {
        const m = 1 + (2 * colour[c] * (pixels[i + c] / 255) - 1) * ta;
        mdata.data[i + c] = Math.round(Math.min(m, 1) * 255);
        ddata.data[i + c] = Math.round((1 - 1 / Math.max(m, 1)) * 255);
      }
      mdata.data[i + 3] = ddata.data[i + 3] = 255;
    }
    mctx.putImageData(mdata, 0, 0); dctx.putImageData(ddata, 0, 0);
    modulated.set(key, { mul, dodge });
    if (modulated.size > 400) modulated.delete(modulated.keys().next().value);
  }
  return modulated.get(key);
}
// The quad's corners for a ground-aligned strip segment of a rope, in game pixels.
function ropeSegments(system, renderer, cam) {
  const points = system.particles.slice().sort((a, b) => a.index - b.index);
  if (points.length < 2) return [];
  const steps = Math.max(1, renderer.m_nMaxTesselation ?? 0), path = [];
  // Catmull-Rom through the particles (m_nMin/MaxTesselation segments between two).
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const at = (k) => 0.5 * (2 * p1.pos[k] + (-p0.pos[k] + p2.pos[k]) * t + (2 * p0.pos[k] - 5 * p1.pos[k] + 4 * p2.pos[k] - p3.pos[k]) * t2 + (-p0.pos[k] + 3 * p1.pos[k] - 3 * p2.pos[k] + p3.pos[k]) * t3);
      const lerp = (key) => p1[key] + (p2[key] - p1[key]) * t;
      path.push({ pos: [at(0), at(1), at(2)], radius: lerp('radius'), alpha: lerp('alpha'), alpha2: lerp('alpha2'), colour: p1.colour });
    }
  }
  const last = points[points.length - 1];
  path.push({ pos: last.pos, radius: last.radius, alpha: last.alpha, alpha2: last.alpha2, colour: last.colour });
  const out = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], dx = b.pos[0] - a.pos[0], dy = b.pos[1] - a.pos[1], len = Math.hypot(dx, dy) || 1;
    // Flat on the ground (the particle normal is up): the width runs across the segment in the ground plane.
    const nx = -dy / len, ny = dx / len, half = a.radius * (renderer.m_flRadiusScale ?? 1);
    const corner = (p, side) => cam.project([p.pos[0] + nx * half * side, p.pos[1] + ny * half * side, p.pos[2]]);
    out.push({ particle: a, corners: [corner(a, -1), corner(a, 1), corner(b, -1)] });
  }
  return out;
}
// The hero's depth hides the passes that test depth (m_bDisableZBuffering off), as the game's z-buffer does:
// a quad is drawn on a scratch canvas, the hero's pixels nearer than the particle (its depth minus
// m_flDepthBias) are cut out of it, and the rest goes on the target. `env.occluder(depth)` → { image, box }
// (the hero's pixels nearer than `depth`, game pixels) or null; `env.scratch(target)` → a canvas like it.
function occludedQuad(ctx, image, o, u, v, scale, look, env, css, depth) {
  const cut = env.occluder?.(depth);
  if (!cut) return quad(ctx, image, o, u, v, scale, look);
  // Only the quad's own pixels are worked on (its bounding box, in canvas pixels).
  const xs = [o[0], o[0] + u[0], o[0] + v[0], o[0] + u[0] + v[0]].map((n) => n * scale), ys = [o[1], o[1] + u[1], o[1] + v[1], o[1] + u[1] + v[1]].map((n) => n * scale);
  const { box } = cut, a = css([box.x, box.y]), b = css([box.x + box.w, box.y]), c = css([box.x, box.y + box.h]);
  const bx = Math.max(0, Math.floor(Math.min(...xs)) - 2), by = Math.max(0, Math.floor(Math.min(...ys)) - 2);
  const scratch = env.scratch(ctx), bw = Math.min(scratch.width, Math.ceil(Math.max(...xs)) + 2) - bx, bh = Math.min(scratch.height, Math.ceil(Math.max(...ys)) + 2) - by;
  if (!(bw > 0 && bh > 0)) return;
  // Clear of the hero's box: drawn as it is.
  if (bx > b[0] * scale || bx + bw < a[0] * scale || by > c[1] * scale || by + bh < a[1] * scale) return quad(ctx, image, o, u, v, scale, look);
  const sctx = scratch.getContext('2d');
  sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalCompositeOperation = 'source-over'; sctx.globalAlpha = 1; sctx.clearRect(bx, by, bw, bh);
  sctx.save(); sctx.beginPath(); sctx.rect(bx, by, bw, bh); sctx.clip();
  quad(sctx, image, o, u, v, scale, { ...look, additive: false, mode: look.mode && look.mode !== 'lighter' ? 'source-over' : undefined });
  quad(sctx, cut.image, a, [b[0] - a[0], b[1] - a[1]], [c[0] - a[0], c[1] - a[1]], scale, { alpha: 1, mode: 'destination-out' });
  sctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = look.mode || (look.additive ? 'lighter' : 'source-over');
  ctx.drawImage(scratch, bx, by, bw, bh, bx, by, bw, bh);
}
export function drawEffect(ctx, effect, css, scale, env, cam) {
  const k = css([1, 0])[0] - css([0, 0])[0];
  for (const system of effect.systems()) {
    for (const renderer of system.def.renderers || []) {
      const { name, crop } = textureOf(renderer, system), mod2x = renderer.m_nOutputBlendMode === 'PARTICLE_OUTPUT_BLEND_MODE_MOD2X';
      const items = renderer._class === 'C_OP_RenderRopes' ? ropeSegments(system, renderer, cam) : system.particles.map((p) => ({ particle: p }));
      const tested = !renderer.m_bDisableZBuffering, bias = renderer.m_flDepthBias ?? 0;
      for (const { particle: p, corners } of items) {
        const look = shade(p, renderer), depth = tested ? cam.project(p.pos)[2] - bias : Infinity;
        if (look.alpha <= 0) continue;
        let o, u, v;
        if (renderer._class === 'C_OP_RenderTrails') {
          const q = trailQuad(p, renderer, cam);
          if (!q) continue;
          const half = ((q.headHalf + q.tailHalf) / 2) * k, tail = css(q.tail), head = css(q.head);
          o = [tail[0] + q.left[0] * half, tail[1] + q.left[1] * half]; u = [-q.left[0] * 2 * half, -q.left[1] * 2 * half]; v = [head[0] - tail[0], head[1] - tail[1]];
        } else if (renderer._class === 'C_OP_RenderSprites' || renderer._class === 'C_OP_RenderRopes') {
          const [a, b, c] = (corners || groundQuad(p, renderer, cam)).map((point) => css(point));
          o = a; u = [b[0] - a[0], b[1] - a[1]]; v = [c[0] - a[0], c[1] - a[1]];
          if (crop) {
            const [l, t, r, bottom] = crop;
            o = [o[0] + u[0] * l + v[0] * t, o[1] + u[1] * l + v[1] * t]; u = u.map((x) => x * (1 - l - r)); v = v.map((x) => x * (1 - t - bottom));
          }
        } else continue;
        if (mod2x) {
          const layers = modulate(env, name, look.colour, look.alpha), target = env.modLayers?.(ctx);
          if (!layers || !target) continue;
          occludedQuad(target.multiply, layers.mul, o, u, v, scale, { alpha: 1, mode: target.multiplyMode }, env, css, depth);
          occludedQuad(target.dodge, layers.dodge, o, u, v, scale, { alpha: 1, mode: target.dodgeMode }, env, css, depth);
          continue;
        }
        const image = tint(env, name, look.colour);
        if (!image) continue;
        occludedQuad(ctx, image, o, u, v, scale, look, env, css, depth);
        // m_flAddSelfAmount: the sprite's colour added once more, scaled by it.
        if (look.addSelf > 0 && !look.additive) occludedQuad(ctx, image, o, u, v, scale, { alpha: Math.min(1, look.alpha * look.addSelf), additive: true }, env, css, depth);
      }
    }
  }
  for (const target of [ctx, env.modLayers?.(ctx)?.multiply, env.modLayers?.(ctx)?.dodge]) if (target) { target.setTransform(1, 0, 0, 1, 0, 0); target.globalAlpha = 1; target.globalCompositeOperation = 'source-over'; }
}

// Dota's drag-selection box, as client.dll draws it (FUN_181df00d0, which also checks dota_draw_simple_selection_box: 36 vertices = 9
// quads, coloured 0xAABBGGRR, drawn while the input state is 6 = drag-selecting and the box is more than
// 3 px wide and tall; dota_draw_simple_selection_box 0 by default — 1 draws only a 1-px outline):
//   - a 1-px opaque green line on each side, just outside the dragged rectangle (0xff00ff00);
//   - a 3-px band at a quarter alpha over each line (0x4000ff00);
//   - inside, a vertical gradient from alpha 16/255 at the top (0x1000ff00) down to
//     0.0627451 − (height / max(100, view)) × 0.2 at the bottom; when that goes below 0, the gradient
//     ends at alpha 0 at top + view × 0.3137255 and the rest stays clear.
// `rect` = [x0, y0, x1, y1] in game pixels (any order), `view` = the view size the game passes (taken as the
// screen height, 1080).
export function drawSelectionBox(ctx, rect, css, scale, { view = 1080 } = {}) {
  const x0 = Math.round(Math.min(rect[0], rect[2])), x1 = Math.round(Math.max(rect[0], rect[2])), y0 = Math.round(Math.min(rect[1], rect[3])), y1 = Math.round(Math.max(rect[1], rect[3]));
  if (!(x1 - x0 > 3 && y1 - y0 > 3)) return false;
  const solid = 'rgba(0,255,0,1)', glow = `rgba(0,255,0,${0x40 / 255})`;
  const quads = [
    [x0, y0 - 1, x1 + 1, y0, solid], [x0 + 1, y0 - 2, x1 - 1, y0 + 1, glow],
    [x0, y1, x1 + 1, y1 + 1, solid], [x0 + 1, y1 - 1, x1 - 1, y1 + 2, glow],
    [x0 - 1, y0 - 1, x0, y1 + 1, solid], [x0 - 2, y0 - 2, x0 + 1, y1 + 2, glow],
    [x1, y0 - 1, x1 + 1, y1 + 1, solid], [x1 - 1, y0 - 2, x1 + 2, y1 + 2, glow]
  ];
  const at = (x, y) => css([x, y]);
  ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  for (const [ax, ay, bx, by, colour] of quads) {
    const [px, py] = at(ax, ay), [qx, qy] = at(bx, by);
    ctx.fillStyle = colour; ctx.fillRect(px, py, qx - px, qy - py);
  }
  const span = Math.max(100, view), top = y0 + 1, bottomAlpha = 0.0627451 - ((y1 - 1 - top) / span) * 0.2;
  const end = bottomAlpha >= 0 ? y1 - 1 : Math.round(span * 0.3137255 + top);
  const [fx, fy] = at(x0 + 1, top), [gx, gy] = at(x1 - 1, end), gradient = ctx.createLinearGradient(0, fy, 0, gy);
  gradient.addColorStop(0, `rgba(0,255,0,${0x10 / 255})`); gradient.addColorStop(1, `rgba(0,255,0,${Math.max(0, Math.floor(bottomAlpha * 255)) / 255})`);
  ctx.fillStyle = gradient; ctx.fillRect(fx, fy, gx - fx, gy - fy);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return true;
}

// The hero's depth (assets/match-hero, scripts/make-hero-depth.mjs) as occluders for drawEffect: pixels nearer
// than a depth, in 5-unit steps, made once each. `data` = { box, near, far, alpha: Uint8Array, depth: Float32Array }.
export function heroOccluder(data, canvas) {
  const made = new Map(), { box } = data;
  return (depth) => {
    if (!(depth < Infinity) || depth <= data.near) return null;
    const step = Math.min(Math.ceil(depth / 5) * 5, Math.ceil(data.far / 5) * 5 + 5);
    if (!made.has(step)) {
      const c = canvas(box.w, box.h), cctx = c.getContext('2d'), image = cctx.createImageData(box.w, box.h);
      for (let i = 0; i < box.w * box.h; i++) if ((data.hit || data.alpha)[i] && data.depth[i] < step) image.data[i * 4 + 3] = 255;
      cctx.putImageData(image, 0, 0);
      made.set(step, { image: c, box });
    }
    return made.get(step);
  };
}
// Decodes the PNG's pixels (R = depth from near to far, G = the hero) into that data.
export function heroDepthData(meta, rgba) {
  const n = meta.box.w * meta.box.h, alpha = new Uint8Array(n), depth = new Float32Array(n);
  for (let i = 0; i < n; i++) { alpha[i] = rgba[i * 4 + 1] > 127 ? 1 : 0; depth[i] = meta.near + (rgba[i * 4] / 255) * (meta.far - meta.near); }
  // The silhouette closed by 8 px, for the cursor and the depth test: the dark folds the colour cut leaves out
  // (the rider's robe and the mount's legs in shadow, between him and the wing) are him too, and the game
  // picks a unit by its bounds anyway.
  const { w, h } = meta.box, r = 8;
  const pass = (src, keep) => { const a = new Uint8Array(n), b = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = keep; for (let k = -r; k <= r && v === keep; k++) { const xx = x + k; if (xx >= 0 && xx < w && src[y * w + xx] !== keep) v = 1 - keep; } a[y * w + x] = v; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = keep; for (let k = -r; k <= r && v === keep; k++) { const yy = y + k; if (yy >= 0 && yy < h && a[yy * w + x] !== keep) v = 1 - keep; } b[y * w + x] = v; }
    return b; };
  const hit = pass(pass(alpha, 0), 1);
  return { ...meta, alpha, depth, hit };
}
