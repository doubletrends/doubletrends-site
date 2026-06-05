/**
 * build.js
 * Assembles final HTML by injecting _partials into each page template, and
 * generates sitemap.xml from the same page list.
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
const {
  SITE_URL,
  SUBSCRIBE_URL,
  WORKER_URL,
  OG_IMAGE,
  OG_IMAGE_ALT,
  PUBLISHER,
  pages,
} = require('./src/site.config');

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
const ARTICLE_PUBLISHED = '2026-05-25';

// ─── Track-record numbers from the backfill ─────────────────────────────────
// Read once at build start so {{TR_*}} placeholders resolve to real numbers in
// static HTML (good for SEO and avoids a flash-of-loading-content). Generated
// by build-replay-data.js — see that file's header for the contract.
const HISTORY_PATH = path.join(__dirname, 'public', 'replay', 'history.json');
const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
const tr = history.metrics_since_replay_start;
const trAll = history.metrics;
const replayStartYear = (history.replay_start_date || tr.first_signal).slice(0, 4);
const TRACK_RECORD = {
  TR_SIGNAL_COUNT: String(tr.total_signals),
  TR_SIGNAL_COUNT_TOTAL: String(trAll.total_signals),
  TR_MEDIAN_1Y_PCT: `+${tr.median_1y_pct}%`,
  TR_POSITIVE_1Y: `${tr.positive_1y_count} of ${tr.matured_1y_count}`,
  TR_REPLAY_RANGE: `${replayStartYear}–${tr.last_signal.slice(0, 4)}`,
};

// ─── Prepare output directory ────────────────────────────────────────────────
const DIST = path.join(__dirname, 'dist');
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// ─── Read partials ────────────────────────────────────────────────────────────
const partialsDir = path.join(__dirname, 'src', '_partials');
const read = (name) => fs.readFileSync(path.join(partialsDir, name), 'utf8');

const layout = read('layout.html');
const head   = replace(read('head.html'), {
  FONTS: read('fonts.html'),
  TAILWIND: read('tailwind.html'),
  STYLES: read('styles.html'),
});
const header = read('header.html');
const footer = read('footer.html');
const checkoutGate = read('checkout-gate.html');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function replace(template, vars) {
  return Object.entries(vars).reduce(
    (str, [k, v]) => str.replaceAll(`{{${k}}}`, v),
    template
  );
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function canonicalFor(src) {
  return `${SITE_URL}/${src.replace(/index\.html$/, '')}`;
}

function pageDisplayName(page) {
  return page.title
    .replace(' — S&P 500 Signals for ETF Investors', '')
    .replace(' | Academy', '')
    .replace(' | DoubleTrends™', '')
    .replace(' — DoubleTrends™', '')
    .replace(' — Research & Education', '')
    .replace(' — Identity & Construction | CDS', '');
}

function socialExtraFor(page) {
  if (page.kind !== 'article') return '';
  return `  <meta property="article:published_time" content="${ARTICLE_PUBLISHED}" />
  <meta property="article:modified_time" content="${TODAY}" />
  <meta property="article:section" content="Academy" />`;
}

function jsonLdFor(page) {
  const canonical = canonicalFor(page.src);
  const isArticle = page.kind === 'article';
  const pageType = page.kind === 'contact'
    ? 'ContactPage'
    : page.kind === 'collection'
      ? 'CollectionPage'
      : 'WebPage';
  const graph = [
    PUBLISHER,
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'DoubleTrends™',
      description: 'Rules-based S&P 500 index alerts and research notes for ETF investors.',
      publisher: { '@id': PUBLISHER['@id'] },
      inLanguage: 'en-US',
    },
    {
      '@type': pageType,
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: page.title,
      description: page.desc,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      about: { '@id': PUBLISHER['@id'] },
      inLanguage: 'en-US',
      dateModified: TODAY,
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonical}#breadcrumb`,
      itemListElement: breadcrumbItems(page),
    },
  ];

  if (page.kind === 'home') {
    graph.push({
      '@type': 'Service',
      '@id': `${SITE_URL}/#service`,
      name: 'DoubleTrends™ S&P 500 Signal',
      serviceType: 'Rules-based S&P 500 index alert',
      provider: { '@id': PUBLISHER['@id'] },
      audience: {
        '@type': 'Audience',
        audienceType: 'ETF investors using S&P 500 exposure such as VOO, SPY, or IVV',
      },
      description: page.desc,
      url: SITE_URL,
    });
  }

  if (page.kind === 'services') {
    graph.push({
      '@type': 'Service',
      '@id': `${canonical}#service`,
      name: 'Data & Quant Services',
      provider: { '@id': PUBLISHER['@id'] },
      serviceType: 'Data engineering, quantitative research, machine learning, forecasting, and data collection',
      description: page.desc,
      url: canonical,
    });
  }

  if (isArticle) {
    graph.push({
      '@type': 'Article',
      '@id': `${canonical}#article`,
      headline: page.title.replace(' | Academy', ''),
      description: page.desc,
      mainEntityOfPage: { '@id': `${canonical}#webpage` },
      author: { '@id': PUBLISHER['@id'] },
      publisher: { '@id': PUBLISHER['@id'] },
      image: {
        '@type': 'ImageObject',
        url: OG_IMAGE,
        width: 1200,
        height: 630,
      },
      articleSection: 'Academy',
      about: [
        'S&P 500 index',
        'ETF investing',
        'market drawdowns',
        'oversold reversal',
      ],
      isAccessibleForFree: true,
      datePublished: ARTICLE_PUBLISHED,
      dateModified: TODAY,
      inLanguage: 'en-US',
    });
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2)
    .replace(/</g, '\\u003c');
}

function breadcrumbItems(page) {
  const parts = page.src.split('/');
  const items = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: SITE_URL,
    },
  ];

  if (parts[0] === 'academy') {
    items.push({
      '@type': 'ListItem',
      position: 2,
      name: 'Academy',
      item: `${SITE_URL}/academy/`,
    });
    if (page.src !== 'academy/index.html') {
      items.push({
        '@type': 'ListItem',
        position: 3,
        name: pageDisplayName(page),
        item: canonicalFor(page.src),
      });
    }
  } else if (page.src !== 'index.html') {
    items.push({
      '@type': 'ListItem',
      position: 2,
      name: pageDisplayName(page),
      item: canonicalFor(page.src),
    });
  }

  return items;
}

// ─── Build pages ────────────────────────────────────────────────────────────────
let built = 0;

for (const page of pages) {
  const srcPath = path.join(__dirname, 'src', 'pages', page.src);
  const outPath = path.join(DIST, page.src);

  if (!fs.existsSync(srcPath)) {
    console.warn(`⚠  Missing source: ${page.src}`);
    continue;
  }

  // Inject the slots first, then resolve {{ROOT}}/{{TITLE}}/etc. across the
  // assembled page — slot contents (head/header/footer) carry those placeholders.
  const assembled = replace(layout, {
    HEAD:          head,
    HEADER:        header,
    FOOTER:        footer,
    CHECKOUT_GATE: checkoutGate,
    CONTENT:       fs.readFileSync(srcPath, 'utf8'),
  });
  const html = replace(assembled, {
    ROOT:      page.root,
    TITLE:     page.title,
    DESC:      page.desc,
    CANONICAL: canonicalFor(page.src),
    SUBSCRIBE_URL,
    WORKER_URL,
    OG_TYPE:   page.kind === 'article' ? 'article' : 'website',
    OG_IMAGE,
    OG_IMAGE_ALT,
    SOCIAL_EXTRA: socialExtraFor(page),
    ROBOTS:    page.robots ?? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',
    JSONLD:    jsonLdFor(page),
    ...TRACK_RECORD,
  });

  ensureDir(outPath);
  fs.writeFileSync(outPath, html, 'utf8');
  built++;
  console.log(`✓  ${page.src}`);
}

console.log(`\nBuild complete — ${built} pages written.`);

// ─── Generate sitemap.xml ────────────────────────────────────────────────────────
const urls = pages
  .filter((p) => p.sitemap !== false)
  .map((p) => `  <url>
    <loc>${canonicalFor(p.src)}</loc>
    <lastmod>${TODAY}</lastmod>
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

DoubleTrends™ is a rules-based S&P 500 index signal for ETF investors. It tracks the S&P 500 index and sends a Telegram alert when its oversold-reversal rule fires. The site also publishes research notes on drawdowns, market exhaustion, investor behavior, and market-structure tools.

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
- Operator: Cheng's Data Service
- Coverage: S&P 500 index
- Intended audience: ETF investors using S&P 500 exposure such as VOO, SPY, or IVV
- Delivery: Telegram alert
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
