'use client';

import { useState, useEffect, useRef, type ReactElement } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useFlowStore } from '@/stores/flowStore';
import { usePresentationFlowStore } from '@/stores/presentationFlowStore';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';

/* ── constants ──────────────────────────────────────────────────────────────── */

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

const WIZARD_STEPS = ['Generate', 'Writing a content', 'Choose template', 'Review', 'Publish'];

const POPULAR_THEMES = [
  { emoji: '📊', label: 'Business' },
  { emoji: '🧘', label: 'Lifestyle' },
  { emoji: '📚', label: 'Entrepreneurship' },
  { emoji: '✏️', label: 'Content Creation' },
  { emoji: '🎓', label: 'Education' },
  { emoji: '🏆', label: 'Success' },
  { emoji: '📈', label: 'Marketing' },
  { emoji: '🎨', label: 'Creative' },
  { emoji: '💡', label: 'Coaching' },
  { emoji: '💪', label: 'Health & wellness' },
  { emoji: '💻', label: 'Tech' },
  { emoji: '🖼️', label: 'Design' },
  { emoji: '⚡', label: 'Motivation' },
  { emoji: '✈️', label: 'Travel' },
  { emoji: '💰', label: 'Sales' },
];

interface Template {
  id: number;
  name: string;
  bg: string;
  textColor: string;
  accentColor: string;
  themes: string[];
}

const TEMPLATES: Template[] = [
  { id: 1,  name: 'SEO 2-05',                    bg: 'linear-gradient(160deg,#22c55e,#15803d)', textColor: '#fff',     accentColor: '#86efac', themes: ['Marketing', 'Business', 'Tech'] },
  { id: 2,  name: 'Social Media Marketing 2-05', bg: '#111827',                                 textColor: '#f59e0b', accentColor: '#fbbf24', themes: ['Content Creation', 'Education', 'Creative', 'Design'] },
  { id: 3,  name: 'Pro Print Book',              bg: '#f8f8f6',                                 textColor: '#111827', accentColor: '#6b7280', themes: ['Business', 'Entrepreneurship'] },
  { id: 4,  name: 'Echoes',                      bg: 'linear-gradient(160deg,#a78bfa,#7c3aed)', textColor: '#fff',     accentColor: '#c4b5fd', themes: ['Creative', 'Lifestyle'] },
  { id: 5,  name: 'Sunset',                      bg: 'linear-gradient(160deg,#fb923c,#dc2626)', textColor: '#fff',     accentColor: '#fcd34d', themes: ['Lifestyle', 'Motivation'] },
  { id: 6,  name: 'Kamy',                        bg: '#1a1a1a',                                 textColor: '#e5e7eb', accentColor: '#9ca3af', themes: ['Creative', 'Design'] },
  { id: 7,  name: 'Regalia',                     bg: 'linear-gradient(160deg,#d4a574,#b8860b)', textColor: '#1a1a1a', accentColor: '#78350f', themes: ['Business', 'Sales'] },
  { id: 8,  name: 'Bestseller',                  bg: '#111',                                    textColor: '#fff',     accentColor: '#d1d5db', themes: ['Business', 'Success'] },
  { id: 9,  name: 'Minimal Pro',                 bg: '#fff',                                    textColor: '#111827', accentColor: '#4b5563', themes: ['Business', 'Entrepreneurship'] },
  { id: 10, name: 'Business Blue',               bg: 'linear-gradient(160deg,#3b82f6,#1d4ed8)', textColor: '#fff',     accentColor: '#93c5fd', themes: ['Business', 'Marketing'] },
  { id: 11, name: 'Creative Orange',             bg: 'linear-gradient(160deg,#f97316,#ea580c)', textColor: '#fff',     accentColor: '#fed7aa', themes: ['Creative', 'Motivation'] },
  { id: 12, name: 'Nature Green',                bg: 'linear-gradient(160deg,#4ade80,#15803d)', textColor: '#fff',     accentColor: '#bbf7d0', themes: ['Health & wellness', 'Lifestyle'] },
];

const PUBLISH_FORMATS = [
  { id: 'pdf',      label: 'PDF',      sub: 'For adobe reader',        badgeBg: '#FEE2E2', badgeText: '#B91C1C',  icon: 'pdf' },
  { id: 'flipbook', label: 'Flipbook', sub: 'Set your book in motion', badgeBg: '#EDE9FE', badgeText: '#7C3AED',  icon: 'flipbook' },
  { id: 'kindle',   label: 'Kindle',   sub: 'E-pub export',            badgeBg: '#FEF3C7', badgeText: '#92400E',  icon: 'kindle' },
  { id: 'html',     label: 'HTML',     sub: 'Export html',             badgeBg: '#DBEAFE', badgeText: '#1D4ED8',  icon: 'html' },
  { id: 'epub',     label: 'EPUB',     sub: 'For e-readers',           badgeBg: '#D1FAE5', badgeText: '#065F46',  icon: 'epub' },
];

const DOC_TITLE = 'The Power of Unknowing: How Embracing Ignorance Can Lead to Wisdom';

/* ── tiny helpers ───────────────────────────────────────────────────────────── */

