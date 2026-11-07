/**
 * build.js
 * Assembles each page from src/pages/ into the layout, compiles the site
 * stylesheet (Tailwind CLI), renders the data exhibits, and writes sitemap.xml,
 * _redirects and llms.txt into dist/.
 *
 * Placeholders resolved in every page and partial:
 *   {{ROOT}} {{TITLE}} {{DESC}} {{CANONICAL}} …   page metadata (see renderPage)
 *   {{HEAD}} {{HEADER}} {{CONTENT}} {{FOOTER}} {{CHECKOUT_GATE}}   layout slots
 *   {{BREADCRUMB}}                                 visible breadcrumb (same items as JSON-LD)
 *   {{IND_*}} {{SIG_*}} {{REG_*}}                  figures from src/data/indicator.json
 *   {{EXHIBIT_*}} {{TABLE_*}}                      SVG exhibits and data tables (src/charts.js)
 *
 * Page fields (src/site.config.js): src, root, title, desc, kind, nav (which
 * primary-nav item is current), crumb, schema, priority, sitemap, robots.
 */

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  SUBSCRIBE_URL,
  PORTAL_URL,
  OG_IMAGE,
  OG_IMAGE_ALT,
  PUBLISHER,
  pages,
} = require('./src/site.config');
const { buildJsonLdScripts, canonicalFor: canonicalForRaw, pageDisplayName, breadcrumbItems, isoDate } = require('./src/schema');
const { COLORS } = require('./src/brand.config');
const { buildExhibits, fmtDateLong } = require('./src/charts');
const { optimizeImages } = require('./build-images');
const { writeGuilloches } = require('./build-guilloche');
const ARCHIVE = require('./src/data/archive-images.json').images;
const canonicalFor = (src) => canonicalForRaw(SITE_URL, src);

function todayInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
const TODAY = todayInTimeZone('America/New_York');

// Figures and exhibits, computed once from src/data/ (build-indicator-data.js).
const EXHIBITS = buildExhibits();

// ─── Prepare output directory ────────────────────────────────────────────────
const DIST = path.join(__dirname, 'dist');
try {
  fs.rmSync(DIST, { recursive: true, force: true });
} catch (error) {
  if (error && (error.code === 'EPERM' || error.code === 'EBUSY')) {
    console.warn(`!  Could not remove dist before build (${error.code}); reusing existing directory.`);
  } else {
    throw error;
  }
}
fs.mkdirSync(DIST, { recursive: true });

// ─── Read partials ────────────────────────────────────────────────────────────
const partialsDir = path.join(__dirname, 'src', '_partials');
const read = (name) => fs.readFileSync(path.join(partialsDir, name), 'utf8');
const layout       = read('layout.html');
const head         = read('head.html');
const header       = read('header.html');
const footer       = read('footer.html');
const checkoutGate = read('checkout-gate.html');

