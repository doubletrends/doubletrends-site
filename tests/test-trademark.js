// Trademark convention (as established publishers handle marks):
//
//   1. Every built page carries the footer notice
//      "DoubleTrends™ is a trademark of DoubleTrends L.L.C.".
//   2. Outside the legal documents, the ™ symbol appears only in that notice
//      and where "DoubleTrends™" is the name of the indicator section — a
//      label whose whole text is the mark (primary nav, footer heading,
//      breadcrumb, navigation links) and the matching JSON-LD breadcrumb
//      name. Running text, titles and metadata say plain "DoubleTrends".
//      (Marking every mention reads as defensive; the notice preserves the claim.)
//   3. Legal documents (legal/*) may mark the name wherever their drafting does.
const fs   = require('fs');
const path = require('path');
const { DIST, walk, relPosix, report } = require('./test-utils');

const NOTICE_RE = /DoubleTrends(?:™|&trade;) is a trademark of DoubleTrends L\.L\.C\./g;
const MARK_RE   = /DoubleTrends(?:™|&trade;|%E2%84%A2)/g;
// The primary-nav item must carry the mark.
const NAV_RE    = /data-nav="indicator"(?: aria-current="page")?>DoubleTrends(?:™|&trade;)<\/a>/g;

// A mark is sanctioned when it is the footer notice, a whole label, or the
// JSON-LD breadcrumb name.
function sanctioned(html, index, match) {
  const after = html.slice(index, index + 60);
  if (/^DoubleTrends(?:™|&trade;) is a trademark/.test(after)) return true;
  const before = html[index - 1];
  const next = html[index + match.length];
  if (before === '>' && next === '<') return true;
  return html.slice(Math.max(0, index - 9), index) === '"name": "' && next === '"';
}

function main() {
  if (!fs.existsSync(DIST)) throw new Error('dist/ not found — run npm run build first');
  const files = walk(DIST).filter((f) => f.endsWith('.html'));
  const errors = [];

  for (const file of files) {
    const rel = relPosix(file, DIST);
    const html = fs.readFileSync(file, 'utf8');
    const notices = (html.match(NOTICE_RE) || []).length;
    if (notices !== 1) errors.push(`${rel}: expected the footer trademark notice once, found ${notices}`);
    if (rel.startsWith('legal/')) continue;
    const navMarks = (html.match(NAV_RE) || []).length;
    if (navMarks !== 1) errors.push(`${rel}: expected the "DoubleTrends™" nav label once, found ${navMarks}`);
    const extra = [];
    for (const m of html.matchAll(MARK_RE)) {
      if (!sanctioned(html, m.index, m[0])) extra.push(html.slice(0, m.index).split('\n').length);
    }
    if (extra.length) errors.push(`${rel}: ™ outside the notice and section labels on line(s) ${extra.join(', ')}`);
  }

  if (!files.length) errors.push('no built pages found');
  report(errors, `Trademark test (${files.length} pages)`);
}

main();
