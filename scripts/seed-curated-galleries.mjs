// Seeds member galleries from the curated portfolio picks, so the image-led
// directory has real content before members have uploaded anything themselves.
//
// RECORD-FIRST, like every other image path since the entity restructuring:
// each prepped 1200px WebP (scripts/assets/curated-galleries/img/,
// manifest.json beside them) gets a fresh `imageId`, is uploaded to
// `users/{uid}/gallery/{imageId}.webp` with the owner metadata storage.rules
// expects, and gets an `images/{imageId}` record — `origin: "curated"` and
// `provenance.source` written straight in, so backfill-provenance.mjs is not
// needed for anything seeded by this script. The array item is the projection:
// { imageId, url, caption, width, height, color }.
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
// Usage (there is no default project — -P is mandatory):
//   node scripts/seed-curated-galleries.mjs -P dev            # dry run
//   node scripts/seed-curated-galleries.mjs -P dev --write    # seed dev
//   node scripts/seed-curated-galleries.mjs -P prod --write --only jasmin,quaint
//     (prod seeding is for launch, per member green light — hence --only)

import { randomUUID } from "node:crypto";
import { join, basename } from "node:path";
import fs from "node:fs";
import sharp from "sharp";
import { FieldValue } from "firebase-admin/firestore";
import { initAdminApp, parseArgs, ROOT } from "./lib/admin-app.mjs";

// --- CLI -----------------------------------------------------------------

const args = process.argv.slice(2);
const { project, flags } = parseArgs(args);
const doWrite = flags.has("--write");
const onlyIdx = args.findIndex((a) => a === "--only");
const only = onlyIdx !== -1 ? new Set((args[onlyIdx + 1] ?? "").split(",")) : null;

if (project === "prod" && doWrite && !only) {
  console.error(
    "Refusing to seed ALL members on prod — pass --only <slug,...> with the members who gave a green light.",
  );
  process.exit(1);
}

const { db, bucket, projectId, bucketName, close } = initAdminApp(project);

console.log(`Project: ${projectId}   Bucket: ${bucketName}`);
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
const CACHE = "public, max-age=31536000, immutable";

function localPathFor(src) {
  return join(ASSETS, "img", src.replace("/proto/img/real/", ""));
}

/** Where the file came from, in the same form backfill-provenance.mjs records. */
function provenanceSource(src) {
  return src.replace("/proto/img/real/", "curated-galleries/img/");
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

try {
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
      console.log(`MISSING  ${slug} — no publicProfiles doc in ${projectId}`);
      continue;
    }
    const existing = doc.data().gallery;
    if (Array.isArray(existing) && existing.length > 0) {
      console.log(`skip     ${slug} — already has ${existing.length} gallery item(s)`);
      skipped++;
      continue;
    }
    const uid = doc.id;

    const gallery = [];
    for (const img of images) {
      const localPath = localPathFor(img.src);
      if (!fs.existsSync(localPath)) throw new Error(`File missing on disk: ${localPath}`);
      const color = await dominantColor(localPath);
      // The record id IS the filename and the owner IS the folder — the same
      // contract validImage() in firestore.rules checks for a browser upload.
      const imageId = randomUUID();
      const storagePath = `users/${uid}/gallery/${imageId}.webp`;
      if (doWrite) {
        await bucket.upload(localPath, {
          destination: storagePath,
          metadata: {
            contentType: "image/webp",
            cacheControl: CACHE,
            // The object knows its owner even when found outside its path.
            metadata: { ownerUid: uid, imageId },
          },
        });
        await db.doc(`images/${imageId}`).set({
          ownerUid: uid,
          kind: "gallery",
          storagePath,
          width: img.width,
          height: img.height,
          color,
          origin: "curated",
          provenance: { source: provenanceSource(img.src) },
          status: "live",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      gallery.push({
        imageId,
        url: publicStorageUrl(storagePath),
        caption: "",
        width: img.width,
        height: img.height,
        color,
      });
      console.log(`  ${basename(img.src)}  ${img.width}x${img.height}  ${color}  → ${imageId}`);
    }

    if (doWrite) {
      await db.collection("publicProfiles").doc(uid).update({ gallery, updatedAt: FieldValue.serverTimestamp() });
      const userRef = db.collection("users").doc(uid);
      if ((await userRef.get()).exists) {
        await userRef.update({ gallery, updatedAt: FieldValue.serverTimestamp() });
      } else {
        console.log(`  (no users/${uid} doc — publicProfiles only)`);
      }
    }
    console.log(`${doWrite ? "SEEDED" : "would seed"}  ${slug}  (${gallery.length} images)`);
    seeded++;
  }

  console.log(
    `\n${seeded} member(s) ${doWrite ? "seeded" : "to seed"}, ${skipped} skipped (already have galleries).`,
  );
  if (!doWrite) console.log("Nothing written.");
} finally {
  await close();
}
