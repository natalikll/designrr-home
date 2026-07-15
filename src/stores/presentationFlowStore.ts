'use client';

import { create } from 'zustand';
import { getMockSlidesForManuscript, type MockSlide, type MockTheme, type SlideLayout, MOCK_THEMES } from '@/lib/presentationMocks';

export type SlideType = MockSlide['type'];
export type { SlideLayout };
export type TextOffset = NonNullable<MockSlide['titleOffset']>;

export type PresentationSlide = MockSlide;

interface PresentationFlowState {
  presentationTitle: string;
  selectedManuscriptId: string | null;
  selectedSectionIds: string[];
  selectedThemeId: string;
  slides: PresentationSlide[];
  activeSlideId: string | null;
  narrationVersion: '1' | '2';
}

interface PresentationFlowActions {
  setPresentationTitle: (title: string) => void;
  setSelectedManuscriptId: (id: string | null) => void;
  toggleSection: (id: string) => void;
  setSelectedSectionIds: (ids: string[]) => void;
  setSelectedThemeId: (id: string) => void;
  generateSlides: () => void;
  setSlides: (slides: PresentationSlide[]) => void;
  updateSlideTitle: (id: string, title: string) => void;
  setActiveSlideId: (id: string | null) => void;
  setNarrationVersion: (v: '1' | '2') => void;
  resetPresentationFlow: () => void;
}

type PresentationFlowStore = PresentationFlowState & PresentationFlowActions;

const initialState: PresentationFlowState = {
  presentationTitle: 'Untitled presentation',
  selectedManuscriptId: null,
  selectedSectionIds: [],
  selectedThemeId: MOCK_THEMES[0].id,
  slides: [],
  activeSlideId: null,
  narrationVersion: '1',
};

export const usePresentationFlowStore = create<PresentationFlowStore>((set, get) => ({
  ...initialState,

  setPresentationTitle: (title) => set({ presentationTitle: title }),

  setSelectedManuscriptId: (id) => set({ selectedManuscriptId: id, selectedSectionIds: [] }),

  toggleSection: (id) =>
    set((state) => ({
      selectedSectionIds: state.selectedSectionIds.includes(id)
        ? state.selectedSectionIds.filter((s) => s !== id)
        : [...state.selectedSectionIds, id],
    })),

  setSelectedSectionIds: (ids) => set({ selectedSectionIds: ids }),

  setSelectedThemeId: (id) => set({ selectedThemeId: id }),

  generateSlides: () => {
    const { selectedManuscriptId, selectedSectionIds } = get();
    if (!selectedManuscriptId) return;
    const slides = getMockSlidesForManuscript(selectedManuscriptId, selectedSectionIds);
    set({ slides, activeSlideId: slides[0]?.id ?? null });
  },

  setSlides: (slides) => set({ slides, activeSlideId: slides[0]?.id ?? null }),

  updateSlideTitle: (id, title) =>
    set((state) => ({
      slides: state.slides.map((s) => (s.id === id ? { ...s, title } : s)),
    })),

  setActiveSlideId: (id) => set({ activeSlideId: id }),

  setNarrationVersion: (v) => set({ narrationVersion: v }),

  resetPresentationFlow: () => set(initialState),
}));

export function getThemeById(id: string): MockTheme {
  return MOCK_THEMES.find((t) => t.id === id) ?? MOCK_THEMES[0];
}
