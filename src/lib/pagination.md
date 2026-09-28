# Pagination contract

What the page engine guarantees, what it refuses to do, and how to tell that a
change broke it. The reasoning behind each decision — including the approaches
that failed — lives in the comments in `pagination.ts`; this document does not
repeat it. If a sentence here would need editing after an ordinary refactor, it
is in the wrong place and belongs in a code comment instead.

## Overview

A chapter is one ProseMirror editor. Page boundaries are widget decorations
inserted into its layout, not nodes in its document: a break is a spacer `div`
that pushes the content after it onto the next sheet. The document itself never
changes, which is why undo, serialization, find, export and every existing
`getBoundingClientRect` measurement keep working untouched.

The obvious alternative — one editor per page — is where projects like this die.
The caret cannot cross an editor boundary, so backspace-at-top-of-page, a
selection spanning a break, undo across a reflow and find-and-replace all have to
be rebuilt by hand.

## Terms

The domain already has names for all of this, in CSS Fragmentation Level 3
(`css-break-3`). Where our code has its own word, the spec term is the one to
think in.

| Our name | Spec term | What it is |
|---|---|---|
| band | fragmentainer | The usable strip of one page: `[bandTop(i), bandTop(i) + contentH]`, shortened by that page's reserve |
| "moves whole" | monolithic | A block that cannot be broken across a boundary, so it moves down entire |
| break | fragmentation break | One entry in `PageBreak[]`: a spacer, plus a line index when it splits a paragraph |
| spacer | — | The rendered `div` a break becomes; carries no margins, so nothing collapses across one |
| reserve | — | Room kept clear at the foot of a page for the footnotes whose markers land on it |
| stack | — | One chapter's sheets, drawn stacked with `PAGE_GAP` between them |
| stuck | — | The forward-only record of which page each footnote was last assigned to |

## The contract

`measureBreaks(blocks, geometry, reserve)` is a **pure function**. It takes the
flow as it is rendered right now, and returns where the pages end.

**In**

- `FlowBlock[]` — one entry per top-level block, in rendered pixels measured from
  the top of the first block, with any spacers already present included.
  `lineHeight` and `lineCount` are set only on blocks that may be split.
- `PageGeometry` — the trim box in canvas pixels. Read through a getter rather
  than captured, so changing trim size or margins repaginates every chapter
  without rebuilding the editors and losing caret, history and scroll.
- `PageReserve` — footnote room per page, already clamped by the caller.

**Out**

- `breaks` — what to draw, consumed by the `Pagination` plugin's decorations.
- `pageCount` — reported through `onLayout`, and from there to `stackHeight` for
  the sheet stack, the Pages panel, and page-number indices.

Nothing else reads the engine. If a new consumer needs more than `pageCount`, it
belongs in this return value rather than in a second measurement pass.

## Break rules

- **A plain paragraph fragments at a line**, with Word's two-line orphan and widow
  minimums: never strand an opening line at the foot of a page, never send a
  single closing line over on its own. When the minimums leave nowhere legal to
  break, the paragraph moves whole instead. See `splitLines`.
- **A data table fragments at its row boundaries.** A break is never taken that
  would leave the header row alone at the foot of a page — the table's orphan
  rule — and when nothing legal can stay behind, the table moves whole instead.
  The header is **not** repeated on the continuation: Word and Google Docs both
  treat that as a per-table opt-in rather than something the editor does on its
  own, so a break costs its spacer and nothing more. See `splitRows`.
- **Figures, headings, blockquotes and layout tables are monolithic.** Their boxes
  paint a border, rule or background that would draw straight through the page
  gap, and a heading cut off from its own first line is what keep-with-next exists
  to prevent. A layout table — `book-split-columns`, a stack — is monolithic
  *because* its single row is a set of side-by-side columns: breaking it at a row
  boundary either does nothing or cuts every column off mid-flow.
- **Footnotes take their room first.** A note shortens the band of the page its
  marker lands on, so where a block ends up depends on what the notes have already
  claimed. The reserve is an input to the measurement, not a correction after it.

## Invariants

A change that breaks one of these does not fail loudly — it hangs the reflow loop
or oscillates. Several are stated as an absence, which is the point.

1. **Measurement never mutates style.** Writing style and reading layout in one
   pass makes the `ResizeObserver` observe its own effect, and the loop runs
   forever. Read the flow as if unpaginated by *subtracting* existing spacers,
   never by zeroing them.
2. **Spacer heights are rounded.** A sub-pixel page height makes two consecutive
   measurements differ forever and the loop never settles.
3. **No dispatch unless the layout actually changed.** `sameBreaks` and
   `sameNotes` gate every dispatch, and their 1px tolerance is what stops
   oscillation.
4. **A break already applied must be re-emitted by the next pass**, or it
   disappears and the block snaps back. This is why `page` advances only when a
   break is pushed, and why splitting is attempted before a move is accounted for.
