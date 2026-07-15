'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

type ProjectType = 'ebook' | 'print' | 'kindle' | 'presentation';

type Project = {
  title: string;
  date: string;
  type: ProjectType;
  cover?: string;
  slideColor?: string;
  slideAccent?: string;
};

const ALL_PROJECTS: Project[] = [
  { title: 'Clean Your Mind', date: 'Jun 18, 2025', type: 'ebook', cover: '/assets/cover4.jpg' },
  { title: 'I Finished 75 Hard', date: 'Jun 12, 2025', type: 'ebook', cover: '/assets/cover2.jpg' },
  { title: 'How to Build a Design Portfolio', date: 'Jun 8, 2025', type: 'presentation', slideColor: '#11182F', slideAccent: '#60A5FF' },
  { title: 'Mindfulness For Parents', date: 'May 29, 2025', type: 'print', cover: '/assets/cover3.jpg' },
  { title: 'The Remote Work Playbook', date: 'May 21, 2025', type: 'presentation', slideColor: 'linear-gradient(154deg,#006EFE 14%,#5325BD 86%)', slideAccent: 'rgba(255,255,255,0.6)' },
  { title: 'Marketing Mastery 2025', date: 'May 14, 2025', type: 'kindle', cover: '/assets/cover1.jpg' },
  { title: 'Q2 Product Roadmap', date: 'May 3, 2025', type: 'presentation', slideColor: '#F8F9FB', slideAccent: '#006EFE' },
];

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'ebook', label: 'Ebook' },
  { id: 'print', label: 'Print book' },
  { id: 'kindle', label: 'Kindle' },
  { id: 'presentation', label: 'Presentation' },
] as const;

type TabId = typeof TABS[number]['id'];

const TYPE_LABEL: Record<ProjectType, string> = {
  ebook: 'Ebook',
  print: 'Print book',
  kindle: 'Kindle',
  presentation: 'Presentation',
};

function TypeBadge({ type }: { type: ProjectType }) {
  const colors: Record<ProjectType, { bg: string; color: string }> = {
    ebook: { bg: '#EEF3FF', color: '#3B6FE8' },
    print: { bg: '#F0FBF4', color: '#1BAA71' },
    kindle: { bg: '#FFF4EC', color: '#E07B39' },
    presentation: { bg: '#F3EEFF', color: '#7C5CFC' },
  };
  const { bg, color } = colors[type];
  return (
    <span style={{ ...ns, fontSize: 10, fontWeight: 600, color, background: bg, padding: '2px 6px', borderRadius: 4 }}>
      {TYPE_LABEL[type]}
    </span>
  );
}

