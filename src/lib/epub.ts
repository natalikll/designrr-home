/* Real EPUB 3 packaging, entirely in the browser.
 *
 * An EPUB is a ZIP with a required shape, so this needs no backend: the only hard
 * rule the container format imposes is that `mimetype` is the first entry and is
 * stored uncompressed, which fflate lets us do per-file with `level: 0`.
 *
 * What this does NOT do is run EPUBCheck — that's a Java tool and genuinely cannot
 * run here. The Publisher panel says so rather than pretending otherwise.
 */
import { zipSync, strToU8, type Zippable } from 'fflate';

export interface EpubChapter {
  id: string;
  title: string;
  html: string;
  layout?: string;
}

export interface EpubMetadata {
  title: string;
  subtitle: string;
  author: string;
  identifier: string;
  language: string;
  publisher: string;
  description: string;
  subjects: string;
  /* Series and reading direction were collected by the editor and silently dropped
     here — the Metadata panel's own helper text promises the spine carries them, so
     they're real fields now: `belongs-to-collection` and page-progression-direction. */
  seriesName?: string;
  seriesPosition?: string;
  readingDirection?: 'ltr' | 'rtl';
}

/* The look the book was designed in. Without this the package fell back to one
   fixed generic serif sheet, so every float, column, callout and text style the
   editor can produce arrived in the reader as unstyled prose. */
export interface EpubTheme {
  headingFont: string;
  bodyFont: string;
  headingColor: string;
  bodyColor: string;
  accentColor: string;
  bg: string;
}

export interface EpubTextStyle {
  id: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  fontWeight?: number;
  fontStyle?: 'italic';
  letterSpacing?: string;
  textTransform?: 'uppercase';
}

export interface EpubInput {
  metadata: EpubMetadata;
  chapters: EpubChapter[];
  coverImage?: string;      // data: URI or asset path
  coverTitle?: string;      // plain text, for the generated cover page
  coverSubtitle?: string;
  backMatterHtml?: string;
  /* Heading of the book's visible contents page, when it has one. The entries
     themselves are generated from the real chapter list so every link resolves —
     the editor regenerates its own TOC page the same way. */
  tocHeading?: string;
  includeTocPage?: boolean;
  theme?: EpubTheme;
  textStyles?: EpubTextStyle[];
}

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

/* Void elements per the HTML spec — the short list this used to carry missed
   `input`, `meta`, `area`, `embed`, `track` and `wbr`, any one of which makes a
   reading system's XML parser reject the whole document. */
const VOID_ELEMENTS = 'br|hr|img|source|col|input|meta|area|embed|track|wbr|base|link|param';

/* TipTap emits HTML, not XHTML. Void elements come back unclosed and bare
   ampersands survive, both of which make the XML parser in a reading system fail
   the whole document — so close the voids and escape stray ampersands. */
export function htmlToXhtml(html: string): string {
  let out = html.replace(new RegExp(`<(${VOID_ELEMENTS})([^>]*?)/?>`, 'gi'), (_m, tag: string, attrs: string) => {
    const cleaned = attrs.replace(/\s+$/, '');
    return `<${tag}${cleaned} />`;
  });
  // Bare "&" that isn't already a character reference.
  out = out.replace(/&(?!#?[a-zA-Z0-9]+;)/g, '&amp;');
  /* XHTML doesn't infer the SVG namespace the way the HTML parser does, so an
     <svg> without an explicit xmlns is a namespace error rather than a drawing.
     Every shape and QR block this editor inserts renders inline SVG. */
  out = out.replace(/<svg(?![^>]*\bxmlns=)/gi, '<svg xmlns="http://www.w3.org/2000/svg"');
  return out;
}

/* Data-URI images have to become real files in the package: readers vary in their
   support, and inlining megabytes of base64 into XHTML bloats the book. */
interface ExtractedImage { path: string; bytes: Uint8Array; mediaType: string; }

function decodeDataUri(uri: string): { bytes: Uint8Array; mediaType: string } | null {
  const match = uri.match(/^data:([^;,]+);base64,(.*)$/);
  if (!match) return null;
  const [, mediaType, b64] = match;
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { bytes, mediaType };
  } catch {
    return null;
  }
}

/* ── external images ─────────────────────────────────────────────────────────
   The packager only ever understood `data:` URIs, but every image the product
   actually ships — the stock library, image-grid cells, every cover photo — is a
   bundled asset path. Those went into the XHTML verbatim: an absolute path to a
   host that isn't in the book, so a blank frame in every reader and an EPUBCheck
   error, while the cover fell back to text without saying so.

   Fetching is async and packaging is not, so this runs as an explicit step before
   buildEpub rather than inside it. Anything that can't be fetched is reported
   rather than swallowed, so the Publish panel can say which images won't ship. */
const SRC_PATTERN = /src="([^"]+)"/g;

