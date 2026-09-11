'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFlowEngine } from '@/hooks/useFlowEngine';
import { useFlowStore, manuscriptLimitFor, combinedGenerationsUsed, allowanceResetLabel, allowanceStateFor, planRank, PLAN_LABELS, type PlanId } from '@/stores/flowStore';
import { Tooltip } from '@/components/ui/Tooltip';
import { SettingsPillRow } from '@/components/presentation/SettingsPillRow';
import { UpgradePlanModal, MANUSCRIPT_ALLOWANCES } from '@/components/account/MyAccountView';
import { AISparkleIcon } from '@/components/presentation/presentationIcons';

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
    proBenefitIntro: 'Upgrade your plan to keep creating books with Wordgenie — compare Pro, Premium, and Agency Premium below.',
    showStandardFallback: true,
  },
  presentation: {
    noun: 'presentation',
    proBenefitIntro: 'Upgrade your plan to keep creating presentations with Wordgenie — compare Pro, Premium, and Agency Premium below.',
    showStandardFallback: false,
  },
} as const;
type FlowKind = keyof typeof FLOW_COPY;

/* Names the generator you're using, above the page heading rather than inside the composer.
   It used to sit in the box's top-left with the send button's brand gradient — and everything
   else inside a composer's chrome, across every product we looked at, is a control. Weight beat
   semantics, so a label that was deliberately not clickable still read as a button. The eyebrow
   slot above an h1 is never interactive, so the gradient can stay without lying. */
