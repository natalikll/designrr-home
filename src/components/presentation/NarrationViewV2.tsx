'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { usePresentationFlowStore, type PresentationSlide } from '@/stores/presentationFlowStore';
import { MOCK_THEMES, type MockTheme } from '@/lib/presentationMocks';
import { useFlowStore } from '@/stores/flowStore';
import { useVideoFlowStore } from '@/stores/videoFlowStore';
import { SideMenuIcon } from '@/components/sidebar/AppSidebar';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

/* ─────────────────────────────────────────────────────────────────
   V2 concept: narration studio — see the slide, then decide how to
   narrate it. No upfront method commitment. Per-slide control with
   a one-tap "apply to all" shortcut after the first choice.
   ───────────────────────────────────────────────────────────────── */

type SourceKind = 'ai' | 'record' | 'upload';
const SOURCE_COLORS: Record<SourceKind, string> = { record: '#E5484D', ai: '#7C3AED', upload: '#0FA47C' };
type AudioStatus = 'empty' | 'generating' | 'recording' | 'ready' | 'stale';
type Step = 'clone' | 'sync' | 'workspace' | 'review' | 'export';
type CaptureScope = 'single' | 'multi';

interface SlideAudio {
  source: SourceKind;
  methodSet: boolean;   // false = user hasn't chosen yet → show MethodPicker
  scopeSet: boolean;    // false = method chosen but scope hasn't → show ScopeChoice
  scope: CaptureScope;
  voiceId: string;
  status: AudioStatus;
  duration: number;
  fileName?: string;
  segStart?: number;
  segEnd?: number;
}

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
   Full-upload sync screen
   ════════════════════════════════════════════════════════════════ */
const SEG_COLORS  = ['#E7F0FF', '#F3EDFF', '#E9F9F3', '#FFF3E8', '#FDEBF1', '#EDF6FF'];
const SEG_ACCENTS = ['#006EFE', '#7C3AED', '#0FA47C', '#E86A2B', '#D6336C', '#2E90FA'];

