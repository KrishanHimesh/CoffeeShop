// ─────────────────────────────────────────────────────────────────────────────
// SupportWidget.js — Floating support & feedback button
//
// Appears bottom-left on every page (app + login + pricing wall).
// Two modes: Support (bug / question) and Feedback (feature idea / rating).
//
// Email delivery via EmailJS — free tier: 200 emails/month, no backend needed.
//
// SETUP (5 minutes):
//   1. Go to https://emailjs.com → Create free account
//   2. Email Services → Add Service → Gmail → connect your Gmail
//   3. Email Templates → Create Template, set:
//        To:      krishanhimesh@gmail.com
//        Subject: {{subject}}
//        Body:    From: {{from_name}} ({{from_email}})
//                 Store: {{store_name}}
//                 Type: {{type}}
//                 Message: {{message}}
//   4. Copy your Service ID, Template ID, Public Key
//   5. Paste them into the CONFIG block below
//
// Until EmailJS is set up, the widget stores submissions in Firestore
// (/supportRequests/) as a fallback — you can read them in Firebase Console.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// ── CONFIGURE YOUR EMAILJS DETAILS HERE ──────────────────────────────────────
const EMAILJS_CONFIG = {
  serviceId:   'service_ffwavkv',    // ✅ Gmail service
  templateId:  'template_9mvxd6v',   // ✅ main template
  autoReplyId: 'template_ayyxvp9',   // ✅ auto-reply to user
  publicKey:   'APi_ENA19Ymke5qUI',  // ✅ public key
  toEmail:     'krishanhimesh@gmail.com',
};
const EMAILJS_CONFIGURED = true; // ✅ credentials are set
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'support',  label: '🛠 Support',  icon: '🛠', color: '#38bdf8' },
  { id: 'feedback', label: '💬 Feedback', icon: '💬', color: '#c084fc' },
];

const RATINGS = ['😞', '😐', '🙂', '😊', '🤩'];

