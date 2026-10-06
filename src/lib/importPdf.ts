import * as pdfjs from 'pdfjs-dist';

/* Reading a real PDF, in the browser.

   The import panel used to take only a file's NAME, so a PDF could never be
   anything but its own filename — drop a screen capture called
   "screencapture-localhost-3000.pdf" and you got a chapter titled
   "screencapture-localhost-3000" and nothing in it. The pictures in the file,
   which for a screen capture ARE the content, went nowhere.

   What the real product does is the thing to match: Designrr's own help says the
   photos in an imported PDF are placed into the ebook.

   Two kinds of PDF, and they need opposite treatment:
   — A TEXT pdf (a written document) has selectable text. Take the text.
   — An IMAGE pdf (a scan, an export, a screen capture) has little or no text.
     Its pages are pictures, so each page is rendered and placed as an image.
   The test is simply how much text comes back per page; there is no flag in the
   format that says which kind you have. */

/* pdf.js runs its parser in a worker. Pointed at the copy inside the installed
   package rather than a CDN, so this keeps working offline and cannot silently
   start reading a different version than the one bundled. */
let workerReady = false;
function ensureWorker() {
  if (workerReady) return;
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  workerReady = true;
}

export interface PdfPage {
  /** Page text, empty when the page carries none worth having. */
  text: string;
  /** A data: URI of the rendered page, only for pages that are pictures. */
  image?: string;
  /** Pictures embedded IN a text page, in the order they appear on it. */
  embedded?: string[];
}

export interface PdfRead {
  pages: PdfPage[];
  /** True when the file is pictures rather than text — see the note above. */
  imageBased: boolean;
  /** The document's own title, when it set one. Beats the filename. */
  title?: string;
}

/* Below this many characters a page is treated as a picture rather than text.
   A scanned page usually returns a handful of stray characters rather than
   nothing at all — an empty-string test would call those pages "text" and import
   three words where a picture belonged. */
const TEXT_PER_PAGE_MIN = 40;

/* Rendering costs memory and time, so pages are capped. A lead magnet made from
   a 400-page scan is not a thing anyone is doing, and the cap keeps a mistaken
   drop from locking up the tab. */
const MAX_RENDER_PAGES = 30;
/* 1.6 is legible on a retina screen at page width without producing data URIs
   measured in megabytes — these get embedded in the document. */
const RENDER_SCALE = 1.6;

/* Below this, a picture is furniture — a rule, a bullet, a logo in a running
   head — not content worth carrying into a chapter. */
const EMBEDDED_MIN_PX = 120;
/* Per page, so one decorated document can't produce hundreds of fragments. */
const EMBEDDED_MAX_PER_PAGE = 6;

/* The pictures drawn on a page, read out of its operator list.

   pdf.js has no "give me the images" call: a page is a list of drawing
   operations, and an image is a `paintImageXObject` naming an object the page
   holds. So the list is walked for those names and each one is pulled from the
   page's object store and painted onto its own canvas.

   `objs.get` is callback-based and only resolves once the object has actually
   been parsed, which is why the operator list is awaited first — asking earlier
   hangs. Anything that fails is skipped rather than failing the import: a
   picture we cannot read is worth less than the text around it. */
async function embeddedImages(page: pdfjs.PDFPageProxy): Promise<string[]> {
  let ops;
  try { ops = await page.getOperatorList(); } catch { return []; }
  const names: string[] = [];
  for (let i = 0; i < ops.fnArray.length; i += 1) {
    if (ops.fnArray[i] === pdfjs.OPS.paintImageXObject) {
      const name = ops.argsArray[i]?.[0];
      if (typeof name === 'string' && !names.includes(name)) names.push(name);
    }
    if (names.length >= EMBEDDED_MAX_PER_PAGE) break;
  }
  if (names.length === 0) return [];

  const out: string[] = [];
  for (const name of names) {
    try {
      const img = await new Promise<{ width: number; height: number; bitmap?: ImageBitmap; data?: Uint8ClampedArray } | null>(
        (resolve) => {
          try { page.objs.get(name, resolve as (v: unknown) => void); } catch { resolve(null); }
        },
      );
      if (!img || img.width < EMBEDDED_MIN_PX || img.height < EMBEDDED_MIN_PX) continue;
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      if (img.bitmap) {
        ctx.drawImage(img.bitmap, 0, 0);
      } else if (img.data) {
        /* Older builds hand back raw bytes. pdf.js packs them 3- or 4-per-pixel
           depending on the source's colour space, so the stride is derived from
           the length rather than assumed. */
        const perPixel = img.data.length / (img.width * img.height);
        const rgba = new Uint8ClampedArray(img.width * img.height * 4);
        for (let i = 0, p = 0; i < img.width * img.height; i += 1) {
          const s = i * perPixel;
          rgba[p++] = img.data[s];
          rgba[p++] = img.data[s + 1];
          rgba[p++] = img.data[s + 2];
          rgba[p++] = perPixel === 4 ? img.data[s + 3] : 255;
        }
        ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
      } else {
        continue;
      }
      out.push(canvas.toDataURL('image/jpeg', 0.82));
    } catch { /* unreadable picture, keep the page's text */ }
  }
  return out;
}

