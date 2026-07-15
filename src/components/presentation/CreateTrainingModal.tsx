'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

const PASSAGES = [
  "Great audiobooks don't just tell stories - they breathe life into them. Every pause, every rise in tone, and every quiet moment shapes how your listener feels. Your voice is the instrument that makes a reader feel something they cannot forget.",
  "A good narrator doesn't perform the words - they disappear into them. The best listening experiences feel less like being read to and more like being spoken with, one sentence at a time.",
  "Every book has a rhythm long before it has a reader. Find that rhythm, and the words will carry themselves; fight it, and even the best sentence falls flat in the room.",
];

const TIPS = [
  { title: 'Find a quiet room.', desc: 'No fans, traffic, or background music. Silence matters more than mic quality.' },
  { title: 'Speak clearly and naturally.', desc: "Read at your normal audiobook pace — don't slow down artificially." },
  { title: 'Record at least 30 seconds', desc: '60 seconds gives the best results. More audio = better clone accuracy.' },
  { title: 'Position mic 10–20 cm away', desc: 'Too close causes distortion, too far picks up room echo.' },
];

type Step = 'tips' | 'setup' | 'recording' | 'review' | 'training' | 'done';

function StepChrome({ step, onClose, children }: { step: number; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <span style={{ ...ns, fontSize: 12.5, color: '#8596AD' }}>{step} of 6</span>
        <button onClick={onClose} className="flex items-center justify-center cursor-pointer" style={{ width: 24, height: 24, borderRadius: '50%', background: 'none', border: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8596AD" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      {children}
    </>
  );
}

function CheckIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" stroke="#22A366" strokeWidth="1.4" />
      <path d="M6 10.3l2.4 2.4L14 7" stroke="#22A366" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WaveformBars({ count, activeCount, color }: { count: number; activeCount: number; color: string }) {
  return (
    <div className="flex items-center" style={{ gap: 2.5, height: 28 }}>
      {Array.from({ length: count }).map((_, i) => {
        const h = 5 + Math.abs(Math.sin(i * 0.85)) * 18;
        return <div key={i} style={{ width: 2.5, height: h, borderRadius: 2, background: i < activeCount ? color : `${color}55`, flexShrink: 0 }} />;
      })}
    </div>
  );
}

export function CreateTrainingModal({ onClose, onCreated }: { onClose: () => void; onCreated: (voiceName: string) => void }) {
  const [step, setStep] = useState<Step>('tips');
  const [voiceName, setVoiceName] = useState('Paul');
  const [passageIdx, setPassageIdx] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const startRecording = () => {
    setSeconds(0);
    setStep('recording');
    intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  const stopRecording = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setStep('review');
  };

  const useMyVoice = () => {
    setStep('training');
    setTimeout(() => setStep('done'), 1600);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(15,23,51,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={step === 'training' ? undefined : onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white flex flex-col"
        style={{ borderRadius: 16, width: '90%', maxWidth: 480, padding: 24, boxShadow: '0px 24px 80px rgba(15,23,51,0.22)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'tips' && (
          <StepChrome step={1} onClose={onClose}>
            <h2 style={{ ...ns, fontSize: 19, fontWeight: 700, color: '#0D1433', marginTop: 8 }}>Before you record</h2>
            <p style={{ ...ns, fontSize: 13.5, color: '#8596AD', marginTop: 4, marginBottom: 18 }}>A few tips for the best voice clone quality</p>

            <div className="flex flex-col" style={{ gap: 14, marginBottom: 22 }}>
              {TIPS.map((tip) => (
                <div key={tip.title} className="flex items-start" style={{ gap: 10 }}>
                  <div style={{ marginTop: 1, flexShrink: 0 }}><CheckIcon /></div>
                  <div>
                    <p style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F' }}>{tip.title}</p>
                    <p style={{ ...ns, fontSize: 12.5, color: '#8596AD', marginTop: 2, lineHeight: 1.4 }}>{tip.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end" style={{ gap: 10 }}>
              <button onClick={onClose} className="flex items-center cursor-pointer" style={{ gap: 6, ...ns, fontSize: 13.5, fontWeight: 600, color: '#52637A', background: 'none', border: '1px solid #E0E5EB', borderRadius: 9, padding: '10px 16px' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
                Back
              </button>
              <button onClick={() => setStep('setup')} className="flex items-center cursor-pointer" style={{ gap: 6, ...ns, fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 9, padding: '10px 18px' }}>
                I&apos;m ready to record
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </button>
            </div>
          </StepChrome>
        )}

        {step === 'setup' && (
          <StepChrome step={2} onClose={onClose}>
            <h2 style={{ ...ns, fontSize: 19, fontWeight: 700, color: '#0D1433', marginTop: 8 }}>Add your own voice</h2>
            <p style={{ ...ns, fontSize: 13.5, color: '#8596AD', marginTop: 4, marginBottom: 18 }}>Please record yourself reading the following sentence out loud:</p>

            <label style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: '#52637A' }}>Voice name</label>
            <input
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              style={{ ...ns, fontSize: 14, color: '#15191F', border: '1px solid #E0E5EB', borderRadius: 9, padding: '10px 12px', marginTop: 6, marginBottom: 16, outline: 'none' }}
            />

            <label style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: '#52637A' }}>Language</label>
            <div className="flex items-center justify-between" style={{ border: '1px solid #E0E5EB', borderRadius: 9, padding: '10px 12px', marginTop: 6, marginBottom: 22 }}>
              <span style={{ ...ns, fontSize: 14, color: '#15191F' }}>🇬🇧 English (UK)</span>
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="#8596AD" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>

            <div className="flex items-center justify-between" style={{ gap: 8 }}>
              <button onClick={() => setStep('tips')} className="flex items-center cursor-pointer" style={{ gap: 6, ...ns, fontSize: 13.5, fontWeight: 600, color: '#52637A', background: 'none', border: '1px solid #E0E5EB', borderRadius: 9, padding: '10px 16px' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
                Back
              </button>
              <div className="flex items-center" style={{ gap: 8, flex: 1, justifyContent: 'flex-end' }}>
                <div className="flex items-center" style={{ gap: 6, ...ns, fontSize: 13, color: '#52637A', border: '1px solid #E0E5EB', borderRadius: 9, padding: '10px 12px' }}>
                  🎤 Default: MacBook Pro
                </div>
                <button onClick={startRecording} className="flex items-center cursor-pointer flex-shrink-0" style={{ gap: 6, ...ns, fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#E2504F', border: 'none', borderRadius: 9, padding: '10px 18px' }}>
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#fff' }} />
                  Record
                </button>
              </div>
            </div>
          </StepChrome>
        )}

        {step === 'recording' && (
          <StepChrome step={3} onClose={onClose}>
            <h2 style={{ ...ns, fontSize: 19, fontWeight: 700, color: '#0D1433', marginTop: 8 }}>Recording…</h2>
            <p style={{ ...ns, fontSize: 13.5, color: '#8596AD', marginTop: 4, marginBottom: 18 }}>Read the passage clearly - speak at your natural pace</p>

            <div style={{ background: '#FAFAFA', border: '1px solid #F0F1F4', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
              <p style={{ ...ns, fontSize: 14.5, color: '#3A4351', lineHeight: 1.6, fontStyle: 'italic' }}>&ldquo;{PASSAGES[passageIdx]}&rdquo;</p>
              <div className="flex justify-center">
                <button onClick={() => setPassageIdx((i) => (i + 1) % PASSAGES.length)} className="flex items-center cursor-pointer" style={{ gap: 5, marginTop: 10, ...ns, fontSize: 12.5, fontWeight: 600, color: '#006EFE', background: 'none', border: 'none' }}>
                  Use different text
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between" style={{ background: '#F6F7FA', borderRadius: 10, padding: '10px 14px', marginBottom: 6 }}>
              <div className="flex items-center" style={{ gap: 10 }}>
                <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.1 }} style={{ width: 9, height: 9, borderRadius: '50%', background: '#E2504F' }} />
                <WaveformBars count={30} activeCount={Math.min(30, seconds * 2)} color="#006EFE" />
              </div>
              <span style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F' }}>0:{seconds.toString().padStart(2, '0')}</span>
            </div>
            <p style={{ ...ns, fontSize: 12, color: '#8596AD', textAlign: 'center', marginBottom: 18 }}>Minimum 30 seconds recommended</p>

            <div className="flex items-center justify-between">
              <span style={{ ...ns, fontSize: 12.5, color: '#8596AD' }}>MacBook Pro mic · <span style={{ color: '#22A366', fontWeight: 600 }}>good signal</span></span>
              <button onClick={stopRecording} className="flex items-center cursor-pointer" style={{ gap: 6, ...ns, fontSize: 13.5, fontWeight: 600, color: '#15191F', background: 'none', border: '1px solid #E0E5EB', borderRadius: 9, padding: '9px 16px' }}>
                Stop recording
                <div style={{ width: 10, height: 10, borderRadius: 3, background: '#E2504F' }} />
              </button>
            </div>
          </StepChrome>
        )}

        {step === 'review' && (
          <StepChrome step={4} onClose={onClose}>
            <h2 style={{ ...ns, fontSize: 19, fontWeight: 700, color: '#0D1433', marginTop: 8 }}>Review your recording</h2>
            <p style={{ ...ns, fontSize: 13.5, color: '#8596AD', marginTop: 4, marginBottom: 18 }}>Listen back before submitting - re-record if needed</p>

            <div className="flex items-center" style={{ gap: 12, background: '#F6F7FA', borderRadius: 10, padding: '10px 14px', marginBottom: 10 }}>
              <button className="flex items-center justify-center cursor-pointer flex-shrink-0" style={{ width: 26, height: 26, borderRadius: '50%', background: '#006EFE', border: 'none' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><path d="M7 5l12 7-12 7V5z" /></svg>
              </button>
              <WaveformBars count={30} activeCount={12} color="#006EFE" />
              <span style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F', marginLeft: 'auto' }}>0:{seconds.toString().padStart(2, '0')}</span>
            </div>
            <p style={{ ...ns, fontSize: 12, color: '#8596AD', textAlign: 'center', marginBottom: 22 }}>By submitting you confirm this is your own voice</p>

            <div className="flex items-center justify-end" style={{ gap: 10 }}>
              <button onClick={() => setStep('recording')} className="flex items-center cursor-pointer" style={{ gap: 6, ...ns, fontSize: 13.5, fontWeight: 600, color: '#52637A', background: 'none', border: '1px solid #E0E5EB', borderRadius: 9, padding: '10px 16px' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg>
                Re-Record
              </button>
              <button onClick={useMyVoice} className="flex items-center cursor-pointer" style={{ gap: 6, ...ns, fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 9, padding: '10px 18px' }}>
                Use my voice
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </button>
            </div>
          </StepChrome>
        )}

        {step === 'training' && (
          <StepChrome step={5} onClose={onClose}>
            <h2 style={{ ...ns, fontSize: 19, fontWeight: 700, color: '#0D1433', marginTop: 8 }}>Training &amp; cloning your voice</h2>
            <p style={{ ...ns, fontSize: 13.5, color: '#8596AD', marginTop: 4, marginBottom: 18 }}>Usually takes 20–40 seconds. Don&apos;t close this window.</p>

            <div className="flex flex-col items-center justify-center" style={{ border: '1px solid #F0F1F4', borderRadius: 12, padding: '36px 0', marginBottom: 22 }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
                style={{ width: 34, height: 34, borderRadius: '50%', border: '3px solid #E4EEFF', borderTopColor: '#006EFE' }}
              />
              <p style={{ ...ns, fontSize: 13, color: '#8596AD', marginTop: 14 }}>Analysing tone, pace and timbre…</p>
            </div>

            <div className="flex items-center justify-end" style={{ gap: 10, opacity: 0.4 }}>
              <button disabled className="flex items-center" style={{ gap: 6, ...ns, fontSize: 13.5, fontWeight: 600, color: '#52637A', background: 'none', border: '1px solid #E0E5EB', borderRadius: 9, padding: '10px 16px', cursor: 'not-allowed' }}>
                Re-Record
              </button>
              <button disabled className="flex items-center" style={{ gap: 6, ...ns, fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 9, padding: '10px 18px', cursor: 'not-allowed' }}>
                Use my voice →
              </button>
            </div>
          </StepChrome>
        )}

        {step === 'done' && (
          <div className="flex flex-col">
            <div className="flex justify-end"><span style={{ ...ns, fontSize: 12.5, color: '#8596AD' }}>6 of 6</span></div>
            <div className="flex items-start" style={{ gap: 12, marginTop: 4, marginBottom: 26 }}>
              <div className="flex items-center justify-center flex-shrink-0" style={{ width: 26, height: 26, borderRadius: '50%', background: '#E6F6EC' }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 10.3l3.4 3.4L16 5" stroke="#22A366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div>
                <p style={{ ...ns, fontSize: 17, fontWeight: 700, color: '#0D1433' }}>Your voice &ldquo;{voiceName}&rdquo; is ready</p>
                <p style={{ ...ns, fontSize: 13.5, color: '#8596AD', marginTop: 4 }}>Now you can use your personal voice for your audiobooks</p>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => onCreated(voiceName || 'My voice')} className="cursor-pointer" style={{ ...ns, fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 9, padding: '10px 22px' }}>
                Done
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
