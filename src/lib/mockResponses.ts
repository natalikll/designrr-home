import type { BookDirection, BookOutline, GeneratedBook, ExampleCard, AiStructuredContent, StepConfig } from './types';

// ── Hero Screen ──
export const HERO_SUBTITLE =
  "Answer a few questions. I'll create a manuscript in your authentic voice. You can export in different formats when you're done.";

export const HERO_PLACEHOLDER =
  'Tell me about yourself and what you\'d like to write about?';

export const HERO_FALLBACK = 'Not sure yet? Just tell me what you do and share your interests.';

export const HERO_HELPER = "Don't hold back or overthink it. More detail helps me capture your real voice.";

export const HERO_EXAMPLE_CARDS: ExampleCard[] = [
  {
    id: 'ex-1',
    label: 'Has a topic',
    text: "I'm a therapist, 15 years in. I want to write a book for therapists \u2014 the empathic ones who absorb clients' pain and end up burnt out.",
  },
  {
    id: 'ex-2',
    label: 'No topic yet',
    text: "I've spent the last few years deep into mindfulness and personal development. I have a lot of thoughts but no idea how to turn it into a book.",
  },
];

// ── Step Configs (shown in step dividers) ──
export const STEP_CONFIGS: Record<number, StepConfig> = {
  1: { number: 1, label: 'About You', totalSteps: 6 },
  2: { number: 2, label: 'Your Approach', totalSteps: 6 },
  3: { number: 3, label: 'Your Story', totalSteps: 6 },
  4: { number: 4, label: 'Book Direction', totalSteps: 6 },
  5: { number: 5, label: 'Generating Outline', totalSteps: 6 },
  6: { number: 6, label: 'Your Outline', totalSteps: 6 },
};

// ── Structured AI Responses per step ──
export function getStructuredAiResponse(step: number): AiStructuredContent {
  switch (step) {
    case 1:
      return {
        heading: 'Do you have a unique approach?',
        body: "What's your signature thing \u2014 something people know you for? A method, framework, or process that's yours?",
        hasExample: true,
        exampleText: "I developed something I call the 'Mirror Method' \u2014 it helps therapists recognize when they're absorbing instead of reflecting. It's become my whole practice.",
        fallbackHeading: 'Not sure yet?',
        fallbackBody: "No worries \u2014 just drop any ideas, concepts, or thoughts.",
        fallbackAction: "I'm not sure yet",
        progressHint: "One more question after this, then I'll suggest some book directions based on what you share.",
      };
    case 2:
      return {
        heading: 'One more thing before I start putting this together.',
        body: "What's your story with this topic? How did you get into it, what's your experience, and why does it matter to you?",
        hasExample: true,
        exampleText: "I hit burnout hard about 5 years in. Couldn't even sit with clients anymore. That's when I started researching empathic fatigue and realized nobody was talking about it honestly.",
        fallbackHeading: 'Not sure yet?',
        fallbackBody: 'Take your time \u2014 even a few sentences about how this topic found you will help a lot.',
        fallbackAction: "I'll keep it brief",
      };
    case 3:
      return {
        heading: 'Perfect \u2014 here\'s what I got:',
        body: '',
        voiceHeading: 'Your voice:',
        voiceText: 'Direct, human, and grounded. You teach through real stories, call things out plainly, skip guru language, and use clarity \u2014 not hype \u2014 as the conversion lever.',
        backgroundHeading: 'Your background:',
        backgroundText: 'You came into this work by watching talented course creators sabotage their own launches the moment selling entered the picture. You saw the same pattern over and over: authentic voices built trust organically, then got replaced by swipe-file hype \u2014 and results collapsed. Now you help creators protect the voice that made people care in the first place, even when the stakes (and money) go up.',
        directionsIntro: "Based on everything you've told me, here are 5 book directions:",
        hasExample: false,
      };
    default:
      return { body: '' };
  }
}

export const STEP_PLACEHOLDERS: Record<number, string> = {
  1: 'Tell me about yourself and what you\'d like to write about...',
  2: 'Share your unique approach or signature method...',
  3: 'Tell me your story with this topic...',
};

