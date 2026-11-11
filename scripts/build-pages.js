/**
 * build-pages.js
 * Renders one registry page: wraps its body from src/pages/ in the layout and
 * partials, resolves every placeholder, decorates research notes, places the
 * archival splash, marks the current nav item, stripes sections, and writes
 * it to dist/ with extensionless internal links. Called from build.js.
 *
 * Placeholders resolved in every page and partial:
 *   {{ROOT}} {{TITLE}} {{DESC}} {{CANONICAL}} …   page metadata (see renderPage)
 *   {{SITE_NAME}} {{LEGAL_NAME}} {{EMAIL}} …      site facts (SITE_VARS, placeholders.js)
 *   {{HEAD}} {{HEADER}} {{CONTENT}} {{FOOTER}} {{CHECKOUT_GATE}}   layout slots
 *   {{BREADCRUMB}}                                 visible breadcrumb (same items as JSON-LD)
 *   {{IND_*}} {{SIG_*}} {{MDD_*}}                  figures from src/data/indicator.json
 *   {{EXHIBIT_*}} {{TABLE_*}}                      SVG exhibits and data tables (src/exhibits/)
 *
 * Page fields (src/site.config.js): src, root, title, desc, kind, nav (which
 * primary-nav item is current), crumb, schema, priority, sitemap, robots,
 * headImage, readingLink.
 */
const fs = require('fs');
const path = require('path');
const { SITE_URL, SITE_NAME } = require('../src/site.config');
const { extensionless, canonicalFor, breadcrumbItems } = require('../src/urls');
const { buildJsonLdScripts } = require('../src/schema');
const { isoMidnight } = require('../src/dates');
const { COLORS } = require('../src/brand.config');
const { fmtDateLong, escAmp } = require('../src/format');
const { SITE_VARS, partial, replace, assertResolved } = require('./placeholders');
const { footerNotes, researchRecent, researchLibrary, furtherReading } = require('./build-listings');
const { applyReveal } = require('./build-reveal');
const ARCHIVE = require('../src/data/archive-images.json').images;

const ROOT = path.join(__dirname, '..'); // scripts/ lives one level below the repo root

const layout       = partial('layout.html');
const head         = partial('head.html');
const header       = partial('header.html');
const footer       = partial('footer.html');
const checkoutGate = partial('checkout-gate.html');
const readingCard  = partial('reading-card.html');
const readingLink  = partial('reading-link.html', { inline: true });
const articleMeta  = partial('article-meta.html', { inline: true });
const splash       = partial('splash.html', { inline: true });
const splashFitJs  = partial('splash-fit.js', { inline: true });

// Rewrite internal .html hrefs to their served form (extensionless in
// src/urls.js: method.html → method, research/index.html → research/), so
// in-site navigation skips the 307 and links agree with the canonical URLs.
// Sources keep authoring plain .html file paths. External URLs, in-page
// anchors, and non-.html targets pass through untouched. A bare index.html
// link becomes ./ to stay resolvable.
function extensionlessLinks(html) {
  return html.replace(/href="([^"]*)"/g, (attr, value) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//') || value.startsWith('#')) return attr;
    const [, pathname, suffix = ''] = value.match(/^([^#?]*)([#?].*)?$/);
    if (!pathname.endsWith('.html')) return attr;
    return `href="${extensionless(pathname) || './'}${suffix}"`;
  });
}

// Content sections alternate plain and tinted, site-wide: the first section
// after the hero (or page head) is plain, the second tinted, and so on. Pages
// never set section-tint themselves; the build assigns it here.
function stripeSections(html) {
  return html.replace(/<main\b[\s\S]*?<\/main>/, (main) => {
    let n = 0;
    return main.replace(/<section class="section((?: [^"]*)?)"/g, (_m, rest) => {
      n += 1;
      const others = rest.replace(/ section-tint\b/g, '');
      return `<section class="section${n % 2 === 0 ? ' section-tint' : ''}${others}"`;
    });
  });
}

// Mark the current header item, primary nav or utility bar (page.nav names it;
// tests/test-nav.js requires one on every page but the 404).
function markCurrentNav(html, page) {
  if (!page.nav) return html;
  return html.replace(`data-nav="${page.nav}"`, `data-nav="${page.nav}" aria-current="page"`);
}

// Visible breadcrumb, built from the same items as the JSON-LD BreadcrumbList.
function breadcrumbHtml(page) {
  const items = breadcrumbItems(page);
  if (items.length < 2) return '';
  const li = items.map((it, i) => {
    const last = i === items.length - 1;
    const href = it.item === SITE_URL ? `${page.root}index.html` : it.item.replace(`${SITE_URL}/`, page.root);
    return last
      ? `<li aria-current="page">${it.name}</li>`
      : `<li><a href="${href}">${it.name}</a></li>`;
  }).join('');
  return `<nav class="breadcrumb" aria-label="Breadcrumb"><ol>${li}</ol></nav>`;
}

