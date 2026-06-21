# Firebase Setup Guide — unity-book-shop

Everything you need to configure in the Firebase Console before going live.
Project URL: https://console.firebase.google.com/project/unity-book-shop

---

## 🔴 URGENT — Do these before sharing the app URL with anyone

### 1. Restrict your API key (5 minutes)

Your API key (`AIzaSyCg60JISOSneF0JYyDrhMZdRJcEfaMmLgo`) was shared in this
conversation. It's now in a chat transcript. Restrict it so even if someone
extracts it, they can only use it from your own domain.

**Steps:**
1. Go to: https://console.cloud.google.com/apis/credentials?project=unity-book-shop
2. Find the key named **Browser key (auto created by Firebase)**
3. Click it → under "Application restrictions" select **HTTP referrers (websites)**
4. Add these referrers:
   ```
   https://unity-book-shop.web.app/*
   https://unity-book-shop.firebaseapp.com/*
   https://yourdomain.com/*          ← your custom domain when ready
   http://localhost:3000/*           ← for local dev only (remove before launch)
   ```
5. Under "API restrictions" → select **Restrict key** → choose:
   - Cloud Firestore API
   - Firebase Authentication API
   - Cloud Storage API
   - Identity Toolkit API
6. Click **Save**

---

## ✅ NEW services to enable (not in your original project)

Your original project only had Firestore + Auth. The enterprise version needs:

### 2. Enable Firebase Storage

Your current project has no Storage bucket configured.

1. Firebase Console → **Storage** (left sidebar)
2. Click **Get started**
3. Choose **Start in production mode** (our storage.rules handle security)
4. Select region: **australia-southeast1** (closest to Melbourne) ← important for latency
5. Click **Done**

Your storage bucket is already named `unity-book-shop.firebasestorage.app` in the config — Firebase just needs the service activated.

### 3. Enable Cloud Functions

Required for: tenant provisioning, worker creation, Stripe webhook.

