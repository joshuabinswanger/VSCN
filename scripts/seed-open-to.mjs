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
