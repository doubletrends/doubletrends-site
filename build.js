/**
 * build.js
 * Assembles final HTML by injecting _partials into each page template.
 *
 * Page template placeholders:
 *   {{ROOT}}       - relative path to site root (e.g. "" or "../")
 *   {{TITLE}}      - <title> content
 *   {{DESC}}       - meta description content
 *   {{CANONICAL}}  - canonical URL path
 */

const fs   = require('fs');
const path = require('path');

// ─── Site config ────────────────────────────────────────────────────────────
const SITE_URL = 'https://doubletrends.com';
const TODAY    = new Date().toISOString().split('T')[0];

const pages = [
  {
    src:   'index.html',
    out:   'index.html',
    title: 'Double Trend Exhaustion™ — Precision Market Indicators',
    desc:  'Open-source TradingView indicators built on volume exhaustion and momentum divergence. Identify trend reversals before price action confirms.',
    root:  '',
  },
  {
    src:   'indicator-list.html',
    out:   'indicator-list.html',
    title: 'Indicator List — Double Trend Exhaustion™',
    desc:  'Browse all available TradingView indicators: Double Trend Exhaustion, VWAP, Session Volume Profile, and Maximum Drawdown.',
    root:  '',
  },
  {
    src:   'setup-guide.html',
    out:   'setup-guide.html',
    title: 'Setup Guide — Double Trend Exhaustion™',
    desc:  'Step-by-step guide to installing and using our TradingView indicators. No math degree needed.',
    root:  '',
  },
  {
    src:   'services.html',
    out:   'services.html',
    title: 'Data Services — Double Trend Exhaustion™',
    desc:  'Custom ML model development, statistical analysis, forecasting, and data mining services.',
    root:  '',
  },
  {
    src:   'contact.html',
    out:   'contact.html',
    title: 'Contact — Double Trend Exhaustion™',
    desc:  'Get in touch with questions about our indicators or data services.',
    root:  '',
  },
  {
    src:   '404.html',
    out:   '404.html',
    title: '404 Not Found — Double Trend Exhaustion™',
    desc:  'Page not found.',
    root:  '',
  },
  // ── indicator detail pages ──────────────────────────────────────────────
  {
    src:   'indicators/indicator-dte.html',
    out:   'indicators/indicator-dte.html',
    title: 'Double Trend Exhaustion™ Indicator',
    desc:  'Momentum-based oscillator inspired by TD Sequential. Identifies trend reversals on daily and weekly timeframes.',
    root:  '../',
  },
  {
    src:   'indicators/indicator-dtep.html',
    out:   'indicators/indicator-dtep.html',
    title: 'Double Trend Exhaustion™ Premium Indicator',
    desc:  'Upgraded oscillator built on Williams %R, detecting overbought/oversold conditions with enhanced precision.',
    root:  '../',
  },
  {
    src:   'indicators/indicator-vwap.html',
    out:   'indicators/indicator-vwap.html',
    title: 'Volume Weighted Average Price (VWAP) Indicator',
    desc:  'Session-reset VWAP implementation for TradingView. Optimized for intraday and day trading setups.',
    root:  '../',
  },
  {
    src:   'indicators/indicator-svp.html',
    out:   'indicators/indicator-svp.html',
    title: 'Session Volume Profile Indicator',
    desc:  'Session Volume Profile exposing HVNs and LVNs — critical levels where price is likely to reverse or consolidate.',
    root:  '../',
  },
  {
    src:   'indicators/indicator-mdd.html',
    out:   'indicators/indicator-mdd.html',
    title: 'Maximum Drawdown Threshold Indicator',
    desc:  'Identify historically significant drawdown thresholds for long-term entry and exit timing. Free and open-source.',
    root:  '../',
  },
  // ── checkout pages ─────────────────────────────────────────────────────
  {
    src:   'indicators/checkout-dtep.html',
    out:   'indicators/checkout-dtep.html',
    title: 'Checkout — Double Trend Exhaustion™ Premium',
    desc:  'Secure checkout for Double Trend Exhaustion™ Premium Indicator source code.',
    root:  '../',
  },
  {
    src:   'indicators/checkout-svp.html',
    out:   'indicators/checkout-svp.html',
    title: 'Checkout — Session Volume Profile',
    desc:  'Secure checkout for Session Volume Profile Indicator source code.',
    root:  '../',
  },
  {
    src:   'indicators/checkout-vwap.html',
    out:   'indicators/checkout-vwap.html',
    title: 'Checkout — VWAP Indicator',
    desc:  'Secure checkout for VWAP Indicator source code.',
    root:  '../',
  },
  // ── download pages ─────────────────────────────────────────────────────
  {
    src:   'indicators/download-dte.html',
    out:   'indicators/download-dte.html',
    title: 'Download — Double Trend Exhaustion™',
    desc:  'Download the free Double Trend Exhaustion™ Indicator source code.',
    root:  '../',
  },
  {
    src:   'indicators/download-mdd.html',
    out:   'indicators/download-mdd.html',
    title: 'Download — Maximum Drawdown Threshold',
    desc:  'Download the free Maximum Drawdown Threshold Indicator source code.',
    root:  '../',
  },
  {
    src:   'indicators/download-dtep_purchase_id=0x1a5e6f.html',
    out:   'indicators/download-dtep_purchase_id=0x1a5e6f.html',
    title: 'Download — Double Trend Exhaustion™ Premium',
    desc:  'Download your Double Trend Exhaustion™ Premium Indicator source code.',
    root:  '../',
  },
  {
    src:   'indicators/download-svp_purchase_id=0x4d3c2b.html',
    out:   'indicators/download-svp_purchase_id=0x4d3c2b.html',
    title: 'Download — Session Volume Profile',
    desc:  'Download your Session Volume Profile Indicator source code.',
    root:  '../',
  },
  {
    src:   'indicators/download-vwap_purchase_id=0x6f2b1a.html',
    out:   'indicators/download-vwap_purchase_id=0x6f2b1a.html',
    title: 'Download — VWAP Indicator',
    desc:  'Download your VWAP Indicator source code.',
    root:  '../',
  },
];

