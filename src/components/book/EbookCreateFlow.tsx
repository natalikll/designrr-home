'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useFlowStore, PLAN_LABELS, ownsPlan, type PlanId } from '@/stores/flowStore';
import { usePresentationFlowStore } from '@/stores/presentationFlowStore';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';
import { UpgradePlanModal } from '../account/MyAccountView';
import { TierBadge, shouldShowTierBadge, type GateTier } from '../ui/TierBadge';
import { track } from '@/lib/analytics';
import { SortDropdown } from '../ui/SortDropdown';
import { getMockBook, getMockOutline, getMockDirections } from '@/lib/mockResponses';
import type { GeneratedBook } from '@/lib/types';
import {
  PUBLISH_FORMATS, PublishFormatList, PublishStatsRow, PublishedPanel,
} from './publishFormats';
import {
  BOOK_TEMPLATES, BOOK_STORAGE_KEY, buildBookSeed, composeBookSeed,
  BookTemplateCover, BookPagePreview, templateGeometry,
  type BookTemplate, type SeedChapter,
} from './BookEditorView';

/* ── constants ──────────────────────────────────────────────────────────────── */

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

const WIZARD_STEPS = ['Generate', 'Write content', 'Choose template', 'Review', 'Publish'];

/* One theme vocabulary, taken from the live product. It was previously two — a bespoke list in
   the modal and a different one in the gallery filter — which meant a theme picked here could
   not be unpicked there, and the gallery's own options matched no template at all. */
const ALL_THEMES = [
  { emoji: '⚡', label: 'Self Development' },
  { emoji: '📚', label: 'Education' },
  { emoji: '🥑', label: 'Health & wellness' },
  { emoji: '💼', label: 'Business' },
  { emoji: '💡', label: 'Digital Marketing' },
  { emoji: '⚡', label: 'Spiritual Self Development' },
  { emoji: '💡', label: 'Life coaching' },
  { emoji: '🏋️', label: 'Training and Development' },
  { emoji: '📝', label: 'Writing Non-Fiction' },
  { emoji: '🎁', label: 'Business Development / Sales' },
  { emoji: '✍️', label: 'Author' },
  { emoji: '🔥', label: 'Other' },
  { emoji: '💻', label: 'E-Commerce' },
  { emoji: '👩', label: 'Blogging' },
  { emoji: '👽', label: 'Writing Fiction' },
  { emoji: '⭐', label: 'Advertising' },
  { emoji: '🤝', label: 'Marketing coaching' },
  { emoji: '💬', label: 'Copywriting' },
  { emoji: '🌐', label: 'Network Marketing' },
];

/** The chips the modal surfaces up front; the rest stay reachable through the dropdown. */
const POPULAR_THEMES = ALL_THEMES.slice(0, 15);

const THEME_EMOJI: Record<string, string> = Object.fromEntries(ALL_THEMES.map(t => [t.label, t.emoji]));

/* The templates are the EDITOR's templates — BOOK_TEMPLATES, the same array its
   Templates panel renders and its apply path consumes. This file used to carry
   twelve of its own: flat colour rectangles with the template's NAME set across
   the middle, which existed nowhere else in the product. So "Social Media
   Marketing 2-05" could be chosen here and then not be in the editor at all,
   which opened on Statement Lettering with Statement Lettering lit in the
   gallery — not a stale highlight, the actual template, because the wizard had
   no way to ask for one of the real ones.

   `Template` stays as a local alias so the gallery below reads the same; the
   fields it needs — subjects, createdAt, sortOrder, requiredPlan — now live on
   the template itself (see ThemeDef). */
type Template = BookTemplate;
const TEMPLATES: readonly Template[] = BOOK_TEMPLATES;
const isPro = (t: Template) => !!t.requiredPlan;
const subjectsOf = (t: Template) => t.subjects ?? [];


/* ── the manuscript this wizard is turning into a book ───────────────────────
   The generator wrote it into the flow store two steps back (see getMockBook),
   and this file used to ignore it: a hardcoded title and a single chapter of
   placeholder prose, repeated in three places. That is why an eighteen-page,
   eight-chapter manuscript arrived in the editor as a four-page book whose only
   chapter was called "Introduction" — the wizard never read the manuscript at
   all, so there was nothing for the editor to be missing.

   The fallback covers the one entry with no generation behind it: /book/create
   opened cold, where the store is empty because nothing has run. It builds the
   same demo book the manuscript screen shows rather than a second invented one,
   so the two screens can't disagree about what the author wrote. */
interface Manuscript {
  title: string;
  subtitle: string;
  chapters: SeedChapter[];
}

