'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Reorder } from 'framer-motion';
import { usePresentationFlowStore } from '@/stores/presentationFlowStore';
import { MOCK_MANUSCRIPTS } from '@/lib/presentationMocks';
import { PresentationStepHeader } from './PresentationStepHeader';
import { PlusIcon, AiSparkleIcon, SlideCard, InsertGap, createBlankSlide, createAiGeneratedSlide } from './OutlineSlideEditor';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

export function OutlineReviewView() {
  const router = useRouter();
  const slides = usePresentationFlowStore((s) => s.slides);
  const setSlides = usePresentationFlowStore((s) => s.setSlides);
  const selectedManuscriptId = usePresentationFlowStore((s) => s.selectedManuscriptId);
  const setSelectedManuscriptId = usePresentationFlowStore((s) => s.setSelectedManuscriptId);
  const setSelectedSectionIds = usePresentationFlowStore((s) => s.setSelectedSectionIds);
  const generateSlides = usePresentationFlowStore((s) => s.generateSlides);

  // Index the next AI slide will be inserted at — null when nothing's generating. Tracking the
  // index (not just a boolean) lets the specific gap that was clicked show its own "Generating…"
  // spinner instead of every insert control in the deck lighting up at once.
  const [addingAiAt, setAddingAiAt] = useState<number | null>(null);

  useEffect(() => {
    if (slides.length === 0) {
      const manuscript = MOCK_MANUSCRIPTS.find((m) => m.id === selectedManuscriptId) ?? MOCK_MANUSCRIPTS[0];
      if (!selectedManuscriptId) setSelectedManuscriptId(manuscript.id);
      setSelectedSectionIds(manuscript.sections.map((s) => s.id));
      generateSlides();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeSlide = (id: string) => setSlides(slides.filter((s) => s.id !== id));

  const updateSlideTitle = (id: string, title: string) =>
    setSlides(slides.map((s) => (s.id === id ? { ...s, title } : s)));

  const updateSlidePoints = (id: string, points: string[]) =>
    setSlides(slides.map((s) => (s.id === id ? { ...s, points } : s)));

  const addBlankSlideAt = (index: number) => {
    const next = [...slides];
    next.splice(index, 0, createBlankSlide());
    setSlides(next);
  };

  const addSlideWithAiAt = (index: number) => {
    setAddingAiAt(index);
    setTimeout(() => {
      const next = [...slides];
      next.splice(index, 0, createAiGeneratedSlide());
      setSlides(next);
      setAddingAiAt(null);
    }, 900);
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <PresentationStepHeader
        activeIndex={2}
        primaryAction={{ label: 'Choose a template', onClick: () => router.push('/presentation/theme') }}
      />

      <div className="flex-1 overflow-y-auto">
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 40px' }}>
          <button
            onClick={() => router.push('/presentation/sections')}
            className="flex items-center cursor-pointer"
            style={{
              gap: 6, marginBottom: 16, ...ns, fontSize: 13, fontWeight: 500, color: '#52637A',
              background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '7px 14px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F6F9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
            Back
          </button>
          <h1 style={{ ...ns, fontSize: 26, fontWeight: 700, color: '#0D1433', marginBottom: 8 }}>Review your outline</h1>
          <p style={{ ...ns, fontSize: 14, color: '#52637A', marginBottom: 24 }}>
            {slides.length} slides generated — edit any title before picking a template.
          </p>

          <Reorder.Group
            as="div"
            axis="y"
            values={slides}
            onReorder={setSlides}
            style={{ display: 'flex', flexDirection: 'column' }}
          >
            {slides.map((slide, i) => (
              <Fragment key={slide.id}>
                <SlideCard
                  slide={slide}
                  index={i}
                  onRemove={() => removeSlide(slide.id)}
                  onTitleChange={(title) => updateSlideTitle(slide.id, title)}
                  onPointsChange={(points) => updateSlidePoints(slide.id, points)}
                />
                {i < slides.length - 1 && (
                  <InsertGap
                    onAddBlank={() => addBlankSlideAt(i + 1)}
                    onAddAi={() => addSlideWithAiAt(i + 1)}
                    adding={addingAiAt === i + 1}
                  />
                )}
              </Fragment>
            ))}
          </Reorder.Group>

          <div className="flex items-center" style={{ gap: 10, marginTop: 16 }}>
            <button
              onClick={() => addBlankSlideAt(slides.length)}
              className="flex-1 flex items-center justify-center cursor-pointer"
              style={{ gap: 8, ...ns, fontSize: 13.5, fontWeight: 600, color: '#3D4A5C', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 10, padding: '11px 0' }}
            >
              <PlusIcon /> Add blank slide
            </button>
            <button
              onClick={() => addSlideWithAiAt(slides.length)}
              disabled={addingAiAt === slides.length}
              className="flex-1 flex items-center justify-center cursor-pointer"
              style={{ gap: 8, ...ns, fontSize: 13.5, fontWeight: 600, color: '#5326BD', background: '#fff', border: '1px solid #DCD3F5', borderRadius: 10, padding: '11px 0' }}
            >
              <AiSparkleIcon /> {addingAiAt === slides.length ? 'Generating…' : 'Add slide with AI'}
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes v2spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
