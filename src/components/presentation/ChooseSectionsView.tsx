'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePresentationFlowStore } from '@/stores/presentationFlowStore';
import { MOCK_MANUSCRIPTS } from '@/lib/presentationMocks';
import { PresentationStepHeader } from './PresentationStepHeader';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

export function ChooseSectionsView() {
  const router = useRouter();
  const selectedManuscriptId = usePresentationFlowStore((s) => s.selectedManuscriptId);
  const selectedSectionIds = usePresentationFlowStore((s) => s.selectedSectionIds);
  const toggleSection = usePresentationFlowStore((s) => s.toggleSection);
  const setSelectedSectionIds = usePresentationFlowStore((s) => s.setSelectedSectionIds);
  const generateSlides = usePresentationFlowStore((s) => s.generateSlides);

  const manuscript = MOCK_MANUSCRIPTS.find((m) => m.id === selectedManuscriptId) ?? MOCK_MANUSCRIPTS[0];

  useEffect(() => {
    if (selectedSectionIds.length === 0) {
      setSelectedSectionIds(manuscript.sections.map((s) => s.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manuscript.id]);

  const handleContinue = () => {
    generateSlides();
    router.push('/presentation/outline');
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <PresentationStepHeader activeIndex={1} onBack={() => router.push('/presentation/manuscript')} />

      <div className="flex-1 overflow-y-auto">
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 100px' }}>
          <h1 style={{ ...ns, fontSize: 26, fontWeight: 700, color: '#0D1433', marginBottom: 8 }}>Pick which sections to include</h1>
          <p style={{ ...ns, fontSize: 14, color: '#52637A', marginBottom: 24 }}>
            From <strong>{manuscript.title}</strong> — each selected section becomes one or more slides.
          </p>

          <div className="flex flex-col" style={{ gap: 8 }}>
            {manuscript.sections.map((section) => {
              const checked = selectedSectionIds.includes(section.id);
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="flex items-center cursor-pointer text-left w-full"
                  style={{ gap: 12, padding: '14px 16px', borderRadius: 12, border: `1px solid ${checked ? '#5326BD' : '#E8EBF2'}`, background: checked ? '#FAF8FF' : '#fff' }}
                >
                  <div
                    className="flex items-center justify-center flex-shrink-0"
                    style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${checked ? '#5326BD' : '#D0D5DE'}`, background: checked ? '#5326BD' : '#fff' }}
                  >
                    {checked && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6.2L4.8 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F' }}>{section.title}</p>
                    <p style={{ ...ns, fontSize: 12, color: '#8596AD' }}>{section.wordCount.toLocaleString()} words</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 flex items-center justify-between border-t border-border-light" style={{ padding: '14px 32px' }}>
        <span style={{ ...ns, fontSize: 13, color: '#8596AD' }}>{selectedSectionIds.length} of {manuscript.sections.length} selected</span>
        <button
          onClick={handleContinue}
          disabled={selectedSectionIds.length === 0}
          style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', background: selectedSectionIds.length ? '#5326BD' : '#D8CBEF', border: 'none', borderRadius: 8, padding: '10px 22px', cursor: selectedSectionIds.length ? 'pointer' : 'not-allowed' }}
        >
          Generate outline →
        </button>
      </div>
    </div>
  );
}
