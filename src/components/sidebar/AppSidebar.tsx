'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, usePathname } from 'next/navigation';
import { useFlowStore } from '@/stores/flowStore';
import { createPortal } from 'react-dom';
import { useState, useRef, useEffect, useCallback } from 'react';

export const SIDEBAR_WIDTH = 240;

type PopupType = 'projects' | 'media' | 'learning' | null;

/* ─────────────────────────────────────────
   Sub-popup: Projects
───────────────────────────────────────── */
function ProjectsPopup({ anchorTop, sidebarRight }: { anchorTop: number; sidebarRight: number }) {
  const ITEMS = ['eBooks', 'Audiobooks', 'Flipbooks', 'Folders'];
  return (
    <div
      style={{
        position: 'fixed',
        left: sidebarRight + 4,
        top: anchorTop - 28,
        width: 130,
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0px 2px 20px rgba(0,0,0,0.08)',
        zIndex: 9999,
      }}
    >
      {/* Arrow — behind content */}
      <div
        style={{
          position: 'absolute',
          left: -8,
          top: 28,
          width: 30,
          height: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 0,
        }}
      >
        <div
          style={{
            width: 21,
            height: 21,
            background: '#fff',
            borderRadius: 4,
            transform: 'rotate(-45deg)',
            boxShadow: '-2px 2px 6px rgba(0,0,0,0.06)',
          }}
        />
      </div>
      {/* Content — above arrow */}
      <div style={{ position: 'relative', zIndex: 1, paddingTop: 8, paddingBottom: 8, background: '#fff', borderRadius: 12 }}>
        <p style={{ fontSize: 12, color: '#667C98', lineHeight: '16px', padding: '0 16px 8px' }}>Projects</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ITEMS.map((item, i) => (
            <button
              key={item}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                height: 34,
                padding: '0 12px',
                borderRadius: 8,
                fontFamily: "'Nunito Sans', sans-serif",
                fontSize: 14,
                fontWeight: 400,
                lineHeight: '18px',
                color: '#001633',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F6F7F9')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Sub-popup: Media
───────────────────────────────────────── */
function MediaPopup({ anchorTop, sidebarRight }: { anchorTop: number; sidebarRight: number }) {
  const ITEMS = ['Search', 'My Uploads', 'Collections', 'Favorites'];
  return (
    <div
      style={{
        position: 'fixed',
        left: sidebarRight + 4,
        top: anchorTop - 28,
        width: 130,
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0px 2px 20px rgba(0,0,0,0.08)',
        zIndex: 9999,
      }}
    >
      {/* Arrow — behind content */}
      <div
        style={{
          position: 'absolute',
          left: -8,
          top: 28,
          width: 30,
          height: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 0,
        }}
      >
        <div
          style={{
            width: 21,
            height: 21,
            background: '#fff',
            borderRadius: 4,
            transform: 'rotate(-45deg)',
            boxShadow: '-2px 2px 6px rgba(0,0,0,0.06)',
          }}
        />
      </div>
      {/* Content — above arrow */}
      <div style={{ position: 'relative', zIndex: 1, paddingTop: 8, paddingBottom: 8, background: '#fff', borderRadius: 12 }}>
        <p style={{ fontSize: 12, color: '#667C98', lineHeight: '16px', padding: '0 16px 8px' }}>Media</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ITEMS.map((item, i) => (
            <button
              key={item}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                height: 34,
                padding: '0 12px',
                borderRadius: 8,
                fontFamily: "'Nunito Sans', sans-serif",
                fontSize: 14,
                fontWeight: 400,
                lineHeight: '18px',
                color: '#001633',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F6F7F9')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Sub-popup: Learning Center
───────────────────────────────────────── */
const LC_ITEMS = [
  {
    label: 'Learning Center',
    desc: 'Looking to learn about designrr? Check out our learning center.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2L1.5 6.5L9 11L16.5 6.5L9 2Z" stroke="#52637A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4.5 9v4.5c0 1.5 2 2.5 4.5 2.5s4.5-1 4.5-2.5V9" stroke="#52637A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    external: true,
  },
  {
    label: 'Take a tour',
    desc: 'Looking to quickly get started? Take our tour!',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 14.5V4.5L15 4.5" stroke="#52637A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 7.5L15 4.5L12 1.5" stroke="#52637A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 9h5M3 12h3" stroke="#52637A" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    external: false,
  },
  {
    label: 'Explore our Youtube Channel',
    desc: 'Includes excellent explanatory videos',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1.5" y="3.75" width="15" height="10.5" rx="2.5" stroke="#52637A" strokeWidth="1.5"/>
        <path d="M7.5 6.75L11.25 9L7.5 11.25V6.75Z" fill="#52637A"/>
      </svg>
    ),
    external: true,
  },
  {
    label: 'Ask in our Facebook Group',
    desc: 'Join our community',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7.5" stroke="#52637A" strokeWidth="1.5"/>
        <path d="M10.5 6H9.5C9.224 6 9 6.224 9 6.5V8H10.5L10.25 9.5H9V13.5H7.5V9.5H6.5V8H7.5V6.5C7.5 5.395 8.395 4.5 9.5 4.5H10.5V6Z" fill="#52637A"/>
      </svg>
    ),
    external: true,
  },
  {
    label: 'Give feedback',
    desc: 'Have any feedback? We would love to hear from you!',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M15.75 11.25a1.5 1.5 0 0 1-1.5 1.5H4.5L1.5 15.75V3.75a1.5 1.5 0 0 1 1.5-1.5h11.25a1.5 1.5 0 0 1 1.5 1.5v7.5Z" stroke="#52637A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    external: false,
  },
  {
    label: 'Record your screen',
    desc: 'Have a specific issue you would like us to see? Record your screen.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1.5" y="4.5" width="12" height="9" rx="1.5" stroke="#52637A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M13.5 7.5L16.5 5.25v7.5L13.5 10.5V7.5Z" stroke="#52637A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    external: false,
  },
];

function LearningPopup({ anchorTop, sidebarRight }: { anchorTop: number; sidebarRight: number }) {
  return (
    <div
      style={{
        position: 'fixed',
        left: sidebarRight + 4,
        top: Math.min(anchorTop - 10, window.innerHeight - 480),
        width: 369,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0px 2px 20px rgba(0,0,0,0.08)',
        zIndex: 9999,
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {/* Arrow */}
      <div
        style={{
          position: 'absolute',
          left: -8,
          top: 28,
          width: 30,
          height: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 21,
            height: 21,
            background: '#fff',
            borderRadius: 4,
            transform: 'rotate(-45deg)',
            boxShadow: '-2px 2px 6px rgba(0,0,0,0.06)',
          }}
        />
      </div>
      {LC_ITEMS.map((item) => (
        <button
          key={item.label}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 16,
            padding: '12px 8px',
            borderRadius: 4,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#F6F7F9')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 16, fontWeight: 600, lineHeight: '20px', color: '#001633' }}>
                {item.label}
              </span>
              {item.external && (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M13.5 4.5L4.5 13.5M13.5 4.5H9M13.5 4.5V9" stroke="#52637A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            <span style={{ display: 'block', fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, fontWeight: 400, lineHeight: '16px', color: '#52637A', marginTop: 4 }}>
              {item.desc}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────
   AppSidebar
───────────────────────────────────────── */
interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AppSidebar({ isOpen, onClose }: AppSidebarProps) {
  const resetFlow = useFlowStore((s) => s.resetFlow);
  const bumpHomeKey = useFlowStore((s) => s.bumpHomeKey);
  const setShowAccount = useFlowStore((s) => s.setShowAccount);
  const showAccount = useFlowStore((s) => s.showAccount);
  const profilePhoto = useFlowStore((s) => s.profilePhoto);
  const router = useRouter();
  const pathname = usePathname();

  // 'home' when on main app, 'account' when My Account is open, 'manuscripts' on /docs, 'presentations' on /presentation*
  const activeNav = showAccount
    ? 'account'
    : pathname === '/docs'
    ? 'manuscripts'
    : pathname?.startsWith('/presentation')
    ? 'presentations'
    : 'home';

  const [activePopup, setActivePopup] = useState<PopupType>(null);
  const [popupAnchor, setPopupAnchor] = useState({ top: 0, right: 0 });

  const projectsRef = useRef<HTMLButtonElement>(null);
  const mediaRef = useRef<HTMLButtonElement>(null);
  const learningRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const hydrateSidebarPref = useFlowStore((s) => s.hydrateSidebarPref);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    hydrateSidebarPref();
  }, [hydrateSidebarPref]);

  const openPopup = useCallback((type: PopupType, ref: React.RefObject<HTMLButtonElement | null>) => {
    if (activePopup === type) { setActivePopup(null); return; }
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const sidebarRect = sidebarRef.current?.getBoundingClientRect();
      setPopupAnchor({ top: rect.top, right: sidebarRect ? sidebarRect.right : rect.right });
    }
    setActivePopup(type);
  }, [activePopup]);

  // Close popup on outside click
  useEffect(() => {
    if (!activePopup) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !projectsRef.current?.contains(target) &&
        !mediaRef.current?.contains(target) &&
        !learningRef.current?.contains(target) &&
        !(document.getElementById('sidebar-popup-portal')?.contains(target))
      ) {
        setActivePopup(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activePopup]);

  const navItemStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: 34,
    gap: 8,
    padding: '0 12px',
    borderRadius: 8,
    fontFamily: "'Nunito Sans', sans-serif",
    fontSize: 14,
    fontWeight: 400,
    lineHeight: '18px',
    color: isActive ? '#006EFE' : '#001633',
    background: isActive ? '#EEF5FF' : 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  });

  const bottomItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: 34,
    gap: 8,
    padding: '0 12px',
    borderRadius: 8,
    fontFamily: "'Nunito Sans', sans-serif",
    fontSize: 14,
    fontWeight: 400,
    lineHeight: '18px',
    color: '#001633',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            ref={sidebarRef}
            initial={{ width: 0 }}
            animate={{ width: SIDEBAR_WIDTH }}
            exit={{ width: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="h-full flex-shrink-0 overflow-hidden relative z-30"
          >
            <div className="h-full flex flex-col bg-white border-r border-border-light" style={{ width: SIDEBAR_WIDTH }}>

              {/* Header — logo + bell */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 12px 12px' }}>
                <img src="/sidebar-logo.svg" alt="Designrr" style={{ height: 24 }} />
                <button
                  style={{ width: 38, height: 38, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', position: 'relative' }}
                  aria-label="Notifications"
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F6F7F9')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#29323D" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, background: '#D62929', borderRadius: '50%', border: '1.5px solid #fff' }} />
                </button>
              </div>

              {/* Main navigation */}
              <nav style={{ flex: 1, padding: '8px 12px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                  {/* Home */}
                  <button
                    style={navItemStyle(activeNav === 'home')}
                    onClick={() => { resetFlow(); bumpHomeKey(); setShowAccount(false); onClose(); setActivePopup(null); router.push('/'); }}
                    onMouseEnter={(e) => { if (activeNav === 'home') return; e.currentTarget.style.background = '#F6F7F9'; }}
                    onMouseLeave={(e) => { if (activeNav === 'home') return; e.currentTarget.style.background = 'transparent'; }}
                  >
                    <HomeIcon active={activeNav === 'home'} />
                    Home
                  </button>

                  {/* Projects */}
                  <button
                    ref={projectsRef}
                    style={navItemStyle(pathname === '/projects')}
                    onClick={() => { router.push('/projects'); onClose(); setActivePopup(null); }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F6F7F9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = pathname === '/projects' ? '#F6F7F9' : 'transparent')}
                  >
                    <ProjectsIcon active={pathname === '/projects'} />
                    Projects
                  </button>

                  {/* Landing pages */}
                  <button
                    style={navItemStyle(false)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F6F7F9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <LandingIcon active={false} />
                    Landing pages
                  </button>

                  {/* Manuscripts */}
                  <button
                    style={navItemStyle(activeNav === 'manuscripts')}
                    onClick={() => { setShowAccount(false); router.push('/docs'); onClose(); setActivePopup(null); }}
                    onMouseEnter={(e) => { if (activeNav === 'manuscripts') return; e.currentTarget.style.background = '#F6F7F9'; }}
                    onMouseLeave={(e) => { if (activeNav === 'manuscripts') return; e.currentTarget.style.background = 'transparent'; }}
                  >
                    <DocsIcon active={activeNav === 'manuscripts'} />
                    Docs
                  </button>

                  {/* Media */}
                  <button
                    ref={mediaRef}
                    style={{ ...navItemStyle(false), justifyContent: 'space-between' }}
                    onClick={() => openPopup('media', mediaRef)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F6F7F9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = activePopup === 'media' ? '#F6F7F9' : 'transparent')}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <MediaIcon active={false} />
                      Media
                    </span>
                    <ChevronRight />
                  </button>

                </div>
              </nav>

              {/* Bottom section */}
              <div style={{ borderTop: '1px solid #F0F2F5', padding: '12px 12px 32px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 8 }}>

                  {/* Learning Center */}
                  <button
                    ref={learningRef}
                    style={bottomItemStyle}
                    onClick={() => openPopup('learning', learningRef)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F6F7F9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <LearningIcon />
                    Learning Center
                  </button>

                  {/* Upgrades */}
                  <button
                    style={bottomItemStyle}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F6F7F9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <UpgradesIcon />
                    Upgrades
                  </button>

                  {/* Promote */}
                  <button
                    style={bottomItemStyle}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F6F7F9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <SpeakerIcon />
                    Promote
                  </button>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: '#F0F2F5', margin: '8px 0' }} />

                {/* User profile / My Account */}
                <button
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
                    borderRadius: 8, height: 48, width: '100%', border: 'none', cursor: 'pointer',
                    background: activeNav === 'account' ? '#EEF5FF' : 'transparent',
                  }}
                  onClick={() => setShowAccount(true)}
                  onMouseEnter={(e) => { if (activeNav === 'account') return; e.currentTarget.style.background = '#F6F7F9'; }}
                  onMouseLeave={(e) => { if (activeNav === 'account') return; e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: profilePhoto ? 'transparent' : '#E0E5EB', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#8596AD', flexShrink: 0 }}>
                    {profilePhoto
                      ? <img src={profilePhoto} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : 'CW'
                    }
                  </div>
                  <span style={{ flex: 1, fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 400, lineHeight: '18px', color: activeNav === 'account' ? '#006EFE' : '#001633', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Casper Weldings
                  </span>
                </button>
              </div>

            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Popups via portal */}
      {mounted && createPortal(
        <div id="sidebar-popup-portal">
          <AnimatePresence>
            {activePopup === 'projects' && (
              <motion.div key="projects-popup" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
                <ProjectsPopup anchorTop={popupAnchor.top} sidebarRight={popupAnchor.right} />
              </motion.div>
            )}
            {activePopup === 'media' && (
              <motion.div key="media-popup" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
                <MediaPopup anchorTop={popupAnchor.top} sidebarRight={popupAnchor.right} />
              </motion.div>
            )}
            {activePopup === 'learning' && (
              <motion.div key="learning-popup" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
                <LearningPopup anchorTop={popupAnchor.top} sidebarRight={popupAnchor.right} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>,
        document.body
      )}
    </>
  );
}

/* ── Menu toggle icon ── */
export function SideMenuIcon({ active = false }: { active?: boolean }) {
  const color = active ? '#006EFE' : '#29323D';
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <path d="M27.5851 12.574C28.2842 12.574 28.849 13.1273 28.849 13.8121V26.1931C28.849 26.8779 28.2842 27.4312 27.5851 27.4312H18.7378V12.574H27.5851ZM12.4184 12.574H17.474V27.4312H12.4184C11.7193 27.4312 11.1545 26.8779 11.1545 26.1931V13.8121C11.1545 13.1273 11.7193 12.574 12.4184 12.574ZM12.4184 11.3359C11.0242 11.3359 9.89062 12.4464 9.89062 13.8121V26.1931C9.89062 27.5589 11.0242 28.6693 12.4184 28.6693H27.5851C28.9793 28.6693 30.1128 27.5589 30.1128 26.1931V13.8121C30.1128 12.4464 28.9793 11.3359 27.5851 11.3359H12.4184ZM13.0503 13.8121C12.7028 13.8121 12.4184 14.0907 12.4184 14.4312C12.4184 14.7717 12.7028 15.0502 13.0503 15.0502H15.5781C15.9257 15.0502 16.2101 14.7717 16.2101 14.4312C16.2101 14.0907 15.9257 13.8121 15.5781 13.8121H13.0503ZM12.4184 16.9074C12.4184 17.2478 12.7028 17.5264 13.0503 17.5264H15.5781C15.9257 17.5264 16.2101 17.2478 16.2101 16.9074C16.2101 16.5669 15.9257 16.2883 15.5781 16.2883H13.0503C12.7028 16.2883 12.4184 16.5669 12.4184 16.9074ZM13.0503 18.7645C12.7028 18.7645 12.4184 19.0431 12.4184 19.3836C12.4184 19.724 12.7028 20.0026 13.0503 20.0026H15.5781C15.9257 20.0026 16.2101 19.724 16.2101 19.3836C16.2101 19.0431 15.9257 18.7645 15.5781 18.7645H13.0503Z" fill={color} />
    </svg>
  );
}

/* ── Chevron right ── */
function ChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M4.5 2.5L8 6L4.5 9.5" stroke="#667C98" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ── Navigation Icons (18×18, from SVG files) ── */
function HomeIcon({ active }: { active: boolean }) {
  const c = active ? '#006EFE' : '#667C98';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
      <path d="M9.16541 2.10869C9.00134 1.96377 8.75251 1.96377 8.58572 2.10869L1.14822 8.67119C0.967749 8.82979 0.948608 9.10869 1.10994 9.28916C1.27126 9.46963 1.54744 9.48877 1.7279 9.32744L2.75056 8.4251V13.8118C2.75056 15.0204 3.72947 15.9993 4.93806 15.9993H12.8131C14.0217 15.9993 15.0006 15.0204 15.0006 13.8118V8.4251L16.0232 9.32744C16.2037 9.48604 16.4799 9.46963 16.6412 9.28916C16.8025 9.10869 16.7834 8.83252 16.6029 8.67119L9.16541 2.10869ZM3.62556 13.8118V7.65127L8.87556 3.01924L14.1256 7.65127V13.8118C14.1256 14.5364 13.5377 15.1243 12.8131 15.1243H11.0631V10.7493C11.0631 10.2653 10.672 9.87432 10.1881 9.87432H7.56306C7.07908 9.87432 6.68806 10.2653 6.68806 10.7493V15.1243H4.93806C4.21345 15.1243 3.62556 14.5364 3.62556 13.8118ZM7.56306 15.1243V10.7493H10.1881V15.1243H7.56306Z" fill={c}/>
    </svg>
  );
}

function ProjectsIcon({ active }: { active: boolean }) {
  const c = active ? '#006EFE' : '#667C98';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
      <path d="M4.28571 3.85714C4.05 3.85714 3.85714 4.05 3.85714 4.28571V6.85714C3.85714 7.09286 4.05 7.28571 4.28571 7.28571H6.85714C7.09286 7.28571 7.28571 7.09286 7.28571 6.85714V4.28571C7.28571 4.05 7.09286 3.85714 6.85714 3.85714H4.28571ZM3 4.28571C3 3.57589 3.57589 3 4.28571 3H6.85714C7.56696 3 8.14286 3.57589 8.14286 4.28571V6.85714C8.14286 7.56696 7.56696 8.14286 6.85714 8.14286H4.28571C3.57589 8.14286 3 7.56696 3 6.85714V4.28571ZM4.28571 10.7143C4.05 10.7143 3.85714 10.9071 3.85714 11.1429V13.7143C3.85714 13.95 4.05 14.1429 4.28571 14.1429H6.85714C7.09286 14.1429 7.28571 13.95 7.28571 13.7143V11.1429C7.28571 10.9071 7.09286 10.7143 6.85714 10.7143H4.28571ZM3 11.1429C3 10.433 3.57589 9.85714 4.28571 9.85714H6.85714C7.56696 9.85714 8.14286 10.433 8.14286 11.1429V13.7143C8.14286 14.4241 7.56696 15 6.85714 15H4.28571C3.57589 15 3 14.4241 3 13.7143V11.1429ZM13.7143 3.85714H11.1429C10.9071 3.85714 10.7143 4.05 10.7143 4.28571V6.85714C10.7143 7.09286 10.9071 7.28571 11.1429 7.28571H13.7143C13.95 7.28571 14.1429 7.09286 14.1429 6.85714V4.28571C14.1429 4.05 13.95 3.85714 13.7143 3.85714ZM11.1429 3H13.7143C14.4241 3 15 3.57589 15 4.28571V6.85714C15 7.56696 14.4241 8.14286 13.7143 8.14286H11.1429C10.433 8.14286 9.85714 7.56696 9.85714 6.85714V4.28571C9.85714 3.57589 10.433 3 11.1429 3ZM11.1429 10.7143C10.9071 10.7143 10.7143 10.9071 10.7143 11.1429V13.7143C10.7143 13.95 10.9071 14.1429 11.1429 14.1429H13.7143C13.95 14.1429 14.1429 13.95 14.1429 13.7143V11.1429C14.1429 10.9071 13.95 10.7143 13.7143 10.7143H11.1429ZM9.85714 11.1429C9.85714 10.433 10.433 9.85714 11.1429 9.85714H13.7143C14.4241 9.85714 15 10.433 15 11.1429V13.7143C15 14.4241 14.4241 15 13.7143 15H11.1429C10.433 15 9.85714 14.4241 9.85714 13.7143V11.1429Z" fill={c}/>
    </svg>
  );
}

function LandingIcon({ active }: { active: boolean }) {
  const c = active ? '#006EFE' : '#667C98';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
      <path d="M15.2222 2.875H2.77778C2.28611 2.875 1.88889 3.26602 1.88889 3.75V9H16.1111V3.75C16.1111 3.26602 15.7139 2.875 15.2222 2.875ZM17 9V9.875V11.625C17 12.5902 16.2028 13.375 15.2222 13.375H11.0806L11.3778 15.125H13C13.2444 15.125 13.4444 15.3219 13.4444 15.5625C13.4444 15.8031 13.2444 16 13 16H11H7H5C4.75556 16 4.55556 15.8031 4.55556 15.5625C4.55556 15.3219 4.75556 15.125 5 15.125H6.62222L6.91944 13.375H2.77778C1.79722 13.375 1 12.5902 1 11.625V9.875V9V3.75C1 2.78477 1.79722 2 2.77778 2H15.2222C16.2028 2 17 2.78477 17 3.75V9ZM1.88889 9.875V11.625C1.88889 12.109 2.28611 12.5 2.77778 12.5H7.43611C7.44167 12.5 7.44722 12.5 7.45278 12.5H10.55C10.5556 12.5 10.5611 12.5 10.5667 12.5H15.2222C15.7139 12.5 16.1111 12.109 16.1111 11.625V9.875H1.88889ZM7.525 15.125H10.475L10.1778 13.375H7.81944L7.52222 15.125H7.525Z" fill={c}/>
    </svg>
  );
}

function DocsIcon({ active }: { active: boolean }) {
  const c = active ? '#006EFE' : '#667C98';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
      <path d="M13.625 14.25V7.25H10.5625C9.83789 7.25 9.25 6.66211 9.25 5.9375V2.875H5.75C5.26602 2.875 4.875 3.26602 4.875 3.75V14.25C4.875 14.734 5.26602 15.125 5.75 15.125H12.75C13.234 15.125 13.625 14.734 13.625 14.25ZM13.6113 6.375C13.5922 6.29844 13.5539 6.22734 13.4965 6.17266L10.3273 3.00352C10.2699 2.94609 10.2016 2.90781 10.125 2.88867V5.9375C10.125 6.17813 10.3219 6.375 10.5625 6.375H13.6113ZM4 3.75C4 2.78477 4.78477 2 5.75 2H10.0184C10.3656 2 10.6992 2.13945 10.9453 2.38555L14.1145 5.55195C14.3605 5.79805 14.5 6.13164 14.5 6.47891V14.25C14.5 15.2152 13.7152 16 12.75 16H5.75C4.78477 16 4 15.2152 4 14.25V3.75Z" fill={c}/>
    </svg>
  );
}

function PresentationsIcon({ active }: { active: boolean }) {
  const c = active ? '#006EFE' : '#667C98';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1.5" y="3" width="15" height="9.5" rx="1.3" stroke={c} strokeWidth="1.2" />
      <path d="M5.5 9.5L7.6 7.2L9.4 8.6L12.5 5.7" stroke={c} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 15.5H11" stroke={c} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M9 12.5V15.5" stroke={c} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function MediaIcon({ active }: { active: boolean }) {
  const c = active ? '#006EFE' : '#667C98';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3.75 3.75C3.26602 3.75 2.875 4.14102 2.875 4.625V11.007L4.72617 9.15586C5.15273 8.7293 5.84453 8.7293 6.27383 9.15586L8.125 11.007L11.7262 7.40586C12.1527 6.9793 12.8445 6.9793 13.2738 7.40586L15.125 9.25703V4.625C15.125 4.14102 14.734 3.75 14.25 3.75H3.75ZM2.875 12.243V13.375C2.875 13.859 3.26602 14.25 3.75 14.25H4.88203L7.50703 11.625L5.65586 9.77383C5.57109 9.68906 5.43164 9.68906 5.34688 9.77383L2.875 12.243ZM12.6559 8.02383C12.5711 7.93906 12.4316 7.93906 12.3469 8.02383L6.11797 14.25H14.25C14.734 14.25 15.125 13.859 15.125 13.375V10.493L12.6559 8.02383ZM2 4.625C2 3.65977 2.78477 2.875 3.75 2.875H14.25C15.2152 2.875 16 3.65977 16 4.625V13.375C16 14.3402 15.2152 15.125 14.25 15.125H3.75C2.78477 15.125 2 14.3402 2 13.375V4.625ZM6.375 5.9375C6.375 5.82147 6.32891 5.71019 6.24686 5.62814C6.16481 5.54609 6.05353 5.5 5.9375 5.5C5.82147 5.5 5.71019 5.54609 5.62814 5.62814C5.54609 5.71019 5.5 5.82147 5.5 5.9375C5.5 6.05353 5.54609 6.16481 5.62814 6.24686C5.71019 6.32891 5.82147 6.375 5.9375 6.375C6.05353 6.375 6.16481 6.32891 6.24686 6.24686C6.32891 6.16481 6.375 6.05353 6.375 5.9375ZM4.625 5.9375C4.625 5.5894 4.76328 5.25556 5.00942 5.00942C5.25556 4.76328 5.5894 4.625 5.9375 4.625C6.2856 4.625 6.61944 4.76328 6.86558 5.00942C7.11172 5.25556 7.25 5.5894 7.25 5.9375C7.25 6.2856 7.11172 6.61944 6.86558 6.86558C6.61944 7.11172 6.2856 7.25 5.9375 7.25C5.5894 7.25 5.25556 7.11172 5.00942 6.86558C4.76328 6.61944 4.625 6.2856 4.625 5.9375Z" fill={c}/>
    </svg>
  );
}

/* ── Bottom Icons (18×18, from SVG files) ── */
function LearningIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
      <path d="M15.125 9C15.125 7.37555 14.4797 5.81763 13.331 4.66897C12.1824 3.52031 10.6245 2.875 9 2.875C7.37555 2.875 5.81763 3.52031 4.66897 4.66897C3.52031 5.81763 2.875 7.37555 2.875 9C2.875 10.6245 3.52031 12.1824 4.66897 13.331C5.81763 14.4797 7.37555 15.125 9 15.125C10.6245 15.125 12.1824 14.4797 13.331 13.331C14.4797 12.1824 15.125 10.6245 15.125 9ZM2 9C2 7.14348 2.7375 5.36301 4.05025 4.05025C5.36301 2.7375 7.14348 2 9 2C10.8565 2 12.637 2.7375 13.9497 4.05025C15.2625 5.36301 16 7.14348 16 9C16 10.8565 15.2625 12.637 13.9497 13.9497C12.637 15.2625 10.8565 16 9 16C7.14348 16 5.36301 15.2625 4.05025 13.9497C2.7375 12.637 2 10.8565 2 9ZM6.61289 6.64297C6.79062 5.97031 7.39766 5.5 8.09492 5.5H9.65625C10.627 5.5 11.4062 6.29297 11.4062 7.2582C11.4062 7.91445 11.0398 8.52148 10.452 8.82227L9.4375 9.33633V9.875C9.4375 10.1156 9.24063 10.3125 9 10.3125C8.75937 10.3125 8.5625 10.1156 8.5625 9.875V9.06836C8.5625 8.9043 8.65547 8.75391 8.80039 8.67734L10.0527 8.0375C10.3453 7.88984 10.5312 7.58359 10.5312 7.25273C10.5312 6.76602 10.1375 6.36953 9.65625 6.36953H8.09492C7.79687 6.36953 7.53437 6.57187 7.46055 6.85898L7.45508 6.87812C7.39492 7.11055 7.1543 7.25273 6.92188 7.18984C6.68945 7.12695 6.54727 6.88906 6.61016 6.65664L6.61563 6.6375L6.61289 6.64297ZM8.34375 11.625C8.34375 11.451 8.41289 11.284 8.53596 11.161C8.65903 11.0379 8.82595 10.9688 9 10.9688C9.17405 10.9688 9.34097 11.0379 9.46404 11.161C9.58711 11.284 9.65625 11.451 9.65625 11.625C9.65625 11.799 9.58711 11.966 9.46404 12.089C9.34097 12.2121 9.17405 12.2812 9 12.2812C8.82595 12.2812 8.65903 12.2121 8.53596 12.089C8.41289 11.966 8.34375 11.799 8.34375 11.625Z" fill="#667C98"/>
    </svg>
  );
}

function UpgradesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
      <path d="M7.1943 6.61618L8.87341 3.15678L10.5525 6.61618C10.6783 6.87598 10.9244 7.05647 11.2116 7.10022L14.9691 7.65537L12.2398 10.3573C12.0375 10.5569 11.9445 10.844 11.9937 11.1257L12.6364 14.9406L9.28635 13.1494C9.02929 13.0126 8.72027 13.0126 8.46047 13.1494L5.10772 14.9406L5.75038 11.1257C5.79687 10.844 5.70662 10.5596 5.50426 10.3573L2.77776 7.65537L6.53524 7.10022C6.82238 7.0592 7.06851 6.87598 7.1943 6.61618ZM12.62 15.9224C12.8415 16.04 13.1095 16.0236 13.3118 15.8759C13.5142 15.7282 13.6181 15.4794 13.5771 15.2332L12.8579 10.9808L15.8989 7.96712C16.0766 7.7921 16.1368 7.5323 16.0602 7.29712C15.9836 7.06194 15.7785 6.88965 15.5324 6.85136L11.3401 6.23332L9.46411 2.36918C9.35472 2.1422 9.125 2 8.87341 2C8.62182 2 8.3921 2.1422 8.28271 2.36918L6.40671 6.23332L2.21714 6.8541C1.97102 6.88965 1.76592 7.06194 1.68935 7.29985C1.61277 7.53777 1.67567 7.79484 1.85069 7.96986L4.88895 10.9808L4.17246 15.2332C4.13144 15.4794 4.23262 15.7282 4.43772 15.8759C4.64282 16.0236 4.91083 16.04 5.1296 15.9224L8.87615 13.9206L12.6227 15.9224H12.62Z" fill="#667C98"/>
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
      <path d="M13.375 3.0966C13.375 2.89972 13.1344 2.80129 12.9977 2.94621L12.3469 3.63527C11.2012 4.84113 9.73008 5.67238 8.125 6.03058V10.8704C9.73008 11.2286 11.2012 12.0571 12.3469 13.2657L12.9977 13.9521C13.1344 14.097 13.375 13.9986 13.375 13.8017V3.0966ZM7.25 10.7228V6.17824C7.09141 6.19738 6.93281 6.20832 6.77148 6.21926L5.96211 6.26301H5.95117H5.9375H3.75C3.26602 6.26301 2.875 6.65402 2.875 7.13801V9.76301C2.875 10.247 3.26602 10.638 3.75 10.638H5.9375H5.94844H5.95938L6.77148 10.6818C6.93008 10.69 7.09141 10.7036 7.25 10.7228ZM12.3633 2.34465C13.0441 1.62551 14.25 2.10676 14.25 3.0966V13.8044C14.25 14.7943 13.0414 15.2755 12.3633 14.5564L11.7125 13.87C10.5285 12.6204 8.95078 11.822 7.25273 11.606V14.3568C7.25273 15.2017 6.56641 15.888 5.72148 15.888H5.28125C4.43633 15.888 3.75 15.2017 3.75 14.3568V11.513C2.78477 11.513 2 10.7282 2 9.76301V7.13801C2 6.17277 2.78477 5.38801 3.75 5.38801H5.92656L6.725 5.34426C8.62266 5.23762 10.4055 4.41183 11.7125 3.03371L12.3633 2.34465ZM4.625 11.513V14.3568C4.625 14.7204 4.91758 15.013 5.28125 15.013H5.71875C6.08242 15.013 6.375 14.7204 6.375 14.3568V11.5376L5.92656 11.513H4.625ZM15.5625 7.13801C15.8031 7.13801 16 7.33488 16 7.57551V9.32551C16 9.56613 15.8031 9.76301 15.5625 9.76301C15.3219 9.76301 15.125 9.56613 15.125 9.32551V7.57551C15.125 7.33488 15.3219 7.13801 15.5625 7.13801Z" fill="#667C98"/>
    </svg>
  );
}
