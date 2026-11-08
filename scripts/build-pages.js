/**
 * build-pages.js
 * Renders one registry page: wraps its body from src/pages/ in the layout and
 * partials, resolves every placeholder, decorates research notes, places the
 * archival splash, marks the current nav item, stripes sections, and writes
 * it to dist/ with extensionless internal links. Called from build.js.
 *
 * Placeholders resolved in every page and partial:
 *   {{ROOT}} {{TITLE}} {{DESC}} {{CANONICAL}} …   page metadata (see renderPage)
 *   {{HEAD}} {{HEADER}} {{CONTENT}} {{FOOTER}} {{CHECKOUT_GATE}}   layout slots
 *   {{BREADCRUMB}}                                 visible breadcrumb (same items as JSON-LD)
 *   {{IND_*}} {{SIG_*}} {{MDD_*}}                  figures from src/data/indicator.json
 *   {{EXHIBIT_*}} {{TABLE_*}}                      SVG exhibits and data tables (src/exhibits/)
 *
 * Page fields (src/site.config.js): src, root, title, desc, kind, nav (which
 * primary-nav item is current), crumb, schema, priority, sitemap, robots.
 */
const fs = require('fs');
const path = require('path');
const { SITE_URL, SITE_NAME, SUBSCRIBE_URL, PORTAL_URL, OG_IMAGE, OG_IMAGE_ALT } = require('../src/site.config');
const { extensionless, canonicalFor, breadcrumbItems } = require('../src/urls');
const { buildJsonLdScripts, isoDate } = require('../src/schema');
const { COLORS } = require('../src/brand.config');
const { fmtDateLong, escAmp } = require('../src/format');
const { replace, assertResolved } = require('./placeholders');
const { footerNotes, researchRecent, researchLibrary, furtherReading } = require('./build-listings');
const ARCHIVE = require('../src/data/archive-images.json').images;

const ROOT = path.join(__dirname, '..'); // scripts/ lives one level below the repo root

const partialsDir = path.join(ROOT, 'src', 'partials');
const read = (name) => fs.readFileSync(path.join(partialsDir, name), 'utf8');
const layout       = read('layout.html');
const head         = read('head.html');
const header       = read('header.html');
const footer       = read('footer.html');
const checkoutGate = read('checkout-gate.html');
const readingCard  = read('reading-card.html');

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

// Mark the current primary-nav item (page.nav names it).
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
  const meta = `<p class="article-meta"><span><strong>${page.series}</strong> &middot; ${page.section}</span>`
    + `<span>Published ${fmtDateLong(page.schema.datePublished)}</span>`
    + '<span>DoubleTrends Research</span></p>';
  html = html.replace(/<section class="cta-panel article-cta">[\s\S]*?<\/section>/, () => furtherReading(page, exhibits.SIG_FIRST));

  // Anchor both insertions to the article's own <header>: the site masthead is
  // also a <header> and comes first in the document.
  return html.replace(
    /(<header class="article-hero[^"]*">)([\s\S]*?)<\/header>/,
    (_m, open, body) => `${open}\n${breadcrumbHtml(page)}${body}${meta}\n</header>`,
  );
}

// The splash (hero + band) ends exactly at the bottom of the first screen:
// CSS sizes it to the viewport less --chrome-h (utility bar + masthead). The
// stylesheet carries the desktop value; this measures the real one, which
// differs on narrow screens where the masthead wraps.
const SPLASH_FIT = "(function(){var r=document.documentElement,m=document.getElementById('main');function f(){r.style.setProperty('--chrome-h',m.offsetTop+'px')}f();addEventListener('resize',f)})()";

// Archival image splash (src/data/archive-images.json), the same on the
// homepage and every section index: the soft-toned rendition behind the page's
// hero, then the full-tone rendition as a band directly beneath it. The image
// is decorative; its credit is printed once, on the band.
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
  return html.replace(re, (_m, body) =>
    `<div class="splash">
<section class="hero has-image" style="--head-image: url('${url('hero')}')">${body}</section>
<figure class="image-band" style="--band-image: url('${url('band')}')">
  <figcaption class="image-credit">Image: ${escAmp(img.credit)}</figcaption>
</figure>
</div>
<script>${SPLASH_FIT}</script>`);
}

function formatTitle(page) {
  return page.kind === 'home' ? `${SITE_NAME} — ${page.title}` : `${page.title} | ${SITE_NAME}`;
}

function socialExtraFor(page, today) {
  if (page.kind !== 'article') return '';
  return `  <meta property="article:published_time" content="${isoDate(page.schema.datePublished)}" />
  <meta property="article:modified_time" content="${isoDate(today)}" />
  <meta property="article:section" content="${page.section}" />`;
}

// Pages that carry exhibits load the interaction layer.
function scriptsFor(html, root) {
  return /data-exhibit=/.test(html) ? `<script src="${root}public/scripts/exhibits.js" defer></script>\n</body>` : '</body>';
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
    ...exhibits,
    BREADCRUMB: breadcrumbHtml(page),
    RESEARCH_RECENT: researchRecent(page.root),
    RESEARCH_LIBRARY: researchLibrary(page.root),
    FOOTER_NOTES: footerNotes(page.root),
    // The card links to the indicator from everywhere but the indicator itself.
    READING_LINK: page.src === 'indicator/index.html' ? '' : ` <a class="link" href="${page.root}indicator/index.html">About the indicator</a>`,
    ROOT: page.root,
    TITLE: formatTitle(page),
    DESC: page.desc,
    CANONICAL: canonicalFor(page.src),
    THEME_COLOR: COLORS.primary,
    SUBSCRIBE_URL,
    PORTAL_URL,
    OG_TYPE: page.kind === 'article' ? 'article' : 'website',
    OG_IMAGE,
    OG_IMAGE_ALT,
    SOCIAL_EXTRA: socialExtraFor(page, today),
    ROBOTS: page.robots ?? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',
    JSONLD_SCRIPTS: buildJsonLdScripts({ page, today, formattedTitle: formatTitle(page) }),
  });
  html = decorateArticle(html, page, exhibits);
  html = applyHeadImage(html, page);
  html = markCurrentNav(html, page);
  html = stripeSections(html);
  html = html.replace('</body>', scriptsFor(html, page.root));

  assertResolved(html, page.src);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, extensionlessLinks(html), 'utf8');
  console.log(`✓  ${page.src}`);
  return true;
}

module.exports = { renderPage };
