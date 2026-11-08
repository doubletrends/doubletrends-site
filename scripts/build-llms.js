/**
 * build-llms.js
 * Writes dist/llms.txt (the site summary for language models) from its
 * template in src/, filling the page lists and figures. Called from build.js.
 */
const fs = require('fs');
const path = require('path');
const { SECTIONS, pages } = require('../src/site.config');
const { canonicalFor } = require('../src/urls');
const { SITE_VARS, replace, assertResolved } = require('./placeholders');

const ROOT = path.join(__dirname, '..'); // scripts/ lives one level below the repo root

// Sections mirror the breadcrumb model: top-level pages (section indexes
// included), then each section's children under the section's name, which
// keeps its ™ (tests/test-trademark.js).
const LLMS_SECTIONS = [
  { key: 'main', heading: 'Primary Pages' },
  ...Object.entries(SECTIONS).map(([key, label]) => ({ key, heading: label })),
];
function llmsSectionKey(src) {
  const prefix = src.split('/')[0];
  return SECTIONS[prefix] && !src.endsWith('index.html') ? prefix : 'main';
}

function writeLlms(dist, exhibits) {
  const sections = LLMS_SECTIONS.map(({ key, heading }) => {
    const entries = pages
      .filter((p) => p.sitemap !== false && llmsSectionKey(p.src) === key)
      .map((p) => `- ${p.title}: ${canonicalFor(p.src)}\n  ${p.desc}`)
      .join('\n');
    return `## ${heading}\n\n${entries}`;
  }).join('\n\n');
  const vars = { ...SITE_VARS, ...exhibits, LLMS_SECTIONS: sections };
  const template = fs.readFileSync(path.join(ROOT, 'src', 'llms.txt'), 'utf8');
  fs.writeFileSync(path.join(dist, 'llms.txt'), assertResolved(replace(template, vars), 'src/llms.txt'), 'utf8');
}

module.exports = { writeLlms };
