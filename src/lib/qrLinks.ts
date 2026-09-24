/* Short, trackable destinations for QR blocks.

   Why a QR code wants an indirection at all, given the author already has a URL:

   1. Size. A symbol's module count grows with the data in it, and a real
      marketing URL is mostly tracking parameters — 150 characters of them is a
      69-module code that needs ~93px to stay above the 0.4mm print floor. The
      same destination behind a 30-character short link is a 33-module code that
      is comfortable at any size. This is the root fix for the scannability
      problem the block's sizing rules only mitigate.
   2. A printed book cannot be re-published. A direct QR is a permanent promise
      about a URL the author does not control forever — the campaign ends, the
      page moves, and every copy in the world now points at a 404. An
      indirection is the only way to repoint it afterwards.
   3. Counting scans is impossible without it.

   The trade is real and belongs to the author, which is why the block offers
   both: a direct code outlives Designrr, a tracked one can be corrected.

   ── on this implementation ──────────────────────────────────────────────────
   The mapping lives in localStorage, so a code resolves in the browser that made
   it and nowhere else. That is enough to build and demonstrate the whole flow,
   and it is NOT the real thing: a reader scanning a printed book is on another
   device entirely. Shipping this for real means the same two functions
   (resolveLink / recordScan) reading a server-side store behind /r/[code], which
   is why they are isolated here rather than inlined into the route. */

const STORE_KEY = 'designrr.qr.links.v1';

export interface QrLink {
  /** Where the short code sends a reader. Editable after the book is printed. */
  url: string;
  scans: number;
  created: number;
  lastScan?: number;
}

type LinkStore = Record<string, QrLink>;

function read(): LinkStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as LinkStore) : {};
  } catch {
    // Private windows and blocked site data both throw here. A QR that can't be
    // resolved is a dead link, not a crashed editor.
    return {};
  }
}

function write(store: LinkStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* over quota or blocked — nothing useful to do from here */
  }
}

/* No 0/O/1/I/l: a short code ends up read off a screen and typed by hand at
   least once, usually by the author checking their own link. 32^7 is ~34 billion,
   which is far past what a collision check needs to work against. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LEN = 7;

export function newQrCode(): string {
  const store = read();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let code = '';
    // crypto where it exists; Math.random is a fine fallback for a demo store.
    const bytes = typeof crypto !== 'undefined' && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint8Array(CODE_LEN))
      : Array.from({ length: CODE_LEN }, () => Math.floor(Math.random() * 256));
    for (let i = 0; i < CODE_LEN; i += 1) code += ALPHABET[bytes[i] % ALPHABET.length];
    if (!store[code]) return code;
  }
  // Eight collisions in a 34-billion space means the store is unreadable, not
  // that we were unlucky. A time-based code is still unique enough to proceed.
  return `t${Date.now().toString(36)}`;
}

/** Points a code at a URL, keeping any scans it has already collected. */
export function saveQrLink(code: string, url: string): void {
  if (!code) return;
  const store = read();
  const existing = store[code];
  store[code] = {
    url,
    scans: existing?.scans ?? 0,
    created: existing?.created ?? Date.now(),
    lastScan: existing?.lastScan,
  };
  write(store);
}

export function resolveQrLink(code: string): QrLink | null {
  return read()[code] ?? null;
}

/** Resolve + count, for the redirect route. */
export function recordScan(code: string): QrLink | null {
  const store = read();
  const link = store[code];
  if (!link) return null;
  store[code] = { ...link, scans: link.scans + 1, lastScan: Date.now() };
  write(store);
  return store[code];
}

export const QR_LINK_PATH = '/r/';

/* Absolute, because the string goes into a QR code that is scanned by a device
   with no idea what site it came from. Falls back to a placeholder host during
   SSR, where there is no origin to read; the editor re-renders on the client and
   the real one lands before anything is exported. */
export function shortLinkFor(code: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://designrr.com';
  return `${origin}${QR_LINK_PATH}${code}`;
}

/* The caption under a symbol. A reader deciding whether to scan wants the host
   they are being sent to — not the tracking URL in full, and not the shortener,
   which tells them nothing and is exactly what a malicious code would show. */
export function destinationHost(url: string): string {
  const raw = (url ?? '').trim();
  if (!raw) return '';
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).host.replace(/^www\./i, '');
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
  }
}
