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
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);

if (!env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT in .env");
}

const app = initializeApp({
  credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT.trim())),
});

const db = getFirestore();

const fakeMembers = [
  {
    id: "fake-user-01",
    displayName: "Mira Vogel",
    role: "Science Illustrator",
    bio: "Turns complex biological systems into clear editorial visuals.",
    portfolio: "miravogel.studio",
    photoURL: "https://i.pravatar.cc/160?img=1",
    phone: "+41 79 100 10 01",
    email: "mira.vogel@example.com",
  },
  {
    id: "fake-user-02",
    displayName: "Jonas Keller",
    role: "Data Journalist",
    bio: "Builds visual stories around climate, health, and public datasets.",
    portfolio: "jonaskeller.ch",
    photoURL: "https://i.pravatar.cc/160?img=3",
    phone: "+41 79 100 10 02",
    email: "jonas.keller@example.com",
  },
  {
    id: "fake-user-03",
    displayName: "Lea Marti",
    role: "Medical Animator",
    bio: "Creates motion pieces for patient education and research outreach.",
    portfolio: "leamarti.com",
    photoURL: "https://i.pravatar.cc/160?img=5",
    phone: "+41 79 100 10 03",
    email: "lea.marti@example.com",
  },
  {
    id: "fake-user-04",
    displayName: "Nico Reyes",
    role: "Research Designer",
    bio: "Designs visual systems for labs, fieldwork, and public exhibitions.",
    portfolio: "nicoreyes.design",
    photoURL: "https://i.pravatar.cc/160?img=7",
    phone: "+41 79 100 10 04",
    email: "nico.reyes@example.com",
  },
  {
    id: "fake-user-05",
    displayName: "Amara Chen",
    role: "Botanical Illustrator",
    bio: "Combines field sketching, microscopy, and careful visual taxonomy.",
    portfolio: "amarachen.art",
    photoURL: "https://i.pravatar.cc/160?img=9",
    phone: "+41 79 100 10 05",
    email: "amara.chen@example.com",
  },
  {
    id: "fake-user-06",
    displayName: "Theo Brandt",
    role: "Exhibition Designer",
    bio: "Shapes spatial narratives for museums, science centers, and archives.",
    portfolio: "theobrandt.studio",
    photoURL: "https://i.pravatar.cc/160?img=11",
    phone: "+41 79 100 10 06",
    email: "theo.brandt@example.com",
  },
  {
    id: "fake-user-07",
    displayName: "Sofia Romano",
    role: "Information Designer",
    bio: "Makes dense scientific reports easier to read, compare, and share.",
    portfolio: "sofiaromano.info",
    photoURL: "https://i.pravatar.cc/160?img=13",
    phone: "+41 79 100 10 07",
    email: "sofia.romano@example.com",
  },
  {
    id: "fake-user-08",
    displayName: "Elias Novak",
    role: "3D Scientific Artist",
    bio: "Models cells, materials, and molecules for teaching and outreach.",
    portfolio: "eliasnovak.net",
    photoURL: "https://i.pravatar.cc/160?img=15",
    phone: "+41 79 100 10 08",
    email: "elias.novak@example.com",
  },
  {
    id: "fake-user-09",
    displayName: "Ines Weber",
    role: "Visual Researcher",
    bio: "Explores how diagrams can support collaboration across disciplines.",
    portfolio: "inesweber.work",
    photoURL: "https://i.pravatar.cc/160?img=17",
    phone: "+41 79 100 10 09",
    email: "ines.weber@example.com",
  },
  {
    id: "fake-user-10",
    displayName: "Ravi Shah",
    role: "Science Communicator",
    bio: "Connects researchers and audiences through workshops and visual formats.",
    portfolio: "ravishah.org",
    photoURL: "https://i.pravatar.cc/160?img=19",
    phone: "+41 79 100 10 10",
    email: "ravi.shah@example.com",
  },
  {
    id: "fake-user-11",
    displayName: "Klara Meier",
    role: "Editorial Illustrator",
    bio: "Draws science features for magazines, newsletters, and public media.",
    portfolio: "klarameier.ch",
    photoURL: "https://i.pravatar.cc/160?img=21",
    phone: "+41 79 100 10 11",
    email: "klara.meier@example.com",
  },
  {
    id: "fake-user-12",
    displayName: "Mats Andersen",
    role: "Environmental Designer",
    bio: "Builds visual identities and maps for conservation projects.",
    portfolio: "matsandersen.eco",
    photoURL: "https://i.pravatar.cc/160?img=23",
    phone: "+41 79 100 10 12",
    email: "mats.andersen@example.com",
  },
  {
    id: "fake-user-13",
    displayName: "Yara Haddad",
    role: "UX Designer for Research",
    bio: "Designs interfaces and tools for research teams and citizen science.",
    portfolio: "yarahaddad.design",
    photoURL: "https://i.pravatar.cc/160?img=25",
    phone: "+41 79 100 10 13",
    email: "yara.haddad@example.com",
  },
  {
    id: "fake-user-14",
    displayName: "Felix Hart",
    role: "Geoscience Visualiser",
    bio: "Creates maps, sections, and visual explainers for earth science.",
    portfolio: "felixhart.earth",
    photoURL: "https://i.pravatar.cc/160?img=27",
    phone: "+41 79 100 10 14",
    email: "felix.hart@example.com",
  },
  {
    id: "fake-user-15",
    displayName: "Noemi Laurent",
    role: "Creative Technologist",
    bio: "Prototypes interactive visualizations for science communication.",
    portfolio: "noemilaurent.dev",
    photoURL: "https://i.pravatar.cc/160?img=29",
    phone: "+41 79 100 10 15",
    email: "noemi.laurent@example.com",
  },
];

const batch = db.batch();
const now = new Date();

if (process.argv.includes("--delete")) {
  for (const member of fakeMembers) {
    batch.delete(db.collection("users").doc(member.id));
    batch.delete(db.collection("publicProfiles").doc(member.id));
  }
  await batch.commit();

  for (const member of fakeMembers) {
    console.log(`Deleted ${member.id}: ${member.displayName}`);
  }

  console.log(`Done. Deleted ${fakeMembers.length} fake users.`);
  await deleteApp(app);
  process.exit(0);
}

for (const { id, ...member } of fakeMembers) {
  batch.set(
    db.collection("users").doc(id),
    {
      ...member,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
  batch.set(
    db.collection("publicProfiles").doc(id),
    {
      displayName: member.displayName,
      photoURL: member.photoURL,
      role: member.role,
      bio: member.bio,
      portfolio: member.portfolio,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
}

await batch.commit();

for (const member of fakeMembers) {
  console.log(`Seeded ${member.id}: ${member.displayName}`);
}

console.log(`Done. Seeded ${fakeMembers.length} fake users.`);
await deleteApp(app);
