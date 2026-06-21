// ─────────────────────────────────────────────────────────────────────────────
// SubscriptionGate.js  —  Custom subscription system (no Stripe required)
//
// To change prices:       edit the PLANS array below
// To change PayPal link:  edit PAYPAL_ME_URL
// To change bank details: edit BANK_DETAILS
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// ── Configure your payment details here ──────────────────────────────────────

const CURRENCY        = 'AUD';
const CURRENCY_SYMBOL = '$';
const SUPPORT_EMAIL   = process.env.REACT_APP_ADMIN_EMAIL || 'support@yourdomain.com';
const PAYPAL_ME_URL   = 'https://paypal.me/YOURUSERNAME'; // ← your PayPal.me link

const BANK_DETAILS = {
  bankName:    'Commonwealth Bank',   // ← your bank
  accountName: 'Your Business Name',  // ← your name
  bsb:         '062-000',             // ← your BSB
  account:     '1234 5678',           // ← your account number
};

// ── Plan definitions — edit prices here ──────────────────────────────────────

const PLANS = [
  {
    id:           'starter',
    name:         'Starter',
    monthlyPrice: 9,
    annualPrice:  89,
    color:        '#4ade80',
    bg:           'rgba(74,222,128,0.08)',
    cardBorder:   'rgba(74,222,128,0.25)',
    description:  'Perfect for a small store just getting started.',
    features:     ['1 user (owner)', 'POS & inventory', 'Shared product catalogue', '1,000 sales / month', 'Email support'],
    limits:       ['No reports', 'No workers'],
  },
  {
    id:           'pro',
    name:         'Pro',
    monthlyPrice: 25,
    annualPrice:  249,
    color:        '#38bdf8',
    bg:           'rgba(56,189,248,0.08)',
    cardBorder:   'rgba(56,189,248,0.35)',
    description:  'For growing stores that need reports and a team.',
    recommended:  true,
    features:     ['Up to 5 users', 'Full POS, inventory & reports', 'Shared product catalogue', 'Unlimited sales', 'Credit customer tracking', 'Supplier & stock management', 'Priority email support'],
    limits:       [],
  },
  {
    id:           'business',
    name:         'Business',
    monthlyPrice: 59,
    annualPrice:  579,
    color:        '#c084fc',
    bg:           'rgba(192,132,252,0.08)',
    cardBorder:   'rgba(192,132,252,0.3)',
    description:  'Unlimited scale, white-label, and API access.',
    features:     ['Unlimited users', 'Everything in Pro', 'White-label (custom logo & name)', 'Custom catalogue entries', 'Priority support', 'SLA: 99.9% uptime'],
    limits:       [],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SubscriptionGate — shows pricing wall when no active plan
// ─────────────────────────────────────────────────────────────────────────────
export function SubscriptionGate({ plan, tenantId, onRefresh, children }) {
  const [checking, setChecking] = useState(false);
  const [pending,  setPending]  = useState(false);

  useEffect(() => {
    if (!tenantId || (plan && plan !== 'none')) return;
    getDoc(doc(db, 'subscriptions', tenantId)).then(snap => {
      if (snap.exists() && snap.data().status === 'pending_approval') setPending(true);
    }).catch(() => {});
  }, [tenantId, plan]);

  const handleRefresh = async () => {
    setChecking(true);
    await onRefresh?.();
    setTimeout(() => setChecking(false), 1500);
  };

  // Active plan → show app
  if (plan && plan !== 'none') return children;

  return (
    <div style={S.gateWrap}>
      <div style={S.gateCard}>
        {pending ? (
          <PendingScreen onRefresh={handleRefresh} checking={checking} />
        ) : (
          <>
            <div style={{ fontSize:44, marginBottom:10 }}>🔒</div>
            <h2 style={S.gateTitle}>Activate your subscription</h2>
            <p style={S.gateSub}>
              Choose a plan and pay via PayPal or bank transfer.
              Your account activates within <strong>a few hours</strong> on business days.
            </p>
            <PricingCards
              tenantId={tenantId}
              onPaymentSubmitted={() => setPending(true)}
              compact
            />
            <button style={S.refreshBtn} onClick={handleRefresh} disabled={checking}>
              {checking ? 'Checking…' : '↻ Already paid? Check my access'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PricingPage — shown in the Pricing tab inside the app
// ─────────────────────────────────────────────────────────────────────────────
export function PricingPage({ tenantId, currentPlan }) {
  return (
    <div style={{ padding:'40px 24px', maxWidth:1000, margin:'0 auto' }}>
      <div style={{ textAlign:'center', marginBottom:36 }}>
        <h1 style={{ fontSize:30, fontWeight:700, color:'#f1f5f9', margin:0 }}>
          Simple, transparent pricing
        </h1>
        <p style={{ color:'#64748b', marginTop:10, fontSize:15 }}>
          No hidden fees. Pay monthly or save ~20% annually.
          Activation within a few hours after payment.
        </p>
      </div>
      <PricingCards tenantId={tenantId} currentPlan={currentPlan} insideApp />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PricingCards — the three plan cards + payment section
// ─────────────────────────────────────────────────────────────────────────────
function PricingCards({ tenantId, currentPlan, compact, onPaymentSubmitted, insideApp }) {
  const [annual,    setAnnual]    = useState(false);
  const [selected,  setSelected]  = useState(null);
  const [payMethod, setPayMethod] = useState(null);

  const handleSelect = (plan) => {
    setSelected(plan);
    setPayMethod(null);
    setTimeout(() => {
      document.getElementById('pay-section')?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    }, 80);
  };

  return (
    <div>
      {/* Monthly / Annual toggle */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, marginBottom:24 }}>
        <span style={{ color: annual ? '#64748b' : '#f1f5f9', fontSize:14 }}>Monthly</span>
        <button onClick={() => setAnnual(a => !a)} style={{
          width:44, height:24, borderRadius:12,
          background: annual ? '#0ea5e9' : '#1e293b',
          border:'none', cursor:'pointer', position:'relative', transition:'background .2s',
        }}>
          <span style={{
            position:'absolute', top:2, left: annual ? 22 : 2,
            width:20, height:20, borderRadius:'50%', background:'#fff', transition:'left .2s',
          }}/>
        </button>
        <span style={{ color: annual ? '#f1f5f9' : '#64748b', fontSize:14 }}>
          Annual <span style={{ color:'#4ade80', fontSize:12 }}>save ~20%</span>
        </span>
      </div>

      {/* Cards grid */}
      <div style={{
        display:'grid',
        gridTemplateColumns: compact ? 'repeat(auto-fit,minmax(200px,1fr))' : 'repeat(3,1fr)',
        gap:12, marginBottom:16,
      }}>
        {PLANS.map(plan => {
          const price     = annual ? plan.annualPrice : plan.monthlyPrice;
          const period    = annual ? '/year' : '/month';
          const isCurrent = currentPlan === plan.id;
          const isChosen  = selected?.id === plan.id;

          return (
            <div key={plan.id}
              onClick={() => !isCurrent && handleSelect(plan)}
              style={{
                background:    isChosen ? plan.bg : 'rgba(255,255,255,0.03)',
                border:        `2px solid ${isChosen ? plan.color : plan.recommended ? plan.cardBorder : '#1e293b'}`,
                borderRadius:  14,
                padding:       '20px 16px',
                position:      'relative',
                display:       'flex',
                flexDirection: 'column',
                cursor:        isCurrent ? 'default' : 'pointer',
                transition:    'all .15s',
                transform:     isChosen ? 'translateY(-3px)' : 'none',
                boxShadow:     isChosen ? `0 8px 28px ${plan.color}20` : 'none',
              }}
            >
              {plan.recommended && (
                <div style={{
                  position:'absolute', top:-13, left:'50%', transform:'translateX(-50%)',
                  background:plan.color, color:'#0f172a', fontSize:11, fontWeight:700,
                  padding:'3px 14px', borderRadius:12, whiteSpace:'nowrap',
                }}>MOST POPULAR</div>
              )}
              {isCurrent && (
                <div style={{
                  position:'absolute', top:-11, right:12,
                  background:'#1e293b', color:'#94a3b8', fontSize:11,
                  padding:'2px 10px', borderRadius:10,
                }}>Current plan</div>
              )}

              <p style={{ color:plan.color, fontWeight:700, fontSize:14, margin:'0 0 4px' }}>
                {plan.name}
              </p>
              <div style={{ display:'flex', alignItems:'baseline', gap:3, marginBottom:8 }}>
                <span style={{ fontSize:28, fontWeight:800, color:'#f1f5f9' }}>
                  {CURRENCY_SYMBOL}{price}
                </span>
                <span style={{ color:'#64748b', fontSize:12 }}>{period} {CURRENCY}</span>
              </div>
              <p style={{ color:'#94a3b8', fontSize:12, margin:'0 0 12px', lineHeight:1.5 }}>
                {plan.description}
              </p>

              <ul style={{ listStyle:'none', padding:0, margin:'0 0 14px', flex:1 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ display:'flex', gap:7, marginBottom:6, fontSize:12, color:'#e2e8f0' }}>
                    <span style={{ color:plan.color, flexShrink:0 }}>✓</span>{f}
                  </li>
                ))}
                {plan.limits.map(f => (
                  <li key={f} style={{ display:'flex', gap:7, marginBottom:6, fontSize:12, color:'#475569' }}>
                    <span style={{ flexShrink:0 }}>✗</span>{f}
                  </li>
                ))}
              </ul>

              <button
                onClick={e => { e.stopPropagation(); if (!isCurrent) handleSelect(plan); }}
                style={{
                  width:'100%', padding:'9px', borderRadius:8, border:'none',
                  background: isCurrent ? '#1e293b'
                            : isChosen  ? plan.color
                            : 'transparent',
                  color:      isCurrent ? '#94a3b8'
                            : isChosen  ? '#0f172a'
                            : plan.color,
                  fontWeight: 600, fontSize:13, cursor: isCurrent ? 'default' : 'pointer',
                  outline: isChosen ? 'none' : `1px solid ${plan.color}55`,
                }}
              >
                {isCurrent ? 'Current plan' : isChosen ? '✓ Selected — see payment below' : 'Select plan →'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Payment section — always visible once a plan is selected */}
      {selected && (
        <div id="pay-section">
          <PaymentSection
            plan={selected}
            annual={annual}
            tenantId={tenantId}
            onPaymentSubmitted={onPaymentSubmitted}
            onCancel={() => { setSelected(null); setPayMethod(null); }}
            payMethod={payMethod}
            setPayMethod={setPayMethod}
            insideApp={insideApp}
          />
        </div>
      )}

      <p style={{ textAlign:'center', color:'#334155', fontSize:12, marginTop:14 }}>
        Questions? Email{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color:'#38bdf8' }}>{SUPPORT_EMAIL}</a>
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PaymentSection — shown after selecting a plan
// ─────────────────────────────────────────────────────────────────────────────
function PaymentSection({ plan, annual, tenantId, onPaymentSubmitted, onCancel, payMethod, setPayMethod, insideApp }) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [txRef,      setTxRef]      = useState('');
  const [error,      setError]      = useState('');

  const price  = annual ? plan.annualPrice  : plan.monthlyPrice;
  const period = annual ? 'year'            : 'month';
  const bankRef = `VENDRPRO-${(tenantId || 'STORE').slice(0,8).toUpperCase()}`;

  const submitConfirmation = async () => {
    if (!txRef.trim()) { setError('Please enter your payment reference before confirming.'); return; }
    if (!plan || !plan.id) { setError('Invalid plan selected. Please refresh and try again.'); return; }
    if (!tenantId) { setError('Store ID not found. Please refresh and try again.'); return; }
    
    setSubmitting(true); setError('');
    try {
      await setDoc(doc(db, 'subscriptions', tenantId), {
        tenantId: tenantId || '',
        plan: plan.id || '',
        status: 'pending_approval',
        paymentMethod: payMethod || 'unknown',
        paymentRef: txRef.trim(),
        amount: price || 0,
        currency: CURRENCY || 'AUD',
        billingPeriod: period || 'month',
        requestedAt: serverTimestamp(),
        approvedAt: null,
        notes: '',
      }, { merge: true });
      setSubmitted(true);
      onPaymentSubmitted?.();
    } catch (e) {
      console.error('Subscription submission error:', e);
      setError('Failed to submit: ' + e.message);
    }
    setSubmitting(false);
  };

  if (submitted) return (
    <div style={{ background:'rgba(74,222,128,.08)', border:'1px solid rgba(74,222,128,.2)', borderRadius:12, padding:'24px', textAlign:'center', marginTop:4 }}>
      <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
      <h3 style={{ color:'#4ade80', margin:'0 0 8px' }}>Payment submitted!</h3>
      <p style={{ color:'#94a3b8', fontSize:14, lineHeight:1.6 }}>
        We've received your confirmation for the{' '}
        <strong style={{ color:'#f1f5f9' }}>{plan.name}</strong> plan.
        Your account will be activated within a few hours on business days.
      </p>
    </div>
  );

  return (
    <div style={{ background:'#0d1526', border:'1px solid #1e293b', borderRadius:14, padding:'22px', marginTop:4 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
        <div>
          <p style={{ margin:0, fontSize:12, color:'#64748b' }}>Complete payment for</p>
          <p style={{ margin:'2px 0 0', fontSize:17, fontWeight:700, color:'#f1f5f9' }}>
            {plan.name} — {CURRENCY_SYMBOL}{price}/{period} {CURRENCY}
          </p>
        </div>
        <button onClick={onCancel} style={{ background:'none', border:'1px solid #1e293b', color:'#64748b', padding:'6px 12px', borderRadius:7, cursor:'pointer', fontSize:12 }}>
          ← Change plan
        </button>
      </div>

      {/* Step 1 — choose method */}
      <p style={{ fontSize:12, color:'#64748b', marginBottom:10, fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase' }}>
        Step 1 — Choose payment method
      </p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
        {[
          { id:'paypal', icon:'💳', label:'PayPal', sub:'Instant · Secure' },
          { id:'bank',   icon:'🏦', label:'Bank Transfer', sub:'1–2 business days' },
        ].map(m => (
          <button key={m.id} onClick={() => setPayMethod(m.id)} style={{
            padding:'14px 10px', borderRadius:10, cursor:'pointer', textAlign:'left',
            background: payMethod===m.id ? 'rgba(56,189,248,.1)' : 'rgba(255,255,255,.03)',
            border: `1px solid ${payMethod===m.id ? '#38bdf8' : '#1e293b'}`,
          }}>
            <div style={{ fontSize:22, marginBottom:4 }}>{m.icon}</div>
            <div style={{ fontWeight:600, fontSize:13, color: payMethod===m.id ? '#38bdf8' : '#f1f5f9' }}>{m.label}</div>
            <div style={{ fontSize:11, color:'#64748b' }}>{m.sub}</div>
          </button>
        ))}
      </div>

      {/* Step 2 — PayPal instructions */}
      {payMethod === 'paypal' && (
        <div style={{ marginBottom:18 }}>
          <p style={{ fontSize:12, color:'#64748b', fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase', marginBottom:10 }}>
            Step 2 — Send payment via PayPal
          </p>
          <div style={{ background:'rgba(255,255,255,.03)', border:'1px solid #1e293b', borderRadius:10, padding:'16px', marginBottom:14 }}>
            <p style={{ margin:'0 0 12px', fontSize:13, color:'#94a3b8', lineHeight:1.6 }}>
              Click below to open PayPal. Send exactly{' '}
              <strong style={{ color:'#f1f5f9' }}>{CURRENCY_SYMBOL}{price} {CURRENCY}</strong> and include your store name in the payment note.
            </p>
            <a
              href={`${PAYPAL_ME_URL}/${price}${CURRENCY}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                background:'#0070ba', color:'#fff', borderRadius:8, padding:'12px',
                fontWeight:700, fontSize:14, textDecoration:'none',
              }}
            >
              💳 Pay {CURRENCY_SYMBOL}{price} {CURRENCY} via PayPal →
            </a>
          </div>
          <p style={{ fontSize:12, color:'#94a3b8', marginBottom:8 }}>
            After paying, enter the <strong style={{ color:'#f1f5f9' }}>PayPal Transaction ID</strong> from your receipt email:
          </p>
          <input
            placeholder="e.g. 1AB23456CD789012E"
            value={txRef}
            onChange={e => setTxRef(e.target.value)}
            style={inpStyle}
          />
        </div>
      )}

      {/* Step 2 — Bank transfer instructions */}
      {payMethod === 'bank' && (
        <div style={{ marginBottom:18 }}>
          <p style={{ fontSize:12, color:'#64748b', fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase', marginBottom:10 }}>
            Step 2 — Transfer to our bank account
          </p>
          <div style={{ background:'rgba(255,255,255,.03)', border:'1px solid #1e293b', borderRadius:10, padding:'16px', marginBottom:14 }}>
            <p style={{ margin:'0 0 12px', fontSize:13, color:'#94a3b8' }}>
              Transfer exactly <strong style={{ color:'#f1f5f9' }}>{CURRENCY_SYMBOL}{price} {CURRENCY}</strong>:
            </p>
            {[
              ['Bank',           BANK_DETAILS.bankName],
              ['Account Name',   BANK_DETAILS.accountName],
              ['BSB',            BANK_DETAILS.bsb],
              ['Account Number', BANK_DETAILS.account],
              ['Reference',      bankRef],
            ].map(([label, value]) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #1e293b' }}>
                <span style={{ fontSize:12, color:'#64748b' }}>{label}</span>
                <span style={{
                  fontSize:13, fontWeight:600,
                  color: label==='Reference' ? '#38bdf8' : '#f1f5f9',
                  fontFamily: label==='Reference'||label.includes('Number')||label==='BSB' ? 'monospace' : 'inherit',
                }}>
                  {value}
                </span>
              </div>
            ))}
            <p style={{ margin:'10px 0 0', fontSize:11, color:'#fb923c' }}>
              ⚠ Use the exact reference above so we can match your payment.
            </p>
          </div>
          <p style={{ fontSize:12, color:'#94a3b8', marginBottom:8 }}>
            Enter your bank transfer <strong style={{ color:'#f1f5f9' }}>receipt number</strong> or confirm the reference used:
          </p>
          <input
            placeholder={`e.g. ${bankRef}`}
            value={txRef}
            onChange={e => setTxRef(e.target.value)}
            style={inpStyle}
          />
        </div>
      )}

      {/* Step 3 — Confirm */}
      {payMethod && (
        <>
          <p style={{ fontSize:12, color:'#64748b', fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase', marginBottom:10 }}>
            Step 3 — Confirm payment
          </p>
          {error && <p style={{ color:'#f87171', fontSize:13, marginBottom:10 }}>⚠ {error}</p>}
          <button
            onClick={submitConfirmation}
            disabled={submitting || !txRef.trim()}
            style={{
              width:'100%', padding:'12px', borderRadius:9, border:'none',
              background: txRef.trim() ? '#38bdf8' : '#1e293b',
              color:      txRef.trim() ? '#0f172a' : '#475569',
              fontWeight:700, fontSize:14,
              cursor: (submitting || !txRef.trim()) ? 'not-allowed' : 'pointer',
              transition:'all .2s',
            }}
          >
            {submitting ? 'Submitting…' : "✓ I've paid — submit for approval"}
          </button>
          <p style={{ fontSize:11, color:'#475569', textAlign:'center', marginTop:8 }}>
            Your plan activates after we verify your payment (usually within a few hours on business days)
          </p>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PendingScreen
// ─────────────────────────────────────────────────────────────────────────────
function PendingScreen({ onRefresh, checking }) {
  return (
    <div style={{ textAlign:'center', padding:'10px 0' }}>
      <div style={{ fontSize:52, marginBottom:16 }}>⏳</div>
      <h2 style={{ color:'#f1f5f9', marginBottom:10 }}>Payment under review</h2>
      <p style={{ color:'#94a3b8', lineHeight:1.7, marginBottom:24, fontSize:15 }}>
        We've received your payment confirmation and are verifying it.
        Your account will be activated <strong style={{ color:'#f1f5f9' }}>within a few hours</strong> on business days.
      </p>
      <div style={{ background:'rgba(56,189,248,.06)', border:'1px solid rgba(56,189,248,.15)', borderRadius:10, padding:'12px 18px', marginBottom:24, fontSize:13, color:'#94a3b8' }}>
        Questions? Email us at{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color:'#38bdf8' }}>{SUPPORT_EMAIL}</a>
      </div>
      <button
        onClick={onRefresh}
        disabled={checking}
        style={{ background:'#0ea5e9', border:'none', borderRadius:9, color:'#fff', fontWeight:600, fontSize:14, padding:'11px 28px', cursor:'pointer', opacity: checking ? 0.7 : 1 }}
      >
        {checking ? 'Checking…' : '↻ Check if my account is activated'}
      </button>
    </div>
  );
}

const inpStyle = {
  width:'100%', padding:'10px 12px',
  background:'#0f172a', border:'1px solid #334155',
  borderRadius:8, color:'#f1f5f9', fontSize:14, boxSizing:'border-box',
};

const S = {
  gateWrap:  { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f172a', padding:'24px' },
  gateCard:  { maxWidth:960, width:'100%', background:'#0d1526', borderRadius:16, padding:'40px 32px', textAlign:'center' },
  gateTitle: { color:'#f1f5f9', fontSize:24, fontWeight:700, margin:'0 0 12px' },
  gateSub:   { color:'#94a3b8', fontSize:15, lineHeight:1.6, margin:'0 0 28px' },
  refreshBtn:{ background:'none', border:'1px solid #334155', color:'#64748b', padding:'8px 16px', borderRadius:8, cursor:'pointer', fontSize:13, marginTop:20 },
};
