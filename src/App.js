// ─────────────────────────────────────────────────────────────────────────────
// App.js  —  VendrPro standalone entry
//
// No portfolio wrapper, no Navbar/Footer.
// Just the BookShelf app at / and the Admin panel at /admin.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Analytics } from '@vercel/analytics/react';
import BookShelf  from './app/BookShelf';
import AdminPanel from './app/AdminPanel';
import './index.css';

export default function App() {
  // Simple client-side routing without react-router dependency
  const path = window.location.pathname;

  if (path === '/admin' || path === '/admin/') {
    return (
      <>
        <AdminPanel />
        <Analytics />
      </>
    );
  }

  return (
    <>
      <BookShelf />
      <Analytics />
    </>
  );
}
