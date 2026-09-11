'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useFlowStore, PLAN_LABELS, manuscriptLimitFor, type PlanId } from '@/stores/flowStore';
import { useFlowEngine } from '@/hooks/useFlowEngine';
import HomePage from './home/HomePage';
import { ChatContainer } from './chat/ChatContainer';
import { OutlineView } from './outline/OutlineView';
import { BookView } from './book/BookView';
import { BookFormatView } from './book/BookFormatView';
import { GenerationTransition } from './transition/GenerationTransition';
import { AppSidebar } from './sidebar/AppSidebar';
import { AccountOverlay } from './account/AccountOverlay';

const PROMO_KEY = 'dsgn_promo_active';

function HomePageWithKey() {
  const homeKey = useFlowStore((s) => s.homeKey);
  return <HomePage key={homeKey} />;
}

export function FlowOrchestrator() {
  const currentStep = useFlowStore((s) => s.currentStep);
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);
  const { handleHeroSubmit, handleGenerateBook } = useFlowEngine();

  /* Preview switch for the viewer's plan. It replaces a toggle that swapped between two whole
     homepage components — that was an A/B of layouts, not a tier. This one writes to the single
     `currentPlan` in the store, which already drives tier badges, gate modals and allowances, so
     one click re-renders every plan-aware surface at once instead of just this screen. */
  const currentPlan = useFlowStore((s) => s.currentPlan);
  const setCurrentPlan = useFlowStore((s) => s.setCurrentPlan);
  const PREVIEW_PLANS: PlanId[] = ['standard', 'pro', 'premium'];

  React.useEffect(() => {
    const saved = localStorage.getItem('dsgn_home_plan');
    if (saved && PREVIEW_PLANS.includes(saved as PlanId)) setCurrentPlan(saved as PlanId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choosePlan = (plan: PlanId) => {
    setCurrentPlan(plan);
    localStorage.setItem('dsgn_home_plan', plan);
  };

  /* Campaign switch. The home strip only exists while a promotion is running, so previewing it
     means turning the season on rather than toggling a component. Switching it on also clears
     the per-campaign view counter — the strip caps itself at three impressions, which would
     otherwise make it vanish after the third preview and look like a bug. */
  const promoActive = useFlowStore((s) => s.promoActive);
  const setPromoActive = useFlowStore((s) => s.setPromoActive);
  const promoVariant = useFlowStore((s) => s.promoVariant);
  const setPromoVariant = useFlowStore((s) => s.setPromoVariant);

  React.useEffect(() => {
    const saved = localStorage.getItem(PROMO_KEY);
    if (saved === 'offer' || saved === 'announcement') { setPromoActive(true); setPromoVariant(saved); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* One button, three states — off, a discount offer, a product launch — because a campaign is
     one of those at a time rather than a set of independent switches. */
  const togglePromo = () => {
    const next = !promoActive ? 'offer' : promoVariant === 'offer' ? 'announcement' : 'off';
    setPromoActive(next !== 'off');
    if (next !== 'off') setPromoVariant(next);
    localStorage.setItem(PROMO_KEY, next);
    // Clear the impression cap, or the third preview would silently show nothing.
    for (const id of ['autumn-2026', 'presentations-launch-2026']) {
      localStorage.removeItem(`dsgn_promo_views_${id}`);
    }
  };

  /* Usage preview, as fractions rather than counts, because the same three states land on
     different numbers per plan — 80% is 4 generations on Standard and 8 on PRO. Premium is
     unlimited, so there's no proportion to set and the group goes inactive. */
  const usedFraction = useFlowStore((s) => s.manuscriptGenerationsUsed);
  const setState = useFlowStore.setState;
  const planLimit = manuscriptLimitFor(currentPlan);
  const meteredPlan = Number.isFinite(planLimit);
  const USAGE_STEPS: { label: string; fraction: number }[] = [
    { label: 'New', fraction: 0 },
    { label: '80%', fraction: 0.8 },
    { label: '100%', fraction: 1 },
  ];
  const activeFraction = meteredPlan ? usedFraction / planLimit : 0;

  return (
    <div className="h-full w-full flex relative">
      {/* Sidebar — pushes content when open */}
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content — takes remaining space */}
      <div className="flex-1 min-w-0 h-full relative">
        {/* My Account overlay */}
        <AccountOverlay />

        <AnimatePresence mode="wait">
          {/* Step 0: Home page with book creation options */}
          {currentStep === 0 && (
            <motion.div
              key="home"
              className="h-full"
              exit={{
                opacity: 0,
                y: -30,
                scale: 0.97,
                transition: { duration: 0.4 },
              }}
            >
              <HomePageWithKey />
            </motion.div>
          )}

          {/* Steps 1-4: Chat interface */}
          {currentStep >= 1 && currentStep <= 4 && (
            <motion.div
              key="chat"
              className="h-full"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                scale: 0.97,
                transition: { duration: 0.3 },
              }}
              transition={{ duration: 0.4 }}
            >
              <ChatContainer />
            </motion.div>
          )}

          {/* Step 6: Outline view */}
          {currentStep === 6 && (
            <motion.div
              key="outline"
              className="h-full"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                scale: 0.97,
                transition: { duration: 0.3 },
              }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <OutlineView onGenerateBook={handleGenerateBook} />
            </motion.div>
          )}

          {/* Step 8: Manuscript view */}
          {currentStep === 8 && (
            <motion.div
              key="book"
              className="h-full"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <BookView />
            </motion.div>
          )}

          {/* Step 9: Book format / download view */}
          {currentStep === 9 && (
            <motion.div
              key="book-format"
              className="h-full"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <BookFormatView />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cinematic transition overlay (Step 5 and 7) */}
        <GenerationTransition />

        {/* Plan preview — Standard (5 generations) · PRO (10) · Premium (unlimited) */}
        {currentStep === 0 && (
          <div
            className="absolute bottom-5 right-5 z-50 flex items-center"
            style={{
              gap: 2, padding: 4, borderRadius: 999,
              background: 'rgba(255,255,255,0.9)', border: '1px solid #DDE2EA',
              boxShadow: '0 2px 8px rgba(15,23,51,0.08)', backdropFilter: 'blur(8px)',
            }}
          >
            {PREVIEW_PLANS.map((plan) => {
              const active = currentPlan === plan;
              return (
                <button
                  key={plan}
                  onClick={() => choosePlan(plan)}
                  className="cursor-pointer transition-colors"
                  style={{
                    padding: '4px 12px', borderRadius: 999, border: 'none',
                    background: active ? '#EAF1FF' : 'transparent',
                    fontFamily: "'Nunito Sans', sans-serif", fontSize: 12,
                    fontWeight: active ? 700 : 600,
                    color: active ? '#006EFE' : '#8596AD',
                  }}
                >
                  {PLAN_LABELS[plan]}
                </button>
              );
            })}

            <div style={{ width: 1, height: 20, background: '#DDE2EA', margin: '0 4px' }} />

            {USAGE_STEPS.map(({ label, fraction }) => {
              const active = meteredPlan && Math.abs(activeFraction - fraction) < 0.001;
              return (
                <button
                  key={label}
                  disabled={!meteredPlan}
                  onClick={() => setState({ manuscriptGenerationsUsed: Math.round(planLimit * fraction) })}
                  className={meteredPlan ? 'cursor-pointer transition-colors' : 'transition-colors'}
                  style={{
                    padding: '4px 10px', borderRadius: 999, border: 'none',
                    background: active ? '#EAF1FF' : 'transparent',
                    fontFamily: "'Nunito Sans', sans-serif", fontSize: 12,
                    fontWeight: active ? 700 : 600,
                    color: !meteredPlan ? '#C5CDD9' : active ? '#006EFE' : '#8596AD',
                    cursor: meteredPlan ? 'pointer' : 'not-allowed',
                  }}
                  title={meteredPlan ? undefined : 'Premium includes unlimited generations'}
                >
                  {label}
                </button>
              );
            })}

            <div style={{ width: 1, height: 20, background: '#DDE2EA', margin: '0 4px' }} />

            {/* Not a segmented choice like the two groups above — a campaign is either running
                or it isn't, so this is one button that reads as on or off. */}
            <button
              onClick={togglePromo}
              className="cursor-pointer transition-colors"
              style={{
                padding: '4px 12px', borderRadius: 999, border: 'none',
                background: promoActive ? '#EAF1FF' : 'transparent',
                fontFamily: "'Nunito Sans', sans-serif", fontSize: 12,
                fontWeight: promoActive ? 700 : 600,
                color: promoActive ? '#006EFE' : '#8596AD',
              }}
              title={promoActive
                ? `Campaign running: ${promoVariant === 'offer' ? 'discount offer' : 'product launch'}. Click to cycle.`
                : 'No campaign running — the strip is hidden, which is its default. Click to preview one.'}
            >
              {!promoActive ? 'Promo' : promoVariant === 'offer' ? 'Offer' : 'Launch'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
