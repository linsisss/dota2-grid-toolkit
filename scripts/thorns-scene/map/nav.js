// «Терновый трон», map: a height render straight from above for the walkability grid (page script;
// make.mjs → WORK/nav/height.png). Every visible mesh of the world, the tall props included, the game's
// destructibles excluded; each pixel = the highest surface's z at NAV.res units a pixel, as 16 bits in R (high)
// and G (low): z = R·256 + G − 8192 (0 = nothing).
async function main() {
  const N = JOB.nav, W = await setupWorld(JOB.world, { showProps: true });
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    vertexShader: 'varying float vZ; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vZ = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'varying float vZ; void main(){ float v = clamp(floor(vZ + 8192.0), 1.0, 65535.0); gl_FragColor = vec4(floor(v / 256.0) / 255.0, mod(v, 256.0) / 255.0, 0.0, 1.0); }',
  });
  for (const m of W.groups.env) m.visible = false;
  W.scene.overrideMaterial = mat;
  const w = Math.round((N.x1 - N.x0) / N.res), h = Math.round((N.y1 - N.y0) / N.res);
  const cam = new THREE.OrthographicCamera(-(N.x1 - N.x0) / 2, (N.x1 - N.x0) / 2, (N.y1 - N.y0) / 2, -(N.y1 - N.y0) / 2, 100, 40000);
  cam.position.copy(S((N.x0 + N.x1) / 2, (N.y0 + N.y1) / 2, 20000)); cam.up.copy(S(0, 1, 0));
  cam.lookAt(S((N.x0 + N.x1) / 2, (N.y0 + N.y1) / 2, 0)); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setSize(w, h); renderer.setClearColor(0x000000, 1); renderer.autoClear = true;
  renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -CLIP_Z)];
  renderer.render(W.scene, cam);
  await save('nav/height.png', renderer.domElement.toDataURL('image/png'));
  return { w, h };
}
