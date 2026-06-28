/**
 * test-nav-consistency.js
 * Validates that for every sub-page in academy/, company/, and legal/,
 * the header nav text, footer link text, and index card overline all
 * match the sub-page's own hero overline category.
 *
 * Source of truth: sub-page hero overline ("Section · Category" → "Category").
 */

const fs   = require('fs');
const path = require('path');

const SRC  = path.join(__dirname, '..', 'src');
const DIST = path.join(__dirname, '..', 'dist');

const SECTIONS = { academy: 'Academy', company: 'Company', legal: 'Legal' };

// ── Helpers ────────────────────────────────────────────────────────────────

const OVERLINE_RE = /<span\b[^>]+\btag-overline\b[^>]*>([^<]+)<\/span>/;

function decode(str) {
  return str
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&trade;/g, '™')
    .replace(/&rarr;/g, '→')
    .replace(/&nbsp;/g, ' ');
}

function firstOverline(html) {
  const m = html.match(OVERLINE_RE);
  return m ? decode(m[1].trim()) : null;
}

// Strip {{ROOT}} to get canonical relative path (e.g. "academy/foo.html")
function canon(href) {
  return href.replace(/^\{\{ROOT\}\}/, '');
}

// Strip leading ../ from dist hrefs (section pages are one level deep)
function normDist(href) {
  return href.replace(/^\.\.\//, '');
}

// ── Truth table: sub-page hero overline category ───────────────────────────

function buildTruth() {
  const truth = {}; // canonical-path → expected name
  for (const [dir, section] of Object.entries(SECTIONS)) {
    const prefix = section + ' · ';
    const srcDir = path.join(SRC, 'pages', dir);
    for (const file of fs.readdirSync(srcDir).filter(f => f.endsWith('.html') && f !== 'index.html')) {
      const html = fs.readFileSync(path.join(srcDir, file), 'utf8');
      const overline = firstOverline(html);
      if (overline && overline.startsWith(prefix)) {
        truth[`${dir}/${file}`] = overline.slice(prefix.length).trim();
      }
    }
  }
  return truth;
}

// ── Nav: nav-dropdown-item links in header source ─────────────────────────

function navLinks() {
  const html = fs.readFileSync(path.join(SRC, '_partials', 'header.html'), 'utf8');
  const map = {};
  for (const m of html.matchAll(/<a\b[^>]*class="[^"]*\bnav-dropdown-item\b[^"]*"[^>]*>([^<]+)<\/a>/g)) {
    const hrefM = m[0].match(/href="([^"]+)"/);
    if (hrefM && hrefM[1].startsWith('{{ROOT}}')) {
      map[canon(hrefM[1])] = decode(m[1].trim());
    }
  }
  return map;
}

// ── Footer: foot-link links in footer source (exclude section index pages) ─

function footerLinks() {
  const html = fs.readFileSync(path.join(SRC, '_partials', 'footer.html'), 'utf8');
  const map = {};
  for (const m of html.matchAll(/<a\b[^>]*class="[^"]*\bfoot-link\b[^"]*"[^>]*>([^<]+)<\/a>/g)) {
    const hrefM = m[0].match(/href="([^"]+)"/);
    if (hrefM && hrefM[1].startsWith('{{ROOT}}')) {
      const p = canon(hrefM[1]);
      if (!p.endsWith('index.html')) map[p] = decode(m[1].trim());
    }
  }
  return map;
}

// ── Index cards: overlines from built section index pages ─────────────────

function buildCardMaps() {
  const maps = {}; // sectionDir → { canonical-path → overline category }
  for (const dir of Object.keys(SECTIONS)) {
    const html = fs.readFileSync(path.join(DIST, dir, 'index.html'), 'utf8');
    const map = {};

    // Featured card (<a> wrapper with directory-featured)
    const featM = html.match(/<a\b[^>]+href="([^"]+)"[^>]*\bdirectory-featured\b[^>]*>([\s\S]*?)<\/a>/);
    if (featM) {
      const ov = firstOverline(featM[2]);
      if (ov && ov.startsWith('Featured · ')) {
        map[normDist(featM[1])] = ov.slice('Featured · '.length);
      }
    }

    // <a> wrapper directory-cards
    for (const m of html.matchAll(/<a\b[^>]+href="([^"]+)"[^>]*\bdirectory-card\b[^>]*>([\s\S]*?)<\/a>/g)) {
      const ov = firstOverline(m[2]);
      if (ov) map[normDist(m[1])] = ov;
    }

    // <article> directory-cards (href is inside the card body)
    for (const m of html.matchAll(/<article\b[^>]*\bdirectory-card\b[^>]*>([\s\S]*?)<\/article>/g)) {
      const inner = m[1].match(/href="([^"]+)"/);
      const ov = firstOverline(m[1]);
      if (inner && ov) map[normDist(inner[1])] = ov;
    }

    maps[dir] = map;
  }
  return maps;
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(DIST)) {
    throw new Error('dist/ not found — run npm run build first');
  }

  const truth    = buildTruth();
  const nav      = navLinks();
  const footer   = footerLinks();
  const cardMaps = buildCardMaps();

  const errors = [];
  let checked  = 0;

  for (const [canonPath, expected] of Object.entries(truth)) {
    const dir   = canonPath.split('/')[0];
    const cards = cardMaps[dir] ?? {};
    checked++;

    if (nav[canonPath] !== expected) {
      errors.push(`NAV   ${canonPath}: expected "${expected}", got "${nav[canonPath] ?? '(missing)'}"`);
    }
    if (footer[canonPath] !== expected) {
      errors.push(`FOOT  ${canonPath}: expected "${expected}", got "${footer[canonPath] ?? '(missing)'}"`);
    }
    if (cards[canonPath] !== expected) {
      errors.push(`CARD  ${canonPath}: expected "${expected}", got "${cards[canonPath] ?? '(missing)'}"`);
    }
  }

  if (errors.length) {
    console.error(`Nav consistency test FAILED — ${errors.length} issue(s):\n`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`Nav consistency test passed — ${checked} pages checked across nav, footer, and index cards.`);
}

main();
