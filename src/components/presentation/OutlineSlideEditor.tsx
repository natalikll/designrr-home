'use client';

import { useState } from 'react';
import { Reorder } from 'framer-motion';
import ContentEditable from 'react-contenteditable';
import type { MockSlide } from '@/lib/presentationMocks';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

export function GripIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
      {[0, 1, 2].map((r) => [0, 1].map((c) => (
        <circle key={`${r}-${c}`} cx={c * 5 + 2.5} cy={r * 5 + 2.5} r="1.4" fill="#A0AABA" />
      )))}
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8C97A8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 6V4a2 2 0 0 1 4 0v2" />
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function AiSparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M12 2 L13.5 9 L20 12 L13.5 15 L12 22 L10.5 15 L4 12 L10.5 9 Z" fill="url(#aiOutlineGrad)" />
      <defs>
        <linearGradient id="aiOutlineGrad" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#006EFE" /><stop offset="1" stopColor="#5326BD" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52637A" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function SmallXIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#A0AABA" strokeWidth="2.4" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/** Splits "Label: rest of the sentence" into its two parts so the label can render bold and
 *  stay independently editable, matching the book outline's chapter/description editing split.
 *  Bullets that don't follow that pattern are treated as a single plain (unlabeled) field. */
export function splitBullet(text: string): { label: string | null; rest: string } {
  const idx = text.indexOf(': ');
  if (idx > 0 && idx < 30) return { label: text.slice(0, idx), rest: text.slice(idx + 2) };
  return { label: null, rest: text };
}

export function EditableBullet({ text, onChange, onRemove }: {
  text: string; onChange: (text: string) => void; onRemove: () => void;
}) {
  const initial = splitBullet(text);
  const [label, setLabel] = useState(initial.label);
  const [rest, setRest] = useState(initial.rest);

  return (
    <div className="group/bullet flex items-start" style={{ gap: 6, padding: '2px 0' }}>
      <span style={{ ...ns, fontSize: 13.5, color: '#8C97A8', lineHeight: 1.6, flexShrink: 0 }}>•</span>
      <div className="flex-1 min-w-0 flex flex-wrap items-baseline" style={{ ...ns, fontSize: 13.5, color: '#3D4A5C', lineHeight: 1.6 }}>
        {label !== null && (
          <>
            <ContentEditable
              html={label}
              onChange={(e) => { setLabel(e.target.value); onChange(`${e.target.value}: ${rest}`); }}
              tagName="span"
              className="font-bold px-0.5 -mx-0.5 inline"
              style={{ color: '#15191F' }}
            />
            <span>:&nbsp;</span>
          </>
        )}
        <ContentEditable
          html={rest}
          onChange={(e) => {
            setRest(e.target.value);
            onChange(label !== null ? `${label}: ${e.target.value}` : e.target.value);
          }}
          tagName="span"
          className="px-0.5 -mx-0.5 inline"
        />
      </div>
      <button
        onClick={onRemove}
        className="flex-shrink-0 opacity-0 group-hover/bullet:opacity-100 transition-opacity cursor-pointer"
        style={{ width: 16, height: 16, marginTop: 3, border: 'none', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        aria-label="Remove point"
      >
        <SmallXIcon />
      </button>
    </div>
  );
}

export function SlideCard({ slide, index, onRemove, onTitleChange, onPointsChange }: {
  slide: MockSlide; index: number; onRemove: () => void; onTitleChange: (title: string) => void; onPointsChange: (points: string[]) => void;
}) {
  const updateBullet = (i: number, text: string) => {
    const next = [...slide.points];
    next[i] = text;
    onPointsChange(next);
  };
  const removeBullet = (i: number) => onPointsChange(slide.points.filter((_, pi) => pi !== i));
  const addBullet = () => onPointsChange([...slide.points, 'New point: Add detail here']);

  return (
    <Reorder.Item value={slide} as="div">
      <div className="group/card flex items-start" style={{ gap: 10, padding: '14px 14px 14px 8px', borderRadius: 12, border: '1px solid #E8EBF2', background: '#fff' }}>
        <div className="flex-shrink-0 flex items-center justify-center cursor-grab" style={{ width: 20, height: 20, marginTop: 4, opacity: 0.6 }}>
          <GripIcon />
        </div>
        <div className="flex items-center justify-center flex-shrink-0 rounded-full" style={{ width: 24, height: 24, background: '#E6F1FF', marginTop: 2 }}>
          <span style={{ ...ns, fontSize: 11, fontWeight: 700, color: '#006EFE' }}>{String(index + 1).padStart(2, '0')}</span>
        </div>
        <div className="flex-1 min-w-0">
          <input
            value={slide.title}
            onChange={(e) => onTitleChange(e.target.value)}
            style={{ ...ns, fontSize: 15, fontWeight: 700, color: '#15191F', border: 'none', outline: 'none', width: '100%', background: 'transparent' }}
          />
          {slide.points.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {slide.points.map((p, pi) => (
                <EditableBullet
                  key={pi}
                  text={p}
                  onChange={(text) => updateBullet(pi, text)}
                  onRemove={() => removeBullet(pi)}
                />
              ))}
            </div>
          )}
          <button
            onClick={addBullet}
            className="flex items-center opacity-0 group-hover/card:opacity-100 transition-opacity cursor-pointer"
            style={{ gap: 4, marginTop: 4, ...ns, fontSize: 12, fontWeight: 600, color: '#8C97A8', background: 'none', border: 'none', padding: 0 }}
          >
            <PlusIcon /> Add point
          </button>
        </div>
        <button
          onClick={onRemove}
          className="flex-shrink-0 opacity-0 group-hover/card:opacity-100 transition-opacity cursor-pointer"
          style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <TrashIcon />
        </button>
      </div>
    </Reorder.Item>
  );
}

let nextBlankId = 1;

export function createBlankSlide(): MockSlide {
  return {
    id: `blank-${Date.now()}-${nextBlankId++}`,
    type: 'content',
    title: 'New slide',
    points: ['Add your content here'],
    layout: 'standard',
  };
}

export function createAiGeneratedSlide(): MockSlide {
  return {
    id: `ai-${Date.now()}`,
    type: 'content',
    title: 'Additional Point',
    points: [
      'Supporting detail: A point that adds depth to your existing outline',
      "Why it matters: Ties back to the deck's core message",
    ],
    layout: 'standard',
  };
}
