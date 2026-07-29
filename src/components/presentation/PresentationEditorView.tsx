'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { useFlowStore } from '@/stores/flowStore';
import { usePresentationFlowStore, type PresentationSlide, type SlideLayout, type SlideType, type TextOffset } from '@/stores/presentationFlowStore';
import { MOCK_THEMES, type MockTheme } from '@/lib/presentationMocks';
import { NarratedVideoModal } from './NarratedVideoModal';
import ShareLinkModal from './ShareLinkModal';
import { Tooltip } from '../ui/Tooltip';
import { SideMenuIcon } from '../sidebar/AppSidebar';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;
const ZOOM_OPTIONS = [33, 50, 75, 90, 100, 125, 150, 175, 200];
const ZOOM_MIN = 25;
const ZOOM_MAX = 250;
const FILMSTRIP_W = 240;
const RIGHT_PANEL_W = 296;
const NAV_W = 76;

/* ───────────────────────── Layouts ───────────────────────── */

const LAYOUTS: { id: SlideLayout; name: string }[] = [
  { id: 'standard',    name: 'Standard'    },
  { id: 'centered',    name: 'Centered'    },
  { id: 'image-right', name: 'Image right' },
  { id: 'image-left',  name: 'Image left'  },
  { id: 'two-column',  name: 'Two column'  },
  { id: 'big-title',   name: 'Big title'   },
  { id: 'split',       name: 'Split panel' },
  { id: 'minimal',     name: 'Minimal'     },
  { id: 'fig-cover-1', name: 'Classic' }, { id: 'fig-cover-2', name: 'Accent' }, { id: 'fig-cover-3', name: 'Bold' },
  { id: 'fig-section-1', name: 'Classic' }, { id: 'fig-section-2', name: 'Accent' }, { id: 'fig-section-3', name: 'Bold' },
  { id: 'fig-bullets-1', name: 'Classic' }, { id: 'fig-bullets-2', name: 'Accent' }, { id: 'fig-bullets-3', name: 'Bold' },
  { id: 'fig-two-col-1', name: 'Classic' }, { id: 'fig-two-col-2', name: 'Accent' }, { id: 'fig-two-col-3', name: 'Bold' },
  { id: 'fig-three-col-1', name: 'Classic' }, { id: 'fig-three-col-2', name: 'Accent' }, { id: 'fig-three-col-3', name: 'Bold' },
  { id: 'fig-photo-text-1', name: 'Classic' }, { id: 'fig-photo-text-2', name: 'Accent' }, { id: 'fig-photo-text-3', name: 'Bold' },
  { id: 'fig-text-photo-1', name: 'Classic' }, { id: 'fig-text-photo-2', name: 'Accent' }, { id: 'fig-text-photo-3', name: 'Bold' },
  { id: 'fig-full-image-1', name: 'Classic' }, { id: 'fig-full-image-2', name: 'Accent' }, { id: 'fig-full-image-3', name: 'Bold' },
  { id: 'fig-comparison-1', name: 'Classic' }, { id: 'fig-comparison-2', name: 'Accent' }, { id: 'fig-comparison-3', name: 'Bold' },
  { id: 'fig-grid-1', name: 'Classic' }, { id: 'fig-grid-2', name: 'Accent' }, { id: 'fig-grid-3', name: 'Bold' },
  { id: 'fig-quote-1', name: 'Classic' }, { id: 'fig-quote-2', name: 'Accent' }, { id: 'fig-quote-3', name: 'Bold' },
  { id: 'fig-closing-1', name: 'Classic' }, { id: 'fig-closing-2', name: 'Accent' }, { id: 'fig-closing-3', name: 'Bold' },
];

/** Ascend template layouts are named `fig-<family>-<1|2|3>` — this extracts the family, or null for the original 8 layouts */
function figFamilyOf(id: SlideLayout): string | null {
  const m = /^fig-(.+)-[123]$/.exec(id);
  return m ? m[1] : null;
}

/** Default seed content for an Ascend-family layout, used when switching into one with no existing points */
const FIG_DEFAULT_POINTS: Record<string, string[]> = {
  cover: ['A concise and compelling subtitle that supports your main message', 'Author Name  ·  2026'],
  section: ['SECTION 01'],
  bullets: [
    'First key point\nA brief explanation that supports this idea with relevant context or data.',
    'Second key point\nAnother supporting detail. Keep each bullet to one clear, digestible idea.',
    'Third key point\nA third insight that builds on the previous points and adds depth.',
  ],
  'two-col': [
    'Key Point One\nA brief description that supports this key idea and adds context to your presentation audience.',
    'Key Point Two\nAnother supporting detail that helps tell your story. Keep it concise and visually balanced.',
  ],
  'three-col': [
    'Key Point One\nA brief description that supports this key idea and adds context to your presentation audience.',
    'Key Point Two\nAnother supporting detail that helps tell your story. Keep it concise and visually balanced.',
    'Key Point Three\nA third insight or takeaway that rounds out this section and drives your message home.',
  ],
  'photo-text': ['Supporting description that expands on the slide title. Keep this concise and let the image do the heavy lifting.'],
  'text-photo': ['Supporting description that expands on the slide title. Keep this concise and let the image do the heavy lifting.'],
  comparison: [
    'Current Approach', 'First characteristic of this option', 'Second characteristic of this option',
    '---',
    'Proposed Approach', 'First characteristic of this option', 'Second characteristic of this option',
  ],
  grid: [
    'First Point\nA supporting explanation for this item. Keep it short and focused on one idea.',
    'Second Point\nAnother explanation here. Each block should be self-contained and easy to scan.',
    'Third Point\nA third idea that rounds out the top row and contributes to the overall message.',
    'Fourth Point\nA final point that ties the slide together and reinforces the headline above.',
  ],
  quote: ['— Author Name, Role or Organization'],
  closing: ['name@email.com  ·  www.yourwebsite.com'],
};

/* ───────────────────────── Icons ───────────────────────── */

function DuplicateIcon({ color = '#3D4A5C' }: { color?: string }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
}
function TrashIcon({ color = '#E54B4B' }: { color?: string }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 6V4a2 2 0 0 1 4 0v2"/><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>;
}
function LayoutIcon({ color = '#3D4A5C' }: { color?: string }) {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5.5" height="8" rx="1" stroke={color} strokeWidth="1.3"/><rect x="7.5" y="1" width="5.5" height="3.5" rx="1" stroke={color} strokeWidth="1.3"/><rect x="7.5" y="5.5" width="5.5" height="7.5" rx="1" stroke={color} strokeWidth="1.3"/></svg>;
}
function DotsIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="#52637A"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>;
}
function ChevronDown() {
  return <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke="#8C97A8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function PlayIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>;
}
function ChevronLR({ dir }: { dir: 'left' | 'right' }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{dir === 'left' ? <polyline points="15 18 9 12 15 6"/> : <polyline points="9 18 15 12 9 6"/>}</svg>;
}
function SavedIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#29A341" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>;
}
const AI_GRADIENT = 'linear-gradient(244.79deg, #006EFE 2.17%, #5326BD 103.16%)';
// Natural/authoring width for slide content — every slide canvas (thumbnail, main editor,
// present mode) renders its content at this fixed width, then scales the whole thing via
// CSS transform to fit whatever box it's placed in, so fixed/vw-based font sizes stay
// visually proportional to the slide instead of wrapping when the box is resized.
const SLIDE_VIRTUAL_W = 880;

function hexLuminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length < 6) return 1;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function isDark(hex: string): boolean { return hexLuminance(hex) < 0.35; }

function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(79,70,229,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Card wrapper used by the "boxed" variants of the Ascend template's layouts */
function FigCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: '#fff', border: '1px solid #E8EBF2', borderRadius: 10, boxShadow: '0px 4px 16px rgba(15,23,51,0.06)', ...style }}>{children}</div>;
}

