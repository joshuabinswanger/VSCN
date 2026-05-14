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
  // Core services and practices (Disciplines)
  { label: "Illustration", slug: "illustration", group: "disciplines" },
  { label: "Animation", slug: "animation", group: "disciplines" },
  { label: "Data Visualization", slug: "data-visualization", group: "disciplines" },
  { label: "Science Communication", slug: "science-communication", group: "disciplines" },
  { label: "Journalism", slug: "journalism", group: "disciplines" },
  { label: "Design", slug: "design", group: "disciplines" },
  { label: "Writing", slug: "writing", group: "disciplines" },
  { label: "Research", slug: "research", group: "disciplines" },
  { label: "Education", slug: "education", group: "disciplines" },
  { label: "Consulting", slug: "consulting", group: "disciplines" },
  { label: "Exhibition Design", slug: "exhibition-design", group: "disciplines" },
  { label: "Information Design", slug: "information-design", group: "disciplines" },
  { label: "Editorial Design", slug: "editorial-design", group: "disciplines" },
  { label: "User Experience", slug: "user-experience", group: "disciplines" },
  { label: "Design Research", slug: "design-research", group: "disciplines" },
  { label: "Scientific Illustration", slug: "scientific-illustration", group: "disciplines" },
  
  // Illustration formats (Topics/Formats - placing in topics for now as per TagSelector)
  { label: "Technical Illustration", slug: "technical-illustration", group: "topics" },
  { label: "Editorial", slug: "editorial-illustration", group: "topics" },
  { label: "Infographic", slug: "infographic", group: "topics" },
  { label: "Visual Abstract", slug: "visual-abstract", group: "topics" },
  { label: "Cartography", slug: "cartography", group: "topics" },
  { label: "Storyboards", slug: "storyboards", group: "topics" },
  { label: "Motion Graphics", slug: "motion-graphics", group: "topics" },

  // Subject fields (Topics)
  { label: "Museum", slug: "museum-graphics", group: "topics" },
  { label: "Natural Sciences", slug: "natural-sciences", group: "topics" },
  { label: "Life Sciences", slug: "life-sciences", group: "topics" },
  { label: "Biology", slug: "biology", group: "topics" },
  { label: "Botany", slug: "botany", group: "topics" },
  { label: "Zoology", slug: "zoology", group: "topics" },
  { label: "Ecology", slug: "ecology", group: "topics" },
  { label: "Evolution", slug: "evolution", group: "topics" },
  { label: "Microbiology", slug: "microbiology", group: "topics" },
  { label: "Neuroscience", slug: "neuroscience", group: "topics" },
  { label: "Human Anatomy", slug: "human-anatomy", group: "topics" },
  { label: "Medicine", slug: "medicine", group: "topics" },
  { label: "Dentistry", slug: "dentistry", group: "topics" },
  { label: "Public Health", slug: "public-health", group: "topics" },
  { label: "Veterinary Medicine", slug: "veterinary-medicine", group: "topics" },
  { label: "Archaeology", slug: "archaeology", group: "topics" },
  { label: "Anthropology", slug: "anthropology", group: "topics" },
  { label: "Paleontology", slug: "paleontology", group: "topics" },
  { label: "Geology", slug: "geology", group: "topics" },
  { label: "Earth Sciences", slug: "earth-sciences", group: "topics" },
  { label: "Environmental Science", slug: "environmental-science", group: "topics" },
  { label: "Climate Science", slug: "climate-science", group: "topics" },
  { label: "Physics", slug: "physics", group: "topics" },
  { label: "Chemistry", slug: "chemistry", group: "topics" },
  { label: "Astronomy", slug: "astronomy", group: "topics" },
  { label: "Engineering", slug: "engineering", group: "topics" },
  { label: "Architecture", slug: "architecture", group: "topics" },
];

const adminUid = "system";
const now = new Date();

async function seed() {
  try {
    console.log("Seeding tags...");
    for (const tag of tags) {
      await db.collection("tags").doc(tag.slug).set({
        label: tag.label,
        active: true,
        group: tag.group,
        createdAt: now,
        createdBy: adminUid,
      });
      console.log(`✓ Created tag: ${tag.label} [${tag.group}]`);
    }
    console.log("✓ Tags seeded successfully!");
  } catch (err) {
    console.error("Error seeding tags:", err);
  } finally {
    await deleteApp(app);
  }
}

seed();
