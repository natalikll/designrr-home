'use client';

import { useRouter } from 'next/navigation';
import { useFlowStore } from '@/stores/flowStore';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

export const PRESENTATION_STEPS = ['Manuscript', 'Sections', 'Outline', 'Theme'];

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
      <path d="M2.5 7.2L5.2 9.8L11.5 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PresentationStepHeader({ activeIndex, onBack }: { activeIndex: number; onBack?: () => void }) {
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);
  const router = useRouter();

  return (
    <div className="flex-shrink-0 bg-white border-b border-border-light" style={{ height: 56 }}>
      <div className="flex items-center h-full" style={{ padding: '0 16px' }}>
        <Tooltip label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'} position="right">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex-shrink-0 flex items-center justify-center cursor-pointer"
            style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F6F9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            <SideMenuIcon active={sidebarOpen} />
          </button>
        </Tooltip>

        <div className="flex-1 flex items-center justify-center" style={{ gap: 8 }}>
          {PRESENTATION_STEPS.map((label, i) => {
            const done = i < activeIndex;
            const active = i === activeIndex;
            return (
              <div key={label} className="flex items-center" style={{ gap: 8 }}>
                {i > 0 && <div style={{ width: 24, height: 1, background: done || active ? '#5326BD' : '#E0E5EB' }} />}
                <div className="flex items-center" style={{ gap: 6 }}>
                  <div className="flex items-center justify-center flex-shrink-0 rounded-full" style={{ width: 22, height: 22, background: done || active ? '#5326BD' : '#F1F2F4' }}>
                    {done ? <CheckIcon /> : <span style={{ ...ns, fontSize: 11, fontWeight: 700, color: active ? '#fff' : '#8E99AB' }}>{i + 1}</span>}
                  </div>
                  <span style={{ ...ns, fontSize: 13, fontWeight: active ? 600 : 400, color: active || done ? '#15191F' : '#8E99AB', whiteSpace: 'nowrap' }}>{label}</span>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={onBack ?? (() => router.push('/presentation'))}
          className="flex-shrink-0 flex items-center cursor-pointer"
          style={{ gap: 6, ...ns, fontSize: 13, fontWeight: 500, color: '#52637A', background: 'none', border: '1px solid #E0E5EB', borderRadius: 8, padding: '6px 14px' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F6F9'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Exit
        </button>
      </div>
    </div>
  );
}
