const fs = require('fs');
const { DIST, walk, relPosix, report } = require('./test-utils');

// Reveal-animation contract. Motion delivers a "block" — the smallest thing
// that is a complete idea — and never the pieces inside it. Stagger happens
// between sibling blocks, never within one. These are the mechanically
// checkable invariants of that contract:
//
//   A. No nested reveals — a [data-reveal] element never contains another.
//      (Block atomicity: animate the block, not its pieces; no double-animation.
//      Also guards the block-level section split: the section must opt out, not
//      double-tag alongside its inner blocks.)
//   B. No reveal in chrome — [data-reveal] only ever appears inside <main>.
//      Nav, header, and footer never animate.
//   C. Data panels reveal whole — no [data-reveal] on <tr>/<td>/<th>, and none
//      strictly inside a .terminal-shell. Never a per-row / per-item cascade
//      (the Signal-History row cascade was tried and reverted as off-brand).
//
//   (The hero is not an exception: it reveals through the same data-reveal
//   system as every content block, made flash-free by the <head> no-FOUC guard.)

const MAIN_RE = /<main>([\s\S]*?)<\/main>/;

// Index just past the matching close tag of the element opened at `openStart`.
function elementEnd(html, tag, openStart) {
  const gt = html.indexOf('>', openStart);
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'gi');
  re.lastIndex = gt + 1;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') { if (--depth === 0) return m.index + m[0].length; }
    else depth++;
  }
  return html.length;
}

// [{ tag, start, end }] for every [data-reveal] element in `html`.
function revealSpans(html) {
  const spans = [];
  const re = /<([a-z0-9]+)\b[^>]*\bdata-reveal\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    spans.push({ tag: m[1], start: m.index, end: elementEnd(html, m[1], m.index) });
  }
  return spans;
}

function main() {
  if (!fs.existsSync(DIST)) throw new Error('dist/ not found — run npm run build first');

  const errors = [];
  let filesChecked = 0;

  for (const file of walk(DIST)) {
    if (!file.endsWith('.html')) continue;
    const rel  = relPosix(file, DIST);
    const html = fs.readFileSync(file, 'utf8');
    filesChecked++;

    // B — no reveal outside <main>.
    if (/\bdata-reveal\b/.test(html.replace(MAIN_RE, ''))) {
      errors.push(`${rel}: [data-reveal] outside <main> — nav/header/footer must not animate`);
    }

    const mainM = html.match(MAIN_RE);
    if (!mainM) continue;
    const mainHtml = mainM[1];
    const spans = revealSpans(mainHtml);

    // A — no nested reveals.
    for (let i = 0; i < spans.length; i++) {
      const parent = spans.find((s, j) => j !== i && spans[i].start > s.start && spans[i].start < s.end);
      if (parent) {
        errors.push(`${rel}: nested [data-reveal] (<${spans[i].tag}> inside <${parent.tag}>) — reveal the block, not its pieces`);
      }
    }

    // C — data panels reveal whole.
    if (/<(tr|td|th)\b[^>]*\bdata-reveal\b/i.test(mainHtml)) {
      errors.push(`${rel}: [data-reveal] on a table row/cell — a data panel reveals whole, never per-row`);
    }
    const tsRe = /<([a-z0-9]+)\b[^>]*\bterminal-shell\b[^>]*>/gi;
    let t;
    while ((t = tsRe.exec(mainHtml))) {
      const gt  = mainHtml.indexOf('>', t.index);
      const end = elementEnd(mainHtml, t[1], t.index);
      if (/\bdata-reveal\b/.test(mainHtml.slice(gt + 1, end))) {
        errors.push(`${rel}: [data-reveal] inside a .terminal-shell — the panel reveals as a whole`);
      }
    }
  }

  if (!filesChecked) errors.push('no built HTML pages found in dist/');
  report(errors, 'Reveal contract test');
}

main();
