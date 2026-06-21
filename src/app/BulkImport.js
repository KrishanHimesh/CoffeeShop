import React, { useState, useRef } from 'react';
import { CATEGORIES as BASE_CATEGORIES } from './constants';

// Photos exported as separate files in a ZIP — not embedded in CSV
// photoBase64 column stores the full base64 data URI in the CSV cell itself.
// This makes photos fully self-contained in a single CSV file — no ZIP needed.
// Note: files with photos will be large (~100KB per photo). Use ZIP for many products.
const HEADERS = ['productCode','name','company','size','category','unit','barcode','price','cost','stock','minStock','photoBase64'];

// ── Same code-gen logic as ProductForm ────────────────────────────────────────
const CATEGORY_CODES = { Books:'BK', Groceries:'GR', Supplies:'SP', Other:'OT' };
function slugPart(str, len) {
  return (str||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,len).padEnd(len,'X');
}
function buildBaseCode(category, company, name, size) {
  const cat = CATEGORY_CODES[category] || 'OT';
  return `${cat}-${slugPart(company,2)}-${slugPart(name,2)}-${slugPart(size,2)}`;
}
function autoGenerateCode(category, company, name, size, takenCodes) {
  const base = buildBaseCode(category, company, name, size);
  const taken = new Set(
    takenCodes.filter(c => c && c.startsWith(base+'-'))
      .map(c => parseInt(c.slice(base.length+1), 10)).filter(n => !isNaN(n))
  );
  let ver = 1; while (taken.has(ver)) ver++;
  return `${base}-${String(ver).padStart(2,'0')}`;
}

