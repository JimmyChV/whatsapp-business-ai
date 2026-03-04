import fs from 'node:fs';
import path from 'node:path';
import { transform } from 'esbuild';

const root = path.resolve(process.cwd(), 'src');
const markerRegex = /^(<<<<<<<|=======|>>>>>>>)( .*)?$/m;
const sourceExtRegex = /\.(js|jsx|ts|tsx)$/i;
const textExtRegex = /\.(js|jsx|ts|tsx|css|json|md)$/i;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (textExtRegex.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(root);
const markerOffenders = [];
const syntaxOffenders = [];

for (const file of files) {
  const txt = fs.readFileSync(file, 'utf8');
  const rel = path.relative(process.cwd(), file);

  if (markerRegex.test(txt)) {
    const firstLine = txt.split(/\r?\n/).findIndex((line) => /^(<<<<<<<|=======|>>>>>>>)( .*)?$/.test(line));
    markerOffenders.push({ file: rel, line: firstLine + 1 });
    continue;
  }

  if (sourceExtRegex.test(file)) {
    try {
      await transform(txt, {
        loader: path.extname(file).slice(1),
        sourcefile: rel,
      });
    } catch (error) {
      const first = error?.errors?.[0];
      syntaxOffenders.push({
        file: rel,
        message: first?.text || error.message,
        line: first?.location?.line || null,
        column: first?.location?.column || null,
      });
    }
  }
}

if (markerOffenders.length || syntaxOffenders.length) {
  if (markerOffenders.length) {
    console.error('❌ Se detectaron marcadores de conflicto Git en frontend/src:');
    for (const o of markerOffenders) {
      console.error(`   - ${o.file}:${o.line}`);
    }
  }

  if (syntaxOffenders.length) {
    console.error('❌ Se detectaron errores de sintaxis/transformación en frontend/src:');
    for (const o of syntaxOffenders) {
      const pos = o.line != null ? `:${o.line}:${(o.column ?? 0) + 1}` : '';
      console.error(`   - ${o.file}${pos} -> ${o.message}`);
    }
  }

  console.error('\nResuelve los conflictos o duplicados antes de ejecutar Vite.');
  process.exit(1);
}

console.log('✅ Sin marcadores de conflicto ni errores de sintaxis en frontend/src');
