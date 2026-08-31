'use client';

import { motion } from 'framer-motion';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

/* Shown when "Create video" is clicked on a deck that already has a saved narrated video —
   lets the user resume that work instead of silently starting a second, disconnected one. */
export function ExistingVideoModal({ onContinue, onStartNew, onClose }: {
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
        style={{ borderRadius: 16, width: '90%', maxWidth: 480, padding: 24, boxShadow: '0px 24px 80px rgba(15,23,51,0.22)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="flex items-center justify-center cursor-pointer"
          style={{ position: 'absolute', top: 20, right: 20, width: 24, height: 24, borderRadius: '50%', background: 'transparent', border: 'none', transition: 'opacity 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.6'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <h2 style={{ ...ns, fontSize: 18, fontWeight: 800, color: '#0D1433', lineHeight: 1.25, marginTop: 6 }}>This deck already has a video</h2>
        <p style={{ ...ns, fontSize: 14, color: '#52637A', lineHeight: 1.55, marginTop: 10, marginBottom: 28 }}>
          A video already exists for this deck. Pick up where you left off, or start a separate one.
        </p>

        {/* Side by side and right-aligned, primary on the right — matches where the eye lands
            reading left to right, and where a confirm action sits in every other modal footer
            in this app. Auto-width instead of the old full-bleed stacked pair, since neither
            label needs the room and stacking implied a priority order neither button actually
            has. */}
        <div className="flex items-center justify-end" style={{ gap: 10 }}>
          <button onClick={onStartNew}
            className="cursor-pointer flex items-center justify-center"
            style={{ ...ns, height: 38, padding: '0 20px', borderRadius: 8, border: '1.5px solid #E0E5EB', background: '#fff', color: '#334155', fontSize: 14, fontWeight: 600, transition: 'background 0.15s, border-color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F8F9FC'; e.currentTarget.style.borderColor = '#C7CEDB'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#E0E5EB'; }}>
            Start a new video
          </button>

          <button onClick={onContinue}
            className="cursor-pointer flex items-center justify-center"
            style={{ ...ns, height: 38, padding: '0 20px', borderRadius: 8, border: 'none', background: '#006EFE', color: '#fff', fontSize: 14, fontWeight: 700, transition: 'background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0060E0'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
            Continue editing
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
