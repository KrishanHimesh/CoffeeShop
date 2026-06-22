// ─────────────────────────────────────────────────────────────────────────────
// BookShelf.js  —  ENTERPRISE VERSION
//
// Changes from original:
//  - Pulls tenantId, plan, refreshClaims from useStore
//  - Wraps app in <SubscriptionGate> so unsubscribed tenants see pricing
//  - Plan-gates certain tabs (reports on starter are read-only with banner)
//  - Adds "📋 Catalogue" tab — browse & import from shared product catalogue
//  - Shows admin panel link for platformAdmin users
//  - Worker creation now uses Cloud Function via updated Workers component
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';

import { useStore } from './useStore';
import { ROLE_PERMISSIONS, ROLE_LABELS, buildCategories } from './constants';
import { SubscriptionGate, PricingPage } from './SubscriptionGate';
import LoginPage        from './LoginPage';
import LandingPage      from './LandingPage';
import Dashboard        from './Dashboard';
import POS              from './POS';
import Inventory        from './Inventory';
import Workers          from './Workers';
import Reports          from './Reports';
import Settings         from './Settings';
import Suppliers        from './Suppliers';
import Payables         from './Payables';
import CreditCustomers  from './CreditCustomers';
import ActivityLog      from './ActivityLog';
import ReceiveStock     from './ReceiveStock';
import SalesHistory     from './SalesHistory';
import KitchenDisplay   from './KitchenDisplay';
import OrdersReady      from './OrdersReady';
import InstallPrompt, { useInstallPrompt } from './InstallPrompt';
import SupportWidget    from './SupportWidget';
import { applyTheme, getSavedTheme, THEME_LIST } from './themes';
import SharedCatalogue  from './SharedCatalogue';
import './BookShelf.css';

// Which plan is required for each tab?
// 'any' = any active plan; 'pro' = Pro or Business; 'business' = Business only
const TAB_PLAN = {
  dashboard:   'any',
  pos:         'any',
  inventory:   'any',
  catalogue:   'any',   // shared catalogue browsing — available on all plans
  receive:     'pro',
  suppliers:   'pro',
  payables:    'pro',
  customers:   'pro',
  saleshistory:'any',
  reports:     'pro',
  workers:     'any',   // worker management available on all plans
  settings:    'any',
  activitylog: 'pro',
  appearance:  'any',
  pricing:     'any',
};

const TABS = [
  { id:'dashboard',    label:'📊 Dashboard',    permission:'canViewDashboard'    },
  { id:'pos',          label:'🛒 POS',           permission:'canDoPOS'            },
  { id:'kitchen',      label:'👨‍🍳 Kitchen',      permission:'canAccessKitchen'    },
  { id:'ordersready',  label:'🔔 Orders Ready',  permission:'canAccessOrdersReady'},
  { id:'inventory',    label:'📦 Inventory',     permission:'canManageInventory'  },
  { id:'catalogue',    label:'📋 Catalogue',     permission:'canManageInventory'  },
  { id:'receive',      label:'📥 Receive',       permission:'canManageSuppliers'  },
  { id:'suppliers',    label:'🏭 Suppliers',     permission:'canManageSuppliers'  },
  { id:'payables',     label:'💸 Payables',      permission:'canManageSuppliers'  },
  { id:'customers',    label:'🤝 Customers',     permission:'canViewReports'      },
  { id:'saleshistory', label:'🧾 Receipts',      permission:'canViewReports'      },
  { id:'reports',      label:'📈 Reports',       permission:'canViewReports'      },
  { id:'workers',      label:'👥 Workers',       permission:'canAccessWorkers'    },
  { id:'settings',     label:'⚙️ Settings',      permission:'canManageWorkers'    },
  { id:'activitylog',  label:'🔍 Activity Log',  permission:'canManageWorkers'    },
  { id:'appearance',   label:'🎨 Appearance',    permission:'canChangeAppearance' },
];

// Check if the user's current plan satisfies a tab's plan requirement
function planAllows(plan, required) {
  if (!required || required === 'any') return true;
  if (required === 'pro')      return plan === 'pro'      || plan === 'business';
  if (required === 'business') return plan === 'business';
  return false;
}

