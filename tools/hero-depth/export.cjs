// Renders the fitted hero's depth for a box of the frame and writes it as JSON (view depth per pixel, 0 = none).
const { chromium } = require('/home/router-new/frontend/node_modules/playwright');
const fs = require('fs');
(async () => {
  const [items, pose, box, out] = [process.argv[2], JSON.parse(process.argv[3]), JSON.parse(process.argv[4]), process.argv[5]];
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  await p.goto('http://127.0.0.1:8765/index.html?items=' + items); await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
  const depth = await p.evaluate(({ pose, box }) => window.depthCrop(pose, box), { pose, box });
  fs.writeFileSync(out, JSON.stringify({ items, pose, box, depth }));
  const vals = depth.filter((v) => v > 0); console.log('pixels', vals.length, 'min', Math.min(...vals).toFixed(1), 'max', Math.max(...vals).toFixed(1));
  await b.close();
})();
