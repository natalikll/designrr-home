'use client';

/* ── Lovable — page furniture and design specs ───────────────────────────────
   The non-editable half of the template, and the tables the editor's object
   builders read. It is the sibling of templates/careerPathwaysChrome.tsx and
   keeps the same split for the same reason: everything here is POSITIONS, in
   the design's own A4 points (595 × 842), so the file can be read straight off
   Max's board. Nothing here knows what a selection, a field or a ProseMirror
   node is — the editable text that sits on top stays in BookEditorView, where
   those things already live.

   HOW TO USE. Render any component below inside a `position: relative` box that
   is exactly one page, and pass that page's width and height in canvas px. */

import { LV_COLOR, LV_METRIC, LV_W, LV_H, lvX, lvY, lvBlockSrc, LV_BLOCK_R, type LvBlockArt } from './lovable';

/** The page box a chrome component is drawn against, in canvas px. */
export interface LvPage { w: number; h: number }

/** A Figma-unit rectangle as an absolutely-positioned CSS box. */
export function lvRect(x: number, y: number, w: number, h: number): React.CSSProperties {
  return { position: 'absolute', left: `${lvX(x)}%`, top: `${lvY(y)}%`, width: `${lvX(w)}%`, height: `${lvY(h)}%` };
}

/* ── primitives ───────────────────────────────────────────────────────────── */

/** One block of the motif, drawn at the size it is placed. The artwork is
    generated for this exact box (see lvBlockSrc), so the 2pt line and the
    corner radius come out right whatever the proportion — which is the whole
    reason it is not an exported crop. */
export function LvBlock({ x, y, ...art }: LvBlockArt & { x: number; y: number }) {
  /* eslint-disable-next-line @next/next/no-img-element */
  /* objectFit: fill — the artwork is generated at this box, so it stretches
     with it. Anything else crops a shape that was drawn to fit. */
  return <img src={lvBlockSrc(art)} alt="" aria-hidden style={{ ...lvRect(x, y, art.w, art.h), display: 'block', objectFit: 'fill' }} />;
}

/** A flat colour block — the two head bands on the back pages. */
export function LvFill({ x, y, w, h, color }: { x: number; y: number; w: number; h: number; color: string }) {
  return <div aria-hidden style={{ ...lvRect(x, y, w, h), background: color }} />;
}

/* ── running content pages ───────────────────────────────────────────────────
   Eight frames in the file, five distinct designs: three of them set the same
   two columns and differ only in the copy. What actually varies is how the text
   is set (one column or two), whether a photograph sits in a card, and whether
   the block motif runs off the head and foot. Every one keeps the same margins
   and the same alternating folio, so that is the shared part and this is what
   is left.

   Named for what a reader sees, not for the Figma frame ("Page 212" says
   nothing), because this list is what the Layout panel shows. */
export type LvSheetVariant = 'bare' | 'plain' | 'two-col' | 'photo-head' | 'photo-side' | 'blocks';

export const LV_CONTENT_LAYOUTS: { sheet: LvSheetVariant; label: string; cols?: 2 }[] = [
  { sheet: 'plain', label: 'Text' },
  { sheet: 'two-col', label: 'Two columns', cols: 2 },
  { sheet: 'photo-head', label: 'Photo at the head' },
  { sheet: 'photo-side', label: 'Photo in the column', cols: 2 },
  { sheet: 'blocks', label: 'Blocks at the edges', cols: 2 },
];

/* Where the two photo cards sit. Page 214 sets a landscape card across the head
   with the caption inside it, top right; Page 211 sets a portrait one down the
   left column, dropped to the foot. Both are the block motif with a photograph
   in the face — the same object the covers are built from, carrying a picture. */
export const LV_PHOTO = {
  head: { x: 36, y: 36, w: LV_METRIC.photoWideW, h: LV_METRIC.photoWideH, r: 22 },
  side: { x: 24, y: 300, w: LV_METRIC.photoTallW, h: LV_METRIC.photoTallH, r: 22 },
} as const;

/** How much of a sheet each design takes away from the running text, in Figma
    points, measured from the foot. A head-set design reports 0 and gets a
    spacer at the top of the flow instead — a reserve shortens a page from the
    bottom, so it cannot express "start lower". */
