'use client';

import { create } from 'zustand';
import type { SavedVideoNarration } from '@/lib/videoMocks';

interface VideoFlowState {
  savedNarration: SavedVideoNarration | null;
}

interface VideoFlowActions {
  loadSavedNarration: (data: SavedVideoNarration) => void;
  clearSavedNarration: () => void;
}

export const useVideoFlowStore = create<VideoFlowState & VideoFlowActions>((set) => ({
  savedNarration: null,
  loadSavedNarration: (data) => set({ savedNarration: data }),
  clearSavedNarration: () => set({ savedNarration: null }),
}));
