const SITE_URL = 'https://doubletrends.com';
const SUBSCRIBE_URL = 'https://buy.stripe.com/7sYeVdaq49141uQdJ9aAw0c';
const PORTAL_URL = 'https://app.doubletrends.com/brief';
const OG_IMAGE = `${SITE_URL}/public/brand/og-image.png`;
const OG_IMAGE_ALT = 'DoubleTrends — Market Regime Research';

const PUBLISHER = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: 'DoubleTrends L.L.C.',
  url: SITE_URL,
  legalName: 'DoubleTrends L.L.C.',
  description: 'Publisher of the DoubleTrends Regime Indicator, a rules-based daily classification of U.S. equity market stress, and of research on S&P 500 drawdowns and market regimes.',
  email: 'info@doubletrends.com',
  logo: {
    '@type': 'ImageObject',
    url: `${SITE_URL}/public/brand/wordmark-light.png`,
    width: 1024,
    height: 160,
  },
  brand: {
    '@type': 'Brand',
    name: 'DoubleTrends',
  },
  sameAs: [
    'https://www.crunchbase.com/organization/doubletrends-l-l-c',
    'https://wellfound.com/company/doubletrends-llc',
    'https://www.producthunt.com/products/doubletrends',
  ],
  knowsAbout: [
    'S&P 500 index',
    'market regimes',
    'market drawdowns',
    'oversold reversal signals',
    'quantitative research',
  ],
};

// Pages are emitted flat: method.html → dist/method.html. Cloudflare serves
// each at its extensionless URL (/method) with 200, so the output path is just
// the source path.
function outPathFor(src) {
  return src;
}

function rootFor(src) {
  const depth = outPathFor(src).split('/').length - 1;
  return depth === 0 ? '' : '../'.repeat(depth);
}

function page(src, overrides = {}) {
  return { src, root: rootFor(src), priority: 0.7, kind: 'webpage', ...overrides };
}

// Research notes. `section` is the topic (shown in the dateline and kicker),
// `series` groups the library, `published` is the date the note first shipped
// (from version history) and feeds the dateline + JSON-LD.
function article(slug, { published, ...overrides }) {
  return page(`research/${slug}.html`, {
    kind: 'article',
    nav: 'research',
    priority: 0.7,
    ...overrides,
    schema: { ...(overrides.schema || {}), datePublished: published },
  });
}

function companyPage(slug, overrides = {}) {
  return page(`company/${slug}.html`, { priority: 0.5, ...overrides });
}

function legalPage(slug, overrides = {}) {
  return page(`legal/${slug}.html`, { priority: 0.3, ...overrides });
}

