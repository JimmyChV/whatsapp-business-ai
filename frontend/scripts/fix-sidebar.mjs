import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const templatePath = path.join(root, 'scripts', 'templates', 'Sidebar.clean.jsx');
const targetPath = path.join(root, 'src', 'components', 'Sidebar.jsx');

if (!fs.existsSync(templatePath)) {
  console.error(`❌ No existe template: ${templatePath}`);
  process.exit(1);
}

const clean = fs.readFileSync(templatePath, 'utf8');
fs.writeFileSync(targetPath, clean, 'utf8');

console.log('✅ Sidebar.jsx restaurado desde template limpio.');
console.log(`   source: ${path.relative(root, templatePath)}`);
console.log(`   target: ${path.relative(root, targetPath)}`);
