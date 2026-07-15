'use client';

import { useEffect } from 'react';
import { useFlowStore } from '@/stores/flowStore';
import { OutlineView } from '@/components/outline/OutlineView';
import { AppSidebar } from '@/components/sidebar/AppSidebar';
import { getMockOutline, getMockDirections, getMockBook } from '@/lib/mockResponses';

export default function OutlinePage() {
  const { setStep, setOutline, setSidebarOpen, sidebarOpen, setBook } = useFlowStore();

  useEffect(() => {
    const direction = getMockDirections()[0];
    const outline = getMockOutline(direction);
    setOutline(outline);
    setStep(6);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerateBook = () => {
    const direction = getMockDirections()[0];
    const outline = getMockOutline(direction);
    setBook(getMockBook(outline));
    setStep(8);
    window.location.href = '/book';
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-white flex relative">
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 h-full relative">
        <OutlineView onGenerateBook={handleGenerateBook} />
      </div>
    </div>
  );
}
