/* ── Lovable — the Figma template, to spec ───────────────────────────────────
   Source: "Designerr templates by Max", section 3540:4702 ("Template - Lovable")
   and its children — Cover x4, Content pages x8, Chapters x4, Table of Contents
   x3, Back page x3 (+ Back 70), Image styles x2, CTA x2, Workbook x4,
   Blockquotes x2, and an Elements board (6292:5414) holding the motif itself.

   Like templates/careerPathways.ts, every number here is in the DESIGN's own
   units: the board is an A4 sheet at 72dpi, 595 × 842pt, and a 40pt margin, an
   80pt title or a 13.08pt corner radius is lifted from it unchanged. `lv()` is
   the single place that converts, so the file can be read against Figma without
   arithmetic while the editor still draws it at its own scale.

   WHY THE TEMPLATE CARRIES A TRIM SIZE — same reason Career Pathways does: the
   bleeds, the two-column grid and the blocks that run off the page edges are
   placed against a 1:1.414 proportion, and drawn on US Letter they stretch. The
   template sets the book to A4 when it is applied; Book settings can still
   change it afterwards. */

/** The Figma board: A4 at 72dpi, which is the unit every number here is in. */
export const LV_W = 595;
export const LV_H = 842;

/** Trim size this template is drawn for — a PAGE_SIZES id. */
export const LV_PAGE_SIZE = 'a4';
/** 40pt margins on all four sides, as inches (the unit margins are stored in). */
export const LV_MARGIN_IN = 40 / 72;
export const LV_MARGINS = {
  top: LV_MARGIN_IN, right: LV_MARGIN_IN, bottom: LV_MARGIN_IN, left: LV_MARGIN_IN,
};

/* The editor draws A4 at 700 × 990 canvas px (PX_PER_IN × 8.27in). Font sizes on
   a free canvas are stored absolute, not as a percentage of the sheet, so they
   convert once here. Positions are percentages and need no conversion — lvX/lvY. */
const LV_CANVAS_W = 700;
/** A Figma length as canvas px, rounded — right for a font size. */
export const lv = (pt: number) => Math.round((pt * LV_CANVAS_W) / LV_W);
/** The same unrounded, for lengths where the fraction IS the value: a -0.32pt
    tracking rounds to zero, and a 20pt leading rounded into a 21px font clips
    its own ascenders. */
export const lvf = (pt: number) => (pt * LV_CANVAS_W) / LV_W;

/** A Figma x / y / width / height as the percentage a cover element stores. */
export const lvX = (pt: number) => (pt / LV_W) * 100;
export const lvY = (pt: number) => (pt / LV_H) * 100;

/* ── palette ──────────────────────────────────────────────────────────────── */
/* Six block colours and three near-blacks, all read off the artwork rather than
   normalised: the stroke of an orange block (#FF9029) is genuinely a shade off
   its fill (#FF8B1F), and matching the file is the point of a template. */
export const LV_COLOR = {
  paper: '#FFFFFF',
  /* The dark ground — the covers, three chapter openers, one contents page and
     three back pages are set on it. Not pure black: #202020. */
  page: '#202020',
  /* The near-black the display type is set in. Three values, three jobs: #111
     on the cover, #010101 for a numeral or a page heading, #1C1C1C for the
     block motif's own stroke and the author's name inside it. */
  ink: '#111111',
  display: '#010101',
  outline: '#1C1C1C',
  /* Grey/900 — running text, lighter than the headings so body copy sits back. */
  body: '#202124',
  /* The off-white ground chapter opener 2 is set on. */
  mist: '#F2F0F6',
  /* Violet as a whole PAGE fill — chapter opener 3 and one CTA. Not the same
     violet as the block's face below: the page is the brighter #7D1FFF, and
     normalising the two to one value would lose the contrast the opener gets
     from setting a #6300CC block on a #7D1FFF ground. */
  violetPage: '#7D1FFF',
} as const;

/** The six blocks, as the design names them. `fill` is the face of a solid
    block; `stroke` is the line an outlined one is drawn with. */
