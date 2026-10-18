// Page script for render.html (run by make.mjs): renders one unit of «Терновый трон» frame by frame, every
// rendered facing, and hands each frame to window.saveFrame(name, dataURL).
// window.JOB = a units.mjs unit + { ppu, pitch, ss, renderDirs, skins: { material: url }, partSkins: [{…}] }.
// Axes: the glb is y-up, metres, the model facing +z with its left at +x, i.e. three (x, y, z) = Dota (y, z, x)
// × 0.0254. Dota facing θ (counter-clockwise from east, seen from above) = rotation.y θ. The camera looks north
// (three +x) from the south, pitched 45° down: screen right = east (+z), screen up = (north + up)/√2.
const J = window.JOB;
const deg = Math.PI / 180, V = () => new THREE.Vector3();
const scene = new THREE.Scene();
// unit = the ground point under the feet, scaled by the vdata scale (world units = Dota units at the baked scale);
// turn = facing; lift = raises pickups whose origin is their centre; slide = cancels root motion of loops.
const unit = new THREE.Group(), turn = new THREE.Group(), lift = new THREE.Group(), slide = new THREE.Group(), model = new THREE.Group();
scene.add(unit); unit.add(turn); turn.add(lift); lift.add(slide); slide.add(model);
unit.scale.setScalar(J.scale);
model.scale.setScalar(1 / 0.0254);
lift.position.y = (J.lift || 0) / J.scale;
const main = await loadModel(`/models/${J.file}/${J.file}.glb`);
model.add(main.scene);
const parts = [];
for (const p of J.parts || []) { const g = await loadModel(`/models/${p.file}/${p.file}.glb`); model.add(g.scene); parts.push({ ...p, g }); }

// Nothing shows below the ground (corpses that sink, pot shards); the ball and pickups are not clipped.
const ground = J.clip === false ? [] : [new THREE.Plane(new THREE.Vector3(0, 1, 0), 1)];
renderer.localClippingEnabled = true;
const texLoader = new THREE.TextureLoader();
const loadTex = async (url) => { const t = await texLoader.loadAsync(url); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; return t; };
const base = (name) => (name || '').replace(/^.*[\\/]/, '').replace(/\.vmat$/, '');
// Materials: base colour (+ the skin's colour texture) + the self-illumination mask as emissive, alpha-tested
// cut-outs; style mesh groups and smears hidden.
async function convert(root, { show, hideMats, skins }) {
  const tex = {};
  for (const [m, url] of Object.entries(skins || {})) tex[m] = await loadTex(url);
  // recolor: the texture's luminance times a colour (baby Roshan's gold skin is a grey metal texture in hero.vfx).
  if (J.recolor) for (const [m, t] of Object.entries(tex)) {
    const img = t.image, cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0); const id = cx.getImageData(0, 0, cv.width, cv.height), d = id.data, c = J.recolor;
    for (let i = 0; i < d.length; i += 4) { const l = Math.min(255, (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) * 1.5); d[i] = l * c[0] / 255; d[i + 1] = l * c[1] / 255; d[i + 2] = l * c[2] / 255; }
    cx.putImageData(id, 0, 0); const n = new THREE.CanvasTexture(cv); n.flipY = false; n.colorSpace = THREE.SRGBColorSpace; tex[m] = n;
  }
  const showRe = show && show.map((s) => new RegExp(s, 'i')), hideRe = (hideMats || []).map((s) => new RegExp(s, 'i'));
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const names = []; for (let q = o; q && q !== root; q = q.parent) names.push(q.name);
    if (showRe && !showRe.some((r) => names.some((n) => r.test(n)))) { o.visible = false; return; }
    if (names.some((n) => /_dummy/.test(n))) { o.visible = false; return; }
    const conv = (m) => {
      if (hideRe.some((r) => r.test(m.name))) return null;
      return new THREE.MeshStandardMaterial({
        name: m.name, map: tex[base(m.name)] || m.map, color: m.color, roughness: 0.75, metalness: 0,
        emissiveMap: m.emissiveMap || null, emissive: m.emissiveMap ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0), emissiveIntensity: J.emissive ?? 0.6,
        alphaTest: m.alphaTest || (m.transparent ? 0.35 : 0), transparent: false, clippingPlanes: ground,
        side: m.alphaTest || m.transparent ? THREE.DoubleSide : m.side,
      });
    };
    const mats = (Array.isArray(o.material) ? o.material : [o.material]).map(conv);
    if (mats.every((m) => !m)) { o.visible = false; return; }
    o.material = Array.isArray(o.material) ? mats.map((m) => m || new THREE.MeshBasicMaterial({ visible: false })) : mats[0];
  });
}
await convert(main.scene, { show: J.show, hideMats: J.hideMats, skins: J.skins });
for (const [i, p] of parts.entries()) await convert(p.g.scene, { show: p.show, hideMats: J.hideMats, skins: (J.partSkins || [])[i] });

