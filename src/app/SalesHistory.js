import React, { useState, useMemo } from 'react';
import { makeFmt } from './constants';

const fmt = (settings) => makeFmt(settings?.currencySymbol || '$');

export default function SalesHistory({ sales = [], products = [], settings, profile }) {
  const sym        = settings?.currencySymbol || '$';
  // eslint-disable-next-line no-unused-vars
  const f          = fmt(settings); // eslint-disable-line
  const [search,   setSearch]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [worker,   setWorker]   = useState('');
  const [selected, setSelected] = useState(null); // receipt detail modal
  // eslint-disable-next-line no-unused-vars
  const [printing, setPrinting] = useState(false); // eslint-disable-line

  // ── Unique workers for filter ──────────────────────────────────────────────
  const workers = useMemo(() => {
    const names = [...new Set(sales.map(s => s.workerName).filter(Boolean))];
    return names.sort();
  }, [sales]);

  // ── Filtered + sorted ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!sales || !Array.isArray(sales)) return [];
    return sales
      .filter(s => {
        const q = search.toLowerCase();
        if (q && !`${s.receiptId} ${s.workerName} ${s.paymentMethod} ${s.customerName||''}`
          .toLowerCase().includes(q)) return false;
        if (worker && s.workerName !== worker) return false;
        if (dateFrom) {
          const d = new Date(s.date); const df = new Date(dateFrom);
          if (d < df) return false;
        }
        if (dateTo) {
          const d = new Date(s.date); const dt = new Date(dateTo);
          dt.setHours(23,59,59,999);
          if (d > dt) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [sales, search, worker, dateFrom, dateTo]);

  // ── Totals for filtered set ────────────────────────────────────────────────
  const totals = useMemo(() => ({
    count:    filtered.length,
    revenue:  filtered.reduce((s, r) => s + (r.total || 0), 0),
    items:    filtered.reduce((s, r) => s + (r.items?.reduce((a, i) => a + i.qty, 0) || 0), 0),
  }), [filtered]);

  // ── Receipt print ──────────────────────────────────────────────────────────
  const printReceipt = (sale) => {
    const win = window.open('', '_blank', 'width=400,height=700');
    const biz = settings?.businessName || 'Unity Book Shop';
    const company = settings?.companyName || '';
    const gst = settings?.gstEnabled ? (sale.total / (1 + (settings.gstRate||10)/100) * ((settings.gstRate||10)/100)) : 0;
    win.document.write(`
      <html><head><title>Receipt ${sale.receiptId}</title>
      <style>
        body { font-family: monospace; font-size: 13px; margin: 20px; max-width: 300px; }
        h2 { text-align:center; margin:0 0 4px; font-size:16px; }
        .sub { text-align:center; font-size:11px; color:#555; margin-bottom:12px; }
        hr { border:none; border-top:1px dashed #aaa; margin:8px 0; }
        table { width:100%; border-collapse:collapse; }
        td { padding:2px 0; vertical-align:top; }
        td:last-child { text-align:right; }
        .total { font-weight:bold; font-size:14px; }
        .footer { text-align:center; font-size:11px; color:#555; margin-top:12px; }
      </style></head><body>
      <h2>${biz}</h2>
      ${company ? `<p class="sub">${company}</p>` : ''}
      <p class="sub">Receipt #${sale.receiptId}</p>
      <p class="sub">${new Date(sale.date).toLocaleString()}</p>
      <p class="sub">Served by: ${sale.workerName || '—'}</p>
      <hr/>
      <table>
        ${(sale.items||[]).map(i => `
          <tr><td>${i.name}<br/><span style="font-size:11px;color:#777">${i.qty} × ${sym}${(i.price||0).toFixed(2)}</span></td>
              <td>${sym}${((i.qty||1)*(i.price||0)).toFixed(2)}</td></tr>
        `).join('')}
      </table>
      <hr/>
      ${settings?.gstEnabled ? `<table>
        <tr><td>Subtotal (excl. GST)</td><td>${sym}${(sale.total - gst).toFixed(2)}</td></tr>
        <tr><td>GST (${settings.gstRate||10}%)</td><td>${sym}${gst.toFixed(2)}</td></tr>
      </table><hr/>` : ''}
      <table>
        <tr class="total"><td>TOTAL</td><td>${sym}${(sale.total||0).toFixed(2)}</td></tr>
        <tr><td>Payment</td><td>${sale.paymentMethod||'—'}</td></tr>
        ${sale.amountTendered ? `<tr><td>Tendered</td><td>${sym}${(sale.amountTendered||0).toFixed(2)}</td></tr>` : ''}
        ${sale.change > 0 ? `<tr><td>Change</td><td>${sym}${(sale.change||0).toFixed(2)}</td></tr>` : ''}
      </table>
      <hr/>
      <p class="footer">${settings?.receiptFooter||'Thank you for shopping with us!'}</p>
      ${settings?.receiptFooter2 ? `<p class="footer">${settings.receiptFooter2}</p>` : ''}
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  const clearFilters = () => { setSearch(''); setDateFrom(''); setDateTo(''); setWorker(''); };

  return (
    <div className="bs-settings" style={{maxWidth:'100%'}}>
      {/* Header */}
      <div className="bs-inv-bar" style={{marginBottom:'20px',flexWrap:'wrap',gap:'12px'}}>
        <h2 className="bs-h2" style={{margin:0}}>🧾 Sales Receipts</h2>
        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
          <span style={{fontSize:'12px',color:'#64748b'}}>{totals.count} receipts · {sym}{totals.revenue.toFixed(2)} total</span>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{display:'flex',gap:'10px',marginBottom:'18px',flexWrap:'wrap'}}>
        {[
          { label:'Total Receipts',  value: totals.count,                  color:'#38bdf8' },
          { label:'Total Revenue',   value: `${sym}${totals.revenue.toFixed(2)}`, color:'#34d399' },
          { label:'Items Sold',      value: totals.items,                  color:'#818cf8' },
        ].map(card => (
          <div key={card.label} style={{
            flex:'1', minWidth:'140px', background:'#111d35',
            border:`1px solid ${card.color}33`, borderRadius:'12px', padding:'12px 16px',
          }}>
            <p style={{fontSize:'11px',color:'#64748b',marginBottom:'4px',textTransform:'uppercase',letterSpacing:'.06em'}}>{card.label}</p>
            <p style={{fontSize:'1.4em',fontWeight:800,color:card.color,fontFamily:"'Syne',sans-serif"}}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        background:'#111d35', border:'1px solid #1e2d47', borderRadius:'12px',
        padding:'14px 16px', marginBottom:'16px',
        display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'flex-end',
      }}>
        <div className="bs-fg" style={{flex:2,minWidth:'180px',margin:0}}>
          <label style={{fontSize:'11px'}}>Search receipt / worker / payment</label>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Receipt #, worker name…" style={{marginTop:'4px'}}/>
        </div>
        <div className="bs-fg" style={{flex:1,minWidth:'140px',margin:0}}>
          <label style={{fontSize:'11px'}}>From date</label>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{marginTop:'4px'}}/>
        </div>
        <div className="bs-fg" style={{flex:1,minWidth:'140px',margin:0}}>
          <label style={{fontSize:'11px'}}>To date</label>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{marginTop:'4px'}}/>
        </div>
        <div className="bs-fg" style={{flex:1,minWidth:'140px',margin:0}}>
          <label style={{fontSize:'11px'}}>Worker</label>
          <select value={worker} onChange={e=>setWorker(e.target.value)} style={{marginTop:'4px'}}>
            <option value="">All workers</option>
            {workers.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        {(search||dateFrom||dateTo||worker) && (
          <button className="bs-sec" onClick={clearFilters} style={{padding:'8px 14px',fontSize:'12px',whiteSpace:'nowrap'}}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{textAlign:'center',padding:'48px',color:'#475569'}}>
          <div style={{fontSize:'40px',marginBottom:'10px'}}>🧾</div>
          <p style={{fontWeight:600,marginBottom:'4px'}}>No receipts found</p>
          <p style={{fontSize:'12px'}}>Try adjusting your filters</p>
        </div>
      ) : (
        <div style={{overflowX:'auto'}}>
          <table className="bs-tbl">
            <thead>
              <tr>
                <th>Receipt #</th>
                <th>Date & Time</th>
                <th>Worker</th>
                <th>Items</th>
                <th>Payment</th>
                <th style={{textAlign:'right'}}>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(sale => (
                <tr key={sale.id} style={{cursor:'pointer'}} onClick={()=>setSelected(sale)}>
                  <td><span className="bs-isbn">{sale.receiptId || '—'}</span></td>
                  <td>
                    <span style={{display:'block'}}>{new Date(sale.date).toLocaleDateString()}</span>
                    <span style={{fontSize:'11px',color:'#64748b'}}>{new Date(sale.date).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
                  </td>
                  <td>{sale.workerName || '—'}</td>
                  <td>
                    <span style={{fontWeight:600}}>{sale.items?.reduce((a,i)=>a+i.qty,0)||0}</span>
                    <span className="bs-muted" style={{fontSize:'11px',marginLeft:'4px'}}>item{sale.items?.reduce((a,i)=>a+i.qty,0)!==1?'s':''}</span>
                  </td>
                  <td>
                    <span style={{
                      fontSize:'11px',fontWeight:600,padding:'3px 10px',borderRadius:'10px',
                      background: sale.paymentMethod==='Cash'?'rgba(52,211,153,.1)':'rgba(129,140,248,.1)',
                      color: sale.paymentMethod==='Cash'?'#34d399':'#818cf8',
                      border: `1px solid ${sale.paymentMethod==='Cash'?'rgba(52,211,153,.3)':'rgba(129,140,248,.3)'}`,
                    }}>
                      {sale.paymentMethod || '—'}
                    </span>
                  </td>
                  <td style={{textAlign:'right',fontWeight:700,color:'#f0f4ff'}}>{sym}{(sale.total||0).toFixed(2)}</td>
                  <td>
                    <button className="bs-act edit" style={{padding:'5px 10px',fontSize:'11px'}}
                      onClick={e=>{e.stopPropagation();setSelected(sale);}}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Receipt Detail Modal ── */}
      {selected && (
        <div className="bs-overlay" onClick={e=>e.target===e.currentTarget&&setSelected(null)}>
          <div className="bs-modal" style={{maxWidth:'480px'}}>
            <div className="bs-mhdr">
              <h3>🧾 Receipt #{selected.receiptId}</h3>
              <button className="bs-mx" onClick={()=>setSelected(null)}>✕</button>
            </div>

            <div style={{padding:'0 24px 20px'}}>
              {/* Meta */}
              <div style={{
                background:'#0a1120', border:'1px solid #1e2d47', borderRadius:'10px',
                padding:'12px 16px', marginBottom:'16px',
                display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px',
              }}>
                {[
                  ['Date',    new Date(selected.date).toLocaleString()],
                  ['Worker',  selected.workerName || '—'],
                  ['Payment', selected.paymentMethod || '—'],
                  ['Customer',selected.customerName || 'Walk-in'],
                  ...(selected.amountTendered ? [['Tendered', `${sym}${(selected.amountTendered||0).toFixed(2)}`]] : []),
                  ...(selected.change > 0 ? [['Change', `${sym}${(selected.change||0).toFixed(2)}`]] : []),
                ].map(([label, val]) => (
                  <div key={label}>
                    <p style={{fontSize:'10px',color:'#475569',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'2px'}}>{label}</p>
                    <p style={{fontSize:'13px',color:'#e2e8f0',fontWeight:500}}>{val}</p>
                  </div>
                ))}
              </div>

              {/* Items */}
              <p style={{fontSize:'11px',color:'#64748b',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'8px'}}>
                Items ({selected.items?.reduce((a,i)=>a+i.qty,0)||0})
              </p>
              <div style={{border:'1px solid #1e2d47',borderRadius:'10px',overflow:'hidden',marginBottom:'16px'}}>
                <table className="bs-tbl" style={{margin:0}}>
                  <thead>
                    <tr><th>Product</th><th style={{textAlign:'center'}}>Qty</th><th style={{textAlign:'right'}}>Price</th><th style={{textAlign:'right'}}>Line</th></tr>
                  </thead>
                  <tbody>
                    {(selected.items||[]).map((item, i) => (
                      <tr key={i}>
                        <td>
                          <p style={{fontWeight:600,marginBottom:'1px'}}>{item.name}</p>
                          {item.productCode && <p style={{fontSize:'10px',color:'#475569',fontFamily:'monospace'}}>{item.productCode}</p>}
                        </td>
                        <td style={{textAlign:'center'}}>{item.qty}</td>
                        <td style={{textAlign:'right'}}>{sym}{(item.price||0).toFixed(2)}</td>
                        <td style={{textAlign:'right',fontWeight:600}}>{sym}{((item.qty||1)*(item.price||0)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div style={{background:'#0a1120',border:'1px solid #1e2d47',borderRadius:'10px',padding:'12px 16px',marginBottom:'20px'}}>
                {settings?.gstEnabled && (() => {
                  const rate = settings.gstRate || 10;
                  const gst  = (selected.total||0) / (1 + rate/100) * (rate/100);
                  const excl = (selected.total||0) - gst;
                  return (<>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
                      <span style={{fontSize:'12px',color:'#64748b'}}>Subtotal (excl. GST)</span>
                      <span style={{fontSize:'12px',color:'#94a3b8'}}>{sym}{excl.toFixed(2)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:'8px'}}>
                      <span style={{fontSize:'12px',color:'#64748b'}}>GST ({rate}%)</span>
                      <span style={{fontSize:'12px',color:'#94a3b8'}}>{sym}{gst.toFixed(2)}</span>
                    </div>
                    <div style={{borderTop:'1px solid #1e2d47',marginBottom:'8px'}}/>
                  </>);
                })()}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontWeight:700,fontSize:'14px',color:'#f0f4ff'}}>TOTAL</span>
                  <span style={{fontWeight:800,fontSize:'18px',color:'#34d399',fontFamily:"'Syne',sans-serif"}}>
                    {sym}{(selected.total||0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}>
                <button className="bs-sec" onClick={()=>setSelected(null)}>Close</button>
                <button className="bs-pri" onClick={()=>printReceipt(selected)}>
                  🖨️ Print Receipt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
