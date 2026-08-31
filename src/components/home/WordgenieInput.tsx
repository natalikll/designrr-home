'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFlowEngine } from '@/hooks/useFlowEngine';
import { useFlowStore, MANUSCRIPT_GENERATION_LIMIT, PRESENTATION_GENERATION_LIMIT } from '@/stores/flowStore';
import { Tooltip } from '@/components/ui/Tooltip';
import { SettingsPillRow } from '@/components/presentation/SettingsPillRow';
import { UpgradePlanModal } from '@/components/account/MyAccountView';

interface WordgenieInputProps {
  onSubmit?: (value: string) => void;
  hideHeader?: boolean;
  showSettings?: boolean;
  excludeSettings?: string[];
  placeholder?: string;
  selectedMode?: { label: string; icon: ReactNode; onRemove: () => void };
  topRow?: ReactNode;
  borderless?: boolean;
  /** Presentations get their own free-generation pool, separate from manuscripts — a
   *  genuinely different, more premium output, not a shared count. Only meaningful
   *  alongside a custom `onSubmit`; book flow (no onSubmit) always uses the book pool. */
  presentationMode?: boolean;
}

/* Copy differences between the book and presentation free-generation gates — everything
   else (layout, buttons, dismiss behavior) is identical, so this is the only thing that
   varies by flowKind rather than duplicating all three modals. Standard Wordgenie is a
   book-only fallback (no presentation equivalent exists), so presentation copy never
   mentions it. */
const FLOW_COPY = {
  book: {
    noun: 'book',
    introHeadline: (limit: number) => `You've got ${limit} free book generations.`,
    introBody: (limit: number) => `New Wordgenie writes a full manuscript from your idea — ${limit} free books, no strings attached. Need more later?`,
    proBenefitIntro: 'Upgrade your plan to keep creating books with Wordgenie — compare Pro, Premium, and Agency Premium below.',
    showStandardFallback: true,
  },
  presentation: {
    noun: 'presentation',
    introHeadline: (limit: number) => `You've got ${limit} free presentation generations.`,
    introBody: (limit: number) => `New Wordgenie turns your idea into a full slide deck — ${limit} free presentations, no strings attached. Need more later?`,
    proBenefitIntro: 'Upgrade your plan to keep creating presentations with Wordgenie — compare Pro, Premium, and Agency Premium below.',
    showStandardFallback: false,
  },
} as const;
type FlowKind = keyof typeof FLOW_COPY;

/* Entry-point choice shown above the input for the book-creation mode: v4 is the
   flow this whole app already is, Standard Wordgenie is the older multi-step
   generator (sub-niches → title → tone → doc) that standard-tier users fall back
   to once they've used their 5 free v4 generations. Only the toggle ships here —
   the Standard flow itself is a stub pending a real spec. */
export function WordgenieModeToggle() {
  const [showStub, setShowStub] = useState(false);
  const sparkleGradientId = useId();

  // The parent wraps topRow in overflow:hidden (to keep its rounded top corners),
  // so an absolutely-positioned popover here would get clipped — swap the row's
  // content in place instead.
  if (showStub) {
    return (
      <div className="flex items-center justify-between" style={{ padding: '10px 16px', gap: 12 }}>
        <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 13, color: '#52637A' }}>
          <span style={{ fontWeight: 700, color: '#15191F' }}>Standard Wordgenie</span> — the classic sub-niches → title → tone flow isn&apos;t wired up in this preview yet.
        </p>
        <button
          type="button"
          onClick={() => setShowStub(false)}
          style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 12.5, fontWeight: 700, color: '#006EFE', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
        >
          Got it
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between" style={{ padding: '10px 16px', gap: 20 }}>
      {/* Not a control — this is what's already active below (the prompt box + AI chat) —
          but it's the flagship AI mode, so it gets the same brand gradient as the send
          button below rather than being muted into a plain caption. Still no button
          semantics: no cursor pointer, no hover state, so it doesn't imply a click. */}
      <div className="flex items-center" style={{ gap: 6 }}>
        <svg width="15" height="15" viewBox="0 0 24 24">
          <defs>
            <linearGradient id={sparkleGradientId} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#006EFE" />
              <stop offset="100%" stopColor="#5326BD" />
            </linearGradient>
          </defs>
          <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" fill={`url(#${sparkleGradientId})`} />
        </svg>
        <span style={{
          fontFamily: "'Nunito Sans', sans-serif", fontSize: 13.5, fontWeight: 800,
          background: 'linear-gradient(259.1deg, #006EFE -2.17%, #5326BD 103.16%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent',
        }}>
          New Wordgenie
        </span>
      </div>
      <button
        type="button"
        onClick={() => setShowStub(true)}
        className="flex items-center cursor-pointer"
        style={{ gap: 6, fontFamily: "'Nunito Sans', sans-serif", fontSize: 13.5, fontWeight: 700, color: '#006EFE', background: 'none', border: 'none', padding: 0, textDecoration: 'none' }}
        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#006EFE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L11 16l-4 1 1-4 10.5-10.5z" />
        </svg>
        Use Standard Wordgenie
      </button>
    </div>
  );
}

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

