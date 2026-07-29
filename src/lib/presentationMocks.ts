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

export type SlideLayout = 'standard' | 'centered' | 'image-right' | 'image-left' | 'two-column' | 'big-title' | 'split' | 'minimal'
  | 'fig-cover-1' | 'fig-cover-2' | 'fig-cover-3'
  | 'fig-section-1' | 'fig-section-2' | 'fig-section-3'
  | 'fig-bullets-1' | 'fig-bullets-2' | 'fig-bullets-3'
  | 'fig-two-col-1' | 'fig-two-col-2' | 'fig-two-col-3'
  | 'fig-three-col-1' | 'fig-three-col-2' | 'fig-three-col-3'
  | 'fig-photo-text-1' | 'fig-photo-text-2' | 'fig-photo-text-3'
  | 'fig-text-photo-1' | 'fig-text-photo-2' | 'fig-text-photo-3'
  | 'fig-full-image-1' | 'fig-full-image-2' | 'fig-full-image-3'
  | 'fig-comparison-1' | 'fig-comparison-2' | 'fig-comparison-3'
  | 'fig-grid-1' | 'fig-grid-2' | 'fig-grid-3'
  | 'fig-quote-1' | 'fig-quote-2' | 'fig-quote-3'
  | 'fig-closing-1' | 'fig-closing-2' | 'fig-closing-3';

export interface TextOffset {
  x: number;
  y: number;
}

export interface SlidePhoto {
  id: string;
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
  iconId?: string;
  iconColor?: string;
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
  ruleColorOverride?: string;
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
  slidePhotos?: SlidePhoto[];
  titleOffset?: TextOffset;
  contentOffset?: TextOffset;
}

