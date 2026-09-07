// ONE-TIME: the gallery array becomes a list of image ids (2026-09-07, Josh:
// "B looks cleaner, implement it" — documentation/20260907-works-on-the-record-
// design.md). Every word an array item carried moves onto its record; the
// record then holds everything and the array holds only the order.
//
//   node scripts/migrate-gallery-to-ids.mjs -P dev            # dry run
//   node scripts/migrate-gallery-to-ids.mjs -P dev --write
//
// Idempotent: string elements are left alone, so a partial run re-runs.
// Snapshots users + publicProfiles to scripts/snapshots/ before writing.
//
// WHEN THE ARRAY AND THE RECORD DISAGREE, THE ARRAY WINS. It is what the site
// displayed until today; the record sync was best-effort (see the old
// syncGalleryText in git history) and a failed record write left the array as
// the only true copy. `link` never lived on the record at all.
//
// An element whose record is missing or not live is DROPPED from the list and
// reported: the reader would drop it anyway, and an id nothing can render is
// not worth carrying. Nothing is deleted from images/.
import fs from "node:fs";
import { resolve } from "node:path";
import { FieldValue } from "firebase-admin/firestore";
import { initAdminApp, parseArgs, ROOT } from "./lib/admin-app.mjs";

const { project, flags } = parseArgs();
const write = flags.has("--write");
const { db, projectId, close } = initAdminApp(project);

const TEXT_FIELDS = ["caption", "captionDe", "description", "descriptionDe", "link"];

function snapshot(name, docs) {
  const dir = resolve(ROOT, "scripts/snapshots");
  fs.mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${projectId}-${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(Object.fromEntries(docs.map((d) => [d.id, d.data()])), null, 2));
  console.log(`snapshot ${file}`);
}

/** The record patch an old-shape element implies: array text over record text, blanks removed. */
function recordPatch(item, rec) {
  const patch = {};
  for (const field of TEXT_FIELDS) {
    const onItem = typeof item[field] === "string" ? item[field].trim() : "";
    const onRecord = typeof rec[field] === "string" ? rec[field].trim() : "";
    if (onItem && onItem !== onRecord) patch[field] = onItem;
  }
  if ("descriptionShort" in rec) patch.descriptionShort = FieldValue.delete();
  return patch;
}

async function migrateCollection(name, images) {
  const snap = await db.collection(name).get();
  snapshot(name, snap.docs);
  let docsChanged = 0;
  for (const doc of snap.docs) {
    const gallery = doc.data().gallery;
    if (!Array.isArray(gallery) || gallery.every((e) => typeof e === "string")) continue;
    const ids = [];
    const patches = new Map();
    for (const element of gallery) {
      const imageId = typeof element === "string" ? element : element?.imageId;
      if (typeof imageId !== "string" || !imageId) {
        console.log(`  ! ${name}/${doc.id}: element without imageId dropped: ${JSON.stringify(element).slice(0, 80)}`);
        continue;
      }
      const rec = images.get(imageId);
      if (!rec) { console.log(`  ! ${name}/${doc.id}: images/${imageId} missing — dropped from the list`); continue; }
      if (rec.ownerUid !== doc.id) { console.log(`  ! ${name}/${doc.id}: images/${imageId} belongs to ${rec.ownerUid} — dropped`); continue; }
      if (rec.status !== "live") { console.log(`  ! ${name}/${doc.id}: images/${imageId} is ${rec.status} — dropped`); continue; }
      if (ids.includes(imageId)) continue;
      ids.push(imageId);
      if (typeof element === "object") {
        const patch = recordPatch(element, rec);
        if (Object.keys(patch).length) patches.set(imageId, patch);
      }
    }
    docsChanged++;
    console.log(`${write ? "MIGRATE" : "would  "}  ${name}/${doc.id}  ${gallery.length} item(s) → ${ids.length} id(s), ${patches.size} record(s) patched`);
    for (const [imageId, patch] of patches) {
      console.log(`           images/${imageId} ← ${Object.keys(patch).join(", ")}`);
    }
    if (!write) continue;
    // Records first: if this dies between the two writes the words are safe on
    // the record and the array still renders through the tolerant reader.
    for (const [imageId, patch] of patches) {
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
  return docsChanged;
}

try {
  console.log(`Gallery → ids — ${projectId}${write ? "" : " (dry run)"}\n`);
  const imageDocs = await db.collection("images").get();
  const images = new Map(imageDocs.docs.map((d) => [d.id, d.data()]));
  const pubs = await migrateCollection("publicProfiles", images);
  const users = await migrateCollection("users", images);
  console.log(`\n${pubs} publicProfiles and ${users} users doc(s) ${write ? "migrated" : "to migrate"}.`);
  if (!write) console.log("Nothing written. Re-run with --write.");
} finally {
  await close();
}
