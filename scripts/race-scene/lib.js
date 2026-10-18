window.setupScene = async (files, opts = {}) => {
  const scene = new THREE.Scene();
  for (const f of files) { const m = await load(f); scene.add(m); }
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    o.material = mats.map((m) => {
      const v = m.userData?.vmat || {}, ip = v.IntParams || {}, fp = v.FloatParams || {}, vp = v.VectorParams || {};
      let n;
      if (ip.F_ADDITIVE_BLEND) n = new THREE.MeshBasicMaterial({ map: m.map, color: m.color, transparent: true, opacity: (fp.g_flOpacityScale ?? 1) * (window.RAYS ?? 0.3), blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      else if (ip.F_FULLBRIGHT) n = new THREE.MeshBasicMaterial({ map: m.map, color: m.color, transparent: !!ip.F_TRANSLUCENT, alphaTest: ip.F_ALPHA_TEST ? (fp.g_flAlphaTestReference ?? 0.5) : 0, depthWrite: !ip.F_TRANSLUCENT, side: THREE.DoubleSide });
      else if (v.ShaderName === 'multiblend.vfx') {
        const t = vp.g_vColorTint0 || [1, 1, 1];
        n = new THREE.MeshLambertMaterial({ map: m.map, color: new THREE.Color(t[0], t[1], t[2]).convertSRGBToLinear() });
        if (m.map) { m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; }
        const pos = o.geometry.attributes.position, uv = new Float32Array(pos.count * 2), sc = 0.0254 / ((fp.g_flTexCoordScale0 || 6) * 128 * 0.0254);
        for (let i = 0; i < pos.count; i++) { uv[2 * i] = pos.getX(i) * sc * 1; uv[2 * i + 1] = pos.getZ(i) * sc; }
        o.geometry = o.geometry.clone(); o.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      } else n = new THREE.MeshLambertMaterial({ map: m.map, color: m.color, transparent: !!ip.F_TRANSLUCENT, alphaTest: m.alphaTest || (ip.F_ALPHA_TEST ? (fp.g_flAlphaTestReference ?? 0.5) : 0), side: THREE.DoubleSide });
      n.name = m.name;
      return n;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  const c = (r, g, b, s = 1) => new THREE.Color(r / 255 * s, g / 255 * s, b / 255 * s);
  const sun = new THREE.DirectionalLight(c(207, 189, 147), opts.sun ?? 3.2);
  const p = 26.48 * Math.PI / 180, y = 132.93 * Math.PI / 180;
  const dir = S(Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), -Math.sin(p));
  sun.position.copy(dir.clone().multiplyScalar(-10000)); sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(c(61, 83, 97, 1.75), c(108, 100, 92, 1.2), opts.hemi ?? 2.4));
  const fill = new THREE.PointLight(c(255, 230, 200), opts.fill ?? 1.2, 0, 0); fill.position.copy(S(0, 0, 900)); scene.add(fill);
  return scene;
};
// The game camera at angle t (radians, Source yaw of the view direction) on the orbit radius r0.
window.gameCamera = (t, { r0 = 1448, z = 500, pitch = 4.02, hfov = 24.6, aspect = 1244 / 700 } = {}) => {
  const vfov = 2 * Math.atan(Math.tan(hfov * Math.PI / 360) / aspect) * 180 / Math.PI;
  const cam = new THREE.PerspectiveCamera(vfov, aspect, 1, 120000);
  const fx = Math.cos(t), fy = Math.sin(t);
  cam.position.copy(S(fx * r0, fy * r0, z));
  const d = 3672, tp = Math.tan(pitch * Math.PI / 180);
  cam.lookAt(S(fx * (r0 + d), fy * (r0 + d), z - d * tp));
  return cam;
};
// The ground tiles (obstruction_groundmodel_*) laid around the ring like the game lays them along the track.
window.layGround = (scene, ents, { blocks = 9 } = {}) => {
  const tiles = [];
  scene.traverse((o) => { const m = /obstruction_groundmodel_(\d+)/.exec(o.name); if (m && o.isMesh) tiles.push({ id: m[1], mesh: o }); });
  const byId = {}; for (const t of tiles) (byId[t.id] ||= []).push(t.mesh);
  const group = new THREE.Group();
  const x0 = Math.min(...ents.map((e) => e.x)) - 266, x1 = Math.max(...ents.map((e) => e.x)) + 266, len = x1 - x0;
  for (const meshes of Object.values(byId)) for (const m of meshes) m.visible = false;
  for (let b = 0; b < blocks; b++) {
    for (const e of ents) {
      const meshes = byId[e.id]; if (!meshes) continue;
      const along = b + (e.x - x0) / len; const ang = along * 2 * Math.PI / blocks;
      for (const src of meshes) {
        // The mesh's own placement in the export: undo the template transform, then apply ours.
        const piece = src.clone(); piece.visible = true;
        const wrap = new THREE.Group();
        const inv = new THREE.Matrix4();
        src.updateWorldMatrix(true, false);
        // template world transform
        const T = new THREE.Matrix4().compose(S(e.x, e.y, e.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), e.yaw * Math.PI / 180), new THREE.Vector3(1, 1, 1));
        inv.copy(T).invert();
        const local = inv.multiply(src.matrixWorld.clone());
        // new transform: at the ring position, rotated by the ring angle (the template's x axis becomes the tangent)
        const r = e.r ?? e.y; const rot = ang - Math.PI / 2;
        const N = new THREE.Matrix4().compose(S(Math.cos(ang) * r, Math.sin(ang) * r, e.z + (window.GROUND_DZ ?? 0)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (e.yaw * Math.PI / 180) + rot), new THREE.Vector3(1, 1, 1));
        piece.matrixAutoUpdate = false; piece.matrix.copy(N.multiply(local)); 
        group.add(piece);
      }
    }
  }
  scene.add(group);
  return group;
};
