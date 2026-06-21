import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CATEGORIES as BASE_CATEGORIES } from './constants';

const PAYMENT_METHODS = ['Cash','Card','EFTPOS','Bank Transfer','Credit'];

// Convert any unit to a common base so recipe qty (e.g. grams) can be compared
// against ingredient stock (e.g. kilograms).
const UNIT_TO_BASE = { g:0.001, kg:1, ml:0.001, L:1, ea:1, box:1, pack:1, bag:1, btl:1, ream:1, roll:1, dozen:1 };

// How many servings of a recipe-based product can still be made from current
// ingredient stock levels. `cartReserved` lets us subtract servings already
// sitting in the cart (not yet deducted from real stock) so the number reflects
// what's *actually still available* to add.
function maxMakeable(product, products, cartReserved) {
  if (!product.recipe || product.recipe.length === 0) return null; // not a recipe item — no limit from this logic
  let max = Infinity;
  for (const r of product.recipe) {
    const ing = products.find(p => p.id === r.productId);
    if (!ing) { max = 0; continue; }
    const ingUnitBase    = UNIT_TO_BASE[ing.unit] ?? 1;
    const recipeUnitBase = UNIT_TO_BASE[r.unit]   ?? 1;
    const qtyPerServingInIngUnit = (r.qty * recipeUnitBase) / ingUnitBase;
    if (qtyPerServingInIngUnit <= 0) continue;
    // Subtract stock already "claimed" by this same ingredient across cart items
    const reserved = cartReserved?.[ing.id] || 0;
    const availableStock = Math.max(0, ing.stock - reserved);
    max = Math.min(max, Math.floor(availableStock / qtyPerServingInIngUnit));
  }
  return max === Infinity ? 0 : max;
}

