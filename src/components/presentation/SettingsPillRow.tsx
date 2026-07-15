'use client';

import { useEffect, useRef, useState } from 'react';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;
const ICON_COLOR = '#52637A';

function LayersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5L14.5 5L8 8.5L1.5 5L8 1.5Z" stroke={ICON_COLOR} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M1.5 8L8 11.5L14.5 8" stroke={ICON_COLOR} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1.5 11L8 14.5L14.5 11" stroke={ICON_COLOR} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="2" y1="4" x2="14" y2="4" stroke={ICON_COLOR} strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="10" cy="4" r="1.6" fill={ICON_COLOR} />
      <line x1="2" y1="8" x2="14" y2="8" stroke={ICON_COLOR} strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6" cy="8" r="1.6" fill={ICON_COLOR} />
      <line x1="2" y1="12" x2="14" y2="12" stroke={ICON_COLOR} strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="11" cy="12" r="1.6" fill={ICON_COLOR} />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.3" stroke={ICON_COLOR} strokeWidth="1.3" />
      <ellipse cx="8" cy="8" rx="2.7" ry="6.3" stroke={ICON_COLOR} strokeWidth="1.3" />
      <line x1="1.7" y1="8" x2="14.3" y2="8" stroke={ICON_COLOR} strokeWidth="1.3" />
    </svg>
  );
}

function DensityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="2" y1="3" x2="14" y2="3" stroke={ICON_COLOR} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="2" y1="6.3" x2="14" y2="6.3" stroke={ICON_COLOR} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="2" y1="9.6" x2="14" y2="9.6" stroke={ICON_COLOR} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="2" y1="13" x2="14" y2="13" stroke={ICON_COLOR} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
      <path d="M1 1L4 4L7 1" stroke="#8C97A8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 6.2L4.8 8.5L9.5 3.5" stroke="#006EFE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface PillConfig {
  key: string;
  icon: () => React.ReactNode;
  options: string[];
  defaultIndex: number;
}

const LANGUAGES = [
  'English (US)', 'English (UK)', 'Spanish', 'French', 'German', 'Portuguese',
  'Italian', 'Dutch', 'Polish', 'Russian', 'Japanese', 'Chinese (Simplified)',
  'Chinese (Traditional)', 'Korean', 'Arabic', 'Hindi', 'Turkish', 'Swedish',
  'Norwegian', 'Danish', 'Finnish', 'Greek', 'Czech', 'Romanian', 'Hungarian',
  'Ukrainian', 'Hebrew', 'Thai', 'Indonesian', 'Malay', 'Vietnamese',
];

const PILLS: PillConfig[] = [
  { key: 'slides', icon: LayersIcon, options: ['3-5 slides', '6-10 slides', '11-15 slides', '16-20 slides'], defaultIndex: 1 },
  { key: 'tone', icon: SlidersIcon, options: ['Professional tone', 'Casual tone', 'Persuasive tone', 'Storytelling tone', 'Academic tone'], defaultIndex: 0 },
  { key: 'language', icon: GlobeIcon, options: LANGUAGES, defaultIndex: 0 },
  { key: 'density', icon: DensityIcon, options: ['Minimal density', 'Standard density', 'Detailed density'], defaultIndex: 1 },
];

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="5.5" cy="5.5" r="4" stroke="#8C97A8" strokeWidth="1.2" />
      <line x1="8.7" y1="8.7" x2="11.5" y2="11.5" stroke="#8C97A8" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function Pill({ config, compact }: { config: PillConfig; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(config.options[config.defaultIndex]);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const Icon = config.icon;
  const isLanguage = config.key === 'language';

  useEffect(() => {
    if (!open) { setSearch(''); return; }
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (open && isLanguage) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open, isLanguage]);

  const visibleOptions = isLanguage && search.trim()
    ? config.options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : config.options;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center cursor-pointer bg-white"
        style={{
          gap: compact ? 6 : 8, padding: compact ? '5px 9px' : '8px 12px 8px 12px',
          borderRadius: 8, border: open ? '1px solid #006EFE' : '1px solid #E0E5EB',
        }}
      >
        <span style={{ display: 'flex', transform: compact ? 'scale(0.85)' : undefined }}>
          <Icon />
        </span>
        <span style={{ ...ns, fontSize: compact ? 12 : 13, fontWeight: 500, color: '#29323D', whiteSpace: 'nowrap' }}>
          {selected.replace(/ tone$/i, '').replace(/ density$/i, '')}
        </span>
        <ChevronDown />
      </button>

      {open && (
        <div
          className="absolute bg-white flex flex-col"
          style={{
            top: 'calc(100% + 6px)', left: 0, minWidth: 188, padding: 6, borderRadius: 10,
            border: '1px solid #E8EBF2', boxShadow: '0px 8px 24px rgba(15,23,51,0.12)', zIndex: 30,
          }}
        >
          {isLanguage && (
            <div
              className="flex items-center"
              style={{ gap: 7, margin: '0 0 4px 0', padding: '6px 10px', borderRadius: 6, background: '#F6F7F9' }}
            >
              <SearchIcon />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search language…"
                className="bg-transparent focus:outline-none w-full"
                style={{ ...ns, fontSize: 13, color: '#15191F', border: 'none' }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{ display: 'flex', color: '#8C97A8', border: 'none', background: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          )}

          <div style={{ maxHeight: isLanguage ? 220 : undefined, overflowY: isLanguage ? 'auto' : undefined }}>
            {visibleOptions.length === 0 ? (
              <div style={{ ...ns, fontSize: 13, color: '#8C97A8', padding: '8px 10px', textAlign: 'center' }}>
                No results
              </div>
            ) : (
              visibleOptions.map((opt) => {
                const isSelected = opt === selected;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setSelected(opt);
                      setOpen(false);
                    }}
                    className="flex items-center justify-between cursor-pointer text-left w-full"
                    style={{
                      gap: 8, padding: '8px 10px', borderRadius: 6, border: 'none',
                      background: isSelected ? '#F2F7FF' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = '#F6F7F9';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{ ...ns, fontSize: 13.5, fontWeight: isSelected ? 600 : 400, color: '#15191F', whiteSpace: 'nowrap' }}>
                      {opt}
                    </span>
                    {isSelected && <CheckIcon />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsPillRow({ compact = false, exclude }: { compact?: boolean; exclude?: string[] }) {
  const pills = exclude ? PILLS.filter(p => !exclude.includes(p.key)) : PILLS;
  return (
    <div className="flex items-center" style={{ gap: compact ? 8 : 10, flexWrap: 'wrap' }}>
      {pills.map((config) => (
        <Pill key={config.key} config={config} compact={compact} />
      ))}
    </div>
  );
}
