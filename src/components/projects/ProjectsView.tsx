'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useFlowStore } from '@/stores/flowStore';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

/* ── Types ── */
type ProjectType = 'ebook' | 'flipbook' | 'audiobook' | 'print' | 'kindle' | 'cover' | 'presentation' | 'video';

interface Project {
  id: string;
  title: string;
  date: string;
  type: ProjectType;
  cover?: string;
  slideColor?: string;
}

/* ── Mock data ── */
const PROJECTS: Project[] = [
  { id: '1',  title: 'AI_Speaking_Tier_Overview',                          date: 'July 07, 2026',  type: 'ebook',        cover: undefined },
  { id: '2',  title: 'The Blueprint Builder: A Step-by-Step Guide t...',   date: 'June 29, 2026', type: 'ebook',        cover: '/assets/cover2.jpg' },
  { id: '3',  title: 'nnn',                                                date: 'June 12, 2026', type: 'ebook',        cover: '/assets/cover3.jpg' },
  { id: '4',  title: 'Confessions of a Hyperpolyglot: The Obsessio...', date: 'June 12, 2026', type: 'ebook',        cover: '/assets/cover4.jpg' },
  { id: '5',  title: 'Minimal & Current',                                  date: 'June 12, 2026', type: 'ebook',        cover: '/assets/cover1.jpg' },
  { id: '6',  title: 'Multilingual Adventures: Raising Globally Minded...', date: 'June 12, 2026', type: 'ebook',       cover: '/assets/cover1.jpg' },
  { id: '7',  title: 'Sample Project',                                     date: 'June 10, 2026', type: 'ebook',        cover: '/assets/cover3.jpg' },
  { id: '8',  title: 'The Polyglot Edge',                                  date: 'May 20, 2026',  type: 'flipbook',     cover: '/assets/cover2.jpg' },
  { id: '9',  title: 'Deep Focus',                                         date: 'May 18, 2026',  type: 'flipbook',     cover: '/assets/cover4.jpg' },
  { id: '10', title: 'The Confidence Blueprint',                           date: 'May 10, 2026',  type: 'audiobook',    cover: '/assets/cover1.jpg' },
  { id: '11', title: 'The Art of Saying Yes',                              date: 'May 05, 2026',  type: 'print',        cover: '/assets/cover3.jpg' },
  { id: '12', title: 'The Unwritten Code',                                 date: 'April 28, 2026', type: 'kindle',      cover: '/assets/cover2.jpg' },
  { id: '13', title: 'Q2 Roadmap',                                         date: 'April 15, 2026', type: 'presentation', slideColor: 'linear-gradient(154deg,#006EFE 14%,#5325BD 86%)' },
  { id: '14', title: 'Brand Playbook',                                     date: 'April 10, 2026', type: 'cover',       cover: '/assets/cover4.jpg' },
  { id: '15', title: 'Book Trailer: The Confidence Blueprint',             date: 'July 12, 2026', type: 'video',       cover: '/assets/cover1.jpg' },
  { id: '16', title: 'Author Voiceover Intro',                             date: 'July 09, 2026', type: 'video',       cover: '/assets/cover3.jpg' },
];

const TABS: { id: ProjectType | 'all'; label: string }[] = [
  { id: 'ebook',        label: 'eBooks' },
  { id: 'flipbook',     label: 'Flipbooks' },
  { id: 'audiobook',   label: 'Audiobooks' },
  { id: 'video',        label: 'Videos' },
  { id: 'print',        label: 'Print Books' },
  { id: 'kindle',       label: 'Kindle Books' },
  { id: 'cover',        label: 'Covers' },
  { id: 'presentation', label: 'Presentations' },
];

function tabCount(type: ProjectType | 'all'): number | null {
  const n = type === 'all' ? PROJECTS.length : PROJECTS.filter(p => p.type === type).length;
  return n > 0 ? n : null;
}

