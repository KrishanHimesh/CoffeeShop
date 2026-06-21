import React, { useState } from 'react';
import { PAYMENT_TERMS } from './constants';

const BLANK_SUP = { name:'', address:'', phone:'', email:'', notes:'', paymentTerms:'30 days', salesReps:[] };
const BLANK_REP = { name:'', phone:'', email:'' };

export default function Suppliers({ suppliers, onAdd, onUpdate, onDelete }) {
  const [modal,   setModal]   = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [search,  setSearch]  = useState('');

  const filtered = suppliers.filter(s => {
    const q = search.toLowerCase();
    return !q || s.name?.toLowerCase().includes(q) || s.phone?.includes(q) ||
           s.salesReps?.some(r => r.name?.toLowerCase().includes(q));
  });

  const handleSave = async data => {
    if (data.id) await onUpdate(data.id, data);
    else         await onAdd(data);
    setModal(null);
  };

  return (
    <div className="bs-suppliers">
      <div className="bs-inv-bar">
        <div className="bs-inv-bar-l">
          <h2 className="bs-h2" style={{margin:0}}>🏭 Suppliers</h2>
          <input className="bs-inp" style={{width:'220px'}} placeholder="🔍 Search supplier…"
            value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <button className="bs-add" onClick={()=>setModal({data:null})}>+ Add Supplier</button>
      </div>

      {filtered.length === 0 && (
        <div className="bs-sup-empty">
          <p style={{fontSize:'32px',marginBottom:'8px'}}>🏭</p>
          <p className="bs-muted">No suppliers yet. Add your first supplier to get started.</p>
        </div>
      )}

      <div className="bs-sup-grid">
        {filtered.map(sup => (
          <div key={sup.id} className="bs-sup-card">
            <div className="bs-sup-header">
              <div className="bs-sup-avatar">{(sup.name||'?')[0].toUpperCase()}</div>
              <div className="bs-sup-info">
                <p className="bs-sup-name">{sup.name}</p>
                {sup.phone && (
                  <a href={`tel:${sup.phone}`} className="bs-sup-phone">📞 {sup.phone}</a>
                )}
                {sup.email && <p className="bs-sup-email">✉ {sup.email}</p>}
              </div>
              <div className="bs-sup-actions">
                <button className="bs-act edit" onClick={()=>setModal({data:{...sup, salesReps:sup.salesReps||[]}})}>Edit</button>
                <button className="bs-act del"  onClick={()=>setConfirm(sup.id)}>Del</button>
              </div>
            </div>

            <div style={{display:'flex',gap:'12px',flexWrap:'wrap'}}>
              {sup.address&&<p className="bs-sup-address">📍 {sup.address}</p>}
              {sup.paymentTerms&&<p style={{fontSize:'12px',color:'#818cf8'}}>⏱ {sup.paymentTerms}</p>}
            </div>

            {sup.salesReps?.length > 0 && (
              <div className="bs-sup-reps">
                <p className="bs-sup-reps-label">Sales Representatives</p>
                {sup.salesReps.map((rep, i) => (
                  <div key={i} className="bs-sup-rep">
                    <div className="bs-sup-rep-av">{(rep.name||'?')[0].toUpperCase()}</div>
                    <div className="bs-sup-rep-info">
                      <p className="bs-sup-rep-name">{rep.name}</p>
                      {rep.email && <p className="bs-sup-rep-email">{rep.email}</p>}
                    </div>
                    {rep.phone && (
                      <a href={`tel:${rep.phone}`} className="bs-sup-call-btn" title={`Call ${rep.name}`}>
                        📞 {rep.phone}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {sup.notes && <p className="bs-sup-notes">{sup.notes}</p>}
          </div>
        ))}
      </div>

      {modal && (
        <div className="bs-overlay" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <SupplierForm supplier={modal.data} onSave={handleSave} onClose={()=>setModal(null)} />
        </div>
      )}

      {confirm && (
        <div className="bs-overlay" onClick={e=>e.target===e.currentTarget&&setConfirm(null)}>
          <div className="bs-modal" style={{maxWidth:'360px',padding:'28px'}}>
            <h3 style={{marginBottom:'12px'}}>Remove Supplier?</h3>
            <p className="bs-muted" style={{marginBottom:'20px'}}>This will not affect existing stock receipts.</p>
            <div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}>
              <button className="bs-sec" onClick={()=>setConfirm(null)}>Cancel</button>
              <button className="bs-act del" style={{padding:'9px 18px'}} onClick={async()=>{await onDelete(confirm);setConfirm(null);}}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SupplierForm({ supplier, onSave, onClose }) {
  const [f, setF] = useState(supplier || BLANK_SUP);
  const set = (k,v) => setF(p => ({...p,[k]:v}));

  const addRep    = () => setF(p => ({...p, salesReps:[...( p.salesReps||[]), {...BLANK_REP}]}));
  const removeRep = i  => setF(p => ({...p, salesReps: p.salesReps.filter((_,idx)=>idx!==i)}));
  const setRep    = (i,k,v) => setF(p => ({...p, salesReps: p.salesReps.map((r,idx)=>idx===i?{...r,[k]:v}:r)}));

  const submit = e => { e.preventDefault(); onSave(f); };

  return (
    <div className="bs-modal" style={{maxWidth:'560px'}}>
      <div className="bs-mhdr">
        <h3>{supplier ? 'Edit Supplier' : 'Add Supplier'}</h3>
        <button className="bs-mx" onClick={onClose}>✕</button>
      </div>
      <form className="bs-form" onSubmit={submit}>
        <div className="bs-fg">
          <label>Company Name *</label>
          <input value={f.name||''} onChange={e=>set('name',e.target.value)} required placeholder="Supplier company name"/>
        </div>
        <div className="bs-frow">
          <div className="bs-fg">
            <label>Phone Number</label>
            <input value={f.phone||''} onChange={e=>set('phone',e.target.value)} placeholder="+61 3 xxxx xxxx"/>
          </div>
          <div className="bs-fg">
            <label>Email</label>
            <input type="email" value={f.email||''} onChange={e=>set('email',e.target.value)} placeholder="orders@supplier.com"/>
          </div>
        </div>
        <div className="bs-fg">
          <label>Address</label>
          <input value={f.address||''} onChange={e=>set('address',e.target.value)} placeholder="Street, City, State, Postcode"/>
        </div>
        <div className="bs-fg">
          <label>Notes</label>
          <input value={f.notes||''} onChange={e=>set('notes',e.target.value)} placeholder="Payment terms, delivery days, etc."/>
        </div>

        {/* Sales Reps */}
        <div className="bs-fg">
          <label>Payment Terms</label>
          <select value={f.paymentTerms||'30 days'} onChange={e=>set('paymentTerms',e.target.value)}>
            {PAYMENT_TERMS.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="bs-sup-reps-section">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
            <label style={{fontSize:'10px',letterSpacing:'.08em',textTransform:'uppercase',color:'#64748b'}}>Sales Representatives</label>
            <button type="button" className="bs-sec" style={{padding:'4px 12px',fontSize:'12px'}} onClick={addRep}>+ Add Rep</button>
          </div>
          {(f.salesReps||[]).map((rep, i) => (
            <div key={i} className="bs-rep-form-row">
              <div className="bs-fg" style={{flex:2}}>
                <label>Name</label>
                <input value={rep.name||''} onChange={e=>setRep(i,'name',e.target.value)} placeholder="Rep name"/>
              </div>
              <div className="bs-fg" style={{flex:2}}>
                <label>Phone</label>
                <input value={rep.phone||''} onChange={e=>setRep(i,'phone',e.target.value)} placeholder="+61 4xx xxx xxx"/>
              </div>
              <div className="bs-fg" style={{flex:2}}>
                <label>Email</label>
                <input value={rep.email||''} onChange={e=>setRep(i,'email',e.target.value)} placeholder="rep@supplier.com"/>
              </div>
              <button type="button" className="bs-act del" style={{marginTop:'18px',padding:'7px 10px',flexShrink:0}} onClick={()=>removeRep(i)}>✕</button>
            </div>
          ))}
          {(f.salesReps||[]).length === 0 && (
            <p className="bs-muted" style={{fontSize:'12px'}}>No sales reps added yet.</p>
          )}
        </div>

        <div className="bs-fa">
          <button type="button" className="bs-sec" onClick={onClose}>Cancel</button>
          <button type="submit" className="bs-pri">{supplier ? 'Save Changes' : 'Add Supplier'}</button>
        </div>
      </form>
    </div>
  );
}
