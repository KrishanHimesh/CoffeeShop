import React, { useState } from 'react';
import { CATEGORIES as BASE_CATEGORIES, makeFmt } from './constants';

export default function StockTopup({ products, onTopup, onClose, onAddNew, settings, preSelectId, categories: catProp }) {
  const CATEGORIES = catProp || BASE_CATEGORIES;
  const fmt = makeFmt(settings?.currencySymbol || '$');
  const today = new Date().toISOString().slice(0, 10);

  const [selectedId,  setSelectedId]  = useState(preSelectId || '');
  const [qty,         setQty]         = useState('');
  const [receiveMode, setReceiveMode] = useState('packs'); // 'packs' = qty × pack size, 'units' = raw qty in stock unit
  const [newCost,     setNewCost]     = useState('');
  const [newPrice,    setNewPrice]    = useState('');
  const [receiveDate, setReceiveDate] = useState(today);
  const [memo,        setMemo]        = useState('');
  const [done,        setDone]        = useState(false);

  const product = products.find(p => p.id === selectedId);
  // Pack size: the numeric part of the product's "size" field (e.g. "500" from "500" with unit "g")
  const packSize = product ? (parseFloat(product.size) || 0) : 0;
  const hasPackSize = packSize > 0;
  // Total stock units this top-up will actually add, accounting for pack size
  const totalAddQty = !qty ? 0 : (receiveMode === 'packs' && hasPackSize ? (+qty * packSize) : +qty);
  const costDiff  = product && newCost  ? (+newCost  - +(product.cost  || 0)) : 0;
  const priceDiff = product && newPrice ? (+newPrice - +(product.price || 0)) : 0;
  const hasPriceDiff = priceDiff !== 0;

  const handleSelectProduct = id => {
    setSelectedId(id);
    const p = products.find(x=>x.id===id);
    const pSize = p ? (parseFloat(p.size) || 0) : 0;
    setReceiveMode(pSize > 0 ? 'packs' : 'units');
  };

  const productLabel = p =>
    [p.company, p.name, p.size].filter(Boolean).join(' · ');

  const handleSubmit = async e => {
    e.preventDefault();
    if (!product || !qty) return;
    await onTopup(product.id, {
      addQty:      totalAddQty,
      newCost:     newCost  ? +newCost  : product.cost,
      newPrice:    newPrice ? +newPrice : product.price,
      receiveDate,
      memo,
    });
    setDone(true);
  };

  if (done) return (
    <div className="bs-modal" style={{maxWidth:'400px',textAlign:'center',padding:'36px 28px'}}>
      <div style={{fontSize:'40px',marginBottom:'12px'}}>✅</div>
      <h3 style={{marginBottom:'8px'}}>Stock updated!</h3>
      <p className="bs-muted" style={{marginBottom:'8px'}}>
        Added <strong>{totalAddQty}</strong> {product?.unit||'ea'} of <strong>{product?.name}</strong>
        {receiveMode==='packs' && hasPackSize && <> ({qty} × {packSize}{product?.unit||''} packs)</>}
      </p>
      <p className="bs-muted" style={{marginBottom:'20px'}}>
        New stock: <strong style={{color:'var(--bs-success, #34d399)'}}>{(product?.stock||0) + totalAddQty}</strong> {product?.unit||'ea'}
      </p>
      <div style={{display:'flex',gap:'10px',justifyContent:'center'}}>
        <button className="bs-sec" onClick={onClose}>Done</button>
        <button className="bs-pri" onClick={()=>{setDone(false);setSelectedId('');setQty('');setNewCost('');setNewPrice('');setMemo('');}}>Top Up Another</button>
      </div>
    </div>
  );

  return (
    <div className="bs-modal" style={{maxWidth:'540px'}}>
      <div className="bs-mhdr">
        <h3>📦 Stock Top-Up</h3>
        <button className="bs-mx" onClick={onClose}>✕</button>
      </div>
      <form className="bs-form" onSubmit={handleSubmit}>

        {/* Product selector */}
        <div className="bs-fg">
          <label>Select Product *</label>
          <select value={selectedId} onChange={e=>handleSelectProduct(e.target.value)} required>
            <option value="">— choose a product —</option>
            {Object.keys(CATEGORIES).map(cat => {
              const catProducts = products.filter(p=>p.category===cat);
              if (!catProducts.length) return null;
              return (
                <optgroup key={cat} label={CATEGORIES[cat].icon + ' ' + cat}>
                  {catProducts.map(p => (
                    <option key={p.id} value={p.id}>{productLabel(p)} (stock: {p.stock})</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        {/* Current product info */}
        {product && (
          <div className="bs-topup-current">
            <div className="bs-topup-row">
              <span className="bs-muted">Current stock</span>
              <strong style={{color: product.stock <= product.minStock ? 'var(--bs-warning, #fb923c)' : 'var(--bs-success, #34d399)'}}>
                {product.stock} {product.unit||'ea'}
              </strong>
            </div>
            <div className="bs-topup-row">
              <span className="bs-muted">Current cost price</span>
              <strong>{fmt(product.cost||0)}</strong>
            </div>
            <div className="bs-topup-row">
              <span className="bs-muted">Current sale price</span>
              <strong>{fmt(product.price)}</strong>
            </div>
          </div>
        )}

        {/* Receive mode toggle — only relevant when product has a pack size (e.g. 500g bags) */}
        {product && hasPackSize && (
          <div className="bs-fg">
            <label>Receiving by</label>
            <div style={{display:'flex',gap:'8px'}}>
              <button type="button" className={'bs-pm'+(receiveMode==='packs'?' active':'')} style={{flex:1}}
                onClick={()=>setReceiveMode('packs')}>
                📦 Packs ({packSize}{product.unit||''} each)
              </button>
              <button type="button" className={'bs-pm'+(receiveMode==='units'?' active':'')} style={{flex:1}}
                onClick={()=>setReceiveMode('units')}>
                ⚖️ Raw {product.unit||'units'}
              </button>
            </div>
          </div>
        )}

        {/* Qty + dates */}
        <div className="bs-frow">
          <div className="bs-fg">
            <label>{receiveMode==='packs' && hasPackSize ? 'Packs Received *' : `Quantity Received * (${product?.unit||'units'})`}</label>
            <input type="number" min="1" step={receiveMode==='packs'?'1':'any'} value={qty} onChange={e=>setQty(e.target.value)} required placeholder="0" />
            {product && qty>0 && receiveMode==='packs' && hasPackSize && (
              <p style={{fontSize:'11px',color:'var(--bs-text3, #64748b)',marginTop:'4px'}}>
                = {totalAddQty} {product.unit||'units'} total ({qty} × {packSize}{product.unit||''})
              </p>
            )}
          </div>
          <div className="bs-fg">
            <label>Receive Date</label>
            <input type="date" value={receiveDate} onChange={e=>setReceiveDate(e.target.value)} />
          </div>
        </div>

        <div className="bs-fg">
          <label>Delivery Memo / Reference</label>
          <input value={memo} onChange={e=>setMemo(e.target.value)} placeholder="Invoice #, supplier name, notes…" />
        </div>

        {/* New prices — optional */}
        <div className="bs-topup-price-section">
          <p className="bs-topup-price-label">Price Update (optional — leave blank to keep current prices)</p>
          <div className="bs-frow">
            <div className="bs-fg">
              <label>New Cost Price</label>
              <input type="number" step="0.01" min="0" value={newCost}
                onChange={e=>setNewCost(e.target.value)}
                placeholder={product ? (product.cost||0).toFixed(2) : '0.00'} />
              {product && newCost && costDiff !== 0 && (
                <span style={{fontSize:'11px', color: costDiff > 0 ? 'var(--bs-danger, #f87171)' : 'var(--bs-success, #34d399)', marginTop:'3px', display:'block'}}>
                  {costDiff > 0 ? '▲' : '▼'} {costDiff > 0 ? '+' : ''}{fmt(costDiff)} vs current
                </span>
              )}
            </div>
            <div className="bs-fg">
              <label>New Sale Price</label>
              <input type="number" step="0.01" min="0" value={newPrice}
                onChange={e=>setNewPrice(e.target.value)}
                placeholder={product ? (product.price||0).toFixed(2) : '0.00'} />
              {product && newPrice && priceDiff !== 0 && (
                <span style={{fontSize:'11px', color: priceDiff > 0 ? 'var(--bs-success, #34d399)' : 'var(--bs-danger, #f87171)', marginTop:'3px', display:'block'}}>
                  {priceDiff > 0 ? '▲' : '▼'} {priceDiff > 0 ? '+' : ''}{fmt(priceDiff)} vs current
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Price difference warning */}
        {hasPriceDiff && (
          <div className="bs-topup-warning">
            <p style={{fontWeight:600, marginBottom:'6px'}}>⚠ Price difference detected</p>
            <p className="bs-muted" style={{fontSize:'12px', lineHeight:'1.6', marginBottom:'10px'}}>
              The sale price has changed by <strong style={{color: priceDiff > 0 ? 'var(--bs-success, #34d399)' : 'var(--bs-danger, #f87171)'}}>{priceDiff > 0 ? '+' : ''}{fmt(priceDiff)}</strong>.
              You can either update this product's price, or add it as a new separate product with the new price (so old stock keeps the old price).
            </p>
            <div style={{display:'flex',gap:'8px'}}>
              <button type="submit" className="bs-pri" style={{flex:1}}>Update this product's price</button>
              <button type="button" className="bs-sec" style={{flex:1}} onClick={()=>{ onAddNew(product); onClose(); }}>
                Add as new product →
              </button>
            </div>
          </div>
        )}

        {/* Submit — only shown when no price diff warning */}
        {!hasPriceDiff && (
          <div className="bs-fa">
            <button type="button" className="bs-sec" onClick={onClose}>Cancel</button>
            <button type="submit" className="bs-pri" disabled={!selectedId || !qty}>
              ✅ Confirm Top-Up
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
