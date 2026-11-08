/**
 * build-screenshots.js — one screenshot per primary-nav item, into
 * dist/public/screenshots/. Called from build.js, last; nothing here is
 * committed. Published so they can be linked: doubletrends.com/public/screenshots/home.png.
 *
 * Each is the first screen of the page at 1680 x 1080, as built, so the
 * utility bar shows the reading the deploy carries. Named after the page:
 * home, research, validation, methodology, performance, indicator.
 *
 * Captured with Playwright's own Chromium, pinned by package-lock.json, so
 * every machine renders the same (install it once with
 * `npx playwright install chromium`; CI does this before the build). dist/ is
 * served over a local HTTP server for the duration, resolved the way
 * Cloudflare serves it, because the pages reference images by absolute path
 * (/public/...), which a file:// URL can't resolve.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SIZE = { width: 1680, height: 1080 };

// The primary nav, read from the header partial: [{ name, url }] in nav order.
function navItems() {
  const header = fs.readFileSync(path.join(ROOT, 'src', 'partials', 'header.html'), 'utf8');
  const nav = header.slice(header.indexOf('aria-label="Primary"'));
  return [...nav.matchAll(/href="\{\{ROOT\}\}([^"]+)" data-nav="[^"]+"/g)].map(([, href]) => {
    const parts = href.replace(/\.html$/, '').split('/');
    const isIndex = parts[parts.length - 1] === 'index';
    const name = isIndex ? (parts.length > 1 ? parts[parts.length - 2] : 'home') : parts[parts.length - 1];
    const url = '/' + (isIndex ? parts.slice(0, -1).map((p) => p + '/').join('') : parts.join('/'));
    return { name, url };
  });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.json': 'application/json', '.csv': 'text/csv', '.txt': 'text/plain',
};

// dist/ as Cloudflare serves it: /a → a.html, /a/ → a/index.html.
function serve(dist) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    let file = path.join(dist, rel);
    if (!path.extname(file) && fs.existsSync(file + '.html')) file += '.html';
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function writeScreenshots(dist) {
  const out = path.join(dist, 'public', 'screenshots');
  fs.mkdirSync(out, { recursive: true });
  const items = navItems();
  if (!items.length) throw new Error('no primary-nav items found in src/partials/header.html');

  const server = await serve(dist);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1 });
    await Promise.all(items.map(async ({ name, url }) => {
      const page = await context.newPage();
      await page.goto(base + url, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(out, `${name}.png`) });
      await page.close();
    }));
  } finally {
    await browser.close();
    server.close();
  }
  return items.map(({ name }) => `${name}.png`);
}

module.exports = { writeScreenshots, navItems, SIZE };
