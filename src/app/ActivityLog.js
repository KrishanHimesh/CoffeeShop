import React, { useState, useMemo } from 'react';

const ACTION_META = {
  ADD_PRODUCT:     { icon:'📦', label:'Product Added',     color:'#34d399', group:'Inventory' },
  EDIT_PRODUCT:    { icon:'✏️',  label:'Product Edited',    color:'#38bdf8', group:'Inventory' },
  DELETE_PRODUCT:  { icon:'🗑️', label:'Product Deleted',   color:'#f87171', group:'Inventory' },
  RECORD_SALE:     { icon:'🛒', label:'Sale Recorded',     color:'#818cf8', group:'Sales'     },
  ADD_CUSTOMER:    { icon:'🤝', label:'Customer Added',    color:'#34d399', group:'Customers' },
  DELETE_CUSTOMER: { icon:'❌', label:'Customer Removed',  color:'#f87171', group:'Customers' },
  SAVE_SETTINGS:   { icon:'⚙️', label:'Settings Changed',  color:'#fb923c', group:'Settings'  },
};

const GROUPS = ['All', 'Sales', 'Inventory', 'Customers', 'Settings'];

function fmt(ts) {
  const d = new Date(ts);
  return d.toLocaleString('en-AU', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

export default function ActivityLog({ activityLog = [] }) {
  const [search,  setSearch]  = useState('');
  const [group,   setGroup]   = useState('All');
  const [dateF,   setDateF]   = useState('');
  const [page,    setPage]    = useState(1);
  const PER_PAGE = 50;

  const filtered = useMemo(() => {
    if (!activityLog || !Array.isArray(activityLog)) return [];
    return activityLog.filter(e => {
      const meta = ACTION_META[e.action] || {};
      const matchGroup  = group === 'All' || meta.group === group;
      const matchSearch = !search || e.details?.toLowerCase().includes(search.toLowerCase())
                       || e.workerName?.toLowerCase().includes(search.toLowerCase())
                       || e.action?.toLowerCase().includes(search.toLowerCase());
      const matchDate   = !dateF || e.timestamp?.startsWith(dateF);
      return matchGroup && matchSearch && matchDate;
    });
  }, [activityLog, search, group, dateF]);

  const pages    = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

  // Summary counts
  const today = new Date().toISOString().slice(0,10);
  const todayCount  = activityLog.filter(e => e.timestamp?.startsWith(today)).length;
  const deleteCount = activityLog.filter(e => e.action?.includes('DELETE')).length;
  const saleCount   = activityLog.filter(e => e.action === 'RECORD_SALE').length;

  const exportCSV = () => {
    const rows = [['Timestamp','Action','Details','Worker','Role']];
    filtered.forEach(e => rows.push([
      new Date(e.timestamp).toLocaleString(), e.action, e.details, e.workerName, e.workerRole
    ]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `activity_log_${today}.csv`;
    a.click();
  };

  return (
    <div className="bs-reports">
      <div className="bs-inv-bar" style={{marginBottom:'16px'}}>
        <h2 className="bs-h2" style={{margin:0}}>🔍 System Activity Log</h2>
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:'11px',color:'#64748b'}}>{activityLog.length} total records</span>
          <button className="bs-add" style={{background:'#0f766e'}} onClick={exportCSV}>⬇ Export CSV</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="bs-stats6" style={{marginBottom:'18px'}}>
        <div className="bs-sc sc-c"><span className="bs-sc-icon">📅</span><div><p className="bs-sc-val">{todayCount}</p><p className="bs-sc-lbl">Today's Actions</p></div></div>
        <div className="bs-sc sc-p"><span className="bs-sc-icon">🛒</span><div><p className="bs-sc-val">{saleCount}</p><p className="bs-sc-lbl">Sales Logged</p></div></div>
        <div className="bs-sc sc-r"><span className="bs-sc-icon">🗑️</span><div><p className="bs-sc-val">{deleteCount}</p><p className="bs-sc-lbl">Deletions</p></div></div>
        <div className="bs-sc sc-g"><span className="bs-sc-icon">📊</span><div><p className="bs-sc-val">{activityLog.length}</p><p className="bs-sc-lbl">Total Events</p></div></div>
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'14px',alignItems:'center'}}>
        <input
          className="bs-inp" style={{flex:1,minWidth:'180px',maxWidth:'280px'}}
          placeholder="🔍 Search details, worker…"
          value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
        />
        <input
          type="date" className="bs-inp" style={{width:'150px'}}
          value={dateF} onChange={e=>{setDateF(e.target.value);setPage(1);}}
          title="Filter by date"
        />
        {dateF && (
          <button className="bs-sec" style={{padding:'7px 10px',fontSize:'11px'}} onClick={()=>{setDateF('');setPage(1);}}>
            ✕ Clear Date
          </button>
        )}
        <div className="bs-pills" style={{margin:0}}>
          {GROUPS.map(g=>(
            <button key={g} className={'bs-pill'+(group===g?' a':'')} onClick={()=>{setGroup(g);setPage(1);}}>
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Log table */}
      <div className="bs-dcard" style={{padding:0,overflow:'hidden'}}>
        {paginated.length === 0 ? (
          <div style={{textAlign:'center',padding:'48px'}}>
            <p style={{fontSize:'28px',marginBottom:'8px'}}>🔍</p>
            <p className="bs-muted">No activity records match your filter.</p>
          </div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table className="bs-tbl">
              <thead>
                <tr>
                  <th style={{width:'140px'}}>Time</th>
                  <th style={{width:'160px'}}>Action</th>
                  <th>Details</th>
                  <th style={{width:'130px'}}>Worker</th>
                  <th style={{width:'90px'}}>Role</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((entry, i) => {
                  const meta = ACTION_META[entry.action] || { icon:'📝', label:entry.action, color:'#64748b' };
                  return (
                    <tr key={entry.id || i}>
                      <td>
                        <p style={{fontSize:'11px',color:'#94a3b8',whiteSpace:'nowrap'}}>{fmt(entry.timestamp)}</p>
                        <p style={{fontSize:'10px',color:'#475569'}}>{timeAgo(entry.timestamp)}</p>
                      </td>
                      <td>
                        <span style={{
                          display:'inline-flex',alignItems:'center',gap:'5px',
                          background:`${meta.color}18`,border:`1px solid ${meta.color}44`,
                          color:meta.color,padding:'3px 8px',borderRadius:'12px',
                          fontSize:'11px',fontWeight:600,whiteSpace:'nowrap',
                        }}>
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td style={{fontSize:'12px',color:'#cbd5e1'}}>{entry.details}</td>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                          <div className="bs-worker-avatar" style={{width:'24px',height:'24px',fontSize:'11px',flexShrink:0}}>
                            {(entry.workerName||'?')[0]?.toUpperCase()}
                          </div>
                          <span style={{fontSize:'12px'}}>{entry.workerName}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{
                          fontSize:'10px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',
                          color: entry.workerRole==='owner'?'#fbbf24':entry.workerRole==='manager'?'#818cf8':'#64748b',
                        }}>
                          {entry.workerRole}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{display:'flex',justifyContent:'center',gap:'6px',marginTop:'12px',alignItems:'center'}}>
          <button className="bs-sec" style={{padding:'6px 12px'}} disabled={page===1} onClick={()=>setPage(p=>p-1)}>← Prev</button>
          <span style={{fontSize:'12px',color:'#64748b'}}>Page {page} of {pages} ({filtered.length} records)</span>
          <button className="bs-sec" style={{padding:'6px 12px'}} disabled={page===pages} onClick={()=>setPage(p=>p+1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
