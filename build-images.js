/**
 * build-images.js
 * Copies public/ → dist/public, re-encoding the "managed" rasters below to
 * resized WebP instead of copying them verbatim. Called from build.js in place
 * of the old `fs.cpSync(public → dist/public)`.
 *
 * Two things happen for each managed image:
 *   1. A full-size `<basename>.webp` is emitted, downscaled so its width never
 *      exceeds `maxWidth` (≈ 2x the largest on-screen size it is shown at).
 *   2. If `thumb` is set, a small `<basename>-card.webp` is also emitted for the
 *      stories carousel, which renders images in 320px-wide 16:10 cards
 *      (see src/_partials/stories.html) — a full hero shot there is pure waste.
 *
 * Every raster listed here MUST have its <img src> updated to the .webp name in
 * the HTML; tests/test-links.js verifies every referenced asset exists in dist/.
 * Brand assets (og-image, wordmark, banner, favicons, logos) are intentionally
 * left as-is: social/scraper compatibility favours PNG, and SVGs are vector.
 *
 * sharp decodes by file *content*, not extension, so mislabeled files are fine
 * (academy/mdd-1.png is actually JPEG; company/data-mining.png is actually WebP).
 */

const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');

// Paths are relative to public/. Quality tiers: charts/screenshots need to keep
// text crisp (82–84); full-bleed hero decor sits behind a dark tint so it can go
// lower (72–76); photos land in between.
const IMAGES = [
  // Academy article figures — shown up to the 1040px article column.
  { src: 'academy/dtep-1.png',           maxWidth: 1468, quality: 82, thumb: true },
  { src: 'academy/dtep-2.png',           maxWidth: 1151, quality: 82 },
  { src: 'academy/dtep-3.png',           maxWidth: 1143, quality: 82 },
  { src: 'academy/mdd-1.png',            maxWidth: 1600, quality: 80, thumb: true }, // 3400px JPEG
  { src: 'academy/mdd-2.png',            maxWidth: 1425, lossless: true }, // flat diagram
  { src: 'academy/mdd-3.png',            maxWidth: 1320, lossless: true }, // flat diagram
  { src: 'academy/volume-profile.png',   maxWidth: 1600, quality: 82, thumb: true },
  { src: 'academy/vwap.png',             maxWidth: 1111, quality: 82 },

  // Company hero decor — full-bleed, aria-hidden, behind a dark tint.
  { src: 'company/office.png',           maxWidth: 1920, quality: 72, thumb: true }, // 2MB PNG photo
  { src: 'company/quant.png',            maxWidth: 1536, quality: 74, thumb: true },
  { src: 'company/quant2.png',           maxWidth: 1480, quality: 74 },
  { src: 'company/quant3.png',           maxWidth: 1200, quality: 76 },
  { src: 'company/lawyers.jpg',          maxWidth: 1920, quality: 74 },

  // Consulting cards — object-cover in a ~500px-wide card (2x ≈ 1000).
  { src: 'company/machine-learning.png', maxWidth: 1000, quality: 80 },
  { src: 'company/forecasting.jpg',      maxWidth: 748,  quality: 82 },
  { src: 'company/data-mining.png',      maxWidth: 900,  quality: 80 }, // already WebP-encoded

  // Product screenshots — hero decor + fixed 518px-tall webapp shots.
  { src: 'product/hero-1.png',           maxWidth: 1913, quality: 80 },
  { src: 'product/method-1.png',         maxWidth: 1917, quality: 80 },
  { src: 'product/webapp1.png',          maxWidth: 1408, quality: 84, thumb: true },
  { src: 'product/webapp2.png',          maxWidth: 1408, quality: 84 },
];

const THUMB_WIDTH   = 640; // carousel renders 320px-wide cards → 2x
const THUMB_QUALITY = 78;

const webpName = (rel) => rel.replace(/\.(png|jpe?g|webp)$/i, '.webp');
const cardName = (rel) => rel.replace(/\.(png|jpe?g|webp)$/i, '-card.webp');

// Copy every file under srcDir → destDir, skipping the managed rasters (their
// originals are replaced by the generated .webp).
function copyTree(srcDir, destDir, skip, base = srcDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, entry.name);
    const to   = path.join(destDir, entry.name);
    if (entry.isDirectory()) { copyTree(from, to, skip, base); continue; }
    if (skip.has(path.normalize(path.relative(base, from)))) continue;
    fs.copyFileSync(from, to);
  }
}

async function optimizeImages(publicDir, distPublicDir) {
  const managed = new Set(IMAGES.map((img) => path.normalize(img.src)));
  copyTree(publicDir, distPublicDir, managed);

  let thumbCount = 0;
  for (const img of IMAGES) {
    const from   = path.join(publicDir, img.src);
    const toFull = path.join(distPublicDir, webpName(img.src));
    fs.mkdirSync(path.dirname(toFull), { recursive: true });
    await sharp(from)
      .resize({ width: img.maxWidth, withoutEnlargement: true })
      .webp(img.lossless ? { lossless: true } : { quality: img.quality })
      .toFile(toFull);

    if (img.thumb) {
      await sharp(from)
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: THUMB_QUALITY })
        .toFile(path.join(distPublicDir, cardName(img.src)));
      thumbCount += 1;
    }
  }

  return { fullCount: IMAGES.length, thumbCount };
}

module.exports = { optimizeImages, IMAGES, webpName, cardName };
