/* ── Lovable — the designed pages, as objects ────────────────────────────────
   Every page this template ships is a free canvas of the editor's own elements,
   not a drawing: each block is an image, each photograph is an image, each
   title and label is a text field. All of it selects, moves, resizes, restyles,
   reorders and deletes through the canvas the cover has always used — nothing
   on these pages is decoration you can see but not touch.

   WHY THIS IS ITS OWN FILE. Career Pathways' equivalent (`cpPageElements` and
   friends) lives inside BookEditorView, because the element types live there.
   Thirty-odd pages of measurements in a 32,000-line file is a lot of haystack
   for one needle, and two sessions working on two templates both land in it. So
   this file declares the element shapes STRUCTURALLY — the same field names, the
   same unions — and BookEditorView assigns the result straight to CoverElement[]
   with no cast. If the two ever drift, tsc says so at that assignment rather
   than a template page quietly rendering wrong.

   Positions are in the design's own A4 points and converted once (lvX/lvY to
   percentages of the sheet, lv() to canvas px for type), so this reads against
   the Figma board without arithmetic. */

import {
  LV_COLOR, LV_FONT, LV_TYPE, LV_METRIC, LV_BLOCK, LV_KEYCAP, LV_W, LV_H,
  lv, lvf, lvX, lvY, lvBlockSrc, type LvBlockArt,
} from './lovable';
import { LV_OPENERS, LV_COVER_BLOCKS, LV_PHOTO, lvPhotoWindow, type LvCoverKind } from './lovableChrome';

/* ── the element shapes ──────────────────────────────────────────────────────
   Structurally identical to BookEditorView's CoverElement union. Only the
   fields this file actually emits are declared: an element it does not set is
   one the editor defaults, and listing them here would be a second, drifting
   copy of a type that already exists. */
interface LvBase { id: string; x: number; y: number; w: number; h: number; opacity?: number }
export interface LvText extends LvBase {
  type: 'text';
  role: 'title' | 'subtitle' | 'author' | 'custom';
  fontFamily: string; fontSize: number; color: string;
  fontWeight?: number; textAlign?: 'left' | 'center' | 'right';
  letterSpacing?: string; lineHeight?: string;
  textTransform?: 'uppercase' | 'capitalize';
  anchor?: 'top' | 'cap';
  defaultHtml?: string;
}
export interface LvImage extends LvBase {
  type: 'image'; src: string; alt?: string; decorative?: boolean;
  fit?: 'cover' | 'contain' | 'fill'; radius?: number;
}
export interface LvShape extends LvBase {
  type: 'shape'; shape: 'rectangle' | 'rounded'; color: string; radius?: number;
  borderWidth?: number; borderColor?: string;
}
export type LvElement = LvText | LvImage | LvShape;

/** The photographs a designed page falls back to until the author swaps them —
    supplied by the editor, which owns the stock library. */
export interface LvStock { photo: string; portrait: string }

/* ── builders ─────────────────────────────────────────────────────────────── */

function img(id: string, x: number, y: number, w: number, h: number, src: string, extra: Partial<LvImage> = {}): LvImage {
  return { id, type: 'image', x: lvX(x), y: lvY(y), w: lvX(w), h: lvY(h), src, decorative: true, ...extra };
}

/** One block of the motif as an object. The artwork is generated at the size it
    is placed (see lvBlockSrc), so this is the only place the two meet. */
function block(id: string, a: LvBlockArt & { x: number; y: number }): LvImage {
  /* `fill`, not the editor's default `cover`. The artwork is generated at this
     exact box, so it must STRETCH with it rather than be scaled uniformly and
     cropped — cover cuts the top and bottom edges clean off the shape the
     moment the sheet is anything but the A4 the template was drawn for, which
     is every template preview before it is applied. */
  return img(id, a.x, a.y, a.w, a.h, lvBlockSrc(a), { fit: 'fill' });
}

function shape(id: string, x: number, y: number, w: number, h: number, color: string, extra: Partial<LvShape> = {}): LvShape {
  return { id, type: 'shape', shape: 'rectangle', x: lvX(x), y: lvY(y), w: lvX(w), h: lvY(h), color, ...extra };
}

type LvTypeSpec = { size: number; weight: number; lineHeight: string; letterSpacing?: string };

