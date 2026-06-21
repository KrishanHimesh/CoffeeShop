# Enterprise Upgrade — Integration Guide

This package contains 7 files that replace and extend your existing codebase.
Follow these steps in order.

---

## Files delivered

| File | Replaces / Extends | Purpose |
|---|---|---|
| `src/apps/bookshelf/firebase.js` | Replaces original | Env vars, no hard-coded keys |
| `.env.example` | New | Template for environment variables |
| `firestore/firestore.rules` | New | Full security rules with tenant isolation |
| `firestore/storage.rules` | Replaces original | Storage rules for tenant-scoped photos |
| `src/apps/bookshelf/useStore.js` | Replaces original | Tenant paths, Storage photos, plan awareness |
| `functions/index.js` | New | Cloud Functions: tenant provisioning + Stripe |
| `functions/package.json` | New | Functions dependencies |
| `src/apps/bookshelf/AdminPanel.js` | New | Your admin UI for shared catalogues |
| `src/apps/bookshelf/SubscriptionGate.js` | New | Stripe billing UI + subscription gate |

---

## Step 1 — Environment variables

```bash
cp .env.example .env
```

Fill in `.env` with your values from:
- **Firebase Console** → Project Settings → Your Apps → Web app
- **Stripe Dashboard** → Developers → API keys
- Your deployed Cloud Functions URL (fill in after Step 5)

Add `.env` to `.gitignore` immediately:
```
echo ".env" >> .gitignore
```

---

## Step 2 — Deploy Firestore security rules

```bash
# From your project root (where firebase.json lives)
firebase deploy --only firestore:rules
```

Also deploy Storage rules:
```bash
firebase deploy --only storage
```

---

## Step 3 — Deploy Cloud Functions

```bash
cd functions
npm install

# Set secrets (replace with your real values)
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase functions:secrets:set ADMIN_EMAIL
firebase functions:secrets:set APP_URL

cd ..
firebase deploy --only functions
```

After deploy, copy your functions base URL to `.env`:
```
REACT_APP_FUNCTIONS_BASE_URL=https://us-central1-YOUR-PROJECT.cloudfunctions.net
```

---

## Step 4 — Set up Stripe

1. **Create products in Stripe Dashboard** → Products → Add product
   - Create 3 products: Starter, Pro, Business
   - Each with monthly and annual prices
   - Copy the Price IDs (start with `price_...`) into `SubscriptionGate.js`

2. **Set up webhook** in Stripe Dashboard → Developers → Webhooks:
   - Endpoint URL: `https://us-central1-YOUR-PROJECT.cloudfunctions.net/stripeWebhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `invoice.payment_failed`
   - Copy the webhook signing secret → set as `STRIPE_WEBHOOK_SECRET`

---

## Step 5 — Wire up the new components in BookShelf.js

Replace the main `BookShelf.js` app wrapper to include the subscription gate:

```jsx
// At the top of BookShelf.js, add these imports:
import { SubscriptionGate } from './bookshelf/SubscriptionGate';

// In the return, wrap the main content:
if (!user) return <LoginPage onLogin={login} loading={loading} />;

return (
  <SubscriptionGate plan={plan} tenantId={tenantId} onRefresh={refreshClaims}>
    {/* ... your existing tabs and content ... */}
  </SubscriptionGate>
);
```

Also add the `plan` and `tenantId` from `useStore`:
```jsx
const { user, profile, plan, tenantId, refreshClaims, ... } = store;
```

---

## Step 6 — Add Admin Panel route

In `App.js`, add a route for `/admin`:

```jsx
import AdminPanel from './apps/bookshelf/AdminPanel';

// In your router:
<Route path="/admin" element={<AdminPanel />} />
```

Access it at `yourdomain.com/admin`. It checks for `platformAdmin:true` claim.

**Set your own admin claim** in Firebase Console:
- Authentication → your user → Edit → Custom claims:
  ```json
  { "platformAdmin": true }
  ```

---

## Step 7 — Set platformAdmin on your account

Firebase Console → Authentication → find your email → three-dot menu → Edit user → Custom claims:
```json
{ "platformAdmin": true, "tenantId": "your-store-id", "role": "owner", "plan": "business" }
```

---

## Data migration from old structure

If you have existing data in the flat collections (`/products`, `/sales`, etc.),
run this one-time migration script in your Firebase Console (Cloud Shell or local):

```js
// migration.js — run once with: node migration.js
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const YOUR_TENANT_ID = 'your-store-abc'; // the tenantId assigned to your store
const COLLECTIONS = ['products', 'sales', 'workers', 'suppliers',
                     'creditCustomers', 'stockReceipts', 'activityLog'];

async function migrate() {
  for (const col of COLLECTIONS) {
    const snap = await db.collection(col).get();
    console.log(`Migrating ${snap.size} docs from /${col}...`);
    const batch = db.batch();
    snap.docs.forEach(d => {
      const newRef = db.doc(`stores/${YOUR_TENANT_ID}/${col}/${d.id}`);
      batch.set(newRef, d.data());
    });
    await batch.commit();
    console.log(`  Done.`);
  }

  // Migrate settings
  const settingsSnap = await db.doc('meta/settings').get();
  if (settingsSnap.exists()) {
    await db.doc(`stores/${YOUR_TENANT_ID}/settings/main`).set(settingsSnap.data());
    console.log('Migrated settings');
  }

  console.log('Migration complete!');
}

migrate().catch(console.error);
```

---

## Testing checklist

- [ ] Sign up as a new user → store provisioned at `/stores/{tenantId}/`
- [ ] Sign in → auth token has `tenantId`, `role`, `plan` claims
- [ ] Products are read/written under `/stores/{tenantId}/products/`
- [ ] Photos upload to Firebase Storage, not Firestore
- [ ] A second user account cannot read the first user's data (test in private window)
- [ ] Stripe checkout creates a session and redirects
- [ ] After payment, plan claim updates (may need `refreshClaims()`)
- [ ] Admin panel only accessible with `platformAdmin:true` claim
- [ ] Shared catalogue readable by any authenticated user, not writable

---

## Architecture summary

```
Firebase Auth
  └─ Custom claims: { tenantId, role, plan, platformAdmin }

Firestore
  ├─ stores/{tenantId}/products/
  ├─ stores/{tenantId}/sales/
  ├─ stores/{tenantId}/workers/
  ├─ stores/{tenantId}/settings/main
  ├─ stores/{tenantId}/suppliers/
  ├─ stores/{tenantId}/stockReceipts/
  ├─ stores/{tenantId}/creditCustomers/
  ├─ stores/{tenantId}/activityLog/
  ├─ stores/{tenantId}/meta/receiptCounter
  ├─ sharedCatalogues/{industry}/products/  ← you manage these
  └─ subscriptions/{tenantId}              ← Stripe webhook writes here

Firebase Storage
  └─ stores/{tenantId}/products/{productId}.jpg

Cloud Functions
  ├─ onUserCreated    — provisions tenant on sign-up
  ├─ createWorker     — adds worker to existing tenant
  ├─ stripeWebhook    — handles Stripe events, updates plan claims
  ├─ createCheckoutSession     — creates Stripe Checkout URL
  └─ createCustomerPortalSession — opens Stripe billing portal
```
