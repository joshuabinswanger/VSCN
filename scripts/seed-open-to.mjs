import { initAdminApp, parseArgs } from './lib/admin-app.mjs';
const { project, flags } = parseArgs();
if (!flags.has('--apply')) { console.log('Dry run: pass -P dev|prod --apply to seed this registry.'); process.exit(0); }
const { db, close } = initAdminApp(project);


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
    process.exitCode = 1;
    console.error("Error seeding options:", err);
  } finally {
    await close();
  }
}

seed();
