/* Generates src/lib/bookIcons.ts — the editor's icon library.
   Run: npm i --no-save @fortawesome/pro-solid-svg-icons @fortawesome/pro-regular-svg-icons
        node scripts/gen-book-icons.mjs

   Sources: FontAwesome Pro (the interface icons, in two styles) and Iconify's
   Simple Icons (brand marks, MIT).

   Why FontAwesome for the interface set: it is the only one of the libraries
   considered that ships the SAME icon drawn solid and drawn hollow, which is
   what lets Elements > Icons carry the Solid/Outline switch Shapes already has.
   Lucide, which this set used to come from, is a Feather fork — stroke-only,
   with no filled variant anywhere in it, so the switch could not be built on it
   at all. Phosphor and Material Symbols both have the two styles too; FA won on
   coverage (4,805 icons per style against Phosphor's ~1,500), on having a
   licence this team already holds, and on drawing solid and regular on the same
   grid so a switch between them doesn't move the mark.

   --no-save, deliberately: the pro packages live behind FontAwesome's private
   registry and need a licence token in ~/.npmrc to install. In package.json they
   would be an install every deploy has to authenticate for, and Vercel doesn't
   have the token — so they are fetched ad hoc for a regeneration and the
   generated file, which is self-contained, is what ships. Set the token once
   with:
     npm config set "@fortawesome:registry" https://npm.fontawesome.com/
     npm config set "//npm.fontawesome.com/:_authToken" <token>

   Why generate a subset rather than import at runtime: the two pro packages are
   ~10MB of path data, all of which would land in the client bundle. More
   importantly the path data has to be available SYNCHRONOUSLY inside TipTap's
   renderHTML — that output is what editor.getHTML() serializes into
   chapterContent and what the EPUB packager reads, so an async fetch or a React
   component cannot sit in that path.

   To add icons, extend the lists below and re-run. The left-hand name is OURS
   and is what ends up in book markup as data-name; FA_SOURCE maps it to the
   FontAwesome icon it's drawn from, so an icon can be redrawn from a different
   source without invalidating a single saved book. Brand names are Iconify's:
   https://icon-sets.iconify.design/simple-icons/ */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const brands = require('@iconify-json/simple-icons/icons.json');
const { getIconData, iconToSVG } = require('@iconify/utils');
const FA = {
  solid: require('@fortawesome/pro-solid-svg-icons'),
  outline: require('@fortawesome/pro-regular-svg-icons'),
};

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

/* Our stable name → the FontAwesome icon it is drawn from. Kept as a separate
   map rather than by naming the entries after FA: a name in this file is written
   into every book that uses the icon (data-name="zap"), so it has to outlive the
   library it happens to be drawn from this year. Renaming 'zap' to 'bolt' when
   the source changed would have silently blanked every icon already placed.
   Where the two libraries disagree about what a thing is called, the left-hand
   name is the one this editor already shipped. */
const FA_SOURCE = {
  check: 'check', 'circle-check': 'circle-check', x: 'xmark', info: 'circle-info',
  'circle-alert': 'circle-exclamation', 'circle-help': 'circle-question',
  star: 'star', heart: 'heart', bookmark: 'bookmark', flag: 'flag',
  quote: 'quote-left', 'thumbs-up': 'thumbs-up',
  briefcase: 'briefcase', target: 'bullseye-arrow', 'trending-up': 'arrow-trend-up',
  'chart-column': 'chart-column', lightbulb: 'lightbulb', rocket: 'rocket',
  trophy: 'trophy', handshake: 'handshake', presentation: 'presentation-screen', zap: 'bolt',
  'shopping-cart': 'cart-shopping', 'credit-card': 'credit-card', 'dollar-sign': 'dollar-sign',
  tag: 'tag', gift: 'gift', wallet: 'wallet', 'piggy-bank': 'piggy-bank',
  mail: 'envelope', phone: 'phone', 'message-circle': 'comment', send: 'paper-plane',
  'at-sign': 'at', globe: 'globe', 'map-pin': 'location-dot',
  calendar: 'calendar', clock: 'clock', timer: 'stopwatch', hourglass: 'hourglass',
  'alarm-clock': 'alarm-clock',
  'book-open': 'book-open', 'file-text': 'file-lines', folder: 'folder',
  clipboard: 'clipboard', 'notebook-pen': 'notebook', printer: 'print', paperclip: 'paperclip',
  user: 'user', users: 'users', 'user-plus': 'user-plus', 'graduation-cap': 'graduation-cap',
  play: 'play', camera: 'camera', image: 'image', music: 'music', video: 'video',
  mic: 'microphone', headphones: 'headphones',
  sun: 'sun', moon: 'moon', cloud: 'cloud', leaf: 'leaf', flame: 'fire', droplet: 'droplet',
  settings: 'gear', wrench: 'wrench', key: 'key', lock: 'lock', search: 'magnifying-glass',
  pencil: 'pencil', 'trash-2': 'trash', download: 'download', upload: 'upload',
  link: 'link', 'external-link': 'arrow-up-right-from-square', 'arrow-right': 'arrow-right',
  house: 'house', shield: 'shield',
};

