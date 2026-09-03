'use client';

import { Tooltip } from './Tooltip';
import { PLAN_LABELS, ownsPlan, type PlanId } from '@/stores/flowStore';

/* One badge style for every tier, shared by every gated surface.
 *
 * Two rules from the research this encodes:
 *
 * 1. The mark never carries the tier alone. Our glyphs come from the pricing modal, where
 *    they always sit beside the plan name — on a card or a row they'd arrive without one.
 *    Every documented system pairs mark and word: GitLab holds one badge style constant and
 *    varies only the text, Navattic labels rows Base/Growth/Enterprise, Contra tags cards
 *    FREE and PRO. Even Hulu and Otter, which do use padlocks, always put words beside them.
 *
 * 2. Don't badge a tier the viewer already owns. GitLab shows a tier badge only when the
 *    active plan is lower than the feature's — see `shouldShowTierBadge` below.
 */

export type GateTier = Extract<PlanId, 'pro' | 'premium' | 'agency'>;

/* #0053C7 rather than the brand #006EFE. On #EAF1FF the brand blue measures 3.97:1, under the
   4.5:1 this text needs — and at 10px bold it is nowhere near large-text territory, so the
   relaxed threshold doesn't apply. The deeper blue clears 6.05:1 and is the same value the
   composer's alert link and the sidebar's Upgrade button already use. */
/* One tint for every badge in the system, tier or offer.
   #DCE9FF rather than the #EAF1FF this started on: the pale version measured 1.13 against white
   and 1.07 against the near-white template covers, so on a light card the pill vanished and only
   the text floated. This sits at 1.23 and 1.15 — still quiet, but a shape rather than an absence.
   Text is #0053C7 at 5.60:1, comfortably over the 4.5 that 10px bold needs. */
const PILL_TINT = { bg: '#DCE9FF', fg: '#0053C7' } as const;

const TINT: Record<GateTier, { bg: string; fg: string }> = {
  pro: PILL_TINT,
  premium: PILL_TINT,
  agency: PILL_TINT,
};

/* Shared geometry so anything that has to sit alongside a tier badge reads as the same object.
   Only the fill and the foreground vary between them.
   Three sizes rather than two: `lg` exists for the template preview, where the badge sits beside
   a 20px title rather than inside a dense list and needs to hold its own against it.
   Side padding is wider than the vertical rhythm would suggest — a pill this pale needs the
   horizontal run to register as a shape at all, and the extra width costs nothing in a corner. */
export type PillSize = 'sm' | 'md' | 'lg';

export function pillStyle(size: PillSize): React.CSSProperties {
  const h = size === 'sm' ? 18 : size === 'lg' ? 24 : 21;
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: h,
    padding: size === 'sm' ? '0 9px' : size === 'lg' ? '0 12px' : '0 11px',
    borderRadius: 999,
    fontFamily: "'Nunito Sans', sans-serif",
    fontSize: size === 'sm' ? 9.5 : size === 'lg' ? 11.5 : 10,
    fontWeight: 700,
    letterSpacing: '0.02em',
    lineHeight: 1,
    whiteSpace: 'nowrap',
  };
}

/* Not a tier — the opposite of one. A Pro template you may use without upgrading.
   Identical to the tier badge in every respect, including colour. Two earlier passes tried to
   distinguish it by treatment — solid blue, then green — and both were wrong for the same
   reason: they made the one badge that isn't a tier the loudest thing on the card, and each
   spent a hue that already means something else here (blue is every button, green was a new
   signal for one word).
   This follows the rule TierBadge's own header cites: GitLab holds one badge style constant and
   varies only the text. The cost is honest — scanning the grid, the two states are the same
   visual object and you have to read the word. The benefit is that no one has to learn a colour
   code that exists on exactly one screen.
   Sentence case, like every label here: "Try for free", not "TRY FOR FREE". PRO only reads as
   caps because that is literally how the plan is named. */
export function OfferBadge({ label, size = 'md' }: { label: string; size?: PillSize }) {
  return (
    <span style={{ ...pillStyle(size), background: PILL_TINT.bg, color: PILL_TINT.fg }}>
      {label}
    </span>
  );
}

/* Mirrors each tier's own icon from the pricing modal — star for Pro, crown for Premium
   and above. Decorative here: the label beside it is what actually names the plan. */
export function TierIcon({ tier, color, size = 12 }: { tier: GateTier; color: string; size?: number }) {
  if (tier === 'pro') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    );
  }
  return (
    <svg width={size + 1} height={size + 1} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M5 20L3 8l5.5 4.5L12 4l3.5 8.5L21 8l-2 12H5Z" />
    </svg>
  );
}

/** Whether this gate should be marked at all, given who's looking. */
export function shouldShowTierBadge(currentPlan: PlanId, required?: GateTier): required is GateTier {
  return !!required && !ownsPlan(currentPlan, required);
}

/* Text by default, and the default is the right one nearly everywhere.
 *
 * GitLab's own guidance is "use text, icons, or both" — and the icon they pair with the tier
 * variant is a single `license` glyph, identical for Premium and Ultimate. It says "this is a
 * plan gate", never which plan. Contra ships bare FREE / PRO; ClickUp a bare "Business" tag.
 * Nothing in the study needs a glyph to name a tier, so `withIcon` stays opt-in: it buys
 * decoration, costs about 25px of width, and risks re-teaching the star/crown decode we
 * already concluded doesn't work outside the pricing modal. */
export function TierBadge({ tier, size = 'md', withIcon = false, withTooltip = false }: {
  tier: GateTier;
  size?: PillSize;
  withIcon?: boolean;
  /** GitLab attaches a tooltip to *icon-only* tier badges, because a lone glyph can't name
      the plan. This badge spells the plan out, so a tooltip would only repeat the label —
      off by default, available where "and above" genuinely needs saying. */
  withTooltip?: boolean;
}) {
  const tint = TINT[tier];
  const label = PLAN_LABELS[tier];

  /* No uppercasing: the labels are the plan names as written, so PRO stays PRO and Premium
     stays Premium. Forcing caps would invent "PREMIUM", a name that appears nowhere else —
     least of all in the pricing modal these badges echo. Sentence case is also what GitLab,
     Navattic, ClickUp and Canva all ship. */
  const pill = (
      <span style={{ ...pillStyle(size), background: tint.bg, color: tint.fg }}>
        {withIcon && <TierIcon tier={tier} color={tint.fg} size={size === 'sm' ? 11 : size === 'lg' ? 14 : 12} />}
        {label}
      </span>
  );

  if (!withTooltip) return pill;
  return (
    <Tooltip label={`Unlocked by ${label} and above`} position="top">
      {pill}
    </Tooltip>
  );
}
