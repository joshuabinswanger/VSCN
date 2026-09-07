// ONE-TIME: the gallery array becomes a list of image ids (2026-09-07, Josh:
// "B looks cleaner, implement it" — documentation/20260907-works-on-the-record-
// design.md). Every word an array item carried moves onto its record; the
// record then holds everything and the array holds only the order.
//
//   node scripts/migrate-gallery-to-ids.mjs -P dev            # dry run
//   node scripts/migrate-gallery-to-ids.mjs -P dev --write
//
// Idempotent for STRING elements only: a string element is left alone
// (deduplicated only), even when its would-be record is missing,
// foreign-owned, or not live. The record checks below (exists, live, owned)
// run ONLY for elements still in the old object shape — a migrated id is
// never re-validated. The spec says migrated ids are left alone, and the
// reader already ignores an id it cannot render, so re-checking one buys
// nothing and risks dropping something a re-run should have left in place.
//
// Snapshots users, publicProfiles and images to scripts/snapshots/ before
// writing — only when --write is passed; a dry run must not leave files on
// disk.
//
// PRECEDENCE, DELIBERATE: publicProfiles is migrated first and users second,
// sharing one `images` map, so when the two collections disagree about an
// element's text, users — processed last — wins. That is on purpose: a Save
// republishes publicProfiles FROM users (toPublicProfile), so the private
// copy is the better source of truth, and giving it the last word keeps that
// precedent rather than leaving it to processing order.
//
// WHEN THE ARRAY AND THE RECORD DISAGREE, THE ARRAY WINS. It is what the site
// displayed until today; the record sync was best-effort (see the old
// syncGalleryText in git history) and a failed record write left the array as
// the only true copy. `link` never lived on the record at all. Every patch
// this implies is printed with its old and new value, so a dry run against
// prod is self-auditing before anything is written.
//
// An OBJECT element whose record is missing, foreign-owned, or not live is
// DROPPED from the list and reported: the reader would drop it anyway, and an
// id nothing can render is not worth carrying. Nothing is deleted from
// images/. Every drop, across both collections, is counted in the final
// summary, and the process exits 1 (dry run or --write) if any element was
// dropped — a run that quietly shortens a gallery must never look clean.
//
// PII WARNING: users/{uid} holds `email` and `phone`. The snapshot files
// under scripts/snapshots/ are gitignored but NOT encrypted. Once a --write
// run against prod has been verified, delete the prod snapshot files by hand.
import fs from "node:fs";
import { resolve } from "node:path";
import { FieldValue } from "firebase-admin/firestore";
import { initAdminApp, parseArgs, ROOT } from "./lib/admin-app.mjs";

const { project, flags } = parseArgs();
const write = flags.has("--write");
const { db, projectId, close } = initAdminApp(project);

const TEXT_FIELDS = ["caption", "captionDe", "description", "descriptionDe", "link"];

function snapshot(name, docs) {
  if (!write) return; // dry runs must not touch disk
  const dir = resolve(ROOT, "scripts/snapshots");
  fs.mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${projectId}-${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(Object.fromEntries(docs.map((d) => [d.id, d.data()])), null, 2));
  console.log(`snapshot ${file}`);
}

/** "<value, up to 60 chars>" or "(empty)" for a missing/blank value. */
function fmt(value) {
  const s = typeof value === "string" ? value.trim() : "";
  return s ? s.slice(0, 60) : "(empty)";
}

/** The record patch an old-shape element implies: array text over record text, blanks removed. */
function recordPatch(item, rec) {
  const patch = {};
  const lines = [];
  for (const field of TEXT_FIELDS) {
    const onItem = typeof item[field] === "string" ? item[field].trim() : "";
    const onRecord = typeof rec[field] === "string" ? rec[field].trim() : "";
    if (onItem && onItem !== onRecord) {
      patch[field] = onItem;
      lines.push(`${field}: rec="${fmt(onRecord)}" → arr="${fmt(onItem)}"`);
    }
  }
  if ("descriptionShort" in rec) {
    patch.descriptionShort = FieldValue.delete();
    lines.push(`descriptionShort: rec="${fmt(rec.descriptionShort)}" → arr="${fmt(undefined)}"`);
  }
  return { patch, lines };
}

