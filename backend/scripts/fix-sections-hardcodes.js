const fs = require('fs');

let css = fs.readFileSync('frontend/src/features/saas/styles/sections.css', 'utf8');

const MAP = [
  [
    /#f0f8ff|#eef6fb|#e8f3f9|#eaf6ff|#def3ff|#def2ff|#dff4ff|#e6f5ff|#ebf7ff|#e7f1f7|#f5fbff|#f0f8ff|#e7f1f7|#cfe6f7|#d9f0ff|#d8eef7|#cfe7f6|#dcfff6|#dcfff7/g,
    'var(--saas-text-primary)',
  ],
  [/#9eb8c9|#9ec6da|#7fb8d7|#7ea0b4|#9ec6da|#8dd5ff|#b9d4e4/g, 'var(--saas-text-secondary)'],
  [/#0a1923|#0b1923|#0b141a/g, 'var(--saas-bg-base)'],
  [/#00c7a0|#dcfff7/g, 'var(--saas-accent-primary)'],
  [/#ffe4e4|#ffb3b3/g, 'color-mix(in srgb, var(--saas-accent-danger) 15%, var(--saas-bg-surface))'],
  [/#ffd580/g, 'color-mix(in srgb, var(--saas-accent-warning) 25%, var(--saas-bg-surface))'],
  [/#8af5de/g, 'color-mix(in srgb, var(--saas-accent-primary) 30%, var(--saas-bg-surface))'],
];

for (const [pattern, replacement] of MAP) {
  css = css.replace(pattern, replacement);
}

fs.writeFileSync('frontend/src/features/saas/styles/sections.css', css, 'utf8');
console.log('Done. Remaining hardcodes:');

const remaining = (css.match(/#[0-9a-fA-F]{3,6}/g) || []).length;
console.log(remaining);
