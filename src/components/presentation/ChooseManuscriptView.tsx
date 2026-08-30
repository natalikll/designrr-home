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

function EmptyStateIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
      <rect x="10" y="6" width="30" height="40" rx="4" fill="#F2F4F7" />
      <rect x="16" y="16" width="18" height="3" rx="1.5" fill="#C8CDD8" />
      <rect x="16" y="23" width="18" height="3" rx="1.5" fill="#E2E5EC" />
      <rect x="16" y="30" width="12" height="3" rx="1.5" fill="#E2E5EC" />
      <circle cx="40" cy="40" r="12" fill="#fff" stroke="#C8CDD8" strokeWidth="2" />
      <line x1="48.5" y1="48.5" x2="54" y2="54" stroke="#C8CDD8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckBadge() {
  return (
    <div
      className="flex items-center justify-center"
      style={{ position: 'absolute', top: 7, right: 7, width: 16, height: 16, borderRadius: '50%', background: '#006EFE' }}
    >
      <svg width="9" height="9" viewBox="0 0 14 14" fill="none">
        <path d="M2.5 7.2L5.2 9.8L11.5 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const THUMB_LINES = [92, 88, 95, 40, 90, 85, 93, 78, 91, 87, 94, 42, 89, 84];

function ManuscriptThumb({ isSelected }: { isSelected: boolean }) {
  return (
    <div
      className="relative flex-shrink-0 overflow-hidden"
      style={{
        width: '100%', height: 214, background: '#F6F7F9', borderRadius: 12,
        border: `1px solid ${isSelected ? '#006EFE' : 'transparent'}`,
      }}
    >
      <div
        className="absolute overflow-hidden bg-white"
        style={{
          left: '50%', transform: 'translateX(-50%)', top: 16, bottom: -25, width: 196,
          borderRadius: '7px 7px 0 0',
          boxShadow: '0px 2px 17px rgba(0,0,0,0.08)',
          padding: '12px 14px',
        }}
      >
        <div style={{ height: 6, width: '48%', background: '#B7BFCC', borderRadius: 2, marginBottom: 8 }} />
        {THUMB_LINES.map((w, i) => (
          <div key={i} style={{ height: 3, width: `${w}%`, background: '#E2E5EC', borderRadius: 1, marginBottom: 4 }} />
        ))}
      </div>
      {isSelected && <CheckBadge />}
    </div>
  );
}

function DocTypeIcon() {
  return (
    <div className="flex items-center justify-center flex-shrink-0" style={{ width: 36, height: 36 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ebook-icon.svg" alt="" width={28} height={32} style={{ pointerEvents: 'none' }} />
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
              <h1 style={{ ...ns, fontSize: 24, fontWeight: 600, lineHeight: '32px', color: '#15191F' }}>Your manuscripts</h1>
              <p style={{ ...ns, fontSize: 14, color: '#52637A', marginTop: 6 }}>Select one to turn into a presentation.</p>
            </div>
            <div className="flex items-center flex-shrink-0" style={{ gap: 8, height: 40, padding: '0 16px', borderRadius: 8, border: '1px solid #E0E5EB', width: 260 }}>
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search manuscripts…"
                style={{ ...ns, fontSize: 16, color: '#15191F', border: 'none', outline: 'none', flex: 1, background: 'transparent', minWidth: 0 }}
              />
            </div>
          </div>

          {MOCK_MANUSCRIPTS.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center" style={{ padding: '80px 24px' }}>
              <EmptyStateIcon />
              <p style={{ ...ns, fontSize: 16, fontWeight: 600, color: '#15191F', marginTop: 20 }}>No manuscripts yet</p>
              <p style={{ ...ns, fontSize: 14, color: '#8E99AB', marginTop: 6, maxWidth: 320 }}>
                Build a presentation now, or write a manuscript first if you&apos;d rather turn a book into slides.
              </p>
              <div className="flex items-center" style={{ gap: 10, marginTop: 20 }}>
                <button
                  onClick={() => router.push('/presentation/theme')}
                  style={{
                    ...ns, fontSize: 14, fontWeight: 600, color: '#fff', background: '#006EFE',
                    border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer',
                  }}
                >
                  Start from scratch
                </button>
                <button
                  onClick={() => router.push('/')}
                  style={{
                    ...ns, fontSize: 14, fontWeight: 600, color: '#15191F', background: '#fff',
                    border: '1px solid #E0E5EB', borderRadius: 8, padding: '10px 20px', cursor: 'pointer',
                  }}
                >
                  Create a manuscript
                </button>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center" style={{ padding: '80px 24px' }}>
              <EmptyStateIcon />
              <p style={{ ...ns, fontSize: 16, fontWeight: 600, color: '#15191F', marginTop: 20 }}>No manuscripts found</p>
              <p style={{ ...ns, fontSize: 14, color: '#8E99AB', marginTop: 6, maxWidth: 320 }}>
                No results for &ldquo;{query}&rdquo;. Try a different search term.
              </p>
              <button
                onClick={() => setQuery('')}
                style={{
                  ...ns, fontSize: 14, fontWeight: 600, color: '#006EFE', background: 'none',
                  border: '1px solid #E0E5EB', borderRadius: 8, padding: '10px 20px', marginTop: 20, cursor: 'pointer',
                }}
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 20 }}>
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
                    className="flex flex-col text-left cursor-pointer bg-white"
                    style={{ gap: 6 }}
                  >
                    <ManuscriptThumb isSelected={isSelected} />
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <DocTypeIcon />
                      <div className="min-w-0">
                        <p className="truncate" style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F', lineHeight: '18px' }}>{m.title}</p>
                        <p style={{ ...ns, fontSize: 12, color: '#52637A' }}>Edited {m.editedAt}</p>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
