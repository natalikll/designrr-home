import type { AiStructuredContent, StepConfig } from './types';

// ── Hero echo (mirrors the entry-box placeholder the user just answered) ──
export const PRESENTATION_HERO_PLACEHOLDER = 'What should your presentation be about?';

// ── Step Configs (shown in step dividers) ──
export const PRESENTATION_STEP_CONFIGS: Record<number, StepConfig> = {
  1: { number: 1, label: 'Your Topic', totalSteps: 4 },
  2: { number: 2, label: 'Audience', totalSteps: 4 },
  3: { number: 3, label: 'Goal', totalSteps: 4 },
  4: { number: 4, label: 'Style', totalSteps: 4 },
};

// ── Structured AI questions per step ──
export function getPresentationQuestion(step: number): AiStructuredContent {
  switch (step) {
    case 1:
      return {
        heading: "Who's this presentation for?",
        body: "Knowing your audience helps me pick the right tone and level of detail — a boardroom pitch reads very differently from a lunch-and-learn.",
        hasExample: true,
        exampleText: 'Series A investors evaluating whether to lead our round — sharp, numbers-literate, skeptical of hype.',
        fallbackHeading: 'Not sure yet?',
        fallbackBody: "No worries — I'll assume a general professional audience.",
        fallbackAction: 'Just use a general audience',
        progressHint: "Two more quick questions, then I'll put together your outline.",
      };
    case 2:
      return {
        heading: "What's the goal of this presentation?",
        body: 'Are you trying to persuade, inform, pitch, or train? The goal shapes the structure and how hard each slide should push.',
        hasExample: true,
        exampleText: 'Persuade the board to approve a 3-month budget increase for the design team.',
        fallbackHeading: 'Not sure yet?',
        fallbackBody: "That's fine — I'll default to a clear, informative structure.",
        fallbackAction: 'Keep it general',
      };
    case 3:
      return {
        heading: 'Any style or tone preferences?',
        body: 'Bold and visual, minimal and text-light, data-heavy — or should I just pick something that fits the topic?',
        hasExample: true,
        exampleText: 'Minimal and confident — mostly visuals, one idea per slide, no walls of text.',
        fallbackHeading: 'Not sure yet?',
        fallbackBody: "No problem — I'll choose a style that fits your topic and audience.",
        fallbackAction: "I'll leave it up to you",
      };
    default:
      return { body: '' };
  }
}

export const PRESENTATION_STEP_PLACEHOLDERS: Record<number, string> = {
  2: 'Tell me who this is for...',
  3: 'Share the goal of this presentation...',
  4: 'Any style or tone preferences...',
};

// ── Audience detection ──
// Common phrases people already name when describing what they want to present,
// e.g. "a pitch for our Series A investors" or "onboarding deck for new hires".
// Longest phrases first so multi-word matches win over their substrings
// (e.g. "sales team" over bare "team").
const AUDIENCE_KEYWORDS = [
  'board members', 'sales team', 'engineering team', 'marketing team', 'design team',
  'leadership team', 'executive team', 'c-suite', 'senior leadership',
  'series a investors', 'series b investors', 'venture capitalists', 'angel investors',
  'potential investors', 'prospective clients', 'prospective customers', 'new hires',
  'the public', 'general public',
  'investors', 'shareholders', 'stakeholders', 'board', 'executives', 'leadership',
  'management', 'customers', 'clients', 'prospects', 'users', 'employees', 'staff',
  'team', 'colleagues', 'students', 'classmates', 'donors', 'committee', 'panel',
  'judges', 'partners', 'vendors', 'suppliers', 'recruiters', 'hiring managers',
  'the board', 'founders', 'ceo', 'ceos',
];

/**
 * Pulls an audience mention out of free text, if the user already named one
 * (e.g. typed "Q3 roadmap for our sales team" as their initial prompt).
 * Returns the matched phrase, with a short leading qualifier like "our"/"the"
 * preserved for a more natural echo, or undefined if nothing matched.
 */
export function extractAudienceFromPrompt(prompt: string): string | undefined {
  const lower = prompt.toLowerCase();
  for (const keyword of AUDIENCE_KEYWORDS) {
    const idx = lower.indexOf(keyword);
    if (idx === -1) continue;
    const before = prompt.slice(Math.max(0, idx - 12), idx);
    const qualifierMatch = before.match(/\b(the|our|my|new|existing|potential|prospective)\s+$/i);
    const qualifier = qualifierMatch ? `${qualifierMatch[1]} ` : '';
    return `${qualifier}${prompt.substr(idx, keyword.length)}`.trim();
  }
  return undefined;
}

// ── Headline extraction ──
// Users often type a whole request ("I want to create a presentation on how to build a
// portfolio. It should be addressed to busy professionals...") rather than a title. Strip the
// conversational wrapper down to the actual subject and title-case it, instead of using the
// raw sentence (or worse, the whole multi-sentence prompt) as the deck's headline.
const REQUEST_LEAD_IN_RE = /^(i want to |i'd like to |i would like to |please |can you |could you |help me |i need to |i need |let's |lets )?(create|make|build|design|put together|generate|write)\s+(a |an |me a |me an )?(presentation|deck|slideshow|slides?|talk|pitch)\s+(on|about|for|covering|regarding)\s+/i;
const MID_SENTENCE_SUBJECT_RE = /\b(?:presentation|deck|slideshow|slides?|talk|pitch)\s+(?:on|about|for|covering|regarding)\s+(.+)/i;
const MINOR_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'of', 'in', 'with', 'into']);

function titleCase(s: string): string {
  return s.replace(/[A-Za-z][A-Za-z'-]*/g, (word, offset) => {
    const lower = word.toLowerCase();
    if (offset !== 0 && MINOR_WORDS.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}

/** Derives a short, presentable headline from a free-form prompt — takes just the first
 *  sentence, strips a "I want to make a presentation about..." wrapper if present, and
 *  title-cases the result, instead of showing the whole raw request as the deck's title. */
export function deriveTopicHeadline(prompt: string): string {
  const firstSentence = (prompt.split(/(?<=[.!?])\s+/)[0] || prompt).trim();
  let core = firstSentence.replace(REQUEST_LEAD_IN_RE, '').trim();
  if (core === firstSentence) {
    const midMatch = firstSentence.match(MID_SENTENCE_SUBJECT_RE);
    if (midMatch) core = midMatch[1].trim();
  }
  core = core.replace(/[.!?]+$/, '').trim() || firstSentence.replace(/[.!?]+$/, '').trim();

  const words = core.split(/\s+/);
  if (words.length > 12) core = `${words.slice(0, 12).join(' ')}…`;

  return titleCase(core) || 'Your presentation';
}

/** Builds the one-line subtitle shown under the outline title, from whatever
 *  audience/goal the user gave us (typed up front or answered in chat). */
export function buildPresentationSubtitle(opts: { audience?: string; goal?: string }): string {
  const audience = opts.audience?.trim();
  const goal = opts.goal?.trim().replace(/\.$/, '');
  if (audience && goal) return `Built to ${goal.toLowerCase()}, for ${audience}.`;
  if (audience) return `Generated for ${audience} — review and tweak before picking a theme.`;
  if (goal) return `Built to ${goal.toLowerCase()}.`;
  return 'Generated with AI — review and tweak before picking a theme.';
}
