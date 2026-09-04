import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";

// One app for the whole codebase. Inside Cloud Functions, initializeApp() with
// no arguments picks up the project from the runtime.
const app = getApps()[0] ?? initializeApp();

export const db = getFirestore(app);
export const adminAuth = getAuth(app);

// Lazy, not a module-scope constant: the default bucket needs FIREBASE_CONFIG
// populated, which the real Cloud Functions runtime always has but the CLI's
// local discovery pass (which just requires this module to list triggers)
// does not reliably supply — a bare getStorage(app).bucket() at import time
// threw there, and firebase-tools reported the crash as a generic
// "Cannot determine backend specification. Timeout after 10000" instead of
// the real error. Calling it lazily defers evaluation to inside an actual
// invocation, where the runtime context is guaranteed.
export function getBucket() {
  return getStorage(app).bucket();
}