function collectSources(html: string | undefined, out: Set<string>) {
  if (!html) return;
  for (const match of html.matchAll(SRC_PATTERN)) {
    const src = match[1];
    if (src && !src.startsWith('data:')) out.add(src);
  }
}

async function toDataUri(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export interface InlineResult { input: EpubInput; unresolved: string[]; }

export async function inlineExternalImages(input: EpubInput): Promise<InlineResult> {
  const sources = new Set<string>();
  for (const chapter of input.chapters) collectSources(chapter.html, sources);
  collectSources(input.backMatterHtml, sources);
  if (input.coverImage && !input.coverImage.startsWith('data:')) sources.add(input.coverImage);

  if (sources.size === 0) return { input, unresolved: [] };

  const resolved = new Map<string, string>();
  const unresolved: string[] = [];
  await Promise.all([...sources].map(async (src) => {
    const dataUri = await toDataUri(src);
    if (dataUri) resolved.set(src, dataUri);
    else unresolved.push(src);
  }));

  const swap = (html: string | undefined): string | undefined => {
    if (!html) return html;
    return html.replace(SRC_PATTERN, (whole, src: string) => {
      const replacement = resolved.get(src);
      return replacement ? `src="${replacement}"` : whole;
    });
  };

  return {
    input: {
      ...input,
      chapters: input.chapters.map((c) => ({ ...c, html: swap(c.html) ?? c.html })),
      backMatterHtml: swap(input.backMatterHtml),
      coverImage: input.coverImage ? resolved.get(input.coverImage) ?? input.coverImage : undefined,
    },
    unresolved,
  };
}

function extensionFor(mediaType: string): string {
  if (mediaType === 'image/png') return 'png';
  if (mediaType === 'image/jpeg') return 'jpg';
  if (mediaType === 'image/gif') return 'gif';
  if (mediaType === 'image/svg+xml') return 'svg';
  if (mediaType === 'image/webp') return 'webp';
  return 'bin';
}

function extractImages(html: string, images: ExtractedImage[]): string {
  return html.replace(/src="(data:[^"]+)"/g, (whole, uri: string) => {
    const decoded = decodeDataUri(uri);
    if (!decoded) return whole;
    const existing = images.find((i) => i.bytes.length === decoded.bytes.length && i.mediaType === decoded.mediaType);
    if (existing) return `src="${existing.path}"`;
    const path = `images/img-${images.length + 1}.${extensionFor(decoded.mediaType)}`;
    images.push({ path, bytes: decoded.bytes, mediaType: decoded.mediaType });
    return `src="${path}"`;
  });
}

/* Sub-headings were derived for display and then linked to nothing — no ids were
   ever emitted, so the navigation document stayed flat at chapter level. Stamping
   an id on each H3 at package time gives the nav real second-level entries. */
interface Subheading { id: string; text: string; }

