// Label consistency across the site — one name for each thing, everywhere.
//
//   A. Section index pages carry the section name as their kicker
//      ("Research", "About", "Legal"); every sub-page carries
//      "Section · Category" with a non-empty category.
//   B. Research notes: the kicker category equals the registry `section`
//      (which also feeds the dateline and the research library).
//   C. About and Legal sub-pages: the kicker category equals the page H1, and
//      the About index lists each sub-page under that same name.
//   D. Primary navigation: a page with `nav` marks exactly that item
//      aria-current; a page without `nav` marks none.
//
// Every rule counts what it checked and fails if it checked nothing, so a
// markup change can never turn this test into a silent pass.
const fs   = require('fs');
const path = require('path');
const { pages } = require('../src/site.config');
const { DIST, SECTIONS, decode, report } = require('./test-utils');

const MAIN_RE    = /<main\b[^>]*>([\s\S]*?)<\/main>/;
const KICKER_RE  = /<span\b[^>]*class="[^"]*\b(?:kicker|tag-overline)\b[^"]*"[^>]*>([^<]+)<\/span>/;
const H1_RE      = /<h1\b[^>]*>\s*([^<]+?)\s*<\/h1>/;
const CURRENT_RE = /<a\b[^>]*data-nav="([^"]+)"[^>]*aria-current="page"[^>]*>/g;
const SEP        = ' · ';

const read = (src) => fs.readFileSync(path.join(DIST, src), 'utf8');
const mainOf = (html) => (html.match(MAIN_RE) || [])[1] || '';
const kickerOf = (html) => { const m = mainOf(html).match(KICKER_RE); return m ? decode(m[1]).trim() : null; };
const h1Of = (html) => { const m = mainOf(html).match(H1_RE); return m ? decode(m[1]).trim() : null; };

function main() {
  if (!fs.existsSync(DIST)) throw new Error('dist/ not found — run npm run build first');
  const errors = [];
  const counts = { A: 0, B: 0, C: 0, D: 0 };

  // A–C: sections.
  for (const [dir, sectionName] of Object.entries(SECTIONS)) {
    for (const page of pages.filter((p) => p.src.startsWith(`${dir}/`))) {
      const html = read(page.src);
      const kicker = kickerOf(html);
      counts.A++;
      if (page.src === `${dir}/index.html`) {
        if (kicker !== sectionName) errors.push(`${page.src}: kicker must be "${sectionName}", got "${kicker ?? '(missing)'}"`);
        continue;
      }
      const prefix = `${sectionName}${SEP}`;
      if (!kicker || !kicker.startsWith(prefix) || kicker === prefix.trim()) {
        errors.push(`${page.src}: kicker must be "${prefix}[Category]", got "${kicker ?? '(missing)'}"`);
        continue;
      }
      const category = kicker.slice(prefix.length);
      if (page.kind === 'article') {
        counts.B++;
        if (category !== page.section) errors.push(`${page.src}: kicker category "${category}" ≠ registry section "${page.section}"`);
      } else {
        counts.C++;
        const h1 = h1Of(html);
        if (category.toLowerCase() !== (h1 || '').toLowerCase()) errors.push(`${page.src}: kicker category "${category}" ≠ H1 "${h1}"`);
      }
    }
  }

  // C: the About index names each sub-page as its H1 does.
  const aboutIndex = read('company/index.html');
  for (const m of aboutIndex.matchAll(/<span class="entry-date">([^<]+)<\/span>\s*<div><h3 class="entry-title"><a href="([^"]+)"/g)) {
    const label = decode(m[1]).trim();
    const target = `company/${m[2].replace(/^\.\//, '')}`.replace(/\/$/, '');
    const file = fs.existsSync(path.join(DIST, `${target}.html`)) ? `${target}.html` : target;
    if (!fs.existsSync(path.join(DIST, file))) { errors.push(`company/index.html: entry "${label}" links to missing ${file}`); continue; }
    counts.C++;
    const h1 = h1Of(read(file));
    if (label !== h1) errors.push(`company/index.html: entry label "${label}" ≠ ${file} H1 "${h1}"`);
  }

  // D: primary navigation state.
  for (const page of pages) {
    const current = [...read(page.src).matchAll(CURRENT_RE)].map((m) => m[1]);
    counts.D++;
    const expected = page.nav ? [page.nav] : [];
    if (current.join(',') !== expected.join(',')) {
      errors.push(`${page.src}: aria-current nav items [${current}] ≠ expected [${expected}]`);
    }
  }

  for (const [rule, n] of Object.entries(counts)) {
    if (n === 0) errors.push(`rule ${rule} checked nothing — the markup this test reads has changed`);
  }
  report(errors, `Label test (${Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' ')})`);
}

main();