5. **Pagination transactions never enter history** (`addToHistory: false`). A
   reflow is not an edit.
6. **Footnote assignment only moves forward** while the document is unchanged. A
   note takes room from its own page, which can push its marker to the next page,
   which frees the band and brings it back: that cycle has no fixpoint. `stuck`
   makes the assignment monotonic and therefore bounded. An actual edit clears it.
7. **Line indices stay parity-matched** with the screen line rects that convert
   them back into document positions. `measureBreaks` names a line by number;
   spacer rects and multi-rect styled runs must be filtered out before indexing,
   or every break after the first lands one line off.

## Known limits

These are deliberate, not oversights. Each says what would have to change.

- **A single table row taller than a band still overruns.** Row fragmentation can
  only break *between* rows, so a row taller than the band it lands on takes its
  page and spills, the same way an over-tall figure does.
- **A layout table taller than a band has nowhere to go.** It is monolithic by
  design (see above), so it moves whole and overruns. Fragmenting one means
  flowing each column independently, which this engine has no model for.
- **A block already at its band top is allowed to overrun.** There is nothing left
  to move it past, and moving it would loop, since it overflows wherever it lands.
- **A break whose line yields no resolvable document position is dropped.** That
  overflows one page, which beats breaking in the wrong place.
- **Footnote reserve is capped at half a page** (`footnoteReserveMax`). Past that,
  notes stop taking room from the body, because a page still has to be a page.
  The clamp is applied by the `Pagination` plugin, not inside `measureBreaks` —
  the pure function trusts the reserve it is handed.
- **This model is screen-and-print only.** EPUB reflows in the reader and ignores
  it entirely; there is no PDF export in the prototype. Nothing here describes
  what a reader will show.

## Fixtures

Cases against the pure function, at a small fixture geometry so the arithmetic
stays checkable by hand:

```
G = { w: 300, h: 240, padX: 20, padY: 20 }
contentH(G) = 200   PAGE_GAP = 28   band pitch = 268   footnoteReserveMax(G) = 100
para(top, n)  = { top, bottom: top + n*20, spacerBefore: 0, lineHeight: 20, lineCount: n }
mono(top, h)  = { top, bottom: top + h, spacerBefore: 0 }
table(top, headerH, rows) = { top, bottom, spacerBefore: 0, headerH,
                              rows: [0, headerH, headerH+30, ...] }
```

`rows` and `bottom` are UNPAGINATED: the caller subtracts the spacer rows and
repeated headers it has already inserted, the same way it subtracts paragraph
spacers. `top` may be the rendered one.

| Case | Input | Expected |
|---|---|---|
| `fits` | `para(0, 5)` | no breaks, `pageCount` 1 |
| `long-paragraph` | `para(0, 30)` | splits at `lineIndex` 10 and 20, both `height` 68, `pageCount` 3 |
| `orphan` | `para(180, 6)` | refuses to split at line 1; moves whole, `height` 88, `pageCount` 2 |
| `widow` | `para(120, 5)` | pulls the break back to `lineIndex` 3 rather than stranding the last line, `height` 88 |
| `monolithic-move` | `para(0, 5)`, `mono(100, 140)` | moves the figure whole, `height` 168, `pageCount` 2 |
| `monolithic-overrun` | `para(0, 2)`, `mono(40, 300)` | moves whole, `height` 228, `pageCount` 3 — and still overruns; this is the limit above, asserted rather than hidden |
| `table-fragment` | `table(0, headerH 30, 8 rows of 30)` | breaks before `rowIndex` 6, `height` 88, `pageCount` 2 |
| `table-orphan-header` | `table(190, headerH 30, 3 rows of 30)` | nothing legal can stay behind, so it moves whole: `height` 78, no `rowIndex` |
| `table-no-header` | `table(0, headerH 0, 9 rows of 30)` | breaks before `rowIndex` 6, `height` 88 — the earliest legal break is row 1, not row 2 |
| `table-continuation` | `table(0, headerH 30, 20 rows of 30)` | breaks before rows 6, 12 and 18, every `height` 88, `pageCount` 4 — evenly spaced, because a continuation pays for its spacer and nothing else |
| `table-with-reserve` | `table(0, headerH 30, 8 rows)` with `reserve[0] = 60` | breaks earlier, before `rowIndex` 4, `height` 148 |
| `reserve` | `para(0, 9)` with `reserve[0] = 60` | splits at `lineIndex` 7, `height` 128 — the same input with no reserve does not break at all |
| `converges` | re-measure `monolithic-move` with the spacer applied (`top` 268, `spacerBefore` 168) | identical breaks; `sameBreaks` true on every further pass |

Every number above was produced by running `measureBreaks`, not derived on paper.
There is no test runner in this repo yet; these are written so they convert to
test bodies unchanged the day there is one.
