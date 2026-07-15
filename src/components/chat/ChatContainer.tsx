'use client';

import { useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useFlowStore } from '@/stores/flowStore';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';
import { DirectionCards } from './DirectionCards';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';
import { STEP_CONFIGS, STEP_PLACEHOLDERS, getMockDirections } from '@/lib/mockResponses';
import { useFlowEngine } from '@/hooks/useFlowEngine';
import type { BookDirection } from '@/lib/types';

export function ChatContainer() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messages = useFlowStore((s) => s.messages);
  const isAiTyping = useFlowStore((s) => s.isAiTyping);
  const currentStep = useFlowStore((s) => s.currentStep);
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);
  const { handleUserMessage, handleDirectionSelect } = useFlowEngine();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiTyping]);

  const placeholder = STEP_PLACEHOLDERS[currentStep] || 'Type your response...';
  const showInput = currentStep >= 1 && currentStep <= 3;

  // Build step divider tracking
  let stepCounter = 0;

  return (
    <div className="h-full w-full flex flex-col relative bg-white">
      {/* Gradient background layer — sits behind everything */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Ellipse 305 — right-center glow */}
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
        {/* Ellipse 306 — upper-left ambient (mostly off-screen) */}
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
        <img src="/wordgenie-header.svg" alt="Wordgenie" height={26} className="h-[26px]" />
        <div className="w-10" />
      </div>

      {/* Messages area — scrollable, takes remaining space */}
      <div className="flex-1 min-h-0 overflow-y-auto relative z-10 px-4 py-4">
        <div className="max-w-xl mx-auto">
          {messages.map((msg) => {
            const elements: React.ReactNode[] = [];

            // Insert step divider before structured AI messages (step transitions)
            if (msg.role === 'ai' && msg.type === 'structured') {
              stepCounter++;
              const config = STEP_CONFIGS[stepCounter];
              if (config) {
                elements.push(
                  <div key={`divider-${stepCounter}`} className="step-divider">
                    <span>Step {config.number} of {config.totalSteps} - {config.label}</span>
                  </div>
                );
              }
            }

            // Insert step divider before direction cards
            if (msg.type === 'direction-cards') {
              elements.push(
                <div key={msg.id} className="-mt-3">
                  <DirectionCards
                    directions={getMockDirections()}
                    onSelect={(dir: BookDirection) => handleDirectionSelect(dir)}
                    onMoreIdeas={() => { }}
                  />
                </div>
              );
            } else {
              elements.push(<ChatMessage key={msg.id} message={msg} onSuggestion={handleUserMessage} />);
            }

            return elements;
          })}

          <AnimatePresence>
            {isAiTyping && <TypingIndicator />}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input — fixed at bottom */}
      {showInput && (
        <div className="flex-shrink-0 relative z-10">
          <ChatInput placeholder={placeholder} onSubmit={handleUserMessage} disabled={isAiTyping} />
        </div>
      )}
    </div>
  );
}