export function WordgenieEyebrow() {
  return (
    <div className="flex items-center justify-center">
      {/* The system's own lockup, not a re-drawn approximation — the official mark is a
          four-point star with two satellite sparkles (public/assets/wordgenie-icon.svg,
          mirrored in AISparkleIcon), and this file wraps it in the "New" pill beside the
          wordmark. ChatContainer already renders the same asset. Set below the Designrr
          logo's 24px so the sub-brand stays subordinate to the product brand. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/wordgenie-header.svg" alt="New Wordgenie" className="h-[24px] w-auto" />
    </div>
  );
}

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

function ModalHeader({ headline, id }: { headline: ReactNode; id?: string }) {
  return (
    <div style={{ padding: '26px 32px 4px' }}>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 14 }}>
        {/* The official mark (AISparkleIcon), not the generic star this used to draw —
            same source as the header lockup and every AI-generate affordance elsewhere. */}
        <div style={{ width: 34, height: 34, borderRadius: 9, background: '#EAF1FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <AISparkleIcon size={17} />
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
/* The `standardFallback` line lived here for the near-limit modal, which no longer exists —
   the exhausted modal has its own "Use Standard Wordgenie" button, so nothing needs the prose
   version any more. */
function ProBenefitList({ flowKind = 'book' }: { flowKind?: FlowKind }) {
  return (
    <p style={{ ...ns, fontSize: 13, fontWeight: 400, color: '#52637A', margin: '0 0 20px', lineHeight: 1.6 }}>
      {FLOW_COPY[flowKind].proBenefitIntro}
    </p>
  );
}

/* Fires only at the two documented thresholds — 80% and again at 100% — and sits flush inside
   the composer's top edge, sharing its border and rounded corners. Base44 renders its limit
   notice exactly this way. The original row sat *above* the border rather than inside it, which
   is what made it read as detached debris.
   Amber then red, not two shades of one hue: the metering guidance is explicit that info,
   warning and critical need genuinely distinct treatments. The upgrade link stays live at zero
   because it's the feature that's disabled, not the exit. */
/* One amber ground for both thresholds. No red at either end — running out of an allowance on a
   plan that has one is an expected state, not a failure, and red reads as something broke at the
   exact moment we're asking for money.
   The two states are told apart by the sentence rather than the colour, which is a stronger
   signal than a shade: "1 of 5 free book generations left" and "You've used all 5 free book
   generations" share no wording at all, and the CTA changes with them. The metering guidance
   warns against severities separated *only* by shades of one hue — copy this different isn't
   that failure mode.
   Amber in hue (H37) at high lightness (L91). Hue is what makes it read as amber rather than
   beige — the earlier pale version failed at H29, not because it was light. The page's
   blue-violet wash used to neutralise warm tints, but moving that blob off the centre line
   cleared the content column, so the tint no longer has to be dark to survive it.
   The link is amber too, not the navy it was. Everything on the bar now sits in one hue, which
   removes the vibration brand blue caused against a warm ground — the two are near opposites on
   the wheel. It takes a darker step of the same amber rather than the body's exact value, 9.3:1
   against the body's 7.1:1, so it still reads as the most prominent thing on the bar; and it
   keeps its underline, so the affordance never rests on hue alone.

   One ground for both thresholds, lighter than the #FEEED4 it replaces. The ground tints the
   whole composer, not just the bar, so a heavy tint made an ordinary state look like a fault;
   at 1.11 against white it reads as a change of temperature rather than a warning light.
   Both thresholds share it deliberately. A brief pass split them into two shades and the step
   was too small to read as anything — what actually separates the states is the sentence, which
   changes completely ("1 of 5 left" against "You've used all 5") along with the CTA. */
export const ALERT_TONE = { bg: '#FDF2DE', fg: '#7A4413', cta: '#63340B' } as const;

function UsageAlertBar({ remaining, limit, noun, exhausted, onUpgrade, ctaLabel }: {
  remaining: number;
  limit: number;
  noun: string;
  exhausted: boolean;
  onUpgrade: () => void;
  ctaLabel: string;
}) {
  const tone = ALERT_TONE;

  return (
    <div className="flex items-center justify-between" style={{ padding: '10px 18px', gap: 16 }}>
      <div className="flex items-center" style={{ gap: 6, minWidth: 0 }}>
        <span style={{ ...ns, fontSize: 12.5, fontWeight: 700, color: tone.fg, lineHeight: 1.4 }}>
          {exhausted
            ? `You've used all ${limit} free generations.`
            : `${remaining} of ${limit} free generations left.`}
        </span>
        {/* Muted, because it's context rather than the alert itself — but present, because it's
            the one alternative to paying and it belongs beside the number it qualifies. */}
        <span style={{ ...ns, fontSize: 12.5, fontWeight: 500, color: tone.fg, opacity: 0.7, lineHeight: 1.4, whiteSpace: 'nowrap' }}>
          · {allowanceResetLabel()}
        </span>
      </div>
      {/* Right-hand end, opposite the message — Base44 pairs its limit sentence with the upgrade
          link the same way, and it keeps the action clear of the text it acts on.
          Kept as bare text. Brand blue vibrated against the amber — the two sit near opposite
          each other on the wheel — so this is a deeper, less saturated navy that reads as a link
          without fighting the ground, underlined so the affordance doesn't rest on hue alone. */}
      <button
        type="button"
        onClick={onUpgrade}
        className="cursor-pointer hover:opacity-70 transition-opacity"
        style={{
          ...ns, fontSize: 12.5, fontWeight: 700, color: tone.cta,
          background: 'none', border: 'none', padding: 0,
          textDecoration: 'underline', textUnderlineOffset: 3,
          whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        {ctaLabel}
      </button>
    </div>
  );
}

/* Standard Wordgenie is a separate multi-step wizard on its own route, not a mode this box can
   switch into. It lives in the bottom toolbar with the other controls but behind a divider,
   because it is the one thing there that leaves rather than configures.
   No arrow: the divider already separates it from the controls, and "Use <destination>" is
   itself a going-somewhere phrase, so a glyph at 12.5px in a four-item toolbar was repeating a
   signal the words already send. Air and Elicit label their equivalents bare too. */
function StandardWordgenieLink() {
  const [showStub, setShowStub] = useState(false);

  if (showStub) {
    return (
      <span className="flex items-center" style={{ gap: 8 }}>
        <span style={{ ...ns, fontSize: 12.5, color: '#52637A', lineHeight: 1.4 }}>
          Not wired up in this preview yet.
        </span>
        <button
          type="button"
          onClick={() => setShowStub(false)}
          style={{ ...ns, fontSize: 12.5, fontWeight: 700, color: '#006EFE', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          Got it
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setShowStub(true)}
      className="cursor-pointer hover:opacity-70 transition-opacity"
      style={{ ...ns, fontSize: 12.5, fontWeight: 700, color: '#006EFE', background: 'none', border: 'none', padding: 0, whiteSpace: 'nowrap' }}
    >
      Use Standard Wordgenie
    </button>
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
  const currentPlan = useFlowStore((s) => s.currentPlan);
  const manuscriptsUsed = useFlowStore((s) => s.manuscriptGenerationsUsed);
  const presentationsUsed = useFlowStore((s) => s.presentationGenerationsUsed);

  // Which flavour this instance gates as — book flow (no onSubmit) always reads as a book;
  // a caller opts into presentation copy via presentationMode. Plain landing submits (onSubmit
  // set, presentationMode unset) still skip gating entirely, unchanged from before.
  const flowKind: FlowKind = presentationMode ? 'presentation' : 'book';
  // One shared allowance — a presentation and a book cost the same generation, so what's left
  // has to fall as either gets made. This used to read `manuscriptsRemaining` alone, which meant
  // a presentation never made a book scarcer (or vice versa) despite the copy right here already
  // saying otherwise — the gate just wasn't computing what its own comment claimed.
  const GENERATION_LIMIT = manuscriptLimitFor(currentPlan);
  const generationsRemaining = Math.max(GENERATION_LIMIT - combinedGenerationsUsed({ manuscriptGenerationsUsed: manuscriptsUsed, presentationGenerationsUsed: presentationsUsed }), 0);
  /* Premium and Agency are unlimited, so there's no number to count down and nothing to warn
     about. Every allowance affordance — the readout by the send button, the alert strip, the
     near-limit and exhausted modals — keys off this rather than each testing the plan itself. */
  const isUnlimited = !Number.isFinite(GENERATION_LIMIT);

  /* Only the plans that actually give more than the viewer already has. PRO doesn't solve a PRO
     user's limit, so "Upgrade to Pro" would be nonsense for them — Premium is their single
     answer and the CTA names it. A Standard user has two genuinely different answers (PRO's 10 a
     month, Premium's unlimited), so the CTA opens the choice rather than picking for them. */
  const betterPlans = MANUSCRIPT_ALLOWANCES.filter(
    (a) => planRank(a.plan as PlanId) > planRank(currentPlan),
  );
  const upgradeTarget = (betterPlans[0]?.plan ?? 'premium') as PlanId;

  /* Keyed on how many answers exist, not on how close to the limit they are. Being blocked
     changes the urgency, not which plan fits — so a Standard user sees the same offer at 4-of-5
     as at 5-of-5, and a PRO user is named Premium at both. Tying this to the threshold instead
     meant the same person got a different answer one generation apart. */
  const upgradeCtaLabel = betterPlans.length > 1
    ? 'See upgrade options'
    : `Upgrade to ${PLAN_LABELS[upgradeTarget]}`;

  /* Only once a mode is committed to: on the landing state no pool has been chosen yet, so a
     count there would answer a question nobody asked. (HomePageStandard only sets selectedMode
     for book, hence the presentationMode arm.) Gates the one-time welcome modal only — see
     `isPoolGated` below for the bar and the submit block, which don't wait on mode selection. */
  const isMeteredComposer = (!onSubmit || presentationMode) && (!!selectedMode || presentationMode);

  /* Whether this instance spends from the shared pool at all, regardless of whether a mode chip
     has been picked yet. The generic homepage box (no onSubmit, no mode selected) already enforces
     this on submit — handleSubmit blocks it with the exhausted modal — so the bar and the disabled
     send state need to agree with that block instead of staying silent until the mode is chosen. */
  const isPoolGated = !onSubmit || presentationMode;

  /* 80% and 100% are the documented pair for usage alerts. Both grounds are the same amber —
     the sentences differ completely, which separates the two states more sharply than a shade
     would, and neither is red: running out of an allowance is expected, not a failure.
     The threshold itself lives in allowanceStateFor so the sidebar meter turns amber on exactly
     the tick this bar appears — two surfaces disagreeing about the same allowance is worse than
     either being slightly off. */
  const nearingLimit = allowanceStateFor(generationsRemaining, GENERATION_LIMIT) === 'low';

  /* The modal shows the allowance cards whenever the allowance is what prompted it — at either
     threshold, since the question is identical at both. */
  const quotaGate = !isUnlimited && flowKind === 'book' && (nearingLimit || generationsRemaining <= 0)
    ? { allowances: MANUSCRIPT_ALLOWANCES }
    : undefined;


  /* The bar only exists when it has something to say, and it is now the only place the count
     appears in the flow. Base44 and Claude both keep the surface clean until the limit and then
     speak in place; monthly refilling allowances are silent in normal use across every product
     we checked. Below the threshold the number lives in My Account, not here.
     Keyed on `isPoolGated`, not `isMeteredComposer` — the general "what would you like to
     create?" box spends from the same pool before any mode is chosen, so it shows the same
     warning rather than only blocking silently once the user tries to submit. */
  const showAlertBar = isPoolGated && (nearingLimit || (!isUnlimited && generationsRemaining <= 0));
  const alertTone = showAlertBar ? ALERT_TONE : null;

  // Two states beyond entry: a near-limit nudge at 80% used (still fully optional —
  // "Continue" stays primary), and an exhausted stop at 100% (the only point where the
  // upgrade CTA earns to be the prominent choice).
  const [showExhaustedModal, setShowExhaustedModal] = useState(false);
  const [showExhaustedStandardStub, setShowExhaustedStandardStub] = useState(false);
  const [showUpgradeFromIntro, setShowUpgradeFromIntro] = useState(false);
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

    // Book flow (no onSubmit override), the generic landing box (also no onSubmit, mode not
    // yet chosen) and presentation flow (onSubmit + presentationMode) all gate on the shared
    // free-generation pool — see `isPoolGated`. Plain landing submits with an unrelated
    // onSubmit (presentationMode unset) still skip straight through, unchanged from before.
    // The intro welcome no longer lives here — it already fired on entry, before this could
    // be typed.
    if (isPoolGated && generationsRemaining <= 0) {
      // Exhausted: starting the chat flow would only dead-end several steps later,
      // after the user's already invested the time. Catch it here instead.
      setShowExhaustedModal(true);
      return;
    }

    proceedWithSubmit(trimmed);
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
  /* Two separate reasons the button can't fire, kept distinct: nothing typed yet, versus nothing
     left to spend. Enter still routes through handleSubmit, which opens the exhausted modal —
     so the keyboard explains the block rather than silently swallowing it. */
  const outOfGenerations = isPoolGated && !isUnlimited && generationsRemaining <= 0;
  /* Out of generations reads as disabled but stays clickable, so clicking it opens the same
     exhausted modal that Enter does. Truly disabling it made the two disagree — click did
     nothing, Enter explained — and a dead control that answers "why?" beats one that just sits
     there. `aria-disabled` carries the state to assistive tech without removing the handler.
     Empty input is the one case that's genuinely inert: there's nothing to explain. */
  const canSubmit = hasContent && !outOfGenerations;

  return (
    <>
    <motion.div
      initial={borderless ? false : { y: 16 }}
      animate={borderless ? false : { y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={borderless ? 'w-full' : 'mx-auto w-full max-w-[780px]'}
      style={borderless
        ? { position: 'relative', zIndex: showFileMenu ? 50 : 1 }
        : {
          /* At the thresholds the composer sits *on* the alert rather than carrying a row in its
             header — Base44's construction. The tint shows only above the input, not as a frame
             around it: a band on all four sides would read as a container the composer had been
             put into, when the point is just that the notice and the box are one object. The
             input stays flush left, right and bottom and keeps its own border. */
          background: alertTone ? alertTone.bg : 'white',
          borderRadius: 16,
          transition: 'background 0.2s ease',
          position: 'relative',
          zIndex: showFileMenu ? 50 : 1,
        }}
    >
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} multiple />

      {/* ── Usage alert, behind and above the input it governs ── */}
      {showAlertBar && (
        <UsageAlertBar
          remaining={generationsRemaining}
          limit={GENERATION_LIMIT}
          noun={FLOW_COPY[flowKind].noun}
          exhausted={generationsRemaining <= 0}
          onUpgrade={() => setShowUpgradeFromIntro(true)}
          ctaLabel={upgradeCtaLabel}
        />
      )}

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
          paddingTop: topRow ? 0 : 12,
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
              style={{ fontSize: 16, lineHeight: '24px', minHeight: 96, color: value ? '#15191F' : undefined, fontFamily: "'Nunito Sans', sans-serif" }}
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

            {/* Divided from the controls to its left, because it isn't one. ＋ and the mode chip
                configure this box; this leaves it for a different flow on another route. The
                rule stays the same as it was in the header — grouped with the controls at equal
                weight, a route reads as a mode you can toggle. The divider is what earns it a
                place in a row that's already carrying four things. */}
            {isMeteredComposer && flowKind === 'book' && (
              <>
                <div style={{ width: 1, height: 20, background: '#E0E5EB', margin: '0 2px' }} />
                <StandardWordgenieLink />
              </>
            )}
            </div>

            {/* Right side: allowance + mic + send */}
            <div className="flex items-center" style={{ gap: 8 }}>
              {/* No count here. It used to ride on the send button on Suno's precedent, but Suno,
                  Arcade and Gamma all sell top-up credits, and what Arcade's button states is the
                  cost of that one action ("Generate · 50") rather than the balance left. Nothing
                  in the study puts a remaining balance on an action button, and a permanent
                  scarcity label on the primary control is a poor trade for a number the alert bar
                  already gives at the only moment it is actionable. */}
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

              {/* Icon only, in every flow. The count used to ride here on Suno's and Arcade's
                  precedent, but those products sell top-up credits and Arcade's number is the
                  cost of the action rather than the balance left. Nothing in the study puts a
                  remaining balance on an action button, and products metering a monthly
                  allowance — Claude, Base44, HubSpot, Sprig, Coda — show nothing in the flow at
                  all until the limit. The allowance is disclosed on first entry by the intro
                  modal, then by the bar at 80% and 100%, and in full in My Account. */}
              {/* Disabled once the allowance is gone. This is the feature, and the feature is
                  what a limit disables — the way out stays live as the Upgrade link in the bar
                  above, which is the half of that rule that actually matters. Canva's own screen
                  does the same: Generate greys out at quota while the upgrade path doesn't. */}
              <Tooltip
                label={
                  outOfGenerations
                    ? `You've used all ${GENERATION_LIMIT} free generations — ${allowanceResetLabel().toLowerCase()}`
                    : isMeteredComposer ? 'Generate' : 'Send message'
                }
              >
                <motion.button
                  whileHover={canSubmit ? { scale: 1.03 } : {}}
                  whileTap={canSubmit ? { scale: 0.97 } : {}}
                  onClick={handleSubmit}
                  disabled={!hasContent}
                  aria-disabled={outOfGenerations || undefined}
                  className="flex shrink-0 items-center justify-center transition-all duration-200"
                  style={{
                    ...ns,
                    width: 40, height: 40, borderRadius: 8,
                    background: canSubmit
                      ? 'linear-gradient(259.1deg, #006EFE -2.17%, #5326BD 103.16%)'
                      : 'linear-gradient(259.1deg, rgba(0, 110, 254, 0.3) -2.17%, rgba(83, 38, 189, 0.3) 103.16%)',
                    cursor: hasContent ? 'pointer' : 'not-allowed',
                    color: 'white',
                  }}
                  aria-label={isMeteredComposer ? 'Generate' : 'Send message'}
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

    {/* 100% used — the only state where "Continue" genuinely isn't an option, so the
        upgrade CTA earns to be the prominent choice. "Use Standard Wordgenie instead"
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

        <ModalHeader id="exhausted-heading" headline={`You've used all ${GENERATION_LIMIT} free generations.`} />

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
              {upgradeCtaLabel}
            </button>
          </div>
        </div>
        )}
      </ModalShell>
    )}

    {showUpgradeFromIntro && (
      <UpgradePlanModal
        onClose={() => setShowUpgradeFromIntro(false)}
        // Not "unlock unlimited" below the limit — that promises Premium while the modal may be
        // offering PRO. State where they are; let the cards say what each one gives.
        contextMessage={generationsRemaining <= 0
          ? `You've used all ${GENERATION_LIMIT} generations this month.`
          : nearingLimit
            ? `${generationsRemaining} of ${GENERATION_LIMIT} generations left this month.`
            : 'Get more Wordgenie generations'}
        highlightPlanId={upgradeTarget}
        quota={quotaGate}
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
