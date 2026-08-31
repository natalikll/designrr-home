'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ns = { fontFamily: "'Nunito Sans', sans-serif" } as const;

interface PlanDetails {
  name: string;
  price: string;
  period: string;
  monthlyEquivalent: string;
  bullet: 'check' | 'star';
  features: string[];
}

const PLAN_DETAILS: Record<'pro' | 'premium', PlanDetails> = {
  pro: {
    name: 'Designrr PRO',
    price: '$97',
    period: '/year',
    monthlyEquivalent: 'Only $8/month Billed Annually',
    bullet: 'check',
    features: [
      'New LIVE ebooks (Embed Video, Password protect)',
      'Access all (Over 300) Designrr Templates (More added every month)',
      'Premium Content Aware Templates for more advanced Design.',
      'Extract text from PDF Imports',
      'Publish & Customize Unlimited Flipbooks, ePub and Kindle (Amazon)',
      'Create 3D Cover Images',
      'More Page Sizes Portrait & Landscape (A5, 6x9, Legal, A3)',
      'Save & Re-Use content across projects',
      'Cancel Anytime',
    ],
  },
  premium: {
    name: 'Designrr Premium',
    price: '$297',
    period: '/year',
    monthlyEquivalent: 'Only $25/month Billed Annually',
    bullet: 'star',
    features: [
      'Import any Video, Audio, YouTube URL, Facebook Video or Podcast mp3 and get accurate automated transcriptions in minutes.',
      'Language support includes: English, Dutch, French, German, Italian, Polish, Portuguese, Spanish',
      'Create an ebook direct from the transcription – great for Podcast Show notes, Webinar notes and more.',
      'Download subtitles or raw transcription for direct editing.',
      'Automatic scene recognition and extraction technology to insert video frames into your ebooks.',
      'Includes 240 minutes of transcription time every month',
      'Includes all PRO features (All Templates, Live eBooks, 3D Cover generator, Import from PDF, Publish to Kindle, ePub and Flipbooks)',
      'Includes Audiobooks direct from your written content',
      'Cancel & downgrade at anytime',
    ],
  },
};

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
      <path d="M3 8.2l3 3 7-7.4" stroke="#006EFE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#006EFE" style={{ flexShrink: 0, marginTop: 2 }}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

