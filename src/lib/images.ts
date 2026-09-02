import { deleteField, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytesResumable } from "firebase/storage";
import { db, storage } from "./firebase.ts";

// Keep in sync with validImage() in firestore.rules and functions/src/types.ts.
export type ImageKind = "avatar" | "gallery";
export type ImageStatus = "uploading" | "live" | "pendingDeletion";

export interface ImageDimensions {
  width: number;
  height: number;
  /** Dominant colour (#rrggbb), the placeholder shown while the image loads. */
  color?: string;
}

export interface UploadedImage {
  imageId: string;
  url: string;
  storagePath: string;
}

export function publicStorageUrl(storagePath: string): string {
  const bucket = storage.app.options.storageBucket ?? "";
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

/** The record id IS the filename and the owner IS the folder — rules check exactly this. */
export function imageStoragePath(uid: string, kind: ImageKind, imageId: string): string {
  return `users/${uid}/${kind}/${imageId}.webp`;
}

export async function blobDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dims;
}

/**
 * Record first, bytes second, `live` third.
 *
 * The order is the whole design: a Storage object can never exist without an
 * images/ document pointing at it, so a tab closed mid-upload leaves a record
 * in `uploading` that sweepImages finds by query — not an unreferenced file
 * that only a bucket crawl could. firestore.rules requires the create to be
 * `uploading`, so this order is enforced, not merely followed.
 */
export async function uploadImage(
  uid: string,
  kind: ImageKind,
  blob: Blob,
  dims: ImageDimensions,
  onProgress: (pct: number) => void = () => {},
): Promise<UploadedImage> {
  const imageId = crypto.randomUUID();
  const storagePath = imageStoragePath(uid, kind, imageId);
  const recordRef = doc(db, "images", imageId);

  await setDoc(recordRef, {
    ownerUid: uid,
    kind,
    storagePath,
    width: dims.width,
    height: dims.height,
    ...(dims.color ? { color: dims.color } : {}),
    origin: "member",
    status: "uploading",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, storagePath), blob, {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
      // The object knows its owner even when found outside its path.
      customMetadata: { ownerUid: uid, imageId },
    });
    task.on(
      "state_changed",
      (snap) => onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      () => resolve(),
    );
  });

  await updateDoc(recordRef, { status: "live", updatedAt: serverTimestamp() });
  return { imageId, url: publicStorageUrl(storagePath), storagePath };
}

/** Members mark; sweepImages deletes bytes and record together. */
export async function markImageForDeletion(imageId: string): Promise<void> {
  if (!imageId) return;
  await updateDoc(doc(db, "images", imageId), {
    status: "pendingDeletion",
    updatedAt: serverTimestamp(),
  });
}

/** Captions and descriptions live on the record; the gallery array is a projection. */
export async function updateImageText(
  imageId: string,
  text: { caption: string; description?: string },
): Promise<void> {
  await updateDoc(doc(db, "images", imageId), {
    caption: text.caption,
    description: text.description ? text.description : deleteField(),
    updatedAt: serverTimestamp(),
  });
}
