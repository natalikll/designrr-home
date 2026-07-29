'use client';

import { create } from 'zustand';
import { getMockSlidesForManuscript, type MockSlide, type MockTheme, type SlideLayout, MOCK_THEMES } from '@/lib/presentationMocks';

export type SlideType = MockSlide['type'];
export type { SlideLayout };
export type TextOffset = NonNullable<MockSlide['titleOffset']>;

export type PresentationSlide = MockSlide;

interface PresentationFlowState {
  presentationTitle: string;
  // Identifies which saved Projects entry this deck was opened from, if any — null for a
  // freshly generated deck that was never opened from /projects. Lets downstream flows (like
  // "Create video") detect whether this exact deck already has a narrated video saved for it.
  presentationId: string | null;
  selectedManuscriptId: string | null;
  selectedSectionIds: string[];
  selectedThemeId: string;
  slides: PresentationSlide[];
  activeSlideId: string | null;
  narrationVersion: '1' | '2' | '3' | '4';
}

interface PresentationFlowActions {
  setPresentationTitle: (title: string) => void;
  setPresentationId: (id: string | null) => void;
  setSelectedManuscriptId: (id: string | null) => void;
  toggleSection: (id: string) => void;
  setSelectedSectionIds: (ids: string[]) => void;
  setSelectedThemeId: (id: string) => void;
  generateSlides: () => void;
  setSlides: (slides: PresentationSlide[]) => void;
  updateSlideTitle: (id: string, title: string) => void;
  setActiveSlideId: (id: string | null) => void;
  setNarrationVersion: (v: '1' | '2' | '3' | '4') => void;
  resetPresentationFlow: () => void;
}

type PresentationFlowStore = PresentationFlowState & PresentationFlowActions;

const initialState: PresentationFlowState = {
  presentationTitle: 'Untitled presentation',
  presentationId: null,
  selectedManuscriptId: null,
  selectedSectionIds: [],
  selectedThemeId: MOCK_THEMES[0].id,
  slides: [],
  activeSlideId: null,
  narrationVersion: '4',
};

export const usePresentationFlowStore = create<PresentationFlowStore>((set, get) => ({
  ...initialState,

  setPresentationTitle: (title) => set({ presentationTitle: title }),

  setPresentationId: (id) => set({ presentationId: id }),

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
