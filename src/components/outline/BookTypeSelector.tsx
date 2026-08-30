'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BookType } from '@/lib/types';
import { UpgradePlanModal } from '../account/MyAccountView';
import { Tooltip } from '../ui/Tooltip';

interface BookTypeSelectorProps {
  show: boolean;
  onSelect: (type: BookType) => void;
  onClose: () => void;
  /** Current account plan — gates which formats are locked. Defaults to the Standard tier. */
  plan?: 'standard' | 'pro' | 'premium' | 'agency';
}

const BOOK_TYPES: { type: BookType; title: string; description: string; requiredPlan?: 'pro' | 'premium' }[] = [
  {
    type: 'ebook',
    title: 'Ebook',
    description: 'Digital reading across devices',
  },
  {
    type: 'print',
    title: 'Print Book',
    description: 'Bring your story to life on paper',
    requiredPlan: 'premium',
  },
  {
    type: 'kindle',
    title: 'Kindle Book',
    description: 'Designed for digital reading',
    requiredPlan: 'pro',
  },
  {
    type: 'audiobook',
    title: 'Audiobook',
    description: 'Clear listening experience',
    requiredPlan: 'premium',
  },
];

const PLAN_RANK: Record<string, number> = { standard: 0, pro: 1, premium: 2, agency: 3 };
const PLAN_TINT: Record<string, { bg: string; fg: string }> = {
  pro: { bg: '#EAF1FF', fg: '#006EFE' },
  premium: { bg: '#EAF1FF', fg: '#006EFE' },
};

/* Mirrors each tier's own icon from the pricing modal (star for Pro, crown for Premium)
   so the badge tells you which plan unlocks it without reading the label underneath. */
