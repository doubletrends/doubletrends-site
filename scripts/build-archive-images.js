/**
 * build-archive-images.js — `npm run archive-images`
 *
 * Produces the archival background images in public/img/archive/ from the
 * manifest in src/data/archive-images.json. Run by hand when the manifest
 * changes (it needs the network); the normal build only copies the results.
 * Downloads go through the system `curl` (bundled with Windows 10+, macOS and
 * Linux), which honours HTTPS_PROXY; Node's fetch does not without an opt-in.
 *
 * For each image: download a 2400px rendition from Wikimedia Commons into
 * build/archive/ (skipped if cached; the licence is re-checked and must be
 * public domain or CC0), crop to the picture area, and render the requested
 * renditions as a navy-to-paper duotone:
 *
 *   head  2400 x 640   soft tone, behind a section's page title
 *   hero  2000 x 834   soft tone, behind the homepage headline
 *   band  2400 x 600   full tone, a full-width band between sections
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..'); // scripts/ lives one level below the repo root
const CACHE = path.join(ROOT, 'build', 'archive');
const OUT = path.join(ROOT, 'public', 'img', 'archive');
const { images } = require('../src/data/archive-images.json');
const UA = 'DoubleTrendsSiteDesign/1.0 (https://doubletrends.com)';

const NAVY = [0x2A, 0x33, 0x40];
const PAPER = [0xFB, 0xFA, 0xF7];
const SOFT_DARK = [0x8A, 0x90, 0x99]; // navy lifted toward paper: sits behind text
const RENDITIONS = {
  head: { w: 2400, h: 640, dark: SOFT_DARK, gamma: 0.9 },
  hero: { w: 2000, h: 834, dark: SOFT_DARK, gamma: 0.9 },
  band: { w: 2400, h: 600, dark: NAVY, gamma: 1.0 },
};

function fetchJson(url) {
  return JSON.parse(execFileSync('curl', ['-sf', '-m', '60', '-A', UA, url], { maxBuffer: 64 << 20 }).toString());
}

function download(id, title) {
  const file = path.join(CACHE, `${id}.jpg`);
  if (fs.existsSync(file)) return file;
  const q = fetchJson('https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo'
    + `&iiprop=url|extmetadata&iiextmetadatafilter=LicenseShortName&iiurlwidth=2400&titles=${encodeURIComponent('File:' + title)}`);
  const ii = Object.values(q.query.pages)[0].imageinfo?.[0];
  if (!ii) throw new Error(`${id}: not found on Commons: ${title}`);
  const licence = String(ii.extmetadata?.LicenseShortName?.value || '');
  if (!/public domain|cc0/i.test(licence)) throw new Error(`${id}: licence is "${licence}", not public domain/CC0`);
  fs.mkdirSync(CACHE, { recursive: true });
  execFileSync('curl', ['-sf', '-m', '120', '-L', '-A', UA, '-o', file, ii.thumburl || ii.url]);
  return file;
}

// Cut a crop of the given aspect from the picture area, centred on `focus`.
async function cropTo(file, { box, focus }, aspect) {
  const meta = await sharp(file).metadata();
  const L = Math.round(box[0] * meta.width), T = Math.round(box[1] * meta.height);
  const W = Math.round((box[2] - box[0]) * meta.width), H = Math.round((box[3] - box[1]) * meta.height);
  let w = W, h = Math.round(W / aspect);
  if (h > H) { h = H; w = Math.round(H * aspect); }
  const left = L + Math.round((W - w) / 2);
  const top = T + Math.max(0, Math.min(H - h, Math.round(focus * H - h / 2)));
  return sharp(file).extract({ left, top, width: w, height: h }).toBuffer();
}

async function duotone(buf, { w, h, dark, gamma }) {
  const { data, info } = await sharp(buf).resize(w, h, { fit: 'cover' }).greyscale().normalise().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < info.width * info.height; i++) {
    const t = Math.pow(data[i * info.channels] / 255, gamma);
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(dark[c] + (PAPER[c] - dark[c]) * t);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } })
    .jpeg({ quality: 78, mozjpeg: true, progressive: true }).toBuffer();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [id, img] of Object.entries(images)) {
    const file = download(id, img.title);
    for (const r of img.renditions) {
      const spec = RENDITIONS[r];
      const out = path.join(OUT, `${id}-${r}.jpg`);
      fs.writeFileSync(out, await duotone(await cropTo(file, img.crop, spec.w / spec.h), spec));
      console.log(`✓  ${path.relative(ROOT, out)}  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
    }
  }
})().catch((err) => { console.error(err.message); process.exit(1); });
