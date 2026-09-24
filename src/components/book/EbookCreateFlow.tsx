'use client';

import { useState, useEffect, useRef, type ReactElement } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useFlowStore, PLAN_LABELS } from '@/stores/flowStore';
import { usePresentationFlowStore } from '@/stores/presentationFlowStore';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';
import { UpgradePlanModal } from '../account/MyAccountView';
import { TierBadge, OfferBadge, shouldShowTierBadge } from '../ui/TierBadge';

/* ── constants ──────────────────────────────────────────────────────────────── */

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

const WIZARD_STEPS = ['Generate', 'Writing a content', 'Choose template', 'Review', 'Publish'];

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

interface Template {
  id: number;
  name: string;
  bg: string;
  textColor: string;
  accentColor: string;
  themes: string[];
  isPro?: boolean;
  /** Pro-tier template usable without upgrading, as a trial. Locked Pro templates omit this. */
  tryForFree?: boolean;
}

const TEMPLATES: Template[] = [
  { id: 1,  name: 'SEO 2-05',                    bg: 'linear-gradient(160deg,#22c55e,#15803d)', textColor: '#fff',     accentColor: '#86efac', themes: ['Digital Marketing', 'Business', 'E-Commerce'] },
  { id: 2,  name: 'Social Media Marketing 2-05', bg: '#111827',                                 textColor: '#f59e0b', accentColor: '#fbbf24', themes: ['Digital Marketing', 'Advertising', 'Blogging', 'Marketing coaching'] },
  { id: 3,  name: 'Pro Print Book',              bg: '#f8f8f6',                                 textColor: '#111827', accentColor: '#6b7280', themes: ['Business', 'Writing Non-Fiction', 'Author'], isPro: true, tryForFree: true },
  { id: 4,  name: 'Echoes',                      bg: 'linear-gradient(160deg,#a78bfa,#7c3aed)', textColor: '#fff',     accentColor: '#c4b5fd', themes: ['Writing Fiction', 'Author'] },
  { id: 5,  name: 'Sunset',                      bg: 'linear-gradient(160deg,#fb923c,#dc2626)', textColor: '#fff',     accentColor: '#fcd34d', themes: ['Self Development', 'Life coaching'] },
  { id: 6,  name: 'Kamy',                        bg: '#1a1a1a',                                 textColor: '#e5e7eb', accentColor: '#9ca3af', themes: ['Writing Fiction', 'Blogging'], isPro: true },
  { id: 7,  name: 'Regalia',                     bg: 'linear-gradient(160deg,#d4a574,#b8860b)', textColor: '#1a1a1a', accentColor: '#78350f', themes: ['Business Development / Sales', 'Copywriting'], isPro: true, tryForFree: true },
  { id: 8,  name: 'Bestseller',                  bg: '#111',                                    textColor: '#fff',     accentColor: '#d1d5db', themes: ['Author', 'Writing Non-Fiction', 'Business'] },
  { id: 9,  name: 'Minimal Pro',                 bg: '#fff',                                    textColor: '#111827', accentColor: '#4b5563', themes: ['Business', 'Training and Development', 'Education'], isPro: true },
  { id: 10, name: 'Business Blue',               bg: 'linear-gradient(160deg,#3b82f6,#1d4ed8)', textColor: '#fff',     accentColor: '#93c5fd', themes: ['Business', 'Business Development / Sales', 'Network Marketing'] },
  { id: 11, name: 'Creative Orange',             bg: 'linear-gradient(160deg,#f97316,#ea580c)', textColor: '#fff',     accentColor: '#fed7aa', themes: ['Self Development', 'Spiritual Self Development'] },
  { id: 12, name: 'Nature Green',                bg: 'linear-gradient(160deg,#4ade80,#15803d)', textColor: '#fff',     accentColor: '#bbf7d0', themes: ['Health & wellness', 'Life coaching'] },
];

const PUBLISH_FORMATS: { id: string; label: string; sub: string; badgeBg: string; badgeText: string; icon: string; requiredPlan?: 'pro' | 'premium' }[] = [
  { id: 'pdf',      label: 'PDF',      sub: 'For adobe reader',        badgeBg: '#FEE2E2', badgeText: '#B91C1C',  icon: 'pdf' },
  { id: 'flipbook', label: 'Flipbook', sub: 'Set your book in motion', badgeBg: '#EDE9FE', badgeText: '#7C3AED',  icon: 'flipbook' },
  { id: 'kindle',   label: 'Kindle',   sub: 'E-pub export',            badgeBg: '#FEF3C7', badgeText: '#92400E',  icon: 'kindle', requiredPlan: 'pro' },
  { id: 'html',     label: 'HTML',     sub: 'Export html',             badgeBg: '#DBEAFE', badgeText: '#1D4ED8',  icon: 'html', requiredPlan: 'premium' },
  { id: 'epub',     label: 'EPUB',     sub: 'For e-readers',           badgeBg: '#D1FAE5', badgeText: '#065F46',  icon: 'epub', requiredPlan: 'pro' },
];

const DOC_TITLE = 'The Power of Unknowing: How Embracing Ignorance Can Lead to Wisdom';

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
    : TEMPLATES.filter(t => t.themes.some(th => selected.includes(th))).length;

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

