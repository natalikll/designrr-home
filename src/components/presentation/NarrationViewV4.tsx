'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { usePresentationFlowStore, type PresentationSlide } from '@/stores/presentationFlowStore';
import { MOCK_THEMES, type MockTheme } from '@/lib/presentationMocks';
import { useFlowStore } from '@/stores/flowStore';
import { SideMenuIcon } from '@/components/sidebar/AppSidebar';

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
// Red is already spoken for (the live "recording in progress" indicator) — reusing it here for
// "this slide's take came from Record" reads as an error/warning, not a status. Orange instead.
const SOURCE_COLORS: Record<SourceKind, string> = { record: '#F28B3A', ai: '#7C3AED', upload: '#0FA47C' };
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

function mockGenerateScript(slide: PresentationSlide): string {
  const title = slide.title ?? '';
  const points = slide.points.filter(p => p.trim());
  const parts: string[] = [];
  if (title) {
    const openers = [
      `Let's talk about ${title.toLowerCase()}.`,
      `Now we'll look at ${title.toLowerCase()}.`,
      `${title} is worth understanding in detail.`,
    ];
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
  const clean = bullet.replace(/^[-*]\s*/, '').trim();
  return clean ? `Let's talk about ${clean.charAt(0).toLowerCase() + clean.slice(1)}.` : '';
}

function expandScript(existing: string, slide: PresentationSlide): string {
  const trimmed = existing.trim();
  const lines = trimmed.split('\n');
  const hasBullets = lines.some(l => /^[-*]\s*/.test(l.trim()));
  if (hasBullets) {
    // Interleaved, not grouped — each bullet is immediately followed by its own line of
    // script, so the two stay paired instead of reading as two disconnected blocks.
    const out: string[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      out.push(raw);
      if (/^[-*]\s*/.test(line)) {
        const gen = scriptLineForBullet(line, slide.title ?? '');
        if (gen) out.push(gen);
      }
    }
    return out.join('\n');
  }
  const generated = mockGenerateScript(slide);
  return trimmed ? `${trimmed}\n\n${generated}` : generated;
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
          <stop stopColor="#006EFE"/><stop offset="1" stopColor="#5326BD"/>
        </linearGradient>
        <linearGradient id="nvWgGradB" x1="10.1288" y1="1.59582" x2="0.43907" y2="3.46185" gradientUnits="userSpaceOnUse">
          <stop stopColor="#006EFE"/><stop offset="1" stopColor="#5326BD"/>
        </linearGradient>
        <linearGradient id="nvWgGradC" x1="30.1288" y1="21.5958" x2="20.4391" y2="23.4619" gradientUnits="userSpaceOnUse">
          <stop stopColor="#006EFE"/><stop offset="1" stopColor="#5326BD"/>
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
function SlideThumb({ slide, theme, width = 132 }: { slide: PresentationSlide; theme: MockTheme; width?: number }) {
  const bg = slide.bgImageUrl ? `url(${slide.bgImageUrl}) center/cover` : (slide.bgColor ?? theme.bg);
  const h = width * 9 / 16;
  return (
    <div style={{ width, height: h, borderRadius: 8, overflow: 'hidden', position: 'relative', flexShrink: 0,
      border: '1px solid #E8EBF2', background: bg, boxShadow: '0 1px 4px rgba(15,23,51,0.08)' }}>
      <div style={{ position: 'absolute', inset: 0, padding: '9% 10%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {slide.title && (
          <p style={{ ...ns, fontSize: 8.5, fontWeight: 700, color: slide.textColorOverride ?? theme.titleColor, margin: 0,
            lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {slide.title}
          </p>
        )}
        {slide.points.slice(0, 2).map((pt, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 3, marginTop: 3 }}>
            <div style={{ width: 2.5, height: 2.5, borderRadius: '50%', background: theme.accentColor, marginTop: 2.5, flexShrink: 0 }} />
            <p style={{ ...ns, fontSize: 6, color: slide.textColorOverride ?? theme.titleColor, opacity: 0.75, margin: 0,
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
        <h2 style={{ ...ns, fontSize: 21, fontWeight: 700, color: '#0D1433', marginBottom: 8 }}>Clone your voice</h2>
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
              <span style={{ ...ns, fontSize: 20, fontWeight: 700, color: '#0D1433', fontVariantNumeric: 'tabular-nums' }}>{formatTime(secs)}</span>
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
            <p style={{ ...ns, fontSize: 14.5, fontWeight: 700, color: '#0D1433', margin: 0 }}>&ldquo;Your voice&rdquo; is ready</p>
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
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0D1433' }}>
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
function StudioCanvas({ slides, theme, scripts, onScriptChange, startIdx, audio, onNavigate, cloneName, isGeneratingScript, onGenerateScript, onGenerateAllScripts, onAudioChange, onClone, onRecordDone, onRecordingStart, onTakeInProgressChange, showToast, scriptVisible, onScriptVisibleChange }: {
  slides: PresentationSlide[]; theme: MockTheme; scripts: string[]; onScriptChange: (idx: number, value: string) => void;
  startIdx: number; audio: SlideAudio; onNavigate: (idx: number) => void; cloneName: string | null;
  isGeneratingScript: boolean; onGenerateScript: () => void; onGenerateAllScripts: () => void;
  onAudioChange: (patch: Partial<SlideAudio>) => void; onClone: () => void;
  onRecordDone: (scope: CaptureScope, captureMode: CaptureMode, cameraLayout: CameraLayout, durations: Record<number, number>) => void;
  onRecordingStart?: () => void;
  onTakeInProgressChange?: (inProgress: boolean) => void;
  showToast: (msg: string) => void;
  // Lifted to the parent (see there for why) — a standing preference, not per-take state that
  // should reset on the key={activeIdx} remount this component gets on every slide switch.
  scriptVisible: boolean; onScriptVisibleChange: (v: boolean) => void;
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
  // Left-side panel now, not a bottom pill — resizes by width (drag the right edge) and
  // simply fills the row's full height, so there's no separate max-height ceiling to track
  // the way the old bottom pill needed.
  const [scriptWidth, setScriptWidth] = useState(300);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const studioRef = useRef<HTMLDivElement>(null);
  const topRowRef = useRef<HTMLDivElement>(null);
  const modeRailRef = useRef<HTMLDivElement>(null);
  const actionZoneRef = useRef<HTMLDivElement>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
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

  // Entry setup — decided right here, inline, instead of prior gating screens.
  const [entryMode, setEntryMode] = useState<'record' | 'ai' | 'upload'>('record');
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

  const startScriptResize = (e: React.PointerEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startWidth: scriptWidth };
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!resizeRef.current) return;
      const delta = e.clientX - resizeRef.current.startX;
      setScriptWidth(Math.min(480, Math.max(220, resizeRef.current.startWidth + delta)));
    };
    const up = () => { resizeRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

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
          const t = Math.min(slides.length - 1, idxRef.current + 1);
          if (phase === 'idle') onNavigate(t); else setIdx(t);
        }
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp') {
          const t = Math.max(0, idxRef.current - 1);
          if (phase === 'idle') onNavigate(t); else setIdx(t);
        }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [phase, confirmDiscard, entryMode, slides.length, onNavigate]);

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
    onRecordDone(recordedSlides > 1 ? 'multi' : 'single', captureMode, cameraLayout, durations);
    // Land back in the studio, idle, on the slide the take started on — not handed off to a
    // different view. The now-recorded status row picks up from here.
    setPreviewPlaying(false);
    setPreviewTime(0);
    setElapsed(0);
    setDurations({});
    setIdx(startIdx);
    setPhase('idle');
    setRedoing(false);
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
  const showNextPreview = nextPreviewEnabled && phase !== 'preview' && !!nextSlide && !hasTakeForSizing;

  const slideCellRef = useRef<HTMLDivElement>(null);
  const [slideBox, setSlideBox] = useState({ w: stageMaxWidth, h: stageMaxWidth * 9 / 16 });
  useEffect(() => {
    const el = slideCellRef.current;
    if (!el) return;
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
  const handleRedo = () => {
    setEntryMode(audio.source === 'ai' ? 'ai' : audio.source === 'upload' ? 'upload' : 'record');
    setRedoing(true);
  };
  const handleDeleteTake = () => {
    onAudioChange({ source: 'record', methodSet: false, scopeSet: false, status: 'empty', duration: 0, fileName: undefined, segStart: undefined, segEnd: undefined });
    setRedoing(false);
    showToast('Recording deleted');
  };

  // Setup controls (mode + capture settings) show while nothing's actively happening yet —
  // once you're recording, generating, or uploading, they get out of the way.
  const showModeRail = phase === 'idle' && elapsed === 0 && audio.status !== 'generating' && !uploading;
  // A slide with a take should always be reviewable, not just in the narrow pre-save window —
  // this is the same play/scrub control, just driven by audio.duration instead of elapsed.
  const hasTake = hasTakeForSizing;
  const showRecordFrame = !hasTake && entryMode === 'record' && phase !== 'preview';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
    {/* Countdown covers the whole studio (canvas + action bar), not just the tiny record
        button — a number squeezed into a 52px circle next to the version-switcher pill was
        nearly invisible. This is the moment that matters most, so it gets the whole stage. */}
    <AnimatePresence>
      {phase === 'countdown' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="flex items-center justify-center" style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(10,12,20,0.72)', backdropFilter: 'blur(2px)', borderRadius: 20 }}>
          <motion.span key={countdownN} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.3 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            style={{ ...ns, fontSize: 160, fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: -4 }}>
            {countdownN}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
    <div ref={studioRef} style={{ position: 'relative', width: '100%', flex: 1, minHeight: 0, background: '#0A0C14', borderRadius: 20,
      overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>

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
          border/background) so it reads as part of the same canvas as the slide. Once a take
          exists, this goes away entirely — status, playback, and actions all live on the slide
          itself now (see the overlay below), not in a row that mirrors this picker's position. */}
      {showModeRail && !hasTake && !aiPreview && (
        <div ref={modeRailRef} className="flex items-center justify-center" style={{ flexShrink: 0, padding: '0 28px 16px' }}>
          {/* One shared pill, not three separate buttons — a segmented control reads as
              "pick exactly one of these" the way three independent buttons with gaps don't. */}
          <div className="flex items-center" style={{ background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 4, gap: 2 }}>
            {([['record', 'Record'], ['ai', 'AI voice'], ['upload', 'Upload']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setEntryMode(id)} className="flex items-center cursor-pointer"
                style={{ height: 36, padding: '0 16px', borderRadius: 9, border: 'none', gap: 9, ...ns, fontSize: 13.5, fontWeight: 700,
                  transition: 'background 0.15s, color 0.15s',
                  background: entryMode === id ? '#52565F' : 'transparent',
                  color: entryMode === id ? '#fff' : 'rgba(255,255,255,0.55)' }}>
                {id === 'record' && <MicIcon color={entryMode === id ? '#fff' : 'rgba(255,255,255,0.55)'} />}
                {id === 'ai' && <WordgenieIcon size={14} color={entryMode === id ? '#fff' : 'rgba(255,255,255,0.55)'} />}
                {id === 'upload' && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={entryMode === id ? '#fff' : 'rgba(255,255,255,0.55)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                )}
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Script sits to the left of the slide now, not in a bottom pill — a persistent column
          reads better for longer scripts and doesn't compete with the slide for the same
          vertical space the way a floating strip below it did. */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
        {scriptVisible && !hasTake && (
          <div style={{ flexShrink: 0, width: scriptWidth, position: 'relative', padding: '0 0 0 28px', boxSizing: 'border-box' }}>
            <div style={{ height: '100%', borderRadius: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              padding: '14px 16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="flex items-center justify-between" style={{ flexShrink: 0, marginBottom: 8 }}>
                <div className="flex items-center" style={{ gap: 4 }}>
                  <button onClick={() => setScriptFontSize('sm')} className="cursor-pointer flex items-center justify-center"
                    style={{ width: 24, height: 24, borderRadius: 6, border: 'none', outline: 'none',
                      background: scriptFontSize === 'sm' ? 'rgba(255,255,255,0.14)' : 'transparent',
                      ...ns, fontSize: 10.5, fontWeight: 700, color: scriptFontSize === 'sm' ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                    A
                  </button>
                  <button onClick={() => setScriptFontSize('lg')} className="cursor-pointer flex items-center justify-center"
                    style={{ width: 24, height: 24, borderRadius: 6, border: 'none', outline: 'none',
                      background: scriptFontSize === 'lg' ? 'rgba(255,255,255,0.14)' : 'transparent',
                      ...ns, fontSize: 14, fontWeight: 700, color: scriptFontSize === 'lg' ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                    A
                  </button>
                </div>
                {isGeneratingScript ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 11, height: 11, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#B9A2FF', borderRadius: '50%', display: 'inline-block', animation: 'v2spin 0.8s linear infinite' }} />
                    <span style={{ ...ns, fontSize: 10.5, color: '#B9A2FF' }}>Generating…</span>
                  </div>
                ) : (
                  <GenerateScriptMenu onThisSlide={onGenerateScript} onAllSlides={onGenerateAllScripts} disabled={phase === 'recording'} />
                )}
              </div>
              {/* No overflow on this wrapper — the textarea already scrolls itself natively once
                  its content actually exceeds the available height, so a second `overflow:auto`
                  layer here just meant a scrollbar could appear (or leave a track) even when
                  there was nothing to scroll. */}
              <div style={{ flex: 1, minHeight: 0 }}>
                <textarea value={scripts[idx]} onChange={e => onScriptChange(idx, e.target.value)} readOnly={phase === 'recording'}
                  placeholder="Write what you'll say over this slide…"
                  style={{ ...ns, width: '100%', height: '100%', resize: 'none', background: 'transparent', border: 'none', outline: 'none',
                    fontSize: scriptFontSize === 'sm' ? 13 : 17, color: phase === 'recording' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.9)',
                    lineHeight: 1.7, textAlign: 'left', cursor: phase === 'recording' ? 'default' : 'text' }} />
              </div>
            </div>
            {/* Drag the right edge to resize — mirrors the old bottom pill's drag handle, just
                rotated 90° since the panel now grows sideways instead of vertically. */}
            <div onPointerDown={startScriptResize} className="cursor-ew-resize"
              style={{ position: 'absolute', top: 0, bottom: 0, right: -6, width: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
              <div style={{ width: 4, height: 36, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
            </div>
          </div>
        )}
      <div ref={slideCellRef} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 28px', minHeight: 200, minWidth: 0, overflow: 'hidden', gap: 24 }}>
        {/* The backing panel behind side-by-side (below) already reads as "these two go
            together" — each panel keeps its own normal rounded corners and a real gap, rather
            than flattening into one merged shape. */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: sideBySideVisible ? sbsGap : 20,
          // Sized in exact px from slideBox/sbsCameraW/sbsGap — those are what fit() already
          // solved for to make the whole combined shape 16:9, so re-deriving it here (rather
          // than a CSS aspect-ratio that can't see the same constraints) keeps it in lockstep.
          ...(sideBySideVisible ? { width: slideBox.w + sbsGap + sbsCameraW + 20, height: slideBox.h + 20,
            padding: 10, borderRadius: 18, background: '#12151F', boxSizing: 'border-box' } : {}) }}>
        <AnimatePresence mode="wait">
          <motion.div key={idx} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            style={{ width: slideBox.w, height: slideBox.h, flexShrink: 0, borderRadius: 14, overflow: 'hidden', background: bg, position: 'relative', containerType: 'inline-size',
              // Always on, not just while recording — a dark-themed slide on this dark canvas
              // otherwise has no visible edge at all, border or no recording indicator.
              border: '1px solid rgba(255,255,255,0.14)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)' } as React.CSSProperties}>
            <div style={{ position: 'absolute', inset: 0, padding: '7% 8%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
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
                    background: 'rgba(13,20,51,0.6)', backdropFilter: 'blur(6px)', border: '2px solid rgba(255,255,255,0.9)' }}>
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
          <div style={{ width: sbsCameraW, height: slideBox.h, borderRadius: 14, overflow: 'hidden',
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
            <div style={{ width: 180, aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden',
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
      </div>
    </div>

      {/* Primary action zone. Record mode gets a real 3-column bar — settings on the left,
          the record button dead center, slide nav on the right — so the one action that
          matters isn't off-center next to a lopsided nav cluster. AI/upload/preview stay a
          single centered block; they don't have a left/right pairing to balance against.
          Sits outside the rounded card as a full-bleed bar (negative margins cancel the
          parent's 16px inset) instead of being clipped to the card's rounded corners. */}
      <div ref={actionZoneRef} style={{ flexShrink: 0, margin: '16px -16px -16px', padding: '22px 24px',
        background: 'rgba(255,255,255,0.025)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {hasTake ? (
          /* Re-record/Change type/Delete used to hide behind a "⋯" button floating on the
             slide itself — moved down here as real labeled buttons so they're visible without
             a click, alongside the nav that already lived in this bar. minHeight matches the
             record button's own row height above so this bar sits at the same spot whether or
             not a take exists. */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, minHeight: 52 }}>
            {/* Same neutral pill chrome as Re-record/Change type — reads as a real secondary
                button rather than a bare label — but set apart in its own corner and only
                turning red (background + text) on hover, so it doesn't read as urgent/primary
                just sitting there. */}
            <button onClick={handleDeleteTake} className="cursor-pointer flex items-center"
              style={{ gap: 8, height: 40, padding: '0 18px', borderRadius: 10, border: 'none',
                background: 'rgba(255,255,255,0.06)', ...ns, fontSize: 13.5, fontWeight: 700, color: 'rgba(255,255,255,0.75)',
                transition: 'background 0.15s, color 0.15s', justifySelf: 'start' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(229,72,77,0.14)'; e.currentTarget.style.color = '#E5484D'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
              Remove recording
            </button>
            {/* Centered like the record row above it, and using the same borderless pill
                treatment as the capture-mode/script-toggle buttons in that row rather than the
                bordered chips these started as — reads as one consistent button language. */}
            <div className="flex items-center" style={{ gap: 8, justifySelf: 'center' }}>
              <button onClick={handleRedo} className="cursor-pointer flex items-center"
                style={{ gap: 8, height: 40, padding: '0 18px', borderRadius: 10, border: 'none',
                  background: 'rgba(255,255,255,0.06)', ...ns, fontSize: 13.5, fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v5h5"/>
                </svg>
                {audio.source === 'ai' ? 'Regenerate' : audio.source === 'upload' ? 'Replace file' : 'Re-record'}
              </button>
              <button onClick={() => setRedoing(true)} className="cursor-pointer flex items-center"
                style={{ gap: 8, height: 40, padding: '0 18px', borderRadius: 10, border: 'none',
                  background: 'rgba(255,255,255,0.06)', ...ns, fontSize: 13.5, fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="8" cy="12" r="2.5" fill="currentColor" stroke="none"/>
                </svg>
                Change type
              </button>
            </div>
            {/* Routed through the parent's activeIdx (not local idx) — this state reviews a
                saved take, and each slide's own recorded/idle status lives on the parent, so
                switching slides here has to actually change slide, not just what's on screen. */}
            <div className="flex items-center" style={{ gap: 8, justifySelf: 'end' }}>
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
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 52 }}>
            <div className="flex items-center" style={{ gap: 12 }}>
              {/* Two clusters, split by a divider (Veed's bar does the same) — "how you're
                  viewing this" (transcript/countdown/next-preview) reads as a different kind of
                  control than "what's actually being captured" (mic/camera/layout), so they
                  shouldn't blend into one undifferentiated row of circles. */}
              <div className="flex items-center" style={{ gap: 8 }}>
                {/* Transcript is its own single-click icon, not folded into the settings popover
                    — it's something you reach for per-slide or mid-take, unlike countdown/next-
                    preview which are configured once and left alone, so it shouldn't cost an
                    extra click. Stays available through the whole take. */}
                <button onClick={() => onScriptVisibleChange(!scriptVisible)}
                  className="cursor-pointer flex items-center justify-center relative group"
                  style={{ width: 34, height: 34, borderRadius: 9, border: 'none', flexShrink: 0,
                    background: scriptVisible ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)' }}>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
                      whiteSpace: 'nowrap', background: '#151A28', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7,
                      padding: '5px 9px', ...ns, fontSize: 11.5, fontWeight: 600, color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 20 }}>
                    {scriptVisible ? 'Hide transcript' : 'Show transcript'}
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={scriptVisible ? '#fff' : 'rgba(255,255,255,0.6)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="3" width="16" height="18" rx="2"/>
                    <line x1="8" y1="8" x2="16" y2="8"/>
                    <line x1="8" y1="12" x2="16" y2="12"/>
                    <line x1="8" y1="16" x2="12" y2="16"/>
                  </svg>
                </button>
                {/* Countdown/next-preview are pre-take setup, not something you'd change mid-take
                    (the countdown has already run, and the next-slide preview's whole point is
                    deciding what to glance at before you start) — so this locks (not unmounts)
                    once recording actually begins. Staying mounted keeps the row's width fixed;
                    unmounting it would shift the record button between idle and recording. */}
                <DisplayOptionsMenu disabled={!showModeRail}
                  countdownEnabled={countdownEnabled} onCountdownChange={setCountdownEnabled}
                  nextPreviewEnabled={nextPreviewEnabled} onNextPreviewChange={setNextPreviewEnabled} />
              </div>
              <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />
              <div className="flex items-center" style={{ gap: 8 }}>
                {/* Mic stays live through the whole take, not just setup — muting mid-recording
                    (need to cough, someone walks in) is a real call-control expectation, unlike
                    the camera/layout choice, which still locks in once recording starts since
                    swapping the composition mid-take doesn't make sense. Doesn't gate anything
                    real here (no audio graph to mute in this mock) but it needs to actually
                    respond — a mic icon that looks clickable and isn't is worse than not having
                    the control at all. */}
                <div ref={micPillRef} className="flex items-center" style={{ height: 34, borderRadius: 9, flexShrink: 0,
                  background: micMuted ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.16)' }}>
                  <button onClick={() => setMicMuted(m => !m)}
                    title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                    className="cursor-pointer flex items-center justify-center"
                    style={{ width: 34, height: '100%', border: 'none', background: 'transparent',
                      borderTopLeftRadius: 9, borderBottomLeftRadius: 9 }}>
                    {micMuted ? <MicOffIcon color="rgba(255,255,255,0.6)" /> : <MicIcon color="#fff" />}
                  </button>
                  <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.16)', flexShrink: 0 }} />
                  {/* Stays live through the whole take, same as the mute toggle it's attached to. */}
                  <DeviceMenu kind="audioinput" value={micDeviceId} onChange={setMicDeviceId} rounded="right" openRight={deviceMenuOpensRight} />
                </div>
                {/* Camera also stays mounted (disabled, not removed) once recording starts, for
                    the same row-width-stability reason as the display-options menu above. */}
                <div className="flex items-center" style={{ height: 34, borderRadius: 9, flexShrink: 0,
                  opacity: showModeRail ? 1 : 0.4,
                  background: captureMode === 'video' ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)' }}>
                  <button onClick={() => showModeRail && setCaptureMode(m => m === 'audio' ? 'video' : 'audio')}
                    title={captureMode === 'video' ? 'Turn camera off' : 'Turn camera on'}
                    className={showModeRail ? 'cursor-pointer flex items-center justify-center' : 'flex items-center justify-center'}
                    style={{ width: 34, height: '100%', border: 'none', background: 'transparent',
                      borderTopLeftRadius: 9, borderBottomLeftRadius: 9 }}>
                    {captureMode === 'video'
                      ? <VideoIcon color="#fff" />
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
                          <motion.button key="redo" onClick={handleRerecord} title="Redo take"
                            initial={{ opacity: 0, scale: 0.2, x: 60 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.2, x: 60 }}
                            transition={{ type: 'spring', stiffness: 480, damping: 24 }}
                            className="cursor-pointer flex items-center justify-center"
                            style={{ position: 'absolute', inset: 0, borderRadius: 999, border: 'none', outline: 'none', background: 'rgba(255,255,255,0.12)', cursor: 'pointer' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v5h5"/>
                            </svg>
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                    <button onClick={phase === 'idle' ? handleStart : handlePauseResume}
                      title={phase === 'idle' ? 'Start recording' : phase === 'recording' ? 'Pause' : phase === 'paused' ? 'Resume' : undefined}
                      // Countdown ignores clicks entirely — not just visually disabled, the
                      // handler itself (handlePauseResume) no-ops for phase 'countdown', so
                      // there's no way to skip ahead into recording early.
                      className={phase === 'countdown' ? 'flex items-center justify-center flex-shrink-0' : 'cursor-pointer flex items-center justify-center flex-shrink-0'}
                      style={{ width: 52, height: 52, borderRadius: '50%', border: 'none', outline: 'none',
                        background: phase === 'recording' ? '#E5484D' : phase === 'countdown' ? 'rgba(255,255,255,0.12)' : '#fff',
                        boxShadow: phase === 'recording' ? '0 0 0 7px rgba(229,72,77,0.22)' : phase === 'countdown' ? 'none' : '0 0 0 5px rgba(255,255,255,0.1)',
                        cursor: phase === 'countdown' ? 'default' : 'pointer',
                        transition: 'all 0.2s' }}>
                      {phase === 'idle' || phase === 'countdown'
                        ? <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#E5484D', display: 'block' }} />
                        : phase === 'recording'
                          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>
                          : <svg width="14" height="14" viewBox="0 0 24 24" fill="#E5484D" style={{ marginLeft: 2 }}><path d="M6 4l14 8-14 8z"/></svg>}
                    </button>
                    <div style={{ width: 36, height: 36, flexShrink: 0, position: 'relative' }}>
                      <AnimatePresence>
                        {(phase === 'recording' || phase === 'paused') && (
                          <motion.button key="stop" onClick={handleStop} title="Stop"
                            initial={{ opacity: 0, scale: 0.2, x: -60 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.2, x: -60 }}
                            transition={{ type: 'spring', stiffness: 480, damping: 24 }}
                            className="cursor-pointer flex items-center justify-center"
                            style={{ position: 'absolute', inset: 0, borderRadius: 999, border: 'none', outline: 'none', background: 'rgba(255,255,255,0.12)', cursor: 'pointer' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
                          </motion.button>
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
              <button onClick={() => { const t = Math.min(slides.length - 1, idx + 1); phase === 'idle' ? onNavigate(t) : setIdx(t); }} disabled={idx === slides.length - 1}
                className="cursor-pointer flex items-center justify-center"
                style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: 'rgba(255,255,255,0.06)', opacity: idx === slides.length - 1 ? 0.3 : 1 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
          </div>
          </>
        ) : (
          // Matches the record row's minHeight so the bar reads the same height across Record,
          // AI voice, and Upload instead of shrinking/growing with whatever content happens to
          // be in this state.
          <div className="flex flex-col items-center justify-center" style={{ gap: 12, minHeight: 52 }}>
            {entryMode === 'ai' ? (
              audio.status === 'generating' ? (
                <div className="flex items-center justify-center" style={{ gap: 8, height: 40 }}>
                  <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#B9A2FF', borderRadius: '50%', display: 'inline-block', animation: 'v2spin 0.8s linear infinite' }} />
                  <span style={{ ...ns, fontSize: 12.5, color: '#B9A2FF', fontWeight: 600 }}>Generating…</span>
                </div>
              ) : aiPreview ? (
                /* Same review moment a recording gets — the take is already playable on the
                   slide above (scrim + play + scrubber), this row is just the two decisions
                   left: keep this voice's take, or go back and pick a different voice. */
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <button onClick={changeVoiceFromPreview} className="cursor-pointer"
                    style={{ height: 42, padding: '0 22px', borderRadius: 999, border: '1.5px solid rgba(255,255,255,0.25)', background: 'transparent', ...ns, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', outline: 'none' }}>
                    Change voice
                  </button>
                  <button onClick={saveAiTake} className="cursor-pointer"
                    style={{ height: 42, padding: '0 26px', borderRadius: 999, border: 'none', background: '#fff', ...ns, fontSize: 13, fontWeight: 700, color: '#0D1433', cursor: 'pointer', outline: 'none' }}>
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex items-center" style={{ gap: 10 }}>
                  <button onClick={() => setVoicePickerOpen(true)} className="cursor-pointer flex items-center"
                    style={{ gap: 8, height: 40, padding: '0 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)',
                      background: 'rgba(255,255,255,0.05)', ...ns, fontSize: 13, fontWeight: 700, color: '#fff' }}>
                    <WordgenieIcon size={13} color="rgba(255,255,255,0.55)" />
                    {voiceName(audio.voiceId, cloneName)}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <button onClick={generateAiAudio} className="cursor-pointer"
                    style={{ height: 40, padding: '0 24px', borderRadius: 999, border: 'none', background: '#006EFE', ...ns, fontSize: 13.5, fontWeight: 700, color: '#fff' }}>
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
                  style={{ gap: 8, width: '100%', maxWidth: 420, height: 52, borderRadius: 12,
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
                  style={{ height: 42, padding: '0 22px', borderRadius: 999, border: '1.5px solid rgba(255,255,255,0.25)', background: 'transparent', ...ns, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', outline: 'none' }}>
                  Re-record
                </button>
                <button onClick={handleDone} className="cursor-pointer"
                  style={{ height: 42, padding: '0 26px', borderRadius: 999, border: 'none', background: '#fff', ...ns, fontSize: 13, fontWeight: 700, color: '#0D1433', cursor: 'pointer', outline: 'none' }}>
                  Save
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {confirmDiscard && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, background: 'rgba(5,7,14,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
              style={{ background: '#151A28', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '26px 26px 22px', width: 340, textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
              <p style={{ ...ns, fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Discard this recording?</p>
              <p style={{ ...ns, fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '0 0 22px', lineHeight: 1.5 }}>
                {phase === 'preview' ? "You'll lose this take — it hasn't been saved yet." : "You'll lose what you've recorded so far."}
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => setConfirmDiscard(false)} className="cursor-pointer"
                  style={{ height: 40, padding: '0 20px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', ...ns, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)', cursor: 'pointer', outline: 'none' }}>
                  Keep editing
                </button>
                <button onClick={confirmedDiscard} className="cursor-pointer"
                  style={{ height: 40, padding: '0 20px', borderRadius: 999, border: 'none', background: '#E5484D', ...ns, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', outline: 'none' }}>
                  Discard
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {voicePickerOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setVoicePickerOpen(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(5,7,14,0.65)', backdropFilter: 'blur(3px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
              onClick={e => e.stopPropagation()}
              style={{ background: '#171C2B', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 22, padding: 24, width: 428, boxShadow: '0 32px 70px rgba(0,0,0,0.55)' }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                <div>
                  <p style={{ ...ns, fontSize: 16.5, fontWeight: 700, color: '#fff', margin: 0 }}>Choose a voice</p>
                  <p style={{ ...ns, fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>Pick a voice, then tune its pace below</p>
                </div>
                <button onClick={() => setVoicePickerOpen(false)} className="cursor-pointer flex items-center justify-center"
                  style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', outline: 'none', flexShrink: 0, transition: 'background 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <VoiceList value={audio.voiceId} cloneName={cloneName} onChange={id => onAudioChange({ voiceId: id })} onClone={onClone} dark layout="grid" />
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '12px 14px', marginTop: 14 }}>
                <TuningSlider label="Speed" value={voiceSpeed} onChange={setVoiceSpeed} leftLabel="Slower" rightLabel="Faster" />
              </div>
              <button onClick={() => setVoicePickerOpen(false)} className="cursor-pointer"
                style={{ width: '100%', height: 42, borderRadius: 999, border: 'none', background: '#006EFE', ...ns, fontSize: 13.5, fontWeight: 700, color: '#fff', marginTop: 14, transition: 'background 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#0060E0'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
            color: value === o.id ? '#0D1433' : '#8596AD',
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
  const c = dark
    ? { selBg: 'rgba(0,110,254,0.16)', hoverBg: 'rgba(255,255,255,0.06)', radioOff: 'rgba(255,255,255,0.3)',
        name: '#fff', accent: 'rgba(255,255,255,0.4)', previewBorder: 'rgba(255,255,255,0.2)', previewBg: 'rgba(255,255,255,0.08)',
        previewPlayingBg: '#006EFE', previewIcon: 'rgba(255,255,255,0.55)', divider: 'rgba(255,255,255,0.1)', muted: 'rgba(255,255,255,0.6)' }
    : { selBg: '#F0F6FF', hoverBg: '#F4F6F9', radioOff: '#C8CDD9',
        name: '#0D1433', accent: '#B0BACB', previewBorder: '#E0E5EB', previewBg: '#fff',
        previewPlayingBg: '#0D1433', previewIcon: '#8596AD', divider: '#EEF1F6', muted: '#52637A' };

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
              className="w-full flex items-center cursor-pointer relative"
              style={{ gap: 10, padding: '10px 12px', borderRadius: 12, outline: 'none',
                border: `1.5px solid ${sel ? '#006EFE' : 'transparent'}`,
                background: sel ? c.selBg : 'rgba(255,255,255,0.03)', transition: 'background 0.15s, border-color 0.15s' }}
              onMouseEnter={e => { if (!sel) e.currentTarget.style.background = c.hoverBg; }}
              onMouseLeave={e => { e.currentTarget.style.background = sel ? c.selBg : 'rgba(255,255,255,0.03)'; }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: VOICE_AVATAR_GRADIENT[v.id] ?? 'linear-gradient(135deg, #64748B, #475569)',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ ...ns, fontSize: 14, fontWeight: 700, color: '#fff' }}>{v.name.charAt(0)}</span>
              </span>
              <div className="flex flex-col items-start" style={{ minWidth: 0, flex: 1 }}>
                <span style={{ ...ns, fontSize: 13, fontWeight: sel ? 700 : 600, color: c.name, whiteSpace: 'nowrap' }}>{v.name}</span>
                <span style={{ ...ns, fontSize: 11, color: c.accent, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.accent}</span>
              </div>
              <span onClick={e => preview(e, v.id)}
                className="cursor-pointer flex items-center justify-center flex-shrink-0"
                style={{ width: 28, height: 28, borderRadius: '50%',
                  border: `1.5px solid ${prev ? '#006EFE' : 'rgba(255,255,255,0.2)'}`,
                  background: prev ? '#006EFE' : 'rgba(255,255,255,0.06)', transition: 'all 0.15s' }}>
                {prev
                  ? <svg width="9" height="9" viewBox="0 0 24 24" fill="white"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>
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
                border: `2px solid ${sel ? '#006EFE' : c.radioOff}`, background: sel ? '#006EFE' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {sel && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />}
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
          <button onClick={onClone} className="w-full flex items-center cursor-pointer"
            style={{ gap: 10, padding: '10px 12px', borderRadius: 12, marginTop: 12,
              border: '1.5px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', outline: 'none',
              transition: 'background 0.15s, border-color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = c.hoverBg; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}>
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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

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
            style={{ position: 'absolute', top: 'calc(100% + 5px)', right: 0, zIndex: 50, background: '#fff',
              border: '1px solid #E8EBF2', borderRadius: 9, boxShadow: '0 8px 24px rgba(15,23,51,0.12)', padding: 5, width: 150 }}>
            {all.map(s => (
              <button key={s} onClick={() => { onSwitch(s); setOpen(false); }}
                className="w-full flex items-center cursor-pointer"
                style={{ gap: 8, padding: '7px 9px', borderRadius: 6, border: 'none',
                  background: s === current ? '#F4F6F9' : 'transparent', transition: 'background 0.1s' }}
                onMouseEnter={e => { if (s !== current) e.currentTarget.style.background = '#F4F6F9'; }}
                onMouseLeave={e => { e.currentTarget.style.background = s === current ? '#F4F6F9' : 'transparent'; }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: SOURCE_COLORS[s], flexShrink: 0 }} />
                <span style={{ ...ns, fontSize: 12, fontWeight: s === current ? 700 : 500, color: '#0D1433' }}>{labels[s]}</span>
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
              <span style={{ ...ns, fontSize: 15, fontWeight: 700, color: '#0D1433' }}>{voiceName(audio.voiceId, cloneName)}</span>
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
                    <span style={{ ...ns, fontSize: 15, fontWeight: 700, color: '#0D1433' }}>{voiceName(audio.voiceId, cloneName)}</span>
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
          {audio.source === 'ai' && <button onClick={generate} className="cursor-pointer" style={{ ...btnGhost, height: 28, padding: '0 12px', fontSize: 12, fontWeight: 700, color: '#0D1433' }}>Regenerate</button>}
          {audio.source === 'record' && <button onClick={onStartRecord} className="cursor-pointer" style={{ ...btnGhost, height: 28, padding: '0 12px', fontSize: 12, fontWeight: 700, color: '#0D1433' }}>Re-record</button>}
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
    <div className="h-full flex flex-col" style={{ background: '#EBEDF2' }}>
      <div className="flex-shrink-0 flex items-center justify-between"
        style={{ height: 54, padding: '0 20px', borderBottom: '1px solid #E8EBF2', background: '#fff' }}>
        <div className="flex items-center" style={{ gap: 4 }}>
          <button onClick={onToggleSidebar}
            className="flex-shrink-0 rounded-lg hover:bg-[#F6F7F9] transition-colors cursor-pointer flex items-center justify-center"
            style={{ width: 40, height: 40 }}>
            <SideMenuIcon active={sidebarOpen} />
          </button>
          <button onClick={onBack} className="flex items-center cursor-pointer"
            style={{ gap: 6, height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', ...ns, fontSize: 13, fontWeight: 500, color: '#52637A' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Studio
          </button>
        </div>
        <span style={{ ...ns, fontSize: 14, fontWeight: 700, color: '#0D1433' }}>Preview</span>
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
  const formatMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!formatMenuOpen) return;
    const h = (e: MouseEvent) => { if (formatMenuRef.current && !formatMenuRef.current.contains(e.target as Node)) setFormatMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [formatMenuOpen]);

  const handleDownload = (fmt: ExportFormat) => {
    setSelectedFormat(fmt);
    setFormatMenuOpen(false);
    setDownloaded(false);
    setDownloading(true);
    setTimeout(() => { setDownloading(false); setDownloaded(true); }, 1400);
  };

  if (!done) {
    return (
      <div className="h-full flex flex-col items-center justify-center" style={{ background: '#F8F9FC', gap: 24, padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 560 }}>
          <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', boxShadow: '0 16px 48px rgba(15,23,51,0.16)' }}>
            <SlideThumb slide={slides[0]} theme={theme} width={560} />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,20,51,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 36, height: 36, border: '3.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'v2spin 0.8s linear infinite' }} />
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center" style={{ gap: 10, width: 320 }}>
          <div style={{ width: '100%', height: 6, borderRadius: 3, background: '#E8EBF2', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#006EFE', borderRadius: 3, transition: 'width 0.12s' }} />
          </div>
          <p style={{ ...ns, fontSize: 13, color: '#52637A' }}>Rendering narrated video… mixing {slides.length} audio tracks</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: '#fff' }}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between" style={{ height: 54, padding: '0 20px', borderBottom: '1px solid #E8EBF2' }}>
        <div className="flex items-center" style={{ gap: 4 }}>
          <button onClick={onToggleSidebar}
            className="flex-shrink-0 rounded-lg hover:bg-[#F6F7F9] transition-colors cursor-pointer flex items-center justify-center"
            style={{ width: 40, height: 40 }}>
            <SideMenuIcon active={sidebarOpen} />
          </button>
          <button onClick={onBack} className="flex items-center cursor-pointer"
            style={{ gap: 6, height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', ...ns, fontSize: 13, fontWeight: 500, color: '#52637A' }}>
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
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#fff', border: '1px solid #E0E5EB', borderRadius: 10,
              boxShadow: '0 8px 24px rgba(15,23,51,0.14)', minWidth: 200, zIndex: 50, overflow: 'hidden' }}>
              {EXPORT_FORMATS.map((fmt, i) => (
                <button key={fmt.id} onClick={() => handleDownload(fmt.id)}
                  style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '10px 14px',
                    background: '#fff', border: 'none', borderBottom: i < EXPORT_FORMATS.length - 1 ? '1px solid #F0F2F5' : 'none', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F8F9FC'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                  <span style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#15191F' }}>{fmt.label}</span>
                  <span style={{ ...ns, fontSize: 11, color: '#8596AD' }}>{fmt.sub}</span>
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
            <h1 style={{ ...ns, fontSize: 26, fontWeight: 700, color: '#0D1433', lineHeight: 1.3, marginBottom: 24 }}>
              {title || 'Untitled presentation'}
            </h1>
            <div style={{ height: 1, background: '#E8EBF2', marginBottom: 28 }} />

            <div style={{ marginBottom: 20 }}>
              <label style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#52637A', display: 'block', marginBottom: 8 }}>Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                style={{ ...ns, fontSize: 14, color: '#15191F', width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #E0E5EB', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => { e.target.style.borderColor = '#006EFE'; }}
                onBlur={e => { e.target.style.borderColor = '#E0E5EB'; }} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#52637A', display: 'block', marginBottom: 8 }}>Description</label>
              <div style={{ position: 'relative' }}>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Enter a description…"
                  style={{ ...ns, fontSize: 14, color: '#15191F', width: '100%', minHeight: 120, padding: '12px 14px', borderRadius: 10, border: '1px solid #E0E5EB', background: '#fff', resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box' }}
                  onFocus={e => { e.target.style.borderColor = '#006EFE'; }}
                  onBlur={e => { e.target.style.borderColor = '#E0E5EB'; }} />
                <button style={{ position: 'absolute', bottom: 12, right: 12, gap: 4, ...ns, fontSize: 12, fontWeight: 600, background: 'linear-gradient(235deg, #006EFE, #5326BD)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  Write with AI
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <defs><linearGradient id="v2ExportAiGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#006EFE"/><stop offset="100%" stopColor="#5326BD"/></linearGradient></defs>
                    <path d="M12 3L13.5 9L19 12L13.5 15L12 21L10.5 15L5 12L10.5 9Z" fill="url(#v2ExportAiGrad)"/>
                  </svg>
                </button>
              </div>
            </div>

            <label className="flex items-center cursor-pointer" style={{ gap: 10 }}>
              <div onClick={() => setSaveToProjects(v => !v)}
                style={{ width: 16, height: 16, borderRadius: 3, border: saveToProjects ? 'none' : '1.5px solid #C5CDD9', background: saveToProjects ? '#006EFE' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                {saveToProjects && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6.5l2.8 2.5 5-5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <span style={{ ...ns, fontSize: 14, color: '#15191F' }}>Save to My Projects</span>
            </label>

            {downloaded && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                style={{ marginTop: 24, padding: '14px 16px', borderRadius: 10, background: '#F0FDF4', border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 12.5l5 5L20 7" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <div>
                  <p style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#065F46', margin: 0 }}>Export complete</p>
                  <p style={{ ...ns, fontSize: 12, color: '#10B981', margin: 0 }}>{saveToProjects ? 'Saved to your projects and downloaded.' : 'File downloaded.'}</p>
                </div>
              </motion.div>
            )}
          </div>

          {/* Right col: cover preview */}
          <div style={{ width: 320, flexShrink: 0 }}>
            <p style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#52637A', marginBottom: 12 }}>Preview</p>
            <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 16px rgba(15,23,51,0.1)' }}>
              <SlideThumb slide={slides[0]} theme={theme} width={320} />
            </div>
            <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: '#F8F9FC', border: '1px solid #E8EBF2' }}>
              <div className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8596AD" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M8 12h8M8 9h5"/></svg>
                <span style={{ ...ns, fontSize: 13, color: '#52637A' }}>{slides.length} slides</span>
              </div>
              <div className="flex items-center" style={{ gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8596AD" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
                <span style={{ ...ns, fontSize: 13, color: '#52637A' }}>{selectedFormat === 'html5' ? 'HTML5' : 'MP4'} · {formatTime(totalSecs)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
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
  const sourceColor = SOURCE_COLORS[audio.source];
  const dotColor =
    !audio.methodSet ? null :
    audio.status === 'stale'      ? '#F4B740' :
    audio.status === 'ready'      ? sourceColor :
    audio.status === 'generating' ? sourceColor :
    '#C8CDD9';
  const noTranscript = !script.trim();
  const hasTake = audio.status === 'ready' || audio.status === 'stale';

  const thumbWidth = 148;

  return (
    <button onClick={onClick} className="group" style={{ width: '100%', background: 'transparent', border: 'none', padding: '5px 10px', cursor: 'pointer' }}>
      <div style={{ position: 'relative', width: thumbWidth }}>
        <div className={isActive ? '' : 'transition-shadow'}
          style={{ borderRadius: 9, overflow: 'hidden',
            boxShadow: isActive ? '0 0 0 2.5px #006EFE, 0 0 0 5.5px rgba(0,110,254,0.16)' : '0 0 0 0 transparent' }}
          onMouseEnter={e => { if (!isActive) e.currentTarget.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.35)'; }}
          onMouseLeave={e => { if (!isActive) e.currentTarget.style.boxShadow = '0 0 0 0 transparent'; }}>
          <SlideThumb slide={slide} theme={theme} width={thumbWidth} />
        </div>
        <div style={{ position: 'absolute', top: 4, right: 4 }}>
          {audio.status === 'generating' ? (
            <div style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid #E0E8FF', borderTopColor: sourceColor, animation: 'v2spin 0.8s linear infinite', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
          ) : dotColor ? (
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
          ) : null}
        </div>
        {audio.methodSet && audio.source === 'record' && audio.captureMode === 'video' && (
          <div style={{ position: 'absolute', bottom: 4, left: 4, width: 16, height: 16, borderRadius: 5,
            background: 'rgba(13,20,51,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
            </svg>
          </div>
        )}
        {hasTake && audio.duration > 0 && (
          <div style={{ position: 'absolute', bottom: 4, right: 4, padding: '1px 5px', borderRadius: 4,
            background: 'rgba(13,20,51,0.75)', ...ns, fontSize: 8.5, fontWeight: 700, color: '#fff' }}>
            {formatTime(audio.duration)}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between" style={{ margin: '5px 0 0' }}>
        <span style={{ ...ns, fontSize: 10.5, fontWeight: isActive ? 700 : 500,
          color: isActive ? '#006EFE' : '#8596AD' }}>
          {idx + 1}
        </span>
        {noTranscript && (
          <span style={{ ...ns, fontSize: 9, fontWeight: 600, color: '#D68A1B' }}>No transcript</span>
        )}
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
    <div style={{ width: 44, flexShrink: 0, background: '#0A0C14', borderRight: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 9, overflowY: 'auto' }}>
      <button onClick={onExpand} title="Show all slides" className="cursor-pointer flex items-center justify-center flex-shrink-0"
        style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)', marginBottom: 5, transition: 'background 0.12s' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      {slides.map((s, i) => {
        const audio = audios[i];
        const sourceColor = SOURCE_COLORS[audio.source];
        // Plain light-gray rectangles, not abstract numbered dots and not real content either —
        // real slide text is illegible at this scale and just reads as a smudge. A colored ring
        // signals status (blue = active, source color = recorded).
        const filled = audio.methodSet && (audio.status === 'ready' || audio.status === 'generating' || audio.status === 'stale');
        const fillColor = audio.status === 'stale' ? '#F4B740' : sourceColor;
        const isActive = i === activeIdx;
        const ringColor = isActive ? '#006EFE' : filled ? fillColor : null;
        return (
          <button key={s.id} onClick={() => onSelect(i)} title={s.title ? `Slide ${i + 1}: ${s.title}` : `Slide ${i + 1}`}
            className="cursor-pointer flex-shrink-0" style={{ padding: 0, border: 'none', background: 'transparent' }}>
            <div className="transition-shadow" style={{ width: 30, height: 16.9, borderRadius: 4, background: 'rgba(216,220,227,0.7)',
              boxShadow: ringColor ? `0 0 0 2px ${ringColor}` : '0 0 0 1.5px rgba(255,255,255,0.25)' }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.boxShadow = `0 0 0 1.5px ${filled ? fillColor : 'rgba(255,255,255,0.5)'}`; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = ringColor ? `0 0 0 2px ${ringColor}` : '0 0 0 1.5px rgba(255,255,255,0.25)'; }} />
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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', opacity: disabled ? 0.4 : 1 }}>
      <button onClick={() => !disabled && setOpen(o => !o)} className={disabled ? 'flex items-center' : 'flex items-center cursor-pointer'}
        style={{ height: 34, padding: '0 13px', borderRadius: 9, border: 'none', gap: 7,
          background: open ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
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
            style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, zIndex: 50,
              background: '#151A28', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14,
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
        <div style={{ position: 'absolute', right: 4, bottom: 4, width: 18, height: 18, borderRadius: '50%', background: '#0A0C14' }} />
      </div>
    );
  }
  return (
    <div style={{ width: 76, height: 46, borderRadius: 6, overflow: 'hidden', display: 'flex', gap: 2, flexShrink: 0 }}>
      <div style={{ flex: 1, background: '#fff' }} />
      <div style={{ width: 22, background: '#0A0C14' }} />
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
              background: '#151A28', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const rows = [
    { label: 'Countdown', checked: countdownEnabled, onChange: () => onCountdownChange(!countdownEnabled) },
    { label: 'Next slide preview', checked: nextPreviewEnabled, onChange: () => onNextPreviewChange(!nextPreviewEnabled) },
  ];

  return (
    <div ref={ref} style={{ position: 'relative', opacity: disabled ? 0.4 : 1 }}>
      <button onClick={() => !disabled && setOpen(o => !o)} title="Display options"
        className={disabled ? 'flex items-center justify-center' : 'cursor-pointer flex items-center justify-center'}
        style={{ width: 34, height: 34, borderRadius: 9, border: 'none', flexShrink: 0,
          background: open ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)' }}>
        <DisplayOptionsIcon color={open ? '#fff' : 'rgba(255,255,255,0.6)'} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, zIndex: 50,
              background: '#151A28', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
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
function TuningSlider({ label, value, onChange, leftLabel, rightLabel }: {
  label: string; value: number; onChange: (v: number) => void; leftLabel: string; rightLabel: string;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ ...ns, fontSize: 11.5, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{label}</div>
      <input type="range" min={0} max={100} value={value} onChange={e => onChange(Number(e.target.value))}
        className="cursor-pointer" style={{ width: '100%', accentColor: '#006EFE', display: 'block' }} />
      <div className="flex items-center justify-between" style={{ marginTop: 2 }}>
        <span style={{ ...ns, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{leftLabel}</span>
        <span style={{ ...ns, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{rightLabel}</span>
      </div>
    </div>
  );
}

function MicIcon({ color = '#fff' }: { color?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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


/* Apply-to-all prompt — shown after the first method is chosen */

function GenerateScriptMenu({ onThisSlide, onAllSlides, disabled }: { onThisSlide: () => void; onAllSlides: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  // Disabled while recording — same trigger, just dimmed and inert, instead of swapping in a
  // separate "Locked while recording" label that jumped the layout and read as a different control.
  const color = disabled ? 'rgba(255,255,255,0.3)' : '#B9A2FF';
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => !disabled && setOpen(o => !o)} disabled={disabled} className="flex items-center"
        style={{ gap: 5, border: 'none', background: 'transparent', padding: 0, ...ns, fontSize: 11, fontWeight: 500, cursor: disabled ? 'default' : 'pointer' }}>
        {/* The Wordgenie brand mark is a fixed multi-color gradient, so pairing it with a
            solid-color label would still leave icon and text mismatched. Using a plain
            single-color sparkle here instead — same color as the text, both dark-mode safe. */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill={color}><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z"/></svg>
        <span style={{ color }}>
          Generate script
        </span>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <AnimatePresence>
        {open && !disabled && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            style={{ position: 'absolute', top: 'calc(100% + 5px)', right: 0, zIndex: 50, background: '#151A28',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, boxShadow: '0 20px 50px rgba(0,0,0,0.5)', padding: 5, width: 160 }}>
            {[
              { label: 'This slide', action: onThisSlide },
              { label: 'All slides', action: onAllSlides },
            ].map(item => (
              <button key={item.label} onClick={() => { item.action(); setOpen(false); }}
                className="w-full text-left cursor-pointer"
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
              <GenerateScriptMenu onThisSlide={onGenerateScript} onAllSlides={onGenerateAllScripts} />
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
   Main V2 view
   ════════════════════════════════════════════════════════════════ */
export default function NarrationViewV4() {
  const router = useRouter();
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

  const [step, setStep] = useState<Step>('workspace');
  const [scripts, setScripts] = useState<string[]>(() => slides.map(s => s.notes ?? scriptFromSlide(s)));
  const [audios, setAudios] = useState<SlideAudio[]>(() =>
    slides.map(() => freshAudio(AI_VOICES[0].id))
  );
  const [defaultVoice, setDefaultVoice] = useState(AI_VOICES[0].id);
  const [cloneName, setCloneName] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  // Studio mode dominates for any slide with no method chosen yet — the whole workspace
  // becomes the studio instead of an editor with a studio panel bolted to the side.
  // Filmstrip starts expanded — you see the whole deck up front. It collapses to a slim rail
  // the moment you actually start recording, so the canvas gets the room back once it matters.
  const [filmstripPeek, setFilmstripPeek] = useState(true);
  // Lives here, not as local state inside StudioCanvas — StudioCanvas remounts on every slide
  // switch (key={activeIdx}, so its own per-take state like phase/elapsed resets cleanly), but
  // script visibility is a standing preference, not per-take state. Closing it on slide 1 and
  // switching to slide 2 should leave it closed, not silently reopen it via the remount.
  const [scriptVisible, setScriptVisible] = useState(true);
  // Preview/Export disable themselves while the studio has an unsaved take in flight, so a
  // stray click can't interrupt a recording or export around it mid-take.
  const [takeInProgress, setTakeInProgress] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);

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
      setScripts(prev => prev.map((s, j) => j === i ? expandScript(s, slides[j]) : s));
      setScriptGenerating(prev => prev.map((v, j) => j === i ? false : v));
      setAudios(prev => prev.map((a, j) => j === i && (a.status === 'ready' || a.status === 'stale') ? { ...a, status: 'stale' } : a));
    }, 900 + Math.random() * 500);
  }, [slides]);

  const generateAllScripts = useCallback(() => {
    slides.forEach((_, i) => {
      setScriptGenerating(prev => prev.map((v, j) => j === i ? true : v));
      setTimeout(() => {
        setScripts(prev => prev.map((s, j) => j === i ? expandScript(s, slides[j]) : s));
        setScriptGenerating(prev => prev.map((v, j) => j === i ? false : v));
      }, 600 + i * 300 + Math.random() * 300);
    });
    showToast('Generating scripts for all slides…');
  }, [slides, showToast]);

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
  const handleRecordDone = (scope: CaptureScope, captureMode: CaptureMode, cameraLayout: CameraLayout, durations: Record<number, number>) => {
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
    // Slides before that are left alone entirely, and among the covered ones, an existing
    // recorded take is also left untouched (AI voice and empty slides get filled in).
    setAudios(slides.map((_, i) => {
      if (scope === 'multi' && i < startedIdx) return audios[i];
      const alreadyRecorded = scope === 'multi' && audios[i].source === 'record' && (audios[i].status === 'ready' || audios[i].status === 'stale');
      if (alreadyRecorded) return audios[i];
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
    <div className="h-full flex flex-col" style={{ background: studioMode ? '#0A0C14' : '#EBEDF2' }}>
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
          background: studioMode ? '#0A0C14' : '#fff', zIndex: 10 }}>
        <div className="flex items-center" style={{ gap: 10 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className={studioMode ? 'flex-shrink-0 rounded-lg cursor-pointer flex items-center justify-center' : 'flex-shrink-0 rounded-lg hover:bg-[#F6F7F9] transition-colors cursor-pointer flex items-center justify-center'}
            style={{ width: 40, height: 40, background: 'transparent',
              filter: studioMode ? 'invert(1) grayscale(1) brightness(1.7)' : undefined }}>
            <SideMenuIcon active={sidebarOpen} />
          </button>
          <button onClick={() => router.push('/presentation/editor')} className="flex items-center cursor-pointer"
            style={{ gap: 6, height: 34, padding: '0 13px', borderRadius: 8,
              border: studioMode ? '1px solid rgba(255,255,255,0.14)' : '1px solid #E0E5EB',
              background: studioMode ? 'rgba(255,255,255,0.06)' : '#fff', ...ns, fontSize: 13, fontWeight: 500,
              color: studioMode ? 'rgba(255,255,255,0.75)' : '#52637A' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Presentation editor
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
              style={{ height: 36, padding: '0 16px', borderRadius: 9,
                border: studioMode ? '1px solid rgba(255,255,255,0.14)' : '1px solid #E0E5EB',
                background: studioMode ? 'rgba(255,255,255,0.06)' : '#fff', ...ns, fontSize: 13, fontWeight: 600,
                color: includedCount > 0 && !takeInProgress ? (studioMode ? '#fff' : '#15191F') : (studioMode ? 'rgba(255,255,255,0.3)' : '#B8C0CC'),
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
              background: studioMode ? '#12151F' : '#fff',
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

        {studioMode ? (
          /* Studio canvas — setup and recording are the same continuous view, no hand-off */
          <div style={{ flex: 1, minHeight: 0, minWidth: 0, padding: 16, background: '#0A0C14' }}>
            <StudioCanvas key={activeIdx} slides={slides} theme={theme} scripts={scripts}
              onScriptChange={(i, v) => setScripts(prev => prev.map((s, j) => j === i ? v : s))}
              startIdx={activeIdx}
              audio={audios[activeIdx]}
              onNavigate={setActiveIdx}
              cloneName={cloneName}
              isGeneratingScript={scriptGenerating[activeIdx] ?? false}
              onGenerateScript={() => generateScript(activeIdx)}
              onGenerateAllScripts={generateAllScripts}
              onAudioChange={patch => patchAudio(activeIdx, patch)}
              onClone={() => setStep('clone')}
              onRecordDone={handleRecordDone}
              onRecordingStart={() => setFilmstripPeek(false)}
              onTakeInProgressChange={setTakeInProgress}
              showToast={showToast}
              scriptVisible={scriptVisible} onScriptVisibleChange={setScriptVisible} />
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
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
              background: '#0D1433', color: '#fff', borderRadius: 10, padding: '10px 18px',
              ...ns, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(15,23,51,0.28)' }}>
            {toast}
          </motion.div>
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
