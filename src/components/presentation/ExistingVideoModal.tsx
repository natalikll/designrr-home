'use client';

import { motion } from 'framer-motion';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

/* Shown when "Create video" is clicked on a deck that already has a saved narrated video —
   lets the user resume that work instead of silently starting a second, disconnected one. */
export function ExistingVideoModal({ videoTitle, onContinue, onStartNew, onClose }: {
  videoTitle: string;
  onContinue: () => void;
  onStartNew: () => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(15,23,51,0.35)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white flex flex-col relative"
        style={{ borderRadius: 16, width: '90%', maxWidth: 420, padding: 32, boxShadow: '0px 24px 80px rgba(15,23,51,0.22)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="flex items-center justify-center cursor-pointer"
          style={{ position: 'absolute', top: 16, right: 16, width: 30, height: 30, borderRadius: '50%', background: '#F4F6F9', border: 'none' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <div className="flex items-center justify-center" style={{ width: 48, height: 48, borderRadius: 14, background: '#EAF2FF', marginBottom: 16 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="6" width="13" height="12" rx="2.5" fill="#006EFE"/>
            <path d="M15 9L21 6V18L15 15V9Z" fill="#006EFE"/>
          </svg>
        </div>

        <h2 style={{ ...ns, fontSize: 19, fontWeight: 700, color: '#0D1433' }}>You already have a video for this deck</h2>
        <p style={{ ...ns, fontSize: 13.5, color: '#52637A', lineHeight: 1.5, marginTop: 8, marginBottom: 24 }}>
          "{videoTitle}" was narrated from this presentation. Pick up where you left off, or start a separate video from scratch.
        </p>

        <button onClick={onContinue}
          className="cursor-pointer"
          style={{ ...ns, height: 42, borderRadius: 10, border: 'none', background: '#006EFE', color: '#fff', fontSize: 14, fontWeight: 600, transition: 'background 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#0060E0'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
          Continue editing
        </button>

        <button onClick={onStartNew}
          className="cursor-pointer"
          style={{ ...ns, height: 36, marginTop: 6, borderRadius: 10, border: 'none', background: 'transparent', color: '#8596AD', fontSize: 13, fontWeight: 600, transition: 'color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#52637A'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#8596AD'; }}>
          Start a new video instead
        </button>
      </motion.div>
    </motion.div>
  );
}
