'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useFlowStore } from '@/stores/flowStore';
import { useFlowEngine } from '@/hooks/useFlowEngine';
import HomePage from './home/HomePage';
import { ChatContainer } from './chat/ChatContainer';
import { OutlineView } from './outline/OutlineView';
import { BookView } from './book/BookView';
import { BookFormatView } from './book/BookFormatView';
import { GenerationTransition } from './transition/GenerationTransition';
import { AppSidebar } from './sidebar/AppSidebar';
import { MyAccountView } from './account/MyAccountView';

function HomePageWithKey() {
  const homeKey = useFlowStore((s) => s.homeKey);
  return <HomePage key={homeKey} />;
}

export function FlowOrchestrator() {
  const currentStep = useFlowStore((s) => s.currentStep);
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);
  const showAccount = useFlowStore((s) => s.showAccount);
  const { handleHeroSubmit, handleGenerateBook } = useFlowEngine();

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
              <HomePageWithKey />
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
      </div>
    </div>
  );
}
