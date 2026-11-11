const fs   = require('fs');
const path = require('path');
const { DIST, walk, relPosix, report } = require('./utils');

const HTML_EXT        = '.html';
const ATTR_RE         = /\b(?:href|src)=["']([^"'#][^"']*|#[^"']*)["']/gi;
const ID_RE           = /\bid=["']([^"']+)["']/gi;
const IGNORE_PREFIXES = ['http://', 'https://', 'mailto:', 'tel:', 'javascript:'];

function fileIds(html) {
  const ids = new Set();
  for (const match of html.matchAll(ID_RE)) ids.add(match[1]);
  return ids;
}

function shouldIgnore(value) {
  return IGNORE_PREFIXES.some((prefix) => value.startsWith(prefix));
}

// A query string (site.css?v=<hash>, scripts/build-cache.js) names the same file.
function splitTarget(value) {
  const hashIndex = value.indexOf('#');
  const [pathname, hash] = hashIndex === -1 ? [value, ''] : [value.slice(0, hashIndex), value.slice(hashIndex + 1)];
  return { pathname: pathname.split('?')[0], hash };
}

function resolvePath(fromFile, rawPath) {
  if (!rawPath) return fromFile;
  if (rawPath.startsWith('/')) return path.join(DIST, rawPath.slice(1));
  return path.resolve(path.dirname(fromFile), rawPath);
}

// Mirror Cloudflare's auto-trailing-slash asset resolution: a directory path
// serves its index.html, an extensionless path serves path + ".html".
// Returns the file that would be served, or null.
function resolveAsset(target) {
  if (fs.existsSync(target)) {
    if (!fs.statSync(target).isDirectory()) return target;
    const index = path.join(target, 'index.html');
    return fs.existsSync(index) ? index : null;
  }
  const withHtml = `${target}.html`;
  return fs.existsSync(withHtml) ? withHtml : null;
}

function main() {
  if (!fs.existsSync(DIST)) throw new Error(`dist/ not found at ${DIST}`);

  const htmlFiles  = walk(DIST).filter((f) => f.endsWith(HTML_EXT));
  const htmlByFile = new Map(htmlFiles.map((f) => [f, fs.readFileSync(f, 'utf8')]));
  const idsByFile  = new Map([...htmlByFile.entries()].map(([f, html]) => [f, fileIds(html)]));
  const errors = [];

  for (const [file, html] of htmlByFile.entries()) {
    const relFile = relPosix(file, DIST);

    for (const match of html.matchAll(ATTR_RE)) {
      const value = match[1].trim();
      if (!value || shouldIgnore(value)) continue;

      if (value.startsWith('#')) {
        const id = value.slice(1);
        if (id && !idsByFile.get(file).has(id)) errors.push(`${relFile}: missing in-page anchor #${id}`);
        continue;
      }

      const { pathname, hash } = splitTarget(value);
      const target   = resolvePath(file, pathname);
      const resolved = resolveAsset(target);

      if (!resolved) {
        errors.push(`${relFile}: missing target ${value} -> ${relPosix(target, DIST)}`);
        continue;
      }

      // Links to pages use the form Cloudflare serves with 200, so navigation
      // never passes through its 307: leaf pages extensionless with no slash,
      // folder indexes with a trailing slash (README: URLs, serving & SEO).
      if (pathname && resolved.endsWith(HTML_EXT)) {
        const isIndex = path.basename(resolved) === 'index.html';
        // "." and ".." resolve with a trailing slash, like "./" and "../".
        const served = isIndex ? /\/$|^\.\.?$/.test(pathname) : !/\.html$|\/$/.test(pathname);
        if (!served) errors.push(`${relFile}: link ${value} is not the served URL (Cloudflare answers it with a 307)`);
      }

      if (hash) {
        if (!resolved.endsWith(HTML_EXT)) {
          errors.push(`${relFile}: anchor target is not HTML ${value}`);
          continue;
        }
        const ids = idsByFile.get(resolved) ?? fileIds(fs.readFileSync(resolved, 'utf8'));
        if (!ids.has(hash)) errors.push(`${relFile}: missing anchor ${value}`);
      }
    }
  }

  report(errors, 'Link test');
}

main();
