const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const SECTIONS = { academy: 'Academy', company: 'Company', legal: 'Legal' };

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

// Strip the leading ../ that section sub-pages use to reference dist assets.
function normDist(href) {
  return href.replace(/^\.\.\//, '');
}

function isNoindex(robotsStr) {
  return robotsStr != null && robotsStr.toLowerCase().includes('noindex');
}

// Returns [{href, body, featured}] for every card in a built index page.
// Covers the three card variants: <a directory-featured>, <a directory-card>,
// and <article directory-card>. href is already normDist-normalized.
function walkCards(html) {
  const cards = [];

  const featM = html.match(/<a\b[^>]+href="([^"]+)"[^>]*\bdirectory-featured\b[^>]*>([\s\S]*?)<\/a>/);
  if (featM) cards.push({ href: normDist(featM[1]), body: featM[2], featured: true });

  for (const m of html.matchAll(/<a\b[^>]+href="([^"]+)"[^>]*\bdirectory-card\b[^>]*>([\s\S]*?)<\/a>/g)) {
    cards.push({ href: normDist(m[1]), body: m[2], featured: false });
  }

  for (const m of html.matchAll(/<article\b[^>]*\bdirectory-card\b[^>]*>([\s\S]*?)<\/article>/g)) {
    const inner = m[1].match(/href="([^"]+)"/);
    if (inner) cards.push({ href: normDist(inner[1]), body: m[1], featured: false });
  }

  return cards;
}

function report(errors, label, passMessage) {
  if (errors.length) {
    console.error(`${label} failed — ${errors.length} issue(s):\n`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(passMessage);
}

module.exports = { ROOT, DIST, SECTIONS, walk, relPosix, decode, normDist, isNoindex, walkCards, report };
