// Copies every publicProfiles doc from production (vscn-39508) into the dev
// project (vscn-dev-f4b60), so the dev site's build-time member pages show the
// same directory members will be asked to review. 7 of 21 active members were
// missing from dev when this was written (see
// documentation/agent-memory/dev-vs-prod-firestore-divergence.md).
//
// One-way, prod -> dev, publicProfiles only. `users` is not synced: member
// pages and /community build from publicProfiles alone, and dev has no auth
// accounts for these members anyway. Dev-only extra docs are reported but
// never deleted.
//
// Usage:
//   node scripts/sync-profiles-prod-to-dev.mjs            # dry run
//   node scripts/sync-profiles-prod-to-dev.mjs --write

import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const doWrite = process.argv.includes("--write");

// Same parsing as cleanup-orphaned-storage.mjs.
function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const match = content.match(/^FIREBASE_SERVICE_ACCOUNT=(.*)$/m);
  if (!match) return null;
  let val = match[1].trim();
  if (val.startsWith("'") && val.endsWith("'")) {
    val = val.slice(1, -1);
  } else if (val.startsWith('"') && val.endsWith('"')) {
    val = JSON.parse(val);
  }
  const obj = JSON.parse(val);
  if (obj.private_key) {
    obj.private_key = obj.private_key.replace(/\\n/g, "\n");
  }
  return obj;
}

const prodCred = parseEnvFile(resolve(__dirname, "../.env"));
const devCred = parseEnvFile(resolve(__dirname, "../.env.development"));
if (!prodCred) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT in .env");
if (!devCred) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT in .env.development");
if (prodCred.project_id === devCred.project_id) {
  throw new Error(
    `Both env files point at ${prodCred.project_id} — refusing to sync a project onto itself.`,
  );
}

const prodApp = initializeApp({ credential: cert(prodCred) }, "prod");
const devApp = initializeApp({ credential: cert(devCred) }, "dev");
const prodDb = getFirestore(prodApp);
const devDb = getFirestore(devApp);

console.log(`Source: ${prodCred.project_id}   Target: ${devCred.project_id}`);
console.log(doWrite ? "WRITE mode" : "Dry run (pass --write to apply)");

const [prodSnap, devSnap] = await Promise.all([
  prodDb.collection("publicProfiles").get(),
  devDb.collection("publicProfiles").get(),
]);
const devIds = new Set(devSnap.docs.map((d) => d.id));

let created = 0;
let updated = 0;
for (const doc of prodSnap.docs) {
  const exists = devIds.has(doc.id);
  const name = doc.data().displayName ?? "(nameless)";
  console.log(`${exists ? "update" : "CREATE"}  ${doc.id}  ${name}`);
  if (doWrite) {
    // Full overwrite so dev matches prod exactly; Timestamp values copy as-is.
    await devDb.collection("publicProfiles").doc(doc.id).set(doc.data());
  }
  exists ? updated++ : created++;
}

const devOnly = devSnap.docs.filter((d) => !prodSnap.docs.some((p) => p.id === d.id));
for (const d of devOnly) {
  console.log(`dev-only (left alone)  ${d.id}  ${d.data().displayName ?? "(nameless)"}`);
}

console.log(
  `\n${prodSnap.size} prod docs -> ${created} to create, ${updated} to update; ` +
    `${devOnly.length} dev-only docs untouched.${doWrite ? "" : " Nothing written."}`,
);

await Promise.all([deleteApp(prodApp), deleteApp(devApp)]);
