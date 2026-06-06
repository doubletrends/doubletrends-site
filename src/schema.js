function escapeJsonLd(json) {
  return json.replace(/</g, '\\u003c');
}

function toJsonLdScript(node) {
  return `  <script type="application/ld+json">\n${escapeJsonLd(JSON.stringify(node, null, 2))}\n  </script>`;
}

function canonicalFor(siteUrl, src) {
  return `${siteUrl}/${src.replace(/index\.html$/, '')}`;
}

function pageDisplayName(page) {
  return page.title
    .replace(' — S&P 500 Signals for ETF Investors', '')
    .replace(' | Academy', '')
    .replace(' | DoubleTrends™', '')
    .replace(' — DoubleTrends™', '')
    .replace(' — Research & Education', '')
    .replace(' — Identity & Construction | CDS', '');
}

function pageTypeFor(kind) {
  if (kind === 'contact') return 'ContactPage';
  if (kind === 'collection') return 'CollectionPage';
  return 'WebPage';
}

function defaultArticleAbout(page) {
  const title = page.title.toLowerCase();
  const topics = ['S&P 500 index', 'ETF investing'];

  if (title.includes('drawdown')) topics.push('market drawdowns');
  if (title.includes('dip')) topics.push('buying the dip');
  if (title.includes('vix')) topics.push('volatility');
  if (title.includes('fed')) topics.push('Federal Reserve policy');
  if (title.includes('unemployment')) topics.push('labor market');
  if (title.includes('cpi')) topics.push('inflation');
  if (title.includes('williams %r') || title.includes('double trend exhaustion')) topics.push('oversold reversal');
  if (title.includes('volume profile') || title.includes('vwap')) topics.push('market structure');

  return topics;
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
        name: pageDisplayName(page),
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

function buildSchemaNodes({ page, siteUrl, publisher, ogImage, today, defaultArticlePublished }) {
  const canonical = canonicalFor(siteUrl, page.src);
  const schema = page.schema || {};
  const nodes = [];

  nodes.push(publisher);

  nodes.push({
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    url: siteUrl,
    name: 'DoubleTrends™',
    description: 'Rules-based S&P 500 index alerts and research notes for ETF investors.',
    publisher: { '@id': publisher['@id'] },
    inLanguage: 'en-US',
  });

  nodes.push({
    '@type': pageTypeFor(page.kind),
    '@id': `${canonical}#webpage`,
    url: canonical,
    name: page.title,
    description: page.desc,
    isPartOf: { '@id': `${siteUrl}/#website` },
    about: { '@id': publisher['@id'] },
    inLanguage: 'en-US',
    dateModified: schema.dateModified || today,
  });

  nodes.push({
    '@type': 'BreadcrumbList',
    '@id': `${canonical}#breadcrumb`,
    itemListElement: breadcrumbItems(page, siteUrl),
  });

  if (page.kind === 'home') {
    nodes.push({
      '@type': 'Service',
      '@id': `${siteUrl}/#service`,
      name: 'DoubleTrends™ S&P 500 Signal',
      serviceType: 'Rules-based S&P 500 index alert',
      provider: { '@id': publisher['@id'] },
      audience: {
        '@type': 'Audience',
        audienceType: 'ETF investors using S&P 500 exposure such as VOO, SPY, or IVV',
      },
      description: page.desc,
      url: siteUrl,
    });
  }

  if (page.kind === 'services') {
    nodes.push({
      '@type': 'Service',
      '@id': `${canonical}#service`,
      name: 'Data & Quant Services',
      provider: { '@id': publisher['@id'] },
      serviceType: 'Data engineering, quantitative research, machine learning, forecasting, and data collection',
      description: page.desc,
      url: canonical,
    });
  }

  if (page.kind === 'article') {
    nodes.push({
      '@type': 'Article',
      '@id': `${canonical}#article`,
      headline: page.title.replace(' | Academy', ''),
      description: page.desc,
      mainEntityOfPage: { '@id': `${canonical}#webpage` },
      author: { '@id': publisher['@id'] },
      publisher: { '@id': publisher['@id'] },
      image: {
        '@type': 'ImageObject',
        url: ogImage,
        width: 1200,
        height: 630,
      },
      articleSection: schema.articleSection || 'Academy',
      about: schema.about || defaultArticleAbout(page),
      isAccessibleForFree: true,
      datePublished: schema.datePublished || defaultArticlePublished,
      dateModified: schema.dateModified || today,
      inLanguage: 'en-US',
    });
  }

  if (schema.faq?.length) {
    nodes.push({
      '@type': 'FAQPage',
      '@id': `${canonical}#faq`,
      mainEntity: schema.faq.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.a,
        },
      })),
    });
  }

  return nodes;
}

function buildJsonLdScripts(context) {
  return buildSchemaNodes(context).map(toJsonLdScript).join('\n');
}

module.exports = {
  buildJsonLdScripts,
  pageDisplayName,
};
