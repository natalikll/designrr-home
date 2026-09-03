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
  setShowAccount: (show: boolean, tab?: AccountTab) => void;
  setPromoActive: (on: boolean) => void;
  setPromoVariant: (v: 'offer' | 'announcement') => void;
  setProfilePhoto: (photo: string | null) => void;
  resetFlow: () => void;
  homeKey: number;
  bumpHomeKey: () => void;
  manuscriptGenerationsUsed: number;
  incrementManuscriptGenerations: () => void;
  // Separate pool from manuscripts — presentations are a genuinely different, more premium
  // output, so they get their own 5 free generations rather than sharing the book count.
  presentationGenerationsUsed: number;
  incrementPresentationGenerations: () => void;
  // Last route the sidebar saw itself mounted on — lets a freshly-mounted AppSidebar (after a
  // full route change away from '/') detect that the user just left the home page, since a new
  // mount has no memory of the previous route otherwise.
  lastPathname: string | null;
  setLastPathname: (path: string) => void;
  // Single source of truth for the viewer's plan. Previously each screen hard-coded its
  // own answer — the sidebar assumed 'standard' while My Account assumed 'premium'.
  currentPlan: PlanId;
  setCurrentPlan: (plan: PlanId) => void;
}

type FlowStore = FlowState & FlowActions;

const SIDEBAR_KEY = 'dsgn_sidebar_open';
/** @deprecated Standard's allowance specifically — use `manuscriptLimitFor(currentPlan)`. */
export const MANUSCRIPT_GENERATION_LIMIT = 5;
/** @deprecated Standard's presentation allowance specifically — use `presentationLimitFor(plan)`. */
export const PRESENTATION_GENERATION_LIMIT = 5;

/* Which plan the viewer is on. Ordered cheapest → dearest, so a tier badge can ask
   "is this above what they already have?" rather than being hard-coded per screen.
   Ids and labels match PLANS in MyAccountView. */
export type PlanId = 'standard' | 'pro' | 'premium' | 'agency';
export const PLAN_IDS: PlanId[] = ['standard', 'pro', 'premium', 'agency'];
export const PLAN_LABELS: Record<PlanId, string> = {
  standard: 'Standard',
  pro: 'PRO',
  premium: 'Premium',
  agency: 'Agency Premium',
};

export function planRank(plan: PlanId): number {
  return PLAN_IDS.indexOf(plan);
}

/* Wordgenie generations included with each plan. One pool, spent by books and presentations
   alike: Standard 10/mo, PRO 10/mo, Premium and Agency unlimited.
   Standard doubled from 5 when presentations launched, and the pool was deliberately left
   shared rather than split 5-and-5 — a ringfenced presentation allowance would expire unused
   for anyone who only writes books, and would make the gift smaller than it is.
   Standard doubling to 10 briefly collapsed the gap with PRO, so PRO moved to 20 to keep the
   ladder intact. The count is still the weaker half of PRO's story — what you can actually do
   with the output (PowerPoint, PNG, watermark-free links) is the half that gates a feature
   rather than a quantity. Infinity rather than
   a sentinel like -1 or 0, so "remaining" and "percent used" stay ordinary arithmetic and the
   unlimited case falls out of the same expressions instead of needing a branch everywhere. */
export const MANUSCRIPT_LIMITS: Record<PlanId, number> = {
  standard: 10,
  pro: 20,
  premium: Infinity,
  agency: Infinity,
};

export function manuscriptLimitFor(plan: PlanId): number {
  return MANUSCRIPT_LIMITS[plan];
}

/* Presentations are metered on every tier, not gated to PRO and above — Standard gets 5 a month
   and PRO gets 10, on a pool separate from manuscripts. What PRO actually unlocks is the export
   surface, not the ability to make one: Standard exports PDF and shares a link carrying a
   watermark, PRO adds PowerPoint and PNG and drops the watermark. That distinction matters to
   the deck, because it is a different gate shape from the rest — the feature is available, the
   output is limited.
   Premium and Agency are Infinity to mirror MANUSCRIPT_LIMITS. Confirm before this ships:
   the counts above were given for Standard and PRO only. */
export const PRESENTATION_LIMITS: Record<PlanId, number> = {
  standard: 5,
  pro: 10,
  premium: Infinity,
  agency: Infinity,
};

