'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckoutView } from '@/components/checkout/CheckoutView';

function CheckoutPageInner() {
  const searchParams = useSearchParams();
  const planParam = searchParams.get('plan');
  const plan = planParam === 'premium' ? 'premium' : 'pro';

  return <CheckoutView plan={plan} />;
}

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutPageInner />
    </Suspense>
  );
}
