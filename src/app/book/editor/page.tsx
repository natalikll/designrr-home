'use client';

import { useFlowStore } from '@/stores/flowStore';
import { BookEditorView } from '@/components/book/BookEditorView';
import { AppSidebar } from '@/components/sidebar/AppSidebar';
import { AccountOverlay } from '@/components/account/AccountOverlay';

export default function BookEditorPage() {
  const { sidebarOpen, setSidebarOpen } = useFlowStore();

  return (
    <div className="h-screen w-screen overflow-hidden bg-white flex relative">
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 h-full relative">
        <BookEditorView />
        <AccountOverlay />
      </div>
    </div>
  );
}
