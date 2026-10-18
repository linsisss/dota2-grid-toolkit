// «Терновый трон», map: shared page code (make.mjs prepends it to every page script).
// Source axes → three: (x, y, z) → (y, z, x), as Source 2 Viewer's glTF (metres → units: ×1/0.0254).
const S = (x, y, z) => new THREE.Vector3(y, z, x);
const toSource = (v) => [v.z, v.x, v.y];
const SIN = Math.SQRT1_2;

window.loadGlb = async (url) => {
  const g = await loader.loadAsync(url);
  const wrap = new THREE.Group(); wrap.add(g.scene); wrap.scale.setScalar(1 / 0.0254); wrap.updateMatrixWorld(true);
  wrap.userData.animations = g.animations;
  return wrap;
};

// What a mesh is, from its node name (aggregates are named by material; entity props by model) and the entity
// extras Source 2 Viewer exports (classname, model, targetname).
window.classify = (o) => {
  const n = o.name || '', ex = o.userData || {}, model = String(ex.model || ''), cls = String(ex.classname || '');
  if (/wildlife|snow_owl|glow_0|radiant_lightrays|water_edges|vapor_white|toolstrigger/i.test(n + model)) return 'hide';
  if (/breakable|destructible/i.test(n + model)) return 'hide';
  if (/cf_survivors_transparen/i.test(n)) return 'hide';
  // The tall things on the arena floor that units walk behind: the 32 columns with braziers and the wall
  // columns Valve fades out when they hide units (south and east walls). There are no trees, statues or topiary
  // on the playable floors (ent_dota_tree and the topiary are in the developer area and the pit gardens).
  if (/cf_palace_new_column_large_a_w_brazier|column_fadeout/i.test(n + model)) return 'prop';
  return 'ground';
};

// Valve's lighting env 1 of crownfall_act4 (day): light colour 233 194 182 × 2.5 travelling along
// [0.321, 0.557, −0.766], ambient 172 163 152, shadow 135 64 72 — tuned down a little for a Lambert renderer
// without Valve's tonemapper so that the floor isn't blown out (three's Lambert divides by π, hence the ×π).
window.LIGHT_DIR = [0.321, 0.557, -0.766];
window.addLights = (scene, o = {}) => {
  const c = (r, g, b, s = 1) => new THREE.Color().setRGB(r / 255 * s, g / 255 * s, b / 255 * s, THREE.SRGBColorSpace);
  const sun = new THREE.DirectionalLight(c(233, 194, 182), (o.sun ?? 2.1) * Math.PI);
  const d = S(...LIGHT_DIR).normalize();
  sun.position.copy(d.clone().multiplyScalar(-20000)); sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(c(172, 163, 152), c(135, 64, 72), (o.ambient ?? 0.6) * Math.PI));
  return sun;
};

