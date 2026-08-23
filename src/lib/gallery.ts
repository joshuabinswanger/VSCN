import { storage } from "./firebase.ts";
import { ref, uploadBytesResumable } from "firebase/storage";
import { deleteStorageFile, publicStorageUrl } from "./storage.ts";

// Keep in sync with validGallery() in firestore.rules.
export const MAX_GALLERY_IMAGES = 8;
export const MAX_GALLERY_CAPTION = 140;

const MAX_EDGE = 2000;
const WEBP_QUALITY = 0.82;
const MAX_RAW_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface GalleryItem {
  url: string;
  caption: string;
  width: number;
  height: number;
}

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
}

export function validateGalleryFile(file: File): { ok: boolean; error?: string } {
  if (file.size > MAX_RAW_BYTES) {
    return { ok: false, error: "Image must be under 25 MB." };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: "Only JPEG, PNG, or WebP images are allowed." };
  }
  return { ok: true };
}

/**
 * Resizes to MAX_EDGE on the longest side (never upscales) and re-encodes
 * as WebP. Canvas re-encoding also strips EXIF metadata (GPS etc.);
 * `imageOrientation: "from-image"` bakes in the correct rotation first.
 */
export async function compressGalleryImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))),
      "image/webp",
      WEBP_QUALITY,
    );
  });
  return { blob, width, height };
}

export function uploadGalleryImage(
  uid: string,
  blob: Blob,
  onProgress: (pct: number) => void = () => {},
): Promise<string> {
  const storagePath = `galleries/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
  const storageRef = ref(storage, storagePath);
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob, {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
    });
    task.on(
      "state_changed",
      (snap) => {
        onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      reject,
      () => resolve(publicStorageUrl(storagePath)),
    );
  });
}

/** Best-effort removal of gallery files in Storage (the Firestore array is the source of truth). */
export async function deleteGalleryImages(urls: string[]): Promise<void> {
  await Promise.all(urls.map((url) => deleteStorageFile(url)));
}
