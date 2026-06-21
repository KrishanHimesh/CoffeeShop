import React, { useState, useEffect } from 'react';

// Hook to expose install state for use in other components
export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Listen for install prompt
    const handler = e => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setCanInstall(false);
    }
    setDeferredPrompt(null);
    return outcome === 'accepted';
  };

  return { canInstall, install, isInstalled };
}

export default function InstallPrompt() {
  const [prompt,     setPrompt]     = useState(null);  // Android/Chrome install event
  const [showIOS,    setShowIOS]    = useState(false); // iOS manual instructions
  const [dismissed,  setDismissed]  = useState(false);
  const [installed,  setInstalled]  = useState(false);
  const [updateReady,setUpdateReady]= useState(false);

  useEffect(() => {
    // Already installed as PWA?
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }

    // Dismissed before?
    if (localStorage.getItem('pwa_dismissed') === 'true') {
      setDismissed(true);
      return;
    }

    // Android / Chrome — intercept install prompt
    const handler = e => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS detection (Safari on iPhone/iPad)
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isIOS && isSafari && !installed) {
      setTimeout(() => setShowIOS(true), 1000); // Show after 1 second
    }

    // App update available
    window.addEventListener('swUpdate', () => setUpdateReady(true));

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [installed]);

  const handleInstall = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setPrompt(null);
  };

  const dismiss = () => {
    setDismissed(true);
    setShowIOS(false);
    localStorage.setItem('pwa_dismissed', 'true');
  };

  const reload = () => window.location.reload();

  // Update available banner
  if (updateReady) return (
    <div style={bannerStyle('#1a2540', '#38bdf8')}>
      <span style={{fontSize:'13px'}}>🔄 New version available</span>
      <div style={{display:'flex',gap:'8px'}}>
        <button onClick={reload} style={btnStyle('#38bdf8','#0d1526')}>Update now</button>
        <button onClick={()=>setUpdateReady(false)} style={btnStyle('transparent','#94a3b8',true)}>Later</button>
      </div>
    </div>
  );

  // Already installed
  if (installed || dismissed) return null;

  // Android / Chrome install banner
  if (prompt) return (
    <div style={bannerStyle('#1a2540','#38bdf8')}>
      <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
        <img src="/icons/icon-72.png" alt="icon" style={{width:36,height:36,borderRadius:8}} />
        <div>
          <p style={{fontSize:'13px',fontWeight:600,color:'#f0f4ff',margin:0}}>Install VendrPro</p>
          <p style={{fontSize:'11px',color:'#94a3b8',margin:0}}>Add to home screen for quick access</p>
        </div>
      </div>
      <div style={{display:'flex',gap:'8px',flexShrink:0}}>
        <button onClick={handleInstall} style={btnStyle('#38bdf8','#0d1526')}>Install</button>
        <button onClick={dismiss} style={btnStyle('transparent','#94a3b8',true)}>✕</button>
      </div>
    </div>
  );

  // iOS Safari instructions
  if (showIOS) return (
    <div style={{...bannerStyle('#1a2540','#38bdf8'), flexDirection:'column', alignItems:'flex-start', gap:'8px'}}>
      <div style={{display:'flex',justifyContent:'space-between',width:'100%',alignItems:'center'}}>
        <p style={{fontSize:'13px',fontWeight:600,color:'#f0f4ff',margin:0}}>📲 Install on iPhone / iPad</p>
        <button onClick={dismiss} style={btnStyle('transparent','#94a3b8',true)}>✕</button>
      </div>
      <p style={{fontSize:'12px',color:'#94a3b8',margin:0,lineHeight:1.6}}>
        Tap the <strong style={{color:'#38bdf8'}}>Share button</strong> (↑) at the bottom of Safari, then tap <strong style={{color:'#38bdf8'}}>"Add to Home Screen"</strong>
      </p>
    </div>
  );

  return null;
}

const bannerStyle = (bg, border) => ({
  position: 'fixed',
  bottom: '16px',
  left: '16px',
  right: '16px',
  zIndex: 9999,
  background: bg,
  border: `1px solid ${border}`,
  borderRadius: '12px',
  padding: '12px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  flexWrap: 'wrap',
});

const btnStyle = (bg, color, outline = false) => ({
  background: bg,
  color: color,
  border: outline ? `1px solid #334155` : 'none',
  borderRadius: '7px',
  padding: '7px 16px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: 'Inter, sans-serif',
});