export interface MockTheme {
  id: string;
  name: string;
  bg: string;
  titleColor: string;
  accentColor: string;
  /** Optional CSS gradient used in place of accentColor for fig- template badges/rules/glows (Aurora theme). When unset, fig- rendering uses the flat accentColor, unchanged. */
  accentGradient?: string;
  /** Optional theme-level default for fig- template headline font (falls back to Syne). */
  figTitleFont?: string;
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

/**
 * Starter deck for the "Ascend" theme, based on a Figma template with 12 slide types.
 * Each slide defaults to its "-1" (plain) layout variant; the other two variants of the same
 * family are reachable from the right panel's layout switcher, scoped to that slide's family.
 * Bullet-style slides encode each point as "Heading\nDescription" (parsed by SlideContent);
 * the Comparison slide encodes its two cards as [...leftPoints, '---', ...rightPoints].
 */
function ascendDeck(): MockSlide[] {
  return [
    { id: 'ascend-1', type: 'headline', title: 'Your Presentation Title Goes Here', points: [
      'A concise and compelling subtitle that supports your main message', 'Author Name  ·  2026',
    ], layout: 'fig-cover-1' },
    { id: 'ascend-2', type: 'headline', title: 'Section Title Goes Here', points: ['SECTION 01'], layout: 'fig-section-1' },
    { id: 'ascend-3', type: 'content', title: 'Slide Title Goes Here', points: [
      'First key point\nA brief explanation that supports this idea with relevant context or data.',
      'Second key point\nAnother supporting detail. Keep each bullet to one clear, digestible idea.',
      'Third key point\nA third insight that builds on the previous points and adds depth.',
      'Fourth key point\nA final takeaway that reinforces your message and prompts the next action.',
    ], layout: 'fig-bullets-1' },
    { id: 'ascend-4', type: 'content', title: 'Section Heading', points: [
      'Key Point One\nA brief description that supports this key idea and adds context to your presentation audience.',
      'Key Point Two\nAnother supporting detail that helps tell your story. Keep it concise and visually balanced.',
    ], layout: 'fig-two-col-1' },
    { id: 'ascend-5', type: 'content', title: 'Section Heading', points: [
      'Key Point One\nA brief description that supports this key idea and adds context to your presentation audience.',
      'Key Point Two\nAnother supporting detail that helps tell your story. Keep it concise and visually balanced.',
      'Key Point Three\nA third insight or takeaway that rounds out this section and drives your message home.',
    ], layout: 'fig-three-col-1' },
    { id: 'ascend-6', type: 'content', title: 'Slide Title Goes Here', points: [
      'Supporting description that expands on the slide title. Keep this concise and let the image do the heavy lifting on visual storytelling.',
    ], layout: 'fig-photo-text-1' },
    { id: 'ascend-7', type: 'content', title: 'Slide Title Goes Here', points: [
      'Supporting description that expands on the slide title. Keep this concise and let the image do the heavy lifting on visual storytelling.',
    ], layout: 'fig-text-photo-1' },
    { id: 'ascend-8', type: 'content', title: 'Slide Title Goes Here', points: [], layout: 'fig-full-image-1', bgColor: '#B8C7D6' },
    { id: 'ascend-9', type: 'content', title: 'Comparison', points: [
      'Current Approach', 'Sequential, linear project phases', 'Fixed requirements at the start', 'Testing happens at the end of cycle',
      '---',
      'Proposed Approach', 'Iterative sprints and continuous delivery', 'Flexible, evolving user requirements', 'Early and frequent releases and feedback',
    ], layout: 'fig-comparison-1' },
    { id: 'ascend-10', type: 'content', title: 'Slide Headline Goes Here', points: [
      'First Point\nA supporting explanation for this item. Keep it short and focused on one idea.',
      'Second Point\nAnother explanation here. Each block should be self-contained and easy to scan.',
      'Third Point\nA third idea that rounds out the top row and contributes to the overall message.',
      'Fourth Point\nA final point that ties the slide together and reinforces the headline above.',
    ], layout: 'fig-grid-1' },
    { id: 'ascend-11', type: 'content', title: 'The best way to predict the future is to create it.', points: ['— Author Name, Role or Organization'], layout: 'fig-quote-1' },
    { id: 'ascend-12', type: 'headline', title: 'Any Questions?', points: ['name@email.com  ·  www.yourwebsite.com'], layout: 'fig-closing-1' },
  ];
}

/**
 * Starter deck for the "Aurora" theme, based on a Claude Design template ("Template Deck.dc.html")
 * with the same 12 slide families as Ascend. Each slide defaults to its "-1" (primary) layout
 * variant; the fig- rendering code re-skins Aurora's palette (gradient badges, glow backgrounds,
 * Newsreader headlines) onto the same structural variants already built for Ascend.
 */
function auroraDeck(): MockSlide[] {
  return [
    { id: 'aurora-1', type: 'headline', title: 'Your presentation title goes here', points: [
      'A short supporting subtitle that frames what this deck covers', 'Presenter Name  ·  Month 2026',
    ], layout: 'fig-cover-1' },
    { id: 'aurora-2', type: 'headline', title: 'Section title goes here', points: ['SECTION 01'], layout: 'fig-section-1' },
    { id: 'aurora-3', type: 'content', title: 'Headline describing the main point of this slide', points: [
      'First supporting point\nA brief explanation that supports this idea with relevant context or data.',
      'Second supporting point\nAnother supporting detail. Keep each bullet to one clear, digestible idea.',
      'Third supporting point\nA third insight that builds on the previous points and adds depth.',
    ], layout: 'fig-bullets-1' },
    { id: 'aurora-4', type: 'content', title: 'A headline that frames these two related ideas', points: [
      'First column title\nSupporting copy describing the first idea in more detail for the reader.',
      'Second column title\nSupporting copy describing the second idea in more detail for the reader.',
    ], layout: 'fig-two-col-1' },
    { id: 'aurora-5', type: 'content', title: 'A headline that frames these three ideas', points: [
      'First topic\nShort description of the first topic and why it matters here.',
      'Second topic\nShort description of the second topic and why it matters here.',
      'Third topic\nShort description of the third topic and why it matters here.',
    ], layout: 'fig-three-col-1' },
    { id: 'aurora-6', type: 'content', title: 'A headline that connects to the photo alongside it', points: [
      'Body copy elaborating on the image, giving context or a supporting narrative for this slide.',
    ], layout: 'fig-photo-text-1' },
    { id: 'aurora-7', type: 'content', title: 'A headline that connects to the photo alongside it', points: [
      'Body copy elaborating on the image, giving context or a supporting narrative for this slide.',
    ], layout: 'fig-text-photo-1' },
    { id: 'aurora-8', type: 'content', title: 'A bold statement placed over the image', points: [], layout: 'fig-full-image-1', bgColor: '#15141C' },
    { id: 'aurora-9', type: 'content', title: 'Comparing two approaches side by side', points: [
      'Option A', 'First characteristic of this option', 'Second characteristic of this option', 'Third characteristic of this option',
      '---',
      'Option B', 'First characteristic of this option', 'Second characteristic of this option', 'Third characteristic of this option',
    ], layout: 'fig-comparison-1' },
    { id: 'aurora-10', type: 'content', title: 'A headline that frames these four ideas', points: [
      'First item\nBrief description of the first supporting item.',
      'Second item\nBrief description of the second supporting item.',
      'Third item\nBrief description of the third supporting item.',
      'Fourth item\nBrief description of the fourth supporting item.',
    ], layout: 'fig-grid-1' },
    { id: 'aurora-11', type: 'content', title: 'Your quote goes here, spoken by someone whose perspective adds credibility to the point being made.', points: [
      'Name Surname, Title / Company',
    ], layout: 'fig-quote-1' },
    { id: 'aurora-12', type: 'headline', title: 'Thank you', points: ['Questions and discussion welcome.'], layout: 'fig-closing-1' },
  ];
}

export const MOCK_THEMES: MockTheme[] = [
  { id: 'blank', name: 'Blank slide', bg: '#FFFFFF', titleColor: '#15191F', accentColor: '#006EFE', slides: starterDeck('Blank') },
  { id: 'ascend', name: 'Ascend', bg: '#FFFFFF', titleColor: '#001633', accentColor: '#4F46E5', slides: ascendDeck() },
  {
    id: 'aurora', name: 'Aurora',
    bg: 'radial-gradient(1100px 700px at 88% -10%, rgba(124,58,237,0.30), transparent 60%), radial-gradient(900px 600px at -5% 105%, rgba(255,106,61,0.28), transparent 60%), #15141C',
    titleColor: '#F4F3F8', accentColor: '#7C3AED',
    accentGradient: 'linear-gradient(135deg, #7C3AED 0%, #D63BC8 50%, #FF6A3D 100%)',
    figTitleFont: "'Newsreader', serif",
    slides: auroraDeck(),
  },
  { id: 'minimal', name: 'Minimal', bg: '#FFFFFF', titleColor: '#0D1433', accentColor: '#006EFE', slides: starterDeck('Minimal') },
  { id: 'bold', name: 'Bold', bg: '#0B0D12', titleColor: '#FFFFFF', accentColor: '#F0B429', slides: starterDeck('Bold') },
  { id: 'corporate', name: 'Corporate', bg: '#0B1B33', titleColor: '#FFFFFF', accentColor: '#7FB2FF', slides: starterDeck('Corporate') },
  { id: 'playful', name: 'Playful', bg: 'linear-gradient(135deg,#FF7A45 0%,#E91E8C 100%)', titleColor: '#FFFFFF', accentColor: '#FFFFFF', slides: starterDeck('Playful') },
  { id: 'artisan', name: 'Artisan', bg: '#EDE3D3', titleColor: '#3A2E1F', accentColor: '#C98A2B', slides: starterDeck('Artisan') },
  { id: 'darkmode', name: 'Dark Mode', bg: '#0B0D12', titleColor: '#FFFFFF', accentColor: '#2DD4A7', slides: starterDeck('Dark Mode') },
  { id: 'muted', name: 'Muted', bg: '#DCE3F0', titleColor: '#1B2A4A', accentColor: '#5B6B8C', slides: starterDeck('Muted') },
  { id: 'classic', name: 'Classic', bg: '#FFFFFF', titleColor: '#15191F', accentColor: '#D0342C', slides: starterDeck('Classic') },
];

/** Presentations already created and saved under /projects — reopening one should restore exactly this state. */
export interface SavedPresentation {
  title: string;
  themeId: string;
  slides: MockSlide[];
}

export const SAVED_PRESENTATIONS: Record<string, SavedPresentation> = {
  '13': {
    title: 'Q2 Roadmap',
    themeId: 'corporate',
    slides: [
      { id: 'q2-1', type: 'headline', title: 'Q2 Roadmap', points: [], layout: 'centered' },
      { id: 'q2-2', type: 'content', title: 'Where We Left Off', points: ['Q1 shipped the redesigned onboarding flow', 'Activation rate up 18% quarter over quarter'], layout: 'standard' },
      { id: 'q2-3', type: 'content', title: 'Priorities This Quarter', points: ['Ship the new billing system', 'Launch mobile app beta', 'Reduce churn in the enterprise tier'], layout: 'standard' },
      { id: 'q2-4', type: 'content', title: 'Key Risks', points: ['Mobile beta depends on the payments API landing on time', 'Enterprise churn work needs a dedicated support hire'], layout: 'standard' },
      { id: 'q2-5', type: 'content', title: 'Thank You', points: ['Questions & discussion'], layout: 'centered' },
    ],
  },
};

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
      // 'image-left' was here for layout variety, but these slides never carry an imageUrl —
      // ImageZone falls back to a plain gray placeholder that ignores the selected theme
      // entirely, so a dark/colorful theme gets one incongruous light-gray slide. 'two-column'
      // gives the same visual variety without depending on image content. Same reasoning for
      // the hardcoded bgColor/textColorOverride below — a theme-agnostic near-black slide
      // looks fine against a dark theme (coincidentally) and broken against a light one.
      layout: i % 3 === 2 ? 'two-column' : 'standard',
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
