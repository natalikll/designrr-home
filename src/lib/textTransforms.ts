/* Local, deterministic text transforms for the book editor's block actions.

   Why these exist at all: Rewrite / Fix spelling & grammar / Reduce / Expand /
   Adjust tone were all identity no-ops with a fake delay. Three of them don't
   need a model to do real work — tightening wordy phrasing, fixing mechanical
   punctuation and casing, and swapping register are rule-shaped problems. Two
   of them (Rewrite, Expand) genuinely are not: both mean generating new
   language, so they stay unavailable until a model is wired up rather than
   pretending with a shuffle.

   Everything here returns EDITS (offset ranges + replacement), never a whole
   rewritten string. That's the point: the caller maps those offsets onto
   ProseMirror positions and replaces only the spans that changed, so bold,
   italics, links and footnote markers inside the paragraph survive. Returning
   a new string would mean replacing the block wholesale, which flattens every
   inline mark in it — the single biggest risk in this feature. */

export type TextEdit = { from: number; to: number; insert: string };

export const TONES = ['Neutral', 'Friendly', 'Excited', 'Persuasive', 'Intellectual'] as const;
export type Tone = (typeof TONES)[number];

/* ── edit collection ──────────────────────────────────────────────────────── */

/* Rules are applied against the ORIGINAL string and collected, not chained, so
   every offset stays valid in one coordinate space. Overlaps are resolved
   first-rule-wins, which is why the rule arrays below are ordered
   most-specific-first (a multi-word phrase before the filler word inside it). */
function collect(text: string, rules: ((t: string, push: (e: TextEdit) => void) => void)[]): TextEdit[] {
  const edits: TextEdit[] = [];
  for (const rule of rules) rule(text, (e) => { if (e.insert !== text.slice(e.from, e.to)) edits.push(e); });
  edits.sort((a, b) => a.from - b.from || a.to - b.to);
  const out: TextEdit[] = [];
  let cursor = -1;
  for (const e of edits) {
    if (e.from < cursor) continue; // overlaps an edit already taken
    out.push(e);
    cursor = e.to;
  }
  return out;
}

/** Applies edits to a plain string. Used by tests and by the caller's preview. */
export function applyEdits(text: string, edits: TextEdit[]): string {
  let out = '';
  let last = 0;
  for (const e of edits) { out += text.slice(last, e.from) + e.insert; last = e.to; }
  return out + text.slice(last);
}

/* Matches `pattern` and offers each hit to `replacer`. Returning null skips it.
   A replacer may return a full TextEdit instead of a string when it needs to
   widen its own range — deletions do, to swallow the space they'd otherwise
   strand (see phraseRule). */
function scan(text: string, pattern: RegExp, replacer: (m: RegExpExecArray) => string | TextEdit | null, push: (e: TextEdit) => void) {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') { re.lastIndex++; continue; }
    const insert = replacer(m);
    if (insert === null) continue;
    if (typeof insert === 'string') push({ from: m.index, to: m.index + m[0].length, insert });
    else push(insert);
  }
}

