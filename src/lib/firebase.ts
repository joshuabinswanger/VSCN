import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { getAnalytics, isSupported } from "firebase/analytics";
import { initializeAppCheck, type AppCheck } from "firebase/app-check";
import { turnstileProvider } from "./appCheckTurnstile.ts";

const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
  measurementId: import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Avoid re-initializing on hot reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

const turnstileSiteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;

// App Check, attested by Cloudflare Turnstile through a custom provider — the
// why and the how live in src/lib/appCheckTurnstile.ts and in
// documentation/20260907-turnstile-app-check-provider.md. In one line: prod
// ENFORCES App Check on Auth and Firestore, and institutional networks (ETH,
// UZH, the SLF that reported it) block Google reCAPTCHA, so with reCAPTCHA as
// the attestation nobody there could sign in.
//
// No site key → no App Check on the page, as before. The dev project carries
// Cloudflare's published always-pass TEST key, so the whole pipeline (script,
// challenge, mint function, token on the Auth request) is exercised locally
// and on the staging site. The old FIREBASE_APPCHECK_DEBUG_TOKEN flag is gone
// with reCAPTCHA: it made the SDK bypass the provider on localhost, which is a
// polite way of never testing it.
let appCheckInstance: AppCheck | null = null;
if (typeof window !== "undefined" && turnstileSiteKey) {
  try {
    appCheckInstance = initializeAppCheck(app, {
      provider: turnstileProvider(turnstileSiteKey, firebaseConfig.projectId),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.warn("Firebase App Check failed to initialize:", err);
  }
}

export const appCheck = appCheckInstance;

// True once the Turnstile script has failed to load on this page. The forms
// ask before calling Auth and show auth.error.code.securityCheckBlocked, so a
// blocked script is reported in milliseconds rather than after Auth's 30 s
// timeout blames the internet connection (the reCAPTCHA-era failure mode).
export { isSecurityCheckBlocked } from "./appCheckTurnstile.ts";

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Analytics only runs in the browser (not during SSR/build)
export const analytics = isSupported().then((yes) => (yes ? getAnalytics(app) : null));
