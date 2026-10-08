'use client';

/* ── One publish vocabulary for the whole book product ───────────────────────
   The wizard's last step and the editor's Publish screen are the same act at two
   moments, and they had drifted into two different products: the wizard offered
   the real five formats on radio rows with a hosted-link success screen, while
   the editor offered EPUB-with-its-own-button and a greyed "Print PDF — Not
   built" card. On the default Standard plan that left the editor's Publish page
   with exactly one action — "Upgrade to Pro" — and no way to publish anything at
   all, for a format set that is free in the real product.

   Everything both screens share lives here: the format list, the format icons,
   the stat row, and the post-publish screen. Neither screen owns a private copy,
   so a format added here appears in both. */

import { useState, type ReactElement, type ReactNode } from 'react';
import { TierBadge, shouldShowTierBadge, type GateTier } from '../ui/TierBadge';
import type { PlanId } from '@/stores/flowStore';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

export interface PublishFormat {
  id: string;
  label: string;
  sub: string;
  badgeBg: string;
  badgeText: string;
  icon: string;
  requiredPlan?: GateTier;
  /** True where the prototype can really produce the file (see epub.ts). */
  real?: boolean;
}

/* The real product's set, in the real product's order: PDF leads and is free,
   and nothing here is a press-ready print book — a Designrr PDF is a screen
   document read in Adobe Reader. */
export const PUBLISH_FORMATS: PublishFormat[] = [
  { id: 'pdf',      label: 'PDF',      sub: 'For adobe reader',        badgeBg: '#FEE2E2', badgeText: '#B91C1C',  icon: 'pdf' },
  { id: 'flipbook', label: 'Flipbook', sub: 'Set your book in motion', badgeBg: '#EDE9FE', badgeText: '#7C3AED',  icon: 'flipbook' },
  { id: 'kindle',   label: 'Kindle',   sub: 'E-pub export',            badgeBg: '#FEF3C7', badgeText: '#92400E',  icon: 'kindle', requiredPlan: 'pro', real: true },
  { id: 'html',     label: 'HTML',     sub: 'Export html',             badgeBg: '#DBEAFE', badgeText: '#1D4ED8',  icon: 'html', requiredPlan: 'premium' },
  { id: 'epub',     label: 'EPUB',     sub: 'For e-readers',           badgeBg: '#D1FAE5', badgeText: '#065F46',  icon: 'epub', requiredPlan: 'pro', real: true },
];

/* One line each, and only the line that changes what the author gets. The EPUB
   row used to carry a five-sentence paragraph about XHTML and navigation
   documents — packaging internals the author can do nothing with. What they can
   act on is reflowable vs fixed, because it decides whether the page size and
   margins they spent an hour on survive. */
export const FORMAT_NOTES: Record<string, string> = {
  pdf: 'Fixed pages. Your page size, margins and page numbers arrive exactly as you set them.',
  flipbook: 'A hosted page that turns like a book, read in a browser with nothing to download.',
  kindle: 'Packaged as EPUB for your Kindle library. Reflowable, so the device sets the page.',
  html: 'A web page per chapter with the images alongside, to host anywhere.',
  epub: 'Reflowable, the format Kindle, Apple Books, Kobo and Google Play all accept. The reader’s device sets the page, so page size, margins and page numbers don’t carry over — everything else does.',
};

