'use strict';
/**
 * Scroll reveal: tags the blocks of <main> with data-reveal, which
 * public/js/scroll-reveal.js fades up (src/styles/components/motion.css).
 *
 * What reveals, as a whole block:
 *   hero text     the text of section.hero (its photo and the image band stay
 *                 put), header.article-hero, div.page-hero, header.page-head;
 *                 these lead the first-screen cascade
 *   sections      every <section> of <main> that starts after the page's <h1>
 *   panels        each .legal-section, and the ul.entries / p.note of the
 *                 narrow pages (404, success), which sit in no section
 *
 * A block is atomic: a data-reveal inside another is dropped, keeping the
 * outermost, so nothing animates twice. Contract: tests/test-reveal.js.
 */

const tagged = (attrs) => /\bdata-reveal\b/.test(attrs);
const addReveal = (tag) => tag.replace(/\s*\/?>$/, (end) => ` data-reveal${end}`);

// Index just past the element that opens at `start` (same-name tags counted).
function elementEnd(html, name, start) {
  const re = new RegExp(`<(/?)${name}\\b[^>]*>`, 'gi');
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return re.lastIndex;
  }
  return html.length;
}

function dropNestedReveals(main) {
  const spans = [];
  const re = /<([a-zA-Z0-9]+)\b[^>]*\bdata-reveal\b[^>]*>/g;
  let m;
  while ((m = re.exec(main))) spans.push({ start: m.index, end: elementEnd(main, m[1], m.index) });
  const nested = spans
    .filter((s) => spans.some((p) => p !== s && s.start > p.start && s.start < p.end))
    .map((s) => s.start)
    .sort((a, b) => b - a); // right to left keeps indices valid
  let out = main;
  for (const pos of nested) {
    const gt = out.indexOf('>', pos);
    out = out.slice(0, pos) + out.slice(pos, gt + 1).replace(/\s+data-reveal\b/, '') + out.slice(gt + 1);
  }
  return out;
}

function applyReveal(html) {
  return html.replace(/(<main\b[^>]*>)([\s\S]*?)(<\/main>)/, (_, open, body, close) => {
    const h1 = body.search(/<h1\b/);
    let out = body;

    // Hero text.
    out = out.replace(/(<section\b[^>]*\bclass="[^"]*\bhero\b[^"]*"[^>]*>\s*)(<div\b[^>]*\bclass="[^"]*\bwrap\b[^"]*"[^>]*>)/g,
      (all, section, wrap) => (tagged(wrap) ? all : section + addReveal(wrap)));
    out = out.replace(/<(header|div)\b[^>]*\bclass="[^"]*\b(?:article-hero|page-hero|page-head)\b[^"]*"[^>]*>/g,
      (tag) => (tagged(tag) ? tag : addReveal(tag)));

    // Sections after the <h1>. Offsets shift as tags grow, so find the h1 again.
    const h1Now = out.search(/<h1\b/);
    out = out.replace(/<section\b[^>]*>/g, (tag, offset) =>
      (h1 !== -1 && offset < h1Now) || tagged(tag) ? tag : addReveal(tag));

    // Panels outside any section.
    out = out.replace(/<(div|ul|p)\b[^>]*\bclass="(?:[^"]*\s)?(?:legal-section|entries|note)(?:\s[^"]*)?"[^>]*>/g,
      (tag) => (tagged(tag) ? tag : addReveal(tag)));

    return open + dropNestedReveals(out) + close;
  });
}

module.exports = { applyReveal, elementEnd };
