'use client';

import { useState, useRef, useCallback, useEffect, useId, Fragment } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useFlowStore, manuscriptLimitFor, combinedGenerationsUsed, allowanceResetLabel } from '@/stores/flowStore';
import { createPortal } from 'react-dom';
import { Tooltip } from '@/components/ui/Tooltip';

import { AISparkleIcon } from '@/components/presentation/presentationIcons';

type Tab = 'profile' | 'password' | 'preferences' | 'billing';

const TABS: { key: Tab; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'password', label: 'Password & security' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'billing', label: 'Plan & billing' },
];

/* One tab's horizontal padding. Named because it's used twice and has to stay in step: the
   button row is offset by exactly this much so the first label lines up with the page's
   left edge while the tabs keep padded hit areas. */
const TAB_PAD_X = 12;

/* ─────────────────────────────────────────────
   Photo Upload Modal
───────────────────────────────────────────── */

const CROP_SIZE = 240; // circular crop diameter
const IMG_W = 456;
const IMG_H = 370;

function PhotoUploadModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (dataUrl: string) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Draggable image offset and scale for the crop preview
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const dragState = useRef<{ active: boolean; startX: number; startY: number; ox: number; oy: number }>({
    active: false, startX: 0, startY: 0, ox: 0, oy: 0,
  });

  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);

  const loadFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
      setImgOffset({ x: 0, y: 0 });
      setScale(1);
    };
    reader.readAsDataURL(file);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = '';
  };

  // Mouse drag handlers for panning the image in crop view
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { active: true, startX: e.clientX, startY: e.clientY, ox: imgOffset.x, oy: imgOffset.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragState.current.active) return;
      setImgOffset({
        x: dragState.current.ox + ev.clientX - dragState.current.startX,
        y: dragState.current.oy + ev.clientY - dragState.current.startY,
      });
    };
    const onUp = () => {
      dragState.current.active = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(4, Math.max(0.5, s - e.deltaY * 0.002)));
  };

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(20,25,31,0.40)', zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white rounded-[12px] overflow-hidden"
        style={{ width: 524, boxShadow: '0px 2px 20px 0px rgba(0,0,0,0.12)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between" style={{ padding: '24px 34px 20px' }}>
          <span style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 24, fontWeight: 600, color: '#15191F', lineHeight: '32px' }}>
            Upload photo
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center hover:opacity-60 transition-opacity cursor-pointer"
            style={{ width: 24, height: 24, border: 'none', background: 'none', padding: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M14 4L4 14M4 4l10 10" stroke="#29323D" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '0 34px 32px' }}>
          <AnimatePresence mode="wait">
            {!preview ? (
              /* State 1 — drop zone */
              <motion.div key="drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
                className="flex flex-col" style={{ gap: 32 }}>
                <div
                  className="flex flex-col items-center justify-center cursor-pointer transition-colors rounded-[8px]"
                  style={{
                    width: '100%', height: 170,
                    border: `1px dashed ${isDragOver ? '#006EFE' : '#E0E5EB'}`,
                    background: isDragOver ? '#F0F6FF' : '#fff',
                  }}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {/* Two photo frames + upload badge */}
                  <div className="relative" style={{ width: 68, height: 52, marginBottom: 20 }}>
                    {/* Frame back — rotated -15deg */}
                    <div style={{ position: 'absolute', left: 0, top: 8, transform: 'rotate(-15deg)' }}>
                      <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
                        <rect x="0.6" y="0.6" width="30.8" height="30.8" rx="3.4" fill="white" stroke="#D0D9E4" strokeWidth="1.2"/>
                        <rect x="3" y="3" width="26" height="18" rx="2" fill="#EEF2F7"/>
                        <path d="M4 19l6-6 4 4 4-4 6 5" stroke="#C8D2DC" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="9" cy="10" r="2.2" fill="#C8D2DC"/>
                      </svg>
                    </div>
                    {/* Frame front — rotated +15deg */}
                    <div style={{ position: 'absolute', right: 0, top: 0, transform: 'rotate(15deg)' }}>
                      <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
                        <rect x="0.6" y="0.6" width="30.8" height="30.8" rx="3.4" fill="white" stroke="#D0D9E4" strokeWidth="1.2"/>
                        <rect x="3" y="3" width="26" height="18" rx="2" fill="#EEF2F7"/>
                        <path d="M4 19l6-6 4 4 4-4 6 5" stroke="#C8D2DC" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="9" cy="10" r="2.2" fill="#C8D2DC"/>
                      </svg>
                    </div>
                    {/* Upload badge */}
                    <div style={{ position: 'absolute', right: -4, top: -8, width: 20, height: 20, borderRadius: '50%', background: '#E5F1FF', boxShadow: '0px 2px 8px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M5 8V2M5 2L2.5 4.5M5 2L7.5 4.5" stroke="#006EFE" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>

                  <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 16, color: '#15191F', lineHeight: '20px', textAlign: 'center', margin: 0 }}>
                    Drag and drop your photo or{' '}
                    <span style={{ color: '#006EFE', fontWeight: 600 }}>browse</span>
                  </p>
                  <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, color: '#8596AD', marginTop: 6 }}>
                    Png, Jpg
                  </p>
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg" style={{ display: 'none' }} onChange={onFileChange} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#fff', padding: '10px 18px', borderRadius: 8, border: 'none', background: '#006EFE', cursor: 'pointer', height: 38 }}
                  >
                    Upload
                  </button>
                </div>
              </motion.div>
            ) : (
              /* State 2 — draggable crop preview */
              <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
                className="flex flex-col" style={{ gap: 32 }}>
                {/* Image crop area */}
                <div
                  style={{ width: IMG_W, height: IMG_H, position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#111', cursor: 'grab', userSelect: 'none' }}
                  onMouseDown={onMouseDown}
                  onWheel={onWheel}
                >
                  {/* Single image — one source of truth for position & scale */}
                  <img
                    src={preview} alt="preview"
                    draggable={false}
                    style={{
                      position: 'absolute',
                      width: IMG_W * scale,
                      height: IMG_H * scale,
                      top: (IMG_H - IMG_H * scale) / 2 + imgOffset.y,
                      left: (IMG_W - IMG_W * scale) / 2 + imgOffset.x,
                      objectFit: 'cover',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Dark overlay with circular hole — on top of the single image */}
                  <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                    <defs>
                      <mask id="crop-mask">
                        <rect width="100%" height="100%" fill="white" />
                        <circle cx="50%" cy="50%" r={CROP_SIZE / 2} fill="black" />
                      </mask>
                    </defs>
                    <rect width="100%" height="100%" fill="rgba(0,0,0,0.62)" mask="url(#crop-mask)" />
                  </svg>

                  {/* Corner brackets */}
                  {(() => {
                    const r = CROP_SIZE / 2 + 12;
                    const s = 14;
                    const bw = 2;
                    return [
                      { t: `calc(50% - ${r}px)`, l: `calc(50% - ${r}px)`, bt: bw, bl: bw, br: 0, bb: 0 },
                      { t: `calc(50% - ${r}px)`, l: `calc(50% + ${r - s}px)`, bt: bw, bl: 0, br: bw, bb: 0 },
                      { t: `calc(50% + ${r - s}px)`, l: `calc(50% - ${r}px)`, bt: 0, bl: bw, br: 0, bb: bw },
                      { t: `calc(50% + ${r - s}px)`, l: `calc(50% + ${r - s}px)`, bt: 0, bl: 0, br: bw, bb: bw },
                    ].map((b, i) => (
                      <div key={i} style={{
                        position: 'absolute', top: b.t, left: b.l,
                        width: s, height: s, pointerEvents: 'none',
                        borderTop: b.bt ? `${b.bt}px solid rgba(255,255,255,0.85)` : 'none',
                        borderLeft: b.bl ? `${b.bl}px solid rgba(255,255,255,0.85)` : 'none',
                        borderRight: b.br ? `${b.br}px solid rgba(255,255,255,0.85)` : 'none',
                        borderBottom: b.bb ? `${b.bb}px solid rgba(255,255,255,0.85)` : 'none',
                      }} />
                    ));
                  })()}

                  {/* Drag hint */}
                  <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
                    <span style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                      Drag to reposition · scroll to zoom
                    </span>
                  </div>
                </div>

                {/* Zoom slider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8596AD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                  <input
                    type="range" min={50} max={400} step={1} value={Math.round(scale * 100)}
                    onChange={(e) => setScale(Number(e.target.value) / 100)}
                    style={{ flex: 1, accentColor: '#006EFE', cursor: 'pointer' }}
                  />
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8596AD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </div>

                {/* Buttons — right-aligned, matching Figma: gap-16, Cancel outline + blue Set up */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
                  <button
                    onClick={() => setPreview(null)}
                    style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#001633', height: 38, padding: '0 20px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { onConfirm(preview!); onClose(); }}
                    style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#fff', height: 38, padding: '0 20px', borderRadius: 8, border: 'none', background: '#006EFE', cursor: 'pointer' }}
                  >
                    Set up Profile Image
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(modal, document.body) : null;
}

/* ─────────────────────────────────────────────
   Avatar — animated hover, single camera icon
───────────────────────────────────────────── */

function ProfileAvatar({
  photo,
  initials,
  onOpenModal,
}: {
  photo: string | null;
  initials: string;
  onOpenModal: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative flex-shrink-0 cursor-pointer"
      style={{ width: 72, height: 72 }}
      onClick={onOpenModal}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Circle — avatar content */}
      <div className="rounded-full overflow-hidden w-full h-full" style={{ background: '#E0E5EB' }}>
        {photo ? (
          <img src={photo} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 22, fontWeight: 600, color: '#8596AD' }}>
              {initials}
            </span>
          </div>
        )}
      </div>

      {/* Dark overlay — fades in on hover */}
      <motion.div
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.18 }}
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ background: 'rgba(0,0,0,0.52)' }}
      />

      {/*
        Camera icon — always rendered in the bottom-right badge position,
        then on hover it animates to center of the avatar.
        This avoids two separate icons appearing simultaneously.
      */}
      <motion.div
        animate={hovered ? {
          bottom: '50%',
          right: '50%',
          width: 22,
          height: 22,
          marginBottom: -11,
          marginRight: -11,
          background: 'transparent',
          border: 'none',
          boxShadow: 'none',
        } : {
          bottom: 0,
          right: 0,
          width: 22,
          height: 22,
          marginBottom: 0,
          marginRight: 0,
          background: '#fff',
          border: '1px solid #E0E5EB',
          boxShadow: 'none',
        }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="absolute rounded-full flex items-center justify-center pointer-events-none"
      >
        <motion.svg
          animate={{ width: hovered ? 20 : 11, height: hovered ? 20 : 11 }}
          transition={{ duration: 0.2 }}
          viewBox="0 0 24 24"
          fill="none"
          stroke={hovered ? '#fff' : '#3D4A5C'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </motion.svg>
      </motion.div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Reusable components
───────────────────────────────────────────── */

function SectionCard({ children, overflowVisible }: { children: React.ReactNode; overflowVisible?: boolean }) {
  return (
    <div
      className={`bg-white border border-[#E0E5EB] rounded-[16px] w-full ${overflowVisible ? 'overflow-visible' : 'overflow-hidden'}`}
      style={{ boxShadow: '0px 2px 10px 0px rgba(0,0,0,0.06)' }}
    >
      {children}
    </div>
  );
}

function SectionHeader({
  title, description, badge, onSave, saved, right,
}: {
  title: React.ReactNode;
  description?: string;
  badge?: React.ReactNode;
  onSave?: () => void;
  saved?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <div className={`flex ${description ? 'items-start' : 'items-center'} justify-between border-b border-[#E0E5EB] px-6 py-5`}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 20, fontWeight: 600, color: '#001633', lineHeight: '24px' }}>
            {title}
          </span>
          {badge}
        </div>
        {description && (
          <span style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 400, color: '#667C98', lineHeight: '18px' }}>
            {description}
          </span>
        )}
      </div>
      {right ?? (onSave && (
        <button
          onClick={onSave}
          className="flex-shrink-0 transition-all"
          style={{
            fontFamily: "'Nunito Sans', sans-serif",
            fontSize: 14, fontWeight: 600, lineHeight: '18px',
            padding: '10px 20px', borderRadius: 8,
            border: `1px solid ${saved ? '#006EFE' : '#E0E5EB'}`,
            background: saved ? 'linear-gradient(135deg, #006EFE, #5326BD)' : '#fff',
            color: saved ? '#fff' : '#3D4A5C',
            cursor: 'pointer',
          }}
        >
          {saved ? 'Saved ✓' : 'Save changes'}
        </button>
      ))}
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', placeholder = '', readOnly = false,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  type?: string; placeholder?: string; readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 400, color: '#667C98', lineHeight: '18px' }}>
        {label}
      </label>
      <input
        type={type} value={value} readOnly={readOnly} placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full outline-none transition-colors"
        style={{
          border: '1px solid #E0E5EB', borderRadius: 4, padding: '10px 8px',
          fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 400,
          color: readOnly ? '#8596AD' : '#15191F', lineHeight: '18px',
          background: readOnly ? '#F6F7F9' : '#fff',
        }}
        onFocus={(e) => { if (!readOnly) e.currentTarget.style.borderColor = '#006EFE'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = '#E0E5EB'; }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Tab: Profile
───────────────────────────────────────────── */

const INITIAL_FIRST = 'Casper';
const INITIAL_LAST = 'Weldings';
const INITIAL_EMAIL = 'casper.w@designrr.io';

function ProfileTab() {
  const photo = useFlowStore((s) => s.profilePhoto);
  const setPhoto = useFlowStore((s) => s.setProfilePhoto);
  const [showModal, setShowModal] = useState(false);
  const [firstName, setFirstName] = useState(INITIAL_FIRST);
  const [lastName, setLastName] = useState(INITIAL_LAST);
  const [email, setEmail] = useState(INITIAL_EMAIL);
  const [bio, setBio] = useState('');
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);

  const nameChanged = firstName !== INITIAL_FIRST || lastName !== INITIAL_LAST;
  const emailChanged = email !== INITIAL_EMAIL;
  const bioChanged = bio !== '';

  const handleSave = (section: string) => {
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 2000);
  };

  const openModal = () => {
    setSidebarOpen(false); // hide sidebar when modal opens
    setShowModal(true);
  };

  return (
    <>
      <AnimatePresence>
        {showModal && (
          <PhotoUploadModal
            onClose={() => setShowModal(false)}
            onConfirm={(dataUrl) => setPhoto(dataUrl)}
          />
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-6">
        {/* Profile photo */}
        <SectionCard>
          <SectionHeader
            title="Profile photo"
            description="Your photo will be shown across projects and shared documents."
          />
          <div className="flex items-center gap-4 px-6 py-5">
            <ProfileAvatar
              photo={photo}
              initials="CW"
              onOpenModal={openModal}
            />
            <div>
              <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 20, fontWeight: 600, color: '#001633', lineHeight: '24px' }}>
                {firstName} {lastName}
              </p>
              <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 400, color: '#667C98', lineHeight: '18px', marginTop: 2 }}>
                {email}
              </p>
            </div>
            {photo && (
              <button
                onClick={() => setPhoto(null)}
                className="flex items-center transition-colors hover:opacity-75 cursor-pointer ml-auto"
                style={{ background: 'none', border: 'none', padding: '10px 12px', borderRadius: 8, gap: 8, display: 'flex', alignItems: 'center' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D62929" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
                <span style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#D62929' }}>
                  Remove image
                </span>
              </button>
            )}
          </div>
        </SectionCard>

        {/* Full name */}
        <SectionCard>
          <SectionHeader
            title="Full name"
            description="Your display name visible to team members and collaborators."
            onSave={nameChanged ? () => handleSave('name') : undefined}
            saved={savedSection === 'name'}
          />
          <div className="px-6 py-6">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First name" value={firstName} onChange={setFirstName} />
              <Field label="Last name" value={lastName} onChange={setLastName} />
            </div>
            <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, fontWeight: 400, color: '#8596AD', lineHeight: '16px', marginTop: 10 }}>
              Use your real name for best results.
            </p>
          </div>
        </SectionCard>

        {/* Email */}
        <SectionCard>
          <SectionHeader
            title="Email address"
            description="This is the email you use to sign in. Changing it will require re-verification."
            badge={
              <span className="flex items-center gap-1" style={{ background: '#F3FCF4', border: '1px solid #85E097', borderRadius: 999, padding: '2px 8px', fontSize: 12, fontFamily: 'Inter, sans-serif', fontWeight: 500, color: '#29A341' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#29A341" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Verified
              </span>
            }
            onSave={emailChanged ? () => handleSave('email') : undefined}
            saved={savedSection === 'email'}
          />
          <div className="px-6 py-6">
            <Field label="Email" value={email} onChange={setEmail} type="email" />
            <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, fontWeight: 400, color: '#8596AD', lineHeight: '16px', marginTop: 10 }}>
              Make sure you have access to this inbox.
            </p>
          </div>
        </SectionCard>

        {/* Bio */}
        <SectionCard>
          <SectionHeader
            title="Bio"
            description="A short description about yourself. Shown on your profile."
            onSave={bioChanged ? () => handleSave('bio') : undefined}
            saved={savedSection === 'bio'}
          />
          <div className="px-6 py-6">
            <div className="flex flex-col gap-1">
              <label style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 400, color: '#667C98', lineHeight: '18px' }}>About you</label>
              <div className="relative">
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 300))}
                  placeholder="Tell people a little about yourself…"
                  rows={4}
                  className="w-full outline-none resize-none transition-colors"
                  style={{ border: '1px solid #E0E5EB', borderRadius: 4, padding: '10px 8px', fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 400, color: '#15191F', lineHeight: '18px' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#006EFE'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E0E5EB'; }}
                />
                <span className="absolute bottom-3 right-3" style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#A3B0C2' }}>
                  {bio.length} / 300
                </span>
              </div>
              <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, fontWeight: 400, color: '#8596AD', lineHeight: '16px', marginTop: 4 }}>
                Keep it short — a sentence or two works best.
              </p>
            </div>
          </div>
        </SectionCard>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
   Change Password Modal (Step 1 → Step 2 → Forgot)
