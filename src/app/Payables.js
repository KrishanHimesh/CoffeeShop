import React, { useMemo } from 'react';
import { makeFmt } from './constants';

export default function Payables({ stockReceipts, suppliers, onViewReceipt, settings }) {
  const fmt = makeFmt(settings?.currencySymbol || '$');
  const today = new Date();

  const outstanding = useMemo(() => {
    return (stockReceipts||[])
      .filter(r => r.payment?.status !== 'paid')
      .map(r => {
        const paid = r.payment?.amount || 0;
        const owed = (r.totalCost||0) - paid;
        const due  = r.dueDate ? new Date(r.dueDate) : null;
        const overdue = due && due < today;
        const daysLeft = due ? Math.ceil((due-today)/(1000*60*60*24)) : null;
        const sup = suppliers.find(s=>s.id===r.supplierId);
        return { ...r, paid, owed, due, overdue, daysLeft, sup };
      })
      .sort((a,b)=>{
        if(a.overdue&&!b.overdue) return -1;
        if(!a.overdue&&b.overdue) return 1;
        if(a.due&&b.due) return a.due-b.due;
        return 0;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockReceipts, suppliers]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalOwed = outstanding.reduce((s,r)=>s+r.owed,0);
  const overdueAmt = outstanding.filter(r=>r.overdue).reduce((s,r)=>s+r.owed,0);
  const dueSoon   = outstanding.filter(r=>!r.overdue&&r.daysLeft!==null&&r.daysLeft<=7).reduce((s,r)=>s+r.owed,0);

  // Per-supplier summary
  const bySupplier = useMemo(() => {
    const map = {};
    outstanding.forEach(r => {
      const key = r.supplierName||'Unknown';
      if(!map[key]) map[key] = { name:key, owed:0, count:0, sup:r.sup };
      map[key].owed += r.owed;
      map[key].count++;
    });
    return Object.values(map).sort((a,b)=>b.owed-a.owed);
  }, [outstanding]);

  return (
    <div className="bs-payables">
      <h2 className="bs-h2">💸 Payables & Outstanding Invoices</h2>

      {/* Summary cards */}
      <div className="bs-stats6" style={{marginBottom:'20px'}}>
        <div className="bs-sc sc-r"><span className="bs-sc-icon">⚠️</span><div><p className="bs-sc-val">{fmt(overdueAmt)}</p><p className="bs-sc-lbl">Overdue</p></div></div>
        <div className="bs-sc sc-o"><span className="bs-sc-icon">⏰</span><div><p className="bs-sc-val">{fmt(dueSoon)}</p><p className="bs-sc-lbl">Due ≤ 7 days</p></div></div>
        <div className="bs-sc sc-c"><span className="bs-sc-icon">💸</span><div><p className="bs-sc-val">{fmt(totalOwed)}</p><p className="bs-sc-lbl">Total Outstanding</p></div></div>
        <div className="bs-sc sc-b"><span className="bs-sc-icon">📄</span><div><p className="bs-sc-val">{outstanding.length}</p><p className="bs-sc-lbl">Open Invoices</p></div></div>
      </div>

      {/* By Supplier */}
      {bySupplier.length>0&&(
        <div className="bs-dcard" style={{marginBottom:'16px'}}>
          <p className="bs-dcard-ttl">By Supplier</p>
          <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            {bySupplier.map((s,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:'12px'}}>
                <div className="bs-sup-avatar" style={{width:32,height:32,fontSize:'13px'}}>{(s.name||'?')[0].toUpperCase()}</div>
                <div style={{flex:1}}>
                  <p style={{fontSize:'13px',fontWeight:600}}>{s.name}</p>
                  <p className="bs-muted" style={{fontSize:'11px'}}>{s.count} invoice{s.count!==1?'s':''}</p>
                </div>
                {s.sup?.phone&&<a href={`tel:${s.sup.phone}`} className="bs-sup-call-btn" style={{fontSize:'11px'}}>📞 Call</a>}
                <strong style={{color:'#fb923c'}}>{fmt(s.owed)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoice list */}
      {outstanding.length===0 ? (
        <div style={{textAlign:'center',padding:'48px'}}>
          <p style={{fontSize:'32px',marginBottom:'8px'}}>✅</p>
          <p className="bs-muted">No outstanding payables. All invoices are paid!</p>
        </div>
      ) : (
        <div className="bs-tbl-wrap">
          <table className="bs-tbl">
            <thead>
              <tr><th>Status</th><th>Supplier</th><th>Invoice No.</th><th>Received</th><th>Due Date</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Action</th></tr>
            </thead>
            <tbody>
              {outstanding.map(r=>(
                <tr key={r.id} className={r.overdue?'tr-out':r.daysLeft!==null&&r.daysLeft<=7?'tr-low':''}>
                  <td>
                    {r.overdue
                      ? <span style={{color:'#f87171',fontWeight:700,fontSize:'12px'}}>🔴 OVERDUE</span>
                      : r.payment?.status==='partial'
                        ? <span style={{color:'#fb923c',fontWeight:600,fontSize:'12px'}}>🔶 Partial</span>
                        : <span style={{color:'#94a3b8',fontSize:'12px'}}>⏳ Unpaid</span>
                    }
                  </td>
                  <td>{r.supplierName||'—'}</td>
                  <td className="bs-isbn">{r.invoiceNo||'—'}</td>
                  <td className="bs-muted" style={{fontSize:'12px'}}>{r.date?.slice(0,10)||'—'}</td>
                  <td>
                    {r.dueDate
                      ? <span style={{color:r.overdue?'#f87171':r.daysLeft<=7?'#fb923c':'#94a3b8',fontWeight:r.overdue?700:400}}>
                          {r.dueDate} {r.daysLeft!==null&&(r.overdue?`(${-r.daysLeft}d overdue)`:`(${r.daysLeft}d)`)}
                        </span>
                      : <span className="bs-muted">—</span>
                    }
                  </td>
                  <td><strong>{fmt(r.totalCost)}</strong></td>
                  <td style={{color:'#34d399'}}>{r.paid>0?fmt(r.paid):'—'}</td>
                  <td><strong style={{color:'#fb923c'}}>{fmt(r.owed)}</strong></td>
                  <td>
                    <div style={{display:'flex',gap:'6px'}}>
                      {r.sup?.phone&&<a href={`tel:${r.sup.phone}`} className="bs-sup-call-btn" style={{fontSize:'11px'}}>📞</a>}
                      {onViewReceipt&&<button className="bs-act edit" onClick={()=>onViewReceipt(r)}>View</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