1. Firebase Console → **Functions** (left sidebar)
2. Click **Get started** → **Continue**
3. This requires the **Blaze (pay-as-you-go)** plan
   - Go to: https://console.firebase.google.com/project/unity-book-shop/usage/details
   - Click **Upgrade** → Select Blaze
   - Add a billing account (you won't be charged until you exceed the free tier)
   - Free tier includes: 2M function invocations/month, 400K GB-seconds — plenty for early stage
4. After upgrading, deploy functions:
   ```bash
   cd functions
   npm install
   firebase deploy --only functions
   ```

### 4. Deploy Firestore Security Rules

Your project currently has NO security rules (open to the internet).

```bash
# From your project root:
firebase deploy --only firestore:rules
firebase deploy --only storage
```

Verify at: https://console.firebase.google.com/project/unity-book-shop/firestore/rules

### 5. Create Firestore Indexes

The enterprise queries (tenant-scoped + ordered) need composite indexes.
Firebase will show you a link in the browser console when a query fails —
click it to auto-create. Or create them manually:

**Required indexes:**

| Collection path | Fields | Query scope |
|---|---|---|
| `stores/{tenantId}/sales` | `createdAt` DESC | Collection |
| `stores/{tenantId}/stockReceipts` | `createdAt` DESC | Collection |
| `stores/{tenantId}/activityLog` | `timestamp` DESC | Collection |

To create:
1. Firebase Console → Firestore → **Indexes** tab
2. Click **Add index** for each row above
3. Collection ID: `sales` (etc), Fields: `createdAt Descending`

---

## 🔧 Authentication setup

### 6. Enable Email/Password sign-in

1. Firebase Console → **Authentication** → **Sign-in method**
2. Click **Email/Password** → toggle **Enable** → Save
3. (Optional) Enable **Email link (passwordless sign-in)** for a better UX later

### 7. Set your admin custom claim

After you first sign in to the app, set yourself as platform admin:

1. Firebase Console → **Authentication** → find your email in the user list
2. Click the three-dot menu → **Edit user**
3. Scroll to **Custom claims** → paste:
   ```json
   { "platformAdmin": true, "role": "owner", "plan": "business" }
   ```
4. Click **Save**
5. Sign out and back in — you'll now see the 🛠 Admin link in the nav

### 8. Configure Authorized Domains

1. Firebase Console → Authentication → **Settings** tab → **Authorized domains**
2. Add your custom domain when ready: `yourdomain.com`
3. `localhost` and `unity-book-shop.web.app` are already added by default

---

## 💳 Stripe setup (for subscriptions)

### 9. Create your Stripe account

1. Go to https://stripe.com → Create account
2. Complete business verification (required to accept payments)
3. In test mode, go to **Developers → API keys**
4. Copy your **Publishable key** (`pk_test_...`) → paste into `.env`:
   ```
   REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```
5. Copy your **Secret key** (`sk_test_...`) → set as Firebase secret:
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY
   # paste sk_test_... when prompted
   ```

### 10. Create products in Stripe

1. Stripe Dashboard → **Products** → **Add product**
2. Create three products:

   **Starter — $9/month**
   - Name: `Starter`
   - Price: $9.00 AUD / month (recurring)
   - Copy the Price ID → paste into `SubscriptionGate.js` line:
     `priceId: 'price_starter_monthly'` → replace with your real ID

   **Pro — $25/month**
   - Name: `Pro`
   - Price: $25.00 AUD / month (recurring)
   - Copy Price ID → replace `price_pro_monthly`

   **Business — $59/month**
   - Name: `Business`
   - Price: $59.00 AUD / month (recurring)
   - Copy Price ID → replace `price_business_monthly`

3. Also create annual variants at ~20% discount:
   - Starter annual: $89/year
   - Pro annual: $249/year
   - Business annual: $579/year

### 11. Set up Stripe webhook

After deploying Cloud Functions:

1. Stripe Dashboard → **Developers → Webhooks** → **Add endpoint**
2. Endpoint URL:
   ```
   https://us-central1-unity-book-shop.cloudfunctions.net/stripeWebhook
   ```
3. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Click **Add endpoint**
5. Copy the **Signing secret** (`whsec_...`) → set as Firebase secret:
   ```bash
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   # paste whsec_... when prompted
   ```

---

## 🔐 App Check (optional but recommended before launch)

Prevents bots and scrapers from hitting your Firestore/Functions.

1. Firebase Console → **App Check** (left sidebar)
2. Click your web app → **reCAPTCHA v3**
3. Go to https://www.google.com/recaptcha/admin → register your domain
4. Copy the site key → paste into App Check setup
5. Click **Save**
6. In `firebase.js`, add:
   ```js
   import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
   initializeAppCheck(app, {
     provider: new ReCaptchaV3Provider('YOUR_RECAPTCHA_SITE_KEY'),
     isTokenAutoRefreshEnabled: true,
   });
   ```

---

## 📊 Firebase Hosting setup

To deploy the React app itself to Firebase Hosting:

```bash
# Build the React app
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

Your app will be live at:
- https://unity-book-shop.web.app
- https://unity-book-shop.firebaseapp.com

To add a custom domain:
1. Firebase Console → Hosting → **Add custom domain**
2. Enter your domain → follow the DNS verification steps
3. Firebase provides free SSL automatically

---

## 📋 Pre-launch checklist

- [ ] API key restricted to your domain(s)
- [ ] Firestore rules deployed (no open read/write)
- [ ] Storage rules deployed
- [ ] Storage service enabled (australia-southeast1)
- [ ] Cloud Functions deployed
- [ ] Email/Password auth enabled
- [ ] Your admin custom claim set
- [ ] Stripe products created with real Price IDs in SubscriptionGate.js
- [ ] Stripe webhook configured and signing secret set
- [ ] `STRIPE_SECRET_KEY` set in Firebase Secrets
- [ ] `STRIPE_WEBHOOK_SECRET` set in Firebase Secrets
- [ ] `ADMIN_EMAIL` set in Firebase Secrets
- [ ] Firestore indexes created
- [ ] Tested sign-up flow end-to-end
- [ ] Tested Stripe checkout in test mode
- [ ] App Check enabled

---

## 💰 Firebase cost estimate (Blaze plan)

At ~50 active stores, your monthly Firebase bill will be approximately:

| Service | Usage | Cost |
|---|---|---|
| Firestore reads | ~2M/month | ~$0.60 |
| Firestore writes | ~500K/month | ~$0.90 |
| Storage | ~500MB | ~$0.01 |
| Functions | ~200K invocations | Free tier |
| Hosting | ~5GB bandwidth | Free tier |
| **Total** | | **~$2–5/month** |

At 50 stores paying $9–25/month, your revenue is $450–1,250/month against ~$5 infrastructure. Very healthy margin.
