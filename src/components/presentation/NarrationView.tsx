'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { usePresentationFlowStore, type PresentationSlide } from '@/stores/presentationFlowStore';
import { useFlowStore } from '@/stores/flowStore';
import { CreateTrainingModal } from './CreateTrainingModal';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

type Step = 'workspace' | 'review' | 'export';

const AI_VOICES = ['Ava (US, warm)', 'Noah (US, confident)', 'Isla (UK, calm)', 'Leo (AU, energetic)'];

function rawScriptFor(slide: PresentationSlide): string {
  if (slide.notes) return slide.notes;
  const parts = [slide.title, ...slide.points];
  return parts.filter(Boolean).join('. ') + '.';
}

function aiScriptFor(slide: PresentationSlide): string {
  const [first, second] = slide.points;
  const lead = `Hello everyone, and welcome. In this section, we're going to cover ${slide.title.replace(/^How to /i, 'how to ').toLowerCase()}.`;
  const body = [
    first ? `Let's start with ${first.toLowerCase()}.` : '',
    second ? `On top of that, ${second.toLowerCase()}.` : '',
  ].filter(Boolean).join(' ');
  return `${lead} ${body} Thanks so much for watching — see you in the next section.`.replace(/\s+/g, ' ').trim();
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SlideFramePreview({ slide }: { slide: PresentationSlide }) {
  return (
    <div className="h-full w-full flex flex-col justify-center" style={{ padding: '10% 9%' }}>
      <h2 style={{ ...ns, fontSize: '6.5cqw', fontWeight: 700, color: '#15191F', lineHeight: 1.15 }}>{slide.title}</h2>
      {slide.points.length > 0 && (
        <ul className="flex flex-col" style={{ gap: '1.6cqw', marginTop: '4.5cqw' }}>
          {slide.points.map((p, i) => (
            <li key={i} className="flex items-start" style={{ gap: '1cqw' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#006EFE', marginTop: '0.9cqw', flexShrink: 0 }} />
              <span style={{ ...ns, fontSize: '2.6cqw', color: '#3A4351' }}>{p}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilmstripItem({ slide, index, isActive, isRecorded, onSelect }: { slide: PresentationSlide; index: number; isActive: boolean; isRecorded: boolean; onSelect: () => void }) {
  return (
    <div style={{ padding: '0 14px 16px' }}>
      <button
        onClick={onSelect}
        className="w-full text-left cursor-pointer"
        style={{ aspectRatio: '16/9', borderRadius: 8, background: '#fff', border: `2px solid ${isActive ? '#006EFE' : '#E4E7EC'}`, overflow: 'hidden' }}
      >
        <div className="h-full w-full flex flex-col justify-center" style={{ padding: '0 10%' }}>
          <p
            style={{ ...ns, fontSize: 12.5, fontWeight: 700, color: '#15191F', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {slide.title}
          </p>
        </div>
      </button>
      <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
        <span style={{ ...ns, fontSize: 12, color: '#8E99AB' }}>{index + 1}</span>
        {isRecorded ? (
          <span className="flex items-center" style={{ gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="#22A366" strokeWidth="1.6" /><path d="M6 10.2l2.4 2.4L14 7" stroke="#22A366" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span style={{ ...ns, fontSize: 12.5, color: '#22A366', fontWeight: 500 }}>Recorded</span>
          </span>
        ) : (
          <button onClick={onSelect} className="flex items-center cursor-pointer" style={{ gap: 4, background: 'none', border: 'none' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#006EFE' }} />
            <span style={{ ...ns, fontSize: 12.5, color: '#006EFE', fontWeight: 500 }}>Transcript</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function NarrationView() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get('mode') === 'ai' ? 'ai' : 'record';
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);

  const storeSlides = usePresentationFlowStore((s) => s.slides);
  const presentationTitle = usePresentationFlowStore((s) => s.presentationTitle);
  const slides = useMemo<PresentationSlide[]>(
    () => (storeSlides.length > 0 ? storeSlides : [{ id: 'slide-1', type: 'headline', title: presentationTitle || 'Untitled presentation', points: [] }]),
    [storeSlides, presentationTitle]
  );

  const [step, setStep] = useState<Step>('workspace');
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSlide = slides[activeIndex];

  const [scripts, setScripts] = useState<Record<string, string>>({});
  const [generated, setGenerated] = useState<Record<string, boolean>>({});
  const currentScript = scripts[activeSlide.id] ?? rawScriptFor(activeSlide);
  const [regenMenuOpen, setRegenMenuOpen] = useState(false);
  const regenMenuRef = useRef<HTMLDivElement>(null);

  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [videoDuration, setVideoDuration] = useState(59);
  const [recordedIds, setRecordedIds] = useState<Record<string, boolean>>({});

  const [voice, setVoice] = useState(AI_VOICES[0]);
  const [customVoices, setCustomVoices] = useState<string[]>([]);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);

  const [reviewPlaying, setReviewPlaying] = useState(false);
  const [reviewTime, setReviewTime] = useState(0);
  const reviewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [courseTitle, setCourseTitle] = useState(presentationTitle || 'Untitled presentation');
  const [description, setDescription] = useState('');
  const [saveToProjects, setSaveToProjects] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => () => {
    if (reviewTimerRef.current) clearInterval(reviewTimerRef.current);
  }, []);

  useEffect(() => {
    if (!regenMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!regenMenuRef.current?.contains(e.target as Node)) setRegenMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [regenMenuOpen]);

  useEffect(() => {
    if (!recording || paused) return;
    const id = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording, paused]);

  useEffect(() => {
    if (!reviewPlaying) return;
    reviewTimerRef.current = setInterval(() => {
      setReviewTime((t) => {
        if (t >= videoDuration - 1) { setReviewPlaying(false); return videoDuration; }
        return t + 1;
      });
    }, 1000);
    return () => { if (reviewTimerRef.current) clearInterval(reviewTimerRef.current); };
  }, [reviewPlaying, videoDuration]);

  const updateScript = (value: string) => setScripts((s) => ({ ...s, [activeSlide.id]: value }));

  const handleGenerateForThisSlide = () => {
    updateScript(aiScriptFor(activeSlide));
    setGenerated((g) => ({ ...g, [activeSlide.id]: true }));
    setRegenMenuOpen(false);
  };

  const handleGenerateForAllSlides = () => {
    setScripts((s) => {
      const next = { ...s };
      slides.forEach((sl) => { next[sl.id] = aiScriptFor(sl); });
      return next;
    });
    setGenerated((g) => {
      const next = { ...g };
      slides.forEach((sl) => { next[sl.id] = true; });
      return next;
    });
    setRegenMenuOpen(false);
  };

  const handleRestore = () => {
    updateScript(rawScriptFor(activeSlide));
    setGenerated((g) => ({ ...g, [activeSlide.id]: false }));
  };

  const startRecording = () => {
    setRecording(true);
    setPaused(false);
    setRecordSeconds(0);
  };

  const togglePauseRecording = () => setPaused((p) => !p);

  const selectSlide = (i: number) => {
    if (recording) setRecordedIds((r) => ({ ...r, [activeSlide.id]: true }));
    setActiveIndex(i);
  };

  const stopRecording = () => {
    setRecording(false);
    setPaused(false);
    setRecordedIds((r) => ({ ...r, [activeSlide.id]: true }));
    setVideoDuration(Math.max(recordSeconds, 3));
    setReviewTime(0);
    setStep('review');
  };

  const generateAiVoiceover = () => {
    setGeneratingAi(true);
    setTimeout(() => {
      setGeneratingAi(false);
      setRecordedIds(Object.fromEntries(slides.map((s) => [s.id, true])));
      setVideoDuration(59);
      setReviewTime(0);
      setStep('review');
    }, 1400);
  };

  const handleVoiceCreated = (voiceName: string) => {
    const label = `${voiceName} (Your voice)`;
    setCustomVoices((v) => [...v, label]);
    setVoice(label);
    setCloneOpen(false);
  };

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => setDownloading(false), 1600);
  };

  const hasAnyRecording = Object.keys(recordedIds).length > 0;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-border-light" style={{ height: 56, padding: '0 20px' }}>
        <div className="flex items-center" style={{ gap: 10 }}>
          <Tooltip label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'} position="right">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex items-center justify-center cursor-pointer"
              style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F6F9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              <SideMenuIcon active={sidebarOpen} />
            </button>
          </Tooltip>
          <button
            onClick={() => router.push('/presentation/editor')}
            className="flex items-center cursor-pointer"
            style={{ gap: 6, height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', ...ns, fontSize: 13, fontWeight: 500, color: '#52637A' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
            Back to editor
          </button>
        </div>

        <div className="flex items-center" style={{ gap: 10 }}>
          {step === 'review' && (
            <>
              <button onClick={() => setStep('workspace')} className="cursor-pointer" style={{ ...ns, fontSize: 13.5, fontWeight: 600, color: '#52637A', background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8, padding: '8px 16px' }}>
                Re-record
              </button>
              <button onClick={() => setStep('export')} className="cursor-pointer" style={{ ...ns, fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 8, padding: '8px 18px' }}>
                Export
              </button>
            </>
          )}
          {step === 'export' && (
            <button onClick={handleDownload} disabled={downloading} className="flex items-center cursor-pointer" style={{ gap: 6, ...ns, fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 8, padding: '8px 18px' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
              {downloading ? 'Preparing…' : 'Download MP4'}
            </button>
          )}
          {step === 'workspace' && (
            <button
              onClick={() => {
                if (recording) { stopRecording(); return; }
                if (hasAnyRecording) { setReviewTime(0); setStep('review'); }
              }}
              disabled={!hasAnyRecording && !recording}
              className="cursor-pointer"
              style={{
                ...ns, fontSize: 13.5, fontWeight: 600, borderRadius: 8, padding: '8px 18px', border: 'none',
                color: (hasAnyRecording || recording) ? '#fff' : '#B7BEC9',
                background: (hasAnyRecording || recording) ? '#006EFE' : '#F1F2F4',
                cursor: (hasAnyRecording || recording) ? 'pointer' : 'not-allowed',
              }}
            >
              Preview
            </button>
          )}
        </div>
      </div>

      {/* WORKSPACE */}
      {step === 'workspace' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Filmstrip */}
          <div className="flex-shrink-0 overflow-y-auto" style={{ width: 220, borderRight: '1px solid #EDEFF3', background: '#FAFBFC', paddingTop: 16 }}>
            {slides.map((slide, i) => (
              <FilmstripItem key={slide.id} slide={slide} index={i} isActive={i === activeIndex} isRecorded={!!recordedIds[slide.id]} onSelect={() => selectSlide(i)} />
            ))}
          </div>

          {/* Slide + recording control */}
          <div className="flex-1 flex flex-col items-center justify-center" style={{ padding: '24px 32px', gap: 20, minWidth: 0, background: '#FAFBFC' }}>
            <div className="w-full" style={{ maxWidth: 820, aspectRatio: '16/9', borderRadius: 14, background: '#fff', border: '1px solid #E4E7EC', boxShadow: '0 8px 30px rgba(15,23,51,0.06)', overflow: 'hidden', containerType: 'inline-size' }}>
              <SlideFramePreview slide={activeSlide} />
            </div>

            {mode === 'record' ? (
              recording ? (
                <div
                  className="flex items-center"
                  style={{ gap: 12, background: 'linear-gradient(0deg, rgba(226,80,79,0.06), rgba(226,80,79,0.06)), #fff', border: '1px solid rgba(226,80,79,0.25)', boxShadow: '0 4px 18px rgba(226,80,79,0.18)', borderRadius: 999, padding: '6px 20px 6px 6px' }}
                >
                  <button
                    onClick={togglePauseRecording}
                    className="flex items-center justify-center cursor-pointer flex-shrink-0"
                    style={{ width: 40, height: 40, borderRadius: '50%', background: '#E2504F', border: 'none' }}
                  >
                    {paused ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 1 }}><path d="M6 4l14 8-14 8z" /></svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></svg>
                    )}
                  </button>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    {!paused && <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.1 }} style={{ width: 6, height: 6, borderRadius: '50%', background: '#E2504F', display: 'inline-block' }} />}
                    <span style={{ ...ns, fontSize: 13, fontWeight: 700, color: '#E2504F', letterSpacing: '0.03em' }}>{paused ? 'PAUSED' : 'REC'}</span>
                  </div>
                  <div style={{ width: 1, height: 18, background: 'rgba(226,80,79,0.25)' }} />
                  <span style={{ ...ns, fontSize: 14.5, fontWeight: 600, color: '#15191F', fontVariantNumeric: 'tabular-nums' }}>{formatTime(recordSeconds)}</span>
                </div>
              ) : (
                <button
                  onClick={startRecording}
                  className="flex items-center cursor-pointer"
                  style={{ gap: 12, ...ns, fontSize: 14.5, fontWeight: 600, color: '#29323D', background: '#fff', border: '1px solid #EDEFF3', boxShadow: '0 4px 18px rgba(15,23,51,0.08)', borderRadius: 999, padding: '6px 26px 6px 6px' }}
                >
                  <span className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, borderRadius: '50%', background: '#FDEBEB' }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#E2504F', display: 'inline-block' }} />
                  </span>
                  Start recording
                </button>
              )
            ) : (
              <div className="flex items-center" style={{ gap: 10 }}>
                <div className="relative">
                  <select
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    style={{ ...ns, fontSize: 13.5, color: '#15191F', border: '1px solid #E0E5EB', borderRadius: 999, padding: '10px 14px', background: '#fff', cursor: 'pointer' }}
                  >
                    {[...AI_VOICES, ...customVoices].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <button onClick={() => setCloneOpen(true)} className="cursor-pointer" style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#7C3AED', background: '#F3EBFF', border: 'none', borderRadius: 999, padding: '10px 16px' }}>
                  + Clone your voice
                </button>
                <button onClick={generateAiVoiceover} disabled={generatingAi} className="flex items-center cursor-pointer" style={{ gap: 8, ...ns, fontSize: 14, fontWeight: 600, color: '#fff', background: '#0D1433', border: 'none', borderRadius: 999, padding: '11px 22px' }}>
                  {generatingAi && <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }} style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', display: 'inline-block' }} />}
                  {generatingAi ? 'Generating…' : 'Generate voiceover'}
                </button>
              </div>
            )}
          </div>

          {/* Script panel */}
          <div className="flex-shrink-0 overflow-y-auto" style={{ width: 340, borderLeft: '1px solid #EDEFF3', padding: 20 }}>
            <span style={{ ...ns, fontSize: 11.5, fontWeight: 700, color: '#8E99AB', letterSpacing: '0.04em' }}>SCRIPT · SLIDE {activeIndex + 1}</span>
            <textarea
              value={currentScript}
              onChange={(e) => updateScript(e.target.value)}
              rows={8}
              style={{ ...ns, fontSize: 14, color: '#15191F', lineHeight: 1.5, border: '1px solid #E0E5EB', borderRadius: 10, padding: 14, marginTop: 10, width: '100%', resize: 'vertical', outline: 'none' }}
            />
            <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
              <div ref={regenMenuRef} className="relative">
                <button onClick={() => setRegenMenuOpen((v) => !v)} className="flex items-center cursor-pointer" style={{ gap: 5, ...ns, fontSize: 13, fontWeight: 600, color: '#006EFE', background: 'none', border: 'none' }}>
                  <span>{generated[activeSlide.id] ? '↻ Regenerate' : '+ Generate with AI'}</span>
                  <svg width="9" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="#006EFE" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                {regenMenuOpen && (
                  <div className="absolute bg-white flex flex-col" style={{ bottom: 'calc(100% + 6px)', left: 0, zIndex: 20, width: 180, padding: 5, borderRadius: 9, border: '1px solid #E8EBF2', boxShadow: '0px 8px 24px rgba(15,23,51,0.14)' }}>
                    <button onClick={handleGenerateForThisSlide} className="text-left cursor-pointer" style={{ ...ns, fontSize: 13, fontWeight: 500, color: '#1F2532', padding: '7px 10px', borderRadius: 6, border: 'none', background: 'none' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F7FA'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
                      For this slide
                    </button>
                    <button onClick={handleGenerateForAllSlides} className="text-left cursor-pointer" style={{ ...ns, fontSize: 13, fontWeight: 500, color: '#1F2532', padding: '7px 10px', borderRadius: 6, border: 'none', background: 'none' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F7FA'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
                      For all slides
                    </button>
                  </div>
                )}
              </div>
              {generated[activeSlide.id] && (
                <button onClick={handleRestore} className="flex items-center cursor-pointer" style={{ gap: 4, ...ns, fontSize: 12.5, color: '#8596AD', background: 'none', border: 'none' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg>
                  Restore
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REVIEW */}
      {step === 'review' && (
        <div className="flex-1 flex items-center justify-center" style={{ padding: 40 }}>
          <div className="flex flex-col" style={{ width: '100%', maxWidth: 900 }}>
            <div style={{ aspectRatio: '16/9', borderRadius: 14, background: '#fff', border: '1px solid #E4E7EC', boxShadow: '0 8px 30px rgba(15,23,51,0.06)', overflow: 'hidden', containerType: 'inline-size' }}>
              <SlideFramePreview slide={slides[0]} />
            </div>
            <div style={{ marginTop: 16 }}>
              <div
                className="relative cursor-pointer"
                style={{ height: 3, background: '#E4E7EC', borderRadius: 2 }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  setReviewTime(Math.round(ratio * videoDuration));
                }}
              >
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(reviewTime / videoDuration) * 100}%`, background: '#0D1433', borderRadius: 2 }} />
                <div style={{ position: 'absolute', top: '50%', left: `${(reviewTime / videoDuration) * 100}%`, width: 12, height: 12, borderRadius: '50%', background: '#0D1433', transform: 'translate(-50%, -50%)' }} />
              </div>
              <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
                <button onClick={() => setReviewPlaying((p) => !p)} className="flex items-center justify-center cursor-pointer" style={{ width: 32, height: 32, borderRadius: '50%', background: '#F4F6F9', border: 'none' }}>
                  {reviewPlaying ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="#15191F"><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#15191F" style={{ marginLeft: 1 }}><path d="M6 4l14 8-14 8z" /></svg>
                  )}
                </button>
                <span style={{ ...ns, fontSize: 13, color: '#52637A', fontVariantNumeric: 'tabular-nums' }}>{formatTime(reviewTime)} / {formatTime(videoDuration)}</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EXPORT */}
      {step === 'export' && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex" style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px 64px', gap: 56 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ ...ns, fontSize: 26, fontWeight: 700, color: '#0D1433', paddingBottom: 20, borderBottom: '1px solid #EDEFF3' }}>{presentationTitle}</h1>

              <label style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#52637A', display: 'block', marginTop: 24 }}>Course title</label>
              <input
                value={courseTitle}
                onChange={(e) => setCourseTitle(e.target.value)}
                style={{ ...ns, fontSize: 14.5, color: '#15191F', border: '1px solid #E0E5EB', borderRadius: 10, padding: '12px 14px', marginTop: 8, width: '100%', outline: 'none' }}
              />

              <label style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#52637A', display: 'block', marginTop: 22 }}>Description</label>
              <div style={{ position: 'relative', marginTop: 8 }}>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter a description…"
                  rows={6}
                  style={{ ...ns, fontSize: 14.5, color: '#15191F', border: '1px solid #E0E5EB', borderRadius: 10, padding: '14px 14px 36px', width: '100%', outline: 'none', resize: 'vertical' }}
                />
                <button
                  onClick={() => setDescription((d) => d || `A step-by-step walkthrough of ${presentationTitle.toLowerCase()}, covering the key ideas from every slide.`)}
                  className="flex items-center cursor-pointer"
                  style={{ position: 'absolute', right: 12, bottom: 10, gap: 4, ...ns, fontSize: 13, fontWeight: 600, color: '#5326BD', background: 'none', border: 'none' }}
                >
                  Write with AI
                  <span>+</span>
                </button>
              </div>

              <label className="flex items-center cursor-pointer" style={{ gap: 10, marginTop: 22 }}>
                <input type="checkbox" checked={saveToProjects} onChange={(e) => setSaveToProjects(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#006EFE' }} />
                <span style={{ ...ns, fontSize: 14, color: '#15191F' }}>Save to My Projects</span>
              </label>
            </div>

            <div style={{ width: 280, flexShrink: 0 }}>
              <span style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#52637A' }}>Preview</span>
              <div style={{ marginTop: 10, aspectRatio: '16/9', borderRadius: 12, background: '#fff', border: '1px solid #E4E7EC', boxShadow: '0 4px 16px rgba(15,23,51,0.06)', overflow: 'hidden', containerType: 'inline-size' }}>
                <SlideFramePreview slide={slides[0]} />
              </div>

              <div style={{ marginTop: 14, background: '#F6F7FA', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667C98" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 9h20" /></svg>
                  <span style={{ ...ns, fontSize: 13.5, color: '#3A4351' }}>{slides.length} slides</span>
                </div>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667C98" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
                  <span style={{ ...ns, fontSize: 13.5, color: '#3A4351' }}>MP4 · ~{Math.max(1, Math.round(videoDuration / 30))} min</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {cloneOpen && (
        <CreateTrainingModal onClose={() => setCloneOpen(false)} onCreated={handleVoiceCreated} />
      )}
    </div>
  );
}
