'use client';

import { useState, useRef, useEffect } from 'react';
import { Tooltip } from './Tooltip';
import { MenuTick } from './MenuTick';

/* The platform's sort control, lifted out of ProjectsView so the template gallery shows the same
   instrument rather than a second one built out of the gallery's filter buttons. Sorting is the
   same question wherever it is asked, and it was already answered here: a "Sort: <value>" button
   at the end of the control row, a right-aligned menu with a tick on the active option, and an
   icon-only fallback once the row is too narrow to carry the words.
   Height and font size are props because the two rows they sit in differ — Projects runs its
   controls at 38, the gallery's filter bar at 42 — and a sort button that doesn't match the
   controls beside it is the one thing this component exists to avoid. */

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 5.5L7 9l4-3.5" stroke="#52637A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3.5 4h9M3.5 8h6M3.5 12h3" stroke="#52637A" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SortDropdown<T extends string>({ options, value, onChange, compact = false, height = 38, fontSize = 14 }: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  compact?: boolean;
  height?: number;
  fontSize?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const button = (
    <button
      onClick={() => setOpen(v => !v)}
      className="flex items-center cursor-pointer bg-white"
      style={compact
        ? { width: height, height, justifyContent: 'center', borderRadius: 8, border: '1px solid #E0E5EB' }
        : { gap: 8, height, padding: '0 14px', borderRadius: 8, border: '1px solid #E0E5EB' }}
    >
      {compact ? <SortIcon /> : (
        <>
          <span style={{ ...ns, fontSize, fontWeight: 500, color: '#15191F', whiteSpace: 'nowrap' }}>
            Sort: {value}
          </span>
          <ChevronDown />
        </>
      )}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      {compact ? <Tooltip label={`Sort: ${value}`} position="bottom">{button}</Tooltip> : button}
      {open && (
        <div className="absolute bg-white flex flex-col" style={{ top: 'calc(100% + 4px)', right: 0, minWidth: 160, borderRadius: 8, padding: 5, boxShadow: '0px 4px 20px rgba(0,0,0,0.1)', zIndex: 30 }}>
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              className="text-left cursor-pointer rounded-md flex items-center justify-between"
              style={{ ...ns, fontSize: 13.5, color: '#15191F', padding: '7px 10px', gap: 10, fontWeight: opt === value ? 600 : 400, background: opt === value ? '#F4F6F9' : 'transparent', border: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F4F6F9')}
              onMouseLeave={e => (e.currentTarget.style.background = opt === value ? '#F4F6F9' : 'transparent')}
            >
              <span>{opt}</span>
              <MenuTick on={opt === value} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
