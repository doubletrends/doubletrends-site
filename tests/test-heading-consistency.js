// For each company sub-page, validates that the index card h3 matches the sub-page H1.
// Legal is exempt — those sub-pages intentionally keep formal document titles.

const fs   = require('fs');
const path = require('path');
const { DIST, decode, walkCards, report } = require('./test-utils');

const H1_RE = /<h1\b[^>]*>\s*([^<]+?)\s*<\/h1>/;
const H3_RE = /<h3\b[^>]*>\s*([^<]+?)\s*<\/h3>/;

function extractH1(html) {
  const m = html.match(H1_RE);
  return m ? decode(m[1]) : null;
}

function extractH3(block) {
  const m = block.match(H3_RE);
  return m ? decode(m[1]) : null;
}

function indexCards(html) {
  return walkCards(html)
    .map(({ href, body }) => ({ href, h3: extractH3(body) }))
    .filter(({ h3 }) => h3 !== null);
}

function main() {
  if (!fs.existsSync(DIST)) throw new Error('dist/ not found — run npm run build first');

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

  report(errors, 'Heading consistency test');
}

main();
