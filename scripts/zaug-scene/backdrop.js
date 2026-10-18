// Page script for render.html (run by make.mjs): «Логово Зауга»'s scrolling canyon, rendered from the scene map
// shmup_act3 (docs/minigames.md, «Логово Зауга»). The map's tundra is one model, shmup_tundra_env (352 000
// triangles of fullbright cards from a 4096² atlas), a conveyor belt: its halves slide along −x with the
// clip shmup_env_belt_scroll_fast and wrap, the whole belt repeats every 33.33 s. Behind it two plates (sky and
// far mountains, shmup_tundra_mellow_bg_*) that barely move. The side camera of the map (x 64, y −2758, z 320,
// looking along +y, horizontal fov 45°) sees it all.
//
// A pure translation past a pinhole camera is a set of parallax layers: every depth band of cards becomes one
// horizontal strip, made slit by slit (a narrow view at the centre of the frame while the belt moves), that the
// game scrolls at the band's own speed. The plates are a still back picture.
//
// window.JOB = { skin: 'mellow' | 'harsh', scale (output px per popup px), bands: [[near, far], …], slit, ss, out }
// Axes: three = (x, z, −y) of the map; the glTFs (metres, Source 2 Viewer) are (gx, gy, gz) = model (y, z, x).
const J = window.JOB;
const K = 39.37, W = 1720, H = 968, HFOV = 45, CAM = [64, -2758.04, 320];
const OUT_W = Math.round(W * J.scale), OUT_H = Math.round(H * J.scale);
const T = 33.333; // the belt's period (s)
const BELT = 40.6 * K * 0.75; // units per second: 340 m in 8.33 s (the clip), the prop's scale 0.75

