'use client';

import { Suspense } from 'react';
import { useFlowStore } from '@/stores/flowStore';
import { PresentationChatContainer } from '@/components/presentation/PresentationChatContainer';
import { AppSidebar } from '@/components/sidebar/AppSidebar';

export default function PresentationChatPage() {
  const { sidebarOpen, setSidebarOpen } = useFlowStore();

  return (
    <div className="h-screen w-screen overflow-hidden bg-white flex relative">
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 h-full relative">
        <Suspense fallback={null}>
          <PresentationChatContainer />
        </Suspense>
      </div>
    </div>
  );
}
