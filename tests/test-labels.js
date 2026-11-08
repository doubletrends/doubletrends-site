// Label consistency across the site — one name for each page, everywhere.
//
// A page's one name is its registry `crumb` (src/site.config.js), falling back
// to `title`. Section folders take their name from their index page.
//
//   A. Navigation names: every link in the site chrome (utility bar, primary
//      nav, footer) to a registered page reads that page's name exactly
//      (including the ™ of "DoubleTrends™"). The breadcrumb label of each section folder (src/schema.js
//      SECTIONS) is its index page's name.
//   B. Breadcrumbs: every page except the homepage and the 404 page has
//      a visible breadcrumb ending in the page's name.
//   C. One rust label per hero: the breadcrumb is set in the kicker's type,
//      so no kicker/overline may sit between it and the H1. Research notes
//      carry "Series · Section" in their dateline instead.
//   D. About index: each sub-page is listed under its H1.
//   E. Primary navigation: a page with `nav` marks exactly that item
//      aria-current; a page without `nav` marks none.
//
// Every rule counts what it checked and fails if it checked nothing, so a
// markup change can never turn this test into a silent pass.
const fs   = require('fs');
const path = require('path');
const { pages, SECTIONS } = require('../src/site.config');
const { DIST, decode, report } = require('./utils');

const MAIN_RE       = /<main\b[^>]*>([\s\S]*?)<\/main>/;
const H1_RE         = /<h1\b[^>]*>\s*([^<]+?)\s*<\/h1>/;
const CRUMB_RE      = /<nav class="breadcrumb"[^>]*>([\s\S]*?)<\/nav>/;
const HERO_LABEL_RE = /<span\b[^>]*class="[^"]*\b(?:kicker|tag-overline)\b[^"]*"[^>]*>([^<]+)<\/span>/g;
const CURRENT_RE    = /<a\b[^>]*data-nav="([^"]+)"[^>]*aria-current="page"[^>]*>/g;
const LINK_RE       = /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const NO_CRUMB      = new Set(['index.html', '404.html']);

const read    = (src) => fs.readFileSync(path.join(DIST, src), 'utf8');
const mainOf  = (html) => (html.match(MAIN_RE) || [])[1] || '';
const text    = (s) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const nameOf  = (page) => page.crumb || page.title;
const bySrc   = new Map(pages.map((p) => [p.src, p]));

// Built links are extensionless (data, research/, ./); map one back to its source page.
function pageForHref(href, fromSrc) {
  if (/^(?:[a-z]+:|#|\/\/)/i.test(href)) return null;
  const clean = href.split('#')[0];
  if (!clean || clean.startsWith('public/') || clean.includes('/public/')) return null;
  let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromSrc), clean));
  if (clean.endsWith('/') || target === '.') target = `${target === '.' ? '' : `${target}/`}index.html`;
  else if (!target.endsWith('.html')) target += '.html';
  return bySrc.get(target.replace(/^\.\//, '')) || null;
}

function main() {
  if (!fs.existsSync(DIST)) throw new Error('dist/ not found — run npm run build first');
  const errors = [];
  const counts = { A: 0, B: 0, C: 0, D: 0, E: 0 };

  // A: the chrome is identical on every page; read it from the homepage.
  const home = read('index.html');
  const chrome = home.replace(MAIN_RE, '');
  for (const [, href, inner] of chrome.matchAll(LINK_RE)) {
    const target = pageForHref(href, 'index.html');
    if (!target || target.src === 'index.html' && href !== './') continue;
    counts.A++;
    const label = text(inner);
    if (label !== nameOf(target)) errors.push(`site chrome: link to ${target.src} reads "${label}", page name is "${nameOf(target)}"`);
  }
  for (const [dir, label] of Object.entries(SECTIONS)) {
    counts.A++;
    const index = bySrc.get(`${dir}/index.html`);
    if (!index) errors.push(`SECTIONS.${dir}: no ${dir}/index.html in the registry`);
    else if (label !== nameOf(index)) errors.push(`SECTIONS.${dir} is "${label}", ${dir}/index.html is named "${nameOf(index)}"`);
  }

  for (const page of pages) {
    const html = read(page.src);
    const main = mainOf(html);

    // B: breadcrumb present and ends with the page's name.
    const crumb = main.match(CRUMB_RE);
    const items = crumb ? [...crumb[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => text(m[1])) : [];
    if (!NO_CRUMB.has(page.src)) {
      counts.B++;
      if (!crumb) errors.push(`${page.src}: no breadcrumb`);
      else if (items[items.length - 1] !== nameOf(page)) errors.push(`${page.src}: breadcrumb ends "${items[items.length - 1]}", page name is "${nameOf(page)}"`);
    }

    // C: what sits between the breadcrumb and the H1.
    if (crumb) {
      const h1At = main.search(/<h1\b/);
      const between = main.slice(main.indexOf(crumb[0]) + crumb[0].length, h1At < 0 ? undefined : h1At);
      counts.C++;
      const labels = [...between.matchAll(HERO_LABEL_RE)].map((m) => decode(m[1]).trim());
      if (labels.length) errors.push(`${page.src}: hero label(s) "${labels.join('", "')}" compete with the breadcrumb`);
      if (page.kind === 'article') {
        counts.C++;
        const meta = (main.match(/<p class="article-meta"><span>([\s\S]*?)<\/span>/) || [])[1];
        const expected = `${page.series} · ${page.section}`;
        if (!meta || text(meta) !== expected) errors.push(`${page.src}: dateline "${meta ? text(meta) : '(missing)'}" ≠ "${expected}"`);
      }
    }

    // E: primary navigation state.
    counts.E++;
    const current = [...html.matchAll(CURRENT_RE)].map((m) => m[1]);
    const expected = page.nav ? [page.nav] : [];
    if (current.join(',') !== expected.join(',')) {
      errors.push(`${page.src}: aria-current nav items [${current}] ≠ expected [${expected}]`);
    }
  }

  // D: the About index names each sub-page as its H1 does.
  const aboutIndex = read('company/index.html');
  for (const m of aboutIndex.matchAll(/<span class="entry-date">([^<]+)<\/span>\s*<div><h3 class="entry-title"><a href="([^"]+)"/g)) {
    const label = decode(m[1]).trim();
    const target = pageForHref(m[2], 'company/index.html');
    if (!target) { errors.push(`company/index.html: entry "${label}" links to an unregistered page (${m[2]})`); continue; }
    counts.D++;
    const h1 = (mainOf(read(target.src)).match(H1_RE) || [])[1];
    if (label !== decode(h1 || '')) errors.push(`company/index.html: entry label "${label}" ≠ ${target.src} H1 "${h1}"`);
  }

  for (const [rule, n] of Object.entries(counts)) {
    if (n === 0) errors.push(`rule ${rule} checked nothing — the markup this test reads has changed`);
  }
  report(errors, `Label test (${Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' ')})`);
}

main();
