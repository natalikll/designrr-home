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

   Footnotes are part of the page geometry rather than a block at the end of
   the chapter: a page's text band is shortened by the notes whose markers land
   on it (see PageReserve), and the editor positions those notes in the room
   that leaves. Which is why the reserve is an input here — where a block ends
   up depends on how much of each page the notes have already claimed.

   A paragraph that straddles a boundary is split at a line, the way a book
   does it: the spacer goes inside the paragraph and the text carries on at the
   top of the next page, with Word's two-line orphan and widow minimums. Only a
   plain paragraph splits. A figure, table, heading or blockquote moves down
   whole — their boxes paint a border, rule or background that would draw
   straight through the page gap, and a heading cut off from its own first line
   is what keep-with-next exists to prevent. */

/* ── page geometry ────────────────────────────────────────────────────────────
   Trim size and margins are a book SETTING, so everything below takes the page
   it is measuring against rather than reading a constant. The canvas draws at
   a fixed scale — PX_PER_IN — so the sheet on screen keeps the proportions of
   the trim size you picked, and zoom stays the separate control it already
   was. */

/** Canvas pixels per inch. Chosen so the default 8.5in page is the 720px sheet
    this editor has always drawn, which keeps every thumbnail, template preview
    and zoom step where it was. */
export const PX_PER_IN = 720 / 8.5;

/** A page's own box, in canvas pixels. */
export interface PageGeometry {
  /** Outer sheet. */
  w: number;
  h: number;
  /** The sheet's own margins — content lives inside these. */
  padX: number;
  padY: number;
}

export interface PageSize {
  id: string;
  label: string;
  /** Trim size in inches, which is how a printer and every book tool state it. */
  inW: number;
  inH: number;
}

/** Offered in Book settings. Letter first because it's the default, then the
    three trade sizes a self-published book actually gets printed at, then the
    two ISO sizes for everywhere that isn't the US. */
export const PAGE_SIZES: PageSize[] = [
  { id: 'letter', label: 'US Letter', inW: 8.5, inH: 11 },
  { id: 'trade', label: 'US Trade', inW: 6, inH: 9 },
  { id: 'digest', label: 'Digest', inW: 5.5, inH: 8.5 },
  { id: 'a4', label: 'A4', inW: 8.27, inH: 11.69 },
  { id: 'a5', label: 'A5', inW: 5.83, inH: 8.27 },
];

export const DEFAULT_PAGE_SIZE = 'letter';
/** Margins in inches, the unit the setting is expressed in. Both sit on the
    eighth-inch grid the stepper moves in, so its first press is a full step
    rather than a snap onto the grid. */
export const DEFAULT_MARGIN_X = 0.75;
export const DEFAULT_MARGIN_Y = 0.625;

/** Turns a chosen size and margins into the pixel box everything measures
    against. Rounded, because a sub-pixel page height makes two consecutive
    measurements differ forever and the reflow loop never settles. */
export function pageGeometry(sizeId: string, marginX: number, marginY: number): PageGeometry {
  const size = PAGE_SIZES.find((s) => s.id === sizeId) ?? PAGE_SIZES[0];
  return {
    w: Math.round(size.inW * PX_PER_IN),
    h: Math.round(size.inH * PX_PER_IN),
    padX: Math.round(marginX * PX_PER_IN),
    padY: Math.round(marginY * PX_PER_IN),
  };
}

export const DEFAULT_GEOMETRY = pageGeometry(DEFAULT_PAGE_SIZE, DEFAULT_MARGIN_X, DEFAULT_MARGIN_Y);

/* The default geometry's parts, for the handful of module-level things that
   are about the EDITOR rather than about the user's book — a template row's
   preview scale, the preview overlay's device widths. Those show a design, not
   this book's trim, so they stay where they are when the trim changes. */
export const PAGE_W = DEFAULT_GEOMETRY.w;
export const PAGE_H = DEFAULT_GEOMETRY.h;

/** Usable height for content on one page. */
export function contentH(g: PageGeometry): number { return g.h - g.padY * 2; }

/** Visual gap between two stacked pages of the same chapter. Canvas chrome,
    not page geometry — it doesn't change with the trim size. */
export const PAGE_GAP = 28;

/** Clear space between the last line of body text on a page and the rule above
    that page's footnotes. */
export const FOOTNOTE_GAP = 20;
/** A page still has to be a page. Notes past this much of it stop taking room
    from the body — without the ceiling, a long enough note leaves no band for
    the text that references it and the flow has nowhere left to go. */
export function footnoteReserveMax(g: PageGeometry): number { return Math.round(contentH(g) * 0.5); }

/** Which page a rendered y (in the same coordinates as FlowBlock) falls on. */
export function pageOfTop(top: number, g: PageGeometry): number {
  return Math.max(0, Math.floor(top / (g.h + PAGE_GAP)));
}

/** Room kept clear at the FOOT of each page for the footnotes whose markers
    land on it, indexed by page. Empty for a chapter with no notes. */
export type PageReserve = readonly number[];

/** Where page `i`'s content band ends once its footnotes have taken their
    room. Every overflow test in this file goes through here. */
function bandEnd(page: number, g: PageGeometry, reserve: PageReserve): number {
  return bandTop(page, g) + contentH(g) - (reserve[page] ?? 0);
}

