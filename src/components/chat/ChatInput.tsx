'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatInputProps {
  placeholder: string;
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ placeholder, onSubmit, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    // Measure with multi-line styles to get true content height
    ta.style.transition = 'none';
    ta.style.lineHeight = '20px';
    ta.style.padding = '10px 0';
    const prev = ta.style.height;
    ta.style.height = '0px';
    const targetHeight = Math.max(Math.min(ta.scrollHeight, 120), 40);
    const willExpand = targetHeight > 40;
    // Restore previous height before animating
    ta.style.height = prev || '40px';
    if (!willExpand) {
      // Single-line: use line-height centering
      ta.style.lineHeight = '40px';
      ta.style.padding = '0';
    }
    // Force reflow so browser registers starting height
    ta.offsetHeight;
    ta.style.transition = '';
    ta.style.height = `${targetHeight}px`;
    setIsExpanded(willExpand);
  }, [value]);

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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      onSubmit(trimmed);
      setValue('');
      setAttachedFiles([]);
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
          "I developed a method I call the Mirror Technique that helps people see their blind spots through guided self-reflection.",
          "My approach combines cognitive behavioral therapy with mindfulness meditation practices.",
          "I believe in a holistic approach that addresses both the emotional and practical aspects of personal growth.",
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
    <div className="flex-shrink-0 px-4 pb-16">
      <div className="max-w-xl mx-auto">
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} multiple />

        {/* Attached files */}
        <AnimatePresence>
          {attachedFiles.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-2 flex flex-wrap gap-2">
              {attachedFiles.map((file, i) => (
                <div key={`${file.name}-${i}`} className="flex items-center gap-2 bg-white border border-border rounded-lg px-3 py-1.5 text-xs">
                  <span className="text-text-primary max-w-[100px] truncate">{file.name}</span>
                  <button onClick={() => removeFile(i)} className="text-text-tertiary hover:text-red-500 transition-colors">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main input bar — 8px radius, Figma shadow */}
        <div
          className={`flex ${isExpanded ? 'items-end' : 'items-center'} bg-white rounded-lg px-4 py-2 gap-3 transition-all duration-200 hover:shadow-lg`}
          style={{ boxShadow: '0px 2px 32px rgba(143, 132, 171, 0.12)' }}
        >
          {/* + Attach button — 40x40, 8px radius */}
          <div className="relative" ref={fileMenuRef}>
            <button
              onClick={() => setShowFileMenu(!showFileMenu)}
              className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:bg-surface"
              aria-label="Attach file"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 1.5V16.5M1.5 9H16.5" stroke="#3D4A5C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* File type dropdown */}
            <AnimatePresence>
              {showFileMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full left-0 mb-2 w-56 bg-white rounded-lg py-2 z-50"
                  style={{ boxShadow: '0px 2px 32px rgba(143, 132, 171, 0.18)' }}
                >
                  <p className="px-3 py-1.5 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">Attach file</p>
                  <button onClick={() => handleFileSelect('.pdf,.doc,.docx,.txt,.rtf,.md')} className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-surface transition-colors cursor-pointer">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#006EFE" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg></div>
                    <div><p className="text-sm font-medium text-text-primary">Document</p><p className="text-[11px] text-text-tertiary">PDF, DOC, TXT, MD</p></div>
                  </button>
                  <button onClick={() => handleFileSelect('.jpg,.jpeg,.png,.gif,.webp,.svg')} className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-surface transition-colors cursor-pointer">
                    <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg></div>
                    <div><p className="text-sm font-medium text-text-primary">Image</p><p className="text-[11px] text-text-tertiary">JPG, PNG, GIF, WebP</p></div>
                  </button>
                  <button onClick={() => handleFileSelect('.mp3,.wav,.m4a,.ogg,.webm')} className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-surface transition-colors cursor-pointer">
                    <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5326BD" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg></div>
                    <div><p className="text-sm font-medium text-text-primary">Audio</p><p className="text-[11px] text-text-tertiary">MP3, WAV, M4A</p></div>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Text input / Recording indicator */}
          {isRecording ? (
            <div className="flex-1 flex items-center gap-3">
              <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
              <span className="text-sm text-text-primary font-medium">Recording...</span>
              <span className="text-sm text-text-tertiary font-mono">{formatTime(recordingTime)}</span>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              style={{ height: 40, lineHeight: isExpanded ? '20px' : '40px', padding: isExpanded ? '10px 0' : '0', verticalAlign: 'middle' }}
              className="flex-1 bg-transparent text-text-primary placeholder-text-placeholder resize-none focus:outline-none text-base max-h-[120px] transition-[height] duration-200 ease-out overflow-hidden"
            />
          )}

          {/* Right side buttons — mic + send */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Mic button — 40x40, 8px radius, border */}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={disabled}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 cursor-pointer ${isRecording
                  ? 'bg-red-50 text-red-500 border border-red-200 hover:bg-red-100'
                  : 'border border-border text-[#3D4A5C] hover:bg-surface'
                }`}
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

            {/* Send button — 40x40, 8px radius, AI gradient */}
            <motion.button
              whileHover={hasContent ? { scale: 1.03 } : {}}
              whileTap={hasContent ? { scale: 0.97 } : {}}
              onClick={handleSubmit}
              disabled={disabled || !hasContent}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 ${hasContent
                  ? 'gradient-bg text-white cursor-pointer'
                  : 'bg-surface text-text-tertiary cursor-not-allowed'
                }`}
              aria-label="Send message"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3.5 9L9 3.5L14.5 9M9 3.5V14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
