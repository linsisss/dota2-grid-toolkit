const out = {};
const A = (window.OBA ?? 190) * Math.PI / 180;
const defs = [
  { name: 'top', file: '/models/stalagmite_cavern_02_no_shadows.glb', r: 3672, z: 1114.84 - 420, roll: Math.PI, tint: 0xc09070, yaws: [0, 90, 225, 300] },
  { name: 'bottom', file: '/models/journey_stoneforest01.glb', r: 3672, z: 128 + 330, roll: 0, tint: 0xff6436, yaws: [45, 135, 210, 345] },
];
const ss = 2; renderer.setPixelRatio(1); renderer.setSize(1244 * ss, 700 * ss);
for (const d of defs) {
  for (let k = 0; k < d.yaws.length; k++) {
    const scene = await setupScene([d.file]);
    const model = scene.children.find((o) => o.type === 'Group');
    model.traverse((o) => { if (o.isMesh) o.material.color = new THREE.Color().setHex(d.tint, THREE.LinearSRGBColorSpace); });
    const pos = S(Math.cos(A) * d.r, Math.sin(A) * d.r, d.z);
    model.position.copy(pos);
    model.rotation.order = 'YXZ';
    model.rotation.y = d.yaws[k] * Math.PI / 180; model.rotation.z = d.roll;
    scene.updateMatrixWorld(true);
    const cam = gameCamera(A, { r0: 0, hfov: 18.1, z: 500, pitch: 0.6 });
    renderer.setClearColor(0x000000, 0); renderer.render(scene, cam);
    const o = pos.clone().project(cam);
    out[`ob/${d.name}${k}.png`] = renderer.domElement.toDataURL('image/png');
    out[`${d.name}${k}`] = { origin: [(o.x + 1) / 2 * 1244 * ss, (1 - o.y) / 2 * 700 * ss] };
  }
}
return out;
