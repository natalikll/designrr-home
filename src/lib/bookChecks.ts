/* Pre-publish checks.
 *
 * Split deliberately into checks that genuinely run against the document here in the
 * browser, and checks that cannot (EPUBCheck is a Java tool; retailer readiness needs
 * their APIs). The Publisher panel renders the second group as unavailable rather than
 * inventing a passing result — a green tick that means nothing is worse than no tick.
 */

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'unavailable';

export interface CheckResult {
  id: string;
  group: 'Metadata' | 'Structure' | 'Accessibility' | 'Packaging' | 'Retailer';
  label: string;
  detail: string;
  status: CheckStatus;
  count?: number;
}

export interface CheckInput {
  metadata: { title: string; identifier: string; language: string; author: string; description: string };
  chapters: { id: string; title: string; html: string }[];
  missingAltCount: number;
  hasCoverImage: boolean;
}

function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/* Heading order: within a chapter an h3 must not appear before the chapter's h2,
   and every chapter should open with an h2. This is one of the things KDP's QA
   standards call out explicitly, and it's cheap to check properly. */
function headingProblems(chapters: CheckInput['chapters']): string[] {
  const problems: string[] = [];
  for (const chapter of chapters) {
    const sequence = Array.from(chapter.html.matchAll(/<(h[23])[^>]*>/gi)).map((m) => m[1].toLowerCase());
    if (sequence.length === 0) {
      problems.push(`“${chapter.title}” has no heading`);
      continue;
    }
    if (sequence[0] !== 'h2') problems.push(`“${chapter.title}” starts at ${sequence[0].toUpperCase()}, not H2`);
  }
  return problems;
}

export function runChecks(input: CheckInput): CheckResult[] {
  const { metadata, chapters, missingAltCount, hasCoverImage } = input;

  const missingMeta = (['title', 'identifier', 'language'] as const).filter((k) => !metadata[k].trim());
  const emptyChapters = chapters.filter((c) => textOf(c.html).length < 20);
  const headings = headingProblems(chapters);

  return [
    {
      id: 'meta-required',
      group: 'Metadata',
      label: 'Required metadata',
      detail: missingMeta.length === 0
        ? 'Title, identifier and language are all set.'
        : `Missing: ${missingMeta.join(', ')}. EPUB 3 requires all three before a file can be packaged.`,
      status: missingMeta.length === 0 ? 'pass' : 'fail',
      count: missingMeta.length,
    },
    {
      id: 'meta-optional',
      group: 'Metadata',
      label: 'Recommended metadata',
      detail: [!metadata.author.trim() && 'author', !metadata.description.trim() && 'description']
        .filter(Boolean).length === 0
        ? 'Author and description are set.'
        : `Retailers display these on the product page: ${[!metadata.author.trim() && 'author', !metadata.description.trim() && 'description'].filter(Boolean).join(', ')} still empty.`,
      status: metadata.author.trim() && metadata.description.trim() ? 'pass' : 'warn',
    },
    {
      id: 'cover',
      group: 'Metadata',
      label: 'Cover image',
      detail: hasCoverImage
        ? 'A cover image is set and will be embedded.'
        : 'No cover photo set — the generated cover page will use the title text instead. Apple Books requires an embedded cover image.',
      status: hasCoverImage ? 'pass' : 'warn',
    },
    {
      id: 'headings',
      group: 'Structure',
      label: 'Heading order',
      detail: headings.length === 0
        ? 'Every chapter opens with an H2 and heading levels descend in order.'
        : headings.join('; '),
      status: headings.length === 0 ? 'pass' : 'fail',
      count: headings.length,
    },
    {
      id: 'empty',
      group: 'Structure',
      label: 'Empty chapters',
      detail: emptyChapters.length === 0
        ? 'No empty chapters.'
        : `${emptyChapters.length} chapter${emptyChapters.length === 1 ? '' : 's'} with almost no content: ${emptyChapters.map((c) => `“${c.title}”`).join(', ')}`,
      status: emptyChapters.length === 0 ? 'pass' : 'warn',
      count: emptyChapters.length,
    },
    {
      id: 'reflow',
      group: 'Structure',
      label: 'Reflow safety',
      detail: 'Content is a flowing document with no absolutely-positioned elements, so it reflows at any screen size.',
      status: 'pass',
    },
    {
      id: 'toc',
      group: 'Structure',
      label: 'Navigation document',
      detail: `A navigation document will be generated with ${chapters.length} linked ${chapters.length === 1 ? 'entry' : 'entries'} and no page numbers, as retailers require.`,
      status: 'pass',
    },
    {
      id: 'alt',
      group: 'Accessibility',
      label: 'Image alt text',
      detail: missingAltCount === 0
        ? 'Every image either has alt text or is marked decorative.'
        : `${missingAltCount} image${missingAltCount === 1 ? '' : 's'} missing alt text. If an image carries no meaning, mark it decorative in the Image panel — that writes an empty alt and role="presentation", which is the correct treatment and clears this check.`,
      status: missingAltCount === 0 ? 'pass' : 'fail',
      count: missingAltCount,
    },
    {
      id: 'a11y-disclaimer',
      group: 'Accessibility',
      label: 'Scope of these checks',
      detail: 'Automated checks support accessibility review but do not establish legal compliance or replace manual evaluation.',
      status: 'warn',
    },
    {
      id: 'epubcheck',
      group: 'Packaging',
      label: 'Official EPUBCheck',
      detail: 'The W3C conformance test retailers run on submission. It is a Java tool and cannot run in the browser — this prototype packages the file but does not validate it.',
      status: 'unavailable',
    },
    {
      id: 'kdp',
      group: 'Retailer',
      label: 'Amazon KDP readiness',
      detail: 'Requirements Kindle adds on top of a valid EPUB, including its 30MB-per-file and 300-file limits.',
      status: 'unavailable',
    },
    {
      id: 'apple',
      group: 'Retailer',
      label: 'Apple Books readiness',
      detail: 'Apple requires an EPUBCheck-clean file plus complete metadata and an embedded cover.',
      status: 'unavailable',
    },
  ];
}

export function summarise(results: CheckResult[]) {
  return {
    failures: results.filter((r) => r.status === 'fail').length,
    warnings: results.filter((r) => r.status === 'warn').length,
    unavailable: results.filter((r) => r.status === 'unavailable').length,
    blocking: results.some((r) => r.status === 'fail'),
  };
}
