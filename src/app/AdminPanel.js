// ─────────────────────────────────────────────────────────────────────────────
// AdminPanel.js  —  Super Admin Portal
// Access at: yourdomain.com/admin
// Gate: email must match REACT_APP_ADMIN_EMAIL env var
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, setDoc, getDocs, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

// ── Admin email config ──────────────────────────────────────────────────────
// Add your email here as a permanent fallback (safe — this is your own app).
// Also set REACT_APP_ADMIN_EMAIL in your .env and Vercel env vars.
const HARDCODED_ADMIN_EMAILS = [
  'krishanhimesh@gmail.com',   // ← your email, always has access
];
const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL || '';

const INDUSTRIES = [
  { id:'bookshop', label:'📚 Bookshop'  },
  { id:'grocery',  label:'🛒 Grocery'   },
  { id:'pharmacy', label:'💊 Pharmacy'  },
  { id:'general',  label:'📦 General'   },
];

const PLAN_META = {
  none:    { bg:'#1e293b', color:'#64748b', label:'No Plan'    },
  trial:   { bg:'#1c3a2e', color:'#86efac', label:'Trial'      },
  pending: { bg:'#3a2e1e', color:'#fbbf24', label:'⏳ Pending' },
  starter: { bg:'#1e3a1e', color:'#4ade80', label:'Starter'    },
  pro:     { bg:'#1e2d4a', color:'#38bdf8', label:'Pro'        },
  business:{ bg:'#2d1e4a', color:'#c084fc', label:'Business'   },
};

function PlanBadge({ plan }) {
  const m = PLAN_META[plan] || PLAN_META.none;
  return (
    <span style={{ background:m.bg, color:m.color, padding:'2px 10px', borderRadius:12, fontSize:12, whiteSpace:'nowrap' }}>
      {m.label}
    </span>
  );
}

