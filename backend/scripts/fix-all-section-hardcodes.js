const fs = require('fs');

let css = fs.readFileSync(
  'frontend/src/features/saas/styles/sections.css', 'utf8');

const MAP = [
  [/#b5daed|#9fd3ec|#d8f6ef|#93b6c9|#8df4de|#9cc6d9|#effff7|#d8fff3|#d9f7f5|#e7f3fb|#bfd7e6|#f3fbff|#90b5c7|#dbf0fb|#8fb2c2|#9fd2e8|#d9fff6|#dff8ff|#d7f7ff|#bfccff|#8bf5df|#aff8c5|#d8f6ef/g,
   'var(--saas-text-primary)'],

  [/#8fb2c2|#6a7d8c|#1430|#b7d2e2|#bfd7e6|#90b5c7|#8fb2c2/g,
   'var(--saas-text-secondary)'],

  [/#f5d06a|#ffd788|#ffd28f/g,
   'color-mix(in srgb, var(--saas-accent-warning) 85%, var(--saas-text-primary))'],

  [/#0f6fcc|#1468/g,
   'var(--saas-accent-info)'],

  [/#fca5a5|#ffc0c0/g,
   'color-mix(in srgb, var(--saas-accent-danger) 70%, var(--saas-text-primary))'],

  [/#8bf5df|#aff8c5|#ffd788/g,
   'color-mix(in srgb, var(--saas-accent-primary) 70%, var(--saas-text-primary))'],

  [/background:\s*rgba\(\s*[0-9]+,\s*[0-9]+,\s*[0-9]+,\s*0\.[0-9]+\s*\)/g,
   (match) => {
     const alphaMatch = match.match(/,\s*([0-9]*\.?[0-9]+)\s*\)$/);
     const alpha = alphaMatch ? parseFloat(alphaMatch[1]) : 0.8;
     if (alpha >= 0.85) return 'background: var(--saas-bg-elevated)';
     if (alpha >= 0.65) return 'background: var(--saas-bg-surface)';
     return 'background: color-mix(in srgb, var(--saas-bg-elevated) 55%, transparent)';
   }],

  [/border(?:-color)?:\s*(?:1px solid\s*)?rgba\([0-9,\s.]+\)/g,
   (match) => match.startsWith('border:')
     ? 'border: 1px solid var(--saas-border-color)'
     : 'border-color: var(--saas-border-color)'],

  [/background:\s*linear-gradient\([^;]*rgba\([0-9]{1,3},\s*[0-9]{1,3},\s*[0-9]{1,3}[^;]+;/g,
   'background: var(--saas-bg-elevated);'],
];

for (const [pattern, replacement] of MAP) {
  css = css.replace(pattern, replacement);
}

fs.writeFileSync(
  'frontend/src/features/saas/styles/sections.css', css, 'utf8');

const remaining = (css.match(/#[0-9a-fA-F]{3,6}|rgba\([0-9]/g) || []).length;
console.log('Hardcodes restantes en sections.css:', remaining);
