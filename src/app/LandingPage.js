// ─────────────────────────────────────────────────────────────────────────────
// LandingPage.js  —  Marketing landing page with embedded login/signup
// Shown when the user is not authenticated. Once logged in, BookShelf takes over.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import LoginPage from './LoginPage';
import logo from './images/four-beans-logo.png';
import './LandingPage.css';

export default function LandingPage({ onLogin, loading }) {
  return (
    <div className="lp-root">

      {/* ── NAV ── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <a className="lp-logo" href="/">
            <div className="lp-logo-mark"><img src={logo} alt="The Four Beans" /></div>
            <span className="lp-logo-text">The Four <span>Beans</span></span>
          </a>
          <ul className="lp-nav-links">
            <li><a href="#lp-features">Features</a></li>
            <li><a href="#lp-how">How it works</a></li>
            <li><a href="#lp-pricing">Pricing</a></li>
            <li><a href="#lp-faq">FAQ</a></li>
          </ul>
          <a
            className="lp-btn lp-btn-primary"
            href="#lp-login"
            onClick={e => { e.preventDefault(); document.getElementById('lp-login').scrollIntoView({ behavior: 'smooth' }); }}
          >
            Sign in / Register
          </a>
        </div>
      </nav>

      <main>

        {/* ── HERO SPLIT ── */}
        <section className="lp-hero" id="lp-home">
          <div className="lp-orb lp-orb-1" />
          <div className="lp-orb lp-orb-2" />
          <div className="lp-orb lp-orb-3" />
          <div className="lp-hero-split">

            {/* LEFT */}
            <div className="lp-hero-left">
              <div className="lp-eyebrow">
                <span className="lp-eyebrow-dot" />
                Built for The Four Beans Coffee Co.
              </div>
              <h1 className="lp-h1">
                <span className="lp-accent">Run your café.</span><br />
                Not your<br />
                <span className="lp-dim">spreadsheet.</span>
              </h1>
              <p className="lp-hero-sub">
                The Four Beans POS is the all-in-one platform for our coffee truck and store —
                point of sale, inventory, staff, reports and suppliers — purpose-built for
                good coffee, good people and good times.
              </p>
              <div className="lp-trust">
                <span className="lp-trust-item">🔒 No credit card needed</span>
                <span className="lp-trust-item">🇦🇺 GST-compliant receipts</span>
                <span className="lp-trust-item">📲 Works on any device</span>
              </div>
            </div>

            {/* RIGHT — actual LoginPage component */}
            <div className="lp-hero-right" id="lp-login">
              <div className="lp-login-wrap">
                <LoginPage onLogin={onLogin} loading={loading} />
              </div>
            </div>

          </div>
        </section>

        {/* ── WHAT WE SERVE ── */}
        <div className="lp-industries">
          <div className="lp-container">
            <p className="lp-industries-label">One system for every part of The Four Beans</p>
            <div className="lp-chips">
              <span className="lp-chip">☕ Coffee Truck</span>
              <span className="lp-chip">🏬 Storefront</span>
              <span className="lp-chip">🥐 Bakery &amp; Snacks</span>
              <span className="lp-chip">📦 Bean &amp; Merch Sales</span>
              <span className="lp-chip">🎉 Catering &amp; Events</span>
              <span className="lp-chip">🤝 Loyalty Customers</span>
            </div>
          </div>
        </div>

        {/* ── STATS ── */}
        <section>
          <div className="lp-container">
            <div className="lp-stats">
              <div className="lp-stat"><span className="lp-stat-num">10+</span><span className="lp-stat-label">Café modules</span></div>
              <div className="lp-stat"><span className="lp-stat-num">100%</span><span className="lp-stat-label">Cloud &amp; offline-ready</span></div>
              <div className="lp-stat"><span className="lp-stat-num">$0</span><span className="lp-stat-label">To get started</span></div>
              <div className="lp-stat"><span className="lp-stat-num">GST</span><span className="lp-stat-label">Compliant out of the box</span></div>
            </div>
          </div>
        </section>

        {/* ── FEATURES ── */}
        <section id="lp-features">
          <div className="lp-container">
            <div className="lp-section-head">
              <p className="lp-eyebrow-sm">Everything you need</p>
              <h2>One platform.<br /><span className="lp-accent">Every counter need.</span></h2>
              <p className="lp-section-sub">From pulling shots to restocking beans — The Four Beans POS covers the full café workflow without the complexity.</p>
            </div>
            <div className="lp-features-grid">
              <div className="lp-feat lp-feat-wide">
                <div className="lp-feat-icon">☕</div>
                <h3>Point of Sale</h3>
                <p>Fast, reliable checkout with item/name search, quantity controls, discounts, split payments and GST-inclusive receipts. Built for the morning rush.</p>
                <div className="lp-tags">
                  <span className="lp-tag">Quick item search</span>
                  <span className="lp-tag">Split payments</span>
                  <span className="lp-tag">GST receipts</span>
                  <span className="lp-tag">Offline mode</span>
                </div>
              </div>
              <div className="lp-feat">
                <div className="lp-feat-icon">📦</div>
                <h3>Inventory Management</h3>
                <p>Live stock levels for beans, milk and merch, low-stock alerts, reorder points and bulk CSV import. Always know what you have.</p>
              </div>
              <div className="lp-feat">
                <div className="lp-feat-icon">👷</div>
                <h3>Staff &amp; Workers</h3>
                <p>Role-based access for Owner, Manager and Barista. Each role sees only what they need.</p>
              </div>
              <div className="lp-feat">
                <div className="lp-feat-icon">📊</div>
                <h3>Reports &amp; Analytics</h3>
                <p>Daily, weekly and monthly sales breakdowns, top sellers, category performance and profit tracking.</p>
              </div>
              <div className="lp-feat">
                <div className="lp-feat-icon">🤝</div>
                <h3>Credit Customers</h3>
                <p>Extend store credit, track balances and record repayments. Perfect for regulars and account customers.</p>
              </div>
              <div className="lp-feat">
                <div className="lp-feat-icon">🚚</div>
                <h3>Suppliers &amp; Payables</h3>
                <p>Log roaster and supplier invoices, track what you owe and reconcile purchases against received stock.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section id="lp-how" className="lp-alt-section">
          <div className="lp-container">
            <div className="lp-section-head">
              <p className="lp-eyebrow-sm">Simple setup</p>
              <h2>Up and running<br /><span className="lp-accent">in minutes.</span></h2>
              <p className="lp-section-sub">No training, no installation, no IT team required.</p>
            </div>
            <div className="lp-steps">
              <div className="lp-step">
                <div className="lp-step-num">STEP 01</div>
                <h3>Create your store</h3>
                <p>Sign up with your business name and email. The Four Beans POS provisions your store and first admin account instantly.</p>
              </div>
              <div className="lp-step">
                <div className="lp-step-num">STEP 02</div>
                <h3>Add your menu</h3>
                <p>Type in your drinks and snacks or bulk-import from a CSV. Set prices, categories and stock levels in minutes.</p>
              </div>
              <div className="lp-step">
                <div className="lp-step-num">STEP 03</div>
                <h3>Start selling</h3>
                <p>Open the POS, search or tap items, take payment and print a GST-compliant receipt. Done.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── PRICING ── */}
        <section id="lp-pricing">
          <div className="lp-container">
            <div className="lp-section-head">
              <p className="lp-eyebrow-sm">Simple, transparent pricing</p>
              <h2>Start free.<br /><span className="lp-accent">Scale when ready.</span></h2>
              <p className="lp-section-sub">No lock-in contracts, no hidden fees. Every plan includes a free trial.</p>
            </div>
            <div className="lp-pricing-grid">
              <div className="lp-price-card">
                <div className="lp-plan-name">Starter</div>
                <div className="lp-price-row"><span className="lp-price-sym">$</span><span className="lp-price-num" style={{color:'var(--lp-text)'}}>0</span></div>
                <p className="lp-price-desc">Free trial — full feature access, no card required.</p>
                <ul className="lp-price-feats">
                  <li>Full POS &amp; inventory</li>
                  <li>Up to 3 staff accounts</li>
                  <li>Sales reports &amp; dashboard</li>
                  <li>GST-compliant receipts</li>
                  <li className="lp-off">Supplier &amp; payables module</li>
                  <li className="lp-off">Bulk import</li>
                </ul>
                <button className="lp-btn lp-btn-outline lp-btn-block">Start free trial</button>
              </div>
              <div className="lp-price-card lp-featured">
                <div className="lp-popular">Most popular</div>
                <div className="lp-plan-name">Pro</div>
                <div className="lp-price-row"><span className="lp-price-sym">$</span><span className="lp-price-num" style={{color:'var(--lp-accent)'}}>29</span><span className="lp-price-per">/ mo</span></div>
                <p className="lp-price-desc">Everything The Four Beans needs to grow, AUD.</p>
                <ul className="lp-price-feats">
                  <li>Full POS &amp; inventory</li>
                  <li>Unlimited staff accounts</li>
                  <li>Advanced reports &amp; analytics</li>
                  <li>GST-compliant receipts</li>
                  <li>Supplier &amp; payables module</li>
                  <li>Bulk product import</li>
                </ul>
                <button className="lp-btn lp-btn-primary lp-btn-block">Get started</button>
              </div>
              <div className="lp-price-card">
                <div className="lp-plan-name">Enterprise</div>
                <div className="lp-price-row"><span className="lp-price-num" style={{color:'var(--lp-text)',fontSize:'2rem'}}>Custom</span></div>
                <p className="lp-price-desc">Multi-location, bespoke integrations and SLA support.</p>
                <ul className="lp-price-feats">
                  <li>Everything in Pro</li>
                  <li>Multi-store management</li>
                  <li>Dedicated onboarding</li>
                  <li>Priority phone support</li>
                  <li>SLA &amp; uptime guarantees</li>
                </ul>
                <a href="mailto:hello@thefourbeans.com.au" className="lp-btn lp-btn-outline lp-btn-block">Contact us</a>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="lp-faq" className="lp-alt-section">
          <div className="lp-container">
            <div className="lp-section-head">
              <p className="lp-eyebrow-sm">FAQ</p>
              <h2>Common <span className="lp-accent">questions</span></h2>
            </div>
            <div className="lp-faq-grid">
              {[
                ['Do I need to install anything?', 'No. The Four Beans POS is a Progressive Web App — it runs in your browser and can be added to your home screen for a full-screen experience.'],
                ['Does it work offline?', 'The Four Beans POS uses a service worker that caches the app shell. Core features sync automatically when you\'re back online.'],
                ['Is it GST compliant?', 'Yes. The Four Beans POS generates GST-inclusive receipts with configurable GST rates (default 10%) and sequential receipt numbering.'],
                ['Can I import my product list?', 'Absolutely. The Bulk Import module accepts CSV files — map columns, preview, and confirm in one step.'],
                ['What currencies are supported?', 'AUD by default, but any currency symbol can be set in Settings.'],
                ['How does the free trial work?', 'Sign up and get full access immediately — no credit card required. Choose a plan when your trial ends.'],
                ['How many staff can I add?', 'Starter supports up to 3 staff. Pro includes unlimited staff with Owner, Manager and Barista roles.'],
                ['Is my data secure?', 'The Four Beans POS runs on Firebase (Google Cloud) with data encrypted in transit and at rest, and per-user security rules.'],
              ].map(([q, a]) => (
                <div className="lp-faq-item" key={q}>
                  <h3>{q}</h3>
                  <p>{a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="lp-cta-section">
          <div className="lp-container">
            <div className="lp-cta-box">
              <p className="lp-eyebrow-sm">Ready to simplify the counter?</p>
              <h2>Your café deserves<br /><span className="lp-accent">better tools.</span></h2>
              <p>Run The Four Beans Coffee Co. without the spreadsheets. Get running in minutes — free.</p>
              <div className="lp-cta-actions">
                <button
                  className="lp-btn lp-btn-primary lp-btn-lg"
                  onClick={() => document.getElementById('lp-login').scrollIntoView({ behavior: 'smooth' })}
                >
                  Start free trial — no card needed
                </button>
                <a href="mailto:hello@thefourbeans.com.au" className="lp-btn lp-btn-ghost lp-btn-lg">Talk to us</a>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-inner">
            <div className="lp-footer-brand">
              <div className="lp-logo">
                <div className="lp-logo-mark"><img src={logo} alt="The Four Beans" /></div>
                <span className="lp-logo-text">The Four <span>Beans</span></span>
              </div>
              <p>Good coffee, good people, good times — point of sale built for our truck and store.</p>
              <p className="lp-footer-note">Built in Australia 🇦🇺</p>
            </div>
            <div className="lp-footer-col"><h4>Product</h4><ul><li><a href="#lp-features">Features</a></li><li><a href="#lp-pricing">Pricing</a></li><li><a href="#lp-how">How it works</a></li></ul></div>
            <div className="lp-footer-col"><h4>Modules</h4><ul><li><a href="#lp-features">Point of Sale</a></li><li><a href="#lp-features">Inventory</a></li><li><a href="#lp-features">Reports</a></li><li><a href="#lp-features">Staff</a></li></ul></div>
            <div className="lp-footer-col"><h4>Company</h4><ul><li><a href="mailto:hello@thefourbeans.com.au">Contact</a></li><li><a href="/privacy">Privacy Policy</a></li><li><a href="/terms">Terms of Service</a></li></ul></div>
          </div>
          <div className="lp-footer-bottom">
            <p>© 2026 The Four Beans Coffee Co. All rights reserved. ABN 00 000 000 000.</p>
            <div className="lp-footer-links">
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
              <a href="mailto:hello@thefourbeans.com.au">Contact</a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
