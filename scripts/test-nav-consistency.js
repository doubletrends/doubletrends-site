// Validates that for every sub-page in academy/, company/, and legal/,
// the header nav text, footer link text, and index card overline all
// match the sub-page's own hero overline category.
//
// Source of truth: sub-page hero overline ("Section · Category" → "Category").

const fs   = require('fs');
const path = require('path');
const { DIST, SECTIONS, decode, walkCards, report } = require('./test-utils');

const SRC = path.join(__dirname, '..', 'src');

const OVERLINE_RE = /<span\b[^>]+\btag-overline\b[^>]*>([^<]+)<\/span>/;

function firstOverline(html) {
  const m = html.match(OVERLINE_RE);
  return m ? decode(m[1]) : null;
}

// Strip {{ROOT}} to get canonical relative path (e.g. "academy/foo.html")
function canon(href) {
  return href.replace(/^\{\{ROOT\}\}/, '');
}

// ── Truth table: sub-page hero overline category ───────────────────────────

function buildTruth() {
  const truth = {};
  for (const [dir, section] of Object.entries(SECTIONS)) {
    const prefix = section + ' · ';
    const srcDir = path.join(SRC, 'pages', dir);
    for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith('.html') && f !== 'index.html')) {
      const html     = fs.readFileSync(path.join(srcDir, file), 'utf8');
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
  const map  = {};
  for (const m of html.matchAll(/<a\b[^>]*class="[^"]*\bnav-dropdown-item\b[^"]*"[^>]*>([^<]+)<\/a>/g)) {
    const hrefM = m[0].match(/href="([^"]+)"/);
    if (hrefM && hrefM[1].startsWith('{{ROOT}}')) {
      map[canon(hrefM[1])] = decode(m[1]);
    }
  }
  return map;
}

// ── Footer: foot-link links (exclude section index pages) ─────────────────

function footerLinks() {
  const html = fs.readFileSync(path.join(SRC, '_partials', 'footer.html'), 'utf8');
  const map  = {};
  for (const m of html.matchAll(/<a\b[^>]*class="[^"]*\bfoot-link\b[^"]*"[^>]*>([^<]+)<\/a>/g)) {
    const hrefM = m[0].match(/href="([^"]+)"/);
    if (hrefM && hrefM[1].startsWith('{{ROOT}}')) {
      const p = canon(hrefM[1]);
      if (!p.endsWith('index.html')) map[p] = decode(m[1]);
    }
  }
  return map;
}

// ── Index cards: overlines from built section index pages ─────────────────

function buildCardMaps() {
  const maps = {};
  for (const dir of Object.keys(SECTIONS)) {
    const html = fs.readFileSync(path.join(DIST, dir, 'index.html'), 'utf8');
    const map  = {};
    for (const { href, body, featured } of walkCards(html)) {
      const ov = firstOverline(body);
      if (!ov) continue;
      if (featured) {
        if (ov.startsWith('Featured · ')) map[href] = ov.slice('Featured · '.length);
      } else {
        map[href] = ov;
      }
    }
    maps[dir] = map;
  }
  return maps;
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(DIST)) throw new Error('dist/ not found — run npm run build first');

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

  report(errors, 'Nav consistency test', `Nav consistency test passed — ${checked} pages checked across nav, footer, and index cards.`);
}

main();
