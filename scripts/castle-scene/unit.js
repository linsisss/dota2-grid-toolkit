// Page script for render.html (run by make.mjs): renders one unit of «Замкобой» frame by frame.
// window.JOB = { unit, file, scale, lift (game px), clip, ppu, ss, yaw, pitch, bones: [names to locate],
//   clips: [{ name, anim, fps, loop, from, to, part, trim, still, add, liftTo }], rocket: length in game px (the rocket only) }
// Axes: the glb is y-up with the model facing +z (Dota +x), so three (x, y, z) = Dota (-y, z, x) in units after
// the 1/0.0254 scale. The camera looks from -x (screen right = +z), pitched down; the unit turns towards it.
const J = window.JOB;
const deg = Math.PI / 180, V = () => new THREE.Vector3();
const gltf = await loadModel(`/models/${J.file}`);
const scene = new THREE.Scene();
// unit = the game position (ground point under the feet); turn = facing; lift = vdata model offset;
// slide = cancels root motion of walk cycles; model = metres → Dota units.
const unit = new THREE.Group(), turn = new THREE.Group(), lift = new THREE.Group(), slide = new THREE.Group(), model = new THREE.Group();
scene.add(unit); unit.add(turn); turn.add(lift); lift.add(slide); slide.add(model); model.add(gltf.scene);
model.scale.setScalar(1 / 0.0254);
const LIFT = (J.lift || 0) / J.scale; // the vdata offset is in scene units = game px
const base = new THREE.Vector3(0, LIFT, 0); lift.position.copy(base);
// Nothing shows below the ground line (corpses that sink, Snapfire's death); the rocket is not clipped.
const ground = J.rocket || J.clip === false ? [] : [new THREE.Plane(new THREE.Vector3(0, 1, 0), 1)];
renderer.localClippingEnabled = true;

// Materials: base colour + emissive, alpha-tested cut-outs, no maps we do not have.
gltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  o.frustumCulled = false;
  const conv = (m) => {
    const n = new THREE.MeshStandardMaterial({
      name: m.name, map: m.map, color: m.color, roughness: 0.72, metalness: 0,
      emissiveMap: m.emissiveMap || null, emissive: m.emissiveMap ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0), emissiveIntensity: J.emissive ?? 0.8,
      alphaTest: m.alphaTest || 0, transparent: false, clippingPlanes: ground, side: m.alphaTest ? THREE.DoubleSide : m.side,
    });
    return n;
  };
  o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
});

// Lights: warm key from upper-left-front, soft fill, cool sky/ground ambient, cool rim from behind.
const key = new THREE.DirectionalLight(new THREE.Color(1.0, 0.93, 0.82), J.key ?? 3.1); key.position.set(-1.0, 1.25, -0.75); scene.add(key);
const fill = new THREE.DirectionalLight(new THREE.Color(0.80, 0.86, 1.0), J.fill ?? 0.7); fill.position.set(-1.0, 0.2, 1.0); scene.add(fill);
const rim = new THREE.DirectionalLight(new THREE.Color(0.62, 0.78, 1.0), J.rim ?? 2.2); rim.position.set(1.2, 0.8, 0.35); scene.add(rim);
const rim2 = new THREE.DirectionalLight(new THREE.Color(0.62, 0.78, 1.0), (J.rim ?? 2.2) * 0.6); rim2.position.set(0.8, 0.5, -1.0); scene.add(rim2);
scene.add(new THREE.HemisphereLight(new THREE.Color(0.62, 0.72, 0.90), new THREE.Color(0.22, 0.24, 0.30), J.hemi ?? 1.3));

const mixer = new THREE.AnimationMixer(gltf.scene);
const clipByName = Object.fromEntries(gltf.animations.map((a) => [a.name, a]));
let rootBone = null; gltf.scene.traverse((o) => { if (!rootBone && o.isBone) rootBone = o; });
const bones = []; gltf.scene.traverse((o) => { if (o.isBone) bones.push(o); });
const update = () => scene.updateMatrixWorld(true);

