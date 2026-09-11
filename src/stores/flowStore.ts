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
  // Same shared pool as manuscripts, tracked as its own counter only so usage can be reported by
  // kind — see the note above MANUSCRIPT_LIMITS in this file for what used to live here instead.
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

/* Which plan the viewer is on. Ordered cheapest → dearest, so a tier badge can ask
   "is this above what they already have?" rather than being hard-coded per screen.
   Ids and labels match PLANS in MyAccountView. */
export type PlanId = 'standard' | 'pro' | 'premium' | 'agency';
export const PLAN_IDS: PlanId[] = ['standard', 'pro', 'premium', 'agency'];
/* Sentence case throughout. "Pro" was the lone caps entry, which meant TierBadge — which applies
   no textTransform, deliberately — rendered "PRO" beside "Premium" on the same publish list, and
   the template gallery showed the same word three ways: "Upgrade to use all Pro templates" in the
   header, "Pro" in the type filter, "PRO" in the badge. Sentence case was already the majority in
   user-facing copy, and it is what GitLab, Navattic, ClickUp and Canva all ship. */
export const PLAN_LABELS: Record<PlanId, string> = {
  standard: 'Standard',
  pro: 'Pro',
  premium: 'Premium',
  agency: 'Agency Premium',
};

export function planRank(plan: PlanId): number {
  return PLAN_IDS.indexOf(plan);
}

/* Wordgenie generations included with each plan — ONE shared pool, spent by books and
   presentations alike: Standard 10/mo (a 5 base plus 5 extra), PRO 20/mo (10 base plus 10
   extra), Premium and Agency unlimited. Infinity rather than a sentinel like -1 or 0, so
   "remaining" and "percent used" stay ordinary arithmetic and the unlimited case falls out of
   the same expressions instead of needing a branch everywhere.

   There used to be a second map here, PRESENTATION_LIMITS (Standard 5, PRO 10), modelling
   presentations as their own capped pool separate from manuscripts. That was never true of the
   actual offer — the "extra" 5/10 is fungible, usable for either — and the two increment
   actions each clamped against their own map, so a presentation never drew down the number the
   composer's gate actually checks (`manuscriptGenerationsUsed`). In practice this meant
   presentations were unmetered: `presentationGenerationsUsed` climbed and stopped at 5 or 10,
   but nothing that gates generation ever read it. `combinedGenerationsUsed` below is the fix —
   one limit, two counters kept only so the account page can show what the pool went to.

   What PRO actually unlocks is real and worth keeping distinct from the count: the export
   surface, not the ability to generate. Standard exports PDF and shares a link carrying a
   watermark; PRO adds PowerPoint and PNG and drops the watermark. That's a different gate shape
   from the rest — the feature is available, the output is limited — and it has nothing to do
   with how many generations either tier gets. */
export const MANUSCRIPT_LIMITS: Record<PlanId, number> = {
  standard: 10,
  pro: 20,
  premium: Infinity,
  agency: Infinity,
};

export function manuscriptLimitFor(plan: PlanId): number {
  return MANUSCRIPT_LIMITS[plan];
}

/** Books generated plus presentations generated — the one number the shared pool is actually
    spent against. Everything that gates generation should compare this to `manuscriptLimitFor`,
    never `manuscriptGenerationsUsed` alone; the two per-kind counters exist only so the account
    page can show the split, not to gate anything on their own. */
export function combinedGenerationsUsed(s: Pick<FlowStore, 'manuscriptGenerationsUsed' | 'presentationGenerationsUsed'>): number {
  return s.manuscriptGenerationsUsed + s.presentationGenerationsUsed;
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
  accountTabRequestId: 0,
  promoActive: false,
  promoVariant: 'offer',
  profilePhoto: null,
};

export const useFlowStore = create<FlowStore>((set) => ({
  ...initialState,
  homeKey: 0,
  bumpHomeKey: () => set((s) => ({ homeKey: s.homeKey + 1 })),
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
  // The plan row's actual bug: this used to write accountTab and stop there. MyAccountView only
  // consumes accountTab through useState's initial value, so it's read once on mount — opening
  // My Account fresh (from a route where it's a conditionally-mounted overlay) picked it up fine,
  // but the sidebar's plan row calling this while the view was ALREADY mounted (the dedicated
  // /account route, where MyAccountView is always rendered, or any route where the overlay was
  // already open) changed the store's accountTab with nothing downstream to notice. The request
  // id bumps unconditionally, every call, so MyAccountView's effect has something to key off that
  // changes even when the destination tab repeats — e.g. billing → user clicks Profile locally →
  // sidebar's plan row again, which asks for billing a second time.
  setShowAccount: (show, tab) =>
    set((s) => ({
      showAccount: show,
      accountTab: show ? tab ?? 'profile' : 'profile',
      accountTabRequestId: show ? s.accountTabRequestId + 1 : s.accountTabRequestId,
    })),
  setPromoActive: (on) => set({ promoActive: on }),
  setPromoVariant: (v) => set({ promoVariant: v }),

  setProfilePhoto: (photo) => set({ profilePhoto: photo }),

  resetFlow: () => set((s) => ({ ...initialState, sidebarOpen: s.sidebarOpen })),

  manuscriptGenerationsUsed: 0,
  // Both actions clamp against the ONE shared limit, not a limit of their own — a book and a
  // presentation draw from the same pool, so whichever gets generated first is the one that
  // should make the other scarcer. Each still only increments its own counter, so the account
  // page can report the books/presentations split; neither counter is a gate by itself.
  incrementManuscriptGenerations: () =>
    set((s) => (combinedGenerationsUsed(s) >= manuscriptLimitFor(s.currentPlan)
      ? s
      : { manuscriptGenerationsUsed: s.manuscriptGenerationsUsed + 1 })),

  presentationGenerationsUsed: 0,
  incrementPresentationGenerations: () =>
    set((s) => (combinedGenerationsUsed(s) >= manuscriptLimitFor(s.currentPlan)
      ? s
      : { presentationGenerationsUsed: s.presentationGenerationsUsed + 1 })),
}));

// Dev-only console access, e.g. `useFlowStore.setState({ manuscriptGenerationsUsed: 5 })`
// to re-trigger the exhausted-generations modal without actually generating 5 books, or
// `useFlowStore.setState({ currentPlan: 'premium' })` to watch tier badges disappear from
// everything that plan already covers.
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  (window as unknown as { useFlowStore: typeof useFlowStore }).useFlowStore = useFlowStore;
}
