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
const { optimizeImages } = require('./build-images');
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
const stories             = read('stories.html');

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
  'components/motion',
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

// Rewrite internal .html hrefs to the extensionless form Cloudflare's asset
// handling serves with 200 (method.html → method, academy/index.html →
// academy/), so in-site navigation skips the 307 and links agree with the
// canonical URLs. Sources keep authoring plain .html file paths. External URLs,
// in-page anchors, and non-.html targets pass through untouched. A bare
// index.html link becomes ./ to stay resolvable.
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

// Index just past the matching close tag of the element opened at `openStart`,
// found by counting same-name open/close depth. Used to skip content nested
// inside an element we just tagged.
function elementEnd(html, tag, openStart) {
  const gt = html.indexOf('>', openStart);
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'gi');
  re.lastIndex = gt + 1;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') { if (--depth === 0) return m.index + m[0].length; }
    else depth++;
  }
  return html.length;
}

// Block atomicity (reveal contract): a data-reveal element may not live inside
// another. Keep the OUTERMOST — the block — and strip data-reveal from any
// nested descendant, so blocks reveal whole instead of double-animating their
// pieces. Runs after all tagging, so it also catches cross-rule overlaps (e.g.
// a hero banner-text sitting inside a revealed section banner).
function dropNestedReveals(mainBlock) {
  const spans = [];
  const re = /<([a-zA-Z0-9]+)\b[^>]*\bdata-reveal\b[^>]*>/g;
  let m;
  while ((m = re.exec(mainBlock))) {
    spans.push({ start: m.index, end: elementEnd(mainBlock, m[1], m.index) });
  }
  const nestedStarts = spans
    .filter((s) => spans.some((p) => p !== s && s.start > p.start && s.start < p.end))
    .map((s) => s.start)
    .sort((a, b) => b - a);                          // right-to-left keeps indices valid
  let out = mainBlock;
  for (const pos of nestedStarts) {
    const gt = out.indexOf('>', pos);
    out = out.slice(0, pos) + out.slice(pos, gt + 1).replace(/\s+data-reveal\b/, '') + out.slice(gt + 1);
  }
  return out;
}

