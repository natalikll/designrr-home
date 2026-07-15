'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import Logo from './Logo';
import HomeWordgenieInput from './WordgenieInput';
import ImportCards from './ImportCards';
import { RecentProjectsHub, RecentBooks, RecentPresentations } from './RecentProjects';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';
import { useFlowStore } from '@/stores/flowStore';
import { PresentationStartCards } from '../presentation/PresentationEntryView';
import { useRouter } from 'next/navigation';

type CreationMode = 'book' | 'presentation' | 'landing' | null;

/* ── Per-type visual identity ───────────────────────────────────────────── */
const PAGE_STYLE: Record<NonNullable<CreationMode>, {
  bg: string; heading: string; muted: string; accent: string;
}> = {
  book: {
    bg: [
      'radial-gradient(ellipse at 80% -5%, rgba(0, 110, 254, 0.10) 0%, transparent 55%)',
      'linear-gradient(160deg, #F8FAFF 0%, #EBF3FF 65%, #F0F7FF 100%)',
    ].join(', '),
    heading: '#001633',
    muted:   '#3A6B99',
    accent:  '#006EFE',
  },
  presentation: {
    bg: [
      'radial-gradient(ellipse at 80% -5%, rgba(83, 38, 189, 0.06) 0%, transparent 55%)',
      'linear-gradient(160deg, #FAFAFF 0%, #F2EEFF 65%, #F7F5FF 100%)',
    ].join(', '),
    heading: '#1A0633',
    muted:   '#5A3A8A',
    accent:  '#5326BD',
  },
  landing: {
    bg: [
      'radial-gradient(ellipse at 80% -5%, rgba(59, 74, 225, 0.09) 0%, transparent 55%)',
      'linear-gradient(160deg, #F8F8FF 0%, #EBEBFF 65%, #F3F2FF 100%)',
    ].join(', '),
    heading: '#0D1040',
    muted:   '#4A4A99',
    accent:  '#3B4AE0',
  },
};

const LABELS: Record<NonNullable<CreationMode>, string> = {
  book:         'Book',
  presentation: 'Presentation',
  landing:      'Landing page',
};

const HEADLINES: Record<NonNullable<CreationMode>, string> = {
  book:         'Start creating your book',
  presentation: 'Start creating your presentation',
  landing:      'Create your landing page',
};

const SUBTITLES: Record<NonNullable<CreationMode>, string> = {
  book:         'Choose how you want to create your manuscript. Turn it into any format later.',
  presentation: 'Select how you want to start. Fine-tune the design, slides, and voice later.',
  landing:      'High-converting pages for your book, course, or offer. Coming soon.',
};

const PLACEHOLDERS: Record<NonNullable<CreationMode>, string> = {
  book:         'Describe your book idea…',
  presentation: 'What should your presentation be about?',
  landing:      'Describe your landing page…',
};

const slideUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } },
};
const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const PAGE_ENTRY = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  transition: { type: 'spring' as const, stiffness: 260, damping: 26, mass: 0.9 },
};
const PAGE_EXIT = {
  opacity: 0,
  transition: { duration: 0.18, ease: [0.4, 0, 1, 1] as [number, number, number, number] },
};

