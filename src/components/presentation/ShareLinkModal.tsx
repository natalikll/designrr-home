'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

interface ShareLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
}

export default function ShareLinkModal({ isOpen, onClose, url }: ShareLinkModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={onClose} />

          <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && onClose()}>

            <div className="bg-white relative" style={{ borderRadius: 20, maxWidth: 480, width: '90%', padding: '36px 36px 32px', boxShadow: '0px 24px 80px rgba(15,23,51,0.18)' }}
              onClick={e => e.stopPropagation()}>

              {/* Close */}
              <button onClick={onClose} className="absolute cursor-pointer flex items-center justify-center"
                style={{ top: 16, right: 16, width: 28, height: 28, borderRadius: '50%', background: '#F4F6F9', border: 'none' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>

              {/* Header */}
              <div style={{ marginBottom: 20 }}>
                <div className="flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 12, background: '#EAF2FF', marginBottom: 16 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#006EFE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07l-1.5 1.5"/>
                    <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.5-1.5"/>
                  </svg>
                </div>
                <h2 style={{ ...ns, fontSize: 19, fontWeight: 700, color: '#0D1433', marginBottom: 6 }}>
                  Share link
                </h2>
                <p style={{ ...ns, fontSize: 13, color: '#52637A', lineHeight: 1.5 }}>
                  Anyone with this link can view the presentation. They won&apos;t be able to make any edits.
                </p>
              </div>

              {/* URL row */}
              <div className="flex items-center" style={{ gap: 8 }}>
                <div className="flex-1 flex items-center" style={{ background: '#F6F7F9', borderRadius: 8, padding: '10px 14px', minWidth: 0 }}>
                  <span className="truncate" style={{ ...ns, fontSize: 13, color: '#52637A' }}>{url}</span>
                </div>
                <button onClick={handleCopy}
                  style={{ ...ns, fontSize: 13, fontWeight: 600, color: copied ? '#29A341' : '#fff', background: copied ? '#EAF7ED' : '#006EFE', border: 'none', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, transition: 'background 0.15s, color 0.15s' }}>
                  {copied ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1"/></svg>
                  )}
                  {copied ? 'Copied!' : 'Copy link'}
                </button>
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