// ── Direction Cards ──
export function getMockDirections(): BookDirection[] {
  return [
    {
      id: 'dir-1',
      title: 'The Empathic Therapist\'s Survival Guide',
      subtitle: 'Practical Tools for Healers Who Feel Too Much',
      description:
        'A hands-on guide helping therapists recognize empathic fatigue, set boundaries, and build sustainable practices without losing their compassion.',
      emoji: '\ud83d\udee1\ufe0f',
      bestFor: 'Therapists seeking practical tools',
      vibe: 'Warm, actionable, supportive',
      whyThisWorks: 'Combines your 15 years of clinical experience with immediately usable strategies',
    },
    {
      id: 'dir-2',
      title: 'Beyond the Mirror',
      subtitle: 'A New Framework for Empathic Practice',
      description:
        'Introducing your Mirror Method as a complete system for therapists to transform how they hold space for clients.',
      emoji: '\ud83e\ude9e',
      bestFor: 'Practitioners wanting a structured method',
      vibe: 'Professional, innovative, systematic',
      whyThisWorks: 'Positions your Mirror Technique as a distinctive framework others can adopt',
    },
    {
      id: 'dir-3',
      title: 'Burnout to Breakthrough',
      subtitle: "One Therapist's Journey Back to Purpose",
      description:
        'A memoir-style book blending your personal story with actionable insights for therapists on the edge of burnout.',
      emoji: '\ud83d\udd25',
      bestFor: 'Therapists on the edge of burnout',
      vibe: 'Personal, raw, inspiring',
      whyThisWorks: 'Your authentic story creates deep connection with readers facing the same struggles',
    },
    {
      id: 'dir-4',
      title: 'The Feeling Profession',
      subtitle: "Why Therapy's Best Practitioners Are Burning Out",
      description:
        'A thought-leadership book examining the systemic issues in mental health that lead to therapist burnout, with your framework as the solution.',
      emoji: '\ud83d\udca1',
      bestFor: 'Industry leaders and advocates',
      vibe: 'Bold, authoritative, eye-opening',
      whyThisWorks: 'Elevates you as a thought leader tackling a systemic problem in the field',
    },
    {
      id: 'dir-5',
      title: 'Hold Space, Not Pain',
      subtitle: 'Redefining Empathy in Therapeutic Practice',
      description:
        'A transformative guide that reframes what empathy means in clinical work and teaches a healthier model of client connection.',
      emoji: '\ud83e\udd32',
      bestFor: 'Empaths in helping professions',
      vibe: 'Compassionate, groundbreaking, healing',
      whyThisWorks: 'Challenges conventional wisdom about empathy with a fresh, healthier paradigm',
    },
  ];
}

