'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useFlowStore, planRank, type PlanId } from '@/stores/flowStore';
import { UpgradePlanModal } from '@/components/account/MyAccountView';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

/* Campaign-only, never permanent.
 *
 * Every top-of-app strip we found serves someone who isn't paying — a free plan (Teachable,
 * Mobbin), a trial running out (Airtable, Circle, Dialpad, Ferndesk), or a lapsed subscription
 * (ManyChat) — or a limited-time offer with an end date (Runway, Emergent, Codecademy).
 * Standard customers are none of those: they have paid, and their plan doesn't expire. We found
 * no precedent for a permanent strip aimed at a paying customer, so this exists only while a
 * campaign is running.
 *
 * That also puts it back inside the documented rules. Polaris asks that banners be shown rarely
 * and reserved for the most important information; an offer with an end date clears that bar in a
 * way "we have better plans" never did. And a surface that appears occasionally has some chance
 * of being seen, where a permanent one is what NN/g's banner-blindness work describes people
 * learning to skip.
 *
 * Set ACTIVE_PROMO to null between campaigns and nothing renders. Changing `id` resets everyone's
 * view count, so a new campaign gets a fresh three impressions rather than inheriting the last
 * one's exhaustion.
 */
type PromoKind = 'offer' | 'announcement';

interface Promo {
  /** Bump for each new campaign — it namespaces the view counter. */
  id: string;
  /* Two genuinely different things wearing the same strip.
     An `offer` asks for money: it carries an end date, routes to the plan comparison, and is
     hidden from tiers with nothing left to buy.
     An `announcement` gives something: it names a feature rather than a price, routes to that
     feature rather than to pricing, and shows to everyone — a launch is exactly as relevant to
     a Premium customer as to a Standard one.
     The distinction is load-bearing, not cosmetic. Ditto and Visual Electric both run pure
     product announcements as top strips; if an announcement's CTA opened the pricing modal it
     would be an upgrade ad wearing an announcement's clothes, and the reason it is allowed to
     exist at all would collapse. */
  kind: PromoKind;
  /** Leads with the gain — what they save, or what they can now do. */
  line: string;
  /** Offers only. Every offer strip in the study states an end date. */
  endsOn?: string;
  /** What the action says. Names its destination in both cases. */
  cta: string;
  /** The small pill that carries the campaign signal — 'NEW', '20% OFF'. */
  chip: string;
}

export const ACTIVE_PROMO: Promo | null = {
  id: 'autumn-2026',
  kind: 'offer',
  line: 'Save 20% on Pro and Premium',
  endsOn: '30 September',
  cta: 'Upgrade',
  chip: '20% OFF',
};

/* The launch variant. Presentations are Pro-gated, so for a Standard customer these five are a
   trial of a locked feature — the feature doing the selling rather than a discount doing it.
   For PRO and Premium it is simply a bonus, which is why this one isn't hidden above PRO. */
export const LAUNCH_PROMO: Promo = {
  id: 'presentations-launch-2026',
  kind: 'announcement',
  /* States why the extra generations exist rather than what they're reserved for. The pool is
     shared — anyone can spend all ten on books — so "5 presentation generations" would be a
     lie. "Added so you can try them" is true, names the intent, and does more steering than
     "your generations doubled", which reads as a generic quota bump with no purpose attached.
     The honest framing and the persuasive one turn out to be the same sentence. */
  line: 'Presentations are here — we added 5 generations so you can try them',
  cta: 'Try presentations',
  chip: 'NEW',
};

/* GOV.UK caps its global banner at three views per user, stored in a cookie, rather than relying
   on a dismiss nobody clicks. Same idea here, namespaced per campaign. */
const MAX_VIEWS = 3;
const viewsKey = (promoId: string) => `dsgn_promo_views_${promoId}`;

/* Built from the app's own materials, not borrowed from someone else's. A saturated filled band
   was the first attempt and it read as pasted in: nothing else in this product is a block of
   solid colour, so it belonged to a different design system rather than looking deliberately
   temporary. Ditto and Visual Electric both ship one, but their whole surface is high-contrast —
   ours is white cards, soft tints and 1px borders, and the band had no context to sit in.
   A soft tint plus a 1px border is the app's card language, so the strip belongs; the campaign
   signal is concentrated in the chip instead, which is Kajabi's move — keep the band calm and
   put the energy in one small element.

   The hues are each argued rather than picked. The offer takes brand blue, following the
   deck's own recommendation that upgrades stay in brand colour. The launch takes the purple
   presentations already own in this product — the mode chip on this very page is #7C3AED — so
   the strip is the colour of the thing it announces.
   The tint went through three passes. A saturated filled band was too foreign; a tint at ~1.11
   against white was too quiet to register; deepening to 1.38 read well but heavier than wanted.
   The launch now sits at 1.20 and the offer at 1.28. What lets the launch stay this light is the
   filled chip — a small block of saturated colour carries the signal, so the band doesn't have
   to. Every foreground clears 6.3:1 on its ground and the chips 6.9:1. */
const STRIP_TONE = {
  offer: {
    bg: '#D5E4FF', border: '#B7CFF7', line: '#15191F', meta: '#3F5170',
    cta: '#0043A8', close: '#3F5170', chipBg: '#0053C7', chipFg: '#FFFFFF',
  },
  announcement: {
    bg: '#EFE7FF', border: '#D6C4F7', line: '#2E1065', meta: '#5B4A8A',
    cta: '#5B21B6', close: '#5B4A8A', chipBg: '#6D28D9', chipFg: '#FFFFFF',
  },
} as const;

