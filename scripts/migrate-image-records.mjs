// ONE-TIME migration to image records. Idempotent: items that already carry
// an imageId are left alone, so a partial run can be re-run.
//
//   node --experimental-strip-types scripts/migrate-image-records.mjs -P dev            # dry run
//   node --experimental-strip-types scripts/migrate-image-records.mjs -P dev --write
//   node --experimental-strip-types scripts/migrate-image-records.mjs -P dev --write --cleanup-legacy
//
// COPIES, never moves: legacy objects under avatars/ and galleries/ stay until
// --cleanup-legacy, which refuses to run while any array item lacks an imageId.
// Dumps users + publicProfiles to scripts/snapshots/ before writing anything.
//
// THIS FILE IS THE LAST PLACE A DOWNLOAD URL IS PARSED BACK INTO A PATH. The
// helper below exists so the migration can find legacy objects; it is not to
// be copied anywhere that ships.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { initAdminApp, parseArgs, ROOT } from "./lib/admin-app.mjs";
import { assignSlugs, toMemberViewBase } from "../src/lib/memberView.ts";

const { project, flags } = parseArgs();
const write = flags.has("--write");
const cleanupLegacy = flags.has("--cleanup-legacy");
const { db, bucket, projectId, bucketName, close } = initAdminApp(project);

const CACHE = "public, max-age=31536000, immutable";
const LEGACY_PREFIXES = ["avatars/", "galleries/"];

function storagePathFromUrl(fileURL) {
  if (!fileURL) return null;
  try {
    const url = new URL(fileURL);
    if (url.hostname === "firebasestorage.googleapis.com") {
      const match = url.pathname.match(/\/o\/(.+)$/);
      if (match) return decodeURIComponent(match[1]);
    } else if (url.hostname === "storage.googleapis.com") {
      return url.pathname.split("/").slice(2).join("/");
    }
  } catch {
    // not a URL — nothing to resolve
  }
  return null;
}

