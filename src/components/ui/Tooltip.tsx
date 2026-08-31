'use client';

import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

interface TooltipProps {
  label: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'right';
  /** Wraps the label at this width instead of the default single-line bubble — for
   *  sentence-length explainers where nowrap would run off the edge of the screen. */
  maxWidth?: number;
}

const EDGE_MARGIN = 8;

type Placement = {
  effectivePosition: 'top' | 'bottom' | 'right';
  boxStyle: React.CSSProperties;
  caretStyle: React.CSSProperties;
};

/**
 * Portal-rendered to document.body, not positioned relative to its own trigger — a tooltip
 * living inside any ancestor with overflow:hidden (a scrollable sidebar, a clipped card, a
 * narrow filmstrip column) used to get silently cut off there instead of floating above
 * everything, with no visual sign anything was wrong until the text ran off the edge. Position
 * is computed from the trigger's actual measured rect in viewport (fixed) coordinates instead.
 */
export function Tooltip({ label, children, position = 'top', maxWidth }: TooltipProps) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // No live measurement of the tooltip box itself (it isn't mounted yet) — same estimate
    // approach StudioTooltip already uses elsewhere in this app, good enough to decide whether
    // an edge is at risk without a two-pass measure/reposition render.
    const estW = maxWidth ?? Math.max(60, label.length * 6.6 + 32);
    const estH = 36;

    let effectivePosition = position;
    if (position === 'top' && rect.top - estH < EDGE_MARGIN) effectivePosition = 'bottom';

    if (effectivePosition === 'right') {
      setPlacement({
        effectivePosition,
        boxStyle: { position: 'fixed', left: rect.right + 10, top: rect.top + rect.height / 2, transform: 'translateY(-50%)' },
        caretStyle: {},
      });
      return;
    }

    const centerX = rect.left + rect.width / 2;
    const top = effectivePosition === 'top' ? rect.top - 8 : rect.bottom + 8;
    const vTransform = effectivePosition === 'top' ? 'translateY(-100%)' : 'translateY(0)';

    // Centered on the trigger by default (matches the caret, which stays fixed at the box's own
    // horizontal midpoint) — clamped to a straight viewport-edge anchor only when centering
    // would run the box off-screen. The caret drifts slightly off true-center in that clamped
    // case rather than tracking the trigger exactly; a fully accurate caret there would need a
    // second, post-mount measurement pass for what's a rare edge case, not worth the extra render.
    let left = centerX;
    let hTransform = 'translateX(-50%)';
    if (centerX - estW / 2 < EDGE_MARGIN) { left = EDGE_MARGIN; hTransform = 'translateX(0)'; }
    else if (centerX + estW / 2 > window.innerWidth - EDGE_MARGIN) { left = window.innerWidth - EDGE_MARGIN; hTransform = 'translateX(-100%)'; }

    setPlacement({
      effectivePosition,
      boxStyle: { position: 'fixed', left, top, transform: `${hTransform} ${vTransform}` },
      caretStyle: { left: '50%', transform: 'translateX(-50%)' },
    });
  };

  // Opacity-only for all positions — prevents Framer Motion's x/y transforms
  // from overriding the CSS translate used for centering/alignment.
  const motionProps = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

  const tooltipBox = (
    <div
      style={{
        background: '#29323D',
        borderRadius: 8,
        padding: '8px 16px',
        fontFamily: "'Nunito Sans', sans-serif",
        fontSize: 14,
        fontWeight: 400,
        lineHeight: '20px',
        color: '#FFFFFF',
        whiteSpace: maxWidth ? 'normal' : 'nowrap',
        width: maxWidth,
      }}
    >
      {label}
    </div>
  );

  const caret = (effectivePosition: 'top' | 'bottom' | 'right', caretStyle: React.CSSProperties) =>
    effectivePosition === 'top' ? (
      <div className="absolute" style={{ top: '100%', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #29323D', ...caretStyle }} />
    ) : effectivePosition === 'bottom' ? (
      <div className="absolute" style={{ bottom: '100%', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '5px solid #29323D', ...caretStyle }} />
    ) : (
      /* left-pointing caret for right position */
      <div style={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderRight: '6px solid #29323D' }} />
    );

  return (
    <div
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setPlacement(null)}
    >
      {children}

      {placement && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          <motion.div
            {...motionProps}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="pointer-events-none"
            style={{ ...placement.boxStyle, position: 'fixed', zIndex: 1000 }}
          >
            <div className="relative">
              {tooltipBox}
              {caret(placement.effectivePosition, placement.caretStyle)}
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
