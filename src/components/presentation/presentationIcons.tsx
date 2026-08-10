/* ───────────────────────── Shared icons + tokens ─────────────────────────
   Split out of PresentationEditorView so components like FilmstripItem can
   use them without importing back from that (very large) page component. */

export const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

export function DuplicateIcon({ color = '#3D4A5C' }: { color?: string }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
}

export function TrashIcon({ color = '#E54B4B' }: { color?: string }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 6V4a2 2 0 0 1 4 0v2"/><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>;
}

export function AISparkleIcon({ size = 18 }: { size?: number }) {
  // The official Wordgenie mark — same source as public/assets/wordgenie-icon.svg (used in the "by New Wordgenie" lockup).
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 4L13.4507 11.7507C13.3202 12.1473 13.0984 12.5078 12.8031 12.8031C12.5078 13.0984 12.1473 13.3202 11.7507 13.4507L4 16L11.7507 18.5493C12.1473 18.6798 12.5078 18.9016 12.8031 19.1969C13.0984 19.4922 13.3202 19.8527 13.4507 20.2493L16 28L18.5493 20.2493C18.6798 19.8527 18.9016 19.4922 19.1969 19.1969C19.4922 18.9016 19.8527 18.6798 20.2493 18.5493L28 16L20.2493 13.4507C19.8527 13.3202 19.4922 13.0984 19.1969 12.8031C18.9016 12.5078 18.6798 12.1473 18.5493 11.7507L16 4Z" fill="url(#wgIconGradA)" stroke="url(#wgIconGradA)" strokeWidth="1.125" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 2L5.15022 4.58356C5.10673 4.71578 5.0328 4.83595 4.93437 4.93437C4.83595 5.0328 4.71578 5.10673 4.58356 5.15022L2 6L4.58356 6.84978C4.71578 6.89327 4.83595 6.9672 4.93437 7.06563C5.0328 7.16405 5.10673 7.28422 5.15022 7.41644L6 10L6.84978 7.41644C6.89327 7.28422 6.9672 7.16405 7.06563 7.06563C7.16405 6.9672 7.28422 6.89327 7.41644 6.84978L10 6L7.41644 5.15022C7.28422 5.10673 7.16405 5.0328 7.06563 4.93437C6.9672 4.83595 6.89327 4.71578 6.84978 4.58356L6 2Z" fill="url(#wgIconGradB)" stroke="url(#wgIconGradB)" strokeWidth="0.375" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M26 22L25.1502 24.5836C25.1067 24.7158 25.0328 24.8359 24.9344 24.9344C24.8359 25.0328 24.7158 25.1067 24.5836 25.1502L22 26L24.5836 26.8498C24.7158 26.8933 24.8359 26.9672 24.9344 27.0656C25.0328 27.1641 25.1067 27.2842 25.1502 27.4164L26 30L26.8498 27.4164C26.8933 27.2842 26.9672 27.1641 27.0656 27.0656C27.1641 26.9672 27.2842 26.8933 27.4164 26.8498L30 26L27.4164 25.1502C27.2842 25.1067 27.1641 25.0328 27.0656 24.9344C26.9672 24.8359 26.8933 24.7158 26.8498 24.5836L26 22Z" fill="url(#wgIconGradC)" stroke="url(#wgIconGradC)" strokeWidth="0.375" strokeLinecap="round" strokeLinejoin="round"/>
      <defs>
        <linearGradient id="wgIconGradA" x1="28.3864" y1="2.78745" x2="-0.682789" y2="8.38556" gradientUnits="userSpaceOnUse">
          <stop stopColor="#006EFE"/><stop offset="1" stopColor="#5326BD"/>
        </linearGradient>
        <linearGradient id="wgIconGradB" x1="10.1288" y1="1.59582" x2="0.43907" y2="3.46185" gradientUnits="userSpaceOnUse">
          <stop stopColor="#006EFE"/><stop offset="1" stopColor="#5326BD"/>
        </linearGradient>
        <linearGradient id="wgIconGradC" x1="30.1288" y1="21.5958" x2="20.4391" y2="23.4619" gradientUnits="userSpaceOnUse">
          <stop stopColor="#006EFE"/><stop offset="1" stopColor="#5326BD"/>
        </linearGradient>
      </defs>
    </svg>
  );
}
