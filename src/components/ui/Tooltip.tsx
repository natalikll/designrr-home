'use client';

import { useState, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface TooltipProps {
  label: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'right';
}

export function Tooltip({ label, children, position = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (position === 'top' && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setFlipped(rect.top < 64);
    } else {
      setFlipped(false);
    }
    setVisible(true);
  };

  const effectivePosition = position === 'top' && flipped ? 'bottom' : position;

  // Opacity-only for all positions — prevents Framer Motion's x/y transforms
  // from overriding the CSS translate used for centering/alignment.
  const motionProps = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

  // Outer wrapper: handles positioning & CSS centering transform
  const posStyle: React.CSSProperties =
    effectivePosition === 'top'    ? { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' } :
    effectivePosition === 'bottom' ? { top: 'calc(100% + 8px)',    left: '50%', transform: 'translateX(-50%)' } :
                                     { left: 'calc(100% + 10px)',  top: '50%',  transform: 'translateY(-50%)' };

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
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </div>
  );

  const caret =
    effectivePosition === 'top' ? (
      <div className="absolute left-1/2 -translate-x-1/2" style={{ top: '100%', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #29323D' }} />
    ) : effectivePosition === 'bottom' ? (
      <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: '100%', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '5px solid #29323D' }} />
    ) : (
      /* left-pointing caret for right position */
      <div style={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderRight: '6px solid #29323D' }} />
    );

  return (
    <div
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setVisible(false)}
    >
      {children}

      <AnimatePresence>
        {visible && (
          <motion.div
            {...motionProps}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="pointer-events-none absolute z-50"
            style={posStyle}
          >
            {tooltipBox}
            {caret}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
