const fs = require('fs');
const path = require('path');

const MAP = [
  [/rgba\(8,\s*20,\s*29[^)]+\)/g, 'var(--saas-bg-base)'],
  [/rgba\(9,\s*21,\s*30[^)]+\)/g, 'var(--saas-bg-base)'],
  [/rgba\(9,\s*31,\s*43[^)]+\)/g, 'var(--saas-bg-surface)'],
  [/rgba\(5,\s*14,\s*20[^)]+\)/g, 'var(--saas-bg-base)'],
  [/rgba\(6,\s*16,\s*22[^)]+\)/g, 'var(--saas-bg-base)'],
  [/rgba\(11,\s*24,\s*33[^)]+\)/g, 'var(--saas-bg-surface)'],
  [/rgba\(123,\s*170,\s*196[^)]+\)/g, 'var(--saas-border-color)'],
  [/rgba\(148,\s*184,\s*204[^)]+\)/g, 'var(--saas-border-color)'],
  [/rgba\(0,\s*199,\s*160[^)]+\)/g, 'var(--saas-accent-primary)'],
  [/rgba\(0,\s*155,\s*126[^)]+\)/g, 'var(--saas-accent-primary)'],
  [/#dcfff7/g, 'var(--saas-accent-primary-text)'],
  [/rgba\(172,\s*32,\s*32[^)]+\)/g, 'var(--saas-accent-danger)'],
  [/rgba\(138,\s*22,\s*22[^)]+\)/g, 'var(--saas-accent-danger)'],
  [/rgba\(86,\s*22,\s*22[^)]+\)/g, 'var(--saas-accent-danger)'],
  [/rgba\(255,\s*96,\s*96[^)]+\)/g, 'var(--saas-accent-danger)'],
  [/rgba\(255,\s*126,\s*126[^)]+\)/g, 'var(--saas-accent-danger)'],
  [/#ffe4e4|#ffd7d7|#ffd5d5/g, 'color-mix(in srgb, var(--saas-accent-danger) 15%, var(--saas-bg-surface))'],
  [/rgba\(168,\s*85,\s*0[^)]+\)/g, 'var(--saas-accent-warning)'],
  [/rgba\(255,\s*170,\s*90[^)]+\)/g, 'var(--saas-accent-warning)'],
];

const stylesDir = path.join('frontend', 'src', 'features', 'saas', 'styles');
const files = fs
  .readdirSync(stylesDir)
  .filter((entry) => entry.endsWith('.css'))
  .map((entry) => path.join(stylesDir, entry));
files.push(path.join('frontend', 'src', 'index.css'));

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  for (const [pattern, replacement] of MAP) {
    content = content.replace(pattern, replacement);
  }
  fs.writeFileSync(file, content, 'utf8');
  console.log('Fixed:', file);
}
