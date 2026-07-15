'use client';

import { create } from 'zustand';
import type {
  FlowState,
  FlowStep,
  ChatMessage,
  BookDirection,
  BookOutline,
  GeneratedBook,
  UserResponses,
  BookType,
} from '@/lib/types';

interface FlowActions {
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setStep: (step: FlowStep) => void;
  setUserResponse: (key: keyof UserResponses, value: string) => void;
  selectDirection: (direction: BookDirection) => void;
  setOutline: (outline: BookOutline) => void;
  updateOutlineTitle: (title: string) => void;
  updateOutlineSubtitle: (subtitle: string) => void;
  updateChapterTitle: (chapterId: string, title: string) => void;
  updateChapterDescription: (chapterId: string, description: string) => void;
  updateSubChapterTitle: (chapterId: string, subChapterId: string, title: string) => void;
  updateSubChapterDescription: (chapterId: string, subChapterId: string, description: string) => void;
  setBook: (book: GeneratedBook) => void;
  updateBookTitle: (title: string) => void;
  updateBookSubtitle: (subtitle: string) => void;
  updateBookChapterTitle: (chapterId: string, title: string) => void;
  updateBookChapterContent: (chapterId: string, content: string) => void;
  setAiTyping: (typing: boolean) => void;
  setTransitioning: (transitioning: boolean, type?: 'outline' | 'book') => void;
  toggleChat: () => void;
  setShowChat: (show: boolean) => void;
  setBookType: (type: BookType) => void;
  setShowBookTypeSelector: (show: boolean) => void;
  setOutlineWelcomeSent: (sent: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  hydrateSidebarPref: () => void;
  setImporting: (importing: boolean) => void;
  setShowAccount: (show: boolean) => void;
  setProfilePhoto: (photo: string | null) => void;
  resetFlow: () => void;
  homeKey: number;
  bumpHomeKey: () => void;
}

type FlowStore = FlowState & FlowActions;

const SIDEBAR_KEY = 'dsgn_sidebar_open';

function readSidebarPref(): boolean {
  if (typeof window === 'undefined') return true;
  const v = localStorage.getItem(SIDEBAR_KEY);
  return v === null ? true : v === 'true';
}

function writeSidebarPref(open: boolean) {
  if (typeof window !== 'undefined') localStorage.setItem(SIDEBAR_KEY, String(open));
}

const initialState: FlowState = {
  currentStep: 0,
  messages: [],
  userResponses: {},
  selectedDirection: null,
  generatedOutline: null,
  generatedBook: null,
  isAiTyping: false,
  isTransitioning: false,
  transitionType: 'outline',
  showChat: false,
  selectedBookType: null,
  showBookTypeSelector: false,
  outlineWelcomeSent: false,
  sidebarOpen: true,
  isImporting: false,
  showAccount: false,
  profilePhoto: null,
};

export const useFlowStore = create<FlowStore>((set) => ({
  ...initialState,
  homeKey: 0,

  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
        },
      ],
    })),

  setStep: (step) => set({ currentStep: step }),

  setUserResponse: (key, value) =>
    set((state) => ({
      userResponses: { ...state.userResponses, [key]: value },
    })),

  selectDirection: (direction) => set({ selectedDirection: direction }),

  setOutline: (outline) => set({ generatedOutline: outline }),

  updateOutlineTitle: (title) =>
    set((state) => ({
      generatedOutline: state.generatedOutline
        ? { ...state.generatedOutline, title }
        : null,
    })),

  updateOutlineSubtitle: (subtitle) =>
    set((state) => ({
      generatedOutline: state.generatedOutline
        ? { ...state.generatedOutline, subtitle }
        : null,
    })),

  updateChapterTitle: (chapterId, title) =>
    set((state) => ({
      generatedOutline: state.generatedOutline
        ? {
          ...state.generatedOutline,
          chapters: state.generatedOutline.chapters.map((ch) =>
            ch.id === chapterId ? { ...ch, title } : ch
          ),
        }
        : null,
    })),

  updateChapterDescription: (chapterId, description) =>
    set((state) => ({
      generatedOutline: state.generatedOutline
        ? {
          ...state.generatedOutline,
          chapters: state.generatedOutline.chapters.map((ch) =>
            ch.id === chapterId ? { ...ch, description } : ch
          ),
        }
        : null,
    })),

  updateSubChapterTitle: (chapterId, subChapterId, title) =>
    set((state) => ({
      generatedOutline: state.generatedOutline
        ? {
          ...state.generatedOutline,
          chapters: state.generatedOutline.chapters.map((ch) =>
            ch.id === chapterId
              ? {
                ...ch,
                subChapters: ch.subChapters.map((sub) =>
                  sub.id === subChapterId ? { ...sub, title } : sub
                ),
              }
              : ch
          ),
        }
        : null,
    })),

  updateSubChapterDescription: (chapterId, subChapterId, description) =>
    set((state) => ({
      generatedOutline: state.generatedOutline
        ? {
          ...state.generatedOutline,
          chapters: state.generatedOutline.chapters.map((ch) =>
            ch.id === chapterId
              ? {
                ...ch,
                subChapters: ch.subChapters.map((sub) =>
                  sub.id === subChapterId ? { ...sub, description } : sub
                ),
              }
              : ch
          ),
        }
        : null,
    })),

  setBook: (book) => set({ generatedBook: book }),

  updateBookTitle: (title) =>
    set((state) => ({
      generatedBook: state.generatedBook
        ? { ...state.generatedBook, title }
        : null,
    })),

  updateBookSubtitle: (subtitle) =>
    set((state) => ({
      generatedBook: state.generatedBook
        ? { ...state.generatedBook, subtitle }
        : null,
    })),

  updateBookChapterTitle: (chapterId, title) =>
    set((state) => ({
      generatedBook: state.generatedBook
        ? {
          ...state.generatedBook,
          chapters: state.generatedBook.chapters.map((ch) =>
            ch.id === chapterId ? { ...ch, title } : ch
          ),
        }
        : null,
    })),

  updateBookChapterContent: (chapterId, content) =>
    set((state) => ({
      generatedBook: state.generatedBook
        ? {
          ...state.generatedBook,
          chapters: state.generatedBook.chapters.map((ch) =>
            ch.id === chapterId ? { ...ch, content } : ch
          ),
        }
        : null,
    })),

  setAiTyping: (typing) => set({ isAiTyping: typing }),

  setTransitioning: (transitioning, type) =>
    set({
      isTransitioning: transitioning,
      ...(type ? { transitionType: type } : {}),
    }),

  toggleChat: () => set((state) => ({ showChat: !state.showChat })),

  setShowChat: (show) => set({ showChat: show }),

  setBookType: (type) => set({ selectedBookType: type }),

  setShowBookTypeSelector: (show) => set({ showBookTypeSelector: show }),

  setOutlineWelcomeSent: (sent) => set({ outlineWelcomeSent: sent }),

  setSidebarOpen: (open) => { writeSidebarPref(open); set({ sidebarOpen: open }); },

  hydrateSidebarPref: () => set({ sidebarOpen: readSidebarPref() }),

  setImporting: (importing) => set({ isImporting: importing }),

  setShowAccount: (show) => set({ showAccount: show }),

  setProfilePhoto: (photo) => set({ profilePhoto: photo }),

  resetFlow: () => set((s) => ({ ...initialState, sidebarOpen: s.sidebarOpen })),

  bumpHomeKey: () => set((s) => ({ homeKey: s.homeKey + 1 })),
}));
