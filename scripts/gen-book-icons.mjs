/* Generates src/lib/bookIcons.ts — the editor's icon library, pulled from
   Iconify's Lucide (interface icons) and Simple Icons (brand marks) sets.
   Run: node scripts/gen-book-icons.mjs

   Why generate a subset rather than import the Iconify packages at runtime:
   Lucide alone is ~600KB of JSON and Simple Icons far more, all of which would
   land in the client bundle. More importantly the path data has to be available
   SYNCHRONOUSLY inside TipTap's renderHTML — that output is what
   editor.getHTML() serializes into chapterContent and what the EPUB packager
   reads, so an async fetch or a React component cannot sit in that path.

   To add icons, extend the lists below and re-run. Names are Iconify's own:
   https://icon-sets.iconify.design/lucide/ and /simple-icons/ */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lucide = require('@iconify-json/lucide/icons.json');
const brands = require('@iconify-json/simple-icons/icons.json');
const { getIconData, iconToSVG } = require('@iconify/utils');

/* The Elements > Icons library. `category` becomes the tile group's `sub`, so
   these are ordered by category and stay that way — InsertPanel takes runs of
   equal `sub` in array order rather than gathering them by name. */
const LIBRARY = [
  ['check', 'Check', 'Marks'], ['circle-check', 'Check circle', 'Marks'],
  ['x', 'Cross', 'Marks'], ['info', 'Info', 'Marks'],
  ['circle-alert', 'Warning', 'Marks'], ['circle-help', 'Question', 'Marks'],
  ['star', 'Star', 'Marks'], ['heart', 'Heart', 'Marks'],
  ['bookmark', 'Bookmark', 'Marks'], ['flag', 'Flag', 'Marks'],
  ['quote', 'Quote', 'Marks'], ['thumbs-up', 'Thumbs up', 'Marks'],

  ['briefcase', 'Briefcase', 'Business'], ['target', 'Target', 'Business'],
  ['trending-up', 'Trending up', 'Business'], ['chart-column', 'Chart', 'Business'],
  ['lightbulb', 'Idea', 'Business'], ['rocket', 'Rocket', 'Business'],
  ['trophy', 'Trophy', 'Business'], ['handshake', 'Handshake', 'Business'],
  ['presentation', 'Presentation', 'Business'], ['zap', 'Energy', 'Business'],

  ['shopping-cart', 'Cart', 'Money'], ['credit-card', 'Card', 'Money'],
  ['dollar-sign', 'Dollar', 'Money'], ['tag', 'Tag', 'Money'],
  ['gift', 'Gift', 'Money'], ['wallet', 'Wallet', 'Money'],
  ['piggy-bank', 'Savings', 'Money'],

  ['mail', 'Email', 'Contact'], ['phone', 'Phone', 'Contact'],
  ['message-circle', 'Message', 'Contact'], ['send', 'Send', 'Contact'],
  ['at-sign', 'At sign', 'Contact'], ['globe', 'Website', 'Contact'],
  ['map-pin', 'Location', 'Contact'],

  ['calendar', 'Calendar', 'Time'], ['clock', 'Clock', 'Time'],
  ['timer', 'Timer', 'Time'], ['hourglass', 'Hourglass', 'Time'],
  ['alarm-clock', 'Alarm', 'Time'],

  ['book-open', 'Book', 'Documents'], ['file-text', 'Document', 'Documents'],
  ['folder', 'Folder', 'Documents'], ['clipboard', 'Clipboard', 'Documents'],
  ['notebook-pen', 'Notebook', 'Documents'], ['printer', 'Printer', 'Documents'],
  ['paperclip', 'Attachment', 'Documents'],

  ['user', 'Person', 'People'], ['users', 'Group', 'People'],
  ['user-plus', 'Add person', 'People'], ['graduation-cap', 'Student', 'People'],

  ['play', 'Play', 'Media'], ['camera', 'Camera', 'Media'],
  ['image', 'Picture', 'Media'], ['music', 'Music', 'Media'],
  ['video', 'Video', 'Media'], ['mic', 'Microphone', 'Media'],
  ['headphones', 'Headphones', 'Media'],

  ['sun', 'Sun', 'Nature'], ['moon', 'Moon', 'Nature'],
  ['cloud', 'Cloud', 'Nature'], ['leaf', 'Leaf', 'Nature'],
  ['flame', 'Flame', 'Nature'], ['droplet', 'Water', 'Nature'],

  ['settings', 'Settings', 'Tools'], ['wrench', 'Wrench', 'Tools'],
  ['key', 'Key', 'Tools'], ['lock', 'Lock', 'Tools'],
  ['search', 'Search', 'Tools'], ['pencil', 'Pencil', 'Tools'],
  ['trash-2', 'Delete', 'Tools'], ['download', 'Download', 'Tools'],
  ['upload', 'Upload', 'Tools'], ['link', 'Link', 'Tools'],
  ['external-link', 'External link', 'Tools'], ['arrow-right', 'Arrow', 'Tools'],
  ['house', 'Home', 'Tools'], ['shield', 'Shield', 'Tools'],
];