/* The button inspector's own short list — actions a CTA plausibly performs.
   Names must exist in LIBRARY above; a button icon is a reinforcement of the
   label, not a library to browse, so this stays small. */
const BUTTON_ICONS = [
  'arrow-right', 'external-link', 'download', 'play',
  'shopping-cart', 'mail', 'calendar', 'book-open',
];

/* Brand marks for the social row. Simple Icons rather than FontAwesome's own
   brand set: Simple Icons is the canonical source, tracks rebrands faster, and
   these seven marks are already correct and already in every saved social block.
   A logo is also the one thing in this file with no outline variant to want —
   half of X's mark is not X's mark. `url` turns a handle into a profile link;
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
  // address have no logo, so they take the library's own glyphs.
  ['globe', 'Website', '{h}', 'lucide'],
  ['mail', 'Email', 'mailto:{h}', 'lucide'],
];

/* Simple Icons are a single filled `<path>`; occasionally a set wraps its body
   in a `<g>` carrying shared presentation attributes. TipTap's renderHTML wants
   a DOM *spec* (nested arrays), not a string, so each body is parsed into a flat
   list of primitives here, once, at generation time. `<g>` is flattened by
   merging its attributes into each child, which is safe for this set: the
   wrapper only ever hoists shared presentation attributes, never a transform.
   Same two-output split ShapeBlock and ChartBlock already use. */
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

const faName = (kebab) => 'fa' + kebab.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('');

function faIcon(style, ours) {
  const src = FA_SOURCE[ours];
  if (!src) throw new Error('no FontAwesome source mapped for: ' + ours);
  const def = FA[style][faName(src)];
  if (!def) throw new Error('FontAwesome ' + style + ' has no icon "' + src + '" (for ' + ours + ')');
  const [w, h, , , d] = def.icon;
  if (typeof d !== 'string') throw new Error(src + ' is multi-path (duotone?), which this generator does not handle');
  return { w, h, d };
}

/* ── normalising the FontAwesome set ──────────────────────────────────────────
   FA icons are drawn on a 512-tall grid at whatever width each one needs — an
   arrow is 512x512, a star 576x512 — and FA 7 additionally shifts its paths up
   so an inline icon sits on the text baseline, which puts real geometry above
   y=0 and lets a glyph run outside the box it declares. Dropped into this
   editor unchanged that produces two visible faults: the marks clip at the top
   in any container that isn't overflow-visible, and a row of them is optically
   all over the place, because a glyph's size within its own box varies by icon.

   So every icon is remeasured and re-boxed: the true ink bounds are found, then
   a transform on the path centres them in a 24-unit square with the longer side
   at LIVE_AREA. That is the same 24 box the brand marks already use, so one
   viewBox serves the whole file, and it is measured per STYLE — solid and
   outline of the same icon are separately drawn shapes and their ink bounds do
   not match to the unit.

   Bounds are read off a raster rather than from getBBox or the path text.
   getBBox is control-point inclusive in some engines (Chrome reports the star
   at 525 units tall in a 512 box), and a text parse of the path would have to
   solve curve extrema to do better. Filling the path into a canvas and scanning
   the alpha channel is exact to a fraction of a unit and cannot be wrong about
   what is actually drawn. */
