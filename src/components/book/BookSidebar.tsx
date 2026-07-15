'use client';

import { motion } from 'framer-motion';
import { useFlowStore } from '@/stores/flowStore';

export function BookSidebar() {
  const book = useFlowStore((s) => s.generatedBook);

  if (!book) return null;

  const scrollToChapter = (chapterId: string) => {
    const el = document.getElementById(`book-chapter-${chapterId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="w-64 flex-shrink-0 h-full overflow-y-auto" style={{ background: '#1e1b4b' }}>
      <div className="p-5">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-6 px-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z"
              fill="#818cf8"
            />
          </svg>
          <span className="text-sm font-semibold text-indigo-200">Wordgenie</span>
        </div>

        {/* Chapter label */}
        <h2 className="text-xs font-semibold uppercase tracking-wider text-indigo-400/60 mb-3 px-2">
          Table of Contents
        </h2>

        {/* Chapter list */}
        <div className="space-y-0.5">
          {book.chapters.map((chapter) => (
            <motion.button
              key={chapter.id}
              whileHover={{ x: 2 }}
              onClick={() => scrollToChapter(chapter.id)}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer group hover:bg-white/5"
            >
              <span className="text-indigo-400 font-medium mr-2">
                {chapter.number}.
              </span>
              <span className="text-indigo-200/80 group-hover:text-indigo-100 transition-colors">
                {chapter.title}
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