export function PlanTopStrip() {
  const currentPlan = useFlowStore((s) => s.currentPlan);
  const [visible, setVisible] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const counted = useRef(false);
  const router = useRouter();

  /* `promoActive` is the season itself — false between campaigns, which is most of the year and
     the state this surface defaults to. */
  const promoActive = useFlowStore((s) => s.promoActive);
  const promoVariant = useFlowStore((s) => s.promoVariant);
  const promo = promoVariant === 'announcement' ? LAUNCH_PROMO : ACTIVE_PROMO;
  const tone = STRIP_TONE[promo?.kind ?? 'offer'];

  /* An offer is hidden from tiers with nothing left to buy. A launch is not: presentations
     shipping is exactly as relevant to a Premium customer as to a Standard one. */
  const sellable = planRank(currentPlan) < planRank('premium');
  const eligible = promoActive && !!promo && (promo.kind === 'announcement' || sellable);
  const target: PlanId = currentPlan === 'standard' ? 'pro' : 'premium';

  /* Counted after mount, never during render: localStorage isn't available on the server, and
     reading it inline would make the first client paint disagree with the server's. The ref
     guards against Strict Mode's double-invoke burning two views on one visit. */
  useEffect(() => {
    // Campaign ended (or the viewer moved to a tier it can't sell to): hide, and re-arm so
    // the next campaign gets counted fresh rather than inheriting this one's ref.
    if (!eligible) {
      counted.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(false);
      return;
    }
    if (!promo || counted.current) return;
    counted.current = true;
    const key = viewsKey(promo.id);
    const seen = Number(localStorage.getItem(key) ?? 0);
    if (seen >= MAX_VIEWS) return;
    localStorage.setItem(key, String(seen + 1));
    /* The view count lives in localStorage, which doesn't exist on the server, so visibility
       can't be decided during render without the first client paint disagreeing with the
       prerendered HTML. This is the standard mounted-flag pattern — it runs once and settles,
       so the cascading render the rule guards against can't happen. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
  }, [eligible, promo]);

  const dismiss = () => {
    if (promo) localStorage.setItem(viewsKey(promo.id), String(MAX_VIEWS));
    setVisible(false);
  };

  if (!promo || !visible) return null;

  return (
    <>
      {/* Inset rather than full-bleed. A band running edge to edge is the announcement-bar shape
          NN/g's work identifies as ad-like; floating it off the edges with a radius makes it read
          as one of the app's own cards — same 12px radius as the sidebar allowance card. */}
      <div style={{ flexShrink: 0, padding: '12px 16px 0' }}>
        <div
          className="flex items-center justify-center relative"
          style={{
            background: tone.bg,
            border: `1px solid ${tone.border}`,
            borderRadius: 12,
            padding: '9px 52px',
            gap: 8,
          }}
        >
          {/* Carries the campaign signal so the band doesn't have to. */}
          <span style={{
            ...ns, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.5px',
            background: tone.chipBg, color: tone.chipFg,
            padding: '3px 7px', borderRadius: 999, lineHeight: 1, flexShrink: 0,
          }}>
            {promo.chip}
          </span>

          <span style={{ ...ns, fontSize: 13, fontWeight: 700, color: tone.line, lineHeight: '18px' }}>
            {promo.line}
          </span>

          {/* Offers only. The end date is what makes one a campaign rather than an advert, and
              every offer strip in the study states one. A launch has no equivalent — inventing a
              deadline for it would be manufacturing urgency the thing doesn't have. */}
          {promo.endsOn && (
            <span style={{ ...ns, fontSize: 13, fontWeight: 400, color: tone.meta, lineHeight: '18px', whiteSpace: 'nowrap' }}>
              · Ends {promo.endsOn}
            </span>
          )}

          {/* An offer goes to the plan comparison; a launch goes to the feature. Routing a launch
              at pricing is the one move that would turn it back into an advert. */}
          {/* Lands in the Wordgenie conversation itself, full screen and already in presentation
              mode. It used to route to the entry view because the chat did nothing when it wasn't
              handed a ?prompt=; the container now opens by asking for the topic instead, so the
              conversation is a real destination rather than a dead one. */}
          <button
            onClick={() => (promo.kind === 'announcement' ? router.push('/presentation/chat') : setShowUpgrade(true))}
            className="cursor-pointer hover:opacity-70 transition-opacity"
            style={{
              ...ns, fontSize: 13, fontWeight: 700, color: tone.cta,
              background: 'none', border: 'none', padding: 0,
              textDecoration: 'underline', textUnderlineOffset: 3,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {promo.cta}
          </button>

          {/* Polaris requires a dismiss on anything non-critical. Here it spends the campaign's
              remaining views, so "not now" holds for the rest of that campaign. */}
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="absolute cursor-pointer hover:opacity-100 transition-opacity"
            style={{ right: 16, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, background: 'none', border: 'none', padding: 4, lineHeight: 0 }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M11 3L3 11M3 3l8 8" stroke={tone.close} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {showUpgrade && (
        <UpgradePlanModal
          onClose={() => setShowUpgrade(false)}
          highlightPlanId={target}
        />
      )}
    </>
  );
}