function text(
  id: string, x: number, y: number, w: number, h: number, html: string, t: LvTypeSpec,
  extra: Partial<LvText> = {},
): LvText {
  return {
    id, type: 'text', role: 'custom',
    x: lvX(x), y: lvY(y), w: lvX(w), h: lvY(h),
    fontFamily: LV_FONT.heading, fontSize: lv(t.size), fontWeight: t.weight,
    /* A leading stated in px is a LENGTH and has to scale with the sheet; a
       unitless one is a multiplier and must not. The same trap Career Pathways
       hit — left unscaled, a 20pt leading sat inside a 21px font and clipped
       its own ascenders. */
    lineHeight: t.lineHeight.endsWith('px') ? `${lvf(parseFloat(t.lineHeight)).toFixed(2)}px` : t.lineHeight,
    letterSpacing: t.letterSpacing ? `${lvf(parseFloat(t.letterSpacing)).toFixed(3)}px` : undefined,
    color: LV_COLOR.display, textAlign: 'left', anchor: 'top',
    defaultHtml: html,
    ...extra,
  };
}

/** Running text, which is set in Orbiter rather than Explorer. */
const body = (id: string, x: number, y: number, w: number, h: number, html: string, extra: Partial<LvText> = {}) =>
  text(id, x, y, w, h, html, LV_TYPE.body, { fontFamily: LV_FONT.body, color: LV_COLOR.body, ...extra });

/** A hairline — the rule above an author's credit. Drawn as a shape so it is a
    real object; 0.5pt would be half a pixel of hit target, which is what
    HIT_MIN exists for on the canvas side. */
const rule = (id: string, x: number, y: number, w: number, color: string) =>
  shape(id, x, y, w, 1, color);

/* ── cover ───────────────────────────────────────────────────────────────────
   Six frames in Max's file, four designs: the motif in its outlined finish and
   in its solid one, each on a light ground and a dark one. The gradient and
   the deep-violet grounds in the file are the same arrangement with the page
   recoloured, so they are the ground, not a fifth design.

   Measured off frames 3540:5289 (the one the theme ships), 5450, 5243 and 5358. */

/** Whether a cover design sets the page a colour of its own. */
export function lvCoverBg(kind: LvCoverKind): string {
  switch (kind) {
    case 'cover-outline-dark': return LV_COLOR.page;
    case 'cover-solid-violet': return LV_COLOR.violetPage;
    default: return LV_COLOR.paper;
  }
}

export function lvCoverElements(kind: LvCoverKind, title: string, subtitle: string, author: string): LvElement[] {
  const dark = kind === 'cover-outline-dark' || kind === 'cover-solid-violet';
  const solid = kind === 'cover-solid' || kind === 'cover-solid-violet';
  const ink = dark ? LV_COLOR.paper : LV_COLOR.ink;

  /* The blocks. Outlined ones are generated; solid ones are Max's own keycap
     artwork, which carries shading and so cannot be computed. On the dark
     ground the black block becomes the WHITE one — there is no seventh colour,
     it is the same block reversed out, and it is the one the byline sits in. */
  const blocks: LvImage[] = solid
    ? LV_COVER_BLOCKS.solid.map((b, i) =>
        img(`lv-cv-block-${i}`, b.x, b.y, b.w, b.h, LV_KEYCAP[b.color as keyof typeof LV_KEYCAP], { fit: 'fill' }))
    : LV_COVER_BLOCKS.outline.map((b, i) =>
        block(`lv-cv-block-${i}`, { ...b, color: dark && b.color === 'black' ? 'white' : b.color }));

  const a = LV_COVER_BLOCKS.author;
  /* The three singleton roles carry NO defaultHtml. They are keyed by role, not
     by element id, so the words in them are the book's own title, subtitle and
     byline — already typed, and the same across every template. A default here
     would be a fourth opinion about what the cover says, and an empty one (which
     is what this had) reads as "this field has no default" and strands the page
     on the placeholder even though the book has a title. */
  const role = (el: LvText, r: LvText['role']): LvText => {
    const next = { ...el, role: r };
    delete next.defaultHtml;
    return next;
  };
  return [
    ...blocks,
    /* 258 wide, not the frame's 458. The subtitle starts at x=350 on the SAME
       top line — that side-by-side pairing is the design — and Max set it
       against "Lovable", one short display word that never reaches it. A real
       title wraps to the full 458 and its first line runs straight under the
       subtitle. So the title's measure stops 20pt clear of where the subtitle
       begins; the sample copy still sets on one line at full size, and a long
       one now wraps in its own column instead of colliding. */
    role(text('title', 72, 51, 258, 288, '', LV_TYPE.coverTitle, { color: ink }), 'title'),
    role(text('sub', 350, 51, 202, 44, '', LV_TYPE.coverSubtitle, {
      fontFamily: LV_FONT.body, color: ink, textAlign: 'right',
    }), 'subtitle'),
    /* The byline sits INSIDE the black block — the one placement in the whole
       template where type rides on the motif rather than beside it. On the
       solid finish that block is a lit keycap, so the name is set in the
       shading's own highlight rather than in paper: Max draws it dimmed, and a
       white byline there would be the only thing on the cover shouting. */
    role(text('auth', a.x, a.y, a.w, a.h, '', LV_TYPE.coverAuthor, {
      color: solid ? 'rgba(255,255,255,0.55)' : (dark ? LV_COLOR.paper : LV_COLOR.outline),
    }), 'author'),
  ].map((el) => lvFitCoverText(el as LvElement, { title, subtitle, author }));
}

