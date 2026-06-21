// ─────────────────────────────────────────────────────────────────────────────
// firebase.js  —  coffee-shop-pos project
//
// Create your own Firebase project at https://console.firebase.google.com,
// then fill in a .env file in your project root (same folder as package.json)
// with the values from Project Settings → General → Your apps → SDK config:
//
//   REACT_APP_FIREBASE_API_KEY=...
//   REACT_APP_FIREBASE_AUTH_DOMAIN=...
//   REACT_APP_FIREBASE_PROJECT_ID=...
//   REACT_APP_FIREBASE_STORAGE_BUCKET=...
//   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
//   REACT_APP_FIREBASE_APP_ID=...
//   REACT_APP_FIREBASE_MEASUREMENT_ID=...
//
// Restart `npm start` after creating/editing .env (CRA only reads it on boot).
//
// ⚠️  Before going live:
//   1. Add .env to .gitignore so keys never get committed
//   2. Restrict the API key in Google Cloud Console
//   3. Set Firestore security rules (don't leave test mode on)
//   4. Enable App Check in Firebase Console for extra protection
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp }  from 'firebase/app';
import { getFirestore }   from 'firebase/firestore';
import { getAuth }        from 'firebase/auth';
import { getStorage }     from 'firebase/storage';
import { getFunctions }   from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyCzk7UT1UX4LThexi5iFfm27HVx_C_it9I",
  authDomain: "coffeeshop-4e005.firebaseapp.com",
  projectId: "coffeeshop-4e005",
  storageBucket: "coffeeshop-4e005.firebasestorage.app",
  messagingSenderId: "400608703723",
  appId: "1:400608703723:web:c9f74728d9f3f56ae0baae",
  measurementId: "G-72MWPJ1JDQ"
};


export const FIREBASE_CONFIGURED = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

if (!FIREBASE_CONFIGURED) {
  console.warn(
    '[firebase.js] No Firebase config found. Create a .env file with your ' +
    'REACT_APP_FIREBASE_* values (see comment at top of this file). ' +
    'The app will fall back to local-only storage until then.'
  );
}

const app = initializeApp(firebaseConfig);

export const db        = getFirestore(app);
export const auth      = getAuth(app);
export const storage   = getStorage(app);
export const functions = getFunctions(app);

export default app;