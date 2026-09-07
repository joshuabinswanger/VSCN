// ONE-TIME: the gallery array becomes a list of image ids (2026-09-07, Josh:
// "B looks cleaner, implement it" — documentation/20260907-works-on-the-record-
// design.md). Every word an array item carried moves onto its record; the
// record then holds everything and the array holds only the order.
//
//   node scripts/migrate-gallery-to-ids.mjs -P dev                  # dry run
//   node scripts/migrate-gallery-to-ids.mjs -P dev --write
//   node scripts/migrate-gallery-to-ids.mjs -P dev --write --allow-drops
//
// PLAN FIRST, WRITE SECOND. Both collections are planned in full — the same
// logic, and the same output, the dry run prints — before the first document is
// touched. If the plan would drop any element the script REFUSES to write
// anything and exits 1; `--allow-drops` is the deliberate override, and a run
// that used it still exits 1. A gallery must never be shortened as a side
// effect of a run nobody read the output of.
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
// writing — only when --write is passed, and only once the drop gate above has
// passed; a dry run, and a refused run, must not leave files on disk.
//
// PRECEDENCE, DELIBERATE: publicProfiles is planned first and users second,
// sharing one `images` map, so when the two collections disagree about an
// element's text, users — applied last — wins. That is on purpose: a Save
// republishes publicProfiles FROM users (toPublicProfile), so the private
// copy is the better source of truth, and giving it the last word keeps that
// precedent rather than leaving it to processing order.
//
// WHEN THE ARRAY AND THE RECORD DISAGREE, THE ARRAY WINS. It is what the site
// displayed until today; the record sync was best-effort (see the old
// syncGalleryText in git history) and a failed record write left the array as
// the only true copy. `link` never lived on the record at all. Every patch
// this implies is printed with its old and new value, so a dry run against
// prod is self-auditing before anything is written. Note that this is the
// OPPOSITE of the reader's fallback, where the record wins and the array is
// consulted only for what the record lacks (see `loadGallery`); the two rules
// are safe to disagree because the dev probe found the two copies agreeing on
// every text (152/152) and the single difference is a `link`, a field only the
// array has ever held.
//
// DELETION GRACE: an OBJECT element whose record is missing, foreign-owned, or
// not live is DROPPED from the list and reported — the reader would drop it
// anyway, and an id nothing can render is not worth carrying. The one
// exception is a member mid-deletion: `scheduleDeletion` in
// functions/src/lifecycle.ts marks EVERY image `pendingDeletion` and
// `cancelDeletion` restores them, so dropping those ids would hand a member
// who cancels an empty gallery. A uid with an open `deletions` job (the same
// set check-integrity.mjs calls `inGrace`) therefore KEEPS a not-live id,
// reported with a `~` note instead of a `!` drop. Nothing is deleted from
// images/. Every real drop, across both collections, is counted in the final
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
const allowDrops = flags.has("--allow-drops");
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

/**
 * What of a planned patch is still worth writing, given the record as this run
 * has left it. The plan is made against the ORIGINAL records, so a field the
 * publicProfiles pass has already written to the same value would otherwise be
 * written twice; and `descriptionShort` is planned with a DELETE SENTINEL,
 * which — once applied and merged — must not be re-issued just because the
 * plan still names it.
 */
function stillNeeded(patch, rec) {
  const out = {};
  for (const [field, value] of Object.entries(patch)) {
    if (field === "descriptionShort") {
      if ("descriptionShort" in rec) out[field] = value;
      continue;
    }
    const onRecord = typeof rec[field] === "string" ? rec[field].trim() : "";
    if (value !== onRecord) out[field] = value;
  }
  return out;
}

/**
 * Read every doc of a collection and decide what would happen to it. Writes
 * nothing; prints exactly what the dry run has always printed.
 */
