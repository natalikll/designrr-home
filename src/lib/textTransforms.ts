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
  /* Added because the original set only caught bureaucratic padding, which
     almost never appears in a book — so Reduce reported "nothing to change" on
     ordinary prose and read as broken. These are the ones that actually turn
     up in writing people do for pleasure. */
  'as a result of': 'because of', 'in the case of': 'for', 'by means of': 'by',
  'on the grounds that': 'because', 'until such time as': 'until',
  'in the absence of': 'without', 'with the exception of': 'except',
  'a sufficient amount of': 'enough', 'during the course of': 'during',
  'throughout the course of': 'throughout', 'in the vicinity of': 'near',
  'in close proximity to': 'near', 'in excess of': 'over', 'at an early date': 'soon',
  'in connection with': 'about', 'in terms of': 'for', 'in light of the fact that': 'because',
  'for the simple reason that': 'because', 'in the final analysis': 'finally',
  'when all is said and done': 'finally', 'at the end of the day': 'ultimately',
  'the question as to whether': 'whether', 'there is no doubt that': 'undoubtedly',
  'in a situation where': 'when', 'in any way, shape or form': 'at all',
  'full and complete': 'complete', 'various different': 'various',
  'close proximity': 'proximity', 'free gift': 'gift', 'added bonus': 'bonus',
  'unexpected surprise': 'surprise', 'personally believe': 'believe',
  'join together': 'join', 'merge together': 'merge', 'combine together': 'combine',
  'plan ahead': 'plan', 'revert back': 'revert', 'return back': 'return',
  'repeat again': 'repeat', 'brief summary': 'summary', 'final outcome': 'outcome',
  'advance warning': 'warning', 'general consensus': 'consensus',
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
    /* Both of these belong to Rewrite as much as to Reduce — a buried verb and
       an empty "there is" are weaker AND longer. Shared rather than forked, so
       the two actions can't drift into disagreeing about the same sentence. */
    phraseRule(NOMINALISATIONS),
    expletiveThere,
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
/* but / so / also / plus are NOT in this map, though they look like they
   belong. Each is a connective in one position and something else entirely in
   another: "a client list so varied that..." is an intensifier, "nothing but
   trouble" is a preposition, and swapping either for its formal connective
   produces "therefore varied" and "nothing however trouble". They're handled by
   formalConnectives() below, which checks where the word is sitting first. */
