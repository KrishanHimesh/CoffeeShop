// ─────────────────────────────────────────────────────────────────────────────
// useStore.js  —  ENTERPRISE VERSION
//
// Key changes from original:
//  1. Every Firestore collection is scoped to /stores/{tenantId}/
//  2. Photos go to Firebase Storage, not Firestore documents
//  3. tenantId + plan come from Auth custom claims (set by Cloud Function)
//  4. Receipt counter is per-tenant
//  5. Settings live at /stores/{tenantId}/settings/main
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp, setDoc, getDoc, getDocs,
  runTransaction,
} from 'firebase/firestore';
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
// Storage is not used — photos are stored as base64 directly in Firestore
// This works without Firebase Storage being enabled in your region.
import { db, auth } from './firebase';

// ── localStorage helpers ──────────────────────────────────────────────────────
const lsLoad = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSave = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const lsDel  = (k)    => { try { localStorage.removeItem(k); } catch {} };
const uid    = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ── Firestore usage tracker ───────────────────────────────────────────────────
// Logs every Firestore read/write/delete to /usageLog/{tenantId}/events/
// Each event: { uid, email, name, op, collection, count, ts }
// Admin reads these to show per-user Firebase usage in real time.
// Operations are batched in a 3-second buffer to avoid excessive writes.

let _buf      = [];        // pending events
let _bufTimer = null;
let _meta     = { tenantId:null, uid:null, email:null, name:null };

export function setUsageMeta(meta) {
  _meta = { ..._meta, ...meta };
}

export function trackUsage(op, collectionName, count = 1) {
  if (!_meta.tenantId || !_meta.uid) return;
  _buf.push({ op, col: collectionName, count, ts: Date.now() });
  clearTimeout(_bufTimer);
  _bufTimer = setTimeout(_flush, 3000);
}

async function _flush() {
  if (!_buf.length || !_meta.tenantId) return;
  const events = [..._buf];
  _buf = [];

  // Aggregate by op+collection
  const agg = {};
  events.forEach(e => {
    const k = `${e.op}:${e.col}`;
    if (!agg[k]) agg[k] = { op: e.op, col: e.col, count: 0 };
    agg[k].count += e.count;
  });

  const today = new Date().toISOString().slice(0, 10);

  try {
    // Import dynamically to avoid circular deps
    const { doc, setDoc, increment: inc, serverTimestamp } = await import('firebase/firestore');
    const { db } = await import('./firebase');

    // Per-user daily rollup: /usageLog/{tenantId}/users/{uid}_{date}
    const userRef = doc(db, 'usageLog', _meta.tenantId, 'users', `${_meta.uid}_${today}`);
    const userUpdate = {
      uid:      _meta.uid,
      email:    _meta.email,
      name:     _meta.name,
      tenantId: _meta.tenantId,
      date:     today,
      updatedAt: serverTimestamp(),
    };
    Object.values(agg).forEach(({ op, col, count }) => {
      userUpdate[`ops_${op}_${col}`] = inc(count);
      userUpdate[`total_${op}`]      = inc(count);
      userUpdate['total_ops']         = inc(count);
    });
    await setDoc(userRef, userUpdate, { merge: true });

    // Per-tenant daily rollup: /usageLog/{tenantId}/daily/{date}
    const dayRef = doc(db, 'usageLog', _meta.tenantId, 'daily', today);
    const dayUpdate = { tenantId: _meta.tenantId, date: today, updatedAt: serverTimestamp() };
    Object.values(agg).forEach(({ op, count }) => {
      dayUpdate[`total_${op}`] = inc(count);
      dayUpdate['total_ops']    = inc(count);
    });
    await setDoc(dayRef, dayUpdate, { merge: true });

  } catch { /* never crash the app for tracking */ }
}

// ── Tenant-scoped collection helpers ─────────────────────────────────────────
// All data lives under /stores/{tenantId}/collectionName
const tenantCol = (tenantId, name)       => collection(db, 'stores', tenantId, name);
const tenantDoc = (tenantId, name, id)   => doc(db, 'stores', tenantId, name, id);
const settingsDoc = (tenantId)           => doc(db, 'stores', tenantId, 'settings', 'main');
const metaDoc     = (tenantId, id)       => doc(db, 'stores', tenantId, 'meta', id);

// ── Photo helpers (Firebase Storage, NOT Firestore) ───────────────────────────
//
// Photos are stored at:  stores/{tenantId}/products/{productId}.jpg
// This costs ~$0.026/GB/month vs Firestore's per-read billing on large docs.

// ── Photo helpers — base64 stored directly in Firestore ──────────────────────
// Firebase Storage is not required. Photos are resized and stored as base64
// strings inside the product document. Max ~100KB per photo after resize.

export function resizePhoto(base64DataUrl, maxPx = 600, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxPx || h > maxPx) {
        if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else        { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = base64DataUrl;
  });
}

// Save photo: resize and return the base64 string (stored in Firestore doc)
export async function saveProductPhoto(tenantId, productId, base64DataUrl) {
  const resized = await resizePhoto(base64DataUrl);
  lsSave(`bs2_photo_${productId}`, resized);
  return resized; // caller stores this in Firestore
}

// Delete photo from cache
export async function deleteProductPhoto(tenantId, productId) {
  lsDel(`bs2_photo_${productId}`);
}

// Load photo from localStorage cache
export async function loadProductPhoto(tenantId, productId) {
  return lsLoad(`bs2_photo_${productId}`, null);
}

// ── Receipt counter (per-tenant, atomic transaction) ──────────────────────────
const getNextReceiptNum = async (tenantId, prefix = 'UN', startNum = 100) => {
  try {
    const ref = metaDoc(tenantId, 'receiptCounter');
    let next;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists() ? (snap.data().value || (startNum - 1)) : (startNum - 1);
      next = current + 1;
      tx.set(ref, { value: next });
    });
    return `${prefix}${next}`;
  } catch {
    const local = lsLoad(`bs2_receiptCounter_${tenantId}`, startNum - 1);
    const next = local + 1;
    lsSave(`bs2_receiptCounter_${tenantId}`, next);
    return `${prefix}${next}`;
  }
};

