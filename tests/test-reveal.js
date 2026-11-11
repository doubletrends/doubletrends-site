// Scroll-reveal contract (scripts/build-reveal.js, public/js/scroll-reveal.js,
// src/styles/components/motion.css), over every built page:
//
//   - the page's <h1> sits inside a reveal block (the hero text leads the
//     first-screen cascade), and at least one block follows it;
//   - blocks are atomic: no data-reveal inside another;
//   - pictures stay put: section.hero and figure.image-band are never tagged
//     (only the text inside the hero is);
//   - scroll-reveal.js loads exactly on the pages that have tagged blocks;
//   - the <head> guard that sets reveal-on is on every page;
//   - the chrome never moves: no data-reveal outside <main> (top bar,
//     header, footer).
const fs = require('fs');
const { DIST, walk, relPosix, report } = require('./utils');
const { elementEnd } = require('../scripts/build-reveal');

const OPEN_RE = /<([a-zA-Z0-9]+)\b[^>]*\bdata-reveal\b[^>]*>/g;

function main() {
  const errors = [];
  const pages = walk(DIST).filter((f) => f.endsWith('.html') && !relPosix(f, DIST).startsWith('public/'));
  let blocks = 0;

  for (const file of pages) {
    const rel = relPosix(file, DIST);
    const html = fs.readFileSync(file, 'utf8');
    const main = (html.match(/<main\b[^>]*>[\s\S]*?<\/main>/) || [''])[0];
    if (!main) { errors.push(`${rel}: no <main>`); continue; }

    const spans = [...main.matchAll(OPEN_RE)].map((m) => ({ start: m.index, end: elementEnd(main, m[1], m.index), tag: m[0] }));
    blocks += spans.length;

    const h1 = main.search(/<h1\b/);
    if (h1 === -1) errors.push(`${rel}: no <h1> in <main>`);
    else {
      if (!spans.some((s) => h1 > s.start && h1 < s.end)) errors.push(`${rel}: the <h1> is not inside a reveal block`);
      if (!spans.some((s) => s.start > h1)) errors.push(`${rel}: no reveal block after the <h1>`);
    }

    for (const s of spans) {
      if (spans.some((p) => p !== s && s.start > p.start && s.start < p.end)) errors.push(`${rel}: nested reveal ${s.tag}`);
      if (/class="(?:[^"]*\s)?(?:hero|image-band)(?:\s|")/.test(s.tag)) errors.push(`${rel}: picture block tagged ${s.tag}`);
    }

    const loads = /public\/js\/scroll-reveal\.js/.test(html);
    if (spans.length && !loads) errors.push(`${rel}: has reveal blocks but does not load scroll-reveal.js`);
    if (!spans.length && loads) errors.push(`${rel}: loads scroll-reveal.js with no reveal blocks`);
    if (!/classList\.add\('reveal-on'\)/.test(html)) errors.push(`${rel}: <head> guard missing`);

    const outside = html.replace(main, '').match(/<[a-zA-Z0-9]+\b[^>]*\bdata-reveal\b[^>]*>/g) || [];
    for (const tag of outside) errors.push(`${rel}: reveal outside <main> (header/footer must not move) ${tag}`);
  }

  if (!pages.length) errors.push('no built pages found');
  report(errors, `Reveal test (${pages.length} pages, ${blocks} blocks)`);
}

main();
