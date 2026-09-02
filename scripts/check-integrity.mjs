// Proves the links hold. Exit code 1 on any `!` line.
//
//   node scripts/check-integrity.mjs -P dev
//
// Checks: every gallery item → a live image record owned by that profile;
// every avatar's photoURL still equal to the URL derived from its record's
// storagePath (the C1 drift, invisible everywhere else); every record → an
// object at its storagePath; every object under users/ → a record; every
// `live` record referenced by some profile; every users/{uid}.email → the Auth
// user's email. Members inside a deletion grace period are skipped for the
// status check (their images are pendingDeletion on purpose) and reported as
// notes.
import { initAdminApp, parseArgs } from "./lib/admin-app.mjs";

const { project } = parseArgs();
const { db, bucket, adminAuth, projectId, bucketName, close } = initAdminApp(project);

/** A `live` record nothing points at is only suspicious once its upload cannot still be in flight. */
const UNREFERENCED_GRACE_HOURS = 6;

const problems = [];
const notes = [];
const problem = (msg) => { problems.push(msg); console.log(`  ! ${msg}`); };
const note = (msg) => { notes.push(msg); console.log(`  ~ ${msg}`); };

function publicStorageUrl(storagePath) {
  // Mirrors publicStorageUrl() in src/lib/storage.ts and the copy in
  // migrate-image-records.mjs — the URL a client would derive from the record.
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

try {
  console.log(`Integrity check — ${projectId}\n`);
  const [users, pubs, images, openJobs] = await Promise.all([
    db.collection("users").get(),
    db.collection("publicProfiles").get(),
    db.collection("images").get(),
    db.collection("deletions").where("completedAt", "==", null).get(),
  ]);
  const imageById = new Map(images.docs.map((d) => [d.id, d.data()]));
  const userIds = new Set(users.docs.map((d) => d.id));
  const inGrace = new Set(openJobs.docs.map((d) => d.id));

  console.log("Gallery arrays ↔ image records");
  for (const doc of pubs.docs) {
    const data = doc.data();
    if (!userIds.has(doc.id)) note(`publicProfiles/${doc.id} has no users doc (profile-only identity)`);
    if (inGrace.has(doc.id)) note(`publicProfiles/${doc.id} is in a deletion grace period`);
    const gallery = Array.isArray(data.gallery) ? data.gallery : [];
    gallery.forEach((item, i) => {
      if (!item?.imageId) return problem(`publicProfiles/${doc.id}.gallery[${i}] has no imageId`);
      const rec = imageById.get(item.imageId);
      if (!rec) return problem(`publicProfiles/${doc.id}.gallery[${i}] → images/${item.imageId} missing`);
      if (rec.ownerUid !== doc.id) problem(`images/${item.imageId} owned by ${rec.ownerUid}, listed on ${doc.id}`);
      if (rec.status !== "live" && !inGrace.has(doc.id)) {
        problem(`images/${item.imageId} is ${rec.status} but listed on publicProfiles/${doc.id}`);
      }
    });
  }

  // The avatar is the one image whose URL lives in a plain field rather than
  // in an array item, and nothing else in this file would notice it drifting
  // away from its record — which is exactly what the pre-fix client did on
  // every Save (it wrote Firebase Auth's stale photoURL back over the
  // migrated one). The record is the truth; the field must agree with it.
  console.log("Avatars — photoURL ↔ photoImageId");
  const checkAvatar = (collection, doc) => {
    const data = doc.data();
    if (!data.photoImageId) return;
    const rec = imageById.get(data.photoImageId);
    if (!rec) return problem(`${collection}/${doc.id}.photoImageId → images/${data.photoImageId} missing`);
    if (rec.ownerUid !== doc.id) {
      problem(`images/${data.photoImageId} owned by ${rec.ownerUid}, used as the ${collection}/${doc.id} avatar`);
    }
    if (data.photoURL !== publicStorageUrl(rec.storagePath)) {
      problem(`${collection}/${doc.id} photoURL drifted from photoImageId (holds "${data.photoURL || "(empty)"}")`);
    }
  };
  for (const doc of pubs.docs) checkAvatar("publicProfiles", doc);
  for (const doc of users.docs) checkAvatar("users", doc);

  console.log("Image records ↔ objects");
  const [files] = await bucket.getFiles({ prefix: "users/" });
  const objectNames = new Set(files.map((f) => f.name).filter((n) => !n.endsWith("/")));
  for (const [id, rec] of imageById) {
    const expected = `users/${rec.ownerUid}/${rec.kind}/${id}.webp`;
    if (rec.storagePath !== expected) problem(`images/${id}.storagePath is ${rec.storagePath}, expected ${expected}`);
    if (!objectNames.has(rec.storagePath)) problem(`images/${id} → object ${rec.storagePath} missing`);
  }
  const recordPaths = new Set([...imageById.values()].map((r) => r.storagePath));
  for (const name of objectNames) {
    if (!recordPaths.has(name)) problem(`object ${name} has no image record`);
  }

  // The other half of the orphan story. The upload order makes bytes without a
  // record impossible, but a record that reached `live` and then never made it
  // into a gallery array or onto photoImageId (rules rejected the profile
  // write, the tab closed, an avatar was replaced twice in one onboarding) is
  // permanent — no sweeper takes those. Reported, never swept automatically:
  // deciding a member's image is unwanted is not a script's call.
  console.log("Unreferenced live records");
  const referenced = new Set();
  for (const snap of [pubs, users]) {
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.photoImageId) referenced.add(data.photoImageId);
      for (const item of Array.isArray(data.gallery) ? data.gallery : []) {
        if (item?.imageId) referenced.add(item.imageId);
      }
    }
  }
  const unreferencedCutoff = Date.now() - UNREFERENCED_GRACE_HOURS * 3_600_000;
  for (const [id, rec] of imageById) {
    if (rec.status !== "live" || referenced.has(id)) continue;
    const line = `images/${id} is live but no profile references it (${rec.kind}, owner ${rec.ownerUid})`;
    const createdMs = rec.createdAt?.toMillis?.() ?? 0;
    if (createdMs < unreferencedCutoff) problem(line);
    else note(`${line} — under ${UNREFERENCED_GRACE_HOURS}h old, an upload may still be in flight`);
  }

  console.log("Email mirrors ↔ Auth");
  const authByUid = new Map();
  let pageToken;
  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    for (const u of page.users) authByUid.set(u.uid, u);
    pageToken = page.pageToken;
  } while (pageToken);
  for (const doc of users.docs) {
    const u = authByUid.get(doc.id);
    if (!u) { problem(`users/${doc.id} has no Auth user`); continue; }
    if (u.email && doc.data().email !== u.email) {
      problem(`users/${doc.id}.email "${doc.data().email}" ≠ Auth "${u.email}"`);
    }
  }

  console.log(`\n${problems.length} problem(s), ${notes.length} note(s).`);
  if (problems.length) process.exitCode = 1;
} finally {
  await close();
}
