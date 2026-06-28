const fs   = require('fs');
const path = require('path');
const { DIST, SECTIONS, decode, report } = require('./test-utils');

// The hero overline is always the first tag-overline inside <main>.
const MAIN_RE           = /<main>([\s\S]*?)<\/main>/;
const FIRST_OVERLINE_RE = /<span\b[^>]+\btag-overline\b[^>]*>([^<]+)<\/span>/;
const FEATURED_BLOCK_RE = /<a\b[^>]+\bdirectory-featured\b[^>]*>([\s\S]*?)<\/a>/;
const CARD_BLOCK_RE     = /<(?:a|article)\b[^>]+\bdirectory-card\b[^>]*>([\s\S]*?)<\/(?:a|article)>/g;
const OVERLINE_IN_BLOCK = /<span\b[^>]+\btag-overline\b[^>]*>([^<]+)<\/span>/;

function heroOverline(html) {
  const main = html.match(MAIN_RE);
  if (!main) return null;
  const m = main[1].match(FIRST_OVERLINE_RE);
  return m ? decode(m[1]) : null;
}

function extractOverline(block) {
  const m = block.match(OVERLINE_IN_BLOCK);
  return m ? decode(m[1]) : null;
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

// Rules enforced:
//   1. Index page hero      →  section name only  ("Academy", "Company", "Legal")
//   2. Featured card        →  "Featured · [Category]"
//   3. Regular cards        →  "[Category]" only — no section prefix, no "Featured · "
//   4. Sub-page hero        →  "Section · [Category]"  (non-empty category required)
function main() {
  if (!fs.existsSync(DIST)) throw new Error(`dist/ not found — run npm run build first`);

  const errors = [];
  let filesChecked = 0;

  for (const [dir, sectionName] of Object.entries(SECTIONS)) {
    const prefix    = `${sectionName} · `;
    const indexHtml = fs.readFileSync(path.join(DIST, dir, 'index.html'), 'utf8');
    filesChecked++;

    const hero = heroOverline(indexHtml);
    if (hero !== sectionName) {
      errors.push(`${dir}/index.html: hero overline must be "${sectionName}", got "${hero ?? '(missing)'}"`);
    }

    const featured = featuredOverline(indexHtml);
    if (!featured) {
      errors.push(`${dir}/index.html: no featured card overline found`);
    } else if (!featured.startsWith('Featured · ') || featured.trim() === 'Featured · ') {
      errors.push(`${dir}/index.html: featured overline must be "Featured · [Category]", got "${featured}"`);
    }

    for (const overline of cardOverlines(indexHtml)) {
      if (overline.startsWith(prefix)) {
        errors.push(`${dir}/index.html: card overline must not have section prefix, got "${overline}"`);
      }
      if (overline.startsWith('Featured · ')) {
        errors.push(`${dir}/index.html: non-featured card has "Featured · " prefix, got "${overline}"`);
      }
    }

    const subFiles = fs.readdirSync(path.join(DIST, dir))
      .filter((f) => f.endsWith('.html') && f !== 'index.html');

    for (const file of subFiles) {
      const relPath = `${dir}/${file}`;
      const html    = fs.readFileSync(path.join(DIST, relPath), 'utf8');
      filesChecked++;

      const subHero = heroOverline(html);
      if (!subHero) {
        errors.push(`${relPath}: missing hero overline`);
      } else if (!subHero.startsWith(prefix) || subHero.trim() === prefix.trim()) {
        errors.push(`${relPath}: hero overline must be "${prefix}[Category]", got "${subHero}"`);
      }
    }
  }

  report(errors, 'Overline test', `Overline test passed — ${filesChecked} files checked across ${Object.keys(SECTIONS).length} sections.`);
}

main();