export const LV_BLOCK = {
  red: { fill: '#FF3033', stroke: '#FF3033' },
  orange: { fill: '#FF8B1F', stroke: '#FF9029' },
  pink: { fill: '#FF66F4', stroke: '#FF66F4' },
  violet: { fill: '#6300CC', stroke: '#6401CC' },
  blue: { fill: '#547AFF', stroke: '#547AFF' },
  black: { fill: '#1C1C1C', stroke: '#1C1C1C' },
  /* Not a seventh colour — the black block's outline, reversed out of the dark
     ground. The design reaches for it on every dark page. */
  white: { fill: '#FFFFFF', stroke: '#FFFFFF' },
} as const;
export type LvBlockColor = keyof typeof LV_BLOCK;

/** The gradient the "rainbow" cards are filled with: orange → magenta → violet,
    at the three stops the artwork sets. */
export const LV_GRADIENT = ['#FF8B1F', '#FF66F4', '#9532FF'] as const;

export const LV_FONT = {
  /* TASA Explorer for every heading, numeral and label; TASA Orbiter for running
     text. Both are Local Remote's typefaces for the Taiwan Space Agency rebrand,
     both are SIL OFL, and both are on Google Fonts — which is why they load
     through next/font/google beside the rest (see app/layout.tsx) rather than
     being substituted for something approximate.

     Figma names the body face "TASA Orbiter Deck" — one of the family's three
     optical sizes. Google Fonts ships the family under one name, so that is what
     is asked for here. */
  heading: "'TASA Explorer', sans-serif",
  body: "'TASA Orbiter', sans-serif",
} as const;

/* ── the block ───────────────────────────────────────────────────────────────
   The motif the whole template is built on, and the only one: a rounded
   rectangle with a second copy extruded behind it, down and to the left. It
   appears in two finishes and nothing else does.

     outlined — both copies drawn as a 2pt line, nothing filled. The extrusion is
                only its own SILHOUETTE: the back copy's top and right edges are
                not drawn, because the two diagonals that join the corners are
                what make it read as a solid turned in space rather than as two
                rectangles that happen to overlap.
     solid    — the extrusion filled (a flat colour, or the orange→violet
                gradient), the face filled over it.

   WHY IT IS GENERATED AND NOT EXPORTED. Career Pathways ships eleven crops of
   its dash field as eleven SVG files, which is right for a texture — there is
   nothing to compute, and stretching one crop to another aspect visibly thins
   it (see the note in that file). This motif is the opposite: it is a shape with
   a stroke and a corner radius, placed at some forty different sizes across the
   template. Exported once and stretched, a 545pt card drawn from a 128pt crop
   would carry a 4× stroke on one axis and a 2× one on the other; exported per
   placement it would be forty files to keep in step. So it is built here, at the
   size it is placed, from the geometry read out of Max's own vectors — which
   makes every number below checkable against the file rather than eyeballed.

   The geometry, measured off frames 6292:5484 (204 × 102), 6292:5487 (128 × 124)
   and 3540:5474 (545 × 411): everything scales with the CORNER RADIUS, which is
   the one thing Max varies by hand. The extrusion is 1.12r across and 0.82r
   down; the face is inset 1.13pt from the extrusion's left and 1.96pt from the
   box's right; the line is 2pt at every size. */

/** The radius a block is drawn with unless a placement says otherwise — the
    13.08pt every small block in the file uses. */
export const LV_BLOCK_R = 13.084;
/** The line weight, in Figma points. Constant at every size. */
export const LV_BLOCK_STROKE = 2;

/** Where the two copies sit inside a w × h box.

    `lift` is how far the extrusion is thrown across. It defaults to 1.12r,
    which is what every SMALL block in the file measures — but Max scales the
    two apart on the big cards (the CTA's is a 28pt radius under a 25pt lift,
    the contents page's a 56 under a 50), so a placement can state it. The
    vertical throw keeps the measured 0.73 of the horizontal either way. */
export function lvBlockBox(w: number, h: number, r = LV_BLOCK_R, lift?: number) {
  const lx = lift ?? r * 1.12;
  const ly = lx * 0.732;
  /* The face. Its right edge stops 1.96pt short of the box so the 2pt line sits
     inside it, and its foot stops clear of the extrusion below. */
  const face = { x: lx + 1.13, y: 1.71, w: w - lx - 3.09, h: h - ly - 3.21 };
  /* The extrusion: the same rectangle, moved down-left. */
  const back = { x: 1.13, y: 1.71 + ly, w: face.w, h: face.h };
  return { r, lx, ly, face, back };
}

