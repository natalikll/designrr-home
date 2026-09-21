/* Fixed-size pages for the chapter editor.

   Until now a chapter was one elastic sheet: `minHeight: PAGE_MIN_H` and it
   simply grew as you typed, so a 20-page chapter was one very tall page. That
   made "page" mean "section" everywhere it mattered — the Pages panel counted
   sections, page numbers were indexed per section, and the print settings
   promised a pagination the canvas didn't model.

   WHY THIS APPROACH. A chapter stays ONE ProseMirror editor and the page
   boundaries are inserted into its layout as widget decorations. The obvious
   alternative — one editor per page — is where projects like this die: the
   caret can't cross an editor boundary, so backspace-at-top-of-page, a
   selection spanning a break, undo across a reflow and find-and-replace all
   have to be rebuilt by hand, and every edit near a boundary reflows content
   between two independent documents. Decorations are layout-only: the document
   never changes, so serialization, undo, export and every existing measurement
   that reads getBoundingClientRect keep working untouched.

   A break is always placed BEFORE a top-level block, never inside one. That
   means a paragraph that would straddle the boundary moves down whole rather
   than splitting mid-line. Real typesetting splits paragraphs across pages, and
   this doesn't — it's the honest v1 limit, and it's visible as a ragged bottom
   edge on pages that end with a long paragraph. Splitting mid-paragraph needs
   line-box measurement rather than block measurement; see measureBreaks below
   for where that would go. */

/** Outer page box, matching the canvas sheet. */
export const PAGE_W = 720;
export const PAGE_H = 920;
/** The sheet's own padding — content lives inside this. */
export const PAGE_PAD_X = 63;
export const PAGE_PAD_Y = 55;
/** Usable height for content on one page. */
export const PAGE_CONTENT_H = PAGE_H - PAGE_PAD_Y * 2;
/** Visual gap between two stacked pages of the same chapter. */
export const PAGE_GAP = 28;

/** How tall a spacer has to be to carry the flow from the bottom of one page's
    content box to the top of the next: the unused tail of this page, then the
    bottom padding, the gap, and the next page's top padding. */
export function spacerHeight(usedOnPage: number): number {
  // Rounded, because sub-pixel text metrics otherwise make two consecutive
  // measurements differ by a fraction of a pixel forever, and the reflow loop
  // never settles.
  return Math.round(Math.max(0, PAGE_CONTENT_H - usedOnPage)) + PAGE_PAD_Y + PAGE_GAP + PAGE_PAD_Y;
}

export interface Measured {
  breaks: PageBreak[];
  /** Total pages this chapter occupies, always at least 1. */
  pageCount: number;
}

/** Two measurements are equal when they'd produce the same layout. Compared
    before dispatching, because a reflow that changes nothing must not loop. */
export function sameBreaks(a: PageBreak[], b: PageBreak[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.pos === b[i].pos && Math.abs(x.height - b[i].height) < 1);
}

/** One top-level block as it is RENDERED right now: pixels from the top of the
    first block, with whatever spacers already exist included. */
export interface FlowBlock {
  /** null when the element's document position wouldn't resolve. Such a block
      still occupies space, so it counts toward the page, but a break can't be
      anchored to it. */
  pos: number | null;
  top: number;
  bottom: number;
  /** Height of the spacer immediately before this block, 0 if there is none. */
  spacerBefore: number;
  /** Set only for blocks that may be split mid-way — a plain paragraph. A
      figure, table, heading or blockquote must move whole: their boxes paint a
      border, rule or background that would draw straight through the page gap,
      and a heading cut off from its own first line is what keep-with-next
      exists to prevent. */
  lineHeight?: number;
  lineCount?: number;
}

/** What a break does: move the whole block down, or split it at a line. */
export interface PageBreak {
  pos: number;
  height: number;
  /** Which line of the block the break falls before. Absent for a whole-block
      break. */
  lineIndex?: number;
}

/** Where page `i`'s content band starts and ends, in the same rendered
    coordinates as FlowBlock — measured from the first block's top. */
export function bandTop(i: number): number { return i * (PAGE_H + PAGE_GAP); }

