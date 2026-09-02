import { uploadImage, updateImageText } from "./images.ts";
import { decodeImage, toWebpBlob, dominantColor, rejectionMessage } from "./image.ts";

// Keep in sync with validGallery() in firestore.rules.
export const MAX_GALLERY_IMAGES = 8;
export const MAX_GALLERY_CAPTION = 140;
export const MAX_GALLERY_DESCRIPTION = 600;

const MAX_EDGE = 2000;
const MAX_RAW_BYTES = 25 * 1024 * 1024;

export interface GalleryItem {
  /** The images/{imageId} record this item projects. The record is the truth; this array is display order. */
  imageId: string;
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
 * Drops keys no longer in GalleryItem from a stored array, and normalises the ones that are.
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
        imageId: String(raw.imageId ?? ""),
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

/** Uploads through the record-first pipeline and returns the array item to append. */
export async function uploadGalleryImage(
  uid: string,
  image: CompressedImage,
  onProgress: (pct: number) => void = () => {},
): Promise<GalleryItem> {
  const { imageId, url } = await uploadImage(
    uid,
    "gallery",
    image.blob,
    { width: image.width, height: image.height, color: image.color },
    onProgress,
  );
  return { imageId, url, caption: "", width: image.width, height: image.height, color: image.color };
}

/**
 * Pushes typed text onto the records. Called from Save, alongside the array
 * write — the array carries the same text for the static build, but the
 * record is what an admin or a future feature reads.
 */
export async function syncGalleryText(gallery: GalleryItem[]): Promise<void> {
  await Promise.all(
    gallery
      .filter((item) => item.imageId)
      .map((item) => updateImageText(item.imageId, { caption: item.caption, description: item.description })),
  );
}