// ─── Build CSS ───────────────────────────────────────────────────────────────
// entry.css (Tailwind directives) + the house style, in cascade order:
// tokens → base → components → layouts. The compatibility layer comes last so
// it can override Tailwind utilities left in older page markup.
const CSS_SEGMENTS = [
  'tokens/font-face', 'tokens/colors',
  'base/reset-global', 'base/type-base',
  'components/chrome', 'components/controls', 'components/exhibit',
  'layouts/document',
  'components/legacy',
];
const stylesDir   = path.join(__dirname, 'src', 'styles');
const entryCSS    = fs.readFileSync(path.join(stylesDir, 'entry.css'), 'utf8');
const customCSS   = CSS_SEGMENTS.map((s) => fs.readFileSync(path.join(stylesDir, `${s}.css`), 'utf8')).join('\n');
const cssInputTmp = path.join(stylesDir, '.build-input.css');
const cssOut      = path.join(DIST, 'public', 'css', 'site.css');
fs.mkdirSync(path.dirname(cssOut), { recursive: true });
fs.writeFileSync(cssInputTmp, entryCSS + '\n' + customCSS, 'utf8');
try {
  execFileSync(
    process.execPath,
    [path.join(__dirname, 'node_modules', 'tailwindcss', 'lib', 'cli.js'), '-i', cssInputTmp, '-o', cssOut, '--minify'],
    { stdio: 'inherit' },
  );
} finally {
  fs.unlinkSync(cssInputTmp);
}
console.log('✓  public/css/site.css generated');

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Function replacer: values are inserted literally ("$&", "$1" in generated
// markup must not be read as replacement patterns).
function replace(template, vars) {
  return Object.entries(vars).reduce((str, [k, v]) => str.replaceAll(`{{${k}}}`, () => v), template);
}

// Rewrite internal .html hrefs to the extensionless form Cloudflare's asset
// handling serves with 200 (method.html → method, research/index.html →
// research/), so in-site navigation skips the 307 and links agree with the
// canonical URLs. Sources keep authoring plain .html file paths. External URLs,
// in-page anchors, and non-.html targets pass through untouched. A bare
// index.html link becomes ./ to stay resolvable.
function extensionlessLinks(html) {
  return html.replace(/href="([^"]*)"/g, (attr, value) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//') || value.startsWith('#')) return attr;
    const [, pathname, suffix = ''] = value.match(/^([^#?]*)([#?].*)?$/);
    if (!pathname.endsWith('.html')) return attr;
    const out = pathname.endsWith('index.html')
      ? pathname.slice(0, -'index.html'.length) || './'
      : pathname.slice(0, -'.html'.length);
    return `href="${out}${suffix}"`;
  });
}

// Mark the current primary-nav item (page.nav names it).
function markCurrentNav(html, page) {
  if (!page.nav) return html;
  return html.replace(`data-nav="${page.nav}"`, `data-nav="${page.nav}" aria-current="page"`);
}

// Visible breadcrumb, built from the same items as the JSON-LD BreadcrumbList.
function breadcrumbHtml(page) {
  const items = breadcrumbItems(page, SITE_URL);
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

// Research notes: breadcrumb above the title, dateline below the standfirst.
function decorateArticle(html, page) {
  if (page.kind !== 'article') return html;
  const published = page.schema?.datePublished;
  const meta = `<p class="article-meta"><span><strong>Research note</strong> &middot; ${page.section}</span>`
    + (published ? `<span>Published ${fmtDateLong(published)}</span>` : '')
    + '<span>DoubleTrends Research</span></p>';
  // The notes' original closing promo blocks are replaced by one standard
  // further-reading block: related notes from the same series, the method,
  // the record, and a pointer to the indicator — no sales line.
  const related = ARTICLES.filter((a) => a.series === page.series && a.src !== page.src).slice(0, 2);
  const further = `<section class="article-section article-further">
<span class="tag-overline">Further reading</span>
<ul class="further-list">
${related.map((a) => `<li><a href="${page.root}${a.src}">${escAmp(a.title)}</a><span>${a.series} &middot; ${fmtDateLong(a.schema.datePublished)}</span></li>`).join('\n')}
<li><a href="${page.root}method.html">Methodology</a><span>How the regime classification and the signal are constructed</span></li>
<li><a href="${page.root}data.html">Historical data</a><span>Every signal since ${EXHIBITS.SIG_FIRST}, with what followed</span></li>
</ul>
<p class="fine-print">DoubleTrends research is published alongside the <a href="${page.root}indicator.html">DoubleTrends Regime Indicator</a>.</p>
</section>`;
  html = html.replace(/<section class="cta-panel article-cta">[\s\S]*?<\/section>/, () => further);

  // Anchor both insertions to the article's own <header>: the site masthead is
  // also a <header> and comes first in the document.
  return html.replace(
    /(<header class="article-hero[^"]*">)([\s\S]*?)<\/header>/,
    (_m, open, body) => `${open}\n${breadcrumbHtml(page)}${body}${meta}\n</header>`,
  );
}

// Research library entries, generated from the registry (title, desc,
// published, series) so listings never drift from the notes themselves.
const SERIES_ORDER = ['Studies', 'Primers', 'Macro inputs'];
const SERIES_BLURB = {
  'Studies': 'Market history and investor behavior: the base rates behind the indicator.',
  'Primers': 'The measures the indicator is built from, explained one at a time.',
  'Macro inputs': 'One note per macroeconomic series the regime classification reads.',
};
const byDate = (a, b) => (b.schema.datePublished.localeCompare(a.schema.datePublished)) || a.title.localeCompare(b.title);
// The library lists research notes only; AlphaVerify is its own section.
const ARTICLES = pages.filter((p) => p.kind === 'article').sort(byDate);
const escAmp = (s) => s.replace(/&(?![a-z]+;|#[0-9]+;)/gi, "&amp;");
function entryHtml(a, root) {
  return `<li class="entry">
<span class="entry-date">${fmtDateLong(a.schema.datePublished)}</span>
<div><h3 class="entry-title"><a href="${root}${a.src}">${escAmp(a.title)}</a></h3><p class="entry-abstract">${escAmp(a.desc)}</p></div>
<span class="entry-series">${a.series} &middot; ${a.section}</span>
</li>`;
}
function researchRecent(root, n = 3) {
  return `<ul class="entries">${ARTICLES.slice(0, n).map((a) => entryHtml(a, root)).join('\n')}</ul>`;
}
function researchLibrary(root) {
  return SERIES_ORDER.map((series) => {
    const list = ARTICLES.filter((a) => a.series === series);
    const id = series.toLowerCase().replace(/\s+/g, '-');
    return `<section class="section" id="${id}"><div class="wrap">
<div class="section-head"><div><span class="kicker">${series}</span><h2 class="h2">${SERIES_BLURB[series]}</h2></div><span class="fine">${list.length} ${list.length === 1 ? 'note' : 'notes'}</span></div>
<ul class="entries">${list.map((a) => entryHtml(a, root)).join('\n')}</ul>
</div></section>`;
  }).join('\n');
}

// Archival background image (src/data/archive-images.json) behind the page's
// title block: the first page head, or the hero on pages that open with one.
// The credit line is printed in the block; the image itself is decorative.
function applyHeadImage(html, page) {
  if (!page.headImage) return html;
  const img = ARCHIVE[page.headImage];
  if (!img) throw new Error(`${page.src}: unknown headImage "${page.headImage}"`);
  const rendition = img.renditions.includes('hero') ? 'hero' : 'head';
  // Root-absolute: a relative url() inside a custom property resolves against
  // the stylesheet that reads it (public/css/), not against this page.
  const url = `/public/img/archive/${page.headImage}-${rendition}.jpg`;
  // The link test does not follow style attributes, so check the file here.
  if (!fs.existsSync(path.join(__dirname, url))) throw new Error(`${page.src}: missing ${url} (run npm run archive-images)`);
  // One credit per image per page: a page that also shows the image as a
  // band credits it there.
  const credit = html.includes(`${page.headImage}-band.jpg`) ? '' : `<p class="image-credit">Image: ${escAmp(img.credit)}</p>`;
  const re = /<(header|section) class="(page-head|hero)">([\s\S]*?)<\/\1>/;
  if (!re.test(html)) throw new Error(`${page.src}: headImage set but no page-head or hero found`);
  return html.replace(re, (_m, tag, cls, body) =>
    `<${tag} class="${cls} has-image" style="--head-image: url('${url}')">${body}${credit}\n</${tag}>`);
}

function formatTitle(page) {
  return page.kind === 'home' ? `${SITE_NAME} — ${page.title}` : `${page.title} | ${SITE_NAME}`;
}

function socialExtraFor(page) {
  if (page.kind !== 'article') return '';
  const published = page.schema?.datePublished;
  return `  <meta property="article:published_time" content="${isoDate(published)}" />
  <meta property="article:modified_time" content="${isoDate(TODAY)}" />
  <meta property="article:section" content="${page.section || 'Research'}" />`;
}

// Pages that carry exhibits load the interaction layer.
function scriptsFor(html, root) {
  return /data-exhibit=/.test(html) ? `<script src="${root}public/js/exhibits.js" defer></script>\n</body>` : '</body>';
}

function renderPage(page) {
  const srcPath = path.join(__dirname, 'src', 'pages', page.src);
  const outPath = path.join(DIST, page.src);
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
  });
  let html = replace(assembled, {
    ...EXHIBITS,
    BREADCRUMB: breadcrumbHtml(page),
    RESEARCH_RECENT: researchRecent(page.root),
    RESEARCH_LIBRARY: researchLibrary(page.root),
    ROOT: page.root,
    ARCHIVE_CREDIT_FACADE1908: escAmp(ARCHIVE.facade1908.credit),
    TITLE: formatTitle(page),
    DESC: page.desc,
    CANONICAL: canonicalFor(page.src),
    THEME_COLOR: COLORS.primary,
    SUBSCRIBE_URL,
    PORTAL_URL,
    OG_TYPE: page.kind === 'article' ? 'article' : 'website',
    OG_IMAGE,
    OG_IMAGE_ALT,
    SOCIAL_EXTRA: socialExtraFor(page),
    HEAD_PRELOADS: '',
    ROBOTS: page.robots ?? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',
    JSONLD_SCRIPTS: buildJsonLdScripts({
      page,
      siteUrl: SITE_URL,
      siteName: SITE_NAME,
      siteDescription: SITE_DESCRIPTION,
      publisher: PUBLISHER,
      ogImage: OG_IMAGE,
      today: TODAY,
      defaultArticlePublished: page.schema?.datePublished,
      formattedTitle: formatTitle(page),
    }),
  });
  html = decorateArticle(html, page);
  html = applyHeadImage(html, page);
  html = markCurrentNav(html, page);
  html = html.replace('</body>', scriptsFor(html, page.root));

  const leftover = html.match(/\{\{[A-Z0-9_]+\}\}/);
  if (leftover) throw new Error(`${page.src}: unresolved placeholder ${leftover[0]}`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, extensionlessLinks(html), 'utf8');
  console.log(`✓  ${page.src}`);
  return true;
}

// ─── Build pages ─────────────────────────────────────────────────────────────
let built = 0;
for (const page of pages) {
  if (renderPage(page)) built++;
}
console.log(`\nBuild complete — ${built} pages written.`);

// ─── sitemap.xml ─────────────────────────────────────────────────────────────
const urls = pages
  .filter((p) => p.sitemap !== false)
  .map((p) => `  <url>
    <loc>${canonicalFor(p.src)}</loc>
    <changefreq>${p.kind === 'home' || p.src === 'data.html' ? 'weekly' : 'monthly'}</changefreq>
    <priority>${(p.priority ?? 0.7).toFixed(1)}</priority>
  </url>`)
  .join('\n\n');
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

${urls}

</urlset>
`, 'utf8');
console.log('✓  sitemap.xml generated');

// ─── _redirects ──────────────────────────────────────────────────────────────
// Cloudflare's built-in .html stripping issues 307 (temporary) redirects.
// Explicit 301s upgrade them so search engines consolidate on the canonical.
const redirectLines = pages
  .filter((p) => p.src !== '404.html')
  .map((p) => `/${p.src} ${canonicalFor(p.src).slice(SITE_URL.length) || '/'} 301`);
// URLs retired by the November 2026 restructure. Each old address (with and
// without .html) 301s to its new canonical, so links and rankings carry over.
const LEGACY = [
  ['/academy', '/research/'],
  ['/academy/', '/research/'],
  ['/academy/index.html', '/research/'],
  ...pages.filter((p) => p.kind === 'article').flatMap((p) => {
    const slug = p.src.slice('research/'.length, -'.html'.length);
    return [[`/academy/${slug}`, `/research/${slug}`], [`/academy/${slug}.html`, `/research/${slug}`]];
  }),
  ['/alphaverify', '/alphaverify/'],
  ['/alphaverify.html', '/alphaverify/'],
  ['/public/academy/*', '/public/research/:splat'],
];
const legacyLines = LEGACY.map(([from, to]) => `${from} ${to} 301`);
fs.writeFileSync(path.join(DIST, '_redirects'), [...legacyLines, ...redirectLines].join('\n') + '\n', 'utf8');
console.log('✓  _redirects generated');

// ─── llms.txt ────────────────────────────────────────────────────────────────
// Sections mirror the breadcrumb model: top-level pages, then Research /
// About / Legal children.
const LLMS_SECTIONS = [
  { key: 'main',    heading: 'Primary Pages' },
  { key: 'research', heading: 'Research' },
  { key: 'alphaverify', heading: 'AlphaVerify' },
  { key: 'company', heading: 'About' },
  { key: 'legal',   heading: 'Legal' },
];
function llmsSectionKey(src) {
  const prefix = src.split('/')[0];
  return ['research', 'alphaverify', 'company', 'legal'].includes(prefix) && !src.endsWith('index.html') ? prefix : 'main';
}
const llmsSections = LLMS_SECTIONS.map(({ key, heading }) => {
  const entries = pages
    .filter((p) => p.sitemap !== false && llmsSectionKey(p.src) === key)
    .map((p) => `- ${pageDisplayName(p)}: ${canonicalFor(p.src)}\n  ${p.desc}`)
    .join('\n');
  return `## ${heading}\n\n${entries}`;
}).join('\n\n');