// ── Default settings ──────────────────────────────────────────────────────────
export const DEFAULT_SETTINGS = {
  businessName:    'My Coffee Shop',
  companyName:     '',
  currency:        'AUD',
  currencySymbol:  '$',
  gstEnabled:      true,
  gstRate:         10,
  receiptFooter:   'Thank you, see you again soon!',
  receiptFooter2:  '',
  receiptPrefix:   'CS',
  receiptStartNum: 100,
  dashFont:        'syne',
  customCategories:[],
  theme:           'dark',
  fontSize:        'md',
  industry:        'cafe', // used to load the right shared catalogue
};

// ── Seed products (only used on first boot if Firestore is empty) ─────────────
// ── Reusable modifier groups ───────────────────────────────────────────────────
const SIZE_MODS = {
  name: 'Size', required: true,
  options: [
    { name: 'Small',   priceDelta: 0 },
    { name: 'Regular', priceDelta: 0.50 },
    { name: 'Large',   priceDelta: 1.00 },
  ],
};
const MILK_MODS = {
  name: 'Milk', required: false,
  options: [
    { name: 'Full Cream', priceDelta: 0 },
    { name: 'Skim',       priceDelta: 0 },
    { name: 'Soy',        priceDelta: 0.60 },
    { name: 'Oat',        priceDelta: 0.60 },
    { name: 'Almond',     priceDelta: 0.60 },
    { name: 'Lactose-Free', priceDelta: 0.60 },
  ],
};
const SHOT_MODS = {
  name: 'Extra Shot', required: false,
  options: [
    { name: 'None',  priceDelta: 0 },
    { name: '+1 Shot', priceDelta: 0.70 },
    { name: '+2 Shots', priceDelta: 1.40 },
  ],
};
const SYRUP_MODS = {
  name: 'Syrup', required: false,
  options: [
    { name: 'None',      priceDelta: 0 },
    { name: 'Vanilla',   priceDelta: 0.60 },
    { name: 'Caramel',   priceDelta: 0.60 },
    { name: 'Hazelnut',  priceDelta: 0.60 },
  ],
};
const ICE_MODS = {
  name: 'Ice Level', required: false,
  options: [
    { name: 'Regular Ice', priceDelta: 0 },
    { name: 'Less Ice',    priceDelta: 0 },
    { name: 'No Ice',      priceDelta: 0 },
  ],
};

const HOT_COFFEE_MODS = [SIZE_MODS, MILK_MODS, SHOT_MODS, SYRUP_MODS];
const COLD_COFFEE_MODS = [SIZE_MODS, MILK_MODS, SHOT_MODS, SYRUP_MODS, ICE_MODS];
const TEA_MODS = [SIZE_MODS, MILK_MODS];

