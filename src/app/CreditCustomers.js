import React, { useState, useMemo } from 'react';
import { makeFmt } from './constants';

const BLANK = { name:'', phone:'', email:'', address:'', creditLimit:'', notes:'' };

export default function CreditCustomers({ customers, sales, onAdd, onUpdate, onDelete, settings }) {
  const fmt = makeFmt(settings?.currencySymbol || '$');
  const [modal,    setModal]   = useState(null);
  const [confirm,  setConfirm] = useState(null);
  const [selected, setSelected]= useState(null);
  const [search,   setSearch]  = useState('');
  const [payModal, setPayModal] = useState(null); // { customerId, saleId? }

  // Map sales to customers
  const customerSales = useMemo(() => {
    const map = {};
    (sales||[]).forEach(s => {
      if (s.creditCustomerId) {
        if (!map[s.creditCustomerId]) map[s.creditCustomerId] = [];
        map[s.creditCustomerId].push(s);
      }
    });
    return map;
  }, [sales]);

  const getBalance = (cust) => {
    const txns = customerSales[cust.id] || [];
    const totalSales = txns.reduce((a,s) => a + (s.total||0), 0);
    const totalPaid  = (cust.payments||[]).reduce((a,p) => a + (p.amount||0), 0);
    return totalSales - totalPaid;
  };

  // Per-sale payment breakdown
  const getSalePayments = (cust, saleId) => {
    return (cust.payments||[]).filter(p => p.saleId === saleId);
  };

  const getSaleBalance = (cust, sale) => {
    const paid = getSalePayments(cust, sale.id).reduce((a,p) => a + (p.amount||0), 0);
    return (sale.total||0) - paid;
  };

  const isSaleFullyPaid = (cust, sale) => getSaleBalance(cust, sale) <= 0.001;

  const filtered = (customers||[]).filter(c => {
    const q = search.toLowerCase();
    return !q || c.name?.toLowerCase().includes(q) || c.phone?.includes(q);
  });

  const handleSave = async data => {
    if (data.id) await onUpdate(data.id, data);
    else         await onAdd(data);
    setModal(null);
  };

  const handlePayment = async ({ customerId, saleId, amount, method, date, note }) => {
    const cust = customers.find(c => c.id === customerId);
    if (!cust) return;
    const payments = [...(cust.payments||[]), {
      amount: +amount, method, date, note,
      saleId: saleId || null,
      id: Date.now().toString(36)
    }];
    await onUpdate(customerId, { ...cust, payments });
    setPayModal(null);
  };

  // ── Customer detail view ───────────────────────────────────────────────────────
  if (selected) {
    const cust = customers.find(c=>c.id===selected);
    if (!cust) { setSelected(null); return null; }
    const txns = customerSales[cust.id] || [];
    const balance = getBalance(cust);
    const allPayments = cust.payments || [];
    const isFullySettled = balance <= 0.001 && txns.length > 0;

    return (
      <div className="bs-cust-detail">
        <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px',flexWrap:'wrap'}}>
          <button className="bs-sec" onClick={()=>setSelected(null)}>← Back</button>
          <h2 className="bs-h2" style={{margin:0,flex:1}}>{cust.name}</h2>
          {isFullySettled
            ? <span style={{background:'rgba(52,211,153,.15)',border:'1px solid rgba(52,211,153,.4)',color:'#34d399',padding:'6px 14px',borderRadius:'20px',fontSize:'13px',fontWeight:700}}>✅ Fully Paid</span>
            : <button className="bs-topup-btn" onClick={()=>setPayModal({customerId:cust.id})}>+ Record Payment</button>
          }
          <button className="bs-act edit" onClick={()=>setModal({data:{...cust}})}>Edit</button>
        </div>

        {/* Balance summary */}
        <div className="bs-stats6" style={{marginBottom:'16px'}}>
          <div className="bs-sc sc-c"><span className="bs-sc-icon">📊</span><div><p className="bs-sc-val">{txns.length}</p><p className="bs-sc-lbl">Transactions</p></div></div>
          <div className="bs-sc sc-p"><span className="bs-sc-icon">🛒</span><div><p className="bs-sc-val">{fmt(txns.reduce((a,s)=>a+s.total,0))}</p><p className="bs-sc-lbl">Total Billed</p></div></div>
          <div className="bs-sc sc-g"><span className="bs-sc-icon">✅</span><div><p className="bs-sc-val">{fmt(allPayments.reduce((a,p)=>a+p.amount,0))}</p><p className="bs-sc-lbl">Total Paid</p></div></div>
          <div className="bs-sc" style={{background:'#1a2540',border:`1px solid ${balance>0?'#f87171':'#2a3a5c'}`}}>
            <span className="bs-sc-icon">💸</span>
            <div><p className="bs-sc-val" style={{color:balance>0?'#f87171':balance<0?'#34d399':'#94a3b8'}}>{fmt(Math.abs(balance))}</p>
            <p className="bs-sc-lbl">{balance>0?'Outstanding':balance<0?'Overpaid':'Settled'}</p></div>
          </div>
          {cust.creditLimit && <div className="bs-sc sc-o"><span className="bs-sc-icon">📈</span><div><p className="bs-sc-val">{fmt(+cust.creditLimit)}</p><p className="bs-sc-lbl">Credit Limit</p></div></div>}
        </div>

        <div className="bs-dash3">
          {/* Receipt / Sales history with per-receipt payment breakdown */}
          <div className="bs-dcard span2">
            <p className="bs-dcard-ttl">Receipt History & Payments</p>
            {txns.length===0 ? <p className="bs-muted">No purchases yet.</p> : (
              <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                {[...txns].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(sale => {
                  const saleBalance = getSaleBalance(cust, sale);
                  const fullyPaid = isSaleFullyPaid(cust, sale);
                  const receiptPayments = getSalePayments(cust, sale.id);
                  // Also include unallocated payments (no saleId) as part of overall view
                  return (
                    <div key={sale.id} style={{background:'#0d1526',border:`1px solid ${fullyPaid?'rgba(52,211,153,.3)':'rgba(248,113,113,.25)'}`,borderRadius:'10px',padding:'12px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap',marginBottom:'8px'}}>
                        <span style={{fontFamily:'monospace',color:'#38bdf8',fontSize:'13px',fontWeight:700}}>#{sale.receiptId||sale.id?.slice(-6)?.toUpperCase()}</span>
                        <span className="bs-muted" style={{fontSize:'12px'}}>{new Date(sale.date).toLocaleDateString()}</span>
                        <span className="bs-muted" style={{fontSize:'12px'}}>{(sale.items||[]).reduce((a,i)=>a+i.qty,0)} items</span>
                        <span style={{marginLeft:'auto',fontWeight:800,color:'#e2e8f0'}}>{fmt(sale.total||0)}</span>
                        {fullyPaid
                          ? <span style={{background:'rgba(52,211,153,.15)',border:'1px solid rgba(52,211,153,.4)',color:'#34d399',padding:'2px 10px',borderRadius:'12px',fontSize:'11px',fontWeight:700}}>✅ Paid</span>
                          : <span style={{background:'rgba(248,113,113,.12)',border:'1px solid rgba(248,113,113,.3)',color:'#f87171',padding:'2px 10px',borderRadius:'12px',fontSize:'11px',fontWeight:700}}>Owes {fmt(saleBalance)}</span>
                        }
                      </div>

                      {/* Items */}
                      <div style={{fontSize:'11px',color:'#64748b',marginBottom:'8px',paddingBottom:'8px',borderBottom:'1px solid #1e2d45'}}>
                        {(sale.items||[]).map((it,i)=>(
                          <span key={i} style={{marginRight:'12px'}}>{it.name} ×{it.qty}</span>
                        ))}
                      </div>

                      {/* Payments against this receipt */}
                      {receiptPayments.length > 0 && (
                        <div style={{marginBottom:'8px'}}>
                          {receiptPayments.map((p,i)=>(
                            <div key={i} style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'12px',color:'#34d399',marginBottom:'2px'}}>
                              <span>💰</span>
                              <span style={{fontWeight:600}}>{fmt(p.amount)}</span>
                              <span style={{color:'#64748b'}}>{p.method} · {p.date}</span>
                              {p.note&&<span style={{color:'#64748b'}}>· {p.note}</span>}
                            </div>
                          ))}
                        </div>
                      )}

                      {!fullyPaid && (
                        <button
                          className="bs-topup-btn"
                          style={{padding:'4px 12px',fontSize:'11px',marginTop:'4px'}}
                          onClick={()=>setPayModal({customerId:cust.id, saleId:sale.id, saleTotal:sale.total, saleBalance, receiptId:sale.receiptId||sale.id?.slice(-6)?.toUpperCase()})}
                        >
                          + Add Payment to this Receipt
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* All payments summary */}
          <div className="bs-dcard">
            <p className="bs-dcard-ttl">All Payments</p>
            {allPayments.length===0 ? <p className="bs-muted">No payments recorded.</p> : (
              [...allPayments].sort((a,b)=>new Date(b.date)-new Date(a.date)).map((p,i)=>(
                <div key={i} className="bs-sale-row">
                  <div>
                    <p style={{fontSize:'13px',fontWeight:600,color:'#34d399'}}>{fmt(p.amount)}</p>
                    <p className="bs-muted" style={{fontSize:'11px'}}>{p.method} · {p.date}</p>
                    {p.saleId && <p className="bs-muted" style={{fontSize:'11px'}}>Receipt #{txns.find(s=>s.id===p.saleId)?.receiptId || p.saleId?.slice(-6)?.toUpperCase()}</p>}
                    {p.note&&<p className="bs-muted" style={{fontSize:'11px'}}>{p.note}</p>}
                  </div>
                </div>
              ))
            )}
            {!isFullySettled && (
              <button className="bs-topup-btn" style={{width:'100%',marginTop:'8px',textAlign:'center'}} onClick={()=>setPayModal({customerId:cust.id})}>
                + Record General Payment
              </button>
            )}
          </div>
        </div>

        {payModal && (
          <div className="bs-overlay" onClick={e=>e.target===e.currentTarget&&setPayModal(null)}>
            <PaymentForm
              customerId={payModal.customerId}
              saleId={payModal.saleId}
              saleBalance={payModal.saleBalance}
              receiptId={payModal.receiptId}
              fmt={fmt}
              onSave={handlePayment}
              onClose={()=>setPayModal(null)}
            />
          </div>
        )}
        {modal && (
          <div className="bs-overlay" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
            <CustomerForm customer={modal.data} onSave={handleSave} onClose={()=>setModal(null)}/>
          </div>
        )}
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────────
  return (
    <div className="bs-customers">
      <div className="bs-inv-bar">
        <div className="bs-inv-bar-l">
          <h2 className="bs-h2" style={{margin:0}}>🤝 Credit Customers</h2>
          <input className="bs-inp" style={{width:'220px'}} placeholder="🔍 Search…" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <button className="bs-add" onClick={()=>setModal({data:null})}>+ Add Customer</button>
      </div>

      {filtered.length===0&&(
        <div style={{textAlign:'center',padding:'48px'}}>
          <p style={{fontSize:'32px',marginBottom:'8px'}}>🤝</p>
          <p className="bs-muted">No credit customers yet. Add your first customer.</p>
        </div>
      )}

      <div className="bs-sup-grid">
        {filtered.map(cust => {
          const balance = getBalance(cust);
          const txnCount = (customerSales[cust.id]||[]).length;
          const isSettled = balance <= 0.001 && txnCount > 0;
          return (
            <div key={cust.id} className="bs-sup-card" style={{cursor:'pointer'}} onClick={()=>setSelected(cust.id)}>
              <div className="bs-sup-header">
                <div className="bs-sup-avatar" style={{background:isSettled?'rgba(52,211,153,.15)':balance>0?'rgba(248,113,113,.15)':'rgba(52,211,153,.15)',borderColor:isSettled?'rgba(52,211,153,.3)':balance>0?'rgba(248,113,113,.3)':'rgba(52,211,153,.3)',color:isSettled?'#34d399':balance>0?'#f87171':'#34d399'}}>
                  {(cust.name||'?')[0].toUpperCase()}
                </div>
                <div className="bs-sup-info">
                  <p className="bs-sup-name">{cust.name}</p>
                  {cust.phone&&<a href={`tel:${cust.phone}`} className="bs-sup-phone" onClick={e=>e.stopPropagation()}>📞 {cust.phone}</a>}
                  {cust.email&&<p className="bs-sup-email">✉ {cust.email}</p>}
                </div>
                <div style={{textAlign:'right'}}>
                  {isSettled
                    ? <span style={{background:'rgba(52,211,153,.15)',border:'1px solid rgba(52,211,153,.4)',color:'#34d399',padding:'3px 10px',borderRadius:'12px',fontSize:'12px',fontWeight:700}}>✅ Fully Paid</span>
                    : <>
                        <p style={{fontSize:'16px',fontWeight:800,color:balance>0?'#f87171':balance<0?'#34d399':'#64748b'}}>{fmt(Math.abs(balance))}</p>
                        <p className="bs-muted" style={{fontSize:'11px'}}>{balance>0?'owed':balance<0?'credit':'settled'}</p>
                      </>
                  }
                </div>
              </div>
              <div style={{display:'flex',gap:'16px',fontSize:'12px',color:'#64748b',flexWrap:'wrap'}}>
                <span>📦 {txnCount} purchase{txnCount!==1?'s':''}</span>
                {cust.creditLimit&&<span>📈 Limit: {fmt(+cust.creditLimit)}</span>}
                {cust.address&&<span>📍 {cust.address}</span>}
              </div>
              <div style={{display:'flex',gap:'8px'}} onClick={e=>e.stopPropagation()}>
                <button className="bs-act edit" onClick={e=>{e.stopPropagation();setModal({data:{...cust}});}}>Edit</button>
                <button className="bs-act del"  onClick={e=>{e.stopPropagation();setConfirm(cust.id);}}>Del</button>
                {!isSettled && balance > 0 && (
                  <button className="bs-topup-btn" style={{padding:'4px 10px',fontSize:'11px'}} onClick={e=>{e.stopPropagation();setPayModal({customerId:cust.id});}}>+ Payment</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <div className="bs-overlay" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <CustomerForm customer={modal.data} onSave={handleSave} onClose={()=>setModal(null)}/>
        </div>
      )}
      {payModal && (
        <div className="bs-overlay" onClick={e=>e.target===e.currentTarget&&setPayModal(null)}>
          <PaymentForm
            customerId={payModal.customerId}
            saleId={payModal.saleId}
            saleBalance={payModal.saleBalance}
            receiptId={payModal.receiptId}
            fmt={fmt}
            onSave={handlePayment}
            onClose={()=>setPayModal(null)}
          />
        </div>
      )}
      {confirm && (
        <div className="bs-overlay" onClick={e=>e.target===e.currentTarget&&setConfirm(null)}>
          <div className="bs-modal" style={{maxWidth:'360px',padding:'28px'}}>
            <h3 style={{marginBottom:'12px'}}>Remove Customer?</h3>
            <p className="bs-muted" style={{marginBottom:'20px'}}>Their transaction history will still be kept in sales records.</p>
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

function CustomerForm({ customer, onSave, onClose }) {
  const [f, setF] = useState(customer || BLANK);
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  return (
    <div className="bs-modal" style={{maxWidth:'500px'}}>
      <div className="bs-mhdr">
        <h3>{customer?'Edit Customer':'Add Credit Customer'}</h3>
        <button className="bs-mx" onClick={onClose}>✕</button>
      </div>
      <form className="bs-form" onSubmit={e=>{e.preventDefault();onSave(f);}}>
        <div className="bs-frow">
          <div className="bs-fg">
            <label>Full Name *</label>
            <input value={f.name||''} onChange={e=>set('name',e.target.value)} required placeholder="Customer name"/>
          </div>
          <div className="bs-fg">
            <label>Phone</label>
            <input value={f.phone||''} onChange={e=>set('phone',e.target.value)} placeholder="+61 4xx xxx xxx"/>
          </div>
        </div>
        <div className="bs-frow">
          <div className="bs-fg">
            <label>Email</label>
            <input value={f.email||''} onChange={e=>set('email',e.target.value)} placeholder="customer@email.com"/>
          </div>
          <div className="bs-fg">
            <label>Credit Limit</label>
            <input type="number" step="0.01" value={f.creditLimit||''} onChange={e=>set('creditLimit',e.target.value)} placeholder="Optional max credit"/>
          </div>
        </div>
        <div className="bs-fg">
          <label>Address</label>
          <input value={f.address||''} onChange={e=>set('address',e.target.value)} placeholder="Street, City"/>
        </div>
        <div className="bs-fg">
          <label>Notes</label>
          <input value={f.notes||''} onChange={e=>set('notes',e.target.value)} placeholder="Any notes about this customer"/>
        </div>
        <div className="bs-fa">
          <button type="button" className="bs-sec" onClick={onClose}>Cancel</button>
          <button type="submit" className="bs-pri">{customer?'Save Changes':'Add Customer'}</button>
        </div>
      </form>
    </div>
  );
}

function PaymentForm({ customerId, saleId, saleBalance, receiptId, fmt, onSave, onClose }) {
  const today = new Date().toISOString().slice(0,10);
  const [amount, setAmount] = useState(saleBalance ? saleBalance.toFixed(2) : '');
  const [method, setMethod] = useState('Cash');
  const [date,   setDate]   = useState(today);
  const [note,   setNote]   = useState('');
  return (
    <div className="bs-modal" style={{maxWidth:'400px'}}>
      <div className="bs-mhdr">
        <h3>💳 Record Payment{receiptId ? ` — Receipt #${receiptId}` : ''}</h3>
        <button className="bs-mx" onClick={onClose}>✕</button>
      </div>
      <form className="bs-form" onSubmit={e=>{e.preventDefault();onSave({customerId,saleId,amount,method,date,note});}}>
        {saleBalance !== undefined && (
          <div style={{background:'rgba(248,113,113,.08)',border:'1px solid rgba(248,113,113,.2)',borderRadius:'8px',padding:'10px 14px',marginBottom:'12px',fontSize:'13px',color:'#f87171'}}>
            Outstanding on this receipt: <strong>{fmt(saleBalance)}</strong>
          </div>
        )}
        <div className="bs-fg">
          <label>Amount Paid *</label>
          <input type="number" step="0.01" min="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required placeholder="0.00"/>
        </div>
        <div className="bs-frow">
          <div className="bs-fg">
            <label>Payment Method</label>
            <select value={method} onChange={e=>setMethod(e.target.value)}>
              {['Cash','Bank Transfer','Card','EFTPOS','Cheque'].map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="bs-fg">
            <label>Date</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}/>
          </div>
        </div>
        <div className="bs-fg">
          <label>Reference / Note</label>
          <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Receipt #, bank ref…"/>
        </div>
        <div className="bs-fa">
          <button type="button" className="bs-sec" onClick={onClose}>Cancel</button>
          <button type="submit" className="bs-pri">Save Payment</button>
        </div>
      </form>
    </div>
  );
}
