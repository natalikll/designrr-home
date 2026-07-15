'use client';

import { motion } from 'framer-motion';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

export interface PresentationChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
}

export function ChatBubble({ message }: { message: PresentationChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        style={{
          ...ns, fontSize: 14.5, lineHeight: 1.55, maxWidth: 560, padding: '12px 16px', borderRadius: 14,
          background: isUser ? '#5326BD' : '#F4F1FC',
          color: isUser ? '#fff' : '#2A1F45',
          borderBottomRightRadius: isUser ? 4 : 14,
          borderBottomLeftRadius: isUser ? 14 : 4,
        }}
      >
        {message.text}
      </div>
    </motion.div>
  );
}

export function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center" style={{ gap: 4, background: '#F4F1FC', borderRadius: 14, borderBottomLeftRadius: 4, padding: '14px 16px' }}>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.15 }}
            style={{ width: 6, height: 6, borderRadius: '50%', background: '#8064B8' }}
          />
        ))}
      </div>
    </div>
  );
}