// Materials → Lambert (the vmat parameters come in userData.vmat when exported with extras). Valve's multiblend
// floors (up to four layers painted per vertex) come out of the exporter with one layer only; they are rebuilt:
// layer weights in _texcoord_1 (.y .z .w for layers 1–3; _texcoord_2 looks like vertex paint, but tinting by
// it gives blocky yellow patches the game doesn't show, so it is ignored), world-space UVs (exported as position / 128) divided by g_flTexCoordScale<n>.
const texLoader = new THREE.TextureLoader();
const layerTex = async (vtex) => {
  if (!vtex) return null;
  const url = `${window.WORLD_DIR}${vtex.split('/').pop().replace(/\.vtex$/, '.png')}`;
  try { const t = await texLoader.loadAsync(url); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; } catch { return null; }
};
const multiblend = async (m, v) => {
  const tp = v.TextureParams || {}, fp = v.FloatParams || {}, vp = v.VectorParams || {};
  const maps = await Promise.all([0, 1, 2, 3].map((i) => layerTex(tp[`g_tColor${i}`])));
  const base = maps[0] || m.map;
  const n = new THREE.MeshLambertMaterial({ map: base, side: THREE.DoubleSide });
  const u = {};
  for (let i = 0; i < 4; i++) {
    u[`mbMap${i}`] = { value: maps[i] || base };
    u[`mbHas${i}`] = { value: maps[i] ? 1 : 0 };
    u[`mbScale${i}`] = { value: fp[`g_flTexCoordScale${i}`] || 1 };
    const t = vp[`g_vColorTint${i}`] || [1, 1, 1];
    u[`mbTint${i}`] = { value: new THREE.Color().setRGB(t[0], t[1], t[2], THREE.SRGBColorSpace) };
  }
  n.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute vec4 _texcoord_1;\nattribute vec4 _texcoord_2;\nvarying vec4 vMbW;\nvarying vec4 vMbP;\nvarying vec2 vMbUv;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMbW = _texcoord_1; vMbP = _texcoord_2; vMbUv = uv;');
    const decl = [0, 1, 2, 3].map((i) => `uniform sampler2D mbMap${i}; uniform float mbHas${i}; uniform float mbScale${i}; uniform vec3 mbTint${i};`).join('\n');
    sh.fragmentShader = `varying vec4 vMbW;\nvarying vec4 vMbP;\nvarying vec2 vMbUv;\n${decl}\n` + sh.fragmentShader.replace('#include <map_fragment>', `
      vec3 mbc = texture2D(mbMap0, vMbUv / mbScale0).rgb * mbTint0;
      if (mbHas1 > 0.5) mbc = mix(mbc, texture2D(mbMap1, vMbUv / mbScale1).rgb * mbTint1, clamp(vMbW.y, 0.0, 1.0));
      if (mbHas2 > 0.5) mbc = mix(mbc, texture2D(mbMap2, vMbUv / mbScale2).rgb * mbTint2, clamp(vMbW.z, 0.0, 1.0));
      if (mbHas3 > 0.5) mbc = mix(mbc, texture2D(mbMap3, vMbUv / mbScale3).rgb * mbTint3, clamp(vMbW.w, 0.0, 1.0));
      diffuseColor.rgb *= mbc;`);
  };
  n.customProgramCacheKey = () => 'mb' + v.Name;
  return n;
};
window.convertMaterials = async (root) => {
  const cache = new Map(), jobs = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    o.material = mats.map((m) => {
      if (cache.has(m)) return cache.get(m);
      const v = m.userData?.vmat || {}, ip = v.IntParams || {}, fp = v.FloatParams || {};
      let n;
      if (ip.F_ADDITIVE_BLEND) n = new THREE.MeshBasicMaterial({ visible: false });
      else n = new THREE.MeshLambertMaterial({ map: m.map, color: m.color, transparent: false, alphaTest: m.alphaTest || (ip.F_ALPHA_TEST ? (fp.g_flAlphaTestReference ?? 0.5) : (m.transparent ? 0.5 : 0)), side: THREE.DoubleSide, vertexColors: false });
      if (m.map) { m.map.anisotropy = 8; }
      if (v.ShaderName === 'multiblend.vfx') jobs.push(multiblend(m, v).then((x) => { Object.assign(n, { map: x.map }); n.onBeforeCompile = x.onBeforeCompile; n.customProgramCacheKey = x.customProgramCacheKey; n.color.set(0xffffff); }));
      n.name = m.name; n.userData.vmat = v; n.userData.shader = v.ShaderName || '';
      cache.set(m, n);
      return n;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  await Promise.all(jobs);
};

// The game camera, orthographic: the window [left, right] × [bottom, top] in screen units (x and the «up» axis
// u = y·sin45 + z·cos45), looking north 45° down.
window.gameCamera = (x0, x1, u0, u1) => {
  const cam = new THREE.OrthographicCamera((x0 - x1) / 2, (x1 - x0) / 2, (u1 - u0) / 2, (u0 - u1) / 2, 1, 80000);
  const cx = (x0 + x1) / 2, cu = (u0 + u1) / 2;
  // the camera sits back along −forward from the point (cx, y, z) with y·s + z·c = cu, y = cu·s − 40000·c... chosen on the line
  const fwd = [0, SIN, -SIN], up = [0, SIN, SIN], back = 40000;
  const p = [cx, cu * up[1] - back * fwd[1], cu * up[2] - back * fwd[2]];
  cam.position.copy(S(...p));
  cam.up.copy(S(...up));
  cam.lookAt(S(p[0] + fwd[0], p[1] + fwd[1], p[2] + fwd[2]));
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  return cam;
};
// Image px of the ground image → screen units.
window.imgToScreen = (setup, px, py) => ({ x: setup.X0 + px / setup.ppu, u: setup.Y0 * SIN + setup.Z0 * SIN - py / setup.ppu });

// The whole map: world glb, materials, classes; props and the hidden classes are kept but made invisible to the
// camera (props still cast their shadows on the ground). The deep backdrop (survivors_env*, ~19 000 units down)
// is drawn in a first pass; everything else is clipped below z = CLIP_Z, which cuts the developer «palette»
// area at z −12 288 out of the view (it would show up south of the arena).
window.CLIP_Z = -9000;
window.setupWorld = async (url, o = {}) => {
  window.WORLD_DIR = url.slice(0, url.lastIndexOf('/') + 1);
  const root = await loadGlb(url);
  await convertMaterials(root);
  const scene = new THREE.Scene(); scene.add(root);
  const ghost = new Map(), groups = { ground: [], prop: [], hide: [], env: [] };
  root.traverse((m) => {
    if (!m.isMesh) return;
    let k = classify(m);
    if (k === 'ground' && /agg_prop_survivors_env/.test(m.name)) k = 'env';
    groups[k].push(m);
    m.castShadow = k !== 'env' && k !== 'hide'; m.receiveShadow = k === 'ground';
    if (k === 'hide') m.visible = false;
    if (k === 'prop' && !o.showProps) {
      const mats = [].concat(m.material).map((x) => { if (!ghost.has(x)) { const g = x.clone(); g.colorWrite = false; g.depthWrite = false; ghost.set(x, g); } return ghost.get(x); });
      m.userData.realMaterial = m.material; m.material = mats.length === 1 ? mats[0] : mats;
    }
  });
  const sun = addLights(scene, o);
  return { root, scene, groups, sun };
};

// Fits the sun's shadow camera around world points (Source coords) — the receivers and casters of one view.
window.fitShadow = (sun, pts, size = 4096) => {
  sun.castShadow = true;
  const sh = sun.shadow; sh.mapSize.set(size, size); sh.bias = -0.0004; sh.normalBias = 0; sh.radius = 2;
  const d = S(...LIGHT_DIR).normalize();
  const c = pts.reduce((a, p) => a.add(S(...p)), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  sun.target.position.copy(c); sun.position.copy(c.clone().sub(d.clone().multiplyScalar(30000)));
  sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
  const cam = sh.camera; cam.position.copy(sun.position); cam.lookAt(c); cam.updateMatrixWorld();
  const inv = cam.matrixWorldInverse;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of pts) { const v = S(...p).applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  Object.assign(cam, { left: x0 - 300, right: x1 + 300, bottom: y0 - 300, top: y1 + 300, near: 100, far: 60000 });
  cam.updateProjectionMatrix();
  if (sh.map) { sh.map.dispose(); sh.map = null; }
};
// Corners of the part of the world a screen window sees, for z in [za, zb].
window.windowCorners = (x0, x1, u0, u1, za = -2000, zb = 2600) => {
  const out = [];
  for (const x of [x0, x1]) for (const u of [u0, u1]) for (const z of [za, zb]) out.push([x, (u - z * SIN) / SIN, z]);
  return out;
};
// Draws the view: backdrop pass, then the world clipped below CLIP_Z.
window.drawWorld = (W, cam, clear = 0x000000, alpha = 1) => {
  renderer.autoClear = false;
  renderer.setClearColor(clear, alpha); renderer.clear();
  const vis = new Map();
  for (const m of W.groups.ground.concat(W.groups.prop)) { vis.set(m, m.visible); m.visible = false; }
  renderer.clippingPlanes = [];
  renderer.render(W.scene, cam);
  for (const [m, v] of vis) m.visible = v;
  for (const m of W.groups.env) m.visible = false;
  renderer.clearDepth();
  renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -CLIP_Z)];
  renderer.render(W.scene, cam);
  for (const m of W.groups.env) m.visible = true;
  renderer.clippingPlanes = [];
};