const LIVE_AREA = 20;
const ICON_BOX = 24;

async function measure(paths) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<canvas id="c" width="400" height="400"></canvas>');
  const out = [];
  for (const it of paths) {
    out.push(await page.evaluate(({ d, w, h }) => {
      // The margin has to clear FA's baseline shift in both directions, or a
      // glyph that runs past its box is measured as if it stopped at the edge.
      const M = 96;
      const S = 400;
      const k = S / Math.max(w + M * 2, h + M * 2);
      const ctx = document.getElementById('c').getContext('2d');
      ctx.clearRect(0, 0, S, S);
      ctx.save();
      ctx.scale(k, k);
      ctx.translate(M, M);
      // evenodd, which is how a browser fills an FA path: a nonzero fill closes
      // up the counters (the hole in a regular-style star) and would measure
      // some icons a few units wide at the wrong edge.
      ctx.fill(new Path2D(d), 'evenodd');
      ctx.restore();
      const px = ctx.getImageData(0, 0, S, S).data;
      let x0 = S, y0 = S, x1 = -1, y1 = -1;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          // Above a low alpha rather than above zero: the edge of a filled shape
          // is antialiased, and counting a 2% pixel puts the bounds half a pixel
          // out on every side.
          if (px[(y * S + x) * 4 + 3] > 8) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) return null;
      const u = (v) => v / k - M;
      return { x: u(x0), y: u(y0), w: u(x1 + 1) - u(x0), h: u(y1 + 1) - u(y0) };
    }, it));
  }
  await browser.close();
  return out;
}

function boxTransform(box) {
  const s = LIVE_AREA / Math.max(box.w, box.h);
  const r = (n) => Math.round(n * 1000) / 1000;
  return `translate(${r((ICON_BOX - box.w * s) / 2 - box.x * s)} ${r((ICON_BOX - box.h * s) / 2 - box.y * s)}) scale(${r(s)})`;
}

function brandIcon(name, label, extra) {
  const data = getIconData(brands, name);
  if (!data) throw new Error('brand icon not found: ' + name);
  const rendered = iconToSVG(data, { height: 'none' });
  const viewBox = rendered.attributes.viewBox || ('0 0 ' + (data.width || 24) + ' ' + (data.height || 24));
  const nodes = parseBody(rendered.body.replace(/\s+/g, ' ').trim(), name);
  /* Simple Icons ship no fill attribute at all — they are solid paths that
     inherit the text colour, so without this they paint black whatever the
     author picked. Written in as currentColor here so every node in the file
     declares its colour the same way and `resolved` has one thing to swap. */
  return { name, label, ...extra, viewBox, nodes: nodes.map((n) => ({ ...n, attrs: { fill: 'currentColor', ...n.attrs } })) };
}

/* Every FA path this run needs, measured in one browser session — 160-odd
   rasterisations in one page rather than one launch apiece. */
const wanted = [];
for (const [name] of LIBRARY) for (const style of ['solid', 'outline']) wanted.push({ name, style, ...faIcon(style, name) });
for (const [name, , , source] of SOCIAL) {
  if (source === 'brand') continue;
  for (const style of ['solid', 'outline']) wanted.push({ name, style, ...faIcon(style, name) });
}
const boxes = await measure(wanted);
const drawn = new Map();
wanted.forEach((it, i) => {
  const box = boxes[i];
  if (!box) throw new Error('nothing rendered for ' + it.name + ' (' + it.style + ')');
  drawn.set(it.name + ':' + it.style, [{ tag: 'path', attrs: { fill: 'currentColor', transform: boxTransform(box), d: it.d } }]);
});

