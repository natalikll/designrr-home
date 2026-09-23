'use client';

import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle, FontFamily, FontSize } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import TiptapImage from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { HorizontalRule } from '@tiptap/extension-horizontal-rule';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Node, Extension, mergeAttributes, textInputRule, type JSONContent } from '@tiptap/core';
import QRCode from 'qrcode';
import { useFlowStore, ownsPlan } from '@/stores/flowStore';
import { buildEpub, downloadEpub, inlineExternalImages } from '@/lib/epub';
import { runChecks, summarise, type CheckResult, type CheckStatus } from '@/lib/bookChecks';
import { FOOTNOTE_LIST_CLASS, applyFootnoteNumbering } from '@/lib/footnotes';
import {
  PAGE_W as DEFAULT_PAGE_W, PAGE_H as DEFAULT_PAGE_H,
  measureBreaks, sameBreaks, pageTop, stackHeight, bandTop, contentH, pageOfTop,
  FOOTNOTE_GAP, footnoteReserveMax,
  PAGE_SIZES, pageGeometry, DEFAULT_GEOMETRY,
  DEFAULT_PAGE_SIZE, DEFAULT_MARGIN_X, DEFAULT_MARGIN_Y,
  type PageBreak, type FlowBlock, type PageGeometry,
} from '@/lib/pagination';
import { TierBadge, shouldShowTierBadge, type GateTier } from '../ui/TierBadge';
import { UpgradePlanModal } from '../account/MyAccountView';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { AISparkleIcon, DuplicateIcon, TrashIcon } from '../presentation/presentationIcons';
import { Tooltip } from '../ui/Tooltip';

/* ── shared tokens, matching the rest of the app ─────────────────────────────── */
const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;
const INK = '#15191F';
const SLATE = '#52637A';
const BORDER = '#E0E5EB';
const BLUE = '#006EFE';
// Floating panels (dropdowns/menus) get their own lighter border instead of reusing the
// flat divider color — matches PresentationEditorView/NarrationViewV4's convention.
const PANEL_BORDER = '#E8EBF2';
// Quiet uppercase section-eyebrow color — distinct from SLATE, which stays for real
// body/secondary text. Matches PresentationEditorView's label convention. Darkened
// from the original #A8B3C4 (2.1:1 on white, failed WCAG AA) to ~5:1 — still visibly
// lighter than SLATE, just no longer illegible for low-vision users at 10.5px bold.
const EYEBROW_COLOR = '#63707F';
// Shared shadow tiers, both in the app's rgba(15,23,51,…) family (previously a few
// dropdowns hand-rolled this same string; PAGE_SHADOW used an off-family tint below).
const MENU_SHADOW = '0px 8px 24px rgba(15,23,51,0.12)';
// Matches PresentationEditorView's own AI_GRADIENT exactly (kept local rather
// than imported — everything else that crosses between these two editors is a
// small, genuinely generic icon; this one's tied to this file's own AIButton).
const AI_GRADIENT = 'linear-gradient(244.79deg, #006EFE 2.17%, #5326BD 103.16%)';
const CARD_SHADOW = '0px 2px 6px rgba(15,23,51,0.08)';
// The dataviz skill's validated categorical palette (light-mode steps only — book
// pages are a print-like light surface via theme.bg, no dark-mode chart surface
// exists in this editor). Fixed order is the CVD-safety mechanism itself, not
// cosmetic — never cycle or reassign per-chart; a chart with more rows than slots
// folds the tail into "Other" (see renderPieChartSVG) rather than generating a 9th hue.
const CHART_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
/* ── the selection ring ───────────────────────────────────────────────────────
   One ring, for everything selectable on a page: a photo, a shape, a columns
   block, a cover element, a page number, the paragraph the caret is in. It used
   to be assembled per block type — 2px here, 1.5px there, offsets of 1/2/4/5px,
   four different corner radii, and a soft translucent glow on the two text
   fields — so "selected" looked like a different thing depending on what you'd
   clicked. Same width, same colour, same offset everywhere now; the only thing
   that varies is the corner radius, which each object contributes itself so the
   ring hugs what it's around (RING_RADIUS covers the ones with square corners
   of their own, which would otherwise ring razor-sharp).
   The one intentional exception is the dashed parent hint on an image grid
   while one of its cells is selected — that marks a container you did NOT
   select, so it has to read as the quieter of the two. */
/* Softened by width, not colour, and the ring stays brand blue deliberately.
   WCAG 1.4.11 wants a selection/focus indicator at 3:1 or better against the
   surface behind it: brand blue on the page is 4.5:1, with room to thin the line,
   but lightening the hue spends that headroom fast — a 25% lift to #4D95FE is
   already 2.98:1 and fails. Blue is also what selection means everywhere else in
   the app, so a neutral (SLATE passes at 6.1:1) would read as a disabled or
   secondary state instead. Hence 1.5px: the same colour, a finer line.
   RING_OFFSET matters more than the width here — the gap puts the ring on the
   page background rather than on the photo or tint it surrounds, which is what
   keeps a thin line legible over arbitrary image content. */
const RING_WIDTH = 1.5;
const RING = `${RING_WIDTH}px solid ${BLUE}`;
const RING_OFFSET = 3;
/* A full-bleed object (the chapter opener photo runs past the page's own edge)
   can't take an outward ring — it would be drawn off the sheet — so the same
   ring goes just inside the edge instead. */
const RING_OFFSET_INSET = -3;
const RING_RADIUS = 4;
const ringStyle = (selected: boolean, offset: number = RING_OFFSET) =>
  ({ outline: selected ? RING : 'none', outlineOffset: offset }) as const;

const RADIUS_SM = 6;
const RADIUS_MD = 8;
const RADIUS_LG = 12;
const RADIUS_PILL = 999;
const RAIL_W = 76;
/* Left panel: insert tools plus Properties. A little wider than the 240 it carried
   when it held insert tiles alone, because Properties moved in and its option grids
   and swatch rows were laid out against the old 296 inspector. */
const PANEL_W = 264;
/* Right panel: the navigator — Pages, Chapters — plus History and Find when the top
   bar opens them. Narrow on purpose: it's reference, not a work surface, so it gives
   its width back to the canvas. Page thumbnails scale off this (see thumbW). */
const INSPECTOR_W = 240;
/* The DEFAULT page box. Trim size and margins are a book setting now (Book
   settings → Page), so anything drawing this book's own pages takes the live
   geometry as a prop; these two are for the surfaces that show a DESIGN rather
   than this book — a template row's preview, the preview overlay's device
   widths — which keep the proportions they were drawn at. */
const PAGE_W = DEFAULT_PAGE_W;
const PAGE_MIN_H = DEFAULT_PAGE_H;
const PAGE_SHADOW = '0 1px 2px rgba(15,23,51,0.04), 0 10px 28px rgba(15,23,51,0.08)';
const ZOOM_OPTIONS = [50, 75, 90, 100, 125, 150];

/* A small curated stock library, standing in for the real contextual/Unsplash-style
   search Designrr's own live product has — mocked like every other network-backed
   feature in this prototype, but real enough to demonstrate "pick from a library"
   instead of always getting the same fixed placeholder. */
const STOCK_IMAGES: { label: string; src: string }[] = [
  // Real photos (bundled assets, not live hotlinks, matching the zero-network-
  // dependency convention) — replaced the placeholder pastel swatches these used
  // to be so the editor stops looking like a wireframe wherever imagery shows up
  // (cover backgrounds, image-grid cells, the stock-photo picker).
  { label: 'Minimalist desk (default)', src: '/assets/cover-default.jpg' },
  { label: 'Desk workspace', src: '/assets/stock-desk.jpg' },
  { label: 'Team meeting', src: '/assets/stock-team.jpg' },
  { label: 'City skyline', src: '/assets/stock-skyline.jpg' },
  { label: 'Nature trail', src: '/assets/stock-trail.jpg' },
  { label: 'Reading a book', src: '/assets/stock-reading.jpg' },
  { label: 'Data chart', src: '/assets/stock-chart.jpg' },
  { label: 'Smiling portrait', src: '/assets/stock-portrait.jpg' },
  { label: 'Vintage family photo', src: '/assets/stock-vintage.jpg' },
  { label: 'Canoe on a lake', src: '/assets/stock-canoe.jpg' },
];

/* Deterministic "generation" for the mocked AI image tool below — same idea as
   qrModules further down: no real model to call, so the prompt text is hashed
   into a pick from the existing stock library instead of always handing back
   the same placeholder regardless of what was typed. */
function seededPick<T>(items: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return items[h % items.length];
}

/* Mocked allowance for the "Generate image" tool, separate from MANUSCRIPT_LIMITS
   (flowStore) — that pool meters whole book/presentation generations, a very
   different resource from single images, and conflating the two would make the
   book generation gate mean something it doesn't. Standing per-tier shape only:
   this prototype has no real image model billed per call. */
const IMAGE_CREDIT_LIMITS: Record<string, number> = {
  standard: 20,
  pro: 60,
  premium: Infinity,
  agency: Infinity,
};
const IMAGE_GENERATE_COST = 10;

/* ── shared editor services ──────────────────────────────────────────────────
   Four things every editing surface in this file needs, threaded by context
   rather than by prop chains six components deep: the user's own uploaded
   (and generated) images, how many image-generation credits are spent, the
   spell-check preference, and a registry of every live editor so find-and-
   replace can reach all of them at once. */

// `source` distinguishes a file upload from an AI generation — both used to be
// flattened into one `uploaded` flag, which was fine while PhotoSourcePanel
// searched them as a single pool. It now keeps Upload/My uploads/Wordgenie AI
// as separate sections (matching the real product's own Media panel), so it
// needs to tell them apart.
interface ImageLibraryEntry { label: string; src: string; source?: 'upload' | 'generated' }

interface UnsplashResult {
  id: string;
  thumbUrl: string;
  fullUrl: string;
  alt: string;
  downloadLocation: string;
  credit: { name: string; profileUrl: string };
}

/* Real Unsplash search, debounced, behind the app's first API route
   (`/api/unsplash/search`) so the access key stays server-side. No key
   configured (or the request fails) -> 'error', and PhotoSourcePanel falls
   back to the curated STOCK_IMAGES grid rather than showing a dead end. */
function useUnsplashSearch(query: string) {
  // Keyed by the query it answers, so render time (not the effect body) can
  // tell "idle" (no query) apart from "loading" (query changed, fetch not
  // back yet) without ever calling setState synchronously inside the effect.
  const [resolved, setResolved] = useState<{ query: string; status: 'error' | 'ok'; results: UnsplashResult[] } | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/unsplash/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('unsplash_unavailable'))))
        .then((data) => setResolved({ query: q, status: 'ok', results: data.results ?? [] }))
        .catch((err) => { if (err.name !== 'AbortError') setResolved({ query: q, status: 'error', results: [] }); });
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  const q = query.trim();
  if (!q) return { status: 'idle' as const, results: [] as UnsplashResult[] };
  if (!resolved || resolved.query !== q) return { status: 'loading' as const, results: [] as UnsplashResult[] };
  return { status: resolved.status, results: resolved.results };
}

const ImageLibraryContext = createContext<{
  images: ImageLibraryEntry[];
  add: (label: string, src: string, source?: 'upload' | 'generated') => void;
  creditsUsed: number;
  useCredits: (n: number) => void;
}>({ images: STOCK_IMAGES, add: () => {}, creditsUsed: 0, useCredits: () => {} });

/* Suggested caps at the same six — two rows of the three-up grid. A suggestion
   you have to scroll to is not doing the job a suggestion exists to do, and the
   search box directly above it is the route to more. */
const SUGGESTED_LIMIT = 6;

/* What the Suggested section searches for when nobody has typed anything.
   Context rather than a prop because PhotoSourcePanel has five call sites
   (Replace image, cover element, opener photo, author photo, and the Photos tab
   itself) and none of the other four care about this.

   Before this, "Suggested" rendered the same ten bundled JPEGs for every user,
   every book and every topic — it did not suggest, it was a fixed shelf wearing a
   label it had not earned. The search half was always real
   (`/api/unsplash/search` behind a server-side key); only the zero-query state
   was invented. */
const PhotoSuggestContext = createContext<string>('');

/* How paragraphs are separated, book-wide. Two options, because there are only
   two real answers: the printed-book one (indent the first line, no space
   between) and the web one (space between, no indent). Using both at once is
   the classic beginner's tell — the indent and the blank line each do the same
   job, so together they say it twice — and using neither leaves the reader with
   no paragraph boundaries at all.

   Spaced is the default and what every book in this editor has been set in so
   far, so nothing already written reflows on upgrade. */
type ParagraphStyle = 'spaced' | 'indented';
const PARAGRAPH_INDENT_EM = 1.5;

/* accentColor rides along so SwatchRow can offer the book's own accent without
   every inspector having to be handed the theme. It was the one colour a theme
   had already committed to and the one colour no palette in the editor offered. */
const EditorPrefsContext = createContext<{ spellcheck: boolean; paragraphStyle: ParagraphStyle; accentColor: string }>({ spellcheck: true, paragraphStyle: 'spaced', accentColor: '#006EFE' });

/* The live page box — trim size and margins, from Book settings. A context and
   not a prop because nearly every rendering surface in this file draws a page:
   the chapter canvas, the cover, the read-only Preview render, and four sizes
   of thumbnail. They have nothing else in common and most are several levels
   apart, so threading one more prop through all of them would touch far more
   code than it explains. Default is the shipped Letter page, which is what the
   surfaces OUTSIDE the provider want anyway — a template row's preview shows a
   design, not this book. */
const PageGeometryContext = createContext<PageGeometry>(DEFAULT_GEOMETRY);

type RegisteredEditorKind = 'chapter' | 'field';
interface RegisteredEditor { key: string; editor: Editor; kind: RegisteredEditorKind }

const EditorRegistryContext = createContext<
  (key: string, editor: Editor, kind: RegisteredEditorKind) => () => void
>(() => () => {});

/* Registers an editor for the lifetime of the component that owns it. Kept as a
   hook so both ChapterEditor and SimpleFieldEditor opt in with one line. */
function useRegisterEditor(key: string, editor: Editor | null, kind: RegisteredEditorKind) {
  const register = useContext(EditorRegistryContext);
  useEffect(() => {
    if (!editor) return;
    return register(key, editor, kind);
  }, [register, key, editor, kind]);
}

/* Browsers default contenteditable spell-check inconsistently, and TipTap sets
   the attribute only at creation — so it's applied to the live DOM node instead,
   which also lets the preference change without rebuilding every editor. */
function useSpellcheck(editor: Editor | null, enabled: boolean) {
  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute('spellcheck', enabled ? 'true' : 'false');
  }, [editor, enabled]);
}

/* Upload cap. These become base64 inside the document, which is also what gets
   persisted, so an unbounded upload would blow the storage quota on one photo. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function readImageFile(file: File): Promise<{ src: string; label: string } | { error: string }> {
  if (!file.type.startsWith('image/')) return Promise.resolve({ error: 'That file isn’t an image.' });
  if (file.size > MAX_UPLOAD_BYTES) return Promise.resolve({ error: `Images need to be under ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB. That one is ${(file.size / 1024 / 1024).toFixed(1)} MB.` });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(
      typeof reader.result === 'string'
        ? { src: reader.result, label: file.name.replace(/\.[^.]+$/, '') }
        : { error: 'That image couldn’t be read.' },
    );
    reader.onerror = () => resolve({ error: 'That image couldn’t be read.' });
    reader.readAsDataURL(file);
  });
}

/* ── the wrap-aware image node — the whole point of this rebuild ─────────────
   A plain <img> would need x/y coordinates to place near text; this node instead
   carries a `wrap` attribute that resolves to a CSS float, so an image is a
   participant in the document flow, not an object floating over it. */
type WrapValue = 'inline' | 'left' | 'right' | 'full-bleed';

/* -- hand-resize, for photos and photo grids ---------------------------------
   Same idea as the cover's ResizeHandles + beginResize (four corner dots, the
   diagonally-opposite corner stays put), with two differences that come from
   these boxes living in a text flow rather than on a free canvas:

   - The cover writes x/y/w/h as PERCENTAGES of its stage, because an element
     there is positioned absolutely. A photo in a chapter is positioned by the
     flow, so there is nothing to anchor: the drag writes boxW/boxH in px, the
     same pair the inspector's W and H fields write, and the flow re-places the
     box at its new size.
   - The cover commits on every pointermove into React state. Here a commit is a
     ProseMirror transaction, which re-paginates the chapter -- sixty of those a
     second would fight the reflow loop and leave sixty steps in the undo stack.
     So the drag writes straight to the element's style and commits once, on
     pointerup: one transaction, one reflow, one undo step.

   The canvas is CSS-scaled by the zoom control, so a pointer moves more screen
   pixels than layout pixels at 150% and fewer at 50%. Dividing by the box's own
   rendered-over-layout ratio corrects for it without this code having to know
   anything about zoom. */
const RESIZE_MIN_PX = 48;
type ResizeCorner = 'tl' | 'tr' | 'bl' | 'br';

function buildResizeHandles(onStart: (corner: ResizeCorner, e: PointerEvent) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'book-resize-handles';
  wrap.contentEditable = 'false';
  wrap.style.display = 'none';
  const corners: { corner: ResizeCorner; cursor: string }[] = [
    { corner: 'tl', cursor: 'nwse-resize' },
    { corner: 'tr', cursor: 'nesw-resize' },
    { corner: 'bl', cursor: 'nesw-resize' },
    { corner: 'br', cursor: 'nwse-resize' },
  ];
  for (const { corner, cursor } of corners) {
    const dot = document.createElement('div');
    dot.className = 'book-resize-dot book-resize-dot--' + corner;
    dot.style.cursor = cursor;
    dot.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onStart(corner, e);
    });
    wrap.appendChild(dot);
  }
  return wrap;
}

function dragResize({ box, corner, event, lockAspect, maxW, commit }: {
  /** The element whose rendered size is being dragged. */
  box: HTMLElement;
  corner: ResizeCorner;
  event: PointerEvent;
  lockAspect: boolean;
  /** Width of the column the box sits in; 0 for "no ceiling". Matches the
      max-width:100% every one of these boxes already renders with, so a drag
      cannot push a photo wider than the page it is on. */
  maxW: number;
  commit: (w: number, h: number) => void;
}) {
  const startW = box.offsetWidth;
  const startH = box.offsetHeight;
  if (!startW || !startH) return;
  const rendered = box.getBoundingClientRect().width;
  const scale = rendered && startW ? rendered / startW : 1;
  const ratio = startW / startH;
  // Which way "bigger" is for this corner: a left-hand handle grows as it
  // moves left, a top handle as it moves up.
  const signX = corner === 'tr' || corner === 'br' ? 1 : -1;
  const signY = corner === 'bl' || corner === 'br' ? 1 : -1;
  const ceiling = maxW > 0 ? maxW : Number.POSITIVE_INFINITY;
  let w = startW;
  let h = startH;

  const onMove = (ev: PointerEvent) => {
    const dx = ((ev.clientX - event.clientX) / scale) * signX;
    const dy = ((ev.clientY - event.clientY) / scale) * signY;
    if (lockAspect) {
      // One dimension drives, and it is whichever the pointer moved further
      // in -- dragging a corner mostly sideways should read as a width change
      // and mostly downwards as a height change, rather than always one.
      const byWidth = Math.abs(dx) >= Math.abs(dy);
      w = Math.round(Math.min(ceiling, Math.max(RESIZE_MIN_PX, byWidth ? startW + dx : (startH + dy) * ratio)));
      h = Math.round(Math.max(RESIZE_MIN_PX, w / ratio));
    } else {
      w = Math.round(Math.min(ceiling, Math.max(RESIZE_MIN_PX, startW + dx)));
      h = Math.round(Math.max(RESIZE_MIN_PX, startH + dy));
    }
    box.style.width = w + 'px';
    box.style.height = h + 'px';
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (w !== startW || h !== startH) commit(w, h);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

/* One pass over the attributes, feeding both renderings of a figure: addNodeView
   builds real DOM from it for the live canvas, renderHTML turns the same values
   into a ProseMirror output spec for editor.getHTML() and every export
   downstream of it. Same split ShapeBlock, QrCodeBlock and ChartBlock already
   use — written once here so the canvas and the exported file cannot drift. */
type ImageNodeAttrs = {
  src: string; alt: string; wrap: WrapValue; caption: string; decorative: boolean; locked: boolean;
  radius: string; borderWidth: number; borderColor: string; shadow: string; originalSrc: string; crop: string; opacity: number;
  fit: string; boxW: number; boxH: number; borderPos: string; borderSides: string; borderStyle: string; lockAspect: boolean; sizeMode: string;
};

function imageFigureParts(attrs: ImageNodeAttrs): { figAttrs: Record<string, string>; imgAttrs: Record<string, string> } {
  const { src, alt, wrap, decorative, locked, radius, borderWidth, borderColor, shadow, originalSrc, crop, opacity, fit, boxW, boxH, borderPos, borderSides, borderStyle, lockAspect, sizeMode } = attrs;
  const imgAttrs: Record<string, string> = decorative ? { src, alt: '', role: 'presentation' } : { src, alt };
  const sizing: string[] = [];
  // 'column' needs nothing — .book-img-wrap img is already width:100%.
  if (sizeMode === 'original') sizing.push('width:auto', 'max-width:100%');
  if (sizeMode === 'fixed') {
    if (boxW) sizing.push(`width:${boxW}px`);
    if (boxH) sizing.push(`height:${boxH}px`);
  }
  /* object-fit can only change anything when the box is constrained in BOTH
     dimensions — otherwise the box just takes the photo's own shape and there
     is nothing to trim or letterbox. Emitting it otherwise produced a control
     that visibly did nothing, which is why the panel now hides it instead. */
  if (sizeMode === 'fixed' && boxW && boxH) sizing.push(`object-fit:${fit}`);
  const style = [imageStyleValue({ radius, borderWidth, borderColor, shadow, opacity, borderPos, borderSides, borderStyle }), ...sizing].filter(Boolean).join(';');
  if (style) imgAttrs.style = style;
  const figAttrs: Record<string, string> = {
    'data-wrap': wrap,
    ...(locked ? { 'data-locked': 'true' } : {}),
    // Mirrored onto the figure so parseHTML can read them straight back — the
    // <img>'s own inline style would otherwise have to be re-parsed out of CSS.
    ...(src ? {} : { 'data-empty': 'true' }),
    ...(fit !== 'cover' ? { 'data-fit': fit } : {}),
    ...(sizeMode !== 'column' ? { 'data-size-mode': sizeMode } : {}),
    ...(lockAspect ? {} : { 'data-lock-aspect': 'false' }),
    ...(boxW ? { 'data-w': String(boxW) } : {}),
    ...(boxH ? { 'data-h': String(boxH) } : {}),
    ...(opacity < 1 ? { 'data-opacity': String(opacity) } : {}),
    ...(radius ? { 'data-radius': radius } : {}),
    ...(borderWidth ? {
      'data-border-w': String(borderWidth), 'data-border-c': borderColor, 'data-border-pos': borderPos,
      // Only when it isn't the default, so the markup of the ordinary four-sided
      // stroke is byte-for-byte what it was before sides existed.
      ...(borderSides && borderSides !== 'all' ? { 'data-border-sides': borderSides } : {}),
      ...(borderStyle && borderStyle !== 'solid' ? { 'data-border-style': borderStyle } : {}),
    } : {}),
    ...(shadow && shadow !== 'none' ? { 'data-shadow': shadow } : {}),
    ...(originalSrc ? { 'data-original-src': originalSrc } : {}),
    ...(crop ? { 'data-crop': crop } : {}),
    class: `book-img-wrap book-img-wrap--${wrap}`,
  };
  return { figAttrs, imgAttrs };
}

const WrappableImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      wrap: {
        default: 'inline' as WrapValue,
        parseHTML: (el: HTMLElement) => (el.getAttribute('data-wrap') as WrapValue) || 'inline',
        renderHTML: (attrs: Record<string, unknown>) => ({
          'data-wrap': attrs.wrap,
          class: `book-img-wrap book-img-wrap--${attrs.wrap}`,
        }),
      },
      // Old Designrr's "Captioned Image" as a plain attribute rather than a second
      // node type: empty renders exactly like before, non-empty wraps the <img> in a
      // <figure> with a <figcaption> underneath (see renderHTML override below).
      caption: {
        default: '',
        parseHTML: (el: HTMLElement) => (el.tagName === 'FIGURE' ? el.querySelector('figcaption')?.textContent ?? '' : ''),
        renderHTML: () => ({}),
      },
      /* An image that carries no meaning. WCAG's answer is an explicit empty alt
         plus role="presentation" — which the alt check previously read as a
         missing alt, leaving decorative images permanently un-passable. */
      decorative: {
        default: false,
        parseHTML: (el: HTMLElement) => el.querySelector('img')?.getAttribute('role') === 'presentation',
        renderHTML: () => ({}),
      },
      // Frozen against drag/resize/delete until unlocked — see the Lock feature's
      // FloatingObjectBar/Inspector treatment. Explicit parseHTML/renderHTML here
      // (rather than relying on the bare attribute default) since this node's own
      // renderHTML below builds its tag from scratch and ignores HTMLAttributes.
      locked: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-locked') === 'true',
        renderHTML: (attrs: Record<string, unknown>) => (attrs.locked ? { 'data-locked': 'true' } : {}),
      },
      /* Presentation attributes, serialized as an inline style on the <img> by
         renderHTML below. Inline rather than a class because the export path ships
         the serialized HTML on its own — PDF, EPUB and Kindle all get the figure
         markup without this file's stylesheet, so a class would silently drop the
         styling everywhere except the editor canvas. Numeric presets rather than
         free input: these are the four/three choices worth having, and they keep
         the values inside what reflowable EPUB renderers actually honour. */
      /* Crop is applied destructively — the cropped pixels become `src`, so every
         export (PDF, DOCX, EPUB, Kindle) ships a plain <img> that is already the
         right shape. CSS cropping would have been reversible for free, but DOCX
         ignores object-fit entirely and DOCX is the largest ebook export by volume,
         so it would have silently shipped uncropped images.
         `originalSrc` and `crop` exist so the destruction is still undoable and
         re-editable: re-entering crop restores the previous rect and re-cuts from
         the original, never from an already-cropped copy. */
      originalSrc: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-original-src') ?? '', renderHTML: () => ({}) },
      // "x,y,w,h,rotate,flipH,flipV" — x/y/w/h normalised 0–1 against the ORIGINAL.
      crop: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-crop') ?? '', renderHTML: () => ({}) },
      /* How the photo fills its box when it has one — a grid cell, or a manual
         W/H. Default 'cover' so a grid reads as a grid: equal tiles, no ragged
         heights. 'contain' letterboxes instead of trimming. */
      /* How the BOX is sized, as distinct from `fit`, which is how the pixels sit
         inside it. 'column' is the CSS default (width:100%); 'original' lets the
         photo be its own size; 'fixed' honours boxW/boxH. */
      sizeMode: { default: 'column', parseHTML: (el: HTMLElement) => el.getAttribute('data-size-mode') ?? 'column', renderHTML: () => ({}) },
      lockAspect: { default: true, parseHTML: (el: HTMLElement) => el.getAttribute('data-lock-aspect') !== 'false', renderHTML: () => ({}) },
      borderPos: { default: 'inside', parseHTML: (el: HTMLElement) => el.getAttribute('data-border-pos') ?? 'inside', renderHTML: () => ({}) },
      borderSides: { default: 'all', parseHTML: (el: HTMLElement) => el.getAttribute('data-border-sides') ?? 'all', renderHTML: () => ({}) },
      borderStyle: { default: 'solid', parseHTML: (el: HTMLElement) => el.getAttribute('data-border-style') ?? 'solid', renderHTML: () => ({}) },
      fit: { default: 'cover', parseHTML: (el: HTMLElement) => el.getAttribute('data-fit') ?? 'cover', renderHTML: () => ({}) },
      boxW: { default: 0, parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-w') ?? 0), renderHTML: () => ({}) },
      boxH: { default: 0, parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-h') ?? 0), renderHTML: () => ({}) },
      opacity: { default: 1, parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-opacity') ?? 1), renderHTML: () => ({}) },
      radius: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-radius') ?? '', renderHTML: () => ({}) },
      borderWidth: { default: 0, parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-border-w') ?? 0), renderHTML: () => ({}) },
      borderColor: { default: '#0F1733', parseHTML: (el: HTMLElement) => el.getAttribute('data-border-c') ?? '#0F1733', renderHTML: () => ({}) },
      shadow: { default: 'none', parseHTML: (el: HTMLElement) => el.getAttribute('data-shadow') ?? 'none', renderHTML: () => ({}) },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'figure[data-wrap]',
        getAttrs: (el) => {
          const figure = el as HTMLElement;
          const img = figure.querySelector('img');
          return {
            src: img?.getAttribute('src') || '',
            alt: img?.getAttribute('alt') || '',
            wrap: (figure.getAttribute('data-wrap') as WrapValue) || 'inline',
            caption: figure.querySelector('figcaption')?.textContent ?? '',
            decorative: img?.getAttribute('role') === 'presentation',
            locked: figure.getAttribute('data-locked') === 'true',
            originalSrc: figure.getAttribute('data-original-src') ?? '',
            crop: figure.getAttribute('data-crop') ?? '',
            sizeMode: figure.getAttribute('data-size-mode') ?? 'column',
            lockAspect: figure.getAttribute('data-lock-aspect') !== 'false',
            borderPos: figure.getAttribute('data-border-pos') ?? 'inside',
            borderSides: figure.getAttribute('data-border-sides') ?? 'all',
            borderStyle: figure.getAttribute('data-border-style') ?? 'solid',
            fit: figure.getAttribute('data-fit') ?? 'cover',
            boxW: Number(figure.getAttribute('data-w') ?? 0),
            boxH: Number(figure.getAttribute('data-h') ?? 0),
            opacity: Number(figure.getAttribute('data-opacity') ?? 1),
            radius: figure.getAttribute('data-radius') ?? '',
            borderWidth: Number(figure.getAttribute('data-border-w') ?? 0),
            borderColor: figure.getAttribute('data-border-c') ?? '#0F1733',
            shadow: figure.getAttribute('data-shadow') ?? 'none',
          };
        },
      },
      ...(this.parent?.() ?? []),
    ];
  },
  renderHTML({ node }) {
    const attrs = node.attrs as ImageNodeAttrs;
    const { figAttrs, imgAttrs } = imageFigureParts(attrs);
    return [
      'figure',
      figAttrs,
      ['img', imgAttrs],
      /* Serialized only when there is something in it. The live canvas keeps a
         permanently present figcaption so there is always something to click,
         but an empty one in the saved HTML would round-trip into every export
         and print as a blank line under every uncaptioned image. */
      ...(attrs.caption ? [['figcaption', {}, attrs.caption] as const] : []),
    ];
  },

  /* The caption is edited in place, under the image, the way WordPress, Notion,
     Medium and Ghost all do it — not in the side panel. A panel field made you
     leave the picture to describe the picture, and it put a text input and a
     node selection in a tug of war over focus, which is what let typing a
     caption delete the image.

     The node stays a leaf atom and the caption stays an attribute, written by
     this contenteditable, rather than becoming real node content. Content would
     read better in the abstract, but it costs atom-ness, and handleClickOn's
     one-click select, activeObjectKind, MOVABLE_NODE_TYPES and the floating
     object bar all key off exactly that. */
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('figure');
      const img = document.createElement('img');
      const cap = document.createElement('figcaption');
      dom.contentEditable = 'false';
      cap.setAttribute('draggable', 'false');
      let selected = false;
      let composing = false;

      const paint = (n: PMNode) => {
        const attrs = n.attrs as ImageNodeAttrs;
        const { figAttrs, imgAttrs } = imageFigureParts(attrs);
        // Only data-* is ours to clear; contenteditable and draggable belong to
        // ProseMirror, and the selected class is tracked below.
        for (const a of Array.from(dom.attributes)) {
          if (a.name.startsWith('data-') && !(a.name in figAttrs)) dom.removeAttribute(a.name);
        }
        for (const [k, v] of Object.entries(figAttrs)) if (k !== 'class') dom.setAttribute(k, v);
        dom.className = figAttrs.class;
        markSelected();
        for (const a of Array.from(img.attributes)) if (!(a.name in imgAttrs)) img.removeAttribute(a.name);
        for (const [k, v] of Object.entries(imgAttrs)) img.setAttribute(k, v);
        /* Never mid-word: this runs on every transaction, including the one this
           very keystroke just dispatched, and rewriting textContent would drop
           the caret back to the start of the caption on each character. */
        if (!composing && cap.textContent !== attrs.caption) cap.textContent = attrs.caption;
        cap.contentEditable = editor.isEditable ? 'true' : 'false';
      };

      const commit = () => {
        // A contenteditable emptied with Backspace keeps a stray <br>, which is
        // enough to defeat :empty and leave a blank line where the collapsed
        // caption should be.
        if (!cap.textContent) cap.innerHTML = '';
        if (typeof getPos !== 'function') return;
        const pos = getPos();
        if (pos == null) return;
        const current = editor.state.doc.nodeAt(pos);
        if (!current || current.type.name !== 'image') return;
        const text = cap.textContent ?? '';
        if (text === current.attrs.caption) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, caption: text }));
      };

      cap.addEventListener('input', commit);
      cap.addEventListener('compositionstart', () => { composing = true; });
      cap.addEventListener('compositionend', () => { composing = false; commit(); });
      cap.addEventListener('blur', commit);
      cap.addEventListener('keydown', (e) => {
        // A caption has no second line, so Enter commits rather than splitting
        // anything; Escape does the same. Both hand the selection back to the
        // image, which is where the arrow keys are useful again.
        if (e.key !== 'Enter' && e.key !== 'Escape') return;
        e.preventDefault();
        commit();
        cap.blur();
        if (typeof getPos === 'function') {
          const pos = getPos();
          if (pos != null) editor.chain().focus().setNodeSelection(pos).run();
        }
      });

      /* Two classes, not one. ProseMirror-selectednode is the ring, and it is
         wanted wherever the node is selected — including the read-only chapter
         previews, which start life with a NodeSelection because Selection.atStart
         lands on the first block and these chapters open on an image. The
         placeholder is the part that must not appear there, so it keys off a
         class this view only grants an editable editor.

         Keying the placeholder off :focus-within instead would have been simpler
         and wrong: view.dom blurs the moment the caption's own contenteditable
         takes focus, so the placeholder would vanish out from under the very
         click that was reaching for it. */
      const markSelected = () => {
        dom.classList.toggle('ProseMirror-selectednode', selected);
        dom.classList.toggle('book-img-capt-open', selected && editor.isEditable);
        /* Handles only when the photo is selected, editable and unlocked — the
           same three conditions the cover's own handles render under — and
           never inside a grid, where the cell's shape comes from the grid and
           sizing one photo on its own would mean nothing. The grid's own
           handles take over there. */
        const live = editor.state.doc.nodeAt(typeof getPos === 'function' ? (getPos() ?? -1) : -1);
        const isLocked = !!(live?.attrs as ImageNodeAttrs | undefined)?.locked;
        const inGrid = !!dom.parentElement?.classList.contains('book-image-grid');
        handles.style.display = selected && editor.isEditable && !isLocked && !inGrid ? 'block' : 'none';
      };

      const handles = buildResizeHandles((corner, e) => {
        if (typeof getPos !== 'function') return;
        const pos = getPos();
        if (pos == null) return;
        const current = editor.state.doc.nodeAt(pos);
        if (!current || current.type.name !== 'image') return;
        const attrs = current.attrs as ImageNodeAttrs;
        if (attrs.locked) return;
        dragResize({
          box: img,
          corner,
          event: e,
          lockAspect: attrs.lockAspect !== false,
          maxW: dom.parentElement?.clientWidth ?? 0,
          commit: (w, h) => {
            const at = getPos();
            if (at == null) return;
            const node2 = editor.state.doc.nodeAt(at);
            if (!node2 || node2.type.name !== 'image') return;
            /* Focus first, and keep the photo selected. The handles swallow
               their own pointer events so the view never took focus during the
               drag — and an unfocused editor's history keymap never sees ⌘Z,
               so the resize was landing in the undo stack with no way to reach
               it. scrollIntoView off: the thing you just dragged is by
               definition already under the pointer.

               Same consequence the W/H fields in the inspector apply: giving a
               photo a size IS leaving "fits the column", so the mode follows
               the act rather than being a second thing to set. */
            editor.view.focus();
            editor.chain()
              .setNodeSelection(at)
              .updateAttributes('image', { sizeMode: 'fixed', boxW: w, boxH: h })
              .run();
          },
        });
      });

      dom.appendChild(img);
      dom.appendChild(cap);
      dom.appendChild(handles);
      paint(node);

      return {
        dom,
        update: (updated: PMNode) => {
          if (updated.type.name !== 'image') return false;
          paint(updated);
          return true;
        },
        selectNode: () => { selected = true; markSelected(); },
        deselectNode: () => { selected = false; markSelected(); },
        /* Everything inside the caption is ours. Without this ProseMirror reads
           a keystroke there as a keystroke on the selected image, and its base
           keymap answers Backspace on a NodeSelection by deleting the node. */
        // globalThis.Node, not Node — @tiptap/core's Node is imported here and
        // shadows the DOM one at the type level.
        /* The handles are ours too, not just the caption. Without them here a
           pointerdown on a handle reaches ProseMirror, which answers it by
           moving the selection — so the drag would end before it began. */
        stopEvent: (e: Event) => !!e.target && (cap.contains(e.target as globalThis.Node) || handles.contains(e.target as globalThis.Node)),
        /* And the live width/height written straight onto the <img> mid-drag
           is a mutation this view caused on purpose; letting ProseMirror see
           it would have it re-read the node and throw the drag away. */
        ignoreMutation: (m: { target: globalThis.Node }) => cap.contains(m.target) || handles.contains(m.target) || m.target === img,
      };
    };
  },
});

/* The crop panel. Contents and order follow the eight products surveyed: aspect
   presets first, then rotate and flip (which live *with* crop in six of the
   eight, not as separate properties), then Reset, then an explicit commit.
   Cropping is always a mode you apply or cancel — none of the surveyed products
   let it happen live as a property. */
const CROP_ASPECTS: { id: string; label: string; ratio: number | null }[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: 'orig', label: 'Original', ratio: 0 },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
];

function CropPanel({ aspectId, busy, error, onAspect, onReset, onCancel, onApply }: {
  aspectId: string;
  busy: boolean;
  error: string;
  onAspect: (id: string) => void;
  onReset: () => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <InspectorShell>
          <InspectorSection label="Aspect" hint="Drag the corners on the page to fine-tune.">
            <OptionGrid columns={3} value={aspectId} onChange={onAspect} options={CROP_ASPECTS.map((a) => ({ id: a.id, label: a.label }))} />
          </InspectorSection>
          {error && (
            <div style={{ ...ns, fontSize: 11.5, color: '#B91C1C', lineHeight: 1.45, paddingBottom: 12 }}>{error}</div>
          )}
        </InspectorShell>
      </div>
      <div className="flex flex-col flex-shrink-0" style={{ gap: 8, padding: '12px 14px', borderTop: `1px solid ${BORDER}` }}>
        <div className="flex" style={{ gap: 8 }}>
          <button
            onClick={onCancel}
            className="flex-1 cursor-pointer"
            style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: INK, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, padding: '9px 10px' }}
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            disabled={busy}
            className="flex-1 cursor-pointer"
            style={{ ...ns, fontSize: 12.5, fontWeight: 700, color: '#fff', background: BLUE, border: 'none', borderRadius: RADIUS_MD, padding: '9px 10px', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'Applying…' : 'Apply'}
          </button>
        </div>
        {/* Reset undoes the crop entirely by restoring originalSrc — which is why
            the original is kept rather than discarded after applying. */}
        <button
          onClick={onReset}
          className="cursor-pointer"
          style={{ ...ns, fontSize: 12, fontWeight: 600, color: SLATE, background: 'none', border: 'none', padding: '2px 0' }}
        >
          Reset to original
        </button>
      </div>
    </div>
  );
}

/* ── on-canvas crop overlay ──────────────────────────────────────────────────
   Body-portalled and positioned from getBoundingClientRect rather than absolutely
   placed inside the canvas: the canvas carries a transform:scale() for zoom, and a
   transformed ancestor breaks position:sticky and makes absolute offsets lie (see
   the zoom-breaks-sticky note on FloatingBarPortal above). Reading the live rect
   each frame is the only thing that stays correct at every zoom level.

   The look follows the eight products surveyed: everything outside the rect dims,
   the rect carries L-bracket corner handles, and a rule-of-thirds grid appears
   while dragging. Drag a corner to resize, drag the middle to reposition. */
function CropOverlay({ targetRef, crop, onChange }: {
  targetRef: React.RefObject<HTMLElement | null>;
  crop: CropSpec;
  onChange: (next: CropSpec) => void;
}) {
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const update = () => {
      const el = targetRef.current;
      if (!el) { setBox(null); return; }
      const r = el.getBoundingClientRect();
      setBox(r.width && r.height ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const el = targetRef.current;
    const ro = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (el) ro?.observe(el);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      ro?.disconnect();
    };
  }, [targetRef]);

  const startDrag = (mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!box) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const start = { ...crop };
    setDragging(true);
    const MIN = 0.05; // never let the rect collapse to something unclickable

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / box.width;
      const dy = (ev.clientY - startY) / box.height;
      const next = { ...start };
      if (mode === 'move') {
        next.x = Math.min(Math.max(0, start.x + dx), 1 - start.w);
        next.y = Math.min(Math.max(0, start.y + dy), 1 - start.h);
      } else {
        // Each corner moves its own two edges; the opposite two stay pinned, so
        // the rect grows from where you grabbed it rather than from its centre.
        if (mode === 'nw' || mode === 'sw') {
          const nx = Math.min(Math.max(0, start.x + dx), start.x + start.w - MIN);
          next.w = start.w + (start.x - nx);
          next.x = nx;
        } else {
          next.w = Math.min(Math.max(MIN, start.w + dx), 1 - start.x);
        }
        if (mode === 'nw' || mode === 'ne') {
          const ny = Math.min(Math.max(0, start.y + dy), start.y + start.h - MIN);
          next.h = start.h + (start.y - ny);
          next.y = ny;
        } else {
          next.h = Math.min(Math.max(MIN, start.h + dy), 1 - start.y);
        }
      }
      onChange(next);
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (!box) return null;
  const rect = {
    left: box.left + crop.x * box.width,
    top: box.top + crop.y * box.height,
    width: crop.w * box.width,
    height: crop.h * box.height,
  };
  const BRACKET = 18;
  const corners: { id: 'nw' | 'ne' | 'sw' | 'se'; style: React.CSSProperties }[] = [
    { id: 'nw', style: { left: -2, top: -2, borderTop: '3px solid #fff', borderLeft: '3px solid #fff', cursor: 'nwse-resize' } },
    { id: 'ne', style: { right: -2, top: -2, borderTop: '3px solid #fff', borderRight: '3px solid #fff', cursor: 'nesw-resize' } },
    { id: 'sw', style: { left: -2, bottom: -2, borderBottom: '3px solid #fff', borderLeft: '3px solid #fff', cursor: 'nesw-resize' } },
    { id: 'se', style: { right: -2, bottom: -2, borderBottom: '3px solid #fff', borderRight: '3px solid #fff', cursor: 'nwse-resize' } },
  ];

  return createPortal(
    <div className="fixed" style={{ inset: 0, zIndex: 70, pointerEvents: 'none' }}>
      {/* Four panes dimming the image outside the rect, rather than one huge
          spread shadow. A 9999px shadow would dim whatever happened to sit below
          it in the stacking order — including the crop panel itself — so what got
          greyed out would depend on stacking accidents. Pinterest, Buffer and
          Magnific all scope the dim to the image exactly; these panes do that
          deterministically. */}
      {([
        { left: box.left, top: box.top, width: box.width, height: rect.top - box.top },
        { left: box.left, top: rect.top + rect.height, width: box.width, height: box.top + box.height - (rect.top + rect.height) },
        { left: box.left, top: rect.top, width: rect.left - box.left, height: rect.height },
        { left: rect.left + rect.width, top: rect.top, width: box.left + box.width - (rect.left + rect.width), height: rect.height },
      ]).map((pane, i) => (
        <div key={i} className="absolute" style={{ ...pane, width: Math.max(0, pane.width), height: Math.max(0, pane.height), background: 'rgba(15,23,51,0.55)' }} />
      ))}
      <div
        className="absolute"
        onPointerDown={startDrag('move')}
        style={{
          left: rect.left, top: rect.top, width: rect.width, height: rect.height,
          pointerEvents: 'auto', cursor: 'move',
          outline: '1px solid rgba(255,255,255,0.9)',
        }}
      >
        {dragging && (
          <>
            {[1, 2].map((i) => (
              <div key={`v${i}`} className="absolute" style={{ left: `${(i * 100) / 3}%`, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.45)' }} />
            ))}
            {[1, 2].map((i) => (
              <div key={`h${i}`} className="absolute" style={{ top: `${(i * 100) / 3}%`, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.45)' }} />
            ))}
          </>
        )}
        {corners.map((c) => (
          <div
            key={c.id}
            onPointerDown={startDrag(c.id)}
            className="absolute"
            style={{ width: BRACKET, height: BRACKET, pointerEvents: 'auto', ...c.style }}
          />
        ))}
      </div>
    </div>,
    document.body,
  );
}

/* ── crop model ──────────────────────────────────────────────────────────────
   A crop is a rect in normalised 0–1 coordinates against the ORIGINAL image,
   plus a quarter-turn rotation and two flips. Normalised so it survives the
   image being re-encoded at a different pixel size, and so re-entering crop can
   restore the exact rect the user last dragged. */
type TransformOp =
  | { kind: 'rotate-by'; deg: number }
  | { kind: 'rotate-to'; deg: number }
  | { kind: 'flip'; axis: 'h' | 'v' };
type CropSpec = { x: number; y: number; w: number; h: number; rotate: number; flipH: boolean; flipV: boolean };
type CropTarget =
  | { kind: 'node'; editor: Editor }
  | { kind: 'cover'; pageId: string; elementId: string };
const IDENTITY_CROP: CropSpec = { x: 0, y: 0, w: 1, h: 1, rotate: 0, flipH: false, flipV: false };

function parseCrop(raw: string): CropSpec {
  if (!raw) return { ...IDENTITY_CROP };
  const p = raw.split(',');
  if (p.length < 7) return { ...IDENTITY_CROP };
  const n = (i: number, fallback: number) => (Number.isFinite(Number(p[i])) ? Number(p[i]) : fallback);
  return {
    x: n(0, 0), y: n(1, 0), w: n(2, 1), h: n(3, 1),
    rotate: ((n(4, 0) % 360) + 360) % 360,
    flipH: p[5] === '1', flipV: p[6] === '1',
  };
}
function serializeCrop(c: CropSpec): string {
  const isIdentity = c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1 && c.rotate === 0 && !c.flipH && !c.flipV;
  if (isIdentity) return '';
  const r = (v: number) => Math.round(v * 10000) / 10000;
  return [r(c.x), r(c.y), r(c.w), r(c.h), c.rotate, c.flipH ? 1 : 0, c.flipV ? 1 : 0].join(',');
}

/* Cuts the crop out of `srcUrl` and hands back a data URL. Rotation is applied
   to the OUTPUT canvas (so a quarter-turn swaps width and height) while the crop
   rect stays in the source image's own coordinate space — which is what keeps the
   rect meaningful when you re-open crop later.
   Remote images taint the canvas unless the host sends CORS headers, and a tainted
   canvas makes toDataURL throw — so this rejects with a message the panel can show
   rather than failing silently. */
function renderCrop(srcUrl: string, c: CropSpec): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => reject(new Error("Couldn't load this image to crop it."));
    img.onload = () => {
      const sx = Math.round(c.x * img.naturalWidth);
      const sy = Math.round(c.y * img.naturalHeight);
      const sw = Math.max(1, Math.round(c.w * img.naturalWidth));
      const sh = Math.max(1, Math.round(c.h * img.naturalHeight));
      /* The output canvas is the rotated rect's bounding box, so any angle works,
         not just quarter-turns — at 90/270 this reduces to swapping width and
         height, and at other angles it leaves transparent corners. That is fine
         here because the image is a block in the text flow: it stays a rectangle
         and simply gets taller, rather than overlapping the paragraphs around it
         the way a CSS transform would. */
      const rad = (c.rotate * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sw * cos + sh * sin));
      canvas.height = Math.max(1, Math.round(sw * sin + sh * cos));
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error("Couldn't prepare the image for cropping.")); return; }
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((c.rotate * Math.PI) / 180);
      ctx.scale(c.flipH ? -1 : 1, c.flipV ? -1 : 1);
      ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
      try {
        // PNG keeps transparency (cut-outs, logos) but is heavy for photographs;
        // JPEG is picked when the source clearly isn't transparent. Quality 0.92
        // is the usual "no visible loss" point and roughly halves the payload,
        // which matters because the original is kept alongside this one.
        // A non-quarter-turn leaves transparent corners, and JPEG has no alpha —
        // it would render them black — so any such angle forces PNG regardless of
        // the source format.
        const needsAlpha = c.rotate % 90 !== 0;
        const isPng = needsAlpha || /^data:image\/png/i.test(srcUrl) || /\.png(\?|$)/i.test(srcUrl);
        resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.92));
      } catch {
        reject(new Error("This image is hosted somewhere that blocks editing. Upload a copy to crop it."));
      }
    };
    img.src = srcUrl;
  });
}

/* The aspect picker in the AI composer used to be decorative: `aspect` only
   perturbed the seed that chose WHICH bundled photo came back, so picking
   Portrait and picking Square produced two differently-shaped stock photos and
   neither matched the label. These are the real ratios behind those labels. */
const ASPECT_RATIOS: Record<'square' | 'landscape' | 'portrait', number> = {
  square: 1,
  landscape: 16 / 9,
  portrait: 9 / 16,
};

/* Centre-crops `srcUrl` to `ratio` and hands back a data URL — a "cover" crop,
   so the result always fills the requested shape with no letterboxing and no
   distortion, taking the middle of whichever axis is too long.
   The bundled stock images are same-origin, so the canvas can't taint here; the
   catch is kept anyway because the caller also passes generated entries back
   through, and a tainted canvas throws on toDataURL rather than failing the
   draw. The caller falls back to the uncropped source. */
function renderToAspect(srcUrl: string, ratio: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => reject(new Error("Couldn't load the image."));
    img.onload = () => {
      const natW = img.naturalWidth;
      const natH = img.naturalHeight;
      // Take the full short axis and cut the long one down to the target.
      let sw = natW;
      let sh = natH;
      if (natW / natH > ratio) sw = Math.round(natH * ratio);
      else sh = Math.round(natW / ratio);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, sw);
      canvas.height = Math.max(1, sh);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error("Couldn't prepare the image.")); return; }
      ctx.drawImage(img, Math.round((natW - sw) / 2), Math.round((natH - sh) / 2), sw, sh, 0, 0, sw, sh);
      // Photographs, and the source is always a bundled JPEG — no alpha to keep.
      try { resolve(canvas.toDataURL('image/jpeg', 0.92)); }
      catch { reject(new Error("This image is hosted somewhere that blocks editing.")); }
    };
    img.src = srcUrl;
  });
}

/* One place that turns the four styling attributes into CSS, called from the
   node's renderHTML — which drives both the live canvas and the serialized export,
   so there's no second code path to keep in step. Returns '' when nothing is set,
   which keeps an unstyled image's markup byte-identical to before. */
/* Shadow is stored as "x,y,blur,opacity" rather than a named preset, so any value
   in between is expressible — Figma's Effects and Canva's Shadows are both fully
   continuous, and named steps could only ever offer two or three of them. Empty
   string means no shadow, which keeps an unstyled image's markup unchanged.
   The two legacy preset names are still read so images styled before the switch
   don't lose their shadow. */
type ShadowSpec = { x: number; y: number; blur: number; spread: number; color: string; opacity: number };
const DEFAULT_SHADOW: ShadowSpec = { x: 0, y: 4, blur: 4, spread: 0, color: '#000000', opacity: 0.25 };
const LEGACY_SHADOWS: Record<string, ShadowSpec> = {
  soft: { x: 0, y: 2, blur: 10, spread: 0, color: '#0F1733', opacity: 0.14 },
  strong: { x: 0, y: 8, blur: 28, spread: 0, color: '#0F1733', opacity: 0.28 },
};
function parseShadow(raw: string): ShadowSpec | null {
  if (!raw || raw === 'none') return null;
  if (LEGACY_SHADOWS[raw]) return { ...LEGACY_SHADOWS[raw] };
  const p = raw.split(',');
  // 4 parts is the earlier x,y,blur,opacity form, kept readable so images styled
  // before spread and colour existed still render.
  if (p.length === 4) {
    const n = p.map(Number);
    if (n.some((v) => !Number.isFinite(v))) return null;
    return { x: n[0], y: n[1], blur: n[2], spread: 0, color: '#0F1733', opacity: n[3] };
  }
  if (p.length < 6) return null;
  const n = [p[0], p[1], p[2], p[3], p[5]].map(Number);
  if (n.some((v) => !Number.isFinite(v))) return null;
  return { x: n[0], y: n[1], blur: n[2], spread: n[3], color: p[4] || '#000000', opacity: n[4] };
}
function serializeShadow(sh: ShadowSpec | null): string {
  if (!sh) return '';
  const r = (v: number) => Math.round(v * 100) / 100;
  return [r(sh.x), r(sh.y), r(sh.blur), r(sh.spread), sh.color, r(sh.opacity)].join(',');
}

/* #RRGGBB + 0–1 alpha → rgba(), so a shadow colour can carry its own opacity the
   way Figma's colour row does (hex on the left, % on the right). */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return `rgba(15,23,51,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/* One accent colour is the whole control for an info box — the two things it
   renders (a pale fill and the solid bar down its left edge) are that colour at
   two strengths, so asking for both would be asking someone to hand-mix a
   palette they can't see. Checked against the built-in presets: Info's #2563EB
   mixes to within a couple of points of its hand-picked #EAF2FF tint, so a
   custom colour lands in the same visual family as the presets, not beside
   it. */
function mixWithWhite(hex: string, strength: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return '#FFFFFF';
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => Math.round(255 - (255 - v) * strength))
    .map((v) => v.toString(16).padStart(2, '0'));
  return `#${ch.join('')}`;
}
const CALLOUT_TINT_STRENGTH = 0.08;
function calloutCustomStyle(color: string): string {
  return [
    `background:${mixWithWhite(color, CALLOUT_TINT_STRENGTH)}`,
    `border-left-color:${color}`,
  ].join(';');
}

/* Corner radius is a string so corners can differ: "" or "8" is uniform,
   "8,4,2,0" is TL,TR,BR,BL — the order CSS border-radius already uses, and the
   order Figma's independent-corner fields are laid out in. */
function parseRadius(raw: string | number): number[] {
  if (typeof raw === 'number') return [raw, raw, raw, raw];
  if (!raw) return [0, 0, 0, 0];
  const p = String(raw).split(',').map(Number);
  if (p.some((n) => !Number.isFinite(n))) return [0, 0, 0, 0];
  return p.length === 1 ? [p[0], p[0], p[0], p[0]] : [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0];
}
function serializeRadius(c: number[]): string {
  if (c.every((v) => v === 0)) return '';
  return c.every((v) => v === c[0]) ? String(c[0]) : c.join(',');
}
/* WHICH edges a stroke paints. Figma's model, because these are Figma's panels:
   a dropdown that reads All / Top / Right / Bottom / Left, plus a Custom mode
   whose four toggles cover every combination a book actually asks for — a rule
   under a photo, a hairline above a caption, an L, three sides of a frame.
   Word's border gallery and Webflow's four side tabs express the same choice;
   the dropdown-plus-custom form is the one that fits a 264px panel without
   spending a permanent row on five icon buttons.
   Stored as 'all' or a comma list of t/r/b/l, so the commonest case is one short
   token and content written before this existed — which carries no attribute at
   all — reads as 'all', exactly what it rendered as. */
type BorderSide = 't' | 'r' | 'b' | 'l';
const BORDER_SIDES: BorderSide[] = ['t', 'r', 'b', 'l'];
const BORDER_SIDE_CSS: Record<BorderSide, string> = { t: 'top', r: 'right', b: 'bottom', l: 'left' };
const BORDER_SIDE_STYLE_KEY: Record<BorderSide, string> = { t: 'borderTop', r: 'borderRight', b: 'borderBottom', l: 'borderLeft' };
const BORDER_SIDE_LABEL: Record<BorderSide, string> = { t: 'Top', r: 'Right', b: 'Bottom', l: 'Left' };

/* How the line is drawn, as opposed to where it is drawn. Solid/dashed/dotted are
   the three a CSS border and an SVG path can both express, so one field serves
   the photo, the cover shape and the body shape atom alike — a fourth (double,
   groove) would be CSS-only and would have to be missing from half the panels. */
type StrokeStyle = 'solid' | 'dashed' | 'dotted';
const STROKE_STYLE_OPTIONS = [
  { id: 'solid' as const, label: 'Solid' },
  { id: 'dashed' as const, label: 'Dashed' },
  { id: 'dotted' as const, label: 'Dotted' },
];
function strokeStyleOf(v?: string): StrokeStyle {
  return v === 'dashed' || v === 'dotted' ? v : 'solid';
}
/* The SVG equivalent, for the two shapes drawn as paths rather than boxes (the
   cover triangle, the body shape atom). Scaled by the stroke's own width so a
   dash on a hairline and a dash on a 12px rule look like the same pattern, and
   dots are zero-length dashes with a round cap — the one way SVG draws a dot. */
function strokeDash(style: StrokeStyle, width: number): { strokeDasharray?: string; strokeLinecap?: 'round' } {
  if (style === 'dashed') return { strokeDasharray: `${width * 2.5} ${width * 1.75}` };
  if (style === 'dotted') return { strokeDasharray: `0 ${width * 2}`, strokeLinecap: 'round' };
  return {};
}

function parseBorderSides(v?: string): BorderSide[] {
  if (!v || v === 'all') return [...BORDER_SIDES];
  const parts = v.split(',');
  const picked = BORDER_SIDES.filter((s) => parts.includes(s));
  /* No edges at all would render as no stroke while the section still claimed to
     have one — a control that silently contradicts its own header. Removing the
     stroke is what the section's minus button is for, so an empty set reads as
     all four instead. */
  return picked.length ? picked : [...BORDER_SIDES];
}
function serializeBorderSides(sides: BorderSide[]): string {
  return sides.length === BORDER_SIDES.length ? 'all' : BORDER_SIDES.filter((s) => sides.includes(s)).join(',');
}
/* One `border` when it's all four — shorter, and the only form DOCX carries
   across — otherwise one longhand per painted edge. */
function borderCssParts(width: number, color: string, sides: BorderSide[], style: StrokeStyle = 'solid'): string[] {
  if (sides.length === BORDER_SIDES.length) return [`border:${width}px ${style} ${color}`];
  return sides.map((s) => `border-${BORDER_SIDE_CSS[s]}:${width}px ${style} ${color}`);
}
/* The same declarations as a React style object, for the cover canvas, which
   builds its shapes and photos as styled divs rather than as a CSS string. */
function borderStyleObject(width: number, color: string, sides: BorderSide[], style: StrokeStyle = 'solid'): React.CSSProperties {
  if (sides.length === BORDER_SIDES.length) return { border: `${width}px ${style} ${color}` };
  const out: Record<string, string> = {};
  for (const s of sides) out[BORDER_SIDE_STYLE_KEY[s]] = `${width}px ${style} ${color}`;
  return out as React.CSSProperties;
}

/* Position, sides and style resolved for a box drawn in React rather than in a
   CSS string — the cover's shapes and photos. Same three positions and the same
   two exclusions as imageStyleValue (which is the CSS-string twin of this), so a
   dashed or partial stroke can't mean one thing in a chapter and another on the
   cover. The ring comes back separately because the caller has to compose it
   with its own drop shadow, which is the same box-shadow property. */
function strokeBoxStyle(width: number, color: string, sidesSpec?: string, positionSpec?: string, styleSpec?: string): { css: React.CSSProperties; ring: string | null } {
  if (!(width > 0)) return { css: {}, ring: null };
  const sides = parseBorderSides(sidesSpec);
  const style = strokeStyleOf(styleSpec);
  const whole = sides.length === BORDER_SIDES.length;
  const pos = whole && style === 'solid' ? (positionSpec ?? 'inside') : 'inside';
  if (pos === 'outside') return { css: {}, ring: `0 0 0 ${width}px ${color}` };
  if (pos === 'center') return { css: borderStyleObject(width / 2, color, sides, style), ring: `0 0 0 ${width / 2}px ${color}` };
  return { css: borderStyleObject(width, color, sides, style), ring: null };
}

function imageStyleValue({ radius, borderWidth, borderColor, shadow, opacity, borderPos, borderSides, borderStyle }: {
  radius: string; borderWidth: number; borderColor: string; shadow: string; opacity: number; borderPos?: string; borderSides?: string; borderStyle?: string;
}): string {
  const parts: string[] = [];
  if (opacity < 1) parts.push(`opacity:${Math.max(0, Math.min(1, opacity))}`);
  const corners = parseRadius(radius);
  if (corners.some((v) => v > 0)) parts.push(`border-radius:${corners.map((v) => `${v}px`).join(' ')}`);
  /* Stroke position, Figma's three options, each rendered with the CSS that
     actually behaves that way:
       inside  — a real `border`, which is also the only one DOCX carries across,
                 so it stays the default;
       outside — a hard box-shadow ring, which (unlike `outline`) follows the
                 corner radius;
       center  — half of each, which is exactly what "centered on the edge" means.
     A ring shadow composes with the drop shadow below by being listed first. */
  const rings: string[] = [];
  if (borderWidth) {
    const sides = parseBorderSides(borderSides);
    const whole = sides.length === BORDER_SIDES.length;
    /* A ring is a box-shadow, and a box-shadow has no sides — so Outside and
       Centre only exist while the stroke is on all four edges. The panel hides
       Position the moment it isn't, and the render agrees with it: a partial
       stroke is always a real per-edge border. */
    /* And a ring has no dashes either — it's one solid shadow — so a dashed or
       dotted stroke is likewise always the real border. Same rule, same place,
       so the panel has exactly one condition to hide Position under. */
    const style = strokeStyleOf(borderStyle);
    const pos = whole && style === 'solid' ? (borderPos ?? 'inside') : 'inside';
    if (pos === 'inside') parts.push(...borderCssParts(borderWidth, borderColor, sides, style));
    else if (pos === 'outside') rings.push(`0 0 0 ${borderWidth}px ${borderColor}`);
    else {
      parts.push(...borderCssParts(borderWidth / 2, borderColor, sides, style));
      rings.push(`0 0 0 ${borderWidth / 2}px ${borderColor}`);
    }
  }
  const sh = parseShadow(shadow);
  if (sh) rings.push(`${sh.x}px ${sh.y}px ${sh.blur}px ${sh.spread}px ${hexToRgba(sh.color, sh.opacity)}`);
  if (rings.length) parts.push(`box-shadow:${rings.join(',')}`);
  return parts.join(';');
}

/* A boxed note/tip — one of the block types named in the original document-tree
   decision but never actually built. A real schema node (not a plain <div>) so it
   survives ProseMirror's HTML parsing and stays selectable/deletable as a unit. */
/* Three, not six. A note, a tip and a warning are the three things a how-to
   ebook actually flags, and every extra hue past that is a decision the author
   has to make about a box they only wanted to put a sentence in. Amber, not red,
   for the warning — consistent with the banner-colour survey: red reads as
   failure, and a warning in a book is a caution, not an error. */
/* Info / Note / Warning — blue, grey, amber. Green "Tip" is gone: it sat in the
   same semantic slot as the blue one (both mean "here's something useful") and
   only differed in hue, while nothing covered the commonest case of all, an
   aside that shouldn't shout at any particular colour.

   The ids deliberately don't match the labels. `note` is the blue one because
   `data-callout-type="note"` is what every book already saved on disk says for
   a blue box, and it's what the base `.book-callout` rule renders in both this
   file and epub.ts — relabelling is free, renumbering would silently recolour
   books people have already written. The grey one is new, so it gets a new id.
   Old `tip` boxes fail calloutType's validation and fall back to blue, which is
   the closest of the three that remain. */
const CALLOUT_TYPES = [
  { id: 'note', label: 'Info', tint: '#EAF2FF', accent: '#2563EB' },
  { id: 'neutral', label: 'Note', tint: '#F4F6F8', accent: '#7A8698' },
  { id: 'warning', label: 'Warning', tint: '#FFF8EB', accent: '#B4770E' },
] as const;
type CalloutType = typeof CALLOUT_TYPES[number]['id'];

const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      // Old content wrote data-callout="true" with no type; that parses to the
      // default rather than to a broken class, so existing books keep rendering
      // exactly as they did.
      calloutType: {
        default: 'note',
        parseHTML: (el: HTMLElement) => {
          const t = el.getAttribute('data-callout-type');
          return CALLOUT_TYPES.some((c) => c.id === t) ? t : 'note';
        },
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-callout-type': String(attrs.calloutType ?? 'note') }),
      },
      /* A custom accent, overriding calloutType's preset. Written as a real
         inline style rather than another class, so it survives every path the
         html takes out of here — Preview, PDF, EPUB — none of which carry this
         editor's injected <style> block. Unset (the default) leaves the preset
         class to do the work, so every book saved before this keeps rendering
         byte-for-byte as it did. */
      accentColor: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-callout-color'),
        renderHTML: (attrs: Record<string, unknown>) => {
          const c = attrs.accentColor;
          if (typeof c !== 'string' || !c) return {};
          return { 'data-callout-color': c, style: calloutCustomStyle(c) };
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const t = (node.attrs.calloutType as CalloutType) ?? 'note';
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': 'true', class: `book-callout book-callout--${t}` }), 0];
  },
});

/* ProseMirror's live EditorView builds real DOM via plain `document.createElement`,
   which puts inline <svg>/<rect>/<path> tags in the HTML namespace instead of the SVG
   one — the browser then renders them at 0×0 (invisible), same as any unknown custom
   element. The exported/serialized HTML string doesn't have this problem (the browser's
   *native* HTML parser correctly foreign-content-switches into the SVG namespace when
   that string is later parsed, e.g. by Preview's dangerouslySetInnerHTML) — only the
   interactive canvas needs help, via a NodeView that sets innerHTML instead of building
   nodes imperatively, so the native parser does the namespace switch for us there too. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* A small vector shape/icon, inserted as a unit. Every competitor with real content
   authoring (Designrr's own "Artwork & shapes" rail, Flipsnack, Visme) treats this as
   a core primitive. (QR/forms/jumbotron were excluded from an earlier pass of this
   editor as "marketing-widget sprawl" — reversed below at explicit request, since old
   Designrr shipped exactly these as core Elements, not marketing extras.) The visual
   is fully derived from attrs at insert time, so parseHTML only needs to read data-*
   back — no arbitrary markup to preserve. */
const SHAPE_MIN_PX = 24;
const SHAPE_DEFAULT_PX = 96;

/* Every visual property of a shape in one place, feeding the node view (live
   canvas) and renderHTML (getHTML, and every export downstream) from the same
   values — the split ShapeBlock already used for `d`, widened now that there are
   eight of them. */
interface ShapeAttrs extends ShapeGeom {
  color: string; borderWidth: number; borderColor: string; borderStyle: string;
  boxW: number; boxH: number; lockAspect: boolean; locked: boolean;
}
function shapeSvg(a: ShapeAttrs): { viewBox: string; path: string; fill: string; stroke: string; strokeWidth: string; dash: string; cap: string } {
  /* The dash is measured in the same viewBox units the stroke width already is,
     so it's derived from that scaled number rather than from the raw px weight —
     otherwise a dashed 2px border on a 300px shape would draw one dash. */
  const scaled = a.borderWidth > 0 ? (a.borderWidth * SHAPE_VB) / Math.max(SHAPE_MIN_PX, Math.min(a.boxW || SHAPE_DEFAULT_PX, a.boxH || SHAPE_DEFAULT_PX)) : 0;
  const dash = strokeDash(strokeStyleOf(a.borderStyle), scaled);
  return {
    dash: dash.strokeDasharray ?? '',
    cap: dash.strokeLinecap ?? '',
    // preserveAspectRatio is switched off by the caller: a shape you drag wider
    // should get wider, the way a rectangle does in any design tool, not sit
    // letterboxed in the middle of its own box.
    viewBox: `0 0 ${SHAPE_VB} ${SHAPE_VB}`,
    path: shapePath(a),
    fill: a.color,
    stroke: a.borderWidth > 0 ? a.borderColor : 'none',
    // The stroke is drawn in viewBox units, so it has to be scaled back out of
    // the box's own pixel size or a 2px border on a 300px shape renders as 25px.
    strokeWidth: a.borderWidth > 0 ? String(scaled) : '0',
  };
}

const ShapeBlock = Node.create({
  name: 'shapeBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    const num = (name: string, fallback: number) => ({
      default: fallback,
      parseHTML: (el: HTMLElement) => {
        const n = Number(el.getAttribute(`data-${name}`));
        return Number.isFinite(n) && n >= 0 ? n : fallback;
      },
      renderHTML: () => ({}),
    });
    return {
      /* No data-kind means content written before shapes were parametric, so it
         falls back to 'path' and keeps rendering the literal d it was saved with. */
      kind: {
        default: 'path' as ShapeKind,
        parseHTML: (el: HTMLElement) => (el.getAttribute('data-kind') as ShapeKind) || 'path',
        renderHTML: () => ({}),
      },
      d: { default: '' },
      sides: num('sides', 4),
      points: num('points', 5),
      starRatio: num('ratio', 0.382),
      cornerRadius: num('radius', 0),
      color: { default: SHAPE_DEFAULT_COLOR },
      borderWidth: num('bw', 0),
      borderColor: { default: INK, parseHTML: (el: HTMLElement) => el.getAttribute('data-bc') || INK, renderHTML: () => ({}) },
      borderStyle: { default: 'solid', parseHTML: (el: HTMLElement) => el.getAttribute('data-bs') || 'solid', renderHTML: () => ({}) },
      boxW: num('w', 0),
      boxH: num('h', 0),
      // Off by default: a shape is the one object you genuinely want to stretch —
      // a rectangle into a band, a line into a rule.
      lockAspect: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-lock-aspect') === 'true',
        renderHTML: () => ({}),
      },
      locked: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-locked') === 'true',
        renderHTML: (attrs: Record<string, unknown>) => (attrs.locked ? { 'data-locked': 'true' } : {}),
      },
    };
  },
  parseHTML() {
    return [{
      tag: 'div[data-shape]',
      getAttrs: (el) => {
        const e = el as HTMLElement;
        const n = (name: string, fb: number) => {
          const v = Number(e.getAttribute(`data-${name}`));
          return Number.isFinite(v) && v >= 0 ? v : fb;
        };
        return {
          kind: (e.getAttribute('data-kind') as ShapeKind) || 'path',
          d: e.getAttribute('data-d') || '',
          sides: n('sides', 4),
          points: n('points', 5),
          starRatio: n('ratio', 0.382),
          cornerRadius: n('radius', 0),
          color: e.getAttribute('data-color') || SHAPE_DEFAULT_COLOR,
          borderWidth: n('bw', 0),
          borderColor: e.getAttribute('data-bc') || INK,
          borderStyle: e.getAttribute('data-bs') || 'solid',
          boxW: n('w', 0),
          boxH: n('h', 0),
          lockAspect: e.getAttribute('data-lock-aspect') === 'true',
          locked: e.getAttribute('data-locked') === 'true',
        };
      },
    }];
  },
  renderHTML({ node }) {
    const a = node.attrs as unknown as ShapeAttrs;
    const svg = shapeSvg(a);
    const w = a.boxW || SHAPE_DEFAULT_PX;
    const h = a.boxH || SHAPE_DEFAULT_PX;
    return ['div', {
      'data-shape': 'true', 'data-kind': a.kind, 'data-d': a.d, 'data-viewbox': svg.viewBox,
      'data-color': a.color, 'data-sides': String(a.sides), 'data-points': String(a.points),
      'data-ratio': String(a.starRatio), 'data-radius': String(a.cornerRadius),
      'data-bw': String(a.borderWidth), 'data-bc': a.borderColor,
      ...(strokeStyleOf(a.borderStyle) !== 'solid' ? { 'data-bs': a.borderStyle } : {}),
      ...(a.lockAspect ? { 'data-lock-aspect': 'true' } : {}),
      'data-w': String(w), 'data-h': String(h),
      ...(a.locked ? { 'data-locked': 'true' } : {}),
      class: 'book-shape', style: `width:${w}px;height:${h}px`,
    },
      ['svg', {
        viewBox: svg.viewBox, width: '100%', height: '100%', preserveAspectRatio: 'none',
        fill: svg.fill, stroke: svg.stroke, 'stroke-width': svg.strokeWidth,
        ...(svg.dash ? { 'stroke-dasharray': svg.dash } : {}),
        ...(svg.cap ? { 'stroke-linecap': svg.cap } : {}),
      },
        ['path', { d: svg.path }]],
    ];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.contentEditable = 'false';
      const art = document.createElement('div');
      art.className = 'book-shape-art';
      let selected = false;

      const paint = (n: typeof node) => {
        const a = n.attrs as unknown as ShapeAttrs;
        const svg = shapeSvg(a);
        const w = a.boxW || SHAPE_DEFAULT_PX;
        const h = a.boxH || SHAPE_DEFAULT_PX;
        dom.className = 'book-shape';
        dom.setAttribute('data-shape', 'true');
        dom.setAttribute('data-kind', a.kind);
        dom.setAttribute('data-color', a.color);
        dom.style.width = `${w}px`;
        dom.style.height = `${h}px`;
        art.innerHTML = `<svg viewBox="${svg.viewBox}" width="100%" height="100%" preserveAspectRatio="none" fill="${escapeHtml(svg.fill)}" stroke="${escapeHtml(svg.stroke)}" stroke-width="${svg.strokeWidth}"${svg.dash ? ` stroke-dasharray="${escapeHtml(svg.dash)}"` : ''}${svg.cap ? ` stroke-linecap="${escapeHtml(svg.cap)}"` : ''}><path d="${escapeHtml(svg.path)}"></path></svg>`;
      };

      const liveAttrs = (): ShapeAttrs | null => {
        if (typeof getPos !== 'function') return null;
        const pos = getPos();
        if (pos == null) return null;
        const live = editor.state.doc.nodeAt(pos);
        return live && live.type.name === 'shapeBlock' ? (live.attrs as unknown as ShapeAttrs) : null;
      };

      const markSelected = () => {
        dom.classList.toggle('ProseMirror-selectednode', selected);
        // Same three conditions the photo's handles render under: selected,
        // editable, unlocked.
        handles.style.display = selected && editor.isEditable && !liveAttrs()?.locked ? 'block' : 'none';
      };

      /* The paths are drawn in a square viewBox with preserveAspectRatio="none",
         so a non-uniform drag is exactly what the renderer is built to express —
         which is why the proportions lock defaults OFF here, unlike a photo. */
      const handles = buildResizeHandles((corner, e) => {
        const a = liveAttrs();
        if (!a || a.locked) return;
        dragResize({
          box: dom,
          corner,
          event: e,
          lockAspect: !!a.lockAspect,
          maxW: dom.parentElement?.clientWidth ?? 0,
          commit: (w, h) => {
            if (typeof getPos !== 'function') return;
            const at = getPos();
            if (at == null) return;
            // Focus first and keep the shape selected — the handles swallow
            // their own pointer events, so without this the drag never focuses
            // the view and its undo step is unreachable by keyboard.
            editor.view.focus();
            editor.chain().setNodeSelection(at).updateAttributes('shapeBlock', { boxW: w, boxH: h }).run();
          },
        });
      });

      paint(node);
      dom.appendChild(art);
      dom.appendChild(handles);
      markSelected();

      return {
        dom,
        // Repaint in place rather than letting ProseMirror tear the node view
        // down and rebuild it on every attribute change — a rebuild mid-drag
        // would drop the element the resize is writing to.
        update: (updated) => {
          if (updated.type.name !== 'shapeBlock') return false;
          paint(updated);
          markSelected();
          return true;
        },
        selectNode: () => { selected = true; markSelected(); },
        deselectNode: () => { selected = false; markSelected(); },
      };
    };
  },
});

/* Video/audio embed. The one media type worth adding beyond images — present in
   Designrr's own real editor (Embed Video/Embed Audio) — kept to exactly those two,
   not the wider interactive-widget catalog (forms, shop tags) this editor avoids. */
const EmbedBlock = Node.create({
  name: 'embedBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      kind: { default: 'video' },
      src: { default: '' },
      locked: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-locked') === 'true',
        renderHTML: (attrs: Record<string, unknown>) => (attrs.locked ? { 'data-locked': 'true' } : {}),
      },
    };
  },
  parseHTML() {
    return [{
      tag: 'div[data-embed]',
      getAttrs: (el) => ({
        kind: (el as HTMLElement).getAttribute('data-kind') || 'video',
        src: (el as HTMLElement).getAttribute('data-src') || '',
        locked: (el as HTMLElement).getAttribute('data-locked') === 'true',
      }),
    }];
  },
  renderHTML({ node }) {
    const { kind, src, locked } = node.attrs as { kind: string; src: string; locked: boolean };
    const lockedAttr = locked ? { 'data-locked': 'true' } : {};
    if (kind === 'audio') {
      return ['div', { 'data-embed': 'true', 'data-kind': 'audio', 'data-src': src, ...lockedAttr, class: 'book-embed book-embed--audio' },
        ['audio', { controls: 'true', src }],
      ];
    }
    return ['div', { 'data-embed': 'true', 'data-kind': 'video', 'data-src': src, ...lockedAttr, class: 'book-embed book-embed--video' },
      ['iframe', { src, frameborder: '0', allowfullscreen: 'true' }],
    ];
  },
});

/* QR code — old Designrr's Elements rail includes one. Real, scannable output via
   the `qrcode` package's synchronous `create()` (a pure bit-matrix generator, no
   canvas/fs dependency, safe in the browser NodeView below). A 4-module quiet zone
   is added around the matrix — required by the QR spec for real scanners to lock
   on, and the old fake-pattern version had none since it was never meant to scan. */
const QR_QUIET_ZONE = 4;
function realQrMatrix(url: string): { size: number; cells: boolean[] } {
  try {
    const qr = QRCode.create(url || 'https://example.com', { errorCorrectionLevel: 'M' });
    return { size: qr.modules.size, cells: Array.from(qr.modules.data, (v) => v === 1) };
  } catch {
    // Text too long for a QR symbol, or otherwise unencodable — fall back to the
    // default URL rather than leaving the block blank/broken mid-edit.
    const qr = QRCode.create('https://example.com', { errorCorrectionLevel: 'M' });
    return { size: qr.modules.size, cells: Array.from(qr.modules.data, (v) => v === 1) };
  }
}
const QrCodeBlock = Node.create({
  name: 'qrCodeBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      url: { default: 'https://example.com' },
      color: { default: '#15191F' },
      locked: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-locked') === 'true',
        renderHTML: (attrs: Record<string, unknown>) => (attrs.locked ? { 'data-locked': 'true' } : {}),
      },
    };
  },
  parseHTML() {
    return [{
      tag: 'div[data-qr]',
      getAttrs: (el) => ({
        url: (el as HTMLElement).getAttribute('data-url') || '',
        color: (el as HTMLElement).getAttribute('data-color') || '#15191F',
        locked: (el as HTMLElement).getAttribute('data-locked') === 'true',
      }),
    }];
  },
  renderHTML({ node }) {
    const { url, color, locked } = node.attrs as { url: string; color: string; locked: boolean };
    const { size, cells } = realQrMatrix(url);
    const total = size + QR_QUIET_ZONE * 2;
    const rects = cells.map((on, i) => (on
      ? ['rect', { x: (i % size) + QR_QUIET_ZONE, y: Math.floor(i / size) + QR_QUIET_ZONE, width: 1, height: 1, fill: color }]
      : null)).filter(Boolean);
    return ['div', { 'data-qr': 'true', 'data-url': url, 'data-color': color, ...(locked ? { 'data-locked': 'true' } : {}), class: 'book-qr' },
      ['svg', { viewBox: `0 0 ${total} ${total}`, width: '84', height: '84' },
        ['rect', { x: 0, y: 0, width: total, height: total, fill: '#fff' }],
        ...(rects as (string | Record<string, unknown>)[][]),
      ],
      ['span', { class: 'book-qr-url' }, url],
    ];
  },
  addNodeView() {
    return ({ node }) => {
      const { url, color } = node.attrs as { url: string; color: string };
      const { size, cells } = realQrMatrix(url);
      const total = size + QR_QUIET_ZONE * 2;
      const rectsHtml = cells.map((on, i) => (on
        ? `<rect x="${(i % size) + QR_QUIET_ZONE}" y="${Math.floor(i / size) + QR_QUIET_ZONE}" width="1" height="1" fill="${color}"></rect>`
        : '')).join('');
      const dom = document.createElement('div');
      dom.className = 'book-qr';
      dom.setAttribute('data-qr', 'true');
      dom.setAttribute('data-url', url);
      dom.setAttribute('data-color', color);
      dom.contentEditable = 'false';
      dom.innerHTML = `<svg viewBox="0 0 ${total} ${total}" width="84" height="84"><rect x="0" y="0" width="${total}" height="${total}" fill="#fff"></rect>${rectsHtml}</svg><span class="book-qr-url">${escapeHtml(url)}</span>`;
      applyBlockSize(dom, node.attrs);
      return { dom };
    };
  },
});

/* ── chart rendering ──────────────────────────────────────────────────────────
   Per the dataviz skill: bar/line compare magnitude or trend, so each gets one
   sequential hue (the user's own chosen colour) rather than a categorical set —
   only pie is "identity" (part-to-whole) and needs the fixed categorical palette.
   Geometry is computed once as a flat list of primitives, then rendered to either
   an HTML string (addNodeView's innerHTML, the live canvas) or a DOM output spec
   (renderHTML, what editor.getHTML() actually serializes into chapterContent/
   exported HTML) — same two-output split ShapeBlock/QrCodeBlock already use above,
   just factored through one shared geometry pass instead of hand-duplicating the
   math twice, since a chart has far more primitives than a shape's single path. */
type ChartPoint = { label: string; value: number };
type SvgPrim =
  | { tag: 'rect'; x: number; y: number; width: number; height: number; fill: string }
  | { tag: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string }
  | { tag: 'circle'; cx: number; cy: number; r: number; fill: string; ring?: string }
  | { tag: 'path'; d: string; fill?: string; stroke?: string; strokeWidth?: number }
  | { tag: 'polyline'; points: string; stroke: string }
  | { tag: 'text'; x: number; y: number; fill: string; size: number; weight?: number; anchor?: 'start' | 'middle' | 'end'; text: string };

const CHART_W = 400;
const CHART_H = 240;
// Chart-chrome tokens follow the dataviz skill's roles but reuse this app's own
// near-identical existing constants rather than a second, redundant set.
const CHART_AXIS = BORDER;
const CHART_LABEL = SLATE;
const CHART_VALUE = INK;

function relativeLuminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

// Round up to a "clean" tick value (1/2/5 × 10^n) — the skill's "round to clean
// numbers" rule for y-axis ticks, applied to whatever magnitude the data has.
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = value / pow;
  const niceStep = step <= 1 ? 1 : step <= 2 ? 2 : step <= 5 ? 5 : 10;
  return niceStep * pow;
}

function roundedTopRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, Math.max(h, 0));
  if (h <= 0) return '';
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

function barChartGeometry(points: ChartPoint[], color: string): SvgPrim[] {
  const padL = 14, padR = 14, padT = 22, padB = 30;
  const plotW = CHART_W - padL - padR, plotH = CHART_H - padT - padB;
  const baseline = padT + plotH;
  const max = Math.max(...points.map((p) => p.value), 1);
  const band = plotW / Math.max(points.length, 1);
  const barW = Math.min(28, band * 0.55);
  const prims: SvgPrim[] = [{ tag: 'line', x1: padL, y1: baseline, x2: CHART_W - padR, y2: baseline, stroke: CHART_AXIS }];
  points.forEach((p, i) => {
    const cx = padL + band * i + band / 2;
    const h = max > 0 ? (p.value / max) * plotH : 0;
    prims.push({ tag: 'path', d: roundedTopRectPath(cx - barW / 2, baseline - h, barW, h, 4), fill: color });
    prims.push({ tag: 'text', x: cx, y: baseline - h - 7, fill: CHART_VALUE, size: 11, weight: 700, anchor: 'middle', text: String(p.value) });
    prims.push({ tag: 'text', x: cx, y: baseline + 17, fill: CHART_LABEL, size: 10, anchor: 'middle', text: p.label });
  });
  return prims;
}

function lineChartGeometry(points: ChartPoint[], color: string): SvgPrim[] {
  const padL = 30, padR = 14, padT = 18, padB = 26;
  const plotW = CHART_W - padL - padR, plotH = CHART_H - padT - padB;
  const baseline = padT + plotH;
  const niceMax = niceCeil(Math.max(...points.map((p) => p.value), 1));
  const xAt = (i: number) => (points.length <= 1 ? padL + plotW / 2 : padL + (plotW / (points.length - 1)) * i);
  const yAt = (v: number) => baseline - (v / niceMax) * plotH;
  const prims: SvgPrim[] = [];
  [0, 0.5, 1].forEach((f) => {
    const v = niceMax * f;
    const y = yAt(v);
    prims.push({ tag: 'line', x1: padL, y1: y, x2: CHART_W - padR, y2: y, stroke: CHART_AXIS });
    prims.push({ tag: 'text', x: padL - 6, y: y + 3, fill: CHART_LABEL, size: 9, anchor: 'end', text: String(Math.round(v)) });
  });
  const coords = points.map((p, i) => [xAt(i), yAt(p.value)] as const);
  prims.push({ tag: 'polyline', points: coords.map(([x, y]) => `${x},${y}`).join(' '), stroke: color });
  coords.forEach(([x, y], i) => {
    prims.push({ tag: 'circle', cx: x, cy: y, r: 4, fill: color, ring: '#fff' });
    prims.push({ tag: 'text', x, y: baseline + 16, fill: CHART_LABEL, size: 10, anchor: 'middle', text: points[i].label });
  });
  const last = coords[coords.length - 1];
  if (last) prims.push({ tag: 'text', x: last[0], y: last[1] - 10, fill: CHART_VALUE, size: 11, weight: 700, anchor: points.length > 1 ? 'end' : 'middle', text: String(points[points.length - 1].value) });
  return prims;
}

// Anything past the palette's own validated ceiling folds into a neutral "Other"
// slice, per the skill's own rule — a generated 9th hue is never the answer.
function pieChartGeometry(points: ChartPoint[]): SvgPrim[] {
  const cap = CHART_PALETTE.length;
  const shown = points.length > cap ? points.slice(0, cap - 1) : points;
  const overflow = points.length > cap ? points.slice(cap - 1).reduce((s, p) => s + p.value, 0) : 0;
  const rows = overflow > 0 ? [...shown, { label: 'Other', value: overflow }] : shown;
  const colors = rows.map((_, i) => (overflow > 0 && i === rows.length - 1 ? SLATE : CHART_PALETTE[i]));
  const total = rows.reduce((s, p) => s + p.value, 0) || 1;
  const cx = 118, cy = 120, r = 86;
  const prims: SvgPrim[] = [];
  let angle = -Math.PI / 2;
  rows.forEach((p, i) => {
    const frac = p.value / total;
    const start = angle;
    const end = angle + frac * Math.PI * 2;
    angle = end;
    const [x1, y1] = [cx + r * Math.cos(start), cy + r * Math.sin(start)];
    const [x2, y2] = [cx + r * Math.cos(end), cy + r * Math.sin(end)];
    const large = end - start > Math.PI ? 1 : 0;
    prims.push({ tag: 'path', d: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`, fill: colors[i], stroke: '#fff', strokeWidth: 2 });
    if (frac >= 0.06) {
      const mid = (start + end) / 2;
      const lx = cx + r * 0.62 * Math.cos(mid), ly = cy + r * 0.62 * Math.sin(mid);
      const labelColor = relativeLuminance(colors[i]) > 0.5 ? INK : '#fff';
      prims.push({ tag: 'text', x: lx, y: ly + 4, fill: labelColor, size: 11, weight: 700, anchor: 'middle', text: `${Math.round(frac * 100)}%` });
    }
  });
  // Legend — a pie always has >=2 series, so identity never rests on color alone.
  const legendX = 226;
  rows.forEach((p, i) => {
    const ly = 30 + i * 22;
    prims.push({ tag: 'rect', x: legendX, y: ly, width: 10, height: 10, fill: colors[i] });
    prims.push({ tag: 'text', x: legendX + 16, y: ly + 9, fill: CHART_VALUE, size: 11, anchor: 'start', text: p.label });
  });
  return prims;
}

function chartGeometry(chartType: 'bar' | 'line' | 'pie', points: ChartPoint[], color: string): SvgPrim[] {
  if (!points.length) return [];
  if (chartType === 'line') return lineChartGeometry(points, color);
  if (chartType === 'pie') return pieChartGeometry(points);
  return barChartGeometry(points, color);
}

function primsToSvgHtml(prims: SvgPrim[]): string {
  const parts = prims.map((p) => {
    if (p.tag === 'rect') return `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" fill="${p.fill}"></rect>`;
    if (p.tag === 'line') return `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="${p.stroke}" stroke-width="1"></line>`;
    if (p.tag === 'circle') return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${p.fill}"${p.ring ? ` stroke="${p.ring}" stroke-width="2"` : ''}></circle>`;
    if (p.tag === 'polyline') return `<polyline points="${p.points}" fill="none" stroke="${p.stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline>`;
    if (p.tag === 'path') return `<path d="${p.d}" fill="${p.fill ?? 'none'}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.strokeWidth ?? 1}"` : ''}></path>`;
    return `<text x="${p.x}" y="${p.y}" fill="${p.fill}" font-size="${p.size}"${p.weight ? ` font-weight="${p.weight}"` : ''} text-anchor="${p.anchor ?? 'start'}" font-family="'Nunito Sans',sans-serif">${escapeHtml(p.text)}</text>`;
  });
  return `<svg viewBox="0 0 ${CHART_W} ${CHART_H}" width="100%">${parts.join('')}</svg>`;
}

function primsToSvgDom(prims: SvgPrim[]): unknown[] {
  const children = prims.map((p) => {
    if (p.tag === 'rect') return ['rect', { x: p.x, y: p.y, width: p.width, height: p.height, fill: p.fill }];
    if (p.tag === 'line') return ['line', { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, stroke: p.stroke, 'stroke-width': 1 }];
    if (p.tag === 'circle') return ['circle', { cx: p.cx, cy: p.cy, r: p.r, fill: p.fill, ...(p.ring ? { stroke: p.ring, 'stroke-width': 2 } : {}) }];
    if (p.tag === 'polyline') return ['polyline', { points: p.points, fill: 'none', stroke: p.stroke, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }];
    if (p.tag === 'path') return ['path', { d: p.d, fill: p.fill ?? 'none', ...(p.stroke ? { stroke: p.stroke, 'stroke-width': p.strokeWidth ?? 1 } : {}) }];
    return ['text', { x: p.x, y: p.y, fill: p.fill, 'font-size': p.size, ...(p.weight ? { 'font-weight': p.weight } : {}), 'text-anchor': p.anchor ?? 'start', 'font-family': "'Nunito Sans',sans-serif" }, p.text];
  });
  return ['svg', { viewBox: `0 0 ${CHART_W} ${CHART_H}`, width: '100%' }, ...children];
}

/* Real, user-edited data (unlike QrCodeBlock/Wordgenie's mocked output above) —
   a chart's values don't need a backend or AI to be genuinely functional, so
   there's no reason to fake them. Bar/line use the user's own chosen accent
   colour (magnitude/trend are single-hue jobs per the dataviz skill); pie
   ignores it and uses the fixed categorical palette instead, since part-to-whole
   is an identity job and every slice needs to read as a distinct thing. */
const ChartBlock = Node.create({
  name: 'chartBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      chartType: { default: 'bar' },
      points: {
        default: [] as ChartPoint[],
        parseHTML: (el: HTMLElement) => { try { return JSON.parse(el.getAttribute('data-points') || '[]'); } catch { return []; } },
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-points': JSON.stringify(attrs.points ?? []) }),
      },
      color: { default: BLUE },
      locked: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-locked') === 'true',
        renderHTML: (attrs: Record<string, unknown>) => (attrs.locked ? { 'data-locked': 'true' } : {}),
      },
    };
  },
  parseHTML() {
    return [{
      tag: 'div[data-chart]',
      getAttrs: (el) => ({
        chartType: (el as HTMLElement).getAttribute('data-type') || 'bar',
        color: (el as HTMLElement).getAttribute('data-color') || BLUE,
        locked: (el as HTMLElement).getAttribute('data-locked') === 'true',
      }),
    }];
  },
  renderHTML({ node }) {
    const { chartType, points, color, locked } = node.attrs as { chartType: 'bar' | 'line' | 'pie'; points: ChartPoint[]; color: string; locked: boolean };
    return ['div', { 'data-chart': 'true', 'data-type': chartType, 'data-color': color, ...(locked ? { 'data-locked': 'true' } : {}), class: 'book-chart' },
      primsToSvgDom(chartGeometry(chartType, points, color)) as never,
    ];
  },
  addNodeView() {
    return ({ node }) => {
      const { chartType, points, color } = node.attrs as { chartType: 'bar' | 'line' | 'pie'; points: ChartPoint[]; color: string };
      const dom = document.createElement('div');
      dom.className = 'book-chart';
      dom.setAttribute('data-chart', 'true');
      dom.contentEditable = 'false';
      dom.innerHTML = primsToSvgHtml(chartGeometry(chartType, points, color));
      applyBlockSize(dom, node.attrs);
      return { dom };
    };
  },
});

function countFootnoteRefsBefore(doc: PMNode, pos: number): number {
  let count = 0;
  doc.nodesBetween(0, pos, (n) => { if (n.type.name === 'footnoteRef') count++; });
  return count;
}

/* Inline footnote reference — the first `group: 'inline'` atom in this file
   (everything else here is block-level). Its own renderHTML never bakes in a
   number: a single node has no way to know its position among its siblings,
   so the number is always derived, never stored. Two separate derivations
   exist on purpose, matching this file's own established habit of splitting
   render logic across the live/export boundary (ChartBlock, QrCodeBlock):
   the live NodeView below counts prior footnoteRef nodes directly off the
   ProseMirror doc (always current, no stale cache), while export/Preview
   HTML (which has no JS running) gets its numbers baked in by
   applyFootnoteNumbering() in lib/footnotes.ts at render/export time. */
const FootnoteRefBlock = Node.create({
  name: 'footnoteRef',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { id: { default: null } };
  },
  parseHTML() {
    return [{
      tag: 'sup[data-footnote-ref]',
      getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute('data-fid') }),
    }];
  },
  renderHTML({ node }) {
    return ['sup', { 'data-footnote-ref': 'true', 'data-fid': node.attrs.id, class: 'book-footnote-ref' }, '•'];
  },
  /* ⌘⌥F / Ctrl+Alt+F, the same binding Word uses. The floating bar is the
     discoverable route, but it only appears over a real selection — this is how
     you add a note from a bare caret. */
  addKeyboardShortcuts() {
    return {
      // Deferred a tick. Run inline, the caret move at the end of
      // insertFootnote lands while ProseMirror is still dispatching the key
      // event and gets mapped away again — you'd get the marker but end up
      // typing the note into the body. Off the keymap's own dispatch it sticks.
      'Mod-Alt-f': () => { const ed = this.editor; setTimeout(() => insertFootnote(ed), 0); return true; },
    };
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('sup');
      dom.className = 'book-footnote-ref';
      dom.setAttribute('data-footnote-ref', 'true');
      dom.setAttribute('data-fid', node.attrs.id ?? '');
      dom.contentEditable = 'false';
      // No click handler needed — clicking an atom node already produces a
      // NodeSelection via ProseMirror's default behavior (same as every other
      // atom block in this file), which is all the selection/inspector wiring
      // below needs to pick it up.
      const render = () => {
        const pos = typeof getPos === 'function' ? getPos() : null;
        const ordinal = pos == null ? 1 : countFootnoteRefsBefore(editor.state.doc, pos) + 1;
        dom.textContent = String(ordinal);
        // "1" on its own is a meaningless accessible name — the DAISY notes
        // guidance is explicit about it. Same label the exporter writes.
        dom.setAttribute('aria-label', `Footnote ${ordinal}`);
        dom.title = `Footnote ${ordinal}`;
      };
      render();
      /* A marker's number depends on how many markers precede it, so the node's
         own `update` isn't enough — inserting marker 2 above marker 3 doesn't
         touch marker 3's node, and it would sit there still reading "2". Every
         marker recounts on every doc change instead; the count is a walk of the
         doc up to its own position, and there are never many of them. */
      const recount = () => render();
      editor.on('update', recount);
      return {
        dom,
        update: (updated) => (updated.type.name === 'footnoteRef' ? (render(), true) : false),
        destroy: () => { editor.off('update', recount); },
      };
    };
  },
});

/* ── footnote plumbing ────────────────────────────────────────────────────────
   Every note in a chapter is one <li> of one ordered list at the end of the
   chapter's document. That list is STORAGE, not placement: it keeps the notes
   in marker order, which is where their numbering comes from, and it's what
   export writes out (an EPUB reader wants the notes at the end of the file,
   paired to their markers by id — see lib/footnotes.ts).

   WHERE THEY APPEAR is the pagination plugin's job. It positions each <li> at
   the foot of the page its own marker landed on, and takes that room out of
   the page's text band, so a note sits on the same page as the sentence it
   annotates the way it does in a printed book. Nothing about the document
   changes to make that happen — the notes stay one list, in one place, in
   document order — so undo, export and numbering never see the difference.

   The list appears with the first marker and disappears with the last, so no
   empty "Notes" heading is ever left behind. Numbering restarts per chapter,
   which is what Atticus does and what falls out of each chapter being its own
   editor and its own exported file. */
function footnoteRefIds(doc: PMNode): string[] {
  const ids: string[] = [];
  doc.descendants((n) => { if (n.type.name === 'footnoteRef' && n.attrs.id) ids.push(n.attrs.id as string); });
  return ids;
}

function findFootnoteList(doc: PMNode): { node: PMNode; pos: number } | null {
  let found: { node: PMNode; pos: number } | null = null;
  doc.forEach((node, offset) => {
    if (node.type.name === 'orderedList' && node.attrs.class === FOOTNOTE_LIST_CLASS) found = { node, pos: offset };
  });
  return found;
}

function footnoteListFids(list: { node: PMNode } | null): string[] {
  const fids: string[] = [];
  list?.node.forEach((item) => fids.push((item.attrs['data-fid'] as string) ?? ''));
  return fids;
}

/* Reconciles the notes list against the markers in the body: adds an empty note
   for a new marker, drops the note for a deleted one, and reorders when a
   marker moves. Runs on every update but only dispatches when the id sequence
   genuinely differs — that guard is what stops the transaction it dispatches
   from re-triggering itself through onUpdate.

   Out of history on purpose. A sync is a consequence of the edit that caused
   it, so undo should step over the pair rather than through it: one ⌘Z takes
   back the marker, and the note goes with it. */
function syncFootnoteList(editor: Editor) {
  const { state } = editor;
  const ids = footnoteRefIds(state.doc);
  const list = findFootnoteList(state.doc);
  if (ids.join('\u0000') === footnoteListFids(list).join('\u0000')) return;

  const { listItem, paragraph, orderedList } = state.schema.nodes;
  const tr = state.tr;
  if (ids.length === 0) {
    if (list) tr.delete(list.pos, list.pos + list.node.nodeSize);
  } else {
    // Existing notes are carried over by id, never by position — position
    // breaks the moment someone deletes the second of three markers.
    const existing = new Map<string, PMNode>();
    list?.node.forEach((item) => {
      const fid = item.attrs['data-fid'] as string | null;
      if (fid) existing.set(fid, item);
    });
    const items = ids.map((id) => existing.get(id) ?? listItem.create({ 'data-fid': id }, paragraph.create()));
    const next = orderedList.create({ class: FOOTNOTE_LIST_CLASS }, items);
    if (list) tr.replaceWith(list.pos, list.pos + list.node.nodeSize, next);
    else tr.insert(state.doc.content.size, next);
  }
  if (!tr.docChanged) return;
  tr.setMeta('addToHistory', false);
  editor.view.dispatch(tr);
}

function footnotePos(doc: PMNode, fid: string): number | null {
  let at: number | null = null;
  doc.descendants((node, pos) => {
    if (node.type.name === 'listItem' && node.attrs['data-fid'] === fid) { at = pos; return false; }
    return true;
  });
  return at;
}

/* Inserting a marker moves the caret into its note, the way Word and Google
   Docs both do. The note is at the foot of the chapter rather than an inch
   below the caret, so leaving the caret in the body would mean the note you
   just created is somewhere you have to go and find. */
function insertFootnote(editor: Editor) {
  const id = `fn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  editor.chain().focus().insertContent({ type: 'footnoteRef', attrs: { id } }).run();
  syncFootnoteList(editor);
  const at = footnotePos(editor.state.doc, id);
  if (at != null) editor.chain().focus().setTextSelection(at + 2).run();
}

/* ── pagination ───────────────────────────────────────────────────────────────
   Turns one chapter's continuous flow into fixed-height pages by inserting
   spacer widgets at the measured break points. See lib/pagination.ts for why
   it's decorations rather than one editor per page.

   The measure runs off a requestAnimationFrame after every update, because
   heights are only real once the browser has laid the change out. It dispatches
   only when the resulting breaks differ from the ones already applied — without
   that guard the dispatch would trigger another update, measure the same thing
   and dispatch again, forever. */
const paginationKey = new PluginKey<PaginationState>('pagination');

/** One note, lifted out of the list at the end of the chapter and put at the
    foot of the page its marker landed on. `top` is CSS, relative to the
    positioned wrapper the prose sits in. */
interface NotePlacement { fid: string; top: number; first: boolean }

interface PaginationState { breaks: PageBreak[]; notes: NotePlacement[]; pageCount: number }

/** Document position and size of every note item, by fid, in one walk. */
function footnoteItems(doc: PMNode): Map<string, { pos: number; size: number }> {
  const out = new Map<string, { pos: number; size: number }>();
  doc.descendants((node, pos) => {
    if (node.type.name !== 'listItem') return true;
    const fid = node.attrs['data-fid'] as string | null;
    if (fid) out.set(fid, { pos, size: node.nodeSize });
    return false;
  });
  return out;
}

/** Two placements are equal when they'd draw the same, to the pixel. */
function sameNotes(a: NotePlacement[], b: NotePlacement[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.fid === b[i].fid && x.first === b[i].first && Math.abs(x.top - b[i].top) < 1);
}

/* `geometry` is a getter, not a value: trim size and margins are a setting the
   reader can change at any time, and a TipTap extension is configured once when
   its editor is created. Reading it per measure keeps every chapter on the
   current page box without tearing down and rebuilding every editor in the
   book — which would lose the caret, the history and the scroll position. */
const Pagination = Extension.create<{ onLayout: (pageCount: number) => void; geometry: () => PageGeometry }>({
  name: 'pagination',
  addOptions() {
    return { onLayout: () => {}, geometry: () => DEFAULT_GEOMETRY };
  },
  addProseMirrorPlugins() {
    const notify = this.options.onLayout;
    const getGeometry = this.options.geometry;
    return [
      new Plugin<PaginationState>({
        key: paginationKey,
        state: {
          init: () => ({ breaks: [], notes: [], pageCount: 1 }),
          apply(tr, prev) {
            const next = tr.getMeta(paginationKey) as PaginationState | undefined;
            if (next) return next;
            /* Not remapped through tr.mapping on an ordinary edit: the measure
               that follows this transaction replaces the whole set anyway, and
               a remapped-but-stale break would flash a spacer at the wrong
               offset for one frame. Positions only have to survive until the
               next rAF. */
            return prev;
          },
        },
        props: {
          decorations(state) {
            const { breaks, notes } = paginationKey.getState(state) ?? { breaks: [], notes: [] };
            if (!breaks.length && !notes.length) return DecorationSet.empty;
            /* Node decorations, not a re-render: the <li> stays the same
               ProseMirror node in the same place in the document and only its
               box moves, so the caret, typing, selection and undo inside a
               note behave exactly as they did when the list was in the flow.
               Positions are read from the CURRENT doc rather than carried on
               the placement, so an edit between the measure and this call
               can't produce a decoration over a range that no longer exists. */
            const placed: Decoration[] = [];
            if (notes.length) {
              const items = footnoteItems(state.doc);
              const list = findFootnoteList(state.doc);
              // Collapses the list to nothing in the flow — see the CSS on
              // .book-fn-paged. Only once there are placements to collapse to.
              if (list) placed.push(Decoration.node(list.pos, list.pos + list.node.nodeSize, { class: 'book-fn-paged' }));
              for (const n of notes) {
                const item = items.get(n.fid);
                if (!item) continue;
                placed.push(Decoration.node(item.pos, item.pos + item.size, {
                  class: n.first ? 'book-fn-placed book-fn-first' : 'book-fn-placed',
                  style: `top:${Math.round(n.top)}px`,
                }));
              }
            }
            return DecorationSet.create(state.doc, placed.concat(breaks.map((b) => Decoration.widget(b.pos, () => {
              const el = document.createElement('div');
              el.dataset.pageBreak = 'true';
              el.className = 'book-page-break';
              el.style.height = `${b.height}px`;
              // A split lands INSIDE a paragraph, where the surrounding content
              // is inline — the spacer has to declare itself a block or it
              // contributes no height at all and the page silently overflows.
              if (b.lineIndex != null) el.style.display = 'block';
              // Not editable and not selectable, so the caret steps over the
              // gap instead of landing inside it.
              el.contentEditable = 'false';
              return el;
            }, { side: -1, ignoreSelection: true, key: `pb-${b.pos}-${b.lineIndex ?? 'b'}-${Math.round(b.height)}` }))));
          },
        },
        view(view) {
          let frame = 0;
          /* Two guards, both load-bearing. `busy` stops the measure re-entering
             itself: the dispatch below changes the DOM, which trips the
             ResizeObserver, which schedules another measure. `lastNotified`
             stops the React setState firing on every pass — React batches
             ResizeObserver callbacks, so an unconditional call here reads to it
             as an update loop and it bails with "maximum update depth". */
          let busy = false;
          let lastNotified = -1;
          /* Which page each note was last put on. A note takes room out of its
             page's text band, which can push its own marker onto the NEXT
             page — and then the band it left behind is roomy again and the
             marker comes straight back. That two-cycle has no fixpoint, so the
             assignment is sticky FORWARD: while the document is unchanged a
             note may move to a later page but never back to an earlier one,
             which is bounded and therefore settles. An actual edit clears it,
             so deleting the text above a marker really does bring its note
             back up. */
          const stuck = new Map<string, number>();
          const measure = () => {
            frame = 0;
            if (busy) return;
            busy = true;
            try {
              const geo = getGeometry();
              /* Read the flow as if it had never been paginated, by subtracting
                 the spacers already in it rather than zeroing them. Zeroing
                 meant writing style and reading layout in the same pass, and
                 the ResizeObserver below saw its own effect: measure, mutate,
                 resize, measure, forever. Spacers carry no margins, so nothing
                 collapses across one and plain subtraction is exact. */
              /* Rendered coordinates, relative to the first block's top —
                 measureBreaks works in the same space, so no unpaginated flow
                 has to be reconstructed and nothing here mutates style (which
                 the ResizeObserver below would read as a change it caused,
                 looping forever). */
              /* Origin is the STACK's content box, so page 0's band covers the
                 heading above the prose too. Falling back to the editor's own
                 top only matters before the stack has mounted. */
              const stack = view.dom.closest('[data-page-stack]') as HTMLElement | null;
              const originTop = (stack ? stack.getBoundingClientRect().top + geo.padY : view.dom.getBoundingClientRect().top);
              const blocks: FlowBlock[] = [];
              // Screen-space line rects per block position, so a split break
              // can be turned back into a document position below.
              const screenLines = new Map<number, DOMRect[]>();
              let pendingSpacer = 0;
              /* The notes list is not part of the flow. It's the last block in
                 the document, but every item in it is about to be positioned
                 at the foot of some page, so counting it here would reserve
                 its height twice — once as a block at the end of the chapter
                 and again as the room its notes take from their own pages. */
              let noteList: HTMLElement | null = null;
              for (const el of Array.from(view.dom.children) as HTMLElement[]) {
                if (el.dataset.pageBreak === 'true') { pendingSpacer += el.offsetHeight; continue; }
                if (el.classList.contains(FOOTNOTE_LIST_CLASS)) { noteList = el; continue; }
                let pos: number | null = null;
                try {
                  const raw = view.posAtDOM(el, 0);
                  pos = raw >= 0 ? view.state.doc.resolve(raw).before(1) : null;
                } catch { pos = null; }
                const r = el.getBoundingClientRect();
                /* Only a plain paragraph is split across a page. A figure, a
                   table, a heading or a blockquote has to move whole: their
                   boxes paint something — a border, a rule, a background — that
                   would draw straight through the page gap, and a heading
                   separated from its own first line is the thing keep-with-next
                   exists to prevent. */
                /* The `div` in that list must not match the spacer THIS plugin
                   put inside the paragraph on the last pass: a paragraph that
                   had just been split would come back unsplittable, get moved
                   whole instead, lose its spacer, become splittable again — and
                   settle on whichever of the two the loop happened to end on,
                   which is why long paragraphs ran off the foot of the sheet. */
                const inner = Array.from(el.querySelectorAll<HTMLElement>('.book-page-break'));
                const splittable = el.tagName === 'P'
                  && !Array.from(el.querySelectorAll('figure, table, div')).some((x) => !(x as HTMLElement).dataset.pageBreak);
                const innerH = inner.reduce((sum, x) => sum + x.offsetHeight, 0);
                /* Line height and line COUNT, not line rects. Rects come from a
                   Range (el.getClientRects() on a block returns its single
                   border box, which made every paragraph look unsplittable),
                   but their positions are displaced by any spacer already
                   inside — and measureBreaks now derives positions rather than
                   reading them, so all it needs is the pitch and how many.
                   Subtracting the inner spacers keeps the count stable while
                   the paragraph is already split. */
                let lineHeight: number | undefined;
                let lineCount: number | undefined;
                if (splittable) {
                  const lh = parseFloat(window.getComputedStyle(el).lineHeight);
                  if (Number.isFinite(lh) && lh > 1) {
                    lineHeight = lh;
                    lineCount = Math.max(1, Math.round((r.height - innerH) / lh));
                  }
                }
                if (splittable && pos != null) {
                  const range = document.createRange();
                  range.selectNodeContents(el);
                  /* One rect per LINE, and only lines. getClientRects returns a
                     rect for every box in the range, so a paragraph already
                     split hands back its own spacer as a rect — which shifted
                     every line index after the first break by one — and a bold
                     or linked run hands back a second rect on the line it sits
                     in. Drop the spacers by position, then keep one rect per
                     distinct top. Index parity with measureBreaks' line count
                     is the whole contract here: it names a line by number and
                     this is what turns that number back into a position. */
                  const spacerTops = new Set(inner.map((x) => Math.round(x.getBoundingClientRect().top)));
                  const byTop = new Map<number, DOMRect>();
                  for (const q of Array.from(range.getClientRects())) {
                    const top = Math.round(q.top);
                    if (q.height <= 1 || spacerTops.has(top)) continue;
                    const seen = byTop.get(top);
                    if (!seen || q.left < seen.left) byTop.set(top, q);
                  }
                  screenLines.set(pos, Array.from(byTop.entries()).sort((a, x) => a[0] - x[0]).map(([, q]) => q));
                }
                blocks.push({
                  pos,
                  top: r.top - originTop,
                  bottom: r.bottom - originTop,
                  spacerBefore: pendingSpacer,
                  lineHeight,
                  lineCount,
                });
                pendingSpacer = 0;
              }

              /* Notes take their room BEFORE the flow is measured, because
                 which page a block lands on depends on how much of each page
                 the notes have already claimed. Assignment comes from the
                 markers as they sit right now — which is to say, as they sit
                 under the reserve the last pass applied. That's the fixpoint
                 this converges on, with `stuck` ruling out the one case where
                 no fixpoint exists. */
              const noteH = new Map<string, number>();
              if (noteList) {
                for (const li of Array.from(noteList.children) as HTMLElement[]) {
                  const fid = li.getAttribute('data-fid');
                  if (fid) noteH.set(fid, li.getBoundingClientRect().height);
                }
              }
              const perPage = new Map<number, string[]>();
              if (noteH.size) {
                for (const ref of Array.from(view.dom.querySelectorAll<HTMLElement>('.book-footnote-ref'))) {
                  const fid = ref.getAttribute('data-fid');
                  if (!fid || !noteH.has(fid)) continue;
                  const want = pageOfTop(ref.getBoundingClientRect().top - originTop, geo);
                  const page = Math.max(want, stuck.get(fid) ?? want);
                  stuck.set(fid, page);
                  const group = perPage.get(page);
                  if (group) group.push(fid); else perPage.set(page, [fid]);
                }
              }
              const reserve: number[] = [];
              for (const [page, fids] of perPage) {
                const h = fids.reduce((sum, fid) => sum + (noteH.get(fid) ?? 0), 0);
                reserve[page] = Math.min(h + FOOTNOTE_GAP, footnoteReserveMax(geo));
              }

              const measured = measureBreaks(blocks, geo, reserve);
              const pageCount = measured.pageCount;
              /* CSS `top` is relative to the positioned wrapper the prose sits
                 in, which starts below the chapter eyebrow and title; the
                 measurements above are relative to the page stack's content
                 box, which starts above them. offsetParent is the element the
                 browser will actually resolve `top` against, so asking it is
                 exact whatever sits between the two. */
              const host = view.dom.offsetParent as HTMLElement | null;
              const toCss = originTop - (host ? host.getBoundingClientRect().top : originTop);
              const notes: NotePlacement[] = [];
              for (const [page, fids] of perPage) {
                const h = fids.reduce((sum, fid) => sum + (noteH.get(fid) ?? 0), 0);
                // Bottom-aligned: the last note ends on the page's bottom
                // margin, so the block grows upward into the text band the
                // reserve above already cleared for it.
                let y = bandTop(page, geo) + contentH(geo) - h;
                fids.forEach((fid, i) => {
                  notes.push({ fid, top: y + toCss, first: i === 0 });
                  y += noteH.get(fid) ?? 0;
                });
              }
              /* A split break is measured at a LINE; the decoration needs the
                 document position of that line's first character. posAtCoords
                 is the only thing that knows it — line boxes have no position
                 of their own in the document model. A couple of pixels in from
                 the line's own left/top lands inside the first glyph rather
                 than on the boundary between two lines. */
              const breaks = measured.breaks.flatMap((b) => {
                if (b.lineIndex == null) return [b];
                const rects = screenLines.get(b.pos);
                const rect = rects?.[b.lineIndex];
                if (!rect) return [];
                const at = view.posAtCoords({ left: rect.left + 2, top: rect.top + 2 });
                // No resolvable position means this line can't carry a break —
                // dropping it overflows one page, which beats splitting at the
                // wrong place.
                if (!at) return [];
                /* Snap back to the start of the word. Those 2px land past the
                   middle of a narrow opening glyph — an "i", an "l" — and the
                   browser then rounds the caret to the far side of it, so the
                   break went in one character into the line and the page ended
                   "...a working day i" with "s not..." overleaf. A line always
                   begins at a word, so the nearest word start behind the
                   resolved position IS the line start. */
                const $at = view.state.doc.resolve(at.pos);
                const off = at.pos - $at.start();
                const before = off > 0 ? $at.parent.textBetween(0, off, ' ', ' ') : '';
                const intoWord = before.length - before.replace(/\S+$/, '').length;
                return [{ ...b, pos: at.pos - intoWord }];
              });
              const current = paginationKey.getState(view.state);
              if (!current || !sameBreaks(current.breaks, breaks) || !sameNotes(current.notes, notes)) {
                view.dispatch(view.state.tr.setMeta(paginationKey, { breaks, notes, pageCount }).setMeta('addToHistory', false));
              }
              if (pageCount !== lastNotified) { lastNotified = pageCount; notify(pageCount); }
            } finally {
              busy = false;
            }
          };
          const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
          schedule();
          // Images and webfonts land after the first measure, and both change
          // heights — a ResizeObserver catches them without polling.
          const ro = new ResizeObserver(schedule);
          ro.observe(view.dom);
          return {
            update: (v, prev) => {
              // An actual edit invalidates every sticky assignment: the whole
              // point of the stickiness is to settle a layout the document
              // isn't changing under.
              if (!prev.doc.eq(v.state.doc)) stuck.clear();
              schedule();
            },
            destroy: () => { ro.disconnect(); if (frame) cancelAnimationFrame(frame); },
          };
        },
      }),
    ];
  },
});

/* A labeled form input — visual only (this prototype doesn't have a form backend to
   submit to), the same way EmbedBlock's iframe never actually loads a real page in
   most demo contexts. Present so the "worksheet with a place to write your name"
   pattern old Designrr supports exists here too. */
const TextFieldBlock = Node.create({
  name: 'textFieldBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      label: { default: 'Label' },
      locked: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-locked') === 'true',
        renderHTML: (attrs: Record<string, unknown>) => (attrs.locked ? { 'data-locked': 'true' } : {}),
      },
    };
  },
  parseHTML() {
    return [{
      tag: 'div[data-textfield]',
      getAttrs: (el) => ({
        label: (el as HTMLElement).getAttribute('data-label') || 'Label',
        locked: (el as HTMLElement).getAttribute('data-locked') === 'true',
      }),
    }];
  },
  renderHTML({ node }) {
    const { label, locked } = node.attrs as { label: string; locked: boolean };
    return ['div', { 'data-textfield': 'true', 'data-label': label, ...(locked ? { 'data-locked': 'true' } : {}), class: 'book-textfield' },
      ['span', { class: 'book-textfield-label' }, label],
      ['div', { class: 'book-textfield-box' }],
    ];
  },
});

/* Old Designrr's "Inline CTA / Jumbotron" — a self-contained hero section (heading +
   body + button + its own background) droppable mid-chapter, distinct from the plain
   text-link CTA this editor already had. Attrs-driven like ShapeBlock rather than
   nested rich content, so its own small inspector is enough — no sub-editor needed. */
const JumbotronBlock = Node.create({
  name: 'jumbotronBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      heading: { default: 'Get the companion workbook' },
      body: { default: 'A short line of supporting copy.' },
      buttonLabel: { default: 'Get it now' },
      bgColor: { default: '#EEF3FF' },
      locked: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-locked') === 'true',
        renderHTML: (attrs: Record<string, unknown>) => (attrs.locked ? { 'data-locked': 'true' } : {}),
      },
    };
  },
  parseHTML() {
    return [{
      tag: 'div[data-jumbotron]',
      getAttrs: (el) => {
        const box = el as HTMLElement;
        return {
          heading: box.querySelector('[data-jb-heading]')?.textContent || '',
          body: box.querySelector('[data-jb-body]')?.textContent || '',
          buttonLabel: box.querySelector('[data-jb-button]')?.textContent || '',
          bgColor: box.getAttribute('data-bg') || '#EEF3FF',
          locked: box.getAttribute('data-locked') === 'true',
        };
      },
    }];
  },
  renderHTML({ node }) {
    const { heading, body, buttonLabel, bgColor, locked } = node.attrs as { heading: string; body: string; buttonLabel: string; bgColor: string; locked: boolean };
    return ['div', { 'data-jumbotron': 'true', 'data-bg': bgColor, ...(locked ? { 'data-locked': 'true' } : {}), class: 'book-jumbotron', style: `background:${bgColor}` },
      ['div', { 'data-jb-heading': 'true', class: 'book-jumbotron-heading' }, heading],
      ['div', { 'data-jb-body': 'true', class: 'book-jumbotron-body' }, body],
      ['div', { 'data-jb-button': 'true', class: 'book-jumbotron-button' }, buttonLabel],
    ];
  },
});

/* Multi-column flowing text — the same CSS column-count technique the chapter-level
   "Two-column" layout already uses, just droppable mid-chapter instead of applying to
   a whole chapter. One content slot rather than N separate column slots: content
   flows across the columns like a newspaper, matching old Designrr's own block. */
const ColumnsBlock = Node.create({
  name: 'columnsBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      columns: { default: 2 },
      locked: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-locked') === 'true',
        renderHTML: (attrs: Record<string, unknown>) => (attrs.locked ? { 'data-locked': 'true' } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-columns]', getAttrs: (el) => ({ columns: Number((el as HTMLElement).getAttribute('data-columns')) || 2 }) }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const { columns } = node.attrs as { columns: number };
    return ['div', mergeAttributes(HTMLAttributes, { 'data-columns': String(columns), class: `book-columns book-columns--${columns}` }), 0];
  },
});

interface GridAttrs { cols: number; boxW: number; boxH: number; fit: string; lockAspect: boolean; locked: boolean }

/* The grid div's attributes, in one place, feeding both renderings — the node
   view's live DOM and renderHTML's exported markup. Same split as
   imageFigureParts, for the same reason: two copies of this drifted apart the
   moment either one gained an attribute. */
function gridDivAttrs(attrs: GridAttrs): Record<string, string> {
  const { cols, boxW, boxH, fit } = attrs;
  const sizing: string[] = [];
  // 0 means "fits the column", which is the state you have until you set a
  // width — same convention as `image`, and Reset puts it back.
  if (boxW) sizing.push(`width:${boxW}px`, 'max-width:100%', 'margin-left:auto', 'margin-right:auto');
  if (boxH) sizing.push(`height:${boxH}px`);
  return {
    'data-image-grid': 'true',
    'data-cols': String(cols),
    ...(boxW ? { 'data-w': String(boxW) } : {}),
    ...(boxH ? { 'data-h': String(boxH) } : {}),
    'data-fit': fit,
    class: `book-image-grid book-image-grid--${cols}`,
    ...(sizing.length ? { style: sizing.join(';') } : {}),
  };
}

/* Image grid — a CSS-grid container so dropped-in images (WrappableImage figures)
   arrange in true grid cells rather than the wrap wrappers finding their own
   position, like old Designrr's Image Grid 2/3/4 layout blocks. */
const ImageGridBlock = Node.create({
  name: 'imageGridBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      cols: { default: 2 },
      /* How every cell's photo fills its cell. A grid gives each cell a fixed
         shape, so unlike a lone photo there IS a real mismatch to resolve — and
         it belongs here rather than per-cell, because a grid whose cells were
         individually trimmed and letterboxed would stop reading as a grid. */
      fit: {
        default: 'cover',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-fit') ?? 'cover',
        renderHTML: (attrs: Record<string, unknown>) => (attrs.fit === 'contain' ? { 'data-fit': 'contain' } : {}),
      },
      /* Size of the WHOLE grid. Resizing a photo inside it only ever changed
         that one cell; there was no way to make the block itself narrower,
         which is what you want when a four-up grid dominates the page. Same
         model as `image` on purpose — W/H in px with 0 meaning "fits the
         column" — so one size vocabulary covers both, and `fit` says how each
         photo sits in the cell the grid gives it. */
      boxW: { default: 0, parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-w') ?? 0), renderHTML: () => ({}) },
      boxH: { default: 0, parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-h') ?? 0), renderHTML: () => ({}) },
      lockAspect: { default: true, parseHTML: (el: HTMLElement) => el.getAttribute('data-lock-aspect') !== 'false', renderHTML: () => ({}) },
      locked: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-locked') === 'true',
        renderHTML: (attrs: Record<string, unknown>) => (attrs.locked ? { 'data-locked': 'true' } : {}),
      },
    };
  },
  parseHTML() {
    return [{
      tag: 'div[data-image-grid]',
      getAttrs: (el) => ({
        cols: Number((el as HTMLElement).getAttribute('data-cols')) || 2,
        boxW: Number((el as HTMLElement).getAttribute('data-w') ?? 0),
        boxH: Number((el as HTMLElement).getAttribute('data-h') ?? 0),
        lockAspect: (el as HTMLElement).getAttribute('data-lock-aspect') !== 'false',
        fit: (el as HTMLElement).getAttribute('data-fit') ?? 'cover',
      }),
    }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ['div', mergeAttributes(HTMLAttributes, gridDivAttrs(node.attrs as GridAttrs)), 0];
  },
  /* A node view purely so the grid can carry resize handles. Everything about
     how the grid itself renders still comes from gridDivAttrs, the same
     function renderHTML uses, so the live DOM and the exported HTML cannot
     drift — the split imageFigureParts already makes for a figure.

     The handles need a positioned box that is NOT the grid: the grid is a CSS
     grid, and an extra child of it would be laid out as another cell. So the
     node view wraps the grid in a plain block, keeps contentDOM on the grid
     itself, and hangs the handles off the wrapper. Export never sees the
     wrapper. */
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'book-image-grid-wrap';
      const grid = document.createElement('div');
      let selected = false;

      const paint = (n: PMNode) => {
        const attrs = gridDivAttrs(n.attrs as GridAttrs);
        for (const a of Array.from(grid.attributes)) {
          if (a.name !== 'class' && a.name !== 'style' && !(a.name in attrs)) grid.removeAttribute(a.name);
        }
        for (const [k, v] of Object.entries(attrs)) grid.setAttribute(k, v);
        if (!('style' in attrs)) grid.removeAttribute('style');
      };

      const markSelected = () => {
        dom.classList.toggle('ProseMirror-selectednode', selected);
        const pos = typeof getPos === 'function' ? getPos() : null;
        const live = pos == null ? null : editor.state.doc.nodeAt(pos);
        const isLocked = !!(live?.attrs as GridAttrs | undefined)?.locked;
        handles.style.display = selected && editor.isEditable && !isLocked ? 'block' : 'none';
      };

      const handles = buildResizeHandles((corner, e) => {
        if (typeof getPos !== 'function') return;
        const pos = getPos();
        if (pos == null) return;
        const current = editor.state.doc.nodeAt(pos);
        if (!current || current.type.name !== 'imageGridBlock') return;
        const attrs = current.attrs as GridAttrs;
        if (attrs.locked) return;
        dragResize({
          box: grid,
          corner,
          event: e,
          lockAspect: attrs.lockAspect !== false,
          maxW: dom.parentElement?.clientWidth ?? 0,
          commit: (w, h) => {
            const at = getPos();
            if (at == null) return;
            const node2 = editor.state.doc.nodeAt(at);
            if (!node2 || node2.type.name !== 'imageGridBlock') return;
            editor.view.focus();
            editor.chain().setNodeSelection(at).updateAttributes('imageGridBlock', { boxW: w, boxH: h }).run();
          },
        });
      });

      dom.appendChild(grid);
      dom.appendChild(handles);
      paint(node);

      return {
        dom,
        contentDOM: grid,
        update: (updated: PMNode) => {
          if (updated.type.name !== 'imageGridBlock') return false;
          paint(updated);
          markSelected();
          return true;
        },
        selectNode: () => { selected = true; markSelected(); },
        deselectNode: () => { selected = false; markSelected(); },
        stopEvent: (e: Event) => !!e.target && handles.contains(e.target as globalThis.Node),
        ignoreMutation: (m: { target: globalThis.Node }) => handles.contains(m.target) || m.target === grid,
      };
    };
  },
});

/* Table, extended with the same `locked` attribute every other movable block
   gets — its own parseHTML/renderHTML already round-trip via HTMLAttributes,
   so declaring the attribute is the entire change needed. */
const LockableTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      locked: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-locked') === 'true',
        renderHTML: (attrs: Record<string, unknown>) => (attrs.locked ? { 'data-locked': 'true' } : {}),
      },
    };
  },
});

/* TipTap's stock nodes drop any class attribute they didn't put there
   themselves — Author name/Display text are otherwise plain paragraphs,
   Checklist is otherwise a plain bullet list, and the asymmetric-columns
   layout (book-split-columns) is otherwise a plain table, so without this
   their class (and with it, all their styling) would silently vanish the
   moment the HTML round-trips through parseHTML. */
const ParagraphClass = Extension.create({
  name: 'paragraphClass',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'bulletList', 'table', 'orderedList'],
      attributes: {
        class: {
          default: null,
          parseHTML: (el) => el.getAttribute('class'),
          renderHTML: (attrs) => (attrs.class ? { class: attrs.class } : {}),
        },
      },
    }, {
      // Pairs a footnote's list-item entry back to its inline reference by a
      // stable id (not document position — position breaks under out-of-order
      // deletion, id doesn't) — see applyFootnoteNumbering in lib/footnotes.ts.
      types: ['listItem'],
      attributes: {
        'data-fid': {
          default: null,
          parseHTML: (el) => el.getAttribute('data-fid'),
          renderHTML: (attrs) => (attrs['data-fid'] ? { 'data-fid': attrs['data-fid'] } : {}),
        },
      },
    }];
  },
});

/* StarterKit's own horizontalRule, re-declared so a divider can carry a look.
   Every value lands in one composed inline `style` rather than five attributes
   each emitting their own — mergeAttributes concatenates `class` and `style`
   specially, and relying on five separate contributions to merge cleanly into one
   declaration is the kind of thing that works until a TipTap minor bump.
   Also re-read from data-* on parse, so a divider survives the HTML round-trip
   that chapter content is stored and exported as. */
interface DividerAttrs { color: string; thickness: number; widthPct: number; radius: number; align: 'left' | 'center' | 'right' }
const DIVIDER_DEFAULTS: DividerAttrs = { color: BORDER, thickness: 1, widthPct: 100, radius: 0, align: 'center' };
const numAttr = (name: string, fallback: number) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => {
    const n = Number(el.getAttribute(`data-${name}`));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  },
  renderHTML: () => ({}),
});
const Divider = HorizontalRule.extend({
  addAttributes() {
    return {
      color: { default: DIVIDER_DEFAULTS.color, parseHTML: (el: HTMLElement) => el.getAttribute('data-color') || DIVIDER_DEFAULTS.color, renderHTML: () => ({}) },
      thickness: numAttr('thickness', DIVIDER_DEFAULTS.thickness),
      widthPct: numAttr('width', DIVIDER_DEFAULTS.widthPct),
      // radius can legitimately be 0, so it can't use numAttr's >0 guard.
      radius: {
        default: DIVIDER_DEFAULTS.radius,
        parseHTML: (el: HTMLElement) => {
          const n = Number(el.getAttribute('data-radius'));
          return Number.isFinite(n) && n >= 0 ? n : DIVIDER_DEFAULTS.radius;
        },
        renderHTML: () => ({}),
      },
      align: {
        default: DIVIDER_DEFAULTS.align,
        parseHTML: (el: HTMLElement) => {
          const a = el.getAttribute('data-align');
          return a === 'left' || a === 'right' ? a : 'center';
        },
        renderHTML: () => ({}),
      },
    };
  },
  renderHTML({ HTMLAttributes, node }) {
    const { color, thickness, widthPct, radius, align } = node.attrs as {
      color: string; thickness: number; widthPct: number; radius: number; align: 'left' | 'center' | 'right';
    };
    /* Deliberately unchanged by the hit-area fix below: this style string is
       what gets stored and exported, and every trick for growing a 1px box
       (padding plus background-clip, transparent borders) relies on CSS a
       reading system might not implement — where it doesn't, the rule paints
       across the whole padded box and a divider exports as a thick bar. The
       editor grows the target with a pseudo-element instead, which never
       leaves the canvas. */
    const margin = align === 'left' ? '26px auto 26px 0' : align === 'right' ? '26px 0 26px auto' : '26px auto';
    return ['hr', mergeAttributes(HTMLAttributes, {
      'data-color': color, 'data-thickness': String(thickness), 'data-width': String(widthPct),
      'data-radius': String(radius), 'data-align': align,
      style: `border:none;background:${color};height:${thickness}px;width:${widthPct}%;border-radius:${radius}px;margin:${margin};`,
    })];
  },
});

/* Straight quotes are the single most visible tell of an unfinished manuscript —
   typographers call them dumb quotes, and no printed book uses them. Every author
   types " and ' because that is what the keyboard has, so this converts as you go
   rather than leaving it to a character picker nobody opens. Written as local
   input rules instead of pulling in @tiptap/extension-typography: it is ~20 lines
   of the same thing, and the pack's other conversions (1/2 → ½, -> → →) are not
   ones we want firing unannounced inside book prose.
   Opening vs closing is decided by what precedes the quote — start of a block, or
   whitespace/an opening bracket, means opening; anything else means closing. That
   same rule gives don't → don’t for free, since the apostrophe follows a letter. */
const SmartTypography = Extension.create({
  name: 'smartTypography',
  addInputRules() {
    return [
      textInputRule({ find: /(?:^|[\s([{<])(")$/, replace: '“' }),
      textInputRule({ find: /"$/, replace: '”' }),
      textInputRule({ find: /(?:^|[\s([{<])(')$/, replace: '‘' }),
      textInputRule({ find: /'$/, replace: '’' }),
      // Three dots before two hyphens, or "..--" would resolve the wrong way.
      textInputRule({ find: /\.\.\.$/, replace: '…' }),
      // En dash for a range typed as 1-5 would be wrong as often as right, so
      // only the explicit double hyphen converts, and it converts to an em dash
      // the way every word processor does.
      textInputRule({ find: /--$/, replace: '—' }),
    ];
  },
});

/* ── selection rings ──────────────────────────────────────────────────────────
   An atom object (image, shape, embed, QR, jumbotron…) already draws a solid
   ring through ProseMirror's own selectednode class. A container block does
   not: columns/table/callout/blockquote aren't atoms, so the live selection
   sits inside their content and nothing on the page was ever marked. You could
   have a 2-column block active — its floating duplicate/delete bar showing, its
   Properties panel open — with no indication of which block either one was
   about to act on.

   Two tiers, so "an object is selected" and "the caret is here" can't be
   mistaken for each other: a solid ring on the active container, and, when the
   caret is in ordinary prose instead, the same soft blue glow the chapter-title
   field already uses on focus. Decorations, not node-view styling, so neither
   ever round-trips into the saved HTML or the export. */
const ACTIVE_CONTAINERS = new Set(['columnsBlock', 'table', 'callout', 'blockquote']);
const activeBlockKey = new PluginKey('activeBlock');

const ActiveBlockRing = Extension.create({
  name: 'activeBlockRing',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: activeBlockKey,
        props: {
          decorations(state) {
            // A NodeSelection is the atom case, already ringed — a second box
            // around its container would read as two things being selected.
            if (state.selection instanceof NodeSelection) return DecorationSet.empty;
            const { $from } = state.selection;
            // Innermost ancestor first, so a table nested inside a columns block
            // rings as the table — the same precedence activeObjectKind uses.
            for (let d = $from.depth; d > 0; d--) {
              if (ACTIVE_CONTAINERS.has($from.node(d).type.name)) {
                return DecorationSet.create(state.doc, [
                  Decoration.node($from.before(d), $from.after(d), { class: 'book-block-active' }),
                ]);
              }
            }
            // A range spanning several paragraphs is already shown by the
            // browser's own selection highlight; ringing just the block the
            // range starts in would claim the wrong extent.
            if (!state.selection.empty || !$from.depth || !$from.parent.isTextblock) return DecorationSet.empty;
            return DecorationSet.create(state.doc, [
              Decoration.node($from.before($from.depth), $from.after($from.depth), { class: 'book-text-active' }),
            ]);
          },
        },
      }),
    ];
  },
});

/* ── document model ───────────────────────────────────────────────────────── */
type LayoutId = 'standard' | 'opener' | 'image-led' | 'quote-pull' | 'two-column';

/* Per-chapter style overrides: the token/override mechanism. A chapter's heading
   colour and body font normally point at the active theme; the moment a user
   picks a value by hand in the Inspector, that single property freezes here and
   stops tracking the theme. Re-applying a theme only ever touches chapters (and
   properties) that aren't in this map. */
interface ChapterOverrides {
  headingColor?: string;
  bodyFont?: string;
}

/* The accent rule above a chapter opener's eyebrow. It's an object you can select
   and restyle, not template decoration — same vocabulary as the Divider block in
   the body flow, but it lives on the page rather than in the chapter's document,
   because it sits outside the editable prose. Unset properties track the theme
   (colour) and the opener's own proportions (56 x 4), so a book that never touches
   the rule still re-themes with everything else. */
const DEFAULT_EYEBROW_HTML = '<p>Chapter</p>';
interface OpenerRule { width: number; thickness: number; color: string }
const OPENER_RULE_SIZE = { width: 56, thickness: 4 };
function openerRuleOf(page: ChapterPage | undefined, theme: ThemeDef): OpenerRule {
  return { ...OPENER_RULE_SIZE, color: theme.accentColor, ...page?.openerRule };
}

interface ChapterPage {
  id: string;
  type: 'chapter';
  /* Per-page background fill. Falls back to the theme's own bg when unset, so a
     book that never touches this looks exactly as it did — but the colour stops
     being one book-wide value you can only change by swapping template. Themes
     were faking a coloured page by dropping a full-bleed rectangle SHAPE onto
     the cover, which is why clicking the background opened a shape inspector. */
  bg?: string;

  /* Plain-text mirror of titleHtml, kept in sync on every keystroke — this is what
     Preview's thumbnail rail, the Inspector breadcrumb and Design's "Layout · …"
     header read, since they want a string, not a field to render. */
  title: string;
  layout: LayoutId;
  overrides: ChapterOverrides;
  /* The chapter's title is its own field now (rendered via SimpleFieldEditor, same
     as Cover's title/subtitle/author) — a real, independently-selectable block, not
     just the first <h2> inside the body flow. initialHtml is body content only. */
  titleHtml: string;
  initialHtml: string;
  /* Old Designrr's TOC is a drop-in element built from whichever chapters are on the
     canvas — this is the one knob it exposes on top of that: a front-matter or
     backmatter-ish chapter (an Acknowledgements page, say) can opt out without being
     deleted or hidden. Defaults to included. */
  excludeFromToc?: boolean;
  /* Only meaningful when layout === 'opener' — a photo that bleeds across the top of
     the page with the eyebrow/numeral/title overlaid on it, instead of the plain
     eyebrow-bar-above-title treatment. Optional: unset chapters render exactly as
     before. Picked/replaced via the same PhotoSourcePanel the cover and body images
     already use (see DesignPanel). */
  openerImage?: string;
  /* Per-chapter overrides for the opener's accent rule — see OpenerRule. Absent
     means "whatever the theme says", exactly like ChapterOverrides. */
  openerRule?: Partial<OpenerRule>;
}

/* ── book metadata — EPUB 3.2 requires identifier, title and language; the rest is
   what every retailer asks for on submission. None of this existed before. ────── */
interface BookMetadata {
  title: string;
  subtitle: string;
  author: string;
  identifier: string;
  language: string;
  publisher: string;
  description: string;
  subjects: string;
  /* Series + reading direction: both real EPUB/retailer fields (Amazon series
     metadata, and the dir attribute EPUB readers use for RTL scripts) that the old
     Designrr editor exposed and this one didn't. */
  seriesName: string;
  seriesPosition: string;
  readingDirection: 'ltr' | 'rtl';
}
const DEFAULT_METADATA: BookMetadata = {
  title: 'Focus: The Anti-Portfolio',
  subtitle: 'A book about doing less',
  author: 'Casper Weldings',
  identifier: '',
  language: 'en',
  publisher: '',
  description: '',
  subjects: '',
  seriesName: '',
  seriesPosition: '',
  readingDirection: 'ltr',
};
const REQUIRED_METADATA: (keyof BookMetadata)[] = ['title', 'identifier', 'language'];
function missingMetadata(m: BookMetadata): (keyof BookMetadata)[] {
  return REQUIRED_METADATA.filter((k) => !m[k].trim());
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
function deriveSubheadings(html: string): string[] {
  const out: string[] = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (text) out.push(text);
  }
  return out;
}
/* ── cover elements — a freeform, positioned canvas, unlike everything else in this
   editor (chapters/TOC/backmatter are flowing, theme-driven text). x/y/w/h are percent
   of the cover stage (0-100), so the same element list renders correctly at any scale
   — full-size in the live editor, or shrunk via a plain CSS transform for a Preview
   device frame or a Templates-tab card thumbnail. ─────────────────────────────────── */
interface CoverElementBase { id: string; x: number; y: number; w: number; h: number; opacity?: number; locked?: boolean; }
interface CoverTextElement extends CoverElementBase {
  type: 'text';
  // Content itself lives in fieldContent (see fieldKeyForCoverText below), not here —
  // singleton roles are keyed by role so a template swap can't orphan a user's real
  // typed title/subtitle/author text under an old element id.
  role: 'category' | 'title' | 'subtitle' | 'author' | 'custom';
  fontFamily: string; fontSize: number; color: string;
  fontWeight?: number; fontStyle?: 'italic'; textAlign?: 'left' | 'center' | 'right';
  letterSpacing?: string; textTransform?: 'uppercase';
  /* Which TEXT_STYLES preset produced the five properties above, so the picker
     can show the current one instead of always rendering unselected. Cleared the
     moment any of those properties is set by hand — at that point the element no
     longer *is* the preset, and leaving the tile lit would claim otherwise. */
  stylePreset?: string | null;
  /* Every theme seeds a generous placeholder slot (h is a guess at "room for a
     couple of lines," not the actual rendered text), so the box shown while
     editing used to dwarf a short line by 30-40px of dead vertical space —
     visibly a different size than the text sitting inside it. Undefined/true
     means the box hugs the rendered line instead of the stored `h`, the same
     "auto until you touch it" relationship ChapterOverrides already uses for
     theme properties. The first manual resize (see beginResize) freezes it to
     false, so a deliberately taller box a user drags open stays open. */
  heightAuto?: boolean;
}
/* originalSrc/crop are the same pair the body image node carries: renderCrop
   bakes the cut into `src`, and these two are what let a crop be widened or
   undone afterwards rather than being a one-way destruction of the photo. */
/* The stroke four are the body image's, spelled the same and read by the same
   helpers: a framed photo is the commonest border in a book, and the cover was
   the one place you couldn't draw one. */
interface CoverImageElement extends CoverElementBase {
  type: 'image'; src: string; overlayDark?: boolean; originalSrc?: string; crop?: string;
  borderWidth?: number; borderColor?: string; borderSides?: string; borderPos?: string; borderStyle?: string;
}
interface CoverShapeElement extends CoverElementBase {
  type: 'shape'; shape: 'rectangle' | 'triangle' | 'circle' | 'rounded'; color: string;
  /* How far the triangle is turned, in degrees clockwise, 0 = right angle at the
     bottom right. Free, not the four fixed diagonals it replaces: those were a
     stand-in for rotation, and every one of them is still reachable here as a
     quarter turn (see CORNER_ROTATION). */
  rotation?: number;
  /* Legacy: which corner held the right angle, on covers saved before `rotation`
     existed. Read only as rotation's fallback, never written. */
  corner?: 'tl' | 'tr' | 'bl' | 'br';
  /* Fill was the only thing a cover shape had. These are the rest of what any
     design tool gives a rectangle — the same four properties the body image
     inspector already carries (radius / stroke / shadow), stored the same way, so
     the two panels describe an object with one vocabulary instead of two.
     'rounded' predates `radius`: it WAS "a rectangle with a corner radius", so it
     now reads as exactly that (see coverShapeRadius) rather than as a fourth
     silhouette sitting beside the shape it's a variant of. */
  radius?: number;
  borderWidth?: number;
  borderColor?: string;
  /* Which edges the stroke paints — 'all' or a comma list of t/r/b/l, the same
     token the body image carries, so one StrokeSidesField serves both panels.
     Absent on a triangle: its outline is an SVG polygon, and a polygon has no
     top or left to paint separately. */
  borderSides?: string;
  /* Where the stroke sits on the edge and how the line is drawn — the body
     image's own two, stored under the same names and read by the same helpers.
     A triangle takes the style (an SVG path dashes fine) but not the position:
     inside/outside a polygon would have to be clipped, not offset. */
  borderPos?: string;
  borderStyle?: string;
  // serializeShadow's string form, shared with the body image node so parseShadow
  // and the Effects fields are one implementation, not two.
  shadow?: string;
}
/* The legacy 'rounded' type's radius, in px — what ShapeFill used to hard-code as
   RADIUS_LG before the corner-radius field existed. */
const COVER_ROUNDED_PX = RADIUS_LG;
function coverShapeRadius(el: CoverShapeElement): number {
  return el.radius ?? (el.shape === 'rounded' ? COVER_ROUNDED_PX : 0);
}
/* Each legacy corner as the rotation that reproduces it exactly — the base
   triangle (right angle bottom-right) turned a quarter at a time. Because the
   turn happens in the SVG's own 100×100 viewBox, BEFORE the box stretches it,
   these four angles render a saved cover pixel-for-pixel as it was. */
const CORNER_ROTATION: Record<NonNullable<CoverShapeElement['corner']>, number> = { br: 0, bl: 90, tl: 180, tr: 270 };
function coverShapeRotation(el: CoverShapeElement): number {
  return el.rotation ?? CORNER_ROTATION[el.corner ?? 'br'];
}
type CoverElement = CoverTextElement | CoverImageElement | CoverShapeElement;

function coverElementLabel(page: SimplePage | undefined, elementId: string): string {
  const el = (page?.coverElements ?? []).find((e) => e.id === elementId);
  if (!el) return 'Cover element';
  if (el.type === 'text') return 'Text';
  if (el.type === 'image') return 'Photo';
  if (el.shape === 'circle') return 'Ellipse';
  if (el.shape === 'triangle') return 'Triangle';
  /* A rectangle covering the whole cover is the page's background, whatever the
     data model calls it — naming it "Rectangle" at the top of Properties
     described the primitive rather than the thing you clicked. Only full-bleed
     ones: a 40%-wide rule is also a rectangle, and calling that "Page" would be
     the same mistake in the other direction. */
  if (el.x === 0 && el.y === 0 && el.w === 100 && el.h === 100) return 'Page';
  // 'rounded' is a rectangle with a corner radius, and says so.
  return 'Rectangle';
}

function fieldKeyForCoverText(pageId: string, el: CoverTextElement): string {
  return el.role === 'custom' ? `${pageId}::el:${el.id}` : `${pageId}::${el.role}`;
}

interface SimplePage {
  id: string;
  type: 'cover' | 'toc' | 'backmatter';
  title: string;
  /* Per-page background fill. Falls back to the theme's own bg when unset, so a
     book that never touches this looks exactly as it did — but the colour stops
     being one book-wide value you can only change by swapping template. Themes
     were faking a coloured page by dropping a full-bleed rectangle SHAPE onto
     the cover, which is why clicking the background opened a shape inspector. */
  bg?: string;

  coverElements?: CoverElement[];
  /* backmatter only — a real author photo for the About-the-Author panel, picked
     the same way as openerImage/cover images. Unset falls back to the drawn
     circle+body silhouette. */
  authorPhoto?: string;
}
type PageMeta = ChapterPage | SimplePage;

let coverElId = 0;
const nextCoverElId = () => `cel-${++coverElId}`;

/* Books saved before the cover had a real background: a full-bleed rectangle
   SHAPE sitting at the bottom of the element list, which is what made clicking a
   cover's background open a shape inspector. Without this, the fix only reaches
   covers created from here on — the book already on disk keeps the fake one, and
   keeps opening the wrong panel.

   Deliberately narrow: only a rectangle, only at 0,0 covering the whole page, and
   only the bottom-most one, so a deliberate full-bleed colour block layered OVER
   the artwork isn't quietly swallowed. */
function migrateCoverBg(p: SimplePage): SimplePage {
  if (p.type !== 'cover' || p.bg) return p;
  const els = p.coverElements ?? [];
  const first = els[0];
  if (!first || first.type !== 'shape' || first.shape !== 'rectangle') return p;
  if (first.x !== 0 || first.y !== 0 || first.w !== 100 || first.h !== 100) return p;
  return { ...p, bg: first.color, coverElements: els.slice(1) };
}

function cloneCoverElements(elements: CoverElement[]): CoverElement[] {
  return elements.map((el) => ({ ...el, id: nextCoverElId() }));
}

/* Applying a template used to replace the cover wholesale, so a chosen photo
   went with it. A template IS a layout — and a look, coordinated font/colour
   choices that go with that specific arrangement — so both the arrangement
   and the styling get replaced. Only the author's actual content survives:

   · Photo — always carries onto the new layout's image slot. It's the
     author's content, not the template's; its treatment (overlay, etc.)
     comes from the new template, matching whatever look it was designed for.
   · Text — the words already survive, because they live in fieldContent
     keyed by role rather than by element id (see fieldKeyForCoverText). Font,
     colour, size and alignment always come from the new template — a toggle
     to keep the old template's type choices used to exist here, but kept
     styling from a layout the type was never designed for, which is exactly
     what picking a different template is meant to change.
   · Position and size — never carry. They're coordinates in the layout being
     replaced; keeping them is what produces a title floating in dead space. */
function mergeCoverElements(current: CoverElement[], incoming: CoverElement[]): CoverElement[] {
  const currentPhoto = current.find((el): el is CoverImageElement => el.type === 'image');
  return cloneCoverElements(incoming).map((el) => {
    if (el.type === 'image' && currentPhoto) {
      return { ...el, src: currentPhoto.src };
    }
    return el;
  });
}

/* ── templates — one bundled thing, not two: a template is a cover layout AND the
   chapter/TOC/back-matter color+font that goes with it, applied together. Cover
   layout and chapter theming used to be two separate systems (a cover-only gallery,
   and this array as a chapter-color-only "Theme" swap) — they're merged here so
   picking a template actually changes the whole book, not just one page. */
type ThemeId = 'statement-lettering' | 'academic-clean' | 'vintage-literary' | 'gradient-tech' | 'pastel-wellness' | 'forgotten-memories' | 'hand-illustrated' | 'collage-maximalist' | 'growth';
interface ThemeDef {
  id: ThemeId;
  name: string;
  headingFont: string;
  bodyFont: string;
  headingColor: string;
  accentColor: string;
  bg: string;
  /* Body/paragraph ink — separate from headingColor so a dark-page theme (Dark
     Thriller) can carry a softer off-white for running text while the heading
     stays crisp, instead of both reusing one color built for a white page. */
  bodyColor: string;
  /* The cover's own page fill, when it differs from the book's. Dark Thriller's
     near-black cover used to be a full-bleed rectangle SHAPE sitting at the
     bottom of coverElements — which is why clicking the cover's background
     opened a shape inspector offering to turn the page's background into a
     circle. It's a page property, so it's stored as one (SimplePage.bg) and set
     from here when the template is applied. Unset means "the book's own bg". */
  coverBg?: string;
  requiredPlan?: GateTier;
  coverElements: CoverElement[];
}
/* Full replacement set (2026-09-15) — the original 7 stock-photo/color-block themes
   are gone, not just supplemented. Two things drove the swap: (1) a photo-based cover
   (Vintage Literary v1) got rejected outright because none of the 7 stock photos in
   this library read as book-cover subject matter — see the comment on Vintage
   Literary below; (2) real cover-design guidance (KDPeasy, Matsuo) says a cover
   should bleed color/imagery to its true edge, since most shelves/carousels sit on a
   white page and a pale-edged cover disappears into it — so every theme here is
   typographic/graphic (shapes + type), no stock photos, and deliberately mostly
   white/off-white (6 of 8) so that's the default read, not the exception, matching
   what 2026 nonfiction/business cover trends (Damonza, Troubador) actually show:
   one font, one accent color, generous white space, title doing the heavy lifting.
   The two exceptions are deliberate, not missed quota — Dark Thriller stays dark
   because "dark/moody" is the genre's own convention, not a style preference. */
/* A photo is still worth having in a handful of these — 3 of 8 (Academic Clean,
   Gradient Tech, Collage Maximalist) — just never as a full-bleed background behind
   text again. Each uses a photo as one CONTAINED element (a top band, a corner card,
   a collage fragment) sized well under 100% of the cover, so the white ground still
   reads as dominant and the photo never needs a dark tint to keep text legible. */
const CHART_COVER_IMAGE = STOCK_IMAGES.find((s) => s.label === 'Data chart')?.src ?? STOCK_IMAGES[0].src;
const DESK_COVER_IMAGE = STOCK_IMAGES.find((s) => s.label === 'Desk workspace')?.src ?? STOCK_IMAGES[0].src;
const SKYLINE_COVER_IMAGE = STOCK_IMAGES.find((s) => s.label === 'City skyline')?.src ?? STOCK_IMAGES[0].src;
const THEMES: ThemeDef[] = [
  // 1. Statement Lettering — free/default. Practically the whole cover IS the title:
  // huge, bleeding slightly past both edges, nothing else competing for attention.
  // Matches 2026's "drop the image, let the title do the work" trend directly, and
  // works for nearly any nonfiction/business subject, which is why it's the default.
  {
    id: 'statement-lettering', name: 'Statement Lettering',
    headingFont: "'Nunito Sans', sans-serif", bodyFont: "'Source Sans 3', sans-serif", headingColor: '#111111', accentColor: '#006EFE', bg: '#FFFFFF', bodyColor: '#2B2B2B',
    coverElements: [
      { id: 'cat', type: 'text', role: 'category', x: 10, y: 12, w: 80, h: 5, fontFamily: "'Nunito Sans', sans-serif", fontSize: 11, fontWeight: 700, color: '#6B7280', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.14em' },
      /* Was x:-4/w:108/84px — tuned to one short word ("Focus") deliberately bleeding
         a few percent past each edge. A realistic title wraps to 3-4 lines, and since
         the BOX itself (not just an intentionally-oversized single line) started past
         the canvas edge, every wrapped line bled off both sides, not just a single
         full-width word — plus the real-cover guidance already on file (see Vintage
         Literary) is to never let a cover bleed past its own trim edge. Contained
         within the canvas and knocked down from 84 to 56 so a 60-70 character title
         (a common real nonfiction length) wraps without colliding with the rule/
         subtitle below — verified live with a 63-character stress title. */
      { id: 'title', type: 'text', role: 'title', x: 6, y: 30, w: 88, h: 34, fontFamily: "'Nunito Sans', sans-serif", fontSize: 56, fontWeight: 800, color: '#111111', textAlign: 'center' },
      { id: 'rule', type: 'shape', shape: 'rectangle', x: 30, y: 70, w: 40, h: 1.1, color: '#006EFE' },
      { id: 'sub', type: 'text', role: 'subtitle', x: 14, y: 74, w: 72, h: 7, fontFamily: "'Source Sans 3', sans-serif", fontSize: 14, color: '#2B2B2B', textAlign: 'center' },
      { id: 'auth', type: 'text', role: 'author', x: 10, y: 91, w: 80, h: 5, fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, fontWeight: 700, color: '#111111', textAlign: 'right' },
    ],
  },
  // 2. Academic Clean — free. A photo band across the top third (the classic split-
  // cover business/leadership-book pattern), a hard navy seam instead of a fade —
  // no tint needed since no text sits on the photo — then plain white with tracked
  // uppercase serif type below. Two-thirds of the cover is still bare white.
  {
    id: 'academic-clean', name: 'Academic Clean',
    headingFont: "'Newsreader', Georgia, serif", bodyFont: "'Newsreader', Georgia, serif", headingColor: '#0B2545', accentColor: '#0B2545', bg: '#FFFFFF', bodyColor: '#2B3A4A',
    coverElements: [
      { id: 'photo', type: 'image', x: 0, y: 0, w: 100, h: 32, src: DESK_COVER_IMAGE },
      { id: 'seam', type: 'shape', shape: 'rectangle', x: 0, y: 32, w: 100, h: 0.4, color: '#0B2545' },
      { id: 'cat', type: 'text', role: 'category', x: 10, y: 38, w: 80, h: 5, fontFamily: "'Nunito Sans', sans-serif", fontSize: 11, fontWeight: 700, color: '#0B2545', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.16em' },
      { id: 'title', type: 'text', role: 'title', x: 10, y: 46, w: 80, h: 16, fontFamily: "'Newsreader', Georgia, serif", fontSize: 36, color: '#0B2545', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.02em' },
      { id: 'rule-mid', type: 'shape', shape: 'rectangle', x: 10, y: 66, w: 80, h: 0.3, color: '#0B2545' },
      { id: 'sub', type: 'text', role: 'subtitle', x: 14, y: 70, w: 72, h: 8, fontFamily: "'Newsreader', Georgia, serif", fontSize: 15, fontStyle: 'italic', color: '#4A5A6A', textAlign: 'center' },
      { id: 'auth', type: 'text', role: 'author', x: 10, y: 90, w: 50, h: 5, fontFamily: "'Nunito Sans', sans-serif", fontSize: 11, fontWeight: 700, color: '#0B2545', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.08em' },
      { id: 'rule-bottom', type: 'shape', shape: 'rectangle', x: 10, y: 96, w: 80, h: 0.3, color: '#0B2545' },
    ],
  },
  // 3. Vintage Literary — pro. The "bordered classic reprint" archetype (Penguin
  // Clothbound, Everyman's Library, most indie literary/memoir reissues): a thin
  // ornamental frame plus oversized italic type on a plain ground, not a photo. A
  // photo cover was tried first and cut — none of the 7 stock photos in this app
  // read as book-cover subject matter (they're generic desk/lifestyle/office stock),
  // and even tinted, a literal interior photo behind small centered text reads as
  // "stock photo with a filter," not a book jacket. The frame sits flush at 0%
  // inset, not floating a few percent in from the edge — real cover guidance warns
  // a pale-edged cover with no boundary disappears into a white shelf/page, so the
  // gold line itself needs to BE the cover's edge, not float inside a cream margin.
  {
    id: 'vintage-literary', name: 'Vintage Literary', requiredPlan: 'pro',
    headingFont: "'Fraunces', Georgia, serif", bodyFont: 'Georgia, serif', headingColor: '#3E2723', accentColor: '#A9812F', bg: '#F5EDE0', bodyColor: '#3A2E28',
    coverElements: [
      { id: 'frame-top', type: 'shape', shape: 'rectangle', x: 0, y: 0, w: 100, h: 0.4, color: '#A9812F' },
      { id: 'frame-bottom', type: 'shape', shape: 'rectangle', x: 0, y: 99.6, w: 100, h: 0.4, color: '#A9812F' },
      { id: 'frame-left', type: 'shape', shape: 'rectangle', x: 0, y: 0, w: 0.5, h: 100, color: '#A9812F' },
      { id: 'frame-right', type: 'shape', shape: 'rectangle', x: 99.5, y: 0, w: 0.5, h: 100, color: '#A9812F' },
      { id: 'cat', type: 'text', role: 'category', x: 10, y: 15, w: 80, h: 5, fontFamily: "'Nunito Sans', sans-serif", fontSize: 11, color: '#8A6A2F', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.22em' },
      { id: 'rule1', type: 'shape', shape: 'rectangle', x: 44, y: 25, w: 12, h: 0.35, color: '#A9812F' },
      /* 60px let a realistic 60-70 character title wrap to 4 lines and run into the
         subtitle directly below it (verified live with a 63-character stress title) —
         knocked down to 50 so the same title wraps to 3 lines with real clearance;
         sub/rule2/author nudged down a few more percent as extra margin. */
      { id: 'title', type: 'text', role: 'title', x: 10, y: 36, w: 80, h: 26, fontFamily: "'Fraunces', Georgia, serif", fontSize: 50, fontStyle: 'italic', color: '#3E2723', textAlign: 'center' },
      { id: 'sub', type: 'text', role: 'subtitle', x: 12, y: 68, w: 76, h: 8, fontFamily: 'Georgia, serif', fontSize: 16, fontStyle: 'italic', color: '#6B4A30', textAlign: 'center' },
      { id: 'rule2', type: 'shape', shape: 'rectangle', x: 44, y: 79, w: 12, h: 0.35, color: '#A9812F' },
      { id: 'auth', type: 'text', role: 'author', x: 10, y: 85, w: 80, h: 6, fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, color: '#5C4630', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.1em' },
    ],
  },
  // 4. Gradient Tech — pro. A SaaS/lead-magnet look without a full-bleed dark panel:
  // white ground, a small photo "card" (data chart — on-genre for a tech/business
  // cover) floating over one flat color shape, standing in for the "neon geometry"
  // 2025-26 tech covers lean on, left-aligned bold title.
  {
    id: 'gradient-tech', name: 'Gradient Tech', requiredPlan: 'pro',
    headingFont: "'Nunito Sans', sans-serif", bodyFont: "'Nunito Sans', sans-serif", headingColor: '#0A1128', accentColor: '#FF6B4A', bg: '#FAFAFA', bodyColor: '#33394A',
    coverElements: [
      { id: 'shape-circle', type: 'shape', shape: 'circle', x: 66, y: 6, w: 30, h: 23, color: '#2DD4BF', opacity: 0.85 },
      { id: 'photo-card', type: 'image', x: 78, y: 14, w: 18, h: 14, src: CHART_COVER_IMAGE },
      { id: 'shape-tri', type: 'shape', shape: 'triangle', corner: 'tl', x: 70, y: 4, w: 16, h: 16, color: '#0A1128', opacity: 0.15 },
      { id: 'cat', type: 'text', role: 'category', x: 10, y: 16, w: 60, h: 5, fontFamily: "'Nunito Sans', sans-serif", fontSize: 11, fontWeight: 800, color: '#FF6B4A', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.1em' },
      { id: 'title', type: 'text', role: 'title', x: 8, y: 36, w: 70, h: 28, fontFamily: "'Nunito Sans', sans-serif", fontSize: 44, fontWeight: 800, color: '#0A1128', textAlign: 'left' },
      { id: 'rule', type: 'shape', shape: 'rectangle', x: 8, y: 66, w: 20, h: 0.6, color: '#FF6B4A' },
      { id: 'auth', type: 'text', role: 'author', x: 8, y: 88, w: 60, h: 5, fontFamily: "'Nunito Sans', sans-serif", fontSize: 11, fontWeight: 700, color: '#5A6270', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em' },
    ],
  },
  // 5. Pastel Wellness — pro. A soft "sunrise" of two overlapping pale circles behind
  // centered friendly type, near-white blush ground — the self-help/wellness
  // archetype real cover galleries lean on instead of hard-edged blocks.
  {
    id: 'pastel-wellness', name: 'Pastel Wellness', requiredPlan: 'pro',
    headingFont: "'Nunito Sans', sans-serif", bodyFont: "'Source Sans 3', sans-serif", headingColor: '#B5657A', accentColor: '#5B8266', bg: '#FFFBF8', bodyColor: '#5B4A4E',
    coverElements: [
      { id: 'circle1', type: 'shape', shape: 'circle', x: 26, y: 30, w: 40, h: 31, color: '#DCEEE0' },
      { id: 'circle2', type: 'shape', shape: 'circle', x: 40, y: 38, w: 34, h: 26.6, color: '#FDE8E4' },
      { id: 'cat', type: 'text', role: 'category', x: 10, y: 14, w: 80, h: 5, fontFamily: "'Nunito Sans', sans-serif", fontSize: 11, color: '#B5657A', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.16em' },
      { id: 'title', type: 'text', role: 'title', x: 10, y: 42, w: 80, h: 18, fontFamily: "'Nunito Sans', sans-serif", fontSize: 40, fontWeight: 700, color: '#B5657A', textAlign: 'center' },
      { id: 'sub', type: 'text', role: 'subtitle', x: 14, y: 64, w: 72, h: 8, fontFamily: "'Source Sans 3', sans-serif", fontSize: 15, fontStyle: 'italic', color: '#5B8266', textAlign: 'center' },
      { id: 'auth', type: 'text', role: 'author', x: 10, y: 86, w: 80, h: 5, fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, fontStyle: 'italic', color: '#9C7280', textAlign: 'center' },
    ],
  },
  // 6. Forgotten Memories — free. Ported from the "Forgotten Memories" template in
  // the Designrr Figma library (replaces Dark Thriller): a nostalgic scrapbook
  // look — a contained photo pinned near the top with a small kraft-tape accent,
  // a bold title sitting on a solid red-orange block (the source's wavy-cut block
  // edge isn't reproducible — no freeform/path shapes in this editor, only
  // rectangle/triangle/circle/rounded — approximated as a plain rectangle, same
  // precedent as Growth's staircase), author name below. The source's photos are
  // rotated ~11° and carry a hand-drawn doodle accent; neither is reproducible
  // (no rotation, no stroke-only/freeform shapes) and both are dropped rather
  // than faked.
  {
    id: 'forgotten-memories', name: 'Forgotten Memories',
    headingFont: "'Nunito Sans', sans-serif", bodyFont: "'Source Sans 3', sans-serif", headingColor: '#241C14', accentColor: '#D24E2C', bg: '#FBF3E7', bodyColor: '#4A3B2E',
    coverElements: [
      { id: 'photo', type: 'image', x: 10, y: 6, w: 80, h: 36, src: '/assets/stock-canoe.jpg' },
      { id: 'tape', type: 'shape', shape: 'rectangle', x: 38, y: 2, w: 24, h: 6, color: '#C9A97C', opacity: 0.9 },
      { id: 'block', type: 'shape', shape: 'rectangle', x: 0, y: 60, w: 100, h: 40, color: '#D24E2C' },
      { id: 'title', type: 'text', role: 'title', x: 8, y: 65, w: 84, h: 18, fontFamily: "'Nunito Sans', sans-serif", fontSize: 34, fontWeight: 800, color: '#241C14', textAlign: 'left' },
      { id: 'auth', type: 'text', role: 'author', x: 8, y: 84, w: 60, h: 5, fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, fontWeight: 700, color: '#241C14', textAlign: 'left' },
    ],
  },
  // 7. Hand-Illustrated — pro. A sun-over-hills motif built entirely from the shape
  // primitives (no illustration asset exists in this library) — kept to the bottom
  // quarter of the cover plus one small circle, so the warm cream ground still reads
  // as the dominant surface rather than a busy illustrated scene.
  {
    id: 'hand-illustrated', name: 'Hand-Illustrated', requiredPlan: 'pro',
    headingFont: "'Nunito Sans', sans-serif", bodyFont: "'Source Sans 3', sans-serif", headingColor: '#E2725B', accentColor: '#3D8C82', bg: '#FFF8ED', bodyColor: '#5B4636',
    coverElements: [
      { id: 'sun', type: 'shape', shape: 'circle', x: 66, y: 10, w: 20, h: 15.6, color: '#E2725B', opacity: 0.85 },
      { id: 'hill-back', type: 'shape', shape: 'triangle', corner: 'bl', x: -5, y: 74, w: 62, h: 20, color: '#3D8C82', opacity: 0.85 },
      { id: 'hill-front', type: 'shape', shape: 'triangle', corner: 'br', x: 44, y: 78, w: 62, h: 18, color: '#E2725B', opacity: 0.85 },
      { id: 'cat', type: 'text', role: 'category', x: 10, y: 16, w: 56, h: 5, fontFamily: "'Nunito Sans', sans-serif", fontSize: 11, fontWeight: 700, color: '#3D8C82', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.1em' },
      { id: 'title', type: 'text', role: 'title', x: 10, y: 40, w: 80, h: 22, fontFamily: "'Nunito Sans', sans-serif", fontSize: 42, fontWeight: 800, color: '#E2725B', textAlign: 'center' },
      { id: 'sub', type: 'text', role: 'subtitle', x: 12, y: 62, w: 76, h: 8, fontFamily: "'Source Sans 3', sans-serif", fontSize: 15, fontStyle: 'italic', color: '#3D8C82', textAlign: 'center' },
      { id: 'auth', type: 'text', role: 'author', x: 10, y: 90, w: 80, h: 5, fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, fontWeight: 700, color: '#FFF8ED', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.08em' },
    ],
  },
  // 8. Collage Maximalist — pro. An actual photo fragment (city skyline) as one of
  // the corner pieces makes this a real collage instead of just flat shapes — still
  // against plain white (that's what makes the clash pop), so three small color
  // accents plus one photo corner on a white ground, not a busy full-bleed collage.
  {
    id: 'collage-maximalist', name: 'Collage Maximalist', requiredPlan: 'pro',
    headingFont: "'Nunito Sans', sans-serif", bodyFont: "'Source Sans 3', sans-serif", headingColor: '#15191F', accentColor: '#FF3D8A', bg: '#FFFFFF', bodyColor: '#2A303A',
    coverElements: [
      { id: 'c1', type: 'shape', shape: 'circle', x: 6, y: 6, w: 22, h: 17.2, color: '#FF3D8A', opacity: 0.85 },
      { id: 'c2-photo', type: 'image', x: 70, y: 8, w: 24, h: 14, src: SKYLINE_COVER_IMAGE },
      { id: 'c3', type: 'shape', shape: 'circle', x: 8, y: 80, w: 18, h: 14, color: '#C6FF3D', opacity: 0.9 },
      { id: 'c4', type: 'shape', shape: 'rectangle', x: 74, y: 78, w: 20, h: 16, color: '#FF3D8A', opacity: 0.6 },
      { id: 'cat', type: 'text', role: 'category', x: 14, y: 26, w: 72, h: 5, fontFamily: "'Nunito Sans', sans-serif", fontSize: 11, fontWeight: 800, color: '#FF3D8A', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.12em' },
      { id: 'title', type: 'text', role: 'title', x: 10, y: 34, w: 80, h: 20, fontFamily: "'Nunito Sans', sans-serif", fontSize: 50, fontWeight: 800, color: '#15191F', textAlign: 'center' },
      { id: 'sub', type: 'text', role: 'subtitle', x: 14, y: 58, w: 72, h: 8, fontFamily: "'Source Sans 3', sans-serif", fontSize: 15, fontWeight: 700, color: '#3D5AFF', textAlign: 'center' },
      { id: 'auth', type: 'text', role: 'author', x: 14, y: 90, w: 72, h: 5, fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, fontWeight: 700, color: '#15191F', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.08em' },
    ],
  },
  // 9. Growth — free. Ported from the "Growth" template in the Designrr Figma
  // library. Only the COVER is black in the source — chapter/TOC/back-matter
  // pages are white with photos — but `bg` is one token shared by every page
  // type including the cover (see CoverCanvasStatic/Editable), so `bg` here
  // is white for the interior pages and the cover carries its OWN full-bleed
  // background rectangle (the first coverElement below) to stay black
  // regardless. A near-black ground with a bottom-right "staircase" of
  // stepped panels (two colored triangle accents) and a simple circle+bar
  // person silhouette bottom-left, left-aligned type instead of centered.
  // The source file's fine grid linework and sunburst icon aren't
  // reproducible with this editor's shape primitives (rectangle/triangle/circle,
  // no arbitrary paths) — approximated
  // here the same way Hand-Illustrated approximates its sun-over-hills scene.
  {
    id: 'growth', name: 'Growth',
    headingFont: "'Nunito Sans', sans-serif", bodyFont: "'Source Sans 3', sans-serif", headingColor: '#15191F', accentColor: '#0E8FA8', bg: '#FFFFFF', bodyColor: '#2B2B2B',
    coverBg: '#0B0F14',
    coverElements: [
      { id: 'title', type: 'text', role: 'title', x: 8, y: 8, w: 70, h: 24, fontFamily: "'Nunito Sans', sans-serif", fontSize: 34, fontWeight: 800, color: '#8FE3FA', textAlign: 'left' },
      { id: 'sub', type: 'text', role: 'subtitle', x: 8, y: 30, w: 60, h: 12, fontFamily: "'Source Sans 3', sans-serif", fontSize: 14, color: '#FFFFFF', textAlign: 'left' },
      { id: 'step1', type: 'shape', shape: 'rounded', x: 30, y: 62, w: 22, h: 15, color: '#171B21' },
      { id: 'step2', type: 'shape', shape: 'rounded', x: 52, y: 62, w: 22, h: 15, color: '#171B21' },
      { id: 'step3', type: 'shape', shape: 'rounded', x: 52, y: 47, w: 22, h: 15, color: '#171B21' },
      { id: 'step4', type: 'shape', shape: 'rounded', x: 30, y: 77, w: 22, h: 15, color: '#171B21' },
      { id: 'step5', type: 'shape', shape: 'rounded', x: 8, y: 77, w: 22, h: 15, color: '#171B21' },
      { id: 'step6', type: 'shape', shape: 'rounded', x: 74, y: 47, w: 22, h: 15, color: '#171B21' },
      { id: 'step7', type: 'shape', shape: 'rounded', x: 74, y: 32, w: 22, h: 15, color: '#171B21' },
      { id: 'tri-cyan', type: 'shape', shape: 'triangle', corner: 'tl', x: 30, y: 62, w: 22, h: 15, color: '#8FE3FA' },
      { id: 'tri-lime', type: 'shape', shape: 'triangle', corner: 'tl', x: 52, y: 47, w: 22, h: 15, color: '#C6F24E' },
      { id: 'person-head', type: 'shape', shape: 'circle', x: 9, y: 78, w: 8, h: 6.2, color: '#2A2E35' },
      { id: 'person-body', type: 'shape', shape: 'rounded', x: 6, y: 85, w: 14, h: 9, color: '#2A2E35' },
      { id: 'auth', type: 'text', role: 'author', x: 44, y: 91, w: 48, h: 5, fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, fontWeight: 700, color: '#FFFFFF', textAlign: 'right' },
    ],
  },
];

const INITIAL_PAGES: PageMeta[] = [
  // A cover with no artwork isn't a real cover — every reference screenshot shows
  // the title sitting over a photo, never on a blank page. Seeded with one so the
  // book opens looking like a book; still fully replaceable from the Templates tab.
  { id: 'p-cover', type: 'cover', title: 'Cover', bg: THEMES[0].coverBg, coverElements: cloneCoverElements(THEMES[0].coverElements) },
  { id: 'p-toc', type: 'toc', title: 'Table of Contents' },
  {
    id: 'ch-1', type: 'chapter', title: 'The Weight of Everything', layout: 'opener', overrides: {},
    titleHtml: '<h2>The Weight of Everything</h2>',
    initialHtml: `<p>For ten years I said yes to nearly everything. A new client with a vague brief? Yes. A side project that sounded interesting for a week? Yes. A speaking request that paid in exposure and took three days to prepare? Yes. I told myself each yes was an opportunity, and opportunities were how you built a career.</p>
      <p>By the end of that decade I had hundreds of projects scattered across dozens of platforms, several half-finished personal brands, and a client list so varied that even I couldn't explain what I actually did in one sentence.</p>
      <p>I remember sitting in front of my computer one afternoon, staring at a portfolio page that had forty-seven items on it, and realizing I cared about maybe eight of them. The rest were there because they had once been someone else's idea of what I should do.</p>`,
  },
  {
    id: 'ch-2', type: 'chapter', title: 'The Deletion', layout: 'image-led', overrides: {},
    titleHtml: '<h2>The Deletion</h2>',
    initialHtml: `<img src="/assets/stock-desk.jpg" alt="A desk with an open laptop and scattered notes" data-wrap="inline" class="book-img-wrap book-img-wrap--inline" />
      <p>What changed was not a grand insight but a small, almost embarrassing one: I opened a spreadsheet and started deleting rows. Not projects — just rows in a list of things I thought I might someday do.</p>
      <p>A product idea from three years ago. A course outline I never finished. A partnership I was keeping alive out of guilt. I deleted them one at a time, and with each deletion I felt something I hadn't expected. Relief.</p>
      <blockquote>The paralysis was quiet. I didn't break down or quit in a dramatic gesture. I just stopped being able to choose anything new.</blockquote>
      <p>My calendar was full, my income was fine, my output was constant, and none of it made sense. I was a collector of commitments, and the collection was burying me.</p>`,
  },
  {
    id: 'ch-3', type: 'chapter', title: 'Choosing on Purpose', layout: 'quote-pull', overrides: {},
    titleHtml: '<h2>Choosing on Purpose</h2>',
    initialHtml: `<p>Once the list was short enough to see all at once, a different question became possible: not "what else could I add," but "which of these, if it were the only thing, would still feel worth doing in five years."</p>
      <blockquote>Focus isn't a longer list done faster. It's a shorter list, chosen on purpose.</blockquote>
      <p>That question eliminated most of what remained. What survived it wasn't the safest work or the highest-paying work — it was the work I'd still choose with nothing to prove.</p>`,
  },
  {
    id: 'ch-4', type: 'chapter', title: 'What Stayed', layout: 'two-column', overrides: {},
    titleHtml: '<h2>What Stayed</h2>',
    initialHtml: `<p>Three things survived the cut. A single practice I'd been avoiding turning into a business. One long-term client relationship built on real trust rather than habit. And a body of writing I'd been treating as a hobby, which turned out to be the thing people actually remembered me for.</p>
      <p>Everything else — the side projects, the half-brands, the yeses given out of fear of missing something — simply stopped, and nothing collapsed. No client noticed the forty other things I wasn't doing. They only ever noticed the one thing I was.</p>`,
  },
  { id: 'p-back', type: 'backmatter', title: 'About the Author' },
];

/* ── page-number settings: one global control, not a per-page element ───────── */
type PageNumberPosition = 'header-left' | 'header-center' | 'header-right' | 'footer-left' | 'footer-center' | 'footer-right';
interface PageNumberSettings {
  enabled: boolean;
  position: PageNumberPosition;
  style: 'numeric' | 'roman';
  startAt: number;
  skipCoverAndBackMatter: boolean;
  // Typography — click the number itself to reach these (see PageNumberInspector),
  // not a fourth thing bolted onto Book Settings' own enabled/start-at/skip list.
  // Undefined reads as the theme's own body font/color at a small fixed size, the
  // same "unset tracks a sensible default until touched" relationship overrides
  // use everywhere else in this file.
  fontFamily?: string;
  fontSize?: number;
  color?: string;
}
const DEFAULT_PAGE_NUMBERS: PageNumberSettings = {
  enabled: true, position: 'footer-center', style: 'numeric', startAt: 1, skipCoverAndBackMatter: true,
};

/* ── selection model: drives which Inspector view shows ──────────────────────
   Text formatting lives in the Properties view (TextInspector), which swaps over
   the left panel on selection — matching Designrr's
   own live editor and this codebase's presentation editor — both put text
   controls in the panel, not a floating toolbar. A focused chapter with no
   object selected shows TextInspector; a selected image/shape/embed swaps in
   its own inspector. */
type Selection =
  | { kind: 'none' }
  | { kind: 'chapter'; chapterId: string }
  /* viaCanvas marks a DELIBERATE click on the page's own surface, as opposed to
     the same selection arrived at by landing on the book, hydrating, or having
     whatever was selected deleted out from under you. Only the deliberate one
     opens Properties (see isElementSelection) — without the distinction, the
     editor's resting selection IS a page, so Properties would cover the panel on
     every single load. */
  | { kind: 'page'; pageId: string; viaCanvas?: boolean }
  | { kind: 'image'; chapterId: string; editor: Editor }
  | { kind: 'shape'; chapterId: string; editor: Editor }
  | { kind: 'embed'; chapterId: string; editor: Editor }
  | { kind: 'qr'; chapterId: string; editor: Editor }
  | { kind: 'chart'; chapterId: string; editor: Editor }
  | { kind: 'divider'; chapterId: string; editor: Editor }
  | { kind: 'textfield'; chapterId: string; editor: Editor }
  | { kind: 'jumbotron'; chapterId: string; editor: Editor }
  | { kind: 'imageGrid'; chapterId: string; editor: Editor }
  | { kind: 'columns'; chapterId: string; editor: Editor }
  | { kind: 'table'; chapterId: string; editor: Editor }
  | { kind: 'footnote'; chapterId: string; editor: Editor }
  | { kind: 'footnotesSection'; chapterId: string; editor: Editor }
  | { kind: 'coverElement'; pageId: string; elementId: string }
  // Same idea as coverElement, for a photo that lives on the page/chapter
  // itself rather than in a coverElements array: the chapter-opener image and
  // the back-matter avatar photo.
  | { kind: 'openerImage'; chapterId: string }
  /* The opener's rule and its eyebrow are separate objects, the way a rectangle
     and a text layer next to it are in Figma: the rule reports this, the eyebrow
     is a SimpleFieldEditor and reports the usual 'chapter' text selection. */
  | { kind: 'openerRule'; chapterId: string }
  | { kind: 'backmatterAvatar'; pageId: string }
  // One page-number object for the whole book, not one per page — every page
  // shares the same PageNumberSettings, so there's nothing page-specific to
  // carry here; clicking the chip on any page selects the same thing.
  | { kind: 'pageNumber' };

/* ── icon set (inline SVGs, matching the outline-stroke style used elsewhere) ── */
function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

/* A custom chevron overlaid on native <select> elements (appearance:none hides the
   browser's own arrow) so they read as a styled control rather than raw OS form chrome
   sitting next to the custom-drawn inputs/toggles around them. */
function SelectChevron() {
  return (
    <svg width="9" height="6" viewBox="0 0 8 5" fill="none" style={{ position: 'absolute', top: '50%', right: 11, transform: 'translateY(-50%)', pointerEvents: 'none' }}>
      <path d="M1 1L4 4L7 1" stroke={SLATE} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
/* Link colours are deliberately not theme-driven — see the .book-chapter-prose
   a rule. Blue is the app's own accent rather than the browser's #0000EE, and
   the purple is the one dropped from the text swatch row. */
const LINK_COLOR = '#006EFE';
const LINK_VISITED_COLOR = '#7C3AED';

const ICONS = {
  design: 'M12 2a5 5 0 0 0-5 5c0 2 1 3 1 5a4 4 0 0 0 4 4h.5a1.5 1.5 0 0 0 1.06-2.56A1 1 0 0 1 14 12h2a5 5 0 0 0 5-5c0-3-4-5-9-5z',
  // Triangle overlapping a circle — matches old Designrr's "Artwork & shapes"
  // rail icon (a two-tone triangle-over-circle glyph), redrawn as a single
  // outline to match this app's own icon rendering (Icon() always strokes one
  // currentColor path — see the comment above that component).
  shapesTab: 'M8 3a5 5 0 1 0 0 10 5 5 0 1 0 0-10zM13 12h8v8h-8z',
  // Rail-only "Text" glyph — a literal A, matching old Designrr's rail (a
  // rounded "A" badge). Distinct from `heading` below, which stays the
  // H2/H3-style bar icon used by the Subheading insert tile — that's a
  // different, more specific meaning and shouldn't change just because the
  // rail tab icon does.
  textTab: 'M6 20L12 4L18 20M8.3 14h7.4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.35a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.65 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.65a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.35 9c.68.26 1.56.9 1.56 1.56',
  heading: 'M6 4v16M18 4v16M6 12h12',
  // Same trap as divider/shapeLine: two tiles, one glyph. A smaller H, sitting
  // lower in the box, is the level difference drawn rather than asserted.
  subheading: 'M8 8v11M16 8v11M8 13.5h8',
  paragraph: 'M4 6h16M4 12h16M4 18h10',
  quote: 'M7 7a3 3 0 0 0-3 3v3h3l-2 4h3l2-4v-3a3 3 0 0 0-3-3zM17 7a3 3 0 0 0-3 3v3h3l-2 4h3l2-4v-3a3 3 0 0 0-3-3z',
  /* One full-width rule, nothing else. Bracketing it with stubs above and below
     was an attempt to draw what a divider separates, but at 23px the three
     horizontals read as Paragraph. The Line shape's glyph is diagonal, so a
     single horizontal doesn't collide with it either. */
  divider: 'M3 12h18',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  // Same three rules as `list`, with 1/2/3 drawn down the left instead of
  // bullets — the pair has to read as a pair at 15px in the List pills.
  listNumbered: 'M9 6h12M9 12h12M9 18h12M3.4 4.6l1.1-.6v4M3 11.3c.2-.5.7-.8 1.2-.8.7 0 1.2.4 1.2 1 0 1.1-2.4 1.4-2.4 2.9h2.5M3.1 16.6c.2-.4.7-.7 1.2-.7.7 0 1.1.4 1.1.9 0 .6-.4.9-1 .9.7 0 1.1.4 1.1 1 0 .6-.5 1-1.2 1-.6 0-1-.2-1.3-.6',
  /* A full-height bar with text beside it — the block's actual silhouette. The
     glyph before it was a rectangle with a line inside, drawn when an info box
     still had a 1px surround; once that came off in favour of fill-plus-left-bar
     the icon was describing a component we no longer ship. Nothing else in the
     editor uses a left bar now that quotes are set by indentation, so the shape
     is unambiguous. Ink, not blue: the fill is a property you pick per box
     (Info/Note/Warning, or any custom), so a permanently blue tile would be
     promising one of the three. */
  callout: 'M5 5v14M10 9.5h9M10 14.5h6',
  table: 'M3 4h18v16H3zM3 10h18M9 4v16',
  chart: 'M6 20v-7M12 20v-12M18 20v-4M3 20h18',
  chartLine: 'M2 20h20M4 16l5-6 4 3 6-8',
  chartPie: 'M12 3a9 9 0 1 0 9 9h-9z M13 3.5A8.5 8.5 0 0 1 20.5 11H13z',
  video: 'M4 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM22 8l-4 3 4 3V8z',
  audio: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  star: 'M12 2.5l3.09 6.26L22 9.77l-5 4.87L18.18 21.5 12 18.27 5.82 21.5 7 14.64l-5-4.87 6.91-1.01L12 2.5z',
  check: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 12l3 3 5-6',
  shapeRectangle: 'M4 5h16v14H4z',
  shapeEllipse: 'M4 12a8 8 0 1 0 16 0 8 8 0 1 0-16 0z',
  shapeTriangle: 'M12 4L20 19H4z',
  shapeLine: 'M5 19L19 5',
  // Sun + mountains, no frame — matches old Designrr's "Images" rail icon
  // (a landscape glyph, not a picture-frame-with-mountain like this used to
  // be). Shared with the Image insert tile, which means the same thing.
  image: 'M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM2 20l6-8 4 4 5-7 5 11z',
  cta: 'M2 5h13a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM4.5 8.5h8M14 14l8 3-3.3 1.2L17.5 21.5z',
  chapterBreak: 'M4 4h16v16H4zM4 12h16',
  bookTab: 'M2 4a1 1 0 0 1 1-1h6a4 4 0 0 1 4 4 4 4 0 0 1 4-4h6a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-6a4 4 0 0 0-4 3 4 4 0 0 0-4-3H3a1 1 0 0 1-1-1z',
  interactiveTab: 'M5 3l14 6-6 2-2 6z',
  // A page with text lines — matches old Designrr's "Templates" rail icon (a
  // document/card glyph), not a 4-quadrant dashboard grid.
  templatesTab: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 10h8M8 14h5',
  // Right-rail pair. An info-circle for Properties — reads as "about the selected
  // thing" without borrowing the gear (Book settings), sliders (looks like a
  // generic filter/equalizer), or the single-sheet glyph Templates already owns.
  // Stacked sheets for Pages, distinct from that single sheet.
  propertiesTab: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 16v-4M12 8h.01',
  pagesTab: 'M9 3h10a2 2 0 0 1 2 2v10M5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z',
  // Plain magnifier — deliberately not the zoom control's magnifier-with-a-plus,
  // which means "make the page bigger", not "find something in the book".
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.35-4.35',
  undo: 'M9 14l-4-4 4-4M5 10h9a5 5 0 0 1 0 10h-2',
  redo: 'M15 14l4-4-4-4M19 10h-9a5 5 0 0 0 0 10h2',
  wrapInline: 'M4 6h16M4 12h16M4 18h16',
  wrapLeft: 'M4 4h8v8H4zM14 6h6M14 10h6M4 16h16M4 20h10',
  wrapRight: 'M12 4h8v8h-8zM4 6h6M4 10h6M4 16h16M4 20h10',
  wrapFull: 'M3 5h18v6H3zM3 15h18M3 19h12',
  back: 'M19 12H5M12 5l-7 7 7 7',
  desktop: 'M3 4h18v12H3zM8 20h8M12 16v4',
  tablet: 'M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 19h2',
  mobile: 'M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 19h2',
  qrcode: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v3h-3M14 20h3M20 20v-3',
  textField: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM7 12h6',
  jumbotron: 'M3 5h18v14H3zM7 9h6M7 13h10',
  // Two free-floating bars read as a pause button on the rail. Framed, it reads
  // as a page split into columns — which is what the Layouts tab is.
  columns: 'M3 4h18v16H3zM12 4v16',
  imageGrid: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  checklist: 'M4 6h.01M4 12h.01M4 18h.01M9 6h11M9 12h11M9 18h11M3.5 6l1 1 1.5-2M3.5 12l1 1 1.5-2M3.5 18l1 1 1.5-2',
  signature: 'M4 15c1 0 2-1 3-4s1-5 0-5-2 3-1 7 2 4 4 4 3-2 5-2 2 1 3 1M4 19h16',
  /* Was a serif T — a generic "text tool" glyph that said nothing about this
     block, and a fourth letterform in a family that already had A (rail), H
     (heading) and a smaller H (subheading). Display text is oversized type, so
     the icon is the size contrast itself. Two alternatives lost on collision: a
     big line over body lines read as `paragraph`, and centred bars read as
     `alignCenter`. */
  displayText: 'M2 19L7 6l5 13M3.7 15h6.6M15 19l3.2-7.5L21.4 19M16.2 16.6h4.4',
  alignLeft: 'M17 10H3M21 6H3M21 14H3M17 18H3',
  alignCenter: 'M17 10H7M21 6H3M21 14H3M17 18H7',
  alignRight: 'M21 10H7M21 6H3M21 14H3M21 18H7',
  alignJustify: 'M21 10H3M21 6H3M21 14H3M21 18H3',
  // Clock face + counter-clockwise sweep — the top bar's "Version history" button.
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l4 2',
};

/* ── Insert panel content, curated and grouped (not one long flat scroll) ───── */
/* ── one size model for every block object ───────────────────────────────────
   Resizing used to be a property two nodes happened to have: photos and photo
   grids carried boxW/boxH and drag handles, and nothing else did — a chart was
   whatever width max-width:480px made it, a QR code was whatever its padding
   came to. These attributes give every remaining block object the same pair,
   through addGlobalAttributes rather than nine copies of the same code.

   The rendered width/height go out as one `style` fragment per attribute.
   mergeAttributes parses and merges `style` specially (it builds a property map
   rather than concatenating strings), so these compose cleanly with whatever
   style a node's own renderHTML already sets.

   Not on this list: `image` and `imageGridBlock`, which already have their own
   boxW/boxH with sizeMode and aspect-lock behaviour of their own, and
   `shapeBlock`, whose size participates in its generated geometry. */
const SIZEABLE_BLOCKS = ['embedBlock', 'qrCodeBlock', 'chartBlock', 'textFieldBlock', 'jumbotronBlock', 'columnsBlock', 'table'] as const;

/* Blocks whose height is set by what's inside them. Giving a fixed height to a
   box of text clips the text, so these offer width only — side handles rather
   than corners, and a Width field with no Height beside it. */
/* Selection kind -> node name, for the blocks the overlay resizes. Deliberately
   not every kind: image/imageGrid/shape host their own handles, and a footnote
   or notes section has no box to size. */
const RESIZE_OVERLAY_KINDS: Record<string, string> = {
  embed: 'embedBlock', qr: 'qrCodeBlock', chart: 'chartBlock',
  textfield: 'textFieldBlock', jumbotron: 'jumbotronBlock',
  columns: 'columnsBlock', table: 'table',
};

const WIDTH_ONLY_BLOCKS = new Set<string>(['textFieldBlock', 'jumbotronBlock', 'columnsBlock', 'table']);

/* addGlobalAttributes reaches renderHTML, which is what getHTML and the exports
   use — but a node with its own addNodeView builds its DOM by hand and never
   passes through it. These two do, so they apply the same pair themselves. */
function applyBlockSize(dom: HTMLElement, attrs: Record<string, unknown>) {
  const w = Number(attrs.boxW) || 0;
  const h = Number(attrs.boxH) || 0;
  dom.style.width = w > 0 ? `${w}px` : '';
  dom.style.height = h > 0 ? `${h}px` : '';
}

const BlockSize = Extension.create({
  name: 'blockSize',
  addGlobalAttributes() {
    const dim = (attr: string, css: string) => ({
      default: 0,
      parseHTML: (el: HTMLElement) => {
        const n = Number(el.getAttribute(`data-${attr}`));
        return Number.isFinite(n) && n > 0 ? n : 0;
      },
      renderHTML: (attrs: Record<string, unknown>) => {
        const v = Number(attrs[css === 'width' ? 'boxW' : 'boxH']);
        return v > 0 ? { [`data-${attr}`]: String(v), style: `${css}:${v}px` } : {};
      },
    });
    return [{ types: [...SIZEABLE_BLOCKS], attributes: { boxW: dim('w', 'width'), boxH: dim('h', 'height') } }];
  },
});

/* ── shape geometry ───────────────────────────────────────────────────────────
   Shapes stopped being literal path strings the moment a star needed a variable
   number of points and every polygon needed a corner radius: both change the
   path itself, so the path has to be generated from parameters rather than
   stored. A shape now carries WHAT IT IS (kind + sides/points) and the path is
   derived at render time, in one place used by the live canvas, the export and
   the panel tile alike.
   Literal paths haven't gone away — a heart, a speech bubble, a wave and a blob
   have no parameters worth exposing, so they stay kind:'path'. That's also the
   fallback for content written before this existed: no data-kind means the
   stored data-d is used as-is, so older books keep rendering. */
type ShapeKind = 'rect' | 'ellipse' | 'polygon' | 'star' | 'path';

/* Corners are rounded by pulling back along both edges and arcing between —
   one routine for rectangles, polygons and stars, because a star's points are
   just a polygon whose vertices alternate between two radii. A per-corner cap of
   half the shorter edge is what stops a big radius on a small shape from
   inverting the path into a bow-tie. */
function roundedPolyPath(pts: [number, number][], r: number): string {
  const n = pts.length;
  const f = (v: number) => Math.round(v * 100) / 100;
  if (r <= 0) return pts.map((q, i) => `${i ? 'L' : 'M'}${f(q[0])} ${f(q[1])}`).join('') + 'Z';
  let d = '';
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const v1x = prev[0] - cur[0];
    const v1y = prev[1] - cur[1];
    const v2x = next[0] - cur[0];
    const v2y = next[1] - cur[1];
    const l1 = Math.hypot(v1x, v1y) || 1;
    const l2 = Math.hypot(v2x, v2y) || 1;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const ax = cur[0] + (v1x / l1) * rr;
    const ay = cur[1] + (v1y / l1) * rr;
    const bx = cur[0] + (v2x / l2) * rr;
    const by = cur[1] + (v2y / l2) * rr;
    d += `${i ? 'L' : 'M'}${f(ax)} ${f(ay)}Q${f(cur[0])} ${f(cur[1])} ${f(bx)} ${f(by)}`;
  }
  return d + 'Z';
}

const SHAPE_VB = 24;
/* The most rounding a shape can take before its corners meet and the silhouette
   stops being the shape you picked. Half the circumradius, empirically. */
const SHAPE_MAX_ROUND = 5.5;
function ringPoints(count: number, outer: number, inner: number | null): [number, number][] {
  const c = SHAPE_VB / 2;
  const pts: [number, number][] = [];
  const total = inner == null ? count : count * 2;
  for (let i = 0; i < total; i++) {
    const rad = inner == null || i % 2 === 0 ? outer : inner;
    // -90deg start puts a vertex at the top, which is what makes a triangle
    // point up and a star sit the way anyone would draw one.
    const a = (-90 + (360 / total) * i) * (Math.PI / 180);
    pts.push([c + Math.cos(a) * rad, c + Math.sin(a) * rad]);
  }
  return pts;
}

interface ShapeGeom { kind: ShapeKind; d: string; sides: number; points: number; starRatio: number; cornerRadius: number }
function shapePath(g: ShapeGeom): string {
  const R = 11;
  const c = SHAPE_VB / 2;
  switch (g.kind) {
    case 'rect': {
      const m = 1.5;
      const box: [number, number][] = [[m, m], [SHAPE_VB - m, m], [SHAPE_VB - m, SHAPE_VB - m], [m, SHAPE_VB - m]];
      return roundedPolyPath(box, g.cornerRadius);
    }
    case 'ellipse':
      // The one shape with no corners to round, so cornerRadius is simply not
      // offered for it rather than silently ignored.
      return `M${c} ${c - R}a${R} ${R} 0 1 0 0 ${R * 2}a${R} ${R} 0 1 0 0-${R * 2}z`;
    case 'polygon':
      return roundedPolyPath(ringPoints(Math.max(3, g.sides), R, null), g.cornerRadius);
    case 'star':
      // Ratio is the inner vertices' radius as a share of the outer — the same
      // number Figma exposes on a star, and the one that turns the same point
      // count from a sharp star into a burst.
      return roundedPolyPath(ringPoints(Math.max(3, g.points), R, R * Math.min(0.95, Math.max(0.05, g.starRatio))), g.cornerRadius);
    default:
      return g.d;
  }
}

/* One colour for every shape. They used to ship six different hues — a gold star,
   a green check, a blue ellipse — which made the palette a property of WHICH shape
   you picked rather than a choice you made, and put six competing colours in one
   panel column. Near-black is the neutral start; colour is a decision for the
   inspector, on the shape you actually placed. */
const SHAPE_DEFAULT_COLOR = INK;

/* Seven was thin next to the real Designrr's own set (which adds a wave, a blob
   and a separate vertical rule) and thinner still next to what a page layout
   reaches for. Seventeen now, in four families: geometry, marks, rules, and the
   two organic shapes Designrr calls "random wave" and "random blob".
   "Rounded rectangle" is deliberately NOT one of them — corner radius is a
   control now, so shipping it as a separate shape would be the same duplication
   as a second tile that makes a list.
   The parametric ones carry their parameters, not a path (see shapePath): that's
   what lets a star have a point count and a polygon have rounded corners. The
   rest are literal paths because a heart has no parameters worth a control.
   Every literal path is CLOSED AND FILLABLE, which the old arrow and checkmark
   were not — the shape renders `<svg fill=…>`, so an open stroke path like
   'M5 12h14M13 6l6 6-6 6' came out as a degenerate sliver rather than an arrow. */
interface ShapeDef { id: string; label: string; kind: ShapeKind; d?: string; sides?: number; points?: number; starRatio?: number; color: string }
const SHAPE_LIBRARY: ShapeDef[] = [
  // Geometry — generated, so corner radius and side count are live controls
  { id: 'rectangle', label: 'Rectangle', kind: 'rect', color: SHAPE_DEFAULT_COLOR },
  { id: 'ellipse', label: 'Ellipse', kind: 'ellipse', color: SHAPE_DEFAULT_COLOR },
  { id: 'triangle', label: 'Triangle', kind: 'polygon', sides: 3, color: SHAPE_DEFAULT_COLOR },
  { id: 'diamond', label: 'Diamond', kind: 'polygon', sides: 4, color: SHAPE_DEFAULT_COLOR },
  { id: 'pentagon', label: 'Pentagon', kind: 'polygon', sides: 5, color: SHAPE_DEFAULT_COLOR },
  { id: 'hexagon', label: 'Hexagon', kind: 'polygon', sides: 6, color: SHAPE_DEFAULT_COLOR },
  { id: 'octagon', label: 'Octagon', kind: 'polygon', sides: 8, color: SHAPE_DEFAULT_COLOR },
  // 0.382 is the golden-ratio pentagram, which is the star anyone draws by hand
  // and the proportion Figma ships as its own default.
  { id: 'star', label: 'Star', kind: 'star', points: 5, starRatio: 0.382, color: SHAPE_DEFAULT_COLOR },
  // A burst is the same construction with shallow points and a lot of them.
  { id: 'burst', label: 'Burst', kind: 'star', points: 12, starRatio: 0.76, color: SHAPE_DEFAULT_COLOR },
  // Marks — fixed silhouettes
  { id: 'arrow', label: 'Arrow', kind: 'path', d: 'M2 9.5h11V4l9 8-9 8v-5.5H2z', color: SHAPE_DEFAULT_COLOR },
  { id: 'chevron', label: 'Chevron', kind: 'path', d: 'M5 2l11 10L5 22l-3-2.8L10.5 12 2 4.8z', color: SHAPE_DEFAULT_COLOR },
  { id: 'heart', label: 'Heart', kind: 'path', d: 'M12 21.3S3 15.6 3 9.8A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 9 2.8c0 5.8-9 11.5-9 11.5z', color: SHAPE_DEFAULT_COLOR },
  { id: 'check', label: 'Checkmark', kind: 'path', d: 'M9.2 19.6L2 12.4l3.1-3.1 4.1 4.1L18.9 3.6 22 6.7z', color: SHAPE_DEFAULT_COLOR },
  { id: 'plus', label: 'Plus', kind: 'path', d: 'M9.5 2h5v7.5H22v5h-7.5V22h-5v-7.5H2v-5h7.5z', color: SHAPE_DEFAULT_COLOR },
  { id: 'speech', label: 'Speech bubble', kind: 'path', d: 'M4 3h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7.5L7 21v-5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', color: SHAPE_DEFAULT_COLOR },
  // Organic
  { id: 'wave', label: 'Wave', kind: 'path', d: 'M2 8.5c3.3-4.5 6.7-4.5 10 0s6.7 4.5 10 0v7c-3.3 4.5-6.7 4.5-10 0s-6.7-4.5-10 0z', color: SHAPE_DEFAULT_COLOR },
  { id: 'blob', label: 'Blob', kind: 'path', d: 'M17.4 3.6c2.9 2.1 4.5 5.8 3.6 9.1s-4 6.3-7.6 7.3-7.5.1-9.6-2.7S2.4 10 3.8 6.8 8.9 1.6 12.2 1.8s3.7.6 5.2 1.8z', color: SHAPE_DEFAULT_COLOR },
];

/* Sharp by default, for every kind. An earlier version pre-rounded generated
   polygons and stars slightly, on the grounds that needle points read as a
   rendering artefact at small sizes — but it meant a freshly placed star opened
   showing "11%" in a field nobody had touched, which is worse: the number you
   see should be the number you set. */
function defaultRadiusFor(_kind: ShapeKind): number { return 0; }

/* Defaults for reading a shape's attributes back out. getAttributes returns {}
   when nothing is selected and can be missing keys on content written before an
   attribute existed, so every read is spread over these rather than guarded at
   each use. */
const SHAPE_FALLBACK: ShapeAttrs = {
  kind: 'path', d: '', sides: 4, points: 5, starRatio: 0.382, cornerRadius: 0,
  color: SHAPE_DEFAULT_COLOR, borderWidth: 0, borderColor: INK, borderStyle: 'solid',
  boxW: 0, boxH: 0, lockAspect: false, locked: false,
};

function shapeDefGeom(sh: ShapeDef): ShapeGeom {
  return {
    kind: sh.kind, d: sh.d ?? '', sides: sh.sides ?? 4, points: sh.points ?? 5,
    starRatio: sh.starRatio ?? 0.382, cornerRadius: defaultRadiusFor(sh.kind),
  };
}


/* Old Designrr's Image Grid blocks drop in real images, not empty placeholders —
   reuses the same curated stock library the Media panel and Image inspector do. */
function gridFig(src: string): string {
  return `<figure data-wrap="inline" class="book-img-wrap book-img-wrap--inline"><img src="${src}" alt="" /></figure>`;
}
const GRID_IMGS = STOCK_IMAGES.filter((s) => s.label !== 'Minimalist desk (default)').map((s) => s.src);

// `color` previews the tile's actual insert colour. Only Shapes set it, and they
// all now set the same near-black (SHAPE_DEFAULT_COLOR) — it stays a per-tile
// field rather than a constant so a shape that ever wants its own default can
// have one without changing the tile renderer.
interface InsertTile { id: string; label: string; icon: string; group: 'Text' | 'Shapes' | 'Layout' | 'Interactive' | 'Worksheets' | 'Charts' | 'Media' | 'TextStyles'; requiredPlan?: GateTier; html: string; color?: string; outline?: boolean }

/* ── why this panel has no colour code ───────────────────────────────────────
   Tried and cut: one hue per section (from CHART_PALETTE), shown as a dot beside
   each section header and a wash over that section's wells. It did differentiate
   the groups, but it bought that with six colours to learn, on a surface whose
   job is to stay out of the way of the book being made — and the structure reads
   without it. What actually separates a tool from its neighbour here is the
   section header, the recessed well, the label sitting outside the well, and a
   real preview wherever the tile has content worth previewing. Colour was a
   fifth signal stacked on four that were already doing the work.

   So: one well treatment for every tile in every section. The only colour left
   in the grid is colour that MEANS something — a shape tile showing the real
   fill it inserts, and a preview showing real book content. ───────────────── */
/* The tile is a filled well, not an outlined card. The panel is white, so the
   well is a step DOWN from it — a control recessed into the surface. The version
   this replaced was a white card with a 1px hairline ON a white panel, which is
   ~1.2:1 against its own background: at a squint the whole grid read as one flat
   sheet, whatever was drawn inside it. A fill at this contrast does the same job
   the hairline was failing to do, and frees white to mean one thing (see
   WELL_PAGE). */
const WELL_BG = '#F1F3F7';
/* White means exactly one thing inside a well: a miniature page. A column split,
   a table, a checklist and a weekly planner all preview REAL book content, and a
   book page is white — so they sit on a small white sheet inside the grey well.
   That reads even on a white panel, because the well behind it is not white. */
const WELL_PAGE = '#FFFFFF';
/* The edge on a raised tile. One step darker than the panel's own BORDER, which
   is tuned for rules and inputs sitting on white and goes invisible when it has
   to hold a 62px card against the same white. */
const TILE_STROKE = '#D3DAE3';

/* A group is badged once, on its section header, when EVERY gated tile in it
   shares one tier — which is how Flipsnack marks "Multimedia · Professional"
   instead of stamping a pill on each tile. Mixed or partial groups keep their
   per-tile badges, because one header pill would then be lying about the tiles
   that aren't gated. */
/* Display names for the section headers. The group ids double as headings
   everywhere else, but two of them read wrong on their own: 'Layout' is singular
   under a rail tab called Layouts, and 'TextStyles' isn't a phrase. */
const GROUP_HEADINGS: Partial<Record<InsertTile['group'], string>> = {
  Layout: 'Layouts',
  TextStyles: 'Text styles',
};

function groupGate(group: InsertTile['group']): GateTier | null {
  const tiles = INSERT_TILES.filter((t) => t.group === group);
  const gated = tiles.filter((t) => t.requiredPlan);
  if (!gated.length || gated.length !== tiles.length) return null;
  const first = gated[0].requiredPlan!;
  return gated.every((t) => t.requiredPlan === first) ? first : null;
}
const INSERT_TILES: InsertTile[] = [
  { id: 'heading', label: 'Heading', icon: ICONS.heading, group: 'Text', html: '<h3>New heading</h3>' },
  { id: 'subheading', label: 'Subheading', icon: ICONS.subheading, group: 'Text', html: '<h4>New subheading</h4>' },
  { id: 'paragraph', label: 'Paragraph', icon: ICONS.paragraph, group: 'Text', html: '<p>New paragraph text.</p>' },
  { id: 'quote', label: 'Quote', icon: ICONS.quote, group: 'Text', html: '<blockquote>A pulled quote.</blockquote>' },
  /* One tile, three looks. Note/Tip/Warning are the same block with a different
     colour, so three tiles spent three slots on what is really one property —
     and Properties has to carry the switcher regardless, or picking the wrong
     one would be a one-way door.
     The class is spelled out here as well as in renderHTML because the panel's
     tile preview injects this raw string straight into the DOM — it never goes
     through TipTap, so a callout without it previewed as a blank white box. */
  { id: 'callout', label: 'Info box', icon: ICONS.callout, group: 'Text', html: '<div data-callout="true" data-callout-type="note" class="book-callout book-callout--note"><p>Something worth knowing before you go on.</p></div>' },
  /* Author name is gone from here on purpose. It shipped twice under one id — as
     this tile (literal "By Author Name" text) and as the [Author name] dynamic
     field — and a merge token is the one that stays right when the book's author
     changes. The italic centred styling this tile carried is still reachable:
     it's a paragraph, and Text styles has the named presets. */
  /* Display text is gone from this grid. It was the third way to say "make this
     line big and distinctive" — after Heading and the seven text-style presets,
     which now apply to a paragraph you've already written rather than only
     inserting a new one — and the one with no semantics behind it: a big
     centred line that carries no heading level never reaches the outline, the
     EPUB nav or a screen reader's heading list, so reaching for it when you
     meant a subheading quietly degrades the book's navigation. This editor
     already refuses to let heading levels skip; shipping the escape hatch
     alongside that was working both sides.

     `.book-display-text` itself stays, here and in epub.ts, and stays in
     MOVABLE_PARAGRAPH_CLASSES: books already containing one keep rendering and
     rearranging it exactly as before. Only the way to make a NEW one is gone,
     and Font size + Alignment in the properties panel now cover the case that
     justified it (a dedication or an epigraph, which are genuinely not
     headings). */
  
  /* Video and audio sit with the other live-only blocks (CTA, text field, QR) rather
     than under Photos. They do nothing in PDF, EPUB or Kindle — which is the bulk of
     what ships — so grouping them with the photo picker oversold them and made the
     Photos tab's name stop describing its contents. "Interactive" is the honest
     label: things that only do something in the live/flipbook version. */
  /* Their own group, and never passed to an InsertPanel as a browsable one: in the
     Elements index Video and Audio are top-level rows that open their source
     picker directly, because a category page holding a single tile you then have
     to click is a layer that does nothing. They stay in INSERT_TILES so search
     still finds them ("youtube", "podcast"), and a search hit routes to the same
     picker. */
  { id: 'video', label: 'Video', icon: ICONS.video, group: 'Media', html: '__EMBED_VIDEO__' },
  { id: 'audio', label: 'Audio', icon: ICONS.audio, group: 'Media', html: '__EMBED_AUDIO__' },
  /* Derived from SHAPE_LIBRARY rather than restated: the two lists have to agree
     on geometry, colour and label (the inspector's shape switcher matches an
     inserted shape back to the library by its id), and seventeen hand-copied
     duplicates is seventeen chances for them to drift apart.
     `icon` is the GENERATED path, so the tile draws exactly the silhouette the
     insert produces — including the default corner rounding on the polygons. */
  /* Every shape twice: filled, then the same silhouette as an outline. An outline
     is not a different shape — it's this shape with the fill taken off and a
     stroke put on, which the node has always been able to express (color:'none'
     + borderWidth) and the inspector can now turn on and off either way. Shipping
     it as a tile is what saves you placing a black rectangle and then hunting for
     two controls to make the hollow one you wanted.
     Each outline sits immediately after its solid rather than in a block of its
     own, so the pair stays adjacent whatever width the grid wraps at. */
  ...SHAPE_LIBRARY.flatMap((sh): InsertTile[] => {
    const g = shapeDefGeom(sh);
    const attrs = `data-kind="${sh.kind}" data-d="${sh.d ?? ''}" data-sides="${g.sides}" data-points="${g.points}" data-ratio="${g.starRatio}" data-radius="${g.cornerRadius}" data-w="${SHAPE_DEFAULT_PX}" data-h="${SHAPE_DEFAULT_PX}"`;
    return [
      {
        id: `shape-${sh.id}`,
        label: sh.label,
        icon: shapePath(g),
        group: 'Shapes',
        color: sh.color,
        html: `<div data-shape="true" ${attrs} data-color="${sh.color}"></div>`,
      },
      {
        id: `shape-${sh.id}-outline`,
        label: `${sh.label} outline`,
        icon: shapePath(g),
        group: 'Shapes',
        color: sh.color,
        outline: true,
        /* 2px against the 96px default box. The stroke is centred on the path, so
           a heavier weight would sit half outside the viewBox on every shape that
           runs to its edge and come back visibly clipped. */
        html: `<div data-shape="true" ${attrs} data-color="none" data-bw="2" data-bc="${sh.color}"></div>`,
      },
    ];
  }),
  { id: 'columns-2', label: '2 columns', icon: ICONS.columns, group: 'Layout', html: '<div data-columns="2" class="book-columns book-columns--2"><p>First column of flowing text.</p><p>It keeps going here, wrapping automatically into the next column.</p></div>' },
  { id: 'columns-3', label: '3 columns', icon: ICONS.columns, group: 'Layout', html: '<div data-columns="3" class="book-columns book-columns--3"><p>First column of flowing text.</p><p>It keeps going here, wrapping automatically into the next column, then the next.</p></div>' },
  { id: 'columns-4', label: '4 columns', icon: ICONS.columns, group: 'Layout', html: '<div data-columns="4" class="book-columns book-columns--4"><p>First column of flowing text.</p><p>It keeps going here, wrapping automatically across all four columns.</p></div>' },
  // Unlike the equal-width columns above (one flowing text stream split by CSS
  // column-count, which has no per-column width control), these are two genuinely
  // separate, independently-edited regions — reuses the Table extension (already
  // registered) as a plain 1-row, 2-cell layout rather than a new node type; see
  // .book-split-columns below for the width ratio and the stripped table chrome.
  { id: 'columns-1-3', label: '2 cols (1:3)', icon: ICONS.columns, group: 'Layout', html: '<table class="book-split-columns book-split-columns--1-3"><tbody><tr><td><p>Narrower column.</p></td><td><p>Wider column, for the main flow of text.</p></td></tr></tbody></table>' },
  { id: 'columns-3-1', label: '2 cols (3:1)', icon: ICONS.columns, group: 'Layout', html: '<table class="book-split-columns book-split-columns--3-1"><tbody><tr><td><p>Wider column, for the main flow of text.</p></td><td><p>Narrower column.</p></td></tr></tbody></table>' },
  { id: 'image-grid-2', label: 'Image grid (2)', icon: ICONS.imageGrid, group: 'Layout', html: `<div data-image-grid="true" data-cols="2" class="book-image-grid book-image-grid--2">${gridFig(GRID_IMGS[0])}${gridFig(GRID_IMGS[1])}</div>` },
  { id: 'image-grid-3', label: 'Image grid (3)', icon: ICONS.imageGrid, group: 'Layout', html: `<div data-image-grid="true" data-cols="3" class="book-image-grid book-image-grid--3">${gridFig(GRID_IMGS[0])}${gridFig(GRID_IMGS[1])}${gridFig(GRID_IMGS[2])}</div>` },
  { id: 'image-grid-4', label: 'Image grid (4)', icon: ICONS.imageGrid, group: 'Layout', html: `<div data-image-grid="true" data-cols="4" class="book-image-grid book-image-grid--4">${gridFig(GRID_IMGS[0])}${gridFig(GRID_IMGS[1])}${gridFig(GRID_IMGS[2])}${gridFig(GRID_IMGS[3])}</div>` },
  /* Filed under Layouts, not Text. Old Designrr lists Divider in its Text menu,
     but nothing about a rule is text: it carries no words, takes no font, and
     what it does — mark where one section stops and the next starts — is the
     same job the columns and grids beside it do. Text is now only things you
     type into. */
  { id: 'divider', label: 'Divider', icon: ICONS.divider, group: 'Layout', html: '<hr>' },
  { id: 'cta', label: 'Call to action', icon: ICONS.cta, group: 'Interactive', requiredPlan: 'pro', html: '<p><strong>Get the companion workbook →</strong></p>' },
  { id: 'jumbotron', label: 'Inline CTA', icon: ICONS.jumbotron, group: 'Interactive', requiredPlan: 'pro', html: '<div data-jumbotron="true" data-bg="#EEF3FF"><div data-jb-heading="true">Get the companion workbook</div><div data-jb-body="true">A short line of supporting copy.</div><div data-jb-button="true">Get it now</div></div>' },
  { id: 'text-field', label: 'Text field', icon: ICONS.textField, group: 'Interactive', html: '<div data-textfield="true" data-label="Your name"></div>' },
  { id: 'qr-code', label: 'QR code', icon: ICONS.qrcode, group: 'Interactive', requiredPlan: 'pro', html: '<div data-qr="true" data-url="https://example.com" data-color="#15191F"></div>' },
  // The two general-purpose structured-content tools, ahead of the more
  // specific worksheet templates below (which are really just their own
  // preset tables/lists anyway — Weekly planner/Budget tracker/Calendar are
  // all literally <table> markup).
  // Empty cells, not "Column A / Row 1" placeholders: every other tile here
  // ships sample content because the sample IS the thing (a CTA needs words, a
  // chart needs points), but a table's content is always the author's and
  // placeholder text in it only has to be deleted. Clicking this tile opens a
  // size picker (TableGridPicker) rather than inserting; the markup below is
  // the drag-and-drop default for when nobody was asked.
  { id: 'table', label: 'Table', icon: ICONS.table, group: 'Worksheets', html: tableHtml(3, 2, true) },
  { id: 'checklist', label: 'Checklist', icon: ICONS.checklist, group: 'Worksheets', html: '<ul class="book-checklist"><li>☐ First task</li><li>☐ Second task</li><li>☐ Third task</li></ul>' },
  { id: 'questions', label: 'Questions', icon: ICONS.list, group: 'Worksheets', html: '<p><strong>1.</strong> Type your question here.</p><p class="book-answer-line">&nbsp;</p><p><strong>2.</strong> Another question.</p><p class="book-answer-line">&nbsp;</p><p><strong>3.</strong> One more question.</p><p class="book-answer-line">&nbsp;</p>' },
  { id: 'weekly-planner', label: 'Weekly planner', icon: ICONS.table, group: 'Worksheets', html: '<table><tbody><tr><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></tbody></table>' },
  { id: 'budget', label: 'Budget tracker', icon: ICONS.table, group: 'Worksheets', html: '<table><tbody><tr><th>Category</th><th>Budgeted</th><th>Actual</th><th>Difference</th></tr><tr><td>Housing</td><td></td><td></td><td></td></tr><tr><td>Food</td><td></td><td></td><td></td></tr><tr><td>Savings</td><td></td><td></td><td></td></tr></tbody></table>' },
  { id: 'calendar', label: 'Calendar', icon: ICONS.table, group: 'Worksheets', html: '<table><tbody><tr><th>S</th><th>M</th><th>T</th><th>W</th><th>T</th><th>F</th><th>S</th></tr><tr><td></td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td></tr><tr><td>7</td><td>8</td><td>9</td><td>10</td><td>11</td><td>12</td><td>13</td></tr><tr><td>14</td><td>15</td><td>16</td><td>17</td><td>18</td><td>19</td><td>20</td></tr><tr><td>21</td><td>22</td><td>23</td><td>24</td><td>25</td><td>26</td><td>27</td></tr></tbody></table>' },
  /* Charts are their own group inside Elements, not a tile filed under
     Worksheets. A chart isn't a worksheet: everything else in that group is
     something the READER fills in or works through, while a chart is finished
     data they only read. It stays a group rather than a rail tab of its own —
     three tiles don't earn a top-level slot, and Elements is where placed objects
     already live.
     Splitting it by type is the other half: the node already supports
     bar/line/pie through data-type, but a single Chart tile always dropped a bar
     chart and left you to find the type switch in the inspector afterwards.
     Worth knowing if this ever gets cut back — the inventory of the real, live
     Designrr editor found no chart tool anywhere (not under Elements, Worksheet
     Elements, Layouts, Artwork or Text), so this is a net-new capability here
     rather than a rebuild of something that already ships. */
  { id: 'chart-bar', label: 'Bar chart', icon: ICONS.chart, group: 'Charts', html: '<div data-chart="true" data-type="bar" data-color="#006EFE" data-points="[{&quot;label&quot;:&quot;Q1&quot;,&quot;value&quot;:12},{&quot;label&quot;:&quot;Q2&quot;,&quot;value&quot;:19},{&quot;label&quot;:&quot;Q3&quot;,&quot;value&quot;:8},{&quot;label&quot;:&quot;Q4&quot;,&quot;value&quot;:15}]"></div>' },
  { id: 'chart-line', label: 'Line chart', icon: ICONS.chartLine, group: 'Charts', html: '<div data-chart="true" data-type="line" data-color="#006EFE" data-points="[{&quot;label&quot;:&quot;Q1&quot;,&quot;value&quot;:12},{&quot;label&quot;:&quot;Q2&quot;,&quot;value&quot;:19},{&quot;label&quot;:&quot;Q3&quot;,&quot;value&quot;:8},{&quot;label&quot;:&quot;Q4&quot;,&quot;value&quot;:15}]"></div>' },
  { id: 'chart-pie', label: 'Pie chart', icon: ICONS.chartPie, group: 'Charts', html: '<div data-chart="true" data-type="pie" data-color="#006EFE" data-points="[{&quot;label&quot;:&quot;Direct&quot;,&quot;value&quot;:38},{&quot;label&quot;:&quot;Search&quot;,&quot;value&quot;:29},{&quot;label&quot;:&quot;Social&quot;,&quot;value&quot;:21},{&quot;label&quot;:&quot;Email&quot;,&quot;value&quot;:12}]"></div>' },

  // Text styles — named presets with a fixed look, unlike Author name/Display
  // text above (which read the *active theme's* font/color, so they can't
  // hold a distinct identity of their own). group: 'TextStyles' keeps them out
  // of the plain Text tab's icon grid — InsertPanel renders them as their own
  // card grid (see TEXT_STYLES/TextStyleCards below) directly under the Text
  // group's tiles, with a richer card that renders each preset's real
  // typography instead of an icon — same "show a real rendered sample, never
  // an abstract icon" principle the Templates cards already use.
  // insertAtPointer/onDrop need no changes: both already resolve any dropped
  // tile generically via INSERT_TILES.find(t => t.id === type).
  { id: 'textstyle-manuscript', label: 'Manuscript', icon: ICONS.displayText, group: 'TextStyles', html: '<p class="book-textstyle--manuscript">Manuscript</p>' },
  { id: 'textstyle-statement', label: 'Statement', icon: ICONS.displayText, group: 'TextStyles', html: '<p class="book-textstyle--statement">Statement</p>' },
  { id: 'textstyle-whisper', label: 'Whisper', icon: ICONS.displayText, group: 'TextStyles', html: '<p class="book-textstyle--whisper">Whisper</p>' },
  { id: 'textstyle-rosewood', label: 'Rosewood', icon: ICONS.displayText, group: 'TextStyles', html: '<p class="book-textstyle--rosewood">Rosewood</p>' },
  { id: 'textstyle-marquee', label: 'Marquee', icon: ICONS.displayText, group: 'TextStyles', html: '<p class="book-textstyle--marquee">Marquee</p>' },
  { id: 'textstyle-gilded', label: 'Gilded', icon: ICONS.displayText, group: 'TextStyles', html: '<p class="book-textstyle--gilded">Gilded</p>' },
  { id: 'textstyle-typewriter', label: 'Typewriter', icon: ICONS.displayText, group: 'TextStyles', html: '<p class="book-textstyle--typewriter">Typewriter</p>' },
];

/* Extra search terms per tile, for the words people actually type that aren't in
   the label. Without these a search is just a substring test on a name you'd have
   to already know — "hr" wouldn't find Divider, "youtube" wouldn't find Video, and
   "graph" wouldn't find any of the three charts. Labels and group names are
   searched too, so these only carry the synonyms. */
const SEARCH_ALIASES: Record<string, string> = {
  heading: 'h3 section title',
  subheading: 'h4 subhead sub section title',
  paragraph: 'body copy text',
  quote: 'blockquote pullquote pull citation',
  divider: 'line rule hr separator break horizontal',
  /* The node, class and data attributes are still `callout` throughout: that's
     the term Atticus and Reedsy Studio both use, it's what every book already
     saved on disk says, and renaming it would orphan that content for a label
     change. Only the label people read is "Info box". "callout" stays first in
     the aliases so anyone who knows the old name still finds it. */
  callout: 'callout note tip warning caution hint box admonition aside panel',

  video: 'youtube vimeo embed movie mp4 clip media',
  audio: 'podcast sound music mp3 voice media',
  cta: 'call action button link convert',
  jumbotron: 'banner hero well box cta convert',
  'text-field': 'form input fillable blank fill response',
  'qr-code': 'qr scan code link convert',
  table: 'grid rows columns cells spreadsheet sheet data',
  'chart-bar': 'graph plot data bars column',
  'chart-line': 'graph plot data trend time series',
  'chart-pie': 'graph plot data donut share split',
  checklist: 'todo tasks tickbox checkbox worksheet',
  questions: 'quiz prompts answers worksheet exercise',
  'weekly-planner': 'schedule week agenda planner worksheet',
  budget: 'finance money expenses tracker worksheet',
  calendar: 'month dates days schedule worksheet',
};
/* Families where every tile wants the same synonyms — spelling out three image
   grids, five column splits, seven shapes and seven text styles by id would be
   22 near-identical lines. */
const SEARCH_ALIAS_PREFIXES: [string, string][] = [
  ['image-grid-', 'photo photos pictures images gallery grid layout'],
  ['columns-', 'column split layout flow text'],
  ['shape-', 'shape'],
  ['textstyle-', 'font type style preset'],
];
function tileMatches(tile: InsertTile, q: string): boolean {
  const prefixed = SEARCH_ALIAS_PREFIXES.filter(([k]) => tile.id.startsWith(k)).map(([, v]) => v).join(' ');
  const hay = `${tile.label} ${tile.group} ${SEARCH_ALIASES[tile.id] ?? ''} ${prefixed}`.toLowerCase();
  /* Matched against the START of each word, not anywhere in the string. A plain
     substring test looks reasonable and quietly isn't: "graph" pulled in
     Paragraph, and "line" pulled in Author name, Display text and Inline CTA
     through byline/headline/inline. Prefixes still let a half-typed word narrow
     as you go, which is the behaviour a search field is judged on. */
  const words = hay.split(/[^a-z0-9]+/).filter(Boolean);
  // Every term has to land somewhere, so "pie chart" and "chart pie" both work
  // and neither matches all three charts the way an any-term test would.
  return q.split(/\s+/).every((t) => words.some((w) => w.startsWith(t)));
}

/* Drives both the drag-insert HTML above (via the matching `.book-textstyle--*`
   classes, hardcoded below — not theme-interpolated) and TextStyleCards'
   card previews, so the card a user drags always looks exactly like what
   lands in the chapter. */
interface TextStyleDef {
  id: string;
  name: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  fontWeight?: number;
  fontStyle?: 'italic';
  letterSpacing?: string;
  textTransform?: 'uppercase';
}
const TEXT_STYLES: TextStyleDef[] = [
  { id: 'manuscript', name: 'Manuscript', fontFamily: "'Newsreader', Georgia, serif", fontSize: 19, color: '#3A3F47', fontStyle: 'italic' },
  { id: 'statement', name: 'Statement', fontFamily: "'Syne', sans-serif", fontSize: 22, color: '#15191F', fontWeight: 800, letterSpacing: '-0.01em' },
  { id: 'whisper', name: 'Whisper', fontFamily: "'Manrope', sans-serif", fontSize: 12.5, color: '#8A93A3', letterSpacing: '0.16em', textTransform: 'uppercase' },
  { id: 'rosewood', name: 'Rosewood', fontFamily: "'Parisienne', cursive", fontSize: 30, color: '#9F2B4C' },
  { id: 'marquee', name: 'Marquee', fontFamily: "'Anton', sans-serif", fontSize: 23, color: '#D4425E', letterSpacing: '0.02em', textTransform: 'uppercase' },
  { id: 'gilded', name: 'Gilded', fontFamily: "'Newsreader', Georgia, serif", fontSize: 20, color: '#A9812F' },
  { id: 'typewriter', name: 'Typewriter', fontFamily: "'Courier Prime', monospace", fontSize: 15, color: '#3A3F47' },
];

/* ── one TipTap editor instance per chapter — one real document tree per
   chapter, not fragmented per-paragraph editors ──────────────────────────── */
function countMissingAlt(node: { type?: string; attrs?: { alt?: string; decorative?: boolean }; content?: unknown[] }): number {
  let count = 0;
  // A decorative image is deliberately empty-alt'd, which is the correct WCAG
  // treatment — counting it as missing left the check impossible to satisfy.
  if (node.type === 'image' && !node.attrs?.decorative && !node.attrs?.alt?.trim()) count += 1;
  if (Array.isArray(node.content)) {
    for (const child of node.content) count += countMissingAlt(child as typeof node);
  }
  return count;
}

/* Whether a level-2 heading exists anywhere before the current selection in this
   chapter — the check behind "no skipping heading levels," enforced quietly rather
   than left to visual choice, per the accessibility requirement named repeatedly
   in the research this editor is built from. */
/* Which discrete object (if any) the selection is currently on — drives both the
   right-panel Inspector and whether the floating text toolbar should hide itself. */
function activeObjectKind(editor: Editor): 'image' | 'imageGrid' | 'shape' | 'embed' | 'qr' | 'chart' | 'divider' | 'textfield' | 'jumbotron' | 'columns' | 'table' | 'footnote' | 'footnotesSection' | null {
  // A selected CELL reports as 'image' (the image node is active inside the
  // grid); the grid only reports as itself when the grid node is what's
  // selected, which is the first click — see handleClickOn's two-stage select.
  if (editor.isActive('image')) return 'image';
  if (editor.isActive('imageGridBlock')) return 'imageGrid';
  if (editor.isActive('shapeBlock')) return 'shape';
  if (editor.isActive('embedBlock')) return 'embed';
  if (editor.isActive('qrCodeBlock')) return 'qr';
  if (editor.isActive('chartBlock')) return 'chart';
  // A leaf, so clicking it already dispatched a NodeSelection (handleClickOn) —
  // it just had nothing keyed off that: no ring, no floating bar, no handle, and
  // no Properties branch. Backspace was the only way to remove one.
  if (editor.isActive('horizontalRule')) return 'divider';
  if (editor.isActive('footnoteRef')) return 'footnote';
  if (editor.isActive('textFieldBlock')) return 'textfield';
  if (editor.isActive('jumbotronBlock')) return 'jumbotron';
  // Order matters: a table nested inside a columns block should report as
  // itself, not as the outer container, so this comes before columnsBlock.
  if (editor.isActive('table')) return 'table';
  if (editor.isActive('columnsBlock')) return 'columns';
  if (editor.isActive('orderedList', { class: 'book-footnotes' })) return 'footnotesSection';
  return null;
}

/* Node types the Insert panel can drop in — the only ones that get a drag handle
   for repositioning after the fact. Plain paragraphs/headings are left out so
   normal prose editing doesn't sprout a handle on every line. */
const MOVABLE_NODE_TYPES = new Set([
  'image', 'shapeBlock', 'embedBlock', 'qrCodeBlock', 'textFieldBlock',
  'jumbotronBlock', 'columnsBlock', 'imageGridBlock', 'table', 'callout', 'blockquote', 'chartBlock',
  // Dropped by the Divider, List and Checklist tiles. Each is one discrete
  // structural block, not a line of body copy, so the "don't sprout a handle on
  // every line" objection above doesn't reach them — and without a handle they
  // were the only Insert-panel tiles that couldn't be repositioned after landing.
  'horizontalRule', 'bulletList', 'orderedList',
]);

/* Paragraphs stay out of the set above so ordinary prose gets no handle — but
   the Insert panel drops several things that ARE paragraphs (Author name,
   Display text, and every text style), and those are placed design objects, not
   body copy. A paragraph earns a handle only by carrying one of their classes. */
const MOVABLE_PARAGRAPH_CLASSES = ['book-author-name', 'book-display-text', 'book-textstyle--'];

/* The notes list is derived from the footnote markers in the prose — order,
   contents and whether it exists at all are all set by them. Moving, duplicating
   or deleting it as a block would only desync it from the markers, which is
   where that edit actually belongs (FootnotesSectionInspector says as much), so
   it's held out of both block affordances. */
function isFootnotesList(node: PMNode): boolean {
  const cls = node.attrs.class;
  return typeof cls === 'string' && cls.includes(FOOTNOTE_LIST_CLASS);
}

function isMovableBlock(node: PMNode): boolean {
  if (isFootnotesList(node)) return false;
  if (MOVABLE_NODE_TYPES.has(node.type.name)) return true;
  const cls = node.attrs.class;
  return node.type.name === 'paragraph' && typeof cls === 'string'
    && MOVABLE_PARAGRAPH_CLASSES.some((c) => cls.includes(c));
}

/* Top-level nodes that already carry their own click-to-select floating bar (see
   activeObjectKind/blockBar) — BlockActionBar stays off them so one block never
   draws two bars, or offers Duplicate/Delete twice. */
const BAR_OWNED_NODE_TYPES = new Set([
  'image', 'imageGridBlock', 'shapeBlock', 'embedBlock', 'qrCodeBlock', 'chartBlock',
  'textFieldBlock', 'jumbotronBlock', 'columnsBlock', 'table', 'horizontalRule',
]);

/* Whether the hover/caret action bar belongs on this top-level node. The test used to
   be `node.isTextblock`, which quietly excluded every block that wraps its text
   in a child paragraph — a pull-quote, a callout, a list, a checklist — leaving
   exactly those with no block-level actions at all: no menu, and no floating bar
   either, since they deliberately stay out of activeObjectKind so a caret inside
   them still reaches TextInspector. The rule is now the inverse and complete:
   any top-level block gets the menu except the ones a floating bar already owns. */
function hasBlockMenu(node: PMNode | null | undefined): node is PMNode {
  if (!node || !node.isBlock) return false;
  if (BAR_OWNED_NODE_TYPES.has(node.type.name)) return false;
  return !isFootnotesList(node);
}

/* Shared by the Insert-panel drop flow and the move-drag flow, so a dragged
   object always lands exactly where an inserted one would: snapped to the
   nearer edge of whatever block the pointer is over, never splitting it. */
function resolveDropPosition(editor: Editor, clientX: number, clientY: number): number | null {
  const coords = editor.view.posAtCoords({ left: clientX, top: clientY });
  if (!coords) {
    // posAtCoords only resolves a position directly over rendered content —
    // it returns null in the page's own padding, including the blank space
    // below the last block, so without this a drop past the end of the last
    // paragraph would silently do nothing. Snap to the start/end of the
    // document when the pointer is above/below all of it.
    const contentRect = editor.view.dom.getBoundingClientRect();
    if (clientY >= contentRect.bottom) return editor.state.doc.content.size;
    if (clientY <= contentRect.top) return 0;
    return null;
  }
  const resolved = editor.state.doc.resolve(coords.pos);
  if (resolved.depth === 0) return coords.pos;
  const caret = editor.view.coordsAtPos(coords.pos);
  const nearTop = clientY - caret.top < caret.bottom - clientY;
  return nearTop ? resolved.before(1) : resolved.after(1);
}

/* Whether a drop's coordinates land directly on an already-placed image — if
   so, dropping a new photo there should replace it in place (matching how
   dragging a photo onto an existing image works in Canva) rather than insert
   a second image beside it via resolveDropPosition's between-blocks snapping.
   Hit-tests the real DOM (an image is a plain <img>, not a node view we
   control) rather than posAtCoords, which only resolves block boundaries. */
function imageNodeAtPoint(editor: Editor, clientX: number, clientY: number): { pos: number; node: PMNode } | null {
  const imgEl = document.elementFromPoint(clientX, clientY)?.closest('img');
  if (!imgEl || !editor.view.dom.contains(imgEl)) return null;
  const domPos = editor.view.posAtDOM(imgEl, 0);
  for (const pos of [domPos, domPos - 1]) {
    const node = editor.state.doc.nodeAt(pos);
    if (node?.type.name === 'image') return { pos, node };
  }
  return null;
}


type MediaPickerKind = 'image' | 'video' | 'audio';
type ElementsCategory = 'Shapes' | 'Charts' | 'Worksheets' | 'Interactive';

/* Image/video/audio used to insert a gray placeholder (or prompt() for a URL)
   straight from the grid — now those three route through the media picker instead
   (choose a source on the left first, see MediaPickerPanel below), so nothing
   reaches this function without a real src already. */
function insertTileContent(editor: Editor, pos: number, html: string) {
  editor.chain().focus().insertContentAt(pos, html).scrollIntoView().run();
}

/* What the media picker's "ready to place" card turns into once it's actually
   dropped onto a page or clicked at the cursor — image/video/audio's equivalent of
   insertTileContent above, carrying a real, already-sourced src instead of a
   placeholder or a prompt(). */
function insertMediaAt(editor: Editor, pos: number, kind: MediaPickerKind, src: string) {
  if (kind === 'image') {
    editor.chain().focus().insertContentAt(pos, { type: 'image', attrs: { src, alt: '', wrap: 'inline' } }).scrollIntoView().run();
    return;
  }
  editor.chain().focus().insertContentAt(pos, { type: 'embedBlock', attrs: { kind, src } }).scrollIntoView().run();
}

function ChapterEditor({
  page, theme, isSelected, currentSelection, isDragActive, onSelection, onAddChapterAfter, onSplitChapter, onBeginChapterEdit, onWordCountChange, onPageCountChange, onAltStatusChange, onEditorFocus, onContentChange, titleHtml, onTitleChange, eyebrowHtml, onFieldChange, moveDragRef, onMoveDragActiveChange, zoom, pageNumbers, pageNumberIndex, chapterNumber, onMediaDropped, onSetOpenerImage, getFieldEditor,
}: {
  page: ChapterPage;
  theme: ThemeDef;
  pageNumbers: PageNumberSettings;
  pageNumberIndex: number;
  // This chapter's 1-based position among chapter-type pages only (not all
  // pages) — the 'opener' layout's big numeral, distinct from pageNumberIndex
  // above which counts every content page for the header/footer page number.
  chapterNumber: number;
  isSelected: boolean;
  /* Every overlay below positions itself from a getBoundingClientRect delta, which
     is in scaled screen pixels — then applies it as a CSS offset *inside* the
     scaled container, where it gets multiplied by the scale a second time. At 150%
     the drag handle landed roughly 2.25x too far down the page. Dividing the delta
     back out is what keeps them pinned to their block at any zoom. */
  zoom: number;
  currentSelection: Selection;
  isDragActive: boolean;
  onSelection: (sel: Selection) => void;
  onAddChapterAfter: (afterId: string) => void;
  // Split lives at document scope (touches setPages/setChapterContent), so it's
  // passed straight through rather than reimplemented here — this chapter
  // supplies its own id and editor instance when it calls it, from the
  // per-paragraph "Split chapter here" item (see BlockActionBar).
  onSplitChapter: (chapterId: string, editor: Editor, pos: number) => void;
  // Same "document-scope, passed straight through" shape as onSplitChapter —
  // Wordgenie's block menu calls this to get an undo net around its own edit.
  onBeginChapterEdit: (chapterId: string) => { commit: (label: string) => void };
  // Shared across every chapter's own Editor instance, so a handle-drag started
  // in one chapter can be read back by whichever chapter's page it's dropped on.
  moveDragRef: React.MutableRefObject<{ chapterId: string; editor: Editor } | null>;
  onMoveDragActiveChange: (active: boolean) => void;
  onWordCountChange: (chapterId: string, words: number) => void;
  // Reported up so the book can number pages continuously — see bookPages.
  onPageCountChange: (chapterId: string, pages: number) => void;
  onAltStatusChange: (chapterId: string, missing: number) => void;
  onEditorFocus: (editor: Editor) => void;
  onContentChange: (chapterId: string, html: string) => void;
  titleHtml: string;
  onTitleChange: (chapterId: string, html: string) => void;
  // The opener's eyebrow: a real text field (fieldContent, like the title and the
  // cover's text layers), not a hardcoded word, so it can be edited and formatted.
  eyebrowHtml: string;
  onFieldChange: (fieldKey: string, html: string) => void;
  // Fired after a media-picker "ready to place" card is actually dropped onto
  // this chapter, so the picker (state lives one level up, in BookEditorView)
  // can close itself — the job it was open for is done.
  onMediaDropped?: () => void;
  // Sets this chapter's opener photo directly from a drop — the same media-picker
  // payload/raw-file drop AuthorAvatarPanel now accepts, so the opener placeholder
  // isn't a click-only dead end for the drag gesture its sibling "Ready to place"
  // card explicitly invites.
  onSetOpenerImage: (chapterId: string, src: string) => void;
  // Looks up a *live* field/chapter Editor by its registry key — the title's
  // own SimpleFieldEditor is uncontrolled after mount (only takes initialHtml),
  // so "Suggest a title" needs this to push a new value into its already-mounted
  // editor instance, the same way restoreSnapshot reaches into editors it
  // doesn't own to replay a snapshot.
  getFieldEditor: (key: string) => Editor | undefined;
}) {
  const geometry = useContext(PageGeometryContext);
  /* The pagination extension is configured once, when this chapter's editor is
     created, so it reads the page box through a ref rather than holding the
     value it was built with. Rebuilding the editor on a settings change would
     lose the caret, the undo history and the scroll position of every chapter
     in the book. */
  const geometryRef = useRef(geometry);
  useEffect(() => { geometryRef.current = geometry; }, [geometry]);
  const readGeometry = useCallback(() => geometryRef.current, []);
  const scale = zoom / 100;
  const [dragOver, setDragOver] = useState(false);
  // The opener-photo placeholder's own drop target — separate from `dragOver`
  // above (the whole page accepting an Insert-panel tile), since this one only
  // ever accepts an image and lives in a much smaller region.
  const [openerDragOver, setOpenerDragOver] = useState(false);
  const handleOpenerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOpenerDragOver(false);
    const mediaPayload = e.dataTransfer.getData('text/insert-media');
    if (mediaPayload) {
      try {
        const { kind, src } = JSON.parse(mediaPayload) as { kind: string; src: string };
        if (kind === 'image') onSetOpenerImage(page.id, src);
      } catch { /* malformed payload, ignore */ }
      return;
    }
    const file = e.dataTransfer.files?.[0];
    if (file) void readImageFile(file).then((result) => { if ('src' in result) onSetOpenerImage(page.id, result.src); });
  };
  // Whole-page tint (dragOver) says "this chapter accepts drops" — this says
  // exactly where, tracking the cursor to the nearest real insertion point the
  // way Notion/Google Docs show a line between blocks while dragging, rather
  // than leaving the landing spot a surprise until you actually let go.
  const [dropIndicator, setDropIndicator] = useState<{ top: number; left: number; width: number } | null>(null);
  // The Wordgenie "···" trigger — only drawn once the caret is inside a given
  // paragraph, not a persistent per-block handle, matching the real product.
  const pageRef = useRef<HTMLDivElement | null>(null);
  /* The hovered-or-caret block's own box, which BlockActionBar floats above.
     It used to carry a `movable` flag as well, to keep the bar and the drag
     handle from overlapping while both lived in the left gutter — the bar
     doesn't sit there any more, so the gutter is the handle's alone. */
  const [blockMenuAt, setBlockMenuAt] = useState<{ pos: number; top: number; left: number } | null>(null);
  const [wordgenieToast, setWordgenieToast] = useState(false);
  /* How many fixed-height pages this chapter currently occupies. Owned here
     rather than derived in render because only the pagination plugin knows —
     it's the one thing that has measured the laid-out DOM. */
  const [pageCount, setPageCount] = useState(1);
  useEffect(() => { onPageCountChange(page.id, pageCount); }, [page.id, pageCount, onPageCountChange]);
  // The move-drag handle — revealed on hover over a movable object, same idiom
  // as blockMenuAt above: resolve the block under the pointer, find its DOM,
  // store its rect. Cleared whenever a native drag is already in progress.
  const [hoverHandle, setHoverHandle] = useState<{ pos: number; top: number; left: number } | null>(null);
  /* The table under the pointer, if any — drives the + adders on its right and
     bottom edges. Measured like every other overlay here: resolve the element,
     take its rect, divide by zoom. */
  const [hoverTable, setHoverTable] = useState<{ pos: number; left: number; boxTop: number; width: number; boxHeight: number } | null>(null);
  // Whether a move-drag currently in progress started from THIS chapter's own
  // handle — state, not a ref read during render, so the handle can stay
  // mounted through its own drag (see the render condition below) without
  // reading moveDragRef mid-render.
  const [isMoveDragSource, setIsMoveDragSource] = useState(false);
  // Set the instant the handle's mouse button goes down, before the browser has
  // decided a real drag gesture is underway. Without this, the hover mousemove
  // handler below can resolve a different block mid-gesture and unmount the very
  // handle being pressed, which silently cancels the native drag before it starts.
  const suppressHoverRef = useRef(false);
  useEffect(() => {
    const release = () => { suppressHoverRef.current = false; };
    // 'drop' is the reliable one — it bubbles from the drop TARGET, which stays
    // mounted. 'dragend' fires on the drag SOURCE, which for a same-chapter move
    // gets unmounted mid-drag (dragOver hides the handle the instant the drag
    // re-enters its own page) — a detached node's dragend doesn't reliably bubble
    // to window, so it can't be the only thing this depends on.
    window.addEventListener('drop', release);
    window.addEventListener('dragend', release);
    window.addEventListener('mouseup', release);
    return () => {
      window.removeEventListener('drop', release);
      window.removeEventListener('dragend', release);
      window.removeEventListener('mouseup', release);
    };
  }, []);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // Level 2 lives in the chapter's own title field now, not in this document —
      // level 3 is the only in-body heading left, for subheadings.
      /* h2 stays out: the chapter title field owns it, and the ToC's first level
         is built from those titles. h3 and h4 are the two levels INSIDE a chapter,
         so the outline runs h2 title › h3 heading › h4 subheading with nothing
         skipped, which is what the no-skipped-levels rule needs. */
      // horizontalRule off: Divider below is the same node with a look attached.
      StarterKit.configure({ heading: { levels: [3, 4] }, link: { openOnClick: false }, horizontalRule: false }),
      Divider,
      TextStyle,
      Color,
      // Both attach to the same textStyle mark Color already does — no new node
      // type, just two more attributes TextInspector's Font section can read
      // and write, mirroring how Color/Highlight already work.
      FontFamily,
      FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      // multicolor: true — the Highlight inspector offers a real swatch row, not
      // just an on/off toggle; without this the extension ignores the color
      // attribute entirely and always renders its single default yellow mark.
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: 'Write, or drag a block in from the rail on the left…' }),
      WrappableImage.configure({ inline: false, allowBase64: true }),
      Callout,
      LockableTable.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      ShapeBlock,
      EmbedBlock,
      QrCodeBlock,
      ChartBlock,
      FootnoteRefBlock,
      TextFieldBlock,
      JumbotronBlock,
      ColumnsBlock,
      ImageGridBlock,
      ParagraphClass,
      BlockSize,
      SmartTypography,
      ActiveBlockRing,
      Pagination.configure({ onLayout: setPageCount, geometry: readGeometry }),
    ],
    content: page.initialHtml,
    onFocus: ({ editor: ed }) => {
      onEditorFocus(ed);
      // Used to only forward the "nothing special selected" fallback, on the
      // assumption onSelectionUpdate always separately covers an active object —
      // true for a plain focus, but not for the very first click landing
      // directly on an atom in a not-yet-focused chapter: handleClickOn below
      // dispatches a NodeSelection and focuses the view in the same tick, and
      // that particular transaction fires onFocus with the object already
      // active but never fires onSelectionUpdate at all, so the object-active
      // branch has to be handled here too, not just the fallback.
      const objectKind = activeObjectKind(ed);
      onSelection(objectKind ? { kind: objectKind, chapterId: page.id, editor: ed } : { kind: 'chapter', chapterId: page.id });
    },
    onSelectionUpdate: ({ editor: ed }) => {
      // Fires on every cursor/selection move within this chapter, not just when
      // switching object kinds — the right-panel TextInspector reads live active
      // marks/heading-level off this same editor, so it needs a fresh selection
      // object on every move to know to re-render, not just on focus.
      if (!ed.isFocused) return;
      const objectKind = activeObjectKind(ed);
      onSelection(objectKind ? { kind: objectKind, chapterId: page.id, editor: ed } : { kind: 'chapter', chapterId: page.id });

      // The "···" trigger only makes sense over plain flowing text — hide it the
      // instant the caret lands on/in a custom object (image, table, shape…).
      const host = pageRef.current;
      const resolved = ed.state.selection.$from;
      if (objectKind || resolved.depth === 0 || !host) { setBlockMenuAt(null); return; }
      const blockPos = resolved.before(1);
      const node = ed.state.doc.nodeAt(blockPos);
      if (!hasBlockMenu(node)) { setBlockMenuAt(null); return; }
      const dom = ed.view.nodeDOM(blockPos) as HTMLElement | null;
      if (!dom || typeof dom.getBoundingClientRect !== 'function') { setBlockMenuAt(null); return; }
      const rect = dom.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      setBlockMenuAt({ pos: blockPos, top: (rect.top - hostRect.top) / scale, left: (rect.left - hostRect.left) / scale });
    },
    onBlur: () => setBlockMenuAt(null),
    onUpdate: ({ editor: ed }) => {
      // Before the read-outs below, so the HTML they cache already has the
      // notes list reconciled rather than one update behind it.
      syncFootnoteList(ed);
      onWordCountChange(page.id, ed.getText().split(/\s+/).filter(Boolean).length);
      onAltStatusChange(page.id, countMissingAlt(ed.getJSON() as { type?: string }));
      onContentChange(page.id, ed.getHTML());
    },
    onCreate: ({ editor: ed }) => {
      onAltStatusChange(page.id, countMissingAlt(ed.getJSON() as { type?: string }));
      onWordCountChange(page.id, ed.getText().split(/\s+/).filter(Boolean).length);
    },
    editorProps: {
      /* The layout name rides on the editor's own root, so a layout rule can be
         scoped to the chapter that chose it. Without it every layout rule was
         written `.book-chapter-prose <thing>` inside a styled-jsx *global*
         block — one document-wide rule per layout, applying to every chapter on
         the canvas, so one chapter set to Pull quote restyled the quotes in all
         of them. `book-layout-<id>` is deliberately the same class epub.ts
         already wraps each chapter in, so the editor and the export now match
         on the selector as well as on the declarations. */
      attributes: { class: `book-chapter-prose book-layout-${page.layout ?? 'standard'}` },
      /* Found while checking that selecting a chapter-body image switches the
         panel to Image properties: it didn't, on the FIRST click into a
         not-yet-focused chapter — ProseMirror's default click resolution treats
         an unfocused view's click as "place a text caret near here," landing a
         TextSelection beside the image instead of selecting it, so the panel
         stayed on generic Text properties. A second click then worked, because
         by then the view was already focused. A real user editing a document
         they've already touched rarely notices, but a first-ever click landing
         squarely on an image (or any other atom object) silently doing nothing
         reads as broken. Forces the atom to select immediately regardless of
         prior focus state, the same way clicking a cover-canvas element already
         does one click, not two. */
      handleClickOn: (view, pos, node, nodePos) => {
        if (!node.type.isAtom) return false;
        /* Inside a photo grid, the first click selects the GRID and the second
           the individual photo — the drill-in every design tool uses for a
           container and its children (Figma groups, Canva grids). Before this,
           clicking went straight to the cell and grid-level controls had to be
           smuggled into the cell's own inspector, because the grid had no
           selectable state of its own. */
        const $at = view.state.doc.resolve(nodePos);
        let gridPos = -1;
        for (let d = $at.depth; d > 0; d -= 1) {
          if ($at.node(d).type.name === 'imageGridBlock') { gridPos = $at.before(d); break; }
        }
        if (gridPos >= 0) {
          const sel = view.state.selection;
          const gridSelected = sel instanceof NodeSelection && sel.from === gridPos;
          if (!gridSelected) {
            view.focus();
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, gridPos)));
            return true;
          }
          // Grid already selected — fall through and take the cell.
        }
        // Focus BEFORE dispatching the selection change, not after — onSelectionUpdate
        // above bails out early whenever `!ed.isFocused`, and onFocus only forwards a
        // 'chapter' fallback selection, never an active object one (it assumes
        // onSelectionUpdate already covered that case). Dispatching first would fire
        // onSelectionUpdate while still unfocused (silently swallowed), then onFocus
        // right after, which also skips calling onSelection since an object IS
        // active by then — net result, onSelection never runs at all either way.
        view.focus();
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
        return true;
      },
      // Locking (see the Lock feature) hides the floating bar's Delete button,
      // but that alone doesn't stop ProseMirror's own base keymap, which binds
      // Backspace/Delete to remove whatever NodeSelection is currently active —
      // this is what actually blocks that, taking precedence over the keymap's
      // plugin-level binding since direct editorProps are checked first.
      handleKeyDown: (view, event) => {
        if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
        const { selection } = view.state;
        return selection instanceof NodeSelection && !!selection.node.attrs.locked;
      },
    },
  });

  useRegisterEditor(page.id, editor, 'chapter');
  const editorPrefs = useContext(EditorPrefsContext);
  useSpellcheck(editor, editorPrefs.spellcheck);

  /* Kick a re-measure when the page box changes. The pagination plugin's own
     ResizeObserver catches a new page WIDTH, because that resizes the editor
     element — but a change to the top and bottom margins only moves it, and a
     moved element fires nothing. An empty transaction reaches the plugin's
     update hook, which is all the scheduler needs. Out of history: this is a
     consequence of a setting, not an edit to step back through. */
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false));
  }, [editor, geometry]);

  const insertAtPointer = useCallback((clientX: number, clientY: number, html: string) => {
    if (!editor) return;
    // resolveDropPosition returns null for anything not directly over rendered
    // text (page padding, the gap between paragraphs, etc.) — a real drag lands
    // there often. Falling back to "end of chapter" used to mean the insert
    // could land far off the visible screen; falling back to the current
    // selection keeps it near wherever the user was already looking.
    const pos = resolveDropPosition(editor, clientX, clientY) ?? editor.state.selection.from;
    insertTileContent(editor, pos, html);
  }, [editor]);

  // Shared by the hover mousemove below and by the handle's own dragend: what's
  // actually under the cursor right now, not an assumption about what a drag
  // just did. A completed drag mutates the doc before dragend fires, so re
  // resolving from the live cursor position — rather than unconditionally
  // hiding the handle — means a real move leaves the handle on the object
  // where it landed, and a trivial click-without-really-dragging (which still
  // fires a real, if tiny, native drag cycle) puts the handle right back
  // where it was instead of leaving it hidden until the next mouse move.
  // The hovered table's own client rect, so the hysteresis below can measure
  // against it without re-querying the DOM on every mousemove.
  const hoverTableRectRef = useRef<DOMRect | null>(null);
  const updateHoverTable = useCallback((clientX: number, clientY: number) => {
    if (!editor || !pageRef.current) { hoverTableRectRef.current = null; setHoverTable(null); return; }
    const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    // Staying inside the adders themselves must not dismiss them, or the button
    // would vanish out from under the pointer on its way to being clicked.
    if (target?.closest('[data-table-adders]')) return;
    /* .ProseMirror, not just .book-chapter-prose: the insert panel's tile previews
       render real chapter HTML under that same class, so an unscoped match would
       resolve a preview table against this editor's document. */
    const tableDom = target?.closest('.ProseMirror.book-chapter-prose table') as HTMLElement | null;
    if (!tableDom) {
      /* The gap that made both buttons unclickable. They hang outside the
         table — a + six px off its right edge, another four px below it — so
         the pixels you must cross to reach one are not the table, and clearing
         the hover there unmounted the button on the way to it. Walking the
         pointer out showed the overlay dying 1px past the edge, which meant
         neither button could ever be reached by any path. Keep the table you
         were on while the pointer is still within its adders' reach; leave for
         real and it goes. */
      const r = hoverTableRectRef.current;
      const reach = TABLE_ADDER_REACH * scale;
      if (r && clientX >= r.left - reach && clientX <= r.right + reach
           && clientY >= r.top - reach && clientY <= r.bottom + reach) return;
      hoverTableRectRef.current = null;
      setHoverTable(null);
      return;
    }
    let pos: number;
    try {
      pos = editor.view.posAtDOM(tableDom, 0);
    } catch { setHoverTable(null); return; }
    const resolved = editor.state.doc.resolve(pos);
    let tablePos: number | null = null;
    for (let d = resolved.depth; d >= 0; d--) {
      if (resolved.node(d).type.name === 'table') { tablePos = resolved.before(d); break; }
    }
    if (tablePos == null) { setHoverTable(null); return; }
    const rect = tableDom.getBoundingClientRect();
    hoverTableRectRef.current = rect;
    const hostRect = pageRef.current.getBoundingClientRect();
    const next = {
      pos: tablePos,
      left: (rect.left - hostRect.left) / scale,
      boxTop: (rect.top - hostRect.top) / scale,
      width: rect.width / scale,
      boxHeight: rect.height / scale,
    };
    setHoverTable((prev) => (prev && prev.pos === next.pos && Math.abs(prev.boxHeight - next.boxHeight) < 0.5 ? prev : next));
  }, [editor, scale]);

  const updateHoverHandle = useCallback((clientX: number, clientY: number) => {
    if (!editor || !pageRef.current) return;
    const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (target?.closest('.book-drag-handle')) return;
    const topLevelDom = target?.closest('.book-chapter-prose > *') as HTMLElement | null;
    if (!topLevelDom) { setHoverHandle(null); return; }
    let domPos: number;
    try {
      domPos = editor.view.posAtDOM(topLevelDom, 0);
    } catch {
      setHoverHandle(null);
      return;
    }
    const resolved = editor.state.doc.resolve(domPos);
    const blockPos = resolved.depth > 0 ? resolved.before(1) : domPos;
    const node = editor.state.doc.nodeAt(blockPos);
    if (!node || !isMovableBlock(node) || node.attrs.locked) { setHoverHandle(null); return; }
    const rect = topLevelDom.getBoundingClientRect();
    const hostRect = pageRef.current.getBoundingClientRect();
    setHoverHandle((prev) => (prev?.pos === blockPos ? prev : { pos: blockPos, top: (rect.top - hostRect.top) / scale, left: (rect.left - hostRect.left) / scale }));
  }, [editor, scale]);

  /* The "···" trigger used to appear only once the cursor was actually placed in
     a paragraph (onSelectionUpdate, focus-gated) — every other block affordance
     in this editor (the drag handle above) already reveals on hover instead, so
     this was the one exception. Same hit-testing technique as updateHoverHandle,
     just resolving textblocks instead of movable objects. */
  const updateBlockMenuHover = useCallback((clientX: number, clientY: number) => {
    if (!editor || !pageRef.current) return;
    const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const topLevelDom = target?.closest('.book-chapter-prose > *') as HTMLElement | null;
    if (!topLevelDom) return;
    let domPos: number;
    try {
      domPos = editor.view.posAtDOM(topLevelDom, 0);
    } catch {
      return;
    }
    const resolved = editor.state.doc.resolve(domPos);
    if (resolved.depth === 0) return;
    const blockPos = resolved.before(1);
    const node = editor.state.doc.nodeAt(blockPos);
    if (!hasBlockMenu(node)) return;
    const rect = topLevelDom.getBoundingClientRect();
    const hostRect = pageRef.current.getBoundingClientRect();
    setBlockMenuAt((prev) => (prev?.pos === blockPos ? prev : { pos: blockPos, top: (rect.top - hostRect.top) / scale, left: (rect.left - hostRect.left) / scale }));
  }, [editor, scale]);

  // Falls back to wherever the caret actually is (if it's in a textblock),
  // rather than just closing outright — otherwise clicking the menu itself
  // (which momentarily isn't "hovering the paragraph") would hide the menu
  // it was just opened from.
  const syncBlockMenuToCaret = useCallback(() => {
    if (!editor || !pageRef.current) { setBlockMenuAt(null); return; }
    if (!editor.isFocused) { setBlockMenuAt(null); return; }
    const resolved = editor.state.selection.$from;
    if (activeObjectKind(editor) || resolved.depth === 0) { setBlockMenuAt(null); return; }
    const blockPos = resolved.before(1);
    const node = editor.state.doc.nodeAt(blockPos);
    if (!hasBlockMenu(node)) { setBlockMenuAt(null); return; }
    const dom = editor.view.nodeDOM(blockPos) as HTMLElement | null;
    if (!dom || typeof dom.getBoundingClientRect !== 'function') { setBlockMenuAt(null); return; }
    const rect = dom.getBoundingClientRect();
    const hostRect = pageRef.current.getBoundingClientRect();
    setBlockMenuAt({ pos: blockPos, top: (rect.top - hostRect.top) / scale, left: (rect.left - hostRect.left) / scale });
  }, [editor, scale]);

  // selKind/isBlockKind and the blockBarPos hooks below have to sit above the
  // `if (!editor) return null` bailout — every Hook in this component must run
  // on every render regardless of that early return, or React throws "Rendered
  // more hooks than during the previous render" the first time editor is null
  // (e.g. before TipTap's initial mount) and then not-null right after.
  const selKind = currentSelection.kind;
  const isBlockKind = selKind === 'image' || selKind === 'imageGrid' || selKind === 'shape' || selKind === 'embed' || selKind === 'qr' || selKind === 'chart'
    || selKind === 'textfield' || selKind === 'jumbotron' || selKind === 'columns' || selKind === 'table' || selKind === 'divider';

  // Floating quick actions' position — a plain absolutely-positioned child of
  // pageRef, resolved from the selected block's own rect the same way
  // blockMenuAt/hoverHandle already are above, scale-corrected for zoom. Not
  // FloatingBarPortal (used for the cover editor's own bar): that one sticks
  // to a viewport edge for as long as its whole box is in view, which is right
  // for "stay reachable while scrolling a tall page" but not for "sit directly
  // above the thing I selected."
  const [blockBarPos, setBlockBarPos] = useState<{ top: number; left: number; width: number; boxTop: number; boxHeight: number } | null>(null);
  useEffect(() => {
    if (!isBlockKind || currentSelection.chapterId !== page.id) { setBlockBarPos(null); return; }
    const ed = currentSelection.editor;
    const host = pageRef.current;
    if (!host) { setBlockBarPos(null); return; }
    // Re-measured on every resize, not just once on selection change — typing
    // above the selected block reflows the page and shifts it down without
    // touching the selection itself, so selection-only deps would leave this
    // stale exactly the way FloatingBarPortal's own comment warns about.
    const update = () => {
      const dom = selectedBlockDom(ed, selKind);
      if (!dom) { setBlockBarPos(null); return; }
      const rect = dom.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      setBlockBarPos({
        top: Math.max(0, (rect.top - hostRect.top) / scale - FLOATING_BAR_H - 8),
        left: (rect.left - hostRect.left) / scale,
        width: rect.width / scale,
        // The block's own box, for the resize handles — the bar's `top` above is
        // already offset to sit above it, so it can't be reused for this.
        boxTop: (rect.top - hostRect.top) / scale,
        boxHeight: rect.height / scale,
      });
    };
    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(host);
    return () => observer?.disconnect();
  }, [isBlockKind, currentSelection, selKind, scale, page.id]);

  if (!editor) return null;

  const headingColor = page.overrides.headingColor ?? theme.headingColor;
  const bodyFont = page.overrides.bodyFont ?? theme.bodyFont;
  const bodyColor = theme.bodyColor;
  // The opener photo is a plain DOM element, not a ProseMirror node, so it gets
  // its ring from the selection state directly rather than from ActiveBlockRing.
  const openerSelected = currentSelection.kind === 'openerImage' && currentSelection.chapterId === page.id;
  const ruleSelected = currentSelection.kind === 'openerRule' && currentSelection.chapterId === page.id;
  const openerRule = openerRuleOf(page, theme);

  /* Floating quick actions for whatever block is selected in THIS chapter —
     duplicate/delete/lock, no arrange (chapter content flows in document
     order, so "bring to front" doesn't apply the way it does on the freeform
     cover). */
  const blockBar = isBlockKind && currentSelection.chapterId === page.id ? (() => {
    const ed = currentSelection.editor;
    // Divider has no `locked` attribute of its own — nothing about a rule can be
    // dragged or resized, so there was never anything for a lock to freeze. It
    // returns ahead of the lock wiring below rather than being given a Lock
    // button that would silently do nothing.
    if (selKind === 'divider') {
      return { onDelete: () => deleteAtomNode(ed), onDuplicate: () => duplicateAtomNode(ed), locked: false, onToggleLock: undefined };
    }
    // Callout is deliberately excluded from the Lock feature — unlike every
    // type mapped here, it has no click-to-select-the-whole-thing state of
    // its own (no Selection kind, no floating bar entry today), so it never
    // reaches this branch in the first place; nothing to special-case.
    const nodeTypeName = selKind === 'shape' ? 'shapeBlock'
      : selKind === 'embed' ? 'embedBlock'
      : selKind === 'qr' ? 'qrCodeBlock'
      : selKind === 'chart' ? 'chartBlock'
      : selKind === 'textfield' ? 'textFieldBlock'
      : selKind === 'jumbotron' ? 'jumbotronBlock'
      : selKind === 'columns' ? 'columnsBlock'
      : selKind === 'imageGrid' ? 'imageGridBlock'
      : selKind; // 'image' (not in a grid) and 'table' already match their own node name
    const locked = !!ed.getAttributes(nodeTypeName).locked;
    const onToggleLock = () => ed.commands.updateAttributes(nodeTypeName, { locked: !locked });
    if (selKind === 'columns') return { onDelete: () => ed.chain().focus().deleteNode('columnsBlock').run(), locked, onToggleLock };
    if (selKind === 'table') return { onDelete: () => ed.chain().focus().deleteTable().run(), locked, onToggleLock };
    if (selKind === 'imageGrid') return { onDelete: () => ed.chain().focus().deleteNode('imageGridBlock').run(), locked, onToggleLock };
    return { onDelete: () => deleteAtomNode(ed), onDuplicate: () => duplicateAtomNode(ed), locked, onToggleLock };
  })() : null;

  return (
    <div
      ref={pageRef}
      // Drop handling lives on this same div that renders the full visible page —
      // not a tight inner wrapper — so dropping anywhere on the page (including its
      // padding, which is substantial now that pages look like real pages) registers.
      onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!editor) return;
        // Reuses the same snap-to-block-boundary resolution the actual drop
        // will use (including the past-the-last-block case below), so the
        // line always shows exactly where the drop will land — never a raw
        // mid-block caret position the drop wouldn't actually use.
        const targetPos = resolveDropPosition(editor, e.clientX, e.clientY);
        if (targetPos == null) { setDropIndicator(null); return; }
        const caret = editor.view.coordsAtPos(targetPos);
        const contentRect = editor.view.dom.getBoundingClientRect();
        const hostRect = e.currentTarget.getBoundingClientRect();
        setDropIndicator({
          top: (caret.top - hostRect.top) / scale,
          left: (contentRect.left - hostRect.left) / scale,
          width: contentRect.width / scale,
        });
      }}
      onDragLeave={() => { setDragOver(false); setDropIndicator(null); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        setDropIndicator(null);

        // A handle-drag from this or another chapter, repositioning something
        // already in the document — distinct from a fresh Insert-panel tile.
        if (e.dataTransfer.types.includes('text/move-block')) {
          const payload = moveDragRef.current;
          moveDragRef.current = null;
          onMoveDragActiveChange(false);
          if (!payload) return;
          const targetPos = resolveDropPosition(editor, e.clientX, e.clientY);
          if (targetPos == null) return;

          if (payload.editor === editor) {
            // Same chapter: one transaction, delete then insert, correcting the
            // target for the shift the delete causes. A target that falls inside
            // the dragged node's own old span (including dropping it back where
            // it started) is a no-op rather than corrupting the doc.
            editor.chain().focus().command(({ tr, state }) => {
              const sel = state.selection;
              if (!(sel instanceof NodeSelection)) return false;
              if (targetPos >= sel.from && targetPos <= sel.to) return false;
              const node = sel.node;
              let target = targetPos;
              tr.delete(sel.from, sel.to);
              if (target > sel.to) target -= sel.to - sel.from;
              tr.insert(target, node);
              return true;
            }).run();
          } else {
            // Different chapter: two editors, two transactions. Every chapter
            // shares the same extensions/schema (see useEditor above), so the
            // node's JSON round-trips through insertContentAt exactly like an
            // Insert-panel tile does.
            const sourceSel = payload.editor.state.selection;
            if (!(sourceSel instanceof NodeSelection)) return;
            const nodeJSON = sourceSel.node.toJSON();
            editor.chain().focus().insertContentAt(targetPos, nodeJSON).scrollIntoView().run();
            payload.editor.chain().deleteRange({ from: sourceSel.from, to: sourceSel.to }).run();
          }
          return;
        }

        // A media picker's "ready to place" card — an already-sourced image/
        // video/audio, not a sentinel tile id, so it skips INSERT_TILES entirely.
        const mediaPayload = e.dataTransfer.getData('text/insert-media');
        if (mediaPayload) {
          try {
            const { kind, src } = JSON.parse(mediaPayload) as { kind: MediaPickerKind; src: string };
            // Dropped a new photo directly on one that's already placed —
            // swap it in place rather than insert a second image beside it.
            const existing = kind === 'image' ? imageNodeAtPoint(editor, e.clientX, e.clientY) : null;
            if (existing) {
              editor.chain().focus().command(({ tr }) => {
                tr.setNodeMarkup(existing.pos, undefined, { ...existing.node.attrs, src });
                return true;
              }).run();
            } else {
              const targetPos = resolveDropPosition(editor, e.clientX, e.clientY) ?? editor.state.selection.from;
              insertMediaAt(editor, targetPos, kind, src);
            }
            onMediaDropped?.();
          } catch { /* malformed payload, ignore */ }
          return;
        }

        const type = e.dataTransfer.getData('text/insert-block');
        const tile = INSERT_TILES.find((t) => t.id === type);
        if (!tile) return;
        if (tile.html === '__CHAPTER__') onAddChapterAfter(page.id);
        else insertAtPointer(e.clientX, e.clientY, tile.html);
      }}
      onMouseMove={(e) => {
        // Skipped mid-drag; dragover drives feedback then.
        if (dragOver || suppressHoverRef.current) return;
        updateHoverHandle(e.clientX, e.clientY);
        updateBlockMenuHover(e.clientX, e.clientY);
        updateHoverTable(e.clientX, e.clientY);
      }}
      onMouseLeave={() => { setHoverHandle(null); setHoverTable(null); syncBlockMenuToCaret(); }}
      /* The pagination plugin measures against this element's content box, not
         against its own editor: the chapter eyebrow, title and photo button all
         sit above the prose inside the same stack, so page 1 has less room than
         the ones after it. Anchoring to the first paragraph instead let roughly
         200px of heading spill past the bottom of page 1. */
      data-page-stack="true"
      /* Same as the cover and the TOC: the margin around the flow is the page
         itself, and clicking it selects the page. The sheets drawn behind the
         text are pointer-events:none, so this is what a margin click hits. */
      onClick={(e) => { if (e.target === e.currentTarget) onSelection({ kind: 'page', pageId: page.id, viaCanvas: true }); }}
      style={{
        position: 'relative',
        // Was hardcoded white regardless of theme — the one visible surface a
        // template touches (the live chapter page) never actually reflected
        // the chosen theme's background, so applying Noir/Bestseller/Sunset
        // changed heading color and font but left every page looking identical.
        /* The container is now the STACK, not a page. It draws nothing itself:
           the sheets below are real elements behind the flow, so a chapter that
           runs to 20 pages looks like 20 pages instead of one very tall one.
           Height is driven by the measured page count; padding matches a
           sheet's so the first page's content starts in the right place and
           every later page lines up via the spacer widths in lib/pagination. */
        height: stackHeight(pageCount, geometry),
        padding: `${geometry.padY}px ${geometry.padX}px`,
        transition: 'border-color .1s ease, background .1s ease',
      }}
    >
      {Array.from({ length: pageCount }, (_, i) => (
        <div
          key={i}
          className="pointer-events-none"
          style={{
            position: 'absolute', left: 0, top: pageTop(i, geometry), width: '100%', height: geometry.h,
            background: dragOver ? '#F3F8FF' : (page.bg ?? theme.bg),
            border: dragOver ? `2px dashed ${BLUE}` : isSelected ? `2px solid ${BLUE}` : isDragActive ? `2px dashed ${BLUE}` : `1px solid ${BORDER}`,
            borderRadius: 3,
            boxShadow: PAGE_SHADOW,
            zIndex: 0,
          }}
        >
          <PageNumberChip settings={pageNumbers} index={pageNumberIndex + i} edge="header" selected={currentSelection.kind === 'pageNumber'} onSelect={() => onSelection({ kind: 'pageNumber' })} />
          <PageNumberChip settings={pageNumbers} index={pageNumberIndex + i} edge="footer" selected={currentSelection.kind === 'pageNumber'} onSelect={() => onSelection({ kind: 'pageNumber' })} />
        </div>
      ))}
      {blockBar && blockBarPos && (
        <div className="absolute flex justify-center" style={{ top: blockBarPos.top, left: blockBarPos.left, width: blockBarPos.width, zIndex: 20 }}>
          <FloatingObjectBar onDuplicate={blockBar.onDuplicate} onDelete={blockBar.onDelete} locked={blockBar.locked} onToggleLock={blockBar.onToggleLock} />
        </div>
      )}
      {/* Locked blocks get no handles, matching the floating bar, which drops to
          a single Unlock button in the same state. Image, photo grid and shape
          are absent because their own node views host handles already — two sets
          of dots on one box would be a bug, not a bonus. */}
      {isBlockKind && blockBarPos && blockBar && !blockBar.locked
        && currentSelection.chapterId === page.id && RESIZE_OVERLAY_KINDS[selKind] && (
        <BlockResizeHandles
          box={blockBarPos}
          selKind={selKind}
          widthOnly={WIDTH_ONLY_BLOCKS.has(RESIZE_OVERLAY_KINDS[selKind])}
          editor={currentSelection.editor}
          onCommit={(w, h) => {
            const name = RESIZE_OVERLAY_KINDS[selKind];
            const patch = WIDTH_ONLY_BLOCKS.has(name) ? { boxW: w } : { boxW: w, boxH: h };
            currentSelection.editor.chain().focus().updateAttributes(name, patch).run();
          }}
        />
      )}

      {dragOver && dropIndicator && (
        <div
          className="pointer-events-none"
          style={{ position: 'absolute', top: dropIndicator.top - 1.5, left: dropIndicator.left, width: dropIndicator.width, zIndex: 5 }}
        >
          <div style={{ height: 3, background: BLUE, borderRadius: 2 }} />
          <div style={{ position: 'absolute', top: -3.5, left: -4, width: 10, height: 10, borderRadius: '50%', background: BLUE }} />
        </div>
      )}

      {/* Stay mounted through the handle's OWN drag (dragOver flips true the
          instant it re-enters its own page) — otherwise the handle vanishes
          the moment a drag starts, and since the browser doesn't reliably
          fire dragend on a detached source element, it can stay vanished. It
          still hides for an unrelated drag hovering this page (an Insert-panel
          tile, or another chapter's own move-drag arriving here). */}
      {hoverHandle && (!dragOver || isMoveDragSource) && (
        <div
          draggable
          title="Drag to move"
          onMouseDown={(e) => { e.stopPropagation(); suppressHoverRef.current = true; }}
          onDragStart={(e) => {
            const node = editor.state.doc.nodeAt(hoverHandle.pos);
            if (!node) { e.preventDefault(); return; }
            editor.chain().focus().setNodeSelection(hoverHandle.pos).run();
            moveDragRef.current = { chapterId: page.id, editor };
            setIsMoveDragSource(true);
            onMoveDragActiveChange(true);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/move-block', page.id);
            const dom = editor.view.nodeDOM(hoverHandle.pos) as HTMLElement | null;
            if (dom) {
              const rect = dom.getBoundingClientRect();
              e.dataTransfer.setDragImage(dom, e.clientX - rect.left, e.clientY - rect.top);
            }
          }}
          onDragEnd={(e) => {
            moveDragRef.current = null;
            setIsMoveDragSource(false);
            onMoveDragActiveChange(false);
            // Not an unconditional hide: re-resolve from where the cursor
            // actually ended up rather than leaving the handle hidden until
            // the next mouse move — a plain click still fires a real (if
            // trivial) native drag cycle, and without this it would look like
            // the handle vanished.
            updateHoverHandle(e.clientX, e.clientY);
          }}
          className="book-drag-handle"
          style={{
            position: 'absolute',
            top: hoverHandle.top,
            left: hoverHandle.left - 26,
            width: 20,
            height: 20,
            borderRadius: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'grab',
            color: SLATE,
            background: '#fff',
            border: `1px solid ${BORDER}`,
            zIndex: 4,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="3" cy="2" r="1.1" /><circle cx="9" cy="2" r="1.1" />
            <circle cx="3" cy="6" r="1.1" /><circle cx="9" cy="6" r="1.1" />
            <circle cx="3" cy="10" r="1.1" /><circle cx="9" cy="10" r="1.1" />
          </svg>
        </div>
      )}

      {/* The adders stay up while the pointer is inside them (see the
          data-table-adders check in updateHoverTable) and go with any other
          hover. Hidden during a drag, like every other overlay on this page. */}
      {editor && hoverTable && !dragOver && (
        <div data-table-adders>
          <TableEdgeAdders
            box={hoverTable}
            editor={editor}
            tablePos={hoverTable.pos}
            onDone={() => setHoverTable(null)}
          />
        </div>
      )}
      {editor && blockMenuAt && (
        <BlockActionBar
          editor={editor}
          chapterId={page.id}
          pos={blockMenuAt.pos}
          // Above the block and flush with its left edge — the same anchor
          // blockBarPos computes for a selected image, so a paragraph's bar and
          // a photo's bar land in the same place relative to what they act on.
          // Clamped at 0 for the first block on a page, which has nothing above it.
          top={Math.max(0, blockMenuAt.top - FLOATING_BAR_H - 8)}
          left={blockMenuAt.left}
          onRunStart={() => setWordgenieToast(false)}
          onRunEnd={() => setWordgenieToast(true)}
          onBeginEdit={onBeginChapterEdit}
          // +1: blockMenuAt.pos is this block's own raw start boundary (matches
          // doc.forEach's `offset` for it exactly), but splitChapter's own
          // block-finding loop expects a position strictly *inside* the target
          // block — same as a real text cursor placed there would report (the
          // top bar's Split, which uses the live selection, never sits exactly
          // on a boundary). Passing the boundary itself undercounts by one
          // block and can hit the "would produce an empty chapter" guard for
          // no real reason.
          onSplit={() => onSplitChapter(page.id, editor, blockMenuAt.pos + 1)}
        />
      )}
      {wordgenieToast && <WordgenieToast onDismiss={() => setWordgenieToast(false)} />}

      <style jsx global>{`
        .book-drag-handle { opacity: 0.7; transition: opacity .12s ease, background .12s ease, border-color .12s ease; }
        .book-drag-handle:hover { opacity: 1; background: #F3F8FF; border-color: ${BLUE}; color: ${BLUE}; }
        .book-drag-handle:active { cursor: grabbing; }
        .book-chapter-prose { font-family: ${bodyFont}; font-size: 15.5px; line-height: 1.7; color: ${bodyColor}; outline: none; border-radius: 6px; }
        /* Same issue as the :hover dashed box above, just for :focus — one ring
           around the WHOLE contentEditable (every paragraph, plus any embedded
           image/shape/etc, all together) regardless of which specific block is
           actually being worked on. Removed rather than scoped: unlike an atom
           object (which gets its own outline via ProseMirror-selectednode only
           while IT specifically is selected), plain flowing text has no
           equivalent per-paragraph "you are here" affordance to fall back on —
           nor does it need one; the native caret already is that indicator, the
           same way Word/Docs/Notion show no box around the paragraph you're
           typing in. Still need an explicit override, not just deleting the
           rule that used to be here — globals.css's own unscoped
           [contenteditable]:focus underneath applies the same whole-container
           box-shadow regardless, exactly like its :hover sibling above. */
        .book-chapter-prose[contenteditable]:focus { box-shadow: none; outline: none; }
        /* globals.css's [contenteditable]:hover dashed outline is meant for a
           single plain field — applied unscoped here it drew ONE dashed box
           around the entire chapter body (every paragraph plus any embedded
           image together), reading as if they shared one container instead of
           each being its own block. Killed the same way .book-simple-editable
           already was for cover text fields. */
        .book-chapter-prose[contenteditable]:hover { outline: none; background: none; }
        .book-chapter-prose h3 { font-family: ${theme.headingFont}; color: ${headingColor}; }
        /* Smaller than h3 and not a ToC entry (deriveSubheadings reads h3 only) —
           two ToC levels is what an ebook wants; a third turns the contents page
           into an index. h4 is the level you break a long section with. */
        .book-chapter-prose h4 { font-family: ${theme.headingFont}; color: ${headingColor}; font-size: 1.02em; margin: 1.1em 0 .4em; }
        ${editorPrefs.paragraphStyle === 'indented' ? `
        /* Printed-book paragraphs — see ParagraphStyle. Direct children only, so
           a paragraph inside a list item, an info box or a table cell isn't
           indented by a rule meant for running body text. A first paragraph has
           nothing to be separated from, so the chapter's opening one and any
           that follows a heading stay flush. */
        .book-chapter-prose > p { margin: 0; text-indent: ${PARAGRAPH_INDENT_EM}em; }
        .book-chapter-prose > p:first-child,
        .book-chapter-prose > h2 + p, .book-chapter-prose > h3 + p,
        .book-chapter-prose > h4 + p, .book-chapter-prose > hr + p { text-indent: 0; }
        ` : `
        .book-chapter-prose p { margin: 0 0 14px; }
        `}
        .book-chapter-prose ul { list-style: disc; margin: 0 0 14px; padding-left: 22px; }
        .book-chapter-prose ol { list-style: decimal; margin: 0 0 14px; padding-left: 22px; }
        .book-chapter-prose li { margin-bottom: 4px; }
        .book-chapter-prose li p { margin: 0; }
        /* The spacer that carries the flow from one page to the next. It has
           no appearance of its own — the page sheets behind it are what you
           see through the gap. */
        .book-chapter-prose .book-page-break { width: 100%; user-select: none; pointer-events: none; }
        /* Tailwind's preflight resets <a> to inherit both colour and
           decoration, so a link in the body was indistinguishable from the text
           around it — you could only find one by clicking.

           Fixed blue/purple rather than theme.accentColor: blue-then-purple is
           the one piece of web typography every reader already knows, and a
           themed link colour would make "visited" mean something different in
           every template. Browsers only allow a handful of properties on
           :visited (colour is one), which is why the rule is colour-only. */
        .book-chapter-prose a { color: ${LINK_COLOR}; text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; cursor: pointer; }
        /* Visited only in the reader view. In the editor a link's colour would
           otherwise depend on the author's own browsing history — you'd paste a
           link you use every day and watch it come out purple in your own
           manuscript, which tells you nothing about the book. */
        .book-chapter-prose:not([contenteditable="true"]) a:visited { color: ${LINK_VISITED_COLOR}; }
        /* A quotation is set by indenting it and sizing it down — not by a fill,
           a border or a coloured bar down its side, all of which are web and
           magazine conventions that arrived here by way of CSS defaults.
           Butterick's Practical Typography gives the whole recipe for a block
           quotation as "reduce the point size and line spacing slightly" and
           "indent the text block between half an inch and a full inch on the
           left side, and optionally the same on the right" — no rule, no tint —
           and The Book Designer's nonfiction guidance is that "in nonfiction
           books, pull quotes are usually just in black … this is different from
           magazines, where they are often colorful". The tinted box also never
           survived export (epub.ts has never carried it), so the canvas was
           showing something no reader would ever see.

           The pull-quote layout is the same rule set louder: bigger, in the
           heading face, upright. Indentation carries both. */
        .book-chapter-prose blockquote {
          margin: 18px 34px; padding: 0; color: ${bodyColor}; font-style: italic; font-size: 0.95em;
        }
        /* Its own rule, not a conditional block interpolated into the one above.
           styled-jsx parses this CSS and re-emits it, and an interpolation
           sitting mid-declaration-list comes back out AFTER the static
           declarations that followed it in source — so font-style:normal here
           lost to the font-style:italic above, and a pull-quote rendered italic
           no matter what this said. A sibling rule of equal specificity, later in the
           sheet, cascades the way the source reads. */
        .book-chapter-prose.book-layout-quote-pull blockquote {
          font-size: 22px; font-family: ${theme.headingFont}; font-style: normal; color: ${headingColor};
        }
        /* The Divider tile drops a bare <hr>, which had no rule of its own here and
           so came out as the browser's default inset 3D groove — and no selected
           state either, so clicking one (the only way to reach it) gave no sign it
           had worked. Selected, the line itself turns blue: a 1px rule is too thin
           for the outline ring the other objects use to read as a selection. */
        .book-chapter-prose hr { border: none; height: 1px; background: ${BORDER}; margin: 26px 0; }
        /* A divider is 1px tall, and that was also the whole of its hit area:
           clicking one selected it only if the pointer landed on that exact row
           of pixels — one px either side missed — so in practice a divider
           could not be selected at all. Padding grows the box to 23px while
           background-clip keeps the paint on the rule, and the margin drops by
           the same amount so nothing on the page moves: 15 + 11 either side is
           the 26 it always was.

           Here rather than in Divider's renderHTML, and !important to beat that
           node's inline style, because renderHTML's output is what gets stored
           and exported — and this trick leans on background-clip, which a
           reading system may not implement. Where it isn't implemented the rule
           paints across the whole padded box, so an exported divider would come
           out a thick bar. Confining it to the canvas keeps the export exactly
           as it was. box-sizing is spelled out because the app sets border-box
           globally, under which 1px of height and 11px of padding collapse the
           content box to nothing and the rule vanishes.

           (A ::before overlay was the tidier idea and doesn't work: it renders
           on an hr but takes no part in hit-testing.) */
        .book-chapter-prose hr {
          box-sizing: content-box !important;
          padding: 11px 0 !important;
          margin-top: 15px !important;
          margin-bottom: 15px !important;
          background-clip: content-box !important;
        }
        /* background-COLOR, not the shorthand: the shorthand resets
           background-clip to border-box, which spread the blue across all 23px
           and turned a selected divider into a solid bar. No outline-offset —
           the padding is already clear space, so the ring lands on the edge of
           the box you actually click. */
        .book-chapter-prose hr.ProseMirror-selectednode { background-color: ${BLUE} !important; outline: ${RING}; outline-offset: 0; }
        .book-chapter-prose.is-two-col { column-count: 2; column-gap: 28px; }
        .book-img-wrap { margin: 0; border-radius: 8px; }
        .book-img-wrap img { display: block; width: 100%; border-radius: 8px; }
        .book-img-wrap figcaption { font-family: ${bodyFont}; font-size: 12.5px; color: #6B7686; text-align: center; line-height: 1.4; margin-top: 6px; outline: none; }
        /* The canvas keeps a figcaption on every image so there is always
           somewhere to click, but an uncaptioned image must not reserve a blank
           line for it. It collapses unless the image is selected or the caption
           itself has focus — which is exactly when someone might add one. The
           reader view never selects anything, so there it simply never shows. */
        .book-img-wrap figcaption:empty { display: none; }
        .book-img-wrap.book-img-capt-open figcaption:empty,
        .book-img-wrap figcaption:empty:focus { display: block; }
        .book-img-wrap figcaption:empty::before { content: 'Add a caption'; color: #A6B0BD; }
        .book-img-wrap--inline { display: block; max-width: 100%; margin: 16px auto; }
        .book-img-wrap--left { float: left; max-width: 46%; margin: 4px 18px 10px 0; }
        .book-img-wrap--right { float: right; max-width: 46%; margin: 4px 0 10px 18px; }
        .book-img-wrap--full-bleed { display: block; width: 100%; margin: 20px 0; max-width: none; }
        /* image-led: the first image in the chapter body bleeds to the page's own
           edge (canceling the 55px/63px page padding) regardless of which wrap
           style the user picked, instead of a full-bleed variant being something
           they have to remember to choose by hand. */
        .book-chapter-prose.is-image-led > .book-img-wrap:first-child,
        .book-chapter-prose.is-image-led > p:first-child > .book-img-wrap:only-child {
          display: block; float: none; width: calc(100% + 126px); max-width: none;
          margin: -55px -63px 24px; border-radius: 0;
        }
        .book-chapter-prose.is-image-led > .book-img-wrap:first-child img,
        .book-chapter-prose.is-image-led > p:first-child > .book-img-wrap:only-child img { border-radius: 0; }
        .book-chapter-prose p.is-editor-empty:first-child::before { color: currentColor; opacity: 0.5; content: attr(data-placeholder); float: left; pointer-events: none; height: 0; }
        /* Tint plus a bar down the left edge, and nothing else. The 1px surround
           it used to carry was doing no work the fill wasn't already doing —
           the fill is what separates the box from the page, the bar is what
           colours it — and the two together drew the same boundary twice, in
           two different strengths. It's also the dominant convention in the
           systems that ship this component (Bootstrap/CoreUI's callout sets its
           left border to 4x the others; Supabase's admonition is a tinted panel
           with a 4px left accent). Square against the bar, rounded away from
           it, so the bar reads as an edge rather than a cropped outline. */
        .book-chapter-prose .book-callout { background: #EAF2FF; border: none; border-left: 3px solid #2563EB; border-radius: 0 6px 6px 0; padding: 4px 18px; margin: 18px 0; }
        ${CALLOUT_TYPES.map((c) => `
        .book-chapter-prose .book-callout--${c.id} { background: ${c.tint}; border-left-color: ${c.accent}; }`).join('')}
        .book-chapter-prose .book-callout p:last-child { margin-bottom: 0; }
        .book-chapter-prose table { border-collapse: collapse; width: 100%; margin: 18px 0; font-size: 14px; }
        .book-chapter-prose th, .book-chapter-prose td { border: 1px solid ${BORDER}; padding: 8px 12px; text-align: left; }
        /* A bare superscript numeral — no brackets. That's the book
           convention (Chicago, Word, Vellum, Atticus all produce it); square
           brackets are a Wikipedia/IEEE citation idiom and read as a reference
           list, not a note. Line-height 0 keeps the superscript from opening up
           the line it sits on.

           But a 6px numeral is a poor target and easy to mistake for a real
           superscript ("1st", "x²"), so in the EDITOR it also gets a tint, a
           radius and padding: there it's a control, and it should look like
           one. The preview and the exported book get the plain numeral in body
           colour, which is what a typeset footnote looks like. Scoped on
           contenteditable because PreviewPage reuses this same class. */
        .book-chapter-prose .book-footnote-ref { font-size: 0.72em; line-height: 0; vertical-align: super; font-weight: 700; }
        .book-chapter-prose[contenteditable="true"] .book-footnote-ref {
          color: #006EFE; background: #EAF2FF; border-radius: 3px; padding: 1px 3px; margin: 0 1px; cursor: pointer;
        }
        .book-chapter-prose[contenteditable="true"] .book-footnote-ref:hover { background: #D6E6FF; }
        .book-chapter-prose[contenteditable="true"] .book-footnote-ref.ProseMirror-selectednode { background: #BBD6FF; outline: none; }
        .book-chapter-prose ol.book-footnotes { margin: 30px 0 0; padding: 14px 0 0 20px; border-top: 1px solid ${BORDER}; font-size: 12.5px; color: ${SLATE}; }
        .book-chapter-prose ol.book-footnotes li { margin: 5px 0; }
        .book-chapter-prose ol.book-footnotes p { margin: 0; }
        /* Placed: the pagination plugin has worked out which page each note
           belongs to, so the list stops being a block at the end of the
           chapter and becomes nothing — its items are positioned one page at a
           time against the wrapper the prose sits in. The rule and the space
           above it move onto whichever note opens a page's group, since that's
           the one that has to separate itself from the body text; the room for
           all of it was taken out of that page's text band before the flow was
           measured, so nothing is overlapping anything. */
        .book-chapter-prose ol.book-footnotes.book-fn-paged { margin: 0; padding: 0; border-top: none; height: 0; }
        /* list-style-position:inside, with a hanging indent built from
           text-indent + padding, is the only way to keep the number in the
           column: an absolutely positioned item establishes its own box, so an
           outside marker is laid out to the LEFT of that box and the numbers
           hung out in the page margin instead of lining up with the text. */
        .book-chapter-prose ol.book-footnotes.book-fn-paged > li.book-fn-placed {
          position: absolute; left: 0; right: 0; margin: 0;
          list-style-position: inside; padding-left: 20px; text-indent: -20px;
        }
        .book-chapter-prose ol.book-footnotes.book-fn-paged > li.book-fn-placed p { display: inline; }
        .book-chapter-prose ol.book-footnotes.book-fn-paged > li.book-fn-first {
          border-top: 1px solid ${BORDER}; padding-top: 10px; margin-top: 0;
        }
        .book-chapter-prose th { background: #F7F8FA; font-weight: 700; color: ${INK}; }
        /* position:relative so the handle layer has something to sit against,
           and the art fills the box so a stretched shape stretches. */
        .book-shape { display: inline-block; position: relative; margin: 8px 12px 8px 0; vertical-align: top; }
        .book-shape .book-shape-art { width: 100%; height: 100%; display: block; }
        .book-shape .book-shape-art svg { display: block; }
        .book-embed { margin: 18px 0; border-radius: 8px; overflow: hidden; background: #F0F2F5; }
        .book-embed--video { position: relative; aspect-ratio: 16/9; }
        /* An iframe is opaque to the parent document's click handling — a click
           landing on the rendered video never reaches ProseMirror at all, so the
           block could never be selected (no Properties, no floating-bar
           duplicate/delete) by clicking the one thing you'd actually click.
           pointer-events:none by default so the first click selects the wrapper
           instead; once selected (ProseMirror's own selectednode class, already
           used for the other atom types' outline below) a second click can
           reach the iframe to actually play it. */
        .book-embed--video iframe { width: 100%; height: 100%; display: block; pointer-events: none; }
        .book-chapter-prose .ProseMirror-selectednode .book-embed--video iframe { pointer-events: auto; }
        .book-embed--audio { padding: 14px; }
        .book-embed--audio audio { width: 100%; display: block; }
        .book-author-name { font-family: ${bodyFont}; font-style: italic; letter-spacing: 0.02em; color: ${bodyColor}; text-align: center; }
        .book-display-text { font-family: ${theme.headingFont}; font-size: 30px; text-align: center; color: ${headingColor}; margin: 24px 0; }
        ${TEXT_STYLES.map((s) => `
        .book-textstyle--${s.id} {
          font-family: ${s.fontFamily}; font-size: ${s.fontSize}px; color: ${s.color}; text-align: center; margin: 18px 0;
          ${s.fontWeight ? `font-weight: ${s.fontWeight};` : ''}
          ${s.fontStyle ? `font-style: ${s.fontStyle};` : ''}
          ${s.letterSpacing ? `letter-spacing: ${s.letterSpacing};` : ''}
          ${s.textTransform ? `text-transform: ${s.textTransform};` : ''}
        }`).join('')}
        .book-textstyle--gilded {
          text-decoration: underline; text-decoration-color: #C9A94A; text-decoration-thickness: 1.5px; text-underline-offset: 6px;
        }
        .book-columns { column-gap: 28px; margin: 18px 0; }
        .book-columns--2 { column-count: 2; }
        .book-columns--3 { column-count: 3; }
        .book-columns--4 { column-count: 4; }
        /* Two genuinely independent cells, not one flowing stream like .book-columns
           above — reuses the plain table's own border/th/td rules by default, so
           these strip that chrome back down to a bare two-pane layout. */
        .book-chapter-prose .book-split-columns { border: none; margin: 18px 0; width: 100%; }
        .book-chapter-prose .book-split-columns td { border: none; padding: 0; vertical-align: top; }
        .book-chapter-prose .book-split-columns td:first-child { padding-right: 14px; }
        .book-chapter-prose .book-split-columns td:last-child { padding-left: 14px; }
        .book-chapter-prose .book-split-columns--1-3 td:first-child { width: 33.333%; }
        .book-chapter-prose .book-split-columns--1-3 td:last-child { width: 66.667%; }
        .book-chapter-prose .book-split-columns--3-1 td:first-child { width: 66.667%; }
        .book-chapter-prose .book-split-columns--3-1 td:last-child { width: 33.333%; }
        .book-image-grid { display: grid; gap: 12px; margin: 20px 0; }
        .book-image-grid--2 { grid-template-columns: repeat(2, 1fr); }
        .book-image-grid--3 { grid-template-columns: repeat(3, 1fr); }
        .book-image-grid--4 { grid-template-columns: repeat(4, 1fr); }
        .book-image-grid .book-img-wrap--inline { margin: 0; }
        /* Cells are equal boxes and photos fill them. Without this each figure
           kept its own natural aspect, so a grid of a landscape and a portrait
           shot came out ragged — which is the one thing a grid is supposed to
           avoid. aspect-ratio degrades gracefully: a reader too old to support
           it just falls back to natural heights, i.e. the old behaviour. */
        .book-image-grid > figure { aspect-ratio: 4 / 3; overflow: hidden; }
        /* When the grid is given an explicit height the cells share it instead
           of each keeping the 4:3 default, which is the whole point of setting
           one. Fill/Fit then decides whether a photo is trimmed to fill its cell
           or shown whole inside it — the same two words the photo's own panel
           uses, one level up. */
        .book-image-grid[data-h] { grid-auto-rows: 1fr; }
        .book-image-grid[data-h] > figure { aspect-ratio: auto; height: 100%; }
        .book-image-grid > figure img { width: 100%; height: 100%; }
        .book-image-grid[data-fit="cover"] > figure img { object-fit: cover; }
        .book-image-grid[data-fit="contain"] > figure img { object-fit: contain; }
        .book-image-grid > figure > img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .book-image-grid[data-fit="contain"] > figure > img { object-fit: contain; background: #F2F4F7; }
        /* An empty cell, left behind when the column count grows past the number
           of photos. A real node rather than blank space, so the grid keeps its
           shape and the gap is obviously fillable rather than looking broken. */
        .book-image-grid > figure[data-empty] { display: flex; align-items: center; justify-content: center;
          border: 1.5px dashed #C7CEDA; border-radius: 6px; background: #F7F8FA; }
        .book-image-grid > figure[data-empty] > img { display: none; }
        .book-image-grid > figure[data-empty]::after { content: '+ Add photo'; font-family: ${bodyFont};
          font-size: 12px; font-weight: 600; color: #8A94A6; }
        .book-chart { margin: 18px 0; max-width: 480px; }
        .book-chart svg { display: block; width: 100%; height: auto; }
        .book-qr { display: flex; align-items: center; gap: 12px; margin: 16px 0; padding: 12px; border: 1px solid ${BORDER}; border-radius: 8px; background: #fff; width: fit-content; }
        .book-qr-url { font-family: ${bodyFont}; font-size: 12.5px; color: #6B7686; word-break: break-all; max-width: 220px; }
        .book-textfield { margin: 14px 0; max-width: 360px; }
        .book-textfield-label { display: block; font-family: ${bodyFont}; font-size: 12px; font-weight: 600; color: #6B7686; margin-bottom: 5px; }
        .book-textfield-box { height: 36px; border: 1px solid ${BORDER}; border-radius: 6px; background: #F7F8FA; }
        .book-jumbotron { margin: 22px 0; padding: 32px; border-radius: 10px; text-align: center; }
        .book-jumbotron-heading { font-family: ${theme.headingFont}; font-size: 22px; color: ${headingColor}; margin-bottom: 8px; }
        .book-jumbotron-body { font-family: ${bodyFont}; font-size: 14px; color: #52637A; margin-bottom: 16px; }
        .book-jumbotron-button { display: inline-block; font-family: ${bodyFont}; font-size: 13.5px; font-weight: 700; color: #fff; background: ${theme.accentColor}; border-radius: 7px; padding: 10px 20px; }
        .book-chapter-prose .book-checklist { list-style: none; padding-left: 0; }
        .book-checklist li { margin-bottom: 6px; }
        .book-answer-line { border-bottom: 1px solid ${BORDER}; height: 22px; margin: 0 0 14px; }
        /* Photo vs photo-grid focus. An image had no selection ring of its own at
           all — it inherited ProseMirror's default, which reads the same whether
           you've grabbed one cell or the whole grid. The grid is not itself
           selectable (there's no clickable gap around a cell, which is why
           grid-level controls surface on the cell's own inspector), so the pair
           has to say "this cell, inside this grid": a solid ring on the cell and a
           dashed one, further out, on the grid that contains it. Matches how Figma
           and Canva hint the parent while a child is selected. */
        /* A figure is a block, so it stayed full-column-width even once the photo
           inside it was given an explicit size — leaving the selection ring
           floating out around empty space. data-w is only emitted when a width is
           set, so this shrinks exactly those and leaves auto-width photos alone. */
        .book-chapter-prose figure.book-img-wrap[data-w] { width: fit-content; }
        .book-chapter-prose figure.book-img-wrap[data-w].book-img-wrap--inline { margin-left: 0; margin-right: auto; }
        .book-chapter-prose figure.book-img-wrap.ProseMirror-selectednode,
        /* The ring moved from the grid to the wrapper the node view puts
           around it — the wrapper is the node now, and the grid inside it is
           just its content box. */
        .book-chapter-prose .book-image-grid-wrap { position: relative; }
        .book-chapter-prose .book-image-grid.ProseMirror-selectednode,
        .book-chapter-prose .book-image-grid-wrap.ProseMirror-selectednode { outline: ${RING}; outline-offset: ${RING_OFFSET}px; border-radius: ${RING_RADIUS}px; }
        /* Resize handles. The dots sit on the box's own corners rather than on
           the selection ring's, which is 2px further out — a handle centred on
           the ring reads as belonging to the ring, and the ring is not the
           thing being dragged. The wrapper takes no pointer events so the
           photo underneath still accepts a click everywhere except the dots. */
        .book-chapter-prose .book-resize-handles { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
        .book-chapter-prose .book-resize-dot {
          position: absolute; width: 9px; height: 9px; border-radius: 50%;
          background: #fff; border: 1.5px solid ${BLUE}; pointer-events: auto;
        }
        .book-chapter-prose .book-resize-dot--tl { top: -4.5px; left: -4.5px; }
        .book-chapter-prose .book-resize-dot--tr { top: -4.5px; right: -4.5px; }
        .book-chapter-prose .book-resize-dot--bl { bottom: -4.5px; left: -4.5px; }
        .book-chapter-prose .book-resize-dot--br { bottom: -4.5px; right: -4.5px; }
        /* The handle layer is positioned against the figure, so the figure has
           to be a containing block. Figures here are already in the flow with
           no offsets of their own, so this changes nothing else. */
        .book-chapter-prose figure:has(> .book-resize-handles) { position: relative; }
        /* The quieter half of the pair: dashed and translucent, and sitting
           outside the cell's own ring rather than replacing it. */
        .book-chapter-prose .book-image-grid:has(> figure.ProseMirror-selectednode) { outline: ${RING_WIDTH}px dashed rgba(0,110,254,0.45); outline-offset: ${RING_OFFSET + 4}px; border-radius: ${RING_RADIUS}px; }
        /* The container/caret pair described on ActiveBlockRing above. Both
           scoped to ProseMirror-focused because every chapter is its own editor
           and keeps its own caret — unscoped, each chapter you had visited would
           hold a ring on the last block you touched there, and several pages
           would claim to be selected at once. */
        .book-chapter-prose.ProseMirror-focused .book-block-active,
        .book-chapter-prose.ProseMirror-focused .book-text-active { outline: ${RING}; outline-offset: ${RING_OFFSET}px; }
        /* A paragraph split across a page is still ONE box, so its ring is one
           rectangle running from the middle of one sheet to the middle of the
           next — two blue lines down the gutter between them. Nothing draws a
           box around the paragraph you're typing in in Word or Google Docs
           either; the caret is the affordance, and here the block menu and the
           handle in the margin still track it. */
        .book-chapter-prose.ProseMirror-focused .book-text-active:has(> [data-page-break]) { outline: none; }
        .book-chapter-prose .ProseMirror-selectednode.book-shape,
        .book-chapter-prose .ProseMirror-selectednode .book-embed,
        .book-chapter-prose .ProseMirror-selectednode .book-qr,
        .book-chapter-prose .ProseMirror-selectednode .book-textfield,
        .book-chapter-prose .ProseMirror-selectednode .book-jumbotron { outline: ${RING}; outline-offset: ${RING_OFFSET}px; }
        /* The ring's corners come from whatever it's around — a jumbotron's 10px
           box, a photo's 8px one. These four have square corners of their own
           and nothing visible to square off, so they borrow the shared radius
           rather than ringing sharp against everything else's rounded. */
        .book-chapter-prose p.book-text-active,
        .book-chapter-prose h3.book-text-active,
        .book-chapter-prose .book-image-grid.ProseMirror-selectednode,
        .book-chapter-prose .book-columns.book-block-active,
        .book-chapter-prose table.book-block-active,
        .book-chapter-prose .tableWrapper.book-block-active,
        .book-chapter-prose .ProseMirror-selectednode.book-shape,
        .book-chapter-prose .ProseMirror-selectednode .book-textfield { border-radius: ${RING_RADIUS}px; }
        /* No :focus rule of its own — the title is a .book-simple-editable like
           every other single-field editor and takes the shared ring from there. */
        .book-chapter-title { outline: none; border-radius: ${RING_RADIUS}px; }
        .book-chapter-title p, .book-chapter-title h2, .book-chapter-eyebrow p { margin: 0; font: inherit; color: inherit; }
        .book-chapter-eyebrow { outline: none; border-radius: ${RING_RADIUS}px; }
        .book-chapter-title p.is-editor-empty:first-child::before,
        .book-chapter-title h2.is-editor-empty:first-child::before,
        .book-chapter-eyebrow p.is-editor-empty:first-child::before { color: currentColor; opacity: 0.5; content: attr(data-placeholder); float: left; pointer-events: none; height: 0; }
      `}</style>

      {page.layout === 'opener' && (
        page.openerImage ? (
          <div
            onClick={() => onSelection({ kind: 'openerImage', chapterId: page.id })}
            onDragEnter={(e) => { e.preventDefault(); setOpenerDragOver(true); }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => setOpenerDragOver(false)}
            onDrop={handleOpenerDrop}
            style={{
              position: 'relative', margin: '-55px -63px 20px', height: 220, cursor: 'pointer', overflow: 'hidden',
              // Inset, not outside — see RING_OFFSET_INSET: this photo bleeds
              // past the page's own edge, so an outward ring would be off-sheet.
              outline: openerDragOver ? `${RING_WIDTH}px dashed ${BLUE}` : openerSelected ? RING : 'none', outlineOffset: RING_OFFSET_INSET,
            }}
            title="Click to replace this photo, or drag one here"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={page.openerImage} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.78) 100%)' }} />
            <div className="flex items-center justify-between" style={{ position: 'absolute', left: 24, right: 24, bottom: 16 }}>
              {/* Same field key as the plain opener's eyebrow, so a chapter labelled
                  "Part" keeps that word when a photo is added or removed. The click
                  guard stops the photo underneath claiming the selection while you
                  are typing in the text on top of it. */}
              <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                <SimpleFieldEditor
                  fieldKey={`${page.id}::eyebrow`}
                  initialHtml={eyebrowHtml}
                  placeholder="Label"
                  className="book-chapter-eyebrow"
                  style={{ ...ns, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fff' }}
                  onSelection={onSelection}
                  onEditorFocus={onEditorFocus}
                  onContentChange={onFieldChange}
                />
              </div>
              <span style={{ fontFamily: theme.headingFont, fontWeight: 800, fontSize: 40, lineHeight: 1, color: '#fff' }}>{chapterNumber}</span>
            </div>
          </div>
        ) : (
          <div
            onDragEnter={(e) => { e.preventDefault(); setOpenerDragOver(true); }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => setOpenerDragOver(false)}
            onDrop={handleOpenerDrop}
            onClick={() => onSelection({ kind: 'openerImage', chapterId: page.id })}
            title="Click to choose a photo, or drag one here"
            style={{ position: 'relative', outline: openerDragOver ? `2px dashed ${BLUE}` : openerSelected ? RING : 'none', outlineOffset: 4 }}
          >
            {/* Two objects, not one graphic: the rule selects as a shape (width,
                thickness, colour — the Divider block's own vocabulary) and the
                eyebrow is a text field you can retype and format. They used to be
                inert template decoration sitting under a "+ Add photo" button and
                beside a large grey numeral, neither of which could be selected,
                edited or removed. The wrapper still takes a click on the empty
                space beside them, which is the opener photo — the one thing here
                that has no object on the page until you add it. */}
            <button
              onClick={(e) => { e.stopPropagation(); onSelection({ kind: 'openerRule', chapterId: page.id }); }}
              className="cursor-pointer"
              aria-label="Chapter rule"
              /* Named, because the wrapper's own "click to choose a photo" title
                 would otherwise show through on hover and mislabel both of these. */
              title="Chapter rule"
              style={{
                display: 'block', padding: 0, border: 'none', background: 'none', marginBottom: 14,
                outline: ruleSelected ? RING : 'none', outlineOffset: RING_OFFSET, borderRadius: RING_RADIUS,
              }}
            >
              <div style={{ height: openerRule.thickness, width: openerRule.width, background: openerRule.color, borderRadius: 2 }} />
            </button>
            <div
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              title="Chapter label"
              style={{ display: 'inline-block', minWidth: 60, marginBottom: 6 }}
            >
              <SimpleFieldEditor
                fieldKey={`${page.id}::eyebrow`}
                initialHtml={eyebrowHtml}
                placeholder="Label"
                className="book-chapter-eyebrow"
                style={{ ...ns, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: theme.accentColor }}
                onSelection={onSelection}
                onEditorFocus={onEditorFocus}
                onContentChange={onFieldChange}
              />
            </div>
          </div>
        )
      )}
      <div className="relative group">
        <SimpleFieldEditor
          fieldKey={`${page.id}::title`}
          initialHtml={titleHtml}
          placeholder="Chapter title"
          className="book-chapter-title"
          style={{
            position: 'relative', fontFamily: theme.headingFont, color: headingColor,
            fontSize: page.layout === 'opener' ? 38 : 26,
            margin: page.layout === 'opener' ? '0 0 20px' : '0 0 14px',
          }}
          onSelection={onSelection}
          onEditorFocus={onEditorFocus}
          onContentChange={onTitleChange}
        />
        <TitleAssistMenu
          onSuggest={() => {
            const suggestion = suggestChapterTitle(editor?.getText() ?? '');
            const titleKey = `${page.id}::title`;
            getFieldEditor(titleKey)?.commands.setContent(suggestion);
            onTitleChange(titleKey, suggestion);
          }}
        />
      </div>
      {/* Above the page sheets drawn behind it — they're absolutely positioned,
          so the flow needs its own stacking context to stay on top. */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <EditorContent editor={editor} className={page.layout === 'two-column' ? 'is-two-col' : page.layout === 'image-led' ? 'is-image-led' : ''} />
      </div>
      <TextSelectionBubbleMenu editor={editor} />
    </div>
  );
}

/* Dual-sparkle mark — the manuscript flow's own AI glyph (ChatMessage's
   SparkleIcon, used throughout the book-writing chat), not the presentation
   editor's icon-in-tinted-square. Kept as its own piece so the icon itself
   carries the "AI" meaning while the surrounding button stays plain/neutral,
   matching how the writing chat treats it — never a solid gradient chip. */
function SparkleMark() {
  return (
    <span className="flex-shrink-0" style={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
      <svg width="7" height="7" viewBox="0 0 12 12" fill="#4f46e5"><path d="M6 0L7.5 4.5L12 6L7.5 7.5L6 12L4.5 7.5L0 6L4.5 4.5L6 0Z" /></svg>
      <svg width="5" height="5" viewBox="0 0 12 12" fill="#7c3aed" style={{ marginTop: 2 }}><path d="M6 0L7.5 4.5L12 6L7.5 7.5L6 12L4.5 7.5L0 6L4.5 4.5L6 0Z" /></svg>
    </span>
  );
}

/* Wordgenie's real block menu: a "···" trigger that only appears once the caret is
   inside a given paragraph (not a persistent per-block handle), opening a flyout of
   Rewrite / Adjust tone / Fix spelling & grammar / Reduce / Expand — scoped to that
   whole block, not a text selection. This replaced an earlier selection-anchored
   floating bar; the block-menu is what the real product actually does. Everything
   here is mocked like every other AI affordance in this prototype: a realistic
   delay and a canned result, no network call. */
const TONE_OPTIONS = ['Neutral', 'Friendly', 'Excited', 'Persuasive', 'Intellectual'] as const;

// Matches the real product's measured draft-enhance failure rate (~25% average
// across a 3-month baseline, spiking to ~39% some weeks) — Mixpanel data showed
// these failures are silently absorbed today (no retry event, no help-click or
// deletion spike on the worst weeks), so this prototype gives the failure a
// visible, actionable state instead of the real product's apparent silent one.
const WORDGENIE_FAILURE_RATE = 0.25;

function BlockActionBar({
  editor, chapterId, pos, top, left, onRunStart, onRunEnd, onSplit, onBeginEdit,
}: {
  editor: Editor;
  chapterId: string;
  pos: number;
  top: number;
  left: number;
  onRunStart: () => void;
  onRunEnd: () => void;
  onSplit: () => void;
  onBeginEdit: (chapterId: string) => { commit: (label: string) => void };
}) {
  const [open, setOpen] = useState(false);
  const [toneOpen, setToneOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ label: string; retry: () => void } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  const closeMenu = () => { setOpen(false); setToneOpen(false); setError(null); };

  // Matches FloatingObjectBar's own buttons — same 28px box, same radius — so
  // the two bars are one control at two anchors, not two lookalikes.
  const barBtn: React.CSSProperties = {
    width: 28, height: 28, borderRadius: RADIUS_SM, border: 'none', background: 'none',
    color: INK, flexShrink: 0,
  };

  /* Which rows the menu can actually take. The AI actions rewrite one run of
     text, so they only apply to a textblock — a pull-quote, callout or list keeps
     its text in child paragraphs, and rewriting the container as a single string
     would flatten it back to one. Duplicate and Delete apply to any block, which
     is why they're in the bar and not behind this test. */
  const canRewrite = !!editor.state.doc.nodeAt(pos)?.isTextblock;

  /* Instant and real, unlike the simulated AI calls above — so no busy/error
     state, just the same undo toast every other structural edit offers. The node
     is re-resolved at click time for the reason run() does it: the block may have
     moved since the trigger was drawn. */
  const structural = (label: string, apply: (node: PMNode, at: number) => void) => {
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    const edit = onBeginEdit(chapterId);
    apply(node, pos);
    edit.commit(label);
    closeMenu();
  };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) closeMenu();
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const run = (label: string, transform: (text: string) => string) => {
    // The block itself may have moved/resized since the trigger was drawn, so
    // re-resolve it fresh at run time rather than trusting the pos this menu
    // was opened with.
    const node = editor.state.doc.nodeAt(pos);
    if (!node || !node.isTextblock) return;
    const from = pos + 1;
    const to = pos + node.nodeSize - 1;
    const current = editor.state.doc.textBetween(from, to, ' ');
    if (!current.trim()) return;
    // Captured now, while state is still pre-edit — a failed run below never
    // calls .commit(), so no undo toast appears for an edit that never happened.
    const edit = onBeginEdit(chapterId);
    setBusy(true);
    setError(null);
    onRunStart();
    setTimeout(() => {
      if (Math.random() < WORDGENIE_FAILURE_RATE) {
        // Stay open on failure rather than silently closing — the whole point
        // is that this state used to be invisible.
        setBusy(false);
        setError({ label, retry: () => run(label, transform) });
        return;
      }
      editor.chain().focus().insertContentAt({ from, to }, transform(current)).run();
      edit.commit(`${label} applied`);
      setBusy(false);
      closeMenu();
      onRunEnd();
    }, 900);
  };

  // Distinct per-action icon, matching the reference menu (each item had its own
  // glyph, not one repeated icon) rather than every row sharing SparkleMark.
  const items: { label: string; icon: React.ReactNode; action: () => void }[] = [
    {
      label: 'Rewrite',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="#4f46e5"><path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2L12 2z" /></svg>,
      action: () => run('Rewrite', (t) => t), // canned no-op transform, realistic latency is the point
    },
    {
      label: 'Fix spelling & grammar',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15l3-8 3 8M4.8 13h4.4" />
          <path d="M14 6h6M14 10h6M15 18l2 2l4-4" />
        </svg>
      ),
      action: () => run('Fix spelling & grammar', (t) => t),
    },
    {
      label: 'Reduce',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" />
        </svg>
      ),
      action: () => run('Reduce', (t) => t.split(' ').slice(0, Math.max(4, Math.ceil(t.split(' ').length * 0.6))).join(' ') + '…'),
    },
    {
      label: 'Expand',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      ),
      action: () => run('Expand', (t) => t + ' — a detail worth lingering on, rather than rushing past.'),
    },
  ];

  return (
    <div ref={ref} className="absolute" style={{ top, left, zIndex: 10 }} onMouseDown={(e) => e.preventDefault()}>
      {/* Same bar, same place as a selected image's — see FloatingObjectBar and
          blockBarPos. A paragraph, pull-quote, callout or list can't take a node
          selection (the caret has to stay free to reach TextInspector), so this
          one is driven by the hovered/caret block instead, but it reads as the
          one floating bar the editor has rather than a second vocabulary. */}
      <div className="flex items-center" style={{ gap: 1, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, padding: 3, boxShadow: MENU_SHADOW, width: 'max-content' }}>
        <Tooltip label="Duplicate" position="top">
          <button
            onClick={() => structural('Block duplicated', (node, at) => {
              editor.chain().focus().insertContentAt(at + node.nodeSize, node.toJSON()).run();
            })}
            aria-label="Duplicate block"
            className="flex items-center justify-center cursor-pointer"
            style={barBtn}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F6F8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            <DuplicateIcon color={INK} />
          </button>
        </Tooltip>
        {/* The one path to removing a block that isn't a click-to-select object:
            a pull-quote, callout, list, checklist or plain paragraph. Before
            this existed, deleting a dropped pull-quote or divider meant knowing
            to put the caret after it and press Backspace. */}
        <Tooltip label="Delete" position="top">
          <button
            onClick={() => structural('Block deleted', (node, at) => {
              editor.chain().focus().deleteRange({ from: at, to: at + node.nodeSize }).run();
            })}
            aria-label="Delete block"
            className="flex items-center justify-center cursor-pointer"
            style={{ ...barBtn, color: '#B91C1C' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
          </button>
        </Tooltip>
        <div style={{ width: 1, height: 18, background: BORDER, margin: '0 2px', flexShrink: 0 }} />
        {/* Everything else this block can do — the AI rewrites and Split chapter
            here. They stay in a menu because they're named operations you pick
            by reading, not two icons you already know the shape of. */}
        <Tooltip label="More actions" position="top">
          <button
            onClick={() => (open ? closeMenu() : setOpen(true))}
            aria-label="More actions"
            className="flex items-center justify-center cursor-pointer"
            style={{ ...barBtn, background: open ? '#F4F6F9' : 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F6F8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = open ? '#F4F6F9' : 'none'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill={SLATE}><circle cx="5" cy="12" r="2.2" /><circle cx="12" cy="12" r="2.2" /><circle cx="19" cy="12" r="2.2" /></svg>
          </button>
        </Tooltip>
      </div>
      {open && (
        /* Beside the bar, not under it: the bar already sits above the block, so
           a menu dropping down from it would cover the very paragraph its
           actions are about. 210 + the bar's own width still lands inside the
           page's content column. */
        <div className="absolute bg-white flex flex-col" style={{ top: 0, left: '100%', marginLeft: 6, zIndex: 11, width: 210, padding: 5, borderRadius: RADIUS_LG, border: `1px solid ${PANEL_BORDER}`, boxShadow: MENU_SHADOW }}>
          {busy ? (
            <div className="flex items-center" style={{ gap: 7, padding: '8px 9px', ...ns, fontSize: 13, color: SLATE }}>
              <SparkleMark /> Working…
            </div>
          ) : error ? (
            <div className="flex flex-col" style={{ padding: '9px 9px 8px', gap: 8 }}>
              <div className="flex items-start" style={{ gap: 7 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B91C1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                  <path d="M12 9v4M12 17h.01M10.3 3.9L2.8 17a1.8 1.8 0 0 0 1.55 2.7h15.3A1.8 1.8 0 0 0 21.2 17L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" />
                </svg>
                <span style={{ ...ns, fontSize: 12.5, color: INK, lineHeight: 1.4 }}>{error.label} didn't go through. Nothing was changed.</span>
              </div>
              <div className="flex items-center" style={{ gap: 6 }}>
                <button
                  onClick={error.retry}
                  className="cursor-pointer"
                  style={{ ...ns, fontSize: 12.5, fontWeight: 500, color: '#fff', background: INK, border: 'none', borderRadius: RADIUS_SM, padding: '6px 11px' }}
                >
                  Retry
                </button>
                <button
                  onClick={() => setError(null)}
                  className="cursor-pointer"
                  style={{ ...ns, fontSize: 12.5, color: SLATE, background: 'transparent', border: 'none', borderRadius: RADIUS_SM, padding: '6px 11px' }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Block style used to lead this menu, added back when a bare caret
                  couldn't reach Properties. It can now (see isElementSelection),
                  so what's left here is everything the bar itself can't say in an
                  icon: the AI rewrites and Split chapter here. */}
              {canRewrite && (<>
              <button
                onClick={() => setToneOpen((v) => !v)}
                className="flex items-center justify-between cursor-pointer"
                style={{ ...ns, fontSize: 13, color: INK, padding: '8px 9px', borderRadius: RADIUS_SM, border: 'none', background: toneOpen ? '#F4F6F9' : 'transparent', textAlign: 'left' }}
              >
                <span className="flex items-center" style={{ gap: 7 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="1.8" strokeLinecap="round"><path d="M3 12c2-4 4 4 6 0s4 4 6 0 4 4 6 0" /></svg>
                  Adjust tone
                </span>
                <span style={{ color: '#C3CBD6' }}>›</span>
              </button>
              {toneOpen && (
                <div className="absolute bg-white flex flex-col" style={{ top: 0, left: 216, zIndex: 12, width: 150, padding: 5, borderRadius: RADIUS_LG, border: `1px solid ${PANEL_BORDER}`, boxShadow: MENU_SHADOW }}>
                  {TONE_OPTIONS.map((tone) => (
                    <button
                      key={tone}
                      onClick={() => run(tone, (t) => t)} // canned no-op — a real tone rewrite needs live generation
                      className="cursor-pointer"
                      style={{ ...ns, fontSize: 13, color: INK, padding: '8px 9px', borderRadius: RADIUS_SM, border: 'none', background: 'transparent', textAlign: 'left' }}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              )}
              {items.map((it) => (
                <button
                  key={it.label}
                  onClick={it.action}
                  className="flex items-center cursor-pointer"
                  style={{ ...ns, fontSize: 13, color: INK, padding: '8px 9px', borderRadius: RADIUS_SM, border: 'none', background: 'transparent', textAlign: 'left', gap: 7 }}
                >
                  {it.icon} {it.label}
                </button>
              ))}
              <div style={{ height: 1, background: BORDER, margin: '4px 2px' }} />
              </>)}
              {/* A structural action, not an AI one — same scissors icon as the
                  top bar's own Split button, but split at this paragraph rather
                  than wherever the live text cursor happens to be. No busy/error
                  state needed: unlike the items above, this isn't a simulated
                  async call, it's the real, instant operation. */}
              <button
                onClick={() => { onSplit(); closeMenu(); }}
                className="flex items-center cursor-pointer"
                style={{ ...ns, fontSize: 13, color: INK, padding: '8px 9px', borderRadius: RADIUS_SM, border: 'none', background: 'transparent', textAlign: 'left', gap: 7 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12" />
                </svg>
                Split chapter here
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Deterministic-ish fallback titles for an empty chapter — picked at random on
// each click (like a reshuffle) rather than one fixed string, since "Suggest"
// implies trying again might give something different.
const TITLE_SUGGESTION_FALLBACKS = [
  'A New Direction', 'What Changed', 'The Turning Point', 'Before and After', 'Where It Started',
];
const TITLE_MINOR_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'to', 'for', 'with', 'at', 'by']);

/* Mocked like every other AI affordance here: no network call, a plausible
   derivation from real input instead. The chapter's own first sentence reads as
   a far more "real" suggestion than a fabricated one — same principle as
   qrModules seeding its pattern from the actual URL text above. */
function suggestChapterTitle(bodyText: string): string {
  const plain = bodyText.trim();
  if (!plain) return TITLE_SUGGESTION_FALLBACKS[Math.floor(Math.random() * TITLE_SUGGESTION_FALLBACKS.length)];
  const firstSentence = (plain.split(/(?<=[.!?])\s/)[0] || plain).replace(/[.!?]+$/, '');
  const words = firstSentence.split(/\s+/).filter(Boolean).slice(0, 6);
  return words
    .map((w, i) => (i > 0 && TITLE_MINOR_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

/* The title field's own "···" — much simpler than BlockActionBar's: one
   field, one option, no caret/hover position tracking needed (a title never
   moves relative to its own wrapper the way a body paragraph does), so a plain
   CSS-hover reveal on the wrapper (see the `group` class at the call site) does
   the job instead of the body menu's elementFromPoint machinery. Shares that
   menu's busy/error shape (and failure rate) for a consistent feel.
   Anchored inside the field's own top-right corner rather than floating in a
   left gutter the way the body menu does — body's `-34` offset is safe because
   it's measured against the real page padding; the title field sits flush
   against the canvas pane's own edge in some layouts, and a blind copy of that
   offset renders the trigger underneath the left rail instead of on the page. */
function TitleAssistMenu({ onSuggest }: { onSuggest: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ retry: () => void } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  const closeMenu = () => { setOpen(false); setError(null); };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) closeMenu();
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const run = () => {
    setBusy(true);
    setError(null);
    setTimeout(() => {
      if (Math.random() < WORDGENIE_FAILURE_RATE) {
        setBusy(false);
        setError({ retry: run });
        return;
      }
      onSuggest();
      setBusy(false);
      closeMenu();
    }, 900);
  };

  return (
    <div
      ref={ref}
      className="absolute opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
      style={{ top: 4, right: 4, zIndex: 10, ...(open ? { opacity: 1 } : {}) }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        onClick={() => (open ? closeMenu() : setOpen(true))}
        className="flex items-center justify-center cursor-pointer"
        style={{ width: 26, height: 26, borderRadius: RADIUS_SM, border: `1px solid ${PANEL_BORDER}`, background: open ? '#F4F6F9' : '#fff', boxShadow: CARD_SHADOW }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill={SLATE}><circle cx="5" cy="12" r="2.2" /><circle cx="12" cy="12" r="2.2" /><circle cx="19" cy="12" r="2.2" /></svg>
      </button>
      {open && (
        <div className="absolute bg-white flex flex-col" style={{ top: 32, right: 0, zIndex: 11, width: 190, padding: 5, borderRadius: RADIUS_LG, border: `1px solid ${PANEL_BORDER}`, boxShadow: MENU_SHADOW }}>
          {busy ? (
            <div className="flex items-center" style={{ gap: 7, padding: '8px 9px', ...ns, fontSize: 13, color: SLATE }}>
              <SparkleMark /> Working…
            </div>
          ) : error ? (
            <div className="flex flex-col" style={{ padding: '9px 9px 8px', gap: 8 }}>
              <div className="flex items-start" style={{ gap: 7 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B91C1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                  <path d="M12 9v4M12 17h.01M10.3 3.9L2.8 17a1.8 1.8 0 0 0 1.55 2.7h15.3A1.8 1.8 0 0 0 21.2 17L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" />
                </svg>
                <span style={{ ...ns, fontSize: 12.5, color: INK, lineHeight: 1.4 }}>Suggestion didn&rsquo;t go through. Nothing was changed.</span>
              </div>
              <div className="flex items-center" style={{ gap: 6 }}>
                <button
                  onClick={error.retry}
                  className="cursor-pointer"
                  style={{ ...ns, fontSize: 12.5, fontWeight: 500, color: '#fff', background: INK, border: 'none', borderRadius: RADIUS_SM, padding: '6px 11px' }}
                >
                  Retry
                </button>
                <button
                  onClick={() => setError(null)}
                  className="cursor-pointer"
                  style={{ ...ns, fontSize: 12.5, color: SLATE, background: 'transparent', border: 'none', borderRadius: RADIUS_SM, padding: '6px 11px' }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={run}
              className="flex items-center cursor-pointer"
              style={{ ...ns, fontSize: 13, color: INK, padding: '8px 9px', borderRadius: RADIUS_SM, border: 'none', background: 'transparent', textAlign: 'left', gap: 7 }}
            >
              <SparkleMark /> Suggest a title
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* Feedback toast after a Wordgenie action completes — matches the real product's
   "How did Wordgenie do?" prompt. Local to whichever chapter just ran an action;
   only one chapter can be actively edited at a time, so there's never more than
   one of these on screen regardless. */
function WordgenieToast({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  // Portalled straight to <body> — this renders from inside a chapter's page div,
  // which sits under the zoom wrapper's `transform: scale(...)`. A CSS transform
  // on any ancestor creates a new containing block for `position: fixed`
  // descendants, so without the portal this would be pinned to the (scaled, tall)
  // canvas instead of the viewport and could land thousands of pixels off-screen.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="flex items-center"
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 60, gap: 10, padding: '10px 12px', borderRadius: RADIUS_LG,
        background: '#fff', border: `1px solid ${PANEL_BORDER}`, boxShadow: '0px 8px 24px rgba(15,23,51,0.16)',
      }}
    >
      <span style={{ ...ns, fontSize: 13, color: INK }}>How did Wordgenie do?</span>
      <button onClick={onDismiss} className="cursor-pointer flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: RADIUS_SM, border: 'none', background: 'transparent' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
      <button onClick={onDismiss} className="cursor-pointer flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: RADIUS_SM, border: `1px solid ${BORDER}`, background: '#fff' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 22V11M2 13v7a2 2 0 0 0 2 2h12.5a2 2 0 0 0 2-1.5l1.5-6a2 2 0 0 0-2-2.5H14V4a2 2 0 0 0-4 0v2l-3 5" /></svg>
      </button>
      <button onClick={onDismiss} className="cursor-pointer flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: RADIUS_SM, border: `1px solid ${BORDER}`, background: '#fff', transform: 'scaleY(-1)' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 22V11M2 13v7a2 2 0 0 0 2 2h12.5a2 2 0 0 0 2-1.5l1.5-6a2 2 0 0 0-2-2.5H14V4a2 2 0 0 0-4 0v2l-3 5" /></svg>
      </button>
    </div>,
    document.body
  );
}

/* ── simple pages: Cover / TOC / Back-matter ──────────────────────────────────
   TOC/back-matter are still a fixed layout, not flowing text — deliberately
   lightweight rather than a canvas to position things on. The cover is the one
   exception: it's a real freeform canvas (see CoverCanvasEditable below), since
   unlike TOC/back-matter a cover's whole point is looking different per template —
   a fixed field layout can't do that, only reposition/restyle within one shape. */
/* A minimal per-field TipTap instance — the fix for Cover/TOC/Backmatter never
   surfacing the text editor: those fields used to be plain contentEditable divs
   with no Editor behind them at all, so focusing one could never engage
   TextInspector (it reads off a real TipTap Editor). Same wiring as
   ChapterEditor's onFocus/onSelectionUpdate, minus the block-level extensions
   (tables/images/shapes) a one-line title or bio never needs. */
function SimpleFieldEditor({
  fieldKey, initialHtml, placeholder, className, style, onSelection, onEditorFocus, onContentChange, selectionOnFocus,
}: {
  fieldKey: string;
  initialHtml: string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  onSelection: (sel: Selection) => void;
  onEditorFocus: (editor: Editor) => void;
  onContentChange: (fieldKey: string, html: string) => void;
  // Cover-canvas text elements need `{kind:'coverElement',...}` selected instead of the
  // default `{kind:'chapter',...}` this editor normally reports, so CoverElementInspector
  // (not the generic TextInspector) shows while one's focused. Every other caller
  // (TOC/backmatter/chapter fields) omits this and keeps today's behavior unchanged.
  selectionOnFocus?: Selection;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // trailingNode: false — StarterKit's TrailingNode extension auto-appends an
      // empty paragraph any time the doc's last node isn't a plain paragraph, so
      // it would add a phantom second line under every heading-only field (title,
      // TOC heading, etc.) the instant it's focused, visibly doubling the field's
      // height. Useful in the chapter body (lets you click after a trailing
      // image), wrong for these single-field editors.
      StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false }, trailingNode: false }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      // multicolor: true — the Highlight inspector offers a real swatch row, not
      // just an on/off toggle; without this the extension ignores the color
      // attribute entirely and always renders its single default yellow mark.
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: placeholder ?? 'Write…' }),
    ],
    content: initialHtml,
    onFocus: ({ editor: ed }) => { onEditorFocus(ed); onSelection(selectionOnFocus ?? { kind: 'chapter', chapterId: fieldKey }); },
    onSelectionUpdate: ({ editor: ed }) => { if (ed.isFocused) onSelection(selectionOnFocus ?? { kind: 'chapter', chapterId: fieldKey }); },
    onUpdate: ({ editor: ed }) => onContentChange(fieldKey, ed.getHTML()),
    editorProps: { attributes: { class: `book-simple-editable ${className ?? ''}` } },
  });
  useRegisterEditor(fieldKey, editor, 'field');
  useSpellcheck(editor, useContext(EditorPrefsContext).spellcheck);
  if (!editor) return null;
  return <EditorContent editor={editor} style={style} />;
}

/* ── cover canvas — freeform elements, shared by the live editor and every
   read-only render (Preview, Templates-tab thumbnails). ─────────────────────── */
type CoverElementPatch = Partial<CoverTextElement> & Partial<CoverImageElement> & Partial<CoverShapeElement>;
const COVER_MIN_PCT = 4;
function clampPct(v: number, min: number, max: number) { return Math.min(Math.max(v, min), Math.max(max, min)); }

const DEFAULT_COVER_TEXT: Record<CoverTextElement['role'], string> = {
  category: '<p>A Book About Doing Less</p>',
  title: '<p>Focus</p>',
  subtitle: '<p>The Anti-Portfolio</p>',
  author: '<p>By Casper Weldings</p>',
  custom: '<p>Text</p>',
};

/* Rectangles/circles are a plain filled div (circle just adds full border-radius);
   triangles are an SVG polygon turned by any angle (see CoverShapeElement). */
function ShapeFill({ el }: { el: CoverShapeElement }) {
  const stroke = el.borderWidth ?? 0;
  const strokeColor = el.borderColor || INK;
  const sh = parseShadow(el.shadow ?? '');

  if (el.shape !== 'triangle') {
    // Inside stays the default: the shape's box is its size on a percent-positioned
    // canvas, so a stroke that grows outward makes the element wider than the W/H
    // the panel reports. Outside and Centre are now sayable, just not assumed.
    const strokeCss = strokeBoxStyle(stroke, strokeColor, el.borderSides, el.borderPos, el.borderStyle);
    const shadows = [
      strokeCss.ring,
      sh ? `${sh.x}px ${sh.y}px ${sh.blur}px ${sh.spread}px ${hexToRgba(sh.color, sh.opacity)}` : null,
    ].filter(Boolean);
    return (
      <div
        style={{
          width: '100%', height: '100%', background: el.color,
          // border-radius:50% on a non-square box already renders an ellipse, not
          // just a circle — so a dedicated "oval" type would be redundant with
          // resizing this one.
          borderRadius: el.shape === 'circle' ? '50%' : coverShapeRadius(el),
          boxSizing: 'border-box',
          ...strokeCss.css,
          boxShadow: shadows.length ? shadows.join(',') : undefined,
        }}
      />
    );
  }

  /* The triangle was a clip-path, and neither `border` nor `box-shadow` survives
     one — both are painted on the box, which the clip then cuts away, so a
     stroked triangle would have drawn a stroked RECTANGLE and then deleted three
     quarters of it. SVG is the one form where the outline follows the silhouette.
     preserveAspectRatio="none" keeps the drag-to-stretch behaviour the clip had;
     vector-effect keeps the stroke at its real px weight despite that stretch.
     drop-shadow() rather than box-shadow for the same reason as the stroke — it
     follows the rendered alpha. It has no spread, so spread is folded into blur. */
  /* Turned in viewBox space rather than with a CSS transform on the box. The box
     is what W/H/X/Y describe and what the selection frame draws, and it is almost
     never square on a cover (a 62×20 hill), so rotating IT would swap those two
     numbers and resize the shape as a side effect of turning it. Rotating the
     points instead keeps the footprint, and preserveAspectRatio="none" stretches
     the result to the box exactly as the old fixed orientations did. */
  const deg = coverShapeRotation(el);
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Clockwise, to match the direction the degrees field reads — y grows downward
  // in this coordinate space, so the standard matrix already turns that way.
  const points = ([[100, 0], [100, 100], [0, 100]] as const)
    .map(([x, y]) => {
      const dx = x - 50;
      const dy = y - 50;
      return `${(50 + dx * cos - dy * sin).toFixed(2)},${(50 + dx * sin + dy * cos).toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg
      width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{ display: 'block', overflow: 'visible', filter: sh ? `drop-shadow(${sh.x}px ${sh.y}px ${sh.blur + Math.max(0, sh.spread)}px ${hexToRgba(sh.color, sh.opacity)})` : undefined }}
    >
      <polygon
        points={points}
        fill={el.color}
        stroke={stroke > 0 ? strokeColor : 'none'}
        strokeWidth={stroke}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        {...strokeDash(strokeStyleOf(el.borderStyle), stroke)}
      />
    </svg>
  );
}

/* A cover photo's own box style — the stroke, and nothing else that isn't already
   on the wrapper. Written once because the cover renders twice: live for editing
   and static for thumbnails, previews and export, and a frame that existed in one
   of those and not the other would be a book that exports differently than it
   looks. */
function coverImageStyle(el: CoverImageElement): React.CSSProperties {
  const strokeCss = strokeBoxStyle(el.borderWidth ?? 0, el.borderColor || INK, el.borderSides, el.borderPos, el.borderStyle);
  return {
    width: '100%', height: '100%', objectFit: 'cover', display: 'block', boxSizing: 'border-box',
    ...strokeCss.css,
    boxShadow: strokeCss.ring ?? undefined,
  };
}

/* Shown only on the selected element. Dragging a handle keeps the diagonally-opposite
   corner fixed (see beginResize below) rather than growing from the dragged point
   directly — otherwise a top-left resize would paradoxically shove the whole box. */
/* Eight handles, not four. The corners could only resize both axes at once, so
   "make this a bit wider" always meant changing the height too — and for text,
   which hugs its content vertically, a corner drag had to freeze the height as a
   side effect of a width change you actually wanted. The edge handles let one
   axis move on its own, which is the standard set every canvas tool ships. */
type ResizeGrip = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'r' | 'b' | 'l';
function ResizeHandles({ onResizeStart }: { onResizeStart: (grip: ResizeGrip, e: React.PointerEvent) => void }) {
  const positions: { grip: ResizeGrip; edge?: boolean; style: React.CSSProperties }[] = [
    { grip: 'tl', style: { top: -4, left: -4, cursor: 'nwse-resize' } },
    { grip: 'tr', style: { top: -4, right: -4, cursor: 'nesw-resize' } },
    { grip: 'bl', style: { bottom: -4, left: -4, cursor: 'nesw-resize' } },
    { grip: 'br', style: { bottom: -4, right: -4, cursor: 'nwse-resize' } },
    // Edges are bars rather than dots, so the two kinds never read as the same
    // control, and they hug the middle of their side.
    { grip: 't', edge: true, style: { top: -3, left: '50%', width: 18, height: 6, transform: 'translateX(-50%)', cursor: 'ns-resize' } },
    { grip: 'b', edge: true, style: { bottom: -3, left: '50%', width: 18, height: 6, transform: 'translateX(-50%)', cursor: 'ns-resize' } },
    { grip: 'l', edge: true, style: { left: -3, top: '50%', width: 6, height: 18, transform: 'translateY(-50%)', cursor: 'ew-resize' } },
    { grip: 'r', edge: true, style: { right: -3, top: '50%', width: 6, height: 18, transform: 'translateY(-50%)', cursor: 'ew-resize' } },
  ];
  return (
    <>
      {positions.map(({ grip, edge, style }) => (
        <div
          key={grip}
          onPointerDown={(e) => { e.stopPropagation(); onResizeStart(grip, e); }}
          style={{
            position: 'absolute', zIndex: 2, background: '#fff', border: `1.5px solid ${BLUE}`,
            ...(edge ? { borderRadius: 3 } : { width: 9, height: 9, borderRadius: '50%' }),
            ...style,
          }}
        />
      ))}
    </>
  );
}

/* Generic duplicate/delete for any atom node (image, shapeBlock, embedBlock,
   qrCodeBlock, textFieldBlock, jumbotronBlock) via its NodeSelection — the same
   technique the cross-chapter drag-move already uses (toJSON + insertContentAt)
   at line ~1448, just reused here instead of only for moving. Table/Columns/
   ImageGrid aren't atom nodes (clicking into one selects text inside it, not
   the block itself), so they keep their own existing commands instead. */
function duplicateAtomNode(editor: Editor) {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return;
  editor.chain().focus().insertContentAt(selection.to, selection.node.toJSON()).run();
}
function deleteAtomNode(editor: Editor) {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return;
  editor.chain().focus().deleteRange({ from: selection.from, to: selection.to }).run();
}

/* The block-bar's own position resolver — atom kinds are a real NodeSelection,
   so nodeDOM at its own position is the block itself. Table/Columns aren't atoms
   (see the comment above), so the live selection sits inside a cell/column's
   content instead; walk up $from's ancestors to the nearest node of that type
   and resolve its DOM the same way. */
function selectedBlockDom(ed: Editor, kind: string): HTMLElement | null {
  const { selection } = ed.state;
  if (selection instanceof NodeSelection) {
    const dom = ed.view.nodeDOM(selection.from);
    return dom instanceof HTMLElement ? dom : null;
  }
  const typeName = kind === 'table' ? 'table' : kind === 'columns' ? 'columnsBlock' : null;
  if (!typeName) return null;
  const { $from } = selection;
  for (let d = $from.depth; d >= 0; d--) {
    if ($from.node(d).type.name === typeName) {
      const dom = ed.view.nodeDOM($from.before(d));
      return dom instanceof HTMLElement ? dom : null;
    }
  }
  return null;
}

/* Matches Presentation's own AIButton (the "Wordgenie" pill) exactly — same
   gradient text, same active/idle states — so the two editors read as one
   product rather than the book editor inventing its own AI affordance. */
function AIButton({ label, onClick, active }: { label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center cursor-pointer"
      style={{
        gap: 8, height: 36, padding: '0 16px', borderRadius: RADIUS_MD,
        border: active ? `1px solid ${BLUE}` : `1px solid ${BORDER}`,
        background: active ? '#F0F6FF' : '#fff',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = BLUE; e.currentTarget.style.background = '#F7FAFF'; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = '#fff'; } }}
    >
      <AISparkleIcon size={15} />
      <span style={{ ...ns, fontSize: 13, fontWeight: 600, background: AI_GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  );
}

function LayerFrontIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" opacity="0.4" />
      <rect x="9" y="9" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}
function LayerBackIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="12" height="12" rx="2" fill="currentColor" />
      <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" opacity="0.4" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
function UnlockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.5-1.9" />
    </svg>
  );
}

/* Universal quick actions for whatever's selected — duplicate/delete/lock, plus
   z-order for freeform cover elements only (chapter content flows in document
   order, so "bring to front" has no meaning there). Canva's floating toolbar and
   Adobe's Contextual Task Bar both draw this same line: actions that apply to
   almost any object live here; attributes specific to *this* object's type stay
   in the right Properties panel. A plain presentational component — each caller
   decides what it's positioned against and which callbacks it actually has.
   `locked` collapses this down to just an Unlock button — full-freeze (Canva's
   model, not Figma's position-only one) means nothing else here is actionable
   until the object is unlocked, so showing disabled versions of the rest would
   just be clutter with no real choice behind it. */
function FloatingObjectBar({ onBringToFront, onSendToBack, onDuplicate, onDelete, locked, onToggleLock }: {
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  onDuplicate?: () => void;
  onDelete: () => void;
  locked?: boolean;
  onToggleLock?: () => void;
}) {
  const btnStyle: React.CSSProperties = {
    width: 28, height: 28, borderRadius: RADIUS_SM, border: 'none', background: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK, flexShrink: 0,
  };
  const hoverIn = (e: React.MouseEvent<HTMLButtonElement>, bg: string) => { e.currentTarget.style.background = bg; };
  const hoverOut = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'none'; };
  const barStyle: React.CSSProperties = { gap: 1, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, padding: 3, boxShadow: MENU_SHADOW, width: 'max-content' };

  if (locked) {
    return (
      <div className="flex items-center" style={barStyle}>
        <Tooltip label="Unlock" position="top">
          <button onClick={onToggleLock} className="cursor-pointer" style={btnStyle} onMouseEnter={(e) => hoverIn(e, '#F5F6F8')} onMouseLeave={hoverOut}>
            <UnlockIcon />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex items-center" style={barStyle}>
      {onBringToFront && (
        <Tooltip label="Bring to front" position="top">
          <button onClick={onBringToFront} className="cursor-pointer" style={btnStyle} onMouseEnter={(e) => hoverIn(e, '#F5F6F8')} onMouseLeave={hoverOut}>
            <LayerFrontIcon />
          </button>
        </Tooltip>
      )}
      {onSendToBack && (
        <Tooltip label="Send to back" position="top">
          <button onClick={onSendToBack} className="cursor-pointer" style={btnStyle} onMouseEnter={(e) => hoverIn(e, '#F5F6F8')} onMouseLeave={hoverOut}>
            <LayerBackIcon />
          </button>
        </Tooltip>
      )}
      {onDuplicate && (
        <Tooltip label="Duplicate" position="top">
          <button onClick={onDuplicate} className="cursor-pointer" style={btnStyle} onMouseEnter={(e) => hoverIn(e, '#F5F6F8')} onMouseLeave={hoverOut}>
            <DuplicateIcon color={INK} />
          </button>
        </Tooltip>
      )}
      {(onBringToFront || onSendToBack || onDuplicate) && <div style={{ width: 1, height: 18, background: BORDER, margin: '0 2px', flexShrink: 0 }} />}
      <Tooltip label="Delete" position="top">
        <button onClick={onDelete} className="cursor-pointer" style={{ ...btnStyle, color: '#B91C1C' }} onMouseEnter={(e) => hoverIn(e, '#FEF2F2')} onMouseLeave={hoverOut}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
        </button>
      </Tooltip>
      {onToggleLock && (
        <>
          <div style={{ width: 1, height: 18, background: BORDER, margin: '0 2px', flexShrink: 0 }} />
          <Tooltip label="Lock" position="top">
            <button onClick={onToggleLock} className="cursor-pointer" style={btnStyle} onMouseEnter={(e) => hoverIn(e, '#F5F6F8')} onMouseLeave={hoverOut}>
              <LockIcon />
            </button>
          </Tooltip>
        </>
      )}
    </div>
  );
}

/* How far past the table's own box the adders reach, in unscaled page px: the
   column + sits at right:-26 and the row + at bottom:-21. updateHoverTable uses
   it to decide whether a pointer that has left the table is on its way to one
   of them or genuinely gone. Kept next to the geometry it describes so the two
   can't drift. */
const TABLE_ADDER_REACH = 34;

/* Add-a-column and add-a-row, on the table's own edges. The Properties panel has
   had these as pills all along, but adding a column meant selecting the table,
   opening Properties, and finding the right pill — three steps away from the
   table you are looking at. Notion, Airtable and Sheets all put a + on the edge
   instead, and it is the one table action frequent enough to deserve the space.

   On hover rather than on selection, because you reach for a new row while
   typing in the last cell, not after deliberately selecting the whole table.

   The commands act on the CURRENT selection, so each button first drops the
   caret into the last cell of the relevant axis — otherwise "add column" adds
   one beside whichever cell the caret happened to be in, which is a different
   (and occasionally useful, hence the pills stay) action. */
function TableEdgeAdders({ box, editor, tablePos, onDone }: {
  box: { left: number; boxTop: number; width: number; boxHeight: number };
  editor: Editor;
  tablePos: number;
  onDone: () => void;
}) {
  /* Measured rather than guessed: the amount of canvas to the right of a table
     depends on the window width, the zoom and which side panels are open, none
     of which this component is told about. One measurement per hover. */
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [flipCol, setFlipCol] = useState(false);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let clip = window.innerWidth;
    for (let n = el.parentElement; n; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') { clip = n.getBoundingClientRect().right; break; }
    }
    setFlipCol(el.getBoundingClientRect().right + 30 > clip);
  }, [box.left, box.width, box.boxTop, box.boxHeight]);

  const runAt = (cellIndexFromEnd: 'lastCol' | 'lastRow', cmd: 'addColumnAfter' | 'addRowAfter') => () => {
    const node = editor.state.doc.nodeAt(tablePos);
    if (!node || node.type.name !== 'table') return;
    const rows = node.childCount;
    if (!rows) return;
    const rowIdx = cellIndexFromEnd === 'lastRow' ? rows - 1 : 0;
    const row = node.child(rowIdx);
    const colIdx = cellIndexFromEnd === 'lastCol' ? row.childCount - 1 : 0;
    // Walk to the target cell's inner position: table start + 1 to enter it,
    // then each preceding row/cell's full size.
    let at = tablePos + 1;
    for (let r = 0; r < rowIdx; r++) at += node.child(r).nodeSize;
    at += 1;
    for (let c = 0; c < colIdx; c++) at += row.child(c).nodeSize;
    editor.chain().focus().setTextSelection(at + 1)[cmd]().run();
    onDone();
  };
  const btn: React.CSSProperties = {
    position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#fff', border: `1px solid ${PANEL_BORDER}`, color: SLATE,
    borderRadius: RADIUS_SM, boxShadow: CARD_SHADOW, pointerEvents: 'auto', cursor: 'pointer',
    ...ns, fontSize: 15, lineHeight: 1, paddingBottom: 2,
  };
  return (
    <div ref={wrapRef} style={{ position: 'absolute', top: box.boxTop, left: box.left, width: box.width, height: box.boxHeight, pointerEvents: 'none', zIndex: 6 }}>
      {/* Outside the table's right edge normally, flipped to just inside it when
          there isn't room. A table set to the full text measure ends within a
          few px of the canvas's own right edge, so at narrower window widths —
          or with both side panels open — the button landed underneath the Pages
          rail: rendered, hover working, and still impossible to click because
          something else was painted on top of it. The row + never has this
          problem, since a page always has vertical room below a table. */}
      <button type="button" title="Add column" onMouseDown={(e) => e.preventDefault()} onClick={runAt('lastCol', 'addColumnAfter')}
        style={{ ...btn, ...(flipCol ? { right: 4 } : { right: -26 }), top: 0, width: 20, height: '100%' }}>+</button>
      {/* Tucked close to the table rather than clear of it: a hover-only control
          that reserved permanent space below every table would push the prose
          down for a button that is usually not there. */}
      <button type="button" title="Add row" onMouseDown={(e) => e.preventDefault()} onClick={runAt('lastRow', 'addRowAfter')}
        style={{ ...btn, bottom: -21, left: 0, height: 17, width: '100%' }}>+</button>
    </div>
  );
}

/* Resize handles for the block objects that have no node view of their own —
   a chart, a QR code, an embed, a form field, a banner, a columns block, a table.
   Rendered as an overlay positioned over the selected block rather than by giving
   each of those seven nodes a node view purely to host four dots: one
   implementation, and the nodes stay as they are.

   The drag itself is dragResize — the same zoom-corrected routine the photo's
   own handles use, which writes straight to the element's style while dragging
   and commits one transaction on pointerup. Sixty transactions a second would
   fight the pagination reflow and bury the undo stack. */
function BlockResizeHandles({ box, selKind, widthOnly, editor, onCommit }: {
  box: { left: number; boxTop: number; width: number; boxHeight: number };
  /* The selection kind, not the node name — selectedBlockDom needs it to walk up
     to a table or columns block, which aren't atoms and so have no NodeSelection
     to resolve from. */
  selKind: string;
  widthOnly: boolean;
  editor: Editor;
  onCommit: (w: number, h: number) => void;
}) {
  const start = (corner: ResizeCorner) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dom = selectedBlockDom(editor, selKind);
    if (!dom) return;
    dragResize({
      box: dom,
      corner,
      event: e.nativeEvent,
      lockAspect: false,
      maxW: dom.parentElement?.clientWidth ?? 0,
      commit: onCommit,
    });
  };
  // Width-only blocks get the two side handles and no corners, so there is no
  // affordance offering a height that would only clip the text inside.
  const corners: { corner: ResizeCorner; style: React.CSSProperties; cursor: string }[] = widthOnly
    ? [
      { corner: 'tl', style: { left: -5, top: '50%', marginTop: -5 }, cursor: 'ew-resize' },
      { corner: 'tr', style: { right: -5, top: '50%', marginTop: -5 }, cursor: 'ew-resize' },
    ]
    : [
      { corner: 'tl', style: { left: -5, top: -5 }, cursor: 'nwse-resize' },
      { corner: 'tr', style: { right: -5, top: -5 }, cursor: 'nesw-resize' },
      { corner: 'bl', style: { left: -5, bottom: -5 }, cursor: 'nesw-resize' },
      { corner: 'br', style: { right: -5, bottom: -5 }, cursor: 'nwse-resize' },
    ];
  return (
    <div
      style={{ position: 'absolute', top: box.boxTop, left: box.left, width: box.width, height: box.boxHeight, pointerEvents: 'none', zIndex: 5 }}
    >
      {corners.map((c) => (
        <div
          key={c.corner + String(c.style.left ?? c.style.right)}
          onPointerDown={start(c.corner)}
          style={{
            position: 'absolute', width: 10, height: 10, borderRadius: '50%',
            background: '#fff', border: `1.5px solid ${BLUE}`, pointerEvents: 'auto',
            cursor: c.cursor, ...c.style,
          }}
        />
      ))}
    </div>
  );
}

// FloatingObjectBar's own fixed height (padding 3 + 28px buttons, either side) —
// used to clamp FloatingBarPortal's position without needing a measure pass.
const FLOATING_BAR_H = 34;

/* Positions a FloatingObjectBar via a portal to <body>, computed in JS from
   `boxRef`'s live bounding rect instead of `position: sticky`. Sticky was the
   first approach here and it's the more standard one — but it silently
   breaks the instant an ancestor has any transform other than scale(1) (this
   canvas's own zoom control applies exactly that), in every major browser
   engine. A portal sidesteps it entirely: the bar renders completely outside
   the zoomed/transformed/`overflow:hidden` subtree, so `getBoundingClientRect()`
   already returns real screen pixels regardless of zoom. `edge` picks which
   side of the viewport it hugs (`'top'` for the chapter-body bar, `'bottom'`
   for the cover bar); the position is clamped to the box's own bounds and the
   bar disappears once the box has scrolled entirely out of view — the same
   "hugs an edge, then leaves with its own page" behavior `sticky` was meant
   to give for free. Recomputes on scroll (capture-phase, so it catches the
   canvas's own inner scroll container, which a plain window listener would
   miss since `scroll` doesn't bubble), on resize, and whenever the box's own
   size changes (e.g. a chapter growing taller as content is typed). */
function FloatingBarPortal({ boxRef, edge, offset = 10, anchorPct, children }: {
  boxRef: React.RefObject<HTMLElement | null>;
  /* 'top'/'bottom' hug a viewport edge within the box — the chapter-body
     behaviour. 'above' pins the bar just over the anchor instead, which is what
     a selected OBJECT wants: the cover bar used to sit at the bottom of the
     whole cover page, nowhere near the photo it acted on. */
  edge: 'top' | 'bottom' | 'above';
  offset?: number;
  /* The selected element's box as percentages of the cover stage. Percentages
     rather than a DOM ref because that's how cover elements are already
     positioned, and it stays correct under canvas zoom for free — the stage's
     own rect is already in real screen pixels. */
  anchorPct?: { x: number; y: number; w: number; h: number };
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  useEffect(() => {
    const update = () => {
      const box = boxRef.current;
      if (!box) { setPos(null); return; }
      const r = box.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= window.innerHeight) { setPos(null); return; }
      if (edge === 'above') {
        /* Measure the selected element's real box when it's in the DOM. The
           stored percentages are the theme's box, and an auto-height text
           element renders centred on it rather than filling it — anchoring to
           the percentages alone put the bar about 110px above the words. The
           percentages stay as the fallback for the frame before it mounts. */
        const el = box.querySelector('[data-cover-selected="true"]') as HTMLElement | null;
        const e = el?.getBoundingClientRect();
        const aLeft = e ? e.left : r.left + (anchorPct ? (anchorPct.x / 100) * r.width : 0);
        const aTop = e ? e.top : r.top + (anchorPct ? (anchorPct.y / 100) * r.height : 0);
        const aWidth = e ? e.width : (anchorPct ? (anchorPct.w / 100) * r.width : r.width);
        const aBottom = e ? e.bottom : aTop + (anchorPct ? (anchorPct.h / 100) * r.height : r.height);
        // Above the object, unless there's no room — then below it, and failing
        // that clamped into the viewport rather than scrolled off the top.
        const above = aTop - FLOATING_BAR_H - offset;
        const below = aBottom + offset;
        const top = above >= offset ? above : Math.min(below, window.innerHeight - FLOATING_BAR_H - offset);
        setPos({ top: Math.max(offset, top), left: aLeft, width: aWidth });
        return;
      }
      const desiredTop = edge === 'top' ? offset : window.innerHeight - offset - FLOATING_BAR_H;
      const top = Math.min(Math.max(desiredTop, r.top), r.bottom - FLOATING_BAR_H);
      setPos({ top, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const box = boxRef.current;
    const observer = box && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(box!);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [boxRef, edge, offset, anchorPct?.x, anchorPct?.y, anchorPct?.w, anchorPct?.h]);

  if (!pos) return null;
  return createPortal(
    <div
      className="fixed flex justify-center"
      style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 200, pointerEvents: 'none' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={{ pointerEvents: 'auto' }}>{children}</div>
    </div>,
    document.body,
  );
}

/* Read-only render — always at the book's own page box, no pointer handlers.
   Every consumer that needs a different size wraps this in a CSS
   `transform: scale(...)` rather than asking it to reflow (a percent-positioned
   canvas visibly distorts if given a different width with no matching scale). */
function CoverCanvasStatic({ page, theme, fieldContent }: { page: SimplePage; theme: ThemeDef; fieldContent: Record<string, string> }) {
  const geo = useContext(PageGeometryContext);
  const elements = page.coverElements ?? [];
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: page.bg ?? theme.bg, border: `1px solid ${BORDER}`, borderRadius: 3, boxShadow: PAGE_SHADOW, width: geo.w, height: geo.h }}>
      {elements.map((el) => {
        const boxStyle: React.CSSProperties = { position: 'absolute', left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`, opacity: el.opacity ?? 1 };
        if (el.type === 'image') {
          return (
            <div key={el.id} style={boxStyle}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={el.src} alt="" style={coverImageStyle(el)} />
              {el.overlayDark && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)' }} />}
            </div>
          );
        }
        if (el.type === 'shape') {
          return <div key={el.id} style={boxStyle}><ShapeFill el={el} /></div>;
        }
        const html = fieldContent[fieldKeyForCoverText(page.id, el)] ?? DEFAULT_COVER_TEXT[el.role];
        return (
          <div
            key={el.id}
            style={{ ...boxStyle, display: 'flex', alignItems: 'center', justifyContent: el.textAlign === 'left' ? 'flex-start' : el.textAlign === 'right' ? 'flex-end' : 'center' }}
          >
            <div
              style={{ width: '100%', fontFamily: el.fontFamily, fontSize: el.fontSize, color: el.color, fontWeight: el.fontWeight, fontStyle: el.fontStyle, textAlign: el.textAlign ?? 'center', letterSpacing: el.letterSpacing, textTransform: el.textTransform }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        );
      })}
    </div>
  );
}

/* Live, interactive canvas — replaces SimplePageBlock's old fixed cover layout.
   Image/shape elements: pointerdown selects immediately and arms a drag; movement
   under ~4px is ignored so a plain click doesn't jitter the position. Text elements
   never get a drag listener on the text surface itself (so native caret placement/
   focus keeps working) — once selected, a small floating handle above the box is the
   only draggable surface, unambiguous since it only exists once already selected. */
function CoverCanvasEditable({
  page, theme, fieldContent, selection, onSelection, onEditorFocus, onContentChange, onSelectPage, onUpdateElement, onReorderElement, onDuplicateElement, onDeleteElement, pageNumbers, pageNumberIndex, overlayOpen,
}: {
  page: SimplePage;
  theme: ThemeDef;
  fieldContent: Record<string, string>;
  pageNumbers: PageNumberSettings;
  pageNumberIndex: number;
  selection: Selection;
  onSelection: (sel: Selection) => void;
  onEditorFocus: (editor: Editor) => void;
  onContentChange: (fieldKey: string, html: string) => void;
  onSelectPage: (pageId: string) => void;
  onUpdateElement: (pageId: string, elementId: string, patch: CoverElementPatch) => void;
  onReorderElement: (pageId: string, elementId: string, dir: 'front' | 'back') => void;
  onDuplicateElement: (pageId: string, elementId: string) => void;
  onDeleteElement: (pageId: string, elementId: string) => void;
  overlayOpen: boolean;
}) {
  const geo = useContext(PageGeometryContext);
  const stageRef = useRef<HTMLDivElement>(null);
  const elements = page.coverElements ?? [];
  const selectedId = selection.kind === 'coverElement' && selection.pageId === page.id ? selection.elementId : null;
  // Which image element a new photo is currently being dragged over — only one
  // drag can be in flight at a time, so a single id (not per-element state) is
  // enough. Lets dropping a new photo directly onto an already-placed cover
  // image swap it in place, the same way opener-photo/author-photo already do.
  const [imageDragOverId, setImageDragOverId] = useState<string | null>(null);

  const beginDrag = (el: CoverElement, e: React.PointerEvent) => {
    e.stopPropagation();
    // Selection always happens, even when locked — Select is the one thing a
    // locked element must still support (it's the only way to reach Unlock).
    // Only the drag itself is skipped below.
    onSelection({ kind: 'coverElement', pageId: page.id, elementId: el.id });
    if (el.locked) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startX = el.x;
    const startY = el.y;
    const onMove = (ev: PointerEvent) => {
      const dxPct = ((ev.clientX - startClientX) / rect.width) * 100;
      const dyPct = ((ev.clientY - startClientY) / rect.height) * 100;
      if (Math.hypot(dxPct, dyPct) < 0.3) return; // ~4px threshold at this stage's size
      onUpdateElement(page.id, el.id, {
        x: clampPct(startX + dxPct, 0, 100 - el.w),
        y: clampPct(startY + dyPct, 0, 100 - el.h),
      });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const beginResize = (el: CoverElement, corner: ResizeGrip, e: React.PointerEvent) => {
    e.stopPropagation();
    if (el.locked) return; // defense in depth — ResizeHandles already don't render when locked
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const start = { x: el.x, y: el.y, w: el.w, h: el.h };
    const onMove = (ev: PointerEvent) => {
      const dxPct = ((ev.clientX - startClientX) / rect.width) * 100;
      const dyPct = ((ev.clientY - startClientY) / rect.height) * 100;
      let { x, y, w, h } = start;
      if (corner === 'br') {
        w = clampPct(start.w + dxPct, COVER_MIN_PCT, 100 - start.x);
        h = clampPct(start.h + dyPct, COVER_MIN_PCT, 100 - start.y);
      } else if (corner === 'tl') {
        const anchorX = start.x + start.w;
        const anchorY = start.y + start.h;
        x = clampPct(start.x + dxPct, 0, anchorX - COVER_MIN_PCT);
        w = anchorX - x;
        y = clampPct(start.y + dyPct, 0, anchorY - COVER_MIN_PCT);
        h = anchorY - y;
      } else if (corner === 'tr') {
        const anchorY = start.y + start.h;
        w = clampPct(start.w + dxPct, COVER_MIN_PCT, 100 - start.x);
        y = clampPct(start.y + dyPct, 0, anchorY - COVER_MIN_PCT);
        h = anchorY - y;
      } else if (corner === 'bl') {
        const anchorX = start.x + start.w;
        x = clampPct(start.x + dxPct, 0, anchorX - COVER_MIN_PCT);
        w = anchorX - x;
        h = clampPct(start.h + dyPct, COVER_MIN_PCT, 100 - start.y);
      } else if (corner === 'r') {
        w = clampPct(start.w + dxPct, COVER_MIN_PCT, 100 - start.x);
      } else if (corner === 'l') {
        const anchorX = start.x + start.w;
        x = clampPct(start.x + dxPct, 0, anchorX - COVER_MIN_PCT);
        w = anchorX - x;
      } else if (corner === 'b') {
        h = clampPct(start.h + dyPct, COVER_MIN_PCT, 100 - start.y);
      } else {
        const anchorY = start.y + start.h;
        y = clampPct(start.y + dyPct, 0, anchorY - COVER_MIN_PCT);
        h = anchorY - y;
      }
      /* A resize that touches the height is a deliberate "make this box taller
         or shorter than its text" decision, so it freezes the height. A pure
         WIDTH drag (the left/right edges) must NOT — freezing there would make
         "a bit wider" silently stop the box tracking its own text, which is the
         one thing the auto mode exists to do. */
      const touchesHeight = corner !== 'l' && corner !== 'r';
      onUpdateElement(page.id, el.id, el.type === 'text' && touchesHeight ? { x, y, w, h, heightAuto: false } : { x, y, w, h });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={stageRef}
      className="book-cover-canvas"
      onClick={(e) => { if (e.target === e.currentTarget) onSelectPage(page.id); }}
      style={{ position: 'relative', overflow: 'hidden', background: page.bg ?? theme.bg, border: `1px solid ${BORDER}`, borderRadius: 3, boxShadow: PAGE_SHADOW, width: geo.w, height: geo.h, cursor: 'default' }}
    >
      {elements.map((el) => {
        const selected = el.id === selectedId;
        const boxStyle: React.CSSProperties = {
          position: 'absolute', left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`, opacity: el.opacity ?? 1,
          ...ringStyle(selected),
        };
        if (el.type === 'image') {
          const isDragOver = imageDragOverId === el.id;
          return (
            <div
              key={el.id} data-cover-selected={selected ? "true" : undefined}
              style={{ ...boxStyle, cursor: el.locked ? 'default' : 'grab', outline: isDragOver ? `2px dashed ${BLUE}` : boxStyle.outline }}
              onPointerDown={(e) => beginDrag(el, e)}
              onDragEnter={(e) => { e.preventDefault(); setImageDragOverId(el.id); }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setImageDragOverId((id) => (id === el.id ? null : id))}
              onDrop={(e) => {
                e.preventDefault();
                setImageDragOverId(null);
                const mediaPayload = e.dataTransfer.getData('text/insert-media');
                if (!mediaPayload) return;
                try {
                  const { kind, src } = JSON.parse(mediaPayload) as { kind: string; src: string };
                  if (kind === 'image') onUpdateElement(page.id, el.id, { src });
                } catch { /* malformed payload, ignore */ }
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={el.src} alt="" draggable={false} style={{ ...coverImageStyle(el), pointerEvents: 'none' }} />
              {el.overlayDark && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)' }} />}
              {selected && !el.locked && <ResizeHandles onResizeStart={(corner, e) => beginResize(el, corner, e)} />}
            </div>
          );
        }
        if (el.type === 'shape') {
          return (
            <div key={el.id} data-cover-selected={selected ? "true" : undefined} style={{ ...boxStyle, cursor: el.locked ? 'default' : 'grab' }} onPointerDown={(e) => beginDrag(el, e)}>
              <ShapeFill el={el} />
              {selected && !el.locked && <ResizeHandles onResizeStart={(corner, e) => beginResize(el, corner, e)} />}
            </div>
          );
        }
        const fieldKey = fieldKeyForCoverText(page.id, el);
        // The stored h is a theme's guess at "room for this role," almost always
        // taller than one rendered line — hug the text instead by default (see
        // CoverTextElement.heightAuto), keeping the box's vertical CENTER at
        // exactly the point the theme placed it, so only the surrounding chrome
        // tightens and the text itself never visibly shifts.
        const autoHeight = el.heightAuto !== false;
        const textBoxStyle: React.CSSProperties = autoHeight
          ? { ...boxStyle, top: `${el.y + el.h / 2}%`, height: 'auto', transform: 'translateY(-50%)' }
          : boxStyle;
        return (
          <div
            key={el.id} data-cover-selected={selected ? "true" : undefined}
            style={{ ...textBoxStyle, display: 'flex', alignItems: 'center', justifyContent: el.textAlign === 'left' ? 'flex-start' : el.textAlign === 'right' ? 'flex-end' : 'center' }}
          >
            {selected && (
              <div
                onPointerDown={(e) => beginDrag(el, e)}
                className="flex items-center justify-center"
                style={{ position: 'absolute', top: -22, left: 0, cursor: 'grab', background: BLUE, color: '#fff', ...ns, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap' }}
              >
                ⠿ Move
              </div>
            )}
            <SimpleFieldEditor
              fieldKey={fieldKey}
              initialHtml={fieldContent[fieldKey] ?? DEFAULT_COVER_TEXT[el.role]}
              style={{
                width: '100%', fontFamily: el.fontFamily, fontSize: el.fontSize, color: el.color,
                fontWeight: el.fontWeight, fontStyle: el.fontStyle, textAlign: el.textAlign ?? 'center',
                letterSpacing: el.letterSpacing, textTransform: el.textTransform, padding: '2px 4px',
              }}
              onSelection={onSelection}
              onEditorFocus={onEditorFocus}
              onContentChange={onContentChange}
              selectionOnFocus={{ kind: 'coverElement', pageId: page.id, elementId: el.id }}
            />
            {selected && <ResizeHandles onResizeStart={(corner, e) => beginResize(el, corner, e)} />}
          </div>
        );
      })}

      <PageNumberChip settings={pageNumbers} index={pageNumberIndex} edge="header" selected={selection.kind === 'pageNumber'} onSelect={() => onSelection({ kind: 'pageNumber' })} />
      <PageNumberChip settings={pageNumbers} index={pageNumberIndex} edge="footer" selected={selection.kind === 'pageNumber'} onSelect={() => onSelection({ kind: 'pageNumber' })} />
      {selectedId && !overlayOpen && (() => {
        const selectedEl = elements.find((e) => e.id === selectedId);
        return (
          <FloatingBarPortal
            boxRef={stageRef}
            edge="above"
            offset={10}
            anchorPct={selectedEl ? { x: selectedEl.x, y: selectedEl.y, w: selectedEl.w, h: selectedEl.h } : undefined}
          >
            <FloatingObjectBar
              onBringToFront={() => onReorderElement(page.id, selectedId, 'front')}
              onSendToBack={() => onReorderElement(page.id, selectedId, 'back')}
              onDuplicate={() => onDuplicateElement(page.id, selectedId)}
              onDelete={() => onDeleteElement(page.id, selectedId)}
              locked={selectedEl?.locked}
              onToggleLock={selectedEl?.type === 'text' ? undefined : () => onUpdateElement(page.id, selectedId, { locked: !selectedEl?.locked })}
            />
          </FloatingBarPortal>
        );
      })()}
    </div>
  );
}

function SimplePageBlock({
  page, theme, pages, chapterHtml, fieldContent, selection, onSelection, onEditorFocus, onContentChange, onSelectPage, onUpdateElement, onReorderElement, onDuplicateElement, onDeleteElement, pageNumbers, pageNumberIndex, overlayOpen, onSetBackmatterPhoto,
}: {
  page: SimplePage;
  theme: ThemeDef;
  pages: PageMeta[];
  chapterHtml: Record<string, string>;
  fieldContent: Record<string, string>;
  pageNumbers: PageNumberSettings;
  pageNumberIndex: number;
  selection: Selection;
  onSelection: (sel: Selection) => void;
  onEditorFocus: (editor: Editor) => void;
  onContentChange: (fieldKey: string, html: string) => void;
  onSelectPage: (pageId: string) => void;
  onUpdateElement: (pageId: string, elementId: string, patch: CoverElementPatch) => void;
  onReorderElement: (pageId: string, elementId: string, dir: 'front' | 'back') => void;
  onDuplicateElement: (pageId: string, elementId: string) => void;
  onDeleteElement: (pageId: string, elementId: string) => void;
  onSetBackmatterPhoto: (pageId: string, src: string) => void;
  // True while a full-screen overlay (Publish, Preview) is open — see
  // CoverCanvasEditable's own use of this, which hides its floating bar so it
  // can't visually bleed on top of the overlay's content.
  overlayOpen: boolean;
}) {
  const geo = useContext(PageGeometryContext);
  const focusRing = (
    <style jsx global>{`
      .book-simple-editable { outline: none; border-radius: ${RING_RADIUS}px; }
      /* Qualified with [contenteditable] purely for specificity: globals.css's
         app-wide [contenteditable]:focus (outline: none, its own soft glow, 6px
         radius) is an exact tie with a class-only selector and was winning the
         tie, which is why the cover canvas originally had to restate this rule
         under a third selector to get a ring at all. One rule now, for every
         single-field editor — cover title/subtitle/author, chapter title, TOC
         heading, back-matter bio. */
      .book-simple-editable[contenteditable]:focus { box-shadow: none; outline: ${RING}; outline-offset: ${RING_OFFSET}px; border-radius: ${RING_RADIUS}px; }
      /* Cover text elements already show a solid selection outline + "Move" pill on
         the wrapping box (see CoverCanvasEditable) — the app-wide dashed hover
         affordance from globals.css just doubles up as a confusing second box. */
      .book-simple-editable:hover { outline: none; background: none; }
      /* A cover text element is already ringed by its wrapping box (see
         CoverCanvasEditable) the moment it's selected — which is the same
         moment its field takes focus. Two rings a pixel or two apart read as a
         doubled edge, not as one object, so on the cover the box's ring is the
         one that shows. Everywhere else (chapter title, TOC heading,
         back-matter bio) the field has no outer box and rings for itself. */
      .book-cover-canvas .book-simple-editable[contenteditable]:focus { outline: none; }
      .book-simple-editable p { margin: 0; }
      .book-simple-editable p.is-editor-empty:first-child::before { color: currentColor; opacity: 0.45; content: attr(data-placeholder); float: left; pointer-events: none; height: 0; }
      .book-toc-entries > ol { list-style: decimal; margin: 0; padding-left: 22px; }
      .book-toc-entries > ol > li { padding: 8px 0; border-bottom: 1px solid ${BORDER}; }
      .book-toc-entries > ol > li:last-child { border-bottom: none; }
      .book-toc-entries > ol > li > ul { list-style: none; margin: 6px 0 0; padding-left: 10px; }
      .book-toc-entries > ol > li > ul > li { padding: 2px 0; font-size: 13px; color: ${theme.bodyColor}; }
    `}</style>
  );
  if (page.type === 'cover') {
    return (
      <>
        {focusRing}
        <CoverCanvasEditable
          page={page}
          theme={theme}
          fieldContent={fieldContent}
          selection={selection}
          onSelection={onSelection}
          onEditorFocus={onEditorFocus}
          onContentChange={onContentChange}
          onSelectPage={onSelectPage}
          onUpdateElement={onUpdateElement}
          onReorderElement={onReorderElement}
          onDuplicateElement={onDuplicateElement}
          onDeleteElement={onDeleteElement}
          pageNumbers={pageNumbers}
          pageNumberIndex={pageNumberIndex}
          overlayOpen={overlayOpen}
        />
      </>
    );
  }
  if (page.type === 'toc') {
    const chapters = pages.filter((p): p is ChapterPage => p.type === 'chapter' && !p.excludeFromToc);
    // One continuous editable block, not a per-entry click-to-jump list — matches
    // how Word/Google Docs and Vellum actually handle a TOC: you edit it as a single
    // surface, and it regenerates from the real chapter structure whenever that
    // structure changes. The `key` below is the mechanism — it's derived from the
    // chapter id sequence, so adding/deleting/reordering any chapter changes it,
    // which remounts this editor fresh from current titles. Any free-text edits
    // made since the last structural change are intentionally not preserved across
    // that remount (same trade-off Word's own "Update Table of Contents" makes).
    const chapterSignature = chapters.map((c) => c.id).join('|');
    const seedHtml = `<ol>${chapters.map((c) => {
      const heading = stripTags(fieldContent[`${c.id}::title`] ?? c.titleHtml) || c.title;
      const subs = deriveSubheadings(chapterHtml[c.id] ?? c.initialHtml);
      const subsHtml = subs.length ? `<ul>${subs.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : '';
      return `<li>${escapeHtml(heading)}${subsHtml}</li>`;
    }).join('')}</ol>`;
    return (
      <div style={{ position: 'relative', background: page.bg ?? theme.bg, border: `1px solid ${BORDER}`, borderRadius: 3, boxShadow: PAGE_SHADOW, minHeight: geo.h, padding: `${geo.padY}px ${geo.padX}px`, overflow: 'hidden' }}
        /* Clicking a page's own margin selects the page, the way clicking the
           cover's background already did — it's how you reach its Background
           without going through an element first. Guarded on the target so a
           click that lands on the text inside still goes to the editor. */
        onClick={(e) => { if (e.target === e.currentTarget) onSelection({ kind: 'page', pageId: page.id, viaCanvas: true }); }}
      >
        {focusRing}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 7, background: theme.accentColor }} />
        <PageNumberChip settings={pageNumbers} index={pageNumberIndex} edge="header" selected={selection.kind === 'pageNumber'} onSelect={() => onSelection({ kind: 'pageNumber' })} />
        <PageNumberChip settings={pageNumbers} index={pageNumberIndex} edge="footer" selected={selection.kind === 'pageNumber'} onSelect={() => onSelection({ kind: 'pageNumber' })} />
        <SimpleFieldEditor
          fieldKey={`${page.id}::heading`}
          initialHtml="<p>Table of Contents</p>"
          placeholder="Table of Contents"
          style={{ fontFamily: theme.headingFont, color: theme.headingColor, fontSize: 26, margin: '0 0 20px', display: 'block' }}
          onSelection={onSelection}
          onEditorFocus={onEditorFocus}
          onContentChange={onContentChange}
        />
        <SimpleFieldEditor
          key={`${page.id}::entries::${chapterSignature}`}
          fieldKey={`${page.id}::entries`}
          initialHtml={seedHtml}
          className="book-toc-entries"
          style={{ ...ns, fontSize: 14.5, color: theme.headingColor, display: 'block' }}
          onSelection={onSelection}
          onEditorFocus={onEditorFocus}
          onContentChange={onContentChange}
        />
      </div>
    );
  }
  return (
    <div style={{ position: 'relative', background: page.bg ?? theme.bg, border: `1px solid ${BORDER}`, borderRadius: 3, boxShadow: PAGE_SHADOW, minHeight: geo.h, display: 'flex', overflow: 'hidden' }}
      /* Clicking a page's own margin selects the page, the way clicking the
         cover's background already did — it's how you reach its Background
         without going through an element first. Guarded on the target so a
         click that lands on the text inside still goes to the editor. */
      onClick={(e) => { if (e.target === e.currentTarget) onSelection({ kind: 'page', pageId: page.id, viaCanvas: true }); }}
    >
      {focusRing}
      <PageNumberChip settings={pageNumbers} index={pageNumberIndex} edge="header" selected={selection.kind === 'pageNumber'} onSelect={() => onSelection({ kind: 'pageNumber' })} />
      <PageNumberChip settings={pageNumbers} index={pageNumberIndex} edge="footer" selected={selection.kind === 'pageNumber'} onSelect={() => onSelection({ kind: 'pageNumber' })} />
      <AuthorAvatarPanel
        accentColor={theme.accentColor}
        photo={page.authorPhoto}
        onClick={() => onSelection({ kind: 'backmatterAvatar', pageId: page.id })}
        onDropImage={(src) => onSetBackmatterPhoto(page.id, src)}
      />
      <div style={{ flex: 1, minWidth: 0, padding: '56px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h2 style={{ fontFamily: theme.headingFont, color: theme.headingColor, fontSize: 22, margin: '0 0 10px' }}>About the Author</h2>
        <SimpleFieldEditor
          fieldKey={`${page.id}::bio`}
          initialHtml="<p>Add a short author bio here.</p>"
          placeholder="Author bio"
          style={{ fontSize: 14.5, color: theme.bodyColor, maxWidth: 420, padding: '2px 8px' }}
          onSelection={onSelection}
          onEditorFocus={onEditorFocus}
          onContentChange={onContentChange}
        />
      </div>
    </div>
  );
}

// A tinted side panel for the back-matter page — a real author photo when one's
// been picked, otherwise a generic "avatar" built from the same circle+rounded-
// rectangle primitives the Growth cover's person silhouette uses (works for every
// theme without forcing a stock photo on it). `onClick` (editable context only —
// PreviewPage passes none) selects it so the Media rail's PhotoSourcePanel opens.
function AuthorAvatarPanel({ accentColor, photo, onClick, onDropImage }: { accentColor: string; photo?: string; onClick?: () => void; onDropImage?: (src: string) => void }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onClick={onClick}
      // Same two payloads ChapterEditor's chapter-body drop already accepts: a
      // media-picker "ready to place" card (text/insert-media), or a raw OS file
      // dragged straight from Finder — this placeholder only ever accepted a
      // click before, which silently did nothing for either drag gesture even
      // though the "Drag into the book" card two panels over invites exactly this.
      onDragEnter={onDropImage ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragOver={onDropImage ? (e) => e.preventDefault() : undefined}
      onDragLeave={onDropImage ? () => setDragOver(false) : undefined}
      onDrop={onDropImage ? (e) => {
        e.preventDefault();
        setDragOver(false);
        const mediaPayload = e.dataTransfer.getData('text/insert-media');
        if (mediaPayload) {
          try {
            const { kind, src } = JSON.parse(mediaPayload) as { kind: string; src: string };
            if (kind === 'image') onDropImage(src);
          } catch { /* malformed payload, ignore */ }
          return;
        }
        const file = e.dataTransfer.files?.[0];
        if (file) void readImageFile(file).then((result) => { if ('src' in result) onDropImage(result.src); });
      } : undefined}
      title={onClick ? 'Click to add/replace the author photo, or drag one here' : undefined}
      style={{
        flexShrink: 0, width: '34%', background: photo ? undefined : `${accentColor}26`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: onClick ? 'pointer' : undefined, position: 'relative',
        outline: dragOver ? `2px dashed ${BLUE}` : 'none', outlineOffset: -3,
      }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: accentColor, opacity: 0.75 }} />
          <div style={{ width: 96, height: 60, borderRadius: '28px 28px 0 0', background: accentColor, opacity: 0.75 }} />
        </div>
      )}
    </div>
  );
}

/* ── page-number chip rendered in the header/footer strip of content pages ──── */
function toRoman(n: number): string {
  const map: [number, string][] = [[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],[50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']];
  let out = ''; let v = n;
  for (const [val, sym] of map) { while (v >= val) { out += sym; v -= val; } }
  return out;
}
function PageNumberStrip({ settings, index, edge }: { settings: PageNumberSettings; index: number; edge: 'header' | 'footer' }) {
  if (!settings.enabled || !settings.position.startsWith(edge)) return null;
  /* A page excluded from numbering reports index -1, which used to render as
     `startAt + (-1)` — so with the default settings the cover was labelled
     literally "0". An excluded page gets no number at all, which is the whole
     point of excluding it. */
  if (index < 0) return null;
  const align = settings.position.endsWith('left') ? 'flex-start' : settings.position.endsWith('right') ? 'flex-end' : 'center';
  const n = settings.startAt + index;
  return (
    <div style={{ display: 'flex', justifyContent: align, padding: '6px 4px', ...ns, fontSize: settings.fontSize ?? 11.5, fontFamily: settings.fontFamily ?? ns.fontFamily, color: settings.color ?? SLATE }}>
      {settings.style === 'roman' ? toRoman(n) : n}
    </div>
  );
}

/* The live-editor counterpart to PageNumberStrip above — printed on the page
   itself, not floating in the grey canvas gap before/after it, and selectable:
   clicking it opens PageNumberInspector the same way clicking an image or
   shape opens theirs. Positioned absolutely inside the page's own box (which
   is already `position: relative`), so it tracks that box's real rendered
   height rather than the page's *minimum* height — needed because a chapter's
   content can push a page taller than PAGE_MIN_H, and a sibling-before/after
   rendering (the original approach) can't follow that, only a child can.
   Read-only surfaces (the plain/template PreviewOverlay) keep using
   PageNumberStrip above — there's nothing to click there. */
function PageNumberChip({ settings, index, edge, selected, onSelect }: {
  settings: PageNumberSettings; index: number; edge: 'header' | 'footer'; selected: boolean; onSelect: () => void;
}) {
  if (!settings.enabled || !settings.position.startsWith(edge) || index < 0) return null;
  const isLeft = settings.position.endsWith('left');
  const isRight = settings.position.endsWith('right');
  const n = settings.startAt + index;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      className="cursor-pointer hover:bg-[#F2F7FF]"
      style={{
        position: 'absolute', [edge === 'header' ? 'top' : 'bottom']: 16,
        [isLeft ? 'left' : isRight ? 'right' : 'left']: isLeft || isRight ? 20 : '50%',
        transform: isLeft || isRight ? undefined : 'translateX(-50%)',
        ...ns, fontSize: settings.fontSize ?? 11.5, fontFamily: settings.fontFamily ?? ns.fontFamily, color: settings.color ?? SLATE,
        background: 'none', border: 'none', borderRadius: RADIUS_SM, padding: '3px 7px',
        ...ringStyle(selected), zIndex: 2,
        // The page sheet behind the flow is pointer-events:none so clicks reach
        // the text; the chip has to opt back in or it stops being selectable.
        pointerEvents: 'auto',
      }}
    >
      {settings.style === 'roman' ? toRoman(n) : n}
    </button>
  );
}

/* ── Insert panel ─────────────────────────────────────────────────────────── */
// Which tiles preview their own real insert `html` (shrunk down) instead of a
// generic icon. A pilot testing this on Subheading/Paragraph/Table/2-3 columns
// showed a clean split: it wins for anything whose LAYOUT or COLOR is the
// differentiator (a table's ruled grid, a column split, a jumbotron's colored
// button) — but loses for plain prose blocks (Subheading vs. Paragraph
// rendered as two identical illegible gray blobs, because the app's own CSS
// reset strips a bare <h3>'s default bold/size). So: every tile below is one
// where the real content is a genuinely distinct SHAPE at thumbnail size, not
// blocks of text. Two tiles that look structural by name are deliberately
// excluded: 'chart' and 'qr-code' render their actual bars/QR pattern via a
// TipTap NodeView's JS, which never runs against a static innerHTML string —
// a raw preview of either would just be a blank div, so they keep their icon.
// `.book-chapter-prose` is the same global class the real chapter editor uses,
// so these render in the book's own real theme fonts/colors, not a generic
// placeholder look.
/* Image grids are handled by ImageGridPreview below rather than listed here —
   rendering their real html would preview them with actual stock photos. */
const PREVIEW_TILE_IDS = new Set([
  'table', 'columns-2', 'columns-3', 'columns-4', 'columns-1-3', 'columns-3-1',
  'jumbotron', 'text-field', 'checklist', 'questions',
  'weekly-planner', 'budget', 'calendar',
]);
function TileHtmlPreview({ html, sheet = true }: { html: string; sheet?: boolean }) {
  return (
    /* A small white sheet inside the recessed well — this tile previews real book
       content, and a book page is white. The 1px outline keeps the sheet's edge
       readable where its own content runs pale (an empty table, a checklist);
       pure black at 10% per the image-outline rule, never a tinted neutral,
       which would pick up the well behind it and read as dirt on the edge.
       `sheet` off on a raised tile: that tile is ALREADY a white card with its own
       stroke, so drawing a second white rectangle inside it puts two hairlines 4px
       apart and the preview reads as a box inside a box. */
    <div style={{
      width: 86, height: 46, overflow: 'hidden', borderRadius: RADIUS_SM, padding: '3px 4px',
      ...(sheet ? { background: WELL_PAGE, outline: '1px solid oklch(0 0 0 / 0.1)', outlineOffset: -1 } : null),
    }}>
      <div
        className="book-chapter-prose"
        style={{ width: 215, transform: 'scale(0.4)', transformOrigin: 'top left', pointerEvents: 'none' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

/* Previewing an image grid with its real html put actual photographs on the tile,
   which reads as "these specific pictures come with the block" rather than "this
   is a three-up layout". Plain rectangles say the second thing, and they keep the
   2/3/4 variants distinguishable in a way a single shared grid icon wouldn't.
   The inserted block still drops real images (see gridFig/GRID_IMGS) — that's a
   separate, deliberate choice and it's unchanged. */
function ImageGridPreview({ count, sheet = true }: { count: number; sheet?: boolean }) {
  return (
    // Same white sheet as TileHtmlPreview, so a layout tile reads as a page
    // whichever of the two renders it. The cells step darker than the well they
    // sit in rather than lighter, or they'd vanish into the sheet.
    <div style={{
      width: 86, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
      borderRadius: RADIUS_SM, padding: '0 5px',
      ...(sheet ? { background: WELL_PAGE, outline: '1px solid oklch(0 0 0 / 0.1)', outlineOffset: -1 } : null),
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ flex: 1, height: 28, borderRadius: 3, background: '#DFE4EA' }} />
      ))}
    </div>
  );
}

/* The shell every drawn tile preview sits in — a small white sheet inside the
   recessed well, because what these tiles preview is real book content and a
   book page is white. The 1px outline keeps the sheet's edge readable where its
   own content runs pale; pure black at 10% per the image-outline rule, never a
   tinted neutral, which would pick up the well behind it and read as dirt. */
function PreviewSheet({ children, pad = '8px 10px' }: { children: React.ReactNode; pad?: string }) {
  return (
    <div style={{
      width: 86, height: 46, borderRadius: RADIUS_SM, overflow: 'hidden',
      background: WELL_PAGE, padding: pad,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      outline: '1px solid oklch(0 0 0 / 0.1)', outlineOffset: -1,
    }}>
      {children}
    </div>
  );
}

/* One drawn bar. Everything below is built from these, so a heading and a body
   line differ by exactly the two things that distinguish them on the page —
   weight and length — instead of by whatever an icon happened to look like. */
function PreviewBar({ h = 3, w = '100%', tone = 'body', align = 'left' }: {
  // 'right' is how a first-line indent is drawn: a short line that still ends at
  // the right margin, so the gap reads as an indent rather than a short line.
  h?: number; w?: number | string; tone?: 'ink' | 'body' | 'faint'; align?: 'left' | 'center' | 'right';
}) {
  const bg = tone === 'ink' ? '#39414F' : tone === 'body' ? '#C2CAD6' : '#DFE4EC';
  const alignSelf = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'stretch';
  return <div style={{ height: h, width: w, borderRadius: h / 2, background: bg, alignSelf, flexShrink: 0 }} />;
}

/* Quote and Divider used to draw miniature layouts here — an indented passage
   between two paragraphs, a rule between two paragraphs. They were accurate, but
   in a grid of nine icon tiles two little illustrations read as a different KIND
   of thing rather than as two more blocks, and at 86x46 the detail that made them
   accurate was the detail you couldn't see. Both are icons again, in the same
   stroke language as the rest of the group. Callout keeps its drawing because a
   tinted panel is a colour, not a shape — nothing in an outline glyph carries it. */

/* ── Table size picker ────────────────────────────────────────────────────────
   Word, Google Docs and Notion all ask for the shape before inserting a table,
   and it's the one tile in this panel whose default has a wrong answer baked in
   — a fixed 2×3 you then grow a row at a time. Capped at 8×8: a book page is
   portrait and narrow, and past eight columns a table stops fitting the measure
   long before it stops being expressible.

   Deliberately plain, no content presets. The shaped cases already exist one
   row down in the same Worksheets group — Weekly planner, Budget tracker,
   Calendar and Checklist are all literally preset <table> markup — so putting
   "budget" behind this picker too would ship the same thing twice. */
const TABLE_MAX = 8;

function tableHtml(rows: number, cols: number, headerRow: boolean) {
  const line = (tag: 'th' | 'td') => `<tr>${`<${tag}></${tag}>`.repeat(cols)}</tr>`;
  const trs = Array.from({ length: rows }, (_, r) => line(headerRow && r === 0 ? 'th' : 'td'));
  return `<table><tbody>${trs.join('')}</tbody></table>`;
}

function TableGridPicker({ onPick }: { onPick: (html: string) => void }) {
  // Starts at the old fixed default, so the picker opens on the shape the tile
  // used to insert and confirming without moving the mouse is a no-op change.
  const [hover, setHover] = useState({ rows: 3, cols: 2 });
  const [headerRow, setHeaderRow] = useState(true);
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40,
        width: 212, padding: 10, background: '#fff', border: `1px solid ${BORDER}`,
        borderRadius: RADIUS_LG, boxShadow: '0px 10px 28px rgba(15,23,51,0.16)',
      }}
    >
      <div
        onMouseLeave={() => setHover({ rows: 3, cols: 2 })}
        style={{ display: 'grid', gridTemplateColumns: `repeat(${TABLE_MAX}, 1fr)`, gap: 3 }}
      >
        {Array.from({ length: TABLE_MAX * TABLE_MAX }, (_, i) => {
          const r = Math.floor(i / TABLE_MAX) + 1;
          const c = (i % TABLE_MAX) + 1;
          const on = r <= hover.rows && c <= hover.cols;
          const isHeader = headerRow && r === 1 && on;
          return (
            <button
              key={i}
              type="button"
              aria-label={`${r} by ${c} table`}
              onMouseEnter={() => setHover({ rows: r, cols: c })}
              onFocus={() => setHover({ rows: r, cols: c })}
              onClick={() => onPick(tableHtml(r, c, headerRow))}
              style={{
                height: 19, padding: 0, cursor: 'pointer', borderRadius: 2,
                border: `1px solid ${on ? '#006EFE' : BORDER}`,
                background: isHeader ? '#006EFE' : on ? '#D6E6FF' : '#fff',
              }}
            />
          );
        })}
      </div>
      <div style={{ ...ns, fontSize: 11.5, fontWeight: 600, color: INK, textAlign: 'center', margin: '8px 0 2px' }}>
        {hover.cols} × {hover.rows}
      </div>
      <ToggleRow label="Header row" checked={headerRow} onChange={setHeaderRow} />
    </div>
  );
}

/* A sub-section inside an insert panel — one level below a group header, which
   carries the colour dot. Three levels, each visibly distinct, and no level
   reuses another's type: dotted group header (13/700 ink, sticky) › this
   (12/700 ink, no dot) › FieldLabel (11 slate). The old panel ran the group and
   its sub-sections at the SAME 10.5px grey uppercase, which is why "Text",
   "Dynamic fields", "Special characters" and "Text styles" all read as four
   peers rather than one section with three parts. */
/* The top-level heading inside a left-panel tab — the same level InsertPanel's
   group headers sit at. Every one of these used to be a 10.5px uppercase grey
   eyebrow, which put the panel's strongest structural job on its weakest type,
   and left the insert tabs and the settings tabs speaking two different label
   languages after the insert tabs were rebuilt. Sentence case, not uppercase:
   the system is sentence case everywhere else (badges, nav, buttons). */
function PanelHeading({ children, first, divider }: { children: React.ReactNode; first?: boolean; divider?: boolean }) {
  return <SectionLabel first={first} divider={divider}>{children}</SectionLabel>;
}

/* Sits above every insert grid. Canva's Elements panel is a far bigger drawer than
   this one and stays usable on exactly this — a search field, not more tabs — so
   the tabs only have to serve browsing. */
function InsertSearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ position: 'relative', marginBottom: 14 }}>
      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: SLATE, display: 'flex', pointerEvents: 'none' }}>
        <Icon d={ICONS.search} size={15} />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search all tools"
        style={{
          ...ns, width: '100%', height: 34, fontSize: 12.5, color: INK,
          padding: value ? '0 30px 0 32px' : '0 12px 0 32px',
          border: `1px solid ${PANEL_BORDER}`, borderRadius: RADIUS_MD, background: '#fff', outline: 'none',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = BLUE; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = PANEL_BORDER; }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          title="Clear search"
          className="cursor-pointer"
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            width: 22, height: 22, borderRadius: RADIUS_SM, border: 'none', background: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: SLATE,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
        </button>
      )}
    </div>
  );
}

/* The Text tab's top-level break. Label-only separation was right when this tab
   held two sections (the note on Text styles below cites Canva's own Text tab for
   it) — but it now holds four, at two different levels: things you place on the
   page, and things you type into text you've already got. Four peers at 12-13px
   bold read as one undifferentiated list, whichever order they're in.
   So: a rule and real space for the top level, and the sub-sections under it drop
   to quiet slate. Spacing alone wasn't enough at four; a rule alone would have
   made four peers look like four equals, which is the thing to fix. */
function PanelSectionBreak({ label, hint }: { label: string; hint?: string }) {
  return (
    <div style={{ marginTop: 26, paddingTop: 18, borderTop: `1px solid ${PANEL_BORDER}` }}>
      <div style={{ ...ns, fontSize: 13, fontWeight: 700, color: INK }}>{label}</div>
      {hint && <div style={{ ...ns, fontSize: 11.5, color: SLATE, lineHeight: 1.5, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

/* The Elements index in order. Video and Audio carry `media` instead of a group:
   they open the source picker directly rather than a page of tiles. Shapes leads
   because it's the biggest and the one people come here for; Interactive is last
   because it's the most specialised. */
const ELEMENTS_CATEGORIES: { id: string; label: string; icon: string; group?: ElementsCategory; media?: MediaPickerKind }[] = [
  { id: 'shapes', label: 'Shapes', icon: ICONS.shapesTab, group: 'Shapes' },
  { id: 'charts', label: 'Charts', icon: ICONS.chart, group: 'Charts' },
  { id: 'worksheets', label: 'Worksheets', icon: ICONS.checklist, group: 'Worksheets' },
  { id: 'video', label: 'Video', icon: ICONS.video, media: 'video' },
  { id: 'audio', label: 'Audio', icon: ICONS.audio, media: 'audio' },
  { id: 'interactive', label: 'Interactive', icon: ICONS.cta, group: 'Interactive' },
];

/* One back row, shared by every panel that drills in — the media picker drew its
   own before this existed and they have to look identical, or two drill-downs in
   the same tab read as two different mechanisms. */
function PanelBackRow({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="flex items-center cursor-pointer"
      style={{ gap: 4, ...ns, fontSize: 11.5, fontWeight: 600, color: SLATE, background: 'none', border: 'none', padding: '0 0 10px' }}
    >
      <Icon d={ICONS.back} size={12} /> {label}
    </button>
  );
}

/* The Elements index — the same card the insert grid uses, in the same 2-up grid,
   because these ARE the tab's contents at this level and a different object shape
   for them would read as a different kind of thing. Grey and recessed, which is
   now the panel's one signal for "this opens another layer" (see the raised white
   tiles it leads to). No count on the card: it dates the moment a category grows,
   and "Charts 3" reads as a warning not to bother.
   The drill-down exists because Elements had reached 49 tiles — about three
   panel-heights, with Charts stranded at the bottom — and because every category
   has room to grow that a flat list can't give it. Search still spans all of them
   from any tab, so nothing here is hidden, only filed. */
function PanelIndexCards({ cards }: { cards: { id: string; label: string; icon: string; onOpen: () => void }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 8px' }}>
      {cards.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={c.onOpen}
          className="book-insert-tile"
          style={{
            minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6,
          }}
        >
          <div
            className="book-insert-well"
            style={{
              height: 62, borderRadius: RADIUS_LG, background: WELL_BG,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK,
            }}
          >
            <Icon d={c.icon} size={23} />
          </div>
          <div style={{ ...ns, fontSize: 11.5, fontWeight: 600, color: INK, textAlign: 'center', lineHeight: 1.25 }}>{c.label}</div>
        </button>
      ))}
    </div>
  );
}

function InsertPanel({ currentPlan, groups, index, header, onDragTile, onLockedClick, onLockedTextStyle, onInsertTile, textExtras }: {
  currentPlan: string;
  groups: InsertTile['group'][];
  onDragTile: (id: string | null) => void;
  onLockedClick: (tile: InsertTile) => void;
  onLockedTextStyle: (tile: InsertTile) => void;
  // Tiles used to be drag-only: clicking an unlocked one did nothing at all, and
  // there was no keyboard route to insert anything anywhere in the editor.
  onInsertTile: (tile: InsertTile) => void;
  // Rendered in the 'Text' group, between the plain block tiles and the (long)
  // Text styles gallery — quick insert-at-cursor tools belong near the other
  // quick tiles, not pushed below a whole scrollable gallery of style cards.
  textExtras?: React.ReactNode;
  /* Rendered in place of the group grids when there's no query — the panel is a
     table of contents rather than a shelf. Search still owns the screen the moment
     you type, from the index or from inside a category, because a search that only
     looked at the level you'd already navigated to would be the exact failure the
     drill-down introduces. */
  index?: { id: string; label: string; icon: string; onOpen: () => void }[];
  /* The back row, above the search field — drawn by the caller because only it
     knows where back goes. */
  header?: React.ReactNode;
}) {
  // Only the plain Table tile uses this; held as an id rather than a boolean so
  // a second sized block (a grid of images, say) can join without a second flag.
  const [sizingTile, setSizingTile] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  /* One tile, shared by the browse grid and the search results below — the two
     render identical tiles, and duplicating 90 lines of well/badge/preview/drag
     wiring so search could have its own copy is how they drift apart. */
  const renderTile = (tile: InsertTile) => {
            const locked = shouldShowTierBadge(currentPlan as never, tile.requiredPlan);
            // Image/video/audio have no content of their own to drag straight from
            // the grid — there's no src yet. Clicking opens the media picker instead
            // (see onInsertTile's caller for the 'media' rail tab); only what comes
            // out of that picker, already sourced, is ever draggable.
            const needsSourcing = tile.html === '__IMAGE__' || tile.html === '__EMBED_VIDEO__' || tile.html === '__EMBED_AUDIO__';
            /* The one distinction the grid has to make: does this tile GIVE you the
               block, or does it open something first? A recessed grey well is a
               slot — there's another layer behind it — and that's what video, audio
               and Table are. Everything else is the block itself, so it's a raised
               white card with a stroke: a chip you pick up and drag, lying on the
               panel rather than set into it. Clear-with-no-edge was tried first and
               lost the grid entirely — a 1.2:1 card on a white panel is the exact
               failure the wells were introduced to fix — so the stroke does the
               work the fill used to. */
            const opensChooser = needsSourcing || tile.id === 'table';
            return (
              <div key={tile.id} style={{ position: 'relative', display: 'flex' }}>
              <button
                type="button"
                draggable={!locked && !needsSourcing}
                title={locked ? `${tile.label} — upgrade to unlock` : needsSourcing ? `Choose ${tile.label.toLowerCase()} on the left, then place it` : `Insert ${tile.label} at the cursor, or drag it onto a page`}
                onDragStart={(e) => { if (needsSourcing) return; e.dataTransfer.setData('text/insert-block', tile.id); onDragTile(tile.id); }}
                onDragEnd={() => onDragTile(null)}
                onClick={() => {
                  if (locked) { onLockedClick(tile); return; }
                  // Dragging the tile still drops the default shape — you've
                  // already committed to a position by then, and interrupting
                  // a drag with a popover would be worse than a 2×3 you can
                  // add rows to.
                  if (tile.id === 'table') { setSizingTile((prev) => (prev === tile.id ? null : tile.id)); return; }
                  setSizingTile(null);
                  onInsertTile(tile);
                }}
                className="book-insert-tile"
                style={{
                  flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6,
                  cursor: locked || needsSourcing ? 'pointer' : 'grab',
                  opacity: locked ? 0.7 : 1, position: 'relative',
                }}
              >
                {/* The well. A filled square, no border — the single change
                    that makes one tool distinguishable from the next. A white
                    card outlined in a 1px hairline on a white panel is ~1.2:1
                    against its own background, so the old grid read as one
                    flat sheet of rectangles whatever was drawn inside them.
                    Preview tiles get a plain white well (their own content is
                    the colour); glyph tiles get their group's tint. */}
                <div
                  className={`book-insert-well${opensChooser ? '' : ' book-insert-well--raised'}`}
                  style={{
                    height: 62, borderRadius: RADIUS_LG, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    // Shapes are excluded from the tint alongside the preview
                    // tiles, for the same reason: a shape tile already shows
                    // its REAL insert colour (a gold star, a green check, a
                    // blue ellipse), so a violet group wash behind six
                    // different hues just muddied all of them. Both kinds are
                    // specimens — what you see is what lands on the page — and
                    // a specimen needs a neutral mount.
                    background: opensChooser ? WELL_BG : '#fff',
                    border: opensChooser ? 'none' : `1px solid ${TILE_STROKE}`,
                    overflow: 'hidden', position: 'relative',
                  }}
                >
                  {/* A partially-gated group keeps per-tile badges; a wholly
                      gated one is badged once on its header instead, so the
                      pill isn't repeated down the column. */}
                  {locked && !groupGate(tile.group) && (
                    <div style={{ position: 'absolute', top: 5, right: 5 }}><TierBadge tier={tile.requiredPlan!} size="sm" /></div>
                  )}
                  {tile.id.startsWith('image-grid-') ? (
                    <ImageGridPreview count={Number(tile.id.slice(-1))} sheet={opensChooser} />
                  ) : PREVIEW_TILE_IDS.has(tile.id) ? (
                    <TileHtmlPreview html={tile.html} sheet={opensChooser} />
                  ) : (
                    // Shapes keep their own per-shape insert colour (the tile
                    // previews the real fill you get); every other group takes
                    // its section hue, so a glance at a well says which kind of
                    // tool it is before you've read the label.
                    // tile.color is set only on Shapes, where it previews the
                    // real fill the tile inserts. Everything else is ink.
                    // A Shapes tile draws its path FILLED, because a filled solid
                    // is what the page gets — Icon strokes, so a solid shape
                    // previewed as an outline was a tile promising something the
                    // insert didn't deliver.
                    // An outline tile previews hollow for the same reason: it
                    // inserts a shape with no fill, so a filled preview would be
                    // the wrong promise in the other direction. 1.6 is the stroke
                    // at 26px that matches the 2px the insert carries at 96px.
                    tile.group === 'Shapes' ? (
                      <svg
                        width="26"
                        height="26"
                        viewBox="0 0 24 24"
                        fill={tile.outline ? 'none' : (tile.color ?? INK)}
                        stroke={tile.outline ? (tile.color ?? INK) : 'none'}
                        strokeWidth={tile.outline ? 1.6 : 0}
                        style={{ display: 'block' }}
                      >
                        <path d={tile.icon} />
                      </svg>
                    ) : (
                      <span style={{ display: 'flex', color: tile.color ?? INK }}>
                        <Icon d={tile.icon} size={23} />
                      </span>
                    )
                  )}
                </div>
                {/* Outside the well, on the panel ground. Canva, Flipsnack and
                    Visme all caption below the object rather than boxing the
                    text in with it — which is what let the old tile balloon to
                    115px tall around a 19px glyph. */}
                <div style={{ ...ns, fontSize: 11.5, fontWeight: 600, color: INK, textAlign: 'center', lineHeight: 1.25 }}>{tile.label}</div>
              </button>
              {sizingTile === tile.id && (
                <TableGridPicker
                  onPick={(html) => { setSizingTile(null); onInsertTile({ ...tile, html }); }}
                />
              )}
              </div>
            );
  };



  /* Search spans EVERY insert tile, not just this tab's groups. That's the whole
     point of it: the reason a tool is hard to find is that you don't know which
     tab it lives under, and a search that only looks inside the tab you already
     guessed right can't help with that. Results keep their own group header, so
     a hit still tells you where it normally lives. */
  const hits = q ? INSERT_TILES.filter((t) => tileMatches(t, q)) : [];
  const hitGroups = [...new Set(hits.map((t) => t.group))];

  // No own scroll/height — the outer "Insert" tab container owns that.
  return (
    <div style={{ padding: '16px 14px' }}>
      {header}
      <InsertSearchField value={query} onChange={setQuery} />
      {!q && index && <PanelIndexCards cards={index} />}
      {!q && groups.map((group) => (
        <div key={group} style={{ marginBottom: 18 }}>
          {/* The section header, not an eyebrow. 10.5px uppercase grey was the
              weakest type in the panel doing the panel's strongest structural
              job; every editor surveyed (Canva "Browse categories", Flipsnack
              "Multimedia", Visme "Header & Text") uses bold, high-contrast,
              sentence-case type here instead. Sticky, because these panels
              scroll four sections deep and the label scrolling away was how you
              lost your place. The dot ties the header to the tint on its own
              tiles; the pill gates the whole group once (see groupGate). */}
          <div
            className="flex items-center justify-between"
            style={{
              position: 'sticky', top: 0, zIndex: 2, background: '#fff',
              padding: '2px 0 8px', marginBottom: 2,
            }}
          >
            <span style={{ ...ns, fontSize: 13, fontWeight: 700, color: INK }}>{GROUP_HEADINGS[group] ?? group}</span>
            {groupGate(group) && shouldShowTierBadge(currentPlan as never, groupGate(group)!) && (
              <TierBadge tier={groupGate(group)!} size="sm" />
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 8px' }}>
            {INSERT_TILES.filter((t) => t.group === group).map(renderTile)}
          </div>
          {/* Named text-style presets (Manuscript, Marquee…) live under the same "Text"
              tab as the generic blocks above, not a second sibling tab — both are "drag
              new content in," not "restyle a selection." But confirmed against Canva's
              own Text tab (its "Add a heading" buttons vs. its "Font combinations"
              gallery below): the two groups still get their own label, not just a gap —
              a plain heading/paragraph tile and a fully-styled named preset are different
              enough kinds of "content block" that no header at all read as one undifferentiated
              grid. Label-only, no divider/tint — that's as far as Canva's own separation goes. */}
          {/* Text styles goes last in the tab — after Dynamic fields and Special
              characters — matching where the same presets sit in both properties
              panels (see TextStylePresetGrid). They were grouped with the plain
              tiles above on the argument that both drop a new block on the page
              while the extras type into an existing one; that's true, but it
              matters less than the presets being in the same place wherever you
              meet them. Seven full-width cards also make a poor thing to scroll
              past on the way to Special characters. */}
          {group === 'Text' && textExtras}
          {group === 'Text' && (
            <div>
              <PanelSectionBreak label="Text styles" />
              <div style={{ marginTop: 12 }}>
                <TextStyleCards currentPlan={currentPlan} onDragTile={onDragTile} onLockedClick={onLockedTextStyle} onInsertTile={onInsertTile} />
              </div>
            </div>
          )}
        </div>
      ))}
      {q && hitGroups.map((group) => (
        <div key={group} style={{ marginBottom: 18 }}>
          <div className="flex items-center justify-between" style={{ position: 'sticky', top: 0, zIndex: 2, background: '#fff', padding: '2px 0 8px', marginBottom: 2 }}>
            <span style={{ ...ns, fontSize: 13, fontWeight: 700, color: INK }}>{GROUP_HEADINGS[group] ?? group}</span>
            {groupGate(group) && shouldShowTierBadge(currentPlan as never, groupGate(group)!) && (
              <TierBadge tier={groupGate(group)!} size="sm" />
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 8px' }}>
            {hits.filter((t) => t.group === group).map(renderTile)}
          </div>
        </div>
      ))}
      {q && !hits.length && (
        <div style={{ ...ns, fontSize: 12.5, color: SLATE, lineHeight: 1.6, padding: '10px 2px' }}>
          No tools match &ldquo;{query.trim()}&rdquo;.
        </div>
      )}
    </div>
  );
}

/* ── Templates panel — the whole-book gallery old Designrr's Templates rail item
   covers, split out from Design so Design can stay focused on the chapter you have
   selected. Applying one is non-destructive by construction: it only ever touches
   chapters (and properties) that haven't been manually overridden — the backup/
   confirm step old Designrr needs before a template swap doesn't apply here because
   there's nothing a template swap can silently clobber. ─────────────────────────── */
// One template per row, at the full row width available in this fixed-width
// (PANEL_W) side panel — matching the presentation editor's own template list
// (PresentationEditorView.tsx's Templates panel: one row per template, a
// bordered/rounded thumbnail box, plain caption below it, not folded into one
// uniform card).
//
// DERIVED from PANEL_W, not hardcoded. This was a literal 212, correct back when
// the panel was 240 wide (240 - 14×2 padding); PANEL_W later grew to 264 and the
// constant didn't follow, so every template preview rendered 212px wide inside a
// 236px card and left a 24px grey gutter down the right of the gallery.
const TEMPLATE_ROW_PAD = 14;
const TEMPLATE_ROW_W = PANEL_W - TEMPLATE_ROW_PAD * 2;
// A 1px overscan: at a fractional scale the rendered page can land a hair short
// of its container and re-open a hairline of the background down one edge. The
// card clips (overflow: hidden), so covering past the edge costs nothing and
// removes the whole class of sub-pixel seam.
const TEMPLATE_ROW_SCALE = (TEMPLATE_ROW_W + 1) / PAGE_W;
const TEMPLATE_ROW_H = Math.round(PAGE_MIN_H * TEMPLATE_ROW_SCALE);

/* A template is a cover layout + chapter/TOC/back-matter theme, applied together —
   see THEMES above. Clicking a card applies it directly: each card already
   renders the real cover in that template's style (see previewPage below), so
   the card itself is the look-before-you-leap step — a confirm modal in between
   was showing the same thing twice. applyTemplate takes its own snapshot and
   offers an undo toast, the same safety net used for chapter delete/reorder/
   split elsewhere in this file. */
function TemplatesPanel({ currentPlan, activeTheme, pages, fieldContent, onApplyTemplate }: {
  currentPlan: string;
  activeTheme: ThemeId;
  pages: PageMeta[];
  fieldContent: Record<string, string>;
  onApplyTemplate: (templateId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const q = search.toLowerCase();
  const visibleTemplates = THEMES.filter((t) => t.name.toLowerCase().includes(q));
  const coverPage = pages.find((p) => p.type === 'cover') as SimplePage | undefined;
  return (
    <div style={{ padding: '16px 14px', overflowY: 'auto', height: '100%' }}>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search templates"
        style={{ ...ns, width: '100%', fontSize: 13, padding: '8px 10px', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, marginBottom: 14 }}
      />
      <div className="flex flex-col" style={{ gap: 16 }}>
        {visibleTemplates.map((t) => {
          const locked = shouldShowTierBadge(currentPlan as never, t.requiredPlan);
          const active = t.id === activeTheme;
          /* bg is overridden, not inherited from the live cover. Spreading
             coverPage carried its current background onto every card, so the
             moment a dark-cover template (Growth) or a hand-picked page colour
             was applied, all nine previews repainted in that colour — white-ground
             templates showed as near-black with their dark type invisible. The
             card has to show the same thing applyTemplate produces: the template's
             own coverBg, falling back to its theme bg exactly as CoverCanvas does
             when coverBg is unset (8 of 9 templates). */
          const previewPage: SimplePage | undefined = coverPage ? { ...coverPage, bg: t.coverBg, coverElements: t.coverElements } : undefined;
          return (
            <button
              key={t.id}
              // A locked card still shows what you'd be paying for (the real
              // cover in that template's style, badge in the corner) — clicking
              // it routes to the upgrade prompt instead of applying.
              onClick={() => onApplyTemplate(t.id)}
              className="w-full cursor-pointer text-left"
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              <div
                className="hover:shadow-[0px_4px_12px_rgba(0,110,254,0.12)] transition-shadow duration-150"
                // No border and no outline on the card itself. A border is part
                // of the box, so the old 1.5px-active / 1px-resting pair changed
                // the preview's available width by a pixel depending on whether
                // the template was selected. An inward outline fixed that but
                // then got painted over by the preview inside it, which now
                // overscans to the edge — so the ring moved to an overlay above
                // the preview (see below), where nothing can cover it.
                style={{ position: 'relative', borderRadius: RADIUS_MD, overflow: 'hidden' }}
              >
                {locked && <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}><TierBadge tier={t.requiredPlan!} size="sm" /></div>}
                <div style={{ width: '100%', height: TEMPLATE_ROW_H, overflow: 'hidden', position: 'relative', background: WELL_PAGE }}>
                  {previewPage && (
                    <div style={{ width: PAGE_W, transform: `scale(${TEMPLATE_ROW_SCALE})`, transformOrigin: 'top left' }}>
                      <CoverCanvasStatic page={previewPage} theme={t} fieldContent={fieldContent} />
                    </div>
                  )}
                </div>
                {/* The ring, above the preview. Resting state is the image-outline
                    value — pure black at 10%, never a tinted neutral, which would
                    pick up whatever cover sits under it and read as dirt along the
                    edge. Most covers here are white or near-white, so without this
                    a card had no edge at all against a white panel. Inset shadow
                    on an overlay rather than a border, so it still costs the
                    layout nothing and the preview keeps filling the full width. */}
                <div
                  aria-hidden
                  style={{
                    position: 'absolute', inset: 0, borderRadius: RADIUS_MD, pointerEvents: 'none', zIndex: 2,
                    boxShadow: active
                      ? `inset 0 0 0 2px ${BLUE}`
                      : 'inset 0 0 0 1px oklch(0 0 0 / 0.1)',
                  }}
                />
              </div>
              <div style={{ padding: '7px 2px 0' }}>
                <span style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: active ? BLUE : INK }}>{t.name}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Text style cards — named text presets with a fixed look (see TEXT_STYLES
   above), drag-to-insert like InsertPanel's plain blocks rather than
   click-to-apply like TemplatesPanel: a text style is new content landing in
   one chapter, not a book-wide setting. Card body borrows TemplatesPanel's
   "real rendered preview, not an abstract icon" principle instead of
   InsertPanel's small icon+label tile, since a script/display/monospace font
   can't be conveyed by a generic icon the way "Table" or "Divider" can.
   Rendered inline inside InsertPanel's "Text" group, under its own "Text
   styles" label rather than a sibling tab — see the note above. ───────── */
function TextStyleCards({ currentPlan, onDragTile, onLockedClick, onInsertTile }: {
  currentPlan: string;
  onDragTile: (id: string | null) => void;
  onLockedClick: (tile: InsertTile) => void;
  onInsertTile: (tile: InsertTile) => void;
}) {
  return (
    <>
      {/* One per row, and no name under the card. A named preset that renders
          its own name in its own face already IS its label — the caption row
          repeated the same word in Nunito Sans directly beneath it. Dropping it
          also removes the reason the preview was shrunk: two-up left ~88px of
          card interior, which forced a 13px cap (10px for the heavy faces) and
          still truncated "Statement" to "State…". Full width lets every preset
          render at its REAL size, which is the only thing that makes a preview
          worth trusting. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
        {TEXT_STYLES.map((s) => {
          const tile = INSERT_TILES.find((t) => t.id === `textstyle-${s.id}`);
          if (!tile) return null;
          const locked = shouldShowTierBadge(currentPlan as never, tile.requiredPlan);
          return (
            <button
              key={s.id}
              type="button"
              draggable={!locked}
              title={locked ? `${tile.label} — upgrade to unlock` : `Insert ${tile.label} at the cursor, or drag it onto a page`}
              onDragStart={(e) => { e.dataTransfer.setData('text/insert-block', tile.id); onDragTile(tile.id); }}
              onDragEnd={() => onDragTile(null)}
              onClick={() => (locked ? onLockedClick(tile) : onInsertTile(tile))}
              className="hover:shadow-[0px_4px_12px_rgba(15,23,51,0.12)] transition-shadow duration-150"
              style={{
                position: 'relative', overflow: 'hidden', cursor: locked ? 'pointer' : 'grab',
                // A text style typesets real book content, so its card is a page.
                // On a white panel a white card has nothing to sit against, so it
                // takes the same grey well as every other tile and floats its
                // page-white specimen inside (see the inner sheet below).
                border: 'none', borderRadius: RADIUS_LG, background: WELL_BG,
                opacity: locked ? 0.75 : 1,
              }}
            >
              {locked && <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}><TierBadge tier={tile.requiredPlan!} size="sm" /></div>}
              <div style={{
                minHeight: 62, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '12px 14px', margin: 5, borderRadius: RADIUS_MD, background: WELL_PAGE,
                outline: '1px solid oklch(0 0 0 / 0.08)', outlineOffset: -1,
              }}>
                {/* The outer flex div centers this block both ways; ellipsis needs a
                    plain block (not itself a centered flex item) to truncate from one
                    edge only — centering + overflow:hidden on the same flex box clips
                    both edges symmetrically instead, cutting off the first letter too.
                    A flat 13px cap still overflowed "Statement" (Syne at 800 weight
                    runs unusually wide — measured 111px vs the ~88px card interior even
                    at 13px, so it kept truncating to "State…"); a bold/heavy face gets
                    a lower cap so its full name actually fits, rather than shrinking
                    every other preview to accommodate the one widest font. */}
                <div
                  style={{
                    // s.fontSize, not a capped one: at full panel width the widest
                    // preset (Syne 800 "Statement") measures well inside the card,
                    // so the preview can finally be the real thing rather than a
                    // shrunk approximation of it.
                    fontFamily: s.fontFamily, fontSize: s.fontSize, color: s.color,
                    fontWeight: s.fontWeight, fontStyle: s.fontStyle, letterSpacing: s.letterSpacing, textTransform: s.textTransform,
                    textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', minWidth: 0,
                    lineHeight: 1.25,
                  }}
                >
                  {s.name}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ── Design panel — per-chapter layout, manual overrides, and TOC inclusion ──── */
/* Per-chapter Layout and Manual overrides were removed: a book is one designed
   object, and per-chapter layout/heading-colour forks are how it stops being one.
   Both were also invisible until you happened to select a chapter, so the panel's
   contents changed under you depending on what the caret was in. The theme picker
   stays as the one place design is chosen, book-wide.
   The data model is untouched — `page.layout` and `page.overrides` are still read
   by every renderer, so anything a template already set keeps rendering; there is
   just no longer a per-chapter control to fork them by hand. */
function DesignPanel({
  selection, pages, onSetTocExcluded, hasToc, onAddToc, onRemoveToc,
}: {
  selection: Selection;
  pages: PageMeta[];
  onSetTocExcluded: (chapterId: string, excluded: boolean) => void;
  /* The on/off switch moved here from the Chapters panel. The table of contents
     has exactly two settings — whether the book has one, and which chapters are
     in it — and they were in two different panels, which nobody would choose on
     purpose. The note that sent the switch to Chapters argued that Pages "has no
     equivalent control", but Pages could always delete the page outright
     (canDelete allows type === 'toc'), so there were two ways to remove it and
     one to restore it, in a third place. That delete is gone now: the contents
     row is fixed like Cover and Back matter, and this is the one switch. */
  hasToc: boolean;
  onAddToc: () => void;
  onRemoveToc: () => void;
}) {
  const selectedChapter = selection.kind === 'chapter' ? (pages.find((p) => p.id === selection.chapterId.split('::')[0]) as ChapterPage | undefined) : undefined;

  // No own scroll/height — the first of four sections stacked under one
  // scrollable "Book settings" tab, which owns the outer scroll instead.
  return (
    <div style={{ padding: '0 14px' }}>
      <PanelHeading>Table of contents</PanelHeading>
      {/* Always here, selection or not. This section used to hold nothing but a
          "select a chapter first" placeholder until you had one selected, so the
          one part of it that IS book-wide had nowhere to sit. */}
      <ToggleRow
        label="Contents page"
        checked={hasToc}
        onChange={(v) => (v ? onAddToc() : onRemoveToc())}
      />
      {hasToc && (selectedChapter ? (
        <div style={{ marginTop: 8 }}>
          <ToggleRow
            label="Include this chapter"
            checked={!selectedChapter.excludeFromToc}
            onChange={(v) => onSetTocExcluded(selectedChapter.id, !v)}
          />
        </div>
      ) : (
        <div style={{ ...ns, fontSize: 12.5, color: SLATE, background: '#F7F8FA', borderRadius: RADIUS_MD, padding: 12, marginTop: 8 }}>
          Select a chapter on the canvas to leave it out of the contents.
        </div>
      ))}
    </div>
  );
}

/* ── Metadata panel — a peer of the content tools, the way e-Booka makes Metadata a
   top-level mode. Identifier/title/language are what EPUB actually requires, so they
   carry a required marker and feed the pre-publish check. ────────────────────── */
function MetadataPanel({ metadata, setMetadata }: { metadata: BookMetadata; setMetadata: (m: BookMetadata) => void }) {
  const field: React.CSSProperties = { ...ns, width: '100%', fontSize: 13, padding: '8px 10px', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, marginTop: 5 };
  const selectField: React.CSSProperties = { ...field, appearance: 'none', paddingRight: 28 };
  const labelStyle: React.CSSProperties = { ...ns, fontSize: 12, fontWeight: 600, color: INK, display: 'block', marginBottom: 14 };
  const set = (k: keyof BookMetadata, v: string) => setMetadata({ ...metadata, [k]: v });
  // Full shorthand, not just borderColor — mixing the two against `field`'s `border`
  // shorthand makes React warn about conflicting style properties on rerender.
  const req = (k: keyof BookMetadata) => (!metadata[k].trim() ? { border: '1px solid #F0B4AC' } : undefined);
  const missing = missingMetadata(metadata);

  return (
    <div style={{ padding: '0 14px' }}>
      <PanelHeading first>Book details</PanelHeading>

      {missing.length > 0 && (
        <div style={{ ...ns, fontSize: 11.5, color: '#8A5A08', background: '#FDF6E7', border: '1px solid #F2DDB0', borderRadius: RADIUS_MD, padding: '8px 10px', marginBottom: 14, lineHeight: 1.45 }}>
          {missing.length} required field{missing.length === 1 ? '' : 's'} still empty. EPUB needs a title, an identifier and a language before it can be packaged.
        </div>
      )}

      <label style={labelStyle}>Title <span style={{ color: '#B91C1C' }}>*</span>
        <input style={{ ...field, ...req('title') }} value={metadata.title} onChange={(e) => set('title', e.target.value)} />
      </label>
      <label style={labelStyle}>Subtitle
        <input style={field} value={metadata.subtitle} onChange={(e) => set('subtitle', e.target.value)} />
      </label>
      <label style={labelStyle}>Author
        <input style={field} value={metadata.author} onChange={(e) => set('author', e.target.value)} />
      </label>
      <label style={labelStyle}>Identifier (ISBN or UUID) <span style={{ color: '#B91C1C' }}>*</span>
        {/* An empty identifier fails the required-metadata check, which blocks Export
            — and it is empty on every new book. The packager already falls back to a
            generated UUID, so the gate was the only thing standing in the way with no
            one-click route past it. */}
        <div className="flex" style={{ gap: 6, marginTop: 5 }}>
          <input style={{ ...field, marginTop: 0, ...req('identifier') }} placeholder="978-… or a UUID" value={metadata.identifier} onChange={(e) => set('identifier', e.target.value)} />
          <button
            type="button"
            onClick={() => set('identifier', `urn:uuid:${crypto.randomUUID()}`)}
            className="cursor-pointer flex-shrink-0"
            style={{ ...ns, fontSize: 12, fontWeight: 600, color: BLUE, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, padding: '0 11px', whiteSpace: 'nowrap' }}
          >
            Generate
          </button>
        </div>
        <span style={{ ...ns, display: 'block', fontSize: 11, fontWeight: 400, color: SLATE, marginTop: 4 }}>
          Any unique string. Retailers assign their own — generate one for now if you don&rsquo;t have an ISBN.
        </span>
      </label>
      <label style={labelStyle}>Language <span style={{ color: '#B91C1C' }}>*</span>
        <div style={{ position: 'relative' }}>
          <select style={{ ...selectField, ...req('language') }} value={metadata.language} onChange={(e) => set('language', e.target.value)}>
            <option value="">Select a language…</option>
            <option value="en">English (en)</option>
            <option value="en-GB">English — UK (en-GB)</option>
            <option value="es">Spanish (es)</option>
            <option value="fr">French (fr)</option>
            <option value="de">German (de)</option>
            <option value="pt">Portuguese (pt)</option>
            <option value="it">Italian (it)</option>
          </select>
          <SelectChevron />
        </div>
      </label>
      <label style={labelStyle}>Publisher
        <input style={field} value={metadata.publisher} onChange={(e) => set('publisher', e.target.value)} />
      </label>
      <label style={labelStyle}>Description
        <textarea rows={4} style={{ ...field, resize: 'vertical' }} value={metadata.description} onChange={(e) => set('description', e.target.value)} />
      </label>
      <label style={labelStyle}>Subjects
        <input style={field} placeholder="Productivity, Business" value={metadata.subjects} onChange={(e) => set('subjects', e.target.value)} />
        <span style={{ ...ns, display: 'block', fontSize: 11, fontWeight: 400, color: SLATE, marginTop: 4 }}>Comma separated.</span>
      </label>

      <PanelHeading>Series</PanelHeading>
      <div className="flex" style={{ gap: 8 }}>
        <label style={{ ...labelStyle, flex: 1 }}>Series name
          <input style={field} placeholder="e.g. The Anti-Portfolio" value={metadata.seriesName} onChange={(e) => set('seriesName', e.target.value)} />
        </label>
        <label style={{ ...labelStyle, width: 76 }}>Book #
          <input style={field} placeholder="1" value={metadata.seriesPosition} onChange={(e) => set('seriesPosition', e.target.value)} />
        </label>
      </div>

      <label style={labelStyle}>Reading direction
        <div style={{ position: 'relative' }}>
          <select style={selectField} value={metadata.readingDirection} onChange={(e) => set('readingDirection', e.target.value)}>
            <option value="ltr">Left to right</option>
            <option value="rtl">Right to left</option>
          </select>
          <SelectChevron />
        </div>
        <span style={{ ...ns, display: 'block', fontSize: 11, fontWeight: 400, color: SLATE, marginTop: 4 }}>
          Written into the EPUB spine so e-readers lay out and turn pages correctly for RTL scripts.
        </span>
      </label>
    </div>
  );
}

/* ── Settings panel — Document Settings, incl. global page numbers ───────────── */
/* A margin, in inches, stepped an eighth at a time — the unit a printer states
   a book's margins in, and the increment every book tool offers them at. Typed
   entry isn't offered: the value has three sensible digits at most, and a text
   field here would need its own parse, clamp and revert-on-blur for a control
   two clicks can drive. */
const MARGIN_STEP = 0.125;
const MARGIN_MIN = 0.25;
const MARGIN_MAX = 2;

function MarginRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const step = (dir: -1 | 1) => onChange(
    Math.min(MARGIN_MAX, Math.max(MARGIN_MIN, Math.round((value + dir * MARGIN_STEP) / MARGIN_STEP) * MARGIN_STEP)),
  );
  const btn = (dir: -1 | 1, glyph: string, off: boolean) => (
    <button
      onClick={() => step(dir)}
      disabled={off}
      className={off ? '' : 'cursor-pointer hover:bg-[#F0F2F5]'}
      style={{
        ...ns, width: 26, height: 26, borderRadius: RADIUS_SM, border: 'none', background: 'transparent',
        fontSize: 15, fontWeight: 600, color: off ? BORDER : SLATE, lineHeight: 1,
      }}
    >
      {glyph}
    </button>
  );
  return (
    <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
      <span style={{ ...ns, fontSize: 12.5, color: INK }}>{label}</span>
      <div className="flex items-center" style={{ border: `1px solid ${BORDER}`, borderRadius: RADIUS_SM, background: '#fff' }}>
        {btn(-1, '−', value <= MARGIN_MIN)}
        {/* Tabular figures so the number doesn't jump sideways as it steps. */}
        <span style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: INK, width: 52, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
          {value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}&Prime;
        </span>
        {btn(1, '+', value >= MARGIN_MAX)}
      </div>
    </div>
  );
}

/* Page setup — trim size and margins.

   Edited as a DRAFT and applied in one go, rather than live like every other
   control in this panel. Both settings re-break every chapter in the book, so
   applying on each click would reflow the whole thing five times while someone
   makes up their mind, and the confirmation this needs would fire five times
   with it. Apply is disabled until something actually differs, so the button
   is also the only indication of unsaved intent the panel needs. */
function PageSetupSection({ sizeId, marginX, marginY, bookPageCount, onApply }: {
  sizeId: string;
  marginX: number;
  marginY: number;
  bookPageCount: number;
  onApply: (next: { sizeId: string; marginX: number; marginY: number }) => void;
}) {
  const [draftSize, setDraftSize] = useState(sizeId);
  const [draftX, setDraftX] = useState(marginX);
  const [draftY, setDraftY] = useState(marginY);
  const [confirming, setConfirming] = useState(false);
  const dirty = draftSize !== sizeId || draftX !== marginX || draftY !== marginY;

  return (
    <div style={{ padding: '0 14px' }}>
      <PanelHeading divider>Page size</PanelHeading>
      <OptionGrid
        columns={2}
        value={draftSize}
        onChange={setDraftSize}
        options={PAGE_SIZES.map((sz) => ({
          id: sz.id,
          title: `${sz.label} — ${sz.inW} × ${sz.inH} in`,
          render: (
            <div className="flex flex-col items-center" style={{ gap: 2 }}>
              <span style={{ ...ns, fontSize: 12, fontWeight: 600 }}>{sz.label}</span>
              <span style={{ ...ns, fontSize: 10.5, fontWeight: 500, color: SLATE }}>{sz.inW} × {sz.inH} in</span>
            </div>
          ),
        }))}
      />

      <PanelHeading>Margins</PanelHeading>
      <MarginRow label="Sides" value={draftX} onChange={setDraftX} />
      <MarginRow label="Top and bottom" value={draftY} onChange={setDraftY} />

      <div style={{ marginTop: 14 }}>
        <FullButton label="Apply page setup" tone={dirty ? 'active' : 'default'} disabled={!dirty} onClick={() => setConfirming(true)} />
      </div>
      <div style={{ ...ns, fontSize: 11.5, color: SLATE, lineHeight: 1.5, marginTop: 10 }}>
        Applies to every page in the book. Chapters re-break to fit, so the page count changes.
      </div>

      {confirming && (
        <ConfirmDialog
          title="Apply new page setup?"
          body={`Your book is ${bookPageCount} ${bookPageCount === 1 ? 'page' : 'pages'} at the current size. Changing it re-breaks every chapter, so both the page count and where each page ends will change. Nothing you have written is affected.`}
          confirmLabel="Apply"
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); onApply({ sizeId: draftSize, marginX: draftX, marginY: draftY }); }}
        />
      )}
    </div>
  );
}

/* The one modal in this panel. Rendered into the body so it clears the left
   rail's own stacking context, which would otherwise crop it to a 260px
   column. */
function ConfirmDialog({ title, body, confirmLabel, onCancel, onConfirm }: {
  title: string; body: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(15,23,51,0.32)', zIndex: 200 }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...ns, width: 400, background: '#fff', borderRadius: RADIUS_LG, padding: '22px 22px 18px', boxShadow: '0 18px 50px rgba(15,23,51,0.22)' }}
      >
        <div style={{ fontSize: 15.5, fontWeight: 700, color: INK, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: SLATE, lineHeight: 1.55 }}>{body}</div>
        <div className="flex justify-end" style={{ gap: 8, marginTop: 20 }}>
          <button
            onClick={onCancel}
            className="cursor-pointer hover:bg-[#F0F2F5]"
            style={{ ...ns, height: 34, padding: '0 16px', borderRadius: RADIUS_SM, border: `1px solid ${BORDER}`, background: '#fff', fontSize: 13, fontWeight: 600, color: INK }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="cursor-pointer"
            style={{ ...ns, height: 34, padding: '0 16px', borderRadius: RADIUS_SM, border: 'none', background: BLUE, fontSize: 13, fontWeight: 600, color: '#fff' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SettingsPanel({ pageNumbers, setPageNumbers, spellcheck, setSpellcheck, paragraphStyle, setParagraphStyle }: {
  pageNumbers: PageNumberSettings;
  setPageNumbers: (v: PageNumberSettings) => void;
  spellcheck: boolean;
  setSpellcheck: (v: boolean) => void;
  paragraphStyle: ParagraphStyle;
  setParagraphStyle: (v: ParagraphStyle) => void;
}) {
  return (
    <div style={{ padding: '0 14px' }}>
      {/* First, because it's the one setting here that changes how every page of
          the book looks. Drawn specimens rather than the words "Spaced" and
          "Indented" on their own: the difference IS a shape, and two tiles
          showing it decide the question without anyone having to know the
          vocabulary. Same previews as the Text tiles (see BLOCK_PREVIEWS). */}
      <PanelHeading>Paragraphs</PanelHeading>
      <OptionGrid
        columns={2}
        value={paragraphStyle}
        onChange={(v) => setParagraphStyle(v)}
        options={[
          {
            id: 'spaced' as ParagraphStyle,
            label: 'Spaced',
            title: 'A blank line between paragraphs, no indent',
            render: (
              <PreviewSheet pad="8px 10px">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <PreviewBar h={2.5} /><PreviewBar h={2.5} w="72%" />
                  <div style={{ height: 6 }} />
                  <PreviewBar h={2.5} /><PreviewBar h={2.5} w="60%" />
                </div>
              </PreviewSheet>
            ),
          },
          {
            id: 'indented' as ParagraphStyle,
            label: 'Indented',
            title: 'First line indented, no space between paragraphs',
            render: (
              <PreviewSheet pad="8px 10px">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <PreviewBar h={2.5} w="66%" align="right" />
                  <PreviewBar h={2.5} /><PreviewBar h={2.5} w="72%" />
                  <PreviewBar h={2.5} w="66%" align="right" />
                  <PreviewBar h={2.5} w="60%" />
                </div>
              </PreviewSheet>
            ),
          },
        ]}
      />
      <div style={{ ...ns, fontSize: 11.5, color: SLATE, lineHeight: 1.5, marginTop: 10 }}>
        Indented is how printed books set running text. Either way, the first paragraph of a chapter and any paragraph after a heading stays flush left.
      </div>

      <PanelHeading divider>Page numbers</PanelHeading>
      <ToggleRow label="Show page numbers" checked={pageNumbers.enabled} onChange={(v) => setPageNumbers({ ...pageNumbers, enabled: v })} />
      {/* Everything past on/off — start count, skipping the cover, position,
          style, font, colour — is a property of the number itself, not a
          document-level setting, so it lives in one place: the Properties
          panel opened by clicking any page number on the canvas (see
          PageNumberInspector). Keeping it here too was the exact "which
          panel do I go to" confusion this was built to avoid. */}
      <div style={{ ...ns, fontSize: 11.5, color: SLATE, lineHeight: 1.5, marginTop: 10 }}>
        Click any page number on the page itself to set its numbering, position, style, font and colour.
      </div>

      {/* Spell-check was never set either way, so every editing surface silently
          inherited whatever the browser happened to default to. */}
      <PanelHeading divider>Writing</PanelHeading>
      <ToggleRow label="Check spelling" checked={spellcheck} onChange={setSpellcheck} />
      <div style={{ ...ns, fontSize: 11.5, color: SLATE, lineHeight: 1.5, marginTop: 10 }}>
        Uses your browser&rsquo;s dictionary, in the language it&rsquo;s set to. Misspellings are underlined as you type; right-click one for suggestions.
      </div>
    </div>
  );
}

/* ══ Inspector chassis ════════════════════════════════════════════════════════
   One shell, one section component, one widget vocabulary — the pattern Designrr's
   own inspector and Beacon's both arrived at independently, and the reason their
   panels stay coherent across wildly different object types. Sections are assembled
   per type; the chrome and the widgets never change.

   Widgets deliberately mirror Designrr's: a colour is always a swatch row, an
   either/or choice is always a grid of labelled tiles, a boolean is always a row
   with a switch on the right. Adding a new object type should mean composing these,
   never hand-rolling another panel. ══════════════════════════════════════════ */

// Used to show a "Chapter title › Kind" breadcrumb — dropped everywhere, not
// just for Image: whatever's selected already has its own visible preview or
// content on the canvas, so naming which chapter it lives in was overhead the
// eyebrow alone (just the kind, e.g. "TEXT", "SHAPE") doesn't need.
function InspectorShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 14px 24px' }}>
      {children}
    </div>
  );
}

/* A second level above InspectorSection, for panels that have outgrown one.
   InspectorSection's note argues for a single label language, and that was right
   while an inspector was a handful of short blocks — but the image panel reached
   nine peers at identical weight (Text wrap, Transform, Appearance, Size, Stroke,
   Effects, Accessibility, Caption, Columns), where a flat list stops reading as
   structure at all. Figma's panel has exactly two levels: a bold dark section
   title over hairline dividers, and quiet grey field labels inside. This is the
   first; InspectorSection stays the second. */
function PanelGroup({ label, first, hint, action, children }: { label: string; first?: boolean; hint?: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    /* The rule sits BETWEEN two groups, so it gets the same air on both faces:
       14px over it, 14px under it before the title. It used to take 4 over and
       14 under, which glued every hairline to the last field of the group above
       and read as that group's underline rather than as a divider. */
    <div style={{ paddingTop: first ? 0 : 14, marginTop: first ? 0 : 14, borderTop: first ? 'none' : `1px solid ${BORDER}` }}>
      <div className="flex items-center justify-between" style={{ marginBottom: children ? 12 : 0 }}>
        <div style={{ ...ns, fontSize: 12.5, fontWeight: 700, color: INK }}>{label}</div>
        {action}
      </div>
      {children}
      {hint && <div style={{ ...ns, fontSize: 11.5, color: SLATE, lineHeight: 1.5, marginTop: 8 }}>{hint}</div>}
    </div>
  );
}

/* A quiet field label — the level below PanelGroup. Sentence case and grey, so a
   field never competes with the section it sits in. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ ...ns, fontSize: 11, color: SLATE, marginBottom: 5 }}>{children}</div>;
}

function InspectorSection({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      {/* Small uppercase mini-label, matching InspectorShell's own eyebrow instead
         of a separate, larger sentence-case convention — one label language for
         every level of the panel, not two. Separation is whitespace, not a rule:
         a hairline after every one of a panel's several short sections (Style,
         Format, Alignment, Color, Text background, List, Link on chapter text
         alone) read as more clutter than structure. */}
      {/* An empty label renders nothing at all rather than an empty 10px line —
          a section whose control needs no naming (a bare swatch row) should sit
          flush under the one above, not behind an invisible heading. */}
      {label ? (
        <div style={{ ...ns, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: EYEBROW_COLOR, marginBottom: 10 }}>{label}</div>
      ) : null}
      {children}
      {hint && <div style={{ ...ns, fontSize: 11.5, color: SLATE, lineHeight: 1.5, marginTop: 8 }}>{hint}</div>}
    </div>
  );
}

/* A grid of labelled, optionally icon-bearing choices — the wrap picker, the shape
   swapper, the paragraph-style picker and the cover image grid are all this. */
/* Figma's numeric field: a small box with a leading glyph and the value, no
   slider. Sliders were my own addition and got cut — they cost a row of height
   each, can't express a precise value without a second control, and Figma puts
   four of these side by side in the space one slider row takes. */
function NumField({ icon, value, min, max, step = 1, suffix, onChange, title, width = '100%', disabled = false }: {
  icon?: React.ReactNode;
  value: number;
  min: number;
  max: number;
  /* Arrow-key increment. It exists because the steppers this field replaced
     carried one — a divider's width moved in 5% notches, a star's ratio in 2.5 —
     and losing it would have made those fields worse than the buttons they
     replaced, not better. Typing any value still works; this only sets the nudge. */
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
  title?: string;
  width?: string | number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    const n = Number(raw.replace(/[^\d.-]/g, ''));
    if (Number.isFinite(n)) onChange(Math.min(Math.max(min, n), max));
    setDraft(null);
  };
  return (
    <div
      title={title}
      className="flex items-center"
      style={{ gap: 4, width, background: '#F4F6F9', borderRadius: RADIUS_SM, padding: '5px 8px', minWidth: 0, opacity: disabled ? 0.45 : 1 }}
    >
      {icon && <span className="flex items-center flex-shrink-0" style={{ color: '#9AA5B4' }}>{icon}</span>}
      <input
        disabled={disabled}
        value={draft ?? `${Math.round(value * 100) / 100}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { commit((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') { setDraft(null); (e.target as HTMLInputElement).blur(); }
          // Arrow keys nudge, as they do in every design tool's numeric field.
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const by = e.shiftKey ? step * 10 : step;
            onChange(Math.min(Math.max(min, value + (e.key === 'ArrowUp' ? by : -by)), max));
          }
        }}
        style={{
          ...ns, fontSize: 12.5, color: INK, background: 'none', border: 'none', outline: 'none',
          width: '100%', minWidth: 0, padding: 0,
        }}
      />
      {/* The unit sits beside the input, not inside its value — it was part of
          the editable string before, so selecting an opacity to retype it meant
          dragging around a "%" that isn't yours to edit (and any typo in it was
          silently stripped on commit). Same treatment as SizeFields' W/H glyph
          at the other end of the well: dimmed, non-editable, part of the box. */}
      {suffix && <span className="flex-shrink-0" style={{ ...ns, fontSize: 10.5, fontWeight: 700, color: '#9AA5B4' }}>{suffix}</span>}
    </div>
  );
}

/* The Stroke section's fields, shared by the body photo, the body shape atom and
   the cover shape — a stroke is the same five decisions wherever it is, and
   three copies of them would be three chances to disagree.

   `sides` and `position` are optional because not every caller has them: the
   cover triangle is drawn as an SVG polygon, which has no edge to name and no
   inside for a ring to sit in, so it passes neither and the rows don't render.

   Position hides whenever the stroke isn't a solid line on all four edges. That
   isn't a style choice — Outside and Centre are drawn as a box-shadow ring, and
   a ring has neither sides nor dashes, so the renderer forces `inside` in those
   cases (see imageStyleValue). The panel hides what the render would ignore. */
function StrokeFields({ color, onColor, width, onWidth, style, onStyle, sides, onSides, position, onPosition }: {
  color: string;
  onColor: (c: string) => void;
  width: number;
  onWidth: (v: number) => void;
  style?: string;
  onStyle?: (v: StrokeStyle) => void;
  sides?: string;
  onSides?: (v: string) => void;
  position?: string;
  onPosition?: (v: string) => void;
}) {
  const picked = parseBorderSides(sides);
  const whole = picked.length === BORDER_SIDES.length;
  const solid = strokeStyleOf(style) === 'solid';
  const toggleSide = (sd: BorderSide) => {
    const next = picked.includes(sd) ? picked.filter((x) => x !== sd) : [...picked, sd];
    // serializeBorderSides keeps the order canonical (t,r,b,l) and collapses a
    // full set back to 'all'; parseBorderSides already refuses to return an
    // empty one, so the last edge can't be switched off into a stroke that
    // claims to exist and draws nothing.
    onSides?.(serializeBorderSides(next));
  };
  return (
    <>
      <div className="flex items-end" style={{ gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FieldLabel>Width</FieldLabel>
          <NumField value={width} min={0} max={40} onChange={onWidth} />
        </div>
        {onStyle && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <FieldLabel>Style</FieldLabel>
            <SelectField value={strokeStyleOf(style)} options={STROKE_STYLE_OPTIONS} onChange={onStyle} />
          </div>
        )}
      </div>
      {onSides && (
        <div style={{ marginTop: 10 }}>
          <FieldLabel>Edges</FieldLabel>
          <PillRow
            items={[
              { key: 'all', label: 'All', active: whole, onClick: () => onSides('all') },
              ...BORDER_SIDES.map((sd) => ({
                key: sd,
                label: BORDER_SIDE_LABEL[sd].slice(0, 1),
                active: !whole && picked.includes(sd),
                onClick: () => toggleSide(sd),
              })),
            ]}
          />
        </div>
      )}
      {onPosition && whole && solid && (
        <div style={{ marginTop: 10 }}>
          <FieldLabel>Position</FieldLabel>
          <SelectField
            value={position === 'outside' || position === 'center' ? position : 'inside'}
            options={[{ id: 'inside' as const, label: 'Inside' }, { id: 'center' as const, label: 'Centre' }, { id: 'outside' as const, label: 'Outside' }]}
            onChange={onPosition}
          />
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <FieldLabel>Colour</FieldLabel>
        <SwatchRow value={color} onChange={onColor} />
      </div>
    </>
  );
}

/* Figma's small select: current value plus a chevron, a compact popup list with a
   tick on the active row. Used for the image fill mode and the stroke position. */
function SelectField<T extends string>({ value, options, onChange, width = '100%', subtle = false, openUp = false }: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  width?: string | number;
  /* A bordered white box instead of the grey fill, for the one place this sits
     on a card rather than in an inspector row — the generate-image composer,
     where a filled control read as a second input next to the prompt. */
  subtle?: boolean;
  /* Opens above. The composer's select sits at the bottom of its card, where a
     downward list would open off the panel. */
  openUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const current = options.find((o) => o.id === value);
  return (
    <div ref={ref} className="relative" style={{ width, minWidth: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between cursor-pointer"
        style={{ width: '100%', gap: 4, background: subtle ? '#fff' : '#F4F6F9', borderRadius: RADIUS_SM, border: subtle ? `1px solid ${BORDER}` : 'none', padding: '6px 8px' }}
      >
        <span style={{ ...ns, fontSize: 12.5, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{current?.label ?? value}</span>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{ flexShrink: 0 }}><path d="M1 1L4 4L7 1" stroke={SLATE} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="absolute flex flex-col" style={{ ...(openUp ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }), left: 0, minWidth: '100%', zIndex: 40, padding: 4, background: '#fff', borderRadius: RADIUS_MD, border: `1px solid ${PANEL_BORDER}`, boxShadow: MENU_SHADOW }}>
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => { onChange(o.id); setOpen(false); }}
              className="flex items-center text-left cursor-pointer"
              style={{ gap: 6, ...ns, fontSize: 12.5, padding: '6px 8px', borderRadius: RADIUS_SM, border: 'none', whiteSpace: 'nowrap',
                background: o.id === value ? '#EEF3FF' : 'none', color: o.id === value ? BLUE : INK }}
            >
              <span style={{ width: 10, flexShrink: 0 }}>{o.id === value ? '✓' : ''}</span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* A Figma "+" section: absent until you add it, then a row of controls with a
   minus to remove. Keeps Border and Shadow out of the way on the vast majority
   of images that have neither, and means no control is ever visible while doing
   nothing. */
function AddableSection({ label, active, onAdd, onRemove, children }: {
  label: string; active: boolean; onAdd: () => void; onRemove: () => void; children?: React.ReactNode;
}) {
  return (
    <div style={{ borderTop: `1px solid ${BORDER}`, padding: '12px 0' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: active ? 8 : 0 }}>
        <span style={{ ...ns, fontSize: 12.5, fontWeight: 700, color: active ? INK : SLATE }}>{label}</span>
        <button
          onClick={active ? onRemove : onAdd}
          className="flex items-center justify-center cursor-pointer"
          style={{ width: 22, height: 22, borderRadius: RADIUS_SM, border: 'none', background: 'none', color: SLATE }}
          aria-label={active ? `Remove ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            {active ? <path d="M5 12h14" /> : <path d="M12 5v14M5 12h14" />}
          </svg>
        </button>
      </div>
      {active && children}
    </div>
  );
}

function OptionGrid<T extends string>({ options, value, onChange, columns = 2, flush = false }: {
  // draggable/onDragStart/onDragEnd are opt-in per option — only a caller that
  // means "this card is content you can drag onto the canvas" (the new-image
  // library grid) sets them; every other OptionGrid use (shape-swap, alignment,
  // style pickers) leaves them undefined and stays exactly as before.
  options: { id: T; label?: string; icon?: string; render?: React.ReactNode; title?: string; draggable?: boolean; onDragStart?: (e: React.DragEvent) => void; onDragEnd?: () => void }[];
  value: T | null;
  onChange: (id: T) => void;
  columns?: number;
  /* The rendered content IS the tile — a photo fills it edge to edge instead of
     sitting inset on a white card. Opt-in rather than keyed off `render`,
     because `render` also carries a text specimen (text styles) and an SVG
     glyph (shape swap), both of which still want their padding. */
  flush?: boolean;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 8 }}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            title={o.title ?? o.label}
            draggable={o.draggable}
            onDragStart={o.onDragStart}
            onDragEnd={o.onDragEnd}
            onClick={() => onChange(o.id)}
            className={`flex flex-col items-center justify-center cursor-pointer transition-colors duration-150${active ? '' : ' hover:bg-[#F7F8FA] hover:border-[#C7CEDA]'}`}
            style={{
              gap: flush ? 0 : 5,
              padding: flush ? 0 : o.render ? '10px 6px' : '10px 8px',
              minHeight: flush ? 0 : 38,
              /* Grid blowout guard. A grid item's min-width is auto, so one tile
                 whose content won't wrap (a text-style specimen set in Syne 800,
                 say) pushes its whole column wider than its 1fr share and the
                 last column is cut off by the panel's edge. */
              minWidth: 0,
              overflow: 'hidden',
              border: active ? `1.5px solid ${BLUE}` : `1px solid ${BORDER}`,
              borderRadius: RADIUS_MD, background: active ? '#EEF3FF' : '#fff',
              color: active ? BLUE : INK, ...ns, fontSize: 12, fontWeight: 600,
              cursor: o.draggable ? 'grab' : 'pointer',
            }}
          >
            {o.render}
            {o.icon && <Icon d={o.icon} size={17} />}
            {o.label && <span style={{ fontSize: o.icon ? 10.5 : 12, fontWeight: 600 }}>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* A row of equal-width toggles — text marks, lists, alignment. Solid fill on
   active, not a light wash: these are plain icon/label buttons with nothing
   rendered inside them to protect, so a confident filled state (matching the
   presentation editor's own alignment/list/spacing groups) reads faster than a
   tinted background — reserve the lighter wash for OptionGrid, whose cards
   carry real content a heavy fill would fight with. */
function PillRow({ items }: { items: { key: string; label: React.ReactNode; active: boolean; onClick: () => void; style?: React.CSSProperties }[] }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {items.map((i) => (
        <button
          key={i.key}
          onClick={i.onClick}
          className={`flex items-center justify-center cursor-pointer transition-colors duration-150${i.active ? '' : ' hover:bg-[#EEF0F3] hover:border-[#C7CEDA]'}`}
          style={{
            ...ns, flex: 1, height: 34, borderRadius: RADIUS_SM, gap: 5, whiteSpace: 'nowrap',
            border: `1px solid ${i.active ? BLUE : BORDER}`,
            background: i.active ? BLUE : '#F7F8FA', color: i.active ? '#fff' : SLATE,
            fontSize: 13, fontWeight: 600, ...i.style,
          }}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

/* The real cover editor's colour rows end in a circular "+" that opens a picker and
   adds the result to the row — not just a fixed preset list. Custom picks here are
   local to the row (not persisted as a cross-panel "recent colors" history), which
   keeps this a small addition rather than new global state. */
/* One line, always. The row is 235px inside this panel and a swatch costs 30
   (24 + 6 gap), so eight is the hard ceiling — presets, one custom pick and the
   "+". Custom picks used to append without limit, and three of them put the row
   on its third line, so only the most recent is kept. The preset slice enforces
   the rest of the budget here rather than trusting each caller to count. */
const SWATCH_MAX_PRESETS = 6;

/* One palette for every colour control in the editor. There used to be nine
   hand-written ones: three rows carried the same seven colours in three
   different orders, a fourth swapped one out, and the same word meant different
   values in different panels — blue was #006EFE in the swatch rows but #2563EB
   in the info box accents, red was #B91C1C in prose but #E14F3D on the cover and
   in shapes. An author who picked "red" twice got two reds and no way to tell
   why the book looked off.

   Two sets, split by what the colour lands on rather than by which panel asks.
   SWATCH_COLORS is for anything that colours a mark, a rule, a shape, a border,
   a shadow or a box accent. SWATCH_HIGHLIGHTS is for the two controls that put
   colour *behind body text* (the highlight mark, the inline-CTA panel), where an
   ink would make the text it sits under unreadable.

   Both lead with the book's own accent, which is the colour the theme already
   committed to and the one no palette here offered before — the highlight set
   takes it mixed down to a tint, using the same mixer the info box derives its
   fill with. Five fixed entries after it, because a row is eight swatches wide
   at most and one slot each goes to the last custom pick and the + button. */
const SWATCH_COLORS = [INK, SLATE, '#FFFFFF', '#B91C1C', '#2A7A57'];
const SWATCH_HIGHLIGHTS = ['#FEF3C7', '#DCFCE7', '#DBEAFE', '#FCE7F3', '#F0F2F5'];

/* A row of swatches and a + for anything else — no hex field. The audience here
   is authors, not designers: they don't know their hex, they know "the dark red
   one", and the split in the research runs on exactly that line — swatch and
   inline pickers suit product users, spectrum-and-hex pickers suit design tools
   (eleken.co/blog-posts/color-picker-ui). A curated row also keeps one book's
   colours agreeing with each other, which a free hex field actively works
   against. The custom pick is kept as a seventh swatch so the second use of a
   chosen colour is one click, not another trip through the picker. */
function SwatchRow({ value, onChange, tone = 'color' }: {
  value: string;
  onChange: (c: string) => void;
  tone?: 'color' | 'highlight';
}) {
  const { accentColor } = useContext(EditorPrefsContext);
  const accent = tone === 'highlight' ? mixWithWhite(accentColor, 0.14) : accentColor;
  const base = tone === 'highlight' ? SWATCH_HIGHLIGHTS : SWATCH_COLORS;
  // Deduped case-insensitively: a theme whose accent already IS one of the five
  // would otherwise spend two of six slots on the same colour.
  const colors = [accent, ...base.filter((c) => c.toLowerCase() !== accent.toLowerCase())].slice(0, SWATCH_MAX_PRESETS);
  const [extra, setExtra] = useState<string | null>(() => (colors.includes(value) || !value ? null : value));
  const all = extra && !colors.includes(extra) ? [...colors, extra] : colors;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', alignItems: 'center' }}>
      {all.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          title={c}
          className="cursor-pointer flex-shrink-0"
          style={{
            width: 24, height: 24, borderRadius: '50%', background: c, padding: 0, border: 'none',
            // A floating ring (white gap + blue outline) rather than a flat border —
            // reads as "selected" at a glance and, using the app's own accent rather
            // than a plain black ring, matches how every other active state here
            // (OptionGrid, PillRow) already signals "this one" in blue.
            boxShadow: value === c ? `0 0 0 2px #fff, 0 0 0 3.5px ${BLUE}` : '0 0 0 1px rgba(0,0,0,0.12)',
          }}
        />
      ))}
      <label
        title="Custom colour"
        className="cursor-pointer flex items-center justify-center"
        style={{ width: 24, height: 24, borderRadius: '50%', border: `1px dashed ${SLATE}`, color: SLATE, position: 'relative', flexShrink: 0 }}
      >
        <span style={{ fontSize: 14, lineHeight: 1, marginTop: -1 }}>+</span>
        <input
          type="color"
          // Falls back to a real color string: the caller's `value` is often read
          // straight off `editor.getAttributes()`, which briefly returns {} (so
          // this prop is undefined) the instant the selection moves off this node
          // — e.g. dropping a new block in elsewhere while this inspector is still
          // mounted. A native color input going from a defined value to undefined
          // trips React's controlled/uncontrolled warning, so never hand it one.
          value={value || '#000000'}
          onChange={(e) => { const c = e.target.value; setExtra(c); onChange(c); }}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
        />
      </label>
    </div>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" />
    </svg>
  );
}

/* A marker pen over a baseline. The cross-stroke at the tip is what separates it
   from the plain pen glyph that would otherwise read as "edit". */
function HighlightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21h14M9 17l8.5-8.5a2.1 2.1 0 0 0-3-3L6 14v3h3zM13 6l4 4" />
    </svg>
  );
}

/* A Notion/Google-Docs-style bubble menu over the current text selection. This is
   the editor's primary formatting surface, not a shortcut layer over one: a book
   page is portrait, so permanent horizontal chrome spends the dimension there's
   least of — hence a floating bar rather than the fixed toolbar Word/Atticus/Canva
   use. It therefore carries the high-frequency work: block style, the four inline
   marks, link and highlight. Font family/size, line spacing, the full colour
   swatches and list type stay in TextInspector — lower-frequency, more deliberate
   choices better served by a panel than by cramped bubble controls. Highlight
   appears in both on purpose: one tap for the default amber here, the full swatch
   row there. Positioned by TipTap's own
   BubbleMenu (floating-ui under the hood, `flip: true`, so it renders above
   the selection or below it when there's no room above) — unlike
   `position: sticky` (see FloatingBarPortal above, and the zoom-transform
   saga that led to it), floating-ui is built to correctly compensate for a
   transformed ancestor's scale, which is exactly what this canvas's zoom
   control is. */
/* The bubble's one-tap highlight colour. Matches the first swatch TextInspector
   offers, so the quick route and the deliberate route start from the same amber
   rather than two different yellows. */
const BUBBLE_HIGHLIGHT = '#FEF3C7';

function TextSelectionBubbleMenu({ editor }: { editor: Editor }) {
  const [linkEditing, setLinkEditing] = useState(false);
  const linkActive = editor.isActive('link');
  const [linkDraft, setLinkDraft] = useState('');
  const highlightActive = editor.isActive('highlight');

  const barStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 1, background: '#fff',
    border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, padding: 3, boxShadow: MENU_SHADOW,
  };
  const btnStyle = (active: boolean): React.CSSProperties => ({
    ...ns, width: 28, height: 28, borderRadius: RADIUS_SM, border: 'none', fontSize: 14,
    background: active ? '#EEF3FF' : 'none', color: active ? BLUE : INK,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer',
  });
  const divider = <div style={{ width: 1, height: 18, background: BORDER, margin: '0 2px', flexShrink: 0 }} />;

  const openLink = () => {
    setLinkDraft((editor.getAttributes('link') as { href?: string }).href ?? '');
    setLinkEditing(true);
  };
  const applyLink = () => {
    const href = linkDraft.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      const normalised = /^(https?:|mailto:|#|\/)/i.test(href) ? href : `https://${href}`;
      editor.chain().focus().extendMarkRange('link').setLink({ href: normalised }).run();
    }
    setLinkEditing(false);
  };

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 8, flip: true }}
      shouldShow={({ state }) => {
        // Only a real text selection — a collapsed caret shows nothing, and
        // a selected object (image/shape/table/...) gets FloatingObjectBar
        // instead of this.
        const { from, to } = state.selection;
        if (from === to) return false;
        return !(state.selection instanceof NodeSelection);
      }}
    >
      {linkEditing ? (
        <div style={{ ...barStyle, width: 230 }} onPointerDown={(e) => e.stopPropagation()}>
          <input
            value={linkDraft}
            autoFocus
            placeholder="example.com"
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
              if (e.key === 'Escape') setLinkEditing(false);
            }}
            style={{ ...ns, flex: 1, minWidth: 0, fontSize: 12.5, border: 'none', outline: 'none', padding: '0 6px', color: INK }}
          />
          {linkActive && (
            <Tooltip label="Remove link" position="top">
              <button
                onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); setLinkEditing(false); }}
                style={btnStyle(false)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B91C1C" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </Tooltip>
          )}
          <button
            onClick={applyLink}
            style={{ ...btnStyle(false), background: BLUE, color: '#fff', width: 'auto', padding: '0 10px', fontWeight: 700, fontSize: 12 }}
          >
            {linkActive ? 'Update' : 'Apply'}
          </button>
        </div>
      ) : (
        <div style={barStyle} onPointerDown={(e) => e.stopPropagation()}>
          {/* Block style leads: "make this a subheading" is the most common thing
              asked of a block, and three options read better as a segmented row
              than as a dropdown that would cost two clicks to do the same job. */}
          {/* No Paragraph/Subheading/Quote here any more. They were added when a
              bare caret couldn't open Properties; now it can, and block style has
              one home instead of three. This bar is marks and inline inserts —
              things that act on the selection you're holding. */}
          <Tooltip label="Bold" position="top">
            <button onClick={() => editor.chain().focus().toggleBold().run()} style={{ ...btnStyle(editor.isActive('bold')), fontWeight: 800 }}>B</button>
          </Tooltip>
          <Tooltip label="Italic" position="top">
            <button onClick={() => editor.chain().focus().toggleItalic().run()} style={{ ...btnStyle(editor.isActive('italic')), fontStyle: 'italic' }}>I</button>
          </Tooltip>
          <Tooltip label="Underline" position="top">
            <button onClick={() => editor.chain().focus().toggleUnderline().run()} style={{ ...btnStyle(editor.isActive('underline')), textDecoration: 'underline' }}>U</button>
          </Tooltip>
          <Tooltip label="Strikethrough" position="top">
            <button onClick={() => editor.chain().focus().toggleStrike().run()} style={{ ...btnStyle(editor.isActive('strike')), textDecoration: 'line-through' }}>S</button>
          </Tooltip>
          {divider}
          <Tooltip label="Link" position="top">
            <button onClick={openLink} style={btnStyle(linkActive)}>
              <LinkIcon />
            </button>
          </Tooltip>
          <Tooltip label={highlightActive ? 'Remove highlight' : 'Highlight'} position="top">
            <button
              onClick={() => (highlightActive
                ? editor.chain().focus().unsetHighlight().run()
                : editor.chain().focus().setHighlight({ color: BUBBLE_HIGHLIGHT }).run())}
              style={btnStyle(highlightActive)}
            >
              <HighlightIcon />
            </button>
          </Tooltip>
          {/* A footnote is an inline insert at the selection, which is what this
              bar is for — and it needs to be reachable while you're reading the
              sentence you're annotating, not from a side panel. The marker lands
              after the selection; ⌘⌥F does the same thing from a bare caret,
              which is the one gesture this bar can't serve. */}
          <Tooltip label="Footnote (⌘⌥F)" position="top">
            <button onClick={() => insertFootnote(editor)} style={btnStyle(false)}>
              <span style={{ ...ns, fontSize: 13, fontWeight: 700 }}>
                a<sup style={{ fontSize: 9, fontWeight: 700 }}>1</sup>
              </span>
            </button>
          </Tooltip>
        </div>
      )}
    </BubbleMenu>
  );
}

/* There was no file input anywhere in the editor: the seven bundled stock photos
   were the entire image library, for body images and the cover both. Authors
   arrive with their own pictures and their own finished cover art. Sized and
   worded to match the real product's own Media panel — a proper drop target,
   not just a small button, since drag-and-drop is the primary route in. */
function ImageDropzone({ onPicked, onError }: {
  onPicked: (src: string, name: string) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const result = await readImageFile(file);
    if ('error' in result) onError(result.error);
    else onPicked(result.src, result.label);
  };

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFile(e.dataTransfer.files?.[0]); }}
      className="flex flex-col items-center justify-center text-center"
      style={{
        gap: 6, padding: '20px 12px', border: `1.5px dashed ${dragOver ? BLUE : BORDER}`, borderRadius: RADIUS_MD,
        background: dragOver ? '#F3F8FF' : '#fff', transition: 'border-color .1s ease, background .1s ease',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared straight away so picking the same file twice still fires.
          e.target.value = '';
          void handleFile(file);
        }}
      />
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      <div style={{ ...ns, fontSize: 12.5, color: INK }}>
        Drag and drop your photo or{' '}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer"
          style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: BLUE, background: 'none', border: 'none', padding: 0 }}
        >
          browse
        </button>
      </div>
      <div style={{ ...ns, fontSize: 11, color: SLATE }}>PNG, JPG</div>
    </div>
  );
}

/* AI image generation — mocked like every network-backed feature in this
   prototype (see STOCK_IMAGES, qrModules): no real model call, but a real
   credit cost shown up front and a prompt-seeded pick from the stock library
   so two different prompts don't always land on the same photo. Landing spot
   for the generated image is a real library entry (via ImageLibraryContext),
   so it's selectable again afterwards exactly like an upload. */
function GenerateImagePanel({ currentPlan, onGenerated }: { currentPlan: string; onGenerated: (src: string, label: string) => void }) {
  const library = useContext(ImageLibraryContext);
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<'square' | 'landscape' | 'portrait'>('square');
  // Cropping to the chosen ratio is async (image load + canvas), so the button
  // has a real in-flight state rather than appearing to do nothing for a frame.
  const [busy, setBusy] = useState(false);

  const limit = IMAGE_CREDIT_LIMITS[currentPlan] ?? IMAGE_CREDIT_LIMITS.standard;
  const remaining = limit - library.creditsUsed;
  const canGenerate = prompt.trim().length > 0 && remaining >= IMAGE_GENERATE_COST && !busy;

  /* Prompt height is state, not the textarea's own `resize`. The native grabber
     renders at the TEXTAREA's bottom-right, which sits mid-box here because the
     aspect rail is below it — so the composer looked like it had a handle
     floating in its middle. Moving `resize` to the wrapper would put it in the
     right corner but needs `overflow: auto`, which clips the aspect dropdown
     opening downward out of the same box. A handle we own solves both: it sits
     on the composer's true corner and nothing has to clip. */
  const [promptH, setPromptH] = useState(76);
  const dragRef = useRef<{ y: number; h: number } | null>(null);

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    const chosen = seededPick(STOCK_IMAGES, `${prompt}:${aspect}`);
    const label = prompt.trim().slice(0, 40) || 'Generated image';
    /* The aspect ratio is applied here rather than just labelled. If the crop
       can't be produced the original still ships — a generation that silently
       does nothing would be worse than one that comes back the wrong shape, and
       the credit has effectively been spent either way. */
    let src = chosen.src;
    try { src = await renderToAspect(chosen.src, ASPECT_RATIOS[aspect]); } catch { /* keep the uncropped source */ }
    library.useCredits(IMAGE_GENERATE_COST);
    // 'generated', explicitly. `add` defaults source to 'upload', and this call
    // omitted the argument — so every AI image filed itself under "My uploads"
    // and the "Wordgenie AI (n)" section stayed on (0) no matter how many you
    // generated or how many credits it spent.
    library.add(label, src, 'generated');
    onGenerated(src, label);
    setPrompt('');
    setBusy(false);
  };

  /* One composer box, not a collapsed button over a form. This used to open
     behind a solid blue "Generate image" button whose only job was setOpen(true)
     — the loudest control in the panel spending a click to reveal a text box
     that was already built, the same disclosure-over-nothing pattern as the old
     "Browse my uploads".
     Everything that belongs to the prompt now lives in the prompt's own box: the
     aspect dropdown and the Generate button sit on its footer rail, so the whole
     tool is one object instead of a stack of four labelled sections. The border
     is on the wrapper and the textarea is bare, so focus rings the whole
     composer rather than a box inside a box.
     Mode (Quality/Fast) was dropped. Aspect ratio changes what you get and is
     worth a control; Quality-vs-Fast is a speed/price tradeoff this prototype
     does not actually make, and it was a second choice to answer before the one
     that matters. */
  return (
    <div>
      {/* One inset, on the wrapper. The textarea and the footer rail carry none
          of their own, so the prompt text and the aspect label sit on the same
          left edge instead of each child adding its own indent to the box's. */}
      <div
        className="book-ai-composer"
        style={{ position: 'relative', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, background: '#fff', padding: 10 }}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            // Enter submits, Shift+Enter breaks the line — the convention for
            // any single-purpose prompt box.
            if (e.key === 'Enter' && !e.shiftKey && canGenerate) { e.preventDefault(); void generate(); }
          }}
          placeholder="Describe the image you want…"
          style={{
            ...ns, width: '100%', fontSize: 12.5, padding: 0, border: 'none',
            outline: 'none', resize: 'none', overflow: 'auto', display: 'block',
            background: 'transparent', height: promptH, marginBottom: 9,
          }}
        />
        {/* Flush left with the prompt text above it. This used to be pulled back
            by the select's own hit padding, which was right while the select was
            borderless — the thing to line up was its label. Now that it draws a
            border, the box edge is what reads as the left margin, so the offset
            has to go or the control hangs outside the composer's own inset. */}
        <div className="flex items-center">
          <SelectField
            subtle
            openUp
            value={aspect}
            onChange={setAspect}
            width="auto"
            /* DALL·E 3's exact three presets, and the only ratio pair every
               major generator supports (Imagen and Midjourney both include
               16:9/9:16; 3:2 and 2:3 are photography ratios that really only
               Midjourney exposes). This is an AI-generation control, so the
               reference point people arrive with is other AI tools, not a
               camera. Checked Sept 2026. */
            options={[
              { id: 'square' as const, label: 'Square (1:1)' },
              { id: 'landscape' as const, label: 'Landscape (16:9)' },
              { id: 'portrait' as const, label: 'Portrait (9:16)' },
            ]}
          />
        </div>
        {/* Vertical only: a horizontal drag would push the composer past the
            fixed-width panel it lives in. Pointer events with capture, so the
            drag survives the cursor leaving the 14px target. */}
        <div
          role="separator"
          aria-label="Resize prompt"
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            dragRef.current = { y: e.clientY, h: promptH };
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d) return;
            setPromptH(Math.min(300, Math.max(56, d.h + (e.clientY - d.y))));
          }}
          onPointerUp={(e) => {
            dragRef.current = null;
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
          }}
          style={{
            position: 'absolute', right: 3, bottom: 3, width: 14, height: 14,
            cursor: 'ns-resize', touchAction: 'none',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
          }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
            <path d="M7 1L1 7M7 4.5L4.5 7" stroke={INK} strokeOpacity="0.28" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      {/* Below the box and full width, not tucked on the footer rail beside the
          aspect select. The two are not peers: one narrows an option, the other
          spends credits and commits. Always present and disabled until there is
          a prompt — a button that only appears once you have typed shifts the
          layout under the cursor. The tooltip carries the reason, since a greyed
          button with no explanation reads as broken rather than disabled. */}
      <Tooltip
        fullWidth
        label={remaining < IMAGE_GENERATE_COST ? 'Out of credits this month' : !canGenerate ? 'Describe the image first' : 'Generate with AI'}
        position="top"
      >
        <button
          disabled={!canGenerate}
          onClick={() => void generate()}
          className="w-full cursor-pointer flex items-center justify-center"
          style={{
            ...ns, gap: 7, marginTop: 8, fontSize: 12.5, fontWeight: 600, color: '#fff', border: 'none',
            borderRadius: RADIUS_MD, padding: '9px 12px',
            background: canGenerate ? BLUE : '#C2C9D4', cursor: canGenerate ? 'pointer' : 'default',
          }}
        >
          <AISparkleIcon size={14} mono />
          {busy ? 'Generating…' : remaining < IMAGE_GENERATE_COST ? 'Out of credits' : 'Generate with AI'}
        </button>
      </Tooltip>
    </div>
  );
}
function SectionLabel({ children, first, divider, tight }: { children: React.ReactNode; first?: boolean; divider?: boolean; tight?: boolean }) {
  return (
    /* One level below PanelHeading, matching InsertSection exactly — the two are
       the same rung on different panels and were drifting apart.

       The gap above was 18px against a 9px label-to-content gap — a 2:1 ratio,
       which is not enough separation to read as grouping, so four sections ran
       together as one column of stuff. 28:9 is ~3:1 and groups on proximity
       alone, which is the cheapest structure there is.

       `divider` is deliberately rare. A hairline under every short section reads
       as clutter rather than structure (the same argument InspectorSection makes
       in its own note) — this marks the one place the panel actually changes
       mode, from "images you already have" to "find or make a new one".

       Sticky because this is the longest scroll in the editor and the label that
       tells you which source you are looking at used to leave the screen first. */
    <div
      style={{
        /* 13px, matching InsertPanel's group headers — this is the same rung
           (a top-level section inside a tab), and it was sitting at 12px, the
           size InsertSection uses for SUB-sections. One size per level:
           13 section › 12 sub-section › 11 slate field label. */
        ...ns, fontSize: 13, fontWeight: 700, color: INK,
        position: 'sticky', top: 0, zIndex: 3, background: '#fff',
        /* `tight` halves the gap for a section that belongs to the one above it
           rather than standing beside it. "Your uploads" is what "Upload a
           photo" produces — an action and its own result — so the full 28px
           between-source gap read as two unrelated sources, and a divider there
           would have cut the cause from the effect. The three real sources
           (yours / stock / AI) keep the wide gap and the dividers. */
        marginTop: first ? 0 : tight ? 14 : 28, paddingBottom: 9,
        ...(divider ? { borderTop: `1px solid ${BORDER}`, paddingTop: 20, marginTop: 28 } : null),
      }}
    >
      {children}
    </div>
  );
}

/* Sourcing a photo — generate/upload/search a library — lives on the left with
   the rest of Insert, not in the right Properties panel: picking a new image is
   the same kind of task as inserting one in the first place, whereas dark
   overlay/wrap/alt text are true properties of the one you already have. Shown
   contextually in the Media tab whenever an image (cover or chapter-body) is
   selected, replacing rather than duplicating what used to live in Properties —
   and reused as-is by MediaPickerPanel below for a photo that doesn't exist in
   the book yet at all, just with a different heading (`title`).

   Section order/structure (Upload → My uploads → Suggested → Wordgenie AI, no
   divider lines between them, one continuous scroll) matches the real Designrr
   Media panel rather than the ad-hoc "generate, upload, search" stack this used
   to be. */
/* No panel title. In the Photos TAB the rail already names it — "Photos", lit
   blue, one column to the left and permanently on screen — so a "Photos" heading
   above an "Upload a photo" heading was the same word twice at nearly the same
   size. In the Properties overlay the header bar above already names the
   selection, now including the two photo slots that used to fall through to
   "Properties" (see selectionLabel). Either way something else is already
   saying it, so the panel starts at its first real section. */
function PhotoSourcePanel({ currentPlan, currentSrc, onPick, draggableToPlace = false, onDragTile }: {
  currentPlan: string;
  currentSrc: string;
  onPick: (src: string, label: string) => void;
  // Set only by MediaPickerPanel's "choose a brand-new image" flow — there's
  // somewhere to drop a new photo (the canvas). The Replace-image/Opener-photo/
  // Author-photo callers leave this off: swapping an image that's already
  // placed is a click action everywhere (Canva included), not a drag one.
  draggableToPlace?: boolean;
  onDragTile?: (id: string | null) => void;
}) {
  const library = useContext(ImageLibraryContext);
  const [query, setQuery] = useState('');
  const [uploadError, setUploadError] = useState('');
  /* Was `showUploads`, defaulting to false behind a "Browse my uploads" button.
     That button only ever toggled this boolean — the uploads are already in
     `library.images`, so nothing was fetched or navigated to; it hid content that
     was sitting right there. At zero it was worse than useless: the section label
     already read "My uploads (0)", and clicking through revealed "Nothing uploaded
     yet." — the same fact twice, the second time behind an interaction.
     Now the grid renders immediately, and this only governs the overflow past the
     first two rows. */
  const [showAllUploads, setShowAllUploads] = useState(false);
  // Two rows of the 3-up grid. Enough to see what you have without pushing
  // Suggested off the bottom of the panel.
  const UPLOADS_PREVIEW = 6;
  const uploads = useMemo(() => library.images.filter((i) => i.source === 'upload'), [library.images]);
  const generated = useMemo(() => library.images.filter((i) => i.source === 'generated'), [library.images]);
  const unsplash = useUnsplashSearch(query);
  /* The seed only searches while the box is empty — passing '' parks the hook in
     its idle branch, so typing immediately stops the suggestion request rather
     than racing the one the user actually asked for. */
  const suggestSeed = useContext(PhotoSuggestContext);
  const suggested = useUnsplashSearch(query.trim() ? '' : suggestSeed);
  const curatedFallback = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? STOCK_IMAGES.filter((i) => i.label.toLowerCase().includes(q)) : STOCK_IMAGES;
  }, [query]);

  const pick = (src: string, label: string) => onPick(src, label);

  const pickUnsplash = (r: UnsplashResult) => {
    fetch('/api/unsplash/track-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ downloadLocation: r.downloadLocation }),
    }).catch(() => {});
    pick(r.fullUrl, r.alt);
  };

  // Shared by every draggable grid below — same 'text/insert-media' payload
  // MediaPickerPanel's own "Ready to place" card already writes, so the
  // chapter-body onDrop handler needs no changes to accept a drag from here.
  const dragProps = (src: string) => draggableToPlace ? {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData('text/insert-media', JSON.stringify({ kind: 'image', src }));
      e.dataTransfer.effectAllowed = 'copy';
      onDragTile?.('__media_image__');
    },
    onDragEnd: () => onDragTile?.(null),
  } : {};

  const grid = (items: ImageLibraryEntry[]) => (
    <OptionGrid
      flush
      columns={3}
      value={items.find((s) => s.src === currentSrc)?.label ?? null}
      onChange={(label) => {
        const picked = items.find((s) => s.label === label);
        if (picked) pick(picked.src, picked.label);
      }}
      options={items.map((s) => ({
        id: s.label,
        title: s.label,
        render: <img src={s.src} alt={s.label} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />,
        ...dragProps(s.src),
      }))}
    />
  );

  return (
    <div style={{ padding: '16px 14px 4px' }}>

      <SectionLabel first>Upload a photo</SectionLabel>
      <ImageDropzone
        onPicked={(src, name) => { setUploadError(''); library.add(name, src, 'upload'); pick(src, name); }}
        onError={setUploadError}
      />
      {uploadError && <div style={{ ...ns, fontSize: 11.5, color: '#B91C1C', marginTop: 6, lineHeight: 1.45 }}>{uploadError}</div>}

      <SectionLabel tight>{`Your uploads (${uploads.length})`}</SectionLabel>
      {uploads.length === 0 ? (
        /* An empty state that says what the section is FOR, not that it's empty —
           the "(0)" in the label already carries that, and the old copy
           ("Nothing uploaded yet.") only repeated it. Deliberately unstyled: no
           fill, no border, left-aligned with the rest of the panel's text. An
           empty section is the quietest thing here and shouldn't draw a box
           around itself to say so. */
        /* Pulled up under its own heading. SectionLabel's 9px paddingBottom is
           sized for a grid or a control starting below it; a single line of
           explanatory text belongs to the heading more tightly than that, and at
           the full gap it floated between "Your uploads" and the divider under
           "Stock photos" without clearly belonging to either. */
        <div style={{ ...ns, fontSize: 12, color: SLATE, lineHeight: 1.5, padding: 0, marginTop: -3 }}>
          Photos you upload appear here, ready to reuse on any page.
        </div>
      ) : (
        <>
          <div style={{ paddingTop: 2 }}>
            {grid(showAllUploads ? uploads : uploads.slice(0, UPLOADS_PREVIEW))}
          </div>
          {uploads.length > UPLOADS_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAllUploads((v) => !v)}
              className="cursor-pointer"
              style={{ ...ns, fontSize: 12, fontWeight: 600, color: BLUE, background: 'none', border: 'none', padding: '8px 0 0', cursor: 'pointer' }}
            >
              {showAllUploads ? 'Show fewer' : `Show all ${uploads.length}`}
            </button>
          )}
        </>
      )}

      {/* Names the SOURCE, not one of the two states. "Suggested for this book" was
          true on arrival and false the moment you typed a query — the heading would
          have been lying exactly while the section was most in use. "Search Unsplash"
          fails the other way: it repeats this section's own input placeholder
          verbatim, the same duplication "Upload"/"My uploads" had. "Stock photos"
          holds in both states and pairs with "Your photos" above it. */}
      <SectionLabel divider>Stock photos</SectionLabel>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search Unsplash…"
        style={{ ...ns, width: '100%', fontSize: 13, padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, marginBottom: 8 }}
      />
      {!query.trim() ? (
        /* Real suggestions, seeded from what this book is actually about. Falls
           back to the bundled library whenever there is nothing to go on (a book
           with no subjects or title yet) or the request fails — an unconfigured
           Unsplash key has to degrade to a usable grid, never a dead section. */
        suggested.status === 'ok' && suggested.results.length > 0 ? (
          <OptionGrid
            flush
            columns={3}
            value={suggested.results.find((r) => r.fullUrl === currentSrc)?.id ?? null}
            onChange={(id) => { const r = suggested.results.find((x) => x.id === id); if (r) pickUnsplash(r); }}
            options={suggested.results.slice(0, SUGGESTED_LIMIT).map((r) => ({
              id: r.id,
              title: `Photo by ${r.credit.name} on Unsplash`,
              render: <img src={r.thumbUrl} alt={r.alt} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />,
            }))}
          />
        ) : suggested.status === 'loading' ? (
          <div style={{ ...ns, fontSize: 12, color: SLATE, padding: '6px 0 4px' }}>Finding photos for this book…</div>
        ) : (
          grid(STOCK_IMAGES.slice(0, SUGGESTED_LIMIT))
        )
      ) : unsplash.status === 'loading' ? (
        <div style={{ ...ns, fontSize: 12, color: SLATE, padding: '6px 0 4px' }}>Searching…</div>
      ) : unsplash.status === 'ok' ? (
        unsplash.results.length === 0
          ? <div style={{ ...ns, fontSize: 12, color: SLATE, padding: '6px 0 4px' }}>No images match “{query}”.</div>
          : (
            <OptionGrid
              flush
              columns={3}
              value={unsplash.results.find((r) => r.fullUrl === currentSrc)?.id ?? null}
              onChange={(id) => { const r = unsplash.results.find((x) => x.id === id); if (r) pickUnsplash(r); }}
              options={unsplash.results.map((r) => ({
                id: r.id,
                title: `Photo by ${r.credit.name} on Unsplash`,
                render: <img src={r.thumbUrl} alt={r.alt} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />,
                // Unsplash's full-res URL, not the thumbnail, so a dragged-in
                // photo matches what clicking it would have picked — and the
                // same download-tracking ping pickUnsplash fires on click,
                // since Unsplash's API terms require it on every use, not
                // only the click path.
                ...(draggableToPlace ? {
                  draggable: true,
                  onDragStart: (e: React.DragEvent) => {
                    fetch('/api/unsplash/track-download', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ downloadLocation: r.downloadLocation }),
                    }).catch(() => {});
                    e.dataTransfer.setData('text/insert-media', JSON.stringify({ kind: 'image', src: r.fullUrl }));
                    e.dataTransfer.effectAllowed = 'copy';
                    onDragTile?.('__media_image__');
                  },
                  onDragEnd: () => onDragTile?.(null),
                } : {}),
              }))}
            />
          )
      ) : (
        <>
          <div style={{ ...ns, fontSize: 11.5, color: SLATE, padding: '2px 0 8px', lineHeight: 1.4 }}>Live search unavailable — showing curated picks.</div>
          {curatedFallback.length === 0
            ? <div style={{ ...ns, fontSize: 12, color: SLATE, padding: '6px 0 4px' }}>No images match “{query}”.</div>
            : grid(curatedFallback)}
        </>
      )}

      <SectionLabel divider>{`Wordgenie AI (${generated.length})`}</SectionLabel>
      <GenerateImagePanel currentPlan={currentPlan} onGenerated={onPick} />
      {/* The images you've made, under the thing that makes them — the same
          action-then-result shape as "Upload a photo" › "Your uploads". The
          heading counted these from the start but nothing ever rendered them, so
          "Wordgenie AI (2)" claimed two images you had no way to see or reuse
          once you'd navigated away; a generated image was single-use despite
          having cost credits. */}
      {generated.length > 0 && <div style={{ paddingTop: 12 }}>{grid(generated)}</div>}
      <div style={{ paddingBottom: 16 }} />
    </div>
  );
}

/* Choosing a brand-new video/audio source before it exists in the book — the
   embed equivalent of PhotoSourcePanel above, except there's no library/generate
   step, just the one URL field EmbedInspector already uses to edit an embed
   after the fact (same hint copy, so the two never contradict each other). */
function MediaUrlPicker({ kind, onPick }: { kind: 'video' | 'audio'; onPick: (src: string, label: string) => void }) {
  const [url, setUrl] = useState('');
  return (
    <div style={{ padding: '16px 14px 4px' }}>
      <PanelHeading first>{kind === 'video' ? 'Video' : 'Audio'}</PanelHeading>
      <FieldInput
        label="Source URL"
        value={url}
        onChange={setUrl}
        placeholder={kind === 'audio' ? 'https://…/track.mp3' : 'https://www.youtube.com/embed/…'}
        hint={kind === 'video'
          ? 'Use the embed link (YouTube/Vimeo "Share → Embed"), not the regular watch page URL.'
          : 'A direct link to an audio file.'}
      />
      <div style={{ marginTop: 10 }}>
        <FullButton
          label="Use this link"
          disabled={!url.trim()}
          onClick={() => { const v = url.trim(); if (v) onPick(v, kind === 'video' ? 'Video' : 'Audio'); }}
        />
      </div>
    </div>
  );
}

/* Where an Image/Video/Audio tile in the Media tab sends you instead of dropping
   a placeholder straight into the chapter: choose a real source first (photo
   library/generate/upload, or a video/audio URL), then the picked result shows up
   below as one card you either drag onto a page — same "drag it to place it
   exactly" idiom as every other Insert tile — or click to drop at the cursor.
   Nothing lands in the book until this card exists. */
function MediaPickerPanel({ currentPlan, picker, onPick, onDragTile, onPlaceAtCursor, onBack }: {
  currentPlan: string;
  picker: { kind: MediaPickerKind; picked: { src: string; label: string } | null };
  onPick: (src: string, label: string) => void;
  onDragTile: (id: string | null) => void;
  onPlaceAtCursor: () => void;
  onBack: () => void;
}) {
  const kindLabel = picker.kind === 'image' ? 'photo' : picker.kind;
  return (
    <div>
      <div style={{ padding: '16px 14px 0' }}>
        <PanelBackRow label="Elements" onBack={onBack} />
      </div>
      {picker.kind === 'image'
        ? <PhotoSourcePanel currentPlan={currentPlan} currentSrc={picker.picked?.src ?? ''} onPick={onPick} draggableToPlace onDragTile={onDragTile} />
        : <MediaUrlPicker kind={picker.kind} onPick={onPick} />}
      {picker.picked && (
        <div style={{ padding: '4px 14px 16px' }}>
          <PanelHeading first>Ready to place</PanelHeading>
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/insert-media', JSON.stringify({ kind: picker.kind, src: picker.picked!.src }));
              e.dataTransfer.effectAllowed = 'copy';
              onDragTile(`__media_${picker.kind}__`);
            }}
            onDragEnd={() => onDragTile(null)}
            onClick={onPlaceAtCursor}
            title={`Drag this ${kindLabel} onto a page, or click to insert it at the cursor`}
            className="cursor-grab hover:shadow-[0px_4px_12px_rgba(15,23,51,0.12)] transition-shadow duration-150"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: `1px solid ${BORDER}`, borderRadius: RADIUS_LG, background: '#fff', boxShadow: CARD_SHADOW }}
          >
            {picker.kind === 'image' ? (
              <img src={picker.picked.src} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: 6, background: '#F7F8FA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon d={picker.kind === 'video' ? ICONS.video : ICONS.audio} size={18} />
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{picker.picked.label}</div>
              <div style={{ ...ns, fontSize: 11, color: SLATE }}>Drag into the book, or click to insert</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between cursor-pointer"
      style={{ width: '100%', ...ns, fontSize: 12.5, fontWeight: 600, color: INK, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, padding: '9px 10px' }}
    >
      {label}
      <span style={{ position: 'relative', width: 30, height: 17, borderRadius: RADIUS_PILL, background: checked ? BLUE : '#D7DCE3', transition: 'background .12s ease', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 2, left: checked ? 15 : 2, width: 13, height: 13, borderRadius: '50%', background: '#fff', transition: 'left .12s ease' }} />
      </span>
    </button>
  );
}

function FullButton({ label, onClick, tone = 'default', disabled = false }: { label: string; onClick: () => void; tone?: 'default' | 'active'; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center transition-shadow duration-150${disabled ? '' : ' cursor-pointer'}${tone === 'active' || disabled ? '' : ' hover:shadow-[0px_4px_12px_rgba(15,23,51,0.12)]'}`}
      style={{
        ...ns, width: '100%', height: 34, borderRadius: RADIUS_SM, gap: 6, fontSize: 13, fontWeight: 600,
        border: tone === 'active' ? `1.5px solid ${BLUE}` : `1px solid ${BORDER}`,
        background: tone === 'active' ? '#EEF3FF' : '#fff', color: tone === 'active' ? BLUE : INK,
        boxShadow: tone === 'active' ? 'none' : CARD_SHADOW,
        opacity: disabled ? 0.55 : 1, cursor: disabled ? 'default' : undefined,
      }}
    >
      {label}
    </button>
  );
}

/* Replaces an Inspector's normal fields when its object is locked — full
   freeze (see FloatingObjectBar) means every field here would be a dead
   end anyway, so showing them disabled is just clutter with no real choice
   behind it. One place to unlock, right where someone came looking to edit. */
function LockedInspectorNotice({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '28px 8px' }}>
      <div className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: '50%', background: '#F4F6F9', margin: '0 auto 12px' }}>
        <LockIcon />
      </div>
      <div style={{ ...ns, fontSize: 12.5, color: SLATE, lineHeight: 1.5, marginBottom: 14 }}>
        This element is locked. Unlock it to change its position or properties.
      </div>
      <FullButton label="Unlock" onClick={onUnlock} />
    </div>
  );
}

/* Writing a node attribute from a *text* field must not chain .focus(). focus()
   pulls DOM focus off the input and back onto the canvas, so only the first
   keystroke reaches the field — every one after it lands in the document, and
   because these blocks are atoms held by a NodeSelection, the second character
   replaces the node outright. Typing a caption deleted the image it described,
   and typing alt text deleted the image it was describing for. The panel never
   touches the editor's own selection, so updateAttributes still resolves the
   right node with no focus at all. Click-driven controls keep .focus(), where
   handing focus back to the canvas is the whole point. */
function setNodeAttrs(editor: Editor, name: string, patch: Record<string, unknown>) {
  editor.chain().updateAttributes(name, patch).run();
}

function FieldInput({ label, value, onChange, placeholder, hint, required, multiline }: {
  label?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string; required?: boolean; multiline?: boolean;
}) {
  const invalid = required && !value.trim();
  const style: React.CSSProperties = {
    ...ns, width: '100%', fontSize: 13, padding: '8px 10px',
    // A group whose heading already names the field passes no label; the gap it
    // left would otherwise still be reserved above an empty line.
    border: invalid ? '1px solid #F0B4AC' : `1px solid ${BORDER}`, borderRadius: RADIUS_MD, marginTop: label ? 5 : 0,
  };
  return (
    <label style={{ ...ns, fontSize: 12, fontWeight: 600, color: INK, display: 'block' }}>
      {label}{label && required && <span style={{ color: '#B91C1C' }}> *</span>}
      {multiline
        ? <textarea rows={3} aria-label={label ? undefined : placeholder} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={{ ...style, resize: 'vertical' }} />
        : <input aria-label={label ? undefined : placeholder} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={style} />}
      {hint && <span style={{ ...ns, display: 'block', fontSize: 11, fontWeight: 400, color: invalid ? '#B91C1C' : SLATE, marginTop: 4 }}>{hint}</span>}
    </label>
  );
}

/* A numeric W/H/X/Y field for cover elements — until now the only way to resize
   or reposition one was dragging its handles on the canvas, with no way to set
   an exact value. Committed on blur/Enter, not on every keystroke, so an
   in-progress "4" while typing "40" doesn't briefly clamp against the element's
   own current width. */
/* Pixels, not percent. These were percentages of the cover canvas, which is how
   they're STORED (resolution-independent, and they survive a page-size change) —
   but it is not a unit anyone positions in. Every design canvas people arrive
   from reports pixels: Figma, Canva, Framer all do. "12.5%" also can't be
   compared against anything else in this product, where page size and margins
   are already stated in inches and the page itself is a concrete 720pt wide.
   Storage stays percent; only the field speaks px — and it shows a bare number,
   the way Figma's own W/H/X/Y do: with four fields in a 2x2 grid, a repeated
   unit suffix says four times over what the labels already imply.

   `mode` puts the auto/fixed switch INSIDE the field rather than in a separate
   control above the grid, which is where Figma UI3 moved it: the choice belongs
   to the dimension it governs, and a row of W/H/X/Y plus a two-button group above
   it spent a whole row saying something one caret can say. */
function DimensionField({ label, px, dim, onChangePct, mode, onMode }: {
  label: string;
  /* Current value as a percentage of `dim`; the field converts for display. */
  px: number;
  dim: number;
  onChangePct: (pct: number) => void;
  mode?: 'auto' | 'fixed';
  onMode?: (m: 'auto' | 'fixed') => void;
}) {
  const auto = mode === 'auto';
  const toPx = (pct: number) => Math.round((pct / 100) * dim);
  const [draft, setDraft] = useState(String(toPx(px)));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setDraft(String(toPx(px))); }, [px, dim]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const commit = () => {
    const n = parseFloat(draft);
    if (!Number.isNaN(n) && dim > 0) onChangePct((n / dim) * 100);
    else setDraft(String(toPx(px)));
  };
  return (
    <div
      ref={ref}
      className="relative flex items-center"
      style={{ gap: 6, border: `1px solid ${BORDER}`, borderRadius: RADIUS_SM, padding: '6px 8px', background: auto ? '#F7F8FA' : '#fff' }}
    >
      {/* Lighter than the value it names — weight, not colour. SLATE at 600
         reads as secondary while staying ~6.5:1 on white; the obvious lighter
         greys (#8596AD and friends) drop under 3.5:1, which is the mistake
         EYEBROW_COLOR was already corrected for once in this file. */}
      <span style={{ ...ns, fontSize: 11, fontWeight: 600, color: SLATE, flexShrink: 0 }}>{label}</span>
      {auto ? (
        // Never a stored number the canvas is ignoring — that is what got this
        // field deleted for text in the first place.
        <span style={{ ...ns, width: '100%', fontSize: 13, textAlign: 'left', color: SLATE }}>Auto</span>
      ) : (
        <>
          <input
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            /* Left-aligned, so the number sits beside the letter that names it.
               Right-alignment pushed it to the far edge of the field, leaving a
               gap between "W" and its own value wide enough that the pairing
               stopped being obvious across a 2x2 grid. */
            style={{ ...ns, width: '100%', fontSize: 13, border: 'none', outline: 'none', textAlign: 'left', color: INK, background: 'transparent' }}
          />
        </>
      )}
      {mode && onMode && (
        <button
          type="button"
          aria-label={`${label} sizing`}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-center cursor-pointer"
          style={{ width: 14, height: 14, padding: 0, border: 'none', background: 'none', flexShrink: 0 }}
        >
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke={SLATE} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      {open && mode && onMode && (
        <div className="absolute flex flex-col" style={{ top: 'calc(100% + 4px)', right: 0, minWidth: 128, zIndex: 40, padding: 4, background: '#fff', borderRadius: RADIUS_MD, border: `1px solid ${PANEL_BORDER}`, boxShadow: MENU_SHADOW }}>
          {([['auto', 'Auto height'], ['fixed', 'Fixed']] as const).map(([id, lbl]) => (
            <button
              key={id}
              onClick={() => { onMode(id); setOpen(false); }}
              className="flex items-center justify-between text-left cursor-pointer"
              style={{ gap: 10, ...ns, fontSize: 12.5, padding: '6px 8px', borderRadius: RADIUS_SM, border: 'none', whiteSpace: 'nowrap',
                background: mode === id ? '#EEF3FF' : 'none', color: mode === id ? BLUE : INK }}
            >
              <span>{lbl}</span>
              <span style={{ width: 10, flexShrink: 0, textAlign: 'right' }}>{mode === id ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Image inspector ─────────────────────────────────────────────────────────── */
/* Growing the column count has to grow the grid's contents too — changing 2 to 3
   used to leave the third column simply absent, which read as a broken grid
   rather than one waiting for a photo. Empty cells are real image nodes with no
   src, styled as "+ Add photo" drop targets. Shrinking removes trailing EMPTY
   cells only: never a photo, since silently deleting someone's picture to fit a
   column count is not a trade the control implies. */
function setGridColumns(editor: Editor, cols: number) {
  const { state } = editor.view;
  const sel = state.selection;
  const gridNode = sel instanceof NodeSelection && sel.node.type.name === 'imageGridBlock' ? sel.node : null;
  if (!gridNode) {
    editor.chain().focus().updateAttributes('imageGridBlock', { cols }).run();
    return;
  }
  const gridPos = sel.from;
  const children: PMNode[] = [];
  gridNode.forEach((child) => children.push(child));
  const isEmptyCell = (n: PMNode) => n.type.name === 'image' && !n.attrs.src;

  const next = [...children];
  while (next.length > cols && isEmptyCell(next[next.length - 1])) next.pop();
  const imageType = state.schema.nodes.image;
  while (next.length < cols && imageType) next.push(imageType.create({ src: '', alt: '' }));

  const tr = state.tr
    .replaceWith(gridPos + 1, gridPos + 1 + gridNode.content.size, next)
    .setNodeMarkup(gridPos, undefined, { ...gridNode.attrs, cols });
  // Keep the grid selected so the panel doesn't jump away mid-adjustment.
  tr.setSelection(NodeSelection.create(tr.doc, gridPos));
  editor.view.dispatch(tr);
  editor.view.focus();
}

/* The photo grid as an object in its own right — reached by the first click on
   any cell, with the cell itself one click deeper. Holds what applies to the
   whole grid; per-photo styling stays on the photo. */
function ImageGridInspector({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes('imageGridBlock') as {
    cols: number; locked: boolean; boxW: number; boxH: number; lockAspect: boolean; fit: string;
  };
  const gridLock = attrs.lockAspect !== false;
  const setGridSize = (which: 'w' | 'h', v: number) =>
    editor.chain().focus().updateAttributes('imageGridBlock', which === 'w' ? { boxW: v } : { boxH: v }).run();
  if (attrs.locked) {
    return (
      <InspectorShell>
        <LockedInspectorNotice onUnlock={() => editor.chain().focus().updateAttributes('imageGridBlock', { locked: false }).run()} />
      </InspectorShell>
    );
  }
  return (
    <InspectorShell>
      <InspectorSection label="Photos fill their cell by">
        <SelectField
          value={(attrs.fit ?? 'cover') as 'cover' | 'contain'}
          onChange={(v) => editor.chain().focus().updateAttributes('imageGridBlock', { fit: v }).run()}
          options={[
            { id: 'cover' as const, label: 'Fill — trim to the cell' },
            { id: 'contain' as const, label: 'Fit — show all of each photo' },
          ]}
        />
      </InspectorSection>

      <InspectorSection label="Columns" hint="Click a photo again to style it on its own.">
        <OptionGrid
          columns={3}
          value={String(attrs.cols ?? 2)}
          onChange={(v) => setGridColumns(editor, Number(v))}
          options={[2, 3, 4].map((n) => ({ id: String(n), label: `${n}` }))}
        />
      </InspectorSection>

      {/* Same controls the photo itself gets, one level up — W, H and a
          proportions lock, acting on the block rather than on any one cell. A
          slider was the wrong instrument here: it gives no readable number and
          nothing else in this panel sizes by dragging a track. */}
      <InspectorSection label="Size">
        <div className="flex items-center" style={{ gap: 6 }}>
          <NumField icon={<span style={{ ...ns, fontSize: 10.5, fontWeight: 700 }}>W</span>} title="Width"
            value={attrs.boxW || 0} min={0} max={4000} onChange={(v) => setGridSize('w', v)} />
          <Tooltip label={gridLock ? 'Proportions locked' : 'Proportions unlocked'} position="bottom">
            <button
              onClick={() => editor.chain().focus().updateAttributes('imageGridBlock', { lockAspect: !gridLock }).run()}
              className="flex items-center justify-center cursor-pointer flex-shrink-0"
              style={{ width: 28, height: 28, borderRadius: RADIUS_SM, border: 'none',
                background: gridLock ? '#EEF3FF' : '#F4F6F9', color: gridLock ? BLUE : SLATE }}
              aria-label={gridLock ? 'Unlock proportions' : 'Lock proportions'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                {gridLock
                  ? <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>
                  : <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></>}
              </svg>
            </button>
          </Tooltip>
          <NumField icon={<span style={{ ...ns, fontSize: 10.5, fontWeight: 700 }}>H</span>} title="Height"
            value={attrs.boxH || 0} min={0} max={4000} onChange={(v) => setGridSize('h', v)} />
        </div>
        {(attrs.boxW || attrs.boxH) ? (
          <button
            onClick={() => editor.chain().focus().updateAttributes('imageGridBlock', { boxW: 0, boxH: 0 }).run()}
            className="cursor-pointer"
            style={{ ...ns, fontSize: 11.5, fontWeight: 600, color: BLUE, background: 'none', border: 'none', padding: '6px 0 0' }}
          >
            Reset to column width
          </button>
        ) : null}
      </InspectorSection>

      <InspectorSection label="Photos fill their cell by">
        <SelectField
          value={(attrs.fit ?? 'cover') as 'cover' | 'contain'}
          onChange={(v) => editor.chain().focus().updateAttributes('imageGridBlock', { fit: v }).run()}
          options={[
            { id: 'cover' as const, label: 'Fill — trim to fit' },
            { id: 'contain' as const, label: 'Fit — show all of it' },
          ]}
        />
      </InspectorSection>
    </InspectorShell>
  );
}

function ImageInspector({ editor, onGoToMedia, onStartCrop, onTransform }: { editor: Editor; onGoToMedia: () => void; onStartCrop: () => void; onTransform: (op: TransformOp) => void }) {
  // ImageNodeAttrs itself, not a second copy of its field list — the copy that
  // used to sit here had to be edited in step with the node every time one of
  // them grew an attribute, and stroke style is the edit it would have missed.
  const attrs = editor.getAttributes('image') as ImageNodeAttrs;
  const [alt, setAlt] = useState(attrs.alt ?? '');
  const library = useContext(ImageLibraryContext);
  const [hoverPreview, setHoverPreview] = useState(false);
  const shadowSpec = parseShadow(attrs.shadow ?? '');
  const corners = parseRadius(attrs.radius ?? '');
  const [perCorner, setPerCorner] = useState(() => new Set(parseRadius(attrs.radius ?? '')).size > 1);
  const setCorners = (c: number[]) => editor.chain().focus().updateAttributes('image', { radius: serializeRadius(c) }).run();
  const rotation = parseCrop((attrs as { crop: string }).crop ?? '').rotate;
  /* W/H showed 0 when unset, which read as "no size" rather than "auto". Figma
     always shows the object's real dimensions, so these are measured off the
     rendered node — offsetWidth/Height rather than getBoundingClientRect, since
     the canvas carries a zoom transform that would scale a rect but not these.
     Syncing from a DOM node React doesn't own is exactly what an effect is for. */
  const [measured, setMeasured] = useState<{ w: number; h: number; ratio: number } | null>(null);
  const sizeKey = `${attrs.src}|${attrs.boxW}|${attrs.boxH}|${attrs.crop}|${attrs.wrap}`;
  useEffect(() => {
    const el = document.querySelector('.ProseMirror figure.ProseMirror-selectednode img') as HTMLImageElement | null;
    if (!el) return;
    const read = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const ratio = el.naturalWidth && el.naturalHeight ? el.naturalWidth / el.naturalHeight : (w && h ? w / h : 1);
      if (w && h) setMeasured({ w: Math.round(w), h: Math.round(h), ratio });
    };
    if (el.complete) read(); else el.addEventListener('load', read, { once: true });
    return () => el.removeEventListener('load', read);
  }, [sizeKey]);

  const shownW = attrs.boxW || measured?.w || 0;
  const shownH = attrs.boxH || measured?.h || 0;
  const ratio = measured?.ratio || (shownW && shownH ? shownW / shownH : 1);
  const lockAspect = attrs.lockAspect !== false;
  const isFixed = (attrs.sizeMode ?? 'column') === 'fixed';
  const setSize = (which: 'w' | 'h', v: number) => {
    // Setting a dimension IS the act of leaving "fits the column" — the mode is
    // a consequence, never a question put to the user.
    const next: Record<string, number | string> = { sizeMode: 'fixed', ...(which === 'w' ? { boxW: v } : { boxH: v }) };
    if (lockAspect && v > 0 && ratio > 0) {
      if (which === 'w') next.boxH = Math.round(v / ratio);
      else next.boxW = Math.round(v * ratio);
    }
    editor.chain().focus().updateAttributes('image', next).run();
  };
  const setShadow = (sh: ShadowSpec) => editor.chain().focus().updateAttributes('image', { shadow: serializeShadow(sh) }).run();
  const [uploadError, setUploadError] = useState('');
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  // An image inside an image-grid container has no clickable gap around it to
  // select the grid itself (every pixel is either an image or the tight 12px
  // gutter, which falls through to plain text) — so grid-level controls surface
  // here, on the image people actually click, instead of a separate unreachable
  // inspector state.
  const inGrid = editor.isActive('imageGridBlock');
  const gridAttrs = inGrid ? (editor.getAttributes('imageGridBlock') as { cols: number; locked: boolean }) : null;
  // Locking always targets the grid as a whole when inside one (matching the
  // delete special-case elsewhere), never the individual photo — so the grid's
  // own lock flag is the one that governs here, not the image's.
  const locked = inGrid ? !!gridAttrs?.locked : !!attrs.locked;
  if (locked) {
    return (
      <InspectorShell>
        <LockedInspectorNotice onUnlock={() => editor.chain().focus().updateAttributes(inGrid ? 'imageGridBlock' : 'image', { locked: false }).run()} />
      </InspectorShell>
    );
  }
  return (
    // No context/breadcrumb — the preview right below already shows unambiguously
    // that an image is selected, so "Chapter title › Image" was reading as
    // caption clutter rather than information. Kind alone becomes the eyebrow.
    <InspectorShell>
      {/* Sourcing itself lives in the left Media tab (see PhotoSourcePanel) —
          this is just a quick path back to it, for the moment someone looks at
          a static preview and reasonably wonders how to change it, without
          duplicating the full generate/search/library picker here. */}
      <div
        className="relative"
        style={{ marginBottom: 16, borderRadius: RADIUS_MD, overflow: 'hidden' }}
        onMouseEnter={() => setHoverPreview(true)}
        onMouseLeave={() => setHoverPreview(false)}
      >
        <img src={attrs.src} alt="" style={{ width: '100%', display: 'block', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD }} />
        {hoverPreview && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(15,23,51,0.55)', gap: 8 }}
          >
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const result = await readImageFile(file);
                if ('error' in result) { setUploadError(result.error); return; }
                setUploadError('');
                library.add(result.label, result.src);
                editor.chain().focus().updateAttributes('image', { src: result.src }).run();
              }}
            />
            <button
              onClick={() => uploadInputRef.current?.click()}
              className="cursor-pointer"
              style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: INK, background: '#fff', border: 'none', borderRadius: RADIUS_SM, padding: '7px 12px' }}
            >
              Upload
            </button>
            <button
              onClick={onGoToMedia}
              className="cursor-pointer"
              style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: RADIUS_SM, padding: '7px 12px' }}
            >
              Change
            </button>
          </div>
        )}
      </div>
      {uploadError && <div style={{ ...ns, fontSize: 11.5, color: '#B91C1C', marginTop: -10, marginBottom: 12, lineHeight: 1.45 }}>{uploadError}</div>}

      {/* Persistent rather than tucked into the thumbnail's hover overlay: that
          overlay is a *sourcing* shortcut (Upload / Change), and cropping isn't
          sourcing. Klaviyo — the closest analogue to this panel — likewise shows
          Crop as a standing button under the thumbnail. */}
      <div style={{ marginBottom: 16 }}>
        <FullButton label={attrs.crop ? 'Edit crop' : 'Crop image'} onClick={onStartCrop} />
      </div>

      {/* Grid-level controls used to be smuggled in here, because a cell was the
          only thing you could select. The grid is now selectable in its own right
          (first click selects it, second the cell), so they live in
          ImageGridInspector. Stepping back up is the header's job — an inline
          back-link here sat directly under the header's own back arrow, two
          identical glyphs one above the other meaning different things (close the
          panel vs. go up a level). */}
      <PanelGroup label="Accessibility" first>
        {/* An empty alt used to count as a missing alt, so an image carrying no
            meaning had no way to pass the check — and a 4-up grid, whose cells
            ship with alt="", added four blocking failures on the spot. Marking an
            image decorative writes alt="" plus role="presentation", which is the
            correct treatment for one and clears the check honestly. */}
        <ToggleRow
          label="Decorative image"
          checked={!!attrs.decorative}
          onChange={(v) => {
            editor.chain().focus().updateAttributes('image', { decorative: v, ...(v ? { alt: '' } : {}) }).run();
            if (v) setAlt('');
          }}
        />
        {attrs.decorative ? (
          <div style={{ ...ns, fontSize: 11.5, color: SLATE, lineHeight: 1.5, marginTop: 8 }}>
            Screen readers will skip this image. Use it only where the picture adds nothing the text doesn’t already say.
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            {/* No asterisk: nothing in the editor blocks on this, and there is a
                legitimate alternative one toggle away, so a hard-required marker
                would be a lie. The pre-publish check is the honest enforcement
                point. The hint names the actual stake — WCAG 1.1.1 (level A) via
                EPUB Accessibility 1.1 is what the EU Accessibility Act requires of
                ebooks sold in the EU since June 2025. */}
            <FieldInput
              label="Alt text"
              multiline
              value={alt}
              placeholder="Describe this image for screen readers"
              hint={alt ? undefined : 'Needed for EU ebook sales — or mark it decorative above.'}
              onChange={(v) => { setAlt(v); setNodeAttrs(editor, 'image', { alt: v }); }}
            />
          </div>
        )}
      </PanelGroup>

      <PanelGroup label="Layout">
        <FieldLabel>Text wrap</FieldLabel>
        <div style={{ marginBottom: 14 }}>
          <OptionGrid
            value={attrs.wrap}
            onChange={(wrap) => editor.chain().focus().updateAttributes('image', { wrap }).run()}
            options={[
              { id: 'inline' as WrapValue, label: 'Inline', icon: ICONS.wrapInline },
              { id: 'left' as WrapValue, label: 'Wrap left', icon: ICONS.wrapLeft },
              { id: 'right' as WrapValue, label: 'Wrap right', icon: ICONS.wrapRight },
              { id: 'full-bleed' as WrapValue, label: 'Full-bleed', icon: ICONS.wrapFull },
            ]}
          />
        </div>

        {/* Size is two states, not five controls. Figma's own W field carries
            exactly this dropdown — Fixed width vs Fill container — and the same
            question applies here with the text column as the container: either
            the photo runs to the margins, or you give it a size and resize it
            freely. Nothing is disabled, because the fields only exist in the
            state where they mean something.

            There is deliberately no Fill/Fit (object-fit) choice for a single
            photo: with proportions locked the box always takes the photo's own
            shape, so there is no mismatch to resolve. Unlock and set a clashing
            height and it trims — a rare, deliberate act that doesn't warrant a
            permanent control. In a GRID the cell shape is fixed and the question
            is real, so it lives on the grid, where it also belongs: you want all
            cells treated alike. */}
        {!inGrid && (
          <>
            <FieldLabel>Size</FieldLabel>
            <SelectField
              value={isFixed ? 'fixed' : 'column'}
              onChange={(v) => editor.chain().focus().updateAttributes('image', v === 'fixed'
                ? { sizeMode: 'fixed', boxW: shownW, boxH: shownH }
                : { sizeMode: 'column', boxW: 0, boxH: 0 }).run()}
              options={[
                { id: 'column' as const, label: 'Fill column' },
                { id: 'fixed' as const, label: 'Fixed size' },
              ]}
            />
            {isFixed && (
              <div className="flex items-center" style={{ gap: 6, marginTop: 8 }}>
                <NumField icon={<span style={{ ...ns, fontSize: 10.5, fontWeight: 700 }}>W</span>} title="Width"
                  value={shownW} min={1} max={4000} onChange={(v) => setSize('w', v)} />
                <Tooltip label={lockAspect ? 'Proportions locked' : 'Proportions unlocked'} position="bottom">
                  <button
                    onClick={() => editor.chain().focus().updateAttributes('image', { lockAspect: !lockAspect }).run()}
                    className="flex items-center justify-center cursor-pointer flex-shrink-0"
                    style={{ width: 28, height: 28, borderRadius: RADIUS_SM, border: 'none',
                      background: lockAspect ? '#EEF3FF' : '#F4F6F9', color: lockAspect ? BLUE : SLATE }}
                    aria-label={lockAspect ? 'Unlock proportions' : 'Lock proportions'}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      {lockAspect
                        ? <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>
                        : <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></>}
                    </svg>
                  </button>
                </Tooltip>
                <NumField icon={<span style={{ ...ns, fontSize: 10.5, fontWeight: 700 }}>H</span>} title="Height"
                  value={shownH} min={1} max={4000} onChange={(v) => setSize('h', v)} />
              </div>
            )}
          </>
        )}
      </PanelGroup>

      <PanelGroup label="Transform">
        <FieldLabel>Rotation</FieldLabel>
        <div className="flex items-center" style={{ gap: 6 }}>
          <NumField
            icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4v16h16" /></svg>}
            value={rotation} min={-360} max={360} suffix="°" title="Rotation" width={86}
            onChange={(v) => onTransform({ kind: 'rotate-to', deg: v })}
          />
          {([
            { id: 'rot90', title: 'Rotate 90°', d: 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5' },
            { id: 'fliph', title: 'Flip horizontal', d: 'M12 3v18M7 8L3 12l4 4M17 8l4 4-4 4' },
            { id: 'flipv', title: 'Flip vertical', d: 'M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4' },
          ] as const).map((btn) => (
            <Tooltip key={btn.id} label={btn.title} position="bottom">
              <button
                onClick={() => onTransform(
                  btn.id === 'rot90' ? { kind: 'rotate-by', deg: 90 }
                  : btn.id === 'fliph' ? { kind: 'flip', axis: 'h' }
                  : { kind: 'flip', axis: 'v' },
                )}
                className="flex items-center justify-center cursor-pointer"
                style={{ width: 32, height: 28, borderRadius: RADIUS_SM, border: 'none', background: '#F4F6F9', color: SLATE }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={btn.d} /></svg>
              </button>
            </Tooltip>
          ))}
        </div>
      </PanelGroup>

      <PanelGroup label="Appearance">
        {/* items-end, not a marginTop guess: the button used to be nudged down 17px
            to clear the field labels, which left its 28px box 5px shorter than the
            33px inputs beside it and its bottom edge floating above theirs. */}
        <div className="flex items-end" style={{ gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <FieldLabel>Opacity</FieldLabel>
            <NumField value={Math.round((attrs.opacity ?? 1) * 100)} min={0} max={100} suffix="%"
              onChange={(v) => editor.chain().focus().updateAttributes('image', { opacity: v / 100 }).run()} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <FieldLabel>Corner radius</FieldLabel>
            <NumField value={corners[0]} min={0} max={200} onChange={(v) => setCorners([v, v, v, v])} />
          </div>
          <Tooltip label="Independent corners" position="bottom">
            <button
              onClick={() => setPerCorner((v) => !v)}
              className="flex items-center justify-center cursor-pointer flex-shrink-0"
              style={{ width: 33, height: 33, borderRadius: RADIUS_SM, border: 'none', background: perCorner ? '#EEF3FF' : '#F4F6F9', color: perCorner ? BLUE : SLATE }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
            </button>
          </Tooltip>
        </div>
        {perCorner && (
          <div className="flex items-center" style={{ gap: 6, marginTop: 8 }}>
            {(['Top left', 'Top right', 'Bottom right', 'Bottom left'] as const).map((title, i) => (
              <NumField key={title} title={title} value={corners[i]} min={0} max={200}
                onChange={(v) => { const next = [...corners]; next[i] = v; setCorners(next); }} />
            ))}
          </div>
        )}
      </PanelGroup>

      <AddableSection
          label="Stroke"
          active={(attrs.borderWidth ?? 0) > 0}
          onAdd={() => editor.chain().focus().updateAttributes('image', { borderWidth: 1, borderColor: attrs.borderColor || '#000000' }).run()}
          onRemove={() => editor.chain().focus().updateAttributes('image', { borderWidth: 0 }).run()}
        >
          <StrokeFields
            color={attrs.borderColor || '#000000'}
            onColor={(c) => editor.chain().focus().updateAttributes('image', { borderColor: c }).run()}
            sides={attrs.borderSides}
            onSides={(v) => editor.chain().focus().updateAttributes('image', { borderSides: v }).run()}
            style={attrs.borderStyle}
            onStyle={(v) => editor.chain().focus().updateAttributes('image', { borderStyle: v }).run()}
            position={attrs.borderPos}
            onPosition={(v) => editor.chain().focus().updateAttributes('image', { borderPos: v }).run()}
            width={attrs.borderWidth ?? 0}
            onWidth={(v) => editor.chain().focus().updateAttributes('image', { borderWidth: v }).run()}
          />
      </AddableSection>

      {/* Figma lists the effect as a row and opens its fields in a popover; at
          264px a popover would land half off the edge, so the same fields, in
          the same order, expand inline. */}
      <AddableSection
          label="Effects"
          active={!!shadowSpec}
          onAdd={() => setShadow({ ...DEFAULT_SHADOW })}
          onRemove={() => editor.chain().focus().updateAttributes('image', { shadow: '' }).run()}
        >
          {shadowSpec && (
            <>
              <div style={{ ...ns, fontSize: 12, fontWeight: 600, color: INK, marginBottom: 8 }}>Drop shadow</div>
              <div className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
                <span style={{ ...ns, fontSize: 11, color: SLATE, width: 50, flexShrink: 0 }}>Position</span>
                <NumField icon={<span style={{ ...ns, fontSize: 10.5, fontWeight: 700 }}>X</span>} value={shadowSpec.x} min={-200} max={200} onChange={(v) => setShadow({ ...shadowSpec, x: v })} />
                <NumField icon={<span style={{ ...ns, fontSize: 10.5, fontWeight: 700 }}>Y</span>} value={shadowSpec.y} min={-200} max={200} onChange={(v) => setShadow({ ...shadowSpec, y: v })} />
              </div>
              <div className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
                <span style={{ ...ns, fontSize: 11, color: SLATE, width: 50, flexShrink: 0 }}>Blur</span>
                <NumField value={shadowSpec.blur} min={0} max={200} onChange={(v) => setShadow({ ...shadowSpec, blur: v })} />
              </div>
              <div className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
                <span style={{ ...ns, fontSize: 11, color: SLATE, width: 50, flexShrink: 0 }}>Spread</span>
                <NumField value={shadowSpec.spread} min={-200} max={200} onChange={(v) => setShadow({ ...shadowSpec, spread: v })} />
              </div>
              {/* Opacity keeps the labelled row; the swatches get their own line
                  under it. A swatch row is seven 24px circles — it can't share a
                  264px row with a 50px label and a number field the way the hex
                  box it replaced could. */}
              <div className="flex items-center" style={{ gap: 6, marginBottom: 8 }}>
                <span style={{ ...ns, fontSize: 11, color: SLATE, width: 50, flexShrink: 0 }}>Opacity</span>
                <NumField value={Math.round(shadowSpec.opacity * 100)} min={0} max={100} suffix="%"
                  onChange={(v) => setShadow({ ...shadowSpec, opacity: v / 100 })} />
              </div>
              <FieldLabel>Colour</FieldLabel>
              <SwatchRow value={shadowSpec.color} onChange={(c) => setShadow({ ...shadowSpec, color: c })} />
            </>
          )}
      </AddableSection>

      {/* Spacing of its own now that the group above it can be collapsed: a
          closed Effects section ends at its title, and the note ran straight on
          from it as if it were that section's body. */}
      <div style={{ ...ns, fontSize: 11.5, color: SLATE, lineHeight: 1.5, marginTop: 16 }}>
        This image is a block in the flowing text, not an object placed on top of it — surrounding paragraphs reflow around it automatically.
      </div>
    </InspectorShell>
  );
}

/* One font list for the whole editor. It was FONT_OPTIONS — four families,
   named for the cover — yet chapter text and page numbers already pulled from it
   too, so the name was the only thing that was cover-specific. Every family here
   is really loaded in app/layout.tsx; adding one means adding it there as well,
   or the picker offers a face that silently falls back to Georgia.
   `group` only orders the list — it is not a second choice to make. */
type FontOption = { id: string; label: string; group: 'Serif' | 'Sans serif' | 'Display' | 'Monospace' };
/* The named text-style presets as a picker, shared by cover text and chapter
   prose so the two panels can't drift apart again. They were cover-only, which
   was never a decision: the same seven presets have always existed for chapter
   text too (TEXT_STYLES / the `.book-textstyle--*` rules), they were just
   insert-only — you could drop a new "Marquee" paragraph in, but never turn the
   paragraph you'd already written into one.

   It goes LAST in a text panel, under Font/Size/Colour, in both panels. The
   coarse-before-fine argument (a preset overwrites every field above it, so
   surely it should come first) loses to frequency: changing a font or a colour
   is the everyday edit and a preset is the occasional one, and leading with
   seven full-width cards pushed the everyday controls off the top of the panel.
   Keep the two in the same place in both panels whatever the order — a control
   that moves between two panels showing the same kind of object is worse than
   either position.

   `onClear` is what "no preset" means, and only prose has one — a chapter
   paragraph can fall back to the theme's body text, while a cover element always
   carries explicit type properties with nothing underneath to fall back to. */
function TextStylePresetGrid({ value, onChange, onClear }: {
  value: string | null;
  onChange: (id: string) => void;
  onClear?: () => void;
}) {
  return (
    <OptionGrid
      /* One per row, matching the left rail's own TextStyleCards. A specimen is
         only doing its job at something near the preset's real size, and a
         half-panel tile (~100px of usable width) forced the cap down to 11.5px
         to stop Syne-800 "Statement" truncating — at which point every card was
         shrunk to accommodate one. Full width lets each render at 17px, which
         is large enough to read the face, the weight and the case. */
      columns={1}
      value={value ?? (onClear ? 'none' : null)}
      onChange={(id) => (id === 'none' ? onClear?.() : onChange(id))}
      options={[
        /* "None", not "Body text". Every other tile in this grid names a preset,
           so a tile reading "Body text" claimed to be an eighth one — when what
           it does is remove the preset and let the paragraph fall back to the
           theme. The fallback's name belongs in the tooltip, not on the tile. */
        ...(onClear ? [{
          id: 'none',
          title: 'No preset — the theme’s body text',
          render: <span style={{ ...ns, fontSize: 13, color: SLATE }}>None</span>,
        }] : []),
        ...TEXT_STYLES.map((st) => ({
          id: st.id,
          title: st.name,
          render: (
            <span style={{ fontFamily: st.fontFamily, fontSize: Math.min(st.fontSize, 17), color: st.color, fontWeight: st.fontWeight, fontStyle: st.fontStyle, letterSpacing: st.letterSpacing, textTransform: st.textTransform, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {st.name}
            </span>
          ),
        })),
      ]}
    />
  );
}

/* Chapter prose stores a preset as the paragraph's class (see ParagraphClass) —
   the same class the insert tiles write, so a dragged-in preset and a picked one
   are the same paragraph afterwards. */
const TEXT_STYLE_CLASS_PREFIX = 'book-textstyle--';
function presetIdFromClass(cls: string | null | undefined): string | null {
  if (!cls) return null;
  const hit = cls.split(/\s+/).find((c) => c.startsWith(TEXT_STYLE_CLASS_PREFIX));
  return hit ? hit.slice(TEXT_STYLE_CLASS_PREFIX.length) : null;
}
/* Preserves any other class the paragraph carries (book-author-name and
   book-display-text are both plain paragraphs wearing one) rather than
   overwriting the attribute wholesale. */
function classWithPreset(cls: string | null | undefined, presetId: string | null): string | null {
  const kept = (cls ?? '').split(/\s+/).filter((c) => c && !c.startsWith(TEXT_STYLE_CLASS_PREFIX));
  if (presetId) kept.push(`${TEXT_STYLE_CLASS_PREFIX}${presetId}`);
  return kept.length ? kept.join(' ') : null;
}

const FONT_OPTIONS: FontOption[] = [
  { id: 'Georgia, serif', label: 'Georgia', group: 'Serif' },
  { id: "'Fraunces', Georgia, serif", label: 'Fraunces', group: 'Serif' },
  { id: "'Newsreader', Georgia, serif", label: 'Newsreader', group: 'Serif' },
  { id: "'EB Garamond', Georgia, serif", label: 'EB Garamond', group: 'Serif' },
  { id: "'Lora', Georgia, serif", label: 'Lora', group: 'Serif' },
  { id: "'Libre Baskerville', Georgia, serif", label: 'Libre Baskerville', group: 'Serif' },
  { id: "'Merriweather', Georgia, serif", label: 'Merriweather', group: 'Serif' },
  { id: "'Playfair Display', Georgia, serif", label: 'Playfair Display', group: 'Serif' },
  { id: "'Nunito Sans', sans-serif", label: 'Nunito Sans', group: 'Sans serif' },
  { id: "'Source Sans 3', sans-serif", label: 'Source Sans', group: 'Sans serif' },
  { id: "'Inter', sans-serif", label: 'Inter', group: 'Sans serif' },
  { id: "'Manrope', sans-serif", label: 'Manrope', group: 'Sans serif' },
  { id: "'Montserrat', sans-serif", label: 'Montserrat', group: 'Sans serif' },
  { id: "'Poppins', sans-serif", label: 'Poppins', group: 'Sans serif' },
  { id: "'Syne', sans-serif", label: 'Syne', group: 'Display' },
  { id: "'Anton', sans-serif", label: 'Anton', group: 'Display' },
  { id: "'Bebas Neue', sans-serif", label: 'Bebas Neue', group: 'Display' },
  { id: "'Parisienne', cursive", label: 'Parisienne', group: 'Display' },
  { id: "'Courier Prime', monospace", label: 'Courier Prime', group: 'Monospace' },
];

/* Each entry rendered in its own face, which is the whole point of a font list.
   `id` happens to be a valid font-family here, but StyledDropdown no longer
   assumes that — it styles what it's told to style. */
function fontDropdownOptions(extra?: DropdownOption): DropdownOption[] {
  const rest = FONT_OPTIONS.map((o) => ({ ...o, style: { fontFamily: o.id } }));
  return extra ? [extra, ...rest] : rest;
}

const FONT_SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96];

/* Matches PresentationEditorView's own FontDropdown — same button shape, chevron
   and list treatment — since a raw <select> reads as a different, lower-fidelity
   control sitting next to everything else custom-drawn in this inspector.
   `options` should include a leading { id: '', label: … } entry wherever an
   unset/theme-default state is meaningful.

   It's a combobox, not a plain list: at four families you scanned, at nineteen you
   already know the name and want to type it. So the trigger turns into the search
   field on open — type to filter, ↑/↓ to walk the results, Enter to take the
   highlighted one — while still being a list you can just point at, which is the
   "both type and choose" the picker was missing. Typing never *sets* a family on
   its own; a free-typed string that matches nothing isn't a font, it's a typo, and
   committing it would silently fall the text back to Georgia. */
type DropdownOption = { id: string; label: string; group?: string; style?: React.CSSProperties };

function StyledDropdown({ value, options, onChange, searchable = false }: {
  value: string;
  options: DropdownOption[];
  onChange: (v: string) => void;
  /* Off by default. A search field over four options is a field you have to
     dismiss to see a list you could already read; it earns its place at the
     nineteen the font list carries. */
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const current = options.find((o) => o.id === value) ?? options[0];

  // Matches anywhere in the name, not just the start — people type "sans" or
  // "garamond" far more often than they type a family's first letters.
  const q = query.trim().toLowerCase();
  const matches = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || (o.group ?? '').toLowerCase().includes(q))
    : options;

  // Group headers only when nothing is typed. Mid-search they'd fragment three
  // results across three headed sections, which is more chrome than list.
  const rows: ({ kind: 'group'; label: string } | { kind: 'option'; option: typeof options[number]; index: number })[] = [];
  let seen = '';
  matches.forEach((o, i) => {
    if (!q && o.group && o.group !== seen) { seen = o.group; rows.push({ kind: 'group', label: o.group }); }
    rows.push({ kind: 'option', option: o, index: i });
  });

  const openList = () => {
    setQuery('');
    setCursor(Math.max(0, options.findIndex((o) => o.id === value)));
    setOpen(true);
    if (searchable) requestAnimationFrame(() => inputRef.current?.select());
  };

  const commit = (id: string) => { onChange(id); setOpen(false); setQuery(''); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!matches.length) return;
      const next = e.key === 'ArrowDown'
        ? Math.min(matches.length - 1, cursor + 1)
        : Math.max(0, cursor - 1);
      setCursor(next);
      listRef.current?.querySelector(`[data-idx="${next}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches[cursor]) commit(matches[cursor].id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      {open && searchable ? (
        <div
          className="w-full flex items-center"
          style={{ height: 32, padding: '0 8px 0 10px', borderRadius: 7, border: `1.5px solid ${BLUE}`, background: '#fff' }}
        >
          <input
            ref={inputRef}
            autoFocus
            value={query}
            placeholder={current?.label ?? 'Search fonts'}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={onKeyDown}
            style={{ ...ns, flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: INK, border: 'none', outline: 'none', background: 'transparent' }}
          />
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
        </div>
      ) : (
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); if (open) setOpen(false); else openList(); }}
          onKeyDown={open ? onKeyDown : undefined}
          className="w-full flex items-center justify-between cursor-pointer"
          style={{ height: 32, padding: '0 10px', borderRadius: 7, border: `${open ? 1.5 : 1}px solid ${open ? BLUE : BORDER}`, background: '#fff', ...ns, fontSize: 13, fontWeight: 500, color: INK }}
        >
          <span style={{ ...current?.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current?.label}</span>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0, marginLeft: 6 }}><path d="M1 1l4 4 4-4" stroke={SLATE} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 bg-white"
          style={{ top: 'calc(100% + 4px)', left: 0, right: 0, borderRadius: 10, border: `1.5px solid ${BORDER}`, boxShadow: '0px 8px 24px rgba(15,23,51,0.14)', overflowY: 'auto', maxHeight: 264, padding: 4 }}
        >
          {rows.length === 0 && (
            <div style={{ ...ns, fontSize: 12.5, color: SLATE, padding: '10px 8px' }}>No font matches “{query.trim()}”.</div>
          )}
          {rows.map((r) => r.kind === 'group' ? (
            <div key={`g-${r.label}`} style={{ ...ns, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: EYEBROW_COLOR, padding: '8px 8px 4px' }}>{r.label}</div>
          ) : (
            <button
              key={r.option.id}
              data-idx={r.index}
              type="button"
              onMouseEnter={() => setCursor(r.index)}
              onMouseDown={(e) => { e.preventDefault(); commit(r.option.id); }}
              className="w-full flex items-center justify-between cursor-pointer"
              style={{
                height: 32, padding: '0 8px', borderRadius: RADIUS_SM, border: 'none',
                // Two states, two channels: blue text is "this is the one you have",
                // the tinted row is "this is what Enter would take" — so keyboard
                // walking never looks like it already changed the font.
                background: r.index === cursor ? '#EEF3FF' : 'none',
                ...ns, fontSize: 13, fontWeight: 500, textAlign: 'left',
                ...r.option.style,
                // After the option's own styling, so a specimen can never
                // repaint the blue that says "this is the one you have".
                color: r.option.id === value ? BLUE : INK,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.option.label}</span>
              {r.option.id === value && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: 6 }}><path d="M20 6L9 17l-5-5" /></svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Matches FontDropdown's sibling in the presentation editor — one bordered
   capsule (not three separate boxes for −/number/+), with the number itself
   a real editable field and a preset list on focus. */
function FontSizeStepper({ value, onChange, min, max }: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(String(Math.round(value)));
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setRaw(String(Math.round(value))); }, [value]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const commit = (text: string) => {
    const n = parseInt(text, 10);
    if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
    else setRaw(String(Math.round(value)));
    setOpen(false);
  };

  const stepBtnStyle: React.CSSProperties = {
    width: 28, height: '100%', border: 'none', background: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    color: SLATE, fontSize: 16, fontWeight: 400, lineHeight: 1,
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 32, borderRadius: 7, border: `1px solid ${BORDER}`, background: '#fff', flexShrink: 0 }}>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); onChange(Math.max(min, value - 1)); }} className="cursor-pointer" style={stepBtnStyle}>−</button>
      <input
        ref={inputRef}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onFocus={() => { setOpen(true); inputRef.current?.select(); }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { commit(raw); inputRef.current?.blur(); }
          if (e.key === 'Escape') { setRaw(String(Math.round(value))); setOpen(false); inputRef.current?.blur(); }
        }}
        style={{ width: 30, border: 'none', outline: 'none', background: 'transparent', ...ns, fontSize: 13, fontWeight: 600, color: INK, textAlign: 'center' }}
      />
      <button type="button" onMouseDown={(e) => { e.preventDefault(); onChange(Math.min(max, value + 1)); }} className="cursor-pointer" style={stepBtnStyle}>+</button>
      {open && (
        <div className="absolute bg-white" style={{ top: 'calc(100% + 4px)', left: '50%', transform: 'translateX(-50%)', width: 72, borderRadius: 9, border: `1.5px solid ${BORDER}`, boxShadow: '0px 8px 24px rgba(15,23,51,0.14)', zIndex: 50, maxHeight: 220, overflowY: 'auto' }}>
          {FONT_SIZE_PRESETS.filter((p) => p >= min && p <= max).map((p) => (
            <button
              key={p}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(p); setOpen(false); }}
              className="w-full flex items-center cursor-pointer"
              style={{ height: 30, padding: '0 14px', border: 'none', background: p === Math.round(value) ? '#EEF3FF' : 'none', ...ns, fontSize: 13, fontWeight: p === Math.round(value) ? 600 : 400, color: p === Math.round(value) ? BLUE : INK, textAlign: 'left' }}
              onMouseEnter={(e) => { if (p !== Math.round(value)) e.currentTarget.style.background = '#F7F8FA'; }}
              onMouseLeave={(e) => { if (p !== Math.round(value)) e.currentTarget.style.background = 'none'; }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* The info box's own properties, under the text properties that already apply
   to its contents (font, size, marks, alignment, text colour all reach it,
   because a callout's children are ordinary prose — see the note on
   activeObjectKind). What was missing was the box itself: the three presets
   were the only colours it could ever be.

   Presets AND a free colour, not one or the other. The presets carry meaning a
   colour can't — Note/Tip/Warning is a decision about what the box is FOR, and
   most people want the one that already looks right — while the colour row is
   for the book whose palette none of the three fit. Picking a preset clears the
   custom colour and vice versa, the same relationship the text-style presets
   have with the font and colour fields under them. */
function InfoBoxFields({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes('callout') as { calloutType?: CalloutType; accentColor?: string | null };
  const custom = attrs.accentColor ?? null;
  const update = (patch: Record<string, unknown>) => editor.chain().focus().updateAttributes('callout', patch).run();
  return (
    <>
      <FieldLabel>Preset</FieldLabel>
      <PillRow
        items={CALLOUT_TYPES.map((c) => ({
          key: c.id,
          label: c.label,
          // A preset pill is only "on" when no custom colour is overriding it —
          // otherwise Warning would stay lit on a box that is visibly green.
          active: !custom && (attrs.calloutType ?? 'note') === c.id,
          onClick: () => update({ calloutType: c.id, accentColor: null }),
        }))}
      />
      <div style={{ marginTop: 10 }}>
        <FieldLabel>Colour</FieldLabel>
        <SwatchRow
          /* The three preset accents lead, so the row reads as "the presets,
             plus anything else" rather than as a second, unrelated palette.
             The rest are the accents a book is most likely to want that the
             presets don't cover. */
          value={custom ?? ''}
          onChange={(c) => update({ accentColor: c })}
        />
      </div>
      {custom && (
        <div style={{ marginTop: 8 }}>
          <FullButton label="Back to preset colours" onClick={() => update({ accentColor: null })} />
        </div>
      )}
      <div style={{ ...ns, fontSize: 11.5, color: SLATE, lineHeight: 1.5, marginTop: 8 }}>
        The fill and border are mixed from this one colour.
      </div>
    </>
  );
}

/* Text inspector — the prose formatting set, composed from the same widgets as
   every other inspector. */
/* `variant` trims the panel for text that isn't free prose. In a footnote,
   Style would let you turn a note into a Subheading or a Quote — meaningless in
   a notes list and invisible in most readers — and List is worse than
   meaningless: the notes section IS an ordered list, so the "no list" pill
   would dismantle it from the inside. Everything else (font, size, marks,
   alignment, colour, highlight) applies to a note exactly as it does to prose. */
function TextInspector({ editor, variant = 'prose' }: { editor: Editor; variant?: 'prose' | 'note' }) {
  const currentStyle = editor.isActive('heading', { level: 3 }) ? 'h3'
    : editor.isActive('heading', { level: 4 }) ? 'h4'
    : editor.isActive('blockquote') ? 'quote'
    : 'p';
  const currentAlign = (['left', 'center', 'right', 'justify'] as const).find((a) => editor.isActive({ textAlign: a })) ?? 'left';
  const textStyleAttrs = editor.getAttributes('textStyle') as { color?: string; fontFamily?: string; fontSize?: string };
  const textColor = textStyleAttrs.color;
  const highlightColor = (editor.getAttributes('highlight') as { color?: string }).color;
  // Unset reads as the chapter's own body font at its default size — 15.5px is
  // .book-chapter-prose's own hardcoded default (see ChapterEditor's injected
  // CSS), not a theme property, so there's no per-theme value to fall back to.
  const currentFontSize = textStyleAttrs.fontSize ? parseFloat(textStyleAttrs.fontSize) : 15.5;
  /* Format and Link used to hide while a range was selected, on the grounds
     that TextSelectionBubbleMenu was showing the same controls. That held while
     this lived in a tab you opened deliberately; now that Properties opens ON a
     text selection, hiding them meant the panel got emptier the more you had
     selected — you'd select a word to bold it and watch Bold disappear. The
     bubble is the shortcut, this is the full set, and the overlap is the point. */

  const paragraphClass = editor.getAttributes('paragraph').class as string | undefined;
  const activePreset = presetIdFromClass(paragraphClass);
  const setPreset = (id: string | null) =>
    editor.chain().focus().updateAttributes('paragraph', { class: classWithPreset(paragraphClass, id) }).run();

  /* Inside an info box the panel has two subjects, not one — the text and the
     box around it — so it splits into two named groups rather than running as
     one flat list of eyebrows where "Info box" is just another peer of "Font".
     Everywhere else there's only the text, and a lone "Text" header over the
     whole panel would be a heading with nothing to distinguish itself from. */
  const inInfoBox = variant === 'prose' && editor.isActive('callout');

  const textSections = (
    <>
      <InspectorSection label="Font">
        <div className="flex items-center" style={{ gap: 8 }}>
          <StyledDropdown
            value={textStyleAttrs.fontFamily ?? ''}
            options={fontDropdownOptions({ id: '', label: 'Theme default' })}
            searchable
            onChange={(v) => {
              if (v) editor.chain().focus().setFontFamily(v).run();
              else editor.chain().focus().unsetFontFamily().run();
            }}
          />
          <FontSizeStepper
            value={currentFontSize}
            min={8}
            max={48}
            onChange={(n) => editor.chain().focus().setFontSize(`${n}px`).run()}
          />
        </div>
      </InspectorSection>

      {/* No Style inside an info box. Heading, Subheading and Quote are all ways
          of saying "this line matters more than the ones around it", and the box
          is already saying that — a Quote nested in a callout is two emphasis
          treatments fighting over the same sentence. Same argument that keeps
          Style out of a footnote. */}
      {/* A dropdown, not a 2x2 of cards. This is the one control in the panel
          where every editor that has it has landed on the same answer: Google
          Docs' toolbar styles menu ("Normal text", Heading 1…), Word's styles
          gallery, Notion's Turn into, and — in this editor's own peer group —
          Atticus, whose subheadings are applied from a toolbar dropdown. The
          cards cost two rows and ~90px to show four mutually exclusive words,
          and read as four things you might want rather than one value a
          paragraph already has. Each entry is rendered in its own weight and
          size, which is what Docs and Word both do and what the Font dropdown
          right above it already does with faces. */}
      {variant === 'prose' && !inInfoBox && (
      <InspectorSection label="Style">
        <StyledDropdown
          value={currentStyle}
          onChange={(id) => {
            if (id === 'p') editor.chain().focus().setParagraph().run();
            else if (id === 'h3') editor.chain().focus().toggleHeading({ level: 3 }).run();
            else if (id === 'h4') editor.chain().focus().toggleHeading({ level: 4 }).run();
            else editor.chain().focus().toggleBlockquote().run();
          }}
          /* Largest first, which is both the document hierarchy and the order
             the Text tiles already sit in — the list led with Paragraph only
             because that's the default value, and a list shouldn't be ordered
             by which entry happens to be selected. */
          options={[
            { id: 'h3', label: 'Heading', style: { fontSize: 15, fontWeight: 700 } },
            { id: 'h4', label: 'Subheading', style: { fontSize: 13.5, fontWeight: 700 } },
            { id: 'p', label: 'Paragraph' },
            // Italic and indented, the two things the canvas actually does to a
            // quote now that the coloured rule is gone.
            { id: 'quote', label: 'Quote', style: { fontStyle: 'italic', paddingLeft: 10 } },
          ]}
        />
      </InspectorSection>
      )}

      <InspectorSection label="Format">
        <PillRow
          items={[
            { key: 'b', label: 'B', active: editor.isActive('bold'), onClick: () => editor.chain().focus().toggleBold().run(), style: { fontWeight: 800 } },
            { key: 'i', label: 'I', active: editor.isActive('italic'), onClick: () => editor.chain().focus().toggleItalic().run(), style: { fontStyle: 'italic' } },
            { key: 'u', label: 'U', active: editor.isActive('underline'), onClick: () => editor.chain().focus().toggleUnderline().run(), style: { textDecoration: 'underline' } },
            { key: 's', label: 'S', active: editor.isActive('strike'), onClick: () => editor.chain().focus().toggleStrike().run(), style: { textDecoration: 'line-through' } },
          ]}
        />
      </InspectorSection>

      <InspectorSection label="Alignment">
        <PillRow
          items={(['left', 'center', 'right', 'justify'] as const).map((a) => ({
            key: a,
            label: <Icon d={ICONS[a === 'left' ? 'alignLeft' : a === 'center' ? 'alignCenter' : a === 'right' ? 'alignRight' : 'alignJustify']} size={15} />,
            active: currentAlign === a,
            onClick: () => editor.chain().focus().setTextAlign(a).run(),
          }))}
        />
      </InspectorSection>

      <InspectorSection label="Color">
        <SwatchRow
          /* Purple went when the row was cut to six: it's the least likely
             accent in book prose, and red and orange already cover "warm
             accent" between them. */
          value={textColor ?? '#15191F'}
          onChange={(c) => editor.chain().focus().setColor(c).run()}
        />
      </InspectorSection>

      {/* No Text background either: a highlight is a tint behind the words, and
          in here it lands on top of the box's own tint. That was merely muddy
          when the box was one of three fixed blues/greens/ambers; now that its
          colour is anything you like, the two can clash outright. */}
      {!inInfoBox && (
      <InspectorSection label="Text background">
        <SwatchRow
          tone="highlight"
          value={highlightColor ?? ''}
          onChange={(c) => editor.chain().focus().setHighlight({ color: c }).run()}
        />
        {editor.isActive('highlight') && (
          <div style={{ marginTop: 8 }}>
            <FullButton label="Remove highlight" onClick={() => editor.chain().focus().unsetHighlight().run()} />
          </div>
        )}
      </InspectorSection>
      )}

      {/* Icons, not words — a pill is 74px wide here, so "•⁠ Bulleted" wrapped
          onto a second line and spilled out of a 34px-tall button, while the
          bare words showed no bullets or numbers at all. Drawn glyphs show the
          thing itself and match the Alignment row directly above, which is
          icon-only for the same reason. Tooltips carry the names.

          "None" is an explicit third option rather than "neither pill lit":
          correct as "nothing's active", but indistinguishable from an
          unanswered row. */}
      {/* Only while the caret is actually inside one. Callout stays out of
          activeObjectKind on purpose — its contents are prose, so the caret has to
          keep reaching this inspector — which means there's no object panel to put
          a type switcher in, and without one the three tiles would be a one-way
          door: pick Warning by mistake and your only move is delete and re-insert. */}

      {variant === 'prose' && (
      <InspectorSection label="List">
        <PillRow
          items={([
            {
              key: 'none',
              icon: ICONS.paragraph,
              title: 'No list',
              active: !editor.isActive('bulletList') && !editor.isActive('orderedList'),
              onClick: () => {
                if (editor.isActive('bulletList')) editor.chain().focus().toggleBulletList().run();
                else if (editor.isActive('orderedList')) editor.chain().focus().toggleOrderedList().run();
              },
            },
            { key: 'ul', icon: ICONS.list, title: 'Bulleted list', active: editor.isActive('bulletList'), onClick: () => editor.chain().focus().toggleBulletList().run() },
            { key: 'ol', icon: ICONS.listNumbered, title: 'Numbered list', active: editor.isActive('orderedList'), onClick: () => editor.chain().focus().toggleOrderedList().run() },
          ] as const).map((i) => ({
            key: i.key,
            label: <Tooltip label={i.title} position="top"><Icon d={i.icon} size={15} /></Tooltip>,
            active: i.active,
            onClick: i.onClick,
          }))}
        />
      </InspectorSection>
      )}

      {/* Paragraphs only, and not inside an info box. A preset is a whole-paragraph
          display look — Marquee, Rosewood — and the box is already the thing
          making this passage stand out; the two compete, the same way Style and
          Text background do in here. On a heading or a quote a preset would
          fight the style that node already has, and the Style row above is the
          control for those. Last among the text sections, matching the cover's
          own (see TextStylePresetGrid). */}
      {variant === 'prose' && !inInfoBox && currentStyle === 'p' && (
        <InspectorSection label="Style preset">
          <TextStylePresetGrid value={activePreset} onChange={setPreset} onClear={() => setPreset(null)} />
        </InspectorSection>
      )}

      {/* No Link section. The floating bar's link button opens the same field
          over the selection, and unlike everything else in this panel it isn't
          a property of the text — it's an action on it. */}
    </>
  );

  return (
    <InspectorShell>
      {inInfoBox ? (
        <>
          {/* Info box first. The caret may be in the text, but the object you
              selected is the box, and every other inspector in this editor leads
              with the selected object's own properties before the generic ones
              (Image opens on Text wrap, not on Accessibility). It's also the
              shorter of the two and the one more likely to be why you opened
              the panel — the preset is the decision you make once per box,
              where the text controls are the same seven you get on any
              paragraph. PanelGroup/FieldLabel rather than more eyebrows: the
              panel already has a two-level label language (see PanelGroup), and
              this is the case it's for. */}
          <PanelGroup label="Info box" first><InfoBoxFields editor={editor} /></PanelGroup>
          <PanelGroup label="Text">{textSections}</PanelGroup>
        </>
      ) : textSections}
    </InspectorShell>
  );
}

/* Book-relevant merge tokens — matches the bracketed-placeholder convention seen in
   other publishing tools (e.g. "[Year]"), styled via the highlight mark so they read
   as a distinct field rather than literal text the author typed. Resolved by
   resolveFieldTokens above at export and in Preview; the editor deliberately keeps
   showing the token, the way Word shows «Title» while you write. */
/* The amber highlight the insert applies is the field's "I am not literal text"
   badge. Once a token holds a real value it must stop wearing it, or an exported
   book ships a highlighted title. */
const FIELD_HIGHLIGHT = '#FEF3C7';
interface FieldValues { author: string; bookTitle: string; chapterTitle: string; chapterNumber: number | null }

/* Resolution happens here, at the two points chapter HTML stops being editable —
   the exporter and the read-only PreviewPage — exactly like applyFootnoteNumbering
   does with marker numbers, and for the same reason: the live document keeps the
   token (so it stays a field you can move and delete), and everything downstream
   of editing sees the value.
   Done over a parsed DOM rather than with a regex because the token is wrapped in
   marks — `<mark data-color=…><strong>[Book title]</strong></mark>` — so a regex
   that swapped the text would leave the value sitting inside the field's own
   highlight, and matching the wrapper itself means guessing the order TipTap
   serialised the marks in. */
function resolveFieldTokens(html: string, v: FieldValues): string {
  if (!html.includes('[') || typeof DOMParser === 'undefined') return html;
  const values: Record<string, string> = {
    'Author name': v.author,
    'Book title': v.bookTitle,
    Year: String(new Date().getFullYear()),
    'Chapter title': v.chapterTitle,
    'Chapter number': v.chapterNumber == null ? '' : String(v.chapterNumber),
  };
  const doc = new DOMParser().parseFromString(`<div id="tok">${html}</div>`, 'text/html');
  const root = doc.getElementById('tok');
  if (!root) return html;
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  let changed = false;
  for (const t of texts) {
    // An empty value leaves the token alone rather than blanking the line — an
    // unset publisher should read as "still to fill in", not vanish.
    const next = t.data.replace(/\[(Author name|Book title|Year|Chapter title|Chapter number)\]/g,
      (whole, key: string) => values[key] || whole);
    if (next !== t.data) { t.data = next; changed = true; }
  }
  if (!changed) return html;
  root.querySelectorAll('mark').forEach((m) => {
    const paint = `${m.getAttribute('data-color') ?? ''}${m.getAttribute('style') ?? ''}`.toLowerCase();
    if (!paint.includes('fef3c7')) return;
    // Still holding an unresolved token — it's genuinely still a field.
    if (m.textContent?.includes('[')) return;
    // Replaced wholesale, not unwrapped: the bold inside was part of the badge too.
    m.replaceWith(doc.createTextNode(m.textContent ?? ''));
  });
  return root.innerHTML;
}

const DYNAMIC_FIELDS: { id: string; label: string; token: string }[] = [
  { id: 'author-name', label: 'Author name', token: '[Author name]' },
  { id: 'book-title', label: 'Book title', token: '[Book title]' },
  { id: 'year', label: 'Year', token: '[Year]' },
  { id: 'chapter-title', label: 'Chapter title', token: '[Chapter title]' },
  { id: 'chapter-number', label: 'Chapter number', token: '[Chapter number]' },
];

/* The quotes lead, because they're what a manuscript needs most and what the grid
   conspicuously lacked — French guillemets were here and English quotes weren't.
   SmartTypography above now produces these while you type; the grid is for the
   cases it can't infer (a quote opening after a dash, a closing quote that ought
   to be an apostrophe) and for the glyphs no input rule should ever guess at. */
const SPECIAL_CHARACTERS: { char: string; name: string }[] = [
  { char: '\u201C', name: 'Left double quote' },
  { char: '\u201D', name: 'Right double quote' },
  { char: '\u2018', name: 'Left single quote' },
  { char: '\u2019', name: 'Right single quote / apostrophe' },
  { char: '—', name: 'Em dash' },
  { char: '–', name: 'En dash' },
  { char: '…', name: 'Ellipsis' },
  { char: '•', name: 'Bullet' },
  { char: '†', name: 'Dagger' },
  { char: '‡', name: 'Double dagger' },
  { char: '§', name: 'Section' },
  { char: '¶', name: 'Pilcrow' },
  { char: '©', name: 'Copyright' },
  { char: '®', name: 'Registered' },
  { char: '™', name: 'Trademark' },
  { char: '°', name: 'Degree' },
  { char: '×', name: 'Multiplication' },
  { char: '±', name: 'Plus-minus' },
  { char: '½', name: 'One half' },
  { char: '¼', name: 'One quarter' },
  { char: '¾', name: 'Three quarters' },
  { char: '«', name: 'Left guillemet' },
  { char: '»', name: 'Right guillemet' },
  { char: '¿', name: 'Inverted question' },
];

/* Insert-at-cursor tools for chapter text — moved out of the Text properties
   inspector since they insert new content rather than style what's selected,
   putting them with the rest of the left rail's insert tools instead. Needs
   an active chapter editor to insert into; with none focused yet, the grids
   go inert with a one-line hint rather than silently doing nothing on click. */
function TextToolsPanel({ editor }: { editor: Editor | null }) {
  return (
    <div>
      {/* No invented parent over these two. "Insert at cursor" named the
          mechanism rather than the content — and it didn't even separate anything,
          since the tiles above insert at the cursor too. The two also have nothing
          to do with each other: one is book metadata, one is glyphs. All that
          bound them was going inert without a caret, which is an implementation
          detail, not a category. They're peers of Text and Text styles now, and
          the rule and spacing between sections carry the separation on their own.
          The inert line appears once, on the first of the two — the second one's
          dead buttons say it again without the panel repeating itself. */}
      <PanelSectionBreak label="Dynamic fields" />
      <div style={{ marginTop: 12 }}>
        <OptionGrid
          value={null}
          onChange={(id) => {
            if (!editor) return;
            const field = DYNAMIC_FIELDS.find((f) => f.id === id);
            if (!field) return;
            editor.chain().focus().insertContent([
              { type: 'text', text: field.token, marks: [{ type: 'highlight', attrs: { color: '#FEF3C7' } }, { type: 'bold' }] },
              { type: 'text', text: ' ' },
            ]).run();
          }}
          options={DYNAMIC_FIELDS.map((f) => ({ id: f.id, label: f.label }))}
        />
      </div>

      <PanelSectionBreak label="Special characters" />
      <div style={{ marginTop: 12 }}>
        {/* Five across, not six, and the glyph rendered rather than labelled.
            As a `label` it came through at OptionGrid's caption size — 12px —
            which is fine for the word "Paragraph" under an icon but is the
            wrong size for the thing itself when the glyph IS the button, and
            several of these (the quotes, the dagger, the fractions) are small
            marks to begin with. The wider cell buys the room to set them at
            17px, where a left and a right quote are actually distinguishable
            from each other. */}
        <OptionGrid
          columns={5}
          value={null}
          onChange={(char) => editor?.chain().focus().insertContent(char).run()}
          options={SPECIAL_CHARACTERS.map((c) => ({
            id: c.char,
            title: c.name,
            render: <span style={{ ...ns, fontSize: 17, lineHeight: 1, color: INK }}>{c.char}</span>,
          }))}
        />
      </div>
    </div>
  );
}

/* Footnote inspector. A marker has no properties of its own — its number is
   derived from document order and its text lives in the note — so this is
   navigation and removal, which is all there is to say about one. */
function FootnoteInspector({ editor }: { editor: Editor }) {
  const fid = (editor.getAttributes('footnoteRef') as { id?: string }).id ?? null;
  return (
    <InspectorShell>
      <div style={{ ...ns, fontSize: 12.5, color: SLATE, lineHeight: 1.5, marginBottom: 14 }}>
        The note sits at the foot of the page this marker lands on, and moves with it. Numbers
        follow the order the markers appear in, so moving one renumbers the rest.
      </div>
      <FullButton
        label="Go to note"
        disabled={!fid}
        onClick={() => {
          if (!fid) return;
          const at = footnotePos(editor.state.doc, fid);
          if (at != null) editor.chain().focus().setTextSelection(at + 2).scrollIntoView().run();
        }}
      />
      <div style={{ height: 8 }} />
      <FullButton label="Delete footnote" onClick={() => editor.chain().focus().deleteSelection().run()} />
    </InspectorShell>
  );
}

/* Notes section inspector. The section itself is derived — which notes exist,
   what order they're in and whether it exists at all are all set by the markers
   — so there's nothing to configure about the section. But the caret is in
   prose, and note text takes the same marks, colour and alignment as any other
   prose, so the full text inspector follows it here like it does everywhere
   else. The line at the top is the only section-level thing worth saying. */
function FootnotesSectionInspector({ editor }: { editor: Editor }) {
  return (
    <>
      <div style={{ ...ns, fontSize: 12.5, color: SLATE, lineHeight: 1.5, padding: '14px 14px 0' }}>
        Built from the footnote markers in this chapter, in the order they appear. Each note is
        laid out at the foot of the page its marker lands on. Delete a marker to remove its note.
      </div>
      <TextInspector editor={editor} variant="note" />
    </>
  );
}

/* Divider inspector. A rule takes the page's own hairline colour and has nothing
   else to set, so this says what it is and offers its one action — the panel
   opened on the "select something" placeholder before, since Properties opens for
   every selection kind (see isElementSelection) but had no branch for this one. */
/* A labelled number with -/+ either side. Real values, not a preset list: a rule
   is 1px or 3px, and "Medium" doesn't tell you which. Typing is allowed too, so a
   known value doesn't need eleven clicks to reach. */
/* A labelled numeric field: FieldLabel over the platform's NumField, which is how
   the image, cover and page-number panels already lay one out.

   This replaces StepperRow, whose −/+ buttons were the only steppers left in the
   editor — every other number here is a field you type in, arrow-key (shift for
   ×10) and tab through, and the two buttons cost a 26px-tall white control per row
   that matched nothing around it. */
function NumRow({ label, value, min, max, step, suffix, onChange, title }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; suffix?: string; title?: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <FieldLabel>{label}</FieldLabel>
      <NumField value={value} min={min} max={max} step={step} suffix={suffix} title={title ?? label} onChange={onChange} />
    </div>
  );
}

function DividerInspector({ editor }: { editor: Editor }) {
  const a: DividerAttrs = { ...DIVIDER_DEFAULTS, ...(editor.getAttributes('horizontalRule') as Partial<DividerAttrs>) };
  const set = (patch: Partial<DividerAttrs>) => editor.chain().focus().updateAttributes('horizontalRule', patch).run();
  return (
    <InspectorShell>
      {/* Position first: it's the only one of these you can't judge from the rule
          itself once it's narrower than the column. */}
      <InspectorSection label="Position">
        <PillRow
          items={(['left', 'center', 'right'] as const).map((x) => ({
            key: x,
            label: <Icon d={ICONS[x === 'left' ? 'alignLeft' : x === 'center' ? 'alignCenter' : 'alignRight']} size={15} />,
            active: a.align === x,
            onClick: () => set({ align: x }),
          }))}
        />
      </InspectorSection>

      <InspectorSection label="Size">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <NumRow label="Width" value={a.widthPct} onChange={(v) => set({ widthPct: v })} min={5} max={100} step={5} suffix="%" />
          <NumRow label="Thickness" value={a.thickness} onChange={(v) => set({ thickness: v })} min={1} max={16} suffix="px" />
          {/* Only visible above ~3px, so it sits with Thickness rather than in its
              own section — it's a property of a thick rule, not of every rule. */}
          <NumRow label="Corner radius" value={a.radius} onChange={(v) => set({ radius: v })} min={0} max={12} suffix="px" />
        </div>
      </InspectorSection>

      <InspectorSection label="Color">
        <SwatchRow
          value={a.color}
          onChange={(c) => set({ color: c })}
        />
      </InspectorSection>

      <div style={{ height: 6 }} />
      <FullButton label="Delete divider" onClick={() => deleteAtomNode(editor)} />
    </InspectorShell>
  );
}

/* The chapter opener's accent rule. Same properties as a Divider block, minus
   alignment and width-in-percent: this rule is anchored to the top-left of the
   opener with the eyebrow, so a centred or full-width one would read as a broken
   layout rather than a choice. It writes to the page, not to editor attributes,
   because it lives outside the chapter's document — see OpenerRule. */
function OpenerRuleInspector({ rule, onChange }: { rule: OpenerRule; onChange: (patch: Partial<OpenerRule>) => void }) {
  return (
    <InspectorShell>
      <InspectorSection label="Size">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <NumRow label="Width" value={rule.width} onChange={(v) => onChange({ width: v })} min={8} max={420} step={4} suffix="px" />
          <NumRow label="Thickness" value={rule.thickness} onChange={(v) => onChange({ thickness: v })} min={1} max={16} suffix="px" />
        </div>
      </InspectorSection>

      <InspectorSection label="Color">
        <SwatchRow value={rule.color} onChange={(c) => onChange({ color: c })} />
      </InspectorSection>
    </InspectorShell>
  );
}

/* Shape inspector. */
/* W and H with the proportions lock between them — the pattern the photo and the
   photo grid already use, lifted out so a third and fourth copy of the same
   markup don't drift from it. Width-only blocks pass no onH and get a single
   field with no lock, because there is no second dimension to tie it to. */
function SizeFields({ w, h, lockAspect, onW, onH, onToggleLock }: {
  w: number;
  h?: number;
  lockAspect?: boolean;
  onW: (v: number) => void;
  onH?: (v: number) => void;
  onToggleLock?: () => void;
}) {
  const label = (t: string) => <span style={{ ...ns, fontSize: 10.5, fontWeight: 700 }}>{t}</span>;
  if (onH == null) return <NumField icon={label('W')} title="Width" value={w} min={0} max={4000} onChange={onW} />;
  return (
    <div className="flex items-center" style={{ gap: 6 }}>
      <NumField icon={label('W')} title="Width" value={w} min={0} max={4000} onChange={onW} />
      {onToggleLock && (
        <Tooltip label={lockAspect ? 'Proportions locked' : 'Proportions unlocked'} position="bottom">
          <button
            onClick={onToggleLock}
            className="flex items-center justify-center cursor-pointer flex-shrink-0"
            style={{
              width: 28, height: 28, borderRadius: RADIUS_SM, border: 'none',
              background: lockAspect ? '#EEF3FF' : '#F4F6F9', color: lockAspect ? BLUE : SLATE,
            }}
            aria-label={lockAspect ? 'Unlock proportions' : 'Lock proportions'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              {lockAspect
                ? <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>
                : <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></>}
            </svg>
          </button>
        </Tooltip>
      )}
      <NumField icon={label('H')} title="Height" value={h ?? 0} min={0} max={4000} onChange={onH} />
    </div>
  );
}

/* The Properties half of the same pair of numbers the drag handles write. Every
   block object gets this, so "resizable" is a property of being an object here
   rather than something a few nodes happen to support.
   Both fields read 0 as "auto" and show the box's real rendered size instead, so
   the field never displays a number the canvas is ignoring — the same rule the
   cover's DimensionField follows for an auto-height text box. */
function BlockSizeSection({ editor, nodeName }: { editor: Editor; nodeName: string }) {
  const attrs = editor.getAttributes(nodeName) as { boxW?: number; boxH?: number };
  const widthOnly = WIDTH_ONLY_BLOCKS.has(nodeName);
  const dom = selectedBlockDom(editor, '');
  const measured = dom?.getBoundingClientRect();
  const w = Math.round(attrs.boxW || measured?.width || 0);
  const h = Math.round(attrs.boxH || measured?.height || 0);
  const set = (patch: { boxW?: number; boxH?: number }) => editor.chain().focus().updateAttributes(nodeName, patch).run();
  return (
    <InspectorSection label="Size">
      <SizeFields
        w={w}
        h={widthOnly ? undefined : h}
        onW={(v) => set({ boxW: v })}
        onH={widthOnly ? undefined : (v) => set({ boxH: v })}
      />
      {(attrs.boxW || attrs.boxH) ? (
        <button
          onClick={() => set({ boxW: 0, boxH: 0 })}
          className="cursor-pointer"
          style={{ ...ns, fontSize: 11.5, fontWeight: 600, color: BLUE, background: 'none', border: 'none', padding: '6px 0 0' }}
        >
          Reset to auto
        </button>
      ) : null}
    </InspectorSection>
  );
}

function ShapeInspector({ editor }: { editor: Editor }) {
  const a = { ...SHAPE_FALLBACK, ...(editor.getAttributes('shapeBlock') as Partial<ShapeAttrs>) } as ShapeAttrs;
  const set = (patch: Partial<ShapeAttrs>) => editor.chain().focus().updateAttributes('shapeBlock', patch).run();
  if (a.locked) {
    return (
      <InspectorShell>
        <LockedInspectorNotice onUnlock={() => set({ locked: false })} />
      </InspectorShell>
    );
  }
  /* A rounded corner needs a corner. An ellipse has none, and a literal path
     (heart, wave, blob) has corners we didn't generate and can't reason about,
     so the control is absent for both rather than present and inert. */
  const canRound = a.kind === 'rect' || a.kind === 'polygon' || a.kind === 'star';
  const w = a.boxW || SHAPE_DEFAULT_PX;
  const h = a.boxH || SHAPE_DEFAULT_PX;
  const ratio = w / (h || 1);
  const setW = (v: number) => set(a.lockAspect ? { boxW: v, boxH: Math.round(v / ratio) } : { boxW: v });
  const setH = (v: number) => set(a.lockAspect ? { boxH: v, boxW: Math.round(v * ratio) } : { boxH: v });

  return (
    <InspectorShell>
      {/* No shape picker and no preview here. The panel is for the shape you
          placed; swapping it for a different one is what the Shapes tiles are,
          and the canvas already shows you what you have.

          PanelGroup, not InspectorSection: this panel's sections needed to read
          as separate things, and the image and cover-shape inspectors beside it
          already use the bold-title-over-hairline level for exactly that. An
          uppercase eyebrow with no rule under it left Size and the fill swatches
          looking like one block. */}
      <PanelGroup label="Size" first>
        <SizeFields
          w={w}
          h={h}
          lockAspect={a.lockAspect}
          onW={setW}
          onH={setH}
          onToggleLock={() => set({ lockAspect: !a.lockAspect })}
        />
        {canRound && (
          /* Shown as 0-100, stored in viewBox units. Proportional storage is what
             keeps the rounding looking the same when the shape is resized — an
             absolute radius would vanish as the shape grew — but "0.6" is not a
             number anyone can act on, so the control speaks percent and converts.
             Half width, so it lines up under W rather than stretching a single
             number across the panel. */
          <div className="flex" style={{ gap: 6, marginTop: 10 }}>
            <NumRow
              label="Corner radius"
              value={Math.round((a.cornerRadius / SHAPE_MAX_ROUND) * 100)}
              onChange={(v) => set({ cornerRadius: (v / 100) * SHAPE_MAX_ROUND })}
              min={0}
              max={100}
              step={5}
              suffix="%"
            />
            <div style={{ flex: 1 }} />
          </div>
        )}
      </PanelGroup>

      {/* Count and ratio together, the way every vector tool exposes a star:
          count alone can only make the same star with more arms, and it's the
          ratio — how far the inner vertices sit from the centre — that turns it
          from a sharp star into a burst or a cog. */}
      {a.kind === 'star' && (
        <PanelGroup label="Star">
          <div className="flex items-end" style={{ gap: 6 }}>
            <NumRow label="Count" value={a.points} onChange={(v) => set({ points: v })} min={3} max={24} />
            <NumRow
              label="Ratio"
              value={Math.round(a.starRatio * 1000) / 10}
              onChange={(v) => set({ starRatio: v / 100 })}
              min={5}
              max={95}
              step={2.5}
              suffix="%"
            />
          </div>
        </PanelGroup>
      )}

      {/* Removable, like Stroke below it and like a fill in Figma — that's what
          an outline shape IS, so the panel has to be able to say it. Named and
          ruled off either way: dropping the "Fill" heading was tried and
          reverted, because with nothing above them the swatches read as a third
          row of the Size group, a colour picker sitting under W/H as if it sized
          something.
          Taking the fill off a shape that has no stroke would leave nothing on
          the page, so that case adds the stroke in the same move — removing the
          fill means "make it an outline", not "make it invisible". */}
      <AddableSection
        label="Fill"
        active={a.color !== 'none'}
        onAdd={() => set({ color: SHAPE_DEFAULT_COLOR })}
        onRemove={() => set(a.borderWidth > 0
          ? { color: 'none' }
          : { color: 'none', borderWidth: 2, borderColor: a.borderColor || SHAPE_DEFAULT_COLOR })}
      >
        <SwatchRow
          value={a.color}
          onChange={(c) => set({ color: c })}
        />
      </AddableSection>

      {/* The shape has carried borderWidth/borderColor since it was built and the
          renderer has always painted them — there was simply no way to say so.
          No sides and no position: this is an arbitrary path (a star, a blob),
          which has no top edge to name and no box to offset a ring against. */}
      <AddableSection
        label="Stroke"
        active={a.borderWidth > 0}
        onAdd={() => set({ borderWidth: 1, borderColor: a.borderColor || INK })}
        /* Mirror of the Fill removal above: taking the stroke off an unfilled
           shape puts the fill back rather than emptying the shape entirely. */
        onRemove={() => set(a.color !== 'none'
          ? { borderWidth: 0 }
          : { borderWidth: 0, color: a.borderColor || SHAPE_DEFAULT_COLOR })}
      >
        <StrokeFields
          color={a.borderColor || INK}
          onColor={(c) => set({ borderColor: c })}
          style={a.borderStyle}
          onStyle={(v) => set({ borderStyle: v })}
          width={a.borderWidth}
          onWidth={(v) => set({ borderWidth: v })}
        />
      </AddableSection>
    </InspectorShell>
  );
}

/* Embed inspector. */
function EmbedInspector({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes('embedBlock') as { kind: 'video' | 'audio'; src: string; locked: boolean };
  const [src, setSrc] = useState(attrs.src ?? '');
  if (attrs.locked) {
    return (
      <InspectorShell>
        <LockedInspectorNotice onUnlock={() => editor.chain().focus().updateAttributes('embedBlock', { locked: false }).run()} />
      </InspectorShell>
    );
  }
  return (
    <InspectorShell>
      <InspectorSection
        label="Source"
        hint={attrs.kind === 'video'
          ? 'Use the embed link (YouTube/Vimeo "Share → Embed"), not the regular watch page URL.'
          : 'A direct link to an audio file.'}
      >
        <FieldInput
          label="Source URL"
          value={src}
          placeholder={attrs.kind === 'audio' ? 'https://…/track.mp3' : 'https://www.youtube.com/embed/…'}
          onChange={(v) => { setSrc(v); setNodeAttrs(editor, 'embedBlock', { src: v }); }}
        />
      </InspectorSection>
      <BlockSizeSection editor={editor} nodeName="embedBlock" />
    </InspectorShell>
  );
}

function QrInspector({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes('qrCodeBlock') as { url: string; color: string; locked: boolean };
  const [url, setUrl] = useState(attrs.url ?? '');
  if (attrs.locked) {
    return (
      <InspectorShell>
        <LockedInspectorNotice onUnlock={() => editor.chain().focus().updateAttributes('qrCodeBlock', { locked: false }).run()} />
      </InspectorShell>
    );
  }
  return (
    <InspectorShell>
      <InspectorSection label="Destination" hint="Generates a real, scannable QR code that points to this URL.">
        <FieldInput
          label="URL"
          value={url}
          placeholder="https://…"
          onChange={(v) => { setUrl(v); setNodeAttrs(editor, 'qrCodeBlock', { url: v }); }}
        />
      </InspectorSection>

      <InspectorSection label="Colour" hint="Keep it dark against the white background — a light colour can make the code unreliable to scan.">
        <SwatchRow
          value={attrs.color ?? '#15191F'}
          onChange={(c) => editor.chain().focus().updateAttributes('qrCodeBlock', { color: c }).run()}
        />
      </InspectorSection>
      <BlockSizeSection editor={editor} nodeName="qrCodeBlock" />
    </InspectorShell>
  );
}

function ChartInspector({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes('chartBlock') as { chartType: 'bar' | 'line' | 'pie'; points: ChartPoint[]; color: string; locked: boolean };
  if (attrs.locked) {
    return (
      <InspectorShell>
        <LockedInspectorNotice onUnlock={() => editor.chain().focus().updateAttributes('chartBlock', { locked: false }).run()} />
      </InspectorShell>
    );
  }
  const points = attrs.points ?? [];
  const setPoints = (next: ChartPoint[]) => editor.chain().focus().updateAttributes('chartBlock', { points: next }).run();
  const rowInputStyle: React.CSSProperties = { ...ns, width: '100%', fontSize: 12.5, padding: '6px 8px', border: `1px solid ${BORDER}`, borderRadius: RADIUS_SM };
  return (
    <InspectorShell>
      <InspectorSection label="Type">
        <OptionGrid
          columns={3}
          value={attrs.chartType ?? 'bar'}
          onChange={(v) => editor.chain().focus().updateAttributes('chartBlock', { chartType: v }).run()}
          options={[
            { id: 'bar', label: 'Bar' },
            { id: 'line', label: 'Line' },
            { id: 'pie', label: 'Pie' },
          ]}
        />
      </InspectorSection>

      {attrs.chartType !== 'pie' && (
        <InspectorSection label="Colour" hint="Pie ignores this — each slice needs its own distinct colour, so it always uses the fixed palette instead.">
          <SwatchRow
            value={attrs.color ?? BLUE}
            onChange={(c) => editor.chain().focus().updateAttributes('chartBlock', { color: c }).run()}
          />
        </InspectorSection>
      )}

      <InspectorSection
        label="Data"
        hint={attrs.chartType === 'pie' && points.length > 6 ? 'Pie charts read best at a glance with 6 or fewer slices — Bar handles more categories more clearly.' : undefined}
      >
        <div className="flex flex-col" style={{ gap: 6 }}>
          {points.map((p, i) => (
            <div key={i} className="flex items-center" style={{ gap: 6 }}>
              <input
                value={p.label}
                placeholder="Label"
                onChange={(e) => setPoints(points.map((row, ri) => (ri === i ? { ...row, label: e.target.value } : row)))}
                style={{ ...rowInputStyle, flex: 2, minWidth: 0 }}
              />
              <input
                type="number"
                value={p.value}
                onChange={(e) => setPoints(points.map((row, ri) => (ri === i ? { ...row, value: Number(e.target.value) || 0 } : row)))}
                style={{ ...rowInputStyle, flex: 1, minWidth: 0 }}
              />
              <button
                onClick={() => setPoints(points.filter((_, ri) => ri !== i))}
                aria-label="Remove row"
                className="cursor-pointer flex items-center justify-center flex-shrink-0"
                style={{ width: 26, height: 26, border: 'none', background: 'none', color: SLATE }}
              >
                <Icon d="M18 6L6 18M6 6l12 12" size={14} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <FullButton label="+ Add row" onClick={() => setPoints([...points, { label: `Row ${points.length + 1}`, value: 0 }])} />
        </div>
      </InspectorSection>
      <BlockSizeSection editor={editor} nodeName="chartBlock" />
    </InspectorShell>
  );
}

function TextFieldInspector({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes('textFieldBlock') as { label: string; locked: boolean };
  const [label, setLabel] = useState(attrs.label ?? '');
  if (attrs.locked) {
    return (
      <InspectorShell>
        <LockedInspectorNotice onUnlock={() => editor.chain().focus().updateAttributes('textFieldBlock', { locked: false }).run()} />
      </InspectorShell>
    );
  }
  return (
    <InspectorShell>
      <InspectorSection label="Field" hint="Visual only — this prototype has no form backend to submit to.">
        <FieldInput
          label="Label"
          value={label}
          placeholder="Your name"
          onChange={(v) => { setLabel(v); setNodeAttrs(editor, 'textFieldBlock', { label: v }); }}
        />
      </InspectorSection>
      <BlockSizeSection editor={editor} nodeName="textFieldBlock" />
    </InspectorShell>
  );
}

function JumbotronInspector({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes('jumbotronBlock') as { heading: string; body: string; buttonLabel: string; bgColor: string; locked: boolean };
  const [heading, setHeading] = useState(attrs.heading ?? '');
  const [body, setBody] = useState(attrs.body ?? '');
  const [buttonLabel, setButtonLabel] = useState(attrs.buttonLabel ?? '');
  const update = (patch: Record<string, unknown>) => setNodeAttrs(editor, 'jumbotronBlock', patch);
  if (attrs.locked) {
    return (
      <InspectorShell>
        <LockedInspectorNotice onUnlock={() => update({ locked: false })} />
      </InspectorShell>
    );
  }
  return (
    <InspectorShell>
      <InspectorSection label="Content">
        <FieldInput label="Heading" value={heading} onChange={(v) => { setHeading(v); update({ heading: v }); }} />
        <div style={{ height: 10 }} />
        <FieldInput label="Body" multiline value={body} onChange={(v) => { setBody(v); update({ body: v }); }} />
        <div style={{ height: 10 }} />
        <FieldInput label="Button label" value={buttonLabel} onChange={(v) => { setButtonLabel(v); update({ buttonLabel: v }); }} />
      </InspectorSection>
      <InspectorSection label="Background">
        <SwatchRow
          tone="highlight"
          value={attrs.bgColor}
          onChange={(c) => update({ bgColor: c })}
        />
      </InspectorSection>
      <BlockSizeSection editor={editor} nodeName="jumbotronBlock" />
    </InspectorShell>
  );
}

function ColumnsInspector({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes('columnsBlock') as { columns: number; locked: boolean };
  if (attrs.locked) {
    return (
      <InspectorShell>
        <LockedInspectorNotice onUnlock={() => editor.chain().focus().updateAttributes('columnsBlock', { locked: false }).run()} />
      </InspectorShell>
    );
  }
  return (
    <InspectorShell>
      <InspectorSection label="Column count">
        <OptionGrid
          columns={3}
          value={String(attrs.columns ?? 2)}
          onChange={(v) => editor.chain().focus().updateAttributes('columnsBlock', { columns: Number(v) }).run()}
          options={[2, 3, 4].map((n) => ({ id: String(n), label: `${n}` }))}
        />
      </InspectorSection>
      <BlockSizeSection editor={editor} nodeName="columnsBlock" />
    </InspectorShell>
  );
}

function TableInspector({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes('table') as { locked: boolean };
  if (attrs.locked) {
    return (
      <InspectorShell>
        <LockedInspectorNotice onUnlock={() => editor.chain().focus().updateAttributes('table', { locked: false }).run()} />
      </InspectorShell>
    );
  }
  return (
    <InspectorShell>
      <InspectorSection label="Rows">
        <PillRow
          items={[
            { key: 'add-row', label: '+ Add row', active: false, onClick: () => editor.chain().focus().addRowAfter().run() },
            { key: 'del-row', label: '– Delete row', active: false, onClick: () => editor.chain().focus().deleteRow().run() },
          ]}
        />
      </InspectorSection>
      <InspectorSection label="Columns">
        <PillRow
          items={[
            { key: 'add-col', label: '+ Add column', active: false, onClick: () => editor.chain().focus().addColumnAfter().run() },
            { key: 'del-col', label: '– Delete column', active: false, onClick: () => editor.chain().focus().deleteColumn().run() },
          ]}
        />
      </InspectorSection>
      <BlockSizeSection editor={editor} nodeName="table" />
    </InspectorShell>
  );
}


/* Cover inspector — reached both when an element is selected (kind:'coverElement')
   and when just the cover page itself is (kind:'page'). */
function CoverInspector({ page, theme, selectedElementId, onUpdateElement, onStartCrop, onSetPageBg }: {
  page: SimplePage;
  theme: ThemeDef;
  selectedElementId: string | null;
  onUpdateElement: (pageId: string, elementId: string, patch: CoverElementPatch) => void;
  onStartCrop: (elementId: string) => void;
  onSetPageBg: (pageId: string, bg: string | undefined) => void;
}) {
  // The cover fills the whole page, so the canvas the percentages are relative
  // to IS the page geometry — which is configurable (Letter/A4/…), so the px the
  // fields show have to follow it rather than assume 720.
  const coverGeo = useContext(PageGeometryContext);
  const elements = page.coverElements ?? [];
  const selected = elements.find((el) => el.id === selectedElementId) ?? null;
  const update = (patch: CoverElementPatch) => { if (selected) onUpdateElement(page.id, selected.id, patch); };

  if (selected?.locked) {
    return (
      <InspectorShell>
        <LockedInspectorNotice onUnlock={() => update({ locked: false })} />
      </InspectorShell>
    );
  }

  const shape = selected?.type === 'shape' ? selected : null;
  const shapeShadow = shape ? parseShadow(shape.shadow ?? '') : null;
  const setShapeShadow = (sh: ShadowSpec) => update({ shadow: serializeShadow(sh) });
  // A corner needs two edges meeting at it. An ellipse has none, and the
  // triangle's are cut by a clip/polygon we'd have to re-describe to round — so
  // the field is absent for both rather than present and inert.
  const canRound = !!shape && shape.shape !== 'circle' && shape.shape !== 'triangle';

  return (
    <InspectorShell>
      {/* Figma's order, because this is Figma's object: where it is, then how big,
          then appearance, then fill/stroke/effects. The shape panel used to open
          on a four-up silhouette picker instead — which made "which shape is this"
          the headline question about an object whose shape you already chose, and
          left the properties you actually adjust (fill, stroke, radius, shadow)
          either buried or missing. The picker is gone: a rounded rectangle is a
          rectangle with a corner radius, which is now a field, and converting a
          circle into a triangle in place isn't a thing any design tool offers. */}
      {selected && (
        <PanelGroup label="Layout" first>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {/* No sizing menu on W: cover text always has a set width, so Auto
                width isn't a state this canvas has. Adding one would be a new
                behaviour, not a unit change. */}
            <DimensionField label="W" px={selected.w} dim={coverGeo.w} onChangePct={(v) => update({ w: clampPct(v, COVER_MIN_PCT, 100 - selected.x) })} />
            <DimensionField
              label="H"
              px={selected.h}
              dim={coverGeo.h}
              mode={selected.type === 'text' ? (selected.heightAuto === false ? 'fixed' : 'auto') : undefined}
              onMode={selected.type === 'text'
                ? (m) => update(m === 'auto' ? { heightAuto: true } : { heightAuto: false, h: selected.h })
                : undefined}
              onChangePct={(v) => update({ h: clampPct(v, COVER_MIN_PCT, 100 - selected.y), heightAuto: false })}
            />
            <DimensionField label="X" px={selected.x} dim={coverGeo.w} onChangePct={(v) => update({ x: clampPct(v, 0, 100 - selected.w) })} />
            <DimensionField label="Y" px={selected.y} dim={coverGeo.h} onChangePct={(v) => update({ y: clampPct(v, 0, 100 - selected.h) })} />
          </div>
          {shape?.shape === 'triangle' && (
            /* Where Figma puts rotation, and now what it actually is. The four
               fixed diagonals this replaces were the whole vocabulary a cover
               triangle had — a wedge at 15° off the corner, which is most of
               what these are used for, simply couldn't be drawn. All four are
               still one click away on the quarter-turn button beside the field. */
            <div style={{ marginTop: 12 }}>
              <FieldLabel>Rotation</FieldLabel>
              <div className="flex items-center" style={{ gap: 6 }}>
                <NumField
                  icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4v16h16" /></svg>}
                  value={Math.round(coverShapeRotation(shape))} min={0} max={360} suffix="°" title="Rotation" width={86}
                  // 360 and 0 are the same angle, so the field never shows a value
                  // its own up-arrow can't reach again.
                  onChange={(v) => update({ rotation: ((v % 360) + 360) % 360 })}
                />
                <Tooltip label="Rotate 90°" position="bottom">
                  <button
                    onClick={() => update({ rotation: (coverShapeRotation(shape) + 90) % 360 })}
                    className="flex items-center justify-center cursor-pointer"
                    style={{ width: 32, height: 28, borderRadius: RADIUS_SM, border: 'none', background: '#F4F6F9', color: SLATE }}
                    aria-label="Rotate 90 degrees"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg>
                  </button>
                </Tooltip>
              </div>
            </div>
          )}
        </PanelGroup>
      )}

      {/* Opacity applies to all three element types, so it sits outside the
          per-type blocks below — paired with corner radius exactly as the body
          image panel pairs the same two. No slider: this was the one slider left
          in the editor, and the image panel's own Opacity is a plain NumField.
          You judge the result on the canvas either way; the field is how you say
          what you judged. */}
      {selected && (
        <PanelGroup label="Appearance">
          {/* The same two-column grid the Layout fields use, not a flex row: on a
              text or triangle element there is no corner radius beside it, and a
              lone flex:1 field stretched the full 236px for a 4-character value —
              a different column rhythm from the W/H/X/Y grid directly above it. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'end' }}>
            <div style={{ minWidth: 0 }}>
              <FieldLabel>Opacity</FieldLabel>
              <NumField
                value={Math.round((selected.opacity ?? 1) * 100)}
                min={0} max={100} suffix="%"
                onChange={(v) => update({ opacity: v / 100 })}
              />
            </div>
            {canRound && (
              <div style={{ minWidth: 0 }}>
                <FieldLabel>Corner radius</FieldLabel>
                <NumField
                  value={coverShapeRadius(shape)}
                  min={0} max={400}
                  // Writing a radius also settles the legacy 'rounded' type into
                  // the plain rectangle it always was, so the stored shape and
                  // the number on screen can't disagree afterwards.
                  onChange={(v) => update({ radius: v, shape: 'rectangle' })}
                />
              </div>
            )}
          </div>
        </PanelGroup>
      )}

      {selected?.type === 'text' && (
        <PanelGroup label="Text">
          {/* Font family and size in one row, not two stacked sections each
             carrying its own label — the two are one decision (what the text
             looks like), and this is exactly how the presentation editor's own
             text panel pairs them. */}
          <FieldLabel>Font</FieldLabel>
          <div className="flex items-center" style={{ gap: 8 }}>
            <StyledDropdown
              value={selected.fontFamily}
              options={fontDropdownOptions()}
              searchable
              onChange={(v) => update({ fontFamily: v, stylePreset: null })}
            />
            <FontSizeStepper
              value={selected.fontSize}
              min={8}
              max={96}
              onChange={(n) => update({ fontSize: n, stylePreset: null })}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <FieldLabel>Alignment</FieldLabel>
            <PillRow
              items={[
                { key: 'left', label: <Icon d={ICONS.alignLeft} size={16} />, active: (selected.textAlign ?? 'center') === 'left', onClick: () => update({ textAlign: 'left' }) },
                { key: 'center', label: <Icon d={ICONS.alignCenter} size={16} />, active: (selected.textAlign ?? 'center') === 'center', onClick: () => update({ textAlign: 'center' }) },
                { key: 'right', label: <Icon d={ICONS.alignRight} size={16} />, active: selected.textAlign === 'right', onClick: () => update({ textAlign: 'right' }) },
              ]}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <FieldLabel>Colour</FieldLabel>
            <SwatchRow
              value={selected.color}
              onChange={(c) => update({ color: c, stylePreset: null })}
            />
          </div>
        </PanelGroup>
      )}

      {selected?.type === 'image' && (
        <PanelGroup label="Photo" hint="The dark overlay keeps any text over the photo legible.">
          <ToggleRow label="Dark overlay" checked={selected.overlayDark !== false} onChange={(v) => update({ overlayDark: v })} />
          {/* The same crop the body images use. Without it the only way to
              reframe a cover photo was to drag its box and let object-fit decide
              what survived — which on a cover, where framing is most of the
              design, meant no control over the one thing that matters. */}
          <div style={{ marginTop: 10 }}>
            <FullButton label={selected.crop ? 'Edit crop' : 'Crop image'} onClick={() => onStartCrop(selected.id)} />
          </div>
        </PanelGroup>
      )}

      {/* A cover photo is a box on a page like any other, so it gets the frame
          the body photo has always had — same fields, same component, same
          storage. It was missing for no reason anyone could name. */}
      {selected?.type === 'image' && (
        <AddableSection
          label="Stroke"
          active={(selected.borderWidth ?? 0) > 0}
          onAdd={() => update({ borderWidth: 1, borderColor: selected.borderColor || INK })}
          onRemove={() => update({ borderWidth: 0 })}
        >
          <StrokeFields
            color={selected.borderColor || INK}
            onColor={(c) => update({ borderColor: c })}
            sides={selected.borderSides}
            onSides={(v) => update({ borderSides: v })}
            style={selected.borderStyle}
            onStyle={(v) => update({ borderStyle: v })}
            position={selected.borderPos}
            onPosition={(v) => update({ borderPos: v })}
            width={selected.borderWidth ?? 0}
            onWidth={(v) => update({ borderWidth: v })}
          />
        </AddableSection>
      )}

      {shape && (
        <>
          <PanelGroup label="Fill">
            {/* Swatches alone. The hex field above them was a second way to say
                the same thing in a panel that already ends the row with a "+"
                opening the system colour picker — so an arbitrary colour is one
                click away without spending a whole row on a value almost nobody
                types by hand. */}
            <SwatchRow value={shape.color} onChange={(c) => update({ color: c })} />
          </PanelGroup>

          <AddableSection
            label="Stroke"
            active={(shape.borderWidth ?? 0) > 0}
            onAdd={() => update({ borderWidth: 1, borderColor: shape.borderColor || INK })}
            onRemove={() => update({ borderWidth: 0 })}
          >
            {/* The body image's own stroke fields, from the same component — a
                cover rule is a rectangle with one edge stroked, and that's a
                thing covers want more often than a full frame. The triangle is
                the one shape that passes neither sides nor position: its outline
                is a polygon, which has no edge to address by name and no inside
                to offset a ring to. It still dashes. */}
            <StrokeFields
              color={shape.borderColor || INK}
              onColor={(c) => update({ borderColor: c })}
              sides={shape.shape === 'triangle' ? undefined : shape.borderSides}
              onSides={shape.shape === 'triangle' ? undefined : (v) => update({ borderSides: v })}
              style={shape.borderStyle}
              onStyle={(v) => update({ borderStyle: v })}
              position={shape.borderPos}
              onPosition={shape.shape === 'triangle' ? undefined : (v) => update({ borderPos: v })}
              width={shape.borderWidth ?? 0}
              onWidth={(v) => update({ borderWidth: v })}
            />
          </AddableSection>

          {/* Figma lists the effect as a row and opens its fields in a popover; at
              264px a popover would land half off the edge, so the same fields, in
              the same order, expand inline — matching the body image panel, which
              already made that call. */}
          <AddableSection
            label="Effects"
            active={!!shapeShadow}
            onAdd={() => setShapeShadow({ ...DEFAULT_SHADOW })}
            onRemove={() => update({ shadow: '' })}
          >
            {shapeShadow && (
              <>
                <div style={{ ...ns, fontSize: 12, fontWeight: 600, color: INK, marginBottom: 8 }}>Drop shadow</div>
                <div className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
                  <span style={{ ...ns, fontSize: 11, color: SLATE, width: 50, flexShrink: 0 }}>Position</span>
                  <NumField icon={<span style={{ ...ns, fontSize: 10.5, fontWeight: 700 }}>X</span>} value={shapeShadow.x} min={-200} max={200} onChange={(v) => setShapeShadow({ ...shapeShadow, x: v })} />
                  <NumField icon={<span style={{ ...ns, fontSize: 10.5, fontWeight: 700 }}>Y</span>} value={shapeShadow.y} min={-200} max={200} onChange={(v) => setShapeShadow({ ...shapeShadow, y: v })} />
                </div>
                <div className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
                  <span style={{ ...ns, fontSize: 11, color: SLATE, width: 50, flexShrink: 0 }}>Blur</span>
                  <NumField value={shapeShadow.blur} min={0} max={200} onChange={(v) => setShapeShadow({ ...shapeShadow, blur: v })} />
                </div>
                {shape.shape !== 'triangle' && (
                  /* A triangle's shadow is a drop-shadow() filter, which follows
                     the silhouette but has no spread — so the field is hidden
                     there rather than shown doing nothing. */
                  <div className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
                    <span style={{ ...ns, fontSize: 11, color: SLATE, width: 50, flexShrink: 0 }}>Spread</span>
                    <NumField value={shapeShadow.spread} min={-200} max={200} onChange={(v) => setShapeShadow({ ...shapeShadow, spread: v })} />
                  </div>
                )}
                <div className="flex items-center" style={{ gap: 6, marginBottom: 8 }}>
                  <span style={{ ...ns, fontSize: 11, color: SLATE, width: 50, flexShrink: 0 }}>Opacity</span>
                  <NumField value={Math.round(shapeShadow.opacity * 100)} min={0} max={100} suffix="%"
                    onChange={(v) => setShapeShadow({ ...shapeShadow, opacity: v / 100 })} />
                </div>
                <FieldLabel>Colour</FieldLabel>
                <SwatchRow value={shapeShadow.color} onChange={(c) => setShapeShadow({ ...shapeShadow, color: c })} />
              </>
            )}
          </AddableSection>
        </>
      )}

      {/* Last in the panel, under the fields it overwrites, and in the same
          place as the chapter-text panel's own — see TextStylePresetGrid. */}
      {selected?.type === 'text' && (
        <PanelGroup label="Style preset">
          <TextStylePresetGrid
            value={selected.stylePreset ?? null}
            onChange={(id) => {
              const preset = TEXT_STYLES.find((st) => st.id === id);
              if (preset) update({
                stylePreset: preset.id,
                fontFamily: preset.fontFamily, fontSize: preset.fontSize, color: preset.color,
                // Spelled out rather than spread, so a preset that omits a
                // property clears the previous preset's value instead of
                // leaving it stuck on (Statement's 800 weight surviving a
                // switch to Manuscript, say).
                fontWeight: preset.fontWeight, fontStyle: preset.fontStyle,
                letterSpacing: preset.letterSpacing, textTransform: preset.textTransform,
              });
            }}
          />
        </PanelGroup>
      )}

      {!selected && (
        <>
          <PageBackgroundGroup page={page} theme={theme} onChange={(bg) => onSetPageBg(page.id, bg)} first />
          <div style={{ ...ns, fontSize: 11.5, color: SLATE, lineHeight: 1.55, marginTop: 16 }}>
            Click an element on the cover to edit it, or apply a different layout from the Templates tab.
          </div>
        </>
      )}
    </InspectorShell>
  );
}

/* Page background — the same control on every page, because that's what it is: a
   page property, not a decoration one page happens to have. Two of the templates
   used to fake a coloured page by dropping a full-bleed rectangle SHAPE over the
   cover, which is why clicking a cover's background opened a shape inspector
   offering to turn the page into a circle, and why no other page in the book
   could be given a colour at all.

   Unset tracks the template's own bg (the same "auto until you touch it"
   relationship ChapterOverrides uses for chapter type), so Reset is offered only
   once there's an override to undo rather than sitting there permanently. */
function PageBackgroundGroup({ page, theme, onChange, first }: {
  page: PageMeta;
  theme: ThemeDef;
  onChange: (bg: string | undefined) => void;
  first?: boolean;
}) {
  const overridden = !!page.bg;
  return (
    <PanelGroup
      label="Background"
      first={first}
      action={overridden ? (
        <button
          onClick={() => onChange(undefined)}
          className="cursor-pointer"
          style={{ ...ns, fontSize: 11.5, fontWeight: 600, color: BLUE, background: 'none', border: 'none', padding: 0 }}
        >
          Reset
        </button>
      ) : undefined}
      hint={overridden ? undefined : `Following the ${theme.name} template.`}
    >
      <SwatchRow value={page.bg ?? theme.bg} onChange={(c) => onChange(c)} />
    </PanelGroup>
  );
}

/* TOC and back-matter pages have nothing to configure — they're generated or
   plain text — but selecting one should still land on something contextual
   rather than the generic "select a chapter" placeholder. */
function PageInfoInspector({ page, theme, onSetPageBg }: {
  page: PageMeta;
  theme: ThemeDef;
  onSetPageBg: (pageId: string, bg: string | undefined) => void;
}) {
  /* PageMeta, not SimplePage. Selecting a CHAPTER page in the Pages rail lands
     here too — the call site was casting it to SimplePage, so a chapter page got
     the back-matter blurb about an author bio it doesn't have. */
  const note = page.type === 'toc'
    ? 'Entries are generated automatically from each chapter’s heading, with no page numbers — matching what Kindle and other retailers require. To change an entry, edit that chapter’s heading directly.'
    : page.type === 'backmatter'
      ? 'A short author bio shown on its own page at the end of the book. Edit the text directly on the canvas.'
      : 'Click into the text to format it, or use the Layouts tab to change how this chapter opens.';
  return (
    <InspectorShell>
      <PageBackgroundGroup page={page} theme={theme} onChange={(bg) => onSetPageBg(page.id, bg)} first />
      <div style={{ ...ns, fontSize: 11.5, color: SLATE, lineHeight: 1.55, marginTop: 16 }}>{note}</div>
    </InspectorShell>
  );
}

/* Reached by clicking the page-number chip itself (see PageNumberChip) — one
   book-wide object, so unlike every other inspector here there's no "selected
   element" to look up first, just the settings themselves. Everything about
   the number lives here now — where a first pass split "how it looks"
   (position/font/colour) from "what it counts" (start-at/skip-cover/style)
   across this panel and Book Settings turned out to just relocate the
   confusion instead of fixing it. Book Settings keeps only the on/off switch,
   since that's the one control needed even when there's no chip on the
   canvas yet to click. */
function PageNumberInspector({ pageNumbers, setPageNumbers }: {
  pageNumbers: PageNumberSettings;
  setPageNumbers: (v: PageNumberSettings) => void;
}) {
  const update = (patch: Partial<PageNumberSettings>) => setPageNumbers({ ...pageNumbers, ...patch });
  const selectStyle: React.CSSProperties = { ...ns, width: '100%', fontSize: 13, padding: '8px 10px', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, background: '#fff', appearance: 'none', paddingRight: 28 };
  const numberFieldStyle: React.CSSProperties = { ...ns, width: '100%', fontSize: 13, padding: '8px 10px', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD };

  return (
    <InspectorShell>
      <InspectorSection label="Position">
        <div style={{ position: 'relative' }}>
          <select style={selectStyle} value={pageNumbers.position} onChange={(e) => update({ position: e.target.value as PageNumberPosition })}>
            <option value="footer-center">Footer · Center</option>
            <option value="footer-left">Footer · Left</option>
            <option value="footer-right">Footer · Right</option>
            <option value="header-center">Header · Center</option>
            <option value="header-left">Header · Left</option>
            <option value="header-right">Header · Right</option>
          </select>
          <SelectChevron />
        </div>
      </InspectorSection>
      <InspectorSection label="Numbering">
        <PillRow
          items={[
            { key: 'numeric', label: '1, 2, 3', active: pageNumbers.style === 'numeric', onClick: () => update({ style: 'numeric' }) },
            { key: 'roman', label: 'i, ii, iii', active: pageNumbers.style === 'roman', onClick: () => update({ style: 'roman' }) },
          ]}
        />
        <div className="flex items-center" style={{ gap: 8, marginTop: 8 }}>
          <span style={{ ...ns, fontSize: 12, color: SLATE, flexShrink: 0 }}>Start at</span>
          <input type="number" min={1} style={{ ...numberFieldStyle, width: 70 }} value={pageNumbers.startAt} onChange={(e) => update({ startAt: Number(e.target.value) || 1 })} />
        </div>
        <div style={{ marginTop: 10 }}>
          <ToggleRow label="Skip cover & back matter" checked={pageNumbers.skipCoverAndBackMatter} onChange={(v) => update({ skipCoverAndBackMatter: v })} />
        </div>
      </InspectorSection>
      <InspectorSection label="Font">
        <div className="flex items-center" style={{ gap: 8 }}>
          <StyledDropdown
            value={pageNumbers.fontFamily ?? ns.fontFamily}
            options={fontDropdownOptions()}
            searchable
            onChange={(v) => update({ fontFamily: v })}
          />
          <FontSizeStepper
            value={pageNumbers.fontSize ?? 11.5}
            min={8}
            max={24}
            onChange={(n) => update({ fontSize: n })}
          />
        </div>
      </InspectorSection>
      <InspectorSection label="Colour">
        <SwatchRow
          value={pageNumbers.color ?? SLATE}
          onChange={(c) => update({ color: c })}
        />
      </InspectorSection>
      <div style={{ ...ns, fontSize: 11.5, color: SLATE, lineHeight: 1.5, marginTop: 4 }}>
        Applies to every page&rsquo;s number at once. Turn numbering off entirely from Book Settings.
      </div>
    </InspectorShell>
  );
}

/* ── Pre-publish checklist modal ──────────────────────────────────────────── */
function PublisherOverlay({
  metadata, chapters, missingAltCount, hasCoverImage, coverImage, coverTitle, coverSubtitle, backMatterHtml, onClose,
  currentPlan, onLockedExport, theme, tocHeading, includeTocPage, paragraphStyle,
}: {
  paragraphStyle: ParagraphStyle;
  metadata: BookMetadata;
  chapters: { id: string; title: string; html: string; layout?: string }[];
  missingAltCount: number;
  hasCoverImage: boolean;
  coverImage?: string;
  coverTitle: string;
  coverSubtitle: string;
  backMatterHtml: string;
  onClose: () => void;
  currentPlan: string;
  onLockedExport: () => void;
  /* The look the book was designed in. The packager used to emit one fixed generic
     serif sheet, so every float, column, callout and text style arrived in the
     reader unstyled — the theme and the chapter layouts have to travel with it. */
  theme: ThemeDef;
  tocHeading: string;
  includeTocPage: boolean;
}) {
  const [open, setOpen] = useState<string | null>('meta-required');
  const [exportState, setExportState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [exportNote, setExportNote] = useState('');
  // Images that couldn't be fetched at package time — reported rather than swallowed,
  // since the whole point of this panel is that nothing looks silently fine.
  const [exportWarning, setExportWarning] = useState('');

  // Matches PreviewOverlay's identical listener — every other full-screen overlay
  // in this file closes on Escape, and this one (reached at the single highest-
  // stakes moment in the flow) was the one exception.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const results = runChecks({ metadata, chapters, missingAltCount, hasCoverImage });
  const stats = summarise(results);
  const groups: CheckResult['group'][] = ['Metadata', 'Structure', 'Accessibility', 'Packaging', 'Retailer'];
  // EPUB is Pro+ in the real product (see PUBLISH_FORMATS in EbookCreateFlow.tsx) — this
  // overlay had no plan check at all before, so Standard accounts could export it for free.
  // Named rather than a bare 'pro' literal so the gate check and the badge below can't
  // drift apart if a second export format (and its own required tier) gets added later.
  const EPUB_REQUIRED_PLAN: GateTier = 'pro';
  const epubLocked = shouldShowTierBadge(currentPlan as never, EPUB_REQUIRED_PLAN);

  const statusStyle = (status: CheckStatus) => {
    if (status === 'pass') return { bg: '#E7F3ED', fg: '#2A7A57', glyph: '✓' };
    if (status === 'fail') return { bg: '#FBEAE8', fg: '#B91C1C', glyph: '!' };
    if (status === 'warn') return { bg: '#FDF3E2', fg: '#8A5A08', glyph: '!' };
    return { bg: '#F0F2F5', fg: SLATE, glyph: '–' };
  };

  const runExport = async () => {
    setExportState('working');
    setExportNote('');
    setExportWarning('');
    try {
      /* Fetching the images is the reason this is async. Every image in the product
         is a bundled asset path, and the packager only ever embedded `data:` URIs —
         so the cover silently fell back to text and every other image shipped as an
         absolute path to a host that isn't in the book. They're inlined first, then
         unpacked into real files inside the package. */
      const { input, unresolved } = await inlineExternalImages({
        metadata: {
          ...metadata,
          seriesName: metadata.seriesName,
          seriesPosition: metadata.seriesPosition,
          readingDirection: metadata.readingDirection,
        },
        chapters,
        coverImage,
        coverTitle,
        coverSubtitle,
        backMatterHtml,
        tocHeading,
        includeTocPage,
        theme: {
          headingFont: theme.headingFont,
          bodyFont: theme.bodyFont,
          headingColor: theme.headingColor,
          bodyColor: theme.bodyColor,
          accentColor: theme.accentColor,
          bg: theme.bg,
        },
        textStyles: TEXT_STYLES,
        paragraphStyle,
      });
      const bytes = buildEpub(input);
      const safeName = (metadata.title || 'book').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
      downloadEpub(bytes, `${safeName || 'book'}.epub`);
      setExportState('done');
      setExportNote(`${(bytes.length / 1024).toFixed(0)} KB · ${chapters.length} chapters`);
      if (unresolved.length > 0) {
        setExportWarning(`${unresolved.length} image${unresolved.length === 1 ? '' : 's'} could not be read and ${unresolved.length === 1 ? 'was' : 'were'} left out of the file.`);
      }
    } catch (err) {
      setExportState('error');
      setExportNote(err instanceof Error ? err.message : 'Packaging failed');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#EEF0F3', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div className="flex-shrink-0 flex items-center justify-between" style={{ height: 56, padding: '0 20px', borderBottom: `1px solid ${BORDER}`, background: '#fff' }}>
        <button onClick={onClose} className="flex items-center cursor-pointer" style={{ gap: 6, ...ns, fontSize: 13, fontWeight: 500, color: SLATE, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, padding: '7px 14px' }}>
          <Icon d={ICONS.back} size={14} /> Back to editing
        </button>
        <div style={{ ...ns, fontSize: 13.5, fontWeight: 700, color: INK }}>Publish</div>
        <div style={{ width: 140 }} />
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '32px 24px 80px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>

          <div className="flex items-center" style={{ gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <h2 style={{ ...ns, fontSize: 20, fontWeight: 700, color: INK, margin: 0 }}>Validation &amp; readiness</h2>
            {stats.failures > 0 && <span style={{ ...ns, fontSize: 11.5, fontWeight: 600, color: '#B91C1C', background: '#FBEAE8', borderRadius: RADIUS_PILL, padding: '3px 10px' }}>{stats.failures} blocking</span>}
            {stats.warnings > 0 && <span style={{ ...ns, fontSize: 11.5, fontWeight: 600, color: '#8A5A08', background: '#FDF3E2', borderRadius: RADIUS_PILL, padding: '3px 10px' }}>{stats.warnings} to review</span>}
            <span style={{ ...ns, fontSize: 11.5, fontWeight: 600, color: SLATE, background: '#F0F2F5', borderRadius: RADIUS_PILL, padding: '3px 10px' }}>{stats.unavailable} not run here</span>
          </div>
          <p style={{ ...ns, fontSize: 13, color: SLATE, margin: '0 0 22px', lineHeight: 1.55 }}>
            Checks in the first three groups run against your document as you edit. Packaging and retailer checks need a server and are not run in this prototype — they are listed so nothing looks silently fine.
          </p>

          {groups.map((group) => {
            const rows = results.filter((r) => r.group === group);
            if (rows.length === 0) return null;
            return (
              <div key={group} style={{ marginBottom: 18 }}>
                <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, marginBottom: 8 }}>{group}</div>
                <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_LG, overflow: 'hidden', boxShadow: CARD_SHADOW }}>
                  {rows.map((r, i) => {
                    const st = statusStyle(r.status);
                    const isOpen = open === r.id;
                    return (
                      <div key={r.id} style={{ borderTop: i > 0 ? `1px solid ${BORDER}` : 'none' }}>
                        <button
                          onClick={() => setOpen(isOpen ? null : r.id)}
                          className="flex items-center cursor-pointer"
                          style={{ ...ns, width: '100%', gap: 11, padding: '13px 16px', background: 'none', border: 'none', textAlign: 'left' }}
                        >
                          <span style={{ width: 19, height: 19, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: st.bg, color: st.fg, fontSize: 11, fontWeight: 700 }}>{st.glyph}</span>
                          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: INK }}>{r.label}</span>
                          {typeof r.count === 'number' && r.count > 0 && (
                            <span style={{ ...ns, fontSize: 11.5, fontWeight: 600, color: st.fg, background: st.bg, borderRadius: RADIUS_PILL, padding: '2px 9px' }}>{r.count}</span>
                          )}
                          {r.status === 'unavailable' && (
                            <span style={{ ...ns, fontSize: 11.5, fontWeight: 600, color: SLATE, background: '#F0F2F5', borderRadius: RADIUS_PILL, padding: '2px 9px' }}>Not run here</span>
                          )}
                          <svg width="9" height="6" viewBox="0 0 8 5" fill="none" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .12s ease', flexShrink: 0 }}>
                            <path d="M1 1L4 4L7 1" stroke={SLATE} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        {isOpen && (
                          <div style={{ ...ns, fontSize: 13, color: SLATE, lineHeight: 1.6, padding: '0 16px 14px 46px' }}>{r.detail}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, margin: '26px 0 8px' }}>Export</div>
          <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_LG, padding: '18px 20px', boxShadow: CARD_SHADOW }}>
            <div className="flex items-start justify-between" style={{ gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div className="flex items-center" style={{ gap: 8, marginBottom: 3 }}>
                  <div style={{ ...ns, fontSize: 14.5, fontWeight: 700, color: INK }}>EPUB 3</div>
                  {epubLocked && <TierBadge tier={EPUB_REQUIRED_PLAN} />}
                </div>
                <div style={{ ...ns, fontSize: 13, color: SLATE, lineHeight: 1.55 }}>
                  Reflowable, the format Kindle, Apple Books, Kobo and Google Play all accept. Packaged in your browser: chapters become XHTML, images are unpacked out of the document, and a linked navigation document is generated.
                </div>
                {exportState === 'done' && <div style={{ ...ns, fontSize: 12.5, color: '#2A7A57', marginTop: 8 }}>Downloaded · {exportNote}</div>}
                {exportState === 'error' && <div style={{ ...ns, fontSize: 12.5, color: '#B91C1C', marginTop: 8 }}>{exportNote}</div>}
                {exportWarning && <div style={{ ...ns, fontSize: 12.5, color: '#8A5A08', marginTop: 6 }}>{exportWarning}</div>}
              </div>
              <button
                onClick={epubLocked ? onLockedExport : runExport}
                disabled={!epubLocked && (exportState === 'working' || stats.blocking)}
                title={epubLocked ? 'Unlock EPUB export' : stats.blocking ? 'Fix the blocking checks above first' : 'Package and download an EPUB'}
                style={{
                  ...ns, fontSize: 13, fontWeight: 600, color: '#fff', border: 'none', borderRadius: RADIUS_MD, padding: '10px 20px',
                  background: !epubLocked && stats.blocking ? '#9AA4B2' : BLUE, cursor: !epubLocked && (stats.blocking || exportState === 'working') ? 'default' : 'pointer', flexShrink: 0,
                }}
              >
                {epubLocked ? 'Upgrade to Pro' : exportState === 'working' ? 'Packaging…' : 'Export EPUB'}
              </button>
            </div>
          </div>

          <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_LG, padding: '18px 20px', marginTop: 10, opacity: 0.72 }}>
            <div className="flex items-start justify-between" style={{ gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ ...ns, fontSize: 14.5, fontWeight: 700, color: INK, marginBottom: 3 }}>Print PDF</div>
                <div style={{ ...ns, fontSize: 13, color: SLATE, lineHeight: 1.55 }}>Fixed layout with trim size, margins and a spine. Needs server-side rendering — not built yet.</div>
              </div>
              <span style={{ ...ns, fontSize: 11.5, fontWeight: 600, color: SLATE, background: '#F0F2F5', borderRadius: RADIUS_PILL, padding: '4px 11px', flexShrink: 0 }}>Not built</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ── Preview — read-only render of live content, not the stale seed HTML in
   `pages`. Chapter/field text is captured off each editor's onUpdate into
   chapterContent/fieldContent (see BookEditorView state) specifically so this
   reflects real edits rather than what the page loaded with. Sits as a
   full-screen overlay on top of the still-mounted editor, so the shared
   .book-chapter-prose global styles (emitted by the live ChapterEditors) stay
   in the document and this reuses them rather than re-declaring its own. */
function PreviewPage({ page, pages, theme, chapterContent, fieldContent, metadata }: { page: PageMeta; pages: PageMeta[]; theme: ThemeDef; chapterContent: Record<string, string>; fieldContent: Record<string, string>; metadata: BookMetadata }) {
  const geo = useContext(PageGeometryContext);
  if (page.type === 'chapter') {
    const bodyFont = page.overrides.bodyFont ?? theme.bodyFont;
    const headingColor = page.overrides.headingColor ?? theme.headingColor;
    /* The live marker gets its number from a NodeView counting siblings, and
       there's no NodeView here — this is the read-only render used by Preview,
       the page thumbnails and version history alike, so the numbers get baked
       in at the same single point the exporter bakes them in at. */
    const titleHtml = fieldContent[`${page.id}::title`] ?? page.titleHtml;
    const eyebrowHtml = fieldContent[`${page.id}::eyebrow`] ?? DEFAULT_EYEBROW_HTML;
    const openerRule = openerRuleOf(page, theme);
    const chapterNumber = pages.filter((pg) => pg.type === 'chapter').findIndex((pg) => pg.id === page.id) + 1;
    /* Same two-step as the exporter, in the same order: numbers baked in, then
       field tokens resolved. This is the first place the author sees what the
       token actually becomes, since the editor keeps showing the token itself. */
    const html = resolveFieldTokens(
      applyFootnoteNumbering(chapterContent[page.id] ?? page.initialHtml, page.id),
      { author: metadata.author, bookTitle: metadata.title, chapterTitle: stripTags(titleHtml) || page.title, chapterNumber },
    );
    return (
      <div style={{ background: page.bg ?? theme.bg, border: `1px solid ${BORDER}`, borderRadius: 3, boxShadow: PAGE_SHADOW, minHeight: geo.h, padding: `${geo.padY}px ${geo.padX}px` }}>
        {/* titleHtml is a real <h2> now (for a real document outline) — its own UA
            defaults (bold, ~1.5em) would otherwise fight the sizing set here, since
            inline styles on this wrapper don't cascade onto dangerouslySetInnerHTML
            children the way they would onto plain text. */}
        <style jsx global>{`.book-preview-title h2 { margin: 0; font: inherit; color: inherit; }`}</style>
        {page.layout === 'opener' && (
          page.openerImage ? (
            <div style={{ position: 'relative', margin: '-55px -63px 20px', height: 220, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={page.openerImage} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.78) 100%)' }} />
              <div className="flex items-center justify-between" style={{ position: 'absolute', left: 24, right: 24, bottom: 16 }}>
                <div style={{ ...ns, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fff' }} dangerouslySetInnerHTML={{ __html: eyebrowHtml }} />
                <span style={{ fontFamily: theme.headingFont, fontWeight: 800, fontSize: 40, lineHeight: 1, color: '#fff' }}>{chapterNumber}</span>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ height: openerRule.thickness, width: openerRule.width, background: openerRule.color, borderRadius: 2, marginBottom: 14 }} />
              <div style={{ ...ns, marginBottom: 6, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: theme.accentColor }} dangerouslySetInnerHTML={{ __html: eyebrowHtml }} />
            </div>
          )
        )}
        <div
          className="book-preview-title"
          style={{
            fontFamily: theme.headingFont, color: headingColor,
            fontSize: page.layout === 'opener' ? 38 : 26,
            margin: page.layout === 'opener' ? '0 0 20px' : '0 0 14px',
          }}
          dangerouslySetInnerHTML={{ __html: titleHtml }}
        />
        <div
          className={`book-chapter-prose${page.layout === 'two-column' ? ' is-two-col' : page.layout === 'image-led' ? ' is-image-led' : ''}`}
          style={{ fontFamily: bodyFont }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    );
  }
  if (page.type === 'cover') {
    return <CoverCanvasStatic page={page} theme={theme} fieldContent={fieldContent} />;
  }
  if (page.type === 'toc') {
    const chapters = pages.filter((p): p is ChapterPage => p.type === 'chapter' && !p.excludeFromToc);
    const headingHtml = fieldContent[`${page.id}::heading`] ?? '<p>Table of Contents</p>';
    return (
      <div style={{ position: 'relative', background: page.bg ?? theme.bg, border: `1px solid ${BORDER}`, borderRadius: 3, boxShadow: PAGE_SHADOW, minHeight: geo.h, padding: `${geo.padY}px ${geo.padX}px`, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 7, background: theme.accentColor }} />
        <div style={{ fontFamily: theme.headingFont, color: theme.headingColor, fontSize: 26, margin: '0 0 20px' }} dangerouslySetInnerHTML={{ __html: headingHtml }} />
        {chapters.map((c, i) => {
          const heading = stripTags(fieldContent[`${c.id}::title`] ?? c.titleHtml) || c.title;
          const subs = deriveSubheadings(chapterContent[c.id] ?? c.initialHtml);
          return (
            <div key={c.id} style={{ borderBottom: `1px solid ${BORDER}`, padding: '10px 0' }}>
              <div style={{ ...ns, color: theme.headingColor, fontSize: 14.5 }}>{i + 1}. {heading}</div>
              {subs.map((s, si) => (
                <div key={si} style={{ ...ns, color: theme.bodyColor, fontSize: 13, padding: '4px 0 0 22px' }}>{s}</div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }
  const bioHtml = fieldContent[`${page.id}::bio`] ?? '<p>Add a short author bio here.</p>';
  return (
    <div style={{ background: page.bg ?? theme.bg, border: `1px solid ${BORDER}`, borderRadius: 3, boxShadow: PAGE_SHADOW, minHeight: geo.h, display: 'flex', overflow: 'hidden' }}>
      <AuthorAvatarPanel accentColor={theme.accentColor} photo={page.authorPhoto} />
      <div style={{ flex: 1, minWidth: 0, padding: '56px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h2 style={{ fontFamily: theme.headingFont, color: theme.headingColor, fontSize: 22, margin: '0 0 10px' }}>About the Author</h2>
        <div style={{ fontSize: 14.5, color: theme.bodyColor, maxWidth: 420 }} dangerouslySetInnerHTML={{ __html: bioHtml }} />
      </div>
    </div>
  );
}

const DEVICE_FRAMES: { id: 'desktop' | 'tablet' | 'mobile'; label: string; icon: string; width: number }[] = [
  { id: 'desktop', label: 'Desktop', icon: ICONS.desktop, width: PAGE_W },
  { id: 'tablet', label: 'Tablet', icon: ICONS.tablet, width: 460 },
  { id: 'mobile', label: 'Mobile', icon: ICONS.mobile, width: 320 },
];

/* The plain, full-book read-experience reached from the toolbar's "Preview"
   button — a full takeover, with a device-frame switcher and the same
   page-thumbnail rail vocabulary the Pages panel and NarrationViewV4's
   filmstrip use. */
function PreviewOverlay({
  pages, theme, chapterContent, fieldContent, metadata, pageNumbers, title, onClose,
}: {
  pages: PageMeta[];
  theme: ThemeDef;
  chapterContent: Record<string, string>;
  fieldContent: Record<string, string>;
  // Preview is where a dynamic field first shows its real value — the editor
  // keeps displaying the token — so the book's own metadata has to reach here.
  metadata: BookMetadata;
  pageNumbers: PageNumberSettings;
  title: string;
  onClose: () => void;
}) {
  const geo = useContext(PageGeometryContext);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const frame = DEVICE_FRAMES.find((d) => d.id === device) ?? DEVICE_FRAMES[0];
  const previewRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const jumpToPreviewPage = (id: string) => previewRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Tracks which page is nearest the top of the scroll pane, so the rail can
  // highlight it exactly the way the Pages filmstrip highlights the active page.
  const [activePreviewId, setActivePreviewId] = useState<string | null>(pages[0]?.id ?? null);
  const handlePreviewScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const paneTop = e.currentTarget.getBoundingClientRect().top;
    let closestId: string | null = null;
    let closestDist = Infinity;
    for (const p of pages) {
      const el = previewRefs.current[p.id];
      if (!el) continue;
      const dist = Math.abs(el.getBoundingClientRect().top - paneTop);
      if (dist < closestDist) { closestDist = dist; closestId = p.id; }
    }
    if (closestId) setActivePreviewId(closestId);
  };
  const railThumbW = 126;
  const railThumbH = railThumbW * (geo.h / geo.w);
  const chapterCountForNumbering = (id: string) => {
    const contentPages = pages.filter((p) => !(pageNumbers.skipCoverAndBackMatter && (p.type === 'cover' || p.type === 'backmatter')));
    return contentPages.findIndex((p) => p.id === id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={{ background: '#EEF0F3', zIndex: 200, display: 'flex', flexDirection: 'column', position: 'fixed', inset: 0 }}>
      <div
        className="flex-shrink-0 flex justify-between"
        style={{ alignItems: 'center', height: 60, padding: '0 20px', borderBottom: `1px solid ${BORDER}`, background: '#fff', flexWrap: 'wrap', gap: 10 }}
      >
        <button onClick={onClose} className="flex items-center cursor-pointer" style={{ gap: 6, ...ns, fontSize: 13, fontWeight: 500, color: SLATE, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, padding: '7px 14px' }}>
          <Icon d={ICONS.back} size={14} /> Back to editing
        </button>

        {/* Device-frame switcher — the desktop/tablet/mobile row every Kindle/Print
            preview step in the real product shows above the mockup. */}
        <div className="flex items-center" style={{ gap: 2, background: '#F0F2F5', borderRadius: RADIUS_LG, padding: 3 }}>
          {DEVICE_FRAMES.map((d) => (
            <Tooltip key={d.id} label={d.label} position="bottom">
              <button
                onClick={() => setDevice(d.id)}
                className="flex items-center justify-center cursor-pointer"
                style={{ width: 32, height: 28, borderRadius: RADIUS_SM, border: 'none', background: device === d.id ? '#fff' : 'transparent', color: device === d.id ? BLUE : SLATE, boxShadow: device === d.id ? '0px 1px 2px rgba(15,23,51,0.12)' : 'none' }}
              >
                <Icon d={d.icon} size={15} />
              </button>
            </Tooltip>
          ))}
        </div>
        <div style={{ ...ns, fontSize: 13.5, fontWeight: 700, color: INK }}>{title} — Preview</div>
      </div>
      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
        <div className="flex-1 overflow-y-auto" style={{ padding: '40px 24px 120px' }} onScroll={handlePreviewScroll}>
          <div
            style={{
              width: frame.width, margin: '0 auto',
              ...(device !== 'desktop' ? { border: '10px solid #1F2430', borderRadius: 22, boxShadow: '0px 16px 40px rgba(15,23,51,0.22)', overflow: 'hidden', background: '#1F2430' } : {}),
            }}
          >
            {pages.map((p) => (
              <div key={p.id} ref={(el) => { previewRefs.current[p.id] = el; }} style={{ marginBottom: device === 'desktop' ? 40 : 0 }}>
                <PageNumberStrip settings={pageNumbers} index={chapterCountForNumbering(p.id)} edge="header" />
                {/* The cover is a percent-positioned canvas at a fixed intrinsic
                    PAGE_W — unlike flowing chapter/toc/backmatter text, it visibly
                    distorts if just given a narrower width with no matching scale,
                    so it's the one page type that needs an explicit scale wrapper
                    to fit a narrower device frame. */}
                {p.type === 'cover' && frame.width !== geo.w ? (
                  <div style={{ width: frame.width, height: geo.h * (frame.width / geo.w), overflow: 'hidden' }}>
                    <div style={{ width: geo.w, transform: `scale(${frame.width / geo.w})`, transformOrigin: 'top left' }}>
                      <PreviewPage page={p} pages={pages} theme={theme} chapterContent={chapterContent} fieldContent={fieldContent} metadata={metadata} />
                    </div>
                  </div>
                ) : (
                  <PreviewPage page={p} pages={pages} theme={theme} chapterContent={chapterContent} fieldContent={fieldContent} metadata={metadata} />
                )}
                <PageNumberStrip settings={pageNumbers} index={chapterCountForNumbering(p.id)} edge="footer" />
              </div>
            ))}
          </div>
        </div>

        {/* Page-thumbnail rail — the exact filmstrip vocabulary the Pages panel uses
            in the main editor (scaled live PreviewPage render, corner number badge,
            blue outline on the active page), not a bespoke style of its own. */}
        <div className="flex-shrink-0 overflow-y-auto" style={{ width: 150, borderLeft: `1px solid ${BORDER}`, background: '#fff', padding: '16px 10px' }}>
          {pages.map((p, i) => {
            const active = p.id === activePreviewId;
            // The type label duplicated the title whenever they read the same
            // word (the cover's own title defaults to literally "Cover") — same
            // dedup the Pages panel already applies to this exact pairing.
            const showType = p.type.toLowerCase() !== p.title.trim().toLowerCase();
            return (
              <div key={p.id} style={{ marginBottom: 18 }}>
                <div
                  onClick={() => jumpToPreviewPage(p.id)}
                  className="cursor-pointer"
                  style={{
                    position: 'relative', borderRadius: RADIUS_MD, outlineOffset: 1,
                    // Was transparent when inactive — a real border so every
                    // thumbnail reads as its own card at rest, not just the
                    // selected one; the padding above grew by 2px each side so
                    // this outline has room to draw instead of being clipped by
                    // the rail's own scroll container.
                    // The shared ring's width and colour; it keeps the 1px
                    // offset (not RING_OFFSET) because it doubles as the card's
                    // own edge here, and pairs with a resting border rather
                    // than appearing out of nothing the way a canvas ring does.
                    outline: active ? RING : `1.5px solid ${BORDER}`,
                  }}
                >
                  <div style={{ width: railThumbW, height: railThumbH, overflow: 'hidden', borderRadius: 5 }}>
                    <div style={{ width: geo.w, height: geo.h, transform: `scale(${railThumbW / geo.w})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
                      <PreviewPage page={p} pages={pages} theme={theme} chapterContent={chapterContent} fieldContent={fieldContent} metadata={metadata} />
                    </div>
                  </div>
                  <div className="absolute flex items-center justify-center" style={{ bottom: 5, left: 5, minWidth: 17, height: 17, borderRadius: 4, background: 'rgba(15,23,51,0.55)', padding: '0 4px' }}>
                    <span style={{ ...ns, fontSize: 9.5, fontWeight: 700, color: '#fff' }}>{i + 1}</span>
                  </div>
                </div>
                <div style={{ ...ns, fontSize: 12, fontWeight: 600, color: INK, marginTop: 6 }}>{p.title}</div>
                {showType && <div style={{ ...ns, fontSize: 10, color: SLATE, textTransform: 'capitalize' }}>{p.type}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// "2 minutes ago" up to an hour, then a clock time — "Today at 3:14 PM" /
// "Yesterday at…" / a full date beyond that. Same graduated precision Figma,
// Google Docs and Notion's own history lists use, not a raw timestamp.
function relativeTimeLabel(ts: number): string {
  const now = Date.now();
  const diffMin = Math.round((now - ts) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const date = new Date(ts);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === new Date(now).toDateString()) return `Today at ${time}`;
  if (date.toDateString() === new Date(now - 86400000).toDateString()) return `Yesterday at ${time}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
}

/* Opened from the top bar into the left panel as an overlay view (panelOverlay) —
   not a rail tab, and not a separate full-screen route. It was the right rail's
   fourth tab until that rail was retired.
   Checked directly (not guessed) how Figma and
   Google Docs actually present this: both keep you IN the document — a side
   panel, with the canvas/page itself re-rendering to show whichever version
   is selected — rather than a "leaving the editor" takeover. This used to
   borrow PreviewOverlay's full-screen shape; now it's just a list, and
   selecting a row is what drives the canvas's read-only swap plus the banner
   above it (see viewingVersionId in the main render below). "Current version"
   is a pinned first row rather than one of `versions`, so there's always
   something selected. */
function HistoryPanel({
  versions, viewingVersionId, onSelectVersion,
}: {
  versions: VersionEntry[];
  viewingVersionId: string | null;
  onSelectVersion: (id: string | null) => void;
}) {
  return (
    <div style={{ padding: '16px 14px', overflowY: 'auto', height: '100%' }}>
      {/* No "Version history" eyebrow here — the overlay header that hosts this
          panel already names it, and two titles stacked read as a nesting that
          isn't there. */}
      <button
        onClick={() => onSelectVersion(null)}
        className="w-full text-left cursor-pointer"
        style={{ display: 'block', padding: '10px', borderRadius: RADIUS_MD, border: 'none', background: !viewingVersionId ? '#EEF3FF' : 'transparent', marginBottom: 2 }}
      >
        <div style={{ ...ns, fontSize: 13, fontWeight: 600, color: !viewingVersionId ? BLUE : INK }}>Current version</div>
        <div style={{ ...ns, fontSize: 11.5, color: SLATE }}>What you&apos;re editing now</div>
      </button>
      {versions.map((v) => {
        const active = v.id === viewingVersionId;
        return (
          <button
            key={v.id}
            onClick={() => onSelectVersion(v.id)}
            className="w-full text-left cursor-pointer"
            style={{ display: 'block', padding: '10px', borderRadius: RADIUS_MD, border: 'none', background: active ? '#EEF3FF' : 'transparent', marginBottom: 2 }}
          >
            <div style={{ ...ns, fontSize: 13, fontWeight: 600, color: active ? BLUE : INK }}>{relativeTimeLabel(v.savedAt)}</div>
            <div style={{ ...ns, fontSize: 11.5, color: SLATE }}>{new Date(v.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>
          </button>
        );
      })}
      {versions.length === 0 && (
        <div style={{ ...ns, fontSize: 12.5, color: SLATE, padding: '10px', lineHeight: 1.5 }}>
          No earlier checkpoints yet — they&apos;ll show up here once you&apos;ve made changes and paused for a bit.
        </div>
      )}
    </div>
  );
}

/* ── Pages panel — the visual page navigator, first tab of the left rail rather than the
   left: Designrr's live product puts its Navigator on the right, and the left-hand
   filmstrip this supersedes was pulled for crowding out the insert tools. Deliberately
   not a second Chapters panel — that one edits structure (reorder, delete, word
   counts) as a text list; this one is for finding a page by what it looks like, and
   so reuses the Preview overlay's thumbnail vocabulary (scaled live PreviewPage,
   corner number badge, blue outline on the active page). ── */
/* The icons a row's action bar is made of. DuplicateIcon and TrashIcon already
   exist (see presentationIcons.tsx); these three don't. */
function PlusIcon({ color = 'currentColor' }: { color?: string }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
}
function MoveTopIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14M12 20V8M7 13l5-5 5 5" /></svg>;
}
function MoveBottomIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 20h14M12 4v12M7 11l5 5 5-5" /></svg>;
}

/* A row's own actions, as a floating bar rather than a "···" menu. Duplicate and
   Delete live in a bar everywhere else in this editor — that's what
   FloatingObjectBar is on the canvas — so the page and chapter lists shouldn't be
   the one place they hide behind a menu: a click to open, a line to read and a
   second click, for what a named icon does in one aimed press.
   Revealed on hover/focus and absolutely positioned over the row, so at rest it
   still costs the row no width — which was the only thing the menu was buying
   (chapter titles truncating behind an inline icon cluster is what put those
   actions in a menu in the first place).
   A disabled action stays in place with its reason in the tooltip rather than
   vanishing, so the bar doesn't change shape from one row to the next. */
function RowActionBar({ items }: {
  items: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; hint?: string; danger?: boolean }[];
}) {
  return (
    <div
      className="flex items-center"
      /* The bar swallows the row's own press: every button here acts on the row,
         and a click that also jumped to the page — or began a reorder drag, since
         these rows are draggable — would fire two intents from one press. */
      onMouseDown={(e) => e.stopPropagation()}
      draggable={false}
      onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
      style={{ gap: 1, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, padding: 3, boxShadow: MENU_SHADOW, width: 'max-content' }}
    >
      {items.map((it) => {
        const color = it.disabled ? '#C3CBD6' : it.danger ? '#B91C1C' : INK;
        const button = (
          <button
            disabled={it.disabled}
            onClick={(e) => { e.stopPropagation(); it.onClick(); }}
            aria-label={it.label}
            className="flex items-center justify-center"
            style={{
              width: 26, height: 26, borderRadius: RADIUS_SM, border: 'none', background: 'none',
              color, flexShrink: 0, cursor: it.disabled ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = '#F5F6F8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            {it.icon}
          </button>
        );
        // The label is the tooltip — an icon bar carries no visible text, so the
        // action's name and (when it can't run) its reason share the one bubble.
        return <Tooltip key={it.label} label={it.disabled && it.hint ? it.hint : it.label} position="top">{button}</Tooltip>;
      })}
    </div>
  );
}

/* One column, not a grid — PowerPoint, Google Slides and Canva's own default
   rail all read a page list this way; Canva's grid only shows up as a
   separate, deliberately-entered "Grid view" for bulk reordering, not the
   everyday panel. A single wide column also means an actually-legible
   thumbnail instead of a 124px postage stamp. */
function PagesPanel({ pages, bookPages, theme, chapterContent, fieldContent, metadata, activePageId, onJump, onAddPageAt, onDuplicatePage, onDeletePage, onReorder }: {
  pages: PageMeta[];
  theme: ThemeDef;
  chapterContent: Record<string, string>;
  fieldContent: Record<string, string>;
  activePageId: string | null;
  onJump: (id: string) => void;
  // The book's real pages, one entry per sheet — a 20-page chapter contributes
  // 20 of these. See bookPages in BookEditorView.
  bookPages: { sectionId: string; indexInSection: number; sectionPages: number }[];
  onAddPageAt: (afterId: string) => void;
  metadata: BookMetadata;
  onDuplicatePage: (id: string) => void;
  onDeletePage: (id: string) => void;
  // Same reorderChapter ChaptersPanel already drives — the Pages tab was the
  // one place you couldn't reorder anything without switching tabs, which is
  // backwards: every thumbnail panel researched for this (PowerPoint, Google
  // Slides, Canva, Figma) treats dragging the thumbnail itself as *the*
  // primary way to reorder, more so than a plain text list.
  onReorder: (draggedId: string, targetId: string, pos: 'before' | 'after') => void;
}) {
  // Derived from the panel's own width and padding, not a fixed guess — a
  // narrower fixed number here left a wide dead strip of white between each
  // card and the panel's right edge (where the canvas begins), reading
  // as a stray gap between two panels that were actually flush.
  const geo = useContext(PageGeometryContext);
  const thumbW = INSPECTOR_W - 14 * 2;
  const thumbH = thumbW * (geo.h / geo.w);
  const chapterCount = pages.filter((p) => p.type === 'chapter').length;
  const lastChapterId = [...pages].reverse().find((p) => p.type === 'chapter')?.id;
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: 'before' | 'after' } | null>(null);

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <div style={{ padding: '16px 14px', flex: 1, overflowY: 'auto' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR }}>Pages</div>
          <div style={{ ...ns, fontSize: 11.5, color: SLATE }}>{bookPages.length} page{bookPages.length === 1 ? '' : 's'}</div>
        </div>
        <div className="flex flex-col" style={{ gap: 16 }}>
          {bookPages.map((bp, i) => {
            const p = pages.find((x) => x.id === bp.sectionId);
            if (!p) return null;
            /* Only a section's FIRST sheet carries its thumbnail and its row
               actions. Duplicating or deleting "page 3 of a chapter" would
               really mean doing it to the whole chapter, which is a different
               thing than the row claims — so continuation sheets are
               navigation only. */
            const isFirstOfSection = bp.indexInSection === 0;
            const active = p.id === activePageId && isFirstOfSection;
            const canDuplicate = p.type === 'chapter';
            const canDelete = p.type === 'chapter' && chapterCount > 1;
            const deleteHint =
              p.type === 'chapter' && chapterCount <= 1 ? 'The book needs at least one chapter'
              : p.type === 'toc' ? 'Turn the contents page off in Book settings'
              : p.type === 'cover' || p.type === 'backmatter' ? `Can't delete the ${p.type === 'cover' ? 'cover' : 'back matter'}`
              : undefined;
            // The cover page's title literally defaults to "Cover" — same word
            // as its type — so both lines read as an identical-looking pair.
            const showType = p.type.toLowerCase() !== p.title.trim().toLowerCase();
            // Fixed to the thumbnail's own width, not left to stretch across the
            // panel — a wider row than its thumbnail is what put the "···"
            // button (anchored to the row's corner) off in the dead space past
            // the thumbnail's actual right edge instead of on it.
            const isChapter = p.type === 'chapter' && isFirstOfSection;
            const isDragging = dragId === p.id;
            const showDropBefore = isChapter && dropTarget?.id === p.id && dropTarget.pos === 'before';
            const showDropAfter = isChapter && dropTarget?.id === p.id && dropTarget.pos === 'after';
            return (
              <div key={`${bp.sectionId}:${bp.indexInSection}`}>
                {showDropBefore && <div style={{ height: 2, background: BLUE, borderRadius: 1, width: thumbW, marginBottom: 14 }} />}
                <div
                  className="group"
                  // Only chapters move — cover, contents and back matter stay
                  // pinned, same constraint reorderChapter itself already
                  // enforces (see its own comment where it's declared).
                  draggable={isChapter}
                  onDragStart={(e) => {
                    if (!isChapter) return;
                    e.dataTransfer.setData('text/chapter-reorder', p.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragId(p.id);
                  }}
                  onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                  onDragOver={(e) => {
                    if (!isChapter || !dragId || dragId === p.id) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                    setDropTarget((prev) => (prev?.id === p.id && prev.pos === pos ? prev : { id: p.id, pos }));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!isChapter || !dragId || dragId === p.id || !dropTarget) return;
                    onReorder(dragId, p.id, dropTarget.pos);
                    setDragId(null);
                    setDropTarget(null);
                  }}
                  style={{ position: 'relative', width: thumbW, opacity: isDragging ? 0.4 : 1, cursor: isChapter ? 'grab' : 'default' }}
                >
                <button
                  onClick={() => onJump(p.id)}
                  className="text-left cursor-pointer"
                  style={{ width: '100%', border: 'none', background: 'none', padding: 0 }}
                >
                  {/* Width was implicit (block-level, so it stretched to the
                      button's full 100%) while the scaled preview inside stayed
                      thumbW wide — the gap between them showed as blank space
                      down the right edge, inside the outline. Pinned to the
                      content's actual size instead. */}
                  <div style={{ position: 'relative', width: thumbW, borderRadius: RADIUS_MD, outline: active ? RING : `1.5px solid ${BORDER}`, outlineOffset: 1 }}>
                    {/* p.bg first, like every other surface that paints a page:
                        the continuation-sheet fallback below draws straight onto
                        this box, so a page given its own colour would have shown
                        its later sheets on the template's instead. */}
                    <div style={{ width: thumbW, height: thumbH, overflow: 'hidden', borderRadius: 5, background: p.bg ?? theme.bg }}>
                      {isFirstOfSection ? (
                        <div style={{ width: geo.w, height: geo.h, transform: `scale(${thumbW / geo.w})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
                          <PreviewPage page={p} pages={pages} theme={theme} chapterContent={chapterContent} fieldContent={fieldContent} metadata={metadata} />
                        </div>
                      ) : (
                        /* A continuation sheet has no thumbnail yet: PreviewPage
                           renders a whole section unpaginated, so there's no
                           second page of it to scale down. Ruled lines rather
                           than an empty box — it still reads as a page of prose
                           at this size, without claiming to show the real text. */
                        <div className="flex flex-col justify-start" style={{ padding: '14px 12px', gap: 5 }}>
                          {Array.from({ length: 9 }, (_, k) => (
                            <div key={k} style={{ height: 3, borderRadius: 2, background: BORDER, width: k % 4 === 3 ? '62%' : '100%' }} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="absolute flex items-center justify-center" style={{ bottom: 6, left: 6, minWidth: 19, height: 19, borderRadius: 4, background: 'rgba(15,23,51,0.55)', padding: '0 4px' }}>
                      <span style={{ ...ns, fontSize: 10.5, fontWeight: 700, color: '#fff' }}>{i + 1}</span>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, minWidth: 0, maxWidth: thumbW }}>
                    <div style={{ ...ns, fontSize: 13, fontWeight: 600, color: active ? BLUE : INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                    {bp.sectionPages > 1 ? (
                      <div style={{ ...ns, fontSize: 11, color: SLATE }}>{bp.indexInSection + 1} of {bp.sectionPages}</div>
                    ) : showType ? (
                      <div style={{ ...ns, fontSize: 11, color: SLATE, textTransform: 'capitalize' }}>{p.type}</div>
                    ) : null}
                  </div>
                </button>

                {/* A sibling of the jump button, not a descendant of it — a button
                    inside a button is invalid HTML and browsers normalize the
                    nesting unpredictably. The wrapping div (not Tooltip's own —
                    Tooltip's trigger wrapper is itself `position:relative`, so
                    the bar was anchoring to *that* tiny inline box instead of
                    the row, landing wherever the wrapper's own place in normal
                    flow was: right after the row's text, i.e. between cards)
                    is what carries `position:absolute` here, anchored to the
                    row exactly where the thumbnail's own corner is — the
                    thumbnail is always the row's first, top element, so this
                    stays correctly placed regardless of how the title below
                    wraps. Hidden until hovered or focused — Canva's own
                    reveal-on-hover behavior for its per-page controls, so the
                    row reads clean at rest. */}
                <div
                  className="transition-opacity duration-100 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                  /* On every row, including a chapter's continuation sheets.
                     Duplicate and Delete there act on the whole section, which
                     is the only thing they can mean — you can't delete page 3
                     of a chapter and keep pages 1, 2 and 4. */
                  style={{ position: 'absolute', top: 6, right: 6 }}
                >
                  <RowActionBar
                    items={[
                      { label: 'Add page after', icon: <PlusIcon />, onClick: () => onAddPageAt(p.id) },
                      { label: 'Duplicate page', icon: <DuplicateIcon color="currentColor" />, onClick: () => onDuplicatePage(p.id), disabled: !canDuplicate, hint: 'Only chapter pages can be duplicated' },
                      { label: 'Delete page', icon: <TrashIcon color="currentColor" />, onClick: () => onDeletePage(p.id), disabled: !canDelete, hint: deleteHint, danger: true },
                    ]}
                  />
                </div>
                </div>
                {showDropAfter && <div style={{ height: 2, background: BLUE, borderRadius: 1, width: thumbW, marginTop: 14 }} />}
              </div>
            );
          })}
        </div>
      </div>
      {/* A plain, no-hover-required way to add one — the per-page menu above
          covers "insert relative to this page," this covers "just add one."
          No "add table of contents" here: a ToC isn't a page you decide to add,
          it's a view of the chapters, so it's switched on in Chapters. */}
      <div style={{ padding: '12px 14px', borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <FullButton label="+ Add page" onClick={() => onAddPageAt(lastChapterId ?? pages[pages.length - 1].id)} />
      </div>
    </div>
  );
}

/* ── Chapters panel — the book's structure list, promoted from a toolbar dropdown
   to its own rail tab, then relocated 2026-09-16 from the left insert-tools rail
   to the navigator group of the left rail (alongside Pages). External research (Vellum,
   Scrivener, PowerPoint/Keynote/Slides, Canva, Flipsnack) was unanimous: no real
   product ever makes page/chapter structure-navigation a tab that competes with
   insert tools (Text/Media/Elements-type panels) for the same rail slot — it
   always gets its own dedicated space, matching Designrr's own live product's
   right-side Navigator. Pages (thumbnails) and Chapters (this, a text list) are
   now sibling right-rail tabs — two views over the one page list, the way
   Scrivener switches Binder/Outline/Corkboard views over one manuscript
   structure — rather than Chapters duplicating Pages' job from the other rail.
   Same reorder/delete/jump controls as before, plus a direct "Add chapter"
   entry point since dragging a tile in from Insert is no longer how you do that. ── */
function ChaptersPanel({ pages, wordTotal, wordCounts, titleWordCounts, onJump, onMoveToEdge, onReorder, onDelete, onAddChapter }: {
  pages: PageMeta[];
  wordTotal: number;
  // Already tracked for the book total; writers work to the per-chapter number,
  // so it belongs on the row rather than only in the toolbar's sum.
  wordCounts: Record<string, number>;
  titleWordCounts: Record<string, number>;
  onJump: (id: string) => void;
  onMoveToEdge: (id: string, edge: 'top' | 'bottom') => void;
  onReorder: (draggedId: string, targetId: string, pos: 'before' | 'after') => void;
  onDelete: (id: string) => void;
  onAddChapter: () => void;
}) {
  const chapterCount = pages.filter((p) => p.type === 'chapter').length;
  // Position among chapters only (not the raw page index) — cover/toc sit before
  // the first chapter and back matter after the last, so "already at the edge"
  // has to be measured against other chapters, not neighboring page types.
  const chapterOrder = pages.filter((p) => p.type === 'chapter').map((p) => p.id);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: 'before' | 'after' } | null>(null);

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <div style={{ padding: '16px 14px', flex: 1, overflowY: 'auto' }}>
      {/* Stacked, not a justify-between row: at the navigator's width the count
          ("4 chapters · 447 words") wrapped and collided with the eyebrow. */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR }}>Chapters</div>
        <div style={{ ...ns, fontSize: 11.5, color: SLATE, marginTop: 2 }}>{chapterCount} chapter{chapterCount === 1 ? '' : 's'} · {wordTotal} words</div>
      </div>
      <div className="flex flex-col" style={{ gap: 2, marginBottom: 12 }}>
        {pages.map((p, i) => {
          const isChapter = p.type === 'chapter';
          const posAmongChapters = isChapter ? chapterOrder.indexOf(p.id) : -1;
          const canMoveToTop = isChapter && posAmongChapters > 0;
          const canMoveToBottom = isChapter && posAmongChapters < chapterOrder.length - 1;
          const isDragging = dragId === p.id;
          const showDropBefore = isChapter && dropTarget?.id === p.id && dropTarget.pos === 'before';
          const showDropAfter = isChapter && dropTarget?.id === p.id && dropTarget.pos === 'after';
          return (
            <div key={p.id}>
              {showDropBefore && <div style={{ height: 2, background: BLUE, borderRadius: 1, margin: '0 6px' }} />}
              <div
                className="group flex items-center"
                draggable={isChapter}
                onDragStart={(e) => {
                  if (!isChapter) return;
                  e.dataTransfer.setData('text/chapter-reorder', p.id);
                  e.dataTransfer.effectAllowed = 'move';
                  setDragId(p.id);
                }}
                onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                onDragOver={(e) => {
                  if (!isChapter || !dragId || dragId === p.id) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                  setDropTarget((prev) => (prev?.id === p.id && prev.pos === pos ? prev : { id: p.id, pos }));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!isChapter || !dragId || dragId === p.id || !dropTarget) return;
                  onReorder(dragId, p.id, dropTarget.pos);
                  setDragId(null);
                  setDropTarget(null);
                }}
                // relative so the hover action bar can overlay the row's right
                // edge instead of taking a column of its width.
                style={{ position: 'relative', gap: 2, padding: 2, borderRadius: RADIUS_SM, opacity: isDragging ? 0.4 : 1 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F7F8FA'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
              >
                {/* Drag handle — a visible affordance rather than making the whole
                    row silently draggable, matching how Reedsy Studio marks its
                    chapter rows (a dedicated handle icon, not an implicit drag). */}
                {isChapter ? (
                  <div className="flex items-center justify-center flex-shrink-0" style={{ width: 18, height: 28, cursor: 'grab', color: '#C3CBD6' }} title="Drag to reorder">
                    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2.5" cy="2.5" r="1.5" /><circle cx="7.5" cy="2.5" r="1.5" /><circle cx="2.5" cy="8" r="1.5" /><circle cx="7.5" cy="8" r="1.5" /><circle cx="2.5" cy="13.5" r="1.5" /><circle cx="7.5" cy="13.5" r="1.5" /></svg>
                  </div>
                ) : (
                  <div style={{ width: 18, flexShrink: 0 }} />
                )}
                <button
                  onClick={() => onJump(p.id)}
                  className="flex-1 text-left cursor-pointer"
                  style={{ minWidth: 0, background: 'none', border: 'none', padding: '4px 6px', borderRadius: 5 }}
                >
                  {/* Was single-line + ellipsis — chapter rows also carry the
                      move/delete icon cluster non-chapter rows don't, so they had
                      noticeably less width for the same title, and truncated real
                      chapter titles ("The Weight of Everything" → "The Weight …")
                      well before the panel's own width would justify it. Two lines
                      before any clamp gives real titles room without letting a
                      pathological one blow out the row indefinitely. */}
                  <div style={{ ...ns, fontSize: 13, fontWeight: 600, color: INK, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i + 1}. {p.title}</div>
                  <div style={{ ...ns, fontSize: 10.5, color: SLATE, textTransform: 'capitalize' }}>
                    {p.type}
                    {isChapter && <span style={{ textTransform: 'none' }}> · {(wordCounts[p.id] ?? 0) + (titleWordCounts[p.id] ?? 0)} words</span>}
                  </div>
                </button>
                {/* Overlaid on the row's right edge, not laid out beside the
                    title — an inline icon cluster is what cost chapter names
                    most of the row ("The Weight of Everything" → "The Weight …")
                    while the panel still had room. Absolute + reveal-on-hover
                    keeps the title's full width at rest and still puts every
                    action one click away, which the menu didn't. */}
                {isChapter && (
                  <div
                    className="transition-opacity duration-100 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    style={{ position: 'absolute', top: '50%', right: 2, transform: 'translateY(-50%)' }}
                  >
                    <RowActionBar
                      items={[
                        { label: 'Move to top', icon: <MoveTopIcon />, onClick: () => onMoveToEdge(p.id, 'top'), disabled: !canMoveToTop, hint: 'Already the first chapter' },
                        { label: 'Move to bottom', icon: <MoveBottomIcon />, onClick: () => onMoveToEdge(p.id, 'bottom'), disabled: !canMoveToBottom, hint: 'Already the last chapter' },
                        {
                          label: 'Delete chapter',
                          icon: <TrashIcon color="currentColor" />,
                          // Deleting offers an undo toast instead of a confirm dialog:
                          // a reversible action asked about up front is worse than one
                          // you can simply take back (Gmail/Linear/Notion all landed here).
                          onClick: () => onDelete(p.id),
                          disabled: chapterCount <= 1,
                          danger: true,
                          hint: 'The book needs at least one chapter',
                        },
                      ]}
                    />
                  </div>
                )}
                {/* TOC is optional, not a retailer requirement — the real EPUB nav
                    document is generated separately regardless of this visible page
                    (see addTocPage) — so it gets a plain delete, no reorder controls
                    since its position is fixed right after the cover. */}
                {p.type === 'toc' && (
                  <div
                    className="transition-opacity duration-100 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    style={{ position: 'absolute', top: '50%', right: 2, transform: 'translateY(-50%)' }}
                  >
                    <RowActionBar items={[{ label: 'Remove table of contents', icon: <TrashIcon color="currentColor" />, onClick: () => onDelete(p.id), danger: true }]} />
                  </div>
                )}
              </div>
              {showDropAfter && <div style={{ height: 2, background: BLUE, borderRadius: 1, margin: '0 6px' }} />}
            </div>
          );
        })}
      </div>
      </div>
      {/* Pinned to the bottom like the Pages tab's "+ Add page" — it used to sit
          below the list, so on a book with more chapters than fit you had to
          scroll to the end to reach it. Same border-topped footer so the two
          navigator tabs read as one component with one affordance in one place. */}
      <div style={{ padding: '12px 14px', borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <FullButton label="+ Add chapter" onClick={onAddChapter} />
      </div>
    </div>
  );
}

/* Reports what the local snapshot is actually doing. "Unsaved" is deliberately
   quiet rather than alarming — it's the normal state between a keystroke and the
   debounce firing; only a failed write is worth colour. */
function SaveIndicator({ state }: { state: SaveState }) {
  const look = state === 'saved'
    ? { color: '#29A341', label: 'Saved' }
    : state === 'saving'
      ? { color: SLATE, label: 'Saving…' }
      : state === 'error'
        ? { color: '#B91C1C', label: 'Not saved — storage full' }
        : { color: SLATE, label: 'Unsaved changes' };
  return (
    <div className="flex items-center" style={{ gap: 5 }} title={state === 'error' ? 'This book is kept in your browser. Clearing site data or a full quota will lose it.' : undefined}>
      {state === 'saved' ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={look.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      ) : state === 'error' ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={look.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></svg>
      ) : (
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: look.color, opacity: 0.55 }} />
      )}
      <span style={{ ...ns, fontSize: 13, color: look.color, fontWeight: 500 }}>{look.label}</span>
    </div>
  );
}

/* The way back from a structural change. TipTap's history covers prose inside one
   chapter, so delete/reorder/split/template each offer their own undo here rather
   than silently falling outside every stack. */
function UndoToast({ label, onUndo, onDismiss }: { label: string; onUndo: () => void; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 9000);
    return () => clearTimeout(t);
  }, [onDismiss, label]);
  return (
    <div
      role="status"
      className="flex items-center"
      style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 28, zIndex: 400,
        gap: 14, padding: '11px 12px 11px 18px', borderRadius: RADIUS_PILL,
        background: INK, boxShadow: '0px 10px 30px rgba(15,23,51,0.28)',
      }}
    >
      <span style={{ ...ns, fontSize: 13, fontWeight: 500, color: '#fff' }}>{label}</span>
      <button
        onClick={onUndo}
        className="cursor-pointer"
        style={{ ...ns, fontSize: 13, fontWeight: 700, color: '#7FB5FF', background: 'none', border: 'none', padding: '2px 6px' }}
      >
        Undo
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="cursor-pointer flex items-center justify-center"
        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', width: 22, height: 22 }}
      >
        <Icon d="M14 4L4 14M4 4l10 10" size={13} />
      </button>
    </div>
  );
}

/* ── persistence ─────────────────────────────────────────────────────────────
   The book used to live only in component state with a hardcoded green "Saved"
   label above it, so a refresh or the Back button three inches away discarded
   everything. This is a local snapshot, not a backend — but it makes the save
   indicator tell the truth, which is the part that matters. */
const STORAGE_KEY = 'designrr.book.editor.v1';

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

interface PersistedBook {
  version: 1;
  pages: PageMeta[];
  metadata: BookMetadata;
  pageNumbers: PageNumberSettings;
  activeTheme: ThemeId;
  chapterContent: Record<string, string>;
  fieldContent: Record<string, string>;
  spellcheck: boolean;
  paragraphStyle?: ParagraphStyle;
  savedAt: number;
}

function loadBook(): PersistedBook | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedBook;
    if (parsed?.version !== 1 || !Array.isArray(parsed.pages) || parsed.pages.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* ── version history ──────────────────────────────────────────────────────────
   A longer-lived sibling to the structural-undo Snapshot below: checkpoints a
   user can browse and restore from later — minutes or days later — not just
   the single most recent action. Kept under its own localStorage key so a
   quota failure here (the 5MB ceiling above is real, and embedded images
   reach it fast) never threatens the primary book save. Newest-first; depth
   is tier-gated Figma-style (free/Standard = 30 days, paid = unlimited, both
   still capped for worst-case storage size — see pruneVersions).

   Cadence follows Google Docs' own principle rather than a fixed clock
   (Figma's flat 30-minute timer, confirmed directly by Figma support, was the
   alternative — rejected because it's tuned for design work, where large gaps
   between meaningful states are normal; a writing tool's meaningful unit is a
   burst of typing, not an arbitrary interval): a checkpoint forms once you've
   *paused* after making changes — VERSION_IDLE_MS of inactivity — so one
   burst of writing becomes one entry instead of a checkpoint landing
   mid-sentence. VERSION_MAX_ACTIVE_MS is a ceiling under that: if you never
   pause (one long, continuous writing session), a checkpoint still fires
   rather than the session going unrecorded until you eventually stop. */
const VERSIONS_STORAGE_KEY = `${STORAGE_KEY}.versions`;
// Shortened for now so the feature is actually observable in a test session —
// widen both toward real "you paused" / "one long sitting" lengths (a couple
// of minutes / ten-plus minutes) once this is past testing.
const VERSION_IDLE_MS = 45_000;
const VERSION_MAX_ACTIVE_MS = 5 * 60_000;
const STANDARD_HISTORY_DAYS = 30;
const STANDARD_HISTORY_CAP = 30;
const UNLIMITED_HISTORY_CAP = 100; // "unlimited" still needs a practical storage ceiling

interface VersionEntry {
  id: string;
  savedAt: number;
  pages: PageMeta[];
  chapterContent: Record<string, string>;
  fieldContent: Record<string, string>;
  activeTheme: ThemeId;
}

function loadVersions(): VersionEntry[] {
  try {
    const raw = window.localStorage.getItem(VERSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as VersionEntry[] : [];
  } catch {
    return [];
  }
}

// `entries` is newest-first. Standard plans never even keep anything older
// than the cutoff — there's nothing further to lock/gray out in the UI,
// every entry a Standard user sees is already one they're entitled to.
function pruneVersions(entries: VersionEntry[], hasProAccess: boolean): VersionEntry[] {
  const cutoff = hasProAccess ? 0 : Date.now() - STANDARD_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const cap = hasProAccess ? UNLIMITED_HISTORY_CAP : STANDARD_HISTORY_CAP;
  return entries.filter((v) => v.savedAt >= cutoff).slice(0, cap);
}

/* ── structural history ──────────────────────────────────────────────────────
   TipTap's undo stack covers prose inside one chapter and nothing else, so
   deleting a chapter, reordering, splitting or swapping a template were all
   permanent. Rather than fight the text history for ⌘Z, each structural action
   offers its own explicit undo — the pattern Gmail, Notion and Linear all use,
   and unambiguous in a way a shared stack wouldn't be.

   `touched` names chapters whose still-mounted editor has to be reloaded from
   the snapshot (only Split mutates a live editor's content in place); every
   other action is restored by putting `pages` back. */
interface Snapshot {
  pages: PageMeta[];
  chapterContent: Record<string, string>;
  fieldContent: Record<string, string>;
  activeTheme: ThemeId;
  touched: string[];
}

/* ── find & replace ──────────────────────────────────────────────────────────
   Matching runs per text node, so a phrase split across a formatting boundary
   ("**the** end") isn't found — the same limitation Google Docs and Word's own
   in-browser editors carry, and the alternative (mapping flattened offsets back
   through the document) costs far more than it returns here. */
interface FindMatch { key: string; label: string; from: number; to: number; context: string }

function matchesInEditor(
  editor: Editor, key: string, label: string, query: string, caseSensitive: boolean, wholeWord: boolean,
): FindMatch[] {
  const out: FindMatch[] = [];
  if (!query) return out;
  const needle = caseSensitive ? query : query.toLowerCase();
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    const hay = caseSensitive ? text : text.toLowerCase();
    let idx = hay.indexOf(needle);
    while (idx !== -1) {
      const before = text[idx - 1];
      const after = text[idx + needle.length];
      const boundaryOk = !wholeWord
        || ((before === undefined || !/[\w]/.test(before)) && (after === undefined || !/[\w]/.test(after)));
      if (boundaryOk) {
        out.push({
          key,
          label,
          from: pos + idx,
          to: pos + idx + query.length,
          context: `${text.slice(Math.max(0, idx - 24), idx)}⟦${text.slice(idx, idx + query.length)}⟧${text.slice(idx + query.length, idx + query.length + 24)}`,
        });
      }
      idx = hay.indexOf(needle, idx + Math.max(1, needle.length));
    }
  });
  return out;
}

/* ── Find & replace ──────────────────────────────────────────────────────────
   Nothing in this editor could search the manuscript: every chapter is its own
   isolated ProseMirror instance, so "where did I use that phrase" had no answer
   at all past about two chapters. It lives beside the chapter list as the
   navigator's second tab, which is where the build plan's D4 put search.

   Positions are never trusted across an edit — a result carries the key of the
   editor it came from plus its ordinal within that editor, and both jumping and
   replacing re-resolve from the live document before touching anything. */
function FindPanel({ registry, pages, onJump, inputRef }: {
  registry: React.MutableRefObject<Map<string, RegisteredEditor>>;
  pages: PageMeta[];
  onJump: (pageId: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  // Document order, so results read top-to-bottom the way the book does: a
  // chapter's title field before its body, pages in their canvas order.
  const rankOf = useCallback((key: string) => {
    const [pageId, field] = key.split('::');
    const idx = pages.findIndex((p) => p.id === pageId);
    const within = field === 'title' ? 0 : field === undefined ? 1 : 2;
    return (idx < 0 ? pages.length : idx) * 10 + within;
  }, [pages]);

  const results = useMemo(() => {
    void nonce;
    const q = query.trim();
    if (!q) return [] as (FindMatch & { ordinal: number })[];
    const out: (FindMatch & { ordinal: number })[] = [];
    for (const [key, entry] of registry.current) {
      const label = pages.find((p) => p.id === key.split('::')[0])?.title ?? 'Cover';
      const found = matchesInEditor(entry.editor, key, label, q, caseSensitive, wholeWord);
      found.forEach((m, ordinal) => out.push({ ...m, ordinal }));
    }
    return out.sort((a, b) => (rankOf(a.key) - rankOf(b.key)) || (a.from - b.from));
  }, [query, caseSensitive, wholeWord, nonce, registry, pages, rankOf]);

  // The active result resets whenever the search itself changes — adjusted
  // during render, matching LinkField's pattern above, rather than in an effect.
  const [searchKey, setSearchKey] = useState('');
  const nextSearchKey = `${query}\u0000${caseSensitive}\u0000${wholeWord}`;
  if (nextSearchKey !== searchKey) {
    setSearchKey(nextSearchKey);
    setActiveIndex(0);
  }

  const resolve = useCallback((r: FindMatch & { ordinal: number }) => {
    const entry = registry.current.get(r.key);
    if (!entry) return null;
    const fresh = matchesInEditor(entry.editor, r.key, r.label, query.trim(), caseSensitive, wholeWord);
    const match = fresh[r.ordinal];
    return match ? { entry, match } : null;
  }, [registry, query, caseSensitive, wholeWord]);

  const goTo = useCallback((index: number) => {
    const r = results[index];
    if (!r) return;
    const resolved = resolve(r);
    if (!resolved) { refresh(); return; }
    setActiveIndex(index);
    onJump(r.key.split('::')[0]);
    resolved.entry.editor.chain().focus().setTextSelection({ from: resolved.match.from, to: resolved.match.to }).scrollIntoView().run();
  }, [results, resolve, onJump, refresh]);

  const step = (delta: number) => {
    if (results.length === 0) return;
    goTo((activeIndex + delta + results.length) % results.length);
  };

  const applyAt = (from: number, to: number, entry: RegisteredEditor) => {
    entry.editor.chain().focus().command(({ tr }) => {
      if (replacement) tr.insertText(replacement, from, to);
      else tr.delete(from, to);
      return true;
    }).run();
  };

  const replaceOne = () => {
    const r = results[activeIndex];
    if (!r) return;
    const resolved = resolve(r);
    if (!resolved) { refresh(); return; }
    onJump(r.key.split('::')[0]);
    applyAt(resolved.match.from, resolved.match.to, resolved.entry);
    refresh();
  };

  const replaceAll = () => {
    const q = query.trim();
    if (!q) return;
    for (const [key, entry] of registry.current) {
      const found = matchesInEditor(entry.editor, key, '', q, caseSensitive, wholeWord);
      if (found.length === 0) continue;
      // Applied last-match-first in one transaction, so earlier positions stay
      // valid while the document shifts underneath them.
      const tr = entry.editor.state.tr;
      for (let i = found.length - 1; i >= 0; i--) {
        if (replacement) tr.insertText(replacement, found[i].from, found[i].to);
        else tr.delete(found[i].from, found[i].to);
      }
      entry.editor.view.dispatch(tr);
    }
    refresh();
  };

  const fieldStyle: React.CSSProperties = {
    ...ns, width: '100%', fontSize: 13, padding: '8px 10px',
    border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD,
  };

  const optionChip = (label: string, title: string, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className="cursor-pointer"
      style={{
        ...ns, fontSize: 11.5, fontWeight: 700, padding: '4px 9px', borderRadius: RADIUS_SM,
        border: `1px solid ${active ? BLUE : BORDER}`,
        background: active ? '#EEF3FF' : '#fff',
        color: active ? BLUE : SLATE,
      }}
    >
      {label}
    </button>
  );

  const grouped: { label: string; rows: (FindMatch & { ordinal: number; index: number })[] }[] = [];
  results.forEach((r, index) => {
    const last = grouped[grouped.length - 1];
    if (last && last.label === r.label) last.rows.push({ ...r, index });
    else grouped.push({ label: r.label, rows: [{ ...r, index }] });
  });

  return (
    <div style={{ padding: '16px 14px', overflowY: 'auto', height: '100%' }}>
      <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, marginBottom: 10 }}>Find &amp; replace</div>

      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
        }}
        placeholder="Find in book"
        style={fieldStyle}
      />
      <div style={{ height: 8 }} />
      <input
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
        placeholder="Replace with"
        style={fieldStyle}
      />

      <div className="flex items-center" style={{ gap: 6, marginTop: 10 }}>
        {optionChip('Aa', 'Match case', caseSensitive, () => setCaseSensitive((v) => !v))}
        {optionChip('Ab|', 'Whole words only', wholeWord, () => setWholeWord((v) => !v))}
      </div>

      <div className="flex items-center justify-between" style={{ marginTop: 12, gap: 8 }}>
        <span style={{ ...ns, fontSize: 12, color: SLATE }}>
          {query.trim() === ''
            ? 'Searches every chapter'
            : results.length === 0
              ? 'No matches'
              : `${activeIndex + 1} of ${results.length}`}
        </span>
        <div className="flex items-center" style={{ gap: 2 }}>
          <button onClick={() => step(-1)} disabled={results.length === 0} aria-label="Previous match" className="cursor-pointer flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: RADIUS_SM, border: `1px solid ${BORDER}`, background: '#fff', opacity: results.length ? 1 : 0.4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
          </button>
          <button onClick={() => step(1)} disabled={results.length === 0} aria-label="Next match" className="cursor-pointer flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: RADIUS_SM, border: `1px solid ${BORDER}`, background: '#fff', opacity: results.length ? 1 : 0.4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </div>
      </div>

      <div className="flex" style={{ gap: 8, marginTop: 10 }}>
        <button
          onClick={replaceOne}
          disabled={results.length === 0}
          className="flex-1 cursor-pointer"
          style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: INK, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, padding: '8px 6px', opacity: results.length ? 1 : 0.45 }}
        >
          Replace
        </button>
        <button
          onClick={replaceAll}
          disabled={results.length === 0}
          className="flex-1 cursor-pointer"
          style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: '#fff', background: BLUE, border: 'none', borderRadius: RADIUS_MD, padding: '8px 6px', opacity: results.length ? 1 : 0.45 }}
        >
          Replace all
        </button>
      </div>

      <div className="flex flex-col" style={{ gap: 12, marginTop: 16 }}>
        {grouped.map((group) => (
          <div key={`${group.label}-${group.rows[0].index}`}>
            <div style={{ ...ns, fontSize: 11, fontWeight: 700, color: SLATE, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {group.label} <span style={{ fontWeight: 400, color: EYEBROW_COLOR }}>· {group.rows.length}</span>
            </div>
            <div className="flex flex-col" style={{ gap: 2 }}>
              {group.rows.map((row) => {
                const [before, rest] = row.context.split('⟦');
                const [hit, after] = (rest ?? '').split('⟧');
                const active = row.index === activeIndex;
                return (
                  <button
                    key={`${row.key}-${row.ordinal}`}
                    onClick={() => goTo(row.index)}
                    className="text-left cursor-pointer"
                    style={{
                      ...ns, fontSize: 12, lineHeight: 1.45, color: SLATE, padding: '6px 8px',
                      borderRadius: RADIUS_SM, border: 'none',
                      background: active ? '#EEF3FF' : 'transparent',
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#F7F8FA'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ opacity: 0.75 }}>…{before}</span>
                    <mark style={{ background: '#FDF08A', color: INK, fontWeight: 700, borderRadius: 2 }}>{hit}</mark>
                    <span style={{ opacity: 0.75 }}>{after}…</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── main view ────────────────────────────────────────────────────────────── */
export function BookEditorView() {
  const currentPlan = useFlowStore((s) => s.currentPlan);
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);

  const [pages, setPages] = useState<PageMeta[]>(INITIAL_PAGES);
  /* LEFT = what you can add, and what the selected thing is. RIGHT = what the book
     contains, and how to move around it. That's the split the competitor analysis
     found in every canvas editor ("left = sources, right = structure"); the one
     thing we deliberately don't copy is putting *properties* on the right, which
     no document-shaped product does either. */
  const [railTab, setRailTab] = useState<
    'text' | 'photos' | 'elements' | 'layouts' | 'templates' | 'booksettings'
  >('templates');
  /* Properties takes over the left panel rather than being a rail tab of its own —
     it has no fixed content, so a permanent tab would spend rail space on something
     that's empty most of the time. Opening any rail tab clears it. */
  const [panelOverlay, setPanelOverlay] = useState<'properties' | null>(null);
  /* Crop is a mode, not a property — non-null means the panel shows CropPanel and
     the canvas shows CropOverlay, until Apply or Cancel. Held here rather than in
     ImageInspector because the on-canvas overlay is a sibling of the canvas, not
     of the panel. */
  /* Crop applies to either kind of image now — a node in a chapter or an element
     on the cover. The spec, the drag overlay and the canvas re-encode are
     identical for both; only where the result is written differs, so the session
     carries its target instead of assuming the chapter editor. */
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null);
  const [cropSpec, setCropSpec] = useState<CropSpec | null>(null);
  const [cropAspect, setCropAspect] = useState('free');
  const [cropBusy, setCropBusy] = useState(false);
  const [cropError, setCropError] = useState('');
  const cropImgRef = useRef<HTMLElement | null>(null);
  /* Right panel: two permanent navigator tabs, plus History and Find, which the top
     bar opens over them with a back arrow. Those two are document-scoped and reached
     occasionally, so they don't earn permanent rail slots — but they're navigation,
     not authoring, so this is the side they belong on. History in particular wants a
     panel rather than a dropdown: selecting a version re-renders the canvas
     read-only, which a menu can't carry (see HistoryPanel). */
  const [rightTab, setRightTab] = useState<'pages' | 'chapters'>('pages');
  const [rightOpen, setRightOpen] = useState(true);
  const [rightOverlay, setRightOverlay] = useState<'history' | 'find' | null>(null);
  /* Which page the Pages panel's grid highlights and the +/duplicate/delete bar
     acts on. Can't reuse `selection` for this directly — jumping to a page from
     the grid only scrolls the canvas (selecting it outright would immediately
     flip the panel back to Properties, see the selectionKey effect below,
     defeating the point of browsing pages while staying in Pages mode). Cleared
     whenever the real canvas selection moves to a different page, so Pages mode
     re-syncs the next time it's opened instead of a stale click lingering. */
  const [pagesActiveId, setPagesActiveId] = useState<string | null>(null);
  // Wordgenie panel — same mocked pattern as Presentation's in-editor chat
  // (canned reply, no real model call): a slide-in panel between the left
  // rail's content panel and the canvas, not a route-level flow like the
  // book's own creation wizard. Scoped to whichever chapter is active, the
  // book's equivalent of Presentation's "for this slide."
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  // Below this, the app sidebar + both editor rails + both editor panels leave
  // less than ~300px for a 720px page even with nothing else competing for
  // room — the same starvation Wordgenie caused, just from ordinary window
  // width instead. 1280 is picked so every width at or above it (1280/1366/
  // 1440/1536/1920 — the common real laptop/desktop resolutions) is left
  // alone; only genuinely cramped windows (a smaller external monitor, a
  // tiled/half-split window, an old 1024×768 display) trigger it.
  const [narrowViewport, setNarrowViewport] = useState(false);
  useEffect(() => {
    const update = () => setNarrowViewport(window.innerWidth < 1280);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  // Auto-collapsing for width alone (unlike Wordgenie, which is a deliberate
  // mode the user just entered) risks reading as broken the first time someone
  // on a narrower screen clicks Text/Media/Elements and nothing happens — this
  // is the escape hatch: clicking the rail re-expands the panel on demand, and
  // clicking the already-active tab collapses it again, same toggle convention
  // the left rail already uses for Pages/Chapters.
  const [panelForcedOpen, setPanelForcedOpen] = useState(false);
  useEffect(() => { if (!narrowViewport) setPanelForcedOpen(false); }, [narrowViewport]);
  // pills mirrors Presentation's own aiMessages shape — quick-reply chips under
  // an AI message, same as its "notes for every slide" flow offers there. Ours
  // just needs one entry point (the welcome message) rather than a whole
  // second intent system, since there's no book-editor equivalent of that job.
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'ai'; text: string; pills?: string[] }[]>([
    {
      role: 'ai',
      text: 'Ask me to rewrite a paragraph, change the tone, or draft new content for the current chapter.',
      pills: ['Rewrite this paragraph', 'Fix grammar', 'Make it more concise', 'Suggest a title'],
    },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [draggedTile, setDraggedTile] = useState<string | null>(null);
  // Set while the Media tab is showing the source picker (Image/Video/Audio
  // clicked, not yet placed) instead of the tile grid — `picked` holds whatever
  // the picker has sourced so far, drag/click-ready but not in the book yet.
  const [mediaPicker, setMediaPicker] = useState<{ kind: MediaPickerKind; picked: { src: string; label: string } | null } | null>(null);
  /* Which Elements category is open. null is the index. Video and Audio aren't in
     here — they're rows that open `mediaPicker` instead, because their "category
     page" would hold one tile. */
  const [elementsCat, setElementsCat] = useState<ElementsCategory | null>(null);
  // Which chapter's Editor a handle-drag started from, so the chapter it's
  // dropped on (possibly a different one) can read the node back off it.
  const moveDragRef = useRef<{ chapterId: string; editor: Editor } | null>(null);
  const [movingBlock, setMovingBlock] = useState(false);
  const [activeTheme, setActiveTheme] = useState<ThemeId>('statement-lettering');
  // Defaults to the cover rather than nothing, so the inspector opens already
  // showing something relevant instead of an empty "select something" placeholder.
  const [selection, setSelection] = useState<Selection>({ kind: 'page', pageId: 'p-cover' });
  /* An unset opener/back-matter photo has nothing to click yet — there's no
     inspector for it, so its whole affordance is "add a photo" and jumping to the
     Photos tab IS the action, not a side effect.

     A regular inline image used to get the same jump, on the theory that focusing
     one usually means "I want to swap this photo." That was free when Properties
     lived in a second panel on the right: you saw the inspector AND the picker at
     once. With one panel it isn't — Properties covers the panel, so the jump just
     silently rewrote the tab underneath, and deselecting dropped you on Photos
     instead of the Pages/Chapters view you actually left. ImageInspector's own
     "Go to Media" link is the deliberate route, and it still works. */
  const handleSelection = useCallback((sel: Selection) => {
    setSelection(sel);
    if (sel.kind === 'openerImage' || sel.kind === 'backmatterAvatar') setRailTab('photos');
  }, []);
  const [wordCounts, setWordCounts] = useState<Record<string, number>>({});
  // Body word counts and title word counts separately, since they're two different
  // fields/editors now — summed together wherever a total is shown.
  const [titleWordCounts, setTitleWordCounts] = useState<Record<string, number>>({});
  const [metadata, setMetadata] = useState<BookMetadata>(DEFAULT_METADATA);
  const [pageNumbers, setPageNumbers] = useState<PageNumberSettings>(DEFAULT_PAGE_NUMBERS);
  const [upgradeCtx, setUpgradeCtx] = useState<{ message: string; feature: string } | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [altStatus, setAltStatus] = useState<Record<string, number>>({});
  const missingAlt = Object.values(altStatus).reduce((sum, n) => sum + n, 0);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  // Which chapter the active editor belongs to — null when a cover/TOC field has focus,
  // which is what gates the Split control (you can't split a one-line title field).
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [zoomOpen, setZoomOpen] = useState(false);
  const zoomMenuRef = useRef<HTMLDivElement | null>(null);
  // Live content, captured off each editor's onUpdate — the `pages` array only ever holds the
  // seed HTML a chapter/field was created with, so Preview needs this to reflect real edits.
  const [chapterContent, setChapterContent] = useState<Record<string, string>>({});
  /* How many sheets each chapter measured out to, reported up by its Pagination
     extension. Lives here rather than in the chapter because the page number on
     any sheet depends on how long every chapter before it turned out to be. */
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});
  /* Stable identity, and a no-op when the count hasn't moved: this fires from a
     layout effect in every chapter on every reflow, and an unconditional
     setState there re-renders the whole book on each keystroke. */
  const handlePageCountChange = useCallback((id: string, n: number) => {
    setPageCounts((prev) => (prev[id] === n ? prev : { ...prev, [id]: n }));
  }, []);
  const [fieldContent, setFieldContent] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  // FloatingBarPortal (the cover's duplicate/delete pill) portals straight to
  // document.body at zIndex 200 — the same value these full-screen overlays use
  // — so whichever one mounts later in the DOM wins the tie and the pill can
  // render on top of Publish/Preview's own content. Hiding it whenever either
  // is open is simpler and safer than trying to out-rank two modals whose own
  // z-index this component doesn't control.
  const anyOverlayOpen = showPublishModal || showPreview;
  /* Browser spell-check was never turned on or off explicitly, so every editing
     surface silently inherited whatever the browser defaulted to. It's a real
     setting now (Book settings → Document), defaulting on. */
  const [spellcheck, setSpellcheck] = useState(true);
  const [paragraphStyle, setParagraphStyle] = useState<ParagraphStyle>('spaced');
  /* Trim size and margins. Held as the SETTING (a size id and two inch values)
     rather than as the pixel box, because that's what the panel edits and what
     a saved book would store; the box is derived. */
  const [pageSizeId, setPageSizeId] = useState(DEFAULT_PAGE_SIZE);
  const [marginX, setMarginX] = useState(DEFAULT_MARGIN_X);
  const [marginY, setMarginY] = useState(DEFAULT_MARGIN_Y);
  const geometry = useMemo(() => pageGeometry(pageSizeId, marginX, marginY), [pageSizeId, marginX, marginY]);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [hydrated, setHydrated] = useState(false);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  // Which checkpoint the canvas is currently rendering read-only — null means
  // "current version," i.e. the live, editable book. Drives both the History
  // panel's selection and the canvas/banner swap in the main render below.
  const [viewingVersionId, setViewingVersionId] = useState<string | null>(null);
  const hasProAccess = ownsPlan(currentPlan, 'pro');
  const lastVersionSavedAtRef = useRef(0);
  const [undoToast, setUndoToast] = useState<{ label: string; snapshot: Snapshot } | null>(null);
  // (Find is no longer a sub-tab of Chapters — it opens over the right panel from
  // the top bar, so there's no Chapters/Find toggle state to hold any more.)
  const findInputRef = useRef<HTMLInputElement | null>(null);

  const pageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  /* Every mounted editor, by key — chapter bodies under their chapter id, every
     other field under its own "pageId::field" key. Find & replace needs to reach
     all of them at once, and a structural undo needs to push content back into
     whichever ones the undone action actually touched. */
  const editorRegistry = useRef<Map<string, RegisteredEditor>>(new Map());
  const registerEditor = useCallback((key: string, editor: Editor, kind: RegisteredEditor['kind']) => {
    editorRegistry.current.set(key, { key, editor, kind });
    return () => { editorRegistry.current.delete(key); };
  }, []);

  const theme = THEMES.find((t) => t.id === activeTheme) ?? THEMES[0];
  // Non-null only while the canvas is showing a past checkpoint read-only
  // instead of the live, editable book — see the History rail tab.
  const viewingVersionEntry = versions.find((v) => v.id === viewingVersionId) ?? null;
  const viewingVersionTheme = viewingVersionEntry ? THEMES.find((t) => t.id === viewingVersionEntry.activeTheme) ?? theme : theme;
  /* Which page the selection sits on, for the Pages panel's active outline. Every
     selection kind except 'none' carries either a pageId or a "chapterId::field"
     compound whose first segment is the page. */
  const activePageId =
    selection.kind === 'none' || selection.kind === 'pageNumber' ? null
    : selection.kind === 'page' || selection.kind === 'coverElement' || selection.kind === 'backmatterAvatar' ? selection.pageId
    : selection.chapterId.split('::')[0];
  /* Reduced to a primitive so the effect below fires on a genuinely different
     selection, not on every TipTap cursor move — onSelectionUpdate hands back a
     fresh object literal on each keystroke, which would otherwise slam the panel
     back to Properties and make Pages impossible to keep open while typing. */
  const selectionKey = selection.kind === 'none' ? 'none'
    : selection.kind === 'coverElement' ? `coverElement:${selection.pageId}:${selection.elementId}`
    // The gesture is part of the key: clicking a page's margin after browsing to
    // that same page in the Pages rail has to re-fire the effect, or Properties
    // never opens for a page you were already sitting on.
    : selection.kind === 'page' ? `page:${activePageId}:${selection.viaCanvas ? 'canvas' : 'ambient'}`
    : `${selection.kind}:${activePageId}`;
  /* 'page' and 'none' are the ambient "landed here, nothing specific clicked"
     state — the cover's own default selection is exactly this, so treating it as
     "an element is selected" would flip straight back to Properties on every load
     and defeat the point of defaulting to Pages at all.

     'chapter' — a caret or range in the body text — opens Properties like any
     other selection, so prose gets the full inspector (font, size, style,
     alignment, colour, highlight, lists, link) rather than only the marks that
     fit in the selection bubble. The earlier worry was that this makes the
     overlay the resting state while you type; selectionKey collapses a chapter
     selection to `chapter:<pageId>`, so the effect below fires once when you
     click into prose, not on every keystroke, and the back arrow and rail tabs
     are both one click away. */
  const isElementSelection =
    // A page clicked on the canvas is an object like any other — it's the only
    // way to reach its Background, and the only thing that WAS reachable by
    // clicking a page's empty margin was nothing at all.
    (selection.kind === 'page' ? selection.viaCanvas === true : selection.kind !== 'none')
    // Unset opener/back-matter photos have no inspector in the cascade below, so
    // opening Properties for them would cover the Photos picker they just jumped
    // to with a "select something" placeholder.
    && selection.kind !== 'openerImage' && selection.kind !== 'backmatterAvatar';
  /* The Properties header names what you've got selected. When Properties was a
     permanent right-hand tab its own label was enough; as a view that swaps over
     the panel it has to say what it swapped in for, or the back arrow reads as
     "back from where?". 'chapter' says Text rather than Chapter because what the
     panel shows is the text formatting for the caret, not the chapter as an object. */
  const selectionLabel =
    selection.kind === 'image' ? 'Image'
    : selection.kind === 'shape' ? 'Shape'
    : selection.kind === 'embed' ? 'Embed'
    : selection.kind === 'qr' ? 'QR code'
    : selection.kind === 'chart' ? 'Chart'
    : selection.kind === 'divider' ? 'Divider'
    : selection.kind === 'openerRule' ? 'Chapter rule'
    : selection.kind === 'textfield' ? 'Form field'
    : selection.kind === 'jumbotron' ? 'Banner'
    : selection.kind === 'imageGrid' ? 'Photo grid'
    : selection.kind === 'columns' ? 'Columns'
    : selection.kind === 'table' ? 'Table'
    : selection.kind === 'footnote' ? 'Footnote'
    : selection.kind === 'footnotesSection' ? 'Notes'
    : selection.kind === 'pageNumber' ? 'Page numbers'
    /* Names the object, the way Figma's panel header does — "Rectangle",
       "Triangle". With the silhouette picker gone from the panel, this is what
       says which shape you're holding, and it's a truer answer than "Cover
       element" was for a photo or a title either. */
    : selection.kind === 'coverElement' ? coverElementLabel(
        pages.find((p) => p.id === selection.pageId) as SimplePage | undefined,
        selection.elementId,
      )
    /* Both of these fell through to the generic 'Properties', so the overlay
       header said "Properties" while you were editing a specific photo slot —
       and the only thing naming the slot was PhotoSourcePanel's own title,
       one line below. Naming them here lets that title go. */
    : selection.kind === 'openerImage' ? 'Opener photo'
    : selection.kind === 'backmatterAvatar' ? 'Author photo'
    : selection.kind === 'page' && pages.find((p) => p.id === selection.pageId)?.type === 'cover' ? 'Cover'
    : selection.kind === 'page' ? 'Page'
    : selection.kind === 'chapter' ? 'Text'
    : 'Properties';
  /* Properties follows the selection: selecting something swaps it over the panel,
     deselecting hands the panel back to whichever rail tab was open — railTab is
     never cleared, so there's always somewhere to return to. Deselection only
     clears Properties, never History: if you're reading version history and click
     into the page, Properties is what you asked for, but merely losing a selection
     shouldn't yank you out of a panel you opened deliberately from the top bar. */
  useEffect(() => {
    setPanelOverlay((prev) => (isElementSelection ? 'properties' : prev === 'properties' ? null : prev));
  }, [selectionKey]);
  useEffect(() => { setPagesActiveId(null); }, [activePageId]);
  const pagesPanelActiveId = pagesActiveId ?? activePageId;
  const coverPageId = pages.find((p) => p.type === 'cover')?.id ?? 'p-cover';
  const backMatterPageId = pages.find((p) => p.type === 'backmatter')?.id ?? 'p-back';

  /* ── hydrate, then save ────────────────────────────────────────────────────
     Chapter editors take their content at creation, so the canvas can't mount
     until the stored book is in state — otherwise every editor would be built
     from the sample text and the restore would be invisible. */
  useEffect(() => {
    const stored = loadBook();
    if (stored) {
      setPages(stored.pages.map((p) => (
        p.type === 'chapter' ? { ...p, initialHtml: stored.chapterContent[p.id] ?? p.initialHtml } : migrateCoverBg(p)
      )));
      setMetadata(stored.metadata);
      setPageNumbers(stored.pageNumbers);
      setActiveTheme(stored.activeTheme);
      setChapterContent(stored.chapterContent);
      setFieldContent(stored.fieldContent);
      setSpellcheck(stored.spellcheck ?? true);
      // Books saved before this setting existed were all set spaced, so that's
      // what an absent value has to mean — anything else silently reflows them.
      setParagraphStyle(stored.paragraphStyle ?? 'spaced');
      setSelection({ kind: 'page', pageId: stored.pages.find((p) => p.type === 'cover')?.id ?? 'p-cover' });
    }
    // Re-pruned on load, not just on write, so a downgrade takes effect the
    // moment the editor opens rather than waiting for the next autosave.
    const storedVersions = pruneVersions(loadVersions(), hasProAccess);
    if (storedVersions.length) {
      setVersions(storedVersions);
      lastVersionSavedAtRef.current = storedVersions[0]?.savedAt ?? 0;
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced so a burst of keystrokes writes once, and marked dirty immediately
  // so the indicator can't claim "Saved" while a change is still in flight.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    setSaveState('unsaved');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaveState('saving');
      try {
        const payload: PersistedBook = {
          version: 1, pages, metadata, pageNumbers, activeTheme, chapterContent, fieldContent, spellcheck, paragraphStyle,
          savedAt: Date.now(),
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        setSaveState('saved');
      } catch {
        // Almost always the 5MB quota, which uploaded images reach quickly.
        setSaveState('error');
      }
    }, 700);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [hydrated, pages, metadata, pageNumbers, activeTheme, chapterContent, fieldContent, spellcheck, paragraphStyle]);

  // Version checkpoints, on their own idle-boundary timer rather than piggy-
  // backing on the primary save's 700ms debounce above — see the comment on
  // VERSION_IDLE_MS/VERSION_MAX_ACTIVE_MS for why (Google Docs' principle:
  // a checkpoint forms around a pause in activity, not a fixed clock).
  // Resets on every real change; fires once you've gone quiet for
  // VERSION_IDLE_MS, or immediately on the next change once
  // VERSION_MAX_ACTIVE_MS has elapsed since the last one, so one long,
  // never-pausing session still gets checkpointed rather than none at all.
  const versionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (versionTimer.current) clearTimeout(versionTimer.current);
    const overdue = Date.now() - lastVersionSavedAtRef.current >= VERSION_MAX_ACTIVE_MS;
    versionTimer.current = setTimeout(() => {
      const now = Date.now();
      try {
        const entry: VersionEntry = {
          id: `v-${now}-${Math.random().toString(36).slice(2, 8)}`,
          savedAt: now, pages, chapterContent, fieldContent, activeTheme,
        };
        const next = pruneVersions([entry, ...versions], hasProAccess);
        window.localStorage.setItem(VERSIONS_STORAGE_KEY, JSON.stringify(next));
        setVersions(next);
        lastVersionSavedAtRef.current = now;
      } catch {
        // Quota or serialization failure — the primary save is unaffected, so
        // silently skip this checkpoint rather than surface a second, more
        // confusing error state for a non-critical write.
      }
    }, overdue ? 0 : VERSION_IDLE_MS);
    return () => { if (versionTimer.current) clearTimeout(versionTimer.current); };
    // versions/hasProAccess deliberately omitted — this effect's own callback
    // is what updates `versions`; including it would retrigger/reset the idle
    // timer every time a checkpoint is appended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, pages, chapterContent, fieldContent, activeTheme]);

  // A dirty book shouldn't leave without saying so — the debounce window is short,
  // but a quota failure is not recoverable by waiting.
  useEffect(() => {
    if (saveState === 'saved') return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  /* ── structural undo ─────────────────────────────────────────────────────── */
  const takeSnapshot = useCallback((touched: string[] = []): Snapshot => ({
    // initialHtml is re-pointed at live content so a chapter that gets deleted and
    // then restored remounts holding what the user actually wrote, not its seed.
    pages: pages.map((p) => (
      p.type === 'chapter' ? { ...p, initialHtml: chapterContent[p.id] ?? p.initialHtml } : p
    )),
    chapterContent: { ...chapterContent },
    fieldContent: { ...fieldContent },
    activeTheme,
    touched,
  }), [pages, chapterContent, fieldContent, activeTheme]);

  const restoreSnapshot = useCallback((snap: Snapshot) => {
    setPages(snap.pages);
    setChapterContent(snap.chapterContent);
    setFieldContent(snap.fieldContent);
    setActiveTheme(snap.activeTheme);
    // Only Split rewrites a live editor's content in place, so only the chapters it
    // named need pushing back — everything else is restored by `pages` alone.
    for (const id of snap.touched) {
      const entry = editorRegistry.current.get(id);
      const html = snap.chapterContent[id];
      if (entry && html !== undefined) entry.editor.commands.setContent(html);
    }
    setUndoToast(null);
  }, []);

  // Non-destructive, like every platform this was modeled on (Figma/Google Docs/
  // Notion): restoring an old version never deletes anything, it pushes whatever
  // you were just looking at as its own new checkpoint first, so you can always
  // come back forward again instead of restoring being a dead end.
  const restoreVersion = useCallback((entry: VersionEntry) => {
    const current: VersionEntry = {
      id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: Date.now(), pages, chapterContent, fieldContent, activeTheme,
    };
    setVersions((prev) => {
      const next = pruneVersions([current, ...prev], hasProAccess);
      try { window.localStorage.setItem(VERSIONS_STORAGE_KEY, JSON.stringify(next)); } catch { /* non-fatal, matches the autosave checkpoint's own try/catch */ }
      return next;
    });
    lastVersionSavedAtRef.current = current.savedAt;

    setPages(entry.pages);
    setChapterContent(entry.chapterContent);
    setFieldContent(entry.fieldContent);
    setActiveTheme(entry.activeTheme);
    // Unlike one action's small `touched` list above, a jump through history can
    // differ from live state anywhere — refresh every chapter editor actually
    // mounted, not just a few named ones.
    for (const [id, registered] of editorRegistry.current) {
      if (registered.kind !== 'chapter') continue;
      const html = entry.chapterContent[id];
      if (html !== undefined) registered.editor.commands.setContent(html);
    }
    setUndoToast(null);
    // Back to viewing "current" — now the just-restored live state — rather
    // than closing the panel outright, so the new checkpoint just pushed
    // above is visible sitting at the top of the list.
    setViewingVersionId(null);
  }, [pages, chapterContent, fieldContent, activeTheme, hasProAccess]);

  // Set alongside undoToast itself — marks the very next pages/content/selection
  // change (the action's own, landing in this same batch) as "not a new action",
  // so the effect below doesn't immediately dismiss the toast it was just asked
  // to show.
  const justOfferedUndoRef = useRef(false);
  const offerUndo = useCallback((label: string, snapshot: Snapshot) => {
    justOfferedUndoRef.current = true;
    setUndoToast({ label, snapshot });
  }, []);
  // A snackbar, not a sticky banner: once the user does anything else — types,
  // selects a different element, applies another template — the undo affordance
  // no longer cleanly represents "undo my last action" (Undo restores a full
  // pre-action snapshot, silently discarding whatever happened since), so it
  // should disappear rather than linger for the rest of its timeout.
  useEffect(() => {
    if (justOfferedUndoRef.current) { justOfferedUndoRef.current = false; return; }
    if (undoToast) setUndoToast(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, chapterContent, fieldContent, selection]);

  // Wordgenie's per-paragraph Rewrite/Fix spelling/Reduce/Expand used to be the
  // one content-mutating action with no way back — everything else (delete,
  // reorder, split, template) already goes through takeSnapshot/offerUndo, this
  // just relied on TipTap's own per-editor Ctrl+Z, which doesn't survive
  // switching chapters or a reload. Bundled into one call (snapshot taken now,
  // while state is still pre-edit; commit() fired after the actual mutation)
  // so callers don't have to juggle two separate functions in the right order —
  // same "passed straight through" shape as onSplitChapter below.
  const beginChapterEdit = useCallback((chapterId: string) => {
    const snapshot = takeSnapshot([chapterId]);
    return { commit: (label: string) => offerUndo(label, snapshot) };
  }, [takeSnapshot, offerUndo]);

  /* ⌘F / Ctrl+F reaches the book's own search rather than the browser's, which
     could only ever see the chapters currently scrolled into view anyway. */
  /* Shared by ⌘F and the top bar's own button so the two can't drift apart. All the
     setters are stable and findInputRef is a ref, so this needs no deps. */
  const openFindReplace = useCallback(() => {
    // Opens on the right, over the navigator, rather than as a sub-tab buried
    // inside Chapters. It searches the whole book, so it's document-scoped like
    // History — and it leaves the left panel alone, which matters because you
    // usually hit ⌘F from inside the text you're editing.
    setRightOverlay('find');
    setRightOpen(true);
    // After the panel has mounted, not before.
    requestAnimationFrame(() => findInputRef.current?.focus());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        openFindReplace();
      }
      if (e.key === 'Escape') setZoomOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openFindReplace]);

  // The zoom dropdown used to close only from its own toggle button.
  useEffect(() => {
    if (!zoomOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(e.target as globalThis.Node)) setZoomOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [zoomOpen]);

  /* Uploaded images sit alongside the bundled stock library for the session. They
     aren't persisted as a list — but an image that's been inserted is base64 inside
     the chapter HTML, which is, so the book itself survives a reload either way. */
  const [uploadedImages, setUploadedImages] = useState<ImageLibraryEntry[]>([]);
  const [imageCreditsUsed, setImageCreditsUsed] = useState(0);
  const imageLibrary = useMemo(() => ({
    images: [...uploadedImages, ...STOCK_IMAGES],
    add: (label: string, src: string, source: 'upload' | 'generated' = 'upload') => setUploadedImages((prev) => (
      prev.some((i) => i.src === src) ? prev : [{ label: label || (source === 'generated' ? 'Generated image' : 'Uploaded image'), src, source }, ...prev]
    )),
    creditsUsed: imageCreditsUsed,
    useCredits: (n: number) => setImageCreditsUsed((prev) => prev + n),
  }), [uploadedImages, imageCreditsUsed]);

  const editorPrefs = useMemo(() => ({ spellcheck, paragraphStyle, accentColor: theme.accentColor }), [spellcheck, paragraphStyle, theme.accentColor]);

  /* What Suggested searches for before anyone types. Ordered most-authored to
     least: `subjects` is a topic list the author typed on purpose, so it beats a
     title that may still be a placeholder; the focused chapter's title is the
     last resort because it is the narrowest and can drift off what the book is
     broadly about.
     Capped at three words: Unsplash treats extra terms as an AND, so a long seed
     ("Productivity, Business, Self-improvement, Coaching") reliably returns
     nothing, which would look like a broken section rather than a narrow one. */
  const photoSuggestSeed = useMemo(() => {
    const focusedChapter = selection.kind === 'chapter'
      ? (pages.find((p) => p.id === selection.chapterId.split('::')[0]) as ChapterPage | undefined)
      : undefined;
    const candidate =
      metadata.subjects.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 2).join(' ')
      || metadata.title.trim()
      || focusedChapter?.title.trim()
      || '';
    return candidate.split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
  }, [metadata.subjects, metadata.title, selection, pages]);

  /* The scaled canvas reports its unscaled height here so the scroll container can
     be given the scaled one — see the note at the wrapper itself. */
  const canvasInnerRef = useRef<HTMLDivElement | null>(null);
  const [canvasHeight, setCanvasHeight] = useState(0);
  useEffect(() => {
    const node = canvasInnerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setCanvasHeight(node.offsetHeight));
    observer.observe(node);
    setCanvasHeight(node.offsetHeight);
    return () => observer.disconnect();
  }, [hydrated]);

  const setTocExcluded = useCallback((chapterId: string, excluded: boolean) => {
    setPages((prev) => prev.map((p) => (p.id === chapterId && p.type === 'chapter' ? { ...p, excludeFromToc: excluded } : p)));
  }, []);
  const setOpenerImage = useCallback((chapterId: string, src: string) => {
    setPages((prev) => prev.map((p) => (p.id === chapterId && p.type === 'chapter' ? { ...p, openerImage: src } : p)));
  }, []);
  const setOpenerRule = useCallback((chapterId: string, patch: Partial<OpenerRule>) => {
    setPages((prev) => prev.map((p) => (p.id === chapterId && p.type === 'chapter' ? { ...p, openerRule: { ...p.openerRule, ...patch } } : p)));
  }, []);
  const setBackmatterPhoto = useCallback((pageId: string, src: string) => {
    setPages((prev) => prev.map((p) => (p.id === pageId && p.type === 'backmatter' ? { ...p, authorPhoto: src } : p)));
  }, []);

  /* undefined clears the override and hands the page back to the template's own
     bg, which is why this can't just be a string — see PageBackgroundGroup. */
  const setPageBg = useCallback((pageId: string, bg: string | undefined) => {
    setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, bg } : p)));
  }, []);
  const updateCoverElement = useCallback((pageId: string, elementId: string, patch: CoverElementPatch) => {
    setPages((prev) => prev.map((p) => (p.id === pageId && p.type === 'cover'
      ? { ...p, coverElements: (p.coverElements ?? []).map((el) => (el.id === elementId ? ({ ...el, ...patch } as CoverElement) : el)) }
      : p)));
  }, []);
  const deleteCoverElement = useCallback((pageId: string, elementId: string) => {
    setPages((prev) => prev.map((p) => (p.id === pageId && p.type === 'cover'
      ? { ...p, coverElements: (p.coverElements ?? []).filter((el) => el.id !== elementId) }
      : p)));
    setSelection((prev) => (prev.kind === 'coverElement' && prev.elementId === elementId ? { kind: 'page', pageId } : prev));
  }, []);
  /* Keyboard delete for cover elements. TipTap already answers Backspace and
     Delete on a NodeSelection (see the atom keymap), so every shape, image and
     embed in a CHAPTER could be removed from the keyboard — but a cover element
     is React state on a free canvas, not a document node, so nothing was
     listening. The floating toolbar's bin was the only way to remove one, which
     also made it the only object in the editor you couldn't delete without a
     mouse.
     Guarded on the focused element: a cover text box is contenteditable, and
     inside one Backspace has to edit the text rather than delete the box around
     it. Same for the panel's own inputs, which are in the tab order right
     beside the canvas. */
  useEffect(() => {
    if (selection.kind !== 'coverElement') return;
    const { pageId, elementId } = selection;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName))) return;
      e.preventDefault();
      deleteCoverElement(pageId, elementId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, deleteCoverElement]);

  const reorderCoverElement = useCallback((pageId: string, elementId: string, dir: 'front' | 'back') => {
    setPages((prev) => prev.map((p) => {
      if (p.id !== pageId || p.type !== 'cover') return p;
      const els = p.coverElements ?? [];
      const el = els.find((e) => e.id === elementId);
      if (!el) return p;
      const rest = els.filter((e) => e.id !== elementId);
      return { ...p, coverElements: dir === 'front' ? [...rest, el] : [el, ...rest] };
    }));
  }, []);
  // Nudged a few percent down-right so the copy doesn't sit exactly on top of the
  // original — otherwise a duplicated element would be indistinguishable from the
  // original until dragged, the same reason most design tools offset a paste/clone.
  const duplicateCoverElement = useCallback((pageId: string, elementId: string) => {
    const newId = `${elementId}-copy-${Date.now()}`;
    setPages((prev) => prev.map((p) => {
      if (p.id !== pageId || p.type !== 'cover') return p;
      const els = p.coverElements ?? [];
      const el = els.find((e) => e.id === elementId);
      if (!el) return p;
      const copy: CoverElement = { ...el, id: newId, x: clampPct(el.x + 3, 0, 100 - el.w), y: clampPct(el.y + 3, 0, 100 - el.h) };
      return { ...p, coverElements: [...els, copy] };
    }));
    setSelection({ kind: 'coverElement', pageId, elementId: newId });
  }, []);
  // Applying a template swaps the cover's layout AND the matching chapter/TOC/
  // back-matter theme — one action, since a template is the two of those bundled
  // together, not two separate systems. The user's photo and text carry across;
  // font/colour/size always come from the new template (see mergeCoverElements).
  // No confirm(): the preview is the look-before-you-leap step, and the undo
  // toast afterwards is the way back.
  const applyTemplate = useCallback((pageId: string, templateId: string) => {
    const tpl = THEMES.find((t) => t.id === templateId as ThemeId);
    if (!tpl) return;
    const snapshot = takeSnapshot();
    setPages((prev) => prev.map((p) => {
      if (p.id !== pageId || p.type !== 'cover') return p;
      // bg travels with the template for the same reason the elements do: it's
      // part of the look being applied, not content the author typed.
      return { ...p, bg: tpl.coverBg, coverElements: mergeCoverElements(p.coverElements ?? [], tpl.coverElements) };
    }));
    setActiveTheme(tpl.id);
    setSelection({ kind: 'page', pageId });
    offerUndo(`${tpl.name} applied`, snapshot);
  }, [takeSnapshot, offerUndo]);

  const jumpTo = useCallback((id: string) => {
    pageRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Mocked exactly like Presentation's own in-editor chat (setTimeout + a
  // canned line) — no real model wired up, consistent with every other
  // AI-shaped feature in this prototype (GenerateImagePanel, qrModules).
  // Split from sendAiMessage (below) the same way Presentation splits
  // sendAiChatText/sendAiMessage — a pill click sends canned text directly,
  // without going through the input field at all.
  const sendAiChatText = useCallback((text: string) => {
    if (!text.trim()) return;
    setAiMessages((prev) => [...prev, { role: 'user', text }]);
    const chapterTitle = pages.find((p) => p.id === activeChapterId)?.title;
    setTimeout(() => {
      setAiMessages((prev) => [...prev, {
        role: 'ai',
        text: chapterTitle ? `Got it — working on "${text}" for "${chapterTitle}"…` : `Got it — working on "${text}"…`,
      }]);
    }, 600);
  }, [pages, activeChapterId]);

  const sendAiMessage = useCallback(() => {
    const text = aiInput.trim();
    if (!text) return;
    setAiInput('');
    sendAiChatText(text);
  }, [aiInput, sendAiChatText]);



  /* Reorder, keeping the cover pinned first and the back matter pinned last — only
     chapters ever move; both entry points below refuse to touch cover/toc/backmatter,
     the same boundary the old single-step move enforced. */
  const moveChapterToEdge = useCallback((id: string, edge: 'top' | 'bottom') => {
    const snapshot = takeSnapshot();
    let moved = false;
    setPages((prev) => {
      const from = prev.findIndex((p) => p.id === id);
      if (from < 0 || prev[from].type !== 'chapter') return prev;
      const next = [...prev];
      const [movedPage] = next.splice(from, 1);
      const backmatterIdx = next.findIndex((p) => p.type === 'backmatter');
      const lastIdx = backmatterIdx >= 0 ? backmatterIdx : next.length;
      const firstChapterIdx = next.findIndex((p) => p.type === 'chapter');
      const lastChapterIdx = (() => {
        for (let i = next.length - 1; i >= 0; i--) if (next[i].type === 'chapter') return i;
        return -1;
      })();
      const insertAt = edge === 'top'
        ? (firstChapterIdx >= 0 ? firstChapterIdx : lastIdx)
        : (lastChapterIdx >= 0 ? lastChapterIdx + 1 : lastIdx);
      next.splice(insertAt, 0, movedPage);
      moved = true;
      return next;
    });
    if (moved) offerUndo(edge === 'top' ? 'Chapter moved to the top' : 'Chapter moved to the bottom', snapshot);
  }, [takeSnapshot, offerUndo]);

  const reorderChapter = useCallback((draggedId: string, targetId: string, pos: 'before' | 'after') => {
    if (draggedId === targetId) return;
    const snapshot = takeSnapshot();
    let moved = false;
    setPages((prev) => {
      const from = prev.findIndex((p) => p.id === draggedId);
      const targetOriginal = prev.find((p) => p.id === targetId);
      if (from < 0 || prev[from].type !== 'chapter' || !targetOriginal || targetOriginal.type !== 'chapter') return prev;
      const next = [...prev];
      const [movedPage] = next.splice(from, 1);
      const to = next.findIndex((p) => p.id === targetId);
      const insertAt = pos === 'before' ? to : to + 1;
      next.splice(insertAt, 0, movedPage);
      moved = true;
      return next;
    });
    if (moved) offerUndo('Chapter reordered', snapshot);
  }, [takeSnapshot, offerUndo]);

  const deletePage = useCallback((id: string) => {
    const target = pages.find((p) => p.id === id);
    if (!target) return;
    // The "at least one chapter" floor only applies when the thing being deleted
    // IS a chapter — it used to block deleting anything at all whenever exactly
    // one chapter existed, which would have wrongly stopped removing the TOC too.
    if (target.type === 'chapter' && pages.filter((p) => p.type === 'chapter').length <= 1) return;
    const snapshot = takeSnapshot();

    setPages((prev) => prev.filter((p) => p.id !== id));
    setChapterContent((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setFieldContent((prev) => {
      const next = { ...prev };
      // Every field on the page, not just the title — a cover or TOC page owns
      // several, and they'd otherwise linger forever under a dead page id.
      for (const key of Object.keys(next)) if (key.split('::')[0] === id) delete next[key];
      return next;
    });
    /* These three were never cleaned up, and altStatus is the one that bites: a
       deleted chapter's missing-alt count stayed in the sum forever, so the alt
       check stayed a blocking failure with no image left in the book to fix, and
       Export stayed disabled permanently. The word total drifted the same way. */
    setAltStatus((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setWordCounts((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setTitleWordCounts((prev) => { const next = { ...prev }; delete next[id]; return next; });

    setSelection((prev) => {
      const stillThere = (pid: string) => pid.split('::')[0] !== id;
      if (prev.kind === 'page' && !stillThere(prev.pageId)) return { kind: 'page', pageId: coverPageId };
      if (prev.kind === 'chapter' && !stillThere(prev.chapterId)) return { kind: 'page', pageId: coverPageId };
      return prev;
    });
    offerUndo(target.type === 'toc' ? 'Table of contents removed' : `“${target.title}” deleted`, snapshot);
  }, [pages, takeSnapshot, offerUndo, coverPageId]);

  /* Chapter-only, matching ChaptersPanel's own reorder/delete restriction — cover,
     TOC and back matter are singleton page types an EPUB expects exactly one of,
     so "duplicate" only makes sense for the repeatable page type. */
  const duplicatePage = useCallback((id: string) => {
    const target = pages.find((p) => p.id === id);
    if (!target || target.type !== 'chapter') return;
    const snapshot = takeSnapshot();
    const newId = `ch-${Date.now()}`;
    const html = chapterContent[id] ?? target.initialHtml;
    // title is a plain-text mirror kept in sync with titleHtml on every keystroke
    // (see ChapterPage) — a duplicate has to carry " copy" in both, or the two
    // disagree the instant it's created instead of only after the first edit.
    const newTitle = `${target.title} copy`;
    const newTitleHtml = `<h2>${escapeHtml(newTitle)}</h2>`;
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      const copy: ChapterPage = { ...target, id: newId, title: newTitle, titleHtml: newTitleHtml };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
    setChapterContent((prev) => ({ ...prev, [newId]: html }));
    setFieldContent((prev) => ({ ...prev, [`${newId}::title`]: newTitleHtml }));
    offerUndo(`“${target.title}” duplicated`, snapshot);
  }, [pages, chapterContent, takeSnapshot, offerUndo]);

  /* Split at a block boundary. TipTap has no JSON→HTML helper installed, so the
     live editor itself does the serialising: swap in each half, read the HTML
     back, then leave the editor holding the first half. Takes an explicit
     chapter/editor/position rather than reading the globally-"active" ones —
     the top bar's own Split button uses the live cursor (see its call site),
     but the per-paragraph "Split chapter here" menu item needs to split at
     the paragraph it was opened from, which isn't necessarily wherever the
     blinking caret happens to be. */
  const splitChapter = useCallback((chapterId: string, editor: Editor, pos: number) => {
    const json = editor.getJSON() as JSONContent;
    const blocks: JSONContent[] = json.content ?? [];
    if (blocks.length < 2) return;
    let splitIndex = 0;
    editor.state.doc.forEach((_node, offset, i) => { if (offset < pos) splitIndex = i; });
    if (splitIndex <= 0 || splitIndex >= blocks.length) return;

    // Taken before the setContent calls below rewrite the live editor — splitting
    // is the one structural action that mutates an editor in place, so the source
    // chapter is named as touched and gets reloaded on undo.
    const snapshot = takeSnapshot([chapterId]);

    const before = blocks.slice(0, splitIndex);
    const after = blocks.slice(splitIndex);
    editor.commands.setContent({ type: 'doc', content: after });
    const htmlAfter = editor.getHTML();
    editor.commands.setContent({ type: 'doc', content: before });
    const htmlBefore = editor.getHTML();

    // The new second half has no title of its own yet — deriving one from body
    // content isn't meaningful now that title is a separate field, so it opens on
    // the "Chapter title" placeholder instead, same as any other new chapter.
    const newId = `ch-${Date.now()}`;
    setChapterContent((prev) => ({ ...prev, [chapterId]: htmlBefore, [newId]: htmlAfter }));
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === chapterId);
      if (idx < 0) return prev;
      const source = prev[idx] as ChapterPage;
      const updated: ChapterPage = { ...source, initialHtml: htmlBefore };
      const created: ChapterPage = {
        id: newId, type: 'chapter', title: 'Untitled chapter', layout: 'standard',
        overrides: {}, titleHtml: '', initialHtml: htmlAfter,
      };
      return [...prev.slice(0, idx), updated, created, ...prev.slice(idx + 1)];
    });
    offerUndo('Chapter split in two', snapshot);
  }, [takeSnapshot, offerUndo]);

  const addChapterAfter = useCallback((afterId: string) => {
    const newId = `ch-${Date.now()}`;
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === afterId);
      const next: ChapterPage = {
        id: newId, type: 'chapter', title: 'New Chapter', layout: 'standard', overrides: {},
        titleHtml: '<h2>New Chapter</h2>', initialHtml: '<p>Start writing…</p>',
      };
      return [...prev.slice(0, idx + 1), next, ...prev.slice(idx + 1)];
    });
  }, []);

  /* Shared by every click-to-insert path below: lands at the cursor when one is
     in a chapter, otherwise at the end of the last chapter that was worked in —
     never silently nowhere, which is what clicking a tile used to do. */
  const resolveInsertTarget = useCallback((): { editor: Editor; pos: number } | null => {
    const targetId = activeChapterId ?? pages.find((p) => p.type === 'chapter')?.id;
    if (!targetId) return null;
    const entry = editorRegistry.current.get(targetId);
    if (!entry) return null;
    const pos = activeChapterId === targetId && activeEditor === entry.editor
      ? entry.editor.state.selection.from
      : entry.editor.state.doc.content.size;
    jumpTo(targetId);
    return { editor: entry.editor, pos };
  }, [pages, activeChapterId, activeEditor, jumpTo]);

  const insertTileAtCursor = useCallback((tile: InsertTile) => {
    if (tile.html === '__CHAPTER__') {
      const lastChapter = [...pages].reverse().find((p) => p.type === 'chapter');
      addChapterAfter(lastChapter?.id ?? coverPageId);
      return;
    }
    const target = resolveInsertTarget();
    if (!target) return;
    insertTileContent(target.editor, target.pos, tile.html);
  }, [pages, addChapterAfter, coverPageId, resolveInsertTarget]);

  // Image/Video/Audio tiles no longer insert directly — they open the media
  // picker on the left instead (see the 'media' rail tab below), and only the
  // card it produces, once something's actually sourced, ever gets inserted.
  /* ── crop mode ─────────────────────────────────────────────────────────── */
  const cropEditor = selection.kind === 'image' ? selection.editor : null;
  const imageInGrid = !!cropEditor && cropEditor.isActive('imageGridBlock');
  /* The one selection whose Properties header points somewhere other than
     "close this panel": a grid cell's only route back to its grid. */
  const inGridCell = selection.kind === 'image' && imageInGrid;

  // Step back out of a cell to the grid that holds it — the reverse of the
  // first-click/second-click drill-in.
  const selectParentGrid = useCallback(() => {
    if (!cropEditor) return;
    const view = cropEditor.view;
    const { selection: sel } = view.state;
    const $at = view.state.doc.resolve(sel.from);
    for (let d = $at.depth; d > 0; d -= 1) {
      if ($at.node(d).type.name === 'imageGridBlock') {
        view.focus();
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, $at.before(d))));
        return;
      }
    }
  }, [cropEditor]);

  /* One read and one write per target kind, so the three crop commands below
     stay identical for a chapter image and a cover photo. */
  const cropSource = useCallback((target: CropTarget): { src: string; originalSrc: string; crop: string } | null => {
    if (target.kind === 'node') {
      const a = target.editor.getAttributes('image') as { src?: string; originalSrc?: string; crop?: string };
      return { src: a.src ?? '', originalSrc: a.originalSrc ?? '', crop: a.crop ?? '' };
    }
    // Same cast the two CoverInspector call sites use — a cover target's pageId
    // can only ever name a SimplePage, which the union can't know on its own.
    const el = (pages.find((pg) => pg.id === target.pageId) as SimplePage | undefined)
      ?.coverElements?.find((e) => e.id === target.elementId);
    if (!el || el.type !== 'image') return null;
    return { src: el.src, originalSrc: el.originalSrc ?? '', crop: el.crop ?? '' };
  }, [pages]);

  const writeCrop = useCallback((target: CropTarget, patch: { src: string; originalSrc: string; crop: string }) => {
    if (target.kind === 'node') target.editor.chain().focus().updateAttributes('image', patch).run();
    else updateCoverElement(target.pageId, target.elementId, patch);
  }, [updateCoverElement]);

  const beginCrop = useCallback((target: CropTarget) => {
    const src = cropSource(target);
    if (!src) return;
    setCropTarget(target);
    setCropError('');
    setCropSpec(parseCrop(src.crop));
    setCropAspect('free');
  }, [cropSource]);

  const endCrop = useCallback(() => { setCropSpec(null); setCropTarget(null); setCropError(''); }, []);

  const startCrop = useCallback(() => {
    if (cropEditor) beginCrop({ kind: 'node', editor: cropEditor });
  }, [cropEditor, beginCrop]);

  // The overlay needs the live <img> on the canvas. ProseMirror marks the selected
  // node with .ProseMirror-selectednode, which is the only stable hook to it —
  // the node has no React ref of its own.
  // Depends on whether crop is open, not on the rect itself — re-querying the DOM
  // on every drag frame would be pointless work.
  const cropping = cropSpec !== null;
  useEffect(() => {
    if (!cropping) { cropImgRef.current = null; return; }
    // A cover element marks itself with data-cover-selected; a chapter image is
    // found through ProseMirror's own selected-node class.
    const sel = cropTarget?.kind === 'cover'
      ? '[data-cover-selected="true"] img'
      : '.ProseMirror figure.ProseMirror-selectednode img';
    const find = () => {
      cropImgRef.current = document.querySelector(sel) as HTMLElement | null;
    };
    find();
    const t = setTimeout(find, 50);
    return () => clearTimeout(t);
  }, [cropping, cropTarget]);

  const applyCropAspect = useCallback((id: string) => {
    setCropAspect(id);
    const preset = CROP_ASPECTS.find((a) => a.id === id);
    if (!preset || preset.ratio === null) return;
    const img = cropImgRef.current as HTMLImageElement | null;
    const natW = img?.naturalWidth || 1;
    const natH = img?.naturalHeight || 1;
    // ratio 0 means "the image's own" — normalised coords are relative to the
    // source, so that is simply the full frame.
    const target = preset.ratio === 0 ? natW / natH : preset.ratio;
    setCropSpec((prev) => {
      if (!prev) return prev;
      // Solve in normalised space: displayed ratio = (w·natW)/(h·natH).
      let w = 1;
      let h = (natW / natH) / target;
      if (h > 1) { h = 1; w = target / (natW / natH); }
      return { ...prev, x: (1 - w) / 2, y: (1 - h) / 2, w, h };
    });
  }, []);

  /* Rotate/flip outside crop mode. Goes through the same canvas re-encode so the
     result is a real image rather than a CSS transform — a transform would change
     the element's visual box without changing its layout box, which in a reflowing
     column means the rotated image overlaps the text around it. Re-cuts from the
     original with the existing crop rect, so rotating never degrades an image by
     re-encoding an already-re-encoded copy. */
  const applyTransform = useCallback(async (op: TransformOp) => {
    if (!cropEditor) return;
    const attrs = cropEditor.getAttributes('image') as { src: string; originalSrc: string; crop: string };
    const base = attrs.originalSrc || attrs.src;
    const spec = parseCrop(attrs.crop);
    const next: CropSpec = { ...spec };
    if (op.kind === 'rotate-by') next.rotate = ((next.rotate + op.deg) % 360 + 360) % 360;
    if (op.kind === 'rotate-to') next.rotate = ((op.deg % 360) + 360) % 360;
    if (op.kind === 'flip') {
      if (op.axis === 'h') next.flipH = !next.flipH;
      else next.flipV = !next.flipV;
    }
    try {
      const out = await renderCrop(base, next);
      cropEditor.chain().focus().updateAttributes('image', {
        src: out, originalSrc: base, crop: serializeCrop(next),
      }).run();
    } catch {
      // Same tainted-canvas case crop reports; silent here because there is no
      // panel surface open to show it on.
    }
  }, [cropEditor]);

  const applyCrop = useCallback(async () => {
    if (!cropTarget || !cropSpec) return;
    const src = cropSource(cropTarget);
    if (!src) return;
    // Always re-cut from the original, never from an already-cropped copy —
    // otherwise widening a crop you made earlier would be impossible.
    const base = src.originalSrc || src.src;
    setCropBusy(true);
    setCropError('');
    try {
      const out = await renderCrop(base, cropSpec);
      writeCrop(cropTarget, { src: out, originalSrc: base, crop: serializeCrop(cropSpec) });
      setCropSpec(null);
      setCropTarget(null);
    } catch (err) {
      setCropError(err instanceof Error ? err.message : "Couldn't crop this image.");
    } finally {
      setCropBusy(false);
    }
  }, [cropTarget, cropSpec, cropSource, writeCrop]);

  const resetCrop = useCallback(() => {
    if (!cropTarget) return;
    const src = cropSource(cropTarget);
    if (src?.originalSrc) writeCrop(cropTarget, { src: src.originalSrc, originalSrc: '', crop: '' });
    endCrop();
  }, [cropTarget, cropSource, writeCrop, endCrop]);

  const handleMediaInsertTile = useCallback((tile: InsertTile) => {
    if (tile.id === 'image' || tile.id === 'video' || tile.id === 'audio') {
      setMediaPicker({ kind: tile.id, picked: null });
      return;
    }
    insertTileAtCursor(tile);
  }, [insertTileAtCursor]);

  const insertMediaAtCursor = useCallback((kind: MediaPickerKind, src: string) => {
    const target = resolveInsertTarget();
    if (!target) return;
    insertMediaAt(target.editor, target.pos, kind, src);
    setMediaPicker(null);
  }, [resolveInsertTarget]);

  // A TOC page is optional, not a retailer requirement — the EPUB nav document
  // buildEpub always generates (epub.ts) is a separate, invisible file built from
  // the chapter list itself, not from this visible page, so deleting it changes
  // nothing about export validity. Re-addable (right after the cover, where it
  // conventionally sits) since deletion has no other undo path.
  const addTocPage = useCallback(() => {
    setPages((prev) => {
      if (prev.some((p) => p.type === 'toc')) return prev;
      const coverIdx = prev.findIndex((p) => p.type === 'cover');
      const next: SimplePage = { id: `p-toc-${Date.now()}`, type: 'toc', title: 'Table of Contents' };
      return [...prev.slice(0, coverIdx + 1), next, ...prev.slice(coverIdx + 1)];
    });
  }, []);

  /* The book's real page list. Each chapter reports how many sheets it measured
     out to (see the Pagination extension); everything else is one sheet until
     front and back matter can paginate too. Flattening that into one ordered
     array is what makes "page" mean a page everywhere: the Pages panel lists
     these, and the number printed on a sheet is its index in here rather than
     its section's index — so numbering runs continuously across a chapter that
     spans twenty pages instead of restarting at every section. */
  const bookPages = useMemo(() => {
    const out: { sectionId: string; indexInSection: number; sectionPages: number }[] = [];
    for (const p of pages) {
      const n = p.type === 'chapter' ? Math.max(1, pageCounts[p.id] ?? 1) : 1;
      for (let i = 0; i < n; i++) out.push({ sectionId: p.id, indexInSection: i, sectionPages: n });
    }
    return out;
  }, [pages, pageCounts]);

  /* Index of a section's FIRST page in the numbering sequence; a sheet adds its
     own offset within the section on top. -1 means "excluded from numbering",
     which PageNumberChip already reads as "print nothing". */
  const chapterCountForNumbering = (id: string) => {
    const skipped = (p: PageMeta) => pageNumbers.skipCoverAndBackMatter && (p.type === 'cover' || p.type === 'backmatter');
    const target = pages.find((p) => p.id === id);
    if (!target || skipped(target)) return -1;
    let n = 0;
    for (const p of pages) {
      if (p.id === id) return n;
      if (skipped(p)) continue;
      n += p.type === 'chapter' ? Math.max(1, pageCounts[p.id] ?? 1) : 1;
    }
    return n;
  };

  return (
    <ImageLibraryContext.Provider value={imageLibrary}>
    <PhotoSuggestContext.Provider value={photoSuggestSeed}>
    <EditorPrefsContext.Provider value={editorPrefs}>
    <PageGeometryContext.Provider value={geometry}>
    <EditorRegistryContext.Provider value={registerEditor}>
    <div className="h-full flex flex-col overflow-hidden bg-white">
      <style jsx global>{`
        .book-color-input { appearance: none; -webkit-appearance: none; padding: 0; cursor: pointer; }
        .book-color-input::-webkit-color-swatch-wrapper { padding: 0; }
        .book-color-input::-webkit-color-swatch { border: none; border-radius: inherit; }
        .book-color-input::-moz-color-swatch { border: none; border-radius: inherit; }
        /* Insert tiles. The well lifts on hover and presses on click; the
           caption underneath is part of the same target but never moves, so
           the label stays readable while the object it names responds.
           Transitions name their exact properties (never \`all\`) and stay at
           or under 150ms — this is a high-frequency interaction, so the
           feedback has to be instant rather than expressive. */
        .book-insert-tile .book-insert-well {
          transition-property: box-shadow, transform, background-color;
          transition-duration: 150ms;
          transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
        }
        /* Base lift on the raised tiles only — inline styles would beat the hover
           rule below, so the resting shadow lives here with it. */
        .book-insert-tile .book-insert-well--raised { box-shadow: ${CARD_SHADOW}; }
        .book-insert-tile:hover .book-insert-well { box-shadow: 0px 4px 12px rgba(15,23,51,0.12); }
        .book-insert-tile:active .book-insert-well { scale: 0.96; }
        .book-insert-tile:focus-visible { outline: none; }
        .book-insert-tile:focus-visible .book-insert-well { outline: ${RING}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .book-insert-tile .book-insert-well { transition-duration: 0ms; }
          .book-insert-tile:active .book-insert-well { scale: 1; }
        }
      `}</style>
      {/* top bar — full width, above the rail like the presentation editor's nav bar */}
      <div className="flex-shrink-0 flex items-center justify-between" style={{ height: 56, padding: '0 20px', borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center" style={{ gap: 10 }}>
          <Tooltip label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'} position="right">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex-shrink-0 flex items-center justify-center cursor-pointer rounded-lg hover:bg-[#F6F7F9] transition-colors"
              style={{ width: 36, height: 36 }}
            >
              <SideMenuIcon active={sidebarOpen} />
            </button>
          </Tooltip>
          <AIButton label="Wordgenie" active={aiPanelOpen} onClick={() => setAiPanelOpen((v) => !v)} />
        </div>
        <div style={{ ...ns, fontSize: 13.5, fontWeight: 700, color: INK }}>{metadata.title || 'Untitled book'}</div>
        <div className="flex items-center" style={{ gap: 12 }}>
          <button onClick={() => setShowPreview(true)} style={{ ...ns, fontSize: 13, fontWeight: 500, color: SLATE, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, padding: '7px 14px', cursor: 'pointer' }}>Preview</button>
          <button
            onClick={() => setShowPublishModal(true)}
            style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#fff', background: BLUE, border: 'none', borderRadius: RADIUS_MD, padding: '8px 18px', cursor: 'pointer' }}
          >
            Publish
          </button>
        </div>
      </div>

      {/* bar 2 — save status | undo/redo | zoom, matching the presentation editor's always-visible toolbar */}
      <div className="flex-shrink-0 flex items-center justify-between" style={{ height: 46, padding: '0 20px', borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center" style={{ gap: 0 }}>
          {/* The chapter list itself now lives in the left rail's Chapters tab —
              this stays a plain glanceable label rather than a second entry point
              to the same list. */}
          <span style={{ ...ns, fontSize: 13, color: SLATE, padding: '0 8px' }}>
            {pages.filter((p) => p.type === 'chapter').length} chapter{pages.filter((p) => p.type === 'chapter').length === 1 ? '' : 's'} · {Object.values(wordCounts).reduce((s, n) => s + n, 0) + Object.values(titleWordCounts).reduce((s, n) => s + n, 0)} words
          </span>
          <div style={{ width: 1, height: 18, background: BORDER, margin: '0 12px', flexShrink: 0 }} />
          {/* Was a hardcoded green tick that said "Saved" over a book held only in
              component state — a refresh discarded everything. It reports the real
              state of the local snapshot now, including when saving fails. */}
          <SaveIndicator state={saveState} />
        </div>

        <div className="flex items-center" style={{ gap: 2 }}>
          {/* The toolbar used to duplicate this as its own "Split" button (acting on
              wherever the cursor happened to be) alongside the per-paragraph "···"
              menu's "Split chapter here" — same splitChapter call, two entry points
              for one action. Cut in favor of the single, more precise one: it's
              anchored to the actual paragraph you want to split at, not a cursor
              position you have to remember to place first. */}
          {/* Find & replace runs in ~28% of editing sessions — a top-five tool that
              until now had no visible entry point at all, only ⌘F, and lived buried
              as a sub-tab inside the Chapters panel. It searches the whole book, so
              by scope it belongs up here with the other document-level actions
              rather than nested in the chapter navigator. */}
          <Tooltip label="Find & replace (⌘F)" position="bottom">
            <button
              onClick={openFindReplace}
              className="flex items-center justify-center cursor-pointer"
              style={{ width: 30, height: 30, borderRadius: RADIUS_MD, border: 'none', background: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F6F9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              <Icon d={ICONS.search} size={16} />
            </button>
          </Tooltip>

          <div style={{ width: 1, height: 18, background: BORDER, margin: '0 6px', flexShrink: 0 }} />

          <Tooltip label="Undo (⌘Z)" position="bottom">
            <button
              onClick={() => activeEditor?.chain().focus().undo().run()}
              disabled={!activeEditor}
              className="flex items-center justify-center cursor-pointer"
              style={{ width: 30, height: 30, borderRadius: RADIUS_MD, border: 'none', background: 'none', opacity: activeEditor ? 1 : 0.35 }}
              onMouseEnter={(e) => { if (activeEditor) e.currentTarget.style.background = '#F4F6F9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              <Icon d={ICONS.undo} size={16} />
            </button>
          </Tooltip>
          <Tooltip label="Redo (⌘⇧Z)" position="bottom">
            <button
              onClick={() => activeEditor?.chain().focus().redo().run()}
              disabled={!activeEditor}
              className="flex items-center justify-center cursor-pointer"
              style={{ width: 30, height: 30, borderRadius: RADIUS_MD, border: 'none', background: 'none', opacity: activeEditor ? 1 : 0.35 }}
              onMouseEnter={(e) => { if (activeEditor) e.currentTarget.style.background = '#F4F6F9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              <Icon d={ICONS.redo} size={16} />
            </button>
          </Tooltip>
          {/* Version history moved off the since-retired right rail, where it was a permanent tab
              competing with Pages/Chapters/Properties despite being document-scoped
              and reached rarely. It sits next to undo/redo because that's the same
              job at a coarser grain, and it opens the panel rather than a menu —
              selecting a version re-renders the canvas read-only, which a dropdown
              can't carry. */}
          <Tooltip label="Version history" position="bottom">
            <button
              onClick={() => { setRightOverlay('history'); setRightOpen(true); }}
              className="flex items-center justify-center cursor-pointer"
              style={{
                width: 30, height: 30, borderRadius: RADIUS_MD, border: 'none',
                background: rightOverlay === 'history' ? '#EEF3FF' : 'none',
                color: rightOverlay === 'history' ? BLUE : undefined,
              }}
              onMouseEnter={(e) => { if (rightOverlay !== 'history') e.currentTarget.style.background = '#F4F6F9'; }}
              onMouseLeave={(e) => { if (rightOverlay !== 'history') e.currentTarget.style.background = 'none'; }}
            >
              <Icon d={ICONS.history} size={16} />
            </button>
          </Tooltip>

          <div style={{ width: 1, height: 18, background: BORDER, margin: '0 6px', flexShrink: 0 }} />

          <div className="relative" ref={zoomMenuRef}>
            <button
              onClick={() => setZoomOpen((v) => !v)}
              className="flex items-center cursor-pointer"
              style={{ gap: 5, height: 30, padding: '0 10px', borderRadius: RADIUS_MD, border: 'none', background: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F6F9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /><line x1="8" y1="11" x2="14" y2="11" /><line x1="11" y1="8" x2="11" y2="14" /></svg>
              <span style={{ ...ns, fontSize: 13, fontWeight: 500, color: INK }}>{zoom}%</span>
              <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke={INK} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            {zoomOpen && (
              <div className="absolute bg-white flex flex-col" style={{ top: 'calc(100% + 6px)', right: 0, zIndex: 30, minWidth: 90, padding: 5, borderRadius: RADIUS_LG, border: `1px solid ${PANEL_BORDER}`, boxShadow: MENU_SHADOW }}>
                {ZOOM_OPTIONS.map((lv) => (
                  <button
                    key={lv}
                    onClick={() => { setZoom(lv); setZoomOpen(false); }}
                    className="text-left cursor-pointer"
                    style={{ padding: '6px 10px', borderRadius: RADIUS_SM, border: 'none', background: zoom === lv ? '#F2F7FF' : 'transparent', ...ns, fontSize: 13, fontWeight: zoom === lv ? 600 : 400, color: INK }}
                  >
                    {lv}%
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* rail + panels + canvas + inspector, side by side below the full-width top bar */}
      <div className="flex-1 flex overflow-hidden">
        {/* icon rail */}
        <div className="flex-shrink-0 h-full flex flex-col items-center bg-white" style={{ width: RAIL_W, borderRight: `1px solid ${BORDER}`, paddingTop: 12, gap: 4 }}>
          {([
            // Templates leads — choosing a look comes before the day-to-day insert
            // tools, which is how Flipsnack and Canva order it too, and it's this
            // panel's default. Pages and Chapters live on the right rail.
            { id: 'templates', label: 'Templates', icon: ICONS.templatesTab },
            // Photos outranks Text on the evidence, not on taste: in the 90 days to
            // Aug 2026 the ebook editor logged ~3 photo actions per draft-edit session
            // (upload 59k, suggestion pick 37k, AI generate 12.6k against 36k sessions),
            // while the font panel opened in 1.1% of them. Naming it Photos rather than
            // Media also stops the tab pretending to be a general media bucket when
            // video and audio barely apply to PDF/EPUB, which is most of what ships.
            { id: 'photos', label: 'Photos', icon: ICONS.image },
            { id: 'text', label: 'Text', icon: ICONS.textTab },
            { id: 'elements', label: 'Elements', icon: ICONS.shapesTab },
            /* Layouts is a top-level category in the real, live Designrr editor —
               with almost exactly these eight tiles (image grids, 2/3/4 columns,
               the two uneven splits) — so folding it under Elements was our
               departure from the product, not a simplification of it. Splitting it
               back out also evens the rail: Elements was carrying three groups
               while every other tab carried one. */
            { id: 'layouts', label: 'Layouts', icon: ICONS.columns },
            { id: 'booksettings', label: 'Book settings', icon: ICONS.settings },
          ] as const).map((item) => {
            // While an overlay view owns the panel, no rail tab is showing — so
            // none should read as selected either, or the rail would claim to be
            // displaying something it isn't.
            const active = panelOverlay === null && railTab === item.id;
            return (
            <button
              key={item.id}
              onClick={() => {
                // First click out of an overlay goes back to the tabs rather than
                // collapsing the panel — the narrowViewport toggle below assumes
                // the tab it's toggling is the one on screen.
                if (panelOverlay) {
                  setPanelOverlay(null);
                  setRailTab(item.id);
                  if (narrowViewport) setPanelForcedOpen(true);
                  return;
                }
                /* Clicking Elements while already inside one of its categories
                   goes back to the index — the rail icon is the tab's own home,
                   and a tab that reopens three levels down is how you get stuck
                   in a panel with no visible way out. */
                if (item.id === 'elements' && railTab === 'elements') { setElementsCat(null); setMediaPicker(null); }
                if (narrowViewport && railTab === item.id) { setPanelForcedOpen((v) => !v); return; }
                setRailTab(item.id);
                if (narrowViewport) setPanelForcedOpen(true);
              }}
              className={`transition-colors duration-150${active ? '' : ' hover:bg-[#F6F7F9]'}`}
              style={{
                width: '90%', height: 58, borderRadius: RADIUS_LG, border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                background: active ? '#EEF3FF' : 'transparent', color: active ? BLUE : SLATE,
              }}
            >
              <Icon d={item.icon} size={19} />
              <span style={{ ...ns, fontSize: 11, fontWeight: 700 }}>{item.label}</span>
            </button>
            );
          })}
        </div>

        {/* contextual panel — collapses to make room for the canvas rather than
            competing with it. Both this and the Wordgenie panel below are
            flex-shrink-0 with nothing else yielding, so opening Wordgenie on top
            of whichever insert-tool tab was already open (there's always one —
            railTab has no "none" state) used to leave as little as ~212px of a
            720px page visible — worst for exactly the case Wordgenie exists for:
            rewriting a paragraph you can no longer see. narrowViewport extends
            the same relief to ordinary window width: below 1280px the app
            sidebar plus both editor rails plus both editor panels already leave
            under ~300px of canvas with nothing else open. Wordgenie always wins
            (there's genuinely no room once it's open); narrowViewport backs off
            when panelForcedOpen — the click-to-reveal escape hatch above — is
            set. Mirrors the Wordgenie panel's own width/border transition below
            so every trigger reads as one deliberate handoff. */}
        <div
          className="flex-shrink-0 h-full bg-white"
          style={{
            width: aiPanelOpen || (narrowViewport && !panelForcedOpen) ? 0 : PANEL_W,
            overflow: 'hidden',
            borderRight: aiPanelOpen || (narrowViewport && !panelForcedOpen) ? 'none' : `1px solid ${BORDER}`,
            transition: 'width 0.22s cubic-bezier(0.2,0,0.2,1)',
            pointerEvents: aiPanelOpen || (narrowViewport && !panelForcedOpen) ? 'none' : 'auto',
          }}
        >
          {/* Properties sits above the rail tabs and owns the whole panel while
              something is selected. The back arrow returns to whichever tab was
              open — railTab is never cleared, so there's always somewhere to go
              back to. */}
          {panelOverlay === 'properties' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="flex items-center flex-shrink-0" style={{ gap: 6, padding: '10px 10px 8px', borderBottom: `1px solid ${BORDER}` }}>
                <button
                  onClick={() => {
                    if (cropSpec) { setCropSpec(null); setCropError(''); return; }
                    // A photo inside a grid has a parent that can't be reached any
                    // other way (cells leave no clickable gap around them), so for
                    // that one case the arrow steps up to the grid instead of
                    // closing the panel — which is what the header beside it says
                    // it does.
                    if (inGridCell) { selectParentGrid(); return; }
                    setPanelOverlay(null);
                  }}
                  className="flex items-center justify-center cursor-pointer"
                  style={{ width: 26, height: 26, borderRadius: RADIUS_MD, border: 'none', background: 'none', color: SLATE, flexShrink: 0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F6F9'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                  aria-label="Back"
                >
                  <Icon d={ICONS.back} size={16} />
                </button>
                {/* Not a breadcrumb — one label, naming where the arrow goes.
                    On a photo inside a grid that's the grid; everywhere else the
                    arrow closes the panel and the label names what's selected. */}
                <span style={{ ...ns, fontSize: 13, fontWeight: 700, color: INK }}>
                  {cropSpec ? 'Crop' : inGridCell ? 'Photo grid' : selectionLabel}
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {cropSpec && (selection.kind === 'image' || selection.kind === 'coverElement') ? (
                  <CropPanel
                    aspectId={cropAspect}
                    busy={cropBusy}
                    error={cropError}
                    onAspect={applyCropAspect}
                    onReset={resetCrop}
                    onCancel={endCrop}
                    onApply={applyCrop}
                  />
                ) : selection.kind === 'image' ? (
                  <ImageInspector
                    editor={selection.editor}
                    onGoToMedia={() => { setPanelOverlay(null); setRailTab('photos'); }}
                    onStartCrop={startCrop}
                    onTransform={applyTransform}
                  />
                ) : selection.kind === 'imageGrid' ? (
                  <ImageGridInspector editor={selection.editor} />
                ) : selection.kind === 'shape' ? (
                  <ShapeInspector editor={selection.editor} />
                ) : selection.kind === 'embed' ? (
                  <EmbedInspector editor={selection.editor} />
                ) : selection.kind === 'qr' ? (
                  <QrInspector editor={selection.editor} />
                ) : selection.kind === 'chart' ? (
                  <ChartInspector editor={selection.editor} />
                ) : selection.kind === 'divider' ? (
                  <DividerInspector editor={selection.editor} />
                ) : selection.kind === 'openerRule' ? (
                  <OpenerRuleInspector
                    rule={openerRuleOf(pages.find((p) => p.id === selection.chapterId) as ChapterPage | undefined, theme)}
                    onChange={(patch) => setOpenerRule(selection.chapterId, patch)}
                  />
                ) : selection.kind === 'textfield' ? (
                  <TextFieldInspector editor={selection.editor} />
                ) : selection.kind === 'jumbotron' ? (
                  <JumbotronInspector editor={selection.editor} />
                ) : selection.kind === 'columns' ? (
                  <ColumnsInspector editor={selection.editor} />
                ) : selection.kind === 'table' ? (
                  <TableInspector editor={selection.editor} />
                ) : selection.kind === 'coverElement' ? (
                  <CoverInspector
                    page={pages.find((p) => p.id === selection.pageId) as SimplePage}
                    theme={theme}
                    selectedElementId={selection.elementId}
                    onUpdateElement={updateCoverElement}
                    onStartCrop={(elementId) => beginCrop({ kind: 'cover', pageId: selection.pageId, elementId })}
                    onSetPageBg={setPageBg}
                  />
                ) : selection.kind === 'page' && pages.find((p) => p.id === selection.pageId)?.type === 'cover' ? (
                  <CoverInspector
                    page={pages.find((p) => p.id === selection.pageId) as SimplePage}
                    theme={theme}
                    selectedElementId={null}
                    onUpdateElement={updateCoverElement}
                    onStartCrop={() => {}}
                    onSetPageBg={setPageBg}
                  />
                ) : selection.kind === 'page' ? (
                  <PageInfoInspector
                    page={pages.find((p) => p.id === selection.pageId) as PageMeta}
                    theme={theme}
                    onSetPageBg={setPageBg}
                  />
                ) : selection.kind === 'pageNumber' ? (
                  <PageNumberInspector pageNumbers={pageNumbers} setPageNumbers={setPageNumbers} />
                ) : selection.kind === 'footnote' ? (
                  <FootnoteInspector editor={selection.editor} />
                ) : selection.kind === 'footnotesSection' ? (
                  <FootnotesSectionInspector editor={selection.editor} />
                ) : selection.kind === 'chapter' && activeEditor ? (
                  <TextInspector editor={activeEditor} />
                ) : (
                  /* Reachable only in the gap between a selection clearing and the
                     effect above closing the overlay — a frame, not a resting state,
                     so it says nothing that would mislead if it flashes. */
                  <div style={{ padding: '16px 14px', ...ns, fontSize: 12.5, color: SLATE }}>
                    Select something on the page to edit it.
                  </div>
                )}
              </div>
            </div>
          )}
          {panelOverlay === null && railTab === 'text' && (
            <div style={{ overflowY: 'auto', height: '100%' }}>
              {/* Insert only. Formatting moved to Properties, which opens on a
                  text selection like it does for every other object — a second
                  copy here would put the same controls in two places. */}
              <InsertPanel
                currentPlan={currentPlan}
                groups={['Text']}
                onDragTile={setDraggedTile}
                onLockedClick={(tile) => setUpgradeCtx({ message: 'Unlock this block', feature: tile.label })}
                onLockedTextStyle={(tile) => setUpgradeCtx({ message: 'Unlock this text style', feature: tile.label })}
                // handleMediaInsertTile, not insertTileAtCursor, on every insert
                // panel — not just the one holding Video/Audio. Search spans all
                // tiles, so a media tile can now be clicked from any tab, and
                // insertTileAtCursor would drop the literal __EMBED_VIDEO__
                // sentinel on the page. It passes everything else through
                // untouched, so it's a safe superset.
                onInsertTile={handleMediaInsertTile}
                textExtras={<TextToolsPanel editor={activeEditor} />}
              />
            </div>
          )}
          {panelOverlay === null && railTab === 'photos' && (
            <div style={{ overflowY: 'auto', height: '100%' }}>
              <>
                  {selection.kind === 'image' && (() => {
                    const ed = selection.editor;
                    const src = (ed.getAttributes('image') as { src: string }).src;
                    return <PhotoSourcePanel currentPlan={currentPlan} currentSrc={src} onPick={(picked) => ed.chain().focus().updateAttributes('image', { src: picked }).run()} />;
                  })()}
                  {selection.kind === 'coverElement' && (() => {
                    const coverPage = pages.find((p) => p.id === selection.pageId) as SimplePage | undefined;
                    const el = coverPage?.coverElements?.find((e) => e.id === selection.elementId);
                    if (el?.type !== 'image') return null;
                    const { pageId, elementId } = selection;
                    return <PhotoSourcePanel currentPlan={currentPlan} currentSrc={el.src} onPick={(picked) => updateCoverElement(pageId, elementId, { src: picked })} />;
                  })()}
                  {selection.kind === 'openerImage' && (() => {
                    const chapter = pages.find((p) => p.id === selection.chapterId) as ChapterPage | undefined;
                    if (!chapter) return null;
                    return <PhotoSourcePanel currentPlan={currentPlan} currentSrc={chapter.openerImage ?? ''} onPick={(picked) => setOpenerImage(chapter.id, picked)} />;
                  })()}
                  {selection.kind === 'backmatterAvatar' && (() => {
                    const bmPage = pages.find((p) => p.id === selection.pageId) as SimplePage | undefined;
                    if (!bmPage) return null;
                    return <PhotoSourcePanel currentPlan={currentPlan} currentSrc={bmPage.authorPhoto ?? ''} onPick={(picked) => setBackmatterPhoto(bmPage.id, picked)} />;
                  })()}
                  {/* With nothing image-ish selected, the tab IS the photo browser —
                      no "Image" tile to click through first. That removes the
                      drill-down that made this panel mix two kinds of thing (tiles
                      that open a chooser next to tiles that insert), and it puts the
                      editor's most-used tool one click from the rail instead of two.
                      Picking drops the photo at the cursor; dragging places it exactly. */}
                  {selection.kind !== 'image' && selection.kind !== 'coverElement'
                    && selection.kind !== 'openerImage' && selection.kind !== 'backmatterAvatar' && (
                    <PhotoSourcePanel
                      currentPlan={currentPlan}
                      currentSrc=""
                      draggableToPlace
                      onDragTile={setDraggedTile}
                      onPick={(src) => insertMediaAtCursor('image', src)}
                    />
                  )}
              </>
            </div>
          )}
          {panelOverlay === null && railTab === 'elements' && (
            <div style={{ overflowY: 'auto', height: '100%' }}>
              {/* Three states, one tab: the index, a category, or a media source
                  picker. Video and Audio skip the middle one — their row opens the
                  picker straight from the index. */}
              {mediaPicker ? (
                <MediaPickerPanel
                  currentPlan={currentPlan}
                  picker={mediaPicker}
                  onPick={(src, label) => setMediaPicker((prev) => (prev ? { ...prev, picked: { src, label } } : prev))}
                  onDragTile={setDraggedTile}
                  onPlaceAtCursor={() => { if (mediaPicker.picked) insertMediaAtCursor(mediaPicker.kind, mediaPicker.picked.src); }}
                  onBack={() => setMediaPicker(null)}
                />
              ) : (
              <InsertPanel
                currentPlan={currentPlan}
                groups={elementsCat ? [elementsCat] : []}
                index={elementsCat ? undefined : ELEMENTS_CATEGORIES.map((c) => ({
                  id: c.id,
                  label: c.label,
                  icon: c.icon,
                  onOpen: () => (c.group ? setElementsCat(c.group) : setMediaPicker({ kind: c.media!, picked: null })),
                }))}
                header={elementsCat ? <PanelBackRow label="Elements" onBack={() => setElementsCat(null)} /> : undefined}
                onDragTile={setDraggedTile}
                onLockedClick={(tile) => setUpgradeCtx({ message: 'Unlock this block', feature: tile.label })}
                onLockedTextStyle={(tile) => setUpgradeCtx({ message: 'Unlock this text style', feature: tile.label })}
                // handleMediaInsertTile, not insertTileAtCursor: a search hit can be
                // a video or audio tile from any tab, and insertTileAtCursor would
                // drop the literal __EMBED_VIDEO__ sentinel on the page.
                onInsertTile={handleMediaInsertTile}
              />
              )}
            </div>
          )}
          {panelOverlay === null && railTab === 'layouts' && (
            <div style={{ overflowY: 'auto', height: '100%' }}>
              <InsertPanel
                currentPlan={currentPlan}
                groups={['Layout']}
                onDragTile={setDraggedTile}
                onLockedClick={(tile) => setUpgradeCtx({ message: 'Unlock this block', feature: tile.label })}
                onLockedTextStyle={(tile) => setUpgradeCtx({ message: 'Unlock this text style', feature: tile.label })}
                // handleMediaInsertTile, not insertTileAtCursor, on every insert
                // panel — not just the one holding Video/Audio. Search spans all
                // tiles, so a media tile can now be clicked from any tab, and
                // insertTileAtCursor would drop the literal __EMBED_VIDEO__
                // sentinel on the page. It passes everything else through
                // untouched, so it's a safe superset.
                onInsertTile={handleMediaInsertTile}
              />
            </div>
          )}
          {panelOverlay === null && railTab === 'templates' && (
            <TemplatesPanel
              currentPlan={currentPlan}
              activeTheme={activeTheme}
              pages={pages}
              fieldContent={fieldContent}
              onApplyTemplate={(id) => {
                const tpl = THEMES.find((t) => t.id === id as ThemeId);
                if (!tpl) return;
                if (shouldShowTierBadge(currentPlan as never, tpl.requiredPlan)) {
                  setUpgradeCtx({ message: `Unlock the ${tpl.name} template`, feature: `${tpl.name} template` });
                  return;
                }
                applyTemplate(coverPageId, tpl.id);
              }}
            />
          )}
          {panelOverlay === null && railTab === 'booksettings' && (
            /* One scroll container owning the page padding, instead of four
               children each carrying `16px 14px` plus a top border. That put a
               divider at every COMPONENT boundary — which is not where the
               meaning changes: Book details and Series were divided from Page
               size, but Page size and Margins were not divided from each other,
               though all four are peers. Dividers now mark the three real
               groups and nothing else.

               Order: what the book IS (details, series, contents) › what a page
               is (size, margins, numbers) › how the editor behaves (writing).
               Book details leads because it is always actionable and is what
               EPUB export actually requires; Table of contents used to lead, and
               it is the one section that can open showing a "select a chapter"
               placeholder, so the tab greeted you with a half-inert section. */
            <div style={{ overflowY: 'auto', height: '100%', padding: '16px 0 28px' }}>
              <MetadataPanel metadata={metadata} setMetadata={setMetadata} />
              <DesignPanel
                selection={selection}
                pages={pages}
                onSetTocExcluded={setTocExcluded}
                hasToc={pages.some((pg) => pg.type === 'toc')}
                onAddToc={addTocPage}
                onRemoveToc={() => { const t = pages.find((pg) => pg.type === 'toc'); if (t) deletePage(t.id); }}
              />
              {/* Cover controls used to live here as a fixed bg-image/overlay picker —
                  now that the cover is a real element canvas, its controls only make
                  sense in the context of a selected element, so they live in the
                  Properties view (click the cover or an element on it) instead. */}
              {/* Keyed on the applied setting, so applying one remounts this
                  with a fresh draft. The alternative — an effect that copies
                  the props back over the draft — is the same reset written as
                  a render, a commit and a second render. */}
              <PageSetupSection
                key={`${pageSizeId}:${marginX}:${marginY}`}
                sizeId={pageSizeId}
                marginX={marginX}
                marginY={marginY}
                bookPageCount={bookPages.length}
                onApply={({ sizeId, marginX: mx, marginY: my }) => { setPageSizeId(sizeId); setMarginX(mx); setMarginY(my); }}
              />
              <SettingsPanel pageNumbers={pageNumbers} setPageNumbers={setPageNumbers} spellcheck={spellcheck} setSpellcheck={setSpellcheck} paragraphStyle={paragraphStyle} setParagraphStyle={setParagraphStyle} />
            </div>
          )}
        </div>

        {/* Wordgenie panel — same slot Presentation's AI chat opens into,
            between the left rail's content panel and the canvas. */}
        <div
          className="flex-shrink-0 flex flex-col bg-white overflow-hidden"
          style={{ width: aiPanelOpen ? 300 : 0, borderRight: aiPanelOpen ? `1px solid ${BORDER}` : 'none', transition: 'width 0.22s cubic-bezier(0.2,0,0.2,1)' }}
        >
          <div className="flex items-center justify-between flex-shrink-0" style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, minWidth: 300 }}>
            <div className="flex items-center" style={{ gap: 7 }}>
              <AISparkleIcon size={16} />
              <span style={{ ...ns, fontSize: 14, fontWeight: 700, color: INK }}>Wordgenie</span>
            </div>
            <button onClick={() => setAiPanelOpen(false)} className="flex items-center justify-center cursor-pointer" style={{ width: 26, height: 26, borderRadius: RADIUS_SM, background: '#F5F7FA', border: 'none' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col" style={{ padding: 16, gap: 12, minWidth: 300 }}>
            {aiMessages.map((msg, i) => (
              <div key={i} className="flex flex-col" style={{ alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 8 }}>
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`} style={{ width: '100%' }}>
                  {msg.role === 'ai' && (
                    <div className="flex items-end flex-shrink-0" style={{ marginRight: 7, marginBottom: 2 }}>
                      <div className="flex items-center justify-center" style={{ width: 22, height: 22, borderRadius: '50%', background: '#F0EEFF' }}>
                        <AISparkleIcon size={13} />
                      </div>
                    </div>
                  )}
                  <div style={{
                    maxWidth: '82%', padding: '9px 12px', lineHeight: 1.5, borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                    background: msg.role === 'user' ? BLUE : '#F4F6F9', ...ns, fontSize: 13, color: msg.role === 'user' ? '#fff' : INK,
                  }}>
                    {msg.text}
                  </div>
                </div>
                {msg.pills && (
                  <div className="flex flex-wrap" style={{ gap: 6, paddingLeft: 29 }}>
                    {msg.pills.map((pill) => (
                      <button
                        key={pill}
                        onClick={() => sendAiChatText(pill)}
                        className="cursor-pointer"
                        style={{ ...ns, fontSize: 12, fontWeight: 500, color: '#7C5CFC', padding: '5px 11px', borderRadius: 20, border: '1.5px solid #DDD0FB', background: '#F9F7FF', textAlign: 'left' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#F0EEFF'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#F9F7FF'; }}
                      >
                        {pill}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex-shrink-0" style={{ padding: '12px 16px', minWidth: 300 }}>
            <div className="flex items-center" style={{ gap: 8, background: '#F4F6F9', borderRadius: RADIUS_MD, padding: '8px 12px' }}>
              <input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendAiMessage(); }}
                placeholder={activeChapterId ? 'Ask about this chapter…' : 'Ask about your book…'}
                className="flex-1 outline-none bg-transparent"
                style={{ ...ns, fontSize: 13, color: INK, border: 'none' }}
              />
              <button
                onClick={sendAiMessage}
                disabled={!aiInput.trim()}
                className="flex items-center justify-center cursor-pointer flex-shrink-0"
                style={{ width: 28, height: 28, borderRadius: RADIUS_SM, background: aiInput.trim() ? BLUE : '#E0E5EB', border: 'none' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              </button>
            </div>
          </div>
        </div>

        {/* canvas */}
        <div className="flex-1 min-w-0 h-full flex flex-col">
        {/* The "viewing a past version" banner lives here, OUTSIDE the zoomed/
            scrollable region below — position:sticky inside a transform:scale()
            ancestor doesn't stick (see zoom-breaks-sticky), so this is a plain
            flex row pinned above the scroll area instead of fighting that. */}
        {viewingVersionEntry && (
          <div className="flex-shrink-0 flex items-center justify-between" style={{ padding: '10px 20px', background: '#FFF7E0', borderBottom: '1px solid #F0DFA6' }}>
            <span style={{ ...ns, fontSize: 13, color: INK }}>
              Viewing a version from {relativeTimeLabel(viewingVersionEntry.savedAt)} — read only.
            </span>
            <div className="flex items-center" style={{ gap: 8 }}>
              <button
                onClick={() => setViewingVersionId(null)}
                className="cursor-pointer"
                style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: INK, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_SM, padding: '6px 12px' }}
              >
                Return to current
              </button>
              <button
                onClick={() => restoreVersion(viewingVersionEntry)}
                className="cursor-pointer"
                style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: '#fff', background: BLUE, border: 'none', borderRadius: RADIUS_SM, padding: '6px 12px' }}
              >
                Restore this version
              </button>
            </div>
          </div>
        )}
        {/* overflow-x here used to be the implicit default (visible): at any
            viewport where the fixed side rails leave less than PAGE_W available,
            the centered page div overflowed sideways with nothing clipping it —
            it just rendered underneath the Inspector panel's opaque background,
            silently hiding real manuscript text with no scrollbar or warning. */}
        <div className="flex-1 overflow-auto" style={{ background: '#EEF0F3', padding: '40px 24px 120px' }}>
          {/* `transform` doesn't affect layout, so the scroll container used to size
              itself to the unscaled document: above 100% the end of the book was
              unreachable, below it there was a large dead gap. The outer box is
              given the scaled height explicitly, measured off the inner one. */}
          <div style={{ width: geometry.w * (zoom / 100), height: canvasHeight * (zoom / 100), margin: '0 auto' }}>
          <div ref={canvasInnerRef} style={{ width: geometry.w, transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}>
            {viewingVersionEntry ? (
              // Read-only: the same PreviewPage the Preview overlay and the
              // History panel's old preview pane both already use — no new
              // rendering path, just fed a checkpoint instead of live state.
              viewingVersionEntry.pages.map((p) => (
                <div key={p.id} style={{ marginBottom: 40 }}>
                  <PreviewPage page={p} pages={viewingVersionEntry.pages} theme={viewingVersionTheme} chapterContent={viewingVersionEntry.chapterContent} fieldContent={viewingVersionEntry.fieldContent} metadata={metadata} />
                </div>
              ))
            ) : !hydrated ? (
              /* Chapter editors read their HTML once, at creation — TipTap's
                 `content` option is not reactive. Rendering them before loadBook()
                 has run built every editor from the sample text, and the restored
                 content then had nowhere to go: the doc stayed as parsed from the
                 seed. Any attribute the seed didn't carry (image wrap, caption,
                 alt/decorative, lock, corner radius, border, shadow) silently
                 reverted on every reload. This gate is what the hydrate effect's
                 own comment always claimed was true. */
              null
            ) : (
            pages.map((p) => (
              <div key={p.id} ref={(el) => { pageRefs.current[p.id] = el; }} style={{ marginBottom: 40 }}>
                {p.type === 'chapter' ? (
                  <ChapterEditor
                    page={p}
                    theme={theme}
                    zoom={zoom}
                    pageNumbers={pageNumbers}
                    pageNumberIndex={chapterCountForNumbering(p.id)}
                    chapterNumber={pages.filter((pg) => pg.type === 'chapter').findIndex((pg) => pg.id === p.id) + 1}
                    isSelected={selection.kind === 'chapter' && selection.chapterId.split('::')[0] === p.id}
                    isDragActive={!!draggedTile || movingBlock}
                    onMediaDropped={() => setMediaPicker(null)}
                    onSetOpenerImage={setOpenerImage}
                    getFieldEditor={(key) => editorRegistry.current.get(key)?.editor}
                    moveDragRef={moveDragRef}
                    onMoveDragActiveChange={setMovingBlock}
                    currentSelection={selection}
                    onSelection={handleSelection}
                    onAddChapterAfter={addChapterAfter}
                    onSplitChapter={splitChapter}
                    onBeginChapterEdit={beginChapterEdit}
                    onWordCountChange={(id, words) => setWordCounts((prev) => ({ ...prev, [id]: words }))}
                    onPageCountChange={handlePageCountChange}
                    onAltStatusChange={(id, missing) => setAltStatus((prev) => ({ ...prev, [id]: missing }))}
                    onEditorFocus={(ed) => { setActiveEditor(ed); setActiveChapterId(p.id); }}
                    onContentChange={(id, html) => setChapterContent((prev) => ({ ...prev, [id]: html }))}
                    titleHtml={fieldContent[`${p.id}::title`] ?? p.titleHtml}
                    eyebrowHtml={fieldContent[`${p.id}::eyebrow`] ?? DEFAULT_EYEBROW_HTML}
                    onFieldChange={(key, html) => setFieldContent((prev) => ({ ...prev, [key]: html }))}
                    onTitleChange={(fieldKey, html) => {
                      // SimpleFieldEditor already hands back its own compound
                      // "chapterId::title" key here, not a raw chapter id — use it
                      // as-is for fieldContent, and strip the suffix only for pages.
                      setFieldContent((prev) => ({ ...prev, [fieldKey]: html }));
                      const chapterId = fieldKey.split('::')[0];
                      const plain = stripTags(html);
                      const title = plain || 'Untitled chapter';
                      setPages((prev) => prev.map((pg) => (pg.id === chapterId && pg.type === 'chapter' && pg.title !== title ? { ...pg, title } : pg)));
                      setTitleWordCounts((prev) => ({ ...prev, [chapterId]: plain ? plain.split(/\s+/).filter(Boolean).length : 0 }));
                    }}
                  />
                ) : (
                  <SimplePageBlock
                    page={p}
                    theme={theme}
                    pages={pages}
                    chapterHtml={chapterContent}
                    fieldContent={fieldContent}
                    pageNumbers={pageNumbers}
                    pageNumberIndex={chapterCountForNumbering(p.id)}
                    selection={selection}
                    onSelection={handleSelection}
                    onEditorFocus={(ed) => { setActiveEditor(ed); setActiveChapterId(null); }}
                    onContentChange={(key, html) => setFieldContent((prev) => ({ ...prev, [key]: html }))}
                    onSelectPage={(pageId) => setSelection({ kind: 'page', pageId, viaCanvas: true })}
                    onUpdateElement={updateCoverElement}
                    onReorderElement={reorderCoverElement}
                    onDuplicateElement={duplicateCoverElement}
                    onDeleteElement={deleteCoverElement}
                    overlayOpen={anyOverlayOpen}
                    onSetBackmatterPhoto={setBackmatterPhoto}
                  />
                )}
              </div>
            ))
            )}
          </div>
          </div>
        </div>
        </div>

        {/* ── right panel: the navigator ────────────────────────────────────────
            Pages and Chapters as permanent tabs, with History and Find swapping
            over them when the top bar opens one. They are NOT merged into a single
            list, because they aren't duplicates: PagesPanel is thumbnails of every
            page type, ChaptersPanel is a chapters-only outline with word counts —
            the Word/Scrivener thumbnail-vs-outline split, and both halves earn
            their place. */}
        {rightOpen && (
        <div className="flex-shrink-0 h-full bg-white" style={{ width: INSPECTOR_W, borderLeft: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          {rightOverlay ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="flex items-center flex-shrink-0" style={{ gap: 6, padding: '10px 10px 8px', borderBottom: `1px solid ${BORDER}` }}>
                <button
                  onClick={() => setRightOverlay(null)}
                  className="flex items-center justify-center cursor-pointer"
                  style={{ width: 26, height: 26, borderRadius: RADIUS_MD, border: 'none', background: 'none', color: SLATE, flexShrink: 0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F6F9'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                  aria-label="Back"
                >
                  <Icon d={ICONS.back} size={16} />
                </button>
                <span style={{ ...ns, fontSize: 13, fontWeight: 700, color: INK }}>
                  {rightOverlay === 'history' ? 'Version history' : 'Find & replace'}
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                {rightOverlay === 'history' ? (
                  <HistoryPanel versions={versions} viewingVersionId={viewingVersionId} onSelectVersion={setViewingVersionId} />
                ) : (
                  <FindPanel registry={editorRegistry} pages={pages} onJump={jumpTo} inputRef={findInputRef} />
                )}
              </div>
            </div>
          ) : rightTab === 'pages' ? (
            <div style={{ overflowY: 'auto', height: '100%' }}>
              <PagesPanel
                pages={pages}
                theme={theme}
                chapterContent={chapterContent}
                fieldContent={fieldContent}
                activePageId={pagesPanelActiveId}
                onJump={(id) => { jumpTo(id); setPagesActiveId(id); }}
                bookPages={bookPages}
                metadata={metadata}
                onAddPageAt={addChapterAfter}
                onDuplicatePage={duplicatePage}
                onDeletePage={deletePage}
                onReorder={reorderChapter}
              />
            </div>
          ) : (
            <div className="h-full" style={{ minHeight: 0 }}>
              <ChaptersPanel
                pages={pages}
                wordCounts={wordCounts}
                titleWordCounts={titleWordCounts}
                wordTotal={Object.values(wordCounts).reduce((sum, n) => sum + n, 0) + Object.values(titleWordCounts).reduce((sum, n) => sum + n, 0)}
                onJump={jumpTo}
                onMoveToEdge={moveChapterToEdge}
                onReorder={reorderChapter}
                onDelete={deletePage}
                onAddChapter={() => {
                  const lastChapter = [...pages].reverse().find((pg) => pg.type === 'chapter');
                  addChapterAfter(lastChapter?.id ?? coverPageId);
                }}
              />
            </div>
          )}
        </div>
        )}

        {/* right icon rail. Clicking the active tab collapses the panel, handing its
            width back to the canvas — the left rail has no equivalent because its
            tabs are where you go to DO something, while this side is reference you
            may well want out of the way while writing. */}
        <div className="flex-shrink-0 h-full flex flex-col items-center bg-white" style={{ width: RAIL_W, borderLeft: `1px solid ${BORDER}`, paddingTop: 12, gap: 4 }}>
          {([
            { id: 'pages', label: 'Pages', icon: ICONS.pagesTab },
            // ICONS.chapterBreak reads as a blank box at 19px; ICONS.list already
            // means "a list of items" elsewhere in this file.
            { id: 'chapters', label: 'Chapters', icon: ICONS.list },
          ] as const).map((item) => {
            // An overlay owns the panel, so neither tab is showing its content.
            const active = rightOpen && rightOverlay === null && rightTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (rightOverlay) { setRightOverlay(null); setRightTab(item.id); setRightOpen(true); return; }
                  if (rightOpen && rightTab === item.id) { setRightOpen(false); return; }
                  setRightTab(item.id);
                  setRightOpen(true);
                }}
                className={`transition-colors duration-150${active ? '' : ' hover:bg-[#F6F7F9]'}`}
                style={{
                  width: '90%', height: 58, borderRadius: RADIUS_LG, border: 'none', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                  background: active ? '#EEF3FF' : 'transparent', color: active ? BLUE : SLATE,
                }}
              >
                <Icon d={item.icon} size={19} />
                <span style={{ ...ns, fontSize: 11, fontWeight: 700 }}>{item.label}</span>
              </button>
            );
          })}
        </div>

      </div>

      {cropSpec && (
        <CropOverlay
          targetRef={cropImgRef}
          crop={cropSpec}
          onChange={(next) => setCropSpec(next)}
        />
      )}

      {upgradeCtx && (
        <UpgradePlanModal
          onClose={() => setUpgradeCtx(null)}
          contextMessage={upgradeCtx.message}
          highlightPlanId="pro"
          highlightFeature={upgradeCtx.feature}
        />
      )}
      {showPublishModal && (
        <PublisherOverlay
          paragraphStyle={paragraphStyle}
          metadata={metadata}
          chapters={pages.filter((p): p is ChapterPage => p.type === 'chapter').map((c) => {
            const titleField = fieldContent[`${c.id}::title`] ?? c.titleHtml;
            // The title lives in its own field in the editor now, but the exported
            // chapter still needs a real visible heading — reassemble it here rather
            // than inside the editing data model. Swapping the field's own <p> tag
            // for <h2> (instead of re-typing stripped text) keeps it already-escaped
            // and preserves any inline marks (bold, a link) the user applied.
            const titleHeadingHtml = titleField.trim()
              ? titleField.replace(/^<p[^>]*>/, '<h2>').replace(/<\/p>\s*$/, '</h2>')
              : `<h2>${c.title}</h2>`;
            /* The live marker gets its number from a NodeView counting siblings;
               nothing counts anything in an exported file, so the numbers and the
               noteref/footnote pairing that makes them pop up on Kindle get baked
               in here, at the one place chapter HTML leaves the editor. */
            const chapterNumber = pages.filter((pg) => pg.type === 'chapter').findIndex((pg) => pg.id === c.id) + 1;
            const fieldVals = { author: metadata.author, bookTitle: metadata.title, chapterTitle: stripTags(titleField) || c.title, chapterNumber };
            const body = resolveFieldTokens(applyFootnoteNumbering(chapterContent[c.id] ?? c.initialHtml, c.id), fieldVals);
            return { id: c.id, title: c.title, layout: c.layout, html: titleHeadingHtml + body };
          })}
          theme={theme}
          // The visible contents page used to be dropped at the door: the user edited
          // it and it never reached the file. It's generated in the package from the
          // real chapter list so every entry (and every sub-heading) actually links.
          tocHeading={stripTags(fieldContent[`${pages.find((p) => p.type === 'toc')?.id}::heading`] ?? '') || 'Contents'}
          includeTocPage={pages.some((p) => p.type === 'toc')}
          missingAltCount={missingAlt}
          hasCoverImage={(pages.find((p) => p.type === 'cover') as SimplePage | undefined)?.coverElements?.some((el) => el.type === 'image') ?? false}
          coverImage={(pages.find((p) => p.type === 'cover') as SimplePage | undefined)?.coverElements?.find((el): el is CoverImageElement => el.type === 'image')?.src}
          coverTitle={stripTags(fieldContent[`${coverPageId}::title`] ?? metadata.title)}
          coverSubtitle={stripTags(fieldContent[`${coverPageId}::subtitle`] ?? metadata.subtitle)}
          backMatterHtml={fieldContent[`${backMatterPageId}::bio`] ?? ''}
          onClose={() => setShowPublishModal(false)}
          currentPlan={currentPlan}
          onLockedExport={() => setUpgradeCtx({ message: 'Unlock EPUB export', feature: 'EPUB export' })}
        />
      )}
      {showPreview && (
        <PreviewOverlay
          pages={pages}
          theme={theme}
          chapterContent={chapterContent}
          fieldContent={fieldContent}
          metadata={metadata}
          pageNumbers={pageNumbers}
          title={metadata.title || 'Untitled book'}
          onClose={() => setShowPreview(false)}
        />
      )}

      {undoToast && (
        <UndoToast
          label={undoToast.label}
          onUndo={() => restoreSnapshot(undoToast.snapshot)}
          onDismiss={() => setUndoToast(null)}
        />
      )}
    </div>
    </EditorRegistryContext.Provider>
    </PageGeometryContext.Provider>
    </EditorPrefsContext.Provider>
    </PhotoSuggestContext.Provider>
    </ImageLibraryContext.Provider>
  );
}
