import React, { useState, useEffect } from 'react';
import { DEFAULT_SETTINGS } from './useStore';

const CURRENCIES = [
  { code:'AUD', symbol:'$',  name:'Australian Dollar' },
  { code:'USD', symbol:'$',  name:'US Dollar' },
  { code:'GBP', symbol:'£',  name:'British Pound' },
  { code:'EUR', symbol:'€',  name:'Euro' },
  { code:'LKR', symbol:'Rs', name:'Sri Lankan Rupee' },
  { code:'SGD', symbol:'$',  name:'Singapore Dollar' },
  { code:'NZD', symbol:'$',  name:'New Zealand Dollar' },
  { code:'INR', symbol:'₹',  name:'Indian Rupee' },
];

const GST_RATES = [0, 5, 10, 12.5, 15, 18, 20];

export default function Settings({ settings, onSave, profile, onUpdateProfile, workers, onUpdateWorker }) {
  const [settingsTab, setSettingsTab] = useState('store'); // 'store' | 'profile' | 'team'
  const isOwner = profile?.role === 'owner';
  const [form, setForm] = useState({ ...DEFAULT_SETTINGS, ...settings });
  const [profForm, setProfForm] = useState({
    name:  profile?.name  || '',
    phone: profile?.phone || '',
    email: profile?.email || '',
    role:  profile?.role  || 'cashier',
  });
  const [profSaved, setProfSaved] = useState(false);
  const [profErr,   setProfErr]   = useState('');

  // Edit-other-worker state (owner only)
  const [editWorker,    setEditWorker]    = useState(null);
  const [editWorkerForm,setEditWorkerForm]= useState({});
  const [workerSaved,   setWorkerSaved]   = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Feedback popup state
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({ type: 'feedback', subject: '', message: '' });
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => { setForm({ ...DEFAULT_SETTINGS, ...settings }); }, [settings]);
  useEffect(() => {
    setProfForm({ name: profile?.name||'', phone: profile?.phone||'', email: profile?.email||'', role: profile?.role||'cashier' });
  }, [profile]);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfErr('');
    if (!profForm.name.trim()) { setProfErr('Name is required'); return; }
    try {
      await onUpdateProfile(profile.id, { name: profForm.name.trim(), phone: profForm.phone.trim() });
      setProfSaved(true);
      setTimeout(() => setProfSaved(false), 2500);
    } catch (err) { setProfErr(err.message); }
  };

  const handleWorkerSave = async (e) => {
    e.preventDefault();
    try {
      await onUpdateWorker(editWorker.id, editWorkerForm);
      setWorkerSaved(true);
      setTimeout(() => { setWorkerSaved(false); setEditWorker(null); }, 1500);
    } catch (err) { alert(err.message); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    await onSave(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    // Here you would typically send the feedback to your backend
    console.log('Feedback submitted:', { ...feedbackForm, user: profile });
    
    // Simulate sending feedback
    setFeedbackSent(true);
    setTimeout(() => {
      setFeedbackSent(false);
      setShowFeedback(false);
      setFeedbackForm({ type: 'feedback', subject: '', message: '' });
    }, 2000);
  };

  const selectedCurrency = CURRENCIES.find(c => c.code === form.currency) || CURRENCIES[0];

  return (
    <div className="bs-settings">
      <div className="bs-inv-bar" style={{marginBottom:'16px'}}>
        <h2 className="bs-h2" style={{margin:0}}>⚙️ Settings</h2>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid #1e293b' }}>
        {[
          { id:'store',   label:'🏪 Store Settings' },
          { id:'profile', label:'👤 My Profile' },
          ...(isOwner ? [{ id:'team', label:'👥 Team Profiles' }] : []),
        ].map(t => (
          <button key={t.id} type="button" onClick={() => setSettingsTab(t.id)}
            style={{
              padding:'8px 16px', background:'none', border:'none',
              color: settingsTab===t.id ? '#38bdf8' : '#64748b',
              cursor:'pointer', fontSize:14,
              borderBottom: settingsTab===t.id ? '2px solid #38bdf8' : '2px solid transparent',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── PROFILE TAB ── */}
      {settingsTab === 'profile' && (
        <div style={{ maxWidth:500 }}>
          <div style={{ background:'rgba(56,189,248,.06)', border:'1px solid rgba(56,189,248,.12)', borderRadius:10, padding:'14px 16px', marginBottom:20, fontSize:13, color:'#94a3b8' }}>
            👤 Update your personal details below. Email and role can only be changed by an owner.
          </div>
          <form onSubmit={handleProfileSave}>
            <div className="bs-settings-grid">
              <div className="bs-settings-card span2">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px 20px' }}>
                  <div>
                    <label style={lbl}>Full Name *</label>
                    <input value={profForm.name} onChange={e => setProfForm(p=>({...p,name:e.target.value}))}
                      placeholder="Your name" style={inp} required/>
                  </div>
                  <div>
                    <label style={lbl}>Phone Number</label>
                    <input type="tel" value={profForm.phone} onChange={e => setProfForm(p=>({...p,phone:e.target.value}))}
                      placeholder="+61 4xx xxx xxx" style={inp}/>
                  </div>
                  <div>
                    <label style={lbl}>Email <span style={{ color:'#475569', fontWeight:400 }}>(cannot be changed here)</span></label>
                    <input value={profForm.email} disabled style={{ ...inp, opacity:0.5, cursor:'not-allowed' }}/>
                  </div>
                  <div>
                    <label style={lbl}>Role <span style={{ color:'#475569', fontWeight:400 }}>(set by owner)</span></label>
                    <input value={profForm.role} disabled style={{ ...inp, opacity:0.5, cursor:'not-allowed', textTransform:'capitalize' }}/>
                  </div>
                </div>
                {profErr && <p style={{ color:'#f87171', fontSize:13, marginTop:10 }}>⚠ {profErr}</p>}
                <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:16 }}>
                  <button type="submit" className="bs-pri" style={{ padding:'10px 24px' }}>
                    Save Profile
                  </button>
                  {profSaved && <span style={{ color:'#4ade80', fontSize:13 }}>✅ Saved!</span>}
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── TEAM PROFILES TAB (owner only) ── */}
      {settingsTab === 'team' && isOwner && (
        <div style={{ maxWidth:700 }}>
          <div style={{ background:'rgba(56,189,248,.06)', border:'1px solid rgba(56,189,248,.12)', borderRadius:10, padding:'14px 16px', marginBottom:20, fontSize:13, color:'#94a3b8' }}>
            👑 As owner you can edit any team member's name, phone, email, and role. Workers cannot change their own email or role.
          </div>

          {editWorker ? (
            <form onSubmit={handleWorkerSave}>
              <div style={{ background:'#0d1526', border:'1px solid #1e293b', borderRadius:12, padding:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
                  <h3 style={{ margin:0, color:'#f1f5f9' }}>Edit — {editWorker.name}</h3>
                  <button type="button" onClick={() => setEditWorker(null)}
                    style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:18 }}>✕</button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px 20px' }}>
                  {[
                    { k:'name',  label:'Full Name *',    ph:'Name',               type:'text',  canEdit:true },
                    { k:'phone', label:'Phone',           ph:'+61 4xx xxx xxx',   type:'tel',   canEdit:true },
                    { k:'email', label:'Email *',         ph:'worker@email.com',   type:'email', canEdit:true  },
                    { k:'role',  label:'Role',            ph:'',                   type:'select',canEdit:true  },
                  ].map(({ k, label, ph, type, canEdit }) => (
                    <div key={k}>
                      <label style={lbl}>{label}</label>
                      {type === 'select' ? (
                        <select value={editWorkerForm[k]||'cashier'}
                          onChange={e => setEditWorkerForm(p=>({...p,[k]:e.target.value}))}
                          style={{ ...inp, cursor:'pointer' }}>
                          <option value="owner">👑 Owner</option>
                          <option value="manager">🔧 Manager</option>
                          <option value="cashier">🛒 Cashier</option>
                        </select>
                      ) : (
                        <input type={type} value={editWorkerForm[k]||''}
                          onChange={e => setEditWorkerForm(p=>({...p,[k]:e.target.value}))}
                          placeholder={ph} style={inp} required={k==='name'||k==='email'}/>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:16 }}>
                  <button type="button" className="bs-sec" onClick={() => setEditWorker(null)}>Cancel</button>
                  <button type="submit" className="bs-pri" style={{ padding:'10px 24px' }}>Save Changes</button>
                  {workerSaved && <span style={{ color:'#4ade80', fontSize:13 }}>✅ Saved!</span>}
                </div>
              </div>
            </form>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {(workers||[]).map(w => (
                <div key={w.id} style={{ background:'#0d1526', border:'1px solid #1e293b', borderRadius:10, padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
                  <div>
                    <p style={{ margin:0, fontWeight:600, color:'#f1f5f9', fontSize:14 }}>{w.name}</p>
                    <p style={{ margin:'3px 0 0', fontSize:12, color:'#64748b' }}>{w.email} · {w.phone||'No phone'}</p>
                    <span style={{
                      display:'inline-block', marginTop:4, fontSize:11, fontWeight:600,
                      padding:'1px 8px', borderRadius:8,
                      background: w.role==='owner'?'rgba(192,132,252,.15)':w.role==='manager'?'rgba(56,189,248,.12)':'rgba(74,222,128,.1)',
                      color: w.role==='owner'?'#c084fc':w.role==='manager'?'#38bdf8':'#4ade80',
                    }}>
                      {w.role==='owner'?'👑 Owner':w.role==='manager'?'🔧 Manager':'🛒 Cashier'}
                    </span>
                  </div>
                  <button className="bs-sec" style={{ fontSize:12 }}
                    onClick={() => { setEditWorker(w); setEditWorkerForm({ name:w.name, phone:w.phone||'', email:w.email, role:w.role }); }}>
                    ✏️ Edit
                  </button>
                </div>
              ))}
              {(!workers||workers.length===0) && (
                <p style={{ color:'#475569', fontSize:13 }}>No workers yet. Add workers in the Workers tab.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── STORE SETTINGS TAB ── */}
      {settingsTab === 'store' && (
      <><div className="bs-inv-bar" style={{marginBottom:'12px'}}>
        {saved && <span className="bs-saved-badge">✅ Settings saved!</span>}
      </div>
      <form onSubmit={handleSave}>
        <div className="bs-settings-grid">

          {/* Business Info */}
          <div className="bs-settings-card">
            <p className="bs-dcard-ttl">🏪 Business Information</p>
            <div className="bs-fg" style={{marginBottom:'14px'}}>
              <label>Business Name <span style={{fontSize:'11px',color:'#64748b',fontWeight:400}}>(shown on receipts & dashboard)</span></label>
              <input value={form.businessName} onChange={e=>set('businessName',e.target.value)} placeholder="Your business name" />
            </div>

            <div className="bs-fg" style={{marginBottom:'14px'}}>
              <label>Company / Legal Name <span style={{fontSize:'11px',color:'#64748b',fontWeight:400}}>(shown on receipts under business name)</span></label>
              <input value={form.companyName||''} onChange={e=>set('companyName',e.target.value)} placeholder="e.g. Unity Enterprises Pty Ltd" />
            </div>

            <div className="bs-fg" style={{marginBottom:'10px'}}>
              <label style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span>Receipt Footer — Line 1</span>
                <span style={{fontSize:'10px',color:'#64748b',fontWeight:400}}>always shown</span>
              </label>
              <input value={form.receiptFooter||''} onChange={e=>set('receiptFooter',e.target.value)} placeholder="Thank you for shopping with us!" />
            </div>

            <div className="bs-fg" style={{marginBottom:'12px'}}>
              <label style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span>Receipt Footer — Line 2 <span style={{color:'#64748b',fontWeight:400,fontSize:'11px'}}>(seasonal / optional)</span></span>
                {form.receiptFooter2 && (
                  <button type="button" onClick={()=>set('receiptFooter2','')}
                    style={{fontSize:'10px',color:'#f87171',background:'none',border:'none',cursor:'pointer',padding:0}}>
                    ✕ Clear
                  </button>
                )}
              </label>
              <input value={form.receiptFooter2||''} onChange={e=>set('receiptFooter2',e.target.value)} placeholder="e.g. Happy New Year! 🎊" />
            </div>

            {/* Seasonal quick-fill presets */}
            <div>
              <p style={{fontSize:'10px',color:'#64748b',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'6px'}}>Quick seasonal messages</p>
              <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
                {[
                  { label:'🎄 Christmas',  msg:'Wishing you a Merry Christmas & Happy New Year!' },
                  { label:'🎊 New Year',   msg:'Happy New Year! Wishing you health & happiness.' },
                  { label:'🌙 Ramadan',    msg:'Ramadan Mubarak! Wishing you blessings & peace.' },
                  { label:'🎉 Sinhala NY', msg:'සුභ අලුත් අවුරුද්දක් වේවා! Happy Sinhala New Year!' },
                  { label:'🌸 Easter',     msg:'Happy Easter! Thank you for your continued support.' },
                  { label:'❤️ Valentine',  msg:'Happy Valentine\'s Day! Spread the love.' },
                  { label:'🛍️ Sale',       msg:'Grand Sale On Now — Up to 50% Off Selected Items!' },
                  { label:'🏖️ Summer',     msg:'Have a wonderful summer! See you soon.' },
                ].map(p => (
                  <button key={p.label} type="button"
                    onClick={()=>set('receiptFooter2', p.msg)}
                    style={{
                      fontSize:'11px', padding:'4px 10px', borderRadius:'14px', cursor:'pointer',
                      background: form.receiptFooter2===p.msg ? 'rgba(56,189,248,.2)' : 'rgba(255,255,255,.05)',
                      border: form.receiptFooter2===p.msg ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,.1)',
                      color: form.receiptFooter2===p.msg ? '#38bdf8' : '#94a3b8',
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Live preview */}
            {(form.receiptFooter || form.receiptFooter2) && (
              <div style={{marginTop:'14px',background:'#0d1526',border:'1px dashed #2a3a5c',borderRadius:'8px',padding:'10px 14px',textAlign:'center'}}>
                <p style={{fontSize:'10px',color:'#64748b',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'6px'}}>Receipt Preview</p>
                <p style={{fontSize:'12px',color:'#94a3b8'}}>{form.receiptFooter||'—'}</p>
                {form.receiptFooter2 && <p style={{fontSize:'12px',color:'#38bdf8',marginTop:'3px'}}>{form.receiptFooter2}</p>}
              </div>
            )}
          </div>

          {/* Currency */}
          <div className="bs-settings-card">
            <p className="bs-dcard-ttl">💱 Currency</p>
            <div className="bs-fg" style={{marginBottom:'14px'}}>
              <label>Currency</label>
              <select value={form.currency} onChange={e=>{
                const c = CURRENCIES.find(x=>x.code===e.target.value);
                setForm(p=>({...p, currency:c.code, currencySymbol:c.symbol}));
              }}>
                {CURRENCIES.map(c=>(
                  <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>
                ))}
              </select>
            </div>
            <div className="bs-settings-preview">
              <span className="bs-muted">Preview:</span>
              <span className="bs-preview-price">{selectedCurrency.symbol}29.99</span>
            </div>
            <br />
            <br />
            {/* GST / Tax */}
          <p className="bs-dcard-ttl">🧾 Tax / GST Settings</p>
            <div className="bs-settings-toggle-row" style={{marginBottom:'16px'}}>
              <div>
                <p style={{fontSize:'14px',fontWeight:500,color:'var(--bs-text)'}}>Enable GST / Tax</p>
                <p className="bs-muted">Tax will be calculated on all sales</p>
              </div>
              <label className="bs-toggle">
                <input type="checkbox" checked={form.gstEnabled} onChange={e=>set('gstEnabled',e.target.checked)} />
                <span className="bs-toggle-slider" />
              </label>
            </div>
            {form.gstEnabled && (
              <div className="bs-fg">
                <label>Tax Rate (%)</label>
                <select value={form.gstRate} onChange={e=>set('gstRate',+e.target.value)}>
                  {GST_RATES.map(r=><option key={r} value={r}>{r}%{r===10?' (Australia GST)':r===15?' (NZ GST)':r===5?' (Canada GST)':''}</option>)}
                </select>
              </div>
            )}
            {!form.gstEnabled && <p className="bs-muted" style={{padding:'8px 0'}}>Tax is disabled — prices shown are final.</p>}
          </div>

                  

          {/* Receipt Numbering */}
          <div className="bs-settings-card">
            <p className="bs-dcard-ttl">🧾 Receipt Numbering</p>

            <div className="bs-frow" style={{marginBottom:'14px'}}>
              <div className="bs-fg">
                <label>Receipt Prefix</label>
                <input
                  value={form.receiptPrefix||'UN'}
                  onChange={e=>set('receiptPrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4))}
                  placeholder="UN"
                  maxLength={4}
                  style={{fontFamily:'monospace',letterSpacing:'2px',fontWeight:700}}
                />
                <span style={{fontSize:'10px',color:'#64748b',marginTop:'3px',display:'block'}}>Up to 4 letters/numbers</span>
              </div>
              <div className="bs-fg">
                <label>Starting Number</label>
                <input
                  type="number"
                  min="1"
                  max="99999"
                  value={form.receiptStartNum||100}
                  onChange={e=>set('receiptStartNum', Math.max(1,+e.target.value))}
                  placeholder="100"
                  style={{fontFamily:'monospace'}}
                />
                <span style={{fontSize:'10px',color:'#64748b',marginTop:'3px',display:'block'}}>First receipt will be {(form.receiptPrefix||'UN')}{form.receiptStartNum||100}</span>
              </div>
            </div>

            {/* Quick prefix presets */}
            <div style={{marginBottom:'12px'}}>
              <p style={{fontSize:'10px',color:'#64748b',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'6px'}}>Quick presets</p>
              <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
                {[
                  {label:'UN-100',  prefix:'UN',  start:100},
                  {label:'INV-001', prefix:'INV', start:1},
                  {label:'RCP-500', prefix:'RCP', start:500},
                  {label:'UBS-001', prefix:'UBS', start:1},
                  {label:'S-1000',  prefix:'S',   start:1000},
                ].map(p=>(
                  <button key={p.label} type="button"
                    onClick={()=>{set('receiptPrefix',p.prefix);set('receiptStartNum',p.start);}}
                    style={{
                      fontSize:'11px',padding:'4px 10px',borderRadius:'14px',cursor:'pointer',fontFamily:'monospace',
                      background:(form.receiptPrefix===p.prefix&&form.receiptStartNum===p.start)?'rgba(56,189,248,.2)':'rgba(255,255,255,.05)',
                      border:(form.receiptPrefix===p.prefix&&form.receiptStartNum===p.start)?'1px solid #38bdf8':'1px solid rgba(255,255,255,.1)',
                      color:(form.receiptPrefix===p.prefix&&form.receiptStartNum===p.start)?'#38bdf8':'#94a3b8',
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{background:'#0d1526',border:'1px dashed #2a3a5c',borderRadius:'8px',padding:'10px 14px'}}>
              <p style={{fontSize:'10px',color:'#64748b',marginBottom:'4px'}}>Preview format</p>
              <p style={{fontFamily:'monospace',fontSize:'18px',fontWeight:700,color:'#38bdf8',letterSpacing:'2px'}}>
                {form.receiptPrefix||'UN'}{form.receiptStartNum||100}
                <span style={{fontSize:'11px',color:'#64748b',marginLeft:'8px'}}>→</span>
                <span style={{marginLeft:'8px'}}>{form.receiptPrefix||'UN'}{(form.receiptStartNum||100)+1}</span>
                <span style={{fontSize:'11px',color:'#64748b',marginLeft:'8px'}}>→</span>
                <span style={{marginLeft:'8px'}}>{form.receiptPrefix||'UN'}{(form.receiptStartNum||100)+2}</span>
                <span style={{fontSize:'11px',color:'#64748b',marginLeft:'8px'}}>…</span>
              </p>
              <p style={{fontSize:'10px',color:'#fb923c',marginTop:'6px'}}>⚠ Changing the prefix or start number takes effect on the next sale. Existing receipts are not affected.</p>
            </div>
          </div>

          {/* Dashboard Font Style */}
          <div className="bs-settings-card">
            <p className="bs-dcard-ttl">🎨 Dashboard Stat Style</p>
            <p className="bs-muted" style={{marginBottom:'12px',fontSize:'12px'}}>Choose how figures appear on the main dashboard cards.</p>
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              {[
                { id:'syne',    label:'Syne',          sample:'$1,234.56',  desc:'Bold geometric — default',        font:"'Syne',sans-serif",       weight:800, size:'1.3rem' },
                { id:'mono',    label:'Monospace',      sample:'$1,234.56',  desc:'Terminal / ticker style',          font:"'Space Mono',monospace",  weight:700, size:'1.1rem' },
                { id:'inter',   label:'Inter Clean',    sample:'$1,234.56',  desc:'Crisp modern sans-serif',          font:"'Inter',sans-serif",       weight:700, size:'1.25rem'},
                { id:'serif',   label:'Playfair',       sample:'$1,234.56',  desc:'Elegant editorial serif',          font:"'Georgia',serif",          weight:700, size:'1.2rem' },
                { id:'display', label:'Big Display',    sample:'$1,234',     desc:'Large, impactful numbers',         font:"'Syne',sans-serif",        weight:900, size:'1.6rem' },
              ].map(opt=>(
                <button key={opt.id} type="button"
                  onClick={()=>set('dashFont',opt.id)}
                  style={{
                    display:'flex',alignItems:'center',gap:'14px',
                    padding:'10px 14px',borderRadius:'10px',cursor:'pointer',textAlign:'left',
                    background:form.dashFont===opt.id?'rgba(56,189,248,.1)':'rgba(255,255,255,.03)',
                    border:form.dashFont===opt.id?'1px solid #38bdf8':'1px solid rgba(255,255,255,.08)',
                    transition:'all .15s',
                  }}>
                  <span style={{
                    fontFamily:opt.font, fontWeight:opt.weight, fontSize:opt.size,
                    color: form.dashFont===opt.id?'#38bdf8':'#94a3b8',
                    minWidth:'110px', lineHeight:1,
                  }}>{opt.sample}</span>
                  <div>
                    <p style={{fontSize:'12px',fontWeight:600,color:form.dashFont===opt.id?'#e2e8f0':'#64748b'}}>{opt.label}</p>
                    <p style={{fontSize:'10px',color:'#475569'}}>{opt.desc}</p>
                  </div>
                  {form.dashFont===opt.id && <span style={{marginLeft:'auto',color:'#38bdf8',fontSize:'16px'}}>✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Category Manager */}
          <div className="bs-settings-card">
            <p className="bs-dcard-ttl">🗂️ Product Categories</p>
            <p className="bs-muted" style={{marginBottom:'14px',fontSize:'12px'}}>
              Built-in categories cannot be removed. Add your own custom categories below.
            </p>

            {/* Built-in categories (read-only) */}
            <div style={{marginBottom:'16px'}}>
              <p style={{fontSize:'10px',color:'#64748b',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'8px'}}>Built-in</p>
              <div style={{display:'flex',flexWrap:'wrap',gap:'8px'}}>
                {[
                  {name:'Books',     icon:'📚', color:'#38bdf8'},
                  {name:'Groceries', icon:'🛒', color:'#34d399'},
                  {name:'Supplies',  icon:'🗂️',  color:'#818cf8'},
                  {name:'Other',     icon:'📦', color:'#fb923c'},
                ].map(cat=>(
                  <div key={cat.name} style={{
                    display:'flex',alignItems:'center',gap:'6px',padding:'6px 12px',borderRadius:'20px',
                    background:'rgba(255,255,255,.04)',border:`1px solid ${cat.color}44`,
                    color:cat.color,fontSize:'12px',fontWeight:600,
                  }}>
                    <span>{cat.icon}</span><span>{cat.name}</span>
                    <span style={{fontSize:'10px',color:'#475569',marginLeft:'2px'}}>built-in</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom categories */}
            <div style={{marginBottom:'14px'}}>
              <p style={{fontSize:'10px',color:'#64748b',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'8px'}}>
                Custom ({(form.customCategories||[]).length})
              </p>
              {(form.customCategories||[]).length === 0 && (
                <p className="bs-muted" style={{fontSize:'12px',padding:'8px 0'}}>No custom categories yet.</p>
              )}
              <div style={{display:'flex',flexWrap:'wrap',gap:'8px',marginBottom:'10px'}}>
                {(form.customCategories||[]).map((cat,i)=>(
                  <div key={i} style={{
                    display:'flex',alignItems:'center',gap:'6px',padding:'6px 12px',borderRadius:'20px',
                    background:'rgba(255,255,255,.04)',border:`1px solid ${cat.color||'#64748b'}66`,
                    color:cat.color||'#94a3b8',fontSize:'12px',fontWeight:600,
                  }}>
                    <span>{cat.icon||'📦'}</span>
                    <span>{cat.name}</span>
                    <button type="button" onClick={()=>set('customCategories',(form.customCategories||[]).filter((_,j)=>j!==i))}
                      style={{background:'none',border:'none',cursor:'pointer',color:'#f87171',fontSize:'13px',padding:'0 0 0 2px',lineHeight:1}}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Add new category form */}
            <AddCategoryRow
              onAdd={cat => set('customCategories', [...(form.customCategories||[]), cat])}
              existing={[
                ...['Books','Groceries','Supplies','Other'],
                ...(form.customCategories||[]).map(c=>c.name)
              ]}
            />
          </div>

          {/* POS Display */}
          <div className="bs-settings-card">
            <p className="bs-dcard-ttl">🛒 POS Display</p>
            <div className="bs-settings-toggle-row">
              <div>
                <p style={{fontSize:'14px',fontWeight:500,color:'var(--bs-text)'}}>Show product images</p>
                <p className="bs-muted">Display category colour bar on product cards</p>
              </div>
              <label className="bs-toggle">
                <input type="checkbox" checked={form.showCategoryBar !== false} onChange={e=>set('showCategoryBar',e.target.checked)} />
                <span className="bs-toggle-slider" />
              </label>
            </div>
            <div className="bs-settings-toggle-row" style={{marginTop:'14px'}}>
              <div>
                <p style={{fontSize:'14px',fontWeight:500,color:'var(--bs-text)'}}>Compact product cards</p>
                <p className="bs-muted">Show more products per row (smaller cards)</p>
              </div>
              <label className="bs-toggle">
                <input type="checkbox" checked={form.compactCards === true} onChange={e=>set('compactCards',e.target.checked)} />
                <span className="bs-toggle-slider" />
              </label>
            </div>
          </div>

        </div>

        <div style={{display:'flex',justifyContent:'flex-end',marginTop:'24px',gap:'12px'}}>
          <button type="button" className="bs-sec" onClick={()=>setForm({...DEFAULT_SETTINGS,...settings})}>Reset to Default</button>
          <button type="submit" className="bs-pri" style={{padding:'11px 28px',fontSize:'14px'}}>💾 Save Settings</button>
        </div>
      </form>
      </>
      )}

      {/* Floating Feedback/Contact Button */}
 

      {/* Feedback Popup */}
      {showFeedback && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowFeedback(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 999,
              animation: 'fadeIn 0.2s ease',
            }}
          />
          
          {/* Popup Card */}
          <div style={{
            position: 'fixed',
            bottom: '96px',
            right: '24px',
            width: '380px',
            maxHeight: '520px',
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(56, 189, 248, 0.1)',
            zIndex: 1001,
            animation: 'slideUp 0.3s ease',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)',
              borderBottom: '1px solid #1e293b',
              padding: '20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f1f5f9' }}>
                  {feedbackForm.type === 'feedback' ? '💬 Send Feedback' : '📧 Contact Admin'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowFeedback(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    fontSize: '20px',
                    padding: '0',
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '20px' }}>
              {feedbackSent ? (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                  <p style={{ color: '#4ade80', fontSize: '16px', fontWeight: 500, margin: 0 }}>
                    Message sent successfully!
                  </p>
                  <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '8px' }}>
                    We'll get back to you soon.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleFeedbackSubmit}>
                  {/* Type selector */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    {[
                      { value: 'feedback', label: '💬 Feedback', icon: '💬' },
                      { value: 'contact', label: '📧 Contact Admin', icon: '📧' },
                    ].map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setFeedbackForm({ ...feedbackForm, type: type.value })}
                        style={{
                          flex: 1,
                          padding: '10px',
                          borderRadius: '8px',
                          border: feedbackForm.type === type.value ? '1px solid #38bdf8' : '1px solid #1e293b',
                          background: feedbackForm.type === type.value ? 'rgba(56, 189, 248, 0.1)' : '#0d1526',
                          color: feedbackForm.type === type.value ? '#38bdf8' : '#94a3b8',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: 500,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>

                  {/* Subject */}
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontSize: '12px',
                      color: '#94a3b8',
                      fontWeight: 500,
                    }}>
                      Subject *
                    </label>
                    <input
                      type="text"
                      value={feedbackForm.subject}
                      onChange={(e) => setFeedbackForm({ ...feedbackForm, subject: e.target.value })}
                      placeholder={feedbackForm.type === 'feedback' ? 'Brief description of your feedback' : 'What do you need help with?'}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: '#0d1526',
                        border: '1px solid #1e293b',
                        borderRadius: '8px',
                        color: '#f1f5f9',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {/* Message */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontSize: '12px',
                      color: '#94a3b8',
                      fontWeight: 500,
                    }}>
                      Message *
                    </label>
                    <textarea
                      value={feedbackForm.message}
                      onChange={(e) => setFeedbackForm({ ...feedbackForm, message: e.target.value })}
                      placeholder={feedbackForm.type === 'feedback' 
                        ? 'Share your thoughts, suggestions, or report issues...' 
                        : 'Describe your issue or question in detail...'}
                      required
                      rows={6}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: '#0d1526',
                        border: '1px solid #1e293b',
                        borderRadius: '8px',
                        color: '#f1f5f9',
                        fontSize: '14px',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {/* Info */}
                  <div style={{
                    background: 'rgba(56, 189, 248, 0.05)',
                    border: '1px solid rgba(56, 189, 248, 0.1)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '16px',
                    fontSize: '12px',
                    color: '#94a3b8',
                  }}>
                    <span style={{ color: '#38bdf8' }}>ℹ️</span> Your name and email ({profile?.email}) will be included with this message.
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="bs-pri"
                    style={{
                      width: '100%',
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: 600,
                    }}
                  >
                    {feedbackForm.type === 'feedback' ? '📤 Send Feedback' : '📧 Send Message'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const ICON_OPTIONS = ['📦','🍎','🥤','🍫','🧴','💊','🧹','📱','👕','🎮','🛠️','🔑','🌿','🐾','🎁','📷','🏋️','🌸','🍕','☕','🎨','📰','🧸','💡','🔋','🧺','🪴','🍞','🛒','✏️','🎵','🏥'];
const COLOR_OPTIONS = ['#38bdf8','#34d399','#818cf8','#fb923c','#f87171','#a78bfa','#fbbf24','#4ade80','#f472b6','#22d3ee','#e879f9','#86efac'];

function AddCategoryRow({ onAdd, existing }) {
  const [name,  setName]  = React.useState('');
  const [icon,  setIcon]  = React.useState('📦');
  const [color, setColor] = React.useState('#38bdf8');
  const [err,   setErr]   = React.useState('');
  const [showIcons, setShowIcons] = React.useState(false);

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) { setErr('Category name is required'); return; }
    if (existing.map(e=>e.toLowerCase()).includes(trimmed.toLowerCase())) {
      setErr('This category already exists'); return;
    }
    onAdd({ name: trimmed, icon, color });
    setName(''); setIcon('📦'); setColor('#38bdf8'); setErr(''); setShowIcons(false);
  };

  return (
    <div style={{background:'#0d1526',border:'1px dashed #2a3a5c',borderRadius:'10px',padding:'14px'}}>
      <p style={{fontSize:'11px',color:'#64748b',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'10px'}}>Add New Category</p>

      <div style={{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'flex-start'}}>
        {/* Icon picker */}
        <div style={{position:'relative'}}>
          <button type="button"
            onClick={()=>setShowIcons(s=>!s)}
            style={{
              width:'42px',height:'42px',borderRadius:'8px',fontSize:'20px',cursor:'pointer',
              background:'#1a2540',border:'1px solid #2a3a5c',display:'flex',alignItems:'center',justifyContent:'center',
            }}>
            {icon}
          </button>
          {showIcons && (
            <div style={{
              position:'absolute',top:'48px',left:0,zIndex:50,
              background:'#1a2540',border:'1px solid #2a3a5c',borderRadius:'10px',
              padding:'8px',display:'grid',gridTemplateColumns:'repeat(8,1fr)',gap:'4px',width:'240px',
            }}>
              {ICON_OPTIONS.map(ic=>(
                <button key={ic} type="button" onClick={()=>{setIcon(ic);setShowIcons(false);}}
                  style={{
                    fontSize:'18px',padding:'4px',borderRadius:'6px',cursor:'pointer',border:'none',
                    background:icon===ic?'rgba(56,189,248,.2)':'transparent',
                  }}>{ic}</button>
              ))}
            </div>
          )}
        </div>

        {/* Name input */}
        <div style={{flex:1,minWidth:'140px'}}>
          <input
            value={name}
            onChange={e=>{setName(e.target.value);setErr('');}}
            placeholder="Category name (e.g. Electronics)"
            style={{width:'100%',borderColor:err?'#f87171':''}}
            onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),handleAdd())}
          />
          {err && <span style={{color:'#f87171',fontSize:'11px',marginTop:'3px',display:'block'}}>⚠ {err}</span>}
        </div>

        {/* Color swatches */}
        <div style={{display:'flex',flexWrap:'wrap',gap:'4px',maxWidth:'160px'}}>
          {COLOR_OPTIONS.map(c=>(
            <button key={c} type="button" onClick={()=>setColor(c)}
              style={{
                width:'22px',height:'22px',borderRadius:'50%',background:c,cursor:'pointer',
                border:color===c?'2px solid #fff':'2px solid transparent',
                boxShadow:color===c?`0 0 0 2px ${c}`:'none',
              }}/>
          ))}
        </div>

        {/* Preview + Add */}
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          {name && (
            <div style={{
              display:'flex',alignItems:'center',gap:'5px',padding:'5px 12px',borderRadius:'16px',
              background:'rgba(255,255,255,.04)',border:`1px solid ${color}66`,color,fontSize:'12px',fontWeight:600,
            }}>
              {icon} {name.trim()||'Preview'}
            </div>
          )}
          <button type="button" className="bs-pri" style={{padding:'8px 16px',fontSize:'12px',whiteSpace:'nowrap'}} onClick={handleAdd}>
            + Add
          </button>
        </div>
      </div>
    </div>
  );
}

const lbl = { display:'block', marginBottom:4, fontSize:12, color:'#94a3b8', fontWeight:500 };
const inp = { width:'100%', padding:'10px 12px', background:'#0f172a', border:'1px solid #1e293b', borderRadius:8, color:'#f1f5f9', fontSize:14, boxSizing:'border-box' };

// Add animations to document
if (typeof document !== 'undefined' && !document.getElementById('feedback-animations')) {
  const style = document.createElement('style');
  style.id = 'feedback-animations';
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
  document.head.appendChild(style);
}
