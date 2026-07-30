'use client';

import { useCallback } from 'react';
import { usePresentationChatStore } from '@/stores/presentationChatStore';
import { usePresentationFlowStore } from '@/stores/presentationFlowStore';
import { getMockSlidesForTopic } from '@/lib/presentationMocks';
import { buildPresentationSubtitle, deriveTopicHeadline, extractAudienceFromPrompt, getPresentationQuestion, PRESENTATION_HERO_PLACEHOLDER } from '@/lib/presentationChatMocks';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function usePresentationFlowEngine() {
  const addMessage = usePresentationChatStore((s) => s.addMessage);
  const setStep = usePresentationChatStore((s) => s.setStep);
  const setUserResponse = usePresentationChatStore((s) => s.setUserResponse);
  const setAiTyping = usePresentationChatStore((s) => s.setAiTyping);
  const setReady = usePresentationChatStore((s) => s.setReady);
  const setSlides = usePresentationFlowStore((s) => s.setSlides);
  const setPresentationTitle = usePresentationFlowStore((s) => s.setPresentationTitle);
  const setPresentationSubtitle = usePresentationFlowStore((s) => s.setPresentationSubtitle);

  /* Entry prompt → Step 1 question (Audience) */
  const handleHeroSubmit = useCallback(
    async (topic: string) => {
      // Guard against double-submission (React Strict Mode / rapid clicks)
      if (usePresentationChatStore.getState().currentStep !== 0) return;

      addMessage({
        role: 'ai',
        content: '',
        type: 'structured',
        structured: { heading: PRESENTATION_HERO_PLACEHOLDER, body: '' },
        stepSlot: 1,
      });
      setStep(1);

      addMessage({ role: 'user', content: topic, type: 'text' });
      setUserResponse('topic', topic);

      // Already told us who this is for? Don't ask again — skip straight to the goal question.
      const detectedAudience = extractAudienceFromPrompt(topic);
      if (detectedAudience) setUserResponse('audience', detectedAudience);

      setAiTyping(true);
      await delay(1200 + Math.random() * 800);
      setAiTyping(false);

      if (detectedAudience) {
        addMessage({
          role: 'ai',
          content: `Got it — I'll tailor this for ${detectedAudience}, no need to ask.`,
          type: 'text',
        });
        await delay(500);
        addMessage({
          role: 'ai',
          content: '',
          type: 'structured',
          structured: getPresentationQuestion(2),
          stepSlot: 3,
        });
        setStep(3);
      } else {
        addMessage({
          role: 'ai',
          content: '',
          type: 'structured',
          structured: getPresentationQuestion(1),
          stepSlot: 2,
        });
        setStep(2);
      }
    },
    [addMessage, setStep, setUserResponse, setAiTyping]
  );

  /* Chat steps 2-4 (Audience → Goal → Style → generate) */
  const handleUserMessage = useCallback(
    async (text: string) => {
      const step = usePresentationChatStore.getState().currentStep;

      addMessage({ role: 'user', content: text, type: 'text' });

      const responseKeys: Record<number, 'audience' | 'goal' | 'style'> = {
        2: 'audience',
        3: 'goal',
        4: 'style',
      };
      if (responseKeys[step]) setUserResponse(responseKeys[step], text);

      setAiTyping(true);
      await delay(1200 + Math.random() * 800);
      setAiTyping(false);

      if (step === 4) {
        addMessage({
          role: 'ai',
          content: "Perfect — I've got everything I need. Putting your outline together…",
          type: 'text',
        });
        await delay(900);
        setStep(5);

        setAiTyping(true);
        await delay(2000);
        setAiTyping(false);

        const { topic, audience, goal, style } = usePresentationChatStore.getState().userResponses;
        const headline = deriveTopicHeadline(topic || '');
        setPresentationTitle(headline);
        setPresentationSubtitle(buildPresentationSubtitle({ audience, goal }));
        setSlides(getMockSlidesForTopic(headline, { audience, goal, style }));
        setReady(true);
        setStep(6);
      } else {
        addMessage({
          role: 'ai',
          content: '',
          type: 'structured',
          structured: getPresentationQuestion(step),
          stepSlot: step + 1,
        });
        setStep(step + 1);
      }
    },
    [addMessage, setStep, setUserResponse, setAiTyping, setSlides, setReady, setPresentationTitle, setPresentationSubtitle]
  );

  return { handleHeroSubmit, handleUserMessage };
}
