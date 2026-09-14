import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { db, getBucket } from "./admin";
import { requireUser } from "./util";

// Eight published works plus room for an avatar and replacements awaiting cleanup.
const MAX_STORED_OBJECTS = 20;
const MAX_AUTHORIZATIONS_PER_HOUR = 40;

export const authorizeImageUpload = onCall({ maxInstances: 3 }, async (req) => {
  const uid = requireUser(req);
  const imageId = req.data?.imageId;
  if (typeof imageId !== "string" || !/^[a-zA-Z0-9-]{1,150}$/.test(imageId)) {
    throw new HttpsError("invalid-argument", "Invalid image id.");
  }
  // Include legacy/untracked objects in the cap. New concurrent allocations are
  // covered by server-only permits and a transaction lock, even before bytes arrive.
  const [files] = await getBucket().getFiles({ prefix: `users/${uid}/`, maxResults: MAX_STORED_OBJECTS + 1, autoPaginate: false });
  await db.runTransaction(async (tx) => {
    const lock = db.doc(`uploadLimits/${uid}`);
    const state = await tx.get(lock);
    const image = await tx.get(db.doc(`images/${imageId}`));
    const data = image.data();
    if (!data || data.ownerUid !== uid || !["avatar", "gallery"].includes(data.kind)
      || data.storagePath !== `users/${uid}/${data.kind}/${imageId}.webp`) {
      throw new HttpsError("permission-denied", "Upload record does not belong to you.");
    }
    if (req.auth?.token.email_verified !== true && imageId !== `${uid}-${data.kind}`) {
      throw new HttpsError("permission-denied", "Verify your email before adding more images.");
    }
    const permits = await tx.get(db.collection("uploadPermits").where("ownerUid", "==", uid).limit(MAX_STORED_OBJECTS + 1));
    const paths = new Set([...files.map((file) => file.name), ...permits.docs.map((d) => d.data().storagePath)]);
    paths.add(data.storagePath);
    if (paths.size > MAX_STORED_OBJECTS) {
      throw new HttpsError("resource-exhausted", "Stored image limit reached. Remove unused images and wait for cleanup before uploading more.");
    }
    const now = Date.now();
    const inWindow = now - (state.data()?.windowStart?.toMillis() ?? 0) < 3_600_000;
    const count = inWindow ? Number(state.data()?.count ?? 0) : 0;
    if (count >= MAX_AUTHORIZATIONS_PER_HOUR) throw new HttpsError("resource-exhausted", "Too many uploads. Please try again later.");
    tx.set(lock, { windowStart: inWindow ? state.data()!.windowStart : Timestamp.fromMillis(now), count: count + 1 });
    tx.set(db.doc(`uploadPermits/${imageId}.webp`), {
      ownerUid: uid, kind: data.kind, storagePath: data.storagePath,
      expiresAt: Timestamp.fromMillis(now + 30 * 60_000),
    });
  });
  return { ok: true };
});
