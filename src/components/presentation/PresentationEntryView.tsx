'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useFlowStore } from '@/stores/flowStore';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';
import Logo from '../home/Logo';
import HomeWordgenieInput from '../home/WordgenieInput';
import { RecentPresentations } from '../home/RecentProjects';
import { PptxImportModal } from './PptxImportModal';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

interface StartCardDef {
  key: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}

/* Shared "page" illustration base — folded top-right corner + soft drop shadow,
   matching the book import cards' /assets/icon-import-*.svg artwork exactly. */
function PageBase({ uid, children }: { uid: string; children?: React.ReactNode }) {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="72" height="72" fill="white" />
      <g filter={`url(#${uid})`}>
        <path d="M56 71.7385C56 73.5398 54.5315 75 52.7201 75H18.2799C16.4685 75 15 73.5398 15 71.7385L15 25.2614C15 23.4602 16.4685 22 18.2799 22H43.7L56 33.2115V71.7385Z" fill="white" />
        <path d="M55.9992 33.2115H43.6992V22L55.9992 33.2115Z" fill="#949AA2" fillOpacity="0.2" />
        <path d="M43.6992 33.2119L55.9992 45.4427V33.2119H43.6992Z" fill="#FAFAFA" />
      </g>
      {children}
      <defs>
        <filter id={uid} x="-2.4" y="6.6" width="79.8" height="91.8" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
          <feOffset dx="2" dy="4" />
          <feGaussianBlur stdDeviation="9.7" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.47381 0 0 0 0 0.450311 0 0 0 0 0.591309 0 0 0 0.75 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
        </filter>
      </defs>
    </svg>
  );
}

function ManuscriptPreviewIcon() {
  return (
    <div className="shrink-0 overflow-hidden" style={{ width: 72, height: 72 }}>
      <div style={{ transform: 'translateY(4px)' }}>
        <PageBase uid="page-shadow-manuscript">
          <rect x="21" y="40" width="26" height="3" rx="1.5" fill="#C8CDD8" />
          <rect x="21" y="47" width="26" height="3" rx="1.5" fill="#E2E5EC" />
          <rect x="21" y="54" width="20" height="3" rx="1.5" fill="#E2E5EC" />
          <rect x="21" y="61" width="23" height="3" rx="1.5" fill="#E2E5EC" />
        </PageBase>
      </div>
    </div>
  );
}

function PptxPreviewIcon() {
  return (
    <div className="shrink-0 relative overflow-visible" style={{ width: 72, height: 72 }}>
      <div style={{ transform: 'translateY(4px)' }}>
        <PageBase uid="page-shadow-pptx" />
      </div>
      <div
        className="flex items-center justify-center"
        style={{ position: 'absolute', bottom: 2, right: 0, width: 26, height: 26, background: '#D24726', borderRadius: 6, boxShadow: '0 1px 3px rgba(15,23,51,0.15)' }}
      >
        <span style={{ ...ns, fontSize: 13, fontWeight: 800, color: '#fff' }}>P</span>
      </div>
    </div>
  );
}

function BlankPreviewIcon() {
  return (
    <div className="shrink-0 overflow-hidden" style={{ width: 72, height: 72 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/icon-import-scratch.svg" alt="" style={{ width: 72, height: 72, transform: 'translateY(4px)' }} />
    </div>
  );
}

const START_CARDS: StartCardDef[] = [
  {
    key: 'manuscript',
    title: 'Start from manuscript',
    subtitle: 'Turn a book into slides',
    icon: <ManuscriptPreviewIcon />,
  },
  {
    key: 'pptx',
    title: 'Import',
    subtitle: 'From PPTX or a sharing link',
    icon: <PptxPreviewIcon />,
  },
  {
    key: 'blank',
    title: 'Start from scratch',
    subtitle: 'Start with a theme or blank',
    icon: <BlankPreviewIcon />,
  },
];

function StartCard({ card, onClick }: { card: StartCardDef; onClick: () => void }) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex shrink-0 cursor-pointer items-center gap-2 overflow-hidden rounded-[8px] border border-[#E0E5EB] bg-white pr-4"
      style={{
        width: 250,
        height: 72,
        boxShadow: isHovered
          ? '0px 7px 22px 0px rgba(62, 57, 205, 0.15)'
          : '0px 0px 0px 0px rgba(62, 57, 205, 0)',
        transition: 'box-shadow 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {card.icon}
      <div className="flex flex-col items-start whitespace-nowrap text-left" style={{ gap: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 600, lineHeight: '18px', color: '#15191F', fontFamily: "'Nunito Sans', sans-serif" }}>
          {card.title}
        </span>
        <span style={{ fontSize: 12, fontWeight: 400, lineHeight: '16px', color: '#667C98', fontFamily: "'Nunito Sans', sans-serif" }}>
          {card.subtitle}
        </span>
      </div>
    </motion.button>
  );
}

/** Standalone card row — embedded inside the home page "presentation" creation mode.
    Mirrors ImportCards.tsx (the book flow's equivalent) in size, color, and shadow. */
export function PresentationStartCards() {
  const router = useRouter();
  const [showPptxModal, setShowPptxModal] = useState(false);

  const handleClick = (key: string) => {
    if (key === 'blank') router.push('/presentation/theme');
    else if (key === 'manuscript') router.push('/presentation/manuscript');
    else if (key === 'pptx') setShowPptxModal(true);
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
        {START_CARDS.map((card) => (
          <StartCard key={card.key} card={card} onClick={() => handleClick(card.key)} />
        ))}
      </div>

      {showPptxModal && <PptxImportModal onClose={() => setShowPptxModal(false)} />}
    </div>
  );
}

function PresentationChipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="3" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 14v3M12 14v3M6 17h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 9l2.5 1.5L13 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Full /presentation landing page */
export default function PresentationEntryView() {
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);
  const router = useRouter();

  const handleSubmit = (text: string) => {
    router.push(`/presentation/chat?prompt=${encodeURIComponent(text)}`);
  };

  return (
    <div className="h-full relative overflow-hidden">
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
          <main className="relative z-10 flex flex-1 flex-col items-center px-4 pt-[104px] pb-16">
            <Logo />
            <motion.h1
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="mt-8 text-center font-semibold tracking-[-1.8px] text-text-primary"
              style={{ fontSize: 60, lineHeight: '68px', fontFamily: "'Nunito Sans', sans-serif" }}
            >
              What would you like to create?
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="mt-3 max-w-[480px] text-center text-base leading-6 text-text-muted"
            >
              Describe your idea or choose where to start below.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="mt-8 w-full max-w-[900px]"
            >
              <HomeWordgenieInput
                showSettings
                excludeSettings={['tone', 'density']}
                placeholder="What should your presentation be about?"
                selectedMode={{ label: 'Presentation', icon: <PresentationChipIcon />, onRemove: () => router.push('/') }}
                onSubmit={handleSubmit}
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="mt-10 w-full max-w-[900px]"
            >
              <PresentationStartCards />
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
              className="mt-12 w-full"
            >
              <RecentPresentations />
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}