/* ── Hub shortcuts (glass-blur icon boxes) ──────────────────────────────── */
const SHORTCUT_ITEMS: { mode: NonNullable<CreationMode>; label: string; subtitle: string; gradient: string; icon: ReactNode }[] = [
  {
    mode: 'book', label: 'Book', subtitle: 'Write & publish',
    gradient: 'linear-gradient(135deg, rgba(77,163,255,0.85) 0%, rgba(0,110,254,0.85) 100%)',
    icon: (
      <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
        <path d="M4 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4V3z" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M13 3h3v16h-3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M7 7h4M7 10h4M7 13h2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    mode: 'presentation', label: 'Presentation', subtitle: 'Slides & decks',
    gradient: 'linear-gradient(135deg, rgba(139,95,212,0.85) 0%, rgba(83,38,189,0.85) 100%)',
    icon: (
      <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="3" width="16" height="11" rx="2" stroke="#fff" strokeWidth="1.6"/>
        <path d="M8 14v3M12 14v3M6 17h8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M7 9l2.5 1.5L13 8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    mode: 'landing', label: 'Landing page', subtitle: 'Pages & funnels',
    gradient: 'linear-gradient(135deg, rgba(107,122,234,0.85) 0%, rgba(59,74,224,0.85) 100%)',
    icon: (
      <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="2" width="16" height="16" rx="2" stroke="#fff" strokeWidth="1.6"/>
        <path d="M2 6.5h16" stroke="#fff" strokeWidth="1.6"/>
        <circle cx="5" cy="4.25" r="0.75" fill="#fff"/>
        <circle cx="8" cy="4.25" r="0.75" fill="#fff"/>
        <path d="M5 10.5h10M5 13.5h6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
  },
];

function ShortcutIcon({ label, gradient, icon, onClick }: { label: string; subtitle: string; gradient: string; icon: ReactNode; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex flex-col items-center cursor-pointer"
      style={{ gap: 10, background: 'none', border: 'none', padding: 0 }}
    >
      <div style={{
        width: 62, height: 62, borderRadius: 18,
        background: gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: hovered
          ? '0 8px 24px rgba(0,0,0,0.22)'
          : '0 3px 12px rgba(0,0,0,0.14)',
        transform: hovered ? 'translateY(-3px) scale(1.06)' : 'translateY(0) scale(1)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}>
        {icon}
      </div>
      <span style={{
        fontFamily: "'Nunito Sans', sans-serif", fontSize: 13.5, fontWeight: 600,
        color: hovered ? '#0F1729' : '#3D4A5C', lineHeight: '18px',
        transition: 'color 0.18s ease',
      }}>
        {label}
      </span>
    </button>
  );
}

/* ── Back button for sub-pages ──────────────────────────────────────────── */
function BackButton({ onBack, accentColor }: { onBack: () => void; accentColor: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onBack}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-1.5 cursor-pointer"
      style={{
        background: 'none', border: 'none', padding: '4px 6px',
        fontFamily: "'Nunito Sans', sans-serif", fontSize: 13, fontWeight: 600,
        color: accentColor,
        opacity: hovered ? 1 : 0.6,
        transform: hovered ? 'translateX(-2px)' : 'translateX(0)',
        transition: 'opacity 0.15s ease, transform 0.15s ease',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
      Hub
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function HomePageV4() {
  const [mode, setMode]               = useState<CreationMode>(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const sidebarOpen    = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);
  const router = useRouter();

  const select = (next: CreationMode) => {
    setIsFirstLoad(false);
    setMode(next);
  };

  const hubStagger = {
    initial: isFirstLoad ? 'hidden' : (false as const),
    animate: 'show' as const,
    variants: { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } } as Variants,
  };

  return (
    <div className="h-full relative overflow-hidden">

      {/* Sidebar toggle */}
      <div className="absolute top-4 left-5 z-50">
        <Tooltip label={sidebarOpen ? 'Close sidebar menu' : 'Show sidebar menu'} position="right">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-10 h-10 rounded-lg hover:bg-black/5 transition-colors cursor-pointer flex items-center justify-center"
          >
            <SideMenuIcon active={sidebarOpen} />
          </button>
        </Tooltip>
      </div>

      {/* Back button — same row as sidebar toggle, only on sub-pages */}
      <AnimatePresence>
        {mode !== null && (
          <motion.div
            key="back-btn"
            className="absolute top-4 z-50 flex h-10 items-center"
            style={{ left: 68 }}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.18 }}
          >
            <BackButton onBack={() => select(null)} accentColor={PAGE_STYLE[mode].accent} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>

        {/* ── Hub ─────────────────────────────────────────────────────── */}
        {mode === null && (
          <motion.div
            key="hub"
            className="absolute inset-0 overflow-y-auto"
            style={{ zIndex: 0 }}
            initial={false}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
          >
            <div className="app-gradient-bg flex min-h-full flex-col">
              <main className="relative z-10 flex flex-1 flex-col items-center px-4 pt-[80px]">
                <Logo />
                <motion.div {...hubStagger} className="flex flex-col items-center w-full">
                  <motion.h1
                    variants={slideUp}
                    className="mt-8 text-center font-semibold tracking-[-1.8px] text-text-primary"
                    style={{ fontSize: 60, lineHeight: '68px', fontFamily: "'Nunito Sans', sans-serif" }}
                  >
                    What would you like to create?
                  </motion.h1>
                  <motion.p variants={slideUp} className="mt-3 max-w-[480px] text-center text-base leading-6 text-text-muted">
                    Describe your idea, or choose a type below.
                  </motion.p>
                  <motion.div variants={slideUp} className="mt-8 w-full max-w-[900px]">
                    <HomeWordgenieInput hideHeader placeholder="What would you like to create today?" />
                  </motion.div>
                  <motion.div variants={slideUp} className="mt-6 flex items-center justify-center" style={{ gap: 48 }}>
                    {SHORTCUT_ITEMS.map(({ mode: m, label, subtitle, gradient, icon }) => (
                      <ShortcutIcon key={m} label={label} subtitle={subtitle} gradient={gradient} icon={icon} onClick={() => select(m)} />
                    ))}
                  </motion.div>
                  <motion.div variants={slideUp} className="mt-[40px] w-full">
                    <RecentProjectsHub isFirstLoad={isFirstLoad} />
                  </motion.div>
                </motion.div>
              </main>
            </div>
          </motion.div>
        )}

        {/* ── Type sub-pages ────────────────────────────────────────── */}
        {mode !== null && (
          <motion.div
            key={mode}
            className="absolute inset-0 overflow-y-auto"
            style={{ zIndex: 10 }}
            {...PAGE_ENTRY}
            exit={PAGE_EXIT}
          >
            <div style={{ background: PAGE_STYLE[mode].bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
              <main className="relative z-10 flex flex-1 flex-col items-center px-4 pt-[72px]">
                <Logo />

                <motion.div initial="hidden" animate="show" variants={stagger} className="flex flex-col items-center w-full">
                  <motion.h1
                    variants={slideUp}
                    className="mt-4 text-center font-semibold tracking-[-1.6px]"
                    style={{ fontSize: 52, lineHeight: '60px', fontFamily: "'Nunito Sans', sans-serif", color: PAGE_STYLE[mode].heading }}
                  >
                    {HEADLINES[mode]}
                  </motion.h1>
                  <motion.p
                    variants={slideUp}
                    className="mt-4 max-w-[460px] text-center text-base leading-6"
                    style={{ color: PAGE_STYLE[mode].muted }}
                  >
                    {SUBTITLES[mode]}
                  </motion.p>

                  <motion.div variants={slideUp} className="mt-8 w-full max-w-[860px]">
                    <HomeWordgenieInput
                      hideHeader={mode !== 'book'}
                      showSettings={mode === 'presentation'}
                      excludeSettings={mode === 'presentation' ? ['tone', 'density'] : undefined}
                      placeholder={PLACEHOLDERS[mode]}
                      onSubmit={mode === 'presentation'
                        ? (text) => router.push(`/presentation/chat?prompt=${encodeURIComponent(text)}`)
                        : undefined}
                    />
                  </motion.div>

                  {mode === 'book' && (
                    <motion.div variants={slideUp} className="mt-6 w-full max-w-[860px]">
                      <ImportCards />
                    </motion.div>
                  )}

                  {mode === 'presentation' && (
                    <motion.div variants={slideUp} className="mt-6 w-full max-w-[860px]">
                      <PresentationStartCards />
                    </motion.div>
                  )}

                  <motion.div variants={slideUp} className="w-full" style={{ marginTop: mode === 'presentation' ? 64 : 48 }}>
                    {mode === 'book' && <RecentBooks />}
                    {mode === 'presentation' && <RecentPresentations />}
                  </motion.div>
                </motion.div>
              </main>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