// ── Outline ──
export function getMockOutline(direction: BookDirection): BookOutline {
  return {
    title: direction.title,
    subtitle: direction.subtitle,
    totalPages: 50,
    chapters: [
      {
        id: 'ch-1', number: 1,
        title: 'Introduction',
        description: 'Purpose: Create tension + promise resolution',
        pageRange: '4-6 pages',
        subChapters: [
          { id: 'ss-1-1', title: 'The relatable problem:', description: 'Your reader already knows email marketing matters — but every time they sit down to write, the voice that built their Instagram following disappears.' },
          { id: 'ss-1-2', title: 'Why common solutions fail:', description: "Most advice tells people to 'just write how you talk' — but that ignores the psychological shift that happens when stakes are involved." },
          { id: 'ss-1-3', title: 'Your core framework:', description: 'Introduce the Voice Transfer Method as a systematic bridge between casual content and high-converting emails.' },
          { id: 'ss-1-4', title: 'Who this is for:', description: 'Course creators, coaches, consultants who have an authentic voice on social but freeze when writing sales emails.' },
          { id: 'ss-1-5', title: 'What will change:', description: 'By the end of the book, readers will be able to write launch emails that feel like their best Instagram captions — and convert 4X better.' },
        ],
      },
      {
        id: 'ch-2', number: 2,
        title: 'Section 1: The Voice Gap',
        description: 'Goal: Reframe the problem correctly',
        pageRange: '8-9 pages',
        subChapters: [
          { id: 'ss-2-1', title: 'Micro-story opener:', description: 'A creator with 50K followers who sounds like a robot in their emails — and the moment they realized it was costing them sales.' },
          { id: 'ss-2-2', title: "What you'll learn:", description: 'Why your voice changes when money is on the line, the psychology of authenticity under pressure, and how to identify your own Voice Gap.' },
          { id: 'ss-2-3', title: 'Key concept:', description: "The Voice Gap — the measurable difference between how you sound when you're being yourself vs. when you're trying to sell." },
        ],
      },
      {
        id: 'ch-3', number: 3,
        title: 'Section 2: Why Your Emails Sound Wrong',
        description: 'Goal: Diagnose the root cause',
        pageRange: '6-7 pages',
        subChapters: [
          { id: 'ss-3-1', title: 'The swipe file trap:', description: "How copying other people's email templates strips away what makes your voice unique." },
          { id: 'ss-3-2', title: 'The formality reflex:', description: 'Why we unconsciously shift into "professional mode" when writing emails — and what it costs us.' },
          { id: 'ss-3-3', title: 'The proof:', description: "Side-by-side comparison of the same person's Instagram caption vs. their launch email — spotting exactly where voice breaks down." },
        ],
      },
      {
        id: 'ch-4', number: 4,
        title: 'Section 3: The Voice Transfer Method',
        description: 'Goal: Introduce the complete framework',
        pageRange: '8-10 pages',
        subChapters: [
          { id: 'ss-4-1', title: 'The three-step system:', description: 'Capture, Translate, Amplify — the core framework that moves your authentic voice from social content to sales emails.' },
          { id: 'ss-4-2', title: 'Step 1 — Capture:', description: 'How to extract the voice patterns that make your best content resonate (with specific exercises).' },
          { id: 'ss-4-3', title: 'Step 2 — Translate:', description: 'Converting casual voice into persuasive copy without losing what makes it yours.' },
          { id: 'ss-4-4', title: 'Step 3 — Amplify:', description: 'Adding conversion elements that enhance rather than override your natural style.' },
        ],
      },
      {
        id: 'ch-5', number: 5,
        title: 'Section 4: Capture Your Voice',
        description: 'Goal: Master the first step of the method',
        pageRange: '5-6 pages',
        subChapters: [
          { id: 'ss-5-1', title: 'The voice audit:', description: 'A structured exercise to identify the specific words, rhythms, and patterns that define your authentic voice.' },
          { id: 'ss-5-2', title: 'Mining your best content:', description: 'How to pull voice DNA from your top-performing posts and stories.' },
          { id: 'ss-5-3', title: 'Your voice profile:', description: 'Building a reference document that captures your unique communication style for consistent reuse.' },
        ],
      },
      {
        id: 'ch-6', number: 6,
        title: 'Section 5: Translate Without Losing Yourself',
        description: 'Goal: Bridge casual voice to conversion copy',
        pageRange: '5-6 pages',
        subChapters: [
          { id: 'ss-6-1', title: 'The translation framework:', description: 'Sentence-level techniques for keeping your voice while adding persuasive structure.' },
          { id: 'ss-6-2', title: 'Before & after examples:', description: 'Real transformations showing voice-preserved emails vs. generic templates.' },
          { id: 'ss-6-3', title: 'The authenticity check:', description: 'A quick self-test to ensure every email still sounds like you before hitting send.' },
        ],
      },
      {
        id: 'ch-7', number: 7,
        title: 'Section 6: Amplify for Conversion',
        description: 'Goal: Add conversion power without sacrificing voice',
        pageRange: '5-6 pages',
        subChapters: [
          { id: 'ss-7-1', title: 'Voice-first CTAs:', description: 'How to write calls-to-action that sound like natural extensions of your content, not sales tricks.' },
          { id: 'ss-7-2', title: 'Story-driven urgency:', description: 'Creating genuine urgency through narrative instead of countdown timers and fake scarcity.' },
          { id: 'ss-7-3', title: 'The conversion layer:', description: 'Adding strategic elements (social proof, objection handling) in your own voice.' },
        ],
      },
      {
        id: 'ch-8', number: 8,
        title: 'Section 7: Launch Email Sequences',
        description: 'Goal: Apply the method to a complete launch',
        pageRange: '4-5 pages',
        subChapters: [
          { id: 'ss-8-1', title: 'The 5-email launch sequence:', description: 'A complete voice-first email framework for product launches that converts.' },
          { id: 'ss-8-2', title: 'Email-by-email breakdown:', description: 'Detailed templates showing how each email in the sequence uses the Voice Transfer Method.' },
          { id: 'ss-8-3', title: 'Timing and rhythm:', description: 'When to send each email and how to maintain voice consistency across the sequence.' },
        ],
      },
      {
        id: 'ch-9', number: 9,
        title: 'Section 8: Beyond Launches',
        description: 'Goal: Extend the method to all email marketing',
        pageRange: '3-4 pages',
        subChapters: [
          { id: 'ss-9-1', title: 'Weekly newsletters:', description: 'Applying voice transfer to regular content that builds trust and primes for future offers.' },
          { id: 'ss-9-2', title: 'Automated sequences:', description: 'Setting up welcome and nurture sequences that sound like you, not a robot.' },
        ],
      },
      {
        id: 'ch-10', number: 10,
        title: 'Conclusion',
        description: 'Purpose: Reinforce the transformation and inspire action',
        pageRange: '2-3 pages',
        subChapters: [
          { id: 'ss-10-1', title: 'The voice-first future:', description: 'Why authenticity is the ultimate competitive advantage in a world of AI-generated content.' },
          { id: 'ss-10-2', title: 'Your next step:', description: 'A clear action plan for implementing the Voice Transfer Method starting with your very next email.' },
        ],
      },
    ],
  };
}