/* ── template cover mock ────────────────────────────────────────────────────── */

function TemplateCover({ t, height = 300, ratio, fill, title }: { t: Template; height?: number; ratio?: string; fill?: boolean; title?: string }) {
  const isLight = t.bg === '#f8f8f6' || t.bg === '#fff';
  // `position: relative` so the light-cover accent bar below anchors to the cover. Without it the
  // bar resolved against whatever ancestor happened to be positioned — now the grey stage — and
  // painted across the tile's foot instead of the cover's.
  return (
    <div style={{ position: 'relative', width: '100%', ...(fill ? { height: '100%' } : ratio ? { aspectRatio: ratio } : { height }), background: t.bg, borderRadius: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 16px', gap: 8, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ width: 40, height: 3, borderRadius: 2, background: t.accentColor, marginBottom: 4 }} />
      <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, fontFamily: 'Georgia, serif', color: t.textColor, lineHeight: 1.25, textTransform: 'uppercase', letterSpacing: 1, maxWidth: '82%', wordBreak: 'break-word' }}>
        {title ?? t.name}
      </div>
      <div style={{ width: 50, height: 1.5, borderRadius: 1, background: `${t.textColor}55` }} />
      <div style={{ fontSize: 9, color: `${t.textColor}77`, fontFamily: "'Nunito Sans', sans-serif" }}>Author Name</div>
      {isLight && <div style={{ position: 'absolute' as const, bottom: 0, left: 0, right: 0, height: 3, background: t.accentColor, opacity: 0.5 }} />}
    </div>
  );
}

/* ── template gallery ───────────────────────────────────────────────────────── */

