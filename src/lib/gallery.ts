import { storage } from "./firebase.ts";
import { ref, uploadBytesResumable } from "firebase/storage";
import { deleteStorageFile, publicStorageUrl } from "./storage.ts";
import { decodeImage, toWebpBlob, dominantColor, rejectionMessage } from "./image.ts";

// Keep in sync with validGallery() in firestore.rules.
export const MAX_GALLERY_IMAGES = 8;
export const MAX_GALLERY_CAPTION = 140;
export const MAX_GALLERY_DESCRIPTION = 600;

const MAX_EDGE = 2000;
const MAX_RAW_BYTES = 25 * 1024 * 1024;

export interface GalleryItem {
  url: string;
  /**
   * One line. Doubles as the image's alt text and the directory card's
   * accessible name, which is why it stays short — a paragraph read aloud
   * before every other image is worse than no caption at all.
   */
  caption: string;
  width: number;
  height: number;
  /** Dominant color (#rrggbb), shown while the image loads. Optional: pre-existing items have none. */
  color?: string;
  /**
   * The long text: what the image is, how it was made, who it was for. Shown
   * only under the image on the member's profile page, never as alt text.
   */
  description?: string;
}

/**
 * Drops keys no longer in GalleryItem from a stored array.
 *
 * Exists for exactly one withdrawn field: `projectId`, the tag into a member's
 * projects, removed with the feature on 2026-09-01. firestore.rules now
 * rejects a gallery item carrying an unlisted key (validGalleryItem's
 * `hasOnly`), so a member whose images were tagged before the withdrawal could
 * not save AT ALL — not the gallery, not their name, nothing — because the
 * editor loads the stored array and writes it back whole. Stripping on the way
 * IN is what makes that save legal, and it also means the stale tags leave
 * Firestore on the member's next save rather than lingering forever.
 *
 * Whitelist rather than a `delete projectId`: the next field this happens to
 * needs no second function, and a shape the rules will accept is the actual
 * requirement — not the absence of one particular ghost.
 */
export function sanitizeGalleryItems(value: unknown): GalleryItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((raw): raw is Record<string, unknown> => Boolean(raw) && typeof raw === "object")
    .map((raw) => {
      const item: GalleryItem = {
        url: String(raw.url ?? ""),
        caption: typeof raw.caption === "string" ? raw.caption : "",
        width: Number(raw.width ?? 0),
        height: Number(raw.height ?? 0),
      };
      if (typeof raw.color === "string") item.color = raw.color;
      if (typeof raw.description === "string" && raw.description) item.description = raw.description;
      return item;
    })
    .filter((item) => item.url && item.width > 0 && item.height > 0);
}

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  color: string;
}

export function validateGalleryFile(file: File): { ok: boolean; error?: string } {
  if (file.size > MAX_RAW_BYTES) {
    return { ok: false, error: "Image must be under 25 MB." };
  }
  const rejection = rejectionMessage(file);
  if (rejection) return { ok: false, error: rejection };
  return { ok: true };
}

/**
 * Resizes to MAX_EDGE on the longest side (never upscales) and re-encodes
 * as WebP. Canvas re-encoding also strips EXIF metadata (GPS etc.);
 * decodeImage bakes in the correct rotation first.
 */
export async function compressGalleryImage(file: File | Blob): Promise<CompressedImage> {
  const bitmap = await decodeImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const color = dominantColor(canvas);
  const blob = await toWebpBlob(canvas);
  return { blob, width, height, color };
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