const FORMAL: Record<string, string> = {
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

/* A casual connective only becomes a formal one where it is actually joining
   two clauses: at the start of a sentence, or after a comma or dash, and
   followed by something that can begin a clause. Anywhere else the same word is
   doing a different job and has to be left alone. */
const FORMAL_CONNECTIVES: Record<string, string> = {
  but: 'however', so: 'therefore', also: 'moreover', plus: 'moreover', and: 'and',
};
const CLAUSE_OPENER = /^(I|we|you|he|she|they|it|the|a|an|this|that|these|those|my|our|your|his|her|their|its|there|if|when|after|before|most|many|some|few|no|one|two|three)$/i;

function formalConnectives(text: string, push: (e: TextEdit) => void) {
  scan(text, /(^|[.!?]\s+|,\s+|\s—\s)(but|so|also|plus)\s+([\w'’-]+)/gi, (m) => {
    const [, lead, word, next] = m;
    const formal = FORMAL_CONNECTIVES[word.toLowerCase()];
    if (!formal || formal === word) return null;
    if (!CLAUSE_OPENER.test(next)) return null;
    return `${lead}${matchCase(word, formal)} ${next}`;
  }, push);
}

export function adjustTone(text: string, tone: Tone): TextEdit[] {
  switch (tone) {
    case 'Friendly':
      return collect(text, [phraseRule(CASUAL), phraseRule(CONTRACTIONS)]);
    case 'Intellectual':
      return collect(text, [phraseRule(EXPANSIONS), formalConnectives, phraseRule(FORMAL)]);
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

/* ── rewrite ──────────────────────────────────────────────────────────────── */

/* Structure, not vocabulary. This is the one kind of rewriting that doesn't mean
   inventing sentences the author never wrote: every rule here says the same
   thing with the same material in a stronger arrangement. The agent of a
   passive sentence moves back to the front of it; a verb hiding inside a noun
   comes back out as a verb; an empty "there is" opening is dropped so the real
   subject can start the sentence; and a phrase propped up by an intensifier
   becomes the single word it was reaching for.
   What it still can't do is have an idea. That needs a model, and it's the one
   claim this file doesn't make. */

/* Past participles whose past tense is a different word, for the passive flip.
   Regular verbs need no entry — "was published by Faber" -> "Faber published",
   because -ed is already the past tense. The identity entries ("made": "made")
   earn their place by doubling as the test for "is this a participle at all",
   which -ed can't answer for irregulars. */
const IRREGULAR_PAST: Record<string, string> = {
  written: 'wrote', made: 'made', given: 'gave', taken: 'took', seen: 'saw', known: 'knew',
  built: 'built', held: 'held', told: 'told', sold: 'sold', kept: 'kept', found: 'found',
  chosen: 'chose', shown: 'showed', driven: 'drove', drawn: 'drew', thrown: 'threw',
  brought: 'brought', bought: 'bought', taught: 'taught', caught: 'caught', sent: 'sent',
  spent: 'spent', left: 'left', lost: 'lost', paid: 'paid', run: 'ran', done: 'did',
  begun: 'began', broken: 'broke', forgotten: 'forgot', hidden: 'hid', worn: 'wore',
  won: 'won', led: 'led', met: 'met', understood: 'understood', heard: 'heard',
  said: 'said', read: 'read', set: 'set', put: 'put', cut: 'cut', eaten: 'ate',
};

/* An object pronoun has to become a subject pronoun when a passive flips round:
   "was written by her" -> "SHE wrote", never "her wrote". */
const SUBJECT_PRONOUN: Record<string, string> = {
  me: 'I', him: 'he', her: 'she', them: 'they', us: 'we', you: 'you', it: 'it',
};

const DETERMINER = /^(the|a|an|his|her|their|my|our|your|this|that|these|those)\b/i;

/* A verb buried in a noun, with the empty verb propping it up. Shared with
   Reduce, which wants the same list for a different reason: these are shorter
   as well as more direct. */
const NOMINALISATIONS: Record<string, string> = {
  'make a decision': 'decide', 'makes a decision': 'decides', 'made a decision': 'decided',
  'reach a decision': 'decide', 'reached a decision': 'decided',
  'make an assumption': 'assume', 'made an assumption': 'assumed',
  /* Only the "that" form. "Reached a conclusion about the data" has no verb
     rewrite that keeps the meaning — "concluded the data" says something else
     entirely — so the bare noun is deliberately left alone. */
  'reach a conclusion that': 'conclude that', 'reached a conclusion that': 'concluded that',
  'give an explanation': 'explain', 'gave an explanation': 'explained',
  'provide assistance': 'help', 'provides assistance': 'helps', 'provided assistance': 'helped',
  'conduct a review': 'review', 'conducted a review': 'reviewed',
  'perform an analysis': 'analyse', 'performed an analysis': 'analysed',
  'carry out an investigation': 'investigate', 'carried out an investigation': 'investigated',
  /* The verb these nouns are hiding governs its own preposition, and the noun
     form's doesn't survive the swap: "hold a discussion ABOUT x" has to become
     "discuss x", never "discuss about x". Each entry that can be followed by a
     preposition needs that preposition inside the key, and phraseRule sorts
     longest-first so these win over the bare form above. */
  'hold a discussion about': 'discuss', 'hold a discussion of': 'discuss',
  'held a discussion about': 'discussed', 'had a discussion about': 'discussed',
  'have a discussion about': 'discuss',
  'give an explanation of': 'explain', 'give an explanation for': 'explain',
  'gave an explanation of': 'explained', 'gave an explanation for': 'explained',
  'provide assistance to': 'help', 'provided assistance to': 'helped',
  'conduct a review of': 'review', 'conducted a review of': 'reviewed',
  'perform an analysis of': 'analyse', 'performed an analysis of': 'analysed',
  'carry out an investigation into': 'investigate', 'carry out an investigation of': 'investigate',
  'carried out an investigation into': 'investigated',
  'offer a suggestion that': 'suggest that', 'make a suggestion that': 'suggest that',
  'take action': 'act', 'took action': 'acted',
  'have an effect on': 'affect', 'has an effect on': 'affects', 'had an effect on': 'affected',
  'has a tendency to': 'tends to', 'have a tendency to': 'tend to',
  'is indicative of': 'indicates', 'are indicative of': 'indicate',
  'give consideration to': 'consider', 'put an end to': 'end',
  'make a contribution to': 'contribute to', 'make reference to': 'refer to',
  'offer a suggestion': 'suggest', 'hold a discussion': 'discuss',
  'take a look at': 'examine', 'make an improvement to': 'improve',
  'come to an agreement': 'agree', 'came to an agreement': 'agreed',
  'came to the realisation': 'realised', 'came to the realization': 'realized',
  'is of the opinion that': 'believes', 'are of the opinion that': 'believe',
  'the fact that': 'that',
};

/* "very big" -> "huge". The intensifier isn't adding anything the stronger word
   doesn't already carry, which is why this reads as a rewrite rather than a
   deletion: one word replaces two, and it's a word the author didn't have. */
const INTENSIFIED: Record<string, string> = {
  'very big': 'huge', 'very large': 'enormous', 'very small': 'tiny', 'very little': 'tiny',
  'very good': 'excellent', 'very bad': 'terrible', 'very old': 'ancient', 'very new': 'brand new',
  'very happy': 'delighted', 'very sad': 'miserable', 'very angry': 'furious',
  'very tired': 'exhausted', 'very hungry': 'starving', 'very cold': 'freezing',
  'very hot': 'scorching', 'very fast': 'rapid', 'very slow': 'sluggish',
  'very difficult': 'gruelling', 'very easy': 'effortless', 'very important': 'vital',
  'very quiet': 'silent', 'very loud': 'deafening', 'very clean': 'spotless',
  'very dirty': 'filthy', 'very scared': 'terrified', 'very pretty': 'beautiful',
  'very interesting': 'fascinating', 'very sure': 'certain', 'very strong': 'powerful',
  'really big': 'huge', 'really small': 'tiny', 'really good': 'excellent',
  'really bad': 'terrible', 'really important': 'vital', 'really tired': 'exhausted',
  'extremely tired': 'exhausted', 'extremely large': 'enormous', 'extremely important': 'vital',
};

/* An adverb doing a verb's job. Same move as the intensifiers above, one rung
   up: the pair collapses into the verb English already has for it. */
const ADVERBIAL_VERBS: Record<string, string> = {
  'walked quickly': 'hurried', 'walked slowly': 'ambled', 'ran quickly': 'sprinted',
  'said quietly': 'whispered', 'said loudly': 'shouted', 'said angrily': 'snapped',
  'spoke quietly': 'murmured', 'looked carefully': 'studied', 'looked quickly': 'glanced',
  'laughed quietly': 'chuckled', 'cried loudly': 'wailed', 'ate quickly': 'devoured',
  'moved slowly': 'crawled', 'held tightly': 'gripped', 'pushed hard': 'shoved',
  'thought carefully about': 'weighed', 'looked closely at': 'examined',
};

/* "The cover was designed by Mira" -> "Mira designed the cover".
   Anchored at a clause boundary, so the subject can't reach back into the
   previous clause and swallow its tail, and limited to a passive with a named
   agent: one without a "by" has nobody to promote, and supplying one would be
   inventing. */
function passiveToActive(text: string, push: (e: TextEdit) => void) {
  const re = /(^|[.!?;:]\s+|,\s+(?:and|but|so|yet)\s+)([A-Za-z][\w'’-]*(?:\s+[\w'’-]+){0,3})\s+(?:was|were|is|are)\s+([a-z]+)\s+by\s+((?:the|a|an|his|her|their|my|our|your)\s+)?([A-Za-z][\w'’-]*(?:\s+[\w'’-]+){0,1})(?=[\s,.;:!?]|$)/g;
  scan(text, re, (m) => {
    const [, lead, subject, participle, det, agentWord] = m;
    const verb = IRREGULAR_PAST[participle.toLowerCase()] ?? (/ed$/.test(participle) ? participle : null);
    if (!verb) return null;
    /* The passive has to be the clause's MAIN verb. When the subject capture
       ends on a relative pronoun or a preposition, the "was ... by" belongs to
       a clause inside the subject, not to the sentence — flipping it there
       ("The chapter that was written by her is best" -> "Her is the wrote the
       chapter that best") tears the sentence apart. reduceRelativeClause
       handles that shape correctly instead. */
    if (/\b(that|which|who|whom|and|or|but|of|in|on|at|with|by|for|to|from)$/i.test(subject)) return null;
    const pronoun = SUBJECT_PRONOUN[agentWord.toLowerCase()];
    /* A bare pronoun has to swap case ("her" -> "she"); a pronoun carrying a
       determiner ("her editor") is a noun phrase and stays as written. */
    const agent = pronoun && !det ? pronoun : `${det ?? ''}${agentWord}`.trim();
    const atSentenceStart = lead === '' || /[.!?]/.test(lead);
    /* The old subject becomes the object, so it drops the capital it only had
       for sitting first — unless it never had a determiner, in which case it's
       a name and keeps it. */
    const object = DETERMINER.test(subject) ? subject[0].toLowerCase() + subject.slice(1) : subject;
    const promoted = atSentenceStart ? agent[0].toUpperCase() + agent.slice(1) : agent;
    return `${lead}${promoted} ${verb} ${object}`;
  }, push);
}

/* "There are three chapters that cover this" -> "Three chapters cover this".
   The relative clause's verb already agrees with the noun it belongs to, so it
   survives the move untouched — which is what makes this safe to do with a rule
   at all. */
function expletiveThere(text: string, push: (e: TextEdit) => void) {
  const re = /(^|[.!?;:]\s+|,\s+(?:and|but|so)\s+)there\s+(?:is|are|was|were)\s+((?:[\w'’-]+\s+){0,3}[\w'’-]+)\s+(?:that|who|which)\s+([\w'’-]+)/gi;
  scan(text, re, (m) => {
    const [, lead, phrase, next] = m;
    /* "There is a reason that I stopped" is not the same shape: that "that"
       introduces a clause with its own subject, and dropping the "there is"
       leaves a fragment ("A reason I stopped"). A subject word following the
       relative pronoun is the tell, so those are left alone. */
    if (/^(i|we|you|he|she|they|it|the|a|an|this|that|these|those|my|our|your|his|her|their|its|there|people|someone|everyone|nobody)$/i.test(next)) return null;
    const atSentenceStart = lead === '' || /[.!?]/.test(lead);
    const np = atSentenceStart ? phrase[0].toUpperCase() + phrase.slice(1) : phrase;
    return `${lead}${np} ${next}`;
  }, push);
}

/* "the people who are waiting" -> "the people waiting", and "a page that had
   forty items" -> "a page with forty items". A relative pronoun propped up by a
   bare auxiliary is carrying no meaning, and English lets you drop it — which
   makes this the rewrite that actually fires on narrative prose, where the
   passives and buried verbs the other rules hunt for simply don't appear.
   Both rules are tightly fenced, because the same words in a slightly different
   shape are load-bearing. */
function reduceRelativeClause(text: string, push: (e: TextEdit) => void) {
  /* -ing only. "-ed" would match the participle adjectives too, and "a list
     that is varied" -> "a list varied" is not English. */
  scan(text, /\b(?:that|which|who)\s+(?:is|are|was|were)\s+(?=[a-z]+ing\b)/g, () => '', push);
  /* "that was written BY x" keeps its agent, so the participle still has
     somewhere to lean — unlike the bare "-ed" case above. The participle is
     matched and then checked rather than pattern-matched on "-ed", because the
     irregular ones ("written", "taken", "built") have no suffix in common and
     a suffix test silently skips exactly the verbs this is for. */
  scan(text, /\b(?:that|which|who)\s+(?:was|were)\s+([a-z]+)(\s+by\b)/g, (m) =>
    (m[1].toLowerCase() in IRREGULAR_PAST || /ed$/.test(m[1]) ? `${m[1]}${m[2]}` : null), push);
  /* Possessive "have" only: "that had been", "that has to" and "that had no"
     are all different sentences, and "with been made" is the kind of wreckage
     a rule like this leaves when it isn't fenced. */
  scan(text, /\b(?:that|which)\s+(?:had|has|have)\s+(?!been\b|to\b|not\b|no\b|never\b|already\b|just\b)(?=[\da-z])/g, () => 'with ', push);
}

export function rewrite(text: string): TextEdit[] {
  return collect(text, [
    passiveToActive,
    expletiveThere,
    reduceRelativeClause,
    phraseRule(ADVERBIAL_VERBS),
    phraseRule(NOMINALISATIONS),
    phraseRule(INTENSIFIED),
  ]);
}

/* ── expand ───────────────────────────────────────────────────────────────── */

/* Expand means written out in full, not padded out with invented material.
   Everything compressed in the paragraph gets its full form back: contractions,
   abbreviations, symbols, small numerals, and the "that" a reporting verb is
   allowed to drop. The paragraph gets longer and more formal, and every added
   word was already implied by one the author wrote.
   It deliberately does NOT add sentences. A rule can't know what the next
   sentence should say, and guessing would put words in the author's mouth —
   the one thing a writing tool must never do quietly. */

const ABBREVIATIONS: [RegExp, string][] = [
  [/\be\.?g\.(?=\s|$)/gi, 'for example'],
  [/\bi\.?e\.(?=\s|$)/gi, 'that is'],
  [/\betc\.?(?=\s|[,.;:!?]|$)/gi, 'and so on'],
  [/\bvs\.?(?=\s|$)/gi, 'versus'],
  [/\bapprox\.(?=\s|$)/gi, 'approximately'],
  [/\bincl\.(?=\s|$)/gi, 'including'],
  [/\besp\.(?=\s|$)/gi, 'especially'],
  [/\bmax\.(?=\s|$)/gi, 'maximum'],
  [/\bmin\.(?=\s|$)/gi, 'minimum'],
  [/\baka\b/gi, 'also known as'],
  [/\basap\b/gi, 'as soon as possible'],
  [/\bw\/o(?=\s|$)/gi, 'without'],
  [/\bw\/(?=\s)/gi, 'with'],
];

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen', 'twenty',
];

/* The participles that tell "'d" apart. "I'd been waiting" is "I had been",
   "I'd wait" is "I would wait" — same two letters, two different verbs, and
   picking the wrong one changes the tense of the sentence. */
const HAD_PARTICIPLES = /^(been|had|got|gotten|seen|done|made|taken|gone|felt|known|left|told|thought|found|written|said|heard|become|begun|forgotten|lost|meant|kept|spent|put|read|run|come)$/i;

/* Reporting verbs that are allowed to drop their "that" — restoring it is the
   expansion. Only before a word that actually opens a clause, or "said yes"
   becomes "said that yes". */
const REPORTING_VERBS = /\b(said|says|thought|thinks|knew|knows|believed|believes|felt|feels|noticed|notices|realised|realized|argued|argues|assumed|assumes|decided|decides|agreed|agrees)\s+(?!that\b)(I|we|you|he|she|they|it|the|this|there|my|our|your|his|her|their)\b/g;

export function expand(text: string): TextEdit[] {
  return collect(text, [
    // Explicit forms first: they beat the generic clitic rules below on a tie.
    phraseRule(EXPANSIONS),
    (t, push) => {
      for (const [re, full] of ABBREVIATIONS) scan(t, re, (m) => matchCase(m[0], full), push);
    },
    (t, push) => scan(t, /(\d)\s*%/g, (m) => `${m[1]} percent`, push),
    (t, push) => scan(t, /(\s)&(\s)/g, (m) => `${m[1]}and${m[2]}`, push),
    /* n't / 'll / 're / 've / 'd, including the curly apostrophe the editor's
       own smart-typography inserts — without it this rule silently stops
       working on anything actually typed into the book. */
    (t, push) => scan(t, /\b(\w+)n['’]t\b/g, (m) => {
      const stem = m[1].toLowerCase();
      if (stem === 'ca') return matchCase(m[0], 'cannot');
      if (stem === 'wo') return matchCase(m[0], 'will not');
      if (stem === 'sha') return matchCase(m[0], 'shall not');
      return `${m[1]} not`;
    }, push),
    (t, push) => scan(t, /\b(\w+)['’]ll\b/g, (m) => `${m[1]} will`, push),
    (t, push) => scan(t, /\b(\w+)['’]re\b/g, (m) => `${m[1]} are`, push),
    (t, push) => scan(t, /\b(\w+)['’]ve\b/g, (m) => `${m[1]} have`, push),
    (t, push) => scan(t, /\b(\w+)['’]d\b(\s+)(\w+)/g, (m) =>
      `${m[1]} ${HAD_PARTICIPLES.test(m[3]) ? 'had' : 'would'}${m[2]}${m[3]}`, push),
    (t, push) => scan(t, REPORTING_VERBS, (m) => `${m[1]} that ${m[2]}`, push),
    /* Small numerals only. Four digits are years and two-digit-plus figures are
       usually data, and spelling either out makes the sentence worse. */
    (t, push) => scan(t, /(^|[^\w.,$£€-])(\d{1,2})(?![\w.,%])/g, (m) => {
      const n = Number(m[2]);
      return n <= 20 ? `${m[1]}${NUMBER_WORDS[n]}` : null;
    }, push),
  ]);
}

/* ── dispatch ─────────────────────────────────────────────────────────────── */

/* Every action in the menu now returns real edits. Rewrite and Expand used to
   return `null` for "can't be done locally", and the caller had a whole notice
   state built for it — but a row that can never succeed shouldn't be in a menu
   wearing the same weight as the ones that can. They were rescoped instead:
   Rewrite rearranges what's there, Expand writes it out in full, and neither
   claims to invent material. An unknown action returns no edits rather than a
   null the caller has to special-case. */
export function editsFor(action: string, text: string): TextEdit[] {
  if (action === 'Fix spelling & grammar') return fixSpellingGrammar(text);
  if (action === 'Reduce') return reduce(text);
  if (action === 'Rewrite') return rewrite(text);
  if (action === 'Expand') return expand(text);
  if ((TONES as readonly string[]).includes(action)) return adjustTone(text, action as Tone);
  return [];
}
