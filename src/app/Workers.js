import React, { useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { ROLES, ROLE_LABELS } from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// Workers.js  —  ENTERPRISE VERSION
//
// Features:
//   - Add workers (creates Firebase Auth + Firestore doc)
//   - Edit worker name/role/phone
//   - Owner can reset any worker's password
//   - Any user can change their own password (from Settings)
//   - Workers inherit owner's subscription plan
// ─────────────────────────────────────────────────────────────────────────────

import {
  createUserWithEmailAndPassword,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendPasswordResetEmail,
  getAuth,
} from 'firebase/auth';

// ── Secondary Firebase app — used ONLY to create worker auth accounts ──────────
// This prevents createUserWithEmailAndPassword from switching the current session.
// The secondary app has no persistence so it doesn't touch the owner's session.
function getSecondaryAuth() {
  const secondaryAppName = '__worker_creation__';
  const existing = getApps().find(a => a.name === secondaryAppName);
  if (existing) return getAuth(existing);
  const primaryApp = getApps().find(a => a.name === '[DEFAULT]');
  const secondaryApp = initializeApp(primaryApp.options, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);
  // No persistence needed — we sign out immediately after getting the UID
  return secondaryAuth;
}

const BLANK = { name:'', email:'', password:'', role: ROLES.CASHIER, phone:'' };

// ── Create worker auth account using secondary app — owner stays signed in ────
// The secondary Firebase app instance runs in isolation with no persistence,
// so createUserWithEmailAndPassword on it never touches the owner's session.
async function createWorkerAccount({ tenantId, workerData, ownerPlan }) {
  const { name, email, password, role, phone } = workerData;
  const inheritedPlan = ownerPlan || 'trial';

  // Create worker account on secondary app — owner stays logged in on primary
  const secondaryAuth = getSecondaryAuth();
  const workerCred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  const workerUid  = workerCred.user.uid;

  // Set display name on secondary app
  try { await updateProfile(workerCred.user, { displayName: name }); } catch {}

  // Sign out of secondary app immediately — we only needed the UID
  try { await secondaryAuth.signOut(); } catch {}

  // Write Firestore docs (uses primary app DB — owner's auth is still active)
  await setDoc(doc(db, 'stores', tenantId, 'workers', workerUid), {
    uid: workerUid, tenantId, name, email, role,
    plan: inheritedPlan, phone: phone || '', createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'userTenants', workerUid), {
    tenantId, role, plan: inheritedPlan, updatedAt: serverTimestamp(),
  });

  return workerUid;
}

export default function Workers({ workers, onAdd, onUpdate, onDelete, profile, tenantId }) {
  const [modal,        setModal]        = useState(null); // 'add'|'edit'
  const [confirm,      setConfirm]      = useState(null);
  const [showPw,       setShowPw]       = useState({});
  const [creating,     setCreating]     = useState(false);
  const [createError,  setCreateError]  = useState('');
  // Secondary app handles worker creation — no owner password needed

  // Password change/reset modals
  const [pwModal,      setPwModal]      = useState(null); // { type:'self'|'reset', worker }

  // ── Add / Edit worker ─────────────────────────────────────────────────────
  const handleSave = async (data) => {
    setCreateError('');
    if (data.id) {
      await onUpdate(data.id, data);
      setModal(null);
      return;
    }
    setCreating(true);
    try {
      await createWorkerAccount({
        tenantId,
        workerData: data,
        ownerPlan:  profile?.plan || 'trial',
      });
      setModal(null);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setCreateError('A worker with this email already exists.');
      } else if (err.code === 'auth/weak-password') {
        setCreateError('Password must be at least 8 characters.');
      } else if (err.code === 'auth/invalid-email') {
        setCreateError('Please enter a valid email address.');
      } else {
        // Fallback — save Firestore record only (worker can't log in but is recorded)
        try { await onAdd({ ...data, plan: profile?.plan || 'trial' }); setModal(null); }
        catch (e2) { setCreateError('Error: ' + (e2.message || err.message)); }
      }
    }
    setCreating(false);
  };


  // ── Password reset (sends email) ──────────────────────────────────────────
  const sendResetEmail = async (workerEmail) => {
    try {
      await sendPasswordResetEmail(auth, workerEmail);
      setPwModal({ ...pwModal, sent: true });
    } catch (e) {
      setPwModal({ ...pwModal, error: e.message });
    }
  };

  return (
    <div className="bs-workers">
      <div className="bs-inv-bar">
        <div>
          <h2 className="bs-h2" style={{ margin:0 }}>Workers & Access</h2>
          {tenantId && (
            <p style={{ margin:'4px 0 0', fontSize:11, color:'#334155', fontFamily:'monospace' }}>
              Store ID: {tenantId}
            </p>
          )}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="bs-sec" style={{ fontSize:13 }}
            onClick={() => setPwModal({ type:'self', worker: profile })}>
            🔑 Change My Password
          </button>
          <button className="bs-add"
            onClick={() => { setCreateError(''); setModal({ data: null }); }}>
            + Add Worker
          </button>
        </div>
      </div>

      {/* Worker cards */}
      <div className="bs-workers-grid">
        {workers.map(w => (
          <div key={w.id} className="bs-worker-card">
            <div className="bs-wc-avatar">{(w.name || '?')[0].toUpperCase()}</div>
            <div className="bs-wc-info">
              <p className="bs-wc-name">{w.name}</p>
              <p className="bs-wc-email">{w.email}</p>
              <p className="bs-wc-phone">{w.phone || '—'}</p>
            </div>
            <div className="bs-wc-role">
              <span className={'bs-role-badge ' + w.role}>{ROLE_LABELS[w.role]}</span>
            </div>
            <div className="bs-wc-pw">
              <span style={{ fontFamily:"'Space Mono',monospace", fontSize:'12px', color:'#64748b' }}>
                {showPw[w.id] ? (w.password || '(Firebase Auth)') : '••••••••'}
              </span>
              <button className="bs-pw-toggle"
                onClick={() => setShowPw(p => ({ ...p, [w.id]: !p[w.id] }))}>
                {showPw[w.id] ? '🙈' : '👁'}
              </button>
            </div>
            <div className="bs-wc-actions">
              {w.id !== profile?.id && profile?.role === 'owner' && (
                <>
                  <button className="bs-act edit"
                    onClick={() => { setCreateError(''); setModal({ data: { ...w } }); }}>
                    Edit
                  </button>
                  <button
                    style={{ padding:'3px 8px', background:'rgba(56,189,248,.1)', border:'1px solid rgba(56,189,248,.2)', borderRadius:6, color:'#38bdf8', cursor:'pointer', fontSize:11, marginRight:4 }}
                    onClick={() => setPwModal({ type:'reset', worker: w })}>
                    🔑 Reset PW
                  </button>
                  <button className="bs-act del" onClick={() => setConfirm(w.id)}>
                    Remove
                  </button>
                </>
              )}
              {w.id === profile?.id && (
                <span className="bs-muted" style={{ fontSize:'11px' }}>← You</span>
              )}
            </div>
          </div>
        ))}
        {workers.length === 0 && (
          <div className="bs-worker-card empty">
            <p className="bs-muted">No workers yet. Add workers so they can log in with their own email and password.</p>
          </div>
        )}
      </div>

      {/* Plan info */}
      <div style={{ marginTop:16, background:'rgba(56,189,248,.06)', border:'1px solid rgba(56,189,248,.12)', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#64748b' }}>
        💡 <strong style={{ color:'#38bdf8' }}>Starter:</strong> 1 user ·{' '}
        <strong style={{ color:'#38bdf8' }}>Pro:</strong> up to 5 users ·{' '}
        <strong style={{ color:'#c084fc' }}>Business:</strong> unlimited users
      </div>

      {/* Permissions table */}
      <div className="bs-perm-table-wrap" style={{ marginTop:20 }}>
        <p className="bs-dcard-ttl" style={{ marginBottom:'12px' }}>Role Permissions</p>
        <table className="bs-tbl">
          <thead>
            <tr>
              <th>Permission</th>
              <th>👑 Owner</th>
              <th>🔧 Manager</th>
              <th>🛒 Cashier</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['View Dashboard',   true,  true,  false],
              ['POS / Make Sales', true,  true,  true ],
              ['Manage Inventory', true,  true,  false],
              ['View All Reports', true,  true,  false],
              ['Manage Workers',   true,  false, false],
              ['Adjust Prices',    true,  true,  false],
              ['Delete Records',   true,  false, false],
            ].map(([label, ...perms]) => (
              <tr key={label}>
                <td>{label}</td>
                {perms.map((p, i) => (
                  <td key={i} style={{ textAlign:'center' }}>{p ? '✅' : '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Add/Edit modal ── */}
      {modal && (
        <div className="bs-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <WorkerForm worker={modal.data} onSave={handleSave} onClose={() => setModal(null)} creating={creating} error={createError}/>
        </div>
      )}


      {/* ── Password change / reset modal ── */}
      {pwModal && (
        <PasswordModal
          type={pwModal.type}
          worker={pwModal.worker}
          currentUser={auth.currentUser}
          onSendReset={sendResetEmail}
          onClose={() => setPwModal(null)}
          sent={pwModal.sent}
          error={pwModal.error}
        />
      )}

      {/* ── Delete confirm ── */}
      {confirm && (
        <div className="bs-overlay" onClick={e => e.target === e.currentTarget && setConfirm(null)}>
          <div className="bs-modal" style={{ maxWidth:'360px', padding:'28px' }}>
            <h3 style={{ marginBottom:'12px' }}>Remove Worker?</h3>
            <p className="bs-muted" style={{ marginBottom:'20px' }}>They will no longer be able to log in to this store.</p>
            <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
              <button className="bs-sec" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="bs-act del" style={{ padding:'9px 18px' }}
                onClick={async () => { await onDelete(confirm); setConfirm(null); }}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Password modal — handles both "change my password" and "reset worker password" ──
function PasswordModal({ type, worker, currentUser, onSendReset, onClose, sent, error: outerError }) {
  const [step,       setStep]       = useState('main'); // 'main' | 'confirm' | 'done' | 'error'
  const [currentPw,  setCurrentPw]  = useState('');
  const [newPw,      setNewPw]      = useState('');
  const [confirmPw,  setConfirmPw]  = useState('');
  const [busy,       setBusy]       = useState(false);
  const [errMsg,     setErrMsg]     = useState('');
  const [showPws,    setShowPws]    = useState(false);

  const isSelf = type === 'self';

  const handleChangeSelf = async () => {
    if (!currentPw)              { setErrMsg('Please enter your current password.'); return; }
    if (newPw.length < 8)        { setErrMsg('New password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw)     { setErrMsg('New passwords do not match.'); return; }
    if (newPw === currentPw)     { setErrMsg('New password must be different from current.'); return; }
    setBusy(true); setErrMsg('');
    try {
      // Re-authenticate first (required by Firebase for security-sensitive operations)
      const credential = EmailAuthProvider.credential(currentUser.email, currentPw);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPw);
      setStep('done');
    } catch (e) {
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        setErrMsg('Current password is incorrect.');
      } else if (e.code === 'auth/too-many-requests') {
        setErrMsg('Too many attempts. Please try again later.');
      } else {
        setErrMsg('Error: ' + e.message);
      }
    }
    setBusy(false);
  };

  if (step === 'done') return (
    <div className="bs-overlay">
      <div className="bs-modal" style={{ maxWidth:'380px', padding:'28px', textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
        <h3 style={{ color:'#4ade80', marginBottom:8 }}>Password changed!</h3>
        <p style={{ color:'#94a3b8', fontSize:14, marginBottom:20 }}>
          Your password has been updated successfully.
        </p>
        <button className="bs-pri" onClick={onClose} style={{ width:'100%' }}>Done</button>
      </div>
    </div>
  );

  return (
    <div className="bs-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bs-modal" style={{ maxWidth:'400px', padding:'28px' }}>
        <div className="bs-mhdr" style={{ marginBottom:16 }}>
          <h3 style={{ color:'#f1f5f9', margin:0 }}>
            {isSelf ? '🔑 Change My Password' : `🔑 Reset Password — ${worker?.name}`}
          </h3>
          <button className="bs-mx" onClick={onClose}>✕</button>
        </div>

        {/* ── Self password change ── */}
        {isSelf && (
          <>
            <div style={{ marginBottom:12 }}>
              <label style={lbl}>Current Password</label>
              <div style={{ position:'relative' }}>
                <input
                  type={showPws ? 'text' : 'password'}
                  placeholder="Enter current password"
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                  style={inp}
                />
              </div>
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={lbl}>New Password <span style={{ color:'#475569', fontWeight:400 }}>(min. 8 characters)</span></label>
              <input type={showPws ? 'text' : 'password'} placeholder="New password"
                value={newPw} onChange={e => setNewPw(e.target.value)} style={inp}/>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={lbl}>Confirm New Password</label>
              <input type={showPws ? 'text' : 'password'} placeholder="Repeat new password"
                value={confirmPw} onChange={e => setConfirmPw(e.target.value)} style={inp}/>
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#64748b', marginBottom:14, cursor:'pointer' }}>
              <input type="checkbox" checked={showPws} onChange={e => setShowPws(e.target.checked)}/>
              Show passwords
            </label>

            {errMsg && <p style={{ color:'#f87171', fontSize:13, marginBottom:10 }}>⚠ {errMsg}</p>}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="bs-sec" onClick={onClose}>Cancel</button>
              <button className="bs-pri" onClick={handleChangeSelf} disabled={busy}>
                {busy ? 'Changing…' : 'Change Password'}
              </button>
            </div>
          </>
        )}

        {/* ── Owner reset worker password ── */}
        {!isSelf && !sent && (
          <>
            <div style={{ background:'rgba(56,189,248,.06)', border:'1px solid rgba(56,189,248,.15)', borderRadius:10, padding:'14px', marginBottom:16, fontSize:13 }}>
              <p style={{ margin:'0 0 6px', color:'#94a3b8' }}>
                Worker: <strong style={{ color:'#f1f5f9' }}>{worker?.name}</strong>
              </p>
              <p style={{ margin:'0 0 6px', color:'#94a3b8' }}>
                Email: <strong style={{ color:'#38bdf8' }}>{worker?.email}</strong>
              </p>
              <p style={{ margin:0, color:'#94a3b8', fontSize:12, lineHeight:1.6 }}>
                A password reset email will be sent to this address. The worker clicks the link to set a new password.
              </p>
            </div>

            {(outerError || errMsg) && (
              <p style={{ color:'#f87171', fontSize:13, marginBottom:10 }}>
                ⚠ {outerError || errMsg}
              </p>
            )}

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="bs-sec" onClick={onClose}>Cancel</button>
              <button className="bs-pri" onClick={() => onSendReset(worker?.email)} disabled={busy}>
                📧 Send Reset Email
              </button>
            </div>
          </>
        )}

        {/* ── Email sent confirmation ── */}
        {!isSelf && sent && (
          <div style={{ textAlign:'center', padding:'10px 0' }}>
            <div style={{ fontSize:44, marginBottom:12 }}>📧</div>
            <h3 style={{ color:'#4ade80', margin:'0 0 8px' }}>Reset email sent!</h3>
            <p style={{ color:'#94a3b8', fontSize:14, lineHeight:1.6, marginBottom:20 }}>
              A password reset link has been sent to{' '}
              <strong style={{ color:'#f1f5f9' }}>{worker?.email}</strong>.
              The worker should check their inbox and spam folder.
            </p>
            <button className="bs-pri" onClick={onClose} style={{ width:'100%' }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Worker add/edit form ──────────────────────────────────────────────────────
function WorkerForm({ worker, onSave, onClose, creating, error }) {
  const [f, setF] = useState(worker || BLANK);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <div className="bs-modal">
      <div className="bs-mhdr">
        <h3>{worker ? 'Edit Worker' : 'Add Worker'}</h3>
        <button className="bs-mx" onClick={onClose}>✕</button>
      </div>
      <form className="bs-form" onSubmit={e => { e.preventDefault(); onSave(f); }}>
        <div className="bs-frow">
          <div className="bs-fg">
            <label>FULL NAME *</label>
            <input value={f.name} onChange={e => set('name', e.target.value)} required placeholder="Worker name"/>
          </div>
          <div className="bs-fg">
            <label>PHONE</label>
            <input value={f.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="+61 4xx xxx xxx"/>
          </div>
        </div>
        <div className="bs-fg">
          <label>EMAIL / USERNAME *</label>
          <input type="email" value={f.email} onChange={e => set('email', e.target.value)}
            required placeholder="worker@email.com" disabled={!!worker}/>
          {worker && <p style={{ fontSize:11, color:'#475569', marginTop:4 }}>Email cannot be changed after creation.</p>}
        </div>
        {!worker && (
          <div className="bs-fg">
            <label>PASSWORD *</label>
            <input type="text" value={f.password || ''} onChange={e => set('password', e.target.value)}
              required placeholder="Set a login password (min. 8 characters)"/>
          </div>
        )}
        <div className="bs-fg">
          <label>ROLE</label>
          <select value={f.role} onChange={e => set('role', e.target.value)}>
            {Object.entries(ROLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="bs-role-info">
          {f.role === ROLES.OWNER   && <p>👑 <strong>Owner:</strong> Full access including workers and reports.</p>}
          {f.role === ROLES.MANAGER && <p>🔧 <strong>Manager:</strong> Inventory + reports. Cannot manage workers.</p>}
          {f.role === ROLES.CASHIER && <p>🛒 <strong>Cashier:</strong> POS only. No reports or inventory changes.</p>}
        </div>
        {error && (
          <div style={{ background:'#450a0a', color:'#fca5a5', padding:'10px 12px', borderRadius:8, fontSize:13, marginBottom:8 }}>
            ⚠ {error}
          </div>
        )}
        <div className="bs-fa">
          <button type="button" className="bs-sec" onClick={onClose}>Cancel</button>
          <button type="submit" className="bs-pri" disabled={creating}>
            {creating ? 'Creating…' : worker ? 'Save Changes' : 'Add Worker'}
          </button>
        </div>
      </form>
    </div>
  );
}

const lbl = { display:'block', marginBottom:4, fontSize:12, color:'#94a3b8' };
const inp = { width:'100%', padding:'10px 12px', background:'#0f172a', border:'1px solid #334155', borderRadius:8, color:'#f1f5f9', fontSize:14, boxSizing:'border-box' };
