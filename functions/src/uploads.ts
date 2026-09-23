import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db, getBucket } from "./admin";
import { requireUser } from "./util";

const MAX_STORED_OBJECTS = 20;
const MAX_AUTHORIZATIONS_PER_HOUR = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * THE WORDS A WORK KEEPS WHEN ITS PICTURE IS REPLACED (2026-09-23, member
 * feedback: replacing an image meant deleting the whole work and typing it
 * all again). Everything a member writes about a picture lives on its record
 * (updateImageText in src/lib/images.ts), so a replacement is a NEW record —
 * a new id, because the id is the filename and a verified member's object is
 * cached `immutable` for a year — that starts life carrying these.
 */
const WORK_TEXT_FIELDS = ["caption", "captionDe", "description", "descriptionDe", "link", "siteLink", "tags"] as const;

/** The record a replacement stands in for. Gallery only: the avatar has its own replace path. */
function replacementId(value: unknown, kind: string, uid: string): string | null {
  if (value === undefined || value === null) return null;
  if (kind !== "gallery" || typeof value !== "string"
    || (value !== `${uid}-gallery` && !UUID.test(value))) {
    throw new HttpsError("invalid-argument", "Invalid image to replace.");
  }
  return value;
}

function imageRequest(req: { data: any; auth?: { token: Record<string, unknown> } }, uid: string) {
  const { imageId, kind, width, height, color } = req.data ?? {};
  if (typeof imageId !== "string" || (imageId !== `${uid}-avatar` && imageId !== `${uid}-gallery` && !UUID.test(imageId))
    || (kind !== "avatar" && kind !== "gallery")
    || !Number.isInteger(width) || width < 1 || width > 10000
    || !Number.isInteger(height) || height < 1 || height > 10000
    || (color !== undefined && (typeof color !== "string" || !/^#[0-9a-f]{6}$/.test(color)))) {
    throw new HttpsError("invalid-argument", "Invalid image details.");
  }
  const slot = imageId === `${uid}-${kind}`;
  if (!slot && req.auth?.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "Verify your email before adding more images.");
  }
  return { imageId, kind, width: width as number, height: height as number, color: color as string | undefined, slot,
    storagePath: `users/${uid}/${kind}/${imageId}.webp`,
    uploadPath: `pending/${uid}/${kind}/${imageId}.webp` };
}

/** Allocate the document and the Storage permit together, before bytes arrive. */
export const authorizeImageUpload = onCall({ maxInstances: 3 }, async (req) => {
  const uid = requireUser(req);
  const image = imageRequest(req, uid);
  const replaces = replacementId(req.data?.replaces, image.kind, uid);
  const [files] = await getBucket().getFiles({ prefix: `users/${uid}/`, maxResults: MAX_STORED_OBJECTS + 1, autoPaginate: false });
  await db.runTransaction(async (tx) => {
    if ((await tx.get(db.doc(`deletions/${uid}`))).exists) throw new HttpsError("failed-precondition", "Account deletion is pending or completed.");
    const lock = db.doc(`uploadLimits/${uid}`);
    const imageRef = db.doc(`images/${image.imageId}`);
    const [state, existing, replaced] = await Promise.all([
      tx.get(lock), tx.get(imageRef), replaces ? tx.get(db.doc(`images/${replaces}`)) : null,
    ]);
    const previous = existing.data();
    // Only a work this member can see in their own gallery. `live` rules out
    // replacing into a record the sweeper is about to take away.
    const work = replaced?.data();
    if (replaces && (!work || work.ownerUid !== uid || work.kind !== "gallery" || work.status !== "live")) {
      throw new HttpsError("permission-denied", "Only a live gallery image of yours can be replaced.");
    }
    // The unverified slot replaces IN PLACE (same id, same record), so its
    // words never move. Any other replacement is a fresh record that inherits them.
    const inherited = work && replaces !== image.imageId
      ? Object.fromEntries(WORK_TEXT_FIELDS.filter((key) => work[key] !== undefined).map((key) => [key, work[key]]))
      : {};
    if (previous && (previous.ownerUid !== uid || previous.kind !== image.kind || previous.storagePath !== image.storagePath
      || previous.origin !== "member" || !image.slot)) {
      throw new HttpsError("permission-denied", "Upload record cannot be replaced.");
    }
    const permits = await tx.get(db.collection("uploadPermits").where("ownerUid", "==", uid).limit(MAX_STORED_OBJECTS + 1));
    const paths = new Set([...files.map((file) => file.name), ...permits.docs.map((d) => d.data().storagePath)]);
    paths.add(image.storagePath);
    if (paths.size > MAX_STORED_OBJECTS) {
      throw new HttpsError("resource-exhausted", "Stored image limit reached. Remove unused images and wait for cleanup before uploading more.");
    }
    const now = Date.now();
    const inWindow = now - (state.data()?.windowStart?.toMillis() ?? 0) < 3_600_000;
    const count = inWindow ? Number(state.data()?.count ?? 0) : 0;
    if (count >= MAX_AUTHORIZATIONS_PER_HOUR) throw new HttpsError("resource-exhausted", "Too many uploads. Please try again later.");
    tx.set(lock, { windowStart: inWindow ? state.data()!.windowStart : Timestamp.fromMillis(now), count: count + 1 });
    if (previous) {
      tx.update(imageRef, {
        width: image.width, height: image.height, color: image.color ?? FieldValue.delete(),
        status: "uploading", updatedAt: Timestamp.fromMillis(now),
      });
    } else {
      tx.create(imageRef, {
        ownerUid: uid, kind: image.kind, storagePath: image.storagePath,
        width: image.width, height: image.height, ...(image.color ? { color: image.color } : {}),
        origin: "member", status: "uploading", createdAt: Timestamp.fromMillis(now), updatedAt: Timestamp.fromMillis(now),
        ...inherited,
      });
    }
    tx.set(db.doc(`uploadPermits/${image.imageId}.webp`), {
      imageId: image.imageId, ownerUid: uid, kind: image.kind, storagePath: image.storagePath, uploadPath: image.uploadPath,
      expiresAt: Timestamp.fromMillis(now + 30 * 60_000),
      // Carried to completeImageUpload, which settles the moderation record
      // only once the new bytes are actually live.
      ...(replaces ? { replaces } : {}),
    });
  });
  return { ok: true };
});

/** Read only WebP container/frame headers; native image decoders run later without Firestore credentials. */
export function webpDimensions(header: Buffer, totalSize: number): { width: number; height: number } | null {
  if (header.length < 30 || header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 12) !== "WEBP"
    || header.readUInt32LE(4) + 8 !== totalSize) return null;
  const chunk = header.toString("ascii", 12, 16);
  const chunkSize = header.readUInt32LE(16);
  if (chunkSize < 5 || chunkSize + 20 > totalSize) return null;
  let width: number;
  let height: number;
  if (chunk === "VP8 ") {
    if (chunkSize < 10 || header[23] !== 0x9d || header[24] !== 0x01 || header[25] !== 0x2a) return null;
    width = header.readUInt16LE(26) & 0x3fff;
    height = header.readUInt16LE(28) & 0x3fff;
  } else if (chunk === "VP8L") {
    if (header[20] !== 0x2f) return null;
    width = 1 + (header[21] | ((header[22] & 0x3f) << 8));
    height = 1 + ((header[22] >> 6) | (header[23] << 2) | ((header[24] & 0x0f) << 10));
  } else if (chunk === "VP8X") {
    if (chunkSize < 10) return null;
    width = 1 + (header[24] | (header[25] << 8) | (header[26] << 16));
    height = 1 + (header[27] | (header[28] << 8) | (header[29] << 16));
  } else return null;
  return width > 0 && width <= 10000 && height > 0 && height <= 10000 ? { width, height } : null;
}

