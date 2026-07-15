'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFlowStore } from '@/stores/flowStore';
import { usePresentationFlowStore } from '@/stores/presentationFlowStore';
import { getMockSlidesForTopic } from '@/lib/presentationMocks';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';
import { ChatBubble, TypingBubble, type PresentationChatMessage } from './PresentationChatPanel';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

export function PresentationChatContainer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prompt = searchParams.get('prompt') ?? '';
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);
  const setSlides = usePresentationFlowStore((s) => s.setSlides);

  const [messages, setMessages] = useState<PresentationChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [ready, setReady] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current || !prompt) return;
    startedRef.current = true;

    setMessages([{ id: 'u1', role: 'user', text: prompt }]);
    setIsTyping(true);

    const t1 = setTimeout(() => {
      setIsTyping(false);
      setMessages((m) => [...m, {
        id: 'a1', role: 'ai',
        text: `Great topic. I'll draft a 6-slide outline covering an intro, the core idea, key supporting points, and a closing slide for "${prompt}".`,
      }]);
      setIsTyping(true);

      const t2 = setTimeout(() => {
        setIsTyping(false);
        setSlides(getMockSlidesForTopic(prompt));
        setMessages((m) => [...m, { id: 'a2', role: 'ai', text: 'Here\'s your outline — take a look and tweak anything before we move on.' }]);
        setReady(true);
      }, 1400);
      return () => clearTimeout(t2);
    }, 1000);

    return () => clearTimeout(t1);
  }, [prompt, setSlides]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  return (
    <div className="h-full w-full flex flex-col relative bg-white">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute"
          style={{
            width: 1041, height: 545, right: -200, top: '31%',
            background: 'linear-gradient(123.24deg, rgba(131,23,255,0.14) 30.21%, rgba(0,110,254,0.14) 88.11%)',
            opacity: 0.8, filter: 'blur(150px)', transform: 'rotate(45deg)',
          }}
        />
      </div>

      <div className="flex-shrink-0 relative z-10 px-6 py-3 flex items-center justify-between bg-white border-b border-border-light">
        <Tooltip label={sidebarOpen ? 'Close sidebar menu' : 'Show sidebar menu'} position="right">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-10 h-10 rounded-lg hover:bg-[#F6F7F9] transition-colors cursor-pointer">
            <SideMenuIcon active={sidebarOpen} />
          </button>
        </Tooltip>
        <span style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F' }}>Presentation outline</span>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto relative z-10">
        <div className="flex flex-col" style={{ maxWidth: 720, margin: '0 auto', padding: '28px 24px 40px', gap: 14 }}>
          {messages.map((m) => <ChatBubble key={m.id} message={m} />)}
          {isTyping && <TypingBubble />}
          <div ref={endRef} />
        </div>
      </div>

      {ready && (
        <div className="flex-shrink-0 relative z-10 border-t border-border-light flex items-center justify-center" style={{ padding: 16 }}>
          <button
            onClick={() => router.push('/presentation/outline')}
            style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#fff', background: '#5326BD', border: 'none', borderRadius: 10, padding: '11px 26px', cursor: 'pointer' }}
          >
            Review outline →
          </button>
        </div>
      )}
    </div>
  );
}