export default function SupportWidget({ profile, settings }) {
  const [open,       setOpen]       = useState(false);
  const [tab,        setTab]        = useState('support');
  const [form,       setForm]       = useState({ name:'', email:'', subject:'', message:'' });
  const [rating,     setRating]     = useState(null);
  const [busy,       setBusy]       = useState(false);
  const [sent,       setSent]       = useState(false);
  const [error,      setError]      = useState('');
  const [pulse,      setPulse]      = useState(false);
  const widgetRef = useRef(null);

  // Pre-fill from profile if logged in
  useEffect(() => {
    if (profile) {
      setForm(f => ({
        ...f,
        name:  f.name  || profile.name  || '',
        email: f.email || profile.email || '',
      }));
    }
  }, [profile]);

  // Pulse animation every 45 seconds to draw attention
  useEffect(() => {
    const t = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 1000);
    }, 45000);
    return () => clearInterval(t);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Reset form when opening
  const handleOpen = () => {
    setSent(false); setError('');
    setOpen(o => !o);
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const buildSubject = () => {
    const storeName = settings?.businessName || profile?.email || 'Unknown Store';
    if (tab === 'support') return form.subject || `Support Request — ${storeName}`;
    return `Feedback (${RATINGS[rating] || '—'}) — ${storeName}`;
  };

  const buildMessage = () => {
    if (tab === 'feedback') {
      return `Rating: ${rating !== null ? RATINGS[rating] + ' (' + (rating + 1) + '/5)' : 'Not rated'}\n\n${form.message}`;
    }
    return form.message;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim())    { setError('Please enter your name.'); return; }
    if (!form.email.trim())   { setError('Please enter your email.'); return; }
    if (!form.message.trim()) { setError('Please enter a message.'); return; }
    if (tab === 'feedback' && rating === null) { setError('Please select a rating.'); return; }

    setBusy(true);

    const storeName = settings?.businessName || 'Unknown Store';
    const subject   = buildSubject();
    const message   = buildMessage();

    // ── Send via EmailJS ──────────────────────────────────────────────────
    let emailSent = false;
    if (EMAILJS_CONFIGURED) {
      try {
        // Load EmailJS SDK if not already loaded (same library as @emailjs/browser)
        if (!window.emailjs) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
            s.onload = () => { window.emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey }); resolve(); };
            s.onerror = reject;
            document.head.appendChild(s);
          });
        }

        // 1. Send notification to you (krishanhimesh@gmail.com)
        await window.emailjs.send(
          EMAILJS_CONFIG.serviceId,
          EMAILJS_CONFIG.templateId,
          {
            from_name:  form.name.trim(),
            from_email: form.email.trim(),
            store_name: storeName,
            type:       tab === 'support' ? 'Support Request' : 'Feedback',
            subject,
            message,
            to_email:   EMAILJS_CONFIG.toEmail,
          }
        );

        // 2. Auto-reply to the user
        await window.emailjs.send(
          EMAILJS_CONFIG.serviceId,
          EMAILJS_CONFIG.autoReplyId,
          {
            to_name:  form.name.trim(),
            to_email: form.email.trim(),
            subject,
            message,
          }
        );

        emailSent = true;
      } catch (err) {
        console.error('[SupportWidget] EmailJS error:', err);
        // Fall through to Firestore backup — message is still saved
      }
    }

    // ── Always save to Firestore as backup ────────────────────────────────
    try {
      await addDoc(collection(db, 'supportRequests'), {
        type:       tab,
        fromName:   form.name.trim(),
        fromEmail:  form.email.trim(),
        storeName,
        subject,
        message,
        rating:     tab === 'feedback' ? rating + 1 : null,
        ratingEmoji:tab === 'feedback' ? RATINGS[rating] : null,
        emailSent,
        tenantId:   profile?.tenantId || null,
        createdAt:  serverTimestamp(),
      });
    } catch (fbErr) {
      console.warn('[SupportWidget] Firestore save failed:', fbErr.message);
    }

    setBusy(false);
    setSent(true);

    // Reset after 5 seconds
    setTimeout(() => {
      setSent(false);
      setForm(f => ({ ...f, subject:'', message:'' }));
      setRating(null);
      setOpen(false);
    }, 4000);
  };

  return (
    <div ref={widgetRef} style={S.root}>
      {/* ── Floating button ── */}
      <button
        onClick={handleOpen}
        title="Support & Feedback"
        aria-label="Open support and feedback"
        style={{
          ...S.fab,
          transform: open ? 'rotate(45deg) scale(1.05)' : pulse ? 'scale(1.12)' : 'scale(1)',
          boxShadow: open
            ? '0 4px 20px rgba(56,189,248,.5)'
            : pulse
            ? '0 4px 24px rgba(56,189,248,.6)'
            : '0 4px 16px rgba(0,0,0,.4)',
        }}
      >
        {open ? '✕' : '💬'}
      </button>

      {/* ── Tooltip label (shows when closed) ── */}
      {!open && (
        <div style={S.tooltip}>Support & Feedback</div>
      )}

      {/* ── Popup panel ── */}
      {open && (
        <div style={S.panel}>
          {/* Header */}
          <div style={S.header}>
            <div>
              <p style={S.headerTitle}>How can we help?</p>
              <p style={S.headerSub}>We usually respond within a few hours</p>
            </div>
            <button onClick={() => setOpen(false)} style={S.closeBtn}>✕</button>
          </div>

          {/* Tab switcher */}
          <div style={S.tabBar}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setSent(false); setError(''); }}
                style={{
                  ...S.tabBtn,
                  background:  tab===t.id ? `rgba(${t.id==='support'?'56,189,248':'192,132,252'},.15)` : 'transparent',
                  color:       tab===t.id ? t.color : '#64748b',
                  borderBottom:`2px solid ${tab===t.id ? t.color : 'transparent'}`,
                }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Success state */}
          {sent ? (
            <div style={S.successBox}>
              <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
              <p style={{ color:'#4ade80', fontWeight:700, fontSize:16, margin:'0 0 6px' }}>
                {tab === 'feedback' ? 'Thanks for your feedback!' : 'Request received!'}
              </p>
              <p style={{ color:'#64748b', fontSize:13, lineHeight:1.6 }}>
                {tab === 'feedback'
                  ? "We really appreciate you taking the time. Your input helps us improve."
                  : `We'll get back to you at ${form.email} within a few hours.`}
              </p>
            </div>
          ) : (
            <form onSubmit={submit} style={S.form}>

              {/* Name + Email row */}
              <div style={S.row}>
                <div style={S.field}>
                  <label style={S.lbl}>Your Name *</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder="John Smith" style={S.inp} required/>
                </div>
                <div style={S.field}>
                  <label style={S.lbl}>Email *</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                    placeholder="you@email.com" style={S.inp} required/>
                </div>
              </div>

              {/* Support: subject line */}
              {tab === 'support' && (
                <div style={{ marginBottom:10 }}>
                  <label style={S.lbl}>Subject</label>
                  <select value={form.subject} onChange={e => set('subject', e.target.value)} style={{ ...S.inp, cursor:'pointer' }}>
                    <option value="">— Select a topic —</option>
                    <option value="Login or access issue">🔐 Login or access issue</option>
                    <option value="POS or sales problem">🛒 POS or sales problem</option>
                    <option value="Inventory question">📦 Inventory question</option>
                    <option value="Subscription or billing">💳 Subscription or billing</option>
                    <option value="Worker or permissions issue">👥 Worker or permissions issue</option>
                    <option value="Feature not working">🐛 Feature not working</option>
                    <option value="Data or report question">📊 Data or report question</option>
                    <option value="Other">💬 Other</option>
                  </select>
                </div>
              )}

              {/* Feedback: star rating */}
              {tab === 'feedback' && (
                <div style={{ marginBottom:12 }}>
                  <label style={S.lbl}>How would you rate VendrPro? *</label>
                  <div style={{ display:'flex', gap:8, marginTop:4 }}>
                    {RATINGS.map((emoji, i) => (
                      <button key={i} type="button"
                        onClick={() => setRating(i)}
                        title={['Poor','Fair','Good','Great','Excellent'][i]}
                        style={{
                          fontSize:28, background:'none', border:'none',
                          cursor:'pointer', padding:'4px 6px', borderRadius:8,
                          filter: rating===null||rating===i ? 'none' : 'grayscale(1) opacity(.4)',
                          transform: rating===i ? 'scale(1.3)' : 'scale(1)',
                          transition:'all .15s',
                        }}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                  {rating !== null && (
                    <p style={{ fontSize:11, color:'#64748b', marginTop:4 }}>
                      {['Poor — help us understand what went wrong',
                        'Fair — what could we do better?',
                        'Good — what would make it great?',
                        'Great — what do you love most?',
                        'Excellent — you made our day! 🎉'][rating]}
                    </p>
                  )}
                </div>
              )}

              {/* Message */}
              <div style={{ marginBottom:10 }}>
                <label style={S.lbl}>
                  {tab === 'support' ? 'Describe the issue *' : 'Your feedback *'}
                </label>
                <textarea
                  value={form.message}
                  onChange={e => set('message', e.target.value)}
                  placeholder={tab === 'support'
                    ? 'Please describe what happened and what you were trying to do…'
                    : 'Tell us what you love, what frustrates you, or what you\'d like to see…'}
                  rows={4}
                  style={{ ...S.inp, resize:'vertical', fontFamily:'inherit', lineHeight:1.5 }}
                  required
                />
              </div>

              {/* Store name (auto-filled, shown for context) */}
              {settings?.businessName && (
                <p style={{ fontSize:11, color:'#334155', marginBottom:8 }}>
                  📍 Sending from: <strong style={{ color:'#475569' }}>{settings.businessName}</strong>
                </p>
              )}

              {error && (
                <p style={{ color:'#f87171', fontSize:12, marginBottom:8 }}>⚠ {error}</p>
              )}

              <button type="submit" disabled={busy}
                style={{
                  width:'100%', padding:'11px', borderRadius:9, border:'none',
                  background: tab==='support' ? '#0ea5e9' : '#9333ea',
                  color:'#fff', fontWeight:700, fontSize:14,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.7 : 1,
                  transition:'opacity .2s',
                }}>
                {busy ? 'Sending…' : tab==='support' ? '📤 Send Support Request' : '💬 Submit Feedback'}
              </button>

              {!EMAILJS_CONFIGURED && (
                <p style={{ fontSize:10, color:'#334155', textAlign:'center', marginTop:6, lineHeight:1.5 }}>
                  ⚙ EmailJS not configured yet — messages are saved internally.
                  See <code>SupportWidget.js</code> for setup instructions.
                </p>
              )}
            </form>
          )}

          {/* Footer */}
          <div style={S.footer}>
            <span>📧 {EMAILJS_CONFIG.toEmail}</span>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  root: {
    position: 'fixed',
    bottom:   24,
    left:     24,
    zIndex:   9999,
    fontFamily:'Inter, sans-serif',
  },
  fab: {
    width:  52,
    height: 52,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
    border: 'none',
    color: '#fff',
    fontSize: 22,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform .2s, box-shadow .2s',
    position: 'relative',
    zIndex: 2,
  },
  tooltip: {
    position: 'absolute',
    bottom: 58,
    left: 0,
    background: '#1e293b',
    color: '#94a3b8',
    fontSize: 11,
    padding: '4px 10px',
    borderRadius: 6,
    whiteSpace: 'nowrap',
    border: '1px solid #334155',
    pointerEvents: 'none',
    opacity: 0,
    animation: 'none',
  },
  panel: {
    position: 'absolute',
    bottom: 64,
    left: 0,
    width: 360,
    maxHeight: '80vh',
    overflowY: 'auto',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 16,
    boxShadow: '0 20px 60px rgba(0,0,0,.6)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '16px 18px 12px',
    borderBottom: '1px solid #1e293b',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    background: 'linear-gradient(135deg, rgba(14,165,233,.1), rgba(99,102,241,.1))',
    borderRadius: '16px 16px 0 0',
  },
  headerTitle: { margin:0, fontSize:16, fontWeight:700, color:'#f1f5f9' },
  headerSub:   { margin:'3px 0 0', fontSize:12, color:'#64748b' },
  closeBtn:    { background:'none', border:'none', color:'#475569', cursor:'pointer', fontSize:16, padding:'2px 6px' },
  tabBar:  { display:'flex', borderBottom:'1px solid #1e293b' },
  tabBtn:  { flex:1, padding:'10px 8px', border:'none', cursor:'pointer', fontSize:13, fontWeight:500, transition:'all .15s', background:'transparent' },
  form:    { padding:'14px 16px', display:'flex', flexDirection:'column', gap:0 },
  row:     { display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 },
  field:   { display:'flex', flexDirection:'column' },
  lbl:     { fontSize:11, color:'#64748b', marginBottom:4, fontWeight:500 },
  inp:     {
    width: '100%',
    padding: '9px 11px',
    background: '#0a0f1e',
    border: '1px solid #1e293b',
    borderRadius: 8,
    color: '#f1f5f9',
    fontSize: 13,
    boxSizing: 'border-box',
    outline: 'none',
  },
  successBox: {
    padding: '32px 20px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  footer: {
    padding: '10px 16px',
    borderTop: '1px solid #0f172a',
    fontSize: 11,
    color: '#334155',
    background: '#080d1a',
    borderRadius: '0 0 16px 16px',
    textAlign: 'center',
  },
};