export const LV_FOOT_RESERVE: Partial<Record<LvSheetVariant, number>> = {
  'photo-side': LV_H - LV_PHOTO.side.y + 16,
};
export const LV_HEAD_INSET: Partial<Record<LvSheetVariant, number>> = {
  'photo-head': LV_PHOTO.head.y + LV_PHOTO.head.h + 24,
};

/* The blocks that bleed off a 'blocks' page, from Pages 212 and 213: four at
   the head and foot, each mostly past the trim so only a corner shows. They
   alternate side with the page, which is how the file draws the spread. */
const LV_EDGE_BLOCKS: { x: number; y: number; w: number; h: number; color: LvBlockArt['color']; flip?: boolean }[] = [
  { x: 71, y: -87, w: 128, h: 124, color: 'violet' },
  { x: 274, y: -116, w: 205, h: 124, color: 'orange' },
  { x: 398, y: -63, w: 128, h: 124, color: 'blue' },
  { x: 71, y: 807, w: 204, h: 102, color: 'red' },
  { x: 399, y: 822, w: 126, h: 100, color: 'pink' },
];

export function LvContentSheet({ variant, photo, mirror }: {
  variant: LvSheetVariant; photo?: string;
  /** Verso pages mirror the bleeding blocks, the way the file's two
      block pages are a spread rather than the same page twice. */
  mirror?: boolean;
}) {
  return (
    <>
      {variant === 'blocks' && LV_EDGE_BLOCKS.map((b, i) => (
        <LvBlock key={i} {...b} x={mirror ? LV_W - b.x - b.w : b.x} />
      ))}
      {variant === 'photo-head' && <LvPhotoCard {...LV_PHOTO.head} src={photo} />}
      {variant === 'photo-side' && <LvPhotoCard {...LV_PHOTO.side} src={photo} />}
      {/* No folio drawn here. The page number is a real tool with its own
          inspector, set once for the whole book, so the template configures that
          instead of painting its own — see ThemeDef.pageNumbers. A drawn number
          would be the one thing on the page you could see and not click.
          `bare` is the Blank page: margins and type, none of the furniture. */}
    </>
  );
}

/** A photograph in the motif: the outlined block with the picture set into its
    face. The picture is INSET rather than filling the face — the paper that
    leaves around it is what the card is for, and it is where the file puts the
    caption on its Image pages (which are built as objects, so the caption there
    is a real editable field; a running content page carries the card alone). */
export function LvPhotoCard({ x, y, w, h, r, src }: {
  x: number; y: number; w: number; h: number; r: number; src?: string;
}) {
  const box = lvPhotoWindow(x, y, w, h, r);
  return (
    <>
      <LvBlock x={x} y={y} w={w} h={h} r={r} color="black" />
      {src && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={src} alt="" aria-hidden style={{ ...lvRect(box.x, box.y, box.w, box.h), objectFit: 'cover', display: 'block' }} />
      )}
    </>
  );
}

/** Where the picture sits inside a photo card, in Figma points. Shared with the
    element builder so the chrome card and the Image page's card agree. */
export function lvPhotoWindow(x: number, y: number, w: number, h: number, r: number) {
  const pad = r * 1.6;
  return {
    x: x + r * 1.12 + pad,
    y: y + pad,
    w: w - r * 1.12 - pad * 2,
    h: h - r * 0.82 - pad * 2 - 28,
  };
}

/* ── chapter openers ─────────────────────────────────────────────────────────
   Four designs, used in rotation. They are not four alternatives to choose
   between: the file draws chapters 1-4 as a set, each turning the same parts —
   a ground, one big block, an oversized numeral and the title — a quarter turn
   from the last. A fifth chapter starts the cycle again.

   Everything a reader can edit (the title) is positioned by BookEditorView
   against `title` below; everything else is seeded as objects by lvOpenerElements. */
export interface LvOpenerSpec {
  /** The sheet's own fill. */
  pageBg: string;
  /** The blocks the design is built on, in paint order. */
  blocks: (LvBlockArt & { x: number; y: number })[];
  /** The numeral: its box, and the ink it is set in. */
  numeral: { x: number; y: number; w: number; color: string };
  /** The title's top-left in Figma points, its measure and its ink. */
  title: { x: number; y: number; w: number; color: string };
  /** The standfirst, on the one opener that carries one. */
  intro?: { x: number; y: number; w: number; color: string };
}