export function FormatIcon({ id }: { id: string }) {
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

/* ── The format chooser ──────────────────────────────────────────────────────
   Locked formats stay selectable and full-strength: the gate fires on Publish,
   where it can say what it costs, rather than greying a row into something that
   reads as broken. */
export function PublishFormatList({ value, onChange, currentPlan }: {
  value: string;
  onChange: (id: string) => void;
  currentPlan: PlanId;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      {PUBLISH_FORMATS.map((f) => {
        const isLocked = shouldShowTierBadge(currentPlan, f.requiredPlan);
        return (
          <button
            key={f.id}
            onClick={() => onChange(f.id)}
            className="flex items-center text-left cursor-pointer relative"
            style={{ gap: 14, padding: '16px 18px', borderRadius: 10, border: `2px solid ${value === f.id ? '#006EFE' : '#E0E5EB'}`, background: '#fff', transition: 'border-color 0.12s' }}
          >
            <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${value === f.id ? '#006EFE' : '#C5CDD9'}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {value === f.id && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#006EFE' }} />}
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
  );
}

/* ── What is being published ─────────────────────────────────────────────── */
export interface PublishStats { pages: number; chapters: number; words: number; readTime: number }

export function PublishStatsRow({ stats }: { stats: PublishStats }) {
  const items = [
    { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/></svg>, val: String(stats.pages), label: 'Pages' },
    { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.6"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="4" y1="14" x2="14" y2="14"/></svg>, val: String(stats.chapters), label: 'Chapters' },
    { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.6" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h8"/></svg>, val: stats.words.toLocaleString(), label: 'Words' },
    { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>, val: String(stats.readTime), label: 'Read time' },
  ];
  return (
    <div className="flex items-center" style={{ gap: 0, border: '1px solid #E0E5EB', borderRadius: 10, overflow: 'hidden' }}>
      {items.map((s, i) => (
        <div key={s.label} className="flex items-center" style={{ padding: '14px 20px', borderRight: i < items.length - 1 ? '1px solid #E0E5EB' : 'none', gap: 8 }}>
          {s.icon}
          <div>
            <div style={{ ...ns, fontSize: 16, fontWeight: 700, color: '#15191F' }}>{s.val}</div>
            <div style={{ ...ns, fontSize: 11, color: '#8596AD' }}>{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── The moment after publishing ─────────────────────────────────────────────
   A Designrr publish produces a hosted book, not just a file on disk — so this
   screen leads with the link, and the download sits beside it. The editor used
   to end a publish with a line of grey text inside a card ("Downloaded · 412 KB")
   and no link at all, which is a smaller thing than the product actually does. */
export function PublishedPanel({
  cover, coverBg, url, onClose, onDownload, downloadLabel = 'Download',
  currentPlan, onUpgrade, onTurnIntoPresentation, position = 'absolute', note,
}: {
  cover: ReactNode;
  coverBg: string;
  url: string;
  onClose: () => void;
  /** Omitted where the prototype has no real file to hand over. */
  onDownload?: () => void;
  downloadLabel?: string;
  currentPlan: PlanId;
  onUpgrade: (ctx: { message: string; planId: GateTier; feature: string }) => void;
  onTurnIntoPresentation: () => void;
  /** The wizard fills a relative step container; the editor covers the window. */
  position?: 'absolute' | 'fixed';
  /** Anything the packager wants to say about the file it just wrote. */
  note?: string;
}) {
  const [copied, setCopied] = useState(false);
  // Presentations are Pro+ (see HomePageStandard's locked hub chip).
  const isPresentationLocked = shouldShowTierBadge(currentPlan, 'pro');

  return (
    <div className={`${position === 'fixed' ? 'fixed' : 'absolute'} inset-0 bg-black/20 backdrop-blur-sm overflow-y-auto flex items-start justify-center`} style={{ padding: '48px 24px', zIndex: 210 }}>
      <div className="w-full" style={{ maxWidth: 720, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
        {/* Dark header with the book cover */}
        <div className="relative flex items-center justify-center" style={{ background: coverBg, minHeight: 230 }}>
          <button
            onClick={onClose}
            style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
          <div style={{ width: 148, borderRadius: 8, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.5)', margin: '28px 0 32px', lineHeight: 0 }}>
            {cover}
          </div>
        </div>

        {/* White content */}
        <div style={{ background: '#fff', padding: '28px 48px 40px' }}>
          <h2 style={{ ...ns, fontSize: 22, fontWeight: 700, color: '#15191F', marginBottom: 16 }}>Your eBook is now live!</h2>

          {/* URL row */}
          <div className="flex items-center" style={{ gap: 8, marginBottom: note ? 10 : 24 }}>
            <div className="flex-1 flex items-center" style={{ background: '#F6F7F9', borderRadius: 8, padding: '10px 14px', minWidth: 0 }}>
              <span className="truncate" style={{ ...ns, fontSize: 13, color: '#52637A' }}>{url}</span>
            </div>
            <button onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#006EFE', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1"/></svg>
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <button onClick={onDownload}
              style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#15191F', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', flexShrink: 0 }}>{downloadLabel}</button>
          </div>
          {note && <div style={{ ...ns, fontSize: 12.5, color: '#52637A', marginBottom: 24 }}>{note}</div>}

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
              onClick={onTurnIntoPresentation}
              style={{ flexShrink: 0, ...ns, fontSize: 13, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', whiteSpace: 'nowrap', backdropFilter: 'blur(4px)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.24)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
            >
              Create slides &rarr;
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
                <button key={s.label} aria-label={`Share on ${s.label}`}
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
                { icon: '\u{1F310}', label: 'Create landing page' },
                { icon: '\u{1F4E6}', label: 'Create 3d covers & Mockups', requiredPlan: 'pro' as const },
                { icon: '\u{1F4F1}', label: 'Generate QR code' },
                { icon: '✉️', label: 'Share with e-mail' },
              ]).map(a => {
                const isLocked = shouldShowTierBadge(currentPlan, a.requiredPlan);
                return (
                  <button key={a.label}
                    onClick={() => { if (isLocked && a.requiredPlan) onUpgrade({ message: `Unlock ${a.label}`, planId: a.requiredPlan, feature: a.label }); }}
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
  );
}
