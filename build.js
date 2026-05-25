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
 *   {{HEAD}} {{HEADER}} {{CONTENT}} {{FOOTER}} - layout slots
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

// ─── Site config ────────────────────────────────────────────────────────────
const SITE_URL = 'https://doubletrends.com';
const TODAY    = new Date().toISOString().split('T')[0];
const SUBSCRIBE_URL = 'https://buy.stripe.com/PLACEHOLDER_SUBSCRIPTION';
const OG_IMAGE = `${SITE_URL}/public/decor/hero.png`;
const PUBLISHER = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: 'CDS Sole Prop',
  url: SITE_URL,
  logo: {
    '@type': 'ImageObject',
    url: `${SITE_URL}/public/brand/cds-logo.png`,
  },
  brand: {
    '@type': 'Brand',
    name: 'DoubleTrends™',
  },
};

const pages = [
  {
    src: 'index.html', root: '', priority: 1.0, kind: 'home',
    title: 'DoubleTrends™ — S&P 500 Signals for ETF Investors',
    desc:  'A rules-based S&P 500 index signal for ETF investors. DoubleTrends™ sends a Telegram alert when its oversold-reversal model fires for investors using funds such as VOO, SPY, or IVV.',
  },
  {
    src: 'academy/index.html', root: '../', priority: 0.9, kind: 'collection',
    title: 'Academy — Research & Education | DoubleTrends™',
    desc:  'Research notes on S&P 500 drawdowns, market exhaustion, investor behavior, volume structure, and the concepts behind the DoubleTrends™ signal.',
  },

  // ── company ───────────────────────────────────────────────────────────────
  {
    src: 'company/services.html', root: '../', priority: 0.6, kind: 'services',
    title: 'Data & Quant Services — DoubleTrends™',
    desc:  'The data engineering and quantitative research behind DoubleTrends™, available for custom projects: ML modelling, statistical analysis, forecasting, and data collection.',
  },
  {
    src: 'company/careers.html', root: '../', priority: 0.5, kind: 'webpage',
    title: 'Careers — DoubleTrends™',
    desc:  'Roles we expect to grow into — Research Analyst, Data Scientist, and Sales. Not currently hiring, but open applications are welcome.',
  },
  {
    src: 'company/contact.html', root: '../', priority: 0.6, kind: 'contact',
    title: 'Contact — DoubleTrends™',
    desc:  'Contact DoubleTrends™ for product questions, data and quant service inquiries, research questions, partnerships, or company matters.',
  },

  {
    src: '404.html', root: '', sitemap: false, kind: 'webpage', robots: 'noindex,follow',
    title: '404 Not Found — DoubleTrends™',
    desc:  'Page not found.',
  },

  // ── academy: articles ───────────────────────────────────────────────────────
  {
    src: 'academy/sp-500-drawdowns.html', root: '../', priority: 0.8, kind: 'article',
    title: 'How Often Does the S&P 500 Dip — and How Deep? | Academy',
    desc:  'Seventy-six years of S&P 500 data: how often corrections and bear markets hit, how deep they go, how long recovery takes — and what it means for buying the dip.',
  },
  {
    src: 'academy/why-buying-the-dip-is-hard.html', root: '../', priority: 0.8, kind: 'article',
    title: 'Why Buying the Dip Is So Hard — and How to Automate It | Academy',
    desc:  'The best market days happen during crashes — all 10 of the S&P 500\'s best days since 2000 came while it was already down 10%+. Why dip-buying fails, and how a rule fixes it.',
  },
  {
    src: 'academy/every-sp-500-bottom-since-2016.html', root: '../', priority: 0.8, kind: 'article',
    title: 'Every S&P 500 Bottom Since 2016 — and What They Had in Common | Academy',
    desc:  'All 12 DoubleTrends™ signals on the S&P 500 index, the drawdown at each, and the returns that followed — median +14.6% over 12 months — with an honest look at where it misfired.',
  },

  // ── academy: methods ────────────────────────────────────────────────────────
  {
    src: 'academy/volume-profile-vwap.html', root: '../', priority: 0.7, kind: 'article',
    title: 'Volume Profile & VWAP, Explained | Academy',
    desc:  'A plain-English primer on two standard volume tools: Volume Profile (volume traded at each price level) and VWAP (the volume-weighted average price benchmark).',
  },
  {
    src: 'academy/double-trend-exhaustion.html', root: '../', priority: 0.7, kind: 'article',
    title: 'The DoubleTrends™ Signal — Double Trend Exhaustion, Explained | Academy',
    desc:  'How the DoubleTrends™ signal works: a double trend exhaustion model built on dual-period Williams %R, flagging when a selloff\'s downside momentum is exhausted.',
  },
  {
    src: 'academy/maximum-drawdown.html', root: '../', priority: 0.7, kind: 'article',
    title: 'Maximum Drawdown — Original Research | Academy',
    desc:  'Our own percentile-of-history measure of how cheap price is versus its own past — a layered, multi-timeframe read of market stress that underpins the dip thesis.',
  },
];

// ─── Read partials ────────────────────────────────────────────────────────────
const partialsDir = path.join(__dirname, 'src', '_partials');
const read = (name) => fs.readFileSync(path.join(partialsDir, name), 'utf8');

const layout = read('layout.html');
const head   = read('head.html');
const header = read('header.html');
const footer = read('footer.html');

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
      image: OG_IMAGE,
      datePublished: '2026-05-25',
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
        name: page.title.replace(' | Academy', ''),
        item: canonicalFor(page.src),
      });
    }
  } else if (parts[0] === 'company') {
    items.push({
      '@type': 'ListItem',
      position: 2,
      name: 'Company',
      item: canonicalFor(page.src),
    });
  }

  return items;
}

// ─── Build pages ────────────────────────────────────────────────────────────────
let built = 0;

for (const page of pages) {
  const srcPath = path.join(__dirname, 'src', 'pages', page.src);
  const outPath = path.join(__dirname, page.src);

  if (!fs.existsSync(srcPath)) {
    console.warn(`⚠  Missing source: ${page.src}`);
    continue;
  }

  // Inject the slots first, then resolve {{ROOT}}/{{TITLE}}/etc. across the
  // assembled page — slot contents (head/header/footer) carry those placeholders.
  const assembled = replace(layout, {
    HEAD:    head,
    HEADER:  header,
    FOOTER:  footer,
    CONTENT: fs.readFileSync(srcPath, 'utf8'),
  });
  const html = replace(assembled, {
    ROOT:      page.root,
    TITLE:     page.title,
    DESC:      page.desc,
    CANONICAL: canonicalFor(page.src),
    SUBSCRIBE_URL,
    OG_TYPE:   page.kind === 'article' ? 'article' : 'website',
    OG_IMAGE,
    ROBOTS:    page.robots ?? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',
    JSONLD:    jsonLdFor(page),
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

fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap, 'utf8');
console.log('✓  sitemap.xml generated');