fs.writeFileSync(path.join(DIST, 'llms.txt'), `# DoubleTrends

DoubleTrends is an independent quantitative research firm. It publishes research on market regimes, drawdowns and investor behavior, and the DoubleTrends Regime Indicator: a rules-based daily classification of U.S. equity market stress (calm, correction, panic, bear) for the S&P 500, with a reversal signal that is eligible to fire only in panic and bear regimes. It does not sell trading signals; a subscription to the daily reading covers the infrastructure that produces it. It accepts no payments from brokers or exchanges and also offers research and data engineering services. History is a point-in-time reconstruction from ${EXHIBITS.IND_FIRST_YEAR}; live publication began ${EXHIBITS.IND_LIVE_SINCE}. The site also publishes research notes on drawdowns, investor behavior, and the indicator's inputs.

Important: the content is educational market information only. It is not financial, investment, trading, tax, or legal advice, and it is not a recommendation to buy, sell, or hold any security. Readings before ${EXHIBITS.IND_LIVE_SINCE} are back-tested.

${llmsSections}

## Machine-Readable Data

- Signal history with forward returns (CSV): ${SITE_URL}/public/data/doubletrends-signals.csv
- XML sitemap: ${SITE_URL}/sitemap.xml
- Robots policy: ${SITE_URL}/robots.txt

## Entity Summary

- Brand: DoubleTrends (a trademark of DoubleTrends L.L.C.)
- Operator: DoubleTrends L.L.C.
- Coverage: S&P 500 index (DoubleTrends is not affiliated with S&P Dow Jones Indices)
- Publication: daily regime reading after the U.S. close; signals delivered same day to subscribers
- Signal history: ${EXHIBITS.SIG_COUNT} signals since ${EXHIBITS.SIG_FIRST}, all back-tested unless marked live
- Contact: info@doubletrends.com
`, 'utf8');
console.log('✓  llms.txt generated');

// ─── Static assets ───────────────────────────────────────────────────────────
fs.copyFileSync(path.join(__dirname, 'src', 'robots.txt'), path.join(DIST, 'robots.txt'));
fs.copyFileSync(path.join(__dirname, 'src', '_headers'), path.join(DIST, '_headers'));
console.log('✓  robots.txt, _headers copied');

// public/ is copied verbatim EXCEPT the managed rasters, which are re-encoded to
// resized WebP — see build-images.js. Awaited last; fails the build on error.
(async () => {
  const { count } = await optimizeImages(path.join(__dirname, 'public'), path.join(DIST, 'public'));
  console.log(`✓  public/ copied + ${count} images → WebP`);
  const guilloches = writeGuilloches(path.join(DIST, 'public', 'brand'));
  console.log(`✓  ${guilloches.length} guilloche patterns generated`);
})().catch((err) => {
  console.error('✗  image optimization failed');
  console.error(err);
  process.exit(1);
});
