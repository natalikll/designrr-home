'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { messageVariants } from '@/lib/animations';
import type { ChatMessage as ChatMessageType } from '@/lib/types';

interface ChatMessageProps {
  message: ChatMessageType;
  onSuggestion?: (text: string) => void;
}

export function ChatMessage({ message, onSuggestion }: ChatMessageProps) {
  const isAi = message.role === 'ai';

  if (isAi && message.type === 'structured' && message.structured) {
    return <AiStructuredMessage message={message} onSuggestion={onSuggestion} />;
  }

  if (isAi) {
    return <AiTextMessage message={message} />;
  }

  return <UserMessage message={message} />;
}

/* ── AI structured message: sparkle + heading + body + example + fallback card ── */
function AiStructuredMessage({ message, onSuggestion }: { message: ChatMessageType; onSuggestion?: (text: string) => void }) {
  const s = message.structured!;
  const [showExample, setShowExample] = useState(false);

  return (
    <motion.div variants={messageVariants} initial="hidden" animate="visible" className="mb-5">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1"><SparkleIcon /></div>
        <div className="flex-1 min-w-0">
          {s.heading && (
            <h3 className="text-[15px] font-semibold text-text-primary mb-4 leading-snug">
              {s.heading}
            </h3>
          )}
          {s.body && <p className="text-[14px] text-text-secondary leading-relaxed">{s.body}</p>}

          {s.voiceHeading && (
            <div className="mb-4">
              <h4 className="text-[14px] font-semibold text-text-primary mb-1.5">{s.voiceHeading}</h4>
              <p className="text-[14px] text-text-secondary leading-relaxed">{s.voiceText}</p>
            </div>
          )}

          {s.backgroundHeading && (
            <div className="mb-6">
              <h4 className="text-[14px] font-semibold text-text-primary mb-1.5">{s.backgroundHeading}</h4>
              <p className="text-[14px] text-text-secondary leading-relaxed">{s.backgroundText}</p>
            </div>
          )}

          {s.directionsIntro && (
            <div className="flex items-start gap-3 mt-8 mb-2 -ml-9">
              <div className="flex-shrink-0 mt-1"><SparkleIcon /></div>
              <p className="text-[15px] text-text-primary font-medium">{s.directionsIntro}</p>
            </div>
          )}

          {s.hasExample && (
            <button
              onClick={() => setShowExample(!showExample)}
              className="mt-2.5 text-[13px] text-accent font-medium hover:text-accent-hover transition-colors cursor-pointer"
            >
              {showExample ? 'Hide an example' : 'Show an example'}
            </button>
          )}

          {showExample && s.exampleText && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-3 overflow-hidden"
            >
              <div
                className="pl-4 py-2"
                style={{ borderLeft: '2px solid', borderImage: 'linear-gradient(259.1deg, #006EFE -2.17%, #5326BD 103.16%) 1' }}
              >
                <p className="text-[13px] text-text-secondary leading-relaxed">
                  {s.exampleText}
                </p>
              </div>
            </motion.div>
          )}



          {s.fallbackHeading && (
            <div className="mt-4 rounded-xl p-4 max-w-[70%]" style={{ background: 'rgba(255, 255, 255, 0.26)', border: '2px solid #FFFFFF', boxShadow: '0px 2px 32px rgba(143, 132, 171, 0.12)' }}>
              <div className="flex items-start gap-2.5">
                <span className="flex-shrink-0 text-base leading-none mt-0.5">💡</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-text-primary">{s.fallbackHeading}</p>
                  <p className="text-[12px] text-text-secondary mt-0.5 leading-relaxed">
                    {s.fallbackBody}
                  </p>
                </div>
              </div>
              {s.fallbackAction && (
                <div className="flex justify-end mt-3">
                  <button
                    onClick={() => onSuggestion?.(s.fallbackAction!)}
                    className="text-[12px] font-medium text-text-primary bg-white border border-border-light rounded-full px-4 py-1.5 hover:bg-surface transition-colors cursor-pointer"
                  >
                    {s.fallbackAction}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Simple AI text message ── */
function AiTextMessage({ message }: { message: ChatMessageType }) {
  return (
    <motion.div variants={messageVariants} initial="hidden" animate="visible" className="mb-5">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1"><SparkleIcon /></div>
        <p className="text-[14px] text-text-secondary leading-relaxed whitespace-pre-wrap">
          {message.content}
        </p>
      </div>
    </motion.div>
  );
}

/* ── User message: white card, right-aligned, avatar ── */
function UserMessage({ message }: { message: ChatMessageType }) {
  return (
    <motion.div variants={messageVariants} initial="hidden" animate="visible" className="mb-5 flex justify-end">
      <div className="flex items-start gap-2.5 max-w-[80%]">
        <div className="bg-white rounded-2xl inline-block" style={{ padding: '12px 18px', boxShadow: '0px 2px 32px rgba(143, 132, 171, 0.15)' }}>
          <p className="text-[14px] text-text-primary leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
        <img
          src="/user-avatar.jpg"
          alt="User"
          className="flex-shrink-0 w-7 h-7 rounded-full object-cover mt-1"
        />
      </div>
    </motion.div>
  );
}

/* ── Icons ── */
function SparkleIcon() {
  return (
    <div className="flex gap-px">
      <svg width="8" height="8" viewBox="0 0 12 12" fill="#4f46e5">
        <path d="M6 0L7.5 4.5L12 6L7.5 7.5L6 12L4.5 7.5L0 6L4.5 4.5L6 0Z" />
      </svg>
      <svg width="6" height="6" viewBox="0 0 12 12" fill="#7c3aed" className="mt-1">
        <path d="M6 0L7.5 4.5L12 6L7.5 7.5L6 12L4.5 7.5L0 6L4.5 4.5L6 0Z" />
      </svg>
    </div>
  );
}

