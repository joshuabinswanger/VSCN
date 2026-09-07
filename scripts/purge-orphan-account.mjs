// Removes every trace of an account whose Auth user is gone — the class of
// problem check-integrity.mjs reports as `! users/<uid> has no Auth user`.
//
//   node scripts/purge-orphan-account.mjs -P prod <uid>           # dry run, prints what it found
//   node scripts/purge-orphan-account.mjs -P prod <uid> --write
//
// **Refuses if the uid still has an Auth user.** A live account is deleted
// through `requestAccountDeletion` and `purgeExpiredAccounts`, which handle the
// grace period, the email mirror and the Auth record together. This script is
// only for the wreckage left when the Auth user went away first — by hand in
// the console, or by a deletion that half-finished — leaving documents no
// server-side path will ever collect.
//
// Why it matters that this gets cleaned rather than left: `publicProfiles` is
// what the build reads, and it does not consult Auth. An orphan whose
// `active` is not false is a full member of the public directory, with its own
// /members/<slug> page. It looks like a member because, to every reader in the
// system, it is one.
import { initAdminApp, parseArgs } from "./lib/admin-app.mjs";

const { project, flags, positional } = parseArgs();
const uid = positional[0];
if (!uid) {
  console.error(
    "Usage: node scripts/purge-orphan-account.mjs -P dev|prod <uid> [--write]"
  );
  process.exit(1);
}
const doWrite = flags.has("--write");

const { db, bucket, adminAuth, projectId, close } = initAdminApp(project);

try {
  let authUser = null;
  try {
    authUser = await adminAuth.getUser(uid);
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
  }
  if (authUser) {
    console.error(
      `${projectId}: ${uid} HAS an Auth user (${authUser.email ?? "no email"}). ` +
        "Refusing — use the account-deletion flow, not this script."
    );
    process.exit(1);
  }

  console.log(`${projectId}: ${uid} — no Auth user. Collecting what refers to it.\n`);

  const userSnap = await db.doc(`users/${uid}`).get();
  const publicSnap = await db.doc(`publicProfiles/${uid}`).get();
  const slugSnaps = await db.collection("slugs").where("uid", "==", uid).get();
  const imageSnaps = await db.collection("images").where("ownerUid", "==", uid).get();

  // Both prefixes: the current per-account layout and the one the gallery
  // seeder wrote, so a seeded account leaves nothing behind either.
  const prefixes = [`users/${uid}/`, `galleries/${uid}/`];
  const objects = [];
  for (const prefix of prefixes) {
    const [files] = await bucket.getFiles({ prefix });
    objects.push(...files.map((f) => f.name));
  }

  const describe = (snap) => {
    if (!snap.exists) return "  (absent)";
    const d = snap.data();
    const keys = ["displayName", "email", "status", "active", "memberType"];
    const shown = keys
      .filter((k) => d[k] !== undefined)
      .map((k) => `${k}=${JSON.stringify(d[k])}`);
    const gallery = Array.isArray(d.gallery) ? `gallery=${d.gallery.length}` : null;
    return `  ${[...shown, gallery].filter(Boolean).join("  ")}`;
  };

  console.log(`users/${uid}`);
  console.log(describe(userSnap));
  console.log(`publicProfiles/${uid}`);
  console.log(describe(publicSnap));
  console.log(`slugs (${slugSnaps.size})`);
  for (const s of slugSnaps.docs) console.log(`  slugs/${s.id}`);
  console.log(`images (${imageSnaps.size})`);
  for (const s of imageSnaps.docs) {
    const d = s.data();
    console.log(`  images/${s.id}  kind=${d.kind} status=${d.status} ${d.storagePath ?? ""}`);
  }
  console.log(`storage objects (${objects.length})`);
  for (const name of objects) console.log(`  ${name}`);

  if (!doWrite) {
    console.log("\nDry run. Pass --write to delete all of the above.");
    process.exit(0);
  }

  // publicProfiles first: it is the only one of these the public build reads,
  // so the visible half stops being visible before anything slower runs.
  if (publicSnap.exists) {
    await publicSnap.ref.delete();
    console.log(`\ndeleted publicProfiles/${uid}`);
  }
  for (const s of slugSnaps.docs) {
    await s.ref.delete();
    console.log(`deleted slugs/${s.id}`);
  }
  for (const s of imageSnaps.docs) {
    await s.ref.delete();
    console.log(`deleted images/${s.id}`);
  }
  for (const prefix of prefixes) {
    await bucket.deleteFiles({ prefix });
  }
  if (objects.length) console.log(`deleted ${objects.length} storage object(s)`);
  if (userSnap.exists) {
    await userSnap.ref.delete();
    console.log(`deleted users/${uid}`);
  }

  console.log(
    "\nDone. The public page survives until the next build — the directory is a " +
      "static snapshot, so dispatch a rebuild or the /members/<slug> page stays up."
  );
} finally {
  await close();
}
