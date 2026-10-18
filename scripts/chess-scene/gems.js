// Page script (make.mjs → page.html): the six heroes' gems of «Драконьи шахматы» from Valve's models
// (models/events/crownfall/match3/gems/gem_<hero>.vmdl), seen from the front like the board camera
// (dota_match3_piece_yaw 180, pitch 0). Three looks per hero: the plain gem (the crystal over the hero's
// medallion, internal_a), the super gem and the ultra gem (the «_spells» crystal, more see-through
// — TextureTranslucency 0.3 — over the ability's icon: internal_b and internal_c). Valve's crystal.vfx is
// approximated: the colour texture tinted by g_vColorTint, a clear coat, and the material's exterior
// cube map (a radial glow of the hero's colour) as the environment. Also the shattered gem
// (gem_fragments.vmdl): its 8 pieces, one sprite each, tinted per hero.
const J = window.JOB, CELL = J.cell, SS = 2, FRAG = J.frag;
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true, alpha: true, premultipliedAlpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.setPixelRatio(1); renderer.setClearColor(0, 0);
const atlas = document.createElement('canvas'); atlas.width = CELL * J.heroes.length; atlas.height = CELL * 3;
const ax = atlas.getContext('2d'); ax.imageSmoothingQuality = 'high';
const frags = document.createElement('canvas'); frags.width = FRAG * 8; frags.height = FRAG * J.heroes.length;
const fx = frags.getContext('2d'); fx.imageSmoothingQuality = 'high';
const lights = (scene) => {
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-1.5, 2, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.0); rim.position.set(2, -1, 1); scene.add(rim);
};
const cam = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, -10, 10); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0);
const tints = [];
const fragModel = await loadModel('/models/gem_fragments.glb');
const fragMeta = [];
for (const [i, h] of J.heroes.entries()) {
  const g = await loadModel(`/models/${h.gem}.glb`);
  const img = await loadImage(`/cubes/${h.cube}`);
  const cube = new THREE.CubeTexture([img, img, img, img, img, img]); cube.colorSpace = THREE.SRGBColorSpace; cube.needsUpdate = true;
  const scene = new THREE.Scene(); lights(scene);
  let tint = null;
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m.name.includes('interior')) o.material = new THREE.MeshBasicMaterial({ map: m.map });
    else {
      tint = tint || m.color.clone();
      o.material = new THREE.MeshPhysicalMaterial({ map: m.map, color: 0xffffff, roughness: 0.25, metalness: 0, envMap: cube, envMapIntensity: 1.6, transparent: true,
        opacity: m.name.includes('spells') ? 0.32 : 0.5, clearcoat: 1, clearcoatRoughness: 0.15, emissive: m.color, emissiveIntensity: 0.12, depthWrite: false });
      o.renderOrder = 2;
    }
  });
  tints.push('#' + tint.getHexString(THREE.SRGBColorSpace));
  scene.add(g.scene);
  renderer.setSize(CELL * SS, CELL * SS, false);
  for (const [k, vis] of [['gem', 'internal_a'], ['gem_spells', 'internal_b'], ['gem_spells', 'internal_c']].entries()) {
    g.scene.traverse((o) => { if (o.isMesh) o.visible = o.name === 'gem_2' || vis.some((v) => o.name === v || o.name.startsWith(v + '_')); });
    renderer.render(scene, cam);
    ax.drawImage(renderer.domElement, i * CELL, k * CELL, CELL, CELL);
  }
  // fragments: each piece alone, centred in its cell; its offset from the gem's centre in cell units
  const fs = new THREE.Scene(); lights(fs);
  const f = fragModel.scene.clone(true); fs.add(f);
  const mat = new THREE.MeshPhysicalMaterial({ color: tint.clone().lerp(new THREE.Color(1, 1, 1), 0.15), roughness: 0.3, envMap: cube, envMapIntensity: 1.8, clearcoat: 1, emissive: tint, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 });
  const pieces = []; f.traverse((o) => { if (o.isMesh) { o.material = mat; pieces.push(o); } });
  f.updateMatrixWorld(true);
  renderer.setSize(FRAG * SS, FRAG * SS, false);
  const meta = [];
  for (const [k, piece] of pieces.entries()) {
    pieces.forEach((p) => { p.visible = p === piece; });
    const box = new THREE.Box3().setFromObject(piece), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const half = Math.max(size.x, size.y) * 0.55;
    const fc = new THREE.OrthographicCamera(c.x - half, c.x + half, c.y + half, c.y - half, -10, 10); fc.position.set(0, 0, 5);
    renderer.render(fs, fc);
    fx.drawImage(renderer.domElement, k * FRAG, i * FRAG, FRAG, FRAG);
    meta.push([+(c.x / 3).toFixed(3), +(-c.y / 3).toFixed(3), +(half * 2 / 3).toFixed(3)]); // centre and sprite size in cells (the gem view is 3 model units a cell)
  }
  fragMeta.push(meta);
}
return { 'gems.png': atlas.toDataURL('image/png'), 'fragments.png': frags.toDataURL('image/png'), meta: { cell: CELL, frag: FRAG, tints, fragments: fragMeta[0] } };
