/**
 * build-urls.js
 * Writes the two URL lists generated from the page registry: dist/sitemap.xml
 * and dist/_redirects. Both publish only canonical URLs (src/urls.js); tests/test-urls.js holds them to that. Called from build.js.
 */
const fs = require('fs');
const path = require('path');
const { pages } = require('../src/site.config');
const { canonicalPath, canonicalFor } = require('../src/urls');

function writeSitemap(dist) {
  const urls = pages
    .filter((p) => p.sitemap !== false)
    .map((p) => `  <url>
    <loc>${canonicalFor(p.src)}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority.toFixed(1)}</priority>
  </url>`)
    .join('\n\n');
  fs.writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

${urls}

</urlset>
`, 'utf8');
}

// Two sections, so each can be audited on its own:
//   1. Canonical form: every page's .html spelling, and every section folder
//      without its trailing slash, 301 to the canonical URL. Cloudflare's own
//      .html stripping issues 307s; explicit 301s let search engines settle on
//      the canonical. Generated from the page registry.
//   2. Moved URLs: addresses that were live on the deployed site (main) and
//      moved in the November 2026 restructure, grouped by move. Each old
//      address (with and without .html) 301s to its new home. Paths that only
//      ever existed on a branch get no redirect.
// A source may appear only once across both sections.
const MOVED = [
  { heading: 'academy/ → research/', rules: [
    ['/academy', '/research/'],
    ['/academy/', '/research/'],
    ['/academy/index.html', '/research/'],
    ...pages.filter((p) => p.kind === 'article').flatMap((p) => {
      const slug = p.src.slice('research/'.length, -'.html'.length);
      return [[`/academy/${slug}`, `/research/${slug}`], [`/academy/${slug}.html`, `/research/${slug}`]];
    }),
  ] },
  { heading: 'Indicator pages → indicator/', rules: [
    ['/method', '/indicator/methodology'],
    ['/method.html', '/indicator/methodology'],
    ['/product', '/indicator/subscription'],
    ['/product.html', '/indicator/subscription'],
    ['/success', '/indicator/success'],
    ['/success.html', '/indicator/success'],
  ] },
  { heading: 'public/academy/ → public/img/research/', rules: [
    ['/public/academy/*', '/public/img/research/:splat'],
  ] },
];

function writeRedirects(dist) {
  const canonicalForm = [
    ...pages.filter((p) => p.src !== '404.html')
      .map((p) => [`/${p.src}`, canonicalPath(p.src)]),
    ...pages.filter((p) => /\/index\.html$/.test(p.src))
      .map((p) => { const dir = p.src.slice(0, -'/index.html'.length); return [`/${dir}`, `/${dir}/`]; }),
  ].sort(([a], [b]) => a.localeCompare(b));

  const seen = new Map();
  const all = [['canonical form', canonicalForm], ...MOVED.map((g) => [g.heading, g.rules])];
  for (const [group, rules] of all) for (const [from] of rules) {
    if (seen.has(from)) throw new Error(`_redirects: ${from} appears in "${seen.get(from)}" and "${group}"`);
    seen.set(from, group);
  }

  const line = ([from, to]) => `${from} ${to} 301`;
  const redirectsFile = [
    '# ── 1. Canonical form ─────────────────────────────────────────────',
    '# .html spellings and folders without a trailing slash → canonical URL.',
    '# Generated from the page registry (src/site.config.js).',
    ...canonicalForm.map(line),
    '',
    '# ── 2. Moved URLs ─────────────────────────────────────────────────',
    '# Addresses live before the November 2026 restructure → their new home.',
    ...MOVED.flatMap((g) => ['', `# ${g.heading}`, ...g.rules.map(line)]),
  ];
  fs.writeFileSync(path.join(dist, '_redirects'), redirectsFile.join('\n') + '\n', 'utf8');
}

module.exports = { writeSitemap, writeRedirects };
