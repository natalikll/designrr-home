'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import HomeWordgenieInput, { WordgenieEyebrow } from './WordgenieInput';
import { PlanTopStrip } from './PlanTopStrip';
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
    <div className="h-full overflow-hidden flex flex-col app-gradient-bg">

      {/* Standing plan strip — a sibling above the scroll container rather than inside it, so it
          stays put and doesn't collide with the absolutely-positioned sidebar toggle below.
          z-10 lifts it over the gradient blobs, which sit at z-0 on the container above. */}
      <div className="relative z-10">
        <PlanTopStrip />
      </div>

      <div className="flex-1 min-h-0 relative">

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
        <div className="flex min-h-full flex-col">
          <main className="relative z-10 flex flex-1 flex-col items-center px-4 pt-[112px]">
            {/* No Designrr wordmark here — the sidebar header already carries it, and a second
                copy 40px below the first is the thing most products in the study avoid: Base44,
                Sana, Otter, Suno, WRITER, Emergent and Gemini all keep the company mark in the
                chrome and give the content area only a headline. What does sit centred above the
                headline elsewhere is a sub-brand or product mark — SuperGrok's wordmark, Mistral's
                Le Chat logo, Langdock's — which is exactly what the Wordgenie lockup is. */}
            <motion.div {...hubStagger} className="flex flex-col items-center w-full">

              {/* Shown in every mode, not just book — it's the engine behind the whole hub, so
                  it reads as the page's product mark rather than a per-mode indicator. Constant
                  presence also means the headline never shifts when the mode changes. */}
              <motion.div variants={slideUp} className="flex items-center justify-center" style={{ height: 24 }}>
                <WordgenieEyebrow />
              </motion.div>

              {/* 52 rather than 60, against a 24px lockup. The wordmark's cap height inside that
                  lockup is roughly 11px, so it reads as a ~0.2× eyebrow against the headline —
                  the normal relationship. At 60/20 the mark was a third the headline's size and
                  looked stranded. The question itself is left alone: it's the same construction
                  Base44 ("What will you build next?"), Manus ("What can I do for you?"), Sana and
                  Langdock all use, so there's nothing to gain by rewording it. */}
              <motion.h1
                variants={slideUp}
                className="mt-3.5 text-center font-semibold tracking-[-1.4px] text-text-primary"
                style={{ fontSize: 52, lineHeight: '58px', fontFamily: "'Nunito Sans', sans-serif" }}
              >
                What would you like to create?
              </motion.h1>

              <motion.p variants={slideUp} className="mt-4 max-w-[480px] text-center text-base leading-6 text-text-muted">
                Describe your idea or choose where to start below.
              </motion.p>

              <motion.div variants={slideUp} className="mt-9 w-full max-w-[900px] flex flex-col items-center" style={{ gap: 16 }}>
                <div className="w-full">
                  <HomeWordgenieInput
                    hideHeader={mode !== 'book'}
                    showSettings={mode === 'presentation'}
                    excludeSettings={mode === 'presentation' ? ['tone', 'density'] : undefined}
                    selectedMode={selectedModeData}
                    placeholder={mode ? PLACEHOLDERS[mode] : 'What would you like to create today?'}
                    onSubmit={handleSubmit}
                    presentationMode={mode === 'presentation'}
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
    </div>
  );
}
