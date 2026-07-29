'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useFlowStore } from '@/stores/flowStore';
import { useFlowEngine } from '@/hooks/useFlowEngine';
import HomePage from './home/HomePage';
import HomePageStandard from './home/HomePageStandard';
import { ChatContainer } from './chat/ChatContainer';
import { OutlineView } from './outline/OutlineView';
import { BookView } from './book/BookView';
import { BookFormatView } from './book/BookFormatView';
import { GenerationTransition } from './transition/GenerationTransition';
import { AppSidebar } from './sidebar/AppSidebar';
import { MyAccountView } from './account/MyAccountView';

function HomePageWithKey({ plan }: { plan: 1 | 2 }) {
  const homeKey = useFlowStore((s) => s.homeKey);
  if (plan === 2) return <HomePageStandard key={homeKey} />;
  return <HomePage key={homeKey} />;
}

export function FlowOrchestrator() {
  const currentStep = useFlowStore((s) => s.currentStep);
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);
  const showAccount = useFlowStore((s) => s.showAccount);
  const { handleHeroSubmit, handleGenerateBook } = useFlowEngine();
  const [homePlan, setHomePlan] = React.useState<1 | 2>(() => {
    if (typeof window !== 'undefined') {
      const v = Number(localStorage.getItem('dsgn_home_plan'));
      return (v === 2 ? 2 : 1);
    }
    return 1;
  });

  const cyclePlan = () => {
    const next = homePlan === 2 ? 1 : 2;
    setHomePlan(next);
    localStorage.setItem('dsgn_home_plan', String(next));
  };

  return (
    <div className="h-full w-full flex relative">
      {/* Sidebar — pushes content when open */}
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content — takes remaining space */}
      <div className="flex-1 min-w-0 h-full relative">
        {/* My Account overlay */}
        <AnimatePresence>
          {showAccount && (
            <motion.div
              key="account"
              className="absolute inset-0 z-20"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <MyAccountView />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {/* Step 0: Home page with book creation options */}
          {currentStep === 0 && (
            <motion.div
              key="home"
              className="h-full"
              exit={{
                opacity: 0,
                y: -30,
                scale: 0.97,
                transition: { duration: 0.4 },
              }}
            >
              <HomePageWithKey plan={homePlan} />
            </motion.div>
          )}

          {/* Steps 1-4: Chat interface */}
          {currentStep >= 1 && currentStep <= 4 && (
            <motion.div
              key="chat"
              className="h-full"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                scale: 0.97,
                transition: { duration: 0.3 },
              }}
              transition={{ duration: 0.4 }}
            >
              <ChatContainer />
            </motion.div>
          )}

          {/* Step 6: Outline view */}
          {currentStep === 6 && (
            <motion.div
              key="outline"
              className="h-full"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                scale: 0.97,
                transition: { duration: 0.3 },
              }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <OutlineView onGenerateBook={handleGenerateBook} />
            </motion.div>
          )}

          {/* Step 8: Manuscript view */}
          {currentStep === 8 && (
            <motion.div
              key="book"
              className="h-full"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <BookView />
            </motion.div>
          )}

          {/* Step 9: Book format / download view */}
          {currentStep === 9 && (
            <motion.div
              key="book-format"
              className="h-full"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <BookFormatView />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cinematic transition overlay (Step 5 and 7) */}
        <GenerationTransition />

        {/* Home page tier preview toggle — Option 1: Pro (full access) · Option 2: Standard (locked chips) */}
        {currentStep === 0 && (
          <button
            onClick={cyclePlan}
            className="absolute bottom-5 right-5 z-50 flex items-center cursor-pointer"
            style={{
              gap: 5, padding: '6px 12px', borderRadius: 999,
              background: 'rgba(255,255,255,0.9)', border: '1px solid #DDE2EA',
              boxShadow: '0 2px 8px rgba(15,23,51,0.08)',
              fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, fontWeight: 600,
              color: '#52637A', backdropFilter: 'blur(8px)',
            }}
          >
            <span style={{ color: homePlan === 1 ? '#006EFE' : '#C5CDD9' }}>1 · Pro</span>
            <span style={{ color: '#DDE2EA' }}>·</span>
            <span style={{ color: homePlan === 2 ? '#006EFE' : '#C5CDD9' }}>2 · Standard</span>
          </button>
        )}
      </div>
    </div>
  );
}
