'use client';

import { useFlowStore } from '@/stores/flowStore';
import { PresentationEditorView } from '@/components/presentation/PresentationEditorView';
import { AppSidebar } from '@/components/sidebar/AppSidebar';

export default function PresentationEditorPage() {
  const { sidebarOpen, setSidebarOpen } = useFlowStore();

  return (
    <div className="h-screen w-screen overflow-hidden bg-white flex relative">
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 h-full relative">
        <PresentationEditorView />
      </div>
    </div>
  );
}
