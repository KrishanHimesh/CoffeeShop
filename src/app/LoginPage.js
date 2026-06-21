// ─────────────────────────────────────────────────────────────────────────────
// LoginPage.js  —  ENTERPRISE VERSION
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

const INDUSTRIES = [
  { id: 'bookshop', label: '📚 Bookshop / Stationery' },
  { id: 'grocery',  label: '🛒 Grocery / Convenience' },
  { id: 'pharmacy', label: '💊 Pharmacy / Health'     },
  { id: 'general',  label: '📦 General Retail'        },
];

function makeTenantId(businessName) {
  const slug = (businessName || 'store')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20);
  return `${slug}-${Math.random().toString(36).slice(2, 7)}`;
}

async function provisionTenant({ uid, email, businessName, industry, phone }) {
  const tenantId = makeTenantId(businessName);
  const now      = serverTimestamp();
  const batch    = writeBatch(db);

  console.log('[provisionTenant] Creating new store:', {
    tenantId,
    uid,
    email,
    businessName,
    industry,
    phone
  });

  batch.set(doc(db, 'stores', tenantId), {
    tenantId, ownerUid: uid, ownerEmail: email,
    ownerName: businessName, phone: phone || '',
    plan: 'trial', industry: industry || 'general', createdAt: now,
  });
  batch.set(doc(db, 'stores', tenantId, 'workers', uid), {
    uid, tenantId, name: businessName, email,
    phone: phone || '', role: 'owner', plan: 'trial', createdAt: now,
  });
  batch.set(doc(db, 'stores', tenantId, 'settings', 'main'), {
    businessName, companyName: '', currency: 'AUD', currencySymbol: '$',
    gstEnabled: true, gstRate: 10,
    receiptFooter: 'Thank you for shopping with us!', receiptFooter2: '',
    receiptPrefix: 'UN', receiptStartNum: 100,
    theme: 'dark', fontSize: 'md', dashFont: 'syne',
    customCategories: [], industry: industry || 'general', updatedAt: now,
  });
  batch.set(doc(db, 'subscriptions', tenantId), {
    tenantId, ownerUid: uid, ownerEmail: email, phone: phone || '',
    plan: 'trial', status: 'trialing',
    stripeCustomerId: null, currentPeriodEnd: null, createdAt: now,
  });
  batch.set(doc(db, 'userTenants', uid), {
    tenantId, role: 'owner', plan: 'trial', updatedAt: now,
  });

  console.log('[provisionTenant] Committing batch write...');
  await batch.commit();
  console.log('[provisionTenant] ✅ Batch committed successfully!');
  
  return tenantId;
}