/* ── fitting the cover's type ────────────────────────────────────────────────
   Max set every cover around "Now is tomorrow. Let's Build it right away!" —
   four short lines at 80pt. A real title is whatever the author typed, so the
   rule is the one Career Pathways arrived at: keep the designed size when it
   fits, and step down only as far as the overflow actually requires.

   MEASURED, not estimated, and measured AT RENDER rather than when the objects
   are built: these are editable fields, so the fit has to re-run when the words
   change, and the stored object has to keep the design's own number. The canvas
   2D context has the real answer wherever a browser is painting; the constant
   is only the server-side fallback, where nothing is painted anyway. */
const lvCtx: { ctx: CanvasRenderingContext2D | null } = { ctx: null };
function lvTextWidth(t: string, px: number, weight: number, family: string): number {
  if (typeof document === 'undefined') return t.length * px * 0.42;
  if (!lvCtx.ctx) lvCtx.ctx = document.createElement('canvas').getContext('2d');
  const ctx = lvCtx.ctx;
  if (!ctx) return t.length * px * 0.42;
  ctx.font = `${weight} ${px}px ${family}`;
  return ctx.measureText(t).width;
}

/* Break opportunities, not words: a browser also breaks AFTER a hyphen, which
   is why a hyphenated title fits a measure that splitting on whitespace alone
   says it cannot. */
const lvBreakParts = (t: string) => t.trim().split(/(?<=-)|\s+/).filter(Boolean);

export function lvFitSize(
  t: string, boxW: number, boxH: number, size: number, lh: number, weight = 700, family: string = LV_FONT.heading,
): number {
  const s = t.trim();
  if (!s) return size;
  const parts = lvBreakParts(s);
  const fits = (px: number) => {
    if (Math.max(...parts.map((w) => lvTextWidth(w, px, weight, family))) > boxW) return false;
    let lines = 1, cur = '';
    for (const w of parts) {
      const next = cur ? `${cur} ${w}` : w;
      if (lvTextWidth(next, px, weight, family) > boxW) { lines += 1; cur = w; } else { cur = next; }
    }
    return lines * px * lh <= boxH;
  };
  if (fits(size)) return size;
  /* Down in whole points, not by bisection: the answer has to be stable across
     a re-render, and a half-point step on an 80pt display is invisible anyway. */
  for (let px = size - 1; px > size * 0.45; px -= 1) if (fits(px)) return px;
  return Math.round(size * 0.45);
}

/** Which cover fields carry the author's own words, and so have to be fitted. */
const LV_COVER_FIELD: Record<string, 'title' | 'subtitle' | 'author'> = {
  title: 'title', sub: 'subtitle', auth: 'author',
};

function lvFitCoverText(el: LvElement, words: { title: string; subtitle: string; author: string }): LvElement {
  const key = LV_COVER_FIELD[el.id];
  if (!key || el.type !== 'text') return el;
  const t = words[key];
  if (!t) return el;
  const boxW = (el.w / 100) * LV_W;
  const boxH = (el.h / 100) * LV_H;
  const lh = parseFloat(el.lineHeight ?? '1.2') || 1.2;
  const px = lvFitSize(t, (boxW / LV_W) * 700, (boxH / LV_H) * 990, el.fontSize, lh, el.fontWeight ?? 700, el.fontFamily);
  return px === el.fontSize ? el : { ...el, fontSize: px };
}

