'use client';

/* ── Career Pathways — page furniture ────────────────────────────────────────
   The non-editable half of the template: bands, dash fields, rules, folios, the
   oversized chapter numerals and the workbook writing lines. Everything a reader
   sees but nobody types into.

   It lives apart from the editor for one reason: these are POSITIONS, and the
   whole point of the file is that they can be read straight off the Figma board.
   Every prop below is in the design's own A4 points (595 × 842), and the
   components convert once, against the page box they are handed. Nothing here
   knows what a selection, a field or a ProseMirror node is — the editable text
   that sits on top of this chrome stays in BookEditorView, where those things
   already live.

   HOW TO USE. Render any of these inside a `position: relative` box that is
   exactly one page, and pass that page's width and height in canvas px. A box
   of a different proportion still works — every coordinate is a percentage of
   the page it is given — but the template sets the book to A4 precisely so it
   is never asked to (see CP_PAGE_SIZE). */

import { CP_COLOR, CP_FIELD, CP_METRIC, CP_W, CP_H, cpX, cpY } from './careerPathways';

/** The page box a chrome component is drawn against, in canvas px. */
export interface CpPage { w: number; h: number }

/** Figma points → px on this page. Used for type and hairlines, which are the
    only two things here that are NOT a percentage of the sheet. */
const k = (page: CpPage) => page.w / CP_W;

/** A Figma-unit rectangle as an absolutely-positioned CSS box. */
export function cpRect(x: number, y: number, w: number, h: number): React.CSSProperties {
  return { position: 'absolute', left: `${cpX(x)}%`, top: `${cpY(y)}%`, width: `${cpX(w)}%`, height: `${cpY(h)}%` };
}

/* ── primitives ───────────────────────────────────────────────────────────── */

/** One crop of the dash field. The artwork stretches to its box (its own
    preserveAspectRatio is "none"), which is how Figma draws it. */
export function CpField({ src, x, y, w, h }: { src: string; x: number; y: number; w: number; h: number }) {
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img src={src} alt="" aria-hidden style={{ ...cpRect(x, y, w, h), display: 'block', objectFit: 'fill' }} />;
}

/** A flat colour block — the bands that bleed off one or more page edges. */
export function CpBlock({ x, y, w, h, color }: { x: number; y: number; w: number; h: number; color: string }) {
  return <div aria-hidden style={{ ...cpRect(x, y, w, h), background: color }} />;
}

/** A 0.5pt hairline. #111 on a white page, white at 25% on a black one — the
    two the design actually uses, and the second is why this takes a colour. */
export function CpRule({ page, x, y, w, color = CP_COLOR.rule, opacity, weight = 0.5 }: {
  page: CpPage; x: number; y: number; w: number; color?: string; opacity?: number;
  /** In Figma points. 0.5 everywhere but the planner grid, which is drawn at 1. */
  weight?: number;
}) {
  return (
    <div aria-hidden style={{
      position: 'absolute', left: `${cpX(x)}%`, top: `${cpY(y)}%`, width: `${cpX(w)}%`,
      height: Math.max(0.5, weight * k(page)), background: color, opacity,
    }} />
  );
}

/* ── running content pages ───────────────────────────────────────────────────
   Eight in the file, six distinct: three of them set the same page one column
   wide and differ only in the copy. What actually varies is how the text is set
   (one column or two), whether a photo bleeds off a bottom corner, and whether a
   band runs off the head or the foot. Every one keeps the same margins, the same
   foot rule and the same folio — so that is the shared part, and this is the
   list of what is left.

   They are named for what a reader sees, not for the Figma frame they came from
   ("Page 133" says nothing), because this list is what the page-style menu
   shows. */
export type CpSheetVariant = 'bare' | 'plain' | 'photo-left' | 'photo-right' | 'band-head' | 'band-foot';

/* No "two column" here, though FIVE of the file's eight content pages are set
   that way (Pages 131-135; 132 and 133 are two-column AND carry a bled photo).
   Read this as a limit of one implementation, not of the design: Max builds a
   two-column page as two text boxes side by side, which is what the Layouts
   tool's column block already is — a table, which the engine splits at row
   boundaries. It is CSS multi-column specifically that breaks the page engine — it paginates by
   reading each block's top and bottom down a stacked flow, and in a multicol box
   the second column's blocks are back at the top. Fed those numbers it puts body
   text on top of the page above it, which is worse than a missing style. Two
   columns of running text is reached through the Layouts tool instead: its
   column block is a table, which the engine already splits at row boundaries. */