async function planCollection(name, images, inGrace) {
  const snap = await db.collection(name).get();
  const plans = [];
  let dropped = 0;
  let graceKept = 0;
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
        // Mid-deletion: every image is pendingDeletion until the member either
        // cancels (all restored) or the purge lands. Keep the id.
        if (!inGrace.has(doc.id)) {
          dropped++;
          console.log(`  ! ${name}/${doc.id}: images/${imageId} is ${rec.status} — dropped`);
          continue;
        }
        graceKept++;
        console.log(`  ~ ${name}/${doc.id}: images/${imageId} is ${rec.status} but the account is mid-deletion — kept`);
      }
      if (ids.includes(imageId)) continue;
      ids.push(imageId);
      const { patch, lines } = recordPatch(element, rec);
      if (Object.keys(patch).length) patches.set(imageId, { patch, lines });
    }
    console.log(
      `${write ? "plan   " : "would  "}  ${name}/${doc.id}  ${gallery.length} item(s) → ${ids.length} id(s), ${patches.size} record(s) patched`
    );
    for (const [imageId, { lines }] of patches) {
      for (const line of lines) {
        console.log(`           images/${imageId}.${line}`);
      }
    }
    plans.push({ ref: doc.ref, docId: doc.id, ids, patches });
  }
  return { docs: snap.docs, plans, dropped, graceKept };
}

/** Apply a planned collection: records first, then the array. */
async function applyCollection(name, plans, images) {
  for (const { ref, docId, ids, patches } of plans) {
    console.log(`MIGRATE   ${name}/${docId}  → ${ids.length} id(s), ${patches.size} record(s) patched`);
    // Records first: if this dies between the two writes the words are safe on
    // the record and the array still renders through the tolerant reader.
    for (const [imageId, { patch }] of patches) {
      const rec = images.get(imageId) ?? {};
      // The same record can be listed by both collections; patch it once.
      const needed = stillNeeded(patch, rec);
      if (!Object.keys(needed).length) continue;
      await db.doc(`images/${imageId}`).set({ ...needed, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      const merged = { ...rec, ...needed };
      // Record what the write actually did: the deleted field is gone, so the
      // users pass will not re-issue the same delete.
      if ("descriptionShort" in needed) delete merged.descriptionShort;
      images.set(imageId, merged);
    }
    await ref.update({ gallery: ids, updatedAt: FieldValue.serverTimestamp() });
  }
}

try {
  console.log(`Gallery → ids — ${projectId}${write ? "" : " (dry run)"}\n`);
  const [imageDocs, openJobs] = await Promise.all([
    db.collection("images").get(),
    // The same set check-integrity.mjs builds: a member mid-deletion has every
    // image marked pendingDeletion, and cancelling restores them.
    db.collection("deletions").where("completedAt", "==", null).get(),
  ]);
  const images = new Map(imageDocs.docs.map((d) => [d.id, d.data()]));
  const inGrace = new Set(openJobs.docs.map((d) => d.id));

  const pubs = await planCollection("publicProfiles", images, inGrace);
  const users = await planCollection("users", images, inGrace);
  const totalDropped = pubs.dropped + users.dropped;
  const totalGraceKept = pubs.graceKept + users.graceKept;

  const refuse = write && totalDropped > 0 && !allowDrops;
  console.log(
    `\n${pubs.plans.length} publicProfiles and ${users.plans.length} users doc(s) ${write && !refuse ? "migrated" : "to migrate"}; ${totalDropped} element(s) dropped.` +
      (totalGraceKept > 0 ? ` ${totalGraceKept} not-live id(s) kept for accounts mid-deletion.` : "")
  );

  if (!write) {
    console.log("Nothing written. Re-run with --write.");
  } else if (refuse) {
    console.log(
      `REFUSED: the plan would drop ${totalDropped} element(s) and nothing has been written. Read the \`!\` lines above; re-run with --allow-drops if every drop is intended.`
    );
  } else {
    // Snapshots BEFORE the first write, and only for a run that will write.
    snapshot("images", imageDocs.docs);
    snapshot("publicProfiles", pubs.docs);
    snapshot("users", users.docs);
    await applyCollection("publicProfiles", pubs.plans, images);
    await applyCollection("users", users.plans, images);
    if (totalDropped > 0) console.log(`Wrote with --allow-drops: ${totalDropped} element(s) dropped.`);
  }
  if (totalDropped > 0) process.exitCode = 1;
} finally {
  await close();
}
