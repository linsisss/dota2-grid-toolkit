const { chromium } = require('/home/router-new/frontend/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  await p.goto('http://127.0.0.1:8765/index.html?items=' + process.argv[2]); await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
  const res = await p.evaluate((clips) => {
    let best = null;
    for (const clip of clips) {
      const dur = window.pose({ clip });
      for (let time = 0; time < dur; time += dur / 60) for (let yaw = 20; yaw <= 90; yaw += 5) {
        const q = { clip, time, yaw }, v = window.iou(q); if (!best || v > best.iou) best = { ...q, iou: v };
      }
    }
    // Then the place (the hero's origin may sit a little off the look-at point).
    let cur = best;
    for (let round = 0; round < 3; round++) for (const step of [16, 8, 4, 2]) {
      for (const [dx, dy, dyaw] of [[step, 0, 0], [-step, 0, 0], [0, step, 0], [0, -step, 0], [0, 0, step / 4], [0, 0, -step / 4]]) {
        const q = { ...cur, x: (cur.x || 0) + dx, y: (cur.y || 0) + dy, yaw: cur.yaw + dyaw }, v = window.iou(q);
        if (v > cur.iou) cur = { ...q, iou: v };
      }
    }
    return { best, cur };
  }, process.argv.slice(3));
  console.log(JSON.stringify(res));
  await b.close();
})();