/** Keeps the casing of the word being replaced: "Do not" -> "Don't". */
function matchCase(source: string, replacement: string): string {
  if (!source || !replacement) return replacement;
  if (source[0] === source[0].toUpperCase() && source[0] !== source[0].toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** True when the offset begins a sentence — used to avoid deleting a word that
    would leave the next one lowercase, or capitalising mid-sentence. */
function startsSentence(text: string, at: number): boolean {
  const before = text.slice(0, at).replace(/\s+$/, '');
  return before === '' || /[.!?:]$/.test(before);
}

function phraseRule(map: Record<string, string>) {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`\\b(${keys.map(escapeRe).join('|')})\\b`, 'gi');
  return (text: string, push: (e: TextEdit) => void) =>
    scan(text, pattern, (m) => {
      const hit = map[m[1].toLowerCase()];
      if (hit === undefined) return null;
      if (hit !== '') return matchCase(m[1], hit);
      /* Deleting a phrase outright is the case that goes wrong quietly: drop
         "It is important to note that" and you're left with a double space and
         a lowercase word where a sentence now starts. So a deletion eats its
         own trailing whitespace, and re-capitalises whatever follows when it
         was sitting at the head of a sentence. */
      let to = m.index + m[0].length;
      while (to < text.length && /[ \t]/.test(text[to])) to++;
      if (startsSentence(text, m.index) && to < text.length && /[a-z]/.test(text[to])) {
        return { from: m.index, to: to + 1, insert: text[to].toUpperCase() };
      }
      // Nothing follows on this line — take the space in front instead.
      let from = m.index;
      if (to >= text.length || /[.!?,;:]/.test(text[to])) {
        while (from > 0 && /[ \t]/.test(text[from - 1])) from--;
      }
      return { from, to, insert: '' };
    }, push);
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* ── fix spelling & grammar ───────────────────────────────────────────────── */

/* Deliberately mechanical: spacing, casing, doubled words, and a short list of
   misspellings common enough to be safe. Real spell-checking needs a dictionary
   and real grammar needs a parser — neither is claimed here, and nothing in this
   set changes a word the author actually chose. */
const COMMON_MISSPELLINGS: Record<string, string> = {
  teh: 'the', adn: 'and', recieve: 'receive', recieved: 'received', seperate: 'separate',
  seperately: 'separately', definately: 'definitely', occured: 'occurred', occuring: 'occurring',
  accomodate: 'accommodate', neccessary: 'necessary', necesary: 'necessary', begining: 'beginning',
  beleive: 'believe', acheive: 'achieve', acheived: 'achieved', wich: 'which', thier: 'their',
  truely: 'truly', untill: 'until', wierd: 'weird', arguement: 'argument', enviroment: 'environment',
  existance: 'existence', maintainance: 'maintenance', persistant: 'persistent', priviledge: 'privilege',
  publically: 'publicly', reccomend: 'recommend', refered: 'referred', succesful: 'successful',
  sucessful: 'successful', tommorow: 'tomorrow', wheter: 'whether', writting: 'writing',
  alot: 'a lot', cant: "can't", dont: "don't", wont: "won't", isnt: "isn't", didnt: "didn't",
  doesnt: "doesn't", wasnt: "wasn't", couldnt: "couldn't", shouldnt: "shouldn't", wouldnt: "wouldn't",
  its: 'its', // placeholder — its/it's needs grammar, see note below
};
delete COMMON_MISSPELLINGS.its; // its/it's is a real grammar call, not a spelling one. Left to a model.

/* "had had" and "that that" are both legitimate English, so the doubled-word
   rule has to skip them rather than silently corrupting a correct sentence. */
const LEGITIMATE_DOUBLES = new Set(['had', 'that']);

export function fixSpellingGrammar(text: string): TextEdit[] {
  return collect(text, [
    /* Spacing around a comma is ONE rule, not two. As two ("strip the space
       before" + "add the space after") they overlap on the comma itself, the
       overlap filter keeps whichever ran first, and " ,and" half-fixes to
       ",and" — worse than it started. */
    (t, push) => scan(t, /[ \t]*([,;:])[ \t]*(?=[A-Za-z])/, (m) => m[1] + ' ', push),
    // multiple spaces -> one
    (t, push) => scan(t, /[ \t]{2,}/, () => ' ', push),
    // space before terminal punctuation
    (t, push) => scan(t, /[ \t]+([.!?])/, (m) => m[1], push),
    /* Missing space after a full stop, capitalising as it goes — the general
       sentence-capitalisation rule below can't catch these, because it looks
       for whitespace that isn't there yet (every rule reads the ORIGINAL
       string). Two letters before the stop keeps "e.g." and decimals out. */
    (t, push) => scan(t, /([a-z]{2})\.([a-zA-Z])/, (m) => `${m[1]}. ${m[2].toUpperCase()}`, push),
    // doubled word
    (t, push) => scan(t, /\b(\w+)([ \t]+)\1\b/i, (m) =>
      LEGITIMATE_DOUBLES.has(m[1].toLowerCase()) ? null : m[1], push),
    // common misspellings
    phraseRule(COMMON_MISSPELLINGS),
    // lone lowercase "i"
    (t, push) => scan(t, /\bi\b/, () => 'I', push),
    // capitalise after a sentence ends
    (t, push) => scan(t, /([.!?]["')\]]?\s+)([a-z])/, (m) => m[1] + m[2].toUpperCase(), push),
    // capitalise the very first letter
    (t, push) => scan(t, /^(\s*)([a-z])/, (m) => m[1] + m[2].toUpperCase(), push),
    // runs of terminal punctuation
    (t, push) => scan(t, /([!?.])\1{1,}/, (m) => m[1], push),
  ]);
}

/* ── reduce ───────────────────────────────────────────────────────────────── */

/* Wordiness, not content. Every entry means the same thing in fewer words, so
   the paragraph shortens without the author losing a point they made. Sentence
   deletion is deliberately NOT here — picking which sentence matters least is
   exactly the judgement a rule set can't make. */
const WORDY_PHRASES: Record<string, string> = {
  'in order to': 'to', 'due to the fact that': 'because', 'owing to the fact that': 'because',
  'in spite of the fact that': 'although', 'despite the fact that': 'although',
  'at this point in time': 'now', 'at the present time': 'now', 'at this moment in time': 'now',
  'in the event that': 'if', 'in the near future': 'soon', 'for the purpose of': 'to',
  'with regard to': 'about', 'with respect to': 'about', 'in relation to': 'about',
  'a large number of': 'many', 'a great number of': 'many', 'a number of': 'several',
  'the majority of': 'most', 'the vast majority of': 'most',
  /* "the majority of people" -> "most people", but "the majority of them" ->
     "most OF them". The pronoun cases need their own entries; phraseRule sorts
     longest-first, so these win over the bare quantifier above. */
  'the majority of them': 'most of them', 'the majority of us': 'most of us',
  'the majority of you': 'most of you', 'the majority of it': 'most of it',
  'the vast majority of them': 'most of them', 'a number of them': 'several of them',
  'a large number of them': 'many of them',
  'has the ability to': 'can', 'have the ability to': 'can', 'is able to': 'can', 'are able to': 'can',
  'make a decision': 'decide', 'made a decision': 'decided', 'take into consideration': 'consider',
  'conduct an investigation': 'investigate', 'give consideration to': 'consider',
  'prior to': 'before', 'subsequent to': 'after', 'in advance of': 'before',
  'in a timely manner': 'promptly', 'on a regular basis': 'regularly', 'in the majority of cases': 'usually',
  'it is important to note that': '', 'it should be noted that': '', 'needless to say': '',
  'as a matter of fact': '', 'for all intents and purposes': '',
  'each and every': 'every', 'first and foremost': 'first', 'end result': 'result',
  'past history': 'history', 'future plans': 'plans', 'basic fundamentals': 'fundamentals',
  'completely eliminate': 'eliminate', 'absolutely essential': 'essential',
  'in the process of': '', 'the reason why is that': 'because', 'the reason is because': 'because',
};

const FILLER_WORDS = [
  'very', 'really', 'actually', 'basically', 'simply', 'just', 'quite', 'rather',
  'somewhat', 'literally', 'essentially', 'truly', 'totally', 'utterly', 'extremely',
  'incredibly', 'fairly', 'pretty much', 'sort of', 'kind of', 'a bit', 'in fact',
];

export function reduce(text: string): TextEdit[] {
  const fillerPattern = new RegExp(`\\b(${FILLER_WORDS.map(escapeRe).join('|')})\\b[ \\t]+`, 'gi');
  return collect(text, [
    phraseRule(WORDY_PHRASES),
    /* Filler is dropped with its trailing space. Skipped when it opens a
       sentence, because deleting it there strands the next word lowercase —
       a correctness bug dressed up as concision. */
    (t, push) => scan(t, fillerPattern, (m) => (startsSentence(t, m.index) ? null : ''), push),
    // "that" as an optional relative pronoun after a reporting verb
    (t, push) => scan(t, /\b(said|says|thought|knew|believed|felt|noticed|realised|realized)[ \t]+that[ \t]+/i,
      (m) => `${m[1]} `, push),
  ]);
}

/* ── tone ─────────────────────────────────────────────────────────────────── */

const CONTRACTIONS: Record<string, string> = {
  'do not': "don't", 'does not': "doesn't", 'did not': "didn't", 'is not': "isn't",
  'are not': "aren't", 'was not': "wasn't", 'were not': "weren't", 'have not': "haven't",
  'has not': "hasn't", 'had not': "hadn't", 'cannot': "can't", 'can not': "can't",
  'will not': "won't", 'would not': "wouldn't", 'should not': "shouldn't", 'could not': "couldn't",
  'it is': "it's", 'that is': "that's", 'there is': "there's", 'they are': "they're",
  'you are': "you're", 'we are': "we're", 'i am': "I'm", 'you will': "you'll", 'we will': "we'll",
  'you have': "you've", 'we have': "we've", 'let us': "let's",
};
const EXPANSIONS: Record<string, string> = Object.fromEntries(
  Object.entries(CONTRACTIONS).map(([long, short]) => [short, long]).filter(([s]) => s !== "can't"),
);
EXPANSIONS["can't"] = 'cannot';

const CASUAL: Record<string, string> = {
  utilize: 'use', utilise: 'use', purchase: 'buy', commence: 'start', terminate: 'end',
  assist: 'help', require: 'need', obtain: 'get', demonstrate: 'show', numerous: 'many',
  sufficient: 'enough', approximately: 'about', however: 'but', therefore: 'so',
  furthermore: 'plus', additionally: 'also', nevertheless: 'still', subsequently: 'then',
  endeavour: 'try', endeavor: 'try', ascertain: 'find out', inquire: 'ask',
};
/* Note the asymmetry with CASUAL above, which is not an oversight.
   Formal -> casual is safe because the formal word is unambiguous: "obtain",
   "demonstrate" and "ascertain" are only ever verbs, so swapping them for
   "get"/"show"/"find out" can't pick the wrong part of speech.
   Casual -> formal is NOT safe, because the casual word usually isn't
   unambiguous. "help" is a noun in "a lot of help" and a verb in "we help
   them"; a flat swap turns the first into "a lot of facilitate". So the verb
   swaps are deliberately absent here — connectives, quantifiers and adjectives
   only. Intellectual therefore changes less than Friendly does, which is the
   right trade: a smaller correct edit beats a larger broken one. Real verb
   handling needs a parser, or a model. */
const FORMAL: Record<string, string> = {
  but: 'however', so: 'therefore', also: 'moreover', plus: 'moreover',
  'a lot of': 'considerable', 'lots of': 'numerous', 'a bunch of': 'numerous',
  big: 'substantial', huge: 'considerable', tiny: 'negligible',
  'find out': 'determine', 'a lot': 'considerably', 'pretty': 'rather',
  'kids': 'children', 'stuff': 'material', 'things': 'elements',
};
const EXCITED: Record<string, string> = {
  good: 'fantastic', great: 'incredible', nice: 'wonderful', interesting: 'fascinating',
  important: 'crucial', useful: 'invaluable', like: 'love', liked: 'loved', big: 'enormous',
  surprising: 'astonishing', difficult: 'wildly challenging',
};
const PERSUASIVE: Record<string, string> = {
  'you might want to': 'you should', 'you may want to': 'you should', 'you could': 'you can',
  'it is possible to': 'you can', 'one can': 'you can', 'people can': 'you can',
  'we believe that': '', 'we believe': '', 'in our opinion': '', 'it seems that': '',
  'it seems': '', 'arguably': '', 'perhaps': '', 'maybe': '', 'possibly': '',
  good: 'proven', helps: 'delivers', useful: 'essential',
};
const HEDGES: Record<string, string> = {
  'i think': '', 'i believe': '', 'we think': '', 'we believe': '', 'we feel': '',
  'in my opinion': '', 'in our opinion': '', 'it seems': '', arguably: '',
  perhaps: '', maybe: '', possibly: '', 'sort of': '', 'kind of': '', 'more or less': '',
};

export function adjustTone(text: string, tone: Tone): TextEdit[] {
  switch (tone) {
    case 'Friendly':
      return collect(text, [phraseRule(CASUAL), phraseRule(CONTRACTIONS)]);
    case 'Intellectual':
      return collect(text, [phraseRule(EXPANSIONS), phraseRule(FORMAL)]);
    case 'Excited':
      return collect(text, [
        phraseRule(EXCITED),
        phraseRule(CONTRACTIONS),
        /* One exclamation mark, on the last sentence only — turning every full
           stop into "!" reads as shouting rather than enthusiasm. */
        (t, push) => scan(t, /\.(\s*)$/, (m) => '!' + m[1], push),
      ]);
    case 'Persuasive':
      return collect(text, [phraseRule(PERSUASIVE), phraseRule(HEDGES)]);
    case 'Neutral':
    default:
      return collect(text, [
        phraseRule(HEDGES),
        phraseRule(EXPANSIONS),
        // intensifiers carry attitude, which is what Neutral is removing
        (t, push) => scan(t, /\b(incredibly|amazingly|wildly|hugely|terribly|absolutely)\b[ \t]+/i,
          (m) => (startsSentence(t, m.index) ? null : ''), push),
        (t, push) => scan(t, /!+/, () => '.', push),
      ]);
  }
}

/* ── dispatch ─────────────────────────────────────────────────────────────── */

/* `null` means "this action cannot be done locally" — Rewrite and Expand both
   mean producing language that isn't in the paragraph already. The caller shows
   an explicit unavailable state for those rather than reporting a success that
   changed nothing, which is what the old canned no-op did. */
export function editsFor(action: string, text: string): TextEdit[] | null {
  if (action === 'Fix spelling & grammar') return fixSpellingGrammar(text);
  if (action === 'Reduce') return reduce(text);
  if ((TONES as readonly string[]).includes(action)) return adjustTone(text, action as Tone);
  return null;
}
