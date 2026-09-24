import { NextRequest, NextResponse } from 'next/server';

// Unsplash's API terms require pinging a photo's download_location endpoint
// whenever it's actually used (inserted), not merely previewed in search.
export async function POST(req: NextRequest) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return NextResponse.json({ ok: false }, { status: 503 });

  const { downloadLocation } = await req.json().catch(() => ({ downloadLocation: null }));
  if (typeof downloadLocation !== 'string' || !downloadLocation.startsWith('https://api.unsplash.com/')) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    await fetch(downloadLocation, { headers: { Authorization: `Client-ID ${accessKey}` } });
  } catch {
    // Best-effort tracking ping — a failure here shouldn't block the user's insert.
  }
  return NextResponse.json({ ok: true });
}
