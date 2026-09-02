// Proves the links hold. Exit code 1 on any `!` line.
//
//   node scripts/check-integrity.mjs -P dev
//
// Checks: every gallery item → a live image record owned by that profile;
// every record → an object at its storagePath; every object under users/ → a
// record; every users/{uid}.email → the Auth user's email. Members inside a
// deletion grace period are skipped for the status check (their images are
// pendingDeletion on purpose) and reported as notes.
import { initAdminApp, parseArgs } from "./lib/admin-app.mjs";

const { project } = parseArgs();
const { db, bucket, adminAuth, projectId, close } = initAdminApp(project);

const problems = [];
const notes = [];
const problem = (msg) => { problems.push(msg); console.log(`  ! ${msg}`); };
const note = (msg) => { notes.push(msg); console.log(`  ~ ${msg}`); };

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
    if (data.photoImageId && !imageById.has(data.photoImageId)) {
      problem(`publicProfiles/${doc.id}.photoImageId → images/${data.photoImageId} missing`);
    }
  }

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