function ModalHeader({ headline, id }: { headline: ReactNode; id?: string }) {
  return (
    <div style={{ padding: '26px 32px 4px' }}>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 14 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: '#EAF1FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="#006EFE"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" /></svg>
        </div>
        <span style={{ ...ns, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8596AD' }}>Wordgenie AI v4</span>
      </div>
      <p id={id} style={{ ...ns, fontSize: 21, fontWeight: 800, color: '#001633', margin: 0, lineHeight: 1.3 }}>{headline}</p>
    </div>
  );
}

/* Shared shell for the three gating modals below: dialog semantics, Escape-to-close and
   backdrop-click-to-close match the convention already used by ImportDocxModal/ShareLinkModal
   elsewhere in this app — these three just hadn't picked it up yet. */
function ModalShell({
  onClose,
  labelId,
  initialFocusRef,
  children,
}: {
  onClose: () => void;
  labelId: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  useEffect(() => {
    initialFocusRef?.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, initialFocusRef]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(20,25,31,0.40)', zIndex: 9999 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white relative"
        style={{ width: 480, borderRadius: 16, boxShadow: '0 16px 48px rgba(0,64,180,0.1), 0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/* States the actual consequence plainly and points at the comparison table rather than
   naming Pro's specific perks — the button below opens every tier (Pro just highlighted),
   so listing Pro-only features here would anchor the reader to Pro when Premium or Agency
   might genuinely fit them better. */
/* standardFallback: near-limit has no dedicated "Use Standard Wordgenie" button (unlike the
   exhausted modal), so its only mention of that path lives here — kept second, after the
   upgrade pitch, so upgrading reads as the first encouragement and Standard as the fallback. */
function ProBenefitList({ flowKind = 'book', standardFallback = false }: { flowKind?: FlowKind; standardFallback?: boolean }) {
  // Presentations have no Standard fallback (see FLOW_COPY), so the second line never
  // renders there even if a caller passes standardFallback — book is the only flow with
  // an "instead" path to offer.
  const showFallback = standardFallback && FLOW_COPY[flowKind].showStandardFallback;
  return (
    <>
      <p style={{ ...ns, fontSize: 13, fontWeight: 400, color: '#52637A', margin: showFallback ? '0 0 8px' : '0 0 20px', lineHeight: 1.6 }}>
        {FLOW_COPY[flowKind].proBenefitIntro}
      </p>
      {showFallback && (
        <p style={{ ...ns, fontSize: 13, fontWeight: 400, color: '#52637A', margin: '0 0 20px', lineHeight: 1.6 }}>
          Or switch to Standard Wordgenie anytime.
        </p>
      )}
    </>
  );
}

function SelectedModeChip({ label, icon, onRemove }: { label: string; icon: ReactNode; onRemove: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.button
      type="button"
      onClick={onRemove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 10px 4px 7px', borderRadius: 999,
        background: '#EBF3FF', border: '1.5px solid #006EFE',
        color: '#006EFE', fontFamily: "'Nunito Sans', sans-serif",
        fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
      }}
    >
      {/* Fixed-size container keeps pill width stable during icon↔X swap */}
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, flexShrink: 0 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={hovered ? 'x' : 'icon'}
            initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.1 }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {hovered ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            ) : icon}
          </motion.span>
        </AnimatePresence>
      </span>
      {label}
    </motion.button>
  );
}

export default function WordgenieInput({ onSubmit, hideHeader, showSettings, excludeSettings, placeholder, selectedMode, topRow, borderless, presentationMode }: WordgenieInputProps) {
  const [value, setValue] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const submittingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const { handleHeroSubmit } = useFlowEngine();
  const manuscriptsUsed = useFlowStore((s) => s.manuscriptGenerationsUsed);
  const manuscriptsRemaining = Math.max(MANUSCRIPT_GENERATION_LIMIT - manuscriptsUsed, 0);
  const presentationsUsed = useFlowStore((s) => s.presentationGenerationsUsed);
  const presentationsRemaining = Math.max(PRESENTATION_GENERATION_LIMIT - presentationsUsed, 0);

  // Which pool this instance gates against — book flow (no onSubmit) always uses the
  // book pool; a caller opts into the presentation pool via presentationMode. Plain
  // landing submits (onSubmit set, presentationMode unset) still skip gating entirely,
  // unchanged from before.
  const flowKind: FlowKind = presentationMode ? 'presentation' : 'book';
  const GENERATION_LIMIT = flowKind === 'presentation' ? PRESENTATION_GENERATION_LIMIT : MANUSCRIPT_GENERATION_LIMIT;
  const generationsRemaining = flowKind === 'presentation' ? presentationsRemaining : manuscriptsRemaining;

  // v4 intro — gated behind the first actual submit, not mode-selection, so someone
  // heading for "Use Standard Wordgenie" instead never sees v4-specific copy meant
  // for the flow they didn't choose. Three states beyond that first welcome: a near-limit
  // nudge at 80% used (still fully optional — "Continue" stays primary), and an exhausted
  // stop at 100% (the only point where "Upgrade to Pro" earns to be the prominent choice).
  const [showV4Intro, setShowV4Intro] = useState(false);
  const [showNearLimitModal, setShowNearLimitModal] = useState(false);
  const [showExhaustedModal, setShowExhaustedModal] = useState(false);
  const [showExhaustedStandardStub, setShowExhaustedStandardStub] = useState(false);
  const [showUpgradeFromIntro, setShowUpgradeFromIntro] = useState(false);
  // Keyed per flow kind — dismissing the book intro shouldn't silently suppress the
  // presentation one too, since a single instance can switch flowKind across renders
  // (e.g. HomePage's mode chips) without remounting.
  const [seenIntroThisSession, setSeenIntroThisSession] = useState<Record<FlowKind, boolean>>({ book: false, presentation: false });
  const [pendingSubmitText, setPendingSubmitText] = useState<string | null>(null);
  const v4IntroCtaRef = useRef<HTMLButtonElement>(null);
  const nearLimitCtaRef = useRef<HTMLButtonElement>(null);
  const exhaustedCtaRef = useRef<HTMLButtonElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [value]);

  // Close file menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setShowFileMenu(false);
      }
    }
    if (showFileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFileMenu]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const introKey = (kind: FlowKind) => kind === 'presentation' ? 'dsgn_wordgenie_presentation_intro_seen' : 'dsgn_wordgenie_v4_intro_seen';

  const proceedWithSubmit = (text: string) => {
    submittingRef.current = true;
    setValue('');
    setAttachedFiles([]);
    if (onSubmit) {
      onSubmit(text);
    } else {
      handleHeroSubmit(text);
    }
  };

  const handleSubmit = () => {
    if (!value.trim() || submittingRef.current) return;
    const trimmed = value.trim();

    // Book flow (no onSubmit override) and presentation flow (onSubmit + presentationMode)
    // both gate on their own free-generation pool. Plain landing submits (onSubmit set,
    // presentationMode unset) still skip straight through, unchanged from before.
    const isGatedFlow = !onSubmit || presentationMode;
    if (isGatedFlow) {
      if (generationsRemaining <= 0) {
        // Exhausted: starting the chat flow would only dead-end several steps later,
        // after the user's already invested the time. Catch it here instead.
        setShowExhaustedModal(true);
        return;
      }
      const alreadySeenIntro = seenIntroThisSession[flowKind]
        || (typeof window !== 'undefined' && localStorage.getItem(introKey(flowKind)) === 'true');
      if (!alreadySeenIntro) {
        setPendingSubmitText(trimmed);
        setShowV4Intro(true);
        return;
      }
      const usedRatio = (GENERATION_LIMIT - generationsRemaining) / GENERATION_LIMIT;
      if (usedRatio >= 0.8) {
        setPendingSubmitText(trimmed);
        setShowNearLimitModal(true);
        return;
      }
    }

    proceedWithSubmit(trimmed);
  };

  const markV4IntroSeen = () => {
    setSeenIntroThisSession((prev) => ({ ...prev, [flowKind]: true }));
    if (typeof window !== 'undefined') localStorage.setItem(introKey(flowKind), 'true');
    setShowV4Intro(false);
  };

  // Primary CTA: acknowledge the intro and submit the prompt that triggered it.
  const resolveV4Intro = () => {
    markV4IntroSeen();
    const text = pendingSubmitText;
    setPendingSubmitText(null);
    if (text) proceedWithSubmit(text);
    else textareaRef.current?.focus();
  };

  // X / Escape / backdrop: acknowledge the intro but don't submit — the user gets their
  // prompt back to reconsider, matching what a close control means everywhere else.
  const dismissV4Intro = () => {
    markV4IntroSeen();
    setPendingSubmitText(null);
    textareaRef.current?.focus();
  };

  const resolveNearLimitModal = () => {
    setShowNearLimitModal(false);
    const text = pendingSubmitText;
    setPendingSubmitText(null);
    if (text) proceedWithSubmit(text);
    else textareaRef.current?.focus();
  };

  const dismissNearLimitModal = () => {
    setShowNearLimitModal(false);
    setPendingSubmitText(null);
    textareaRef.current?.focus();
  };

  const dismissExhaustedModal = () => {
    setShowExhaustedModal(false);
    setShowExhaustedStandardStub(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = (accept: string) => {
    setShowFileMenu(false);
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) setAttachedFiles((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        const mockTranscriptions = [
          "I'm a life coach who has been helping people find their purpose for over 10 years. I want to write a book about finding meaning in everyday moments.",
          "I've been teaching yoga and mindfulness for 8 years and I want to share my philosophy about connecting mind and body through breath work.",
          "I'm a nutritionist specializing in gut health. I want to write about the connection between what we eat and how we feel mentally.",
        ];
        setValue((prev) => prev + (prev ? ' ' : '') + mockTranscriptions[Math.floor(Math.random() * mockTranscriptions.length)]);
        setRecordingTime(0);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      alert('Microphone access is required for voice input. Please allow microphone access and try again.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const hasContent = value.trim().length > 0 || attachedFiles.length > 0;

  return (
    <>
    <motion.div
      initial={borderless ? false : { y: 16 }}
      animate={borderless ? false : { y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={borderless ? 'w-full' : 'mx-auto w-full max-w-[780px]'}
      style={borderless ? { position: 'relative', zIndex: showFileMenu ? 50 : 1 } : { background: 'white', borderRadius: 16, position: 'relative', zIndex: showFileMenu ? 50 : 1 }}
    >
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} multiple />

      {/* Main input container */}
      <div
        className="flex flex-col bg-white"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocusCapture={() => setIsFocused(true)}
        onBlurCapture={() => setIsFocused(false)}
        style={borderless ? {
          paddingTop: 12, paddingBottom: 4,
        } : {
          border: '1px solid #006EFE',
          borderRadius: 16,
          paddingTop: 12,
          paddingBottom: 4,
          boxShadow: isHovered || isFocused
            ? '0px 7px 22px 0px rgba(62, 57, 205, 0.15)'
            : '0px 0px 0px 0px rgba(62, 57, 205, 0)',
          transition: 'box-shadow 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* ── Optional top row (e.g. tabs for Version C) ── */}
        {topRow && (
          <>
            <div style={{ overflow: 'hidden', borderRadius: '15px 15px 0 0' }}>{topRow}</div>
            <div style={{ height: 1, backgroundColor: '#E0E5EB' }} />
          </>
        )}

        {/* ── Textarea ── */}
        <div style={{ padding: '10px 20px 4px' }}>
          <AnimatePresence>
            {attachedFiles.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap gap-2"
                style={{ marginBottom: 8 }}
              >
                {attachedFiles.map((file, i) => (
                  <motion.div
                    key={`${file.name}-${i}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs"
                  >
                    <FileTypeIcon filename={file.name} />
                    <span className="max-w-[120px] truncate text-text-primary">{file.name}</span>
                    <span className="text-text-tertiary">({formatFileSize(file.size)})</span>
                    <button onClick={() => removeFile(i)} className="ml-1 cursor-pointer text-text-tertiary transition-colors hover:text-red-500">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          {isRecording ? (
            <div className="flex flex-1 items-center gap-3" style={{ minHeight: 24 }}>
              <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
              <span className="text-sm font-medium text-text-primary">Recording...</span>
              <span className="font-mono text-sm text-text-tertiary">{formatTime(recordingTime)}</span>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder ?? 'What would you like to create today?'}
              rows={1}
              className="max-h-[120px] w-full resize-none bg-transparent font-normal text-text-placeholder focus:outline-none overflow-hidden"
              style={{ fontSize: 16, lineHeight: '24px', minHeight: 72, color: value ? '#15191F' : undefined, fontFamily: "'Nunito Sans', sans-serif" }}
            />
          )}
        </div>

        {/* ── Bottom row: + button (left), [settings], mic + send (right) ── */}
        <div className="flex items-center justify-between" style={{ padding: '2px 12px 4px' }}>
            {/* Left: + Attach + optional settings pills */}
            <div className="flex items-center" style={{ gap: 8 }}>
            <div className="relative" ref={fileMenuRef}>
              <Tooltip label="Add your files">
                <button
                  onClick={() => setShowFileMenu(!showFileMenu)}
                  className="flex shrink-0 cursor-pointer items-center justify-center transition-colors hover:bg-surface"
                  style={{ width: 40, height: 40, borderRadius: 8, border: 'none' }}
                  aria-label="Attach file"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0">
                    <path d="M9 3.667V14.333M3.667 9H14.333" stroke="#3D4A5C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </Tooltip>

              {/* File type dropdown */}
              <AnimatePresence>
                {showFileMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-lg bg-white py-2"
                    style={{ boxShadow: '0px 2px 32px rgba(143, 132, 171, 0.18)' }}
                  >
                    <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Attach file</p>
                    <button onClick={() => handleFileSelect('.pdf,.doc,.docx,.txt,.rtf,.md')} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#006EFE" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg></div>
                      <div><p className="text-sm font-medium text-text-primary">Document</p><p className="text-[11px] text-text-tertiary">PDF, DOC, TXT, MD</p></div>
                    </button>
                    <button onClick={() => handleFileSelect('.jpg,.jpeg,.png,.gif,.webp,.svg')} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg></div>
                      <div><p className="text-sm font-medium text-text-primary">Image</p><p className="text-[11px] text-text-tertiary">JPG, PNG, GIF, WebP</p></div>
                    </button>
                    <button onClick={() => handleFileSelect('.mp3,.wav,.m4a,.ogg,.webm')} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5326BD" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg></div>
                      <div><p className="text-sm font-medium text-text-primary">Audio</p><p className="text-[11px] text-text-tertiary">MP3, WAV, M4A</p></div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <AnimatePresence>
              {selectedMode && <SelectedModeChip key="chip" {...selectedMode} />}
            </AnimatePresence>
            {showSettings && <SettingsPillRow compact exclude={excludeSettings} />}
            </div>

            {/* Right side: mic + send */}
            <div className="flex items-center" style={{ gap: 8 }}>
              <Tooltip label={isRecording ? 'Stop recording' : 'Voice input'}>
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`flex shrink-0 cursor-pointer items-center justify-center transition-all duration-200 ${isRecording ? 'border border-red-200 bg-red-50 text-red-500 hover:bg-red-100' : 'text-[#3D4A5C] hover:bg-surface'}`}
                  style={{ width: 40, height: 40, borderRadius: 8, border: isRecording ? undefined : '1.053px solid #E0E5EB' }}
                  aria-label={isRecording ? 'Stop recording' : 'Voice input'}
                >
                  {isRecording ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M9 1.5a2.25 2.25 0 0 0-2.25 2.25v6A2.25 2.25 0 0 0 9 12a2.25 2.25 0 0 0 2.25-2.25v-6A2.25 2.25 0 0 0 9 1.5z" stroke="#3D4A5C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14.25 7.5v1.5a5.25 5.25 0 0 1-10.5 0V7.5" stroke="#3D4A5C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="9" y1="14.25" x2="9" y2="16.5" stroke="#3D4A5C" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  )}
                </button>
              </Tooltip>

              <Tooltip label="Send message">
                <motion.button
                  whileHover={hasContent ? { scale: 1.03 } : {}}
                  whileTap={hasContent ? { scale: 0.97 } : {}}
                  onClick={handleSubmit}
                  disabled={!hasContent}
                  className="flex shrink-0 items-center justify-center transition-all duration-200"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: hasContent
                      ? 'linear-gradient(259.1deg, #006EFE -2.17%, #5326BD 103.16%)'
                      : 'linear-gradient(259.1deg, rgba(0, 110, 254, 0.3) -2.17%, rgba(83, 38, 189, 0.3) 103.16%)',
                    cursor: hasContent ? 'pointer' : 'not-allowed',
                    color: 'white',
                  }}
                  aria-label="Send message"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3.5 9L9 3.5L14.5 9M9 3.5V14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </motion.button>
              </Tooltip>
            </div>
          </div>
        </div>
    </motion.div>

    {/* One-time welcome — first submit only, per flow (book and presentation each get their
        own, since they're separate pools). A true first encounter, before any usage exists
        to point back to, so there's no stat and no Pro pitch here — just what Wordgenie is
        and that the 5 generations are a no-strings gift. */}
    {showV4Intro && (
      <ModalShell onClose={dismissV4Intro} labelId="v4-intro-heading" initialFocusRef={v4IntroCtaRef}>
        <button
          onClick={dismissV4Intro}
          className="absolute flex items-center justify-center hover:opacity-60 transition-opacity cursor-pointer"
          style={{ top: 20, right: 20, width: 24, height: 24, background: 'none', border: 'none', padding: 0 }}
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M14 4L4 14M4 4l10 10" stroke="#29323D" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>

        <ModalHeader id="v4-intro-heading" headline={FLOW_COPY[flowKind].introHeadline(GENERATION_LIMIT)} />

        <div style={{ padding: '8px 32px 24px' }}>
          <p style={{ ...ns, fontSize: 14, color: '#29323D', lineHeight: 1.6, margin: 0 }}>
            {FLOW_COPY[flowKind].introBody(GENERATION_LIMIT)}{' '}
            <button
              onClick={() => { markV4IntroSeen(); setShowUpgradeFromIntro(true); }}
              style={{ color: '#006EFE', fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Upgrade your plan
            </button>
            {FLOW_COPY[flowKind].showStandardFallback && <>, or switch to Standard Wordgenie anytime.</>}
          </p>

          <div className="flex items-center justify-end" style={{ marginTop: 22 }}>
            <button
              ref={v4IntroCtaRef}
              onClick={resolveV4Intro}
              style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' }}
            >
              Get started
            </button>
          </div>
        </div>
      </ModalShell>
    )}

    {/* 80% used — a real generation is still available, so "Continue" stays primary.
        The upgrade path is visible but stays secondary until it's the only option left. */}
    {showNearLimitModal && (
      <ModalShell onClose={dismissNearLimitModal} labelId="near-limit-heading" initialFocusRef={nearLimitCtaRef}>
        <button
          onClick={dismissNearLimitModal}
          className="absolute flex items-center justify-center hover:opacity-60 transition-opacity cursor-pointer"
          style={{ top: 20, right: 20, width: 24, height: 24, background: 'none', border: 'none', padding: 0 }}
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M14 4L4 14M4 4l10 10" stroke="#29323D" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>

        <ModalHeader id="near-limit-heading" headline={`You've used ${GENERATION_LIMIT - generationsRemaining} of your ${GENERATION_LIMIT} free ${FLOW_COPY[flowKind].noun} generations.`} />

        <div style={{ padding: '8px 32px 24px' }}>
          <p style={{ ...ns, fontSize: 13, color: '#52637A', margin: '0 0 20px' }}>
            <b style={{ color: '#B8860B' }}>{generationsRemaining} free {FLOW_COPY[flowKind].noun} generation{generationsRemaining === 1 ? '' : 's'}</b> left.
          </p>
          <ProBenefitList flowKind={flowKind} standardFallback />
          <div className="flex items-center justify-end" style={{ gap: 14 }}>
            <button
              onClick={() => { setShowNearLimitModal(false); setPendingSubmitText(null); setShowUpgradeFromIntro(true); }}
              style={{ ...ns, fontSize: 13.5, fontWeight: 600, color: '#006EFE', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              Upgrade to Pro
            </button>
            <button
              ref={nearLimitCtaRef}
              onClick={resolveNearLimitModal}
              style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' }}
            >
              Continue
            </button>
          </div>
        </div>
      </ModalShell>
    )}

    {/* 100% used — the only state where "Continue" genuinely isn't an option, so
        "Upgrade to Pro" earns to be the prominent choice. "Use Standard Wordgenie instead"
        used to silently dismiss (identical to the X button) even though that flow isn't
        wired up — same honest stub WordgenieModeToggle already shows elsewhere, so this
        doesn't quietly promise a working alternative that doesn't exist. */}
    {showExhaustedModal && (
      <ModalShell onClose={dismissExhaustedModal} labelId="exhausted-heading" initialFocusRef={exhaustedCtaRef}>
        <button
          onClick={dismissExhaustedModal}
          className="absolute flex items-center justify-center hover:opacity-60 transition-opacity cursor-pointer"
          style={{ top: 20, right: 20, width: 24, height: 24, background: 'none', border: 'none', padding: 0 }}
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M14 4L4 14M4 4l10 10" stroke="#29323D" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>

        <ModalHeader id="exhausted-heading" headline={`You've used all ${GENERATION_LIMIT} free ${FLOW_COPY[flowKind].noun} generations.`} />

        {showExhaustedStandardStub ? (
          <div style={{ padding: '8px 32px 24px' }}>
            <p style={{ ...ns, fontSize: 13, color: '#52637A', lineHeight: 1.6, margin: '0 0 20px' }}>
              <span style={{ fontWeight: 700, color: '#15191F' }}>Standard Wordgenie</span> — the classic sub-niches → title → tone flow isn&apos;t wired up in this preview yet.
            </p>
            <div className="flex items-center justify-end">
              <button
                onClick={() => setShowExhaustedStandardStub(false)}
                style={{ ...ns, fontSize: 13.5, fontWeight: 700, color: '#006EFE', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                Got it
              </button>
            </div>
          </div>
        ) : (
        <div style={{ padding: '8px 32px 24px' }}>
          <ProBenefitList flowKind={flowKind} />
          <div className="flex items-center justify-end" style={{ gap: 14 }}>
            {FLOW_COPY[flowKind].showStandardFallback && (
              <button
                onClick={() => setShowExhaustedStandardStub(true)}
                style={{ ...ns, fontSize: 13.5, fontWeight: 600, color: '#006EFE', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                Use Standard Wordgenie
              </button>
            )}
            <button
              ref={exhaustedCtaRef}
              onClick={() => { setShowExhaustedModal(false); setShowUpgradeFromIntro(true); }}
              style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' }}
            >
              Upgrade to Pro
            </button>
          </div>
        </div>
        )}
      </ModalShell>
    )}

    {showUpgradeFromIntro && (
      <UpgradePlanModal
        onClose={() => setShowUpgradeFromIntro(false)}
        currentPlanId="standard"
        contextMessage={generationsRemaining <= 0
          ? `You've used all your ${FLOW_COPY[flowKind].noun} generations this month.`
          : `Unlock unlimited Wordgenie ${FLOW_COPY[flowKind].noun} generations`}
        highlightPlanId="pro"
      />
    )}
    </>
  );
}



function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function FileTypeIcon({ filename }: { filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
  const isAudio = ['mp3', 'wav', 'm4a', 'ogg', 'webm'].includes(ext);
  const color = isImage ? '#22c55e' : isAudio ? '#5326BD' : '#006EFE';
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
