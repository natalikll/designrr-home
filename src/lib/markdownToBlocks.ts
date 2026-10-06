import { Marked } from 'marked';

/* Turning an AI reply into real blocks.

   Every assistant that writes prose returns Markdown, and the old Designrr
   editor is the cautionary tale: its Wordgenie panel renders lists but prints
   `### Young Adult` and `**Adventures in Imagination**` as literal hashes and
   asterisks, so dragging a reply into a book drags the punctuation in with it.
   Nothing may reach the document until it has been through here.

   This produces HTML rather than ProseMirror nodes on purpose. The editor
   already has one parser — the schema's own parseHTML rules, which is what
   paste goes through — and generating nodes directly would be a second
   description of the same mapping, free to drift from the first. HTML in,
   `insertContent` does the rest, and anything the schema does not recognise is
   dropped by the same code path that drops it from a paste. */

/* Raw HTML inside the Markdown is NOT passed through. An assistant can be
   talked into emitting a tag, and the honest reading of a reply is that it is
   text: a book is a document the author owns, not a page that renders whatever
   arrives. The schema would discard most of it anyway; refusing it here means
   not relying on that for safety. */
const md = new Marked({ gfm: true, breaks: false, async: false });

/* Markdown's h1/h2 become the editor's h3, and everything below becomes h4.

   Not cosmetic. Headings derive the book's structure here — an <h2> is a
   chapter title that opens a page and enters the table of contents, EPUB
   navigation and the screen-reader outline. An assistant writing "## Chapter
   Three" means it as a heading inside the answer it is giving, not as an
   instruction to split the book, and a reply inserted mid-chapter would
   otherwise end the chapter it landed in. The two levels the body editor
   allows are the two levels a draft can have.

   The flattening is lossy where a reply nests three deep, which is rarer in
   generated prose than the structural damage the alternative causes. */
const HEADING_MAP: Record<string, string> = {
  h1: 'h3', h2: 'h3', h3: 'h4', h4: 'h4', h5: 'h4', h6: 'h4',
};

function demoteHeadings(html: string): string {
  return html.replace(/<(\/?)h([1-6])([^>]*)>/gi, (_m, slash: string, level: string, rest: string) => {
    const tag = HEADING_MAP[`h${level}`] ?? 'h4';
    return `<${slash}${tag}${rest}>`;
  });
}

/** An assistant's reply as HTML the editor's own parser understands. */
export function markdownToHtml(markdown: string): string {
  const parsed = md.parse(markdown.trim(), { async: false }) as string;
  return demoteHeadings(parsed).trim();
}

/* Whether a reply is something you could put in a book.

   The chat answers questions ("about 1,200 words") and it writes drafts, and
   only drafts get an Insert button — an Insert on "about 1,200 words" offers to
   put the answer to a question into the manuscript, which is never what was
   meant. The test is deliberately about SHAPE rather than meaning: a draft
   carries structure, or it runs long enough to be prose rather than a reply.

   A sentence ending in a question mark is the one hard exclusion: assistants
   ask clarifying questions, and those are never drafts however long they run. */
const DRAFT_MIN_WORDS = 40;

export function looksLikeDraft(markdown: string): boolean {
  const text = markdown.trim();
  if (!text) return false;
  if (text.endsWith('?') && text.split(/\n\s*\n/).length === 1) return false;
  const structured = /^#{1,6}\s|\n#{1,6}\s|^\s*[-*+]\s|\n\s*[-*+]\s|^\s*\d+\.\s|\n\s*\d+\.\s|\n\s*\n/.test(text);
  const words = text.split(/\s+/).length;
  return structured || words >= DRAFT_MIN_WORDS;
}
