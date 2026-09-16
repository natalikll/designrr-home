'use client';

import { useState, useRef, useCallback, useEffect, useMemo, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { NodeSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle, FontFamily, FontSize } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import TiptapImage from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Node, Extension, mergeAttributes, type JSONContent } from '@tiptap/core';
import { useFlowStore, ownsPlan } from '@/stores/flowStore';
import { buildEpub, downloadEpub, inlineExternalImages } from '@/lib/epub';
import { runChecks, summarise, type CheckResult, type CheckStatus } from '@/lib/bookChecks';
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
const RADIUS_SM = 6;
const RADIUS_MD = 8;
const RADIUS_LG = 12;
const RADIUS_PILL = 999;
const RAIL_W = 76;
const PANEL_W = 240;
const INSPECTOR_W = 296;
const PAGE_W = 720;
const PAGE_MIN_H = 920; // roughly a US-letter ratio at PAGE_W, so a short page still reads as a page
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

const ImageLibraryContext = createContext<{
  images: ImageLibraryEntry[];
  add: (label: string, src: string, source?: 'upload' | 'generated') => void;
  creditsUsed: number;
  useCredits: (n: number) => void;
}>({ images: STOCK_IMAGES, add: () => {}, creditsUsed: 0, useCredits: () => {} });

const EditorPrefsContext = createContext<{ spellcheck: boolean }>({ spellcheck: true });

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
          };
        },
      },
      ...(this.parent?.() ?? []),
    ];
  },
  renderHTML({ node }) {
    const { src, alt, wrap, caption, decorative, locked } = node.attrs as { src: string; alt: string; wrap: WrapValue; caption: string; decorative: boolean; locked: boolean };
    return [
      'figure',
      { 'data-wrap': wrap, ...(locked ? { 'data-locked': 'true' } : {}), class: `book-img-wrap book-img-wrap--${wrap}` },
      ['img', decorative ? { src, alt: '', role: 'presentation' } : { src, alt }],
      ...(caption ? [['figcaption', {}, caption] as const] : []),
    ];
  },
});

/* A boxed note/tip — one of the block types named in the original document-tree
   decision but never actually built. A real schema node (not a plain <div>) so it
   survives ProseMirror's HTML parsing and stays selectable/deletable as a unit. */
const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': 'true', class: 'book-callout' }), 0];
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
const ShapeBlock = Node.create({
  name: 'shapeBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      d: { default: '' },
      viewBox: { default: '0 0 24 24' },
      color: { default: '#52637A' },
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
      getAttrs: (el) => ({
        d: (el as HTMLElement).getAttribute('data-d') || '',
        viewBox: (el as HTMLElement).getAttribute('data-viewbox') || '0 0 24 24',
        color: (el as HTMLElement).getAttribute('data-color') || '#52637A',
        locked: (el as HTMLElement).getAttribute('data-locked') === 'true',
      }),
    }];
  },
  renderHTML({ node }) {
    const { d, viewBox, color, locked } = node.attrs as { d: string; viewBox: string; color: string; locked: boolean };
    return ['div', { 'data-shape': 'true', 'data-d': d, 'data-viewbox': viewBox, 'data-color': color, ...(locked ? { 'data-locked': 'true' } : {}), class: 'book-shape' },
      ['svg', { viewBox, width: '56', height: '56', fill: color }, ['path', { d }]],
    ];
  },
  addNodeView() {
    return ({ node }) => {
      const { d, viewBox, color } = node.attrs as { d: string; viewBox: string; color: string };
      const dom = document.createElement('div');
      dom.className = 'book-shape';
      dom.setAttribute('data-shape', 'true');
      dom.setAttribute('data-d', d);
      dom.setAttribute('data-viewbox', viewBox);
      dom.setAttribute('data-color', color);
      dom.contentEditable = 'false';
      dom.innerHTML = `<svg viewBox="${escapeHtml(viewBox)}" width="56" height="56" fill="${escapeHtml(color)}"><path d="${escapeHtml(d)}"></path></svg>`;
      return { dom };
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

/* QR code — old Designrr's Elements rail includes one. No real encoder is wired up
   (matches how every other network-backed feature here is mocked, e.g. STOCK_IMAGES),
   so the "code" is a deterministic pseudo-random module grid seeded from the URL
   text — different URLs render visibly different patterns, close enough to sell the
   idea without a real QR library dependency. */
function qrModules(seed: string): boolean[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: boolean[] = [];
  for (let i = 0; i < 100; i++) { h = (h * 1103515245 + 12345) >>> 0; out.push((h >>> 16) % 3 === 0); }
  return out;
}
const QrCodeBlock = Node.create({
  name: 'qrCodeBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      url: { default: 'https://example.com' },
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
        locked: (el as HTMLElement).getAttribute('data-locked') === 'true',
      }),
    }];
  },
  renderHTML({ node }) {
    const { url, locked } = node.attrs as { url: string; locked: boolean };
    const modules = qrModules(url || 'https://example.com');
    const cell = 6;
    const rects = modules.map((on, i) => (on ? ['rect', { x: (i % 10) * cell, y: Math.floor(i / 10) * cell, width: cell, height: cell, fill: '#15191F' }] : null)).filter(Boolean);
    return ['div', { 'data-qr': 'true', 'data-url': url, ...(locked ? { 'data-locked': 'true' } : {}), class: 'book-qr' },
      ['svg', { viewBox: '0 0 60 60', width: '84', height: '84' },
        ['rect', { x: 0, y: 0, width: 60, height: 60, fill: '#fff' }],
        ...(rects as (string | Record<string, unknown>)[][]),
      ],
      ['span', { class: 'book-qr-url' }, url],
    ];
  },
  addNodeView() {
    return ({ node }) => {
      const { url } = node.attrs as { url: string };
      const modules = qrModules(url || 'https://example.com');
      const cell = 6;
      const rectsHtml = modules.map((on, i) => (on ? `<rect x="${(i % 10) * cell}" y="${Math.floor(i / 10) * cell}" width="${cell}" height="${cell}" fill="#15191F"></rect>` : '')).join('');
      const dom = document.createElement('div');
      dom.className = 'book-qr';
      dom.setAttribute('data-qr', 'true');
      dom.setAttribute('data-url', url);
      dom.contentEditable = 'false';
      dom.innerHTML = `<svg viewBox="0 0 60 60" width="84" height="84"><rect x="0" y="0" width="60" height="60" fill="#fff"></rect>${rectsHtml}</svg><span class="book-qr-url">${escapeHtml(url)}</span>`;
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
      return { dom };
    };
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
      locked: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-locked') === 'true',
        renderHTML: (attrs: Record<string, unknown>) => (attrs.locked ? { 'data-locked': 'true' } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-image-grid]', getAttrs: (el) => ({ cols: Number((el as HTMLElement).getAttribute('data-cols')) || 2 }) }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const { cols } = node.attrs as { cols: number };
    return ['div', mergeAttributes(HTMLAttributes, { 'data-image-grid': 'true', 'data-cols': String(cols), class: `book-image-grid book-image-grid--${cols}` }), 0];
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
      types: ['paragraph', 'bulletList', 'table'],
      attributes: {
        class: {
          default: null,
          parseHTML: (el) => el.getAttribute('class'),
          renderHTML: (attrs) => (attrs.class ? { class: attrs.class } : {}),
        },
      },
    }];
  },
});

/* ── document model ───────────────────────────────────────────────────────── */
type LayoutId = 'standard' | 'opener' | 'image-led' | 'quote-pull' | 'two-column';
const LAYOUTS: { id: LayoutId; name: string; hint: string }[] = [
  { id: 'standard',    name: 'Standard',    hint: 'Heading, then flowing body text' },
  { id: 'opener',      name: 'Opener',      hint: 'Large title, extra space above the body' },
  { id: 'image-led',   name: 'Image-led',   hint: 'A full-bleed image opens the chapter' },
  { id: 'quote-pull',  name: 'Quote-pull',  hint: 'First quote is pulled out and enlarged' },
  { id: 'two-column',  name: 'Two-column',  hint: 'Body text runs in two columns' },
];

/* Per-chapter style overrides: the token/override mechanism. A chapter's heading
   colour and body font normally point at the active theme; the moment a user
   picks a value by hand in the Inspector, that single property freezes here and
   stops tracking the theme. Re-applying a theme only ever touches chapters (and
   properties) that aren't in this map. */
interface ChapterOverrides {
  headingColor?: string;
  bodyFont?: string;
}