function AISparkleIcon({ size = 18 }: { size?: number }) {
  // The official Wordgenie mark — same source as public/assets/wordgenie-icon.svg (used in the "by New Wordgenie" lockup).
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 4L13.4507 11.7507C13.3202 12.1473 13.0984 12.5078 12.8031 12.8031C12.5078 13.0984 12.1473 13.3202 11.7507 13.4507L4 16L11.7507 18.5493C12.1473 18.6798 12.5078 18.9016 12.8031 19.1969C13.0984 19.4922 13.3202 19.8527 13.4507 20.2493L16 28L18.5493 20.2493C18.6798 19.8527 18.9016 19.4922 19.1969 19.1969C19.4922 18.9016 19.8527 18.6798 20.2493 18.5493L28 16L20.2493 13.4507C19.8527 13.3202 19.4922 13.0984 19.1969 12.8031C18.9016 12.5078 18.6798 12.1473 18.5493 11.7507L16 4Z" fill="url(#wgIconGradA)" stroke="url(#wgIconGradA)" strokeWidth="1.125" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 2L5.15022 4.58356C5.10673 4.71578 5.0328 4.83595 4.93437 4.93437C4.83595 5.0328 4.71578 5.10673 4.58356 5.15022L2 6L4.58356 6.84978C4.71578 6.89327 4.83595 6.9672 4.93437 7.06563C5.0328 7.16405 5.10673 7.28422 5.15022 7.41644L6 10L6.84978 7.41644C6.89327 7.28422 6.9672 7.16405 7.06563 7.06563C7.16405 6.9672 7.28422 6.89327 7.41644 6.84978L10 6L7.41644 5.15022C7.28422 5.10673 7.16405 5.0328 7.06563 4.93437C6.9672 4.83595 6.89327 4.71578 6.84978 4.58356L6 2Z" fill="url(#wgIconGradB)" stroke="url(#wgIconGradB)" strokeWidth="0.375" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M26 22L25.1502 24.5836C25.1067 24.7158 25.0328 24.8359 24.9344 24.9344C24.8359 25.0328 24.7158 25.1067 24.5836 25.1502L22 26L24.5836 26.8498C24.7158 26.8933 24.8359 26.9672 24.9344 27.0656C25.0328 27.1641 25.1067 27.2842 25.1502 27.4164L26 30L26.8498 27.4164C26.8933 27.2842 26.9672 27.1641 27.0656 27.0656C27.1641 26.9672 27.2842 26.8933 27.4164 26.8498L30 26L27.4164 25.1502C27.2842 25.1067 27.1641 25.0328 27.0656 24.9344C26.9672 24.8359 26.8933 24.7158 26.8498 24.5836L26 22Z" fill="url(#wgIconGradC)" stroke="url(#wgIconGradC)" strokeWidth="0.375" strokeLinecap="round" strokeLinejoin="round"/>
      <defs>
        <linearGradient id="wgIconGradA" x1="28.3864" y1="2.78745" x2="-0.682789" y2="8.38556" gradientUnits="userSpaceOnUse">
          <stop stopColor="#006EFE"/><stop offset="1" stopColor="#5326BD"/>
        </linearGradient>
        <linearGradient id="wgIconGradB" x1="10.1288" y1="1.59582" x2="0.43907" y2="3.46185" gradientUnits="userSpaceOnUse">
          <stop stopColor="#006EFE"/><stop offset="1" stopColor="#5326BD"/>
        </linearGradient>
        <linearGradient id="wgIconGradC" x1="30.1288" y1="21.5958" x2="20.4391" y2="23.4619" gradientUnits="userSpaceOnUse">
          <stop stopColor="#006EFE"/><stop offset="1" stopColor="#5326BD"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

function AIButton({ label, onClick, active, style }: { label: string; onClick: () => void; active?: boolean; style?: React.CSSProperties }) {
  // Matches the design system's "AI-outline" button (Figma node 8793:29409).
  return (
    <button
      onClick={onClick}
      className="flex items-center cursor-pointer"
      style={{
        gap: 8, height: 38, padding: '10px 20px', borderRadius: 8,
        border: active ? '1px solid #006EFE' : '1px solid #E0E5EB',
        background: active ? '#F0F6FF' : '#fff',
        transition: 'all 0.15s ease',
        ...style,
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#006EFE'; e.currentTarget.style.background = '#F7FAFF'; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = '#E0E5EB'; e.currentTarget.style.background = '#fff'; } }}
    >
      <AISparkleIcon />
      <span style={{ ...ns, fontSize: 14, fontWeight: 600, background: AI_GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  );
}

function SparkleIcon({ color = '#7C5CFC' }: { color?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6.34 6.34l2.12 2.12M15.54 15.54l2.12 2.12M6.34 17.66l2.12-2.12M15.54 8.46l2.12-2.12" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="12" r="3" fill={color}/>
    </svg>
  );
}
function GripIcon() {
  return <svg width="8" height="12" viewBox="0 0 8 12" fill="none">{[0,1,2].map(r => [0,1].map(c => <circle key={`${r}${c}`} cx={c*4+2} cy={r*4+2} r="1.3" fill="#A0AABA"/>))}</svg>;
}
function CheckMini() {
  return <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6.5l2.8 2.5 5-5" stroke="#006EFE" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function UndoIcon({ disabled }: { disabled: boolean }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={disabled ? '#C5CDD9' : '#52637A'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>;
}
function RedoIcon({ disabled }: { disabled: boolean }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={disabled ? '#C5CDD9' : '#52637A'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>;
}
function MoveIcon() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>;
}

/* ───────────────────────── Decorative graphic ───────────────────────── */

function DecorativeGraphic({ theme }: { theme: MockTheme }) {
  const light = ['#FFFFFF','#EFE6D8','#EAF0FB'].includes(theme.bg);
  return (
    <svg width="100%" height="100%" viewBox="0 0 200 140" fill="none" preserveAspectRatio="xMidYMid slice">
      <rect x="80" y="-20" width="160" height="180" rx="8" fill={light ? '#E0E5EB' : 'rgba(255,255,255,0.18)'} transform="rotate(18 80 -20)"/>
      <rect x="110" y="10" width="140" height="160" rx="8" fill={light ? '#F1F4F8' : 'rgba(255,255,255,0.08)'} transform="rotate(18 110 10)"/>
      <rect x="60" y="20" width="120" height="130" rx="8" fill={theme.accentColor} opacity="0.85" transform="rotate(18 60 20)"/>
    </svg>
  );
}

/* ───────────────────────── Draggable text block ───────────────────────── */

function DraggableBlock({ children, offset, onOffsetChange, stageRef, zoom, label, onFocus, isActive, onGuideChange, selectKey, onShiftSelect, groupDragActive, onGroupDragStart, onGroupDragMove, onGroupDragEnd }: {
  children: React.ReactNode;
  offset?: TextOffset;
  onOffsetChange: (o: TextOffset) => void;
  stageRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  label: string;
  onFocus?: () => void;
  isActive?: boolean;
  onGuideChange?: (g: { x: boolean; y: boolean }) => void;
  selectKey?: string;
  onShiftSelect?: () => void;
  groupDragActive?: boolean;
  onGroupDragStart?: () => void;
  onGroupDragMove?: (dxPx: number, dyPx: number) => void;
  onGroupDragEnd?: () => void;
}) {
  const blockRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; rect: DOMRect } | null>(null);
  const groupDragOriginRef = useRef<{ sx: number; sy: number } | null>(null);
  const [textFocused, setTextFocused] = useState(false);
  const ox = offset?.x ?? 0, oy = offset?.y ?? 0;

  const SNAP = 6; // px, screen space

  return (
    <div ref={blockRef} className="group/db relative" data-select-key={selectKey} style={{ transform: `translate(${ox}px, ${oy}px)` }}
      onFocus={() => { setTextFocused(true); onFocus?.(); }}
      onBlur={() => setTextFocused(false)}
      onMouseDownCapture={e => {
        // Shift+click toggles this block in/out of the multi-selection instead of
        // entering edit mode (which would otherwise happen automatically on focus).
        if (e.shiftKey) { e.preventDefault(); onShiftSelect?.(); }
      }}
    >

      {/* Selection outline */}
      {isActive && (
        <div style={{ position: 'absolute', inset: -5, borderRadius: 6, border: '1.5px solid #006EFE', pointerEvents: 'none', zIndex: 5 }}/>
      )}

      {/* Drag handle */}
      <div
        className="absolute flex items-center gap-1 cursor-grab select-none opacity-0 group-hover/db:opacity-100 transition-opacity"
        style={{ top: -20, left: 0, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.45)', zIndex: 20 }}
        onPointerDown={e => {
          e.preventDefault(); e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          if (groupDragActive) {
            groupDragOriginRef.current = { sx: e.clientX, sy: e.clientY };
            onGroupDragStart?.();
            return;
          }
          const rect = blockRef.current?.getBoundingClientRect();
          if (!rect) return;
          dragRef.current = { sx: e.clientX, sy: e.clientY, ox, oy, rect };
        }}
        onPointerMove={e => {
          if (groupDragActive && groupDragOriginRef.current) {
            onGroupDragMove?.(e.clientX - groupDragOriginRef.current.sx, e.clientY - groupDragOriginRef.current.sy);
            return;
          }
          if (!dragRef.current) return;
          const scale = zoom / 100;
          let dx = e.clientX - dragRef.current.sx;
          let dy = e.clientY - dragRef.current.sy;

          const stageRect = stageRef.current?.getBoundingClientRect();
          if (stageRect) {
            const { rect } = dragRef.current;
            const cx = rect.left + rect.width / 2 + dx;
            const cy = rect.top + rect.height / 2 + dy;
            const stageCx = stageRect.left + stageRect.width / 2;
            const stageCy = stageRect.top + stageRect.height / 2;
            const isX = Math.abs(cx - stageCx) <= SNAP;
            const isY = Math.abs(cy - stageCy) <= SNAP;
            if (isX) dx -= cx - stageCx;
            if (isY) dy -= cy - stageCy;
            onGuideChange?.({ x: isX, y: isY });
          }

          onOffsetChange({ x: dragRef.current.ox + dx / scale, y: dragRef.current.oy + dy / scale });
        }}
        onPointerUp={() => {
          dragRef.current = null;
          if (groupDragOriginRef.current) { groupDragOriginRef.current = null; onGroupDragEnd?.(); }
          onGuideChange?.({ x: false, y: false });
        }}
        onDoubleClick={e => { e.stopPropagation(); onOffsetChange({ x: 0, y: 0 }); }}
        title="Drag to reposition · double-click to reset to center"
      >
        <MoveIcon/>
        <span style={{ ...ns, fontSize: 9, fontWeight: 600, color: 'white' }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

/* ───────────────────────── Layout thumbnails ───────────────────────── */

function LayoutThumbSVG({ layout }: { layout: SlideLayout }) {
  const T  = (x: number, y: number, w: number, h = 7) => <rect x={x} y={y} width={w} height={h} rx="3.5" fill="#B8C4D4"/>;
  const S  = (x: number, y: number, w: number)        => <rect x={x} y={y} width={w} height={3}  rx="1.5" fill="#D4DCE8"/>;
  const L  = (x: number, y: number, w: number, op = 0.7) => <rect x={x} y={y} width={w} height={4} rx="2" fill={`rgba(190,203,218,${op})`}/>;
  const Img= (x: number, y: number, w: number, h: number) => <rect x={x} y={y} width={w} height={h} rx="5" fill="#DDE6F5"/>;
  const Blk= (x: number, y: number, w: number, h: number) => <rect x={x} y={y} width={w} height={h} rx="0" fill="#E2ECF8"/>;

  // Ascend template thumbnails: one schematic shape per slide family, reused across its 3 layout variants
  // (variant 2 gets a small dot marker, variant 3 a small bar marker, so the 3 siblings stay visually distinct)
  const figMarker = (variant: '1' | '2' | '3') =>
    variant === '2' ? <circle cx="108" cy="8" r="4" fill="#9AA8BE"/> :
    variant === '3' ? <rect x="4" y="65" width="14" height="4" rx="2" fill="#9AA8BE"/> : null;
  const figBase: Record<string, React.ReactNode> = {
    cover:        <>{S(10,14,26)}{T(10,24,70,14)}{L(10,44,60,0.5)}</>,
    section:      <>{S(10,30,26)}{T(10,40,80,14)}</>,
    bullets:      <>{T(8,8,70)}{L(8,22,60,0.6)}{L(8,30,55,0.5)}{L(8,42,60,0.6)}{L(8,50,55,0.5)}</>,
    'two-col':    <>{T(8,8,60)}{S(8,20,30)}{L(8,28,44,0.6)}{L(8,36,40,0.5)}{S(62,20,30)}{L(62,28,44,0.6)}{L(62,36,40,0.5)}</>,
    'three-col':  <>{T(8,8,60)}{S(6,20,24)}{L(6,28,30,0.6)}{S(44,20,24)}{L(44,28,30,0.6)}{S(82,20,24)}{L(82,28,26,0.6)}</>,
    'photo-text': <>{T(6,10,36)}{L(6,24,40,0.6)}{L(6,32,36,0.5)}{Img(60,6,50,61)}</>,
    'text-photo': <>{Img(6,6,50,61)}{T(63,10,36)}{L(63,24,40,0.6)}{L(63,32,36,0.5)}</>,
    'full-image': <>{Blk(0,0,116,73)}{T(8,54,60,10)}</>,
    comparison:   <>{T(8,8,60)}{S(8,20,24)}{L(8,28,44,0.55)}{L(8,36,40,0.5)}{S(62,20,24)}{L(62,28,44,0.55)}{L(62,36,40,0.5)}</>,
    grid:         <>{T(8,8,70)}{S(8,22,20)}{L(8,30,44,0.6)}{S(62,22,20)}{L(62,30,44,0.6)}{S(8,46,20)}{L(8,54,44,0.6)}{S(62,46,20)}{L(62,54,44,0.6)}</>,
    quote:        <>{T(40,8,36,20)}{L(20,38,76,0.6)}{L(30,46,56,0.5)}</>,
    closing:      <>{S(44,20,28)}{T(18,32,80,14)}{L(30,52,56,0.5)}</>,
  };
  const figThumb = (family: string, variant: '1' | '2' | '3') => <>{figBase[family]}{figMarker(variant)}</>;

  const map: Record<SlideLayout, React.ReactNode> = {
    standard:     <>{T(8,10,52)}{S(8,21,22)}{L(8,30,66)}{L(8,38,58,0.55)}{L(8,46,62,0.55)}{L(8,54,44,0.5)}</>,
    centered:     <>{T(22,16,72)}{S(44,27,28)}{L(14,36,88,0.6)}{L(24,44,68,0.5)}{L(30,52,56,0.45)}</>,
    'image-right':<>{T(7,10,44)}{S(7,21,20)}{L(7,30,44,0.65)}{L(7,38,38,0.55)}{L(7,46,42,0.55)}{L(7,54,34,0.5)}{Img(58,7,52,59)}</>,
    'image-left': <>{Img(6,7,50,59)}{T(63,10,46)}{S(63,21,20)}{L(63,30,44,0.65)}{L(63,38,38,0.55)}{L(63,46,42,0.55)}{L(63,54,34,0.5)}</>,
    'two-column': <>{T(8,8,100)}{S(8,19,34)}{L(8,29,46,0.65)}{L(8,37,42,0.55)}{L(8,45,44,0.55)}{L(8,53,36,0.5)}{L(62,29,46,0.65)}{L(62,37,42,0.55)}{L(62,45,40,0.55)}{L(62,53,44,0.5)}</>,
    'big-title':  <>{T(10,19,96,11)}{T(18,34,80,11)}{S(36,50,44)}</>,
    split:        <>{Blk(0,0,46,73)}{T(7,19,30,7)}{S(7,30,18)}{L(7,40,30,0.7)}{L(7,49,26,0.6)}{T(52,11,56)}{S(52,22,22)}{L(52,31,56,0.65)}{L(52,39,50,0.55)}{L(52,47,54,0.55)}{L(52,55,42,0.5)}</>,
    minimal:      <>{T(18,26,80,8)}{S(44,38,28)}</>,
    'fig-cover-1': figThumb('cover','1'), 'fig-cover-2': figThumb('cover','2'), 'fig-cover-3': figThumb('cover','3'),
    'fig-section-1': figThumb('section','1'), 'fig-section-2': figThumb('section','2'), 'fig-section-3': figThumb('section','3'),
    'fig-bullets-1': figThumb('bullets','1'), 'fig-bullets-2': figThumb('bullets','2'), 'fig-bullets-3': figThumb('bullets','3'),
    'fig-two-col-1': figThumb('two-col','1'), 'fig-two-col-2': figThumb('two-col','2'), 'fig-two-col-3': figThumb('two-col','3'),
    'fig-three-col-1': figThumb('three-col','1'), 'fig-three-col-2': figThumb('three-col','2'), 'fig-three-col-3': figThumb('three-col','3'),
    'fig-photo-text-1': figThumb('photo-text','1'), 'fig-photo-text-2': figThumb('photo-text','2'), 'fig-photo-text-3': figThumb('photo-text','3'),
    'fig-text-photo-1': figThumb('text-photo','1'), 'fig-text-photo-2': figThumb('text-photo','2'), 'fig-text-photo-3': figThumb('text-photo','3'),
    'fig-full-image-1': figThumb('full-image','1'), 'fig-full-image-2': figThumb('full-image','2'), 'fig-full-image-3': figThumb('full-image','3'),
    'fig-comparison-1': figThumb('comparison','1'), 'fig-comparison-2': figThumb('comparison','2'), 'fig-comparison-3': figThumb('comparison','3'),
    'fig-grid-1': figThumb('grid','1'), 'fig-grid-2': figThumb('grid','2'), 'fig-grid-3': figThumb('grid','3'),
    'fig-quote-1': figThumb('quote','1'), 'fig-quote-2': figThumb('quote','2'), 'fig-quote-3': figThumb('quote','3'),
    'fig-closing-1': figThumb('closing','1'), 'fig-closing-2': figThumb('closing','2'), 'fig-closing-3': figThumb('closing','3'),
  };
  return <svg width="116" height="73" viewBox="0 0 116 73" fill="none">{map[layout]}</svg>;
}

/* ───────────────────────── Layout switcher modal ───────────────────────── */

function LayoutSwitcherModal({ currentLayout, onSelect, onClose }: {
  currentLayout: SlideLayout; onSelect: (l: SlideLayout) => void; onClose: () => void;
}) {
  const [selected, setSelected] = useState<SlideLayout>(currentLayout);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(15,23,51,0.4)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }} transition={{ duration: 0.16 }} className="bg-white flex flex-col" style={{ width: 580, borderRadius: 16, boxShadow: '0px 20px 60px rgba(15,23,51,0.22)', overflow: 'hidden' }}>
        <div className="flex items-center justify-between" style={{ padding: '18px 20px 0' }}>
          <h2 style={{ ...ns, fontSize: 16, fontWeight: 700, color: '#15191F' }}>Layout switching</h2>
          <button onClick={onClose} className="flex items-center justify-center cursor-pointer" style={{ width: 30, height: 30, borderRadius: 7, background: '#F5F7FA', border: 'none' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '16px 20px' }}>
          {LAYOUTS.map(l => {
            const isSel = l.id === selected, isCurrent = l.id === currentLayout;
            return (
              <button key={l.id} onClick={() => setSelected(l.id)} className="flex flex-col items-start cursor-pointer" style={{ borderRadius: 9, border: isSel ? '2px solid #006EFE' : '1.5px solid #E3E6EC', background: isSel ? '#F0F6FF' : '#F8FAFC', padding: '8px 8px 7px', gap: 5, position: 'relative' }}>
                {isCurrent && !isSel && <div className="absolute" style={{ top: 5, right: 5, width: 7, height: 7, borderRadius: '50%', background: '#006EFE' }}/>}
                {isSel && <div className="absolute flex items-center justify-center" style={{ top: 5, right: 5, width: 16, height: 16, borderRadius: '50%', background: '#006EFE' }}><CheckMini/></div>}
                <div className="w-full overflow-hidden" style={{ borderRadius: 5, background: '#fff', border: '1px solid #E8EBF2' }}><LayoutThumbSVG layout={l.id}/></div>
                <span style={{ ...ns, fontSize: 11.5, fontWeight: isSel ? 600 : 500, color: isSel ? '#006EFE' : '#52637A' }}>{l.name}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-end" style={{ padding: '10px 20px 18px', gap: 8, borderTop: '1px solid #F0F2F5' }}>
          <button onClick={onClose} className="cursor-pointer" style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#001633', height: 38, padding: '0 20px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff' }}>Cancel</button>
          <button onClick={() => { onSelect(selected); onClose(); }} className="cursor-pointer" style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', height: 38, padding: '0 20px', borderRadius: 8, border: 'none', background: '#006EFE' }}>Apply layout</button>
        </div>
      </motion.div>
    </div>
  );
}

/* ───────────────────────── Floating photo on slide ───────────────────────── */

type SlidePhotoData = NonNullable<import('@/stores/presentationFlowStore').PresentationSlide['slidePhotos']>[number];

// Selection keys shared by the multi-select system (photos + text blocks).
const photoKey = (id: string) => `photo:${id}`;
const TEXT_TITLE_KEY = 'text:title';
const TEXT_CONTENT_KEY = 'text:content';
const textKey = (block: 'title' | 'content') => block === 'title' ? TEXT_TITLE_KEY : TEXT_CONTENT_KEY;

function PhotoLayer({ photo, editable, selected, onSelectedChange, onPhotoChange, onGuideChange }: {
  photo: SlidePhotoData;
  editable: boolean;
  selected: boolean;
  onSelectedChange: (v: boolean, shiftKey?: boolean) => void;
  onPhotoChange: (p: SlidePhotoData) => void;
  onGuideChange?: (g: { x: boolean; y: boolean }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isIcon = !!photo.iconId;

  // Deselect on outside click — the format bar now floats at the top of the canvas
  // (outside this element's own DOM subtree), so clicks inside it must not count as "outside".
  useEffect(() => {
    if (!selected) return;
    const h = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (containerRef.current?.contains(target)) return;
      if (target.closest?.('[data-photo-format-bar]')) return;
      // Clicking a *different* selectable element (another photo, or a text block) is owned
      // by that element's own click/shift-click handler — it must not also trigger a
      // competing "clear everything" from this instance's outside-click listener.
      if (target.closest?.('[data-select-key]')) return;
      onSelectedChange(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [selected, onSelectedChange]);

  const startDrag = (e: React.PointerEvent) => {
    if (!editable) return;
    e.preventDefault(); e.stopPropagation();
    if (e.shiftKey) { onSelectedChange(true, true); return; }
    onSelectedChange(true);
    const parent = containerRef.current?.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const ox = e.clientX, oy = e.clientY, sx = photo.x, sy = photo.y;
    const SNAP = 0.8; // percent
    const onMove = (ev: PointerEvent) => {
      let x = Math.max(0, Math.min(95 - photo.w, sx + (ev.clientX - ox) / rect.width * 100));
      let y = Math.max(0, Math.min(95 - photo.h, sy + (ev.clientY - oy) / rect.height * 100));
      const isX = Math.abs((x + photo.w / 2) - 50) <= SNAP;
      const isY = Math.abs((y + photo.h / 2) - 50) <= SNAP;
      if (isX) x = 50 - photo.w / 2;
      if (isY) y = 50 - photo.h / 2;
      onGuideChange?.({ x: isX, y: isY });
      onPhotoChange({ ...photo, x, y });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      onGuideChange?.({ x: false, y: false });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const parent = containerRef.current?.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const ox = e.clientX, oy = e.clientY, sw = photo.w, sh = photo.h;
    const onMove = (ev: PointerEvent) => {
      onPhotoChange({ ...photo, w: Math.max(10, Math.min(95, sw + (ev.clientX - ox) / rect.width * 100)), h: Math.max(10, Math.min(95, sh + (ev.clientY - oy) / rect.height * 100)) });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={containerRef}
      data-select-key={photoKey(photo.id)}
      style={{ position: 'absolute', left: `${photo.x}%`, top: `${photo.y}%`, width: `${photo.w}%`, height: `${photo.h}%`, zIndex: 10, borderRadius: 4, overflow: 'visible', userSelect: 'none' }}
      onPointerDown={startDrag}
      onClick={e => e.stopPropagation()}
    >
      <img src={photo.url} style={{ width: '100%', height: '100%', objectFit: isIcon ? 'contain' : 'cover', display: 'block', borderRadius: 4, cursor: editable ? 'move' : 'default', outline: selected && editable ? '2.5px solid #006EFE' : 'none', outlineOffset: 2, pointerEvents: 'none' }}/>

      {/* Resize handle */}
      {selected && editable && (
        <div onPointerDown={startResize} style={{ position: 'absolute', bottom: -4, right: -4, width: 12, height: 12, borderRadius: 3, background: '#006EFE', border: '2px solid #fff', cursor: 'se-resize', zIndex: 12 }}/>
      )}
    </div>
  );
}

/* ───────────────────────── Image zone ───────────────────────── */

function ImageZone({ imageUrl, editable, onImageClick }: { imageUrl?: string; editable?: boolean; onImageClick?: () => void }) {
  if (imageUrl) {
    return <img src={imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />;
  }
  if (!editable) {
    return <div style={{ width: '100%', height: '100%', background: '#F0F2F5' }} />;
  }
  return (
    <div onClick={onImageClick} style={{ width: '100%', height: '100%', background: '#F4F5F7', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.background = '#EDEEF1'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#F4F5F7'; }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8E99AB" strokeWidth="1.4" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="#8E99AB" stroke="none"/><polyline points="21 15 16 10 5 21"/></svg>
      <span style={{ fontFamily: "'Nunito Sans',sans-serif", fontSize: 12, color: '#8E99AB', fontWeight: 500 }}>Click to add image</span>
    </div>
  );
}

/* ───────────────────────── Slide content ───────────────────────── */

interface DragProps {
  stageRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  titleOffset?: TextOffset;
  contentOffset?: TextOffset;
  onTitleOffsetChange: (o: TextOffset) => void;
  onContentOffsetChange: (o: TextOffset) => void;
  onBlockFocus: (block: 'title' | 'content') => void;
  focusedBlock: 'title' | 'content' | null;
  onGuideChange: (g: { x: boolean; y: boolean }) => void;
  isSelected: (block: 'title' | 'content') => boolean;
  onShiftSelect: (block: 'title' | 'content') => void;
  groupDragActive: (block: 'title' | 'content') => boolean;
  onGroupDragStart: () => void;
  onGroupDragMove: (dxPx: number, dyPx: number) => void;
  onGroupDragEnd: () => void;
}

function SlideContent({ slide, theme, editable, onTitleChange, onPointChange, onPointDelete, dragProps, onImageClick, onAiRewriteTitle, onAiRewritePoint, aiRewritingTitle = false, aiRewritingPointIndex = null }: {
  slide: PresentationSlide; theme: MockTheme; editable: boolean;
  onTitleChange?: (v: string) => void; onPointChange?: (i: number, v: string) => void;
  onPointDelete?: (i: number) => void;
  dragProps?: DragProps; onImageClick?: () => void;
  onAiRewriteTitle?: () => void; onAiRewritePoint?: (i: number) => void;
  aiRewritingTitle?: boolean; aiRewritingPointIndex?: number | null;
}) {
  const layout: SlideLayout = slide.layout ?? (slide.type === 'headline' ? 'centered' : 'standard');

  const ep = (fn: (v: string) => void) =>
    editable ? { contentEditable: true as const, suppressContentEditableWarning: true as const, onBlur: (e: React.FocusEvent<HTMLElement>) => fn(e.currentTarget.textContent || '') } : {};

  const textColor = slide.textColorOverride ?? theme.titleColor;

  const titleFamily = slide.titleFontFamily ?? ns.fontFamily;
  const contentFamily = slide.contentFontFamily ?? ns.fontFamily;

  const titleTA = slide.titleTextAlign;
  const contentTA = slide.contentTextAlign;

  const ts = (defaultSize: string, w = 700): React.CSSProperties => ({
    ...ns, fontFamily: titleFamily,
    fontSize: slide.titleFontSize ? `${slide.titleFontSize}px` : defaultSize,
    fontWeight: slide.titleFontWeight ?? w, color: textColor, lineHeight: 1.15, outline: 'none',
    ...(titleTA ? { textAlign: titleTA } : {}),
    opacity: aiRewritingTitle ? 0.4 : undefined,
    transition: 'opacity 0.2s',
  });

  const contentFontSize = slide.contentFontSize ? `${slide.contentFontSize}px` : 'clamp(10px,1.3vw,14px)';
  const ps: React.CSSProperties = { ...ns, fontFamily: contentFamily, fontSize: contentFontSize, fontWeight: slide.contentFontWeight ?? 400, color: textColor, opacity: 0.85, lineHeight: 1.5, outline: 'none', flex: 1, ...(contentTA ? { textAlign: contentTA } : {}) };

  const slideListStyle = slide.listStyle ?? 'bullet';

  const rule = (w = 36) => <div style={{ width: w, height: 3, borderRadius: 2, background: theme.accentColor, flexShrink: 0 }}/>;

  const alignJustify: React.CSSProperties['justifyContent'] =
    slide.contentAlign === 'top' ? 'flex-start' :
    slide.contentAlign === 'bottom' ? 'flex-end' : 'center';

  const phStyle: React.CSSProperties = { color: 'rgba(0,0,0,0.2)', fontStyle: 'italic', pointerEvents: 'none' };
  const titlePh = editable && !slide.title;
  const contentPh = editable && slide.points.length === 0;

  const bullets = (pts: string[], off = 0) => (
    <div className="flex flex-col" style={{ gap: '2.5%' }}>
      {pts.map((pt, i) => {
        const globalIdx = off + i;
        const isRewiring = aiRewritingPointIndex === globalIdx;
        const marker = slideListStyle === 'bullet'
          ? <div style={{ width: 5, height: 5, borderRadius: '50%', background: theme.accentGradient ?? theme.accentColor, marginTop: 6, flexShrink: 0 }}/>
          : slideListStyle === 'numbered'
          ? <span style={{ fontFamily: contentFamily, fontSize: contentFontSize, fontWeight: slide.contentFontWeight ?? 600, color: theme.accentColor, flexShrink: 0, minWidth: 18, lineHeight: 1.5 }}>{globalIdx + 1}.</span>
          : null;
        return (
          <div key={i} className="group/pt flex items-start" style={{ gap: marker ? 6 : 0 }}>
            {marker}
            <p {...ep(v => onPointChange?.(globalIdx, v))} style={{ ...ps, flex: 1, opacity: isRewiring ? 0.4 : undefined, transition: 'opacity 0.2s' }}>{pt}</p>
            {editable && onAiRewritePoint && (
              <button
                onClick={e => { e.stopPropagation(); onAiRewritePoint(globalIdx); }}
                className="opacity-0 group-hover/pt:opacity-100 transition-opacity flex items-center justify-center cursor-pointer flex-shrink-0"
                style={{ width: 16, height: 16, borderRadius: 4, border: 'none', background: 'rgba(83,38,189,0.15)', marginTop: 3 }}
                title="Rewrite with AI"
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="#5326BD"><path d="M12 2L13.5 9L20 12L13.5 15L12 22L10.5 15L4 12L10.5 9Z"/></svg>
              </button>
            )}
            {editable && onPointDelete && (
              <button
                onClick={e => { e.stopPropagation(); onPointDelete(globalIdx); }}
                className="opacity-0 group-hover/pt:opacity-100 transition-opacity flex items-center justify-center cursor-pointer flex-shrink-0"
                style={{ width: 16, height: 16, borderRadius: 4, border: 'none', background: 'rgba(0,0,0,0.12)', marginTop: 3 }}
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={textColor} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  const wrapT = (children: React.ReactNode) =>
    editable && dragProps ? (
      <DraggableBlock
        offset={dragProps.titleOffset} onOffsetChange={dragProps.onTitleOffsetChange}
        stageRef={dragProps.stageRef} zoom={dragProps.zoom} label="Title"
        onFocus={() => dragProps.onBlockFocus('title')}
        isActive={dragProps.focusedBlock === 'title' || dragProps.isSelected('title')}
        onGuideChange={dragProps.onGuideChange}
        selectKey={TEXT_TITLE_KEY}
        onShiftSelect={() => dragProps.onShiftSelect('title')}
        groupDragActive={dragProps.groupDragActive('title')}
        onGroupDragStart={dragProps.onGroupDragStart}
        onGroupDragMove={dragProps.onGroupDragMove}
        onGroupDragEnd={dragProps.onGroupDragEnd}
      >{children}</DraggableBlock>
    ) : children;

  const wrapC = (children: React.ReactNode) =>
    editable && dragProps ? (
      <DraggableBlock
        offset={dragProps.contentOffset} onOffsetChange={dragProps.onContentOffsetChange}
        stageRef={dragProps.stageRef} zoom={dragProps.zoom} label="Content"
        onFocus={() => dragProps.onBlockFocus('content')}
        isActive={dragProps.focusedBlock === 'content' || dragProps.isSelected('content')}
        onGuideChange={dragProps.onGuideChange}
        selectKey={TEXT_CONTENT_KEY}
        onShiftSelect={() => dragProps.onShiftSelect('content')}
        groupDragActive={dragProps.groupDragActive('content')}
        onGroupDragStart={dragProps.onGroupDragStart}
        onGroupDragMove={dragProps.onGroupDragMove}
        onGroupDragEnd={dragProps.onGroupDragEnd}
      >{children}</DraggableBlock>
    ) : children;

  // Title wrapper with AI rewriting spinner (toolbar handles rewrite trigger now)
  const wrapTA = (children: React.ReactNode) => (
    <div className="relative">
      {wrapT(children)}
      {aiRewritingTitle && editable && (
        <div className="absolute flex items-center" style={{ top: 2, right: 2, gap: 4, height: 20, padding: '0 7px', borderRadius: 5, background: 'rgba(0,0,0,0.48)' }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-9-9"/></svg>
          </motion.div>
          <span style={{ ...ns, fontSize: 9.5, fontWeight: 700, color: '#fff' }}>Rewriting…</span>
        </div>
      )}
    </div>
  );

  // ── Ascend template — shared helpers ──
  const figTitleFont = slide.titleFontFamily ?? theme.figTitleFont ?? "'Syne', sans-serif";
  const figBodyFont = slide.contentFontFamily ?? "'Manrope', sans-serif";
  // Aurora (gradient) themes paint rules/dots/badges with the theme's accent gradient; every other
  // theme keeps painting them with the flat accentColor exactly as before.
  const figAccentPaint = theme.accentGradient ?? theme.accentColor;
  const figTitleStyle = (size: string, weight = 700): React.CSSProperties => ({
    fontFamily: figTitleFont, fontSize: slide.titleFontSize ? `${slide.titleFontSize}px` : size,
    fontWeight: slide.titleFontWeight ?? weight, color: textColor, lineHeight: 1.15, outline: 'none',
    ...(titleTA ? { textAlign: titleTA } : {}),
  });
  const figBodyStyle = (size = 'clamp(10px,1.3vw,13px)'): React.CSSProperties => ({
    fontFamily: figBodyFont, fontSize: slide.contentFontSize ? `${slide.contentFontSize}px` : size,
    fontWeight: slide.contentFontWeight ?? 400, color: textColor, opacity: 0.85, lineHeight: 1.55, outline: 'none',
    ...(contentTA ? { textAlign: contentTA } : {}),
  });
  /** Merges gradient-clip text properties onto a base style when the theme has an accent gradient; returns base unchanged otherwise. */
  const figGradientTextStyle = (base: React.CSSProperties): React.CSSProperties =>
    theme.accentGradient
      ? { ...base, backgroundImage: theme.accentGradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent' }
      : base;
  const figEyebrow = (text: string, align: 'left' | 'center' = 'left') => (
    theme.accentGradient ? (
      <div style={{ display: 'inline-flex', alignSelf: align === 'center' ? 'center' : 'flex-start', fontFamily: figTitleFont, fontSize: 'clamp(8px,0.95vw,11px)', fontWeight: 600, color: '#fff', letterSpacing: '0.15em', textTransform: 'uppercase', background: theme.accentGradient, padding: '7px 16px', borderRadius: 100 }}>{text}</div>
    ) : (
      <p style={{ fontFamily: figTitleFont, fontSize: 'clamp(8px,0.95vw,11px)', fontWeight: 600, color: theme.accentColor, letterSpacing: '0.15em', textTransform: 'uppercase', textAlign: align, margin: 0 }}>{text}</p>
    )
  );
  const figRule = (w = 40, h = 3, style: React.CSSProperties = {}) => <div style={{ width: w, height: h, borderRadius: h / 2, background: figAccentPaint, flexShrink: 0, ...style }}/>;
  /** Blurred decorative gradient blob, used behind Aurora-style fig- slides only. */
  const figGlowBlob = (style: React.CSSProperties) => (
    <div style={{ position: 'absolute', borderRadius: '50%', background: theme.accentGradient, filter: 'blur(70px)', pointerEvents: 'none', ...style }}/>
  );
  /** FigCard style override for Aurora — a translucent glass panel instead of the default solid-white card. */
  const figPanelStyle: React.CSSProperties | undefined = theme.accentGradient
    ? { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: 'none' }
    : undefined;
  const figGhostNum = (n: number, size = 'clamp(30px,4.5vw,48px)', mode: 'ghost' | 'badge' = 'ghost') => (
    theme.accentGradient && mode === 'badge' ? (
      <div style={{ width: size, height: size, borderRadius: '50%', background: theme.accentGradient, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: figTitleFont, fontWeight: 700, fontSize: 'clamp(11px,1.5vw,16px)', color: '#fff', lineHeight: 1 }}>{String(n).padStart(2, '0')}</span>
      </div>
    ) : (
      <span style={{ fontFamily: figTitleFont, fontWeight: 800, fontSize: size, color: withAlpha(theme.accentColor, 0.18), lineHeight: 1, flexShrink: 0 }}>{String(n).padStart(2, '0')}</span>
    )
  );
  const splitItem = (s: string): { heading: string; body: string } => {
    const idx = s.indexOf('\n');
    return idx === -1 ? { heading: s, body: '' } : { heading: s.slice(0, idx), body: s.slice(idx + 1) };
  };
  /** One heading+description unit shared by Headline+Bullets / Two-Three Columns / 2x2 Grid */
  const figItem = (pt: string, i: number, opts: { ghost?: boolean; ruleAbove?: boolean } = {}) => {
    const { heading, body } = splitItem(pt);
    const isRewiring = aiRewritingPointIndex === i;
    return (
      <div key={i} className="group/pt flex flex-col" style={{ gap: 6, opacity: isRewiring ? 0.4 : undefined, transition: 'opacity 0.2s' }}>
        {opts.ghost ? figGhostNum(i + 1, 'clamp(22px,3.2vw,34px)', 'badge') : opts.ruleAbove !== false ? figRule(24, 3, { marginBottom: 2 }) : null}
        <div className="group/pt flex items-start" style={{ gap: 6 }}>
          <p {...ep(v => onPointChange?.(i, `${v}\n${body}`))} style={{ ...figTitleStyle('clamp(13px,1.7vw,17px)', 700), flex: 1 }}>{heading}</p>
          {editable && onPointDelete && (
            <button onClick={e => { e.stopPropagation(); onPointDelete(i); }} className="opacity-0 group-hover/pt:opacity-100 transition-opacity flex items-center justify-center cursor-pointer flex-shrink-0"
              style={{ width: 16, height: 16, borderRadius: 4, border: 'none', background: 'rgba(0,0,0,0.12)', marginTop: 3 }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={textColor} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
        <p {...ep(v => onPointChange?.(i, `${heading}\n${v}`))} style={figBodyStyle()}>{body}</p>
      </div>
    );
  };

  if (layout === 'centered') return (
    <div className="w-full h-full flex flex-col items-center text-center" style={{ padding: '8% 10%', justifyContent: alignJustify }}>
      {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={{ textAlign: 'center', ...ts('clamp(22px,4vw,40px)') }}>{slide.title}</h2>)}
      <div style={{ width: 48, height: 4, borderRadius: 2, background: theme.accentColor, margin: '14px auto' }}/>
      {slide.type !== 'headline' && wrapC(<div className="flex flex-col" style={{ gap: 4 }}>{slide.points.map((pt, i) => <p key={i} {...ep(v => onPointChange?.(i, v))} style={{ textAlign: 'center', ...ps, marginTop: 4 }}>{pt}</p>)}</div>)}
    </div>
  );

  if (layout === 'image-right') return (
    <div className="w-full h-full flex">
      <div className="flex flex-col" style={{ flex: '0 0 55%', padding: '7% 5% 7% 7%', justifyContent: alignJustify }}>
        {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={ts('clamp(15px,2.2vw,24px)')}>{slide.title}</h2>)}
        <div style={{ margin: '4% 0 5%' }}>{rule()}</div>
        {wrapC(bullets(slide.points))}
      </div>
      <div className="flex-1 overflow-hidden" style={{ flex: '0 0 45%' }}>
        <ImageZone imageUrl={slide.imageUrl} editable={editable} onImageClick={onImageClick}/>
      </div>
    </div>
  );

  if (layout === 'image-left') return (
    <div className="w-full h-full flex">
      <div className="overflow-hidden flex-shrink-0" style={{ width: '45%' }}>
        <ImageZone imageUrl={slide.imageUrl} editable={editable} onImageClick={onImageClick}/>
      </div>
      <div className="flex flex-col" style={{ flex: 1, padding: '7% 7% 7% 5%', justifyContent: alignJustify }}>
        {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={ts('clamp(15px,2.2vw,24px)')}>{slide.title}</h2>)}
        <div style={{ margin: '4% 0 5%' }}>{rule()}</div>
        {wrapC(bullets(slide.points))}
      </div>
    </div>
  );

  if (layout === 'two-column') {
    const half = Math.ceil(slide.points.length / 2);
    return (
      <div className="w-full h-full flex flex-col" style={{ padding: '6% 7%', justifyContent: alignJustify }}>
        {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={ts('clamp(15px,2.2vw,24px)')}>{slide.title}</h2>)}
        <div style={{ margin: '3% 0 4%' }}>{rule()}</div>
        {wrapC(
          <div className="flex flex-1 min-h-0" style={{ gap: '4%' }}>
            <div className="flex-1">{bullets(slide.points.slice(0, half), 0)}</div>
            {slide.points.length > half && <div className="flex-1">{bullets(slide.points.slice(half), half)}</div>}
          </div>
        )}
      </div>
    );
  }

  if (layout === 'big-title') return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center" style={{ padding: '10% 12%' }}>
      {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={{ textAlign: 'center', ...ts('clamp(28px,5.5vw,56px)') }}>{slide.title}</h2>)}
      {slide.type !== 'headline' && slide.points[0] && wrapC(<p {...ep(v => onPointChange?.(0, v))} style={{ textAlign: 'center', ...ps, marginTop: '5%', fontSize: slide.contentFontSize ? `${slide.contentFontSize}px` : 'clamp(12px,1.8vw,18px)', opacity: 0.6 }}>{slide.points[0]}</p>)}
    </div>
  );

  if (layout === 'split') return (
    <div className="w-full h-full flex">
      <div className="flex flex-col justify-center flex-shrink-0" style={{ width: slide.type === 'headline' ? '100%' : '38%', background: theme.accentColor, padding: '8% 6%' }}>
        {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={{ ...ts('clamp(13px,2vw,22px)'), color: '#fff', lineHeight: 1.25 }}>{slide.title}</h2>)}
        <div style={{ width: 28, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.5)', marginTop: '8%' }}/>
      </div>
      {slide.type !== 'headline' && <div className="flex flex-col justify-center flex-1" style={{ padding: '7% 7% 7% 6%' }}>{wrapC(bullets(slide.points))}</div>}
    </div>
  );

  if (layout === 'minimal') return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center" style={{ padding: '12% 16%' }}>
      {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={{ textAlign: 'center', ...ts('clamp(18px,3vw,32px)', 600) }}>{slide.title}</h2>)}
      <div style={{ width: 32, height: 2, borderRadius: 2, background: theme.accentColor, margin: '6% auto' }}/>
      {slide.type !== 'headline' && slide.points[0] && wrapC(<p {...ep(v => onPointChange?.(0, v))} style={{ textAlign: 'center', ...ps, opacity: 0.55 }}>{slide.points[0]}</p>)}
    </div>
  );

  // ── Ascend template: Cover ──
  if (layout === 'fig-cover-1' || layout === 'fig-cover-2' || layout === 'fig-cover-3') {
    const v = layout.slice(-1);
    const centered = v === '3';
    const circles = theme.accentGradient ? (
      v === '1' ? (
        <>
          {figGlowBlob({ top: -220, right: -160, width: 560, height: 560, opacity: 0.28 })}
          {figGlowBlob({ bottom: -180, left: -120, width: 380, height: 380, opacity: 0.24 })}
        </>
      ) : v === '2' ? (
        <>
          {figGlowBlob({ top: -260, right: -180, width: 620, height: 620, opacity: 0.35 })}
          {figGlowBlob({ bottom: -200, left: -140, width: 420, height: 420, opacity: 0.3 })}
        </>
      ) : (
        <>
          {figGlowBlob({ top: '-10%', right: '-8%', width: 500, height: 500, opacity: 0.3 })}
          {figGlowBlob({ bottom: '-8%', left: '-6%', width: 340, height: 340, opacity: 0.26 })}
        </>
      )
    ) : v === '1' ? (
      <div style={{ position: 'absolute', top: -60, right: -60, width: 220, height: 220, borderRadius: '50%', background: withAlpha(theme.accentColor, 0.12) }}/>
    ) : v === '2' ? (
      <>
        <div style={{ position: 'absolute', top: -60, right: -60, width: 220, height: 220, borderRadius: '50%', background: withAlpha(theme.accentColor, 0.12) }}/>
        <div style={{ position: 'absolute', bottom: -80, left: -80, width: 260, height: 260, borderRadius: '50%', background: withAlpha(theme.accentColor, 0.08) }}/>
        <div style={{ position: 'absolute', bottom: 40, left: 60, width: 90, height: 90, borderRadius: '50%', background: withAlpha(theme.accentColor, 0.14) }}/>
      </>
    ) : (
      <>
        <div style={{ position: 'absolute', top: -140, right: -140, width: 440, height: 440, borderRadius: '50%', background: withAlpha(theme.accentColor, 0.10) }}/>
        <div style={{ position: 'absolute', bottom: -100, left: -100, width: 300, height: 300, borderRadius: '50%', background: withAlpha(theme.accentColor, 0.08) }}/>
      </>
    );
    return (
      <div className="w-full h-full relative overflow-hidden">
        {circles}
        <div className="relative w-full h-full flex flex-col" style={{ padding: centered ? '8% 12%' : '10% 8% 10% 9%', justifyContent: centered ? 'center' : 'flex-end', alignItems: centered ? 'center' : 'flex-start', gap: 10 }}>
          {figEyebrow('PRESENTATION', centered ? 'center' : 'left')}
          {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={{ ...figTitleStyle('clamp(28px,5.6vw,60px)'), textAlign: centered ? 'center' : 'left', marginTop: 6 }}>{slide.title}</h2>)}
          {wrapC(
            <div className="flex flex-col" style={{ gap: 8, alignItems: centered ? 'center' : 'flex-start' }}>
              {(slide.points[0] || editable) && <p {...ep(v => onPointChange?.(0, v))} style={{ ...figBodyStyle('clamp(11px,1.7vw,18px)'), textAlign: centered ? 'center' : 'left', opacity: 0.7, maxWidth: 620 }}>{slide.points[0]}</p>}
              {slide.points[1] && <p {...ep(v => onPointChange?.(1, v))} style={{ ...figBodyStyle('clamp(9px,1.1vw,13px)'), textAlign: centered ? 'center' : 'left', opacity: 0.45 }}>{slide.points[1]}</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Ascend template: Section Divider ──
  if (layout === 'fig-section-1' || layout === 'fig-section-2' || layout === 'fig-section-3') {
    const v = layout.slice(-1);
    const centered = v === '2';
    return (
      <div className="w-full h-full relative overflow-hidden flex flex-col" style={{ padding: '10% 9%', justifyContent: 'center', alignItems: centered ? 'center' : 'flex-start', gap: 12 }}>
        {theme.accentGradient && (
          <>
            {figGlowBlob({ top: -260, right: -180, width: 620, height: 620, opacity: 0.35 })}
            {figGlowBlob({ bottom: -200, left: -140, width: 420, height: 420, opacity: 0.3 })}
          </>
        )}
        {v === '3' && <div style={{ position: 'absolute', right: '4%', top: '50%', transform: 'translateY(-50%)' }}>{figGhostNum(1, 'clamp(80px,14vw,180px)')}</div>}
        {centered && figRule(48, 3, { margin: '0 auto' })}
        {wrapC(figEyebrow(slide.points[0] || 'SECTION 01', centered ? 'center' : 'left'))}
        {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={{ ...figTitleStyle('clamp(28px,5.6vw,60px)'), textAlign: centered ? 'center' : 'left', maxWidth: v === '3' ? '62%' : undefined }}>{slide.title}</h2>)}
      </div>
    );
  }

  // ── Ascend template: Quote ──
  if (layout === 'fig-quote-1' || layout === 'fig-quote-2' || layout === 'fig-quote-3') {
    const v = layout.slice(-1);
    const centered = v !== '2';
    return (
      <div className="w-full h-full relative overflow-hidden flex flex-col" style={{ padding: '9% 11%', justifyContent: 'center', alignItems: centered ? 'center' : 'flex-start', gap: 14, textAlign: centered ? 'center' : 'left' }}>
        {theme.accentGradient && (
          <>
            {figGlowBlob({ width: 70, height: 70, opacity: 0.5, top: '10%', right: '16%' })}
            {figGlowBlob({ width: 26, height: 26, opacity: 0.6, bottom: '14%', right: '26%' })}
          </>
        )}
        {v === '1' && <span style={figGradientTextStyle({ position: 'absolute', top: '4%', left: centered ? '8%' : '9%', fontFamily: figTitleFont, fontWeight: 800, fontSize: 'clamp(80px,14vw,180px)', color: withAlpha(theme.accentColor, 0.10), lineHeight: 1 })}>&ldquo;</span>}
        {v === '3' && figRule(48, 3, { margin: centered ? '0 auto' : undefined })}
        {figEyebrow('QUOTE', centered ? 'center' : 'left')}
        {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={{ ...figTitleStyle('clamp(20px,3.6vw,40px)'), textAlign: centered ? 'center' : 'left', maxWidth: 900 }}>{slide.title}</h2>)}
        {v === '3' && figRule(48, 3, { margin: centered ? '0 auto' : undefined })}
        {wrapC(<p {...ep(v => onPointChange?.(0, v))} style={{ ...figBodyStyle('clamp(11px,1.6vw,16px)'), textAlign: centered ? 'center' : 'left', opacity: 0.55 }}>{slide.points[0]}</p>)}
      </div>
    );
  }

  // ── Ascend template: Closing ──
  if (layout === 'fig-closing-1' || layout === 'fig-closing-2' || layout === 'fig-closing-3') {
    const v = layout.slice(-1);
    const align: 'left' | 'center' = v === '2' ? 'left' : 'center';
    return (
      <div className="w-full h-full relative overflow-hidden flex flex-col" style={{ padding: '9% 11%', justifyContent: 'center', alignItems: align === 'center' ? 'center' : (v === '3' ? 'flex-end' : 'flex-start'), gap: 12, textAlign: align === 'center' ? 'center' : (v === '3' ? 'right' : 'left') }}>
        {theme.accentGradient && figGlowBlob({ bottom: -200, right: -140, width: 460, height: 460, opacity: 0.24 })}
        {figEyebrow('THANK YOU', align === 'center' ? 'center' : (v === '3' ? 'left' : 'left'))}
        {figRule(48, 3, { margin: align === 'center' ? '0 auto' : undefined })}
        {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={{ ...figTitleStyle('clamp(28px,5.6vw,60px)'), textAlign: align === 'center' ? 'center' : (v === '3' ? 'right' : 'left') }}>{slide.title}</h2>)}
        {wrapC(<p {...ep(v => onPointChange?.(0, v))} style={{ ...figBodyStyle('clamp(11px,1.5vw,15px)'), textAlign: align === 'center' ? 'center' : (v === '3' ? 'right' : 'left'), opacity: 0.55 }}>{slide.points[0]}</p>)}
      </div>
    );
  }

  // ── Ascend template: Headline + Bullets ──
  if (layout === 'fig-bullets-1' || layout === 'fig-bullets-2' || layout === 'fig-bullets-3') {
    const v = layout.slice(-1);
    if (v === '3') {
      return (
        <div className="w-full h-full flex" style={{ padding: '8% 7%', gap: '6%' }}>
          <div className="flex flex-col flex-shrink-0" style={{ width: '38%', justifyContent: 'center' }}>
            {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={figTitleStyle('clamp(20px,3.4vw,32px)')}>{slide.title}</h2>)}
          </div>
          <div className="flex-1" style={{ overflow: 'hidden' }}>
            {wrapC(<div className="flex flex-col" style={{ gap: '6%' }}>{slide.points.map((pt, i) => figItem(pt, i, { ruleAbove: true }))}</div>)}
          </div>
        </div>
      );
    }
    return (
      <div className="w-full h-full flex flex-col" style={{ padding: '7% 8%' }}>
        {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={{ ...figTitleStyle('clamp(20px,3.4vw,32px)'), marginBottom: '4%' }}>{slide.title}</h2>)}
        {wrapC(
          v === '2' ? (
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', columnGap: '6%', rowGap: '5%' }}>{slide.points.map((pt, i) => figItem(pt, i, { ghost: true }))}</div>
          ) : (
            <div className="flex flex-col" style={{ gap: '4%' }}>{slide.points.map((pt, i) => figItem(pt, i, { ruleAbove: true }))}</div>
          )
        )}
      </div>
    );
  }

  // ── Ascend template: Two Columns / Three Columns ──
  if (layout === 'fig-two-col-1' || layout === 'fig-two-col-2' || layout === 'fig-two-col-3'
    || layout === 'fig-three-col-1' || layout === 'fig-three-col-2' || layout === 'fig-three-col-3') {
    const v = layout.slice(-1);
    const stacked = v === '3';
    return (
      <div className="w-full h-full flex flex-col" style={{ padding: '7% 8%' }}>
        {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={{ ...figTitleStyle('clamp(20px,3.4vw,32px)'), marginBottom: '4%' }}>{slide.title}</h2>)}
        {wrapC(
          stacked ? (
            <div className="flex flex-col" style={{ gap: '6%' }}>{slide.points.map((pt, i) => figItem(pt, i, { ruleAbove: true }))}</div>
          ) : (
            <div className="flex" style={{ gap: '6%' }}>{slide.points.map((pt, i) => <div key={i} className="flex-1" style={{ minWidth: 0 }}>{figItem(pt, i, { ghost: v === '2' })}</div>)}</div>
          )
        )}
      </div>
    );
  }

  // ── Ascend template: Headline + 2x2 Grid ──
  if (layout === 'fig-grid-1' || layout === 'fig-grid-2' || layout === 'fig-grid-3') {
    const v = layout.slice(-1);
    if (v === '3') {
      return (
        <div className="w-full h-full flex" style={{ padding: '8% 7%', gap: '6%' }}>
          <div className="flex flex-col flex-shrink-0" style={{ width: '38%', justifyContent: 'center' }}>
            {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={figTitleStyle('clamp(20px,3.4vw,32px)')}>{slide.title}</h2>)}
          </div>
          <div className="flex-1" style={{ overflow: 'hidden' }}>
            {wrapC(<div className="grid" style={{ gridTemplateColumns: '1fr 1fr', columnGap: '6%', rowGap: '6%' }}>{slide.points.map((pt, i) => figItem(pt, i, { ruleAbove: true }))}</div>)}
          </div>
        </div>
      );
    }
    return (
      <div className="w-full h-full flex flex-col" style={{ padding: '7% 8%' }}>
        {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={{ ...figTitleStyle('clamp(20px,3.4vw,32px)'), marginBottom: '4%' }}>{slide.title}</h2>)}
        {wrapC(<div className="grid" style={{ gridTemplateColumns: '1fr 1fr', columnGap: '6%', rowGap: '5%' }}>{slide.points.map((pt, i) => figItem(pt, i, { ghost: v === '2' }))}</div>)}
      </div>
    );
  }

  // ── Ascend template: Photo + Text (image on the right) ──
  if (layout === 'fig-photo-text-1' || layout === 'fig-photo-text-2' || layout === 'fig-photo-text-3') {
    const v = layout.slice(-1);
    const textBlock = (
      <div className="flex flex-col" style={{ gap: 10, justifyContent: 'center' }}>
        {figEyebrow('PRESENTATION')}
        {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={figTitleStyle('clamp(22px,4vw,42px)')}>{slide.title}</h2>)}
        {wrapC(<p {...ep(v => onPointChange?.(0, v))} style={{ ...figBodyStyle('clamp(11px,1.5vw,15px)'), opacity: 0.75 }}>{slide.points[0]}</p>)}
      </div>
    );
    if (v === '2') return (
      <div className="w-full h-full flex flex-col">
        <div style={{ flex: '0 0 47%' }}><ImageZone imageUrl={slide.imageUrl} editable={editable} onImageClick={onImageClick}/></div>
        <div className="flex-1" style={{ padding: '5% 8%' }}>{textBlock}</div>
      </div>
    );
    if (v === '3') return (
      <div className="w-full h-full flex" style={{ padding: '4%', gap: '5%' }}>
        <div className="flex-1" style={{ padding: '4% 0' }}>{textBlock}</div>
        <div className="flex-shrink-0 overflow-hidden" style={{ width: '42%', borderRadius: 14 }}><ImageZone imageUrl={slide.imageUrl} editable={editable} onImageClick={onImageClick}/></div>
      </div>
    );
    return (
      <div className="w-full h-full flex">
        <div className="flex-1" style={{ padding: '6% 5% 6% 7%' }}>{textBlock}</div>
        <div className="flex-shrink-0 overflow-hidden" style={{ width: '48%' }}><ImageZone imageUrl={slide.imageUrl} editable={editable} onImageClick={onImageClick}/></div>
      </div>
    );
  }

  // ── Ascend template: Text + Photo (image on the left) ──
  if (layout === 'fig-text-photo-1' || layout === 'fig-text-photo-2' || layout === 'fig-text-photo-3') {
    const v = layout.slice(-1);
    const textBlock = (
      <div className="flex flex-col" style={{ gap: 10, justifyContent: 'center' }}>
        {figEyebrow('PRESENTATION')}
        {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={figTitleStyle('clamp(22px,4vw,42px)')}>{slide.title}</h2>)}
        {wrapC(<p {...ep(v => onPointChange?.(0, v))} style={{ ...figBodyStyle('clamp(11px,1.5vw,15px)'), opacity: 0.75 }}>{slide.points[0]}</p>)}
      </div>
    );
    if (v === '2') return (
      <div className="w-full h-full flex flex-col">
        <div className="flex-1" style={{ padding: '5% 8%' }}>{textBlock}</div>
        <div style={{ flex: '0 0 47%' }}><ImageZone imageUrl={slide.imageUrl} editable={editable} onImageClick={onImageClick}/></div>
      </div>
    );
    if (v === '3') return (
      <div className="w-full h-full flex" style={{ padding: '4%', gap: '5%' }}>
        <div className="flex-shrink-0 overflow-hidden" style={{ width: '42%', borderRadius: 14 }}><ImageZone imageUrl={slide.imageUrl} editable={editable} onImageClick={onImageClick}/></div>
        <div className="flex-1" style={{ padding: '4% 0' }}>{textBlock}</div>
      </div>
    );
    return (
      <div className="w-full h-full flex">
        <div className="flex-shrink-0 overflow-hidden" style={{ width: '48%' }}><ImageZone imageUrl={slide.imageUrl} editable={editable} onImageClick={onImageClick}/></div>
        <div className="flex-1" style={{ padding: '6% 7% 6% 5%' }}>{textBlock}</div>
      </div>
    );
  }

  // ── Ascend template: Full Image (bgImageUrl/bgColor already painted by the caller) ──
  if (layout === 'fig-full-image-1' || layout === 'fig-full-image-2' || layout === 'fig-full-image-3') {
    const v = layout.slice(-1);
    const justify = v === '1' ? 'flex-end' : v === '2' ? 'flex-start' : 'center';
    const scrim = v === '1'
      ? 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0) 55%)'
      : v === '2'
      ? 'linear-gradient(to bottom, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0) 55%)'
      : 'rgba(0,0,0,0.35)';
    return (
      <div className="w-full h-full relative flex flex-col" style={{ padding: '8% 8%', justifyContent: justify }}>
        <div className="absolute inset-0" style={{ background: scrim, pointerEvents: 'none' }}/>
        <div className="relative flex flex-col" style={{ gap: 12 }}>
          {theme.accentGradient && figEyebrow('FEATURE')}
          {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={{ ...figTitleStyle('clamp(26px,5vw,52px)'), color: '#fff' }}>{slide.title}</h2>)}
        </div>
      </div>
    );
  }

  // ── Ascend template: Comparison ──
  if (layout === 'fig-comparison-1' || layout === 'fig-comparison-2' || layout === 'fig-comparison-3') {
    const v = layout.slice(-1);
    const splitAt = slide.points.indexOf('---');
    const leftPts = splitAt === -1 ? slide.points : slide.points.slice(0, splitAt);
    const rightPts = splitAt === -1 ? [] : slide.points.slice(splitAt + 1);
    const [leftHeading, ...leftBullets] = leftPts;
    const [rightHeading, ...rightBullets] = rightPts;
    const dotList = (bullets: string[], offset: number) => (
      <div className="flex flex-col" style={{ gap: '6%' }}>
        {bullets.map((b, i) => (
          <div key={i} className="group/pt flex items-start" style={{ gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: figAccentPaint, marginTop: 7, flexShrink: 0 }}/>
            <p {...ep(v => onPointChange?.(offset + i, v))} style={{ ...figBodyStyle('clamp(10px,1.4vw,14px)'), flex: 1 }}>{b}</p>
          </div>
        ))}
      </div>
    );
    const card = (heading: string, bullets: string[], offset: number, gradientHeading = false) => (
      <div className="flex flex-col" style={{ gap: 14 }}>
        <h3 style={gradientHeading ? figGradientTextStyle(figTitleStyle('clamp(14px,2vw,20px)')) : figTitleStyle('clamp(14px,2vw,20px)')}>{heading}</h3>
        {dotList(bullets, offset)}
      </div>
    );
    const panels = v === '1' ? (
      <div className="flex flex-1 min-h-0" style={{ gap: '6%' }}>
        <div className="flex-1">{card(leftHeading, leftBullets, 1)}</div>
        <div className="flex-1">{card(rightHeading, rightBullets, splitAt + 2, true)}</div>
      </div>
    ) : v === '2' ? (
      <div className="flex flex-1 min-h-0" style={{ gap: '4%' }}>
        <FigCard style={{ flex: 1, padding: '5% 6%', ...figPanelStyle }}>{card(leftHeading, leftBullets, 1)}</FigCard>
        <FigCard style={{ flex: 1, padding: '5% 6%', ...figPanelStyle }}>{card(rightHeading, rightBullets, splitAt + 2, true)}</FigCard>
      </div>
    ) : (
      <div className="flex flex-col flex-1 min-h-0" style={{ gap: '4%' }}>
        <FigCard style={{ padding: '4% 5%', ...figPanelStyle }}>{card(leftHeading, leftBullets, 1)}</FigCard>
        <FigCard style={{ padding: '4% 5%', ...figPanelStyle }}>{card(rightHeading, rightBullets, splitAt + 2, true)}</FigCard>
      </div>
    );
    return (
      <div className="w-full h-full flex flex-col" style={{ padding: '7% 8%' }}>
        {wrapTA(<h2 {...ep(v => onTitleChange?.(v))} style={{ ...figTitleStyle('clamp(20px,3.4vw,32px)'), marginBottom: '4%' }}>{slide.title}</h2>)}
        {wrapC(panels)}
      </div>
    );
  }

  // standard
  return (
    <div className="w-full h-full flex flex-col" style={{ padding: '7% 8%', justifyContent: alignJustify }}>
      {wrapTA(
        <h2 {...ep(v => onTitleChange?.(v))} style={ts('clamp(16px,2.6vw,26px)')}>
          {titlePh ? <span style={phStyle}>Add a title…</span> : slide.title}
        </h2>
      )}
      {!titlePh && <div style={{ margin: '4% 0 5%' }}>{rule()}</div>}
      {contentPh
        ? wrapC(<p style={{ ...ps, ...phStyle }}>Start typing, or use Generate content below</p>)
        : wrapC(bullets(slide.points))
      }
    </div>
  );
}

/* ───────────────────────── Filmstrip thumbnail ───────────────────────── */

function SlideThumbnail({ slide, theme, rounded = true }: { slide: PresentationSlide; theme: MockTheme; rounded?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(176 / SLIDE_VIRTUAL_W);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / SLIDE_VIRTUAL_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={`relative w-full overflow-hidden${rounded ? ' rounded-[5px]' : ''}`} style={{ aspectRatio: '16/9', background: slide.bgImageUrl ? `url(${slide.bgImageUrl}) center/cover` : (slide.bgColor ?? theme.bg) }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: SLIDE_VIRTUAL_W, height: SLIDE_VIRTUAL_W * 9 / 16, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
        <SlideContent slide={slide} theme={theme} editable={false}/>
      </div>
    </div>
  );
}

/* ───────────────────────── Filmstrip item ───────────────────────── */

function FilmstripItem({ slide, theme, index, isActive, isBlank, loading, onClick, onGenerate, onDuplicate, onRemove, onAddAfter, onAddWithAI }: {
  slide: PresentationSlide; theme: MockTheme; index: number; isActive: boolean; isBlank: boolean; loading?: boolean;
  onClick: () => void; onGenerate: () => void; onDuplicate: () => void; onRemove: () => void; onAddAfter: () => void; onAddWithAI: () => void;
}) {
  const dragControls = useDragControls();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  const mi = (label: string, icon: React.ReactNode, fn: () => void, danger = false) => (
    <button onClick={fn} className="flex items-center w-full cursor-pointer" style={{ gap: 8, padding: '7px 10px', borderRadius: 6, border: 'none', background: 'none', ...ns, fontSize: 12.5, fontWeight: 500, color: danger ? '#E54B4B' : '#1F2532' }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? '#FFF5F5' : '#F5F7FA'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
      {icon}{label}
    </button>
  );

  return (
    <Reorder.Item value={slide} dragListener={false} dragControls={dragControls} as="div" className="group/fi" style={{ width: '100%' }}>
      <div onClick={onClick} className="relative cursor-pointer" style={{ borderRadius: 7, outline: isActive ? '2.5px solid #006EFE' : '1.5px solid transparent', outlineOffset: 1 }}>
        {loading ? (
          <div className="relative w-full overflow-hidden rounded-[5px]" style={{ aspectRatio: '16/9', background: '#F4F5F7' }}>
            <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: 7, padding: '0 14%' }}>
              <div className="w-full animate-pulse" style={{ height: 8, borderRadius: 4, background: '#E0E3E9' }}/>
              <div className="animate-pulse" style={{ height: 6, width: '72%', borderRadius: 4, background: '#EAECEF' }}/>
              <div className="animate-pulse" style={{ height: 6, width: '55%', borderRadius: 4, background: '#EAECEF' }}/>
            </div>
          </div>
        ) : (
          <SlideThumbnail slide={slide} theme={theme}/>
        )}
        {/* Slide number — bottom left inside thumbnail */}
        <div className="absolute flex items-center justify-center" style={{ bottom: 4, left: 5, minWidth: 16, height: 16, borderRadius: 4, background: 'rgba(15,23,51,0.45)', padding: '0 4px' }}>
          <span style={{ ...ns, fontSize: 9, fontWeight: 700, color: '#fff' }}>{index + 1}</span>
        </div>
        {/* Drag grip — top left */}
        <div onPointerDown={e => { e.preventDefault(); e.stopPropagation(); dragControls.start(e); }} onClick={e => e.stopPropagation()} className="absolute flex items-center justify-center opacity-0 group-hover/fi:opacity-100 transition-opacity cursor-grab" style={{ top: 4, left: 4, width: 18, height: 18, borderRadius: 4, background: 'rgba(15,23,51,0.55)', boxShadow: '0px 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)', touchAction: 'none' }}>
          <GripIcon/>
        </div>
        {/* ⋯ menu — top right */}
        <div ref={menuRef} className="absolute" style={{ top: 4, right: 4 }} onClick={e => e.stopPropagation()}>
          <button onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }} className="flex items-center justify-center cursor-pointer opacity-0 group-hover/fi:opacity-100 transition-opacity" style={{ width: 20, height: 20, borderRadius: 4, background: menuOpen ? 'rgba(15,23,51,0.7)' : 'rgba(15,23,51,0.55)', boxShadow: '0px 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)', border: 'none' }}>
            <DotsIcon/>
          </button>
          {menuOpen && (
            <div className="absolute bg-white" style={{ top: 'calc(100% + 4px)', right: 0, width: 182, borderRadius: 9, border: '1px solid #E8EBF2', boxShadow: '0px 8px 24px rgba(15,23,51,0.14)', padding: 4, zIndex: 40 }}>
              {mi(isBlank ? 'Generate content' : 'Regenerate content', <AISparkleIcon size={13}/>, () => { onGenerate(); setMenuOpen(false); })}
              {mi('Duplicate', <DuplicateIcon/>, () => { onDuplicate(); setMenuOpen(false); })}
              <div style={{ borderTop: '1px solid #F0F2F5', margin: '3px 0' }}/>
              {mi('Delete', <TrashIcon/>, () => { onRemove(); setMenuOpen(false); }, true)}
            </div>
          )}
        </div>
      </div>
      <div className="group/add w-full flex items-center justify-center" style={{ height: 22, padding: '4px 0' }}>
        <div className="flex items-center opacity-0 group-hover/add:opacity-100 transition-opacity" style={{ background: '#fff', border: '1px solid #E0E5EB', borderRadius: 20, overflow: 'hidden' }}>
          <Tooltip label="Add blank slide" position="top">
            <button onClick={e => { e.stopPropagation(); onAddAfter(); }}
              style={{ width: 32, height: 26, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 1v8M1 5h8" stroke="#52637A" strokeWidth="1.4" strokeLinecap="round"/></svg>
            </button>
          </Tooltip>
          <div style={{ width: 1, height: 16, background: '#E0E5EB' }}/>
          <Tooltip label="Add slide with AI" position="top">
            <button onClick={e => { e.stopPropagation(); onAddWithAI(); }}
              style={{ width: 32, height: 26, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7C5CFC" strokeWidth="2" strokeLinecap="round"><path d="M12 2 L13.5 9 L20 12 L13.5 15 L12 22 L10.5 15 L4 12 L10.5 9 Z"/><circle cx="12" cy="12" r="2" fill="#7C5CFC" stroke="none"/></svg>
            </button>
          </Tooltip>
        </div>
      </div>
    </Reorder.Item>
  );
}

/* ───────────────────────── Media panel ───────────────────────── */

function MediaPanel({ uploadedImages, setUploadedImages, mediaFileRef, onImageSelect }: {
  activeSlide: PresentationSlide | null;
  uploadedImages: string[];
  setUploadedImages: React.Dispatch<React.SetStateAction<string[]>>;
  mediaFileRef: React.RefObject<HTMLInputElement | null>;
  onImageSelect: (url: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    setSearchResults(Array.from({ length: 9 }, (_, i) => `https://picsum.photos/seed/${encodeURIComponent(searchQuery)}${i}/240/160`));
  };

  const handleGenerate = () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    setTimeout(() => {
      setGeneratedImages(Array.from({ length: 6 }, (_, i) => `https://picsum.photos/seed/${encodeURIComponent(aiPrompt)}${i * 7}/400/280`));
      setGenerating(false);
    }, 1800);
  };

  const sec = (label: string) => (
    <p style={{ ...ns, fontSize: 10.5, fontWeight: 700, color: '#B0BBCA', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 10 }}>{label}</p>
  );

  const divider = <div style={{ borderTop: '1px solid #F0F2F5', margin: '4px 0' }}/>;

  return (
    <div className="flex flex-col" style={{ gap: 0 }}>
      {/* Upload */}
      <div style={{ paddingBottom: 20 }}>
        {sec('Upload')}
        <label style={{ border: '1.5px dashed #D4DAE3', borderRadius: 10, padding: '16px 12px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: '#FAFBFC' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#006EFE'; e.currentTarget.style.background = '#F4F8FF'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#D4DAE3'; e.currentTarget.style.background = '#FAFBFC'; }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A0AABA" strokeWidth="1.4" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="#A0AABA" stroke="none"/><polyline points="21 15 16 10 5 21"/></svg>
          <span style={{ ...ns, fontSize: 12.5, fontWeight: 500, color: '#52637A' }}>Drop a photo or <span style={{ color: '#006EFE', fontWeight: 600 }}>browse</span></span>
          <span style={{ ...ns, fontSize: 11, color: '#B0BBCA' }}>PNG · JPG · WEBP</span>
          <input ref={mediaFileRef} type="file" accept="image/*" className="hidden" onChange={e => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => { const url = ev.target?.result as string; setUploadedImages(prev => [url, ...prev]); onImageSelect(url); };
            reader.readAsDataURL(file);
          }}/>
        </label>
      </div>

      {divider}

      {/* My uploads */}
      <div style={{ paddingTop: 18, paddingBottom: 20 }}>
        {sec('My uploads')}
        {uploadedImages.length === 0 ? (
          <p style={{ ...ns, fontSize: 12, color: '#B0BBCA', fontStyle: 'italic' }}>Nothing uploaded yet.</p>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {uploadedImages.map((url, i) => (
              <button key={i} onClick={() => onImageSelect(url)} style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 6, overflow: 'hidden', aspectRatio: '1/1', background: '#F0F2F5', display: 'block', width: '100%' }}>
                <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
              </button>
            ))}
          </div>
        )}
      </div>

      {divider}

      {/* Search Unsplash */}
      <div style={{ paddingTop: 18, paddingBottom: 20 }}>
        {sec('Search Unsplash')}
        <div className="flex" style={{ gap: 6, marginBottom: searchResults.length > 0 ? 10 : 0 }}>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="mountains, office, abstract…" className="flex-1 outline-none" style={{ ...ns, fontSize: 12, color: '#1F2532', border: '1px solid #E0E5EB', borderRadius: 7, padding: '7px 10px', background: '#fff' }}/>
          <button onClick={handleSearch} className="flex items-center justify-center cursor-pointer flex-shrink-0" style={{ width: 32, height: 32, borderRadius: 7, border: 'none', background: '#006EFE' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0058CC'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
        {searchResults.length > 0 ? (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {searchResults.map((url, i) => (
              <button key={i} onClick={() => onImageSelect(url)} style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 6, overflow: 'hidden', aspectRatio: '3/2', background: '#F0F2F5', display: 'block', width: '100%' }}>
                <img src={url} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {divider}

      {/* Generate with AI */}
      <div style={{ paddingTop: 18 }}>
        {sec('Generate with AI')}
        <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Describe the image you want…" rows={3} className="resize-none outline-none w-full" style={{ ...ns, fontSize: 12, color: '#1F2532', border: '1px solid #E0E5EB', borderRadius: 8, padding: '9px 11px', background: '#fff', lineHeight: 1.6, marginBottom: 8 }}/>
        <button onClick={handleGenerate} disabled={!aiPrompt.trim() || generating} className="flex items-center justify-center cursor-pointer w-full" style={{ gap: 6, height: 32, borderRadius: 7, border: 'none', background: aiPrompt.trim() && !generating ? AI_GRADIENT : '#E0E5EB', ...ns, fontSize: 12, fontWeight: 600, color: '#fff' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2L13.5 9L20 12L13.5 15L12 22L10.5 15L4 12L10.5 9Z" fill="currentColor"/></svg>
          {generating ? 'Generating…' : 'Generate image'}
        </button>
        {generatedImages.length > 0 && (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginTop: 8 }}>
            {generatedImages.map((url, i) => (
              <button key={i} onClick={() => onImageSelect(url)} style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 6, overflow: 'hidden', aspectRatio: '4/3', background: '#F0F2F5', display: 'block', width: '100%' }}>
                <img src={url} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Artworks panel ───────────────────────── */

// Shapes reuse the exact same element (a recolorable SVG dropped onto the slide) as icons —
// the only real difference is intent: icons are small accents, shapes are often backgrounds,
// dividers, or callouts, so they default to a noticeably bigger placement size.
type ArtworkIcon = { id: string; keywords: string[]; svg: string; defaultWidthPct?: number };

const ARTWORK_SHAPES: ArtworkIcon[] = [
  { id: 'shape-rectangle', keywords: ['rectangle', 'square', 'box', 'rect'], defaultWidthPct: 30, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" fill="#15191F"/></svg>` },
  { id: 'shape-rounded-rectangle', keywords: ['rounded rectangle', 'square', 'box', 'rect'], defaultWidthPct: 30, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="4" fill="#15191F"/></svg>` },
  { id: 'shape-circle', keywords: ['circle', 'round', 'dot', 'oval'], defaultWidthPct: 24, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#15191F"/></svg>` },
  { id: 'shape-ellipse', keywords: ['ellipse', 'oval'], defaultWidthPct: 30, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="10" ry="6" fill="#15191F"/></svg>` },
  { id: 'shape-triangle', keywords: ['triangle', 'wedge'], defaultWidthPct: 26, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2 22 20 2 20z" fill="#15191F"/></svg>` },
  { id: 'shape-diamond', keywords: ['diamond', 'rhombus'], defaultWidthPct: 26, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2 22 12 12 22 2 12z" fill="#15191F"/></svg>` },
  { id: 'shape-pentagon', keywords: ['pentagon'], defaultWidthPct: 26, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2 22 9.5 18 21 6 21 2 9.5z" fill="#15191F"/></svg>` },
  { id: 'shape-hexagon', keywords: ['hexagon'], defaultWidthPct: 26, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 3 18 3 23 12 18 21 6 21 1 12z" fill="#15191F"/></svg>` },
  { id: 'shape-star', keywords: ['star', 'favorite', 'rating'], defaultWidthPct: 26, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l2.9 6.1 6.6.9-4.8 4.7 1.1 6.6-5.8-3-5.8 3 1.1-6.6-4.8-4.7 6.6-.9L12 2z" fill="#15191F"/></svg>` },
  { id: 'shape-line', keywords: ['line', 'divider', 'separator'], defaultWidthPct: 34, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="1" y="11" width="22" height="2" rx="1" fill="#15191F"/></svg>` },
  { id: 'shape-arrow-right', keywords: ['arrow', 'right', 'pointer'], defaultWidthPct: 30, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 10h14V6l8 6-8 6v-4H2z" fill="#15191F"/></svg>` },
  { id: 'shape-arrow-double', keywords: ['arrow', 'double', 'both ways'], defaultWidthPct: 34, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 12l5-5v3h10v-3l5 5-5 5v-3H7v3z" fill="#15191F"/></svg>` },
  { id: 'shape-speech-bubble', keywords: ['speech bubble', 'chat', 'callout', 'message'], defaultWidthPct: 30, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 5.5h18v11H9l-5 4v-4H3z" fill="#15191F"/></svg>` },
];

const ARTWORK_ICONS: ArtworkIcon[] = [
  // Home / house family — several variants, like a real icon library
  { id: 'house-outline', keywords: ['home', 'house', 'building', 'real estate'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10"/><path d="M9.5 20.5v-6h5v6"/></svg>` },
  { id: 'house-filled', keywords: ['home', 'house', 'building'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2.5 2 11h3v10h5v-7h4v7h5V11h3L12 2.5z" fill="#15191F"/></svg>` },
  { id: 'house-simple-outline', keywords: ['home', 'house'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 4l8 7.5"/><rect x="6" y="11" width="12" height="9" rx="0.6"/></svg>` },
  { id: 'house-door-filled', keywords: ['home', 'house', 'door'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 3 3 11h2v9h14v-9h2L12 3z" fill="#15191F"/><rect x="10" y="14" width="4" height="6" fill="#fff"/></svg>` },
  { id: 'house-compact-filled', keywords: ['home', 'house', 'cabin'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 4 4 10.5V20h16v-9.5L12 4z" fill="#15191F"/></svg>` },
  { id: 'house-tall-outline', keywords: ['home', 'house', 'window'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10 12 2l9 8"/><path d="M6 9v12h12V9"/><line x1="9" y1="21" x2="9" y2="15"/><line x1="15" y1="21" x2="15" y2="15"/><line x1="9" y1="15" x2="15" y2="15"/></svg>` },
  { id: 'house-overhang-outline', keywords: ['home', 'house', 'roof'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10.5 12 3l10 7.5"/><line x1="4" y1="10.5" x2="20" y2="10.5"/><path d="M5 10.5V21h14V10.5"/></svg>` },
  { id: 'house-heart-outline', keywords: ['home', 'house', 'favorite', 'real estate'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/><path d="M12 19c-2.7-1.8-4-3.3-4-4.9a1.9 1.9 0 0 1 3.6-.9 1.9 1.9 0 0 1 3.6.9c0 1.6-1.3 3.1-4 4.9z" fill="#15191F" stroke="none"/></svg>` },
  { id: 'roof-triangle-filled', keywords: ['home', 'roof', 'triangle', 'tent'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 4 2 14h20L12 4z" fill="#15191F"/></svg>` },
  { id: 'roof-triangle-outline', keywords: ['home', 'roof', 'triangle', 'mountain'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 2 14h20L12 4z"/></svg>` },

  // General
  { id: 'user-outline', keywords: ['user', 'person', 'profile', 'account'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>` },
  { id: 'user-filled', keywords: ['user', 'person', 'profile'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="#15191F"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" fill="#15191F"/></svg>` },
  { id: 'users-outline', keywords: ['users', 'people', 'team', 'group'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.8 3-6 6.5-6s6.5 2.2 6.5 6"/><path d="M16 8.5a2.8 2.8 0 1 1 0-5.6"/><path d="M15 14.3c2.9.4 4.5 2.3 4.5 5.7"/></svg>` },
  { id: 'heart-outline', keywords: ['heart', 'like', 'love', 'favorite'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5C6 16.7 3 13.3 3 9.6a4.6 4.6 0 0 1 8.5-2.4A4.6 4.6 0 0 1 21 9.6c0 3.7-3 7.1-9 10.9z"/></svg>` },
  { id: 'heart-filled', keywords: ['heart', 'like', 'love', 'favorite'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 20.5C6 16.7 3 13.3 3 9.6a4.6 4.6 0 0 1 8.5-2.4A4.6 4.6 0 0 1 21 9.6c0 3.7-3 7.1-9 10.9z" fill="#15191F"/></svg>` },
  { id: 'star-outline', keywords: ['star', 'favorite', 'rating'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2-4.5-4.4 6.2-.9L12 3.5z"/></svg>` },
  { id: 'star-filled', keywords: ['star', 'favorite', 'rating'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 3.5l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2-4.5-4.4 6.2-.9L12 3.5z" fill="#15191F"/></svg>` },
  { id: 'mail-outline', keywords: ['mail', 'email', 'message', 'envelope'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5 12 13l8.5-6.5"/></svg>` },
  { id: 'phone-outline', keywords: ['phone', 'call', 'telephone'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3h3l1.5 4.5-2.2 1.8a12 12 0 0 0 5.9 5.9l1.8-2.2 4.5 1.5v3a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3z"/></svg>` },
  { id: 'calendar-outline', keywords: ['calendar', 'date', 'schedule', 'event'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>` },
  { id: 'clock-outline', keywords: ['clock', 'time', 'watch'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>` },
  { id: 'check-circle-filled', keywords: ['check', 'done', 'success', 'complete'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#15191F"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
  { id: 'close-circle-outline', keywords: ['close', 'cancel', 'x', 'remove'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>` },
  { id: 'search-outline', keywords: ['search', 'find', 'magnify'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><line x1="20" y1="20" x2="15.2" y2="15.2"/></svg>` },
  { id: 'settings-gear-outline', keywords: ['settings', 'gear', 'config'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2z"/></svg>` },
  { id: 'camera-outline', keywords: ['camera', 'photo', 'picture'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>` },
  { id: 'image-outline', keywords: ['image', 'picture', 'photo'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 16l-5.5-5.5L4 20"/></svg>` },
  { id: 'video-outline', keywords: ['video', 'camera', 'film'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="M15.5 10.5 21.5 7v10l-6-3.5z"/></svg>` },
  { id: 'music-note-outline', keywords: ['music', 'note', 'audio', 'sound'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V4l11-2v14"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg>` },
  { id: 'folder-outline', keywords: ['folder', 'files', 'directory'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z"/></svg>` },
  { id: 'file-outline', keywords: ['file', 'document', 'page'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.5h9l4 4V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z"/><path d="M15 2.5V7h4"/></svg>` },
  { id: 'download-outline', keywords: ['download', 'arrow', 'save'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10.5 12 15.5 17 10.5"/><path d="M4 19.5h16"/></svg>` },
  { id: 'upload-outline', keywords: ['upload', 'arrow', 'cloud'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M7 7.5 12 2.5 17 7.5"/><path d="M4 19.5h16"/></svg>` },
  { id: 'link-outline', keywords: ['link', 'chain', 'url'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 14.5 14.5 9.5"/><path d="M11 6.5 13.3 4.2a3.5 3.5 0 1 1 5 5L15.8 11.5"/><path d="M13 17.5 10.7 19.8a3.5 3.5 0 1 1-5-5L8.2 12.5"/></svg>` },
  { id: 'lock-outline', keywords: ['lock', 'security', 'private'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="11" width="15" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>` },
  { id: 'shopping-cart-outline', keywords: ['cart', 'shopping', 'store', 'buy'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2.2l1 3M6.2 7l1.9 8h9.8l1.8-6.5H6.2"/><circle cx="9.5" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>` },
  { id: 'shopping-bag-outline', keywords: ['bag', 'shopping', 'store', 'buy'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l1 12.5H5L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>` },
  { id: 'tag-outline', keywords: ['tag', 'label', 'price'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 3.5H20v7.5L11 20l-8-8 8.5-8.5z"/><circle cx="16" cy="8" r="1.4"/></svg>` },
  { id: 'gift-outline', keywords: ['gift', 'present', 'box'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="18" height="4" rx="0.6"/><rect x="4.5" y="13" width="15" height="8" rx="0.8"/><path d="M12 9v12"/><path d="M12 9C9 9 8 7.3 8 6a2 2 0 0 1 4 0zM12 9c3 0 4-1.7 4-3a2 2 0 0 0-4 0z"/></svg>` },
  { id: 'bell-outline', keywords: ['bell', 'notification', 'alert'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 17V10a6 6 0 0 1 12 0v7l2 2H4l2-2z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>` },
  { id: 'flag-outline', keywords: ['flag', 'marker', 'milestone'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4.5h13l-3 4.5 3 4.5H5"/></svg>` },
  { id: 'map-pin-outline', keywords: ['pin', 'location', 'map', 'place'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.4 7-11.5A7 7 0 0 0 5 9.5C5 14.6 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>` },
  { id: 'globe-outline', keywords: ['globe', 'world', 'earth', 'web'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><line x1="3" y1="12" x2="21" y2="12"/></svg>` },
  { id: 'sun-outline', keywords: ['sun', 'weather', 'bright'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8"/></svg>` },
  { id: 'moon-outline', keywords: ['moon', 'night', 'dark'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/></svg>` },
  { id: 'cloud-outline', keywords: ['cloud', 'weather', 'storage'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18.5a4.5 4.5 0 0 1-.5-9 5.5 5.5 0 0 1 10.6-1.9A4.2 4.2 0 0 1 17 18.5H7z"/></svg>` },
  { id: 'thumbs-up-outline', keywords: ['thumbs up', 'like', 'approve'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11h4v10H3z"/><path d="M7 11l4-8a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1.3 7A2 2 0 0 1 16.8 21H7"/></svg>` },
  { id: 'message-outline', keywords: ['message', 'chat', 'bubble'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.5h18v11H8l-5 4v-4H3z"/></svg>` },
  { id: 'send-outline', keywords: ['send', 'arrow', 'message'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3 3 10.5l7.5 3L14 21l7-18z"/><path d="M10.5 13.5 21 3"/></svg>` },
  { id: 'trash-outline', keywords: ['trash', 'delete', 'bin'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6 7l1 13.5h10L18 7"/></svg>` },
  { id: 'edit-pencil-outline', keywords: ['edit', 'pencil', 'write'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19 4 20z"/><path d="M13.5 6.5 17.5 10"/></svg>` },
  { id: 'plus-circle-outline', keywords: ['plus', 'add', 'new'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>` },
  { id: 'arrow-right-outline', keywords: ['arrow', 'right', 'next'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="19" y2="12"/><path d="M13 6l6 6-6 6"/></svg>` },
  { id: 'play-circle-filled', keywords: ['play', 'video', 'media'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#15191F"/><path d="M10 8.5l6 3.5-6 3.5z" fill="#fff"/></svg>` },
  { id: 'book-outline', keywords: ['book', 'read', 'education'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5h7A2.5 2.5 0 0 1 13.5 7v13A2.5 2.5 0 0 0 11 18H4z"/><path d="M20 4.5h-7A2.5 2.5 0 0 0 10.5 7v13A2.5 2.5 0 0 1 13 18h7z"/></svg>` },
  { id: 'bookmark-outline', keywords: ['bookmark', 'save', 'favorite'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h12v17l-6-4-6 4v-17z"/></svg>` },
  { id: 'briefcase-outline', keywords: ['briefcase', 'work', 'business', 'job'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7.5" width="18" height="12" rx="2"/><path d="M8 7.5V5.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="3" y1="13" x2="21" y2="13"/></svg>` },
  { id: 'target-outline', keywords: ['target', 'goal', 'aim'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="#15191F" stroke="none"/></svg>` },
  { id: 'lightbulb-outline', keywords: ['idea', 'lightbulb', 'bright'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6.5 6.5 0 0 0-3.5 12c.7.5 1 1 1 1.8V18h5v-1.2c0-.8.3-1.3 1-1.8A6.5 6.5 0 0 0 12 3z"/></svg>` },
  { id: 'rocket-outline', keywords: ['rocket', 'launch', 'growth'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5c3 1.5 5 5 5 9.5-1 1-2 2-5 3-3-1-4-2-5-3 0-4.5 2-8 5-9.5z"/><circle cx="12" cy="10" r="1.6"/><path d="M8 15l-3 4 4-1"/><path d="M16 15l3 4-4-1"/></svg>` },
  { id: 'shield-outline', keywords: ['shield', 'security', 'protect'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5 20 5.5v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z"/><path d="M8.5 12l2.3 2.3L15.5 9.8"/></svg>` },
  { id: 'chart-bar-outline', keywords: ['chart', 'bar', 'analytics', 'graph'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="20" y2="21"/><rect x="5.5" y="13" width="3.5" height="8"/><rect x="10.5" y="8" width="3.5" height="13"/><rect x="15.5" y="4" width="3.5" height="17"/></svg>` },
  { id: 'trending-up-outline', keywords: ['trending', 'growth', 'chart', 'arrow'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 6"/><polyline points="15 6 21 6 21 12"/></svg>` },
  { id: 'grid-outline', keywords: ['grid', 'layout', 'dashboard'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>` },
  { id: 'list-outline', keywords: ['list', 'menu', 'items'], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15191F" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="4.5" cy="6" r="1" fill="#15191F"/><circle cx="4.5" cy="12" r="1" fill="#15191F"/><circle cx="4.5" cy="18" r="1" fill="#15191F"/><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/></svg>` },
];

const ARTWORK_ICON_DEFAULT_COLOR = '#15191F';
const recolorArtworkSvg = (svg: string, color: string) => svg.replace(/#15191F/g, color);
const artworkIconUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
const ARTWORK_DND_TYPE = 'application/x-designrr-artwork';

function ArtworksPanel({ onIconSelect }: { onIconSelect: (icon: ArtworkIcon) => void }) {
  const [query, setQuery] = useState('');
  // Shapes and icons are both just recolorable SVGs dropped on the slide (same onIconSelect
  // path) — the only reason they're not one flat list is that mixing "circle" in with "user
  // profile icon" makes both harder to scan, so a tab keeps each list purposeful.
  const [tab, setTab] = useState<'icons' | 'shapes'>('icons');

  const source = tab === 'icons' ? ARTWORK_ICONS : ARTWORK_SHAPES;
  const filtered = query.trim()
    ? source.filter(icon => icon.keywords.some(k => k.includes(query.trim().toLowerCase())))
    : source;

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <div className="flex items-center" style={{ background: '#F0F2F5', borderRadius: 9, padding: 3, gap: 2 }}>
        {([['icons', 'Icons'], ['shapes', 'Shapes']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className="flex-1 cursor-pointer"
            style={{ height: 30, borderRadius: 7, border: 'none', ...ns, fontSize: 12.5, fontWeight: 700,
              transition: 'background 0.15s, color 0.15s, box-shadow 0.15s',
              background: tab === id ? '#fff' : 'transparent',
              boxShadow: tab === id ? '0 1px 3px rgba(15,23,51,0.12)' : 'none',
              color: tab === id ? '#15191F' : '#8996AC' }}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center" style={{ gap: 6, border: '1px solid #E0E5EB', borderRadius: 8, padding: '9px 10px', background: '#fff' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A0AABA" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={tab === 'icons' ? 'Search icons…' : 'Search shapes…'}
          className="flex-1 outline-none bg-transparent"
          style={{ ...ns, fontSize: 13, color: '#15191F', border: 'none' }}
        />
      </div>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center" style={{ paddingTop: 40, gap: 4 }}>
          <div className="flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: '50%', background: '#F4F5F7', marginBottom: 6 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B0BBCA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><line x1="20" y1="20" x2="15.2" y2="15.2"/><line x1="8" y1="10.5" x2="13" y2="10.5"/></svg>
          </div>
          <span style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#52637A' }}>{tab === 'icons' ? 'No icons found' : 'No shapes found'}</span>
          <span style={{ ...ns, fontSize: 12, color: '#A0AABA', textAlign: 'center', maxWidth: 180 }}>
            {`No results for “${query.trim()}”. Try a different search term.`}
          </span>
          <button
            onClick={() => setQuery('')}
            className="cursor-pointer"
            style={{ marginTop: 10, border: 'none', background: 'none', padding: 0, ...ns, fontSize: 12.5, fontWeight: 600, color: '#006EFE' }}
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {filtered.map(icon => (
            <button
              key={icon.id}
              draggable
              onDragStart={e => {
                e.dataTransfer.setData(ARTWORK_DND_TYPE, icon.id);
                e.dataTransfer.setData('text/uri-list', artworkIconUri(icon.svg));
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onIconSelect(icon)}
              className="cursor-grab active:cursor-grabbing flex items-center justify-center"
              style={{ aspectRatio: '1/1', borderRadius: 10, border: '1px solid #E8EBF2', background: '#fff', padding: 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#006EFE'; e.currentTarget.style.background = '#F8FBFF'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8EBF2'; e.currentTarget.style.background = '#fff'; }}
            >
              <img src={artworkIconUri(icon.svg)} draggable={false} style={{ width: tab === 'shapes' ? '62%' : '48%', height: tab === 'shapes' ? '62%' : '48%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }}/>
            </button>
          ))}
        </div>
      )}
      <p style={{ ...ns, fontSize: 11.5, color: '#A0AABA', textAlign: 'center', marginTop: 4 }}>
        Artwork by <a href="https://iconify.design" target="_blank" rel="noopener noreferrer" style={{ color: '#A0AABA', textDecoration: 'underline' }}>Iconify</a>
      </p>
    </div>
  );
}

/* ───────────────────────── Right panel ───────────────────────── */

const FONT_OPTIONS = [
  { label: 'Nunito Sans',   value: "'Nunito Sans', sans-serif",   category: 'Sans-serif' },
  { label: 'Arial',         value: 'Arial, sans-serif',           category: 'Sans-serif' },
  { label: 'Verdana',       value: 'Verdana, sans-serif',         category: 'Sans-serif' },
  { label: 'Trebuchet MS',  value: "'Trebuchet MS', sans-serif",  category: 'Sans-serif' },
  { label: 'Georgia',       value: 'Georgia, serif',              category: 'Serif' },
  { label: 'Times New Roman', value: "'Times New Roman', serif",  category: 'Serif' },
  { label: 'Palatino',      value: "'Palatino Linotype', serif",  category: 'Serif' },
  { label: 'Courier New',   value: "'Courier New', monospace",    category: 'Monospace' },
  { label: 'Lucida Console',value: "'Lucida Console', monospace", category: 'Monospace' },
  { label: 'Impact',        value: 'Impact, sans-serif',          category: 'Display' },
  { label: 'Comic Sans',    value: "'Comic Sans MS', cursive",    category: 'Display' },
] as const;

function FontDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 50);
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const filtered = query.trim()
    ? FONT_OPTIONS.filter(f => f.label.toLowerCase().includes(query.toLowerCase()))
    : FONT_OPTIONS;

  const current = FONT_OPTIONS.find(f => f.value === value) ?? FONT_OPTIONS[0];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }}
        className="w-full flex items-center justify-between cursor-pointer"
        style={{ height: 32, padding: '0 10px', borderRadius: 7, border: '1px solid #E6E8EF', background: '#fff', ...ns, fontFamily: current.value, fontSize: 13, fontWeight: 500, color: '#15191F' }}
      >
        <span style={{ fontFamily: current.value }}>{current.label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="#8C97A8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && (
        <div className="absolute z-50 bg-white" style={{ top: 'calc(100% + 4px)', left: 0, right: 0, borderRadius: 10, border: '1.5px solid #E3E6EC', boxShadow: '0px 8px 24px rgba(15,23,51,0.14)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 8px 4px' }}>
            <div className="flex items-center" style={{ gap: 6, background: '#F5F7FA', borderRadius: 7, padding: '5px 8px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A0AABA" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search fonts…"
                className="flex-1 outline-none bg-transparent"
                style={{ ...ns, fontSize: 12, color: '#15191F', border: 'none' }}
              />
            </div>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto', padding: '4px 8px 8px' }}>
            {filtered.length === 0 ? (
              <p style={{ ...ns, fontSize: 12, color: '#A0AABA', padding: '8px 4px' }}>No fonts found</p>
            ) : filtered.map(f => (
              <button key={f.value}
                onMouseDown={e => { e.preventDefault(); onChange(f.value); setOpen(false); setQuery(''); }}
                className="w-full flex items-center cursor-pointer"
                style={{ height: 32, padding: '0 8px', borderRadius: 6, border: 'none', background: f.value === value ? '#EFF6FF' : 'none', ...ns, fontSize: 13, fontFamily: f.value, fontWeight: 500, color: f.value === value ? '#006EFE' : '#15191F', textAlign: 'left' }}
                onMouseEnter={e => { if (f.value !== value) e.currentTarget.style.background = '#F5F7FA'; }}
                onMouseLeave={e => { if (f.value !== value) e.currentTarget.style.background = 'none'; }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const FONT_WEIGHTS = [
  { label: 'Regular',  value: 400 },
  { label: 'Semibold', value: 600 },
  { label: 'Bold',     value: 700 },
] as const;

const FONT_SIZE_PRESETS = [8, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96];


function FontSizeDropdown({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(String(value));
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setInputVal(String(value)); }, [value]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const commit = (raw: string) => {
    const v = parseInt(raw);
    if (v > 0 && v <= 400) { onChange(v); setInputVal(String(v)); }
    else setInputVal(String(value));
    setOpen(false);
  };

  const step = (delta: number) => {
    const next = Math.max(1, Math.min(400, value + delta));
    onChange(next);
  };

  const stepBtn: React.CSSProperties = {
    width: 28, height: '100%', border: 'none', background: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    color: '#52637A', fontSize: 16, fontWeight: 400, lineHeight: 1,
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 32, borderRadius: 7, border: '1px solid #E6E8EF', background: '#fff', overflow: 'visible' }}>
      <button onMouseDown={e => { e.preventDefault(); step(-1); }} className="cursor-pointer" style={stepBtn}>−</button>
      <input
        ref={inputRef}
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onFocus={() => { setOpen(true); inputRef.current?.select(); }}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { commit(inputVal); inputRef.current?.blur(); } if (e.key === 'Escape') { setInputVal(String(value)); setOpen(false); inputRef.current?.blur(); } }}
        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', ...ns, fontSize: 13, fontWeight: 500, color: '#15191F', textAlign: 'center' }}
      />
      <button onMouseDown={e => { e.preventDefault(); step(1); }} className="cursor-pointer" style={stepBtn}>+</button>
      {open && (
        <div className="absolute bg-white" style={{ top: 'calc(100% + 4px)', left: '50%', transform: 'translateX(-50%)', width: 80, borderRadius: 9, border: '1.5px solid #E3E6EC', boxShadow: '0px 8px 24px rgba(15,23,51,0.14)', zIndex: 50, maxHeight: 220, overflowY: 'auto' }}>
          {FONT_SIZE_PRESETS.map(p => (
            <button key={p}
              onMouseDown={e => { e.preventDefault(); onChange(p); setOpen(false); }}
              className="w-full flex items-center cursor-pointer"
              style={{ height: 30, padding: '0 14px', border: 'none', background: p === value ? '#EFF6FF' : 'none', ...ns, fontSize: 13, fontWeight: p === value ? 600 : 400, color: p === value ? '#006EFE' : '#15191F', textAlign: 'left' }}
              onMouseEnter={e => { if (p !== value) e.currentTarget.style.background = '#F5F7FA'; }}
              onMouseLeave={e => { if (p !== value) e.currentTarget.style.background = 'none'; }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const LANGUAGE_OPTIONS = [
  { value: 'en-US', label: 'English (US)', flag: '🇺🇸' },
  { value: 'en-GB', label: 'English (UK)', flag: '🇬🇧' },
  { value: 'es', label: 'Spanish', flag: '🇪🇸' },
  { value: 'fr', label: 'French', flag: '🇫🇷' },
  { value: 'de', label: 'German', flag: '🇩🇪' },
  { value: 'pt', label: 'Portuguese', flag: '🇵🇹' },
  { value: 'it', label: 'Italian', flag: '🇮🇹' },
  { value: 'nl', label: 'Dutch', flag: '🇳🇱' },
  { value: 'pl', label: 'Polish', flag: '🇵🇱' },
  { value: 'ru', label: 'Russian', flag: '🇷🇺' },
  { value: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { value: 'zh-Hans', label: 'Chinese (Simplified)', flag: '🇨🇳' },
  { value: 'zh-Hant', label: 'Chinese (Traditional)', flag: '🇹🇼' },
  { value: 'ko', label: 'Korean', flag: '🇰🇷' },
  { value: 'ar', label: 'Arabic', flag: '🇸🇦' },
  { value: 'hi', label: 'Hindi', flag: '🇮🇳' },
  { value: 'tr', label: 'Turkish', flag: '🇹🇷' },
  { value: 'sv', label: 'Swedish', flag: '🇸🇪' },
  { value: 'no', label: 'Norwegian', flag: '🇳🇴' },
  { value: 'da', label: 'Danish', flag: '🇩🇰' },
] as const;

const TRANSITION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'dissolve', label: 'Dissolve' },
] as const;

function SettingsGlobeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.3" stroke="#15191F" strokeWidth="1.3" />
      <ellipse cx="8" cy="8" rx="2.7" ry="6.3" stroke="#15191F" strokeWidth="1.3" />
      <line x1="1.7" y1="8" x2="14.3" y2="8" stroke="#15191F" strokeWidth="1.3" />
    </svg>
  );
}

function SettingsTransitionIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15191F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 2 21 6 17 10" />
      <path d="M3 6h18" />
      <polyline points="7 22 3 18 7 14" />
      <path d="M21 18H3" />
    </svg>
  );
}

function SettingsClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15191F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 13.5" />
    </svg>
  );
}

function SettingsClockHistoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15191F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <polyline points="3 4 3 9 8 9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

function LanguageSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 50);
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const filtered = query.trim()
    ? LANGUAGE_OPTIONS.filter(l => l.label.toLowerCase().includes(query.toLowerCase()))
    : LANGUAGE_OPTIONS;

  const current = LANGUAGE_OPTIONS.find(l => l.value === value) ?? LANGUAGE_OPTIONS[0];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }}
        className="w-full flex items-center justify-between cursor-pointer"
        style={{ height: 44, padding: '0 14px', borderRadius: 10, border: '1px solid #E0E5EB', background: '#fff' }}
      >
        <span className="flex items-center" style={{ gap: 9 }}>
          <span style={{ fontSize: 17 }}>{current.flag}</span>
          <span style={{ ...ns, fontSize: 14.5, fontWeight: 600, color: '#15191F' }}>{current.label}</span>
        </span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="#8C97A8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && (
        <div className="absolute z-50 bg-white" style={{ top: 'calc(100% + 4px)', left: 0, right: 0, borderRadius: 10, border: '1.5px solid #E3E6EC', boxShadow: '0px 8px 24px rgba(15,23,51,0.14)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 8px 4px' }}>
            <div className="flex items-center" style={{ gap: 6, background: '#F5F7FA', borderRadius: 7, padding: '5px 8px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A0AABA" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search language…"
                className="flex-1 outline-none bg-transparent"
                style={{ ...ns, fontSize: 12, color: '#15191F', border: 'none' }}
              />
            </div>
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 8px 8px' }}>
            {filtered.length === 0 ? (
              <p style={{ ...ns, fontSize: 12, color: '#A0AABA', padding: '8px 4px' }}>No languages found</p>
            ) : filtered.map(l => (
              <button key={l.value}
                onMouseDown={e => { e.preventDefault(); onChange(l.value); setOpen(false); setQuery(''); }}
                className="w-full flex items-center cursor-pointer"
                style={{ gap: 8, height: 32, padding: '0 8px', borderRadius: 6, border: 'none', background: l.value === value ? '#EFF6FF' : 'none', ...ns, fontSize: 13, fontWeight: 500, color: l.value === value ? '#006EFE' : '#15191F', textAlign: 'left' }}
                onMouseEnter={e => { if (l.value !== value) e.currentTarget.style.background = '#F5F7FA'; }}
                onMouseLeave={e => { if (l.value !== value) e.currentTarget.style.background = 'none'; }}
              >
                <span style={{ fontSize: 15 }}>{l.flag}</span>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TransitionTypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const current = TRANSITION_OPTIONS.find(t => t.value === value) ?? TRANSITION_OPTIONS[0];

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <button
        onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }}
        className="w-full flex items-center justify-between cursor-pointer"
        style={{ height: 44, padding: '0 14px', borderRadius: 10, border: '1px solid #E0E5EB', background: '#fff' }}
      >
        <span style={{ ...ns, fontSize: 14.5, fontWeight: 600, color: '#15191F' }}>{current.label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="#8C97A8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && (
        <div className="absolute z-50 bg-white" style={{ top: 'calc(100% + 4px)', left: 0, right: 0, borderRadius: 10, border: '1.5px solid #E3E6EC', boxShadow: '0px 8px 24px rgba(15,23,51,0.14)', overflow: 'hidden' }}>
          {TRANSITION_OPTIONS.map(t => (
            <button key={t.value}
              onMouseDown={e => { e.preventDefault(); onChange(t.value); setOpen(false); }}
              className="w-full flex items-center cursor-pointer text-left"
              style={{ height: 34, padding: '0 12px', border: 'none', background: t.value === value ? '#EFF6FF' : 'none', ...ns, fontSize: 13.5, fontWeight: t.value === value ? 600 : 500, color: t.value === value ? '#006EFE' : '#15191F' }}
              onMouseEnter={e => { if (t.value !== value) e.currentTarget.style.background = '#F5F7FA'; }}
              onMouseLeave={e => { if (t.value !== value) e.currentTarget.style.background = 'none'; }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsNumberField({ value, onChange, min, max, width = 64 }: { value: number; onChange: (v: number) => void; min: number; max: number; width?: number }) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => { setRaw(String(value)); }, [value]);

  const commit = () => {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, n));
      onChange(clamped);
      setRaw(String(clamped));
    } else {
      setRaw(String(value));
    }
  };

  return (
    <input
      value={raw}
      onChange={e => setRaw(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      inputMode="numeric"
      style={{ width, height: 44, flexShrink: 0, textAlign: 'center', border: '1px solid #E0E5EB', borderRadius: 10, ...ns, fontSize: 14.5, fontWeight: 600, color: '#15191F' }}
    />
  );
}

function SettingsSectionDivider() {
  return <div style={{ height: 1, background: '#EEF0F4', margin: '13px 0' }} />;
}

const TEXT_COLORS = [
  '#15191F', '#52637A', '#FFFFFF', '#006EFE',
  '#5326BD', '#E54B4B', '#29A341', '#F4C430',
] as const;

const ALIGN_OPTS: { value: 'left' | 'center' | 'right' | 'justify'; icon: React.ReactNode; title: string }[] = [
  { value: 'left',    title: 'Align left',    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="17" y2="18"/></svg> },
  { value: 'center',  title: 'Align center',  icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/></svg> },
  { value: 'right',   title: 'Align right',   icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="7" y1="18" x2="21" y2="18"/></svg> },
  { value: 'justify', title: 'Justify',        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> },
];

const LIST_OPTS: { value: 'none' | 'bullet' | 'numbered'; label: string; icon: React.ReactNode }[] = [
  { value: 'none',     label: 'None',     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="16" x2="20" y2="16"/></svg> },
  { value: 'bullet',   label: 'Bullet',   icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="4" cy="8" r="1.5" fill="currentColor" stroke="none"/><line x1="8" y1="8" x2="20" y2="8"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><line x1="8" y1="12" x2="20" y2="12"/><circle cx="4" cy="16" r="1.5" fill="currentColor" stroke="none"/><line x1="8" y1="16" x2="20" y2="16"/></svg> },
  { value: 'numbered', label: 'Numbered', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><text x="1" y="9" style={{ fontSize: 8, fontWeight: 700, fill: 'currentColor', stroke: 'none', fontFamily: 'sans-serif' }}>1.</text><text x="1" y="14" style={{ fontSize: 8, fontWeight: 700, fill: 'currentColor', stroke: 'none', fontFamily: 'sans-serif' }}>2.</text><text x="1" y="19" style={{ fontSize: 8, fontWeight: 700, fill: 'currentColor', stroke: 'none', fontFamily: 'sans-serif' }}>3.</text><line x1="10" y1="8" x2="20" y2="8"/><line x1="10" y1="13" x2="20" y2="13"/><line x1="10" y1="18" x2="20" y2="18"/></svg> },
];

const barChevron = <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1l3 3 3-3" stroke="#8C97A8" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const paintBucketPath = "M262.1 236.7C265 239.6 304.5 279.1 380.6 355.2C396.6 371.2 409.9 384.5 420.7 395.3C426.9 401.5 437.1 401.5 443.3 395.3C449.5 389.1 449.5 378.9 443.3 372.7L425.9 355.3C428.4 352.8 468.7 312.5 546.8 234.4C585.8 195.4 585.8 132.2 546.8 93.3C507.8 54.4 444.6 54.3 405.7 93.3C327.6 171.4 287.3 211.7 284.8 214.2L267.4 196.8L267.4 196.8C261.2 190.6 251 190.6 244.8 196.8C238.6 203 238.6 213.2 244.8 219.4L262.2 236.8zM524.1 211.7L403.3 332.6L307.4 236.7L428.2 115.9C454.7 89.4 497.6 89.4 524.1 115.9C550.6 142.4 550.6 185.3 524.1 211.8zM119.4 385.9C104.4 400.9 96 421.3 96 442.5L96 483.7L67.8 533.1C65.3 537.4 64 542.3 64 547.3C64 563.1 76.8 575.9 92.6 575.9C97.6 575.9 102.5 574.6 106.8 572.1L156.2 543.9L197.4 543.9C218.6 543.9 239 535.5 254 520.5L366 408.5L343.4 385.9L231.4 497.9C222.4 506.9 210.2 512 197.5 512L152 512C149.2 512 146.5 512.7 144.1 514.1L101.7 538.3L125.9 495.9C127.3 493.5 128 490.7 128 488L128 442.5C128 429.8 133.1 417.6 142.1 408.6L254.1 296.6L231.5 274L119.5 386z";

function useBarDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return { open, setOpen, ref };
}

function BarWeightPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { open, setOpen, ref } = useBarDropdown();
  const current = FONT_WEIGHTS.find(w => w.value === value) ?? FONT_WEIGHTS[0];
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }} className="flex items-center cursor-pointer"
        style={{ gap: 4, height: 28, padding: '0 8px', borderRadius: 6, border: '1px solid #E3E6EC', background: '#FAFBFC', ...ns, fontSize: 11.5, fontWeight: value, color: '#29323D', whiteSpace: 'nowrap' }}>
        {current.label}{barChevron}
      </button>
      {open && (
        <div className="absolute bg-white" style={{ top: 'calc(100% + 4px)', left: 0, borderRadius: 8, border: '1.5px solid #E3E6EC', boxShadow: '0px 8px 24px rgba(15,23,51,0.14)', zIndex: 60, padding: 4, minWidth: 108 }}>
          {FONT_WEIGHTS.map(w => (
            <button key={w.value} onMouseDown={e => { e.preventDefault(); onChange(w.value); setOpen(false); }} className="w-full flex items-center cursor-pointer"
              style={{ height: 30, padding: '0 10px', borderRadius: 5, border: 'none', background: w.value === value ? '#EFF6FF' : 'none', ...ns, fontSize: 12.5, fontWeight: w.value, color: w.value === value ? '#006EFE' : '#15191F', textAlign: 'left' }}>
              {w.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BarColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { open, setOpen, ref } = useBarDropdown();
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }} className="flex items-center cursor-pointer"
        style={{ gap: 4, height: 28, padding: '0 8px', borderRadius: 6, border: '1px solid #E3E6EC', background: '#FAFBFC' }}>
        <div style={{ width: 16, height: 16, borderRadius: 3, background: value, border: '1.5px solid rgba(0,0,0,0.1)', flexShrink: 0 }}/>
        {barChevron}
      </button>
      {open && (
        <div className="absolute bg-white" style={{ top: 'calc(100% + 4px)', left: 0, borderRadius: 9, border: '1.5px solid #E3E6EC', boxShadow: '0px 8px 24px rgba(15,23,51,0.14)', zIndex: 60, padding: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, width: 136 }}>
            {TEXT_COLORS.map(hex => {
              const active = value === hex;
              return (
                <button key={hex} onMouseDown={e => { e.preventDefault(); onChange(hex); setOpen(false); }}
                  style={{ width: 22, height: 22, borderRadius: 5, background: hex, border: active ? '2px solid #006EFE' : '1.5px solid #E3E6EC', boxShadow: active ? '0 0 0 2px rgba(0,110,254,0.2)' : 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}/>
              );
            })}
            <label className="cursor-pointer flex items-center justify-center" style={{ width: 22, height: 22, borderRadius: 5, border: '1.5px solid #E3E6EC', background: '#fff', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
              <svg width="11" height="11" viewBox="0 0 640 640" fill="#8E99AB" style={{ pointerEvents: 'none' }}><path d={paintBucketPath}/></svg>
              <input type="color" value={value?.startsWith('#') ? value : '#15191F'} onChange={e => onChange(e.target.value)} className="absolute opacity-0 cursor-pointer" style={{ width: '100%', height: '100%', top: 0, left: 0 }}/>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function BarListPicker({ value, onChange }: { value: 'none' | 'bullet' | 'numbered'; onChange: (v: 'none' | 'bullet' | 'numbered') => void }) {
  const { open, setOpen, ref } = useBarDropdown();
  const current = LIST_OPTS.find(o => o.value === value) ?? LIST_OPTS[1];
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }} className="flex items-center cursor-pointer"
        style={{ gap: 4, height: 28, padding: '0 8px', borderRadius: 6, border: '1px solid #E3E6EC', background: '#FAFBFC', color: '#52637A' }}>
        {current.icon}{barChevron}
      </button>
      {open && (
        <div className="absolute bg-white" style={{ top: 'calc(100% + 4px)', left: 0, borderRadius: 8, border: '1.5px solid #E3E6EC', boxShadow: '0px 8px 24px rgba(15,23,51,0.14)', zIndex: 60, padding: 4, minWidth: 130 }}>
          {LIST_OPTS.map(o => (
            <button key={o.value} onMouseDown={e => { e.preventDefault(); onChange(o.value); setOpen(false); }} className="w-full flex items-center cursor-pointer"
              style={{ height: 30, padding: '0 10px', gap: 8, borderRadius: 5, border: 'none', background: o.value === value ? '#EFF6FF' : 'none', color: o.value === value ? '#006EFE' : '#52637A' }}>
              {o.icon}
              <span style={{ ...ns, fontSize: 12.5, fontWeight: o.value === value ? 600 : 400, color: 'inherit' }}>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TextFormatBar({ slide, theme, focusedBlock, onFontFamilyChange, onFontWeightChange, onFontSizeChange, onTextColorChange, onListStyleChange, onTextAlignChange }: {
  slide: PresentationSlide;
  theme: MockTheme;
  focusedBlock: 'title' | 'content' | null;
  onFontFamilyChange: (v: string) => void;
  onFontWeightChange: (v: number) => void;
  onFontSizeChange: (v: number) => void;
  onTextColorChange: (v: string) => void;
  onListStyleChange: (v: 'bullet' | 'numbered' | 'none') => void;
  onTextAlignChange: (v: 'left' | 'center' | 'right' | 'justify') => void;
}) {
  const curFamily = focusedBlock === 'title' ? (slide.titleFontFamily ?? "'Nunito Sans', sans-serif") : (slide.contentFontFamily ?? "'Nunito Sans', sans-serif");
  const curWeight = focusedBlock === 'title' ? (slide.titleFontWeight ?? 700) : (slide.contentFontWeight ?? 400);
  const curSize   = focusedBlock === 'title' ? (slide.titleFontSize ?? 24) : (slide.contentFontSize ?? 14);
  const curColor  = slide.textColorOverride ?? theme.titleColor;
  const curList: 'none' | 'bullet' | 'numbered' = slide.listStyle ?? 'bullet';
  const curAlign  = (focusedBlock === 'title' ? slide.titleTextAlign : slide.contentTextAlign) ?? 'left';

  const sep = <div style={{ width: 1, height: 18, background: '#E3E6EC', flexShrink: 0, margin: '0 4px' }} />;

  const iconBtn = (active: boolean, content: React.ReactNode, onClick: () => void, tooltipLabel?: string) => {
    const btn = (
      <button
        onMouseDown={e => { e.preventDefault(); onClick(); }}
        className="flex items-center justify-center cursor-pointer flex-shrink-0"
        style={{ width: 28, height: 28, borderRadius: 6, border: active ? '1.5px solid #006EFE' : '1px solid transparent', background: active ? '#EFF6FF' : 'none', color: active ? '#006EFE' : '#52637A' }}>
        {content}
      </button>
    );
    return tooltipLabel ? <Tooltip key={tooltipLabel} label={tooltipLabel} position="bottom">{btn}</Tooltip> : btn;
  };

  return (
    <div className="flex items-center" style={{ background: '#fff', borderRadius: 12, border: '1px solid #E3E6EC', boxShadow: '0px 4px 20px rgba(15,23,51,0.12)', padding: '5px 10px', gap: 3, flexShrink: 0 }}>
      {/* Font family */}
      <div style={{ width: 128, flexShrink: 0 }}>
        <FontDropdown value={curFamily} onChange={onFontFamilyChange} />
      </div>
      {/* Size stepper */}
      <div style={{ width: 106, flexShrink: 0 }}>
        <FontSizeDropdown value={curSize} onChange={onFontSizeChange} />
      </div>

      {sep}

      {/* B / I / U */}
      {iconBtn(false, <span style={{ ...ns, fontSize: 13, fontWeight: 700 }}>B</span>, () => document.execCommand('bold'), 'Bold')}
      {iconBtn(false, <span style={{ ...ns, fontSize: 13, fontStyle: 'italic' }}>I</span>, () => document.execCommand('italic'), 'Italic')}
      {iconBtn(false, <span style={{ ...ns, fontSize: 13, textDecoration: 'underline' }}>U</span>, () => document.execCommand('underline'), 'Underline')}

      {sep}

      {/* Color — compact swatch + dropdown */}
      <BarColorPicker value={curColor} onChange={onTextColorChange} />

      {sep}

      {/* Alignment — cycle on click */}
      {(() => {
        const idx = ALIGN_OPTS.findIndex(a => a.value === curAlign);
        const current = ALIGN_OPTS[idx] ?? ALIGN_OPTS[0];
        const next = ALIGN_OPTS[(idx + 1) % ALIGN_OPTS.length];
        return iconBtn(false, current.icon, () => onTextAlignChange(next.value), current.title);
      })()}

      {sep}

      {/* List — cycle on click */}
      {(() => {
        const idx = LIST_OPTS.findIndex(o => o.value === curList);
        const current = LIST_OPTS[idx] ?? LIST_OPTS[0];
        const next = LIST_OPTS[(idx + 1) % LIST_OPTS.length];
        return iconBtn(false, current.icon, () => onListStyleChange(next.value), `List: ${current.label}`);
      })()}
    </div>
  );
}

/* Floating bar for a selected photo/icon — same shell as TextFormatBar so only one
   style of format bar ever appears, whichever kind of content is selected. */
const DIMENSION_MIN = 10;
const DIMENSION_MAX = 95;

// The slide canvas is 16:9, so equal w%/h% does NOT render as a square — h% covers a
// physically shorter axis. To render a box that's visually square, h% must be w% * 16/9.
const SLIDE_ASPECT = 16 / 9;
const squareIconHeightPct = (widthPct: number) => Math.round(widthPct * SLIDE_ASPECT);

function DimensionField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [inputVal, setInputVal] = useState(String(Math.round(value)));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setInputVal(String(Math.round(value))); }, [value]);

  const commit = (raw: string) => {
    const v = Math.round(parseFloat(raw));
    if (!isNaN(v)) onChange(Math.max(DIMENSION_MIN, Math.min(DIMENSION_MAX, v)));
    else setInputVal(String(Math.round(value)));
  };

  const step = (delta: number) => onChange(Math.max(DIMENSION_MIN, Math.min(DIMENSION_MAX, Math.round(value) + delta)));

  return (
    <div className="flex items-center flex-shrink-0" style={{ gap: 5, height: 32, padding: '0 6px 0 9px', borderRadius: 7, border: '1px solid #E3E6EC', background: '#FAFBFC' }}>
      <span style={{ ...ns, fontSize: 10.5, fontWeight: 700, color: '#B0BBCA', letterSpacing: 0.3 }}>{label}</span>
      <input
        ref={inputRef}
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onFocus={() => inputRef.current?.select()}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { commit(inputVal); inputRef.current?.blur(); }
          if (e.key === 'Escape') { setInputVal(String(Math.round(value))); inputRef.current?.blur(); }
          if (e.key === 'ArrowUp') { e.preventDefault(); step(1); }
          if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
        }}
        style={{ width: 18, border: 'none', outline: 'none', background: 'transparent', ...ns, fontSize: 12.5, fontWeight: 600, color: '#15191F' }}
      />
      <button
        onMouseDown={e => { e.preventDefault(); step(-1); }}
        title="Step down (or use ↑/↓ while editing)"
        className="cursor-pointer flex-shrink-0"
        style={{ width: 14, height: 14, border: 'none', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A0AABA', padding: 0 }}
        onMouseEnter={e => { e.currentTarget.style.color = '#52637A'; }} onMouseLeave={e => { e.currentTarget.style.color = '#A0AABA'; }}
      >
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
    </div>
  );
}

function DimensionGroup({ w, h, lockAspect, onLockToggle, onWChange, onHChange }: {
  w: number; h: number; lockAspect: boolean; onLockToggle: () => void;
  onWChange: (v: number) => void; onHChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center flex-shrink-0" style={{ gap: 6 }}>
      <DimensionField label="W" value={w} onChange={onWChange} />
      <Tooltip label={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'} position="bottom">
        <button
          onClick={onLockToggle}
          className="cursor-pointer flex items-center justify-center flex-shrink-0"
          style={{ width: 32, height: 32, borderRadius: 7, border: '1px solid #E3E6EC', background: lockAspect ? '#EFF6FF' : '#FAFBFC', color: lockAspect ? '#006EFE' : '#8C97A8' }}
        >
          {lockAspect ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.75-1.5"/></svg>
          )}
        </button>
      </Tooltip>
      <DimensionField label="H" value={h} onChange={onHChange} />
    </div>
  );
}

function PhotoFormatBar({ photo, isIcon, onColorChange, onSetBackground, onResize }: {
  photo: SlidePhotoData;
  isIcon: boolean;
  onColorChange?: (color: string) => void;
  onSetBackground: () => void;
  onResize: (w: number, h: number) => void;
}) {
  const [lockAspect, setLockAspect] = useState(true);
  const sep = <div style={{ width: 1, height: 18, background: '#E3E6EC', flexShrink: 0, margin: '0 4px' }} />;
  const textBtn = (label: string, color: string, hoverBg: string, onClick: () => void) => (
    <button onClick={onClick} className="cursor-pointer" style={{ ...ns, fontSize: 12, fontWeight: 500, color, background: 'none', border: 'none', padding: '5px 8px', borderRadius: 6 }}
      onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
      {label}
    </button>
  );

  const handleWChange = (w: number) => {
    if (lockAspect && photo.w > 0) onResize(w, Math.max(DIMENSION_MIN, Math.min(DIMENSION_MAX, Math.round(w * (photo.h / photo.w)))));
    else onResize(w, photo.h);
  };
  const handleHChange = (h: number) => {
    if (lockAspect && photo.h > 0) onResize(Math.max(DIMENSION_MIN, Math.min(DIMENSION_MAX, Math.round(h * (photo.w / photo.h)))), h);
    else onResize(photo.w, h);
  };

  return (
    <div className="flex items-center" style={{ background: '#fff', borderRadius: 12, border: '1px solid #E3E6EC', boxShadow: '0px 4px 20px rgba(15,23,51,0.12)', padding: '5px 10px', gap: 3, flexShrink: 0 }}>
      {isIcon && onColorChange ? (
        <BarColorPicker value={photo.iconColor ?? ARTWORK_ICON_DEFAULT_COLOR} onChange={onColorChange} />
      ) : (
        textBtn('Set as background', '#52637A', '#F5F7FA', onSetBackground)
      )}
      {sep}
      <DimensionGroup
        w={photo.w}
        h={photo.h}
        lockAspect={lockAspect}
        onLockToggle={() => setLockAspect(v => !v)}
        onWChange={handleWChange}
        onHChange={handleHChange}
      />
    </div>
  );
}

function RightPanel({ slide, theme, onLayoutChange, onTypeChange, rightPanelMode, focusedBlock, onFontSizeChange, onFontFamilyChange, onFontWeightChange, onTextColorChange, onListStyleChange, onTextAlignChange, onThemeChange, onBgColorChange, onBgImageChange, onBgToSlidePhoto, onContentAlignChange, selectedPhotoId, onPhotoColorChange, onPhotoSetBackground, onPhotoResize }: {
  slide: PresentationSlide | null;
  theme: MockTheme;
  onLayoutChange: (l: SlideLayout) => void;
  onTypeChange: (t: SlideType) => void;
  rightPanelMode: 'slide' | 'text';
  focusedBlock: 'title' | 'content' | null;
  onFontSizeChange: (size: number) => void;
  onFontFamilyChange: (family: string) => void;
  onFontWeightChange: (weight: number) => void;
  onTextColorChange: (color: string) => void;
  onListStyleChange: (style: 'bullet' | 'numbered' | 'none') => void;
  onTextAlignChange: (align: 'left' | 'center' | 'right' | 'justify') => void;
  onThemeChange: (id: string) => void;
  onBgColorChange: (color: string | undefined) => void;
  onBgImageChange: (url: string | undefined) => void;
  onBgToSlidePhoto?: () => void;
  onContentAlignChange: (align: 'top' | 'center' | 'bottom') => void;
  selectedPhotoId: string | null;
  onPhotoColorChange: (color: string) => void;
  onPhotoSetBackground: () => void;
  onPhotoResize: (w: number, h: number) => void;
}) {
  const [photoLockAspect, setPhotoLockAspect] = useState(true);
  const selectedPhoto = slide?.slidePhotos?.find(p => p.id === selectedPhotoId) ?? null;
  const currentLayout: SlideLayout = slide?.layout ?? (slide?.type === 'headline' ? 'centered' : 'standard');

  const currentFontSize = focusedBlock === 'title' ? (slide?.titleFontSize ?? 24) : (slide?.contentFontSize ?? 14);
  const curFamily = focusedBlock === 'title' ? (slide?.titleFontFamily ?? "'Nunito Sans', sans-serif") : (slide?.contentFontFamily ?? "'Nunito Sans', sans-serif");
  const curWeight = focusedBlock === 'title' ? (slide?.titleFontWeight ?? 700) : (slide?.contentFontWeight ?? 400);
  const curColor  = slide?.textColorOverride ?? theme.titleColor;
  const curList: 'none' | 'bullet' | 'numbered' = slide?.listStyle ?? 'bullet';
  const curAlign  = (focusedBlock === 'title' ? slide?.titleTextAlign : slide?.contentTextAlign) ?? 'left';

  const section = (label: string, children: React.ReactNode) => (
    <div style={{ padding: '16px', borderBottom: '1px solid #F0F2F5' }}>
      <p style={{ ...ns, fontSize: 12.5, fontWeight: 700, color: '#15191F', letterSpacing: 0, marginBottom: 14 }}>{label}</p>
      {children}
    </div>
  );

  const miniLabel = (text: string) => (
    <p style={{ ...ns, fontSize: 9.5, fontWeight: 700, color: '#A8B3C4', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>{text}</p>
  );


  // Every slide, headline or content, picks from the same 3 layouts — matches the
  // Ascend template families below, which are likewise always scoped to 3 siblings.
  const universalLayouts: SlideLayout[] = ['centered', 'big-title', 'minimal'];
  // Ascend template layouts (fig-<family>-<1|2|3>) are scoped to their own 3 sibling variants,
  // rather than mixed into the generic layout list above.
  const curFigFamily = figFamilyOf(currentLayout);
  const visibleLayouts = curFigFamily
    ? LAYOUTS.filter(l => figFamilyOf(l.id) === curFigFamily)
    : LAYOUTS.filter(l => universalLayouts.includes(l.id));

  return (
    <div className="flex-shrink-0 h-full overflow-y-auto border-l border-border-light bg-white" style={{ width: RIGHT_PANEL_W, overflowX: 'hidden' }}>
      {!slide ? (
        <div className="flex items-center justify-center h-full">
          <p style={{ ...ns, fontSize: 13, color: '#A0AABA' }}>No slide selected</p>
        </div>
      ) : rightPanelMode === 'text' ? (
        /* ── Option 1: modern text panel ── */
        <>
          {/* Header */}
          <div className="flex items-center" style={{ padding: '10px 14px 9px', borderBottom: '1px solid #F2F3F7' }}>
            <span style={{ ...ns, fontSize: 10.5, fontWeight: 700, color: '#52637A', letterSpacing: 0.4, textTransform: 'uppercase' }}>
              Text — {focusedBlock === 'title' ? 'Title' : 'Content'}
            </span>
          </div>

          {/* Font */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #F2F3F7' }}>
            {miniLabel('Font')}
            <div className="flex" style={{ gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <FontDropdown value={curFamily} onChange={onFontFamilyChange} />
              </div>
              <div style={{ width: 96, flexShrink: 0 }}>
                <FontSizeDropdown value={currentFontSize} onChange={onFontSizeChange} />
              </div>
            </div>
          </div>

          {/* Style */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #F2F3F7' }}>
            {miniLabel('Style')}
            <div style={{ display: 'flex', gap: 5 }}>
              {[
                { label: 'B', cmd: 'bold',      extra: { fontWeight: 700 } },
                { label: 'I', cmd: 'italic',    extra: { fontStyle: 'italic' as const } },
                { label: 'U', cmd: 'underline', extra: { textDecoration: 'underline' as const } },
              ].map(b => (
                <button key={b.cmd}
                  onMouseDown={e => { e.preventDefault(); document.execCommand(b.cmd); }}
                  className="flex-1 flex items-center justify-center cursor-pointer"
                  style={{ height: 30, borderRadius: 6, border: '1px solid #E6E8EF', background: '#F7F8FA', ...ns, fontSize: 13, color: '#3B4453', ...b.extra }}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Alignment */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #F2F3F7' }}>
            {miniLabel('Alignment')}
            <div style={{ display: 'flex', gap: 5 }}>
              {ALIGN_OPTS.map(a => {
                const active = curAlign === a.value;
                return (
                  <button key={a.value}
                    onMouseDown={e => { e.preventDefault(); onTextAlignChange(a.value); }}
                    className="flex-1 flex items-center justify-center cursor-pointer"
                    style={{ height: 30, borderRadius: 6, border: '1px solid ' + (active ? '#006EFE' : '#E6E8EF'), background: active ? '#006EFE' : '#F7F8FA', color: active ? '#fff' : '#52637A' }}>
                    {a.icon}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #F2F3F7' }}>
            {miniLabel('Color')}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {TEXT_COLORS.map(hex => {
                const active = curColor === hex;
                return (
                  <button key={hex}
                    onMouseDown={e => { e.preventDefault(); onTextColorChange(hex); }}
                    className="cursor-pointer flex-shrink-0"
                    style={{ width: 22, height: 22, borderRadius: '50%', background: hex, border: 'none', padding: 0, boxShadow: active ? '0 0 0 2px #fff, 0 0 0 3.5px #006EFE' : '0 0 0 1px rgba(0,0,0,0.12)' }}
                  />
                );
              })}
              <label className="cursor-pointer flex-shrink-0 flex items-center justify-center" title="Custom colour"
                style={{ width: 22, height: 22, borderRadius: '50%', border: '1px dashed #C8CDD8', background: '#F7F8FA', position: 'relative', overflow: 'hidden' }}>
                <svg width="11" height="11" viewBox="0 0 640 640" fill="#8E99AB" style={{ pointerEvents: 'none' }}><path d="M262.1 236.7C265 239.6 304.5 279.1 380.6 355.2C396.6 371.2 409.9 384.5 420.7 395.3C426.9 401.5 437.1 401.5 443.3 395.3C449.5 389.1 449.5 378.9 443.3 372.7L425.9 355.3C428.4 352.8 468.7 312.5 546.8 234.4C585.8 195.4 585.8 132.2 546.8 93.3C507.8 54.4 444.6 54.3 405.7 93.3C327.6 171.4 287.3 211.7 284.8 214.2L267.4 196.8L267.4 196.8C261.2 190.6 251 190.6 244.8 196.8C238.6 203 238.6 213.2 244.8 219.4L262.2 236.8zM524.1 211.7L403.3 332.6L307.4 236.7L428.2 115.9C454.7 89.4 497.6 89.4 524.1 115.9C550.6 142.4 550.6 185.3 524.1 211.8zM119.4 385.9C104.4 400.9 96 421.3 96 442.5L96 483.7L67.8 533.1C65.3 537.4 64 542.3 64 547.3C64 563.1 76.8 575.9 92.6 575.9C97.6 575.9 102.5 574.6 106.8 572.1L156.2 543.9L197.4 543.9C218.6 543.9 239 535.5 254 520.5L366 408.5L343.4 385.9L231.4 497.9C222.4 506.9 210.2 512 197.5 512L152 512C149.2 512 146.5 512.7 144.1 514.1L101.7 538.3L125.9 495.9C127.3 493.5 128 490.7 128 488L128 442.5C128 429.8 133.1 417.6 142.1 408.6L254.1 296.6L231.5 274L119.5 386z"/></svg>
                <input type="color" value={curColor?.startsWith('#') ? curColor : '#15191F'} onChange={e => onTextColorChange(e.target.value)} className="absolute opacity-0 cursor-pointer" style={{ width: '100%', height: '100%', top: 0, left: 0 }}/>
              </label>
            </div>
          </div>

          {/* List */}
          <div style={{ padding: '12px 14px' }}>
            {miniLabel('List')}
            <div style={{ display: 'flex', gap: 5 }}>
              {LIST_OPTS.map(o => {
                const active = curList === o.value;
                return (
                  <button key={o.value}
                    onMouseDown={e => { e.preventDefault(); onListStyleChange(o.value); }}
                    className="flex-1 flex flex-col items-center justify-center cursor-pointer"
                    style={{ height: 46, borderRadius: 7, border: '1px solid ' + (active ? '#006EFE' : '#E6E8EF'), background: active ? '#006EFE' : '#F7F8FA', gap: 3, color: active ? '#fff' : '#52637A' }}>
                    {o.icon}
                    <span style={{ ...ns, fontSize: 10, fontWeight: active ? 600 : 500 }}>{o.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <>
          {selectedPhoto && (() => {
            const photo = selectedPhoto;
            const isIcon = !!photo.iconId;
            const handleWChange = (w: number) => {
              if (photoLockAspect && photo.w > 0) onPhotoResize(w, Math.max(DIMENSION_MIN, Math.min(DIMENSION_MAX, Math.round(w * (photo.h / photo.w)))));
              else onPhotoResize(w, photo.h);
            };
            const handleHChange = (h: number) => {
              if (photoLockAspect && photo.h > 0) onPhotoResize(Math.max(DIMENSION_MIN, Math.min(DIMENSION_MAX, Math.round(h * (photo.w / photo.h)))), h);
              else onPhotoResize(photo.w, h);
            };
            return (
              <div data-photo-format-bar>
                {/* Header — same shape as the Text panel's header, styled neutral */}
                <div className="flex items-center" style={{ padding: '10px 14px 9px', borderBottom: '1px solid #F2F3F7' }}>
                  <span style={{ ...ns, fontSize: 10.5, fontWeight: 700, color: '#52637A', letterSpacing: 0.4, textTransform: 'uppercase' }}>
                    {isIcon ? 'Icon' : 'Photo'}
                  </span>
                </div>

                <div style={{ padding: '12px 14px', borderBottom: '1px solid #F2F3F7' }}>
                  {miniLabel('Dimensions')}
                  <DimensionGroup
                    w={photo.w}
                    h={photo.h}
                    lockAspect={photoLockAspect}
                    onLockToggle={() => setPhotoLockAspect(v => !v)}
                    onWChange={handleWChange}
                    onHChange={handleHChange}
                  />
                </div>

                {isIcon ? (
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid #F2F3F7' }}>
                    {miniLabel('Color')}
                    <div className="flex items-center" style={{ gap: 6 }}>
                      {TEXT_COLORS.map(hex => {
                        const active = (photo.iconColor ?? ARTWORK_ICON_DEFAULT_COLOR) === hex;
                        return (
                          <button key={hex} onClick={() => onPhotoColorChange(hex)} className="cursor-pointer flex-shrink-0"
                            style={{ width: 22, height: 22, borderRadius: '50%', background: hex, border: 'none', padding: 0, boxShadow: active ? '0 0 0 2px #fff, 0 0 0 3.5px #006EFE' : '0 0 0 1px rgba(0,0,0,0.12)' }}/>
                        );
                      })}
                      <label className="cursor-pointer flex-shrink-0 flex items-center justify-center" title="Custom colour"
                        style={{ width: 22, height: 22, borderRadius: '50%', border: '1px dashed #C8CDD8', background: '#F7F8FA', position: 'relative', overflow: 'hidden' }}>
                        <svg width="11" height="11" viewBox="0 0 640 640" fill="#8E99AB" style={{ pointerEvents: 'none' }}><path d={paintBucketPath}/></svg>
                        <input type="color" value={photo.iconColor ?? ARTWORK_ICON_DEFAULT_COLOR} onChange={e => onPhotoColorChange(e.target.value)} className="absolute opacity-0 cursor-pointer" style={{ width: '100%', height: '100%', top: 0, left: 0 }}/>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid #F2F3F7' }}>
                    <button onClick={onPhotoSetBackground} className="cursor-pointer" style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: '#006EFE', background: 'none', border: 'none', padding: 0, textAlign: 'left' }}>
                      Set as background
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
          {!selectedPhoto && section('Layout', (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 7 }}>
              {visibleLayouts.map(l => {
                const isSel = l.id === currentLayout;
                return (
                  <div key={l.id} className="flex flex-col" style={{ gap: 5 }}>
                    <button onClick={() => onLayoutChange(l.id)} className="flex flex-col items-start cursor-pointer" style={{ borderRadius: 7, border: isSel ? '1.5px solid #006EFE' : '1.5px solid #E3E6EC', background: isSel ? '#EFF6FF' : '#fff', padding: 4, overflow: 'hidden' }}>
                      <div className="w-full overflow-hidden" style={{ borderRadius: 4, background: '#fff' }}>
                        {slide ? <SlideThumbnail slide={{ ...slide, layout: l.id }} theme={theme} rounded={false}/> : <LayoutThumbSVG layout={l.id}/>}
                      </div>
                    </button>
                    <span style={{ ...ns, fontSize: 10.5, fontWeight: isSel ? 600 : 500, color: isSel ? '#006EFE' : '#52637A' }}>{l.name}</span>
                  </div>
                );
              })}
            </div>
          ))}
          {!selectedPhoto && section('Background', (
            <div className="flex flex-col" style={{ gap: 8 }}>
              <div className="flex items-center" style={{ gap: 6 }}>
                {[
                  { color: '#FFFFFF', label: 'White' },
                  { color: '#F0F4FF', label: 'Light blue' },
                  { color: '#15161A', label: 'Dark' },
                ].map(({ color, label }) => {
                  const active = !slide?.bgImageUrl && (slide?.bgColor ?? theme.bg) === color;
                  return (
                    <Tooltip key={color} label={label} position="top">
                      <button onClick={() => { onBgImageChange(undefined); onBgColorChange(color); }} className="cursor-pointer" style={{ width: 32, height: 32, borderRadius: 7, background: color, border: active ? '2.5px solid #006EFE' : '1.5px solid #E3E6EC', boxShadow: active ? '0 0 0 2px rgba(0,110,254,0.15)' : 'none', padding: 0, flexShrink: 0 }}/>
                    </Tooltip>
                  );
                })}
                <Tooltip label="Custom colour" position="top">
                  <label className="cursor-pointer flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 7, border: '1.5px solid #E3E6EC', background: '#fff', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 640 640" fill="#8E99AB" style={{ pointerEvents: 'none' }}>
                      <path d="M262.1 236.7C265 239.6 304.5 279.1 380.6 355.2C396.6 371.2 409.9 384.5 420.7 395.3C426.9 401.5 437.1 401.5 443.3 395.3C449.5 389.1 449.5 378.9 443.3 372.7L425.9 355.3C428.4 352.8 468.7 312.5 546.8 234.4C585.8 195.4 585.8 132.2 546.8 93.3C507.8 54.4 444.6 54.3 405.7 93.3C327.6 171.4 287.3 211.7 284.8 214.2L267.4 196.8L267.4 196.8C261.2 190.6 251 190.6 244.8 196.8C238.6 203 238.6 213.2 244.8 219.4L262.2 236.8zM524.1 211.7L403.3 332.6L307.4 236.7L428.2 115.9C454.7 89.4 497.6 89.4 524.1 115.9C550.6 142.4 550.6 185.3 524.1 211.8zM119.4 385.9C104.4 400.9 96 421.3 96 442.5L96 483.7L67.8 533.1C65.3 537.4 64 542.3 64 547.3C64 563.1 76.8 575.9 92.6 575.9C97.6 575.9 102.5 574.6 106.8 572.1L156.2 543.9L197.4 543.9C218.6 543.9 239 535.5 254 520.5L366 408.5L343.4 385.9L231.4 497.9C222.4 506.9 210.2 512 197.5 512L152 512C149.2 512 146.5 512.7 144.1 514.1L101.7 538.3L125.9 495.9C127.3 493.5 128 490.7 128 488L128 442.5C128 429.8 133.1 417.6 142.1 408.6L254.1 296.6L231.5 274L119.5 386z"/>
                    </svg>
                    <input type="color" value={slide?.bgColor ?? theme.bg} onChange={e => { onBgImageChange(undefined); onBgColorChange(e.target.value); }} className="absolute opacity-0 cursor-pointer" style={{ width: '100%', height: '100%', top: 0, left: 0 }}/>
                  </label>
                </Tooltip>
                {/* Photo background */}
                <Tooltip label="Photo background" position="top">
                  <label className="flex items-center justify-center cursor-pointer" style={{ width: 32, height: 32, borderRadius: 7, border: slide?.bgImageUrl ? '2.5px solid #006EFE' : '1.5px solid #E3E6EC', background: slide?.bgImageUrl ? `url(${slide.bgImageUrl}) center/cover` : '#fff', overflow: 'hidden', position: 'relative', boxShadow: slide?.bgImageUrl ? '0 0 0 2px rgba(0,110,254,0.15)' : 'none' }}>
                    {!slide?.bgImageUrl && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8E99AB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>}
                    <input type="file" accept="image/*" className="absolute opacity-0 cursor-pointer" style={{ width: '100%', height: '100%', top: 0, left: 0 }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = ev => { onBgImageChange(ev.target?.result as string); onBgColorChange(undefined); };
                        reader.readAsDataURL(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </Tooltip>
                {(slide?.bgColor || slide?.bgImageUrl) && (
                  <Tooltip label="Reset to theme" position="top">
                    <button onClick={() => { onBgColorChange(undefined); onBgImageChange(undefined); }} className="flex items-center justify-center cursor-pointer" style={{ width: 32, height: 32, borderRadius: 7, border: '1.5px solid #E3E6EC', background: 'none' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8E99AB" strokeWidth="2" strokeLinecap="round"><path d="M3 12a9 9 0 1 1 9 9"/><path d="M3 12V6"/><path d="M3 12H9"/></svg>
                    </button>
                  </Tooltip>
                )}
              </div>
              {/* Revert BG photo to slide photo */}
              {slide?.bgImageUrl && onBgToSlidePhoto && (
                <button onClick={onBgToSlidePhoto} className="flex items-center cursor-pointer" style={{ gap: 5, height: 26, padding: '0 8px', borderRadius: 6, border: '1px solid #E0E5EB', background: 'none', ...ns, fontSize: 11, fontWeight: 500, color: '#52637A' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F4F6F9'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  Use as slide photo instead
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Present overlay ───────────────────────── */

function PresentOverlay({ slides, theme, startIndex, mode, onClose }: {
  slides: PresentationSlide[]; theme: MockTheme; startIndex: number; mode: 'present' | 'presenter'; onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex(i => Math.min(i+1, slides.length-1));
      if (e.key === 'ArrowLeft') setIndex(i => Math.max(i-1, 0));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [slides.length, onClose]);

  const slide = slides[index];
  const nextSlide = slides[index + 1] ?? null;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  if (mode === 'presenter') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex" style={{ background: '#111318' }}>
        {/* Close */}
        <button onClick={onClose} className="absolute flex items-center justify-center cursor-pointer z-10"
          style={{ top: 16, right: 16, width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.09)', border: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        {/* Left — current slide */}
        <div className="flex flex-col items-center justify-center flex-1" style={{ padding: '40px 32px', gap: 16 }}>
          <motion.div key={slide.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}
            className="relative w-full overflow-hidden" style={{ aspectRatio: '16/9', background: slide.bgImageUrl ? `url(${slide.bgImageUrl}) center/cover` : (slide.bgColor ?? theme.bg), borderRadius: 10, boxShadow: '0px 20px 60px rgba(0,0,0,0.55)' }}>
            <SlideContent slide={slide} theme={theme} editable={false}/>
          </motion.div>
          {/* Nav */}
          <div className="flex items-center" style={{ gap: 16 }}>
            <button onClick={() => setIndex(i => Math.max(i-1,0))} disabled={index===0} className="flex items-center justify-center cursor-pointer" style={{ width:38,height:38,borderRadius:'50%',background:'rgba(255,255,255,0.1)',border:'none',opacity:index===0?0.3:1}}><ChevronLR dir="left"/></button>
            <span style={{ ...ns, fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.6)', minWidth: 50, textAlign: 'center' }}>{index+1} / {slides.length}</span>
            <button onClick={() => setIndex(i => Math.min(i+1,slides.length-1))} disabled={index===slides.length-1} className="flex items-center justify-center cursor-pointer" style={{ width:38,height:38,borderRadius:'50%',background:'rgba(255,255,255,0.1)',border:'none',opacity:index===slides.length-1?0.3:1}}><ChevronLR dir="right"/></button>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex flex-col" style={{ width: 280, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.07)', padding: '28px 20px', gap: 20, overflowY: 'auto' }}>
          {/* Timer */}
          <div className="flex flex-col items-center" style={{ padding: '16px 0', borderRadius: 12, background: 'rgba(255,255,255,0.05)' }}>
            <span style={{ ...ns, fontSize: 36, fontWeight: 700, color: '#fff', letterSpacing: 2, lineHeight: 1 }}>{mm}:{ss}</span>
            <span style={{ ...ns, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>elapsed</span>
          </div>

          {/* Next slide */}
          {nextSlide ? (
            <div className="flex flex-col" style={{ gap: 8 }}>
              <span style={{ ...ns, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Up next</span>
              <div style={{ borderRadius: 7, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', opacity: 0.85 }}>
                <SlideThumbnail slide={nextSlide} theme={theme}/>
              </div>
              <span style={{ ...ns, fontSize: 12, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nextSlide.title || `Slide ${index + 2}`}</span>
            </div>
          ) : (
            <div style={{ padding: '16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', textAlign: 'center' }}>
              <span style={{ ...ns, fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Last slide</span>
            </div>
          )}

          {/* Speaker notes */}
          <div className="flex flex-col flex-1" style={{ gap: 8 }}>
            <span style={{ ...ns, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Speaker notes</span>
            <div style={{ flex: 1, padding: '14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', minHeight: 100 }}>
              {slide.notes
                ? <p style={{ ...ns, fontSize: 14, color: 'rgba(255,255,255,0.82)', lineHeight: 1.7, margin: 0 }}>{slide.notes}</p>
                : <p style={{ ...ns, fontSize: 13, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', margin: 0 }}>No notes for this slide</p>
              }
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: '#0B0C0F' }}>
      <button onClick={onClose} className="absolute flex items-center justify-center cursor-pointer" style={{ top: 20, right: 20, width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.1)', border: 'none' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div style={{ width: '84vw', maxWidth: 1100 }}>
        <motion.div key={slide.id} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18 }} className="relative w-full overflow-hidden" style={{ aspectRatio: '16/9', background: slide.bgImageUrl ? `url(${slide.bgImageUrl}) center/cover` : (slide.bgColor ?? theme.bg), borderRadius: 10, boxShadow: '0px 24px 64px rgba(0,0,0,0.5)' }}>
          <SlideContent slide={slide} theme={theme} editable={false}/>
        </motion.div>
        {slide.notes && (
          <div className="flex items-start" style={{ gap: 8, marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.07)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <p style={{ ...ns, fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>{slide.notes}</p>
          </div>
        )}
      </div>
      <div className="flex items-center" style={{ gap: 20, marginTop: 20 }}>
        <button onClick={() => setIndex(i => Math.max(i-1,0))} disabled={index===0} className="flex items-center justify-center cursor-pointer" style={{ width:40,height:40,borderRadius:'50%',background:'rgba(255,255,255,0.1)',border:'none',opacity:index===0?0.3:1}}><ChevronLR dir="left"/></button>
        <span style={{ ...ns, fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)', minWidth: 50, textAlign: 'center' }}>{index+1} / {slides.length}</span>
        <button onClick={() => setIndex(i => Math.min(i+1,slides.length-1))} disabled={index===slides.length-1} className="flex items-center justify-center cursor-pointer" style={{ width:40,height:40,borderRadius:'50%',background:'rgba(255,255,255,0.1)',border:'none',opacity:index===slides.length-1?0.3:1}}><ChevronLR dir="right"/></button>
      </div>
    </motion.div>
  );
}

/* ───────────────────────── Main editor ───────────────────────── */

export function PresentationEditorView() {
  const router = useRouter();
  const sidebarOpen = useFlowStore(s => s.sidebarOpen);
  const setSidebarOpen = useFlowStore(s => s.setSidebarOpen);

  const storeSlides  = usePresentationFlowStore(s => s.slides);
  const storeTitle   = usePresentationFlowStore(s => s.presentationTitle);
  const selectedThemeId    = usePresentationFlowStore(s => s.selectedThemeId);
  const setSelectedThemeId = usePresentationFlowStore(s => s.setSelectedThemeId);
  const setStoreSlides = usePresentationFlowStore(s => s.setSlides);

  const [slides, setSlides]     = useState<PresentationSlide[]>(storeSlides);
  const [zoom, setZoom]         = useState(100);
  const [zoomOpen, setZoomOpen] = useState(false);
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const editorRootRef = useRef<HTMLDivElement>(null);

  // Trackpad pinch-to-zoom: browsers report pinch gestures as wheel events with ctrlKey
  // set to true (also covers ctrl/cmd + scroll-wheel on a mouse), distinct from normal
  // two-finger scrolling which has ctrlKey false. React registers onWheel as a passive
  // listener, so preventDefault() there can't stop the browser's own page zoom — it has
  // to be a native, non-passive listener. The listener is bound to the whole editor (not
  // just the canvas) so that pinching over the side panels/toolbar also gets blocked from
  // triggering the browser's page zoom — but the zoom level itself only changes when the
  // gesture happens over the canvas (center panel), leaving other panels un-zoomed.
  useEffect(() => {
    const root = editorRootRef.current;
    const canvas = canvasScrollRef.current;
    if (!root || !canvas) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (!canvas.contains(e.target as Node)) return;
      setZoom(z => {
        const next = Math.round(z - e.deltaY);
        return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
      });
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, []);
  const [themeOpen, setThemeOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [narratedVideoOpen, setNarratedVideoOpen] = useState(false);
  const [shareLinkOpen, setShareLinkOpen] = useState(false);
  const narrationVersion = usePresentationFlowStore(s => s.narrationVersion);
  const setNarrationVersion = usePresentationFlowStore(s => s.setNarrationVersion);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(slides[0]?.id ?? null);
  const [presentIndex, setPresentIndex]   = useState<number | null>(null);
  const [presentMode, setPresentMode]     = useState<'present' | 'presenter'>('present');
  const [presentMenuOpen, setPresentMenuOpen] = useState(false);
  const presentMenuRef = useRef<HTMLDivElement>(null);
  const [layoutModalSlideId, setLayoutModalSlideId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus]       = useState<'saved' | 'saving'>('saved');
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [generatingAllNotes, setGeneratingAllNotes] = useState(false);
  const [slidePrompt, setSlidePrompt] = useState('');
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [navBarVisible, setNavBarVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  const [aiMessages, setAiMessages] = useState<Array<{role:'user'|'ai';text:string;pills?:string[]}>>([
    { role: 'ai', text: "Hi! I can help you refine your presentation. Ask me to adjust slides, improve content, or generate ideas." }
  ]);
  const [aiInput, setAiInput] = useState('');
  const [notesGenMenuOpen, setNotesGenMenuOpen] = useState(false);
  const notesGenRef = useRef<HTMLDivElement>(null);
  const [generatingSlide, setGeneratingSlide] = useState(false);
  const [pendingGenerateId, setPendingGenerateId] = useState<string | null>(null);
  const [aiRewritingTitle, setAiRewritingTitle] = useState(false);
  const [aiRewritingPointIndex, setAiRewritingPointIndex] = useState<number | null>(null);
  const [aiRewriteUndo, setAiRewriteUndo] = useState<{ type: 'title' | 'point'; slideId: string; index?: number; prevValue: string } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<'slide' | 'text'>('slide');
  const [focusedBlock, setFocusedBlock]   = useState<'title' | 'content' | null>(null);
  // Unified multi-select: each entry is `photo:<id>` or `text:title` / `text:content`.
  // A "single selection" of one photo or one text block drives the existing property
  // panels; 2+ entries means a group is selected (group move + group delete only).
  const [selection, setSelection] = useState<string[]>([]);
  const groupDragStartRef = useRef<{ photos: Record<string, { x: number; y: number }>; title: TextOffset; content: TextOffset } | null>(null);
  const [centerGuides, setCenterGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const [artworkDropActive, setArtworkDropActive] = useState(false);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [textEditorMode, setTextEditorMode] = useState<'panel' | 'bar'>('panel');
  const [notesPanelHeight, setNotesPanelHeight] = useState(90);
  const [leftPanel, setLeftPanel] = useState<'slides' | 'media' | 'templates' | 'text' | 'artworks' | 'settings'>('slides');
  const [settingsLanguage, setSettingsLanguage] = useState('en-US');
  const [settingsTransitionType, setSettingsTransitionType] = useState('fade');
  const [settingsTransitionMs, setSettingsTransitionMs] = useState(600);
  const [settingsDefaultDuration, setSettingsDefaultDuration] = useState(5);
  const [settingsMinDuration, setSettingsMinDuration] = useState(3);
  const [templateDetailId, setTemplateDetailId] = useState<string | null>(null);
  const [checkedSlideIds, setCheckedSlideIds] = useState<string[]>([]);
  const [activeFont, setActiveFont] = useState<string>("'Nunito Sans', sans-serif");
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [mediaTab, setMediaTab] = useState<'upload' | 'search'>('upload');
  const [imageSearchQuery, setImageSearchQuery] = useState('');
  const [imageUrlInput, setImageUrlInput] = useState('');
  const mediaFileRef = useRef<HTMLInputElement>(null);

  const zoomRef   = useRef<HTMLDivElement>(null);
  const themeRef  = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const stageRef  = useRef<HTMLDivElement>(null);
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<PresentationSlide[][]>([JSON.parse(JSON.stringify(storeSlides))]);
  const histIdxRef = useRef(0);
  const notesResizeRef = useRef<{ sy: number; sh: number } | null>(null);

  const NEUTRAL_THEME: MockTheme = { id: 'none', name: 'None', bg: '#FFFFFF', titleColor: '#15191F', accentColor: '#C8CDD9', slides: [] };
  const theme = (selectedThemeId && selectedThemeId !== 'blank') ? (MOCK_THEMES.find(t => t.id === selectedThemeId) ?? MOCK_THEMES[0]) : NEUTRAL_THEME;
  const activeSlide = slides.find(s => s.id === activeSlideId) ?? slides[0] ?? null;
  const activeIndex = slides.findIndex(s => s.id === (activeSlide?.id ?? ''));
  const isMultiSelect = selection.length > 1;
  const selectedPhotoId = selection.length === 1 && selection[0].startsWith('photo:') ? selection[0].slice(6) : null;
  const selectedPhoto = activeSlide?.slidePhotos?.find(p => p.id === selectedPhotoId) ?? null;
  const isKeySelected = (key: string) => selection.includes(key);

  // Generation progress animation on first load
  const [isFirstLoad, setIsFirstLoad] = useState(slides.length > 0);
  const [genProgress, setGenProgress] = useState(4);
  useEffect(() => {
    if (slides.length === 0) { setIsFirstLoad(false); return; }
    let p = 4;
    const iv = setInterval(() => {
      p = Math.min(p + Math.random() * 9 + 2, 91);
      setGenProgress(p);
    }, 140);
    const to = setTimeout(() => {
      clearInterval(iv);
      setGenProgress(100);
      setTimeout(() => setIsFirstLoad(false), 350);
    }, 2400);
    return () => { clearInterval(iv); clearTimeout(to); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The slide box's on-screen width changes whenever surrounding chrome (side panels,
  // window size) changes. Content is authored at a fixed natural width (SLIDE_VIRTUAL_W,
  // shared with SlideThumbnail) and scaled to fit — otherwise fixed/vw-based font sizes
  // stay the same CSS px regardless of the box shrinking, and text wraps instead of scaling.
  const [containerScale, setContainerScale] = useState(1);
  useEffect(() => {
    const el = stageBoxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerScale(entry.contentRect.width / SLIDE_VIRTUAL_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // Re-attach whenever the observed node itself changes: the skeleton (isFirstLoad) renders
    // no stage box at all (ref is null until it clears), and the box remounts on every slide
    // switch (key={activeSlide.id}) — without these deps the observer keeps watching a stale
    // or nonexistent node and containerScale never updates from its default of 1.
  }, [isFirstLoad, activeSlide?.id]);

  // Auto-save + history
  useEffect(() => {
    setSaveStatus('saving');
    const t = setTimeout(() => {
      setStoreSlides(slides); setSaveStatus('saved');
      const last = historyRef.current[histIdxRef.current];
      if (JSON.stringify(last) !== JSON.stringify(slides)) {
        const h = historyRef.current.slice(0, histIdxRef.current + 1);
        h.push(JSON.parse(JSON.stringify(slides)));
        historyRef.current = h; histIdxRef.current = h.length - 1;
        setCanUndo(h.length > 1); setCanRedo(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [slides, setStoreSlides]);

  const downloadBlob = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const safeTitle = (storeTitle || 'presentation').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'presentation';

  const downloadPptx = () => {
    downloadBlob(`${safeTitle}.pptx`, `${storeTitle}\n\n${slides.length} slides.`, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  };

  const downloadPdf = () => {
    downloadBlob(`${safeTitle}.pdf`, `%PDF-1.4\n% ${storeTitle} — ${slides.length} slides`, 'application/pdf');
  };

  const downloadPngImages = () => {
    slides.forEach((slide, i) => {
      setTimeout(() => downloadBlob(`${safeTitle}-slide-${i + 1}.png`, slide.title, 'image/png'), i * 150);
    });
  };

  const undo = () => {
    if (histIdxRef.current <= 0) return;
    histIdxRef.current -= 1;
    setSlides(JSON.parse(JSON.stringify(historyRef.current[histIdxRef.current])));
    setCanUndo(histIdxRef.current > 0); setCanRedo(true);
  };
  const redo = () => {
    if (histIdxRef.current >= historyRef.current.length - 1) return;
    histIdxRef.current += 1;
    setSlides(JSON.parse(JSON.stringify(historyRef.current[histIdxRef.current])));
    setCanUndo(true); setCanRedo(histIdxRef.current < historyRef.current.length - 1);
  };

  // Reset text mode + pending generate when switching slides
  useEffect(() => {
    setRightPanelMode('slide');
    setFocusedBlock(null);
    setSelection([]);
    setPendingGenerateId(null);
    setSlidePrompt('');
  }, [activeSlideId]);

  useEffect(() => {
    if (leftPanel !== 'templates') {
      setTemplateDetailId(null);
      setCheckedSlideIds([]);
    }
  }, [leftPanel]);

  // Close dropdowns
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (zoomRef.current && !zoomRef.current.contains(e.target as Node)) setZoomOpen(false);
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setThemeOpen(false);
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
      if (presentMenuRef.current && !presentMenuRef.current.contains(e.target as Node)) setPresentMenuOpen(false);
            if (notesGenRef.current && !notesGenRef.current.contains(e.target as Node)) setNotesGenMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Keyboard nav + delete + undo/redo
  useEffect(() => {
    if (presentIndex !== null) return;
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.contentEditable === 'true') return;
      if (e.key === 'ArrowDown' && activeIndex < slides.length-1) setActiveSlideId(slides[activeIndex+1].id);
      if (e.key === 'ArrowUp' && activeIndex > 0) setActiveSlideId(slides[activeIndex-1].id);
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeSlide) {
        const photoIdsToRemove = selection.filter(k => k.startsWith('photo:')).map(k => k.slice(6));
        if (photoIdsToRemove.length > 0) {
          e.preventDefault();
          updateSlidePartial(activeSlide.id, { slidePhotos: (activeSlide.slidePhotos ?? []).filter(p => !photoIdsToRemove.includes(p.id)) });
          // Text blocks in a mixed selection aren't deleted (that would destroy slide content) —
          // just drop the removed photos from the selection, keep any selected text selected.
          setSelection(prev => prev.filter(k => !k.startsWith('photo:')));
        } else {
          e.preventDefault();
          removeSlide(activeSlide.id);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [activeIndex, slides, presentIndex, activeSlide, selection]);

  const updateSlidePartial = (id: string, changes: Partial<PresentationSlide>) =>
    setSlides(p => p.map(s => s.id === id ? { ...s, ...changes } : s));

  const genPhotoId = () => `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const addSlidePhoto = (slideId: string, photo: SlidePhotoData) =>
    setSlides(p => p.map(s => s.id === slideId ? { ...s, slidePhotos: [...(s.slidePhotos ?? []), photo] } : s));

  const updateSlidePhoto = (slideId: string, photoId: string, changes: Partial<SlidePhotoData>) =>
    setSlides(p => p.map(s => s.id === slideId ? { ...s, slidePhotos: (s.slidePhotos ?? []).map(ph => ph.id === photoId ? { ...ph, ...changes } : ph) } : s));

  const removeSlidePhoto = (slideId: string, photoId: string) =>
    setSlides(p => p.map(s => s.id === slideId ? { ...s, slidePhotos: (s.slidePhotos ?? []).filter(ph => ph.id !== photoId) } : s));

  // Shared by both the floating photo/icon toolbar (option B) and the right-panel
  // photo section (option A) so the two UIs stay behaviorally identical.
  const handlePhotoColorChange = (color: string) => {
    if (!activeSlide || !selectedPhotoId) return;
    const photo = activeSlide.slidePhotos?.find(p => p.id === selectedPhotoId);
    if (!photo?.iconId) return;
    const icon = ARTWORK_ICONS.find(i => i.id === photo.iconId);
    if (!icon) return;
    updateSlidePhoto(activeSlide.id, selectedPhotoId, { url: artworkIconUri(recolorArtworkSvg(icon.svg, color)), iconColor: color });
  };
  const handlePhotoSetBackground = () => {
    if (!activeSlide || !selectedPhotoId) return;
    const photo = activeSlide.slidePhotos?.find(p => p.id === selectedPhotoId);
    if (!photo) return;
    updateSlidePartial(activeSlide.id, {
      bgImageUrl: photo.url,
      slidePhotos: (activeSlide.slidePhotos ?? []).filter(p => p.id !== selectedPhotoId),
      textColorOverride: '#FFFFFF',
    });
    setSelection([]);
  };
  const handlePhotoResize = (w: number, h: number) => {
    if (!activeSlide || !selectedPhotoId) return;
    updateSlidePhoto(activeSlide.id, selectedPhotoId, { w, h });
  };

  // Group move: snapshot every selected item's starting position, then apply the same
  // raw screen-pixel delta to all of them (converted into each item's own coordinate
  // system — percent-of-stage for photos, offset px for text, matching their solo-drag math).
  const beginGroupDrag = () => {
    if (!activeSlide) return;
    const photos: Record<string, { x: number; y: number }> = {};
    selection.forEach(k => {
      if (!k.startsWith('photo:')) return;
      const p = activeSlide.slidePhotos?.find(ph => ph.id === k.slice(6));
      if (p) photos[p.id] = { x: p.x, y: p.y };
    });
    groupDragStartRef.current = {
      photos,
      title: activeSlide.titleOffset ?? { x: 0, y: 0 },
      content: activeSlide.contentOffset ?? { x: 0, y: 0 },
    };
  };

  const applyGroupDragDelta = (dxPx: number, dyPx: number) => {
    const start = groupDragStartRef.current;
    if (!activeSlide || !start) return;
    const stageRect = stageRef.current?.getBoundingClientRect();
    if (stageRect) {
      const dxPct = dxPx / stageRect.width * 100;
      const dyPct = dyPx / stageRect.height * 100;
      Object.entries(start.photos).forEach(([id, s]) => {
        updateSlidePhoto(activeSlide.id, id, { x: s.x + dxPct, y: s.y + dyPct });
      });
    }
    const textScale = (zoom * containerScale) / 100;
    const updates: Partial<PresentationSlide> = {};
    if (selection.includes(TEXT_TITLE_KEY)) updates.titleOffset = { x: start.title.x + dxPx / textScale, y: start.title.y + dyPx / textScale };
    if (selection.includes(TEXT_CONTENT_KEY)) updates.contentOffset = { x: start.content.x + dxPx / textScale, y: start.content.y + dyPx / textScale };
    if (Object.keys(updates).length) updateSlidePartial(activeSlide.id, updates);
  };

  const updateTitle  = (id: string, v: string) => updateSlidePartial(id, { title: v });
  const updatePoint  = (id: string, i: number, v: string) => setSlides(p => p.map(s => s.id === id ? { ...s, points: s.points.map((pt, j) => j === i ? v : pt) } : s));
  const removePoint  = (id: string, i: number) => setSlides(p => p.map(s => s.id === id ? { ...s, points: s.points.filter((_, j) => j !== i) } : s));
  const updateLayout = (id: string, layout: SlideLayout) => {
    const bulletLayouts: SlideLayout[] = ['standard', 'image-right', 'image-left', 'two-column'];
    const figFamily = figFamilyOf(layout);
    setSlides(p => p.map(s => {
      if (s.id !== id) return s;
      if (figFamily && s.points.length === 0) {
        const seed = FIG_DEFAULT_POINTS[figFamily];
        return { ...s, layout, ...(seed ? { points: seed } : {}) };
      }
      const needsPoints = bulletLayouts.includes(layout) && s.points.length === 0;
      return { ...s, layout, ...(needsPoints ? { points: ['Add a point…'] } : {}) };
    }));
  };
  const updateType   = (id: string, type: SlideType) => updateSlidePartial(id, { type });
  const updateNotes  = (id: string, notes: string) => updateSlidePartial(id, { notes });
  const addPoint = (id: string, text: string) => setSlides(p => p.map(s => s.id === id ? { ...s, points: [...s.points, text] } : s));
  const focusTitle = () => {
    setTimeout(() => {
      const el = stageRef.current?.querySelector<HTMLElement>('[contenteditable]');
      if (el) { el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r); }
    }, 50);
  };

  const handleFontSizeChange = (size: number) => {
    if (!activeSlide) return;
    if (size === 0) {
      updateSlidePartial(activeSlide.id, focusedBlock === 'title' ? { titleFontSize: undefined } : { contentFontSize: undefined });
    } else {
      updateSlidePartial(activeSlide.id, focusedBlock === 'title' ? { titleFontSize: size } : { contentFontSize: size });
    }
  };

  const duplicateSlide = (id: string) => setSlides(p => {
    const i = p.findIndex(s => s.id === id);
    if (i === -1) return p;
    const copy: PresentationSlide = { ...p[i], id: `${id}-copy-${Date.now()}` };
    return [...p.slice(0,i+1), copy, ...p.slice(i+1)];
  });

  const removeSlide = (id: string) => {
    if (slides.length <= 1) return;
    const i = slides.findIndex(s => s.id === id);
    setSlides(p => p.filter(s => s.id !== id));
    if (id === activeSlideId) {
      const next = slides[i+1] ?? slides[i-1];
      if (next) setActiveSlideId(next.id);
    }
  };

  const addSlideAfter = useCallback((id: string) => {
    const blank: PresentationSlide = { id: `blank-${Date.now()}`, title: 'New slide', type: 'content', points: ['Add a point…'], layout: 'standard' };
    setSlides(p => { const i = p.findIndex(s => s.id === id); if (i===-1) return [...p,blank]; return [...p.slice(0,i+1),blank,...p.slice(i+1)]; });
    setActiveSlideId(blank.id);
  }, []);

  const buildSpeakerNotes = (slide: PresentationSlide): string => {
    const pts = slide.points.filter(p => p && p !== 'Add a point…');
    const title = slide.title;

    if (slide.type === 'headline' || pts.length === 0) {
      return `Welcome and thank you for being here. This slide sets the stage for what we're about to cover: ${title}. Take a moment to let the headline land before speaking. You might open with a short anecdote or a surprising stat that connects to this theme — something that makes the audience lean in. Keep this to around 30 seconds, then move on with energy.`;
    }

    const intro = `Let's talk about ${title}. Before you go through the points, pause briefly and make eye contact with the room.`;

    const body = pts.map((pt, i) => {
      const ptLower = pt.charAt(0).toLowerCase() + pt.slice(1);
      if (i === 0) return `Start by addressing ${ptLower} — this is your hook. Give one concrete example or story to make it real for the audience.`;
      if (i === pts.length - 1) return `Close with ${ptLower}. This is your strongest point, so slow down here and let it resonate before transitioning.`;
      return `Next, cover ${ptLower}. Keep this brief — one key idea, ideally backed by a number or a name the audience will recognise.`;
    }).join(' ');

    const outro = `Wrap up by linking back to the headline: "${title}". Invite questions or a nod of acknowledgement before moving to the next slide.`;

    return `${intro} ${body} ${outro}`;
  };

  const generateNotes = () => {
    if (!activeSlide) return;
    setGeneratingNotes(true);
    setTimeout(() => {
      updateNotes(activeSlide.id, buildSpeakerNotes(activeSlide));
      setGeneratingNotes(false);
    }, 1100);
  };

  const generateAllNotes = () => {
    setGeneratingAllNotes(true);
    setTimeout(() => {
      setSlides(prev => prev.map(s => s.notes ? s : { ...s, notes: buildSpeakerNotes(s) }));
      setGeneratingAllNotes(false);
    }, 1600);
  };

  const generateSlideContent = (id: string, prompt: string) => {
    if (!prompt.trim()) return;
    setGeneratingSlide(true);
    setTimeout(() => {
      const topic = prompt.trim();
      updateSlidePartial(id, {
        title: topic.charAt(0).toUpperCase() + topic.slice(1),
        points: [
          `Key insight about ${topic.toLowerCase()}`,
          `Why ${topic.toLowerCase()} matters`,
          `Next steps`,
        ],
      });
      setSlidePrompt('');
      setGeneratingSlide(false);
    }, 1000);
  };

  const aiRewriteTitleText = (title: string): string => {
    const t = title.trim();
    if (/^why\s+/i.test(t)) return t.replace(/^why\s+/i, '') + ' Is Non-Negotiable';
    if (/^how to\s+/i.test(t)) return 'Master ' + t.replace(/^how to\s+/i, '');
    if (/^(the|a|an)\s+/i.test(t)) return 'The ' + t.replace(/^(the|a|an)\s+/i, '') + ' Advantage';
    const endings = [': What Nobody Tells You', ' That Actually Works', ': The Real Story', ' Done Right'];
    return t + endings[Math.floor(Math.random() * endings.length)];
  };

  const aiRewriteBulletText = (bullet: string): string => {
    if (!bullet || bullet === 'Add a point…') return 'Make this your strongest point';
    const clean = bullet.replace(/^(key insight about|the key is|add a|next steps?)\s+/i, '').trim();
    const starters = ['Focus on', 'Lead with', 'Double down on', 'Start with'];
    const enders = [' — drives results', ' — this changes everything', ': non-negotiable', ''];
    const s = starters[Math.floor(Math.random() * starters.length)];
    const e = enders[Math.floor(Math.random() * enders.length)];
    return `${s} ${clean.charAt(0).toLowerCase()}${clean.slice(1)}${e}`;
  };

  const handleAiRewriteTitle = async () => {
    if (!activeSlide || aiRewritingTitle) return;
    const prevValue = activeSlide.title;
    setAiRewritingTitle(true);
    await new Promise(r => setTimeout(r, 900));
    const newTitle = aiRewriteTitleText(prevValue);
    updateTitle(activeSlide.id, newTitle);
    setAiRewritingTitle(false);
    setAiRewriteUndo({ type: 'title', slideId: activeSlide.id, prevValue });
  };

  const handleAiRewritePoint = async (i: number) => {
    if (!activeSlide || aiRewritingPointIndex !== null) return;
    const prevValue = activeSlide.points[i];
    setAiRewritingPointIndex(i);
    await new Promise(r => setTimeout(r, 800));
    const newBullet = aiRewriteBulletText(prevValue);
    updatePoint(activeSlide.id, i, newBullet);
    setAiRewritingPointIndex(null);
    setAiRewriteUndo({ type: 'point', slideId: activeSlide.id, index: i, prevValue });
  };

  const handleAiRewriteUndo = () => {
    if (!aiRewriteUndo) return;
    if (aiRewriteUndo.type === 'title') {
      updateTitle(aiRewriteUndo.slideId, aiRewriteUndo.prevValue);
    } else if (aiRewriteUndo.index !== undefined) {
      updatePoint(aiRewriteUndo.slideId, aiRewriteUndo.index, aiRewriteUndo.prevValue);
    }
    setAiRewriteUndo(null);
  };

  const sendAiMessage = () => {
    const msg = aiInput.trim();
    if (!msg) return;
    setAiMessages(prev => [...prev, { role: 'user', text: msg }]);
    setAiInput('');
    setTimeout(() => {
      const responses = [
        `I've looked at your slides. "${msg}" is a great direction — I'd suggest expanding that point in slide 2 and adding a concrete example.`,
        `Good question! For the slide about "${msg}", try leading with the outcome, not the process. What result does the audience want?`,
        `That's a strong angle. I can help you rewrite the title and bullet points to be more action-oriented. Want me to try?`,
      ];
      setAiMessages(prev => [...prev, { role: 'ai', text: responses[Math.floor(Math.random() * responses.length)] }]);
    }, 900);
  };

  const openAiForSlide = (slide: PresentationSlide, blank = false) => {
    setAiPanelOpen(true);
    const slideNum = slides.findIndex(s => s.id === slide.id) + 1;
    const pts = slide.points.filter(p => p && p !== 'Add a point…');

    if (blank) {
      setAiMessages(prev => [...prev, {
        role: 'ai' as const,
        text: `Slide ${slideNum} is blank. What should it cover? Select a direction or describe it:`,
        pills: ['Key takeaway', 'Supporting evidence', 'Real-world example', 'Call to action'],
      }]);
    } else {
      // Build suggestions from actual content
      const pills: string[] = [];

      // Suggest trimming if too many points
      if (pts.length > 3) {
        pills.push(`Trim to 3 points`);
      } else if (pts.length <= 1) {
        pills.push('Add 2 more points');
      }

      // Reference the first bullet if it exists
      if (pts[0]) {
        const shortPt = pts[0].replace(/^(how to|the|a|an|why|what|when|where|who)\s+/i, '').split(/\s+/).slice(0, 5).join(' ');
        pills.push(`Expand on "${shortPt}"`);
      }

      // Suggest a stat if no number exists in points
      const hasNumber = pts.some(p => /\d/.test(p));
      if (!hasNumber) pills.push('Add a supporting stat');

      // Suggest title improvement based on type
      if (slide.type === 'headline') {
        pills.push('Make the title more compelling');
      } else {
        pills.push('Rewrite as a stronger headline');
      }

      // Pad to 4 with useful fallbacks
      const fallbacks = ['Add a real example', 'Make it more concise', 'Strengthen the opening', 'Add a story'];
      while (pills.length < 4) {
        const fb = fallbacks.find(f => !pills.includes(f));
        if (fb) pills.push(fb); else break;
      }

      setAiMessages(prev => [...prev, {
        role: 'ai' as const,
        text: `Let's work on slide ${slideNum}: "${slide.title}". Here are some ways to improve it:`,
        pills: pills.slice(0, 4),
      }]);
    }
  };

  const isBlankSlide = (s: PresentationSlide) =>
    s.title === 'New slide' || (s.title === '' && s.points.length === 0) || (s.points.length > 0 && s.points.every(p => p === 'Add a point…'));

  const handleAddTemplateSlides = (mode: 'add' | 'replace' = 'add') => {
    const tmpl = MOCK_THEMES.find(t => t.id === templateDetailId);
    if (!tmpl) return;
    // Full spread — a slide's look (bg/photo/fonts/alignment) lives in these fields, not just
    // title/type/points/layout, so applying a template must carry all of it or slides render
    // as plain text instead of matching what the template preview showed.
    const toAdd = tmpl.slides
      .filter(s => checkedSlideIds.length === 0 || checkedSlideIds.includes(s.id))
      .map(s => ({
        ...s,
        id: `${s.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        points: [...s.points],
      } as PresentationSlide));
    if (mode === 'replace') {
      setSlides(toAdd);
    } else {
      setSlides(prev => {
        const idx = prev.findIndex(s => s.id === activeSlideId);
        const insertAt = idx >= 0 ? idx + 1 : prev.length;
        const next = [...prev];
        next.splice(insertAt, 0, ...toAdd);
        return next;
      });
    }
    setActiveSlideId(toAdd[0].id);
    setLeftPanel('slides');
  };

  const layoutModalSlide = slides.find(s => s.id === layoutModalSlideId) ?? null;

  const dragProps: DragProps | undefined = activeSlide ? {
    stageRef,
    zoom: zoom * containerScale,
    titleOffset: activeSlide.titleOffset,
    contentOffset: activeSlide.contentOffset,
    onTitleOffsetChange: (o) => updateSlidePartial(activeSlide.id, { titleOffset: o }),
    onContentOffsetChange: (o) => updateSlidePartial(activeSlide.id, { contentOffset: o }),
    onBlockFocus: (block) => { setFocusedBlock(block); setRightPanelMode('text'); setSelection([textKey(block)]); },
    focusedBlock,
    onGuideChange: setCenterGuides,
    isSelected: (block) => isKeySelected(textKey(block)),
    onShiftSelect: (block) => setSelection(prev => prev.includes(textKey(block)) ? prev.filter(k => k !== textKey(block)) : [...prev, textKey(block)]),
    groupDragActive: (block) => isMultiSelect && isKeySelected(textKey(block)),
    onGroupDragStart: beginGroupDrag,
    onGroupDragMove: applyGroupDragDelta,
    onGroupDragEnd: () => { groupDragStartRef.current = null; },
  } : undefined;

  if (slides.length === 0) {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="flex-1 flex items-center justify-center">
          <button onClick={() => router.push('/presentation')} className="cursor-pointer" style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', height: 38, padding: '0 20px', borderRadius: 8, border: 'none', background: '#006EFE' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0058CC'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>Start a presentation</button>
        </div>
      </div>
    );
  }

  return (
    <div ref={editorRootRef} className="h-full flex flex-col bg-white">
      {/* ── Bar 1: Navigation (hides on scroll down) ── */}
      <div className="flex-shrink-0" style={{ overflow: (exportOpen || presentMenuOpen) ? 'visible' : 'hidden', transition: 'max-height 0.25s ease' }}>
        <motion.div
          animate={{ marginTop: navBarVisible ? 0 : -56 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="flex items-center border-b border-border-light bg-white"
          style={{ height: 56, padding: '0 16px' }}
        >
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center justify-center cursor-pointer flex-shrink-0"
            style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F4F6F9'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
          >
            <SideMenuIcon active={sidebarOpen}/>
          </button>

          <div className="flex-shrink-0" style={{ marginLeft: 8 }}>
            <AIButton label="Wordgenie" onClick={() => setAiPanelOpen(v => !v)} active={aiPanelOpen} />
          </div>

          <div className="flex-1"/>

          <div className="flex items-center flex-shrink-0" style={{ gap: 8 }}>
            <div ref={presentMenuRef} className="relative">
              <button onClick={() => setPresentMenuOpen(v => !v)} className="flex items-center cursor-pointer" style={{ gap: 6, height: 34, padding: '0 16px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F4F6F9'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                <PlayIcon/><span style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#001633' }}>Present</span>
                <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke="#001633" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {presentMenuOpen && (
                <div className="absolute bg-white flex flex-col" style={{ top: 'calc(100% + 4px)', left: 0, zIndex: 30, width: 210, padding: 5, borderRadius: 9, border: '1px solid #E8EBF2', boxShadow: '0px 8px 24px rgba(15,23,51,0.14)' }}>
                  {([
                    { mode: 'present' as const, label: 'Present', sub: 'Fullscreen, audience view', icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="3" width="16" height="11" rx="1.5" fill="#006EFE" opacity="0.12"/><rect x="2" y="3" width="16" height="11" rx="1.5" stroke="#006EFE" strokeWidth="1.4"/><path d="M8 6l5 3-5 3V6z" fill="#006EFE"/></svg> },
                    { mode: 'presenter' as const, label: 'Presenter view', sub: 'Notes + next slide', icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="1" y="3" width="10" height="8" rx="1.5" fill="#7C5CFC" opacity="0.12"/><rect x="1" y="3" width="10" height="8" rx="1.5" stroke="#7C5CFC" strokeWidth="1.4"/><rect x="13" y="3" width="6" height="4" rx="1" fill="#7C5CFC" opacity="0.18"/><rect x="13" y="3" width="6" height="4" rx="1" stroke="#7C5CFC" strokeWidth="1.2"/><rect x="13" y="9" width="6" height="5" rx="1" fill="#7C5CFC" opacity="0.1"/><rect x="13" y="9" width="6" height="5" rx="1" stroke="#7C5CFC" strokeWidth="1.2" strokeDasharray="2 1.5"/></svg> },
                  ]).map(item => (
                    <button key={item.mode} onClick={() => { setPresentMode(item.mode); setPresentIndex(activeIndex >= 0 ? activeIndex : 0); setPresentMenuOpen(false); }}
                      className="flex items-center w-full cursor-pointer text-left" style={{ gap: 10, padding: '8px 10px', borderRadius: 6, border: 'none', background: 'none' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#F5F7FA'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                      {item.icon}
                      <div className="flex flex-col" style={{ gap: 1 }}>
                        <span style={{ ...ns, fontSize: 13, fontWeight: 500, color: '#1F2532' }}>{item.label}</span>
                        <span style={{ ...ns, fontSize: 11, color: '#9AA5B4' }}>{item.sub}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div ref={exportRef} className="relative">
              <button onClick={() => setExportOpen(v => !v)} className="flex items-center cursor-pointer" style={{ gap: 7, height: 34, padding: '0 16px', borderRadius: 8, border: 'none', background: '#006EFE' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#0058CC'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
                <span style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#fff' }}>{narrationVersion === '2' ? 'Share' : 'Publish'}</span>
                <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {exportOpen && (
                <div className="absolute bg-white flex flex-col" style={{ top: 'calc(100% + 4px)', right: 0, zIndex: 30, width: 270, padding: 5, borderRadius: 9, border: '1px solid #E8EBF2', boxShadow: '0px 8px 24px rgba(15,23,51,0.14)' }}>
                  {([
                    { label: 'Download PowerPoint', badgeBg: '#FBDCCD', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C4551B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="13" rx="2"/>
                        <path d="M9.5 8.5v5l4.5-2.5-4.5-2.5z" fill="#C4551B" stroke="none"/>
                        <path d="M8 20h8"/>
                      </svg>
                    ), onClick: () => { downloadPptx(); setExportOpen(false); } },
                    { label: 'Download PDF', badgeBg: '#FBD0D0', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C22525" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/>
                        <path d="M14 3v5h5"/>
                        <path d="M9 13h6M9 16.5h4"/>
                      </svg>
                    ), onClick: () => { downloadPdf(); setExportOpen(false); } },
                    { label: 'Download PNG images', badgeBg: '#C6DDFC', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="16" rx="2"/>
                        <circle cx="8.5" cy="9.5" r="1.4" fill="#1D4ED8" stroke="none"/>
                        <path d="M21 15.5l-5.5-5.5a1 1 0 0 0-1.4 0L6 18"/>
                      </svg>
                    ), onClick: () => { downloadPngImages(); setExportOpen(false); } },
                    { label: 'Copy link', badgeBg: '#EAF2FF', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M15 7h2a5 5 0 1 1 0 10h-2" stroke="#006EFE" strokeWidth="1.8" strokeLinecap="round"/>
                        <path d="M9 17H7A5 5 0 0 1 7 7h2" stroke="#006EFE" strokeWidth="1.8" strokeLinecap="round"/>
                        <line x1="8" y1="12" x2="16" y2="12" stroke="#006EFE" strokeWidth="1.8" strokeLinecap="round"/>
                      </svg>
                    ), onClick: () => { setExportOpen(false); setShareLinkOpen(true); } },
                  ] as { label: string; badgeBg: string; icon: React.ReactNode; onClick: () => void }[]).map(item => (
                    <button key={item.label} onClick={item.onClick} className="flex items-center w-full cursor-pointer text-left" style={{ gap: 10, padding: '7px 10px', borderRadius: 6, border: 'none', background: 'none' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#F5F7FA'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: item.badgeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {item.icon}
                      </div>
                      <span style={{ ...ns, fontSize: 13, fontWeight: 500, color: '#1F2532' }}>{item.label}</span>
                    </button>
                  ))}
                  {narrationVersion === '1' && (
                    <>
                      <div style={{ borderTop: '1px solid #F0F2F5', margin: '3px 0' }}/>
                      <button onClick={() => { setExportOpen(false); setNarratedVideoOpen(true); }} className="flex items-center w-full cursor-pointer text-left" style={{ gap: 10, padding: '7px 10px', borderRadius: 6, border: 'none', background: 'none' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#F5F7FA'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: '#DDD3FC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                            <path d="M6.5 5.5l7 4.5-7 4.5v-9z" fill="#7C5CFC" />
                          </svg>
                        </div>
                        <div className="flex flex-col" style={{ gap: 1 }}>
                          <span style={{ ...ns, fontSize: 13, fontWeight: 500, color: '#1F2532' }}>Narrated Video</span>
                          <span style={{ ...ns, fontSize: 11, color: '#9AA5B4' }}>Record a voiceover, export as video</span>
                        </div>
                      </button>
                    </>
                  )}
                  {(narrationVersion === '2' || narrationVersion === '3' || narrationVersion === '4') && (
                    <>
                      <div style={{ borderTop: '1px solid #F0F2F5', margin: '3px 0' }}/>
                      <button onClick={() => { setExportOpen(false); router.push(`/presentation/narration?v=${narrationVersion}`); }} className="flex items-center w-full cursor-pointer text-left" style={{ gap: 10, padding: '7px 10px', borderRadius: 6, border: 'none', background: 'none' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#F5F7FA'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: '#DDD3FC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                            <rect x="2" y="6" width="13" height="12" rx="2.5" fill="#7C5CFC"/>
                            <path d="M15 9L21 6V18L15 15V9Z" fill="#7C5CFC"/>
                          </svg>
                        </div>
                        <div className="flex flex-col" style={{ gap: 1 }}>
                          <span style={{ ...ns, fontSize: 13, fontWeight: 500, color: '#1F2532' }}>Create video</span>
                          <span style={{ ...ns, fontSize: 11, color: '#9AA5B4' }}>Record a voiceover, export as video</span>
                        </div>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Bar 2: Editor toolbar (always visible) ── */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-border-light bg-white" style={{ height: 46, padding: '0 16px' }}>
        {/* Left: Last edited | slide count | save status */}
        <div className="flex items-center" style={{ gap: 0 }}>
          <span style={{ ...ns, fontSize: 13, color: '#52637A', fontWeight: 400 }}>Last edited: <span style={{ fontWeight: 500 }}>now</span></span>

          <div style={{ width: 1, height: 18, background: '#E8EBF2', margin: '0 12px', flexShrink: 0 }}/>

          <div className="flex items-center" style={{ gap: 5 }}>
            <svg width="13" height="16" viewBox="11 9.5 10.5 13.5" fill="none"><path d="M20.1102 20.6701V14.4479H17.388C16.7439 14.4479 16.2214 13.9253 16.2214 13.2813V10.559H13.1102C12.68 10.559 12.3325 10.9066 12.3325 11.3368V20.6701C12.3325 21.1003 12.68 21.4479 13.1102 21.4479H19.3325C19.7627 21.4479 20.1102 21.1003 20.1102 20.6701ZM20.0981 13.6701C20.0811 13.6021 20.047 13.5389 19.996 13.4903L17.179 10.6733C17.128 10.6222 17.0672 10.5882 16.9991 10.5712V13.2813C16.9991 13.4951 17.1741 13.6701 17.388 13.6701H20.0981ZM11.5547 11.3368C11.5547 10.4788 12.2523 9.78125 13.1102 9.78125H16.9043C17.213 9.78125 17.5095 9.90521 17.7283 10.124L20.5453 12.9385C20.7641 13.1573 20.888 13.4538 20.888 13.7625V20.6701C20.888 21.5281 20.1905 22.2257 19.3325 22.2257H13.1102C12.2523 22.2257 11.5547 21.5281 11.5547 20.6701V11.3368Z" fill="#8596AD"/></svg>
            <span style={{ ...ns, fontSize: 13, color: '#52637A', fontWeight: 500 }}>{slides.length} slide{slides.length !== 1 ? 's' : ''}</span>
          </div>

          <div style={{ width: 1, height: 18, background: '#E8EBF2', margin: '0 12px', flexShrink: 0 }}/>

          <div className="flex items-center" style={{ gap: 5 }}>
            {saveStatus === 'saving' ? (
              <motion.div key="saving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center" style={{ gap: 5 }}>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8E99AB" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-9-9"/></svg>
                </motion.div>
                <span style={{ ...ns, fontSize: 13, color: '#8E99AB', fontWeight: 500 }}>Saving…</span>
              </motion.div>
            ) : (
              <motion.div key="saved" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center" style={{ gap: 5 }}>
                <SavedIcon/>
                <span style={{ ...ns, fontSize: 13, color: '#29A341', fontWeight: 500 }}>Saved</span>
              </motion.div>
            )}
          </div>
        </div>

        {/* Right: undo | redo | | zoom */}
        <div className="flex items-center" style={{ gap: 2 }}>
          <Tooltip label="Undo (⌘Z)" position="bottom">
            <button onClick={undo} disabled={!canUndo} className="flex items-center justify-center cursor-pointer" style={{ width: 30, height: 30, borderRadius: 7, border: 'none', background: 'none', opacity: canUndo ? 1 : 0.35 }}
              onMouseEnter={e => { if (canUndo) e.currentTarget.style.background = '#F4F6F9'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
              <UndoIcon disabled={!canUndo}/>
            </button>
          </Tooltip>
          <Tooltip label="Redo (⌘⇧Z)" position="bottom">
            <button onClick={redo} disabled={!canRedo} className="flex items-center justify-center cursor-pointer" style={{ width: 30, height: 30, borderRadius: 7, border: 'none', background: 'none', opacity: canRedo ? 1 : 0.35 }}
              onMouseEnter={e => { if (canRedo) e.currentTarget.style.background = '#F4F6F9'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
              <RedoIcon disabled={!canRedo}/>
            </button>
          </Tooltip>

          {/* A/B toggle — disabled for now, option A (right panel) only. textEditorMode defaults to
              'panel' above. Restore this block (and its flanking dividers) to bring back the A/B
              switch and floating-toolbar (option B) mode:
          <div style={{ width: 1, height: 18, background: '#E8EBF2', margin: '0 6px', flexShrink: 0 }}/>
          <div className="flex items-center" style={{ gap: 1, height: 26, padding: 2, borderRadius: 8, background: '#F0F2F5', flexShrink: 0 }}>
            {([['panel', 'A'], ['bar', 'B']] as const).map(([mode, label]) => {
              const active = textEditorMode === mode;
              return (
                <Tooltip key={mode} label={mode === 'panel' ? 'Right panel' : 'Floating toolbar'} position="bottom">
                  <button
                    onClick={() => setTextEditorMode(mode)}
                    className="cursor-pointer"
                    style={{ ...ns, width: 24, height: 22, borderRadius: 6, border: 'none', fontSize: 11.5, fontWeight: 700,
                      background: active ? '#fff' : 'transparent', color: active ? '#006EFE' : '#8C97A8',
                      boxShadow: active ? '0px 1px 3px rgba(15,23,51,0.16)' : 'none', transition: 'all 0.15s' }}
                  >
                    {label}
                  </button>
                </Tooltip>
              );
            })}
          </div>
          <div style={{ width: 1, height: 18, background: '#E8EBF2', margin: '0 6px', flexShrink: 0 }}/>
          */}

          {/* Zoom picker */}
          <div ref={zoomRef} className="relative">
            <button onClick={() => setZoomOpen(v => !v)} className="flex items-center cursor-pointer" style={{ gap: 5, height: 30, padding: '0 10px', borderRadius: 7, border: 'none', background: 'none' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F4F6F9'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/></svg>
              <span style={{ ...ns, fontSize: 13, fontWeight: 500, color: '#29323D' }}>{zoom}%</span>
              <ChevronDown/>
            </button>
            {zoomOpen && (
              <div className="absolute bg-white flex flex-col" style={{ top: 'calc(100% + 6px)', right: 0, zIndex: 30, minWidth: 96, padding: 5, borderRadius: 9, border: '1px solid #E8EBF2', boxShadow: '0px 8px 24px rgba(15,23,51,0.12)' }}>
                {ZOOM_OPTIONS.map(lv => (
                  <button key={lv} onClick={() => { setZoom(lv); setZoomOpen(false); }} className="text-left cursor-pointer" style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: zoom === lv ? '#F2F7FF' : 'transparent', ...ns, fontSize: 13, fontWeight: zoom === lv ? 600 : 400, color: '#15191F' }}>{lv}%</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>{/* end bar 2 */}

      {/* Generation progress bar */}
      {isFirstLoad && (
        <div className="flex-shrink-0 flex items-center border-b border-border-light" style={{ height: 40, padding: '0 20px', gap: 10, background: '#fff' }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7C5CFC" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-9-9"/></svg>
          </motion.div>
          <span style={{ ...ns, fontSize: 13, fontWeight: 500, color: '#52637A', flexShrink: 0 }}>Generating slides…</span>
          <div className="flex-1 relative" style={{ height: 5, background: '#EEF0F3', borderRadius: 99, overflow: 'hidden' }}>
            <motion.div
              style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, #9B6EFD, #7C5CFC)', borderRadius: 99, width: `${genProgress}%` }}
              animate={{ width: `${genProgress}%` }}
              transition={{ duration: 0.15, ease: 'linear' }}
            />
          </div>
          <span style={{ ...ns, fontSize: 12, fontWeight: 500, color: '#8E99AB', flexShrink: 0 }}>
            {slides.length} slides · {Math.round(genProgress)}%
          </span>
        </div>
      )}

      {/* Body: nav bar | left panel | center column | right panel */}
      <div className="flex-1 flex min-w-0 overflow-hidden">

        {/* Left icon nav bar */}
        <div className="flex-shrink-0 h-full flex flex-col items-center bg-white" style={{ width: NAV_W, borderRight: '1px solid #ECEEF2', paddingTop: 10, paddingBottom: 10 }}>
          {/* Main nav items */}
          <div className="flex flex-col items-center flex-1" style={{ gap: 2, width: '100%', paddingLeft: 8, paddingRight: 8 }}>
            {/* Slides */}
            {(() => {
              const isSlidesActive = leftPanel === 'slides';
              return (
                <button onClick={() => setLeftPanel('slides')}
                  style={{ width: '100%', height: 58, borderRadius: 12, border: 'none', background: isSlidesActive ? '#EEF3FF' : 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', color: isSlidesActive ? '#006EFE' : '#6B7280', flexShrink: 0 }}
                  onMouseEnter={e => { if (!isSlidesActive) e.currentTarget.style.background = '#F5F6F8'; }}
                  onMouseLeave={e => { if (!isSlidesActive) e.currentTarget.style.background = 'transparent'; }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="15" rx="2"/><polyline points="8 21 12 17 16 21"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                  <span style={{ ...ns, fontSize: 10.5, fontWeight: 600 }}>Slides</span>
                </button>
              );
            })()}

            {([
              { id: 'templates' as const, label: 'Templates',
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12c0 5.52 4.48 10 10 10 .83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z" stroke="currentColor"/><circle cx="6.5" cy="11.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="9.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="14.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="17.5" cy="11.5" r="1.5" fill="currentColor" stroke="none"/></svg> },
              { id: 'text'     as const, label: 'Text styles',
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg> },
              { id: 'media'    as const, label: 'Media',
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
              { id: 'artworks' as const, label: 'Artworks',
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2-4.5-4.4 6.2-.9L12 3.5z"/></svg> },
            ] as { id: 'media'|'templates'|'text'|'artworks'; label: string; icon: React.ReactNode }[]).map(item => {
              const isActive = leftPanel === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setLeftPanel(item.id)}
                  style={{ width: '100%', height: 58, borderRadius: 12, border: 'none', background: isActive ? '#EEF3FF' : 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', color: isActive ? '#006EFE' : '#6B7280', flexShrink: 0 }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F5F6F8'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  {item.icon}
                  <span style={{ ...ns, fontSize: 10.5, fontWeight: 600 }}>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Bottom: Settings */}
          <div style={{ width: '100%', paddingLeft: 8, paddingRight: 8, paddingBottom: 8, marginTop: 'auto' }}>
            <div style={{ height: 1, background: '#ECEEF2', marginBottom: 8 }}/>
            {(() => {
              const isActive = leftPanel === 'settings';
              return (
                <button
                  onClick={() => setLeftPanel('settings')}
                  style={{ width: '100%', height: 52, borderRadius: 12, border: 'none', background: isActive ? '#EEF3FF' : 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', color: isActive ? '#006EFE' : '#6B7280' }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F5F6F8'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  <span style={{ ...ns, fontSize: 10.5, fontWeight: 600 }}>Settings</span>
                </button>
              );
            })()}
          </div>
        </div>

        {/* Left panel — switches between filmstrip and other panels */}
        <AnimatePresence mode="wait">
          {leftPanel === 'slides' ? (
            <motion.div key="slides" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
              className="flex-shrink-0 h-full overflow-y-auto border-r border-border-light bg-white" style={{ width: aiPanelOpen ? 160 : FILMSTRIP_W, transition: 'width 0.22s cubic-bezier(0.2,0,0.2,1)' }}
              onScroll={e => {
                const y = (e.currentTarget as HTMLElement).scrollTop;
                if (y > lastScrollYRef.current + 8) setNavBarVisible(false);
                else if (y < lastScrollYRef.current - 8) setNavBarVisible(true);
                lastScrollYRef.current = y;
              }}>
              <div style={{ padding: '12px 10px 10px' }}>
                <button
                  onClick={() => { const b: PresentationSlide = {id:`blank-${Date.now()}`,title:'New slide',type:'content',points:['Add a point…'],layout:'standard'}; setSlides(p=>[b,...p]); setActiveSlideId(b.id); }}
                  className="flex items-center justify-center w-full cursor-pointer"
                  style={{ gap: 5, height: 28, borderRadius: 6, border: '1px solid #E0E5EB', background: '#fff', marginBottom: 10 }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#E0E5EB'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="#52637A" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  <span style={{ ...ns, fontSize: 11.5, fontWeight: 600, color: '#001633' }}>Add slide</span>
                </button>
                <Reorder.Group as="div" axis="y" values={slides} onReorder={setSlides} style={{ display:'flex', flexDirection:'column', alignItems: 'stretch' }}>
                  {slides.map((s, i) => (
                    <FilmstripItem key={s.id} slide={s} theme={theme} index={i} isActive={s.id===activeSlideId}
                      loading={isFirstLoad}
                      onClick={() => setActiveSlideId(s.id)}
                      isBlank={isBlankSlide(s)}
                      onGenerate={() => { setActiveSlideId(s.id); openAiForSlide(s, isBlankSlide(s)); }}
                      onDuplicate={() => duplicateSlide(s.id)}
                      onRemove={() => removeSlide(s.id)}
                      onAddAfter={() => addSlideAfter(s.id)}
                      onAddWithAI={() => {
                        const newSlide: PresentationSlide = { id: `blank-${Date.now()}`, title: 'New slide', type: 'content', points: ['Add a point…'], layout: 'standard' };
                        setSlides(prev => {
                          const idx = prev.findIndex(sl => sl.id === s.id);
                          const next = [...prev];
                          next.splice(idx + 1, 0, newSlide);
                          return next;
                        });
                        setActiveSlideId(newSlide.id);
                        setTimeout(() => openAiForSlide(newSlide, true), 50);
                      }}
                    />
                  ))}
                </Reorder.Group>
              </div>
            </motion.div>
          ) : (
            <motion.div key={leftPanel} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15, ease: [0.2, 0, 0.2, 1] }}
              className="flex-shrink-0 h-full flex flex-col bg-white border-r border-border-light overflow-hidden" style={{ width: aiPanelOpen ? 160 : FILMSTRIP_W, transition: 'width 0.22s cubic-bezier(0.2,0,0.2,1)' }}>
              <div className="flex-shrink-0" style={{ padding: '14px 16px 12px', borderBottom: '1px solid #F0F2F5' }}>
                {leftPanel === 'templates' && templateDetailId ? (() => {
                  const tmpl = MOCK_THEMES.find(t => t.id === templateDetailId);
                  const allSelected = tmpl ? checkedSlideIds.length === tmpl.slides.length : false;
                  return (
                    <>
                      <button onClick={() => setTemplateDetailId(null)} className="flex items-center cursor-pointer" style={{ gap: 4, border: 'none', background: 'none', padding: 0, marginBottom: 10, ...ns, fontSize: 11.5, fontWeight: 500, color: '#8E99AB' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8E99AB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                        Templates
                      </button>
                      <div className="flex items-center justify-between" style={{ marginBottom: 2 }}>
                        <span style={{ ...ns, fontSize: 15, fontWeight: 700, color: '#15191F' }}>{tmpl?.name ?? ''}</span>
                        <button onClick={() => setCheckedSlideIds(allSelected ? [] : (tmpl?.slides.map(s => s.id) ?? []))} className="cursor-pointer" style={{ border: 'none', background: 'none', padding: 0, ...ns, fontSize: 11.5, fontWeight: 600, color: '#006EFE' }}>
                          {allSelected ? 'Deselect all' : 'Select all'}
                        </button>
                      </div>
                    </>
                  );
                })() : (
                  <span style={{ ...ns, fontSize: 14, fontWeight: 700, color: '#15191F' }}>
                    {leftPanel === 'templates' ? 'Templates' : leftPanel === 'media' ? 'Upload' : leftPanel === 'text' ? 'Text Presets' : leftPanel === 'artworks' ? 'Artworks' : 'Settings'}
                  </span>
                )}
              </div>
              <div className={`flex-1 min-h-0 ${leftPanel === 'templates' && templateDetailId ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`} style={{ padding: leftPanel === 'templates' && templateDetailId ? 0 : '12px 16px 16px' }}>
                {/* Templates — list */}
                {leftPanel === 'templates' && !templateDetailId && (
                  <div className="flex flex-col" style={{ gap: 10 }}>
                    {MOCK_THEMES.filter(t => t.id !== 'blank').map(t => (
                      <button key={t.id} onClick={() => { setTemplateDetailId(t.id); setCheckedSlideIds([]); }} className="w-full cursor-pointer text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
                        <div style={{ borderRadius: 10, border: '1px solid #E8EBF2', overflow: 'hidden', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#006EFE'; e.currentTarget.style.boxShadow = '0px 4px 12px rgba(0,110,254,0.12)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8EBF2'; e.currentTarget.style.boxShadow = 'none'; }}>
                          <SlideThumbnail slide={t.slides[0] as unknown as PresentationSlide} theme={t} rounded={false}/>
                        </div>
                        <div style={{ padding: '7px 2px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: '#15191F' }}>{t.name}</span>
                          <span style={{ ...ns, fontSize: 11, fontWeight: 500, color: '#8E99AB', background: '#F4F5F7', borderRadius: 4, padding: '2px 6px' }}>{t.slides.length} slides</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {/* Templates — detail */}
                {leftPanel === 'templates' && templateDetailId && (() => {
                  const tmpl = MOCK_THEMES.find(t => t.id === templateDetailId);
                  if (!tmpl) return null;
                  return (
                    <>
                      <div className="flex-1 overflow-y-auto" style={{ padding: '14px 16px 0' }}>
                        <div className="flex flex-col" style={{ gap: 14 }}>
                          {tmpl.slides.map(s => {
                            const isChecked = checkedSlideIds.includes(s.id);
                            const layoutLabel =
                              s.layout === 'big-title' ? 'Title' :
                              s.layout === 'centered' ? 'Centered' :
                              s.layout === 'image-right' ? 'Image Right' :
                              s.layout === 'image-left' ? 'Image Left' :
                              s.layout === 'two-column' ? 'Two Columns' :
                              s.layout === 'split' ? 'Split' :
                              s.layout === 'minimal' ? 'Minimal' :
                              s.type === 'headline' ? 'Headline' : 'Content';
                            return (
                              <div key={s.id} className="cursor-pointer" onClick={() => setCheckedSlideIds(prev => prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id])}>
                                <div className="relative" style={{ borderRadius: 8, overflow: 'hidden', outline: isChecked ? '2.5px solid #006EFE' : '2px solid #E8EBF2', transition: 'outline-color 0.12s' }}>
                                  <SlideThumbnail slide={s as unknown as PresentationSlide} theme={tmpl} rounded={false}/>
                                  <div style={{ position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 4,
                                    background: isChecked ? '#006EFE' : 'rgba(17,20,32,0.5)',
                                    border: '1.5px solid rgba(255,255,255,0.9)', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.12s' }}>
                                    {isChecked && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6.5l2.8 2.5 5-5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                  </div>
                                </div>
                                <span style={{ ...ns, fontSize: 11, fontWeight: 500, color: '#52637A', display: 'block', marginTop: 5, paddingLeft: 2 }}>{layoutLabel}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex flex-col items-center" style={{ padding: '12px 16px', borderTop: '1px solid #F0F2F5', gap: 8 }}>
                        <button onClick={() => handleAddTemplateSlides('add')} className="w-full cursor-pointer" style={{ height: 38, borderRadius: 8, border: 'none', background: '#006EFE', ...ns, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', transition: 'background 0.15s' }}>
                          {checkedSlideIds.length === 0 || checkedSlideIds.length === tmpl.slides.length
                            ? 'Add all to deck'
                            : `Add ${checkedSlideIds.length} slide${checkedSlideIds.length !== 1 ? 's' : ''} to deck`}
                        </button>
                        <button onClick={() => handleAddTemplateSlides('replace')} className="w-full cursor-pointer" style={{ height: 38, borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', ...ns, fontSize: 13, fontWeight: 600, color: '#52637A', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#C8CDD9'; e.currentTarget.style.background = '#F7F8FA'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E0E5EB'; e.currentTarget.style.background = '#fff'; }}>
                          Replace all slides instead
                        </button>
                      </div>
                    </>
                  );
                })()}

                  {/* Text Presets */}
                  {leftPanel === 'text' && (
                    <div className="flex flex-col" style={{ gap: 8 }}>
                      {[
                        { label: 'Add a heading', style: { fontSize: 22, fontWeight: 700, color: '#15191F' }, text: 'Add a heading…' },
                        { label: 'Add a subheading', style: { fontSize: 16, fontWeight: 600, color: '#15191F' }, text: 'Add a subheading…' },
                        { label: 'Add body text', style: { fontSize: 13, fontWeight: 400, color: '#52637A' }, text: 'Add a point…' },
                      ].map(preset => (
                        <button key={preset.label} onClick={() => { if (activeSlide) { updateSlidePartial(activeSlide.id, { points: [...activeSlide.points, preset.text] }); setLeftPanel('slides'); } }} className="w-full cursor-pointer text-left" style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid #E8EBF2', background: '#fff' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#006EFE'; e.currentTarget.style.background = '#F8FBFF'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8EBF2'; e.currentTarget.style.background = '#fff'; }}>
                          <span style={{ ...ns, ...preset.style }}>{preset.label}</span>
                        </button>
                      ))}
                      <p style={{ ...ns, fontSize: 11, fontWeight: 600, color: '#A0AABA', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 8, marginBottom: 4 }}>Font styles</p>
                      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {[
                          { name: 'Default', sample: 'Aa', font: "'Nunito Sans', sans-serif", weight: 600 },
                          { name: 'Serif', sample: 'Aa', font: 'Georgia, serif', weight: 600 },
                          { name: 'Mono', sample: 'Aa', font: "'Courier New', monospace", weight: 600 },
                          { name: 'Display', sample: 'Aa', font: 'Impact, sans-serif', weight: 700 },
                        ].map(f => {
                          const isActive = activeFont === f.font;
                          return (
                          <button key={f.name} onClick={() => setActiveFont(f.font)} className="cursor-pointer flex flex-col items-center" style={{ padding: '14px 10px 10px', borderRadius: 10, border: isActive ? '1.5px solid #006EFE' : '1px solid #E8EBF2', background: isActive ? '#F0F6FF' : '#fff', gap: 6 }}
                            onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = '#006EFE'; e.currentTarget.style.background = '#F8FBFF'; } }}
                            onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = '#E8EBF2'; e.currentTarget.style.background = '#fff'; } }}>
                            <span style={{ fontFamily: f.font, fontSize: 26, fontWeight: f.weight, color: '#15191F', lineHeight: 1 }}>{f.sample}</span>
                            <span style={{ ...ns, fontSize: 11, color: isActive ? '#006EFE' : '#52637A', fontWeight: isActive ? 600 : 500 }}>{f.name}</span>
                          </button>
                        );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Media panel — 4 tabs */}
                  {leftPanel === 'media' && (
                    <MediaPanel
                      activeSlide={activeSlide}
                      uploadedImages={uploadedImages}
                      setUploadedImages={setUploadedImages}
                      mediaFileRef={mediaFileRef}
                      onImageSelect={url => {
                        if (!activeSlide) return;
                        const existing = activeSlide.slidePhotos?.length ?? 0;
                        const offset = (existing % 6) * 4;
                        addSlidePhoto(activeSlide.id, { id: genPhotoId(), url, x: Math.min(50, 10 + offset), y: Math.min(35, 10 + offset), w: 45, h: 60 });
                      }}
                    />
                  )}

                  {/* Artworks panel */}
                  {leftPanel === 'artworks' && (
                    <ArtworksPanel
                      onIconSelect={icon => {
                        if (!activeSlide) return;
                        const selected = activeSlide.slidePhotos?.find(p => p.id === selectedPhotoId);
                        if (selected?.iconId) {
                          // An icon is focused — swap its artwork in place, keeping position/size/color.
                          const color = selected.iconColor ?? ARTWORK_ICON_DEFAULT_COLOR;
                          updateSlidePhoto(activeSlide.id, selected.id, { url: artworkIconUri(recolorArtworkSvg(icon.svg, color)), iconId: icon.id, iconColor: color });
                        } else {
                          // Nothing focused — add a new icon, cascading position so repeated inserts don't stack exactly.
                          const existing = activeSlide.slidePhotos?.length ?? 0;
                          const offset = (existing % 6) * 4;
                          const iconW = icon.defaultWidthPct ?? 16, iconH = squareIconHeightPct(iconW);
                          addSlidePhoto(activeSlide.id, { id: genPhotoId(), url: artworkIconUri(icon.svg), iconId: icon.id, iconColor: ARTWORK_ICON_DEFAULT_COLOR, x: Math.min(79, 10 + offset), y: Math.min(67, 10 + offset), w: iconW, h: iconH });
                        }
                      }}
                    />
                  )}

                  {/* Settings */}
                  {leftPanel === 'settings' && (
                    <div className="flex flex-col" style={{ gap: 28 }}>
                      {/* Language */}
                      <div>
                        <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
                          <SettingsGlobeIcon />
                          <span style={{ ...ns, fontSize: 14.5, fontWeight: 700, color: '#15191F' }}>Language</span>
                        </div>
                        <LanguageSelect value={settingsLanguage} onChange={setSettingsLanguage} />
                        <SettingsSectionDivider />
                        <p style={{ ...ns, fontSize: 12.5, color: '#8996AC', lineHeight: 1.5, margin: 0 }}>
                          Sets the narration voice and text-to-speech pronunciation.
                        </p>
                      </div>

                      {/* Transition */}
                      <div>
                        <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
                          <SettingsTransitionIcon />
                          <span style={{ ...ns, fontSize: 14.5, fontWeight: 700, color: '#15191F' }}>Transition</span>
                        </div>
                        <div className="flex items-center" style={{ gap: 8 }}>
                          <TransitionTypeSelect value={settingsTransitionType} onChange={setSettingsTransitionType} />
                          <SettingsNumberField value={settingsTransitionMs} onChange={setSettingsTransitionMs} min={0} max={3000} width={64} />
                          <span style={{ ...ns, fontSize: 13, color: '#52637A', flexShrink: 0 }}>ms</span>
                        </div>
                        <SettingsSectionDivider />
                        <p style={{ ...ns, fontSize: 12.5, color: '#8996AC', lineHeight: 1.5, margin: 0 }}>
                          Applied between slides during playback and video export.
                        </p>
                      </div>

                      {/* Default slide duration */}
                      <div>
                        <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
                          <SettingsClockIcon />
                          <span style={{ ...ns, fontSize: 14.5, fontWeight: 700, color: '#15191F' }}>Default slide duration</span>
                        </div>
                        <div className="flex items-center" style={{ gap: 8 }}>
                          <SettingsNumberField value={settingsDefaultDuration} onChange={setSettingsDefaultDuration} min={1} max={60} width={72} />
                          <span style={{ ...ns, fontSize: 13, color: '#52637A', flexShrink: 0 }}>s</span>
                        </div>
                        <SettingsSectionDivider />
                        <p style={{ ...ns, fontSize: 12.5, color: '#8996AC', lineHeight: 1.5, margin: 0 }}>
                          How long a slide without narration stays on screen.
                        </p>
                      </div>

                      {/* Minimum slide duration */}
                      <div>
                        <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
                          <SettingsClockHistoryIcon />
                          <span style={{ ...ns, fontSize: 14.5, fontWeight: 700, color: '#15191F' }}>Minimum slide duration</span>
                        </div>
                        <div className="flex items-center" style={{ gap: 8 }}>
                          <SettingsNumberField
                            value={settingsMinDuration}
                            onChange={v => { setSettingsMinDuration(v); if (v > settingsDefaultDuration) setSettingsDefaultDuration(v); }}
                            min={1}
                            max={settingsDefaultDuration}
                            width={72}
                          />
                          <span style={{ ...ns, fontSize: 13, color: '#52637A', flexShrink: 0 }}>s</span>
                        </div>
                        <SettingsSectionDivider />
                        <p style={{ ...ns, fontSize: 12.5, color: '#8996AC', lineHeight: 1.5, margin: 0 }}>
                          A slide never displays shorter than this, so it does not flash by.
                        </p>
                      </div>
                    </div>
                  )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Chat panel — opens to the right of slides/themes panel */}
        <div
          className="flex-shrink-0 flex flex-col bg-white overflow-hidden"
          style={{ width: aiPanelOpen ? 300 : 0, borderRight: aiPanelOpen ? '1px solid #E8EBF2' : 'none', transition: 'width 0.22s cubic-bezier(0.2,0,0.2,1)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between flex-shrink-0" style={{ padding: '14px 16px', borderBottom: '1px solid #F0F2F5', minWidth: 300 }}>
            <div className="flex items-center" style={{ gap: 7 }}>
              <AISparkleIcon size={16}/>
              <span style={{ ...ns, fontSize: 14, fontWeight: 700, color: '#15191F' }}>Wordgenie</span>
            </div>
            <button onClick={() => setAiPanelOpen(false)} className="flex items-center justify-center cursor-pointer" style={{ width: 26, height: 26, borderRadius: 7, background: '#F5F7FA', border: 'none' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto flex flex-col" style={{ padding: 16, gap: 12, minWidth: 300 }}>
            {aiMessages.map((msg, i) => (
              <div key={i} className="flex flex-col" style={{ alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 8 }}>
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`} style={{ width: '100%' }}>
                  {msg.role === 'ai' && (
                    <div className="flex items-end flex-shrink-0" style={{ marginRight: 7, marginBottom: 2 }}>
                      <div className="flex items-center justify-center" style={{ width: 22, height: 22, borderRadius: '50%', background: '#F0EEFF' }}>
                        <AISparkleIcon size={13}/>
                      </div>
                    </div>
                  )}
                  <div style={{ maxWidth: '82%', padding: '9px 12px', lineHeight: 1.5, borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px', background: msg.role === 'user' ? '#006EFE' : '#F4F6F9', ...ns, fontSize: 13, color: msg.role === 'user' ? '#fff' : '#1F2532' }}>
                    {msg.text}
                  </div>
                </div>
                {msg.pills && (
                  <div className="flex flex-wrap" style={{ gap: 6, paddingLeft: 29 }}>
                    {msg.pills.map(pill => (
                      <button key={pill}
                        onClick={() => { setAiMessages(prev => [...prev, { role: 'user', text: pill }]); setTimeout(() => { setAiMessages(prev => [...prev, { role: 'ai', text: `Got it — working on "${pill}" for this slide…` }]); }, 600); }}
                        className="cursor-pointer"
                        style={{ ...ns, fontSize: 12, fontWeight: 500, color: '#7C5CFC', padding: '5px 11px', borderRadius: 20, border: '1.5px solid #DDD0FB', background: '#F9F7FF', textAlign: 'left' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#F0EEFF'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#F9F7FF'; }}
                      >{pill}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Input */}
          <div className="flex-shrink-0" style={{ padding: '12px 16px', borderTop: '1px solid #F0F2F5', minWidth: 300 }}>
            <div className="flex items-center" style={{ gap: 8, background: '#F4F6F9', borderRadius: 10, padding: '8px 12px' }}>
              <input value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendAiMessage(); }} placeholder="Ask about your presentation..." className="flex-1 outline-none bg-transparent" style={{ ...ns, fontSize: 13, color: '#1F2532', border: 'none' }}/>
              <button onClick={sendAiMessage} disabled={!aiInput.trim()} className="flex items-center justify-center cursor-pointer flex-shrink-0" style={{ width: 28, height: 28, borderRadius: 7, background: aiInput.trim() ? '#006EFE' : '#E0E5EB', border: 'none' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Canvas column */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ position: 'relative' }}>

            {/* Text format bar (mode B) — absolutely positioned so it floats without shifting layout */}
            {textEditorMode === 'bar' && rightPanelMode === 'text' && !isMultiSelect && activeSlide && (
              <div style={{ position: 'absolute', top: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 40, pointerEvents: 'none' }}>
                <div style={{ pointerEvents: 'auto' }}>
                  <TextFormatBar
                    slide={activeSlide}
                    theme={theme}
                    focusedBlock={focusedBlock}
                    onFontFamilyChange={family => updateSlidePartial(activeSlide.id, focusedBlock === 'title' ? { titleFontFamily: family } : { contentFontFamily: family })}
                    onFontWeightChange={weight => updateSlidePartial(activeSlide.id, focusedBlock === 'title' ? { titleFontWeight: weight } : { contentFontWeight: weight })}
                    onFontSizeChange={handleFontSizeChange}
                    onTextColorChange={color => updateSlidePartial(activeSlide.id, { textColorOverride: color })}
                    onListStyleChange={style => updateSlidePartial(activeSlide.id, { listStyle: style })}
                    onTextAlignChange={align => updateSlidePartial(activeSlide.id, focusedBlock === 'title' ? { titleTextAlign: align } : { contentTextAlign: align })}
                  />
                </div>
              </div>
            )}

            {/* Photo/icon format bar (mode B) — same floating slot as the text bar, so exactly one shows at a time */}
            {textEditorMode === 'bar' && selectedPhoto && selectedPhoto.w > 0 && (
              <div style={{ position: 'absolute', top: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 40, pointerEvents: 'none' }}>
                <div data-photo-format-bar style={{ pointerEvents: 'auto' }}>
                  <PhotoFormatBar
                    photo={selectedPhoto}
                    isIcon={!!selectedPhoto.iconId}
                    onColorChange={selectedPhoto.iconId ? handlePhotoColorChange : undefined}
                    onSetBackground={handlePhotoSetBackground}
                    onResize={handlePhotoResize}
                  />
                </div>
              </div>
            )}

            {/* Canvas */}
            <div
              ref={canvasScrollRef}
              className="flex-1 overflow-auto"
              style={{ background: '#EDEEF1' }}
              onFocusCapture={e => { if ((e.target as HTMLElement).contentEditable === 'true') { setRightPanelMode('text'); setSelection([]); } }}
              onBlurCapture={e => {
                const related = e.relatedTarget as HTMLElement | null;
                // If focus moved outside this canvas area (e.g. to the formatting panel), stay in text mode
                if (related && !(e.currentTarget as HTMLElement).contains(related)) return;
                setRightPanelMode('slide'); setFocusedBlock(null);
              }}
            >
              {/* Inner centering wrapper: 100% when zoom ≤ 100, zoom% when larger (enabling scroll) */}
              <div style={{ width: zoom > 100 ? `${zoom}%` : '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 48px', boxSizing: 'border-box' }}>
              {isFirstLoad ? (
                /* Skeleton canvas */
                <div style={{ width: '100%', paddingBottom: '56.25%', position: 'relative' }}><div style={{ position: 'absolute', inset: 0, background: '#fff', borderRadius: 14, boxShadow: '0px 8px 40px rgba(15,23,51,0.16)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                  <div className="animate-pulse" style={{ height: 28, width: '52%', borderRadius: 6, background: '#E8EAEF' }}/>
                  <div className="animate-pulse" style={{ height: 16, width: '36%', borderRadius: 4, background: '#EEF0F3' }}/>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, width: '44%' }}>
                    <div className="animate-pulse" style={{ height: 10, width: '100%', borderRadius: 3, background: '#F1F2F5' }}/>
                    <div className="animate-pulse" style={{ height: 10, width: '80%', borderRadius: 3, background: '#F1F2F5' }}/>
                    <div className="animate-pulse" style={{ height: 10, width: '90%', borderRadius: 3, background: '#F1F2F5' }}/>
                  </div>
                </div></div>
              ) : activeSlide && (
                <div className="flex flex-col items-center" style={{ gap: 14, width: zoom <= 100 ? `${zoom}%` : '100%', minWidth: 280, flexShrink: 0 }}>
                  {/* Padding-bottom trick: height = 56.25% of width = exact 16:9 */}
                  <motion.div ref={stageBoxRef} key={activeSlide.id} initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.16 }}
                    style={{ width: '100%', paddingBottom: '56.25%', position: 'relative', flexShrink: 0, borderRadius: 14, boxShadow: '0px 8px 40px rgba(15,23,51,0.16)', overflow: 'clip' }}
                  >
                    {/* stageRef renders at a fixed natural slide size (SLIDE_VIRTUAL_W) then scales
                        by the box's actual measured width (containerScale) times the manual zoom
                        control, so text/layout scale with both the panel layout and zoom. */}
                    <div ref={stageRef} style={{ position: 'absolute', top: 0, left: 0, width: SLIDE_VIRTUAL_W, height: SLIDE_VIRTUAL_W * 9 / 16, transform: `scale(${containerScale * zoom / 100})`, transformOrigin: 'top left' }}>
                      {/* Clip inner content to slide bounds */}
                      <div
                        style={{ position: 'absolute', inset: 0, borderRadius: 14, overflow: 'hidden', background: activeSlide.bgImageUrl ? `url(${activeSlide.bgImageUrl}) center/cover` : (activeSlide.bgColor ?? (selectedThemeId ? theme.bg : '#FFFFFF')), outline: artworkDropActive ? '2.5px dashed #006EFE' : 'none', outlineOffset: -2 }}
                        onDragOver={e => {
                          if (e.dataTransfer.types.includes(ARTWORK_DND_TYPE)) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'copy';
                            setArtworkDropActive(true);
                          }
                        }}
                        onDragLeave={() => setArtworkDropActive(false)}
                        onPointerDownCapture={e => {
                          // Dragging any one of several selected photos/icons moves the whole group.
                          if (e.shiftKey || selection.length < 2) return;
                          const el = (e.target as HTMLElement).closest('[data-select-key]') as HTMLElement | null;
                          const key = el?.getAttribute('data-select-key');
                          if (!key || !key.startsWith('photo:') || !selection.includes(key)) return;
                          e.preventDefault();
                          e.stopPropagation();
                          beginGroupDrag();
                          const startX = e.clientX, startY = e.clientY;
                          const onMove = (ev: PointerEvent) => applyGroupDragDelta(ev.clientX - startX, ev.clientY - startY);
                          const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); groupDragStartRef.current = null; };
                          window.addEventListener('pointermove', onMove);
                          window.addEventListener('pointerup', onUp);
                        }}
                        onPointerDown={e => {
                          // Marquee-select: drag from empty background to select everything inside the box.
                          // A plain click (no drag) on empty background clears the current selection.
                          if ((e.target as HTMLElement).closest('[data-select-key], button, [contenteditable="true"]')) return;
                          const startX = e.clientX, startY = e.clientY;
                          let moved = false;
                          setMarquee({ x0: startX, y0: startY, x1: startX, y1: startY });
                          const onMove = (ev: PointerEvent) => {
                            if (!moved && (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3)) moved = true;
                            setMarquee({ x0: startX, y0: startY, x1: ev.clientX, y1: ev.clientY });
                          };
                          const onUp = (ev: PointerEvent) => {
                            window.removeEventListener('pointermove', onMove);
                            window.removeEventListener('pointerup', onUp);
                            if (moved) {
                              const left = Math.min(startX, ev.clientX), right = Math.max(startX, ev.clientX);
                              const top = Math.min(startY, ev.clientY), bottom = Math.max(startY, ev.clientY);
                              const matched: string[] = [];
                              stageRef.current?.querySelectorAll('[data-select-key]').forEach(node => {
                                const r = node.getBoundingClientRect();
                                if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) {
                                  const k = node.getAttribute('data-select-key');
                                  if (k) matched.push(k);
                                }
                              });
                              setSelection(matched);
                            } else {
                              setSelection([]);
                              setFocusedBlock(null);
                              setRightPanelMode('slide');
                              (document.activeElement as HTMLElement)?.blur?.();
                            }
                            setMarquee(null);
                          };
                          window.addEventListener('pointermove', onMove);
                          window.addEventListener('pointerup', onUp);
                        }}
                        onDrop={e => {
                          setArtworkDropActive(false);
                          const iconId = e.dataTransfer.getData(ARTWORK_DND_TYPE);
                          const icon = ARTWORK_ICONS.find(i => i.id === iconId);
                          if (!icon) return;
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const w = 16, h = squareIconHeightPct(w);
                          const x = Math.max(0, Math.min(95 - w, (e.clientX - rect.left) / rect.width * 100 - w / 2));
                          const y = Math.max(0, Math.min(95 - h, (e.clientY - rect.top) / rect.height * 100 - h / 2));
                          addSlidePhoto(activeSlide.id, { id: genPhotoId(), url: artworkIconUri(icon.svg), iconId: icon.id, iconColor: ARTWORK_ICON_DEFAULT_COLOR, x, y, w, h });
                        }}
                      >
                      <SlideContent slide={activeSlide} theme={theme} editable onTitleChange={v=>updateTitle(activeSlide.id,v)} onPointChange={(idx,v)=>updatePoint(activeSlide.id,idx,v)} onPointDelete={idx=>removePoint(activeSlide.id,idx)} dragProps={dragProps} onImageClick={() => setLeftPanel('media')} onAiRewriteTitle={handleAiRewriteTitle} onAiRewritePoint={handleAiRewritePoint} aiRewritingTitle={aiRewritingTitle} aiRewritingPointIndex={aiRewritingPointIndex}/>
                      {/* Floating photo layers — one per inserted photo/icon */}
                      {(activeSlide.slidePhotos ?? []).filter(p => p.w > 0).map(p => (
                        <PhotoLayer
                          key={p.id}
                          photo={p}
                          editable
                          selected={isKeySelected(photoKey(p.id))}
                          onSelectedChange={(v, shiftKey) => {
                            if (!v) { setSelection([]); return; }
                            if (shiftKey) {
                              setSelection(prev => prev.includes(photoKey(p.id)) ? prev.filter(k => k !== photoKey(p.id)) : [...prev, photoKey(p.id)]);
                              return;
                            }
                            setSelection([photoKey(p.id)]);
                            setFocusedBlock(null);
                            setRightPanelMode('slide');
                            (document.activeElement as HTMLElement)?.blur?.();
                          }}
                          onPhotoChange={np => np.w === 0 ? removeSlidePhoto(activeSlide.id, p.id) : updateSlidePhoto(activeSlide.id, p.id, np)}
                          onGuideChange={setCenterGuides}
                        />
                      ))}
                      {/* "Revert from background" overlay */}
                      {activeSlide.bgImageUrl && (
                        <div className="group/bgbadge absolute" style={{ bottom: 8, right: 8, zIndex: 20 }}>
                          <button
                            onClick={() => {
                              addSlidePhoto(activeSlide.id, { id: genPhotoId(), url: activeSlide.bgImageUrl!, x: 10, y: 10, w: 45, h: 60 });
                              updateSlidePartial(activeSlide.id, { bgImageUrl: undefined, textColorOverride: undefined });
                            }}
                            className="flex items-center cursor-pointer opacity-0 group-hover/bgbadge:opacity-100 transition-opacity"
                            style={{ gap: 5, height: 24, padding: '0 10px', borderRadius: 6, border: 'none', background: 'rgba(15,25,47,0.65)', backdropFilter: 'blur(4px)', ...ns, fontSize: 11, fontWeight: 500, color: '#fff' }}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            Use as slide photo
                          </button>
                        </div>
                      )}

                      {/* Center alignment guides */}
                      {centerGuides.x && (
                        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 0, borderLeft: '1px dashed #FF3D8A', boxShadow: '0 0 4px rgba(255,61,138,0.6)', zIndex: 40, pointerEvents: 'none' }}/>
                      )}
                      {centerGuides.y && (
                        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 0, borderTop: '1px dashed #FF3D8A', boxShadow: '0 0 4px rgba(255,61,138,0.6)', zIndex: 40, pointerEvents: 'none' }}/>
                      )}
                      </div>{/* end inner clip */}
                    </div>{/* end stageRef */}
                  </motion.div>

                  {/* Slide action bar — unified pill below slide */}
                  <div className="flex items-center bg-white" style={{ borderRadius: 10, boxShadow: '0px 2px 12px rgba(15,23,51,0.1)', overflow: 'hidden', border: '1px solid #ECEEF2', width: 'max-content', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    <Tooltip label={isBlankSlide(activeSlide) ? 'Generate content' : 'Regenerate content'} position="top">
                      <button
                        onClick={() => openAiForSlide(activeSlide, isBlankSlide(activeSlide))}
                        className="flex items-center cursor-pointer"
                        style={{ gap: 6, height: 34, padding: '0 14px', border: 'none', borderRight: '1px solid #ECEEF2', background: 'none', ...ns, fontSize: 12.5, fontWeight: 600, color: '#7C5CFC' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#F6F3FF'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                      >
                        <AISparkleIcon size={13}/>
                        {isBlankSlide(activeSlide) ? 'Generate content' : 'Regenerate content'}
                      </button>
                    </Tooltip>
                    <Tooltip label="Duplicate slide" position="top">
                      <button
                        onClick={() => duplicateSlide(activeSlide.id)}
                        className="flex items-center cursor-pointer"
                        style={{ gap: 6, height: 34, padding: '0 14px', border: 'none', borderRight: '1px solid #ECEEF2', background: 'none', ...ns, fontSize: 12.5, fontWeight: 600, color: '#3D4A5C' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#F5F7FA'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                      >
                        <DuplicateIcon color="#3D4A5C"/>Duplicate
                      </button>
                    </Tooltip>
                    <Tooltip label="Delete slide" position="top">
                      <button
                        onClick={() => removeSlide(activeSlide.id)}
                        className="flex items-center cursor-pointer"
                        style={{ gap: 6, height: 34, padding: '0 14px', border: 'none', background: 'none', ...ns, fontSize: 12.5, fontWeight: 600, color: '#E54B4B' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#FFF5F5'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                      >
                        <TrashIcon color="#E54B4B"/>Delete
                      </button>
                    </Tooltip>
                  </div>

                  {/* AI rewrite undo chip */}
                  <AnimatePresence>
                    {aiRewriteUndo && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 340, damping: 26 }}
                        className="flex items-center"
                        style={{ gap: 10, background: '#1A1F2E', borderRadius: 9, padding: '8px 14px', boxShadow: '0px 4px 16px rgba(0,0,0,0.28)' }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="#a78bfa"><path d="M12 2L13.5 9L20 12L13.5 15L12 22L10.5 15L4 12L10.5 9Z"/></svg>
                        <span style={{ ...ns, fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>
                          {aiRewriteUndo.type === 'title' ? 'Title' : 'Bullet'} rewritten
                        </span>
                        <button
                          onClick={handleAiRewriteUndo}
                          style={{ ...ns, fontSize: 13, color: '#93c5fd', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#bfdbfe'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#93c5fd'; }}
                        >
                          Undo
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              </div>{/* end inner centering wrapper */}
            </div>{/* end canvas */}

            {/* Notes bar — resizable */}
            <div className="flex-shrink-0 flex flex-col border-t border-border-light bg-white relative" style={{ height: notesPanelHeight }}>
              {/* Resize handle */}
              <div
                className="absolute top-0 left-0 right-0 flex items-center justify-center cursor-row-resize"
                style={{ height: 8, zIndex: 5 }}
                onPointerDown={e => {
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  notesResizeRef.current = { sy: e.clientY, sh: notesPanelHeight };
                }}
                onPointerMove={e => {
                  if (!notesResizeRef.current) return;
                  const dy = notesResizeRef.current.sy - e.clientY;
                  setNotesPanelHeight(Math.max(60, Math.min(300, notesResizeRef.current.sh + dy)));
                }}
                onPointerUp={() => { notesResizeRef.current = null; }}
              >
                <div style={{ width: 32, height: 3, borderRadius: 2, background: '#D8DCE4', marginTop: 2 }}/>
              </div>
              <div className="flex flex-col flex-1 min-h-0" style={{ padding: '10px 20px 10px', paddingTop: 12 }}>
                <div className="flex items-center justify-between flex-shrink-0" style={{ marginBottom: 4 }}>
                  <span style={{ ...ns, fontSize: 10.5, fontWeight: 700, color: '#A0AABA', letterSpacing: 0.5, textTransform: 'uppercase' }}>Notes</span>
                  {/* Generate notes dropdown */}
                  <div ref={notesGenRef} className="relative flex-shrink-0">
                  <button
                    onClick={() => setNotesGenMenuOpen(v => !v)}
                    disabled={(generatingNotes || generatingAllNotes) || !activeSlide}
                    className="flex items-center cursor-pointer"
                    style={{ gap: 6, border: 'none', background: 'none', opacity: !activeSlide ? 0.5 : 1, padding: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '0.75'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = !activeSlide ? '0.5' : '1'; }}
                  >
                    {(generatingNotes || generatingAllNotes) ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round"><defs><linearGradient id="spinGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#006EFE"/><stop offset="100%" stopColor="#5326BD"/></linearGradient></defs><path d="M21 12a9 9 0 1 1-9-9" stroke="url(#spinGrad)"/></svg>
                      </motion.div>
                    ) : <AISparkleIcon size={13}/>}
                    <span style={{ ...ns, fontSize: 12, fontWeight: 600, color: '#7C5CFC', whiteSpace: 'nowrap' }}>
                      {generatingNotes ? 'Generating…' : generatingAllNotes ? 'Generating all…' : 'Generate notes'}
                    </span>
                    <svg width="7" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke="#8596AD" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  {notesGenMenuOpen && (
                    <div className="absolute bg-white flex flex-col" style={{ bottom: 'calc(100% + 6px)', right: 0, width: 168, borderRadius: 9, border: '1px solid #E8EBF2', boxShadow: '0px 8px 24px rgba(15,23,51,0.14)', padding: 4, zIndex: 30 }}>
                      <button onClick={() => { generateNotes(); setNotesGenMenuOpen(false); }} className="flex items-center cursor-pointer text-left w-full" style={{ gap: 8, padding: '7px 10px', borderRadius: 6, border: 'none', background: 'none', ...ns, fontSize: 13, fontWeight: 500, color: '#1F2532' }} onMouseEnter={e => { e.currentTarget.style.background = '#F5F0FF'; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                        <AISparkleIcon size={13}/>This slide
                      </button>
                      <button onClick={() => { generateAllNotes(); setNotesGenMenuOpen(false); }} className="flex items-center cursor-pointer text-left w-full" style={{ gap: 8, padding: '7px 10px', borderRadius: 6, border: 'none', background: 'none', ...ns, fontSize: 13, fontWeight: 500, color: '#1F2532' }} onMouseEnter={e => { e.currentTarget.style.background = '#F5F0FF'; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                        <AISparkleIcon size={13}/>All slides
                      </button>
                    </div>
                  )}
                </div>
                </div>
                <textarea
                  key={activeSlide?.id}
                  value={activeSlide?.notes ?? ''}
                  onChange={e => activeSlide && updateNotes(activeSlide.id, e.target.value)}
                  placeholder="Add speaker notes for this slide..."
                  className="flex-1 resize-none outline-none bg-transparent"
                  style={{ ...ns, fontSize: 13, fontWeight: 400, color: '#3D4A5C', lineHeight: 1.55 }}
                />
              </div>
            </div>{/* end notes bar */}

          </div>{/* end canvas column */}

        {/* Right panel */}
        <div style={{ width: aiPanelOpen ? 0 : RIGHT_PANEL_W, flexShrink: 0, overflow: 'hidden', transition: 'width 0.22s cubic-bezier(0.2,0,0.2,1)' }}>
        <RightPanel
          slide={activeSlide}
          theme={theme}
          onLayoutChange={l => activeSlide && updateLayout(activeSlide.id, l)}
          onTypeChange={t => {
            if (!activeSlide) return;
            const noPoints = !activeSlide.points || activeSlide.points.length === 0;
            updateSlidePartial(activeSlide.id, {
              type: t,
              layout: t === 'headline' ? 'centered' : 'standard',
              ...(t === 'content' && noPoints ? { points: ['Add a point…'] } : {}),
            });
          }}
          rightPanelMode={(textEditorMode === 'bar' || isMultiSelect) ? 'slide' : rightPanelMode}
          focusedBlock={focusedBlock}
          selectedPhotoId={textEditorMode === 'panel' ? selectedPhotoId : null}
          onPhotoColorChange={handlePhotoColorChange}
          onPhotoSetBackground={handlePhotoSetBackground}
          onPhotoResize={handlePhotoResize}
          onFontSizeChange={handleFontSizeChange}
          onFontFamilyChange={family => { if (!activeSlide) return; updateSlidePartial(activeSlide.id, focusedBlock === 'title' ? { titleFontFamily: family } : { contentFontFamily: family }); }}
          onFontWeightChange={weight => { if (!activeSlide) return; updateSlidePartial(activeSlide.id, focusedBlock === 'title' ? { titleFontWeight: weight } : { contentFontWeight: weight }); }}
          onTextColorChange={color => { if (!activeSlide) return; updateSlidePartial(activeSlide.id, { textColorOverride: color }); }}
          onListStyleChange={style => { if (!activeSlide) return; updateSlidePartial(activeSlide.id, { listStyle: style }); }}
          onTextAlignChange={align => { if (!activeSlide) return; updateSlidePartial(activeSlide.id, focusedBlock === 'title' ? { titleTextAlign: align } : { contentTextAlign: align }); }}
          onThemeChange={setSelectedThemeId}
          onBgColorChange={color => {
            if (!activeSlide) return;
            const updates: Partial<import('@/stores/presentationFlowStore').PresentationSlide> = { bgColor: color };
            if (color && color.startsWith('#')) {
              updates.textColorOverride = isDark(color) ? '#FFFFFF' : '#15191F';
            } else if (!color) {
              updates.textColorOverride = undefined;
            }
            updateSlidePartial(activeSlide.id, updates);
          }}
          onBgImageChange={url => {
            if (!activeSlide) return;
            updateSlidePartial(activeSlide.id, { bgImageUrl: url, textColorOverride: url ? '#FFFFFF' : undefined });
          }}
          onBgToSlidePhoto={activeSlide?.bgImageUrl ? () => {
            if (!activeSlide) return;
            addSlidePhoto(activeSlide.id, { id: genPhotoId(), url: activeSlide.bgImageUrl!, x: 10, y: 10, w: 45, h: 60 });
            updateSlidePartial(activeSlide.id, { bgImageUrl: undefined, textColorOverride: undefined });
          } : undefined}
          onContentAlignChange={align => activeSlide && updateSlidePartial(activeSlide.id, { contentAlign: align })}
        />
        </div>

      {narratedVideoOpen && (
        <NarratedVideoModal onClose={() => setNarratedVideoOpen(false)} />
      )}

      <ShareLinkModal
        isOpen={shareLinkOpen}
        onClose={() => setShareLinkOpen(false)}
        url="https://designrr.io/present/klimiashvilinn_568/casper-weldings-overview"
      />

      {/* Marquee-select rectangle — fixed to the viewport so it stays correct regardless
          of the canvas's zoom/scale transforms. */}
      {marquee && (
        <div style={{
          position: 'fixed', zIndex: 999, pointerEvents: 'none',
          left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1),
          width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0),
          border: '1.5px solid #006EFE', background: 'rgba(0,110,254,0.08)', borderRadius: 2,
        }}/>
      )}

      {/* Prototype-only: flip voiceover flow version */}
      <div style={{ position: 'fixed', bottom: 18, right: 18, zIndex: 100, display: 'flex', alignItems: 'center', gap: 2,
        background: '#0D1433', borderRadius: 999, padding: 4, boxShadow: '0 8px 28px rgba(15,23,51,0.35)' }}>
        {([['1', 'V1 · current'], ['2', 'V2 · concept'], ['3', 'V3 · studio'], ['4', 'V4 · refined']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setNarrationVersion(v)}
            style={{ ...ns, height: 28, padding: '0 13px', borderRadius: 999, border: 'none', cursor: 'pointer',
              fontSize: 11.5, fontWeight: 700, transition: 'all 0.15s',
              background: narrationVersion === v ? '#fff' : 'transparent',
              color: narrationVersion === v ? '#0D1433' : 'rgba(255,255,255,0.65)' }}>
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {presentIndex !== null && <PresentOverlay slides={slides} theme={theme} startIndex={presentIndex} mode={presentMode} onClose={() => setPresentIndex(null)}/>}
        {layoutModalSlide && (
          <LayoutSwitcherModal
            key={layoutModalSlide.id}
            currentLayout={layoutModalSlide.layout ?? (layoutModalSlide.type==='headline' ? 'centered' : 'standard')}
            onSelect={l => updateLayout(layoutModalSlide.id, l)}
            onClose={() => setLayoutModalSlideId(null)}
          />
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