export const CP_SHEET_STYLES: { id: CpSheetVariant; label: string; hint: string }[] = [
  { id: 'plain', label: 'Text', hint: 'One column, full measure' },
  { id: 'photo-left', label: 'Photo left', hint: 'Photo bled off the bottom left' },
  { id: 'photo-right', label: 'Photo right', hint: 'Photo bled off the bottom right' },
  { id: 'band-head', label: 'Band at the head', hint: 'Black band across the top' },
  { id: 'band-foot', label: 'Band at the foot', hint: 'Blue band across the bottom' },
];

/* Every page this template ships, which is what "+ Add page" offers while it is
   on. Cover, contents and back page are in the list even though a book has at
   most one of each: leaving them out made the gallery an incomplete picture of
   the template, and a book that has had its cover deleted has no other way back
   to one. They are not greyed out when they already exist — the refusal is a
   message on attempt, which is how this editor turns every other insert down.

   Blank leads: it is the only kind with no design of its own, so it is the one
   you reach for when none of the designed pages fit, and it should not be
   buried mid-grid. The rest follow the order they sit in a book, so the
   gallery reads front to back.
   `once` is what makes a kind one-per-book; `at` is where it goes regardless of
   which page you were looking at, because a cover does not belong "after this
   page" and neither does a back page. */
export type CpAddPageKind =
  | 'cover' | 'toc' | 'chapter' | 'page' | 'blank' | 'image' | 'cta' | 'worksheet' | 'back';
