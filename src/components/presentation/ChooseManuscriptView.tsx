'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { usePresentationFlowStore } from '@/stores/presentationFlowStore';
import { useFlowStore } from '@/stores/flowStore';
import { MOCK_MANUSCRIPTS } from '@/lib/presentationMocks';
import { SideMenuIcon } from '../sidebar/AppSidebar';
import { Tooltip } from '../ui/Tooltip';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8596AD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ManuscriptThumb() {
  return (
    <div className="flex items-center justify-center flex-shrink-0" style={{ width: '100%', height: 158, background: '#F2F4F7', borderRadius: 10 }}>
      <div style={{ width: 94, background: '#fff', borderRadius: 5, boxShadow: '0 4px 14px rgba(15,23,51,0.06)', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ height: 5, width: '55%', background: '#C8CDD8', borderRadius: 2 }} />
        <div style={{ height: 3, width: '90%', background: '#E2E5EC', borderRadius: 2, marginTop: 5 }} />
        <div style={{ height: 3, width: '80%', background: '#E2E5EC', borderRadius: 2 }} />
        <div style={{ height: 3, width: '85%', background: '#E2E5EC', borderRadius: 2 }} />
        <div style={{ height: 3, width: '70%', background: '#E2E5EC', borderRadius: 2 }} />
        <div style={{ height: 3, width: '75%', background: '#E2E5EC', borderRadius: 2 }} />
      </div>
    </div>
  );
}

export function ChooseManuscriptView() {
  const router = useRouter();
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);
  const setSelectedManuscriptId = usePresentationFlowStore((s) => s.setSelectedManuscriptId);
  const selectedManuscriptId = usePresentationFlowStore((s) => s.selectedManuscriptId);
  const [query, setQuery] = useState('');

  const filtered = MOCK_MANUSCRIPTS.filter((m) => m.title.toLowerCase().includes(query.toLowerCase()));

  const handleContinue = () => {
    if (!selectedManuscriptId) return;
    router.push('/presentation/sections');
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex-shrink-0 flex items-center justify-between border-b border-border-light" style={{ height: 56, padding: '0 16px' }}>
        <Tooltip label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'} position="right">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center justify-center cursor-pointer"
            style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F6F9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            <SideMenuIcon active={sidebarOpen} />
          </button>
        </Tooltip>

        <button
          onClick={handleContinue}
          disabled={!selectedManuscriptId}
          style={{
            ...ns, fontSize: 14, fontWeight: 600, color: '#fff',
            background: selectedManuscriptId ? '#006EFE' : '#B9CDF2',
            border: 'none', borderRadius: 8, padding: '9px 22px',
            cursor: selectedManuscriptId ? 'pointer' : 'not-allowed',
          }}
        >
          Continue
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 32px 64px' }}>
          <div className="flex items-start justify-between" style={{ marginBottom: 28, gap: 24 }}>
            <div>
              <h1 style={{ ...ns, fontSize: 28, fontWeight: 700, color: '#0D1433' }}>Your manuscripts</h1>
              <p style={{ ...ns, fontSize: 14, color: '#52637A', marginTop: 6 }}>Select one to turn into a presentation.</p>
            </div>
            <div className="flex items-center flex-shrink-0" style={{ gap: 8, height: 40, padding: '0 14px', borderRadius: 8, border: '1px solid #E0E5EB', width: 260 }}>
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search manuscripts…"
                style={{ ...ns, fontSize: 14, color: '#15191F', border: 'none', outline: 'none', flex: 1, background: 'transparent', minWidth: 0 }}
              />
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
            {filtered.map((m) => {
              const isSelected = selectedManuscriptId === m.id;
              return (
                <motion.button
                  key={m.id}
                  type="button"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedManuscriptId(m.id)}
                  onDoubleClick={() => { setSelectedManuscriptId(m.id); router.push('/presentation/sections'); }}
                  className="flex flex-col text-left cursor-pointer"
                  style={{
                    gap: 12, borderRadius: 12, padding: 14, background: '#fff',
                    border: `1.5px solid ${isSelected ? '#006EFE' : 'transparent'}`,
                    boxShadow: isSelected ? '0 0 0 1px #006EFE' : 'none',
                  }}
                >
                  <ManuscriptThumb />
                  <div>
                    <p className="line-clamp-2" style={{ ...ns, fontSize: 15, fontWeight: 600, color: '#15191F', lineHeight: 1.3 }}>{m.title}</p>
                    <p style={{ ...ns, fontSize: 13, color: '#8E99AB', marginTop: 4 }}>Edited {m.editedAt}</p>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
