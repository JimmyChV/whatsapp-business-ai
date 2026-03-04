import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'src');
const markerRegex = /^(<<<<<<<|=======|>>>>>>>)( .*)?$/m;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx|css|json|md)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(root);
const offenders = [];

for (const file of files) {
  const txt = fs.readFileSync(file, 'utf8');
  if (markerRegex.test(txt)) {
    const firstLine = txt.split(/\r?\n/).findIndex((line) => /^(<<<<<<<|=======|>>>>>>>)( .*)?$/.test(line));
    offenders.push({ file: path.relative(process.cwd(), file), line: firstLine + 1 });
  }
}

if (offenders.length) {
  console.error('❌ Se detectaron marcadores de conflicto Git en frontend/src:');
  for (const o of offenders) {
    console.error(`   - ${o.file}:${o.line}`);
  }
  console.error('\nResuelve el conflicto eliminando <<<<<<< ======= >>>>>>> y dejando solo el código final.');
  process.exit(1);
}

console.log('✅ Sin marcadores de conflicto en frontend/src');