function addHeadingIds(html: string, chapterIndex: number): { html: string; subs: Subheading[] } {
  const subs: Subheading[] = [];
  let n = 0;
  const out = html.replace(/<h3([^>]*)>([\s\S]*?)<\/h3>/gi, (whole, attrs: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!text) return whole;
    if (/\bid=/.test(attrs)) return whole;
    n += 1;
    const id = `sec-${chapterIndex + 1}-${n}`;
    subs.push({ id, text });
    return `<h3${attrs} id="${id}">${inner}</h3>`;
  });
  return { html: out, subs };
}

/* Remote media needs declaring in the manifest or EPUBCheck rejects the file.
   The editor can insert a video iframe or an audio element pointing anywhere. */
function hasRemoteResources(html: string): boolean {
  return /<iframe[^>]+src="https?:/i.test(html) || /<audio[^>]+src="https?:/i.test(html);
}

/* ── stylesheet ──────────────────────────────────────────────────────────────
   A near-direct port of the editor's own `.book-*` rules, which is the whole
   point: what the author designed is what the reader gets. Sizes are in `em`
   rather than the editor's `px` because a reflowable book has to honour the
   reader's own type size — that is the one place this deliberately differs. */
function buildStylesheet(theme: EpubTheme, textStyles: EpubTextStyle[]): string {
  const styleRules = textStyles.map((s) => `.book-textstyle--${s.id} {
  font-family: ${s.fontFamily};
  font-size: ${(s.fontSize / 15.5).toFixed(2)}em;
  color: ${s.color};
  text-align: center;
  margin: 1.2em 0;${s.fontWeight ? `\n  font-weight: ${s.fontWeight};` : ''}${s.fontStyle ? `\n  font-style: ${s.fontStyle};` : ''}${s.letterSpacing ? `\n  letter-spacing: ${s.letterSpacing};` : ''}${s.textTransform ? `\n  text-transform: ${s.textTransform};` : ''}
}`).join('\n');

  return `@charset "utf-8";

html { font-size: 100%; }
body {
  margin: 0 5%;
  line-height: 1.7;
  font-family: ${theme.bodyFont};
  color: ${theme.bodyColor};
  background: ${theme.bg};
}

h1, h2, h3 { font-family: ${theme.headingFont}; color: ${theme.headingColor}; line-height: 1.25; font-weight: 700; }
h1 { font-size: 1.9em; margin: 1.2em 0 .6em; }
h2 { font-size: 1.6em; margin: 1.4em 0 .6em; }
h3 { font-size: 1.15em; margin: 1.2em 0 .4em; }
p { margin: 0 0 .9em; text-indent: 0; }
ul { list-style: disc; margin: 0 0 .9em; padding-left: 1.4em; }
ol { list-style: decimal; margin: 0 0 .9em; padding-left: 1.4em; }
li { margin-bottom: .25em; }
li p { margin: 0; }
a { color: #006EFE; text-decoration: underline; text-underline-offset: 2px; }
a:visited { color: #7C3AED; }
mark { background: #fdf08a; }
hr { border: none; border-top: 1px solid #ccc; margin: 1.5em 0; }

blockquote {
  border-left: 3px solid ${theme.accentColor};
  margin: 1.2em 0;
  padding: .25em 0 .25em 1em;
  font-style: italic;
  color: #52637A;
}
/* Chapter layouts — the five the editor offers. A reading system reflows, so
   these carry the parts that survive reflow (emphasis, spacing, columns) and
   drop the parts that cannot (fixed heights). */
.book-layout-opener > h2 { font-size: 2.2em; margin-top: 1.6em; }
.book-layout-quote-pull blockquote {
  font-size: 1.35em;
  font-family: ${theme.headingFont};
  border-left-width: 4px;
  font-style: normal;
}
.book-layout-two-column { column-count: 2; column-gap: 1.8em; }
.book-layout-image-led > .book-img-wrap:first-child { margin-top: 0; }

/* Images — the wrap attribute is the reason this editor exists, so it has to
   survive packaging. Floats are the one placement mechanism a reflowable
   document can honour. */
.book-img-wrap { margin: 1em 0; }
.book-img-wrap img { display: block; width: 100%; height: auto; }
.book-img-wrap figcaption {
  font-size: .82em;
  color: #6B7686;
  text-align: center;
  line-height: 1.4;
  margin-top: .4em;
}
.book-img-wrap--inline { display: block; max-width: 100%; margin: 1.1em auto; }
.book-img-wrap--left { float: left; max-width: 46%; margin: .25em 1.2em .7em 0; }
.book-img-wrap--right { float: right; max-width: 46%; margin: .25em 0 .7em 1.2em; }
.book-img-wrap--full-bleed { display: block; width: 100%; margin: 1.3em 0; max-width: none; }

.book-callout {
  background: #EAF2FF;
  border: 1px solid #BFDBFE;
  border-radius: 8px;
  padding: .3em 1.2em;
  margin: 1.2em 0;
}
.book-callout p:last-child { margin-bottom: 0; }

table { border-collapse: collapse; width: 100%; margin: 1.2em 0; font-size: .92em; }
th, td { border: 1px solid #bbb; padding: .4em .7em; text-align: left; }
th { background: #F7F8FA; font-weight: 700; color: ${theme.headingColor}; }

.book-shape { display: inline-block; margin: .5em .8em .5em 0; }
.book-shape svg { display: inline-block; }

.book-embed { margin: 1.2em 0; background: #F0F2F5; }
.book-embed--video iframe { width: 100%; min-height: 15em; display: block; border: 0; }
.book-embed--audio { padding: .9em; }
.book-embed--audio audio { width: 100%; display: block; }

.book-author-name { font-style: italic; letter-spacing: .02em; color: #6B7686; text-align: center; }
.book-display-text {
  font-family: ${theme.headingFont};
  font-size: 1.9em;
  text-align: center;
  color: ${theme.headingColor};
  margin: 1.5em 0;
}

${styleRules}
.book-textstyle--gilded {
  text-decoration: underline;
  text-decoration-color: #C9A94A;
  text-underline-offset: 6px;
}

.book-columns { column-gap: 1.8em; margin: 1.2em 0; }
.book-columns--2 { column-count: 2; }
.book-columns--3 { column-count: 3; }
.book-columns--4 { column-count: 4; }

/* CSS grid is patchy across reading systems, so the grid degrades to a float
   row that every renderer understands. */
.book-image-grid { margin: 1.3em 0; overflow: hidden; }
.book-image-grid .book-img-wrap { float: left; margin: 0 1% 2% 0; }
.book-image-grid--2 .book-img-wrap { width: 49%; }
.book-image-grid--3 .book-img-wrap { width: 32%; }
.book-image-grid--4 .book-img-wrap { width: 24%; }

.book-qr {
  margin: 1em 0;
  padding: .8em;
  border: 1px solid #E0E5EB;
  border-radius: 8px;
  background: #fff;
}
.book-qr-url { font-size: .82em; color: #6B7686; word-break: break-all; }

.book-textfield { margin: 1em 0; max-width: 24em; }
.book-textfield-label {
  display: block;
  font-size: .8em;
  font-weight: 600;
  color: #6B7686;
  margin-bottom: .35em;
}
.book-textfield-box {
  height: 2.2em;
  border: 1px solid #E0E5EB;
  border-radius: 6px;
  background: #F7F8FA;
}

.book-jumbotron { margin: 1.5em 0; padding: 2em; border-radius: 10px; text-align: center; }
.book-jumbotron-heading {
  font-family: ${theme.headingFont};
  font-size: 1.45em;
  color: ${theme.headingColor};
  margin-bottom: .4em;
}
.book-jumbotron-body { font-size: .95em; color: #52637A; margin-bottom: 1em; }
.book-jumbotron-button {
  display: inline-block;
  font-size: .9em;
  font-weight: 700;
  color: #fff;
  background: ${theme.accentColor};
  border-radius: 7px;
  padding: .65em 1.3em;
}

.book-checklist { list-style: none; padding-left: 0; }
.book-checklist li { margin-bottom: .4em; }

/* Footnotes. The marker carries epub:type="noteref" and each note
   epub:type="footnote" (see lib/footnotes.ts), which is what makes Kindle and
   Apple Books show a tappable popup instead of jumping to the foot of the
   chapter. Readers that don't do popups fall back to this list, so it still has
   to read as a proper notes section on its own. */
/* Plain superscript numeral, no brackets and no underline — a typeset
   footnote, not a web citation. Still a real link: the padding is there so
   the tap target is bigger than the 6px glyph without changing how it looks. */
.book-footnote-ref { font-size: .72em; vertical-align: super; line-height: 0; font-weight: 700; }
.book-footnote-ref a { text-decoration: none; color: inherit; padding: 0 .25em; }
.book-footnotes {
  margin-top: 2em;
  padding-top: 1em;
  border-top: 1px solid #DFE3E9;
  font-size: .85em;
  color: #4A5568;
}
.book-footnotes li { margin-bottom: .4em; }
.book-footnotes p { margin: 0; }
.book-answer-line { border-bottom: 1px solid #E0E5EB; height: 1.4em; margin: 0 0 .9em; }

.cover { text-align: center; margin: 0; padding: 0; }
.cover img { width: 100%; height: auto; }

.contents { list-style: decimal; padding-left: 1.4em; }
.contents > li { margin-bottom: .6em; }
.contents ul { list-style: none; padding-left: .8em; margin: .3em 0 0; }
.contents ul li { font-size: .9em; }
`;
}