/* ── chapter openers ─────────────────────────────────────────────────────────
   The design IS the objects: picking an opener re-seeds them, and from then on
   the numeral and the card are ordinary things you can move. The numeral's TEXT
   is the one thing not stored — it is the chapter's number, and reordering two
   chapters has to move both — so it is recomputed at render. */
export function lvOpenerElements(chapterNumber: number, index?: number): LvElement[] {
  const spec = LV_OPENERS[(index ?? Math.max(1, chapterNumber) - 1) % LV_OPENERS.length];
  return [
    shape('lv-op-ground', 0, 0, LV_W, LV_H, spec.pageBg),
    ...spec.blocks.map((b, i) => block(`lv-op-block-${i}`, b)),
    /* Zero-padded, because Max draws "01" and not "1": the numeral is the
       biggest thing on the page and a single digit leaves it lopsided against
       the block behind it. Two digits only — a 100-chapter book keeps its three. */
    text('lv-op-number', spec.numeral.x, spec.numeral.y, spec.numeral.w, 82,
      `<p>${String(Math.max(1, chapterNumber)).padStart(2, '0')}</p>`, LV_TYPE.chapterNumber, {
        color: spec.numeral.color, textTransform: 'capitalize',
      }),
    ...(spec.intro
      ? [body('lv-op-intro', spec.intro.x, spec.intro.y, spec.intro.w, 100,
          '<p>One line on what this chapter is for.</p>', { color: spec.intro.color })]
      : []),
  ];
}

/* ── every other designed page ───────────────────────────────────────────────
   One switch, the way Career Pathways has one, because these pages differ only
   in what they hold. */
export type LvPageKind =
  | 'toc' | 'toc-dark' | 'toc-bleed'
  | 'back' | 'back-card' | 'back-blocks' | 'back-band'
  | 'cta' | 'cta-violet'
  | 'img-card' | 'img-rainbow'
  | 'wb-planner' | 'wb-summary' | 'wb-todo' | 'wb-goals';

/** Each designed page's own ground. */
export const LV_PAGE_BG: Record<LvPageKind, string> = {
  toc: LV_COLOR.paper,
  'toc-dark': LV_COLOR.page,
  'toc-bleed': LV_COLOR.mist,
  back: LV_COLOR.paper,
  'back-card': LV_COLOR.page,
  'back-blocks': LV_COLOR.page,
  'back-band': LV_COLOR.page,
  cta: LV_COLOR.paper,
  'cta-violet': LV_COLOR.violetPage,
  'img-card': LV_COLOR.paper,
  'img-rainbow': LV_COLOR.paper,
  'wb-planner': LV_COLOR.paper,
  'wb-summary': LV_COLOR.paper,
  'wb-todo': LV_COLOR.paper,
  'wb-goals': LV_COLOR.paper,
};

const BACK_BIO = '<p>Add a short author bio here — who you are, what you work on, and why this book exists.</p>';
const CTA_BODY = '<p>Say what the reader gets, and why it is worth their next click.</p>';

/** The author's rule, portrait and credit, which three of the four back pages
    set identically at the foot of the right-hand column. */
function lvBackCredit(stock: LvStock, y: number): LvElement[] {
  return [
    rule('lv-back-rule', 328, y, 200, 'rgba(255,255,255,0.35)'),
    img('lv-back-photo', 323, y + 15, 76, 103, stock.portrait, {
      radius: lv(8), decorative: false, alt: 'The author',
    }),
    text('lv-back-credit', 434, y + 27, 120, 20, '<p>Author Name</p>', LV_TYPE.credit, { color: LV_COLOR.paper }),
  ];
}

/** A back page's title and bio, on the dark grounds — the three that set the
    title down the left and the copy down the right. */
function lvBackColumns(): LvElement[] {
  return [
    text('lv-back-title', 40, 85, 200, 90, '<p>The Back Page Title</p>', LV_TYPE.display, { color: LV_COLOR.paper }),
    body('lv-back-bio', 330, 82, 210, 440, BACK_BIO, { color: LV_COLOR.paper, lineHeight: '1.4' }),
  ];
}

/** The seven-day grid: six verticals, six horizontals and seven day names. No
    outer frame — the design draws none. */