/** The extrusion's visible silhouette as an SVG path, in the box's own units.
    Every control point is the measured one, written as an offset from a corner
    in units of r, so the curve keeps its shape at any size. */
function lvExtrusionPath(w: number, h: number, r: number, lift?: number): string {
  const { face: f, back: b } = lvBlockBox(w, h, r, lift);
  const fr = f.x + f.w, fb = f.y + f.h;
  const br = b.x + b.w, bb = b.y + b.h;
  const n = (v: number) => Number(v.toFixed(3));
  return [
    /* Down the top-left diagonal, from the face's corner to the extrusion's. */
    `M${n(f.x + 0.566 * r)} ${n(f.y + 0.098 * r)}`,
    `C${n(f.x + 0.050 * r)} ${n(f.y + 0.328 * r)} ${n(b.x + 0.495 * r)} ${n(b.y - 0.179 * r)} ${n(b.x + 0.495 * r)} ${n(b.y - 0.179 * r)}`,
    /* Round the extrusion's top-left corner. */
    `C${n(b.x + 0.495 * r)} ${n(b.y - 0.179 * r)} ${n(b.x + 0.262 * r)} ${n(b.y - 0.035 * r)} ${n(b.x + 0.118 * r)} ${n(b.y + 0.252 * r)}`,
    `C${n(b.x)} ${n(b.y + 0.487 * r)} ${n(b.x)} ${n(b.y + 0.854 * r)} ${n(b.x)} ${n(b.y + 0.854 * r)}`,
    /* Down its left side and round the foot. */
    `L${n(b.x)} ${n(bb - 1.230 * r)}`,
    `C${n(b.x)} ${n(bb - 1.230 * r)} ${n(b.x)} ${n(bb - 0.746 * r)} ${n(b.x + 0.393 * r)} ${n(bb - 0.353 * r)}`,
    `C${n(b.x + 0.743 * r)} ${n(bb)} ${n(b.x + 1.281 * r)} ${n(bb)} ${n(b.x + 1.281 * r)} ${n(bb)}`,
    `H${n(br - 1.290 * r)}`,
    /* Round the bottom-right corner and back up the second diagonal. */
    `C${n(br - 1.290 * r)} ${n(bb)} ${n(br - 0.807 * r)} ${n(bb + 0.033 * r)} ${n(br - 0.523 * r)} ${n(bb - 0.062 * r)}`,
    `C${n(br - 0.285 * r)} ${n(bb - 0.141 * r)} ${n(br + 0.035 * r)} ${n(bb - 0.390 * r)} ${n(br + 0.035 * r)} ${n(bb - 0.390 * r)}`,
    `L${n(fr - 0.300 * r)} ${n(fb - 0.284 * r)}`,
  ].join('');
}

/** The extrusion as a CLOSED shape, for the filled finish: the silhouette above,
    carried back along the face's own edges. */
function lvExtrusionFill(w: number, h: number, r: number, lift?: number): string {
  const { face: f } = lvBlockBox(w, h, r, lift);
  const fr = f.x + f.w, fb = f.y + f.h;
  return `${lvExtrusionPath(w, h, r, lift)}L${fr.toFixed(3)} ${f.y.toFixed(3)}L${f.x.toFixed(3)} ${f.y.toFixed(3)}L${f.x.toFixed(3)} ${fb.toFixed(3)}Z`;
}