const faBuilt = (name, label, extra) => ({
  name, label, ...extra,
  viewBox: '0 0 ' + ICON_BOX + ' ' + ICON_BOX,
  nodes: drawn.get(name + ':solid'),
  outlineNodes: drawn.get(name + ':outline'),
});

const library = LIBRARY.map(([name, label, category]) => faBuilt(name, label, { category }));
for (const n of BUTTON_ICONS) {
  if (!library.some((i) => i.name === n)) throw new Error('button icon missing from LIBRARY: ' + n);
}
/* Brand marks are keyed `brand:x` so they cannot collide with a library name —
   `x` is a cross AND the X logo, and one map holds both. */
const social = SOCIAL.map(([name, label, url, source]) => (source === 'brand'
  ? brandIcon(name, label, { url, name: 'brand:' + name })
  : faBuilt(name, label, { url })));

const L = [
  '/* GENERATED by scripts/gen-book-icons.mjs — do not edit by hand.',
  '   Sources: FontAwesome Pro (interface icons, solid + regular) under this',
  "   team's licence, and Iconify's Simple Icons (brand marks, MIT).",
  '   Every icon is re-boxed into a 24-unit square at generation time — see the',
  '   script for why the FontAwesome geometry cannot be used as it ships.',
  '   Re-run the script to change the set. */',
  '',
  'export interface BookIconNode { tag: string; attrs: Record<string, string> }',
  '/** Solid is the default everywhere; outline is the same mark drawn hollow. */',
  "export type BookIconStyle = 'solid' | 'outline';",
  'export interface BookIcon {',
  '  name: string; label: string; viewBox: string; nodes: BookIconNode[];',
  '  /** The hollow cut of the same icon. Absent on the brand marks, which have',
  '    * no outline form worth drawing — half a logo is not the logo. */',
  '  outlineNodes?: BookIconNode[];',
  '  /** Elements > Icons sub-group. Absent on the social marks. */',
  '  category?: string;',
  '  /** Profile-URL template for a social mark; {h} is the cleaned handle. */',
  '  url?: string;',
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
  '/* Falls back to the solid cut rather than drawing nothing: a brand mark has no',
  '   outline form, and it can still be asked for one. */',
  'function cut(icon: BookIcon, style: BookIconStyle): BookIconNode[] {',
  '  return style === "outline" && icon.outlineNodes ? icon.outlineNodes : icon.nodes;',
  '}',
  '',
  '/* Every node in this file declares fill="currentColor". Resolving that to a',
  '   literal hex rather than letting it inherit: currentColor is fine in browsers',
  "   and modern EPUB readers, but Kindle's KF8 renderer is inconsistent with it,",
  '   and an icon that silently falls back to black on a dark button is invisible. */',
  'function resolved(icon: BookIcon, color: string, style: BookIconStyle): BookIconNode[] {',
  '  return cut(icon, style).map((n) => ({',
  '    tag: n.tag,',
  '    attrs: Object.fromEntries(Object.entries(n.attrs).map(([k, v]) => [k, v === "currentColor" ? color : v])),',
  '  }));',
  '}',
  '',
  '/** DOM-spec form, for a TipTap renderHTML output (what getHTML and the exports read). */',
  'export function bookIconSpec(name: string, color: string, size = 16, cls = "book-btn-icon", style: BookIconStyle = "solid"): unknown[] | null {',
  '  const icon = BOOK_ICONS_BY_NAME[name];',
  '  if (!icon) return null;',
  '  return ["svg", {',
  '    class: cls, viewBox: icon.viewBox, width: String(size), height: String(size),',
  '    "aria-hidden": "true", focusable: "false",',
  '  }, ...resolved(icon, color, style).map((n) => [n.tag, n.attrs])];',
  '}',
  '',
  '/** String form, for a NodeView building its DOM by hand. */',
  'export function bookIconHtml(name: string, color: string, size = 16, cls = "book-btn-icon", style: BookIconStyle = "solid"): string {',
  '  const icon = BOOK_ICONS_BY_NAME[name];',
  '  if (!icon) return "";',
  '  const body = resolved(icon, color, style)',
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
