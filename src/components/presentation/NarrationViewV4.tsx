'use client';

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePresentationFlowStore, type PresentationSlide } from '@/stores/presentationFlowStore';
import { MOCK_THEMES, type MockTheme } from '@/lib/presentationMocks';
import { useFlowStore } from '@/stores/flowStore';
import { useVideoFlowStore } from '@/stores/videoFlowStore';
import { SideMenuIcon } from '@/components/sidebar/AppSidebar';
// Same entrance motion as the book-flow Wordgenie chat (ChatMessage.tsx) — reusing the
// shared variants instead of inventing studio-specific timing keeps every Wordgenie surface
// in the app moving the same way.
import { messageVariants } from '@/lib/animations';

// Figma's "AI dark mode" color style — a lighter, cooler blue-to-violet than the light-mode
// brand gradient (#006EFE→#5326BD), tuned to read correctly against a near-black canvas instead
// of white. This whole view is a dark surface, so every AI-branded gradient use here should
// pull from this token rather than the light-mode one.
const WG_GRADIENT = 'linear-gradient(135deg, #4C8DFF 0%, #8B6FF0 100%)';
const WG_FROM = '#4C8DFF';
const WG_TO = '#8B6FF0';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

/* ─────────────────────────────────────────────────────────────────
   V3 concept: studio-first. Land directly in a record-ready studio
   instead of a three-way method picker — recording is the default
   path, AI voice and upload are secondary links next to it. Once
   capture starts, everything but the recording controls disappears.

   Adds video: audio-only remains the default, but a slide can opt
   into a camera take, laid out either as a corner bubble or as a
   side-by-side pane next to the slide. Mixed types per slide are
   preserved from V2 — the change is what greets you before you've
   made a choice, not the underlying per-slide model.

   Export follows what's actually been narrated: only slides with a
   ready/stale take are included in review + export. No separate
   include/exclude toggle — deleting a slide's take is what excludes
   it, keeping the mental model to one bit per slide.
   ───────────────────────────────────────────────────────────────── */

type SourceKind = 'ai' | 'record' | 'upload';
// Used only by the light-mode ChangeSourceMenu picker dots now — the dark studio's own status
// indicators (filmstrip, rail, top badge) all read as neutral instead, matching every other
// status/action surface in that chrome (see SOURCE_LABELS below for why: the text already
// disambiguates record/AI/upload, so a third color-coded layer on top of icon + text was just
// redundant decoration, and inconsistent with everything else in the dark studio being neutral).
const SOURCE_COLORS: Record<SourceKind, string> = { record: '#B8540A', ai: '#7C3AED', upload: '#0A7D5C' };
// Past-tense, for labeling a slide's *completed* take (filmstrip status, rail tooltip) — distinct
// from ChangeSourceMenu's present-tense picker labels ("Record"/"AI voice"/"Upload"), which name
// the mode you'd switch to, not what already happened.
const SOURCE_LABELS: Record<SourceKind, string> = { record: 'Recorded', ai: 'AI voice', upload: 'Uploaded' };
type AudioStatus = 'empty' | 'generating' | 'recording' | 'ready' | 'stale';
type Step = 'clone' | 'workspace' | 'review' | 'export';
type CaptureScope = 'single' | 'multi';
type CaptureMode = 'audio' | 'video';
type CameraLayout = 'bubble' | 'sideBySide';

interface SlideAudio {
  source: SourceKind;
  methodSet: boolean;   // false = user hasn't chosen yet → the studio canvas owns this slide
  scopeSet: boolean;    // true once a take's scope (this slide / remaining / all) is settled
  scope: CaptureScope;
  voiceId: string;
  status: AudioStatus;
  duration: number;
  fileName?: string;
  segStart?: number;
  segEnd?: number;
  captureMode: CaptureMode;     // only meaningful when source === 'record'
  cameraLayout: CameraLayout;   // only meaningful when captureMode === 'video'
}

function freshAudio(voiceId: string): SlideAudio {
  return { source: 'record', methodSet: false, scopeSet: false, scope: 'single', voiceId, status: 'empty', duration: 0, captureMode: 'audio', cameraLayout: 'bubble' };
}

// Gradient per voice for the picker's avatar circles — makes each voice read as a distinct
// persona at a glance instead of a plain text row. Fixed, not derived, since there are only a
// handful of known voices; CLONE_VOICE_ID gets its own below.
const VOICE_AVATAR_GRADIENT: Record<string, string> = {
  aria: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
  marcus: 'linear-gradient(135deg, #0EA5E9, #0284C7)',
  sofia: 'linear-gradient(135deg, #F97316, #EA580C)',
  james: 'linear-gradient(135deg, #10B981, #059669)',
  'your-voice': 'linear-gradient(135deg, #F43F5E, #E11D48)',
};

const AI_VOICES = [
  { id: 'aria',   name: 'Aria',   accent: 'American' },
  { id: 'marcus', name: 'Marcus', accent: 'British' },
  { id: 'sofia',  name: 'Sofia',  accent: 'Australian' },
  { id: 'james',  name: 'James',  accent: 'American' },
];
const CLONE_VOICE_ID = 'your-voice';

// Inferred from the wordgenie brief's own wording rather than a separate tone picker — "a
// punchy, upbeat explainer" should change the script without asking the user to also fill in
// a tone dropdown that just repeats what they already said.
type ScriptTone = 'casual' | 'professional' | 'energetic' | 'default';
function toneFromBrief(brief: string): ScriptTone {
  const b = brief.toLowerCase();
  if (/\b(casual|friendly|conversational|relaxed|chill)\b/.test(b)) return 'casual';
  if (/\b(professional|formal|corporate|business|polished)\b/.test(b)) return 'professional';
  if (/\b(energetic|exciting|upbeat|punchy|hype|fun)\b/.test(b)) return 'energetic';
  return 'default';
}
const OPENERS_BY_TONE: Record<ScriptTone, (title: string) => string[]> = {
  default: title => [`Let's talk about ${title}.`, `Now we'll look at ${title}.`, `${title} is worth understanding in detail.`],
  casual: title => [`So, let's dive into ${title}.`, `Okay, let's chat about ${title}.`, `Here's the deal with ${title}.`],
  professional: title => [`We'll now examine ${title}.`, `Let's turn our attention to ${title}.`, `This section covers ${title}.`],
  energetic: title => [`Get ready — ${title} is a game changer.`, `Let's jump straight into ${title}!`, `Here's why ${title} matters, right now.`],
};
// A script is what gets said out loud, not a bullet list of talking points (that's what the
// presenter-notes feature in the editor is for) — so slide one needs an actual greeting and
// theme intro, not just a rephrased title, the same way a real presenter would open a video.
const GREETING_BY_TONE: Record<ScriptTone, (title: string) => string> = {
  default: title => `Hi everyone, thanks for joining. Today we're going to look at ${title}.`,
  casual: title => `Hey everyone, thanks for hopping in — today we're diving into ${title}.`,
  professional: title => `Good day, and thank you for joining. Today we'll be covering ${title}.`,
  energetic: title => `Hey everyone! Welcome — I'm so excited to show you ${title} today!`,
};

function mockGenerateScript(slide: PresentationSlide, tone: ScriptTone = 'default', isFirst = false): string {
  const title = slide.title ?? '';
  const points = slide.points.filter(p => p.trim());
  const parts: string[] = [];
  if (isFirst && title) {
    parts.push(GREETING_BY_TONE[tone](title.toLowerCase()));
  } else if (title) {
    const openers = OPENERS_BY_TONE[tone](title.toLowerCase());
    parts.push(openers[title.length % openers.length]);
  }
  if (points.length === 1) {
    parts.push(`The key point here is that ${points[0].replace(/\.$/, '').toLowerCase()}.`);
  } else if (points.length > 1) {
    const connectors = ['First,', 'Second,', 'Third,', 'Fourth,', 'And finally,'];
    points.forEach((pt, i) => {
      const clean = pt.replace(/\.$/, '');
      parts.push(`${connectors[i] ?? 'Also,'} ${clean.charAt(0).toLowerCase() + clean.slice(1)}.`);
    });
  }
  return parts.join(' ') || 'Add your narration for this slide here.';
}

// Generating a script shouldn't erase notes you already wrote — your bullets stay, the
// generated narration is added as the expanded context underneath, not a replacement.
// Turns one of your own bullets into a line that actually matches what the bullet says —
// "short introduction" should read like an opener, not a generic "now we'll look at..."
// restatement of the slide title. Falls back to paraphrasing the bullet itself.
function scriptLineForBullet(bullet: string, title: string): string {
  const b = bullet.toLowerCase();
  if (/\b(intro|introduction|welcome|hello)\b/.test(b)) {
    return `Hello everyone, my name is [your name], and today I'll be walking you through ${title.toLowerCase() || 'this'}.`;
  }
  if (/\b(anecdote|story|example)\b/.test(b)) {
    return `Let me share a quick story that brings this to life.`;
  }
  if (/\b(closing|conclusion|summary|wrap.?up|recap)\b/.test(b)) {
    return `To wrap things up, let's quickly recap what we covered.`;
  }
  if (/\b(question|q\s*&\s*a|questions)\b/.test(b)) {
    return `Now I'd love to hear your questions.`;
  }
  if (/\b(agenda|overview)\b/.test(b)) {
    return `Here's a quick overview of what we'll cover today.`;
  }
  const clean = bullet.replace(/^[-*•]\s*/, '').trim();
  return clean ? `Let's talk about ${clean.charAt(0).toLowerCase() + clean.slice(1)}.` : '';
}

function expandScript(existing: string, slide: PresentationSlide, tone: ScriptTone = 'default', isFirst = false): string {
  const trimmed = existing.trim();
  const lines = trimmed.split('\n');
  const hasBullets = lines.some(l => /^[-*•]\s*/.test(l.trim()));
  if (hasBullets) {
    // A script is what gets read out loud, so each bullet is *replaced* by its spoken
    // sentence, not kept alongside it — nobody reads "- Introduction" verbatim on camera.
    // Non-bullet lines (notes the user already wrote as prose) pass through untouched.
    const out: string[] = [];
    let bulletIdx = 0;
    for (const raw of lines) {
      const line = raw.trim();
      if (/^[-*•]\s*/.test(line)) {
        const gen = isFirst && bulletIdx === 0
          ? GREETING_BY_TONE[tone](slide.title?.toLowerCase() ?? '')
          : scriptLineForBullet(line, slide.title ?? '');
        if (gen) out.push(gen);
        bulletIdx++;
      } else if (line) {
        out.push(raw);
      }
    }
    return out.join('\n\n');
  }
  // No bullets left to expand — this is either a blank slide or a script from a *previous*
  // generate/regenerate call. Either way, "Generate script" is a regenerate here, not an
  // append: clicking it repeatedly on the same slide should give you a fresh take each time,
  // not a growing stack of "version 1 / version 2 / ..." paragraphs glued together.
  return mockGenerateScript(slide, tone, isFirst);
}

function scriptFromSlide(slide: PresentationSlide): string {
  const lines: string[] = [];
  if (slide.title) lines.push(slide.title + '.');
  slide.points.forEach(p => { if (p) lines.push(p + '.'); });
  return lines.join(' ');
}
function estimateSecs(script: string) {
  return Math.max(4, Math.round(script.split(' ').filter(Boolean).length / 2.5));
}
function formatTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.round(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
function hexLuminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length < 6) return 1;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function isDarkBg(hex: string): boolean { return hexLuminance(hex) < 0.35; }

/* ─────────────────────────────────────────────────────────────────
   Viewport-aware positioning for this studio's hand-rolled tooltips
   and dropdown menus. Everything here used to anchor to a hardcoded
   corner (e.g. always open upward-right), which broke the moment a
   trigger sat near the edge it opened toward — most visibly the
   teleprompter box, which can be dragged to any corner of the screen.
   Both helpers re-measure the trigger against the viewport at the
   moment of interaction (hover/open), not just once on mount, so they
   track triggers that move (drag) or resize (panel width) too.
   ───────────────────────────────────────────────────────────────── */
const EDGE_MARGIN = 8;

// Three fixed paces instead of a continuous 0-100 slider — reading pace only really has three
// states anyone cares about (too slow, fine, too fast), and a slider implies a level of fine
// tuning this doesn't need for launch.
const SCROLL_SPEED_PRESETS = { slow: 20, normal: 50, fast: 80 } as const;

// Dark-mode hover tooltip (the "opacity-0 group-hover:opacity-100" span pattern used across
// this studio), portal-rendered so it can never get clipped by an ancestor's overflow:hidden —
// e.g. the docked script panel's card, which clips anything that tries to render above its own
// top edge even when the viewport itself has plenty of room. Positioned in fixed/viewport
// coordinates from the trigger's actual measured rect, anchored on one edge only (left OR
// right, top OR bottom) so the browser grows the box in the right direction without needing to
// know the tooltip's own rendered size up front.
function StudioTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ v: 'top' | 'bottom'; top: number; bottom: number; left: number; ready: boolean } | null>(null);
  const handleEnter = () => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const estW = Math.max(90, label.length * 6.2 + 20);
    const estH = 30;
    const v = rect.top - estH - EDGE_MARGIN < 0 ? 'bottom' : 'top';
    // First paint only — real width isn't known until it's actually rendered (see the
    // useLayoutEffect below), so this estimate just picks a reasonable spot to mount invisibly.
    const centered = rect.left + rect.width / 2 - estW / 2;
    const left = Math.min(Math.max(centered, EDGE_MARGIN), window.innerWidth - estW - EDGE_MARGIN);
    setPos({ v, top: rect.bottom + 8, bottom: window.innerHeight - rect.top + 8, left, ready: false });
  };
  // The estimate above assumes a flat px-per-character rate that doesn't track this font/weight
  // closely enough — short bold labels over narrow icon buttons (e.g. "Start recording" over the
  // 46px record button) came out visibly off-center. Once the label's actually laid out, its
  // real measured width replaces the guess and the tooltip reveals already centered, rather than
  // visibly snapping into place.
  useLayoutEffect(() => {
    if (!pos || pos.ready || !ref.current || !tipRef.current) return;
    const rect = ref.current.getBoundingClientRect();
    const tipWidth = tipRef.current.getBoundingClientRect().width;
    const centered = rect.left + rect.width / 2 - tipWidth / 2;
    const left = Math.min(Math.max(centered, EDGE_MARGIN), window.innerWidth - tipWidth - EDGE_MARGIN);
    setPos(p => (p && !p.ready ? { ...p, left, ready: true } : p));
  }, [pos]);
  return (
    <div ref={ref} onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)} className="relative inline-flex">
      {children}
      {pos && typeof document !== 'undefined' && createPortal(
        <span ref={tipRef} className="pointer-events-none" style={{ position: 'fixed',
            ...(pos.v === 'top' ? { bottom: pos.bottom } : { top: pos.top }),
            left: pos.left, opacity: pos.ready ? 1 : 0,
            whiteSpace: 'nowrap', background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7,
            padding: '5px 9px', ...ns, fontSize: 11, fontWeight: 600, color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 1000 }}>
          {label}
        </span>,
        document.body
      )}
    </div>
  );
}

// Dropdown-menu placement — same idea, driven by `open` instead of hover, and returns the ref
// to attach to the same position:relative wrapper every menu here already has (so it doubles as
// both the click-outside boundary and the measurement target).
function useMenuPlacement<T extends HTMLElement = HTMLDivElement>(open: boolean, opts: {
  width: number; height: number; preferV?: 'top' | 'bottom'; preferH?: 'left' | 'right';
}) {
  const { width, height, preferV = 'bottom', preferH = 'left' } = opts;
  const ref = useRef<T>(null);
  const [placement, setPlacement] = useState<{ v: 'top' | 'bottom'; h: 'left' | 'right' }>({ v: preferV, h: preferH });
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const v = preferV === 'top'
      ? (rect.top - height - EDGE_MARGIN < 0 ? 'bottom' : 'top')
      : (rect.bottom + height + EDGE_MARGIN > window.innerHeight ? 'top' : 'bottom');
    const h = preferH === 'left'
      ? (rect.left + width + EDGE_MARGIN > window.innerWidth ? 'right' : 'left')
      : (rect.right - width - EDGE_MARGIN < 0 ? 'left' : 'right');
    setPlacement({ v, h });
    // Re-run every time it opens, not just once — a trigger that moved (drag) or resized
    // (panel width) since the last open needs a fresh measurement, not a stale one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const style: React.CSSProperties = {
    position: 'absolute',
    ...(placement.v === 'top' ? { bottom: 'calc(100% + 8px)' } : { top: 'calc(100% + 8px)' }),
    ...(placement.h === 'left' ? { left: 0 } : { right: 0 }),
  };
  return { ref, style };
}

function WordgenieIcon({ size = 13, color }: { size?: number; color?: string }) {
  // The official Wordgenie mark — same source as public/assets/wordgenie-icon.svg.
  // In neutral contexts (like the record/AI voice/upload rail, where every icon
  // shares one color for a given state) a solid `color` overrides the brand gradient
  // so this icon doesn't stand out as the only colored one in the row.
  const fillA = color ?? 'url(#nvWgGradA)';
  const fillB = color ?? 'url(#nvWgGradB)';
  const fillC = color ?? 'url(#nvWgGradC)';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 4L13.4507 11.7507C13.3202 12.1473 13.0984 12.5078 12.8031 12.8031C12.5078 13.0984 12.1473 13.3202 11.7507 13.4507L4 16L11.7507 18.5493C12.1473 18.6798 12.5078 18.9016 12.8031 19.1969C13.0984 19.4922 13.3202 19.8527 13.4507 20.2493L16 28L18.5493 20.2493C18.6798 19.8527 18.9016 19.4922 19.1969 19.1969C19.4922 18.9016 19.8527 18.6798 20.2493 18.5493L28 16L20.2493 13.4507C19.8527 13.3202 19.4922 13.0984 19.1969 12.8031C18.9016 12.5078 18.6798 12.1473 18.5493 11.7507L16 4Z" fill={fillA} stroke={fillA} strokeWidth="1.125" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 2L5.15022 4.58356C5.10673 4.71578 5.0328 4.83595 4.93437 4.93437C4.83595 5.0328 4.71578 5.10673 4.58356 5.15022L2 6L4.58356 6.84978C4.71578 6.89327 4.83595 6.9672 4.93437 7.06563C5.0328 7.16405 5.10673 7.28422 5.15022 7.41644L6 10L6.84978 7.41644C6.89327 7.28422 6.9672 7.16405 7.06563 7.06563C7.16405 6.9672 7.28422 6.89327 7.41644 6.84978L10 6L7.41644 5.15022C7.28422 5.10673 7.16405 5.0328 7.06563 4.93437C6.9672 4.83595 6.89327 4.71578 6.84978 4.58356L6 2Z" fill={fillB} stroke={fillB} strokeWidth="0.375" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M26 22L25.1502 24.5836C25.1067 24.7158 25.0328 24.8359 24.9344 24.9344C24.8359 25.0328 24.7158 25.1067 24.5836 25.1502L22 26L24.5836 26.8498C24.7158 26.8933 24.8359 26.9672 24.9344 27.0656C25.0328 27.1641 25.1067 27.2842 25.1502 27.4164L26 30L26.8498 27.4164C26.8933 27.2842 26.9672 27.1641 27.0656 27.0656C27.1641 26.9672 27.2842 26.8933 27.4164 26.8498L30 26L27.4164 25.1502C27.2842 25.1067 27.1641 25.0328 27.0656 24.9344C26.9672 24.8359 26.8933 24.7158 26.8498 24.5836L26 22Z" fill={fillC} stroke={fillC} strokeWidth="0.375" strokeLinecap="round" strokeLinejoin="round"/>
      <defs>
        <linearGradient id="nvWgGradA" x1="28.3864" y1="2.78745" x2="-0.682789" y2="8.38556" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4C8DFF"/><stop offset="1" stopColor="#8B6FF0"/>
        </linearGradient>
        <linearGradient id="nvWgGradB" x1="10.1288" y1="1.59582" x2="0.43907" y2="3.46185" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4C8DFF"/><stop offset="1" stopColor="#8B6FF0"/>
        </linearGradient>
        <linearGradient id="nvWgGradC" x1="30.1288" y1="21.5958" x2="20.4391" y2="23.4619" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4C8DFF"/><stop offset="1" stopColor="#8B6FF0"/>
        </linearGradient>
      </defs>
    </svg>
  );
}
function readAudioDuration(file: File, fallback: number): Promise<number> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const el = new Audio();
    const cleanup = (d: number) => { URL.revokeObjectURL(url); resolve(d); };
    el.preload = 'metadata';
    el.onloadedmetadata = () => cleanup(isFinite(el.duration) && el.duration > 0 ? Math.max(1, Math.round(el.duration)) : fallback);
    el.onerror = () => cleanup(fallback);
    el.src = url;
  });
}
function voiceName(voiceId: string, cloneName: string | null) {
  if (voiceId === CLONE_VOICE_ID) return cloneName ?? 'Your voice';
  return AI_VOICES.find(v => v.id === voiceId)?.name ?? 'Aria';
}

/* ── Waveform ── */
function Waveform({ seed, width = 110, height = 26, color = '#006EFE', playing = false }: {
  seed: number; width?: number; height?: number; color?: string; playing?: boolean;
}) {
  const bars = useMemo(() => Array.from({ length: 22 }, (_, i) =>
    0.25 + ((Math.sin(seed * 3.7 + i * 1.31) + 1) / 2) * 0.75), [seed]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, width, height, flexShrink: 0 }}>
      {bars.map((b, i) => (
        <div key={i} style={{
          flex: 1, borderRadius: 2, background: color,
          height: `${b * 100}%`, opacity: playing ? 0.9 : 0.55,
          animation: playing ? `v2pulse 0.9s ease-in-out ${i * 0.05}s infinite alternate` : 'none',
        }} />
      ))}
      <style>{`@keyframes v2pulse { from { transform: scaleY(0.6); } to { transform: scaleY(1.15); } }`}</style>
    </div>
  );
}

