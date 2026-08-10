'use client';

import { useState } from 'react';
import { Reorder } from 'framer-motion';
import { FilmstripItem } from '@/components/presentation/FilmstripItem';
import { SlideThumbnail } from '@/components/presentation/PresentationEditorView';
import { MOCK_THEMES } from '@/lib/presentationMocks';
import type { PresentationSlide } from '@/stores/presentationFlowStore';

const theme = MOCK_THEMES.find(t => t.id === 'aurora')!;

function mockSlide(id: string): PresentationSlide {
  return {
    id,
    type: 'content',
    title: 'Building a Portfolio',
    points: ['Researching the market and defining a personal niche.', 'Curating 6–8 strongest pieces of work.'],
    bgColor: '#5A2266',
  };
}

const STATES = [
  { id: 'skeleton', label: 'Skeleton', description: 'Loading placeholder — no number badge yet.' },
  { id: 'default', label: 'Default', description: 'Resting state — number badge only.' },
  { id: 'hover', label: 'Hover', description: 'Drag handle + ⋯ menu fade in.' },
  { id: 'dropdownOpen', label: 'Dropdown open', description: '⋯ menu clicked — action list visible.' },
  { id: 'active', label: 'Active', description: 'Selected slide — blue outline.' },
] as const;

export default function FilmstripStatesPreviewPage() {
  const [slides] = useState(() => STATES.map(s => mockSlide(s.id)));

  return (
    <div className="min-h-screen w-full bg-[#F4F5F7] p-10">
      <h1 className="text-lg font-semibold text-[#15191F] mb-1">Filmstrip slide item — states</h1>
      <p className="text-sm text-[#52637A] mb-8">
        Component: src/components/presentation/FilmstripItem.tsx — the &quot;default&quot; card below also responds to a real mouse hover.
      </p>
      <div className="flex flex-wrap items-start gap-8">
        {STATES.map((state, i) => {
          const slide = slides[i];
          return (
            <div key={state.id} className="flex flex-col items-start" style={{ width: 220 }}>
              <Reorder.Group as="div" axis="x" values={[slide]} onReorder={() => {}}>
                <FilmstripItem
                  slide={slide}
                  thumbnail={<SlideThumbnail slide={slide} theme={theme} />}
                  index={0}
                  isActive={state.id === 'active'}
                  isBlank={false}
                  loading={state.id === 'skeleton'}
                  previewForceHover={state.id === 'hover' || state.id === 'dropdownOpen'}
                  defaultMenuOpen={state.id === 'dropdownOpen'}
                  onClick={() => {}}
                  onGenerate={() => {}}
                  onDuplicate={() => {}}
                  onRemove={() => {}}
                  onAddAfter={() => {}}
                  onAddWithAI={() => {}}
                />
              </Reorder.Group>
              <div className="mt-2">
                <div className="text-xs font-semibold text-[#15191F]">{state.label}</div>
                <div className="text-xs text-[#8C97A8] mt-0.5">{state.description}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