export async function readPdf(file: File): Promise<PdfRead> {
  ensureWorker();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;

  const meta = await doc.getMetadata().catch(() => null);
  const info = meta?.info as { Title?: string } | undefined;
  const title = info?.Title?.trim() || undefined;

  const count = Math.min(doc.numPages, MAX_RENDER_PAGES);
  const texts: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    texts.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' ').trim());
  }

  /* One verdict for the whole file, not per page: a document is a scan or it is
     not, and deciding page by page would interleave rendered pictures with
     stray-character "text" from the same scan. */
  const imageBased = texts.every((t) => t.length < TEXT_PER_PAGE_MIN);

  const pages: PdfPage[] = [];
  for (let i = 1; i <= count; i += 1) {
    const text = texts[i - 1];
    if (!imageBased) {
      /* A written document can still have pictures in it, and those are usually
         the whole reason it was worth importing — a report's charts, a guide's
         screenshots. Taking only the text threw them away silently, which is the
         case this was first reported for ("a PDF which contains images").
         Rendering the page would defeat the text extraction, so the pictures are
         pulled out of the page's own draw operations instead. */
      pages.push({ text, embedded: await embeddedImages(await doc.getPage(i)) });
      continue;
    }
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) { pages.push({ text }); continue; }
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    pages.push({ text, image: canvas.toDataURL('image/jpeg', 0.82) });
  }

  return { pages, imageBased, title };
}

/* A filename is a poor chapter title and a screen capture's filename is a bad
   one — "screencapture-localhost-3000-1738..." names the tool that made the file,
   not the thing inside it. So: the PDF's own title if it set one, else the
   filename with its extension, separators and timestamps taken off, else a plain
   description of what arrived. */
/* Filenames that describe the TOOL rather than the contents. A file called
   "screencapture-localhost-3000-1738271923" or "scan0001" or "Untitled document"
   names the thing that produced it, and putting that in a book's contents page is
   worse than admitting we don't know — it reads like a mistake the author made,
   and it is the kind of title nobody notices until it ships. */
const TOOL_ARTIFACT_NAME = /^(screen\s?(capture|shot)|scan|img|image|doc|document|untitled|export|download|file|new\s?doc|copy of)\b/i;

/* Whether we could NAME the thing, which is also the test for whether it is a
   chapter.

   A document that tells us what it is — through its own title, or a filename
   someone chose — stands alone, so it becomes a chapter. A file whose name we had
   to invent ("Imported pages") does not: inventing a chapter title is the tell
   that there was no chapter there, only content. Putting that content where the
   author is working removes the invented name entirely, along with the question
   of whether it was a good one. */
export function titleFromPdf(read: PdfRead, filename: string): { title: string; invented: boolean } {
  // The document's own title, when whoever made it set one, always wins.
  if (read.title) return { title: read.title, invented: false };
  const cleaned = filename
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    // Long digit runs are timestamps and ids, never words.
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (cleaned.length >= 3 && !TOOL_ARTIFACT_NAME.test(cleaned)) {
    return { title: cleaned.replace(/^./, (c) => c.toUpperCase()), invented: false };
  }
  /* Nothing usable in the name. The caller treats an invented title as "this is
     content, not a chapter" and places it at the cursor instead, where the name
     is never shown — so this is a fallback for the rare case where it still has
     to go somewhere of its own. */
  return { title: read.imageBased ? 'Imported pages' : 'Imported document', invented: true };
}
