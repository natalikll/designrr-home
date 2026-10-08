/* ── Career Pathways — the Figma template, to spec ───────────────────────────
   Source: "Designerr templates by Max", node 2168:4642 (cover) and its sibling
   sections — content pages x8, chapters x4, TOC, back matter, CTA, workbook x4.

   Everything in this file is stated in the DESIGN's own units: the Figma board
   is an A4 sheet at 72dpi, 595 × 842pt, and every number below (a 40pt margin,
   an 82pt title, a 171pt white band) is lifted from it unchanged. `cp()` is the
   single place that converts, so the design can be read against Figma without
   arithmetic and the editor still draws it at its own scale.

   WHY THE TEMPLATE CARRIES A TRIM SIZE. A cover is positioned in percentages,
   so it adapts to any sheet — but only its POSITIONS do. A design laid out for
   a 1:1.414 page and drawn on a 1:1.294 one (US Letter) stretches vertically:
   the 171pt white band lands 24pt low, the title's two lines open up, and the
   dash field goes out of square. So the template sets the book to A4 when it is
   applied, the same way a Vellum style or a Canva template owns the page it was
   drawn for. The user can still change it afterwards in Book settings. */

/** The Figma board: A4 at 72dpi, which is the unit every number here is in. */
export const CP_W = 595;
export const CP_H = 842;

/** Trim size this template is drawn for — a PAGE_SIZES id. */
export const CP_PAGE_SIZE = 'a4';
/** 40pt margins on all four sides, as inches (the unit margins are stored in). */
export const CP_MARGIN_IN = 40 / 72;
export const CP_MARGINS = {
  top: CP_MARGIN_IN, right: CP_MARGIN_IN, bottom: CP_MARGIN_IN, left: CP_MARGIN_IN,
};

/* The editor draws A4 at 700 × 990 canvas px (PX_PER_IN × 8.27in). Font sizes
   on a cover are stored absolute, not as a percentage of the sheet, so they are
   converted once here rather than being guessed at. Positions are percentages
   and need no conversion — see cpX/cpY. */
const CP_CANVAS_W = 700;
/** A Figma length as canvas px, rounded — right for a font size, where a
    fraction of a pixel buys nothing. */
export const cp = (pt: number) => Math.round((pt * CP_CANVAS_W) / CP_W);
/** The same conversion unrounded, for lengths where the fraction IS the value:
    a -0.36pt tracking rounds to zero and the line comes out 8px wide of the
    design, and a 20pt leading rounded into a 21px font clips the ascenders. */
export const cpf = (pt: number) => (pt * CP_CANVAS_W) / CP_W;

/** A Figma x / y / width / height as the percentage a cover element stores. */
export const cpX = (pt: number) => (pt / CP_W) * 100;
export const cpY = (pt: number) => (pt / CP_H) * 100;

/* ── palette ──────────────────────────────────────────────────────────────── */
export const CP_COLOR = {
  /* Two near-blacks, both from the design and both deliberate: the page fill is
     pure #000 and the type on white is #010101. Not normalised to one value —
     matching the file is the point of this template. */
  page: '#000000',
  ink: '#010101',
  /* Grey/900 in the Figma library — the running-text ink, lighter than the
     headings so body copy sits back from them. */
  body: '#202124',
  paper: '#FFFFFF',
  /* The one chromatic colour in the whole template: chapter 1/4's page fill,
     the CTA button, and the stop the dash fields fade toward. */
  accent: '#2B00FF',
  /* The workbook pages' page fill behind their white writing panels. */
  tint: '#EAEEFB',
  /* Rules — the footer rule under running text, and the writing lines on the
     workbook pages. Both are black hairlines, drawn at 0.5pt. */
  rule: '#000000',
} as const;

