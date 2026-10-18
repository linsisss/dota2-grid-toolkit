// Page script for render.html (run by make.mjs): one unit of «Логово Зауга» frame by frame.
// window.JOB = { unit, file, parts: [{ file, follow: 'bones' | 'wrist_R'…, clip, meshes }], scale (game px per Dota unit),
//   ppu (sprite px per game px), yaw, pitch, clips: [{ name, anim, fps, loop, from, to, still }], bones: [names], light }
// Axes: the glb is y-up, metres, the model facing +z (Dota +x): three (x, y, z) = Dota (−y, z, x) × 0.0254. The
// camera looks from −x (screen right = +z): yaw 0 faces right, 180 faces left; the field's camera is level
// (z 320, the middle of the field) and far (fov 45° at 3000 units), so the units are seen almost from the side.
const J = window.JOB;
const deg = Math.PI / 180, V = () => new THREE.Vector3();
const scene = new THREE.Scene();
const unit = new THREE.Group(), turn = new THREE.Group(), model = new THREE.Group();
scene.add(unit); unit.add(turn); turn.add(model);
model.scale.setScalar(1 / 0.0254);
const main = await loadModel(`/models/${J.file}`);
model.add(main.scene);
const parts = [];
for (const p of J.parts || []) { const g = await loadModel(`/models/${p.file}`); model.add(g.scene); parts.push({ ...p, g }); }

function convert(root, keepMeshes) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    if (keepMeshes && !keepMeshes.some((k) => o.name.includes(k))) { o.visible = false; return; }
    const conv = (m) => new THREE.MeshStandardMaterial({
      name: m.name, map: m.map, color: m.color, roughness: 0.7, metalness: 0, transparent: !!m.transparent && !m.alphaTest, opacity: m.opacity ?? 1,
      emissiveMap: m.emissiveMap || null, emissive: m.emissiveMap ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0), emissiveIntensity: J.emissive ?? 0.9,
      alphaTest: m.alphaTest || 0, side: m.alphaTest || m.transparent ? THREE.DoubleSide : m.side, depthWrite: !m.transparent || !!m.alphaTest,
    });
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
}
convert(main.scene);
for (const p of parts) convert(p.g.scene, p.meshes);

// Light: a cool sky key from above-front-left (the tundra's), warm rim from behind, soft ambient.
const L = J.light || {};
const key = new THREE.DirectionalLight(new THREE.Color(1.0, 0.97, 0.92), L.key ?? 2.6); key.position.set(-1.0, 1.3, -0.4); scene.add(key);
const fill = new THREE.DirectionalLight(new THREE.Color(0.75, 0.85, 1.0), L.fill ?? 0.9); fill.position.set(-1.0, -0.2, 0.8); scene.add(fill);
const rim = new THREE.DirectionalLight(new THREE.Color(0.7, 0.85, 1.0), L.rim ?? 2.0); rim.position.set(1.2, 0.8, 0.3); scene.add(rim);
scene.add(new THREE.HemisphereLight(new THREE.Color(0.66, 0.76, 0.92), new THREE.Color(0.20, 0.24, 0.32), L.hemi ?? 1.4));

const mixers = [new THREE.AnimationMixer(main.scene), ...parts.map((p) => new THREE.AnimationMixer(p.g.scene))];
const clipsOf = (g) => Object.fromEntries(g.animations.map((a) => [a.name, a]));
const mainClips = clipsOf(main);
const byName = (root) => { const m = new Map(); root.traverse((o) => { if (o.isBone && !m.has(o.name)) m.set(o.name, o); }); return m; };
const mainBones = byName(main.scene);
const update = () => scene.updateMatrixWorld(true);

// Parts follow the hero: each bone of a part takes the world transform of the hero's bone of the same name
// (parents first); a part with its own clip (the gauntlet, the artifact) plays it at the same time, its wrist
// pinned to the hero's.
function follow(p) {
  const order = []; p.g.scene.traverse((o) => { if (o.isBone) order.push(o); });
  const pin = new Set(p.pin || []);
  for (const b of order) {
    const src = (p.pin ? pin.has(b.name) : true) ? (p.source?.get(b.name) || mainBones.get(b.name)) : null;
    if (!src) continue;
    const parentWorld = b.parent ? b.parent.matrixWorld : new THREE.Matrix4();
    const local = parentWorld.clone().invert().multiply(src.matrixWorld);
    local.decompose(b.position, b.quaternion, b.scale);
    b.updateMatrixWorld(true);
  }
}
for (const p of parts) if (p.followPart) p.source = byName(parts.find((q) => q.file === p.followPart).g.scene);

