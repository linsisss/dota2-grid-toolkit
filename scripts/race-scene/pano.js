// args: window.PANO = { map, hide: RegExp source, a0 (deg, left edge), width (px), f, ss, tile }
const P = window.PANO;
const M = '/maps/';
const ents = await (await fetch('/tool/' + P.ents)).json();
const scene = await setupScene([M + P.map + '.glb', M + 'flappy_skywrath_act2_bg.glb']);
const hide = new RegExp(P.hide);
scene.traverse((o) => { if (o.isMesh && hide.test(o.name + ' ' + (o.material?.name || ''))) o.visible = false; });
const ground = layGround(scene, ents);
// front layer: ground tiles and anything nearer than the bottom obstacles
const front = new Set();
ground.traverse((o) => { if (o.isMesh) { o.layers.set(1); front.add(o); } });
const box = new THREE.Box3(), c = new THREE.Vector3();
scene.traverse((o) => { if (!o.isMesh || front.has(o) || !o.visible) return; box.setFromObject(o); box.getCenter(c); const r = Math.hypot(c.x, c.z); const size = box.getSize(new THREE.Vector3()); if (r < 4300 && Math.max(size.x, size.z) < 3000) { o.layers.set(1); front.add(o); } });
scene.traverse((o) => { if (o.isLight) o.layers.enableAll(); });
const ss = P.ss || 2, sliceW = 64, H = 700;
renderer.setPixelRatio(1);
renderer.setSize(sliceW * ss, H * ss);
const tiles = [], TW = P.tile || 2048;
for (let x = 0; x < P.width; x += TW) { const cv = document.createElement('canvas'); cv.width = Math.min(TW, P.width - x); cv.height = H; tiles.push(cv); }
const tilesF = tiles.map((t) => { const cv = document.createElement('canvas'); cv.width = t.width; cv.height = H; return cv; });
const put = (list, x) => { const t = Math.floor(x / TW); for (let k = t; k <= Math.min(list.length - 1, Math.floor((x + sliceW) / TW)); k++) list[k].getContext('2d').drawImage(renderer.domElement, 0, 0, sliceW * ss, H * ss, x - k * TW, 0, sliceW, H); };
for (let x = 0; x < P.width; x += sliceW) {
  const a = (P.a0 - (x + sliceW / 2) / P.f * 180 / Math.PI) * Math.PI / 180;
  const cam = gameCamera(a, { r0: 0, hfov: 18.1, z: 500, pitch: 0.6 });
  cam.setViewOffset(1244 * ss, H * ss, (622 - sliceW / 2) * ss, 0, sliceW * ss, H * ss);
  cam.layers.set(0);
  renderer.setClearColor(0x88aacc, 0);
  renderer.render(scene, cam);
  put(tiles, x);
  cam.layers.set(1);
  renderer.render(scene, cam);
  put(tilesF, x);
}
const out = {};
tiles.forEach((t, i) => { out[`${P.out}-back-${i}.png`] = t.toDataURL('image/png'); });
tilesF.forEach((t, i) => { out[`${P.out}-front-${i}.png`] = t.toDataURL('image/png'); });
return out;
