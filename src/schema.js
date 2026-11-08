/**
 * schema.js — the page's JSON-LD (schema.org) graph: organization, website,
 * the page itself, its breadcrumb, and the service, product or article it
 * describes. URLs come from urls.js, site facts from site.config.js.
 */
const { SITE_URL, SITE_NAME, SITE_DESCRIPTION, PUBLISHER, OG_IMAGE } = require('./site.config');
const { canonicalFor, breadcrumbItems } = require('./urls');
const { jsonInScript } = require('./format');

function toJsonLdScript(node) {
  return `  <script type="application/ld+json">\n${jsonInScript(JSON.stringify(node, null, 2))}\n  </script>`;
}

function pageTypeFor(kind) {
  if (kind === 'about') return 'AboutPage';
  if (kind === 'contact') return 'ContactPage';
  if (kind === 'collection') return 'CollectionPage';
  return 'WebPage';
}

function isoDate(date) {
  return `${date}T00:00:00+08:00`;
}

function shouldEmitJsonLd(page) {
  return !(page.robots && page.robots.includes('noindex'));
}

function shouldIncludeOrganization(page) {
  return page.src === 'index.html' || page.src === 'company/index.html';
}

function shouldIncludeWebSite(page) {
  return page.kind === 'home';
}

// How other nodes point at the publisher; the full node is PUBLISHER itself.
function organizationReference() {
  return {
    '@type': 'Organization',
    '@id': PUBLISHER['@id'],
    name: PUBLISHER.name,
    url: PUBLISHER.url,
    logo: PUBLISHER.logo,
  };
}

function buildSchemaNodes({ page, today, formattedTitle }) {
  if (!shouldEmitJsonLd(page)) return [];

  const canonical = canonicalFor(page.src);
  const schema = page.schema || {};
  const nodes = [];
  const publisherRef = organizationReference();

  if (shouldIncludeOrganization(page)) {
    nodes.push(PUBLISHER);
  }

  if (shouldIncludeWebSite(page)) {
    nodes.push({
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      publisher: { '@id': PUBLISHER['@id'] },
      inLanguage: 'en-US',
    });
  }

  nodes.push({
    '@type': pageTypeFor(page.kind),
    '@id': `${canonical}#webpage`,
    url: canonical,
    name: formattedTitle,
    description: page.desc,
    ...(shouldIncludeWebSite(page) ? { isPartOf: { '@id': `${SITE_URL}/#website` } } : {}),
    inLanguage: 'en-US',
    dateModified: isoDate(today),
  });

  const crumbs = breadcrumbItems(page);
  if (crumbs.length >= 2) {
    nodes.push({
      '@type': 'BreadcrumbList',
      '@id': `${canonical}#breadcrumb`,
      itemListElement: crumbs,
    });
  }

  if (page.kind === 'services') {
    nodes.push({
      '@type': 'Service',
      '@id': `${canonical}#service`,
      name: 'Data & Quant Services',
      provider: publisherRef,
      serviceType: 'Data engineering, quantitative research, machine learning, forecasting, and data collection',
      description: page.desc,
      url: canonical,
    });
  }

  if (page.kind === 'product') {
    nodes.push({
      '@type': 'Product',
      '@id': `${canonical}#product`,
      name: schema.productName,
      description: page.desc,
      brand: { '@type': 'Brand', name: 'DoubleTrends' },
      offers: {
        '@type': 'Offer',
        url: canonical,
        price: schema.price,
        priceCurrency: schema.priceCurrency,
        availability: 'https://schema.org/InStock',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: schema.monthlyPrice,
          priceCurrency: schema.priceCurrency,
          referenceQuantity: {
            '@type': 'QuantitativeValue',
            value: '1',
            unitCode: 'MON',
          },
          billingDuration: {
            '@type': 'QuantitativeValue',
            value: '12',
            unitCode: 'MON',
          },
        },
      },
    });
  }

  if (page.kind === 'article') {
    nodes.push({
      '@type': 'Article',
      '@id': `${canonical}#article`,
      headline: page.title,
      description: page.desc,
      mainEntityOfPage: { '@id': `${canonical}#webpage` },
      author: publisherRef,
      publisher: publisherRef,
      image: {
        '@type': 'ImageObject',
        url: OG_IMAGE,
        width: 1200,
        height: 630,
      },
      articleSection: page.section,
      about: schema.about,
      isAccessibleForFree: true,
      datePublished: isoDate(schema.datePublished),
      dateModified: isoDate(today),
      inLanguage: 'en-US',
    });
  }

  return nodes;
}

function buildJsonLdScripts(context) {
  const graph = buildSchemaNodes(context);
  if (!graph.length) return '';

  return toJsonLdScript({
    '@context': 'https://schema.org',
    '@graph': graph,
  });
}

module.exports = { buildJsonLdScripts, isoDate };
