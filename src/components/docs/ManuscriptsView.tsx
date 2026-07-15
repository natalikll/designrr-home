'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useFlowStore } from '@/stores/flowStore';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

/* ── Mock data ── */
interface Doc {
  id: string;
  title: string;
  date: string;
  lines: number[]; // widths of preview text lines as % of container
}

const DOCS: Doc[] = [
  { id: '1',  title: 'AI_Speaking_Tier_Overview',             date: 'July 06, 2026',  lines: [55, 100, 100, 72, 100, 88, 100, 60, 100, 95, 80, 100, 66] },
  { id: '2',  title: 'The Unwritten Code: Mastering Authority', date: 'July 01, 2026',  lines: [70, 100, 92, 100, 78, 100, 84, 55, 100, 96, 70, 100, 60] },
  { id: '3',  title: 'The Art of Saying Yes to Yourself',      date: 'July 01, 2026',  lines: [65, 100, 88, 100, 74, 100, 90, 62, 100, 80, 76, 100, 55] },
  { id: '4',  title: 'The Blueprint Builder\'s Journey',       date: 'June 26, 2026', lines: [60, 100, 95, 88, 100, 70, 100, 58, 96, 84, 100, 66, 78] },
  { id: '5',  title: 'The Polyglot Edge: How Learning Languages Rewires Your Brain', date: 'June 20, 2026', lines: [72, 100, 84, 100, 68, 92, 100, 80, 55, 100, 76, 90, 62] },
  { id: '6',  title: 'The Polyglot\'s Brain: How Languages Unlock Your Mind', date: 'June 20, 2026', lines: [58, 100, 80, 96, 100, 74, 88, 100, 64, 78, 92, 100, 68] },
  { id: '7',  title: 'Deep Focus: The Art of Productive Thinking', date: 'June 15, 2026', lines: [66, 100, 78, 100, 88, 60, 100, 94, 72, 100, 56, 84, 76] },
  { id: '8',  title: 'The Confidence Blueprint',               date: 'June 10, 2026', lines: [80, 100, 72, 88, 100, 64, 96, 78, 100, 58, 84, 100, 70] },
];

const TAB_COUNTS: Record<string, number> = { Manuscripts: 17, Transcriptions: 4, Audiobooks: 2 };

/* ── Icons ── */
function DocIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="6" fill="#E8EBF2" />
      <path d="M10 8h8l6 6v12a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="#8E99AB" />
      <path d="M18 8l6 6h-5a1 1 0 0 1-1-1V8z" fill="#C0C8D6" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 5.5L7 9l4-3.5" stroke="#52637A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ListViewIcon({ active }: { active: boolean }) {
  const c = active ? '#006EFE' : '#8E99AB';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="3" width="14" height="2.5" rx="1" fill={c} />
      <rect x="2" y="7.75" width="14" height="2.5" rx="1" fill={c} />
      <rect x="2" y="12.5" width="14" height="2.5" rx="1" fill={c} />
    </svg>
  );
}

