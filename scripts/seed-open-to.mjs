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
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])
);

if (!env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT in .env");
}

const app = initializeApp({
  credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT.trim())),
});

const db = getFirestore();

const options = [
  {
    id: "offering",
    label_en: "Offer services",
    label_de: "Dienste anbieten",
    active: true,
    order: 1,
  },
  {
    id: "seeking",
    label_en: "Find services",
    label_de: "Dienste finden",
    active: true,
    order: 2,
  },
  {
    id: "networking",
    label_en: "Network & collaborate",
    label_de: "Netzwerken & zusammenarbeiten",
    active: true,
    order: 3,
  },
];

async function seed() {
  try {
    console.log("Seeding openTo options...");
    for (const opt of options) {
      const { id, ...data } = opt;
      await db.collection("openTo").doc(id).set(data);
      console.log(`✓ Created option: ${id}`);
    }
    console.log("✓ Options seeded successfully!");
  } catch (err) {
    console.error("Error seeding options:", err);
  } finally {
    await deleteApp(app);
  }
}

seed();
