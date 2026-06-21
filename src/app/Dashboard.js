import React, { useMemo } from 'react';
import { makeFmt, CATEGORIES as BASE_CATEGORIES } from './constants';

const DASH_FONTS = {
  syne:    { font:"'Syne',sans-serif",       weight:800, size:'1.25rem' },
  mono:    { font:"'Space Mono',monospace",  weight:700, size:'1.05rem' },
  inter:   { font:"'Inter',sans-serif",      weight:700, size:'1.2rem'  },
  serif:   { font:"'Georgia',serif",         weight:700, size:'1.15rem' },
  display: { font:"'Syne',sans-serif",       weight:900, size:'1.55rem' },
};

export default function Dashboard({ products, sales, workers, profile, settings, categories: catProp }) {
  const CATEGORIES = catProp || BASE_CATEGORIES;
  const fmt = makeFmt(settings?.currencySymbol || '$');
  const fontStyle = DASH_FONTS[settings?.dashFont || 'syne'] || DASH_FONTS.syne;
  const now   = new Date();
  const today = now.toDateString();
  const thisMonth = `${now.getFullYear()}-${now.getMonth()}`;

  const stats = useMemo(() => {
    const safeSales = sales || [];
    const safeProducts = products || [];
    
    const todaySales  = safeSales.filter(s => new Date(s.date).toDateString() === today);
    const monthSales  = safeSales.filter(s => { const d = new Date(s.date); return `${d.getFullYear()}-${d.getMonth()}` === thisMonth; });
    const todayRev    = todaySales.reduce((a,s)=>a+s.total,0);
    const monthRev    = monthSales.reduce((a,s)=>a+s.total,0);
    const totalRev    = safeSales.reduce((a,s)=>a+s.total,0);
    const totalProfit = safeSales.reduce((a,s)=>a+(s.profit||0),0);
    const lowStock    = safeProducts.filter(p=>p.stock>0 && p.stock<=p.minStock);
    const outStock    = safeProducts.filter(p=>p.stock===0);
    const totalItems  = safeProducts.reduce((a,p)=>a+p.stock,0);

    // Sales by category
    const byCat = {};
    safeSales.forEach(s => s.items?.forEach(it => {
      if (!byCat[it.category]) byCat[it.category] = { qty:0, rev:0 };
      byCat[it.category].qty += it.qty;
      byCat[it.category].rev += it.price * it.qty;
    }));

    // Sales by worker (last 30 days)
    const byWorker = {};
    safeSales.slice(0,200).forEach(s => {
      const name = s.workerName || 'Unknown';
      if (!byWorker[name]) byWorker[name] = { count:0, rev:0 };
      byWorker[name].count++;
      byWorker[name].rev += s.total;
    });

    // Last 7 days revenue
    const last7 = [];
    for (let i=6;i>=0;i--) {
      const d = new Date(); d.setDate(d.getDate()-i);
      const ds = d.toDateString();
      const rev = safeSales.filter(s=>new Date(s.date).toDateString()===ds).reduce((a,s)=>a+s.total,0);
      last7.push({ label: d.toLocaleDateString('en',{weekday:'short'}), rev });
    }

    return { todaySales, monthSales, todayRev, monthRev, totalRev, totalProfit, lowStock, outStock, totalItems, byCat, byWorker, last7 };
  }, [sales, products, today, thisMonth]);

  const maxRev = Math.max(...stats.last7.map(d=>d.rev), 1);

  return (
    <div className="bs-dash">
      <div className="bs-dash-header">
        <div>
          <h2 className="bs-h2">Dashboard</h2>
          <p className="bs-muted">Welcome back, <strong style={{color:'#38bdf8'}}>{profile?.name}</strong> · {new Date().toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'})}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="bs-stats6">
        <StatCard icon="💰" label="Today Revenue"  val={fmt(stats.todayRev)}   sub={stats.todaySales.length+' sales'} col="c" fontStyle={fontStyle}/>
        <StatCard icon="📅" label="Month Revenue"  val={fmt(stats.monthRev)}   sub={stats.monthSales.length+' sales'} col="g" fontStyle={fontStyle}/>
        <StatCard icon="📈" label="Total Revenue"  val={fmt(stats.totalRev)}   sub="all time" col="p" fontStyle={fontStyle}/>
        <StatCard icon="💵" label="Total Profit"   val={fmt(stats.totalProfit)}sub="gross" col="b" fontStyle={fontStyle}/>
        <StatCard icon="⚠️" label="Low Stock"      val={stats.lowStock.length} sub="items" col="o" fontStyle={fontStyle}/>
        <StatCard icon="❌" label="Out of Stock"   val={stats.outStock.length} sub="items" col="r" fontStyle={fontStyle}/>
      </div>

      <div className="bs-dash3">
        {/* 7-day chart */}
        <div className="bs-dcard span2">
          <p className="bs-dcard-ttl">Revenue — Last 7 Days</p>
          <div className="bs-bar-chart">
            {stats.last7.map((d,i)=>(
              <div key={i} className="bs-bar-col">
                <span className="bs-bar-val">{d.rev>0?fmt(d.rev):''}</span>
                <div className="bs-bar-track">
                  <div className="bs-bar-fill" style={{height: `${(d.rev/maxRev)*100}%`}} />
                </div>
                <span className="bs-bar-lbl">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stock alerts */}
        <div className="bs-dcard">
          <p className="bs-dcard-ttl">⚠ Stock Alerts</p>
          {stats.lowStock.length===0 && stats.outStock.length===0
            ? <p className="bs-muted" style={{padding:'12px 0'}}>✅ All stock levels healthy</p>
            : <>
              {stats.outStock.map(p=>(
                <div key={p.id} className="bs-alert-item out">
                  <span>{CATEGORIES[p.category]?.icon||'📦'} {p.name}</span>
                  <span className="bs-tag-r">OUT</span>
                </div>
              ))}
              {stats.lowStock.map(p=>(
                <div key={p.id} className="bs-alert-item low">
                  <span>{CATEGORIES[p.category]?.icon||'📦'} {p.name}</span>
                  <span className="bs-tag-o">{p.stock} left</span>
                </div>
              ))}
            </>
          }
        </div>
      </div>

      <div className="bs-dash3">
        {/* Sales by category */}
        <div className="bs-dcard">
          <p className="bs-dcard-ttl">Sales by Category</p>
          {Object.entries(stats.byCat).length===0 && <p className="bs-muted">No sales yet.</p>}
          {Object.entries(stats.byCat).map(([cat,v])=>(
            <div key={cat} className="bs-cat-row">
              <span>{CATEGORIES[cat]?.icon||'📦'} {cat}</span>
              <div className="bs-cat-bar-wrap">
                <div className="bs-cat-bar" style={{width:`${Math.min((v.rev/Math.max(...Object.values(stats.byCat).map(x=>x.rev),1))*100,100)}%`,background:CATEGORIES[cat]?.color||'#64748b'}} />
              </div>
              <span className="bs-cat-val">{fmt(v.rev)}</span>
            </div>
          ))}
        </div>

        {/* Worker performance */}
        <div className="bs-dcard">
          <p className="bs-dcard-ttl">Worker Performance</p>
          {Object.entries(stats.byWorker).length===0 && <p className="bs-muted">No sales recorded.</p>}
          {Object.entries(stats.byWorker).sort((a,b)=>b[1].rev-a[1].rev).map(([name,v])=>(
            <div key={name} className="bs-worker-row">
              <div className="bs-worker-avatar">{name[0]?.toUpperCase()}</div>
              <div style={{flex:1}}>
                <p style={{fontSize:'13px',fontWeight:600}}>{name}</p>
                <p className="bs-muted" style={{fontSize:'11px'}}>{v.count} transactions</p>
              </div>
              <span className="bs-green">{fmt(v.rev)}</span>
            </div>
          ))}
        </div>

        {/* Recent transactions */}
        <div className="bs-dcard">
          <p className="bs-dcard-ttl">Recent Transactions</p>
          {sales.slice(0,8).map(s=>(
            <div key={s.id} className="bs-rec-row">
              <div>
                <p style={{fontSize:'12px',fontWeight:700,color:'#38bdf8',fontFamily:"'Space Mono',monospace"}}>#{(s.id||'').slice(-5).toUpperCase()}</p>
                <p className="bs-muted" style={{fontSize:'11px'}}>{s.workerName} · {new Date(s.date).toLocaleTimeString()}</p>
              </div>
              <div style={{textAlign:'right'}}>
                <p className="bs-green" style={{fontSize:'13px',fontWeight:700}}>{fmt(s.total)}</p>
                <span className="bs-pbadge">{s.payment}</span>
              </div>
            </div>
          ))}
          {sales.length===0 && <p className="bs-muted">No transactions yet.</p>}
        </div>
      </div>
    </div>
  );
}

function StatCard({icon, label, val, sub, col, fontStyle}) {
  const fs = fontStyle || DASH_FONTS.syne;
  return (
    <div className={'bs-sc sc-'+col}>
      <span className="bs-sc-icon">{icon}</span>
      <div>
        <p className="bs-sc-val" style={{fontFamily:fs.font, fontWeight:fs.weight, fontSize:fs.size}}>{val}</p>
        <p className="bs-sc-lbl">{label}</p>
        <p className="bs-sc-sub">{sub}</p>
      </div>
    </div>
  );
}
