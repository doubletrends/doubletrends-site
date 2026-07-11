function escapeJsonLd(json) {
  return json.replace(/</g, '\\u003c');
}

function toJsonLdScript(node) {
  return `  <script type="application/ld+json">\n${escapeJsonLd(JSON.stringify(node, null, 2))}\n  </script>`;
}

function canonicalFor(siteUrl, src) {
  // Extensionless: Cloudflare's auto-trailing-slash asset handling serves
  // /method (200) and 307-redirects /method.html — declared URLs must match
  // the served form. Directory indexes keep their trailing slash.
  return `${siteUrl}/${src.replace(/index\.html$/, '').replace(/\.html$/, '')}`;
}

function pageDisplayName(page) {
  return page.title;
}

function breadcrumbLabel(page) {
  const title = pageDisplayName(page);
  const sep = title.indexOf(' — ');
  return sep !== -1 ? title.slice(0, sep) : title;
}

function pageTypeFor(kind) {
  if (kind === 'about') return 'AboutPage';
  if (kind === 'contact') return 'ContactPage';
  if (kind === 'collection') return 'CollectionPage';
  return 'WebPage';
}

function breadcrumbItems(page, siteUrl) {
  const items = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: siteUrl,
    },
  ];

  const custom = page.schema?.breadcrumbs;
  if (custom?.length) {
    return items.concat(
      custom.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 2,
        name: crumb.name,
        item: crumb.url.startsWith('http') ? crumb.url : `${siteUrl}${crumb.url}`,
      }))
    );
  }

  const parts = page.src.split('/');
  if (parts[0] === 'academy') {
    items.push({
      '@type': 'ListItem',
      position: 2,
      name: 'Academy',
      item: `${siteUrl}/academy/`,
    });
    if (page.src !== 'academy/index.html') {
      items.push({
        '@type': 'ListItem',
        position: 3,
        name: breadcrumbLabel(page),
        item: canonicalFor(siteUrl, page.src),
      });
    }
    return items;
  }

  if (parts[0] === 'company') {
    items.push({
      '@type': 'ListItem',
      position: 2,
      name: 'Company',
      item: `${siteUrl}/company/`,
    });
    if (page.src !== 'company/index.html') {
      items.push({
        '@type': 'ListItem',
        position: 3,
        name: breadcrumbLabel(page),
        item: canonicalFor(siteUrl, page.src),
      });
    }
    return items;
  }

  if (parts[0] === 'legal') {
    items.push({
      '@type': 'ListItem',
      position: 2,
      name: 'Legal',
      item: `${siteUrl}/legal/`,
    });
    if (page.src !== 'legal/index.html') {
      items.push({
        '@type': 'ListItem',
        position: 3,
        name: breadcrumbLabel(page),
        item: canonicalFor(siteUrl, page.src),
      });
    }
    return items;
  }

  if (page.src !== 'index.html') {
    items.push({
      '@type': 'ListItem',
      position: 2,
      name: pageDisplayName(page),
      item: canonicalFor(siteUrl, page.src),
    });
  }

  return items;
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

function organizationNode(publisher) {
  return {
    '@type': 'Organization',
    '@id': publisher['@id'],
    name: publisher.name,
    url: publisher.url,
    legalName: publisher.legalName,
    description: publisher.description,
    email: publisher.email,
    logo: publisher.logo,
    brand: publisher.brand,
    sameAs: publisher.sameAs,
    knowsAbout: publisher.knowsAbout,
  };
}

function organizationReference(publisher) {
  return {
    '@type': 'Organization',
    '@id': publisher['@id'],
    name: publisher.name,
    url: publisher.url,
    logo: publisher.logo,
  };
}

function buildSchemaNodes({ page, siteUrl, siteName, siteDescription, publisher, ogImage, today, defaultArticlePublished, formattedTitle }) {
  if (!shouldEmitJsonLd(page)) return [];

  const canonical = canonicalFor(siteUrl, page.src);
  const schema = page.schema || {};
  const nodes = [];
  const publisherRef = organizationReference(publisher);

  if (shouldIncludeOrganization(page)) {
    nodes.push(organizationNode(publisher));
  }

  if (shouldIncludeWebSite(page)) {
    nodes.push({
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: siteName,
      description: siteDescription,
      publisher: { '@id': publisher['@id'] },
      inLanguage: 'en-US',
    });
  }

  nodes.push({
    '@type': pageTypeFor(page.kind),
    '@id': `${canonical}#webpage`,
    url: canonical,
    name: formattedTitle || `${siteName} | ${page.title}`,
    description: page.desc,
    ...(shouldIncludeWebSite(page) ? { isPartOf: { '@id': `${siteUrl}/#website` } } : {}),
    inLanguage: 'en-US',
    dateModified: isoDate(schema.dateModified || today),
  });

  const crumbs = breadcrumbItems(page, siteUrl);
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
      name: schema.productName || page.title,
      description: page.desc,
      brand: { '@type': 'Brand', name: 'DoubleTrends™' },
      offers: {
        '@type': 'Offer',
        url: canonical,
        price: schema.price || '149.00',
        priceCurrency: schema.priceCurrency || 'USD',
        availability: 'https://schema.org/InStock',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: schema.monthlyPrice || 12.42,
          priceCurrency: schema.priceCurrency || 'USD',
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
      headline: schema.headline || page.title,
      description: page.desc,
      mainEntityOfPage: { '@id': `${canonical}#webpage` },
      author: publisherRef,
      publisher: publisherRef,
      image: {
        '@type': 'ImageObject',
        url: ogImage,
        width: 1200,
        height: 630,
      },
      articleSection: schema.articleSection || 'Academy',
      about: schema.about || ['S&P 500 index', 'ETF investing'],
      isAccessibleForFree: true,
      datePublished: isoDate(schema.datePublished || defaultArticlePublished),
      dateModified: isoDate(schema.dateModified || today),
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

module.exports = {
  buildJsonLdScripts,
  canonicalFor,
  pageDisplayName,
  isoDate,
};