interface ChapterPage {
  id: string;
  type: 'chapter';
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
interface CoverImageElement extends CoverElementBase { type: 'image'; src: string; overlayDark?: boolean; }
interface CoverShapeElement extends CoverElementBase {
  type: 'shape'; shape: 'rectangle' | 'triangle' | 'circle' | 'rounded'; color: string;
  // Which corner holds the triangle's right angle — 4 fixed diagonal orientations
  // instead of a rotation control, since nothing else in this editor supports rotation.
  corner?: 'tl' | 'tr' | 'bl' | 'br';
}
type CoverElement = CoverTextElement | CoverImageElement | CoverShapeElement;

function fieldKeyForCoverText(pageId: string, el: CoverTextElement): string {
  return el.role === 'custom' ? `${pageId}::el:${el.id}` : `${pageId}::${el.role}`;
}

interface SimplePage {
  id: string;
  type: 'cover' | 'toc' | 'backmatter';
  title: string;
  coverElements?: CoverElement[];
  /* backmatter only — a real author photo for the About-the-Author panel, picked
     the same way as openerImage/cover images. Unset falls back to the drawn
     circle+body silhouette. */
  authorPhoto?: string;
}
type PageMeta = ChapterPage | SimplePage;

let coverElId = 0;
const nextCoverElId = () => `cel-${++coverElId}`;

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
  // reproducible with this editor's fill-only shape primitives (rectangle/
  // triangle/circle/rounded, no strokes, no arbitrary paths) — approximated
  // here the same way Hand-Illustrated approximates its sun-over-hills scene.
  {
    id: 'growth', name: 'Growth',
    headingFont: "'Nunito Sans', sans-serif", bodyFont: "'Source Sans 3', sans-serif", headingColor: '#15191F', accentColor: '#0E8FA8', bg: '#FFFFFF', bodyColor: '#2B2B2B',
    coverElements: [
      { id: 'cover-bg', type: 'shape', shape: 'rectangle', x: 0, y: 0, w: 100, h: 100, color: '#0B0F14' },
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
  { id: 'p-cover', type: 'cover', title: 'Cover', coverElements: cloneCoverElements(THEMES[0].coverElements) },
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
   Text formatting lives in the right panel (TextInspector), matching Designrr's
   own live editor and this codebase's presentation editor — both put text
   controls in the panel, not a floating toolbar. A focused chapter with no
   object selected shows TextInspector; a selected image/shape/embed swaps in
   its own inspector. */
type Selection =
  | { kind: 'none' }
  | { kind: 'chapter'; chapterId: string }
  | { kind: 'page'; pageId: string }
  | { kind: 'image'; chapterId: string; editor: Editor }
  | { kind: 'shape'; chapterId: string; editor: Editor }
  | { kind: 'embed'; chapterId: string; editor: Editor }
  | { kind: 'qr'; chapterId: string; editor: Editor }
  | { kind: 'chart'; chapterId: string; editor: Editor }
  | { kind: 'textfield'; chapterId: string; editor: Editor }
  | { kind: 'jumbotron'; chapterId: string; editor: Editor }
  | { kind: 'columns'; chapterId: string; editor: Editor }
  | { kind: 'table'; chapterId: string; editor: Editor }
  | { kind: 'coverElement'; pageId: string; elementId: string }
  // Same idea as coverElement, for a photo that lives on the page/chapter
  // itself rather than in a coverElements array: the chapter-opener image and
  // the back-matter avatar photo.
  | { kind: 'openerImage'; chapterId: string }
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
const ICONS = {
  design: 'M12 2a5 5 0 0 0-5 5c0 2 1 3 1 5a4 4 0 0 0 4 4h.5a1.5 1.5 0 0 0 1.06-2.56A1 1 0 0 1 14 12h2a5 5 0 0 0 5-5c0-3-4-5-9-5z',
  // Triangle overlapping a circle — matches old Designrr's "Artwork & shapes"
  // rail icon (a two-tone triangle-over-circle glyph), redrawn as a single
  // outline to match this app's own icon rendering (Icon() always strokes one
  // currentColor path — see the comment above that component).
  shapesTab: 'M14 4L21 18H7zM7 12a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  // Rail-only "Text" glyph — a literal A, matching old Designrr's rail (a
  // rounded "A" badge). Distinct from `heading` below, which stays the
  // H2/H3-style bar icon used by the Subheading insert tile — that's a
  // different, more specific meaning and shouldn't change just because the
  // rail tab icon does.
  textTab: 'M6 20L12 4L18 20M8.3 14h7.4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.35a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.65 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.65a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.35 9c.68.26 1.56.9 1.56 1.56',
  heading: 'M6 4v16M18 4v16M6 12h12',
  paragraph: 'M4 6h16M4 12h16M4 18h10',
  quote: 'M7 7a3 3 0 0 0-3 3v3h3l-2 4h3l2-4v-3a3 3 0 0 0-3-3zM17 7a3 3 0 0 0-3 3v3h3l-2 4h3l2-4v-3a3 3 0 0 0-3-3z',
  divider: 'M4 12h16',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  callout: 'M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  table: 'M3 4h18v16H3zM3 10h18M9 4v16',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  video: 'M4 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM22 8l-4 3 4 3V8z',
  audio: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  star: 'M12 2.5l3.09 6.26L22 9.77l-5 4.87L18.18 21.5 12 18.27 5.82 21.5 7 14.64l-5-4.87 6.91-1.01L12 2.5z',
  check: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 12l3 3 5-6',
  shapeRectangle: 'M4 5h16v14H4z',
  shapeEllipse: 'M4 12a8 8 0 1 0 16 0 8 8 0 1 0-16 0z',
  shapeTriangle: 'M12 4L20 19H4z',
  shapeLine: 'M4 12h16',
  // Sun + mountains, no frame — matches old Designrr's "Images" rail icon
  // (a landscape glyph, not a picture-frame-with-mountain like this used to
  // be). Shared with the Image insert tile, which means the same thing.
  image: 'M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM2 20l6-8 4 4 5-7 5 11z',
  cta: 'M4 6h16v12H4zM4 10h16',
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
  columns: 'M4 4h6v16H4zM14 4h6v16h-6z',
  imageGrid: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  checklist: 'M4 6h.01M4 12h.01M4 18h.01M9 6h11M9 12h11M9 18h11M3.5 6l1 1 1.5-2M3.5 12l1 1 1.5-2M3.5 18l1 1 1.5-2',
  signature: 'M3 17s2-1 4-1 3 1.5 5 1.5S15 16 17 16s4 1 4 1M4 12c2-6 4-9 6-9s2 4 2 8 1 5 3 5 3-3 3-7',
  displayText: 'M4 7V5h16v2M8 5v14M6 19h4',
  alignLeft: 'M17 10H3M21 6H3M21 14H3M17 18H3',
  alignCenter: 'M17 10H7M21 6H3M21 14H3M17 18H7',
  alignRight: 'M21 10H7M21 6H3M21 14H3M21 18H7',
  alignJustify: 'M21 10H3M21 6H3M21 14H3M21 18H3',
};

/* ── Insert panel content, curated and grouped (not one long flat scroll) ───── */
const SHAPE_LIBRARY: { id: string; label: string; d: string; color: string }[] = [
  { id: 'arrow', label: 'Arrow', d: 'M5 12h14M13 6l6 6-6 6', color: '#52637A' },
  { id: 'star', label: 'Star', d: 'M12 2.5l3.09 6.26L22 9.77l-5 4.87L18.18 21.5 12 18.27 5.82 21.5 7 14.64l-5-4.87 6.91-1.01L12 2.5z', color: '#F5A524' },
  { id: 'check', label: 'Checkmark', d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 12l3 3 5-6', color: '#2A7A57' },
  { id: 'rectangle', label: 'Rectangle', d: 'M4 6h16v12H4z', color: '#52637A' },
  { id: 'ellipse', label: 'Ellipse', d: 'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z', color: '#006EFE' },
  { id: 'triangle', label: 'Triangle', d: 'M12 3L21 20H3z', color: '#7C3AED' },
  { id: 'line', label: 'Line', d: 'M2 11h20v2H2z', color: '#15191F' },
];

/* Old Designrr's Image Grid blocks drop in real images, not empty placeholders —
   reuses the same curated stock library the Media panel and Image inspector do. */
function gridFig(src: string): string {
  return `<figure data-wrap="inline" class="book-img-wrap book-img-wrap--inline"><img src="${src}" alt="" /></figure>`;
}
const GRID_IMGS = STOCK_IMAGES.filter((s) => s.label !== 'Minimalist desk (default)').map((s) => s.src);

interface InsertTile { id: string; label: string; icon: string; group: 'Text' | 'Media' | 'Shapes' | 'Layout' | 'Interactive' | 'Worksheets' | 'TextStyles'; requiredPlan?: GateTier; html: string }
const INSERT_TILES: InsertTile[] = [
  { id: 'heading', label: 'Subheading', icon: ICONS.heading, group: 'Text', html: '<h3>New subheading</h3>' },
  { id: 'paragraph', label: 'Paragraph', icon: ICONS.paragraph, group: 'Text', html: '<p>New paragraph text.</p>' },
  { id: 'quote', label: 'Pull-quote', icon: ICONS.quote, group: 'Text', html: '<blockquote>A pulled quote.</blockquote>' },
  { id: 'divider', label: 'Divider', icon: ICONS.divider, group: 'Text', html: '<hr>' },
  { id: 'list', label: 'List', icon: ICONS.list, group: 'Text', html: '<ul><li>List item one</li><li>List item two</li></ul>' },
  { id: 'callout', label: 'Callout', icon: ICONS.callout, group: 'Text', html: '<div data-callout="true"><p>A note or tip worth calling out.</p></div>' },
  { id: 'author-name', label: 'Author name', icon: ICONS.signature, group: 'Text', html: '<p class="book-author-name">By Author Name</p>' },
  { id: 'display-text', label: 'Display text', icon: ICONS.displayText, group: 'Text', html: '<p class="book-display-text">Make it count.</p>' },
  { id: 'image', label: 'Image', icon: ICONS.image, group: 'Media', html: '__IMAGE__' },
  { id: 'video', label: 'Video', icon: ICONS.video, group: 'Media', html: '__EMBED_VIDEO__' },
  { id: 'audio', label: 'Audio', icon: ICONS.audio, group: 'Media', html: '__EMBED_AUDIO__' },
  { id: 'shape-arrow', label: 'Arrow', icon: ICONS.arrow, group: 'Shapes', html: '<div data-shape="true" data-d="M5 12h14M13 6l6 6-6 6" data-viewbox="0 0 24 24" data-color="#52637A"></div>' },
  { id: 'shape-star', label: 'Star', icon: ICONS.star, group: 'Shapes', html: '<div data-shape="true" data-d="M12 2.5l3.09 6.26L22 9.77l-5 4.87L18.18 21.5 12 18.27 5.82 21.5 7 14.64l-5-4.87 6.91-1.01L12 2.5z" data-viewbox="0 0 24 24" data-color="#F5A524"></div>' },
  { id: 'shape-check', label: 'Checkmark', icon: ICONS.check, group: 'Shapes', html: '<div data-shape="true" data-d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 12l3 3 5-6" data-viewbox="0 0 24 24" data-color="#2A7A57"></div>' },
  { id: 'shape-rectangle', label: 'Rectangle', icon: ICONS.shapeRectangle, group: 'Shapes', html: '<div data-shape="true" data-d="M4 6h16v12H4z" data-viewbox="0 0 24 24" data-color="#52637A"></div>' },
  { id: 'shape-ellipse', label: 'Ellipse', icon: ICONS.shapeEllipse, group: 'Shapes', html: '<div data-shape="true" data-d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z" data-viewbox="0 0 24 24" data-color="#006EFE"></div>' },
  { id: 'shape-triangle', label: 'Triangle', icon: ICONS.shapeTriangle, group: 'Shapes', html: '<div data-shape="true" data-d="M12 3L21 20H3z" data-viewbox="0 0 24 24" data-color="#7C3AED"></div>' },
  { id: 'shape-line', label: 'Line', icon: ICONS.shapeLine, group: 'Shapes', html: '<div data-shape="true" data-d="M2 11h20v2H2z" data-viewbox="0 0 24 24" data-color="#15191F"></div>' },
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
  { id: 'image-grid-2', label: 'Image grid (2)', icon: ICONS.imageGrid, group: 'Media', html: `<div data-image-grid="true" data-cols="2" class="book-image-grid book-image-grid--2">${gridFig(GRID_IMGS[0])}${gridFig(GRID_IMGS[1])}</div>` },
  { id: 'image-grid-3', label: 'Image grid (3)', icon: ICONS.imageGrid, group: 'Media', html: `<div data-image-grid="true" data-cols="3" class="book-image-grid book-image-grid--3">${gridFig(GRID_IMGS[0])}${gridFig(GRID_IMGS[1])}${gridFig(GRID_IMGS[2])}</div>` },
  { id: 'image-grid-4', label: 'Image grid (4)', icon: ICONS.imageGrid, group: 'Media', html: `<div data-image-grid="true" data-cols="4" class="book-image-grid book-image-grid--4">${gridFig(GRID_IMGS[0])}${gridFig(GRID_IMGS[1])}${gridFig(GRID_IMGS[2])}${gridFig(GRID_IMGS[3])}</div>` },
  { id: 'cta', label: 'Call to action', icon: ICONS.cta, group: 'Interactive', requiredPlan: 'pro', html: '<p><strong>Get the companion workbook →</strong></p>' },
  { id: 'jumbotron', label: 'Inline CTA', icon: ICONS.jumbotron, group: 'Interactive', requiredPlan: 'pro', html: '<div data-jumbotron="true" data-bg="#EEF3FF"><div data-jb-heading="true">Get the companion workbook</div><div data-jb-body="true">A short line of supporting copy.</div><div data-jb-button="true">Get it now</div></div>' },
  { id: 'text-field', label: 'Text field', icon: ICONS.textField, group: 'Interactive', html: '<div data-textfield="true" data-label="Your name"></div>' },
  { id: 'qr-code', label: 'QR code', icon: ICONS.qrcode, group: 'Interactive', requiredPlan: 'pro', html: '<div data-qr="true" data-url="https://example.com"></div>' },
  // The two general-purpose structured-content tools, ahead of the more
  // specific worksheet templates below (which are really just their own
  // preset tables/lists anyway — Weekly planner/Budget tracker/Calendar are
  // all literally <table> markup).
  { id: 'table', label: 'Table', icon: ICONS.table, group: 'Worksheets', html: '<table><tbody><tr><th>Column A</th><th>Column B</th></tr><tr><td>Row 1</td><td>Row 1</td></tr><tr><td>Row 2</td><td>Row 2</td></tr></tbody></table>' },
  { id: 'chart', label: 'Chart', icon: ICONS.chart, group: 'Worksheets', html: '<div data-chart="true" data-type="bar" data-color="#006EFE" data-points="[{&quot;label&quot;:&quot;Q1&quot;,&quot;value&quot;:12},{&quot;label&quot;:&quot;Q2&quot;,&quot;value&quot;:19},{&quot;label&quot;:&quot;Q3&quot;,&quot;value&quot;:8},{&quot;label&quot;:&quot;Q4&quot;,&quot;value&quot;:15}]"></div>' },
  { id: 'checklist', label: 'Checklist', icon: ICONS.checklist, group: 'Worksheets', html: '<ul class="book-checklist"><li>☐ First task</li><li>☐ Second task</li><li>☐ Third task</li></ul>' },
  { id: 'questions', label: 'Questions', icon: ICONS.list, group: 'Worksheets', html: '<p><strong>1.</strong> Type your question here.</p><p class="book-answer-line">&nbsp;</p><p><strong>2.</strong> Another question.</p><p class="book-answer-line">&nbsp;</p><p><strong>3.</strong> One more question.</p><p class="book-answer-line">&nbsp;</p>' },
  { id: 'weekly-planner', label: 'Weekly planner', icon: ICONS.table, group: 'Worksheets', html: '<table><tbody><tr><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></tbody></table>' },
  { id: 'budget', label: 'Budget tracker', icon: ICONS.table, group: 'Worksheets', html: '<table><tbody><tr><th>Category</th><th>Budgeted</th><th>Actual</th><th>Difference</th></tr><tr><td>Housing</td><td></td><td></td><td></td></tr><tr><td>Food</td><td></td><td></td><td></td></tr><tr><td>Savings</td><td></td><td></td><td></td></tr></tbody></table>' },
  { id: 'calendar', label: 'Calendar', icon: ICONS.table, group: 'Worksheets', html: '<table><tbody><tr><th>S</th><th>M</th><th>T</th><th>W</th><th>T</th><th>F</th><th>S</th></tr><tr><td></td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td></tr><tr><td>7</td><td>8</td><td>9</td><td>10</td><td>11</td><td>12</td><td>13</td></tr><tr><td>14</td><td>15</td><td>16</td><td>17</td><td>18</td><td>19</td><td>20</td></tr><tr><td>21</td><td>22</td><td>23</td><td>24</td><td>25</td><td>26</td><td>27</td></tr></tbody></table>' },
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
function activeObjectKind(editor: Editor): 'image' | 'shape' | 'embed' | 'qr' | 'chart' | 'textfield' | 'jumbotron' | 'columns' | 'table' | null {
  if (editor.isActive('image')) return 'image';
  if (editor.isActive('shapeBlock')) return 'shape';
  if (editor.isActive('embedBlock')) return 'embed';
  if (editor.isActive('qrCodeBlock')) return 'qr';
  if (editor.isActive('chartBlock')) return 'chart';
  if (editor.isActive('textFieldBlock')) return 'textfield';
  if (editor.isActive('jumbotronBlock')) return 'jumbotron';
  // Order matters: a table nested inside a columns block should report as
  // itself, not as the outer container, so this comes before columnsBlock.
  if (editor.isActive('table')) return 'table';
  if (editor.isActive('columnsBlock')) return 'columns';
  return null;
}

/* Node types the Insert panel can drop in — the only ones that get a drag handle
   for repositioning after the fact. Plain paragraphs/headings are left out so
   normal prose editing doesn't sprout a handle on every line. */
const MOVABLE_NODE_TYPES = new Set([
  'image', 'shapeBlock', 'embedBlock', 'qrCodeBlock', 'textFieldBlock',
  'jumbotronBlock', 'columnsBlock', 'imageGridBlock', 'table', 'callout', 'blockquote', 'chartBlock',
]);

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


type MediaPickerKind = 'image' | 'video' | 'audio';

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
  page, theme, isSelected, currentSelection, isDragActive, onSelection, onAddChapterAfter, onSplitChapter, onBeginChapterEdit, onWordCountChange, onAltStatusChange, onEditorFocus, onContentChange, titleHtml, onTitleChange, moveDragRef, onMoveDragActiveChange, zoom, pageNumbers, pageNumberIndex, chapterNumber, onMediaDropped, getFieldEditor,
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
  // per-paragraph "Split chapter here" menu item (see WordgenieBlockMenu).
  onSplitChapter: (chapterId: string, editor: Editor, pos: number) => void;
  // Same "document-scope, passed straight through" shape as onSplitChapter —
  // Wordgenie's block menu calls this to get an undo net around its own edit.
  onBeginChapterEdit: (chapterId: string) => { commit: (label: string) => void };
  // Shared across every chapter's own Editor instance, so a handle-drag started
  // in one chapter can be read back by whichever chapter's page it's dropped on.
  moveDragRef: React.MutableRefObject<{ chapterId: string; editor: Editor } | null>;
  onMoveDragActiveChange: (active: boolean) => void;
  onWordCountChange: (chapterId: string, words: number) => void;
  onAltStatusChange: (chapterId: string, missing: number) => void;
  onEditorFocus: (editor: Editor) => void;
  onContentChange: (chapterId: string, html: string) => void;
  titleHtml: string;
  onTitleChange: (chapterId: string, html: string) => void;
  // Fired after a media-picker "ready to place" card is actually dropped onto
  // this chapter, so the picker (state lives one level up, in BookEditorView)
  // can close itself — the job it was open for is done.
  onMediaDropped?: () => void;
  // Looks up a *live* field/chapter Editor by its registry key — the title's
  // own SimpleFieldEditor is uncontrolled after mount (only takes initialHtml),
  // so "Suggest a title" needs this to push a new value into its already-mounted
  // editor instance, the same way restoreSnapshot reaches into editors it
  // doesn't own to replay a snapshot.
  getFieldEditor: (key: string) => Editor | undefined;
}) {
  const scale = zoom / 100;
  const [dragOver, setDragOver] = useState(false);
  // Whole-page tint (dragOver) says "this chapter accepts drops" — this says
  // exactly where, tracking the cursor to the nearest real insertion point the
  // way Notion/Google Docs show a line between blocks while dragging, rather
  // than leaving the landing spot a surprise until you actually let go.
  const [dropIndicator, setDropIndicator] = useState<{ top: number; left: number; width: number } | null>(null);
  // The Wordgenie "···" trigger — only drawn once the caret is inside a given
  // paragraph, not a persistent per-block handle, matching the real product.
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [blockMenuAt, setBlockMenuAt] = useState<{ pos: number; top: number; left: number } | null>(null);
  const [wordgenieToast, setWordgenieToast] = useState(false);
  // The move-drag handle — revealed on hover over a movable object, same idiom
  // as blockMenuAt above: resolve the block under the pointer, find its DOM,
  // store its rect. Cleared whenever a native drag is already in progress.
  const [hoverHandle, setHoverHandle] = useState<{ pos: number; top: number; left: number } | null>(null);
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
      StarterKit.configure({ heading: { levels: [3] }, link: { openOnClick: false } }),
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
      TextFieldBlock,
      JumbotronBlock,
      ColumnsBlock,
      ImageGridBlock,
      ParagraphClass,
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
      if (!node || !node.isTextblock) { setBlockMenuAt(null); return; }
      const dom = ed.view.nodeDOM(blockPos) as HTMLElement | null;
      if (!dom || typeof dom.getBoundingClientRect !== 'function') { setBlockMenuAt(null); return; }
      const rect = dom.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      setBlockMenuAt({ pos: blockPos, top: (rect.top - hostRect.top) / scale, left: (rect.left - hostRect.left) / scale });
    },
    onBlur: () => setBlockMenuAt(null),
    onUpdate: ({ editor: ed }) => {
      onWordCountChange(page.id, ed.getText().split(/\s+/).filter(Boolean).length);
      onAltStatusChange(page.id, countMissingAlt(ed.getJSON() as { type?: string }));
      onContentChange(page.id, ed.getHTML());
    },
    onCreate: ({ editor: ed }) => {
      onAltStatusChange(page.id, countMissingAlt(ed.getJSON() as { type?: string }));
      onWordCountChange(page.id, ed.getText().split(/\s+/).filter(Boolean).length);
    },
    editorProps: {
      attributes: { class: 'book-chapter-prose' },
      /* Found while checking that selecting a chapter-body image switches the
         right panel to Image properties: it didn't, on the FIRST click into a
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
  useSpellcheck(editor, useContext(EditorPrefsContext).spellcheck);

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
    if (!node || !MOVABLE_NODE_TYPES.has(node.type.name) || node.attrs.locked) { setHoverHandle(null); return; }
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
    if (!node || !node.isTextblock) return;
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
    if (!node || !node.isTextblock) { setBlockMenuAt(null); return; }
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
  const isBlockKind = selKind === 'image' || selKind === 'shape' || selKind === 'embed' || selKind === 'qr' || selKind === 'chart'
    || selKind === 'textfield' || selKind === 'jumbotron' || selKind === 'columns' || selKind === 'table';

  // Floating quick actions' position — a plain absolutely-positioned child of
  // pageRef, resolved from the selected block's own rect the same way
  // blockMenuAt/hoverHandle already are above, scale-corrected for zoom. Not
  // FloatingBarPortal (used for the cover editor's own bar): that one sticks
  // to a viewport edge for as long as its whole box is in view, which is right
  // for "stay reachable while scrolling a tall page" but not for "sit directly
  // above the thing I selected."
  const [blockBarPos, setBlockBarPos] = useState<{ top: number; left: number; width: number } | null>(null);
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

  /* Floating quick actions for whatever block is selected in THIS chapter —
     duplicate/delete/lock, no arrange (chapter content flows in document
     order, so "bring to front" doesn't apply the way it does on the freeform
     cover). */
  const blockBar = isBlockKind && currentSelection.chapterId === page.id ? (() => {
    const ed = currentSelection.editor;
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
      : selKind === 'image' && ed.isActive('imageGridBlock') ? 'imageGridBlock'
      : selKind; // 'image' (not in a grid) and 'table' already match their own node name
    const locked = !!ed.getAttributes(nodeTypeName).locked;
    const onToggleLock = () => ed.commands.updateAttributes(nodeTypeName, { locked: !locked });
    if (selKind === 'columns') return { onDelete: () => ed.chain().focus().deleteNode('columnsBlock').run(), locked, onToggleLock };
    if (selKind === 'table') return { onDelete: () => ed.chain().focus().deleteTable().run(), locked, onToggleLock };
    if (selKind === 'image' && ed.isActive('imageGridBlock')) return { onDelete: () => ed.chain().focus().deleteNode('imageGridBlock').run(), locked, onToggleLock };
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
            const targetPos = resolveDropPosition(editor, e.clientX, e.clientY) ?? editor.state.selection.from;
            insertMediaAt(editor, targetPos, kind, src);
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
      }}
      onMouseLeave={() => { setHoverHandle(null); syncBlockMenuToCaret(); }}
      style={{
        position: 'relative',
        // Was hardcoded white regardless of theme — the one visible surface a
        // template touches (the live chapter page) never actually reflected
        // the chosen theme's background, so applying Noir/Bestseller/Sunset
        // changed heading color and font but left every page looking identical.
        background: dragOver ? '#F3F8FF' : theme.bg,
        border: dragOver ? `2px dashed ${BLUE}` : isSelected ? `2px solid ${BLUE}` : isDragActive ? `2px dashed ${BLUE}` : `1px solid ${BORDER}`,
        borderRadius: 3,
        boxShadow: PAGE_SHADOW,
        minHeight: PAGE_MIN_H,
        padding: '55px 63px',
        transition: 'border-color .1s ease, background .1s ease',
      }}
    >
      <PageNumberChip settings={pageNumbers} index={pageNumberIndex} edge="header" selected={currentSelection.kind === 'pageNumber'} onSelect={() => onSelection({ kind: 'pageNumber' })} />
      <PageNumberChip settings={pageNumbers} index={pageNumberIndex} edge="footer" selected={currentSelection.kind === 'pageNumber'} onSelect={() => onSelection({ kind: 'pageNumber' })} />
      {blockBar && blockBarPos && (
        <div className="absolute flex justify-center" style={{ top: blockBarPos.top, left: blockBarPos.left, width: blockBarPos.width, zIndex: 20 }}>
          <FloatingObjectBar onDuplicate={blockBar.onDuplicate} onDelete={blockBar.onDelete} locked={blockBar.locked} onToggleLock={blockBar.onToggleLock} />
        </div>
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

      {editor && blockMenuAt && (
        <WordgenieBlockMenu
          editor={editor}
          chapterId={page.id}
          pos={blockMenuAt.pos}
          top={blockMenuAt.top}
          left={blockMenuAt.left - 34}
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
        .book-chapter-prose:focus { box-shadow: none; outline: none; }
        /* globals.css's [contenteditable]:hover dashed outline is meant for a
           single plain field — applied unscoped here it drew ONE dashed box
           around the entire chapter body (every paragraph plus any embedded
           image together), reading as if they shared one container instead of
           each being its own block. Killed the same way .book-simple-editable
           already was for cover text fields. */
        .book-chapter-prose:hover { outline: none; background: none; }
        .book-chapter-prose h3 { font-family: ${theme.headingFont}; color: ${headingColor}; }
        .book-chapter-prose p { margin: 0 0 14px; }
        .book-chapter-prose ul { list-style: disc; margin: 0 0 14px; padding-left: 22px; }
        .book-chapter-prose ol { list-style: decimal; margin: 0 0 14px; padding-left: 22px; }
        .book-chapter-prose li { margin-bottom: 4px; }
        .book-chapter-prose li p { margin: 0; }
        .book-chapter-prose blockquote {
          border-left: 3px solid ${theme.accentColor}; margin: 18px 0; padding: 4px 0 4px 16px; color: ${bodyColor}; font-style: italic;
          ${page.layout === 'quote-pull' ? `
            font-size: 22px; font-family: ${theme.headingFont}; font-style: normal; color: ${headingColor};
            border: 1px solid ${theme.accentColor}; border-left-width: 4px; border-radius: 8px;
            padding: 20px 24px; background: ${theme.accentColor}1A;
          ` : ''}
        }
        .book-chapter-prose.is-two-col { column-count: 2; column-gap: 28px; }
        .book-img-wrap { margin: 0; border-radius: 8px; }
        .book-img-wrap img { display: block; width: 100%; border-radius: 8px; }
        .book-img-wrap figcaption { font-family: ${bodyFont}; font-size: 12.5px; color: #6B7686; text-align: center; line-height: 1.4; margin-top: 6px; }
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
        .book-chapter-prose .book-callout { background: #EAF2FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 4px 18px; margin: 18px 0; }
        .book-chapter-prose .book-callout p:last-child { margin-bottom: 0; }
        .book-chapter-prose table { border-collapse: collapse; width: 100%; margin: 18px 0; font-size: 14px; }
        .book-chapter-prose th, .book-chapter-prose td { border: 1px solid ${BORDER}; padding: 8px 12px; text-align: left; }
        .book-chapter-prose th { background: #F7F8FA; font-weight: 700; color: ${INK}; }
        .book-shape { display: inline-block; margin: 8px 12px 8px 0; }
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
        .book-chapter-prose .ProseMirror-selectednode.book-shape,
        .book-chapter-prose .ProseMirror-selectednode .book-embed,
        .book-chapter-prose .ProseMirror-selectednode .book-qr,
        .book-chapter-prose .ProseMirror-selectednode .book-textfield,
        .book-chapter-prose .ProseMirror-selectednode .book-jumbotron { outline: 2px solid ${BLUE}; outline-offset: 2px; border-radius: 8px; }
        .book-chapter-title { outline: none; border-radius: 6px; transition: box-shadow .12s ease; }
        .book-chapter-title:focus { box-shadow: 0 0 0 3px rgba(0,110,254,0.13); }
        .book-chapter-title p, .book-chapter-title h2 { margin: 0; font: inherit; color: inherit; }
        .book-chapter-title p.is-editor-empty:first-child::before,
        .book-chapter-title h2.is-editor-empty:first-child::before { color: currentColor; opacity: 0.5; content: attr(data-placeholder); float: left; pointer-events: none; height: 0; }
      `}</style>

      {page.layout === 'opener' && (
        page.openerImage ? (
          <div
            onClick={() => onSelection({ kind: 'openerImage', chapterId: page.id })}
            style={{ position: 'relative', margin: '-55px -63px 20px', height: 220, cursor: 'pointer', overflow: 'hidden' }}
            title="Click to replace this photo"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={page.openerImage} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.78) 100%)' }} />
            <div className="flex items-center justify-between" style={{ position: 'absolute', left: 24, right: 24, bottom: 16 }}>
              <span style={{ ...ns, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fff' }}>Chapter</span>
              <span style={{ fontFamily: theme.headingFont, fontWeight: 800, fontSize: 40, lineHeight: 1, color: '#fff' }}>{chapterNumber}</span>
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <div style={{ height: 4, width: 56, background: theme.accentColor, borderRadius: 2, marginBottom: 14 }} />
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span style={{ ...ns, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: theme.accentColor }}>Chapter</span>
              <span style={{ fontFamily: theme.headingFont, fontWeight: 800, fontSize: 44, lineHeight: 1, color: headingColor, opacity: 0.35 }}>{chapterNumber}</span>
            </div>
            <button
              onClick={() => onSelection({ kind: 'openerImage', chapterId: page.id })}
              className="cursor-pointer"
              style={{
                ...ns, fontSize: 11.5, fontWeight: 600, color: SLATE, background: 'none',
                border: `1px dashed ${BORDER}`, borderRadius: RADIUS_SM, padding: '6px 10px', marginBottom: 4,
              }}
            >
              + Add photo
            </button>
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
      <EditorContent editor={editor} className={page.layout === 'two-column' ? 'is-two-col' : page.layout === 'image-led' ? 'is-image-led' : ''} />
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

function WordgenieBlockMenu({
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
      <button
        onClick={() => (open ? closeMenu() : setOpen(true))}
        className="flex items-center justify-center cursor-pointer"
        style={{ width: 26, height: 26, borderRadius: RADIUS_SM, border: `1px solid ${PANEL_BORDER}`, background: open ? '#F4F6F9' : '#fff', boxShadow: CARD_SHADOW }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill={SLATE}><circle cx="5" cy="12" r="2.2" /><circle cx="12" cy="12" r="2.2" /><circle cx="19" cy="12" r="2.2" /></svg>
      </button>
      {open && (
        <div className="absolute bg-white flex flex-col" style={{ top: 0, left: 32, zIndex: 11, width: 210, padding: 5, borderRadius: RADIUS_LG, border: `1px solid ${PANEL_BORDER}`, boxShadow: MENU_SHADOW }}>
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
              {/* A structural action, not an AI one — same scissors icon as the
                  top bar's own Split button, but split at this paragraph rather
                  than wherever the live text cursor happens to be. No busy/error
                  state needed: unlike the items above, this isn't a simulated
                  async call, it's the real, instant operation. */}
              <div style={{ height: 1, background: BORDER, margin: '4px 2px' }} />
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

/* The title field's own "···" — much simpler than WordgenieBlockMenu's: one
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
   triangles use clip-path for one of 4 fixed diagonal orientations — a deliberate
   substitute for rotation (see CoverShapeElement). */
function ShapeFill({ shape, color, corner }: { shape: CoverShapeElement['shape']; color: string; corner?: CoverShapeElement['corner'] }) {
  if (shape === 'rectangle') return <div style={{ width: '100%', height: '100%', background: color }} />;
  // border-radius:50% on a non-square box already renders an ellipse, not just a
  // circle — so a dedicated "oval" type would be redundant with resizing this one.
  if (shape === 'circle') return <div style={{ width: '100%', height: '100%', background: color, borderRadius: '50%' }} />;
  if (shape === 'rounded') return <div style={{ width: '100%', height: '100%', background: color, borderRadius: RADIUS_LG }} />;
  const clipByCorner: Record<NonNullable<CoverShapeElement['corner']>, string> = {
    tl: 'polygon(0 0, 100% 0, 0 100%)',
    tr: 'polygon(0 0, 100% 0, 100% 100%)',
    br: 'polygon(100% 0, 100% 100%, 0 100%)',
    bl: 'polygon(0 0, 100% 100%, 0 100%)',
  };
  return <div style={{ width: '100%', height: '100%', background: color, clipPath: clipByCorner[corner ?? 'br'] }} />;
}

/* Shown only on the selected element. Dragging a handle keeps the diagonally-opposite
   corner fixed (see beginResize below) rather than growing from the dragged point
   directly — otherwise a top-left resize would paradoxically shove the whole box. */
function ResizeHandles({ onResizeStart }: { onResizeStart: (corner: 'tl' | 'tr' | 'bl' | 'br', e: React.PointerEvent) => void }) {
  const positions: { corner: 'tl' | 'tr' | 'bl' | 'br'; style: React.CSSProperties }[] = [
    { corner: 'tl', style: { top: -4, left: -4, cursor: 'nwse-resize' } },
    { corner: 'tr', style: { top: -4, right: -4, cursor: 'nesw-resize' } },
    { corner: 'bl', style: { bottom: -4, left: -4, cursor: 'nesw-resize' } },
    { corner: 'br', style: { bottom: -4, right: -4, cursor: 'nwse-resize' } },
  ];
  return (
    <>
      {positions.map(({ corner, style }) => (
        <div
          key={corner}
          onPointerDown={(e) => { e.stopPropagation(); onResizeStart(corner, e); }}
          style={{ position: 'absolute', width: 9, height: 9, borderRadius: '50%', background: '#fff', border: `1.5px solid ${BLUE}`, zIndex: 2, ...style }}
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
function FloatingBarPortal({ boxRef, edge, offset = 10, children }: {
  boxRef: React.RefObject<HTMLElement | null>;
  edge: 'top' | 'bottom';
  offset?: number;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  useEffect(() => {
    const update = () => {
      const box = boxRef.current;
      if (!box) { setPos(null); return; }
      const r = box.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= window.innerHeight) { setPos(null); return; }
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
  }, [boxRef, edge, offset]);

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

/* Read-only render — always at the fixed intrinsic PAGE_W × PAGE_MIN_H, no pointer
   handlers. Every consumer that needs a different size wraps this in a CSS
   `transform: scale(...)` rather than asking it to reflow (a percent-positioned
   canvas visibly distorts if given a different width with no matching scale). */
function CoverCanvasStatic({ page, theme, fieldContent }: { page: SimplePage; theme: ThemeDef; fieldContent: Record<string, string> }) {
  const elements = page.coverElements ?? [];
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: theme.bg, border: `1px solid ${BORDER}`, borderRadius: 3, boxShadow: PAGE_SHADOW, width: PAGE_W, height: PAGE_MIN_H }}>
      {elements.map((el) => {
        const boxStyle: React.CSSProperties = { position: 'absolute', left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`, opacity: el.opacity ?? 1 };
        if (el.type === 'image') {
          return (
            <div key={el.id} style={boxStyle}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={el.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {el.overlayDark && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)' }} />}
            </div>
          );
        }
        if (el.type === 'shape') {
          return <div key={el.id} style={boxStyle}><ShapeFill shape={el.shape} color={el.color} corner={el.corner} /></div>;
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
  page, theme, fieldContent, selection, onSelection, onEditorFocus, onContentChange, onSelectPage, onUpdateElement, onReorderElement, onDuplicateElement, onDeleteElement, pageNumbers, pageNumberIndex,
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
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const elements = page.coverElements ?? [];
  const selectedId = selection.kind === 'coverElement' && selection.pageId === page.id ? selection.elementId : null;

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

  const beginResize = (el: CoverElement, corner: 'tl' | 'tr' | 'bl' | 'br', e: React.PointerEvent) => {
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
      } else {
        const anchorX = start.x + start.w;
        x = clampPct(start.x + dxPct, 0, anchorX - COVER_MIN_PCT);
        w = anchorX - x;
        h = clampPct(start.h + dyPct, COVER_MIN_PCT, 100 - start.y);
      }
      // A manual resize is a deliberate "make this box bigger/smaller than its
      // text" decision — freeze it to the dragged size rather than snapping
      // straight back to content-fit on the very next render.
      onUpdateElement(page.id, el.id, el.type === 'text' ? { x, y, w, h, heightAuto: false } : { x, y, w, h });
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
      style={{ position: 'relative', overflow: 'hidden', background: theme.bg, border: `1px solid ${BORDER}`, borderRadius: 3, boxShadow: PAGE_SHADOW, width: PAGE_W, height: PAGE_MIN_H, cursor: 'default' }}
    >
      {elements.map((el) => {
        const selected = el.id === selectedId;
        const boxStyle: React.CSSProperties = {
          position: 'absolute', left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`, opacity: el.opacity ?? 1,
          outline: selected ? `2px solid ${BLUE}` : 'none', outlineOffset: 1,
        };
        if (el.type === 'image') {
          return (
            <div key={el.id} style={{ ...boxStyle, cursor: el.locked ? 'default' : 'grab' }} onPointerDown={(e) => beginDrag(el, e)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={el.src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
              {el.overlayDark && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)' }} />}
              {selected && !el.locked && <ResizeHandles onResizeStart={(corner, e) => beginResize(el, corner, e)} />}
            </div>
          );
        }
        if (el.type === 'shape') {
          return (
            <div key={el.id} style={{ ...boxStyle, cursor: el.locked ? 'default' : 'grab' }} onPointerDown={(e) => beginDrag(el, e)}>
              <ShapeFill shape={el.shape} color={el.color} corner={el.corner} />
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
          ? { ...boxStyle, top: `${el.y + el.h / 2}%`, height: 'auto', transform: 'translateY(-50%)', outlineOffset: 2 }
          : boxStyle;
        return (
          <div
            key={el.id}
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
      {selectedId && (() => {
        const selectedEl = elements.find((e) => e.id === selectedId);
        return (
          <FloatingBarPortal boxRef={stageRef} edge="bottom" offset={10}>
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
  page, theme, pages, chapterHtml, fieldContent, selection, onSelection, onEditorFocus, onContentChange, onSelectPage, onUpdateElement, onReorderElement, onDuplicateElement, onDeleteElement, pageNumbers, pageNumberIndex,
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
}) {
  const focusRing = (
    <style jsx global>{`
      .book-simple-editable { outline: none; border-radius: 6px; transition: box-shadow .12s ease; }
      .book-simple-editable:focus { box-shadow: 0 0 0 3px rgba(0,110,254,0.13); }
      /* Cover text elements already show a solid selection outline + "Move" pill on
         the wrapping box (see CoverCanvasEditable) — the app-wide dashed hover
         affordance from globals.css just doubles up as a confusing second box. */
      .book-simple-editable:hover { outline: none; background: none; }
      /* Rather than hide the inner focus ring outright, make it match the outer
         selection box exactly (same 2px solid blue, same 2px offset) — now that
         the outer box hugs the text (see the heightAuto render below) the two
         nearly coincide, so focusing a selected element reads as one steady
         frame instead of jumping to a different-looking indicator. Scoped to
         .book-cover-canvas: the TOC heading and back-matter bio below have no
         competing outer box, so their own softer ring is the only affordance
         they get and stays as it was. */
      .book-cover-canvas .book-simple-editable:focus { box-shadow: none; outline: 2px solid ${BLUE}; outline-offset: 2px; }
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
      <div style={{ position: 'relative', background: theme.bg, border: `1px solid ${BORDER}`, borderRadius: 3, boxShadow: PAGE_SHADOW, minHeight: PAGE_MIN_H, padding: '56px 64px', overflow: 'hidden' }}>
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
    <div style={{ position: 'relative', background: theme.bg, border: `1px solid ${BORDER}`, borderRadius: 3, boxShadow: PAGE_SHADOW, minHeight: PAGE_MIN_H, display: 'flex', overflow: 'hidden' }}>
      {focusRing}
      <PageNumberChip settings={pageNumbers} index={pageNumberIndex} edge="header" selected={selection.kind === 'pageNumber'} onSelect={() => onSelection({ kind: 'pageNumber' })} />
      <PageNumberChip settings={pageNumbers} index={pageNumberIndex} edge="footer" selected={selection.kind === 'pageNumber'} onSelect={() => onSelection({ kind: 'pageNumber' })} />
      <AuthorAvatarPanel accentColor={theme.accentColor} photo={page.authorPhoto} onClick={() => onSelection({ kind: 'backmatterAvatar', pageId: page.id })} />
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
function AuthorAvatarPanel({ accentColor, photo, onClick }: { accentColor: string; photo?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      title={onClick ? 'Click to add/replace the author photo' : undefined}
      style={{
        flexShrink: 0, width: '34%', background: photo ? undefined : `${accentColor}26`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: onClick ? 'pointer' : undefined, position: 'relative',
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
        outline: selected ? `2px solid ${BLUE}` : 'none', outlineOffset: 1, zIndex: 2,
      }}
    >
      {settings.style === 'roman' ? toRoman(n) : n}
    </button>
  );
}

/* ── Insert panel ─────────────────────────────────────────────────────────── */
function InsertPanel({ currentPlan, groups, onDragTile, onLockedClick, onLockedTextStyle, onInsertTile, textExtras }: {
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
}) {
  // No own scroll/height — the outer "Insert" tab container owns that.
  return (
    <div style={{ padding: '16px 14px' }}>
      {groups.map((group) => (
        <div key={group} style={{ marginBottom: 18 }}>
          <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, marginBottom: 8 }}>{group}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {INSERT_TILES.filter((t) => t.group === group).map((tile) => {
              const locked = shouldShowTierBadge(currentPlan as never, tile.requiredPlan);
              // Image/video/audio have no content of their own to drag straight from
              // the grid — there's no src yet. Clicking opens the media picker instead
              // (see onInsertTile's caller for the 'media' rail tab); only what comes
              // out of that picker, already sourced, is ever draggable.
              const needsSourcing = tile.html === '__IMAGE__' || tile.html === '__EMBED_VIDEO__' || tile.html === '__EMBED_AUDIO__';
              return (
                <button
                  key={tile.id}
                  type="button"
                  draggable={!locked && !needsSourcing}
                  title={locked ? `${tile.label} — upgrade to unlock` : needsSourcing ? `Choose ${tile.label.toLowerCase()} on the left, then place it` : `Insert ${tile.label} at the cursor, or drag it onto a page`}
                  onDragStart={(e) => { if (needsSourcing) return; e.dataTransfer.setData('text/insert-block', tile.id); onDragTile(tile.id); }}
                  onDragEnd={() => onDragTile(null)}
                  onClick={() => (locked ? onLockedClick(tile) : onInsertTile(tile))}
                  className="hover:shadow-[0px_4px_12px_rgba(15,23,51,0.12)] transition-shadow duration-150"
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 8px',
                    border: `1px solid ${BORDER}`, borderRadius: RADIUS_LG, background: '#fff', cursor: locked || needsSourcing ? 'pointer' : 'grab',
                    opacity: locked ? 0.75 : 1, position: 'relative', boxShadow: CARD_SHADOW,
                  }}
                >
                  {locked && <div style={{ position: 'absolute', top: 6, right: 6 }}><TierBadge tier={tile.requiredPlan!} size="sm" /></div>}
                  <div style={{ color: SLATE }}><Icon d={tile.icon} size={19} /></div>
                  <div style={{ ...ns, fontSize: 11.5, fontWeight: 600, color: INK, textAlign: 'center' }}>{tile.label}</div>
                </button>
              );
            })}
          </div>
          {/* Named text-style presets (Manuscript, Marquee…) live under the same "Text"
              tab as the generic blocks above, not a second sibling tab — both are "drag
              new content in," not "restyle a selection." But confirmed against Canva's
              own Text tab (its "Add a heading" buttons vs. its "Font combinations"
              gallery below): the two groups still get their own label, not just a gap —
              a plain heading/paragraph tile and a fully-styled named preset are different
              enough kinds of "content block" that no header at all read as one undifferentiated
              grid. Label-only, no divider/tint — that's as far as Canva's own separation goes. */}
          {group === 'Text' && textExtras}
          {group === 'Text' && (
            <div style={{ marginTop: 16 }}>
              <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, marginBottom: 8 }}>Text styles</div>
              <TextStyleCards currentPlan={currentPlan} onDragTile={onDragTile} onLockedClick={onLockedTextStyle} onInsertTile={onInsertTile} />
            </div>
          )}
        </div>
      ))}
      <div style={{ ...ns, fontSize: 11.5, color: SLATE, marginTop: 4, lineHeight: 1.5 }}>Click a block to insert it at the cursor, or drag it onto a page to place it exactly.</div>
    </div>
  );
}

/* ── Templates panel — the whole-book gallery old Designrr's Templates rail item
   covers, split out from Design so Design can stay focused on the chapter you have
   selected. Applying one is non-destructive by construction: it only ever touches
   chapters (and properties) that haven't been manually overridden — the backup/
   confirm step old Designrr needs before a template swap doesn't apply here because
   there's nothing a template swap can silently clobber. ─────────────────────────── */
// A 2-column card's real content width in this fixed-width (PANEL_W) side
// panel: 240 - 28 (16px×2 outer padding is actually 14px×2, see below) - 10 (grid gap), /2.
// Hardcoded rather than measured (ResizeObserver etc.) because PANEL_W never changes
// at runtime — this panel isn't part of a responsive layout.
// One template per row, at the full row width available in this fixed-width
// (PANEL_W) side panel — matching the presentation editor's own template list
// (PresentationEditorView.tsx's Templates panel: one row per template, a
// bordered/rounded thumbnail box, plain caption below it, not folded into one
// uniform card). 240 - 14px×2 padding = 212.
const TEMPLATE_ROW_W = 212;
const TEMPLATE_ROW_SCALE = TEMPLATE_ROW_W / PAGE_W;
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
      <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, marginBottom: 8 }}>Templates</div>
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
          const previewPage: SimplePage | undefined = coverPage ? { ...coverPage, coverElements: t.coverElements } : undefined;
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
                style={{ position: 'relative', borderRadius: RADIUS_MD, border: active ? `1.5px solid ${BLUE}` : `1px solid ${BORDER}`, overflow: 'hidden' }}
              >
                {locked && <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}><TierBadge tier={t.requiredPlan!} size="sm" /></div>}
                <div style={{ width: '100%', height: TEMPLATE_ROW_H, overflow: 'hidden', position: 'relative', background: '#F4F6F9' }}>
                  {previewPage && (
                    <div style={{ width: PAGE_W, transform: `scale(${TEMPLATE_ROW_SCALE})`, transformOrigin: 'top left' }}>
                      <CoverCanvasStatic page={previewPage} theme={t} fieldContent={fieldContent} />
                    </div>
                  )}
                </div>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
                border: `1px solid ${BORDER}`, borderRadius: RADIUS_LG, background: '#fff', boxShadow: CARD_SHADOW,
                opacity: locked ? 0.75 : 1,
              }}
            >
              {locked && <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}><TierBadge tier={tile.requiredPlan!} size="sm" /></div>}
              <div style={{ minHeight: 76, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 6px' }}>
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
                    fontFamily: s.fontFamily, fontSize: Math.min(s.fontSize, s.fontWeight && s.fontWeight >= 800 ? 10 : 13), color: s.color,
                    fontWeight: s.fontWeight, fontStyle: s.fontStyle, letterSpacing: s.letterSpacing, textTransform: s.textTransform,
                    textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', minWidth: 0,
                  }}
                >
                  {s.name}
                </div>
              </div>
              <div style={{ padding: '9px 10px', borderTop: `1px solid ${BORDER}`, width: '100%' }}>
                <div style={{ ...ns, fontSize: 12.5, fontWeight: 700, color: INK, textAlign: 'left' }}>{s.name}</div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ── Design panel — per-chapter layout, manual overrides, and TOC inclusion ──── */
function DesignPanel({
  selection, pages, onSetLayout, onSetOverride, onClearOverride, onSetTocExcluded, activeTheme,
}: {
  selection: Selection;
  pages: PageMeta[];
  onSetLayout: (chapterId: string, layout: LayoutId) => void;
  onSetOverride: (chapterId: string, key: keyof ChapterOverrides, value: string) => void;
  onClearOverride: (chapterId: string, key: keyof ChapterOverrides) => void;
  onSetTocExcluded: (chapterId: string, excluded: boolean) => void;
  activeTheme: ThemeId;
}) {
  const selectedChapter = selection.kind === 'chapter' ? (pages.find((p) => p.id === selection.chapterId.split('::')[0]) as ChapterPage | undefined) : undefined;

  // No own scroll/height — the first of four sections stacked under one
  // scrollable "Book settings" tab, which owns the outer scroll instead.
  return (
    <div style={{ padding: '16px 14px' }}>
      {selectedChapter ? (
        <>
          <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, marginBottom: 8 }}>
            Layout · {selectedChapter.title}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                onClick={() => onSetLayout(selectedChapter.id, l.id)}
                className="hover:shadow-[0px_4px_12px_rgba(15,23,51,0.12)] transition-shadow duration-150"
                style={{
                  ...ns, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2, padding: '9px 11px',
                  borderRadius: RADIUS_MD, cursor: 'pointer', border: l.id === selectedChapter.layout ? `1.5px solid ${BLUE}` : `1px solid ${BORDER}`,
                  background: l.id === selectedChapter.layout ? '#EEF3FF' : '#fff', boxShadow: CARD_SHADOW,
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 700, color: l.id === selectedChapter.layout ? BLUE : INK }}>{l.name}</span>
                <span style={{ fontSize: 11, color: SLATE }}>{l.hint}</span>
              </button>
            ))}
          </div>

          <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, marginBottom: 8 }}>
            Manual overrides
          </div>
          <OverrideRow
            label="Heading color" value={selectedChapter.overrides.headingColor} placeholder={THEMES.find((t) => t.id === activeTheme)?.headingColor}
            onChange={(v) => onSetOverride(selectedChapter.id, 'headingColor', v)}
            onReset={() => onClearOverride(selectedChapter.id, 'headingColor')}
          />
          <div style={{ ...ns, fontSize: 11, color: SLATE, lineHeight: 1.5, marginTop: 10, marginBottom: 20 }}>
            Set a value by hand and it freezes to this chapter — the theme picker above will never touch it again until you reset it.
          </div>

          <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, marginBottom: 8 }}>
            Table of contents
          </div>
          <ToggleRow
            label="Include in table of contents"
            checked={!selectedChapter.excludeFromToc}
            onChange={(v) => onSetTocExcluded(selectedChapter.id, !v)}
          />
        </>
      ) : (
        <div style={{ ...ns, fontSize: 12.5, color: SLATE, background: '#F7F8FA', borderRadius: RADIUS_MD, padding: 12 }}>
          Select a chapter on the canvas to choose its layout and set manual overrides.
        </div>
      )}
    </div>
  );
}