───────────────────────────────────────────── */

const PASSWORD_CRITERIA = [
  { label: '8+ chars', test: (p: string) => p.length >= 8 },
  { label: 'Uppercase', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Lowercase', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Number', test: (p: string) => /[0-9]/.test(p) },
  { label: 'Symbol', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function PasswordStrengthIndicator({ password }: { password: string }) {
  if (!password) return null;
  const score = PASSWORD_CRITERIA.filter((c) => c.test(password)).length;
  const color = score <= 2 ? '#E53935' : score <= 3 ? '#F9A825' : '#29A341';
  return (
    <div className="flex" style={{ gap: 4, marginTop: 6 }}>
      {PASSWORD_CRITERIA.map(({ label, test }, i) => {
        const ok = test(password);
        return (
          <div key={label} className="flex flex-col items-center" style={{ gap: 6, flex: 1 }}>
            <div style={{ width: '100%', height: 4, borderRadius: 2, background: i < score ? color : '#E0E5EB', transition: 'background 0.2s' }} />
            <div className="flex items-center" style={{ gap: 3 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="6" cy="6" r="5.5" stroke={ok ? '#29A341' : '#C0C8D4'} />
                {ok && <path d="M3.5 6l1.8 1.8 3.2-3.2" stroke="#29A341" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />}
              </svg>
              <span style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 11, color: ok ? '#29A341' : '#8596AD', lineHeight: '14px', whiteSpace: 'nowrap' }}>{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EyeIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M1 9C1 9 3.8 3 9 3s8 6 8 6-2.8 6-8 6S1 9 1 9z" stroke="#8596AD" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="9" r="2.5" stroke="#8596AD" strokeWidth="1.4" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M1 9C1 9 3.8 3 9 3s8 6 8 6-2.8 6-8 6S1 9 1 9z" stroke="#8596AD" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="9" r="2.5" stroke="#8596AD" strokeWidth="1.4" />
      <line x1="2" y1="2" x2="16" y2="16" stroke="#8596AD" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}


function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'current' | 'new' | 'forgot'>('current');
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const CloseBtn = () => (
    <button
      onClick={onClose}
      aria-label="Close"
      className="absolute flex items-center justify-center hover:opacity-60 transition-opacity cursor-pointer"
      style={{ top: 16, right: 16, width: 24, height: 24, background: 'none', border: 'none', padding: 0 }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M14 4L4 14M4 4l10 10" stroke="#29323D" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </button>
  );

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(20,25,31,0.40)', zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <AnimatePresence mode="wait">
        {step === 'forgot' ? (
          /* ── Forgot password — "Check your inbox" ── */
          <motion.div
            key="forgot"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="bg-white relative flex flex-col items-center justify-center"
            style={{ width: 459, borderRadius: 12, padding: 24, gap: 24, boxShadow: '0px 2px 20px 0px rgba(0,0,0,0.08)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <CloseBtn />
            <div className="flex flex-col items-center" style={{ gap: 16 }}>
              {/* Envelope icon */}
              <div style={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="54" height="42" viewBox="0 0 54 42" fill="none">
                  <rect x="1" y="1" width="52" height="40" rx="5" stroke="#006EFE" strokeWidth="2" />
                  <path d="M1 8l26 18L53 8" stroke="#006EFE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex flex-col items-center" style={{ gap: 8 }}>
                <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 24, fontWeight: 600, color: '#001633', lineHeight: '32px', textAlign: 'center' }}>
                  Check your mail inbox
                </p>
                <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 16, fontWeight: 400, color: '#15191F', lineHeight: '20px', textAlign: 'center', width: 411 }}>
                  We've sent a password reset link and instructions to your email address.
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          /* ── Step 1 or Step 2 ── */
          <motion.div
            key={step}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="bg-white relative"
            style={{ width: 484, borderRadius: 8, boxShadow: '0px 2px 20px 0px rgba(0,0,0,0.08)', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <CloseBtn />
            <div style={{ padding: '32px 32px 0', display: 'flex', flexDirection: 'column', gap: 24 }}>

              {step === 'current' ? (
                /* ── Step 1: Paste current password ── */
                <>
                  <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 20, fontWeight: 600, color: '#15191F', lineHeight: '24px' }}>
                    Change password
                  </p>
                  <div className="flex flex-col" style={{ gap: 4 }}>
                    <label style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 400, color: '#667C98', lineHeight: '18px' }}>
                      Paste your current password
                    </label>
                    <div className="relative w-full">
                      <input
                        type={showCurrent ? 'text' : 'password'}
                        value={currentPass}
                        onChange={(e) => setCurrentPass(e.target.value)}
                        placeholder="••••••••"
                        autoFocus
                        className="outline-none w-full"
                        style={{ border: '1px solid #8596AD', borderRadius: 4, padding: '11px 36px 11px 8px', fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, color: '#15191F', lineHeight: '18px' }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = '#006EFE'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = '#8596AD'; }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && currentPass.trim()) setStep('new'); }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrent((v) => !v)}
                        className="absolute flex items-center justify-center"
                        style={{ top: '50%', right: 10, transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      >
                        <EyeIcon visible={showCurrent} />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* ── Step 2: New password fields ── */
                <>
                  <div className="flex flex-col" style={{ gap: 8 }}>
                    <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 20, fontWeight: 600, color: '#15191F', lineHeight: '24px' }}>
                      Change password
                    </p>
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <span style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 400, color: '#667C98', lineHeight: '18px' }}>
                        Your current password
                      </span>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                        <circle cx="9" cy="9" r="8" stroke="#29A341" strokeWidth="1.3" />
                        <path d="M5.5 9l2.5 2.5 5-5" stroke="#29A341" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                  {/* divider */}
                  <div style={{ height: 1, background: '#E0E5EB', margin: '0 -32px' }} />
                  <div className="flex flex-col" style={{ gap: 4 }}>
                    <label style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 400, color: '#667C98', lineHeight: '18px' }}>
                      Set up your new password
                    </label>
                    <div className="relative w-full">
                      <input
                        type={showNew ? 'text' : 'password'}
                        value={newPass}
                        onChange={(e) => setNewPass(e.target.value)}
                        placeholder="••••••••"
                        autoFocus
                        className="outline-none w-full"
                        style={{ border: '1px solid #8596AD', borderRadius: 4, padding: '11px 36px 11px 8px', fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, color: '#15191F', lineHeight: '18px' }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = '#006EFE'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = '#8596AD'; }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew((v) => !v)}
                        className="absolute flex items-center justify-center"
                        style={{ top: '50%', right: 10, transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      >
                        <EyeIcon visible={showNew} />
                      </button>
                    </div>
                    <PasswordStrengthIndicator password={newPass} />
                  </div>
                  <div className="flex flex-col" style={{ gap: 4 }}>
                    <label style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 400, color: '#667C98', lineHeight: '18px' }}>
                      Repeat your new password
                    </label>
                    <div className="relative w-full">
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        value={confirmPass}
                        onChange={(e) => setConfirmPass(e.target.value)}
                        placeholder="••••••••"
                        className="outline-none w-full"
                        style={{ border: `1px solid ${confirmPass && confirmPass !== newPass ? '#E53935' : '#8596AD'}`, borderRadius: 4, padding: '11px 36px 11px 8px', fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, color: '#15191F', lineHeight: '18px' }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = confirmPass && confirmPass !== newPass ? '#E53935' : '#006EFE'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = confirmPass && confirmPass !== newPass ? '#E53935' : '#8596AD'; }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        className="absolute flex items-center justify-center"
                        style={{ top: '50%', right: 10, transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      >
                        <EyeIcon visible={showConfirm} />
                      </button>
                    </div>
                    {confirmPass && confirmPass !== newPass && (
                      <span style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, color: '#E53935', lineHeight: '16px' }}>
                        Passwords don&apos;t match
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer buttons */}
            <div style={{ padding: '24px 32px 32px', display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
              {step === 'current' ? (
                <>
                  <button
                    onClick={() => setStep('forgot')}
                    style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#001633', height: 38, padding: '0 20px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', cursor: 'pointer' }}
                  >
                    I forgot my password
                  </button>
                  <button
                    onClick={() => { if (currentPass.trim()) setStep('new'); }}
                    disabled={!currentPass.trim()}
                    style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#fff', height: 38, padding: '0 20px', borderRadius: 8, border: 'none', background: currentPass.trim() ? '#006EFE' : '#B0C8F9', cursor: currentPass.trim() ? 'pointer' : 'not-allowed' }}
                  >
                    Next
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setStep('current'); setNewPass(''); setConfirmPass(''); }}
                    style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#001633', height: 38, padding: '0 20px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onClose}
                    disabled={!newPass || !confirmPass || confirmPass !== newPass}
                    style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#fff', height: 38, padding: '0 20px', borderRadius: 8, border: 'none', background: (newPass && confirmPass && confirmPass === newPass) ? '#006EFE' : '#B0C8F9', cursor: (newPass && confirmPass && confirmPass === newPass) ? 'pointer' : 'not-allowed' }}
                  >
                    Update password
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(modal, document.body) : null;
}

/* ─────────────────────────────────────────────
   Upgrade Plan Modal
───────────────────────────────────────────── */

const PLANS = [
  {
    id: 'standard',
    name: 'Standard',
    price: '$27',
    period: 'lifetime access',
    /* Card copy, not table rows. At 250px a 13px line holds about 28 characters, so lines
       written as feature-database labels ran to three wrapped lines each and four cards of
       five bullets came to roughly eighty lines of small text. Every line here is capped near
       32 characters so it wraps at most once — same five facts per card, half the text.
       "Standard/Pro/Premium Templates" became the count the "Standard Templates" row already
       carries (100/200/300), which is shorter and says more.
       The generations line is the one that stays long, and deliberately. Two shorter forms were
       tried and both failed on clarity rather than width: "10 generations a month" (139px) never
       says what is being generated, since no other line on the card names it, and "10 Wordgenie
       generations/mo" (178px) trades that for an abbreviation nobody reads as "per month".
       Spelling it out costs 208px against a 203px column at 1440 and 185 at 1366 — and no card
       width closes that, because fitting 208 at 1366 needs a 1156px row where 1062 exists. So
       this line wraps to two, which is the right trade for the one line on the card that states
       the allowance. Premium's "Unlimited Wordgenie generations" is 198: one line at 1440, two
       below it.
       Widening the card instead was measured and rejected: +24px per card puts the row at 1156
       against the comparison table's 1050, and at 1366 — where most of these screens are — the
       row already has 2px of headroom, so a wider cap would change nothing there anyway.
       Four and five lines, not everything the tier has — the comparison table below is the
       exhaustive list, so a bullet earns its place here only by changing which plan someone
       picks. Cut on those grounds:
       - Standard's "Export presentations to PDF". The "Create Presentations and Courses" row is
         false for Standard, so there is nothing on this tier to export.
       - Standard's "Page numbering & contents". Nobody chooses a price tier for page numbers.
       - Pro's "Export to PowerPoint & PNG", now covered by "Create presentations & courses",
         which is the actual unlock and was named nowhere on the card despite being a whole
         capability the tier below doesn't have.
       - Pro's "3D Cover Creator". A cover mockup is the lightest thing on the card and it was
         sitting where Kindle publishing belongs. */
    features: ['10 Wordgenie generations a month', 'Unlimited PDF eBooks', 'Unlimited flipbooks', '100 Templates'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$97',
    period: '/year',
    features: ['20 Wordgenie generations a month', 'Create presentations & courses', 'Publish to Kindle & ePub', 'No Designrr watermark', '200 Templates'],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$297',
    period: '/year',
    /* Five lines, same as the tiers below. Every card lists only what it adds over the tier
       under it, and those increments genuinely shrink as you go up — which left the two most
       expensive cards with 88 and 117px of empty space below their last bullet while the
       cheapest had 23. The page was showing you less as the price went up.
       The three lines added here are not new claims: each is a COMPARISON_SECTIONS row where
       this plan beats the one below it, stated with the number the table already carries
       ("Standard Templates" 200→300, "Video or Audio" false→4 hours /m, "AudioBooks"
       false→100,000 Credits). They are also the first hard figures on a card — every other
       line names a capability.
       "Manuscript" dropped from the generations line: the allowance is one shared pool spent
       by books and presentations alike, which is what the row's own tooltip says and what
       Standard and Pro already word correctly. */
    features: ['Unlimited Wordgenie generations', 'Publish print books', 'Transcribe 4 hours a month', '100,000 audiobook credits', '300 Templates'],
  },
  {
    id: 'agency',
    name: 'Agency Premium',
    price: '$497',
    period: '/year',
    /* Same reasoning as Premium. The two added lines are the rows where Agency Premium beats
       Premium by an amount rather than by a capability — "Video or Audio" 4→25 hours /m and
       "AudioBooks" 100,000→250,000 Credits — which is most of what this tier actually sells
       and was stated nowhere on the card. */
    features: ['Custom template creator', 'Client collaboration interface', 'Accounts for agency members', 'Transcribe 25 hours a month', '250,000 audiobook credits'],
  },
];

const PLAN_ORDER = PLANS.map((p) => p.id);

/** A cell is either a literal value shown as text ("100", "Unlimited", "100,000 Credits"),
 *  or a boolean rendered as a checkmark / dash. Order matches PLAN_ORDER: standard, pro, premium, agency. */
type ComparisonCell = string | boolean;
interface ComparisonRow { label: string; tooltip?: string; values: [ComparisonCell, ComparisonCell, ComparisonCell, ComparisonCell]; }
interface ComparisonSection { header?: string; rows: ComparisonRow[]; }

const COMPARISON_SECTIONS: ComparisonSection[] = [
  {
    rows: [
      { label: 'Standard Templates', values: ['100', '200', '300', '300'] },
      { label: 'Dynamic Templates', tooltip: 'Templates that adapt their layout automatically as you add content, instead of a fixed structure.', values: [false, true, true, true] },
    ],
  },
  {
    header: 'Presentations',
    rows: [
      { label: 'Create Presentations and Courses', tooltip: 'Turn a manuscript into a narrated presentation, video course, or webinar.', values: [false, true, true, true] },
    ],
  },
  {
    header: 'Publish',
    rows: [
      { label: 'PDF eBooks', values: ['Unlimited', 'Unlimited', 'Unlimited', 'Unlimited'] },
      { label: 'Flipbooks', values: ['Unlimited', 'Unlimited', 'Unlimited', 'Unlimited'] },
      { label: 'PDF to Flipbook', tooltip: '"Active" means flipbooks currently published — replace one to publish another once you hit the limit.', values: ['10 Active', 'Unlimited', 'Unlimited', 'Unlimited'] },
      { label: 'Kindle, ePub & iBooks', values: [false, 'Unlimited', 'Unlimited', 'Unlimited'] },
      { label: 'Print Books', values: [false, false, true, true] },
      { label: 'AudioBooks', tooltip: 'Credits are spent per minute of audio generated for your book.', values: [false, false, '100,000 Credits', '250,000 Credits'] },
      { label: 'Live eBooks', tooltip: 'A published eBook that updates automatically whenever you edit the source document.', values: [false, true, true, true] },
    ],
  },
  {
    header: 'Imports',
    rows: [
      { label: 'PDF (Text and Image extractor)', values: [false, true, true, true] },
      { label: 'Web, MS Word, Google Docs, Text', values: [true, true, true, true] },
      { label: 'Video or Audio', tooltip: '"/m" is hours of video or audio you can import and transcribe each month.', values: [false, false, '4 hours /m', '25 hours /m'] },
    ],
  },
  {
    header: 'Tools',
    rows: [
      { label: 'eBook 3D Cover Creator', values: [false, true, true, true] },
      { label: 'eBook Mockup Creator', values: [false, true, true, true] },
      { label: 'Custom Template Creator', values: [false, false, false, true] },
      { label: 'Collaborative eBooks with Client Interface', tooltip: 'Invite clients into a dedicated view to leave feedback directly on the eBook.', values: [false, false, false, true] },
    ],
  },
  {
    header: 'Wordgenie Tools',
    rows: [
      { label: 'Wordgenie Book Generator', values: [true, true, true, true] },
      { label: 'Wordgenie v4 Generations', tooltip: 'One shared allowance, spent by books and presentations alike.', values: ['10 /mo', '20 /mo', 'Unlimited', 'Unlimited'] },
      { label: 'Presentation export — PDF', values: [true, true, true, true] },
      { label: 'Presentation export — PowerPoint, PNG', values: [false, true, true, true] },
      { label: 'Share link without Designrr watermark', values: [false, true, true, true] },
      { label: 'Wordgenie Prompt', tooltip: 'Generate a manuscript from a single instruction, without the guided step-by-step flow.', values: [false, true, true, true] },
      { label: 'Wordgenie Chat', tooltip: 'Refine and expand your manuscript through a back-and-forth conversation with Wordgenie.', values: [false, true, true, true] },
      { label: 'Wordgenie Edit', tooltip: 'Ask Wordgenie to rewrite, tighten, or restyle existing chapters in place.', values: [false, true, true, true] },
    ],
  },
];

export interface QuotaAllowance { plan: string; line: string }

/* Per-plan allowance for the manuscript quota gate, in the unit the user just ran out of.
   Only the tiers that give a *different* answer earn a card: Standard is what they already
   have, and Agency Premium repeats Premium's "Unlimited". Every volume gate in the study
   (Krea, Lovable, Visual Electric) leads with the quantity rather than a feature list —
   at a quota the user has already decided they want the product and is asking how much of
   it they get. Numbers mirror the Wordgenie row in COMPARISON_SECTIONS. */
export const MANUSCRIPT_ALLOWANCES: QuotaAllowance[] = [
  { plan: 'pro', line: '20 Wordgenie generations per month' },
  { plan: 'premium', line: 'Unlimited Wordgenie generations' },
];

export function UpgradePlanModal({
  onClose,
  currentPlanId: currentPlanIdOverride,
  contextMessage,
  highlightPlanId,
  highlightFeature,
  quota,
  presentation = 'modal',
}: {
  onClose: () => void;
  /** Override the viewer's plan. Omitted, it comes from the store, so the sidebar and
      My Account can't disagree about which plan someone is on the way they used to. */
  currentPlanId?: string;
  /** What triggered the modal — e.g. "Unlock the Kindle Book format". Becomes the title:
      Mixpanel names its dialog after the feature, Circle after the blocked action. Absent,
      this is a standing entry point and the title falls back to the generic one. */
  contextMessage?: string;
  /** Plan to lead with — the cheapest tier that clears the gate. Defaults to Premium. */
  highlightPlanId?: string;
  /** The capability the user was blocked on, in whatever words the caller uses. Hoisted to the
      top of every card's feature list and marked, so "does this fix my problem" is answered on
      the first line. Ignored at a quota, where the allowance is already the headline. */
  highlightFeature?: string;
  /** Present when a usage limit fired rather than a locked feature. The caller owns the
      numbers — this component never invents an allowance it can't source. */
  quota?: { allowances: QuotaAllowance[]; resetLabel?: string };
  /** 'modal' (default): every existing call site — a specific block fired mid-task, so an
      interrupt over the current screen is correct. 'page': the standing, nothing-blocked case —
      `/account/upgrade` renders this in its own column, no modal chrome, no width of its own. */
  presentation?: 'modal' | 'page';
}) {
  const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;
  const storePlan = useFlowStore((s) => s.currentPlan);
  const currentPlanId = currentPlanIdOverride ?? storePlan;
  const currentRank = PLAN_ORDER.indexOf(currentPlanId);
  const router = useRouter();
  /* Open by default on the standing page. Someone who navigated here is comparing — that's the
     whole reason the route exists — so hiding the table behind a disclosure makes them ask for
     what they came for. In a modal it stays closed: a gate fired mid-task, and the full matrix
     is not what that interruption is about. */
  const [compareOpen, setCompareOpen] = useState(presentation === 'page');
  // The expand/collapse wrapper clips with overflow:hidden while animating so the height:0→auto
  // transition doesn't flash content early. That same overflow:hidden would also break the table's
  // sticky header (it'd stick relative to this clipped box instead of the modal's real scroll
  // container), so it's lifted to 'visible' once the open animation actually finishes.
  const [compareSettled, setCompareSettled] = useState(presentation === 'page');
  // Collapsed by section index — every section starts open since the user already opted
  // into "Compare plans" explicitly; collapsing is theirs to do, not a default we impose.
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());

  /* Dialog behaviour, modal shell only. An interrupt laid over the user's current task has to
     behave like a dialog rather than a floating div: focus moves in on open so a keyboard user
     isn't left stranded behind it, Escape dismisses, Tab cycles inside instead of wandering into
     the page underneath, and focus returns to whatever opened it. `onClose` is read through a ref
     so a caller passing a fresh arrow function every render can't re-fire this effect and snatch
     focus back mid-interaction. */
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    if (presentation !== 'modal') return;
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); return; }
      if (e.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [presentation]);

  const handleUpgrade = (planId: string) => {
    if (planId === 'pro' || planId === 'premium') {
      router.push(`/checkout?plan=${planId}`);
    }
  };

  const effectiveHighlight = highlightPlanId ?? 'premium';
  const highlightRank = PLAN_ORDER.indexOf(effectiveHighlight);
  // Every tier at or above the one that unlocks the triggering feature also includes it.
  // They're named in a sentence under the card rather than given columns of their own —
  // Typeform's "Available on these plans: …" does exactly this.
  const qualifyingIds = contextMessage ? PLAN_ORDER.slice(highlightRank) : [];

  /* Three shapes, chosen by what opened the modal.
     - quota    → the tiers that answer "how many do I get", because the right one depends
                  on the user's volume and picking for them is wrong half the time.
     - feature  → one card, the cheapest tier that clears the gate. There is a single right
                  answer, so a grid is a comparison nobody asked for.
     - standing → the full grid. Someone who clicked Upgrade with no task running IS
                  comparing, which is the one case the four columns are for. */
  const mode: 'quota' | 'feature' | 'standing' =
    quota ? 'quota' : contextMessage ? 'feature' : 'standing';

  const upgradesOnly = (ids: string[]) => ids.filter((id) => PLAN_ORDER.indexOf(id) > currentRank);
  let visiblePlanIds: string[];
  if (mode === 'quota') visiblePlanIds = upgradesOnly(quota!.allowances.map((a) => a.plan));
  else if (mode === 'feature') visiblePlanIds = upgradesOnly([effectiveHighlight]);
  else visiblePlanIds = PLAN_ORDER;
  // A gate shouldn't fire for someone who already owns the tier, but if one ever does,
  // fall back to everything above their plan rather than rendering an empty modal.
  if (!visiblePlanIds.length) visiblePlanIds = upgradesOnly(PLAN_ORDER);
  const visiblePlans = PLANS.filter((p) => visiblePlanIds.includes(p.id));
  const allowanceLineFor = (id: string) => quota?.allowances.find((a) => a.plan === id)?.line;

  /* The standing page is a different kind of surface from the gate modal, and only it gets the
     treatment below: a headline, the reasons to upgrade, and Agency Premium lifted out of the
     card row. A gate fires over a blocked feature — the feature IS the argument, so a marketing
     layer there is noise. Someone who opened this page from the sidebar arrived with no task
     blocked and nothing yet arguing for the spend. */
  const isPage = presentation === 'page' && mode === 'standing';

  /* One column edge for the whole page. The header and card row were capped at 1060 and the
     comparison at 1050 — 10px apart, which is a misalignment rather than a step, and neither
     used the width the route actually offers. 1136 is that width at 1440: viewport less the
     sidebar less the page's own 32px gutters. Below 1440 every block shrinks together and the
     cap stops binding, so this only changes large screens.
     Two widths, not one. PAGE_W is that full column and the comparison takes it; the header
     and the card row sit at COL_W and the table steps out 38px each side of them.
     The step has to come out of the cards, because 1136 already IS the whole column — so it
     was measured rather than picked: at 1100 the step is 18px a side, which reads as a
     misalignment rather than a decision, and at 1020 it costs seven wrapped bullet lines.
     1060 is the knee: 38px a side is unambiguous, and it costs two wrapped lines
     ("Create presentations & courses" and "Accounts for agency members"), both of which
     read fine on two.
     Below 1440 neither cap binds and the two collapse to the same width together. */
  const PAGE_W = 1136;
  const COL_W = 1060;
  /* The comparison goes wider than the column by bleeding 16px into each of the route's own
     32px gutters — the only width left, since PAGE_W already is the full column. It keeps a
     16px gutter rather than running to the window edge, which is what stops a full-bleed table
     reading as a rendering fault. Step against the cards goes 38px a side to 54. */
  const TABLE_W = PAGE_W + 32;

  /* All four plans stay in the row. Agency Premium is the most expensive but not the most
     valuable — it adds client accounts, seats and a custom template creator, which is a
     different buyer's needs rather than more of what Premium gives the same buyer — and an
     earlier pass lifted it out of the row on those grounds. That was wrong twice over: the
     comparison table below still gave it a full column, so the page disagreed with itself, and
     every emphasis device here (tint, border, inline badge, the single filled button) is
     independent of position and count, so a fourth card costs the recommended one nothing.
     Keeping it in the row also keeps $497 sitting directly beside $297, where it anchors. */
  const cardPlans = visiblePlans;

  /* ── A/B preview: how many cards sit in the row ───────────────────────────────
     A — four across, the current layout.
     B — the three tiers one buyer actually chooses between, and nothing else. Agency
         Premium is the most expensive but not the most valuable: it adds client accounts,
         seats and a custom template creator, which is a different buyer's needs rather
         than more of what Premium gives the same buyer. It keeps its column in the
         comparison below, where someone looking for it will find it, and stays out of a
         row that exists to help one person pick between three. A band tried to hold that
         middle ground and could not: re-stating the tier in a different shape is a
         squashed card, and the only version that earned its place changed the offer
         itself — at which point it belonged nowhere near the ladder.
         Three across also buys each card 50px over A (250 -> 300), enough to unwrap
         every bullet in the row.
     Preview only — delete the switch and the `cardLayout` state once one wins. */
  const [cardLayout, setCardLayout] = useState<'A' | 'B'>('A');
  useEffect(() => {
    const v = localStorage.getItem('dsgn_upgrade_layout');
    if (v === 'A' || v === 'B') setCardLayout(v);
  }, []);
  const chooseLayout = (v: 'A' | 'B') => { setCardLayout(v); localStorage.setItem('dsgn_upgrade_layout', v); };
  const splitAgency = isPage && cardLayout === 'B';
  /* B's row is narrower than A's. Three cards at COL_W come out 340 wide, which is more width
     than five short bullets and a price need — the row started to read as stretched rather than
     generous. 940 puts them at 300, still 50 wider than A's four-across, and the longest bullet
     ("Unlimited Wordgenie generations", 213px at 14) clears a 234px text column with room, so
     the row keeps every line unwrapped. Below about 900 the wrapping starts again.
     The header and the Agency band follow it: the headline shares an edge with the cards it
     introduces, and the band belongs to the row above it, not to the table below. */
  const ROW_W = splitAgency ? 940 : COL_W;
  const rowPlans = splitAgency ? cardPlans.filter((pl) => pl.id !== 'agency') : cardPlans;
  const agencyPlan = PLANS.find((pl) => pl.id === 'agency')!;

  /* Button / Medium, straight off the design system: 38 tall, radius 8, Nunito Sans 14 / 600 /
     18. Every call to action on the page uses it — the three cards, the agency row and the
     table's footer — because they are the same action at the same importance, and three heights
     for one action read as three different components.
     The modal is left on the sizes it already ships (40 in a card, 38 under the table). Its 40
     is 2px off the system, which is worth fixing but is not this change.
     Semantic/Size are the system's own axes, so this takes their names rather than inventing
     new ones. */
  const BTN = { primary: 'var(--color-accent)', secondaryBorder: 'var(--color-border)', secondaryHover: 'var(--color-surface)', ink: 'var(--color-text-display)' } as const;

  /* ── Type scale (page only) ──────────────────────────────────────────────────
     Six steps, and every one has a job. What this replaces was twelve sizes —
     9.5, 11, 11.5, 12.5, 13, 13.5, 14, 14.5, 15, 20, 27, 38 — six of them inside a
     2.5px band nobody can perceive as separate levels, which is how the plan name
     ended up smaller than its own bullets and the cards ended up smaller than the
     reference table. Half-pixels are gone: they hint unevenly and they were only
     ever the residue of tuning one element at a time.
     `label` and `body` carry almost the whole page; the top three exist once each.
     WEIGHT is 400/600/700 and nothing else, because `layout.tsx` loads exactly
     those three faces of Nunito Sans — the `800`s this page declared in four
     places were silently resolving to 700 and telling the next reader a lie. */
  const T = { label: 12, body: 14, lead: 16, heading: 20, title: 28, display: 36 } as const;
  const LH = { label: '16px', body: '20px', lead: '24px', heading: '26px', title: '34px', display: '42px' } as const;
  const W = { regular: 400, medium: 600, bold: 700 } as const;

  /* ── Spacing scale (page only) ───────────────────────────────────────────────
     A 4px grid. What this replaces was 6/8/9/10/12/14/16/20/28/32/88 — 6, 9, 10 and
     14 sit on no grid at all and existed because each seam was negotiated on its own.
     The rule that matters is the ratio, not the number: a gap between groups is at
     least twice the gap inside one, which is what makes the card read as three
     things (identity, action, contents) rather than one column of stacked lines. */
  const S = { xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32, section: 80 } as const;

  /* Visible to a screen reader, not to the eye. Inline rather than a `sr-only` class because the
     project has no such utility and a table cell whose only content is an icon is exactly where
     one is needed. */
  const SR_ONLY: React.CSSProperties = {
    position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
    overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
  };

  const ctaGeom = (inTable = false): React.CSSProperties => isPage
    ? { height: 38, borderRadius: 8, fontSize: 14, fontWeight: 600, lineHeight: '18px' }
    : inTable
      ? { height: 38, borderRadius: 8, fontSize: 14, fontWeight: 600 }
      : { height: 40, borderRadius: 8, fontSize: 14, fontWeight: 600 };

  /* Primary means "this is the action to take", and the system gives exactly one fill for it.
     On the page one plan gets Primary and the rest get Secondary; in the modal every upgrade
     button keeps the fill it already had.
     Colours go out as custom properties rather than as background/border, because the hover,
     focus and disabled states are in `.dr-btn` and an inline background would beat them. Hover
     and disabled values are the system's own: Primary Blue/40 and /90, and White gray. */
  /* Entrance. One pass on mount, then completely still — nothing loops, because a moving
     gradient on a page someone sits and reads carries no information and charges attention for
     it. The cards arrive left to right in price order rather than leading with the recommended
     one: the price order IS the comparison, and revealing it out of sequence makes you re-scan.
     Emphasis comes after, when the light gathers on Premium.
     Page only. A gate modal is an interruption mid-task and already has its own 180ms entrance;
     staging it would make an interruption take longer to read.
     Under reduced motion every element renders at its resting state directly — the card is
     finished whether or not any of this runs. */
  const reduceMotion = useReducedMotion();
  const animateIn = isPage && !reduceMotion;
  const EASE = [0.2, 0, 0, 1] as const;
  /* `animate` is always supplied and only `initial` is conditional. Dropping the whole prop set
     when motion is off strands the element on its initial opacity:0 with nothing to move it —
     `useReducedMotion` resolves after the first render, so the initial had already applied and
     the animate that would have cleared it vanished on the next pass. `initial={false}` is the
     supported way to say "start at the resting state". */
  const cardVariants = {
    hidden: { opacity: 0, y: 10, scale: 0.985 },
    show: (i: number) => ({
      opacity: 1, y: 0, scale: 1,
      transition: animateIn
        ? { duration: 0.38, delay: i * 0.07, ease: EASE, delayChildren: i * 0.07 + 0.06, staggerChildren: 0.045 }
        : { duration: 0 },
    }),
  };
  /* The card's own contents. No initial or animate of their own — they inherit the label from
     the card, which is what makes `staggerChildren` above apply to them. Movement is 6px: any
     more and four cards doing it at once reads as the page assembling itself. */
  const partVariants = {
    hidden: { opacity: 0, y: 6 },
    show: { opacity: 1, y: 0, transition: animateIn ? { duration: 0.26, ease: EASE } : { duration: 0 } },
  };
  const cardEnter = (i: number) => ({
    variants: cardVariants,
    custom: i,
    initial: (animateIn ? 'hidden' : false) as 'hidden' | false,
    animate: 'show',
  });
  const partEnter = { variants: partVariants };
  /* Starts once the last card has landed, so the light reads as arriving on a settled row. */
  const glowEnter = {
    initial: animateIn ? { opacity: 0, scale: 0.9 } : false,
    animate: { opacity: 1, scale: 1 },
    transition: animateIn ? { duration: 0.55, delay: 0.42, ease: EASE } : { duration: 0 },
  };
  /* `x: '-50%'` rather than a CSS `translateX(-50%)` in the style object: animating `scale`
     makes framer-motion own the transform property outright, and an inline transform alongside
     it is simply overwritten — which is how the centred pill quietly drifted right. Handing the
     offset to motion as a value keeps it composed with the scale. */
  /* The shell, and the band that sits in it.
     No scale. The shell is anchored to the card's edges — 4px proud on three sides, 36 above —
     and that geometry IS what it means, so arriving at 90% of it read as a rendering fault
     rather than as motion. It is also a child of the card, so it already inherits the card's
     own y and scale; giving it a second transform was animating the same thing twice.
     No fixed 0.42 delay either. That was long enough for the row to finish landing first, so a
     blue plane appeared behind a card that had already settled. Timed off the card's own index
     instead, it resolves as that card arrives — the reader sees a recommended card, not a card
     that becomes recommended.
     Explicit initial/animate on both, because relying on the card to propagate `show` through
     the Fragment left the label parked at opacity 0 — the same failure the centred pill had. */
  const shellEnter = (i: number) => ({
    initial: animateIn ? { opacity: 0 } : false,
    animate: { opacity: 1 },
    transition: animateIn ? { duration: 0.45, delay: i * 0.07 + 0.1, ease: EASE } : { duration: 0 },
  });
  const bandEnter = (i: number) => ({
    initial: animateIn ? { opacity: 0 } : false,
    animate: { opacity: 1 },
    transition: animateIn ? { duration: 0.3, delay: i * 0.07 + 0.26, ease: EASE } : { duration: 0 },
  });
  const pillEnter = {
    initial: animateIn ? { opacity: 0, scale: 0.9, x: '-50%' } : { x: '-50%' },
    animate: { opacity: 1, scale: 1, x: '-50%' },
    transition: animateIn ? { duration: 0.2, delay: 0.4, ease: EASE } : { duration: 0 },
  };

  const ctaSkin = (variant: 'primary' | 'secondary' | 'tertiary' | 'disabled'): React.CSSProperties => ({
    primary:   { '--btn-bg': BTN.primary, '--btn-bg-h': 'var(--color-accent-hover)', '--btn-bd': BTN.primary, '--btn-bd-h': 'var(--color-accent-hover)', '--btn-fg': '#fff', '--btn-bg-d': 'var(--color-accent-disabled)' },
    secondary: { '--btn-bg': '#fff', '--btn-bg-h': BTN.secondaryHover, '--btn-bd': BTN.secondaryBorder, '--btn-bd-h': 'var(--color-border-strong)', '--btn-fg': BTN.ink },
    tertiary:  { '--btn-bg': '#fff', '--btn-bg-h': 'var(--color-accent-light)', '--btn-bd': BTN.primary, '--btn-fg': BTN.primary },
    disabled:  { '--btn-bg': 'var(--color-fill-disabled)', '--btn-bd': 'transparent', '--btn-fg': 'var(--color-text-tertiary)' },
  } as Record<string, React.CSSProperties>)[variant];

  /* Loose match, because callers name the thing the user clicked in their own words ("Kindle Book
     format") while the plan table has its own ("Publish to Kindle"). Either containing the other
     is enough to treat them as the same line and avoid listing it twice. */
  const sameFeature = (a: string, b: string) => {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    return x.includes(y) || y.includes(x);
  };

  const featureLinesFor = (plan: typeof PLANS[number]) => {
    const lines = plan.features.map((text) => ({ text, lead: false }));
    // The allowance leads the list rather than sitting above it as a headline: it's the answer
    // to what they hit, so it belongs where every other "what you get" line is, just first and
    // marked. The plan's own generations line is dropped, since this replaces it with a fuller
    // sentence ("20 Wordgenie generations per month").
    if (mode === 'quota') {
      const allowance = allowanceLineFor(plan.id);
      const rest = lines.filter((l) => !/generation/i.test(l.text));
      return allowance ? [{ text: allowance, lead: true }, ...rest] : rest;
    }
    if (!highlightFeature) return lines;
    return [
      { text: highlightFeature, lead: true },
      ...lines.filter((l) => !sameFeature(l.text, highlightFeature)),
    ];
  };

  /* Focused modes don't need 980px of chrome. Opening Compare re-widens the modal, since
     the five-column table genuinely needs the room. */
  const baseWidth = mode === 'standing' ? 980 : visiblePlans.length === 1 ? 460 : 720;
  const modalWidth = compareOpen ? 980 : baseWidth;

  /* Everything below the chrome — header, plan cards, compare table — shared between the two
     shells this component can render as. It doesn't reference the backdrop, the card, or the
     close button, so nothing here needs to change for a shell that has neither. */
  const content = (
    <>
        {/* Layout preview — not product chrome. Deliberately the same floating pill the homepage
            already uses for its plan preview (FlowOrchestrator): fixed bottom-right, translucent
            and blurred, so it reads as a tool sitting over the page rather than a control that
            belongs to it. Delete this and the `cardLayout` state once A or B wins. */}
        {isPage && (
          <div
            className="fixed bottom-5 right-5 z-50 flex items-center"
            style={{
              gap: 2, padding: 4, borderRadius: 999,
              background: 'rgba(255,255,255,0.9)', border: '1px solid #DDE2EA',
              boxShadow: '0 2px 8px rgba(15,23,51,0.08)', backdropFilter: 'blur(8px)',
            }}
          >
            {(['A', 'B'] as const).map((v) => {
              const active = cardLayout === v;
              return (
                <button
                  key={v}
                  onClick={() => chooseLayout(v)}
                  className="cursor-pointer transition-colors"
                  style={{
                    padding: '4px 12px', borderRadius: 999, border: 'none',
                    background: active ? '#EAF1FF' : 'transparent',
                    ...ns, fontSize: 12, fontWeight: active ? 700 : 600,
                    color: active ? '#006EFE' : '#8596AD',
                  }}
                >
                  {v === 'A' ? 'A · 4 cards' : 'B · 3 + Agency'}
                </button>
              );
            })}
          </div>
        )}
        {/* Header — the modal is titled after whatever triggered it rather than after itself.
            Mixpanel titles its upgrade dialog "Track Cohorts Across Reports"; Circle names the
            blocked action. A generic "Upgrade your account" only fits the standing entry point,
            where nothing specific triggered it.
            paddingTop lives here (not on the scroll container) so the comparison table's sticky
            header can stick flush at true top:0 with no gap above it. 32 happens to be right for
            both shells: it clears the modal's floating X, and it's the same top padding every
            other plain content page in the app gives its first block below the sidebar-toggle
            bar (Projects, Docs — `padding: '32px 32px 0'`). paddingRight is modal-only: it's
            clearance for the floating X, which the page shell doesn't have. */}
        <div style={{ paddingTop: 32, /* B pays 44px of grid padding for the shell's band, so the 32 that sits right under
               A's subhead stacks into a 76px hole under a headline that now stands alone. 16 puts
               the band 16 below the headline and the card tops at 60. */
          marginBottom: isPage ? (splitAgency ? S.base : S.xxl) : 20, paddingRight: presentation === 'page' ? 0 : 28, ...(isPage ? { maxWidth: ROW_W, marginInline: 'auto' } : null) }}>
          {/* The page gets an eyebrow and a headline that makes a claim, because it has to earn
              the spend on its own. The modal keeps the plain title: whatever fired the gate is
              already the headline, and a second one competing with it would only add words. */}
          {/* A only, same reasoning as the subhead: B's header is the headline alone. An eyebrow
              labels a page whose title needs context, and "More formats, fewer limits" sitting
              above four plan prices does not. */}
          {isPage && !splitAgency && (
            <p style={{ ...ns, fontSize: T.label, fontWeight: W.bold, color: 'var(--color-accent)', letterSpacing: '0.1em', lineHeight: LH.label, marginBottom: S.sm }}>
              UPGRADE
            </p>
          )}
          <p id={titleId} style={{ ...ns, fontSize: isPage ? T.title : 20, fontWeight: W.bold, color: 'var(--color-text-display)', lineHeight: isPage ? LH.title : '26px', letterSpacing: isPage ? '-0.02em' : undefined, textWrap: 'balance' }}>
            {/* B names the job instead of making a claim. With the eyebrow and the subhead gone
                this line is the whole header, and "More formats, fewer limits" is a two-clause
                pitch above four prices that already make the argument. Every in-app plan page in
                the survey titles itself plainly — Melio "Choose a plan that's right for you",
                Cursor "Adjust your plan", Lyssna "Change your plan", folk and Webflow just
                "Plans" — and none of them opens with marketing copy. */}
            {contextMessage ?? (splitAgency ? 'Choose your plan' : isPage ? 'More formats, fewer limits' : 'Upgrade your account')}
          </p>
          {/* A only. In B the three cards carry the same claim in their own words one line
              below, and the Agency band adds a fourth voice — the subhead became the third
              summary of the page in the first 200px. */}
          {isPage && !splitAgency && (
            <p style={{ ...ns, fontSize: T.lead, fontWeight: W.regular, color: 'var(--color-text-muted)', lineHeight: LH.lead, marginTop: S.sm, textWrap: 'pretty' }}>
              Upgrading adds Kindle, print and audiobooks, and lifts your generation limit.
            </p>
          )}
          {/* Waiting is a legitimate way out of a quota, so say when the allowance returns
              instead of implying paying is the only option. */}
          {mode === 'quota' && quota?.resetLabel && (
            <p style={{ ...ns, fontSize: 13, fontWeight: 400, color: 'var(--color-text-muted)', lineHeight: '18px', marginTop: 6 }}>
              {quota.resetLabel}
            </p>
          )}
        </div>

        {/* Plan cards */}
        {/* On the page the track is `auto-fit` with a floor rather than a fixed count: at 200%
            zoom (or any window under ~1000px of content width) four fixed columns overflowed the
            scroll container by 263px and sliced the recommended card — and its only filled
            button — off the right edge. 228 is the narrowest the longest button label
            ("Upgrade to Agency Premium") stays on one line at 14/600 inside 20px of padding.
            The modal keeps an explicit count: its width is set by `modalWidth`, so its columns
            can't be asked to reflow. */}
        <div className="grid" style={{ gridTemplateColumns: isPage ? 'repeat(auto-fit, minmax(228px, 1fr))' : `repeat(${rowPlans.length}, 1fr)`, gap: isPage ? 20 : 16, ...(isPage ? { maxWidth: ROW_W, marginInline: 'auto', paddingTop: splitAgency ? 44 : 0 } : null) }}>
          {rowPlans.map((plan, cardIndex) => {
            const isCurrent = plan.id === currentPlanId;
            const isDowngrade = !isCurrent && PLAN_ORDER.indexOf(plan.id) < currentRank;
            // "Recommended" is a comparative claim, so it only means anything against other
            // cards. In the focused modes there's nothing to be recommended over.
            const isHighlighted = mode === 'standing' && !isCurrent && plan.id === effectiveHighlight;
            /* Layout B carries the artifact's "gradient shell": the recommended card keeps the
               exact white body its neighbours have and the colour is a separate plane behind it,
               4px proud on the sides and foot and 36px above, where the band carries the claim.
               The pill and the radial glow are the A treatment and stand down here — two devices
               saying "this one" is one too many. */
            const shellRec = splitAgency && isHighlighted;
            return (
            <motion.div
              key={plan.id}
              {...cardEnter(cardIndex)}
              style={{
                borderRadius: isPage ? 14 : 12,
                /* On the page the recommended card is tinted and outlined rather than shadowed.
                   A shadow says "nearer"; a tint says "this one", and it survives being third of
                   four instead of centred — which a notch or a floating tab would not. */
                border: shellRec ? 'none' : '1px solid var(--color-border)',
                background: shellRec ? 'transparent' : '#fff',
                /* Every card on the page gets a little elevation, not just the recommended one.
                   A hairline is structure; a shadow is depth, and with four flat outlines on a
                   white page nothing sat on a plane at all — which is most of why the row read
                   as flat. Premium's is stronger and blue-cast, so the glow reads as light
                   falling on a raised card rather than a stain on a flat one. */
                boxShadow: isHighlighted
                  ? (isPage
                      ? '0 2px 4px rgba(16,24,40,0.05), 0 18px 40px rgba(0,110,254,0.18)'
                      : '0 8px 24px rgba(0,110,254,0.14)')
                  : (isPage ? '0 1px 2px rgba(16,24,40,0.04), 0 6px 16px rgba(16,24,40,0.05)' : 'none'),
                overflow: 'visible',
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
                position: 'relative',
              }}
            >
              {/* Floating badge — sits on top of the card, not part of its internal layout, so it
                  never affects card height or pushes siblings out of alignment. On the page it
                  moves inline beside the plan name instead: the card is already tinted, so the
                  badge only has to name the claim, not carry the emphasis by itself. */}
              {/* Built from the brand blue and its lighter neighbours, so it reads as one light
                  source in the product's own hue. Clipped by its own rounded layer rather than by
                  the card, which has to stay overflow:visible for the pill on its top edge. */}
              {isPage && isHighlighted && !shellRec && (
                <div aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 14, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
                  <motion.div {...glowEnter} style={{
                    position: 'absolute', top: -70, right: -80, width: 300, height: 260, filter: 'blur(26px)',
                    background: [
                      'radial-gradient(closest-side at 62% 34%, rgba(0,110,254,0.34), transparent 72%)',
                      'radial-gradient(closest-side at 34% 62%, rgba(122,150,255,0.32), transparent 72%)',
                      'radial-gradient(closest-side at 80% 72%, rgba(70,200,255,0.34), transparent 70%)',
                      'radial-gradient(closest-side at 50% 88%, rgba(160,130,255,0.24), transparent 72%)',
                    ].join(','),
                  }} />
                </div>
              )}

              {isHighlighted && !shellRec && (
                <motion.div {...pillEnter} style={{
                  position: 'absolute', top: -13, left: '50%', zIndex: 2,
                  background: 'var(--color-accent)', borderRadius: 999, padding: '4px 14px', whiteSpace: 'nowrap',
                  ...ns, fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: 0.3,
                  boxShadow: '0 2px 8px rgba(0,110,254,0.3)',
                }}>
                  RECOMMENDED
                </motion.div>
              )}

              {shellRec && (
                <>
                  <motion.div aria-hidden="true" {...shellEnter(cardIndex)} style={{
                    position: 'absolute', top: -36, left: -4, right: -4, bottom: -4,
                    borderRadius: 18, zIndex: 0, pointerEvents: 'none',
                    /* No drop shadow. The shell is already 4px proud of the card on three sides
                       and 36 above it — it IS the depth cue, and a coloured shadow under a
                       coloured plane just smears its edge. */
                    background: 'var(--color-accent)',
                  }} />
                  <motion.div {...bandEnter(cardIndex)} style={{
                    position: 'absolute', top: -36, left: 0, right: 0, height: 36, zIndex: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    ...ns, fontSize: 11, fontWeight: W.bold, color: '#fff', letterSpacing: '0.09em',
                  }}>
                    RECOMMENDED
                  </motion.div>
                </>
              )}

              {/* The page runs wider padding than the modal — it has the column width for it,
                  and at 16 inline the content sat closer to the card edge than the card's own
                  14 radius wants. 20 still leaves "Upgrade to Agency Premium", the longest label
                  in the row at 25 characters, room to breathe inside its button. */}
              <div style={{ padding: isPage ? '24px 20px 24px' : '20px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1,
                ...(shellRec ? { background: '#fff', border: '1px solid var(--color-border)', borderRadius: 14 } : null) }}>

              {/* Name — no tier icon above it. A decorative bolt/star/crown/briefcase told a
                  reader nothing the name and price didn't already; Linear, Vercel, Notion, Stripe
                  and GitHub all differentiate tiers with text alone.
                  On the page it is ink rather than blue. Blue was on the name, the price accents,
                  every checkmark and the button — seven things per card, which is six too many for
                  a colour that is supposed to mean "this is the action". */}
              <motion.div {...partEnter} className="flex items-center" style={{ gap: 10, justifyContent: 'space-between', marginBottom: isPage ? S.sm : 8 }}>
                {/* A label, not a second headline. At 19/800/ink against a 32/800/ink price these
                    two differed only by size, and by a ratio of 1.7 — close enough that the eye
                    read them as one block and neither led. As a small uppercase label the name
                    differs on size, weight, colour and case at once, the ratio goes to 2.6, and
                    the price becomes the thing the card is about. */}
                {/* 13.5, not 12.5: the name was the smallest type in the card and the bullets
                    were 13, so the card's identity was set below its own detail. It also shared
                    12.5/#52637A with the "Everything in X, plus:" line and the price's period —
                    three different jobs on one treatment. Now it is the only uppercase text in
                    the card, a size above the bullets and a weight above them, while staying far
                    enough under the price (32 against 13.5) that the price still leads.
                    700, not 800: only 400/600/700 are loaded, so 800 was resolving to 700 anyway. */}
                <p style={{ ...ns, fontSize: isPage ? T.label : 18, fontWeight: W.bold, color: isPage ? 'var(--color-text-muted)' : 'var(--color-accent)', lineHeight: isPage ? LH.label : '24px', letterSpacing: isPage ? '0.1em' : undefined, textTransform: isPage ? 'uppercase' : undefined }}>{plan.name}</p>
              </motion.div>

              {/* Price. Same treatment in every mode now — the allowance moved into the list
                  below, so a quota card and a feature card are the same shape. */}
              <motion.div {...partEnter} className="flex items-baseline" style={{ gap: 6, marginBottom: isPage ? 0 : 16, order: isPage ? 2 : undefined }}>
                <span style={{ ...ns, fontSize: isPage ? T.display : 28, fontWeight: W.bold, color: 'var(--color-text-display)', lineHeight: isPage ? LH.display : '34px', letterSpacing: isPage ? '-0.03em' : undefined, fontVariantNumeric: 'tabular-nums' }}>{plan.price}</span>
                {/* 400, not 600. The period is a unit riding on the number, not a label — at 600
                    it carried the same weight as the plan name and read as a second one. */}
                <span style={{ ...ns, fontSize: T.body, fontWeight: W.regular, color: 'var(--color-text-muted)', lineHeight: LH.body }}>{plan.period}</span>
              </motion.div>

              {/* Divider — modal only. On the page the seam between the offer (price, action) and
                  the list already had 44px across it, four times the 11px between bullets, so
                  space was carrying the grouping on its own and the rule was a second device
                  saying the same thing inside a card that already has a border. Removed, and the
                  gap comes down to 30: without a line to sit clear of, 44 was reading as a hole
                  rather than a break, and it still separates by nearly 3x the intra-group gap. */}
              {!isPage && <div style={{ height: 1, background: 'var(--color-border)', marginTop: 0, marginBottom: 16 }} />}

              {/* Every plan still lists what it includes — leading with the thing that was
                  blocked doesn't mean hiding the rest, and the rest is most of the reason to
                  pick one tier over another. What changes is the order: whatever the user hit
                  comes first and is marked, so the answer to "does this fix my problem" is the
                  first line rather than the fourth. At a quota that answer is already the
                  headline above, so it's dropped from the list instead of stated twice. */}
              <motion.div {...partEnter} className="flex flex-col" style={{ gap: isPage ? S.md : 10, flex: 1, marginTop: isPage ? S.xl : 0, order: isPage ? 5 : undefined }}>
                {(() => {
                  const prevPlan = PLANS[PLAN_ORDER.indexOf(plan.id) - 1];
                  return (
                    /* 12/400, down from 12.5/600. This labels the list; it is not a third
                       heading. At 600 it matched the plan name's weight and the period's size,
                       and a card with three interchangeable small labels has no hierarchy at
                       all. The 6 here plus the list's own 10 gives 16 to the first bullet
                       against 10 between bullets, so it reads as heading the list. */
                    <p style={{ ...ns, fontSize: T.body, fontWeight: W.regular, color: 'var(--color-text-muted)', lineHeight: LH.body, marginBottom: S.xs }}>
                      {prevPlan ? `Everything in ${prevPlan.name}, plus:` : 'Features:'}
                    </p>
                  );
                })()}
                {featureLinesFor(plan).map(({ text, lead }) => (
                  <div key={text} className="flex items-start" style={{ gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                      {/* Same colour and optical weight as the line it marks. "Included" and
                          "this is the action" are different meanings that were sharing one
                          colour, and a check that outweighs its own label reads as a separate
                          object rather than punctuation for the text. */}
                      <path d="M3 8l3.5 3.5 6.5-7" stroke={isPage ? 'var(--color-text-primary)' : 'var(--color-accent)'} strokeWidth={isPage ? (lead ? 2 : 1.5) : (lead ? 2.4 : 1.8)} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {/* 14, same as the comparison table's own rows. The cards are the summary and
                        the surface with the action on it; the table below is reference. Setting
                        the summary a size under the detail is the same inversion the plan name
                        had against these bullets, one level up, and it is most of why the row
                        read as lightweight against a table it should be leading. */}
                    <span style={{ ...ns, fontSize: isPage ? 14 : 13, fontWeight: lead ? W.bold : W.regular, color: 'var(--color-text-primary)', lineHeight: isPage ? LH.body : '18px' }}>{text}</span>
                  </div>
                ))}
              </motion.div>

              {/* CTA button — names its destination. Three adjacent buttons all reading
                  "Upgrade" leave the column position as the only thing distinguishing them.
                  On the page it sits directly under the price, before the feature list: the
                  decision and the action belong together, and six features between them push the
                  button below the fold on a short window. The list runs last and absorbs the
                  leftover height, so the cards still line up. */}
              {/* 20 against the 6 that holds the name to its price: the identity block groups
                  more than 3x tighter than it separates from the action, which is what makes the
                  two read as two things rather than one run of stacked lines. */}
              <motion.div {...partEnter} style={{ marginTop: isPage ? S.lg : 20, order: isPage ? 3 : undefined }}>
                {isCurrent ? (
                  <button disabled className="dr-btn" style={{ width: '100%', ...ns, ...ctaGeom(), ...ctaSkin('disabled') }}>
                    Current plan
                  </button>
                ) : isDowngrade ? (
                  /* Tertiary in the system's terms: white ground, accent border and label. */
                  <button className="dr-btn" style={{ width: '100%', cursor: 'pointer', ...ns, ...ctaGeom(), ...ctaSkin('tertiary') }}>
                    Switch to {plan.name}
                  </button>
                ) : (
                  /* One filled button per row on the page. Three identical blue buttons make the
                     colour meaningless — the recommended card can't be marked by a treatment its
                     neighbours already have. The others stay neutral and outlined, which is what
                     every plan grid worth copying does. */
                  <button
                    onClick={() => handleUpgrade(plan.id)}
                    className="dr-btn"
                    style={{ width: '100%', cursor: 'pointer', ...ns, lineHeight: '18px', ...ctaGeom(), ...ctaSkin(!isPage || isHighlighted ? 'primary' : 'secondary') }}
                  >
                    Upgrade to {plan.name}
                  </button>
                )}
              </motion.div>
              </div>
            </motion.div>
            );
          })}
        </div>


        {/* Layout B only. Not a fourth card — a fork. Agency Premium answers a different buyer,
            so it gets a different shape, a different action and copy that opens on the reader
            rather than on the tier. A band that only re-states the plan in a shorter box is a
            squashed card; what earns this its place is that the offer itself is different. */}
        {splitAgency && (() => {
          const isCurrent = agencyPlan.id === currentPlanId;
          const isDowngrade = !isCurrent && PLAN_ORDER.indexOf(agencyPlan.id) < currentRank;
          return (
            <motion.div {...cardEnter(rowPlans.length)} style={{
              maxWidth: ROW_W, marginInline: 'auto', marginTop: S.lg,
              /* Blue/97 to Blue/90, not a neutral. The neutral wash measured 1.07:1 against the
                 white page — technically a fill, visually nothing. The two ways to be seen were a
                 stronger grey (Black/90, 1.27) or the brand ramp (Blue/90, 1.32), and grey is the
                 one that already read as disabled here: an inert control is never raised or
                 coloured, so a grey panel is the single most disabled-looking thing available.
                 Blue cannot be mistaken for inactive.
                 It does not collide with the table's Premium tint even though both are blue: that
                 is flat Blue/97 at 1.09, this is a directional gradient ending three ramp steps
                 darker, and this band carries no badge, no shell and no filled button. */
              borderRadius: 14, border: '1px solid var(--color-primary-blue-90)',
              background: 'linear-gradient(120deg, var(--color-accent-light) 0%, var(--color-primary-blue-90) 100%)',
              boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 6px 16px rgba(16,24,40,0.05)',
              padding: '20px 24px', display: 'flex', alignItems: 'center', gap: S.xl,
            }}>
              <motion.div {...partEnter} style={{ flex: 1, minWidth: 0 }}>
                <p style={{ ...ns, fontSize: T.label, fontWeight: W.bold, color: 'var(--color-text-muted)', lineHeight: LH.label, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: S.xs }}>{agencyPlan.name}</p>
                {/* Names the job, not the feature list. "Their own view" rather than "their own
                    login": the Client Interface row describes a dedicated view to leave feedback
                    in, and it is "Accounts for Agency Members" — your team — that are logins. */}
                <p style={{ ...ns, fontSize: T.body, fontWeight: W.regular, color: 'var(--color-text-primary)', lineHeight: LH.body }}>
                  <span style={{ fontWeight: W.bold }}>Managing books for clients?</span>{' '}
                  <span style={{ color: 'var(--color-text-muted)' }}>Give each one their own view, and keep every template on your brand.</span>
                </p>
              </motion.div>

              <motion.div {...partEnter} style={{ flexShrink: 0, width: 210 }}>
                {isCurrent ? (
                  <button disabled className="dr-btn" style={{ width: '100%', ...ns, ...ctaGeom(), ...ctaSkin('disabled') }}>Current plan</button>
                ) : isDowngrade ? (
                  <button className="dr-btn" style={{ width: '100%', cursor: 'pointer', ...ns, ...ctaGeom(), ...ctaSkin('tertiary') }}>Switch to {agencyPlan.name}</button>
                ) : (
                  /* Not "Upgrade", and no price beside it. Seats and client accounts are a
                     conversation, not a checkout, and a flat $497 next to "Talk to us" is the two
                     halves of the offer disagreeing. */
                  <button className="dr-btn" style={{ width: '100%', cursor: 'pointer', ...ns, lineHeight: '18px', ...ctaGeom(), ...ctaSkin('secondary') }}>Talk to us</button>
                )}
              </motion.div>
            </motion.div>
          );
        })()}

        {/* The other tiers that also clear this gate, named in a sentence rather than given
            columns. Typeform ships exactly this — "Available on these plans: Business,
            Enterprise, …" under a single button — and it keeps the card honest about the
            cheaper option without spending three columns saying so. */}
        {mode === 'feature' && qualifyingIds.length > 1 && (() => {
          const names = qualifyingIds.slice(1).map((id) => PLANS.find((p) => p.id === id)?.name ?? '');
          const list = names.length === 1
            ? names[0]
            : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
          return (
            <p style={{ ...ns, fontSize: 12.5, fontWeight: 400, color: 'var(--color-text-muted)', lineHeight: '18px', marginTop: 14, textAlign: 'center' }}>
              Also included in {list}.
            </p>
          );
        })()}

        {/* The cards and the table show the same four plans in two different visual languages,
            so without a break they read as one continuous stream rather than as a summary and
            its detail. Two things separate them, and neither is colour or a line: 64px of
            distance against the 26px that separates groups inside a card, and the comparison
            capped at 1050 against the row's 1060 — near enough that the two now read as the
            same column, so the width step is no longer doing any of the separating.
            88 rather than more: measured at an 800px-tall window the "Compare plans and
            features" heading lands 21px above the fold, and it has to stay visible — it is the
            only thing telling you there is more below the cards. */}
        {/* Wider than the cards. The comparison is a four-column grid that gains from every
            pixel, while the card row is four fixed objects that don't — and the step out past
            the cards' edges is itself part of what separates the two sections, on top of the
            change of surface. It bleeds by the page gutter, so its edges land where the column
            would otherwise end rather than at some invented width. */}
        <div style={isPage ? { marginTop: S.section, marginInline: -16 } : undefined}>
        <div style={isPage ? { maxWidth: TABLE_W, marginInline: 'auto' } : undefined}>
        {/* Compare plans. In the modal this is a centred blue link, because it is genuinely an
            invitation — the table is closed and most people at a gate never want it. On the page
            the table is already open, so the same link would be asking for something the reader
            already has. It becomes a left-aligned section heading with a quiet collapse control
            instead: it labels what follows rather than offering to reveal it. */}
        <div
          className={isPage ? 'flex items-center justify-between' : 'flex items-center justify-center'}
          style={{ marginTop: isPage ? 0 : 24, gap: 6 }}
        >
          {isPage && (
            <p style={{ ...ns, fontSize: T.heading, fontWeight: W.bold, color: 'var(--color-text-display)', lineHeight: LH.heading, letterSpacing: '-0.015em' }}>
              Compare plans and features
            </p>
          )}
          <button
            onClick={() => setCompareOpen((v) => { const next = !v; if (!next) setCompareSettled(false); return next; })}
            aria-expanded={compareOpen}
            style={{ ...ns, fontSize: T.body, fontWeight: W.medium, color: isPage ? 'var(--color-text-muted)' : 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {isPage ? (compareOpen ? 'Hide' : 'Show') : 'Compare plans and features'}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isPage ? 'var(--color-text-muted)' : 'var(--color-accent)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: compareOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {/* Inline comparison table */}
        <AnimatePresence>
          {compareOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              onAnimationComplete={() => { if (compareOpen) setCompareSettled(true); }}
              style={{ overflow: compareSettled ? 'visible' : 'hidden' }}
            >
              {/* The sideways scroll is the table's own, not the page's — otherwise the header
                  and the cards slide off with it. Only below 1040px, because `overflow-x: auto`
                  makes `overflow-y` compute to auto as well, and that turns this box into a
                  scrollport the sticky header would stick to instead of the page's: on a
                  content-height box that never scrolls, sticky is simply lost. Above 1040 the
                  table fits its column anyway, so the wrapper stays `visible` and keeps it. */}
              <div className={isPage ? 'max-[1040px]:overflow-x-auto' : undefined} style={{ marginTop: isPage ? S.base : 24 }}>
                {/* A floor, not a width. `tableLayout: fixed` at 100% will happily crush five
                    columns into 86px — measured at 390 — which is narrower than the word
                    "Unlimited". Below 720 the table scrolls sideways in the page's own scroll
                    container instead, which is the one thing on a page that is allowed to. */}
                <table style={{ width: '100%', minWidth: isPage ? 720 : undefined, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      {/* 26/18.5 rather than 36/16. The label column was carrying more width than
                          its longest row needs, and the four value columns were paying for it —
                          most visibly in the footer, where "Upgrade to Agency Premium" had two
                          pixels either side of it while "Upgrade to Pro" floated in the middle
                          of an identical button. */}
                      <th style={{ position: 'sticky', top: 0, zIndex: 2, width: '26%', padding: '16px', background: '#fff', verticalAlign: 'bottom', boxShadow: '0 1px 0 var(--color-border)' }} />
                      {PLANS.map((p) => {
                        const isHighlighted = p.id === effectiveHighlight;
                        return (
                          <th key={p.id} scope="col" style={{
                            position: 'sticky', top: 0, zIndex: 2,
                            padding: isPage ? '12px 12px 16px' : '16px 12px', width: '18.5%', verticalAlign: 'bottom',
                            background: isHighlighted ? 'var(--color-accent-light)' : '#fff',
                            boxShadow: '0 1px 0 var(--color-border)',
                          }}>
                            {/* Name and action only. The price is already in the card above and
                                in the table's own first rows; repeating it here would be the third
                                time on one screen. The header is sticky, so the button stays with
                                the plan it belongs to however far down you read — which is what
                                the footer row underneath used to be for, and why that row is gone. */}
                            <div className="flex flex-col items-center" style={{ gap: isPage ? S.sm : 0 }}>
                              <span style={{ ...ns, fontSize: T.lead, fontWeight: W.bold, lineHeight: LH.lead, color: isHighlighted ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>{p.name}</span>
                              {isPage && (() => {
                                const isCur = p.id === currentPlanId;
                                const isDown = !isCur && PLAN_ORDER.indexOf(p.id) < currentRank;
                                if (isCur) return (
                                  <button disabled className="dr-btn" style={{ width: '100%', ...ns, ...ctaGeom(true), ...ctaSkin('disabled') }}>Current plan</button>
                                );
                                /* The label stays short because the plan name is directly above it
                                   in the same cell and the column is 174px — "Upgrade to Agency
                                   Premium" wraps to two lines and breaks the 38px row of buttons.
                                   But nothing carries that name into the accessible name, so a
                                   screen reader's control list showed three identical "Upgrade"
                                   buttons with no way to tell which column each belonged to. The
                                   aria-label restores the destination without touching the
                                   geometry, and matches the wording the cards already use. */
                                if (isDown) return (
                                  <button aria-label={`Switch to ${p.name}`} className="dr-btn" style={{ width: '100%', cursor: 'pointer', ...ns, ...ctaGeom(true), ...ctaSkin('tertiary') }}>Switch</button>
                                );
                                /* In B, Agency Premium is a contact tier — so its column says so
                                   too. The last time the cards and the table disagreed about this
                                   plan, the page told two stories at once and the cards lost. */
                                if (splitAgency && p.id === 'agency') return (
                                  <button aria-label={`Talk to us about ${p.name}`} className="dr-btn"
                                    style={{ width: '100%', cursor: 'pointer', ...ns, ...ctaGeom(true), ...ctaSkin('secondary') }}>
                                    Talk to us
                                  </button>
                                );
                                return (
                                  <button onClick={() => handleUpgrade(p.id)} aria-label={`Upgrade to ${p.name}`} className="dr-btn"
                                    style={{ width: '100%', cursor: 'pointer', ...ns, ...ctaGeom(true), ...ctaSkin(isHighlighted ? 'primary' : 'secondary') }}>
                                    Upgrade
                                  </button>
                                );
                              })()}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON_SECTIONS.map((section, si) => {
                      const isCollapsed = collapsedSections.has(si);
                      return (
                      <Fragment key={si}>
                        {section.header && (
                          <tr>
                            <td style={{ paddingTop: si === 0 ? S.sm : S.xxl, paddingBottom: S.md }}>
                              <button
                                onClick={() => setCollapsedSections((prev) => {
                                  const next = new Set(prev);
                                  next.has(si) ? next.delete(si) : next.add(si);
                                  return next;
                                })}
                                className="flex items-center cursor-pointer"
                                style={{ gap: 8, background: 'none', border: 'none', padding: 0 }}
                              >
                                {/* A label for the rows under it, not a headline. At 22/700 these
                                    were 29% larger than "Compare plans and features", the heading
                                    that owns them, and 81% of the page's own h1 — a subordinate
                                    heading outranking its parent. Dropped onto the same uppercase
                                    label treatment the plan names use in the cards, so the page
                                    has one label system and the descent reads 27 → 20 → 15. */}
                                <span style={{ ...ns, fontSize: isPage ? T.label : 22, fontWeight: W.bold, lineHeight: isPage ? LH.label : undefined, color: isPage ? 'var(--color-text-muted)' : 'var(--color-text-primary)', letterSpacing: isPage ? '0.1em' : undefined, textTransform: isPage ? 'uppercase' : undefined }}>{section.header}</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isCollapsed ? 'none' : 'rotate(180deg)', transition: 'transform 0.15s' }}>
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </button>
                            </td>
                            {/* Empty cells (not colSpan) so the highlighted column's tint keeps
                                running underneath section headers instead of breaking at each one. */}
                            {PLANS.map((p) => (
                              <td key={p.id} style={{ background: p.id === effectiveHighlight ? 'var(--color-accent-light)' : 'transparent' }} />
                            ))}
                          </tr>
                        )}
                        {!isCollapsed && section.rows.map((row) => (
                          /* The band is painted on the cells, not the row. The highlighted
                             column's tint is an inline style on its own td, and an inline style
                             beats a rule on the tr — so the old row-level hover lit four cells
                             and skipped the fifth, cutting a hole in the band at exactly the
                             column most people are tracking. Both grounds are classes now, so
                             the hover rule can reach the tinted cell and deepen it instead of
                             being overridden by it. */
                          <tr key={row.label} className="dr-cmp-row">
                            <td style={{ ...ns, fontSize: T.body, fontWeight: W.medium, lineHeight: LH.body, color: 'var(--color-text-primary)', padding: '12px 16px', borderTop: '1px solid var(--color-border)' }}>
                              <div className="flex items-center" style={{ gap: 6 }}>
                                {row.label}
                                {row.tooltip && (
                                  <Tooltip label={row.tooltip} maxWidth={220}>
                                    <span className="inline-flex items-center justify-center" style={{ width: 14, height: 14, borderRadius: '50%', border: '1.3px solid var(--color-text-tertiary)', color: 'var(--color-text-tertiary)', fontSize: 9.5, fontWeight: 700, cursor: 'default', lineHeight: 1 }}>
                                      i
                                    </span>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                            {row.values.map((cell, ci) => {
                              const isHighlighted = PLANS[ci].id === effectiveHighlight;
                              return (
                                <td key={ci} className={isHighlighted ? 'dr-cmp-hl' : undefined} style={{
                                  textAlign: 'center', padding: '12px 12px',
                                  borderTop: '1px solid var(--color-border)',
                                }}>
                                  {typeof cell === 'string' ? (
                                    <span style={{ ...ns, fontSize: T.body, lineHeight: LH.body, color: 'var(--color-text-primary)' }}>{cell}</span>
                                  ) : cell ? (
                                    <>
                                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: 'inline-block' }} aria-hidden="true">
                                        {/* Matches this table's own row labels, the way the card
                                            checks match their feature lines. Forty-odd blue checks
                                            was the largest single block of accent on the page, and
                                            none of it was an action. */}
                                        <path d="M3 8l3.5 3.5 6.5-7" stroke={isPage ? 'var(--color-text-primary)' : 'var(--color-accent)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                      <span style={SR_ONLY}>Included</span>
                                    </>
                                  ) : (
                                    /* "Not included" was an en dash at #C5CDD9 — 1.60:1 on white and
                                       1.48:1 inside the Premium column's tint, so the single most
                                       decision-relevant fact in the table was drawn at the edge of
                                       visibility, and to a screen reader the cell was simply empty.
                                       Now a cross at the check's own weight and cap, in #7A8AA3:
                                       3.50:1 on white, 3.25 on the tint and 3.26 on the hover band,
                                       clearing the 3:1 floor for non-text on every ground it lands
                                       on while staying well below the check's 9:1 so present still
                                       outranks absent. The rest of the weight comes off thickness
                                       and size, not colour, which has no headroom left: a cross
                                       reads heavier than a check at equal stroke because two
                                       strokes meet in the middle, so it runs 1.5 against the
                                       check's 2 while matching its size: 7 units square against
                                       the check's 10 x 7 box. Weight comes off the stroke, not
                                       the footprint — a smaller glyph made the two states look
                                       like different kinds of mark rather than two answers to
                                       the same question. Not red — every in-app plan table surveyed
                                       that used red (Synthesia, Krea) is a marketing page; a tier
                                       not including something is a fact, not an error. */
                                    <>
                                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: 'inline-block' }} aria-hidden="true">
                                        <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke={isPage ? 'var(--color-icon-absent)' : 'var(--color-icon-absent)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                      <span style={SR_ONLY}>Not included</span>
                                    </>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </Fragment>
                      );
                    })}

                    {/* Bottom CTA row — repeats the plan-card actions so comparing every row
                        doesn't force a scroll back up to the cards to act on the decision.
                        Modal only: on the page the sticky header already holds a button per plan,
                        and it never scrolls away, so a second row of the same four actions would
                        be the same decision offered twice. */}
                    {!isPage && (
                    <tr>
                      <td style={{ paddingTop: 28 }} />
                      {PLANS.map((plan) => {
                        const isCurrent = plan.id === currentPlanId;
                        const isDowngrade = !isCurrent && PLAN_ORDER.indexOf(plan.id) < currentRank;
                        // Bottom-aligned: "Upgrade to Agency Premium" wraps to two lines at this
                        // column width while its neighbours don't, and a row of buttons with
                        // ragged bottoms reads as a mistake where ragged tops doesn't.
                        return (
                          <td key={plan.id} style={{ padding: isPage ? '28px 6px 24px' : '28px 12px 24px', verticalAlign: 'bottom' }}>
                            {isCurrent ? (
                              <button disabled className="dr-btn" style={{ width: '100%', ...ns, ...ctaGeom(true), ...ctaSkin('disabled') }}>
                                Current plan
                              </button>
                            ) : isDowngrade ? (
                              <button className="dr-btn" style={{ width: '100%', cursor: 'pointer', ...ns, ...ctaGeom(true), ...ctaSkin('tertiary') }}>
                                Switch to {plan.name}
                              </button>
                            ) : (
                              /* Mirrors the cards: one filled button on the page, on the same
                                 plan. Three filled blue buttons here would undo at the bottom of
                                 the page what the card row establishes at the top. */
                              <button
                                onClick={() => handleUpgrade(plan.id)}
                                className="dr-btn"
                                style={{ width: '100%', cursor: 'pointer', ...ns, ...ctaGeom(true), ...ctaSkin(!isPage || plan.id === effectiveHighlight ? 'primary' : 'secondary') }}
                              >
                                Upgrade to {plan.name}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
        </div>
    </>
  );

  // A real page for the standing case — someone who asked to see plans with no specific task
  // blocked. It used to be that this component was ALWAYS a modal, which meant the sidebar's
  // plan row had nowhere better to send you than My Account's billing tab, one click short of
  // the actual comparison. Modal chrome (backdrop, click-outside-to-close, the floating X, the
  // scale-in entrance, the maxHeight:90vh scroll clip) is exactly what an interrupt over an
  // in-progress task needs and a destination you navigated to doesn't need at all.
  // No width wrapper here — `/account/upgrade/page.tsx` owns the column width and renders its own
  // (wider than `modalWidth`, since the cards don't need to match a modal's proportions once
  // they're not sharing a card with anything). A maxWidth here would just cap the route's own
  // container back down and make "wider cards" a no-op.
  if (presentation === 'page') {
    return content;
  }

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(20,25,31,0.40)', zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0, width: modalWidth }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white relative"
        style={{ borderRadius: 16, padding: '0 32px 28px', boxShadow: '0px 4px 40px 0px rgba(0,0,0,0.12)', maxHeight: '90vh', overflowY: 'auto', overscrollBehavior: 'contain', outline: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute flex items-center justify-center hover:opacity-60 transition-opacity cursor-pointer"
          style={{ top: 20, right: 20, width: 24, height: 24, background: 'none', border: 'none', padding: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M14 4L4 14M4 4l10 10" stroke="var(--color-text-secondary)" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>

        {content}
      </motion.div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(modal, document.body) : null;
}

/* ─────────────────────────────────────────────
   Revoke Access Modal
───────────────────────────────────────────── */

function RevokeAccessModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(20,25,31,0.40)', zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white relative"
        style={{ width: 484, borderRadius: 12, padding: 32, boxShadow: '0px 2px 20px 0px rgba(0,0,0,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute flex items-center justify-center hover:opacity-60 transition-opacity cursor-pointer"
          style={{ top: 16, right: 16, width: 24, height: 24, background: 'none', border: 'none', padding: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M14 4L4 14M4 4l10 10" stroke="#29323D" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="flex flex-col" style={{ gap: 32 }}>
          <div className="flex flex-col" style={{ gap: 12 }}>
            <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 20, fontWeight: 600, color: '#15191F', lineHeight: '24px' }}>
              Revoke access?
            </p>
            <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 16, fontWeight: 400, color: '#52637A', lineHeight: '20px' }}>
              Once you revoke access on this session it will sign out from your account and interrupt all your unsaved progress
            </p>
          </div>
          <div className="flex items-center justify-end" style={{ gap: 6 }}>
            <button
              onClick={onClose}
              style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#001633', height: 38, padding: '0 20px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={() => { onConfirm(); onClose(); }}
              style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#fff', height: 38, padding: '0 20px', borderRadius: 8, border: 'none', background: '#D62929', cursor: 'pointer' }}
            >
              Revoke access
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(modal, document.body) : null;
}

function DeleteAccountModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(20,25,31,0.40)', zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white relative"
        style={{ width: 484, borderRadius: 12, padding: 32, boxShadow: '0px 2px 20px 0px rgba(0,0,0,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute flex items-center justify-center hover:opacity-60 transition-opacity cursor-pointer"
          style={{ top: 16, right: 16, width: 24, height: 24, background: 'none', border: 'none', padding: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M14 4L4 14M4 4l10 10" stroke="#29323D" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="flex flex-col" style={{ gap: 32 }}>
          <div className="flex flex-col" style={{ gap: 12 }}>
            <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 20, fontWeight: 600, color: '#15191F', lineHeight: '24px' }}>
              Delete your account?
            </p>
            <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 16, fontWeight: 400, color: '#52637A', lineHeight: '20px' }}>
              This permanently deletes your account, projects, and files. This action can&apos;t be undone.
            </p>
          </div>
          <div className="flex items-center justify-end" style={{ gap: 6 }}>
            <button
              onClick={onClose}
              style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#001633', height: 38, padding: '0 20px', borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={() => { onConfirm(); onClose(); }}
              style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#fff', height: 38, padding: '0 20px', borderRadius: 8, border: 'none', background: '#D62929', cursor: 'pointer' }}
            >
              Delete account
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(modal, document.body) : null;
}

/* ─────────────────────────────────────────────
   Tab: Password & Security
───────────────────────────────────────────── */

const MOCK_SESSIONS = [
  { id: '1', device: 'macOS · Chrome 124', location: 'San Francisco, US', lastActive: 'Active now', current: true, type: 'desktop' },
  { id: '2', device: 'Windows · Edge 121', location: 'London, UK', lastActive: '12 days ago', current: false, type: 'browser' },
  { id: '3', device: 'iPhone · Safari', location: 'New York, US', lastActive: '2 hours ago', current: false, type: 'mobile' },
];

function DeviceIcon({ type }: { type?: string }) {
  if (type === 'mobile') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#667C98" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="12" y1="18" x2="12" y2="18.01" />
    </svg>
  );
  if (type === 'browser') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#667C98" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#667C98" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function PasswordTab() {
  const router = useRouter();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [revokeSessionId, setRevokeSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState(MOCK_SESSIONS);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  const revokeSession = (id: string) => {
    setSessions((s) => s.filter((sess) => sess.id !== id));
  };

  return (
    <>
      <AnimatePresence>
        {showChangePassword && (
          <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
        )}
        {revokeSessionId && (
          <RevokeAccessModal
            onClose={() => setRevokeSessionId(null)}
            onConfirm={() => revokeSession(revokeSessionId)}
          />
        )}
        {showDeleteAccount && (
          <DeleteAccountModal
            onClose={() => setShowDeleteAccount(false)}
            onConfirm={() => router.push('/')}
          />
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-6">
        {/* Password card */}
        <SectionCard>
          <SectionHeader
            title="Password"
            description="Use a strong password with at least 8 characters, numbers and symbols."
          />
          <div className="px-6 py-5 flex items-center justify-between">
            <div>
              <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#15191F', lineHeight: '18px' }}>Current Password</p>
              <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 13, color: '#667C98', lineHeight: '18px', marginTop: 2 }}>changed 30 days ago</p>
            </div>
            <button
              onClick={() => setShowChangePassword(true)}
              style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#006EFE', height: 38, padding: '0 20px', borderRadius: 8, border: '1px solid #006EFE', background: '#F0F6FF', cursor: 'pointer' }}
            >
              Change password
            </button>
          </div>
        </SectionCard>

        {/* Two-factor authentication */}
        <SectionCard>
          <SectionHeader
            title="Two-factor authentication"
            description="Add an extra layer of security. Once enabled, you'll need a verification code in addition to your password."
          />
          <div className="px-6 py-5 flex items-center justify-between">
            <div className="flex items-center" style={{ gap: 12 }}>
              <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 32, height: 32, background: '#F6F7F9' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#667C98" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l8 4v6c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-4z" />
                </svg>
              </div>
              <div>
                <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#15191F', lineHeight: '20px' }}>
                  2FA is {twoFactorEnabled ? 'enabled' : 'disabled'}
                </p>
                <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, fontWeight: 400, color: '#667C98', lineHeight: '16px' }}>
                  {twoFactorEnabled ? 'Your account has an extra layer of protection.' : 'We recommend enabling 2FA.'}
                </p>
              </div>
            </div>
            <Toggle value={twoFactorEnabled} onChange={() => setTwoFactorEnabled((v) => !v)} />
          </div>
        </SectionCard>

        {/* Active sessions */}
        <SectionCard>
          <SectionHeader
            title="Active sessions"
            description="Devices currently signed in to your account. Revoke any sessions you don't recognise."
          />
          <div className="flex flex-col divide-y divide-[#E0E5EB] px-6 pb-6">
            {sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between py-3" style={{ gap: 16 }}>
                <div className="flex items-center" style={{ gap: 12 }}>
                  {/* 32×32 icon pill */}
                  <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 32, height: 32, background: '#F6F7F9' }}>
                    <DeviceIcon type={session.type} />
                  </div>
                  <div>
                    <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#15191F', lineHeight: '20px' }}>
                      {session.device}
                    </p>
                    <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, fontWeight: 400, color: '#667C98', lineHeight: '16px' }}>
                      {session.location} · {session.lastActive}
                    </p>
                  </div>
                </div>
                {session.current ? (
                  /* "This device" — green pill (matches Email "Verified" badge) */
                  <span className="flex items-center" style={{ gap: 4, background: '#F3FCF4', border: '1px solid #85E097', borderRadius: 999, padding: '2px 8px', fontSize: 12, fontFamily: 'Inter, sans-serif', fontWeight: 500, color: '#29A341', flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#29A341" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    This device
                  </span>
                ) : (
                  /* "Revoke" — plain red text, no bg/border */
                  <button
                    onClick={() => setRevokeSessionId(session.id)}
                    style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500, color: '#D62929', background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, lineHeight: '16px' }}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Danger zone */}
        <SectionCard>
          <SectionHeader
            title="Delete account"
            description="Permanently delete your account and all associated data. This can't be undone."
          />
          <div className="px-6 py-5">
            <button
              onClick={() => setShowDeleteAccount(true)}
              style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#D62929', height: 38, padding: '0 20px', borderRadius: 8, border: '1px solid #F3D2D2', background: '#fff', cursor: 'pointer' }}
            >
              Delete account
            </button>
          </div>
        </SectionCard>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
   Tab: Preferences
───────────────────────────────────────────── */

const LANGUAGES = [
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'fr', flag: '🇫🇷', label: 'French' },
  { code: 'es', flag: '🇪🇸', label: 'Spanish' },
  { code: 'it', flag: '🇮🇹', label: 'Italian' },
  { code: 'he', flag: '🇮🇱', label: 'Hebrew' },
  { code: 'de', flag: '🇩🇪', label: 'German' },
];

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="relative flex-shrink-0 rounded-full transition-colors"
      style={{ width: 44, height: 24, background: value ? '#006EFE' : '#E0E5EB', border: 'none', cursor: 'pointer' }}
    >
      <span
        className="absolute top-[3px] rounded-full bg-white transition-transform"
        style={{ width: 18, height: 18, left: 3, transform: value ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  );
}

function ChangeLangModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(20,25,31,0.40)', zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white relative"
        style={{ width: 468, borderRadius: 12, padding: 24, boxShadow: '0px 2px 20px 0px rgba(0,0,0,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute flex items-center justify-center hover:opacity-60 transition-opacity cursor-pointer"
          style={{ top: 16, right: 16, width: 20, height: 20, background: 'none', border: 'none', padding: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
            <path d="M14 4L4 14M4 4l10 10" stroke="#29323D" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="flex flex-col" style={{ gap: 24 }}>
          <div className="flex flex-col" style={{ gap: 4 }}>
            <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 20, fontWeight: 600, color: '#001633', lineHeight: '24px' }}>
              Change language &amp; region
            </p>
            <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 400, color: '#52637A', lineHeight: '18px', width: 420 }}>
              Changing language and region will also update the prices and measurement units according to a specific language you choose. Units you can adjust manually
            </p>
          </div>
          <div className="flex items-center justify-end">
            <button
              onClick={() => { onConfirm(); onClose(); }}
              style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#fff', height: 38, padding: '0 20px', borderRadius: 8, border: 'none', background: '#006EFE', cursor: 'pointer' }}
            >
              Change language
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
  return typeof window !== 'undefined' ? createPortal(modal, document.body) : null;
}

function PreferencesTab() {
  // Measurement units
  const [unit, setUnit] = useState<'mm' | 'in'>('mm');

  // Language
  const [language, setLanguage] = useState('English');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showChangeLangModal, setShowChangeLangModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedLang = LANGUAGES.find((l) => l.label === language) ?? LANGUAGES[0];

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  // Flipbook defaults
  const [hideShare, setHideShare] = useState(false);
  const [hideDownload, setHideDownload] = useState(false);
  const [autoplay, setAutoplay] = useState(true);

  // Email notifications
  const [projectActivity, setProjectActivity] = useState(true);
  const [billing, setBilling] = useState(true);
  const [tips, setTips] = useState(false);

  const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

  return (
    <>
      <AnimatePresence>
        {showChangeLangModal && (
          <ChangeLangModal
            onClose={() => setShowChangeLangModal(false)}
            onConfirm={() => {/* language already applied */}}
          />
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-6">

        {/* ── Measurement units ── */}
        <SectionCard>
          <SectionHeader
            title="Measurement units"
            description="Sets the default unit system used in the editor for margins, padding, and dimensions."
          />
          <div className="px-6 py-5 flex items-center" style={{ gap: 16 }}>
            <button
              onClick={() => setUnit('mm')}
              style={{ ...ns, fontSize: 14, lineHeight: '18px', fontWeight: 400, color: unit === 'mm' ? '#fff' : '#667C98', background: unit === 'mm' ? '#006EFE' : '#fff', border: unit === 'mm' ? 'none' : '1px solid #E0E5EB', borderRadius: 24, padding: '8px 12px', cursor: 'pointer' }}
            >
              Milimeters
            </button>
            <button
              onClick={() => setUnit('in')}
              style={{ ...ns, fontSize: 14, lineHeight: '18px', fontWeight: 400, color: unit === 'in' ? '#fff' : '#667C98', background: unit === 'in' ? '#006EFE' : '#fff', border: unit === 'in' ? 'none' : '1px solid #E0E5EB', borderRadius: 24, padding: '8px 12px', cursor: 'pointer' }}
            >
              Inches
            </button>
          </div>
        </SectionCard>

        {/* ── Language & Region ── */}
        <SectionCard overflowVisible>
          <SectionHeader
            title="Language & Region"
            description="Select the language for the interface and AI-generated content."
          />
          <div className="px-6 py-5">
            {/* Custom dropdown */}
            <div ref={dropdownRef} className="relative" style={{ width: 297 }}>
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="w-full flex items-center justify-between outline-none"
                style={{ height: 40, border: '1px solid #E0E5EB', borderRadius: 4, padding: '0 12px', background: '#fff', cursor: 'pointer', borderColor: dropdownOpen ? '#006EFE' : '#E0E5EB' }}
              >
                <span className="flex items-center" style={{ gap: 8 }}>
                  <span style={{ fontSize: 16, lineHeight: 1 }}>{selectedLang.flag}</span>
                  <span style={{ ...ns, fontSize: 14, color: '#15191F', lineHeight: '20px' }}>{selectedLang.label}</span>
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8596AD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {dropdownOpen && (
                <div
                  className="absolute left-0 right-0 bg-white flex flex-col overflow-hidden"
                  style={{ top: 44, borderRadius: 4, border: '1px solid #E0E5EB', boxShadow: '0px 4px 16px rgba(0,0,0,0.10)', zIndex: 200 }}
                >
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setDropdownOpen(false);
                        if (lang.label !== language) {
                          setLanguage(lang.label);
                          setShowChangeLangModal(true);
                        }
                      }}
                      className="flex items-center text-left transition-colors hover:bg-[#F6F7F9]"
                      style={{ gap: 8, padding: '10px 12px', background: lang.label === language ? '#F0F6FF' : 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{lang.flag}</span>
                      <span style={{ ...ns, fontSize: 14, color: lang.label === language ? '#006EFE' : '#15191F', lineHeight: '20px' }}>{lang.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>
        </SectionCard>

        {/* ── Flipbook defaults ── */}
        <SectionCard>
          <SectionHeader
            title="Flipbook defaults"
            description="Configure the default behaviour for all newly published flipbooks."
          />
          <div className="px-6 flex flex-col" style={{ gap: 24, paddingTop: 24, paddingBottom: 32 }}>
            {[
              { label: 'Hide share buttons', sub: 'Removes the share and social media buttons from the viewer toolbar.', value: hideShare, set: setHideShare },
              { label: 'Hide download button', sub: 'Prevents viewers from downloading the PDF directly from the flipbook.', value: hideDownload, set: setHideDownload },
              { label: 'Autoplay pages', sub: 'Automatically advance pages every 5 seconds when the flipbook is opened.', value: autoplay, set: setAutoplay },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div>
                  <p style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#001633', lineHeight: '18px' }}>{item.label}</p>
                  <p style={{ ...ns, fontSize: 12, fontWeight: 400, color: '#667C98', lineHeight: '16px', marginTop: 2 }}>{item.sub}</p>
                </div>
                <Toggle value={item.value} onChange={() => item.set(!item.value)} />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* ── Email notifications ── */}
        <SectionCard>
          <SectionHeader
            title="Email notifications"
            description="Choose which emails you'd like to receive from us."
          />
          <div className="px-6 flex flex-col" style={{ gap: 24, paddingTop: 24, paddingBottom: 32 }}>
            {[
              { label: 'Project activity', sub: 'Get notified when someone comments on or edits a shared project.', value: projectActivity, set: setProjectActivity },
              { label: 'Billing & receipts', sub: 'Receive invoices, payment confirmations, and subscription updates.', value: billing, set: setBilling },
              { label: 'Tips & product news', sub: 'Occasional emails about new features, tips, and Designrr news.', value: tips, set: setTips },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div>
                  <p style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#001633', lineHeight: '18px' }}>{item.label}</p>
                  <p style={{ ...ns, fontSize: 12, fontWeight: 400, color: '#667C98', lineHeight: '16px', marginTop: 2 }}>{item.sub}</p>
                </div>
                <Toggle value={item.value} onChange={() => item.set(!item.value)} />
              </div>
            ))}
          </div>
        </SectionCard>

      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
   Tab: Plan & Billing
───────────────────────────────────────────── */


/* ─────────────────────────────────────────────
   Buy Credits Modal
───────────────────────────────────────────── */

const CREDIT_PACKAGES: Record<string, { rate: number; unit: string }> = {
  'Audiobook credits':      { rate: 1000,  unit: 'credits' },
  'Transcription minutes':  { rate: 60,    unit: 'minutes' },
};

const AMOUNT_OPTIONS = [5, 25, 50];

function BuyCreditsModal({ creditType, onClose }: { creditType: string; onClose: () => void }) {
  const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;
  const [selected, setSelected] = useState(25);
  const amount = selected;
  const pkg = CREDIT_PACKAGES[creditType] ?? { rate: 1000, unit: 'credits' };
  const quantity = Math.floor(amount * pkg.rate);

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(20,25,31,0.40)', zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white relative"
        style={{ width: 480, borderRadius: 16, padding: 32, boxShadow: '0px 4px 40px 0px rgba(0,0,0,0.12)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute flex items-center justify-center hover:opacity-60 transition-opacity cursor-pointer"
          style={{ top: 20, right: 20, width: 24, height: 24, background: 'none', border: 'none', padding: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M14 4L4 14M4 4l10 10" stroke="#29323D" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ ...ns, fontSize: 20, fontWeight: 700, color: '#001633', lineHeight: '26px' }}>Buy {creditType}</p>
          <p style={{ ...ns, fontSize: 14, color: '#52637A', lineHeight: '20px', marginTop: 4 }}>
            Choose how much you&apos;d like to spend
          </p>
        </div>

        {/* Amount selector */}
        <div className="flex flex-col" style={{ gap: 12, marginBottom: 24 }}>
          <p style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#667C98', lineHeight: '18px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Select amount</p>
          <div className="flex" style={{ gap: 8 }}>
            {AMOUNT_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setSelected(opt)}
                style={{
                  flex: 1, height: 44, borderRadius: 8,
                  border: `1.5px solid ${selected === opt ? '#006EFE' : '#E0E5EB'}`,
                  background: selected === opt ? '#EEF5FF' : '#fff',
                  cursor: 'pointer',
                  ...ns, fontSize: 15, fontWeight: 600,
                  color: selected === opt ? '#006EFE' : '#15191F',
                }}
              >
                ${opt}
              </button>
            ))}
          </div>
        </div>

        {/* Credit preview */}
        <div style={{ background: '#F6F9FF', borderRadius: 12, padding: '16px 20px', marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ ...ns, fontSize: 13, color: '#667C98', lineHeight: '18px' }}>You will receive</p>
            <p style={{ ...ns, fontSize: 26, fontWeight: 800, color: '#001633', lineHeight: '32px', marginTop: 2 }}>
              {quantity > 0 ? quantity.toLocaleString() : '—'}
              <span style={{ fontSize: 14, fontWeight: 400, color: '#52637A', marginLeft: 6 }}>{pkg.unit}</span>
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ ...ns, fontSize: 13, color: '#667C98', lineHeight: '18px' }}>Total</p>
            <p style={{ ...ns, fontSize: 22, fontWeight: 700, color: '#006EFE', lineHeight: '28px', marginTop: 2 }}>
              ${amount > 0 ? amount.toFixed(2) : '0.00'}
            </p>
          </div>
        </div>

        {/* CTA */}
        <button
          disabled={amount <= 0}
          style={{
            width: '100%', height: 44, borderRadius: 10, border: 'none',
            background: amount > 0 ? '#006EFE' : '#B0C8F9',
            cursor: amount > 0 ? 'pointer' : 'not-allowed',
            ...ns, fontSize: 15, fontWeight: 700, color: '#fff',
          }}
        >
          Buy now · ${amount > 0 ? amount.toFixed(2) : '0.00'}
        </button>
      </motion.div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(modal, document.body) : null;
}

const INVOICES = [
  { plan: 'Premium Plan — Monthly', date: 'Apr 1, 2026', amount: '$29.00' },
  { plan: 'Audiobook Credits (100k)',  date: 'Mar 1, 2026', amount: '$9.00' },
  { plan: 'Premium Plan — Monthly', date: 'Feb 1, 2026', amount: '$29.00' },
  { plan: 'Premium Plan — Monthly', date: 'Jan 1, 2026', amount: '$29.00' },
];

function BillingTab() {
  const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;
  const router = useRouter();
  const [upgradeCtx, setUpgradeCtx] = useState<{ message?: string; planId?: string; quota?: boolean } | null>(null);
  /* Unreachable while the Wordgenie credits row is out — that row's "Buy more" was the only
     thing that set this. Kept rather than deleted because the removal is provisional, and
     BuyCreditsModal/CREDIT_PACKAGES still hold the audiobook and transcription packages. */
  const [buyCreditsType, setBuyCreditsType] = useState<string | null>(null);
  /* Reads the same store the composer and the plan switcher do — this card used to hard-code
     "Premium", which contradicted whatever tier the viewer was actually previewing. */
  const billingPlan = useFlowStore((s) => s.currentPlan);
  const presentationsUsed = useFlowStore((s) => s.presentationGenerationsUsed);
  const manuscriptsUsed = useFlowStore((s) => s.manuscriptGenerationsUsed);
  const billingPlanData = PLANS.find((pl) => pl.id === billingPlan) ?? PLANS[0];

  return (
    <div className="flex flex-col gap-6">
      <AnimatePresence>
        {upgradeCtx && (
          <UpgradePlanModal
            onClose={() => setUpgradeCtx(null)}
            contextMessage={upgradeCtx.message}
            highlightPlanId={upgradeCtx.planId}
            quota={upgradeCtx.quota ? { allowances: MANUSCRIPT_ALLOWANCES } : undefined}
          />
        )}
        {buyCreditsType && <BuyCreditsModal creditType={buyCreditsType} onClose={() => setBuyCreditsType(null)} />}
      </AnimatePresence>

      {/* ── Current plan ── */}
      <SectionCard>
        <SectionHeader
          title="Current plan"
          right={
            /* "Upgrade", not "Manage plan" — the label used to promise a management screen it
               never opened. It navigates now rather than opening the in-modal comparison: this
               button and the sidebar's plan row are the same standing, nothing-blocked case
               (UpgradePlanModal's own mode comment: "someone who clicked Upgrade with no task
               running IS comparing"), and a modal opening on top of a page that's one click away
               from being the exact same content would be a duplicate destination, not a shortcut. */
            <button onClick={() => router.push('/account/upgrade')} style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', height: 38, padding: '0 20px', borderRadius: 8, border: 'none', background: '#006EFE', cursor: 'pointer' }}>
              Upgrade
            </button>
          }
        />
        <div className="flex flex-col" style={{ gap: 20, padding: '20px 24px 24px' }}>
          {/* No decorative gradient/border box — Plan usage right below states just as
              important information in a plain layout, and the two stacked cards read as one
              inconsistent unit when only one of them is dressed up. Same reasoning that already
              dropped the tier icon: it added weight, not information. Gap to the next group is
              20px against 8px within the feature list — comfortably over the 2x that keeps
              "plan identity" and "what's included" reading as two groups, not one run-on list. */}
          <div>
            <p style={{ ...ns, fontSize: 24, fontWeight: 700, color: '#001633', lineHeight: '32px' }}>{billingPlanData.name}</p>
            {/* Was "$27 lifetime access · Renews Apr 1, 2026" — a one-time purchase that
                renews is a contradiction, and the date was hardcoded to a point already five
                months in the past regardless of when this renders. Price and period are the
                only facts this card states outright now; when the generation allowance
                resets is a live, computed fact and belongs to the Plan usage section below,
                which already states it per row rather than once, since Standard and PRO can
                fall on different cycles. */}
            <p style={{ ...ns, fontSize: 13, fontWeight: 400, color: '#667C98', lineHeight: '18px' }}>{billingPlanData.price} {billingPlanData.period}</p>
          </div>
          <div className="flex flex-col" style={{ gap: 10 }}>
            {/* Names the group before it's read, the same way "Plan usage" names its section —
                a squint at this card alone should still tell name+price from what's included. */}
            <p style={{ ...ns, fontSize: 11, fontWeight: 600, color: '#8596AD', letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: '14px' }}>Includes</p>
            {/* Was a run of wrapped inline chips in brand blue — every entry read as a link,
                and stacked checklist rows are the shape Apollo, Melio, Fabric and Dribbble all
                use for "what this plan includes". One item per line, plain text, a quiet grey
                check rather than blue. Stroke is 1.5px to match this row's regular (400) text
                weight — 2.5px was sized for bold text nothing here has. */}
            {billingPlanData.features.map((f) => (
              <span key={f} className="flex items-center" style={{ gap: 8, ...ns, fontSize: 13.5, color: '#29323D', fontWeight: 400 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                {f}
              </span>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* ── Plan usage ── */}
      <SectionCard>
        {/* "Plan usage", not "Credit usage" — these are generations, not a purchased balance. */}
        <SectionHeader
          title="Plan usage"
          description="What you've used this cycle, and when it resets."
        />
        <div className="flex flex-col px-6 pb-6" style={{ gap: 24, paddingTop: 20 }}>
          {/* One row, not two, and one pool, not a split. Presentations were once shown as their
              own allowance with their own limit (Standard 5, PRO 10) — but that was never a real
              separate pool, it's the same generations books draw from; see the note above
              MANUSCRIPT_LIMITS in flowStore.ts. A book/presentation breakdown on the bar itself
              said the opposite of that on purpose or not — it read as per-type accounting, which
              is exactly the thing this section exists to correct. One fill, one number. */}
          {(() => {
            const limit = manuscriptLimitFor(billingPlan);
            const unlimited = !Number.isFinite(limit);
            const used = Math.min(combinedGenerationsUsed({ manuscriptGenerationsUsed: manuscriptsUsed, presentationGenerationsUsed: presentationsUsed }), unlimited ? Infinity : limit);
            const pct = unlimited ? 0 : Math.min(Math.round((used / limit) * 100), 100);
            const exhausted = !unlimited && used >= limit;
            // Only worth saying while it's still true and still actionable — once someone has
            // already made a presentation, or has no generations left this cycle, the fact no
            // longer changes what they'd do next.
            const suggestPresentation = !exhausted && presentationsUsed === 0 && manuscriptsUsed > 0;
            return (
              <div className="flex flex-col" style={{ gap: 8 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center" style={{ gap: 10 }}>
                    {/* AISparkleIcon — the official mark, same component as the composer's
                        lockup and every AI-generate affordance, not a one-off redrawn copy. */}
                    <div className="flex items-center justify-center flex-shrink-0" style={{ width: 32, height: 32, borderRadius: '50%', background: '#F0F2FF' }}>
                      <AISparkleIcon size={16} />
                    </div>
                    <div>
                      <p style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F', lineHeight: '18px' }}>Wordgenie generations</p>
                      <p style={{ ...ns, fontSize: 12, color: '#8596AD', lineHeight: '16px' }}>
                        {unlimited
                          ? `${used} used this month`
                          : `${used} of ${limit} used this month · ${allowanceResetLabel()}`}
                      </p>
                    </div>
                  </div>
                  {/* Stays neutral even at zero — running out of an allowance you were already
                      told about isn't a failure, the same reasoning the 80%/100% composer
                      checkpoints use. No red anywhere in this row. */}
                  <span style={{ ...ns, fontSize: 12, fontWeight: 400, color: '#8596AD', lineHeight: '16px' }}>
                    {unlimited ? 'Unlimited' : `${limit - used} remaining`}
                  </span>
                </div>
                {/* No bar when there's no ceiling — a progress track with nothing to fill toward
                    would imply a limit that doesn't exist. One fill regardless of source or how
                    full it is, in Wordgenie's own brand gradient — the same one on the composer's
                    send button — rather than a flat colour invented just for this bar. */}
                {!unlimited && (
                  <div style={{ height: 6, borderRadius: 999, background: '#E0E5EB', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(259.1deg, #006EFE -2.17%, #5326BD 103.16%)', transition: 'width 0.4s ease' }} />
                  </div>
                )}
                {/* What actually happens at zero — stated the same way the old copy did, minus
                    the "on its own allowance, below" pointer, since there's no second row to
                    point to any more, and minus the export-format aside, which belonged to a
                    different feature (Publish, Issue 12) and had drifted in here by mistake. */}
                {!unlimited && (
                  <p style={{ ...ns, fontSize: 12, color: '#8596AD', lineHeight: '17px' }}>
                    Wordgenie stops generating once you reach {limit}; everything you&apos;ve already
                    created stays editable.
                  </p>
                )}
                {/* The honest version of the nudge this row used to skip entirely. It says the
                    plain fact (same generation, no extra cost) and stops — no invented stat about
                    engagement or reach, no urgency, no repetition once it's no longer relevant. */}
                {suggestPresentation && (
                  <p style={{ ...ns, fontSize: 12, color: '#52637A', lineHeight: '17px' }}>
                    Haven&apos;t turned a book into a presentation yet? It costs the same generation as
                    a book, from what you already have this month.
                  </p>
                )}
                {exhausted && (
                  <button
                    onClick={() => setUpgradeCtx({ message: `You've used all ${limit} Wordgenie generations this month.`, quota: true })}
                    style={{ ...ns, fontSize: 12, fontWeight: 600, color: '#006EFE', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: 'fit-content' }}
                  >
                    See upgrade options →
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      </SectionCard>

      {/* ── Billing history ── */}
      <SectionCard>
        <SectionHeader
          title="Billing history"
          description="All past charges to your account. Download individual invoices below."
        />
        <div className="flex flex-col divide-y divide-[#E0E5EB] px-6 pb-6">
          {INVOICES.map((inv, i) => (
            <div key={i} className="flex items-center justify-between py-4">
              <div>
                <p style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F', lineHeight: '18px' }}>{inv.plan}</p>
                <p style={{ ...ns, fontSize: 12, color: '#8596AD', lineHeight: '16px', marginTop: 2 }}>{inv.date}</p>
              </div>
              <div className="flex items-center" style={{ gap: 16 }}>
                <span style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F' }}>{inv.amount}</span>
                <span className="flex items-center" style={{ gap: 4, ...ns, fontSize: 12, fontWeight: 500, color: '#29A341', background: '#F3FCF4', border: '1px solid #85E097', borderRadius: 999, padding: '2px 8px' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#29A341" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Paid
                </span>
                <button style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, border: '1px solid #E0E5EB', background: '#fff', cursor: 'pointer' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

    </div>
  );
}

/* ─────────────────────────────────────────────
   Main: MyAccountView
───────────────────────────────────────────── */

export function MyAccountView() {
  // Seeded from the store so a caller can deep-link a tab — the sidebar's plan row lands on
  // billing. Initial state only: once open, the tab strip owns it.
  const accountTab = useFlowStore((s) => s.accountTab);
  const accountTabRequestId = useFlowStore((s) => s.accountTabRequestId);
  const [activeTab, setActiveTab] = useState<Tab>(accountTab);
  // The actual bug behind "the plan row doesn't lead anywhere": this component can already be
  // mounted when a caller re-requests a tab — the dedicated /account route renders it
  // unconditionally, and any overlay route where My Account is already open does too — and
  // useState's initial value is read once, on mount, never again.
  // Adjusted during render rather than in an effect — React's own documented pattern for
  // "reset/adjust state when a prop changes" (see "Adjusting some state when a prop changes" in
  // the React docs), which avoids both the lint rule against deriving state inside an effect and
  // the extra render pass an effect would cost (a frame of the old tab's content before the
  // effect fires and fixes it). Tracking the request id rather than accountTab itself is what
  // makes a second click asking for the SAME tab still win — e.g. billing → user clicks Profile
  // locally → the sidebar's plan row again, which re-requests billing — since the id changes
  // every time setShowAccount is called even when the destination repeats.
  const [seenRequestId, setSeenRequestId] = useState(accountTabRequestId);
  if (accountTabRequestId !== seenRequestId) {
    setSeenRequestId(accountTabRequestId);
    setActiveTab(accountTab);
  }
  const setShowAccount = useFlowStore((s) => s.setShowAccount);

  /* Arrow-key traversal for the tablist. Selection follows focus — the tabs are cheap to render
     and nothing fetches behind them, so there's no reason to make the user press Enter to commit.
     Focus moves on the next frame, once the re-rendered button exists to receive it. */
  const moveTab = (delta: number) => {
    const i = TABS.findIndex((t) => t.key === activeTab);
    const next = TABS[(i + delta + TABS.length) % TABS.length];
    setActiveTab(next.key);
    requestAnimationFrame(() => document.getElementById(`account-tab-${next.key}`)?.focus());
  };

  const tabContent: Record<Tab, React.ReactNode> = {
    profile: <ProfileTab />,
    password: <PasswordTab />,
    preferences: <PreferencesTab />,
    billing: <BillingTab />,
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-white">
      <div className="max-w-[960px] mx-auto px-8 py-10">

        {/* Page header */}
        <div className="mb-8">
          <h1 style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 24, fontWeight: 700, color: '#001633', lineHeight: '32px', margin: 0 }}>
            Your Account
          </h1>
          <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 400, color: '#717182', lineHeight: '20px', marginTop: 4 }}>
            Manage your profile, security, plan and preferences.
          </p>
        </div>

        {/* Tabs. The underline set the closest peers use for a shallow settings screen sitting
            under a global app rail — Runway, Uxcel, Midday. No second in-page vertical nav: the
            app sidebar is already one, and billing doesn't need promoting out of the set into its
            own destination because the rail's "<Plan> plan" row deep-links straight to it.

            The divider spans the content column, but the button row is pulled left by one tab's
            horizontal padding so the first label sits flush with the h1 above and the section
            cards below — while every tab keeps a hit area wider than its text. The old
            '8px 24px' indented "Profile" 24px and broke the page's left edge. */}
        <div className="border-b border-[#E0E5EB] mb-8">
          <div
            role="tablist"
            aria-label="Account sections"
            className="flex items-end"
            style={{ marginLeft: -TAB_PAD_X }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') { e.preventDefault(); moveTab(1); }
              else if (e.key === 'ArrowLeft') { e.preventDefault(); moveTab(-1); }
            }}
          >
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  id={`account-tab-${tab.key}`}
                  role="tab"
                  aria-selected={active}
                  aria-controls="account-tabpanel"
                  /* Only the selected tab is in the tab order; Left/Right move within the set.
                     The ARIA tabs pattern, so four tabs cost one Tab stop rather than four. */
                  tabIndex={active ? 0 : -1}
                  onClick={() => setActiveTab(tab.key)}
                  className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#006EFE] focus-visible:rounded-sm"
                  style={{
                    fontFamily: "'Nunito Sans', sans-serif", fontSize: 15, fontWeight: 500,
                    color: active ? '#001633' : '#52637A',
                    background: 'none', border: 'none',
                    borderBottom: active ? '2px solid #006EFE' : '2px solid transparent',
                    padding: `8px ${TAB_PAD_X}px`, marginBottom: -1, whiteSpace: 'nowrap',
                    transition: 'color 0.12s',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = '#001633'; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = '#52637A'; }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            id="account-tabpanel"
            role="tabpanel"
            aria-labelledby={`account-tab-${activeTab}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {tabContent[activeTab]}
          </motion.div>
        </AnimatePresence>

        <div className="h-16" />
      </div>
    </div>
  );
}
