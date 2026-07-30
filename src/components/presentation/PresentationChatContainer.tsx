'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { useFlowStore } from '@/stores/flowStore';
import { usePresentationChatStore } from '@/stores/presentationChatStore';
import { usePresentationFlowEngine } from '@/hooks/usePresentationFlowEngine';
import { PRESENTATION_STEP_CONFIGS, PRESENTATION_STEP_PLACEHOLDERS } from '@/lib/presentationChatMocks';
import { ChatMessage } from '../chat/ChatMessage';
import { ChatInput } from '../chat/ChatInput';
import { TypingIndicator } from '../chat/TypingIndicator';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

export function PresentationChatContainer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prompt = searchParams.get('prompt') ?? '';
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);

  const messages = usePresentationChatStore((s) => s.messages);
  const isAiTyping = usePresentationChatStore((s) => s.isAiTyping);
  const currentStep = usePresentationChatStore((s) => s.currentStep);
  const ready = usePresentationChatStore((s) => s.ready);
  const { handleHeroSubmit, handleUserMessage } = usePresentationFlowEngine();

  const endRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current || !prompt) return;
    startedRef.current = true;
    handleHeroSubmit(prompt);
  }, [prompt, handleHeroSubmit]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiTyping]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => router.push('/presentation/ai-outline'), 700);
    return () => clearTimeout(t);
  }, [ready, router]);

  const placeholder = PRESENTATION_STEP_PLACEHOLDERS[currentStep] || 'Type your response...';
  const showInput = currentStep >= 2 && currentStep <= 4;

  return (
    <div className="h-full w-full flex flex-col relative bg-white">
      {/* Gradient background layer — sits behind everything, matches wordgenie's book flow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute"
          style={{
            width: 1041,
            height: 545,
            right: -200,
            top: '31%',
            background: 'linear-gradient(123.24deg, rgba(57, 169, 229, 0.14) 30.21%, rgba(131, 23, 255, 0.14) 88.11%)',
            opacity: 0.8,
            filter: 'blur(150px)',
            transform: 'rotate(45deg)',
          }}
        />
        <div
          className="absolute"
          style={{
            width: 1637,
            height: 857,
            left: -1271,
            top: -1306,
            background: 'linear-gradient(123.24deg, rgba(57, 169, 229, 0.14) 30.21%, rgba(131, 23, 255, 0.14) 88.11%)',
            opacity: 0.8,
            filter: 'blur(150px)',
            transform: 'rotate(45deg)',
          }}
        />
      </div>

      {/* Header — white bar at top */}
      <div className="flex-shrink-0 relative z-10 px-6 py-3 flex items-center justify-between bg-white border-b border-border-light">
        <Tooltip label={sidebarOpen ? 'Close sidebar menu' : 'Show sidebar menu'} position="right">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-10 h-10 rounded-lg hover:bg-[#F6F7F9] transition-colors cursor-pointer"
          >
            <SideMenuIcon active={sidebarOpen} />
          </button>
        </Tooltip>
        <span style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F' }}>Presentation outline</span>
        <div className="w-10" />
      </div>

      {/* Messages area — scrollable, takes remaining space */}
      <div className="flex-1 min-h-0 overflow-y-auto relative z-10 px-4 py-4">
        <div className="max-w-xl mx-auto">
          {messages.map((msg) => {
            const elements: React.ReactNode[] = [];

            // Insert step divider before structured AI messages, keyed off which question
            // it actually is (stepSlot) rather than message order — a question can be
            // skipped entirely (e.g. the audience was already given up front), so position
            // in the list no longer lines up with its step number.
            if (msg.role === 'ai' && msg.type === 'structured' && msg.stepSlot) {
              const config = PRESENTATION_STEP_CONFIGS[msg.stepSlot];
              if (config) {
                elements.push(
                  <div key={`divider-${msg.id}`} className="step-divider">
                    <span>Step {config.number} of {config.totalSteps} - {config.label}</span>
                  </div>
                );
              }
            }

            elements.push(<ChatMessage key={msg.id} message={msg} onSuggestion={handleUserMessage} />);

            return elements;
          })}

          <AnimatePresence>
            {isAiTyping && <TypingIndicator />}
          </AnimatePresence>

          <div ref={endRef} />
        </div>
      </div>

      {/* Input — fixed at bottom, shown while a question is pending */}
      {showInput && (
        <div className="flex-shrink-0 relative z-10">
          <ChatInput placeholder={placeholder} onSubmit={handleUserMessage} disabled={isAiTyping} />
        </div>
      )}

    </div>
  );
}
