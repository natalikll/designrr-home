import { NextRequest, NextResponse } from 'next/server';

// Kept server-side so the Unsplash Access Key never reaches the browser.
// Without a key configured, the client falls back to its own curated stock
// grid rather than treating this as a hard error.
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.trim();
  if (!query) return NextResponse.json({ results: [] });

  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return NextResponse.json({ error: 'unsplash_unavailable' }, { status: 503 });
  }

  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', '20');

  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Client-ID ${accessKey}` } });
  } catch {
    return NextResponse.json({ error: 'unsplash_unavailable' }, { status: 503 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: 'unsplash_unavailable' }, { status: 503 });
  }

  const data = await res.json();
  const results = (data.results ?? []).map((p: {
    id: string;
    urls: { small: string; regular: string };
    alt_description: string | null;
    user: { name: string; links: { html: string } };
  }) => ({
    id: p.id,
    thumbUrl: p.urls.small,
    fullUrl: p.urls.regular,
    alt: p.alt_description ?? 'Unsplash photo',
    // Search Photos' `links` omits `download_location` (only List/Get-a-photo
    // include it) — but it always follows this fixed pattern keyed by photo
    // id, so we build it ourselves rather than leaving the required
    // download-tracking ping silently unsent for every real pick.
    downloadLocation: `https://api.unsplash.com/photos/${p.id}/download`,
    credit: { name: p.user.name, profileUrl: p.user.links.html },
  }));

  return NextResponse.json({ results });
}