function TemplateCard({ t, onClick }: { t: Template; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const currentPlan = useFlowStore((s) => s.currentPlan);
  // GitLab's rule, already encoded in TierBadge: don't mark a tier the viewer owns. A PRO
  // customer was seeing "Pro" on templates they can already use, and "Try for free" on ones
  // that are simply free to them.
  const showBadge = t.isPro && shouldShowTierBadge(currentPlan, 'pro');
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
        style={{ aspectRatio: '5 / 3', background: '#F4F6F9', borderRadius: 10, padding: '10px 0' }}>
        <div style={{ height: '100%', aspectRatio: '17 / 22', borderRadius: 4, overflow: 'hidden', boxShadow: '0 2px 10px rgba(15,23,51,0.16)' }}>
          <TemplateCover t={t} fill />
        </div>
        {/* Positioned exactly as BookTypeSelector places its badge — the platform's existing
            badge-on-a-card treatment, and the closest analogue to this gallery. 8/8 rather than
            10/10, no shadow, and lineHeight 0 on the wrapper so the inline-flex pill doesn't sit
            on a line box and pick up a descender gap above it, which renders an identical
            top/right offset unequal. An earlier pass here used 10/10 with a drop shadow; the
            shadow was invented for this one surface and the platform doesn't use one.
            "Pro" is the tier badge; "Try for free" is its inverted sibling, because an offer is
            not a tier and shouldn't wear a tier's mark. */}
        {showBadge && (
          <div className="absolute" style={{ top: 8, right: 8, lineHeight: 0 }}>
            {t.tryForFree ? <OfferBadge label="Try for free" /> : <TierBadge tier="pro" />}
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
const THUMB_H = Math.round((THUMB_W * 22) / 17);       // 98

function TemplateLightbox({ t, allTemplates, selectedThemes, onUse, onClose }: {
  t: Template;
  allTemplates: Template[];
  selectedThemes: string[];
  onUse: (template: Template) => void;
  onClose: () => void;
}) {
  const currentPlan = useFlowStore((st) => st.currentPlan);
  const [idx, setIdx] = useState(allTemplates.findIndex(x => x.id === t.id));
  const current = allTemplates[idx];
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
          <div style={{ width: PREVIEW_W, height: PREVIEW_H, borderRadius: 6, overflow: 'hidden', boxShadow: '0 8px 28px rgba(15,23,51,0.20)', flexShrink: 0 }}>
            <TemplateCover t={current} fill title={DOC_TITLE} />
          </div>

          {/* Page thumbnails: a centred row of pages at the same ratio, not full-width bars. Cover
              first, then the interior spreads. */}
          <div className="flex flex-shrink-0" style={{ gap: 10 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: THUMB_W, height: THUMB_H, borderRadius: 4, overflow: 'hidden', border: i === 0 ? '2px solid #006EFE' : '1px solid #E0E5EB', background: '#fff' }}>
                {i === 0
                  // The cover rendered at full size and scaled down, so the thumbnail is a true
                  // miniature. TemplateCover's internals are fixed px — a 13px title and a 40px
                  // accent rule — which at a fifth of the width would have swamped the page.
                  ? <div style={{ width: PREVIEW_W, height: PREVIEW_H, transform: `scale(${THUMB_W / PREVIEW_W})`, transformOrigin: 'top left' }}>
                      <TemplateCover t={current} fill title={DOC_TITLE} />
                    </div>
                  : <div style={{ height: '100%', background: '#fff', padding: '9px 8px', display: 'flex', flexDirection: 'column', gap: 3.5 }}>
                      <div style={{ width: '65%', height: 4, background: '#E0E5EB', borderRadius: 2, marginBottom: 2 }}/>
                      {[90, 75, 85, 60, 80, 70, 88].map((w, j) => <div key={j} style={{ width: `${w}%`, height: 2.5, background: '#F0F2F5', borderRadius: 2 }}/>)}
                    </div>}
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

          {/* Name first, badge after it — the same badge the card in the gallery shows, at the same
              default size and by the same rule: "Try for free" replaces "Pro" rather than sitting
              beside it. A template must not change its mark between the grid and the preview of
              that grid item; an author picks a card by its badge and then has to recognise it here.
              This deliberately drops two earlier one-offs — the `size="lg"` variant, and a green
              "Try for free — no upgrade needed" sentence carrying the offer in prose while the
              badge said "Pro". The gold star in a black tile that used to lead this row is long
              gone for the same reason: it named no plan. */}
          <div className="flex items-center" style={{ gap: 10, marginBottom: 12 }}>
            <h3 style={{ ...ns, fontSize: 20, fontWeight: 700, color: '#15191F' }}>{current.name}</h3>
            {current.isPro && shouldShowTierBadge(currentPlan, 'pro') && (
              <span style={{ lineHeight: 0, flexShrink: 0 }}>
                {current.tryForFree ? <OfferBadge label="Try for free" /> : <TierBadge tier="pro" />}
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
            {current.themes.map(th => {
              const matched = selectedThemes.includes(th);
              return (
                <span key={th} className="flex items-center"
                  style={{ gap: 6, padding: '6px 12px', borderRadius: 999, border: `1px solid ${matched ? '#006EFE' : '#E0E5EB'}`, background: matched ? '#F4F8FF' : '#fff', ...ns, fontSize: 13, color: '#15191F', whiteSpace: 'nowrap' }}>
                  <span>{THEME_EMOJI[th] ?? '🔥'}</span>{th}
                </span>
              );
            })}
          </div>

          <button onClick={() => onUse(current)}
            style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 8, padding: '11px 0', cursor: 'pointer', width: '100%', marginBottom: 10 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0058CC'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
            {current.isPro && !current.tryForFree ? 'Unlock with Pro' : 'Use this template'}
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

const TYPE_OPTIONS = ['All', 'Standard', 'Two Column', 'User', 'Asian', 'Cyrillic', 'RTL', 'Pro'];
const PAGE_SIZE_OPTIONS = ['Letter', 'A4', 'A5', '6x9', 'Legal', 'A3', 'Square'];
const ORIENTATION_OPTIONS = ['Portrait', 'Landscape'];
const THEME_OPTIONS = ALL_THEMES;

function FilterChevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
      <path d="M3 5.5L7 9l4-3.5" stroke="#52637A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function TemplateGallery({ selectedThemes, onUse, onBack }: {
  selectedThemes: string[];
  onUse: (t: Template) => void;
  onBack: () => void;
}) {
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState('Letter');
  const [orientation, setOrientation] = useState('Portrait');
  const [typeFilter, setTypeFilter] = useState('All');
  const [themesFilter, setThemesFilter] = useState<string[]>(selectedThemes);
  const [themeSearch, setThemeSearch] = useState('');
  // On the Wordgenie path the gallery is already mounted when themes are saved, so the initial
  // state above would keep the stale value.
  useEffect(() => { setThemesFilter(selectedThemes); }, [selectedThemes]);
  const [openFilter, setOpenFilter] = useState<null | 'type' | 'themes' | 'pageSize' | 'orientation'>(null);
  const [preview, setPreview] = useState<Template | null>(null);
  const [upgradeCtx, setUpgradeCtx] = useState<{ message: string; planId: 'pro'; feature: string } | null>(null);
  const themesLabel = themesFilter.length ? `Themes: ${themesFilter.join(', ')}` : 'Themes';

  const filtered = TEMPLATES.filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    const matchTheme = themesFilter.length === 0 || t.themes.some(th => themesFilter.includes(th));
    const matchType = typeFilter === 'All' || (typeFilter === 'Pro' ? t.isPro : true);
    return matchSearch && matchTheme && matchType;
  });
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
            {filtered.length} of {TEMPLATES.length} templates match your themes.{' '}
            {/* The way out of a narrow theme pick. Without it a two-theme selection can strand an
                author on "No templates found" with no hint that the filter caused it. */}
            <button onClick={() => setThemesFilter([])} className="cursor-pointer"
              style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#006EFE', background: 'none', border: 'none', padding: 0 }}>
              Show all {TEMPLATES.length}
            </button>
          </p>
        )}

        {/* Filters */}
        <div className="flex items-center relative" style={{ gap: 12, marginBottom: 24 }}>
          <div className="flex-1 flex items-center" style={{ gap: 10, height: 42, padding: '0 16px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', maxWidth: 520 }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><circle cx="8" cy="8" r="5.5" stroke="#8E99AB" strokeWidth="1.5"/><path d="M12.5 12.5L16 16" stroke="#8E99AB" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search for a template"
              style={{ flex: 1, border: 'none', outline: 'none', ...ns, fontSize: 14, color: '#15191F', background: 'transparent' }}/>
          </div>

          {/* Type — single-select */}
          <div className="relative flex-shrink-0">
            <button onClick={() => setOpenFilter(openFilter === 'type' ? null : 'type')} className="flex items-center cursor-pointer"
              style={{ gap: 6, height: 42, padding: '0 14px', borderRadius: 8, border: `1px solid ${openFilter === 'type' ? '#006EFE' : '#E0E5EB'}`, background: '#fff', ...ns, fontSize: 13, fontWeight: 500, color: '#15191F', whiteSpace: 'nowrap' }}>
              Type
              <FilterChevron open={openFilter === 'type'} />
            </button>
            {openFilter === 'type' && (
              <div className="absolute" style={{ top: 48, left: 0, zIndex: 30, width: 220, background: '#fff', borderRadius: 10, border: '1px solid #E0E5EB', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', padding: '8px 0' }}>
                {TYPE_OPTIONS.map(opt => (
                  <button key={opt} onClick={() => { setTypeFilter(opt); setOpenFilter(null); }}
                    className="flex items-center justify-between cursor-pointer w-full text-left"
                    style={{ padding: '9px 16px', background: 'none', border: 'none', ...ns, fontSize: 14, color: '#15191F' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#F6F7F9'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                    {opt}
                    {typeFilter === opt && <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5 6.5-7" stroke="#006EFE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </button>
                ))}
              </div>
            )}
          </div>

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

          {/* Page Size — single-select */}
          <div className="relative flex-shrink-0">
            <button onClick={() => setOpenFilter(openFilter === 'pageSize' ? null : 'pageSize')} className="flex items-center cursor-pointer"
              style={{ gap: 6, height: 42, padding: '0 14px', borderRadius: 8, border: `1px solid ${openFilter === 'pageSize' ? '#006EFE' : '#E0E5EB'}`, background: '#fff', ...ns, fontSize: 13, fontWeight: 500, color: '#15191F', whiteSpace: 'nowrap' }}>
              {`Page Size: ${pageSize}`}
              <FilterChevron open={openFilter === 'pageSize'} />
            </button>
            {openFilter === 'pageSize' && (
              <div className="absolute" style={{ top: 48, left: 0, zIndex: 30, width: 180, background: '#fff', borderRadius: 10, border: '1px solid #E0E5EB', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', padding: '8px 0' }}>
                {PAGE_SIZE_OPTIONS.map(opt => (
                  <button key={opt} onClick={() => { setPageSize(opt); setOpenFilter(null); }}
                    className="flex items-center justify-between cursor-pointer w-full text-left"
                    style={{ padding: '9px 16px', background: 'none', border: 'none', ...ns, fontSize: 14, color: '#15191F' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#F6F7F9'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                    {opt}
                    {pageSize === opt && <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5 6.5-7" stroke="#006EFE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Orientation — single-select */}
          <div className="relative flex-shrink-0">
            <button onClick={() => setOpenFilter(openFilter === 'orientation' ? null : 'orientation')} className="flex items-center cursor-pointer"
              style={{ gap: 6, height: 42, padding: '0 14px', borderRadius: 8, border: `1px solid ${openFilter === 'orientation' ? '#006EFE' : '#E0E5EB'}`, background: '#fff', ...ns, fontSize: 13, fontWeight: 500, color: '#15191F', whiteSpace: 'nowrap' }}>
              {`Orientation: ${orientation}`}
              <FilterChevron open={openFilter === 'orientation'} />
            </button>
            {openFilter === 'orientation' && (
              <div className="absolute" style={{ top: 48, left: 0, zIndex: 30, width: 170, background: '#fff', borderRadius: 10, border: '1px solid #E0E5EB', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', padding: '8px 0' }}>
                {ORIENTATION_OPTIONS.map(opt => (
                  <button key={opt} onClick={() => { setOrientation(opt); setOpenFilter(null); }}
                    className="flex items-center justify-between cursor-pointer w-full text-left"
                    style={{ padding: '9px 16px', background: 'none', border: 'none', ...ns, fontSize: 14, color: '#15191F' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#F6F7F9'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                    {opt}
                    {orientation === opt && <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5 6.5-7" stroke="#006EFE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Click-outside backdrop to close any open dropdown */}
          {openFilter && (
            <div className="fixed inset-0" style={{ zIndex: 20 }} onClick={() => setOpenFilter(null)} />
          )}
        </div>

        {/* Unified grid — Pro templates are badged inline, not segregated into a skippable row */}
        {filtered.length === 0
          ? <p style={{ ...ns, fontSize: 14, color: '#8596AD', textAlign: 'center', marginTop: 60 }}>No templates found.</p>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '28px 24px' }}>
              {filtered.map(t => (
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
            allTemplates={filtered}
            selectedThemes={themesFilter}
            onUse={(template) => {
              setPreview(null);
              if (template.isPro && !template.tryForFree) {
                setUpgradeCtx({ message: 'Unlock this template', planId: 'pro', feature: 'Pro Templates' });
              } else {
                onUse(template);
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

function ReviewView({ template, onPublish }: { template: Template; onPublish: () => void }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    rafRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(rafRef.current!); setTimeout(() => setLoaded(true), 400); return 100; }
        return p + (Math.random() * 8 + 4);
      });
    }, 180);
    return () => { if (rafRef.current) clearInterval(rafRef.current); };
  }, []);

  // Page thumbnails (right strip)
  const thumbs = Array.from({ length: 7 });

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
          {/* Right thumbnails */}
          <div className="flex flex-col flex-shrink-0" style={{ width: 80, gap: 8 }}>
            {thumbs.map((_, i) => (
              <div key={i} style={{ width: 80, height: 96, background: '#E8EBF2', borderRadius: 4 }}/>
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
        <div className="flex items-center justify-end flex-shrink-0" style={{ gap: 10, marginBottom: 16 }}>
          <button onClick={() => openInEditor(router, DOC_TITLE, template)} style={{ ...ns, fontSize: 13, fontWeight: 500, color: '#52637A', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
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

        {/* Book preview */}
        <div className="flex-1 overflow-hidden rounded-lg" style={{ background: '#F0F2F5' }}>
          <div className="h-full flex items-center justify-center p-8">
            <div style={{ width: '60%', maxWidth: 440, aspectRatio: '3/4', borderRadius: 6, overflow: 'hidden', boxShadow: '0 12px 48px rgba(0,0,0,0.22)' }}>
              <TemplateCover t={template} height={600} title={DOC_TITLE} />
            </div>
          </div>
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
        {thumbs.map((_, i) => (
          <div key={i} style={{ width: 80, height: 96, borderRadius: 4, overflow: 'hidden', border: i === 0 ? '2px solid #006EFE' : '1.5px solid #E0E5EB', flexShrink: 0, cursor: 'pointer' }}>
            {i === 0
              ? <TemplateCover t={template} height={96} title={DOC_TITLE} />
              : <div style={{ height: '100%', background: '#fff', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ width: '70%', height: 3, background: '#E0E5EB', borderRadius: 2 }}/>
                  {[90, 75, 85, 60, 80, 70].map((w, j) => <div key={j} style={{ width: `${w}%`, height: 2, background: '#F0F2F5', borderRadius: 2 }}/>)}
                </div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── step 5: publish ────────────────────────────────────────────────────────── */

function FormatIcon({ id }: { id: string }) {
  const map: Record<string, ReactElement> = {
    pdf: (
      <div style={{ width: 36, height: 36, borderRadius: 8, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#FCA5A5" stroke="#B91C1C" strokeWidth="1"/><path d="M14 2v6h6" stroke="#B91C1C" strokeWidth="1" strokeLinecap="round"/><text x="6" y="18" style={{ fontSize: '5.5px', fontFamily: 'sans-serif', fontWeight: 700 }} fill="#B91C1C">PDF</text></svg>
      </div>
    ),
    flipbook: (
      <div style={{ width: 36, height: 36, borderRadius: 8, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M2 6a2 2 0 0 1 2-2h7v16H4a2 2 0 0 1-2-2V6z" fill="#C4B5FD" stroke="#7C3AED" strokeWidth="1"/><path d="M22 6a2 2 0 0 0-2-2h-7v16h7a2 2 0 0 0 2-2V6z" fill="#DDD6FE" stroke="#7C3AED" strokeWidth="1"/></svg>
      </div>
    ),
    kindle: (
      <div style={{ width: 36, height: 36, borderRadius: 8, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#FDE68A" stroke="#92400E" strokeWidth="1"/><text x="6" y="15" style={{ fontSize: '5px', fontFamily: 'serif', fontWeight: 700 }} fill="#92400E">Kindle</text></svg>
      </div>
    ),
    html: (
      <div style={{ width: 36, height: 36, borderRadius: 8, background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6" stroke="#1D4ED8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
    ),
    epub: (
      <div style={{ width: 36, height: 36, borderRadius: 8, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#A7F3D0" stroke="#065F46" strokeWidth="1"/><path d="M9 12l2 2 4-4" stroke="#065F46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
    ),
  };
  return map[id] ?? null;
}

function PublishView({ template, onBack }: { template: Template; onBack: () => void }) {
  const router = useRouter();
  const setSelectedManuscriptId = usePresentationFlowStore((s) => s.setSelectedManuscriptId);
  const [upgradeCtx, setUpgradeCtx] = useState<{ message: string; planId: 'pro' | 'premium'; feature: string } | null>(null);
  const currentPlan = useFlowStore((s) => s.currentPlan);

  const [format, setFormat] = useState('pdf');
  const [title, setTitle] = useState('The Power of Unknowing: How Embracing Ignorance');
  const [author, setAuthor] = useState('');
  const [desc, setDesc] = useState('');
  const [compress, setCompress] = useState(true);
  const [published, setPublished] = useState(false);
  const [copied, setCopied] = useState(false);

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
          <button onClick={() => openInEditor(router, DOC_TITLE, template)} style={{ ...ns, fontSize: 13, fontWeight: 500, color: '#52637A', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit design
          </button>
          <button
            onClick={() => {
              if (selectedRequiredPlan) {
                setUpgradeCtx({ message: `Unlock ${selectedFormatMeta?.label} export`, planId: selectedRequiredPlan, feature: `${selectedFormatMeta?.label} export` });
              } else {
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
            <h1 style={{ ...ns, fontSize: 20, fontWeight: 700, color: '#15191F', lineHeight: 1.35, marginBottom: 6, maxWidth: 420 }}>{DOC_TITLE}</h1>
            <p style={{ ...ns, fontSize: 13, color: '#8596AD' }}>Author name</p>
          </div>
          <div className="flex items-center" style={{ gap: 0, border: '1px solid #E0E5EB', borderRadius: 10, overflow: 'hidden' }}>
            {[
              { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/></svg>, val: '90', label: 'Pages' },
              { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.6"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="4" y1="14" x2="14" y2="14"/></svg>, val: '8', label: 'Chapters' },
              { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.6" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h8"/></svg>, val: '20420', label: 'Words' },
              { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>, val: '103', label: 'Read time' },
            ].map((s, i, arr) => (
              <div key={s.label} className="flex items-center" style={{ padding: '14px 20px', borderRight: i < arr.length - 1 ? '1px solid #E0E5EB' : 'none', gap: 8 }}>
                {s.icon}
                <div>
                  <div style={{ ...ns, fontSize: 16, fontWeight: 700, color: '#15191F' }}>{s.val}</div>
                  <div style={{ ...ns, fontSize: 11, color: '#8596AD' }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex" style={{ gap: 40 }}>
          {/* Format list */}
          <div className="flex-1 min-w-0">
            <h2 style={{ ...ns, fontSize: 18, fontWeight: 700, color: '#15191F', marginBottom: 20 }}>How would you like to publish?</h2>
            <div className="flex flex-col" style={{ gap: 10 }}>
              {PUBLISH_FORMATS.map(f => {
                const isLocked = shouldShowTierBadge(currentPlan, f.requiredPlan);
                return (
                <button key={f.id}
                  onClick={() => setFormat(f.id)}
                  className="flex items-center text-left cursor-pointer relative"
                  style={{ gap: 14, padding: '16px 18px', borderRadius: 10, border: `2px solid ${format === f.id ? '#006EFE' : '#E0E5EB'}`, background: '#fff', transition: 'border-color 0.12s' }}>
                  {/* radio — locked formats are selectable too; the gate only kicks in at Publish */}
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${format === f.id ? '#006EFE' : '#C5CDD9'}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {format === f.id && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#006EFE' }}/>}
                  </div>
                  <FormatIcon id={f.id} />
                  <div className="flex-1">
                    <div style={{ ...ns, fontSize: 15, fontWeight: 600, color: '#15191F' }}>{f.label}</div>
                    <div style={{ ...ns, fontSize: 13, color: '#8596AD' }}>{f.sub}</div>
                  </div>
                  {isLocked && (
                    <div style={{ flexShrink: 0 }}>
                      <TierBadge tier={f.requiredPlan!} />
                    </div>
                  )}
                </button>
                );
              })}
            </div>
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

    {/* Success modal overlay */}
    {published && (
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm overflow-y-auto flex items-start justify-center" style={{ padding: '48px 24px' }}>
        <div className="w-full" style={{ maxWidth: 720, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
          {/* Dark header with book cover */}
          <div className="relative flex items-center justify-center" style={{ background: template.bg, minHeight: 230 }}>
            <button
              onClick={onBack}
              style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
            <div style={{ width: 148, borderRadius: 8, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.5)', margin: '28px 0 32px' }}>
              <TemplateCover t={template} height={197} title={DOC_TITLE} />
            </div>
          </div>

          {/* White content */}
          <div style={{ background: '#fff', padding: '28px 48px 40px' }}>
            <h2 style={{ ...ns, fontSize: 22, fontWeight: 700, color: '#15191F', marginBottom: 16 }}>Your eBook is now live!</h2>

            {/* URL row */}
            <div className="flex items-center" style={{ gap: 8, marginBottom: 24 }}>
              <div className="flex-1 flex items-center" style={{ background: '#F6F7F9', borderRadius: 8, padding: '10px 14px', minWidth: 0 }}>
                <span className="truncate" style={{ ...ns, fontSize: 13, color: '#52637A' }}>{mockUrl}</span>
              </div>
              <button onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#006EFE', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1"/></svg>
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#15191F', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', flexShrink: 0 }}>Download</button>
            </div>

            {/* Turn into Presentation nudge */}
            <div style={{ borderRadius: 12, background: 'linear-gradient(135deg,#0A1628 0%,#1A1060 60%,#2D1B8A 100%)', padding: '18px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flexShrink: 0, width: 72, height: 50, borderRadius: 6, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ width: '70%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.55)' }}/>
                <div style={{ width: '100%', height: 2.5, borderRadius: 2, background: 'rgba(255,255,255,0.22)' }}/>
                <div style={{ width: '85%', height: 2.5, borderRadius: 2, background: 'rgba(255,255,255,0.22)' }}/>
                <div style={{ width: '60%', height: 2.5, borderRadius: 2, background: 'rgba(255,255,255,0.22)' }}/>
              </div>
              <div className="flex flex-col flex-1 min-w-0" style={{ gap: 2 }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <p style={{ ...ns, fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>Turn into Presentation</p>
                  {isPresentationLocked && (
                    <span style={{ ...ns, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, color: '#fff', background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999, padding: '2px 8px' }}>
                      PRO
                    </span>
                  )}
                </div>
                <p style={{ ...ns, fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.45 }}>
                  Repurpose your content as a polished slide deck in minutes
                </p>
              </div>
              <button
                onClick={handleTurnIntoPresentation}
                style={{ flexShrink: 0, ...ns, fontSize: 13, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', whiteSpace: 'nowrap', backdropFilter: 'blur(4px)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.24)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
              >
                Create slides →
              </button>
            </div>

            {/* Socials */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ ...ns, fontSize: 15, fontWeight: 700, color: '#15191F', marginBottom: 10 }}>Socials</p>
              <div className="flex" style={{ gap: 8 }}>
                {[
                  { label: 'Facebook', bg: '#1877F2', icon: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" fill="none"/> },
                  { label: 'X', bg: '#000', icon: <path d="M4 4l16 16M20 4L4 20" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/> },
                  { label: 'LinkedIn', bg: '#0A66C2', icon: <><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" fill="none"/><rect x="2" y="9" width="4" height="12" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" fill="none"/><circle cx="4" cy="4" r="2" stroke="#fff" strokeWidth="1.5" fill="none"/></> },
                ].map(s => (
                  <button key={s.label}
                    style={{ width: 40, height: 40, borderRadius: 10, background: s.bg, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">{s.icon}</svg>
                  </button>
                ))}
              </div>
            </div>

            {/* Promote */}
            <div>
              <p style={{ ...ns, fontSize: 15, fontWeight: 700, color: '#15191F', marginBottom: 10 }}>Promote your eBook</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {([
                  { icon: '🌐', label: 'Create landing page' },
                  { icon: '📦', label: 'Create 3d covers & Mockups', requiredPlan: 'pro' as const },
                  { icon: '📱', label: 'Generate QR code' },
                  { icon: '✉️', label: 'Share with e-mail' },
                ]).map(a => {
                  const isLocked = shouldShowTierBadge(currentPlan, a.requiredPlan);
                  return (
                  <button key={a.label}
                    onClick={() => {
                      if (isLocked && a.requiredPlan) setUpgradeCtx({ message: `Unlock ${a.label}`, planId: a.requiredPlan, feature: a.label });
                    }}
                    className="relative"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 10, border: '1px solid #E0E5EB', background: '#fff', cursor: 'pointer', ...ns, fontSize: 14, fontWeight: 500, color: '#15191F' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#F6F7F9'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                    <span style={{ fontSize: 18 }}>{a.icon}</span>
                    {a.label}
                    {isLocked && (
                      <div className="flex-shrink-0" style={{ marginLeft: 'auto' }}>
                        <TierBadge tier={a.requiredPlan!} size="sm" />
                      </div>
                    )}
                  </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
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

const MOCK_PARAGRAPHS = [
  "I used to believe I wasn't doing enough. I needed to read one more book, listen to one more podcast, take one more course. Instead, I felt exhausted. My brain was in a constant state of seeking. I'd lie in bed at night, replaying conversations, second-guessing my decisions, berating myself for not having the answers—even in domains I was only just learning, coming from—only that I couldn't.",
  "That pressure came with me everywhere. Into meetings. Into quiet weekend mornings. Into relationships. I was living under the assumption that if I just consumed more, thought more, prepared more, I'd finally feel ready. Whenever I hit a gap in my knowledge, I didn't lean in with curiosity. I panicked. I'd spend hours researching trying to feel on top of something before engaging with it. The irony was that the more I learned, the wider my sense of what I didn't know became—fueling the cycle. I was chasing a finish line that kept moving.",
  "The breaking point came during a week that, on paper, should have been unremarkable. I was facing a handful of small decisions—nothing life-altering—and I froze. I couldn't choose a direction for a project because I hadn't analyzed every precedent. I couldn't respond to a simple email because I wasn't sure of the perfect phrasing. My brain had become so trained to demand certainty that it had forgotten how to move without it. In that stillness, something shifted.",
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// BookEditorView.tsx owns this exact key/shape (see its own STORAGE_KEY/PersistedBook) —
// duplicated here rather than imported since these are two independent prototype flows
// with no shared module boundary today. Keep the field names/shape below in sync with
// PersistedBook if that ever changes.
const BOOK_EDITOR_STORAGE_KEY = 'designrr.book.editor.v1';

// A cover page's background AND every chapter/TOC/backmatter page's background both
// read from the same theme.bg — there's no separate "cover-only" background slot in
// BookEditorView's theme model. So the wizard's vivid gradient can't safely become
// theme.bg (it would paint every body page too, wrecking text legibility) — instead
// it becomes a full-bleed background SHAPE on just the cover page's own coverElements,
// which is already a per-page override independent of the shared theme. Body pages
// stay on the safe, neutral 'statement-lettering' theme regardless of which template
// was picked in the wizard.
function flattenBg(bg: string): string {
  const hexes = bg.match(/#[0-9a-fA-F]{3,8}/g);
  if (!hexes || hexes.length === 0) return bg; // already a plain CSS color
  return hexes[hexes.length - 1]; // gradients here run light→dark at 160deg; the darker stop is the safer flat fallback for light cover text
}

/* Converts what the wizard actually generated (a title + one heading/subheading/
   paragraphs document — see WritingContentView above) into the exact JSON shape
   BookEditorView's own loadBook()/PersistedBook expects, so "Edit design" opens a
   real reflection of the reviewed book instead of the editor's unrelated demo
   content. Structural conversion, not decoration: H2 sections become chapters
   (matching BookEditorView's own convention that a chapter's H3s are sub-headings
   inside its body, not separate chapters — see deriveSubheadings there), so this
   still does the right thing if MOCK_PARAGRAPHS/sections ever grow beyond one. */
function buildEditorSeedFromWizard(docTitle: string, template: Template) {
  const chapterId = 'ch-1';
  const bodyHtml = `<h3>My Story</h3>${MOCK_PARAGRAPHS.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}`;

  const pages = [
    {
      id: 'p-cover',
      type: 'cover',
      title: 'Cover',
      coverElements: [
        { id: 'bg', type: 'shape', shape: 'rectangle', x: 0, y: 0, w: 100, h: 100, color: flattenBg(template.bg) },
        { id: 'title', type: 'text', role: 'title', x: 8, y: 34, w: 84, h: 32, fontFamily: "'Nunito Sans', sans-serif", fontSize: 40, fontWeight: 800, color: template.textColor, textAlign: 'center' },
        { id: 'rule', type: 'shape', shape: 'rectangle', x: 35, y: 68, w: 30, h: 1.1, color: template.accentColor },
        { id: 'auth', type: 'text', role: 'author', x: 10, y: 91, w: 80, h: 5, fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, fontWeight: 700, color: template.textColor, textAlign: 'center' },
      ],
    },
    { id: 'p-toc', type: 'toc', title: 'Table of Contents' },
    {
      id: chapterId, type: 'chapter', title: 'Introduction', layout: 'opener', overrides: {},
      titleHtml: '<h2>Introduction</h2>',
      initialHtml: bodyHtml,
    },
    { id: 'p-back', type: 'backmatter', title: 'About the Author' },
  ];

  return {
    version: 1,
    pages,
    metadata: {
      title: docTitle, subtitle: '', author: '', identifier: '', language: 'en',
      publisher: '', description: '', subjects: '', seriesName: '', seriesPosition: '', readingDirection: 'ltr',
    },
    pageNumbers: { enabled: true, position: 'footer-center', style: 'numeric', startAt: 1, skipCoverAndBackMatter: true },
    activeTheme: 'statement-lettering',
    chapterContent: { [chapterId]: bodyHtml },
    fieldContent: { 'p-cover::title': `<p>${escapeHtml(docTitle)}</p>` },
    savedAt: Date.now(),
  };
}

function openInEditor(router: ReturnType<typeof useRouter>, docTitle: string, template: Template) {
  try {
    window.localStorage.setItem(BOOK_EDITOR_STORAGE_KEY, JSON.stringify(buildEditorSeedFromWizard(docTitle, template)));
  } catch { /* storage unavailable/full — editor still opens, just with its own demo content */ }
  router.push('/book/editor');
}

function WritingContentView({ onChooseFormat }: { onChooseFormat: () => void }) {
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

      {/* Manuscript content */}
      <div className="flex-1 overflow-y-auto bg-white" style={{ padding: '40px 0' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 48px' }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 700, color: '#15191F', lineHeight: 1.3, marginBottom: 32 }}>{DOC_TITLE}</h1>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 700, color: '#15191F', marginBottom: 16 }}>Introduction</h2>
          <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 600, color: '#15191F', marginBottom: 14 }}>My Story</h3>
          {MOCK_PARAGRAPHS.map((p, i) => (
            <p key={i} style={{ ...ns, fontSize: 15, color: '#29323D', lineHeight: 1.8, marginBottom: 20 }}>{p}</p>
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
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(TEMPLATES[1]);

  const handleSaveThemes = (themes: string[]) => {
    setSelectedThemes(themes);
    setShowThemesModal(false);
    setStep(3);
  };

  const handleUseTemplate = (t: Template) => {
    setSelectedTemplate(t);
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
              <WritingContentView onChooseFormat={() => setShowThemesModal(true)} />
            </motion.div>
          )}
          {step === 3 && (
            <motion.div key="step3" className="absolute inset-0"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.22 }}>
              <TemplateGallery selectedThemes={selectedThemes} onUse={handleUseTemplate} onBack={() => setStep(2)} />
            </motion.div>
          )}
          {step === 4 && (
            <motion.div key="step4" className="absolute inset-0"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.22 }}>
              <ReviewView template={selectedTemplate} onPublish={() => setStep(5)} />
            </motion.div>
          )}
          {step === 5 && (
            <motion.div key="step5" className="absolute inset-0"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.22 }}>
              <PublishView template={selectedTemplate} onBack={() => setStep(4)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Themes modal */}
      <AnimatePresence>
        {showThemesModal && (
          <ThemesModal
            docTitle={DOC_TITLE}
            initial={selectedThemes}
            onSave={handleSaveThemes}
            onClose={() => setShowThemesModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
