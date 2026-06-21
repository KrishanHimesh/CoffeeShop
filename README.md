# ShopOS — POS & Inventory Management SaaS

Multi-tenant point-of-sale and inventory management platform for small businesses.
Built with React + Firebase. Subscription billing via Stripe.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, plain CSS |
| Auth | Firebase Authentication |
| Database | Cloud Firestore |
| File storage | Firebase Storage |
| Backend | Firebase Cloud Functions (Node 20) |
| Billing | Stripe Subscriptions |
| Hosting | Firebase Hosting / Vercel |

---

## Project structure

```
shopos/
├── public/
│   ├── index.html          # PWA shell
│   ├── manifest.json       # PWA manifest
│   ├── sw.js               # Service worker (offline support)
│   └── icons/              # App icons (add your own PNG icons here)
│
├── src/
│   ├── App.js              # Root — mounts BookShelf or AdminPanel
│   ├── index.js            # Entry point + service worker registration
│   ├── index.css           # Global CSS variables and resets
│   └── app/
│       ├── firebase.js         # Firebase init (reads env vars)
│       ├── useStore.js         # Main state hook (all Firestore logic)
│       ├── BookShelf.js        # Main app shell + tab routing
│       ├── BookShelf.css       # All component styles
│       ├── LoginPage.js        # Login + sign-up (new store creation)
│       ├── AdminPanel.js       # Platform admin (shared catalogues)
│       ├── SubscriptionGate.js # Stripe billing + plan gate
│       ├── SharedCatalogue.js  # Browse & import shared products
│       ├── Workers.js          # Worker management
│       ├── Dashboard.js
│       ├── POS.js
│       ├── Inventory.js
│       ├── Reports.js
│       ├── Settings.js
│       ├── Suppliers.js
│       ├── ReceiveStock.js
│       ├── Payables.js
│       ├── SalesHistory.js
│       ├── CreditCustomers.js
│       ├── ActivityLog.js
│       ├── InstallPrompt.js
│       └── constants.js
│
├── functions/
│   ├── index.js            # Cloud Functions (tenant provisioning + Stripe)
│   └── package.json
│
├── firestore/
│   ├── firestore.rules     # Security rules (tenant isolation)
│   ├── firestore.indexes.json
│   └── storage.rules       # Storage security rules
│
├── firebase.json           # Firebase deploy config
├── .env.example            # Environment variable template
├── .gitignore              # Keeps secrets out of git
├── FIREBASE_SETUP.md       # Firebase Console setup guide
└── INTEGRATION.md          # Full integration checklist
```

---

## ─────────────────────────────────────────────
## STEP-BY-STEP: Create a new GitHub repo & deploy
## ─────────────────────────────────────────────

### STEP 1 — Install prerequisites

Make sure you have these installed:
```bash
node --version   # need v18 or v20
npm --version    # need v9+
git --version
```

Install Firebase CLI globally (if not already):
```bash
npm install -g firebase-tools
```

---

### STEP 2 — Set up the project locally

```bash
# 1. Extract the shopos zip you downloaded into a folder
cd shopos

# 2. Install React app dependencies
npm install

# 3. Install Cloud Functions dependencies
cd functions && npm install && cd ..

# 4. Create your .env file from the template
cp .env.example .env
```

Open `.env` and fill in your Firebase values:
```
REACT_APP_FIREBASE_API_KEY=AIzaSyCg60JISOSneF0JYyDrhMZdRJcEfaMmLgo
REACT_APP_FIREBASE_AUTH_DOMAIN=unity-book-shop.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=unity-book-shop
REACT_APP_FIREBASE_STORAGE_BUCKET=unity-book-shop.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=104337365978
REACT_APP_FIREBASE_APP_ID=1:104337365978:web:183f74af273256feacbee3
REACT_APP_ADMIN_EMAIL=your@email.com
```

Test it runs:
```bash
npm start
# Opens http://localhost:3000
```

---

### STEP 3 — Add your app icons

The `public/icons/` folder needs PNG icons at these sizes:
`72, 96, 128, 144, 152, 192, 384, 512`

Quick way — use your existing icons from the old project, or generate new ones at:
https://realfavicongenerator.net

```bash
# Copy icons from your old project if you have them
cp -r /path/to/old-project/public/icons/* public/icons/
```

---

### STEP 4 — Create the GitHub repository

**On GitHub.com:**
1. Go to https://github.com/new
2. Repository name: `shopos` (or whatever you prefer)
3. Set to **Private** ← important while in development
4. Do NOT initialise with README (you already have one)
5. Click **Create repository**

