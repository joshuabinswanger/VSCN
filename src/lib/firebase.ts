import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { getAnalytics, isSupported } from "firebase/analytics";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";

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

const recaptchaSiteKey = import.meta.env.PUBLIC_FIREBASE_RECAPTCHA_SITE_KEY;

let appCheckInstance: AppCheck | null = null;
if (typeof window !== "undefined" && recaptchaSiteKey) {
  // In dev, App Check needs a debug token for localhost.
  // Setting this flag makes Firebase generate a debug token (printed to the console).
  // Register that token in Firebase Console → App Check → your app → Manage debug tokens.
  if (import.meta.env.DEV) {
    // Typed rather than cast through `any` (2026-09-03): the flag is a real
    // property Firebase reads off the global, so declaring it is both honest
    // and the last `no-explicit-any` in src — which is what lets a NEW warning
    // in this repo mean something. `unknown` would not do: the assignment
    // needs the property to exist on the target type.
    (globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean })
      .FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  try {
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    watchRecaptchaScript();
  } catch (err) {
    console.warn("Firebase App Check failed to initialize:", err);
  }
}

export const appCheck = appCheckInstance;

// WHY WE WATCH THE SDK'S OWN SCRIPT TAG (2026-09-07).
//
// initializeAppCheck appends <script src="https://www.google.com/recaptcha/
// enterprise.js"> synchronously and registers onload — and no onerror
// (@firebase/app-check 0.11.2, loadReCAPTCHAEnterpriseScript). When a network
// or an extension blocks that host, App Check's "initialized" promise never
// settles; Auth awaits the App Check token INSIDE its 30 s request timeout and
// reports the timeout as auth/network-request-failed with no detail. Reproduced
// against prod: 30.7 s of spinner, then a sentence about the internet
// connection. Prod ENFORCES App Check on Auth and Firestore, so on such a
// network sign-in cannot succeed at all; the only thing in our power is to say
// so at once, and to name the host. The forms ask isRecaptchaBlocked() before
// they call Auth, and show auth.error.code.recaptchaBlocked when it answers yes.
//
// addEventListener rather than onerror, so an SDK that grows its own handler
// one day is not overwritten. If the tag is not there (an SDK that loads the
// script differently), the flag simply never flips and behaviour is as before.
let recaptchaScriptFailed = false;

function watchRecaptchaScript(): void {
  const tag = document.querySelector<HTMLScriptElement>(
    'script[src^="https://www.google.com/recaptcha/enterprise.js"]'
  );
  if (!tag) return;
  tag.addEventListener("error", () => {
    recaptchaScriptFailed = true;
    console.warn("reCAPTCHA Enterprise script failed to load; App Check cannot issue a token");
  });
}

/** True once the reCAPTCHA Enterprise script has failed to load on this page. */
export function isRecaptchaBlocked(): boolean {
  return recaptchaScriptFailed;
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Analytics only runs in the browser (not during SSR/build)
export const analytics = isSupported().then((yes) => (yes ? getAnalytics(app) : null));
