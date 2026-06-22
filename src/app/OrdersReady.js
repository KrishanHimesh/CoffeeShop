import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// OrdersReady.js — front-counter / customer-facing screen
// Customer name shown very large so it's readable from across the counter.
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
        display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:'16px', marginTop:'16px',
      }}>
        {ready.map(o => (
          <div key={o.id} style={{
            background:'var(--bs-card, var(--bs-bg2, #1a2540))',
            border:'2px solid var(--bs-success, #34d399)',
            borderRadius:'var(--bs-radius, 12px)',
            padding:'20px',
            boxShadow:'0 0 0 4px rgba(52,211,153,.08)',
          }}>

            {/* Customer name — huge so visible from across the counter */}
            {o.customerName ? (
              <p style={{
                fontSize:'clamp(30px, 6vw, 52px)',
                fontWeight:900,
                color:'var(--bs-text, #e2e8f0)',
                letterSpacing:'-.02em',
                lineHeight:1.05,
                marginBottom:'4px',
                fontFamily:"'Syne','Inter',sans-serif",
                wordBreak:'break-word',
              }}>
                {o.customerName}
              </p>
            ) : (
              <p style={{
                fontSize:'28px', fontWeight:800,
                color:'var(--bs-text, #e2e8f0)',
                fontFamily:"'Space Mono',monospace",
                marginBottom:'4px',
              }}>
                #{(o.receiptId||o.id||'').toString().slice(-5).toUpperCase()}
              </p>
            )}

            {/* Order meta — receipt ID + type */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
              <div>
                {o.customerName && (
                  <p style={{fontSize:'11px',color:'var(--bs-text3, #94a3b8)',fontFamily:"'Space Mono',monospace"}}>
                    #{(o.receiptId||o.id||'').toString().slice(-5).toUpperCase()}
                  </p>
                )}
                <p className="bs-muted" style={{fontSize:'12px'}}>
                  {o.orderType==='Dine-in' ? '🍽️ Dine-in' : '🥤 Takeaway'}
                </p>
              </div>
              <span style={{fontSize:'26px'}}>🔔</span>
            </div>

            {/* Items */}
            <div style={{
              borderTop:'1px solid var(--bs-border, #2a3a5c)',
              paddingTop:'12px',
              marginBottom:'16px',
            }}>
              {o.items.map((it, i) => (
                <div key={i} style={{fontSize:'14px', padding:'3px 0'}}>
                  <strong>{it.qty}×</strong> {it.name}
                  {it.modifiers?.length > 0 && (
                    <span style={{
                      display:'block', fontSize:'12px',
                      color:'var(--bs-text3, #94a3b8)', marginLeft:'18px',
                    }}>
                      {it.modifiers.map(m=>m.optionName).join(', ')}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={()=>onUpdateStatus(o.id, 'completed')}
              style={{
                width:'100%', padding:'13px', borderRadius:'8px', border:'none',
                background:'var(--bs-success, #34d399)', color:'#0d1526',
                fontWeight:700, fontSize:'15px', cursor:'pointer',
              }}>
              ✅ Picked Up
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