export const LV_OPENERS: LvOpenerSpec[] = [
  /* 1 — "chapter 21". The dark ground, one gradient card bleeding off the right
     edge with the numeral inside it, and the title on the ground below. */
  {
    pageBg: LV_COLOR.page,
    blocks: [{ x: 54, y: 49, w: 671, h: 241, r: 32, finish: 'solid', color: 'gradient', face: LV_COLOR.paper }],
    numeral: { x: 112, y: 73, w: 200, color: LV_COLOR.display },
    title: { x: 51, y: 331, w: 420, color: LV_COLOR.paper },
  },
  /* 2 — "chapter 22". A near-white ground and two enormous cards, each bleeding
     off two edges, so the page reads as one magenta corner. The only opener the
     file gives a standfirst. */
  {
    pageBg: LV_COLOR.mist,
    blocks: [
      { x: 52, y: 34, w: 1177, h: 578, r: 72, finish: 'solid', color: 'pink', face: LV_COLOR.paper },
      { x: 52, y: 612, w: 1177, h: 578, r: 62, lift: 80, finish: 'solid', color: 'blue', face: LV_COLOR.paper },
    ],
    numeral: { x: 202, y: 78, w: 200, color: LV_COLOR.display },
    title: { x: 202, y: 191, w: 353, color: LV_COLOR.display },
    intro: { x: 202, y: 346, w: 352, color: LV_COLOR.body },
  },
  /* 3 — "chapter 23". The violet page: one card across the head with the numeral
     in it, a second clipped to a sliver at the very top, and the title reversed
     out of the violet below. */
  {
    pageBg: LV_COLOR.violetPage,
    blocks: [
      { x: -42, y: -176, w: 490, h: 241, r: 32, finish: 'solid', color: 'gradient', face: LV_COLOR.paper },
      { x: 426, y: -174, w: 490, h: 241, r: 32, finish: 'solid', color: 'gradient', face: LV_COLOR.paper },
      { x: 54, y: 52, w: 490, h: 241, r: 32, finish: 'solid', color: 'gradient', face: LV_COLOR.paper },
    ],
    numeral: { x: 112, y: 76, w: 200, color: LV_COLOR.display },
    title: { x: 59, y: 334, w: 460, color: LV_COLOR.paper },
  },
  /* 4 — "chapter 24". No card at all: the paper page, with four outlined blocks
     run so far off the trim that only their corners are on it, and the numeral
     and title sitting in the clear middle. */
  {
    pageBg: LV_COLOR.paper,
    blocks: [
      { x: 243, y: -116, w: 403, h: 321, r: 34, color: 'orange' },
      { x: -406, y: 254, w: 653, h: 326, r: 34, color: 'red' },
      { x: -9, y: 632, w: 656, h: 397, r: 34, color: 'black' },
      { x: -406, y: 696, w: 410, h: 397, r: 34, color: 'violet' },
    ],
    numeral: { x: 64, y: 76, w: 200, color: LV_COLOR.display },
    title: { x: 275, y: 310, w: 281, color: LV_COLOR.display },
  },
];

/** Which of the four a chapter uses. 1-based, wrapping. */
export const lvOpenerFor = (chapterNumber: number) =>
  LV_OPENERS[(Math.max(1, chapterNumber) - 1) % LV_OPENERS.length];

/** The four as a pickable set. `lvOpenerFor` still answers by chapter number,
    which is the DEFAULT — a book with no choices made cycles the four — and a
    chapter that has been given one stores the index instead. */
export const LV_OPENER_LAYOUTS = LV_OPENERS.map((_, i) => ({ index: i, label: `Opener ${i + 1}` }));

/* ── the designs each KIND can wear ──────────────────────────────────────────
   Add a page picks what a page IS; Layout picks which design it wears — the
   same split Career Pathways settled on, and the same split Max's own file is
   organised by ("Cover x4" and "Chapters x4" are separate sections). */
export const LV_COVER_LAYOUTS: { id: LvCoverKind; label: string }[] = [
  { id: 'cover-outline', label: 'Outlined blocks' },
  { id: 'cover-outline-dark', label: 'Outlined, dark' },
  { id: 'cover-solid', label: 'Solid blocks' },
  { id: 'cover-solid-violet', label: 'Solid, violet' },
];
export type LvCoverKind = 'cover-outline' | 'cover-outline-dark' | 'cover-solid' | 'cover-solid-violet';

