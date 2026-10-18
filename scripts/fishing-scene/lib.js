// «Рыбалка»: the lake scene in three.js (page script for render.html; make.mjs runs it).
// The map fishing_game_act1 exported by Source 2 Viewer with materials; its env_global_light; the
// game's three cameras (point_camera entities) as three.js cameras.

// Valve's env_global_light «global_light»: colour 244 232 196 × 3.5 from pitch 45°, yaw 160°; the
// ambient 189 229 236 × 0.5 (sky) and 88 108 104 × 4 (ground).
window.setupScene = async (files, opts = {}) => {
  const scene = new THREE.Scene();
  for (const f of files) { const m = await load(f); scene.add(m); }
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    o.material = mats.map((m) => {
      const v = m.userData?.vmat || {}, ip = v.IntParams || {}, fp = v.FloatParams || {}, vp = v.VectorParams || {};
      const shader = v.ShaderName || '';
      let n;
      if (/water/i.test(shader) || /water/i.test(m.name)) {
        n = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
        n.userData.water = true;
      } else if (ip.F_ADDITIVE_BLEND) n = new THREE.MeshBasicMaterial({ map: m.map, color: m.color, transparent: true, opacity: (fp.g_flOpacityScale ?? 1) * (opts.additive ?? 0.35), blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      else if (ip.F_FULLBRIGHT) n = new THREE.MeshBasicMaterial({ map: m.map, color: m.color, transparent: !!ip.F_TRANSLUCENT, alphaTest: ip.F_ALPHA_TEST ? (fp.g_flAlphaTestReference ?? 0.5) : 0, depthWrite: !ip.F_TRANSLUCENT, side: THREE.DoubleSide });
      else if (shader === 'multiblend.vfx') {
        const t = vp.g_vColorTint0 || [1, 1, 1];
        n = new THREE.MeshLambertMaterial({ map: m.map, color: new THREE.Color(t[0], t[1], t[2]).convertSRGBToLinear(), vertexColors: false });
        if (m.map) { m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; }
      } else n = new THREE.MeshLambertMaterial({ map: m.map, color: m.color, transparent: !!ip.F_TRANSLUCENT || m.transparent, opacity: m.opacity ?? 1, alphaTest: m.alphaTest || (ip.F_ALPHA_TEST ? (fp.g_flAlphaTestReference ?? 0.5) : 0), side: THREE.DoubleSide, depthWrite: !(ip.F_TRANSLUCENT && !ip.F_ALPHA_TEST) });
      n.name = m.name; n.userData.shader = shader; n.userData.vmat = v;
      return n;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  addLights(scene, opts);
  return scene;
};

window.sourceDir = (pitch, yaw) => {
  const p = pitch * Math.PI / 180, y = yaw * Math.PI / 180;
  return S(Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), -Math.sin(p));
};

window.addLights = (scene, opts = {}) => {
  const c = (r, g, b, s = 1) => new THREE.Color(r / 255 * s, g / 255 * s, b / 255 * s);
  const sun = new THREE.DirectionalLight(c(244, 232, 196), opts.sun ?? 2.6);
  const dir = sourceDir(45, 160);
  sun.position.copy(dir.clone().multiplyScalar(-10000)); sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(c(189, 229, 236), c(88, 108, 104, 1.6), opts.hemi ?? 1.9));
  return sun;
};

// A point_camera: origin, angles [pitch, yaw, roll] (Source), fov — horizontal, for the 16:9 panel.
window.CAMERAS = {
  side: { origin: [-252.298996, -1653.358398, 635.027527], angles: [33.33337, 87.729141, 0.527157], fov: 50 },
  overhead: { origin: [-383.746002, -1920.0, 1280.0], angles: [42.787697, 89.796646, -0.04196], fov: 50 },
  centered: { origin: [-383.746002, -1879.97998, 827.14801], angles: [27.6929, 90.0, 0.017864], fov: 50 },
};
window.gameCamera = (name, { w = 1244, h = 700, hfovScale = 1 } = {}) => {
  const c = { ...CAMERAS[name], ...(window.CAMERA_OVERRIDES?.[name] || {}) }, aspect = w / h;
  const hfov = (window.HFOV ?? c.fov) * hfovScale;
  const vfov = 2 * Math.atan(Math.tan(hfov * Math.PI / 360) / aspect) * 180 / Math.PI;
  const cam = new THREE.PerspectiveCamera(vfov, aspect, 4, 20000);
  cam.position.copy(S(...c.origin));
  const d = sourceDir(c.angles[0], c.angles[1]);
  cam.up.set(0, 1, 0);
  cam.lookAt(cam.position.clone().add(d));
  if (c.angles[2]) cam.rotateZ(-c.angles[2] * Math.PI / 180);
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  return cam;
};
