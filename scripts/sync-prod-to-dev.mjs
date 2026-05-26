import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  let obj = JSON.parse(val);
  if (obj.private_key) {
    obj.private_key = obj.private_key.replace(/\\n/g, '\n');
  }
  return obj;
}

const prodCredential = parseEnvFile(resolve(__dirname, "../.env"));
const devCredential = parseEnvFile(resolve(__dirname, "../.env.development"));

if (!prodCredential) throw new Error("Missing or invalid FIREBASE_SERVICE_ACCOUNT in .env");
if (!devCredential) throw new Error("Missing or invalid FIREBASE_SERVICE_ACCOUNT in .env.development");

if (prodCredential.private_key) prodCredential.private_key = prodCredential.private_key.replace(/\\n/g, '\n');
if (devCredential.private_key) devCredential.private_key = devCredential.private_key.replace(/\\n/g, '\n');

const appProd = initializeApp({ credential: cert(prodCredential) }, "prod");
const appDev = initializeApp({ credential: cert(devCredential) }, "dev");

const dbProd = getFirestore(appProd);
const dbDev = getFirestore(appDev);

const COLLECTIONS_TO_SYNC = ["tags", "openTo", "users", "publicProfiles", "onboardingRequests"];

async function syncCollection(collectionName) {
  console.log(`\nSyncing collection: ${collectionName}...`);
  
  // 1. Clear dev collection
  const devDocs = await dbDev.collection(collectionName).get();
  if (!devDocs.empty) {
    const deleteBatch = dbDev.batch();
    devDocs.forEach(doc => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();
    console.log(`  - Cleared ${devDocs.size} existing docs from dev`);
  }

  // 2. Fetch prod docs
  const prodDocs = await dbProd.collection(collectionName).get();
  if (prodDocs.empty) {
    console.log(`  - No docs in prod to sync.`);
    return;
  }

  // 3. Write to dev in batches
  let batch = dbDev.batch();
  let count = 0;
  let totalCount = 0;

  for (const doc of prodDocs.docs) {
    batch.set(dbDev.collection(collectionName).doc(doc.id), doc.data());
    count++;
    totalCount++;

    if (count === 490) { // Firestore batch limit is 500
      await batch.commit();
      batch = dbDev.batch();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  console.log(`  - Synced ${totalCount} docs to dev.`);
}

async function main() {
  console.log("Starting sync from Prod to Dev...");
  try {
    for (const col of COLLECTIONS_TO_SYNC) {
      await syncCollection(col);
    }
    console.log("\nSync complete!");
  } catch (error) {
    console.error("Error during sync:", error);
  } finally {
    await deleteApp(appProd);
    await deleteApp(appDev);
  }
}

main();
