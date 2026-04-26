import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env manually
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);

initializeApp({ credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT.trim())) });
const db = getFirestore();

const fakeMembers = [
  {
    displayName: "Ada Lovelace",
    role: "Science Illustrator",
    bio: "Visualising computation since 1843.",
    portfolio: "adalovelace.io",
    photoURL: "https://i.pravatar.cc/150?img=47",
    email: "ada@example.com",
  },
  {
    displayName: "Carl Sagan",
    role: "Astrophysics Communicator",
    bio: "Billions and billions of diagrams.",
    portfolio: "cosmos.example.com",
    photoURL: "https://i.pravatar.cc/150?img=12",
    email: "carl@example.com",
  },
  {
    displayName: "Marie Curie",
    role: "Data Visualiser",
    bio: "Radioactive charts only.",
    portfolio: "curie.science",
    photoURL: "https://i.pravatar.cc/150?img=32",
    email: "marie@example.com",
  },
  {
    displayName: "Richard Feynman",
    role: "Physics Animator",
    bio: "Diagrams, drums, and bongo physics.",
    portfolio: "feynman.art",
    photoURL: "https://i.pravatar.cc/150?img=8",
    email: "richard@example.com",
  },
  {
    displayName: "Rosalind Franklin",
    role: "Scientific Photographer",
    bio: "X-ray crystallography and visual storytelling.",
    portfolio: "franklin-visuals.com",
    photoURL: "https://i.pravatar.cc/150?img=25",
    email: "rosalind@example.com",
  },
];

for (const member of fakeMembers) {
  const ref = db.collection("users").doc();
  await ref.set({ ...member, createdAt: new Date() });
  console.log(`Created: ${member.displayName} (${ref.id})`);
}

console.log("Done.");
process.exit(0);