export interface LvBlockArt {
  /** The box, in Figma points. */
  w: number; h: number;
  /** Corner radius, in Figma points. Max scales the whole motif by this. */
  r?: number;
  /** How far the extrusion is thrown, in Figma points. Defaults to 1.12r — see
      lvBlockBox for why a big card states it instead. */
  lift?: number;
  /** 'outline' draws both copies as a line; 'solid' fills them. */
  finish?: 'outline' | 'solid';
  /** The line, and the extrusion's fill when solid. An LV_BLOCK key, or
      'gradient' for the orange → magenta → violet card. */
  color: LvBlockColor | 'gradient';
  /** The face's own fill, on a solid block. Defaults to the block colour, which
      is the keycap; the gradient cards set it to paper. */
  face?: string;
  /** Which way the block is turned. The motif is drawn extruding DOWN-LEFT, and
      Max reaches for all four quarters of that — TOC 56's decorations are the
      half turn, the CTA's card and TOC 54's are the mirror. Two booleans rather
      than four names because they compose: `flip` is a half turn, `mirror` a
      reflection, and together they give the fourth. */
  flip?: boolean;
  mirror?: boolean;
}

/** One block as an SVG data URI, drawn at the size it is placed.

    A data URI rather than a file because the art IS the placement: there is no
    crop to name and no second consumer. It is still an ordinary image element on
    the canvas — selectable, movable, deletable — exactly like Career Pathways'
    dash fields. */
export function lvBlockSrc(a: LvBlockArt): string {
  const { w, h, r = LV_BLOCK_R, lift, finish = 'outline', flip, mirror } = a;
  const line = a.color === 'gradient' ? 'url(#g)' : LV_BLOCK[a.color].stroke;
  const fill = a.color === 'gradient' ? 'url(#g)' : LV_BLOCK[a.color].fill;
  const { face } = lvBlockBox(w, h, r, lift);
  const grad = a.color === 'gradient'
    ? `<defs><linearGradient id="g" x1="0" y1="0" x2="${(w * 0.3).toFixed(1)}" y2="${(h * 1.4).toFixed(1)}" gradientUnits="userSpaceOnUse">`
      + LV_GRADIENT.map((c, i) => `<stop offset="${i / (LV_GRADIENT.length - 1)}" stop-color="${c}"/>`).join('')
      + '</linearGradient></defs>'
    : '';
  const body = finish === 'solid'
    ? `<path d="${lvExtrusionFill(w, h, r, lift)}" fill="${fill}"/>`
      + `<rect x="${face.x.toFixed(2)}" y="${face.y.toFixed(2)}" width="${face.w.toFixed(2)}" height="${face.h.toFixed(2)}" rx="${r.toFixed(2)}" fill="${a.face ?? fill}"/>`
    : `<path d="${lvExtrusionPath(w, h, r, lift)}" stroke="${line}" stroke-width="${LV_BLOCK_STROKE}" fill="none"/>`
      + `<rect x="${face.x.toFixed(2)}" y="${face.y.toFixed(2)}" width="${face.w.toFixed(2)}" height="${face.h.toFixed(2)}" rx="${r.toFixed(2)}" stroke="${line}" stroke-width="${LV_BLOCK_STROKE}" fill="${a.face ?? 'none'}"/>`;
  /* Both turns happen about the box's own centre, so the artwork stays inside
     the box it was asked for and the caller places one rectangle either way. */
  const cx = (w / 2).toFixed(2), cy = (h / 2).toFixed(2);
  const t = [flip ? `rotate(180 ${cx} ${cy})` : '', mirror ? `translate(${w} 0) scale(-1 1)` : ''].filter(Boolean).join(' ');
  const turn = t ? `<g transform="${t}">${body}</g>` : body;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" preserveAspectRatio="none">${grad}${turn}</svg>`;
  /* encodeURIComponent, not base64: the markup stays legible in the DOM and in a
     saved book, and it is shorter for this much ASCII. '#' has to go — an
     unescaped one ends the URI at the first colour. */
  return `data:image/svg+xml,${encodeURIComponent(svg).replace(/#/g, '%23')}`;
}

/* The six 3D keycaps, exported from the Elements board (6292:5471-5476) rather
   than generated: unlike the flat blocks these carry Max's own shading — a lit
   top face, a shadowed extrusion and a rim light along one edge — which is
   artwork, not geometry. They are placed at their native 125.9 × 100.4 and
   204.4 × 121.1 and never stretched. */
