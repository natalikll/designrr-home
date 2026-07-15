'use client';

import { useEffect } from 'react';
import { useFlowStore } from '@/stores/flowStore';
import { BookView } from '@/components/book/BookView';
import { AppSidebar } from '@/components/sidebar/AppSidebar';
import { getMockOutline, getMockBook, getMockDirections } from '@/lib/mockResponses';

export default function BookPage() {
  const { setStep, setBook, setSidebarOpen, sidebarOpen } = useFlowStore();

  useEffect(() => {
    const direction = getMockDirections()[0];
    const outline = getMockOutline(direction);
    const book = getMockBook(outline);
    setBook(book);
    setStep(8);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-white flex relative">
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 h-full relative">
        <BookView />
      </div>
    </div>
  );
}