/* The button inspector's own short list — actions a CTA plausibly performs.
   Names must exist in LIBRARY above; a button icon is a reinforcement of the
   label, not a library to browse, so this stays small. */
const BUTTON_ICONS = [
  'arrow-right', 'external-link', 'download', 'play',
  'shopping-cart', 'mail', 'calendar', 'book-open',
];

/* Brand marks for the social row. Simple Icons rather than Lucide: Lucide
   removed its brand glyphs, and a hand-drawn approximation of someone's logo is
   both wrong and a trademark problem. `url` turns a handle into a profile link;
   {h} is the handle with any leading @ or slash already stripped. */
const SOCIAL = [
  ['x', 'X', 'https://x.com/{h}', 'brand'],
  ['instagram', 'Instagram', 'https://instagram.com/{h}', 'brand'],
  ['linkedin', 'LinkedIn', 'https://linkedin.com/in/{h}', 'brand'],
  ['facebook', 'Facebook', 'https://facebook.com/{h}', 'brand'],
  ['youtube', 'YouTube', 'https://youtube.com/@{h}', 'brand'],
  ['tiktok', 'TikTok', 'https://tiktok.com/@{h}', 'brand'],
  ['substack', 'Substack', 'https://{h}.substack.com', 'brand'],
  // The last two are interface icons, not brands — a personal site and an
  // address have no logo, and Lucide's own glyphs are the right mark for them.
  ['globe', 'Website', '{h}', 'lucide'],
  ['mail', 'Email', 'mailto:{h}', 'lucide'],
];

/* Lucide bodies are raw SVG strings — `<path .../>`, sometimes wrapped in a `<g>`
   carrying shared stroke attributes; Simple Icons are a single filled `<path>`.
   TipTap's renderHTML wants a DOM *spec* (nested arrays), not a string, so each
   body is parsed into a flat list of primitives here, once, at generation time.
   `<g>` is flattened by merging its attributes into each child, which is safe for
   these sets: the wrapper only ever hoists shared presentation attributes, never
   a transform. Same two-output split ShapeBlock and ChartBlock already use. */
function parseBody(body, name) {
  const attrsOf = (raw) => {
    const out = {};
    for (const m of raw.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) out[m[1]] = m[2];
    return out;
  };
  const nodes = [];
  let shared = {};
  const g = body.match(/^<g([^>]*)>([\s\S]*)<\/g>$/);
  let inner = body;
  if (g) { shared = attrsOf(g[1]); inner = g[2]; }
  for (const m of inner.matchAll(/<([a-zA-Z]+)([^>]*?)\/?>/g)) {
    if (m[1] === 'g') throw new Error('nested <g> in ' + name + ' — parser needs extending');
    nodes.push({ tag: m[1], attrs: { ...shared, ...attrsOf(m[2]) } });
  }
  if (!nodes.length) throw new Error('no drawable primitives parsed from ' + name);
  return nodes;
}

