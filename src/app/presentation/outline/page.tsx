'use client';

import { useFlowStore } from '@/stores/flowStore';
import { OutlineReviewView } from '@/components/presentation/OutlineReviewView';
import { AppSidebar } from '@/components/sidebar/AppSidebar';

export default function PresentationOutlinePage() {
  const { sidebarOpen, setSidebarOpen } = useFlowStore();

  return (
    <div className="h-screen w-screen overflow-hidden bg-white flex relative">
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 h-full relative">
        <OutlineReviewView />
      </div>
    </div>
  );
}
