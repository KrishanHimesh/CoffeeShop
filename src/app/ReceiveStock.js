import React, { useState, useRef, useEffect } from 'react';
import { makeFmt, CATEGORIES as BASE_CATEGORIES } from './constants';

const BLANK_ITEM = { productId:'', qty:'', newCost:'', newPrice:'', isNew:false,
  newProduct:{ productCode:'', name:'', company:'', size:'', category:'Books', unit:'ea', barcode:'', price:'', cost:'' } };

export default function ReceiveStock({ products, suppliers, onReceive, onAddProduct, settings, onViewReceipt, stockReceipts, categories: catProp }) {
  const CATEGORIES = catProp || BASE_CATEGORIES;
  const fmt = makeFmt(settings?.currencySymbol || '$');
  const today = new Date().toISOString().slice(0,10);
  const [view, setView] = useState('form'); // 'form' | 'history'
  const [supplierId,  setSupplierId]  = useState('');
  const [invoiceNo,   setInvoiceNo]   = useState('');
  const [receiveDate, setReceiveDate] = useState(today);
  const [dueDate,     setDueDate]     = useState('');
  const [notes,       setNotes]       = useState('');
  const [items,       setItems]       = useState([]);
  const [draft,       setDraft]       = useState({...BLANK_ITEM}); // current item being added
  const [payStatus,   setPayStatus]   = useState('unpaid');
  const [payAmount,   setPayAmount]   = useState('');
  const [payMethod,   setPayMethod]   = useState('Bank Transfer');
  const [payDate,     setPayDate]     = useState(today);
  const [busy,        setBusy]        = useState(false);
  const [done,        setDone]        = useState(false);
  const [viewReceipt, setViewReceipt] = useState(null);
  const [scanning,    setScanning]    = useState(false); // barcode scanner active
  const videoRef   = useRef(null);
  const scannerRef = useRef(null);

  const supplier = suppliers.find(s=>s.id===supplierId);
  const productLabel = p => [p.company,p.name,p.size].filter(Boolean).join(' · ');

  const totalCost = items.reduce((s,it) => {
    const c = it.isNew ? +(it.newProduct?.cost||0) : +(it.newCost||(products.find(p=>p.id===it.productId)?.cost||0));
    return s + c * (+(it.qty)||0);
  },0);

  // ── Draft item management ─────────────────────────────────────────────────────
  const setD = (k,v) => setDraft(p=>({...p,[k]:v}));
  const setNP = (k,v) => setDraft(p=>({...p,newProduct:{...p.newProduct,[k]:v}}));

  const canAddItem = () => draft.isNew ? (draft.newProduct.name&&draft.newProduct.price&&draft.qty) : (draft.productId&&draft.qty);

  const addItemToList = () => {
    if(!canAddItem()) return;
    const prod = !draft.isNew ? products.find(p=>p.id===draft.productId) : null;
    const item = {
      ...draft,
      _label: draft.isNew ? [draft.newProduct.company,draft.newProduct.name,draft.newProduct.size].filter(Boolean).join(' · ') : productLabel(prod),
      _unitCost: draft.isNew ? +(draft.newProduct.cost||0) : +(draft.newCost||prod?.cost||0),
      _unitPrice: draft.isNew ? +(draft.newProduct.price||0) : +(draft.newPrice||prod?.price||0),
      _currentCost: prod?.cost||0,
      _currentPrice: prod?.price||0,
    };
    setItems(prev=>[...prev,item]);
    setDraft({...BLANK_ITEM});
  };

  const removeItem = i => setItems(prev=>prev.filter((_,idx)=>idx!==i));

  // ── Barcode scanner ───────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (scannerRef.current) { try { scannerRef.current.reset(); } catch {} scannerRef.current = null; }
  }, []);

  const stopScanner = () => {
    if (scannerRef.current) { try { scannerRef.current.reset(); } catch {} scannerRef.current = null; }
    setScanning(false);
  };

  const startScanner = async () => {
    setScanning(true);
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const codeReader = new BrowserMultiFormatReader();
      scannerRef.current = codeReader;
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (!devices || devices.length === 0) throw new Error('No camera found');
      const backCamera = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1];
      let scanned = false;
      await codeReader.decodeFromVideoDevice(backCamera?.deviceId, videoRef.current, (result) => {
        if (result && !scanned) {
          scanned = true;
          const code = result.getText();
          stopScanner();
          // Try to find matching product by barcode
          const match = products.find(p => p.barcode === code);
          if (match) {
            setD('isNew', false);
            setD('productId', match.id);
          } else {
            // Not found — switch to new product mode, pre-fill barcode
            setD('isNew', true);
            setNP('barcode', code);
          }
        }
      });
    } catch (err) {
      alert('Camera error: ' + (err.message || 'Could not access camera'));
      setScanning(false);
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async e => {
    e.preventDefault();
    if(!items.length){alert('Add at least one item.');return;}
    setBusy(true);
    try {
      const resolvedItems=[];
      for(const it of items){
        if(it.isNew){
          const np=it.newProduct;
          await onAddProduct({...np,price:+np.price,cost:+np.cost,stock:0,minStock:3,productCode:np.productCode||''});
          resolvedItems.push({isNew:true,newProductName:np.name,qty:+it.qty,unitCost:+np.cost,newCost:+np.cost,newPrice:+np.price,lineTotal:(+np.cost)*(+it.qty)});
        } else {
          const prod=products.find(p=>p.id===it.productId);
          const cost=+(it.newCost||prod?.cost||0);
          const price=+(it.newPrice||prod?.price||0);
          resolvedItems.push({productId:it.productId,productName:prod?.name||'',productCode:prod?.productCode||'',qty:+it.qty,unitCost:cost,newCost:cost,newPrice:price,lineTotal:cost*(+it.qty)});
        }
      }
      await onReceive({supplierId,supplierName:supplier?.name||'',invoiceNo,date:receiveDate,dueDate,notes,items:resolvedItems,totalCost,
        payment:{status:payStatus,amount:+(payAmount||0),method:payMethod,date:payDate}});
      setDone(true);
    } catch(err){alert('Error: '+err.message);}
    setBusy(false);
  };

  // ── Receipt view modal ─────────────────────────────────────────────────────
  if(viewReceipt) return (
    <div className="bs-recv">
      <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px'}}>
        <button className="bs-sec" onClick={()=>setViewReceipt(null)}>← Back</button>
        <h2 className="bs-h2" style={{margin:0}}>Receipt #{viewReceipt.invoiceNo||viewReceipt.id?.slice(-6)?.toUpperCase()}</h2>
      </div>
      <div className="bs-recv-header-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="bs-fg"><label>Supplier</label><p style={{fontSize:'14px',color:'#f0f4ff'}}>{viewReceipt.supplierName||'—'}</p></div>
        <div className="bs-fg"><label>Invoice No.</label><p style={{fontSize:'14px',color:'#f0f4ff'}}>{viewReceipt.invoiceNo||'—'}</p></div>
        <div className="bs-fg"><label>Received</label><p style={{fontSize:'14px',color:'#f0f4ff'}}>{viewReceipt.date?.slice(0,10)||'—'}</p></div>
        <div className="bs-fg"><label>Due Date</label><p style={{fontSize:'14px',color:viewReceipt.dueDate?'#fb923c':'#64748b'}}>{viewReceipt.dueDate||'—'}</p></div>
      </div>
      <div className="bs-recv-section-label">Items</div>
      <div className="bs-tbl-wrap">
        <table className="bs-tbl">
          <thead><tr><th>Product</th><th>Qty</th><th>Unit Cost</th><th>Line Total</th><th>Sale Price</th></tr></thead>
          <tbody>
            {(viewReceipt.items||[]).map((it,i)=>(
              <tr key={i}>
                <td>{it.productName||it.newProductName}{it.productCode&&<span className="bs-isbn"> ({it.productCode})</span>}</td>
                <td>{it.qty}</td>
                <td>{fmt(it.unitCost)}</td>
                <td><strong>{fmt(it.lineTotal||it.unitCost*it.qty)}</strong></td>
                <td>{fmt(it.newPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bs-recv-total-bar" style={{marginTop:'12px'}}>
        <span className="bs-muted">Total Invoice Cost</span>
        <span className="bs-recv-total">{fmt(viewReceipt.totalCost)}</span>
      </div>
      {viewReceipt.payment && (
        <div className="bs-recv-payment" style={{marginTop:'12px'}}>
          <p className="bs-recv-section-label" style={{padding:'0 0 8px'}}>💳 Payment</p>
          <div style={{display:'flex',gap:'24px',flexWrap:'wrap'}}>
            <div><span className="bs-muted" style={{fontSize:'12px'}}>Status</span>
              <p style={{fontWeight:700,color:viewReceipt.payment.status==='paid'?'#34d399':viewReceipt.payment.status==='partial'?'#fb923c':'#f87171'}}>
                {viewReceipt.payment.status==='paid'?'✅ Paid':viewReceipt.payment.status==='partial'?'🔶 Partial':'⏳ Unpaid'}
              </p></div>
            {viewReceipt.payment.status!=='unpaid'&&<>
              <div><span className="bs-muted" style={{fontSize:'12px'}}>Paid Amount</span><p style={{fontWeight:700,color:'#34d399'}}>{fmt(viewReceipt.payment.amount)}</p></div>
              <div><span className="bs-muted" style={{fontSize:'12px'}}>Method</span><p>{viewReceipt.payment.method}</p></div>
              <div><span className="bs-muted" style={{fontSize:'12px'}}>Payment Date</span><p>{viewReceipt.payment.date}</p></div>
            </>}
            {viewReceipt.payment.status==='partial'&&<div><span className="bs-muted" style={{fontSize:'12px'}}>Outstanding</span><p style={{fontWeight:700,color:'#f87171'}}>{fmt(viewReceipt.totalCost-viewReceipt.payment.amount)}</p></div>}
            {viewReceipt.payment.status==='unpaid'&&viewReceipt.dueDate&&<div><span className="bs-muted" style={{fontSize:'12px'}}>Due</span><p style={{color:'#fb923c'}}>{viewReceipt.dueDate}</p></div>}
          </div>
        </div>
      )}
      {viewReceipt.notes&&<p className="bs-muted" style={{marginTop:'12px',fontSize:'13px'}}>Notes: {viewReceipt.notes}</p>}
    </div>
  );

  // ── History view ──────────────────────────────────────────────────────────────
  if(view==='history') return (
    <div className="bs-recv">
      <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px',flexWrap:'wrap'}}>
        <h2 className="bs-h2" style={{margin:0,flex:1}}>📋 Receipt History</h2>
        <button className="bs-add" onClick={()=>setView('form')}>+ New Receipt</button>
      </div>
      {!stockReceipts?.length&&<p className="bs-muted" style={{padding:'32px',textAlign:'center'}}>No receipts yet.</p>}
      <div className="bs-tbl-wrap">
        <table className="bs-tbl">
          <thead><tr><th>Date</th><th>Supplier</th><th>Invoice No.</th><th>Items</th><th>Total Cost</th><th>Payment</th><th>Due Date</th><th>Action</th></tr></thead>
          <tbody>
            {(stockReceipts||[]).map(r=>(
              <tr key={r.id}>
                <td className="bs-muted" style={{fontSize:'12px'}}>{r.date?.slice(0,10)}</td>
                <td>{r.supplierName||'—'}</td>
                <td className="bs-isbn">{r.invoiceNo||'—'}</td>
                <td>{r.items?.length||0} items</td>
                <td><strong className="bs-green">{fmt(r.totalCost)}</strong></td>
                <td><span style={{fontSize:'12px',fontWeight:600,color:r.payment?.status==='paid'?'#34d399':r.payment?.status==='partial'?'#fb923c':'#f87171'}}>
                  {r.payment?.status==='paid'?'✅ Paid':r.payment?.status==='partial'?'🔶 Partial':'⏳ Unpaid'}
                </span></td>
                <td style={{color:r.dueDate?'#fb923c':'#64748b',fontSize:'12px'}}>{r.dueDate||'—'}</td>
                <td><button className="bs-act edit" onClick={()=>setViewReceipt(r)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── Done screen ────────────────────────────────────────────────────────────────
  if(done) return (
    <div className="bs-recv-done">
      <div style={{fontSize:'48px',marginBottom:'12px'}}>✅</div>
      <h2 style={{marginBottom:'8px'}}>Stock Received!</h2>
      <p className="bs-muted" style={{marginBottom:'4px'}}>Invoice: <strong>{invoiceNo||'—'}</strong> · Supplier: <strong>{supplier?.name||'—'}</strong></p>
      <p className="bs-muted" style={{marginBottom:'4px'}}>{items.length} items · Total cost: <strong style={{color:'#34d399'}}>{fmt(totalCost)}</strong></p>
      <p className="bs-muted" style={{marginBottom:'20px'}}>Payment: <strong>{payStatus}</strong></p>
      <div style={{display:'flex',gap:'10px',justifyContent:'center'}}>
        <button className="bs-sec" onClick={()=>setView('history')}>View History</button>
        <button className="bs-pri" onClick={()=>{setDone(false);setItems([]);setInvoiceNo('');setNotes('');setDraft({...BLANK_ITEM});}}>+ Receive Another</button>
      </div>
    </div>
  );

  // ── Main form ──────────────────────────────────────────────────────────────────
  const draftProd = !draft.isNew ? products.find(p=>p.id===draft.productId) : null;
  const draftCostDiff  = draftProd&&draft.newCost  ? +(draft.newCost)  - +(draftProd.cost||0)  : 0;
  const draftPriceDiff = draftProd&&draft.newPrice ? +(draft.newPrice) - +(draftProd.price||0) : 0;

  return (
    <div className="bs-recv">
      <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px',flexWrap:'wrap'}}>
        <h2 className="bs-h2" style={{margin:0,flex:1}}>📥 Receive Stock</h2>
        <button className="bs-sec" onClick={()=>setView('history')}>📋 History</button>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Compact header — 1 row on desktop, wraps on mobile */}
        <div className="bs-recv-header-compact">
          <div className="bs-fg">
            <label>Supplier</label>
            <select value={supplierId} onChange={e=>setSupplierId(e.target.value)}>
              <option value="">— optional —</option>
              {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {supplier&&(
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginTop:'4px'}}>
                {supplier.phone&&<a href={`tel:${supplier.phone}`} className="bs-sup-call-btn" style={{fontSize:'11px'}}>📞 {supplier.phone}</a>}
                {supplier.salesReps?.filter(r=>r.phone).map((r,i)=><a key={i} href={`tel:${r.phone}`} className="bs-sup-call-btn" style={{fontSize:'11px'}}>📞 {r.name}</a>)}
              </div>
            )}
          </div>
          <div className="bs-fg">
            <label>Invoice / Memo No.</label>
            <input value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} placeholder="INV-001"/>
          </div>
          <div className="bs-fg">
            <label>Receive Date *</label>
            <input type="date" value={receiveDate} onChange={e=>setReceiveDate(e.target.value)} required/>
          </div>
          <div className="bs-fg">
            <label>Payment Due Date</label>
            <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/>
          </div>
          <div className="bs-fg">
            <label>Notes</label>
            <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Condition, missing, etc."/>
          </div>
        </div>

        {/* Add item section */}
        <div className="bs-recv-section-label">📦 Add Item</div>
        <div className="bs-recv-add-item-box">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
            <label style={{fontSize:'12px',color:'#64748b',display:'flex',alignItems:'center',gap:'6px',cursor:'pointer'}}>
              <input type="checkbox" checked={draft.isNew} onChange={e=>setD('isNew',e.target.checked)}/>
              New product not in system
            </label>
            <button type="button" className="bs-sec" style={{padding:'5px 10px',fontSize:'12px'}} onClick={startScanner} title="Scan barcode">
              📷 Scan Barcode
            </button>
          </div>

          {/* Barcode scanner camera */}
          {scanning && (
            <div style={{marginBottom:'10px',background:'#0d1526',borderRadius:'8px',overflow:'hidden'}}>
              <video ref={videoRef} style={{width:'100%',maxHeight:'220px',objectFit:'cover',borderRadius:'8px 8px 0 0',border:'2px solid #38bdf8'}} muted playsInline autoPlay/>
              <p style={{textAlign:'center',fontSize:'12px',color:'#94a3b8',padding:'6px'}}>
                Point camera at barcode — auto-selects product or pre-fills new ·
                <button type="button" className="bs-link-btn" onClick={stopScanner} style={{marginLeft:'6px'}}>Cancel</button>
              </p>
            </div>
          )}

          {draft.isNew ? (
            <div>
              <div className="bs-recv-item-row">
                <div className="bs-fg"><label>Product Code</label><input value={draft.newProduct.productCode||''} onChange={e=>setNP('productCode',e.target.value)} placeholder="CBL-001"/></div>
                <div className="bs-fg"><label>Name *</label><input value={draft.newProduct.name||''} onChange={e=>setNP('name',e.target.value)} placeholder="Product name"/></div>
                <div className="bs-fg"><label>Company</label><input value={draft.newProduct.company||''} onChange={e=>setNP('company',e.target.value)} placeholder="Brand"/></div>
                <div className="bs-fg"><label>Size</label><input value={draft.newProduct.size||''} onChange={e=>setNP('size',e.target.value)} placeholder="500ml"/></div>
                <div className="bs-fg"><label>Barcode</label><input value={draft.newProduct.barcode||''} onChange={e=>setNP('barcode',e.target.value)} placeholder="Scanned or manual"/></div>
              </div>
              <div className="bs-recv-item-row">
                <div className="bs-fg"><label>Category</label><select value={draft.newProduct.category} onChange={e=>setNP('category',e.target.value)}>{Object.keys(CATEGORIES).map(c=><option key={c}>{c}</option>)}</select></div>
                <div className="bs-fg"><label>Unit</label><select value={draft.newProduct.unit} onChange={e=>setNP('unit',e.target.value)}>{['ea','kg','g','L','ml','box','pack','bag','btl','ream','roll','dozen'].map(u=><option key={u}>{u}</option>)}</select></div>
                <div className="bs-fg"><label>Cost Price *</label><input type="number" step="0.01" value={draft.newProduct.cost||''} onChange={e=>setNP('cost',e.target.value)} placeholder="0.00"/></div>
                <div className="bs-fg"><label>Sale Price *</label><input type="number" step="0.01" value={draft.newProduct.price||''} onChange={e=>setNP('price',e.target.value)} placeholder="0.00"/></div>
                <div className="bs-fg"><label>Qty *</label><input type="number" min="1" value={draft.qty||''} onChange={e=>setD('qty',e.target.value)} placeholder="0"/></div>
              </div>
            </div>
          ) : (
            <div className="bs-recv-item-row">
              <div className="bs-fg" style={{flex:2}}>
                <label>Select Product *</label>
                <select value={draft.productId} onChange={e=>setD('productId',e.target.value)}>
                  <option value="">— choose product —</option>
                  {Object.keys(CATEGORIES).map(cat=>{
                    const cp=products.filter(p=>p.category===cat);
                    if(!cp.length) return null;
                    return <optgroup key={cat} label={CATEGORIES[cat].icon+' '+cat}>{cp.map(p=><option key={p.id} value={p.id}>{productLabel(p)} (stock: {p.stock})</option>)}</optgroup>;
                  })}
                </select>
                {draftProd&&<span className="bs-muted" style={{fontSize:'11px'}}>Current: cost {fmt(draftProd.cost||0)} · sale {fmt(draftProd.price)}</span>}
              </div>
              <div className="bs-fg"><label>Qty *</label><input type="number" min="1" value={draft.qty||''} onChange={e=>setD('qty',e.target.value)} placeholder="0"/></div>
              <div className="bs-fg">
                <label>New Cost</label>
                <input type="number" step="0.01" value={draft.newCost||''} onChange={e=>setD('newCost',e.target.value)} placeholder={draftProd?(draftProd.cost||0).toFixed(2):'0.00'}/>
                {draftCostDiff!==0&&<span style={{fontSize:'10px',color:draftCostDiff>0?'#f87171':'#34d399'}}>{draftCostDiff>0?'▲ +':'▼ '}{fmt(draftCostDiff)}</span>}
              </div>
              <div className="bs-fg">
                <label>New Sale Price</label>
                <input type="number" step="0.01" value={draft.newPrice||''} onChange={e=>setD('newPrice',e.target.value)} placeholder={draftProd?(draftProd.price||0).toFixed(2):'0.00'}/>
                {draftPriceDiff!==0&&<span style={{fontSize:'10px',color:draftPriceDiff>0?'#34d399':'#f87171'}}>{draftPriceDiff>0?'▲ +':'▼ '}{fmt(draftPriceDiff)}</span>}
              </div>
            </div>
          )}

          <button type="button" className="bs-add" style={{marginTop:'10px'}} onClick={addItemToList} disabled={!canAddItem()}>
            + Add to List
          </button>
        </div>

        {/* Items list */}
        {items.length>0&&(
          <>
            <div className="bs-recv-section-label">📋 Items ({items.length})</div>
            <div className="bs-tbl-wrap">
              <table className="bs-tbl">
                <thead><tr><th>Product</th><th>Qty</th><th>Unit Cost</th><th>New Sale</th><th>Line Total</th><th></th></tr></thead>
                <tbody>
                  {items.map((it,i)=>(
                    <tr key={i}>
                      <td><p className="bs-ttl">{it._label}</p>{it.isNew&&<span className="bs-isbn" style={{color:'#38bdf8'}}>NEW</span>}</td>
                      <td>{it.qty}</td>
                      <td>{fmt(it._unitCost)}</td>
                      <td>{fmt(it._unitPrice)}</td>
                      <td><strong className="bs-green">{fmt(it._unitCost*(+it.qty))}</strong></td>
                      <td><button type="button" className="bs-act del" style={{padding:'4px 8px'}} onClick={()=>removeItem(i)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bs-recv-total-bar">
              <span className="bs-muted">Total Invoice Cost ({items.length} items)</span>
              <span className="bs-recv-total">{fmt(totalCost)}</span>
            </div>

            {/* Payment */}
            <div className="bs-recv-section-label">💳 Payment</div>
            <div className="bs-recv-payment">
              <div className="bs-recv-pay-status">
                {['unpaid','partial','paid'].map(s=>(
                  <button key={s} type="button" className={'bs-pay-status-btn'+(payStatus===s?' active':'')} onClick={()=>setPayStatus(s)}>
                    {s==='unpaid'?'⏳ Unpaid':s==='partial'?'🔶 Partial':'✅ Paid'}
                  </button>
                ))}
              </div>
              {payStatus!=='unpaid'&&(
                <div className="bs-recv-item-row" style={{marginTop:'12px'}}>
                  <div className="bs-fg"><label>Amount Paid</label><input type="number" step="0.01" value={payAmount} onChange={e=>setPayAmount(e.target.value)} placeholder={totalCost.toFixed(2)}/></div>
                  <div className="bs-fg"><label>Method</label><select value={payMethod} onChange={e=>setPayMethod(e.target.value)}>{['Bank Transfer','Cash','Cheque','Credit Card','EFTPOS'].map(m=><option key={m}>{m}</option>)}</select></div>
                  <div className="bs-fg"><label>Payment Date</label><input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)}/></div>
                </div>
              )}
              {payStatus==='partial'&&payAmount&&<div className="bs-recv-balance">Outstanding: <strong style={{color:'#fb923c'}}>{fmt(totalCost-+payAmount)}</strong></div>}
            </div>

            <div className="bs-fa" style={{marginTop:'16px'}}>
              <button type="submit" className="bs-pri" style={{padding:'13px 32px',fontSize:'15px'}} disabled={busy}>
                {busy?'Saving…':'✅ Confirm Receipt'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
