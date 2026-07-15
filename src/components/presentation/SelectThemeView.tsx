'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { usePresentationFlowStore } from '@/stores/presentationFlowStore';
import { useFlowStore } from '@/stores/flowStore';
import { MOCK_MANUSCRIPTS, MOCK_THEMES, type MockTheme } from '@/lib/presentationMocks';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

function CheckBadge() {
  return (
    <div
      className="flex items-center justify-center"
      style={{ position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: '50%', background: '#006EFE' }}
    >
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
        <path d="M2.5 7.2L5.2 9.8L11.5 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function TemplateCard({ theme, isSelected, onClick }: { theme: MockTheme; isSelected: boolean; onClick: () => void }) {
  const isBlank = theme.id === 'blank';
  return (
    <motion.button
      type="button"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="flex flex-col text-left cursor-pointer bg-white"
      style={{ gap: 10 }}
    >
      <div
        className="relative w-full overflow-hidden flex-shrink-0"
        style={{
          aspectRatio: '16/9', borderRadius: 12, background: theme.bg,
          border: `2px solid ${isSelected ? '#006EFE' : '#E8EBF2'}`,
        }}
      >
        {!isBlank && (
          <div style={{ position: 'absolute', left: 24, top: 26, right: 24 }}>
            <p style={{ ...ns, fontSize: 17, fontWeight: 700, color: theme.titleColor }}>Slide Deck Title</p>
            <p style={{ ...ns, fontSize: 12.5, color: theme.titleColor, opacity: 0.6, marginTop: 4 }}>
              This is just the beginning of something big.
            </p>
            <div style={{ width: 28, height: 3, borderRadius: 2, background: theme.accentColor, marginTop: 10 }} />
          </div>
        )}
        {isSelected && <CheckBadge />}
      </div>
      <span style={{ ...ns, fontSize: 14.5, fontWeight: 500, color: '#15191F' }}>{theme.name}</span>
    </motion.button>
  );
}

export function SelectThemeView() {
  const router = useRouter();
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);

  const slides = usePresentationFlowStore((s) => s.slides);
  const selectedManuscriptId = usePresentationFlowStore((s) => s.selectedManuscriptId);
  const setSelectedManuscriptId = usePresentationFlowStore((s) => s.setSelectedManuscriptId);
  const setSelectedSectionIds = usePresentationFlowStore((s) => s.setSelectedSectionIds);
  const generateSlides = usePresentationFlowStore((s) => s.generateSlides);
  const selectedThemeId = usePresentationFlowStore((s) => s.selectedThemeId);
  const setSelectedThemeId = usePresentationFlowStore((s) => s.setSelectedThemeId);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (slides.length === 0) {
      const manuscript = MOCK_MANUSCRIPTS.find((m) => m.id === selectedManuscriptId) ?? MOCK_MANUSCRIPTS[0];
      if (!selectedManuscriptId) setSelectedManuscriptId(manuscript.id);
      setSelectedSectionIds(manuscript.sections.map((s) => s.id));
      generateSlides();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => router.push('/presentation/editor'), 500);
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex-shrink-0 flex items-center justify-between border-b border-border-light" style={{ height: 56, padding: '0 16px' }}>
        <Tooltip label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'} position="right">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center justify-center cursor-pointer"
            style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F6F9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            <SideMenuIcon active={sidebarOpen} />
          </button>
        </Tooltip>

        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            ...ns, fontSize: 14, fontWeight: 600, color: '#fff', background: '#006EFE',
            border: 'none', borderRadius: 8, padding: '9px 22px', cursor: 'pointer',
          }}
        >
          {generating ? 'Generating…' : 'Generate Presentation'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 32px 64px' }}>
          <h1 style={{ ...ns, fontSize: 28, fontWeight: 700, color: '#0D1433' }}>Select a template</h1>
          <p style={{ ...ns, fontSize: 14, color: '#52637A', marginTop: 6, marginBottom: 32 }}>
            Pick a template for your slides — you can always switch later.
          </p>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
            {MOCK_THEMES.map((theme) => (
              <TemplateCard
                key={theme.id}
                theme={theme}
                isSelected={selectedThemeId === theme.id}
                onClick={() => setSelectedThemeId(theme.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
