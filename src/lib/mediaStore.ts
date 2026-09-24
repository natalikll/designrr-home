/* Uploaded audio and video, kept in IndexedDB rather than in the document.

   Every other upload in this editor becomes a base64 data URI inside the book,
   which is also what gets persisted — and the save already notes that images
   "reach the 5MB quota quickly". A single audio file is bigger than every photo
   in a book put together, and a video is bigger again, so storing media the same
   way wouldn't be a tight fit: it would break saving outright, and silently, on
   the first upload.

   So the document carries a reference (`book-media:<id>`) and the bytes live
   here. Two consequences worth knowing:

   - Blobs have to be loaded into `cache` BEFORE any editor mounts, because
     ProseMirror's renderHTML is synchronous and resolves the reference through
     the cache. The book editor already gates rendering behind `hydrated` for
     exactly this class of bug; media loading hangs off the same gate.
   - Object URLs are per-session. The id in the document is stable, the blob is
     stable, only the URL is regenerated on load — so nothing in the saved book
     depends on a URL that won't exist next time. */

const DB_NAME = 'designrr.book.media';
const DB_VERSION = 1;
const STORE = 'media';

export const MEDIA_REF_PREFIX = 'book-media:';

export interface StoredMedia {
  id: string;
  name: string;
  /* The file's own MIME type, carried through to the EPUB manifest — a reading
     system needs `audio/mpeg` or `video/mp4` declared, not guessed from a path. */
  type: string;
  blob: Blob;
}

export function isMediaRef(src: string): boolean {
  return typeof src === 'string' && src.startsWith(MEDIA_REF_PREFIX);
}

export function mediaRefId(src: string): string | null {
  return isMediaRef(src) ? src.slice(MEDIA_REF_PREFIX.length) : null;
}

/* Resolved object URLs, by id. Read synchronously by the embed node's renderHTML;
   populated by loadAllMedia() during hydration. */
const cache = new Map<string, string>();

/** The playable URL for a stored reference, or '' if it hasn't loaded yet. */
export function mediaUrl(src: string): string {
  const id = mediaRefId(src);
  return (id && cache.get(id)) || '';
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    /* A blocked or unavailable IndexedDB (private browsing in some browsers,
       storage disabled) must not take the editor down with it — every caller
       treats null as "uploads aren't available right now". */
    request.onerror = () => resolve(null);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      let request: IDBRequest<T>;
      try {
        request = run(db.transaction(STORE, mode).objectStore(STORE));
      } catch {
        db.close();
        return resolve(null);
      }
      request.onsuccess = () => { resolve(request.result); db.close(); };
      request.onerror = () => { resolve(null); db.close(); };
    });
  });
}

/** Stores a file and returns the `book-media:<id>` reference to put in the document. */
export async function putMedia(file: File): Promise<string | null> {
  const id = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const record: StoredMedia = { id, name: file.name, type: file.type, blob: file };
  const written = await tx('readwrite', (store) => store.put(record) as IDBRequest<IDBValidKey>);
  if (written === null) return null;
  cache.set(id, URL.createObjectURL(file));
  return `${MEDIA_REF_PREFIX}${id}`;
}

export async function getMedia(src: string): Promise<StoredMedia | null> {
  const id = mediaRefId(src);
  if (!id) return null;
  return (await tx('readonly', (store) => store.get(id) as IDBRequest<StoredMedia>)) ?? null;
}

/* A blob: URL is valid for one tab in one session. It has no business being
   written into the saved book, where it is guaranteed to be dead on the next
   load — `data-media` is the durable reference and the node rebuilds a live URL
   from it. Left in, the stale URL is harmless where TipTap re-renders (it throws
   the attribute away) but not where saved HTML is shown as-is, such as the page
   thumbnails, which each fired a failed request for a URL that no longer existed. */
export function stripSessionUrls(html: string): string {
  return html.replace(/<(?:audio|video)\b[^>]*>/gi, (tag) => (
    /data-media="book-media:/.test(tag) ? tag.replace(/\ssrc="blob:[^"]*"/i, '') : tag
  ));
}

function blobToDataUri(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/* Export pass. In the document an uploaded clip's element carries a blob: URL,
   which is valid for this tab and this session and nowhere else — packaging that
   verbatim would ship a book whose media points at a URL that stopped existing
   the moment the tab closed. This swaps each one for a data URI, which the
   packager already knows how to turn into a real file in the container.
   The reference is read from `data-media` rather than from the src, because by
   this point the src is the blob URL and tells us nothing about which file it is. */
export async function inlineUploadedMedia(html: string): Promise<string> {
  const refs = [...html.matchAll(/data-media="(book-media:[^"]+)"/g)].map((m) => m[1]);
  if (refs.length === 0) return html;

  const resolved = new Map<string, string>();
  await Promise.all([...new Set(refs)].map(async (ref) => {
    const record = await getMedia(ref);
    if (!record) return;
    const dataUri = await blobToDataUri(record.blob);
    if (dataUri) resolved.set(ref, dataUri);
  }));

  return html.replace(/<(?:audio|video)\b[^>]*>/gi, (tag) => {
    const ref = tag.match(/data-media="(book-media:[^"]+)"/)?.[1];
    const dataUri = ref ? resolved.get(ref) : undefined;
    /* Left alone when the blob has gone missing — the element keeps its blob URL
       and the book ships with one dead clip, which is better than silently
       dropping the element and leaving a gap the author never sees. */
    if (!dataUri) return tag;
    return tag.replace(/\ssrc="[^"]*"/i, ` src="${dataUri}"`);
  });
}

/* Called once during hydration, before editors mount — see the note at the top
   about why this has to finish first. Resolving everything up front rather than
   lazily per block also means one transaction instead of one per clip. */
export async function loadAllMedia(): Promise<void> {
  const all = await tx('readonly', (store) => store.getAll() as IDBRequest<StoredMedia[]>);
  for (const record of all ?? []) {
    if (!cache.has(record.id)) cache.set(record.id, URL.createObjectURL(record.blob));
  }
}
