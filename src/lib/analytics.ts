'use client';

/* Product events.
 *
 * There is no analytics backend behind the prototype, so an event lands in the console and in a
 * session-scoped buffer anyone can read with `readEvents()` from devtools. What matters here is
 * the payload shape: when a real pipeline is wired in, only `send` below has to change.
 *
 * The template events are the source the gallery's "Popular" sort is waiting on — see
 * POPULARITY_DATA_AVAILABLE in EbookCreateFlow. Ranking by books-created-in-60-days needs
 * `template_published` to have been collecting for 60 days first. */

export interface AnalyticsEvent {
  name: string;
  props: Record<string, unknown>;
  at: string;
}

const BUFFER_KEY = 'dsgn_events';
const BUFFER_LIMIT = 200;

function send(event: AnalyticsEvent) {
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[analytics]', event.name, event.props);
  }
  try {
    const raw = sessionStorage.getItem(BUFFER_KEY);
    const buffer: AnalyticsEvent[] = raw ? JSON.parse(raw) : [];
    buffer.push(event);
    sessionStorage.setItem(BUFFER_KEY, JSON.stringify(buffer.slice(-BUFFER_LIMIT)));
  } catch {
    /* private mode or a full quota — the console line above is still the record */
  }
}

export function track(name: string, props: Record<string, unknown> = {}) {
  send({ name, props, at: new Date().toISOString() });
}

export function readEvents(): AnalyticsEvent[] {
  try {
    const raw = sessionStorage.getItem(BUFFER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