export default function BookShelf() {
  const store = useStore();
  const {
    user, profile, loading, fbActive,
    tenantId, plan, refreshClaims,
    products, photos, sales, workers, settings,
    suppliers, stockReceipts,
    creditCustomers, addCreditCustomer, updateCreditCustomer, deleteCreditCustomer,
    kitchenOrders, updateKitchenOrderStatus,
    activityLog,
    login, logout,
    addProduct, updateProduct, deleteProduct, importSharedProduct,
    recordSale,
    addWorker, updateWorker, deleteWorker, changeOwnPassword,
    saveSettings,
    addSupplier, updateSupplier, deleteSupplier,
    receiveStock,
  } = store;

  const [tab,      setTab]      = useState('pos');
  const [toast,    setToast]    = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  
  // Install prompt hook
  const { canInstall, install: triggerInstall } = useInstallPrompt();

  const categories = buildCategories(settings?.customCategories);
  const isPlatformAdmin = profile?.platformAdmin || false;

  // Apply theme (colours) on mount and when theme setting changes
  React.useEffect(() => {
    const themeId = settings?.theme || getSavedTheme() || 'dark-ocean';
    applyTheme(themeId);
  }, [settings?.theme]);

  // Apply font size globally
  React.useEffect(() => {
    const sizes = { sm: '13px', md: '15px', lg: '17px', xl: '19px' };
    document.documentElement.style.setProperty('--bs-font-size', sizes[settings?.fontSize || 'md']);
  }, [settings?.fontSize]);

  const notify = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const perms       = profile ? (ROLE_PERMISSIONS[profile.role] || {}) : {};
  const visibleTabs = TABS.filter(t => perms[t.permission]);

  React.useEffect(() => {
    if (visibleTabs.length && !visibleTabs.find(t => t.id === tab)) {
      setTab(visibleTabs[0].id);
    }
  }, [profile]); // eslint-disable-line

  const switchTab = id => { setTab(id); setMenuOpen(false); };

  // ── Handler wrappers ──────────────────────────────────────────────────────
  const handleSale        = async d     => { try { const r = await recordSale(d);          notify('Sale recorded! ✅'); return r; } catch(e){ notify(e.message,'err'); } };
  const handleAddProd     = async d     => { try { await addProduct(d);                    notify('Product added!');   } catch(e){ notify(e.message,'err'); } };
  const handleUpdateProd  = async(id,d) => { try { await updateProduct(id,d);              notify('Product updated!'); } catch(e){ notify(e.message,'err'); } };
  const handleDelProd     = async id    => { try { await deleteProduct(id);                notify('Deleted','info');   } catch(e){ notify(e.message,'err'); } };
  const handleImport      = async p     => { try { await importSharedProduct(p);           notify(`Imported: ${p.name} ✅`); } catch(e){ notify(e.message,'err'); } };
  const handleAddWorker   = async d     => { try { await addWorker(d);                     notify('Worker added!');    } catch(e){ notify(e.message,'err'); } };
  const handleUpdWorker   = async(id,d) => { try { await updateWorker(id,d);              notify('Worker updated!'); } catch(e){ notify(e.message,'err'); } };
  const handleDelWorker   = async id    => { try { await deleteWorker(id);                notify('Worker removed','info'); } catch(e){ notify(e.message,'err'); } };
  const handleSettings    = async d     => { try { await saveSettings(d);                  notify('Settings saved! ✅'); } catch(e){ notify(e.message,'err'); } };
  const handleAddSupplier = async d     => { try { await addSupplier(d);                   notify('Supplier added!'); } catch(e){ notify(e.message,'err'); } };
  const handleUpdSupplier = async(id,d) => { try { await updateSupplier(id,d);            notify('Supplier updated!'); } catch(e){ notify(e.message,'err'); } };
  const handleDelSupplier = async id    => { try { await deleteSupplier(id);               notify('Supplier removed','info'); } catch(e){ notify(e.message,'err'); } };
  const handleReceive     = async d     => { try { await receiveStock(d);                  notify('Stock received! ✅'); } catch(e){ notify(e.message,'err'); } };
  const handleAddCust     = async d     => { try { await addCreditCustomer(d);             notify('Customer added!');   } catch(e){ notify(e.message,'err'); } };
  const handleUpdCust     = async(id,d) => { try { await updateCreditCustomer(id,d);      notify('Customer updated!'); } catch(e){ notify(e.message,'err'); } };
  const handleDelCust     = async id    => { try { await deleteCreditCustomer(id);         notify('Customer removed','info'); } catch(e){ notify(e.message,'err'); } };

  // ── Loading / auth states ─────────────────────────────────────────────────
  // Safety timeout — if loading for more than 8 seconds, force it off
  const [forceReady, setForceReady] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setForceReady(true), 8000);
    return () => clearTimeout(t);
  }, []);

  if (loading && !forceReady) return (
    <div className="bs bs-loading">
      <div className="bs-spinner"/>
      <p>Loading…</p>
    </div>
  );

  if (!user || !profile) return (
    <LandingPage onLogin={login} loading={loading} />
  );

  const currentTab = visibleTabs.find(t => t.id === tab);

  // ── Plan-locked tab overlay ───────────────────────────────────────────────
  // If the user tries to view a tab their plan doesn't cover, show an upgrade nudge
  const tabPlanRequired = TAB_PLAN[tab] || 'any';
  const tabLocked = !planAllows(plan, tabPlanRequired);

  // ── Main app (wrapped in subscription gate) ───────────────────────────────
  return (
    <SubscriptionGate plan={plan} tenantId={tenantId} onRefresh={refreshClaims}>
      <div className="bs">
        <header className="bs-hdr">
          
          <div className="bs-brand">
            {settings?.logoUrl
              ? <img src={settings.logoUrl} alt={settings?.businessName||'Logo'} style={{height:'32px',maxWidth:'120px',objectFit:'contain',borderRadius:'6px'}}/>
              : <><span>🏪</span> <strong>{settings?.businessName || 'My Store'}</strong></>
            }
          </div>

          <nav className="bs-nav bs-nav-desktop">
            {visibleTabs.map(t => {
              const kitchenBadge     = t.id === 'kitchen'     ? (kitchenOrders||[]).filter(o=>o.status==='new'||o.status==='preparing').length : 0;
              const ordersReadyBadge = t.id === 'ordersready' ? (kitchenOrders||[]).filter(o=>o.status==='ready').length : 0;
              const badge = kitchenBadge || ordersReadyBadge;
              return (
                <button
                  key={t.id}
                  className={'bs-nb' + (tab === t.id ? ' active' : '') + (!planAllows(plan, TAB_PLAN[t.id]) ? ' locked' : '')}
                  onClick={() => switchTab(t.id)}
                  title={!planAllows(plan, TAB_PLAN[t.id]) ? `Requires ${TAB_PLAN[t.id]} plan` : undefined}
                >
                  {t.label}
                  {!planAllows(plan, TAB_PLAN[t.id]) && <span style={{ fontSize: 10, marginLeft: 4 }}>🔒</span>}
                  {badge > 0 && (
                    <span style={{
                      marginLeft:6, fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:100,
                      background: t.id==='ordersready' ? 'var(--bs-success, #34d399)' : 'var(--bs-danger, #f87171)',
                      color:'#0d1526',
                    }}>{badge}</span>
                  )}
                </button>
              );
            })}
            {isPlatformAdmin && (
              <a href="/admin" style={{ ...adminLinkStyle }}>🛠 Admin</a>
            )}
          </nav>

          <div className="bs-hdr-right">
            {/* Install App button (only show if can install) */}
            {canInstall && (
              <button 
                onClick={triggerInstall}
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
                  transition: 'all 0.2s',
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                title="Install VendrPro as an app"
              >
                📱 Install App
              </button>
            )}
            {/* Plan badge */}
            {plan && plan !== 'none' && (
              <span style={planBadgeStyle(plan)}>{plan.toUpperCase()}</span>
            )}
            {!fbActive && <span className="bs-offline-badge">📴</span>}
            <div className="bs-user-av">{(profile.name || '?')[0].toUpperCase()}</div>
            <button className="bs-logout" onClick={logout} title="Sign out">⏻</button>
            <button className="bs-hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Menu">
              <span className={menuOpen ? 'open' : ''}/><span className={menuOpen ? 'open' : ''}/><span className={menuOpen ? 'open' : ''}/>
            </button>
          </div>
        </header>

        <div className="bs-mobile-tab-label">{currentTab?.label}</div>

        {menuOpen && (
          <div className="bs-mobile-menu">
            {visibleTabs.map(t => {
              const kitchenBadge     = t.id === 'kitchen'     ? (kitchenOrders||[]).filter(o=>o.status==='new'||o.status==='preparing').length : 0;
              const ordersReadyBadge = t.id === 'ordersready' ? (kitchenOrders||[]).filter(o=>o.status==='ready').length : 0;
              const badge = kitchenBadge || ordersReadyBadge;
              return (
                <button
                  key={t.id}
                  className={'bs-mobile-menu-item' + (tab === t.id ? ' active' : '')}
                  onClick={() => switchTab(t.id)}
                >
                  {t.label}
                  {!planAllows(plan, TAB_PLAN[t.id]) && ' 🔒'}
                  {badge > 0 && ` (${badge})`}
                </button>
              );
            })}
            {isPlatformAdmin && (
              <a href="/admin" className="bs-mobile-menu-item" style={{ color: '#c084fc', textDecoration: 'none' }}>
                🛠 Admin Panel
              </a>
            )}
            <div className="bs-mobile-menu-footer">
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {ROLE_LABELS[profile.role]} · {profile.name}
                {plan && plan !== 'none' && ` · ${plan}`}
              </span>
            </div>
          </div>
        )}

        {toast && (
          <div className={'bs-toast ' + (toast.type === 'err' ? 'err' : toast.type === 'info' ? 'info' : 'ok')}>
            {toast.msg}
          </div>
        )}
        <InstallPrompt />
        <SupportWidget profile={profile} settings={settings} />

        <main className="bs-main">
          {/* Plan-locked overlay */}
          {tabLocked && (
            <PlanLockedBanner
              plan={plan}
              required={tabPlanRequired}
              tenantId={tenantId}
              onRefresh={refreshClaims}
              onViewPricing={() => switchTab('pricing')}
            />
          )}

          {/* Tab content — hidden (not unmounted) when locked so state is preserved */}
          {!tabLocked && <>
            {tab === 'dashboard'    && perms.canViewDashboard    && <Dashboard      products={products} sales={sales} workers={workers} profile={profile} settings={settings} categories={categories}/>}
            {tab === 'pos'          && perms.canDoPOS            && <POS            products={products} photos={photos} onSale={handleSale} profile={profile} settings={settings} creditCustomers={creditCustomers} categories={categories}/>}
            {tab === 'kitchen'      && perms.canAccessKitchen    && <KitchenDisplay kitchenOrders={kitchenOrders} onUpdateStatus={updateKitchenOrderStatus} settings={settings}/>}
            {tab === 'ordersready'  && perms.canAccessOrdersReady&& <OrdersReady   kitchenOrders={kitchenOrders} onUpdateStatus={updateKitchenOrderStatus}/>}
            {tab === 'inventory'    && perms.canManageInventory  && <Inventory      products={products} photos={photos} onAdd={handleAddProd} onUpdate={handleUpdateProd} onDelete={handleDelProd} canEdit={perms.canAdjustPrices} canDelete={perms.canDeleteInventory} settings={settings} categories={categories}/>}
            {tab === 'catalogue'    && perms.canManageInventory  && <SharedCatalogue industry={settings?.industry || 'general'} existingProducts={products} onImport={handleImport} settings={settings}/>}
            {tab === 'receive'      && perms.canManageSuppliers  && <ReceiveStock   products={products} suppliers={suppliers} onReceive={handleReceive} onAddProduct={handleAddProd} settings={settings} stockReceipts={stockReceipts} categories={categories}/>}
            {tab === 'payables'     && perms.canManageSuppliers  && <Payables       stockReceipts={stockReceipts} suppliers={suppliers} settings={settings}/>}
            {tab === 'suppliers'    && perms.canManageSuppliers  && <Suppliers      suppliers={suppliers} onAdd={handleAddSupplier} onUpdate={handleUpdSupplier} onDelete={handleDelSupplier}/>}
            {tab === 'reports'      && perms.canViewReports      && <Reports        sales={sales} products={products} workers={workers} settings={settings}/>}
            {tab === 'saleshistory' && perms.canViewReports      && <SalesHistory   sales={sales} products={products} settings={settings} profile={profile}/>}
            {tab === 'workers'      && perms.canAccessWorkers    && <Workers        workers={workers} onAdd={handleAddWorker} onUpdate={handleUpdWorker} onDelete={handleDelWorker} profile={profile} tenantId={tenantId}/>}
            {tab === 'settings'     && perms.canManageWorkers    && <Settings       settings={settings} onSave={handleSettings} profile={profile} onUpdateProfile={handleUpdWorker} workers={workers} onUpdateWorker={handleUpdWorker}/>}
            {tab === 'activitylog'  && perms.canManageWorkers    && <ActivityLog    activityLog={activityLog}/>}
            {tab === 'customers'    && perms.canViewReports      && <CreditCustomers customers={creditCustomers} sales={sales} onAdd={handleAddCust} onUpdate={handleUpdCust} onDelete={handleDelCust} settings={settings}/>}
            {tab === 'appearance'   && perms.canChangeAppearance && <AppearanceSettings settings={settings} onSave={handleSettings}/>}
            {tab === 'pricing'      && <PricingPage tenantId={tenantId} currentPlan={plan} onSuccess={refreshClaims}/>}
          </>}
        </main>
      </div>
    </SubscriptionGate>
  );
}

