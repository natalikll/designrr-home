export interface MockSection {
  id: string;
  title: string;
  wordCount: number;
}

export interface MockManuscript {
  id: string;
  title: string;
  cover?: string;
  editedAt: string;
  sections: MockSection[];
}

export type SlideLayout = 'standard' | 'centered' | 'image-right' | 'image-left' | 'two-column' | 'big-title' | 'split' | 'minimal';

export interface TextOffset {
  x: number;
  y: number;
}

export interface SlidePhoto {
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MockSlide {
  id: string;
  type: 'headline' | 'content';
  title: string;
  points: string[];
  notes?: string;
  layout?: SlideLayout;
  bgColor?: string;
  bgImageUrl?: string;
  imageUrl?: string;
  textColorOverride?: string;
  titleFontFamily?: string;
  contentFontFamily?: string;
  titleFontWeight?: number;
  contentFontWeight?: number;
  titleFontSize?: number;
  contentFontSize?: number;
  titleTextAlign?: 'left' | 'center' | 'right' | 'justify';
  contentTextAlign?: 'left' | 'center' | 'right' | 'justify';
  contentAlign?: 'top' | 'center' | 'bottom';
  listStyle?: 'none' | 'bullet' | 'numbered';
  slidePhoto?: SlidePhoto;
  titleOffset?: TextOffset;
  contentOffset?: TextOffset;
}

export interface MockTheme {
  id: string;
  name: string;
  bg: string;
  titleColor: string;
  accentColor: string;
  /** Starter deck shown in the editor's Templates gallery for this theme */
  slides: MockSlide[];
}

export const MOCK_MANUSCRIPTS: MockManuscript[] = [
  {
    id: 'm-1',
    title: 'Design Career Handbook',
    editedAt: '2 days ago',
    sections: [
      { id: 'm1-s1', title: 'Finding Your Path', wordCount: 820 },
      { id: 'm1-s2', title: 'Building a Portfolio', wordCount: 1140 },
      { id: 'm1-s3', title: 'Landing the Interview', wordCount: 980 },
      { id: 'm1-s4', title: 'Growing Into Senior', wordCount: 1050 },
    ],
  },
  {
    id: 'm-2',
    title: 'The Remote Work Playbook',
    editedAt: '5 days ago',
    sections: [
      { id: 'm2-s1', title: 'Setting Up Your Space', wordCount: 700 },
      { id: 'm2-s2', title: 'Async Communication', wordCount: 1200 },
      { id: 'm2-s3', title: 'Staying Visible', wordCount: 900 },
    ],
  },
  {
    id: 'm-3',
    title: 'Mindful Productivity',
    editedAt: '1 week ago',
    sections: [
      { id: 'm3-s1', title: 'The Myth of Multitasking', wordCount: 900 },
      { id: 'm3-s2', title: 'Deep Work Rituals', wordCount: 1100 },
      { id: 'm3-s3', title: 'Rest as a Strategy', wordCount: 850 },
    ],
  },
  {
    id: 'm-4',
    title: 'Startup Fundraising 101',
    editedAt: '2 weeks ago',
    sections: [
      { id: 'm4-s1', title: 'Before You Raise', wordCount: 800 },
      { id: 'm4-s2', title: 'Crafting the Pitch', wordCount: 1150 },
      { id: 'm4-s3', title: 'Term Sheets Explained', wordCount: 980 },
      { id: 'm4-s4', title: 'Closing the Round', wordCount: 700 },
    ],
  },
  {
    id: 'm-5',
    title: "The Creative's Guide to Burnout",
    editedAt: '3 weeks ago',
    sections: [
      { id: 'm5-s1', title: 'Recognizing the Signs', wordCount: 750 },
      { id: 'm5-s2', title: 'Setting Boundaries', wordCount: 1000 },
      { id: 'm5-s3', title: 'Recovering Your Spark', wordCount: 900 },
    ],
  },
  {
    id: 'm-6',
    title: 'Negotiation Tactics for Founders',
    editedAt: '1 month ago',
    sections: [
      { id: 'm6-s1', title: 'Know Your Leverage', wordCount: 820 },
      { id: 'm6-s2', title: 'Reading the Room', wordCount: 960 },
      { id: 'm6-s3', title: 'Walking Away', wordCount: 680 },
    ],
  },
  {
    id: 'm-7',
    title: 'Building in Public',
    editedAt: '1 month ago',
    sections: [
      { id: 'm7-s1', title: 'Why Share the Journey', wordCount: 700 },
      { id: 'm7-s2', title: 'What to Post and When', wordCount: 950 },
      { id: 'm7-s3', title: 'Turning Followers Into Customers', wordCount: 1100 },
    ],
  },
  {
    id: 'm-8',
    title: 'The First 90 Days',
    editedAt: '2 months ago',
    sections: [
      { id: 'm8-s1', title: 'Your First Week', wordCount: 600 },
      { id: 'm8-s2', title: 'Building Trust', wordCount: 900 },
      { id: 'm8-s3', title: 'Early Wins', wordCount: 850 },
      { id: 'm8-s4', title: 'Setting Up for Year Two', wordCount: 700 },
    ],
  },
];

function starterDeck(name: string): MockSlide[] {
  return [
    { id: `${name}-1`, type: 'headline', title: name, points: [], layout: 'centered' },
    { id: `${name}-2`, type: 'content', title: 'Overview', points: ['First key point', 'Second key point', 'Third key point'], layout: 'standard' },
    { id: `${name}-3`, type: 'content', title: 'Thank you', points: ['Questions & discussion'], layout: 'centered' },
  ];
}

export const MOCK_THEMES: MockTheme[] = [
  { id: 'blank', name: 'Blank slide', bg: '#FFFFFF', titleColor: '#15191F', accentColor: '#006EFE', slides: starterDeck('Blank') },
  { id: 'minimal', name: 'Minimal', bg: '#FFFFFF', titleColor: '#0D1433', accentColor: '#006EFE', slides: starterDeck('Minimal') },
  { id: 'bold', name: 'Bold', bg: '#0B0D12', titleColor: '#FFFFFF', accentColor: '#F0B429', slides: starterDeck('Bold') },
  { id: 'corporate', name: 'Corporate', bg: '#0B1B33', titleColor: '#FFFFFF', accentColor: '#7FB2FF', slides: starterDeck('Corporate') },
  { id: 'playful', name: 'Playful', bg: 'linear-gradient(135deg,#FF7A45 0%,#E91E8C 100%)', titleColor: '#FFFFFF', accentColor: '#FFFFFF', slides: starterDeck('Playful') },
  { id: 'artisan', name: 'Artisan', bg: '#EDE3D3', titleColor: '#3A2E1F', accentColor: '#C98A2B', slides: starterDeck('Artisan') },
  { id: 'darkmode', name: 'Dark Mode', bg: '#0B0D12', titleColor: '#FFFFFF', accentColor: '#2DD4A7', slides: starterDeck('Dark Mode') },
  { id: 'muted', name: 'Muted', bg: '#DCE3F0', titleColor: '#1B2A4A', accentColor: '#5B6B8C', slides: starterDeck('Muted') },
  { id: 'classic', name: 'Classic', bg: '#FFFFFF', titleColor: '#15191F', accentColor: '#D0342C', slides: starterDeck('Classic') },
];

export function getMockSlidesForManuscript(manuscriptId: string, sectionIds: string[]): MockSlide[] {
  const manuscript = MOCK_MANUSCRIPTS.find((m) => m.id === manuscriptId);
  if (!manuscript) return [];
  const sections = manuscript.sections.filter((s) => sectionIds.includes(s.id));

  const slides: MockSlide[] = [
    { id: 'slide-title', type: 'headline', title: manuscript.title, points: [], notes: 'Generated from your manuscript', layout: 'centered' },
  ];

  sections.forEach((section, i) => {
    slides.push({
      id: `${section.id}-content`,
      type: 'content',
      title: section.title,
      points: [
        'Key takeaway from this section',
        'Supporting detail drawn from your chapter',
        'A point worth remembering',
      ],
      layout: i % 3 === 2 ? 'image-left' : 'standard',
      bgColor: i === 0 ? '#0D0D0D' : undefined,
      textColorOverride: i === 0 ? '#FFFFFF' : undefined,
    });
  });

  slides.push({ id: 'slide-closing', type: 'headline', title: 'Thank you', points: ['Questions & discussion'], layout: 'centered' });

  return slides;
}

/** Freeform-topic slide generator, used by the AI-chat "describe your presentation" flow */
export function getMockSlidesForTopic(topic: string): MockSlide[] {
  const clean = topic.trim().replace(/\.$/, '') || 'Your presentation';
  return [
    { id: 'topic-title', type: 'headline', title: clean, points: [], notes: 'Generated with AI', layout: 'centered' },
    { id: 'topic-1', type: 'content', title: 'Why this matters', points: [
      `Context and background on ${clean.toLowerCase()}`,
      'Who this is relevant for',
      'What the audience will walk away with',
    ], layout: 'standard' },
    { id: 'topic-2', type: 'content', title: 'The core idea', points: [`"${clean}" — distilled into one clear message.`], layout: 'big-title' },
    { id: 'topic-3', type: 'content', title: 'Key points', points: [
      'First supporting point',
      'Second supporting point',
      'Third supporting point',
    ], layout: 'standard' },
    { id: 'topic-4', type: 'content', title: 'A closer look', points: [
      'Detail worth visualizing',
      'A statistic or example',
    ], layout: 'image-left' },
    { id: 'topic-closing', type: 'headline', title: 'Thank you', points: ['Questions & discussion'], layout: 'centered' },
  ];
}