/**
 * WHAT A REPLACED PICTURE KEEPS OF ITS REVIEW (2026-09-23, Josh: "reset
 * ratings, keep hidden"). Moderation is post-hoc — uploads go live and admins
 * rank or hide them afterwards — so the danger in a replacement is a grade or
 * a hide judged on bytes that are no longer there:
 *
 * - RATINGS RESET. Every admin's rating was of the old picture, so the new one
 *   arrives with none and lands back in each admin's queue
 *   (adminListRatingQueue lists what the caller has not rated).
 * - HIDDEN STAYS. Otherwise replacing would be the way round a hide.
 *
 * The old id's own record is left for the sweep to retire with the old image.
 */
function settleReplacedModeration(
  tx: FirebaseFirestore.Transaction, imageId: string, replaces: string, old: FirebaseFirestore.DocumentData,
): void {
  if (replaces === imageId) {
    tx.update(db.doc(`imageModeration/${imageId}`), {
      ratings: FieldValue.delete(), score: FieldValue.delete(), scoredAt: FieldValue.delete(),
    });
  } else if (old.hidden === true) {
    tx.set(db.doc(`imageModeration/${imageId}`), {
      hidden: true, hiddenBy: old.hiddenBy ?? null, hiddenAt: old.hiddenAt ?? null,
    });
  }
}

