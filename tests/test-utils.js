const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// Sections whose sub-pages follow the strict label convention: kicker
// "Section · Category" where Category is the article section or the H1.
const SECTIONS = { research: 'Research', company: 'About', legal: 'Legal' };
// Sections whose sub-pages only need a kicker that starts with "Section · "
// (their H1s are descriptive headlines, not category names).
const LOOSE_SECTIONS = { alphaverify: 'AlphaVerify' };

// Handles both file and directory targets.
function walk(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  const out = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function relPosix(file, root) {
  return path.relative(root, file).split(path.sep).join('/');
}

// Full HTML entity decode used across overline / nav / heading tests.
function decode(str) {
  return str
    .replace(/&amp;/g,    '&')
    .replace(/&middot;/g, '·')
    .replace(/&trade;/g,  '™')
    .replace(/&rsquo;/g,  '’')
    .replace(/&mdash;/g,  '—')
    .replace(/&ndash;/g,  '–')
    .replace(/&rarr;/g,   '→')
    .replace(/&nbsp;/g,   ' ')
    .trim();
}

function isNoindex(robotsStr) {
  return robotsStr != null && robotsStr.toLowerCase().includes('noindex');
}

function report(errors, label) {
  const green = '\x1b[32m', red = '\x1b[31m', reset = '\x1b[0m';
  if (errors.length) {
    console.error(`  ${red}✗ FAILED${reset}  ${label}: ${errors.length} error(s)`);
    for (const e of errors) console.error(`    - ${e}`);
    process.exit(1);
  }
  console.log(`  ${green}✓ PASS${reset}  ${label}`);
}

module.exports = { ROOT, DIST, SECTIONS, LOOSE_SECTIONS, walk, relPosix, decode, isNoindex, report };
