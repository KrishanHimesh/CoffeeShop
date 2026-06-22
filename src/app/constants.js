export const ROLES = {
  OWNER:    'owner',
  MANAGER:  'manager',
  CASHIER:  'cashier',
  KITCHEN:  'kitchen',
  ORDERS:   'orders',
};

export const ROLE_LABELS = {
  owner:   '👑 Owner',
  manager: '🔧 Manager',
  cashier: '🛒 Cashier',
  kitchen: '👨‍🍳 Kitchen Staff',
  orders:  '🔔 Orders Ready',
};

export const ROLE_PERMISSIONS = {
  owner: {
    canViewDashboard:  true,
    canManageWorkers:  true,
    canManageInventory:true,
    canViewReports:    true,
    canDeleteSales:    true,
    canDeleteInventory:true,
    canAdjustPrices:   true,
    canViewAllSales:   true,
    canDoPOS:          true,
    canManageSuppliers:true,
    canChangeAppearance:true,
    canAccessWorkers:true,
    canAccessKitchen:  true,
    canAccessOrdersReady:true,
  },
  manager: {
    canViewDashboard:  true,
    canManageWorkers:  false,
    canManageInventory:true,
    canViewReports:    true,
    canDeleteSales:    false,
    canDeleteInventory:false,
    canAdjustPrices:   true,
    canViewAllSales:   true,
    canDoPOS:          true,
    canManageSuppliers:true,
    canChangeAppearance:true,
    canAccessWorkers:true,
    canAccessKitchen:  true,
    canAccessOrdersReady:true,
  },
  cashier: {
    canViewDashboard:  false,
    canManageWorkers:  false,
    canManageInventory:false,
    canViewReports:    false,
    canDeleteSales:    false,
    canAdjustPrices:   false,
    canViewAllSales:   false,
    canDoPOS:          true,
    canManageSuppliers:false,
    canChangeAppearance:true,
    canAccessWorkers:true,
    canAccessKitchen:  false,
    canAccessOrdersReady:false,
  },
  kitchen: {
    canViewDashboard:  false,
    canManageWorkers:  false,
    canManageInventory:true,
    canViewReports:    false,
    canDeleteSales:    false,
    canDeleteInventory:false,
    canAdjustPrices:   false,
    canViewAllSales:   false,
    canDoPOS:          false,
    canManageSuppliers:false,
    canChangeAppearance:true,
    canAccessWorkers:true,
    canAccessKitchen:  true,
    canAccessOrdersReady:true,
  },
  orders: {
    canViewDashboard:  false,
    canManageWorkers:  false,
    canManageInventory:false,
    canViewReports:    false,
    canDeleteSales:    false,
    canDeleteInventory:false,
    canAdjustPrices:   false,
    canViewAllSales:   false,
    canDoPOS:          false,
    canManageSuppliers:false,
    canChangeAppearance:false,
    canAccessWorkers:true,
    canAccessKitchen:  false,
    canAccessOrdersReady:true,
  },
};

export const CATEGORIES = {
  Coffee:      { icon:'☕', color:'#6f4e37' },
  Tea:         { icon:'🍵', color:'#84cc16' },
  'Cold Drinks':{ icon:'🧃', color:'#4ea8de' },
  Pastries:    { icon:'🥐', color:'#d4a373' },
  Food:        { icon:'🥪', color:'#f4a261' },
  Desserts:    { icon:'🍰', color:'#e879f9' },
  Retail:      { icon:'🛍️', color:'#818cf8' },
  Other:       { icon:'📦', color:'#fb923c' },
};

// Format number with commas and space between symbol and amount
// e.g. makeFmt('Rs.')(1253) → 'Rs. 1,253.00'
export const makeFmt = sym => n => {
  const num = Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym + ' ' + num;
};

export const fmt = (n, sym = '$') => {
  const num = Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym + ' ' + num;
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const PAYMENT_TERMS = [
  '7 days', '14 days', '30 days', '45 days', '60 days', '90 days', 'COD', 'Prepaid', 'Custom'
];

// Merge built-in categories with custom ones from settings
// customCategories: [{ name, icon, color }]
export function buildCategories(customCategories) {
  const merged = { ...CATEGORIES };
  (customCategories || []).forEach(c => {
    if (c.name && !merged[c.name]) {
      merged[c.name] = { icon: c.icon || '📦', color: c.color || '#64748b' };
    }
  });
  return merged;
}