function GridViewIcon({ active }: { active: boolean }) {
  const c = active ? '#006EFE' : '#8E99AB';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="6" height="6" rx="1.5" fill={c} />
      <rect x="10" y="2" width="6" height="6" rx="1.5" fill={c} />
      <rect x="2" y="10" width="6" height="6" rx="1.5" fill={c} />
      <rect x="10" y="10" width="6" height="6" rx="1.5" fill={c} />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 2v10M2 7h10" stroke="#006EFE" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* ── Document thumbnail ── */
function DocThumbnail({ lines }: { lines: number[] }) {
  return (
    <div className="w-full relative overflow-hidden flex-shrink-0" style={{ height: 220, background: '#F2F4F7', borderRadius: 10 }}>
      {/* Page shadow / lift */}
      <div
        className="absolute bg-white"
        style={{
          left: 24, right: 24, top: 20, bottom: -12,
          borderRadius: 6,
          boxShadow: '0px 4px 24px rgba(15,23,51,0.10)',
          padding: '18px 16px',
          overflow: 'hidden',
        }}
      >
        {/* Title line */}
        <div style={{ height: 7, width: '58%', background: '#C8CDD8', borderRadius: 2, marginBottom: 10 }} />
        {/* Body lines */}
        {lines.map((w, i) => (
          <div
            key={i}
            style={{
              height: 4,
              width: `${w}%`,
              background: '#E2E5EC',
              borderRadius: 2,
              marginBottom: 5,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Card dropdown menu icons ── */
function MenuItemIcon({ type }: { type: string }) {
  const s = { width: 18, height: 18 };
  switch (type) {
    case 'edit': return (
      <svg {...s} viewBox="0 0 24 24" fill="none">
        <path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5l-5 1.5 1.5-5L17 3z" stroke="#15191F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
    case 'template': return (
      <svg {...s} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="2.5" stroke="#15191F" strokeWidth="1.5" />
        <path d="M2 8.5h20" stroke="#15191F" strokeWidth="1.5" />
        <path d="M9.5 8.5V22" stroke="#15191F" strokeWidth="1.5" />
      </svg>
    );
    case 'themes': return (
      <svg {...s} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="#15191F" strokeWidth="1.5" />
        <path d="M12 3c0 0 3.5 4 3.5 9s-3.5 9-3.5 9" stroke="#15191F" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M12 3c0 0-3.5 4-3.5 9s3.5 9 3.5 9" stroke="#15191F" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M3 12h18" stroke="#15191F" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
    case 'duplicate': return (
      <svg {...s} viewBox="0 0 24 24" fill="none">
        <rect x="8" y="8" width="13" height="13" rx="2" stroke="#15191F" strokeWidth="1.5" />
        <path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1" stroke="#15191F" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
    case 'info': return (
      <svg {...s} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="#15191F" strokeWidth="1.5" />
        <path d="M12 11v6" stroke="#15191F" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="7.5" r="1" fill="#15191F" />
      </svg>
    );
    case 'delete': return (
      <svg {...s} viewBox="0 0 24 24" fill="none">
        <path d="M3 6h18M8 6V4h8v2M5 6l1.5 14h11L19 6" stroke="#D62929" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 11v5M14 11v5" stroke="#D62929" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
    default: return null;
  }
}

const MENU_ITEMS = [
  { key: 'edit',      label: 'Edit manuscript',        icon: 'edit' },
  { key: 'template',  label: 'Choose a template',      icon: 'template' },
  { key: 'themes',    label: 'Themes',                 icon: 'themes' },
  { key: 'duplicate', label: 'Duplicate',              icon: 'duplicate' },
  { key: 'info',      label: 'Manuscript information', icon: 'info' },
];

/* ── Format picker ── */
const FORMATS = [
  { key: 'ebook',        label: 'Ebook',        desc: 'EPUB for any device' },
  { key: 'kindle',       label: 'Kindle Book',  desc: 'Optimized for Kindle' },
  { key: 'audiobook',    label: 'Audiobook',    desc: 'Audio narration' },
  { key: 'print',        label: 'Print Book',   desc: 'Print-ready PDF' },
  { key: 'presentation', label: 'Presentation', desc: 'Slides with AI outline' },
];

/* eslint-disable @next/next/no-img-element */
function FormatIcon({ type }: { type: string }) {
  const wrap = { width: 40, height: 40, flexShrink: 0 as const, display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const };
  switch (type) {
    case 'ebook': return (
      <div style={wrap}><img src="/ebook-icon.svg" alt="" width={32} height={36} style={{ pointerEvents: 'none' }} /></div>
    );
    case 'kindle': return (
      <div style={wrap}>
        <svg width="28" height="32" viewBox="0 0 51 57" fill="none">
          <rect x="8.50991" y="4.6935" width="32.7122" height="46.2125" rx="2.33659" fill="url(#ki_g0)" stroke="url(#ki_g1)" strokeWidth="0.519242"/>
          <rect x="11.8828" y="8.07031" width="25.9621" height="37.3854" rx="0.634629" fill="#F6F7F9"/>
          <rect x="11.9463" y="8.13378" width="25.8352" height="37.2585" rx="0.571166" stroke="#A3B0C2" strokeWidth="0.126926"/>
          <rect x="13.96" y="20.52" width="21.81" height="1.04" rx="0.52" fill="#E0E5EB"/>
          <rect x="13.96" y="22.60" width="21.81" height="1.04" rx="0.52" fill="#E0E5EB"/>
          <rect x="13.96" y="24.68" width="21.81" height="1.04" rx="0.52" fill="#E0E5EB"/>
          <rect x="13.96" y="26.76" width="21.81" height="1.04" rx="0.52" fill="#E0E5EB"/>
          <rect x="13.96" y="28.83" width="21.81" height="1.04" rx="0.52" fill="#E0E5EB"/>
          <rect x="13.96" y="30.91" width="21.81" height="1.04" rx="0.52" fill="#E0E5EB"/>
          <rect x="13.96" y="32.99" width="21.81" height="1.04" rx="0.52" fill="#E0E5EB"/>
          <rect x="13.96" y="35.07" width="21.81" height="1.04" rx="0.52" fill="#E0E5EB"/>
          <rect x="13.96" y="37.15" width="21.81" height="1.04" rx="0.52" fill="#E0E5EB"/>
          <rect x="13.96" y="39.22" width="21.81" height="1.04" rx="0.52" fill="#E0E5EB"/>
          <rect x="13.96" y="41.30" width="21.81" height="1.04" rx="0.52" fill="#E0E5EB"/>
          <path d="M21.69 48.34a1.27 1.27 0 0 1 1.27-1.27h3.81a1.27 1.27 0 0 1 0 2.54h-3.81a1.27 1.27 0 0 1-1.27-1.27z" fill="#A3B0C2"/>
          <defs>
            <linearGradient id="ki_g0" x1="24.866" y1="4.95" x2="41.18" y2="52.70" gradientUnits="userSpaceOnUse">
              <stop stopColor="#E0E5EB"/><stop offset="1" stopColor="#C2CBD6"/>
            </linearGradient>
            <linearGradient id="ki_g1" x1="17.49" y1="4.20" x2="24.66" y2="50.68" gradientUnits="userSpaceOnUse">
              <stop stopColor="#C2CBD6"/><stop offset="1" stopColor="#A3B0C2"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
    case 'audiobook': return (
      <div style={wrap}><img src="/audiobook-icon.svg" alt="" width={34} height={38} style={{ pointerEvents: 'none' }} /></div>
    );
    case 'print': return (
      <div style={wrap}><img src="/print-book-icon.svg" alt="" width={32} height={36} style={{ pointerEvents: 'none' }} /></div>
    );
    case 'presentation': return (
      <div style={wrap}>
        <svg width="38" height="30" viewBox="0 0 76 60" fill="none">
          <rect x="1" y="1" width="74" height="50" rx="4" fill="url(#pr_g0)" stroke="url(#pr_g1)" strokeWidth="1"/>
          <rect x="5" y="5" width="66" height="42" rx="2" fill="#F6F7F9"/>
          <rect x="10" y="10" width="30" height="3" rx="1.5" fill="#C2CBD6"/>
          <rect x="10" y="16" width="56" height="2" rx="1" fill="#E0E5EB"/>
          <rect x="10" y="20" width="48" height="2" rx="1" fill="#E0E5EB"/>
          <rect x="10" y="24" width="52" height="2" rx="1" fill="#E0E5EB"/>
          <rect x="10" y="28" width="40" height="2" rx="1" fill="#E0E5EB"/>
          <path d="M33 51h10v6h-10z" fill="#C2CBD6"/>
          <path d="M24 57h28" stroke="#C2CBD6" strokeWidth="2" strokeLinecap="round"/>
          <defs>
            <linearGradient id="pr_g0" x1="38" y1="1" x2="38" y2="52" gradientUnits="userSpaceOnUse">
              <stop stopColor="#E0E5EB"/><stop offset="1" stopColor="#C2CBD6"/>
            </linearGradient>
            <linearGradient id="pr_g1" x1="38" y1="1" x2="38" y2="52" gradientUnits="userSpaceOnUse">
              <stop stopColor="#C2CBD6"/><stop offset="1" stopColor="#A3B0C2"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
    default: return null;
  }
}

/* ── Card ── */
function DocCard({ doc }: { doc: Doc }) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const subCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelSubClose = () => { if (subCloseTimer.current) clearTimeout(subCloseTimer.current); };
  const scheduleSubClose = () => { subCloseTimer.current = setTimeout(() => setSubOpen(false), 150); };

  const MENU_W = 238;
  const SUB_W = 264;

  const openMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSubOpen(false);
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPopoverPos({ top: r.top, left: r.right + 8 });
    }
    setMenuOpen((v) => !v);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      const inMenu = menuRef.current?.contains(e.target as Node);
      const inSub  = subRef.current?.contains(e.target as Node);
      const inBtn  = btnRef.current?.contains(e.target as Node);
      if (!inMenu && !inSub && !inBtn) { setMenuOpen(false); setSubOpen(false); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const showOverlay = hovered || menuOpen;

  // Sub-panel position: right of main menu, flip left if off-screen
  const subLeft = popoverPos
    ? (popoverPos.left + MENU_W + 4 + SUB_W > window.innerWidth
        ? popoverPos.left - SUB_W - 4
        : popoverPos.left + MENU_W + 4)
    : 0;

  const dropdown = menuOpen && popoverPos ? createPortal(
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      className="bg-white flex flex-col"
      style={{ position: 'fixed', top: popoverPos.top, left: popoverPos.left, width: MENU_W, borderRadius: 12, padding: '6px', boxShadow: '0px 8px 32px rgba(0,0,0,0.16)', zIndex: 9999 }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Turn into → item */}
      <button
        className="flex items-center text-left cursor-pointer rounded-lg"
        style={{ ...ns, fontSize: 15, fontWeight: 500, color: '#15191F', padding: '10px 12px', background: subOpen ? '#F4F6F9' : 'transparent', border: 'none', gap: 10 }}
        onMouseEnter={(e) => { cancelSubClose(); setSubOpen(true); e.currentTarget.style.background = '#F4F6F9'; }}
        onMouseLeave={(e) => { scheduleSubClose(); e.currentTarget.style.background = subOpen ? '#F4F6F9' : 'transparent'; }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M4 7h11" stroke="#15191F" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M12 4l3 3-3 3" stroke="#15191F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 17H9" stroke="#15191F" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M12 20l-3-3 3-3" stroke="#15191F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="flex-1">Turn into…</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3l4 4-4 4" stroke="#8E99AB" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div style={{ height: 1, background: '#E8EBF2', margin: '4px 8px' }} />
      {MENU_ITEMS.map((item) => (
        <button
          key={item.key}
          onClick={() => { setMenuOpen(false); setSubOpen(false); }}
          className="flex items-center gap-3 text-left cursor-pointer rounded-lg"
          style={{ ...ns, fontSize: 15, fontWeight: 500, color: '#15191F', padding: '10px 12px', background: 'transparent', border: 'none' }}
          onMouseEnter={(e) => { setSubOpen(false); e.currentTarget.style.background = '#F4F6F9'; }}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <MenuItemIcon type={item.icon} />
          {item.label}
        </button>
      ))}
      <div style={{ height: 1, background: '#E8EBF2', margin: '4px 8px' }} />
      <button
        onClick={() => { setMenuOpen(false); setSubOpen(false); }}
        className="flex items-center gap-3 text-left cursor-pointer rounded-lg"
        style={{ ...ns, fontSize: 15, fontWeight: 500, color: '#D62929', padding: '10px 12px', background: 'transparent', border: 'none' }}
        onMouseEnter={(e) => { setSubOpen(false); e.currentTarget.style.background = '#FEF2F2'; }}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <MenuItemIcon type="delete" />
        Delete
      </button>
    </motion.div>,
    document.body
  ) : null;

  const subPanel = menuOpen && subOpen && popoverPos ? createPortal(
    <motion.div
      ref={subRef}
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.12 }}
      className="bg-white flex flex-col"
      style={{ position: 'fixed', top: popoverPos.top, left: subLeft, width: SUB_W, borderRadius: 12, padding: '6px', boxShadow: '0px 8px 32px rgba(0,0,0,0.16)', zIndex: 9999 }}
      onMouseEnter={cancelSubClose}
      onMouseLeave={scheduleSubClose}
      onClick={(e) => e.stopPropagation()}
    >
      <p style={{ ...ns, fontSize: 11, fontWeight: 600, color: '#8E99AB', padding: '6px 12px 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Turn into
      </p>
      {FORMATS.map((fmt) => (
        <button
          key={fmt.key}
          onClick={() => { setMenuOpen(false); setSubOpen(false); }}
          className="flex items-center gap-3 text-left cursor-pointer rounded-lg"
          style={{ padding: '9px 10px', background: 'transparent', border: 'none' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#F4F6F9')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <FormatIcon type={fmt.key} />
          <div className="flex flex-col" style={{ gap: 1 }}>
            <span style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F' }}>{fmt.label}</span>
            <span style={{ ...ns, fontSize: 12, color: '#8E99AB' }}>{fmt.desc}</span>
          </div>
        </button>
      ))}
    </motion.div>,
    document.body
  ) : null;

  return (
    <div
      className="relative flex flex-col cursor-pointer"
      style={{ gap: 10 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative">
        <DocThumbnail lines={doc.lines} />

        {/* Checkbox — top left */}
        {showOverlay && (
          <div
            className="absolute flex items-center justify-center"
            style={{ top: 10, left: 10, width: 22, height: 22, borderRadius: 5, background: '#fff', border: '1.5px solid #D0D5DE', zIndex: 10 }}
          />
        )}

        {/* 3-dot button — top right */}
        {showOverlay && (
          <button
            ref={btnRef}
            onClick={openMenu}
            className="absolute flex items-center justify-center cursor-pointer"
            style={{ top: 10, right: 10, width: 36, height: 36, borderRadius: 8, background: menuOpen ? '#006EFE' : 'rgba(20,26,40,0.78)', border: 'none', zIndex: 10, transition: 'background 0.12s' }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="4" cy="9" r="1.5" fill="#fff" />
              <circle cx="9" cy="9" r="1.5" fill="#fff" />
              <circle cx="14" cy="9" r="1.5" fill="#fff" />
            </svg>
          </button>
        )}

        {dropdown}
        {subPanel}
      </div>

      {/* Card footer */}
      <div className="flex items-center" style={{ gap: 10 }}>
        <DocIcon />
        <div className="flex flex-col min-w-0" style={{ gap: 2 }}>
          <p className="truncate" style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F', lineHeight: '18px' }}>
            {doc.title}
          </p>
          <p style={{ ...ns, fontSize: 12, color: '#8E99AB', lineHeight: '16px' }}>
            {doc.date}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Sort dropdown ── */
const SORT_OPTIONS = ['Newest', 'Oldest', 'Title A–Z', 'Title Z–A'];

function SortDropdown() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('Newest');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center cursor-pointer bg-white"
        style={{
          gap: 8, height: 38, padding: '0 14px', borderRadius: 8,
          border: '1px solid #E0E5EB',
        }}
      >
        <span style={{ ...ns, fontSize: 14, fontWeight: 500, color: '#15191F', whiteSpace: 'nowrap' }}>
          Sort: {selected}
        </span>
        <ChevronDown />
      </button>
      {open && (
        <div
          className="absolute bg-white flex flex-col"
          style={{ top: 'calc(100% + 4px)', right: 0, minWidth: 160, borderRadius: 8, padding: 5, boxShadow: '0px 4px 20px rgba(0,0,0,0.1)', zIndex: 20 }}
        >
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => { setSelected(opt); setOpen(false); }}
              className="text-left cursor-pointer rounded-md"
              style={{ ...ns, fontSize: 13.5, color: '#15191F', padding: '7px 10px', fontWeight: opt === selected ? 600 : 400, background: opt === selected ? '#F4F6F9' : 'transparent', border: 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F4F6F9')}
              onMouseLeave={(e) => (e.currentTarget.style.background = opt === selected ? '#F4F6F9' : 'transparent')}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main view ── */
export function ManuscriptsView() {
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);
  const [activeTab, setActiveTab] = useState('Manuscripts');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  return (
    <div className="h-full flex flex-col bg-white">

      {/* ── Top bar (sidebar toggle only) ── */}
      <div
        className="flex-shrink-0 flex items-center bg-white border-b border-border-light"
        style={{ height: 56, padding: '0 16px' }}
      >
        <Tooltip label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'} position="right">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex-shrink-0 rounded-lg hover:bg-[#F6F7F9] transition-colors cursor-pointer flex items-center justify-center"
            style={{ width: 40, height: 40 }}
          >
            <SideMenuIcon active={sidebarOpen} />
          </button>
        </Tooltip>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">

        {/* Page title */}
        <div style={{ padding: '32px 32px 0' }}>
          <h1 style={{ ...ns, fontSize: 28, fontWeight: 700, color: '#15191F', margin: 0 }}>Docs</h1>
        </div>

        {/* ── Tabs + controls row ── */}
        <div
          className="flex items-center bg-white"
          style={{ margin: '20px 0 0', padding: '0 32px', height: 52, gap: 0 }}
        >
          {/* Tabs */}
          <div className="flex items-end h-full" style={{ flex: 1, gap: 0 }}>
            {(['Manuscripts', 'Transcriptions', 'Audiobooks'] as const).map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="relative flex items-center cursor-pointer h-full"
                  style={{
                    ...ns,
                    fontSize: 15,
                    fontWeight: active ? 600 : 400,
                    color: active ? '#006EFE' : '#52637A',
                    background: 'none',
                    border: 'none',
                    padding: '0 20px 0 0',
                    marginRight: 8,
                    gap: 5,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab}
                  {TAB_COUNTS[tab] !== undefined && (
                    <span style={{ fontSize: 13, fontWeight: 500, color: active ? '#006EFE' : '#8E99AB' }}>
                      ({TAB_COUNTS[tab]})
                    </span>
                  )}
                  {active && (
                    <motion.div
                      layoutId="tab-underline"
                      className="absolute bottom-0 left-0 right-0"
                      style={{ height: 2, background: '#006EFE', borderRadius: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Right controls */}
          <div className="flex items-center flex-shrink-0" style={{ gap: 8 }}>
            <SortDropdown />

            {/* View toggle */}
            <div className="flex items-center" style={{ gap: 2, padding: '3px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff' }}>
              <button
                onClick={() => setViewMode('list')}
                className="flex items-center justify-center cursor-pointer rounded-md"
                style={{ width: 32, height: 32, border: 'none', background: viewMode === 'list' ? '#F0F6FF' : 'transparent', transition: 'background 0.12s' }}
              >
                <ListViewIcon active={viewMode === 'list'} />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className="flex items-center justify-center cursor-pointer rounded-md"
                style={{ width: 32, height: 32, border: 'none', background: viewMode === 'grid' ? '#F0F6FF' : 'transparent', transition: 'background 0.12s' }}
              >
                <GridViewIcon active={viewMode === 'grid'} />
              </button>
            </div>

            {/* New doc button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center cursor-pointer"
              style={{
                gap: 6, height: 38, padding: '0 18px', borderRadius: 8,
                border: '1.5px solid #006EFE', background: '#fff',
              }}
            >
              <PlusIcon />
              <span style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#006EFE' }}>New manuscript</span>
            </motion.button>
          </div>
        </div>

        {/* ── Card grid ── */}
        <div style={{ padding: '28px 32px 40px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: viewMode === 'grid'
                ? 'repeat(auto-fill, minmax(240px, 1fr))'
                : '1fr',
              gap: viewMode === 'grid' ? 24 : 12,
            }}
          >
            {DOCS.map((doc) => (
              <DocCard key={doc.id} doc={doc} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