export const CP_FONT = {
  /* Inter Tight for every heading, numeral and label; Inter for running text.
     Two different faces, not two weights — the narrower Tight is what lets an
     82pt title hold "Career" on one line. */
  heading: "'Inter Tight', sans-serif",
  body: "'Inter', sans-serif",
  /* The cover's loop-arrow mark. DM Sans is what the file specifies; the glyph
     itself (U+21AC) is not in every cut of it, so the stack falls through to
     the heading face and then to whatever the system has for arrows. */
  mark: "'DM Sans', 'Inter Tight', sans-serif",
} as const;

/* ── the dash field ──────────────────────────────────────────────────────────
   The motif the whole template is built on: a grid of short strokes whose angle
   turns across the field, stroked with one linear gradient from white to
   #1E0060. Eleven crops of it appear across the designs at different sizes and
   rotations; each is exported here as its own SVG with the rotation already
   baked in (see the note in each file's <g transform>), so a consumer only has
   to place a box. preserveAspectRatio="none" is set in the artwork, so a box of
   any proportion stretches the field exactly as Figma does. */
const CP_ART = '/assets/templates/career-pathways';
export const CP_FIELD = {
  /* Keep the rotate(180) wrapper. A raw re-export from frame 2168:4643 looks like
     the obvious fix — same art, no transform — and it is WRONG: Figma applies the
     node's own rotation on top, so unrotated the field's gradient runs mirrored,
     long diagonals where Max has short verticals. Measured, not argued: the diff
     against cover 79 goes 14.2 → 15.3 without the wrapper. */
  cover: `${CP_ART}/cover-field.svg`,
  /* The photograph on cover2, exported from the frame rather than borrowed from
     the chapter-opener stock — it is part of that design, not a placeholder. */
  coverPhoto: `${CP_ART}/cover-photo.jpg`,
  /* The author portrait on the bled back page, exported from frame 2168:4775 —
     a different person from the disc portrait the other two back pages use. */
  authorPhoto: `${CP_ART}/author-photo.jpg`,
  /* The photographs the openers and the photo content pages are DRAWN around,
     exported from their own frames (2168:4733, 2168:4725, 2168:4672) rather than
     borrowed from CP_OPENER_STOCK. The stock stands in only when an author has
     not chosen one; these are what the design itself shows, and diffing against
     the frames is how the substitution surfaced. Openers 2 and 4 carry no photo,
     hence only two here. */
  openerPhoto1: `${CP_ART}/opener-photo-1.jpg`,
  openerPhoto3: `${CP_ART}/opener-photo-3.jpg`,
  contentPhoto: `${CP_ART}/content-photo.jpg`,
  bandTop: `${CP_ART}/band-top-field.svg`,
  toc: `${CP_ART}/toc-field.svg`,
  /* The tall half-page pair used by the back-matter and CTA pages — one field
     split across the page's midline, not two unrelated crops. */
  tallTop: `${CP_ART}/tall-field-a.svg`,
  tallBottom: `${CP_ART}/tall-field-b.svg`,
  ctaBottom: `${CP_ART}/cta-field-b.svg`,
  chapter1: `${CP_ART}/chapter1-field.svg`,
  chapter2: `${CP_ART}/chapter2-field.svg`,
  chapter3: `${CP_ART}/chapter3-field.svg`,
  chapter4: `${CP_ART}/chapter4-field.svg`,
  /* Two crops for the workbook sheets: a wide, short slice for the mark set into
     the left margin, and a near-square one for the tall corner mark. They are
     different crops of the field, not one stretched — stretching the short one
     to the tall box turns its dots into strokes. */
  workbook: `${CP_ART}/workbook-field.svg`,
  workbookTall: `${CP_ART}/workbook-field-tall.svg`,
} as const;

/* ── type scale ──────────────────────────────────────────────────────────────
   Every size the template uses, in Figma points, with the weight and leading it
   is set at. Kept as one table because the designs share them: a chapter title
   and a content page's running head are the same 32/36pt Medium, and reading
   that off one list is what keeps them that way. */
