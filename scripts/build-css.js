/**
 * build-css.js
 * Compiles src/styles/ into one minified dist/public/styles/site.css with the
 * Tailwind CLI. Called from build.js.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..'); // scripts/ lives one level below the repo root

// entry.css (Tailwind directives) + the house style, in cascade order:
// tokens → base → components → layouts. The compatibility layer comes last so
// it can override Tailwind utilities left in older page markup.
const CSS_SEGMENTS = [
  'tokens/font-face', 'tokens/colors',
  'base/reset-global', 'base/type-base',
  'components/chrome', 'components/controls', 'components/exhibit',
  'layouts/document',
  'components/legacy',
  'components/texture',
];

function compileCss(dist) {
  const stylesDir   = path.join(ROOT, 'src', 'styles');
  const entryCSS    = fs.readFileSync(path.join(stylesDir, 'entry.css'), 'utf8');
  const customCSS   = CSS_SEGMENTS.map((s) => fs.readFileSync(path.join(stylesDir, `${s}.css`), 'utf8')).join('\n');
  const cssInputTmp = path.join(ROOT, 'build', 'site-input.css');
  const cssOut      = path.join(dist, 'public', 'styles', 'site.css');
  fs.mkdirSync(path.dirname(cssOut), { recursive: true });
  fs.mkdirSync(path.dirname(cssInputTmp), { recursive: true });
  fs.writeFileSync(cssInputTmp, entryCSS + '\n' + customCSS, 'utf8');
  // The CLI through the package's declared entry (its `bin`), not a path into it.
  const tailwindPkg = require.resolve('tailwindcss/package.json');
  const tailwindCli = path.join(path.dirname(tailwindPkg), require(tailwindPkg).bin.tailwindcss);
  try {
    execFileSync(
      process.execPath,
      [tailwindCli, '-i', cssInputTmp, '-o', cssOut, '--minify'],
      { stdio: 'inherit' },
    );
  } finally {
    fs.unlinkSync(cssInputTmp);
  }
}

module.exports = { compileCss };
