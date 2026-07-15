'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import Logo from './Logo';
import HomeWordgenieInput from './WordgenieInput';
import { RecentProjectsHub, RecentBooks, RecentPresentations } from './RecentProjects';
import ImportCards from './ImportCards';
import { PresentationStartCards } from '../presentation/PresentationEntryView';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';
import { useFlowStore } from '@/stores/flowStore';
import { useRouter } from 'next/navigation';

type CreationMode = 'book' | 'presentation' | 'landing' | null;

const slideUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } },
};
const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const LABELS: Record<NonNullable<CreationMode>, string> = {
  book:         'Book',
  presentation: 'Presentation',
  landing:      'Landing page',
};

const HUB_LABELS: Record<NonNullable<CreationMode>, string> = {
  book:         'Create book',
  presentation: 'Create presentation',
  landing:      'Create landing page',
};

const PLACEHOLDERS: Record<NonNullable<CreationMode>, string> = {
  book:         'Describe your book idea…',
  presentation: 'What should your presentation be about?',
  landing:      'Describe your landing page…',
};

/* Small icons — currentColor so they inherit chip text color */
const CHIP_ICONS: Record<NonNullable<CreationMode>, ReactNode> = {
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

function HubChip({ label, icon, iconColor, onClick }: { label: string; icon: ReactNode; iconColor: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 15px', borderRadius: 999,
        background: hovered ? '#fff' : 'rgba(255,255,255,0.78)',
        border: `1px solid ${hovered ? '#C8D3DF' : '#DDE2EA'}`,
        boxShadow: hovered ? '0 2px 10px rgba(15,23,51,0.09)' : '0 1px 3px rgba(15,23,51,0.05)',
        fontFamily: "'Nunito Sans', sans-serif",
        fontSize: 13.5, fontWeight: 500,
        color: hovered ? '#15191F' : '#3D4A5C',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      <span style={{ display: 'flex', color: iconColor }}>{icon}</span>
      {label}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function HomePage() {
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
    variants: { hidden: {} as Variants[string], show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } } as Variants,
  };

  const selectedModeData = mode ? {
    label:    LABELS[mode],
    icon:     CHIP_ICONS[mode],
    onRemove: () => select(null),
  } : undefined;

  const handleSubmit = mode === 'presentation'
    ? (text: string) => router.push(`/presentation/chat?prompt=${encodeURIComponent(text)}`)
    : undefined;

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

      {/* Hub — always visible, single view */}
      <div className="absolute inset-0 overflow-y-auto">
        <div className="app-gradient-bg flex min-h-full flex-col">
          <main className="relative z-10 flex flex-1 flex-col items-center px-4 pt-[104px]">
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
                Describe your idea or choose where to start below.
              </motion.p>

              <motion.div variants={slideUp} className="mt-8 w-full max-w-[900px] flex flex-col items-center" style={{ gap: 14 }}>
                <div className="w-full">
                  <HomeWordgenieInput
                    hideHeader={mode !== 'book'}
                    showSettings={mode === 'presentation'}
                    excludeSettings={mode === 'presentation' ? ['tone', 'density'] : undefined}
                    selectedMode={selectedModeData}
                    placeholder={mode ? PLACEHOLDERS[mode] : 'What would you like to create today?'}
                    onSubmit={handleSubmit}
                  />
                </div>

                {/* Chips below input — animate out when one is selected */}
                <AnimatePresence>
                  {mode === null && (
                    <motion.div
                      key="hub-chips"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className="flex items-center"
                      style={{ gap: 8 }}
                    >
                      {(['book', 'presentation', 'landing'] as const).map((m) => (
                        <HubChip
                          key={m}
                          label={HUB_LABELS[m]}
                          icon={CHIP_ICONS[m]}
                          iconColor={m === 'book' ? '#006EFE' : m === 'presentation' ? '#7C3AED' : '#10B981'}
                          onClick={() => select(m)}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Mode-specific shortcuts */}
              <AnimatePresence mode="wait">
                {mode === 'book' && (
                  <motion.div
                    key="book-cards"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                    className="mt-6 w-full max-w-[900px]"
                  >
                    <ImportCards />
                  </motion.div>
                )}
                {mode === 'presentation' && (
                  <motion.div
                    key="pres-cards"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                    className="mt-6 w-full max-w-[900px]"
                  >
                    <PresentationStartCards />
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div
                variants={slideUp}
                className="w-full"
                style={{ marginTop: mode === null ? 190 : mode === 'presentation' ? 140 : 74 }}
              >
                {mode === 'book' ? <RecentBooks /> : mode === 'presentation' ? <RecentPresentations /> : <RecentProjectsHub isFirstLoad={isFirstLoad} />}
              </motion.div>

            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}
