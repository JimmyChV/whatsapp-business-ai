import fs from 'node:fs';
import path from 'node:path';
import { transform } from 'esbuild';

const root = path.resolve(process.cwd(), 'src');
const exts = new Set(['.js', '.jsx', '.ts', '.tsx']);
const conflictRegex = /^(<<<<<<<|=======|>>>>>>>)(.*)$/m;

function walk(dir, acc = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, acc);
      continue;
    }
    if (exts.has(path.extname(entry.name))) acc.push(fullPath);
  }
  return acc;
}

function toDisplay(file) {
  return path.relative(process.cwd(), file).replace(/\\/g, '/');
}

async function main() {
  const files = walk(root, []);
  const errors = [];

  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');

    if (conflictRegex.test(code)) {
      errors.push(`${toDisplay(file)} -> Tiene marcadores de conflicto Git (<<<<<<< ======= >>>>>>>)`);
      continue;
    }

    const ext = path.extname(file);
    const loader = ext === '.ts' ? 'ts' : ext === '.tsx' ? 'tsx' : ext === '.jsx' ? 'jsx' : 'js';

    try {
      await transform(code, { loader, sourcemap: false, jsx: 'automatic' });
    } catch (error) {
      const message = error?.errors?.[0]?.text || error?.message || 'Error de parseo';
      const location = error?.errors?.[0]?.location;
      const lineCol = location ? `${location.line}:${location.column}` : '?:?';
      errors.push(`${toDisplay(file)}:${lineCol} -> ${message}`);
    }
  }

  if (errors.length) {
    console.error('❌ Se detectaron errores de sintaxis/transformación en frontend/src:');
    for (const err of errors) console.error(`   - ${err}`);
    console.error('\nResuelve los conflictos o duplicados antes de ejecutar Vite.');
    process.exit(1);
  }

  console.log('✅ Sin marcadores de conflicto ni redeclaraciones/sintaxis inválida en frontend/src');
}

main().catch((err) => {
  console.error('❌ Falló check-conflicts:', err?.message || err);
  process.exit(1);
});