const LV_ART = '/assets/templates/lovable';
export const LV_KEYCAP: Record<Exclude<LvBlockColor, 'white'>, string> = {
  red: `${LV_ART}/block-red.svg`,
  orange: `${LV_ART}/block-orange.svg`,
  pink: `${LV_ART}/block-pink.svg`,
  violet: `${LV_ART}/block-violet.svg`,
  blue: `${LV_ART}/block-blue.svg`,
  black: `${LV_ART}/block-black.svg`,
};

/* ── type scale ──────────────────────────────────────────────────────────────
   Every size the template uses, in Figma points, with the weight and leading it
   is set at. One table because the designs share them: a chapter title and a
   contents heading are both 42pt Bold, and reading that off one list is what
   keeps them that way. */
export const LV_TYPE = {
  /** Cover title — four short lines at 80pt, set tight enough to lock up. */
  coverTitle: { size: 80, weight: 700, lineHeight: '0.9', letterSpacing: '-2px' },
  /** The standfirst, top right, set from the right edge. */
  coverSubtitle: { size: 18, weight: 500, lineHeight: '1.2', letterSpacing: '0.36px' },
  /** The byline, which sits INSIDE the black block rather than beside it. */
  coverAuthor: { size: 24, weight: 700, lineHeight: '1', letterSpacing: '-0.6px' },
  /** A chapter opener's title, and the contents heading. */
  display: { size: 42, weight: 700, lineHeight: '1.2' },
  /** The contents heading — the same 42pt, tracked tighter because it is one
      long line rather than three short ones. */
  tocHeading: { size: 42, weight: 700, lineHeight: '1', letterSpacing: '-1.26px' },
  /** A chapter opener's oversized numeral. */
  chapterNumber: { size: 100, weight: 700, lineHeight: '82px', letterSpacing: '-2px' },
  /** The headline a content page opens with, when it opens with one. */
  pageTitle: { size: 32, weight: 600, lineHeight: '1.1' },
  /** Running text, everywhere it appears. */
  body: { size: 14, weight: 400, lineHeight: '20px' },
  /** Running text set in a narrow card — the CTA and the back page set their
      copy on a multiplier rather than a fixed 20pt step. */
  cardBody: { size: 14, weight: 400, lineHeight: '1.4' },
  /** A photo's caption. */
  caption: { size: 11, weight: 400, lineHeight: '1.3' },
  /** The folio. */
  folio: { size: 12, weight: 500, lineHeight: '16px' },
  /** A contents row, and its page number. */
  tocEntry: { size: 16, weight: 500, lineHeight: '32px', letterSpacing: '-0.32px' },
  tocFolio: { size: 16, weight: 700, lineHeight: '32px', letterSpacing: '-0.32px' },
  /** The author's credit on a back page, and the CTA's button. */
  credit: { size: 16, weight: 700, lineHeight: '18px' },
  /** A workbook page's title, and the instruction sitting under it. */
  workbookTitle: { size: 36, weight: 700, lineHeight: '1.1' },
  workbookPrompt: { size: 14, weight: 400, lineHeight: '20px' },
  workbookDay: { size: 10, weight: 500, lineHeight: '20px', letterSpacing: '0.5px' },
  /** The pull-quote's attribution. */
  attribution: { size: 14, weight: 700, lineHeight: '20px' },
} as const;

/* ── page metrics ────────────────────────────────────────────────────────────
   The measurements that are NOT margins: the column grid, the folio, the photo
   cards. All in Figma points. */
export const LV_METRIC = {
  /** The 40pt all four margins are set on. */
  margin: 40,
  /** One full-measure column: 595 − 40 − 40. */
  measure: 515,
  /** Two-column grid: 40 → 288, 308 → 555. A 20pt gutter, not Career Pathways'
      21 — close enough to look the same and different enough to be worth not
      sharing a constant. */
  columnW: 247,
  columnGap: 20,
  /** The folio's own box. It alternates corners — right on a recto, left on a
      verso — which is the one piece of furniture every content page carries. */
  folioY: 786,
  folioRightX: 550,
  /** A portrait photo card, and the landscape one. Both are the block motif with
      a photograph set into the face and the caption beside it. */
  photoTallW: 261, photoTallH: 522,
  photoWideW: 522, photoWideH: 261,
  /** Workbook writing lines: 32pt apart, inset to the margin. */
  lineGap: 32,
  lineInset: 40,
} as const;