function build(set, name, label, extra) {
  const data = getIconData(set, name);
  if (!data) throw new Error('icon not found: ' + name);
  const rendered = iconToSVG(data, { height: 'none' });
  const viewBox = rendered.attributes.viewBox || ('0 0 ' + (data.width || 24) + ' ' + (data.height || 24));
  return { name, label, ...extra, viewBox, nodes: parseBody(rendered.body.replace(/\s+/g, ' ').trim(), name) };
}

const library = LIBRARY.map(([name, label, category]) => build(lucide, name, label, { category }));
for (const n of BUTTON_ICONS) {
  if (!library.some((i) => i.name === n)) throw new Error('button icon missing from LIBRARY: ' + n);
}
/* Brand marks are keyed `brand:x` so they cannot collide with a Lucide name —
   `x` is a Lucide cross AND the X logo, and one map holds both. */
const social = SOCIAL.map(([name, label, url, source]) => ({
  ...build(source === 'brand' ? brands : lucide, name, label, { url, filled: source === 'brand' }),
  name: source === 'brand' ? 'brand:' + name : name,
}));

const L = [
  '/* GENERATED by scripts/gen-book-icons.mjs — do not edit by hand.',
  "   Sources: Iconify's Lucide (interface icons) and Simple Icons (brand marks),",
  '   both MIT licensed. Re-run the script to change the set. */',
  '',
  'export interface BookIconNode { tag: string; attrs: Record<string, string> }',
  'export interface BookIcon {',
  '  name: string; label: string; viewBox: string; nodes: BookIconNode[];',
  '  /** Elements > Icons sub-group. Absent on the social marks. */',
  '  category?: string;',
  '  /** Profile-URL template for a social mark; {h} is the cleaned handle. */',
  '  url?: string;',
  '  /** Simple Icons are solid shapes; Lucide are open strokes. Decides which',
  '    * attribute the colour is written to. */',
  '  filled?: boolean;',
  '}',
  '',
  '/** The Elements > Icons library. */',
  'export const BOOK_ICONS: readonly BookIcon[] = ' + JSON.stringify(library, null, 2) + ';',
  '',
  '/** Brand marks and the two interface icons the social row offers. */',
  'export const SOCIAL_ICONS: readonly BookIcon[] = ' + JSON.stringify(social, null, 2) + ';',
  '',
  '/** The short list the Button inspector offers, in order. */',
  'export const BUTTON_ICON_NAMES: readonly string[] = ' + JSON.stringify(BUTTON_ICONS) + ';',
  '',
  'export const BOOK_ICONS_BY_NAME: Readonly<Record<string, BookIcon>> =',
  '  Object.fromEntries([...BOOK_ICONS, ...SOCIAL_ICONS].map((i) => [i.name, i]));',
  '',
  'export const BUTTON_ICONS: readonly BookIcon[] =',
  '  BUTTON_ICON_NAMES.map((n) => BOOK_ICONS_BY_NAME[n]).filter(Boolean);',
  '',
  '/* Lucide draws with stroke="currentColor" and Simple Icons fill with it.',
  '   Resolving that to a literal hex rather than letting it inherit: currentColor',
  "   is fine in browsers and modern EPUB readers, but Kindle's KF8 renderer is",
  '   inconsistent with it, and an icon that silently falls back to black on a dark',
  '   button is invisible. */',
  'function resolved(icon: BookIcon, color: string): BookIconNode[] {',
  '  return icon.nodes.map((n) => ({',
  '    tag: n.tag,',
  '    attrs: Object.fromEntries(Object.entries(n.attrs).map(([k, v]) => [k, v === "currentColor" ? color : v])),',
  '  }));',
  '}',
  '',
  '/* Simple Icons ship no fill attribute at all — they are solid paths that inherit',
  '   the text colour, so without this they paint black whatever the author picked. */',
  'function paint(icon: BookIcon, nodes: BookIconNode[], color: string): BookIconNode[] {',
  '  if (!icon.filled) return nodes;',
  '  return nodes.map((n) => ({ ...n, attrs: { ...n.attrs, fill: color } }));',
  '}',
  '',
  '/** DOM-spec form, for a TipTap renderHTML output (what getHTML and the exports read). */',
  'export function bookIconSpec(name: string, color: string, size = 16, cls = "book-btn-icon"): unknown[] | null {',
  '  const icon = BOOK_ICONS_BY_NAME[name];',
  '  if (!icon) return null;',
  '  return ["svg", {',
  '    class: cls, viewBox: icon.viewBox, width: String(size), height: String(size),',
  '    "aria-hidden": "true", focusable: "false",',
  '  }, ...paint(icon, resolved(icon, color), color).map((n) => [n.tag, n.attrs])];',
  '}',
  '',
  '/** String form, for a NodeView building its DOM by hand. */',
  'export function bookIconHtml(name: string, color: string, size = 16, cls = "book-btn-icon"): string {',
  '  const icon = BOOK_ICONS_BY_NAME[name];',
  '  if (!icon) return "";',
  '  const body = paint(icon, resolved(icon, color), color)',
  '    .map((n) => "<" + n.tag + " " + Object.entries(n.attrs).map(([k, v]) => k + \'="\' + v + \'"\').join(" ") + "></" + n.tag + ">")',
  '    .join("");',
  '  return "<svg class=\\"" + cls + "\\" viewBox=\\"" + icon.viewBox + "\\" width=\\"" + size + "\\" height=\\"" + size + "\\" aria-hidden=\\"true\\" focusable=\\"false\\">" + body + "</svg>";',
  '}',
  '',
  "/* A handle arrives in every shape: @casper, casper, /casper, or a whole profile",
  "   URL pasted out of the address bar. Reduce all of them to the bare handle, or",
  "   the URL template doubles up — linkedin.com/in/<https://linkedin.com/in/casper>",
  "   was the actual output before this took the last path segment. */",
  'export function cleanHandle(raw: string): string {',
  '  let h = (raw ?? "").trim();',
  '  if (!h) return "";',
  '  h = h.replace(/^https?:\\/\\//i, "").replace(/[?#].*$/, "").replace(/\\/+$/, "");',
  '  // A path means the handle is its last segment (linkedin.com/in/casper).',
  '  if (h.includes("/")) h = h.split("/").filter(Boolean).pop() ?? "";',
  '  // A bare host means a subdomain handle (casper.substack.com).',
  '  else if (h.includes(".")) h = h.split(".")[0];',
  '  return h.replace(/^@+/, "");',
  '}',
  '',
  '/** Profile URL for a social mark, or "" when there is nothing to point at. */',
  'export function socialUrl(name: string, handle: string): string {',
  '  const icon = BOOK_ICONS_BY_NAME[name];',
  '  const raw = (handle ?? "").trim();',
  '  if (!icon?.url || !raw) return "";',
  '  /* Two templates take the value whole rather than as a handle. An address is',
  '     not a path segment — cleanHandle would turn you@example.com into "you@example"',
  '     — and a website is the entire URL by definition. */',
  '  if (icon.url.startsWith("mailto:")) return "mailto:" + raw.replace(/^mailto:/i, "");',
  '  if (icon.url === "{h}") return /^https?:\\/\\//i.test(raw) ? raw : "https://" + raw.replace(/^\\/+/, "");',
  '  const h = cleanHandle(raw);',
  '  return h ? icon.url.replace("{h}", h) : "";',
  '}',
  '',
];

writeFileSync(new URL('../src/lib/bookIcons.ts', import.meta.url), L.join('\n'));
console.log('Wrote src/lib/bookIcons.ts — ' + library.length + ' library icons, ' + social.length + ' social marks.');