async function migrateCollection(name, images) {
  const snap = await db.collection(name).get();
  snapshot(name, snap.docs);
  let docsChanged = 0;
  let dropped = 0;
  for (const doc of snap.docs) {
    const gallery = doc.data().gallery;
    if (!Array.isArray(gallery) || gallery.every((e) => typeof e === "string")) continue;
    const ids = [];
    const patches = new Map();
    for (const element of gallery) {
      if (typeof element === "string") {
        // Already migrated: left alone, never re-validated against its record.
        const imageId = element;
        if (!imageId) {
          dropped++;
          console.log(`  ! ${name}/${doc.id}: element without imageId dropped: ${JSON.stringify(element).slice(0, 80)}`);
          continue;
        }
        if (ids.includes(imageId)) continue;
        ids.push(imageId);
        continue;
      }
      // Still old-shape: validate the object element against its record.
      const imageId = element?.imageId;
      if (typeof imageId !== "string" || !imageId) {
        dropped++;
        console.log(`  ! ${name}/${doc.id}: element without imageId dropped: ${JSON.stringify(element).slice(0, 80)}`);
        continue;
      }
      const rec = images.get(imageId);
      if (!rec) {
        dropped++;
        console.log(`  ! ${name}/${doc.id}: images/${imageId} missing — dropped from the list`);
        continue;
      }
      if (rec.ownerUid !== doc.id) {
        dropped++;
        console.log(`  ! ${name}/${doc.id}: images/${imageId} belongs to ${rec.ownerUid} — dropped`);
        continue;
      }
      if (rec.status !== "live") {
        dropped++;
        console.log(`  ! ${name}/${doc.id}: images/${imageId} is ${rec.status} — dropped`);
        continue;
      }
      if (ids.includes(imageId)) continue;
      ids.push(imageId);
      const { patch, lines } = recordPatch(element, rec);
      if (Object.keys(patch).length) patches.set(imageId, { patch, lines });
    }
    docsChanged++;
    console.log(`${write ? "MIGRATE" : "would  "}  ${name}/${doc.id}  ${gallery.length} item(s) → ${ids.length} id(s), ${patches.size} record(s) patched`);
    for (const [imageId, { lines }] of patches) {
      for (const line of lines) {
        console.log(`           images/${imageId}.${line}`);
      }
    }
    if (!write) continue;
    // Records first: if this dies between the two writes the words are safe on
    // the record and the array still renders through the tolerant reader.
    for (const [imageId, { patch }] of patches) {
      await db.doc(`images/${imageId}`).set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      // The same record can be listed by both collections; patch it once.
      const merged = { ...images.get(imageId), ...patch };
      // `descriptionShort` is patched with a DELETE SENTINEL, and stashing the
      // sentinel would leave the field still `in` the local copy — so the users
      // pass would see it as present and re-issue the same delete. Record what
      // the write actually did: the field is gone.
      if ("descriptionShort" in patch) delete merged.descriptionShort;
      images.set(imageId, merged);
    }
    await doc.ref.update({ gallery: ids, updatedAt: FieldValue.serverTimestamp() });
  }
  return { docsChanged, dropped };
}

try {
  console.log(`Gallery → ids — ${projectId}${write ? "" : " (dry run)"}\n`);
  const imageDocs = await db.collection("images").get();
  const images = new Map(imageDocs.docs.map((d) => [d.id, d.data()]));
  snapshot("images", imageDocs.docs);
  const pubs = await migrateCollection("publicProfiles", images);
  const users = await migrateCollection("users", images);
  const totalDropped = pubs.dropped + users.dropped;
  console.log(
    `\n${pubs.docsChanged} publicProfiles and ${users.docsChanged} users doc(s) ${write ? "migrated" : "to migrate"}; ${totalDropped} element(s) dropped.`
  );
  if (!write) console.log("Nothing written. Re-run with --write.");
  if (totalDropped > 0) process.exitCode = 1;
} finally {
  await close();
}
