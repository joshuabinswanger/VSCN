// Shared bootstrap for the admin scripts. `-P dev|prod` picks the env file
// (.env.development / .env) exactly as cleanup-orphaned-storage.mjs did; the
// older scripts each carry their own copy of this and are left alone.
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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
  if (obj.private_key) obj.private_key = obj.private_key.replace(/\\n/g, "\n");
  return obj;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  let project = "prod";
  const pIdx = argv.findIndex((a) => a === "-P" || a === "--project");
  if (pIdx !== -1) project = argv[pIdx + 1] ?? "";
  if (project !== "prod" && project !== "dev") {
    console.error(`Unknown project "${project}" — use -P prod or -P dev.`);
    process.exit(1);
  }
  const positional = argv.filter(
    (a, i) => !a.startsWith("-") && argv[i - 1] !== "-P" && argv[i - 1] !== "--project"
  );
  return { project, flags, positional };
}

export function initAdminApp(project) {
  const envFile = project === "dev" ? ".env.development" : ".env";
  const credential = parseEnvFile(resolve(ROOT, envFile));
  if (!credential) throw new Error(`Missing or invalid FIREBASE_SERVICE_ACCOUNT in ${envFile}`);
  const bucketName = `${credential.project_id}.firebasestorage.app`;
  const app = initializeApp(
    { credential: cert(credential), storageBucket: bucketName },
    `vscn-${project}-${Date.now()}`
  );
  return {
    app,
    db: getFirestore(app),
    bucket: getStorage(app).bucket(),
    adminAuth: getAuth(app),
    projectId: credential.project_id,
    bucketName,
    close: () => deleteApp(app),
  };
}
