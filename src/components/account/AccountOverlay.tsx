'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useFlowStore } from '@/stores/flowStore';
import { MyAccountView } from './MyAccountView';

export function AccountOverlay() {
  const showAccount = useFlowStore((s) => s.showAccount);

  return (
    <AnimatePresence>
      {showAccount && (
        <motion.div
          key="account"
          className="absolute inset-0 z-20"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <MyAccountView />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
