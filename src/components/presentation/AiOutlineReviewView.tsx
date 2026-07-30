'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Reorder } from 'framer-motion';
import { useFlowStore } from '@/stores/flowStore';
import { usePresentationFlowStore } from '@/stores/presentationFlowStore';
import { SettingsPillRow } from './SettingsPillRow';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';
import { PlusIcon, AiSparkleIcon, SlideCard, createBlankSlide, createAiGeneratedSlide } from './OutlineSlideEditor';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

export function AiOutlineReviewView() {
  const router = useRouter();
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);

  const slides = usePresentationFlowStore((s) => s.slides);
  const setSlides = usePresentationFlowStore((s) => s.setSlides);
  const presentationTitle = usePresentationFlowStore((s) => s.presentationTitle);
  const presentationSubtitle = usePresentationFlowStore((s) => s.presentationSubtitle);

  const [addingWithAi, setAddingWithAi] = useState(false);

  const removeSlide = (id: string) => setSlides(slides.filter((s) => s.id !== id));

  const updateSlideTitle = (id: string, title: string) =>
    setSlides(slides.map((s) => (s.id === id ? { ...s, title } : s)));

  const updateSlidePoints = (id: string, points: string[]) =>
    setSlides(slides.map((s) => (s.id === id ? { ...s, points } : s)));

  const addBlankSlide = () => setSlides([...slides, createBlankSlide()]);

  const addSlideWithAi = () => {
    setAddingWithAi(true);
    setTimeout(() => {
      setSlides([...slides, createAiGeneratedSlide()]);
      setAddingWithAi(false);
    }, 900);
  };

  return (
    <div className="h-full flex flex-col bg-white relative">
      <div className="flex-shrink-0 relative z-10 px-4 py-3 flex items-center justify-between bg-white border-b border-border-light">
        <Tooltip label={sidebarOpen ? 'Close sidebar menu' : 'Show sidebar menu'} position="right">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-10 h-10 rounded-lg hover:bg-[#F6F7F9] transition-colors cursor-pointer">
            <SideMenuIcon active={sidebarOpen} />
          </button>
        </Tooltip>
        <span style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F' }}>Presentation outline</span>
        <button
          onClick={() => router.push('/presentation/theme')}
          className="flex-shrink-0 flex items-center cursor-pointer"
          style={{ ...ns, fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 8, padding: '8px 18px' }}
        >
          Select Template
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 40px' }}>
          <SettingsPillRow exclude={['tone', 'density']} />

          <h1 style={{ ...ns, fontSize: 32, fontWeight: 800, color: '#15191F', marginTop: 20, lineHeight: 1.25 }}>
            {presentationTitle}
          </h1>
          {presentationSubtitle && (
            <p style={{ ...ns, fontSize: 14.5, color: '#667C98', marginTop: 8, marginBottom: 24 }}>
              {presentationSubtitle}
            </p>
          )}

          <Reorder.Group
            as="div"
            axis="y"
            values={slides}
            onReorder={setSlides}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            {slides.map((slide, i) => (
              <SlideCard
                key={slide.id}
                slide={slide}
                index={i}
                onRemove={() => removeSlide(slide.id)}
                onTitleChange={(title) => updateSlideTitle(slide.id, title)}
                onPointsChange={(points) => updateSlidePoints(slide.id, points)}
              />
            ))}
          </Reorder.Group>

          <div className="flex items-center" style={{ gap: 10, marginTop: 16 }}>
            <button
              onClick={addBlankSlide}
              className="flex-1 flex items-center justify-center cursor-pointer"
              style={{ gap: 8, ...ns, fontSize: 13.5, fontWeight: 600, color: '#3D4A5C', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 10, padding: '11px 0' }}
            >
              <PlusIcon /> Add blank slide
            </button>
            <button
              onClick={addSlideWithAi}
              disabled={addingWithAi}
              className="flex-1 flex items-center justify-center cursor-pointer"
              style={{ gap: 8, ...ns, fontSize: 13.5, fontWeight: 600, color: '#5326BD', background: '#fff', border: '1px solid #DCD3F5', borderRadius: 10, padding: '11px 0' }}
            >
              <AiSparkleIcon /> {addingWithAi ? 'Generating…' : 'Add slide with AI'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