export const LV_TOC_LAYOUTS: { id: 'toc' | 'toc-dark' | 'toc-bleed'; label: string }[] = [
  { id: 'toc', label: 'Heading in a block' },
  { id: 'toc-dark', label: 'Dark, heading on a card' },
  { id: 'toc-bleed', label: 'Card bled off the corner' },
];
export const LV_BACK_LAYOUTS: { id: 'back' | 'back-card' | 'back-blocks' | 'back-band'; label: string }[] = [
  { id: 'back', label: 'One big block' },
  { id: 'back-card', label: 'Card down the right' },
  { id: 'back-blocks', label: 'Solid blocks' },
  { id: 'back-band', label: 'Band at the head' },
];
export const LV_IMAGE_LAYOUTS: { id: 'img-card' | 'img-rainbow'; label: string }[] = [
  { id: 'img-card', label: 'Photo in an outlined block' },
  { id: 'img-rainbow', label: 'Photo in a gradient card' },
];
export const LV_CTA_LAYOUTS: { id: 'cta' | 'cta-violet'; label: string }[] = [
  { id: 'cta', label: 'Gradient card' },
  { id: 'cta-violet', label: 'Violet page' },
];
export const LV_WORKSHEET_LAYOUTS: { id: LvWorkbookKind; label: string }[] = [
  { id: 'planner', label: 'Weekly planner' },
  { id: 'summary', label: 'Summary' },
  { id: 'todo', label: 'To-do list' },
  { id: 'goals', label: 'Goals' },
];

/* Every page this template ships, which is what "+ Add page" offers while it is
   on. Same list and same rules as Career Pathways': cover, contents and back
   page are in it even though a book has at most one of each, they are never
   greyed out (the refusal is a message on attempt), `once` makes a kind
   one-per-book and `at` is where it goes regardless of the page you were on. */
export type LvAddPageKind =
  | 'cover' | 'toc' | 'chapter' | 'page' | 'blank' | 'image' | 'cta' | 'worksheet' | 'back';
export const LV_ADD_PAGE_OPTIONS: {
  id: LvAddPageKind; label: string; hint: string; once?: boolean; at?: 'start' | 'after-cover' | 'end';
}[] = [
  { id: 'blank', label: 'Blank page', hint: 'Margins and type only, no furniture' },
  { id: 'cover', label: 'Cover', hint: 'The front of the book', once: true, at: 'start' },
  { id: 'toc', label: 'Table of contents', hint: 'Built from your chapter headings', once: true, at: 'after-cover' },
  { id: 'chapter', label: 'Chapter', hint: 'Starts a new chapter, with an opener' },
  { id: 'page', label: 'Content page', hint: 'Running text, continues the chapter above' },
  { id: 'image', label: 'Image page', hint: 'A photo with a caption' },
  { id: 'cta', label: 'Call to action', hint: 'A headline and a button' },
  { id: 'worksheet', label: 'Worksheet', hint: 'A planner, summary, to-do list or goals sheet' },
  { id: 'back', label: 'Back page', hint: 'About the author', once: true, at: 'end' },
];

/* ── workbook ────────────────────────────────────────────────────────────────
   Four sheets a reader writes on. They share a head — the title top left with an
   instruction under it, and one block of the motif run off a corner — and differ
   in what fills the rest: ruled bands, a seven-column week, or a checklist. */
export type LvWorkbookKind = 'planner' | 'summary' | 'todo' | 'goals';

type LvBand =
  | { kind: 'lines'; y: number; lines: number; first: number; gap?: number }
  | { kind: 'checklist'; y: number; rows: number }
  | { kind: 'week' };

export interface LvWorkbookSpec {
  label: string;
  /** What the title reads before anyone changes it, and the line under it. */
  title: string;
  prompt: string;
  /** Centred, like the planner's, or set from the left margin like the rest. */
  center?: boolean;
  /** Prompts standing above their own ruled block. */
  subPrompts?: { text: string; y: number }[];
  /** The corner blocks, in Figma points. */
  blocks: (LvBlockArt & { x: number; y: number })[];
  bands: LvBand[];
}

const LV_WB_TOP: (LvBlockArt & { x: number; y: number })[] = [
  { x: 71, y: -87, w: 128, h: 124, color: 'violet' },
  { x: 398, y: -63, w: 128, h: 124, color: 'blue' },
];
const LV_WB_FOOT: (LvBlockArt & { x: number; y: number })[] = [
  { x: 71, y: 807, w: 204, h: 102, color: 'red' },
  { x: 399, y: 822, w: 126, h: 100, color: 'pink' },
];

