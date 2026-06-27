const fs = require('fs');
const path = require('path');
const { pages } = require('../src/site.config');

const DIST = path.join(__dirname, '..', 'dist');
const JSONLD_BLOCK_RE = /<script\s+type=["']application\/ld\+json["'][^>]*>\s*([\s\S]*?)\s*<\/script>/gi;

function readJsonLdNodes(html) {
  const nodes = [];
  for (const match of html.matchAll(JSONLD_BLOCK_RE)) {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed['@graph'])) {
      nodes.push(...parsed['@graph']);
    } else {
      nodes.push(parsed);
    }
  }
  return nodes;
}

function hasType(nodes, type) {
  return nodes.some((node) => node['@type'] === type);
}

function isNoindex(page) {
  return page.robots && page.robots.includes('noindex');
}

function main() {
  const errors = [];

  for (const page of pages) {
    const builtPath = path.join(DIST, page.src);
    if (!fs.existsSync(builtPath)) {
      errors.push(`${page.src}: built HTML missing in dist/`);
      continue;
    }

    const html = fs.readFileSync(builtPath, 'utf8');
    let nodes;
    try {
      nodes = readJsonLdNodes(html);
    } catch (error) {
      errors.push(`${page.src}: invalid JSON-LD (${error.message})`);
      continue;
    }

    if (!nodes.length) {
      if (isNoindex(page)) continue;
      errors.push(`${page.src}: missing JSON-LD nodes`);
      continue;
    }

    if (page.kind === 'article') {
      if (!hasType(nodes, 'Article')) {
        errors.push(`${page.src}: article page must emit Article schema`);
      }
      if (!page.schema?.articleSection) {
        errors.push(`${page.src}: article page must declare schema.articleSection`);
      }
      if (!Array.isArray(page.schema?.about) || page.schema.about.length === 0) {
        errors.push(`${page.src}: article page must declare non-empty schema.about`);
      }
    } else if (hasType(nodes, 'Article')) {
      errors.push(`${page.src}: non-article page must not emit Article schema`);
    }

    if (page.src.startsWith('academy/') && page.src !== 'academy/index.html') {
      if (!hasType(nodes, 'BreadcrumbList')) {
        errors.push(`${page.src}: academy content page must emit BreadcrumbList schema`);
      }
    }
  }

  if (errors.length) {
    console.error(`Schema test failed with ${errors.length} issue(s):\n`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(`Schema test passed across ${pages.length} pages.`);
}

main();
