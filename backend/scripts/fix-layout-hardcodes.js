const fs = require('fs');

let css = fs.readFileSync(
  'frontend/src/features/saas/styles/layout.css', 'utf8');

css = css
  .replace(/background:\s*rgba\([0-9,\s.]+\)/g, 'background: var(--saas-bg-elevated)')
  .replace(/border(?:-color)?:\s*rgba\([0-9,\s.]+\)/g, 'border-color: var(--saas-border-color)')
  .replace(/color:\s*rgba\([0-9,\s.]+\)/g, 'color: var(--saas-text-secondary)')
  .replace(/background:\s*linear-gradient\([^;]*rgba\([0-9,\s.]+\)[^;]+;/g,
    'background: var(--saas-bg-surface);');

fs.writeFileSync('frontend/src/features/saas/styles/layout.css', css, 'utf8');
const rem = (css.match(/rgba\([0-9]/g) || []).length;
console.log('Hardcodes rgba restantes en layout.css:', rem);