export default function AdminPanel() {
  const [adminUser,    setAdminUser]    = useState(null);
  const [isAdmin,      setIsAdmin]      = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [tab,          setTab]          = useState('subscriptions');

  // Catalogue
  const [industry,  setIndustry]  = useState('bookshop');
  const [products,  setProducts]  = useState([]);

  // Subscriptions
  const [allSubs,   setAllSubs]   = useState([]);

  // Tenants
  const [tenants,   setTenants]   = useState([]);

  // UI
  const [modal,        setModal]        = useState(null);
  const [editItem,     setEditItem]     = useState(null);
  const [approveModal, setApproveModal] = useState(null);
  const [extendModal,  setExtendModal]  = useState(null);
  const [catTab,       setCatTab]       = useState('browse'); // 'browse'|'import'|'export'|'categories'
  const [csvText,      setCsvText]      = useState('');
  const [saving,       setSaving]       = useState(false);
  const [toast,        setToast]        = useState(null);

  // ── Auth check ──────────────────────────────────────────────────────────
  useEffect(() => {
    return onAuthStateChanged(auth, async u => {
      if (!u) { setIsAdmin(false); setCheckingAuth(false); return; }
      setAdminUser(u);
      try {
        const token = await u.getIdTokenResult(true);
        const emailMatch = (ADMIN_EMAIL && u.email === ADMIN_EMAIL) ||
                             HARDCODED_ADMIN_EMAILS.includes(u.email);
        const ok = !!token.claims.platformAdmin || emailMatch;
        console.log('[AdminPanel] auth check:', {
          email: u.email, adminEmail: ADMIN_EMAIL,
          emailMatch, platformAdmin: !!token.claims.platformAdmin, ok
        });
        setIsAdmin(ok);
      } catch { setIsAdmin(false); }
      setCheckingAuth(false);
    });
  }, []);

  // ── Shared catalogue listener ───────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin || tab !== 'catalogue') return;
    const unsub = onSnapshot(
      query(collection(db, 'sharedCatalogues', industry, 'products'), orderBy('name')),
      snap => setProducts(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    );
    return unsub;
  }, [isAdmin, tab, industry]);

  // ── Subscriptions listener ──────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(
      collection(db, 'subscriptions'),
      snap => setAllSubs(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    );
    return unsub;
  }, [isAdmin]);

  // ── Tenants listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin || tab !== 'tenants') return;
    const unsub = onSnapshot(
      query(collection(db, 'stores'), orderBy('createdAt', 'desc')),
      snap => setTenants(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    );
    return unsub;
  }, [isAdmin, tab]);

  const notify = (msg, type='ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Approve subscription ────────────────────────────────────────────────
  const approvePlan = async (sub, planId, notes='', expiryDate=null) => {
    setSaving(true);
    try {
      const now = serverTimestamp();
      const tid = sub.tenantId || sub.id;

      // Build expiry — null means never expires
      const expiryTs = expiryDate ? new Date(expiryDate) : null;

      await updateDoc(doc(db, 'subscriptions', tid), {
        plan:planId, status:'active', approvedAt:now,
        approvedBy:adminUser.email, notes, updatedAt:now,
        licenseExpiry:   expiryTs,
        licenseExpiryStr: expiryDate || null,
      });
      await updateDoc(doc(db, 'stores', tid), {
        plan:planId, licenseExpiry: expiryTs, updatedAt:now,
      });

      // Cascade to all workers
      const snap = await getDocs(collection(db, 'stores', tid, 'workers'));
      for (const w of snap.docs) {
        try {
          await updateDoc(doc(db, 'userTenants', w.id), {
            plan:planId, licenseExpiry: expiryTs, updatedAt:now,
          });
        } catch {}
      }

      const expiryLabel = expiryDate ? ` · expires ${expiryDate}` : '';
      notify(`✅ ${sub.ownerEmail || tid} activated on ${planId}${expiryLabel}`);
      setApproveModal(null);
    } catch (e) { notify('Error: ' + e.message, 'err'); }
    setSaving(false);
  };

  // ── Reject subscription ─────────────────────────────────────────────────
  const rejectSub = async (sub) => {
    if (!window.confirm('Mark this payment as rejected?')) return;
    await updateDoc(doc(db, 'subscriptions', sub.tenantId || sub.id), {
      status:'rejected', rejectedAt:serverTimestamp(), rejectedBy:adminUser.email,
    });
    notify('Payment rejected', 'info');
  };

  // ── Manually override a tenant's plan ──────────────────────────────────
  const overridePlan = async (tenantId, planId, expiryDate=null) => {
    const now     = serverTimestamp();
    const expiryTs = expiryDate ? new Date(expiryDate) : null;
    await updateDoc(doc(db, 'stores', tenantId), {
      plan:planId, licenseExpiry: expiryTs, updatedAt:now,
    });
    await setDoc(doc(db, 'subscriptions', tenantId), {
      plan:planId, status: planId==='none' ? 'inactive' : 'active',
      licenseExpiry: expiryTs, licenseExpiryStr: expiryDate || null,
      updatedAt:now, approvedBy:adminUser.email,
    }, { merge:true });
    const snap = await getDocs(collection(db, 'stores', tenantId, 'workers'));
    for (const w of snap.docs) {
      try {
        await updateDoc(doc(db, 'userTenants', w.id), {
          plan:planId, licenseExpiry: expiryTs, updatedAt:now,
        });
      } catch {}
    }
    const expiryLabel = expiryDate ? ` · expires ${expiryDate}` : '';
    notify(`Plan set to ${planId}${expiryLabel}`);
  };

  // ── Catalogue CRUD ──────────────────────────────────────────────────────
  const saveProduct = async form => {
    setSaving(true);
    try {
      if (form.id) {
        const { id, ...data } = form;
        await updateDoc(doc(db, 'sharedCatalogues', industry, 'products', id),
          { ...data, updatedAt:serverTimestamp() });
        notify('Product updated ✅');
      } else {
        await addDoc(collection(db, 'sharedCatalogues', industry, 'products'),
          { ...form, industry, createdAt:serverTimestamp() });
        notify('Product added ✅');
      }
      setModal(null); setEditItem(null);
    } catch (e) { notify('Error: ' + e.message, 'err'); }
    setSaving(false);
  };

  // ── Delete entire tenant business ──────────────────────────────────────────
  // Deletes all Firestore docs for the store. Firebase Auth accounts for workers
  // must be deleted separately in Firebase Console (Admin SDK needed for that).
  const deleteTenant = async (tenantId, email) => {
    const confirmed = window.confirm(
      `DELETE BUSINESS: ${email}\n\nThis will permanently delete:\n• All products, sales, workers\n• Subscription record\n• Store settings\n\nFirebase Auth accounts must be deleted manually in Firebase Console.\n\nType DELETE to confirm.`
    );
    if (!confirmed) return;
    const word = window.prompt('Type DELETE to confirm permanent deletion:');
    if (word !== 'DELETE') { notify('Deletion cancelled — you must type DELETE exactly.', 'info'); return; }

    setSaving(true);
    try {
      const batch = [];
      // Delete workers sub-collection docs + their userTenants
      const workersSnap = await getDocs(collection(db, 'stores', tenantId, 'workers'));
      for (const w of workersSnap.docs) {
        batch.push(deleteDoc(doc(db, 'stores', tenantId, 'workers', w.id)));
        batch.push(deleteDoc(doc(db, 'userTenants', w.id)).catch(()=>{}));
      }
      // Delete other sub-collections
      for (const sub of ['products','sales','suppliers','creditCustomers','stockReceipts','activityLog','settings','meta','productPhotos']) {
        const snap = await getDocs(collection(db, 'stores', tenantId, sub)).catch(()=>({ docs:[] }));
        snap.docs.forEach(d => batch.push(deleteDoc(d.ref)));
      }
      await Promise.all(batch);
      // Delete store root and subscription
      await deleteDoc(doc(db, 'stores', tenantId));
      await deleteDoc(doc(db, 'subscriptions', tenantId)).catch(()=>{});
      notify(`🗑 Business ${email} deleted. Delete their Firebase Auth account manually.`);
    } catch (e) { notify('Delete error: ' + e.message, 'err'); }
    setSaving(false);
  };

  const deleteProduct = async id => {
    if (!window.confirm('Delete this product from the shared catalogue?')) return;
    await deleteDoc(doc(db, 'sharedCatalogues', industry, 'products', id));
    notify('Deleted');
  };

  const importCSV = async () => {
    setSaving(true);
    try {
      const lines = csvText.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      let count = 0;
      for (const row of lines.slice(1)) {
        if (!row.trim()) continue;
        const vals = row.split(',').map(v => v.trim());
        const obj  = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        if (!obj.name) continue;
        await addDoc(collection(db, 'sharedCatalogues', industry, 'products'), {
          name:obj.name, company:obj.company||'', size:obj.size||'',
          category:obj.category||'General',
          price:parseFloat(obj.price)||0, cost:parseFloat(obj.cost)||0,
          unit:obj.unit||'ea', barcode:obj.barcode||'',
          industry, createdAt:serverTimestamp(),
        });
        count++;
      }
      notify(`Imported ${count} products ✅`);
      setModal(null); setCsvText('');
    } catch (e) { notify('CSV error: ' + e.message, 'err'); }
    setSaving(false);
  };

  // ── Derived ─────────────────────────────────────────────────────────────
  const pending  = allSubs.filter(s => s.status === 'pending_approval');
  const subMap   = {};
  allSubs.forEach(s => { subMap[s.tenantId || s.id] = s; });

  // ── Guards ───────────────────────────────────────────────────────────────
  if (checkingAuth) return <Loading />;
  if (!isAdmin)     return <Denied email={adminUser?.email} />;

  return (
    <div style={st.wrap}>
      {toast && (
        <div style={{ ...st.toast, background: toast.type==='err' ? '#7f1d1d' : toast.type==='info' ? '#1e3a5f' : '#14532d' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ margin:0, fontSize:22, fontWeight:700 }}>🛠 Super Admin</h1>
        <p style={{ margin:'4px 0 0', fontSize:13, color:'#64748b' }}>{adminUser?.email}</p>
      </div>

      {/* Tabs */}
      <div style={st.tabBar}>
        {[
          { id:'subscriptions', label: pending.length ? `⏳ Subscriptions (${pending.length})` : '⏳ Subscriptions' },
          { id:'catalogue',     label:'📋 Shared Catalogue' },
          { id:'tenants',       label:'🏪 Tenants' },
          { id:'usage',         label:'📊 Usage Stats' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ ...st.tab, ...(tab===t.id ? st.tabActive : {}),
              ...(t.id==='subscriptions' && pending.length ? { color:'#fbbf24' } : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── SUBSCRIPTIONS ── */}
      {tab === 'subscriptions' && (
        <div>
          {/* Pending banner */}
          {pending.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <p style={{ fontSize:13, fontWeight:600, color:'#fbbf24', marginBottom:10 }}>
                ⏳ {pending.length} payment{pending.length>1?'s':''} awaiting approval
              </p>
              {pending.map(sub => (
                <div key={sub.id} style={{ background:'rgba(251,191,36,.06)', border:'1px solid rgba(251,191,36,.2)', borderRadius:10, padding:'16px 18px', marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
                    <div>
                      <p style={{ margin:0, fontWeight:600, color:'#f1f5f9' }}>{sub.ownerEmail || sub.tenantId}</p>
                      <p style={{ margin:'4px 0 0', fontSize:12, color:'#94a3b8' }}>
                        Wants <strong style={{ color:'#fbbf24' }}>{sub.plan}</strong> · ${sub.amount} {sub.currency}/{sub.billingPeriod} · via <strong>{sub.paymentMethod}</strong>
                      </p>
                      <p style={{ margin:'4px 0 0', fontSize:12, color:'#64748b' }}>
                        Ref: <code style={{ color:'#38bdf8', fontFamily:'monospace' }}>{sub.paymentRef}</code>
                      </p>
                      <p style={{ margin:'3px 0 0', fontSize:11, color:'#475569' }}>
                        {sub.requestedAt?.toDate?.()?.toLocaleString() || '—'}
                      </p>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button style={st.approveBtn} onClick={() => setApproveModal(sub)}>✓ Approve</button>
                      <button style={st.rejectBtn}  onClick={() => rejectSub(sub)}>✗ Reject</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {pending.length === 0 && (
            <div style={{ background:'rgba(74,222,128,.06)', border:'1px solid rgba(74,222,128,.15)', borderRadius:10, padding:'12px 18px', marginBottom:16, fontSize:13, color:'#4ade80' }}>
              ✅ No pending approvals
            </div>
          )}

          {/* All subscriptions */}
          <p style={{ fontSize:13, color:'#64748b', marginBottom:10 }}>All subscriptions ({allSubs.length})</p>
          <div style={st.tableWrap}>
            <table style={st.table}>
              <thead>
                <tr>{['Email','Tenant ID','Plan','Status','Method','Ref','Approved'].map(h => (
                  <th key={h} style={st.th}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {allSubs.map(sub => (
                  <tr key={sub.id} style={st.tr}>
                    <td style={st.td}><strong>{sub.ownerEmail||'—'}</strong></td>
                    <td style={st.td}><code style={{ fontSize:11 }}>{sub.tenantId||sub.id}</code></td>
                    <td style={st.td}><PlanBadge plan={sub.plan||'none'}/></td>
                    <td style={st.td}>
                      <span style={{ fontSize:12, color: sub.status==='active'?'#4ade80':sub.status==='pending_approval'?'#fbbf24':'#64748b' }}>
                        {sub.status||'—'}
                      </span>
                    </td>
                    <td style={st.td}>{sub.paymentMethod||'—'}</td>
                    <td style={st.td}><code style={{ fontSize:11, color:'#38bdf8' }}>{sub.paymentRef||'—'}</code></td>
                    <td style={st.td}>{sub.approvedAt?.toDate?.()?.toLocaleDateString()||'—'}</td>
                  </tr>
                ))}
                {allSubs.length===0 && (
                  <tr><td colSpan={7} style={{ ...st.td, textAlign:'center', color:'#475569', padding:32 }}>No subscriptions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CATALOGUE ── */}
      {tab === 'catalogue' && (
        <div>
          {/* Industry selector */}
          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
            {INDUSTRIES.map(ind => (
              <button key={ind.id} onClick={() => { setIndustry(ind.id); setCatTab('browse'); }}
                style={{ padding:'6px 14px', borderRadius:20, cursor:'pointer', fontSize:13,
                  border:`1px solid ${industry===ind.id ? '#38bdf8' : '#1e293b'}`,
                  background: industry===ind.id ? 'rgba(56,189,248,.1)' : '#0f172a',
                  color: industry===ind.id ? '#38bdf8' : '#94a3b8',
                }}>
                {ind.label}
              </button>
            ))}
          </div>

          {/* Sub-tab bar: Browse | Import | Export | Categories */}
          <div style={{ display:'flex', gap:2, marginBottom:16, borderBottom:'1px solid #1e293b' }}>
            {[
              { id:'browse',     label:'📋 Browse & Edit' },
              { id:'import',     label:'⬆ Import CSV'     },
              { id:'export',     label:'⬇ Export CSV'     },
              { id:'categories', label:'🏷 Categories'    },
            ].map(t => (
              <button key={t.id} onClick={() => setCatTab(t.id)}
                style={{
                  padding:'7px 14px', background:'none', border:'none',
                  color: catTab===t.id ? '#38bdf8' : '#64748b',
                  cursor:'pointer', fontSize:13, fontWeight: catTab===t.id ? 600 : 400,
                  borderBottom:`2px solid ${catTab===t.id ? '#38bdf8' : 'transparent'}`,
                }}>
                {t.label}
              </button>
            ))}
            <div style={{ flex:1 }}/>
            <span style={{ fontSize:12, color:'#475569', alignSelf:'center', paddingRight:4 }}>
              {products.length} products
            </span>
          </div>

          {/* ── BROWSE & EDIT ── */}
          {catTab === 'browse' && (
            <div>
              <div style={{ display:'flex', gap:8, marginBottom:12, justifyContent:'flex-end' }}>
                <button style={st.btnPri} onClick={() => { setEditItem(null); setModal('add'); }}>+ Add Product</button>
              </div>
              <div style={st.tableWrap}>
                <table style={st.table}>
                  <thead>
                    <tr>{['Name','Company','Size','Category','Price','Cost','Unit','Barcode',''].map(h=>(
                      <th key={h} style={st.th}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p.id} style={st.tr}>
                        <td style={st.td}><strong>{p.name}</strong></td>
                        <td style={st.td}>{p.company||'—'}</td>
                        <td style={st.td}>{p.size||'—'}</td>
                        <td style={st.td}>{p.category}</td>
                        <td style={st.td}>${Number(p.price).toFixed(2)}</td>
                        <td style={st.td}>${Number(p.cost).toFixed(2)}</td>
                        <td style={st.td}>{p.unit||'ea'}</td>
                        <td style={st.td}><code style={{ fontSize:11 }}>{p.barcode||'—'}</code></td>
                        <td style={st.td}>
                          <button style={st.editBtn} onClick={() => { setEditItem(p); setModal('edit'); }}>Edit</button>
                          <button style={st.delBtn}  onClick={() => deleteProduct(p.id)}>Del</button>
                        </td>
                      </tr>
                    ))}
                    {products.length===0 && (
                      <tr><td colSpan={9} style={{ ...st.td, textAlign:'center', color:'#475569', padding:32 }}>
                        No products yet. Add manually or import a CSV.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── IMPORT CSV ── */}
          {catTab === 'import' && (
            <div style={{ maxWidth:700 }}>
              <div style={{ background:'rgba(56,189,248,.06)', border:'1px solid rgba(56,189,248,.15)', borderRadius:10, padding:'14px 18px', marginBottom:16, fontSize:13, color:'#94a3b8', lineHeight:1.7 }}>
                <strong style={{ color:'#38bdf8' }}>CSV Format:</strong> First row must be the header row.<br/>
                Required columns: <code>name</code><br/>
                Optional: <code>company, size, category, price, cost, unit, barcode</code><br/>
                <span style={{ fontSize:11, color:'#475569' }}>
                  Tip: Download a template first to see the exact format.
                </span>
              </div>

              <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                <button style={st.btnSec} onClick={() => {
                  const header = 'name,company,size,category,price,cost,unit,barcode';
                  const example = 'The Great Gatsby,Scribner,Paperback,Books,14.99,7.00,ea,9780743273565\nAtomic Habits,Penguin,Hardcover,Books,18.99,8.50,ea,9780735211292';
                  const blob = new Blob([header + '\n' + example], { type:'text/csv' });
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                  a.download = `catalogue_template_${industry}.csv`; a.click();
                }}>
                  📥 Download Template
                </button>
                <label style={{ ...st.btnPri, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6 }}>
                  📂 Choose CSV File
                  <input type="file" accept=".csv,.tsv,.txt" style={{ display:'none' }}
                    onChange={async e => {
                      const file = e.target.files[0]; if (!file) return;
                      const text = await file.text();
                      setCsvText(text);
                              e.target.value = '';
                    }}/>
                </label>
              </div>

              {csvText && (
                <>
                  <div style={{ background:'#080e1a', border:'1px solid #1e293b', borderRadius:8, padding:'10px 12px', marginBottom:12, maxHeight:160, overflowY:'auto' }}>
                    <p style={{ fontSize:11, color:'#475569', margin:'0 0 6px', fontFamily:'monospace' }}>Preview:</p>
                    <pre style={{ fontSize:11, color:'#64748b', margin:0, whiteSpace:'pre-wrap' }}>
                      {csvText.split('\n').slice(0,8).join('\n')}
                      {csvText.split('\n').length > 8 ? `\n… +${csvText.split('\n').length-8} more rows` : ''}
                    </pre>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <button style={st.btnPri} onClick={importCSV} disabled={saving}>
                      {saving ? 'Importing…' : `⬆ Import ${csvText.split('\n').filter(l=>l.trim()).length - 1} Products`}
                    </button>
                    <button style={st.btnSec} onClick={() => { setCsvText(''); }}>Clear</button>
                  </div>
                </>
              )}
              {!csvText && (
                <div style={{ border:'2px dashed #1e293b', borderRadius:12, padding:'40px', textAlign:'center', color:'#334155' }}>
                  <p style={{ fontSize:32, marginBottom:8 }}>📂</p>
                  <p style={{ margin:0 }}>Choose a CSV file above to preview and import</p>
                </div>
              )}
            </div>
          )}

          {/* ── EXPORT CSV ── */}
          {catTab === 'export' && (
            <div style={{ maxWidth:600 }}>
              <div style={{ background:'rgba(74,222,128,.06)', border:'1px solid rgba(74,222,128,.15)', borderRadius:10, padding:'14px 18px', marginBottom:16, fontSize:13, color:'#94a3b8' }}>
                Export all <strong style={{ color:'#f1f5f9' }}>{products.length}</strong> products in the <strong style={{ color:'#38bdf8' }}>{industry}</strong> catalogue as CSV.
                You can re-import this file after making edits in Excel or Google Sheets.
              </div>
              <div style={{ background:'var(--bs-bg,#0d1526)', border:'1px solid #1e293b', borderRadius:10, padding:'18px', marginBottom:16 }}>
                <p style={{ fontSize:13, fontWeight:600, color:'#f1f5f9', margin:'0 0 12px' }}>Select columns to export:</p>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                  {['name','company','size','category','price','cost','unit','barcode'].map(col => (
                    <label key={col} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#94a3b8', cursor:'pointer' }}>
                      <input type="checkbox" defaultChecked
                        id={`export-col-${col}`}
                        style={{ cursor:'pointer' }}/>
                      {col}
                    </label>
                  ))}
                </div>
              </div>
              <button style={{ ...st.btnPri, padding:'11px 24px', fontSize:14 }}
                onClick={() => {
                  const cols = ['name','company','size','category','price','cost','unit','barcode']
                    .filter(col => document.getElementById(`export-col-${col}`)?.checked);
                  const esc = s => (String(s||'').includes(',') || String(s||'').includes('"'))
                    ? `"${String(s||'').replace(/"/g,'""')}"` : String(s||'');
                  const rows = [cols.join(','), ...products.map(p => cols.map(col => esc(p[col])).join(','))];
                  const blob = new Blob([rows.join('\n')], { type:'text/csv' });
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                  a.download = `catalogue_${industry}_${new Date().toISOString().slice(0,10)}.csv`;
                  a.click();
                }}
                disabled={products.length === 0}>
                ⬇ Download CSV ({products.length} products)
              </button>
            </div>
          )}

          {/* ── CATEGORIES ── */}
          {catTab === 'categories' && (
            <CatalogueCategories industry={industry} notify={notify}/>
          )}
        </div>
      )}


      {/* ── TENANTS ── */}
      {tab === 'tenants' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <p style={{ margin:0, fontSize:14, color:'#64748b' }}>{tenants.length} registered stores</p>
          </div>
          <div style={st.tableWrap}>
            <table style={st.table}>
              <thead>
                <tr>{['Owner / Email','Tenant ID','Industry','Plan','Override Plan','License Expiry','Extend','Joined',''].map(h=>(
                  <th key={h} style={st.th}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {tenants.map(t => {
                  const sub  = subMap[t.tenantId||t.id] || {};
                  const plan = sub.plan || t.plan || 'none';
                  return (
                    <tr key={t.id} style={st.tr}>
                      <td style={st.td}><strong>{t.ownerEmail||t.ownerName||'—'}</strong></td>
                      <td style={st.td}><code style={{ fontSize:11 }}>{t.tenantId||t.id}</code></td>
                      <td style={st.td}>{t.industry||'general'}</td>
                      <td style={st.td}><PlanBadge plan={plan}/></td>
                      <td style={st.td}>
                        <select
                          value={plan}
                          onChange={e => overridePlan(t.tenantId||t.id, e.target.value)}
                          style={{ background:'#0f172a', border:'1px solid #1e293b', color:'#f1f5f9', padding:'4px 8px', borderRadius:6, fontSize:12, cursor:'pointer' }}
                        >
                          {['none','trial','starter','pro','business'].map(p=>(
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </td>
                      <td style={st.td}>
                        {(() => {
                          const exp = sub.licenseExpiryStr || sub.licenseExpiry?.toDate?.()?.toLocaleDateString();
                          if (!exp) return <span style={{ color:'#475569' }}>No expiry</span>;
                          const isExpired = new Date(exp) < new Date();
                          return (
                            <span style={{ color: isExpired ? '#f87171' : '#4ade80', fontFamily:'monospace', fontSize:12 }}>
                              {isExpired ? '⚠ ' : ''}{exp}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={st.td}>
                        <button
                          style={{ ...st.editBtn, fontSize:11, padding:'3px 8px' }}
                          onClick={() => setExtendModal({ tenantId: t.tenantId||t.id, email: t.ownerEmail, currentExpiry: sub.licenseExpiryStr, plan })}
                        >
                          ⏱ Extend
                        </button>
                      </td>
                      <td style={st.td}>{t.createdAt?.toDate?.()?.toLocaleDateString()||'—'}</td>
                      <td style={st.td}>
                        <button
                          style={{ padding:'3px 10px', background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.2)', borderRadius:6, color:'#f87171', cursor:'pointer', fontSize:11 }}
                          onClick={() => deleteTenant(t.tenantId||t.id, t.ownerEmail||t.ownerName)}
                        >
                          🗑 Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {tenants.length===0 && (
                  <tr><td colSpan={6} style={{ ...st.td, textAlign:'center', color:'#475569', padding:32 }}>No stores yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── APPROVE MODAL ── */}
      {/* ── USAGE STATS TAB ── */}
      {tab === 'usage' && (
        <UsageStatsTab db={db} />
      )}

      {approveModal && (
        <ApproveModal sub={approveModal} onApprove={approvePlan} onClose={() => setApproveModal(null)} saving={saving}/>
      )}

      {extendModal && (
        <ExtendModal
          tenantId={extendModal.tenantId}
          email={extendModal.email}
          currentExpiry={extendModal.currentExpiry}
          plan={extendModal.plan}
          onExtend={overridePlan}
          onClose={() => setExtendModal(null)}
          saving={saving}
        />
      )}

      {/* ── PRODUCT MODAL ── */}
      {(modal==='add'||modal==='edit') && (
        <ProductModal item={editItem} onSave={saveProduct} onClose={() => { setModal(null); setEditItem(null); }} saving={saving}/>
      )}

      {/* ── CSV MODAL ── */}
      {modal==='csv' && (
        <div style={st.overlay}>
          <div style={st.box}>
            <h3 style={{ margin:'0 0 12px', color:'#f1f5f9' }}>📥 Import CSV</h3>
            <p style={{ fontSize:12, color:'#94a3b8', marginBottom:8 }}>
              Header: <code>name, company, size, category, price, cost, unit, barcode</code>
            </p>
            <textarea value={csvText} onChange={e=>setCsvText(e.target.value)} rows={9}
              placeholder={'name,company,size,category,price,cost,unit,barcode\nThe Great Gatsby,Scribner,Paperback,Books,14.99,7.00,ea,9780743273565'}
              style={st.textarea}/>
            <div style={{ display:'flex', gap:8, marginTop:12, justifyContent:'flex-end' }}>
              <button style={st.btnSec} onClick={()=>setModal(null)}>Cancel</button>
              <button style={st.btnPri} onClick={importCSV} disabled={saving}>{saving?'Importing…':'Import'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared expiry picker logic ─────────────────────────────────────────────────
const QUICK_DURATIONS = [
  { label:'1 Month',   days:30  },
  { label:'3 Months',  days:90  },
  { label:'6 Months',  days:183 },
  { label:'1 Year',    days:365 },
  { label:'2 Years',   days:730 },
];

function addDaysToDate(baseDate, days) {
  const d = baseDate ? new Date(baseDate) : new Date();
  if (isNaN(d)) { const n = new Date(); n.setDate(n.getDate() + days); return n.toISOString().slice(0,10); }
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}

function ExpiryPicker({ currentExpiry, value, onChange }) {
  const [mode, setMode] = useState('topup'); // 'topup' | 'manual'

  return (
    <div style={{ background:'#0a0f1e', borderRadius:10, padding:'14px', marginBottom:14 }}>
      {/* Mode toggle */}
      <div style={{ display:'flex', gap:6, marginBottom:12 }}>
        {[{ id:'topup', label:'⏱ Top-up' }, { id:'manual', label:'📅 Manual date' }].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{
            padding:'5px 12px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12,
            background: mode===m.id ? 'rgba(56,189,248,.2)' : 'rgba(255,255,255,.04)',
            color:      mode===m.id ? '#38bdf8'            : '#64748b',
            fontWeight: mode===m.id ? 600 : 400,
          }}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'topup' && (
        <>
          <p style={{ fontSize:11, color:'#475569', marginBottom:10 }}>
            Adds days to current expiry{currentExpiry ? ` (${currentExpiry})` : ' (starts from today)'}.
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
            {QUICK_DURATIONS.map(({ label, days }) => {
              const result = addDaysToDate(currentExpiry, days);
              const isActive = value === result;
              return (
                <button key={label} onClick={() => onChange(result)} style={{
                  padding:'10px 6px', borderRadius:8, border:'none', cursor:'pointer',
                  background: isActive ? 'rgba(56,189,248,.15)' : 'rgba(255,255,255,.04)',
                  outline:    isActive ? '1.5px solid #38bdf8'  : '1px solid #1e293b',
                  textAlign:'center',
                }}>
                  <div style={{ fontSize:12, fontWeight:700, color: isActive ? '#38bdf8' : '#f1f5f9' }}>
                    {label}
                  </div>
                  <div style={{ fontSize:10, color:'#64748b', marginTop:3 }}>→ {result}</div>
                </button>
              );
            })}
          </div>
          {value && (
            <div style={{ marginTop:10, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <p style={{ margin:0, fontSize:12, color:'#4ade80' }}>
                ✓ New expiry: <strong>{value}</strong>
              </p>
              <button onClick={() => onChange(null)} style={{ background:'none', border:'none', color:'#475569', cursor:'pointer', fontSize:11 }}>
                Clear
              </button>
            </div>
          )}
        </>
      )}

      {mode === 'manual' && (
        <>
          <p style={{ fontSize:11, color:'#fb923c', marginBottom:8 }}>
            ⚠ Manual mode — use carefully. This sets an exact expiry date.
          </p>
          <input
            type="date"
            value={value || ''}
            min={new Date().toISOString().slice(0,10)}
            onChange={e => onChange(e.target.value || null)}
            style={{ width:'100%', padding:'9px 12px', background:'#0f172a', border:'1px solid #334155', borderRadius:8, color:'#f1f5f9', fontSize:14, boxSizing:'border-box' }}
          />
          <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
            {[
              { label:'Clear (no expiry)', date:null },
            ].map(({ label, date }) => (
              <button key={label} onClick={() => onChange(date)}
                style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #334155', background:'none', color:'#64748b', cursor:'pointer', fontSize:11 }}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── CatalogueCategories — manage categories per industry ─────────────────────
function CatalogueCategories({ industry, notify }) {
  const [categories, setCategories] = React.useState([]);
  const [newCat,     setNewCat]     = React.useState({ name:'', icon:'📦', color:'#38bdf8' });
  const [saving,     setSaving]     = React.useState(false);
  const [loading,    setLoading]    = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, 'sharedCatalogues', industry, 'categories'),
      snap => {
        setCategories(snap.docs.map(d => ({ id:d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [industry]);

  const PRESET_ICONS = ['📚','📖','🖊','🎨','📦','🥤','🍎','🧴','💊','🏥','🔧','👗','🎮','🎵','🖥','🧴'];
  const PRESET_COLORS = ['#38bdf8','#4ade80','#c084fc','#f87171','#fbbf24','#fb923c','#34d399','#818cf8','#f472b6','#94a3b8'];

  const addCategory = async () => {
    if (!newCat.name.trim()) return;
    setSaving(true);
    try {
      const id = newCat.name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-');
      await setDoc(doc(db, 'sharedCatalogues', industry, 'categories', id), {
        name: newCat.name.trim(), icon: newCat.icon, color: newCat.color,
        industry, createdAt: serverTimestamp(),
      });
      setNewCat({ name:'', icon:'📦', color:'#38bdf8' });
      notify('Category added ✅');
    } catch(e) { notify('Error: '+e.message,'err'); }
    setSaving(false);
  };

  const deleteCategory = async (id) => {
    if (!window.confirm('Delete this category?')) return;
    await deleteDoc(doc(db, 'sharedCatalogues', industry, 'categories', id));
    notify('Category deleted');
  };

  return (
    <div style={{ maxWidth:640 }}>
      <div style={{ background:'rgba(56,189,248,.06)', border:'1px solid rgba(56,189,248,.12)', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:13, color:'#94a3b8' }}>
        🏷 Categories defined here appear as options when adding products to the <strong style={{ color:'#38bdf8' }}>{industry}</strong> catalogue.
        Tenants can also use custom categories from their own settings.
      </div>

      {/* Existing categories */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:20 }}>
        {loading && <p style={{ color:'#475569', fontSize:13 }}>Loading…</p>}
        {!loading && categories.length === 0 && (
          <p style={{ color:'#475569', fontSize:13 }}>No custom categories yet. Add some below.</p>
        )}
        {categories.map(cat => (
          <div key={cat.id} style={{
            display:'flex', alignItems:'center', gap:8, padding:'7px 12px',
            background:'rgba(255,255,255,.04)', border:`1px solid ${cat.color}44`,
            borderRadius:20, fontSize:13,
          }}>
            <span>{cat.icon}</span>
            <span style={{ color:'#f1f5f9', fontWeight:500 }}>{cat.name}</span>
            <button onClick={() => deleteCategory(cat.id)}
              style={{ background:'none', border:'none', color:'#475569', cursor:'pointer', fontSize:14, padding:'0 2px', lineHeight:1 }}>
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Add new category */}
      <div style={{ background:'#0d1526', border:'1px solid #1e293b', borderRadius:12, padding:'18px' }}>
        <p style={{ margin:'0 0 14px', fontSize:13, fontWeight:600, color:'#f1f5f9' }}>Add New Category</p>

        <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:10, marginBottom:12 }}>
          <input
            value={newCat.name}
            onChange={e => setNewCat(p => ({...p, name:e.target.value}))}
            onKeyDown={e => e.key==='Enter' && addCategory()}
            placeholder="Category name (e.g. Stationery)"
            style={{ padding:'9px 12px', background:'#080e1a', border:'1px solid #1e293b', borderRadius:8, color:'#f1f5f9', fontSize:14, boxSizing:'border-box' }}
          />
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', background:'#080e1a', border:'1px solid #1e293b', borderRadius:8 }}>
            <span style={{ fontSize:20 }}>{newCat.icon}</span>
            <span style={{ fontSize:11, color:'#475569' }}>icon</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', background:'#080e1a', border:'1px solid #1e293b', borderRadius:8 }}>
            <div style={{ width:16, height:16, borderRadius:'50%', background:newCat.color }}/>
            <span style={{ fontSize:11, color:'#475569' }}>colour</span>
          </div>
        </div>

        {/* Icon picker */}
        <p style={{ fontSize:11, color:'#64748b', marginBottom:6 }}>Choose icon:</p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
          {PRESET_ICONS.map(icon => (
            <button key={icon} onClick={() => setNewCat(p=>({...p,icon}))}
              style={{
                fontSize:20, padding:'4px 6px', borderRadius:6, cursor:'pointer',
                border:`1px solid ${newCat.icon===icon ? '#38bdf8' : '#1e293b'}`,
                background: newCat.icon===icon ? 'rgba(56,189,248,.15)' : 'none',
              }}>
              {icon}
            </button>
          ))}
        </div>

        {/* Colour picker */}
        <p style={{ fontSize:11, color:'#64748b', marginBottom:6 }}>Choose colour:</p>
        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
          {PRESET_COLORS.map(col => (
            <button key={col} onClick={() => setNewCat(p=>({...p,color:col}))}
              style={{
                width:24, height:24, borderRadius:'50%', background:col, cursor:'pointer',
                border:`2px solid ${newCat.color===col ? '#fff' : 'transparent'}`,
                boxShadow: newCat.color===col ? `0 0 0 2px ${col}` : 'none',
              }}/>
          ))}
        </div>

        {/* Preview */}
        {newCat.name && (
          <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 12px',
            background:`${newCat.color}18`, border:`1px solid ${newCat.color}44`, borderRadius:16, marginBottom:12 }}>
            <span>{newCat.icon}</span>
            <span style={{ color:'#f1f5f9', fontSize:13 }}>{newCat.name}</span>
          </div>
        )}

        <br/>
        <button style={{ ...st.btnPri, marginTop: newCat.name ? 0 : 0 }}
          onClick={addCategory} disabled={saving || !newCat.name.trim()}>
          {saving ? 'Adding…' : '+ Add Category'}
        </button>
      </div>
    </div>
  );
}


// ── UsageStatsTab ─────────────────────────────────────────────────────────────
// Two sections:
//   1. Real document counts per business (products, sales, workers etc.)
//   2. Firebase operation log per user (reads/writes/deletes tracked by useStore.js)
function UsageStatsTab({ db }) {
  const [section,    setSection]    = React.useState('firebase'); // 'firebase' | 'documents'
  const [docStats,   setDocStats]   = React.useState([]);
  const [userLogs,   setUserLogs]   = React.useState([]);
  const [tenantMap,  setTenantMap]  = React.useState({});
  const [dateRange,  setDateRange]  = React.useState('7');
  const [loading,    setLoading]    = React.useState(false);
  const [sortBy,     setSortBy]     = React.useState('sales');

  // Load tenant names once
  React.useEffect(() => {
    getDocs(collection(db, 'stores')).then(snap => {
      const m = {};
      snap.docs.forEach(d => { m[d.id] = { email: d.data().ownerEmail, name: d.data().ownerName }; });
      setTenantMap(m);
    }).catch(() => {});
  }, []);

  // ── Load firebase operation logs (per user) ──────────────────────────────
  React.useEffect(() => {
    if (section !== 'firebase') return;
    setLoading(true);
    const days  = parseInt(dateRange);
    const dates = Array.from({ length: days }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i);
      return d.toISOString().slice(0, 10);
    });

    const fetchLogs = async () => {
      const tenantsSnap = await getDocs(collection(db, 'usageLog')).catch(() => ({ docs: [] }));
      const allUsers = {};

      for (const tenantDoc of tenantsSnap.docs) {
        const tid = tenantDoc.id;
        const usersSnap = await getDocs(
          collection(db, 'usageLog', tid, 'users')
        ).catch(() => ({ docs: [] }));

        usersSnap.docs.forEach(d => {
          const data = d.data();
          if (!dates.includes(data.date)) return;
          const key = data.uid || data.email;
          if (!allUsers[key]) {
            allUsers[key] = {
              uid: data.uid, email: data.email, name: data.name,
              tenantId: tid, reads: 0, writes: 0, deletes: 0,
              byCollection: {}, days: new Set(),
            };
          }
          allUsers[key].reads   += data.total_read   || 0;
          allUsers[key].writes  += data.total_write  || 0;
          allUsers[key].deletes += data.total_delete || 0;
          allUsers[key].days.add(data.date);

          // Aggregate per-collection breakdown
          Object.entries(data).forEach(([k, v]) => {
            if (k.startsWith('ops_') && typeof v === 'number') {
              const [, op, ...colParts] = k.split('_');
              const col = colParts.join('_');
              if (!allUsers[key].byCollection[col]) allUsers[key].byCollection[col] = { read:0, write:0, delete:0 };
              allUsers[key].byCollection[col][op] = (allUsers[key].byCollection[col][op] || 0) + v;
            }
          });
        });
      }

      const result = Object.values(allUsers).map(u => ({
        ...u,
        total:    u.reads + u.writes + u.deletes,
        activeDays: u.days.size,
        days:     Array.from(u.days).sort().reverse(),
      })).sort((a, b) => b.total - a.total);

      setUserLogs(result);
      setLoading(false);
    };
    fetchLogs();
  }, [section, dateRange]);

  // ── Load real document counts (per business) ─────────────────────────────
  React.useEffect(() => {
    if (section !== 'documents') return;
    setLoading(true);
    const fetchDocs = async () => {
      const storesSnap = await getDocs(collection(db, 'stores'));
      const subsSnap   = await getDocs(collection(db, 'subscriptions'));
      const subMap = {};
      subsSnap.docs.forEach(d => { subMap[d.id] = d.data(); });
      const results = [];

      for (const storeDoc of storesSnap.docs) {
        const tid = storeDoc.id;
        const store = storeDoc.data();
        const [prodS, salesS, workS, stockS, creditS, suppS, actS] = await Promise.all([
          getDocs(collection(db, 'stores', tid, 'products')),
          getDocs(collection(db, 'stores', tid, 'sales')),
          getDocs(collection(db, 'stores', tid, 'workers')),
          getDocs(collection(db, 'stores', tid, 'stockReceipts')),
          getDocs(collection(db, 'stores', tid, 'creditCustomers')),
          getDocs(collection(db, 'stores', tid, 'suppliers')),
          getDocs(collection(db, 'stores', tid, 'activityLog')),
        ]);
        const sub = subMap[tid] || {};
        results.push({
          tenantId: tid, ownerEmail: store.ownerEmail || '—',
          plan: sub.plan || store.plan || 'none',
          licenseExpiry: sub.licenseExpiryStr || null,
          createdAt: store.createdAt,
          products: prodS.size, sales: salesS.size, workers: workS.size,
          stock: stockS.size, credit: creditS.size, suppliers: suppS.size, activity: actS.size,
          totalDocs: prodS.size + salesS.size + workS.size + stockS.size + creditS.size + suppS.size + actS.size,
        });
      }
      results.sort((a, b) => b[sortBy] - a[sortBy]);
      setDocStats(results);
      setLoading(false);
    };
    fetchDocs();
  }, [section, sortBy]);

  const PLAN_COLOR = { none:'#64748b', trial:'#86efac', starter:'#4ade80', pro:'#38bdf8', business:'#c084fc' };
  const PLAN_BG    = { none:'#1e293b', trial:'#1c3a2e', starter:'#1e3a1e', pro:'#1e2d4a', business:'#2d1e4a' };

  const TIERS = {
    starter:  { sales:1000,     products:200,      workers:1 },
    pro:      { sales:10000,    products:2000,     workers:5 },
    business: { sales:Infinity, products:Infinity, workers:Infinity },
  };

  const totalOps = userLogs.reduce((a, u) => a + u.total, 0);

  return (
    <div>
      {/* Section toggle */}
      <div style={{ display:'flex', gap:4, marginBottom:20, background:'#0a0f1a', borderRadius:9, padding:4, width:'fit-content' }}>
        {[
          { id:'firebase',  label:'🔥 Firebase Operations (per user)' },
          { id:'documents', label:'📦 Document Counts (per business)'  },
        ].map(s => (
          <button key={s.id} onClick={() => setSection(s.id)} style={{
            padding:'8px 18px', borderRadius:7, border:'none', cursor:'pointer', fontSize:13,
            background: section===s.id ? 'rgba(56,189,248,.2)' : 'transparent',
            color:      section===s.id ? '#38bdf8'             : '#64748b',
            fontWeight: section===s.id ? 600 : 400,
          }}>{s.label}</button>
        ))}
      </div>

      {/* ── FIREBASE OPERATIONS ── */}
      {section === 'firebase' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
            <select value={dateRange} onChange={e => setDateRange(e.target.value)}
              style={{ padding:'7px 12px', background:'#0a0f1a', border:'1px solid #1e293b', borderRadius:8, color:'#f1f5f9', fontSize:13 }}>
              <option value="1">Today</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </select>
            {loading && <span style={{ color:'#64748b', fontSize:13 }}>Loading…</span>}
            {!loading && <span style={{ color:'#64748b', fontSize:13 }}>{userLogs.length} users · {totalOps.toLocaleString()} total ops</span>}

            <div style={{ marginLeft:'auto', background:'rgba(56,189,248,.06)', border:'1px solid rgba(56,189,248,.15)', borderRadius:8, padding:'7px 14px', fontSize:12, color:'#64748b' }}>
              📋 Ops tracked from user interactions in the app
            </div>
          </div>

          {/* Legend */}
          <div style={{ display:'flex', gap:14, marginBottom:14 }}>
            {[['📖','Reads','#38bdf8'],['✏️','Writes','#4ade80'],['🗑','Deletes','#f87171']].map(([i,l,c]) => (
              <div key={l} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'#64748b' }}>
                <div style={{ width:10, height:10, borderRadius:2, background:c }}/>{i} {l}
              </div>
            ))}
          </div>

          {userLogs.length === 0 && !loading && (
            <div style={{ background:'#0a0f1a', border:'1px solid #1e293b', borderRadius:10, padding:'40px', textAlign:'center' }}>
              <p style={{ fontSize:32, marginBottom:8 }}>🔥</p>
              <p style={{ color:'#64748b', margin:0 }}>No operation data yet for this period.</p>
              <p style={{ color:'#475569', fontSize:12, marginTop:8, lineHeight:1.7 }}>
                Operations are tracked as users interact with the app.<br/>
                Data appears after users perform actions (add products, record sales, etc.)
              </p>
            </div>
          )}

          {userLogs.map((u, i) => {
            const total = u.reads + u.writes + u.deletes;
            const readPct   = total ? Math.round((u.reads   / total) * 100) : 0;
            const writePct  = total ? Math.round((u.writes  / total) * 100) : 0;
            const deletePct = total ? Math.round((u.deletes / total) * 100) : 0;
            const tenant    = tenantMap[u.tenantId] || {};

            return (
              <div key={u.uid || i} style={{ background:'#0a0f1a', border:'1px solid #1e293b', borderRadius:12, padding:'16px 20px', marginBottom:10 }}>
                {/* User header */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12, flexWrap:'wrap', gap:10 }}>
                  <div>
                    <p style={{ margin:0, fontWeight:700, color:'#f1f5f9', fontSize:14 }}>
                      {u.name || u.email}
                    </p>
                    <p style={{ margin:'3px 0 0', fontSize:12, color:'#475569' }}>
                      {u.email} · Store: {tenant.email || u.tenantId} · {u.activeDays} active day{u.activeDays!==1?'s':''}
                    </p>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <p style={{ margin:0, fontSize:20, fontWeight:800, color:'#38bdf8' }}>{total.toLocaleString()}</p>
                    <p style={{ margin:0, fontSize:11, color:'#475569' }}>total operations</p>
                  </div>
                </div>

                {/* Read / Write / Delete counts */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:12 }}>
                  {[
                    { label:'Reads',   val:u.reads,   color:'#38bdf8', bg:'rgba(56,189,248,.08)',  icon:'📖' },
                    { label:'Writes',  val:u.writes,  color:'#4ade80', bg:'rgba(74,222,128,.08)',  icon:'✏️' },
                    { label:'Deletes', val:u.deletes, color:'#f87171', bg:'rgba(248,113,113,.08)', icon:'🗑' },
                  ].map(m => (
                    <div key={m.label} style={{ background:m.bg, borderRadius:9, padding:'12px 14px', textAlign:'center' }}>
                      <p style={{ margin:0, fontSize:18, marginBottom:4 }}>{m.icon}</p>
                      <p style={{ margin:0, fontSize:22, fontWeight:800, color:m.color }}>{m.val.toLocaleString()}</p>
                      <p style={{ margin:'3px 0 0', fontSize:11, color:'#64748b' }}>{m.label}</p>
                    </div>
                  ))}
                </div>

                {/* Stacked bar */}
                <div style={{ height:8, borderRadius:4, background:'#1e293b', overflow:'hidden', display:'flex', marginBottom:8 }}>
                  {readPct   > 0 && <div style={{ width:`${readPct}%`,   background:'#38bdf8', transition:'width .4s' }}/>}
                  {writePct  > 0 && <div style={{ width:`${writePct}%`,  background:'#4ade80', transition:'width .4s' }}/>}
                  {deletePct > 0 && <div style={{ width:`${deletePct}%`, background:'#f87171', transition:'width .4s' }}/>}
                </div>
                <p style={{ margin:0, fontSize:11, color:'#334155' }}>
                  Reads {readPct}% · Writes {writePct}% · Deletes {deletePct}%
                </p>

                {/* Per-collection breakdown */}
                {Object.keys(u.byCollection).length > 0 && (
                  <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #1e293b' }}>
                    <p style={{ margin:'0 0 8px', fontSize:11, color:'#475569', textTransform:'uppercase', letterSpacing:'.06em' }}>By Collection</p>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {Object.entries(u.byCollection)
                        .sort((a,b) => (b[1].read+b[1].write+b[1].delete) - (a[1].read+a[1].write+a[1].delete))
                        .map(([col, ops]) => (
                        <div key={col} style={{ background:'#0f172a', border:'1px solid #1e293b', borderRadius:8, padding:'6px 10px', fontSize:12 }}>
                          <span style={{ color:'#94a3b8', fontWeight:500 }}>{col}</span>
                          <span style={{ marginLeft:8, color:'#38bdf8' }}>R:{ops.read||0}</span>
                          <span style={{ marginLeft:6, color:'#4ade80' }}>W:{ops.write||0}</span>
                          {(ops.delete||0) > 0 && <span style={{ marginLeft:6, color:'#f87171' }}>D:{ops.delete}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── DOCUMENT COUNTS ── */}
      {section === 'documents' && (
        <div>
          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
            {[
              { id:'sales',    label:'Sort: Sales'    },
              { id:'products', label:'Sort: Products' },
              { id:'totalDocs',label:'Sort: Total'    },
            ].map(s => (
              <button key={s.id} onClick={() => setSortBy(s.id)} style={{
                padding:'6px 12px', borderRadius:6, border:`1px solid ${sortBy===s.id?'#38bdf8':'#1e293b'}`,
                background: sortBy===s.id?'rgba(56,189,248,.1)':'transparent',
                color: sortBy===s.id?'#38bdf8':'#64748b', cursor:'pointer', fontSize:12,
              }}>{s.label}</button>
            ))}
            {loading && <span style={{ color:'#64748b', fontSize:13, marginLeft:8 }}>Loading…</span>}
          </div>

          {/* Summary */}
          {!loading && docStats.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
              {[
                { label:'Businesses', value:docStats.length,                          color:'#c084fc', icon:'🏪' },
                { label:'Total Sales',value:docStats.reduce((a,s)=>a+s.sales,0).toLocaleString(), color:'#4ade80', icon:'🛒' },
                { label:'Total Prods',value:docStats.reduce((a,s)=>a+s.products,0).toLocaleString(), color:'#38bdf8', icon:'📦' },
                { label:'Total Docs', value:docStats.reduce((a,s)=>a+s.totalDocs,0).toLocaleString(), color:'#f87171', icon:'📄' },
              ].map(item => (
                <div key={item.label} style={{ background:'#0a0f1a', border:'1px solid #1e293b', borderRadius:10, padding:'14px', textAlign:'center' }}>
                  <p style={{ margin:0, fontSize:22 }}>{item.icon}</p>
                  <p style={{ margin:'6px 0 2px', fontSize:20, fontWeight:700, color:item.color }}>{item.value}</p>
                  <p style={{ margin:0, fontSize:11, color:'#475569' }}>{item.label}</p>
                </div>
              ))}
            </div>
          )}

          {docStats.map(row => {
            const isExpired = row.licenseExpiry && new Date(row.licenseExpiry) < new Date();
            return (
              <div key={row.tenantId} style={{ background:'#0a0f1a', border:'1px solid #1e293b', borderRadius:12, padding:'16px 20px', marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12, flexWrap:'wrap', gap:8 }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <span style={{ fontSize:14, fontWeight:700, color:'#f1f5f9' }}>{row.ownerEmail}</span>
                      <span style={{ fontSize:11, fontWeight:700, padding:'2px 10px', borderRadius:10, background:PLAN_BG[row.plan]||'#1e293b', color:PLAN_COLOR[row.plan]||'#64748b' }}>
                        {(row.plan||'none').toUpperCase()}
                      </span>
                      {isExpired && <span style={{ fontSize:11, color:'#f87171', background:'rgba(248,113,113,.1)', padding:'2px 8px', borderRadius:8 }}>⚠ Expired</span>}
                    </div>
                    <p style={{ margin:'3px 0 0', fontSize:11, color:'#475569' }}>
                      <code>{row.tenantId}</code> · Joined {row.createdAt?.toDate?.()?.toLocaleDateString()||'—'}
                    </p>
                  </div>
                  <p style={{ margin:0, fontSize:18, fontWeight:700, color:'#4ade80' }}>{row.totalDocs.toLocaleString()} docs</p>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6 }}>
                  {[
                    ['🛒','Sales',    row.sales,     '#4ade80', 'sales'],
                    ['📦','Products', row.products,  '#38bdf8', 'products'],
                    ['👥','Workers',  row.workers,   '#fbbf24', 'workers'],
                    ['📥','Stock',    row.stock,     '#c084fc', 'stock'],
                    ['🤝','Credit',   row.credit,    '#fb923c', 'credit'],
                    ['🏭','Suppliers',row.suppliers, '#94a3b8', 'suppliers'],
                    ['🔍','Activity', row.activity,  '#f87171', 'activity'],
                  ].map(([icon,label,val,color,key]) => {
                    const limit = TIERS[row.plan]?.[key];
                    const pct   = limit && limit!==Infinity ? Math.min((val/limit)*100,100) : null;
                    return (
                      <div key={key} style={{ background:'#0f172a', borderRadius:8, padding:'9px', textAlign:'center' }}>
                        <p style={{ margin:0, fontSize:14 }}>{icon}</p>
                        <p style={{ margin:'2px 0', fontSize:16, fontWeight:700, color }}>{val}</p>
                        <p style={{ margin:0, fontSize:9, color:'#475569' }}>{label}</p>
                        {pct!==null && (
                          <div style={{ marginTop:5, height:3, borderRadius:2, background:'#1e293b', overflow:'hidden' }}>
                            <div style={{ width:`${pct}%`, height:'100%', background:pct>80?'#f87171':color }}/>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Tier reference */}
          <div style={{ background:'#0a0f1a', border:'1px solid #1e293b', borderRadius:10, padding:'14px 18px', marginTop:8 }}>
            <p style={{ margin:'0 0 10px', fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em' }}>Tier Limits (edit TIERS in AdminPanel.js)</p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {[
                { plan:'Starter', color:'#4ade80', bg:'#1e3a1e', limits:'1,000 sales · 200 products · 1 worker' },
                { plan:'Pro',     color:'#38bdf8', bg:'#1e2d4a', limits:'10,000 sales · 2,000 products · 5 workers' },
                { plan:'Business',color:'#c084fc', bg:'#2d1e4a', limits:'Unlimited' },
              ].map(t => (
                <div key={t.plan} style={{ background:t.bg, borderRadius:8, padding:'10px 14px' }}>
                  <p style={{ margin:'0 0 3px', fontSize:13, fontWeight:700, color:t.color }}>{t.plan}</p>
                  <p style={{ margin:0, fontSize:11, color:'#94a3b8' }}>{t.limits}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Approve modal ──────────────────────────────────────────────────────────────
function ApproveModal({ sub, onApprove, onClose, saving }) {
  const [planId,  setPlanId]  = useState(sub.plan||'starter');
  const [notes,   setNotes]   = useState('');
  const [expiry,  setExpiry]  = useState(
    // Pre-set to 1 month from today as sensible default
    addDaysToDate(null, 30)
  );

  return (
    <div style={st.overlay}>
      <div style={{ ...st.box, maxWidth:520 }}>
        <h3 style={{ margin:'0 0 16px', color:'#f1f5f9' }}>✓ Approve Payment</h3>

        {/* Payment summary */}
        <div style={{ background:'#0f172a', borderRadius:9, padding:'14px', marginBottom:16, fontSize:13 }}>
          <p style={{ margin:'0 0 5px', color:'#94a3b8' }}>
            Customer: <strong style={{ color:'#f1f5f9' }}>{sub.ownerEmail}</strong>
          </p>
          <p style={{ margin:'0 0 5px', color:'#94a3b8' }}>
            Requested: <strong style={{ color:'#fbbf24' }}>{sub.plan}</strong> · ${sub.amount} {sub.currency}/{sub.billingPeriod}
          </p>
          <p style={{ margin:'0 0 5px', color:'#94a3b8' }}>
            Method: <strong style={{ color:'#f1f5f9' }}>{sub.paymentMethod}</strong>
          </p>
          <p style={{ margin:0, color:'#94a3b8' }}>
            Ref: <code style={{ color:'#38bdf8' }}>{sub.paymentRef}</code>
          </p>
        </div>

        {/* Plan selector */}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:12, color:'#64748b', display:'block', marginBottom:6 }}>Activate plan</label>
          <select value={planId} onChange={e => setPlanId(e.target.value)}
            style={{ width:'100%', padding:'9px 12px', background:'#0f172a', border:'1px solid #334155', borderRadius:8, color:'#f1f5f9', fontSize:14 }}>
            {['starter','pro','business'].map(p => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Expiry picker */}
        <label style={{ fontSize:12, color:'#64748b', display:'block', marginBottom:6 }}>
          License duration / expiry
        </label>
        <ExpiryPicker
          currentExpiry={null}
          value={expiry}
          onChange={setExpiry}
        />

        {/* Notes */}
        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:12, color:'#64748b', display:'block', marginBottom:6 }}>
            Internal notes (optional)
          </label>
          <input value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. PayPal verified — 1 month plan"
            style={{ width:'100%', padding:'9px 12px', background:'#0f172a', border:'1px solid #334155', borderRadius:8, color:'#f1f5f9', fontSize:14, boxSizing:'border-box' }}
          />
        </div>

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button style={st.btnSec} onClick={onClose}>Cancel</button>
          <button style={st.approveBtn}
            onClick={() => onApprove(sub, planId, notes, expiry)}
            disabled={saving}>
            {saving ? 'Activating…' : `✓ Activate ${planId}${expiry ? ' → '+expiry : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Extend license modal ───────────────────────────────────────────────────────
function ExtendModal({ tenantId, email, currentExpiry, plan, onExtend, onClose, saving }) {
  const [newExpiry, setNewExpiry] = useState(
    addDaysToDate(currentExpiry || null, 30)
  );

  const handleConfirm = async () => {
    await onExtend(tenantId, plan, newExpiry);
    onClose();
  };

  return (
    <div style={st.overlay}>
      <div style={{ ...st.box, maxWidth:480 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ margin:0, color:'#f1f5f9' }}>⏱ Extend License</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:18 }}>✕</button>
        </div>

        <div style={{ background:'#0f172a', borderRadius:9, padding:'12px 14px', marginBottom:16, fontSize:13 }}>
          <p style={{ margin:'0 0 4px', color:'#94a3b8' }}>
            Store: <strong style={{ color:'#f1f5f9' }}>{email || tenantId}</strong>
          </p>
          <p style={{ margin:'0 0 4px', color:'#94a3b8' }}>
            Current plan: <strong style={{ color:'#38bdf8' }}>{plan}</strong>
          </p>
          <p style={{ margin:0, color:'#94a3b8' }}>
            Current expiry:{' '}
            <strong style={{ color: currentExpiry ? (new Date(currentExpiry) < new Date() ? '#f87171' : '#4ade80') : '#475569' }}>
              {currentExpiry || 'No expiry set'}
            </strong>
          </p>
        </div>

        <label style={{ fontSize:12, color:'#64748b', display:'block', marginBottom:6 }}>
          Set new expiry date
        </label>
        <ExpiryPicker
          currentExpiry={currentExpiry}
          value={newExpiry}
          onChange={setNewExpiry}
        />

        {newExpiry && (
          <div style={{ background:'rgba(74,222,128,.08)', border:'1px solid rgba(74,222,128,.2)', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>
            <strong style={{ color:'#4ade80' }}>New expiry will be: {newExpiry}</strong>
            {currentExpiry && (
              <span style={{ color:'#64748b', marginLeft:8, fontSize:11 }}>
                (was {currentExpiry})
              </span>
            )}
          </div>
        )}

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button style={st.btnSec} onClick={onClose}>Cancel</button>
          <button style={st.approveBtn} onClick={handleConfirm} disabled={saving || !newExpiry}>
            {saving ? 'Saving…' : '✓ Confirm extension'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Product modal ──────────────────────────────────────────────────────────────
function ProductModal({ item, onSave, onClose, saving }) {
  const blank = { name:'', company:'', size:'', category:'Books', price:'', cost:'', unit:'ea', barcode:'' };
  const [form, setForm] = useState(item ? { ...item, price:item.price?.toString(), cost:item.cost?.toString() } : blank);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  return (
    <div style={st.overlay}>
      <div style={st.box}>
        <h3 style={{ margin:'0 0 16px', color:'#f1f5f9' }}>{item?'Edit Product':'Add to Catalogue'}</h3>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 14px' }}>
          {[
            { k:'name',    label:'Name *',         ph:'The Great Gatsby'   },
            { k:'company', label:'Publisher/Brand', ph:'Scribner'           },
            { k:'size',    label:'Size/Format',     ph:'Paperback'          },
            { k:'category',label:'Category',        ph:'Books'              },
            { k:'price',   label:'Suggested Price', ph:'14.99', type:'number' },
            { k:'cost',    label:'Suggested Cost',  ph:'7.00',  type:'number' },
            { k:'unit',    label:'Unit',             ph:'ea'                 },
            { k:'barcode', label:'Barcode/ISBN',     ph:'9780743273565'      },
          ].map(({ k, label, ph, type }) => (
            <div key={k} style={{ marginBottom:12 }}>
              <label style={{ display:'block', marginBottom:4, fontSize:12, color:'#94a3b8' }}>{label}</label>
              <input type={type||'text'} value={form[k]||''} onChange={e=>set(k,e.target.value)}
                placeholder={ph} step={type==='number'?'0.01':undefined}
                style={{ width:'100%', padding:'8px 10px', background:'#0f172a', border:'1px solid #334155', borderRadius:6, color:'#f1f5f9', fontSize:13, boxSizing:'border-box' }}/>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
          <button style={st.btnSec} onClick={onClose}>Cancel</button>
          <button style={st.btnPri} onClick={()=>{
            if (!form.name.trim()) { alert('Name required'); return; }
            onSave({...form, price:parseFloat(form.price)||0, cost:parseFloat(form.cost)||0});
          }} disabled={saving}>{saving?'Saving…':item?'Update':'Add Product'}</button>
        </div>
      </div>
    </div>
  );
}

function Loading() { return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'#64748b',fontFamily:'Inter,sans-serif' }}>Checking access…</div>; }
function Denied({ email }) {
  return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:'Inter,sans-serif',color:'#f1f5f9',textAlign:'center' }}>
      <div style={{ fontSize:48, marginBottom:12 }}>🔒</div>
      <h2>Admin Access Only</h2>
      <p style={{ color:'#64748b' }}>This panel is restricted to the platform administrator.</p>
      <p style={{ fontSize:12, color:'#475569', marginTop:8 }}>Signed in as: {email||'not signed in'}</p>
    </div>
  );
}

const st = {
  wrap:      { background:'#0f172a', minHeight:'100vh', padding:'24px 32px', fontFamily:'Inter,sans-serif', color:'#f1f5f9' },
  toast:     { position:'fixed', top:16, right:16, padding:'10px 20px', borderRadius:8, color:'#fff', zIndex:9999, fontSize:14 },
  tabBar:    { display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid #1e293b' },
  tab:       { padding:'8px 16px', background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:14, borderBottom:'2px solid transparent' },
  tabActive: { color:'#38bdf8', borderBottom:'2px solid #38bdf8' },
  tableWrap: { overflowX:'auto', borderRadius:10, border:'1px solid #1e293b' },
  table:     { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th:        { padding:'10px 14px', textAlign:'left', borderBottom:'1px solid #1e293b', color:'#64748b', fontWeight:500, whiteSpace:'nowrap', background:'#0d1526' },
  tr:        { borderBottom:'1px solid #0f172a' },
  td:        { padding:'10px 14px', color:'#e2e8f0' },
  editBtn:   { padding:'3px 10px', background:'#1e293b', border:'none', borderRadius:6, color:'#94a3b8', cursor:'pointer', fontSize:12, marginRight:4 },
  delBtn:    { padding:'3px 10px', background:'#450a0a', border:'none', borderRadius:6, color:'#f87171', cursor:'pointer', fontSize:12 },
  approveBtn:{ padding:'8px 16px', background:'rgba(74,222,128,.15)', border:'1px solid rgba(74,222,128,.3)', borderRadius:8, color:'#4ade80', cursor:'pointer', fontSize:13, fontWeight:600 },
  rejectBtn: { padding:'8px 16px', background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.2)', borderRadius:8, color:'#f87171', cursor:'pointer', fontSize:13 },
  btnPri:    { padding:'8px 16px', background:'#0ea5e9', border:'none', borderRadius:8, color:'#fff', cursor:'pointer', fontSize:13 },
  btnSec:    { padding:'8px 16px', background:'#1e293b', border:'none', borderRadius:8, color:'#94a3b8', cursor:'pointer', fontSize:13 },
  overlay:   { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 },
  box:       { background:'#1e293b', borderRadius:12, padding:24, width:'90%', maxWidth:540, maxHeight:'90vh', overflowY:'auto' },
  textarea:  { width:'100%', padding:'8px 10px', background:'#0f172a', border:'1px solid #334155', borderRadius:6, color:'#f1f5f9', fontSize:12, fontFamily:'monospace', boxSizing:'border-box' },
};
