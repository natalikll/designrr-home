import { NextRequest, NextResponse } from 'next/server';

// Kept server-side so the Unsplash Access Key never reaches the browser.
// Without a key configured, the client falls back to its own curated stock
// grid rather than treating this as a hard error.
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.trim();
  if (!query) return NextResponse.json({ results: [], total: 0 });

  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', '20');
  /* Narrowing happens at Unsplash, not here. Filtering the twenty that came back
     would leave a handful of photos on screen and call it a search; asking for
     twenty of the right shape returns twenty of the right shape. Anything that
     isn't one of the three values Unsplash accepts is treated as no filter. */
  const orientation = req.nextUrl.searchParams.get('orientation');
  if (orientation === 'landscape' || orientation === 'portrait' || orientation === 'squarish') {
    url.searchParams.set('orientation', orientation);
  }

  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Client-ID ${accessKey}` } });
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
  /* An exhausted quota comes back as 403, and a demo-tier key gets fifty searches
     an hour for the whole app — so this is the failure a real session actually
     hits, not an edge case. It gets its own reason because the recovery differs:
     "unavailable" invites a retry that cannot succeed, where a spent quota only
     needs waiting. Collapsing both into one 503 also meant the server log said
     nothing about which had happened. */
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  const data = await res.json();
  const results = (data.results ?? []).map((p: {
    id: string;
    urls: { small: string; regular: string };
    alt_description: string | null;
    width: number;
    height: number;
    user: { name: string; links: { html: string } };
  }) => ({
    id: p.id,
    thumbUrl: p.urls.small,
    fullUrl: p.urls.regular,
    alt: p.alt_description ?? 'Unsplash photo',
    // The photo's real shape, so a tile can reserve its exact height before the
    // image decodes. Without it a column of photos reflows as each one lands,
    // which in a masonry grid moves every tile below it.
    width: p.width,
    height: p.height,
    // Search Photos' `links` omits `download_location` (only List/Get-a-photo
    // include it) — but it always follows this fixed pattern keyed by photo
    // id, so we build it ourselves rather than leaving the required
    // download-tracking ping silently unsent for every real pick.
    downloadLocation: `https://api.unsplash.com/photos/${p.id}/download`,
    credit: {
      name: p.user.name,
      /* Unsplash's API guidelines require the credit link back to the
         photographer's profile to carry both referral params, not just point at
         the profile. Applied here rather than at the call site so every consumer
         of this route gets a compliant link by construction. */
      profileUrl: `${p.user.links.html}?utm_source=designrr&utm_medium=referral`,
    },
  }));

  // What the query found in total, not just this page of twenty — the panel says
  // so, which is how you tell a narrow search from a broken one.
  return NextResponse.json({ results, total: data.total ?? results.length });
}
