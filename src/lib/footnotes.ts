/* Footnote numbering and export markup.

   A footnote's number is never stored on the node — a single reference has no
   way to know its position among its siblings, so the number is always derived
   from document order. That derivation happens twice, on the two sides of this
   file's established live/export split (same as ChartBlock and QrCodeBlock):

   - live, in FootnoteRefBlock's NodeView, counting prior refs straight off the
     ProseMirror doc, so it can never go stale mid-edit;
   - here, at export/Preview time, where no JS runs and the numbers have to be
     baked into the HTML.

   Both read the same source of truth — document order — so they can't disagree.

   Numbering restarts per chapter because each chapter is its own editor and its
   own exported file. That's also the convention: Atticus restarts footnote and
   end-of-chapter numbering with each chapter, and only end-of-book notes get
   the option of running continuously.

   This also upgrades the markup on the way out. Amazon and Apple both look for
   an `epub:type="noteref"` link pointing at an element marked `epub:type` of
   `footnote`, and that pairing is what turns a note into a tappable popup on
   Kindle and Apple Books instead of a jump to the bottom of the chapter. The
   `epub` prefix needs its namespace declared on <html>, which is xhtmlDoc's
   job in lib/epub.ts — this only emits the attributes. */

export const FOOTNOTE_LIST_CLASS = 'book-footnotes';

/** `<sup data-footnote-ref data-fid="…">` — attribute order is whatever TipTap
    serialised, so match on the marker attribute and pull the id separately. */
const REF_PATTERN = /<sup\b[^>]*\bdata-footnote-ref\b[^>]*>[\s\S]*?<\/sup>/gi;
const FID_PATTERN = /\bdata-fid="([^"]*)"/i;

/** Numbers every footnote reference in `html` by document order, links each one
    to its note, and gives the matching list item an id and a back-link. Safe to
    call on HTML with no footnotes in it — it returns the input untouched. */
export function applyFootnoteNumbering(html: string, chapterKey = 'c'): string {
  const order: string[] = [];
  const numbered = html.replace(REF_PATTERN, (whole) => {
    const fid = whole.match(FID_PATTERN)?.[1];
    if (!fid) return whole;
    order.push(fid);
    const n = order.length;
    const noteId = `fn-${chapterKey}-${n}`;
    const refId = `fnref-${chapterKey}-${n}`;
    /* role="doc-noteref" rather than epub:type alone: EPUB 3.3 is explicit
       that epub:type values don't map to accessibility APIs, so the ARIA role
       is what a screen reader actually acts on. The aria-label matters for the
       same reason — the link text is "1", which tells a listener nothing. */
    return `<sup id="${refId}" class="book-footnote-ref" data-footnote-ref="true" data-fid="${fid}">`
      + `<a epub:type="noteref" role="doc-noteref" href="#${noteId}" aria-label="Footnote ${n}">${n}</a></sup>`;
  });
  if (order.length === 0) return numbered;

  /* The notes themselves are list items carrying the same fid. Position would
     have been the cheaper pairing, but it breaks the moment someone deletes the
     second of three notes — an id survives that. */
  return numbered.replace(/<li\b([^>]*)>/gi, (whole, attrs: string) => {
    const fid = attrs.match(FID_PATTERN)?.[1];
    if (!fid) return whole;
    const n = order.indexOf(fid) + 1;
    if (n === 0) return whole;
    return `<li${attrs} id="fn-${chapterKey}-${n}" epub:type="footnote" role="doc-footnote">`;
  });
}

/** Strips footnote sections and references out of HTML — for the contexts that
    want prose only, like word counts and the subheading derivation. */
export function stripFootnotes(html: string): string {
  return html
    .replace(new RegExp(`<ol\\b[^>]*class="[^"]*${FOOTNOTE_LIST_CLASS}[^"]*"[^>]*>[\\s\\S]*?</ol>`, 'gi'), '')
    .replace(REF_PATTERN, '');
}
