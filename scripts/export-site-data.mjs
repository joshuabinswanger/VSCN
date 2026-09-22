// Dedicated prebuild phase: reads public-facing Firestore collections, writes
// a sanitized snapshot, then exits before Astro touches any user image bytes.
import { applicationDefault, cert, initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { writeFile, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv } from "vite";
// Pure module, no firebase import of any kind — the same arithmetic the rating
// callable and the admin console use, so the number that orders the site is
// arithmetically the number an admin was shown.
import { imageScore, isHidden } from "../src/lib/imageScore.ts";

const mode = process.argv[2] === "development" ? "development" : "production";
const env = loadEnv(mode, process.cwd(), "");
const snapshotPath = resolve(process.cwd(), ".site-data.json");
const tempPath = resolve(process.cwd(), ".site-data.json.tmp");
await rm(snapshotPath, { force: true });
await rm(tempPath, { force: true });

const raw = process.env.FIREBASE_SERVICE_ACCOUNT || env.FIREBASE_SERVICE_ACCOUNT;
const credential = raw ? JSON.parse(raw) : null;
const projectId = credential?.project_id || process.env.GOOGLE_CLOUD_PROJECT || env.PUBLIC_FIREBASE_PROJECT_ID;
const expected = process.env.PUBLIC_FIREBASE_PROJECT_ID || env.PUBLIC_FIREBASE_PROJECT_ID;
const bucket = process.env.PUBLIC_FIREBASE_STORAGE_BUCKET || env.PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
if (!projectId || (expected && expected !== projectId)) throw new Error("Export credential does not match the site project.");

const pick = (data, keys) => Object.fromEntries(keys.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));
const profileKeys = ["displayName", "photoURL", "photoImageId", "photoColor", "memberType", "role", "bio", "portfolio", "socialMedia", "affiliation", "location", "languages", "visualNeeds", "openTo", "primaryAudiences", "tags", "gallery", "active", "moderationHidden"];
const imageKeys = ["ownerUid", "kind", "storagePath", "width", "height", "color", "caption", "captionDe", "description", "descriptionDe", "descriptionShort", "link", "siteLink", "tags", "status", "origin", "provenance"];
const app = initializeApp({ credential: credential ? cert(credential) : applicationDefault(), projectId }, `site-export-${Date.now()}`);
try {
  const db = getFirestore(app);
  const [profiles, slugs, images, moderation] = await Promise.all([
    db.collection("publicProfiles").orderBy("displayName").get(),
    db.collection("slugs").get(),
    db.collection("images").where("kind", "==", "gallery").where("status", "==", "live").get(),
    db.collection("imageModeration").get(),
  ]);
  const visibleProfiles = profiles.docs
    .filter((doc) => doc.data().active !== false && doc.data().moderationHidden !== true)
    .map((doc) => ({ id: doc.id, data: pick(doc.data(), profileKeys) }));
  const visible = new Set(visibleProfiles.map((profile) => profile.id));
  const referenced = new Set(visibleProfiles.flatMap((profile) => Array.isArray(profile.data.gallery) ? profile.data.gallery : []));
  const snapshot = {
    version: 1, projectId, bucket, generatedAt: new Date().toISOString(),
    profiles: visibleProfiles,
    slugs: slugs.docs.filter((doc) => visible.has(doc.data().uid))
      .map((doc) => ({ slug: doc.id, uid: doc.data().uid, current: doc.data().current === true })),
    images: images.docs.filter((doc) => visible.has(doc.data().ownerUid) && referenced.has(doc.id))
      .map((doc) => ({ imageId: doc.id, ...pick(doc.data(), imageKeys) })),
  };
  // ADMIN UIDS DO NOT TRAVEL. The snapshot carries the conclusion — a number
  // and a flag — and never the ratings map that produced it: this file is
  // written to disk in CI and read by the build, and who rated what is nobody's
  // business outside the console.
  //
  // A row for EVERY exported image, not only the rated ones, so the build never
  // has to decide what a missing row means. An unrated picture still gets its
  // completeness nudge without a moderation document existing for it.
  const modById = new Map(moderation.docs.map((doc) => [doc.id, doc.data()]));
  snapshot.moderation = snapshot.images.map((image) => ({
    imageId: image.imageId,
    score: imageScore(image, modById.get(image.imageId) ?? null),
    hidden: isHidden(modById.get(image.imageId) ?? null),
  }));
  await writeFile(tempPath, JSON.stringify(snapshot), { mode: 0o600 });
  await rename(tempPath, snapshotPath);
  console.log(JSON.stringify({
    projectId, profiles: snapshot.profiles.length, images: snapshot.images.length,
    rated: snapshot.moderation.filter((row) => modById.has(row.imageId)).length,
    hidden: snapshot.moderation.filter((row) => row.hidden).length,
  }));
} finally {
  await deleteApp(app);
  await rm(tempPath, { force: true });
}
