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

const tags = [
  // Core services and practices
  { label: "Illustration", slug: "illustration" },
  { label: "Animation", slug: "animation" },
  { label: "Data Visualization", slug: "data-visualization" },
  { label: "Science Communication", slug: "science-communication" },
  { label: "Journalism", slug: "journalism" },
  { label: "Design", slug: "design" },
  { label: "Writing", slug: "writing" },
  { label: "Research", slug: "research" },
  { label: "Education", slug: "education" },
  { label: "Consulting", slug: "consulting" },
  { label: "Exhibition Design", slug: "exhibition-design" },
  { label: "Information Design", slug: "information-design" },
  { label: "Editorial Design", slug: "editorial-design" },
  { label: "User Experience", slug: "user-experience" },
  { label: "Design Research", slug: "design-research" },
  { label: "Scientific Illustration", slug: "scientific-illustration" },
  
  // Illustration formats
  { label: "Technical Illustration", slug: "technical-illustration" },
  { label: "Editorial", slug: "editorial-illustration" },
  { label: "Infographic", slug: "infographic" },
  { label: "Visual Abstract", slug: "visual-abstract" },
  { label: "Cartography", slug: "cartography" },
  { label: "Storyboards", slug: "storyboards" },
  { label: "Motion Graphics", slug: "motion-graphics" },

  // Subject fields
  { label: "Museum", slug: "museum-graphics" },
  { label: "Natural Sciences", slug: "natural-sciences" },
  { label: "Life Sciences", slug: "life-sciences" },
  { label: "Biology", slug: "biology" },
  { label: "Botany", slug: "botany" },
  { label: "Zoology", slug: "zoology" },
  { label: "Ecology", slug: "ecology" },
  { label: "Evolution", slug: "evolution" },
  { label: "Microbiology", slug: "microbiology" },
  { label: "Neuroscience", slug: "neuroscience" },
  { label: "Human Anatomy", slug: "human-anatomy" },
  { label: "Medicine", slug: "medicine" },
  { label: "Dentistry", slug: "dentistry" },
  { label: "Public Health", slug: "public-health" },
  { label: "Veterinary Medicine", slug: "veterinary-medicine" },
  { label: "Archaeology", slug: "archaeology" },
  { label: "Anthropology", slug: "anthropology" },
  { label: "Paleontology", slug: "paleontology" },
  { label: "Geology", slug: "geology" },
  { label: "Earth Sciences", slug: "earth-sciences" },
  { label: "Environmental Science", slug: "environmental-science" },
  { label: "Climate Science", slug: "climate-science" },
  { label: "Physics", slug: "physics" },
  { label: "Chemistry", slug: "chemistry" },
  { label: "Astronomy", slug: "astronomy" },
  { label: "Engineering", slug: "engineering" },
  { label: "Architecture", slug: "architecture" },
];

const adminUid = "system";
const now = new Date();

async function seed() {
  try {
    console.log("Seeding tags...");
    for (const tag of tags) {
      await db.collection("tags").doc(tag.slug).set({
        label: tag.label,
        createdAt: now,
        createdBy: adminUid,
      });
      console.log(`✓ Created tag: ${tag.label}`);
    }
    console.log("✓ Tags seeded successfully!");
  } catch (err) {
    console.error("Error seeding tags:", err);
  } finally {
    await deleteApp(app);
  }
}

seed();