// Poses: one action (plus an optional additive layer), time t.
function pose(c, t) {
  mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
  if (c.anim) {
    const a = mixer.clipAction(clipByName[c.add || c.anim]); a.play();
    if (c.add) { const clip = clipByName[c.anim]; clip.blendMode = THREE.AdditiveAnimationBlendMode; const b = mixer.clipAction(clip); b.blendMode = THREE.AdditiveAnimationBlendMode; b.play(); }
  }
  mixer.setTime(t);
  update();
}
// Pose signature: bone positions relative to the root bone's ground point (root motion does not count).
const sig = () => { const r = rootBone.getWorldPosition(V()); r.y = 0; return bones.map((b) => b.getWorldPosition(V()).sub(r)); };
const diff = (p, q) => Math.max(...p.map((v, i) => v.distanceTo(q[i])));

// Frame times per clip; loops sample [from, to) evenly, one-shots include the last pose. Root motion of loops
// is cancelled linearly; one-shots that come to rest early lose their still tail (trim).
const plans = [];
turn.rotation.y = 0;
for (const c of J.clips) {
  const clip = c.anim ? clipByName[c.anim] : null, d = clip ? clip.duration : 0;
  const from = c.from || 0; let to = c.to ?? d / (c.part || 1); // part: the clip repeats one cycle part times
  if (c.still != null) { plans.push({ c, times: [c.still], drift: V(), start: V() }); continue; }
  let drift = V(), start = V();
  if (c.loop && rootBone && !c.add) {
    const root = (t) => { pose(c, t); const p = lift.worldToLocal(rootBone.getWorldPosition(V())); p.y = 0; return p; };
    const z = root(0), a = root(from), b = root(to - 1e-4);
    drift = b.sub(a); if (drift.length() < 4) drift.set(0, 0, 0); else start = a.sub(z); // a loop cut from later in a travelling clip
  }
  if (!c.loop && c.trim) {
    pose(c, to - 1e-4); const end = sig(); let last = from;
    for (let t = from; t < to; t += 1 / 60) { pose(c, t); if (diff(sig(), end) > 2.5) last = t; }
    to = Math.min(to, last + 2 / c.fps);
  }
  const span = to - from, times = [];
  if (c.loop) { const n = Math.max(1, Math.round(span * c.fps)); for (let i = 0; i < n; i++) times.push(from + i * span / n); }
  else { const n = Math.round(span * c.fps) + 1; for (let i = 0; i < n; i++) times.push(Math.min(from + i / c.fps, to - 1e-4)); }
  plans.push({ c, times, drift, start, from, span, d });
}
// Pose curves (max bone offset in Dota units, 30 samples/s) for picking cuts: loops against their first pose,
// one-shots against their last.
const curves = {};
for (const c of J.clips.filter((x) => x.anim)) {
  const d = clipByName[c.anim].duration; pose(c, c.loop ? 0 : d - 1e-4); const p0 = sig(); const rows = [];
  for (let t = 0; t < d; t += 1 / 30) { pose(c, t); rows.push(+diff(sig(), p0).toFixed(1)); }
  curves[c.name] = rows;
}
const place = (p, t) => {
  pose(p.c, t);
  slide.position.set(0, 0, 0);
  // liftTo: the offset eases to this (game px) over the clip, e.g. a hovering hero's corpse comes down to the ground
  lift.position.copy(base);
  if (p.c.liftTo != null) lift.position.y += (p.c.liftTo / J.scale - LIFT) * (t - p.from) / p.span;
  if (p.drift.lengthSq()) slide.position.copy(p.drift).multiplyScalar(-(t - p.from) / p.span).sub(p.start);
  update();
};