/** How tall a spacer has to be to carry the flow from the bottom of one page's
    content box to the top of the next: the unused tail of this page, then the
    bottom padding, the gap, and the next page's top padding. */
export function spacerHeight(usedOnPage: number, g: PageGeometry): number {
  // Rounded, because sub-pixel text metrics otherwise make two consecutive
  // measurements differ by a fraction of a pixel forever, and the reflow loop
  // never settles.
  return Math.round(Math.max(0, contentH(g) - usedOnPage)) + g.padY + PAGE_GAP + g.padY;
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
export function bandTop(i: number, g: PageGeometry): number { return i * (g.h + PAGE_GAP); }

/** One paragraph's splits, laid out from `top` with its first line on page
    `page`. Returns null when it can't be split politely, which is the caller's
    signal to move it whole instead.

    Everything is derived from UNPAGINATED line positions (top + n * line
    height) plus the spacers this call is itself deciding on. An earlier
    attempt corrected each spacer from where its line currently sat, which
    works between blocks but not inside one: once a spacer is in the paragraph
    the line rects have already been displaced by it, so re-adding its height
    double-counts and runs away — a spacer of 367,104px and a reflow that never
    settled. Deriving instead of correcting converges in a single pass. */
function splitLines(b: FlowBlock, top: number, page: number, g: PageGeometry, reserve: PageReserve): { breaks: PageBreak[]; endPage: number } | null {
  const lh = b.lineHeight;
  const n = b.lineCount;
  if (b.pos == null || !lh || !n || n < 2) return null;
  const out: PageBreak[] = [];
  let added = 0;
  let p = page;
  for (let j = 1; j < n; j++) {
    // Where this line lands once the spacers decided so far are applied.
    if (top + j * lh + lh + added <= bandEnd(p, g, reserve)) continue;
    /* Orphan and widow control, the same two-line minimum Word applies: never
       strand a paragraph's opening line at the foot of a page, and never send
       a single closing line over on its own. */
    let at = j;
    if (at === 1) at = 0;
    if (at > 0 && n - at === 1) at -= 1;
    if (at < 1) return null;
    p++;
    const height = Math.round(bandTop(p, g) - (top + at * lh) - added);
    if (height <= 0) return null;
    out.push({ pos: b.pos, lineIndex: at, height });
    added += height;
    j = at; // carry on scanning from the line that now opens the new page
  }
  return out.length ? { breaks: out, endPage: p } : null;
}

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
    [bandTop(i), bandTop(i) + contentH(g)], a block that overruns its band
    starts the next page, and the spacer it needs is the difference between
    where it should be and where it currently is. The measurement runs again
    after each dispatch, so this converges rather than having to be right in one
    pass — and sameBreaks' 1px tolerance is what stops it oscillating. */
export function measureBreaks(blocks: FlowBlock[], g: PageGeometry, reserve: PageReserve = []): Measured {
  const breaks: PageBreak[] = [];
  let page = 0;

  for (const b of blocks) {
    const end = bandEnd(page, g, reserve);
    const tall = b.bottom - b.top > end - bandTop(page, g);
    if (b.bottom <= end && !(tall && b.top > bandTop(page, g))) continue;
    if (b.pos == null) continue;

    /* Order matters here, and getting it wrong is what made long paragraphs
       run off the foot of the sheet. `page` advances only when a break is
       pushed — that is deliberate, since a break already applied by the last
       pass has to be re-emitted by this one or it disappears and the block
       snaps back. But it also means a block a previous pass moved down is
       still being judged against the band of the page ABOVE it, so splitting
       had to be attempted BEFORE that move was accounted for: every line read
       as overflowing, the orphan rule refused to split at line 0, and the
       paragraph fell through to a whole-block move it then overran.

       So: try to split where the block currently sits; failing that, move it
       and try again from the top of its new page. */
    const s = splitLines(b, b.top, page, g, reserve);
    if (s) { breaks.push(...s.breaks); page = s.endPage; continue; }

    /* Already at or above this page's top — a previous pass put it here, or it
       opens the chapter. There is nothing left to move it past, so it takes
       the page and is allowed to overrun; moving it would loop forever, since
       it overflows wherever it lands. Reaching here at all means it overran,
       so the page is spent either way. */
    if (b.top <= bandTop(page, g)) { page++; continue; }

    page++;
    breaks.push({ pos: b.pos, height: Math.round(b.spacerBefore + (bandTop(page, g) - b.top)) });
    // A paragraph longer than a page still overruns after the move, so split
    // its tail from the top of the page it just landed on.
    const after = splitLines(b, bandTop(page, g), page, g, reserve);
    if (after) { breaks.push(...after.breaks); page = after.endPage; continue; }
    // Unsplittable and still too tall for where it landed — measured against
    // the NEW page's band, whose footnote reserve is its own.
    if (b.bottom - b.top > bandEnd(page, g, reserve) - bandTop(page, g)) page++;
  }

  return { breaks, pageCount: page + 1 };
}

/** Top offset, within the chapter's stack, of page `i`'s sheet. */
export function pageTop(i: number, g: PageGeometry): number {
  return i * (g.h + PAGE_GAP);
}

/** Total height of a chapter rendered as `pageCount` stacked sheets. */
export function stackHeight(pageCount: number, g: PageGeometry): number {
  return pageCount * g.h + Math.max(0, pageCount - 1) * PAGE_GAP;
}
