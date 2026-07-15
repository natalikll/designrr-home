'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ContentEditable from 'react-contenteditable';
import { OutlineHeader } from './OutlineHeader';
import { ChatPanelInline } from './ChatPanelInline';
import { ChapterList } from './ChapterList';
import { useFlowStore } from '@/stores/flowStore';

interface OutlineViewProps {
  onGenerateBook: () => void;
}

/* Generate random sparkle particles for the wow effect */
function generateParticles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: 20 + Math.random() * 60,
    size: 3 + Math.random() * 5,
    duration: 1.5 + Math.random() * 1.5,
    delay: Math.random() * 1.2,
    color: Math.random() > 0.5 ? '#006EFE' : '#5326BD',
  }));
}

const ZOOM_OPTIONS = [50, 75, 100, 125, 150, 200];

export function OutlineView({ onGenerateBook }: OutlineViewProps) {
  const outline = useFlowStore((s) => s.generatedOutline);
  const showChat = useFlowStore((s) => s.showChat);
  const toggleChat = useFlowStore((s) => s.toggleChat);
  const updateOutlineTitle = useFlowStore((s) => s.updateOutlineTitle);
  const updateOutlineSubtitle = useFlowStore((s) => s.updateOutlineSubtitle);
  const [showParticles, setShowParticles] = useState(true);
  const [showFlash, setShowFlash] = useState(true);
  const [particles] = useState(() => generateParticles(24));
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showZoomDropdown, setShowZoomDropdown] = useState(false);
  const zoomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const [showToolbarTitle, setShowToolbarTitle] = useState(false);
  const [bookTitle, setBookTitle] = useState(outline?.title ?? '');
  const [bookSubtitle, setBookSubtitle] = useState(outline?.subtitle ?? '');

  const handleTitleChange = useCallback(
    (evt: { target: { value: string } }) => {
      setBookTitle(evt.target.value);
      updateOutlineTitle(evt.target.value);
    },
    [updateOutlineTitle]
  );

  const handleSubtitleChange = useCallback(
    (evt: { target: { value: string } }) => {
      setBookSubtitle(evt.target.value);
      updateOutlineSubtitle(evt.target.value);
    },
    [updateOutlineSubtitle]
  );

  // Remove particles after animation completes
  useEffect(() => {
    const timer = setTimeout(() => setShowParticles(false), 3500);
    return () => clearTimeout(timer);
  }, []);

  // Remove gradient flash after brief reveal
  useEffect(() => {
    const timer = setTimeout(() => setShowFlash(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  // Show title in toolbar when the original title scrolls out of view
  useEffect(() => {
    const titleEl = titleRef.current;
    const root = scrollContainerRef.current;
    if (!titleEl || !root) return;

    const observer = new IntersectionObserver(
      ([entry]) => setShowToolbarTitle(!entry.isIntersecting),
      { root, threshold: 0 }
    );
    observer.observe(titleEl);
    return () => observer.disconnect();
  }, []);

  // Close zoom dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (zoomRef.current && !zoomRef.current.contains(e.target as Node)) {
        setShowZoomDropdown(false);
      }
    }
    if (showZoomDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showZoomDropdown]);

  if (!outline) return null;

  return (
    <div className="h-full flex overflow-hidden relative bg-white">
      {/* Sliding chat panel */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex-shrink-0 overflow-hidden"
          >
            <ChatPanelInline />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right side: scrollable content (pushed by chat) */}
      <div ref={scrollContainerRef} className="flex-1 min-w-0 overflow-y-auto">
        {/* OutlineHeader scrolls away, toolbar sticks */}
        <OutlineHeader onGenerateBook={onGenerateBook} />
        <motion.div
          className="bg-white"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            type: 'spring',
            stiffness: 180,
            damping: 20,
            delay: 0.1,
          }}
        >
          {/* Toolbar row — sticks to top when header scrolls away */}
          <div className="sticky top-0 flex items-center justify-between px-4 py-1.5 border-b border-border-light bg-white z-20 relative">
            {/* Center: Manuscript title — appears when scrolled past original */}
            <AnimatePresence>
              {showToolbarTitle && bookTitle && (
                <motion.span
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.2 }}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[14px] font-semibold text-text-primary truncate max-w-[40%] pointer-events-none"
                  style={{ fontFamily: 'var(--font-nunito-sans)' }}
                  dangerouslySetInnerHTML={{ __html: bookTitle.replace(/<[^>]*>/g, '') }}
                />
              )}
            </AnimatePresence>

            {/* Left: Chat toggle or X close */}
            {showChat ? (
              <button
                onClick={toggleChat}
                className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-surface transition-colors cursor-pointer text-text-tertiary hover:text-text-primary"
                title="Close chat"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ) : (
              <button
                onClick={toggleChat}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-light text-text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer bg-white"
              >
                {/* Dual sparkle icon */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11.5 1C11.5 0.724 11.276 0.5 11 0.5C10.724 0.5 10.5 0.724 10.5 1V2.5H9C8.724 2.5 8.5 2.724 8.5 3C8.5 3.276 8.724 3.5 9 3.5H10.5V5C10.5 5.276 10.724 5.5 11 5.5C11.276 5.5 11.5 5.276 11.5 5V3.5H13C13.276 3.5 13.5 3.276 13.5 3C13.5 2.724 13.276 2.5 13 2.5H11.5V1Z" fill="#001633" />
                  <path d="M11.5 11C11.5 10.724 11.276 10.5 11 10.5C10.724 10.5 10.5 10.724 10.5 11V12.5H9C8.724 12.5 8.5 12.724 8.5 13C8.5 13.276 8.724 13.5 9 13.5H10.5V15C10.5 15.276 10.724 15.5 11 15.5C11.276 15.5 11.5 15.276 11.5 15V13.5H13C13.276 13.5 13.5 13.276 13.5 13C13.5 12.724 13.276 12.5 13 12.5H11.5V11Z" fill="#001633" />
                  <path d="M5.207 5.293L2.207 6.68L5.207 8.067C5.441 8.176 5.629 8.364 5.738 8.598L7.125 11.598L8.512 8.598C8.621 8.364 8.809 8.176 9.043 8.067L12.043 6.68L9.043 5.293C8.809 5.184 8.621 4.996 8.512 4.762L7.125 1.762L5.738 4.762C5.629 4.996 5.441 5.184 5.207 5.293ZM4.754 8.867L0.879 6.98C0.68 6.887 0.5 6.68 0.5 6.457C0.5 6.234 0.68 6.027 0.879 5.934L4.754 4.047L6.641 0.172C6.734 -0.027 6.941 -0.047 7.125 -0.047C7.309 -0.047 7.516 -0.027 7.609 0.172L9.496 4.047L13.371 5.934C13.57 6.027 13.75 6.234 13.75 6.457C13.75 6.68 13.57 6.887 13.371 6.98L9.496 8.867L7.609 12.742C7.516 12.941 7.309 12.957 7.125 12.957C6.941 12.957 6.734 12.941 6.641 12.742L4.754 8.867Z" fill="#001633" />
                </svg>
                Open Wordgenie Chat
              </button>
            )}

            {/* Right: Tool buttons */}
            <div className="flex items-center gap-1">
              {/* Undo */}
              <button
                className="w-10 h-[38px] rounded-md flex items-center justify-center hover:bg-surface transition-colors cursor-pointer"
                title="Undo"
              >
                <svg width="40" height="38" viewBox="0 0 40 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13.9643 17.1429C13.7089 17.1429 13.5 16.9339 13.5 16.6786V12.9643C13.5 12.7089 13.7089 12.5 13.9643 12.5C14.2196 12.5 14.4286 12.7089 14.4286 12.9643V15.6513C15.5661 13.7623 17.635 12.5 20 12.5C23.5895 12.5 26.5 15.4105 26.5 19C26.5 22.5895 23.5895 25.5 20 25.5C17.6815 25.5 15.6473 24.2871 14.4953 22.4589C14.3067 22.1571 14.5359 21.7857 14.8929 21.7857C15.067 21.7857 15.2237 21.8786 15.3194 22.0237C16.3118 23.5558 18.0384 24.5714 20 24.5714C23.0759 24.5714 25.5714 22.0759 25.5714 19C25.5714 15.9241 23.0759 13.4286 20 13.4286C17.9368 13.4286 16.1377 14.5487 15.1743 16.2143H17.6786C17.9339 16.2143 18.1429 16.4232 18.1429 16.6786C18.1429 16.9339 17.9339 17.1429 17.6786 17.1429H13.9643Z" fill="#3D4A5C" />
                </svg>
              </button>

              {/* Redo */}
              <button
                className="w-10 h-[38px] rounded-md flex items-center justify-center hover:bg-surface transition-colors cursor-pointer"
                title="Redo"
              >
                <svg width="40" height="38" viewBox="0 0 40 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M26.0357 17.1429C26.2911 17.1429 26.5 16.9339 26.5 16.6786V12.9643C26.5 12.7089 26.2911 12.5 26.0357 12.5C25.7804 12.5 25.5714 12.7089 25.5714 12.9643V15.6513C24.4339 13.7623 22.365 12.5 20 12.5C16.4105 12.5 13.5 15.4105 13.5 19C13.5 22.5895 16.4105 25.5 20 25.5C22.3185 25.5 24.3527 24.2871 25.5047 22.4589C25.6933 22.1571 25.4641 21.7857 25.1071 21.7857C24.933 21.7857 24.7763 21.8786 24.6806 22.0237C23.6882 23.5558 21.9616 24.5714 20 24.5714C16.9241 24.5714 14.4286 22.0759 14.4286 19C14.4286 15.9241 16.9241 13.4286 20 13.4286C22.0632 13.4286 23.8623 14.5487 24.8257 16.2143H22.3214C22.0661 16.2143 21.8571 16.4232 21.8571 16.6786C21.8571 16.9339 22.0661 17.1429 22.3214 17.1429H26.0357Z" fill="#8596AD" />
                </svg>
              </button>

              {/* Divider */}
              <div className="w-px h-4 bg-[#E0E5EB] mx-1" />

              {/* Zoom dropdown */}
              <div className="relative" ref={zoomRef}>
                <button
                  onClick={() => setShowZoomDropdown(!showZoomDropdown)}
                  className="flex items-center gap-1.5 h-[38px] px-2 rounded-md hover:bg-surface transition-colors cursor-pointer"
                  title="Zoom"
                >
                  {/* Magnifying glass icon */}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7.33333 2.66667C8.57101 2.66667 9.75798 3.15833 10.6332 4.03351C11.5083 4.90868 12 6.09566 12 7.33333C12 8.49333 11.5733 9.56 10.876 10.3813L11.1547 10.66H11.8333L15.1667 14L14 15.1667L10.66 11.8333V11.1547L10.3813 10.876C9.56 11.5733 8.49333 12 7.33333 12C6.09566 12 4.90868 11.5083 4.03351 10.6332C3.15833 9.75798 2.66667 8.57101 2.66667 7.33333C2.66667 6.09566 3.15833 4.90868 4.03351 4.03351C4.90868 3.15833 6.09566 2.66667 7.33333 2.66667ZM7.33333 4C5.49333 4 4 5.49333 4 7.33333C4 9.17333 5.49333 10.6667 7.33333 10.6667C9.17333 10.6667 10.6667 9.17333 10.6667 7.33333C10.6667 5.49333 9.17333 4 7.33333 4Z" fill="#3D4A5C" />
                  </svg>
                  {/* Zoom percentage text */}
                  <span className="text-sm font-medium text-[#3D4A5C] min-w-[32px] text-center">{zoomLevel}%</span>
                  {/* Chevron down */}
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5.338 5.672C5.152 5.858 4.847 5.858 4.662 5.672L0.917 1.927C0.731 1.742 0.731 1.437 0.917 1.251C1.102 1.066 1.407 1.066 1.593 1.251L5 4.658L8.407 1.251C8.592 1.066 8.897 1.066 9.083 1.251C9.268 1.437 9.268 1.742 9.083 1.927L5.338 5.672Z" fill="#8596AD" />
                  </svg>
                </button>

                {/* Dropdown menu */}
                <AnimatePresence>
                  {showZoomDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-[0px_4px_16px_rgba(0,0,0,0.12)] border border-[#E0E5EB] py-1 z-50 min-w-[120px]"
                    >
                      {ZOOM_OPTIONS.map((level) => (
                        <button
                          key={level}
                          onClick={() => {
                            setZoomLevel(level);
                            setShowZoomDropdown(false);
                          }}
                          className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-text-secondary hover:bg-[#F6F7F9] transition-colors cursor-pointer"
                        >
                          <span className={zoomLevel === level ? 'font-semibold text-text-primary' : ''}>{level}%</span>
                          {zoomLevel === level && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#006EFE" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Divider */}
              <div className="w-px h-4 bg-[#E0E5EB] mx-1" />

              {/* Three dots menu */}
              <button
                className="w-6 h-[38px] rounded-md flex items-center justify-center hover:bg-surface transition-colors cursor-pointer"
                title="More options"
              >
                <svg width="24" height="38" viewBox="0 0 24 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11.7791 23.447C11.4844 23.447 11.2018 23.5641 10.9934 23.7725C10.785 23.9809 10.668 24.2635 10.668 24.5582C10.668 24.8528 10.785 25.1355 10.9934 25.3438C11.2018 25.5522 11.4844 25.6693 11.7791 25.6693C12.0738 25.6693 12.3564 25.5522 12.5648 25.3438C12.7731 25.1355 12.8902 24.8528 12.8902 24.5582C12.8902 24.2635 12.7731 23.9809 12.5648 23.7725C12.3564 23.5641 12.0738 23.447 11.7791 23.447ZM11.7791 17.8915C11.4844 17.8915 11.2018 18.0086 10.9934 18.2169C10.785 18.4253 10.668 18.7079 10.668 19.0026C10.668 19.2973 10.785 19.5799 10.9934 19.7883C11.2018 19.9967 11.4844 20.1137 11.7791 20.1137C12.0738 20.1137 12.3564 19.9967 12.5648 19.7883C12.7731 19.5799 12.8902 19.2973 12.8902 19.0026C12.8902 18.7079 12.7731 18.4253 12.5648 18.2169C12.3564 18.0086 12.0738 17.8915 11.7791 17.8915ZM12.8902 13.447C12.8902 13.1524 12.7731 12.8697 12.5648 12.6614C12.3564 12.453 12.0738 12.3359 11.7791 12.3359C11.4844 12.3359 11.2018 12.453 10.9934 12.6614C10.785 12.8697 10.668 13.1524 10.668 13.447C10.668 13.7417 10.785 14.0243 10.9934 14.2327C11.2018 14.4411 11.4844 14.5582 11.7791 14.5582C12.0738 14.5582 12.3564 14.4411 12.5648 14.2327C12.7731 14.0243 12.8902 13.7417 12.8902 13.447Z" fill="#001633" />
                </svg>
              </button>
            </div>
          </div>

          {/* Gradient flash overlay — brief reveal pulse */}
          <AnimatePresence>
            {showFlash && (
              <motion.div
                className="absolute inset-0 pointer-events-none z-20"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(0, 110, 254, 0.08) 0%, rgba(83, 38, 189, 0.04) 50%, transparent 80%)',
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1.2, ease: 'easeInOut' }}
              />
            )}
          </AnimatePresence>

          {/* Sparkle particles overlay — wow effect */}
          {showParticles && (
            <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
              {particles.map((p) => (
                <div
                  key={p.id}
                  className="sparkle-particle"
                  style={{
                    left: `${p.left}%`,
                    top: `${p.top}%`,
                    width: p.size,
                    height: p.size,
                    background: p.color,
                    '--duration': `${p.duration}s`,
                    '--delay': `${p.delay}s`,
                  } as React.CSSProperties}
                />
              ))}
            </div>
          )}

          {/* Outline title chapter */}
          <div ref={titleRef} className="max-w-3xl mx-auto px-8 pt-8 pb-2 relative">
            {/* Glow ring behind title */}
            {showParticles && <div className="outline-glow-ring" />}

            <motion.div
              className="mb-6 relative z-10"
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            >
              {/* Metadata: chapters + pages */}
              <motion.p
                className="text-sm font-medium text-text-tertiary mb-2"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
              >
                {outline.chapters.length} Chapters &middot; {outline.totalPages ?? 50} Pages
              </motion.p>

              {/* Book title — editable */}
              <ContentEditable
                html={bookTitle}
                onChange={handleTitleChange}
                tagName="h2"
                className="text-2xl font-bold text-text-primary px-1 -mx-1"
              />

              {/* Subtitle — editable */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.5 }}
              >
                <ContentEditable
                  html={bookSubtitle}
                  onChange={handleSubtitleChange}
                  tagName="p"
                  className="text-sm mt-1 font-medium text-text-secondary px-1 -mx-1"
                />
              </motion.div>
            </motion.div>
          </div>

          {/* Chapters */}
          <div className="max-w-3xl mx-auto">
            <ChapterList />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
