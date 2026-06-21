import React, { useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// KitchenDisplay.js — chef-facing screen
// Shows active orders (new/preparing) in three columns. Chef taps a ticket to
// advance it: New -> Start Preparing -> Mark Ready. Ready tickets disappear
// from here once marked (they then live in the Orders Ready / pickup screen).
// ─────────────────────────────────────────────────────────────────────────────

export default function KitchenDisplay({ kitchenOrders, onUpdateStatus, settings }) {
  const [now, setNow] = useState(Date.now());

  // Tick every 15s so elapsed-time badges stay fresh without needing a full data refresh
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const active = (kitchenOrders || []).filter(o => o.status === 'new' || o.status === 'preparing');
  const newOrders        = active.filter(o => o.status === 'new');
  const preparingOrders  = active.filter(o => o.status === 'preparing');

  const elapsedMin = order => {
    const start = order.createdAt?.toDate?.() || new Date(order.date);
    return Math.max(0, Math.round((now - start.getTime()) / 60000));
  };

  return (
    <div className="bs-kitchen">
      <div className="bs-dash-header">
        <div>
          <h2 className="bs-h2">👨‍🍳 Kitchen Display</h2>
          <p className="bs-muted">{active.length} active order{active.length!==1?'s':''}</p>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginTop:'16px'}}>
        {/* New orders column */}
        <KitchenColumn
          title="🆕 New Orders"
          orders={newOrders}
          emptyMsg="No new orders — all caught up!"
          elapsedMin={elapsedMin}
          actionLabel="▶ Start Preparing"
          actionColor="var(--bs-accent, #38bdf8)"
          onAction={o => onUpdateStatus(o.id, 'preparing')}
        />

        {/* Preparing column */}
        <KitchenColumn
          title="🔥 Preparing"
          orders={preparingOrders}
          emptyMsg="Nothing in progress."
          elapsedMin={elapsedMin}
          actionLabel="✅ Mark Ready"
          actionColor="var(--bs-success, #34d399)"
          onAction={o => onUpdateStatus(o.id, 'ready')}
          urgent
        />
      </div>
    </div>
  );
}

function KitchenColumn({ title, orders, emptyMsg, elapsedMin, actionLabel, actionColor, onAction, urgent }) {
  return (
    <div className="bs-dcard" style={{minHeight:'400px'}}>
      <p className="bs-dcard-ttl">{title} <span style={{color:'var(--bs-text3, #64748b)',fontWeight:400}}>({orders.length})</span></p>
      {orders.length === 0 && <p className="bs-muted" style={{padding:'24px 0',textAlign:'center'}}>{emptyMsg}</p>}
      <div style={{display:'flex',flexDirection:'column',gap:'10px',marginTop:'8px'}}>
        {orders.map(o => {
          const mins = elapsedMin(o);
          const isLate = urgent ? mins >= 8 : mins >= 5;
          return (
            <div key={o.id} style={{
              background:'var(--bs-bg2, #1a2540)',
              border: isLate ? '1px solid var(--bs-danger, #f87171)' : '1px solid var(--bs-border, #2a3a5c)',
              borderRadius:'var(--bs-radius, 10px)',
              padding:'12px',
            }}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'8px'}}>
                <div>
                  <p style={{fontWeight:700,fontSize:'13px',color:'var(--bs-accent, #38bdf8)',fontFamily:"'Space Mono',monospace"}}>
                    #{(o.receiptId||o.id||'').toString().slice(-5).toUpperCase()}
                  </p>
                  <p className="bs-muted" style={{fontSize:'11px'}}>{o.orderType==='Dine-in' ? '🍽️ Dine-in' : '🥤 Takeaway'} · {o.workerName}</p>
                </div>
                <span style={{
                  fontSize:'11px', fontWeight:700, padding:'2px 8px', borderRadius:'100px',
                  background: isLate ? 'rgba(248,113,113,.15)' : 'rgba(148,163,184,.1)',
                  color: isLate ? 'var(--bs-danger, #f87171)' : 'var(--bs-text3, #94a3b8)',
                }}>
                  {mins}m
                </span>
              </div>

              <div style={{marginBottom:'10px'}}>
                {o.items.map((it, i) => (
                  <div key={i} style={{fontSize:'13px',padding:'3px 0',borderTop: i>0 ? '1px solid var(--bs-border, #2a3a5c)' : 'none'}}>
                    <strong>{it.qty}×</strong> {it.name}
                    {it.modifiers?.length > 0 && (
                      <span style={{display:'block',fontSize:'11px',color:'var(--bs-text3, #94a3b8)',marginLeft:'16px'}}>
                        {it.modifiers.map(m=>m.optionName).join(', ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={()=>onAction(o)}
                style={{
                  width:'100%', padding:'9px', borderRadius:'8px', border:'none',
                  background:actionColor, color:'#0d1526', fontWeight:700, fontSize:'13px', cursor:'pointer',
                }}>
                {actionLabel}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