const DEFAULT_THEME: EpubTheme = {
  headingFont: 'Georgia, serif',
  bodyFont: 'serif',
  headingColor: '#15191F',
  bodyColor: '#2A303A',
  accentColor: '#006EFE',
  bg: '#FFFFFF',
};

function xhtmlDoc(title: string, language: string, body: string, dir?: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(language)}" lang="${esc(language)}"${dir === 'rtl' ? ' dir="rtl"' : ''}>
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<link rel="stylesheet" type="text/css" href="styles.css" />
</head>
<body>
${body}
</body>
</html>`;
}

export function buildEpub(input: EpubInput): Uint8Array {
  const { metadata, chapters } = input;
  const lang = metadata.language || 'en';
  const dir = metadata.readingDirection === 'rtl' ? 'rtl' : 'ltr';
  const identifier = metadata.identifier || `urn:uuid:${crypto.randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const theme = input.theme ?? DEFAULT_THEME;
  const images: ExtractedImage[] = [];

  const files: Zippable = {};

  // Chapter documents
  const chapterFiles = chapters.map((chapter, i) => {
    const name = `chapter-${i + 1}.xhtml`;
    const withIds = addHeadingIds(chapter.html, i);
    const body = extractImages(htmlToXhtml(withIds.html), images);
    const layoutClass = chapter.layout ? ` book-layout-${chapter.layout}` : '';
    files[`OEBPS/${name}`] = strToU8(xhtmlDoc(
      chapter.title,
      lang,
      `<section epub:type="chapter" class="book-chapter${layoutClass}">\n${body}\n</section>`,
      dir,
    ));
    return { name, title: chapter.title, id: `chapter-${i + 1}`, subs: withIds.subs, remote: hasRemoteResources(body) };
  });

  // Cover page, when a cover image exists
  let coverImagePath: string | null = null;
  if (input.coverImage) {
    const decoded = decodeDataUri(input.coverImage);
    if (decoded) {
      coverImagePath = `images/cover.${extensionFor(decoded.mediaType)}`;
      images.push({ path: coverImagePath, bytes: decoded.bytes, mediaType: decoded.mediaType });
    }
  }
  const coverBody = coverImagePath
    ? `<div class="cover"><img src="${coverImagePath}" alt="${esc(metadata.title)}" /></div>`
    : `<div class="cover"><h1>${esc(input.coverTitle || metadata.title)}</h1>${input.coverSubtitle ? `<p>${esc(input.coverSubtitle)}</p>` : ''}${metadata.author ? `<p>${esc(metadata.author)}</p>` : ''}</div>`;
  files['OEBPS/cover.xhtml'] = strToU8(xhtmlDoc('Cover', lang, coverBody, dir));

  /* The visible contents page. It used to be edited in the app and then dropped
     silently at the door — it's generated here from the real chapter list so
     every entry, and every sub-heading under it, actually links. */
  const wantsTocPage = input.includeTocPage !== false;
  if (wantsTocPage) {
    const entries = chapterFiles.map((c) => {
      const subs = c.subs.length
        ? `\n      <ul>${c.subs.map((s) => `\n        <li><a href="${c.name}#${s.id}">${esc(s.text)}</a></li>`).join('')}\n      </ul>`
        : '';
      return `    <li><a href="${c.name}">${esc(c.title)}</a>${subs}</li>`;
    }).join('\n');
    files['OEBPS/contents.xhtml'] = strToU8(xhtmlDoc(
      input.tocHeading || 'Contents',
      lang,
      `<section epub:type="toc">\n  <h1>${esc(input.tocHeading || 'Contents')}</h1>\n  <ol class="contents">\n${entries}\n  </ol>\n</section>`,
      dir,
    ));
  }

  if (input.backMatterHtml) {
    const body = extractImages(htmlToXhtml(input.backMatterHtml), images);
    files['OEBPS/backmatter.xhtml'] = strToU8(xhtmlDoc('About the Author', lang, `<section epub:type="afterword">\n${body}\n</section>`, dir));
  }

  // Navigation document — EPUB 3's required TOC, and a real one: every entry links.
  const navItems = chapterFiles.map((c) => {
    const subs = c.subs.length
      ? `\n        <ol>${c.subs.map((s) => `\n          <li><a href="${c.name}#${s.id}">${esc(s.text)}</a></li>`).join('')}\n        </ol>`
      : '';
    return `      <li><a href="${c.name}">${esc(c.title)}</a>${subs}</li>`;
  }).join('\n');

  files['OEBPS/nav.xhtml'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(lang)}" lang="${esc(lang)}">
<head><meta charset="utf-8" /><title>Contents</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
${navItems}
${input.backMatterHtml ? '      <li><a href="backmatter.xhtml">About the Author</a></li>\n' : ''}    </ol>
  </nav>
  <nav epub:type="landmarks" hidden="hidden">
    <h1>Landmarks</h1>
    <ol>
      <li><a epub:type="cover" href="cover.xhtml">Cover</a></li>
${wantsTocPage ? '      <li><a epub:type="toc" href="contents.xhtml">Table of Contents</a></li>\n' : ''}      <li><a epub:type="bodymatter" href="${chapterFiles[0]?.name ?? 'cover.xhtml'}">Start of content</a></li>
    </ol>
  </nav>
</body>
</html>`);

  files['OEBPS/styles.css'] = strToU8(buildStylesheet(theme, input.textStyles ?? []));
  for (const image of images) files[`OEBPS/${image.path}`] = image.bytes;

  // Package document
  const subjects = metadata.subjects.split(',').map((s) => s.trim()).filter(Boolean);
  const manifest = [
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />',
    '    <item id="css" href="styles.css" media-type="text/css" />',
    '    <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml" />',
    ...(wantsTocPage ? ['    <item id="contents" href="contents.xhtml" media-type="application/xhtml+xml" />'] : []),
    ...chapterFiles.map((c) => `    <item id="${c.id}" href="${c.name}" media-type="application/xhtml+xml"${c.remote ? ' properties="remote-resources"' : ''} />`),
    ...(input.backMatterHtml ? ['    <item id="backmatter" href="backmatter.xhtml" media-type="application/xhtml+xml" />'] : []),
    ...images.map((img, i) => `    <item id="img-${i + 1}" href="${img.path}" media-type="${img.mediaType}"${img.path === coverImagePath ? ' properties="cover-image"' : ''} />`),
  ].join('\n');

  const spine = [
    '    <itemref idref="cover-page" />',
    ...(wantsTocPage ? ['    <itemref idref="contents" />'] : []),
    ...chapterFiles.map((c) => `    <itemref idref="${c.id}" />`),
    ...(input.backMatterHtml ? ['    <itemref idref="backmatter" />'] : []),
  ].join('\n');

  /* Two dc:title elements are ambiguous without a title-type refinement — the
     subtitle used to go in bare, which retailers read as a second main title. */
  const titleBlock = metadata.subtitle
    ? `    <dc:title id="t-main">${esc(metadata.title || 'Untitled')}</dc:title>
    <meta refines="#t-main" property="title-type">main</meta>
    <dc:title id="t-sub">${esc(metadata.subtitle)}</dc:title>
    <meta refines="#t-sub" property="title-type">subtitle</meta>`
    : `    <dc:title>${esc(metadata.title || 'Untitled')}</dc:title>`;

  const seriesBlock = metadata.seriesName?.trim()
    ? `    <meta property="belongs-to-collection" id="series">${esc(metadata.seriesName.trim())}</meta>
    <meta refines="#series" property="collection-type">series</meta>${metadata.seriesPosition?.trim() ? `\n    <meta refines="#series" property="group-position">${esc(metadata.seriesPosition.trim())}</meta>` : ''}\n`
    : '';

  /* EPUB Accessibility 1.1 asks for five properties; this wrote two, while the
     Publisher panel showed an Accessibility group implying the set was covered. */
  const hasImages = images.length > 0;
  const a11yBlock = [
    '    <meta property="schema:accessMode">textual</meta>',
    ...(hasImages ? ['    <meta property="schema:accessMode">visual</meta>'] : []),
    '    <meta property="schema:accessModeSufficient">textual</meta>',
    '    <meta property="schema:accessibilityFeature">structuralNavigation</meta>',
    '    <meta property="schema:accessibilityFeature">readingOrder</meta>',
    ...(hasImages ? ['    <meta property="schema:accessibilityFeature">alternativeText</meta>'] : []),
    '    <meta property="schema:accessibilityHazard">none</meta>',
    `    <meta property="schema:accessibilitySummary">Reflowable text with a linked navigation document${hasImages ? ' and alternative text for images' : ''}. No fixed layout and no known hazards.</meta>`,
  ].join('\n');

  files['OEBPS/content.opf'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${esc(lang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${esc(identifier)}</dc:identifier>
${titleBlock}
    <dc:language>${esc(lang)}</dc:language>
${metadata.author ? `    <dc:creator>${esc(metadata.author)}</dc:creator>\n` : ''}${metadata.publisher ? `    <dc:publisher>${esc(metadata.publisher)}</dc:publisher>\n` : ''}${metadata.description ? `    <dc:description>${esc(metadata.description)}</dc:description>\n` : ''}${subjects.map((s) => `    <dc:subject>${esc(s)}</dc:subject>`).join('\n')}${subjects.length ? '\n' : ''}${seriesBlock}    <meta property="dcterms:modified">${modified}</meta>
${a11yBlock}
  </metadata>
  <manifest>
${manifest}
  </manifest>
  <spine page-progression-direction="${dir}">
${spine}
  </spine>
</package>`);

  files['META-INF/container.xml'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`);

  // `mimetype` must be the archive's FIRST entry and stored uncompressed. fflate writes
  // entries in key-insertion order, so it has to be spread in ahead of everything else —
  // adding it to `files` last puts it at the end of the zip, which EPUBCheck rejects.
  const ordered: Zippable = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    ...files,
  };

  return zipSync(ordered, { level: 6 });
}

export function downloadEpub(bytes: Uint8Array, filename: string) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: 'application/epub+zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
