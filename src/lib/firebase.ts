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
    (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  try {
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.warn("Firebase App Check failed to initialize:", err);
  }
}

export const appCheck = appCheckInstance;

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Analytics only runs in the browser (not during SSR/build)
export const analytics = isSupported().then((yes) => (yes ? getAnalytics(app) : null));