// Light: Valve's global light (direction [0.32, 0.56, -0.77], colour 233 194 182, ambient 172 163 152) comes
// from the south-west above; a soft fill from the camera and a cool-pink rim from behind keep the silhouettes
// readable on the dark palace floor. Dota (x, y, z) → three (y, z, x).
const L = J.light || {};
const dota = (x, y, z) => new THREE.Vector3(y, z, x);
const key = new THREE.DirectionalLight(new THREE.Color('rgb(233,194,182)'), L.key ?? 3.4); key.position.copy(dota(-0.32, -0.56, 0.77)); scene.add(key);
const fill = new THREE.DirectionalLight(new THREE.Color('rgb(190,200,235)'), L.fill ?? 0.8); fill.position.copy(dota(0.4, -1, 0.7)); scene.add(fill);
const rim = new THREE.DirectionalLight(new THREE.Color('rgb(235,190,255)'), L.rim ?? 1.6); rim.position.copy(dota(0.3, 1, 0.45)); scene.add(rim);
scene.add(new THREE.HemisphereLight(new THREE.Color('rgb(172,163,152)'), new THREE.Color('rgb(70,52,78)'), L.hemi ?? 1.8));

const mixers = [new THREE.AnimationMixer(main.scene), ...parts.map((p) => new THREE.AnimationMixer(p.g.scene))];
const clipByName = Object.fromEntries(main.animations.map((a) => [a.name, a]));
const byName = (root) => { const m = new Map(); root.traverse((o) => { if (o.isBone && !m.has(o.name)) m.set(o.name, o); }); return m; };
const mainBones = byName(main.scene), bones = [...mainBones.values()];
let rootBone = null; main.scene.traverse((o) => { if (!rootBone && o.isBone) rootBone = o; });
const update = () => scene.updateMatrixWorld(true);
// Wearables follow the hero: each bone of a part takes the world transform of the hero's bone of the same name.
const partBones = parts.map((p) => { const order = []; p.g.scene.traverse((o) => { if (o.isBone) order.push(o); }); return order.filter((b) => mainBones.has(b.name)); });
function follow(i) {
  for (const b of partBones[i]) {
    const src = mainBones.get(b.name);
    const local = b.parent.matrixWorld.clone().invert().multiply(src.matrixWorld);
    local.decompose(b.position, b.quaternion, b.scale);
    b.updateMatrixWorld(true);
  }
}
function pose(c, t) {
  mixers.forEach((m) => { m.stopAllAction(); m.uncacheRoot(m.getRoot()); });
  if (c.anim && clipByName[c.anim]) { mixers[0].clipAction(clipByName[c.anim]).play(); mixers[0].setTime(t); }
  update();
  parts.forEach((p, i) => follow(i));
  update();
}
// Pose signature: bone positions relative to the root bone's ground point (world units; root motion does not count).
const sig = () => { const r = rootBone ? rootBone.getWorldPosition(V()) : V(); r.y = 0; return bones.map((b) => b.getWorldPosition(V()).sub(r)); };
const diff = (p, q) => p.length ? Math.max(...p.map((v, i) => v.distanceTo(q[i]))) : 0;

// Model height (world units) in the bind/first pose, for tolerances.
pose(J.clips[0], J.clips[0].still ?? 0);
const box0 = new THREE.Box3().setFromObject(lift, true), height0 = Math.max(10, box0.max.y - Math.max(0, box0.min.y));

