// Lists members who ticked "I'd like to help build this community".
// wantsToContribute is private (never copied to publicProfiles), so this is
// the only way to see the answers outside the Firebase console.
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
  .filter((doc) => doc.data().wantsToContribute === true)
  .map((doc) => {
    const data = doc.data();
    return {
      uid: doc.id,
      displayName: data.displayName ?? "",
      email: data.email ?? "",
      memberType: data.memberType ?? "",
      role: data.role ?? "",
    };
  });

if (rows.length === 0) {
  console.log("Nobody has offered to help yet.");
} else {
  console.log(`${rows.length} member(s) offered to help:`);
  console.table(rows);
}

await deleteApp(app);