const SEED_PRODUCTS = [
  // ── Raw Ingredients (isIngredient: true — hidden from POS, used in recipes) ─
  { id:'ing1', name:'Coffee Beans (Bulk)',  company:'Roastery', size:'', category:'Other', price:0, cost:36.00, stock:5,    minStock:1, unit:'kg', barcode:'', isIngredient:true },   // $36/kg ≈ $9/250g bag
  { id:'ing2', name:'Full Cream Milk',      company:'Dairy Co', size:'', category:'Other', price:0, cost:1.80,  stock:20,   minStock:4, unit:'L',  barcode:'', isIngredient:true },
  { id:'ing3', name:'Oat Milk',             company:'Dairy Co', size:'', category:'Other', price:0, cost:3.60,  stock:12,   minStock:3, unit:'L',  barcode:'', isIngredient:true },
  { id:'ing4', name:'Soy Milk',             company:'Dairy Co', size:'', category:'Other', price:0, cost:3.20,  stock:12,   minStock:3, unit:'L',  barcode:'', isIngredient:true },
  { id:'ing5', name:'Chocolate Syrup',      company:'Monin',    size:'', category:'Other', price:0, cost:14.00, stock:2,    minStock:1, unit:'L',  barcode:'', isIngredient:true },
  { id:'ing6', name:'Vanilla Syrup',        company:'Monin',    size:'', category:'Other', price:0, cost:14.00, stock:2,    minStock:1, unit:'L',  barcode:'', isIngredient:true },
  { id:'ing7', name:'Chai Concentrate',     company:'House Made',size:'', category:'Other', price:0, cost:9.00,  stock:3,    minStock:1, unit:'L',  barcode:'', isIngredient:true },
  { id:'ing8', name:'Tea Bags',             company:'Twinings', size:'', category:'Other', price:0, cost:0.20,  stock:200,  minStock:30, unit:'ea', barcode:'', isIngredient:true },
  { id:'ing9', name:'Disposable Cups (12oz)', company:'EcoPack', size:'', category:'Other', price:0, cost:0.25, stock:300,  minStock:50, unit:'ea', barcode:'', isIngredient:true },

  // ── Coffee — Hot ──────────────────────────────────────────────────────────
  // Recipe quantities are PER serving (base size, before modifier scaling — modifiers add their own price delta separately).
  { id:'c1',  name:'Espresso',          company:'House Blend', size:'',       category:'Coffee', price:4.00, cost:0.65, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:[SIZE_MODS, SHOT_MODS],
    recipe:[ {productId:'ing1', qty:18, unit:'g'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  { id:'c2',  name:'Long Black',        company:'House Blend', size:'',       category:'Coffee', price:4.50, cost:0.90, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:[SIZE_MODS, SHOT_MODS],
    recipe:[ {productId:'ing1', qty:18, unit:'g'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  { id:'c3',  name:'Flat White',        company:'House Blend', size:'',       category:'Coffee', price:4.80, cost:1.13, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:HOT_COFFEE_MODS,
    recipe:[ {productId:'ing1', qty:18, unit:'g'}, {productId:'ing2', qty:150, unit:'ml'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  { id:'c4',  name:'Latte',             company:'House Blend', size:'',       category:'Coffee', price:4.80, cost:1.31, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:HOT_COFFEE_MODS,
    recipe:[ {productId:'ing1', qty:18, unit:'g'}, {productId:'ing2', qty:200, unit:'ml'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  { id:'c5',  name:'Cappuccino',        company:'House Blend', size:'',       category:'Coffee', price:4.80, cost:1.13, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:HOT_COFFEE_MODS,
    recipe:[ {productId:'ing1', qty:18, unit:'g'}, {productId:'ing2', qty:150, unit:'ml'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  { id:'c6',  name:'Mocha',             company:'House Blend', size:'',       category:'Coffee', price:5.20, cost:1.86, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:HOT_COFFEE_MODS,
    recipe:[ {productId:'ing1', qty:18, unit:'g'}, {productId:'ing2', qty:150, unit:'ml'}, {productId:'ing5', qty:30, unit:'ml'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  { id:'c7',  name:'Macchiato',         company:'House Blend', size:'',       category:'Coffee', price:4.50, cost:0.83, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:[SIZE_MODS, MILK_MODS, SHOT_MODS],
    recipe:[ {productId:'ing1', qty:18, unit:'g'}, {productId:'ing2', qty:30, unit:'ml'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  { id:'c8',  name:'Piccolo',           company:'House Blend', size:'',       category:'Coffee', price:4.20, cost:0.83, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:[MILK_MODS, SHOT_MODS],
    recipe:[ {productId:'ing1', qty:18, unit:'g'}, {productId:'ing2', qty:60, unit:'ml'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  { id:'c9',  name:'Hot Chocolate',     company:'House Blend', size:'',       category:'Coffee', price:4.80, cost:1.39, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:[SIZE_MODS, MILK_MODS],
    recipe:[ {productId:'ing2', qty:200, unit:'ml'}, {productId:'ing5', qty:40, unit:'ml'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  { id:'c10', name:'Chai Latte',        company:'House Blend', size:'',       category:'Coffee', price:5.00, cost:1.71, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:[SIZE_MODS, MILK_MODS],
    recipe:[ {productId:'ing7', qty:60, unit:'ml'}, {productId:'ing2', qty:180, unit:'ml'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  // ── Coffee — Iced ─────────────────────────────────────────────────────────
  { id:'c11', name:'Iced Latte',        company:'House Blend', size:'',       category:'Coffee', price:5.50, cost:1.31, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:COLD_COFFEE_MODS,
    recipe:[ {productId:'ing1', qty:18, unit:'g'}, {productId:'ing2', qty:200, unit:'ml'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  { id:'c12', name:'Iced Long Black',   company:'House Blend', size:'',       category:'Coffee', price:5.00, cost:0.90, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:[SIZE_MODS, SHOT_MODS, ICE_MODS],
    recipe:[ {productId:'ing1', qty:18, unit:'g'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  { id:'c13', name:'Cold Brew',         company:'House Blend', size:'',       category:'Coffee', price:5.80, cost:1.49, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:[SIZE_MODS, MILK_MODS, ICE_MODS],
    recipe:[ {productId:'ing1', qty:25, unit:'g'}, {productId:'ing2', qty:100, unit:'ml'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  { id:'c14', name:'Iced Mocha',        company:'House Blend', size:'',       category:'Coffee', price:5.90, cost:1.86, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:COLD_COFFEE_MODS,
    recipe:[ {productId:'ing1', qty:18, unit:'g'}, {productId:'ing2', qty:150, unit:'ml'}, {productId:'ing5', qty:30, unit:'ml'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  // ── Tea ───────────────────────────────────────────────────────────────────
  { id:'t1',  name:'English Breakfast Tea', company:'Twinings', size:'',     category:'Tea',     price:4.00, cost:0.45, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:TEA_MODS,
    recipe:[ {productId:'ing8', qty:1, unit:'ea'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  { id:'t2',  name:'Earl Grey Tea',     company:'Twinings',     size:'',     category:'Tea',     price:4.00, cost:0.45, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:TEA_MODS,
    recipe:[ {productId:'ing8', qty:1, unit:'ea'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  { id:'t3',  name:'Green Tea',         company:'Twinings',     size:'',     category:'Tea',     price:4.00, cost:0.45, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:[SIZE_MODS],
    recipe:[ {productId:'ing8', qty:1, unit:'ea'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  { id:'t4',  name:'Peppermint Tea',    company:'Twinings',     size:'',     category:'Tea',     price:4.00, cost:0.45, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:[SIZE_MODS],
    recipe:[ {productId:'ing8', qty:1, unit:'ea'}, {productId:'ing9', qty:1, unit:'ea'} ] },
  // ── Cold Drinks ───────────────────────────────────────────────────────────
  { id:'d1',  name:'Iced Tea',          company:'House Made',   size:'',     category:'Cold Drinks', price:4.50, cost:0.90, stock:999, minStock:0, unit:'cup', barcode:'', modifierGroups:[SIZE_MODS, ICE_MODS] },
  { id:'d2',  name:'Fresh Orange Juice',company:'House Made',   size:'',     category:'Cold Drinks', price:6.00, cost:2.00, stock:30,  minStock:5, unit:'cup', barcode:'' },
  { id:'d3',  name:'Sparkling Water',   company:'San Pellegrino',size:'500ml',category:'Cold Drinks', price:4.50, cost:1.50, stock:24,  minStock:6, unit:'btl', barcode:'8001090019006' },
  { id:'d4',  name:'Still Water',       company:'Mount Franklin',size:'500ml',category:'Cold Drinks', price:3.50, cost:1.00, stock:24,  minStock:6, unit:'btl', barcode:'9300601456789' },
  { id:'d5',  name:'Coke',              company:'Coca-Cola',    size:'375ml',category:'Cold Drinks', price:4.00, cost:1.40, stock:24,  minStock:6, unit:'can', barcode:'9300675024235' },
  { id:'d6',  name:'Smoothie',          company:'House Made',   size:'',     category:'Cold Drinks', price:7.50, cost:2.50, stock:20,  minStock:4, unit:'cup', barcode:'' },
  // ── Pastries ──────────────────────────────────────────────────────────────
  { id:'p1',  name:'Croissant',         company:'Bakery',       size:'',     category:'Pastries', price:5.00, cost:1.80, stock:18, minStock:4, unit:'ea', barcode:'' },
  { id:'p2',  name:'Almond Croissant',  company:'Bakery',       size:'',     category:'Pastries', price:6.00, cost:2.20, stock:12, minStock:3, unit:'ea', barcode:'' },
  { id:'p3',  name:'Pain au Chocolat',  company:'Bakery',       size:'',     category:'Pastries', price:5.50, cost:2.00, stock:14, minStock:3, unit:'ea', barcode:'' },
  { id:'p4',  name:'Banana Bread',      company:'Bakery',       size:'slice',category:'Pastries', price:5.50, cost:1.70, stock:10, minStock:3, unit:'ea', barcode:'' },
  { id:'p5',  name:'Blueberry Muffin',  company:'Bakery',       size:'',     category:'Pastries', price:5.00, cost:1.60, stock:14, minStock:3, unit:'ea', barcode:'' },
  { id:'p6',  name:'Scone with Jam & Cream', company:'Bakery',  size:'',     category:'Pastries', price:6.50, cost:2.10, stock:10, minStock:3, unit:'ea', barcode:'' },
  // ── Food ──────────────────────────────────────────────────────────────────
  { id:'f1',  name:'Ham & Cheese Toastie', company:'Kitchen',   size:'',     category:'Food', price:9.50,  cost:3.20, stock:20, minStock:4, unit:'ea', barcode:'' },
  { id:'f2',  name:'Avocado Toast',     company:'Kitchen',      size:'',     category:'Food', price:13.50, cost:4.50, stock:15, minStock:3, unit:'ea', barcode:'' },
  { id:'f3',  name:'BLT Sandwich',      company:'Kitchen',      size:'',     category:'Food', price:11.00, cost:3.80, stock:15, minStock:3, unit:'ea', barcode:'' },
  { id:'f4',  name:'Caesar Salad',      company:'Kitchen',      size:'',     category:'Food', price:14.00, cost:5.00, stock:10, minStock:2, unit:'ea', barcode:'' },
  { id:'f5',  name:'Bacon & Egg Roll',  company:'Kitchen',      size:'',     category:'Food', price:10.50, cost:3.50, stock:15, minStock:3, unit:'ea', barcode:'' },
  { id:'f6',  name:'Quiche of the Day', company:'Kitchen',      size:'',     category:'Food', price:8.50,  cost:2.80, stock:10, minStock:2, unit:'ea', barcode:'' },
  // ── Desserts ──────────────────────────────────────────────────────────────
  { id:'de1', name:'Chocolate Brownie', company:'Bakery',       size:'',     category:'Desserts', price:5.50, cost:1.80, stock:12, minStock:3, unit:'ea', barcode:'' },
  { id:'de2', name:'Cheesecake Slice',  company:'Bakery',       size:'',     category:'Desserts', price:6.50, cost:2.30, stock:10, minStock:2, unit:'ea', barcode:'' },
  { id:'de3', name:'Carrot Cake Slice', company:'Bakery',       size:'',     category:'Desserts', price:6.50, cost:2.30, stock:10, minStock:2, unit:'ea', barcode:'' },
  // ── Retail (beans, merch) ────────────────────────────────────────────────
  { id:'r1',  name:'House Blend Beans 250g', company:'Roastery',size:'250g', category:'Retail', price:16.00, cost:8.00, stock:25, minStock:5, unit:'bag', barcode:'9421234567890' },
  { id:'r2',  name:'Single Origin Beans 250g', company:'Roastery',size:'250g',category:'Retail', price:19.00, cost:10.00, stock:15, minStock:4, unit:'bag', barcode:'9421234567891' },
  { id:'r3',  name:'Reusable Cup',      company:'KeepCup',      size:'12oz', category:'Retail', price:22.00, cost:9.00, stock:20, minStock:4, unit:'ea', barcode:'9421234567892' },
];


// ─────────────────────────────────────────────────────────────────────────────
// useStore — main hook
// ─────────────────────────────────────────────────────────────────────────────
export function useStore() {
  const [user,            setUser]           = useState(null);
  const [profile,         setProfile]        = useState(null);
  const [tenantId,        setTenantId]       = useState(null);
  const [plan,            setPlan]           = useState(null); // 'starter'|'pro'|'business'
  const [products,        setProducts]       = useState(() => lsLoad('bs2_products',        SEED_PRODUCTS));
  const [photos,          setPhotos]         = useState(() => lsLoad('bs2_photosIndex',     {}));
  const [sales,           setSales]          = useState(() => lsLoad('bs2_sales',           []));
  const [workers,         setWorkers]        = useState(() => lsLoad('bs2_workers',         []));
  const [settings,        setSettings]       = useState(() => lsLoad('bs2_settings',        DEFAULT_SETTINGS));
  const [suppliers,       setSuppliers]      = useState(() => lsLoad('bs2_suppliers',       []));
  const [stockReceipts,   setStockReceipts]  = useState(() => lsLoad('bs2_stockReceipts',   []));
  const [creditCustomers, setCreditCustomers]= useState(() => lsLoad('bs2_creditCustomers', []));
  const [activityLog,     setActivityLog]    = useState(() => lsLoad('bs2_activityLog',     []));
  const [loading,         setLoading]        = useState(true);
  const [fbActive,        setFbActive]       = useState(false);

  // ── Auth boot ─────────────────────────────────────────────────────────────
  // Robust multi-fallback strategy:
  //   1. Custom claims (Cloud Function — Blaze plan)
  //   2. /userTenants/{uid} Firestore lookup (written by LoginPage.js)
  //   3. If all fail, still let user stay logged in with minimal profile
  useEffect(() => {
    // bootedUid tracks which user we completed the boot sequence for.
    // Reset to null on each onAuthStateChanged call when user is null (logout),
    // so the NEXT login always runs the full boot even if same account logs back in.
    let bootedUid = null;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        // Skip if we already fully booted for this uid in this session
        // (prevents token-refresh events from re-running the boot)
        if (bootedUid === u.uid) {
          setLoading(false);
          return;
        }
        bootedUid = u.uid;
        setUser(u);
        try {
          console.log('[useStore] Auth boot for:', u.email, u.uid);

          // Step 1 — custom claims (don't force refresh to avoid loops)
          const tokenResult = await u.getIdTokenResult(false);
          const claims      = tokenResult.claims;
          let tid           = claims.tenantId || null;
          let userPlan      = claims.plan     || 'trial';
          let role          = claims.role     || 'owner';

          // Step 2 — /userTenants/{uid} lookup
          if (!tid) {
            try {
              const utSnap = await getDoc(doc(db, 'userTenants', u.uid));
              if (utSnap.exists()) {
                const ut = utSnap.data();
                tid      = ut.tenantId || null;
                userPlan = ut.plan     || 'trial';
                role     = ut.role     || 'owner';
                console.log('[useStore] Found tenantId via userTenants:', tid);
              }
            } catch (e) {
              console.warn('[useStore] userTenants read failed:', e.message);
            }
          }

          // Step 2b — always fetch the LIVE plan + expiry from the store doc
          // This ensures workers always reflect the owner's current subscription,
          // even if the owner upgraded after the worker account was created.
          // Also checks if the license has expired and downgrades if so.
          if (tid) {
            try {
              const storeSnap = await getDoc(doc(db, 'stores', tid));
              if (storeSnap.exists()) {
                const storeData    = storeSnap.data();
                const livePlan     = storeData.plan;
                const licenseExpiry = storeData.licenseExpiry;

                // Check expiry
                let isExpired = false;
                if (licenseExpiry) {
                  const expiryDate = licenseExpiry.toDate ? licenseExpiry.toDate() : new Date(licenseExpiry);
                  isExpired = expiryDate < new Date();
                  if (isExpired) {
                    console.warn('[useStore] License expired on', expiryDate.toLocaleDateString());
                  }
                }

                if (livePlan && !isExpired) {
                  userPlan = livePlan;
                  console.log('[useStore] Live plan from store doc:', livePlan);
                } else if (isExpired) {
                  userPlan = 'none'; // Force to no plan — will show subscription wall
                  console.warn('[useStore] License expired — showing subscription wall');
                }
              }
            } catch (e) {
              console.warn('[useStore] Store plan read failed:', e.message);
            }
          }

          // Step 3 — if still no tenantId, build a minimal profile so user gets in
          // They'll see the app but Firestore listeners won't fire (no tenantId)
          if (!tid) {
            console.warn('[useStore] No tenantId found — using minimal profile');
            const fallbackProfile = {
              id:       u.uid,
              name:     u.displayName || u.email?.split('@')[0] || 'User',
              email:    u.email,
              role:     'owner',
              plan:     'trial',
              tenantId: null,
            };
            setProfile(fallbackProfile);
            setPlan('trial');
            setFbActive(false);
            setLoading(false);
            return;
          }

          setTenantId(tid);
          setPlan(userPlan);

          // Load worker profile
          try {
            const snap = await getDoc(tenantDoc(tid, 'workers', u.uid));
            if (snap.exists()) {
              const p = { id: u.uid, ...snap.data(), role, plan: userPlan, tenantId: tid };
              setProfile(p);
              lsSave('bs2_session', p);
              setFbActive(true);
              setUsageMeta({ tenantId: tid, uid: u.uid, email: u.email, name: p.name });
              console.log('[useStore] Profile loaded:', p.name, 'role:', p.role);
            } else {
              // Worker doc missing but we have tenantId — build profile from auth
              console.warn('[useStore] Worker doc missing, building from auth token');
              const p = {
                id:       u.uid,
                name:     u.displayName || u.email?.split('@')[0] || 'Owner',
                email:    u.email,
                role,
                plan:     userPlan,
                tenantId: tid,
              };
              setProfile(p);
              lsSave('bs2_session', p);
              setFbActive(true);
              setUsageMeta({ tenantId: tid, uid: u.uid, email: u.email, name: p.name });
            }
          } catch (workerErr) {
            console.warn('[useStore] Worker doc read failed:', workerErr.message);
            // Firestore rules may be blocking — still let user in
            const p = {
              id:       u.uid,
              name:     u.displayName || u.email?.split('@')[0] || 'Owner',
              email:    u.email,
              role,
              plan:     userPlan,
              tenantId: tid,
            };
            setProfile(p);
            setFbActive(true);
            setUsageMeta({ tenantId: tid, uid: u.uid, email: u.email, name: p.name });
          }

        } catch (err) {
          console.error('[useStore] Auth boot error:', err.message);
          // Even on error — keep user logged in with basic profile
          const p = {
            id:       u.uid,
            name:     u.displayName || u.email?.split('@')[0] || 'User',
            email:    u.email,
            role:     'owner',
            plan:     'trial',
            tenantId: null,
          };
          setProfile(p);
          setPlan('trial');
          setFbActive(false);
        }
      } else {
        // User signed out — reset bootedUid so the next login runs the full boot
        bootedUid = null;
        setUser(null); setProfile(null);
        setTenantId(null); setPlan(null);
        setFbActive(false);
        lsDel('bs2_session');
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── Firestore real-time listeners (tenant-scoped) ─────────────────────────
  useEffect(() => {
    if (!fbActive || !tenantId) return;
    const tid    = tenantId;
    const unsubs = [];

    // Products — photoUrl is base64 stored directly in the doc
    unsubs.push(onSnapshot(tenantCol(tid, 'products'), snap => {
      trackUsage('read', 'products', snap.docs.length);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProducts(data);
      lsSave('bs2_products', data);
      // Rebuild photos index from product docs
      const photoIndex = {};
      data.forEach(p => {
        if (p.photoUrl && p.photoUrl.startsWith('data:')) {
          photoIndex[p.id] = p.photoUrl;
          lsSave(`bs2_photo_${p.id}`, p.photoUrl);
        }
      });
      setPhotos(prev => {
        const merged = { ...prev, ...photoIndex };
        lsSave('bs2_photosIndex', merged);
        return merged;
      });
    }));

    // Photos index — built from product docs (photoUrl field = base64 string)
    // No productPhotos sub-collection needed — photos live in product docs.
    // The photos state is populated by the products listener above.

    // Sales
    unsubs.push(onSnapshot(
      query(tenantCol(tid, 'sales'), orderBy('createdAt', 'desc')),
      snap => {
        trackUsage('read', 'sales', snap.docs.length);
        const data = snap.docs.map(d => {
          const raw = d.data();
          return { ...raw, id: d.id, date: raw.createdAt?.toDate?.()?.toISOString() || raw.date || new Date().toISOString() };
        });
        setSales(data); lsSave('bs2_sales', data);
      }
    ));

    // Workers
    unsubs.push(onSnapshot(tenantCol(tid, 'workers'), snap => {
      trackUsage('read', 'workers', snap.docs.length);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setWorkers(data); lsSave('bs2_workers', data);
    }));

    // Suppliers
    unsubs.push(onSnapshot(tenantCol(tid, 'suppliers'), snap => {
      trackUsage('read', 'suppliers', snap.docs.length);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSuppliers(data); lsSave('bs2_suppliers', data);
    }));

    // Credit customers
    unsubs.push(onSnapshot(tenantCol(tid, 'creditCustomers'), snap => {
      trackUsage('read', 'creditCustomers', snap.docs.length);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCreditCustomers(data); lsSave('bs2_creditCustomers', data);
    }));

    // Stock receipts
    unsubs.push(onSnapshot(
      query(tenantCol(tid, 'stockReceipts'), orderBy('createdAt', 'desc')),
      snap => {
        const data = snap.docs.map(d => ({
          id: d.id, ...d.data(),
          date: d.data().createdAt?.toDate?.()?.toISOString() || d.data().date,
        }));
        setStockReceipts(data); lsSave('bs2_stockReceipts', data);
      }
    ));

    // Settings (per-tenant)
    unsubs.push(onSnapshot(settingsDoc(tid), snap => {
      if (snap.exists()) {
        const s = { ...DEFAULT_SETTINGS, ...snap.data() };
        setSettings(s); lsSave('bs2_settings', s);
      }
    }));

    return () => unsubs.forEach(u => u());
  }, [fbActive, tenantId]);

  // ── Auth actions ──────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'Invalid email or password' };
    }
  }, []);

  const logout = useCallback(async () => {
    try { await signOut(auth); } catch {}
    lsSave('bs2_session', null);
    setUser(null); setProfile(null);
    setTenantId(null); setPlan(null);
    setFbActive(false);
  }, []);

  // Force-refresh the auth token to pick up new plan claims after a Stripe payment
  const refreshClaims = useCallback(async () => {
    if (!auth.currentUser) return;
    const tokenResult = await auth.currentUser.getIdTokenResult(true);
    const newPlan = tokenResult.claims.plan || 'none';
    setPlan(newPlan);
    setProfile(prev => prev ? { ...prev, plan: newPlan } : prev);
  }, []);

  // ── Activity Log ──────────────────────────────────────────────────────────
  const logActivity = useCallback((action, details, extra = {}) => {
    if (!tenantId) return;
    const entry = {
      id: uid(), action, details,
      workerName: profile?.name || 'System',
      workerRole: profile?.role || 'unknown',
      timestamp:  new Date().toISOString(),
      ...extra,
    };
    setActivityLog(prev => {
      const updated = [entry, ...prev].slice(0, 500);
      lsSave('bs2_activityLog', updated);
      if (fbActive) {
        trackUsage('write', 'activityLog');
        addDoc(tenantCol(tenantId, 'activityLog'), {
          ...entry, createdAt: serverTimestamp(),
        }).catch(() => {});
      }
      return updated;
    });
  }, [profile, fbActive, tenantId]);

  // ── Products ──────────────────────────────────────────────────────────────
  const addProduct = useCallback(async (data) => {
    if (!tenantId) throw new Error('Not authenticated');
    const { photoUrl: rawPhoto, ...rest } = data;

    // Resize photo and store as base64 directly in the product doc
    let photoBase64 = '';
    if (rawPhoto && rawPhoto.startsWith('data:')) {
      photoBase64 = await saveProductPhoto(tenantId, 'temp', rawPhoto);
    }

    trackUsage('write', 'products');
    const docRef = await addDoc(tenantCol(tenantId, 'products'), {
      ...rest,
      photoUrl:  photoBase64, // base64 stored directly — no Storage needed
      createdAt: serverTimestamp(),
    });

    // Update local photo cache with the real doc ID
    if (photoBase64) {
      lsSave(`bs2_photo_${docRef.id}`, photoBase64);
      setPhotos(prev => {
        const next = { ...prev, [docRef.id]: photoBase64 };
        lsSave('bs2_photosIndex', next); return next;
      });
    }

    logActivity('ADD_PRODUCT', `Added product: ${data.name}`, { productName: data.name, category: data.category });
  }, [tenantId, logActivity]);

  const updateProduct = useCallback(async (id, data) => {
    if (!tenantId) throw new Error('Not authenticated');
    const { createdAt, id: _id, photoUrl: rawPhoto, ...clean } = data;

    if (rawPhoto && rawPhoto.startsWith('data:')) {
      // New/changed photo — resize and store as base64 in Firestore doc
      const resized = await saveProductPhoto(tenantId, id, rawPhoto);
      clean.photoUrl = resized;
      setPhotos(prev => {
        const next = { ...prev, [id]: resized };
        lsSave('bs2_photosIndex', next); return next;
      });
    } else if (rawPhoto === '') {
      // Photo removed
      deleteProductPhoto(tenantId, id);
      clean.photoUrl = '';
      setPhotos(prev => {
        const next = { ...prev }; delete next[id];
        lsSave('bs2_photosIndex', next); return next;
      });
    } else {
      // Photo unchanged — keep existing
      clean.photoUrl = rawPhoto || data.photoUrl || '';
    }

    trackUsage('write', 'products');
    await updateDoc(tenantDoc(tenantId, 'products', id), clean);
    logActivity('UPDATE_PRODUCT', `Updated product: ${data.name || id}`, { productId: id, productName: data.name });
  }, [tenantId, logActivity]);

  const deleteProduct = useCallback(async (id) => {
    if (!tenantId) throw new Error('Not authenticated');
    trackUsage('delete', 'products');
    await deleteDoc(tenantDoc(tenantId, 'products', id));
    deleteProductPhoto(tenantId, id); // just clears localStorage cache
    setPhotos(prev => {
      const next = { ...prev }; delete next[id];
      lsSave('bs2_photosIndex', next); return next;
    });
    logActivity('DELETE_PRODUCT', `Deleted product ID: ${id}`, { productId: id });
  }, [tenantId, logActivity]);

  // ── Import from shared catalogue ──────────────────────────────────────────
  // Copies a product from sharedCatalogues/{industry}/products into this tenant's store.
  const importSharedProduct = useCallback(async (sharedProduct) => {
    if (!tenantId) throw new Error('Not authenticated');
    const { id: _id, ...productData } = sharedProduct;
    await addDoc(tenantCol(tenantId, 'products'), {
      ...productData,
      importedFromCatalogue: true,
      createdAt: serverTimestamp(),
    });
    logActivity('IMPORT_PRODUCT', `Imported from catalogue: ${sharedProduct.name}`, { productName: sharedProduct.name });
  }, [tenantId, logActivity]);

  // ── Sales ─────────────────────────────────────────────────────────────────
  const recordSale = useCallback(async (saleData) => {
    if (!tenantId) throw new Error('Not authenticated');
    const prefix    = settings?.receiptPrefix   || 'UN';
    const startNum  = settings?.receiptStartNum || 100;
    const receiptId = await getNextReceiptNum(tenantId, prefix, startNum);
    const sale = {
      ...saleData, receiptId,
      workerId:   profile?.id   || 'unknown',
      workerName: profile?.name || 'Unknown',
      date:       new Date().toISOString(),
      createdAt:  serverTimestamp(),
    };
    trackUsage('write', 'sales');
    await addDoc(tenantCol(tenantId, 'sales'), sale);

    // Unit conversion so recipe quantities (g/ml) match ingredient stock units (kg/L etc.)
    const UNIT_TO_BASE = { g:0.001, kg:1, ml:0.001, L:1, ea:1, box:1, pack:1, bag:1, btl:1, ream:1, roll:1, dozen:1 };

    // Accumulate total stock deltas across all sold items before writing, in case
    // the same ingredient is used in multiple sold items in one sale.
    const stockDeltas = {}; // productId -> qty to subtract (in that product's own unit)

    for (const item of saleData.items) {
      const prod = products.find(p => p.id === item.id);
      if (!prod) continue;
      const hasRecipe = prod.recipe && prod.recipe.length > 0;
      // Only deduct the item's own stock if it's not recipe-based — recipe items
      // are "made to order" from ingredients, so their own stock count isn't meaningful.
      if (!hasRecipe) {
        stockDeltas[prod.id] = (stockDeltas[prod.id] || 0) + item.qty;
      }

      if (hasRecipe) {
        for (const r of prod.recipe) {
          const ing = products.find(p => p.id === r.productId);
          if (!ing) continue;
          const ingUnitBase    = UNIT_TO_BASE[ing.unit] ?? 1;
          const recipeUnitBase = UNIT_TO_BASE[r.unit]   ?? 1;
          const qtyInIngUnit = (r.qty * recipeUnitBase / ingUnitBase) * item.qty;
          stockDeltas[ing.id] = (stockDeltas[ing.id] || 0) + qtyInIngUnit;
        }
      }
    }

    for (const [productId, deltaQty] of Object.entries(stockDeltas)) {
      const prod = products.find(p => p.id === productId);
      if (!prod) continue;
      await updateDoc(tenantDoc(tenantId, 'products', productId), {
        stock: Math.max(0, prod.stock - deltaQty),
      });
    }
    return receiptId;
  }, [tenantId, profile, products, settings]);

  // ── Workers ───────────────────────────────────────────────────────────────
  const addWorker = useCallback(async (data) => {
    if (!tenantId) throw new Error('Not authenticated');
    try {
      // Note: createUserWithEmailAndPassword signs in the new user, which
      // briefly changes auth.currentUser. For production, use the Admin SDK
      // via a Cloud Function instead to avoid this side-effect.
      const cred = await createUserWithEmailAndPassword(auth, data.email, data.password);
      trackUsage('write', 'workers');
      await setDoc(tenantDoc(tenantId, 'workers', cred.user.uid), {
        name: data.name, email: data.email, role: data.role,
        phone: data.phone || '', tenantId, createdAt: serverTimestamp(),
      });
    } catch (err) {
      // Fallback — store worker record without Firebase Auth account
      console.error('[addWorker]', err.message);
      await addDoc(tenantCol(tenantId, 'workers'), {
        ...data, tenantId, createdAt: serverTimestamp(),
      });
    }
  }, [tenantId]);

  const updateWorker = useCallback(async (id, data) => {
    if (!tenantId) throw new Error('Not authenticated');
    const { createdAt, id: _id, password, ...clean } = data;
    trackUsage('write', 'workers');
    await updateDoc(tenantDoc(tenantId, 'workers', id), clean);
    if (id === profile?.id) {
      const refreshed = { ...profile, ...clean };
      lsSave('bs2_session', refreshed); setProfile(refreshed);
    }
  }, [tenantId, profile]);

  const deleteWorker = useCallback(async (id) => {
    if (!tenantId) throw new Error('Not authenticated');
    trackUsage('delete', 'workers');
    await deleteDoc(tenantDoc(tenantId, 'workers', id));
  }, [tenantId]);

  // ── Suppliers ─────────────────────────────────────────────────────────────
  const addSupplier = useCallback(async (data) => {
    if (!tenantId) throw new Error('Not authenticated');
    if (fbActive) { trackUsage('write', 'suppliers'); await addDoc(tenantCol(tenantId, 'suppliers'), { ...data, createdAt: serverTimestamp() }); }
    else setSuppliers(prev => { const u=[...prev,{...data,id:'sup'+uid()}]; lsSave('bs2_suppliers',u); return u; });
  }, [tenantId, fbActive]);

  const updateSupplier = useCallback(async (id, data) => {
    if (!tenantId) throw new Error('Not authenticated');
    if (fbActive) { trackUsage('write', 'suppliers'); const { id:_id, createdAt, ...clean }=data; await updateDoc(tenantDoc(tenantId,'suppliers',id), clean); }
    else setSuppliers(prev => { const u=prev.map(s=>s.id===id?{...s,...data}:s); lsSave('bs2_suppliers',u); return u; });
  }, [tenantId, fbActive]);

  const deleteSupplier = useCallback(async (id) => {
    if (!tenantId) throw new Error('Not authenticated');
    if (fbActive) { trackUsage('delete', 'suppliers'); await deleteDoc(tenantDoc(tenantId, 'suppliers', id)); }
    else setSuppliers(prev => { const u=prev.filter(s=>s.id!==id); lsSave('bs2_suppliers',u); return u; });
  }, [tenantId, fbActive]);

  // ── Stock Receipts ────────────────────────────────────────────────────────
  const receiveStock = useCallback(async (receiptData) => {
    if (!tenantId) throw new Error('Not authenticated');
    const receipt = {
      ...receiptData, createdAt: serverTimestamp(),
      date: new Date().toISOString(), receivedBy: profile?.name || 'Unknown',
    };
    if (fbActive) {
      trackUsage('write', 'stockReceipts');
      await addDoc(tenantCol(tenantId, 'stockReceipts'), receipt);
      for (const item of receiptData.items) {
        const prod = products.find(p => p.id === item.productId);
        if (prod) {
          await updateDoc(tenantDoc(tenantId, 'products', item.productId), {
            stock: prod.stock + item.qty,
            cost:  item.newCost  || prod.cost,
            price: item.newPrice || prod.price,
            lastTopup: receiptData.date || new Date().toISOString().slice(0,10),
            lastMemo:  receiptData.invoiceNo,
          });
        }
      }
    }
    logActivity('RECEIVE_STOCK',
      `Received stock: invoice ${receiptData.invoiceNo||'—'} · ${receiptData.items.length} item(s)`,
      { invoiceNo: receiptData.invoiceNo, supplierName: receiptData.supplierName });
  }, [tenantId, fbActive, profile, products, logActivity]);

  // ── Credit Customers ──────────────────────────────────────────────────────
  const addCreditCustomer = useCallback(async (data) => {
    if (!tenantId) throw new Error('Not authenticated');
    if (fbActive) { trackUsage('write', 'creditCustomers'); await addDoc(tenantCol(tenantId, 'creditCustomers'), { ...data, createdAt: serverTimestamp(), balance: 0 }); }
    else setCreditCustomers(prev => { const u=[...prev,{...data,id:'cc'+uid(),balance:0}]; lsSave('bs2_creditCustomers',u); return u; });
    logActivity('ADD_CUSTOMER', `Added credit customer: ${data.name}`, { customerName: data.name });
  }, [tenantId, fbActive, logActivity]);

  const updateCreditCustomer = useCallback(async (id, data) => {
    if (!tenantId) throw new Error('Not authenticated');
    if (fbActive) { trackUsage('write', 'creditCustomers'); const { id:_id, createdAt, ...clean }=data; await updateDoc(tenantDoc(tenantId,'creditCustomers',id), clean); }
    else setCreditCustomers(prev => { const u=prev.map(c=>c.id===id?{...c,...data}:c); lsSave('bs2_creditCustomers',u); return u; });
  }, [tenantId, fbActive]);

  const deleteCreditCustomer = useCallback(async (id) => {
    if (!tenantId) throw new Error('Not authenticated');
    const cust = creditCustomers.find(c => c.id === id);
    if (fbActive) { trackUsage('delete', 'creditCustomers'); await deleteDoc(tenantDoc(tenantId, 'creditCustomers', id)); }
    else setCreditCustomers(prev => { const u=prev.filter(c=>c.id!==id); lsSave('bs2_creditCustomers',u); return u; });
    logActivity('DELETE_CUSTOMER', `Removed credit customer: ${cust?.name||id}`, { customerName: cust?.name });
  }, [tenantId, fbActive, creditCustomers, logActivity]);

  // ── Settings ──────────────────────────────────────────────────────────────
  const saveSettings = useCallback(async (data) => {
    if (!tenantId) throw new Error('Not authenticated');
    trackUsage('write', 'settings');
    await setDoc(settingsDoc(tenantId), data, { merge: true });
    setSettings(prev => ({ ...prev, ...data }));
    lsSave('bs2_settings', { ...settings, ...data });
    logActivity('SAVE_SETTINGS', 'Settings updated', {});
  }, [tenantId, settings, logActivity]);

  return {
    user, profile, tenantId, plan, loading, fbActive,
    products, photos,
    sales, workers, settings,
    login, logout, refreshClaims,
    addProduct, updateProduct, deleteProduct, importSharedProduct,
    recordSale,
    addWorker, updateWorker, deleteWorker,
    saveSettings,
    suppliers, addSupplier, updateSupplier, deleteSupplier,
    stockReceipts, receiveStock,
    creditCustomers, addCreditCustomer, updateCreditCustomer, deleteCreditCustomer,
    activityLog,
  };
}