function SlideThumb({ color, accent, title }: { color: string; accent: string; title: string }) {
  return (
    <div style={{ width: '100%', height: '100%', background: color, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 18%', gap: 8 }}>
      <div style={{ width: '70%', height: 8, borderRadius: 3, background: color === '#F8F9FB' ? '#15191F' : '#fff', opacity: 0.92 }}/>
      <div style={{ width: '30%', height: 3, borderRadius: 2, background: accent }}/>
      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {[80, 65, 50].map((w, i) => (
          <div key={i} style={{ width: `${w}%`, height: 3.5, borderRadius: 2, background: color === '#F8F9FB' ? '#15191F' : '#fff', opacity: 0.25 }}/>
        ))}
      </div>
    </div>
  );
}

function ProjectCard({ project, galleryIndex }: { project: Project; galleryIndex?: number }) {
  const isSlide = project.type === 'presentation';
  const isGallery = galleryIndex !== undefined;
  return (
    <motion.div
      initial={isGallery ? { x: 20, scale: 0.97 } : false}
      animate={{ x: 0, scale: 1 }}
      transition={isGallery ? { type: 'spring', stiffness: 260, damping: 20, delay: 0.22 + galleryIndex * 0.05 } : undefined}
      whileHover={{ y: -3 }}
      className="group flex cursor-pointer flex-col"
      style={{ gap: 10 }}
    >
      <div
        className="relative rounded-xl transition-shadow group-hover:shadow-lg flex items-center justify-center"
        style={{ width: '100%', aspectRatio: '1/1', background: '#E8EEF8' }}>
        {isSlide ? (
          <div style={{ width: '88%', aspectRatio: '16/9', borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
            <SlideThumb color={project.slideColor!} accent={project.slideAccent!} title={project.title}/>
          </div>
        ) : (
          <img src={project.cover} alt={project.title}
            style={{ width: '62%', height: '80%', objectFit: 'contain', borderRadius: 5, display: 'block' }}/>
        )}
      </div>
      <div className="flex flex-col" style={{ gap: 3 }}>
        <div className="flex items-center justify-between" style={{ gap: 6 }}>
          <p style={{ ...ns, fontSize: 13, fontWeight: 600, color: '#15191F', lineHeight: '16px', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {project.title}
          </p>
        </div>
        <div className="flex items-center" style={{ gap: 6 }}>
          <p style={{ ...ns, fontSize: 11, color: '#8596AD' }}>{project.date}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Variants ───────────────────────────────────────────────────────────────

/** Full hub view: shows all types with tab filter */
export function RecentProjectsHub({ isFirstLoad }: { isFirstLoad?: boolean } = {}) {
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const filtered = activeTab === 'all' ? ALL_PROJECTS : ALL_PROJECTS.filter(p => p.type === activeTab);

  return (
    <section className="w-full px-6 pb-12 flex flex-col items-start">
      <h2 style={{ ...ns, fontSize: 17, fontWeight: 600, color: '#15191F', marginBottom: 12 }}>Recent projects</h2>
      <div className="flex items-center mb-5" style={{ gap: 0, borderBottom: '1px solid #ECEEF2' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...ns, fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? '#15191F' : '#8596AD',
              padding: '0 14px', height: 34, border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab.id ? '2px solid #006EFE' : '2px solid transparent',
              marginBottom: -1, whiteSpace: 'nowrap', transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { if (activeTab !== tab.id) e.currentTarget.style.color = '#52637A'; }}
            onMouseLeave={e => { if (activeTab !== tab.id) e.currentTarget.style.color = '#8596AD'; }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p style={{ ...ns, fontSize: 13, color: '#A0AABA', fontStyle: 'italic' }}>No {activeTab} projects yet.</p>
      ) : (
        <div className="grid w-full" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
          {filtered.map((p, i) => <ProjectCard key={p.title} project={p} galleryIndex={isFirstLoad ? i : undefined} />)}
        </div>
      )}
    </section>
  );
}

/** Books-only section */
export function RecentBooks() {
  const books = ALL_PROJECTS.filter(p => p.type !== 'presentation');
  return (
    <section className="w-full px-6 pb-12">
      <h2 style={{ ...ns, fontSize: 17, fontWeight: 600, color: '#15191F', marginBottom: 12 }}>Recent books</h2>
      {books.length === 0 ? (
        <p style={{ ...ns, fontSize: 13, color: '#A0AABA', fontStyle: 'italic' }}>No books yet.</p>
      ) : (
        <div className="grid w-full" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
          {books.map((p, i) => <ProjectCard key={p.title} project={p} galleryIndex={i} />)}
        </div>
      )}
    </section>
  );
}

/** Presentations-only section */
export function RecentPresentations() {
  const presentations = ALL_PROJECTS.filter(p => p.type === 'presentation');
  return (
    <section className="w-full px-6 pb-8">
      <h2 style={{ ...ns, fontSize: 17, fontWeight: 600, color: '#15191F', marginBottom: 12 }}>Recent presentations</h2>
      {presentations.length === 0 ? (
        <p style={{ ...ns, fontSize: 13, color: '#A0AABA', fontStyle: 'italic' }}>No presentations yet.</p>
      ) : (
        <div className="grid w-full" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
          {presentations.map((p, i) => <ProjectCard key={p.title} project={p} galleryIndex={i} />)}
        </div>
      )}
    </section>
  );
}

/** Legacy default export — hub view with tabs */
export default function RecentProjects() {
  return <RecentProjectsHub />;
}