// Frame times per clip. Loops: part 'auto' finds k equal cycles in the clip (pose k·P apart within 3 % of the
// height) and keeps one; [from, to) is sampled evenly and root motion is cancelled linearly. One-shots include
// the last pose; trim cuts the near-still tail (< trimTol, 6 % of the height, of motion left); max lowers the fps.
const plans = [], notes = [];
for (const c of J.clips) {
  const clip = c.anim ? clipByName[c.anim] : null;
  if (c.anim && !clip) throw new Error(`${J.key}: no clip ${c.anim}`);
  if (c.still != null) { plans.push({ c, times: [c.still], drift: V(), start: V(), from: 0, span: 0, fps: 1 }); continue; }
  const d = clip.duration;
  let from = c.from || 0, to = c.to ?? d, k = 1;
  let seam = null;
  if (c.part === 'auto' && d > 0.3) {
    const step = 1 / 30, sigs = []; for (let t = 0; t <= d + 1e-6; t += step) { pose(c, Math.min(t, d - 1e-4)); sigs.push(sig()); }
    for (let n = 8; n >= 2; n--) {
      const P = d / n; if (P < 0.35) continue;
      const off = Math.round(P / step); let err = 0;
      for (let i = 0; i + off < sigs.length; i++) err = Math.max(err, diff(sigs[i], sigs[i + off]));
      if (err < 0.03 * height0) { k = n; break; }
    }
    to = from + (to - from) / k;
    // Not k equal cycles (variations, a clip that is several different steps): the first local minimum of the
    // distance to the first pose after 0.35 s that comes within 6 % of the height closes one cycle.
    if (k === 1 && d > 1.2) {
      const D = sigs.map((q) => diff(q, sigs[0])), tol = (c.seamTol ?? 0.06) * height0;
      for (let i = Math.ceil(0.35 / step); i < D.length - 1; i++) if (D[i] <= D[i - 1] && D[i] <= D[i + 1] && D[i] < tol) { to = from + i * step; seam = D[i]; break; }
      const mins = []; for (let i = Math.ceil(0.35 / step); i < D.length - 1; i++) if (D[i] <= D[i - 1] && D[i] <= D[i + 1] && D[i] < 0.2 * height0) mins.push(`${(i * step).toFixed(2)}:${D[i].toFixed(0)}`);
      notes.push(`  ${c.anim} minima (s:units, height ${height0.toFixed(0)}): ${mins.join(' ')}`);
    }
  } else if (typeof c.part === 'number') { k = c.part; to = from + (to - from) / k; }
  if (c.span) to = from + c.span;
  let drift = V(), start = V();
  if (c.loop && rootBone && clip) {
    const root = (t) => { pose(c, t); const p = lift.worldToLocal(rootBone.getWorldPosition(V())); p.y = 0; return p; };
    const z = root(0), a = root(from), b = root(to - 1e-4);
    drift = b.sub(a); if (drift.length() < 4 / J.scale) drift.set(0, 0, 0); else start = a.sub(z);
  }
  let fps = c.fps;
  if (!c.loop && c.trim) {
    pose(c, to - 1e-4); const end = sig(); let last = from;
    for (let t = from; t < to; t += 1 / 60) { pose(c, t); if (diff(sig(), end) > (c.trimTol ?? 0.06) * height0) last = t; }
    to = Math.min(to, last + 1.5 / fps);
  }
  const span = to - from, times = [];
  if (c.loop) {
    let n = Math.max(1, Math.round(span * fps)); if (c.max && n > c.max) n = c.max;
    for (let i = 0; i < n; i++) times.push(from + i * span / n);
    fps = n / span;
  } else {
    let n = Math.round(span * fps) + 1;
    if (c.max && n > c.max) { n = c.max; fps = (n - 1) / span; }
    for (let i = 0; i < n; i++) times.push(Math.min(from + i / fps, to - 1e-4));
  }
  notes.push(`${c.name} ← ${c.anim} ${d.toFixed(2)} s${k > 1 ? ` (1 of ${k} cycles)` : ''}${seam != null ? ` (first cycle, seam ${seam.toFixed(1)} u)` : ''}, used ${from.toFixed(2)}–${to.toFixed(2)}, ${times.length} frames @ ${fps.toFixed(2)}`);
  plans.push({ c, times, drift, start, from, span, d, fps });
}
const place = (p, t, i) => {
  pose(p.c, t);
  slide.position.set(0, 0, 0);
  if (p.drift.lengthSq()) slide.position.copy(p.drift).multiplyScalar(-(t - p.from) / p.span).sub(p.start);
  update();
};

// Camera: orthographic, looking north from the south, pitched down.
const pitch = (J.pitch ?? 45) * deg;
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -20000, 20000);
cam.position.set(-Math.cos(pitch) * 5000, Math.sin(pitch) * 5000, 0); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0);
cam.updateMatrixWorld(true);
const dirs = J.dirs === 1 ? [null] : J.renderDirs;
const yawOf = (d) => (d == null ? J.yaw ?? 270 : d * 45) * deg;
const spinOf = (p, i) => p.c.spin ? p.c.spin * deg * i / p.times.length : 0;

