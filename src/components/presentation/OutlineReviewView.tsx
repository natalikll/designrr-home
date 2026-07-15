'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePresentationFlowStore } from '@/stores/presentationFlowStore';
import { MOCK_MANUSCRIPTS } from '@/lib/presentationMocks';
import { PresentationStepHeader } from './PresentationStepHeader';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

const LAYOUT_LABEL: Record<string, string> = {
  standard: 'Bullet points',
  centered: 'Title slide',
  'image-right': 'Image + text',
  'image-left': 'Image + text',
  'two-column': 'Two column',
  'big-title': 'Big statement',
  split: 'Split panel',
  minimal: 'Minimal',
};

export function OutlineReviewView() {
  const router = useRouter();
  const slides = usePresentationFlowStore((s) => s.slides);
  const updateSlideTitle = usePresentationFlowStore((s) => s.updateSlideTitle);
  const selectedManuscriptId = usePresentationFlowStore((s) => s.selectedManuscriptId);
  const setSelectedManuscriptId = usePresentationFlowStore((s) => s.setSelectedManuscriptId);
  const setSelectedSectionIds = usePresentationFlowStore((s) => s.setSelectedSectionIds);
  const generateSlides = usePresentationFlowStore((s) => s.generateSlides);

  useEffect(() => {
    if (slides.length === 0) {
      const manuscript = MOCK_MANUSCRIPTS.find((m) => m.id === selectedManuscriptId) ?? MOCK_MANUSCRIPTS[0];
      if (!selectedManuscriptId) setSelectedManuscriptId(manuscript.id);
      setSelectedSectionIds(manuscript.sections.map((s) => s.id));
      generateSlides();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-full flex flex-col bg-white">
      <PresentationStepHeader activeIndex={2} onBack={() => router.push('/presentation/sections')} />

      <div className="flex-1 overflow-y-auto">
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 100px' }}>
          <h1 style={{ ...ns, fontSize: 26, fontWeight: 700, color: '#0D1433', marginBottom: 8 }}>Review your outline</h1>
          <p style={{ ...ns, fontSize: 14, color: '#52637A', marginBottom: 24 }}>
            {slides.length} slides generated — edit any title before picking a theme.
          </p>

          <div className="flex flex-col" style={{ gap: 10 }}>
            {slides.map((slide, i) => (
              <div key={slide.id} className="flex items-start" style={{ gap: 14, padding: '14px 16px', borderRadius: 12, border: '1px solid #E8EBF2' }}>
                <div className="flex items-center justify-center flex-shrink-0 rounded-full" style={{ width: 26, height: 26, background: '#F1EEFB' }}>
                  <span style={{ ...ns, fontSize: 12, fontWeight: 700, color: '#5326BD' }}>{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    value={slide.title}
                    onChange={(e) => updateSlideTitle(slide.id, e.target.value)}
                    style={{ ...ns, fontSize: 15, fontWeight: 600, color: '#15191F', border: 'none', outline: 'none', width: '100%', background: 'transparent' }}
                  />
                  <div className="flex items-center" style={{ gap: 6, marginTop: 4 }}>
                    <span style={{ ...ns, fontSize: 11, fontWeight: 600, color: '#5326BD', background: '#F1EEFB', padding: '2px 8px', borderRadius: 999 }}>
                      {slide.layout ? (LAYOUT_LABEL[slide.layout] ?? slide.layout) : slide.type === 'headline' ? 'Title slide' : 'Bullet points'}
                    </span>
                  </div>
                  {slide.points.length > 0 && (
                    <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                      {slide.points.map((b, bi) => (
                        <li key={bi} style={{ ...ns, fontSize: 13, color: '#52637A', lineHeight: 1.6, listStyle: 'disc' }}>{b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 flex items-center justify-end border-t border-border-light" style={{ padding: '14px 32px' }}>
        <button
          onClick={() => router.push('/presentation/theme')}
          style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', background: '#5326BD', border: 'none', borderRadius: 8, padding: '10px 22px', cursor: 'pointer' }}
        >
          Choose a theme →
        </button>
      </div>
    </div>
  );
}
