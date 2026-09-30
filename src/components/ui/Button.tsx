'use client';

/* The design system's Button, transcribed from the Figma library's own component
   (Design system › Buttons new). It replaces a version that had primary/secondary/
   ghost at sm/md/lg with a framer-motion scale-on-hover — none of which the library
   specifies, and which nothing imported. Every button in the product is currently
   hand-rolled, which is why there are seven button heights in the app against the
   two below; this is the thing to reach for instead.

   Three properties, matching the Figma component's own:
     semantic  primary | secondary | tertiary | danger | ai | ai-outline
     size      medium (38) | small (28)
     state     default | hover | disabled

   Two deliberate departures from the library, both additive:

   1. A focus ring, and this one is not a preference. WCAG 2.2 SC 2.4.7 Focus Visible
      is Level AA, and the Understanding document is explicit that removing the
      browser default without an equivalent replacement fails it. The Figma library
      draws no focus state on any component — Button, dropdown, card, checkbox, radio
      or toggle — so as drawn it cannot be implemented conformantly. This is the
      library needing to match the code, not the reverse.

      Scope of the claim, kept narrow on purpose: 2.4.7 requires only that an
      indicator EXISTS and is perceivable. The appearance rules — a 2 CSS px
      perimeter and 3:1 contrast — are SC 2.4.13 Focus Appearance, which is Level
      AAA, so the geometry below is a recommendation followed, not a requirement met.

      The ring is a 2px solid accent outline at a 2px offset, plus the soft halo.
      The offset is load-bearing: primary and AI buttons are themselves blue, so a
      ring drawn ON the button would vanish into its own fill — pushing it outside
      puts it on the page, where #006EFE measures 4.50:1 against white. The halo
      alone was the first version of this and was wrong: at 12% alpha it measures
      1.18:1 against white, which is decorative, not an indicator. It survives only
      because the book editor's fields pair it with a border that also turns blue;
      a button has no border to turn, so it needed the outline.
   2. `busy`. Also unspecified, and also needed: the slowest actions in the product
      (AI generation, file reads) currently each invent their own pending state.
      It reuses the disabled visuals and blocks the click, so it adds no new colour. */

import React from 'react';

export type ButtonSemantic = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ai' | 'ai-outline';
export type ButtonSize = 'medium' | 'small';

/* The library's AI fill runs blue -> violet and REVERSES on hover rather than
   darkening; there is no separate hover colour for it. */
const AI_FILL = 'linear-gradient(235.42deg, #006EFE 2.17%, #5326BD 103.16%)';
const AI_FILL_HOVER = 'linear-gradient(235.42deg, #5326BD 2.17%, #006EFE 103.16%)';
/* AI-outline's label is the same gradient painted into the text. */
const AI_TEXT = 'linear-gradient(244.79deg, #006EFE 2.17%, #5326BD 103.16%)';

const SIZE = {
  medium: { height: 38, padding: '0 20px', gap: 8, radius: 8, icon: 18 },
  small: { height: 28, padding: '0 8px', gap: 6, radius: 6, icon: 14 },
} as const;

/* Disabled is a DISTINCT FILL, not an opacity — Primary goes to Blue/90, Secondary's
   text and rule go to Black/80, Danger to Red/90. Only the two AI variants wash out,
   because their fill is a gradient there's no flat disabled value for. */
const TONE: Record<ButtonSemantic, Record<'default' | 'hover' | 'disabled', React.CSSProperties>> = {
  primary: {
    default: { background: '#006EFE', color: '#fff', border: '1px solid transparent' },
    hover: { background: '#0058CC', color: '#fff', border: '1px solid transparent' },
    disabled: { background: '#CCE2FF', color: '#fff', border: '1px solid transparent' },
  },
  secondary: {
    default: { background: '#fff', color: '#001633', border: '1px solid #E0E5EB' },
    hover: { background: '#E0E5EB', color: '#001633', border: '1px solid #E0E5EB' },
    disabled: { background: '#fff', color: '#C2CBD6', border: '1px solid #C2CBD6' },
  },
  tertiary: {
    default: { background: '#fff', color: '#006EFE', border: '1px solid #006EFE' },
    hover: { background: '#F0F6FF', color: '#006EFE', border: '1px solid #006EFE' },
    disabled: { background: '#fff', color: '#CCE2FF', border: '1px solid #CCE2FF' },
  },
  danger: {
    default: { background: '#D62929', color: '#fff', border: '1px solid transparent' },
    hover: { background: '#AB2121', color: '#fff', border: '1px solid transparent' },
    disabled: { background: '#F7D4D4', color: '#fff', border: '1px solid transparent' },
  },
  ai: {
    default: { background: AI_FILL, color: '#fff', border: '1px solid transparent' },
    hover: { background: AI_FILL_HOVER, color: '#fff', border: '1px solid transparent' },
    disabled: { background: AI_FILL, color: '#fff', border: '1px solid transparent', opacity: 0.5 },
  },
  'ai-outline': {
    default: { background: '#fff', border: '1px solid #E0E5EB' },
    hover: { background: '#F6F7F9', border: '1px solid #E0E5EB' },
    disabled: { background: '#fff', border: '1px solid #E0E5EB', opacity: 0.5 },
  },
};

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> {
  semantic?: ButtonSemantic;
  size?: ButtonSize;
  disabled?: boolean;
  /** Blocks the click and shows the disabled treatment without claiming the control is off. */
  busy?: boolean;
  /** Renders a square button with no label. Pass an accessible name via aria-label. */
  iconOnly?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** Stretches to the container, for the full-width buttons that sit in side panels. */
  block?: boolean;
}

export function Button({
  semantic = 'primary',
  size = 'medium',
  disabled = false,
  busy = false,
  iconOnly = false,
  leftIcon,
  rightIcon,
  block = false,
  children,
  className = '',
  style,
  ...rest
}: ButtonProps) {
  const [hover, setHover] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const off = disabled || busy;
  const s = SIZE[size];
  const tone = TONE[semantic][off ? 'disabled' : hover ? 'hover' : 'default'];

  return (
    <button
      {...rest}
      disabled={off}
      aria-busy={busy || undefined}
      onMouseEnter={(e) => { setHover(true); rest.onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHover(false); rest.onMouseLeave?.(e); }}
      onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
      className={className}
      style={{
        fontFamily: "var(--font-nunito-sans), 'Nunito Sans', sans-serif",
        fontSize: 14,
        lineHeight: '18px',
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        height: s.height,
        /* An icon-only button is a square, so its width comes from the height and
           the horizontal padding goes with the label it no longer has. */
        ...(iconOnly ? { width: s.height, padding: 0 } : { padding: s.padding }),
        ...(block ? { width: '100%' } : null),
        borderRadius: s.radius,
        cursor: off ? 'default' : 'pointer',
        transition: 'background .12s ease, border-color .12s ease',
        ...tone,
        /* Focus sits outside the tone so a hovered-and-focused button keeps both. */
        ...(focus && !off
          ? { outline: '2px solid #006EFE', outlineOffset: 2, boxShadow: '0 0 0 3px rgba(0, 110, 254, 0.12)' }
          : { outline: 'none' }),
        ...style,
      }}
    >
      {leftIcon}
      {semantic === 'ai-outline' && !iconOnly ? (
        /* The label is the gradient, clipped to the glyphs. */
        <span
          style={{
            backgroundImage: AI_TEXT,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          {children}
        </span>
      ) : (
        children
      )}
      {rightIcon}
    </button>
  );
}

export default Button;
