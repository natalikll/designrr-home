'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useFlowStore } from '@/stores/flowStore';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';
import { BookTypeSelector } from '@/components/outline/BookTypeSelector';
import type { BookType } from '@/lib/types';

export function BookHeader() {
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);
  const setStep = useFlowStore((s) => s.setStep);
  const setBookType = useFlowStore((s) => s.setBookType);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const router = useRouter();

  const handleBookTypeSelect = (type: BookType) => {
    setShowCreateMenu(false);
    setBookType(type);
    if (type === 'ebook') {
      router.push('/book/create?from=wordgenie');
    } else {
      setStep(9);
    }
  };

  return (
    <>
      <div className="flex-shrink-0 bg-white border-b border-border-light">
        <div className="flex items-center justify-between px-4 py-2">
          {/* Left: Menu icon */}
          <div className="flex items-center gap-2" style={{ minWidth: 180 }}>
            <Tooltip label={sidebarOpen ? 'Close sidebar menu' : 'Show sidebar menu'} position="right">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="w-10 h-10 rounded-lg hover:bg-[#F6F7F9] transition-colors cursor-pointer"
              >
                <SideMenuIcon active={sidebarOpen} />
              </button>
            </Tooltip>
          </div>

          {/* Center: Manuscript title */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="flex-1 text-center"
          >
            <h1 className="text-[20px] font-semibold leading-[24px] gradient-text">Manuscript</h1>
          </motion.div>

          {/* Right: Create + button */}
          <div className="flex items-center justify-end" style={{ minWidth: 180 }}>
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, duration: 0.3 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowCreateMenu(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-accent text-accent text-[14px] font-semibold hover:bg-blue-50 transition-colors cursor-pointer"
            >
              Create a book
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </motion.button>
          </div>
        </div>
      </div>

      {/* Book type selector modal */}
      <BookTypeSelector
        show={showCreateMenu}
        onSelect={handleBookTypeSelect}
        onClose={() => setShowCreateMenu(false)}
      />
    </>
  );
}
