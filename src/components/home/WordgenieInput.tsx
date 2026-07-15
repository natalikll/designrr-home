'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFlowEngine } from '@/hooks/useFlowEngine';
import { Tooltip } from '@/components/ui/Tooltip';
import { SettingsPillRow } from '@/components/presentation/SettingsPillRow';

interface WordgenieInputProps {
  onSubmit?: (value: string) => void;
  hideHeader?: boolean;
  showSettings?: boolean;
  excludeSettings?: string[];
  placeholder?: string;
  selectedMode?: { label: string; icon: ReactNode; onRemove: () => void };
  topRow?: ReactNode;
  borderless?: boolean;
}

function SelectedModeChip({ label, icon, onRemove }: { label: string; icon: ReactNode; onRemove: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.button
      type="button"
      onClick={onRemove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 10px 4px 7px', borderRadius: 999,
        background: '#EBF3FF', border: '1.5px solid #006EFE',
        color: '#006EFE', fontFamily: "'Nunito Sans', sans-serif",
        fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
      }}
    >
      {/* Fixed-size container keeps pill width stable during icon↔X swap */}
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, flexShrink: 0 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={hovered ? 'x' : 'icon'}
            initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.1 }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {hovered ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            ) : icon}
          </motion.span>
        </AnimatePresence>
      </span>
      {label}
    </motion.button>
  );
}

