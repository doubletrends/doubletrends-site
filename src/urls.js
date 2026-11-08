/**
 * urls.js — where each page lives on the web. Pages are emitted at their
 * source path (indicator/methodology.html → dist/indicator/methodology.html)
 * and Cloudflare serves each at its extensionless URL with 200: /method is
 * canonical, and a section index (research/index.html) keeps its trailing
 * slash. Everything that publishes or links a page URL derives it here: the
 * canonical tag, sitemap, _redirects, llms.txt, JSON-LD, breadcrumbs and the
 * internal links in built pages.
 */
const { SITE_URL, SECTIONS } = require('./site.config');

// A path in its served form: strip index.html, then .html.
const extensionless = (p) => p.replace(/index\.html$/, '').replace(/\.html$/, '');

// The canonical path ("/indicator/methodology", "/research/", "/") and URL.
const canonicalPath = (src) => `/${extensionless(src)}`;
const canonicalFor = (src) => `${SITE_URL}${canonicalPath(src)}`;

// Home › Section › Page for pages in a section folder (the section index stops
// at Home › Section), Home › Page for everything else, as schema.org ListItems.
// The leaf is the page's short name (crumb), or its title when it has none.
function breadcrumbItems(page) {
  const item = (position, name, url) => ({ '@type': 'ListItem', position, name, item: url });
  const items = [item(1, 'Home', SITE_URL)];
  const [folder, ...rest] = page.src.split('/');
  if (rest.length && SECTIONS[folder]) {
    items.push(item(2, SECTIONS[folder], `${SITE_URL}/${folder}/`));
    if (page.src !== `${folder}/index.html`) items.push(item(3, page.crumb || page.title, canonicalFor(page.src)));
  } else if (page.src !== 'index.html') {
    items.push(item(2, page.crumb || page.title, canonicalFor(page.src)));
  }
  return items;
}

module.exports = { extensionless, canonicalPath, canonicalFor, breadcrumbItems };