export default function LoginPage({ onLogin, loading }) {
  const [mode,         setMode]         = useState('login');
  const [email,        setEmail]        = useState('');
  const [pass,         setPass]         = useState('');
  const [confirmPass,  setConfirmPass]  = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone,        setPhone]        = useState('');
  const [industry,     setIndustry]     = useState('bookshop');
  const [error,        setError]        = useState('');
  const [busy,         setBusy]         = useState(false);
  const [status,       setStatus]       = useState('');

  // ── Email/password login ──────────────────────────────────────────────────
  const handleLogin = async e => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const res = await onLogin(email.trim(), pass);
      if (!res.ok) { setError(res.error || 'Invalid email or password'); setBusy(false); }
    } catch (e) { setError('Login failed: ' + e.message); setBusy(false); }
  };

  // ── Google sign-in (existing accounts only) ───────────────────────────────
  // ── Email/password sign-up ────────────────────────────────────────────────
  const handleSignUp = async e => {
    e.preventDefault();
    setError('');
    if (!businessName.trim())  { setError('Please enter your business name'); return; }
    if (!phone.trim())          { setError('Phone number is required'); return; }
    if (!/^\+?[\d\s\-()]{7,}$/.test(phone.trim())) { setError('Please enter a valid phone number'); return; }
    if (pass.length < 8)        { setError('Password must be at least 8 characters'); return; }
    if (pass !== confirmPass)   { setError('Passwords do not match'); return; }

    setBusy(true);
    try {
      setStatus('Creating your account…');
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      await updateProfile(cred.user, { displayName: businessName.trim() });

      setStatus('Setting up your store…');
      await provisionTenant({
        uid: cred.user.uid, email: email.trim(),
        businessName: businessName.trim(), industry, phone: phone.trim(),
      });

      setStatus('Signing you in…');
      await new Promise(r => setTimeout(r, 800));
      const res = await onLogin(email.trim(), pass);
      if (!res.ok) {
        setError('Store created! Please sign in with your credentials.');
        setMode('login'); setBusy(false); setStatus('');
      }
    } catch (err) {
      const MSGS = {
        'auth/email-already-in-use': 'An account with this email already exists. Please sign in.',
        'auth/weak-password':        'Password must be at least 8 characters.',
        'auth/invalid-email':        'Please enter a valid email address.',
      };
      setError(MSGS[err.code] || err.message);
      setBusy(false); setStatus('');
    }
  };

  // ── Loading overlay ───────────────────────────────────────────────────────
  if (busy && status) return (
    <div className="bs-login-bg">
      <div className="bs-login-card" style={{ textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:16 }}>🎉</div>
        <h2 style={{ color:'#f1f5f9', marginBottom:8 }}>Setting up your store…</h2>
        <p style={{ color:'#64748b', lineHeight:1.6, marginBottom:24 }}>
          We're provisioning <strong style={{ color:'#38bdf8' }}>{businessName}</strong>.
          This takes just a moment.
        </p>
        <div className="bs-spinner" style={{ margin:'0 auto' }}/>
        <p style={{ color:'#475569', fontSize:13, marginTop:20 }}>{status}</p>
      </div>
    </div>
  );

  return (
    <div className="bs-login-bg">
      <div className="bs-login-card">
        <div className="bs-login-logo">
          <span className="bs-login-icon">🏬</span>
          <h1 className="bs-login-title">VendrPro</h1>
          <p className="bs-login-sub">Smart Business Management</p>
        </div>

        {/* Mode tabs */}
        <div style={{ display:'flex', gap:4, marginBottom:24, background:'rgba(255,255,255,.05)', borderRadius:10, padding:4 }}>
          {[{ id:'login', label:'Sign In' }, { id:'signup', label:'Create Store' }].map(m => (
            <button key={m.id} onClick={() => { setMode(m.id); setError(''); }}
              style={{
                flex:1, padding:'8px', borderRadius:7, border:'none',
                background: mode===m.id ? 'rgba(56,189,248,.15)' : 'transparent',
                color: mode===m.id ? '#38bdf8' : '#64748b',
                fontWeight: mode===m.id ? 600 : 400,
                cursor:'pointer', fontSize:14,
              }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* ── LOGIN ── */}
        {mode === 'login' && (
          <form className="bs-login-form" onSubmit={handleLogin}>
            <div className="bs-login-field">
              <label>Email</label>
              <input type="email" placeholder="your@email.com" value={email}
                onChange={e => setEmail(e.target.value)} autoComplete="username" required/>
            </div>
            <div className="bs-login-field">
              <label>Password</label>
              <input type="password" placeholder="••••••••" value={pass}
                onChange={e => setPass(e.target.value)} autoComplete="current-password" required/>
            </div>
            {error && <div className="bs-login-err">⚠ {error}</div>}
            <button className="bs-login-btn" disabled={busy || loading}>
              {busy ? 'Signing in…' : 'Sign In →'}
            </button>
          </form>
        )}

        {/* ── SIGN-UP ── */}
        {mode === 'signup' && (
          <form className="bs-login-form" onSubmit={handleSignUp}>
            <div className="bs-login-field">
              <label>Business Name *</label>
              <input type="text" placeholder="e.g. Unity Book Shop"
                value={businessName} onChange={e => setBusinessName(e.target.value)} required/>
            </div>

            <div className="bs-login-field">
              <label>Phone Number * <span style={{ color:'#475569', fontWeight:400, fontSize:11 }}>(required for account recovery)</span></label>
              <input type="tel" placeholder="+61 4xx xxx xxx"
                value={phone} onChange={e => setPhone(e.target.value)} required/>
            </div>

            <div className="bs-login-field">
              <label>Industry</label>
              <select value={industry} onChange={e => setIndustry(e.target.value)}
                style={{ width:'100%', padding:'10px 12px', borderRadius:8, background:'#0f172a', border:'1px solid #1e293b', color:'#f1f5f9', fontSize:14 }}>
                {INDUSTRIES.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
              </select>
            </div>

            <div className="bs-login-field">
              <label>Email *</label>
              <input type="email" placeholder="owner@email.com" value={email}
                onChange={e => setEmail(e.target.value)} autoComplete="username" required/>
            </div>

            <div className="bs-login-field">
              <label>Password * <span style={{ color:'#475569', fontWeight:400, fontSize:11 }}>(min. 8 characters)</span></label>
              <input type="password" placeholder="••••••••" value={pass}
                onChange={e => setPass(e.target.value)} autoComplete="new-password" required/>
            </div>

            <div className="bs-login-field">
              <label>Confirm Password *</label>
              <input type="password" placeholder="••••••••" value={confirmPass}
                onChange={e => setConfirmPass(e.target.value)} autoComplete="new-password" required/>
            </div>

            {error && <div className="bs-login-err">⚠ {error}</div>}

            <button className="bs-login-btn" disabled={busy}>
              {busy ? 'Creating store…' : 'Create Store & Start Free Trial →'}
            </button>

            <p style={{ fontSize:11, color:'#475569', textAlign:'center', marginTop:12, lineHeight:1.5 }}>
              7-day free trial — no credit card required.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