// ── Book Generation ──
export function getMockBook(outline: BookOutline): GeneratedBook {
  return {
    title: outline.title,
    subtitle: outline.subtitle,
    chapters: outline.chapters.map((ch) => ({
      id: `book-${ch.id}`,
      number: ch.number,
      title: ch.title,
      content: generateSectionContent(ch.number, ch.title, ch.description),
    })),
  };
}

function generateSectionContent(num: number, title: string, description: string): string {
  const paragraphs = [
    description,
    "When I first began exploring this area, I didn't realize how deep it would go. What started as a personal observation quickly became a central theme in my practice and, eventually, the foundation for everything I teach today.",
    "In this section, we'll explore the key ideas, frameworks, and practical tools that will help you navigate this terrain with confidence. Whether you're just starting to notice the signs or you've been wrestling with these challenges for years, there's something here for you.",
    "The research is clear on one thing: awareness is the first step. Most practitioners I work with don't recognize the patterns until someone points them out. That's what this section is designed to do \u2014 hold up a mirror so you can see what's really happening beneath the surface.",
    "Let me share a story that illustrates this perfectly. Early in my career, I had a client who was going through an incredibly difficult divorce. Session after session, I found myself carrying the weight of their pain home with me. I'd lie awake at night running through their words, feeling their grief as if it were my own. At the time, I thought that was just what being a good therapist meant.",
    "I was wrong. And that realization \u2014 painful as it was \u2014 became the seed of everything you're about to read.",
    "The framework I'm going to walk you through isn't theoretical. It's been tested in my practice, refined through hundreds of sessions, and validated by colleagues who were brave enough to try something different. It works because it starts where you actually are, not where someone thinks you should be.",
    "Here's what I want you to understand before we go further: there is no shame in struggling with this. The very qualities that make you an exceptional therapist \u2014 your sensitivity, your depth of feeling, your ability to truly sit with someone's pain \u2014 are the same qualities that make you vulnerable. This isn't a weakness to fix. It's a strength to manage.",
    "Think of it like this: a surgeon needs steady hands, but they also need to know when to rest those hands. Your empathy is your instrument. This book is about learning to care for it so it can serve you \u2014 and your clients \u2014 for years to come.",
    "In the pages that follow, you'll find practical exercises you can implement immediately. I've designed them to fit into a real therapist's schedule \u2014 because I know you don't have hours of free time to devote to self-improvement programs. Five minutes between sessions. Ten minutes at the end of the day. That's where transformation happens.",
    "You'll also find journal prompts, self-assessment tools, and real examples from practitioners who've walked this path. Their stories might look different from yours on the surface, but I suspect you'll recognize something familiar in each one.",
    "This work matters. Not just for you, but for every client who sits across from you hoping to be truly seen. When you take care of yourself, you show up better. Period. There's no getting around that truth.",
    "So let's begin. Take a breath, set aside whatever happened in your last session, and give yourself permission to focus on you for a change. You deserve the same quality of attention you give to everyone else.",
  ];

  const numParagraphs = Math.min(6 + (num % 4), paragraphs.length);
  return paragraphs.slice(0, numParagraphs).join('\n\n');
}