// ── Plan-locked banner ────────────────────────────────────────────────────────
function PlanLockedBanner({ plan, required, tenantId, onRefresh, onViewPricing }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', textAlign: 'center', padding: '40px 24px',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <h2 style={{ color: '#f1f5f9', marginBottom: 8 }}>
        {required === 'pro' ? 'Pro plan required' : 'Business plan required'}
      </h2>
      <p style={{ color: '#64748b', maxWidth: 380, lineHeight: 1.6, marginBottom: 24 }}>
        This feature is available on the{' '}
        <strong style={{ color: '#38bdf8' }}>{required === 'pro' ? 'Pro ($25/mo)' : 'Business ($59/mo)'}</strong>{' '}
        plan and above. Upgrade to unlock it — or start a free 7-day trial.
      </p>
      <button
        onClick={onViewPricing}
        style={{
          background: '#0ea5e9', border: 'none', borderRadius: 10,
          color: '#fff', fontWeight: 600, fontSize: 15,
          padding: '12px 28px', cursor: 'pointer', marginBottom: 12,
        }}
      >
        View pricing & upgrade →
      </button>
      <button
        onClick={onRefresh}
        style={{ background: 'none', border: '1px solid #1e293b', borderRadius: 8, color: '#64748b', fontSize: 13, padding: '8px 16px', cursor: 'pointer' }}
      >
        ↻ I already upgraded — refresh access
      </button>
    </div>
  );
}

