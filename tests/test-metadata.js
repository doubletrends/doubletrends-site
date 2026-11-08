const fs   = require('fs');
const { SITE_NAME } = require('../src/site.config');
const { DIST, walk, relPosix, report } = require('./test-utils');

const HTML_EXT        = '.html';
// Title convention: page first, firm last ("Methodology | DoubleTrends");
// the homepage leads with the firm ("DoubleTrends — S&P 500 …").
const PAGE_SUFFIX = ` | ${SITE_NAME}`;
const HOME_PREFIX = `${SITE_NAME} — `;
const TITLE_RE        = /<title>([^<]+)<\/title>/i;
const DESC_RE         = /<meta\s+name=["']description["']\s+content=(["'])(.*?)\1\s*\/?>/i;
const ROBOTS_RE       = /<meta\s+name=["']robots["']\s+content=(["'])(.*?)\1\s*\/?>/i;
const CANONICAL_RE    = /<link\s+rel=["']canonical["']\s+href=(["'])(.*?)\1\s*\/?>/i;
const OG_TITLE_RE     = /<meta\s+property=["']og:title["']\s+content=(["'])(.*?)\1\s*\/?>/i;
const OG_DESC_RE      = /<meta\s+property=["']og:description["']\s+content=(["'])(.*?)\1\s*\/?>/i;
const TWITTER_TITLE_RE = /<meta\s+name=["']twitter:title["']\s+content=(["'])(.*?)\1\s*\/?>/i;
const TWITTER_DESC_RE  = /<meta\s+name=["']twitter:description["']\s+content=(["'])(.*?)\1\s*\/?>/i;

function readMatch(html, regex, label, relFile, errors) {
  const match = html.match(regex);
  if (!match) {
    errors.push(`${relFile}: missing ${label}`);
    return null;
  }
  return match[match.length - 1].trim();
}

function validateTitle(value, label, relFile, errors) {
  const decoded = value.replace(/&amp;/g, '&');
  const isHome = relFile === 'index.html';
  const ok = isHome
    ? decoded.startsWith(HOME_PREFIX) && decoded.length > HOME_PREFIX.length
    : decoded.endsWith(PAGE_SUFFIX) && decoded.length > PAGE_SUFFIX.length;
  if (!ok) {
    errors.push(`${relFile}: ${label} must ${isHome ? `start with "${HOME_PREFIX}"` : `end with "${PAGE_SUFFIX}"`} with page text`);
  }
}

function validatePresent(value, label, relFile, errors) {
  if (!value) errors.push(`${relFile}: ${label} must be present and non-empty`);
}

function main() {
  if (!fs.existsSync(DIST)) throw new Error(`dist/ not found at ${DIST}`);

  const htmlFiles = walk(DIST).filter((f) => f.endsWith(HTML_EXT));
  const errors    = [];

  for (const file of htmlFiles) {
    const relFile = relPosix(file, DIST);
    const html    = fs.readFileSync(file, 'utf8');

    const title        = readMatch(html, TITLE_RE,        '<title>',         relFile, errors);
    const desc         = readMatch(html, DESC_RE,          'description',     relFile, errors);
    const robots       = readMatch(html, ROBOTS_RE,        'robots',          relFile, errors);
    const canonical    = readMatch(html, CANONICAL_RE,     'canonical',       relFile, errors);
    const ogTitle      = readMatch(html, OG_TITLE_RE,      'og:title',        relFile, errors);
    const ogDesc       = readMatch(html, OG_DESC_RE,       'og:description',  relFile, errors);
    const twitterTitle = readMatch(html, TWITTER_TITLE_RE, 'twitter:title',   relFile, errors);
    const twitterDesc  = readMatch(html, TWITTER_DESC_RE,  'twitter:description', relFile, errors);

    if (!title || !ogTitle || !twitterTitle) continue;

    validatePresent(desc,         'description',         relFile, errors);
    validatePresent(robots,       'robots',              relFile, errors);
    validatePresent(canonical,    'canonical',           relFile, errors);
    validatePresent(ogDesc,       'og:description',      relFile, errors);
    validatePresent(twitterDesc,  'twitter:description', relFile, errors);
    validateTitle(title,        '<title>',      relFile, errors);
    validateTitle(ogTitle,      'og:title',     relFile, errors);
    validateTitle(twitterTitle, 'twitter:title', relFile, errors);

    if (title !== ogTitle || title !== twitterTitle) {
      errors.push(`${relFile}: title, og:title, and twitter:title must match exactly`);
    }

    if (desc && (desc !== ogDesc || desc !== twitterDesc)) {
      errors.push(`${relFile}: description, og:description, and twitter:description must match exactly`);
    }
  }

  report(errors, 'Metadata test');
}

main();