function publicStorageUrl(storagePath) {
  // Mirrors publicStorageUrl() in src/lib/storage.ts.
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

function snapshot(users, pubs) {
  const dir = resolve(ROOT, "scripts/snapshots");
  fs.mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${projectId}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const dump = (snap) => Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
  fs.writeFileSync(
    file,
    JSON.stringify(
      { users: dump(users), publicProfiles: dump(pubs) },
      (_k, v) => (v instanceof Timestamp ? v.toDate().toISOString() : v),
      2
    )
  );
  return file;
}

function record(uid, kind, storagePath, { width, height, color, caption, description, origin }) {
  return {
    ownerUid: uid,
    kind,
    storagePath,
    width,
    height,
    ...(color ? { color } : {}),
    ...(caption ? { caption } : {}),
    ...(description ? { description } : {}),
    origin,
    status: "live",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/** Gallery objects are already WebP (client and seeder both wrote WebP): copy. */
async function migrateGalleryItem(uid, item, origin) {
  const legacyPath = storagePathFromUrl(item.url);
  if (!legacyPath) return { error: `unparseable url ${item.url}` };
  const src = bucket.file(legacyPath);
  const [exists] = await src.exists();
  if (!exists) return { error: `object missing: ${legacyPath}` };
  const imageId = randomUUID();
  const storagePath = `users/${uid}/gallery/${imageId}.webp`;
  if (write) {
    await src.copy(bucket.file(storagePath), {
      metadata: { contentType: "image/webp", cacheControl: CACHE, metadata: { ownerUid: uid, imageId } },
    });
    await db.doc(`images/${imageId}`).set(record(uid, "gallery", storagePath, { ...item, origin }));
  }
  return { imageId, url: publicStorageUrl(storagePath), legacyPath };
}

/** Avatars may be legacy JPEG/PNG at {uid}.{ext}: decode, re-encode to WebP, measure. */
async function migrateAvatar(uid, photoURL, origin) {
  const legacyPath = storagePathFromUrl(photoURL);
  if (!legacyPath) return { error: `unparseable photoURL ${photoURL}` };
  const src = bucket.file(legacyPath);
  const [exists] = await src.exists();
  if (!exists) return { error: `avatar object missing: ${legacyPath}` };
  const [buf] = await src.download();
  const webp = await sharp(buf).webp({ quality: 82 }).toBuffer();
  const meta = await sharp(webp).metadata();
  const imageId = randomUUID();
  const storagePath = `users/${uid}/avatar/${imageId}.webp`;
  if (write) {
    await bucket.file(storagePath).save(webp, {
      contentType: "image/webp",
      metadata: { cacheControl: CACHE, metadata: { ownerUid: uid, imageId } },
    });
    await db.doc(`images/${imageId}`).set(
      record(uid, "avatar", storagePath, { width: meta.width, height: meta.height, origin })
    );
  }
  return { imageId, url: publicStorageUrl(storagePath), legacyPath };
}

async function migrate() {
  const [users, pubs] = await Promise.all([db.collection("users").get(), db.collection("publicProfiles").get()]);
  console.log(`snapshot → ${snapshot(users, pubs)}\n`);
  const userById = new Map(users.docs.map((d) => [d.id, d]));
  let migrated = 0;
  let failed = 0;

  for (const pub of pubs.docs) {
    const uid = pub.id;
    const pubData = pub.data();
    const userDoc = userById.get(uid);
    const userData = userDoc?.data() ?? {};
    // A profile with no account is curated seed material by definition.
    const origin = userDoc ? "member" : "curated";

    // publicProfiles is the projection, but the seeder wrote both and a
    // profile-only identity has only this doc — so the pub array is the list.
    const gallery = Array.isArray(pubData.gallery) ? pubData.gallery : [];
    const newGallery = [];
    for (const item of gallery) {
      if (item.imageId) { newGallery.push(item); continue; }
      const r = await migrateGalleryItem(uid, item, origin);
      if (r.error) { failed += 1; console.log(`  ! ${uid} gallery: ${r.error}`); newGallery.push(item); continue; }
      migrated += 1;
      newGallery.push({ ...item, imageId: r.imageId, url: r.url });
    }

    let avatar = null;
    const photoURL = pubData.photoURL || userData.photoURL || "";
    if (photoURL && !pubData.photoImageId) {
      const r = await migrateAvatar(uid, photoURL, origin);
      if (r.error) { failed += 1; console.log(`  ! ${uid} avatar: ${r.error}`); }
      else { migrated += 1; avatar = r; }
    }

    const pubUpdate = { gallery: newGallery, ...(avatar ? { photoURL: avatar.url, photoImageId: avatar.imageId } : {}) };
    const userUpdate = { ...pubUpdate, status: "active" };
    if (write) {
      await pub.ref.update(pubUpdate);
      if (userDoc) await userDoc.ref.update(userUpdate);
    }
    console.log(
      `  ${write ? "migrated" : "would migrate"} ${uid} (${pubData.displayName ?? "?"}, ${origin}): ` +
        `${newGallery.length} gallery item(s), avatar ${avatar ? "yes" : "no"}`
    );
  }

  // users docs with no publicProfiles doc still need status.
  for (const userDoc of users.docs) {
    if (pubs.docs.some((p) => p.id === userDoc.id)) continue;
    if (write) await userDoc.ref.update({ status: "active" });
    console.log(`  ${write ? "marked" : "would mark"} users/${userDoc.id} active (no public profile)`);
  }

  // onboardingRequests.email is a duplicate of users.email; the uid links them.
  const reqs = await db.collection("onboardingRequests").get();
  for (const d of reqs.docs) {
    if (!("email" in d.data())) continue;
    if (write) await d.ref.update({ email: FieldValue.delete() });
    console.log(`  ${write ? "stripped" : "would strip"} onboardingRequests/${d.id}.email`);
  }

  // Seed slugs/ from the SAME function the build uses today, over the same
  // set (active members only), so no URL a visitor holds changes. Inactive
  // members get a row from onPublicProfileWritten on their next save; until
  // then the build falls back to deriving one (resolveSlugs, Task 16).
  const members = assignSlugs(
    pubs.docs.filter((d) => d.data().active !== false).map((d) => toMemberViewBase(d.id, d.data()))
  );
  for (const m of members) {
    if (write) {
      await db.doc(`slugs/${m.slug}`).set(
        { uid: m.id, current: true, createdAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    }
    console.log(`  slug ${m.slug} → ${m.id}`);
  }

  console.log(`\n${write ? "Migrated" : "Would migrate"} ${migrated} image(s), ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

async function cleanupLegacyObjects() {
  const [users, pubs] = await Promise.all([db.collection("users").get(), db.collection("publicProfiles").get()]);
  console.log(`snapshot → ${snapshot(users, pubs)}\n`);

  const unmigrated = pubs.docs.flatMap((d) =>
    (Array.isArray(d.data().gallery) ? d.data().gallery : []).filter((g) => !g.imageId).map(() => d.id)
  );
  if (unmigrated.length) {
    console.error(`Refusing: ${unmigrated.length} gallery item(s) still lack an imageId (${[...new Set(unmigrated)].join(", ")}).`);
    process.exitCode = 1;
    return;
  }

  const unmigratedAvatars = pubs.docs
    .filter((d) => {
      const { photoURL, photoImageId } = d.data();
      if (!photoURL || photoImageId) return false;
      // Only an avatar whose bytes live in THIS bucket's legacy folder is at risk.
      return photoURL.includes(bucketName) && (storagePathFromUrl(photoURL) ?? "").startsWith("avatars/");
    })
    .map((d) => d.id);
  if (unmigratedAvatars.length) {
    console.error(`Refusing: ${unmigratedAvatars.length} avatar(s) in this bucket still lack a photoImageId (${unmigratedAvatars.join(", ")}).`);
    process.exitCode = 1;
    return;
  }

  for (const prefix of LEGACY_PREFIXES) {
    const [files] = await bucket.getFiles({ prefix });
    console.log(`${prefix}: ${files.length} object(s)`);
    for (const f of files) {
      if (write) await f.delete({ ignoreNotFound: true });
      console.log(`  ${write ? "deleted" : "would delete"} ${f.name}`);
    }
  }
}

try {
  console.log(`Project: ${projectId} (bucket ${bucketName})`);
  console.log(`Mode: ${write ? "WRITE" : "dry run (pass --write to act)"}\n`);
  if (cleanupLegacy) await cleanupLegacyObjects();
  else await migrate();
} finally {
  await close();
}
