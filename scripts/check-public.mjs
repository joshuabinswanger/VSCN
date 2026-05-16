import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { loadEnvFile } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnvFile(resolve(__dirname, "../.env"));

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT in environment");
}

const app = initializeApp({
  credential: cert(JSON.parse(serviceAccountJson.trim())),
});

const db = getFirestore();
const snap = await db.collection("publicProfiles").get();
console.log(`Found ${snap.size} public profiles.`);
snap.docs.forEach(d => console.log(`- ${d.id}: ${d.data().displayName} (active: ${d.data().active})`));
await deleteApp(app);
