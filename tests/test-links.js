const fs   = require('fs');
const path = require('path');
const { DIST, walk, relPosix, report } = require('./test-utils');

const HTML_EXT        = '.html';
const ATTR_RE         = /\b(?:href|src)=["']([^"'#][^"']*|#[^"']*)["']/gi;
const ID_RE           = /\bid=["']([^"']+)["']/gi;
const PLACEHOLDER_RE  = /\{\{[A-Z0-9_]+\}\}/g;
const COMMENT_RE      = /<!--[\s\S]*?-->/g;
const IGNORE_PREFIXES = ['http://', 'https://', 'mailto:', 'tel:', 'javascript:'];

function fileIds(html) {
  const ids = new Set();
  for (const match of html.matchAll(ID_RE)) ids.add(match[1]);
  return ids;
}

function shouldIgnore(value) {
  return IGNORE_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function splitTarget(value) {
  const hashIndex = value.indexOf('#');
  if (hashIndex === -1) return { pathname: value, hash: '' };
  return { pathname: value.slice(0, hashIndex), hash: value.slice(hashIndex + 1) };
}

function resolvePath(fromFile, rawPath) {
  if (!rawPath) return fromFile;
  if (rawPath.startsWith('/')) return path.join(DIST, rawPath.slice(1));
  return path.resolve(path.dirname(fromFile), rawPath);
}

function main() {
  if (!fs.existsSync(DIST)) throw new Error(`dist/ not found at ${DIST}`);

  const htmlFiles  = walk(DIST).filter((f) => f.endsWith(HTML_EXT));
  const htmlByFile = new Map(htmlFiles.map((f) => [f, fs.readFileSync(f, 'utf8')]));
  const idsByFile  = new Map([...htmlByFile.entries()].map(([f, html]) => [f, fileIds(html)]));
  const errors = [];

  for (const [file, html] of htmlByFile.entries()) {
    const relFile = relPosix(file, DIST);
    const stripped = html.replace(COMMENT_RE, '');

    for (const match of stripped.matchAll(PLACEHOLDER_RE)) {
      errors.push(`${relFile}: unresolved placeholder ${match[0]}`);
    }

    for (const match of html.matchAll(ATTR_RE)) {
      const value = match[1].trim();
      if (!value || shouldIgnore(value)) continue;

      if (value.startsWith('#')) {
        const id = value.slice(1);
        if (id && !idsByFile.get(file).has(id)) errors.push(`${relFile}: missing in-page anchor #${id}`);
        continue;
      }

      const { pathname, hash } = splitTarget(value);
      const target    = resolvePath(file, pathname);
      const targetRel = relPosix(target, DIST);

      if (!fs.existsSync(target)) {
        errors.push(`${relFile}: missing target ${value} -> ${targetRel}`);
        continue;
      }

      if (hash) {
        if (!target.endsWith(HTML_EXT)) {
          errors.push(`${relFile}: anchor target is not HTML ${value}`);
          continue;
        }
        const ids = idsByFile.get(target) ?? fileIds(fs.readFileSync(target, 'utf8'));
        if (!ids.has(hash)) errors.push(`${relFile}: missing anchor ${value}`);
      }
    }
  }

  report(errors, 'Link test');
}

main();
