import React, { useState, useMemo } from 'react';
import { makeFmt } from './constants';

export default function Reports({ sales, products, workers, settings }) {
  const fmt = makeFmt(settings?.currencySymbol || '$');
  const sym = settings?.currencySymbol || '$';
  const gstLabel = settings?.gstEnabled !== false ? `GST (${settings?.gstRate ?? 10}%)` : 'Tax';
  const [range, setRange] = useState('today');
  const [worker, setWorker] = useState('all');

  const filtered = useMemo(() => {
    if (!sales || !Array.isArray(sales)) return [];
    const now = new Date();
    let from;
    if (range==='today')   from = new Date(now.toDateString());
    if (range==='week')    { from = new Date(now); from.setDate(now.getDate()-7); }
    if (range==='month')   { from = new Date(now.getFullYear(), now.getMonth(), 1); }
    if (range==='all')     from = new Date(0);

    return sales.filter(s => {
      const d = new Date(s.date);
      const inRange  = d >= from;
      const inWorker = worker==='all' || s.workerId===worker || s.workerName===worker;
      return inRange && inWorker;
    });
  }, [sales, range, worker]);

  const totals = useMemo(() => {
    const revenue = filtered.reduce((a,s)=>a+s.total,0);
    const profit  = filtered.reduce((a,s)=>a+(s.profit||0),0);
    const tax     = filtered.reduce((a,s)=>a+s.tax,0);
    const count   = filtered.length;
    const avg     = count ? revenue/count : 0;

    const byPayment = {};
    filtered.forEach(s=>{ byPayment[s.payment]=(byPayment[s.payment]||0)+s.total; });

    const byProduct = {};
    filtered.forEach(s=>s.items?.forEach(it=>{
      if (!byProduct[it.name]) byProduct[it.name]={qty:0,rev:0};
      byProduct[it.name].qty+=it.qty;
      byProduct[it.name].rev+=it.price*it.qty;
    }));

    const byWorker = {};
    filtered.forEach(s=>{
      const n=s.workerName||'Unknown';
      if(!byWorker[n]) byWorker[n]={count:0,rev:0,profit:0};
      byWorker[n].count++;
      byWorker[n].rev+=s.total;
      byWorker[n].profit+=(s.profit||0);
    });

    return { revenue, profit, tax, count, avg, byPayment, byProduct, byWorker };
  }, [filtered]);

  const topProducts = Object.entries(totals.byProduct).sort((a,b)=>b[1].rev-a[1].rev).slice(0,10);
  const allWorkers  = [...new Set(sales.map(s=>s.workerName).filter(Boolean))];

  const rangeLabel = { today:'Today', week:'Last 7 Days', month:'This Month', all:'All Time' }[range];
  const workerLabel = worker === 'all' ? 'All Workers' : worker;
  const fmtN = n => Number(n||0).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2});

  const exportCSV = () => {
    const rows = [['Receipt ID','Date','Worker','Items','Subtotal','Discount','Tax','Total','Payment']];
    filtered.forEach(s=>rows.push([
      s.id, new Date(s.date).toLocaleString(), s.workerName||'',
      (s.items||[]).map(i=>`${i.name}x${i.qty}`).join(';'),
      s.subtotal, s.discount||0, s.tax, s.total, s.payment
    ]));
    const csv = rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
    a.download = `sales_${range}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const exportPDF = () => {
    const biz = settings?.businessName || 'Unity Book Shop';
    const now = new Date().toLocaleString();
    const margin = totals.revenue > 0 ? (totals.profit / totals.revenue * 100).toFixed(1) : '0.0';

    // eslint-disable-next-line no-unused-vars
    const paymentRows = Object.entries(totals.byPayment)
      .map(([m,a]) => `<tr><td>${m}</td><td class="r">${sym} ${fmtN(a)}</td><td class="r">${totals.revenue>0?(a/totals.revenue*100).toFixed(1):0}%</td></tr>`)
      .join('');

    const productRows = topProducts
      .map(([name,v],i) => `<tr><td class="c">${i+1}</td><td>${name}</td><td class="r">${v.qty}</td><td class="r">${sym} ${fmtN(v.rev)}</td></tr>`)
      .join('');

    const workerRows = Object.entries(totals.byWorker)
      .sort((a,b)=>b[1].rev-a[1].rev)
      .map(([name,v]) => `<tr><td>${name}</td><td class="r">${v.count}</td><td class="r">${sym} ${fmtN(v.rev)}</td><td class="r">${sym} ${fmtN(v.profit)}</td><td class="r">${sym} ${fmtN(v.count?v.rev/v.count:0)}</td></tr>`)
      .join('');

    const txnRows = filtered.slice(0, 200)
      .map(s => `<tr>
        <td class="mono">#${(s.receiptId||s.id||'').toString().slice(-6).toUpperCase()}</td>
        <td>${new Date(s.date).toLocaleString()}</td>
        <td>${s.workerName||'—'}</td>
        <td class="r">${(s.items||[]).reduce((a,i)=>a+i.qty,0)}</td>
        <td class="r">${sym} ${fmtN(s.subtotal)}</td>
        <td class="r">${s.discount>0?'-'+sym+' '+fmtN(s.discount):'—'}</td>
        <td class="r">${sym} ${fmtN(s.tax)}</td>
        <td class="r bold">${sym} ${fmtN(s.total)}</td>
        <td>${s.payment}</td>
      </tr>`)
      .join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Sales Report — ${biz}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a2e;background:#fff;padding:24px}
  h1{font-size:22px;color:#1e3a5f;margin-bottom:2px}
  h2{font-size:13px;color:#1e3a5f;margin:18px 0 8px;padding-bottom:4px;border-bottom:2px solid #1e3a5f}
  .meta{color:#555;font-size:11px;margin-bottom:16px}
  .stats{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:20px}
  .stat{background:#f0f4ff;border-radius:6px;padding:10px 12px;text-align:center}
  .stat-val{font-size:15px;font-weight:700;color:#1e3a5f}
  .stat-lbl{font-size:9px;color:#666;margin-top:2px;text-transform:uppercase;letter-spacing:.05em}
  .cols2{display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;margin-top:6px;font-size:10px}
  th{background:#1e3a5f;color:#fff;padding:5px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.06em}
  td{padding:4px 8px;border-bottom:1px solid #e8ecf5}
  tr:last-child td{border-bottom:none}
  tr:nth-child(even){background:#f7f9ff}
  .r{text-align:right} .c{text-align:center} .bold{font-weight:700} .mono{font-family:monospace}
  .bar-wrap{background:#e8ecf5;border-radius:3px;height:8px;overflow:hidden;margin:2px 0}
  .bar{background:#1e3a5f;height:8px;border-radius:3px}
  .pay-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #e8ecf5;font-size:10px}
  .pay-row:last-child{border-bottom:none}
  .pay-label{width:90px;font-weight:600}
  .pay-bar-wrap{flex:1;background:#e8ecf5;border-radius:3px;height:8px}
  .pay-bar{background:#1e3a5f;height:8px;border-radius:3px}
  .pay-val{width:80px;text-align:right;font-weight:600;color:#1e3a5f}
  .section{background:#fff;border:1px solid #d0d8ef;border-radius:6px;padding:14px;margin-bottom:14px}
  .footer{text-align:center;color:#999;font-size:9px;margin-top:20px;padding-top:12px;border-top:1px solid #e8ecf5}
  .tag{display:inline-block;background:#e8ecf5;border-radius:3px;padding:1px 6px;font-size:9px;font-weight:600}
  .note{font-size:9px;color:#888;margin-top:6px}
  @media print{body{padding:12px}@page{margin:1cm;size:A4}}
</style></head><body>

<h1>📊 Sales Report</h1>
<div class="meta">
  <strong>${biz}</strong> &nbsp;·&nbsp; Period: <strong>${rangeLabel}</strong>
  ${worker!=='all'?` &nbsp;·&nbsp; Worker: <strong>${workerLabel}</strong>`:''}
  &nbsp;·&nbsp; Generated: ${now}
  &nbsp;·&nbsp; ${filtered.length} transaction${filtered.length!==1?'s':''}
</div>

<div class="stats">
  <div class="stat"><div class="stat-val">${sym} ${fmtN(totals.revenue)}</div><div class="stat-lbl">Revenue</div></div>
  <div class="stat"><div class="stat-val">${sym} ${fmtN(totals.profit)}</div><div class="stat-lbl">Gross Profit</div></div>
  <div class="stat"><div class="stat-val">${sym} ${fmtN(totals.tax)}</div><div class="stat-lbl">${gstLabel}</div></div>
  <div class="stat"><div class="stat-val">${totals.count}</div><div class="stat-lbl">Transactions</div></div>
  <div class="stat"><div class="stat-val">${sym} ${fmtN(totals.avg)}</div><div class="stat-lbl">Avg Sale</div></div>
  <div class="stat"><div class="stat-val">${margin}%</div><div class="stat-lbl">Margin</div></div>
</div>

<div class="cols2">
  <div class="section">
    <h2>Top Selling Products</h2>
    ${topProducts.length===0?'<p style="color:#888;padding:12px 0">No sales in this period.</p>':`
    <table>
      <thead><tr><th>#</th><th>Product</th><th class="r">Units Sold</th><th class="r">Revenue</th></tr></thead>
      <tbody>${productRows}</tbody>
    </table>`}
  </div>
  <div class="section">
    <h2>Payment Methods</h2>
    ${Object.entries(totals.byPayment).length===0?'<p style="color:#888;padding:12px 0">No data.</p>':
      Object.entries(totals.byPayment).map(([m,a])=>`
      <div class="pay-row">
        <span class="pay-label">${m}</span>
        <div class="pay-bar-wrap"><div class="pay-bar" style="width:${totals.revenue>0?(a/totals.revenue*100).toFixed(1):0}%"></div></div>
        <span class="pay-val">${sym} ${fmtN(a)}</span>
      </div>`).join('')}
  </div>
</div>

<div class="section">
  <h2>Worker Accountability</h2>
  ${Object.keys(totals.byWorker).length===0?'<p style="color:#888;padding:12px 0">No sales in this period.</p>':`
  <table>
    <thead><tr><th>Worker</th><th class="r">Transactions</th><th class="r">Revenue</th><th class="r">Gross Profit</th><th class="r">Avg Sale</th></tr></thead>
    <tbody>${workerRows}</tbody>
  </table>`}
</div>

<div class="section">
  <h2>Transaction Log</h2>
  ${filtered.length>200?`<p class="note">⚠ Showing first 200 of ${filtered.length} transactions. Export CSV for full data.</p>`:''}
  ${filtered.length===0?'<p style="color:#888;padding:12px 0">No transactions in this period.</p>':`
  <table>
    <thead><tr><th>Receipt</th><th>Date &amp; Time</th><th>Worker</th><th class="r">Items</th><th class="r">Subtotal</th><th class="r">Discount</th><th class="r">${gstLabel}</th><th class="r">Total</th><th>Payment</th></tr></thead>
    <tbody>${txnRows}</tbody>
  </table>`}
</div>

<div class="footer">${biz} · Sales Report · ${rangeLabel} · Printed ${now}</div>

<script>window.onload=()=>{window.print();}</script>
</body></html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(html);
    win.document.close();
  };

  return (
    <div className="bs-reports">
      <div className="bs-inv-bar">
        <h2 className="bs-h2" style={{margin:0}}>Sales Reports</h2>
        <div style={{display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'center'}}>
          <select className="bs-sel" value={range} onChange={e=>setRange(e.target.value)}>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">This Month</option>
            <option value="all">All Time</option>
          </select>
          <select className="bs-sel" value={worker} onChange={e=>setWorker(e.target.value)}>
            <option value="all">All Workers</option>
            {allWorkers.map(w=><option key={w} value={w}>{w}</option>)}
          </select>
          <button className="bs-add" onClick={exportCSV}>⬇ Export CSV</button>
          <button className="bs-add" style={{background:'#dc2626'}} onClick={exportPDF}>📄 Export PDF</button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="bs-stats6" style={{marginBottom:'20px'}}>
        <div className="bs-sc sc-c"><span className="bs-sc-icon">💰</span><div><p className="bs-sc-val">{fmt(totals.revenue)}</p><p className="bs-sc-lbl">Revenue</p></div></div>
        <div className="bs-sc sc-g"><span className="bs-sc-icon">💵</span><div><p className="bs-sc-val">{fmt(totals.profit)}</p><p className="bs-sc-lbl">Gross Profit</p></div></div>
        <div className="bs-sc sc-p"><span className="bs-sc-icon">🧾</span><div><p className="bs-sc-val">{fmt(totals.tax)}</p><p className="bs-sc-lbl">GST Collected</p></div></div>
        <div className="bs-sc sc-b"><span className="bs-sc-icon">🛒</span><div><p className="bs-sc-val">{totals.count}</p><p className="bs-sc-lbl">Transactions</p></div></div>
        <div className="bs-sc sc-o"><span className="bs-sc-icon">📊</span><div><p className="bs-sc-val">{fmt(totals.avg)}</p><p className="bs-sc-lbl">Avg Sale</p></div></div>
        <div className="bs-sc sc-r"><span className="bs-sc-icon">📈</span><div><p className="bs-sc-val">{totals.revenue>0?(totals.profit/totals.revenue*100).toFixed(0):0}%</p><p className="bs-sc-lbl">Margin</p></div></div>
      </div>

      <div className="bs-dash3">
        {/* Top products */}
        <div className="bs-dcard span2">
          <p className="bs-dcard-ttl">Top Selling Products</p>
          {topProducts.length===0 && <p className="bs-muted">No sales in this period.</p>}
          <table className="bs-tbl" style={{marginTop:'8px'}}>
            <thead><tr><th>#</th><th>Product</th><th>Units Sold</th><th>Revenue</th></tr></thead>
            <tbody>
              {topProducts.map(([name,v],i)=>(
                <tr key={name}>
                  <td className="bs-muted">{i+1}</td>
                  <td>{name}</td>
                  <td>{v.qty}</td>
                  <td className="bs-green">{fmt(v.rev)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Payment breakdown */}
        <div className="bs-dcard">
          <p className="bs-dcard-ttl">Payment Methods</p>
          {Object.entries(totals.byPayment).map(([method,amt])=>(
            <div key={method} className="bs-cat-row">
              <span>{method}</span>
              <div className="bs-cat-bar-wrap">
                <div className="bs-cat-bar" style={{width:`${(amt/Math.max(totals.revenue,1)*100)}%`,background:'#38bdf8'}}/>
              </div>
              <span className="bs-cat-val">{fmt(amt)}</span>
            </div>
          ))}
          {Object.keys(totals.byPayment).length===0 && <p className="bs-muted">No data.</p>}
        </div>
      </div>

      {/* Worker accountability */}
      <div className="bs-dcard" style={{marginTop:'16px'}}>
        <p className="bs-dcard-ttl">Worker Accountability</p>
        <table className="bs-tbl" style={{marginTop:'8px'}}>
          <thead><tr><th>Worker</th><th>Transactions</th><th>Revenue</th><th>Gross Profit</th><th>Avg Sale</th></tr></thead>
          <tbody>
            {Object.entries(totals.byWorker).sort((a,b)=>b[1].rev-a[1].rev).map(([name,v])=>(
              <tr key={name}>
                <td><div style={{display:'flex',alignItems:'center',gap:'8px'}}><div className="bs-worker-avatar" style={{width:'28px',height:'28px',fontSize:'12px'}}>{name[0]?.toUpperCase()}</div>{name}</div></td>
                <td>{v.count}</td>
                <td className="bs-green">{fmt(v.rev)}</td>
                <td style={{color:'#818cf8'}}>{fmt(v.profit)}</td>
                <td>{fmt(v.count?v.rev/v.count:0)}</td>
              </tr>
            ))}
            {Object.keys(totals.byWorker).length===0 && <tr><td colSpan="5" className="bs-muted" style={{padding:'20px',textAlign:'center'}}>No sales in this period.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Transaction log */}
      <div className="bs-dcard" style={{marginTop:'16px'}}>
        <p className="bs-dcard-ttl">Transaction Log ({filtered.length})</p>
        <div className="bs-tbl-wrap" style={{maxHeight:'400px',overflowY:'auto'}}>
          <table className="bs-tbl">
            <thead><tr><th>Receipt ID</th><th>Date & Time</th><th>Worker</th><th>Items</th><th>Subtotal</th><th>Disc</th><th>{gstLabel}</th><th>Total</th><th>Payment</th></tr></thead>
            <tbody>
              {filtered.map(s=>(
                <tr key={s.id}>
                  <td className="bs-mono">#{(s.id||'').slice(-6).toUpperCase()}</td>
                  <td className="bs-muted" style={{fontSize:'12px',whiteSpace:'nowrap'}}>{new Date(s.date).toLocaleString()}</td>
                  <td>{s.workerName||'—'}</td>
                  <td className="bs-muted">{(s.items||[]).reduce((a,i)=>a+i.qty,0)} items</td>
                  <td>{fmt(s.subtotal)}</td>
                  <td>{s.discount>0?'-'+fmt(s.discount):'—'}</td>
                  <td>{fmt(s.tax)}</td>
                  <td className="bs-green">{fmt(s.total)}</td>
                  <td><span className="bs-pbadge">{s.payment}</span></td>
                </tr>
              ))}
              {filtered.length===0 && <tr><td colSpan="9" className="bs-muted" style={{padding:'24px',textAlign:'center'}}>No transactions in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
