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
const snap = await db.collection("users").orderBy("displayName").get();

const rows = snap.docs
  .map((doc) => {
    const data = doc.data();
    return {
      uid: doc.id,
      displayName: data.displayName ?? "",
      email: data.email ?? "",
      phone: data.phone ?? "",
    };
  })
  .filter((row) => row.phone);

if (rows.length === 0) {
  console.log("No phone numbers found.");
} else {
  console.table(rows);
}

await deleteApp(app);
