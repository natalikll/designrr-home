'use client';

import { create } from 'zustand';
import type { ChatMessage } from '@/lib/types';

interface PresentationUserResponses {
  topic?: string;
  audience?: string;
  goal?: string;
  style?: string;
}

/** A structured AI question tagged with which PRESENTATION_STEP_CONFIGS entry it
 *  represents, so the step divider reflects the real question asked even when
 *  earlier questions get skipped (e.g. the audience was already given up front). */
export interface PresentationChatMessage extends ChatMessage {
  stepSlot?: number;
}

interface PresentationChatState {
  currentStep: number;
  messages: PresentationChatMessage[];
  userResponses: PresentationUserResponses;
  isAiTyping: boolean;
  ready: boolean;
}

interface PresentationChatActions {
  addMessage: (message: Omit<PresentationChatMessage, 'id' | 'timestamp'>) => void;
  setStep: (step: number) => void;
  setUserResponse: (key: keyof PresentationUserResponses, value: string) => void;
  setAiTyping: (typing: boolean) => void;
  setReady: (ready: boolean) => void;
  reset: () => void;
}

type PresentationChatStore = PresentationChatState & PresentationChatActions;

const initialState: PresentationChatState = {
  currentStep: 0,
  messages: [],
  userResponses: {},
  isAiTyping: false,
  ready: false,
};

export const usePresentationChatStore = create<PresentationChatStore>((set) => ({
  ...initialState,

  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: `pmsg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
        },
      ],
    })),

  setStep: (step) => set({ currentStep: step }),

  setUserResponse: (key, value) =>
    set((state) => ({ userResponses: { ...state.userResponses, [key]: value } })),

  setAiTyping: (typing) => set({ isAiTyping: typing }),

  setReady: (ready) => set({ ready }),

  reset: () => set(initialState),
}));
