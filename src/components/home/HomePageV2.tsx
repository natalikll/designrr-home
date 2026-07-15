'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import Logo from './Logo';
import HomeWordgenieInput from './WordgenieInput';
import ImportCards from './ImportCards';
import { RecentBooks, RecentPresentations } from './RecentProjects';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';
import { useFlowStore } from '@/stores/flowStore';
import { PresentationStartCards } from '../presentation/PresentationEntryView';
import { useRouter } from 'next/navigation';

type CreationMode = 'book' | 'presentation' | 'landing';

const LABELS: Record<CreationMode, string> = {
  book: 'Book',
  presentation: 'Presentation',
  landing: 'Landing page',
};

const HEADLINES: Record<CreationMode, string> = {
  book: 'Start creating your book',
  presentation: 'Start creating your presentation',
  landing: 'Create your landing page',
};

const PLACEHOLDERS: Record<CreationMode, string> = {
  book: 'Describe your book idea…',
  presentation: 'What should your presentation be about?',
  landing: 'Describe your landing page…',
};

const SUBTITLES: Record<CreationMode, string> = {
  book: 'Choose how you want to create your manuscript. You can turn it into any book format later.',
  presentation: 'Select how you want to start. You can fine-tune the design, slides, and voice later.',
  landing: 'High-converting pages for your book, course, or offer. Coming soon.',
};

const TAB_ICONS: Record<CreationMode, ReactNode> = {
  book: (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
      <path d="M4 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4V3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M13 3h3v16h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  presentation: (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="3" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 14v3M12 14v3M6 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  landing: (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 6.5h16" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 10.5h10M5 13.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
};

const slideUp: Variants = {
  hidden: { y: 8 },
  show: { y: 0, transition: { type: 'spring', stiffness: 260, damping: 20 } },
};
const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

/* ── Arcade-style tab row — always one selected, no X ─────────────────── */
function TabRow({ selected, onSelect }: { selected: CreationMode; onSelect: (m: CreationMode) => void }) {
  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      {(['book', 'presentation', 'landing'] as const).map((mode) => {
        const isActive = selected === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onSelect(mode)}
            className="relative flex items-center cursor-pointer"
            style={{
              gap: 6,
              padding: '7px 16px',
              borderRadius: 999,
              border: `1.5px solid ${isActive ? '#006EFE' : '#DDE2EA'}`,
              background: isActive ? '#006EFE' : 'rgba(255,255,255,0.85)',
              fontFamily: "'Nunito Sans', sans-serif",
              fontSize: 14,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? '#fff' : '#52637A',
              boxShadow: isActive ? '0 2px 8px rgba(0,110,254,0.25)' : '0 1px 3px rgba(15,23,51,0.07)',
              transition: 'all 0.18s ease',
            }}
          >
            <span style={{ color: isActive ? 'rgba(255,255,255,0.9)' : '#667C98', display: 'flex', alignItems: 'center' }}>
              {TAB_ICONS[mode]}
            </span>
            {LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */

export default function HomePageV2() {
  const [mode, setMode] = useState<CreationMode>('presentation');
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

              {/* Headline — animates when tab changes */}
              <AnimatePresence mode="wait">
                <motion.h1
                  key={mode + '-headline'}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="mt-8 text-center font-semibold tracking-[-1.6px] text-text-primary"
                  style={{ fontSize: 52, lineHeight: '60px', fontFamily: "'Nunito Sans', sans-serif" }}
                >
                  {HEADLINES[mode]}
                </motion.h1>
              </AnimatePresence>

              <AnimatePresence mode="wait">
                <motion.p
                  key={mode + '-subtitle'}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="mt-3 max-w-[480px] text-center text-base leading-6 text-text-muted"
                >
                  {SUBTITLES[mode]}
                </motion.p>
              </AnimatePresence>

              {/* Tab row ABOVE the input */}
              <motion.div variants={slideUp} className="mt-8 flex flex-col items-center w-full max-w-[780px]" style={{ gap: 14 }}>
                <TabRow selected={mode} onSelect={handleSelect} />

                {/* Input — context-aware */}
                {mode === 'presentation' ? (
                  <HomeWordgenieInput
                    hideHeader
                    showSettings
                    excludeSettings={['tone', 'density']}
                    placeholder={PLACEHOLDERS[mode]}
                    onSubmit={(text) => router.push(`/presentation/chat?prompt=${encodeURIComponent(text)}`)}
                  />
                ) : (
                  <HomeWordgenieInput hideHeader={mode !== 'book'} placeholder={PLACEHOLDERS[mode]} />
                )}
              </motion.div>

              {/* Alt start options — animate between types */}
              <motion.div variants={slideUp} className="mt-6 w-full max-w-[780px]">
                <AnimatePresence mode="wait">
                  {mode === 'book' && (
                    <motion.div key="book-cards" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
                      <ImportCards />
                    </motion.div>
                  )}
                  {mode === 'presentation' && (
                    <motion.div key="pres-cards" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
                      <PresentationStartCards />
                    </motion.div>
                  )}
                  {mode === 'landing' && (
                    <motion.div key="landing-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      <div className="flex items-center justify-center" style={{ height: 80 }}>
                        <span style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, color: '#8596AD' }}>Coming soon</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Recent section — type-specific */}
              <motion.div variants={slideUp} className="mt-[36px] w-full">
                <AnimatePresence mode="wait">
                  {mode === 'book' && (
                    <motion.div key="recent-books" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      <RecentBooks />
                    </motion.div>
                  )}
                  {mode === 'presentation' && (
                    <motion.div key="recent-pres" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      <RecentPresentations />
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
