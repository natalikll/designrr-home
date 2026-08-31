'use client';

import { useFlowStore } from '@/stores/flowStore';
import { ChooseManuscriptView } from '@/components/presentation/ChooseManuscriptView';
import { AppSidebar } from '@/components/sidebar/AppSidebar';
import { AccountOverlay } from '@/components/account/AccountOverlay';

export default function PresentationManuscriptPage() {
  const { sidebarOpen, setSidebarOpen } = useFlowStore();

  return (
    <div className="h-screen w-screen overflow-hidden bg-white flex relative">
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 h-full relative">
        <ChooseManuscriptView />
        <AccountOverlay />
      </div>
    </div>
  );
}