function OverrideRow({ label, value, placeholder, onChange, onReset }: { label: string; value?: string; placeholder?: string; onChange: (v: string) => void; onReset: () => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ ...ns, fontSize: 12, color: INK, marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        {value && <button onClick={onReset} style={{ ...ns, fontSize: 11, color: BLUE, background: 'none', border: 'none', cursor: 'pointer' }}>Reset to theme</button>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="color"
          className="book-color-input"
          value={value ?? placeholder ?? '#15191F'}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 32, height: 28, border: `1px solid ${BORDER}`, borderRadius: RADIUS_SM }}
        />
        <span style={{ ...ns, fontSize: 11.5, color: value ? INK : SLATE }}>{value ? 'Overridden' : 'Following theme'}</span>
      </div>
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
    <div style={{ padding: '16px 14px', borderTop: `1px solid ${BORDER}` }}>
      <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, marginBottom: 10 }}>Book details</div>

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

      <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, margin: '18px 0 10px' }}>Series</div>
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
function SettingsPanel({ pageNumbers, setPageNumbers, spellcheck, setSpellcheck }: {
  pageNumbers: PageNumberSettings;
  setPageNumbers: (v: PageNumberSettings) => void;
  spellcheck: boolean;
  setSpellcheck: (v: boolean) => void;
}) {
  return (
    <div style={{ padding: '16px 14px', borderTop: `1px solid ${BORDER}` }}>
      <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, marginBottom: 10 }}>Page numbers</div>
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
      <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, margin: '22px 0 10px' }}>Writing</div>
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