export function presentationLimitFor(plan: PlanId): number {
  return PRESENTATION_LIMITS[plan];
}

/* Monthly allowances roll over on the 1st. Derived from the clock rather than stored, so the
   preview can never show a date that's already passed. Nearly every usage surface in the study
   states this — Ferndesk's "Resets in 4 days", Gemini's "Resets at 3:22 PM", v0's "credits reset
   in 30 days" — because waiting is a real alternative to paying, and hiding it reads as pressure. */
export function allowanceResetLabel(now: Date = new Date()): string {
  const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const days = Math.ceil((nextReset.getTime() - now.getTime()) / 86_400_000);
  // A countdown only helps while it's imminent — "resets in 27 days" is a number you have to
  // convert before it means anything. Past a couple of days the date itself is what you'd plan
  // around, so say that instead.
  if (days <= 1) return 'Resets tomorrow';
  if (days === 2) return 'Resets in 2 days';
  return `Resets on ${nextReset.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
}

/* How full the allowance is, as one of four named states. Two surfaces read this — the sidebar
   meter and the composer's alert bar — and they have to agree: the moment the meter turns amber
   is the moment the alert appears, so a user never sees a calm sidebar above a warning bar. The
   80% threshold lived inline in the composer before this; keeping it in one place is the point. */
export type AccountTab = 'profile' | 'password' | 'preferences' | 'billing';

export type AllowanceState = 'unlimited' | 'ok' | 'low' | 'empty';

export function allowanceStateFor(remaining: number, limit: number): AllowanceState {
  if (!Number.isFinite(limit)) return 'unlimited';
  if (remaining <= 0) return 'empty';
  return (limit - remaining) / limit >= 0.8 ? 'low' : 'ok';
}

/* True when `current` already covers `required` — the condition for NOT showing a tier
   badge at all. GitLab's rule: a tier badge is only shown when the active plan is lower
   than the feature's, so a Premium customer never sees "Premium" on something they own. */
export function ownsPlan(current: PlanId, required: PlanId): boolean {
  return planRank(current) >= planRank(required);
}

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
  accountTab: 'profile',
  promoActive: false,
  promoVariant: 'offer',
  profilePhoto: null,
};

export const useFlowStore = create<FlowStore>((set) => ({
  ...initialState,
  homeKey: 0,
  lastPathname: null,
  setLastPathname: (path) => set({ lastPathname: path }),

  currentPlan: 'standard',
  setCurrentPlan: (plan) => set({ currentPlan: plan }),

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

  // Falls back to 'profile' on open so a previous deep-link can't leak into the next visit.
  setShowAccount: (show, tab) => set({ showAccount: show, accountTab: show ? tab ?? 'profile' : 'profile' }),
  setPromoActive: (on) => set({ promoActive: on }),
  setPromoVariant: (v) => set({ promoVariant: v }),

  setProfilePhoto: (photo) => set({ profilePhoto: photo }),

  resetFlow: () => set((s) => ({ ...initialState, sidebarOpen: s.sidebarOpen })),

  bumpHomeKey: () => set((s) => ({ homeKey: s.homeKey + 1 })),

  manuscriptGenerationsUsed: 0,
  // Capped at whatever the viewer's own plan includes, so a PRO user can reach 10 and a Premium
  // user is never capped at all.
  incrementManuscriptGenerations: () =>
    set((s) => ({ manuscriptGenerationsUsed: Math.min(s.manuscriptGenerationsUsed + 1, manuscriptLimitFor(s.currentPlan)) })),

  presentationGenerationsUsed: 0,
  incrementPresentationGenerations: () =>
    set((s) => ({ presentationGenerationsUsed: Math.min(s.presentationGenerationsUsed + 1, presentationLimitFor(s.currentPlan)) })),
}));

// Dev-only console access, e.g. `useFlowStore.setState({ manuscriptGenerationsUsed: 5 })`
// to re-trigger the exhausted-generations modal without actually generating 5 books, or
// `useFlowStore.setState({ currentPlan: 'premium' })` to watch tier badges disappear from
// everything that plan already covers.
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  (window as unknown as { useFlowStore: typeof useFlowStore }).useFlowStore = useFlowStore;
}