/* ── Slide thumbnail ── */
function SlideThumb({ slide, theme, width = 132, rounded = true }: { slide: PresentationSlide; theme: MockTheme; width?: number; rounded?: boolean }) {
  const bg = slide.bgImageUrl ? `url(${slide.bgImageUrl}) center/cover` : (slide.bgColor ?? theme.bg);
  const h = width * 9 / 16;
  return (
    // containerType lets the text below scale off *this* box's own width via cqw — this
    // component runs from a 132px filmstrip thumb up to a 320px Export-screen preview card, and
    // fixed px title/point sizes rendered identically at both (8.5px/6px, unreadable even at the
    // large end) because nothing here scaled with the `width` prop that's supposed to drive it.
    <div style={{ width, height: h, borderRadius: rounded ? 8 : 0, overflow: 'hidden', position: 'relative', flexShrink: 0,
      containerType: 'inline-size', border: '1px solid #E8EBF2', background: bg, boxShadow: '0 1px 4px rgba(15,23,51,0.08)' } as React.CSSProperties}>
      <div style={{ position: 'absolute', inset: 0, padding: '9% 10%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {slide.title && (
          <p style={{ ...ns, fontSize: 'clamp(8px,6.5cqw,16px)', fontWeight: 700, color: slide.textColorOverride ?? theme.titleColor, margin: 0,
            lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {slide.title}
          </p>
        )}
        {slide.points.slice(0, 2).map((pt, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 3, marginTop: 3 }}>
            <div style={{ width: 'clamp(2.5px,1.2cqw,4px)', height: 'clamp(2.5px,1.2cqw,4px)', borderRadius: '50%', background: theme.accentColor, marginTop: 'clamp(2.5px,1.2cqw,5px)', flexShrink: 0 }} />
            <p style={{ ...ns, fontSize: 'clamp(6px,4cqw,12px)', color: slide.textColorOverride ?? theme.titleColor, opacity: 0.75, margin: 0,
              lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{pt}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Clone-voice quick setup
   ════════════════════════════════════════════════════════════════ */
const CLONE_PASSAGE = `Hello, and welcome. I'm excited to share something with you today. Great ideas deserve to be heard clearly, and that's exactly what we're going to work on together.`;

function CloneScreen({ onDone, onBack }: { onDone: (name: string) => void; onBack: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'training' | 'done'>('idle');
  const [secs, setSecs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const start = () => {
    setPhase('recording');
    timerRef.current = setInterval(() => setSecs(s => s + 1), 1000);
  };
  const stop = () => {
    clearInterval(timerRef.current!);
    setPhase('training');
    setTimeout(() => setPhase('done'), 2200);
  };

  return (
    <div className="h-full flex items-center justify-center" style={{ background: '#F8F9FC', padding: 24 }}>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: '#fff', borderRadius: 20, boxShadow: '0 20px 60px rgba(15,23,51,0.12)', maxWidth: 560, width: '100%', padding: '40px 44px', textAlign: 'center' }}>
        <h2 style={{ ...ns, fontSize: 21, fontWeight: 700, color: '#15191F', marginBottom: 8 }}>Clone your voice</h2>
        <p style={{ ...ns, fontSize: 13.5, color: '#52637A', marginBottom: 24, lineHeight: 1.6 }}>
          Read the passage below for ~30 seconds. We&rsquo;ll create a voice that sounds like you.
        </p>
        <div style={{ background: '#F8F9FC', border: '1px solid #E8EBF2', borderRadius: 12, padding: '18px 20px', marginBottom: 24 }}>
          <p style={{ ...ns, fontSize: 14, color: '#334155', lineHeight: 1.7, margin: 0, textAlign: 'left' }}>{CLONE_PASSAGE}</p>
        </div>
        {phase === 'idle' && (
          <button onClick={start} className="cursor-pointer"
            style={{ height: 44, padding: '0 28px', borderRadius: 12, border: 'none', background: '#0FA47C', ...ns, fontSize: 14, fontWeight: 700, color: '#fff' }}>
            ● Start recording
          </button>
        )}
        {phase === 'recording' && (
          <div className="flex flex-col items-center" style={{ gap: 14 }}>
            <div className="flex items-center" style={{ gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#E5484D', animation: 'v2blink 1s infinite' }} />
              <span style={{ ...ns, fontSize: 20, fontWeight: 700, color: '#15191F', fontVariantNumeric: 'tabular-nums' }}>{formatTime(secs)}</span>
            </div>
            <Waveform seed={7} width={220} height={32} color="#0FA47C" playing />
            <button onClick={stop} className="cursor-pointer"
              style={{ height: 42, padding: '0 26px', borderRadius: 12, border: 'none', background: '#E5484D', ...ns, fontSize: 14, fontWeight: 700, color: '#fff' }}>
              ■ Stop &amp; create voice
            </button>
          </div>
        )}
        {phase === 'training' && (
          <div className="flex flex-col items-center" style={{ gap: 12 }}>
            <div style={{ width: 28, height: 28, border: '3px solid #E8EBF2', borderTopColor: '#0FA47C', borderRadius: '50%', animation: 'v2spin 0.8s linear infinite' }} />
            <p style={{ ...ns, fontSize: 13.5, color: '#52637A' }}>Training your voice…</p>
          </div>
        )}
        {phase === 'done' && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center" style={{ gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#EDFBF6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0FA47C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <p style={{ ...ns, fontSize: 14.5, fontWeight: 700, color: '#15191F', margin: 0 }}>&ldquo;Your voice&rdquo; is ready</p>
            <button onClick={() => onDone('Your voice')} className="cursor-pointer"
              style={{ height: 42, padding: '0 26px', borderRadius: 12, border: 'none', background: '#006EFE', ...ns, fontSize: 14, fontWeight: 700, color: '#fff' }}>
              Continue to slides
            </button>
          </motion.div>
        )}
        {phase !== 'done' && (
          <button onClick={onBack} className="cursor-pointer"
            style={{ display: 'block', margin: '20px auto 0', border: 'none', background: 'transparent', ...ns, fontSize: 12.5, color: '#8596AD' }}>
            ← Back to slides
          </button>
        )}
      </motion.div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Studio canvas — unified setup + record experience
   ════════════════════════════════════════════════════════════════ */
/* Live self-view — acquires the camera once on mount, releases it on unmount. Falls
   back to a quiet placeholder if permission is denied. Re-acquires when deviceId changes,
   so picking a different camera from DeviceMenu actually swaps what's shown. */
function LiveCamera({ style, deviceId }: { style?: React.CSSProperties; deviceId?: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    const constraint = deviceId ? { deviceId: { exact: deviceId } } : true;
    navigator.mediaDevices.getUserMedia({ video: constraint }).then(s => {
      if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s;
      if (videoRef.current) videoRef.current.srcObject = s;
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; stream?.getTracks().forEach(t => t.stop()); };
  }, [deviceId]);

  if (error) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#121212' }}>
        <span style={{ ...ns, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Camera unavailable</span>
      </div>
    );
  }
  return <video ref={videoRef} autoPlay muted playsInline style={{ ...style, objectFit: 'cover', transform: 'scaleX(-1)' }} />;
}

/* Unified studio canvas — merges what used to be three separate screens (studio-entry
   card, scope picker, full-screen record overlay) into one continuous view. You land
   here already looking at the slide; recording just starts capturing what's already on
   screen. Record / AI voice / Upload are a small mode rail, not separate destinations —
   switching modes swaps the bottom panel without ever leaving this canvas. */
function StudioCanvas({ slides, theme, scripts, onScriptChange, startIdx, audio, onNavigate, cloneName, isGeneratingScript, onGenerateScript, onOpenAiChat, onAudioChange, onClone, onRecordDone, onRecordingStart, onTakeInProgressChange, showToast, scriptVisible, onScriptVisibleChange, scriptMode, onScriptModeChange: setScriptMode, promptPos, onPromptPosChange: setPromptPos, promptSize, onPromptSizeChange: setPromptSize, scrollSpeed, onScrollSpeedChange: setScrollSpeed, otherTakeSlideNumbers }: {
  slides: PresentationSlide[]; theme: MockTheme; scripts: string[]; onScriptChange: (idx: number, value: string) => void;
  startIdx: number; audio: SlideAudio; onNavigate: (idx: number) => void; cloneName: string | null;
  isGeneratingScript: boolean; onGenerateScript: () => void; onOpenAiChat: () => void;
  onAudioChange: (patch: Partial<SlideAudio>) => void; onClone: () => void;
  onRecordDone: (scope: CaptureScope, captureMode: CaptureMode, cameraLayout: CameraLayout, durations: Record<number, number>, overwriteExisting: boolean) => void;
  onRecordingStart?: () => void;
  onTakeInProgressChange?: (inProgress: boolean) => void;
  showToast: (msg: string) => void;
  // Lifted to the parent (see there for why) — a standing preference, not per-take state that
  // should reset on the key={activeIdx} remount this component gets on every slide switch.
  scriptVisible: boolean; onScriptVisibleChange: (v: boolean) => void;
  // Same reasoning as scriptVisible — picking "teleprompter" on slide 2 and moving to slide 3
  // should still be teleprompter, not silently fall back to the left dock on every remount.
  // The floating box's position/size and scroll speed are lifted alongside it so the box doesn't
  // re-center itself (or the speed reset) every time you change slides while using it.
  scriptMode: 'left' | 'right' | 'teleprompter'; onScriptModeChange: (m: 'left' | 'right' | 'teleprompter') => void;
  promptPos: { x: number; y: number } | null; onPromptPosChange: (p: { x: number; y: number }) => void;
  promptSize: { w: number; h: number }; onPromptSizeChange: (s: { w: number; h: number }) => void;
  scrollSpeed: number; onScrollSpeedChange: (s: number) => void;
  // 1-based numbers of *other* slides that already have a take — decides whether pressing
  // Record needs to ask "fill empty slides only, or re-record everything as you go" first, and
  // lets the modal name which slides are actually at stake instead of just a bare count. Empty
  // means there's nothing to ask about, so Record just starts immediately, same as before this
  // existed.
  otherTakeSlideNumbers: number[];
}) {
  const [idx, setIdx] = useState(startIdx);
  const [elapsed, setElapsed] = useState(0);
  // idle: nothing captured yet. countdown: mic granted, 3-2-1 running before capture actually
  // starts — not skippable, so nobody gets caught fumbling in the first second of a take.
  // recording/paused: actively capturing or paused mid-take.
  // preview: capture ended (Stop) — review the take before committing (Done) or starting over (Re-record).
  const [phase, setPhase] = useState<'idle' | 'countdown' | 'recording' | 'paused' | 'preview'>('idle');
  const [countdownN, setCountdownN] = useState(3);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [durations, setDurations] = useState<Record<number, number>>({});
  const [scriptFontSize, setScriptFontSize] = useState<'sm' | 'lg'>('lg');
  // Left-side panel now, not a bottom pill — resizes by width (drag the right edge). Used to
  // simply fill the row's full height regardless of how much script there was, which left a
  // one-line take with a wall of dead card below it (confirmed live in a critique pass) — now
  // the card sizes to its own content instead, via the auto-grow effect below.
  const [scriptWidth, setScriptWidth] = useState(300);
  // Auto-grows the docked textarea to fit its content (clamped) instead of the card always
  // claiming full studio height — only one of these is ever mounted at a time (docked mode is
  // 'left' xor 'right', never both), so a single ref/effect pair covers both sides. Re-measures
  // on font-size changes too, since that reflows how many lines the same text takes. Deliberately
  // NOT re-measured on scriptWidth: dragging the resize handle should only change width — if
  // width changes were also allowed to reflow and resize the height, height would silently
  // drift mid-drag as a side effect of a resize the user didn't ask for. A width change can
  // still leave a long script needing its own internal scroll until the next real content edit
  // re-measures it, which is the same "overflow, don't distort layout" behavior a fixed-height
  // textarea already had. Teleprompter mode isn't part of any of this — it's a fixed
  // performance-reading surface, not a content-driven card, so its size stays under the user's
  // own drag-resize entirely.
  const scriptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const SCRIPT_TEXTAREA_MIN_H = 100;
  const SCRIPT_TEXTAREA_MAX_H = 390;
  useLayoutEffect(() => {
    const el = scriptTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, SCRIPT_TEXTAREA_MIN_H), SCRIPT_TEXTAREA_MAX_H)}px`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scripts[idx], scriptFontSize, scriptMode]);
  // A long script hitting SCRIPT_TEXTAREA_MAX_H used to just cut the last visible line off
  // mid-glyph with nothing to say "scroll for more" — read as broken rather than scrollable.
  // These fade the card's own background in over the top/bottom couple of lines, only when
  // there's actually more to scroll to on that side (driven off the textarea's real scroll
  // position, not just "is this panel tall enough to ever scroll").
  const scriptFadeTopRef = useRef<HTMLDivElement>(null);
  const scriptFadeBottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scriptTextareaRef.current;
    const top = scriptFadeTopRef.current;
    const bottom = scriptFadeBottomRef.current;
    if (!el || !top || !bottom) return;
    const update = () => {
      top.style.opacity = el.scrollTop > 2 ? '1' : '0';
      bottom.style.opacity = el.scrollTop + el.clientHeight < el.scrollHeight - 2 ? '1' : '0';
    };
    update();
    el.addEventListener('scroll', update);
    return () => el.removeEventListener('scroll', update);
  }, [scripts[idx], scriptFontSize, scriptMode]);
  const resizeRef = useRef<{ startX: number; startWidth: number; side: 'left' | 'right' } | null>(null);
  // Three fixed positions, not a freeform drag — 'left'/'right' dock the panel to that side of
  // the slide (still just width-resizable), 'teleprompter' pulls it out into a draggable/
  // resizable floating box (see promptPos/promptSize) positioned free-form in the window, not
  // clamped to the slide, since the whole point there is parking it near wherever the camera
  // actually is on the user's screen. All three are the same underlying script text — just a
  // different surface for reading it.
  const promptDragRef = useRef<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>(null);
  const promptResizeRef = useRef<{ startX: number; startY: number; startSize: { w: number; h: number } } | null>(null);
  // Mirrors promptSize/promptPos for the drag/resize clamps below — that pointermove listener
  // is only ever attached once ([] deps, to avoid resubscribing on every drag/resize tick), so
  // it needs refs to read the *current* values rather than whatever it closed over at mount.
  const promptSizeRef = useRef(promptSize);
  useEffect(() => { promptSizeRef.current = promptSize; }, [promptSize]);
  const promptPosRef = useRef(promptPos);
  useEffect(() => { promptPosRef.current = promptPos; }, [promptPos]);
  const promptScrollRef = useRef<HTMLTextAreaElement>(null);
  // Lazy so it only ever touches `window` from a click/drag handler, never during render.
  // Horizontally centered (no assumption about where the slide happens to sit left-to-right),
  // but anchored near the top rather than vertical-centered — a webcam sits at the top of the
  // screen, not the middle, and both BIGVU and Riverside land their teleprompter text up there
  // for exactly that reason. 150, not something closer to 0, because you typically switch into
  // teleprompter mode while still idle, and the Record/AI voice/Upload rail occupies that top
  // band until recording actually starts — this clears it instead of sitting on top of it.
  // Still just a starting point; the whole box stays draggable.
  const centeredPromptPos = () => ({ x: (window.innerWidth - promptSize.w) / 2, y: 150 });
  const switchScriptMode = (mode: 'left' | 'right' | 'teleprompter') => {
    if (mode === 'teleprompter' && !promptPos) setPromptPos(centeredPromptPos());
    setScriptMode(mode);
  };
  const startPromptDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startPos = promptPos ?? centeredPromptPos();
    promptDragRef.current = { startX: e.clientX, startY: e.clientY, startPos };
  };
  const startPromptResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    promptResizeRef.current = { startX: e.clientX, startY: e.clientY, startSize: promptSize };
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const drag = promptDragRef.current;
      if (drag) {
        // Bounded by the window, not the slide/canvas — free-floating means it can sit
        // anywhere on screen, including over the camera or outside the studio card entirely.
        // Clamped by the box's own (current, via ref — see promptSizeRef) size, not a fixed
        // sliver, so it never ends up mostly off-screen — its header controls have to stay
        // reachable, or no amount of smart tooltip/popover placement helps since the trigger
        // itself would be unreachable.
        const x = Math.min(Math.max(0, drag.startPos.x + (e.clientX - drag.startX)), window.innerWidth - promptSizeRef.current.w);
        const y = Math.min(Math.max(0, drag.startPos.y + (e.clientY - drag.startY)), window.innerHeight - promptSizeRef.current.h);
        setPromptPos({ x, y });
      }
      const resize = promptResizeRef.current;
      if (resize) {
        // Also capped by however much room is left between the box's (fixed, top-left) anchor
        // and the window edge — growing the box shouldn't be able to push its own resize handle
        // or header controls off-screen when it's already parked near an edge.
        const pos = promptPosRef.current;
        const maxW = pos ? window.innerWidth - pos.x : 560;
        const maxH = pos ? window.innerHeight - pos.y : 520;
        const w = Math.min(560, maxW, Math.max(240, resize.startSize.w + (e.clientX - resize.startX)));
        const h = Math.min(520, maxH, Math.max(140, resize.startSize.h + (e.clientY - resize.startY)));
        setPromptSize({ w, h });
      }
    };
    const up = () => { promptDragRef.current = null; promptResizeRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);
  // Authoritative scroll position for the RAF loop below — NOT a variable local to that
  // effect. It used to be, which meant an *external* reset (new slide, fresh take) that set
  // el.scrollTop = 0 directly got silently undone on the very next animation frame, since the
  // loop was still adding its per-frame delta on top of the stale position it had cached at
  // start — so a manually-scrolled-down script never actually snapped back to the top like it
  // should have. Both effects below now go through this same ref, so a reset always sticks.
  const promptScrollPosRef = useRef(0);
  const resetPromptScroll = () => {
    promptScrollPosRef.current = 0;
    if (promptScrollRef.current) promptScrollRef.current.scrollTop = 0;
  };
  // A real take always auto-scrolls — no play/pause to fumble with on camera, same as
  // Riverside's teleprompter. Before recording, though, the *same* loop doubles as an on-demand
  // preview (previewScrolling) so a speed preset means something before you've committed to a
  // take, not just once you're already on camera.
  const [previewScrolling, setPreviewScrolling] = useState(false);
  useEffect(() => { if (phase !== 'idle') setPreviewScrolling(false); }, [phase]);
  useEffect(() => {
    if (scriptMode !== 'teleprompter' || !(phase === 'recording' || (phase === 'idle' && previewScrolling))) return;
    const el = promptScrollRef.current;
    if (!el) return;
    const pxPerSec = 6 + (scrollSpeed / 100) * 46;
    let raf = 0;
    let last = performance.now();
    let lastWritten = Math.round(promptScrollPosRef.current);
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      // If the live scrollTop doesn't match what we wrote last frame, something else moved it
      // — the user manually scrolling (wheel/trackpad/scrollbar) to glance back at a line they
      // just passed, or ahead to skip one. Adopt that as the new baseline instead of snapping
      // back to the old trajectory, so a manual scroll actually sticks rather than getting
      // fought and undone within a frame. Auto-scroll then just keeps advancing from there —
      // it never latches "off" because of a manual nudge, only because recording stopped.
      if (Math.round(el.scrollTop) !== lastWritten) promptScrollPosRef.current = el.scrollTop;
      // scrollTop is an integer DOM property — accumulating a sub-pixel-per-frame amount
      // straight onto it truncates the fractional remainder every single frame, so at normal
      // speeds (well under 1px/frame) it'd never move at all. The float position lives in the
      // ref instead, and only the rounded result gets written to the DOM.
      promptScrollPosRef.current = Math.min(promptScrollPosRef.current + pxPerSec * dt, el.scrollHeight - el.clientHeight);
      el.scrollTop = promptScrollPosRef.current;
      lastWritten = Math.round(promptScrollPosRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scriptMode, phase, scrollSpeed, previewScrolling]);
  // New slide, new script — start back at the top rather than wherever the last slide's scroll
  // happened to land. A running preview doesn't carry over to a slide it was never previewing.
  useEffect(() => { resetPromptScroll(); setPreviewScrolling(false); }, [idx]);
  // A fresh take should also start at the top, same as a fresh slide — but *resuming* from
  // Pause shouldn't, since that would yank the script back to the beginning of a take you're
  // already partway through recording. Only reset on the countdown/idle → recording edge, not
  // the paused → recording one.
  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    if (phase === 'recording' && prevPhaseRef.current !== 'paused') resetPromptScroll();
    prevPhaseRef.current = phase;
  }, [phase]);
  const studioRef = useRef<HTMLDivElement>(null);
  const topRowRef = useRef<HTMLDivElement>(null);
  const modeRailRef = useRef<HTMLDivElement>(null);
  const actionZoneRef = useRef<HTMLDivElement>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDeleteTake, setConfirmDeleteTake] = useState(false);
  // Confirms up front, at the "Change" click itself — before any destination method is picked
  // (see the pill's onClick below) — not after picking one, which is why this no longer tracks
  // a pending destination the way an earlier version did. The risk being confirmed ("you'll
  // lose this take") doesn't depend on which method replaces it, so there's nothing to gain by
  // waiting until a specific tab is clicked to say so.
  const [confirmChangeType, setConfirmChangeType] = useState(false);
  // Asked once per Record press, only when otherTakesCount > 0 — nothing to ask about
  // otherwise, so Record just starts immediately in that case, same as always. Resets to false
  // after each take (see handleDone) rather than staying sticky, so a later, unrelated session
  // doesn't silently inherit "overwrite everything" from a choice made earlier.
  const [confirmRecordScope, setConfirmRecordScope] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idxRef = useRef(idx);
  useEffect(() => { idxRef.current = idx; }, [idx]);
  // Lets the outer chrome (Preview/Export) disable itself while a take is unsaved — recording,
  // paused, or sitting in preview waiting on Re-record/Save — so a stray click can't interrupt
  // or export around an in-progress take.
  useEffect(() => { onTakeInProgressChange?.(phase !== 'idle'); }, [phase, onTakeInProgressChange]);
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (previewTimerRef.current) clearInterval(previewTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
  }, []);

  // Entry setup — decided right here, inline, instead of prior gating screens. Seeded from
  // audio.source (not a flat 'record' default) — the tab strip stays visible even once a take
  // exists now (see showModeRail below), highlighting whichever tab matches the current take, so
  // it has to start in sync with what's actually here rather than defaulting to Record and
  // silently mismatching an AI-voice or uploaded slide until the user clicks something.
  const [entryMode, setEntryMode] = useState<'record' | 'ai' | 'upload'>(
    audio.source === 'ai' ? 'ai' : audio.source === 'upload' ? 'upload' : 'record'
  );
  // Teleprompter only means something for a live on-camera read — there's no take being
  // performed in AI voice mode, just text going straight to a TTS call. Drop back to a docked
  // position if it was already floating when the mode switches out from under it.
  useEffect(() => {
    if (entryMode === 'ai' && scriptMode === 'teleprompter') setScriptMode('left');
  }, [entryMode]);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('audio');
  const [cameraLayout, setCameraLayout] = useState<CameraLayout>('bubble');
  // Cosmetic, like the rest of this mock's pipeline — no real audio graph to actually gate —
  // but the mic button needs to be a real toggle, not a dead icon that looks clickable.
  const [micMuted, setMicMuted] = useState(false);
  // null = system default. Mic selection is cosmetic (no audio graph to route it into), but
  // camera selection is real — passed into LiveCamera's getUserMedia constraints below.
  const [micDeviceId, setMicDeviceId] = useState<string | null>(null);
  const [cameraDeviceId, setCameraDeviceId] = useState<string | null>(null);
  // Shared by both device-menu popovers (see DeviceMenu's openRight prop) — measured from the
  // mic pill since it's the leftmost of the two, so it's the more conservative check.
  const micPillRef = useRef<HTMLDivElement>(null);
  const [deviceMenuOpensRight, setDeviceMenuOpensRight] = useState(false);
  useEffect(() => {
    const recompute = () => {
      const rect = micPillRef.current?.getBoundingClientRect();
      if (rect) setDeviceMenuOpensRight(rect.right - 280 < 8);
    };
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, []);
  // No upfront "this slide vs. all slides" choice — scope is implicit. You always see this
  // slide and the next one; if you stop without advancing, it's a single-slide take, if you
  // navigate on and keep recording, that's a multi-slide take. Determined at Done time from
  // which slides actually picked up recorded time (see handleDone).
  // AI voice tuning — cosmetic in this concept (no real TTS backend), matching the rest of the
  // mock generation pipeline. Reset per slide since voice character is a per-take choice.
  const [voiceSpeed, setVoiceSpeed] = useState(50);
  // Grouped with scriptVisible under one "display options" popover (see DisplayOptionsMenu) —
  // three independent on/off preferences, not primary controls, so they share one entry point
  // instead of three separate icons crowding the row.
  const [countdownEnabled, setCountdownEnabled] = useState(true);
  const [nextPreviewEnabled, setNextPreviewEnabled] = useState(true);
  // Once a slide has a take, idle shows a compact "recorded" status instead of the entry
  // picker — you stay in the studio, you don't get bounced to a different view. redoing
  // temporarily brings the picker back so you can re-record, regenerate, or switch type.
  const [redoing, setRedoing] = useState(false);
  // Voice + speed live in a popup instead of a permanent card — the card competed for width
  // with the slide and script above it and never lined up with either. A popup floats free of
  // that alignment problem entirely, and voice choice is a deliberate, occasional action anyway.
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  // A generated take needs the same review step a recording gets — Save or go back and try a
  // different voice — rather than landing straight on the committed "done" state. Mirrors
  // phase === 'preview' for the record flow, just without a phase of its own since AI generation
  // never leaves 'idle'.
  const [aiPreview, setAiPreview] = useState(false);

  // Same scrubber doubles as the pre-save take review (against the in-progress elapsed time)
  // and the post-save review player (against the saved take's duration) — a slide should
  // always be reviewable once it has a take, not just in the narrow window before Save.
  const reviewTotal = phase === 'preview' ? elapsed : audio.duration;

  // Ticks previewTime up to reviewTotal while previewPlaying is true.
  useEffect(() => {
    if (previewPlaying) {
      previewTimerRef.current = setInterval(() => {
        setPreviewTime(t => {
          if (t >= reviewTotal - 1) { setPreviewPlaying(false); return reviewTotal; }
          return t + 1;
        });
      }, 1000);
    } else if (previewTimerRef.current) {
      clearInterval(previewTimerRef.current);
    }
    return () => { if (previewTimerRef.current) clearInterval(previewTimerRef.current); };
  }, [previewPlaying, reviewTotal]);

  const startScriptResize = (e: React.PointerEvent, side: 'left' | 'right') => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startWidth: scriptWidth, side };
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!resizeRef.current) return;
      // Dragging the handle grows the panel toward the edge it's *not* docked to — a left-
      // docked panel grows as you drag its right edge rightward, a right-docked one grows as
      // you drag its left edge leftward, so the delta's sign flips with the side.
      const rawDelta = e.clientX - resizeRef.current.startX;
      const delta = resizeRef.current.side === 'right' ? -rawDelta : rawDelta;
      // 260, not 220 — confirmed live that 220 wraps the header row ("Generate script" breaks
      // to two lines and collides with the mode menu above it); 260 is the narrowest width
      // that still fits font-toggle + mode-menu + generate-script on one line.
      setScriptWidth(Math.min(480, Math.max(260, resizeRef.current.startWidth + delta)));
    };
    const up = () => { resizeRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

  // Slide numbers that already had audio *before this take started* — fixed for the life of
  // this mount (StudioCanvas remounts on every idle navigation, see the key={activeIdx} on its
  // parent, so this recomputes fresh each time you're not mid-take). When "Skip to empty
  // slides" was chosen in confirmRecordScope, Next has to route around these instead of always
  // landing on idx+1; when "Include already-recorded slides" was chosen, Next ignores this
  // entirely and behaves exactly as before.
  const preExistingTakeNumbers = useMemo(() => new Set(otherTakeSlideNumbers), [otherTakeSlideNumbers]);
  const nextReachableIdx = (from: number): number => {
    if (from > slides.length - 1) return -1;
    if (overwriteExisting) return from;
    for (let i = from; i < slides.length; i++) {
      if (!preExistingTakeNumbers.has(i + 1)) return i;
    }
    return -1;
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (confirmDiscard) {
        if (e.key === 'Escape') setConfirmDiscard(false);
        return;
      }
      if (entryMode === 'record' && phase !== 'preview') {
        // Same rule as the on-screen nav: idle can hop through the parent to pick up the
        // destination slide's real status; mid-take must stay local so it doesn't remount.
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          if (phase === 'idle') { onNavigate(Math.min(slides.length - 1, idxRef.current + 1)); }
          else { const t = nextReachableIdx(idxRef.current + 1); if (t !== -1) setIdx(t); }
        }
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp') {
          const t = Math.max(0, idxRef.current - 1);
          if (phase === 'idle') onNavigate(t); else setIdx(t);
        }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [phase, confirmDiscard, entryMode, slides.length, onNavigate, overwriteExisting, preExistingTakeNumbers]);

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setElapsed(s => s + 1);
      setDurations(prev => ({ ...prev, [idxRef.current]: (prev[idxRef.current] ?? 0) + 1 }));
    }, 1000);
  };
  const stopTimer = () => { if (timerRef.current) clearInterval(timerRef.current); };
  const stopCountdown = () => { if (countdownTimerRef.current) clearInterval(countdownTimerRef.current); };

  const handleStart = async () => {
    try {
      // Real getUserMedia call — triggers the browser's own native mic-permission prompt.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch {
      showToast('Microphone access is required to record');
      return;
    }
    // Collapse the filmstrip as soon as the countdown starts (or, with it off, as soon as
    // recording starts) — the panel reclaiming space mid-countdown would be one more layout
    // shift to sit through right as you're trying to focus, so it should already be settled.
    onRecordingStart?.();
    if (!countdownEnabled) {
      setPhase('recording');
      startTimer();
      return;
    }
    // 3-2-1 before capture actually starts — deliberately not skippable (the record button
    // is a no-op while phase is 'countdown'), so it can't be clicked away and defeat the point.
    setPhase('countdown');
    setCountdownN(3);
    let n = 3;
    countdownTimerRef.current = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        stopCountdown();
        setPhase('recording'); startTimer();
      } else {
        setCountdownN(n);
      }
    }, 1000);
  };
  const handlePauseResume = () => {
    if (phase === 'recording') { setPhase('paused'); stopTimer(); }
    else if (phase === 'paused') { setPhase('recording'); startTimer(); }
  };
  // The record button's own click handler, not handleStart directly — if other slides already
  // have takes, what happens to them if this session keeps rolling past this slide isn't
  // obvious, so it asks first instead of silently defaulting to "skip them." Nothing to ask
  // when there are none, so it behaves exactly as before in that case.
  const handleRecordButtonClick = () => {
    if (phase !== 'idle') { handlePauseResume(); return; }
    if (otherTakeSlideNumbers.length > 0) { setConfirmRecordScope(true); return; }
    handleStart();
  };
  const confirmedRecordScope = (overwrite: boolean) => {
    setConfirmRecordScope(false);
    setOverwriteExisting(overwrite);
    handleStart();
  };
  const handleStop = () => {
    stopTimer();
    setPhase('preview');
    // Reviewing a take is about the take, not the script — start collapsed, but the header
    // still has a toggle so you can pull it back up to double-check a line.
    onScriptVisibleChange(false);
  };
  const handleRerecord = () => {
    stopTimer();
    stopCountdown();
    setPreviewPlaying(false);
    setPreviewTime(0);
    setElapsed(0);
    setDurations({});
    setIdx(startIdx);
    setPhase('idle');
  };
  const handleDone = () => {
    stopTimer();
    // Implicit scope: stayed on one slide the whole take → single. Advanced and kept
    // recording → multi, covering every slide that picked up time this session.
    const recordedSlides = Object.values(durations).filter(d => d > 0).length;
    onRecordDone(recordedSlides > 1 ? 'multi' : 'single', captureMode, cameraLayout, durations, overwriteExisting);
    // Land back in the studio, idle, on the slide the take started on — not handed off to a
    // different view. The now-recorded status row picks up from here.
    setPreviewPlaying(false);
    setPreviewTime(0);
    setElapsed(0);
    setDurations({});
    setIdx(startIdx);
    setPhase('idle');
    setRedoing(false);
    setOverwriteExisting(false);
  };
  const requestDiscard = () => setConfirmDiscard(true);
  const confirmedDiscard = () => { setConfirmDiscard(false); handleRerecord(); };
  const togglePreviewPlay = () => {
    if (reviewTotal <= 0) return;
    if (previewTime >= reviewTotal) setPreviewTime(0);
    setPreviewPlaying(v => !v);
  };
  const seekPreview = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setPreviewTime(Math.round(ratio * reviewTotal));
    setPreviewPlaying(false);
  };

  const slide = slides[idx];
  const bg = slide.bgImageUrl ? `url(${slide.bgImageUrl}) center/cover` : (slide.bgColor ?? theme.bg);
  // Shared width so the slide, script bar, and preview scrubber all share one edge —
  // full-bleed, not a small card floating in open space.
  const stageMaxWidth = 1180;

  // The side-by-side camera claims a fixed slice of the row so the slide sits directly next to
  // it, not centered independently with an arbitrary gap between them.
  const sideBySideVisible = entryMode === 'record' && captureMode === 'video' && cameraLayout === 'sideBySide';
  // Fixed slice of the combined 16:9 frame the camera claims — see fit() below, which sizes
  // the *combined* slide+camera box to 16:9 (matching what an actual composited recording
  // would look like) and gives the camera this much of it, rather than sizing the slide alone
  // to 16:9 and bolting a same-height camera on the side (which made the pair wider than 16:9).
  const sbsCameraW = 220;
  const sbsGap = 10;
  // Peek at what's coming up, to the right of the focused slide — carried over from the
  // earlier fullscreen recording concept. Inlines the same condition `hasTake` uses (that
  // const isn't declared until further down) since this feeds the width reserved for it below.
  const nextSlide = slides[idx + 1] ?? null;
  const hasTakeForSizing = audio.methodSet && !redoing && phase === 'idle';
  // Record-only — this is about framing/continuity while about to go live (what am I cutting to
  // next), which doesn't mean anything on the AI voice or Upload tabs where nothing's being
  // filmed. The toggle that controls it (DisplayOptionsMenu) is already record-only; this
  // condition just wasn't, so the preview kept rendering on the other two tabs regardless.
  const showNextPreview = entryMode === 'record' && nextPreviewEnabled && phase !== 'preview' && !!nextSlide && !hasTakeForSizing;

  const slideCellRef = useRef<HTMLDivElement>(null);
  const [slideBox, setSlideBox] = useState({ w: stageMaxWidth, h: stageMaxWidth * 9 / 16 });
  useEffect(() => {
    const el = slideCellRef.current;
    if (!el) return;
    // Below this the title/bullets (sized off container *width* via cqw) and the take-preview
    // overlay (fixed-height scrub bar + timestamp anchored to the bottom) run out of shared
    // room and start overlapping — the script dock, filmstrip, and app sidebar can otherwise
    // squeeze this row arbitrarily thin with nothing stopping it. Below the floor the slide
    // overflows its row instead, which is a visible scroll/crowding problem, not a silent
    // illegible one.
    const MIN_STAGE_W = 360;
    const fit = (rowW: number, rowH: number) => {
      // Freeze the size once a take is in progress — the picker/status row above collapses
      // and reclaims vertical space the instant recording starts, and refitting to that would
      // visibly enlarge the slide right as you start talking. Only refit while genuinely idle.
      if (phase !== 'idle') return;
      const available = rowW - (showNextPreview ? 204 : 0);
      let combinedW = Math.min(available, stageMaxWidth);
      let combinedH = combinedW * 9 / 16;
      // The height-constrained recompute has to respect the reserved width too — otherwise a
      // wide, short row lets the combined box grow back to full width and push the reserved
      // sibling (next-slide preview) off the edge.
      if (combinedH > rowH) { combinedH = rowH; combinedW = Math.min(combinedH * 16 / 9, available); }
      if (combinedW < MIN_STAGE_W) { combinedW = MIN_STAGE_W; combinedH = combinedW * 9 / 16; }
      if (combinedW <= 0 || combinedH <= 0) return;
      const w = sideBySideVisible ? Math.max(80, combinedW - sbsCameraW - sbsGap) : combinedW;
      setSlideBox({ w, h: combinedH });
    };
    fit(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver(([entry]) => fit(entry.contentRect.width, entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageMaxWidth, showNextPreview, phase, sideBySideVisible, sbsCameraW, sbsGap]);

  // Camera bubble position — draggable within the slide, in px relative to the slide's
  // top-left. null until the user drags it once, so it defaults to its usual bottom-right spot.
  const [bubblePos, setBubblePos] = useState<{ x: number; y: number } | null>(null);
  const bubbleDragRef = useRef<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>(null);
  const bubbleSize = slideBox.w * 0.26;
  const defaultBubblePos = { x: slideBox.w - bubbleSize - 16, y: slideBox.h - bubbleSize - 16 };
  const startBubbleDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    bubbleDragRef.current = { startX: e.clientX, startY: e.clientY, startPos: bubblePos ?? defaultBubblePos };
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const drag = bubbleDragRef.current;
      if (!drag) return;
      const x = Math.min(Math.max(0, drag.startPos.x + (e.clientX - drag.startX)), slideBox.w - bubbleSize);
      const y = Math.min(Math.max(0, drag.startPos.y + (e.clientY - drag.startY)), slideBox.h - bubbleSize);
      setBubblePos({ x, y });
    };
    const up = () => { bubbleDragRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [slideBox.w, slideBox.h, bubbleSize]);

  // AI voice and Upload operate on just this slide — bulk "remaining/all" for those stays
  // a classic-mode feature (ChangeSourceMenu + AudioControls), reachable once this slide has a take.
  const est = estimateSecs(scripts[idx] ?? '');
  const generateAiAudio = () => {
    // methodSet stays false until Save — flipping it early would make hasTake true mid-generation
    // and skip straight past both the spinner and the review step below.
    onAudioChange({ status: 'generating', source: 'ai' });
    setTimeout(() => { onAudioChange({ status: 'ready', duration: est }); setRedoing(false); setAiPreview(true); }, 1200 + Math.random() * 700);
  };
  const saveAiTake = () => {
    onAudioChange({ methodSet: true, scopeSet: true });
    setAiPreview(false);
  };
  const changeVoiceFromPreview = () => {
    setAiPreview(false);
    onAudioChange({ status: 'empty' });
    setVoicePickerOpen(true);
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const handleFile = async (file: File) => {
    setUploading(true);
    const duration = await readAudioDuration(file, est);
    setTimeout(() => {
      setUploading(false);
      onAudioChange({ status: 'ready', duration, fileName: file.name, source: 'upload', methodSet: true, scopeSet: true });
      setRedoing(false);
    }, 500 + Math.random() * 400);
  };
  // The <input type="file"> only exists in the DOM once redoing flips this slide's upload tab
  // back to its empty state (hasTake false) — it was unmounted while a take already existed.
  // Clicking fileInputRef synchronously inside handleRedo hits a null ref, since setRedoing(true)
  // hasn't re-rendered yet at that point. This flag defers the click to the effect below, which
  // fires once the just-(re)mounted input actually exists.
  const pendingUploadClickRef = useRef(false);
  useEffect(() => {
    if (pendingUploadClickRef.current && fileInputRef.current) {
      pendingUploadClickRef.current = false;
      fileInputRef.current.click();
    }
  });
  // "Regenerate"/"Re-record"/"Replace file" — the fast path: redo with the same method,
  // no detour through the tab picker. AI opens the voice picker directly (changeVoiceFromPreview
  // — same modal the aiPreview review step uses) since which voice to use isn't assumed; record
  // jumps straight into the mic-permission/countdown flow; upload opens the file dialog directly.
  // Contrast with "Change type" (below), which only sets redoing and leaves the method to be
  // chosen — that's the door to switching sources, this is the door to trying again.
  const handleRedo = () => {
    setEntryMode(audio.source === 'ai' ? 'ai' : audio.source === 'upload' ? 'upload' : 'record');
    setRedoing(true);
    if (audio.source === 'ai') changeVoiceFromPreview();
    else if (audio.source === 'upload') pendingUploadClickRef.current = true;
    else handleStart();
  };
  // A saved take used to delete on a single click with only a toast as the safety net, while
  // discarding an in-progress (unsaved) take got a real confirm modal — backwards, since the
  // saved take is the one with more to lose. Same request/confirm split as requestDiscard now,
  // for the same reason: one click here permanently drops a finished performance.
  const requestDeleteTake = () => setConfirmDeleteTake(true);
  const confirmedDeleteTake = () => {
    setConfirmDeleteTake(false);
    onAudioChange({ source: 'record', methodSet: false, scopeSet: false, status: 'empty', duration: 0, fileName: undefined, segStart: undefined, segEnd: undefined });
    setRedoing(false);
    showToast('Take removed');
  };
  // Switching tabs to a different method than the current take used to just flip redoing,
  // leaving the old take's data sitting untouched behind the picker until (if ever) a new
  // capture overwrote it — so the filmstrip could show "AI voice" for a slide whose canvas was
  // now sitting on the empty Record tab. Deleting up front makes the status honest immediately
  // (filmstrip flips to "No audio" the moment you confirm), and gives "cancel" an actual meaning:
  // it lands you back on the pill for the take that's still there, not a half-switched state.
  // Same confirm-modal pattern as requestDeleteTake above, since this loses a take the same way.
  const cancelChangeType = () => setConfirmChangeType(false);
  const confirmedChangeType = () => {
    setConfirmChangeType(false);
    onAudioChange({ source: 'record', methodSet: false, scopeSet: false, status: 'empty', duration: 0, fileName: undefined, segStart: undefined, segEnd: undefined });
    setRedoing(true);
    // No destination to jump to — clearing the take is the whole effect of confirming here.
    // The rail (now showing, since hasTake just went false) is where the actual method gets
    // picked next, same as it is for any other empty slide.
  };

  // Setup controls (mode + capture settings) show while nothing's actively happening yet —
  // once you're recording, generating, or uploading, they get out of the way.
  const showModeRail = phase === 'idle' && elapsed === 0 && audio.status !== 'generating' && !uploading;
  // A slide with a take should always be reviewable, not just in the narrow pre-save window —
  // this is the same play/scrub control, just driven by audio.duration instead of elapsed.
  const hasTake = hasTakeForSizing;
  // Same script content backs all three methods now (it's still the slide's notes/talking
  // points either way) — Upload used to hard-exclude it on the theory that you're "just picking
  // a file," but the script is still useful reference for what that file is supposed to cover,
  // same as AI voice. Used to also hard-hide during take review for Record specifically
  // (handleStop calls onScriptVisibleChange(false) on stop — "this moment is about the take,
  // not the script"). That's still the default you land on, but it's no longer a lockout: every
  // row (including the hasTake bar) has its own transcript toggle now, so overriding that
  // default back on is one click away instead of impossible — just scriptVisible, unfiltered.
  const showScriptDock = scriptVisible;
  const showRecordFrame = !hasTake && entryMode === 'record' && phase !== 'preview';

  // Docked script panel — same card shell for either side, just mirrored (padding, resize
  // handle, which edge grows) depending on which one it's parked on. A function rather than a
  // component since it closes over a long list of this component's own state/handlers that
  // would otherwise all need threading through as props for a shell that's only ever used here.
  const renderDockedScript = (side: 'left' | 'right') => (
    // alignSelf: center (not the parent row's default stretch, and not flex-start either) —
    // stretch would still claim the row's full height even though the card no longer asks for
    // 100% height below; flex-start pinned it to the top, which lined up with the slide only
    // because both happened to be the same height — the moment the script grows past
    // slideBox.h (see minHeight below) a top-pinned card and a vertically centered slide drift
    // apart again. Centering both on the same line (see slideCellRef's alignItems) keeps them
    // paired regardless of which one is taller.
    <div style={{ flexShrink: 0, alignSelf: 'center', width: scriptWidth, position: 'relative',
      padding: side === 'left' ? '0 0 0 28px' : '0 28px 0 0', boxSizing: 'border-box' }}>
      {/* Same card language as the teleprompter box (title bar, border, shadow) — docked
          instead of floating, but otherwise the same surface so the two read as one component
          in different positions, not two separately-tuned looks. Solid #15191F here (not the
          teleprompter's translucent rgba(21,25,31,...)) because this card sits directly on the
          studio canvas, which is that same color — no live content underneath it to stay
          see-through for. Sized to its content (see the auto-grow textarea below), not a
          fixed height:100% — but floored at the slide's own height, not the studio's full
          height. A one-line script shouldn't shrink the card shorter than the slide it sits
          next to (that read as unpaired/unbalanced), just shorter than "however tall the whole
          studio happens to be." */}
      {/* overflow: visible, not hidden — ScriptModeMenu's dropdown (and any other popover in
          the header) is a plain absolutely-positioned child, not a portal, so it inherits
          clipping from whatever ancestor has overflow:hidden. That used to be invisible because
          the mode-switch button sat further right in the row; now that it's grouped with the
          font toggle on the left (closer to the card's own left edge), its menu opens far
          enough left to hit that edge and get clipped — "Dock left"/"Teleprompter" reading as
          "eft"/"mpter". The rounded corners don't actually need the clip: nothing else in this
          card bleeds past them. */}
      <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 8, background: '#121212',
        minHeight: slideBox.h,
        border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', overflow: 'visible' }}>
        {/* One row now, not two — dropped the "SCRIPT" icon+label entirely (pure decoration;
            the placeholder text and this card's position next to the slide already say what it
            is) and folded the mode-switch into the same row as font-size/generate instead of
            giving it its own bordered strip. Also reclaims real height for a card whose min-height
            is now tied to the slide, which matters more than a label ever did. */}
        {/* Small A / large A side by side, not one glyph cycling in place — the cycling
            single-button version showed the *current* size and relied on that same glyph
            doubling as its own affordance, which in practice just read as "an A", not as
            something clickable with two states. Two glyphs let the current size announce
            itself (white/bold vs. dim) without needing a hover or a click to find out, same
            legibility contract the floating teleprompter's own sm/lg pair already uses. */}
        {/* Grouped by function, not left-vs-right for its own sake: font size and script
            position are both "how this displays" settings, so they sit together; Generate
            script is the one real action here, so it stands alone on the other end instead of
            being squeezed up against the mode-switch chevron — two dropdown carets sitting
            shoulder to shoulder read as one cluttered thing even though they open different
            menus. */}
        <div className="flex items-center justify-between"
          style={{ flexShrink: 0, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center" style={{ gap: 8 }}>
            <div className="flex items-center" style={{ gap: 1 }}>
              <button onClick={() => setScriptFontSize('sm')} aria-label="Smaller script text" aria-pressed={scriptFontSize === 'sm'}
                className="sp-focus cursor-pointer flex items-center justify-center"
                style={{ width: 19, height: 22, borderRadius: 5, border: 'none', outline: 'none', background: 'transparent',
                  ...ns, fontWeight: 700, fontSize: 10, color: scriptFontSize === 'sm' ? '#fff' : 'rgba(255,255,255,0.35)' }}>
                A
              </button>
              <button onClick={() => setScriptFontSize('lg')} aria-label="Larger script text" aria-pressed={scriptFontSize === 'lg'}
                className="sp-focus cursor-pointer flex items-center justify-center"
                style={{ width: 21, height: 22, borderRadius: 5, border: 'none', outline: 'none', background: 'transparent',
                  ...ns, fontWeight: 700, fontSize: 14, color: scriptFontSize === 'lg' ? '#fff' : 'rgba(255,255,255,0.35)' }}>
                A
              </button>
            </div>
            <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
            <ScriptModeMenu mode={scriptMode} onChange={switchScriptMode} hideTeleprompter={entryMode === 'ai'} />
          </div>
          <div className="flex items-center" style={{ gap: 10 }}>
            {isGeneratingScript ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 11, height: 11, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: WG_TO, borderRadius: '50%', display: 'inline-block', animation: 'v2spin 0.8s linear infinite' }} />
                <span style={{ ...ns, fontSize: 10.5, background: WG_GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Generating…</span>
              </div>
            ) : (
              <GenerateScriptMenu onThisSlide={onGenerateScript} onOpenChat={onOpenAiChat} disabled={phase === 'recording'} />
            )}
          </div>
        </div>
        {/* Height is JS-managed (see the auto-grow effect above) between
            SCRIPT_TEXTAREA_MIN_H and SCRIPT_TEXTAREA_MAX_H, not flex:1-filled — the textarea's
            own overflow-y handles the rare script that hits the max, same as it always did for
            "exceeds the available height" before, just with a real ceiling now instead of
            "however tall the studio happens to be." */}
        <div style={{ padding: '10px 16px 16px', position: 'relative' }}>
          <textarea ref={scriptTextareaRef} value={scripts[idx]} onChange={e => onScriptChange(idx, e.target.value)} readOnly={phase === 'recording'}
            placeholder="Write what you'll say over this slide…"
            style={{ ...ns, display: 'block', width: '100%', resize: 'none', background: 'transparent', border: 'none', outline: 'none',
              overflowY: 'auto',
              fontSize: scriptFontSize === 'sm' ? 13 : 17, color: 'rgba(255,255,255,0.9)',
              lineHeight: 1.7, textAlign: 'left', cursor: phase === 'recording' ? 'default' : 'text' }} />
          <div ref={scriptFadeTopRef} style={{ position: 'absolute', top: 10, left: 16, right: 16, height: 22, opacity: 0,
            background: 'linear-gradient(to bottom, #121212, transparent)', pointerEvents: 'none', transition: 'opacity 0.15s' }} />
          <div ref={scriptFadeBottomRef} style={{ position: 'absolute', bottom: 16, left: 16, right: 16, height: 22, opacity: 0,
            background: 'linear-gradient(to top, #121212, transparent)', pointerEvents: 'none', transition: 'opacity 0.15s' }} />
        </div>
      </div>
      {/* Drag to resize — grows toward whichever edge isn't the docked side (see
          startScriptResize's side-aware delta). Rotated 90° from the old bottom pill's
          handle since the panel grows sideways, not vertically. */}
      <div onPointerDown={e => startScriptResize(e, side)} className="cursor-ew-resize"
        style={{ position: 'absolute', top: 0, bottom: 0, [side === 'left' ? 'right' : 'left']: -6, width: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
        <div style={{ width: 4, height: 36, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
      </div>
    </div>
  );

  // Shared between the mode rail's tabs and the collapsed pill, so the icon for a given source
  // never has two implementations to keep in sync as this file changes. 16px for all three —
  // was mic=15/ai=14/upload=14, none of which matched the 16px icons on the action-zone row
  // this rail sits directly above (transcript toggle, delete-take, redo).
  const renderSourceIcon = (id: SourceKind, color: string) => (
    id === 'record' ? <MicIcon color={color} size={16} /> :
    id === 'ai' ? <WordgenieIcon size={16} color={color} /> :
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
    {/* Script panel's icon-only controls (mode picker, font size, resize) have no visible
        label — StudioTooltip is hover-only and gives keyboard/screen-reader users nothing, so
        those controls carry their own aria-label plus this focus ring instead. Same convention
        as .vp-focus on the voice-picker modal elsewhere in this file. */}
    {/* !important is load-bearing here: every one of these buttons sets outline:'none' inline
        (to kill the default focus square while still relying on hover/active backgrounds for
        mouse users), and an inline style attribute always beats a plain class rule regardless of
        selector specificity. Without it this rule compiles but never actually paints. */}
    {/* Was a saturated #5B9DFF — stood out as the single loudest thing in an otherwise muted,
        neutral-gray control set (every other "on/active" cue here is a plain white-vs-gray icon
        color, no color accent at all). A soft white ring keeps the same visible keyboard-focus
        signal without introducing a new accent color the rest of this chrome deliberately
        doesn't use. */}
    <style>{`.sp-focus:focus-visible { outline: 2px solid rgba(255,255,255,0.55) !important; outline-offset: 2px; }`}</style>
    {/* Countdown covers the whole studio (canvas + action bar), not just the tiny record
        button — a number squeezed into a 52px circle next to the version-switcher pill was
        nearly invisible. This is the moment that matters most, so it gets the whole stage. */}
    <AnimatePresence>
      {phase === 'countdown' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="flex items-center justify-center" style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(18,18,18,0.72)', backdropFilter: 'blur(2px)', borderRadius: 20 }}>
          <motion.span key={countdownN} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.3 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            style={{ ...ns, fontSize: 160, fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: -4 }}>
            {countdownN}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
    <div ref={studioRef} style={{ position: 'relative', width: '100%', flex: 1, minHeight: 0, background: '#121212', borderRadius: 20,
      overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      <div ref={topRowRef} style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px 0' }}>
        <div style={{ minWidth: 32 }} />
        {/* Presenter-view style: a large timer reads clearly from across the room the way the
            small pill floating over the record button didn't. Centered on the studio's own top
            edge, not tied to the button below, so it stays put regardless of the action bar's
            layout underneath. */}
        <AnimatePresence>
          {(phase === 'recording' || phase === 'paused') && (
            <div style={{ position: 'absolute', left: '50%', top: 10, transform: 'translateX(-50%)' }}>
              <motion.div key="timer" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ type: 'spring', stiffness: 480, damping: 24 }}
                className="flex items-center justify-center" style={{ gap: 9 }}>
                {phase === 'recording' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#E5484D', animation: 'v2blink 1s infinite', flexShrink: 0 }} />}
                <span style={{ ...ns, fontSize: 30, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5 }}>
                  {formatTime(elapsed)}
                </span>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {phase !== 'idle' && (
          <button onClick={requestDiscard} className="cursor-pointer flex items-center justify-center flex-shrink-0"
            style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.05)', outline: 'none' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>

      {/* Primary choice panel — Riverside's "How do you want to start?" composition, minus the
          literal heading now — real buttons, centered above the slide, frameless (no card
          border/background) so it reads as part of the same canvas as the slide.

          Before a take exists, this is a real three-way decision, so it stays a segmented
          control — visibility-first, every option one click away, active tab tracks entryMode.

          Once a take exists it collapses to a status pill + "Change" — the checkout-summary-row
          pattern (shipping address / payment method + a subordinate "Change" link), not the
          separately-styled badge+chip that got reverted early on. Two earlier passes landed
          elsewhere before this one:
            1. A separate status badge + "Change type" chip — reverted for splintering into
               three different-looking versions of the same idea chasing spacing/contrast fixes.
            2. Keeping the segmented control expanded forever, just past-tensing the active
               label — safe, but every already-decided slide kept showing a three-way decision
               that was already made.
          The pill's "Change" is also where the confirm happens now, not after picking a
          destination tab — the risk being confirmed ("you'll lose this take") doesn't depend
          on which method replaces it, so warning only once a specific tab is clicked just
          delays the same news. Confirming clears the take immediately, which drops hasTake and
          swaps this straight to the plain three-tab picker below — the same one an empty slide
          gets, no second confirmation once a method is actually picked. Re-recording with the
          same method never touches any of this — that's the separate Re-record button below. */}
      {showModeRail && !aiPreview && (
        <div ref={modeRailRef} className="flex items-center justify-center" style={{ flexShrink: 0, padding: '0 28px 10px' }}>
          {hasTake ? (
            <button onClick={() => setConfirmChangeType(true)} className="flex items-center cursor-pointer"
              style={{ height: 34, padding: '0 6px 0 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)', gap: 10 }}>
              <span className="flex items-center" style={{ gap: 9 }}>
                {renderSourceIcon(audio.source, '#fff')}
                <span style={{ ...ns, fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{SOURCE_LABELS[audio.source]}</span>
              </span>
              <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />
              {/* Checkout convention: the value reads primary, "Change" reads distinctly
                  secondary — same muted weight as an inactive tab, not a same-weight button
                  competing with the value it sits next to. */}
              <span style={{ ...ns, fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.55)', padding: '0 10px' }}>
                Change
              </span>
            </button>
          ) : (
            /* Only ever rendered without a take (see hasTake ternary above) — a switch away
                from an existing one is confirmed and cleared at the pill's "Change" click,
                before this is ever reached, so every tab here is just picking fresh. */
            <div className="flex items-center" style={{ background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 4, gap: 2 }}>
              {([['record', 'Record'], ['ai', 'AI voice'], ['upload', 'Upload']] as const).map(([id, label]) => (
                <button key={id} onClick={() => setEntryMode(id)} className="flex items-center cursor-pointer"
                  style={{ height: 34, padding: '0 16px', borderRadius: 9, border: 'none', gap: 9, ...ns, fontSize: 13.5, fontWeight: 700,
                    transition: 'background 0.15s, color 0.15s',
                    background: entryMode === id ? '#585858' : 'transparent',
                    color: entryMode === id ? '#fff' : 'rgba(255,255,255,0.55)' }}>
                  {renderSourceIcon(id, entryMode === id ? '#fff' : 'rgba(255,255,255,0.55)')}
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Script docks to either side of the slide now, not just the left, or floats free as the
          teleprompter — see renderDockedScript above for the shared card shell.
          overflow: visible, not hidden — same reasoning as the card's own overflow above: this
          row was clipping ScriptModeMenu's dropdown by ~1 character even at the default panel
          width (it's a plain absolutely-positioned child, not a portal). minWidth/minHeight: 0
          still do the actual job this overflow used to get credit for (stopping flex children
          from forcing the row wider/taller than intended); the hidden was only ever catching
          this one popover as collateral. */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, overflow: 'visible' }}>
        {showScriptDock && scriptMode === 'left' && renderDockedScript('left')}
        {/* Portal, not a normal child — it needs to sit above the whole app in a fixed,
            viewport-anchored box regardless of where in the tree it's rendered from, and any
            transformed ancestor (framer-motion animates via transform) would otherwise turn
            into a containing block and break position:fixed. */}
        {showScriptDock && scriptMode === 'teleprompter' && promptPos && typeof document !== 'undefined' && createPortal(
          <div style={{ position: 'fixed', left: promptPos.x, top: promptPos.y, width: promptSize.w, height: promptSize.h, zIndex: 300 }}>
            {/* Flat gray scrim, not frosted glass — matches how real teleprompter overlays
                (VEED's included) actually do it: plain alpha blending with zero blur, so
                whatever's underneath (camera, slide) stays fully sharp through it rather than
                turning to mush. Blur would fight the whole point of it being see-through.
                Darker/more opaque than the first pass — this defaults to sitting centered over
                the slide, which for this product is usually a title-plus-bullets layout, not a
                blank card. A lighter scrim read fine over plain backgrounds but let dense slide
                text bleed straight through and interleave with the script itself. Text keeps its
                own (now two-layer) text-shadow below as a second line of defense so legibility
                never rides on the scrim alone. */}
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 8, background: 'rgba(18,18,18,0.72)',
              border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
              {/* One row, not two — same shape as the docked panel's own header (font toggle +
                  mode menu on the left, the one real action on the right), no "TELEPROMPTER"
                  label or grip glyph standing in for it. The whole strip is still the drag
                  target (cursor: grab says so on its own), so every interactive child below
                  stops the pointerdown from reaching it — same trick ScriptModeMenu's trigger
                  already used before this merge, just now needed by its neighbors too. Fades
                  (not disables) once recording starts: mode-switching and font size are
                  setup-time concerns, not something read mid-performance. */}
              <div onPointerDown={startPromptDrag} className="cursor-grab active:cursor-grabbing flex items-center justify-between"
                style={{ flexShrink: 0, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                  opacity: phase === 'recording' ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <div className="flex items-center" style={{ gap: 1 }} onPointerDown={e => e.stopPropagation()}>
                    <button onClick={() => setScriptFontSize('sm')} aria-label="Smaller script text" aria-pressed={scriptFontSize === 'sm'}
                      className="sp-focus cursor-pointer flex items-center justify-center"
                      style={{ width: 19, height: 22, borderRadius: 5, border: 'none', outline: 'none', background: 'transparent',
                        ...ns, fontWeight: 700, fontSize: 10, color: scriptFontSize === 'sm' ? '#fff' : 'rgba(255,255,255,0.35)' }}>
                      A
                    </button>
                    <button onClick={() => setScriptFontSize('lg')} aria-label="Larger script text" aria-pressed={scriptFontSize === 'lg'}
                      className="sp-focus cursor-pointer flex items-center justify-center"
                      style={{ width: 21, height: 22, borderRadius: 5, border: 'none', outline: 'none', background: 'transparent',
                        ...ns, fontWeight: 700, fontSize: 14, color: scriptFontSize === 'lg' ? '#fff' : 'rgba(255,255,255,0.35)' }}>
                      A
                    </button>
                  </div>
                  <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
                  <ScriptModeMenu mode={scriptMode} onChange={switchScriptMode} hideTeleprompter={entryMode === 'ai'} />
                </div>
                {/* Same slot, same content as the docked panel's header — the two are meant to
                    read as one component in different positions (see renderDockedScript above),
                    so this shouldn't drift into its own layout just because it's floating.
                    Scroll speed lives in its own row below instead of competing for this one. */}
                <div onPointerDown={e => e.stopPropagation()}>
                  {isGeneratingScript ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 11, height: 11, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: WG_TO, borderRadius: '50%', display: 'inline-block', animation: 'v2spin 0.8s linear infinite' }} />
                      <span style={{ ...ns, fontSize: 10.5, background: WG_GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Generating…</span>
                    </div>
                  ) : (
                    <GenerateScriptMenu onThisSlide={onGenerateScript} onOpenChat={onOpenAiChat} disabled={phase === 'recording'} />
                  )}
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, padding: '0 16px 16px', position: 'relative' }}>
                {/* Ref goes on the textarea itself, not this wrapper — a height:100% textarea
                    scrolls its own overflow internally and never actually overflows its
                    wrapper, so auto-scroll has to drive scrollTop here to do anything. */}
                <textarea ref={promptScrollRef} value={scripts[idx]} onChange={e => onScriptChange(idx, e.target.value)} readOnly={phase === 'recording'}
                  placeholder="Write what you'll say over this slide…"
                  style={{ ...ns, width: '100%', height: '100%', resize: 'none', background: 'transparent', border: 'none', outline: 'none',
                    // Bigger than the docked panel's 13/17 at the same sm/lg toggle — this is
                    // read from arm's length while performing, not edited up close, so it needs
                    // to be legible at a glance the way the docked textarea doesn't.
                    fontSize: scriptFontSize === 'sm' ? 18 : 24, color: 'rgba(255,255,255,0.9)',
                    // Belt-and-suspenders on top of the darker scrim above: a tight shadow for
                    // crisp edges plus a wider, softer one so text stays legible over any footage
                    // or slide content, the same layering trick captions use instead of relying
                    // on a fixed opaque backdrop.
                    textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.7)',
                    lineHeight: 1.7, textAlign: 'left', cursor: phase === 'recording' ? 'default' : 'text' }} />
              </div>
              {/* Bottom bar — play/pause preview + speed. No docked-panel equivalent (that
                  header stays exactly as it is above): only the teleprompter actually scrolls,
                  so only it needs a way to preview or tune the pace. Play scrolls the real
                  script at the selected speed — the most honest preview of it there is — and
                  fades out once recording starts, same as the header does, since real takes
                  drive their own scroll and there's nothing left to preview by then. */}
              <div onPointerDown={e => e.stopPropagation()} className="flex items-center justify-between"
                style={{ flexShrink: 0, padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.08)',
                  opacity: phase === 'recording' ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                <StudioTooltip label={previewScrolling ? 'Pause preview' : 'Preview at this pace'}>
                  <button onClick={() => setPreviewScrolling(v => !v)} disabled={phase !== 'idle'}
                    className="flex items-center justify-center flex-shrink-0"
                    style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.1)',
                      cursor: phase === 'idle' ? 'pointer' : 'default' }}>
                    {previewScrolling ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M7 5l12 7-12 7V5z"/></svg>
                    )}
                  </button>
                </StudioTooltip>
                <ScrollSpeedToggle value={scrollSpeed} onChange={setScrollSpeed} />
              </div>
            </div>
            {/* Bottom-right corner resize — same drag-a-handle idiom as the docked panel's edge,
                just a corner instead of an edge since both dimensions grow here. */}
            <div onPointerDown={startPromptResize} className="cursor-nwse-resize"
              style={{ position: 'absolute', right: -4, bottom: -4, width: 18, height: 18, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 3 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15l-6 6M21 8L8 21"/></svg>
            </div>
          </div>,
          document.body
        )}
      {/* Centered, not top-aligned — the docked script card (see renderDockedScript) now
          centers in its own row via alignSelf: center too, so the two share a center line
          instead of a top edge. Center holds up better than top once the script grows past
          slideBox.h (its minHeight): the extra height splits evenly above/below instead of
          pushing everything down from a shared top. */}
      <div ref={slideCellRef} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 28px', minHeight: 200, minWidth: 0, overflow: 'hidden', gap: 24 }}>
        {/* The backing panel behind side-by-side (below) already reads as "these two go
            together" — each panel keeps its own normal rounded corners and a real gap, rather
            than flattening into one merged shape. */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: sideBySideVisible ? sbsGap : 20,
          // Sized in exact px from slideBox/sbsCameraW/sbsGap — those are what fit() already
          // solved for to make the whole combined shape 16:9, so re-deriving it here (rather
          // than a CSS aspect-ratio that can't see the same constraints) keeps it in lockstep.
          ...(sideBySideVisible ? { width: slideBox.w + sbsGap + sbsCameraW + 20, height: slideBox.h + 20,
            padding: 10, borderRadius: 18, background: '#121212', boxSizing: 'border-box' } : {}) }}>
        <AnimatePresence mode="wait">
          <motion.div key={idx} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            style={{ width: slideBox.w, height: slideBox.h, flexShrink: 0, borderRadius: 0, overflow: 'hidden', background: bg, position: 'relative', containerType: 'inline-size',
              // Always on, not just while recording — a dark-themed slide on this dark canvas
              // otherwise has no visible edge at all, border or no recording indicator.
              border: '1px solid rgba(255,255,255,0.14)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)' } as React.CSSProperties}>
            {/* Bottom padding reserves the take-preview overlay's own height (scrub bar +
                timestamp, ~64px) whenever that overlay is showing — otherwise this block's
                vertically-centered text and that bottom-anchored overlay each size independently
                off the same shrinking slideBox, and at narrower widths the centered text grows
                low enough to land underneath (and become unreadable against) the scrubber. */}
            <div style={{ position: 'absolute', inset: 0, paddingTop: '7%', paddingRight: '8%', paddingLeft: '8%',
              paddingBottom: (hasTake || phase === 'preview' || aiPreview) ? 64 : '7%',
              display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {slide.title && <h2 style={{ ...ns, fontSize: 'clamp(14px,4.5cqw,30px)', fontWeight: 700, color: slide.textColorOverride ?? theme.titleColor, margin: 0, lineHeight: 1.2 }}>{slide.title}</h2>}
              {slide.points.length > 0 && (
                <div style={{ marginTop: '4%', display: 'flex', flexDirection: 'column', gap: '2%' }}>
                  {slide.points.map((pt, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: theme.accentColor, marginTop: 6, flexShrink: 0 }} />
                      <p style={{ ...ns, fontSize: 'clamp(10px,2.6cqw,18px)', color: slide.textColorOverride ?? theme.titleColor, opacity: 0.85, margin: 0, lineHeight: 1.45 }}>{pt}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {!hasTake && entryMode === 'record' && captureMode === 'video' && cameraLayout === 'bubble' && (
              <div onPointerDown={startBubbleDrag} className="cursor-grab active:cursor-grabbing"
                style={{ position: 'absolute', left: (bubblePos ?? defaultBubblePos).x, top: (bubblePos ?? defaultBubblePos).y,
                  width: bubbleSize, height: bubbleSize, borderRadius: '50%', touchAction: 'none',
                  overflow: 'hidden', border: '3px solid rgba(255,255,255,0.85)', boxShadow: '0 6px 20px rgba(0,0,0,0.4)' }}>
                <LiveCamera style={{ width: '100%', height: '100%' }} deviceId={cameraDeviceId} />
              </div>
            )}
            {(hasTake || phase === 'preview' || aiPreview) && (
              <>
                {/* Dark scrim + big centered play control — a take should read like a video
                    thumbnail the moment it exists, whether or not it's been saved yet. Same
                    treatment pre- and post-save so the player never lives apart from the slide. */}
                <div onClick={togglePreviewPlay} className="cursor-pointer"
                  style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: previewPlaying ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.32)', transition: 'background 0.2s' }}>
                  <div className="flex items-center justify-center" style={{ width: 60, height: 60, borderRadius: '50%',
                    background: 'rgba(18,18,18,0.6)', backdropFilter: 'blur(6px)', border: '2px solid rgba(255,255,255,0.9)' }}>
                    {previewPlaying
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>
                      : <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 3 }}><path d="M6 4l14 8-14 8z"/></svg>}
                  </div>
                </div>

                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 14px 10px',
                  background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)' }}>
                  <div onClick={seekPreview} style={{ position: 'relative', height: 14, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <div style={{ position: 'relative', width: '100%', height: 3, borderRadius: 1.5, background: 'rgba(255,255,255,0.25)' }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 1.5, background: '#fff',
                        width: `${reviewTotal > 0 ? (previewTime / reviewTotal) * 100 : 0}%`, transition: previewPlaying ? 'width 1s linear' : 'none' }} />
                      <div style={{ position: 'absolute', top: '50%', left: `${reviewTotal > 0 ? (previewTime / reviewTotal) * 100 : 0}%`,
                        transform: 'translate(-50%, -50%)', width: 10, height: 10, borderRadius: '50%', background: '#fff',
                        transition: previewPlaying ? 'left 1s linear' : 'none' }} />
                    </div>
                  </div>
                  <div style={{ marginTop: 3 }}>
                    <span style={{ ...ns, fontSize: 11, color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatTime(previewTime)} / {formatTime(reviewTotal)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
        {sideBySideVisible && (
          // Both dimensions come straight from fit()'s combined-16:9 math (slideBox.h + the
          // fixed sbsCameraW slice), not aspect-ratio/height:100% — those computed independently
          // of the slide next to it and couldn't guarantee the pair actually summed to 16:9.
          <div style={{ width: sbsCameraW, height: slideBox.h, borderRadius: 0, overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', flexShrink: 0 }}>
            <LiveCamera style={{ width: '100%', height: '100%' }} deviceId={cameraDeviceId} />
          </div>
        )}
        </div>
        {/* Peek at what's next — outside the recording frame since it's a presenter aid, not
            part of the capture itself. Dimmed so it doesn't compete with the focused slide. */}
        {showNextPreview && nextSlide && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            <span style={{ ...ns, fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, textTransform: 'uppercase' }}>Next</span>
            <div style={{ width: 180, aspectRatio: '16/9', borderRadius: 0, overflow: 'hidden',
              background: nextSlide.bgImageUrl ? `url(${nextSlide.bgImageUrl}) center/cover` : (nextSlide.bgColor ?? theme.bg),
              border: '1px solid rgba(255,255,255,0.14)', position: 'relative', opacity: 0.7 }}>
              <div style={{ position: 'absolute', inset: 0, padding: '7% 8%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {nextSlide.title && <p style={{ ...ns, fontSize: 11, fontWeight: 700, color: nextSlide.textColorOverride ?? theme.titleColor, margin: 0, lineHeight: 1.25,
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>{nextSlide.title}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
      {showScriptDock && scriptMode === 'right' && renderDockedScript('right')}
      </div>
    </div>

      {/* Primary action zone. Record mode gets a real 3-column bar — settings on the left,
          the record button dead center, slide nav on the right — so the one action that
          matters isn't off-center next to a lopsided nav cluster. AI/upload/preview stay a
          single centered block; they don't have a left/right pairing to balance against.
          Sits outside the rounded card as a full-bleed bar (negative margins cancel the
          parent's 16px inset) instead of being clipped to the card's rounded corners. */}
      <div ref={actionZoneRef} style={{ flexShrink: 0, margin: '10px -16px -16px', padding: '16px 24px',
        // minHeight: 46 below (shared by all three branches of this bar — hasTake, record,
        // ai/upload/preview) is what actually keeps the bar's height identical across every
        // mode, not this padding alone — it matches the record button's own 46px diameter,
        // which stays absolutely-positioned/out-of-flow in the record branch, so it wouldn't
        // otherwise reserve its own space. Shrinking padding here (not that minHeight) is what
        // makes the bar shorter without needing to shrink the record button to match.
        background: 'rgba(255,255,255,0.025)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {hasTake ? (
          /* Re-record used to hide behind a "⋯" button floating on the slide itself — moved
             down here as a real labeled button so it's visible without a click, alongside the
             nav that already lived in this bar. Same position:relative/absolute-center structure
             as the record row and the ai/upload/preview row below (not a 3-column grid anymore —
             that left a big empty 1fr column once Remove take and Change type both moved up to
             the status badge above the slide), so all four bar variants now share one layout
             instead of hasTake being the odd one out. minHeight matches the record button's own
             52px height so this bar sits at the same spot whether or not a take exists. Also
             the one row that was missing the transcript toggle every other row already has —
             reviewing a saved take is exactly when you'd most want to check the take against
             the script, so it needs the same override the other rows give you, not silence. */
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 46 }}>
            <div className="flex items-center">
              <StudioTooltip label={scriptVisible ? 'Hide script' : 'Show script'}>
                <button onClick={() => onScriptVisibleChange(!scriptVisible)}
                  className="cursor-pointer flex items-center justify-center"
                  style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, border: 'none', transition: 'background 0.12s',
                    // No border, flat fill — same language as the delete-take button (its own
                    // unbordered look, before this pass gave it Voice-settings' border to match
                    // its neighbor there). Toggles/pickers here are a different family from that
                    // action-button row: no chrome to signal "this is a control, not text,"
                    // just a flat tinted square. Icon color still carries on/off.
                    background: 'rgba(255,255,255,0.06)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={scriptVisible ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="3" width="16" height="18" rx="2"/>
                    <line x1="8" y1="8" x2="16" y2="8"/>
                    <line x1="8" y1="12" x2="16" y2="12"/>
                    <line x1="8" y1="16" x2="12" y2="16"/>
                  </svg>
                </button>
              </StudioTooltip>
            </div>
            <div className="flex items-center" style={{ gap: 8, position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
              {/* Plain, always-visible icon button — no menu, no hover-to-reveal. Every hidden
                  version of this (corner-hover on the slide, "⋯" menu) traded away visibility
                  for tidiness; this is the same icon-only button from the very first pass, just
                  correctly placed now — next to the button it's a sibling to, in this row's
                  centered flex cluster, not isolated alone in a wide empty grid column the way
                  it was originally (that isolation was the actual "out of place" problem, not
                  the icon-only styling). Delete on the left, redo on the right. */}
              {/* Same bordered-button language as its neighbor now (1.5px/0.22 border,
                  transparent fill) — these are the two real actions in this bar (delete this
                  take, redo it), so they should read as a matched pair of buttons, not one
                  bordered button next to one unbordered icon chip. Toggles (script/settings/
                  camera/mic, in the row above) are the ones that stay borderless — see those for
                  the reasoning; this row is actions, not state. */}
              <StudioTooltip label="Remove take">
                <button onClick={requestDeleteTake} className="cursor-pointer flex items-center justify-center"
                  style={{ width: 40, height: 40, borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.22)', flexShrink: 0,
                    background: 'transparent', color: 'rgba(255,255,255,0.6)',
                    transition: 'background 0.15s, color 0.15s, border-color 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(229,72,77,0.14)'; e.currentTarget.style.color = '#E5484D'; e.currentTarget.style.borderColor = 'rgba(229,72,77,0.4)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                  </svg>
                </button>
              </StudioTooltip>
              <button onClick={handleRedo} className="cursor-pointer flex items-center"
                style={{ gap: 8, height: 40, padding: '0 18px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.22)',
                  background: 'transparent', ...ns, fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                {/* Icon now matches what each label actually means, instead of one redo-arrow
                    glyph doing duty for all three — a "redo" arrow next to "Adjust voice" read
                    as this reopening the last take, when it actually opens the voice picker.
                    A gauge, not a mic — the mic reads as "record/capture," but this opens the
                    voice picker's Speed tuning slider, same glyph that control already uses for
                    scroll speed in the teleprompter, so the icon means "adjust a dial" here too. */}
                {audio.source === 'ai' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M12 15l3.5-3.5"/><path d="M20.3 18c.4-1 .6-2 .6-3a9 9 0 1 0-18 0c0 1 .2 2 .6 3"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v5h5"/>
                  </svg>
                )}
                {audio.source === 'ai' ? 'Adjust voice' : audio.source === 'upload' ? 'Replace file' : 'Re-record'}
              </button>
            </div>
            {/* Routed through the parent's activeIdx (not local idx) — this state reviews a
                saved take, and each slide's own recorded/idle status lives on the parent, so
                switching slides here has to actually change slide, not just what's on screen. */}
            <div className="flex items-center" style={{ gap: 8 }}>
              <button onClick={() => onNavigate(Math.max(0, idx - 1))} disabled={idx === 0}
                className="cursor-pointer flex items-center justify-center"
                style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', opacity: idx === 0 ? 0.3 : 1 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <span style={{ ...ns, fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{idx + 1} / {slides.length}</span>
              <button onClick={() => onNavigate(Math.min(slides.length - 1, idx + 1))} disabled={idx === slides.length - 1}
                className="cursor-pointer flex items-center justify-center"
                style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', opacity: idx === slides.length - 1 ? 0.3 : 1 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
          </div>
        ) : entryMode === 'record' && phase !== 'preview' ? (
          <>
          {/* True centering, not CSS Grid's 1fr/auto/1fr — a left cluster this size (transcript,
              settings, mic, camera, layout) doesn't reliably balance against the lighter nav on
              the right; grid's fr tracks only split *leftover* space evenly, not total space, so
              the record button would end up visibly off the bar's actual midpoint. The
              redo/record/stop group is symmetric by construction (equal-size reserved slots
              either side of the button), so absolute-positioning that whole group at 50% also
              centers the button itself regardless of how lopsided left vs. right gets.
              minHeight matches the record button's own 52px height explicitly — the button is
              position:absolute (out of flow) for that centering, so it no longer forces this
              row's height itself, and the row would otherwise shrink to the ~34px side clusters
              and visibly change height switching to/from AI voice or Upload, which do set 52. */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 46 }}>
            {/* Five independently-bordered chips, not one continuous tray — each control (or
                tightly-paired control+device-menu) gets its own background/border/radius, so
                "transcript" and "what's capturing" read as distinct choices instead of one
                undifferentiated strip. Both sub-groups live inside one shared wrapper (not as
                separate direct children of the row below) — this row's own justify-content is
                space-between for the record button's absolutely-positioned centering, and two
                bare siblings would each catch a share of that spacing and drift apart toward
                the record button instead of staying together on the left, which is what
                actually happened the first time this shipped without the wrapper. Extra gap
                between the transcript+settings pair and the mic/camera/layout cluster stands in
                for the old divider line — a wider gap already reads as "these are a different
                group" without needing a rule to say so. */}
            <div className="flex items-center" style={{ gap: 14 }}>
              <div className="flex items-center" style={{ gap: 6 }}>
                {/* Transcript is its own single-click icon, not folded into the settings popover
                    — it's something you reach for per-slide or mid-take, unlike countdown/next-
                    preview which are configured once and left alone, so it shouldn't cost an
                    extra click. Stays available through the whole take. */}
                <StudioTooltip label={scriptVisible ? 'Hide script' : 'Show script'}>
                  <button onClick={() => onScriptVisibleChange(!scriptVisible)}
                    className="cursor-pointer flex items-center justify-center"
                    style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, border: 'none', transition: 'background 0.12s',
                      // No border, flat fill — see the hasTake/AI-voice rows' copy of this
                      // button for the full reasoning.
                      background: 'rgba(255,255,255,0.06)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={scriptVisible ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="3" width="16" height="18" rx="2"/>
                      <line x1="8" y1="8" x2="16" y2="8"/>
                      <line x1="8" y1="12" x2="16" y2="12"/>
                      <line x1="8" y1="16" x2="12" y2="16"/>
                    </svg>
                  </button>
                </StudioTooltip>
                {/* Countdown/next-preview are pre-take setup, not something you'd change mid-take
                    (the countdown has already run, and the next-slide preview's whole point is
                    deciding what to glance at before you start) — so this locks (not unmounts)
                    once recording actually begins. Staying mounted keeps the row's width fixed;
                    unmounting it would shift the record button between idle and recording. */}
                <div style={{ borderRadius: 9, background: 'rgba(255,255,255,0.06)' }}>
                  <DisplayOptionsMenu disabled={!showModeRail}
                    countdownEnabled={countdownEnabled} onCountdownChange={setCountdownEnabled}
                    nextPreviewEnabled={nextPreviewEnabled} onNextPreviewChange={setNextPreviewEnabled} />
                </div>
              </div>
              <div className="flex items-center" style={{ gap: 8, marginLeft: 8 }}>
                {/* Mic stays live through the whole take, not just setup — muting mid-recording
                    (need to cough, someone walks in) is a real call-control expectation, unlike
                    the camera/layout choice, which still locks in once recording starts since
                    swapping the composition mid-take doesn't make sense. Doesn't gate anything
                    real here (no audio graph to mute in this mock) but it needs to actually
                    respond — a mic icon that looks clickable and isn't is worse than not having
                    the control at all. */}
                <div ref={micPillRef} className="flex items-center" style={{ height: 34, borderRadius: 9, flexShrink: 0,
                  background: 'rgba(255,255,255,0.06)' }}>
                  <button onClick={() => setMicMuted(m => !m)}
                    title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                    className="cursor-pointer flex items-center justify-center"
                    style={{ width: 34, height: '100%', border: 'none', background: 'transparent', transition: 'background 0.12s',
                      borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    {micMuted ? <MicOffIcon color="rgba(255,255,255,0.6)" /> : <MicIcon color="rgba(255,255,255,0.85)" />}
                  </button>
                  <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.16)', flexShrink: 0 }} />
                  {/* Stays live through the whole take, same as the mute toggle it's attached to. */}
                  <DeviceMenu kind="audioinput" value={micDeviceId} onChange={setMicDeviceId} rounded="right" openRight={deviceMenuOpensRight} />
                </div>
                {/* Camera also stays mounted (disabled, not removed) once recording starts, for
                    the same row-width-stability reason as the display-options menu above. */}
                <div className="flex items-center" style={{ height: 34, borderRadius: 9, flexShrink: 0,
                  background: 'rgba(255,255,255,0.06)',
                  opacity: showModeRail ? 1 : 0.4 }}>
                  <button onClick={() => showModeRail && setCaptureMode(m => m === 'audio' ? 'video' : 'audio')}
                    title={captureMode === 'video' ? 'Turn camera off' : 'Turn camera on'}
                    className={showModeRail ? 'cursor-pointer flex items-center justify-center' : 'flex items-center justify-center'}
                    style={{ width: 34, height: '100%', border: 'none', background: 'transparent', transition: 'background 0.12s',
                      borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }}
                    onMouseEnter={e => { if (showModeRail) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    {captureMode === 'video'
                      ? <VideoIcon color="rgba(255,255,255,0.85)" />
                      : <VideoOffIcon color="rgba(255,255,255,0.6)" />}
                  </button>
                  <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.16)', flexShrink: 0 }} />
                  {/* Real, unlike the mic chevron: picking a device here actually swaps
                      LiveCamera's getUserMedia constraints, so the preview (and the composited
                      take) reflects the chosen device. */}
                  <DeviceMenu kind="videoinput" value={cameraDeviceId} onChange={setCameraDeviceId} disabled={!showModeRail} rounded="right" openRight={deviceMenuOpensRight} />
                </div>
                {/* Layout — its own control (Veed's "Layouts", Pitch's "View"), only relevant
                    once the camera is actually on. Camera itself is locked by this point, so
                    this can't newly appear/disappear mid-recording — it just stops opening. */}
                {captureMode === 'video' && (
                  <LayoutPicker value={cameraLayout} onChange={setCameraLayout} disabled={!showModeRail} />
                )}
              </div>
            </div>

            {/* Redo/record/stop, centered as one group — symmetric by construction (redo-slot and
                stop-slot are equal-size reserved slots either side of the button), so centering
                the whole group also centers the button itself. */}
            <div className="flex items-center" style={{ gap: 18, position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
                    {/* Reserved-size slot (not conditionally in the flex flow) — a plain
                        conditional mount would widen this group when Redo appears, shifting the
                        record button off the 50% center point this whole group is pinned to. */}
                    <div style={{ width: 36, height: 36, flexShrink: 0, position: 'relative' }}>
                      <AnimatePresence>
                        {(phase === 'recording' || phase === 'paused') && (
                          <StudioTooltip key="redo" label="Redo take">
                            <motion.button onClick={handleRerecord}
                              initial={{ opacity: 0, scale: 0.2, x: 60 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.2, x: 60 }}
                              transition={{ type: 'spring', stiffness: 480, damping: 24 }}
                              className="cursor-pointer flex items-center justify-center"
                              style={{ width: 36, height: 36, borderRadius: 999, border: 'none', outline: 'none', background: 'rgba(255,255,255,0.12)', cursor: 'pointer' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v5h5"/>
                              </svg>
                            </motion.button>
                          </StudioTooltip>
                        )}
                      </AnimatePresence>
                    </div>
                    <StudioTooltip label={phase === 'idle' ? 'Start recording' : phase === 'recording' ? 'Pause' : phase === 'paused' ? 'Resume' : 'Starting…'}>
                      <button onClick={handleRecordButtonClick}
                        // Countdown ignores clicks entirely — not just visually disabled, the
                        // handler itself (handlePauseResume) no-ops for phase 'countdown', so
                        // there's no way to skip ahead into recording early.
                        className={phase === 'countdown' ? 'flex items-center justify-center flex-shrink-0' : 'cursor-pointer flex items-center justify-center flex-shrink-0'}
                        style={{ width: 46, height: 46, borderRadius: '50%', border: 'none', outline: 'none',
                          background: phase === 'recording' ? '#E5484D' : phase === 'countdown' ? 'rgba(255,255,255,0.12)' : '#fff',
                          boxShadow: phase === 'recording' ? '0 0 0 6px rgba(229,72,77,0.22)' : phase === 'countdown' ? 'none' : '0 0 0 4px rgba(255,255,255,0.1)',
                          cursor: phase === 'countdown' ? 'default' : 'pointer',
                          transition: 'all 0.2s' }}>
                        {phase === 'recording'
                          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>
                          // idle, countdown, and paused all share the same red dot — resuming is
                          // still "capture," not media playback, so it shouldn't borrow a play glyph.
                          : <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#E5484D', display: 'block' }} />}
                      </button>
                    </StudioTooltip>
                    <div style={{ width: 36, height: 36, flexShrink: 0, position: 'relative' }}>
                      <AnimatePresence>
                        {(phase === 'recording' || phase === 'paused') && (
                          <StudioTooltip key="stop" label="Stop and review">
                            <motion.button onClick={handleStop}
                              initial={{ opacity: 0, scale: 0.2, x: -60 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.2, x: -60 }}
                              transition={{ type: 'spring', stiffness: 480, damping: 24 }}
                              className="cursor-pointer flex items-center justify-center"
                              style={{ width: 36, height: 36, borderRadius: 999, border: 'none', outline: 'none', background: 'rgba(255,255,255,0.12)', cursor: 'pointer' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
                            </motion.button>
                          </StudioTooltip>
                        )}
                      </AnimatePresence>
                    </div>
            </div>

            {/* Right: slide nav — its own cluster, opposite the left-side controls, with the
                record button centered independently between them. */}
            <div className="flex items-center" style={{ gap: 8 }}>
              {/* Still idle (nothing captured yet this session) → route through the parent so
                  the destination slide's own recorded/idle status loads correctly, same as the
                  hasTake nav. Once actually recording/paused, stay on local idx — remounting
                  mid-take via the parent would drop the in-progress capture. */}
              <button onClick={() => { const t = Math.max(0, idx - 1); phase === 'idle' ? onNavigate(t) : setIdx(t); }} disabled={idx === 0}
                className="cursor-pointer flex items-center justify-center"
                style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: 'rgba(255,255,255,0.06)', opacity: idx === 0 ? 0.3 : 1 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <span style={{ ...ns, fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{idx + 1} / {slides.length}</span>
              {/* "Skip to empty slides" (confirmRecordScope) routes Next around slides that
                  already had audio before this take, instead of always landing on idx+1 — the
                  disabled state has to ask the same nextReachableIdx question, or the button
                  would stay clickable with nothing left to skip to. */}
              <button onClick={() => {
                  if (phase === 'idle') { onNavigate(Math.min(slides.length - 1, idx + 1)); return; }
                  const t = nextReachableIdx(idx + 1); if (t !== -1) setIdx(t);
                }}
                disabled={phase === 'idle' ? idx === slides.length - 1 : nextReachableIdx(idx + 1) === -1}
                className="cursor-pointer flex items-center justify-center"
                style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: 'rgba(255,255,255,0.06)',
                  opacity: (phase === 'idle' ? idx === slides.length - 1 : nextReachableIdx(idx + 1) === -1) ? 0.3 : 1 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
          </div>
          </>
        ) : (
          // Matches the record row's minHeight so the bar reads the same height across Record,
          // AI voice, and Upload instead of shrinking/growing with whatever content happens to
          // be in this state. Slide nav stays put across all three modes (see the record row's
          // own copy above) — absolutely centering the mode content, same trick the record row
          // uses for its button, keeps it centered on the bar regardless of the nav cluster
          // sitting to its right. space-between (not flex-end) now that there's a left cluster
          // too — the transcript toggle, same button as Record's, just previously scoped to that
          // one row even though AI voice and Upload both have a script worth toggling as well.
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 46 }}>
            <div className="flex items-center">
              <StudioTooltip label={scriptVisible ? 'Hide script' : 'Show script'}>
                <button onClick={() => onScriptVisibleChange(!scriptVisible)}
                  className="cursor-pointer flex items-center justify-center"
                  style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, border: 'none', transition: 'background 0.12s',
                    // No border, flat fill — same language as the delete-take button (its own
                    // unbordered look, before this pass gave it Voice-settings' border to match
                    // its neighbor there). Toggles/pickers here are a different family from that
                    // action-button row: no chrome to signal "this is a control, not text,"
                    // just a flat tinted square. Icon color still carries on/off.
                    background: 'rgba(255,255,255,0.06)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={scriptVisible ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="3" width="16" height="18" rx="2"/>
                    <line x1="8" y1="8" x2="16" y2="8"/>
                    <line x1="8" y1="12" x2="16" y2="12"/>
                    <line x1="8" y1="16" x2="12" y2="16"/>
                  </svg>
                </button>
              </StudioTooltip>
            </div>
            <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            {entryMode === 'ai' ? (
              audio.status === 'generating' ? (
                <div className="flex items-center justify-center" style={{ gap: 8, height: 40 }}>
                  <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: WG_TO, borderRadius: '50%', display: 'inline-block', animation: 'v2spin 0.8s linear infinite' }} />
                  <span style={{ ...ns, fontSize: 12.5, fontWeight: 600, background: WG_GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Generating…</span>
                </div>
              ) : aiPreview ? (
                /* Same review moment a recording gets — the take is already playable on the
                   slide above (scrim + play + scrubber), this row is just the two decisions
                   left: keep this voice's take, or go back and pick a different voice. */
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <button onClick={changeVoiceFromPreview} className="cursor-pointer"
                    style={{ height: 42, padding: '0 22px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.22)', background: 'transparent', ...ns, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', cursor: 'pointer', outline: 'none' }}>
                    Change voice
                  </button>
                  <button onClick={saveAiTake} className="cursor-pointer"
                    style={{ height: 42, padding: '0 26px', borderRadius: 10, border: 'none', background: '#006EFE', ...ns, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', outline: 'none' }}>
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex items-center" style={{ gap: 10 }}>
                  {/* Same border/fill as the mic/camera/layout/settings chips (0.05 fill, 0.1
                      border) — this is that same family (a chip showing current state, click to
                      change it), not a secondary action button. Secondary buttons (Cancel,
                      Change voice from preview, Discard) use a visibly heavier, unfilled border
                      (1.5px/0.22) instead; this one was sitting at 0.14, an in-between value that
                      read as neither family clearly. */}
                  <button onClick={() => setVoicePickerOpen(true)} className="cursor-pointer flex items-center"
                    style={{ gap: 8, height: 40, padding: '0 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.05)', ...ns, fontSize: 13, fontWeight: 700, color: '#fff' }}>
                    <WordgenieIcon size={13} color="rgba(255,255,255,0.55)" />
                    {voiceName(audio.voiceId, cloneName)}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <button onClick={generateAiAudio} className="cursor-pointer"
                    style={{ height: 40, padding: '0 24px', borderRadius: 10, border: 'none', background: '#006EFE', ...ns, fontSize: 13.5, fontWeight: 700, color: '#fff' }}>
                    Generate audio
                  </button>
                </div>
              )
            ) : entryMode === 'upload' ? (
              uploading ? (
                <div className="flex items-center justify-center" style={{ gap: 8, height: 40 }}>
                  <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#B9A2FF', borderRadius: '50%', display: 'inline-block', animation: 'v2spin 0.8s linear infinite' }} />
                  <span style={{ ...ns, fontSize: 12.5, color: '#B9A2FF', fontWeight: 600 }}>Uploading…</span>
                </div>
              ) : (
                <div onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) handleFile(file); }}
                  className="cursor-pointer flex items-center justify-center"
                  style={{ gap: 8, width: '100%', maxWidth: 420, height: 52, padding: '0 20px', borderRadius: 12,
                    border: `1.5px dashed ${dragOver ? '#0FA47C' : 'rgba(255,255,255,0.25)'}`, background: dragOver ? 'rgba(15,164,124,0.1)' : 'rgba(255,255,255,0.04)',
                    ...ns, fontSize: 13, fontWeight: 600, color: dragOver ? '#5FDBA8' : 'rgba(255,255,255,0.6)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={dragOver ? '#0FA47C' : 'rgba(255,255,255,0.5)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M12 5l-5 5M12 5l5 5"/></svg>
                  {dragOver ? 'Drop to upload' : 'Upload audio file or drag it here'}
                  <input ref={fileInputRef} type="file" accept="audio/*" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) handleFile(file); }} style={{ display: 'none' }} />
                </div>
              )
            ) : (
              /* Player already lives on the slide above (scrim + play + scrubber) — this row
                 is just the two decisions left: keep it or start over. */
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button onClick={handleRerecord} className="cursor-pointer"
                  style={{ height: 42, padding: '0 22px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.22)', background: 'transparent', ...ns, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', cursor: 'pointer', outline: 'none' }}>
                  Re-record
                </button>
                <button onClick={handleDone} className="cursor-pointer"
                  style={{ height: 42, padding: '0 26px', borderRadius: 10, border: 'none', background: '#006EFE', ...ns, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', outline: 'none' }}>
                  Save
                </button>
              </div>
            )}
            </div>
            <div className="flex items-center" style={{ gap: 8 }}>
              <button onClick={() => onNavigate(Math.max(0, idx - 1))} disabled={idx === 0}
                className="cursor-pointer flex items-center justify-center"
                style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: 'rgba(255,255,255,0.06)', opacity: idx === 0 ? 0.3 : 1 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <span style={{ ...ns, fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{idx + 1} / {slides.length}</span>
              <button onClick={() => onNavigate(Math.min(slides.length - 1, idx + 1))} disabled={idx === slides.length - 1}
                className="cursor-pointer flex items-center justify-center"
                style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: 'rgba(255,255,255,0.06)', opacity: idx === slides.length - 1 ? 0.3 : 1 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Portal wraps AnimatePresence, not the other way around — createPortal returns a
          ReactPortal, and AnimatePresence can't detect/clone that as an animatable child if
          it's the thing being conditionally rendered inside it. Keeping AnimatePresence's own
          child a plain conditional motion.div (exactly like a non-portaled modal) and portaling
          the whole subtree is what actually works; see the Wordgenie chat panel below for the
          same pattern already in use. */}
      {/* One system for every modal in the Studio: same backdrop (blur, not flat — softens the
          busy canvas behind without hiding that it's still there), same card material
          (#1E1E1E, 1px hairline, 16px radius, same drop shadow), same type scale (16/700 title,
          13/0.55-white description), same secondary-ghost/primary recipe with a matching glow
          per hue, and every interactive element on .sp-focus — the one focus-ring color this
          chrome already uses everywhere else, not a one-off accent. Voice picker used to be its
          own visual world (gradient fill, 22px radius, blue focus ring); it's wider because it
          actually holds more content, not because it's a different product. */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {confirmDiscard && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,14,0.65)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '26px 26px 22px', width: 380, textAlign: 'left', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
                <p style={{ ...ns, fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Discard this recording?</p>
                <p style={{ ...ns, fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '0 0 22px', lineHeight: 1.5 }}>
                  {phase === 'preview' ? "You'll lose this take — it hasn't been saved yet." : "You'll lose what you've recorded so far."}
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setConfirmDiscard(false)} className="sp-focus cursor-pointer"
                    style={{ height: 40, padding: '0 20px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.22)', background: 'transparent', ...ns, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', cursor: 'pointer', outline: 'none', transition: 'background 0.12s, border-color 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.32)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; }}>
                    Keep editing
                  </button>
                  <button onClick={confirmedDiscard} className="sp-focus cursor-pointer"
                    style={{ height: 40, padding: '0 20px', borderRadius: 10, border: 'none', background: '#E5484D', ...ns, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', outline: 'none', boxShadow: '0 6px 18px rgba(229,72,77,0.35)', transition: 'filter 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}>
                    Discard
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {confirmChangeType && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,14,0.65)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '26px 26px 22px', width: 380, textAlign: 'left', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
                {/* No destination named — this fires from the pill's "Change" click, before any
                    replacement method is picked, so the only thing to confirm yet is the loss. */}
                <p style={{ ...ns, fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>
                  Change how this slide is narrated?
                </p>
                <p style={{ ...ns, fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '0 0 22px', lineHeight: 1.5 }}>
                  {`You'll lose the current ${audio.source === 'ai' ? 'AI voice take' : audio.source === 'upload' ? 'uploaded file' : 'recording'} for this slide.`}
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={cancelChangeType} className="sp-focus cursor-pointer"
                    style={{ height: 40, padding: '0 20px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.22)', background: 'transparent', ...ns, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', cursor: 'pointer', outline: 'none', transition: 'background 0.12s, border-color 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.32)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; }}>
                    Cancel
                  </button>
                  <button onClick={confirmedChangeType} className="sp-focus cursor-pointer"
                    style={{ height: 40, padding: '0 20px', borderRadius: 10, border: 'none', background: '#E5484D', ...ns, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', outline: 'none', boxShadow: '0 6px 18px rgba(229,72,77,0.35)', transition: 'filter 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}>
                    Change
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {confirmDeleteTake && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,14,0.65)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '26px 26px 22px', width: 380, textAlign: 'left', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
                <p style={{ ...ns, fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Remove this take?</p>
                <p style={{ ...ns, fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '0 0 22px', lineHeight: 1.5 }}>
                  {`You'll lose this ${audio.source === 'ai' ? 'AI voice take' : audio.source === 'upload' ? 'uploaded file' : 'recording'} for this slide — this can't be undone.`}
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setConfirmDeleteTake(false)} className="sp-focus cursor-pointer"
                    style={{ height: 40, padding: '0 20px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.22)', background: 'transparent', ...ns, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', cursor: 'pointer', outline: 'none', transition: 'background 0.12s, border-color 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.32)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; }}>
                    Cancel
                  </button>
                  <button onClick={confirmedDeleteTake} className="sp-focus cursor-pointer"
                    style={{ height: 40, padding: '0 20px', borderRadius: 10, border: 'none', background: '#E5484D', ...ns, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', outline: 'none', boxShadow: '0 6px 18px rgba(229,72,77,0.35)', transition: 'filter 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}>
                    Remove
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {confirmRecordScope && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,14,0.65)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                style={{ position: 'relative', background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '26px 26px 22px', width: 380, textAlign: 'left', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
                {/* Same shape as every sibling confirm modal now: plain question-title, one
                    description line carrying the explanation, two side-by-side buttons — no
                    per-button subtext. X close button here (unlike its siblings) because
                    neither Override nor Skip is a no-op "cancel" — both are real proceed
                    actions, so dismissing without deciding needs its own affordance. Same 28px
                    close button as the voice picker's, not a smaller one-off. */}
                <button onClick={() => setConfirmRecordScope(false)} className="sp-focus cursor-pointer flex items-center justify-center"
                  style={{ position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', outline: 'none', transition: 'background 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <p style={{ ...ns, fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 26px 8px 0' }}>
                  Skip slides that already have audio?
                </p>
                <p style={{ ...ns, fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '0 0 22px', lineHeight: 1.5 }}>
                  {`${otherTakeSlideNumbers.join(', ')} already ${otherTakeSlideNumbers.length === 1 ? 'has' : 'have'} audio. Skip jumps past them; Override lets Next stop on them too, in case you want to redo one.`}
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => confirmedRecordScope(true)} className="sp-focus cursor-pointer"
                    style={{ height: 40, padding: '0 20px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.22)', background: 'transparent', ...ns, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', cursor: 'pointer', outline: 'none', transition: 'background 0.12s, border-color 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.32)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; }}>
                    Override
                  </button>
                  <button onClick={() => confirmedRecordScope(false)} className="sp-focus cursor-pointer"
                    style={{ height: 40, padding: '0 20px', borderRadius: 10, border: 'none', background: '#006EFE', ...ns, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', outline: 'none', boxShadow: '0 6px 18px rgba(0,110,254,0.35)', transition: 'filter 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}>
                    Skip
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {voicePickerOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setVoicePickerOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,14,0.65)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                onClick={e => e.stopPropagation()} className="vp-modal"
                style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24, width: 464, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
                  <div>
                    <p style={{ ...ns, fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Choose a voice</p>
                    <p style={{ ...ns, fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.5 }}>Pick a voice, then tune its pace below</p>
                  </div>
                  <button onClick={() => setVoicePickerOpen(false)} className="sp-focus cursor-pointer flex items-center justify-center"
                    style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', outline: 'none', flexShrink: 0, transition: 'background 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
                <VoiceList value={audio.voiceId} cloneName={cloneName} onChange={id => onAudioChange({ voiceId: id })} onClone={onClone} dark layout="grid" />
                <div style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '14px', marginTop: 16, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
                  <TuningSlider label="Speed" value={voiceSpeed} onChange={setVoiceSpeed} leftLabel="Slower" rightLabel="Faster" />
                </div>
                <button onClick={() => setVoicePickerOpen(false)} className="sp-focus cursor-pointer"
                  style={{ width: '100%', height: 42, borderRadius: 10, border: 'none', background: '#006EFE', ...ns, fontSize: 13.5, fontWeight: 700, color: '#fff', marginTop: 16, boxShadow: '0 6px 18px rgba(0,110,254,0.35)', cursor: 'pointer', outline: 'none', transition: 'filter 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}>
                  Done
                </button>
                <style>{`
                  .vp-modal .vp-focus:focus-visible { outline: 2px solid rgba(255,255,255,0.55); outline-offset: 2px; }
                  .vp-modal .vp-preview-idle:hover { border-color: rgba(255,255,255,0.4) !important; background: rgba(255,255,255,0.14) !important; }
                `}</style>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Shared audio controls
   ════════════════════════════════════════════════════════════════ */
function SourcePill({ value, onChange }: { value: SourceKind; onChange: (s: SourceKind) => void }) {
  const opts: { id: SourceKind; label: string }[] = [
    { id: 'ai', label: 'AI' }, { id: 'record', label: 'Record' }, { id: 'upload', label: 'Upload' },
  ];
  return (
    <div className="flex" style={{ background: '#F1F3F8', borderRadius: 8, padding: 3, gap: 2 }}>
      {opts.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)} className="cursor-pointer"
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: 'none', ...ns, fontSize: 11.5, fontWeight: 700,
            background: value === o.id ? '#fff' : 'transparent',
            color: value === o.id ? '#15191F' : '#8596AD',
            boxShadow: value === o.id ? '0 1px 4px rgba(15,23,51,0.10)' : 'none', transition: 'all 0.15s' }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function VoiceList({ value, cloneName, onChange, onClone, dark = false, layout = 'list' }: {
  value: string; cloneName: string | null; onChange: (id: string) => void; onClone: () => void; dark?: boolean;
  // 'grid' packs voices two-per-row as bordered tiles — used in the studio canvas where the
  // panel competes for vertical space with the slide and script above it. Selection there reads
  // as a ring around the tile rather than a filled row, since a filled row at this density reads
  // like a native form control rather than a considered pick.
  layout?: 'list' | 'grid';
}) {
  const [previewing, setPreviewing] = useState<string | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (previewTimer.current) clearTimeout(previewTimer.current); }, []);

  const preview = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (previewing === id) { clearTimeout(previewTimer.current!); setPreviewing(null); return; }
    setPreviewing(id);
    previewTimer.current = setTimeout(() => setPreviewing(null), 3000);
  };

  const allVoices = [
    ...AI_VOICES.map(v => ({ id: v.id, name: v.name, accent: v.accent })),
    ...(cloneName ? [{ id: CLONE_VOICE_ID, name: cloneName, accent: 'Your voice' }] : []),
  ];

  // Same component, two palettes — used both in the light classic panel and the dark studio canvas.
  // Dark's "selected" cue is white, not blue — same reasoning as .sp-focus elsewhere in this
  // file: the dark chrome deliberately keeps color out of on/active/selected states and saves
  // it for real actions, so a second blue accent here would just be more of the same noise.
  const c = dark
    ? { selBg: 'rgba(255,255,255,0.12)', selRing: 'rgba(255,255,255,0.18)', hoverBg: 'rgba(255,255,255,0.06)', radioOff: 'rgba(255,255,255,0.3)',
        select: '#fff', name: '#fff', accent: 'rgba(255,255,255,0.4)', previewBorder: 'rgba(255,255,255,0.2)', previewBg: 'rgba(255,255,255,0.08)',
        previewPlayingBg: 'rgba(255,255,255,0.16)', previewIcon: 'rgba(255,255,255,0.55)', divider: 'rgba(255,255,255,0.1)', muted: 'rgba(255,255,255,0.6)' }
    : { selBg: '#F0F6FF', selRing: 'rgba(0,110,254,0.14)', hoverBg: '#F4F6F9', radioOff: '#C8CDD9',
        select: '#006EFE', name: '#15191F', accent: '#B0BACB', previewBorder: '#E0E5EB', previewBg: '#fff',
        previewPlayingBg: '#15191F', previewIcon: '#8596AD', divider: '#EEF1F6', muted: '#52637A' };

  const grid = layout === 'grid';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <div style={grid ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } : { display: 'flex', flexDirection: 'column', gap: 1 }}>
        {allVoices.map(v => {
          const sel = value === v.id;
          const prev = previewing === v.id;
          return grid ? (
            /* Avatar-led card (ElevenLabs/Descript-style voice pickers do the same) — a colored
               initial avatar reads as a distinct persona at a glance, where a bare text row
               didn't. Preview is its own real button on the right, not a tiny badge tucked into
               the avatar's corner — that read as barely-clickable decoration. */
            <button key={v.id} onClick={() => onChange(v.id)}
              className="vp-focus w-full flex items-center cursor-pointer relative"
              style={{ gap: 10, padding: '10px 12px', borderRadius: 12, outline: 'none',
                border: `1.5px solid ${sel ? c.select : 'rgba(255,255,255,0.07)'}`,
                background: sel ? c.selBg : 'rgba(255,255,255,0.03)',
                boxShadow: sel ? `0 0 0 3px ${c.selRing}` : 'none',
                transform: 'translateY(0)',
                transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s, transform 0.15s' }}
              onMouseEnter={e => { if (!sel) { e.currentTarget.style.background = c.hoverBg; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
              onMouseLeave={e => { e.currentTarget.style.background = sel ? c.selBg : 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = sel ? c.select : 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: sel ? '0 0 0 2px rgba(255,255,255,0.5)' : 'none', transition: 'box-shadow 0.15s',
                background: VOICE_AVATAR_GRADIENT[v.id] ?? 'linear-gradient(135deg, #64748B, #475569)' }}>
                <span style={{ ...ns, fontSize: 14, fontWeight: 700, color: '#fff' }}>{v.name.charAt(0)}</span>
              </span>
              <div className="flex flex-col items-start" style={{ minWidth: 0, flex: 1 }}>
                <span style={{ ...ns, fontSize: 13, fontWeight: sel ? 700 : 600, color: c.name, whiteSpace: 'nowrap' }}>{v.name}</span>
                <span style={{ ...ns, fontSize: 11, color: c.accent, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.accent}</span>
              </div>
              <span onClick={e => preview(e, v.id)}
                className={`cursor-pointer flex items-center justify-center flex-shrink-0${prev ? '' : ' vp-preview-idle'}`}
                style={{ width: 28, height: 28, borderRadius: '50%',
                  border: `1.5px solid ${prev ? c.select : 'rgba(255,255,255,0.2)'}`,
                  background: prev ? c.select : 'rgba(255,255,255,0.06)', transition: 'all 0.15s' }}>
                {prev
                  ? <svg width="9" height="9" viewBox="0 0 24 24" fill={dark ? '#121212' : 'white'}><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>
                  : <svg width="9" height="9" viewBox="0 0 24 24" fill="rgba(255,255,255,0.75)" style={{ marginLeft: 1 }}><path d="M6 4l14 8-14 8z"/></svg>}
              </span>
            </button>
          ) : (
            <button key={v.id} onClick={() => onChange(v.id)}
              className="w-full flex items-center cursor-pointer"
              style={{ padding: '7px 8px', borderRadius: 8, border: 'none', outline: 'none',
                background: sel ? c.selBg : 'transparent', transition: 'background 0.1s' }}
              onMouseEnter={e => { if (!sel) e.currentTarget.style.background = c.hoverBg; }}
              onMouseLeave={e => { e.currentTarget.style.background = sel ? c.selBg : 'transparent'; }}>
              {/* Radio */}
              <span style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, marginRight: 9,
                border: `2px solid ${sel ? c.select : c.radioOff}`, background: sel ? c.select : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {sel && <span style={{ width: 5, height: 5, borderRadius: '50%', background: dark ? '#121212' : '#fff' }} />}
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 1, textAlign: 'left' }}>
                <span style={{ ...ns, fontSize: 12.5, fontWeight: sel ? 700 : 500, color: c.name }}>{v.name}</span>
                <span style={{ ...ns, fontSize: 10.5, color: c.accent }}>{v.accent}</span>
              </div>
              {/* Preview */}
              <span onClick={e => preview(e, v.id)}
                className="cursor-pointer flex items-center justify-center flex-shrink-0"
                style={{ width: 22, height: 22, borderRadius: '50%',
                  border: `1.5px solid ${c.previewBorder}`,
                  background: prev ? c.previewPlayingBg : c.previewBg, transition: 'all 0.15s' }}>
                {prev
                  ? <svg width="7" height="7" viewBox="0 0 24 24" fill="white"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>
                  : <svg width="7" height="7" viewBox="0 0 24 24" fill={c.previewIcon} style={{ marginLeft: 1 }}><path d="M6 4l14 8-14 8z"/></svg>}
              </span>
            </button>
          );
        })}
      </div>

      {grid ? (
        // Cloned voice already appears as its own avatar tile above (it's in allVoices) — no
        // need to repeat it down here too. Only the "add a clone" empty state needs a spot,
        // styled as a card matching the tiles above rather than a plain text link.
        !cloneName && (
          <button onClick={onClone} className="vp-focus w-full flex items-center cursor-pointer"
            style={{ gap: 10, padding: '10px 12px', borderRadius: 12, marginTop: 12, transform: 'translateY(0)',
              border: '1.5px dashed rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.03)', outline: 'none',
              transition: 'background 0.15s, border-color 0.15s, transform 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = c.hoverBg; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.24)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
            <span style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ ...ns, fontSize: 17, fontWeight: 600, color: 'rgba(255,255,255,0.5)', lineHeight: 1 }}>+</span>
            </span>
            <span style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: c.muted }}>Clone your voice…</span>
          </button>
        )
      ) : (
        <>
          <div style={{ height: 1, background: c.divider, margin: '5px 0 4px' }} />
          {cloneName ? (
            <button onClick={() => onChange(CLONE_VOICE_ID)}
              className="w-full flex items-center cursor-pointer"
              style={{ padding: '7px 8px', borderRadius: 8, border: 'none', outline: 'none',
                background: value === CLONE_VOICE_ID ? c.selBg : 'transparent', transition: 'background 0.1s' }}
              onMouseEnter={e => { if (value !== CLONE_VOICE_ID) e.currentTarget.style.background = c.hoverBg; }}
              onMouseLeave={e => { e.currentTarget.style.background = value === CLONE_VOICE_ID ? c.selBg : 'transparent'; }}>
              <span style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: c.muted }}>✓ {cloneName}</span>
            </button>
          ) : (
            <button onClick={onClone} className="flex items-center cursor-pointer"
              style={{ gap: 5, padding: '7px 8px', borderRadius: 8, border: 'none', background: 'transparent', outline: 'none' }}
              onMouseEnter={e => { e.currentTarget.style.background = c.hoverBg; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              <span style={{ ...ns, fontSize: 13, color: c.muted, fontWeight: 700, lineHeight: 1 }}>+</span>
              <span style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: c.muted }}>Clone your voice…</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}

const btnGhost: React.CSSProperties    = { height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', ...ns, fontSize: 12, fontWeight: 600, color: '#52637A', cursor: 'pointer' };
const btnPrimary: React.CSSProperties  = { height: 30, padding: '0 14px', borderRadius: 8, border: 'none', background: '#006EFE', ...ns, fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' };

function ChangeSourceMenu({ current, onSwitch }: { current: SourceKind; onSwitch: (s: SourceKind) => void }) {
  const [open, setOpen] = useState(false);
  const { ref, style: placementStyle } = useMenuPlacement(open, { width: 150, height: 115, preferV: 'bottom', preferH: 'right' });
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref]);

  const labels: Record<SourceKind, string> = { ai: 'AI voice', record: 'Record', upload: 'Upload' };
  const all: SourceKind[] = ['record', 'ai', 'upload'];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} className="cursor-pointer"
        style={{ border: 'none', background: 'transparent', ...ns, fontSize: 11.5, fontWeight: 500, color: '#52637A', padding: 0, cursor: 'pointer' }}>
        Change type
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            style={{ ...placementStyle, zIndex: 50, background: '#fff',
              border: '1px solid #E8EBF2', borderRadius: 9, boxShadow: '0 8px 24px rgba(15,23,51,0.12)', padding: 5, width: 150 }}>
            {all.map(s => (
              <button key={s} onClick={() => { onSwitch(s); setOpen(false); }}
                className="w-full flex items-center cursor-pointer"
                style={{ gap: 8, padding: '7px 9px', borderRadius: 6, border: 'none',
                  background: s === current ? '#F4F6F9' : 'transparent', transition: 'background 0.1s' }}
                onMouseEnter={e => { if (s !== current) e.currentTarget.style.background = '#F4F6F9'; }}
                onMouseLeave={e => { e.currentTarget.style.background = s === current ? '#F4F6F9' : 'transparent'; }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: SOURCE_COLORS[s], flexShrink: 0 }} />
                <span style={{ ...ns, fontSize: 12, fontWeight: s === current ? 700 : 500, color: '#15191F' }}>{labels[s]}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AudioControls({ idx, audio, script, cloneName, onAudioChange, onClone, onStartRecord, onGenerateAll }: {
  idx: number; audio: SlideAudio; script: string; cloneName: string | null;
  onAudioChange: (patch: Partial<SlideAudio>) => void; onClone: () => void;
  onStartRecord: () => void; onGenerateAll: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const playTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (playTimer.current) clearTimeout(playTimer.current); }, []);

  const [changingVoice, setChangingVoice] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const est = estimateSecs(script);
  const ready = audio.status === 'ready';
  const stale = audio.status === 'stale';
  const sourceColor = '#006EFE';

  const generate = () => {
    onAudioChange({ status: 'generating' });
    setTimeout(() => onAudioChange({ status: 'ready', duration: est }), 1200 + Math.random() * 700);
  };
  const handleFile = async (file: File) => {
    setUploading(true);
    const duration = await readAudioDuration(file, est);
    setTimeout(() => {
      setUploading(false);
      onAudioChange({ status: 'ready', duration, fileName: file.name });
    }, 500 + Math.random() * 400);
  };
  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) handleFile(file);
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };
  const play = () => {
    if (playing) { clearTimeout(playTimer.current!); setPlaying(false); return; }
    setPlaying(true);
    playTimer.current = setTimeout(() => setPlaying(false), Math.min(audio.duration, 4) * 1000);
  };

  const switchSource = (s: SourceKind) => onAudioChange({ source: s, methodSet: true, status: 'empty', duration: 0, fileName: undefined, segStart: undefined, segEnd: undefined });

  const selectedVoice = AI_VOICES.find(v => v.id === audio.voiceId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {audio.source === 'ai' && audio.status === 'empty' && (
        <>
          <VoiceList value={audio.voiceId} cloneName={cloneName}
            onChange={id => onAudioChange({ voiceId: id })}
            onClone={onClone} />
          <button style={{ ...btnPrimary, height: 36, borderRadius: 10, fontSize: 13, marginTop: 2 }}
            onClick={() => (audio.scope === 'multi' ? onGenerateAll() : generate())}>
            {audio.scope === 'multi' ? 'Generate for this + remaining slides' : 'Generate audio'}
          </button>
        </>
      )}
      {audio.source === 'ai' && audio.status === 'generating' && (
        <div className="flex items-center" style={{ gap: 7, height: 36 }}>
          <span style={{ width: 13, height: 13, border: '2px solid #E0E8FF', borderTopColor: '#006EFE', borderRadius: '50%', display: 'inline-block', animation: 'v2spin 0.8s linear infinite' }} />
          <span style={{ ...ns, fontSize: 12, color: '#006EFE', fontWeight: 600 }}>Generating…</span>
        </div>
      )}
      {audio.source === 'ai' && stale && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="flex items-center justify-between">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ ...ns, fontSize: 15, fontWeight: 700, color: '#15191F' }}>{voiceName(audio.voiceId, cloneName)}</span>
              <span style={{ ...ns, fontSize: 12, color: '#8596AD' }}>{selectedVoice?.accent ?? 'Your voice'}</span>
            </div>
            <button onClick={() => setChangingVoice(v => !v)} className="cursor-pointer"
              style={{ border: 'none', background: 'transparent', ...ns, fontSize: 11.5, fontWeight: 500, color: '#006EFE', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
              {changingVoice ? 'Cancel' : 'Change voice'}
            </button>
          </div>
          {changingVoice && (
            <VoiceList value={audio.voiceId} cloneName={cloneName}
              onChange={id => { onAudioChange({ voiceId: id, status: 'stale' }); setChangingVoice(false); }}
              onClone={onClone} />
          )}
        </div>
      )}

      {audio.source === 'record' && audio.status === 'empty' && (
        <button onClick={onStartRecord} className="cursor-pointer flex items-center justify-center"
          style={{ width: '100%', height: 36, padding: '0 18px', borderRadius: 10, border: 'none', background: '#006EFE', ...ns, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
          Start recording
        </button>
      )}

      {audio.source === 'upload' && audio.status === 'empty' && (
        uploading ? (
          <div className="flex items-center" style={{ gap: 8, height: 34 }}>
            <span style={{ width: 13, height: 13, border: '2px solid #E0E8FF', borderTopColor: '#006EFE', borderRadius: '50%', display: 'inline-block', animation: 'v2spin 0.8s linear infinite' }} />
            <span style={{ ...ns, fontSize: 12, color: '#006EFE', fontWeight: 600 }}>Uploading…</span>
          </div>
        ) : (
          <div onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className="cursor-pointer flex items-center"
            style={{ gap: 7, height: 34, padding: '0 14px', borderRadius: 9,
              border: `1.5px dashed ${dragOver ? '#0FA47C' : '#C9D4E5'}`, background: dragOver ? '#EDFBF6' : '#FAFBFD',
              ...ns, fontSize: 12, fontWeight: 600, color: dragOver ? '#0B7C5E' : '#52637A', alignSelf: 'flex-start' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={dragOver ? '#0FA47C' : '#52637A'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M12 5l-5 5M12 5l5 5"/></svg>
            {dragOver ? 'Drop to upload' : 'Upload audio file or drag it here'}
            <input ref={fileInputRef} type="file" accept="audio/*" onChange={onFileInputChange} style={{ display: 'none' }} />
          </div>
        )
      )}

      {ready && (
        <>
          <div style={{ background: '#F4F6F9', borderRadius: 12, overflow: 'hidden' }}>
            {audio.source === 'ai' && (
              <>
                <div className="flex items-center justify-between" style={{ padding: '12px 14px 10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ ...ns, fontSize: 15, fontWeight: 700, color: '#15191F' }}>{voiceName(audio.voiceId, cloneName)}</span>
                    <span style={{ ...ns, fontSize: 12, color: '#8596AD' }}>{selectedVoice?.accent ?? 'Your voice'}</span>
                  </div>
                  <button onClick={() => setChangingVoice(v => !v)} className="cursor-pointer"
                    style={{ border: 'none', background: 'transparent', ...ns, fontSize: 11.5, fontWeight: 500, color: '#006EFE', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
                    {changingVoice ? 'Cancel' : 'Change voice'}
                  </button>
                </div>
                <div style={{ height: 1, background: '#E4E8EF', margin: '0 14px' }} />
              </>
            )}
            <div className="flex items-center" style={{ padding: '12px 14px', gap: 10 }}>
              <button onClick={play} className="cursor-pointer flex items-center justify-center flex-shrink-0"
                style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', outline: 'none', background: sourceColor }}>
                {playing
                  ? <svg width="9" height="9" viewBox="0 0 24 24" fill="white"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>
                  : <svg width="10" height="10" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 1 }}><path d="M6 4l14 8-14 8z"/></svg>}
              </button>
              <Waveform seed={idx + 1} color={sourceColor} width={120} playing={playing} />
              <span style={{ ...ns, fontSize: 11.5, color: '#52637A', fontWeight: 600, flexShrink: 0 }}>{formatTime(audio.duration)}</span>
              {audio.source === 'record' && (
                <button style={{ ...btnGhost, height: 24, padding: '0 8px', fontSize: 10.5, flexShrink: 0 }} onClick={onStartRecord}>Redo</button>
              )}
              {audio.source === 'upload' && (
                <button style={{ ...btnGhost, height: 24, padding: '0 8px', fontSize: 10.5, flexShrink: 0 }} onClick={() => fileInputRef.current?.click()}>Replace</button>
              )}
            </div>
          </div>
          {audio.source === 'ai' && changingVoice && (
            <VoiceList value={audio.voiceId} cloneName={cloneName}
              onChange={id => { onAudioChange({ voiceId: id, status: 'stale' }); setChangingVoice(false); }}
              onClone={onClone} />
          )}
          {audio.source === 'upload' && (
            <input ref={fileInputRef} type="file" accept="audio/*" onChange={onFileInputChange} style={{ display: 'none' }} />
          )}
        </>
      )}

      {stale && (
        <div className="flex items-center justify-between" style={{ gap: 8, background: '#FBF6EC', border: '1px solid #EDE1C3', borderRadius: 10, padding: '10px 12px' }}>
          <span style={{ ...ns, fontSize: 12, color: '#8A6A1F', fontWeight: 600 }}>Needs regenerating</span>
          {audio.source === 'ai' && <button onClick={generate} className="cursor-pointer" style={{ ...btnGhost, height: 28, padding: '0 12px', fontSize: 12, fontWeight: 700, color: '#15191F' }}>Regenerate</button>}
          {audio.source === 'record' && <button onClick={onStartRecord} className="cursor-pointer" style={{ ...btnGhost, height: 28, padding: '0 12px', fontSize: 12, fontWeight: 700, color: '#15191F' }}>Re-record</button>}
          {audio.source === 'upload' && <button onClick={() => onAudioChange({ status: 'ready' })} className="cursor-pointer" style={{ border: 'none', background: 'transparent', ...ns, fontSize: 12, fontWeight: 700, color: '#8A6A1F' }}>Keep</button>}
        </div>
      )}

      {audio.source === 'upload' && (ready || stale) && audio.fileName && (
        <span style={{ ...ns, fontSize: 10, color: '#B0BACB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {audio.segStart !== undefined ? `${audio.fileName} · ${formatTime(audio.segStart)}–${formatTime(audio.segEnd ?? 0)}` : audio.fileName}
        </span>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Review screen — real play/pause + scrubber across slides
   ════════════════════════════════════════════════════════════════ */
function ReviewScreen({ slides, theme, audios, onContinue, onBack, sidebarOpen, onToggleSidebar }: {
  slides: PresentationSlide[]; theme: MockTheme; audios: SlideAudio[];
  onContinue: () => void; onBack: () => void; sidebarOpen: boolean; onToggleSidebar: () => void;
}) {
  const slideDurations = useMemo(() => slides.map((_, i) => Math.max(1, audios[i]?.duration || 4)), [slides, audios]);
  const totalDuration = useMemo(() => slideDurations.reduce((a, b) => a + b, 0), [slideDurations]);
  const slideStarts = useMemo(() => slideDurations.reduce<number[]>((acc, d, i) => { acc.push(i === 0 ? 0 : acc[i - 1] + slideDurations[i - 1]); return acc; }, []), [slideDurations]);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playerHovered, setPlayerHovered] = useState(false);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) playerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };

  let activeSlide = 0;
  for (let i = 0; i < slideStarts.length; i++) if (slideStarts[i] <= currentTime) activeSlide = i;
  const clampedIdx = Math.max(0, Math.min(activeSlide, slides.length - 1));

  useEffect(() => {
    if (playing) {
      playRef.current = setInterval(() => {
        setCurrentTime(t => {
          if (t >= totalDuration - 1) { setPlaying(false); return totalDuration; }
          return t + 1;
        });
      }, 1000);
    } else {
      clearInterval(playRef.current!);
    }
    return () => clearInterval(playRef.current!);
  }, [playing, totalDuration]);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setCurrentTime(Math.round(ratio * totalDuration));
    setPlaying(false);
  };

  const slide = slides[clampedIdx];
  const slideBg = slide.bgImageUrl ? `url(${slide.bgImageUrl}) center/cover` : (slide.bgColor ?? theme.bg);
  // Backgrounds can be gradients, not just hex, so we can't reliably compute luminance from
  // slide.bgColor/theme.bg directly. The theme/slide author already solved this contrast
  // problem when picking titleColor — reuse that instead of re-deriving it from raw CSS.
  const bgIsDark = slide.bgImageUrl ? true : !isDarkBg(slide.textColorOverride ?? theme.titleColor);
  const progress = totalDuration > 0 ? currentTime / totalDuration : 0;

  return (
    <div className="h-full flex flex-col" style={{ background: '#121212' }}>
      {/* Same dark header tokens as ExportScreen's own header (rgba(255,255,255,0.08) border,
          0.06 back-button fill, invert filter on the sidebar icon) — Review sits directly
          between the dark studio and the dark export step, so a light header here was the odd
          one out in the flow, not a deliberate resting point. */}
      <div className="flex-shrink-0 flex items-center justify-between"
        style={{ height: 54, padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center" style={{ gap: 4 }}>
          <button onClick={onToggleSidebar}
            className="flex-shrink-0 rounded-lg cursor-pointer flex items-center justify-center"
            style={{ width: 40, height: 40, filter: 'invert(1) grayscale(1) brightness(1.7)' }}>
            <SideMenuIcon active={sidebarOpen} />
          </button>
          <button onClick={onBack} className="flex items-center cursor-pointer"
            style={{ gap: 6, height: 34, padding: '0 14px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.22)', background: 'transparent', ...ns, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Studio
          </button>
        </div>
        <span style={{ ...ns, fontSize: 14, fontWeight: 700, color: '#fff' }}>Preview</span>
        <button onClick={onContinue}
          style={{ height: 36, padding: '0 18px', borderRadius: 9, border: 'none', background: '#006EFE', ...ns, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
          Export
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center min-h-0" style={{ padding: '40px 60px' }}>
        <div ref={playerRef} style={{ width: '100%', maxWidth: 860, position: 'relative', borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 40px rgba(15,23,51,0.14)', aspectRatio: '16/9', background: slideBg }}
          onMouseEnter={() => setPlayerHovered(true)}
          onMouseLeave={() => setPlayerHovered(false)}
          onMouseMove={() => setPlayerHovered(true)}>
          <div style={{ position: 'absolute', inset: 0, padding: '7% 8%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {slide.title && (
              <h2 style={{ ...ns, fontSize: 'clamp(16px,2.8vw,28px)', fontWeight: 700, color: slide.textColorOverride ?? theme.titleColor, margin: 0, lineHeight: 1.2 }}>
                {slide.title}
              </h2>
            )}
            {slide.points.length > 0 && (
              <div style={{ marginTop: '4%', display: 'flex', flexDirection: 'column', gap: '2.5%' }}>
                {slide.points.map((pt, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: theme.accentColor, marginTop: 7, flexShrink: 0 }} />
                    <p style={{ ...ns, fontSize: 'clamp(11px,1.5vw,17px)', color: slide.textColorOverride ?? theme.titleColor, opacity: 0.82, margin: 0, lineHeight: 1.5 }}>{pt}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
            background: bgIsDark
              ? 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.18) 22%, transparent 38%)'
              : 'linear-gradient(to top, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.3) 22%, transparent 38%)',
            opacity: !playing || playerHovered ? 1 : 0, transition: 'opacity 0.25s', pointerEvents: !playing || playerHovered ? 'auto' : 'none' }}>
            <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div onClick={seek} style={{ width: '100%', height: 3, borderRadius: 2, background: bgIsDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)', cursor: 'pointer', position: 'relative' }}>
                {slideStarts.slice(1).map((s, i) => (
                  <div key={i} style={{ position: 'absolute', left: `${(s / totalDuration) * 100}%`, top: -1, width: 1, height: 5, background: bgIsDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.25)', transform: 'translateX(-50%)' }} />
                ))}
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${progress * 100}%`, background: bgIsDark ? '#fff' : '#15191F', borderRadius: 2, transition: 'width 0.5s linear' }} />
                <div style={{ position: 'absolute', top: '50%', left: `${progress * 100}%`, transform: 'translate(-50%, -50%)', width: 11, height: 11, borderRadius: '50%', background: bgIsDark ? '#fff' : '#15191F', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.5s linear' }} />
              </div>
              <div className="flex items-center" style={{ gap: 10 }}>
                <button onClick={() => { if (currentTime >= totalDuration) setCurrentTime(0); setPlaying(v => !v); }}
                  style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', outline: 'none', background: bgIsDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {playing
                    ? <svg width="9" height="9" viewBox="0 0 24 24" fill={bgIsDark ? 'white' : '#15191F'}><rect x="5" y="4" width="4" height="16" rx="1.5"/><rect x="15" y="4" width="4" height="16" rx="1.5"/></svg>
                    : <svg width="9" height="9" viewBox="0 0 24 24" fill={bgIsDark ? 'white' : '#15191F'}><path d="M6 4l14 8-14 8V4z"/></svg>}
                </button>
                <span style={{ ...ns, fontSize: 11, color: bgIsDark ? 'rgba(255,255,255,0.85)' : '#52637A', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {formatTime(currentTime)} / {formatTime(totalDuration)}
                </span>
                <div style={{ flex: 1 }} />
                <button onClick={toggleFullscreen}
                  style={{ width: 28, height: 28, borderRadius: 6, border: 'none', outline: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={bgIsDark ? 'rgba(255,255,255,0.8)' : '#8596AD'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Export screen
   ════════════════════════════════════════════════════════════════ */
function ExportScreen({ slides, theme, totalSecs, onBack, sidebarOpen, onToggleSidebar }: {
  slides: PresentationSlide[]; theme: MockTheme; totalSecs: number; onBack: () => void; sidebarOpen: boolean; onToggleSidebar: () => void;
}) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setProgress(p => Math.min(100, p + 4 + Math.random() * 6)), 120);
    return () => clearInterval(iv);
  }, []);
  const done = progress >= 100;

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  useEffect(() => {
    if (done) showToast('Video ready — rendering complete');
  }, [done, showToast]);

  const [title, setTitle] = useState(slides[0]?.title || 'Untitled presentation');
  const [description, setDescription] = useState('');
  const [saveToProjects, setSaveToProjects] = useState(true);

  type ExportFormat = 'mp4' | 'html5';
  const EXPORT_FORMATS: { id: ExportFormat; label: string; sub: string }[] = [
    { id: 'mp4', label: 'MP4', sub: 'Video file' },
    { id: 'html5', label: 'HTML5', sub: 'Embeddable web player' },
  ];
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('mp4');
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const { ref: formatMenuRef, style: formatMenuStyle } = useMenuPlacement(formatMenuOpen, { width: 230, height: 110, preferV: 'bottom', preferH: 'right' });

  useEffect(() => {
    if (!formatMenuOpen) return;
    const h = (e: MouseEvent) => { if (formatMenuRef.current && !formatMenuRef.current.contains(e.target as Node)) setFormatMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [formatMenuOpen, formatMenuRef]);

  const handleDownload = (fmt: ExportFormat) => {
    setSelectedFormat(fmt);
    setFormatMenuOpen(false);
    setDownloaded(false);
    setDownloading(true);
    setTimeout(() => { setDownloading(false); setDownloaded(true); }, 1400);
  };

  if (!done) {
    return (
      <div className="h-full flex flex-col items-center justify-center" style={{ background: '#121212', gap: 24, padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 560 }}>
          <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
            <SlideThumb slide={slides[0]} theme={theme} width={560} />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(18,18,18,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 36, height: 36, border: '3.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'v2spin 0.8s linear infinite' }} />
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center" style={{ gap: 10, width: 320 }}>
          <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#006EFE', borderRadius: 3, transition: 'width 0.12s' }} />
          </div>
          <p style={{ ...ns, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Rendering narrated video… mixing {slides.length} audio tracks</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: '#121212' }}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between" style={{ height: 54, padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center" style={{ gap: 4 }}>
          <button onClick={onToggleSidebar}
            className="flex-shrink-0 rounded-lg cursor-pointer flex items-center justify-center"
            style={{ width: 40, height: 40, filter: 'invert(1) grayscale(1) brightness(1.7)' }}>
            <SideMenuIcon active={sidebarOpen} />
          </button>
          <button onClick={onBack} className="flex items-center cursor-pointer"
            style={{ gap: 6, height: 34, padding: '0 14px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.22)', background: 'transparent', ...ns, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Studio
          </button>
        </div>
        <div ref={formatMenuRef} style={{ position: 'relative' }}>
          <button onClick={() => !downloading && setFormatMenuOpen(v => !v)} disabled={downloading}
            style={{ height: 36, padding: '0 16px', borderRadius: 9, border: 'none',
              background: downloaded ? '#0FA47C' : downloading ? '#0058CC' : '#006EFE', ...ns, fontSize: 13, fontWeight: 600, color: '#fff',
              display: 'flex', alignItems: 'center', gap: 6, cursor: downloading ? 'default' : 'pointer' }}>
            {downloaded
              ? `Downloaded · ${EXPORT_FORMATS.find(f => f.id === selectedFormat)?.label}`
              : downloading
                ? 'Preparing…'
                : <>Download <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg></>}
          </button>
          {formatMenuOpen && (
            <div style={{ ...formatMenuStyle, background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 200, zIndex: 50, overflow: 'hidden' }}>
              {EXPORT_FORMATS.map((fmt, i) => (
                <button key={fmt.id} onClick={() => handleDownload(fmt.id)}
                  style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '10px 14px',
                    background: 'transparent', border: 'none', borderBottom: i < EXPORT_FORMATS.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  <span style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#fff' }}>{fmt.label}</span>
                  <span style={{ ...ns, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{fmt.sub}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div style={{ display: 'flex', padding: '40px 48px', gap: 48, maxWidth: 1100, margin: '0 auto' }}>
          {/* Left col */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ ...ns, fontSize: 26, fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: 24 }}>
              {title || 'Untitled presentation'}
            </h1>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 28 }} />

            <div style={{ marginBottom: 20 }}>
              <label style={{ ...ns, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                style={{ ...ns, fontSize: 14, color: '#fff', width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => { e.target.style.borderColor = '#006EFE'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.14)'; }} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ ...ns, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>Description</label>
              <div style={{ position: 'relative' }}>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Enter a description…"
                  style={{ ...ns, fontSize: 14, color: '#fff', width: '100%', minHeight: 120, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)', resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box' }}
                  onFocus={e => { e.target.style.borderColor = '#006EFE'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.14)'; }} />
                <button style={{ position: 'absolute', bottom: 12, right: 12, gap: 4, ...ns, fontSize: 12, fontWeight: 600, background: 'linear-gradient(235deg, #4C9BFF, #A78BFA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  Write with AI
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <defs><linearGradient id="v2ExportAiGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#4C9BFF"/><stop offset="100%" stopColor="#A78BFA"/></linearGradient></defs>
                    <path d="M12 3L13.5 9L19 12L13.5 15L12 21L10.5 15L5 12L10.5 9Z" fill="url(#v2ExportAiGrad)"/>
                  </svg>
                </button>
              </div>
            </div>

            <label className="flex items-center cursor-pointer" style={{ gap: 10 }}>
              <div onClick={() => setSaveToProjects(v => !v)}
                style={{ width: 16, height: 16, borderRadius: 3, border: saveToProjects ? 'none' : '1.5px solid rgba(255,255,255,0.25)', background: saveToProjects ? '#006EFE' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                {saveToProjects && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6.5l2.8 2.5 5-5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <span style={{ ...ns, fontSize: 14, color: '#fff' }}>Save to My Projects</span>
            </label>

            {downloaded && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                style={{ marginTop: 24, padding: '14px 16px', borderRadius: 10, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 12.5l5 5L20 7" stroke="#4ADE80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <div>
                  <p style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', margin: 0 }}>Export complete</p>
                  <p style={{ ...ns, fontSize: 12, color: '#6EE7B7', margin: 0 }}>{saveToProjects ? 'Saved to your projects and downloaded.' : 'File downloaded.'}</p>
                </div>
              </motion.div>
            )}
          </div>

          {/* Right col: cover preview */}
          <div style={{ width: 320, flexShrink: 0 }}>
            <p style={{ ...ns, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>Preview</p>
            <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
              <SlideThumb slide={slides[0]} theme={theme} width={320} />
            </div>
            <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M8 12h8M8 9h5"/></svg>
                <span style={{ ...ns, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{slides.length} slides</span>
              </div>
              <div className="flex items-center" style={{ gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
                <span style={{ ...ns, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{selectedFormat === 'html5' ? 'HTML5' : 'MP4'} · {formatTime(totalSecs)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          // Horizontal centering lives on this static wrapper — Framer Motion owns the `transform`
          // CSS property outright on any element it animates x/y on, so a manual translateX(-50%)
          // on the same motion.div gets silently overwritten the moment the slide-in animation runs.
          // absolute (not fixed) so centering resolves against the studio's own content area — the
          // page's relatively-positioned wrapper (src/app/presentation/narration/page.tsx) already
          // excludes the app sidebar's width, so this stays centered on what's actually visible
          // whether or not the sidebar happens to be open.
          <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 60 }}>
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              style={{ display: 'flex', alignItems: 'center', gap: 8,
                background: '#121212', color: '#fff', borderRadius: 10, padding: '10px 18px',
                ...ns, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(15,23,51,0.28)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 12.5l5 5L20 7" stroke="#4ADE80" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {toast}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Narration studio — new components
   ════════════════════════════════════════════════════════════════ */

/* Filmstrip item — shows slide thumbnail + audio status dot */
function FilmstripItem({ slide, theme, audio, script, idx, isActive, onClick }: {
  slide: PresentationSlide; theme: MockTheme; audio: SlideAudio; script: string;
  idx: number; isActive: boolean; onClick: () => void;
}) {
  const noTranscript = !script.trim();
  const hasTake = audio.status === 'ready' || audio.status === 'stale';
  const isStale = audio.status === 'stale';
  const isGenerating = audio.status === 'generating';

  const thumbWidth = 148;

  return (
    <button onClick={onClick} className="group" style={{ width: '100%', background: 'transparent', border: 'none', padding: '5px 10px', cursor: 'pointer' }}>
      <div style={{ position: 'relative', width: thumbWidth }}>
        <div className={isActive ? '' : 'transition-shadow'}
          style={{ borderRadius: isActive ? 0 : 9, overflow: 'hidden',
            boxShadow: isActive ? '0 0 0 2.5px #006EFE, 0 0 0 5.5px rgba(0,110,254,0.16)' : '0 0 0 0 transparent' }}
          onMouseEnter={e => { if (!isActive) e.currentTarget.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.35)'; }}
          onMouseLeave={e => { if (!isActive) e.currentTarget.style.boxShadow = '0 0 0 0 transparent'; }}>
          <SlideThumb slide={slide} theme={theme} width={thumbWidth} rounded={!isActive} />
        </div>
        {audio.methodSet && audio.source === 'record' && audio.captureMode === 'video' && (
          <div style={{ position: 'absolute', bottom: 4, left: 4, width: 16, height: 16, borderRadius: 5,
            background: 'rgba(18,18,18,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
            </svg>
          </div>
        )}
        {hasTake && audio.duration > 0 && (
          <div style={{ position: 'absolute', bottom: 4, right: 4, padding: '1px 5px', borderRadius: 4,
            background: 'rgba(18,18,18,0.75)', ...ns, fontSize: 8.5, fontWeight: 700, color: '#fff' }}>
            {formatTime(audio.duration)}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between" style={{ margin: '5px 0 0' }}>
        <span style={{ ...ns, fontSize: 10.5, fontWeight: isActive ? 700 : 500,
          color: isActive ? '#006EFE' : '#8596AD' }}>
          {idx + 1}
        </span>
        {/* Status sits opposite the slide number, same row — a real label instead of a small
            corner dot on the image, so "no audio" reads as clearly as "recorded" does, not just
            whichever one you happen to notice. */}
        <div className="flex items-center" style={{ gap: 4 }}>
          {isGenerating ? (
            <span style={{ width: 7, height: 7, borderRadius: '50%', border: '1.5px solid #E0E8FF', borderTopColor: '#006EFE', animation: 'v2spin 0.8s linear infinite', flexShrink: 0 }} />
          ) : (
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: hasTake ? (isStale ? '#F4B740' : '#006EFE') : '#fff',
              border: hasTake ? 'none' : '1.5px dashed #B8C2D6' }} />
          )}
          <span style={{ ...ns, fontSize: 9.5, fontWeight: 700,
            // Orange is reserved for things that actively need attention (a stale take, a missing
            // script) — "no audio yet" is just an unstarted default, not a warning, so it gets a
            // plain darker neutral instead: still bolder than "Has audio" so it stands out, but not
            // color-coded as an error. A completed take just uses the same blue as every other
            // "done/active" indicator in this studio (active slide ring, nav count) — which
            // method it was matters, but that's what the label text says, not a color to decode.
            color: isGenerating ? '#006EFE' : noTranscript ? '#D68A1B' : hasTake ? (isStale ? '#D68A1B' : '#006EFE') : '#52637A' }}>
            {isGenerating ? 'Generating…' : noTranscript ? 'No script' : hasTake ? (isStale ? 'Needs refresh' : SOURCE_LABELS[audio.source]) : 'No audio'}
          </span>
        </div>
      </div>
    </button>
  );
}

/* Collapsed filmstrip — shown instead of the full strip while studio mode owns the
   center stage. Just enough to see where you are and jump slides; expand for the full view. */
function FilmstripRail({ slides, theme, audios, activeIdx, onSelect, onExpand }: {
  slides: PresentationSlide[]; theme: MockTheme; audios: SlideAudio[]; activeIdx: number; onSelect: (i: number) => void; onExpand: () => void;
}) {
  return (
    <div style={{ width: 44, flexShrink: 0, background: '#121212', borderRight: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 9, overflowY: 'auto' }}>
      <button onClick={onExpand} title="Show all slides" className="cursor-pointer flex items-center justify-center flex-shrink-0"
        style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)', marginBottom: 5, transition: 'background 0.12s' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      {slides.map((s, i) => {
        const audio = audios[i];
        // Plain light-gray rectangles, not abstract numbered dots and not real content either —
        // real slide text is illegible at this scale and just reads as a smudge. A colored ring
        // signals status: blue = active or has a take, amber = stale. Which method the take came
        // from isn't shown here (it's a 30px rail); the tooltip and the expanded filmstrip's own
        // label cover that.
        const filled = audio.methodSet && (audio.status === 'ready' || audio.status === 'generating' || audio.status === 'stale');
        const fillColor = audio.status === 'stale' ? '#F4B740' : '#006EFE';
        const isActive = i === activeIdx;
        const ringColor = isActive ? '#006EFE' : filled ? fillColor : null;
        const title = `Slide ${i + 1}${s.title ? `: ${s.title}` : ''} — ${filled ? (audio.status === 'stale' ? 'needs refresh' : SOURCE_LABELS[audio.source].toLowerCase()) : 'no audio yet'}`;
        return (
          <button key={s.id} onClick={() => onSelect(i)} title={title}
            className="cursor-pointer flex-shrink-0" style={{ padding: 0, border: 'none', background: 'transparent' }}>
            {/* Solid fill = has audio (or generating). Dashed, unfilled = nothing recorded yet —
                same filled-vs-hollow language as the expanded filmstrip's corner badge, so the
                gap is visible even collapsed down to a 30px rail during an active recording. */}
            <div className="transition-shadow" style={{ width: 30, height: 16.9, borderRadius: 4,
              background: filled ? 'rgba(216,220,227,0.7)' : 'transparent',
              border: filled ? '1.5px solid transparent' : '1.5px dashed rgba(255,255,255,0.3)',
              boxShadow: ringColor ? `0 0 0 2px ${ringColor}` : '0 0 0 0 transparent' }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.boxShadow = `0 0 0 1.5px ${filled ? fillColor : 'rgba(255,255,255,0.5)'}`; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = ringColor ? `0 0 0 2px ${ringColor}` : '0 0 0 0 transparent'; }} />
            <div style={{ ...ns, fontSize: 8.5, fontWeight: 700, marginTop: 3, color: isActive ? '#006EFE' : 'rgba(255,255,255,0.4)' }}>
              {i + 1}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CameraLayoutIcon({ id, active }: { id: CameraLayout; active: boolean }) {
  const stroke = active ? '#fff' : 'rgba(255,255,255,0.5)';
  if (id === 'bubble') {
    return (
      <svg width="18" height="14" viewBox="0 0 24 18" fill="none">
        <rect x="0.5" y="0.5" width="23" height="17" rx="3" stroke={stroke} strokeWidth="1.4"/>
        <circle cx="18" cy="13" r="4" stroke={stroke} strokeWidth="1.4" fill="none"/>
      </svg>
    );
  }
  return (
    <svg width="18" height="14" viewBox="0 0 24 18" fill="none">
      <rect x="0.5" y="0.5" width="14" height="17" rx="2.5" stroke={stroke} strokeWidth="1.4"/>
      <rect x="16.5" y="0.5" width="7" height="17" rx="2.5" stroke={stroke} strokeWidth="1.4"/>
    </svg>
  );
}

/* Layout picker — visual thumbnail cards (mini renders of the actual slide+camera composition)
   instead of a text/icon radio list, the way Pitch's own "Layouts" popover does it. For a choice
   that's fundamentally about where the camera sits on screen, a small render says it faster than
   a label does. */
function LayoutPicker({ value, onChange, disabled }: { value: CameraLayout; onChange: (v: CameraLayout) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const { ref, style: menuStyle } = useMenuPlacement(open, { width: 190, height: 100, preferV: 'top', preferH: 'left' });
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref]);

  return (
    <div ref={ref} style={{ position: 'relative', opacity: disabled ? 0.4 : 1 }}>
      <button onClick={() => !disabled && setOpen(o => !o)} className={disabled ? 'flex items-center' : 'flex items-center cursor-pointer'}
        style={{ height: 34, padding: '0 13px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', gap: 7,
          background: open ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
          ...ns, fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
        <CameraLayoutIcon id={value} active />
        {value === 'bubble' ? 'Bubble' : 'Side-by-side'}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            style={{ ...menuStyle, zIndex: 50,
              background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14,
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)', padding: 10, display: 'flex', gap: 8 }}>
            {(['bubble', 'sideBySide'] as const).map(id => (
              <button key={id} onClick={() => { onChange(id); setOpen(false); }}
                className="cursor-pointer flex flex-col items-center"
                style={{ gap: 7, padding: 8, borderRadius: 10, border: `1.5px solid ${value === id ? '#006EFE' : 'transparent'}`,
                  background: value === id ? 'rgba(0,110,254,0.1)' : 'rgba(255,255,255,0.04)' }}>
                <LayoutThumbnail id={id} />
                <span style={{ ...ns, fontSize: 11, fontWeight: value === id ? 700 : 600, color: value === id ? '#fff' : 'rgba(255,255,255,0.6)' }}>
                  {id === 'bubble' ? 'Bubble' : 'Side-by-side'}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LayoutThumbnail({ id }: { id: CameraLayout }) {
  if (id === 'bubble') {
    return (
      <div style={{ width: 76, height: 46, borderRadius: 6, background: '#fff', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ position: 'absolute', right: 4, bottom: 4, width: 18, height: 18, borderRadius: '50%', background: '#121212' }} />
      </div>
    );
  }
  return (
    <div style={{ width: 76, height: 46, borderRadius: 6, overflow: 'hidden', display: 'flex', gap: 2, flexShrink: 0 }}>
      <div style={{ flex: 1, background: '#fff' }} />
      <div style={{ width: 22, background: '#121212' }} />
    </div>
  );
}

/* Device picker — the chevron zone of a split-button pill (see call sites: icon zone + divider
   + this chevron, one shared rounded container), matching the Layout picker's own pill language
   instead of a tiny corner badge that read as decoration rather than a separate clickable
   control. Real device enumeration (not mocked): asks the browser for whatever mics/cameras it
   can actually see. */
function DeviceMenu({ kind, value, onChange, disabled, rounded, openRight }: {
  kind: 'audioinput' | 'videoinput'; value: string | null; onChange: (id: string) => void; disabled?: boolean;
  // Which corners to round on the trigger — this sits flush against the toggle button inside a
  // shared pill (see call sites), so only the outer edge (the pill's right side) should curve.
  rounded?: 'right';
  // Anchored right (growing left) by default; pass true to anchor left (growing right) instead.
  // Decided by the parent from the mic control's own position (the leftmost of the two, so the
  // more conservative measurement) and passed to both mic and camera menus together — computing
  // this independently per-control let the two flip differently from each other when they sit
  // close together, which read as broken/inconsistent rather than intentional.
  openRight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => {
    if (!open) return;
    navigator.mediaDevices?.enumerateDevices()
      .then(all => setDevices(all.filter(d => d.kind === kind)))
      .catch(() => setDevices([]));
  }, [open, kind]);

  return (
    <div ref={ref} style={{ position: 'relative', height: '100%' }}>
      <button onClick={() => !disabled && setOpen(o => !o)}
        title={kind === 'audioinput' ? 'Choose microphone' : 'Choose camera'}
        className={disabled ? 'flex items-center justify-center' : 'cursor-pointer flex items-center justify-center'}
        style={{ width: 22, height: '100%', border: 'none', background: open ? 'rgba(255,255,255,0.12)' : 'transparent', transition: 'background 0.12s',
          borderTopRightRadius: rounded === 'right' ? 9 : 0, borderBottomRightRadius: rounded === 'right' ? 9 : 0 }}
        onMouseEnter={e => { if (!open && !disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            style={{ position: 'absolute', bottom: 'calc(100% + 10px)', ...(openRight ? { left: -6 } : { right: -6 }), zIndex: 50,
              background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12,
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)', padding: 6, minWidth: 220, maxWidth: 280 }}>
            {devices.length === 0 ? (
              <div style={{ padding: '8px 9px', ...ns, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                No {kind === 'audioinput' ? 'microphones' : 'cameras'} found
              </div>
            ) : devices.map((d, i) => {
              const id = d.deviceId || `${kind}-${i}`;
              const selected = value ? value === id : i === 0;
              return (
                <button key={id} onClick={() => { onChange(id); setOpen(false); }}
                  className="w-full flex items-center cursor-pointer"
                  style={{ gap: 9, padding: '8px 9px', borderRadius: 8, border: 'none',
                    background: selected ? 'rgba(0,110,254,0.16)' : 'transparent', transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = selected ? 'rgba(0,110,254,0.16)' : 'transparent'; }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${selected ? '#006EFE' : 'rgba(255,255,255,0.3)'}`,
                    background: selected ? '#006EFE' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {selected && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />}
                  </span>
                  <span style={{ ...ns, fontSize: 12.5, fontWeight: selected ? 700 : 500, color: '#fff',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.label || `${kind === 'audioinput' ? 'Microphone' : 'Camera'} ${i + 1}`}
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* Display options — countdown/next-slide-preview are both independent, occasional on/off
   preferences (set once, not per-slide), so they share one popover instead of two more icons
   competing for space in the row. Transcript used to live here too but got pulled back out to
   its own single-click icon — it's reached for far more often than these two. */
function DisplayOptionsMenu({ countdownEnabled, onCountdownChange, nextPreviewEnabled, onNextPreviewChange, disabled }: {
  countdownEnabled: boolean; onCountdownChange: (v: boolean) => void;
  nextPreviewEnabled: boolean; onNextPreviewChange: (v: boolean) => void;
  // Stays mounted once recording starts (rather than unmounting) so the row's width — and with
  // it, the record button's position — doesn't shift between idle and recording. Disabled rather
  // than hidden: these are locked-in-for-this-take settings, same story as camera/layout below.
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { ref, style: menuStyle } = useMenuPlacement(open, { width: 195, height: 90, preferV: 'top', preferH: 'left' });
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref]);

  const rows = [
    { label: 'Countdown', checked: countdownEnabled, onChange: () => onCountdownChange(!countdownEnabled) },
    { label: 'Next slide preview', checked: nextPreviewEnabled, onChange: () => onNextPreviewChange(!nextPreviewEnabled) },
  ];

  return (
    <div ref={ref} style={{ position: 'relative', opacity: disabled ? 0.4 : 1 }}>
      <button onClick={() => !disabled && setOpen(o => !o)} title="Display options"
        className={disabled ? 'flex items-center justify-center' : 'cursor-pointer flex items-center justify-center'}
        style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, transition: 'background 0.12s', background: 'transparent' }}
        onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
        <DisplayOptionsIcon color={open ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.6)'} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            style={{ ...menuStyle, zIndex: 50,
              background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12,
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)', padding: 6, minWidth: 195 }}>
            {rows.map(r => (
              <button key={r.label} onClick={r.onChange} className="w-full flex items-center cursor-pointer"
                style={{ gap: 9, padding: '8px 9px', borderRadius: 8, border: 'none', background: 'transparent', transition: 'background 0.1s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <span style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  border: `1.5px solid ${r.checked ? '#006EFE' : 'rgba(255,255,255,0.3)'}`,
                  background: r.checked ? '#006EFE' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {r.checked && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  )}
                </span>
                <span style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: '#fff' }}>{r.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DisplayOptionsIcon({ color = '#fff' }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2" fill={color} stroke="none"/>
      <line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2" fill={color} stroke="none"/>
      <line x1="4" y1="17" x2="20" y2="17"/><circle cx="11" cy="17" r="2" fill={color} stroke="none"/>
    </svg>
  );
}

/* Voice tuning slider — ElevenLabs-style range control for the AI voice panel. Cosmetic in this
   concept (no real TTS backend to actually shape), consistent with the rest of the mock pipeline. */
function TuningSlider({ label, value, onChange, leftLabel, rightLabel, steps = 5 }: {
  label: string; value: number; onChange: (v: number) => void; leftLabel: string; rightLabel: string; steps?: number;
}) {
  const stepGap = 100 / (steps - 1);
  const stepValues = Array.from({ length: steps }, (_, i) => Math.round(i * stepGap));
  const activeIndex = stepValues.reduce((best, sv, i) => Math.abs(sv - value) < Math.abs(stepValues[best] - value) ? i : best, 0);
  const fillFrac = activeIndex / (steps - 1);
  const dotSize = 20;

  return (
    <div>
      <div style={{ ...ns, fontSize: 10.5, fontWeight: 800, color: '#7FB2FF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>{label}</div>
      <div style={{ position: 'relative', height: dotSize }}>
        <div style={{ position: 'absolute', left: dotSize / 2, right: dotSize / 2, top: '50%', height: 2,
          background: 'rgba(255,255,255,0.12)', borderRadius: 999, transform: 'translateY(-50%)' }} />
        <div style={{ position: 'absolute', left: dotSize / 2, top: '50%', height: 2, background: '#006EFE', borderRadius: 999,
          transform: 'translateY(-50%)', width: `calc((100% - ${dotSize}px) * ${fillFrac})`, transition: 'width 0.1s' }} />
        <div className="flex items-center justify-between" style={{ position: 'relative' }}>
          {stepValues.map((sv, i) => {
            const active = i === activeIndex;
            return (
              <span key={sv} className="flex items-center justify-center" style={{ width: dotSize, height: dotSize, pointerEvents: 'none' }}>
                <span style={{ width: active ? 11 : 7, height: active ? 11 : 7, borderRadius: '50%',
                  background: active ? '#006EFE' : 'rgba(255,255,255,0.28)',
                  border: active ? '2px solid #fff' : 'none',
                  boxShadow: active ? '0 0 0 3px rgba(0,110,254,0.25)' : 'none',
                  transition: 'all 0.1s' }} />
              </span>
            );
          })}
        </div>
        {/* Native range handles drag + click-anywhere + keyboard; the dots above are pure
            visualization. Snaps to the same step values via `step`, so it never lands between dots. */}
        <input type="range" min={0} max={100} step={stepGap} value={value} onChange={e => onChange(Number(e.target.value))}
          className="cursor-pointer" style={{ position: 'absolute', inset: 0, width: '100%', height: dotSize, margin: 0,
            opacity: 0, WebkitAppearance: 'none', appearance: 'none' }} />
      </div>
      <div className="flex items-center justify-between" style={{ marginTop: 9, padding: `0 ${dotSize / 2}px` }}>
        <span style={{ ...ns, fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{leftLabel}</span>
        <span style={{ ...ns, fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{rightLabel}</span>
      </div>
    </div>
  );
}

// Rect-with-lines matches the transcript toggle's glyph (same "this is text" shorthand), plus
// a descending chevron for the one thing that's actually different: it scrolls.
function TeleprompterIcon({ color = '#fff' }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="13" rx="2"/>
      <line x1="8" y1="7.5" x2="16" y2="7.5"/>
      <line x1="8" y1="11.5" x2="13" y2="11.5"/>
      <path d="M9 21l3-3 3 3"/>
    </svg>
  );
}

// Window-frame with a filled slice on the side it docks to — the standard OS "snap left/right"
// glyph, so which button is which reads at a glance instead of needing the tooltip.
function DockSideIcon({ side, color = '#fff' }: { side: 'left' | 'right'; color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2"/>
      <rect x={side === 'left' ? 3 : 13} y="4" width="8" height="16" fill={color} opacity="0.4" stroke="none"/>
    </svg>
  );
}

// The 3-way position picker — a dropdown rather than a segmented row of icons, matching the
// other menus in this studio (Generate script, Display options). Trigger shows the *current*
// mode's own icon (not a generic one) so the state reads at a glance even closed, same as the
// Layout picker button does for camera layout. Reused in both the docked panel's header and the
// floating teleprompter box's, so every surface offers all three destinations from one click.
function ScriptModeMenu({ mode, onChange, hideTeleprompter = false }: {
  mode: 'left' | 'right' | 'teleprompter'; onChange: (m: 'left' | 'right' | 'teleprompter') => void;
  // AI voice has no live take for a floating teleprompter to ride along with — see the
  // entryMode effect that steers scriptMode back to 'left' if this flips true while it's active.
  hideTeleprompter?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const allOptions: { id: 'left' | 'right' | 'teleprompter'; label: string; icon: (c: string) => React.ReactNode }[] = [
    { id: 'left', label: 'Dock left', icon: c => <DockSideIcon side="left" color={c} /> },
    { id: 'right', label: 'Dock right', icon: c => <DockSideIcon side="right" color={c} /> },
    { id: 'teleprompter', label: 'Teleprompter', icon: c => <TeleprompterIcon color={c} /> },
  ];
  const options = hideTeleprompter ? allOptions.filter(o => o.id !== 'teleprompter') : allOptions;
  const menuWidth = 168;
  const menuHeight = options.length * 35 + 11;
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Fixed viewport coordinates from the trigger's measured rect, portal-rendered to
  // document.body — same fix as StudioTooltip above, and for the same reason: both usages of
  // this menu (docked panel header, floating teleprompter header) sit inside a card whose
  // overflow:hidden is load-bearing for its own rounded corners, so a plain absolutely-
  // positioned child (the old approach) always ended up clipped by it regardless of how many
  // ancestors in between got flipped to overflow:visible — that only ever chased the clipping
  // one level further out instead of actually escaping it, which is why "Dock left" still read
  // as "…ock left" and the Teleprompter row still fell off the bottom edge.
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number } | null>(null);
  const openMenu = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const v = rect.bottom + menuHeight + EDGE_MARGIN > window.innerHeight ? 'top' : 'bottom';
    const h = rect.right - menuWidth < 0 ? 'left' : 'right';
    setMenuPos({
      ...(v === 'top' ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
      ...(h === 'left' ? { left: rect.left } : { right: window.innerWidth - rect.right }),
    });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const current = options.find(o => o.id === mode) ?? options[0];

  return (
    <div ref={triggerRef} style={{ position: 'relative' }}>
      <StudioTooltip label="Script position">
        <button onClick={() => (open ? setOpen(false) : openMenu())} onPointerDown={e => e.stopPropagation()} aria-label="Script position" aria-haspopup="menu" aria-expanded={open}
          className="sp-focus cursor-pointer flex items-center justify-center" style={{ gap: 3, height: 22, padding: '0 5px', borderRadius: 6,
            border: 'none', outline: 'none', background: open ? 'rgba(255,255,255,0.14)' : 'transparent' }}>
          {current.icon('rgba(255,255,255,0.6)')}
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
      </StudioTooltip>
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && menuPos && (
            <motion.div ref={menuRef} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              style={{ position: 'fixed', ...menuPos, zIndex: 1000, background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 9,
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)', padding: 5, width: menuWidth }}>
              {options.map(opt => (
                <button key={opt.id} onClick={() => { onChange(opt.id); setOpen(false); }}
                  className="sp-focus w-full flex items-center cursor-pointer"
                  style={{ gap: 8, padding: '7px 9px', borderRadius: 6, border: 'none',
                    background: opt.id === mode ? 'rgba(255,255,255,0.08)' : 'transparent', transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (opt.id !== mode) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = opt.id === mode ? 'rgba(255,255,255,0.08)' : 'transparent'; }}>
                  {opt.icon(opt.id === mode ? '#fff' : 'rgba(255,255,255,0.5)')}
                  <span style={{ ...ns, fontSize: 12.5, fontWeight: opt.id === mode ? 700 : 500, color: opt.id === mode ? '#fff' : 'rgba(255,255,255,0.7)' }}>
                    {opt.label}
                  </span>
                  {opt.id === mode && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#006EFE" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  )}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

function MicIcon({ color = '#fff', size = 15 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3"/>
      <path d="M5 10c0 3.9 3.1 7 7 7s7-3.1 7-7"/>
      <line x1="12" y1="17" x2="12" y2="21"/><line x1="9" y1="21" x2="15" y2="21"/>
    </svg>
  );
}

function MicOffIcon({ color = '#fff' }: { color?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3"/>
      <path d="M5 10c0 3.9 3.1 7 7 7s7-3.1 7-7"/>
      <line x1="12" y1="17" x2="12" y2="21"/><line x1="9" y1="21" x2="15" y2="21"/>
      <line x1="2" y1="1" x2="22" y2="21"/>
    </svg>
  );
}

/* Generic camera glyph for the Audio/Video toggle — deliberately not CameraLayoutIcon, which
   depicts a specific bubble/side-by-side arrangement rather than "video" as a device choice. */
function VideoIcon({ color = '#fff' }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="5" width="15" height="14" rx="2.5"/>
      <polygon points="23 7 16 12 23 17 23 7"/>
    </svg>
  );
}

function VideoOffIcon({ color = '#fff' }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}


function ScrollSpeedToggle({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const options = [
    { key: 'slow' as const, label: 'Slow' },
    { key: 'normal' as const, label: 'Normal' },
    { key: 'fast' as const, label: 'Fast' },
  ];
  return (
    <div className="flex items-center" style={{ gap: 1, padding: 2, borderRadius: 8, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }}>
      {options.map(o => {
        const active = value === SCROLL_SPEED_PRESETS[o.key];
        return (
          <button key={o.key} onClick={() => onChange(SCROLL_SPEED_PRESETS[o.key])}
            className="cursor-pointer" aria-pressed={active}
            style={{ height: 20, padding: '0 8px', borderRadius: 6, border: 'none', outline: 'none',
              background: active ? 'rgba(255,255,255,0.16)' : 'transparent',
              ...ns, fontSize: 10, fontWeight: 700, color: active ? '#fff' : 'rgba(255,255,255,0.4)' }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* Apply-to-all prompt — shown after the first method is chosen */

function GenerateScriptMenu({ onThisSlide, onOpenChat, disabled, compact }: {
  onThisSlide: () => void; onOpenChat: () => void; disabled?: boolean;
  // Icon + chevron only, no "Generate script" label — once a script already exists, the speed
  // slider needs the label's room more than this action needs to spell itself out; the sparkle
  // is still enough to read as "AI" and the menu itself is unchanged.
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // preferV/H are just starting guesses — this menu renders both docked (top of a left panel,
  // opening down-right is safe) and inside the freely-draggable teleprompter box (which can end
  // up anywhere, including flush against the bottom or right edge), so the actual placement has
  // to be measured fresh on every open rather than trusted from context.
  const { ref, style: menuStyle } = useMenuPlacement(open, { width: 160, height: 80, preferV: 'bottom', preferH: 'right' });
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref]);
  // Disabled while recording — same trigger, just dimmed and inert, instead of swapping in a
  // separate "Locked while recording" label that jumped the layout and read as a different control.
  const chevronColor = disabled ? 'rgba(255,255,255,0.3)' : WG_TO;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => !disabled && setOpen(o => !o)} disabled={disabled} aria-haspopup="menu" aria-expanded={open} className="sp-focus flex items-center"
        style={{ gap: 5, border: 'none', background: 'transparent', padding: 0, ...ns, fontSize: 11, fontWeight: 500, cursor: disabled ? 'default' : 'pointer' }}>
        {disabled ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="rgba(255,255,255,0.3)"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z"/></svg>
        ) : (
          // Same mark, same gradient as everywhere else — WordgenieIcon's default fill is now
          // the AI-dark-mode gradient, so the icon and label read as one continuous piece.
          <WordgenieIcon size={12} />
        )}
        {!compact && (
          <span style={disabled ? { color: 'rgba(255,255,255,0.3)' } : { background: WG_GRADIENT,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Generate script
          </span>
        )}
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={chevronColor} strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <AnimatePresence>
        {open && !disabled && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            style={{ ...menuStyle, zIndex: 50, background: '#1E1E1E',
              border: '1px solid rgba(255,255,255,0.06)', borderRadius: 9, boxShadow: '0 20px 50px rgba(0,0,0,0.5)', padding: 5, width: 160 }}>
            {[
              { label: 'This slide', action: () => { onThisSlide(); setOpen(false); } },
              { label: 'All slides', action: () => { onOpenChat(); setOpen(false); } },
            ].map(item => (
              <button key={item.label} onClick={item.action}
                className="sp-focus w-full text-left cursor-pointer"
                style={{ padding: '7px 10px', borderRadius: 6, border: 'none', background: 'transparent', ...ns, fontSize: 12.5, fontWeight: 500, color: '#fff', display: 'block', transition: 'background 0.1s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type WordgenieChatMessage = { role: 'user' | 'ai'; text: string; pills?: string[] };

// Dark-mode sibling of the editor's "Wordgenie" AI chat panel (PresentationEditorView.tsx,
// the aiPanelOpen side panel) — same slide-in-from-the-left, message-list-plus-input shape,
// just restyled for the studio canvas instead of the light editor chrome. Two doors open it:
// the persistent header icon, and the per-slide "Generate script → All slides" menu item —
// both just call onOpen(), so there's one chat/one history regardless of which door was used.
function WordgenieChatPanel({ open, messages, typing, input, onInputChange, onSend, onPillClick, onClose }: {
  open: boolean; messages: WordgenieChatMessage[]; typing?: boolean; input: string;
  onInputChange: (v: string) => void; onSend: () => void; onPillClick: (pill: string) => void; onClose: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open, typing]);
  return (
    <div className="flex-shrink-0 flex flex-col overflow-hidden"
      style={{ position: 'relative', width: open ? 300 : 0, borderRight: open ? '1px solid rgba(139,111,240,0.14)' : 'none',
        // Background stays the shared #121212 (same as the filmstrip and canvas either side of
        // it) — separation is carried by the border plus the inset shadow below instead of a
        // color shift. A real drop shadow would get clipped by this element's own
        // overflow:hidden (needed to clip content while width animates) before it ever escaped
        // the box, so this is an inset shadow instead — it paints inside the border box, so
        // overflow:hidden never touches it. Stronger on the right, facing the canvas (which
        // carries no border of its own — see the audit finding that the canvas edge relies
        // entirely on this panel's own boundary), lighter on the left, which already has the
        // filmstrip's own border doing some of the work.
        boxShadow: open ? 'inset -14px 0 20px -16px rgba(0,0,0,0.8), inset 8px 0 14px -14px rgba(0,0,0,0.6)' : 'none',
        background: '#121212', transition: 'width 0.22s cubic-bezier(0.2,0,0.2,1)' }}>
      {/* Header — plain white title, not gradient text. The editor's own aiPanelOpen panel
          (PresentationEditorView.tsx, this component's direct sibling) only spends the gradient
          on the *trigger* pill that opens the panel; once you're inside, the title goes flat.
          Matching that restraint instead of gradient-clipping the title everywhere — the violet
          background tint above now carries the identity instead of the title needing to. */}
      <div className="flex items-center justify-between flex-shrink-0" style={{ padding: '14px 16px', borderBottom: '1px solid rgba(139,111,240,0.1)', minWidth: 300 }}>
        <div className="flex items-center" style={{ gap: 9 }}>
          <div className="flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(76,141,255,0.22), rgba(139,111,240,0.22))', flexShrink: 0 }}>
            <WordgenieIcon size={14} />
          </div>
          <span style={{ ...ns, fontSize: 14.5, fontWeight: 700, color: '#fff' }}>
            Wordgenie
          </span>
        </div>
        <button onClick={onClose} className="flex items-center justify-center cursor-pointer" style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: 'none' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto flex flex-col" style={{ padding: 16, gap: 12, minWidth: 300 }}>
        {messages.map((msg, i) => (
          // Same entrance as the book-flow chat (messageVariants: fade + rise + slight scale) —
          // previously messages just snapped into place, which read as static compared to every
          // other Wordgenie surface in the app.
          <motion.div key={i} variants={messageVariants} initial="hidden" animate="visible"
            className="flex flex-col" style={{ alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 8 }}>
            <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`} style={{ width: '100%' }}>
              {msg.role === 'ai' && (
                <div className="flex items-end flex-shrink-0" style={{ marginRight: 7, marginBottom: 2 }}>
                  <div className="flex items-center justify-center" style={{ width: 22, height: 22, borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(76,141,255,0.22), rgba(139,111,240,0.22))' }}>
                    <WordgenieIcon size={12} />
                  </div>
                </div>
              )}
              <div style={{ maxWidth: '82%', padding: '9px 12px', lineHeight: 1.5,
                borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                background: msg.role === 'user' ? '#006EFE' : 'rgba(255,255,255,0.07)',
                border: msg.role === 'ai' ? '1px solid rgba(255,255,255,0.07)' : 'none',
                ...ns, fontSize: 13, color: '#fff' }}>
                {msg.text}
              </div>
            </div>
            {/* Only the last message ever shows its pills — the moment a reply (pill or typed)
                lands, that reply becomes the new last message and this question's pills vanish.
                Otherwise clicking a stale pill from an earlier question gets misread as the
                answer to whatever question is now active (sendAiChatMessage branches on the
                current aiChatStep, not on which message the pill came from). */}
            {msg.pills && i === messages.length - 1 && (
              <div className="flex flex-wrap" style={{ gap: 7, paddingLeft: 29 }}>
                {msg.pills.map(pill => (
                  // Outlined violet chip, same hue throughout — hover just lifts the fill and
                  // border a step brighter rather than flipping to a solid gradient block, so
                  // hovering three options in a row doesn't flash rainbow at you.
                  <button key={pill} onClick={() => onPillClick(pill)} className="cursor-pointer"
                    style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: 'rgba(201,191,255,0.8)', padding: '7px 14px', borderRadius: 20,
                      border: '1px solid rgba(139,111,240,0.28)', background: 'rgba(139,111,240,0.06)', textAlign: 'left',
                      transition: 'background 0.15s, border-color 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,111,240,0.14)'; e.currentTarget.style.borderColor = 'rgba(139,111,240,0.45)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(139,111,240,0.06)'; e.currentTarget.style.borderColor = 'rgba(139,111,240,0.28)'; }}>
                    {pill}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        ))}
        {/* Typing indicator — same bouncing-dots pattern as the book-flow chat's TypingIndicator,
            filling the silent gap while a scripted reply is "on its way" instead of messages
            just appearing with no acknowledgement in between. */}
        <AnimatePresence>
          {typing && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="flex items-end" style={{ gap: 7 }}>
              <div className="flex items-center justify-center flex-shrink-0" style={{ width: 22, height: 22, borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(76,141,255,0.22), rgba(139,111,240,0.22))' }}>
                <WordgenieIcon size={12} />
              </div>
              <div className="flex items-center" style={{ gap: 5, padding: '10px 13px', borderRadius: '12px 12px 12px 3px',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {[0, 1, 2].map(i => (
                  <motion.span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.5)' }}
                    animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={endRef} />
      </div>
      {/* Input */}
      <div className="flex-shrink-0" style={{ padding: '12px 16px', minWidth: 300 }}>
        <div className="flex items-center" style={{ gap: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '8px 12px' }}>
          <input value={input} onChange={e => onInputChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onSend(); }}
            placeholder="Or describe it yourself…" className="flex-1 outline-none bg-transparent"
            style={{ ...ns, fontSize: 13, color: '#fff', border: 'none' }} />
          <button onClick={onSend} disabled={!input.trim()} className="flex items-center justify-center cursor-pointer flex-shrink-0"
            style={{ width: 28, height: 28, borderRadius: 7, background: input.trim() ? '#006EFE' : 'rgba(255,255,255,0.08)', border: 'none' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/* Right panel — script + audio section for the active slide */
// Only ever rendered once a method is already chosen — studio mode (the workspace's
// !audio.methodSet branch) owns the "no method yet" case via StudioCanvas instead.
function StudioPanel({ idx, script, audio, cloneName, isGeneratingScript, onScriptChange, onAudioChange, onSwitchToRecord, onClone, onStartRecord, onGenerateAudioAll, onGenerateScript, onGenerateAllScripts }: {
  idx: number; script: string; audio: SlideAudio; cloneName: string | null;
  isGeneratingScript: boolean;
  onScriptChange: (v: string) => void;
  onAudioChange: (patch: Partial<SlideAudio>) => void;
  onSwitchToRecord: () => void;
  onClone: () => void; onStartRecord: () => void;
  onGenerateAudioAll: () => void;
  onGenerateScript: () => void; onGenerateAllScripts: () => void;
}) {
  const ready = audio.status === 'ready';
  const stale = audio.status === 'stale';
  const est = estimateSecs(script);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Script section */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '22px 20px 18px', borderBottom: '1px solid #EEF1F6' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
          <span style={{ ...ns, fontSize: 10, fontWeight: 700, color: '#B0BACB', letterSpacing: 0.7, textTransform: 'uppercase' }}>Script</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isGeneratingScript ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 11, height: 11, border: '2px solid #E8EBF2', borderTopColor: '#7C3AED', borderRadius: '50%', display: 'inline-block', animation: 'v2spin 0.8s linear infinite' }} />
                <span style={{ ...ns, fontSize: 10.5, color: '#7C3AED' }}>Generating…</span>
              </div>
            ) : (
              <GenerateScriptMenu onThisSlide={onGenerateScript} onOpenChat={onGenerateAllScripts} />
            )}
            <span style={{ ...ns, fontSize: 10.5, color: '#C0CADB' }}>~{formatTime(est)}</span>
          </div>
        </div>
        <textarea value={script}
          onChange={e => {
            onScriptChange(e.target.value);
            if (ready || stale) onAudioChange({ status: 'stale' });
          }}
          style={{ ...ns, fontSize: 13.5, color: '#1A2332', lineHeight: 1.65, border: 'none', resize: 'none',
            background: 'transparent', outline: 'none', width: '100%', flex: 1, minHeight: 120, padding: 0 }}
          placeholder="Write what you'll say over this slide…" />
      </div>

      {/* Audio section */}
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...ns, fontSize: 10, fontWeight: 700, color: '#B0BACB', letterSpacing: 0.7, textTransform: 'uppercase' }}>Add audio</span>
          {audio.methodSet && (
            <ChangeSourceMenu current={audio.source}
              onSwitch={s => {
                // Switching to "record" routes into the unified studio canvas — same place
                // a fresh slide lands, rather than a separate scope-picker screen.
                if (s === 'record') { onSwitchToRecord(); return; }
                onAudioChange({ source: s, methodSet: true, scopeSet: true, scope: 'single', status: 'empty', duration: 0, fileName: undefined, segStart: undefined, segEnd: undefined });
              }} />
          )}
        </div>

        <AudioControls idx={idx} audio={audio} script={script} cloneName={cloneName}
          onAudioChange={onAudioChange} onClone={onClone} onStartRecord={onStartRecord}
          onGenerateAll={onGenerateAudioAll} />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Studio entry transition — editor → studio hand-off, plays once on mount
   ════════════════════════════════════════════════════════════════ */
type EntryStage = 'deck' | 'voices' | 'ready';
const ENTRY_STAGES: { id: EntryStage; label: string }[] = [
  { id: 'deck', label: 'Loading your deck' },
  { id: 'voices', label: 'Setting up recording' },
  { id: 'ready', label: 'Studio ready' },
];

// Mirrors the platform's one existing generation-loader shape (GenerationTransition.tsx, used
// by the ebook wizard) rather than inventing a new one: glow-halo icon with a spring entrance
// and gentle float, a gradient-text headline, a small rotating status line, and the same
// shimmering progress-bar treatment — just re-skinned dark for the studio hand-off. Left out:
// GenerationTransition's confetti/orbit/mesh-gradient particle layers, since those read as
// celebratory ("something was made for you") and this moment is quieter — a threshold, not an
// achievement.
//
// Nothing here is actually waiting on a network call — slides and voice defaults are already
// synchronous zustand state by the time this mounts. But the three beats stay honest about
// that: they're paced to match the progress bar's own fixed duration, not a spinner standing
// in for latency that doesn't exist.
const ENTRY_TOTAL_MS = 2350;

function StudioEntryTransition({ onDone }: { onDone: () => void }) {
  const [stageIdx, setStageIdx] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStageIdx(1), 950),
      setTimeout(() => setStageIdx(2), 1700),
      setTimeout(() => setExiting(true), ENTRY_TOTAL_MS),
      setTimeout(onDone, ENTRY_TOTAL_MS + 450),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  return (
    <motion.div
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: exiting ? 'none' : 'auto' }}
    >
      {/* Three stops, not two: white editor → #1E1E1E (the studio's own menu/surface tone,
          already used elsewhere in this file — not an invented mid-gray) → #121212 canvas.
          A single white→#121212 blend passes through a flat muddy gray at the midpoint (the
          same reason film edits cut to black between very different shots rather than
          dissolving them into each other); splitting it into two smaller hops keeps each one
          gentle. This layer only carries the first hop, white → #1E1E1E, with content waiting
          until it's mostly there before fading in. The second hop, #1E1E1E → #121212, is just
          this whole overlay fading out on exit to reveal the studio's real canvas underneath —
          both dark tones are close enough that blend never reads as muddy. */}
      <motion.div
        initial={{ backgroundColor: '#FFFFFF' }}
        animate={{ backgroundColor: '#1E1E1E' }}
        transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
        style={{ position: 'absolute', inset: 0 }}
      />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, delay: 0.45 }}
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Glow halo behind icon — same two-layer treatment as the book/outline loader's icon */}
        <motion.div
          className="absolute rounded-full"
          style={{ width: 110, height: 110, top: -25,
            background: 'radial-gradient(circle, rgba(76,141,255,0.16) 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.35, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="relative mb-5 flex justify-center"
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.3 }}
        >
          <motion.div animate={{ y: [0, -4, 0, 4, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(76,141,255,0.25), rgba(139,111,240,0.25))',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <WordgenieIcon size={26} />
            </div>
          </motion.div>
        </motion.div>

        {/* Headline — blur-in + gradient text, same treatment as "Generating manuscript" */}
        <motion.p
          initial={{ opacity: 0, y: 15, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.5, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{ ...ns, fontSize: 16, fontWeight: 700, margin: 0,
            background: WG_GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          Setting up your studio
        </motion.p>

        {/* Small rotating status line — same role as the book loader's typewriter progress,
            just a plain crossfade since three short stages don't need a per-character type-on. */}
        <div style={{ height: 18, marginTop: 6, display: 'flex', alignItems: 'center' }}>
          <AnimatePresence mode="wait">
            <motion.span key={stageIdx}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{ ...ns, fontSize: 12.5, color: 'rgba(255,255,255,0.5)' }}>
              {ENTRY_STAGES[stageIdx].label}{stageIdx < ENTRY_STAGES.length - 1 ? '…' : ''}
            </motion.span>
          </AnimatePresence>
        </div>

        {/* Premium progress bar — same track + gradient fill + shimmer sweep as the book loader,
            re-skinned for a dark track instead of a light one. Fill duration matches the beats
            above so it lands full right as the third stage arrives. */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ delay: 0.7, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: 'center', marginTop: 18 }}>
          <div style={{ width: 180, height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', position: 'relative' }}>
            <motion.div
              style={{ height: '100%', borderRadius: 999, background: WG_GRADIENT }}
              initial={{ width: '0%' }} animate={{ width: '100%' }}
              transition={{ duration: ENTRY_TOTAL_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
            />
            <motion.div
              style={{ position: 'absolute', inset: 0, borderRadius: 999,
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)' }}
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1.3, repeat: Infinity, ease: 'linear', delay: 0.7 }}
            />
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Main V2 view
   ════════════════════════════════════════════════════════════════ */
export default function NarrationViewV4() {
  const storeSlides = usePresentationFlowStore(s => s.slides);
  const selectedThemeId = usePresentationFlowStore(s => s.selectedThemeId);
  const sidebarOpen = useFlowStore(s => s.sidebarOpen);
  const setSidebarOpen = useFlowStore(s => s.setSidebarOpen);

  const slides: PresentationSlide[] = useMemo(() =>
    storeSlides.length > 0 ? storeSlides : [{ id: 'slide-1', title: 'Untitled presentation', type: 'content' as const, points: [] }],
  [storeSlides]);

  const NEUTRAL_THEME: MockTheme = { id: 'none', name: 'None', bg: '#FFFFFF', titleColor: '#15191F', accentColor: '#C8CDD9', slides: [] };
  const theme = (selectedThemeId && selectedThemeId !== 'blank')
    ? (MOCK_THEMES.find(t => t.id === selectedThemeId) ?? MOCK_THEMES[0])
    : (storeSlides.length > 0 ? NEUTRAL_THEME : MOCK_THEMES[0]);

  // Reopening a saved video (from /projects) should restore exactly how it was left,
  // not re-derive fresh scripts/audio from the slides. Captured once at mount, then
  // cleared so a fresh "Create video" flow doesn't inherit stale narration.
  const savedNarrationRef = useRef(useVideoFlowStore.getState().savedNarration);
  useEffect(() => { useVideoFlowStore.getState().clearSavedNarration(); }, []);
  const saved = savedNarrationRef.current;
  const savedMatchesSlides = !!saved && saved.scripts.length === slides.length && saved.audios.length === slides.length;

  const [step, setStep] = useState<Step>('workspace');
  const [scripts, setScripts] = useState<string[]>(() =>
    savedMatchesSlides ? saved!.scripts : slides.map(s => s.notes ?? scriptFromSlide(s))
  );
  const [audios, setAudios] = useState<SlideAudio[]>(() =>
    savedMatchesSlides
      ? saved!.audios.map(a => ({ ...a, captureMode: 'audio' as CaptureMode, cameraLayout: 'bubble' as CameraLayout }))
      : slides.map(() => freshAudio(AI_VOICES[0].id))
  );
  const [defaultVoice, setDefaultVoice] = useState(saved?.defaultVoice ?? AI_VOICES[0].id);
  const [cloneName, setCloneName] = useState<string | null>(saved?.cloneName ?? null);
  // Plays once per mount — reopening a saved video still gets the "walking into the studio"
  // beat, same as a fresh one. Only false once StudioEntryTransition finishes its own timing.
  const [studioEntering, setStudioEntering] = useState(true);
  // The wordgenie chat — lives here (not inside GenerateScriptMenu) so it's the same
  // conversation regardless of which door opened it: the persistent header icon, or the
  // per-slide menu's "All slides" item. Mirrors PresentationEditorView's aiPanelOpen chat.
  // Starts open — Wordgenie greets the moment the studio loads, rather than waiting for the
  // header icon to be clicked.
  const [aiChatOpen, setAiChatOpen] = useState(true);
  // Deck-aware opener, asked as two short questions instead of one bundled brief — what's
  // being made first (course/webinar/not sure feed the script's framing more than a tone
  // label would, and it reads naturally since the deck is already made), then length
  // (concrete and worth its own answer rather than a vague "pacing" pill).
  const deckSpan = slides.length === 1 ? 'your one slide' : `${slides.length} slides`;
  // Matches the framing already used for this entry point elsewhere (PresentationEditorView's
  // "Video course, webinar, or demo — narrated in minutes"), so the chat's options aren't a
  // fresh taxonomy the user has to map onto what they clicked to get here.
  const [aiChatMessages, setAiChatMessages] = useState<WordgenieChatMessage[]>([
    { role: 'ai', text: `I can see the deck — ${deckSpan}. What are you creating?`,
      pills: ['A video course', 'A webinar', 'A product demo', 'A pitch or sales deck', 'Not sure yet'] },
  ]);
  // Tracks the two-question flow: 'type' → 'length' → 'done'. Only the content-type answer is
  // held onto (aiChatContentType) since length's answer is used immediately, not stored further.
  const [aiChatStep, setAiChatStep] = useState<'type' | 'length' | 'done'>('type');
  const [aiChatContentType, setAiChatContentType] = useState<string | null>(null);
  const [aiChatInput, setAiChatInput] = useState('');
  // Mirrors the book-flow chat's isAiTyping (ChatContainer.tsx) — fills the setTimeout gap
  // before each scripted reply with the same bouncing-dots indicator instead of dead silence.
  const [aiChatTyping, setAiChatTyping] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  // Studio mode dominates for any slide with no method chosen yet — the whole workspace
  // becomes the studio instead of an editor with a studio panel bolted to the side.
  // Filmstrip starts collapsed to the slim rail — matches the same "studio owns the stage"
  // default everything else here already has (mode rail collapses to a pill once settled, next
  // preview is opt-in), rather than opening on the one surface that isn't the recording itself.
  // The rail still shows per-slide status and jumps to any slide, so nothing here is hidden,
  // just quieter. Expand any time via its own button; it also force-collapses the moment
  // recording actually starts, same as before.
  const [filmstripPeek, setFilmstripPeek] = useState(false);
  // Lives here, not as local state inside StudioCanvas — StudioCanvas remounts on every slide
  // switch (key={activeIdx}, so its own per-take state like phase/elapsed resets cleanly), but
  // script visibility is a standing preference, not per-take state. Closing it on slide 1 and
  // switching to slide 2 should leave it closed, not silently reopen it via the remount.
  const [scriptVisible, setScriptVisible] = useState(true);
  // Same lift as scriptVisible, same reason — these are standing preferences for how you're
  // reading the script, not per-take state, so they shouldn't reset every time StudioCanvas
  // remounts on a slide switch. Default scroll speed starts slow — the old 50 (out of 100)
  // read too fast to comfortably talk along with on a first pass.
  const [scriptMode, setScriptMode] = useState<'left' | 'right' | 'teleprompter'>('left');
  const [promptPos, setPromptPos] = useState<{ x: number; y: number } | null>(null);
  // Was 400x300 — closer to a small version of the docked card than an actual teleprompter.
  // Real teleprompter tools (BIGVU, Riverside) converge on a narrow reading strip near the
  // camera, not a wide box centered over whatever you're recording, since the whole point is
  // keeping your eyes close to the lens. Shorter and a touch wider fits that strip shape and
  // still only needs to show the next couple lines at a time, same as a physical teleprompter.
  const [promptSize, setPromptSize] = useState({ w: 480, h: 180 });
  const [scrollSpeed, setScrollSpeed] = useState<number>(SCROLL_SPEED_PRESETS.normal);
  // Preview/Export disable themselves while the studio has an unsaved take in flight, so a
  // stray click can't interrupt a recording or export around it mid-take.
  const [takeInProgress, setTakeInProgress] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);

  // Wordgenie steps aside for a take in progress, then steps back once it's done. The header
  // (and the panel's own toggle) is already hidden mid-take, so this is the only way the panel
  // would otherwise sit open with nothing to do, half-covering the canvas. wasAiChatOpenRef
  // remembers whether *this* take is the one that closed it, so a take started with the panel
  // already manually closed doesn't get it reopened afterward.
  const wasAiChatOpenRef = useRef(false);
  useEffect(() => {
    if (takeInProgress) {
      if (aiChatOpen) {
        wasAiChatOpenRef.current = true;
        setAiChatOpen(false);
      }
    } else if (wasAiChatOpenRef.current) {
      wasAiChatOpenRef.current = false;
      setAiChatOpen(true);
    }
  }, [takeInProgress, aiChatOpen]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Filmstrip clicks (rail or expanded) go through the parent's activeIdx, same as the keyboard
  // shortcut — and StudioCanvas is keyed on activeIdx (see below), so changing it mid-take
  // remounts the canvas and silently drops whatever was just recorded. The keyboard handler
  // already guards this with takeInProgress; the filmstrip's onClick handlers need the same
  // guard, not just the bottom bar's own nav (which stays safe by using local state instead).
  const navigateFilmstrip = useCallback((i: number) => {
    if (takeInProgress) { showToast('Finish or discard the current take first'); return; }
    setActiveIdx(i);
  }, [takeInProgress, showToast]);

  const patchAudio = useCallback((i: number, patch: Partial<SlideAudio>) => {
    setAudios(prev => prev.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  }, []);

  const [scriptGenerating, setScriptGenerating] = useState<boolean[]>(() => slides.map(() => false));

  const generateScript = useCallback((i: number) => {
    setScriptGenerating(prev => prev.map((v, j) => j === i ? true : v));
    setTimeout(() => {
      setScripts(prev => prev.map((s, j) => j === i ? expandScript(s, slides[j], 'default', i === 0) : s));
      setScriptGenerating(prev => prev.map((v, j) => j === i ? false : v));
      setAudios(prev => prev.map((a, j) => j === i && (a.status === 'ready' || a.status === 'stale') ? { ...a, status: 'stale' } : a));
    }, 900 + Math.random() * 500);
  }, [slides]);

  // brief is optional so this still satisfies callers (like the unused StudioPanel branch)
  // typed against a plain () => void — see GenerateScriptMenu for why.
  const generateAllScripts = useCallback((brief?: string) => {
    const tone = toneFromBrief(brief ?? '');
    slides.forEach((_, i) => {
      setScriptGenerating(prev => prev.map((v, j) => j === i ? true : v));
      setTimeout(() => {
        setScripts(prev => prev.map((s, j) => j === i ? expandScript(s, slides[j], tone, i === 0) : s));
        setScriptGenerating(prev => prev.map((v, j) => j === i ? false : v));
      }, 600 + i * 300 + Math.random() * 300);
    });
    showToast('Generating scripts for all slides…');
  }, [slides, showToast]);

  // Sending a chat message is what actually triggers generation now (both the header icon and
  // the per-slide menu just open this panel) — the whole exchange stays visible afterward, so
  // there's a record of what was asked for, not just a one-shot prompt that vanishes on close.
  // First answer (tone) just advances to the length question; generation only fires once both
  // are in, so the brief going into toneFromBrief()/generateAllScripts carries both.
  const sendAiChatMessage = useCallback((text: string) => {
    const msg = text.trim();
    if (!msg) return;
    setAiChatMessages(prev => [...prev, { role: 'user', text: msg }]);
    setAiChatInput('');
    setAiChatTyping(true);

    if (aiChatStep === 'type') {
      setAiChatContentType(msg);
      setAiChatStep('length');
      setTimeout(() => {
        setAiChatTyping(false);
        setAiChatMessages(prev => [...prev, { role: 'ai', text: 'Got it. And roughly how long should this run?',
          pills: ['Under 2 minutes', 'Under 5 minutes', 'No rush — walk through everything'] }]);
      }, 500);
      return;
    }

    const brief = aiChatStep === 'length' && aiChatContentType ? `${aiChatContentType}, ${msg}` : msg;
    generateAllScripts(brief);
    setAiChatStep('done');
    setTimeout(() => {
      setAiChatTyping(false);
      setAiChatMessages(prev => [...prev, { role: 'ai', text: `On it — writing your script now, aiming for: "${brief}"` }]);
    }, 700);
  }, [generateAllScripts, aiChatStep, aiChatContentType]);

  // Keyboard navigation for slides (skip when focus is in a text field)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      // A take in progress owns arrow keys via its own local (non-remounting) nav — this
      // global shortcut jumping the parent's activeIdx would remount StudioCanvas (key={activeIdx})
      // mid-capture and silently drop whatever was just recorded.
      if (takeInProgress) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setActiveIdx(i => Math.min(slides.length - 1, i + 1));
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   setActiveIdx(i => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [slides.length, takeInProgress]);

  // Auto-scroll filmstrip to keep active item visible
  useEffect(() => {
    const strip = filmstripRef.current;
    if (!strip) return;
    const items = strip.querySelectorAll('button');
    items[activeIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIdx]);

  // Routes a slide into the unified studio canvas — same destination whether it's a fresh
  // slide or an existing one switching its type back to "record" from classic mode.
  const handleSwitchToRecord = () => {
    patchAudio(activeIdx, { methodSet: false, scopeSet: false });
  };

  // Only fills in slides with no audio attached yet — never overwrites a slide that already has a take (ready or stale).
  const generateAllAudio = useCallback(() => {
    setAudios(prev => prev.map(a =>
      !a.methodSet ? { ...a, source: 'ai', methodSet: true, status: 'generating', duration: 0 } :
      a.source === 'ai' && a.status === 'empty' ? { ...a, status: 'generating' } : a
    ));
    slides.forEach((_, i) => {
      setTimeout(() => {
        setAudios(prev => prev.map((a, j) =>
          j === i && a.source === 'ai' && a.status === 'generating'
            ? { ...a, status: 'ready', duration: estimateSecs(scripts[j]) }
            : a
        ));
      }, 900 + i * 250 + Math.random() * 400);
    });
    showToast('Generating audio for slides without narration…');
  }, [slides, scripts, showToast]);

  // Recording finishes right where it started — activeIdx never moves while the studio
  // canvas is mounted (its own internal idx handles multi-slide navigation during a take).
  const handleRecordDone = (scope: CaptureScope, captureMode: CaptureMode, cameraLayout: CameraLayout, durations: Record<number, number>, overwriteExisting: boolean) => {
    const startedIdx = activeIdx;
    if (scope === 'single') {
      const dur = durations[startedIdx] ?? 0;
      const nextAudios = audios.map((a, i) => i === startedIdx
        ? { ...a, source: 'record' as const, methodSet: true, scopeSet: true, scope: 'single' as CaptureScope, status: 'ready' as const, duration: dur, captureMode, cameraLayout }
        : a);
      // Saving used to auto-jump to export once every slide had a take — but that meant
      // finishing the last slide yanked you out of the studio into a render screen instead
      // of showing the take you just made. Stay put; Export is one click away when you want it.
      setAudios(nextAudios);
      return;
    }
    let cursor = 0;
    const segments = slides.map((_, i) => {
      const d = durations[i] ?? 0;
      const seg = { start: cursor, end: cursor + d };
      cursor += d;
      return seg;
    });
    // Multi-slide take: covers the started slide and everything the user advanced through.
    // Slides before that are left alone entirely. Among the covered ones, whether an existing
    // take (any source — record, AI voice, or upload) is left untouched or overwritten is now
    // the choice made in the confirmRecordScope modal, rather than a hardcoded "recorded slides
    // are safe, AI/upload slides aren't" rule — the fill-empty-only default now actually means
    // empty, not "empty or synthesized."
    const hasExistingTake = (i: number) => audios[i].status === 'ready' || audios[i].status === 'stale';
    setAudios(slides.map((_, i) => {
      if (scope === 'multi' && i < startedIdx) return audios[i];
      if (!overwriteExisting && hasExistingTake(i)) return audios[i];
      // A slide the take never actually reached (0 captured seconds) stays untouched —
      // only slides that picked up real time count as recorded.
      if ((durations[i] ?? 0) <= 0) return audios[i];
      return {
        source: 'record', methodSet: true, scopeSet: true, scope: 'multi', voiceId: defaultVoice, status: 'ready',
        duration: segments[i].end - segments[i].start,
        segStart: segments[i].start, segEnd: segments[i].end,
        captureMode, cameraLayout,
      };
    }));
    showToast('Recording split across slides');
  };

  // Export follows what's actually been narrated — a slide with no take just isn't part of
  // the video. "Ready" and "stale" both count (stale still has a take, just flagged to refresh);
  // only "empty"/"generating" slides are left out.
  const includedIdxs = audios.map((_, i) => i).filter(i => audios[i].status === 'ready' || audios[i].status === 'stale');
  const includedCount = includedIdxs.length;
  const includedSlides = includedIdxs.map(i => slides[i]);
  const includedAudios = includedIdxs.map(i => audios[i]);
  const totalSecs = includedIdxs.reduce((acc, i) => acc + audios[i].duration, 0);

  if (step === 'clone') return (
    <CloneScreen
      onDone={name => {
        setCloneName(name);
        setDefaultVoice(CLONE_VOICE_ID);
        setAudios(prev => prev.map(a => a.source === 'ai'
          ? { ...a, voiceId: CLONE_VOICE_ID, status: a.status === 'ready' || a.status === 'stale' ? 'stale' : a.status }
          : a));
        setStep('workspace');
      }}
      onBack={() => setStep('workspace')} />
  );
  if (step === 'review') return (
    <ReviewScreen slides={includedSlides} theme={theme} audios={includedAudios} onContinue={() => setStep('export')} onBack={() => setStep('workspace')}
      sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
  );
  if (step === 'export') return (
    <ExportScreen slides={includedSlides} theme={theme} totalSecs={totalSecs} onBack={() => setStep('workspace')}
      sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
  );

  // Active slide data
  const slide = slides[activeIdx];
  const slideBg = slide.bgImageUrl ? `url(${slide.bgImageUrl}) center/cover` : (slide.bgColor ?? theme.bg);
  // Always the studio — recording a slide used to hand off to a separate light-mode editor
  // (studioMode was tied to methodSet), which is exactly the "editor first, studio second"
  // feel this whole redesign moved away from. Saving now keeps you in StudioCanvas, which
  // shows its own "recorded" status + re-record/change-type/delete row once a take exists.
  const studioMode = true;

  return (
    <div className="h-full flex flex-col" style={{ background: studioMode ? '#121212' : '#EBEDF2' }}>
      {studioEntering && (
        <StudioEntryTransition onDone={() => setStudioEntering(false)} />
      )}
      {/* Header — goes dark with the studio so there's no light seam above the canvas. Collapses
          away entirely once a take is in flight (recording, paused, or under review), matching
          Pitch's own fullscreen recorder chrome — just "Recorder" + a close X, no editor nav or
          Preview/Export while you're mid-take. StudioCanvas has its own discard "✕" inside the
          canvas during a take, so this doesn't strand anyone without an exit. */}
      <AnimatePresence initial={false}>
      {!takeInProgress && (
      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 54, opacity: 1 }} exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="flex-shrink-0 flex items-center justify-between"
        style={{ padding: '0 18px', overflow: 'hidden',
          borderBottom: studioMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E8EBF2',
          background: studioMode ? '#121212' : '#fff', zIndex: 10 }}>
        <div className="flex items-center" style={{ gap: 10 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className={studioMode ? 'flex-shrink-0 rounded-lg cursor-pointer flex items-center justify-center' : 'flex-shrink-0 rounded-lg hover:bg-[#F6F7F9] transition-colors cursor-pointer flex items-center justify-center'}
            style={{ width: 40, height: 40, background: 'transparent',
              filter: studioMode ? 'invert(1) grayscale(1) brightness(1.7)' : undefined }}>
            <SideMenuIcon active={sidebarOpen} />
          </button>
          {/* Matches the editor's AIButton (PresentationEditorView.tsx) — pill, brand-gradient
              mark + gradient-clipped label, blue border/tint when active — just re-surfaced for
              a dark canvas: the light-mode white/pale-blue fills become low-alpha white/blue
              tints instead, same as every other "card" and "selected" surface in this studio. */}
          <button onClick={() => setAiChatOpen(v => !v)} className="flex items-center cursor-pointer"
            style={{ gap: 8, height: 38, padding: '0 16px', borderRadius: 8,
              border: aiChatOpen ? '1px solid rgba(139,111,240,0.5)' : '1px solid rgba(255,255,255,0.14)',
              background: aiChatOpen ? 'rgba(139,111,240,0.12)' : 'rgba(255,255,255,0.05)',
              transition: 'all 0.15s ease' }}
            onMouseEnter={e => { if (!aiChatOpen) { e.currentTarget.style.borderColor = 'rgba(139,111,240,0.5)'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; } }}
            onMouseLeave={e => { if (!aiChatOpen) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; } }}>
            <WordgenieIcon size={18} />
            <span style={{ ...ns, fontSize: 14, fontWeight: 600, background: WG_GRADIENT,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', whiteSpace: 'nowrap' }}>
              Wordgenie
            </span>
          </button>
        </div>

        <div className="flex items-center" style={{ gap: 14 }}>
          <div className="flex items-center" style={{ gap: 6 }}>
            <span style={{ ...ns, fontSize: 13, fontWeight: 700, color: studioMode ? 'rgba(255,255,255,0.7)' : '#52637A' }}>
              {includedCount}/{slides.length}
            </span>
            <span style={{ ...ns, fontSize: 12, color: studioMode ? 'rgba(255,255,255,0.4)' : '#8596AD' }}>slides will export</span>
            {totalSecs > 0 && <span style={{ ...ns, fontSize: 12, color: studioMode ? 'rgba(255,255,255,0.3)' : '#B0BACB' }}>· {formatTime(totalSecs)}</span>}
          </div>
          <div className="flex items-center" style={{ gap: 8 }}>
            <button onClick={() => setStep('review')} disabled={includedCount === 0 || takeInProgress}
              title={takeInProgress ? 'Finish or discard the current take first' : includedCount === 0 ? 'Add audio or video to at least one slide first' : undefined}
              style={{ height: 36, padding: '0 16px', borderRadius: 10,
                border: studioMode ? '1.5px solid rgba(255,255,255,0.22)' : '1px solid #E0E5EB',
                background: studioMode ? 'transparent' : '#fff', ...ns, fontSize: 13, fontWeight: 600,
                color: includedCount > 0 && !takeInProgress ? (studioMode ? 'rgba(255,255,255,0.85)' : '#15191F') : (studioMode ? 'rgba(255,255,255,0.3)' : '#B8C0CC'),
                display: 'flex', alignItems: 'center', gap: 6, cursor: includedCount > 0 && !takeInProgress ? 'pointer' : 'not-allowed',
                opacity: takeInProgress ? 0.5 : 1 }}>
              Preview
            </button>
            <button onClick={() => setStep('export')} disabled={includedCount === 0 || takeInProgress}
              title={takeInProgress ? 'Finish or discard the current take first' : includedCount === 0 ? 'Add audio or video to at least one slide first' : undefined}
              style={{ height: 36, padding: '0 16px', borderRadius: 9, border: 'none',
                background: includedCount > 0 && !takeInProgress ? '#006EFE' : (studioMode ? 'rgba(255,255,255,0.1)' : '#C3CEDE'), ...ns, fontSize: 13, fontWeight: 600, color: '#fff',
                display: 'flex', alignItems: 'center', gap: 6, cursor: includedCount > 0 && !takeInProgress ? 'pointer' : 'not-allowed',
                opacity: takeInProgress ? 0.5 : 1 }}>
              Export
            </button>
          </div>
        </div>
      </motion.div>
      )}
      </AnimatePresence>

      {/* Studio body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Filmstrip — collapses to a rail while studio mode owns the stage */}
        {studioMode && !filmstripPeek ? (
          <FilmstripRail slides={slides} theme={theme} audios={audios} activeIdx={activeIdx}
            onSelect={navigateFilmstrip} onExpand={() => setFilmstripPeek(true)} />
        ) : (
          <div ref={filmstripRef}
            style={{ width: 172, flexShrink: 0, overflowY: 'auto',
              // Same #15191F as the collapsed rail and the studio canvas now — was its own
              // #121212 panel gray, a third shade the eye had to reconcile against the other two.
              background: studioMode ? '#121212' : '#fff',
              borderRight: studioMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E0E3EA', padding: '12px 0' }}>
            {studioMode && (
              <button onClick={() => setFilmstripPeek(false)} className="cursor-pointer flex items-center"
                style={{ gap: 5, margin: '0 10px 8px', border: 'none', borderRadius: 6, background: 'transparent', padding: '4px 6px', transition: 'background 0.12s',
                  ...ns, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
                Collapse
              </button>
            )}
            {slides.map((s, i) => (
              <FilmstripItem key={s.id} slide={s} theme={theme} audio={audios[i]} script={scripts[i]}
                idx={i} isActive={activeIdx === i} onClick={() => navigateFilmstrip(i)} />
            ))}
          </div>
        )}

        <WordgenieChatPanel open={aiChatOpen} messages={aiChatMessages} typing={aiChatTyping} input={aiChatInput}
          onInputChange={setAiChatInput} onSend={() => sendAiChatMessage(aiChatInput)}
          onPillClick={sendAiChatMessage} onClose={() => setAiChatOpen(false)} />

        {studioMode ? (
          /* Studio canvas — setup and recording are the same continuous view, no hand-off */
          <div style={{ flex: 1, minHeight: 0, minWidth: 0, padding: 16, background: '#121212' }}>
            <StudioCanvas key={activeIdx} slides={slides} theme={theme} scripts={scripts}
              onScriptChange={(i, v) => setScripts(prev => prev.map((s, j) => j === i ? v : s))}
              startIdx={activeIdx}
              audio={audios[activeIdx]}
              onNavigate={setActiveIdx}
              cloneName={cloneName}
              isGeneratingScript={scriptGenerating[activeIdx] ?? false}
              onGenerateScript={() => generateScript(activeIdx)}
              onOpenAiChat={() => setAiChatOpen(true)}
              onAudioChange={patch => patchAudio(activeIdx, patch)}
              onClone={() => setStep('clone')}
              onRecordDone={handleRecordDone}
              onRecordingStart={() => { setFilmstripPeek(false); setSidebarOpen(false); }}
              onTakeInProgressChange={setTakeInProgress}
              showToast={showToast}
              scriptVisible={scriptVisible} onScriptVisibleChange={setScriptVisible}
              scriptMode={scriptMode} onScriptModeChange={setScriptMode}
              promptPos={promptPos} onPromptPosChange={setPromptPos}
              promptSize={promptSize} onPromptSizeChange={setPromptSize}
              scrollSpeed={scrollSpeed} onScrollSpeedChange={setScrollSpeed}
              otherTakeSlideNumbers={audios.map((a, i) => ({ a, n: i + 1 })).filter(({ a, n }) => n !== activeIdx + 1 && (a.status === 'ready' || a.status === 'stale')).map(({ n }) => n)} />
          </div>
        ) : (
          <>
            {/* Canvas area — center */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              position: 'relative', padding: '24px 20px', minWidth: 0 }}>

              {/* Slide canvas */}
              <AnimatePresence mode="wait">
                <motion.div key={activeIdx}
                  initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.16 }}
                  style={{ width: '100%', maxWidth: 840, aspectRatio: '16/9', borderRadius: 14,
                    overflow: 'hidden', background: slideBg, position: 'relative',
                    boxShadow: '0 8px 40px rgba(15,23,51,0.20)' }}>
                  <div style={{ position: 'absolute', inset: 0, padding: '7% 8%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    {slide.title && (
                      <h2 style={{ ...ns, fontSize: 'clamp(16px,2.8vw,28px)', fontWeight: 700,
                        color: slide.textColorOverride ?? theme.titleColor, margin: 0, lineHeight: 1.2 }}>
                        {slide.title}
                      </h2>
                    )}
                    {slide.points.length > 0 && (
                      <div style={{ marginTop: '4%', display: 'flex', flexDirection: 'column', gap: '2.5%' }}>
                        {slide.points.map((pt, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: theme.accentColor, marginTop: 7, flexShrink: 0 }} />
                            <p style={{ ...ns, fontSize: 'clamp(11px,1.5vw,17px)', color: slide.textColorOverride ?? theme.titleColor, opacity: 0.82, margin: 0, lineHeight: 1.5 }}>{pt}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>

            </div>

            {/* Right panel — script + audio */}
            <div style={{ width: 340, flexShrink: 0, borderLeft: '1px solid #E0E3EA', background: '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <AnimatePresence mode="wait">
                <motion.div key={activeIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }} style={{ flex: 1, overflow: 'hidden' }}>
                  <StudioPanel
                    idx={activeIdx}
                    script={scripts[activeIdx] ?? ''}
                    audio={audios[activeIdx]}
                    cloneName={cloneName}
                    isGeneratingScript={scriptGenerating[activeIdx] ?? false}
                    onScriptChange={v => setScripts(prev => prev.map((s, j) => j === activeIdx ? v : s))}
                    onAudioChange={patch => patchAudio(activeIdx, patch)}
                    onSwitchToRecord={handleSwitchToRecord}
                    onClone={() => setStep('clone')}
                    onStartRecord={handleSwitchToRecord}
                    onGenerateAudioAll={generateAllAudio}
                    onGenerateScript={() => generateScript(activeIdx)}
                    onGenerateAllScripts={generateAllScripts}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          // See the other toast instance above for why centering lives on a static wrapper, and
          // why it's absolute (not fixed) — resolves against the content area, excluding the sidebar.
          <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 60 }}>
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              style={{ background: '#121212', color: '#fff', borderRadius: 10, padding: '10px 18px',
                ...ns, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(15,23,51,0.28)' }}>
              {toast}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes v2spin  { to { transform: rotate(360deg) } }
        @keyframes v2blink { 0%,100% { opacity: 1 } 50% { opacity: 0.25 } }
        @keyframes v2pulse { from { transform: scaleY(0.6); } to { transform: scaleY(1.15); } }
      `}</style>
    </div>
  );
}
