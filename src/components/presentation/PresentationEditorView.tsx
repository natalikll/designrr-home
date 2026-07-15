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
];

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

function hexLuminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length < 6) return 1;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function isDark(hex: string): boolean { return hexLuminance(hex) < 0.35; }

function AISparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="aiIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#006EFE"/>
          <stop offset="100%" stopColor="#5326BD"/>
        </linearGradient>
      </defs>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6.34 6.34l2.12 2.12M15.54 15.54l2.12 2.12M6.34 17.66l2.12-2.12M15.54 8.46l2.12-2.12" stroke="url(#aiIconGrad)" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="12" r="3" fill="url(#aiIconGrad)"/>
    </svg>
  );
}

function AIButton({ label, onClick, active, style }: { label: string; onClick: () => void; active?: boolean; style?: React.CSSProperties }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center cursor-pointer"
      style={{
        gap: 6, height: 34, padding: '0 16px', borderRadius: 8,
        border: active ? '1px solid #006EFE' : '1px solid #E0E5EB',
        background: active ? '#F0F6FF' : '#fff',
        transition: 'all 0.15s ease',
        ...style,
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#006EFE'; e.currentTarget.style.background = '#F7FAFF'; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = '#E0E5EB'; e.currentTarget.style.background = '#fff'; } }}
    >
      <AISparkleIcon />
      <span style={{ ...ns, fontSize: 13, fontWeight: 600, background: AI_GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', whiteSpace: 'nowrap' }}>
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

function DraggableBlock({ children, offset, onOffsetChange, stageRef, zoom, label, onFocus, isActive, onAiRewrite, onDuplicate, onDelete }: {
  children: React.ReactNode;
  offset?: TextOffset;
  onOffsetChange: (o: TextOffset) => void;
  stageRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  label: string;
  onFocus?: () => void;
  isActive?: boolean;
  onAiRewrite?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}) {
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [textFocused, setTextFocused] = useState(false);
  const ox = offset?.x ?? 0, oy = offset?.y ?? 0;

  return (
    <div className="group/db relative" style={{ transform: `translate(${ox}px, ${oy}px)` }}
      onFocus={() => { setTextFocused(true); onFocus?.(); }}
      onBlur={() => setTextFocused(false)}>

      {/* Selection outline */}
      {isActive && (
        <div style={{ position: 'absolute', inset: -5, borderRadius: 6, border: '1.5px solid #006EFE', pointerEvents: 'none', zIndex: 5 }}/>
      )}

      {/* Floating toolbar — above block when active but not typing */}
      {isActive && !textFocused && (
        <div
          className="flex items-center bg-white"
          style={{ position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)', borderRadius: 10, boxShadow: '0px 4px 20px rgba(15,23,51,0.18)', border: '1px solid #ECEEF2', overflow: 'hidden', zIndex: 30, whiteSpace: 'nowrap' }}
          onMouseDown={e => e.stopPropagation()}
        >
          {onAiRewrite && (
            <>
              <button
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onAiRewrite(); }}
                className="flex items-center cursor-pointer"
                style={{ gap: 6, height: 34, padding: '0 12px', border: 'none', background: 'none', ...ns, fontSize: 12.5, fontWeight: 600, color: '#7C5CFC' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F6F3FF'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              >
                <SparkleIcon color="#7C5CFC"/>
                Regenerate
              </button>
              <div style={{ width: 1, height: 18, background: '#ECEEF2', flexShrink: 0 }}/>
            </>
          )}
          {onDuplicate && (
            <Tooltip label="Duplicate slide" position="top">
              <button
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onDuplicate(); }}
                className="flex items-center justify-center cursor-pointer"
                style={{ width: 34, height: 34, border: 'none', background: 'none' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F5F7FA'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              >
                <DuplicateIcon color="#3D4A5C"/>
              </button>
            </Tooltip>
          )}
          {onDelete && (
            <>
              <div style={{ width: 1, height: 18, background: '#ECEEF2', flexShrink: 0 }}/>
              <Tooltip label="Delete slide" position="top">
                <button
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
                  className="flex items-center justify-center cursor-pointer"
                  style={{ width: 34, height: 34, border: 'none', background: 'none' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FFF5F5'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                >
                  <TrashIcon/>
                </button>
              </Tooltip>
            </>
          )}
        </div>
      )}

      {/* Drag handle */}
      <div
        className="absolute flex items-center gap-1 cursor-grab select-none opacity-0 group-hover/db:opacity-100 transition-opacity"
        style={{ top: -20, left: 0, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.45)', zIndex: 20 }}
        onPointerDown={e => {
          e.preventDefault(); e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          dragRef.current = { sx: e.clientX, sy: e.clientY, ox, oy };
        }}
        onPointerMove={e => {
          if (!dragRef.current) return;
          const scale = zoom / 100;
          onOffsetChange({ x: dragRef.current.ox + (e.clientX - dragRef.current.sx) / scale, y: dragRef.current.oy + (e.clientY - dragRef.current.sy) / scale });
        }}
        onPointerUp={() => { dragRef.current = null; }}
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

  const map: Record<SlideLayout, React.ReactNode> = {
    standard:     <>{T(8,10,52)}{S(8,21,22)}{L(8,30,66)}{L(8,38,58,0.55)}{L(8,46,62,0.55)}{L(8,54,44,0.5)}</>,
    centered:     <>{T(22,16,72)}{S(44,27,28)}{L(14,36,88,0.6)}{L(24,44,68,0.5)}{L(30,52,56,0.45)}</>,
    'image-right':<>{T(7,10,44)}{S(7,21,20)}{L(7,30,44,0.65)}{L(7,38,38,0.55)}{L(7,46,42,0.55)}{L(7,54,34,0.5)}{Img(58,7,52,59)}</>,
    'image-left': <>{Img(6,7,50,59)}{T(63,10,46)}{S(63,21,20)}{L(63,30,44,0.65)}{L(63,38,38,0.55)}{L(63,46,42,0.55)}{L(63,54,34,0.5)}</>,
    'two-column': <>{T(8,8,100)}{S(8,19,34)}{L(8,29,46,0.65)}{L(8,37,42,0.55)}{L(8,45,44,0.55)}{L(8,53,36,0.5)}{L(62,29,46,0.65)}{L(62,37,42,0.55)}{L(62,45,40,0.55)}{L(62,53,44,0.5)}</>,
    'big-title':  <>{T(10,19,96,11)}{T(18,34,80,11)}{S(36,50,44)}</>,
    split:        <>{Blk(0,0,46,73)}{T(7,19,30,7)}{S(7,30,18)}{L(7,40,30,0.7)}{L(7,49,26,0.6)}{T(52,11,56)}{S(52,22,22)}{L(52,31,56,0.65)}{L(52,39,50,0.55)}{L(52,47,54,0.55)}{L(52,55,42,0.5)}</>,
    minimal:      <>{T(18,26,80,8)}{S(44,38,28)}</>,
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

type SlidePhotoData = NonNullable<import('@/stores/presentationFlowStore').PresentationSlide['slidePhoto']>;

function PhotoLayer({ photo, editable, onPhotoChange, onSetBackground }: {
  photo: SlidePhotoData;
  editable: boolean;
  onPhotoChange: (p: SlidePhotoData) => void;
  onSetBackground: () => void;
}) {
  const [selected, setSelected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Deselect on outside click
  useEffect(() => {
    if (!selected) return;
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setSelected(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [selected]);

  const startDrag = (e: React.PointerEvent) => {
    if (!editable) return;
    e.preventDefault(); e.stopPropagation();
    setSelected(true);
    const parent = containerRef.current?.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const ox = e.clientX, oy = e.clientY, sx = photo.x, sy = photo.y;
    const onMove = (ev: PointerEvent) => {
      onPhotoChange({ ...photo, x: Math.max(0, Math.min(95 - photo.w, sx + (ev.clientX - ox) / rect.width * 100)), y: Math.max(0, Math.min(95 - photo.h, sy + (ev.clientY - oy) / rect.height * 100)) });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
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
      style={{ position: 'absolute', left: `${photo.x}%`, top: `${photo.y}%`, width: `${photo.w}%`, height: `${photo.h}%`, zIndex: 10, borderRadius: 4, overflow: 'visible', userSelect: 'none' }}
      onPointerDown={startDrag}
      onClick={e => { e.stopPropagation(); setSelected(true); }}
    >
      <img src={photo.url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: 4, cursor: editable ? 'move' : 'default', outline: selected && editable ? '2.5px solid #006EFE' : 'none', outlineOffset: 2, pointerEvents: 'none' }}/>

      {/* Resize handle */}
      {selected && editable && (
        <div onPointerDown={startResize} style={{ position: 'absolute', bottom: -4, right: -4, width: 12, height: 12, borderRadius: 3, background: '#006EFE', border: '2px solid #fff', cursor: 'se-resize', zIndex: 12 }}/>
      )}

      {/* Floating toolbar */}
      {selected && editable && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 1, background: '#15191F', borderRadius: 8, padding: '3px 4px', zIndex: 20, boxShadow: '0px 4px 12px rgba(0,0,0,0.25)', whiteSpace: 'nowrap' }}>
          <button onClick={e => { e.stopPropagation(); onSetBackground(); setSelected(false); }} style={{ ...ns, fontSize: 11, fontWeight: 500, color: '#fff', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 8px', borderRadius: 5 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
            Set as background
          </button>
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.15)' }}/>
          <button onClick={e => { e.stopPropagation(); onPhotoChange({ url: photo.url, x: -9999, y: 0, w: 0, h: 0 }); setSelected(false); }} style={{ ...ns, fontSize: 11, fontWeight: 500, color: '#FF7B7B', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 8px', borderRadius: 5 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
            Remove
          </button>
        </div>
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
  onAiRewrite: (block: 'title' | 'content') => void;
  onDuplicateSlide: () => void;
  onDeleteSlide: () => void;
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
          ? <div style={{ width: 5, height: 5, borderRadius: '50%', background: theme.accentColor, marginTop: 6, flexShrink: 0 }}/>
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
        isActive={dragProps.focusedBlock === 'title'}
        onAiRewrite={() => dragProps.onAiRewrite('title')}
        onDuplicate={dragProps.onDuplicateSlide}
        onDelete={dragProps.onDeleteSlide}
      >{children}</DraggableBlock>
    ) : children;

  const wrapC = (children: React.ReactNode) =>
    editable && dragProps ? (
      <DraggableBlock
        offset={dragProps.contentOffset} onOffsetChange={dragProps.onContentOffsetChange}
        stageRef={dragProps.stageRef} zoom={dragProps.zoom} label="Content"
        onFocus={() => dragProps.onBlockFocus('content')}
        isActive={dragProps.focusedBlock === 'content'}
        onAiRewrite={() => dragProps.onAiRewrite('content')}
        onDuplicate={dragProps.onDuplicateSlide}
        onDelete={dragProps.onDeleteSlide}
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
  const VIRTUAL_W = 880;
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(176 / VIRTUAL_W);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / VIRTUAL_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={`relative w-full overflow-hidden${rounded ? ' rounded-[5px]' : ''}`} style={{ aspectRatio: '16/9', background: slide.bgImageUrl ? `url(${slide.bgImageUrl}) center/cover` : (slide.bgColor ?? theme.bg) }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: VIRTUAL_W, height: VIRTUAL_W * 9 / 16, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
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
              {mi(isBlank ? 'Generate content' : 'Regenerate content', <SparkleIcon color="#7C5CFC"/>, () => { onGenerate(); setMenuOpen(false); })}
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
    return tooltipLabel ? <Tooltip key={tooltipLabel} label={tooltipLabel} position="top">{btn}</Tooltip> : btn;
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

function RightPanel({ slide, theme, onLayoutChange, onTypeChange, rightPanelMode, focusedBlock, onFontSizeChange, onFontFamilyChange, onFontWeightChange, onTextColorChange, onListStyleChange, onTextAlignChange, onThemeChange, onBgColorChange, onBgImageChange, onBgToSlidePhoto, onContentAlignChange }: {
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
}) {
  const currentLayout: SlideLayout = slide?.layout ?? (slide?.type === 'headline' ? 'centered' : 'standard');
  const currentType: SlideType = slide?.type ?? 'content';
  const isHeadline = currentType === 'headline';

  const currentFontSize = focusedBlock === 'title' ? (slide?.titleFontSize ?? 24) : (slide?.contentFontSize ?? 14);
  const curFamily = focusedBlock === 'title' ? (slide?.titleFontFamily ?? "'Nunito Sans', sans-serif") : (slide?.contentFontFamily ?? "'Nunito Sans', sans-serif");
  const curWeight = focusedBlock === 'title' ? (slide?.titleFontWeight ?? 700) : (slide?.contentFontWeight ?? 400);
  const curColor  = slide?.textColorOverride ?? theme.titleColor;
  const curList: 'none' | 'bullet' | 'numbered' = slide?.listStyle ?? 'bullet';
  const curAlign  = (focusedBlock === 'title' ? slide?.titleTextAlign : slide?.contentTextAlign) ?? 'left';

  const section = (label: string, children: React.ReactNode) => (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid #F0F2F5' }}>
      <p style={{ ...ns, fontSize: 10.5, fontWeight: 700, color: '#A0AABA', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>{label}</p>
      {children}
    </div>
  );

  const miniLabel = (text: string) => (
    <p style={{ ...ns, fontSize: 9, fontWeight: 700, color: '#A8B3C4', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>{text}</p>
  );


  const headlineLayouts: SlideLayout[] = ['centered', 'big-title', 'minimal'];
  const contentLayouts: SlideLayout[] = ['standard', 'image-right', 'image-left', 'two-column', 'split', 'minimal'];
  const visibleLayouts = LAYOUTS.filter(l => isHeadline ? headlineLayouts.includes(l.id) : contentLayouts.includes(l.id));

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
          <div className="flex items-center" style={{ padding: '10px 14px 9px', borderBottom: '1px solid #F2F3F7', gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7C5CFC" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
            <span style={{ ...ns, fontSize: 10.5, fontWeight: 700, color: '#7C5CFC', letterSpacing: 0.4, textTransform: 'uppercase' }}>
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
          {section('Layout', (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 7 }}>
              {visibleLayouts.map(l => {
                const isSel = l.id === currentLayout;
                return (
                  <div key={l.id} className="flex flex-col" style={{ gap: 5 }}>
                    <button onClick={() => onLayoutChange(l.id)} className="flex flex-col items-start cursor-pointer" style={{ borderRadius: 7, border: isSel ? '1.5px solid #006EFE' : '1.5px solid #E3E6EC', background: isSel ? '#EFF6FF' : '#fff', padding: 4, overflow: 'hidden' }}>
                      <div className="w-full overflow-hidden" style={{ borderRadius: 4, background: '#fff' }}><LayoutThumbSVG layout={l.id}/></div>
                    </button>
                    <span style={{ ...ns, fontSize: 10.5, fontWeight: isSel ? 600 : 500, color: isSel ? '#006EFE' : '#52637A' }}>{l.name}</span>
                  </div>
                );
              })}
            </div>
          ))}
          {section('Background', (
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
  const [textEditorMode, setTextEditorMode] = useState<'panel' | 'bar'>('panel');
  const [notesPanelHeight, setNotesPanelHeight] = useState(90);
  const [leftPanel, setLeftPanel] = useState<'slides' | 'media' | 'templates' | 'text' | 'settings'>('slides');
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
  const historyRef = useRef<PresentationSlide[][]>([JSON.parse(JSON.stringify(storeSlides))]);
  const histIdxRef = useRef(0);
  const notesResizeRef = useRef<{ sy: number; sh: number } | null>(null);

  const NEUTRAL_THEME: MockTheme = { id: 'none', name: 'None', bg: '#FFFFFF', titleColor: '#15191F', accentColor: '#C8CDD9', slides: [] };
  const theme = (selectedThemeId && selectedThemeId !== 'blank') ? (MOCK_THEMES.find(t => t.id === selectedThemeId) ?? MOCK_THEMES[0]) : NEUTRAL_THEME;
  const activeSlide = slides.find(s => s.id === activeSlideId) ?? slides[0] ?? null;
  const activeIndex = slides.findIndex(s => s.id === (activeSlide?.id ?? ''));

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
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeSlide) { e.preventDefault(); removeSlide(activeSlide.id); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [activeIndex, slides, presentIndex, activeSlide]);

  const updateSlidePartial = (id: string, changes: Partial<PresentationSlide>) =>
    setSlides(p => p.map(s => s.id === id ? { ...s, ...changes } : s));

  const updateTitle  = (id: string, v: string) => updateSlidePartial(id, { title: v });
  const updatePoint  = (id: string, i: number, v: string) => setSlides(p => p.map(s => s.id === id ? { ...s, points: s.points.map((pt, j) => j === i ? v : pt) } : s));
  const removePoint  = (id: string, i: number) => setSlides(p => p.map(s => s.id === id ? { ...s, points: s.points.filter((_, j) => j !== i) } : s));
  const updateLayout = (id: string, layout: SlideLayout) => {
    const bulletLayouts: SlideLayout[] = ['standard', 'image-right', 'image-left', 'two-column'];
    setSlides(p => p.map(s => {
      if (s.id !== id) return s;
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

  const handleAddTemplateSlides = () => {
    const tmpl = MOCK_THEMES.find(t => t.id === templateDetailId);
    if (!tmpl) return;
    const toAdd = tmpl.slides
      .filter(s => checkedSlideIds.length === 0 || checkedSlideIds.includes(s.id))
      .map(s => ({
        id: `${s.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: s.title,
        type: s.type as SlideType,
        points: [...s.points],
        layout: s.layout as SlideLayout | undefined,
      } as PresentationSlide));
    setSlides(prev => {
      const idx = prev.findIndex(s => s.id === activeSlideId);
      const insertAt = idx >= 0 ? idx + 1 : prev.length;
      const next = [...prev];
      next.splice(insertAt, 0, ...toAdd);
      return next;
    });
    setActiveSlideId(toAdd[0].id);
    setLeftPanel('slides');
  };

  const layoutModalSlide = slides.find(s => s.id === layoutModalSlideId) ?? null;

  const dragProps: DragProps | undefined = activeSlide ? {
    stageRef,
    zoom,
    titleOffset: activeSlide.titleOffset,
    contentOffset: activeSlide.contentOffset,
    onTitleOffsetChange: (o) => updateSlidePartial(activeSlide.id, { titleOffset: o }),
    onContentOffsetChange: (o) => updateSlidePartial(activeSlide.id, { contentOffset: o }),
    onBlockFocus: (block) => { setFocusedBlock(block); setRightPanelMode('text'); },
    focusedBlock,
    onAiRewrite: (block) => {
      if (block === 'title') handleAiRewriteTitle();
      else openAiForSlide(activeSlide, isBlankSlide(activeSlide));
    },
    onDuplicateSlide: () => duplicateSlide(activeSlide.id),
    onDeleteSlide: () => removeSlide(activeSlide.id),
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
    <div className="h-full flex flex-col bg-white">
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
            <AIButton label="AI Agent" onClick={() => setAiPanelOpen(v => !v)} active={aiPanelOpen} />
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
            {narrationVersion === '2' && (
              <div className="relative">
                <button
                  onClick={() => router.push('/presentation/narration?v=2')}
                  className="flex items-center cursor-pointer" style={{ gap: 6, height: 34, padding: '0 16px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F4F6F9'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="6" width="13" height="12" rx="2.5" fill="#001633"/>
                    <path d="M15 9L21 6V18L15 15V9Z" fill="#001633"/>
                  </svg>
                  <span style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#001633' }}>Create video</span>
                </button>
              </div>
            )}
            <div ref={exportRef} className="relative">
              <button onClick={() => setExportOpen(v => !v)} className="flex items-center cursor-pointer" style={{ gap: 7, height: 34, padding: '0 16px', borderRadius: 8, border: 'none', background: '#006EFE' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#0058CC'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
                <span style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#fff' }}>Share</span>
                <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {exportOpen && (
                <div className="absolute bg-white flex flex-col" style={{ top: 'calc(100% + 4px)', right: 0, zIndex: 30, width: 270, padding: 5, borderRadius: 9, border: '1px solid #E8EBF2', boxShadow: '0px 8px 24px rgba(15,23,51,0.14)' }}>
                  {narrationVersion === '1' && (
                    <button onClick={() => { setExportOpen(false); setNarratedVideoOpen(true); }} className="flex items-center w-full cursor-pointer text-left" style={{ gap: 10, padding: '7px 10px', borderRadius: 6, border: 'none', background: 'none' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#F5F7FA'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: '#DDD3FC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                          <path d="M6.5 5.5l7 4.5-7 4.5v-9z" fill="#fff" />
                        </svg>
                      </div>
                      <div className="flex flex-col" style={{ gap: 1 }}>
                        <span style={{ ...ns, fontSize: 13, fontWeight: 500, color: '#1F2532' }}>Narrated Video</span>
                        <span style={{ ...ns, fontSize: 11, color: '#9AA5B4' }}>Record a voiceover, export as video</span>
                      </div>
                    </button>
                  )}
                  {([
                    { label: 'PowerPoint', badgeBg: '#FBDCCD', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#fff" stroke="#C43E1C" strokeWidth="1.4"/>
                        <path d="M14 2v6h6" stroke="#C43E1C" strokeWidth="1.4" strokeLinecap="round"/>
                        <text x="6" y="18" style={{ fontSize: '5.5px', fontFamily: 'sans-serif', fontWeight: 700 }} fill="#C43E1C">P</text>
                      </svg>
                    ), onClick: () => { router.push('/docs'); setExportOpen(false); } },
                    { label: 'PDF', badgeBg: '#FBD0D0', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#fff" stroke="#B91C1C" strokeWidth="1.4"/>
                        <path d="M14 2v6h6" stroke="#B91C1C" strokeWidth="1.4" strokeLinecap="round"/>
                        <text x="6" y="18" style={{ fontSize: '5.5px', fontFamily: 'sans-serif', fontWeight: 700 }} fill="#B91C1C">PDF</text>
                      </svg>
                    ), onClick: () => { router.push('/docs'); setExportOpen(false); } },
                    { label: 'PNG images', badgeBg: '#C6DDFC', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#fff" stroke="#1D4ED8" strokeWidth="1.4"/>
                        <path d="M14 2v6h6" stroke="#1D4ED8" strokeWidth="1.4" strokeLinecap="round"/>
                        <path d="M7 17l2.5-3.3 1.8 2.1 1.3-1.6 2.4 2.8" stroke="#1D4ED8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="8.5" cy="11.5" r="0.9" fill="#1D4ED8"/>
                      </svg>
                    ), onClick: () => { router.push('/docs'); setExportOpen(false); } },
                    { label: 'Link', badgeBg: '#B8F0D1', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M15 7h2a5 5 0 1 1 0 10h-2" stroke="#065F46" strokeWidth="1.8" strokeLinecap="round"/>
                        <path d="M9 17H7A5 5 0 0 1 7 7h2" stroke="#065F46" strokeWidth="1.8" strokeLinecap="round"/>
                        <line x1="8" y1="12" x2="16" y2="12" stroke="#065F46" strokeWidth="1.8" strokeLinecap="round"/>
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

          <div style={{ width: 1, height: 18, background: '#E8EBF2', margin: '0 6px', flexShrink: 0 }}/>

          {/* Text panel A/B toggle */}
          <Tooltip label={textEditorMode === 'panel' ? 'Switch to floating bar (B)' : 'Switch to side panel (A)'} position="bottom">
            <div className="flex items-center cursor-pointer" style={{ height: 26, borderRadius: 6, border: '1px solid #E3E6EC', background: '#F7F8FA', padding: '0 2px', gap: 1 }}
              onClick={() => setTextEditorMode(m => m === 'panel' ? 'bar' : 'panel')}>
              {(['panel', 'bar'] as const).map((mode, i) => {
                const active = textEditorMode === mode;
                return (
                  <span key={mode} style={{ ...ns, fontSize: 11, fontWeight: active ? 700 : 500, color: active ? '#fff' : '#8E99AB', background: active ? '#006EFE' : 'none', borderRadius: 4, padding: '2px 7px', lineHeight: '18px', userSelect: 'none' }}>
                    {i === 0 ? 'A' : 'B'}
                  </span>
                );
              })}
            </div>
          </Tooltip>

          <div style={{ width: 1, height: 18, background: '#E8EBF2', margin: '0 6px', flexShrink: 0 }}/>

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
            ] as { id: 'media'|'templates'|'text'; label: string; icon: React.ReactNode }[]).map(item => {
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
              className="flex-shrink-0 h-full overflow-y-auto border-r border-border-light bg-[#F7F8FA]" style={{ width: aiPanelOpen ? 160 : FILMSTRIP_W, transition: 'width 0.22s cubic-bezier(0.2,0,0.2,1)' }}
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
                    {leftPanel === 'templates' ? 'Templates' : leftPanel === 'media' ? 'Upload' : leftPanel === 'text' ? 'Text Presets' : 'Settings'}
                  </span>
                )}
              </div>
              <div className={`flex-1 min-h-0 ${leftPanel === 'templates' && templateDetailId ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`} style={{ padding: leftPanel === 'templates' && templateDetailId ? 0 : '12px 16px 16px' }}>
                {/* Templates — list */}
                {leftPanel === 'templates' && !templateDetailId && (
                  <div className="flex flex-col" style={{ gap: 10 }}>
                    {MOCK_THEMES.map(t => (
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
                      <div className="flex-shrink-0" style={{ padding: '12px 16px', borderTop: '1px solid #F0F2F5' }}>
                        <button onClick={handleAddTemplateSlides} className="w-full cursor-pointer" style={{ height: 38, borderRadius: 8, border: 'none', background: '#006EFE', ...ns, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', transition: 'background 0.15s' }}>
                          {checkedSlideIds.length === 0 || checkedSlideIds.length === tmpl.slides.length
                            ? 'Apply all'
                            : `Apply ${checkedSlideIds.length} slide${checkedSlideIds.length !== 1 ? 's' : ''}`}
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
                        updateSlidePartial(activeSlide.id, { slidePhoto: { url, x: 10, y: 10, w: 45, h: 60 } });
                      }}
                    />
                  )}

                  {/* Coming soon panels */}
                  {leftPanel === 'settings' && (
                    <div className="flex flex-col items-center justify-center" style={{ paddingTop: 48, gap: 8 }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C5CDD9" strokeWidth="1.4" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="#C5CDD9"/></svg>
                      <span style={{ ...ns, fontSize: 13, color: '#8E99AB', fontWeight: 500 }}>Coming soon</span>
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
              <SparkleIcon color="#7C5CFC"/>
              <span style={{ ...ns, fontSize: 14, fontWeight: 700, color: '#15191F' }}>AI Agent</span>
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
                        <SparkleIcon color="#7C5CFC"/>
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
            {textEditorMode === 'bar' && rightPanelMode === 'text' && activeSlide && (
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

            {/* Canvas */}
            <div
              className="flex-1 overflow-auto"
              style={{ background: '#EDEEF1' }}
              onFocusCapture={e => { if ((e.target as HTMLElement).contentEditable === 'true') setRightPanelMode('text'); }}
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
                  <motion.div key={activeSlide.id} initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.16 }}
                    style={{ width: '100%', paddingBottom: '56.25%', position: 'relative', flexShrink: 0, borderRadius: 14, boxShadow: '0px 8px 40px rgba(15,23,51,0.16)', overflow: 'clip' }}
                  >
                    {/* stageRef renders at natural slide size then scales so text and layout scale with zoom */}
                    <div ref={stageRef} style={{ position: 'absolute', top: 0, left: 0, width: `${10000/zoom}%`, height: `${10000/zoom}%`, transform: `scale(${zoom/100})`, transformOrigin: 'top left' }}>
                      {/* Clip inner content to slide bounds */}
                      <div style={{ position: 'absolute', inset: 0, borderRadius: 14, overflow: 'hidden', background: activeSlide.bgImageUrl ? `url(${activeSlide.bgImageUrl}) center/cover` : (activeSlide.bgColor ?? (selectedThemeId ? theme.bg : '#FFFFFF')) }}>
                      <SlideContent slide={activeSlide} theme={theme} editable onTitleChange={v=>updateTitle(activeSlide.id,v)} onPointChange={(idx,v)=>updatePoint(activeSlide.id,idx,v)} onPointDelete={idx=>removePoint(activeSlide.id,idx)} dragProps={dragProps} onImageClick={() => setLeftPanel('media')} onAiRewriteTitle={handleAiRewriteTitle} onAiRewritePoint={handleAiRewritePoint} aiRewritingTitle={aiRewritingTitle} aiRewritingPointIndex={aiRewritingPointIndex}/>
                      {/* Floating photo layer */}
                      {activeSlide.slidePhoto && activeSlide.slidePhoto.w > 0 && (
                        <PhotoLayer
                          photo={activeSlide.slidePhoto}
                          editable
                          onPhotoChange={p => updateSlidePartial(activeSlide.id, { slidePhoto: p.w === 0 ? undefined : p })}
                          onSetBackground={() => {
                            updateSlidePartial(activeSlide.id, {
                              bgImageUrl: activeSlide.slidePhoto!.url,
                              slidePhoto: undefined,
                              textColorOverride: '#FFFFFF',
                            });
                          }}
                        />
                      )}
                      {/* "Revert from background" overlay */}
                      {activeSlide.bgImageUrl && (
                        <div className="group/bgbadge absolute" style={{ bottom: 8, right: 8, zIndex: 20 }}>
                          <button
                            onClick={() => updateSlidePartial(activeSlide.id, {
                              slidePhoto: { url: activeSlide.bgImageUrl!, x: 10, y: 10, w: 45, h: 60 },
                              bgImageUrl: undefined,
                              textColorOverride: undefined,
                            })}
                            className="flex items-center cursor-pointer opacity-0 group-hover/bgbadge:opacity-100 transition-opacity"
                            style={{ gap: 5, height: 24, padding: '0 10px', borderRadius: 6, border: 'none', background: 'rgba(15,25,47,0.65)', backdropFilter: 'blur(4px)', ...ns, fontSize: 11, fontWeight: 500, color: '#fff' }}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            Use as slide photo
                          </button>
                        </div>
                      )}
                      </div>{/* end inner clip */}
                    </div>{/* end stageRef */}
                  </motion.div>

                  {/* Slide action bar — unified pill below slide */}
                  <div className="flex items-center bg-white" style={{ borderRadius: 10, boxShadow: '0px 2px 12px rgba(15,23,51,0.1)', overflow: 'hidden', border: '1px solid #ECEEF2' }}>
                    <Tooltip label={isBlankSlide(activeSlide) ? 'Generate content' : 'Regenerate content'} position="top">
                      <button
                        onClick={() => openAiForSlide(activeSlide, isBlankSlide(activeSlide))}
                        className="flex items-center cursor-pointer"
                        style={{ gap: 6, height: 34, padding: '0 14px', border: 'none', borderRight: '1px solid #ECEEF2', background: 'none', ...ns, fontSize: 12.5, fontWeight: 600, color: '#7C5CFC' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#F6F3FF'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                      >
                        <SparkleIcon color="#7C5CFC"/>
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
                    ) : <SparkleIcon color="#7C5CFC"/>}
                    <span style={{ ...ns, fontSize: 12, fontWeight: 600, color: '#7C5CFC', whiteSpace: 'nowrap' }}>
                      {generatingNotes ? 'Generating…' : generatingAllNotes ? 'Generating all…' : 'Generate notes'}
                    </span>
                    <svg width="7" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke="#8596AD" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  {notesGenMenuOpen && (
                    <div className="absolute bg-white flex flex-col" style={{ bottom: 'calc(100% + 6px)', right: 0, width: 168, borderRadius: 9, border: '1px solid #E8EBF2', boxShadow: '0px 8px 24px rgba(15,23,51,0.14)', padding: 4, zIndex: 30 }}>
                      <button onClick={() => { generateNotes(); setNotesGenMenuOpen(false); }} className="flex items-center cursor-pointer text-left w-full" style={{ gap: 8, padding: '7px 10px', borderRadius: 6, border: 'none', background: 'none', ...ns, fontSize: 13, fontWeight: 500, color: '#1F2532' }} onMouseEnter={e => { e.currentTarget.style.background = '#F5F0FF'; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                        <SparkleIcon color="#7C5CFC"/>This slide
                      </button>
                      <button onClick={() => { generateAllNotes(); setNotesGenMenuOpen(false); }} className="flex items-center cursor-pointer text-left w-full" style={{ gap: 8, padding: '7px 10px', borderRadius: 6, border: 'none', background: 'none', ...ns, fontSize: 13, fontWeight: 500, color: '#1F2532' }} onMouseEnter={e => { e.currentTarget.style.background = '#F5F0FF'; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                        <SparkleIcon color="#7C5CFC"/>All slides
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
          rightPanelMode={textEditorMode === 'bar' ? 'slide' : rightPanelMode}
          focusedBlock={focusedBlock}
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
            updateSlidePartial(activeSlide.id, {
              slidePhoto: { url: activeSlide.bgImageUrl!, x: 10, y: 10, w: 45, h: 60 },
              bgImageUrl: undefined,
              textColorOverride: undefined,
            });
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

      {/* Prototype-only: flip voiceover flow version */}
      <div style={{ position: 'fixed', bottom: 18, right: 18, zIndex: 100, display: 'flex', alignItems: 'center', gap: 2,
        background: '#0D1433', borderRadius: 999, padding: 4, boxShadow: '0 8px 28px rgba(15,23,51,0.35)' }}>
        {([['1', 'V1 · current'], ['2', 'V2 · concept']] as const).map(([v, label]) => (
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