// Site-wide scroll-reveal: tag every top-level <section> inside <main> that
// begins AFTER the page's first <h1>. The hero always contains the first H1
// (whether it is a <section>, an <article>'s <header>, etc.), so heroes stay
// instant — protecting LCP and avoiding a load flash — while the content
// sections below fade up on scroll. Paired with public/js/scroll-reveal.js and
// the prefers-reduced-motion-gated rules in styles/components/motion.css.
// A section that already carries data-reveal (authored by hand) is left as-is.
function applyScrollReveal(html) {
  return html.replace(/<main>[\s\S]*?<\/main>/, (mainBlock) => {
    const h1Index = mainBlock.search(/<h1\b/);

    // Sections: reveal every <section> that begins after the hero. When the
    // page has an <h1>, the hero is whatever block holds it, so reveal the
    // sections starting after it. When it has none (e.g. product.html), fall
    // back to skipping the first <section> as the hero.
    let firstSectionSkipped = h1Index !== -1;
    let sectionTagged = false;
    let out = mainBlock.replace(/<section\b([^>]*)>/g, (tag, attrs, offset) => {
      if (h1Index !== -1) {
        if (offset < h1Index) return tag;               // hero — stays instant
      } else if (!firstSectionSkipped) {
        firstSectionSkipped = true;
        return tag;                                     // hero — stays instant
      }
      if (/\bdata-reveal\b/.test(attrs)) return tag;    // already tagged
      sectionTagged = true;
      return `<section${attrs} data-reveal>`;
    });

    // Directory cards, featured tiles, and banners (the section-landing pages)
    // sit below the hero inside a single <section>, so the section rule skips
    // them. Each reveals as a WHOLE block (card as a whole) — including the hero
    // banner at the top: its background image reveals with it, rather than
    // leaving the image/tint static while only the text fades (which read as a
    // broken partial animation). The h1Index guard scopes this to directory
    // pages; product.html reuses .directory-banner for app-shot frames but has
    // no <h1>, so it is left untouched here.
    if (h1Index !== -1) {
      out = out.replace(
        /<(a|article|div)\b([^>]*\bclass="[^"]*\bdirectory-(?:card|featured|banner)\b[^"]*"[^>]*)>/g,
        (tag, el, rest) => {
          if (/\bdata-reveal\b/.test(rest)) return tag;
          return `<${el}${rest} data-reveal>`;
        },
      );
    }

    // Single-section content pages (company/*, legal/*) wrap their panels in
    // one container below the hero (.page-content-wide, .page-content-legal), so
    // the section rule finds nothing to reveal. When no <section> was revealed
    // above, tag the content panels directly: .terminal-shell / .product-panel
    // for company pages, .legal-section for the per-clause blocks of a legal
    // document. Gated on !sectionTagged, this never touches the homepage or
    // articles, where the same classes sit inside already-revealed sections.
    // metric-tile is intentionally excluded — it nests inside terminal-shell
    // and reveals with its parent. Any nesting from this or the rules above is
    // removed afterwards by dropNestedReveals (keeps the outermost block).
    if (h1Index !== -1 && !sectionTagged) {
      const h1 = out.search(/<h1\b/);
      out = out.replace(
        /<(div|article)\b([^>]*\bclass="[^"]*\b(?:terminal-shell|product-panel|legal-section)\b[^"]*"[^>]*)>/g,
        (tag, el, rest, offset) => {
          if (offset < h1) return tag;
          if (/\bdata-reveal\b/.test(rest)) return tag;
          return `<${el}${rest} data-reveal>`;
        },
      );
    }

    // Hero text stacks. One system: the hero reveals through the same
    // data-reveal path as every content block, cascading in on load via the
    // first-viewport branch of scroll-reveal.js. The no-FOUC guard in <head>
    // applies the hidden state before first paint, so the hero never flashes.
    // These classes are hero-only, and decor/banner images sit OUTSIDE the text
    // stack (so image-LCP heroes stay instant). No h1 guard: the hero is no
    // longer the instant exception.
    out = out.replace(
      /<(div|header|a|section)\b([^>]*\bclass="[^"]*\b(?:hero-copy|hero-ai-card|page-hero-center|article-hero-frame|hero-load)\b[^"]*"[^>]*)>/g,
      (tag, el, rest) => {
        if (/\bdata-reveal\b/.test(rest)) return tag;
        return `<${el}${rest} data-reveal>`;
      },
    );

    return dropNestedReveals(out);
  });
}

// Pages are emitted flat: method.html → dist/method.html. Cloudflare serves
// each at its extensionless URL (/method) with 200, so the output path is just
// the source path.
function outPathFor(src) {
  return src;
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function formatTitle(page) {
  return `${SITE_NAME} | ${page.title}`;
}

function socialExtraFor(page) {
  if (page.kind !== 'article') return '';
  const section = page.section || 'Academy';
  return `  <meta property="article:published_time" content="${isoDate(ARTICLE_PUBLISHED)}" />
  <meta property="article:modified_time" content="${isoDate(TODAY)}" />
  <meta property="article:section" content="${section}" />`;
}

// Page-specific <head> preloads. The universal above-the-fold fonts (Syne 700,
// DM Sans 400) are static in head.html; this adds only the faces that vary by
// page, so no page preloads a font it does not use above the fold. Today the
// homepage hero <h1> is the sole place Syne 800 appears above the fold. root is
// baked in directly (this string is injected after {{ROOT}} is resolved).
function headPreloadsFor(page) {
  const preloads = [];
  if (page.src === 'index.html') {
    preloads.push(`  <link rel="preload" href="${page.root}public/fonts/syne/syne-800.woff2" as="font" type="font/woff2" crossorigin />`);
  }
  return preloads.join('\n');
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
  const outPath = path.join(DIST, outPathFor(page.src));

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
    // STORIES after CONTENT so the {{STORIES}} placeholder in the page source is
    // expanded here; its inner {{ROUTING_CARD}} is then filled per page below.
    STORIES:       stories,
  });
  const html = replace(assembled, {
    ROOT:      page.root,
    TITLE:     formatTitle(page),
    DESC:      page.desc,
    CANONICAL: canonicalFor(page.src),
    THEME_COLOR: COLORS.light,
    SUBSCRIBE_URL,
    PORTAL_URL,
    OG_TYPE:   page.kind === 'article' ? 'article' : 'website',
    OG_IMAGE,
    OG_IMAGE_ALT,
    SOCIAL_EXTRA: socialExtraFor(page),
    HEAD_PRELOADS: headPreloadsFor(page),
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
      formattedTitle: formatTitle(page),
    }),
    ...TRACK_RECORD,
    ROUTING_CARD: renderRoutingCard(page.routingCard, page.root),
  });

  ensureDir(outPath);
  fs.writeFileSync(outPath, extensionlessLinks(applyScrollReveal(html)), 'utf8');
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

