'use client';

import { useState, useRef, useCallback, useEffect, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useFlowStore, manuscriptLimitFor, presentationLimitFor, allowanceResetLabel } from '@/stores/flowStore';
import { createPortal } from 'react-dom';
import { Tooltip } from '@/components/ui/Tooltip';

type Tab = 'profile' | 'password' | 'preferences' | 'billing';

const TABS: { key: Tab; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'password', label: 'Password & Security' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'billing', label: 'Plan & Billing' },
];

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
            className="flex items-center justify-center hover:opacity-60 transition-opacity cursor-pointer"
            style={{ width: 24, height: 24, border: 'none', background: 'none', padding: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
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
  description: string;
  badge?: React.ReactNode;
  onSave?: () => void;
  saved?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between border-b border-[#E0E5EB] px-6 py-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 20, fontWeight: 600, color: '#001633', lineHeight: '24px' }}>
            {title}
          </span>
          {badge}
        </div>
        <span style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 400, color: '#667C98', lineHeight: '18px' }}>
          {description}
        </span>
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
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M1 9C1 9 3.8 3 9 3s8 6 8 6-2.8 6-8 6S1 9 1 9z" stroke="#8596AD" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="9" r="2.5" stroke="#8596AD" strokeWidth="1.4" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
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
      className="absolute flex items-center justify-center hover:opacity-60 transition-opacity cursor-pointer"
      style={{ top: 16, right: 16, width: 24, height: 24, background: 'none', border: 'none', padding: 0 }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
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
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
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
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#006EFE" />
      </svg>
    ),
    features: ['10 Wordgenie Generations/month', 'Export presentations to PDF', 'Standard Templates', 'Unlimited PDF eBooks', 'Page Numbering & Table Of Contents Generator'],
  },
  {
    id: 'pro',
    name: 'PRO',
    price: '$97',
    period: '/year',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="#006EFE">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
    features: ['20 Wordgenie Generations/month', 'Export to PowerPoint, PNG and watermark-free links', 'Pro Templates', 'Publish to Kindle', '3D Cover Creator'],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$297',
    period: '/year',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="#006EFE">
        <path d="M5 20L3 8l5.5 4.5L12 4l3.5 8.5L21 8l-2 12H5Z" />
      </svg>
    ),
    features: ['Unlimited Wordgenie Manuscript Generations', 'Publish Print Books', 'Transcribe Videos and Audio', 'Create Audiobooks'],
  },
  {
    id: 'agency',
    name: 'Agency Premium',
    price: '$497',
    period: '/year',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="#006EFE">
        <path fillRule="evenodd" d="M8 3H16V9H8V3Z M9.5 4.5H14.5V7.5H9.5V4.5Z" />
        <rect x="2" y="8" width="20" height="12" rx="2" />
      </svg>
    ),
    features: ['Custom Template Creator', 'Collaborative eBooks with Client Interface', 'Accounts for Agency Members'],
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
}) {
  const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;
  const storePlan = useFlowStore((s) => s.currentPlan);
  const currentPlanId = currentPlanIdOverride ?? storePlan;
  const currentRank = PLAN_ORDER.indexOf(currentPlanId);
  const router = useRouter();
  const [compareOpen, setCompareOpen] = useState(false);
  // The expand/collapse wrapper clips with overflow:hidden while animating so the height:0→auto
  // transition doesn't flash content early. That same overflow:hidden would also break the table's
  // sticky header (it'd stick relative to this clipped box instead of the modal's real scroll
  // container), so it's lifted to 'visible' once the open animation actually finishes.
  const [compareSettled, setCompareSettled] = useState(false);
  // Collapsed by section index — every section starts open since the user already opted
  // into "Compare plans" explicitly; collapsing is theirs to do, not a default we impose.
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());

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

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(20,25,31,0.40)', zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0, width: modalWidth }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white relative"
        style={{ borderRadius: 16, padding: '0 32px 28px', boxShadow: '0px 4px 40px 0px rgba(0,0,0,0.12)', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute flex items-center justify-center hover:opacity-60 transition-opacity cursor-pointer"
          style={{ top: 20, right: 20, width: 24, height: 24, background: 'none', border: 'none', padding: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M14 4L4 14M4 4l10 10" stroke="#29323D" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>

        {/* Header — the modal is titled after whatever triggered it rather than after itself.
            Mixpanel titles its upgrade dialog "Track Cohorts Across Reports"; Circle names the
            blocked action. A generic "Upgrade your account" only fits the standing entry point,
            where nothing specific triggered it.
            paddingTop lives here (not on the scroll container) so the comparison table's sticky
            header can stick flush at true top:0 with no gap above it. */}
        <div style={{ paddingTop: 32, marginBottom: 20, paddingRight: 28 }}>
          <p style={{ ...ns, fontSize: 20, fontWeight: 700, color: '#001633', lineHeight: '26px' }}>
            {contextMessage ?? 'Upgrade your account'}
          </p>
          {/* Waiting is a legitimate way out of a quota, so say when the allowance returns
              instead of implying paying is the only option. */}
          {mode === 'quota' && quota?.resetLabel && (
            <p style={{ ...ns, fontSize: 13, fontWeight: 400, color: '#667C98', lineHeight: '18px', marginTop: 6 }}>
              {quota.resetLabel}
            </p>
          )}
        </div>

        {/* Plan cards */}
        <div className="grid" style={{ gridTemplateColumns: `repeat(${visiblePlans.length}, 1fr)`, gap: 16 }}>
          {visiblePlans.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            const isDowngrade = !isCurrent && PLAN_ORDER.indexOf(plan.id) < currentRank;
            // "Recommended" is a comparative claim, so it only means anything against other
            // cards. In the focused modes there's nothing to be recommended over.
            const isHighlighted = mode === 'standing' && !isCurrent && plan.id === effectiveHighlight;
            return (
            <div
              key={plan.id}
              style={{
                borderRadius: 12,
                border: '1px solid #E0E5EB',
                background: '#fff',
                boxShadow: isHighlighted ? '0 8px 24px rgba(0,110,254,0.14)' : 'none',
                overflow: 'visible',
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
                position: 'relative',
              }}
            >
              {/* Floating badge — sits on top of the card, not part of its internal layout, so it
                  never affects card height or pushes siblings out of alignment. */}
              {isHighlighted && (
                <div style={{
                  position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                  background: '#006EFE', borderRadius: 999, padding: '4px 14px', whiteSpace: 'nowrap',
                  ...ns, fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: 0.3,
                  boxShadow: '0 2px 8px rgba(0,110,254,0.3)',
                }}>
                  RECOMMENDED
                </div>
              )}

              <div style={{ padding: '20px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>

              {/* Icon */}
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#EEF5FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                {plan.icon}
              </div>

              {/* Name */}
              <p style={{ ...ns, fontSize: 18, fontWeight: 700, color: '#006EFE', lineHeight: '24px', marginBottom: 8 }}>{plan.name}</p>

              {/* Price. Same treatment in every mode now — the allowance moved into the list
                  below, so a quota card and a feature card are the same shape. */}
              <div className="flex items-baseline" style={{ gap: 6, marginBottom: 16 }}>
                <span style={{ ...ns, fontSize: 28, fontWeight: 800, color: '#001633', lineHeight: '34px' }}>{plan.price}</span>
                <span style={{ ...ns, fontSize: 13, fontWeight: 400, color: '#667C98', lineHeight: '18px' }}>{plan.period}</span>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: '#E0E5EB', marginBottom: 16 }} />

              {/* Every plan still lists what it includes — leading with the thing that was
                  blocked doesn't mean hiding the rest, and the rest is most of the reason to
                  pick one tier over another. What changes is the order: whatever the user hit
                  comes first and is marked, so the answer to "does this fix my problem" is the
                  first line rather than the fourth. At a quota that answer is already the
                  headline above, so it's dropped from the list instead of stated twice. */}
              <div className="flex flex-col" style={{ gap: 10, flex: 1 }}>
                {(() => {
                  const prevPlan = PLANS[PLAN_ORDER.indexOf(plan.id) - 1];
                  return (
                    <p style={{ ...ns, fontSize: 12.5, fontWeight: 600, color: '#8596AD', marginBottom: 2 }}>
                      {prevPlan ? `Everything in ${prevPlan.name}, plus:` : 'Features:'}
                    </p>
                  );
                })()}
                {featureLinesFor(plan).map(({ text, lead }) => (
                  <div key={text} className="flex items-start" style={{ gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                      <path d="M3 8l3.5 3.5 6.5-7" stroke="#006EFE" strokeWidth={lead ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ ...ns, fontSize: 13, fontWeight: lead ? 700 : 400, color: '#15191F', lineHeight: '18px' }}>{text}</span>
                  </div>
                ))}
              </div>

              {/* CTA button — names its destination. Three adjacent buttons all reading
                  "Upgrade" leave the column position as the only thing distinguishing them. */}
              <div style={{ marginTop: 20 }}>
                {isCurrent ? (
                  <button disabled style={{ width: '100%', height: 40, borderRadius: 8, border: 'none', background: '#F0F2F5', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#8596AD', lineHeight: '18px' }}>Current plan</span>
                  </button>
                ) : isDowngrade ? (
                  <button style={{ width: '100%', height: 40, borderRadius: 8, border: '1.5px solid #006EFE', background: '#fff', cursor: 'pointer', ...ns, fontSize: 14, fontWeight: 600, color: '#006EFE', lineHeight: '18px' }}>
                    Switch to {plan.name}
                  </button>
                ) : (
                  <button onClick={() => handleUpgrade(plan.id)} style={{ width: '100%', height: 40, borderRadius: 8, border: 'none', background: '#006EFE', cursor: 'pointer', ...ns, fontSize: 14, fontWeight: 600, color: '#fff', lineHeight: '18px' }}>
                    Upgrade to {plan.name}
                  </button>
                )}
              </div>
              </div>
            </div>
            );
          })}
        </div>

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
            <p style={{ ...ns, fontSize: 12.5, fontWeight: 400, color: '#667C98', lineHeight: '18px', marginTop: 14, textAlign: 'center' }}>
              Also included in {list}.
            </p>
          );
        })()}

        {/* Compare plans link */}
        <div className="flex items-center justify-center" style={{ marginTop: 24, gap: 6 }}>
          <button
            onClick={() => setCompareOpen((v) => { const next = !v; if (!next) setCompareSettled(false); return next; })}
            style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#006EFE', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Compare plans and features
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#006EFE" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: compareOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
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
              <div style={{ marginTop: 24 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', top: 0, zIndex: 2, width: '36%', padding: '16px', background: '#fff', verticalAlign: 'bottom', boxShadow: '0 1px 0 #E0E5EB' }} />
                      {PLANS.map((p) => {
                        const isHighlighted = p.id === effectiveHighlight;
                        return (
                          <th key={p.id} style={{
                            position: 'sticky', top: 0, zIndex: 2,
                            padding: '16px 12px', width: '16%', verticalAlign: 'bottom',
                            background: isHighlighted ? '#F0F7FF' : '#fff',
                            boxShadow: '0 1px 0 #E0E5EB',
                          }}>
                            <div className="flex flex-col items-center" style={{ gap: 8 }}>
                              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EEF5FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {p.icon}
                              </div>
                              <span style={{ ...ns, fontSize: 15, fontWeight: 700, color: isHighlighted ? '#006EFE' : '#52637A' }}>{p.name}</span>
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
                            <td style={{ paddingTop: si === 0 ? 8 : 32, paddingBottom: 12 }}>
                              <button
                                onClick={() => setCollapsedSections((prev) => {
                                  const next = new Set(prev);
                                  next.has(si) ? next.delete(si) : next.add(si);
                                  return next;
                                })}
                                className="flex items-center cursor-pointer"
                                style={{ gap: 8, background: 'none', border: 'none', padding: 0 }}
                              >
                                <span style={{ ...ns, fontSize: 22, fontWeight: 700, color: '#15191F' }}>{section.header}</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8596AD" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isCollapsed ? 'none' : 'rotate(180deg)', transition: 'transform 0.15s' }}>
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </button>
                            </td>
                            {/* Empty cells (not colSpan) so the highlighted column's tint keeps
                                running underneath section headers instead of breaking at each one. */}
                            {PLANS.map((p) => (
                              <td key={p.id} style={{ background: p.id === effectiveHighlight ? '#F0F7FF' : 'transparent' }} />
                            ))}
                          </tr>
                        )}
                        {!isCollapsed && section.rows.map((row) => (
                          <tr
                            key={row.label}
                            className="transition-colors hover:bg-[#F3F7FD]"
                          >
                            <td style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#3D4A5C', padding: '14px 16px', borderTop: '1px solid #E0E5EB' }}>
                              <div className="flex items-center" style={{ gap: 6 }}>
                                {row.label}
                                {row.tooltip && (
                                  <Tooltip label={row.tooltip} maxWidth={220}>
                                    <span className="inline-flex items-center justify-center" style={{ width: 14, height: 14, borderRadius: '50%', border: '1.3px solid #A7B4C6', color: '#8596AD', fontSize: 9.5, fontWeight: 700, cursor: 'default', lineHeight: 1 }}>
                                      i
                                    </span>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                            {row.values.map((cell, ci) => {
                              const isHighlighted = PLANS[ci].id === effectiveHighlight;
                              return (
                                <td key={ci} style={{
                                  textAlign: 'center', padding: '14px 12px',
                                  background: isHighlighted ? '#F0F7FF' : 'transparent',
                                  borderTop: '1px solid #E0E5EB',
                                }}>
                                  {typeof cell === 'string' ? (
                                    <span style={{ ...ns, fontSize: 14, color: '#3D4A5C' }}>{cell}</span>
                                  ) : cell ? (
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: 'inline-block' }}>
                                      <path d="M3 8l3.5 3.5 6.5-7" stroke="#006EFE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  ) : (
                                    <span style={{ color: '#C5CDD9' }}>–</span>
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
                        doesn't force a scroll back up to the cards to act on the decision. */}
                    <tr>
                      <td style={{ paddingTop: 28 }} />
                      {PLANS.map((plan) => {
                        const isCurrent = plan.id === currentPlanId;
                        const isDowngrade = !isCurrent && PLAN_ORDER.indexOf(plan.id) < currentRank;
                        return (
                          <td key={plan.id} style={{ padding: '28px 12px 24px' }}>
                            {isCurrent ? (
                              <button disabled style={{ width: '100%', height: 38, borderRadius: 8, border: 'none', background: '#F0F2F5', cursor: 'not-allowed', ...ns, fontSize: 13.5, fontWeight: 600, color: '#8596AD' }}>
                                Current plan
                              </button>
                            ) : isDowngrade ? (
                              <button style={{ width: '100%', height: 38, borderRadius: 8, border: '1.5px solid #006EFE', background: '#fff', cursor: 'pointer', ...ns, fontSize: 13.5, fontWeight: 600, color: '#006EFE' }}>
                                Switch to {plan.name}
                              </button>
                            ) : (
                              <button onClick={() => handleUpgrade(plan.id)} style={{ width: '100%', height: 38, borderRadius: 8, border: 'none', background: '#006EFE', cursor: 'pointer', ...ns, fontSize: 13.5, fontWeight: 600, color: '#fff' }}>
                                Upgrade to {plan.name}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
          className="absolute flex items-center justify-center hover:opacity-60 transition-opacity cursor-pointer"
          style={{ top: 16, right: 16, width: 24, height: 24, background: 'none', border: 'none', padding: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
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
          className="absolute flex items-center justify-center hover:opacity-60 transition-opacity cursor-pointer"
          style={{ top: 16, right: 16, width: 24, height: 24, background: 'none', border: 'none', padding: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
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

const CREDITS = [
  { icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#006EFE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    ), label: 'Wordgenie credits', used: 48200, total: 100000, remaining: 51800, remainingLabel: '51,800 remaining', remainingColor: '#52637A', buyMore: false },
];

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
          className="absolute flex items-center justify-center hover:opacity-60 transition-opacity cursor-pointer"
          style={{ top: 20, right: 20, width: 24, height: 24, background: 'none', border: 'none', padding: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
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
  const [upgradeCtx, setUpgradeCtx] = useState<{ message?: string; planId?: string; quota?: boolean } | null>(null);
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
          description={`You're on the ${billingPlanData.name} plan`}
          right={
            <button onClick={() => setUpgradeCtx({})} style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', height: 38, padding: '0 20px', borderRadius: 8, border: 'none', background: '#006EFE', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              Manage plan
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </button>
          }
        />
        <div style={{ padding: '20px 24px 24px' }}>
          <div style={{ background: 'linear-gradient(135deg, #F0F6FF 0%, #EEF2FF 100%)', border: '1px solid #CCE2FF', borderRadius: 12, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="flex items-center" style={{ gap: 12 }}>
              {/* Crown icon */}
              <div className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #006EFE, #5326BD)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M3 18h18M5 18L3 7l5 4 4-6 4 6 5-4-2 11" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p style={{ ...ns, fontSize: 24, fontWeight: 700, color: '#001633', lineHeight: '32px' }}>{billingPlanData.name}</p>
                <p style={{ ...ns, fontSize: 13, fontWeight: 400, color: '#667C98', lineHeight: '18px' }}>{billingPlanData.price} {billingPlanData.period} · Renews Apr 1, 2026</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center" style={{ gap: '6px 16px' }}>
              {billingPlanData.features.map((f) => (
                <span key={f} className="flex items-center" style={{ gap: 4, ...ns, fontSize: 13, color: '#006EFE', fontWeight: 400 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#006EFE" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Credit usage ── */}
      <SectionCard>
        {/* "Plan usage", not "Credit usage" — the first row isn't credits, it's generations, and
            three of the four things listed here are different currencies. The description no
            longer claims everything resets monthly either: generations do, purchased credits
            don't, which is why the reset date is stated per row rather than once up here. */}
        <SectionHeader
          title="Plan usage"
          description="What you've used this cycle. Each row states its own limit and when, or whether, it resets."
        />
        <div className="flex flex-col px-6 pb-6" style={{ gap: 24, paddingTop: 20 }}>
          {/* Wordgenie generations lead the list — it's the allowance people actually hit, and
              the one every gate in the product refers back to. Framed as "used" rather than
              "left": a dashboard is where you review consumption (Otter, ClickUp, Luma and
              Fireflies all count up here), while the in-composer alert counts down because at
              the moment of interruption what matters is what's still available. */}
          {(() => {
            const limit = manuscriptLimitFor(billingPlan);
            const unlimited = !Number.isFinite(limit);
            const used = manuscriptsUsed;
            const pct = unlimited ? 0 : Math.min(Math.round((used / limit) * 100), 100);
            const exhausted = !unlimited && used >= limit;
            return (
              <div className="flex flex-col" style={{ gap: 8 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center" style={{ gap: 10 }}>
                    <div className="flex items-center justify-center flex-shrink-0" style={{ width: 32, height: 32, borderRadius: '50%', background: '#F0F6FF' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#006EFE"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" /></svg>
                    </div>
                    <div>
                      <p style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F', lineHeight: '18px' }}>Wordgenie generations</p>
                      {/* Consumption on the left, remaining on the right — the same split the
                          three credit rows below use, so a column means one thing all the way
                          down the list. This row used to state both numbers here and put the
                          reset date in the right-hand column, which left that column carrying a
                          date on row one and a count on rows two to four.
                          The reset date rides here instead: it qualifies the usage, and it can't
                          go in the section header because purchased credits don't reset at all. */}
                      <p style={{ ...ns, fontSize: 12, color: '#8596AD', lineHeight: '16px' }}>
                        {unlimited
                          ? `${used} used this month`
                          : `${used} of ${limit} used this month · ${allowanceResetLabel()}`}
                      </p>
                    </div>
                  </div>
                  <span style={{ ...ns, fontSize: 12, fontWeight: 400, color: exhausted ? '#D62929' : '#8596AD', lineHeight: '16px' }}>
                    {unlimited ? 'Unlimited' : `${limit - used} remaining`}
                  </span>
                </div>
                {/* No bar when there's no ceiling — a progress track with nothing to fill toward
                    would imply a limit that doesn't exist. */}
                {!unlimited && (
                  <div style={{ height: 6, borderRadius: 999, background: '#E0E5EB', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '100%', borderRadius: 999, background: exhausted ? 'linear-gradient(90deg, #006EFE, #D62929)' : '#006EFE', transform: `scaleX(${pct / 100})`, transformOrigin: 'left', transition: 'transform 0.4s ease' }} />
                  </div>
                )}
                {/* What actually happens at zero. Every usage page in the study spells this out —
                    Coda "AI functionality will be paused once all the credits have been used",
                    HubSpot "scheduled and automated emails will no longer be sent", Claude "turn
                    on extra usage to keep using Claude if you hit a limit". We never said it, so
                    a customer had to guess whether running out breaks the whole product. It
                    doesn't, and the second sentence is there to say so. */}
                {!unlimited && (
                  <p style={{ ...ns, fontSize: 12, color: '#8596AD', lineHeight: '17px' }}>
                    Wordgenie stops generating manuscripts once you reach {limit}; everything you&apos;ve
                    already created stays editable. Presentations draw on their own allowance, below.
                  </p>
                )}
                {exhausted && (
                  <button
                    onClick={() => setUpgradeCtx({ message: `You've used all ${limit} manuscript generations this month.`, quota: true })}
                    style={{ ...ns, fontSize: 12, fontWeight: 600, color: '#006EFE', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: 'fit-content' }}
                  >
                    See upgrade options →
                  </button>
                )}
              </div>
            );
          })()}

          {/* Presentations are metered on every tier too — Standard 5, PRO 10 — on a pool of their
              own. They used to be listed as PRO-only, which was wrong: what PRO actually unlocks
              is the export surface (PowerPoint, PNG, and a share link without the watermark),
              not the ability to make one. */}
          {(() => {
            const limit = presentationLimitFor(billingPlan);
            const unlimited = !Number.isFinite(limit);
            const used = Math.min(presentationsUsed, limit);
            const pct = unlimited ? 0 : Math.min(Math.round((used / limit) * 100), 100);
            return (
              <div className="flex flex-col" style={{ gap: 8 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center" style={{ gap: 10 }}>
                    <div className="flex items-center justify-center flex-shrink-0" style={{ width: 32, height: 32, borderRadius: '50%', background: '#F0F6FF' }}>
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#006EFE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="3" width="16" height="11" rx="2" /><path d="M8 14v3M12 14v3M6 17h8" />
                      </svg>
                    </div>
                    <div>
                      <p style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F', lineHeight: '18px' }}>Presentation generations</p>
                      <p style={{ ...ns, fontSize: 12, color: '#8596AD', lineHeight: '16px' }}>
                        {unlimited ? `${used} used this month` : `${used} of ${limit} used this month · ${limit - used} remaining`}
                      </p>
                    </div>
                  </div>
                  <span style={{ ...ns, fontSize: 12, fontWeight: 400, color: '#8596AD', lineHeight: '16px' }}>
                    {unlimited ? 'Unlimited' : allowanceResetLabel()}
                  </span>
                </div>
                {!unlimited && (
                  <div style={{ height: 6, borderRadius: 999, background: '#E0E5EB', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '100%', borderRadius: 999, background: '#006EFE', transform: `scaleX(${pct / 100})`, transformOrigin: 'left', transition: 'transform 0.4s ease' }} />
                  </div>
                )}
                <p style={{ ...ns, fontSize: 12, color: '#8596AD', lineHeight: '17px' }}>
                  Every plan can create and export presentations as PDF. PRO adds PowerPoint and PNG export,
                  and removes the watermark from shared links.
                </p>
              </div>
            );
          })()}

          {CREDITS.map((c) => {
            const pct = Math.round((c.used / c.total) * 100);
            return (
              <div key={c.label} className="flex flex-col" style={{ gap: 8 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center" style={{ gap: 10 }}>
                    <div className="flex items-center justify-center flex-shrink-0" style={{ width: 32, height: 32, borderRadius: '50%', background: '#F0F6FF' }}>
                      {c.icon}
                    </div>
                    <div>
                      <p style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F', lineHeight: '18px' }}>{c.label}</p>
                      <p style={{ ...ns, fontSize: 12, color: '#8596AD', lineHeight: '16px' }}>{c.used.toLocaleString()} used</p>
                    </div>
                  </div>
                  <div className="flex items-center" style={{ gap: 12 }}>
                    <span style={{ ...ns, fontSize: 12, fontWeight: 400, color: c.remainingColor, lineHeight: '16px' }}>{c.remainingLabel}</span>
                    {c.buyMore && (
                      <button onClick={() => setBuyCreditsType(c.label)} style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#006EFE', height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid #006EFE', background: '#fff', cursor: 'pointer', flexShrink: 0 }}>
                        Buy more
                      </button>
                    )}
                  </div>
                </div>
                {/* Progress bar — scaleX instead of animating width, so this only costs paint/composite, not layout */}
                <div style={{ height: 6, borderRadius: 999, background: '#E0E5EB', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '100%', borderRadius: 999, background: c.remainingColor === '#D62929' ? 'linear-gradient(90deg, #006EFE, #D62929)' : '#006EFE', transform: `scaleX(${pct / 100})`, transformOrigin: 'left', transition: 'transform 0.4s ease' }} />
                </div>
                {/* Near-exhausted nudge — a repeat top-up isn't always the cheaper fix;
                    surface the plan that raises this limit for good, right where it bites. */}
                {c.remainingColor === '#D62929' && (
                  <button
                    onClick={() => setUpgradeCtx({ message: `Raise your ${c.label.toLowerCase()} limit with Agency Premium`, planId: 'agency' })}
                    style={{ ...ns, fontSize: 12, fontWeight: 600, color: '#006EFE', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: 'fit-content' }}
                  >
                    Upgrading may cost less than buying more →
                  </button>
                )}
              </div>
            );
          })}
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
  const [activeTab, setActiveTab] = useState<Tab>(accountTab);
  const setShowAccount = useFlowStore((s) => s.setShowAccount);

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
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 400, color: '#717182', lineHeight: '20px', marginTop: 4 }}>
            Manage your profile, security, plan and preferences.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-end border-b border-[#E0E5EB] mb-8">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                fontFamily: "'Nunito Sans', sans-serif", fontSize: 15, fontWeight: 500,
                color: activeTab === tab.key ? '#001633' : '#52637A',
                background: 'none', border: 'none',
                borderBottom: activeTab === tab.key ? '2px solid #006EFE' : '2px solid transparent',
                padding: '8px 24px', marginBottom: -1, whiteSpace: 'nowrap', cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
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