// Research notes: breadcrumb above the title, dateline below the standfirst,
// and the closing promo block replaced by further reading. The breadcrumb is
// the hero's one rust label; the dateline carries the series and topic, as
// the research library lists them.
function decorateArticle(html, page, exhibits) {
  if (page.kind !== 'article') return html;
  const meta = replace(articleMeta, {
    SERIES: page.series,
    SECTION: page.section,
    PUBLISHED: fmtDateLong(page.schema.datePublished),
  });
  html = html.replace(/<section class="cta-panel article-cta">[\s\S]*?<\/section>/, () => furtherReading(page, exhibits.SIG_FIRST));

  // Anchor both insertions to the article's own <header>: the site masthead is
  // also a <header> and comes first in the document.
  return html.replace(
    /(<header class="article-hero[^"]*">)([\s\S]*?)<\/header>/,
    (_m, open, body) => `${open}\n${breadcrumbHtml(page)}${body}${meta}\n</header>`,
  );
}

// Archival image splash (src/data/archive-images.json, markup in splash.html),
// the same on the homepage and every section index: the soft-toned rendition
// behind the page's hero, then the full-tone rendition as a band directly
// beneath it. The image is decorative; its credit is printed once, on the band.
// The splash ends exactly at the bottom of the first screen: CSS sizes it to
// the viewport less --chrome-h (utility bar + masthead). The stylesheet carries
// the desktop value; splash-fit.js measures the real one, which differs on
// narrow screens where the masthead wraps.
function applyHeadImage(html, page) {
  if (!page.headImage) return html;
  const img = ARCHIVE[page.headImage];
  if (!img) throw new Error(`${page.src}: unknown headImage "${page.headImage}"`);
  // Root-absolute: a relative url() inside a custom property resolves against
  // the stylesheet that reads it (public/styles/), not against this page.
  const url = (r) => `/public/img/archive/${page.headImage}-${r}.jpg`;
  // The link test does not follow style attributes, so check the files here.
  for (const r of ['hero', 'band']) {
    if (!fs.existsSync(path.join(ROOT, url(r)))) throw new Error(`${page.src}: missing ${url(r)} (run npm run archive-images)`);
  }
  const re = /<section class="hero">([\s\S]*?)<\/section>/;
  if (!re.test(html)) throw new Error(`${page.src}: headImage set but no hero found`);
  return html.replace(re, (_m, body) => replace(splash, {
    HERO_URL: url('hero'),
    BAND_URL: url('band'),
    CREDIT: escAmp(img.credit),
    SPLASH_FIT_JS: splashFitJs,
    HERO_BODY: body, // last: the page's own text is never searched for placeholders
  }));
}

function formatTitle(page) {
  return page.kind === 'home' ? `${SITE_NAME} — ${page.title}` : `${page.title} | ${SITE_NAME}`;
}

function socialExtraFor(page, today) {
  if (page.kind !== 'article') return '';
  return `  <meta property="article:published_time" content="${isoMidnight(page.schema.datePublished)}" />
  <meta property="article:modified_time" content="${isoMidnight(today)}" />
  <meta property="article:section" content="${page.section}" />`;
}

// Pages that carry exhibits load the interaction layer; pages with tagged
// blocks load the scroll reveal (scripts/build-reveal.js).
function scriptsFor(html, root) {
  const scripts = [];
  if (/data-exhibit=/.test(html)) scripts.push(`<script src="${root}public/js/exhibits.js" defer></script>`);
  if (/\bdata-reveal\b/.test(html)) scripts.push(`<script src="${root}public/js/scroll-reveal.js" defer></script>`);
  return [...scripts, '</body>'].join('\n');
}

// Renders `page` into `dist`. `exhibits` holds the figures and exhibits
// (src/exhibits/); `today` (YYYY-MM-DD, New York) dates article modification.
// Returns false, with a warning, when the page's source file is missing.
function renderPage(page, { dist, exhibits, today }) {
  const srcPath = path.join(ROOT, 'src', 'pages', page.src);
  const outPath = path.join(dist, page.src);
  if (!fs.existsSync(srcPath)) {
    console.warn(`⚠  Missing source: ${page.src}`);
    return false;
  }

  const assembled = replace(layout, {
    HEAD: head,
    HEADER: header,
    FOOTER: footer,
    CHECKOUT_GATE: checkoutGate,
    CONTENT: fs.readFileSync(srcPath, 'utf8'),
    // After CONTENT, so a page's {{READING_CARD}} slot is filled; the card's
    // own figures are filled by the pass below.
    READING_CARD: readingCard,
  });
  let html = replace(assembled, {
    ...SITE_VARS,
    ...exhibits,
    BREADCRUMB: breadcrumbHtml(page),
    RESEARCH_RECENT: researchRecent(page.root),
    RESEARCH_LIBRARY: researchLibrary(page.root),
    FOOTER_NOTES: footerNotes(page.root),
    READING_LINK: page.readingLink === false ? '' : readingLink,
    ROOT: page.root,
    TITLE: formatTitle(page),
    DESC: page.desc,
    CANONICAL: canonicalFor(page.src),
    THEME_COLOR: COLORS.primary,
    OG_TYPE: page.kind === 'article' ? 'article' : 'website',
    SOCIAL_EXTRA: socialExtraFor(page, today),
    ROBOTS: page.robots,
    JSONLD_SCRIPTS: buildJsonLdScripts({ page, today, formattedTitle: formatTitle(page) }),
  });
  html = decorateArticle(html, page, exhibits);
  html = applyHeadImage(html, page);
  html = markCurrentNav(html, page);
  html = stripeSections(html);
  html = applyReveal(html);
  html = html.replace('</body>', scriptsFor(html, page.root));

  assertResolved(html, page.src);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, extensionlessLinks(html), 'utf8');
  console.log(`✓  ${page.src}`);
  return true;
}

module.exports = { renderPage };