const pages = [
  page('index.html', {
    priority: 1.0,
    kind: 'home',
    nav: 'home',
    title: 'Quantitative Market Research',
    desc:  'DoubleTrends is an independent quantitative research firm studying market regimes, drawdowns and investor behavior. It publishes its research and the DoubleTrends Regime Indicator openly, and offers research and data engineering services.',
  }),
  page('indicator.html', {
    priority: 0.9,
    nav: 'indicator',
    title: 'The DoubleTrends Regime Indicator',
    crumb: 'Indicator',
    desc:  'The DoubleTrends Regime Indicator: a rules-based daily classification of S&P 500 market stress — calm, correction, panic, bear — with a reversal signal eligible only under stress. Published as research, with history from December 1995.',
  }),
  page('method.html', {
    priority: 0.9,
    nav: 'methodology',
    title: 'Methodology',
    crumb: 'Methodology',
    schema: { breadcrumbs: [{ name: 'Indicator', url: '/indicator' }, { name: 'Methodology', url: '/method' }] },
    desc:  'How the DoubleTrends Regime Indicator is constructed: data inputs, derived measures, the four-state regime classification, signal eligibility and confirmation, publication timing, and point-in-time validation.',
  }),
  page('data.html', {
    priority: 0.9,
    nav: 'data',
    schema: { breadcrumbs: [{ name: 'Indicator', url: '/indicator' }, { name: 'Historical data', url: '/data' }] },
    title: 'Historical Data: Regimes and Signals Since 1995',
    crumb: 'Historical data',
    desc:  'Every DoubleTrends signal since 1998 with 3-month, 1-year and 2-year S&P 500 forward returns, the regime mix by year since 1996, regime statistics, and a CSV download.',
  }),
  page('product.html', {
    priority: 0.9,
    kind: 'product',
    nav: 'subscription',
    title: 'Subscriber Access',
    crumb: 'Subscriber access',
    desc:  'Subscriber access to the daily DoubleTrends regime reading and same-day signals. The USD 149 annual fee covers the infrastructure that computes and delivers the reading; 30-day free trial and a refund window.',
    schema: {
      breadcrumbs: [{ name: 'Indicator', url: '/indicator' }, { name: 'Subscriber access', url: '/product' }],
      productName: 'DoubleTrends Regime Indicator — Annual Subscription',
      price: '149.00',
      monthlyPrice: 12.42,
      priceCurrency: 'USD',
    },
  }),
  page('alphaverify/index.html', {
    priority: 0.9,
    nav: 'validation',
    series: 'Software',
    section: 'Signal validation',
    title: 'AlphaVerify: Open-Source Signal Validation',
    crumb: 'AlphaVerify',
    desc:  'AlphaVerify, an open-source framework from DoubleTrends that tests whether a trading signal beats 1,000 markets containing no signal. Python package, CC0 license, full mathematical specification.',
    schema: { datePublished: '2026-09-20' },
  }),
  page('alphaverify/method.html', {
    priority: 0.7,
    nav: 'validation',
    title: 'AlphaVerify Method: Surfaces, Scores and the Null',
    crumb: 'Method',
    desc:  'How AlphaVerify measures a condition: barrier-touch probability surfaces, baseline subtraction, the mirror-asymmetry score, the memoryless synthetic-market null, the Monte Carlo p-value, selection with Benjamini-Hochberg context, and naive Bayes combination.',
  }),
  page('alphaverify/findings.html', {
    priority: 0.7,
    nav: 'validation',
    title: 'AlphaVerify Findings: Four Popular Signals on the NASDAQ',
    crumb: 'Findings',
    desc:  'The golden cross, price above the 200-day average, and low and moderate bond yields, tested on the NASDAQ Composite since 2015 against 1,000 synthetic markets. None clears.',
  }),
  page('alphaverify/workspaces.html', {
    priority: 0.6,
    nav: 'validation',
    title: 'AlphaVerify Workspaces: NASDAQ and Bitcoin',
    crumb: 'Workspaces',
    desc:  'The three workspaces shipped with AlphaVerify (NASDAQ daily, bitcoin daily and bitcoin hourly): data sources, test grids and the feature families each one tests.',
  }),
  page('research/index.html', {
    priority: 0.9,
    kind: 'collection',
    nav: 'research',
    title: 'Research',
    desc:  'DoubleTrends research notes: studies of S&P 500 drawdowns and investor behavior, primers on the measures behind the indicator, and one note per macro input (VIX, Fed funds, unemployment, CPI).',
  }),
  page('company/index.html', {
    priority: 0.6,
    kind: 'collection',
    title: 'About DoubleTrends',
    desc:  'About DoubleTrends L.L.C.: what the firm publishes, the principles behind the indicator, research services, careers and contact.',
  }),
  page('legal/index.html', {
    priority: 0.4,
    kind: 'collection',
    title: 'Legal',
    desc:  'The documents that govern the DoubleTrends website and subscription: Terms of Service, Privacy Policy, Refund Policy and Disclaimer.',
  }),

  // ── about ─────────────────────────────────────────────────────────────────
  companyPage('mission', {
    kind: 'about',
    title: 'Principles',
    desc:  'The principles behind the DoubleTrends Regime Indicator: published rules, a complete public record, one narrow question answered well, and education over dependency.',
  }),
  companyPage('consulting', {
    priority: 0.8,
    kind: 'services',
    title: 'Research Services',
    desc:  'Quantitative research and data engineering from the team behind the DoubleTrends Regime Indicator: market data pipelines, statistical studies, forecasting and model validation.',
  }),
  companyPage('careers', {
    title: 'Careers',
    desc:  'Careers at DoubleTrends: how the firm hires, the roles it expects to add, and how to send a speculative application.',
  }),
  companyPage('contact', {
    priority: 0.6,
    kind: 'contact',
    title: 'Contact',
    desc:  'Contact DoubleTrends for subscription questions, research services inquiries, press and partnerships, or legal and privacy matters.',
  }),

  // ── legal ────────────────────────────────────────────────────────────────
  legalPage('refund-policy', {
    priority: 0.4,
    title: 'Refund Policy',
    desc:  'The DoubleTrends subscription begins with a 30-day free trial. After that, a full refund is available within 14 days of any charge if no signal has been delivered.',
  }),
  legalPage('terms', {
    title: 'Terms of Service',
    desc:  'The terms for using the DoubleTrends website and subscription: billing, acceptable use, disclaimers and limitation of liability. Governed by Ontario law.',
  }),
  legalPage('privacy', {
    title: 'Privacy Policy',
    desc:  'How DoubleTrends handles personal data: no cookies, analytics or tracking on this website; only what is needed to bill through Stripe and authenticate subscriber access.',
  }),
  legalPage('disclaimer', {
    title: 'Disclaimer',
    desc:  'DoubleTrends provides educational, rules-based market information only — not financial, investment, trading, tax or legal advice. Investing involves risk.',
  }),

  // ── utility pages ────────────────────────────────────────────────────────
  page('404.html', {
    root: '/',
    sitemap: false,
    robots: 'noindex,follow',
    title: 'Page Not Found',
    desc:  'Page not found.',
  }),
  page('success.html', {
    sitemap: false,
    robots: 'noindex,follow',
    nav: 'subscription',
    title: 'Subscription Confirmed',
    desc:  'Your DoubleTrends subscription is active. Check your email for the sign-in link to the subscriber portal.',
  }),

  // ── research: studies ────────────────────────────────────────────────────
  article('sp-500-drawdowns', {
    published: '2026-05-25',
    series: 'Studies',
    priority: 0.8,
    title:   'S&P 500 Drawdowns Since 1950: How Often Corrections and Bear Markets Happen',
    crumb:   'S&P 500 drawdowns since 1950',
    section: 'Market History',
    desc:  'How often the S&P 500 falls 5%, 10%, 20% and 30% since 1950, how long recovery usually takes, and what those base rates mean for buying the dip.',
    schema: { about: ['S&P 500 index', 'market drawdowns'] },
  }),
  article('why-buying-the-dip-is-hard', {
    published: '2026-05-25',
    series: 'Studies',
    priority: 0.8,
    title:   'Why Buying the Dip Is Hard: The Best Days Happen During Crashes',
    crumb:   'Why buying the dip is hard',
    section: 'Investor Behavior',
    desc:  'Why buying the dip feels hardest when expected returns improve: the S&P 500\'s best days cluster inside crashes, and missing a few of them changes long-run results.',
    schema: { about: ['S&P 500 index', 'investor behavior', 'buying the dip'] },
  }),
  article('every-sp-500-bottom-since-2016', {
    published: '2026-05-25',
    series: 'Studies',
    priority: 0.8,
    title:   'Every DoubleTrends Signal on the S&P 500 Since July 2016',
    crumb:   'Every signal since July 2016',
    section: 'Track Record',
    desc:  'Every DoubleTrends signal on the S&P 500 since July 2016, the regime and drawdown around each, and the forward returns that followed.',
    schema: { about: ['S&P 500 index', 'oversold reversal'] },
  }),

  // ── research: primers ────────────────────────────────────────────────────
  article('double-trend-exhaustion', {
    published: '2026-05-25',
    series: 'Primers',
    title:   'Double Trend Exhaustion: The Signal Explained',
    crumb:   'Double trend exhaustion',
    section: 'The Signal',
    desc:  'What double trend exhaustion means: a dual-period Williams %R on a short and a long horizon, both turning up out of deeply oversold territory.',
    schema: { about: ['S&P 500 index', 'oversold reversal', 'Williams %R'] },
  }),
  article('maximum-drawdown', {
    published: '2026-05-25',
    series: 'Primers',
    title:   'Maximum Drawdown: Depth, Duration and Sharpness',
    crumb:   'Maximum drawdown',
    section: 'Drawdown',
    desc:  'What maximum drawdown means for market stress: depth below the trailing one-year high, time since that high, and ten-day sharpness.',
    schema: { about: ['S&P 500 index', 'market drawdowns'] },
  }),
  article('volume-profile-vwap', {
    published: '2026-05-25',
    series: 'Primers',
    title:   'Volume Profile and VWAP',
    crumb:   'Volume profile and VWAP',
    section: 'Market Structure',
    desc:  'A plain-English primer on volume profile and VWAP: what each measures, how institutional desks use them, and where they fit in market structure.',
    schema: { about: ['S&P 500 index', 'market structure'] },
  }),

  // ── research: macro inputs ──────────────────────────────────────────────
  article('vix-percentile', {
    published: '2026-06-06',
    series: 'Macro inputs',
    title:   'VIX Percentile: Reading Volatility Against Itself',
    crumb:   'VIX percentile',
    section: 'Volatility',
    desc:  'What VIX percentile means, why it is more informative than the raw VIX level, and how the regime classification uses it.',
    schema: { about: ['S&P 500 index', 'volatility'] },
  }),
  article('fed-funds-rate', {
    published: '2026-06-06',
    series: 'Macro inputs',
    title:   'The Fed Funds Rate and Equity Market Regimes',
    crumb:   'Fed funds rate',
    section: 'Interest Rates',
    desc:  'What the federal funds rate is, why its recent change matters more than its level, and how the bear-regime overlay reads it.',
    schema: { about: ['S&P 500 index', 'Federal Reserve policy'] },
  }),
  article('unemployment', {
    published: '2026-06-06',
    series: 'Macro inputs',
    title:   'Why the Unemployment Rate Matters for Market Regimes',
    crumb:   'Unemployment',
    section: 'Labor Market',
    desc:  'Why the U.S. unemployment rate lags but rarely gives false alarms, how its slope is read, and where it fits in the bear-regime overlay.',
    schema: { about: ['S&P 500 index', 'labor market'] },
  }),
  article('cpi-inflation', {
    published: '2026-06-06',
    series: 'Macro inputs',
    title:   'CPI Inflation and Federal Reserve Pressure',
    crumb:   'CPI inflation',
    section: 'Inflation',
    desc:  'Why year-over-year CPI matters as context for Federal Reserve policy, and how high inflation combined with active tightening enters the bear-regime overlay.',
    schema: { about: ['S&P 500 index', 'Federal Reserve policy', 'inflation'] },
  }),
];

const SITE_NAME = 'DoubleTrends';
const SITE_DESCRIPTION = 'DoubleTrends is an independent quantitative research firm: research on market regimes and drawdowns, the DoubleTrends Regime Indicator, and research services.';

module.exports = {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  SUBSCRIBE_URL,
  PORTAL_URL,
  OG_IMAGE,
  OG_IMAGE_ALT,
  PUBLISHER,
  pages,
};
