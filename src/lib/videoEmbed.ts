/* Video embeds — parsed once here, used by the editor node, the insert picker and
   the EPUB packager, so the three can't disagree about what a pasted link means.

   Two things this fixes, both of which were real defects rather than polish:

   1. The picker used to ask the author to do the parsing: "use the embed link
      (YouTube/Vimeo 'Share → Embed'), not the regular watch page URL." Everyone
      pastes the watch URL, because that's what the address bar and the Share
      button both hand you. Recognising every shape a link actually arrives in is
      a dozen lines, and it retires the instruction entirely.

   2. The block rendered an <iframe> pointing at youtube.com. An EPUB may host
      audio, video, fonts and script-fetched data outside the container, but NOT a
      remote HTML page — the spec forbids embedding web pages for security
      reasons. So every chapter holding a video produced a book that fails
      validation, and nothing caught it: the pre-publish checklist's EPUBCheck row
      is hardcoded `unavailable`. The player is also the wrong thing to ship even
      where it is legal. Video plays in the live/HTML version and nowhere else:
      not in PDF outside Acrobat, not in EPUB (video isn't a core media type, so
      no reader is required to play it), and never on e-ink, which has no refresh
      rate for it. What survives every one of those is a poster frame and a link,
      which is what the node now renders. */

export type VideoProvider = 'youtube' | 'vimeo' | 'other';

export interface ParsedVideo {
  provider: VideoProvider;
  /** The provider's own id, where there is one — what the poster URL is built from. */
  id: string | null;
  /** The page a human opens. Every export falls back to linking here. */
  watchUrl: string;
  /** A real player, for the live/HTML version — the one output that can run one. */
  embedUrl: string;
  /** Thumbnail derivable without a network call. Vimeo has none; see fetchVideoMeta. */
  poster: string | null;
}

/* Someone who followed the old hint pasted a whole `<iframe …>` element rather
   than a URL. Pull the src out and carry on rather than rejecting it — that
   author did exactly what the UI told them to. */
const IFRAME_SRC = /<iframe[^>]*\ssrc=["']([^"']+)["']/i;

/* 11-char id, the one constant across every YouTube URL shape. Anchored per
   pattern below rather than searched for loose, so a `list=` or `t=` parameter
   can't be mistaken for the video itself. */
const YT_ID = '([A-Za-z0-9_-]{11})';
/* Every subdomain YouTube actually hands out. `m.` is the one that matters most:
   the Share sheet on a phone produces it, and it is what people paste. */
const YT_HOST = '(?:www\\.|m\\.|music\\.)?youtube\\.com';
const YOUTUBE_PATTERNS = [
  new RegExp(`^https?://${YT_HOST}/watch\\?(?:[^#]*&)?v=${YT_ID}`, 'i'),
  new RegExp(`^https?://${YT_HOST}/embed/${YT_ID}`, 'i'),
  new RegExp(`^https?://${YT_HOST}/shorts/${YT_ID}`, 'i'),
  new RegExp(`^https?://${YT_HOST}/live/${YT_ID}`, 'i'),
  new RegExp(`^https?://${YT_HOST}/v/${YT_ID}`, 'i'),
  new RegExp(`^https?://(?:www\\.)?youtube-nocookie\\.com/embed/${YT_ID}`, 'i'),
  new RegExp(`^https?://youtu\\.be/${YT_ID}`, 'i'),
];
/* The trailing segment on an unlisted Vimeo link is a privacy hash, and the video
   is unreachable without it — dropping it to "canonicalise" the URL would quietly
   break exactly the videos an author is most likely to put in a paid book. */
const VIMEO_PATTERNS = [
  /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)(?:\/([A-Za-z0-9]+))?/i,
  /^https?:\/\/player\.vimeo\.com\/video\/(\d+)(?:\?[^#]*\bh=([A-Za-z0-9]+))?/i,
  /* A video reached through a channel or a group keeps its id in the last
     segment. These are ordinary browsing URLs — what you get by copying the
     address bar rather than by using Share — so they turn up constantly. */
  /^https?:\/\/(?:www\.)?vimeo\.com\/channels\/[\w-]+\/(\d+)/i,
  /^https?:\/\/(?:www\.)?vimeo\.com\/groups\/[\w-]+\/videos\/(\d+)/i,
  /^https?:\/\/(?:www\.)?vimeo\.com\/ondemand\/[\w-]+\/(\d+)/i,
];

/* A link that names a video host but carries no usable id is a typo, not a
   generic web link — reporting it as unrecognised is more use than silently
   placing a poster-less link to a page that won't play anything. */
const VIDEO_HOSTS = /^https?:\/\/(?:www\.|m\.|music\.|player\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com)\//i;

/* Supplies the protocol people leave off. Browsers stopped showing `https://` in
   the address bar years ago, so what gets copied — or typed from memory — often
   starts at the host. This used to be an allowlist of four hosts, which meant a
   perfectly good `m.youtube.com/watch?v=…` was rejected for the one reason the
   author could not see.

   The path is required, not optional: it's what separates a link from a filename.
   Without it `chapter-one.mp3` would read as a host and become `https://chapter-one.mp3`,
   turning a typo into a plausible-looking dead link. */
export function withProtocol(raw: string): string {
  const url = (raw ?? '').trim();
  if (!url) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[\w-]+(\.[\w-]+)+\/\S+$/.test(url)) return `https://${url}`;
  return url;
}