export const CP_TYPE = {
  /** Cover title — two words, one per line, set tight enough to touch. */
  coverTitle: { size: 82, weight: 600, lineHeight: '0.85' },
  coverSubtitle: { size: 22, weight: 500, lineHeight: '1.2' },
  /* cover3 sets its title as a heading in the right-hand column, not as the
     82pt display the other three use — three lines inside 97pt. */
  cover3Title: { size: 24, weight: 700, lineHeight: '1.3' },
  /* 19pt: the frame's text box is 19 tall for a single line, not the 15 the
     other covers' bylines use — on this one the byline is set as large as the
     subtitle rather than as a credit. */
  cover3Author: { size: 19, weight: 700, lineHeight: '1.2' },
  coverAuthor: { size: 20, weight: 500, lineHeight: '1.2' },
  coverMark: { size: 22, weight: 500, lineHeight: '1.2' },
  /** The byline above a content page's opening headline. */
  byline: { size: 14, weight: 700, lineHeight: 'normal' },
  /** A content page's opening headline. */
  pageTitle: { size: 36, weight: 500, lineHeight: '1' },
  /** Running text, everywhere it appears. */
  body: { size: 14, weight: 400, lineHeight: '20px' },
  /** The folio, bottom right of every content page. */
  folio: { size: 12, weight: 700, lineHeight: '16px', letterSpacing: '0.24px' },
  /** A chapter opener's title and its oversized numeral. */
  chapterTitle: { size: 32, weight: 500, lineHeight: '1.2' },
  chapterNumber: { size: 122, weight: 600, lineHeight: '82px', letterSpacing: '-9.76px' },
  /** Table of contents. */
  tocHeading: { size: 36, weight: 600, lineHeight: '1' },
  tocEntry: { size: 16, weight: 500, lineHeight: '32px', letterSpacing: '-0.32px' },
  tocFolio: { size: 16, weight: 400, lineHeight: '32px', letterSpacing: '-0.32px' },
  /** Back-matter and CTA headers — the second-largest display size. */
  display: { size: 42, weight: 600, lineHeight: '1' },
  /** Back-matter author credit, CTA button. */
  credit: { size: 16, weight: 700, lineHeight: '20px' },
  /** A workbook page's title, and the instruction sitting opposite it. */
  workbookTitle: { size: 42, weight: 700, lineHeight: '1.2' },
  workbookNote: { size: 16, weight: 700, lineHeight: '20px' },
  workbookPrompt: { size: 16, weight: 700, lineHeight: '20px' },
  workbookDay: { size: 10, weight: 700, lineHeight: '20px', letterSpacing: '0.5px' },
} as const;

/* ── page metrics ────────────────────────────────────────────────────────────
   The measurements that are NOT margins: band depths, column gutters, the
   writing-line rhythm. All in Figma points. */
export const CP_METRIC = {
  /** Side margin and head margin — the 40pt the whole template is set on. */
  margin: 40,
  /** One full-measure text column: 595 − 40 − 40. */
  measure: 515,
  /** Two-column grid: 247pt columns with a 21pt gutter (40 → 287, 308 → 555). */
  columnW: 247,
  columnGap: 21,
  /** The rule above the folio, and the folio's own baseline. */
  footRuleY: 800,
  footRuleW: 471,
  folioY: 791,
  /** The folio's own left edge — it is set from the left, not the right, and
      lands just past the rule's end. */
  folioX: 550,
  /** Cover: the white band across the foot. */
  coverBandY: 671,
  coverBandH: 171,
  /** Content pages: the solid band that bleeds off the head or the foot. */
  headBandH: 110,
  footBandH: 100,
  /** Where the text starts on a page with a band across its head, and where it
      stops on one with a band across its foot. Both are further from the trim
      than the band itself — the design leaves a clear 70pt between the two, not
      a hairline. These are what make the band a page style rather than a
      decoration painted over the words. */
  bandHeadTextTop: 180,
  bandFootTextBottom: 730,
  /** A half-page photo, bled to the page edge on one side. */
  photoY: 320,
  photoH: 522,
  photoW: 288,
  /** Workbook writing lines: 32pt apart, inset 42pt from each edge. */
  lineGap: 32,
  lineInset: 42,
} as const;
