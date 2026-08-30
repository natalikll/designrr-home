'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePresentationFlowStore } from '@/stores/presentationFlowStore';
import { MOCK_MANUSCRIPTS, estimateSlideCount } from '@/lib/presentationMocks';
import { PresentationStepHeader } from './PresentationStepHeader';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

/* Same brand sparkle + gradient used for Wordgenie elsewhere (WordgenieInput.tsx) — reused
   here so an AI-driven suggestion always reads as "Wordgenie", not a generic system hint. */
function WordgenieSparkle() {
  const gradientId = useId();
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#006EFE" />
          <stop offset="100%" stopColor="#5326BD" />
        </linearGradient>
      </defs>
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" fill={`url(#${gradientId})`} />
    </svg>
  );
}

export function ChooseSectionsView() {
  const router = useRouter();
  const selectedManuscriptId = usePresentationFlowStore((s) => s.selectedManuscriptId);
  const selectedSectionIds = usePresentationFlowStore((s) => s.selectedSectionIds);
  const toggleSection = usePresentationFlowStore((s) => s.toggleSection);
  const setSelectedSectionIds = usePresentationFlowStore((s) => s.setSelectedSectionIds);
  const generateSlides = usePresentationFlowStore((s) => s.generateSlides);

  const [showWhy, setShowWhy] = useState(false);

  const manuscript = MOCK_MANUSCRIPTS.find((m) => m.id === selectedManuscriptId) ?? MOCK_MANUSCRIPTS[0];
  const allSelected = selectedSectionIds.length === manuscript.sections.length;
  const suggestedIds = manuscript.sections.filter((s) => !s.wordgenieSkip).map((s) => s.id);
  const hasSuggestion = suggestedIds.length < manuscript.sections.length;
  const isAtSuggestion = hasSuggestion
    && selectedSectionIds.length === suggestedIds.length
    && suggestedIds.every((id) => selectedSectionIds.includes(id));
  const slideCount = estimateSlideCount(manuscript.id, selectedSectionIds);

  useEffect(() => {
    if (selectedSectionIds.length === 0) {
      setSelectedSectionIds(suggestedIds.length > 0 ? suggestedIds : manuscript.sections.map((s) => s.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manuscript.id]);

  const handleContinue = () => {
    generateSlides();
    router.push('/presentation/outline');
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <PresentationStepHeader
        activeIndex={1}
        primaryAction={{ label: 'Generate outline', onClick: handleContinue, disabled: selectedSectionIds.length === 0 }}
      />

      <div className="flex-1 overflow-y-auto">
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 100px' }}>
          <h1 style={{ ...ns, fontSize: 26, fontWeight: 700, color: '#0D1433', marginBottom: 8 }}>Pick which sections to include</h1>
          <p style={{ ...ns, fontSize: 14, color: '#52637A', marginBottom: hasSuggestion ? 16 : 24 }}>
            From <strong>{manuscript.title}</strong> — each selected section becomes one or more slides.
          </p>

          {hasSuggestion && (
            <div
              style={{
                padding: '10px 14px', borderRadius: 10, marginBottom: 16,
                background: 'linear-gradient(259.1deg, rgba(0,110,254,0.06) -2.17%, rgba(83,38,189,0.06) 103.16%)',
                border: '1px solid rgba(83,38,189,0.14)',
              }}
            >
              <div className="flex items-center justify-between" style={{ gap: 12 }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <WordgenieSparkle />
                  <span style={{ ...ns, fontSize: 13, color: '#3D3A5C' }}>
                    Wordgenie suggests <strong>{suggestedIds.length} of {manuscript.sections.length}</strong> sections.
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowWhy((v) => !v)}
                    className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#006EFE] focus-visible:rounded-sm"
                    style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: '#5326BD', background: 'none', border: 'none', padding: 0 }}
                  >
                    {showWhy ? 'Hide why' : 'See why'}
                  </button>
                </div>
                {!isAtSuggestion && (
                  <button
                    type="button"
                    onClick={() => setSelectedSectionIds(suggestedIds)}
                    className="cursor-pointer flex-shrink-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#006EFE] focus-visible:rounded-sm"
                    style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: '#006EFE', background: 'none', border: 'none', padding: 0, whiteSpace: 'nowrap' }}
                  >
                    Use suggestion
                  </button>
                )}
              </div>

              {/* grid-template-rows (0fr/1fr) instead of height/max-height — avoids animating a
                  layout property, same technique used for the format-picker's hover reveal. */}
              <div style={{ display: 'grid', gridTemplateRows: showWhy ? '1fr' : '0fr', transition: 'grid-template-rows 0.2s ease' }}>
                <div className="overflow-hidden">
                  <div style={{ paddingTop: 8, marginTop: 8, borderTop: '1px solid rgba(83,38,189,0.14)' }}>
                    <p style={{ ...ns, fontSize: 12, color: '#5B5680', lineHeight: 1.5 }}>{manuscript.wordgenieReason}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <span style={{ ...ns, fontSize: 13, color: '#8596AD' }}>
              {selectedSectionIds.length} of {manuscript.sections.length} selected
              <span style={{ color: '#C4CBD6' }}> · </span>
              {slideCount} slide{slideCount === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={() => setSelectedSectionIds(allSelected ? [] : manuscript.sections.map((s) => s.id))}
              className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#006EFE] focus-visible:rounded-sm"
              style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#006EFE', background: 'none', border: 'none', padding: 0 }}
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          <div className="flex flex-col" style={{ gap: 8 }}>
            {manuscript.sections.map((section) => {
              const checked = selectedSectionIds.includes(section.id);
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="flex items-center cursor-pointer text-left w-full bg-white"
                  style={{ gap: 12, padding: '14px 16px', borderRadius: 12, border: `1.5px solid ${checked ? '#006EFE' : '#E8EBF2'}` }}
                >
                  <div
                    className="flex items-center justify-center flex-shrink-0"
                    style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${checked ? '#006EFE' : '#D0D5DE'}`, background: checked ? '#006EFE' : '#fff' }}
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
    </div>
  );
}