// The bounds: per sampled frame the unturned world box, its corners turned to every direction, in camera space.
const view = new THREE.Box3();
const corners = (b) => { const out = []; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push(new THREE.Vector3(x, y, z)); return out; };
let dotaBox = null;
const visibleBox = () => { const b = new THREE.Box3(); turn.rotation.y = 0; update(); scene.traverse((o) => { if (o.isMesh && o.visible) b.union(new THREE.Box3().setFromObject(o, true)); }); return b; };
for (const p of plans) {
  const stepN = Math.max(1, Math.floor(p.times.length / 12));
  for (let i = 0; i < p.times.length; i += stepN) {
    place(p, p.times[i], i);
    const b = visibleBox();
    if (ground.length) b.min.y = Math.max(b.min.y, -1);
    if (!dotaBox) dotaBox = b.clone();
    for (const d of dirs) {
      const rot = new THREE.Matrix4().makeRotationY(yawOf(d) + spinOf(p, i));
      for (const v of corners(b)) view.expandByPoint(v.applyMatrix4(rot).applyMatrix4(cam.matrixWorldInverse));
    }
    if (p.c.spin) for (let s = 0; s < 8; s++) { const rot = new THREE.Matrix4().makeRotationY(s * 45 * deg); for (const v of corners(b)) view.expandByPoint(v.applyMatrix4(rot).applyMatrix4(cam.matrixWorldInverse)); }
  }
}
const ppu = J.ppu, M = 4 / ppu;
cam.left = Math.floor((view.min.x - M) * ppu) / ppu; cam.right = Math.ceil((view.max.x + M) * ppu) / ppu;
cam.bottom = Math.floor((view.min.y - M) * ppu) / ppu; cam.top = Math.ceil((view.max.y + M) * ppu) / ppu;
cam.updateProjectionMatrix();
const W = Math.round((cam.right - cam.left) * ppu), H = Math.round((cam.top - cam.bottom) * ppu), SS = J.ss || 2;
renderer.setSize(W * SS, H * SS, false);
const toPx = (v) => { const q = v.clone().project(cam); return [+((q.x + 1) / 2 * W).toFixed(2), +((1 - q.y) / 2 * H).toFixed(2)]; };
const anchor = toPx(new THREE.Vector3(0, 0, 0));

// Render, then a box filter (premultiplied) down to the sprite size.
const big = document.createElement('canvas'); big.width = W * SS; big.height = H * SS; const bx = big.getContext('2d', { willReadFrequently: true });
const small = document.createElement('canvas'); small.width = W; small.height = H; const sx = small.getContext('2d');
function grab() {
  renderer.render(scene, cam);
  bx.clearRect(0, 0, big.width, big.height); bx.drawImage(renderer.domElement, 0, 0);
  const src = bx.getImageData(0, 0, big.width, big.height).data, out = sx.createImageData(W, H), dst = out.data, n = SS * SS;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const k = ((y * SS + j) * big.width + x * SS + i) * 4, al = src[k + 3];
      r += src[k] * al; g += src[k + 1] * al; b += src[k + 2] * al; a += al;
    }
    const k = (y * W + x) * 4;
    if (a) { dst[k] = r / a; dst[k + 1] = g / a; dst[k + 2] = b / a; dst[k + 3] = a / n; }
  }
  sx.putImageData(out, 0, 0);
  return small.toDataURL('image/png');
}
const clips = {};
for (const p of plans) {
  for (const d of dirs) {
    for (const [i, t] of p.times.entries()) {
      place(p, t, i);
      turn.rotation.y = yawOf(d) + spinOf(p, i); update();
      await window.saveFrame(`${J.key}/${p.c.name}-${d ?? 0}-${i}.png`, grab());
    }
  }
  clips[p.c.name] = { frames: p.times.length, fps: +p.fps.toFixed(3), loop: !!p.c.loop, duration: +(p.times.length / p.fps).toFixed(3), anim: p.c.anim, used: [+p.from.toFixed(3), +(p.from + p.span).toFixed(3)] };
}
// Footprint radius and height (Dota units at the baked scale) from the first frame's box: three x = Dota y, z = Dota x.
const radius = Math.round(((dotaBox.max.x - dotaBox.min.x) + (dotaBox.max.z - dotaBox.min.z)) / 4), height = Math.round(dotaBox.max.y);
window.saveMeta({ key: J.key, size: [W, H], anchor, clips, dirs: dirs.map((d) => d ?? 0), radius, height, scale: J.scale, ppu, notes,
  box: { x: [dotaBox.min.z, dotaBox.max.z].map(Math.round), y: [dotaBox.min.x, dotaBox.max.x].map(Math.round), z: [dotaBox.min.y, dotaBox.max.y].map(Math.round) } });
return 'ok';
