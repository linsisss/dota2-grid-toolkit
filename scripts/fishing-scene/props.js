// The catches as pictures (make.mjs → props/<id>.png): the eight bodies of reef_fish_flat (the vdata's
// m_nSceneModelBodyIndex), the old shoe and the stick (fishing_debris_driftwood), seen from the side,
// head to the right, as they hang from the line on the catch screen.
const out = {};
renderer.setPixelRatio(1);
const items = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `fish${i}`, file: '/models/props/reef_fish_flat.glb', node: new RegExp(`fish_${i + 1}$`) })),
  { id: 'shoe', file: '/models/props/fishing_debris_shoe.glb' },
  { id: 'stick', file: '/models/props/fishing_debris_driftwood.glb' },
];
for (const it of items) {
  const scene = await setupScene([it.file], { sun: 3.2, hemi: 2.6 });
  scene.traverse((o) => { if (o.isMesh && it.node && !it.node.test(o.name)) o.visible = false; });
  const box = new THREE.Box3(); scene.traverse((o) => { if (o.isMesh && o.visible) box.expandByObject(o); });
  const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  // The thinnest axis is the one we look along; the longest lies across the picture.
  const axes = [['x', size.x], ['y', size.y], ['z', size.z]].sort((a, b) => a[1] - b[1]);
  const thin = axes[0][0], long = axes[2][0];
  const view = new THREE.Vector3(); view[thin] = 1;
  const flip = window.FLIP?.[it.id] ? -1 : 1;
  const L = axes[2][1], H = axes[1][1], S2 = (window.LONG || 420) / L;
  const w = Math.round(L * S2 + 40), h = Math.round(H * S2 + 40);
  renderer.setSize(w, h);
  const cam = new THREE.OrthographicCamera(-w / 2 / S2, w / 2 / S2, h / 2 / S2, -h / 2 / S2, 0.1, 10000);
  cam.position.copy(centre).addScaledVector(view, 2000 * flip);
  cam.up.set(0, 0, 0); cam.up[axes[1][0]] = 1;
  cam.lookAt(centre);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, cam);
  out[`props/${it.id}.png`] = renderer.domElement.toDataURL('image/png');
  out[it.id] = { size: size.toArray(), thin, long, w, h };
}
return out;
