const SITE_URL = 'https://doubletrends.com';
const SUBSCRIBE_URL = 'https://buy.stripe.com/7sYeVdaq49141uQdJ9aAw0c';
// Cloudflare Worker base URL (no trailing slash).
const WORKER_URL = 'https://api.doubletrends.com';
const OG_IMAGE = `${SITE_URL}/public/brand/og-image.png`;
const OG_IMAGE_ALT = 'CDS logo and DoubleTrends tagline';

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
    title: 'DoubleTrends™ — S&P 500 Signals for ETF Investors',
    desc:  'A rules-based S&P 500 signal for ETF investors. See the ten-year replay with every signal, try the Telegram bot in your browser, and view real /history forward returns. Built for VOO, SPY, IVV.',
  },
  {
    src: 'method.html', root: '', priority: 0.9, kind: 'webpage',
    title: 'How It Works — DoubleTrends™',
    desc:  'What the DoubleTrends™ rule actually looks at: dual-period Williams %R as the engine, derived price features, macro anchoring via VIX and FRED series, four-regime classification, and the point-in-time discipline behind the track record.',
  },
  {
    src: 'product.html', root: '', priority: 0.9, kind: 'webpage',
    title: 'Product — DoubleTrends™',
    desc:  'How the DoubleTrends™ subscription works in three steps, the $149/year pricing with a 30-day free trial and full-refund window, and answers to the questions investors ask before subscribing.',
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
    title: 'How Often Does the S&P 500 Dip — and How Deep? | Academy',
    desc:  'Seventy-six years of S&P 500 data: how often corrections and bear markets hit, how deep they go, how long recovery takes — and what it means for buying the dip.',
  },
  {
    src: 'academy/why-buying-the-dip-is-hard.html', root: '../', priority: 0.8, kind: 'article',
    title: 'Why Buying the Dip Is Hard — and How to Fix It | Academy',
    desc:  'The best market days happen during crashes — all 10 of the S&P 500\'s best days since 2000 came while it was already down 10%+. Why dip-buying fails, and how a rule fixes it.',
  },
  {
    src: 'academy/every-sp-500-bottom-since-2016.html', root: '../', priority: 0.8, kind: 'article',
    title: 'Every S&P 500 Bottom Since 2016 — the Pattern | Academy',
    desc:  'Every DoubleTrends™ signal on the S&P 500 index since 2016, the drawdown at each, and the returns that followed — including an honest look at where it misfired.',
  },

  // ── academy: methods ─────────────────────────────────────────────────────
  {
    src: 'academy/volume-profile-vwap.html', root: '../', priority: 0.7, kind: 'article',
    title: 'Volume Profile & VWAP, Explained | Academy',
    desc:  'A plain-English primer on two standard volume tools: Volume Profile (volume traded at each price level) and VWAP (the volume-weighted average price benchmark).',
  },
  {
    src: 'academy/double-trend-exhaustion.html', root: '../', priority: 0.7, kind: 'article',
    title: 'DoubleTrends™: Double Trend Exhaustion Explained | Academy',
    desc:  'How the DoubleTrends™ signal works: a double trend exhaustion model built on dual-period Williams %R, flagging when a selloff\'s downside momentum is exhausted.',
  },
  {
    src: 'academy/maximum-drawdown.html', root: '../', priority: 0.7, kind: 'article',
    title: 'Maximum Drawdown — Depth, Duration, Sharpness | Academy',
    desc:  'How drawdown works as a stress lens: depth from the trailing one-year high, duration since that high, and ten-day sharpness — the three price-based axes the engine reads.',
  },

  // ── academy: macro anchors ──────────────────────────────────────────────
  {
    src: 'academy/vix-percentile.html', root: '../', priority: 0.7, kind: 'article',
    title: 'VIX Percentile — Reading Volatility Against Itself | Academy',
    desc:  'Why VIX percentile inside its own trailing one-year distribution is a more honest read of market stress than the raw level — and how it feeds the regime classifier.',
  },
  {
    src: 'academy/fed-funds-rate.html', root: '../', priority: 0.7, kind: 'article',
    title: 'Fed Funds Rate — The Price of Money, in Motion | Academy',
    desc:  'Why the recent change in the federal funds rate over three and six months matters more than the level — and how it shows up in the bear regime overlay.',
  },
  {
    src: 'academy/unemployment.html', root: '../', priority: 0.7, kind: 'article',
    title: 'Unemployment — The Cleanest Macro Deterioration Signal | Academy',
    desc:  'Why the US unemployment rate lags but does not lie, how the engine reads its six-month change and trailing-MA crossover, and where it fits inside the bear overlay.',
  },
  {
    src: 'academy/cpi-inflation.html', root: '../', priority: 0.7, kind: 'article',
    title: 'CPI Inflation — Context Behind Every Fed Decision | Academy',
    desc:  'Why year-over-year CPI matters as context for Fed policy, and how the combination of high inflation with active tightening forms the inflation_pressure bear-gate condition.',
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