/** Null when the string isn't a usable video link at all — the picker keeps its
 *  button disabled on null rather than accepting something that can't render. */
export function parseVideoUrl(raw: string): ParsedVideo | null {
  let url = (raw ?? '').trim();
  if (!url) return null;

  const iframe = url.match(IFRAME_SRC);
  if (iframe) url = iframe[1].trim();

  url = withProtocol(url);

  for (const pattern of YOUTUBE_PATTERNS) {
    const match = url.match(pattern);
    if (match) {
      const id = match[1];
      return {
        provider: 'youtube',
        id,
        watchUrl: `https://www.youtube.com/watch?v=${id}`,
        embedUrl: `https://www.youtube.com/embed/${id}`,
        /* hqdefault rather than maxresdefault: every video has one. maxres only
           exists for uploads above 720p, and a missing one serves a 404 image
           rather than an error, so the book would ship a grey placeholder. */
        poster: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      };
    }
  }

  for (const pattern of VIMEO_PATTERNS) {
    const match = url.match(pattern);
    if (match) {
      const id = match[1];
      const hash = match[2];
      return {
        provider: 'vimeo',
        id,
        watchUrl: hash ? `https://vimeo.com/${id}/${hash}` : `https://vimeo.com/${id}`,
        embedUrl: hash ? `https://player.vimeo.com/video/${id}?h=${hash}` : `https://player.vimeo.com/video/${id}`,
        // Vimeo's thumbnail lives behind oEmbed — see fetchVideoMeta.
        poster: null,
      };
    }
  }

  // A video host with nothing usable after it never reaches the generic branch.
  if (VIDEO_HOSTS.test(url)) return null;

  // Anything else that is at least a real URL: still linkable, just with no
  // poster or title until the author supplies one.
  if (/^https?:\/\/\S+$/i.test(url)) {
    return { provider: 'other', id: null, watchUrl: url, embedUrl: url, poster: null };
  }
  return null;
}

/* Why a link didn't parse. Two failures were sharing one message that named
   neither of them: "Paste a YouTube or Vimeo URL" was shown to someone who had
   pasted exactly that (with a mistyped id), and to someone pasting a Loom link
   the field would in fact have accepted. */
export type VideoLinkProblem = 'not-a-link' | 'missing-id';

export function videoLinkProblem(raw: string): VideoLinkProblem | null {
  const value = (raw ?? '').trim();
  if (!value || parseVideoUrl(value)) return null;
  const inner = value.match(IFRAME_SRC)?.[1]?.trim() ?? value;
  return VIDEO_HOSTS.test(withProtocol(inner)) ? 'missing-id' : 'not-a-link';
}

export interface VideoMeta { title: string; poster: string | null; }

/* Title and (for Vimeo) thumbnail, via the providers' public oEmbed endpoints —
   both CORS-enabled and neither needs a key. Used to label the link in the book,
   and to show the author which video they actually pasted before it is placed.
   Failure is not an error state: the block works without a title, so a blocked
   request or an offline machine just means a generic label. */
export async function fetchVideoMeta(parsed: ParsedVideo): Promise<VideoMeta | null> {
  const endpoint =
    parsed.provider === 'youtube'
      ? `https://www.youtube.com/oembed?url=${encodeURIComponent(parsed.watchUrl)}&format=json`
      : parsed.provider === 'vimeo'
        ? `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(parsed.watchUrl)}`
        : null;
  if (!endpoint) return null;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) return null;
    const data = (await response.json()) as { title?: string; thumbnail_url?: string };
    const fromOembed = typeof data.thumbnail_url === 'string' ? data.thumbnail_url : parsed.poster;
    return {
      title: typeof data.title === 'string' ? data.title : '',
      poster: (await bestYoutubePoster(parsed)) ?? fromOembed,
    };
  } catch {
    return null;
  }
}

/* YouTube's oEmbed hands back hqdefault, which is a 480x360 4:3 frame — a 16:9
   video sits inside it with black bars baked in. That's invisible in the editor,
   where the still is cropped to fill, and then obvious in the book, where it is
   printed at the full width of the text column. maxresdefault is the same frame
   at 1280x720 with no bars, but it only exists for uploads above 720p and 404s
   otherwise, so it has to be probed rather than assumed. Null means "keep what
   oEmbed gave us". */
async function bestYoutubePoster(parsed: ParsedVideo): Promise<string | null> {
  if (parsed.provider !== 'youtube' || !parsed.id) return null;
  const maxres = `https://i.ytimg.com/vi/${parsed.id}/maxresdefault.jpg`;
  try {
    const response = await fetch(maxres);
    return response.ok ? maxres : null;
  } catch {
    return null;
  }
}

/* The visible label on the poster, and the link text in every export. Prefixed
   rather than bare so it reads as an action in the formats where the poster is
   just a still — in a PDF or on an e-ink Kindle "Watch: …" is the only thing
   telling the reader the picture is worth tapping. */
export function videoLinkLabel(title: string): string {
  const clean = (title ?? '').trim();
  return clean ? `Watch: ${clean}` : 'Watch this video';
}
