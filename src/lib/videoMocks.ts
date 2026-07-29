import type { MockSlide } from './presentationMocks';

export type NarrationSource = 'ai' | 'record' | 'upload';
export type NarrationAudioStatus = 'empty' | 'generating' | 'recording' | 'ready' | 'stale';

export interface SavedSlideAudio {
  source: NarrationSource;
  methodSet: boolean;
  scopeSet: boolean;
  scope: 'single' | 'multi';
  voiceId: string;
  status: NarrationAudioStatus;
  duration: number;
}

export interface SavedVideoNarration {
  scripts: string[];
  audios: SavedSlideAudio[];
  defaultVoice: string;
  cloneName: string | null;
}

/** Videos already created and saved under /projects — reopening one should restore exactly this state. */
export interface SavedVideo {
  title: string;
  themeId: string;
  slides: MockSlide[];
  narration: SavedVideoNarration;
  // Which saved presentation (Projects entry id) this video was narrated from, if any — lets
  // "Create video" from that deck detect an existing video instead of silently starting a new one.
  sourcePresentationId?: string;
}

export const SAVED_VIDEOS: Record<string, SavedVideo> = {
  '15': {
    title: 'Book Trailer: The Confidence Blueprint',
    themeId: 'bold',
    slides: [
      { id: 'bt-1', type: 'headline', title: 'The Confidence Blueprint', points: [], layout: 'centered' },
      {
        id: 'bt-2', type: 'content', title: "What You'll Learn", layout: 'standard',
        points: [
          'Reframe self-doubt into forward motion',
          'Build a daily confidence practice',
          'Speak up in rooms that used to intimidate you',
        ],
      },
      { id: 'bt-3', type: 'content', title: 'Available Now', points: ['Grab your copy today'], layout: 'centered' },
    ],
    narration: {
      scripts: [
        'The Confidence Blueprint.',
        "In this book you'll learn how to reframe self-doubt into forward motion, build a daily confidence practice, and speak up in rooms that used to intimidate you.",
        'Available now — grab your copy today.',
      ],
      audios: [
        { source: 'ai', methodSet: true, scopeSet: true, scope: 'multi', voiceId: 'aria', status: 'ready', duration: 4.2 },
        { source: 'ai', methodSet: true, scopeSet: true, scope: 'multi', voiceId: 'aria', status: 'ready', duration: 9.8 },
        { source: 'ai', methodSet: true, scopeSet: true, scope: 'multi', voiceId: 'aria', status: 'ready', duration: 3.1 },
      ],
      defaultVoice: 'aria',
      cloneName: null,
    },
  },
  '16': {
    title: 'Author Voiceover Intro',
    themeId: 'minimal',
    slides: [
      { id: 'avi-1', type: 'headline', title: 'A Note From the Author', points: [], layout: 'centered' },
      {
        id: 'avi-2', type: 'content', title: 'About This Book', layout: 'standard',
        points: [
          'Written from 10 years of coaching notes',
          'Real stories from real clients',
          'A practical, no-fluff approach to confidence',
        ],
      },
    ],
    narration: {
      scripts: [
        "Hi — I'm so glad you're here.",
        "This book comes from ten years of coaching notes and real stories from real clients. It's a practical, no-fluff approach to confidence.",
      ],
      audios: [
        { source: 'record', methodSet: true, scopeSet: true, scope: 'single', voiceId: 'your-voice', status: 'ready', duration: 5.6 },
        { source: 'record', methodSet: true, scopeSet: true, scope: 'single', voiceId: 'your-voice', status: 'ready', duration: 11.2 },
      ],
      defaultVoice: 'aria',
      cloneName: 'Your voice',
    },
  },
  '17': {
    title: 'Q2 Roadmap — Narrated',
    themeId: 'corporate',
    sourcePresentationId: '13',
    slides: [
      { id: 'q2v-1', type: 'headline', title: 'Q2 Roadmap', points: [], layout: 'centered' },
      { id: 'q2v-2', type: 'content', title: 'Where We Left Off', points: ['Q1 shipped the redesigned onboarding flow', 'Activation rate up 18% quarter over quarter'], layout: 'standard' },
      { id: 'q2v-3', type: 'content', title: 'Priorities This Quarter', points: ['Ship the new billing system', 'Launch mobile app beta', 'Reduce churn in the enterprise tier'], layout: 'standard' },
      { id: 'q2v-4', type: 'content', title: 'Key Risks', points: ['Mobile beta depends on the payments API landing on time', 'Enterprise churn work needs a dedicated support hire'], layout: 'standard' },
      { id: 'q2v-5', type: 'content', title: 'Thank You', points: ['Questions & discussion'], layout: 'centered' },
    ],
    narration: {
      scripts: [
        'Q2 roadmap.',
        "Quick recap — in Q1 we shipped the redesigned onboarding flow, and activation rate is up 18% quarter over quarter.",
        'This quarter our priorities are shipping the new billing system, launching the mobile app beta, and reducing churn in the enterprise tier.',
        'A couple of key risks to flag — the mobile beta depends on the payments API landing on time, and the enterprise churn work needs a dedicated support hire.',
        "That's it from me — happy to take questions.",
      ],
      audios: [
        { source: 'record', methodSet: true, scopeSet: true, scope: 'single', voiceId: 'your-voice', status: 'ready', duration: 3.4 },
        { source: 'record', methodSet: true, scopeSet: true, scope: 'single', voiceId: 'your-voice', status: 'ready', duration: 8.1 },
        { source: 'record', methodSet: true, scopeSet: true, scope: 'single', voiceId: 'your-voice', status: 'ready', duration: 9.6 },
        { source: 'record', methodSet: true, scopeSet: true, scope: 'single', voiceId: 'your-voice', status: 'ready', duration: 10.3 },
        { source: 'record', methodSet: true, scopeSet: true, scope: 'single', voiceId: 'your-voice', status: 'ready', duration: 4.0 },
      ],
      defaultVoice: 'aria',
      cloneName: 'Your voice',
    },
  },
};

/** Looks up an already-saved video narrated from the given presentation (Projects entry id), if any. */
export function findVideoForPresentation(presentationId: string | null): (SavedVideo & { id: string }) | null {
  if (!presentationId) return null;
  for (const [id, video] of Object.entries(SAVED_VIDEOS)) {
    if (video.sourcePresentationId === presentationId) return { id, ...video };
  }
  return null;
}
