'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import Logo from './Logo';
import HomeWordgenieInput from './WordgenieInput';
import ImportCards from './ImportCards';
import { RecentBooks, RecentPresentations, RecentProjectsHub } from './RecentProjects';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';
import { useFlowStore } from '@/stores/flowStore';
import { PresentationStartCards } from '../presentation/PresentationEntryView';
import { useRouter } from 'next/navigation';

type CreationMode = 'book' | 'presentation' | 'landing';

const LABELS: Record<CreationMode, string> = {
  book:         'Book',
  presentation: 'Presentation',
  landing:      'Landing page',
};

const PLACEHOLDERS: Record<CreationMode, string> = {
  book:         'Describe your book idea…',
  presentation: 'What should your presentation be about?',
  landing:      'Describe your landing page…',
};

const HEADLINES: Record<CreationMode, string> = {
  book:         'Start creating your book',
  presentation: 'Start creating your presentation',
  landing:      'Create your landing page',
};

const TAB_ICONS: Record<CreationMode, ReactNode> = {
  book: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <path d="M4 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4V3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M13 3h3v16h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 7h4M7 10h4M7 13h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  presentation: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="3" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M8 14v3M12 14v3M6 17h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M7 9l2.5 1.5L13 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  landing: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M2 6.5h16" stroke="currentColor" strokeWidth="1.6"/>
      <circle cx="5" cy="4.25" r="0.75" fill="currentColor"/>
      <circle cx="8" cy="4.25" r="0.75" fill="currentColor"/>
      <path d="M5 10.5h10M5 13.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
};

const slideUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } },
};

/* ── Classic tab bar — active tab has 3-sided border, merges into card ─── */
function InputTabRow({ selected, onSelect }: { selected: CreationMode; onSelect: (m: CreationMode) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', paddingLeft: 12, gap: 4 }}>
      {(['book', 'presentation', 'landing'] as const).map((mode) => {
        const isActive = selected === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onSelect(mode)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 22px',
              fontFamily: "'Nunito Sans', sans-serif",
              fontSize: 13.5, cursor: 'pointer',
              borderRadius: '12px 12px 0 0',
              marginBottom: '-1px',
              position: 'relative' as const,
              zIndex: isActive ? 2 : 1,
              border: isActive ? '1px solid #006EFE' : '1px solid transparent',
              borderBottom: isActive ? '1px solid #fff' : '1px solid transparent',
              background: isActive ? '#fff' : 'transparent',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#0F1729' : '#8A98AA',
            }}
          >
            <span style={{ display: 'flex', color: isActive ? '#1E293B' : '#B0BBC8' }}>
              {TAB_ICONS[mode]}
            </span>
            {LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function HomePageV3() {
  const [mode, setMode]               = useState<CreationMode>('book');
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const sidebarOpen    = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);
  const router = useRouter();

  const handleSelect = (m: CreationMode) => {
    setIsFirstLoad(false);
    setMode(m);
  };

  const hubStagger = {
    initial: isFirstLoad ? 'hidden' : (false as const),
    animate: 'show' as const,
    variants: { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } } as Variants,
  };


  return (
    <div className="h-full relative overflow-hidden">

      {/* Sidebar toggle */}
      <div className="absolute top-4 left-5 z-40">
        <Tooltip label={sidebarOpen ? 'Close sidebar menu' : 'Show sidebar menu'} position="right">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-10 h-10 rounded-lg hover:bg-[#F6F7F9] transition-colors cursor-pointer flex items-center justify-center"
          >
            <SideMenuIcon active={sidebarOpen} />
          </button>
        </Tooltip>
      </div>

      <div className="absolute inset-0 overflow-y-auto">
        <div className="app-gradient-bg flex min-h-full flex-col">
          <main className="relative z-10 flex flex-1 flex-col items-center px-4 pt-[80px]">
            <Logo />

            <motion.div {...hubStagger} className="flex flex-col items-center w-full">

              {/* Headline animates when tab changes */}
              <AnimatePresence mode="wait">
                <motion.h1
                  key={mode + '-h'}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="mt-8 text-center font-semibold tracking-[-1.6px] text-text-primary"
                  style={{ fontSize: 52, lineHeight: '60px', fontFamily: "'Nunito Sans', sans-serif" }}
                >
                  {HEADLINES[mode]}
                </motion.h1>
              </AnimatePresence>

              {/* Tabs sit above the card; active tab merges into it */}
              <motion.div variants={slideUp} className="mt-8 w-full max-w-[860px]" style={{ position: 'relative' }}>
                <InputTabRow selected={mode} onSelect={handleSelect} />
                <div style={{
                  position: 'relative', zIndex: 1,
                  border: '1px solid #006EFE',
                  borderRadius: 16,
                  background: '#fff',
                  overflow: 'hidden',
                  boxShadow: '0 2px 16px rgba(62,57,205,0.08)',
                }}>
                  <HomeWordgenieInput
                    hideHeader
                    borderless
                    placeholder={PLACEHOLDERS[mode]}
                    showSettings={mode === 'presentation'}
                    excludeSettings={mode === 'presentation' ? ['tone', 'density'] : undefined}
                    onSubmit={mode === 'presentation'
                      ? (text) => router.push(`/presentation/chat?prompt=${encodeURIComponent(text)}`)
                      : undefined}
                  />
                </div>
              </motion.div>

              {/* Context-specific cards below input */}
              <motion.div variants={slideUp} className="mt-6 w-full max-w-[860px]">
                <AnimatePresence mode="wait">
                  {mode === 'book' && (
                    <motion.div key="book-cards" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                      <ImportCards />
                    </motion.div>
                  )}
                  {mode === 'presentation' && (
                    <motion.div key="pres-cards" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                      <PresentationStartCards />
                    </motion.div>
                  )}
                  {mode === 'landing' && (
                    <motion.div key="landing-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      <div className="flex items-center justify-center" style={{ height: 72 }}>
                        <span style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, color: '#8596AD' }}>Coming soon</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Recent projects — type-specific */}
              <motion.div variants={slideUp} className="mt-[44px] w-full">
                <AnimatePresence mode="wait">
                  {mode === 'book' && (
                    <motion.div key="recent-b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      <RecentBooks />
                    </motion.div>
                  )}
                  {mode === 'presentation' && (
                    <motion.div key="recent-p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      <RecentPresentations />
                    </motion.div>
                  )}
                  {mode === 'landing' && (
                    <motion.div key="recent-hub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      <RecentProjectsHub isFirstLoad={false} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}
