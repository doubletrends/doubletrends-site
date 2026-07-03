/**
 * build.js
 * Assembles final HTML by injecting _partials into each page template,
 * builds the site stylesheet via Tailwind CLI, and generates sitemap.xml.
 *
 * Placeholders (replaced in head / header / footer / layout):
 *   {{ROOT}}       - relative path to site root (e.g. "" or "../")
 *   {{TITLE}}      - <title> content
 *   {{DESC}}       - meta description content
 *   {{CANONICAL}}  - canonical URL
 *   {{HEAD}} {{HEADER}} {{CONTENT}} {{FOOTER}} {{CHECKOUT_GATE}} - layout slots
 *
 * Page fields:
 *   src       - path under src/pages/ AND the output path AND the sitemap loc
 *   root      - relative path back to site root from this page
 *   title,desc- <title> / meta description
 *   priority  - sitemap priority (default 0.7)
 *   sitemap   - set false to exclude from sitemap.xml (e.g. 404)
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
  ARTICLE_PUBLISHED,
  pages,
} = require('./src/site.config');
const { buildJsonLdScripts, canonicalFor: canonicalForRaw, pageDisplayName, isoDate } = require('./src/schema');
const { COLORS } = require('./src/brand.config');
const canonicalFor = (src) => canonicalForRaw(SITE_URL, src);

// ─── Site config ────────────────────────────────────────────────────────────
function todayInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const TODAY = todayInTimeZone('Asia/Shanghai');

// ─── Track-record numbers from the backfill ─────────────────────────────────
// Read once at build start so {{TR_*}} placeholders resolve to real numbers in
// static HTML (good for SEO and avoids a flash-of-loading-content). Generated
// by build-replay-data.js — see that file's header for the contract.
const HISTORY_PATH = path.join(__dirname, 'public', 'replay', 'history.json');
const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
const tr = history.metrics_since_replay_start;
const TRACK_RECORD = {
  TR_SIGNAL_COUNT: String(tr.total_signals),
  TR_MEDIAN_1Y_PCT: `+${tr.median_1y_pct}%`,
  TR_POSITIVE_1Y: `${tr.positive_1y_count} of ${tr.matured_1y_count}`,
};

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

const layout              = read('layout.html');
const routingCardTemplate = read('routing-card.html');
const head                = read('head.html');
const header              = read('header.html');
const footer              = read('footer.html');
const checkoutGate        = read('checkout-gate.html');

// ─── Build CSS ───────────────────────────────────────────────────────────────
// Concatenate entry.css (Tailwind directives + @layer components) with all
// CSS source files, run Tailwind CLI to produce a single minified file.
// Paths are relative to src/styles/ — subdirectory prefix encodes the layer.
const CSS_SEGMENTS = [
  'tokens/font-face', 'tokens/colors', 'tokens/shadows', 'tokens/gradients',
  'base/reset-global', 'base/type-base',
  'components/button-base', 'components/accordion-base', 'components/footer-base',
  'components/card-base', 'components/terminal-base', 'components/story-card', 'components/nav-base',
  'layouts/page-shell', 'layouts/article-layout', 'layouts/directory-layout', 'layouts/hero-layout',
  'layouts/responsive-mobile',
];
const stylesDir   = path.join(__dirname, 'src', 'styles');
const entryCSS    = fs.readFileSync(path.join(stylesDir, 'entry.css'), 'utf8');
const customCSS   = CSS_SEGMENTS
  .map((s) => fs.readFileSync(path.join(stylesDir, `${s}.css`), 'utf8'))
  .join('\n');
const cssInputTmp = path.join(__dirname, 'src', 'styles', '.build-input.css');
const cssOut      = path.join(DIST, 'public', 'css', 'site.css');
fs.mkdirSync(path.dirname(cssOut), { recursive: true });
fs.writeFileSync(cssInputTmp, entryCSS + '\n' + customCSS, 'utf8');
try {
  execFileSync(
    process.execPath,
    [
      path.join(__dirname, 'node_modules', 'tailwindcss', 'lib', 'cli.js'),
      '-i', cssInputTmp,
      '-o', cssOut,
      '--minify',
    ],
    { stdio: 'inherit' },
  );
} finally {
  fs.unlinkSync(cssInputTmp);
}
console.log('✓  public/css/site.css generated');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function replace(template, vars) {
  return Object.entries(vars).reduce(
    (str, [k, v]) => str.replaceAll(`{{${k}}}`, v),
    template
  );
}

// Rewrite internal .html hrefs to the extensionless form Cloudflare's
// auto-trailing-slash asset handling serves with 200 (method.html → method,
// academy/index.html → academy/), so in-site navigation skips the 307 and
// links agree with the canonical URLs. Sources keep authoring plain .html
// file paths. External URLs, in-page anchors, and non-.html targets pass
// through untouched. A bare index.html link becomes ./ to stay resolvable.
function extensionlessLinks(html) {
  return html.replace(/href="([^"]*)"/g, (attr, value) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//') || value.startsWith('#')) {
      return attr;
    }
    const [, pathname, suffix = ''] = value.match(/^([^#?]*)([#?].*)?$/);
    if (!pathname.endsWith('.html')) return attr;
    const out = pathname.endsWith('index.html')
      ? pathname.slice(0, -'index.html'.length) || './'
      : pathname.slice(0, -'.html'.length);
    return `href="${out}${suffix}"`;
  });
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function formatTitle(title) {
  return `${SITE_NAME} | ${title}`;
}

function socialExtraFor(page) {
  if (page.kind !== 'article') return '';
  const section = page.schema?.articleSection || 'Academy';
  return `  <meta property="article:published_time" content="${isoDate(ARTICLE_PUBLISHED)}" />
  <meta property="article:modified_time" content="${isoDate(TODAY)}" />
  <meta property="article:section" content="${section}" />`;
}

function renderRoutingCard(card, root) {
  if (!card) return '';
  return replace(routingCardTemplate, {
    ROUTING_PILL:         card.pill,
    ROUTING_HEADLINE:     card.headline,
    ROUTING_BODY:         card.body,
    ROUTING_ROUTE:        card.route,
    ROUTING_ROUTE_DESC:   card.routeDesc,
    ROUTING_HREF:         `${root}${card.href}`,
    ROUTING_CTA:          card.cta,
    ROUTING_FOOTER_LABEL: card.footerLabel,
  });
}

function renderPage(page) {
  const srcPath = path.join(__dirname, 'src', 'pages', page.src);
  const outPath = path.join(DIST, page.src);

  if (!fs.existsSync(srcPath)) {
    console.warn(`⚠  Missing source: ${page.src}`);
    return false;
  }

  const assembled = replace(layout, {
    HEAD:          head,
    HEADER:        header,
    FOOTER:        footer,
    CHECKOUT_GATE: checkoutGate,
    CONTENT:       fs.readFileSync(srcPath, 'utf8'),
  });
  const html = replace(assembled, {
    ROOT:      page.root,
    TITLE:     formatTitle(page.title),
    DESC:      page.desc,
    CANONICAL: canonicalFor(page.src),
    THEME_COLOR: COLORS.light,
    SUBSCRIBE_URL,
    PORTAL_URL,
    OG_TYPE:   page.kind === 'article' ? 'article' : 'website',
    OG_IMAGE,
    OG_IMAGE_ALT,
    SOCIAL_EXTRA: socialExtraFor(page),
    ROBOTS:    page.robots ?? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',
    JSONLD_SCRIPTS: buildJsonLdScripts({
      page,
      siteUrl: SITE_URL,
      siteName: SITE_NAME,
      siteDescription: SITE_DESCRIPTION,
      publisher: PUBLISHER,
      ogImage: OG_IMAGE,
      today: TODAY,
      defaultArticlePublished: ARTICLE_PUBLISHED,
    }),
    ...TRACK_RECORD,
    ROUTING_CARD: renderRoutingCard(page.routingCard, page.root),
  });

  ensureDir(outPath);
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

// ─── Generate sitemap.xml ────────────────────────────────────────────────────
const urls = pages
  .filter((p) => p.sitemap !== false)
  .map((p) => `  <url>
    <loc>${canonicalFor(p.src)}</loc>
    <changefreq>monthly</changefreq>
    <priority>${(p.priority ?? 0.7).toFixed(1)}</priority>
  </url>`)
  .join('\n\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

${urls}

</urlset>
`;

fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap, 'utf8');
console.log('✓  sitemap.xml generated');

// ─── Generate llms.txt ───────────────────────────────────────────────────────
const primaryPages = pages
  .filter((p) => p.sitemap !== false && p.kind !== 'article')
  .map((p) => `- ${pageDisplayName(p)}: ${canonicalFor(p.src)}\n  ${p.desc}`)
  .join('\n');

const academyArticles = pages
  .filter((p) => p.kind === 'article')
  .map((p) => `- ${pageDisplayName(p)}: ${canonicalFor(p.src)}\n  ${p.desc}`)
  .join('\n');

const llms = `# DoubleTrends™

DoubleTrends™ is a rules-based S&P 500 index signal for ETF investors. It tracks the S&P 500 index and publishes a same-day alert to the subscriber portal when its oversold-reversal rule fires. The site also publishes research notes on drawdowns, market exhaustion, investor behavior, and market-structure tools.

Important: the content is educational market information only. It is not financial, investment, trading, tax, or legal advice, and it is not a recommendation to buy, sell, or hold any security.

## Primary Pages

${primaryPages}

## Academy Articles

${academyArticles}

## Machine-Readable Data

- Replay data for the S&P 500 signal chart: ${SITE_URL}/public/replay/sp500.json
- XML sitemap: ${SITE_URL}/sitemap.xml
- Robots policy: ${SITE_URL}/robots.txt

## Entity Summary

- Brand: DoubleTrends™
- Operator: DoubleTrends L.L.C.
- Coverage: S&P 500 index
- Intended audience: ETF investors using S&P 500 exposure such as VOO, SPY, or IVV
- Delivery: subscriber portal with same-day alerts
- Signal type: low-frequency, rules-based oversold reversal
- Contact: info@doubletrends.com
`;

fs.writeFileSync(path.join(DIST, 'llms.txt'), llms, 'utf8');
console.log('✓  llms.txt generated');

// ─── Copy static assets ──────────────────────────────────────────────────────
fs.cpSync(path.join(__dirname, 'public'), path.join(DIST, 'public'), { recursive: true });
console.log('✓  public/ copied');

fs.copyFileSync(path.join(__dirname, 'src', 'robots.txt'), path.join(DIST, 'robots.txt'));
console.log('✓  robots.txt copied');

fs.copyFileSync(path.join(__dirname, 'src', '_headers'), path.join(DIST, '_headers'));
console.log('✓  _headers copied');
