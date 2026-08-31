'use client';

import { useCallback } from 'react';
import { useFlowStore } from '@/stores/flowStore';
import {
  getStructuredAiResponse,
  getMockOutline,
  getMockBook,
  HERO_PLACEHOLDER,
} from '@/lib/mockResponses';
import type { FlowStep, BookDirection } from '@/lib/types';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useFlowEngine() {
  const addMessage = useFlowStore((s) => s.addMessage);
  const setStep = useFlowStore((s) => s.setStep);
  const setUserResponse = useFlowStore((s) => s.setUserResponse);
  const setAiTyping = useFlowStore((s) => s.setAiTyping);
  const selectDirection = useFlowStore((s) => s.selectDirection);
  const setOutline = useFlowStore((s) => s.setOutline);
  const setBook = useFlowStore((s) => s.setBook);
  const setTransitioning = useFlowStore((s) => s.setTransitioning);

  /* Hero screen → Step 1 */
  const handleHeroSubmit = useCallback(
    async (text: string) => {
      // Guard against double-submission (React Strict Mode / rapid clicks)
      if (useFlowStore.getState().currentStep !== 0) return;

      // First, show the AI question that matches the homepage prompt
      addMessage({
        role: 'ai',
        content: '',
        type: 'structured',
        structured: {
          heading: HERO_PLACEHOLDER,
          body: '',
        },
      });
      setStep(1);

      // Then show user's answer
      addMessage({ role: 'user', content: text, type: 'text' });
      setUserResponse('aboutYourself', text);

      setAiTyping(true);
      await delay(1500 + Math.random() * 1000);
      setAiTyping(false);

      // AI sends structured message for step 2 question
      const structured = getStructuredAiResponse(1);
      addMessage({
        role: 'ai',
        content: '',
        type: 'structured',
        structured,
      });
      setStep(2);
    },
    [addMessage, setStep, setUserResponse, setAiTyping]
  );

  /* Chat steps 2-3 */
  const handleUserMessage = useCallback(
    async (text: string) => {
      const step = useFlowStore.getState().currentStep;

      addMessage({ role: 'user', content: text, type: 'text' });

      // Record response
      const responseKeys: Record<number, 'uniqueApproach' | 'yourStory'> = {
        2: 'uniqueApproach',
        3: 'yourStory',
      };
      if (responseKeys[step]) {
        setUserResponse(responseKeys[step], text);
      }

      setAiTyping(true);
      await delay(1500 + Math.random() * 1000);
      setAiTyping(false);

      if (step === 3) {
        // After step 3, show direction prompt + cards
        const structured = getStructuredAiResponse(3);
        addMessage({
          role: 'ai',
          content: '',
          type: 'structured',
          structured,
        });
        await delay(400);
        addMessage({ role: 'ai', content: '', type: 'direction-cards' });
        setStep(4);
      } else {
        // Send structured AI response for next question
        const structured = getStructuredAiResponse(step);
        addMessage({
          role: 'ai',
          content: '',
          type: 'structured',
          structured,
        });
        setStep((step + 1) as FlowStep);
      }
    },
    [addMessage, setStep, setUserResponse, setAiTyping]
  );

  /* Direction selection → Outline generation */
  const handleDirectionSelect = useCallback(
    async (direction: BookDirection) => {
      selectDirection(direction);
      addMessage({
        role: 'user',
        content: `I'll go with: "${direction.title}"`,
        type: 'text',
      });

      setAiTyping(true);
      await delay(1000);
      setAiTyping(false);

      addMessage({
        role: 'ai',
        content: "Perfect, I've got everything I need to generate your outline. Working on it now\u2026",
        type: 'text',
      });

      await delay(1200);

      setStep(5);
      setTransitioning(true, 'outline');

      await delay(3000);

      const outline = getMockOutline(direction);
      setOutline(outline);
      setTransitioning(false);
      setStep(6);
    },
    [addMessage, setStep, selectDirection, setAiTyping, setOutline, setTransitioning]
  );

  /* Outline → generate manuscript directly (no book type selector) */
  const handleGenerateBook = useCallback(async () => {
    const outline = useFlowStore.getState().generatedOutline;
    if (!outline) return;

    useFlowStore.getState().incrementManuscriptGenerations();
    setStep(7);
    setTransitioning(true, 'book');

    await delay(5000);

    const book = getMockBook(outline);
    setBook(book);
    setTransitioning(false);
    setStep(8);
  }, [setStep, setTransitioning, setBook]);

  return {
    handleHeroSubmit,
    handleUserMessage,
    handleDirectionSelect,
    handleGenerateBook,
  };
}