// The Dota-unit bounds of the model (unturned, without the lift; Dota axes: x forward, y left, z up) at the first frame.
place(plans[0], plans[0].times[0]);
const b0 = new THREE.Box3().setFromObject(lift, true);
const dotaBox = { x: [b0.min.z, b0.max.z], y: [-b0.max.x, -b0.min.x], z: [b0.min.y - LIFT, b0.max.y - LIFT] };
for (const k in dotaBox) dotaBox[k] = dotaBox[k].map((v) => Math.round(v));

// Facing and camera. The rocket's nose is at +z, which is already screen right.
turn.rotation.y = (J.rocket ? 0 : J.yaw ?? -28) * deg;
const pitch = (J.rocket ? 0 : J.pitch ?? 10) * deg; // the rocket is a pure side view: the game rotates it
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
cam.position.set(-Math.cos(pitch) * 1000, Math.sin(pitch) * 1000, 0); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0);
cam.updateMatrixWorld(true);
if (J.rocket) {
  // centre the rocket on the unit point and scale it to J.rocket game px long
  base.sub(b0.getCenter(V()));
  J.scale = J.rocket / (b0.max.z - b0.min.z);
}
const ppuR = J.ppu * J.scale;

// Union of the bounds over every frame (sampled), in camera space.
const view = new THREE.Box3();
const corners = (b) => { const out = []; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push(new THREE.Vector3(x, y, z)); return out; };
for (const p of plans) {
  const step = Math.max(1, Math.floor(p.times.length / 40));
  for (let i = 0; i < p.times.length; i += step) {
    place(p, p.times[i]);
    const b = new THREE.Box3().setFromObject(unit, true);
    if (ground.length) b.min.y = Math.max(b.min.y, -1);
    for (const v of corners(b)) view.expandByPoint(v.applyMatrix4(cam.matrixWorldInverse));
  }
}
const M = 10 / ppuR; // margin
cam.left = Math.floor((view.min.x - M) * ppuR) / ppuR; cam.right = Math.ceil((view.max.x + M) * ppuR) / ppuR;
cam.bottom = Math.floor((view.min.y - M) * ppuR) / ppuR; cam.top = Math.ceil((view.max.y + M) * ppuR) / ppuR;
cam.updateProjectionMatrix();
const W = Math.round((cam.right - cam.left) * ppuR), H = Math.round((cam.top - cam.bottom) * ppuR), SS = J.ss || 2;
renderer.setSize(W * SS, H * SS, false);
const toPx = (v) => { const p = v.clone().project(cam); return [+((p.x + 1) / 2 * W).toFixed(2), +((1 - p.y) / 2 * H).toFixed(2)]; };
const anchor = toPx(new THREE.Vector3(0, 0, 0));

// Render, then a 2×2 box filter (premultiplied) down to the sprite size.
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
// Named bones per frame, in game px from the anchor (y up).
const boneAt = () => Object.fromEntries((J.bones || []).map((n) => {
  const [x, y] = toPx(gltf.scene.getObjectByName(n).getWorldPosition(V()));
  return [n, [+((x - anchor[0]) / J.ppu).toFixed(1), +(-(y - anchor[1]) / J.ppu).toFixed(1)]];
}));
const out = {}, clips = {}, bonesPerFrame = {};
for (const p of plans) {
  bonesPerFrame[p.c.name] = [];
  p.times.forEach((t, i) => { place(p, t); out[`${J.unit}/${p.c.name}-${i}.png`] = grab(); bonesPerFrame[p.c.name].push(boneAt()); });
  clips[p.c.name] = { frames: p.times.length, fps: p.c.fps || 1, loop: !!p.c.loop, duration: p.d ?? 0, used: p.span ?? 0, drift: p.drift.toArray().map(Math.round) };
}
out.meta = { unit: J.unit, size: [W, H], anchor, dotaBox, clips, bones: bonesPerFrame, curves, scale: J.scale, anims: gltf.animations.map((a) => [a.name, +a.duration.toFixed(3)]) };
return out;
