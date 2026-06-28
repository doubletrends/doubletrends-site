/**
 * test-heading-consistency.js
 * For each company sub-page, validates that the index card h3 matches the sub-page H1.
 * Legal is exempt — those sub-pages intentionally keep formal document titles.
 */

const fs   = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');

const H1_RE = /<h1\b[^>]*>\s*([^<]+?)\s*<\/h1>/;
const H3_RE = /<h3\b[^>]*>\s*([^<]+?)\s*<\/h3>/;

function decode(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&middot;/g, '·')
    .replace(/&trade;/g, '™')
    .replace(/&rsquo;/g, '’')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rarr;/g, '→')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function extractH1(html) {
  const m = html.match(H1_RE);
  return m ? decode(m[1]) : null;
}

function extractH3(block) {
  const m = block.match(H3_RE);
  return m ? decode(m[1]) : null;
}

function normDist(href) {
  return href.replace(/^\.\.\//, '');
}

// Extract { href, h3 } for every card on an index page
function indexCards(html) {
  const cards = [];

  // Featured card (<a> wrapper)
  const featM = html.match(/<a\b[^>]+href="([^"]+)"[^>]*\bdirectory-featured\b[^>]*>([\s\S]*?)<\/a>/);
  if (featM) {
    const h3 = extractH3(featM[2]);
    if (h3) cards.push({ href: normDist(featM[1]), h3 });
  }

  // <a> wrapper directory-cards
  for (const m of html.matchAll(/<a\b[^>]+href="([^"]+)"[^>]*\bdirectory-card\b[^>]*>([\s\S]*?)<\/a>/g)) {
    const h3 = extractH3(m[2]);
    if (h3) cards.push({ href: normDist(m[1]), h3 });
  }

  // <article> directory-cards (href lives inside the body)
  for (const m of html.matchAll(/<article\b[^>]*\bdirectory-card\b[^>]*>([\s\S]*?)<\/article>/g)) {
    const inner = m[1].match(/href="([^"]+)"/);
    const h3    = extractH3(m[1]);
    if (inner && h3) cards.push({ href: normDist(inner[1]), h3 });
  }

  return cards;
}

function main() {
  if (!fs.existsSync(DIST)) {
    throw new Error('dist/ not found — run npm run build first');
  }

  const errors = [];
  let checked  = 0;

  const indexHtml = fs.readFileSync(path.join(DIST, 'company', 'index.html'), 'utf8');

  for (const { href, h3 } of indexCards(indexHtml)) {
    const subPagePath = path.join(DIST, href);
    if (!fs.existsSync(subPagePath)) {
      errors.push(`${href}: sub-page file not found`);
      continue;
    }
    const h1 = extractH1(fs.readFileSync(subPagePath, 'utf8'));
    checked++;

    if (h1 !== h3) {
      errors.push(`${href}: card h3 "${h3}" ≠ page H1 "${h1 ?? '(missing)'}"`);
    }
  }

  if (errors.length) {
    console.error(`Heading consistency test FAILED — ${errors.length} issue(s):\n`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`Heading consistency test passed — ${checked} company pages checked.`);
}

main();