function SyncScreen({ slides, theme, scripts, seedDurations, onApply, onBack }: {
  slides: PresentationSlide[]; theme: MockTheme; scripts: string[]; seedDurations?: number[];
  onApply: (segments: { start: number; end: number }[]) => void; onBack: () => void;
}) {
  const estimates = useMemo(() =>
    (seedDurations ?? slides.map((_, i) => estimateSecs(scripts[i] ?? ''))).map(d => Math.max(1, d)),
  [slides, scripts, seedDurations]);
  const total = useMemo(() => estimates.reduce((a, b) => a + b, 0), [estimates]);
  const [bounds, setBounds] = useState<number[]>(() => {
    const acc: number[] = []; let run = 0;
    for (let i = 0; i < estimates.length - 1; i++) { run += estimates[i]; acc.push(run / total); }
    return acc;
  });
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(true);
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setTimeout(() => setAnalyzing(false), 1800); return () => clearTimeout(t); }, []);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (playing) {
      playRef.current = setInterval(() => {
        setCurrentTime(t => {
          if (t >= total - 1) { setPlaying(false); return total; }
          return t + 1;
        });
      }, 1000);
    } else {
      clearInterval(playRef.current!);
    }
    return () => clearInterval(playRef.current!);
  }, [playing, total]);

  const togglePlay = () => {
    if (analyzing) return;
    if (currentTime >= total) setCurrentTime(0);
    setPlaying(v => !v);
  };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (analyzing || (e.target as HTMLElement).closest('.seg-marker')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setCurrentTime(Math.round(ratio * total));
    setPlaying(false);
  };

  useEffect(() => {
    if (dragIdx === null) return;
    const move = (e: PointerEvent) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      setBounds(prev => {
        const next = [...prev];
        const lo = (dragIdx === 0 ? 0 : next[dragIdx - 1]) + 0.03;
        const hi = (dragIdx === next.length - 1 ? 1 : next[dragIdx + 1]) - 0.03;
        next[dragIdx] = Math.min(hi, Math.max(lo, f));
        return next;
      });
    };
    const up = () => setDragIdx(null);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [dragIdx]);

  const fracs = useMemo(() => {
    const edges = [0, ...bounds, 1];
    return slides.map((_, i) => ({ start: edges[i], end: edges[i + 1] }));
  }, [bounds, slides]);

  const globalBars = useMemo(() => Array.from({ length: 160 }, (_, i) =>
    0.18 + ((Math.sin(i * 0.83) + Math.sin(i * 0.31 + 2) + 2) / 4) * 0.82), []);

  return (
    <div className="h-full flex flex-col" style={{ background: '#F8F9FC' }}>
      <div className="flex-shrink-0 flex items-center justify-between"
        style={{ height: 54, padding: '0 20px', borderBottom: '1px solid #E8EBF2', background: '#fff' }}>
        <button onClick={onBack} className="flex items-center cursor-pointer"
          style={{ gap: 6, height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', ...ns, fontSize: 13, fontWeight: 500, color: '#52637A' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Back
        </button>
        <span style={{ ...ns, fontSize: 14, fontWeight: 700, color: '#0D1433' }}>Review your recording</span>
        <button onClick={() => onApply(fracs.map(f => ({ start: f.start * total, end: f.end * total })))}
          disabled={analyzing} className="cursor-pointer"
          style={{ height: 36, padding: '0 18px', borderRadius: 9, border: 'none',
            background: analyzing ? '#B9CDF2' : '#006EFE', ...ns, fontSize: 13, fontWeight: 600, color: '#fff' }}>
          Looks good — apply
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center" style={{ padding: '24px 40px', gap: 22 }}>
        <div className="flex flex-col items-center" style={{ gap: 12 }}>
          <div className="flex items-center"
            style={{ gap: 10, background: '#fff', border: '1px solid #E8EBF2', borderRadius: 10, padding: '8px 14px' }}>
            <button onClick={togglePlay} disabled={analyzing} className="flex items-center justify-center flex-shrink-0"
              style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', outline: 'none',
                background: '#E5484D', opacity: analyzing ? 0.4 : 1,
                cursor: analyzing ? 'default' : 'pointer' }}>
              {playing
                ? <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>
                : <svg width="11" height="11" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 1 }}><path d="M6 4l14 8-14 8z"/></svg>}
            </button>
            <span style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#0D1433' }}>Your recording</span>
            <span style={{ ...ns, fontSize: 12, color: '#8596AD', fontVariantNumeric: 'tabular-nums' }}>{formatTime(currentTime)} / {formatTime(total)}</span>
          </div>
          <AnimatePresence mode="wait">
            {analyzing ? (
              <motion.div key="an" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex items-center" style={{ gap: 8 }}>
                <div style={{ width: 14, height: 14, border: '2px solid #E8EBF2', borderTopColor: '#006EFE', borderRadius: '50%', animation: 'v2spin 0.8s linear infinite' }} />
                <span style={{ ...ns, fontSize: 12.5, color: '#52637A' }}>Reviewing where you switched slides…</span>
              </motion.div>
            ) : (
              <motion.div key="done" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center"
                style={{ gap: 8, background: '#EDFBF6', border: '1px solid #C6F0E2', borderRadius: 9, padding: '7px 14px' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0FA47C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                <span style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: '#0B7C5E' }}>
                  Boundaries set from when you advanced slides · drag a marker if one feels off
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div style={{ width: '100%', maxWidth: 1040 }}>
          <div ref={trackRef} style={{ position: 'relative', width: '100%', userSelect: 'none' }}>
            <div style={{ display: 'flex', width: '100%', marginBottom: 8 }}>
              {fracs.map((f, i) => (
                <div key={i} style={{ width: `${(f.end - f.start) * 100}%`, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, padding: '0 4px' }}>
                  <SlideThumb slide={slides[i]} theme={theme} width={Math.max(64, Math.min(120, (f.end - f.start) * 1040 - 16))} />
                  <span style={{ ...ns, fontSize: 10.5, fontWeight: 700, color: '#52637A', marginTop: 5 }}>
                    Slide {i + 1} · {formatTime((f.end - f.start) * total)}
                  </span>
                </div>
              ))}
            </div>
            <div onClick={seek} style={{ position: 'relative', height: 74, borderRadius: 12, overflow: 'hidden',
              border: '1px solid #E0E5EB', background: '#fff', opacity: analyzing ? 0.45 : 1, transition: 'opacity 0.3s',
              cursor: analyzing ? 'default' : 'pointer' }}>
              {fracs.map((f, i) => (
                <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${f.start * 100}%`,
                  width: `${(f.end - f.start) * 100}%`, background: SEG_COLORS[i % SEG_COLORS.length] }} />
              ))}
              <div style={{ position: 'absolute', inset: '10px 6px', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                {globalBars.map((b, i) => {
                  const pos = i / globalBars.length;
                  const segIdx = fracs.findIndex(f => pos >= f.start && pos < f.end);
                  return <div key={i} style={{ flex: 1, height: `${b * 100}%`, borderRadius: 1.5, background: SEG_ACCENTS[Math.max(0, segIdx) % SEG_ACCENTS.length], opacity: 0.65 }} />;
                })}
              </div>
              {!analyzing && (
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(currentTime / total) * 100}%`,
                  width: 2, marginLeft: -1, background: '#0D1433', zIndex: 6, pointerEvents: 'none' }} />
              )}
              {bounds.map((b, i) => (
                <div key={i} className="seg-marker" onPointerDown={e => { e.preventDefault(); e.stopPropagation(); setDragIdx(i); }}
                  style={{ position: 'absolute', top: 0, bottom: 0, left: `${b * 100}%`, width: 18, marginLeft: -9, cursor: 'col-resize', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 3, borderRadius: 2, position: 'absolute', top: 0, bottom: 0, background: dragIdx === i ? '#0D1433' : '#52637A' }} />
                  <div style={{ width: 14, height: 22, borderRadius: 5, background: dragIdx === i ? '#0D1433' : '#fff',
                    border: '1.5px solid #52637A', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
                    <div style={{ width: 1.5, height: 9, background: dragIdx === i ? '#fff' : '#8596AD', borderRadius: 1 }} />
                    <div style={{ width: 1.5, height: 9, background: dragIdx === i ? '#fff' : '#8596AD', borderRadius: 1 }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between" style={{ marginTop: 6 }}>
              <span style={{ ...ns, fontSize: 10.5, color: '#8596AD' }}>0:00</span>
              <span style={{ ...ns, fontSize: 10.5, color: '#8596AD' }}>{formatTime(total)}</span>
            </div>
          </div>
        </div>
        <p style={{ ...ns, fontSize: 12, color: '#8596AD', maxWidth: 560, textAlign: 'center', lineHeight: 1.6 }}>
          Each colored section plays over one slide. If auto-sync got a boundary wrong, drag its marker.
        </p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Record mode — full-screen dark takeover
   ════════════════════════════════════════════════════════════════ */
function RecordMode({ slides, theme, scripts, startIdx, locked = false, onStop, onCancel }: {
  slides: PresentationSlide[]; theme: MockTheme; scripts: string[];
  startIdx: number; locked?: boolean; onStop: (durations: Record<number, number>) => void; onCancel: () => void;
}) {
  const [idx, setIdx] = useState(startIdx);
  const [elapsed, setElapsed] = useState(0);
  // idle: nothing captured yet. recording/paused: actively capturing or paused mid-take.
  // preview: capture ended (Stop) — review the take before committing (Done) or starting over (Re-record).
  const [phase, setPhase] = useState<'idle' | 'recording' | 'paused' | 'preview'>('idle');
  const [durations, setDurations] = useState<Record<number, number>>({});
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  // Script is a recording aid — once you're reviewing a take it's no longer the point of focus, so tuck it away by default.
  const [scriptCollapsed, setScriptCollapsed] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idxRef = useRef(idx);
  useEffect(() => { idxRef.current = idx; }, [idx]);
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (previewTimerRef.current) clearInterval(previewTimerRef.current);
  }, []);

  // Ticks previewTime up to elapsed (the take's fixed total) while previewPlaying is true.
  useEffect(() => {
    if (previewPlaying) {
      previewTimerRef.current = setInterval(() => {
        setPreviewTime(t => {
          if (t >= elapsed - 1) { setPreviewPlaying(false); return elapsed; }
          return t + 1;
        });
      }, 1000);
    } else if (previewTimerRef.current) {
      clearInterval(previewTimerRef.current);
    }
    return () => { if (previewTimerRef.current) clearInterval(previewTimerRef.current); };
  }, [previewPlaying, elapsed]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (confirmDiscard) {
        if (e.key === 'Escape') setConfirmDiscard(false);
        return;
      }
      if (!locked && phase !== 'preview') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setIdx(i => Math.min(slides.length - 1, i + 1));
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   setIdx(i => Math.max(0, i - 1));
      }
      if (e.key === 'Escape') requestCancel();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, locked, confirmDiscard]);

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setElapsed(s => s + 1);
      setDurations(prev => ({ ...prev, [idxRef.current]: (prev[idxRef.current] ?? 0) + 1 }));
    }, 1000);
  };
  const stopTimer = () => { if (timerRef.current) clearInterval(timerRef.current); };

  const handleStart = () => { setPhase('recording'); startTimer(); };
  const handlePauseResume = () => {
    if (phase === 'recording') { setPhase('paused'); stopTimer(); }
    else if (phase === 'paused') { setPhase('recording'); startTimer(); }
  };
  const handleStop = () => { stopTimer(); setPhase('preview'); setScriptCollapsed(true); };
  const handleRerecord = () => {
    stopTimer();
    setPreviewPlaying(false);
    setPreviewTime(0);
    setElapsed(0);
    setDurations({});
    setIdx(startIdx);
    setPhase('idle');
    setScriptCollapsed(false);
  };
  const handleDone = () => { stopTimer(); onStop(durations); };
  const handleCancel = () => {
    stopTimer();
    setConfirmDiscard(false);
    onCancel();
  };
  // Nothing captured yet in idle — safe to exit without asking. Any other phase means there's a take to lose.
  const requestCancel = () => {
    if (phase === 'idle') { handleCancel(); return; }
    setConfirmDiscard(true);
  };
  const togglePreviewPlay = () => {
    if (elapsed <= 0) return;
    if (previewTime >= elapsed) setPreviewTime(0);
    setPreviewPlaying(v => !v);
  };
  const seekPreview = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setPreviewTime(Math.round(ratio * elapsed));
    setPreviewPlaying(false);
  };

  const slide = slides[idx];
  const nextSlide = slides[idx + 1] ?? null;
  const bg = slide.bgImageUrl ? `url(${slide.bgImageUrl}) center/cover` : (slide.bgColor ?? theme.bg);
  const nextBg = nextSlide ? (nextSlide.bgImageUrl ? `url(${nextSlide.bgImageUrl}) center/cover` : (nextSlide.bgColor ?? theme.bg)) : null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: '#0A0C14', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 28px 12px' }}>
        <div className="flex items-center" style={{ gap: 10, minWidth: 160 }}>
          {phase === 'recording' && <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#E5484D', animation: 'v2blink 1s infinite', flexShrink: 0 }} />}
          <span style={{ ...ns, fontSize: 36, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums', letterSpacing: -1 }}>
            {formatTime(elapsed)}
          </span>
        </div>
        {!locked && phase !== 'preview' && (
          <div className="flex items-center" style={{ gap: 8, marginTop: 6 }}>
            <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
              className="cursor-pointer flex items-center justify-center"
              style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', opacity: idx === 0 ? 0.3 : 1 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <span style={{ ...ns, fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{idx + 1} / {slides.length}</span>
            <button onClick={() => setIdx(i => Math.min(slides.length - 1, i + 1))} disabled={idx === slides.length - 1}
              className="cursor-pointer flex items-center justify-center"
              style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', opacity: idx === slides.length - 1 ? 0.3 : 1 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        )}
        <div style={{ minWidth: 200, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          <button onClick={requestCancel} className="cursor-pointer flex items-center justify-center flex-shrink-0"
            style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.05)', outline: 'none' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          {!locked && phase !== 'preview' && nextSlide && nextBg && (
            <>
              <span style={{ ...ns, fontSize: 10.5, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, textTransform: 'uppercase' }}>Next</span>
              <div style={{ width: 160, height: 90, borderRadius: 8, overflow: 'hidden', background: nextBg, border: '1px solid rgba(255,255,255,0.1)', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', inset: 0, padding: '8% 9%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  {nextSlide.title && <p style={{ ...ns, fontSize: 8, fontWeight: 700, color: nextSlide.textColorOverride ?? theme.titleColor, margin: 0, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{nextSlide.title}</p>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 40px', minHeight: 0, overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          <motion.div key={idx} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            style={{ width: '100%', maxWidth: 820, maxHeight: '100%', aspectRatio: '16/9', borderRadius: 14, overflow: 'hidden', background: bg, position: 'relative', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
            <div style={{ position: 'absolute', inset: 0, padding: '7% 8%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {slide.title && <h2 style={{ ...ns, fontSize: 'clamp(18px,3vw,30px)', fontWeight: 700, color: slide.textColorOverride ?? theme.titleColor, margin: 0, lineHeight: 1.2 }}>{slide.title}</h2>}
              {slide.points.length > 0 && (
                <div style={{ marginTop: '4%', display: 'flex', flexDirection: 'column', gap: '2%' }}>
                  {slide.points.map((pt, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: theme.accentColor, marginTop: 6, flexShrink: 0 }} />
                      <p style={{ ...ns, fontSize: 'clamp(12px,1.6vw,18px)', color: slide.textColorOverride ?? theme.titleColor, opacity: 0.85, margin: 0, lineHeight: 1.45 }}>{pt}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {phase === 'preview' && (
        <div className="flex justify-center" style={{ flexShrink: 0, margin: '16px 40px 0' }}>
          <button onClick={() => setScriptCollapsed(v => !v)} className="cursor-pointer flex items-center"
            style={{ height: 30, padding: '0 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.06)', outline: 'none', ...ns, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
            {scriptCollapsed ? 'Show script' : 'Hide script'}
          </button>
        </div>
      )}
      {(phase !== 'preview' || !scriptCollapsed) && (
        <div style={{ flexShrink: 0, margin: phase === 'preview' ? '10px 40px 0' : '16px 40px 0', borderRadius: 14,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', padding: '14px 28px',
          height: phase === 'preview' ? '14vh' : '20vh', overflowY: 'auto' }}>
          <AnimatePresence mode="wait">
            <motion.p key={idx} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ ...ns, fontSize: 18, color: 'rgba(255,255,255,0.9)', lineHeight: 1.75, margin: 0, textAlign: 'center' }}>
              {scripts[idx] || <span style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>No script for this slide</span>}
            </motion.p>
          </AnimatePresence>
        </div>
      )}

      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 28px 32px', gap: 14 }}>
        {phase === 'preview' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '10px 16px', width: '100%', maxWidth: 460 }}>
              <button onClick={togglePreviewPlay} className="cursor-pointer flex items-center justify-center flex-shrink-0"
                style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', outline: 'none', background: '#006EFE' }}>
                {previewPlaying
                  ? <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>
                  : <svg width="12" height="12" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 1 }}><path d="M6 4l14 8-14 8z"/></svg>}
              </button>
              <div onClick={seekPreview} style={{ position: 'relative', flex: 1, height: 20, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <div style={{ position: 'relative', width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2, background: '#006EFE',
                    width: `${elapsed > 0 ? (previewTime / elapsed) * 100 : 0}%`, transition: previewPlaying ? 'width 1s linear' : 'none' }} />
                  <div style={{ position: 'absolute', top: '50%', left: `${elapsed > 0 ? (previewTime / elapsed) * 100 : 0}%`,
                    transform: 'translate(-50%, -50%)', width: 12, height: 12, borderRadius: '50%', background: '#006EFE',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.4)', transition: previewPlaying ? 'left 1s linear' : 'none' }} />
                </div>
              </div>
              <span style={{ ...ns, fontSize: 12.5, color: 'rgba(255,255,255,0.6)', fontWeight: 600, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                {formatTime(previewTime)} / {formatTime(elapsed)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button onClick={handleRerecord} className="cursor-pointer"
                style={{ height: 42, padding: '0 22px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.25)', background: 'transparent', ...ns, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', outline: 'none' }}>
                Re-record
              </button>
              <button onClick={handleDone} className="cursor-pointer"
                style={{ height: 42, padding: '0 26px', borderRadius: 10, border: 'none', background: '#fff', ...ns, fontSize: 13, fontWeight: 700, color: '#0D1433', cursor: 'pointer', outline: 'none' }}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <button onClick={phase === 'idle' ? handleStart : handlePauseResume} className="cursor-pointer flex items-center justify-center"
                style={{ width: 64, height: 64, borderRadius: '50%', border: 'none', outline: 'none',
                  background: phase === 'recording' ? '#E5484D' : '#fff',
                  boxShadow: phase === 'recording' ? '0 0 0 8px rgba(229,72,77,0.22)' : '0 0 0 6px rgba(255,255,255,0.1)',
                  transition: 'all 0.2s' }}>
                {phase === 'idle'
                  ? <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#E5484D', display: 'block' }} />
                  : phase === 'recording'
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="#E5484D" style={{ marginLeft: 2 }}><path d="M6 4l14 8-14 8z"/></svg>}
              </button>
              {phase !== 'idle' && (
                <button onClick={handleStop} className="cursor-pointer flex items-center justify-center"
                  style={{ width: 42, height: 42, borderRadius: 10, border: 'none', outline: 'none', background: '#fff', cursor: 'pointer' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#0D1433"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
                </button>
              )}
            </div>
            <span style={{ ...ns, fontSize: 11.5, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>
              {phase === 'idle'
                ? (locked ? 'Tap to start recording this slide' : 'Tap to start recording')
                : phase === 'recording' ? 'Tap to pause · stop when finished' : 'Paused · tap to resume · stop when finished'}
            </span>
          </>
        )}
      </div>

      <AnimatePresence>
        {confirmDiscard && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,14,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
              style={{ background: '#151A28', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '26px 26px 22px', width: 340, textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
              <p style={{ ...ns, fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Discard this recording?</p>
              <p style={{ ...ns, fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '0 0 22px', lineHeight: 1.5 }}>
                {phase === 'preview' ? "You'll lose this take — it hasn't been saved yet." : "You'll lose what you've recorded so far."}
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => setConfirmDiscard(false)} className="cursor-pointer"
                  style={{ height: 40, padding: '0 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', ...ns, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)', cursor: 'pointer', outline: 'none' }}>
                  Keep editing
                </button>
                <button onClick={handleCancel} className="cursor-pointer"
                  style={{ height: 40, padding: '0 20px', borderRadius: 10, border: 'none', background: '#E5484D', ...ns, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', outline: 'none' }}>
                  Discard
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
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

function VoiceList({ value, cloneName, onChange, onClone }: {
  value: string; cloneName: string | null; onChange: (id: string) => void; onClone: () => void;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {allVoices.map(v => {
        const sel = value === v.id;
        const prev = previewing === v.id;
        return (
          <button key={v.id} onClick={() => onChange(v.id)}
            className="w-full flex items-center cursor-pointer"
            style={{ padding: '7px 8px', borderRadius: 8, border: 'none', outline: 'none',
              background: sel ? '#F0F6FF' : 'transparent', transition: 'background 0.1s' }}
            onMouseEnter={e => { if (!sel) e.currentTarget.style.background = '#F4F6F9'; }}
            onMouseLeave={e => { e.currentTarget.style.background = sel ? '#F0F6FF' : 'transparent'; }}>
            {/* Radio */}
            <span style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, marginRight: 9,
              border: `2px solid ${sel ? '#006EFE' : '#C8CDD9'}`, background: sel ? '#006EFE' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {sel && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />}
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 1, textAlign: 'left' }}>
              <span style={{ ...ns, fontSize: 12.5, fontWeight: sel ? 700 : 500, color: '#0D1433' }}>{v.name}</span>
              <span style={{ ...ns, fontSize: 10.5, color: '#B0BACB' }}>{v.accent}</span>
            </div>
            {/* Preview */}
            <span onClick={e => preview(e, v.id)}
              className="cursor-pointer flex items-center justify-center flex-shrink-0"
              style={{ width: 22, height: 22, borderRadius: '50%',
                border: '1.5px solid #E0E5EB',
                background: prev ? '#0D1433' : '#fff', transition: 'all 0.15s' }}>
              {prev
                ? <svg width="7" height="7" viewBox="0 0 24 24" fill="white"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>
                : <svg width="7" height="7" viewBox="0 0 24 24" fill="#8596AD" style={{ marginLeft: 1 }}><path d="M6 4l14 8-14 8z"/></svg>}
            </span>
          </button>
        );
      })}

      <div style={{ height: 1, background: '#EEF1F6', margin: '5px 0 4px' }} />
      {cloneName ? (
        <button onClick={() => onChange(CLONE_VOICE_ID)}
          className="w-full flex items-center cursor-pointer"
          style={{ padding: '7px 8px', borderRadius: 8, border: 'none', outline: 'none',
            background: value === CLONE_VOICE_ID ? '#F0F6FF' : 'transparent', transition: 'background 0.1s' }}
          onMouseEnter={e => { if (value !== CLONE_VOICE_ID) e.currentTarget.style.background = '#F4F6F9'; }}
          onMouseLeave={e => { e.currentTarget.style.background = value === CLONE_VOICE_ID ? '#F0F6FF' : 'transparent'; }}>
          <span style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: '#52637A' }}>✓ {cloneName}</span>
        </button>
      ) : (
        <button onClick={onClone} className="flex items-center cursor-pointer"
          style={{ gap: 5, padding: '7px 8px', borderRadius: 8, border: 'none', background: 'transparent', outline: 'none' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#F4F6F9'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
          <span style={{ ...ns, fontSize: 13, color: '#52637A', fontWeight: 700, lineHeight: 1 }}>+</span>
          <span style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: '#52637A' }}>Clone your voice…</span>
        </button>
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
function ReviewScreen({ slides, theme, audios, onContinue, onBack }: {
  slides: PresentationSlide[]; theme: MockTheme; audios: SlideAudio[];
  onContinue: () => void; onBack: () => void;
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
  const progress = totalDuration > 0 ? currentTime / totalDuration : 0;

  return (
    <div className="h-full flex flex-col" style={{ background: '#EBEDF2' }}>
      <div className="flex-shrink-0 flex items-center justify-between"
        style={{ height: 54, padding: '0 20px', borderBottom: '1px solid #E8EBF2', background: '#fff' }}>
        <button onClick={onBack} className="flex items-center cursor-pointer"
          style={{ gap: 6, height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', ...ns, fontSize: 13, fontWeight: 500, color: '#52637A' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Back to narration
        </button>
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
            background: playing ? 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.12) 18%, transparent 30%)' : 'none',
            opacity: !playing || playerHovered ? 1 : 0, transition: 'opacity 0.25s', pointerEvents: !playing || playerHovered ? 'auto' : 'none' }}>
            <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div onClick={seek} style={{ width: '100%', height: 3, borderRadius: 2, background: playing ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.12)', cursor: 'pointer', position: 'relative' }}>
                {slideStarts.slice(1).map((s, i) => (
                  <div key={i} style={{ position: 'absolute', left: `${(s / totalDuration) * 100}%`, top: -1, width: 1, height: 5, background: playing ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.2)', transform: 'translateX(-50%)' }} />
                ))}
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${progress * 100}%`, background: playing ? '#fff' : '#15191F', borderRadius: 2, transition: 'width 0.5s linear' }} />
                <div style={{ position: 'absolute', top: '50%', left: `${progress * 100}%`, transform: 'translate(-50%, -50%)', width: 11, height: 11, borderRadius: '50%', background: playing ? '#fff' : '#15191F', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.5s linear' }} />
              </div>
              <div className="flex items-center" style={{ gap: 10 }}>
                <button onClick={() => { if (currentTime >= totalDuration) setCurrentTime(0); setPlaying(v => !v); }}
                  style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', outline: 'none', background: playing ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.07)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {playing
                    ? <svg width="9" height="9" viewBox="0 0 24 24" fill="white"><rect x="5" y="4" width="4" height="16" rx="1.5"/><rect x="15" y="4" width="4" height="16" rx="1.5"/></svg>
                    : <svg width="9" height="9" viewBox="0 0 24 24" fill="#15191F"><path d="M6 4l14 8-14 8V4z"/></svg>}
                </button>
                <span style={{ ...ns, fontSize: 11, color: playing ? 'rgba(255,255,255,0.8)' : '#52637A', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {formatTime(currentTime)} / {formatTime(totalDuration)}
                </span>
                <div style={{ flex: 1 }} />
                <button onClick={toggleFullscreen}
                  style={{ width: 28, height: 28, borderRadius: 6, border: 'none', outline: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={playing ? 'rgba(255,255,255,0.7)' : '#8596AD'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
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
function ExportScreen({ slides, theme, totalSecs, onBack }: { slides: PresentationSlide[]; theme: MockTheme; totalSecs: number; onBack: () => void }) {
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
        <button onClick={onBack} className="flex items-center cursor-pointer"
          style={{ gap: 6, height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', ...ns, fontSize: 13, fontWeight: 500, color: '#52637A' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Back to preview
        </button>
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

  const thumbWidth = 148;

  return (
    <button onClick={onClick} style={{ width: '100%', background: 'transparent', border: 'none', padding: '5px 10px', cursor: 'pointer' }}>
      <div style={{ position: 'relative', width: thumbWidth }}>
        <div style={{ borderRadius: 9, overflow: 'hidden',
          boxShadow: isActive ? '0 0 0 2.5px #006EFE, 0 0 0 5.5px rgba(0,110,254,0.16)' : 'none' }}>
          <SlideThumb slide={slide} theme={theme} width={thumbWidth} />
        </div>
        <div style={{ position: 'absolute', top: 4, right: 4 }}>
          {audio.status === 'generating' ? (
            <div style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid #E0E8FF', borderTopColor: sourceColor, animation: 'v2spin 0.8s linear infinite', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
          ) : dotColor ? (
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
          ) : null}
        </div>
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

/* Method picker — shown when a slide has no method chosen yet */
function MethodPicker({ onPick }: { onPick: (source: SourceKind) => void }) {
  type MethodDef = { id: SourceKind; icon: React.ReactNode; label: string; desc: string; color: string; bg: string; border: string };
  const methods: MethodDef[] = [
    {
      id: 'record', color: '#E5484D', bg: '', border: '',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E5484D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3"/>
          <path d="M5 10c0 3.9 3.1 7 7 7s7-3.1 7-7"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
          <line x1="9"  y1="21" x2="15" y2="21"/>
        </svg>
      ),
      label: 'Record myself', desc: 'Full-screen teleprompter mode',
    },
    {
      id: 'ai', color: '#7C3AED', bg: '', border: '',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round">
          <line x1="4"  y1="10" x2="4"  y2="14"/>
          <line x1="8"  y1="6"  x2="8"  y2="18"/>
          <line x1="12" y1="4"  x2="12" y2="20"/>
          <line x1="16" y1="7"  x2="16" y2="17"/>
          <line x1="20" y1="10" x2="20" y2="14"/>
        </svg>
      ),
      label: 'AI voice', desc: 'Pick a voice, we generate it',
    },
    {
      id: 'upload', color: '#0FA47C', bg: '', border: '',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0FA47C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      ),
      label: 'Upload audio', desc: 'MP3, WAV, or M4A file',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {methods.map(m => (
        <button key={m.id} onClick={() => onPick(m.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 11,
            border: '1px solid #E8EBF2', background: '#fff',
            cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.13s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#C8CDD9'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8EBF2'; }}>
          <div style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {m.icon}
          </div>
          <div>
            <div style={{ ...ns, fontSize: 13.5, fontWeight: 700, color: '#0D1433' }}>{m.label}</div>
            <div style={{ ...ns, fontSize: 11.5, color: '#8596AD', marginTop: 1 }}>{m.desc}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* Scope picker — shown after a method is chosen, before capture starts.
   Same choice for all three methods: this slide only, or the rest of the deck too. */
function ScopeChoice({ onPick }: { onPick: (scope: CaptureScope) => void }) {
  const opts: { id: CaptureScope; icon: React.ReactNode; label: string; desc: string }[] = [
    {
      id: 'single',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#006EFE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
        </svg>
      ),
      label: 'Just this slide', desc: 'Covers only the slide currently open',
    },
    {
      id: 'multi',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0FA47C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="14" height="12" rx="2" />
          <rect x="8" y="3" width="14" height="12" rx="2" />
        </svg>
      ),
      label: 'Cover remaining slides', desc: 'Keep going through the rest of the deck',
    },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {opts.map(o => (
        <button key={o.id} onClick={() => onPick(o.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 11,
            border: '1px solid #E8EBF2', background: '#fff',
            cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.13s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#C8CDD9'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8EBF2'; }}>
          <div style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {o.icon}
          </div>
          <div>
            <div style={{ ...ns, fontSize: 13.5, fontWeight: 700, color: '#0D1433' }}>{o.label}</div>
            <div style={{ ...ns, fontSize: 11.5, color: '#8596AD', marginTop: 1 }}>{o.desc}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* Apply-to-all prompt — shown after the first method is chosen */

function GenerateScriptMenu({ onThisSlide, onAllSlides }: { onThisSlide: () => void; onAllSlides: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} className="cursor-pointer flex items-center"
        style={{ gap: 3, border: 'none', background: 'transparent', padding: 0, ...ns, fontSize: 11, fontWeight: 500, color: '#7C3AED', cursor: 'pointer' }}>
        ✦ Generate
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            style={{ position: 'absolute', top: 'calc(100% + 5px)', right: 0, zIndex: 50, background: '#fff',
              border: '1px solid #E8EBF2', borderRadius: 9, boxShadow: '0 8px 24px rgba(15,23,51,0.12)', padding: 5, width: 160 }}>
            {[
              { label: 'This slide', action: onThisSlide },
              { label: 'All slides', action: onAllSlides },
            ].map(item => (
              <button key={item.label} onClick={() => { item.action(); setOpen(false); }}
                className="w-full text-left cursor-pointer"
                style={{ padding: '7px 10px', borderRadius: 6, border: 'none', background: 'transparent', ...ns, fontSize: 12.5, fontWeight: 500, color: '#0D1433', display: 'block', transition: 'background 0.1s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F4F6F9'; }}
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
function StudioPanel({ idx, script, audio, cloneName, isGeneratingScript, onScriptChange, onAudioChange, onMethodPick, onScopePick, onClone, onStartRecord, onGenerateAudioAll, onGenerateScript, onGenerateAllScripts }: {
  idx: number; script: string; audio: SlideAudio; cloneName: string | null;
  isGeneratingScript: boolean;
  onScriptChange: (v: string) => void;
  onAudioChange: (patch: Partial<SlideAudio>) => void;
  onMethodPick: (source: SourceKind) => void;
  onScopePick: (scope: CaptureScope) => void;
  onClone: () => void; onStartRecord: () => void;
  onGenerateAudioAll: () => void;
  onGenerateScript: () => void; onGenerateAllScripts: () => void;
}) {
  const ready = audio.status === 'ready';
  const stale = audio.status === 'stale';
  const est = estimateSecs(script);

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Script section */}
      <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid #EEF1F6' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
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
            background: 'transparent', outline: 'none', width: '100%', minHeight: 220, padding: 0 }}
          placeholder="Write what you'll say over this slide…" />
      </div>

      {/* Audio section */}
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...ns, fontSize: 10, fontWeight: 700, color: '#B0BACB', letterSpacing: 0.7, textTransform: 'uppercase' }}>Audio</span>
          {audio.methodSet && (
            <ChangeSourceMenu current={audio.source}
              onSwitch={s => onAudioChange({ source: s, methodSet: true, scopeSet: s === 'upload', scope: 'single', status: 'empty', duration: 0, fileName: undefined, segStart: undefined, segEnd: undefined })} />
          )}
        </div>

        {!audio.methodSet ? (
          <MethodPicker onPick={onMethodPick} />
        ) : !audio.scopeSet ? (
          <ScopeChoice onPick={onScopePick} />
        ) : (
          <AudioControls idx={idx} audio={audio} script={script} cloneName={cloneName}
            onAudioChange={onAudioChange} onClone={onClone} onStartRecord={onStartRecord}
            onGenerateAll={onGenerateAudioAll} />
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Main V2 view
   ════════════════════════════════════════════════════════════════ */
export default function NarrationViewV2() {
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
    savedMatchesSlides ? saved!.audios :
      slides.map(() => ({ source: 'ai', methodSet: false, scopeSet: false, scope: 'single', voiceId: AI_VOICES[0].id, status: 'empty', duration: 0 }))
  );
  const [defaultVoice, setDefaultVoice] = useState(saved?.defaultVoice ?? AI_VOICES[0].id);
  const [cloneName, setCloneName] = useState<string | null>(saved?.cloneName ?? null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [recordIdx, setRecordIdx] = useState<number | null>(null);
  const [recordLocked, setRecordLocked] = useState(false);
  const [syncSeedDurations, setSyncSeedDurations] = useState<number[] | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const patchAudio = useCallback((i: number, patch: Partial<SlideAudio>) => {
    setAudios(prev => prev.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  }, []);

  const [scriptGenerating, setScriptGenerating] = useState<boolean[]>(() => slides.map(() => false));

  const generateScript = useCallback((i: number) => {
    setScriptGenerating(prev => prev.map((v, j) => j === i ? true : v));
    setTimeout(() => {
      setScripts(prev => prev.map((s, j) => j === i ? mockGenerateScript(slides[j]) : s));
      setScriptGenerating(prev => prev.map((v, j) => j === i ? false : v));
      setAudios(prev => prev.map((a, j) => j === i && (a.status === 'ready' || a.status === 'stale') ? { ...a, status: 'stale' } : a));
    }, 900 + Math.random() * 500);
  }, [slides]);

  const generateAllScripts = useCallback(() => {
    slides.forEach((_, i) => {
      setScriptGenerating(prev => prev.map((v, j) => j === i ? true : v));
      setTimeout(() => {
        setScripts(prev => prev.map((s, j) => j === i ? mockGenerateScript(slides[j]) : s));
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
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setActiveIdx(i => Math.min(slides.length - 1, i + 1));
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   setActiveIdx(i => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [slides.length]);

  // Auto-scroll filmstrip to keep active item visible
  useEffect(() => {
    const strip = filmstripRef.current;
    if (!strip) return;
    const items = strip.querySelectorAll('button');
    items[activeIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIdx]);

  const handleMethodPick = (i: number, source: SourceKind) => {
    // Upload is always per-slide — skip the scope choice entirely.
    patchAudio(i, { source, methodSet: true, scopeSet: source === 'upload', scope: 'single', status: 'empty', duration: 0 });
  };

  const handleScopePick = (i: number, scope: CaptureScope) => {
    patchAudio(i, { scopeSet: true, scope });
    if (audios[i].source === 'record') {
      beginRecord(i, scope === 'single');
    }
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

  const applySync = (segments: { start: number; end: number }[]) => {
    setAudios(slides.map((_, i) => ({
      source: 'record', methodSet: true, scopeSet: true, scope: 'multi', voiceId: defaultVoice, status: 'ready',
      duration: segments[i].end - segments[i].start,
      segStart: segments[i].start, segEnd: segments[i].end,
    })));
    setStep('export');
    showToast('Recording split across slides');
  };

  const beginRecord = async (i: number, locked: boolean) => {
    try {
      // Real getUserMedia call — triggers the browser's own native mic-permission prompt.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      enterRecord(i, locked);
    } catch {
      showToast('Microphone access is required to record');
    }
  };

  const enterRecord = (i: number, locked: boolean) => {
    setActiveIdx(i);
    setRecordIdx(i);
    setRecordLocked(locked);
  };

  const handleRecordCancel = () => {
    setRecordIdx(null);
  };

  const exitRecord = (durations: Record<number, number>) => {
    const startedIdx = recordIdx;
    const locked = recordLocked;
    setRecordIdx(null);
    if (locked && startedIdx !== null) {
      const dur = durations[startedIdx] ?? 0;
      setAudios(prev => prev.map((a, i) => i === startedIdx ? { ...a, status: 'ready', duration: dur } : a));
      if (dur > 0) {
        router.push('/presentation/editor');
      }
      return;
    }
    const seed = slides.map((_, i) => durations[i] ?? 0);
    setSyncSeedDurations(seed);
    setStep('sync');
  };

  const readyCount = audios.filter(a => a.status === 'ready').length;
  const missing = slides.length - readyCount;
  const totalSecs = audios.reduce((acc, a) => acc + (a.status === 'ready' ? a.duration : 0), 0);

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
    <ReviewScreen slides={slides} theme={theme} audios={audios} onContinue={() => setStep('export')} onBack={() => setStep('workspace')} />
  );
  if (step === 'export') return (
    <ExportScreen slides={slides} theme={theme} totalSecs={totalSecs} onBack={() => setStep('review')} />
  );

  // Active slide data
  const slide = slides[activeIdx];
  const slideBg = slide.bgImageUrl ? `url(${slide.bgImageUrl}) center/cover` : (slide.bgColor ?? theme.bg);

  return (
    <div className="h-full flex flex-col" style={{ background: '#EBEDF2' }}>
      {/* Record mode overlay */}
      <AnimatePresence>
        {recordIdx !== null && (
          <RecordMode slides={slides} theme={theme} scripts={scripts}
            startIdx={recordIdx} locked={recordLocked} onStop={exitRecord} onCancel={handleRecordCancel} />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between"
        style={{ height: 54, padding: '0 18px', borderBottom: '1px solid #E8EBF2', background: '#fff', zIndex: 10 }}>
        <div className="flex items-center" style={{ gap: 4 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex-shrink-0 rounded-lg hover:bg-[#F6F7F9] transition-colors cursor-pointer flex items-center justify-center"
            style={{ width: 40, height: 40 }}>
            <SideMenuIcon active={sidebarOpen} />
          </button>
          <button onClick={() => router.push('/presentation/editor')} className="flex items-center cursor-pointer"
            style={{ gap: 6, height: 34, padding: '0 13px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', ...ns, fontSize: 13, fontWeight: 500, color: '#52637A' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Editor
          </button>
        </div>

        <div className="flex items-center" style={{ gap: 18 }}>
          <div className="flex items-center" style={{ gap: 6 }}>
            <span style={{ ...ns, fontSize: 13, fontWeight: 700, color: readyCount === slides.length ? '#0FA47C' : '#52637A' }}>
              {readyCount}/{slides.length}
            </span>
            <span style={{ ...ns, fontSize: 12, color: '#8596AD' }}>slides ready</span>
            {totalSecs > 0 && <span style={{ ...ns, fontSize: 12, color: '#B0BACB' }}>· {formatTime(totalSecs)}</span>}
          </div>
          <div className="flex items-center" style={{ gap: 10 }}>
            <button onClick={() => readyCount > 0 && setStep('review')}
              title={readyCount === 0 ? 'Add audio to at least one slide first' : missing > 0 ? `${missing} slide${missing > 1 ? 's' : ''} still need audio` : undefined}
              style={{ height: 36, padding: '0 16px', borderRadius: 9, border: '1px solid #E0E5EB',
                background: '#fff', ...ns, fontSize: 13, fontWeight: 600, color: readyCount > 0 ? '#15191F' : '#B8C0CC',
                display: 'flex', alignItems: 'center', gap: 6, cursor: readyCount > 0 ? 'pointer' : 'not-allowed' }}>
              Preview
            </button>
            <button onClick={() => readyCount > 0 && setStep('export')}
              title={readyCount === 0 ? 'Add audio to at least one slide first' : missing > 0 ? `${missing} slide${missing > 1 ? 's' : ''} still need audio` : undefined}
              style={{ height: 36, padding: '0 16px', borderRadius: 9, border: 'none',
                background: readyCount > 0 ? '#006EFE' : '#C3CEDE', ...ns, fontSize: 13, fontWeight: 600, color: '#fff',
                display: 'flex', alignItems: 'center', gap: 6, cursor: readyCount > 0 ? 'pointer' : 'not-allowed' }}>
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Studio body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Filmstrip — left */}
        <div ref={filmstripRef}
          style={{ width: 172, flexShrink: 0, overflowY: 'auto', background: '#fff',
            borderRight: '1px solid #E0E3EA', padding: '12px 0' }}>
          {slides.map((s, i) => (
            <FilmstripItem key={s.id} slide={s} theme={theme} audio={audios[i]} script={scripts[i]}
              idx={i} isActive={activeIdx === i} onClick={() => setActiveIdx(i)} />
          ))}
        </div>

        {step === 'sync' ? (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <SyncScreen slides={slides} theme={theme} scripts={scripts} seedDurations={syncSeedDurations}
              onApply={applySync} onBack={() => setStep('workspace')} />
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
                onMethodPick={source => handleMethodPick(activeIdx, source)}
                onScopePick={scope => handleScopePick(activeIdx, scope)}
                onClone={() => setStep('clone')}
                onStartRecord={() => {
                  const a = audios[activeIdx];
                  const locked = !(a.scope === 'multi' && a.status === 'empty');
                  beginRecord(activeIdx, locked);
                }}
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