function pose(c, t) {
  mixers.forEach((m) => { m.stopAllAction(); });
  if (c.anim && mainClips[c.anim]) { mixers[0].clipAction(mainClips[c.anim]).play(); }
  mixers[0].setTime(t);
  parts.forEach((p, i) => {
    const clips = clipsOf(p.g), name = p.clips?.[c.anim] || c.anim;
    if (clips[name]) { mixers[i + 1].clipAction(clips[name]).play(); mixers[i + 1].setTime(t); }
  });
  update();
  for (const p of parts) if (p.follow !== false) { follow(p); update(); }
}

// Frame times: loops sample [from, to) evenly; one-shots include the last pose.
const plans = [];
for (const c of J.clips) {
  if (c.still != null) { plans.push({ c, times: [c.still] }); continue; }
  const clip = mainClips[c.anim], d = clip ? clip.duration : 0;
  const from = c.from || 0, to = c.to ?? d, span = to - from, times = [];
  if (c.loop) { const n = Math.max(1, Math.round(span * c.fps)); for (let i = 0; i < n; i++) times.push(from + i * span / n); }
  else { const n = Math.round(span * c.fps) + 1; for (let i = 0; i < n; i++) times.push(Math.min(from + i / c.fps, to - 1e-4)); }
  plans.push({ c, times, d });
}

turn.rotation.y = (J.yaw ?? 0) * deg;
const pitch = (J.pitch ?? 0) * deg;
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -20000, 20000);
cam.position.set(-Math.cos(pitch) * 5000, Math.sin(pitch) * 5000, 0); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0);
cam.updateMatrixWorld(true);
unit.scale.setScalar(J.scale); // scene units = game px
const ppu = J.ppu;

// Union of the bounds over every frame (sampled), in camera space.
const view = new THREE.Box3();
const corners = (b) => { const out = []; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push(new THREE.Vector3(x, y, z)); return out; };
for (const p of plans) {
  const stepN = Math.max(1, Math.floor(p.times.length / 30));
  for (let i = 0; i < p.times.length; i += stepN) {
    pose(p.c, p.times[i]);
    const b = new THREE.Box3();
    scene.traverse((o) => { if (o.isMesh && o.visible) b.union(new THREE.Box3().setFromObject(o, true)); });
    for (const v of corners(b)) view.expandByPoint(v.applyMatrix4(cam.matrixWorldInverse));
  }
}
const M = 6 / ppu;
cam.left = Math.floor((view.min.x - M) * ppu) / ppu; cam.right = Math.ceil((view.max.x + M) * ppu) / ppu;
cam.bottom = Math.floor((view.min.y - M) * ppu) / ppu; cam.top = Math.ceil((view.max.y + M) * ppu) / ppu;
cam.updateProjectionMatrix();
const W = Math.round((cam.right - cam.left) * ppu), H = Math.round((cam.top - cam.bottom) * ppu), SS = J.ss || 2;
renderer.setSize(W * SS, H * SS, false);
renderer.setClearColor(0x000000, 0);
const toPx = (v) => { const p = v.clone().project(cam); return [+((p.x + 1) / 2 * W).toFixed(2), +((1 - p.y) / 2 * H).toFixed(2)]; };
const anchor = toPx(new THREE.Vector3(0, 0, 0));

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
// Named bones per frame, in game px from the anchor (y down, like the field).
const boneAt = () => Object.fromEntries((J.bones || []).map((n) => {
  const b = mainBones.get(n);
  if (!b) return [n, null];
  const [x, y] = toPx(b.getWorldPosition(V()));
  return [n, [+((x - anchor[0]) / ppu).toFixed(1), +((y - anchor[1]) / ppu).toFixed(1)]];
}));
const out = {}, clips = {}, bonesPerFrame = {};
for (const p of plans) {
  bonesPerFrame[p.c.name] = [];
  p.times.forEach((t, i) => { pose(p.c, t); out[`${J.unit}/${p.c.name}-${i}.png`] = grab(); bonesPerFrame[p.c.name].push(boneAt()); });
  clips[p.c.name] = { frames: p.times.length, fps: p.c.fps || 1, loop: !!p.c.loop };
}
out.meta = { unit: J.unit, size: [W, H], anchor, clips, bones: bonesPerFrame, scale: J.scale, ppu, anims: main.animations.map((a) => [a.name, +a.duration.toFixed(3)]), allBones: [...mainBones.keys()].length };
return out;