export default function POS({ products, onSale, profile, settings, creditCustomers, categories: catProp }) {
  const CATEGORIES = catProp || BASE_CATEGORIES;
  const sym        = settings?.currencySymbol || '$';
  const gstEnabled = settings?.gstEnabled !== false;
  const gstRate    = (settings?.gstRate ?? 10) / 100;
  const compact    = settings?.compactCards === true;
  const fmt = n => {
    const num = Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits:2, maximumFractionDigits:2 });
    return sym + ' ' + num;
  };

  const [cart,         setCart]        = useState([]);
  const [search,       setSearch]      = useState('');
  const [catF,         setCatF]        = useState('All');
  const [payment,      setPayment]     = useState('Cash');
  const [disc,         setDisc]        = useState(0);
  const [note,         setNote]        = useState('');
  const [receipt,      setReceipt]     = useState(null);
  const [busy,         setBusy]        = useState(false);
  const [scanning,     setScanning]    = useState(false);
  const [scanError,    setScanError]   = useState('');
  const [miscOpen,     setMiscOpen]    = useState(false);
  const [miscLabel,    setMiscLabel]   = useState('');
  const [miscPrice,    setMiscPrice]   = useState('');
  const [creditCustId, setCreditCustId]= useState('');
  const [orderType,    setOrderType]   = useState('Takeaway');
  const [modalProduct, setModalProduct]= useState(null); // product awaiting modifier selection
  const searchRef = useRef(null);
  const videoRef  = useRef(null);
  const scannerRef= useRef(null); // ZXing scanner instance
  const cats = ['All', ...Object.keys(CATEGORIES)];

  // How much of each ingredient is "claimed" by items currently sitting in the cart
  // (not yet deducted from real stock, but shouldn't be double-counted as available).
  const cartIngredientReserved = {};
  for (const item of cart) {
    const prod = products.find(p => p.id === (item.baseProductId || item.id));
    if (!prod?.recipe) continue;
    // Combine multipliers from this cart item's chosen modifiers (e.g. Large = more milk)
    const combinedMultipliers = {};
    for (const m of (item.modifiers || [])) {
      for (const [ingId, mult] of Object.entries(m.qtyMultipliers || {})) {
        combinedMultipliers[ingId] = (combinedMultipliers[ingId] ?? 1) * mult;
      }
    }
    for (const r of prod.recipe) {
      const recipeUnitBase = UNIT_TO_BASE[r.unit] ?? 1;
      const ing = products.find(p => p.id === r.productId);
      const ingUnitBase = ing ? (UNIT_TO_BASE[ing.unit] ?? 1) : 1;
      const multiplier = combinedMultipliers[r.productId] ?? 1;
      const qtyInIngUnit = (r.qty * recipeUnitBase / ingUnitBase) * multiplier * item.qty;
      cartIngredientReserved[r.productId] = (cartIngredientReserved[r.productId] || 0) + qtyInIngUnit;
    }
  }

  const filtered = products.filter(p => {
    const q = search.toLowerCase();
    const availableQty = p.recipe?.length ? maxMakeable(p, products, cartIngredientReserved) : p.stock;
    return !p.isIngredient
        && (!q || p.name.toLowerCase().includes(q)
               || (p.barcode||'').includes(q)
               || (p.productCode||'').toLowerCase().includes(q)
               || (p.company||'').toLowerCase().includes(q)
               || (p.size||'').toLowerCase().includes(q))
        && (catF==='All' || p.category===catF)
        && availableQty > 0;
  });

  // ── Cart helpers ──────────────────────────────────────────────────────────────
  const addItem = useCallback(p => {
    const limit = p.recipe?.length ? maxMakeable(p, products, cartIngredientReserved) : p.stock;
    if (limit === 0) return;
    if (p.modifierGroups && p.modifierGroups.length > 0) {
      setModalProduct(p);
      return;
    }
    setCart(prev => {
      const ex = prev.find(i=>i.id===p.id);
      if (ex) {
        if (ex.qty >= limit) return prev;
        return prev.map(i=>i.id===p.id?{...i,qty:i.qty+1}:i);
      }
      return [...prev, {...p, qty:1, salePrice:p.price}];
    });
  }, [products, cartIngredientReserved]);

  // Add an item with chosen modifiers (each: {groupName, optionName, priceDelta, qtyMultipliers})
  const addItemWithModifiers = (p, chosenModifiers) => {
    const modTotal = chosenModifiers.reduce((s,m)=>s+(m.priceDelta||0),0);
    const modSig = chosenModifiers.map(m=>m.optionName).sort().join('|');
    const cartId = p.id + '__' + modSig;
    const limit = p.recipe?.length ? maxMakeable(p, products, cartIngredientReserved) : p.stock;
    if (limit <= 0) { setModalProduct(null); return; }

    // True cost for this specific combo: recompute from recipe with multipliers applied,
    // so a Large (more milk) correctly costs more than a Small for margin/profit reporting.
    let trueCost = p.cost || 0;
    if (p.recipe?.length) {
      const combinedMultipliers = {};
      for (const m of chosenModifiers) {
        for (const [ingId, mult] of Object.entries(m.qtyMultipliers || {})) {
          combinedMultipliers[ingId] = (combinedMultipliers[ingId] ?? 1) * mult;
        }
      }
      trueCost = p.recipe.reduce((sum, r) => {
        const ing = products.find(i => i.id === r.productId);
        if (!ing) return sum;
        const ingUnitBase = UNIT_TO_BASE[ing.unit] ?? 1;
        const recipeUnitBase = UNIT_TO_BASE[r.unit] ?? 1;
        const multiplier = combinedMultipliers[r.productId] ?? 1;
        const qtyInIngUnit = (r.qty * recipeUnitBase / ingUnitBase) * multiplier;
        return sum + qtyInIngUnit * (ing.cost || 0);
      }, 0);
    }

    setCart(prev => {
      const ex = prev.find(i=>i.id===cartId);
      if (ex) {
        if (ex.qty >= limit) return prev;
        return prev.map(i=>i.id===cartId?{...i,qty:i.qty+1}:i);
      }
      return [...prev, {
        ...p, id: cartId, baseProductId: p.id, qty:1,
        modifiers: chosenModifiers,
        salePrice: p.price + modTotal,
        price: p.price + modTotal,
        cost: trueCost,
        name: p.name + (chosenModifiers.length ? ' (' + chosenModifiers.map(m=>m.optionName).join(', ') + ')' : ''),
      }];
    });
    setModalProduct(null);
  };

  const addMisc = () => {
    if (!miscPrice || +miscPrice <= 0) return;
    const id = '__misc__' + Date.now();
    setCart(prev => [...prev, {id, name:miscLabel||'Miscellaneous', category:'Other', qty:1, salePrice:+miscPrice, price:+miscPrice, cost:0, stock:999, isMisc:true}]);
    setMiscLabel(''); setMiscPrice(''); setMiscOpen(false);
  };

  const setQty = (id, qty) => {
    if (qty <= 0) { setCart(c=>c.filter(i=>i.id!==id)); return; }
    const item = cart.find(i=>i.id===id);
    if (item && !item.isMisc) {
      const p = products.find(x=>x.id===id);
      if (p && qty > p.stock) return;
    }
    setCart(c=>c.map(i=>i.id===id?{...i,qty}:i));
  };

  const setPrice = (id, price) => setCart(c=>c.map(i=>i.id===id?{...i,salePrice:+price}:i));

  // GST-inclusive pricing: the Sale Price entered on each product is the final
  // price the customer pays. GST is "backed out" of that total for the receipt
  // breakdown, not added on top — e.g. $5.00 total @ 10% GST = $4.55 + $0.45 GST.
  const grossSubtotal = cart.reduce((s,i)=>s+(i.salePrice||i.price)*i.qty,0);
  const discAmt   = grossSubtotal*(disc/100);
  const total     = grossSubtotal - discAmt; // discount applies to the GST-inclusive total
  const tax       = gstEnabled ? total - (total / (1 + gstRate)) : 0;
  const subtotal  = total - tax; // ex-GST amount, shown as "Subtotal" on receipt
  const profit    = cart.reduce((s,i)=>s+((i.salePrice||i.price)-(i.cost||0))*i.qty,0) - discAmt;

  // ── ZXing Camera Barcode Scanner ──────────────────────────────────────────────
  const startScanner = async () => {
    setScanError('');
    setScanning(true);
    try {
      // Dynamically import ZXing to avoid build issues
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const codeReader = new BrowserMultiFormatReader();
      scannerRef.current = codeReader;

      // Get available cameras — prefer back/environment camera on mobile
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (!devices || devices.length === 0) {
        throw new Error('No camera found on this device');
      }
      const backCamera = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[devices.length-1];
      const deviceId = backCamera?.deviceId;

      let scanned = false; // guard: only process the FIRST successful scan
      await codeReader.decodeFromVideoDevice(deviceId, videoRef.current, (result, err) => {
        if (result && !scanned) {
          scanned = true;
          const code = result.getText();
          const found = products.find(p => p.barcode===code || p.productCode===code);
          if (found) addItem(found);
          else       setSearch(code);
          stopScanner();
        }
      });
    } catch (err) {
      setScanError('Camera error: ' + (err.message || 'Could not access camera'));
      setScanning(false);
    }
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      try { scannerRef.current.reset(); } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
    setScanError('');
  };

  useEffect(() => () => stopScanner(), []); // cleanup on unmount

  // ── USB/Keyboard barcode reader ───────────────────────────────────────────────
  useEffect(() => {
    let buf = '', timer, lastScanned = '', lastScannedTime = 0;
    const handler = e => {
      if (document.activeElement?.tagName === 'INPUT' && document.activeElement !== searchRef.current) return;
      if (e.key === 'Enter' && buf.length > 3) {
        const code = buf;
        buf = '';
        clearTimeout(timer);
        // Deduplicate: ignore same barcode within 800ms (prevents 2x/3x adds from scanner repeat-fire)
        const now = Date.now();
        if (code === lastScanned && now - lastScannedTime < 800) return;
        lastScanned = code;
        lastScannedTime = now;
        const found = products.find(p => p.barcode===code || p.productCode===code);
        if (found) addItem(found);
        else setSearch(code);
      } else if (e.key.length === 1) {
        buf += e.key;
        clearTimeout(timer);
        timer = setTimeout(()=>{ buf=''; }, 150);
      }
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); clearTimeout(timer); };
  }, [products, addItem]);

  // ── Checkout ──────────────────────────────────────────────────────────────────
  const checkout = async () => {
    if (!cart.length || busy) return;
    setBusy(true);
    const isCredit = payment === 'Credit' && creditCustId;
    const saleData = {
      items: cart.map(i=>({
        id: i.baseProductId || i.id, name:i.name, category:i.category, qty:i.qty,
        price:i.salePrice||i.price, cost:i.cost||0, isMisc:i.isMisc||false,
        ...(i.modifiers && i.modifiers.length ? { modifiers: i.modifiers } : {}),
      })),
      subtotal, discount:discAmt, tax, total, profit, payment, orderType,
      note: note + (isCredit ? ` [Credit: ${creditCustomers?.find(c=>c.id===creditCustId)?.name}]` : ''),
      creditCustomerId: isCredit ? creditCustId : null,
      creditCustomerName: isCredit ? (creditCustomers?.find(c=>c.id===creditCustId)?.name||'') : null,
    };
    const receiptId = await onSale(saleData);
    const creditCust = isCredit ? creditCustomers?.find(c=>c.id===creditCustId) : null;
    setReceipt({
      ...saleData, id: receiptId||('S'+Date.now()), date: new Date().toISOString(),
      workerName: profile?.name, businessName: settings?.businessName||'Unity Book Shop',
      receiptFooter: settings?.receiptFooter||'Thank you for shopping with us!',
      receiptFooter2: settings?.receiptFooter2||'',
      gstEnabled, gstRate: settings?.gstRate??10, sym,
      creditCustomerName: creditCust?.name,
    });
    setCart([]); setDisc(0); setNote(''); setCreditCustId(''); setBusy(false); setOrderType('Takeaway');
  };

  if (receipt) return <ReceiptView receipt={receipt} fmt={fmt} onNew={()=>setReceipt(null)} />;

  const selectedCreditCust = creditCustomers?.find(c=>c.id===creditCustId);

  return (
    <div className="bs-pos">
      {modalProduct && (
        <ModifierModal product={modalProduct} fmt={fmt}
          onCancel={()=>setModalProduct(null)}
          onConfirm={(mods)=>addItemWithModifiers(modalProduct, mods)} />
      )}      {/* LEFT — product grid */}
      <div className="bs-pos-l">
        <div className="bs-toolbar">
          <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
            <input ref={searchRef} className="bs-inp" style={{flex:1}}
              placeholder="🔍 Search name / code / barcode…"
              value={search} onChange={e=>setSearch(e.target.value)} />
            <button className={'bs-scan-btn'+(scanning?' active':'')}
              onClick={scanning ? stopScanner : startScanner}
              title={scanning ? 'Stop scanning' : 'Scan barcode with camera'}>
              {scanning ? '⏹' : '📷'}
            </button>
          </div>
          {scanError && <p style={{fontSize:'11px',color:'#f87171',marginTop:'2px'}}>{scanError}</p>}
          <div className="bs-pills">
            {cats.map(c=>(
              <button key={c} className={'bs-pill'+(catF===c?' a':'')} onClick={()=>setCatF(c)}>
                {c==='All'?'All':CATEGORIES[c]?.icon+' '+c}
              </button>
            ))}
          </div>
        </div>

        {/* ZXing video element — hidden but always in DOM when scanning */}
        <div style={{display:scanning?'block':'none',marginBottom:'8px'}}>
          <video ref={videoRef}
            style={{width:'100%',maxHeight:'220px',objectFit:'cover',borderRadius:'10px',border:'2px solid #38bdf8'}}
            muted playsInline autoPlay/>
          <p style={{textAlign:'center',fontSize:'12px',color:'var(--bs-text3, #94a3b8)',marginTop:'6px'}}>
            Point camera at barcode ·
            <button className="bs-link-btn" onClick={stopScanner} style={{marginLeft:'6px'}}>Cancel</button>
          </p>
        </div>

        {/* Total servings makeable across all recipe-based drinks, from current ingredient stock */}
        {(() => {
          const recipeProducts = products.filter(p => !p.isIngredient && p.recipe?.length > 0 && (catF==='All' || p.category===catF));
          if (recipeProducts.length === 0) return null;
          const totalMakeable = recipeProducts.reduce((sum,p)=> sum + maxMakeable(p, products, cartIngredientReserved), 0);
          return (
            <div style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              background:'var(--bs-accent-bg, rgba(56,189,248,.06))', border:'1px solid var(--bs-border, #2a3a5c)', borderRadius:'10px',
              padding:'8px 14px', marginBottom:'10px', fontSize:'12px', color:'var(--bs-text3, #94a3b8)',
            }}>
              <span>☕ {recipeProducts.length} coffee/tea types · ingredient stock allows <strong style={{color:'var(--bs-text, #e2e8f0)'}}>{totalMakeable}</strong> total servings right now</span>
            </div>
          );
        })()}

        {/* Product grid — fixed card size, scrollable */}
        <div className={compact ? 'bs-grid bs-grid-compact' : 'bs-grid'}>
          {filtered.map(p=>{
            const isRecipe = p.recipe?.length > 0;
            const availableQty = isRecipe ? maxMakeable(p, products, cartIngredientReserved) : p.stock;
            const lowStock = isRecipe ? availableQty <= 5 : p.stock <= p.minStock;
            return (
            <button key={p.id} className="bs-bk" onClick={()=>addItem(p)}>
              {p.photoUrl
                ? <img src={p.photoUrl} alt="" className="bs-bk-photo"/>
                : <div className="bs-bk-top" style={{background:CATEGORIES[p.category]?.color||'#64748b'}}/>
              }
              <div className="bs-bk-body">
                {!compact&&<p className="bs-bk-cat">{CATEGORIES[p.category]?.icon} {p.category}</p>}
                <p className="bs-bk-ttl">{[p.company, p.name, p.size].filter(Boolean).join(' · ')}</p>
                {p.productCode&&<p className="bs-bk-code">{p.productCode}</p>}
                <div className="bs-bk-ft">
                  <span className="bs-bk-price">{fmt(p.price)}</span>
                  <span className={'bs-bk-stk'+(lowStock?' ora':'')} title={isRecipe ? 'Servings makeable from current ingredient stock' : 'Stock on hand'}>
                    {isRecipe ? `🧮 ${availableQty} can be made` : `${p.stock} ${p.unit||'ea'}`}
                  </span>
                </div>
              </div>
            </button>
          );})}
          {filtered.length===0&&<p className="bs-muted" style={{gridColumn:'1/-1',padding:'32px',textAlign:'center'}}>No products found.</p>}
        </div>
      </div>

      {/* RIGHT — cart */}
      <div className="bs-pos-r">
        <div className="bs-pos-r-header">
          <p className="bs-cart-ttl">🛒 Bill {cart.length>0&&`(${cart.reduce((s,i)=>s+i.qty,0)})`}</p>
          <span className="bs-cashier-tag">👤 {profile?.name}</span>
        </div>

        <div style={{display:'flex',gap:'8px',marginBottom:'8px'}}>
          {['Takeaway','Dine-in'].map(t=>(
            <button key={t} className={'bs-pm'+(orderType===t?' active':'')} onClick={()=>setOrderType(t)}
              style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',padding:'10px'}}>
              {t==='Dine-in'?'🍽️':'🥤'} {t}
            </button>
          ))}
        </div>

        {cart.length===0 ? (
          <p className="bs-muted" style={{padding:'20px 0'}}>Tap a product to add it.</p>
        ) : (
          <>
            <div className="bs-cart-list">
              {cart.map(it=>(
                <div key={it.id} className={'bs-ci'+(it.isMisc?' bs-ci-misc':'')}>
                  <div className="bs-ci-info">
                    <p className="bs-ci-ttl">{it.name}</p>
                    <p className="bs-tiny">{it.isMisc?'Misc':it.category}</p>
                  </div>
                  <div className="bs-ci-controls">
                    <div className="bs-qty">
                      <button onClick={()=>setQty(it.id,it.qty-1)}>−</button>
                      <span>{it.qty}</span>
                      <button onClick={()=>setQty(it.id,it.qty+1)}>+</button>
                    </div>
                    <input className="bs-price-inp" type="number" step="0.01"
                      value={it.salePrice||it.price} onChange={e=>setPrice(it.id,e.target.value)} title="Adjust price"/>
                    <span className="bs-ci-tot">{fmt((it.salePrice||it.price)*it.qty)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Misc */}
            {miscOpen ? (
              <div className="bs-misc-form">
                <input className="bs-inp" placeholder="Item description" value={miscLabel} onChange={e=>setMiscLabel(e.target.value)} style={{flex:1}}/>
                <input className="bs-inp" type="number" step="0.01" placeholder="Price" value={miscPrice} onChange={e=>setMiscPrice(e.target.value)} style={{width:'80px'}}/>
                <button className="bs-pri" style={{padding:'8px 10px'}} onClick={addMisc}>Add</button>
                <button className="bs-sec" style={{padding:'8px 10px'}} onClick={()=>setMiscOpen(false)}>✕</button>
              </div>
            ) : (
              <button className="bs-misc-btn" onClick={()=>setMiscOpen(true)}>+ Add Misc Item</button>
            )}

            <div className="bs-cart-extras">
              <div className="bs-extra-row"><label>Discount %</label><input type="number" min="0" max="100" value={disc} onChange={e=>setDisc(+e.target.value)} className="bs-small-inp"/></div>
              <div className="bs-extra-row"><label>Note</label><input type="text" value={note} onChange={e=>setNote(e.target.value)} placeholder="Customer name / ref…" className="bs-inp-sm"/></div>
            </div>

            <div className="bs-summary">
              <div className="bs-srow"><span>Items Total</span><span>{fmt(grossSubtotal)}</span></div>
              {disc>0&&<div className="bs-srow disc"><span>Discount ({disc}%)</span><span>−{fmt(discAmt)}</span></div>}
              <div className="bs-srow bs-grand"><span>TOTAL</span><span>{fmt(total)}</span></div>
              {gstEnabled&&<div className="bs-srow" style={{fontSize:'11px',color:'#64748b'}}><span>— incl. GST ({settings?.gstRate??10}%)</span><span>{fmt(tax)}</span></div>}
            </div>

            {/* Payment methods */}
            <div className="bs-pay-methods">
              {PAYMENT_METHODS.map(m=>(
                <button key={m} className={'bs-pm'+(payment===m?' active':'')} onClick={()=>setPayment(m)}>{m}</button>
              ))}
            </div>

            {/* Credit customer selector */}
            {payment==='Credit' && creditCustomers?.length>0 && (
              <div className="bs-credit-select">
                <label style={{fontSize:'11px',color:'#64748b',textTransform:'uppercase',letterSpacing:'.08em'}}>Credit Customer *</label>
                <select value={creditCustId} onChange={e=>setCreditCustId(e.target.value)} className="bs-sel" style={{width:'100%',marginTop:'4px'}}>
                  <option value="">— Select customer —</option>
                  {creditCustomers.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?' · '+c.phone:''}</option>)}
                </select>
                {selectedCreditCust&&<p style={{fontSize:'11px',color:'#38bdf8',marginTop:'3px'}}>Account: {selectedCreditCust.name}</p>}
              </div>
            )}
            {payment==='Credit' && !creditCustomers?.length && (
              <p style={{fontSize:'12px',color:'#fb923c',margin:'6px 0'}}>⚠ No credit customers set up. Add them in the Customers tab first.</p>
            )}

            <button className="bs-checkout-btn" onClick={checkout}
              disabled={busy||(payment==='Credit'&&!creditCustId)}>
              {busy?'Processing…':'✅ Complete Sale · '+fmt(total)}
            </button>
            <button className="bs-clear" onClick={()=>{setCart([]);setDisc(0);setNote('');setCreditCustId('');setOrderType('Takeaway');}}>Clear Bill</button>
          </>
        )}
      </div>
    </div>
  );
}