function InspectorSection({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      {/* Small uppercase mini-label, matching InspectorShell's own eyebrow instead
         of a separate, larger sentence-case convention — one label language for
         every level of the panel, not two. Separation is whitespace, not a rule:
         a hairline after every one of a panel's several short sections (Style,
         Format, Alignment, Color, Text background, List, Link on chapter text
         alone) read as more clutter than structure. */}
      <div style={{ ...ns, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: EYEBROW_COLOR, marginBottom: 10 }}>{label}</div>
      {children}
      {hint && <div style={{ ...ns, fontSize: 11.5, color: SLATE, lineHeight: 1.5, marginTop: 8 }}>{hint}</div>}
    </div>
  );
}

/* A grid of labelled, optionally icon-bearing choices — the wrap picker, the shape
   swapper, the paragraph-style picker and the cover image grid are all this. */
function OptionGrid<T extends string>({ options, value, onChange, columns = 2 }: {
  options: { id: T; label?: string; icon?: string; render?: React.ReactNode; title?: string }[];
  value: T | null;
  onChange: (id: T) => void;
  columns?: number;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 8 }}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            title={o.title ?? o.label}
            onClick={() => onChange(o.id)}
            className={`flex flex-col items-center justify-center cursor-pointer transition-colors duration-150${active ? '' : ' hover:bg-[#F7F8FA] hover:border-[#C7CEDA]'}`}
            style={{
              gap: 5, padding: o.render ? '10px 6px' : '10px 8px', minHeight: 38,
              border: active ? `1.5px solid ${BLUE}` : `1px solid ${BORDER}`,
              borderRadius: RADIUS_MD, background: active ? '#EEF3FF' : '#fff',
              color: active ? BLUE : INK, ...ns, fontSize: 12, fontWeight: 600,
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
            ...ns, flex: 1, height: 34, borderRadius: RADIUS_SM, gap: 5,
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
function SwatchRow({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  const [extra, setExtra] = useState<string[]>(() => (colors.includes(value) || !value ? [] : [value]));
  const all = [...colors, ...extra.filter((c) => !colors.includes(c))];
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
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
          onChange={(e) => { const c = e.target.value; setExtra((prev) => [...prev, c]); onChange(c); }}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
        />
      </label>
    </div>
  );
}

/* A real link control: the current URL is visible and editable, and applying it
   to a collapsed cursor inserts the URL as its own linked text rather than
   silently doing nothing. */
function LinkField({ editor }: { editor: Editor }) {
  const active = editor.isActive('link');
  const currentHref = (editor.getAttributes('link') as { href?: string }).href ?? '';
  const [draft, setDraft] = useState(currentHref);
  const [editing, setEditing] = useState(false);
  // Follows the selection: moving the caret onto a different link shows that one.
  // Adjusted during render rather than in an effect, so the field never paints
  // the previous link's URL for a frame first.
  const [trackedHref, setTrackedHref] = useState(currentHref);
  if (currentHref !== trackedHref) {
    setTrackedHref(currentHref);
    setDraft(currentHref);
    setEditing(false);
  }

  const apply = () => {
    const href = draft.trim();
    if (!href) { editor.chain().focus().unsetLink().run(); setEditing(false); return; }
    const normalised = /^(https?:|mailto:|#|\/)/i.test(href) ? href : `https://${href}`;
    const { empty } = editor.state.selection;
    if (empty && !active) {
      editor.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href: normalised } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: normalised }).run();
    }
    setEditing(false);
  };

  if (!active && !editing) {
    // A plain, low-emphasis trigger rather than FullButton's bordered/shadowed
    // card — this is an occasional micro-action next to bold/italic toggles,
    // not a primary action like Delete or Export.
    return (
      <button
        onClick={() => setEditing(true)}
        className="cursor-pointer hover:underline"
        style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: SLATE, background: 'none', border: 'none', padding: '4px 0' }}
      >
        + Add link
      </button>
    );
  }

  return (
    <>
      <input
        value={draft}
        autoFocus
        placeholder="example.com"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); apply(); }
          if (e.key === 'Escape') { setDraft(currentHref); setEditing(false); }
        }}
        style={{ ...ns, width: '100%', fontSize: 12.5, padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD }}
      />
      <div className="flex" style={{ gap: 6, marginTop: 8 }}>
        <button
          onClick={apply}
          className="flex-1 cursor-pointer"
          style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: '#fff', background: BLUE, border: 'none', borderRadius: RADIUS_MD, padding: '7px 6px' }}
        >
          {active ? 'Update' : 'Apply'}
        </button>
        {active && (
          <button
            onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); setEditing(false); }}
            className="flex-1 cursor-pointer"
            style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: '#B91C1C', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, padding: '7px 6px' }}
          >
            Remove
          </button>
        )}
      </div>
    </>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" />
    </svg>
  );
}

/* A Notion/Google-Docs-style bubble menu over the current text selection —
   Bold/Italic/Underline/Strike/Link: binary toggles worth reaching for without
   looking away from what's selected. Font family/size, style presets,
   alignment, colour, highlight and list type stay in TextInspector on the
   right — colour deliberately isn't duplicated here too (a lower-frequency,
   more deliberate choice better served by the panel's full swatch row +
   custom-colour picker than five cramped dots; see TextInspector's own
   `hasSelection` comment for the other half of this split). Positioned by TipTap's own
   BubbleMenu (floating-ui under the hood, `flip: true`, so it renders above
   the selection or below it when there's no room above) — unlike
   `position: sticky` (see FloatingBarPortal above, and the zoom-transform
   saga that led to it), floating-ui is built to correctly compensate for a
   transformed ancestor's scale, which is exactly what this canvas's zoom
   control is. */