// ─── Read partials ───────────────────────────────────────────────────────────
const partialsDir = path.join(__dirname, 'src', '_partials');
const head   = fs.readFileSync(path.join(partialsDir, 'head.html'),   'utf8');
const header = fs.readFileSync(path.join(partialsDir, 'header.html'), 'utf8');
const footer = fs.readFileSync(path.join(partialsDir, 'footer.html'), 'utf8');

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

// ─── Build ───────────────────────────────────────────────────────────────────
let built = 0;

for (const page of pages) {
  const srcPath = path.join(__dirname, 'src', 'pages', page.src);
  const outPath = path.join(__dirname, page.out);

  if (!fs.existsSync(srcPath)) {
    console.warn(`⚠  Missing source: ${page.src}`);
    continue;
  }

  const content = fs.readFileSync(srcPath, 'utf8');
  const canonical = `${SITE_URL}/${page.out.replace('index.html', '')}`;

  const vars = {
    ROOT:      page.root,
    TITLE:     page.title,
    DESC:      page.desc,
    CANONICAL: canonical,
  };

  const html = replace(
    `<!DOCTYPE html>
<html lang="en">
${replace(head, vars)}
<body class="bg-[#080809] text-[#A8BCCC] font-['DM_Sans'] leading-relaxed antialiased">
${replace(header, vars)}
<main>
${content}
</main>
${replace(footer, vars)}
</body>
</html>`,
    vars
  );

  ensureDir(outPath);
  fs.writeFileSync(outPath, html, 'utf8');
  built++;
  console.log(`✓  ${page.out}`);
}

console.log(`\nBuild complete — ${built} pages written.`);

// ─── Update sitemap dates ────────────────────────────────────────────────────
const sitemapPath = path.join(__dirname, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const updated = sitemap.replace(/<lastmod>[^<]+<\/lastmod>/g, `<lastmod>${TODAY}</lastmod>`);
  fs.writeFileSync(sitemapPath, updated, 'utf8');
  console.log('✓  sitemap.xml dates updated');
}