// ── Appearance settings ───────────────────────────────────────────────────────
function AppearanceSettings({ settings, onSave }) {
  const [activeTheme, setActiveTheme] = React.useState(settings?.theme || getSavedTheme() || 'dark-ocean');
  const [fontSize,    setFontSize]    = React.useState(settings?.fontSize || 'md');
  const [saved,       setSaved]       = React.useState(false);

  React.useEffect(() => {
    setActiveTheme(settings?.theme || 'dark-ocean');
    setFontSize(settings?.fontSize || 'md');
  }, [settings]);

  // THEME_LIST imported at top of file

  const darkThemes  = THEME_LIST.filter(t => t.mode === 'dark');
  const lightThemes = THEME_LIST.filter(t => t.mode === 'light');
  const isDark      = THEME_LIST.find(t => t.id === activeTheme)?.mode === 'dark';

  const handleThemeChange = (themeId) => {
    setActiveTheme(themeId);
    applyTheme(themeId);
  };

  const handleSave = async () => {
    await onSave({ ...settings, theme: activeTheme, fontSize });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const SIZES = [
    { id:'sm', label:'Small',   px:'13px', desc:'Compact — more content'      },
    { id:'md', label:'Medium',  px:'15px', desc:'Default — balanced'           },
    { id:'lg', label:'Large',   px:'17px', desc:'Comfortable — easier reading' },
    { id:'xl', label:'X-Large', px:'19px', desc:'Bold — large screens'         },
  ];

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <h2 className="bs-h2" style={{ margin:0 }}>🎨 Appearance</h2>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {saved && <span style={{ color:'var(--bs-success)', fontSize:13 }}>✅ Saved!</span>}
          <button className="bs-pri" style={{ padding:'9px 22px' }} onClick={handleSave}>
            💾 Save Appearance
          </button>
        </div>
      </div>

      {/* ── Dark / Light mode toggle ── */}
      <div style={cardStyle}>
        <p style={sectionLabel}>🌗 Mode</p>
        <div style={{ display:'flex', gap:10 }}>
          {[
            { mode:'dark',  label:'🌙 Dark Mode',  desc:'Easy on eyes in low light' },
            { mode:'light', label:'☀️ Light Mode', desc:'Best in bright environments' },
          ].map(m => {
            const isActive = isDark === (m.mode === 'dark');
            const firstOfMode = THEME_LIST.find(t => t.mode === m.mode);
            return (
              <button key={m.mode}
                onClick={() => firstOfMode && handleThemeChange(firstOfMode.id)}
                style={{
                  flex:1, padding:'14px 12px', borderRadius:10, cursor:'pointer', textAlign:'left',
                  background: isActive ? 'var(--bs-accent-bg)' : 'rgba(255,255,255,.03)',
                  border: `2px solid ${isActive ? 'var(--bs-accent)' : 'var(--bs-border)'}`,
                  color: 'var(--bs-text)',
                }}>
                <p style={{ margin:0, fontSize:15, fontWeight:600 }}>{m.label}</p>
                <p style={{ margin:'3px 0 0', fontSize:12, color:'var(--bs-text3)' }}>{m.desc}</p>
                {isActive && <p style={{ margin:'6px 0 0', fontSize:11, color:'var(--bs-accent)', fontWeight:600 }}>✓ Active</p>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Theme picker ── */}
      <div style={cardStyle}>
        <p style={sectionLabel}>🎨 Colour Theme</p>

        {/* Dark themes */}
        <p style={{ fontSize:11, color:'var(--bs-text3)', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:8 }}>Dark</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:16 }}>
          {darkThemes.map(theme => (
            <ThemeCard key={theme.id} theme={theme} active={activeTheme===theme.id} onSelect={handleThemeChange}/>
          ))}
        </div>

        {/* Light themes */}
        <p style={{ fontSize:11, color:'var(--bs-text3)', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:8 }}>Light</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
          {lightThemes.map(theme => (
            <ThemeCard key={theme.id} theme={theme} active={activeTheme===theme.id} onSelect={handleThemeChange}/>
          ))}
        </div>
      </div>

      {/* ── Font size ── */}
      <div style={cardStyle}>
        <p style={sectionLabel}>🔡 Font Size</p>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {SIZES.map(opt => (
            <button key={opt.id} type="button"
              onClick={() => {
                setFontSize(opt.id);
                document.documentElement.style.setProperty('--bs-font-size', opt.px);
              }}
              style={{
                display:'flex', alignItems:'center', gap:16, padding:'12px 16px',
                borderRadius:10, cursor:'pointer', textAlign:'left',
                border: `1px solid ${fontSize===opt.id ? 'var(--bs-accent)' : 'var(--bs-border)'}`,
                background: fontSize===opt.id ? 'var(--bs-accent-bg)' : 'rgba(255,255,255,.02)',
              }}>
              <span style={{ fontSize:opt.px, fontWeight:700, color:fontSize===opt.id?'var(--bs-accent)':'var(--bs-text3)', minWidth:28 }}>Aa</span>
              <div style={{ flex:1 }}>
                <p style={{ margin:0, fontSize:13, fontWeight:600, color:fontSize===opt.id?'var(--bs-text)':'var(--bs-text3)' }}>
                  {opt.label} <span style={{ fontFamily:'monospace', fontSize:11, color:'var(--bs-text3)' }}>({opt.px})</span>
                </p>
                <p style={{ margin:'2px 0 0', fontSize:11, color:'var(--bs-text3)' }}>{opt.desc}</p>
              </div>
              {fontSize===opt.id && <span style={{ color:'var(--bs-accent)', fontSize:16 }}>✓</span>}
            </button>
          ))}
        </div>

        {/* Live preview */}
        <div style={{ marginTop:14, background:'rgba(0,0,0,.15)', border:'1px dashed var(--bs-border)', borderRadius:8, padding:'12px 16px' }}>
          <p style={{ fontSize:10, color:'var(--bs-text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Preview</p>
          <p style={{ fontSize:'var(--bs-font-size)', fontWeight:700, color:'var(--bs-text)', margin:'0 0 3px' }}>The Great Gatsby · $14.99</p>
          <p style={{ fontSize:'calc(var(--bs-font-size) - 2px)', color:'var(--bs-text2)', margin:0 }}>Stock: 12 · Books · Barcode: 978074327</p>
        </div>
      </div>
    </div>
  );
}

function ThemeCard({ theme, active, onSelect }) {
  return (
    <button onClick={() => onSelect(theme.id)} style={{
      padding:'14px', borderRadius:10, cursor:'pointer', textAlign:'left',
      background: active ? 'var(--bs-accent-bg)' : 'rgba(255,255,255,.02)',
      border: `2px solid ${active ? 'var(--bs-accent)' : 'var(--bs-border)'}`,
      transition:'all .15s', position:'relative',
    }}>
      {active && (
        <span style={{
          position:'absolute', top:8, right:10,
          background:'var(--bs-accent)', color:'var(--bs-bg)',
          fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:8,
        }}>ACTIVE</span>
      )}
      {/* Colour swatches */}
      <div style={{ display:'flex', gap:4, marginBottom:10 }}>
        {theme.preview.map((col, i) => (
          <div key={i} style={{
            width: i === 2 ? 20 : 14, height:20, borderRadius:4,
            background: col, flexShrink:0,
          }}/>
        ))}
      </div>
      <p style={{ margin:'0 0 2px', fontSize:14, fontWeight:600, color:'var(--bs-text)' }}>
        {theme.emoji} {theme.name}
      </p>
      <p style={{ margin:0, fontSize:11, color:'var(--bs-text3)' }}>{theme.desc}</p>
    </button>
  );
}

const cardStyle = {
  background: 'var(--bs-card)',
  border: '1px solid var(--bs-border)',
  borderRadius: 12,
  padding: '18px 20px',
  marginBottom: 16,
};

const sectionLabel = {
  margin: '0 0 12px',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--bs-text2)',
};


const adminLinkStyle = {
  padding: '4px 12px', borderRadius: 6, fontSize: 13,
  color: '#c084fc', textDecoration: 'none',
  background: 'rgba(192,132,252,0.1)',
  border: '1px solid rgba(192,132,252,0.2)',
};

const planBadgeStyle = (plan) => ({
  fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
  padding: '2px 8px', borderRadius: 10,
  background: plan === 'business' ? 'rgba(192,132,252,.15)' : plan === 'pro' ? 'rgba(56,189,248,.15)' : 'rgba(74,222,128,.15)',
  color:      plan === 'business' ? '#c084fc'               : plan === 'pro' ? '#38bdf8'               : '#4ade80',
});