export default function WordgenieInput({ onSubmit, hideHeader, showSettings, excludeSettings, placeholder, selectedMode, topRow, borderless }: WordgenieInputProps) {
  const [value, setValue] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const submittingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const { handleHeroSubmit } = useFlowEngine();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [value]);

  // Close file menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setShowFileMenu(false);
      }
    }
    if (showFileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFileMenu]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleSubmit = () => {
    if (!value.trim() || submittingRef.current) return;
    submittingRef.current = true;
    const trimmed = value.trim();
    setValue('');
    setAttachedFiles([]);
    if (onSubmit) {
      onSubmit(trimmed);
    } else {
      handleHeroSubmit(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = (accept: string) => {
    setShowFileMenu(false);
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) setAttachedFiles((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        const mockTranscriptions = [
          "I'm a life coach who has been helping people find their purpose for over 10 years. I want to write a book about finding meaning in everyday moments.",
          "I've been teaching yoga and mindfulness for 8 years and I want to share my philosophy about connecting mind and body through breath work.",
          "I'm a nutritionist specializing in gut health. I want to write about the connection between what we eat and how we feel mentally.",
        ];
        setValue((prev) => prev + (prev ? ' ' : '') + mockTranscriptions[Math.floor(Math.random() * mockTranscriptions.length)]);
        setRecordingTime(0);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      alert('Microphone access is required for voice input. Please allow microphone access and try again.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const hasContent = value.trim().length > 0 || attachedFiles.length > 0;

  return (
    <motion.div
      initial={borderless ? false : { y: 16 }}
      animate={borderless ? false : { y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={borderless ? 'w-full' : 'mx-auto w-full max-w-[780px]'}
      style={borderless ? { position: 'relative', zIndex: showFileMenu ? 50 : 1 } : { background: 'white', borderRadius: 16, position: 'relative', zIndex: showFileMenu ? 50 : 1 }}
    >
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} multiple />

      {/* Main input container */}
      <div
        className="flex flex-col bg-white"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocusCapture={() => setIsFocused(true)}
        onBlurCapture={() => setIsFocused(false)}
        style={borderless ? {
          paddingTop: 12, paddingBottom: 4,
        } : {
          border: '1px solid #006EFE',
          borderRadius: 16,
          paddingTop: 12,
          paddingBottom: 4,
          boxShadow: isHovered || isFocused
            ? '0px 7px 22px 0px rgba(62, 57, 205, 0.15)'
            : '0px 0px 0px 0px rgba(62, 57, 205, 0)',
          transition: 'box-shadow 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* ── Optional top row (e.g. tabs for Version C) ── */}
        {topRow && (
          <>
            <div style={{ overflow: 'hidden', borderRadius: '15px 15px 0 0' }}>{topRow}</div>
            <div style={{ height: 1, backgroundColor: '#E0E5EB' }} />
          </>
        )}

        {/* ── Header row ── */}
        <div className="flex flex-col" style={{ gap: 12 }}>
          {!hideHeader && (
            <div className="flex items-start justify-between" style={{ paddingLeft: 16, paddingRight: 16 }}>
              {/* Left: icon + "by New Wordgenie" */}
              <div className="flex items-center" style={{ gap: 6 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/wordgenie-icon.svg"
                  alt=""
                  className="shrink-0 overflow-hidden"
                  style={{ width: 14, height: 14 }}
                />
                <span
                  className="gradient-text shrink-0 whitespace-nowrap font-semibold"
                  style={{ fontSize: 14, lineHeight: '18px' }}
                >
                  by New Wordgenie
                </span>
              </div>
              {/* Right: "Generate up to 10 books with AI" */}
              <span
                className="shrink-0 whitespace-nowrap font-normal"
                style={{ fontSize: 14, lineHeight: '18px', color: '#667C98' }}
              >
                Generate up to 10 books with AI
              </span>
            </div>
          )}

          {!hideHeader && <div style={{ height: 1, backgroundColor: '#E0E5EB' }} />}
        </div>

        {/* ── Textarea ── */}
        <div style={{ padding: '10px 20px 4px' }}>
          <AnimatePresence>
            {attachedFiles.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap gap-2"
                style={{ marginBottom: 8 }}
              >
                {attachedFiles.map((file, i) => (
                  <motion.div
                    key={`${file.name}-${i}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs"
                  >
                    <FileTypeIcon filename={file.name} />
                    <span className="max-w-[120px] truncate text-text-primary">{file.name}</span>
                    <span className="text-text-tertiary">({formatFileSize(file.size)})</span>
                    <button onClick={() => removeFile(i)} className="ml-1 cursor-pointer text-text-tertiary transition-colors hover:text-red-500">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          {isRecording ? (
            <div className="flex flex-1 items-center gap-3" style={{ minHeight: 24 }}>
              <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
              <span className="text-sm font-medium text-text-primary">Recording...</span>
              <span className="font-mono text-sm text-text-tertiary">{formatTime(recordingTime)}</span>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder ?? 'What would you like to create today?'}
              rows={1}
              className="max-h-[120px] w-full resize-none bg-transparent font-normal text-text-placeholder focus:outline-none overflow-hidden"
              style={{ fontSize: 16, lineHeight: '24px', minHeight: 72, color: value ? '#15191F' : undefined, fontFamily: "'Nunito Sans', sans-serif" }}
            />
          )}
        </div>

        {/* ── Bottom row: + button (left), [settings], mic + send (right) ── */}
        <div className="flex items-center justify-between" style={{ padding: '2px 12px 4px' }}>
            {/* Left: + Attach + optional settings pills */}
            <div className="flex items-center" style={{ gap: 8 }}>
            <div className="relative" ref={fileMenuRef}>
              <Tooltip label="Add your files">
                <button
                  onClick={() => setShowFileMenu(!showFileMenu)}
                  className="flex shrink-0 cursor-pointer items-center justify-center transition-colors hover:bg-surface"
                  style={{ width: 40, height: 40, borderRadius: 8, border: 'none' }}
                  aria-label="Attach file"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0">
                    <path d="M9 3.667V14.333M3.667 9H14.333" stroke="#3D4A5C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </Tooltip>

              {/* File type dropdown */}
              <AnimatePresence>
                {showFileMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-lg bg-white py-2"
                    style={{ boxShadow: '0px 2px 32px rgba(143, 132, 171, 0.18)' }}
                  >
                    <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Attach file</p>
                    <button onClick={() => handleFileSelect('.pdf,.doc,.docx,.txt,.rtf,.md')} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#006EFE" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg></div>
                      <div><p className="text-sm font-medium text-text-primary">Document</p><p className="text-[11px] text-text-tertiary">PDF, DOC, TXT, MD</p></div>
                    </button>
                    <button onClick={() => handleFileSelect('.jpg,.jpeg,.png,.gif,.webp,.svg')} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg></div>
                      <div><p className="text-sm font-medium text-text-primary">Image</p><p className="text-[11px] text-text-tertiary">JPG, PNG, GIF, WebP</p></div>
                    </button>
                    <button onClick={() => handleFileSelect('.mp3,.wav,.m4a,.ogg,.webm')} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5326BD" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg></div>
                      <div><p className="text-sm font-medium text-text-primary">Audio</p><p className="text-[11px] text-text-tertiary">MP3, WAV, M4A</p></div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <AnimatePresence>
              {selectedMode && <SelectedModeChip key="chip" {...selectedMode} />}
            </AnimatePresence>
            {showSettings && <SettingsPillRow compact exclude={excludeSettings} />}
            </div>

            {/* Right side: mic + send */}
            <div className="flex items-center" style={{ gap: 8 }}>
              <Tooltip label={isRecording ? 'Stop recording' : 'Voice input'}>
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`flex shrink-0 cursor-pointer items-center justify-center transition-all duration-200 ${isRecording ? 'border border-red-200 bg-red-50 text-red-500 hover:bg-red-100' : 'text-[#3D4A5C] hover:bg-surface'}`}
                  style={{ width: 40, height: 40, borderRadius: 8, border: isRecording ? undefined : '1.053px solid #E0E5EB' }}
                  aria-label={isRecording ? 'Stop recording' : 'Voice input'}
                >
                  {isRecording ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M9 1.5a2.25 2.25 0 0 0-2.25 2.25v6A2.25 2.25 0 0 0 9 12a2.25 2.25 0 0 0 2.25-2.25v-6A2.25 2.25 0 0 0 9 1.5z" stroke="#3D4A5C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14.25 7.5v1.5a5.25 5.25 0 0 1-10.5 0V7.5" stroke="#3D4A5C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="9" y1="14.25" x2="9" y2="16.5" stroke="#3D4A5C" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  )}
                </button>
              </Tooltip>

              <Tooltip label="Send message">
                <motion.button
                  whileHover={hasContent ? { scale: 1.03 } : {}}
                  whileTap={hasContent ? { scale: 0.97 } : {}}
                  onClick={handleSubmit}
                  disabled={!hasContent}
                  className="flex shrink-0 items-center justify-center transition-all duration-200"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: hasContent
                      ? 'linear-gradient(259.1deg, #006EFE -2.17%, #5326BD 103.16%)'
                      : 'linear-gradient(259.1deg, rgba(0, 110, 254, 0.3) -2.17%, rgba(83, 38, 189, 0.3) 103.16%)',
                    cursor: hasContent ? 'pointer' : 'not-allowed',
                    color: 'white',
                  }}
                  aria-label="Send message"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3.5 9L9 3.5L14.5 9M9 3.5V14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </motion.button>
              </Tooltip>
            </div>
          </div>
        </div>
    </motion.div>
  );
}



function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function FileTypeIcon({ filename }: { filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
  const isAudio = ['mp3', 'wav', 'm4a', 'ogg', 'webm'].includes(ext);
  const color = isImage ? '#22c55e' : isAudio ? '#5326BD' : '#006EFE';
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
