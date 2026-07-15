'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useFlowStore } from '@/stores/flowStore';
import ImportDocxModal from './ImportDocxModal';
import ImportGoogleDocModal from './ImportGoogleDocModal';

const cards = [
  {
    key: 'docx',
    title: 'Import DOCX',
    subtitle: 'Upload Word Doc',
    icon: '/assets/icon-import-docx.svg',
  },
  {
    key: 'gdoc',
    title: 'Import Google Doc',
    subtitle: 'Connect from Drive',
    icon: '/assets/icon-import-gdoc.svg',
  },
  {
    key: 'scratch',
    title: 'Start from scratch',
    subtitle: 'Begin with a blank',
    icon: '/assets/icon-import-scratch.svg',
  },
];

const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.5,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
};

function ImportCard({ card, onClick }: { card: typeof cards[number]; onClick?: () => void }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.button
      type="button"
      variants={item}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex shrink-0 cursor-pointer items-center gap-2 overflow-hidden rounded-[8px] border border-[#E0E5EB] bg-white pr-4"
      style={{
        width: 250,
        height: 72,
        boxShadow: isHovered
          ? '0px 7px 22px 0px rgba(62, 57, 205, 0.15)'
          : '0px 0px 0px 0px rgba(62, 57, 205, 0)',
        transition: 'box-shadow 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {/* Icon */}
      <div className="shrink-0 overflow-hidden" style={{ width: 72, height: 72 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.icon}
          alt=""
          style={{ width: 72, height: 72, transform: 'translateY(4px)' }}
        />
      </div>

      {/* Text */}
      <div className="flex flex-col items-start whitespace-nowrap text-left" style={{ gap: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 600, lineHeight: '18px', color: '#15191F', fontFamily: "'Nunito Sans', sans-serif" }}>
          {card.title}
        </span>
        <span style={{ fontSize: 12, fontWeight: 400, lineHeight: '16px', color: '#667C98', fontFamily: "'Nunito Sans', sans-serif" }}>
          {card.subtitle}
        </span>
      </div>
    </motion.button>
  );
}

export default function ImportCards() {
  const [docxModalOpen, setDocxModalOpen] = useState(false);
  const [gdocModalOpen, setGdocModalOpen] = useState(false);
  const { setBook, setStep, setImporting } = useFlowStore();

  const handleStartFromScratch = () => {
    setBook({
      title: 'Untitled Book',
      subtitle: '',
      chapters: [
        {
          id: 'section-1',
          number: 1,
          title: 'Section 1',
          content: '',
        },
      ],
    });
    setStep(8);
  };

  const handleDocxImport = (files: File[]) => {
    setDocxModalOpen(false);
    setImporting(true);
    setStep(8);

    // Simulate processing delay, then reveal the real book
    setTimeout(() => {
      const bookTitle = files.length === 1
        ? files[0].name.replace(/\.(doc|docx|rtf)$/i, '')
        : 'Imported Manuscript';

      const chapters = files.map((file, i) => ({
        id: `section-${i + 1}`,
        number: i + 1,
        title: files.length === 1 ? 'Section 1' : file.name.replace(/\.(doc|docx|rtf)$/i, ''),
        content: getMockImportedContent(file.name),
      }));

      setBook({ title: bookTitle, subtitle: '', chapters });
      setImporting(false);
    }, 3200);
  };

  const handleGdocImport = (urls: string[]) => {
    setGdocModalOpen(false);
    setImporting(true);
    setStep(8);

    // Simulate processing delay, then reveal the real book
    setTimeout(() => {
      const bookTitle = urls.length === 1 ? 'Google Doc Import' : 'Imported Manuscript';

      const chapters = urls.map((url, i) => ({
        id: `section-${i + 1}`,
        number: i + 1,
        title: `Section ${i + 1}`,
        content: getMockImportedContent(url),
      }));

      setBook({ title: bookTitle, subtitle: '', chapters });
      setImporting(false);
    }, 3200);
  };

  const handleCardClick = (key: string) => {
    if (key === 'docx') setDocxModalOpen(true);
    if (key === 'gdoc') setGdocModalOpen(true);
    if (key === 'scratch') handleStartFromScratch();
  };

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={container}
      className="mx-auto w-full max-w-[780px]"
    >
      {/* Divider with centered text */}
      <div className="mb-8 flex items-center" style={{ gap: 16 }}>
        <div className="divider-line flex-1" />
        <span
          className="shrink-0 whitespace-nowrap font-normal"
          style={{ fontSize: 14, lineHeight: '18px', color: '#667C98' }}
        >
          Or choose another way to begin
        </span>
        <div className="divider-line-right flex-1" />
      </div>

      {/* Cards row — 3 cards at 222px each, evenly distributed in 690px */}
      <div className="flex items-center justify-between">
        {cards.map((card) => (
          <ImportCard key={card.key} card={card} onClick={() => handleCardClick(card.key)} />
        ))}
      </div>

      {/* More ways to create */}
      <motion.p
        variants={item}
        className="mt-8 text-center font-normal"
        style={{ fontSize: 14, lineHeight: '18px', color: '#667C98' }}
      >
        More ways to create -{' '}
        <a
          href="#more"
          className="underline underline-offset-2 transition-colors hover:text-text-primary"
          style={{ color: '#3D4A5C' }}
        >
          video import, podcast, PDF flipbook
        </a>
      </motion.p>

      {/* Import DOCX Modal */}
      <ImportDocxModal
        isOpen={docxModalOpen}
        onClose={() => setDocxModalOpen(false)}
        onNext={handleDocxImport}
      />

      {/* Import Google Doc Modal */}
      <ImportGoogleDocModal
        isOpen={gdocModalOpen}
        onClose={() => setGdocModalOpen(false)}
        onNext={handleGdocImport}
      />
    </motion.div>
  );
}

/** Generates placeholder content simulating an imported document */
function getMockImportedContent(source: string): string {
  const paragraphs = [
    'The journey of self-discovery is one that many embark upon but few truly complete. In this section, we explore the foundational principles that guide us toward understanding our deepest motivations and aspirations. Through careful reflection and intentional practice, we can begin to uncover the patterns that shape our daily lives.',
    'Research has shown that individuals who engage in regular self-reflection are more likely to achieve their long-term goals. This finding, published in the Journal of Personality and Social Psychology, suggests that the simple act of writing down our thoughts can have a profound impact on our trajectory.',
    'Consider the story of Maria, a teacher from Portland who transformed her approach to education after spending three months journaling about her experiences in the classroom. "I realized that I had been teaching the way I was taught, not the way my students needed to learn," she recalls. This insight led her to develop a new curriculum that increased student engagement by 40%.',
    'The science behind habit formation tells us that it takes approximately 66 days to establish a new behavior as automatic. This means that the first two months of any new practice are critical — they represent the period during which our brains are actively creating new neural pathways.',
    'As we move forward, it is important to remember that progress is rarely linear. There will be setbacks, moments of doubt, and times when the path ahead seems unclear. These are not signs of failure; they are natural parts of the growth process. The key is to maintain consistency even when motivation wanes.',
    'In the following sections, we will examine specific strategies for maintaining momentum, building accountability structures, and measuring progress in meaningful ways. Each strategy has been tested with hundreds of participants in our research program, and the results speak for themselves.',
  ];

  // Use source string to seed a deterministic selection
  const seed = source.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const selected = paragraphs.sort(() => (seed % 3) - 1);

  return selected.map((p) => `<p>${p}</p>`).join('\n');
}
