'use client';

import { useEffect } from 'react';
import { useFlowStore } from '@/stores/flowStore';
import { ChatContainer } from '@/components/chat/ChatContainer';
import { AppSidebar } from '@/components/sidebar/AppSidebar';
import { getStructuredAiResponse } from '@/lib/mockResponses';

export default function ChatPage() {
  const { setStep, addMessage, setSidebarOpen, sidebarOpen } = useFlowStore();

  useEffect(() => {
    setStep(1);
    addMessage({
      role: 'ai',
      type: 'structured',
      content: '',
      structured: getStructuredAiResponse(0),
    });
    addMessage({
      role: 'user',
      type: 'text',
      content: "I'm a therapist, 15 years in. I want to write a book for therapists — the empathic ones who absorb clients' pain and end up burnt out.",
    });
    addMessage({
      role: 'ai',
      type: 'structured',
      content: '',
      structured: getStructuredAiResponse(1),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-white flex relative">
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 h-full relative">
        <ChatContainer />
      </div>
    </div>
  );
}
