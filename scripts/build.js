/**
 * build.js — `npm run build`
 * Builds the site into dist/, one step per line below, in order. Each step
 * lives in its own build-*.js file; this file only runs them.
 */
const fs   = require('fs');
const path = require('path');
const { pages } = require('../src/site.config');
const { buildExhibits } = require('../src/charts');
const { compileCss } = require('./build-css');
const { renderPage } = require('./build-pages');
const { writeSitemap, writeRedirects } = require('./build-urls');
const { writeLlms } = require('./build-llms');
const { optimizeImages } = require('./build-images');
const { writeGuilloches } = require('./build-guilloche');
const { writeBrand } = require('./build-brand');

const ROOT = path.join(__dirname, '..'); // scripts/ lives one level below the repo root
const DIST = path.join(ROOT, 'dist');

function todayInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function cleanDist() {
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
}

async function main() {
  // Figures and exhibits, computed once from src/data/ (indicator-data.js).
  const exhibits = buildExhibits({
    daily: require('../src/data/regimes-daily.json'),
    indicator: require('../src/data/indicator.json'),
  });
  const today = todayInTimeZone('America/New_York');

  cleanDist();

  compileCss(DIST);
  console.log('✓  public/styles/site.css generated');

  let built = 0;
  for (const page of pages) {
    if (renderPage(page, { dist: DIST, exhibits, today })) built++;
  }
  console.log(`\nBuild complete — ${built} pages written.`);

  writeSitemap(DIST);
  console.log('✓  sitemap.xml generated');
  writeRedirects(DIST);
  console.log('✓  _redirects generated');
  writeLlms(DIST, exhibits);
  console.log('✓  llms.txt generated');

  // public/ is copied verbatim except the managed rasters, which are
  // re-encoded to resized WebP; the generated brand/ files go beside them.
  const { count } = await optimizeImages(path.join(ROOT, 'public'), path.join(DIST, 'public'));
  console.log(`✓  public/ copied + ${count} images → WebP`);
  const guilloches = writeGuilloches(path.join(DIST, 'public', 'brand'));
  console.log(`✓  ${guilloches.length} guilloche patterns generated`);
  await writeBrand(path.join(DIST, 'public', 'brand'));
  console.log('✓  brand assets generated (logo, favicons, wordmarks, og-image, banner)');
}

main().catch((err) => {
  console.error('✗  build failed');
  console.error(err);
  process.exit(1);
});
