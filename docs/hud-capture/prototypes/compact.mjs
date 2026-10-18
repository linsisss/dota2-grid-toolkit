import { readFileSync, writeFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  let t = readFileSync(f, 'utf8');
  t = t.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/\s+/g, ' '));
  // keyframes: one line per block
  t = t.replace(/@keyframes '([^']+)'\n\{\n([\s\S]*?)\n\}/g, (_, n, body) => `@keyframes '${n}' { ${body.split('\n').map((l) => l.trim()).join(' ')} }`);
  // rules: selectors joined, body on one line
  t = t.replace(/([^\n{}@][^{}]*?)\n\{\n([^{}]*?)\n\}/g, (_, sel, body) => `${sel.split(',\n').join(', ')} { ${body.split('\n').map((l) => l.trim()).join(' ')} }`);
  t = t.replace(/\n{2,}/g, '\n');
  writeFileSync(f.replace(/\.css$/, '.min.css'), t);
  console.log(f, t.length);
}