/** Only the server can publish a record after the uploaded object matches its declared dimensions. */
export const completeImageUpload = onCall({ maxInstances: 3 }, async (req) => {
  const uid = requireUser(req);
  const imageId = req.data?.imageId;
  if (typeof imageId !== "string" || (imageId !== `${uid}-avatar` && imageId !== `${uid}-gallery` && !UUID.test(imageId))) {
    throw new HttpsError("invalid-argument", "Invalid image id.");
  }
  if ((await db.doc(`deletions/${uid}`).get()).exists) throw new HttpsError("failed-precondition", "Account deletion is pending or completed.");
  const imageRef = db.doc(`images/${imageId}`);
  const permitRef = db.doc(`uploadPermits/${imageId}.webp`);
  const [image, permit] = await Promise.all([imageRef.get(), permitRef.get()]);
  const data = image.data();
  const allocation = permit.data();
  if (!data || data.ownerUid !== uid || data.origin !== "member" || data.status !== "uploading"
    || data.storagePath !== `users/${uid}/${data.kind}/${imageId}.webp`
    || !allocation || allocation.ownerUid !== uid || allocation.imageId !== imageId
    || allocation.storagePath !== data.storagePath
    || allocation.uploadPath !== `pending/${uid}/${data.kind}/${imageId}.webp`
    || allocation.expiresAt?.toMillis() <= Date.now()) {
    throw new HttpsError("permission-denied", "Upload authorization is missing or expired.");
  }
  const bucket = getBucket();
  const file = bucket.file(allocation.uploadPath);
  let metadata;
  let header;
  try {
    [metadata] = await file.getMetadata();
    const size = Number(metadata.size);
    if (metadata.contentType !== "image/webp" || !metadata.generation || !Number.isSafeInteger(size) || size < 30
      || size > (data.kind === "avatar" ? 2 : 8) * 1024 * 1024) {
      throw new HttpsError("invalid-argument", "Uploaded file is not a valid WebP image.");
    }
    [header] = await bucket.file(allocation.uploadPath, { generation: metadata.generation }).download({ start: 0, end: 63 });
    const dimensions = webpDimensions(header, size);
    if (!dimensions || dimensions.width !== data.width || dimensions.height !== data.height) {
      throw new HttpsError("invalid-argument", "Uploaded image dimensions do not match the record.");
    }
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("failed-precondition", "Uploaded image is unavailable.");
  }
  // The source generation is pinned. A concurrent overwrite can only cause
  // the copy to fail; it cannot swap different bytes into the public path.
  let publishedGeneration: string | undefined;
  try {
    const [, response] = await bucket.file(allocation.uploadPath, { generation: metadata.generation }).copy(bucket.file(data.storagePath), {
      contentType: "image/webp",
      cacheControl: imageId === `${uid}-${data.kind}` ? "public, max-age=60" : "public, max-age=31536000, immutable",
      metadata: { ownerUid: uid, imageId },
    });
    publishedGeneration = (response as { resource?: { generation?: string } }).resource?.generation;
  } catch {
    throw new HttpsError("failed-precondition", "Uploaded image changed before validation completed.");
  }
  try {
    await db.runTransaction(async (tx) => {
      if ((await tx.get(db.doc(`deletions/${uid}`))).exists) throw new HttpsError("failed-precondition", "Account deletion is pending or completed.");
      const replaces = typeof allocation.replaces === "string" ? allocation.replaces : null;
      const [currentImage, currentPermit, oldModeration] = await Promise.all([
        tx.get(imageRef), tx.get(permitRef), replaces ? tx.get(db.doc(`imageModeration/${replaces}`)) : null,
      ]);
      if (currentImage.data()?.status !== "uploading" || currentPermit.data()?.ownerUid !== uid
        || currentPermit.data()?.storagePath !== data.storagePath
        || currentPermit.data()?.uploadPath !== allocation.uploadPath
        || currentPermit.data()?.expiresAt?.toMillis() <= Date.now()) {
        throw new HttpsError("failed-precondition", "Upload authorization changed during validation.");
      }
      tx.update(imageRef, { status: "live", updatedAt: Timestamp.now() });
      tx.delete(permitRef);
      if (oldModeration?.exists) settleReplacedModeration(tx, imageId, replaces!, oldModeration.data()!);
    });
  } catch (error) {
    // Remove only the generation this call published; preserve any newer upload.
    if (publishedGeneration) await bucket.file(data.storagePath, { generation: publishedGeneration })
      .delete({ ignoreNotFound: true });
    throw error;
  }
  await file.delete({ ignoreNotFound: true }).catch(() => {});
  return { ok: true };
});