function ModifierModal({ product, fmt, onCancel, onConfirm }) {
  // selections: { [groupName]: optionName }  (single-select per group, simplest coffee-shop model)
  const groups = product.modifierGroups || [];
  const initial = {};
  groups.forEach(g => { if (g.required && g.options?.length) initial[g.name] = g.options[0].name; });
  const [selections, setSelections] = useState(initial);

  const pick = (groupName, optionName) => setSelections(s => ({ ...s, [groupName]: optionName }));

  const missingRequired = groups.some(g => g.required && !selections[g.name]);

  const confirm = () => {
    if (missingRequired) return;
    const chosen = groups
      .filter(g => selections[g.name])
      .map(g => {
        const opt = g.options.find(o => o.name === selections[g.name]);
        return { groupName: g.name, optionName: opt.name, priceDelta: opt.priceDelta || 0, qtyMultipliers: opt.qtyMultipliers || {} };
      });
    onConfirm(chosen);
  };

  return (
    <div className="bs-modal-overlay" onClick={onCancel}
      style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()}
        style={{background:'var(--bs-card, #1e293b)',border:'1px solid var(--bs-border, #2a3a5c)',borderRadius:'var(--bs-radius, 14px)',boxShadow:'var(--bs-shadow, 0 4px 20px rgba(0,0,0,.4))',padding:'20px',width:'min(420px,92vw)',maxHeight:'85vh',overflowY:'auto'}}>
        <h3 style={{margin:'0 0 4px',color:'var(--bs-text, #fff)'}}>{product.name}</h3>
        <p className="bs-muted" style={{margin:'0 0 14px'}}>Choose options</p>
        {groups.map(g=>(
          <div key={g.name} style={{marginBottom:'14px'}}>
            <p style={{fontSize:'12px',color:'var(--bs-text3, #94a3b8)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'6px'}}>
              {g.name}{g.required?' *':''}
            </p>
            <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
              {g.options.map(o=>(
                <button key={o.name}
                  onClick={()=>pick(g.name,o.name)}
                  className={'bs-pm'+(selections[g.name]===o.name?' active':'')}>
                  {o.name}{o.priceDelta?` (+${fmt(o.priceDelta)})`:''}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div style={{display:'flex',gap:'8px',marginTop:'10px'}}>
          <button className="bs-sec" style={{flex:1}} onClick={onCancel}>Cancel</button>
          <button className="bs-pri" style={{flex:1}} disabled={missingRequired} onClick={confirm}>Add to Bill</button>
        </div>
      </div>
    </div>
  );
}

function ReceiptView({ receipt, fmt, onNew }) {
  const handlePrint = () => {
    const win = window.open('','_blank','width=400,height=650');
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${receipt.id}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:13px;color:#000;background:#fff;padding:20px;max-width:320px;margin:0 auto}
h2{font-size:18px;text-align:center;margin-bottom:4px}.c{text-align:center}.m{color:#555;font-size:12px}
hr{border:none;border-top:1px dashed #999;margin:10px 0}table{width:100%;border-collapse:collapse}
th{font-size:11px;text-align:left;border-bottom:1px solid #ccc;padding:3px 0}
td{padding:4px 0;font-size:12px}td:last-child,th:last-child{text-align:right}
td:nth-child(2),th:nth-child(2){text-align:center}
.tr td{font-weight:bold;font-size:14px;padding-top:6px;border-top:1px solid #000}
.footer{text-align:center;font-size:11px;color:#555;margin-top:12px}
@media print{body{padding:6px}}</style></head><body>
<h2>${receipt.businessName||'Store'}</h2>
<p class="c m">Receipt #${receipt.id}</p>
<p class="c m">${new Date(receipt.date).toLocaleString()}</p>
<p class="c m">Cashier: ${receipt.workerName||''}</p>
${receipt.creditCustomerName?`<p class="c m">Customer: ${receipt.creditCustomerName}</p>`:''}
<hr><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>
${receipt.items.map(it=>`<tr><td>${it.name}${it.isMisc?' (misc)':''}</td><td style="text-align:center">${it.qty}</td><td style="text-align:right">${receipt.sym} ${it.price.toFixed(2)}</td><td style="text-align:right">${receipt.sym} ${(it.price*it.qty).toFixed(2)}</td></tr>`).join('')}
</tbody></table><hr><table>
<tr><td>Items Total</td><td></td><td></td><td style="text-align:right">${receipt.sym} ${(receipt.subtotal+receipt.tax+receipt.discount).toFixed(2)}</td></tr>
${receipt.discount>0?`<tr><td>Discount</td><td></td><td></td><td style="text-align:right">-${receipt.sym} ${receipt.discount.toFixed(2)}</td></tr>`:''}
<tr class="tr"><td>TOTAL</td><td></td><td></td><td style="text-align:right">${receipt.sym} ${receipt.total.toFixed(2)}</td></tr>
${receipt.gstEnabled?`<tr><td style="color:#888;font-size:10px">— incl. GST (${receipt.gstRate}%)</td><td></td><td></td><td style="text-align:right;color:#888;font-size:10px">${receipt.sym} ${receipt.tax.toFixed(2)}</td></tr>`:''}
<tr><td>Payment</td><td></td><td></td><td style="text-align:right">${receipt.payment}</td></tr>
</table><hr>
<p class="footer">${receipt.receiptFooter||'Thank you!'}</p>${receipt.receiptFooter2?`<p class="footer" style="color:#1a6fb5;margin-top:2px">${receipt.receiptFooter2}</p>`:''}
</body></html>`;
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(()=>{win.print();win.close();},400);
  };

  return (
    <div className="bs-receipt-full">
      <div className="bs-receipt-paper">
        <div className="bs-rp-header">
          <h2>🏪 {receipt.businessName}</h2>
          <p className="bs-muted">Receipt #{receipt.id}</p>
          <p className="bs-muted">{new Date(receipt.date).toLocaleString()}</p>
          <p className="bs-muted">Cashier: <strong>{receipt.workerName}</strong></p>
          {receipt.orderType&&<p className="bs-muted">Order: <strong>{receipt.orderType}</strong></p>}
          {receipt.creditCustomerName&&<p className="bs-muted">Customer: <strong style={{color:'#38bdf8'}}>{receipt.creditCustomerName}</strong></p>}
        </div>
        <hr className="bs-rhr"/>
        <table className="bs-rec-tbl">
          <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>
            {receipt.items.map((it,i)=>(
              <tr key={i}>
                <td>{it.name}{it.isMisc&&<span style={{fontSize:'10px',color:'var(--bs-text3, #94a3b8)'}}> (misc)</span>}</td>
                <td style={{textAlign:'center'}}>{it.qty}</td>
                <td style={{textAlign:'right'}}>{fmt(it.price)}</td>
                <td style={{textAlign:'right',fontWeight:700}}>{fmt(it.price*it.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="bs-rhr"/>
        <div className="bs-rtots">
          <div className="bs-rtrow"><span>Items Total</span><span>{fmt(receipt.subtotal+receipt.tax+receipt.discount)}</span></div>
          {receipt.discount>0&&<div className="bs-rtrow"><span>Discount</span><span style={{color:'#f87171'}}>−{fmt(receipt.discount)}</span></div>}
          <div className="bs-rtrow" style={{fontWeight:800,fontSize:'1.1rem',borderTop:'1px solid var(--bs-border2, #334155)',paddingTop:'8px',marginTop:'6px'}}><span>TOTAL</span><span>{fmt(receipt.total)}</span></div>
          {receipt.gstEnabled&&<div className="bs-rtrow" style={{fontSize:'11px',color:'#64748b'}}><span>— incl. GST ({receipt.gstRate}%)</span><span>{fmt(receipt.tax)}</span></div>}
          <div className="bs-rtrow"><span>Payment</span><span className="bs-pbadge">{receipt.payment}</span></div>
        </div>
        <p className="bs-rp-footer">{receipt.receiptFooter}</p>
        {receipt.receiptFooter2 && <p className="bs-rp-footer" style={{color:'#38bdf8',marginTop:'4px'}}>{receipt.receiptFooter2}</p>}
      </div>
      <div className="bs-receipt-actions">
        <button className="bs-sec" onClick={handlePrint}>🖨 Print</button>
        <button className="bs-pri" onClick={onNew}>+ New Sale</button>
      </div>
    </div>
  );
}
