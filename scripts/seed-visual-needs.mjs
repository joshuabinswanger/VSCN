// Seeds the `visualNeeds` registry: what a scientist or research group needs
// visuals for. Same document shape and reader contract as the openTo registry,
// so options can be added, reworded or retired without a code deploy.
//
//   node scripts/seed-visual-needs.mjs dev     -> vscn-dev-f4b60
//   node scripts/seed-visual-needs.mjs prod    -> vscn-39508
//
// The target is REQUIRED and never defaults. The other seed scripts read `.env`
// implicitly, which is the production project — an easy way to write to prod
// while believing you are on dev. Credentials are read the way
// sync-prod-to-dev.mjs reads them, since that is the script that already had to
// address both projects at once.
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TARGETS = {
  dev: "../.env.development",
  prod: "../.env",
};

const target = process.argv[2];
if (!Object.hasOwn(TARGETS, target ?? "")) {
  console.error("Usage: node scripts/seed-visual-needs.mjs <dev|prod>");
  process.exit(1);
}

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

const credential = parseEnvFile(resolve(__dirname, TARGETS[target]));
if (!credential) {
  throw new Error(`Missing or invalid FIREBASE_SERVICE_ACCOUNT in ${TARGETS[target]}`);
}

const app = initializeApp({ credential: cert(credential) });
const db = getFirestore();

const options = [
  { id: "journal-figure", label_en: "Journal figure", label_de: "Journal-Abbildung", order: 1 },
  {
    id: "graphical-abstract",
    label_en: "Graphical abstract",
    label_de: "Graphical Abstract",
    order: 2,
  },
  { id: "cover-art", label_en: "Cover art submission", label_de: "Cover-Einreichung", order: 3 },
  { id: "grant-proposal", label_en: "Grant proposal", label_de: "Forschungsantrag", order: 4 },
  { id: "conference-poster", label_en: "Conference poster", label_de: "Konferenzposter", order: 5 },
  { id: "talk-animation", label_en: "Talk / animation", label_de: "Vortrag / Animation", order: 6 },
  { id: "exhibition", label_en: "Exhibition", label_de: "Ausstellung", order: 7 },
  {
    id: "press-outreach",
    label_en: "Press & outreach",
    label_de: "Presse & Öffentlichkeit",
    order: 8,
  },
];

async function seed() {
  try {
    console.log(`Seeding visualNeeds into ${target} (${credential.project_id})...`);
    for (const opt of options) {
      const { id, ...data } = opt;
      await db.collection("visualNeeds").doc(id).set({ ...data, active: true });
      console.log(`  ✓ ${id}`);
    }

    // Read back through the same ordering the client reader uses, so the output
    // shows what the selector will actually render rather than what was sent.
    const snap = await db.collection("visualNeeds").orderBy("order").get();
    console.log(`\n✓ ${snap.size} option(s) now in ${credential.project_id}:`);
    for (const doc of snap.docs) {
      const d = doc.data();
      console.log(`  ${d.order}. ${doc.id.padEnd(20)} ${d.label_en}  /  ${d.label_de}`);
    }
  } catch (err) {
    console.error("Error seeding options:", err);
    process.exitCode = 1;
  } finally {
    await deleteApp(app);
  }
}

seed();
