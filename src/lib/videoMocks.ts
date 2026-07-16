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
};
