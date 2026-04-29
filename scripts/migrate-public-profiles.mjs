import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);

if (!env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT in .env");
}

const app = initializeApp({
  credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT.trim())),
});

const db = getFirestore();
const users = await db.collection("users").get();
const batch = db.batch();
let count = 0;

for (const doc of users.docs) {
  const data = doc.data();
  batch.set(
    db.collection("publicProfiles").doc(doc.id),
    {
      displayName: data.displayName ?? "",
      photoURL: data.photoURL ?? "",
      role: data.role ?? "",
      bio: data.bio ?? "",
      portfolio: data.portfolio ?? "",
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
      updatedAt: new Date(),
    },
    { merge: true },
  );
  count += 1;
}

await batch.commit();
console.log(`Done. Migrated ${count} public profiles.`);
await deleteApp(app);
