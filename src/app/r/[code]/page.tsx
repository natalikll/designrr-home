'use client';

/* Where a tracked QR code lands. The symbol printed in the book encodes this
   URL, not the author's — see src/lib/qrLinks.ts for why the indirection exists.

   A client component on purpose, for now: the mapping lives in localStorage, so
   only the browser that created the code can resolve it. When this gets a real
   server-side store the page becomes a route handler that redirects on the
   server, and the two calls below (recordScan / the url it returns) are the only
   lines that change. */

import { useEffect, useState } from 'react';
import { use } from 'react';
import { recordScan } from '@/lib/qrLinks';

type State = { status: 'looking' } | { status: 'going'; url: string } | { status: 'missing' };

export default function QrRedirectPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [state, setState] = useState<State>({ status: 'looking' });

  useEffect(() => {
    let cancelled = false;
    /* Deferred out of the effect body rather than run inline. The lookup reads
       localStorage, which only exists on the client, so the first paint has to be
       the neutral "looking" state either way — resolving in a microtask makes
       that explicit instead of setting state during the mount effect and
       cascading a second render before anything has been shown. */
    queueMicrotask(() => {
      if (cancelled) return;
      const link = recordScan(code);
      if (!link) { setState({ status: 'missing' }); return; }
      setState({ status: 'going', url: link.url });
      /* replace() rather than assign(): the reader arrived by scanning, so there
         is no history here worth keeping, and a Back press should leave the site
         rather than bounce them through the redirect again. */
      window.location.replace(link.url);
    });
    return () => { cancelled = true; };
  }, [code]);

  return (
    <main
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, textAlign: 'center',
        fontFamily: "'Nunito Sans', system-ui, -apple-system, sans-serif", color: '#15191F',
      }}
    >
      <div style={{ maxWidth: 420 }}>
        {state.status === 'missing' ? (
          <>
            <h1 style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>This link isn’t available</h1>
            <p style={{ fontSize: 14, color: '#52637A', lineHeight: 1.6 }}>
              The code <code>{code}</code> doesn’t match any destination. If you’re the author, open the
              book that contains this QR code to restore it.
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, color: '#52637A' }}>Taking you there…</p>
            {/* A visible link, so a reader whose browser blocks the automatic
                redirect still gets where they were going. */}
            {state.status === 'going' && (
              <p style={{ marginTop: 12, fontSize: 13 }}>
                <a href={state.url} style={{ color: '#006EFE' }}>{state.url}</a>
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
