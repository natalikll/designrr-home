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
   plain paragraph splits that way; a data table fragments at its row
   boundaries instead. A figure, heading, blockquote or layout table moves down
   whole — their boxes paint a border, rule or background that would draw
   straight through the page gap, and a heading cut off from its own first line
   is what keep-with-next exists to prevent.

   The contract this engine holds to — its invariants, its known limits and
   the fixture cases that check them — is written down in pagination.md. */

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
  /** The sheet's own margins — content lives inside these. Four sides, not an
      x/y pair: a page can be given a wider left than right (an inner margin for
      a book that will be bound) and a taller foot than head, and every measure
      in this file that used to double one value now adds the two it means. */
  padTop: number;
  padRight: number;
  padBottom: number;
  padLeft: number;
}

/** A page's four margins, in inches. */
export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
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
export const DEFAULT_MARGINS: PageMargins = {
  top: DEFAULT_MARGIN_Y, right: DEFAULT_MARGIN_X, bottom: DEFAULT_MARGIN_Y, left: DEFAULT_MARGIN_X,
};

/* ── Units ────────────────────────────────────────────────────────────────────
   Every length above is stored in inches and stays that way: the unit below is
   a DISPLAY choice, so the same book opened by a metric reader and an imperial
   one is the same book, and nothing downstream (pageGeometry, the exporters,
   a saved file) has to know which one was looking.

   It exists because the ISO sizes made the panel lie by omission. A4 was
   printed as "8.27 × 11.69 in" — true, and unrecognisable to the reader who
   knows that sheet as 210 × 297 mm, which is most of the people who pick it.

   Millimetres rather than centimetres, for the reason that example shows: mm is
   the unit ISO paper and print shops are quoted in, and at this scale it is the
   only one that needs no decimal point at all. Every trim size lands on a whole
   number of millimetres (210 × 297, 216 × 279, 148 × 210) and so does every
   margin on the grid below, where cm would print 21 × 29.7 and 1.9 cm. */
export type LengthUnit = 'in' | 'mm';

/** Per unit: its size, what the stepper's grid is, and how a number is written
    in it. One row per unit, so adding or swapping one is a data change.

    The grid is stated in the DISPLAY unit, not converted from one: a round
    number is only round in the unit you are reading. An eighth of an inch is
    3.175 mm, and a stepper that walked a metric reader through 19, 22, 25 would
    be arithmetically faithful and useless. 5 mm is the metric eighth — the
    increment printers quote margins and bleed at. */
export const UNIT_SPEC: Record<LengthUnit, { label: string; perIn: number; step: number; decimals: number; suffix: string }> = {
  /* No space before ″, a space before mm — each unit's own typographic
     convention, not a house style imposed on both. */
  in: { label: 'in', perIn: 1, step: 0.125, decimals: 3, suffix: '″' },
  mm: { label: 'mm', perIn: 25.4, step: 5, decimals: 0, suffix: ' mm' },
};

export const toUnit = (inches: number, unit: LengthUnit) => inches * UNIT_SPEC[unit].perIn;
export const toInches = (value: number, unit: LengthUnit) => value / UNIT_SPEC[unit].perIn;

/** A length written for the panel: converted, rounded to the unit's precision
    and stripped of the zeros that rounding leaves behind, so a margin reads
    0.75″ rather than 0.750″. The suffix is opt-in because the size tiles carry
    one unit for two numbers ("210 × 297 mm"). */
export function formatLength(inches: number, unit: LengthUnit, withSuffix = false): string {
  const spec = UNIT_SPEC[unit];
  const text = toUnit(inches, unit)
    .toFixed(spec.decimals)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  return withSuffix ? `${text}${spec.suffix}` : text;
}

/** "8.5 × 11 in" / "216 × 279 mm" — one unit named once, for a size tile. */
export const formatPageSize = (size: PageSize, unit: LengthUnit) =>
  `${formatLength(size.inW, unit)} × ${formatLength(size.inH, unit)} ${UNIT_SPEC[unit].label}`;

/** Turns a chosen size and margins into the pixel box everything measures
    against. Rounded, because a sub-pixel page height makes two consecutive
    measurements differ forever and the reflow loop never settles. */
export function pageGeometry(sizeId: string, margins: PageMargins): PageGeometry {
  const size = PAGE_SIZES.find((s) => s.id === sizeId) ?? PAGE_SIZES[0];
  return {
    w: Math.round(size.inW * PX_PER_IN),
    h: Math.round(size.inH * PX_PER_IN),
    padTop: Math.round(margins.top * PX_PER_IN),
    padRight: Math.round(margins.right * PX_PER_IN),
    padBottom: Math.round(margins.bottom * PX_PER_IN),
    padLeft: Math.round(margins.left * PX_PER_IN),
  };
}

export const DEFAULT_GEOMETRY = pageGeometry(DEFAULT_PAGE_SIZE, DEFAULT_MARGINS);

/* The default geometry's parts, for the handful of module-level things that
   are about the EDITOR rather than about the user's book — a template row's
   preview scale, the preview overlay's device widths. Those show a design, not
   this book's trim, so they stay where they are when the trim changes. */
export const PAGE_W = DEFAULT_GEOMETRY.w;
export const PAGE_H = DEFAULT_GEOMETRY.h;

/** Usable height for content on one page. */
export function contentH(g: PageGeometry): number { return g.h - g.padTop - g.padBottom; }

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
  return Math.round(Math.max(0, contentH(g) - usedOnPage)) + g.padBottom + PAGE_GAP + g.padTop;
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
  return a.every((x, i) => x.pos === b[i].pos
    && x.lineIndex === b[i].lineIndex
    && x.rowIndex === b[i].rowIndex
    && Math.abs(x.height - b[i].height) < 1);
}

