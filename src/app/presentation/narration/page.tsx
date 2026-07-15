'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { NarrationView } from '@/components/presentation/NarrationView';
import NarrationViewV2 from '@/components/presentation/NarrationViewV2';
import { usePresentationFlowStore } from '@/stores/presentationFlowStore';
import { useFlowStore } from '@/stores/flowStore';
import { AppSidebar } from '@/components/sidebar/AppSidebar';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

/* Prototype-only: flip between flow versions live. */
function VersionSwitcher({ version }: { version: '1' | '2' }) {
  const router = useRouter();
  const params = useSearchParams();
  const setNarrationVersion = usePresentationFlowStore(s => s.setNarrationVersion);

  const go = (v: '1' | '2') => {
    setNarrationVersion(v);
    const next = new URLSearchParams(params.toString());
    if (v === '1') next.delete('v'); else next.set('v', v);
    router.replace(`/presentation/narration${next.size ? `?${next.toString()}` : ''}`);
  };

  return (
    <div style={{ position: 'fixed', bottom: 18, right: 18, zIndex: 100, display: 'flex', alignItems: 'center', gap: 2,
      background: '#0D1433', borderRadius: 999, padding: 4, boxShadow: '0 8px 28px rgba(15,23,51,0.35)' }}>
      {([['1', 'V1 · current'], ['2', 'V2 · concept']] as const).map(([v, label]) => (
        <button key={v} onClick={() => go(v)}
          style={{ ...ns, height: 28, padding: '0 13px', borderRadius: 999, border: 'none', cursor: 'pointer',
            fontSize: 11.5, fontWeight: 700, transition: 'all 0.15s',
            background: version === v ? '#fff' : 'transparent',
            color: version === v ? '#0D1433' : 'rgba(255,255,255,0.65)' }}>
          {label}
        </button>
      ))}
    </div>
  );
}

function NarrationPage() {
  const params = useSearchParams();
  const version = params.get('v') === '2' ? '2' : '1';
  const sidebarOpen = useFlowStore(s => s.sidebarOpen);
  const setSidebarOpen = useFlowStore(s => s.setSidebarOpen);

  return (
    <div className="h-screen w-screen overflow-hidden bg-white flex relative">
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 h-full relative">
        {version === '2' ? <NarrationViewV2 /> : <NarrationView />}
      </div>
      <VersionSwitcher version={version} />
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
