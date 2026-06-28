/**
 * test-overlines.js
 * Validates the site-wide tag-overline naming convention across the three
 * sectioned directories (academy/, company/, legal/).
 *
 * Rules enforced:
 *   1. Index page hero      →  section name only  ("Academy", "Company", "Legal")
 *   2. Featured card        →  "Featured · [Category]"
 *   3. Regular cards        →  "[Category]" only — no section prefix, no "Featured · "
 *   4. Sub-page hero        →  "Section · [Category]"  (non-empty category required)
 */

const fs   = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');

const SECTIONS = {
  academy: 'Academy',
  company: 'Company',
  legal:   'Legal',
};

// The hero overline is always the first tag-overline inside <main>.
// Article pages omit mb-3; page-shell pages include it — so we key on
// position within <main>, not on a specific class combination.
const MAIN_RE           = /<main>([\s\S]*?)<\/main>/;
const FIRST_OVERLINE_RE = /<span\b[^>]+\btag-overline\b[^>]*>([^<]+)<\/span>/;
const FEATURED_BLOCK_RE = /<a\b[^>]+\bdirectory-featured\b[^>]*>([\s\S]*?)<\/a>/;
const CARD_BLOCK_RE     = /<(?:a|article)\b[^>]+\bdirectory-card\b[^>]*>([\s\S]*?)<\/(?:a|article)>/g;
const OVERLINE_IN_BLOCK = /<span\b[^>]+\btag-overline\b[^>]*>([^<]+)<\/span>/;

function readFile(relPath) {
  return fs.readFileSync(path.join(DIST, relPath), 'utf8');
}

function decodeEntities(str) {
  return str.replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
}

function heroOverline(html) {
  const main = html.match(MAIN_RE);
  if (!main) return null;
  const m = main[1].match(FIRST_OVERLINE_RE);
  return m ? decodeEntities(m[1].trim()) : null;
}

function extractOverline(block) {
  const m = block.match(OVERLINE_IN_BLOCK);
  return m ? decodeEntities(m[1].trim()) : null;
}

function featuredOverline(html) {
  const block = html.match(FEATURED_BLOCK_RE);
  return block ? extractOverline(block[1]) : null;
}

function cardOverlines(html) {
  const results = [];
  for (const m of html.matchAll(CARD_BLOCK_RE)) {
    const o = extractOverline(m[1]);
    if (o) results.push(o);
  }
  return results;
}

function main() {
  if (!fs.existsSync(DIST)) {
    throw new Error(`dist/ not found — run npm run build first`);
  }

  const errors = [];
  let filesChecked = 0;

  for (const [dir, sectionName] of Object.entries(SECTIONS)) {
    const prefix = `${sectionName} · `;

    // ── index page ──────────────────────────────────────────────────────────
    const indexPath = `${dir}/index.html`;
    const indexHtml = readFile(indexPath);
    filesChecked++;

    // Rule 1: hero overline = section name exactly
    const hero = heroOverline(indexHtml);
    if (hero !== sectionName) {
      errors.push(`${indexPath}: hero overline must be "${sectionName}", got "${hero ?? '(missing)'}"`);
    }

    // Rule 2: featured card overline starts with "Featured · [Category]"
    const featured = featuredOverline(indexHtml);
    if (!featured) {
      errors.push(`${indexPath}: no featured card overline found`);
    } else if (!featured.startsWith('Featured · ') || featured.trim() === 'Featured · ') {
      errors.push(`${indexPath}: featured overline must be "Featured · [Category]", got "${featured}"`);
    }

    // Rule 3: regular card overlines carry no section prefix and no "Featured · "
    for (const overline of cardOverlines(indexHtml)) {
      if (overline.startsWith(prefix)) {
        errors.push(`${indexPath}: card overline must not have section prefix, got "${overline}"`);
      }
      if (overline.startsWith('Featured · ')) {
        errors.push(`${indexPath}: non-featured card has "Featured · " prefix, got "${overline}"`);
      }
    }

    // ── sub-pages ────────────────────────────────────────────────────────────
    const subDir = path.join(DIST, dir);
    const subFiles = fs.readdirSync(subDir)
      .filter(f => f.endsWith('.html') && f !== 'index.html');

    for (const file of subFiles) {
      const relPath = `${dir}/${file}`;
      const html = readFile(relPath);
      filesChecked++;

      // Rule 4: hero overline = "Section · [Category]"
      const subHero = heroOverline(html);
      if (!subHero) {
        errors.push(`${relPath}: missing hero overline (tag-overline mb-3)`);
      } else if (!subHero.startsWith(prefix) || subHero.trim() === prefix.trim()) {
        errors.push(`${relPath}: hero overline must be "${prefix}[Category]", got "${subHero}"`);
      }
    }
  }

  if (errors.length) {
    console.error(`Overline test failed with ${errors.length} issue(s):\n`);
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log(`Overline test passed — ${filesChecked} files checked across ${Object.keys(SECTIONS).length} sections.`);
}

main();
