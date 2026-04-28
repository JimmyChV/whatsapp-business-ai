const fs = require('fs');
const path = require('path');

const replacements = [
  [/#def3ff|#eaf6ff|#e8f6ff|#eef8ff|#dff4ff|#eef7fc|#f2fbff|#e8f3f9|#e8f3fb|#e8f1f7|#ecfaff|#ecf7ff|#e7f8ff|#edf9ff|#edf5f8|#eff8fb|#eff4f7|#e5f0f5|#e2edf2|#e3f2fb|#d8f2ff|#d9e4e9|#d9e8f0|#d9e7ee|#d8e2e7|#dce6eb|#dfe9ee|#d8e7ef|#d6e1e7|#d6e4eb|#d6e4ec|#d8eef7|#d8eaf5|#d8edf9|#e4edf2|#e5eff4|#e8f1f5|#e8f3f9|#e8f5ff|#e8f8f4|#edf4f7|#eef4f7|#eef5f9|#f2fbff|#f3f7fa|#f3fffb/g, 'var(--saas-text-primary)'],
  [/#9ec0d7|#9ab3c4|#97afbe|#97b0c2|#95aab8|#8ea7b8|#8ea3ad|#90a9bb|#8fc4d9|#8fb0bf|#9db3c0|#9db0ba|#9cb2bc|#9cb1bc|#9cb1ba|#9bb0bb|#98afba|#98adb6|#95a8b1|#93a8b1|#92a8b2|#91a9b4|#8ea3ad|#9cb2bc|#9eb3bc|#9db1ba|#9db5c2|#a5bac5|#a7bcc6|#a8bcc8|#a8c0cf|#a9bbc4|#a9c0cf|#b3c2c9|#b3c2ca|#b5c6cd|#b7cbda|#b7ccda|#bfd0d8|#c2d6de|#c4d5de|#c5d6e1|#c5d7e4|#c6d3da|#c6d6e0|#c8d8df|#cad8de|#cfe1e9|#d5fff5|#d8eef7|#dbe5ea/g, 'var(--saas-text-secondary)'],
  [/#89a8bb|#89a0aa|#86a7b5|#88a2ae|#89a3af|#8aa2ad|#8ea3ad|#8ea7b8|#8fb0bf|#8fe4d8|#94acb7|#9bb0bb|#9cb1bc|#9fb3be|#a5bac5|#a7c0cf|#a8bfcc|#b7f6ea/g, 'var(--saas-text-tertiary)'],
  [/#0b1923|#0b141a|#0f1a21|#0f1b22|#0f1f28|#13232d|#13252f/g, 'var(--saas-bg-base)'],
  [/#1b2a33|#1a2b35|#1a2a33|#162831|#16252e|#15252e|#16252e/g, 'var(--saas-bg-surface)'],
  [/#1e2f38|#21343f|#21252e/g, 'var(--saas-bg-elevated)'],
  [/#ffe4e6|#ffdcdc|#ffd7d7|#ffd5d5|#ffd1d1|#ffc8c8|#ffc6c6|#ffb4b4|#ffb6b6|#ffb8b2|#f3bcbc/g, 'color-mix(in srgb, var(--saas-accent-danger) 18%, var(--saas-bg-surface))'],
  [/#e7fff8|#bff4e7|#b7f6ea|#baf6e8|#9ceddf|#8ff3d4|#9fe9d8|#8cf3de|#b6f4e5|#bff2e7/g, 'color-mix(in srgb, var(--saas-accent-primary) 20%, var(--saas-bg-surface))'],
  [/#cdeaff|#d9efff|#c4e5ff|#caebff|#d8f2ff|#b2ceff|#bcd5ff|#7dd6ff|#9adfff/g, 'color-mix(in srgb, var(--saas-accent-info) 25%, var(--saas-bg-surface))'],
  [/#ffebb7|#ffd28f|#ffe7c0|#ffe3b4/g, 'color-mix(in srgb, var(--saas-accent-warning) 25%, var(--saas-bg-surface))'],
  [/linear-gradient\(160deg,\s*#061017 0%,\s*#0a1721 42%,\s*#0e2432 100%\)/g, 'linear-gradient(160deg, var(--saas-bg-base) 0%, var(--saas-bg-surface) 42%, var(--saas-bg-elevated) 100%)'],
  [/linear-gradient\(180deg,\s*#0f1b22 0%,\s*#0d171e 100%\)/g, 'linear-gradient(180deg, var(--saas-bg-surface) 0%, var(--saas-bg-base) 100%)'],
  [/linear-gradient\(90deg,\s*#202c33 25%,\s*#2a3942 50%,\s*#202c33 75%\)/g, 'linear-gradient(90deg, var(--saas-bg-surface) 25%, var(--saas-bg-elevated) 50%, var(--saas-bg-surface) 75%)'],
  [/#202c33|#2a3942/g, 'var(--saas-bg-surface)'],
  [/#00a884|#0f7a53|#25d366/g, 'var(--saas-accent-primary)'],
  [/#111b21|#042922/g, 'var(--saas-text-inverse)'],
  [/#8696a0|#6e7681/g, 'var(--saas-text-secondary)'],
  [/#00b89c/g, 'var(--saas-accent-info)'],
  [/#fff|#ffffff/g, 'var(--saas-accent-primary-text)']
];

function fixFile(relativePath) {
  const filePath = path.resolve(relativePath);
  let content = fs.readFileSync(filePath, 'utf8');
  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Fixed: ${relativePath}`);
}

fixFile('frontend/src/features/saas/saas.css');
fixFile('frontend/src/index.css');
