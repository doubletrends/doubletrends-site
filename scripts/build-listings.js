/**
 * build-listings.js
 * Research listings generated from the page registry (title, desc, published,
 * series), so they never drift from the notes themselves: the research
 * library, the latest notes, the footer's Research column, and the
 * further-reading block that closes each note. Used by build-pages.js.
 */
const { SERIES, pages } = require('../src/site.config');
const { fmtDateLong } = require('../src/format');

const SERIES_ORDER = Object.keys(SERIES);
const byDate = (a, b) => (b.schema.datePublished.localeCompare(a.schema.datePublished)) || a.title.localeCompare(b.title);
// The library lists research notes only; AlphaVerify is its own section.
const ARTICLES = pages.filter((p) => p.kind === 'article').sort(byDate);
const escAmp = (s) => s.replace(/&(?![a-z]+;|#[0-9]+;)/gi, "&amp;");

function entryHtml(a, root) {
  return `<li class="entry">
<span class="entry-date">${fmtDateLong(a.schema.datePublished)}</span>
<div><h3 class="entry-title"><a href="${root}${a.src}">${escAmp(a.title)}</a></h3><p class="entry-abstract">${escAmp(a.desc)}</p></div>
<span class="entry-series">${a.series} &middot; ${a.section}</span>
</li>`;
}

// Footer Research column: every research note, in library order (series,
// then registry order), under its page name. The first FOOTER_NOTES_SHOWN are
// always visible; a toggle at the bottom of the list reveals the rest. Without
// JavaScript every note shows and the toggle stays hidden.
const FOOTER_NOTES_SHOWN = 5;
const FOOTER_MORE_JS = "(function(){var b=document.querySelector('.footer-more-toggle');if(!b)return;var r=document.querySelectorAll('.footer-more-item');function s(o){for(var i=0;i<r.length;i++)r[i].hidden=!o;b.setAttribute('aria-expanded',String(o))}s(false);b.parentNode.hidden=false;b.addEventListener('click',function(){s(b.getAttribute('aria-expanded')!=='true')})})()";
function footerNotes(root) {
  const item = (a, cls = '') => `<li${cls}><a href="${root}${a.src}">${escAmp(a.crumb || a.title)}</a></li>`;
  const notes = SERIES_ORDER.flatMap((series) => pages.filter((p) => p.kind === 'article' && p.series === series));
  const shown = notes.slice(0, FOOTER_NOTES_SHOWN).map((a) => `          ${item(a)}`);
  const rest = notes.slice(FOOTER_NOTES_SHOWN);
  if (!rest.length) return shown.join('\n');
  return [
    ...shown,
    ...rest.map((a) => `          ${item(a, ' class="footer-more-item"')}`),
    `          <li hidden><button type="button" class="footer-more-toggle" aria-expanded="true"><span class="footer-more-closed">${rest.length} more notes</span><span class="footer-more-open">Fewer notes</span></button></li>`,
    `          <script>${FOOTER_MORE_JS}</script>`,
  ].join('\n');
}

function researchRecent(root, n = 3) {
  return `<ul class="entries">${ARTICLES.slice(0, n).map((a) => entryHtml(a, root)).join('\n')}</ul>`;
}

function researchLibrary(root) {
  return SERIES_ORDER.map((series) => {
    const list = ARTICLES.filter((a) => a.series === series);
    const id = series.toLowerCase().replace(/\s+/g, '-');
    return `<section class="section" id="${id}"><div class="wrap">
<div class="section-head"><div><span class="kicker">${series}</span><h2 class="h2">${SERIES[series]}</h2></div><span class="fine">${list.length} ${list.length === 1 ? 'note' : 'notes'}</span></div>
<ul class="entries">${list.map((a) => entryHtml(a, root)).join('\n')}</ul>
</div></section>`;
  }).join('\n');
}

// The notes' original closing promo blocks are replaced by one standard
// further-reading block: related notes from the same series, the method,
// the record, and a pointer to the indicator — no sales line.
function furtherReading(page, sigFirst) {
  const related = ARTICLES.filter((a) => a.series === page.series && a.src !== page.src).slice(0, 2);
  return `<section class="article-section article-further">
<span class="tag-overline">Further reading</span>
<ul class="further-list">
${related.map((a) => `<li><a href="${page.root}${a.src}">${escAmp(a.title)}</a><span>${a.series} &middot; ${fmtDateLong(a.schema.datePublished)}</span></li>`).join('\n')}
<li><a href="${page.root}indicator/methodology.html">Methodology</a><span>How the regime classification and the signal are constructed</span></li>
<li><a href="${page.root}indicator/performance.html">Performance</a><span>Every signal since ${sigFirst}, with what followed</span></li>
</ul>
<p class="fine-print">DoubleTrends research is published alongside the <a href="${page.root}indicator/index.html">DoubleTrends Regime Indicator</a>.</p>
</section>`;
}

module.exports = { escAmp, footerNotes, researchRecent, researchLibrary, furtherReading };
