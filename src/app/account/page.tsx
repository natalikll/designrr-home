'use client';

import { useEffect } from 'react';
import { useFlowStore } from '@/stores/flowStore';
import { MyAccountView } from '@/components/account/MyAccountView';
import { AppSidebar } from '@/components/sidebar/AppSidebar';

export default function AccountPage() {
  const { setSidebarOpen, sidebarOpen, setShowAccount } = useFlowStore();

  useEffect(() => {
    setShowAccount(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-white flex relative">
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 h-full relative">
        <MyAccountView />
      </div>
    </div>
  );
}