**In your terminal:**
```bash
# Initialise git in the project folder
git init

# Double-check .env is ignored BEFORE adding files
cat .gitignore | grep ".env"
# Should output: .env

# Add all files
git add .

# Verify .env is NOT in the staged files
git status | grep ".env"
# Should show nothing — if it shows .env, stop and fix .gitignore first

# Make the first commit
git commit -m "Initial commit — ShopOS enterprise"

# Connect to your GitHub repo (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/shopos.git

# Push
git branch -M main
git push -u origin main
```

---

### STEP 5 — Deploy Firebase services

```bash
# Log in to Firebase
firebase login

# Connect this project to your Firebase project
firebase use unity-book-shop

# Deploy Firestore security rules (IMPORTANT — do this before going live)
firebase deploy --only firestore:rules

# Deploy Firestore indexes
firebase deploy --only firestore:indexes

# Deploy Storage security rules
firebase deploy --only storage

# Deploy Cloud Functions (requires Blaze plan — see FIREBASE_SETUP.md)
firebase deploy --only functions
```

---

### STEP 6A — Host on Firebase Hosting (simplest)

```bash
# Build the React app
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

Your app is live at:
- `https://unity-book-shop.web.app`
- `https://unity-book-shop.firebaseapp.com`

Every future update:
```bash
npm run build && firebase deploy --only hosting
```

---

### STEP 6B — Host on Vercel (recommended — auto-deploys from GitHub)

1. Go to https://vercel.com → **Add New Project**
2. Import your GitHub repo (`shopos`)
3. Framework preset: **Create React App**
4. Click **Environment Variables** → add each line from your `.env`:

   | Key | Value |
   |---|---|
   | `REACT_APP_FIREBASE_API_KEY` | `AIzaSyCg60...` |
   | `REACT_APP_FIREBASE_AUTH_DOMAIN` | `unity-book-shop.firebaseapp.com` |
   | `REACT_APP_FIREBASE_PROJECT_ID` | `unity-book-shop` |
   | `REACT_APP_FIREBASE_STORAGE_BUCKET` | `unity-book-shop.firebasestorage.app` |
   | `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | `104337365978` |
   | `REACT_APP_FIREBASE_APP_ID` | `1:104337...` |
   | `REACT_APP_ADMIN_EMAIL` | `your@email.com` |

5. Click **Deploy**

From now on, every `git push` auto-deploys. No manual build needed.

Add your Vercel domain to Firebase authorized domains:
- Firebase Console → Authentication → Settings → Authorized domains → Add `your-app.vercel.app`

---

### STEP 7 — Set yourself as platform admin

After your first sign-in:

1. Firebase Console → Authentication → find your email
2. Three-dot menu → **Edit user**
3. Custom claims → paste:
   ```json
   { "platformAdmin": true, "tenantId": "your-store-id", "role": "owner", "plan": "business" }
   ```
4. Sign out and back in → you'll see the 🛠 Admin link

---

### STEP 8 — Set up Stripe (for subscriptions)

See `FIREBASE_SETUP.md` → "Stripe setup" section for full steps.

Quick summary:
1. Create account at stripe.com
2. Create 3 products (Starter $9, Pro $25, Business $59)
3. Copy Price IDs into `src/app/SubscriptionGate.js`
4. Add webhook endpoint pointing to your Cloud Functions URL
5. Set secrets:
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   firebase functions:secrets:set ADMIN_EMAIL
   ```

---

## Day-to-day workflow

```bash
# Work locally
npm start

# When ready to push
git add .
git commit -m "describe what changed"
git push
# → Vercel auto-deploys, OR manually run: npm run deploy
```

---

## Adding products to the shared catalogue

1. Go to `yourdomain.com/admin`
2. Select industry (Bookshop, Grocery, etc.)
3. Add products manually or import a CSV
4. All tenants in that industry can then see and import these products

---

## Subscription plans

| Plan | Price | Workers | Features |
|---|---|---|---|
| Starter | $9/mo | 1 | POS, inventory, shared catalogue |
| Pro | $25/mo | 5 | + Reports, suppliers, stock management |
| Business | $59/mo | Unlimited | + API access, white-label |

Modify plans in `src/app/SubscriptionGate.js` → `PLANS` array.

---

## Common commands

```bash
npm start                              # Run locally
npm run build                          # Build for production
firebase deploy --only hosting         # Deploy frontend
firebase deploy --only functions       # Deploy backend
firebase deploy --only firestore:rules # Deploy security rules
firebase deploy                        # Deploy everything
```
