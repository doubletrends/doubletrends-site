const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const HTML_EXT = '.html';
const REQUIRED_PREFIX = 'DoubleTrends™ | ';
const TITLE_RE = /<title>([^<]+)<\/title>/i;
const DESC_RE = /<meta\s+name=["']description["']\s+content=(["'])(.*?)\1\s*\/?>/i;
const ROBOTS_RE = /<meta\s+name=["']robots["']\s+content=(["'])(.*?)\1\s*\/?>/i;
const CANONICAL_RE = /<link\s+rel=["']canonical["']\s+href=(["'])(.*?)\1\s*\/?>/i;
const OG_TITLE_RE = /<meta\s+property=["']og:title["']\s+content=(["'])(.*?)\1\s*\/?>/i;
const OG_DESC_RE = /<meta\s+property=["']og:description["']\s+content=(["'])(.*?)\1\s*\/?>/i;
const TWITTER_TITLE_RE = /<meta\s+name=["']twitter:title["']\s+content=(["'])(.*?)\1\s*\/?>/i;
const TWITTER_DESC_RE = /<meta\s+name=["']twitter:description["']\s+content=(["'])(.*?)\1\s*\/?>/i;
const JSONLD_RE = /<script\s+type=["']application\/ld\+json["'][^>]*>/i;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/');
}

function readMatch(html, regex, label, relFile, errors) {
  const match = html.match(regex);
  if (!match) {
    errors.push(`${relFile}: missing ${label}`);
    return null;
  }
  return match[match.length - 1].trim();
}

function validatePrefixed(value, label, relFile, errors) {
  if (!value.startsWith(REQUIRED_PREFIX)) {
    errors.push(`${relFile}: ${label} must start with "${REQUIRED_PREFIX}"`);
    return;
  }

  if (value.length === REQUIRED_PREFIX.length) {
    errors.push(`${relFile}: ${label} must include non-empty text after prefix`);
  }
}

function validatePresent(value, label, relFile, errors) {
  if (!value) {
    errors.push(`${relFile}: ${label} must be present and non-empty`);
  }
}

function main() {
  if (!fs.existsSync(DIST)) {
    throw new Error(`dist/ not found at ${DIST}`);
  }

  const htmlFiles = walk(DIST).filter((file) => file.endsWith(HTML_EXT));
  const errors = [];

  for (const file of htmlFiles) {
    const relFile = toPosix(path.relative(DIST, file));
    const html = fs.readFileSync(file, 'utf8');
    const title = readMatch(html, TITLE_RE, '<title>', relFile, errors);
    const desc = readMatch(html, DESC_RE, 'description', relFile, errors);
    const robots = readMatch(html, ROBOTS_RE, 'robots', relFile, errors);
    const canonical = readMatch(html, CANONICAL_RE, 'canonical', relFile, errors);
    const ogTitle = readMatch(html, OG_TITLE_RE, 'og:title', relFile, errors);
    const ogDesc = readMatch(html, OG_DESC_RE, 'og:description', relFile, errors);
    const twitterTitle = readMatch(html, TWITTER_TITLE_RE, 'twitter:title', relFile, errors);
    const twitterDesc = readMatch(html, TWITTER_DESC_RE, 'twitter:description', relFile, errors);

    if (!title || !ogTitle || !twitterTitle) continue;

    validatePresent(desc, 'description', relFile, errors);
    validatePresent(robots, 'robots', relFile, errors);
    validatePresent(canonical, 'canonical', relFile, errors);
    validatePresent(ogDesc, 'og:description', relFile, errors);
    validatePresent(twitterDesc, 'twitter:description', relFile, errors);
    validatePrefixed(title, '<title>', relFile, errors);
    validatePrefixed(ogTitle, 'og:title', relFile, errors);
    validatePrefixed(twitterTitle, 'twitter:title', relFile, errors);

    if (title !== ogTitle || title !== twitterTitle) {
      errors.push(`${relFile}: title, og:title, and twitter:title must match exactly`);
    }

    if (desc && (desc !== ogDesc || desc !== twitterDesc)) {
      errors.push(`${relFile}: description, og:description, and twitter:description must match exactly`);
    }

    if (canonical && !canonical.startsWith('https://doubletrends.com/')) {
      errors.push(`${relFile}: canonical must start with https://doubletrends.com/`);
    }

    if (!JSONLD_RE.test(html)) {
      errors.push(`${relFile}: missing JSON-LD script`);
    }

  }

  if (errors.length) {
    console.error(`Metadata test failed with ${errors.length} issue(s):\n`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(`Metadata test passed across ${htmlFiles.length} HTML files.`);
}

main();