function paragraphsToHtml(content: string): string {
  return content
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeHtml(para)}</p>`)
    .join('');
}

function toManuscript(book: GeneratedBook): Manuscript {
  return {
    title: book.title,
    subtitle: book.subtitle,
    chapters: book.chapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      html: paragraphsToHtml(ch.content),
    })),
  };
}

const FALLBACK_BOOK = getMockBook(getMockOutline(getMockDirections()[1]));

function useManuscript(): Manuscript {
  const generated = useFlowStore((st) => st.generatedBook);
  return useMemo(() => toManuscript(generated ?? FALLBACK_BOOK), [generated]);
}

/* ── tiny helpers ───────────────────────────────────────────────────────────── */

function CheckMark({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M2.5 7.2L5.2 9.8L11.5 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ChevDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 5.5L7 9l4-3.5" stroke="#52637A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ── stepper header ─────────────────────────────────────────────────────────── */

function WizardHeader({ step, sidebarOpen, onToggleSidebar }: {
  step: number;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  return (
    <div className="flex-shrink-0 bg-white border-b border-[#E0E5EB]" style={{ height: 56 }}>
      <div className="flex items-center h-full" style={{ padding: '0 16px' }}>
        <Tooltip label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'} position="right">
          <button
            onClick={onToggleSidebar}
            className="flex-shrink-0 flex items-center justify-center cursor-pointer rounded-lg hover:bg-[#F6F7F9] transition-colors"
            style={{ width: 36, height: 36 }}
          >
            <SideMenuIcon active={sidebarOpen} />
          </button>
        </Tooltip>

        <div className="flex-1 flex items-center justify-center" style={{ gap: 8 }}>
          {WIZARD_STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
              <div key={label} className="flex items-center" style={{ gap: 8 }}>
                {i > 0 && <div style={{ width: 32, height: 1, background: done || active ? '#006EFE' : '#E0E5EB' }} />}
                <div className="flex items-center" style={{ gap: 6 }}>
                  <div className="flex items-center justify-center flex-shrink-0 rounded-full"
                    style={{ width: 22, height: 22, background: done || active ? '#006EFE' : '#F1F2F4' }}>
                    {done
                      ? <CheckMark />
                      : <span style={{ ...ns, fontSize: 11, fontWeight: 700, color: active ? '#fff' : '#8E99AB' }}>{n}</span>}
                  </div>
                  <span style={{ ...ns, fontSize: 13, fontWeight: active ? 600 : 400, color: active || done ? '#15191F' : '#8E99AB', whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ width: 36 }} />
      </div>
    </div>
  );
}

/* ── Themes modal ───────────────────────────────────────────────────────────── */

function ThemesModal({ docTitle, initial, onSave, onClose }: {
  docTitle: string;
  initial: string[];
  onSave: (t: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(initial);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const toggle = (label: string) =>
    setSelected(prev => prev.includes(label) ? prev.filter(t => t !== label) : [...prev, label]);
  const display = selected.length === 0 ? 'Select your theme' : selected.join(', ');

  const options = ALL_THEMES.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  // The consequence of this step, stated while it can still change the answer. Without it the
  // modal asks for a classification and never says what it buys — so the honest response is to
  // guess or dismiss.
  const matchCount = selected.length === 0
    ? TEMPLATES.length
    : TEMPLATES.filter(t => subjectsOf(t).some(th => selected.includes(th))).length;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(15,23,51,0.3)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white flex flex-col relative"
        style={{ width: 480, borderRadius: 16, boxShadow: '0px 8px 40px rgba(0,0,0,0.16)', padding: '28px 28px 24px' }}
        onClick={e => e.stopPropagation()}
      >
        {/* close */}
        <button onClick={onClose} className="absolute cursor-pointer flex items-center justify-center"
          style={{ top: 16, right: 16, width: 28, height: 28, borderRadius: '50%', background: '#F4F6F9', border: 'none' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <h2 style={{ ...ns, fontSize: 20, fontWeight: 700, color: '#15191F', marginBottom: 5 }}>Themes of the doc</h2>
        <p style={{ ...ns, fontSize: 14, color: '#52637A', lineHeight: 1.5, marginBottom: 6 }}>{docTitle}</p>
        <p style={{ ...ns, fontSize: 13, color: '#8596AD', lineHeight: 1.5, marginBottom: 22 }}>
          Themes decide which templates we show you next. You can change them there too.
        </p>

        <label style={{ ...ns, fontSize: 14, fontWeight: 500, color: '#15191F', display: 'block', marginBottom: 8 }}>
          Select your theme
        </label>
        {/* Was a static div. It looked like the control that held the full vocabulary, so the 15
            chips below read as shortcuts into it — but nothing opened, and the other themes were
            unreachable. */}
        <div className="relative">
          <button onClick={() => setOpen(o => !o)}
            className="flex items-center justify-between cursor-pointer w-full text-left"
            style={{ height: 44, padding: '0 16px', borderRadius: 8, border: `1px solid ${open ? '#006EFE' : '#E0E5EB'}`, background: '#fff' }}>
            <span style={{ ...ns, fontSize: 14, color: selected.length ? '#15191F' : '#8596AD', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 10 }}>{display}</span>
            <ChevDown />
          </button>

          {open && (
            <>
              <div className="fixed inset-0" style={{ zIndex: 20 }} onClick={() => setOpen(false)} />
              <div className="absolute" style={{ top: 50, left: 0, right: 0, zIndex: 30, background: '#fff', borderRadius: 10, border: '1px solid #E0E5EB', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', padding: 12 }}>
                <div className="flex items-center" style={{ gap: 8, height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #E0E5EB', marginBottom: 10 }}>
                  <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><circle cx="8" cy="8" r="5.5" stroke="#8E99AB" strokeWidth="1.5"/><path d="M12.5 12.5L16 16" stroke="#8E99AB" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search themes"
                    style={{ flex: 1, border: 'none', outline: 'none', ...ns, fontSize: 13, color: '#15191F', background: 'transparent' }} />
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {options.length === 0
                    ? <p style={{ ...ns, fontSize: 13, color: '#8596AD', padding: '10px 8px' }}>No themes match “{search}”.</p>
                    : options.map(opt => {
                        const checked = selected.includes(opt.label);
                        return (
                          <button key={opt.label} onClick={() => toggle(opt.label)}
                            className="flex items-center justify-between cursor-pointer w-full text-left"
                            style={{ padding: '9px 8px', background: 'none', border: 'none', borderRadius: 6, ...ns, fontSize: 14, color: '#15191F' }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#F6F7F9'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                            <span className="flex items-center" style={{ gap: 8 }}><span>{opt.emoji}</span>{opt.label}</span>
                            {checked && <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5 6.5-7" stroke="#006EFE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </button>
                        );
                      })}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <p style={{ ...ns, fontSize: 14, fontWeight: 500, color: '#15191F', marginBottom: 14 }}>Most popular themes</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {POPULAR_THEMES.map(t => {
              const sel = selected.includes(t.label);
              return (
                <button key={t.label} onClick={() => toggle(t.label)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 999, border: `1.5px solid ${sel ? '#006EFE' : '#E0E5EB'}`, background: '#fff', cursor: 'pointer', ...ns, fontSize: 14, color: '#15191F', transition: 'border-color 0.12s' }}>
                  <span>{t.emoji}</span><span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between" style={{ gap: 10, marginTop: 24 }}>
          <span style={{ ...ns, fontSize: 13, color: '#52637A' }}>
            {selected.length === 0
              ? `All ${TEMPLATES.length} templates`
              : `${matchCount} of ${TEMPLATES.length} templates match`}
          </span>
          <div className="flex items-center" style={{ gap: 10 }}>
            {/* Skipping is a real answer — an author who doesn't know their theme shouldn't have
                to invent one or back out of the flow to reach the gallery. */}
            <button onClick={() => onSave([])}
              style={{ ...ns, fontSize: 14, fontWeight: 500, color: '#52637A', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' }}>
              Skip
            </button>
            <button onClick={() => onSave(selected)}
              style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#0058CC'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
              Save
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── cover legibility ───────────────────────────────────────────────────────── */

/* A template's real cover, at whatever width the box it lands in gives it.
   Five surfaces draw one — a gallery card, the lightbox page, the lightbox
   thumbnails, the review stage and the review strip — all fluid, so the width is
   MEASURED here rather than passed five times. BookTemplateCover renders a real
   page and scales it, which is why it needs a number and not a percentage.

   What this replaces was a mock: a flex column painting the template's NAME in
   13px Georgia caps between two rules, over a flat fill, with a contrast-walker
   to keep the fake byline legible against the fake background and a fitter to
   stop the fake title overflowing. None of it described any template that
   exists. */
function TemplateCover({ t }: { t: Template }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /* No author text: a card answers "which design do I want", and twelve cards
     carrying the same title answer it worse than twelve designs do — the
     reasoning TemplatesPanel already wrote down for the editor's own gallery.
     Every surface that shows the author's book — the lightbox page, the review
     stage, the published cover — draws the composed book instead, so it is the
     real cover rather than a template wearing a title. */
  return (
    <div ref={ref} style={{ width: '100%', lineHeight: 0 }}>
      {w > 0 && <BookTemplateCover template={t} width={w} />}
    </div>
  );
}

/* The card's stage, as a height rather than a ratio. The sheet inside it is a
   real page now, so its height follows from its width and the page's proportion
   — a stage sized by ratio would set its own height from the column width and
   then crop whatever the sheet turned out to be. So the stage is measured off
   the TALLEST sheet in the gallery plus its margin, asked of the templates
   themselves rather than written down: each one draws on the trim it was made
   for (A4 for the page designs, the default sheet for the rest), and a hardcoded
   proportion here goes stale the day a template ships a new one. */
const CARD_SHEET_W = 172;
const CARD_STAGE_H = Math.max(...BOOK_TEMPLATES.map((t) => {
  const geo = templateGeometry(t);
  return Math.round((geo.h * (CARD_SHEET_W + 1)) / geo.w);
})) + 24;

/* ── template gallery ───────────────────────────────────────────────────────── */

function TemplateCard({ t, onClick }: { t: Template; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const currentPlan = useFlowStore((s) => s.currentPlan);
  // GitLab's rule, already encoded in TierBadge: don't mark a tier the viewer owns. A PRO
  // customer was seeing "Pro" on templates they can already use.
  const showBadge = isPro(t) && shouldShowTierBadge(currentPlan, 'pro');
  // This badge, plus the lightbox's "Unlock with Pro" on a locked template, is the whole upgrade
  // affordance on this screen. The header's "Upgrade to use all Pro templates" link was removed
  // because it was the general-upgrade variant of the same offer, competing with the intent-driven
  // one: a browsing surface's generic CTA, which is the shape that measured worst in the funnel.
  // A locked card the author actually wants states the offer at the moment it means something.
  return (
    <div className="flex flex-col cursor-pointer" style={{ gap: 12 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}>
      {/* The live product's treatment: a landscape grey stage with the cover standing on it as a
          portrait sheet. The card is the stage, not the cover — which is why an earlier pass that
          made the whole card portrait, and the one before it that stretched a fixed-height cover
          across a 1fr column into a landscape block, both read wrong.
          The real gallery lets tall covers bleed past the tile's foot and clips them mid-title.
          Ours sizes the sheet to fit the stage instead: same treatment, without losing the words
          a cover exists to show. */}
      <div className="relative overflow-hidden flex items-center justify-center"
        style={{ height: CARD_STAGE_H, background: '#F4F6F9', borderRadius: 10 }}>
        <div style={{ width: CARD_SHEET_W, borderRadius: 4, overflow: 'hidden', boxShadow: '0 2px 10px rgba(15,23,51,0.16)' }}>
          <TemplateCover t={t} />
        </div>
        {/* Positioned exactly as BookTypeSelector places its badge — the platform's existing
            badge-on-a-card treatment, and the closest analogue to this gallery. 8/8 rather than
            10/10, no shadow, and lineHeight 0 on the wrapper so the inline-flex pill doesn't sit
            on a line box and pick up a descender gap above it, which renders an identical
            top/right offset unequal. An earlier pass here used 10/10 with a drop shadow; the
            shadow was invented for this one surface and the platform doesn't use one. */}
        {showBadge && (
          <div className="absolute" style={{ top: 8, right: 8, lineHeight: 0 }}>
            <TierBadge tier="pro" />
          </div>
        )}
        {hovered && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(15,23,51,0.34)' }}>
            <span style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#fff', background: '#006EFE', borderRadius: 8, padding: '8px 18px' }}>Preview</span>
          </div>
        )}
      </div>
      <p style={{ ...ns, fontSize: 14, fontWeight: 500, color: '#15191F', lineHeight: '19px' }}>{t.name}</p>
    </div>
  );
}

/* Lightbox page geometry. 17/22 is Letter portrait — the Page Size the gallery defaults to. */
const PREVIEW_H = 480;
const PREVIEW_W = Math.round((PREVIEW_H * 17) / 22);   // 371
const THUMB_W = 76;

function TemplateLightbox({ t, allTemplates, selectedThemes, manuscript, onUse, onClose }: {
  t: Template;
  allTemplates: Template[];
  selectedThemes: string[];
  manuscript: Manuscript;
  /* The position is the grid's, not the lightbox's: `allTemplates` is the rendered order, and
     the arrows walk it, so the index here is the slot the author saw the template in. */
  onUse: (template: Template, position: number) => void;
  onClose: () => void;
}) {
  const currentPlan = useFlowStore((st) => st.currentPlan);
  const [idx, setIdx] = useState(allTemplates.findIndex(x => x.id === t.id));
  const current = allTemplates[idx];
  /* Memoised: composing mints a fresh element id for every object on the cover
     (see mergeCoverElements), so doing it per render would burn a batch each
     time the arrows move. */
  const book = useMemo(() => composeBookSeed({ ...manuscript, templateId: current.id }), [manuscript, current.id]);
  const prev = () => setIdx(i => (i - 1 + allTemplates.length) % allTemplates.length);
  const next = () => setIdx(i => (i + 1) % allTemplates.length);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      {/* nav arrows — sit near the viewport edges, outside the modal card, matching the live product */}
      {(['prev', 'next'] as const).map(dir => (
        <button key={dir} onClick={(e) => { e.stopPropagation(); dir === 'prev' ? prev() : next(); }}
          className="fixed flex items-center justify-center cursor-pointer z-10"
          style={{ [dir === 'prev' ? 'left' : 'right']: '4%', top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, borderRadius: '50%', background: '#fff', border: '1px solid #E0E5EB', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2" strokeLinecap="round">
            {dir === 'prev' ? <path d="M15 18l-6-6 6-6"/> : <path d="M9 18l6-6-6-6"/>}
          </svg>
        </button>
      ))}

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white flex overflow-hidden relative"
        style={{ width: '85vw', maxWidth: 1240, maxHeight: '88vh', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Left preview — a page, so height-led with the width derived from the page ratio, on the
            same grey stage the gallery cards use. Filling the panel's full width at a fixed 520
            height turned every cover into a landscape slab: a slide, not a book. 17/22 is Letter
            portrait, matching the Page Size the gallery defaults to. */}
        <div className="flex flex-col flex-1 min-w-0 items-center justify-center" style={{ background: '#F4F6F9', padding: '40px 32px', gap: 18 }}>
          <div style={{ width: PREVIEW_W, borderRadius: 6, overflow: 'hidden', boxShadow: '0 8px 28px rgba(15,23,51,0.20)', flexShrink: 0, lineHeight: 0 }}>
            {/* The composed book's own cover, not the template's sample one —
                the same page the three thumbnails under it show, carrying the
                author's title, subtitle and byline. */}
            <BookPagePreview book={book} page={book.pages[0]} width={PREVIEW_W} />
          </div>

          {/* The book's own first pages in this template — cover, contents, first
              chapter — not three bar-and-line drawings of a page. They were
              drawings because this screen had no book to draw: the manuscript
              never reached it. */}
          <div className="flex flex-shrink-0" style={{ gap: 10 }}>
            {book.pages.slice(0, 3).map((pg, i) => (
              <div key={pg.id} style={{ width: THUMB_W, borderRadius: 4, overflow: 'hidden', border: i === 0 ? '2px solid #006EFE' : '1px solid #E0E5EB', background: '#fff', lineHeight: 0 }}>
                <BookPagePreview book={book} page={pg} width={THUMB_W - (i === 0 ? 4 : 2)} />
              </div>
            ))}
          </div>
        </div>

        {/* right info */}
        <div className="flex flex-col" style={{ width: 380, padding: '40px 40px', flexShrink: 0 }}>
          <button onClick={onClose} className="absolute cursor-pointer flex items-center justify-center"
            style={{ top: 24, right: 24, width: 28, height: 28, borderRadius: '50%', background: '#F4F6F9', border: 'none' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          {/* Name first, badge after it — the same badge the card in the gallery shows, at the
              same default size. A template must not change its mark between the grid and the
              preview of that grid item; an author picks a card by its badge and then has to
              recognise it here. This deliberately drops two earlier one-offs — the `size="lg"`
              variant, and a green sentence carrying an offer in prose while the badge said "Pro".
              The gold star in a black tile that used to lead this row is long gone for the same
              reason: it named no plan. */}
          <div className="flex items-center" style={{ gap: 10, marginBottom: 12 }}>
            <h3 style={{ ...ns, fontSize: 20, fontWeight: 700, color: '#15191F' }}>{current.name}</h3>
            {isPro(current) && shouldShowTierBadge(currentPlan, 'pro') && (
              <span style={{ lineHeight: 0, flexShrink: 0 }}>
                <TierBadge tier="pro" />
              </span>
            )}
          </div>

          <p style={{ ...ns, fontSize: 13, color: '#52637A', lineHeight: 1.6, marginBottom: 20 }}>
            You&apos;ll be able to play with the template &amp; change covers inside the editor
          </p>

          {/* The themes this template is tagged with — the same vocabulary the author just picked
              from, so a card's presence in the results is explainable rather than arbitrary.
              Read-only: this states why the template surfaced, it isn't a second filter control. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
            {subjectsOf(current).map(th => {
              const matched = selectedThemes.includes(th);
              return (
                <span key={th} className="flex items-center"
                  style={{ gap: 6, padding: '6px 12px', borderRadius: 999, border: `1px solid ${matched ? '#006EFE' : '#E0E5EB'}`, background: matched ? '#F4F8FF' : '#fff', ...ns, fontSize: 13, color: '#15191F', whiteSpace: 'nowrap' }}>
                  <span>{THEME_EMOJI[th] ?? '🔥'}</span>{th}
                </span>
              );
            })}
          </div>

          <button onClick={() => onUse(current, idx + 1)}
            style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 8, padding: '11px 0', cursor: 'pointer', width: '100%', marginBottom: 10 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0058CC'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
            {isPro(current) ? 'Unlock with Pro' : 'Use this template'}
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            {(['Preview in web', 'Preview in PDF'] as const).map(label => (
              <button key={label} style={{ ...ns, fontSize: 12, fontWeight: 500, color: '#52637A', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '9px 0', cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  {label.includes('web')
                    ? <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>
                    : <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><path d="M14 2v6h6"/></>}
                </svg>
                {label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* Type used to read "All, Standard, Two Column, User, Asian, Cyrillic, RTL, Pro" — several
   unrelated questions in one list, where answering one silently cleared the others, and only two
   of the answers matched any template. What's left is the one distinction the grid can actually
   draw. Standard rather than Free because that is the product's own word for the tier: the live
   gallery heads its two sections "Pro templates" and "Standard templates". */
const TYPE_OPTIONS = ['All', 'Standard', 'Pro'] as const;
type TypeFilter = typeof TYPE_OPTIONS[number];
const PAGE_SIZE_OPTIONS = ['Letter', 'A4', 'A5', '6x9', 'Legal', 'A3', 'Square'];
const ORIENTATION_OPTIONS = ['Portrait', 'Landscape'];
const THEME_OPTIONS = ALL_THEMES;

/* ── sorting ────────────────────────────────────────────────────────────────── */

type SortId = 'recommended' | 'popular' | 'newest';

const SORT_KEY = 'dsgn_template_sort';

/* Most popular ranks templates by how many books were created from each in the last 60 days.
   Nothing records that yet — `template_selected` and `template_published`, added in this change,
   are the first events that could, and they need 60 days of history behind them before the
   ranking means anything. Until then the option is hidden rather than shown sorting by a
   stand-in: a "Most popular" order built from something other than popularity is worse than no
   option at all. Flip this to true once the counts are queryable and give POPULARITY a real
   source. */
const POPULARITY_DATA_AVAILABLE = false;
const POPULARITY: Record<string, number> = {};

/* Sentence case, like the two beside it and like the rest of the product's copy. */
const SORT_OPTIONS: { id: SortId; label: string }[] = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'newest', label: 'Newest' },
  { id: 'popular', label: 'Most popular' },
].filter(o => o.id !== 'popular' || POPULARITY_DATA_AVAILABLE) as { id: SortId; label: string }[];

/* A template with no sortOrder ranks after every template that has one, rather than at 0. */
const rank = (t: Template) => t.sortOrder ?? Number.MAX_SAFE_INTEGER;
const byRank = (a: Template, b: Template) => rank(a) - rank(b);

/* Recommended, on an account that cannot use Pro templates.
 *
 * Free and Pro are ranked separately and then woven together on a fixed cycle, so the grid opens
 * on something the author can actually use and keeps handing them one every other slot or two,
 * while Pro work still gets seen high up rather than exiled to the bottom. Three of every five
 * positions are free, and position 1 always is. When one list runs dry the other simply
 * continues, so the tail is whatever is left rather than a run of blanks. */
const FREE_WEAVE: ('free' | 'pro')[] = ['free', 'pro', 'free', 'free', 'pro'];

function weaveForFreePlan(list: readonly Template[]): Template[] {
  const free = list.filter(t => !isPro(t)).sort(byRank);
  const pro = list.filter(t => isPro(t)).sort(byRank);
  const out: Template[] = [];
  for (let i = 0; free.length || pro.length; i++) {
    const wantFree = FREE_WEAVE[i % FREE_WEAVE.length] === 'free';
    const next = (wantFree ? free.shift() ?? pro.shift() : pro.shift() ?? free.shift());
    if (next) out.push(next);
  }
  return out;
}

function sortTemplates(list: readonly Template[], sort: SortId, hasPro: boolean): Template[] {
  if (sort === 'newest') return [...list].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  if (sort === 'popular') return [...list].sort((a, b) => (POPULARITY[b.id] ?? 0) - (POPULARITY[a.id] ?? 0));
  // A Pro account can use everything, so there is nothing to weave around — rank alone.
  return hasPro ? [...list].sort(byRank) : weaveForFreePlan(list);
}

function FilterChevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
      <path d="M3 5.5L7 9l4-3.5" stroke="#52637A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* One dropdown shape for every single-value filter. The gallery went from four of these to six,
   and the block below was already pasted three times before that — the sixth copy is where a
   change stops reaching every control it should. Themes keeps its own markup: it is the only one
   with a search field inside it. */
function FilterSelect<T extends string>({ label, value, options, onChange, open, onToggle, width = 180, alwaysShowValue = false, align = 'left' }: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  open: boolean;
  onToggle: () => void;
  width?: number;
  /* Page Size and Orientation always name their value; the rest say only "Layout" until the
     author narrows them, so an untouched bar reads as labels rather than a row of "All"s. */
  alwaysShowValue?: boolean;
  align?: 'left' | 'right';
}) {
  return (
    <div className="relative flex-shrink-0">
      <button onClick={onToggle} className="flex items-center cursor-pointer"
        style={{ gap: 6, height: 42, padding: '0 14px', borderRadius: 8, border: `1px solid ${open ? '#006EFE' : '#E0E5EB'}`, background: '#fff', ...ns, fontSize: 13, fontWeight: 500, color: '#15191F', whiteSpace: 'nowrap' }}>
        {alwaysShowValue || value !== 'All' ? `${label}: ${value}` : label}
        <FilterChevron open={open} />
      </button>
      {open && (
        <div className="absolute" style={{ top: 48, [align]: 0, zIndex: 30, width, background: '#fff', borderRadius: 10, border: '1px solid #E0E5EB', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', padding: '8px 0' }}>
          {options.map(opt => (
            <button key={opt} onClick={() => onChange(opt)}
              className="flex items-center justify-between cursor-pointer w-full text-left"
              style={{ padding: '9px 16px', background: 'none', border: 'none', ...ns, fontSize: 14, color: '#15191F' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F6F7F9'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
              {opt}
              {value === opt && <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5 6.5-7" stroke="#006EFE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type OpenFilter = null | 'type' | 'themes' | 'pageSize' | 'orientation';

/* What the author took, and from which slot. The position is carried forward rather than
   recomputed at publish time: by then the grid has been left behind, and the question the ranking
   wants answered is which slot won the click, not which slot the template would occupy now. */
interface TemplateSelection {
  template: Template;
  position: number;
}

function templateEventProps(selection: TemplateSelection, plan: PlanId) {
  return {
    template_id: selection.template.id,
    plan,
    grid_position: selection.position,
  };
}

function TemplateGallery({ selectedThemes, manuscript, onUse, onBack }: {
  selectedThemes: string[];
  manuscript: Manuscript;
  onUse: (t: Template, position: number) => void;
  onBack: () => void;
}) {
  const currentPlan = useFlowStore(s => s.currentPlan);
  const hasPro = ownsPlan(currentPlan, 'pro');

  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState('Letter');
  const [orientation, setOrientation] = useState('Portrait');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('All');
  const [themesFilter, setThemesFilter] = useState<string[]>(selectedThemes);
  const [themeSearch, setThemeSearch] = useState('');
  const [sort, setSort] = useState<SortId>('recommended');
  // On the Wordgenie path the gallery is already mounted when themes are saved, so the initial
  // state above would keep the stale value.
  useEffect(() => { setThemesFilter(selectedThemes); }, [selectedThemes]);

  /* The sort survives the session, not the account: read after mount rather than in the initial
     state so the server and the first client render agree, the way the sidebar preference is
     hydrated rather than read inline. */
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SORT_KEY);
      if (saved && SORT_OPTIONS.some(o => o.id === saved)) setSort(saved as SortId);
    } catch { /* private mode — the default is fine */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(SORT_KEY, sort); } catch { /* private mode */ }
  }, [sort]);

  const [openFilter, setOpenFilter] = useState<OpenFilter>(null);
  const [preview, setPreview] = useState<Template | null>(null);
  const [upgradeCtx, setUpgradeCtx] = useState<{ message: string; planId: GateTier; feature: string } | null>(null);
  const themesLabel = themesFilter.length ? `Themes: ${themesFilter.join(', ')}` : 'Themes';
  const sortLabel = SORT_OPTIONS.find(o => o.id === sort)?.label ?? 'Recommended';

  const matches = (t: Template) => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    const matchTheme = themesFilter.length === 0 || subjectsOf(t).some(th => themesFilter.includes(th));
    const matchType = typeFilter === 'All' || (typeFilter === 'Pro' ? isPro(t) : !isPro(t));
    return matchSearch && matchTheme && matchType;
  };

  const gridTemplates = useMemo(
    () => sortTemplates(TEMPLATES.filter(matches), sort, hasPro),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, themesFilter, typeFilter, sort, hasPro],
  );
  const visibleThemeOptions = THEME_OPTIONS.filter(o => o.label.toLowerCase().includes(themeSearch.toLowerCase()));

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      <div className="flex-1 overflow-y-auto" style={{ padding: '28px 32px 40px' }}>
        {/* Back sits in the content column above the title — the shape OutlineReviewView uses for
            a titled step view, down to the button's own geometry. The bordered bar this replaces
            was invented for this screen: nothing else in the product frames a step's Back in its
            own strip, and directly under the wizard's header the rule read as a second header. */}
        <button onClick={onBack} className="flex items-center cursor-pointer"
          style={{ gap: 6, marginBottom: 16, ...ns, fontSize: 13, fontWeight: 500, color: '#52637A', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '7px 14px' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#F4F6F9'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Back
        </button>

        {/* Title block: h1 tight to its description at 8, the whole block clear of the filters at
            24 — OutlineReviewView's rhythm. Before this the gaps ran 16/22/24, close enough to
            read as one flat stack where nothing grouped with anything.
            The "Upgrade to use all Pro templates" link that used to sit opposite the title is
            gone; see the note on TemplateCard's badge for why the intent-driven path is the only
            upgrade affordance this screen needs. */}
        {/* The description slot carries its 8px gap only when there is a description; with no theme
            filter the title takes the full 24 to the controls itself, rather than an empty
            paragraph holding the space open. */}
        <h1 style={{ ...ns, fontSize: 26, fontWeight: 700, color: '#15191F', marginBottom: themesFilter.length > 0 ? 8 : 24 }}>Choose a template</h1>
        {themesFilter.length > 0 && (
          <p style={{ ...ns, fontSize: 14, color: '#52637A', marginBottom: 24 }}>
            {gridTemplates.length} of {TEMPLATES.length} templates match your themes.{' '}
            {/* The way out of a narrow theme pick. Without it a two-theme selection can strand an
                author on "No templates found" with no hint that the filter caused it. */}
            <button onClick={() => setThemesFilter([])} className="cursor-pointer"
              style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#006EFE', background: 'none', border: 'none', padding: 0 }}>
              Show all {TEMPLATES.length}
            </button>
          </p>
        )}

        {/* Filters, with the sort at the far right. It answers a different question from them —
            what order, not which ones — so it reads as a separate instrument rather than one more
            filter. The row still wraps rather than squeezing the search field to nothing at narrow
            widths. */}
        <div className="flex items-center relative" style={{ gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <div className="flex items-center" style={{ gap: 10, height: 42, padding: '0 16px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', flex: '1 1 220px', maxWidth: 360 }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><circle cx="8" cy="8" r="5.5" stroke="#8E99AB" strokeWidth="1.5"/><path d="M12.5 12.5L16 16" stroke="#8E99AB" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search for a template"
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', ...ns, fontSize: 14, color: '#15191F', background: 'transparent' }}/>
          </div>

          <FilterSelect label="Type" value={typeFilter} options={TYPE_OPTIONS} width={160}
            open={openFilter === 'type'} onToggle={() => setOpenFilter(openFilter === 'type' ? null : 'type')}
            onChange={v => { setTypeFilter(v); setOpenFilter(null); }} />

          {/* Themes — multi-select with search */}
          <div className="relative flex-shrink-0">
            <button onClick={() => setOpenFilter(openFilter === 'themes' ? null : 'themes')} className="flex items-center cursor-pointer"
              style={{ gap: 6, height: 42, padding: '0 14px', borderRadius: 8, border: `1px solid ${openFilter === 'themes' ? '#006EFE' : '#E0E5EB'}`, background: '#fff', ...ns, fontSize: 13, fontWeight: 500, color: '#15191F', whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {themesLabel}
              <FilterChevron open={openFilter === 'themes'} />
            </button>
            {openFilter === 'themes' && (
              <div className="absolute" style={{ top: 48, left: 0, zIndex: 30, width: 300, background: '#fff', borderRadius: 10, border: '1px solid #E0E5EB', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', padding: 12 }}>
                <div className="flex items-center" style={{ gap: 8, height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #E0E5EB', marginBottom: 10 }}>
                  <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><circle cx="8" cy="8" r="5.5" stroke="#8E99AB" strokeWidth="1.5"/><path d="M12.5 12.5L16 16" stroke="#8E99AB" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  <input value={themeSearch} onChange={e => setThemeSearch(e.target.value)} placeholder="Search..."
                    style={{ flex: 1, border: 'none', outline: 'none', ...ns, fontSize: 13, color: '#15191F' }} />
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {visibleThemeOptions.map(opt => {
                    const checked = themesFilter.includes(opt.label);
                    return (
                      <button key={opt.label}
                        onClick={() => setThemesFilter(checked ? themesFilter.filter(x => x !== opt.label) : [...themesFilter, opt.label])}
                        className="flex items-center justify-between cursor-pointer w-full text-left"
                        style={{ padding: '9px 8px', background: 'none', border: 'none', borderRadius: 6, ...ns, fontSize: 14, color: '#15191F' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#F6F7F9'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                        <span className="flex items-center" style={{ gap: 8 }}>
                          <span>{opt.emoji}</span>{opt.label}
                        </span>
                        {checked && <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5 6.5-7" stroke="#006EFE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <FilterSelect label="Page Size" value={pageSize} options={PAGE_SIZE_OPTIONS} width={180} alwaysShowValue
            open={openFilter === 'pageSize'} onToggle={() => setOpenFilter(openFilter === 'pageSize' ? null : 'pageSize')}
            onChange={v => { setPageSize(v); setOpenFilter(null); }} />

          <FilterSelect label="Orientation" value={orientation} options={ORIENTATION_OPTIONS} width={170} alwaysShowValue
            open={openFilter === 'orientation'} onToggle={() => setOpenFilter(openFilter === 'orientation' ? null : 'orientation')}
            onChange={v => { setOrientation(v); setOpenFilter(null); }} />

          {/* The platform's sort control, the same component Projects uses, at the end of the
              control row — not a seventh filter built out of the filter buttons. It runs at 42 to
              match the filters beside it; Projects runs the same control at its own 38. */}
          <div className="flex-shrink-0" style={{ marginLeft: 'auto' }}>
            <SortDropdown options={SORT_OPTIONS.map(o => o.label)} value={sortLabel} height={42} fontSize={13}
              onChange={label => {
                const picked = SORT_OPTIONS.find(o => o.label === label);
                if (picked) setSort(picked.id);
              }} />
          </div>

          {/* Click-outside backdrop to close any open dropdown */}
          {openFilter && (
            <div className="fixed inset-0" style={{ zIndex: 20 }} onClick={() => setOpenFilter(null)} />
          )}
        </div>

        {/* Unified grid — Pro templates are badged inline, not segregated into a skippable row */}
        {gridTemplates.length === 0
          ? <p style={{ ...ns, fontSize: 14, color: '#8596AD', textAlign: 'center', marginTop: 60 }}>No templates found.</p>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '28px 24px' }}>
              {gridTemplates.map(t => (
                <TemplateCard key={t.id} t={t} onClick={() => setPreview(t)} />
              ))}
            </div>}
      </div>

      {upgradeCtx && (
        <UpgradePlanModal
          onClose={() => setUpgradeCtx(null)}
          contextMessage={upgradeCtx.message}
          highlightPlanId={upgradeCtx.planId}
          highlightFeature={upgradeCtx.feature}
        />
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {preview && (
          <TemplateLightbox
            t={preview}
            allTemplates={gridTemplates}
            selectedThemes={themesFilter}
            manuscript={manuscript}
            onUse={(template, position) => {
              setPreview(null);
              /* The template's OWN tier, not a blanket 'pro' — the editor's
                 templates are gated individually, and sending a Premium one to
                 the Pro offer would sell the wrong plan. */
              const gate = template.requiredPlan;
              if (gate && shouldShowTierBadge(currentPlan, gate)) {
                setUpgradeCtx({ message: 'Unlock this template', planId: gate, feature: `${PLAN_LABELS[gate]} Templates` });
              } else {
                onUse(template, position);
              }
            }}
            onClose={() => setPreview(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── step 4: review ─────────────────────────────────────────────────────────── */

/* The stage's page, and the strip's. Both are real pages of the real book now;
   the strip used to be `Array.from({ length: 7 })` of grey rectangles with the
   cover pasted into slot one, and the stage only ever showed the cover, so the
   step called "Review" let you review exactly one page of your book and
   nothing else. Clicking a thumbnail moves the stage, which is what a page
   strip beside a page has meant everywhere since PowerPoint. */
const REVIEW_THUMB_W = 80;

function ReviewView({ template, manuscript, onPublish }: {
  template: Template;
  manuscript: Manuscript;
  onPublish: () => void;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const rafRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(0);

  const book = useMemo(
    () => composeBookSeed({ ...manuscript, templateId: template.id }),
    [manuscript, template.id],
  );
  const activePage = book.pages.find((pg) => pg.id === activePageId) ?? book.pages[0];

  useEffect(() => {
    rafRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(rafRef.current!); setTimeout(() => setLoaded(true), 400); return 100; }
        return p + (Math.random() * 8 + 4);
      });
    }, 180);
    return () => { if (rafRef.current) clearInterval(rafRef.current); };
  }, []);

  /* The stage is fluid and BookPagePreview needs a number, so it is measured —
     same reason TemplateCover measures. Height-led: a page is taller than it is
     wide, and the stage is a landscape box, so what is scarce is the height. */
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const byHeight = ((el.clientHeight - 48) * 720) / 990;
      setStageW(Math.max(0, Math.min(el.clientWidth - 48, byHeight)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  if (!loaded) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-white">
        {/* Progress bar */}
        <div style={{ height: 4, background: '#E0E5EB', flexShrink: 0 }}>
          <motion.div style={{ height: 4, background: '#006EFE', borderRadius: 2 }}
            animate={{ width: `${Math.min(progress, 100)}%` }} transition={{ duration: 0.3 }}/>
        </div>
        <div className="flex items-start" style={{ gap: 8, padding: '20px 32px 0' }}>
          <span style={{ fontSize: 18 }}>🖌</span>
          <span style={{ ...ns, fontSize: 15, color: '#15191F' }}>Weaving the words and crafting the perfect design fit...</span>
        </div>

        <div className="flex-1 flex overflow-hidden" style={{ padding: '20px 16px 20px 32px', gap: 16 }}>
          {/* Center placeholder */}
          <div className="flex-1 flex items-center justify-center" style={{ background: '#F2F4F7', borderRadius: 8 }} />
          {/* Right thumbnails — as many skeletons as the book has pages, so the
              strip doesn't resettle from seven to eighteen the moment it loads. */}
          <div className="flex flex-col flex-shrink-0" style={{ width: REVIEW_THUMB_W, gap: 8 }}>
            {book.pages.slice(0, 7).map((pg) => (
              <div key={pg.id} style={{ width: REVIEW_THUMB_W, height: 110, background: '#E8EBF2', borderRadius: 4, flexShrink: 0 }}/>
            ))}
          </div>
        </div>

        {/* Toast */}
        <div className="flex items-center justify-center" style={{ padding: '0 0 24px' }}>
          <div className="flex items-center" style={{ gap: 10, background: '#1E2A3B', borderRadius: 8, padding: '10px 18px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#fff" strokeWidth="2" strokeOpacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="2" strokeLinecap="round" className="animate-spin" style={{ transformOrigin: '12px 12px' }}/></svg>
            <span style={{ ...ns, fontSize: 13, color: '#fff' }}>Preparing project preview...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden bg-white">
      {/* TOC icon */}
      <div className="flex-shrink-0 flex items-center pl-4" style={{ width: 48 }}>
        <svg width="24" height="40" viewBox="0 0 24 40" fill="none">
          {[0, 8, 16, 24, 32, 40].map((y, i) => (
            <rect key={i} x="0" y={y} width={i === 2 ? 24 : 12} height="2" rx="1" fill={i === 2 ? '#52637A' : '#C2CBD6'}/>
          ))}
        </svg>
      </div>

      {/* Center preview */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ padding: '20px 16px' }}>
        {/* Action bar */}
        <div className="flex items-center justify-between flex-shrink-0" style={{ gap: 10, marginBottom: 16 }}>
          {/* What you are looking at, since there is now more than one thing to
              look at. */}
          <span style={{ ...ns, fontSize: 13, color: '#52637A' }}>
            Page {book.pages.indexOf(activePage) + 1} of {book.pages.length} · {activePage.title}
          </span>
          <div className="flex items-center" style={{ gap: 10 }}>
            <button onClick={() => openInEditor(router, manuscript, template)} style={{ ...ns, fontSize: 13, fontWeight: 500, color: '#52637A', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit design
            </button>
            <button onClick={onPublish}
              style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#0058CC'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
              Publish
            </button>
          </div>
        </div>

        {/* Book preview. Scrolls, because a chapter under a page-designed
            template is taller than one sheet — its opener and then its prose. */}
        <div ref={stageRef} className="flex-1 overflow-y-auto rounded-lg flex justify-center" style={{ background: '#F0F2F5', padding: 24 }}>
          {stageW > 0 && (
            <div style={{ width: stageW, height: 'fit-content', borderRadius: 6, overflow: 'hidden', boxShadow: '0 12px 48px rgba(0,0,0,0.22)', lineHeight: 0 }}>
              <BookPagePreview book={book} page={activePage} width={stageW} clip={false} />
            </div>
          )}
        </div>

        {/* Full screen link */}
        <div style={{ padding: '10px 0 0' }}>
          <button style={{ ...ns, fontSize: 13, color: '#006EFE', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
            Full screen
          </button>
        </div>
      </div>

      {/* Right thumbnails */}
      <div className="flex-shrink-0 flex flex-col overflow-y-auto" style={{ width: 96, padding: '20px 16px 20px 0', gap: 8 }}>
        {book.pages.map((pg) => {
          const active = pg.id === activePage.id;
          return (
            <button key={pg.id} onClick={() => setActivePageId(pg.id)} title={pg.title}
              style={{ width: REVIEW_THUMB_W, borderRadius: 4, overflow: 'hidden', border: `${active ? 2 : 1.5}px solid ${active ? '#006EFE' : '#E0E5EB'}`, flexShrink: 0, cursor: 'pointer', padding: 0, background: '#fff', lineHeight: 0 }}>
              <BookPagePreview book={book} page={pg} width={REVIEW_THUMB_W - (active ? 4 : 3)} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── step 5: publish ────────────────────────────────────────────────────────── */

function PublishView({ selection, manuscript, onBack }: { selection: TemplateSelection; manuscript: Manuscript; onBack: () => void }) {
  const template = selection.template;
  /* Counted off the manuscript, not typed into the markup. They were four
     literals — 90 pages, 8 chapters, 20420 words, 103 minutes — which described
     no book and contradicted the "18 Pages" the manuscript screen had shown
     the author one step earlier. Pages at the editor's own ~250 words a page
     (see BookView), reading at 200wpm. */
  const book = useMemo(
    () => composeBookSeed({ ...manuscript, templateId: template.id }),
    [manuscript, template.id],
  );
  const stats = useMemo(() => {
    const words = manuscript.chapters.reduce(
      (n, ch) => n + (stripHtml(ch.html).match(/\S+/g)?.length ?? 0), 0,
    );
    return {
      pages: manuscript.chapters.reduce(
        (n, ch) => n + Math.max(1, Math.ceil((stripHtml(ch.html).match(/\S+/g)?.length ?? 0) / 250)), 2,
      ),
      chapters: manuscript.chapters.length,
      words,
      readTime: Math.max(1, Math.round(words / 200)),
    };
  }, [manuscript]);
  const router = useRouter();
  const setSelectedManuscriptId = usePresentationFlowStore((s) => s.setSelectedManuscriptId);
  const [upgradeCtx, setUpgradeCtx] = useState<{ message: string; planId: GateTier; feature: string } | null>(null);
  const currentPlan = useFlowStore((s) => s.currentPlan);

  const [format, setFormat] = useState('pdf');
  const [title, setTitle] = useState('The Power of Unknowing: How Embracing Ignorance');
  const [author, setAuthor] = useState('');
  const [desc, setDesc] = useState('');
  const [compress, setCompress] = useState(true);
  const [published, setPublished] = useState(false);

  const mockUrl = 'https://designrr.s3.amazonaws.com/klimiashvilinn_568/the-power-of-unknowing';
  const selectedFormatMeta = PUBLISH_FORMATS.find(f => f.id === format);
  // Only a gate this viewer is actually behind — a Premium account selecting a Pro format
  // should just publish, not be asked to upgrade into something it already has.
  const selectedRequiredPlan = shouldShowTierBadge(currentPlan, selectedFormatMeta?.requiredPlan)
    ? selectedFormatMeta?.requiredPlan
    : undefined;

  // Presentations are Pro+ (see HomePageStandard's locked hub chip) — this nudge used to skip
  // that gate entirely, letting a Standard account reach the full flow for free.
  const isPresentationLocked = shouldShowTierBadge(currentPlan, 'pro');
  const handleTurnIntoPresentation = () => {
    if (isPresentationLocked) {
      setUpgradeCtx({ message: 'Unlock Presentations and Courses', planId: 'pro', feature: 'Create Presentations and Courses' });
      return;
    }
    setSelectedManuscriptId('m-1');
    router.push('/presentation/sections');
  };

  return (
    <div className="h-full relative overflow-hidden">
    {/* Publish step content — always rendered so backdrop-blur has something to blur */}
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* Back + action bar */}
      <div className="flex-shrink-0 border-b border-[#E0E5EB] flex items-center justify-between" style={{ padding: '0 32px', height: 56 }}>
        <button onClick={onBack} className="flex items-center cursor-pointer"
          style={{ gap: 6, ...ns, fontSize: 13, fontWeight: 500, color: '#52637A', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '7px 14px' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#F4F6F9'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Back
        </button>
        <div className="flex items-center" style={{ gap: 10 }}>
          <button onClick={() => openInEditor(router, manuscript, template)} style={{ ...ns, fontSize: 13, fontWeight: 500, color: '#52637A', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit design
          </button>
          <button
            onClick={() => {
              if (selectedRequiredPlan) {
                setUpgradeCtx({ message: `Unlock ${selectedFormatMeta?.label} export`, planId: selectedRequiredPlan, feature: `${selectedFormatMeta?.label} export` });
              } else {
                /* The publish half of the template's usage record. It fires on the publish that
                   goes through, not on the click — a click that opens the upgrade modal produced
                   no book, and counting it would make gated templates look the most used. */
                track('template_published', templateEventProps(selection, currentPlan));
                setPublished(true);
              }
            }}
            style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0058CC'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
            {selectedRequiredPlan ? `Upgrade to ${PLAN_LABELS[selectedRequiredPlan]}` : 'Publish'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '32px 48px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        {/* Book info + stats */}
        <div className="flex items-start justify-between" style={{ marginBottom: 32 }}>
          <div>
            <p style={{ ...ns, fontSize: 12, color: '#8596AD', marginBottom: 5 }}>E-book name</p>
            <h1 style={{ ...ns, fontSize: 20, fontWeight: 700, color: '#15191F', lineHeight: 1.35, marginBottom: 6, maxWidth: 420 }}>{manuscript.title}</h1>
            <p style={{ ...ns, fontSize: 13, color: '#8596AD' }}>Author name</p>
          </div>
          <PublishStatsRow stats={stats} />
        </div>

        <div className="flex" style={{ gap: 40 }}>
          {/* Format list */}
          <div className="flex-1 min-w-0">
            <h2 style={{ ...ns, fontSize: 18, fontWeight: 700, color: '#15191F', marginBottom: 20 }}>How would you like to publish?</h2>
            <PublishFormatList value={format} onChange={setFormat} currentPlan={currentPlan} />
          </div>

          {/* Right settings */}
          <div style={{ width: 340, flexShrink: 0 }}>
            <div className="flex flex-col" style={{ gap: 16 }}>
              {[
                { label: 'Title', val: title, set: setTitle, multiline: false },
                { label: 'Author', val: author, set: setAuthor, multiline: false },
                { label: 'Description', val: desc, set: setDesc, multiline: true },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#52637A', display: 'block', marginBottom: 6 }}>{f.label}</label>
                  {f.multiline
                    ? <textarea value={f.val} onChange={e => f.set(e.target.value)} placeholder=""
                        style={{ ...ns, fontSize: 14, color: '#15191F', width: '100%', height: 100, padding: '10px 12px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', resize: 'vertical', outline: 'none', lineHeight: 1.5 }}/>
                    : <input value={f.val} onChange={e => f.set(e.target.value)}
                        style={{ ...ns, fontSize: 14, color: '#15191F', width: '100%', height: 40, padding: '0 12px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', outline: 'none' }}/>}
                </div>
              ))}

              {/* Compress PDF toggle */}
              <div className="flex items-center" style={{ gap: 10 }}>
                <button onClick={() => setCompress(v => !v)} style={{ width: 40, height: 22, borderRadius: 999, background: compress ? '#006EFE' : '#E0E5EB', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.15s', flexShrink: 0 }}>
                  <motion.div animate={{ left: compress ? 20 : 2 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                    style={{ position: 'absolute', top: 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}/>
                </button>
                <span style={{ ...ns, fontSize: 14, color: '#15191F' }}>Compress PDF</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Success — the shared post-publish screen, same as the editor's Publish page. */}
    {published && (
      <PublishedPanel
        cover={<BookPagePreview book={book} page={book.pages[0]} width={148} />}
        /* Not template.bg: most of the covers are white or off-white, and on a
           white ground the cover has nothing holding it and the close button
           disappears entirely. One dark ground for every book, same as the
           editor's Publish screen. */
        coverBg="#15191F"
        url={mockUrl}
        onClose={onBack}
        currentPlan={currentPlan}
        onUpgrade={setUpgradeCtx}
        onTurnIntoPresentation={handleTurnIntoPresentation}
      />
    )}

    {upgradeCtx && (
      <UpgradePlanModal
        onClose={() => setUpgradeCtx(null)}
        contextMessage={upgradeCtx.message}
        highlightPlanId={upgradeCtx.planId}
        highlightFeature={upgradeCtx.feature}
      />
    )}
    </div>
  );
}

/* ── step 2: writing a content ──────────────────────────────────────────────── */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
}

/* Opening the book in the editor is now one call to buildBookSeed, which is
   BookEditorView's own composer. What was here instead: a hand-written copy of
   the PersistedBook shape, a hardcoded `activeTheme: 'statement-lettering'`
   whatever the author had picked, a four-element cover built out of the wizard
   template's two colours, a single chapter of placeholder prose, and a
   `flattenBg` that reduced a gradient to one of its stops because the wizard's
   templates were gradients and the editor's are designs.

   All of it existed because the wizard's templates were not the editor's
   templates and its manuscript was not the manuscript. Both are now, so the
   conversion has nothing left to convert. */
function openInEditor(router: ReturnType<typeof useRouter>, manuscript: Manuscript, template: Template) {
  try {
    window.localStorage.setItem(BOOK_STORAGE_KEY, buildBookSeed({ ...manuscript, templateId: template.id }));
  } catch { /* storage unavailable/full — editor still opens, just with its own demo content */ }
  router.push('/book/editor');
}

function WritingContentView({ manuscript, onChooseFormat }: { manuscript: Manuscript; onChooseFormat: () => void }) {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* Editing toolbar */}
      <div className="flex-shrink-0 border-b border-[#E0E5EB]" style={{ height: 52 }}>
        <div className="flex items-center justify-between h-full" style={{ padding: '0 20px' }}>
          <div className="flex items-center" style={{ gap: 8 }}>
            <span style={{ ...ns, fontSize: 13, color: '#52637A' }}>Last edited: <strong style={{ color: '#15191F' }}>today at 10:50</strong></span>
            <div style={{ width: 1, height: 16, background: '#E0E5EB' }} />
            <span className="flex items-center" style={{ gap: 5, ...ns, fontSize: 13, color: '#29A341' }}>
              <svg width="20" height="14" viewBox="1 5 25.5 18" fill="none">
                <path d="M16.3205 8.98969C15.3213 7.56945 13.6752 6.64688 11.8109 6.64688C8.84797 6.64688 6.43242 8.98203 6.30227 11.9105C6.2793 12.4082 5.95773 12.8446 5.48688 13.013C3.81781 13.6026 2.62344 15.1913 2.62344 17.0594C2.62344 19.429 4.54133 21.3469 6.91094 21.3469H20.9984C23.0273 21.3469 24.6734 19.7008 24.6734 17.6719C24.6734 16.2631 23.881 15.0381 22.7134 14.4218C22.2005 14.15 21.9478 13.5605 22.1086 13.0016C22.1852 12.7374 22.2234 12.4541 22.2234 12.1594C22.2234 10.4673 20.853 9.09688 19.1609 9.09688C18.6901 9.09688 18.246 9.20406 17.8479 9.39164C17.3081 9.64812 16.665 9.47969 16.3205 8.98969ZM11.8109 5.42188C14.0887 5.42188 16.1023 6.55117 17.3234 8.28531C17.8785 8.02117 18.5025 7.87188 19.1609 7.87188C21.5305 7.87188 23.4484 9.78977 23.4484 12.1594C23.4484 12.569 23.391 12.9633 23.2838 13.3384C24.838 14.1577 25.8984 15.7923 25.8984 17.6719C25.8984 20.3784 23.7049 22.5719 20.9984 22.5719H6.91094C3.86758 22.5719 1.39844 20.1027 1.39844 17.0594C1.39844 14.6553 2.93734 12.6149 5.08109 11.857C5.23805 8.27766 8.18953 5.42188 11.8109 5.42188ZM17.756 13.2045L12.856 18.1045C12.6187 18.3418 12.2282 18.3418 11.9909 18.1045L9.54086 15.6545C9.30352 15.4171 9.30352 15.0266 9.54086 14.7893C9.7782 14.552 10.1687 14.552 10.406 14.7893L12.4234 16.8067L16.8909 12.3393C17.1282 12.102 17.5187 12.102 17.756 12.3393C17.9934 12.5766 17.9934 12.9671 17.756 13.2045Z" fill="#29A341"/>
              </svg>
              Saved
            </span>
          </div>
          <div className="flex items-center" style={{ gap: 4 }}>
            {/* Undo */}
            <button className="flex items-center justify-center cursor-pointer rounded-md hover:bg-[#F4F6F9] transition-colors" style={{ width: 36, height: 36, border: 'none', background: 'none' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3D4A5C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
            </button>
            {/* Redo */}
            <button className="flex items-center justify-center cursor-pointer rounded-md hover:bg-[#F4F6F9] transition-colors" style={{ width: 36, height: 36, border: 'none', background: 'none' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C5CDD9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>
            </button>
            <div style={{ width: 1, height: 16, background: '#E0E5EB', margin: '0 4px' }} />
            {/* Mic */}
            <button className="flex items-center justify-center cursor-pointer rounded-md hover:bg-[#F4F6F9] transition-colors" style={{ width: 36, height: 36, border: 'none', background: 'none' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/><path d="M8 22h8"/></svg>
            </button>
            <button onClick={onChooseFormat}
              style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 4 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#0058CC'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
              Choose a book format
            </button>
            <button className="flex items-center justify-center cursor-pointer rounded-md hover:bg-[#F4F6F9] transition-colors" style={{ width: 36, height: 36, border: 'none', background: 'none', marginLeft: 2 }}>
              <svg width="4" height="16" viewBox="0 0 4 20" fill="none"><circle cx="2" cy="2" r="2" fill="#52637A"/><circle cx="2" cy="10" r="2" fill="#52637A"/><circle cx="2" cy="18" r="2" fill="#52637A"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Manuscript content — all of it. This showed one hardcoded chapter called
          "Introduction" with three paragraphs of placeholder prose, which is
          where the lost chapters first go missing: the author arrives from a
          manuscript of eight and the very next screen shows them one. */}
      <div className="flex-1 overflow-y-auto bg-white" style={{ padding: '40px 0' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 48px' }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 700, color: '#15191F', lineHeight: 1.3, marginBottom: 6 }}>{manuscript.title}</h1>
          {manuscript.subtitle && (
            <p style={{ ...ns, fontSize: 15, color: '#52637A', marginBottom: 32 }}>{manuscript.subtitle}</p>
          )}
          {manuscript.chapters.map((ch, i) => (
            <div key={ch.id} style={{ marginTop: i === 0 ? 26 : 40 }}>
              <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 700, color: '#15191F', marginBottom: 16 }}>{ch.title}</h2>
              <div style={{ ...ns, fontSize: 15, color: '#29323D', lineHeight: 1.8 }}
                className="[&_p]:mb-5" dangerouslySetInnerHTML={{ __html: ch.html }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── main orchestrator ──────────────────────────────────────────────────────── */

export function EbookCreateFlow({ startStep = 2 }: { startStep?: 2 | 3 }) {
  const sidebarOpen = useFlowStore(s => s.sidebarOpen);
  const setSidebarOpen = useFlowStore(s => s.setSidebarOpen);

  const [step, setStep] = useState<number>(startStep);
  // Wordgenie hands off straight to the gallery, which used to mean the themes step never ran and
  // the gallery opened unfiltered. Same step, same modal — it just opens over the gallery here,
  // because there is no manuscript screen on this path to open it from.
  const [showThemesModal, setShowThemesModal] = useState(startStep === 3);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const currentPlan = useFlowStore(s => s.currentPlan);
  const manuscript = useManuscript();
  const [selection, setSelection] = useState<TemplateSelection>({ template: TEMPLATES[0], position: 1 });

  const handleSaveThemes = (themes: string[]) => {
    setSelectedThemes(themes);
    setShowThemesModal(false);
    setStep(3);
  };

  const handleUseTemplate = (template: Template, position: number) => {
    const next: TemplateSelection = { template, position };
    /* Only reached by a template the author can actually use — a Pro one on a lower plan opens
       the upgrade modal inside the gallery and never gets here. */
    track('template_selected', templateEventProps(next, currentPlan));
    setSelection(next);
    setStep(4);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WizardHeader step={step} sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

      <div className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">
          {step === 2 && (
            <motion.div key="step2" className="absolute inset-0"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}>
              <WritingContentView manuscript={manuscript} onChooseFormat={() => setShowThemesModal(true)} />
            </motion.div>
          )}
          {step === 3 && (
            <motion.div key="step3" className="absolute inset-0"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.22 }}>
              <TemplateGallery selectedThemes={selectedThemes} manuscript={manuscript} onUse={handleUseTemplate} onBack={() => setStep(2)} />
            </motion.div>
          )}
          {step === 4 && (
            <motion.div key="step4" className="absolute inset-0"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.22 }}>
              <ReviewView template={selection.template} manuscript={manuscript} onPublish={() => setStep(5)} />
            </motion.div>
          )}
          {step === 5 && (
            <motion.div key="step5" className="absolute inset-0"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.22 }}>
              <PublishView selection={selection} manuscript={manuscript} onBack={() => setStep(4)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Themes modal */}
      <AnimatePresence>
        {showThemesModal && (
          <ThemesModal
            docTitle={manuscript.title}
            initial={selectedThemes}
            onSave={handleSaveThemes}
            onClose={() => setShowThemesModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