// ─── Generate _redirects ─────────────────────────────────────────────────────
// Cloudflare's built-in .html stripping issues 307 (temporary) redirects.
// Explicit 301 (permanent) redirects take precedence and fix the SEO problem:
// Google stops re-crawling .html URLs and passes PageRank to the canonical form.
const redirectLines = pages
  .filter((p) => p.src !== '404.html')
  .map((p) => {
    const from = `/${p.src}`;
    const to   = canonicalFor(p.src).slice(SITE_URL.length) || '/';
    return `${from} ${to} 301`;
  });

fs.writeFileSync(path.join(DIST, '_redirects'), redirectLines.join('\n') + '\n', 'utf8');
console.log('✓  _redirects generated');

// ─── Generate llms.txt ───────────────────────────────────────────────────────
// Group published pages into sections that mirror the site's breadcrumb
// structure — top-level pages, then Academy / Company / Legal — so llms.txt,
// the nav, and the JSON-LD BreadcrumbList all share one section model. Primary
// Pages holds the marketing pages plus each section's index (the breadcrumb
// position-2 landings); the sub-sections list only their deeper children.
const LLMS_SECTIONS = [
  { key: 'main',    heading: 'Primary Pages' },
  { key: 'academy', heading: 'Academy' },
  { key: 'company', heading: 'Company' },
  { key: 'legal',   heading: 'Legal' },
];

function llmsSectionKey(src) {
  const prefix = src.split('/')[0];
  const isSection = ['academy', 'company', 'legal'].includes(prefix);
  return isSection && !src.endsWith('index.html') ? prefix : 'main';
}

const llmsSections = LLMS_SECTIONS
  .map(({ key, heading }) => {
    const entries = pages
      .filter((p) => p.sitemap !== false && llmsSectionKey(p.src) === key)
      .map((p) => `- ${pageDisplayName(p)}: ${canonicalFor(p.src)}\n  ${p.desc}`)
      .join('\n');
    return `## ${heading}\n\n${entries}`;
  })
  .join('\n\n');

const llms = `# DoubleTrends™

DoubleTrends™ is a rules-based S&P 500 index signal for ETF investors. It tracks the S&P 500 index and publishes a same-day alert to the subscriber portal when its oversold-reversal rule fires. The site also publishes research notes on drawdowns, market exhaustion, investor behavior, and market-structure tools.

Important: the content is educational market information only. It is not financial, investment, trading, tax, or legal advice, and it is not a recommendation to buy, sell, or hold any security.

${llmsSections}

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
fs.copyFileSync(path.join(__dirname, 'src', 'robots.txt'), path.join(DIST, 'robots.txt'));
console.log('✓  robots.txt copied');

fs.copyFileSync(path.join(__dirname, 'src', '_headers'), path.join(DIST, '_headers'));
console.log('✓  _headers copied');

// public/ is copied verbatim EXCEPT the managed rasters, which are re-encoded to
// resized WebP (and carousel thumbnails) — see build-images.js. Async, so it runs
// last as an awaited IIFE and fails the build loudly on any encode error.
(async () => {
  const { fullCount, thumbCount } = await optimizeImages(
    path.join(__dirname, 'public'),
    path.join(DIST, 'public'),
  );
  console.log(`✓  public/ copied + ${fullCount} images → WebP (${thumbCount} carousel thumbnails)`);
})().catch((err) => {
  console.error('✗  image optimization failed');
  console.error(err);
  process.exit(1);
});
