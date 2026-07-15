'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useFlowStore } from '@/stores/flowStore';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';

const PRES_INTRO_KEY = 'designrr_pres_intro_seen_v3';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

const STEPS = ['Generate', 'Writing a content', 'Create cover', 'Preview', 'Download'];

function PresentationIntroModal({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(15,23,51,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white flex overflow-hidden"
        style={{ borderRadius: 20, maxWidth: 780, width: '90%', boxShadow: '0px 24px 80px rgba(15,23,51,0.22)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Left: copy */}
        <div className="flex flex-col justify-between" style={{ padding: '44px 40px', flex: 1, minWidth: 0 }}>
          <div>
            <div className="flex items-center" style={{ gap: 8, marginBottom: 20 }}>
              <div style={{ background: 'linear-gradient(235deg,#006EFE,#5326BD)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <defs><linearGradient id="mGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#fff"/><stop offset="100%" stopColor="rgba(255,255,255,0.7)"/></linearGradient></defs>
                  <path d="M12 2L13.5 9L20 12L13.5 15L12 22L10.5 15L4 12L10.5 9Z" fill="url(#mGrad)"/>
                </svg>
              </div>
              <span style={{ ...ns, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#006EFE' }}>New feature</span>
            </div>

            <h2 style={{ ...ns, fontSize: 26, fontWeight: 700, color: '#0D1433', lineHeight: 1.25, marginBottom: 14 }}>
              Your book can also<br/>be a presentation
            </h2>
            <p style={{ ...ns, fontSize: 15, color: '#52637A', lineHeight: 1.65, marginBottom: 32 }}>
              Turn your manuscript into a polished slide deck in minutes. We'll use your chapters and content to generate slides — you just choose the style.
            </p>

            <ul className="flex flex-col" style={{ gap: 12, marginBottom: 36 }}>
              {[
                'AI generates slides from your chapters',
                'Choose themes and layouts',
                'Edit, present, and export to PowerPoint or PDF',
              ].map(item => (
                <li key={item} className="flex items-start" style={{ gap: 10 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#EEF5FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6.5l2.5 2.5 5.5-5" stroke="#006EFE" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <span style={{ ...ns, fontSize: 14, color: '#3D4A5C', lineHeight: 1.5 }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center" style={{ gap: 12 }}>
            <button onClick={onCreate} style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', background: '#006EFE', border: 'none', borderRadius: 10, padding: '10px 22px', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#0058CC'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#006EFE'; }}>
              Create a presentation
            </button>
            <button onClick={onClose} style={{ ...ns, fontSize: 14, fontWeight: 500, color: '#8596AD', background: 'none', border: 'none', cursor: 'pointer' }}>
              Maybe later
            </button>
          </div>
        </div>

        {/* Right: slide preview */}
        <div style={{ width: 300, background: 'linear-gradient(160deg,#EEF2FF 0%,#E0E7FF 100%)', padding: '40px 28px', display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
          {/* Mock slide 1 - active */}
          <div style={{ background: '#1E1B4B', borderRadius: 10, padding: '18px 16px', boxShadow: '0 4px 16px rgba(30,27,75,0.25)' }}>
            <div style={{ width: '75%', height: 8, borderRadius: 3, background: '#fff', marginBottom: 8 }}/>
            <div style={{ width: '40%', height: 3, borderRadius: 2, background: '#818CF8', marginBottom: 14 }}/>
            <div className="flex flex-col" style={{ gap: 5 }}>
              {[85, 70, 60].map((w, i) => <div key={i} style={{ width: `${w}%`, height: 3.5, borderRadius: 2, background: 'rgba(255,255,255,0.35)' }}/>)}
            </div>
          </div>
          {/* Mock slide 2 */}
          <div style={{ background: '#fff', borderRadius: 10, padding: '14px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', opacity: 0.85 }}>
            <div style={{ width: '60%', height: 6, borderRadius: 3, background: '#1E1B4B', marginBottom: 6 }}/>
            <div style={{ width: '30%', height: 2.5, borderRadius: 2, background: '#818CF8', marginBottom: 10 }}/>
            {[80, 65].map((w, i) => <div key={i} style={{ width: `${w}%`, height: 3, borderRadius: 2, background: '#E5E7EB', marginBottom: 4 }}/>)}
          </div>
          {/* Mock slide 3 */}
          <div style={{ background: '#F5F3FF', borderRadius: 10, padding: '14px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', opacity: 0.7 }}>
            <div style={{ width: '50%', height: 6, borderRadius: 3, background: '#4338CA', marginBottom: 6 }}/>
            {[75, 55].map((w, i) => <div key={i} style={{ width: `${w}%`, height: 3, borderRadius: 2, background: '#C7D2FE', marginBottom: 4 }}/>)}
          </div>

          <div style={{ marginTop: 8, textAlign: 'center' }}>
            <span style={{ ...ns, fontSize: 12, color: '#6366F1', fontWeight: 500 }}>Preview of generated slides</span>
          </div>
        </div>

        {/* Close */}
        <button onClick={onClose} className="absolute cursor-pointer" style={{ top: 16, right: 16, width: 28, height: 28, borderRadius: '50%', background: '#F4F6F9', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </motion.div>
    </motion.div>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M2.5 7.2L5.2 9.8L11.5 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function KindleMockup({ title, author }: { title: string; author?: string }) {
  return (
    <div className="flex items-center justify-center" style={{ background: '#F0F2F5', borderRadius: 16, padding: '32px 24px' }}>
      <div style={{ position: 'relative', width: 220 }}>
        {/* Kindle body */}
        <div style={{ background: '#D4D7DC', borderRadius: 12, padding: '14px 14px 40px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
          {/* Screen */}
          <div style={{ background: '#F5F2EB', borderRadius: 6, padding: '20px 16px', minHeight: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, border: '1px solid #C8C4B8' }}>
            {/* Cover illustration */}
            <div style={{ width: '85%', aspectRatio: '2/3', background: 'linear-gradient(160deg, #EEF2FF 0%, #C7D2FE 100%)', borderRadius: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 12px', gap: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
              <div style={{ width: 32, height: 3, borderRadius: 2, background: '#6366F1', opacity: 0.6 }}/>
              <div style={{ width: '90%', fontSize: 9, fontFamily: 'Georgia, serif', fontWeight: 700, color: '#1E1B4B', textAlign: 'center', lineHeight: 1.4 }}>
                {title.length > 60 ? title.slice(0, 60) + '…' : title}
              </div>
              <div style={{ width: 24, height: 2, borderRadius: 1, background: '#818CF8' }}/>
              {author && <div style={{ fontSize: 7, color: '#4338CA', fontFamily: 'Georgia, serif', textAlign: 'center' }}>{author}</div>}
            </div>
          </div>
          {/* Kindle branding */}
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <span style={{ fontSize: 11, fontFamily: 'Georgia, serif', color: '#888', letterSpacing: 1 }}>kindle</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PDFMockup({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center" style={{ background: '#F0F2F5', borderRadius: 16, padding: '32px 24px' }}>
      <div style={{ width: 200, background: '#fff', borderRadius: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.14)', padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ width: '100%', height: 4, borderRadius: 2, background: '#E5E7EB' }}/>
        <div style={{ fontSize: 11, fontFamily: 'Georgia, serif', fontWeight: 700, color: '#111827', textAlign: 'center', lineHeight: 1.5 }}>
          {title.length > 50 ? title.slice(0, 50) + '…' : title}
        </div>
        <div style={{ width: 48, height: 2, borderRadius: 1, background: '#6B7280' }}/>
        {[90, 80, 75, 85, 70].map((w, i) => (
          <div key={i} style={{ width: `${w}%`, height: 3, borderRadius: 1, background: '#E5E7EB' }}/>
        ))}
      </div>
    </div>
  );
}

export function BookFormatView() {
  const book = useFlowStore((s) => s.generatedBook);
  const selectedBookType = useFlowStore((s) => s.selectedBookType);
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);
  const setStep = useFlowStore((s) => s.setStep);

  const [hideCover, setHideCover] = useState(false);
  const [description, setDescription] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [introDismissed, setIntroDismissed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const seen = localStorage.getItem(PRES_INTRO_KEY);
    if (seen) {
      setIntroDismissed(true);
    } else {
      const t = setTimeout(() => setShowModal(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const dismissModal = useCallback(() => {
    localStorage.setItem(PRES_INTRO_KEY, '1');
    setShowModal(false);
    setIntroDismissed(true);
  }, []);

  const goToPresentation = useCallback(() => {
    localStorage.setItem(PRES_INTRO_KEY, '1');
    setShowModal(false);
    router.push('/presentation');
  }, [router]);

  const formatLabel = selectedBookType === 'kindle' ? 'Kindle' : selectedBookType === 'print' ? 'Print' : selectedBookType === 'audiobook' ? 'Audiobook' : 'Ebook';
  const stepLabel = `Download ${formatLabel}`;
  const steps = [...STEPS.slice(0, 4), stepLabel];

  const wordCount = book?.chapters.reduce((acc, ch) => {
    const text = ch.content.replace(/<[^>]*>/g, '').trim();
    return acc + (text ? text.split(/\s+/).length : 0);
  }, 0) ?? 0;
  const readMinutes = Math.round(wordCount / 200);
  const readTime = readMinutes >= 60 ? `${Math.floor(readMinutes / 60)}h ${readMinutes % 60}m` : `${readMinutes}m`;

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => setDownloading(false), 2000);
  };

  if (!book) return null;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Top nav — stepper */}
      <div className="flex-shrink-0 bg-white border-b border-border-light" style={{ height: 56 }}>
        <div className="flex items-center h-full" style={{ padding: '0 16px' }}>
          <Tooltip label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'} position="right">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="flex-shrink-0 flex items-center justify-center cursor-pointer" style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: 'none' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F4F6F9'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
              <SideMenuIcon active={sidebarOpen}/>
            </button>
          </Tooltip>
          <div className="flex-1 flex items-center justify-center" style={{ gap: 8 }}>
            {steps.map((label, i) => {
              const done = i < 4;
              const active = i === 4;
              return (
                <div key={label} className="flex items-center" style={{ gap: 8 }}>
                  {i > 0 && <div style={{ width: 24, height: 1, background: done || active ? '#006EFE' : '#E0E5EB' }}/>}
                  <div className="flex items-center" style={{ gap: 6 }}>
                    <div className="flex items-center justify-center flex-shrink-0 rounded-full" style={{ width: 22, height: 22, background: done || active ? '#006EFE' : '#F1F2F4' }}>
                      {done ? <CheckIcon/> : <span style={{ ...ns, fontSize: 11, fontWeight: 700, color: active ? '#fff' : '#8E99AB' }}>{i + 1}</span>}
                    </div>
                    <span style={{ ...ns, fontSize: 13, fontWeight: active ? 600 : 400, color: active ? '#15191F' : done ? '#15191F' : '#8E99AB', whiteSpace: 'nowrap' }}>{label}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ width: 36 }}/>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Action bar */}
        <div className="flex items-center justify-between border-b border-border-light bg-white" style={{ padding: '12px 32px' }}>
          <button onClick={() => setStep(8)} className="flex items-center cursor-pointer" style={{ gap: 8, ...ns, fontSize: 13, fontWeight: 500, color: '#52637A', background: 'none', border: '1px solid #E0E5EB', borderRadius: 8, padding: '6px 14px' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F4F6F9'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
          <div className="flex items-center" style={{ gap: 12 }}>
            <button className="flex items-center cursor-pointer" style={{ gap: 6, ...ns, fontSize: 13, fontWeight: 500, color: '#52637A', background: 'none', border: '1px solid #E0E5EB', borderRadius: 8, padding: '6px 14px' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F4F6F9'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
              <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            </button>
            <motion.button
              onClick={handleDownload}
              whileTap={{ scale: 0.97 }}
              style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#fff', background: downloading ? '#0058CC' : '#006EFE', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer' }}
            >
              {downloading ? 'Preparing…' : `Download ${formatLabel} files`}
            </motion.button>
          </div>
        </div>

        {/* Main two-column layout */}
        <div className="flex" style={{ padding: '40px 48px', gap: 48, maxWidth: 1100, margin: '0 auto' }}>
          {/* Left column */}
          <div className="flex-1 min-w-0">
            <h1 style={{ ...ns, fontSize: 28, fontWeight: 700, color: '#0D1433', lineHeight: 1.3, marginBottom: 12 }}>
              {book.title}
            </h1>
            <p style={{ ...ns, fontSize: 14, color: '#52637A', marginBottom: 24 }}>
              by klimiashvilinn@gmail.com
            </p>
            <div style={{ height: 1, background: '#E8EBF2', marginBottom: 28 }}/>

            <h2 style={{ ...ns, fontSize: 16, fontWeight: 700, color: '#15191F', marginBottom: 20 }}>Additional settings</h2>

            {/* Hide Cover */}
            <label className="flex items-center cursor-pointer" style={{ gap: 10, marginBottom: 20 }}>
              <div
                onClick={() => setHideCover(v => !v)}
                style={{ width: 16, height: 16, borderRadius: 3, border: hideCover ? 'none' : '1.5px solid #C5CDD9', background: hideCover ? '#006EFE' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                {hideCover && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6.5l2.8 2.5 5-5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <span style={{ ...ns, fontSize: 14, color: '#15191F' }}>Hide Cover</span>
            </label>

            {/* Description */}
            <div>
              <label style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#52637A', display: 'block', marginBottom: 8 }}>Description</label>
              <div style={{ position: 'relative' }}>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Enter a description..."
                  style={{ ...ns, fontSize: 14, color: '#15191F', width: '100%', minHeight: 160, padding: '14px 16px', borderRadius: 10, border: '1px solid #E0E5EB', background: '#fff', resize: 'vertical', outline: 'none', lineHeight: 1.6 }}
                />
                <button className="flex items-center cursor-pointer" style={{ position: 'absolute', bottom: 12, right: 12, gap: 4, ...ns, fontSize: 12, fontWeight: 600, background: 'linear-gradient(235deg, #006EFE, #5326BD)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', border: 'none' }}>
                  Write with AI
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <defs><linearGradient id="aiG2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#006EFE"/><stop offset="100%" stopColor="#5326BD"/></linearGradient></defs>
                    <path d="M12 2L13.5 9L20 12L13.5 15L12 22L10.5 15L4 12L10.5 9Z" fill="url(#aiG2)"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div style={{ width: 340, flexShrink: 0 }}>
            {selectedBookType === 'kindle' ? (
              <KindleMockup title={book.title} author="klimiashvilinn@gmail.com"/>
            ) : (
              <PDFMockup title={book.title}/>
            )}

            {/* Stats */}
            <div className="flex flex-col" style={{ marginTop: 24, gap: 0 }}>
              {[
                { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.6" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="4" y1="14" x2="14" y2="14"/></svg>, label: 'Words', value: wordCount.toLocaleString() },
                { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>, label: 'Chapters', value: book.chapters.length },
                { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>, label: 'Read time', value: readTime },
                { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.6" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/></svg>, label: 'Book type', value: formatLabel },
              ].map(({ icon, label, value }) => (
                <div key={label} className="flex items-center justify-between" style={{ padding: '14px 0', borderBottom: '1px solid #F0F2F5' }}>
                  <div className="flex items-center" style={{ gap: 10 }}>
                    {icon}
                    <span style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F' }}>{label}</span>
                  </div>
                  <span style={{ ...ns, fontSize: 14, color: '#52637A' }}>{value}</span>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>

      {/* First-time intro modal */}
      <AnimatePresence>
        {showModal && (
          <PresentationIntroModal onClose={dismissModal} onCreate={goToPresentation} />
        )}
      </AnimatePresence>
    </div>
  );
}
