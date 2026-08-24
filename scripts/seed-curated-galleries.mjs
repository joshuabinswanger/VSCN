// Seeds member galleries from the curated portfolio picks, so the image-led
// directory has real content before members have uploaded anything themselves.
// Uploads the prepped 1200px WebPs (scripts/assets/curated-galleries/img/,
// manifest.json beside them) to galleries/{uid}/ in Storage and writes the
// `gallery` array — the exact shape uploadGalleryImage() + compressGalleryImage()
// in src/lib/gallery.ts produce: { url, caption, width, height, color }.
//
// The gallery is written to BOTH publicProfiles/{uid} and users/{uid} (when the
// users doc exists): the profile editor loads from `users` and republishes the
// projection on save, so seeding only publicProfiles would be silently wiped by
// the member's next profile save.
//
// Members whose gallery is already non-empty are SKIPPED — never clobber
// member-uploaded content. There is deliberately no --force.
//
// Captions are left empty on purpose: the filenames are curation slugs, not the
// artists' titles, and inventing captions for someone else's work is worse than
// none. Members add their own in the editor.
//
// Usage:
//   node scripts/seed-curated-galleries.mjs                 # dry run against dev
//   node scripts/seed-curated-galleries.mjs --write         # seed dev
//   node scripts/seed-curated-galleries.mjs -P prod --write --only jasmin,quaint
//     (prod seeding is for launch, per member green light — hence --only)

import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { resolve, dirname, join, basename } from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// --- CLI (same shape as cleanup-orphaned-storage.mjs) -------------------

const args = process.argv.slice(2);
const doWrite = args.includes("--write");
let project = "dev";
const pIdx = args.findIndex((a) => a === "-P" || a === "--project");
if (pIdx !== -1) project = args[pIdx + 1] ?? "";
if (project !== "prod" && project !== "dev") {
  console.error(`Unknown project "${project}" — use -P prod or -P dev.`);
  process.exit(1);
}
const onlyIdx = args.findIndex((a) => a === "--only");
const only = onlyIdx !== -1 ? new Set((args[onlyIdx + 1] ?? "").split(",")) : null;
const envFile = project === "dev" ? "../.env.development" : "../.env";

if (project === "prod" && doWrite && !only) {
  console.error(
    "Refusing to seed ALL members on prod — pass --only <slug,...> with the members who gave a green light.",
  );
  process.exit(1);
}

// --- Credentials ---------------------------------------------------------

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

const credential = parseEnvFile(resolve(__dirname, envFile));
if (!credential) {
  throw new Error(`Missing or invalid FIREBASE_SERVICE_ACCOUNT in ${envFile.replace("../", "")}`);
}

const bucketName = `${credential.project_id}.firebasestorage.app`;
const app = initializeApp({ credential: cert(credential), storageBucket: bucketName });
const db = getFirestore(app);
const bucket = getStorage(app).bucket();

console.log(`Project: ${credential.project_id}   Bucket: ${bucketName}`);
console.log(doWrite ? "WRITE mode" : "Dry run (pass --write to apply)");

// --- Curated images -------------------------------------------------------

// displayName -> curation slug. Explicit rather than derived, because "Bürgisser"/"Stünzi"/"Karin S." are not round-trippable.
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

// The curated picks moved out of the deleted prototype into scripts/assets/
// when /community switched to the image cards; manifest srcs still carry the
// old public path prefix, mapped onto the asset folder below.
const ASSETS = join(ROOT, "scripts/assets/curated-galleries");
const manifest = JSON.parse(fs.readFileSync(join(ASSETS, "manifest.json"), "utf-8"));

function localPathFor(src) {
  return join(ASSETS, "img", src.replace("/proto/img/real/", ""));
}

function publicStorageUrl(storagePath) {
  // Mirrors publicStorageUrl() in src/lib/storage.ts.
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

/** Average color via a 1x1 downscale — mirrors dominantColor() in src/lib/image.ts. */
async function dominantColor(filePath) {
  const { data } = await sharp(filePath)
    .resize(1, 1, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return `#${[data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// --- Seed ------------------------------------------------------------------

const profiles = await db.collection("publicProfiles").get();
const bySlug = new Map();
for (const doc of profiles.docs) {
  const slug = SLUGS[(doc.data().displayName || "").trim()];
  if (slug) bySlug.set(slug, doc);
}

let seeded = 0;
let skipped = 0;
for (const [slug, images] of Object.entries(manifest)) {
  if (only && !only.has(slug)) continue;
  if (images.length === 0) continue;

  const doc = bySlug.get(slug);
  if (!doc) {
    console.log(`MISSING  ${slug} — no publicProfiles doc in ${credential.project_id}`);
    continue;
  }
  const existing = doc.data().gallery;
  if (Array.isArray(existing) && existing.length > 0) {
    console.log(`skip     ${slug} — already has ${existing.length} gallery item(s)`);
    skipped++;
    continue;
  }

  const gallery = [];
  for (const img of images) {
    const localPath = localPathFor(img.src);
    if (!fs.existsSync(localPath)) throw new Error(`File missing on disk: ${localPath}`);
    const color = await dominantColor(localPath);
    // Same naming scheme as uploadGalleryImage() in src/lib/gallery.ts.
    const storagePath = `galleries/${doc.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
    if (doWrite) {
      await bucket.upload(localPath, {
        destination: storagePath,
        metadata: {
          contentType: "image/webp",
          cacheControl: "public, max-age=31536000, immutable",
        },
      });
    }
    gallery.push({
      url: publicStorageUrl(storagePath),
      caption: "",
      width: img.width,
      height: img.height,
      color,
    });
    console.log(`  ${basename(img.src)}  ${img.width}x${img.height}  ${color}`);
  }

  if (doWrite) {
    await db
      .collection("publicProfiles")
      .doc(doc.id)
      .update({ gallery, updatedAt: FieldValue.serverTimestamp() });
    const userRef = db.collection("users").doc(doc.id);
    if ((await userRef.get()).exists) {
      await userRef.update({ gallery, updatedAt: FieldValue.serverTimestamp() });
    } else {
      console.log(`  (no users/${doc.id} doc — publicProfiles only)`);
    }
  }
  console.log(`${doWrite ? "SEEDED" : "would seed"}  ${slug}  (${gallery.length} images)`);
  seeded++;
}

console.log(
  `\n${seeded} member(s) ${doWrite ? "seeded" : "to seed"}, ${skipped} skipped (already have galleries).`,
);
if (!doWrite) console.log("Nothing written.");

await deleteApp(app);