function TextSelectionBubbleMenu({ editor }: { editor: Editor }) {
  const [linkEditing, setLinkEditing] = useState(false);
  const linkActive = editor.isActive('link');
  const [linkDraft, setLinkDraft] = useState('');

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
            <button
              onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); setLinkEditing(false); }}
              style={btnStyle(false)}
              title="Remove link"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B91C1C" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
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
          <button onClick={() => editor.chain().focus().toggleBold().run()} style={{ ...btnStyle(editor.isActive('bold')), fontWeight: 800 }}>B</button>
          <button onClick={() => editor.chain().focus().toggleItalic().run()} style={{ ...btnStyle(editor.isActive('italic')), fontStyle: 'italic' }}>I</button>
          <button onClick={() => editor.chain().focus().toggleUnderline().run()} style={{ ...btnStyle(editor.isActive('underline')), textDecoration: 'underline' }}>U</button>
          <button onClick={() => editor.chain().focus().toggleStrike().run()} style={{ ...btnStyle(editor.isActive('strike')), textDecoration: 'line-through' }}>S</button>
          {divider}
          <button onClick={openLink} style={btnStyle(linkActive)} title="Link">
            <LinkIcon />
          </button>
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
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'quality' | 'fast'>('quality');
  const [aspect, setAspect] = useState<'square' | 'landscape' | 'portrait'>('square');

  const limit = IMAGE_CREDIT_LIMITS[currentPlan] ?? IMAGE_CREDIT_LIMITS.standard;
  const remaining = limit - library.creditsUsed;
  const canGenerate = prompt.trim().length > 0 && remaining >= IMAGE_GENERATE_COST;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full cursor-pointer flex items-center justify-center hover:opacity-90 transition-opacity duration-150"
        style={{ ...ns, gap: 7, fontSize: 12.5, fontWeight: 600, color: '#fff', background: BLUE, border: 'none', borderRadius: RADIUS_MD, padding: '9px 12px' }}
      >
        <AISparkleIcon size={14} />
        Generate image
      </button>
    );
  }

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, padding: 12, marginBottom: 8 }}>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the image you want…"
        rows={3}
        style={{ ...ns, width: '100%', fontSize: 12.5, padding: '8px 10px', border: `1px solid ${BORDER}`, borderRadius: RADIUS_SM, resize: 'vertical' }}
      />
      <div style={{ ...ns, fontSize: 11, fontWeight: 600, color: SLATE, margin: '10px 0 5px' }}>Mode</div>
      <OptionGrid
        columns={2}
        value={mode}
        onChange={setMode}
        options={[{ id: 'quality' as const, label: 'Quality' }, { id: 'fast' as const, label: 'Fast' }]}
      />
      <div style={{ ...ns, fontSize: 11, fontWeight: 600, color: SLATE, margin: '10px 0 5px' }}>Aspect ratio</div>
      <OptionGrid
        columns={3}
        value={aspect}
        onChange={setAspect}
        options={[
          { id: 'square' as const, label: 'Square' },
          { id: 'landscape' as const, label: 'Landscape' },
          { id: 'portrait' as const, label: 'Portrait' },
        ]}
      />
      <div style={{ ...ns, fontSize: 11.5, color: SLATE, marginTop: 10, lineHeight: 1.4 }}>
        {limit === Infinity
          ? `${IMAGE_GENERATE_COST} credits per image · unlimited on your plan`
          : `Uses ${IMAGE_GENERATE_COST} of ${Math.max(remaining, 0)} credits left`}
      </div>
      <div className="flex" style={{ gap: 6, marginTop: 10 }}>
        <button
          onClick={() => { setOpen(false); setPrompt(''); }}
          className="flex-1 cursor-pointer"
          style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: INK, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, padding: '7px 6px' }}
        >
          Cancel
        </button>
        {/* A plain greyed-out button with no explanation reads as broken, not
            disabled — especially here, since Mode/Aspect ratio are already
            interactive above it, so nothing else on screen signals "empty
            prompt" as the blocker. flex-1 moves to this wrapper since Tooltip's
            own div is what's actually in the flex row now, not the button. */}
        <div className="flex-1">
        <Tooltip
          label={remaining < IMAGE_GENERATE_COST ? 'Out of credits this month' : !canGenerate ? 'Describe the image first' : 'Generate'}
          position="top"
        >
          <button
            disabled={!canGenerate}
            onClick={() => {
              const chosen = seededPick(STOCK_IMAGES, `${prompt}:${aspect}:${mode}`);
              const label = prompt.trim().slice(0, 40) || 'Generated image';
              library.useCredits(IMAGE_GENERATE_COST);
              library.add(label, chosen.src);
              onGenerated(chosen.src, label);
              setOpen(false);
              setPrompt('');
            }}
            className="w-full cursor-pointer"
            style={{
              ...ns, fontSize: 12.5, fontWeight: 600, color: '#fff', border: 'none', borderRadius: RADIUS_MD, padding: '7px 6px',
              background: canGenerate ? BLUE : '#9AA4B2', cursor: canGenerate ? 'pointer' : 'default',
            }}
          >
            {remaining < IMAGE_GENERATE_COST ? 'Out of credits' : 'Generate'}
          </button>
        </Tooltip>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, marginTop: first ? 0 : 20, marginBottom: 8 }}>
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
function PhotoSourcePanel({ currentPlan, currentSrc, onPick, title = 'Replace image' }: {
  currentPlan: string;
  currentSrc: string;
  onPick: (src: string, label: string) => void;
  title?: string;
}) {
  const library = useContext(ImageLibraryContext);
  const [query, setQuery] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [showUploads, setShowUploads] = useState(false);
  const uploads = useMemo(() => library.images.filter((i) => i.source === 'upload'), [library.images]);
  const generated = useMemo(() => library.images.filter((i) => i.source === 'generated'), [library.images]);
  const suggested = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? STOCK_IMAGES.filter((i) => i.label.toLowerCase().includes(q)) : STOCK_IMAGES;
  }, [query]);

  const grid = (items: ImageLibraryEntry[]) => (
    <OptionGrid
      columns={3}
      value={items.find((s) => s.src === currentSrc)?.label ?? null}
      onChange={(label) => {
        const picked = items.find((s) => s.label === label);
        if (picked) onPick(picked.src, picked.label);
      }}
      options={items.map((s) => ({
        id: s.label,
        title: s.label,
        render: <img src={s.src} alt={s.label} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block', borderRadius: 4 }} />,
      }))}
    />
  );

  return (
    <div style={{ padding: '16px 14px 4px' }}>
      <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, marginBottom: 8 }}>{title}</div>

      <SectionLabel first>Upload</SectionLabel>
      <ImageDropzone
        onPicked={(src, name) => { setUploadError(''); library.add(name, src, 'upload'); onPick(src, name); }}
        onError={setUploadError}
      />
      {uploadError && <div style={{ ...ns, fontSize: 11.5, color: '#B91C1C', marginTop: 6, lineHeight: 1.45 }}>{uploadError}</div>}

      <SectionLabel>{`My uploads (${uploads.length})`}</SectionLabel>
      <button
        type="button"
        onClick={() => setShowUploads((v) => !v)}
        className="w-full cursor-pointer flex items-center justify-center"
        style={{ ...ns, gap: 7, fontSize: 12.5, fontWeight: 600, color: INK, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, padding: '9px 12px' }}
      >
        <Icon d={ICONS.image} size={14} /> Browse my uploads
      </button>
      {showUploads && (
        uploads.length === 0
          ? <div style={{ ...ns, fontSize: 12, color: SLATE, padding: '8px 0 0' }}>Nothing uploaded yet.</div>
          : <div style={{ paddingTop: 8 }}>{grid(uploads)}</div>
      )}

      <SectionLabel>Suggested</SectionLabel>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search images…"
        style={{ ...ns, width: '100%', fontSize: 13, padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, marginBottom: 8 }}
      />
      {suggested.length === 0
        ? <div style={{ ...ns, fontSize: 12, color: SLATE, padding: '6px 0 4px' }}>No images match “{query}”.</div>
        : grid(suggested)}

      <SectionLabel>{`Wordgenie AI (${generated.length})`}</SectionLabel>
      <div style={{ paddingBottom: 16 }}>
        <GenerateImagePanel currentPlan={currentPlan} onGenerated={onPick} />
      </div>
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
      <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, marginBottom: 8 }}>
        {kind === 'video' ? 'Video' : 'Audio'}
      </div>
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
      <button
        onClick={onBack}
        className="flex items-center cursor-pointer"
        style={{ gap: 4, ...ns, fontSize: 11.5, fontWeight: 600, color: SLATE, background: 'none', border: 'none', padding: '14px 14px 0' }}
      >
        <Icon d={ICONS.back} size={12} /> Media
      </button>
      {picker.kind === 'image'
        ? <PhotoSourcePanel currentPlan={currentPlan} currentSrc={picker.picked?.src ?? ''} onPick={onPick} title="Choose a photo" />
        : <MediaUrlPicker kind={picker.kind} onPick={onPick} />}
      {picker.picked && (
        <div style={{ padding: '4px 14px 16px' }}>
          <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, marginBottom: 8 }}>Ready to place</div>
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

function FieldInput({ label, value, onChange, placeholder, hint, required, multiline }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string; required?: boolean; multiline?: boolean;
}) {
  const invalid = required && !value.trim();
  const style: React.CSSProperties = {
    ...ns, width: '100%', fontSize: 13, padding: '8px 10px',
    border: invalid ? '1px solid #F0B4AC' : `1px solid ${BORDER}`, borderRadius: RADIUS_MD, marginTop: 5,
  };
  return (
    <label style={{ ...ns, fontSize: 12, fontWeight: 600, color: INK, display: 'block' }}>
      {label}{required && <span style={{ color: '#B91C1C' }}> *</span>}
      {multiline
        ? <textarea rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={{ ...style, resize: 'vertical' }} />
        : <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={style} />}
      {hint && <span style={{ ...ns, display: 'block', fontSize: 11, fontWeight: 400, color: invalid ? '#B91C1C' : SLATE, marginTop: 4 }}>{hint}</span>}
    </label>
  );
}

/* A numeric W/H/X/Y field for cover elements — until now the only way to resize
   or reposition one was dragging its handles on the canvas, with no way to set
   an exact value. Committed on blur/Enter, not on every keystroke, so an
   in-progress "4" while typing "40" doesn't briefly clamp against the element's
   own current width. */
function DimensionField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(Math.round(value * 10) / 10));
  useEffect(() => { setDraft(String(Math.round(value * 10) / 10)); }, [value]);
  const commit = () => { const n = parseFloat(draft); if (!Number.isNaN(n)) onChange(n); else setDraft(String(Math.round(value * 10) / 10)); };
  return (
    <label className="flex items-center" style={{ gap: 6, border: `1px solid ${BORDER}`, borderRadius: RADIUS_SM, padding: '6px 8px' }}>
      <span style={{ ...ns, fontSize: 11, fontWeight: 700, color: SLATE, flexShrink: 0 }}>{label}</span>
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        style={{ ...ns, width: '100%', fontSize: 13, border: 'none', outline: 'none', textAlign: 'right', color: INK, background: 'transparent' }}
      />
      <span style={{ ...ns, fontSize: 11, color: SLATE, flexShrink: 0 }}>%</span>
    </label>
  );
}

/* ── Image inspector ─────────────────────────────────────────────────────────── */
function ImageInspector({ editor, onGoToMedia }: { editor: Editor; onGoToMedia: () => void }) {
  const attrs = editor.getAttributes('image') as { src: string; alt: string; wrap: WrapValue; caption: string; decorative: boolean; locked: boolean };
  const [alt, setAlt] = useState(attrs.alt ?? '');
  const [caption, setCaption] = useState(attrs.caption ?? '');
  const library = useContext(ImageLibraryContext);
  const [hoverPreview, setHoverPreview] = useState(false);
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

      {inGrid && gridAttrs && (
        <InspectorSection label="Image grid" hint="This image is one cell in a grid — these controls apply to the whole grid.">
          <OptionGrid
            columns={3}
            value={String(gridAttrs.cols ?? 2)}
            onChange={(v) => editor.chain().focus().updateAttributes('imageGridBlock', { cols: Number(v) }).run()}
            options={[2, 3, 4].map((n) => ({ id: String(n), label: `${n}` }))}
          />
        </InspectorSection>
      )}

      <InspectorSection label="Layout">
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
      </InspectorSection>

      <InspectorSection label="Accessibility">
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
            <FieldInput
              label="Alt text"
              required
              multiline
              value={alt}
              placeholder="Describe this image for screen readers"
              hint={alt ? undefined : 'Required before publishing.'}
              onChange={(v) => { setAlt(v); editor.chain().focus().updateAttributes('image', { alt: v }).run(); }}
            />
          </div>
        )}
      </InspectorSection>

      <InspectorSection label="Caption" hint="Shown centered under the image, like old Designrr's Captioned Image element. Leave blank for none.">
        <FieldInput
          label="Caption text"
          value={caption}
          placeholder="A short caption…"
          onChange={(v) => { setCaption(v); editor.chain().focus().updateAttributes('image', { caption: v }).run(); }}
        />
      </InspectorSection>

      <div style={{ ...ns, fontSize: 11.5, color: SLATE, lineHeight: 1.5 }}>
        This image is a block in the flowing text, not an object placed on top of it — surrounding paragraphs reflow around it automatically.
      </div>
    </InspectorShell>
  );
}

const FONT_SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96];

/* Matches PresentationEditorView's own FontDropdown pixel-for-pixel — same button
   shape, chevron and dropdown-list treatment — since a raw <select> reads as a
   different, lower-fidelity control sitting next to everything else custom-drawn
   in this inspector. `options` should include a leading { id: '', label: … }
   entry wherever an unset/theme-default state is meaningful. */