function CheckMark({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M2.5 7.2L5.2 9.8L11.5 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ChevDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 5.5L7 9l4-3.5" stroke="#52637A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ── stepper header ─────────────────────────────────────────────────────────── */

function WizardHeader({ step, sidebarOpen, onToggleSidebar }: {
  step: number;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  return (
    <div className="flex-shrink-0 bg-white border-b border-[#E0E5EB]" style={{ height: 56 }}>
      <div className="flex items-center h-full" style={{ padding: '0 16px' }}>
        <Tooltip label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'} position="right">
          <button
            onClick={onToggleSidebar}
            className="flex-shrink-0 flex items-center justify-center cursor-pointer rounded-lg hover:bg-[#F6F7F9] transition-colors"
            style={{ width: 36, height: 36 }}
          >
            <SideMenuIcon active={sidebarOpen} />
          </button>
        </Tooltip>

        <div className="flex-1 flex items-center justify-center" style={{ gap: 8 }}>
          {WIZARD_STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
              <div key={label} className="flex items-center" style={{ gap: 8 }}>
                {i > 0 && <div style={{ width: 32, height: 1, background: done || active ? '#006EFE' : '#E0E5EB' }} />}
                <div className="flex items-center" style={{ gap: 6 }}>
                  <div className="flex items-center justify-center flex-shrink-0 rounded-full"
                    style={{ width: 22, height: 22, background: done || active ? '#006EFE' : '#F1F2F4' }}>
                    {done
                      ? <CheckMark />
                      : <span style={{ ...ns, fontSize: 11, fontWeight: 700, color: active ? '#fff' : '#8E99AB' }}>{n}</span>}
                  </div>
                  <span style={{ ...ns, fontSize: 13, fontWeight: active ? 600 : 400, color: active || done ? '#15191F' : '#8E99AB', whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ width: 36 }} />
      </div>
    </div>
  );
}

/* ── Themes modal ───────────────────────────────────────────────────────────── */

function ThemesModal({ docTitle, initial, onSave, onClose }: {
  docTitle: string;
  initial: string[];
  onSave: (t: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(initial);
  const toggle = (label: string) =>
    setSelected(prev => prev.includes(label) ? prev.filter(t => t !== label) : [...prev, label]);
  const display = selected.length === 0 ? 'Select your theme' : selected.join(', ');

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(15,23,51,0.3)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white flex flex-col relative"
        style={{ width: 480, borderRadius: 16, boxShadow: '0px 8px 40px rgba(0,0,0,0.16)', padding: '28px 28px 24px' }}
        onClick={e => e.stopPropagation()}
      >
        {/* close */}
        <button onClick={onClose} className="absolute cursor-pointer flex items-center justify-center"
          style={{ top: 16, right: 16, width: 28, height: 28, borderRadius: '50%', background: '#F4F6F9', border: 'none' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <h2 style={{ ...ns, fontSize: 20, fontWeight: 700, color: '#15191F', marginBottom: 5 }}>Themes of the doc</h2>
        <p style={{ ...ns, fontSize: 14, color: '#52637A', lineHeight: 1.5, marginBottom: 22 }}>{docTitle}</p>

        <label style={{ ...ns, fontSize: 14, fontWeight: 500, color: '#15191F', display: 'block', marginBottom: 8 }}>
          Select your theme
        </label>
        <div className="flex items-center justify-between cursor-pointer"
          style={{ height: 44, padding: '0 16px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', userSelect: 'none' }}>
          <span style={{ ...ns, fontSize: 14, color: selected.length ? '#15191F' : '#8596AD' }}>{display}</span>
          <ChevDown />
        </div>

        <div style={{ marginTop: 20 }}>
          <p style={{ ...ns, fontSize: 14, fontWeight: 500, color: '#15191F', marginBottom: 14 }}>Most popular themes</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {POPULAR_THEMES.map(t => {
              const sel = selected.includes(t.label);
              return (
                <button key={t.label} onClick={() => toggle(t.label)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 999, border: `1.5px solid ${sel ? '#006EFE' : '#E0E5EB'}`, background: '#fff', cursor: 'pointer', ...ns, fontSize: 14, color: '#15191F', transition: 'border-color 0.12s' }}>
                  <span>{t.emoji}</span><span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end" style={{ gap: 10, marginTop: 24 }}>
          <button onClick={() => onSave(selected)}
            style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0058CC'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
            Save
          </button>
          <button onClick={onClose}
            style={{ ...ns, fontSize: 14, fontWeight: 500, color: '#52637A', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '10px 24px', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── template cover mock ────────────────────────────────────────────────────── */

function TemplateCover({ t, height = 300, title }: { t: Template; height?: number; title?: string }) {
  const isLight = t.bg === '#f8f8f6' || t.bg === '#fff';
  return (
    <div style={{ width: '100%', height, background: t.bg, borderRadius: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 16px', gap: 8, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ width: 40, height: 3, borderRadius: 2, background: t.accentColor, marginBottom: 4 }} />
      <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, fontFamily: 'Georgia, serif', color: t.textColor, lineHeight: 1.25, textTransform: 'uppercase', letterSpacing: 1, maxWidth: '82%', wordBreak: 'break-word' }}>
        {title ?? t.name}
      </div>
      <div style={{ width: 50, height: 1.5, borderRadius: 1, background: `${t.textColor}55` }} />
      <div style={{ fontSize: 9, color: `${t.textColor}77`, fontFamily: "'Nunito Sans', sans-serif" }}>Author Name</div>
      {isLight && <div style={{ position: 'absolute' as const, bottom: 0, left: 0, right: 0, height: 3, background: t.accentColor, opacity: 0.5 }} />}
    </div>
  );
}

/* ── template gallery ───────────────────────────────────────────────────────── */

function TemplateCard({ t, onClick }: { t: Template; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="flex flex-col cursor-pointer" style={{ gap: 10 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}>
      <div className="relative overflow-hidden"
        style={{ borderRadius: 8, border: `1.5px solid ${hovered ? '#006EFE' : '#E8EBF2'}`, transition: 'border-color 0.15s, box-shadow 0.15s', boxShadow: hovered ? '0 4px 16px rgba(0,110,254,0.12)' : '0 2px 8px rgba(0,0,0,0.06)' }}>
        <TemplateCover t={t} height={260} />
        {hovered && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.32)' }}>
            <span style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#fff', background: '#006EFE', borderRadius: 8, padding: '8px 18px' }}>Preview</span>
          </div>
        )}
      </div>
      <p style={{ ...ns, fontSize: 13, fontWeight: 500, color: '#15191F', lineHeight: '18px' }}>{t.name}</p>
    </div>
  );
}

function TemplateLightbox({ t, allTemplates, onUse, onClose }: {
  t: Template;
  allTemplates: Template[];
  onUse: () => void;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(allTemplates.findIndex(x => x.id === t.id));
  const current = allTemplates[idx];
  const prev = () => setIdx(i => (i - 1 + allTemplates.length) % allTemplates.length);
  const next = () => setIdx(i => (i + 1) % allTemplates.length);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white flex overflow-hidden relative"
        style={{ width: 960, maxHeight: '88vh', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* nav arrows */}
        {(['prev', 'next'] as const).map(dir => (
          <button key={dir} onClick={dir === 'prev' ? prev : next}
            className="absolute flex items-center justify-center cursor-pointer z-10"
            style={{ [dir === 'prev' ? 'left' : 'right']: 16, top: '38%', width: 36, height: 36, borderRadius: '50%', background: '#fff', border: '1px solid #E0E5EB', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2" strokeLinecap="round">
              {dir === 'prev' ? <path d="M15 18l-6-6 6-6"/> : <path d="M9 18l6-6-6-6"/>}
            </svg>
          </button>
        ))}

        {/* left preview */}
        <div className="flex flex-col flex-1 min-w-0" style={{ padding: 28, background: '#F6F7F9', gap: 14 }}>
          <TemplateCover t={current} height={380} title={DOC_TITLE} />
          <div className="flex" style={{ gap: 8 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ flex: 1, borderRadius: 4, overflow: 'hidden', border: i === 0 ? '2px solid #006EFE' : '1.5px solid #E0E5EB' }}>
                {i === 0
                  ? <TemplateCover t={current} height={68} title={DOC_TITLE} />
                  : <div style={{ height: 68, background: '#fff', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ width: '65%', height: 4, background: '#E0E5EB', borderRadius: 2 }}/>
                      {[90, 75, 85, 60, 80].map((w, j) => <div key={j} style={{ width: `${w}%`, height: 2.5, background: '#F0F2F5', borderRadius: 2 }}/>)}
                    </div>}
              </div>
            ))}
          </div>
        </div>

        {/* right info */}
        <div className="flex flex-col" style={{ width: 300, padding: '32px 24px', flexShrink: 0 }}>
          <button onClick={onClose} className="absolute cursor-pointer flex items-center justify-center"
            style={{ top: 16, right: 16, width: 28, height: 28, borderRadius: '50%', background: '#F4F6F9', border: 'none' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          <h3 style={{ ...ns, fontSize: 18, fontWeight: 700, color: '#15191F', marginBottom: 8 }}>{current.name}</h3>
          <p style={{ ...ns, fontSize: 13, color: '#52637A', lineHeight: 1.6, marginBottom: 20 }}>
            You'll be able to play with the template & change covers inside the editor
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
            {current.themes.map(label => {
              const td = POPULAR_THEMES.find(p => p.label === label);
              return (
                <span key={label} style={{ ...ns, fontSize: 13, color: '#52637A', background: '#F4F6F9', borderRadius: 999, padding: '5px 12px', border: '1px solid #E8EBF2', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {td?.emoji} {label}
                </span>
              );
            })}
          </div>

          <button onClick={onUse}
            style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 8, padding: '11px 0', cursor: 'pointer', width: '100%', marginBottom: 10 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0058CC'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
            Use this template
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            {(['Preview in web', 'Preview in PDF'] as const).map(label => (
              <button key={label} style={{ ...ns, fontSize: 12, fontWeight: 500, color: '#52637A', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '9px 0', cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  {label.includes('web')
                    ? <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>
                    : <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><path d="M14 2v6h6"/></>}
                </svg>
                {label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TemplateGallery({ selectedThemes, onUse, onBack }: {
  selectedThemes: string[];
  onUse: (t: Template) => void;
  onBack: () => void;
}) {
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState('Letter');
  const [orientation, setOrientation] = useState('Portrait');
  const [preview, setPreview] = useState<Template | null>(null);
  const themesLabel = selectedThemes.length ? `Themes: ${selectedThemes.join(', ')}` : 'Themes';

  const filtered = TEMPLATES.filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    const matchTheme = selectedThemes.length === 0 || t.themes.some(th => selectedThemes.includes(th));
    return matchSearch && matchTheme;
  });

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* Back bar */}
      <div className="flex-shrink-0 border-b border-[#E0E5EB]" style={{ padding: '14px 32px' }}>
        <button onClick={onBack} className="flex items-center cursor-pointer"
          style={{ gap: 6, ...ns, fontSize: 13, fontWeight: 500, color: '#52637A', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '7px 14px' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#F4F6F9'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Back
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '28px 32px 40px' }}>
        <h1 style={{ ...ns, fontSize: 26, fontWeight: 700, color: '#15191F', marginBottom: 22 }}>Choose a template</h1>

        {/* Filters */}
        <div className="flex items-center" style={{ gap: 12, marginBottom: 28 }}>
          <div className="flex-1 flex items-center" style={{ gap: 10, height: 42, padding: '0 16px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', maxWidth: 520 }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><circle cx="8" cy="8" r="5.5" stroke="#8E99AB" strokeWidth="1.5"/><path d="M12.5 12.5L16 16" stroke="#8E99AB" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search for a template"
              style={{ flex: 1, border: 'none', outline: 'none', ...ns, fontSize: 14, color: '#15191F', background: 'transparent' }}/>
          </div>

          {/* Filter pills */}
          {[
            { label: 'Type', val: '', set: () => {} },
            { label: themesLabel, val: '', set: () => {} },
            { label: `Page Size: ${pageSize}`, val: pageSize, set: setPageSize },
            { label: `Orientation: ${orientation}`, val: orientation, set: setOrientation },
          ].map(f => (
            <button key={f.label} className="flex items-center cursor-pointer flex-shrink-0"
              style={{ gap: 6, height: 42, padding: '0 14px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', ...ns, fontSize: 13, fontWeight: 500, color: '#15191F', whiteSpace: 'nowrap' }}>
              {f.label}
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 5.5L7 9l4-3.5" stroke="#52637A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          ))}
        </div>

        {/* Grid */}
        {filtered.length === 0
          ? <p style={{ ...ns, fontSize: 14, color: '#8596AD', textAlign: 'center', marginTop: 60 }}>No templates found.</p>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
              {filtered.map(t => (
                <TemplateCard key={t.id} t={t} onClick={() => setPreview(t)} />
              ))}
            </div>}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {preview && (
          <TemplateLightbox
            t={preview}
            allTemplates={filtered}
            onUse={() => { setPreview(null); onUse(preview); }}
            onClose={() => setPreview(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── step 4: review ─────────────────────────────────────────────────────────── */

function ReviewView({ template, onPublish }: { template: Template; onPublish: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    rafRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(rafRef.current!); setTimeout(() => setLoaded(true), 400); return 100; }
        return p + (Math.random() * 8 + 4);
      });
    }, 180);
    return () => { if (rafRef.current) clearInterval(rafRef.current); };
  }, []);

  // Page thumbnails (right strip)
  const thumbs = Array.from({ length: 7 });

  if (!loaded) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-white">
        {/* Progress bar */}
        <div style={{ height: 4, background: '#E0E5EB', flexShrink: 0 }}>
          <motion.div style={{ height: 4, background: '#006EFE', borderRadius: 2 }}
            animate={{ width: `${Math.min(progress, 100)}%` }} transition={{ duration: 0.3 }}/>
        </div>
        <div className="flex items-start" style={{ gap: 8, padding: '20px 32px 0' }}>
          <span style={{ fontSize: 18 }}>🖌</span>
          <span style={{ ...ns, fontSize: 15, color: '#15191F' }}>Weaving the words and crafting the perfect design fit...</span>
        </div>

        <div className="flex-1 flex overflow-hidden" style={{ padding: '20px 16px 20px 32px', gap: 16 }}>
          {/* Center placeholder */}
          <div className="flex-1 flex items-center justify-center" style={{ background: '#F2F4F7', borderRadius: 8 }} />
          {/* Right thumbnails */}
          <div className="flex flex-col flex-shrink-0" style={{ width: 80, gap: 8 }}>
            {thumbs.map((_, i) => (
              <div key={i} style={{ width: 80, height: 96, background: '#E8EBF2', borderRadius: 4 }}/>
            ))}
          </div>
        </div>

        {/* Toast */}
        <div className="flex items-center justify-center" style={{ padding: '0 0 24px' }}>
          <div className="flex items-center" style={{ gap: 10, background: '#1E2A3B', borderRadius: 8, padding: '10px 18px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#fff" strokeWidth="2" strokeOpacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="2" strokeLinecap="round" className="animate-spin" style={{ transformOrigin: '12px 12px' }}/></svg>
            <span style={{ ...ns, fontSize: 13, color: '#fff' }}>Preparing project preview...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden bg-white">
      {/* TOC icon */}
      <div className="flex-shrink-0 flex items-center pl-4" style={{ width: 48 }}>
        <svg width="24" height="40" viewBox="0 0 24 40" fill="none">
          {[0, 8, 16, 24, 32, 40].map((y, i) => (
            <rect key={i} x="0" y={y} width={i === 2 ? 24 : 12} height="2" rx="1" fill={i === 2 ? '#52637A' : '#C2CBD6'}/>
          ))}
        </svg>
      </div>

      {/* Center preview */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ padding: '20px 16px' }}>
        {/* Action bar */}
        <div className="flex items-center justify-end flex-shrink-0" style={{ gap: 10, marginBottom: 16 }}>
          <button style={{ ...ns, fontSize: 13, fontWeight: 500, color: '#52637A', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit design
          </button>
          <button onClick={onPublish}
            style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0058CC'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
            Publish
          </button>
        </div>

        {/* Book preview */}
        <div className="flex-1 overflow-hidden rounded-lg" style={{ background: '#F0F2F5' }}>
          <div className="h-full flex items-center justify-center p-8">
            <div style={{ width: '60%', maxWidth: 440, aspectRatio: '3/4', borderRadius: 6, overflow: 'hidden', boxShadow: '0 12px 48px rgba(0,0,0,0.22)' }}>
              <TemplateCover t={template} height={600} title={DOC_TITLE} />
            </div>
          </div>
        </div>

        {/* Full screen link */}
        <div style={{ padding: '10px 0 0' }}>
          <button style={{ ...ns, fontSize: 13, color: '#006EFE', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
            Full screen
          </button>
        </div>
      </div>

      {/* Right thumbnails */}
      <div className="flex-shrink-0 flex flex-col overflow-y-auto" style={{ width: 96, padding: '20px 16px 20px 0', gap: 8 }}>
        {thumbs.map((_, i) => (
          <div key={i} style={{ width: 80, height: 96, borderRadius: 4, overflow: 'hidden', border: i === 0 ? '2px solid #006EFE' : '1.5px solid #E0E5EB', flexShrink: 0, cursor: 'pointer' }}>
            {i === 0
              ? <TemplateCover t={template} height={96} title={DOC_TITLE} />
              : <div style={{ height: '100%', background: '#fff', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ width: '70%', height: 3, background: '#E0E5EB', borderRadius: 2 }}/>
                  {[90, 75, 85, 60, 80, 70].map((w, j) => <div key={j} style={{ width: `${w}%`, height: 2, background: '#F0F2F5', borderRadius: 2 }}/>)}
                </div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── step 5: publish ────────────────────────────────────────────────────────── */

function FormatIcon({ id }: { id: string }) {
  const map: Record<string, ReactElement> = {
    pdf: (
      <div style={{ width: 36, height: 36, borderRadius: 8, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#FCA5A5" stroke="#B91C1C" strokeWidth="1"/><path d="M14 2v6h6" stroke="#B91C1C" strokeWidth="1" strokeLinecap="round"/><text x="6" y="18" style={{ fontSize: '5.5px', fontFamily: 'sans-serif', fontWeight: 700 }} fill="#B91C1C">PDF</text></svg>
      </div>
    ),
    flipbook: (
      <div style={{ width: 36, height: 36, borderRadius: 8, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M2 6a2 2 0 0 1 2-2h7v16H4a2 2 0 0 1-2-2V6z" fill="#C4B5FD" stroke="#7C3AED" strokeWidth="1"/><path d="M22 6a2 2 0 0 0-2-2h-7v16h7a2 2 0 0 0 2-2V6z" fill="#DDD6FE" stroke="#7C3AED" strokeWidth="1"/></svg>
      </div>
    ),
    kindle: (
      <div style={{ width: 36, height: 36, borderRadius: 8, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#FDE68A" stroke="#92400E" strokeWidth="1"/><text x="6" y="15" style={{ fontSize: '5px', fontFamily: 'serif', fontWeight: 700 }} fill="#92400E">Kindle</text></svg>
      </div>
    ),
    html: (
      <div style={{ width: 36, height: 36, borderRadius: 8, background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6" stroke="#1D4ED8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
    ),
    epub: (
      <div style={{ width: 36, height: 36, borderRadius: 8, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#A7F3D0" stroke="#065F46" strokeWidth="1"/><path d="M9 12l2 2 4-4" stroke="#065F46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
    ),
  };
  return map[id] ?? null;
}

function PublishView({ template, onBack }: { template: Template; onBack: () => void }) {
  const router = useRouter();
  const setSelectedManuscriptId = usePresentationFlowStore((s) => s.setSelectedManuscriptId);

  const [format, setFormat] = useState('pdf');
  const [title, setTitle] = useState('The Power of Unknowing: How Embracing Ignorance');
  const [author, setAuthor] = useState('');
  const [desc, setDesc] = useState('');
  const [compress, setCompress] = useState(true);
  const [published, setPublished] = useState(false);
  const [copied, setCopied] = useState(false);

  const mockUrl = 'https://designrr.s3.amazonaws.com/klimiashvilinn_568/the-power-of-unknowing';

  const handleTurnIntoPresentation = () => {
    setSelectedManuscriptId('m-1');
    router.push('/presentation/sections');
  };

  return (
    <div className="h-full relative overflow-hidden">
    {/* Publish step content — always rendered so backdrop-blur has something to blur */}
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* Back + action bar */}
      <div className="flex-shrink-0 border-b border-[#E0E5EB] flex items-center justify-between" style={{ padding: '0 32px', height: 56 }}>
        <button onClick={onBack} className="flex items-center cursor-pointer"
          style={{ gap: 6, ...ns, fontSize: 13, fontWeight: 500, color: '#52637A', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '7px 14px' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#F4F6F9'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Back
        </button>
        <div className="flex items-center" style={{ gap: 10 }}>
          <button style={{ ...ns, fontSize: 13, fontWeight: 500, color: '#52637A', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit design
          </button>
          <button onClick={() => setPublished(true)}
            style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0058CC'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
            Publish
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '32px 48px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        {/* Book info + stats */}
        <div className="flex items-start justify-between" style={{ marginBottom: 32 }}>
          <div>
            <p style={{ ...ns, fontSize: 12, color: '#8596AD', marginBottom: 5 }}>E-book name</p>
            <h1 style={{ ...ns, fontSize: 20, fontWeight: 700, color: '#15191F', lineHeight: 1.35, marginBottom: 6, maxWidth: 420 }}>{DOC_TITLE}</h1>
            <p style={{ ...ns, fontSize: 13, color: '#8596AD' }}>Author name</p>
          </div>
          <div className="flex items-center" style={{ gap: 0, border: '1px solid #E0E5EB', borderRadius: 10, overflow: 'hidden' }}>
            {[
              { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/></svg>, val: '90', label: 'Pages' },
              { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.6"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="4" y1="14" x2="14" y2="14"/></svg>, val: '8', label: 'Chapters' },
              { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.6" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h8"/></svg>, val: '20420', label: 'Words' },
              { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>, val: '103', label: 'Read time' },
            ].map((s, i, arr) => (
              <div key={s.label} className="flex items-center" style={{ padding: '14px 20px', borderRight: i < arr.length - 1 ? '1px solid #E0E5EB' : 'none', gap: 8 }}>
                {s.icon}
                <div>
                  <div style={{ ...ns, fontSize: 16, fontWeight: 700, color: '#15191F' }}>{s.val}</div>
                  <div style={{ ...ns, fontSize: 11, color: '#8596AD' }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex" style={{ gap: 40 }}>
          {/* Format list */}
          <div className="flex-1 min-w-0">
            <h2 style={{ ...ns, fontSize: 18, fontWeight: 700, color: '#15191F', marginBottom: 20 }}>How would you like to publish?</h2>
            <div className="flex flex-col" style={{ gap: 10 }}>
              {PUBLISH_FORMATS.map(f => (
                <button key={f.id} onClick={() => setFormat(f.id)}
                  className="flex items-center text-left cursor-pointer"
                  style={{ gap: 14, padding: '16px 18px', borderRadius: 10, border: `2px solid ${format === f.id ? '#006EFE' : '#E0E5EB'}`, background: '#fff', transition: 'border-color 0.12s' }}>
                  {/* radio */}
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${format === f.id ? '#006EFE' : '#C5CDD9'}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {format === f.id && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#006EFE' }}/>}
                  </div>
                  <FormatIcon id={f.id} />
                  <div>
                    <div style={{ ...ns, fontSize: 15, fontWeight: 600, color: '#15191F' }}>{f.label}</div>
                    <div style={{ ...ns, fontSize: 13, color: '#8596AD' }}>{f.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right settings */}
          <div style={{ width: 340, flexShrink: 0 }}>
            <div className="flex flex-col" style={{ gap: 16 }}>
              {[
                { label: 'Title', val: title, set: setTitle, multiline: false },
                { label: 'Author', val: author, set: setAuthor, multiline: false },
                { label: 'Description', val: desc, set: setDesc, multiline: true },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#52637A', display: 'block', marginBottom: 6 }}>{f.label}</label>
                  {f.multiline
                    ? <textarea value={f.val} onChange={e => f.set(e.target.value)} placeholder=""
                        style={{ ...ns, fontSize: 14, color: '#15191F', width: '100%', height: 100, padding: '10px 12px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', resize: 'vertical', outline: 'none', lineHeight: 1.5 }}/>
                    : <input value={f.val} onChange={e => f.set(e.target.value)}
                        style={{ ...ns, fontSize: 14, color: '#15191F', width: '100%', height: 40, padding: '0 12px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', outline: 'none' }}/>}
                </div>
              ))}

              {/* Compress PDF toggle */}
              <div className="flex items-center" style={{ gap: 10 }}>
                <button onClick={() => setCompress(v => !v)} style={{ width: 40, height: 22, borderRadius: 999, background: compress ? '#006EFE' : '#E0E5EB', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.15s', flexShrink: 0 }}>
                  <motion.div animate={{ left: compress ? 20 : 2 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                    style={{ position: 'absolute', top: 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}/>
                </button>
                <span style={{ ...ns, fontSize: 14, color: '#15191F' }}>Compress PDF</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Success modal overlay */}
    {published && (
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm overflow-y-auto flex items-start justify-center" style={{ padding: '48px 24px' }}>
        <div className="w-full" style={{ maxWidth: 720, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
          {/* Dark header with book cover */}
          <div className="relative flex items-center justify-center" style={{ background: template.bg, minHeight: 230 }}>
            <button
              onClick={onBack}
              style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
            <div style={{ width: 148, borderRadius: 8, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.5)', margin: '28px 0 32px' }}>
              <TemplateCover t={template} height={197} title={DOC_TITLE} />
            </div>
          </div>

          {/* White content */}
          <div style={{ background: '#fff', padding: '28px 48px 40px' }}>
            <h2 style={{ ...ns, fontSize: 22, fontWeight: 700, color: '#15191F', marginBottom: 16 }}>Your eBook is now live!</h2>

            {/* URL row */}
            <div className="flex items-center" style={{ gap: 8, marginBottom: 24 }}>
              <div className="flex-1 flex items-center" style={{ background: '#F6F7F9', borderRadius: 8, padding: '10px 14px', minWidth: 0 }}>
                <span className="truncate" style={{ ...ns, fontSize: 13, color: '#52637A' }}>{mockUrl}</span>
              </div>
              <button onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#006EFE', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1"/></svg>
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#15191F', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', flexShrink: 0 }}>Download</button>
            </div>

            {/* Turn into Presentation nudge */}
            <div style={{ borderRadius: 12, background: 'linear-gradient(135deg,#0A1628 0%,#1A1060 60%,#2D1B8A 100%)', padding: '18px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flexShrink: 0, width: 72, height: 50, borderRadius: 6, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ width: '70%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.55)' }}/>
                <div style={{ width: '100%', height: 2.5, borderRadius: 2, background: 'rgba(255,255,255,0.22)' }}/>
                <div style={{ width: '85%', height: 2.5, borderRadius: 2, background: 'rgba(255,255,255,0.22)' }}/>
                <div style={{ width: '60%', height: 2.5, borderRadius: 2, background: 'rgba(255,255,255,0.22)' }}/>
              </div>
              <div className="flex flex-col flex-1 min-w-0" style={{ gap: 2 }}>
                <p style={{ ...ns, fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>Turn into Presentation</p>
                <p style={{ ...ns, fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.45 }}>
                  Repurpose your content as a polished slide deck in minutes
                </p>
              </div>
              <button
                onClick={handleTurnIntoPresentation}
                style={{ flexShrink: 0, ...ns, fontSize: 13, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', whiteSpace: 'nowrap', backdropFilter: 'blur(4px)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.24)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
              >
                Create slides →
              </button>
            </div>

            {/* Socials */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ ...ns, fontSize: 15, fontWeight: 700, color: '#15191F', marginBottom: 10 }}>Socials</p>
              <div className="flex" style={{ gap: 8 }}>
                {[
                  { label: 'Facebook', bg: '#1877F2', icon: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" fill="none"/> },
                  { label: 'X', bg: '#000', icon: <path d="M4 4l16 16M20 4L4 20" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/> },
                  { label: 'LinkedIn', bg: '#0A66C2', icon: <><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" fill="none"/><rect x="2" y="9" width="4" height="12" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" fill="none"/><circle cx="4" cy="4" r="2" stroke="#fff" strokeWidth="1.5" fill="none"/></> },
                ].map(s => (
                  <button key={s.label}
                    style={{ width: 40, height: 40, borderRadius: 10, background: s.bg, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">{s.icon}</svg>
                  </button>
                ))}
              </div>
            </div>

            {/* Promote */}
            <div>
              <p style={{ ...ns, fontSize: 15, fontWeight: 700, color: '#15191F', marginBottom: 10 }}>Promote your eBook</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { icon: '🌐', label: 'Create landing page' },
                  { icon: '📦', label: 'Create 3d covers & Mockups' },
                  { icon: '📱', label: 'Generate QR code' },
                  { icon: '✉️', label: 'Share with e-mail' },
                ].map(a => (
                  <button key={a.label}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 10, border: '1px solid #E0E5EB', background: '#fff', cursor: 'pointer', ...ns, fontSize: 14, fontWeight: 500, color: '#15191F' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#F6F7F9'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                    <span style={{ fontSize: 18 }}>{a.icon}</span>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}

/* ── step 2: writing a content ──────────────────────────────────────────────── */

const MOCK_PARAGRAPHS = [
  "I used to believe I wasn't doing enough. I needed to read one more book, listen to one more podcast, take one more course. Instead, I felt exhausted. My brain was in a constant state of seeking. I'd lie in bed at night, replaying conversations, second-guessing my decisions, berating myself for not having the answers—even in domains I was only just learning, coming from—only that I couldn't.",
  "That pressure came with me everywhere. Into meetings. Into quiet weekend mornings. Into relationships. I was living under the assumption that if I just consumed more, thought more, prepared more, I'd finally feel ready. Whenever I hit a gap in my knowledge, I didn't lean in with curiosity. I panicked. I'd spend hours researching trying to feel on top of something before engaging with it. The irony was that the more I learned, the wider my sense of what I didn't know became—fueling the cycle. I was chasing a finish line that kept moving.",
  "The breaking point came during a week that, on paper, should have been unremarkable. I was facing a handful of small decisions—nothing life-altering—and I froze. I couldn't choose a direction for a project because I hadn't analyzed every precedent. I couldn't respond to a simple email because I wasn't sure of the perfect phrasing. My brain had become so trained to demand certainty that it had forgotten how to move without it. In that stillness, something shifted.",
];

function WritingContentView({ onChooseFormat }: { onChooseFormat: () => void }) {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* Editing toolbar */}
      <div className="flex-shrink-0 border-b border-[#E0E5EB]" style={{ height: 52 }}>
        <div className="flex items-center justify-between h-full" style={{ padding: '0 20px' }}>
          <div className="flex items-center" style={{ gap: 8 }}>
            <span style={{ ...ns, fontSize: 13, color: '#52637A' }}>Last edited: <strong style={{ color: '#15191F' }}>today at 10:50</strong></span>
            <div style={{ width: 1, height: 16, background: '#E0E5EB' }} />
            <span className="flex items-center" style={{ gap: 5, ...ns, fontSize: 13, color: '#29A341' }}>
              <svg width="20" height="14" viewBox="1 5 25.5 18" fill="none">
                <path d="M16.3205 8.98969C15.3213 7.56945 13.6752 6.64688 11.8109 6.64688C8.84797 6.64688 6.43242 8.98203 6.30227 11.9105C6.2793 12.4082 5.95773 12.8446 5.48688 13.013C3.81781 13.6026 2.62344 15.1913 2.62344 17.0594C2.62344 19.429 4.54133 21.3469 6.91094 21.3469H20.9984C23.0273 21.3469 24.6734 19.7008 24.6734 17.6719C24.6734 16.2631 23.881 15.0381 22.7134 14.4218C22.2005 14.15 21.9478 13.5605 22.1086 13.0016C22.1852 12.7374 22.2234 12.4541 22.2234 12.1594C22.2234 10.4673 20.853 9.09688 19.1609 9.09688C18.6901 9.09688 18.246 9.20406 17.8479 9.39164C17.3081 9.64812 16.665 9.47969 16.3205 8.98969Z" fill="#29A341"/>
                <path d="M17.756 13.2045L12.856 18.1045C12.6187 18.3418 12.2282 18.3418 11.9909 18.1045L9.54086 15.6545C9.30352 15.4171 9.30352 15.0266 9.54086 14.7893C9.7782 14.552 10.1687 14.552 10.406 14.7893L12.4234 16.8067L16.8909 12.3393C17.1282 12.102 17.5187 12.102 17.756 12.3393C17.9934 12.5766 17.9934 12.9671 17.756 13.2045Z" fill="#29A341"/>
              </svg>
              Saved
            </span>
          </div>
          <div className="flex items-center" style={{ gap: 4 }}>
            {/* Undo */}
            <button className="flex items-center justify-center cursor-pointer rounded-md hover:bg-[#F4F6F9] transition-colors" style={{ width: 36, height: 36, border: 'none', background: 'none' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3D4A5C" strokeWidth="1.8" strokeLinecap="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 2.3-5.7L3 7"/></svg>
            </button>
            {/* Redo */}
            <button className="flex items-center justify-center cursor-pointer rounded-md hover:bg-[#F4F6F9] transition-colors" style={{ width: 36, height: 36, border: 'none', background: 'none' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C5CDD9" strokeWidth="1.8" strokeLinecap="round"><path d="M21 7v6h-6"/><path d="M21 13a9 9 0 1 1-2.3-5.7L21 7"/></svg>
            </button>
            <div style={{ width: 1, height: 16, background: '#E0E5EB', margin: '0 4px' }} />
            {/* Mic */}
            <button className="flex items-center justify-center cursor-pointer rounded-md hover:bg-[#F4F6F9] transition-colors" style={{ width: 36, height: 36, border: 'none', background: 'none' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.8" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>
            </button>
            <button onClick={onChooseFormat}
              style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 4 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#0058CC'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
              Choose a book format
            </button>
            <button className="flex items-center justify-center cursor-pointer rounded-md hover:bg-[#F4F6F9] transition-colors" style={{ width: 36, height: 36, border: 'none', background: 'none', marginLeft: 2 }}>
              <svg width="4" height="16" viewBox="0 0 4 20" fill="none"><circle cx="2" cy="2" r="2" fill="#52637A"/><circle cx="2" cy="10" r="2" fill="#52637A"/><circle cx="2" cy="18" r="2" fill="#52637A"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Manuscript content */}
      <div className="flex-1 overflow-y-auto bg-white" style={{ padding: '40px 0' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 48px' }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 700, color: '#15191F', lineHeight: 1.3, marginBottom: 32 }}>{DOC_TITLE}</h1>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 700, color: '#15191F', marginBottom: 16 }}>Introduction</h2>
          <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 600, color: '#15191F', marginBottom: 14 }}>My Story</h3>
          {MOCK_PARAGRAPHS.map((p, i) => (
            <p key={i} style={{ ...ns, fontSize: 15, color: '#29323D', lineHeight: 1.8, marginBottom: 20 }}>{p}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── main orchestrator ──────────────────────────────────────────────────────── */

export function EbookCreateFlow({ startStep = 2 }: { startStep?: 2 | 3 }) {
  const sidebarOpen = useFlowStore(s => s.sidebarOpen);
  const setSidebarOpen = useFlowStore(s => s.setSidebarOpen);

  const [step, setStep] = useState<number>(startStep);
  const [showThemesModal, setShowThemesModal] = useState(false);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(TEMPLATES[1]);

  const handleSaveThemes = (themes: string[]) => {
    setSelectedThemes(themes);
    setShowThemesModal(false);
    setStep(3);
  };

  const handleUseTemplate = (t: Template) => {
    setSelectedTemplate(t);
    setStep(4);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WizardHeader step={step} sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

      <div className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">
          {step === 2 && (
            <motion.div key="step2" className="absolute inset-0"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}>
              <WritingContentView onChooseFormat={() => setShowThemesModal(true)} />
            </motion.div>
          )}
          {step === 3 && (
            <motion.div key="step3" className="absolute inset-0"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.22 }}>
              <TemplateGallery selectedThemes={selectedThemes} onUse={handleUseTemplate} onBack={() => setStep(2)} />
            </motion.div>
          )}
          {step === 4 && (
            <motion.div key="step4" className="absolute inset-0"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.22 }}>
              <ReviewView template={selectedTemplate} onPublish={() => setStep(5)} />
            </motion.div>
          )}
          {step === 5 && (
            <motion.div key="step5" className="absolute inset-0"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.22 }}>
              <PublishView template={selectedTemplate} onBack={() => setStep(4)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Themes modal */}
      <AnimatePresence>
        {showThemesModal && (
          <ThemesModal
            docTitle={DOC_TITLE}
            initial={selectedThemes}
            onSave={handleSaveThemes}
            onClose={() => setShowThemesModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
