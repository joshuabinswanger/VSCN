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
