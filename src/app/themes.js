// ─────────────────────────────────────────────────────────────────────────────
// themes.js  —  VendrPro theme system
//
// Each theme defines CSS custom properties applied to :root.
// All component colours reference these vars so switching themes is instant.
// ─────────────────────────────────────────────────────────────────────────────

export const THEMES = {
  // ── DARK THEMES ────────────────────────────────────────────────────────────

  'dark-ocean': {
    id:    'dark-ocean',
    name:  'Ocean Dark',
    mode:  'dark',
    emoji: '🌊',
    desc:  'Default deep blue — easy on the eyes',
    preview: ['#0d1526','#1a2540','#38bdf8'],
    vars: {
      '--bs-bg':         '#0d1526',
      '--bs-bg2':        '#1a2540',
      '--bs-bg3':        '#243155',
      '--bs-surface':    '#1e2d4a',
      '--bs-border':     '#2a3a5c',
      '--bs-border2':    '#334155',
      '--bs-text':       '#e2e8f0',
      '--bs-text2':      '#94a3b8',
      '--bs-text3':      '#64748b',
      '--bs-accent':     '#38bdf8',
      '--bs-accent-bg':  'rgba(56,189,248,.12)',
      '--bs-accent2':    '#818cf8',
      '--bs-accent3':    '#34d399',
      '--bs-danger':     '#f87171',
      '--bs-warning':    '#fbbf24',
      '--bs-success':    '#4ade80',
      '--bs-card':       '#1a2540',
      '--bs-input':      '#0d1526',
      '--bs-shadow':     '0 4px 20px rgba(0,0,0,.4)',
      '--bs-radius':     '10px',
    },
  },

  'dark-midnight': {
    id:    'dark-midnight',
    name:  'Midnight',
    mode:  'dark',
    emoji: '🌙',
    desc:  'Pure black with purple accents',
    preview: ['#080810','#12121f','#a78bfa'],
    vars: {
      '--bs-bg':         '#080810',
      '--bs-bg2':        '#12121f',
      '--bs-bg3':        '#1a1a2e',
      '--bs-surface':    '#16162a',
      '--bs-border':     '#252540',
      '--bs-border2':    '#333355',
      '--bs-text':       '#e8e8ff',
      '--bs-text2':      '#9898cc',
      '--bs-text3':      '#6666aa',
      '--bs-accent':     '#a78bfa',
      '--bs-accent-bg':  'rgba(167,139,250,.12)',
      '--bs-accent2':    '#f472b6',
      '--bs-accent3':    '#34d399',
      '--bs-danger':     '#f87171',
      '--bs-warning':    '#fbbf24',
      '--bs-success':    '#4ade80',
      '--bs-card':       '#12121f',
      '--bs-input':      '#080810',
      '--bs-shadow':     '0 4px 24px rgba(0,0,0,.6)',
      '--bs-radius':     '10px',
    },
  },

  'dark-forest': {
    id:    'dark-forest',
    name:  'Forest Dark',
    mode:  'dark',
    emoji: '🌿',
    desc:  'Deep green — calm and focused',
    preview: ['#0a1a0f','#132b1a','#34d399'],
    vars: {
      '--bs-bg':         '#0a1a0f',
      '--bs-bg2':        '#132b1a',
      '--bs-bg3':        '#1a3a22',
      '--bs-surface':    '#162e1e',
      '--bs-border':     '#1e4028',
      '--bs-border2':    '#2a5535',
      '--bs-text':       '#d1fae5',
      '--bs-text2':      '#6ee7b7',
      '--bs-text3':      '#4ade80',
      '--bs-accent':     '#34d399',
      '--bs-accent-bg':  'rgba(52,211,153,.12)',
      '--bs-accent2':    '#38bdf8',
      '--bs-accent3':    '#a78bfa',
      '--bs-danger':     '#f87171',
      '--bs-warning':    '#fbbf24',
      '--bs-success':    '#4ade80',
      '--bs-card':       '#132b1a',
      '--bs-input':      '#0a1a0f',
      '--bs-shadow':     '0 4px 20px rgba(0,0,0,.5)',
      '--bs-radius':     '10px',
    },
  },

  'dark-ember': {
    id:    'dark-ember',
    name:  'Ember',
    mode:  'dark',
    emoji: '🔥',
    desc:  'Dark charcoal with warm orange glow',
    preview: ['#150d08','#241408','#fb923c'],
    vars: {
      '--bs-bg':         '#150d08',
      '--bs-bg2':        '#241408',
      '--bs-bg3':        '#301c0a',
      '--bs-surface':    '#2a180a',
      '--bs-border':     '#3d2210',
      '--bs-border2':    '#4f2e14',
      '--bs-text':       '#fde8d0',
      '--bs-text2':      '#d4956a',
      '--bs-text3':      '#9a6040',
      '--bs-accent':     '#fb923c',
      '--bs-accent-bg':  'rgba(251,146,60,.12)',
      '--bs-accent2':    '#f43f5e',
      '--bs-accent3':    '#fbbf24',
      '--bs-danger':     '#f87171',
      '--bs-warning':    '#fbbf24',
      '--bs-success':    '#4ade80',
      '--bs-card':       '#241408',
      '--bs-input':      '#150d08',
      '--bs-shadow':     '0 4px 20px rgba(0,0,0,.5)',
      '--bs-radius':     '10px',
    },
  },

  // ── LIGHT THEMES ───────────────────────────────────────────────────────────

  'light-cloud': {
    id:    'light-cloud',
    name:  'Cloud Light',
    mode:  'light',
    emoji: '☁️',
    desc:  'Clean white — great for bright environments',
    preview: ['#f0f4f8','#ffffff','#0ea5e9'],
    vars: {
      '--bs-bg':         '#f0f4f8',
      '--bs-bg2':        '#ffffff',
      '--bs-bg3':        '#e8f0f8',
      '--bs-surface':    '#f8fbff',
      '--bs-border':     '#d0dce8',
      '--bs-border2':    '#b8cce0',
      '--bs-text':       '#0f172a',
      '--bs-text2':      '#374151',
      '--bs-text3':      '#6b7280',
      '--bs-accent':     '#0ea5e9',
      '--bs-accent-bg':  'rgba(14,165,233,.1)',
      '--bs-accent2':    '#6366f1',
      '--bs-accent3':    '#10b981',
      '--bs-danger':     '#ef4444',
      '--bs-warning':    '#f59e0b',
      '--bs-success':    '#10b981',
      '--bs-card':       '#ffffff',
      '--bs-input':      '#f8fbff',
      '--bs-shadow':     '0 2px 12px rgba(0,0,0,.08)',
      '--bs-radius':     '10px',
    },
  },

  'light-warm': {
    id:    'light-warm',
    name:  'Warm Parchment',
    mode:  'light',
    emoji: '📜',
    desc:  'Warm cream tones — easy reading',
    preview: ['#faf7f2','#fff9f0','#d97706'],
    vars: {
      '--bs-bg':         '#faf7f2',
      '--bs-bg2':        '#fff9f0',
      '--bs-bg3':        '#f5ede0',
      '--bs-surface':    '#fffbf5',
      '--bs-border':     '#e8d8c0',
      '--bs-border2':    '#d4b896',
      '--bs-text':       '#1c1009',
      '--bs-text2':      '#4a3728',
      '--bs-text3':      '#7a5f48',
      '--bs-accent':     '#d97706',
      '--bs-accent-bg':  'rgba(217,119,6,.1)',
      '--bs-accent2':    '#9333ea',
      '--bs-accent3':    '#16a34a',
      '--bs-danger':     '#dc2626',
      '--bs-warning':    '#d97706',
      '--bs-success':    '#16a34a',
      '--bs-card':       '#fff9f0',
      '--bs-input':      '#fffbf5',
      '--bs-shadow':     '0 2px 12px rgba(100,60,0,.1)',
      '--bs-radius':     '10px',
    },
  },
};

// Ordered list for the UI
export const THEME_LIST = Object.values(THEMES);

// Apply a theme to :root CSS variables
export function applyTheme(themeId) {
  const theme = THEMES[themeId] || THEMES['dark-ocean'];
  const root  = document.documentElement;

  Object.entries(theme.vars).forEach(([key, val]) => {
    root.style.setProperty(key, val);
  });

  // Set data-theme attribute for any CSS selectors that need it
  root.setAttribute('data-theme', theme.mode);

  // Store in localStorage for persistence across sessions
  localStorage.setItem('bs_theme', themeId);

  return theme;
}

// Read saved theme from localStorage
export function getSavedTheme() {
  return localStorage.getItem('bs_theme') || 'dark-ocean';
}