/** Decides where pages end, working directly in rendered coordinates.

    Two earlier attempts failed and both failure modes are worth keeping:

    1. Summing offsetHeight + marginTop + marginBottom per block was wrong by
       ~30px on a five-block chapter, because adjacent block margins COLLAPSE —
       adding both sides double-counts every gap.
    2. Computing spacers from unpaginated flow arithmetic landed every page a
       few pixels low, because inserting a spacer BREAKS the margin collapse
       between the blocks it separates, so the real displacement is the spacer
       plus a margin that used to be shared. Correcting only the spacer height
       fixed the page starts but not the page ENDS, so a paragraph could still
       straddle the boundary by those few pixels.

    Working in rendered space sidesteps both: page `i`'s content band is exactly
    [bandTop(i), bandTop(i) + PAGE_CONTENT_H], a block that overruns its band
    starts the next page, and the spacer it needs is the difference between
    where it should be and where it currently is. The measurement runs again
    after each dispatch, so this converges rather than having to be right in one
    pass — and sameBreaks' 1px tolerance is what stops it oscillating. */
export function measureBreaks(blocks: FlowBlock[]): Measured {
  const breaks: PageBreak[] = [];
  let page = 0;

  for (const b of blocks) {
    /* Catch `page` up to where this block actually SITS before judging it.
       `page` used to advance only when a break was pushed, so a block that a
       previous pass had already moved down was still measured against the band
       of the page above it. Everything then read as overflowing from its very
       first line, the orphan rule below refused to split at line 0, and the
       paragraph fell through to a whole-block move that overran the sheet. The
       1px slack absorbs sub-pixel text metrics at a band edge. */
    while (b.top >= bandTop(page + 1) - 1) page++;
    const bandEnd = bandTop(page) + PAGE_CONTENT_H;
    const tall = b.bottom - b.top > PAGE_CONTENT_H;
    if (b.bottom <= bandEnd && !(tall && b.top > bandTop(page))) continue;
    if (b.pos == null) continue;

    /* Split the paragraph rather than moving it whole. Moving whole is what
       the first version did, and it left a ragged band of white at the foot of
       every page that ended in a long paragraph — real books break paragraphs
       across pages.

       Everything here is computed from UNPAGINATED line positions
       (block top + n * line height) and the spacers this pass is itself
       deciding on. An earlier attempt corrected each spacer from where its line
       currently sat, which works between blocks but not inside one: once a
       spacer is in the paragraph, the line rects have already been displaced by
       it, so re-adding its height double-counts and runs away — a spacer of
       367,104px and a reflow that never settled. Deriving instead of correcting
       converges in a single pass. */
    if (b.lineHeight && b.lineCount && b.lineCount > 1 && b.pos != null) {
      const lh = b.lineHeight;
      const unpaginatedTop = (j: number) => b.top + j * lh;
      let added = 0;
      let split = false;
      for (let j = 1; j < b.lineCount; j++) {
        // Where this line would sit once the spacers decided so far are applied.
        const lineBottom = unpaginatedTop(j) + lh + added;
        if (lineBottom <= bandTop(page) + PAGE_CONTENT_H) continue;
        /* Orphan and widow control, the same two-line minimum Word applies:
           never strand a paragraph's opening line at the foot of a page, and
           never send a single closing line over on its own. */
        let at = j;
        if (at === 1) at = 0;
        if (at > 0 && b.lineCount - at === 1) at -= 1;
        if (at < 1) break; // can't split politely — fall through to a whole move
        page++;
        const height = Math.round(bandTop(page) - unpaginatedTop(at) - added);
        if (height <= 0) break;
        breaks.push({ pos: b.pos, lineIndex: at, height });
        added += height;
        split = true;
        j = at; // continue scanning from the line that now opens the new page
      }
      if (split) continue;
    }

    /* A block taller than a whole page can't be made to fit by moving it, so it
       takes a page of its own and is allowed to overrun. Moving it would loop
       forever: it overflows wherever it lands. */
    if (b.top <= bandTop(page)) { if (tall) page++; continue; }
    page++;
    breaks.push({ pos: b.pos, height: Math.round(b.spacerBefore + (bandTop(page) - b.top)) });
  }

  return { breaks, pageCount: page + 1 };
}

/** Top offset, within the chapter's stack, of page `i`'s sheet. */
export function pageTop(i: number): number {
  return i * (PAGE_H + PAGE_GAP);
}

/** Total height of a chapter rendered as `pageCount` stacked sheets. */
export function stackHeight(pageCount: number): number {
  return pageCount * PAGE_H + Math.max(0, pageCount - 1) * PAGE_GAP;
}
