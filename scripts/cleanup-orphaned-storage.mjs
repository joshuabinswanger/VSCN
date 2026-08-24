// Deletes Storage objects under avatars/ and galleries/ that no Firestore doc
// references anymore. Orphans accumulate because the immutable unique-filename
// scheme (documentation/20260823-user-content-backend-design.md) relies on
// client-side best-effort deletion of replaced files.
//
// Usage:
//   node scripts/cleanup-orphaned-storage.mjs            # dry run against prod (.env)
//   node scripts/cleanup-orphaned-storage.mjs -P dev     # dry run against dev (.env.development)
//   node scripts/cleanup-orphaned-storage.mjs -P dev --delete
//
// Only objects older than 24h are eligible, so in-flight uploads (uploaded but
// not yet committed to Firestore) are never touched.

import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PREFIXES = ["avatars/", "galleries/"];

// --- CLI ---------------------------------------------------------------

const args = process.argv.slice(2);
const doDelete = args.includes("--delete");
let project = "prod";
const pIdx = args.findIndex((a) => a === "-P" || a === "--project");
if (pIdx !== -1) project = args[pIdx + 1] ?? "";
if (project !== "prod" && project !== "dev") {
  console.error(`Unknown project "${project}" — use -P prod or -P dev.`);
  process.exit(1);
}
const envFile = project === "dev" ? "../.env.development" : "../.env";

// --- Credentials -------------------------------------------------------

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

const credential = parseEnvFile(resolve(__dirname, envFile));
if (!credential) {
  throw new Error(`Missing or invalid FIREBASE_SERVICE_ACCOUNT in ${envFile.replace("../", "")}`);
}

const bucketName = `${credential.project_id}.firebasestorage.app`;
const app = initializeApp({
  credential: cert(credential),
  storageBucket: bucketName,
});
const db = getFirestore(app);
const bucket = getStorage(app).bucket();

// --- URL → storage path -----------------------------------------------

// Mirrors deleteStorageFile() in src/lib/storage.ts: URLs are either
// firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath} or
// storage.googleapis.com/{bucket}/{path}.
function storagePathFromUrl(fileURL) {
  if (!fileURL) return null;
  try {
    const url = new URL(fileURL);
    if (url.hostname === "firebasestorage.googleapis.com") {
      const match = url.pathname.match(/\/o\/(.+)$/);
      if (match) return decodeURIComponent(match[1]);
    } else if (url.hostname === "storage.googleapis.com") {
      return url.pathname.split("/").slice(2).join("/");
    }
  } catch {
    // not a valid URL — nothing to resolve
  }
  return null;
}

// --- Main ---------------------------------------------------------------

async function collectReferencedPaths() {
  const referenced = new Set();
  // users/{uid} is the source of truth; publicProfiles is its projection, but a
  // stale projection can still serve a URL on the built site, so keep both alive.
  for (const collection of ["users", "publicProfiles"]) {
    const snap = await db.collection(collection).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const urls = [data.photoURL, ...(Array.isArray(data.gallery) ? data.gallery.map((g) => g?.url) : [])];
      for (const url of urls) {
        const path = storagePathFromUrl(url);
        if (path) referenced.add(path);
      }
    }
    console.log(`  - ${collection}: ${snap.size} docs scanned`);
  }
  return referenced;
}

async function main() {
  console.log(`Project: ${credential.project_id} (bucket ${bucketName})`);
  console.log(`Mode: ${doDelete ? "DELETE" : "dry run (pass --delete to act)"}\n`);

  console.log("Collecting referenced URLs from Firestore...");
  const referenced = await collectReferencedPaths();
  console.log(`  - ${referenced.size} unique referenced storage paths\n`);

  const cutoff = Date.now() - MAX_AGE_MS;
  let kept = 0;
  let tooYoung = 0;
  let orphanCount = 0;
  let orphanBytes = 0;
  let failed = 0;

  for (const prefix of PREFIXES) {
    console.log(`Listing ${prefix}...`);
    const [files] = await bucket.getFiles({ prefix });
    for (const file of files) {
      if (file.name.endsWith("/")) continue; // folder placeholder
      if (referenced.has(file.name)) {
        kept++;
        continue;
      }
      const created = new Date(file.metadata.timeCreated).getTime();
      if (created > cutoff) {
        tooYoung++;
        console.log(`  ~ ${file.name} — unreferenced but younger than 24h, skipped`);
        continue;
      }
      const size = Number(file.metadata.size ?? 0);
      orphanCount++;
      orphanBytes += size;
      const ageDays = ((Date.now() - created) / 86400000).toFixed(1);
      if (doDelete) {
        try {
          await file.delete();
          console.log(`  x ${file.name} — deleted (${(size / 1024).toFixed(0)} KB, ${ageDays}d old)`);
        } catch (error) {
          failed++;
          console.error(`  ! ${file.name} — delete failed: ${error.message}`);
        }
      } else {
        console.log(`  - ${file.name} — orphaned (${(size / 1024).toFixed(0)} KB, ${ageDays}d old)`);
      }
    }
  }

  console.log(
    `\nDone. ${kept} referenced, ${tooYoung} too young, ` +
      `${orphanCount} orphaned (${(orphanBytes / 1024 / 1024).toFixed(2)} MB)` +
      (doDelete ? ` — deleted${failed ? `, ${failed} FAILED` : ""}.` : " — dry run, nothing deleted."),
  );
  if (failed > 0) process.exitCode = 1;
}

try {
  await main();
} finally {
  await deleteApp(app);
}