export const LV_WORKBOOKS: Record<LvWorkbookKind, LvWorkbookSpec> = {
  planner: {
    label: 'Weekly planner',
    title: 'Weekly Planner',
    prompt: '',
    center: true,
    blocks: [...LV_WB_TOP, ...LV_WB_FOOT],
    bands: [{ kind: 'week' }, { kind: 'lines', y: 590, lines: 5, first: 32 }],
    subPrompts: [{ text: 'Notes', y: 561 }],
  },
  summary: {
    label: 'Summary',
    title: 'Summary',
    prompt: 'After reading this, i feel right now…',
    blocks: [{ x: 357, y: -44, w: 205, h: 124, color: 'black' }],
    bands: [
      { kind: 'lines', y: 170, lines: 5, first: 0 },
      { kind: 'lines', y: 375, lines: 5, first: 0 },
      { kind: 'lines', y: 580, lines: 5, first: 0 },
    ],
  },
  todo: {
    label: 'To-do list',
    title: 'To-do list',
    prompt: 'Start planning your goals',
    blocks: [{ x: 357, y: -44, w: 205, h: 124, color: 'black' }],
    bands: [{ kind: 'checklist', y: 167, rows: 12 }],
  },
  goals: {
    label: 'Goals',
    title: 'Goals',
    prompt: 'What do I want to accomplish?',
    blocks: [
      { x: 71, y: -56, w: 128, h: 124, color: 'blue' },
      { x: 243, y: -60, w: 205, h: 124, color: 'black' },
      ...LV_WB_FOOT,
    ],
    subPrompts: [{ text: 'Why is it important to me?', y: 470 }],
    bands: [
      { kind: 'lines', y: 226, lines: 5, first: 0 },
      { kind: 'lines', y: 512, lines: 5, first: 0 },
    ],
  },
};

/** The ruled bands as plain geometry, so the element builder and any read-only
    renderer agree on where a line goes. */
export function lvBandLines(b: LvBand): { y: number }[] {
  if (b.kind === 'lines') {
    const gap = b.gap ?? LV_METRIC.lineGap;
    return Array.from({ length: b.lines }, (_, i) => ({ y: b.y + b.first + i * gap }));
  }
  return [];
}

/** The block the cover sets the byline inside — the one placement in the whole
    template where type sits on the motif rather than beside it. */
export const LV_COVER_BLOCKS: {
  outline: (LvBlockArt & { x: number; y: number })[];
  solid: (LvBlockArt & { x: number; y: number })[];
  /** The author's name, inside the black block, in Figma points. */
  author: { x: number; y: number; w: number; h: number };
} = {
  /* Frame 3540:5289 — the cover the theme ships. Six outlined blocks in a
     stepped arrangement across the lower half, the black one carrying the
     byline. */
  outline: [
    { x: 274, y: 395, w: 126, h: 100, r: LV_BLOCK_R, color: 'orange' },
    { x: 399, y: 543, w: 126, h: 100, r: LV_BLOCK_R, color: 'pink' },
    { x: 71, y: 511, w: 204, h: 102, r: LV_BLOCK_R, color: 'red' },
    { x: 71, y: 649, w: 128, h: 124, r: LV_BLOCK_R, color: 'violet' },
    { x: 398, y: 649, w: 128, h: 124, r: LV_BLOCK_R, color: 'blue' },
    { x: 195, y: 649, w: 205, h: 124, r: 14.084, color: 'black' },
  ],
  /* Frame 3540:5243 — the same arrangement in the solid finish, which is drawn
     with the keycap artwork rather than generated (see LV_KEYCAP). */
  solid: [
    { x: 274, y: 395, w: 126, h: 100, finish: 'solid', color: 'orange' },
    { x: 394, y: 552, w: 126, h: 100, finish: 'solid', color: 'pink' },
    { x: 74, y: 512, w: 204, h: 100, finish: 'solid', color: 'red' },
    { x: 74, y: 652, w: 126, h: 121, finish: 'solid', color: 'violet' },
    { x: 394, y: 651, w: 126, h: 121, finish: 'solid', color: 'blue' },
    { x: 195, y: 651, w: 204, h: 121, finish: 'solid', color: 'black' },
  ],
  author: { x: 224, y: 665, w: 120, h: 48 },
};
