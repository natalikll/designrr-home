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

/**
 * V4B ("E") — same shell, chips, and behavior as HomePage ("A"), with "Video"
 * added as a fourth creation mode. Only styling/behavior added here is what's
 * needed to slot Video into A's pattern; nothing about A's own modes changed.
 */
type CreationMode = 'book' | 'presentation' | 'video' | 'landing' | null;

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
  video:        'Video',
  landing:      'Landing page',
};

const HUB_LABELS: Record<NonNullable<CreationMode>, string> = {
  book:         'Create book',
  presentation: 'Create presentation',
  video:        'Create video',
  landing:      'Create landing page',
};

const PLACEHOLDERS: Record<NonNullable<CreationMode>, string> = {
  book:         'Describe your book idea…',
  presentation: 'What should your presentation be about?',
  video:        'What should your video be about?',
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
  video: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="4" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M14 8l4-2.5v9L14 12" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M7.3 7.3v5.4l4.4-2.7-4.4-2.7z" fill="currentColor"/>
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

/* ── Video source cards ──────────────────────────────────────────────────
   Same shell as ImportCards / PresentationStartCards (250x72 white card,
   #E0E5EB border, rgba(62,57,205,0.15) hover shadow) so it reads as the
   same product, not a different design. Structured as a picker since video
   will gain sources beyond "from a presentation" over time. */
interface VideoCardDef { key: string; title: string; subtitle: string; soon?: boolean }

const VIDEO_CARDS: VideoCardDef[] = [
  { key: 'presentation', title: 'From a presentation', subtitle: 'Add narration, export as video' },
  { key: 'photos',       title: 'From photos',          subtitle: 'Turn images into a slideshow', soon: true },
  { key: 'script',       title: 'From URL',              subtitle: 'Generate video from text',      soon: true },
];

function VideoCardIcon({ soon }: { soon?: boolean }) {
  const tint = soon ? '#EEF0F4' : '#FFE8E2';
  const fg   = soon ? '#A6AEBC' : '#FF5B39';
  return (
    <div className="shrink-0 flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 12, background: tint, marginLeft: 14 }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="4" width="12" height="12" rx="2" stroke={fg} strokeWidth="1.6"/>
        <path d="M14 8l4-2.5v9L14 12" stroke={fg} strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M7.3 7.3v5.4l4.4-2.7-4.4-2.7z" fill={fg}/>
      </svg>
    </div>
  );
}

function VideoCard({ card, onClick }: { card: VideoCardDef; onClick: () => void }) {
  const [isHovered, setIsHovered] = useState(false);
  const disabled = !!card.soon;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative flex shrink-0 items-center gap-2 overflow-hidden rounded-[8px] border border-[#E0E5EB] bg-white pr-4"
      style={{
        width: 250,
        height: 72,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.65 : 1,
        boxShadow: isHovered && !disabled
          ? '0px 7px 22px 0px rgba(62, 57, 205, 0.15)'
          : '0px 0px 0px 0px rgba(62, 57, 205, 0)',
        transition: 'box-shadow 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <VideoCardIcon soon={card.soon} />
      <div className="flex flex-col items-start whitespace-nowrap text-left" style={{ gap: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 600, lineHeight: '18px', color: '#15191F', fontFamily: "'Nunito Sans', sans-serif" }}>
          {card.title}
        </span>
        <span style={{ fontSize: 12, fontWeight: 400, lineHeight: '16px', color: '#667C98', fontFamily: "'Nunito Sans', sans-serif" }}>
          {card.subtitle}
        </span>
      </div>
      {card.soon && (
        <span style={{
          position: 'absolute', top: 8, right: 8,
          fontSize: 9.5, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase',
          color: '#8596AD', background: '#F0F2F6', padding: '2px 6px', borderRadius: 20,
          fontFamily: "'Nunito Sans', sans-serif",
        }}>
          Soon
        </span>
      )}
    </button>
  );
}

/** Mirrors ImportCards.tsx / PresentationStartCards in size, color, and copy pattern. */
function VideoStartCards() {
  const router = useRouter();
  const handleClick = (key: string) => {
    if (key === 'presentation') router.push('/projects');
  };
  return (
    <div className="mx-auto w-full max-w-[780px]">
      <div className="mb-8 flex items-center" style={{ gap: 16 }}>
        <div className="divider-line flex-1" />
        <span className="shrink-0 whitespace-nowrap font-normal" style={{ fontSize: 14, lineHeight: '18px', color: '#667C98' }}>
          Or choose another way to begin
        </span>
        <div className="divider-line-right flex-1" />
      </div>
      <div className="flex items-center justify-between">
        {VIDEO_CARDS.map((card) => (
          <VideoCard key={card.key} card={card} onClick={() => handleClick(card.key)} />
        ))}
      </div>
    </div>
  );
}

/* ── Recent videos (demo) — same card shell as RecentBooks / RecentPresentations ── */
const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;
const RECENT_VIDEOS = [
  { title: 'How to Build a Design Portfolio', date: 'Jun 9, 2025', duration: '3:42', color: '#11182F', accent: '#60A5FF' },
  { title: 'The Remote Work Playbook', date: 'May 22, 2025', duration: '1:58', color: 'linear-gradient(154deg,#006EFE 14%,#5325BD 86%)', accent: 'rgba(255,255,255,0.6)' },
];

function VideoThumb({ color, accent, duration }: { color: string; accent: string; duration: string }) {
  return (
    <div style={{ width: '100%', height: '100%', background: color, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.16)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)',
      }}>
        <div style={{
          width: 0, height: 0, marginLeft: 3,
          borderTop: '7px solid transparent', borderBottom: '7px solid transparent',
          borderLeft: `11px solid ${accent}`,
        }} />
      </div>
      <span style={{
        ...ns, position: 'absolute', bottom: 6, right: 6, fontSize: 9.5, fontWeight: 700, color: '#fff',
        background: 'rgba(0,0,0,0.45)', padding: '1.5px 5px', borderRadius: 4,
      }}>
        {duration}
      </span>
    </div>
  );
}

function RecentVideos() {
  return (
    <section className="w-full px-6 pb-12">
      <h2 style={{ ...ns, fontSize: 17, fontWeight: 600, color: '#15191F', marginBottom: 12 }}>Recent videos</h2>
      <div className="grid w-full" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
        {RECENT_VIDEOS.map((v) => (
          <div key={v.title} className="group flex cursor-pointer flex-col" style={{ gap: 10 }}>
            <div className="relative rounded-xl transition-shadow group-hover:shadow-lg overflow-hidden" style={{ width: '100%', aspectRatio: '1/1', background: '#E8EEF8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '88%', aspectRatio: '16/9', borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
                <VideoThumb color={v.color} accent={v.accent} duration={v.duration} />
              </div>
            </div>
            <div className="flex flex-col" style={{ gap: 3 }}>
              <p style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#15191F', lineHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.title}
              </p>
              <p style={{ ...ns, fontSize: 11, color: '#8596AD' }}>{v.date}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function HomePageV4B() {
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
                      {(['book', 'presentation', 'video', 'landing'] as const).map((m) => (
                        <HubChip
                          key={m}
                          label={HUB_LABELS[m]}
                          icon={CHIP_ICONS[m]}
                          iconColor={m === 'book' ? '#006EFE' : m === 'presentation' ? '#7C3AED' : m === 'video' ? '#FF5B39' : '#10B981'}
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
                {mode === 'video' && (
                  <motion.div
                    key="video-cards"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                    className="mt-6 w-full max-w-[900px]"
                  >
                    <VideoStartCards />
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div
                variants={slideUp}
                className="w-full"
                style={{ marginTop: mode === null ? 190 : mode === 'presentation' || mode === 'video' ? 140 : 74 }}
              >
                {mode === 'book' ? <RecentBooks />
                  : mode === 'presentation' ? <RecentPresentations />
                  : mode === 'video' ? <RecentVideos />
                  : <RecentProjectsHub isFirstLoad={isFirstLoad} />}
              </motion.div>

            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}
