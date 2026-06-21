import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// OrdersReady.js — front-counter-facing screen
// Shows orders the kitchen has finished (status: 'ready'), waiting for pickup.
// Counter staff taps "Picked Up" once the customer has it, removing it from view.
// ─────────────────────────────────────────────────────────────────────────────

export default function OrdersReady({ kitchenOrders, onUpdateStatus }) {
  const ready = (kitchenOrders || []).filter(o => o.status === 'ready');

  return (
    <div className="bs-orders-ready">
      <div className="bs-dash-header">
        <div>
          <h2 className="bs-h2">🔔 Orders Ready</h2>
          <p className="bs-muted">{ready.length} order{ready.length!==1?'s':''} waiting for pickup</p>
        </div>
      </div>

      {ready.length === 0 && (
        <div className="bs-dcard" style={{marginTop:'16px'}}>
          <p className="bs-muted" style={{padding:'48px 0',textAlign:'center',fontSize:'15px'}}>
            ✅ No orders waiting — all picked up!
          </p>
        </div>
      )}

      <div style={{
        display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:'14px', marginTop:'16px',
      }}>
        {ready.map(o => (
          <div key={o.id} style={{
            background:'var(--bs-card, var(--bs-bg2, #1a2540))',
            border:'2px solid var(--bs-success, #34d399)',
            borderRadius:'var(--bs-radius, 12px)',
            padding:'16px',
            boxShadow:'0 0 0 1px rgba(52,211,153,.15)',
          }}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'10px'}}>
              <div>
                <p style={{fontWeight:800,fontSize:'18px',color:'var(--bs-text, #e2e8f0)',fontFamily:"'Space Mono',monospace"}}>
                  #{(o.receiptId||o.id||'').toString().slice(-5).toUpperCase()}
                </p>
                <p className="bs-muted" style={{fontSize:'12px'}}>{o.orderType==='Dine-in' ? '🍽️ Dine-in' : '🥤 Takeaway'}</p>
              </div>
              <span style={{fontSize:'20px'}}>🔔</span>
            </div>

            <div style={{marginBottom:'14px'}}>
              {o.items.map((it, i) => (
                <div key={i} style={{fontSize:'13px',padding:'3px 0'}}>
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
              onClick={()=>onUpdateStatus(o.id, 'completed')}
              style={{
                width:'100%', padding:'10px', borderRadius:'8px', border:'none',
                background:'var(--bs-success, #34d399)', color:'#0d1526', fontWeight:700, fontSize:'14px', cursor:'pointer',
              }}>
              ✅ Picked Up
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
