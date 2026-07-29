'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { NarrationView } from '@/components/presentation/NarrationView';
import NarrationViewV2 from '@/components/presentation/NarrationViewV2';
import NarrationViewV3 from '@/components/presentation/NarrationViewV3';
import NarrationViewV4 from '@/components/presentation/NarrationViewV4';
import { usePresentationFlowStore } from '@/stores/presentationFlowStore';
import { useFlowStore } from '@/stores/flowStore';
import { AppSidebar } from '@/components/sidebar/AppSidebar';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

type Version = '1' | '2' | '3' | '4';

/* Prototype-only: flip between flow versions live. Collapses to a small handle by default —
   fixed bottom-right otherwise sits on top of whatever the view underneath renders there
   (e.g. the studio's action bar), so it shouldn't stay expanded and blocking by default. */
function VersionSwitcher({ version }: { version: Version }) {
  const router = useRouter();
  const params = useSearchParams();
  const setNarrationVersion = usePresentationFlowStore(s => s.setNarrationVersion);
  const [collapsed, setCollapsed] = useState(true);

  const go = (v: Version) => {
    setNarrationVersion(v);
    const next = new URLSearchParams(params.toString());
    if (v === '1') next.delete('v'); else next.set('v', v);
    router.replace(`/presentation/narration${next.size ? `?${next.toString()}` : ''}`);
  };

  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)} title={`Switch flow version (currently V${version})`}
        style={{ position: 'fixed', bottom: 18, right: 18, zIndex: 100, cursor: 'pointer',
          ...ns, height: 26, padding: '0 11px', borderRadius: 999, border: 'none',
          background: '#0D1433', color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 700,
          boxShadow: '0 8px 28px rgba(15,23,51,0.35)' }}>
        V{version}
      </button>
    );
  }

  return (
    <div style={{ position: 'fixed', bottom: 18, right: 18, zIndex: 100, display: 'flex', alignItems: 'center', gap: 2,
      background: '#0D1433', borderRadius: 999, padding: 4, boxShadow: '0 8px 28px rgba(15,23,51,0.35)' }}>
      {([['1', 'V1'], ['2', 'V2'], ['3', 'V3'], ['4', 'V4']] as const).map(([v, label]) => (
        <button key={v} onClick={() => go(v)}
          style={{ ...ns, height: 28, padding: '0 13px', borderRadius: 999, border: 'none', cursor: 'pointer',
            fontSize: 11.5, fontWeight: 700, transition: 'all 0.15s',
            background: version === v ? '#fff' : 'transparent',
            color: version === v ? '#0D1433' : 'rgba(255,255,255,0.65)' }}>
          {label}
        </button>
      ))}
      <button onClick={() => setCollapsed(true)} title="Collapse"
        className="cursor-pointer flex items-center justify-center"
        style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'transparent', marginLeft: 2 }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  );
}

function NarrationPage() {
  const params = useSearchParams();
  const vParam = params.get('v');
  const version: Version = vParam === '2' ? '2' : vParam === '3' ? '3' : vParam === '4' ? '4' : '1';
  const sidebarOpen = useFlowStore(s => s.sidebarOpen);
  const setSidebarOpen = useFlowStore(s => s.setSidebarOpen);

  return (
    <div className="h-screen w-screen overflow-hidden bg-white flex relative">
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 h-full relative">
        {version === '4' ? <NarrationViewV4 /> : version === '3' ? <NarrationViewV3 /> : version === '2' ? <NarrationViewV2 /> : <NarrationView />}
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
