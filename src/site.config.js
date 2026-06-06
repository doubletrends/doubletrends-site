const SITE_URL = 'https://doubletrends.com';
const SUBSCRIBE_URL = 'https://buy.stripe.com/7sYeVdaq49141uQdJ9aAw0c';
// Cloudflare Worker base URL (no trailing slash).
const WORKER_URL = 'https://api.doubletrends.com';
const OG_IMAGE = `${SITE_URL}/public/brand/og-image.png`;
const OG_IMAGE_ALT = 'CDS logo and DoubleTrends™ tagline';

const PUBLISHER = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: "Cheng's Data Service",
  url: SITE_URL,
  legalName: "Cheng's Data Service",
  description: 'Operator of DoubleTrends™, a rules-based S&P 500 index signal and research site for ETF investors.',
  email: 'info@doubletrends.com',
  logo: {
    '@type': 'ImageObject',
    url: `${SITE_URL}/public/brand/cds-wordmark-light.png`,
    width: 1024,
    height: 1024,
  },
  brand: {
    '@type': 'Brand',
    name: 'DoubleTrends™',
  },
  knowsAbout: [
    'S&P 500 index',
    'ETF investing',
    'market drawdowns',
    'oversold reversal signals',
    'quantitative research',
  ],
};

const pages = [
  {
    src: 'index.html', root: '', priority: 1.0, kind: 'home',
    title: 'S&P 500 Signal for ETF Investors | DoubleTrends™',
    desc:  'A rules-based S&P 500 signal built for ETF investors using VOO, SPY, or IVV. Review the live replay, inspect every dated signal, and test the Telegram bot in your browser.',
    routingCard: {
      pill: '/METHOD',
      headline: 'Now look under the hood.',
      body: 'You have seen the outcome surface and the historical proof. The next page shows the decision stack itself: what the rule reads, how the market gets classified, and what has to clear before a signal is allowed to fire.',
      route: 'Outcome  &rarr;  Method',
      routeDesc: 'Move from signal evidence to execution logic.',
      href: 'method.html',
      cta: 'Enter how it works',
      footerLabel: 'THE ENGINE BEHIND.',
    },
  },
  {
    src: 'method.html', root: '', priority: 0.9, kind: 'webpage',
    title: 'How the DoubleTrends™ S&P 500 Signal Works',
    desc:  'See how the DoubleTrends™ S&P 500 signal works: dual-period Williams %R, drawdown features, VIX and macro anchors, four market regimes, and the point-in-time rules behind the track record.',
    routingCard: {
      pill: '/PRODUCT',
      headline: 'Institutional-grade signal. Retail access.',
      body: 'The engine is built to institutional standards, but access is not reserved for institutions. The next page shows how a retail subscriber can use the bot directly, what gets delivered, and what the terms look like in practice.',
      route: 'Method  &rarr;  Product',
      routeDesc: 'From rule logic to live access.',
      href: 'product.html',
      cta: 'SEE THE PRODUCT',
      footerLabel: 'TRY IT YOURSELF.',
    },
  },
  {
    src: 'product.html', root: '', priority: 0.9, kind: 'webpage',
    title: 'DoubleTrends™ Pricing, Trial, and Telegram Delivery',
    desc:  'See DoubleTrends™ pricing at USD $149 per year, the 30-day free trial, refund rules, private Telegram delivery, and what subscribers receive before they buy.',
    schema: {
      faq: [
        {
          q: 'What exactly do I receive?',
          a: 'A Telegram direct message on signal day, plus a private bot you can query anytime for the current market read, signal history, and subscription status.',
        },
        {
          q: 'How often will it fire?',
          a: 'Rarely. Since 2016, the S&P 500 index version has produced a small number of signals. Some years have several and some have none.',
        },
        {
          q: 'Is this financial advice?',
          a: 'No. DoubleTrends™ provides educational, rules-based market information only. It is not a recommendation to buy, sell, or hold any security.',
        },
        {
          q: 'What does DoubleTrends™ measure?',
          a: 'A regime filter plus a dual Williams %R reversal rule on the daily S&P 500. It only fires in panic or bear regimes, with bear-market reversals filtered harder.',
        },
        {
          q: 'Which assets are covered?',
          a: 'The S&P 500 index today. ETF investors can express it with VOO, SPY, or IVV. Nasdaq 100 support, including QQQ, is planned.',
        },
        {
          q: 'Does a signal mean I should buy immediately?',
          a: 'No. A signal is a timing reference, not a personal recommendation. Some investors use it to review a planned contribution or staged entry, while others do nothing.',
        },
        {
          q: 'How do I get access after paying?',
          a: 'Right after checkout, you use a one-time activation link that opens the Telegram bot, binds your subscription to your Telegram account, and enables direct delivery.',
        },
      ],
    },
  },
  {
    src: 'academy/index.html', root: '../', priority: 0.9, kind: 'collection',
    title: 'Academy — Research & Education | DoubleTrends™',
    desc:  'Research notes on S&P 500 drawdowns and investor behavior, primers on the standard tools the engine uses (Williams %R, drawdown, volume profile), and one article per macro anchor (VIX, Fed funds, unemployment, CPI).',
  },

  // ── company ───────────────────────────────────────────────────────────────
  {
    src: 'company/mission.html', root: '../', priority: 0.5, kind: 'webpage',
    title: 'Mission — DoubleTrends™',
    desc:  'Why DoubleTrends™ exists and the principles behind it: one transparent, rule-based oversold-reversal signal — transparency over hype, education over dependency, narrow over vague.',
  },
  {
    src: 'company/consulting.html', root: '../', priority: 0.6, kind: 'services',
    title: 'Consulting — DoubleTrends™',
    desc:  'The data engineering and quantitative research behind DoubleTrends™, available for custom projects: ML modelling, statistical analysis, forecasting, and data collection.',
  },
  {
    src: 'company/careers.html', root: '../', priority: 0.5, kind: 'webpage',
    title: 'Careers — DoubleTrends™',
    desc:  'The three long-term functions we expect to build around at DoubleTrends™: Quantitative Analyst, Data Engineer, and Audience & Partnerships Lead. Not currently hiring.',
  },
  {
    src: 'company/contact.html', root: '../', priority: 0.6, kind: 'contact',
    title: 'Contact — DoubleTrends™',
    desc:  'Contact DoubleTrends™ for product questions, data and quant service inquiries, research questions, partnerships, or company matters.',
  },
  {
    src: 'brand.html', root: '', priority: 0.3, kind: 'webpage',
    title: 'Brand — Identity & Construction | CDS',
    desc:  'How the CDS logo and favicon are constructed: four geometric constraints that lock the rust bar to S, a bracket scale that aligns the inner cavity with the letter range, color palette, typography, and asset inventory.',
  },

  // ── legal ────────────────────────────────────────────────────────────────
  {
    src: 'legal/refund-policy.html', root: '../', priority: 0.4, kind: 'webpage',
    title: 'Free Trial & Refunds — DoubleTrends™',
    desc:  'DoubleTrends™ starts with a 30-day free trial — $0 today, cancel anytime. After that, a full refund within 14 days of any charge if no signal has fired.',
  },
  {
    src: 'legal/terms.html', root: '../', priority: 0.3, kind: 'webpage',
    title: 'Terms of Service — DoubleTrends™',
    desc:  'The terms for using the DoubleTrends™ website and subscription: billing, acceptable use, disclaimers, and limitation of liability. Governed by Ontario law.',
  },
  {
    src: 'legal/privacy.html', root: '../', priority: 0.3, kind: 'webpage',
    title: 'Privacy Policy — DoubleTrends™',
    desc:  'How DoubleTrends™ handles your data: no cookies, no analytics, no tracking — only the minimum needed to bill via Stripe and deliver the Telegram signal.',
  },
  {
    src: 'legal/disclaimer.html', root: '../', priority: 0.3, kind: 'webpage',
    title: 'Disclaimer — DoubleTrends™',
    desc:  'DoubleTrends™ provides educational, rules-based market information only — not financial, investment, trading, tax, or legal advice. Trading involves risk.',
  },

  // ── utility pages ────────────────────────────────────────────────────────
  {
    src: '404.html', root: '/', sitemap: false, kind: 'webpage', robots: 'noindex,follow',
    title: '404 Not Found — DoubleTrends™',
    desc:  'Page not found.',
  },
  {
    src: 'success.html', root: '', sitemap: false, kind: 'webpage', robots: 'noindex,follow',
    title: 'You\'re Subscribed — DoubleTrends™',
    desc:  'Your DoubleTrends™ subscription is active. Activate the Telegram bot to start receiving signals.',
  },

  // ── academy: articles ────────────────────────────────────────────────────
  {
    src: 'academy/sp-500-drawdowns.html', root: '../', priority: 0.8, kind: 'article',
    title: 'S&P 500 Drawdowns Since 1950: How Often Corrections and Bear Markets Happen | Academy',
    desc:  'How often the S&P 500 falls 5%, 10%, 20%, and 30% since 1950, how long recovery usually takes, and what those drawdown base rates mean for buying the dip.',
    schema: { articleSection: 'Market History', about: ['S&P 500 index', 'ETF investing', 'market drawdowns'] },
  },
  {
    src: 'academy/why-buying-the-dip-is-hard.html', root: '../', priority: 0.8, kind: 'article',
    title: 'Why Buying the Dip Is Hard: The Best Days Happen During Crashes | Academy',
    desc:  'Why buying the dip feels hardest when expected returns improve: the S&P 500\'s best days cluster inside crashes, and missing a few of them changes long-run results.',
    schema: { articleSection: 'Investor Behavior', about: ['S&P 500 index', 'ETF investing', 'buying the dip'] },
  },
  {
    src: 'academy/every-sp-500-bottom-since-2016.html', root: '../', priority: 0.8, kind: 'article',
    title: 'Every DoubleTrends™ S&P 500 Signal Since 2016 | Academy',
    desc:  'Every DoubleTrends™ signal on the S&P 500 since 2016, the regime and drawdown around each fire, and the forward returns that followed.',
    schema: { articleSection: 'Track Record', about: ['S&P 500 index', 'ETF investing'] },
  },

  // ── academy: methods ─────────────────────────────────────────────────────
  {
    src: 'academy/volume-profile-vwap.html', root: '../', priority: 0.7, kind: 'article',
    title: 'What Are Volume Profile and VWAP? | Academy',
    desc:  'A plain-English primer on Volume Profile and VWAP: what each tool measures, how institutional desks use them, and where they fit in market structure.',
    schema: { articleSection: 'Liquidity', about: ['S&P 500 index', 'ETF investing', 'market structure'] },
  },
  {
    src: 'academy/double-trend-exhaustion.html', root: '../', priority: 0.7, kind: 'article',
    title: 'What Is Double Trend Exhaustion? The DoubleTrends™ Signal Explained | Academy',
    desc:  'What double trend exhaustion means in DoubleTrends™: dual-period Williams %R on a short and long clock, both turning up out of deep oversold territory.',
    schema: { articleSection: 'The Engine', about: ['S&P 500 index', 'ETF investing', 'oversold reversal'] },
  },
  {
    src: 'academy/maximum-drawdown.html', root: '../', priority: 0.7, kind: 'article',
    title: 'What Is Maximum Drawdown? Depth, Duration, and Sharpness | Academy',
    desc:  'What maximum drawdown means for market stress: drawdown depth from the trailing one-year high, duration since that high, and ten-day sharpness.',
    schema: { articleSection: 'Stress Lens', about: ['S&P 500 index', 'ETF investing', 'market drawdowns'] },
  },

  // ── academy: macro anchors ──────────────────────────────────────────────
  {
    src: 'academy/vix-percentile.html', root: '../', priority: 0.7, kind: 'article',
    title: 'What Is VIX Percentile? Reading Volatility Against Itself | Academy',
    desc:  'What VIX percentile means, why it is more useful than the raw VIX level, and how DoubleTrends™ uses it inside the market regime classifier.',
    schema: { articleSection: 'Volatility', about: ['S&P 500 index', 'ETF investing', 'volatility'] },
  },
  {
    src: 'academy/fed-funds-rate.html', root: '../', priority: 0.7, kind: 'article',
    title: 'What Is the Fed Funds Rate and Why Does It Matter for Stocks? | Academy',
    desc:  'What the fed funds rate is, why its recent change matters more than the level, and how DoubleTrends™ uses it inside the bear-regime overlay.',
    schema: { articleSection: 'Interest Rate', about: ['S&P 500 index', 'ETF investing', 'Federal Reserve policy'] },
  },
  {
    src: 'academy/unemployment.html', root: '../', priority: 0.7, kind: 'article',
    title: 'Why the Unemployment Rate Matters for Market Regimes | Academy',
    desc:  'Why the US unemployment rate lags but rarely gives false positives, how DoubleTrends™ reads its slope, and where it fits inside the bear overlay.',
    schema: { articleSection: 'Labor', about: ['S&P 500 index', 'ETF investing', 'labor market'] },
  },
  {
    src: 'academy/cpi-inflation.html', root: '../', priority: 0.7, kind: 'article',
    title: 'What CPI Inflation Tells You About Fed Pressure | Academy',
    desc:  'Why year-over-year CPI matters as context for Fed policy, and how DoubleTrends™ reads high inflation together with active tightening inside the bear gate.',
    schema: { articleSection: 'Inflation', about: ['S&P 500 index', 'ETF investing', 'Federal Reserve policy', 'inflation'] },
  },
];

module.exports = {
  SITE_URL,
  SUBSCRIBE_URL,
  WORKER_URL,
  OG_IMAGE,
  OG_IMAGE_ALT,
  PUBLISHER,
  pages,
};
