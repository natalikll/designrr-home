'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import ContentEditable from 'react-contenteditable';
import { chapterVariants } from '@/lib/animations';
import { useFlowStore } from '@/stores/flowStore';
import type { ChapterOutline, SubChapter } from '@/lib/types';

interface SubChapterItemProps {
  sub: SubChapter;
  chapterId: string;
}

function SubChapterItem({ sub, chapterId }: SubChapterItemProps) {
  const [subTitle, setSubTitle] = useState(sub.title);
  const [subDesc, setSubDesc] = useState(sub.description);
  const updateSubTitle = useFlowStore((s) => s.updateSubChapterTitle);
  const updateSubDesc = useFlowStore((s) => s.updateSubChapterDescription);

  const handleSubTitleChange = useCallback(
    (evt: { target: { value: string } }) => {
      setSubTitle(evt.target.value);
      updateSubTitle(chapterId, sub.id, evt.target.value);
    },
    [chapterId, sub.id, updateSubTitle]
  );

  const handleSubDescChange = useCallback(
    (evt: { target: { value: string } }) => {
      setSubDesc(evt.target.value);
      updateSubDesc(chapterId, sub.id, evt.target.value);
    },
    [chapterId, sub.id, updateSubDesc]
  );

  return (
    <div className="py-1.5">
      <div className="text-sm text-text-secondary leading-relaxed flex flex-wrap items-baseline">
        <ContentEditable
          html={subTitle}
          onChange={handleSubTitleChange}
          tagName="span"
          className="font-semibold text-text-primary px-0.5 -mx-0.5 inline"
        />
        &nbsp;
        <ContentEditable
          html={subDesc}
          onChange={handleSubDescChange}
          tagName="span"
          className="text-text-secondary px-0.5 -mx-0.5 inline"
        />
      </div>
    </div>
  );
}

interface ChapterItemProps {
  chapter: ChapterOutline;
}

export function ChapterItem({ chapter }: ChapterItemProps) {
  const [title, setTitle] = useState(chapter.title);
  const [description, setDescription] = useState(chapter.description);
  const updateTitle = useFlowStore((s) => s.updateChapterTitle);
  const updateDescription = useFlowStore((s) => s.updateChapterDescription);

  const handleTitleChange = useCallback(
    (evt: { target: { value: string } }) => {
      setTitle(evt.target.value);
      updateTitle(chapter.id, evt.target.value);
    },
    [chapter.id, updateTitle]
  );

  const handleDescChange = useCallback(
    (evt: { target: { value: string } }) => {
      setDescription(evt.target.value);
      updateDescription(chapter.id, evt.target.value);
    },
    [chapter.id, updateDescription]
  );

  return (
    <motion.div
      id={`chapter-${chapter.id}`}
      variants={chapterVariants}
      className="mb-8 pb-8 border-b border-border-light last:border-b-0"
    >
      {/* Chapter header: title + page range */}
      <div className="flex items-baseline justify-between mb-1.5">
        <ContentEditable
          html={title}
          onChange={handleTitleChange}
          tagName="h3"
          className="text-[16px] font-semibold text-text-primary uppercase tracking-wide px-1 -mx-1"
        />
        {chapter.pageRange && (
          <span className="text-sm font-medium text-accent flex-shrink-0 ml-4">
            ({chapter.pageRange})
          </span>
        )}
      </div>

      {/* Description: Purpose/Goal one-liner */}
      <ContentEditable
        html={description}
        onChange={handleDescChange}
        tagName="p"
        className="text-sm text-text-tertiary mb-4 px-1 -mx-1"
      />

      {/* Sub-chapters with single continuous left border */}
      {chapter.subChapters.length > 0 && (
        <div
          className="pl-4"
          style={{
            borderLeft: '2px solid #E0E5EB',
          }}
        >
          {chapter.subChapters.map((sub) => (
            <SubChapterItem key={sub.id} sub={sub} chapterId={chapter.id} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