export const CP_ADD_PAGE_OPTIONS: {
  id: CpAddPageKind; label: string; hint: string; once?: boolean; at?: 'start' | 'after-cover' | 'end';
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

/* ── The design each KIND can wear ───────────────────────────────────────────
   Add a page picks what a page IS; Layout picks which design it wears. They were
   one list, which put "Cover" (a kind, with one design) beside "Two columns, photo
   left" (a design of the content kind) — the same category error, one level up,
   as naming page styles in a menu of verbs.

   The split is also how Max's file is organised: "Chapters x4" and "Content pages
   x8" are separate sections, and there are four covers, three contents pages and
   three back pages besides. */
export const CP_CONTENT_LAYOUTS: { sheet: CpSheetVariant; label: string }[] = [
  { sheet: 'plain', label: 'Text' },
  { sheet: 'photo-left', label: 'Photo left' },
  { sheet: 'photo-right', label: 'Photo right' },
  { sheet: 'band-head', label: 'Band at the head' },
  { sheet: 'band-foot', label: 'Band at the foot' },
];
export const CP_TOC_LAYOUTS: { id: 'toc' | 'toc-panel' | 'toc-stack'; label: string }[] = [
  { id: 'toc', label: 'List on the ground' },
  { id: 'toc-panel', label: 'List on a panel' },
  { id: 'toc-stack', label: 'Stacked heading' },
];
export const CP_COVER_LAYOUTS: { id: 'cover-band' | 'cover-head' | 'cover-photo' | 'cover-plain'; label: string }[] = [
  { id: 'cover-band', label: 'Band at the foot' },
  { id: 'cover-head', label: 'Band at the head' },
  { id: 'cover-photo', label: 'Full-bleed photo' },
  { id: 'cover-plain', label: 'No band' },
];
export const CP_BACK_LAYOUTS: { id: 'back' | 'back-right' | 'back-photo'; label: string }[] = [
  { id: 'back', label: 'Panel left' },
  { id: 'back-right', label: 'Panel right' },
  { id: 'back-photo', label: 'Photo bled' },
];
export const CP_IMAGE_LAYOUTS: { id: 'img-card' | 'img-bleed'; label: string }[] = [
  { id: 'img-card', label: 'Photo in a card' },
  { id: 'img-bleed', label: 'Photo bled' },
];
export const CP_WORKSHEET_LAYOUTS: { id: CpWorkbookKind; label: string }[] = [
  { id: 'planner', label: 'Weekly planner' },
  { id: 'summary', label: 'Summary' },
  { id: 'todo', label: 'To-do list' },
  { id: 'goals', label: 'Goals' },
];

export function CpContentSheet({ page, variant, photo }: {
  page: CpPage; variant: CpSheetVariant; photo?: string;
}) {
  return (
    <>
      {variant === 'photo-left' && photo && <CpPhotoPanel side="left" src={photo} />}
      {variant === 'photo-right' && photo && <CpPhotoPanel side="right" src={photo} w={287} />}
      {variant === 'band-head' && (
        <>
          <CpBlock x={0} y={0} w={CP_W} h={CP_METRIC.headBandH} color={CP_COLOR.page} />
          <CpField src={CP_FIELD.bandTop} x={44.9} y={24.3} w={503.8} h={60.5} />
        </>
      )}
      {variant === 'band-foot' && (
        <>
          {/* Blue, not black: the head band and the foot band are deliberately
              the two different grounds the template owns. */}
          <CpBlock x={0} y={CP_H - CP_METRIC.footBandH} w={CP_W} h={CP_METRIC.footBandH} color={CP_COLOR.accent} />
          <CpField src={CP_FIELD.bandTop} x={44.9} y={762} w={503.8} h={60.5} />
        </>
      )}
      {/* A foot band swallows the rule — there is nothing to separate the folio
          from, because the folio is sitting on the band. */}
      {/* `bare` is the Blank page: the template's margins and type, and none of
          its furniture — no foot rule, and no folio either (see the chip's `at`).
          It is the one page you insert when you want to build something the
          template has no design for. */}
      {variant !== 'band-foot' && variant !== 'bare' && (
        <CpRule page={page} x={CP_METRIC.margin} y={CP_METRIC.footRuleY} w={CP_METRIC.footRuleW} color="#111111" />
      )}
      {/* No folio drawn here. The page number is a tool the editor already has —
          selectable, with its own inspector, and set once for the whole book —
          so the template configures that instead of painting its own (see
          ThemeDef.pageNumbers). A drawn number would have been the one thing on
          the page you could see and not click. */}
    </>
  );
}

/** A half-page photo bled to the left or right edge — the two content pages and
    two chapter openers that carry one. */
export function CpPhotoPanel({ side, src, y = CP_METRIC.photoY, h = CP_METRIC.photoH, w = CP_METRIC.photoW }: {
  side: 'left' | 'right'; src: string; y?: number; h?: number; w?: number;
}) {
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img src={src} alt="" aria-hidden style={{ ...cpRect(side === 'left' ? 0 : CP_W - w, y, w, h), objectFit: 'cover', display: 'block' }} />;
}

/* ── chapter openers ─────────────────────────────────────────────────────────
   Four designs, used in rotation. They are not four alternatives to choose
   between: the file draws chapters 1-4 as a set, each turning the same parts —
   a half-page ground, an oversized numeral, the title, one crop of the dash
   field — a quarter turn from the last. A fifth chapter starts the cycle again.

   Everything a reader can edit (the title) is positioned by BookEditorView
   against `titleAt` below; everything else is drawn here. */
export interface CpOpenerSpec {
  /** The sheet's own fill, behind the band. */
  pageBg: string;
  /** The solid half of the page, and its colour. */
  band: { y: number; h: number; color: string };
  /** The numeral: where its box starts, which edge it is set from, its colour,
      and whether the file trims its line box to the cap (opener 4 does, the
      other three do not — so `y` means a different edge on each). */
  numeral: { x: number; y: number; w: number; align: 'left' | 'right'; color: string; trim?: boolean };
  /** The title's top-left in Figma points, and its ink. `plate` is the white
      box opener 4 sets it on; `pad` is that box's own padding, which is what
      the words are actually inset by. */
  title: { x: number; y: number; w: number; color: string; plate?: { w: number; h: number; pad: number } };
  field: { src: string; x: number; y: number; w: number; h: number };
  photo?: { side: 'left' | 'right'; y: number; w: number; h: number };
  /** The foot rule, on the one opener that has one. */
  rule?: boolean;
}

export const CP_OPENERS: CpOpenerSpec[] = [
  /* 1 — blue page, white across the head, photo off the bottom-left corner and
     the field answering it on the right. */
  {
    pageBg: CP_COLOR.accent,
    band: { y: 0, h: 500, color: CP_COLOR.paper },
    numeral: { x: 38, y: 67, w: 120, align: 'left', color: CP_COLOR.ink },
    title: { x: 174, y: 56, w: 360, color: CP_COLOR.ink },
    field: { src: CP_FIELD.chapter1, x: 298, y: 549, w: 255, h: 255 },
    photo: { side: 'left', y: 341, w: 248, h: 501 },
  },
  /* 2 — the inverse: black across the head carrying the field, and the opening
     matter sitting low on the white half. The only opener with a foot rule. */
  {
    pageBg: CP_COLOR.page,
    band: { y: 301, h: 541, color: CP_COLOR.paper },
    numeral: { x: 40, y: 369, w: 120, align: 'left', color: CP_COLOR.ink },
    title: { x: 174, y: 361, w: 360, color: CP_COLOR.ink },
    field: { src: CP_FIELD.chapter2, x: 44.1, y: 39, w: 510.7, h: 233.8 },
    rule: true,
  },
  /* 3 — chapter 1 mirrored: photo off the bottom-RIGHT, field on the left. */
  {
    pageBg: CP_COLOR.page,
    band: { y: 0, h: 500, color: CP_COLOR.paper },
    numeral: { x: 38, y: 67, w: 120, align: 'left', color: CP_COLOR.ink },
    title: { x: 174, y: 56, w: 340, color: CP_COLOR.ink },
    field: { src: CP_FIELD.chapter3, x: 51, y: 542, w: 246, h: 258 },
    photo: { side: 'right', y: 341, w: 248, h: 501 },
  },
  /* 4 — no photo at all. A deep blue head with the numeral reversed out of it,
     and the title on a white plate overlapping the field below. */
  {
    pageBg: CP_COLOR.accent,
    band: { y: 280, h: 562, color: CP_COLOR.paper },
    numeral: { x: 435, y: 151, w: 120, align: 'right', color: CP_COLOR.paper, trim: true },
    title: { x: 40, y: 310, w: 217, color: CP_COLOR.page, plate: { w: 217, h: 131, pad: 8 } },
    field: { src: CP_FIELD.chapter4, x: 54, y: 310, w: 498.6, h: 495 },
  },
];

/** Which of the four a chapter uses. 1-based, wrapping. */
export const cpOpenerFor = (chapterNumber: number) =>
  CP_OPENERS[((Math.max(1, chapterNumber) - 1) % CP_OPENERS.length)];

/* The four opener designs as a pickable set. `cpOpenerFor` still answers by
   chapter number, which is the DEFAULT — a book with no choices made cycles the
   four — and a chapter that has been given one stores the index instead. */
export const CP_OPENER_LAYOUTS = CP_OPENERS.map((_, i) => ({ index: i, label: `Opener ${i + 1}` }));

/* ── workbook ────────────────────────────────────────────────────────────────
   Four sheets a reader writes on. They share a head — the title bottom-left of a
   tinted band, one small crop of the field in a corner, and an instruction set
   opposite the title — and differ in what fills the rest: ruled bands, a
   seven-column week, or a checklist. */

/* The four sheets, as data. Each is a page fill, a corner mark, and a list of
   bands — a ruled block, a checklist or the week grid — at fixed positions.
   Titles and prompts are editable and so are not here; see CpWorkbookBody. */
export type CpWorkbookKind = 'planner' | 'summary' | 'todo' | 'goals';

type CpBand =
  | { kind: 'fill'; y: number; h: number; color: string }
  | { kind: 'lines'; y: number; h: number; lines: number; first: number; bg?: string }
  | { kind: 'checklist'; y: number; h: number; rows: number }
  | { kind: 'week' };

export interface CpWorkbookSpec {
  label: string;
  /** What the title reads before anyone changes it. */
  title: string;
  /** The line set beside the title, and where it is set from. */
  note?: { text: string; x: number; y: number; w: number; align: 'left' | 'right'; font: 'heading' | 'body'; size: number; letterSpacing?: number };
  /** Prompts standing above their own ruled block, centred on the measure. */
  prompts?: { text: string; y: number }[];
  pageBg: string;
  mark: 'top-left' | 'top-right';
  bands: CpBand[];
}

export const CP_WORKBOOKS: Record<CpWorkbookKind, CpWorkbookSpec> = {
  planner: {
    label: 'Weekly planner',
    title: 'Weekly Planner',
    pageBg: CP_COLOR.paper,
    mark: 'top-right',
    bands: [
      { kind: 'fill', y: 0, h: 198, color: CP_COLOR.tint },
      { kind: 'week' },
      { kind: 'lines', y: 590, h: 191, lines: 5, first: 31.5 },
    ],
    prompts: [{ text: 'Notes', y: 561 }],
  },
  summary: {
    label: 'Summary',
    title: 'Summary',
    pageBg: CP_COLOR.paper,
    mark: 'top-left',
    /* The one line in the whole template set in Inter rather than Inter Tight —
       kept, because matching the file is the point. */
    note: { text: 'After reading this,\ni feel right now:', x: 342, y: 64, w: 200, align: 'right', font: 'body', size: 16 },
    bands: [
      { kind: 'lines', y: 133, h: 192, lines: 5, first: 32 },
      { kind: 'lines', y: 325, h: 192, lines: 5, first: 32 },
      { kind: 'lines', y: 517, h: 192, lines: 5, first: 32 },
    ],
  },
  todo: {
    label: 'To-do list',
    title: 'To-do list',
    pageBg: CP_COLOR.tint,
    mark: 'top-left',
    note: { text: 'Start planning\nyour goals', x: 355, y: 61, w: 200, align: 'right', font: 'heading', size: 16, letterSpacing: -0.32 },
    bands: [{ kind: 'checklist', y: 167, h: 587, rows: 11 }],
  },
  goals: {
    label: 'Goals',
    title: 'Goals',
    pageBg: CP_COLOR.paper,
    mark: 'top-right',
    prompts: [
      { text: 'What do I want to accomplish?', y: 180 },
      { text: 'Why is it important to me?', y: 476 },
    ],
    bands: [
      { kind: 'lines', y: 226, h: 240, lines: 6, first: 40 },
      { kind: 'lines', y: 508, h: 240, lines: 6, first: 40 },
    ],
  },
};
