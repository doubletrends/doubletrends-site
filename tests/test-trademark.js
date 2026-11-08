// Trademark convention: the name is never bare. Every "DoubleTrends" is one of
//
//   - "DoubleTrends L.L.C."  the company (in running text the company is
//                            also "we" or "the firm", which need no name);
//   - "DoubleTrends™"        the mark, as in "the DoubleTrends™ Regime
//                            Indicator". A page marks the name where it first
//                            uses it; later mentions say "the indicator".
//
// The only exception is the wordmark and logo, which are artwork: the header
// and footer set the wordmark as split text (<span>Double</span>Trends) and
// public/brand/ holds the images, so neither contains the string.
//
// Checked over every text file the build publishes and over LISTING.md (the
// firm's profiles elsewhere). Every built page also carries the footer notice
// "DoubleTrends™ is a trademark of DoubleTrends L.L.C." exactly once.
const fs   = require('fs');
const path = require('path');
const { ROOT, DIST, walk, relPosix, report } = require('./utils');

const TEXT_EXT  = /\.(html|txt|xml|csv|json|js|css|md)$|_redirects$/;
const NOTICE_RE = /DoubleTrends(?:™|&trade;) is a trademark of DoubleTrends L\.L\.C\./g;
const BARE_RE   = /DoubleTrends(?!™|&trade;|&#8482;|%E2%84%A2| L\.L\.C\.|&nbsp;L\.L\.C\.)/g;

function bareLines(text) {
  return [...text.matchAll(BARE_RE)].map((m) => text.slice(0, m.index).split('\n').length);
}

function main() {
  if (!fs.existsSync(DIST)) throw new Error('dist/ not found — run npm run build first');
  const errors = [];
  const files = walk(DIST).filter((f) => TEXT_EXT.test(f) && !relPosix(f, DIST).startsWith('public/brand/'));
  let pages = 0;

  for (const file of files) {
    const rel = relPosix(file, DIST);
    const text = fs.readFileSync(file, 'utf8');
    if (rel.endsWith('.html')) {
      pages++;
      const notices = (text.match(NOTICE_RE) || []).length;
      if (notices !== 1) errors.push(`${rel}: expected the footer trademark notice once, found ${notices}`);
    }
    const lines = bareLines(text);
    if (lines.length) errors.push(`${rel}: bare "DoubleTrends" on line(s) ${lines.join(', ')}`);
  }

  const listing = fs.readFileSync(path.join(ROOT, 'LISTING.md'), 'utf8');
  const lines = bareLines(listing);
  if (lines.length) errors.push(`LISTING.md: bare "DoubleTrends" on line(s) ${lines.join(', ')}`);

  if (!pages) errors.push('no built pages found');
  report(errors, `Trademark test (${files.length} files)`);
}

main();
