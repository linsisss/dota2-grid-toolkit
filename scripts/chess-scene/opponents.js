// Page script (make.mjs → page.html): an opponent from a Source 2 Viewer glb (creeps, neutrals, pets, the
// frost dragon). The model (metres → Dota units) is turned a little towards the board and seen from the
// front and slightly above, like the opponent scene's camera; base colour (+ self-illumination) with a
// cool key light from the upper left, a warm fill and a blue rim, as on the icewrack stage. Each clip is
// sampled into frames; frames are returned as PNG data URLs with the feet's point (anchor).
// window.JOB = { name, file, height (px), turn (rad), pitch (deg), skin: { material: texture file } , clips: [{ name, anim, n, loop, from, span }] }
const J = window.JOB, SS = 2;
const gltf = await loadModel(`/models/${J.file}`);
const scene = new THREE.Scene();
const turn = new THREE.Group(), model = new THREE.Group();
scene.add(turn); turn.add(model); model.add(gltf.scene); model.scale.setScalar(1 / 0.0254);
const skinMaps = {};
for (const [mat, file] of Object.entries(J.skin || {})) skinMaps[mat] = await new THREE.TextureLoader().loadAsync(`/models/${file}`).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t; });
gltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  o.frustumCulled = false;
  if (/hitbox|physics/i.test(o.name)) { o.visible = false; return; }
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  if ((J.hide || []).some((name) => mats.some((m) => m.name === name) || o.name.includes(name))) { o.visible = false; return; }
  const conv = (m) => new THREE.MeshStandardMaterial({ name: m.name, map: skinMaps[m.name] || m.map, color: m.color, roughness: 0.68, metalness: 0,
    emissiveMap: m.emissiveMap || null, emissive: m.emissiveMap ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0), emissiveIntensity: 0.9,
    alphaTest: m.alphaTest || (m.transparent ? 0.3 : 0), transparent: false, side: THREE.DoubleSide });
  o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
});
const key = new THREE.DirectionalLight(new THREE.Color(0.92, 0.96, 1.0), J.key ?? 3.4); key.position.set(-1.2, 1.6, 1.3); scene.add(key);
const fill = new THREE.DirectionalLight(new THREE.Color(1.0, 0.9, 0.8), J.fill ?? 0.9); fill.position.set(1.0, 0.3, 1.0); scene.add(fill);
const rim = new THREE.DirectionalLight(new THREE.Color(0.6, 0.78, 1.0), J.rim ?? 2.0); rim.position.set(0.6, 0.9, -1.4); scene.add(rim);
scene.add(new THREE.HemisphereLight(new THREE.Color(0.66, 0.74, 0.92), new THREE.Color(0.2, 0.22, 0.28), J.hemi ?? 1.7));
const mixer = new THREE.AnimationMixer(gltf.scene), byName = Object.fromEntries(gltf.animations.map((a) => [a.name, a]));
// lockRoot: the root bone keeps its rest position across the floor (clips that travel stay in place)
let rootBone = null; gltf.scene.traverse((o) => { if (!rootBone && o.isBone) rootBone = o; });
const rest = rootBone ? rootBone.position.clone() : null;
const pose = (anim, t) => {
  mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
  if (anim && byName[anim]) { mixer.clipAction(byName[anim]).play(); mixer.setTime(t); }
  if (J.lockRoot && rootBone) { rootBone.position.x = rest.x; rootBone.position.z = rest.z; if (J.lockRoot === 'all') rootBone.position.y = rest.y; }
  scene.updateMatrixWorld(true);
};
turn.rotation.y = J.turn ?? -0.5;
// frame times
const plans = J.clips.map((c) => {
  const clip = byName[c.anim]; const d = clip ? clip.duration : 1;
  const from = (c.from || 0) * d, span = (c.span ?? 1) * d, times = [];
  for (let i = 0; i < c.n; i++) times.push(from + (c.loop ? i * span / c.n : Math.min(span - 1e-3, i * span / Math.max(1, c.n - 1))));
  return { c, times, d: span };
});
// camera: perspective-ish from the front, a little above; fitted to the union of the bounds of all frames
const pitch = (J.pitch ?? 8) * Math.PI / 180;
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
cam.position.set(0, Math.sin(pitch) * 1000, Math.cos(pitch) * 1000); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
pose(plans[0].c.anim, plans[0].times[0]);
const b0 = new THREE.Box3().setFromObject(model, true);
const ppu = J.height / (b0.max.y - b0.min.y);
const view = new THREE.Box3();
for (const p of plans) for (const t of p.times) {
  pose(p.c.anim, t); const b = new THREE.Box3().setFromObject(model, true);
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) view.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse));
}
const M = 8 / ppu;
cam.left = view.min.x - M; cam.right = view.max.x + M; cam.bottom = view.min.y - M; cam.top = view.max.y + M; cam.updateProjectionMatrix();
const W = Math.ceil((cam.right - cam.left) * ppu), H = Math.ceil((cam.top - cam.bottom) * ppu);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true, alpha: true, premultipliedAlpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setPixelRatio(1); renderer.setClearColor(0, 0); renderer.setSize(W * SS, H * SS, false);
const small = document.createElement('canvas'); small.width = W; small.height = H; const sx = small.getContext('2d'); sx.imageSmoothingQuality = 'high';
const grab = () => { renderer.render(scene, cam); sx.clearRect(0, 0, W, H); sx.drawImage(renderer.domElement, 0, 0, W, H); return small.toDataURL('image/png'); };
const clips = {}, fps = {}, loop = {};
for (const p of plans) { clips[p.c.name] = p.times.map((t) => { pose(p.c.anim, t); return grab(); }); fps[p.c.name] = +(p.c.n / p.d).toFixed(2); loop[p.c.name] = !!p.c.loop; }
const o = new THREE.Vector3(0, 0, 0).project(cam);
return { clips, fps, loop, anchor: [(o.x + 1) / 2 * W, (1 - o.y) / 2 * H], anims: gltf.animations.map((a) => `${a.name}:${a.duration.toFixed(2)}`) };
