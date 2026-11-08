const fs   = require('fs');
const path = require('path');
const { pages } = require('../src/site.config');
const { report } = require('./test-utils');

const SRC_PAGES    = path.join(__dirname, '..', 'src', 'pages');
const ALLOWED_KINDS = new Set(['home', 'webpage', 'collection', 'services', 'contact', 'about', 'article', 'product']);

// Pages are emitted at their source path: validation/methodology.html →
// dist/validation/methodology.html, so root depth is derived straight from the source path.
function rootFor(src) {
  const depth = src.split('/').length - 1;
  return depth === 0 ? '' : '../'.repeat(depth);
}

function main() {
  const seen   = new Set();
  const errors = [];

  for (const page of pages) {
    if (!page || typeof page !== 'object') {
      errors.push('pages must contain objects');
      continue;
    }

    if (!page.src || typeof page.src !== 'string') {
      errors.push('page is missing string src');
      continue;
    }

    if (seen.has(page.src)) {
      errors.push(`${page.src}: duplicate src`);
      continue;
    }
    seen.add(page.src);

    if (!page.src.endsWith('.html')) {
      errors.push(`${page.src}: src must end with .html`);
    }

    if (page.src.startsWith('/') || page.src.includes('\\')) {
      errors.push(`${page.src}: src must use repo-relative POSIX-style paths`);
    }

    if (!fs.existsSync(path.join(SRC_PAGES, page.src))) {
      errors.push(`${page.src}: missing source file at src/pages/${page.src}`);
    }

    if (!page.title || typeof page.title !== 'string') {
      errors.push(`${page.src}: missing title`);
    }

    if (!page.desc || typeof page.desc !== 'string') {
      errors.push(`${page.src}: missing desc`);
    }

    if (!ALLOWED_KINDS.has(page.kind)) {
      errors.push(`${page.src}: invalid kind "${page.kind}"`);
    }

    if (page.root !== '/' && page.root !== rootFor(page.src)) {
      errors.push(`${page.src}: root must match derived value "${rootFor(page.src)}" unless explicitly "/"`);
    }

    if (page.sitemap !== false) {
      if (typeof page.priority !== 'number' || Number.isNaN(page.priority)) {
        errors.push(`${page.src}: sitemap page must have numeric priority`);
      } else if (page.priority < 0 || page.priority > 1) {
        errors.push(`${page.src}: priority must be between 0 and 1`);
      }
    }

    if (page.kind === 'article') {
      if (!page.src.startsWith('research/')) {
        errors.push(`${page.src}: article pages must live under research/`);
      }
      if (page.src === 'research/index.html') {
        errors.push(`${page.src}: research index cannot be kind "article"`);
      }
    }

    if (
      page.kind === 'collection' &&
      !page.src.startsWith('research/') &&
      !page.src.startsWith('company/') &&
      !page.src.startsWith('legal/')
    ) {
      errors.push(`${page.src}: collection pages must live under research/, company/, or legal/`);
    }
  }

  report(errors, 'Page registry test');
}

main();
