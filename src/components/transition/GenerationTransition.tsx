'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFlowStore } from '@/stores/flowStore';
import { ParticleSystems, type ParticleSystemConfig } from './ParticleEffect';

/* ════════════════════════════════════════════════
   Premium Cinematic Generation Transition
   Agency-grade motion design with layered effects
   ════════════════════════════════════════════════ */

export function GenerationTransition() {
  const isTransitioning = useFlowStore((s) => s.isTransitioning);
  const transitionType = useFlowStore((s) => s.transitionType);
  const isBook = transitionType === 'book';

  return (
    <AnimatePresence>
      {isTransitioning && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] } }}
        >
          {/* Layer 1: Mesh gradient background */}
          <MeshGradientBg isBook={isBook} />

          {/* Layer 2: Floating light orbs */}
          <FloatingOrbs isBook={isBook} />

          {/* Layer 3: Pulse rings */}
          <ParticleSystems
            systems={isBook
              ? [
                  { type: 'ring', count: 3, speed: 2.5, colors: ['#006EFE', '#8b5cf6', '#a78bfa'], delay: 0.2 },
                  { type: 'ring', count: 2, speed: 3, colors: ['#5326BD', '#6366f1'], delay: 0.5 },
                ]
              : [
                  { type: 'ring', count: 3, speed: 2, colors: ['#8b5cf6', '#a78bfa', '#c4b5fd'], delay: 0.2 },
                ]
            }
          />

          {/* Layer 4: Orbital sparkles / elements */}
          <ParticleSystems
            systems={isBook
              ? [
                  { type: 'orbit', count: 8, radius: 100, speed: 5, size: 5, colors: ['#006EFE', '#8b5cf6', '#a78bfa', '#5326BD'], delay: 0.4 },
                  { type: 'confetti', count: 40, spread: 300, delay: 0.5 },
                ]
              : [
                  { type: 'orbit', count: 12, radius: 80, speed: 4, size: 4, delay: 0.4 },
                  { type: 'burst', count: 20, spread: 200, size: 3, delay: 0.5 },
                ]
            }
          />

          {/* Layer 5: Ambient dust */}
          <ParticleSystems
            systems={[
              { type: 'ambient', count: isBook ? 40 : 30, spread: 400, colors: ['#8b5cf6', '#a78bfa', '#c4b5fd', '#006EFE'] },
            ]}
          />

          {/* Center content */}
          <div className="relative z-10 text-center flex flex-col items-center">
            {/* Glow halo behind icon */}
            <motion.div
              className="absolute rounded-full"
              style={{
                width: isBook ? 120 : 100,
                height: isBook ? 120 : 100,
                top: isBook ? -30 : -25,
                background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
              }}
              animate={{
                scale: [1, 1.4, 1],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Icon with spring entrance */}
            <motion.div
              className="mb-6 flex justify-center relative"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                type: 'spring',
                stiffness: 200,
                damping: 15,
                delay: 0.3,
              }}
            >
              {/* Continuous float */}
              <motion.div
                animate={{
                  y: [0, -4, 0, 4, 0],
                  rotate: isBook ? [0, 0, 0] : [-3, 3, -3],
                }}
                transition={{
                  duration: isBook ? 2 : 3,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                {isBook ? <PremiumBookIcon /> : <PremiumSparkleIcon />}
              </motion.div>
            </motion.div>

            {/* Progress text — blur-in + gradient */}
            <motion.p
              className="text-lg font-semibold gradient-text"
              initial={{ opacity: 0, y: 15, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: 0.6, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              {isBook ? 'Generating manuscript' : 'Crafting your book outline...'}
            </motion.p>

            {/* Subtitle */}
            <motion.p
              className="text-sm text-text-tertiary mt-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
            >
              {isBook ? 'This may take a moment' : 'AI is analyzing your direction'}
            </motion.p>

            {isBook && <TypewriterSectionProgress />}

            {/* Premium progress bar */}
            <motion.div
              className="mt-5 flex items-center gap-3"
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ delay: 0.7, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: 'center' }}
            >
              <div className="w-56 h-2 bg-border/60 rounded-full overflow-hidden relative">
                {/* Fill */}
                <motion.div
                  className="h-full gradient-bg rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{
                    duration: isBook ? 4.5 : 2.5,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                />
                {/* Shimmer overlay */}
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                  }}
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear', delay: 1 }}
                />
              </div>
              {isBook && <PercentageCounter duration={4.5} />}
            </motion.div>
          </div>

          {/* Completion flash (book only) */}
          {isBook && <CompletionFlash delay={4.3} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Mesh Gradient Background ─────────────────── */
function MeshGradientBg({ isBook }: { isBook: boolean }) {
  return (
    <div className="absolute inset-0">
      {/* Gradient 1: top-right, drifts left */}
      <motion.div
        className="absolute"
        style={{
          width: 600,
          height: 600,
          right: -100,
          top: -200,
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.06) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
        animate={{ x: [-20, 20, -20], y: [0, 30, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Gradient 2: bottom-left, drifts right */}
      <motion.div
        className="absolute"
        style={{
          width: 500,
          height: 500,
          left: -100,
          bottom: -150,
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.06) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
        animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
      {isBook && (
        /* Gradient 3: center (book only), slowly breathes */
        <motion.div
          className="absolute"
          style={{
            width: 400,
            height: 400,
            left: '50%',
            top: '50%',
            marginLeft: -200,
            marginTop: -200,
            background: 'radial-gradient(circle, rgba(0, 110, 254, 0.05) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  );
}

/* ── Floating Light Orbs ──────────────────────── */
function FloatingOrbs({ isBook }: { isBook: boolean }) {
  const orbConfigs = isBook
    ? [
        { size: 80, color: 'rgba(139, 92, 246, 0.12)', x: [-150, -120, -150], y: [-80, -50, -80], dur: 7 },
        { size: 60, color: 'rgba(0, 110, 254, 0.10)', x: [130, 100, 130], y: [60, 90, 60], dur: 9 },
        { size: 50, color: 'rgba(99, 102, 241, 0.10)', x: [-50, -80, -50], y: [120, 100, 120], dur: 8 },
      ]
    : [
        { size: 70, color: 'rgba(139, 92, 246, 0.10)', x: [-120, -100, -120], y: [-60, -40, -60], dur: 8 },
        { size: 55, color: 'rgba(167, 139, 250, 0.08)', x: [100, 80, 100], y: [50, 70, 50], dur: 10 },
      ];

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {orbConfigs.map((orb, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: orb.size,
            height: orb.size,
            background: orb.color,
            filter: 'blur(25px)',
          }}
          initial={{ x: orb.x[0], y: orb.y[0], opacity: 0 }}
          animate={{ x: orb.x, y: orb.y, opacity: 1 }}
          transition={{ duration: orb.dur, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

/* ── Premium Sparkle Icon (4-point star) ──────── */
function PremiumSparkleIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <defs>
        <linearGradient id="sparkle-premium" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="50%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#006EFE" />
        </linearGradient>
        <filter id="sparkle-glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Main 4-point star */}
      <path
        d="M32 4 L38 24 L58 32 L38 40 L32 60 L26 40 L6 32 L26 24 Z"
        fill="url(#sparkle-premium)"
        filter="url(#sparkle-glow)"
      />
      {/* Small accent sparkle */}
      <motion.path
        d="M48 8 L50 14 L56 16 L50 18 L48 24 L46 18 L40 16 L46 14 Z"
        fill="#a78bfa"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 1, 0], scale: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
        style={{ transformOrigin: '48px 16px' }}
      />
      <motion.path
        d="M14 42 L16 46 L20 48 L16 50 L14 54 L12 50 L8 48 L12 46 Z"
        fill="#c4b5fd"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 0.8, 0], scale: [0.5, 1, 0.5] }}
        transition={{ duration: 2.5, repeat: Infinity, delay: 1 }}
        style={{ transformOrigin: '14px 48px' }}
      />
    </svg>
  );
}

/* ── Premium Book Icon ────────────────────────── */
function PremiumBookIcon() {
  return (
    <div className="relative">
      {/* Glow ring behind book */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 90,
          height: 90,
          top: -15,
          left: -15,
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, transparent 70%)',
        }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.svg
        width="60"
        height="60"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ position: 'relative', zIndex: 1 }}
      >
        <defs>
          <linearGradient id="book-premium" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="50%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#006EFE" />
          </linearGradient>
          <filter id="book-glow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="url(#book-premium)" filter="url(#book-glow)" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="url(#book-premium)" filter="url(#book-glow)" />
        {/* Animated text lines inside book */}
        <motion.path
          d="M8 7h8"
          stroke="url(#book-premium)"
          strokeDasharray="100"
          strokeDashoffset="100"
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: 'easeOut' }}
        />
        <motion.path
          d="M8 10h6"
          stroke="url(#book-premium)"
          strokeDasharray="100"
          strokeDashoffset="100"
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 0.8, delay: 0.8, ease: 'easeOut' }}
        />
        <motion.path
          d="M8 13h7"
          stroke="url(#book-premium)"
          strokeDasharray="100"
          strokeDashoffset="100"
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 0.8, delay: 1.1, ease: 'easeOut' }}
        />
      </motion.svg>
    </div>
  );
}