function lvWeekGrid(): LvElement[] {
  const days = ['Mon', 'Tues', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const x = 40, y = 144, w = LV_METRIC.measure, h = 381;
  const colW = w / days.length, rowH = h / 7;
  return [
    /* Six verticals, not eight: the frame draws the column divisions but no
       outer left or right edge, so the week opens at both ends. The horizontals
       DO close top and bottom — eight of them — which is what gives the first
       row a lid under the day names and the last one a floor. */
    ...days.slice(1).map((_, i) => shape(`lv-wb-v${i}`, x + (i + 1) * colW, y, 1, h, LV_COLOR.outline)),
    ...Array.from({ length: 8 }, (_, r) => shape(`lv-wb-h${r}`, x, y + r * rowH, w, 1, LV_COLOR.outline)),
    /* The weekend is set bold — the grid's only emphasis, and the one thing in
       it that is a design decision rather than a measurement. */
    ...days.map((d, c) => text(`lv-wb-d${c}`, x + c * colW, y - 24, colW, rowH, `<p>${d}</p>`, LV_TYPE.workbookDay, {
      fontFamily: LV_FONT.body, textAlign: 'center', textTransform: 'uppercase',
      color: LV_COLOR.body, fontWeight: c >= 5 ? 700 : 500,
    })),
  ];
}

/** A ruled writing band: `n` hairlines on a 32pt step from `y`. */
function lvLines(prefix: string, y: number, n: number): LvElement[] {
  return Array.from({ length: n }, (_, i) =>
    rule(`${prefix}-${i}`, LV_METRIC.lineInset, y + i * LV_METRIC.lineGap, LV_W - LV_METRIC.lineInset * 2, '#C9CBD1'));
}

/** The to-do rows: a rounded outline and a rule, twelve times. */
function lvChecklist(y: number, rows: number): LvElement[] {
  return Array.from({ length: rows }, (_, i) => {
    const rowY = y + i * 50;
    return [
      shape(`lv-wb-box${i}`, LV_METRIC.lineInset, rowY, 16, 16, 'transparent', {
        shape: 'rounded', radius: lv(3), borderWidth: 1, borderColor: LV_COLOR.outline,
      }),
      rule(`lv-wb-row${i}`, LV_METRIC.lineInset + 40, rowY + 16, LV_W - LV_METRIC.lineInset * 2 - 40, '#C9CBD1'),
    ];
  }).flat();
}

export function lvPageElements(kind: LvPageKind, stock: LvStock): LvElement[] {
  switch (kind) {
    /* ── contents ──────────────────────────────────────────────────────────
       The entries themselves are NOT here: they are the book's own chapters,
       generated and rendered on top of whatever furniture a design draws (see
       LvTocEntries). So each case below is the heading and its setting, and
       nothing else. */

    /* TOC 56 — the paper page. The heading sits inside one wide outlined block
       turned half round, and three more run off the foot. */
    case 'toc':
      return [
        block('lv-toc-card', { x: 84, y: 141, w: 442, h: 124, r: 14.084, color: 'black', flip: true }),
        text('lv-toc-heading', 134, 186, 340, 48, '<p>Table of Contents</p>', LV_TYPE.tocHeading, {
          anchor: 'cap', textTransform: 'capitalize',
        }),
        block('lv-toc-b1', { x: 85, y: 645, w: 126, h: 100, color: 'pink', flip: true }),
        block('lv-toc-b2', { x: 321, y: 675, w: 204, h: 102, color: 'red', flip: true }),
        block('lv-toc-b3', { x: 168, y: 784, w: 128, h: 124, color: 'violet', flip: true }),
      ];
    /* TOC 55 — the dark page, the heading on a gradient card at the head and the
       list reversed out of the ground below it. */
    case 'toc-dark':
      return [
        block('lv-toc-card', {
          x: 82, y: 154, w: 430, h: 137, r: 46, lift: 32,
          finish: 'solid', color: 'gradient', face: LV_COLOR.paper,
        }),
        text('lv-toc-heading', 151, 186, 340, 48, '<p>Table of Contents</p>', LV_TYPE.tocHeading, {
          anchor: 'cap', textTransform: 'capitalize',
        }),
      ];
    /* TOC 54 — one enormous card bled off three edges, mirrored so its gradient
       runs down the RIGHT. The list sits on the card's own paper. */
    case 'toc-bleed':
      return [
        /* Flipped, not mirrored: the frame throws this card's extrusion UP and
           to the RIGHT, so the gradient shows as a band over the head and a
           stripe down the side. Two cards, because the frame has two — the
           second picks the colour up in blue below the midline. */
        block('lv-toc-card', {
          x: 35, y: -13, w: 401, h: 880, r: 44, lift: 50, finish: 'solid', color: 'gradient',
          face: LV_COLOR.paper, flip: true,
        }),
        block('lv-toc-card-2', {
          x: 35, y: 430, w: 401, h: 880, r: 44, lift: 50, finish: 'solid', color: 'blue',
          face: LV_COLOR.paper, flip: true,
        }),
        text('lv-toc-heading', 73, 242, 340, 48, '<p>Table of Contents</p>', LV_TYPE.tocHeading, {
          anchor: 'cap', textTransform: 'capitalize',
        }),
      ];

    /* ── back matter ───────────────────────────────────────────────────────
       Back 70 is the one Max draws on paper: everything the page says sits
       inside a single outlined block big enough to be the page, with three
       small ones answering it at the foot. */
    case 'back':
      return [
        block('lv-back-card', { x: 18, y: 33, w: 545, h: 411, r: 36.5, color: 'black' }),
        body('lv-back-bio', 97, 69, 430, 220, BACK_BIO),
        text('lv-back-title', 96, 318, 220, 50, '<p>The Back Page Title</p>', LV_TYPE.workbookTitle, {
          fontSize: lv(18), color: LV_COLOR.display,
        }),
        img('lv-back-photo', 366, 310, 55, 74, stock.portrait, { radius: lv(6), decorative: false, alt: 'The author' }),
        text('lv-back-credit', 434, 310, 110, 20, '<p>Author Name</p>', LV_TYPE.credit, {
          fontSize: lv(12), color: LV_COLOR.display,
        }),
        block('lv-back-b1', { x: 466, y: 653, w: 77, h: 74, r: 8, color: 'violet' }),
        block('lv-back-b2', { x: 329, y: 723, w: 122, h: 61, r: 8, color: 'red' }),
        block('lv-back-b3', { x: 485, y: 750, w: 76, h: 60, r: 8, color: 'pink' }),
      ];
    /* Back 71 — the dark page with a tall gradient card down the right holding
       the whole bio, and the title alone on the ground beside it. */
    case 'back-card':
      return [
        block('lv-back-card', { x: 298, y: 18, w: 270, h: 788, r: 24, lift: 27, finish: 'solid', color: 'gradient', face: LV_COLOR.paper }),
        text('lv-back-title', 40, 85, 200, 90, '<p>The Back Page Title</p>', LV_TYPE.display, { color: LV_COLOR.paper }),
        body('lv-back-bio', 326, 85, 209, 440, BACK_BIO, { lineHeight: '1.4' }),
        rule('lv-back-rule', 328, 652, 192, '#D7D9DE'),
        img('lv-back-photo', 323, 663, 76, 103, stock.portrait, { radius: lv(8), decorative: false, alt: 'The author' }),
        text('lv-back-credit', 434, 675, 120, 20, '<p>Author Name</p>', LV_TYPE.credit, { color: LV_COLOR.display }),
      ];
    /* Back 72 — a violet band at the head and the six solid blocks tumbling down
       the left, which is the only page in the template that shows all six. */
    case 'back-blocks':
      return [
        shape('lv-back-band', 0, 0, LV_W, 30, LV_COLOR.violetPage),
        ...lvBackColumns(),
        img('lv-back-k1', 49, 393, 107, 105, LV_KEYCAP.blue, { fit: 'fill' }),
        img('lv-back-k2', 62, 503, 103, 91, LV_KEYCAP.pink, { fit: 'fill' }),
        img('lv-back-k3', 45, 570, 156, 105, LV_KEYCAP.red, { fit: 'fill' }),
        img('lv-back-k4', 153, 535, 96, 80, LV_KEYCAP.orange, { fit: 'fill' }),
        img('lv-back-k5', 33, 682, 107, 105, LV_KEYCAP.violet, { fit: 'fill' }),
        img('lv-back-k6', 154, 661, 160, 119, LV_KEYCAP.black, { fit: 'fill' }),
        ...lvBackCredit(stock, 672),
      ];
    /* Back 73 — the same two columns under a paper band, with outlined blocks
       run off the bottom-left instead of the solid pile. */
    case 'back-band':
      return [
        shape('lv-back-band', 0, 0, LV_W, 30, LV_COLOR.paper),
        ...lvBackColumns(),
        block('lv-back-b1', { x: 60, y: 397, w: 126, h: 100, color: 'orange' }),
        block('lv-back-b2', { x: -143, y: 513, w: 204, h: 102, color: 'red' }),
        block('lv-back-b3', { x: 185, y: 545, w: 126, h: 100, color: 'pink' }),
        block('lv-back-b4', { x: -143, y: 651, w: 128, h: 124, color: 'violet' }),
        block('lv-back-b5', { x: -19, y: 651, w: 205, h: 124, color: 'white' }),
        block('lv-back-b6', { x: 183, y: 651, w: 128, h: 124, color: 'blue' }),
        ...lvBackCredit(stock, 672),
      ];

    /* ── call to action ────────────────────────────────────────────────────
       One tall card down the middle, mirrored so its extrusion falls to the
       right. CTA 46 fills that extrusion with the gradient on paper; CTA 45
       makes it a flat black shadow on violet, which is the same object with
       two of its three colours changed. */
    case 'cta':
    case 'cta-violet':
      return [
        block('lv-cta-card', {
          x: 172, y: 28, w: 266, h: 798, r: 28.168, lift: 25, finish: 'solid', mirror: true,
          color: kind === 'cta' ? 'gradient' : 'black', face: LV_COLOR.paper,
        }),
        text('lv-cta-heading', 190, 86, 215, 100, '<p>CTA</p><p>Header</p>', LV_TYPE.tocHeading, {
          fontWeight: 600, color: LV_COLOR.display,
        }),
        body('lv-cta-body', 190, 205, 209, 440, CTA_BODY, { lineHeight: '1.4', color: LV_COLOR.display }),
        shape('lv-cta-button', 186, 670, 212, 34, LV_COLOR.page),
        text('lv-cta-label', 186, 677, 212, 34, '<p>Learn More</p>', LV_TYPE.credit, {
          color: LV_COLOR.paper, textAlign: 'center',
        }),
      ];

    /* ── image pages ───────────────────────────────────────────────────────
       The file draws two, and they are the motif's two finishes again: a square
       photograph in an outlined block, and the same thing in a gradient card.
       Both caption INSIDE the card, under the picture, and then run body copy
       on the page below it. */
    case 'img-card':
      return [
        block('lv-img-card', { x: 25, y: 27, w: 545, h: 533, r: 37.5, color: 'black' }),
        img('lv-img-photo', 108, 60, 419, 419, stock.photo, { decorative: false, alt: 'Image', fit: 'cover' }),
        text('lv-img-caption', 108, 493, 419, 20, '<p>Image caption goes here</p>', LV_TYPE.caption, {
          fontFamily: LV_FONT.body, fontSize: lv(12), color: LV_COLOR.body,
        }),
        body('lv-img-body', 100, 597, 419, 200,
          '<p>Say what the picture is doing here — what it shows, and what the reader should take from it.</p>'),
      ];
    case 'img-rainbow':
      return [
        block('lv-img-card', { x: 36, y: 26, w: 528, h: 836, r: 34, lift: 20, finish: 'solid', color: 'gradient', face: LV_COLOR.paper }),
        img('lv-img-photo', 57, 54, 464, 335, stock.photo, { decorative: false, alt: 'Image', fit: 'cover' }),
        text('lv-img-caption', 57, 400, 419, 20, '<p>Image caption goes here</p>', LV_TYPE.caption, {
          fontFamily: LV_FONT.body, fontSize: lv(12), color: LV_COLOR.body,
        }),
        body('lv-img-body', 57, 428, 464, 300,
          '<p>Say what the picture is doing here — what it shows, and what the reader should take from it.</p>'),
      ];

    /* ── workbook ──────────────────────────────────────────────────────────
       Four sheets a reader writes on. They share a head — a title, a line under
       it, and blocks run off the corners — and differ in what fills the rest. */
    case 'wb-planner':
      return [
        block('lv-wb-t1', { x: 71, y: -87, w: 128, h: 124, color: 'violet' }),
        block('lv-wb-t2', { x: 398, y: -63, w: 128, h: 124, color: 'blue' }),
        text('lv-wb-title', 151, 75, 300, 50, '<p>Weekly Planner</p>', LV_TYPE.workbookTitle, { textAlign: 'center' }),
        ...lvWeekGrid(),
        text('lv-wb-notes', LV_METRIC.margin, 560, LV_METRIC.measure, 24, '<p>Notes</p>', LV_TYPE.credit, {
          textAlign: 'center',
        }),
        ...lvLines('lv-wb-a', 605, 6),
        block('lv-wb-f1', { x: 71, y: 807, w: 204, h: 102, color: 'red' }),
        block('lv-wb-f2', { x: 399, y: 822, w: 126, h: 100, color: 'pink' }),
      ];
    case 'wb-summary':
      return [
        block('lv-wb-t1', { x: 357, y: -44, w: 205, h: 124, color: 'black' }),
        text('lv-wb-title', 40, 55, 400, 50, '<p>Summary</p>', LV_TYPE.workbookTitle),
        body('lv-wb-note', 40, 103, 400, 24, '<p>After reading this, i feel right now…</p>'),
        ...lvLines('lv-wb-a', 170, 5),
        ...lvLines('lv-wb-b', 375, 5),
        ...lvLines('lv-wb-c', 580, 5),
      ];
    case 'wb-todo':
      return [
        block('lv-wb-t1', { x: 357, y: -44, w: 205, h: 124, color: 'black' }),
        text('lv-wb-title', 40, 55, 400, 50, '<p>To-do list</p>', LV_TYPE.workbookTitle),
        body('lv-wb-note', 40, 103, 400, 24, '<p>Start planning your goals</p>'),
        ...lvChecklist(160, 12),
      ];
    case 'wb-goals':
      return [
        block('lv-wb-t1', { x: 71, y: -56, w: 128, h: 124, color: 'blue' }),
        block('lv-wb-t2', { x: 243, y: -60, w: 205, h: 124, color: 'black' }),
        text('lv-wb-title', 40, 85, 400, 50, '<p>Goals</p>', LV_TYPE.workbookTitle),
        body('lv-wb-p1', 40, 143, 400, 24, '<p>What do I want to accomplish?</p>'),
        ...lvLines('lv-wb-a', 180, 5),
        body('lv-wb-p2', 40, 478, 400, 24, '<p>Why is it important to me?</p>'),
        ...lvLines('lv-wb-b', 513, 5),
        block('lv-wb-f1', { x: 71, y: 807, w: 204, h: 102, color: 'red' }),
        block('lv-wb-f2', { x: 399, y: 822, w: 126, h: 100, color: 'pink' }),
      ];
  }
}

/** The photo card a running content page carries, as objects — so the picture
    on a content page is clickable and swappable the same way the one on an
    Image page is. Shares lvPhotoWindow with the chrome component, so the two
    cannot drift. */
export function lvContentPhotoElements(where: 'head' | 'side', src: string): LvElement[] {
  const c = LV_PHOTO[where];
  const win = lvPhotoWindow(c.x, c.y, c.w, c.h, c.r);
  return [
    block('lv-sheet-card', { x: c.x, y: c.y, w: c.w, h: c.h, r: c.r, color: 'black' }),
    img('lv-sheet-photo', win.x, win.y, win.w, win.h, src, { decorative: false, alt: 'Image', fit: 'cover' }),
    text('lv-sheet-caption', win.x, win.y + win.h + 8, win.w, 18, '<p>Image caption goes here</p>', LV_TYPE.caption, {
      fontFamily: LV_FONT.body, fontSize: lv(12), color: LV_COLOR.body,
    }),
  ];
}

/* The outlined block as a CSS treatment, for the two places the motif has to
   wrap text the editor already owns rather than an object this file places:
   the theme's blockquote (Max draws it twice, frames 3540:4875 and 4884, as a
   pull quote on a card) and the Image block's own frame. A block element could
   not do it — the card has to grow with the words. */
export const LV_QUOTE_CSS = `
  .book-chapter-prose blockquote {
    position: relative; border: none; margin: 1.6em 0; padding: 22px 26px;
    border-radius: 14px; box-shadow: inset 0 0 0 2px ${LV_BLOCK.black.stroke};
    font-style: normal; color: ${LV_COLOR.body};
  }
  /* The extrusion. A second ring, offset down-left and sitting BEHIND, which is
     the same relationship lvBlockSrc draws — here it is two pseudo-elements
     because the box has to grow with the text. */
  .book-chapter-prose blockquote::before {
    content: ''; position: absolute; inset: 0; transform: translate(-15px, 11px);
    border-radius: 14px; box-shadow: inset 0 0 0 2px ${LV_BLOCK.black.stroke};
    z-index: -1; pointer-events: none;
  }
  .book-chapter-prose blockquote p:last-child:not(:only-child) {
    font-weight: 700; margin-top: 0.8em;
  }
`;