function FontFamilyDropdown({ value, options, onChange }: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const current = options.find((o) => o.id === value) ?? options[0];

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        className="w-full flex items-center justify-between cursor-pointer"
        style={{ height: 32, padding: '0 10px', borderRadius: 7, border: `1px solid ${BORDER}`, background: '#fff', ...ns, fontSize: 13, fontWeight: 500, color: INK }}
      >
        <span style={{ fontFamily: current?.id || ns.fontFamily, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current?.label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0, marginLeft: 6 }}><path d="M1 1l4 4 4-4" stroke={SLATE} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 bg-white" style={{ top: 'calc(100% + 4px)', left: 0, right: 0, borderRadius: 10, border: `1.5px solid ${BORDER}`, boxShadow: '0px 8px 24px rgba(15,23,51,0.14)', overflow: 'hidden', padding: 4 }}>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(o.id); setOpen(false); }}
              className="w-full flex items-center cursor-pointer"
              style={{ height: 32, padding: '0 8px', borderRadius: RADIUS_SM, border: 'none', background: o.id === value ? '#EEF3FF' : 'none', ...ns, fontSize: 13, fontFamily: o.id || ns.fontFamily, fontWeight: 500, color: o.id === value ? BLUE : INK, textAlign: 'left' }}
              onMouseEnter={(e) => { if (o.id !== value) e.currentTarget.style.background = '#F7F8FA'; }}
              onMouseLeave={(e) => { if (o.id !== value) e.currentTarget.style.background = 'none'; }}
            >
              {o.label}
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

/* Text inspector — the prose formatting set, composed from the same widgets as
   every other inspector. */
function TextInspector({ editor }: { editor: Editor }) {
  const currentStyle = editor.isActive('heading', { level: 3 }) ? 'h3'
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
  // Format and Link below are hidden while a real range is selected — that's
  // exactly when TextSelectionBubbleMenu is also on screen showing the same
  // Bold/Italic/Underline/Strike/Link controls, and showing both at once is
  // the literal duplicate-widget problem researched for this split. They stay
  // visible for a collapsed cursor, which is the one case the bubble menu
  // structurally can't serve (its own `shouldShow` requires `from !== to`) —
  // "set formatting before typing" still needs a home. Color and everything
  // else below never had a bubble-menu counterpart, so they're unconditional.
  const hasSelection = !editor.state.selection.empty;

  return (
    <InspectorShell>
      <InspectorSection label="Font">
        <div className="flex items-center" style={{ gap: 8 }}>
          <FontFamilyDropdown
            value={textStyleAttrs.fontFamily ?? ''}
            options={[{ id: '', label: 'Theme default' }, ...COVER_FONT_OPTIONS]}
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

      <InspectorSection label="Style">
        <OptionGrid
          value={currentStyle}
          onChange={(id) => {
            if (id === 'p') editor.chain().focus().setParagraph().run();
            else if (id === 'h3') editor.chain().focus().toggleHeading({ level: 3 }).run();
            else editor.chain().focus().toggleBlockquote().run();
          }}
          options={[
            { id: 'p', label: 'Paragraph' },
            { id: 'h3', label: 'Subheading' },
            { id: 'quote', label: 'Quote' },
          ]}
        />
      </InspectorSection>

      {!hasSelection && (
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
      )}

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
          colors={['#15191F', '#52637A', '#B91C1C', '#C2703D', '#2A7A57', '#006EFE', '#7C3AED']}
          value={textColor ?? '#15191F'}
          onChange={(c) => editor.chain().focus().setColor(c).run()}
        />
      </InspectorSection>

      <InspectorSection label="Text background">
        <SwatchRow
          colors={['#FEF3C7', '#DCFCE7', '#DBEAFE', '#FCE7F3', '#FDE68A']}
          value={highlightColor ?? ''}
          onChange={(c) => editor.chain().focus().setHighlight({ color: c }).run()}
        />
        {editor.isActive('highlight') && (
          <div style={{ marginTop: 8 }}>
            <FullButton label="Remove highlight" onClick={() => editor.chain().focus().unsetHighlight().run()} />
          </div>
        )}
      </InspectorSection>

      <InspectorSection label="List">
        <PillRow
          items={[
            // Neither pill used to light up for plain text — correct as "nothing's
            // active," but visually indistinguishable from "forgot to check." A
            // third, explicit option that lights up in exactly that case reads as
            // a real answer instead of an empty-looking row.
            {
              key: 'none',
              label: 'None',
              active: !editor.isActive('bulletList') && !editor.isActive('orderedList'),
              onClick: () => {
                if (editor.isActive('bulletList')) editor.chain().focus().toggleBulletList().run();
                else if (editor.isActive('orderedList')) editor.chain().focus().toggleOrderedList().run();
              },
            },
            { key: 'ul', label: '•⁠ Bulleted', active: editor.isActive('bulletList'), onClick: () => editor.chain().focus().toggleBulletList().run() },
            { key: 'ol', label: '1. Numbered', active: editor.isActive('orderedList'), onClick: () => editor.chain().focus().toggleOrderedList().run() },
          ]}
        />
      </InspectorSection>

      {/* Was a bare window.prompt with no way to see, edit or follow an existing
          link — the one control in this inspector that wasn't a real field. */}
      {!hasSelection && (
        <InspectorSection label="Link">
          <LinkField editor={editor} />
        </InspectorSection>
      )}

    </InspectorShell>
  );
}

/* Book-relevant merge tokens — matches the bracketed-placeholder convention seen in
   other publishing tools (e.g. "[Year]"), styled via the highlight mark so they read
   as a distinct field rather than literal text the author typed. Purely a visual
   placeholder in this prototype: nothing resolves these at export time yet. */
const DYNAMIC_FIELDS: { id: string; label: string; token: string }[] = [
  { id: 'author-name', label: 'Author name', token: '[Author name]' },
  { id: 'book-title', label: 'Book title', token: '[Book title]' },
  { id: 'year', label: 'Year', token: '[Year]' },
  { id: 'chapter-title', label: 'Chapter title', token: '[Chapter title]' },
  { id: 'chapter-number', label: 'Chapter number', token: '[Chapter number]' },
];

const SPECIAL_CHARACTERS: { char: string; name: string }[] = [
  { char: '—', name: 'Em dash' },
  { char: '–', name: 'En dash' },
  { char: '…', name: 'Ellipsis' },
  { char: '•', name: 'Bullet' },
  { char: '§', name: 'Section' },
  { char: '¶', name: 'Pilcrow' },
  { char: '©', name: 'Copyright' },
  { char: '®', name: 'Registered' },
  { char: '™', name: 'Trademark' },
  { char: '«', name: 'Left guillemet' },
  { char: '»', name: 'Right guillemet' },
  { char: '°', name: 'Degree' },
];

/* Insert-at-cursor tools for chapter text — moved out of the Text properties
   inspector since they insert new content rather than style what's selected,
   putting them with the rest of the left rail's insert tools instead. Needs
   an active chapter editor to insert into; with none focused yet, the grids
   go inert with a one-line hint rather than silently doing nothing on click. */
function TextToolsPanel({ editor }: { editor: Editor | null }) {
  return (
    <div style={{ marginTop: 16 }}>
      <InspectorSection
        label="Dynamic fields"
        hint={editor ? 'Inserts a placeholder that fills in automatically wherever it appears.' : 'Click into chapter text to insert one.'}
      >
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
      </InspectorSection>

      <InspectorSection label="Special characters" hint={editor ? undefined : 'Click into chapter text to insert one.'}>
        <OptionGrid
          columns={6}
          value={null}
          onChange={(char) => editor?.chain().focus().insertContent(char).run()}
          options={SPECIAL_CHARACTERS.map((c) => ({ id: c.char, label: c.char, title: c.name }))}
        />
      </InspectorSection>
    </div>
  );
}

/* Shape inspector. */
function ShapeInspector({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes('shapeBlock') as { d: string; color: string; locked: boolean };
  if (attrs.locked) {
    return (
      <InspectorShell>
        <LockedInspectorNotice onUnlock={() => editor.chain().focus().updateAttributes('shapeBlock', { locked: false }).run()} />
      </InspectorShell>
    );
  }
  return (
    <InspectorShell>
      <div style={{ display: 'flex', justifyContent: 'center', padding: 20, background: '#F7F8FA', borderRadius: RADIUS_MD, marginBottom: 16 }}>
        <svg viewBox="0 0 24 24" width="48" height="48" fill={attrs.color}><path d={attrs.d} /></svg>
      </div>

      <InspectorSection label="Colour">
        <SwatchRow
          colors={['#52637A', '#006EFE', '#F5A524', '#2A7A57', '#B91C1C', '#7C3AED', '#15191F']}
          value={attrs.color}
          onChange={(c) => editor.chain().focus().updateAttributes('shapeBlock', { color: c }).run()}
        />
      </InspectorSection>
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
          onChange={(v) => { setSrc(v); editor.chain().focus().updateAttributes('embedBlock', { src: v }).run(); }}
        />
      </InspectorSection>
    </InspectorShell>
  );
}

function QrInspector({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes('qrCodeBlock') as { url: string; locked: boolean };
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
      <InspectorSection label="Destination" hint="No live encoder is wired up in this prototype — the pattern is a stand-in, not a scannable code.">
        <FieldInput
          label="URL"
          value={url}
          placeholder="https://…"
          onChange={(v) => { setUrl(v); editor.chain().focus().updateAttributes('qrCodeBlock', { url: v }).run(); }}
        />
      </InspectorSection>
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
            colors={['#006EFE', '#52637A', '#B91C1C', '#C2703D', '#2A7A57', '#7C3AED', '#15191F']}
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
          onChange={(v) => { setLabel(v); editor.chain().focus().updateAttributes('textFieldBlock', { label: v }).run(); }}
        />
      </InspectorSection>
    </InspectorShell>
  );
}

function JumbotronInspector({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes('jumbotronBlock') as { heading: string; body: string; buttonLabel: string; bgColor: string; locked: boolean };
  const [heading, setHeading] = useState(attrs.heading ?? '');
  const [body, setBody] = useState(attrs.body ?? '');
  const [buttonLabel, setButtonLabel] = useState(attrs.buttonLabel ?? '');
  const update = (patch: Record<string, unknown>) => editor.chain().focus().updateAttributes('jumbotronBlock', patch).run();
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
          colors={['#EEF3FF', '#FDF6E7', '#E7F3ED', '#FBEAE8', '#F0F2F5', '#15191F']}
          value={attrs.bgColor}
          onChange={(c) => update({ bgColor: c })}
        />
      </InspectorSection>
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
    </InspectorShell>
  );
}

/* A small curated set — the same font families ThemeDef/TEXT_STYLES already draw
   from elsewhere in this file, not a new type system. */
const COVER_FONT_OPTIONS = [
  { id: "'Fraunces', Georgia, serif", label: 'Fraunces' },
  { id: "'Nunito Sans', sans-serif", label: 'Nunito Sans' },
  { id: 'Georgia, serif', label: 'Georgia' },
  { id: "'Source Sans 3', sans-serif", label: 'Source Sans' },
];

/* Cover inspector — reached both when an element is selected (kind:'coverElement')
   and when just the cover page itself is (kind:'page'). */
function CoverInspector({ page, selectedElementId, onUpdateElement }: {
  page: SimplePage;
  selectedElementId: string | null;
  onUpdateElement: (pageId: string, elementId: string, patch: CoverElementPatch) => void;
}) {
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

  return (
    <InspectorShell>
      {selected?.type === 'text' && (
        <>
          <InspectorSection label="Style preset">
            <OptionGrid
              columns={2}
              value={null}
              onChange={(id) => {
                const preset = TEXT_STYLES.find((s) => s.id === id);
                if (preset) update({ fontFamily: preset.fontFamily, fontSize: preset.fontSize, color: preset.color, fontWeight: preset.fontWeight, fontStyle: preset.fontStyle, letterSpacing: preset.letterSpacing, textTransform: preset.textTransform });
              }}
              options={TEXT_STYLES.map((s) => ({
                id: s.id,
                title: s.name,
                render: <span style={{ fontFamily: s.fontFamily, fontSize: Math.min(s.fontSize, 15), color: s.color, fontWeight: s.fontWeight, fontStyle: s.fontStyle, letterSpacing: s.letterSpacing, textTransform: s.textTransform }}>{s.name}</span>,
              }))}
            />
          </InspectorSection>
          {/* Font family and size in one row, not two stacked sections each
             carrying its own label — the two are one decision (what the text
             looks like), and this is exactly how the presentation editor's own
             text panel pairs them. */}
          <InspectorSection label="Font">
            <div className="flex items-center" style={{ gap: 8 }}>
              <FontFamilyDropdown
                value={selected.fontFamily}
                options={COVER_FONT_OPTIONS}
                onChange={(v) => update({ fontFamily: v })}
              />
              <FontSizeStepper
                value={selected.fontSize}
                min={8}
                max={96}
                onChange={(n) => update({ fontSize: n })}
              />
            </div>
          </InspectorSection>
          <InspectorSection label="Align">
            <PillRow
              items={[
                { key: 'left', label: <Icon d={ICONS.alignLeft} size={16} />, active: (selected.textAlign ?? 'center') === 'left', onClick: () => update({ textAlign: 'left' }) },
                { key: 'center', label: <Icon d={ICONS.alignCenter} size={16} />, active: (selected.textAlign ?? 'center') === 'center', onClick: () => update({ textAlign: 'center' }) },
                { key: 'right', label: <Icon d={ICONS.alignRight} size={16} />, active: selected.textAlign === 'right', onClick: () => update({ textAlign: 'right' }) },
              ]}
            />
          </InspectorSection>
          <InspectorSection label="Colour">
            <SwatchRow
              colors={['#15191F', '#52637A', '#fff', '#006EFE', '#E14F3D', '#A9812F']}
              value={selected.color}
              onChange={(c) => update({ color: c })}
            />
          </InspectorSection>
        </>
      )}

      {selected?.type === 'image' && (
        <>
          <InspectorSection label="Readability" hint="Darkens the photo so any text over it stays legible.">
            <ToggleRow label="Dark overlay" checked={selected.overlayDark !== false} onChange={(v) => update({ overlayDark: v })} />
          </InspectorSection>
        </>
      )}

      {selected?.type === 'shape' && (
        <>
          <InspectorSection label="Shape">
            <OptionGrid
              columns={4}
              value={selected.shape}
              onChange={(id) => update({ shape: id as CoverShapeElement['shape'] })}
              options={[
                { id: 'rectangle' as const, label: 'Rectangle' },
                { id: 'rounded' as const, label: 'Rounded' },
                { id: 'circle' as const, label: 'Circle' },
                { id: 'triangle' as const, label: 'Triangle' },
              ]}
            />
          </InspectorSection>
          {selected.shape === 'triangle' && (
            <InspectorSection label="Orientation" hint="Which corner holds the point — the stand-in for rotation.">
              <OptionGrid
                columns={4}
                value={selected.corner ?? 'br'}
                onChange={(id) => update({ corner: id as 'tl' | 'tr' | 'bl' | 'br' })}
                options={[
                  { id: 'tl' as const, label: '◤' },
                  { id: 'tr' as const, label: '◥' },
                  { id: 'bl' as const, label: '◣' },
                  { id: 'br' as const, label: '◢' },
                ]}
              />
            </InspectorSection>
          )}
          <InspectorSection label="Colour">
            <SwatchRow
              colors={['#E14F3D', '#3B5BDB', '#15191F', '#fff', '#A9812F', '#2A7A57']}
              value={selected.color}
              onChange={(c) => update({ color: c })}
            />
          </InspectorSection>
        </>
      )}

      {selected && (
        <InspectorSection label="Size & position" hint="Percent of the cover canvas.">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <DimensionField label="W" value={selected.w} onChange={(v) => update({ w: clampPct(v, COVER_MIN_PCT, 100 - selected.x) })} />
            <DimensionField label="H" value={selected.h} onChange={(v) => update({ h: clampPct(v, COVER_MIN_PCT, 100 - selected.y) })} />
            <DimensionField label="X" value={selected.x} onChange={(v) => update({ x: clampPct(v, 0, 100 - selected.w) })} />
            <DimensionField label="Y" value={selected.y} onChange={(v) => update({ y: clampPct(v, 0, 100 - selected.h) })} />
          </div>
        </InspectorSection>
      )}

      {!selected && (
        <div style={{ ...ns, fontSize: 12.5, color: SLATE, lineHeight: 1.55 }}>
          Click an element on the cover to edit it, or apply a different layout from the Templates tab.
        </div>
      )}
    </InspectorShell>
  );
}

/* TOC and back-matter pages have nothing to configure — they're generated or
   plain text — but selecting one should still land on something contextual
   rather than the generic "select a chapter" placeholder. */
function PageInfoInspector({ page }: { page: SimplePage }) {
  const isToc = page.type === 'toc';
  return (
    <InspectorShell>
      <div style={{ ...ns, fontSize: 12.5, color: SLATE, lineHeight: 1.55 }}>
        {isToc
          ? 'Entries are generated automatically from each chapter’s heading, with no page numbers — matching what Kindle and other retailers require. To change an entry, edit that chapter’s heading directly.'
          : 'A short author bio shown on its own page at the end of the book. Edit the text directly on the canvas.'}
      </div>
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
          <FontFamilyDropdown
            value={pageNumbers.fontFamily ?? ns.fontFamily}
            options={COVER_FONT_OPTIONS}
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
          colors={['#15191F', '#52637A', '#fff', '#006EFE', '#E14F3D', '#A9812F']}
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
  currentPlan, onLockedExport, theme, tocHeading, includeTocPage,
}: {
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
function PreviewPage({ page, pages, theme, chapterContent, fieldContent }: { page: PageMeta; pages: PageMeta[]; theme: ThemeDef; chapterContent: Record<string, string>; fieldContent: Record<string, string> }) {
  if (page.type === 'chapter') {
    const bodyFont = page.overrides.bodyFont ?? theme.bodyFont;
    const headingColor = page.overrides.headingColor ?? theme.headingColor;
    const html = chapterContent[page.id] ?? page.initialHtml;
    const titleHtml = fieldContent[`${page.id}::title`] ?? page.titleHtml;
    const chapterNumber = pages.filter((pg) => pg.type === 'chapter').findIndex((pg) => pg.id === page.id) + 1;
    return (
      <div style={{ background: theme.bg, border: `1px solid ${BORDER}`, borderRadius: 3, boxShadow: PAGE_SHADOW, minHeight: PAGE_MIN_H, padding: '55px 63px' }}>
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
                <span style={{ ...ns, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fff' }}>Chapter</span>
                <span style={{ fontFamily: theme.headingFont, fontWeight: 800, fontSize: 40, lineHeight: 1, color: '#fff' }}>{chapterNumber}</span>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ height: 4, width: 56, background: theme.accentColor, borderRadius: 2, marginBottom: 14 }} />
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span style={{ ...ns, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: theme.accentColor }}>Chapter</span>
                <span style={{ fontFamily: theme.headingFont, fontWeight: 800, fontSize: 44, lineHeight: 1, color: headingColor, opacity: 0.35 }}>{chapterNumber}</span>
              </div>
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
      <div style={{ position: 'relative', background: theme.bg, border: `1px solid ${BORDER}`, borderRadius: 3, boxShadow: PAGE_SHADOW, minHeight: PAGE_MIN_H, padding: '56px 64px', overflow: 'hidden' }}>
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
    <div style={{ background: theme.bg, border: `1px solid ${BORDER}`, borderRadius: 3, boxShadow: PAGE_SHADOW, minHeight: PAGE_MIN_H, display: 'flex', overflow: 'hidden' }}>
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
  pages, theme, chapterContent, fieldContent, pageNumbers, title, onClose,
}: {
  pages: PageMeta[];
  theme: ThemeDef;
  chapterContent: Record<string, string>;
  fieldContent: Record<string, string>;
  pageNumbers: PageNumberSettings;
  title: string;
  onClose: () => void;
}) {
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
  const railThumbH = railThumbW * (PAGE_MIN_H / PAGE_W);
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
                {p.type === 'cover' && frame.width !== PAGE_W ? (
                  <div style={{ width: frame.width, height: PAGE_MIN_H * (frame.width / PAGE_W), overflow: 'hidden' }}>
                    <div style={{ width: PAGE_W, transform: `scale(${frame.width / PAGE_W})`, transformOrigin: 'top left' }}>
                      <PreviewPage page={p} pages={pages} theme={theme} chapterContent={chapterContent} fieldContent={fieldContent} />
                    </div>
                  </div>
                ) : (
                  <PreviewPage page={p} pages={pages} theme={theme} chapterContent={chapterContent} fieldContent={fieldContent} />
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
                    outline: active ? `2.5px solid ${BLUE}` : `1.5px solid ${BORDER}`,
                  }}
                >
                  <div style={{ width: railThumbW, height: railThumbH, overflow: 'hidden', borderRadius: 5 }}>
                    <div style={{ width: PAGE_W, height: PAGE_MIN_H, transform: `scale(${railThumbW / PAGE_W})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
                      <PreviewPage page={p} pages={pages} theme={theme} chapterContent={chapterContent} fieldContent={fieldContent} />
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

/* Reached from the toolbar's clock icon — modeled on Figma/Google Docs/Notion's
   own version-history panel (researched directly, not guessed): a list of
   timestamped checkpoints on one side, a full read-only preview of whichever
   one is selected on the other, and a non-destructive Restore (see
   restoreVersion — it pushes the state you're leaving as its own new
   checkpoint first, so restoring is never a dead end). "Current version" is a
   pinned first row rather than one of `versions`, so the list always has
   something selected and the preview always has something to show even before
   the first checkpoint exists. */
function VersionHistoryOverlay({
  versions, pages, chapterContent, fieldContent, theme, onRestore, onClose,
}: {
  versions: VersionEntry[];
  pages: PageMeta[];
  chapterContent: Record<string, string>;
  fieldContent: Record<string, string>;
  // The live theme, for the "Current version" row/preview — historical entries
  // resolve their own theme from `selected.activeTheme` instead (see below).
  theme: ThemeDef;
  onRestore: (entry: VersionEntry) => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = versions.find((v) => v.id === selectedId) ?? null;
  const previewTheme = selected ? THEMES.find((t) => t.id === selected.activeTheme) ?? theme : theme;
  const previewPages = selected ? selected.pages : pages;
  const previewChapterContent = selected ? selected.chapterContent : chapterContent;
  const previewFieldContent = selected ? selected.fieldContent : fieldContent;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={{ background: '#EEF0F3', zIndex: 200, display: 'flex', flexDirection: 'column', position: 'fixed', inset: 0 }}>
      <div className="flex-shrink-0 flex items-center justify-between" style={{ height: 60, padding: '0 20px', borderBottom: `1px solid ${BORDER}`, background: '#fff' }}>
        <button onClick={onClose} className="flex items-center cursor-pointer" style={{ gap: 6, ...ns, fontSize: 13, fontWeight: 500, color: SLATE, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: RADIUS_MD, padding: '7px 14px' }}>
          <Icon d={ICONS.back} size={14} /> Back to editing
        </button>
        <div style={{ ...ns, fontSize: 13.5, fontWeight: 700, color: INK }}>Version history</div>
        <div style={{ width: 120 }} />
      </div>
      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
        <div className="flex-1 overflow-y-auto" style={{ padding: '40px 24px 120px' }}>
          <div style={{ width: PAGE_W, margin: '0 auto' }}>
            {previewPages.map((p) => (
              <div key={p.id} style={{ marginBottom: 40 }}>
                <PreviewPage page={p} pages={previewPages} theme={previewTheme} chapterContent={previewChapterContent} fieldContent={previewFieldContent} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex-shrink-0 flex flex-col" style={{ width: 280, borderLeft: `1px solid ${BORDER}`, background: '#fff' }}>
          <div style={{ padding: '16px 16px 0' }}>
            <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR }}>History</div>
          </div>
          <div className="flex-1 overflow-y-auto" style={{ padding: '10px' }}>
            <button
              onClick={() => setSelectedId(null)}
              className="w-full text-left cursor-pointer"
              style={{ display: 'block', padding: '10px', borderRadius: RADIUS_MD, border: 'none', background: !selected ? '#EEF3FF' : 'transparent', marginBottom: 2 }}
            >
              <div style={{ ...ns, fontSize: 13, fontWeight: 600, color: !selected ? BLUE : INK }}>Current version</div>
              <div style={{ ...ns, fontSize: 11.5, color: SLATE }}>What you&apos;re editing now</div>
            </button>
            {versions.map((v) => {
              const active = v.id === selectedId;
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedId(v.id)}
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
                No earlier checkpoints yet — they&apos;ll show up here a minute or so after you start editing.
              </div>
            )}
          </div>
          <div style={{ padding: 14, borderTop: `1px solid ${BORDER}` }}>
            <button
              onClick={() => selected && onRestore(selected)}
              disabled={!selected}
              className="w-full cursor-pointer"
              style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#fff', background: selected ? BLUE : '#C7CCD6', border: 'none', borderRadius: RADIUS_MD, padding: '10px 0' }}
            >
              Restore this version
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Pages panel — the visual page navigator, on the right rail rather than the
   left: Designrr's live product puts its Navigator on the right, and the left-hand
   filmstrip this supersedes was pulled for crowding out the insert tools. Deliberately
   not a second Chapters panel — that one edits structure (reorder, delete, word
   counts) as a text list; this one is for finding a page by what it looks like, and
   so reuses the Preview overlay's thumbnail vocabulary (scaled live PreviewPage,
   corner number badge, blue outline on the active page). ── */
/* One row's own "···" menu — Canva's actual pattern (hover a page thumbnail,
   a More icon appears in its corner, opening Duplicate/Delete) rather than a
   toolbar bound to whichever page happened to be clicked last. Notion and
   Figma converge on the same shape for their own page lists. Positioned via a
   portal so it can float over neighboring rows without the list's own
   `overflow-y` clipping it. */
// The one menu icon with no shared component of its own yet — DuplicateIcon
// and TrashIcon already exist for the other two (see presentationIcons.tsx).
function PlusIcon({ color = 'currentColor' }: { color?: string }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
}

function PageRowMenu({ anchor, onClose, items }: {
  // A plain {top, left} pair, measured by the caller at the moment the menu was
  // opened (inside its onClick, not here) — reading a ref's `.current` during
  // render isn't safe to depend on, and there's no reason to: the position only
  // ever needs computing once, right when the click that opens this happens.
  anchor: { top: number; left: number };
  onClose: () => void;
  items: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; hint?: string; tone?: 'default' | 'danger' }[];
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Excludes every row's own "···" trigger, not just this row's — that
      // button already toggles openMenuId itself; if this also closed on the
      // same mousedown, the click right behind it would immediately reopen
      // (toggling from a state this listener had just changed out from under
      // it), and clicking a *different* row's trigger is already handled
      // correctly by the state change alone.
      if (menuRef.current?.contains(target) || target.closest('.page-row-menu-anchor')) return;
      onClose();
    };
    document.addEventListener('mousedown', onDocClick);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocClick); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed flex flex-col bg-white"
      style={{ top: anchor.top, left: anchor.left, width: 176, zIndex: 200, padding: 5, borderRadius: RADIUS_LG, border: `1px solid ${PANEL_BORDER}`, boxShadow: MENU_SHADOW }}
    >
      {items.map((item) => {
        const tone = item.disabled ? '#C3CBD6' : item.tone === 'danger' ? '#B91C1C' : INK;
        const button = (
          <button
            disabled={item.disabled}
            onClick={() => { item.onClick(); onClose(); }}
            className="text-left cursor-pointer flex items-center"
            style={{
              ...ns, width: '100%', gap: 9, fontSize: 13, fontWeight: 500, padding: '7px 9px', borderRadius: RADIUS_SM, border: 'none',
              background: 'transparent', color: tone,
              opacity: item.disabled ? 0.7 : 1,
            }}
            onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = '#F4F6F9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            {/* Same colour as the label, not a fixed icon colour — keeps icon
               and text reading as one tone (dim together when disabled, red
               together for Delete) instead of two states drifting apart. */}
            <span className="flex items-center justify-center flex-shrink-0" style={{ width: 14, height: 14, color: tone }}>{item.icon}</span>
            {item.label}
          </button>
        );
        // Only wrap in a Tooltip when there's actually a reason to show one —
        // an empty label still renders a bubble, just with nothing in it.
        return item.disabled && item.hint
          ? <Tooltip key={item.label} label={item.hint} position="top">{button}</Tooltip>
          : <div key={item.label}>{button}</div>;
      })}
    </div>,
    document.body,
  );
}

/* One column, not a grid — PowerPoint, Google Slides and Canva's own default
   rail all read a page list this way; Canva's grid only shows up as a
   separate, deliberately-entered "Grid view" for bulk reordering, not the
   everyday panel. A single wide column also means an actually-legible
   thumbnail instead of a 124px postage stamp. */
function PagesPanel({ pages, theme, chapterContent, fieldContent, activePageId, onJump, onAddPageAt, onDuplicatePage, onDeletePage, onReorder }: {
  pages: PageMeta[];
  theme: ThemeDef;
  chapterContent: Record<string, string>;
  fieldContent: Record<string, string>;
  activePageId: string | null;
  onJump: (id: string) => void;
  onAddPageAt: (afterId: string) => void;
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
  // card and the panel's right edge (where the far-right rail sits), reading
  // as a stray gap between two panels that were actually flush.
  const thumbW = INSPECTOR_W - 14 * 2;
  const thumbH = thumbW * (PAGE_MIN_H / PAGE_W);
  const chapterCount = pages.filter((p) => p.type === 'chapter').length;
  // Which row's menu is open, plus where it should draw — measured once, at
  // the click that opened it, not re-derived from a stored ref on every render.
  const [openMenu, setOpenMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const lastChapterId = [...pages].reverse().find((p) => p.type === 'chapter')?.id;
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: 'before' | 'after' } | null>(null);

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <div style={{ padding: '16px 14px', flex: 1, overflowY: 'auto' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR }}>Pages</div>
          <div style={{ ...ns, fontSize: 11.5, color: SLATE }}>{pages.length} page{pages.length === 1 ? '' : 's'}</div>
        </div>
        <div className="flex flex-col" style={{ gap: 16 }}>
          {pages.map((p, i) => {
            const active = p.id === activePageId;
            const canDuplicate = p.type === 'chapter';
            const canDelete = p.type === 'toc' || (p.type === 'chapter' && chapterCount > 1);
            const deleteHint =
              p.type === 'chapter' && chapterCount <= 1 ? 'The book needs at least one chapter'
              : p.type === 'cover' || p.type === 'backmatter' ? `Can't delete the ${p.type === 'cover' ? 'cover' : 'back matter'}`
              : undefined;
            // The cover page's title literally defaults to "Cover" — same word
            // as its type — so both lines read as an identical-looking pair.
            const showType = p.type.toLowerCase() !== p.title.trim().toLowerCase();
            // Fixed to the thumbnail's own width, not left to stretch across the
            // panel — a wider row than its thumbnail is what put the "···"
            // button (anchored to the row's corner) off in the dead space past
            // the thumbnail's actual right edge instead of on it.
            const isChapter = p.type === 'chapter';
            const isDragging = dragId === p.id;
            const showDropBefore = isChapter && dropTarget?.id === p.id && dropTarget.pos === 'before';
            const showDropAfter = isChapter && dropTarget?.id === p.id && dropTarget.pos === 'after';
            return (
              <div key={p.id}>
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
                  <div style={{ position: 'relative', width: thumbW, borderRadius: RADIUS_MD, outline: active ? `2.5px solid ${BLUE}` : `1.5px solid ${BORDER}`, outlineOffset: 1 }}>
                    <div style={{ width: thumbW, height: thumbH, overflow: 'hidden', borderRadius: 5 }}>
                      <div style={{ width: PAGE_W, height: PAGE_MIN_H, transform: `scale(${thumbW / PAGE_W})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
                        <PreviewPage page={p} pages={pages} theme={theme} chapterContent={chapterContent} fieldContent={fieldContent} />
                      </div>
                    </div>
                    <div className="absolute flex items-center justify-center" style={{ bottom: 6, left: 6, minWidth: 19, height: 19, borderRadius: 4, background: 'rgba(15,23,51,0.55)', padding: '0 4px' }}>
                      <span style={{ ...ns, fontSize: 10.5, fontWeight: 700, color: '#fff' }}>{i + 1}</span>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, minWidth: 0, maxWidth: thumbW }}>
                    <div style={{ ...ns, fontSize: 13, fontWeight: 600, color: active ? BLUE : INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                    {showType && <div style={{ ...ns, fontSize: 11, color: SLATE, textTransform: 'capitalize' }}>{p.type}</div>}
                  </div>
                </button>

                {/* A sibling of the jump button, not a descendant of it — a button
                    inside a button is invalid HTML and browsers normalize the
                    nesting unpredictably. The wrapping div (not Tooltip's own —
                    Tooltip's trigger wrapper is itself `position:relative`, so
                    the button was anchoring to *that* tiny inline box instead of
                    the row, landing wherever the wrapper's own place in normal
                    flow was: right after the row's text, i.e. between cards)
                    is what carries `position:absolute` here, anchored to the
                    row exactly where the thumbnail's own corner is — the
                    thumbnail is always the row's first, top element, so this
                    stays correctly placed regardless of how the title below
                    wraps. Hidden until hovered, focused, or already open —
                    Canva's own reveal-on-hover behavior for its per-page More
                    icon, so the row reads clean at rest. */}
                <div
                  className={`transition-opacity duration-100${openMenu?.id === p.id ? '' : ' opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
                  style={{ position: 'absolute', top: 6, right: 6 }}
                >
                  <Tooltip label="Page options" position="top">
                    <button
                      className="page-row-menu-anchor cursor-pointer flex items-center justify-center"
                      onClick={(e) => {
                        if (openMenu?.id === p.id) { setOpenMenu(null); return; }
                        // Measured here, in the click itself — the one moment this
                        // genuinely needs the DOM, and safe to read it in.
                        const rect = e.currentTarget.getBoundingClientRect();
                        setOpenMenu({ id: p.id, top: rect.bottom + 4, left: rect.right - 176 });
                      }}
                      style={{ width: 24, height: 24, borderRadius: RADIUS_SM, border: 'none', background: 'rgba(15,23,51,0.55)', color: '#fff' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
                    </button>
                  </Tooltip>
                </div>

                {openMenu?.id === p.id && (
                  <PageRowMenu
                    anchor={openMenu}
                    onClose={() => setOpenMenu(null)}
                    items={[
                      { label: 'Add page after', icon: <PlusIcon />, onClick: () => onAddPageAt(p.id) },
                      { label: 'Duplicate page', icon: <DuplicateIcon color="currentColor" />, onClick: () => onDuplicatePage(p.id), disabled: !canDuplicate, hint: 'Only chapter pages can be duplicated' },
                      { label: 'Delete page', icon: <TrashIcon color="currentColor" />, onClick: () => onDeletePage(p.id), disabled: !canDelete, hint: deleteHint, tone: 'danger' },
                    ]}
                  />
                )}
                </div>
                {showDropAfter && <div style={{ height: 2, background: BLUE, borderRadius: 1, width: thumbW, marginTop: 14 }} />}
              </div>
            );
          })}
        </div>
      </div>
      {/* A plain, no-hover-required way to add one — the per-page menu above
          covers "insert relative to this page," this covers "just add one." */}
      <div style={{ padding: '12px 14px', borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <FullButton label="+ Add page" onClick={() => onAddPageAt(lastChapterId ?? pages[pages.length - 1].id)} />
      </div>
    </div>
  );
}

/* ── Chapters panel — the book's structure list, promoted from a toolbar dropdown
   to its own rail tab, then relocated 2026-09-16 from the left insert-tools rail
   to the right rail (alongside Pages/Properties). External research (Vellum,
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
function ChaptersPanel({ pages, wordTotal, wordCounts, titleWordCounts, onJump, onMoveToEdge, onReorder, onDelete, onAddChapter, onAddToc }: {
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
  onAddToc: () => void;
}) {
  const chapterCount = pages.filter((p) => p.type === 'chapter').length;
  // Position among chapters only (not the raw page index) — cover/toc sit before
  // the first chapter and back matter after the last, so "already at the edge"
  // has to be measured against other chapters, not neighboring page types.
  const chapterOrder = pages.filter((p) => p.type === 'chapter').map((p) => p.id);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: 'before' | 'after' } | null>(null);

  return (
    <div style={{ padding: '16px 14px', overflowY: 'auto', height: '100%' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR }}>Chapters</div>
        <div style={{ ...ns, fontSize: 11.5, color: SLATE }}>{chapterCount} chapter{chapterCount === 1 ? '' : 's'} · {wordTotal} words</div>
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
                className="flex items-center"
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
                style={{ gap: 2, padding: 2, borderRadius: RADIUS_SM, opacity: isDragging ? 0.4 : 1 }}
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
                {isChapter && (
                  <div className="flex items-center flex-shrink-0" style={{ gap: 1 }}>
                    <Tooltip label="Move to top" position="bottom">
                      <button
                        disabled={!canMoveToTop}
                        onClick={() => onMoveToEdge(p.id, 'top')}
                        className="flex items-center justify-center cursor-pointer"
                        style={{ width: 24, height: 24, borderRadius: 5, border: 'none', background: 'none', opacity: canMoveToTop ? 1 : 0.3 }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10M6 14l6-6 6 6" /><path d="M5 4h14" /></svg>
                      </button>
                    </Tooltip>
                    <Tooltip label="Move to bottom" position="bottom">
                      <button
                        disabled={!canMoveToBottom}
                        onClick={() => onMoveToEdge(p.id, 'bottom')}
                        className="flex items-center justify-center cursor-pointer"
                        style={{ width: 24, height: 24, borderRadius: 5, border: 'none', background: 'none', opacity: canMoveToBottom ? 1 : 0.3 }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v10M6 10l6 6 6-6" /><path d="M5 20h14" /></svg>
                      </button>
                    </Tooltip>
                    <Tooltip label={chapterCount <= 1 ? 'The book needs at least one chapter' : 'Delete chapter'} position="bottom">
                      <button
                        disabled={chapterCount <= 1}
                        // Deleting offers an undo toast instead of a confirm dialog:
                        // a reversible action asked about up front is worse than one
                        // you can simply take back (Gmail/Linear/Notion all landed here).
                        onClick={() => onDelete(p.id)}
                        className="flex items-center justify-center cursor-pointer"
                        style={{ width: 24, height: 24, borderRadius: 5, border: 'none', background: 'none', opacity: chapterCount <= 1 ? 0.3 : 1, color: '#B91C1C' }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                      </button>
                    </Tooltip>
                  </div>
                )}
                {/* TOC is optional, not a retailer requirement — the real EPUB nav
                    document is generated separately regardless of this visible page
                    (see addTocPage) — so it gets a plain delete, no reorder controls
                    since its position is fixed right after the cover. */}
                {p.type === 'toc' && (
                  <Tooltip label="Remove table of contents" position="bottom">
                    <button
                      onClick={() => onDelete(p.id)}
                      className="flex items-center justify-center cursor-pointer flex-shrink-0"
                      style={{ width: 24, height: 24, borderRadius: 5, border: 'none', background: 'none', color: '#B91C1C' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                    </button>
                  </Tooltip>
                )}
              </div>
              {showDropAfter && <div style={{ height: 2, background: BLUE, borderRadius: 1, margin: '0 6px' }} />}
            </div>
          );
        })}
      </div>
      <div className="flex flex-col" style={{ gap: 8 }}>
        <FullButton label="+ Add chapter" onClick={onAddChapter} />
        {!pages.some((p) => p.type === 'toc') && (
          <FullButton label="+ Add table of contents" onClick={onAddToc} />
        )}
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
  const [railTab, setRailTab] = useState<'text' | 'media' | 'elements' | 'templates' | 'booksettings'>('templates');
  /* Pages by default — Properties only takes over once something specific is
     actually selected (see the selectionKey effect below). The book's own
     default selection is the cover PAGE, not any one element on it, so landing
     on Properties for that showed little more than "click an element to edit
     it" — a properties panel with nothing yet to show properties for. Pages
     gives an immediate, always-useful view of the book's structure instead. */
  const [rightPanel, setRightPanel] = useState<'properties' | 'pages' | 'chapters'>('pages');
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  /* Which page the Pages panel's grid highlights and the +/duplicate/delete bar
     acts on. Can't reuse `selection` for this directly — jumping to a page from
     the grid only scrolls the canvas (selecting it outright would immediately
     flip rightPanel back to 'properties', see the selectionKey effect below,
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
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([
    { role: 'ai', text: 'Ask me to rewrite a paragraph, change the tone, or draft new content for the current chapter.' },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [draggedTile, setDraggedTile] = useState<string | null>(null);
  // Set while the Media tab is showing the source picker (Image/Video/Audio
  // clicked, not yet placed) instead of the tile grid — `picked` holds whatever
  // the picker has sourced so far, drag/click-ready but not in the book yet.
  const [mediaPicker, setMediaPicker] = useState<{ kind: MediaPickerKind; picked: { src: string; label: string } | null } | null>(null);
  // Which chapter's Editor a handle-drag started from, so the chapter it's
  // dropped on (possibly a different one) can read the node back off it.
  const moveDragRef = useRef<{ chapterId: string; editor: Editor } | null>(null);
  const [movingBlock, setMovingBlock] = useState(false);
  const [activeTheme, setActiveTheme] = useState<ThemeId>('statement-lettering');
  // Defaults to the cover rather than nothing, so the inspector opens already
  // showing something relevant instead of an empty "select something" placeholder.
  const [selection, setSelection] = useState<Selection>({ kind: 'page', pageId: 'p-cover' });
  // Unlike a cover image (already visible, discovered by clicking it), an unset
  // opener/back-matter photo has nothing to click yet — its "Add photo" affordance
  // jumps straight to the Media rail tab instead of leaving the user to find it,
  // the one difference from the plain setSelection every other selection uses.
  const handleSelection = useCallback((sel: Selection) => {
    setSelection(sel);
    if (sel.kind === 'openerImage' || sel.kind === 'backmatterAvatar') setRailTab('media');
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
  const [fieldContent, setFieldContent] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  /* Browser spell-check was never turned on or off explicitly, so every editing
     surface silently inherited whatever the browser defaulted to. It's a real
     setting now (Book settings → Document), defaulting on. */
  const [spellcheck, setSpellcheck] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [hydrated, setHydrated] = useState(false);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const hasProAccess = ownsPlan(currentPlan, 'pro');
  const lastVersionSavedAtRef = useRef(0);
  const [undoToast, setUndoToast] = useState<{ label: string; snapshot: Snapshot } | null>(null);
  const [navigatorTab, setNavigatorTab] = useState<'chapters' | 'find'>('chapters');
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
    : `${selection.kind}:${activePageId}`;
  // 'page' (and 'none') is the ambient "landed here, nothing specific clicked"
  // state — the cover's own default selection is exactly this, so treating it
  // as "an element is selected" would flip straight back to Properties on
  // every load and defeat the point of defaulting to Pages at all. Every other
  // kind (chapter text focused, an image/shape/table/etc., a cover element, the
  // page-number chip) is a deliberate selection worth showing properties for.
  const isElementSelection = selection.kind !== 'none' && selection.kind !== 'page';
  useEffect(() => { setRightPanel(isElementSelection ? 'properties' : 'pages'); }, [selectionKey]);
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
        p.type === 'chapter' ? { ...p, initialHtml: stored.chapterContent[p.id] ?? p.initialHtml } : p
      )));
      setMetadata(stored.metadata);
      setPageNumbers(stored.pageNumbers);
      setActiveTheme(stored.activeTheme);
      setChapterContent(stored.chapterContent);
      setFieldContent(stored.fieldContent);
      setSpellcheck(stored.spellcheck ?? true);
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
          version: 1, pages, metadata, pageNumbers, activeTheme, chapterContent, fieldContent, spellcheck,
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
  }, [hydrated, pages, metadata, pageNumbers, activeTheme, chapterContent, fieldContent, spellcheck]);

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
    setShowVersionHistory(false);
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setRightPanel('chapters');
        setRightPanelOpen(true);
        setNavigatorTab('find');
        // After the panel has mounted, not before.
        requestAnimationFrame(() => findInputRef.current?.focus());
      }
      if (e.key === 'Escape') setZoomOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  const editorPrefs = useMemo(() => ({ spellcheck }), [spellcheck]);

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

  const setLayout = useCallback((chapterId: string, layout: LayoutId) => {
    setPages((prev) => prev.map((p) => (p.id === chapterId && p.type === 'chapter' ? { ...p, layout } : p)));
  }, []);
  const setOverride = useCallback((chapterId: string, key: keyof ChapterOverrides, value: string) => {
    setPages((prev) => prev.map((p) => (p.id === chapterId && p.type === 'chapter' ? { ...p, overrides: { ...p.overrides, [key]: value } } : p)));
  }, []);
  const clearOverride = useCallback((chapterId: string, key: keyof ChapterOverrides) => {
    setPages((prev) => prev.map((p) => {
      if (p.id !== chapterId || p.type !== 'chapter') return p;
      const next = { ...p.overrides };
      delete next[key];
      return { ...p, overrides: next };
    }));
  }, []);
  const setTocExcluded = useCallback((chapterId: string, excluded: boolean) => {
    setPages((prev) => prev.map((p) => (p.id === chapterId && p.type === 'chapter' ? { ...p, excludeFromToc: excluded } : p)));
  }, []);
  const setOpenerImage = useCallback((chapterId: string, src: string) => {
    setPages((prev) => prev.map((p) => (p.id === chapterId && p.type === 'chapter' ? { ...p, openerImage: src } : p)));
  }, []);
  const setBackmatterPhoto = useCallback((pageId: string, src: string) => {
    setPages((prev) => prev.map((p) => (p.id === pageId && p.type === 'backmatter' ? { ...p, authorPhoto: src } : p)));
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
      return { ...p, coverElements: mergeCoverElements(p.coverElements ?? [], tpl.coverElements) };
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
  const sendAiMessage = useCallback(() => {
    const text = aiInput.trim();
    if (!text) return;
    setAiInput('');
    setAiMessages((prev) => [...prev, { role: 'user', text }]);
    const chapterTitle = pages.find((p) => p.id === activeChapterId)?.title;
    setTimeout(() => {
      setAiMessages((prev) => [...prev, {
        role: 'ai',
        text: chapterTitle ? `Got it — working on "${text}" for "${chapterTitle}"…` : `Got it — working on "${text}"…`,
      }]);
    }, 600);
  }, [aiInput, pages, activeChapterId]);



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

  const chapterCountForNumbering = (id: string) => {
    const contentPages = pages.filter((p) => !(pageNumbers.skipCoverAndBackMatter && (p.type === 'cover' || p.type === 'backmatter')));
    return contentPages.findIndex((p) => p.id === id);
  };

  return (
    <ImageLibraryContext.Provider value={imageLibrary}>
    <EditorPrefsContext.Provider value={editorPrefs}>
    <EditorRegistryContext.Provider value={registerEditor}>
    <div className="h-full flex flex-col overflow-hidden bg-white">
      <style jsx global>{`
        .book-color-input { appearance: none; -webkit-appearance: none; padding: 0; cursor: pointer; }
        .book-color-input::-webkit-color-swatch-wrapper { padding: 0; }
        .book-color-input::-webkit-color-swatch { border: none; border-radius: inherit; }
        .book-color-input::-moz-color-swatch { border: none; border-radius: inherit; }
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
          {/* The chapter list itself now lives in the right rail's Chapters tab —
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

          <div style={{ width: 1, height: 18, background: BORDER, margin: '0 6px', flexShrink: 0 }} />

          <Tooltip label="Version history" position="bottom">
            <button
              onClick={() => setShowVersionHistory(true)}
              className="flex items-center justify-center cursor-pointer"
              style={{ width: 30, height: 30, borderRadius: RADIUS_MD, border: 'none', background: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F6F9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              {/* Clock face + counter-clockwise sweep — inline like the
                  neighboring Split button, not a shared ICONS entry. */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l4 2" />
              </svg>
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
            { id: 'text', label: 'Text', icon: ICONS.textTab },
            { id: 'media', label: 'Media', icon: ICONS.image },
            { id: 'elements', label: 'Elements', icon: ICONS.shapesTab },
            { id: 'templates', label: 'Templates', icon: ICONS.templatesTab },
            { id: 'booksettings', label: 'Book settings', icon: ICONS.settings },
          ] as const).map((item) => (
            <button
              key={item.id}
              onClick={() => setRailTab(item.id)}
              className={`transition-colors duration-150${railTab === item.id ? '' : ' hover:bg-[#F6F7F9]'}`}
              style={{
                width: '90%', height: 58, borderRadius: RADIUS_LG, border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                background: railTab === item.id ? '#EEF3FF' : 'transparent', color: railTab === item.id ? BLUE : SLATE,
              }}
            >
              <Icon d={item.icon} size={19} />
              <span style={{ ...ns, fontSize: 11, fontWeight: 700 }}>{item.label}</span>
            </button>
          ))}
        </div>

        {/* contextual panel */}
        <div className="flex-shrink-0 h-full bg-white" style={{ width: PANEL_W, borderRight: `1px solid ${BORDER}` }}>
          {railTab === 'text' && (
            <div style={{ overflowY: 'auto', height: '100%' }}>
              <InsertPanel
                currentPlan={currentPlan}
                groups={['Text']}
                onDragTile={setDraggedTile}
                onLockedClick={(tile) => setUpgradeCtx({ message: 'Unlock this block', feature: tile.label })}
                onLockedTextStyle={(tile) => setUpgradeCtx({ message: 'Unlock this text style', feature: tile.label })}
                onInsertTile={insertTileAtCursor}
                textExtras={<TextToolsPanel editor={activeEditor} />}
              />
            </div>
          )}
          {railTab === 'media' && (
            <div style={{ overflowY: 'auto', height: '100%' }}>
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
                    return <PhotoSourcePanel currentPlan={currentPlan} currentSrc={chapter.openerImage ?? ''} onPick={(picked) => setOpenerImage(chapter.id, picked)} title="Opener photo" />;
                  })()}
                  {selection.kind === 'backmatterAvatar' && (() => {
                    const bmPage = pages.find((p) => p.id === selection.pageId) as SimplePage | undefined;
                    if (!bmPage) return null;
                    return <PhotoSourcePanel currentPlan={currentPlan} currentSrc={bmPage.authorPhoto ?? ''} onPick={(picked) => setBackmatterPhoto(bmPage.id, picked)} title="Author photo" />;
                  })()}
                  <InsertPanel
                    currentPlan={currentPlan}
                    groups={['Media']}
                    onDragTile={setDraggedTile}
                    onLockedClick={(tile) => setUpgradeCtx({ message: 'Unlock this block', feature: tile.label })}
                    onLockedTextStyle={(tile) => setUpgradeCtx({ message: 'Unlock this text style', feature: tile.label })}
                    onInsertTile={handleMediaInsertTile}
                  />
                </>
              )}
            </div>
          )}
          {railTab === 'elements' && (
            <div style={{ overflowY: 'auto', height: '100%' }}>
              {selection.kind === 'shape' && (() => {
                const ed = selection.editor;
                const attrs = ed.getAttributes('shapeBlock') as { d: string; color: string };
                return (
                  <div style={{ padding: '16px 14px 4px', borderBottom: `1px solid ${BORDER}`, marginBottom: 12 }}>
                    <div style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: EYEBROW_COLOR, marginBottom: 8 }}>Swap shape</div>
                    <div style={{ paddingBottom: 12 }}>
                      <OptionGrid
                        columns={4}
                        value={SHAPE_LIBRARY.find((s) => s.d === attrs.d)?.id ?? null}
                        onChange={(id) => {
                          const shape = SHAPE_LIBRARY.find((s) => s.id === id);
                          if (shape) ed.chain().focus().updateAttributes('shapeBlock', { d: shape.d, color: shape.color }).run();
                        }}
                        options={SHAPE_LIBRARY.map((s) => ({
                          id: s.id,
                          title: s.label,
                          render: <svg viewBox="0 0 24 24" width="20" height="20" fill={s.color}><path d={s.d} /></svg>,
                        }))}
                      />
                    </div>
                  </div>
                );
              })()}
              <InsertPanel
                currentPlan={currentPlan}
                groups={['Shapes', 'Layout', 'Interactive', 'Worksheets']}
                onDragTile={setDraggedTile}
                onLockedClick={(tile) => setUpgradeCtx({ message: 'Unlock this block', feature: tile.label })}
                onLockedTextStyle={(tile) => setUpgradeCtx({ message: 'Unlock this text style', feature: tile.label })}
                onInsertTile={insertTileAtCursor}
              />
            </div>
          )}
          {railTab === 'templates' && (
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
          {railTab === 'booksettings' && (
            <div style={{ overflowY: 'auto', height: '100%' }}>
              <DesignPanel
                activeTheme={activeTheme}
                selection={selection}
                pages={pages}
                onSetLayout={setLayout}
                onSetOverride={setOverride}
                onClearOverride={clearOverride}
                onSetTocExcluded={setTocExcluded}
              />
              <MetadataPanel metadata={metadata} setMetadata={setMetadata} />
              {/* Cover controls used to live here as a fixed bg-image/overlay picker —
                  now that the cover is a real element canvas, its controls only make
                  sense in the context of a selected element, so they live in the
                  right-hand inspector (click the cover or an element on it) instead. */}
              <SettingsPanel pageNumbers={pageNumbers} setPageNumbers={setPageNumbers} spellcheck={spellcheck} setSpellcheck={setSpellcheck} />
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
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'ai' && (
                  <div className="flex items-center justify-center flex-shrink-0" style={{ width: 22, height: 22, borderRadius: '50%', background: '#F0EEFF', marginRight: 7 }}>
                    <AISparkleIcon size={13} />
                  </div>
                )}
                <div style={{
                  maxWidth: '82%', padding: '9px 12px', lineHeight: 1.5, borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                  background: msg.role === 'user' ? BLUE : '#F4F6F9', ...ns, fontSize: 13, color: msg.role === 'user' ? '#fff' : INK,
                }}>
                  {msg.text}
                </div>
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
        <div className="flex-1 min-w-0 h-full">
        {/* overflow-x here used to be the implicit default (visible): at any
            viewport where the fixed side rails leave less than PAGE_W available,
            the centered page div overflowed sideways with nothing clipping it —
            it just rendered underneath the Inspector panel's opaque background,
            silently hiding real manuscript text with no scrollbar or warning. */}
        <div className="h-full overflow-auto" style={{ background: '#EEF0F3', padding: '40px 24px 120px' }}>
          {/* `transform` doesn't affect layout, so the scroll container used to size
              itself to the unscaled document: above 100% the end of the book was
              unreachable, below it there was a large dead gap. The outer box is
              given the scaled height explicitly, measured off the inner one. */}
          <div style={{ width: PAGE_W * (zoom / 100), height: canvasHeight * (zoom / 100), margin: '0 auto' }}>
          <div ref={canvasInnerRef} style={{ width: PAGE_W, transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}>
            {pages.map((p) => (
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
                    getFieldEditor={(key) => editorRegistry.current.get(key)?.editor}
                    moveDragRef={moveDragRef}
                    onMoveDragActiveChange={setMovingBlock}
                    currentSelection={selection}
                    onSelection={handleSelection}
                    onAddChapterAfter={addChapterAfter}
                    onSplitChapter={splitChapter}
                    onBeginChapterEdit={beginChapterEdit}
                    onWordCountChange={(id, words) => setWordCounts((prev) => ({ ...prev, [id]: words }))}
                    onAltStatusChange={(id, missing) => setAltStatus((prev) => ({ ...prev, [id]: missing }))}
                    onEditorFocus={(ed) => { setActiveEditor(ed); setActiveChapterId(p.id); }}
                    onContentChange={(id, html) => setChapterContent((prev) => ({ ...prev, [id]: html }))}
                    titleHtml={fieldContent[`${p.id}::title`] ?? p.titleHtml}
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
                    onSelectPage={(pageId) => setSelection({ kind: 'page', pageId })}
                    onUpdateElement={updateCoverElement}
                    onReorderElement={reorderCoverElement}
                    onDuplicateElement={duplicateCoverElement}
                    onDeleteElement={deleteCoverElement}
                  />
                )}
              </div>
            ))}
          </div>
          </div>
        </div>
        </div>

        {/* inspector — Properties, Pages or Chapters, whichever the right rail has active */}
        {rightPanelOpen && (
        <div className="flex-shrink-0 h-full bg-white" style={{ width: INSPECTOR_W, borderLeft: `1px solid ${BORDER}`, overflowY: rightPanel === 'chapters' ? 'hidden' : 'auto' }}>
          {rightPanel === 'pages' ? (
            <PagesPanel
              pages={pages}
              theme={theme}
              chapterContent={chapterContent}
              fieldContent={fieldContent}
              activePageId={pagesPanelActiveId}
              onJump={(id) => { jumpTo(id); setPagesActiveId(id); }}
              onAddPageAt={addChapterAfter}
              onDuplicatePage={duplicatePage}
              onDeletePage={deletePage}
              onReorder={reorderChapter}
            />
          ) : rightPanel === 'chapters' ? (
            /* Two tabs in one navigator pane — the structure of the book, and a way
               to search it. Word's Navigation Pane is the precedent. Moved here from
               the left insert-tools rail 2026-09-16 — structure navigation shouldn't
               share a rail with Text/Media/Elements-type tools (see book-editor-panel-
               model memory); the right rail, alongside Pages, is its dedicated home now. */
            <div className="h-full flex flex-col" style={{ minHeight: 0 }}>
              <div className="flex flex-shrink-0" style={{ padding: '10px 14px 0', gap: 4 }}>
                {([['chapters', 'Chapters'], ['find', 'Find']] as const).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setNavigatorTab(id)}
                    className="flex-1 cursor-pointer"
                    style={{
                      ...ns, fontSize: 12.5, fontWeight: 700, padding: '7px 8px', borderRadius: RADIUS_SM, border: 'none',
                      background: navigatorTab === id ? '#EEF3FF' : 'transparent',
                      color: navigatorTab === id ? BLUE : SLATE,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex-1" style={{ minHeight: 0 }}>
                {navigatorTab === 'chapters' ? (
                  <ChaptersPanel
                    pages={pages}
                    wordCounts={wordCounts}
                    titleWordCounts={titleWordCounts}
                    wordTotal={Object.values(wordCounts).reduce((s, n) => s + n, 0) + Object.values(titleWordCounts).reduce((s, n) => s + n, 0)}
                    onJump={jumpTo}
                    onMoveToEdge={moveChapterToEdge}
                    onReorder={reorderChapter}
                    onDelete={deletePage}
                    onAddChapter={() => {
                      const lastChapter = [...pages].reverse().find((p) => p.type === 'chapter');
                      addChapterAfter(lastChapter?.id ?? coverPageId);
                    }}
                    onAddToc={addTocPage}
                  />
                ) : (
                  <FindPanel registry={editorRegistry} pages={pages} onJump={jumpTo} inputRef={findInputRef} />
                )}
              </div>
            </div>
          ) : selection.kind === 'image' ? (
            <ImageInspector editor={selection.editor} onGoToMedia={() => setRailTab('media')} />
          ) : selection.kind === 'shape' ? (
            <ShapeInspector editor={selection.editor} />
          ) : selection.kind === 'embed' ? (
            <EmbedInspector editor={selection.editor} />
          ) : selection.kind === 'qr' ? (
            <QrInspector editor={selection.editor} />
          ) : selection.kind === 'chart' ? (
            <ChartInspector editor={selection.editor} />
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
              selectedElementId={selection.elementId}
              onUpdateElement={updateCoverElement}
            />
          ) : selection.kind === 'page' && pages.find((p) => p.id === selection.pageId)?.type === 'cover' ? (
            <CoverInspector
              page={pages.find((p) => p.id === selection.pageId) as SimplePage}
              selectedElementId={null}
              onUpdateElement={updateCoverElement}
            />
          ) : selection.kind === 'page' ? (
            <PageInfoInspector page={pages.find((p) => p.id === selection.pageId) as SimplePage} />
          ) : selection.kind === 'pageNumber' ? (
            <PageNumberInspector pageNumbers={pageNumbers} setPageNumbers={setPageNumbers} />
          ) : selection.kind === 'chapter' && activeEditor ? (
            <TextInspector editor={activeEditor} />
          ) : (
            <div style={{ padding: '16px 14px', ...ns, fontSize: 12.5, color: SLATE }}>
              Click into the chapter text to see formatting controls here. Layout and theme controls are in the Design panel on the left.
            </div>
          )}
        </div>
        )}

        {/* right icon rail — mirrors the left rail's vocabulary at the far edge, the
            way Designrr's live Navigator sits. Clicking the active item collapses the
            panel, handing its width back to the canvas. Mirrors the left rail's own
            borderRight (line ~6764) on the opposite side: that rail draws a hairline
            against ITS content panel, and the content panel draws its own separate
            one against the canvas — two boundaries, not one shared between three
            surfaces. This rail used to skip its half on the theory the panel's own
            canvas-facing border already covered "the one real boundary," but that
            border faces the canvas, not this rail — it left panel and rail fused into
            one undivided white surface with no seam at all. */}
        <div className="flex-shrink-0 h-full flex flex-col items-center bg-white" style={{ width: RAIL_W, borderLeft: `1px solid ${BORDER}`, paddingTop: 12, gap: 4 }}>
          {([
            { id: 'pages', label: 'Pages', icon: ICONS.pagesTab },
            { id: 'chapters', label: 'Chapters', icon: ICONS.chapterBreak },
            { id: 'properties', label: 'Properties', icon: ICONS.propertiesTab },
          ] as const).map((item) => {
            const active = rightPanelOpen && rightPanel === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (rightPanelOpen && rightPanel === item.id) { setRightPanelOpen(false); return; }
                  setRightPanel(item.id);
                  setRightPanelOpen(true);
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
            return { id: c.id, title: c.title, layout: c.layout, html: titleHeadingHtml + (chapterContent[c.id] ?? c.initialHtml) };
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
          pageNumbers={pageNumbers}
          title={metadata.title || 'Untitled book'}
          onClose={() => setShowPreview(false)}
        />
      )}

      {showVersionHistory && (
        <VersionHistoryOverlay
          versions={versions}
          pages={pages}
          chapterContent={chapterContent}
          fieldContent={fieldContent}
          theme={theme}
          onRestore={restoreVersion}
          onClose={() => setShowVersionHistory(false)}
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
    </EditorPrefsContext.Provider>
    </ImageLibraryContext.Provider>
  );
}