export function CheckoutView({ plan }: { plan: 'pro' | 'premium' }) {
  const router = useRouter();
  const details = PLAN_DETAILS[plan];
  const [payMethod, setPayMethod] = useState<'card' | 'paypal'>('card');
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="min-h-screen" style={{ background: '#F6F7F9' }}>
      {/* Top bar with back link — the fix-spec "see other plans" escape hatch */}
      <div className="flex items-center" style={{ padding: '16px 32px', borderBottom: '1px solid #E0E5EB', background: '#fff' }}>
        <button
          onClick={() => router.back()}
          className="flex items-center cursor-pointer"
          style={{ gap: 6, ...ns, fontSize: 13, fontWeight: 500, color: '#52637A', background: 'none', border: 'none' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          Back
        </button>
      </div>

      <div className="flex items-start justify-center" style={{ gap: 48, padding: '48px 24px', maxWidth: 1040, margin: '0 auto' }}>
        {/* Left: plan summary */}
        <div style={{ width: 380, flexShrink: 0 }}>
          <div className="flex items-center" style={{ gap: 8, marginBottom: 20 }}>
            <svg width="22" height="20" viewBox="0 0 22 20" fill="none">
              <path d="M0 0L22 10L0 20V13L11 10L0 7V0Z" fill="#006EFE" />
            </svg>
            <span style={{ ...ns, fontSize: 17, fontWeight: 700, color: '#15191F' }}>designrr</span>
            <span style={{ ...ns, fontSize: 17, fontWeight: 700, color: '#15191F', marginLeft: 4 }}>{details.name.replace('Designrr ', '')}</span>
            <span style={{ ...ns, fontSize: 17, fontWeight: 700, color: '#15191F', marginLeft: 'auto' }}>{details.price}</span>
          </div>

          <div className="flex flex-col" style={{ gap: 12, marginBottom: 24 }}>
            {details.features.map((f) => (
              <div key={f} className="flex items-start" style={{ gap: 10 }}>
                {details.bullet === 'check' ? <CheckIcon /> : <StarIcon />}
                <span style={{ ...ns, fontSize: 13.5, color: '#15191F', lineHeight: 1.55 }}>{f}</span>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #E0E5EB', paddingTop: 16, marginBottom: 12 }}>
            <p style={{ ...ns, fontSize: 12, fontWeight: 700, color: '#8596AD', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Today&apos;s payment</p>
            <div className="flex items-center justify-between">
              <span style={{ ...ns, fontSize: 14, color: '#15191F' }}>{details.name}</span>
              <span style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#15191F' }}>{details.price}</span>
            </div>
          </div>

          <div>
            <p style={{ ...ns, fontSize: 12, fontWeight: 700, color: '#8596AD', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Future payments</p>
            <div className="flex items-center justify-between">
              <div>
                <div style={{ ...ns, fontSize: 14, color: '#15191F' }}>{details.name}</div>
                <div style={{ ...ns, fontSize: 12, color: '#8596AD' }}>Annual payments</div>
              </div>
              <span style={{ ...ns, fontSize: 14, fontWeight: 600, color: '#8596AD' }}>{details.price}</span>
            </div>
          </div>

          <p style={{ ...ns, fontSize: 11, color: '#B0BAC9', marginTop: 20 }}>All prices in USD. {details.monthlyEquivalent}</p>
        </div>

        {/* Right: forms */}
        <div style={{ width: 420, flexShrink: 0, background: '#fff', borderRadius: 12, border: '1px solid #E0E5EB', padding: 28 }}>
          <h2 style={{ ...ns, fontSize: 16, fontWeight: 700, color: '#15191F', marginBottom: 16 }}>Contact information</h2>
          <div className="flex" style={{ gap: 10, marginBottom: 10 }}>
            <input placeholder="Your first name" style={inputStyle} />
            <input placeholder="Your last name" style={inputStyle} />
          </div>
          <input placeholder="Your email address" defaultValue="natali.k+standard@contrastux.com" style={{ ...inputStyle, width: '100%', marginBottom: 10 }} />
          <div className="flex" style={{ gap: 10, marginBottom: 14 }}>
            <select style={{ ...inputStyle, flex: 1.2 }} defaultValue="Georgia">
              <option>Georgia</option>
              <option>California</option>
              <option>New York</option>
            </select>
            <input placeholder="State/region" style={{ ...inputStyle, flex: 1 }} />
            <input placeholder="ZIP" style={{ ...inputStyle, flex: 1 }} />
          </div>

          <label className="flex items-center cursor-pointer" style={{ gap: 8, marginBottom: 24 }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ width: 15, height: 15 }} />
            <span style={{ ...ns, fontSize: 12.5, color: '#52637A' }}>
              I agree to the <span style={{ color: '#006EFE' }}>terms and conditions</span>
            </span>
          </label>

          <h2 style={{ ...ns, fontSize: 16, fontWeight: 700, color: '#15191F', marginBottom: 16 }}>Payment information</h2>
          <div className="flex" style={{ marginBottom: 14, borderRadius: 8, border: '1px solid #E0E5EB', overflow: 'hidden' }}>
            {(['card', 'paypal'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPayMethod(m)}
                className="flex-1 cursor-pointer"
                style={{
                  ...ns, fontSize: 13, fontWeight: 600, padding: '10px 0',
                  background: payMethod === m ? '#006EFE' : '#fff',
                  color: payMethod === m ? '#fff' : '#15191F',
                  border: 'none',
                }}
              >
                {m === 'card' ? 'Credit card' : 'PayPal'}
              </button>
            ))}
          </div>

          {payMethod === 'card' ? (
            <>
              <div className="flex items-center" style={{ gap: 6, marginBottom: 14 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22A34A" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                <span style={{ ...ns, fontSize: 12, color: '#22A34A' }}>Secure, fast checkout with Link</span>
              </div>
              <input placeholder="Card number" style={{ ...inputStyle, width: '100%', marginBottom: 10 }} />
              <div className="flex" style={{ gap: 10, marginBottom: 20 }}>
                <input placeholder="MM / YY" style={{ ...inputStyle, flex: 1 }} />
                <input placeholder="CVC" style={{ ...inputStyle, flex: 1 }} />
              </div>
            </>
          ) : (
            <div style={{ padding: '20px 0', textAlign: 'center', ...ns, fontSize: 13, color: '#8596AD', marginBottom: 20 }}>
              You&apos;ll be redirected to PayPal to complete payment.
            </div>
          )}

          <button
            disabled={!agreed}
            style={{
              ...ns, width: '100%', height: 44, borderRadius: 8, border: 'none',
              background: agreed ? '#006EFE' : '#B0C8F9', color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: agreed ? 'pointer' : 'not-allowed',
            }}
          >
            Subscribe — {details.price}{details.period}
          </button>
          <p style={{ ...ns, fontSize: 10.5, color: '#B0BAC9', marginTop: 12, lineHeight: 1.5 }}>
            By subscribing, you authorize PageOneTraffic, Inc to charge you according to the terms until you cancel.
          </p>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  ...ns, fontSize: 13.5, color: '#15191F', height: 40, padding: '0 12px',
  borderRadius: 8, border: '1px solid #E0E5EB', background: '#fff', outline: 'none',
};