// ── Minimal pure-JS ZIP builder (no dependency needed) ────────────────────────
// Uses the browser's built-in CompressionStream where available, falls back to
// stored (uncompressed) entries. Produces a valid .zip the browser can download.
async function buildZip(files) {
  // files: [{ name: string, data: Uint8Array|string }]
  const u8 = s => new TextEncoder().encode(s);
  const crc32 = data => {
    let c = 0xFFFFFFFF;
    const table = [];
    for (let i = 0; i < 256; i++) {
      let r = i;
      for (let j = 0; j < 8; j++) r = (r & 1) ? (0xEDB88320 ^ (r >>> 1)) : (r >>> 1);
      table[i] = r;
    }
    for (const b of data) c = table[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const le16 = n => [(n & 0xFF), (n >> 8) & 0xFF];
  const le32 = n => [(n & 0xFF), (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF];
  const concat = arrays => {
    const len = arrays.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(len); let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
  };

  const centralDir = [];
  const parts = [];
  let offset = 0;

  for (const { name, data } of files) {
    const raw = typeof data === 'string' ? u8(data) : data;
    const crc = crc32(raw);
    const nameBytes = u8(name);
    const header = new Uint8Array([
      0x50,0x4B,0x03,0x04,  // local file signature
      20,0,                  // version needed
      0,0,                   // flags
      0,0,                   // compression (stored)
      0,0, 0,0,              // mod time, mod date
      ...le32(crc),
      ...le32(raw.length),   // compressed size = uncompressed (stored)
      ...le32(raw.length),
      ...le16(nameBytes.length),
      0,0,                   // extra field length
      ...nameBytes,
    ]);
    centralDir.push({ name: nameBytes, crc, size: raw.length, offset });
    parts.push(header, raw);
    offset += header.length + raw.length;
  }

  // Central directory
  const cdParts = centralDir.map(({ name: nb, crc, size, offset: off }) =>
    new Uint8Array([
      0x50,0x4B,0x01,0x02,  // central dir signature
      20,0,20,0,             // version made, version needed
      0,0,0,0,               // flags, compression
      0,0,0,0,               // mod time, date
      ...le32(crc),
      ...le32(size), ...le32(size),
      ...le16(nb.length), 0,0, 0,0, // filename len, extra, comment
      0,0, 0,0,              // disk start, internal attr
      0,0,0,0,               // external attr
      ...le32(off),
      ...nb,
    ])
  );
  const cdBytes = concat(cdParts);
  const cdOffset = offset;
  const eocd = new Uint8Array([
    0x50,0x4B,0x05,0x06,    // end of central dir signature
    0,0, 0,0,                // disk numbers
    ...le16(centralDir.length), ...le16(centralDir.length),
    ...le32(cdBytes.length), ...le32(cdOffset),
    0,0,                     // comment length
  ]);
  return concat([...parts, cdBytes, eocd]);
}

// ── Resize a base64/file to JPEG 600px ───────────────────────────────────────
function resizeToJpeg(src, maxPx = 600, quality = 0.80) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxPx || h > maxPx) {
        if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else        { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = src;
  });
}

// base64DataUrl → Uint8Array of the raw bytes (strips the data:…;base64, header)
function base64ToBytes(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const DUPE_MODES = [
  { id:'topup',  label:'Top-up stock',      desc:'Add the CSV qty on top of existing stock' },
  { id:'update', label:'Update all fields',  desc:'Overwrite price, cost, stock, and all details' },
  { id:'skip',   label:'Skip duplicates',    desc:'Leave existing products completely untouched' },
];

// ── Fuzzy category resolver ─────────────────────────────────────────────────
// Returns the exact key from CATEGORIES that best matches the input string.
// Tries: 1) exact  2) case-insensitive  3) trimmed  4) startsWith  5) includes
const resolveCategory = (input, validCats) => {
  if (!input) return null;
  const s = input.trim();
  // 1. exact
  if (validCats.includes(s)) return s;
  // 2. case-insensitive
  const lower = s.toLowerCase();
  const ci = validCats.find(c => c.toLowerCase() === lower);
  if (ci) return ci;
  // 3. starts-with (e.g. "Biscuites" → "Biscuits")
  const sw = validCats.find(c => c.toLowerCase().startsWith(lower) || lower.startsWith(c.toLowerCase()));
  if (sw) return sw;
  // 4. includes
  const inc = validCats.find(c => c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase()));
  if (inc) return inc;
  return null; // no match
};

// ── Duplicate detector ───────────────────────────────────────────────────────
const findExisting = (row, products) => {
  const code = (row.productcode || row.productCode || '').trim();
  if (code) {
    const byCode = products.find(p => (p.productCode||'').trim() === code);
    if (byCode) return byCode;
  }
  const name    = (row.name    || '').trim().toLowerCase();
  const company = (row.company || '').trim().toLowerCase();
  if (!name) return null;
  return products.find(p =>
    (p.name||'').trim().toLowerCase() === name &&
    (p.company||'').trim().toLowerCase() === company
  ) || null;
};

export default function BulkImport({ onAdd, onUpdate, products, photos = {}, onClose, categories: catProp }) {
  const CATEGORIES = catProp || BASE_CATEGORIES;
  const validCats  = Object.keys(CATEGORIES);

  const [tab,        setTab]        = useState('import');
  const [rows,       setRows]       = useState([]);
  const [rowPhotos,  setRowPhotos]  = useState({}); // { rowIndex: base64 } — photos attached per import row
  const [errors,     setErrors]     = useState([]);
  const [dupeMode,   setDupeMode]   = useState('topup');
  const [importing,  setImporting]  = useState(false);
  const [done,       setDone]       = useState({ added:0, updated:0, skipped:0 });
  const [finished,   setFinished]   = useState(false);
  const [exportFmt,  setExportFmt]  = useState('csv');
  const [exportCols, setExportCols] = useState(new Set(HEADERS));
  const [exporting,  setExporting]  = useState(false);
  const fileRef = useRef(null);

  // ── CSV parse ──────────────────────────────────────────────────────────────
  const parseCSV = text => {
    // Skip comment lines (start with #)
    const lines = text.trim().split('\n')
      .map(l => l.replace(/\r/g,''))
      .filter(l => !l.startsWith('#') && l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    return lines.slice(1).filter(l => l.trim()).map((line, i) => {
      const vals = []; let cur = '', inQ = false;
      for (const ch of line) {
        if (ch==='"') { inQ=!inQ; }
        else if (ch===',' && !inQ) { vals.push(cur.trim()); cur=''; }
        else cur += ch;
      }
      vals.push(cur.trim());
      const obj = {}; headers.forEach((h,idx) => { obj[h] = vals[idx] || ''; });
      return { _row: i+2, ...obj };
    });
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  // Category: try fuzzy resolve first — only error if truly unrecognisable
  const validate = rows => {
    const errs = [];
    rows.forEach(r => {
      if (!r.name?.trim())            errs.push(`Row ${r._row}: "name" is required`);
      if (r.price && isNaN(+r.price)) errs.push(`Row ${r._row}: price must be a number`);
      if (r.cost  && isNaN(+r.cost))  errs.push(`Row ${r._row}: cost must be a number`);
      if (r.stock && isNaN(+r.stock)) errs.push(`Row ${r._row}: stock must be a number`);
      if (r.category) {
        const resolved = resolveCategory(r.category, validCats);
        if (!resolved) {
          errs.push(`Row ${r._row}: category "${r.category}" not recognised — valid: ${validCats.join(', ')}`);
        }
      }
    });
    return errs;
  };

  // ── File handler ───────────────────────────────────────────────────────────
  const handleFile = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = parseCSV(ev.target.result);
      setErrors(validate(parsed));
      setRows(parsed);
      setRowPhotos({});   // reset per-row photos on new file
      setFinished(false);
      setDone({ added:0, updated:0, skipped:0 });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Row photo picker ────────────────────────────────────────────────────────
  const handleRowPhoto = (idx, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const src = ev.target.result;
      resizeToJpeg(src).then(resized => {
        setRowPhotos(prev => ({ ...prev, [idx]: resized }));
      });
    };
    reader.readAsDataURL(file);
  };

  const removeRowPhoto = idx => setRowPhotos(prev => { const n={...prev}; delete n[idx]; return n; });

  // ── Import ─────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (errors.length) return;
    setImporting(true);
    let added = 0, updated = 0, skipped = 0;
    // Build running list of codes for dedup during this import
    const runningCodes = products.map(p => p.productCode).filter(Boolean);

    for (const r of rows) {
      const existing    = findExisting(r, products);
      const resolvedCat = resolveCategory(r.category, validCats) || 'Other';
      // Use manually-picked photo, then fall back to base64 column in CSV
      const rawPhoto    = rowPhotos[rows.indexOf(r)] || r.photobase64 || r.photoBase64 || '';

      if (existing) {
        if (dupeMode === 'skip') {
          skipped++;
        } else if (dupeMode === 'topup') {
          await onUpdate(existing.id, { stock: (existing.stock||0) + (+(r.stock)||0) });
          updated++;
        } else if (dupeMode === 'update') {
          await onUpdate(existing.id, {
            name:     r.name     || existing.name,
            company:  r.company  || existing.company,
            size:     r.size     || existing.size,
            category: resolvedCat,
            unit:     r.unit     || existing.unit,
            barcode:  r.barcode  || existing.barcode,
            price:    +(r.price  || existing.price),
            cost:     +(r.cost   || existing.cost),
            stock:    +(r.stock  || existing.stock),
            minStock: +(r.minstock || r.minStock || existing.minStock),
            ...(rawPhoto ? { photoUrl: rawPhoto } : {}),
          });
          updated++;
        }
      } else {
        // Auto-generate code if none provided
        let code = (r.productcode || r.productCode || '').trim();
        if (!code) {
          code = autoGenerateCode(resolvedCat, r.company||'', r.name||'', r.size||'', runningCodes);
        }
        runningCodes.push(code); // prevent same-session duplicates
        await onAdd({
          productCode: code, name: r.name, company: r.company||'', size: r.size||'',
          category: resolvedCat, unit: r.unit||'ea', barcode: r.barcode||'',
          price: +(r.price||0), cost: +(r.cost||0), stock: +(r.stock||0),
          minStock: +(r.minstock||r.minStock||3),
          ...(rawPhoto ? { photoUrl: rawPhoto } : {}),
        });
        added++;
      }
      setDone({ added, updated, skipped });
    }
    setImporting(false); setFinished(true);
  };

  // ── Export as ZIP (CSV + photo files) ─────────────────────────────────────
  const sep        = exportFmt === 'tsv' ? '\t' : ',';
  const ext        = exportFmt === 'tsv' ? 'tsv' : 'csv';
  const escapeCell = v => {
    const s = String(v ?? '');
    return (exportFmt==='csv' && (s.includes(',') || s.includes('"') || s.includes('\n')))
      ? `"${s.replace(/"/g,'""')}"` : s;
  };

  const includePhotos   = exportCols.has('photos');     // export as ZIP with separate image files
  const includeBase64   = exportCols.has('photoBase64'); // embed base64 directly in CSV cell

  const handleExport = async () => {
    setExporting(true);
    const cols    = HEADERS.filter(h => exportCols.has(h));
    const dateStr = new Date().toISOString().slice(0,10);
    const zipFiles = [];

    // CSV header
    const extraCols = [
      ...(includePhotos ? ['photoFile'] : []),
      ...(includeBase64 && !includePhotos ? ['photoBase64'] : []),
    ];
    const allCols   = [...cols, ...extraCols];
    const csvHeader = allCols.map(escapeCell).join(sep);
    const csvRows   = [csvHeader];

    for (const p of products) {
      const photoBase64Raw = photos[p.id] || p.photoUrl || '';
      const hasPhoto       = !!photoBase64Raw;
      const safeCode       = (p.productCode||p.id||'product').replace(/[^A-Za-z0-9_-]/g,'_');
      const photoFilename  = hasPhoto ? `photos/${safeCode}.jpg` : '';

      const csvRow = cols.map(col => escapeCell(p[col] ?? '')).join(sep);

      let extraValues = '';
      if (includePhotos) {
        extraValues = sep + escapeCell(photoFilename ? `${safeCode}.jpg` : '');
      } else if (includeBase64) {
        // Embed resized base64 directly in cell — self-contained CSV
        let b64cell = '';
        if (hasPhoto) {
          try { b64cell = await resizeToJpeg(photoBase64Raw); } catch { b64cell = photoBase64Raw; }
        }
        extraValues = sep + escapeCell(b64cell);
      }

      csvRows.push(csvRow + extraValues);

      // ZIP mode — add image file
      if (includePhotos && hasPhoto) {
        try {
          const resized = await resizeToJpeg(photoBase64Raw);
          zipFiles.push({ name: photoFilename, data: base64ToBytes(resized) });
        } catch {}
      }
    }

    const csvContent = csvRows.join('\n');

    if (includePhotos && zipFiles.length > 0) {
      // Bundle CSV + photos into a ZIP
      const allFiles = [{ name: `products.${ext}`, data: csvContent }, ...zipFiles];
      const zipBytes = await buildZip(allFiles);
      const blob = new Blob([zipBytes], { type: 'application/zip' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `products_export_${dateStr}.zip`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } else {
      // Plain CSV — no photos
      const mime = exportFmt==='tsv' ? 'text/tab-separated-values' : 'text/csv';
      const a    = document.createElement('a');
      a.href = `data:${mime};charset=utf-8,` + encodeURIComponent(csvContent);
      a.download = `products_export_${dateStr}.${ext}`; a.click();
    }
    setExporting(false);
  };

  // Template = export format (same headers, populated with example rows using real categories)
  const handleTemplateDownload = () => {
    const catEx = validCats[0] || 'Other';
    const cat2  = validCats[1] || catEx;
    const rows  = [
      `# Valid categories: ${validCats.join(', ')}`,
      HEADERS.join(','),
      `CBL-001,Example Product 1,Brand A,Size/Weight,${catEx},ea,,29.99,15.00,50,5`,
      `CBL-002,Example Product 2,Brand B,200g,${cat2},pack,,12.50,6.00,100,10`,
    ].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows);
    a.download = 'unity_import_template.csv';
    a.click();
  };

  const toggleCol = col => setExportCols(prev => {
    const next = new Set(prev);
    next.has(col) ? next.delete(col) : next.add(col);
    return next;
  });

  // ── Row analysis ───────────────────────────────────────────────────────────
  const analyzed = rows.map(r => ({
    ...r,
    _existing:    findExisting(r, products),
    _resolvedCat: resolveCategory(r.category, validCats),
  }));
  const dupeCount = analyzed.filter(r => r._existing).length;
  const newCount  = analyzed.length - dupeCount;
  const fuzzyCount= analyzed.filter(r => r.category && r._resolvedCat && r._resolvedCat !== r.category).length;
  const progress  = rows.length ? Math.round(((done.added+done.updated+done.skipped)/rows.length)*100) : 0;

  return (
    <div className="bs-modal" style={{maxWidth:'700px'}}>
      <div className="bs-mhdr">
        <h3>📂 Bulk Product Tools</h3>
        <button className="bs-mx" onClick={onClose}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid #2a3a5c',padding:'0 24px'}}>
        {[{id:'import',label:'⬆ Import CSV'},{id:'export',label:'⬇ Export Products'}].map(t=>(
          <button key={t.id} type="button" onClick={()=>setTab(t.id)} style={{
            padding:'10px 20px', fontSize:'13px', fontWeight:600, cursor:'pointer',
            background:'none', border:'none',
            borderBottom: tab===t.id?'2px solid #38bdf8':'2px solid transparent',
            color: tab===t.id?'#38bdf8':'#64748b', marginBottom:'-1px', transition:'color .15s',
          }}>{t.label}</button>
        ))}
      </div>

      <div className="bs-form" style={{paddingTop:'20px'}}>

        {/* ════ IMPORT TAB ════ */}
        {tab==='import' && (finished ? (
          <div style={{textAlign:'center',padding:'24px'}}>
            <div style={{fontSize:'48px',marginBottom:'12px'}}>✅</div>
            <h3 style={{marginBottom:'12px'}}>Import complete!</h3>
            <div style={{display:'flex',gap:'10px',justifyContent:'center',flexWrap:'wrap',marginBottom:'16px'}}>
              {done.added>0   && <span style={{fontSize:'13px',background:'rgba(52,211,153,.1)',border:'1px solid rgba(52,211,153,.3)',borderRadius:'20px',padding:'5px 14px',color:'#34d399',fontWeight:600}}>✚ {done.added} added</span>}
              {done.updated>0 && <span style={{fontSize:'13px',background:'rgba(251,146,60,.1)',border:'1px solid rgba(251,146,60,.3)',borderRadius:'20px',padding:'5px 14px',color:'#fb923c',fontWeight:600}}>↑ {done.updated} updated</span>}
              {done.skipped>0 && <span style={{fontSize:'13px',background:'rgba(100,116,139,.1)',border:'1px solid rgba(100,116,139,.3)',borderRadius:'20px',padding:'5px 14px',color:'#94a3b8',fontWeight:600}}>⊘ {done.skipped} skipped</span>}
            </div>
            <div style={{display:'flex',gap:'10px',justifyContent:'center'}}>
              <button className="bs-sec" onClick={()=>{setFinished(false);setRows([]);setErrors([]);}}>Import Another</button>
              <button className="bs-pri" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <>
            {/* Step 1 — Template */}
            <div className="bs-import-step">
              <span className="bs-import-num">1</span>
              <div style={{flex:1}}>
                <p style={{fontSize:'13px',fontWeight:600,color:'#f0f4ff',marginBottom:'4px'}}>Download the CSV template</p>
                <p className="bs-muted" style={{fontSize:'12px',marginBottom:'10px'}}>
                  Same format as Export. Required column: <strong>name</strong>.
                  Duplicates matched by <strong>productCode</strong> or <strong>name + company</strong>.
                </p>
                <button type="button" className="bs-sec" onClick={handleTemplateDownload}>⬇ Download Template</button>

                {/* Live category chips */}
                <div style={{marginTop:'12px',background:'#0a1120',border:'1px solid #1e2d47',borderRadius:'9px',padding:'10px 14px'}}>
                  <p style={{fontSize:'10px',color:'#475569',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'7px'}}>
                    Your available categories — use these exact names in your CSV
                  </p>
                  <div style={{display:'flex',flexWrap:'wrap',gap:'5px'}}>
                    {validCats.map(cat=>(
                      <span key={cat} style={{
                        display:'inline-flex', alignItems:'center', gap:'4px',
                        fontSize:'12px', padding:'4px 11px', borderRadius:'14px', fontWeight:600,
                        background:`${CATEGORIES[cat]?.color}15`,
                        border:`1px solid ${CATEGORIES[cat]?.color}44`,
                        color: CATEGORIES[cat]?.color || '#94a3b8',
                        cursor:'default',
                      }}>
                        {CATEGORIES[cat]?.icon} {cat}
                      </span>
                    ))}
                  </div>
                  <p style={{fontSize:'10px',color:'#334155',marginTop:'7px'}}>
                    ⓘ Fuzzy matching is on — minor typos like "Biscuites" → "Biscuits" will be auto-corrected. Completely unrecognised categories will block import.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 2 — Duplicate strategy */}
            <div className="bs-import-step">
              <span className="bs-import-num">2</span>
              <div style={{flex:1}}>
                <p style={{fontSize:'13px',fontWeight:600,color:'#f0f4ff',marginBottom:'6px'}}>
                  When a duplicate is found…
                </p>
                <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                  {DUPE_MODES.map(m=>(
                    <button key={m.id} type="button" onClick={()=>setDupeMode(m.id)} style={{
                      display:'flex', alignItems:'center', gap:'12px',
                      padding:'10px 14px', borderRadius:'9px', cursor:'pointer', textAlign:'left',
                      background: dupeMode===m.id?'rgba(56,189,248,.1)':'rgba(255,255,255,.03)',
                      border: dupeMode===m.id?'1px solid #38bdf8':'1px solid rgba(255,255,255,.08)',
                      transition:'all .15s',
                    }}>
                      <div style={{
                        width:'16px',height:'16px',borderRadius:'50%',flexShrink:0,
                        border: dupeMode===m.id?'5px solid #38bdf8':'2px solid #475569',
                        transition:'all .15s',
                      }}/>
                      <div>
                        <p style={{fontSize:'12px',fontWeight:600,color:dupeMode===m.id?'#e2e8f0':'#94a3b8',marginBottom:'1px'}}>{m.label}</p>
                        <p style={{fontSize:'11px',color:'#475569'}}>{m.desc}</p>
                      </div>
                      {dupeMode===m.id && <span style={{marginLeft:'auto',color:'#38bdf8',fontSize:'15px'}}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Step 3 — Upload */}
            <div className="bs-import-step">
              <span className="bs-import-num">3</span>
              <div style={{flex:1}}>
                <p style={{fontSize:'13px',fontWeight:600,color:'#f0f4ff',marginBottom:'6px'}}>Upload your CSV file</p>
                <div style={{display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap'}}>
                  <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={handleFile} style={{display:'none'}}/>
                  <button type="button" className="bs-sec" onClick={()=>fileRef.current.click()}>📁 Choose File</button>
                  {rows.length>0 && (
                    <span style={{fontSize:'12px',fontWeight:600}}>
                      <span style={{color:'#34d399'}}>✓ {rows.length} rows loaded</span>
                      {dupeCount>0 && <span style={{color:'#fb923c',marginLeft:'8px'}}>· {dupeCount} duplicate{dupeCount!==1?'s':''}</span>}
                      {fuzzyCount>0 && <span style={{color:'#facc15',marginLeft:'8px'}}>· {fuzzyCount} category auto-corrected</span>}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Errors */}
            {errors.length>0 && (
              <div className="bs-import-errors">
                <p style={{fontWeight:600,marginBottom:'6px',color:'#f87171'}}>⚠ Fix {errors.length} error{errors.length!==1?'s':''} before importing:</p>
                {errors.map((e,i)=><p key={i} style={{fontSize:'12px',color:'#f87171',marginBottom:'2px'}}>• {e}</p>)}
              </div>
            )}

            {/* Preview table */}
            {rows.length>0 && errors.length===0 && (
              <div>
                <div style={{display:'flex',gap:'8px',marginBottom:'10px',flexWrap:'wrap'}}>
                  <span style={{fontSize:'12px',background:'rgba(52,211,153,.1)',border:'1px solid rgba(52,211,153,.3)',borderRadius:'20px',padding:'4px 12px',color:'#34d399',fontWeight:600}}>✚ {newCount} new</span>
                  {dupeCount>0 && <span style={{fontSize:'12px',background:'rgba(251,146,60,.1)',border:'1px solid rgba(251,146,60,.3)',borderRadius:'20px',padding:'4px 12px',color:'#fb923c',fontWeight:600}}>
                    {dupeMode==='skip'?`⊘ ${dupeCount} skipped`:dupeMode==='update'?`↑ ${dupeCount} updated`:`↑ ${dupeCount} topped up`}
                  </span>}
                  {fuzzyCount>0 && <span style={{fontSize:'12px',background:'rgba(250,204,21,.08)',border:'1px solid rgba(250,204,21,.3)',borderRadius:'20px',padding:'4px 12px',color:'#facc15',fontWeight:600}}>
                    🔤 {fuzzyCount} category auto-fixed
                  </span>}
                </div>
                <div style={{overflowX:'auto',maxHeight:'210px',overflowY:'auto',border:'1px solid #2a3a5c',borderRadius:'8px'}}>
                  <table className="bs-tbl">
                    <thead>
                      <tr><th>Code</th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Photo</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {analyzed.map((r,i)=>{
                        const catFixed = r.category && r._resolvedCat && r._resolvedCat!==r.category;
                        const rowPhoto = rowPhotos[i];
                        return (
                          <tr key={i} style={{opacity:dupeMode==='skip'&&r._existing?0.45:1}}>
                            <td className="bs-isbn">{r.productcode||r.productCode||<span style={{color:'#facc15',fontSize:'10px'}}>auto</span>}</td>
                            <td>{r.name}</td>
                            <td>
                              {catFixed ? (
                                <span title={`"${r.category}" → "${r._resolvedCat}"`}>
                                  <span style={{textDecoration:'line-through',color:'#475569',fontSize:'11px'}}>{r.category}</span>
                                  {' '}<span style={{color:'#facc15',fontWeight:600,fontSize:'11px'}}>{r._resolvedCat}</span>
                                </span>
                              ) : (r._resolvedCat || r.category || '—')}
                            </td>
                            <td>${(+r.price||0).toFixed(2)}</td>
                            <td>{r.stock||0}</td>
                            <td>
                              {/* Per-row photo picker */}
                              <label style={{cursor:'pointer',display:'flex',alignItems:'center',gap:'5px'}}>
                                {rowPhoto
                                  ? <img src={rowPhoto} alt="" style={{width:28,height:28,objectFit:'cover',borderRadius:4,border:'1px solid #34d399'}}/>
                                  : <span style={{fontSize:'11px',color:'#475569',background:'#1a2540',border:'1px dashed #2a3a5c',borderRadius:4,padding:'3px 6px',whiteSpace:'nowrap'}}>📷 Add</span>
                                }
                                <input type="file" accept="image/*" style={{display:'none'}}
                                  onChange={e=>handleRowPhoto(i, e.target.files[0])}/>
                              </label>
                              {rowPhoto && (
                                <button type="button" onClick={()=>removeRowPhoto(i)}
                                  style={{fontSize:'10px',color:'#f87171',background:'none',border:'none',cursor:'pointer',padding:'1px 4px'}}>✕</button>
                              )}
                            </td>
                            <td>
                              {r._existing
                                ? <span style={{fontSize:'11px',fontWeight:600,color:dupeMode==='skip'?'#64748b':dupeMode==='update'?'#818cf8':'#fb923c'}}>
                                    {dupeMode==='skip'?'⊘ Skip':dupeMode==='update'?'↑ Update':'↑ Top-up'}
                                  </span>
                                : <span style={{fontSize:'11px',fontWeight:600,color:'#34d399'}}>✚ New</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Progress bar */}
            {importing && (
              <div style={{marginTop:'8px'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                  <span style={{fontSize:'12px',color:'#94a3b8'}}>Importing {done.added+done.updated+done.skipped} of {rows.length}…</span>
                  <span style={{fontSize:'12px',color:'#38bdf8',fontWeight:700}}>{progress}%</span>
                </div>
                <div style={{background:'#1a2540',borderRadius:'6px',height:'8px',overflow:'hidden'}}>
                  <div style={{width:`${progress}%`,height:'100%',background:'linear-gradient(90deg,#38bdf8,#818cf8)',borderRadius:'6px',transition:'width .3s'}}/>
                </div>
              </div>
            )}

            <div className="bs-fa">
              <button type="button" className="bs-sec" onClick={onClose}>Cancel</button>
              <button type="button" className="bs-pri"
                disabled={rows.length===0||errors.length>0||importing}
                onClick={handleImport}>
                {importing?'Importing…':`✅ Import ${rows.length} Row${rows.length!==1?'s':''}`}
              </button>
            </div>
          </>
        ))}

        {/* ════ EXPORT TAB ════ */}
        {tab==='export' && (
          <div>
            <div style={{display:'flex',gap:'10px',marginBottom:'16px',flexWrap:'wrap'}}>
              <div style={{background:'rgba(56,189,248,.08)',border:'1px solid rgba(56,189,248,.2)',borderRadius:'10px',padding:'10px 16px',flex:1,minWidth:'160px'}}>
                <p className="bs-muted" style={{fontSize:'11px',marginBottom:'2px'}}>Total products</p>
                <p style={{fontSize:'22px',fontWeight:800,color:'#38bdf8'}}>{products.length}</p>
              </div>
              <div style={{background:'rgba(52,211,153,.08)',border:'1px solid rgba(52,211,153,.2)',borderRadius:'10px',padding:'10px 16px',flex:1,minWidth:'160px'}}>
                <p className="bs-muted" style={{fontSize:'11px',marginBottom:'2px'}}>Columns selected</p>
                <p style={{fontSize:'22px',fontWeight:800,color:'#34d399'}}>{exportCols.size}</p>
              </div>
            </div>

            <div style={{marginBottom:'14px'}}>
              <p style={{fontSize:'11px',color:'#64748b',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'8px'}}>Format</p>
              <div style={{display:'flex',gap:'8px'}}>
                {[{id:'csv',label:'CSV (.csv)',desc:'Excel / Google Sheets'},{id:'tsv',label:'TSV (.tsv)',desc:'Tab-separated'}].map(f=>(
                  <button key={f.id} type="button" onClick={()=>setExportFmt(f.id)} style={{
                    flex:1,padding:'10px 14px',borderRadius:'9px',cursor:'pointer',textAlign:'left',
                    background:exportFmt===f.id?'rgba(56,189,248,.1)':'rgba(255,255,255,.03)',
                    border:exportFmt===f.id?'1px solid #38bdf8':'1px solid rgba(255,255,255,.08)',
                  }}>
                    <p style={{fontSize:'12px',fontWeight:700,color:exportFmt===f.id?'#38bdf8':'#94a3b8',fontFamily:'monospace',marginBottom:'2px'}}>{f.label}</p>
                    <p style={{fontSize:'11px',color:'#475569'}}>{f.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div style={{marginBottom:'14px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
                <p style={{fontSize:'11px',color:'#64748b',textTransform:'uppercase',letterSpacing:'.06em'}}>Columns</p>
                <div style={{display:'flex',gap:'8px'}}>
                  <button type="button" className="bs-link-btn" style={{fontSize:'11px'}} onClick={()=>setExportCols(new Set(HEADERS))}>All</button>
                  <button type="button" className="bs-link-btn" style={{fontSize:'11px'}} onClick={()=>setExportCols(new Set(['productCode','name','price','cost','stock']))}>Essential</button>
                </div>
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
                {HEADERS.map(col=>(
                  <button key={col} type="button" onClick={()=>toggleCol(col)} style={{
                    fontSize:'11px',padding:'5px 12px',borderRadius:'14px',cursor:'pointer',fontFamily:'monospace',
                    background:exportCols.has(col)?'rgba(56,189,248,.15)':'rgba(255,255,255,.04)',
                    border:exportCols.has(col)?'1px solid #38bdf8':'1px solid rgba(255,255,255,.1)',
                    color:exportCols.has(col)?'#38bdf8':'#64748b',
                  }}>
                    {exportCols.has(col)?'✓ ':''}{col}
                  </button>
                ))}
                {/* Photos toggle — separate from CSV columns */}
                <button type="button" onClick={()=>setExportCols(prev=>{
                  const n=new Set(prev); n.has('photos')?n.delete('photos'):n.add('photos'); return n;
                })} style={{
                  fontSize:'11px',padding:'5px 12px',borderRadius:'14px',cursor:'pointer',
                  background:exportCols.has('photos')?'rgba(52,211,153,.15)':'rgba(255,255,255,.04)',
                  border:exportCols.has('photos')?'1px solid #34d399':'1px solid rgba(255,255,255,.1)',
                  color:exportCols.has('photos')?'#34d399':'#64748b',
                }}>
                  {exportCols.has('photos')?'✓ ':''}📷 Photos (ZIP)
                </button>
                <button type="button" onClick={()=>toggleCol('photoBase64')} style={{
                  padding:'6px 12px', borderRadius:'6px', fontSize:'12px', fontWeight:600,
                  cursor:'pointer', border:'1px solid',
                  borderColor: exportCols.has('photoBase64')?'#38bdf8':'#2a3a5c',
                  background: exportCols.has('photoBase64')?'rgba(56,189,248,.12)':'transparent',
                  color: exportCols.has('photoBase64')?'#38bdf8':'#64748b',
                }}>
                  {exportCols.has('photoBase64')?'✓ ':''}🖼 Photos (Base64 in CSV)
                </button>
              </div>
              {exportCols.has('photoBase64') && !exportCols.has('photos') && (
                <div style={{marginTop:'8px',background:'rgba(56,189,248,.06)',border:'1px solid rgba(56,189,248,.2)',borderRadius:'6px',padding:'8px 12px',fontSize:'11px',color:'#38bdf8'}}>
                  📋 Base64 photos are embedded directly in the CSV file — no ZIP needed.<br/>
                  The <code>photoBase64</code> column stores the full image data URI.<br/>
                  Re-importing this CSV will restore all photos automatically.<br/>
                  <span style={{color:'#64748b'}}>⚠ Large file (~100KB per product with photo)</span>
                </div>
              )}
              {exportCols.has('photos') && (
                <div style={{marginTop:'8px',background:'rgba(52,211,153,.06)',border:'1px solid rgba(52,211,153,.2)',borderRadius:'8px',padding:'8px 12px'}}>
                  <p style={{fontSize:'11px',color:'#34d399',fontWeight:600,marginBottom:'2px'}}>📦 Will export as .zip</p>
                  <p style={{fontSize:'11px',color:'#475569'}}>
                    Contains <code>products.{ext}</code> + a <code>photos/</code> folder with one JPEG per product that has a photo.
                    Products without photos are still included in the CSV.
                  </p>
                </div>
              )}
            </div>

            {products.length>0 && exportCols.size>0 && (
              <div style={{marginBottom:'16px'}}>
                <p style={{fontSize:'11px',color:'#64748b',marginBottom:'6px'}}>Preview (first 3 rows)</p>
                <div style={{background:'#0d1526',border:'1px solid #2a3a5c',borderRadius:'8px',padding:'10px 14px',overflowX:'auto'}}>
                  <pre style={{fontSize:'11px',color:'#94a3b8',margin:0,fontFamily:'monospace',whiteSpace:'pre-wrap',wordBreak:'break-all'}}>
                    {[
                      HEADERS.filter(h=>exportCols.has(h)).map(escapeCell).join(sep),
                      ...products.slice(0,3).map(p=>HEADERS.filter(h=>exportCols.has(h)).map(col=>escapeCell(p[col]??'')).join(sep))
                    ].join('\n')}
                  </pre>
                </div>
              </div>
            )}

            <div className="bs-fa">
              <button type="button" className="bs-sec" onClick={onClose}>Close</button>
              <button type="button" className="bs-pri"
                disabled={products.length===0||exportCols.size===0||exporting}
                onClick={handleExport}>
                {exporting
                  ? '⏳ Preparing export…'
                  : includePhotos
                    ? `📦 Export ${products.length} Products as ZIP`
                    : `⬇ Export ${products.length} Products as ${exportFmt.toUpperCase()}`
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
