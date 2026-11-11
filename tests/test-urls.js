// Published URLs (README: "every page has exactly one public address"). Every URL the site publishes
// is the form Cloudflare serves with 200; getting this wrong brings back Search
// Console "Page with redirect" and duplicate-page errors.
//
//   A. Canonical: each page's canonical tag names that page itself, at its
//      served URL.
//   B. Sitemap: lists exactly the indexable pages, each at its served URL.
//   C. _redirects: every target is a served URL (no redirect into a 404 or a
//      second redirect), and no source is a served URL (a rule must never
//      shadow a live page).
//
// Each rule counts what it checked and fails if it checked nothing.
const fs   = require('fs');
const path = require('path');
const { SITE_URL } = require('../src/site.config');
const { DIST, walk, relPosix, isNoindex, report } = require('./utils');

// The built file Cloudflare answers with 200 for a URL path, or null when it
// redirects or 404s: "/dir/" → dir/index.html, "/page" → page.html; any
// ".html" spelling and any folder without its slash is a redirect.
function servedFile(urlPath) {
  if (urlPath.endsWith('.html')) return null;
  const file = urlPath.endsWith('/')
    ? path.join(DIST, urlPath, 'index.html')
    : path.join(DIST, `${urlPath}.html`);
  return fs.existsSync(file) ? file : null;
}

const urlPathOf = (url) => (url.startsWith(SITE_URL) ? url.slice(SITE_URL.length) || '/' : null);
const robotsOf  = (html) => (html.match(/<meta\s+name="robots"\s+content="([^"]*)"/) || [])[1];

function main() {
  if (!fs.existsSync(DIST)) throw new Error('dist/ not found — run npm run build first');
  const errors = [];
  const counts = { A: 0, B: 0, C: 0 };
  const pages = walk(DIST).filter((f) => f.endsWith('.html'));

  // A: canonical self-reference.
  const indexable = new Set();
  for (const file of pages) {
    const rel = relPosix(file, DIST);
    const html = fs.readFileSync(file, 'utf8');
    if (!isNoindex(robotsOf(html))) indexable.add(file);
    const canonical = (html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/) || [])[1];
    if (!canonical) continue; // presence is test-metadata's rule
    counts.A++;
    const urlPath = urlPathOf(canonical);
    const served = urlPath && servedFile(urlPath);
    if (served !== file) errors.push(`${rel}: canonical ${canonical} ${served ? `serves ${relPosix(served, DIST)}` : 'is not a served URL'}`);
  }

  // B: sitemap = indexable pages.
  const sitemap = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
  const listed = new Set();
  for (const [, loc] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    counts.B++;
    const urlPath = urlPathOf(loc);
    const served = urlPath && servedFile(urlPath);
    if (!served) errors.push(`sitemap.xml: ${loc} is not a served URL`);
    else if (!indexable.has(served)) errors.push(`sitemap.xml: ${loc} is a noindex page`);
    else listed.add(served);
  }
  for (const file of indexable) {
    if (!listed.has(file)) errors.push(`sitemap.xml: indexable page ${relPosix(file, DIST)} is not listed`);
  }

  // C: _redirects land on live pages in one hop and shadow none.
  const rules = fs.readFileSync(path.join(DIST, '_redirects'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/));
  for (const [from, to] of rules) {
    counts.C++;
    if (from.endsWith('*')) {
      const dir = path.join(DIST, to.replace(/:splat$/, ''));
      if (!fs.existsSync(dir)) errors.push(`_redirects: ${from} → ${to}: target folder missing`);
      continue;
    }
    if (!servedFile(to)) errors.push(`_redirects: ${from} → ${to}: target is not a served URL`);
    if (servedFile(from)) errors.push(`_redirects: ${from} is a live page; the rule would hide it`);
  }

  for (const [rule, n] of Object.entries(counts)) {
    if (n === 0) errors.push(`rule ${rule} checked nothing — the output this test reads has changed`);
  }
  report(errors, `URL test (${Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' ')})`);
}

main();
