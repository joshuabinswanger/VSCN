import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";

// One app for the whole codebase. Inside Cloud Functions, initializeApp() with
// no arguments picks up the project and its default bucket from the runtime.
const app = getApps()[0] ?? initializeApp();

export const db = getFirestore(app);
export const bucket = getStorage(app).bucket();
export const adminAuth = getAuth(app);
