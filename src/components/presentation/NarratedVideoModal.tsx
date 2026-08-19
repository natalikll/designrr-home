'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

type NarrationMode = 'record' | 'ai';

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 1.5a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0v-6A3.5 3.5 0 0 0 12 1.5z" stroke="#006EFE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.5 10.5v1.5a6.5 6.5 0 0 1-13 0v-1.5M12 18.5v3.5" stroke="#006EFE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16.5l-1.9-5.6L4.5 9l5.6-1.9L12 2z" fill="#7C3AED" />
      <circle cx="19" cy="18" r="1.4" fill="#7C3AED" />
    </svg>
  );
}

const OPTIONS: {
  mode: NarrationMode;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconBg: string;
  accent: string;
}[] = [
  {
    mode: 'record',
    title: 'Record yourself',
    subtitle: 'Record with mic, add camera optionally',
    icon: <MicIcon />,
    iconBg: '#EAF2FF',
    accent: '#006EFE',
  },
  {
    mode: 'ai',
    title: 'Use AI voice',
    subtitle: 'Choose from our AI voices or clone your own',
    icon: <SparkleIcon />,
    iconBg: '#F3EBFF',
    accent: '#7C3AED',
  },
];

export function NarratedVideoModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [hovered, setHovered] = useState<NarrationMode | null>(null);

  const handleSelect = (mode: NarrationMode) => {
    onClose();
    router.push(`/presentation/narration?mode=${mode}`);
  };

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
        style={{ borderRadius: 16, width: '90%', maxWidth: 640, padding: 36, boxShadow: '0px 24px 80px rgba(15,23,51,0.22)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="flex items-center justify-center cursor-pointer"
          style={{ position: 'absolute', top: 18, right: 18, width: 32, height: 32, borderRadius: '50%', background: '#F4F6F9', border: 'none' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <h2 style={{ ...ns, fontSize: 24, fontWeight: 700, color: '#0D1433', textAlign: 'center' }}>Narrated Video</h2>
        <p style={{ ...ns, fontSize: 14.5, color: '#52637A', textAlign: 'center', lineHeight: 1.5, marginTop: 10, marginBottom: 28 }}>
          Add a voiceover to each slide, then export as a video you can share, embed, or use as a course.
        </p>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {OPTIONS.map((opt) => {
            const active = hovered === opt.mode;
            return (
              <button
                key={opt.mode}
                type="button"
                onClick={() => handleSelect(opt.mode)}
                onMouseEnter={() => setHovered(opt.mode)}
                onMouseLeave={() => setHovered(null)}
                className="flex flex-col items-center text-center cursor-pointer bg-white"
                style={{
                  gap: 6, borderRadius: 14, padding: '28px 20px',
                  border: `1.5px solid ${active ? opt.accent : '#E8EBF2'}`,
                  transition: 'border-color 0.15s ease',
                }}
              >
                <div className="flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: 14, background: opt.iconBg, marginBottom: 6 }}>
                  {opt.icon}
                </div>
                <span style={{ ...ns, fontSize: 16, fontWeight: 700, color: active ? opt.accent : '#0D1433' }}>{opt.title}</span>
                <span style={{ ...ns, fontSize: 13, color: '#8596AD', lineHeight: 1.4 }}>{opt.subtitle}</span>
              </button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
