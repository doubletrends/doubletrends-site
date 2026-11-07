// Trademark convention (as established publishers handle marks):
//
//   1. Every built page carries the footer notice
//      "DoubleTrends™ is a trademark of DoubleTrends L.L.C.".
//   2. Outside the legal documents, the ™ symbol appears only in that notice
//      and in the primary-nav label for the indicator ("DoubleTrends™", by
//      decision) — running text, titles and metadata say plain "DoubleTrends".
//      (Marking every mention reads as defensive; the notice preserves the claim.)
//   3. Legal documents (legal/*) may mark the name wherever their drafting does.
const fs   = require('fs');
const path = require('path');
const { DIST, walk, relPosix, report } = require('./test-utils');

const NOTICE_RE = /DoubleTrends(?:™|&trade;) is a trademark of DoubleTrends L\.L\.C\./g;
const MARK_RE   = /DoubleTrends(?:™|&trade;|%E2%84%A2)/g;
// The one sanctioned mark outside the notice: the primary-nav item.
const NAV_RE    = /data-nav="indicator"(?: aria-current="page")?>DoubleTrends(?:™|&trade;)<\/a>/g;

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
    const marks = (html.match(MARK_RE) || []).length;
    if (marks !== notices + navMarks) {
      const extra = [];
      for (const m of html.matchAll(MARK_RE)) {
        const ctx = html.slice(m.index, m.index + 60);
        const navCtx = html.slice(Math.max(0, m.index - 45), m.index);
        if (!/^DoubleTrends(?:™|&trade;) is a trademark/.test(ctx) && !/data-nav="indicator"(?: aria-current="page")?>$/.test(navCtx)) {
          extra.push(html.slice(0, m.index).split('\n').length);
        }
      }
      errors.push(`${rel}: ™ outside the notice on line(s) ${extra.join(', ')}`);
    }
  }

  if (!files.length) errors.push('no built pages found');
  report(errors, `Trademark test (${files.length} pages)`);
}

main();
