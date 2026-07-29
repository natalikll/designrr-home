'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import Logo from './Logo';
import HomeWordgenieInput from './WordgenieInput';
import { RecentBooks } from './RecentProjects';
import ImportCards from './ImportCards';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';
import { useFlowStore } from '@/stores/flowStore';
import { UpgradePlanModal } from '../account/MyAccountView';

/**
 * Standard-plan hub. Presentation and Landing page are Pro/Premium features —
 * Standard only ever creates books, so mode never leaves 'book' | null.
 */
type CreationMode = 'book' | null;
type LockedMode = 'presentation' | 'landing';

const slideUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } },
};

const LOCKED_LABELS: Record<LockedMode, string> = {
  presentation: 'Create presentation',
  landing:      'Create landing page',
};

const LOCKED_ICONS: Record<LockedMode, ReactNode> = {
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

const BOOK_ICON: ReactNode = (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
    <path d="M4 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4V3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M13 3h3v16h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M7 7h4M7 10h4M7 13h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

const LOCK_ICON = (
  <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
    <rect x="4" y="9" width="12" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.6"/>
    <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

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

/** Same pill shape as HubChip, but visually muted with a PRO tag. Opens the upgrade modal instead of switching mode. */
function HubChipLocked({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Tooltip label="Available on Pro plan" position="top">
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 8px 7px 15px', borderRadius: 999,
          background: hovered ? '#F6F7F9' : 'rgba(255,255,255,0.5)',
          border: `1px dashed ${hovered ? '#C5CDD9' : '#DDE2EA'}`,
          fontFamily: "'Nunito Sans', sans-serif",
          fontSize: 13.5, fontWeight: 500,
          color: '#A0AABA',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <span style={{ display: 'flex', color: '#C5CDD9' }}>{icon}</span>
        {label}
        <span style={{
          display: 'flex', alignItems: 'center', gap: 2,
          marginLeft: 2, padding: '2px 6px', borderRadius: 999,
          background: hovered ? '#EEF3FF' : '#F0F2F5',
          color: hovered ? '#006EFE' : '#8596AD',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
          transition: 'all 0.15s ease',
        }}>
          {LOCK_ICON}
          PRO
        </span>
      </button>
    </Tooltip>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function HomePageStandard() {
  const [mode, setMode]               = useState<CreationMode>(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const sidebarOpen    = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);

  const select = (next: CreationMode) => {
    setIsFirstLoad(false);
    setMode(next);
  };

  const hubStagger = {
    initial: isFirstLoad ? 'hidden' : (false as const),
    animate: 'show' as const,
    variants: { hidden: {} as Variants[string], show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } } as Variants,
  };

  const selectedModeData = mode === 'book' ? {
    label:    'Book',
    icon:     BOOK_ICON,
    onRemove: () => select(null),
  } : undefined;

  return (
    <div className="h-full relative overflow-hidden">

      <AnimatePresence>
        {showUpgrade && <UpgradePlanModal onClose={() => setShowUpgrade(false)} />}
      </AnimatePresence>

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
                    selectedMode={selectedModeData}
                    placeholder={mode ? 'Describe your book idea…' : 'What would you like to create today?'}
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
                      <HubChip label="Create book" icon={BOOK_ICON} iconColor="#006EFE" onClick={() => select('book')} />
                      <HubChipLocked label={LOCKED_LABELS.presentation} icon={LOCKED_ICONS.presentation} onClick={() => setShowUpgrade(true)} />
                      <HubChipLocked label={LOCKED_LABELS.landing} icon={LOCKED_ICONS.landing} onClick={() => setShowUpgrade(true)} />
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
              </AnimatePresence>

              <motion.div
                variants={slideUp}
                className="w-full"
                style={{ marginTop: mode === null ? 190 : 74 }}
              >
                <RecentBooks />
              </motion.div>

            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}