/* ── Typewriter Section Progress ──────────────── */
function TypewriterSectionProgress() {
  const sections = [
    'Analyzing structure...',
    'Writing Section 1...',
    'Writing Section 2...',
    'Writing Section 3...',
    'Adding finishing touches...',
  ];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    if (currentIndex >= sections.length) return;

    const target = sections[currentIndex];
    let charIndex = 0;

    const typeInterval = setInterval(() => {
      if (charIndex <= target.length) {
        setDisplayText(target.slice(0, charIndex));
        charIndex++;
      } else {
        clearInterval(typeInterval);
        // Pause then move to next
        setTimeout(() => {
          setDisplayText('');
          setCurrentIndex((prev) => prev + 1);
        }, 600);
      }
    }, 40);

    return () => clearInterval(typeInterval);
  }, [currentIndex]);

  // Blink cursor
  useEffect(() => {
    const blink = setInterval(() => setShowCursor((c) => !c), 500);
    return () => clearInterval(blink);
  }, []);

  return (
    <motion.div
      className="mt-3 h-6 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.9 }}
    >
      <span className="text-sm text-text-tertiary font-medium">
        {displayText}
        <span style={{ opacity: showCursor ? 1 : 0 }} className="text-accent">|</span>
      </span>
    </motion.div>
  );
}

/* ── Percentage Counter ───────────────────────── */
function PercentageCounter({ duration }: { duration: number }) {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const durationMs = duration * 1000;

    const frame = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease-in-out curve to match progress bar
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      setPercent(Math.round(eased * 100));

      if (progress < 1) {
        requestAnimationFrame(frame);
      }
    };

    requestAnimationFrame(frame);
  }, [duration]);

  return (
    <motion.span
      className="text-xs font-semibold text-text-tertiary tabular-nums w-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1 }}
    >
      {percent}%
    </motion.span>
  );
}

/* ── Completion Flash (book only) ─────────────── */
function CompletionFlash({ delay }: { delay: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), delay * 1000);
    return () => clearTimeout(timer);
  }, [delay]);

  if (!show) return null;

  return (
    <motion.div
      className="absolute inset-0 bg-white pointer-events-none z-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.4, 0] }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
    />
  );
}
