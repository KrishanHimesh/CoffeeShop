// ─────────────────────────────────────────────────────────────────────────────
// SharedCatalogue.js  —  Browse & import shared platform product catalogue
//
// Reads from: /sharedCatalogues/{industry}/products/
// Allows owners/managers to import products into their store with one click.
// Already-imported products are shown as "In your store".
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import {
  collection, onSnapshot, query, orderBy,
} from 'firebase/firestore';
import { db } from './firebase';

export default function SharedCatalogue({ industry, existingProducts, onImport, settings }) {
  const [catalogueProducts, setCatalogueProducts] = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [search,            setSearch]            = useState('');
  const [filterCategory,    setFilterCategory]    = useState('All');
  const [importing,         setImporting]         = useState({}); // { productId: true }
  const [imported,          setImported]          = useState({}); // { productId: true } — session only

  // Load shared catalogue for this industry
  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      query(
        collection(db, 'sharedCatalogues', industry || 'general', 'products'),
        orderBy('name')
      ),
      snap => {
        setCatalogueProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      err => {
        console.error('[SharedCatalogue]', err.message);
        setLoading(false);
      }
    );
    return unsub;
  }, [industry]);

  // Build set of existing product names for "already in store" check
  const existingNames = new Set(
    (existingProducts || []).map(p => p.name?.toLowerCase().trim())
  );
  const existingBarcodes = new Set(
    (existingProducts || []).map(p => p.barcode).filter(Boolean)
  );

  const isInStore = (p) => {
    if (imported[p.id]) return true;
    if (p.barcode && existingBarcodes.has(p.barcode)) return true;
    return existingNames.has(p.name?.toLowerCase().trim());
  };

  // Categories present in this catalogue
  const allCategories = ['All', ...new Set(catalogueProducts.map(p => p.category).filter(Boolean))];

  // Filter
  const filtered = catalogueProducts.filter(p => {
    const matchSearch = !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.company?.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode?.includes(search);
    const matchCat = filterCategory === 'All' || p.category === filterCategory;
    return matchSearch && matchCat;
  });

  const handleImport = async (product) => {
    if (isInStore(product)) return;
    setImporting(prev => ({ ...prev, [product.id]: true }));
    try {
      await onImport(product);
      setImported(prev => ({ ...prev, [product.id]: true }));
    } catch (e) {
      console.error('[SharedCatalogue] Import failed:', e);
    }
    setImporting(prev => { const n = { ...prev }; delete n[product.id]; return n; });
  };

  const handleImportAll = async () => {
    const toImport = filtered.filter(p => !isInStore(p));
    for (const p of toImport) {
      await handleImport(p);
    }
  };

  const sym = settings?.currencySymbol || '$';

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#64748b' }}>
      <div className="bs-spinner"/> <span style={{ marginLeft: 12 }}>Loading shared catalogue…</span>
    </div>
  );

  return (
    <div className="bs-inventory" style={{ padding: '0 4px' }}>

      {/* Header */}
      <div className="bs-inv-bar">
        <div>
          <h2 className="bs-h2" style={{ margin: 0 }}>📋 Shared Product Catalogue</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
            Industry: <strong style={{ color: '#38bdf8' }}>{industry || 'general'}</strong>
            {' · '}{catalogueProducts.length} products available
          </p>
        </div>
        <button
          className="bs-add"
          onClick={handleImportAll}
          disabled={filtered.filter(p => !isInStore(p)).length === 0}
          title="Import all filtered products into your store"
        >
          ↓ Import All ({filtered.filter(p => !isInStore(p)).length})
        </button>
      </div>

      {/* Info banner */}
      <div style={{
        background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.15)',
        borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#94a3b8',
      }}>
        💡 These are platform-curated products for your industry. Import any product into your store
        with one click — then set your own prices and stock levels in Inventory.
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          className="bs-search"
          placeholder="Search by name, brand, or barcode…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          style={{ padding: '8px 12px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, color: '#f1f5f9', fontSize: 13 }}
        >
          {allCategories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Product grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#475569', padding: '60px 24px' }}>
          {catalogueProducts.length === 0
            ? 'No products in this catalogue yet. Ask your platform admin to add some.'
            : 'No products match your search.'}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 12,
        }}>
          {filtered.map(p => {
            const inStore    = isInStore(p);
            const isImporting = importing[p.id];
            return (
              <div
                key={p.id}
                style={{
                  background: inStore ? 'rgba(74,222,128,.04)' : '#0d1526',
                  border: `1px solid ${inStore ? 'rgba(74,222,128,.2)' : '#1e293b'}`,
                  borderRadius: 10,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  position: 'relative',
                }}
              >
                {/* Category badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
                    color: '#475569', background: '#0f172a', padding: '2px 8px', borderRadius: 8,
                  }}>
                    {p.category || 'General'}
                  </span>
                  {inStore && (
                    <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>✓ In your store</span>
                  )}
                </div>

                <p style={{ margin: 0, fontWeight: 600, color: '#f1f5f9', fontSize: 14, lineHeight: 1.3 }}>
                  {p.name}
                </p>

                {p.company && (
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{p.company}</p>
                )}

                {p.size && (
                  <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>{p.size}</p>
                )}

                <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 10, color: '#475569' }}>SUGGESTED PRICE</p>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#38bdf8' }}>
                      {sym} {Number(p.price || 0).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 10, color: '#475569' }}>SUGGESTED COST</p>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#94a3b8' }}>
                      {sym} {Number(p.cost || 0).toFixed(2)}
                    </p>
                  </div>
                  {p.unit && (
                    <div>
                      <p style={{ margin: 0, fontSize: 10, color: '#475569' }}>UNIT</p>
                      <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>{p.unit}</p>
                    </div>
                  )}
                </div>

                {p.barcode && (
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#334155', fontFamily: 'monospace' }}>
                    {p.barcode}
                  </p>
                )}

                <button
                  onClick={() => handleImport(p)}
                  disabled={inStore || isImporting}
                  style={{
                    marginTop: 8,
                    padding: '8px',
                    borderRadius: 7,
                    border: 'none',
                    background: inStore
                      ? 'rgba(74,222,128,.1)'
                      : isImporting ? 'rgba(56,189,248,.1)' : '#0ea5e9',
                    color: inStore ? '#4ade80' : isImporting ? '#38bdf8' : '#fff',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: inStore ? 'default' : 'pointer',
                    transition: 'all .15s',
                  }}
                >
                  {isImporting ? 'Importing…' : inStore ? '✓ Already in store' : '↓ Import to my store'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <p style={{ textAlign: 'center', color: '#334155', fontSize: 12, marginTop: 20 }}>
          Showing {filtered.length} of {catalogueProducts.length} products ·{' '}
          {filtered.filter(p => !isInStore(p)).length} not yet in your store
        </p>
      )}
    </div>
  );
}
