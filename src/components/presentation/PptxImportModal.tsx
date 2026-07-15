'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { usePresentationFlowStore } from '@/stores/presentationFlowStore';
import { MOCK_MANUSCRIPTS } from '@/lib/presentationMocks';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

function PptxBadge({ size, radius }: { size: number; radius: number }) {
  return (
    <div
      className="flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, borderRadius: radius, background: '#D24726' }}
    >
      <span style={{ ...ns, fontSize: size * 0.44, fontWeight: 800, color: '#fff' }}>P</span>
    </div>
  );
}

function UploadArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
      <path d="M10 13V3M10 3L6 7M10 3l4 4" stroke="#52637A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14" stroke="#52637A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChainIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path d="M8.5 11.5l3-3" stroke="#8596AD" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 6.5l1.1-1.1a3 3 0 1 1 4.24 4.24L13 10.75M11 13.5l-1.1 1.1a3 3 0 1 1-4.24-4.24L6.75 9.25" stroke="#8596AD" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PptxImportModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const slides = usePresentationFlowStore((s) => s.slides);
  const selectedManuscriptId = usePresentationFlowStore((s) => s.selectedManuscriptId);
  const setSelectedManuscriptId = usePresentationFlowStore((s) => s.setSelectedManuscriptId);
  const setSelectedSectionIds = usePresentationFlowStore((s) => s.setSelectedSectionIds);
  const generateSlides = usePresentationFlowStore((s) => s.generateSlides);

  const [files, setFiles] = useState<string[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);

  const totalCount = files.length + urls.length;

  const addFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setFiles((prev) => [...prev, ...Array.from(fileList).map((f) => f.name)]);
  };

  const handleAddUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setUrls((prev) => [...prev, trimmed]);
    setUrlInput('');
  };

  const handleNext = () => {
    if (totalCount === 0) return;
    setImporting(true);
    if (slides.length === 0) {
      const manuscript = MOCK_MANUSCRIPTS.find((m) => m.id === selectedManuscriptId) ?? MOCK_MANUSCRIPTS[0];
      if (!selectedManuscriptId) setSelectedManuscriptId(manuscript.id);
      setSelectedSectionIds(manuscript.sections.map((s) => s.id));
      generateSlides();
    }
    setTimeout(() => router.push('/presentation/editor'), 700);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(15,23,51,0.35)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white flex flex-col"
        style={{ borderRadius: 16, width: '90%', maxWidth: 620, padding: 28, boxShadow: '0px 24px 80px rgba(15,23,51,0.22)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <PptxBadge size={28} radius={7} />
            <span style={{ ...ns, fontSize: 16, fontWeight: 600, color: '#29323D' }}>Import from PPTX</span>
          </div>
          <button onClick={onClose} className="flex items-center justify-center cursor-pointer" style={{ width: 28, height: 28, borderRadius: 8, background: 'none', border: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8596AD" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Dropzone */}
        <label
          className="flex flex-col items-center justify-center cursor-pointer"
          style={{
            gap: 12, borderRadius: 12, padding: '40px 20px',
            border: `1.5px dashed ${dragging ? '#006EFE' : '#D8DEE8'}`,
            background: dragging ? '#F4F8FF' : '#fff',
            transition: 'all 0.15s ease',
          }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        >
          <input type="file" accept=".ppt,.pptx" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          <div className="relative">
            <PptxBadge size={64} radius={16} />
            <div
              className="flex items-center justify-center"
              style={{ position: 'absolute', bottom: -4, right: -4, width: 24, height: 24, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(15,23,51,0.2)' }}
            >
              <UploadArrowIcon />
            </div>
          </div>
          <p style={{ ...ns, fontSize: 15, color: '#15191F' }}>
            {files.length > 0
              ? `${files.length} file${files.length > 1 ? 's' : ''} selected`
              : (
                <>
                  Drag and drop your file or <span style={{ color: '#006EFE', fontWeight: 600 }}>browse</span>
                </>
              )}
          </p>
          <p style={{ ...ns, fontSize: 13, color: '#8596AD' }}>PowerPoint .pptx</p>
        </label>

        {/* URL import */}
        <p style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F', marginTop: 22, marginBottom: 10 }}>Or import from URL</p>
        <div className="flex items-center" style={{ gap: 10, height: 44, padding: '0 14px', borderRadius: 10, border: '1px solid #E0E5EB' }}>
          <ChainIcon />
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddUrl(); }}
            placeholder="Insert URL here"
            style={{ ...ns, fontSize: 14, color: '#15191F', border: 'none', outline: 'none', flex: 1, background: 'transparent', minWidth: 0 }}
          />
          <button
            onClick={handleAddUrl}
            disabled={!urlInput.trim()}
            style={{
              ...ns, fontSize: 14, fontWeight: 600, background: 'none', border: 'none',
              color: urlInput.trim() ? '#006EFE' : '#B9CDF2',
              cursor: urlInput.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Add
          </button>
        </div>
        <p style={{ ...ns, fontSize: 12.5, color: '#8596AD', marginTop: 10, lineHeight: 1.5 }}>
          Works with Google Slides, Canva, and other platforms. Make sure the link is set to{' '}
          <strong style={{ fontWeight: 700, color: '#52637A' }}>public</strong> or{' '}
          <strong style={{ fontWeight: 700, color: '#52637A' }}>&ldquo;Anyone with the link&rdquo;</strong>.
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between" style={{ marginTop: 24 }}>
          <span style={{ ...ns, fontSize: 13, color: '#8596AD' }}>{totalCount} file{totalCount === 1 ? '' : 's'}</span>
          <button
            onClick={handleNext}
            disabled={totalCount === 0 || importing}
            style={{
              ...ns, fontSize: 14, fontWeight: 600, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px',
              background: totalCount > 0 ? '#006EFE' : '#B9CDF2',
              cursor: totalCount > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            {importing ? 'Importing…' : 'Next'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
