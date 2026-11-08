// LISTING.md holds the text and images for the firm's profiles elsewhere
// (GitHub, LinkedIn, Crunchbase, Wellfound, Product Hunt), to paste. This test
// keeps it true to the forms and to the site:
//   A. every text block under a field with a stated limit fits that limit
//      ("**Field** (N characters or fewer)", counted in characters as typed);
//   B. the shared facts agree with the site: legal name, website, email,
//      office address, LinkedIn and GitHub links;
//   C. every image it names is one the build publishes, at the size it gives.
const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');
const { SITE_URL, PUBLISHER } = require('../src/site.config');
const { ROOT, DIST, report } = require('./utils');

async function main() {
  const md = fs.readFileSync(path.join(ROOT, 'LISTING.md'), 'utf8').replace(/\r\n/g, '\n');
  const errors = [];

  // A. Limits: a field line, then its ```text block.
  let fields = 0;
  for (const m of md.matchAll(/\*\*([^*]+)\*\* \(([\d,]+) characters or fewer[^)]*\)\n\n```text\n([\s\S]*?)\n```/g)) {
    fields++;
    const [, name, limit, text] = m;
    const max = Number(limit.replace(/,/g, ''));
    const len = [...text].length;
    if (len > max) errors.push(`LISTING.md: "${name}" is ${len} characters; the limit is ${max}`);
  }
  if (!fields) errors.push('LISTING.md: no limited fields found');

  // B. Facts the site states.
  const contact = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'company', 'contact.html'), 'utf8');
  const footer = fs.readFileSync(path.join(ROOT, 'src', 'partials', 'footer.html'), 'utf8');
  const facts = [
    [PUBLISHER.legalName, 'site.config.js PUBLISHER.legalName'],
    [SITE_URL, 'site.config.js SITE_URL'],
    [PUBLISHER.email, 'site.config.js PUBLISHER.email'],
  ];
  for (const addr of ['14th Floor, 955 Bay Street']) {
    if (!contact.includes(addr)) errors.push(`contact.html no longer gives the office as "${addr}"; update LISTING.md`);
    facts.push([addr, 'contact.html']);
  }
  for (const email of contact.match(/[a-z]+@doubletrends\.com/g) || []) facts.push([email, 'contact.html']);
  // The organisation's own pages, not links to individual repositories.
  for (const [, url] of footer.matchAll(/href="(https:\/\/(?:www\.linkedin\.com\/company\/[^/"]+\/?|github\.com\/[^/"]+))"/g)) facts.push([url, 'footer.html']);
  for (const [fact, source] of facts) {
    if (!md.includes(fact)) errors.push(`LISTING.md does not state "${fact}" (${source})`);
  }

  // C. Images, from the table rows: | `name.png` | W × H | use |
  let images = 0;
  for (const [, file, w, h] of md.matchAll(/\|\s*`([a-z0-9-]+\.png)`\s*\|\s*(\d+) × (\d+)\s*\|/g)) {
    images++;
    const built = path.join(DIST, 'public', 'brand', file);
    if (!fs.existsSync(built)) { errors.push(`LISTING.md names ${file}, which the build does not produce`); continue; }
    const meta = await sharp(built).metadata();
    if (meta.width !== Number(w) || meta.height !== Number(h)) {
      errors.push(`LISTING.md gives ${file} as ${w} × ${h}; the build makes it ${meta.width} × ${meta.height}`);
    }
  }
  if (!images) errors.push('LISTING.md: no images found');

  report(errors, `Listing test (${fields} fields, ${facts.length} facts, ${images} images)`);
}

main();
