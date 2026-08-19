'use client';

import { useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import type { PresentationSlide } from '@/stores/presentationFlowStore';
import { Tooltip } from '../ui/Tooltip';
import { ns, DuplicateIcon, TrashIcon, AISparkleIcon } from './presentationIcons';

function GripIcon() {
  return <svg width="8" height="12" viewBox="0 0 8 12" fill="none">{[0,1,2].map(r => [0,1].map(c => <circle key={`${r}${c}`} cx={c*4+2} cy={r*4+2} r="1.3" fill="#A0AABA"/>))}</svg>;
}
function DotsIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="#52637A"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>;
}

const TRANSITION_LABELS: Record<string, string> = { fade: 'Fade', slide: 'Slide', zoom: 'Zoom', dissolve: 'Dissolve' };

// One glyph per transition type so a slide whose transition doesn't match its neighbors reads
// as a shape change at a glance across the filmstrip, not just a tooltip you'd have to check
// slide by slide. 'none' renders nothing — its absence already says "no transition" the same
// way an unlit status dot does elsewhere in this app, so a dedicated icon for it would just be
// noise on what's likely the majority of slides in a lot of decks.
function TransitionBadgeIcon({ type }: { type: string }) {
  if (type === 'slide') return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h15M13 6l6 6-6 6"/></svg>
  );
  if (type === 'zoom') return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
  );
  if (type === 'dissolve') return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff">
      <circle cx="5" cy="6" r="1.7"/><circle cx="13" cy="4" r="1.7"/><circle cx="20" cy="8" r="1.7" opacity="0.55"/>
      <circle cx="7" cy="13" r="1.7" opacity="0.7"/><circle cx="16" cy="13" r="1.7" opacity="0.4"/>
      <circle cx="10" cy="20" r="1.7" opacity="0.3"/>
    </svg>
  );
  // Default/fade — two overlapping circles read as "blend of two things" without needing a
  // gradient fill at a size this small, matching the flat stroke language of the others.
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4"><circle cx="9" cy="12" r="6" opacity="0.9"/><circle cx="16" cy="12" r="6" opacity="0.5"/></svg>
  );
}

export interface FilmstripItemProps {
  slide: PresentationSlide;
  /** Pre-rendered slide preview (e.g. <SlideThumbnail/>) — kept as a render prop so this file doesn't need to import the editor's slide-content renderer. */
  thumbnail: React.ReactNode;
  index: number;
  isActive: boolean;
  isBlank: boolean;
  loading?: boolean;
  onClick: () => void;
  onGenerate: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onAddAfter: () => void;
  onAddWithAI: () => void;
  /** Preview-only: forces the grip/⋯ controls visible without a real pointer hover. Used by the component states showcase, not by the live editor. */
  previewForceHover?: boolean;
  /** Preview-only: opens the ⋯ menu on mount instead of requiring a click. Used by the component states showcase, not by the live editor. */
  defaultMenuOpen?: boolean;
}

/** Filmstrip row: slide thumbnail, number badge, drag handle + ⋯ menu revealed on hover, "add slide" affordance below. */
export function FilmstripItem({ slide, thumbnail, index, isActive, isBlank, loading, onClick, onGenerate, onDuplicate, onRemove, onAddAfter, onAddWithAI, previewForceHover, defaultMenuOpen }: FilmstripItemProps) {
  const dragControls = useDragControls();
  const [menuOpen, setMenuOpen] = useState(defaultMenuOpen ?? false);
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

  const hoverClass = previewForceHover ? 'opacity-100' : 'opacity-0 group-hover/fi:opacity-100';

  return (
    <Reorder.Item value={slide} dragListener={false} dragControls={dragControls} as="div" className="group/fi" style={{ width: '100%' }}>
      <div onClick={onClick} className="relative cursor-pointer" style={{ borderRadius: isActive ? 0 : 7, outline: isActive ? '2.5px solid #006EFE' : '1.5px solid transparent', outlineOffset: 1 }}>
        {loading ? (
          <div className="relative w-full overflow-hidden rounded-[5px]" style={{ aspectRatio: '16/9', background: '#F4F5F7' }}>
            <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: 7, padding: '0 14%' }}>
              <div className="w-full animate-pulse" style={{ height: 8, borderRadius: 4, background: '#E0E3E9' }}/>
              <div className="animate-pulse" style={{ height: 6, width: '72%', borderRadius: 4, background: '#EAECEF' }}/>
              <div className="animate-pulse" style={{ height: 6, width: '55%', borderRadius: 4, background: '#EAECEF' }}/>
            </div>
          </div>
        ) : (
          <>
            {thumbnail}
            {/* Slide number — bottom left inside thumbnail. Skeleton state has no slide to number yet, so this only renders once loaded. */}
            <div className="absolute flex items-center justify-center" style={{ bottom: 4, left: 5, minWidth: 16, height: 16, borderRadius: 4, background: 'rgba(15,23,51,0.45)', padding: '0 4px' }}>
              <span style={{ ...ns, fontSize: 9, fontWeight: 700, color: '#fff' }}>{index + 1}</span>
            </div>
            {/* Transition — bottom right, mirroring the number badge's placement and treatment
                on the opposite corner. Always visible, not hover-only: the whole point is
                scanning the filmstrip for a slide whose icon breaks the pattern, which only
                works if every slide's badge is on screen at the same time. */}
            {(() => {
              const effectiveType = slide.transitionType ?? 'fade';
              if (effectiveType === 'none') return null;
              const label = TRANSITION_LABELS[effectiveType] ?? 'Fade';
              const ms = slide.transitionMs ?? 600;
              // The absolute positioning has to be the outer element, not wrapped inside
              // Tooltip — Tooltip's own wrapper is itself position:relative, which would
              // otherwise become the nearest positioned ancestor and resolve bottom/right
              // against Tooltip's tiny inline-flex box instead of this thumbnail.
              return (
                // Same bottom offset, size, and radius as the number badge above — this is
                // just that badge's treatment mirrored onto the opposite corner, not a
                // different one.
                <div className="absolute flex items-center justify-center" style={{ bottom: 4, right: 5, width: 16, height: 16, borderRadius: 4, background: 'rgba(15,23,51,0.45)' }}>
                  <Tooltip label={`${label} · ${ms}ms`} position="top">
                    <div className="w-full h-full flex items-center justify-center">
                      <TransitionBadgeIcon type={effectiveType} />
                    </div>
                  </Tooltip>
                </div>
              );
            })()}
          </>
        )}
        {/* Drag grip — top left */}
        <div onPointerDown={e => { e.preventDefault(); e.stopPropagation(); dragControls.start(e); }} onClick={e => e.stopPropagation()} className={`absolute flex items-center justify-center transition-opacity cursor-grab ${hoverClass}`} style={{ top: 4, left: 4, width: 18, height: 18, borderRadius: 4, background: 'rgba(15,23,51,0.55)', boxShadow: '0px 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)', touchAction: 'none' }}>
          <GripIcon/>
        </div>
        {/* ⋯ menu — top right */}
        <div ref={menuRef} className="absolute" style={{ top: 4, right: 4 }} onClick={e => e.stopPropagation()}>
          <button onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }} className={`flex items-center justify-center cursor-pointer transition-opacity ${hoverClass}`} style={{ width: 20, height: 20, borderRadius: 4, background: menuOpen ? 'rgba(15,23,51,0.7)' : 'rgba(15,23,51,0.55)', boxShadow: '0px 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)', border: 'none' }}>
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
