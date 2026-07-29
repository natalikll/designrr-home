'use client';

import { Suspense } from 'react';
import NarrationViewV4 from '@/components/presentation/NarrationViewV4';
import { useFlowStore } from '@/stores/flowStore';
import { AppSidebar } from '@/components/sidebar/AppSidebar';

function NarrationPage() {
  const sidebarOpen = useFlowStore(s => s.sidebarOpen);
  const setSidebarOpen = useFlowStore(s => s.setSidebarOpen);

  return (
    <div className="h-screen w-screen overflow-hidden bg-white flex relative">
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 h-full relative">
        <NarrationViewV4 />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <NarrationPage />
    </Suspense>
  );
}
