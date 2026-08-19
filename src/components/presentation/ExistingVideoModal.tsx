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
          style={{ position: 'absolute', top: 16, right: 16, width: 30, height: 30, borderRadius: '50%', background: '#F4F6F9', border: 'none', transition: 'background 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#E8EBF2'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#F4F6F9'; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        {/* Play-button-on-a-frame, not a bare camera glyph — this modal exists because a
            specific video already exists, so the icon reads as "here's that clip" rather than
            a generic "video" category marker. */}
        <div className="flex items-center justify-center" style={{ width: 48, height: 48, borderRadius: 14, background: '#EAF2FF', marginBottom: 18, flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="4" width="20" height="16" rx="4" fill="#006EFE"/>
            <path d="M10 8.7C10 8.14 10 7.86 10.115 7.712C10.216 7.582 10.371 7.507 10.535 7.51C10.723 7.514 10.947 7.678 11.394 8.005L15.994 11.375C16.354 11.638 16.534 11.769 16.596 11.932C16.65 12.075 16.65 12.233 16.596 12.376C16.534 12.539 16.354 12.671 15.994 12.933L11.394 16.304C10.947 16.63 10.723 16.794 10.535 16.798C10.371 16.802 10.216 16.727 10.115 16.596C10 16.449 10 16.171 10 15.614V8.7Z" fill="#EAF2FF"/>
          </svg>
        </div>

        <h2 style={{ ...ns, fontSize: 19, fontWeight: 700, color: '#0D1433', lineHeight: 1.3 }}>This deck already has a video</h2>
        {/* The title is the one fact worth scanning for — bolded and dark rather than boxed in
            plain quote marks, so it reads as "this specific thing" instead of blending into the
            rest of the gray sentence. No restating what the buttons below already say. */}
        <p style={{ ...ns, fontSize: 13.5, color: '#52637A', lineHeight: 1.55, marginTop: 8, marginBottom: 26 }}>
          <span style={{ color: '#334155', fontWeight: 700 }}>&ldquo;{videoTitle}&rdquo;</span> was narrated from this presentation. Continue that video, or start a separate one.
        </p>

        <button onClick={onContinue}
          className="cursor-pointer"
          style={{ ...ns, height: 44, borderRadius: 10, border: 'none', background: '#006EFE', color: '#fff', fontSize: 14, fontWeight: 700, boxShadow: '0 1px 2px rgba(0,110,254,0.05), 0 8px 20px rgba(0,110,254,0.28)', transition: 'background 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#0060E0'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
          Continue editing
        </button>

        {/* A real bordered secondary button, not a bare text link — abandoning an already-
            narrated video for a fresh, disconnected one is a decision with something to lose,
            not a "nevermind" you'd reach for by accident, so it earns the same button weight as
            the primary rather than reading as an afterthought. */}
        <button onClick={onStartNew}
          className="cursor-pointer"
          style={{ ...ns, height: 44, marginTop: 10, borderRadius: 10, border: '1.5px solid #E0E5EB', background: '#fff', color: '#334155', fontSize: 14, fontWeight: 600, transition: 'background 0.15s, border-color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#F8F9FC'; e.currentTarget.style.borderColor = '#C7CEDB'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#E0E5EB'; }}>
          Start a new video instead
        </button>
      </motion.div>
    </motion.div>
  );
}
