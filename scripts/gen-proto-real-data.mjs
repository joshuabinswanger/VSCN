// Generates src/lib/proto-data-real.ts from live publicProfiles + the resized
// image manifest. Read-only against Firestore. Re-runnable.
import { readFileSync, writeFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const m = readFileSync(".env", "utf8").match(/^FIREBASE_SERVICE_ACCOUNT\s*=\s*(.*)$/m);
let raw = m[1].trim();
if (/^['"]/.test(raw)) raw = raw.slice(1, -1);
const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore(app);

const images = JSON.parse(readFileSync("src/lib/proto-images-real.json", "utf8"));

// displayName -> curation folder slug. Explicit, because transliteration of
// "Bürgisser"/"Stünzi" and initials like "Karin S." are not round-trippable.
const SLUGS = {
  "Jasmin Peter": "jasmin-peter", ikonaut: "ikonaut", "Joshua Binswanger": "joshua-binswanger",
  "Michael Stünzi": "michael-stuenzi", "Lisa Cuthbertson": "lisa-cuthbertson",
  "Stefan Scherrer": "stefan-scherrer", "Lisa Sophia Sommer": "lisa-sophia-sommer",
  "Gregor Forster": "gregor-forster", "Liliane Gschwend": "liliane-gschwend",
  "Oliver Bruderer": "oliver-bruderer", "Anna Bürgisser": "anna-buergisser",
  Andy: "andy", "Amy Badertscher": "amy-badertscher",
  "Esther Schönenberger": "esther-schoenenberger", Jasmin: "jasmin",
  "Gabriela G.": "gabriela-g", "Karin S.": "karin-s", Tara: "tara",
  "Janina Hess": "janina-hess", "Selina Bachmann": "selina-bachmann",
  "Wong Chi Lui": "wong-chi-lui", "Daniel Röttele": "daniel-roettele", Quaint: "quaint",
};

/** Caption line 2: first sentence of the bio, or a word-boundary trim. */
function caption(bio, max = 95) {
  const t = (bio || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const stop = t.search(/[.!?](\s|$)/);
  if (stop > 0 && stop + 1 <= max) return t.slice(0, stop + 1).trim();
  if (t.length <= max) return t;
  return t.slice(0, t.lastIndexOf(" ", max)).trim() + "…";
}

const snap = await db.collection("publicProfiles").get();
const rows = [];
for (const doc of snap.docs) {
  const x = doc.data();
  if (x.active === false) continue; // Andy + Amy Badertscher
  const name = (x.displayName || "").trim();
  const slug = SLUGS[name];
  if (!slug) throw new Error(`No slug mapped for displayName "${name}" (${doc.id})`);
  rows.push({
    id: slug,
    name,
    role: (x.role || "").trim(),
    description: caption(x.bio),
    bio: (x.bio || "").replace(/\s+/g, " ").trim(),
    tags: Array.isArray(x.tags) ? x.tags : [],
    openTo: Array.isArray(x.openTo) ? x.openTo : [],
    portfolio: (x.portfolio || "").trim(),
    socialMedia: (x.socialMedia || "").trim(),
    hasPhoto: Boolean(x.photoURL),
    images: images[slug] ?? [],
  });
}
rows.sort((a, b) => a.name.localeCompare(b.name, "de"));

const q = (s) => JSON.stringify(s);
const body = rows.map((r) => `  {
    id: ${q(r.id)},
    name: ${q(r.name)},
    role: ${q(r.role)},
    description: ${q(r.description)},
    bio: ${q(r.bio)},
    tags: ${JSON.stringify(r.tags)},
    openTo: ${JSON.stringify(r.openTo)},
    portfolio: ${q(r.portfolio)},
    socialMedia: ${q(r.socialMedia)},
    hasPhoto: ${r.hasPhoto},
    images: [${r.images.map((i) => `\n      { src: ${q(i.src)}, width: ${i.width}, height: ${i.height} },`).join("")}${r.images.length ? "\n    " : ""}],
  },`).join("\n");

const withImg = rows.filter((r) => r.images.length).length;
writeFileSync("src/lib/proto-data-real.ts", `// GENERATED — do not hand-edit. Regenerate with scripts/gen-proto-real-data.mjs.
//
// Real VSCN members for the /proto/community prototype. Snapshot of the
// \`publicProfiles\` collection taken 2026-08-21; \`active === false\` accounts are
// excluded. Images are the curated portfolio picks from Design/member-curation,
// downscaled to 1200px WebP into public/proto/img/real/ (see the same script).
//
// ${rows.length} members, ${withImg} of them with images. The ${rows.length - withImg} without are real
// profiles that have no artwork anywhere to curate from — they are kept in the
// data on purpose and need the typographic card variant to render.
import type { ProtoImage, ProtoMember, ProtoMemberDetail } from "./proto-data.ts";

export interface ProtoRealMember extends ProtoMember, ProtoMemberDetail {
  /** Every tag on the profile. The card rail only has room for a few. */
  tags: string[];
  images: ProtoImage[];
}

export const PROTO_REAL_MEMBERS: ProtoRealMember[] = [
${body}
];

/** Members the current image-based card can render. */
export const PROTO_REAL_WITH_IMAGES = PROTO_REAL_MEMBERS.filter((m) => m.images.length > 0);

/** Members that need the typographic card variant (no artwork to show). */
export const PROTO_REAL_TEXT_ONLY = PROTO_REAL_MEMBERS.filter((m) => m.images.length === 0);

`);
console.log(`${rows.length} members written, ${withImg} with images, ${rows.length - withImg} text-only`);
console.log("text-only:", rows.filter((r) => !r.images.length).map((r) => r.name).join(", "));