/** One top-level block as it is RENDERED right now: pixels from the top of the
    first block, with whatever spacers already exist included. */
export interface FlowBlock {
  /** Opens a page whatever the flow would otherwise do — a chapter title with
      its "start on a new page" property on. Nothing else in this file forces a
      break; every other entry here describes what a block IS, and this is the
      one thing the author says about it directly. */
  forced?: boolean;
  /** null when the element's document position wouldn't resolve. Such a block
      still occupies space, so it counts toward the page, but a break can't be
      anchored to it. */
  pos: number | null;
  top: number;
  bottom: number;
  /** Height of the spacer immediately before this block, 0 if there is none. */
  spacerBefore: number;
  /** Set only for blocks that may be split mid-way — a plain paragraph. A
      figure, heading or blockquote must move whole: their boxes paint a
      border, rule or background that would draw straight through the page gap,
      and a heading cut off from its own first line is what keep-with-next
      exists to prevent. */
  lineHeight?: number;
  lineCount?: number;
  /** Set only on a DATA table, which fragments at row boundaries instead of at
      lines. Offsets from the block's top to each row's top, plus a final entry
      for the last row's bottom, so row `i` occupies [rows[i], rows[i + 1]).
      Unpaginated: the caller subtracts the spacer and repeated-header rows it
      has already inserted, exactly as it does for paragraph spacers.

      A layout table — `book-split-columns`, a stack — must NOT set this. Its
      one row is a set of side-by-side columns, so breaking it at a row
      boundary either does nothing or cuts the columns off mid-flow. */
  rows?: number[];
  /** Height of the header row, or 0/absent when the table has no header.
      It is NOT repeated on continuations — only used to keep a header from
      being stranded at the foot of a page with no body row under it. */
  headerH?: number;
}

/** What a break does: move the whole block down, or split it at a line. */
export interface PageBreak {
  pos: number;
  height: number;
  /** Which line of the block the break falls before. Absent for a whole-block
      break. */
  lineIndex?: number;
  /** Which row of the block the break falls before, for a table. Absent for a
      whole-block break or a line split. */
  rowIndex?: number;
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

/** One table's fragmentation, at row boundaries, laid out from `top` with its
    first row on page `page`. Returns null when it can't be fragmented
    politely, which is the caller's signal to move it whole instead.

    Two things make this different from splitLines. A row is not a uniform
    pitch, so the offsets come in measured rather than derived from a line
    height — but they are still UNPAGINATED offsets, and the displacement this
    call is itself deciding on is added back the same way, for the same reason:
    correcting from where a row currently sits double-counts the spacer that
    put it there.

    A continuation does NOT repeat the header row, so a break costs its spacer
    and nothing else. The header's height still matters for where the first
    break may fall — see `first` below. */
function splitRows(b: FlowBlock, top: number, page: number, g: PageGeometry, reserve: PageReserve): { breaks: PageBreak[]; endPage: number } | null {
  const rows = b.rows;
  // rows holds one entry per row plus a closing bottom, so 3 entries is the
  // smallest table with anything to break BETWEEN.
  if (b.pos == null || !rows || rows.length < 3) return null;
  const headerH = b.headerH ?? 0;
  /* Never strand a header row at the foot of a page with nothing under it:
     with a header, the earliest legal break leaves it at least one body row
     for company. This is the table's orphan rule. */
  const first = headerH > 0 ? 2 : 1;
  const out: PageBreak[] = [];
  let added = 0;
  let p = page;
  for (let j = first; j < rows.length - 1; j++) {
    // Where this row's BOTTOM lands once the breaks decided so far are applied.
    if (top + rows[j + 1] + added <= bandEnd(p, g, reserve)) continue;
    /* What stays behind has to fit. This only ever fails on the first break —
       any later row is reached by the `continue` above, which already proved
       its predecessor fitted — and it means the table starts too far down the
       page to leave anything legal behind, so the caller moves it whole. */
    if (top + rows[j] + added > bandEnd(p, g, reserve)) return null;
    p++;
    const height = Math.round(bandTop(p, g) - (top + rows[j] + added));
    if (height <= 0) return null;
    out.push({ pos: b.pos, rowIndex: j, height });
    added += height;
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
    /* An authored break, taken before any measurement: this block opens a page
       because the author said so, not because the one above it ran out of room.

       The guard is what makes it idempotent. Once the break has been applied,
       the spacer has pushed `b.top` down to the new band's top, so on the next
       pass `b.top > bandTop(page)` is still true (the loop's `page` has not
       advanced past the sheet above yet) and the same break is re-emitted with
       the same height — `bandTop(page) - b.top` collapses to 0 and only
       `spacerBefore` remains. A block already at the top of its band, including
       the first block of a chapter, has nothing to be pushed past and is left
       alone.

       `continue` rather than falling through to the overflow tests: those were
       computed against the band this block just left. A chapter title is one or
       two lines and cannot overrun the page it was just given; anything that
       somehow did would be caught on the next measurement pass. */
    if (b.forced && b.pos != null && b.top > bandTop(page, g)) {
      page++;
      breaks.push({ pos: b.pos, height: Math.round(b.spacerBefore + (bandTop(page, g) - b.top)) });
      continue;
    }

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
       and try again from the top of its new page. A block carries line
       geometry or row geometry, never both, so the two attempts are exclusive
       and the order between them doesn't matter. */
    const s = splitLines(b, b.top, page, g, reserve) ?? splitRows(b, b.top, page, g, reserve);
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
    const after = splitLines(b, bandTop(page, g), page, g, reserve)
      ?? splitRows(b, bandTop(page, g), page, g, reserve);
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