/* ── Icons ── */
function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="#8E99AB" strokeWidth="1.5" />
      <path d="M12.5 12.5L16 16" stroke="#8E99AB" strokeWidth="1.5" strokeLinecap="round" />
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

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 2v10M2 7h10" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
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
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center cursor-pointer bg-white"
        style={{ gap: 8, height: 38, padding: '0 14px', borderRadius: 8, border: '1px solid #E0E5EB' }}
      >
        <span style={{ ...ns, fontSize: 14, fontWeight: 500, color: '#15191F', whiteSpace: 'nowrap' }}>
          Sort: {selected}
        </span>
        <ChevronDown />
      </button>
      {open && (
        <div className="absolute bg-white flex flex-col" style={{ top: 'calc(100% + 4px)', right: 0, minWidth: 160, borderRadius: 8, padding: 5, boxShadow: '0px 4px 20px rgba(0,0,0,0.1)', zIndex: 20 }}>
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => { setSelected(opt); setOpen(false); }}
              className="text-left cursor-pointer rounded-md"
              style={{ ...ns, fontSize: 13.5, color: '#15191F', padding: '7px 10px', fontWeight: opt === selected ? 600 : 400, background: opt === selected ? '#F4F6F9' : 'transparent', border: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F4F6F9')}
              onMouseLeave={e => (e.currentTarget.style.background = opt === selected ? '#F4F6F9' : 'transparent')}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Project card thumbnail ── */
function CardThumbnail({ project }: { project: Project }) {
  if (project.type === 'presentation') {
    return (
      <div
        className="w-full flex-shrink-0 flex items-center justify-center overflow-hidden"
        style={{ height: 220, borderRadius: 10, background: project.slideColor ?? '#11182F' }}
      >
        <div style={{ width: '80%', height: '60%', borderRadius: 6, background: 'rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '16px 20px', gap: 8 }}>
          <div style={{ height: 8, width: '60%', background: 'rgba(255,255,255,0.5)', borderRadius: 2 }} />
          <div style={{ height: 4, width: '85%', background: 'rgba(255,255,255,0.25)', borderRadius: 2 }} />
          <div style={{ height: 4, width: '70%', background: 'rgba(255,255,255,0.25)', borderRadius: 2 }} />
        </div>
      </div>
    );
  }

  if (project.cover) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <div className="w-full relative flex-shrink-0 overflow-hidden flex items-center justify-center" style={{ height: 220, borderRadius: 10, background: '#F2F4F7' }}>
        <img
          src={project.cover}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }}
        />
        {project.type === 'video' && (
          <div
            className="absolute flex items-center justify-center"
            style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(20,26,40,0.55)' }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M5 3.5v11l10-5.5-10-5.5z" fill="#fff" />
            </svg>
          </div>
        )}
      </div>
    );
  }

  // Placeholder — text preview
  return (
    <div className="w-full relative overflow-hidden flex-shrink-0" style={{ height: 220, background: '#F2F4F7', borderRadius: 10 }}>
      <div
        className="absolute bg-white"
        style={{ left: 24, right: 24, top: 20, bottom: -12, borderRadius: 6, boxShadow: '0px 4px 24px rgba(15,23,51,0.10)', padding: '18px 16px', overflow: 'hidden' }}
      >
        <div style={{ height: 7, width: '58%', background: '#C8CDD8', borderRadius: 2, marginBottom: 10 }} />
        {[100, 72, 88, 60, 95, 80, 66, 78, 55, 84].map((w, i) => (
          <div key={i} style={{ height: 4, width: `${w}%`, background: '#E2E5EC', borderRadius: 2, marginBottom: 5 }} />
        ))}
      </div>
    </div>
  );
}

/* ── Project dropdown items ── */
const DROPDOWN_ITEMS = [
  { key: 'cover-creator',   label: 'Cover & Mockup Creator',      icon: 'cover-creator' },
  { key: 'open-pdf',        label: 'Open PDF',                    icon: 'pdf' },
  { key: 'flipbook-pdf',    label: 'Open PDF in flipbook',        icon: 'flipbook' },
  { key: 'edit-live',       label: 'Edit live ebook options',     icon: 'edit' },
  { key: 'embed-code',      label: 'Generate flipbook embed code', icon: 'code' },
  { key: 'qr-code',         label: 'Generate QR code',            icon: 'qr' },
  { key: 'print-cover',     label: 'Create a Print or Kindle Cover', icon: 'print-cover', info: true },
  { key: 'share',           label: 'Share',                       icon: 'share' },
];
const DROPDOWN_ITEMS_2 = [
  { key: 'move',            label: 'Move',                        icon: 'move' },
  { key: 'save-template',   label: 'Save as template',            icon: 'save-template' },
  { key: 'duplicate',       label: 'Duplicate',                   icon: 'duplicate' },
  { key: 'landing',         label: 'Create landing page',         icon: 'landing' },
  { key: 'history',         label: 'Version history',             icon: 'history' },
  { key: 'info',            label: 'Project information',         icon: 'info' },
];

function DropdownIcon({ type }: { type: string }) {
  const s = { width: 20, height: 20, flexShrink: 0 as const };
  const stroke = '#15191F';
  switch (type) {
    case 'cover-creator': return <svg {...s} viewBox="0 0 24 24" fill="none"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case 'pdf': return <svg {...s} viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/><text x="6" y="18" style={{fontSize:'6px', fontFamily:'sans-serif', fontWeight:700}} fill={stroke}>PDF</text></svg>;
    case 'flipbook': return <svg {...s} viewBox="0 0 24 24" fill="none"><path d="M2 6a2 2 0 0 1 2-2h7v16H4a2 2 0 0 1-2-2V6z" stroke={stroke} strokeWidth="1.5"/><path d="M22 6a2 2 0 0 0-2-2h-7v16h7a2 2 0 0 0 2-2V6z" stroke={stroke} strokeWidth="1.5"/><path d="M11 4v16" stroke={stroke} strokeWidth="1.5"/></svg>;
    case 'edit': return <svg {...s} viewBox="0 0 24 24" fill="none"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5l-5 1.5 1.5-5L17 3z" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case 'code': return <svg {...s} viewBox="0 0 24 24" fill="none"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case 'qr': return <svg {...s} viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" stroke={stroke} strokeWidth="1.5"/><rect x="14" y="3" width="7" height="7" rx="1" stroke={stroke} strokeWidth="1.5"/><rect x="3" y="14" width="7" height="7" rx="1" stroke={stroke} strokeWidth="1.5"/><rect x="14" y="14" width="3" height="3" rx="0.5" stroke={stroke} strokeWidth="1.5"/><rect x="18" y="18" width="3" height="3" rx="0.5" stroke={stroke} strokeWidth="1.5"/><rect x="14" y="18" width="3" height="3" rx="0.5" stroke={stroke} strokeWidth="1.5"/><rect x="18" y="14" width="3" height="3" rx="0.5" stroke={stroke} strokeWidth="1.5"/></svg>;
    case 'print-cover': return <svg {...s} viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke={stroke} strokeWidth="1.5"/><path d="M3 9h18M9 3v18" stroke={stroke} strokeWidth="1.5"/></svg>;
    case 'share': return <svg {...s} viewBox="0 0 24 24" fill="none"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case 'move': return <svg {...s} viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 11v6M9 14l3 3 3-3" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case 'save-template': return <svg {...s} viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case 'duplicate': return <svg {...s} viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="13" height="13" rx="2" stroke={stroke} strokeWidth="1.5"/><path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/></svg>;
    case 'landing': return <svg {...s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={stroke} strokeWidth="1.5"/><path d="M12 3c0 0 3.5 4 3.5 9s-3.5 9-3.5 9M12 3c0 0-3.5 4-3.5 9s3.5 9 3.5 9M3 12h18" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/></svg>;
    case 'history': return <svg {...s} viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 3v5h5" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 7v5l4 2" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/></svg>;
    case 'info': return <svg {...s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={stroke} strokeWidth="1.5"/><path d="M12 11v6" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="7.5" r="1" fill={stroke}/></svg>;
    case 'turn-into-pres': return <svg {...s} viewBox="0 0 24 24" fill="none"><rect x="2" y="3" width="20" height="13" rx="2" stroke={stroke} strokeWidth="1.5"/><path d="M8 21h8M12 16v5" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/><path d="M9 10l2 1.5L15 8" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case 'delete': return <svg {...s} viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M5 6l1.5 14h11L19 6" stroke="#D62929" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 11v5M14 11v5" stroke="#D62929" strokeWidth="1.5" strokeLinecap="round"/></svg>;
    default: return null;
  }
}

/* ── Project card ── */
function ProjectCard({ project }: { project: Project }) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: r.top, left: r.right + 8 });
    }
    setMenuOpen(v => !v);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const renderItem = (item: { key: string; label: string; icon: string; info?: boolean }) => (
    <button
      key={item.key}
      onClick={() => setMenuOpen(false)}
      className="flex items-center gap-3 text-left cursor-pointer rounded-lg w-full"
      style={{ ...ns, fontSize: 15, fontWeight: 500, color: '#15191F', padding: '9px 12px', background: 'transparent', border: 'none' }}
      onMouseEnter={e => (e.currentTarget.style.background = '#F4F6F9')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <DropdownIcon type={item.icon} />
      <span className="flex-1">{item.label}</span>
      {item.info && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#C0C8D6" strokeWidth="1.5"/>
          <path d="M12 11v6" stroke="#C0C8D6" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="12" cy="7.5" r="1" fill="#C0C8D6"/>
        </svg>
      )}
    </button>
  );

  const dropdown = menuOpen && menuPos ? createPortal(
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      className="bg-white flex flex-col"
      style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, width: 270, borderRadius: 14, padding: '6px', boxShadow: '0px 8px 32px rgba(0,0,0,0.14)', zIndex: 9999 }}
      onClick={e => e.stopPropagation()}
    >
      {DROPDOWN_ITEMS.map(renderItem)}
      <div style={{ height: 1, background: '#E8EBF2', margin: '4px 8px' }} />
      {project.type !== 'presentation' && (
        <button
          onClick={() => setMenuOpen(false)}
          className="flex items-center gap-3 text-left cursor-pointer rounded-lg w-full"
          style={{ ...ns, fontSize: 15, fontWeight: 500, color: '#15191F', padding: '9px 12px', background: 'transparent', border: 'none' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#F4F6F9')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <DropdownIcon type="turn-into-pres" />
          <span className="flex-1">Turn into Presentation</span>
        </button>
      )}
      {DROPDOWN_ITEMS_2.map(renderItem)}
      <div style={{ height: 1, background: '#E8EBF2', margin: '4px 8px' }} />
      <button
        onClick={() => setMenuOpen(false)}
        className="flex items-center gap-3 text-left cursor-pointer rounded-lg"
        style={{ ...ns, fontSize: 15, fontWeight: 500, color: '#D62929', padding: '9px 12px', background: 'transparent', border: 'none' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <DropdownIcon type="delete" />
        Delete
      </button>
    </motion.div>,
    document.body
  ) : null;

  const showOverlay = hovered || menuOpen;

  return (
    <div
      className="relative flex flex-col cursor-pointer"
      style={{ gap: 10 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative">
        <CardThumbnail project={project} />

        {/* Checkbox */}
        {showOverlay && (
          <div
            className="absolute"
            style={{ top: 10, left: 10, width: 22, height: 22, borderRadius: 5, background: '#fff', border: '1.5px solid #D0D5DE', zIndex: 10 }}
          />
        )}

        {/* Eye + 3-dot buttons */}
        {showOverlay && (
          <div className="absolute flex items-center" style={{ top: 10, right: 10, gap: 6, zIndex: 10 }}>
            <button
              className="flex items-center justify-center cursor-pointer"
              style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(20,26,40,0.78)', border: 'none' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="#fff" strokeWidth="1.5"/>
                <circle cx="12" cy="12" r="3" stroke="#fff" strokeWidth="1.5"/>
              </svg>
            </button>
            <button
              ref={btnRef}
              onClick={openMenu}
              className="flex items-center justify-center cursor-pointer"
              style={{ width: 36, height: 36, borderRadius: 8, background: menuOpen ? '#006EFE' : 'rgba(20,26,40,0.78)', border: 'none', transition: 'background 0.12s' }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="4" cy="9" r="1.5" fill="#fff"/>
                <circle cx="9" cy="9" r="1.5" fill="#fff"/>
                <circle cx="14" cy="9" r="1.5" fill="#fff"/>
              </svg>
            </button>
          </div>
        )}

        {dropdown}
      </div>

      <div className="flex flex-col min-w-0" style={{ gap: 3 }}>
        <p className="truncate" style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F', lineHeight: '18px' }}>
          {project.title}
        </p>
        <p style={{ ...ns, fontSize: 12, color: '#8E99AB', lineHeight: '16px' }}>
          {project.date}
        </p>
      </div>
    </div>
  );
}

/* ── Main view ── */
export function ProjectsView() {
  const sidebarOpen = useFlowStore(s => s.sidebarOpen);
  const setSidebarOpen = useFlowStore(s => s.setSidebarOpen);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProjectType>('ebook');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');

  const filtered = PROJECTS.filter(p => p.type === activeTab && (!search || p.title.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="h-full flex flex-col bg-white">

      {/* ── Top header ── */}
      <div className="flex-shrink-0 flex items-center bg-white border-b border-border-light" style={{ height: 56, padding: '0 16px', gap: 12 }}>
        {/* Sidebar toggle */}
        <Tooltip label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'} position="right">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex-shrink-0 rounded-lg hover:bg-[#F6F7F9] transition-colors cursor-pointer flex items-center justify-center"
            style={{ width: 40, height: 40 }}
          >
            <SideMenuIcon active={sidebarOpen} />
          </button>
        </Tooltip>

        {/* Search */}
        <div className="flex-1 flex justify-center">
          <div className="flex items-center" style={{ gap: 10, height: 38, padding: '0 14px', borderRadius: 999, border: '1px solid #E0E5EB', background: '#fff', width: '100%', maxWidth: 560 }}>
            <SearchIcon />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search projects and docs"
              style={{ ...ns, fontSize: 14, color: '#15191F', background: 'transparent', border: 'none', outline: 'none', flex: 1 }}
            />
          </div>
        </div>

        {/* Create button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => router.push('/')}
          className="flex items-center cursor-pointer flex-shrink-0"
          style={{ gap: 6, height: 38, padding: '0 18px', borderRadius: 8, border: 'none', background: '#006EFE' }}
        >
          <PlusIcon />
          <span style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff' }}>Create</span>
        </motion.button>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">

        {/* Page title */}
        <div style={{ padding: '32px 32px 0' }}>
          <h1 style={{ ...ns, fontSize: 28, fontWeight: 700, color: '#15191F', margin: 0 }}>Projects</h1>
        </div>

        {/* ── Tabs + controls ── */}
        <div className="flex items-center" style={{ margin: '20px 0 0', padding: '0 32px', height: 52, gap: 0 }}>
          {/* Tabs */}
          <div className="flex items-end h-full" style={{ flex: 1, gap: 0, overflowX: 'auto' }}>
            {TABS.map(tab => {
              const active = activeTab === tab.id;
              const count = tabCount(tab.id as ProjectType);
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as ProjectType)}
                  className="relative flex items-center cursor-pointer h-full flex-shrink-0"
                  style={{ ...ns, fontSize: 15, fontWeight: active ? 600 : 400, color: active ? '#006EFE' : '#52637A', background: 'none', border: 'none', padding: '0 20px 0 0', marginRight: 8, gap: 5, whiteSpace: 'nowrap' }}
                >
                  {tab.label}
                  {count !== null && (
                    <span style={{ fontSize: 13, fontWeight: 500, color: active ? '#006EFE' : '#8E99AB' }}>({count})</span>
                  )}
                  {active && (
                    <motion.div
                      layoutId="proj-tab-underline"
                      className="absolute bottom-0 left-0"
                      style={{ right: 20, height: 2, background: '#006EFE', borderRadius: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Controls */}
          <div className="flex items-center flex-shrink-0" style={{ gap: 8 }}>
            <SortDropdown />
            <div className="flex items-center" style={{ gap: 2, padding: '3px', borderRadius: 8, border: '1px solid #E0E5EB' }}>
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
          </div>
        </div>

        {/* ── Card grid ── */}
        <div style={{ padding: '28px 32px 40px' }}>
          {filtered.length === 0 ? (
            <p style={{ ...ns, fontSize: 14, color: '#8E99AB', textAlign: 'center', marginTop: 60 }}>No projects found.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(240px, 1fr))' : '1fr', gap: viewMode === 'grid' ? 24 : 12 }}>
              {filtered.map(project => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
