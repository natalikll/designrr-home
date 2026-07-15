'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useFlowStore } from '@/stores/flowStore';
import { AppSidebar } from '@/components/sidebar/AppSidebar';
import { EbookCreateFlow } from '@/components/book/EbookCreateFlow';

function EbookCreatePageInner() {
  const { sidebarOpen, setSidebarOpen } = useFlowStore();
  const searchParams = useSearchParams();
  const fromWordgenie = searchParams.get('from') === 'wordgenie';

  return (
    <div className="h-screen w-screen overflow-hidden bg-white flex relative">
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 h-full relative">
        <EbookCreateFlow startStep={fromWordgenie ? 3 : 2} />
      </div>
    </div>
  );
}

export default function EbookCreatePage() {
  return (
    <Suspense>
      <EbookCreatePageInner />
    </Suspense>
  );
}