const textures = new THREE.TextureLoader();
const tex = async (url) => { const t = await textures.loadAsync(url); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
async function prop(file, origin, scale) {
  const g = await loadModel(file);
  const root = new THREE.Group(); root.add(g.scene); root.scale.setScalar(scale * K); root.position.set(origin[0], origin[2], -origin[1]);
  g.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return { g, root };
}
const env = await prop('/env/shmup_tundra_env.glb', [128, 3427.26, -100], 0.75);
const sky = await prop('/env/shmup_tundra_mellow_bg_sky.glb', [-3342.16, -5303.78, -1931.48], 0.75);
const mtn = await prop('/env/shmup_tundra_mellow_bg_mountains.glb', [-3342.16, -1195.36, -437.04], 0.75);
const harsh = J.skin === 'harsh';
const atlas = harsh ? await tex('/env/tundra_harsh_padding_color_png_78d78856.png') : null;
const skyMap = harsh ? await tex('/env/shmup_tundra_harsh_bg_color_png_93ac4400.png') : null;
const FLOOR = harsh ? 0x374663 : 0x3a617b;
const FOG = new THREE.Color(J.fog?.[0] ?? (harsh ? 0x34425c : 0x47708c));

// Materials: fullbright cards (alpha-tested), the floor's flat colour; distance haze as linear fog.
const fogRange = J.fog ? [J.fog[1], J.fog[2]] : [6000, 60000];
const scene = new THREE.Scene();
const BAND = { value: new THREE.Vector2(0, 1e9) }; // one uniform shared by every card material
function material(m, opts = {}) {
  const n = new THREE.MeshBasicMaterial({ map: opts.map || m.map, alphaTest: 0.5, side: THREE.DoubleSide, fog: opts.fog ?? true, transparent: false });
  if (/floor/.test(m.name)) { n.map = null; n.color = new THREE.Color(FLOOR); n.alphaTest = 0; }
  // Depth band: fragments outside [near, far) of the camera are discarded (set per pass).
  n.onBeforeCompile = (shader) => {
    shader.uniforms.band = BAND;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vDepth;').replace('#include <project_vertex>', '#include <project_vertex>\nvDepth = -mvPosition.z;');
    // The atlas is black where it is transparent: filtering at a card's edge mixes in that black (a dark fringe).
    // Dividing by the filtered alpha undoes it (cut-outs below 0.5 are discarded anyway).
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDepth;\nuniform vec2 band;').replace('void main() {', 'void main() {\nif (vDepth < band.x || vDepth >= band.y) discard;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb /= max(diffuseColor.a, 0.5);');
  };
  return n;
}
// The floor (a flat colour under the haze) has no detail to scroll: it goes into the still back only.
const floors = [];
env.g.scene.traverse((o) => {
  if (!o.isMesh) return;
  if (/fog/.test(o.material.name)) { o.visible = false; return; }
  if (/floor/.test(o.material.name)) floors.push(o);
  o.material = material(o.material, { map: /atlas/.test(o.material.name) && atlas ? atlas : undefined });
});
// The harsh skin's far mountains: Valve swaps their atlas too (not exported) — the mellow ones, darkened.
for (const p of [sky, mtn]) p.g.scene.traverse((o) => { if (!o.isMesh) return; const m = o.material; o.material = new THREE.MeshBasicMaterial({ map: /bg_/.test(m.name) && skyMap ? skyMap : m.map, alphaTest: 0.5, side: THREE.DoubleSide, fog: false, color: new THREE.Color(p === mtn && harsh ? 0x7d8db0 : 0xffffff) }); });

// The camera; setViewOffset renders a slit of it.
const vfov = 2 * Math.atan(Math.tan(HFOV / 2 * Math.PI / 180) / (W / H)) * 180 / Math.PI;
const cam = new THREE.PerspectiveCamera(vfov, W / H, 50, 200000);
cam.position.set(CAM[0], CAM[2], -CAM[1]); cam.lookAt(CAM[0], CAM[2], -CAM[1] - 1000); cam.updateMatrixWorld(true);
const F = (OUT_W / 2) / Math.tan(HFOV / 2 * Math.PI / 180); // output px per unit at unit depth

const mixer = new THREE.AnimationMixer(env.g.scene);
mixer.clipAction(env.g.animations.find((a) => a.name === 'shmup_env_belt_scroll_fast')).play();
const at = (t) => { mixer.setTime(((t % T) + T) % T); env.root.updateMatrixWorld(true); };
const SS = J.ss || 2;
const out = {};

// 1. The back: the plates and the floor (with haze) — everything beyond the last band, at t = 0.
scene.add(sky.root, mtn.root);
scene.fog = new THREE.Fog(FOG, fogRange[0], fogRange[1]);
renderer.setClearColor(0x000000, 0);
renderer.setSize(OUT_W * SS, OUT_H * SS, false);
cam.clearViewOffset(); cam.updateProjectionMatrix();
const setBand = (near, far) => BAND.value.set(near, far);
const lastFar = J.bands.at(-1)[1];
scene.add(env.root); at(0);
// The back: plates, the floor at every depth, no cards.
const cards = [];
env.g.scene.traverse((o) => { if (o.isMesh && o.visible && !floors.includes(o)) { cards.push(o); o.visible = false; } });
setBand(0, 1e9);
renderer.setClearColor(FOG, 1);
renderer.render(scene, cam);
const shrink = (src, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h); return c; };
out[`${J.out}/back.png`] = shrink(renderer.domElement, OUT_W, OUT_H).toDataURL('image/png');
scene.remove(sky.root, mtn.root);
for (const f of floors) f.visible = false;
for (const c of cards) c.visible = true;

// 2. The bands, slit by slit. A band's speed is BELT·F/d at its reference depth (the geometric mean).
renderer.setClearColor(0x000000, 0);
const meta = { width: OUT_W, height: OUT_H, scale: J.scale, period: T, belt: BELT, layers: [] };
const SLIT = J.slit || 16;
for (const [near, far] of J.bands) {
  const d = Math.sqrt(near * far), speed = BELT * F / d, length = Math.round(speed * T / SLIT) * SLIT, n = length / SLIT;
  setBand(near, far);
  // Vertical extent: render one full frame to find the band's rows.
  cam.clearViewOffset(); cam.updateProjectionMatrix(); renderer.setSize(OUT_W, OUT_H, false); at(0); renderer.render(scene, cam);
  const probe = shrink(renderer.domElement, OUT_W, OUT_H).getContext('2d').getImageData(0, 0, OUT_W, OUT_H).data;
  let top = OUT_H, bottom = 0;
  for (let y = 0; y < OUT_H; y++) for (let x = 0; x < OUT_W; x += 3) if (probe[(y * OUT_W + x) * 4 + 3] > 0) { top = Math.min(top, y); bottom = Math.max(bottom, y); break; }
  top = Math.max(0, top - 8); bottom = Math.min(OUT_H, bottom + 8);
  const h = Math.max(1, bottom - top);
  const strip = document.createElement('canvas'); strip.width = length; strip.height = h; const sx = strip.getContext('2d');
  renderer.setSize(SLIT * SS, h * SS, false);
  for (let k = 0; k < n; k++) {
    at(k * SLIT / speed);
    // The slit at the frame's centre, rows top…bottom.
    cam.setViewOffset(OUT_W, OUT_H, OUT_W / 2 - SLIT / 2, top, SLIT, h); cam.updateProjectionMatrix();
    renderer.render(scene, cam);
    sx.drawImage(renderer.domElement, 0, 0, SLIT * SS, h * SS, k * SLIT, 0, SLIT, h);
  }
  // Screen x of strip column c at time t: c − speed·t − (length·m) + OUT_W/2 − SLIT/2 … the game wraps it.
  meta.layers.push({ near, far, depth: Math.round(d), speed: +speed.toFixed(3), length, top, height: h, file: `${J.out}/band-${near}.png` });
  out[`${J.out}/band-${near}.png`] = strip.toDataURL('image/png');
  console.log(`band ${near}-${far}: ${length}×${h} at ${speed.toFixed(1)} px/s`);
}
out.meta = meta;
return out;
