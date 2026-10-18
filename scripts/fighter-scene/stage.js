// Page script for render.html (run by make.mjs): «Сосулечный боец»'s tavern stage from Valve's scene maps
// maps/scenes/crownfall/arena (the background: the tavern minifight_tavern, a tusktown house, Whiskey the penguin, a
// tuskfolk at the fire) and arena_fg (the foreground: the beam frame tuss_tav_fg and a second penguin), seen from
// the maps' point_camera cam_main: Source (0, −2000, 300), looking along +y, level, fov 38.
//
// window.JOB = { map: 'arena' | 'arena_fg', width, height, ss, fov, fovAxis: 'h' | 'v', shift: [px, px], light, out }
// Axes: Source 2 Viewer's map glTF is (x, y, z)three = (y, z, x)source × 0.0254 (checked on the props' origins).
const J = window.JOB;
const K = 0.0254, src = (x, y, z) => new THREE.Vector3(y * K, z * K, x * K);
const scene = new THREE.Scene();
const g = await loadModel(`/stage/${J.map}.glb`);
scene.add(g.scene);
// Lit materials: Source 2 Viewer's glTF materials carry the colour and normal maps; Valve's lighting is baked
// in the game (lightmaps are not exported), so the map's lights are put back as three lights.
g.scene.traverse((o) => {
  if (!o.isMesh) return;
  o.frustumCulled = false;
  if (/primary_black|hero_debut_camera/.test(o.name) || /debut_camera/.test(o.parent?.name || '')) { o.visible = false; return; }
  const conv = (m) => {
    const glass = /lantern_glass/.test(m.name);
    return new THREE.MeshStandardMaterial({
      name: m.name, map: m.map, normalMap: m.normalMap, color: glass ? new THREE.Color(1.0, 0.75, 0.4) : m.color, roughness: 0.85, metalness: 0,
      emissive: glass ? new THREE.Color(1.0, 0.6, 0.25) : new THREE.Color(0, 0, 0), emissiveIntensity: glass ? 2.5 : 0,
      alphaTest: m.alphaTest || (m.transparent ? 0.4 : 0), transparent: false, side: THREE.DoubleSide,
    });
  };
  o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
});

const L = J.light || {};
const color = (c, s = 1) => new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255).multiplyScalar(s);
// env_global_light: angles (pitch, yaw) → the direction light travels; colour (129, 214, 253): cold moonlight.
const dir = (pitch, yaw) => { const p = pitch * Math.PI / 180, y = yaw * Math.PI / 180; return src(Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), -Math.sin(p)); };
for (const gl of J.globals || []) {
  const sun = new THREE.DirectionalLight(color(gl.color, gl.scale ?? L.sun ?? 1.2));
  sun.position.copy(dir(gl.angles[0], gl.angles[1]).negate().multiplyScalar(100)); sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
}
scene.add(new THREE.HemisphereLight(color(L.sky || [70, 90, 140]), color(L.ground || [40, 26, 20]), L.hemi ?? 0.9));
// env_deferred_light: point lights (radius in Source units; intensity scaled by J.light.point).
for (const p of J.points || []) {
  const light = new THREE.PointLight(color(p.color), (p.intensity ?? 1) * (L.point ?? 6), p.radius * K * (L.reach ?? 2.2), 1.2);
  light.position.copy(src(...p.origin));
  scene.add(light);
}
// Fires and candles of the map (info_particle_system): small warm glows.
for (const f of J.fires || []) { const light = new THREE.PointLight(new THREE.Color(1.0, 0.55, 0.2), (f.power ?? 1) * (L.fire ?? 3), (f.radius ?? 120) * K * 2, 1.5); light.position.copy(src(...f.origin)); scene.add(light); }

const W = J.width, H = J.height, SS = J.ss || 2;
renderer.setSize(W * SS, H * SS, false);
const aspect = W / H, fov = J.fovAxis === 'h' ? 2 * Math.atan(Math.tan(J.fov * Math.PI / 360) / aspect) * 180 / Math.PI : J.fov;
const cam = new THREE.PerspectiveCamera(fov, aspect, 1 * K, 10000 * K);
cam.position.copy(src(...(J.origin || [0, -2000, 300])));
cam.up.set(0, 1, 0);
cam.lookAt(cam.position.clone().add(src(0, 1, 0)));
// A lens shift (the game's camera moves sideways with the fight): the frustum is offset, the view stays parallel.
if (J.shift) cam.setViewOffset(W, H, J.shift[0], J.shift[1], W, H);
cam.updateProjectionMatrix();
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = L.exposure ?? 1.0;
renderer.render(scene, cam);
const big = renderer.domElement, small = document.createElement('canvas'); small.width = W; small.height = H;
const ctx = small.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(big, 0, 0, W, H);
const meta = { fov, width: W, height: H };
// Screen position of Source points (to place the fighters' floor): [x, y] in output px.
meta.points = (J.probe || []).map((p) => { const v = src(...p).project(cam); return [+((v.x + 1) / 2 * W).toFixed(1), +((1 - v.y) / 2 * H).toFixed(1)]; });
return { [J.out]: small.toDataURL('image/png'), meta };
