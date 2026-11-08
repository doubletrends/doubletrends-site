// Every page shows where it is in the header: exactly one item, in the
// primary nav or the utility bar, carries aria-current="page" (and with it the
// underline). The 404 is the exception: it can be served at any address and
// belongs to no section, so it marks none.
const fs   = require('fs');
const { DIST, walk, relPosix, report } = require('./utils');

const CURRENT_RE = /data-nav="[^"]+" aria-current="page"/g;

function main() {
  if (!fs.existsSync(DIST)) throw new Error('dist/ not found — run npm run build first');
  const files = walk(DIST).filter((f) => f.endsWith('.html'));
  const errors = [];

  for (const file of files) {
    const rel = relPosix(file, DIST);
    const html = fs.readFileSync(file, 'utf8');
    const header = html.slice(0, html.indexOf('</header>'));
    const marked = (header.match(CURRENT_RE) || []).length;
    const want = rel === '404.html' ? 0 : 1;
    if (marked !== want) errors.push(`${rel}: ${marked} header item(s) marked current; expected ${want}`);
  }

  if (!files.length) errors.push('no built pages found');
  report(errors, `Nav test (${files.length} pages)`);
}

main();
