'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useFlowStore } from '@/stores/flowStore';
import { useFlowEngine } from '@/hooks/useFlowEngine';
import HomePage from './home/HomePage';
import HomePageV2 from './home/HomePageV2';
import HomePageV3 from './home/HomePageV3';
import HomePageV4 from './home/HomePageV4';
import HomePageV4B from './home/HomePageV4B';
import { ChatContainer } from './chat/ChatContainer';
import { OutlineView } from './outline/OutlineView';
import { BookView } from './book/BookView';
import { BookFormatView } from './book/BookFormatView';
import { GenerationTransition } from './transition/GenerationTransition';
import { AppSidebar } from './sidebar/AppSidebar';
import { MyAccountView } from './account/MyAccountView';

function HomePageWithKey({ version }: { version: 1 | 2 | 3 | 4 | 5 }) {
  const homeKey = useFlowStore((s) => s.homeKey);
  if (version === 2) return <HomePageV2 key={homeKey} />;
  if (version === 3) return <HomePageV3 key={homeKey} />;
  if (version === 4) return <HomePageV4 key={homeKey} />;
  if (version === 5) return <HomePageV4B key={homeKey} />;
  return <HomePage key={homeKey} />;
}

export function FlowOrchestrator() {
  const currentStep = useFlowStore((s) => s.currentStep);
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);
  const showAccount = useFlowStore((s) => s.showAccount);
  const { handleHeroSubmit, handleGenerateBook } = useFlowEngine();
  const [homeVersion, setHomeVersion] = React.useState<1 | 2 | 3 | 4 | 5>(() => {
    if (typeof window !== 'undefined') {
      const v = Number(localStorage.getItem('dsgn_home_v'));
      return ([1,2,3,4,5].includes(v) ? v : 1) as 1|2|3|4|5;
    }
    return 1;
  });

  const cycleVersion = () => {
    const next = (homeVersion === 5 ? 1 : homeVersion + 1) as 1|2|3|4|5;
    setHomeVersion(next);
    localStorage.setItem('dsgn_home_v', String(next));
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
              <HomePageWithKey version={homeVersion} />
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

        {/* Layout A/B/C/D toggle — visible on hub only */}
        {currentStep === 0 && (
          <button
            onClick={cycleVersion}
            className="absolute bottom-5 right-5 z-50 flex items-center cursor-pointer"
            style={{
              gap: 5, padding: '6px 12px', borderRadius: 999,
              background: 'rgba(255,255,255,0.9)', border: '1px solid #DDE2EA',
              boxShadow: '0 2px 8px rgba(15,23,51,0.08)',
              fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, fontWeight: 600,
              color: '#52637A', backdropFilter: 'blur(8px)',
            }}
          >
            {(['A','B','C','D','E'] as const).map((l, i) => (
              <React.Fragment key={l}>
                {i > 0 && <span style={{ color: '#DDE2EA' }}>·</span>}
                <span style={{ color: homeVersion === i + 1 ? '#006EFE' : '#C5CDD9' }}>{l}</span>
              </React.Fragment>
            ))}
          </button>
        )}
      </div>
    </div>
  );
}
