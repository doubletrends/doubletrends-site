/**
 * build-images.js
 * Copies public/ → dist/public, re-encoding the "managed" rasters below to
 * resized WebP instead of copying them verbatim. Called from build.js.
 *
 * Each managed image is emitted as `<basename>.webp`, downscaled so its width
 * never exceeds `maxWidth` (≈ 2x the largest on-screen size it is shown at).
 * Every raster listed here MUST be referenced by its .webp name in the HTML;
 * tests/test-links.js verifies every referenced asset exists in dist/.
 *
 * Brand assets (og-image, wordmarks, banner, favicons, logos) are left as-is:
 * social scrapers favour PNG, and SVGs are vector. sharp decodes by file
 * *content*, not extension, so mislabeled files are fine (research/mdd-1.png is
 * actually JPEG).
 */

const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');

// Paths are relative to public/. Research-note figures, shown up to the
// ~740px reading column; charts and screenshots keep text crisp (80–82),
// flat diagrams use lossless WebP.
const IMAGES = [
  { src: 'research/dtep-1.png',           maxWidth: 1468, quality: 82 },
  { src: 'research/dtep-2.png',           maxWidth: 1151, quality: 82 },
  { src: 'research/dtep-3.png',           maxWidth: 1143, quality: 82 },
  { src: 'research/mdd-1.png',            maxWidth: 1600, quality: 80 }, // 3400px JPEG
  { src: 'research/mdd-2.png',            maxWidth: 1425, lossless: true }, // flat diagram
  { src: 'research/mdd-3.png',            maxWidth: 1320, lossless: true }, // flat diagram
  { src: 'research/volume-profile.png',   maxWidth: 1600, quality: 82 },
  { src: 'research/vwap.png',             maxWidth: 1111, quality: 82 },
  // AlphaVerify figures (CC0, from github.com/doubletrends/alpha-verify docs/).
  { src: 'alphaverify/ma_cross_50_200__bin_09.png', maxWidth: 1800, quality: 84 },
  { src: 'alphaverify/ma_ratio_200__bin_04.png',    maxWidth: 1800, quality: 84 },
  { src: 'alphaverify/tnx_level__bin_01.png',       maxWidth: 1800, quality: 84 },
  { src: 'alphaverify/tnx_level__bin_06.png',       maxWidth: 1800, quality: 84 },
];

const webpName = (rel) => rel.replace(/\.(png|jpe?g|webp)$/i, '.webp');

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
  for (const img of IMAGES) {
    const toFull = path.join(distPublicDir, webpName(img.src));
    fs.mkdirSync(path.dirname(toFull), { recursive: true });
    await sharp(path.join(publicDir, img.src))
      .resize({ width: img.maxWidth, withoutEnlargement: true })
      .webp(img.lossless ? { lossless: true } : { quality: img.quality })
      .toFile(toFull);
  }
  return { count: IMAGES.length };
}

module.exports = { optimizeImages };