function TierIcon({ tier, color }: { tier: 'pro' | 'premium'; color: string }) {
  if (tier === 'premium') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill={color}>
        <path d="M5 20L3 8l5.5 4.5L12 4l3.5 8.5L21 8l-2 12H5Z" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={color}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

/* ── Popup header sparkle icon (from Figma) ── */
function PopupSparkleIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 4L13.4507 11.7507C13.3202 12.1473 13.0984 12.5078 12.8031 12.8031C12.5078 13.0984 12.1473 13.3202 11.7507 13.4507L4 16L11.7507 18.5493C12.1473 18.6798 12.5078 18.9016 12.8031 19.1969C13.0984 19.4922 13.3202 19.8527 13.4507 20.2493L16 28L18.5493 20.2493C18.6798 19.8527 18.9016 19.4922 19.1969 19.1969C19.4922 18.9016 19.8527 18.6798 20.2493 18.5493L28 16L20.2493 13.4507C19.8527 13.3202 19.4922 13.0984 19.1969 12.8031C18.9016 12.5078 18.6798 12.1473 18.5493 11.7507L16 4Z" fill="url(#pi_g0)" stroke="url(#pi_g1)" strokeWidth="1.125" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 2L5.15022 4.58356C5.10673 4.71578 5.0328 4.83595 4.93437 4.93437C4.83595 5.0328 4.71578 5.10673 4.58356 5.15022L2 6L4.58356 6.84978C4.71578 6.89327 4.83595 6.9672 4.93437 7.06563C5.0328 7.16405 5.10673 7.28422 5.15022 7.41644L6 10L6.84978 7.41644C6.89327 7.28422 6.9672 7.16405 7.06563 7.06563C7.16405 6.9672 7.28422 6.89327 7.41644 6.84978L10 6L7.41644 5.15022C7.28422 5.10673 7.16405 5.0328 7.06563 4.93437C6.9672 4.83595 6.89327 4.71578 6.84978 4.58356L6 2Z" fill="url(#pi_g2)" stroke="url(#pi_g3)" strokeWidth="0.375" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M26 22L25.1502 24.5836C25.1067 24.7158 25.0328 24.8359 24.9344 24.9344C24.8359 25.0328 24.7158 25.1067 24.5836 25.1502L22 26L24.5836 26.8498C24.7158 26.8933 24.8359 26.9672 24.9344 27.0656C25.0328 27.1641 25.1067 27.2842 25.1502 27.4164L26 30L26.8498 27.4164C26.8933 27.2842 26.9672 27.1641 27.0656 27.0656C27.1641 26.9672 27.2842 26.8933 27.4164 26.8498L30 26L27.4164 25.1502C27.2842 25.1067 27.1641 25.0328 27.0656 24.9344C26.9672 24.8359 26.8933 24.7158 26.8498 24.5836L26 22Z" fill="url(#pi_g4)" stroke="url(#pi_g5)" strokeWidth="0.375" strokeLinecap="round" strokeLinejoin="round"/>
      <defs>
        <linearGradient id="pi_g0" x1="28.3864" y1="2.78745" x2="-0.682789" y2="8.38556" gradientUnits="userSpaceOnUse">
          <stop stopColor="#006EFE"/>
          <stop offset="1" stopColor="#5326BD"/>
        </linearGradient>
        <linearGradient id="pi_g1" x1="28.3864" y1="2.78745" x2="-0.682789" y2="8.38556" gradientUnits="userSpaceOnUse">
          <stop stopColor="#006EFE"/>
          <stop offset="1" stopColor="#5326BD"/>
        </linearGradient>
        <linearGradient id="pi_g2" x1="10.1288" y1="1.59582" x2="0.43907" y2="3.46185" gradientUnits="userSpaceOnUse">
          <stop stopColor="#006EFE"/>
          <stop offset="1" stopColor="#5326BD"/>
        </linearGradient>
        <linearGradient id="pi_g3" x1="10.1288" y1="1.59582" x2="0.43907" y2="3.46185" gradientUnits="userSpaceOnUse">
          <stop stopColor="#006EFE"/>
          <stop offset="1" stopColor="#5326BD"/>
        </linearGradient>
        <linearGradient id="pi_g4" x1="30.1288" y1="21.5958" x2="20.4391" y2="23.4619" gradientUnits="userSpaceOnUse">
          <stop stopColor="#006EFE"/>
          <stop offset="1" stopColor="#5326BD"/>
        </linearGradient>
        <linearGradient id="pi_g5" x1="30.1288" y1="21.5958" x2="20.4391" y2="23.4619" gradientUnits="userSpaceOnUse">
          <stop stopColor="#006EFE"/>
          <stop offset="1" stopColor="#5326BD"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ── Figma-exported SVG icons for each book type ── */
function AudiobookIcon() {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src="/audiobook-icon.svg" alt="" width={58} height={66} style={{ pointerEvents: 'none' }} />
  );
}

function EbookIcon() {
  return (
    <svg width="51" height="57" viewBox="0 0 51 57" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8.50991" y="4.6935" width="32.7122" height="46.2125" rx="2.33659" fill="url(#eb_paint0)" stroke="url(#eb_paint1)" strokeWidth="0.519242"/>
      <g filter="url(#eb_filter0)">
        <rect x="11.8828" y="8.07031" width="25.9621" height="37.3854" rx="0.634629" fill="#F6F7F9"/>
      </g>
      <rect x="11.9463" y="8.13378" width="25.8352" height="37.2585" rx="0.571166" stroke="#A3B0C2" strokeWidth="0.126926"/>
      <path d="M20.0528 16.2188V12.649H20.7586V14.0789L21.0912 12.649H21.8093L21.4097 14.2838L21.8924 16.2188H21.1521L20.7627 14.4906V16.2188H20.0528ZM21.9529 12.9897V12.3853H22.679V12.9897H21.9529ZM21.9529 16.2188V13.1763H22.679V16.2188H21.9529ZM22.9201 16.2188V13.1763H23.6462V13.5637C23.6732 13.4474 23.7233 13.3487 23.7963 13.2676C23.8707 13.1851 23.9734 13.1439 24.1046 13.1439C24.3155 13.1439 24.4683 13.2088 24.563 13.3386C24.659 13.4684 24.707 13.6462 24.707 13.872V16.2188H23.991V13.9471C23.991 13.8876 23.9788 13.8328 23.9545 13.7828C23.9302 13.7314 23.8882 13.7057 23.8287 13.7057C23.7733 13.7057 23.7321 13.7253 23.705 13.7645C23.6793 13.8024 23.6631 13.8504 23.6563 13.9085C23.6496 13.9653 23.6462 14.0221 23.6462 14.0789V16.2188H22.9201ZM25.5443 16.2512C25.4037 16.2512 25.2921 16.2255 25.2097 16.1741C25.1272 16.1227 25.0656 16.0518 25.0251 15.9612C24.9845 15.8706 24.9575 15.7644 24.9439 15.6427C24.9318 15.521 24.9257 15.3905 24.9257 15.2513V13.9288C24.9257 13.6949 24.9669 13.5056 25.0494 13.3609C25.1333 13.2162 25.2746 13.1439 25.4733 13.1439C25.6207 13.1439 25.7336 13.1756 25.8121 13.2392C25.8918 13.3014 25.9534 13.3886 25.9966 13.5008V12.649H26.7349V16.2188H25.9966V15.8963C25.9561 16.0058 25.902 16.0923 25.8344 16.1559C25.7681 16.2194 25.6714 16.2512 25.5443 16.2512ZM25.8222 15.6833C25.8912 15.6833 25.9371 15.6556 25.9601 15.6001C25.9845 15.5447 25.9966 15.4453 25.9966 15.302V14.0221C25.9966 13.9504 25.9858 13.8801 25.9642 13.8112C25.9439 13.7409 25.8979 13.7057 25.8263 13.7057C25.7478 13.7057 25.6985 13.7388 25.6782 13.8051C25.6579 13.8713 25.6478 13.9437 25.6478 14.0221V15.302C25.6478 15.5562 25.7059 15.6833 25.8222 15.6833ZM26.9678 16.2188V12.649H27.7061V16.2188H26.9678ZM28.8031 16.2512C28.5867 16.2512 28.4143 16.2106 28.2859 16.1295C28.1574 16.0484 28.0655 15.9314 28.01 15.7786C27.9546 15.6258 27.9269 15.4419 27.9269 15.2269V14.0039C27.9269 13.7213 28.008 13.5076 28.1703 13.3629C28.3325 13.2169 28.5556 13.1439 28.8396 13.1439C29.4237 13.1439 29.7158 13.4305 29.7158 14.0039V14.2249C29.7158 14.4927 29.7131 14.6725 29.7077 14.7645H28.653V15.3527C28.653 15.4068 28.6564 15.4602 28.6631 15.5129C28.6699 15.5643 28.6848 15.6069 28.7077 15.6407C28.7321 15.6745 28.7706 15.6914 28.8234 15.6914C28.8991 15.6914 28.9464 15.6589 28.9653 15.594C28.9843 15.5278 28.9937 15.4419 28.9937 15.3364V15.0444H29.7158V15.2168C29.7158 15.4439 29.6874 15.6346 29.6306 15.7888C29.5752 15.9416 29.4805 16.0572 29.3467 16.1356C29.2141 16.2127 29.0329 16.2512 28.8031 16.2512ZM28.6489 14.4034H28.9937V13.9937C28.9937 13.8842 28.9802 13.8058 28.9532 13.7584C28.9261 13.7098 28.8856 13.6854 28.8315 13.6854C28.7733 13.6854 28.728 13.7084 28.6956 13.7544C28.6645 13.8004 28.6489 13.8801 28.6489 13.9937V14.4034Z" fill="#A3B0C2"/>
      <path d="M13.9609 41.8161C13.9609 41.5293 14.1934 41.2969 14.4802 41.2969L35.2499 41.2969C35.5366 41.2969 35.7691 41.5293 35.7691 41.8161C35.7691 42.1029 35.5366 42.3354 35.2499 42.3354L14.4802 42.3354C14.1934 42.3354 13.9609 42.1029 13.9609 41.8161Z" fill="#E0E5EB"/>
      <path d="M13.9609 39.738C13.9609 39.4512 14.1934 39.2188 14.4802 39.2188L35.2499 39.2188C35.5366 39.2188 35.7691 39.4512 35.7691 39.738C35.7691 40.0248 35.5366 40.2572 35.2499 40.2572L14.4802 40.2572C14.1934 40.2572 13.9609 40.0248 13.9609 39.738Z" fill="#E0E5EB"/>
      <path d="M13.9609 37.6677C13.9609 37.3809 14.1934 37.1484 14.4802 37.1484L35.2499 37.1484C35.5366 37.1484 35.7691 37.3809 35.7691 37.6677C35.7691 37.9544 35.5366 38.1869 35.2499 38.1869L14.4802 38.1869C14.1934 38.1869 13.9609 37.9544 13.9609 37.6677Z" fill="#E0E5EB"/>
      <path d="M13.9609 35.5817C13.9609 35.295 14.1934 35.0625 14.4802 35.0625L35.2499 35.0625C35.5366 35.0625 35.7691 35.295 35.7691 35.5817C35.7691 35.8685 35.5366 36.101 35.2499 36.101L14.4802 36.101C14.1934 36.101 13.9609 35.8685 13.9609 35.5817Z" fill="#E0E5EB"/>
      <path d="M13.9609 33.5114C13.9609 33.2247 14.1934 32.9922 14.4802 32.9922L35.2499 32.9922C35.5366 32.9922 35.7691 33.2247 35.7691 33.5114C35.7691 33.7982 35.5366 34.0307 35.2499 34.0307L14.4802 34.0307C14.1934 34.0307 13.9609 33.7982 13.9609 33.5114Z" fill="#E0E5EB"/>
      <path d="M13.9609 31.4333C13.9609 31.1465 14.1934 30.9141 14.4802 30.9141L35.2499 30.9141C35.5366 30.9141 35.7691 31.1465 35.7691 31.4333C35.7691 31.7201 35.5366 31.9525 35.2499 31.9525L14.4802 31.9525C14.1934 31.9525 13.9609 31.7201 13.9609 31.4333Z" fill="#E0E5EB"/>
      <path d="M13.9609 29.3474C13.9609 29.0606 14.1934 28.8281 14.4802 28.8281L35.2499 28.8281C35.5366 28.8281 35.7691 29.0606 35.7691 29.3474C35.7691 29.6341 35.5366 29.8666 35.2499 29.8666L14.4802 29.8666C14.1934 29.8666 13.9609 29.6341 13.9609 29.3474Z" fill="#E0E5EB"/>
      <path d="M13.9609 27.2771C13.9609 26.9903 14.1934 26.7578 14.4802 26.7578L35.2499 26.7578C35.5366 26.7578 35.7691 26.9903 35.7691 27.2771C35.7691 27.5638 35.5366 27.7963 35.2499 27.7963L14.4802 27.7963C14.1934 27.7963 13.9609 27.5638 13.9609 27.2771Z" fill="#E0E5EB"/>
      <path d="M13.9609 25.1989C13.9609 24.9122 14.1934 24.6797 14.4802 24.6797L35.2499 24.6797C35.5366 24.6797 35.7691 24.9122 35.7691 25.1989C35.7691 25.4857 35.5366 25.7182 35.2499 25.7182L14.4802 25.7182C14.1934 25.7182 13.9609 25.4857 13.9609 25.1989Z" fill="#E0E5EB"/>
      <path d="M13.9609 23.1208C13.9609 22.834 14.1934 22.6016 14.4802 22.6016L35.2499 22.6016C35.5366 22.6016 35.7691 22.834 35.7691 23.1208C35.7691 23.4076 35.5366 23.64 35.2499 23.64L14.4802 23.64C14.1934 23.64 13.9609 23.4076 13.9609 23.1208Z" fill="#E0E5EB"/>
      <path d="M13.9609 21.0427C13.9609 20.7559 14.1934 20.5234 14.4802 20.5234L35.2499 20.5234C35.5366 20.5234 35.7691 20.7559 35.7691 21.0427C35.7691 21.3294 35.5366 21.5619 35.2499 21.5619L14.4802 21.5619C14.1934 21.5619 13.9609 21.3294 13.9609 21.0427Z" fill="#E0E5EB"/>
      <g filter="url(#eb_filter1)">
        <path d="M21.6914 48.3396C21.6914 47.6386 22.2597 47.0703 22.9607 47.0703L26.7684 47.0703C27.4694 47.0703 28.0377 47.6386 28.0377 48.3396C28.0377 49.0406 27.4694 49.6088 26.7684 49.6088L22.9607 49.6088C22.2597 49.6088 21.6914 49.0406 21.6914 48.3396Z" fill="#A3B0C2"/>
      </g>
      <defs>
        <filter id="eb_filter0" x="11.8828" y="8.07031" width="25.9609" height="37.3828" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix"/>
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
          <feOffset/>
          <feGaussianBlur stdDeviation="0.126926"/>
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>
          <feBlend mode="normal" in2="shape" result="effect1"/>
        </filter>
        <filter id="eb_filter1" x="21.6914" y="47.0703" width="6.34766" height="2.53906" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix"/>
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
          <feOffset/>
          <feGaussianBlur stdDeviation="0.155773"/>
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0"/>
          <feBlend mode="normal" in2="shape" result="effect1"/>
        </filter>
        <linearGradient id="eb_paint0" x1="24.866" y1="4.95313" x2="41.1796" y2="52.6961" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E0E5EB"/>
          <stop offset="1" stopColor="#C2CBD6"/>
        </linearGradient>
        <linearGradient id="eb_paint1" x1="17.4909" y1="4.20317" x2="24.661" y2="50.678" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C2CBD6"/>
          <stop offset="1" stopColor="#A3B0C2"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

function PrintBookIcon() {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src="/print-book-icon.svg" alt="" width={50} height={57} style={{ pointerEvents: 'none' }} />
  );
}

function KindleIcon() {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src="/ebook-icon.svg" alt="" width={58} height={66} style={{ pointerEvents: 'none' }} />
  );
}

const ICONS: Record<BookType, () => React.JSX.Element> = {
  audiobook: AudiobookIcon,
  ebook: KindleIcon,
  print: PrintBookIcon,
  kindle: EbookIcon,
};

export function BookTypeSelector({ show, onSelect, onClose, plan = 'standard' }: BookTypeSelectorProps) {
  const [hoveredType, setHoveredType] = useState<BookType | null>(null);
  const [upgradeCtx, setUpgradeCtx] = useState<{ message: string; planId: 'pro' | 'premium' } | null>(null);

  const handleCardClick = (bt: typeof BOOK_TYPES[number]) => {
    const isLocked = bt.requiredPlan && PLAN_RANK[plan] < PLAN_RANK[bt.requiredPlan];
    if (isLocked && bt.requiredPlan) {
      setUpgradeCtx({ message: `Unlock the ${bt.title} format`, planId: bt.requiredPlan });
      return;
    }
    onSelect(bt.type);
  };

  if (upgradeCtx) {
    return (
      <UpgradePlanModal
        onClose={() => setUpgradeCtx(null)}
        currentPlanId={plan}
        contextMessage={upgradeCtx.message}
        highlightPlanId={upgradeCtx.planId}
      />
    );
  }

  return (
    <AnimatePresence>
      {show && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={onClose}
          >
            <div
              className="bg-white rounded-3xl w-full relative"
              style={{
                maxWidth: 800,
                padding: '48px 72px 40px',
                boxShadow: '0px 8px 48px rgba(143, 132, 171, 0.2)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button — top right */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 flex items-center justify-center w-[18px] h-[18px] cursor-pointer text-text-tertiary hover:text-text-secondary transition-colors"
                aria-label="Close"
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1L14 14M14 1L1 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Header */}
              <div className="text-center mb-8">
                <h2 className="text-[24px] font-semibold gradient-text" style={{ fontFamily: 'var(--font-nunito-sans)' }}>Choose your book format</h2>
                <p className="text-[16px] font-normal text-text-secondary" style={{ fontFamily: 'var(--font-nunito-sans)', marginTop: 8 }}>
                  Select the first format you want to create from your manuscript
                </p>
              </div>

              {/* Cards grid — 4 columns */}
              <div className="flex justify-center" style={{ gap: 16 }}>
                {BOOK_TYPES.map((bt, index) => {
                  const Icon = ICONS[bt.type];
                  const isHovered = hoveredType === bt.type;
                  const isLocked = !!bt.requiredPlan && PLAN_RANK[plan] < PLAN_RANK[bt.requiredPlan];

                  return (
                    <motion.button
                      key={bt.type}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        transition: { duration: 0.25, delay: index * 0.06 },
                      }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleCardClick(bt)}
                      onMouseEnter={() => setHoveredType(bt.type)}
                      onMouseLeave={() => setHoveredType(null)}
                      className="flex flex-col items-center text-center cursor-pointer overflow-hidden relative"
                      style={{
                        width: 146,
                        minWidth: 146,
                        height: 170,
                        border: isHovered ? '1.5px solid #006EFE' : '1.5px solid transparent',
                        boxShadow: isHovered
                          ? '0 4px 16px rgba(0, 110, 254, 0.08)'
                          : '0px 1.6px 16px #E0E5EB',
                        background: '#FFFFFF',
                        borderRadius: 9.6,
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                      }}
                    >
                      {isLocked && bt.requiredPlan && (
                        <div
                          className="absolute flex items-center justify-center"
                          style={{ top: 10, right: 10, width: 22, height: 22, borderRadius: '50%', background: PLAN_TINT[bt.requiredPlan].bg }}
                        >
                          <Tooltip label={`Requires ${bt.requiredPlan === 'pro' ? 'Pro' : 'Premium'}`} position="top">
                            <TierIcon tier={bt.requiredPlan} color={PLAN_TINT[bt.requiredPlan].fg} />
                          </Tooltip>
                        </div>
                      )}

                      {/* Inner content — shifts up on hover to reveal description */}
                      <div
                        className="flex flex-col items-center justify-center flex-1 w-full px-3"
                        style={{
                          transform: isHovered ? 'translateY(-10px)' : 'translateY(0)',
                          transition: 'transform 0.25s ease',
                        }}
                      >
                        {/* Icon */}
                        <div className="flex items-center justify-center" style={{ height: 72 }}>
                          <Icon />
                        </div>

                        {/* Title */}
                        <p
                          className="text-[16px] font-normal mt-2"
                          style={{
                            fontFamily: 'var(--font-nunito-sans)',
                            color: isHovered ? '#006EFE' : '#15191F',
                            transition: 'color 0.2s',
                          }}
                        >
                          {bt.title}
                        </p>


                        {/* Description — revealed on hover. Animates via grid-template-rows
                            (0fr/1fr) instead of max-height, so the browser only recomputes
                            this grid track rather than the whole layout on every frame. */}
                        <div
                          className="mt-1"
                          style={{
                            display: 'grid',
                            gridTemplateRows: isHovered ? '1fr' : '0fr',
                            opacity: isHovered ? 1 : 0,
                            transition: 'opacity 0.25s ease, grid-template-rows 0.25s ease',
                          }}
                        >
                          <p
                            className="text-[12px] font-normal text-text-tertiary leading-tight overflow-hidden"
                            style={{ fontFamily: 'var(--font-nunito-sans)' }}
                          >
                            {bt.description}
                          </p>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* Footer hint */}
              <p
                className="text-[12px] text-text-muted text-center mt-8"
                style={{ fontFamily: 'var(--font-nunito-sans)', lineHeight: '16px' }}
              >
                You can create other formats later, too.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
