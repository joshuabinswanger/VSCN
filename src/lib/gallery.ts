import { uploadImage, updateImageText } from "./images.ts";
import { decodeImage, toWebpBlob, dominantColor, rejectionMessage } from "./image.ts";

// Keep in sync with validGallery() in firestore.rules.
export const MAX_GALLERY_IMAGES = 8;

/**
 * What an account may hold BEFORE its email is verified (2026-09-02, Josh:
 * "make it so you can only upload 1 image until verified").
 *
 * This constant is the polite half of the cap: it is what lets the editor say
 * "verify your email" instead of letting a member pick a file, watch it
 * compress, and collect an opaque permission error. The enforcing half is in
 * the rulesets, where an unverified account can only address one image id per
 * kind at all (see slotImageId in src/lib/images.ts) — so a client that
 * ignored this number would still not get a second image.
 */
export const MAX_UNVERIFIED_GALLERY_IMAGES = 1;

/** How many gallery images this member may hold right now. */
export function galleryLimit(user: { emailVerified: boolean } | null | undefined): number {
  return user?.emailVerified ? MAX_GALLERY_IMAGES : MAX_UNVERIFIED_GALLERY_IMAGES;
}
export const MAX_GALLERY_CAPTION = 140;
export const MAX_GALLERY_DESCRIPTION = 600;

/**
 * THE SHORT DESCRIPTION'S CEILING (2026-09-03, Josh: "image descriptions
 * should have a long and short version: one for portfolio the rest for
 * lightbox and other places").
 *
 * One sentence, not a paragraph: this is the line that rides along with the
 * image everywhere the image is NOT the whole page — the lightbox band, the
 * directory's cards and tiles. The long `description` stays behind on the
 * member's own portfolio page, which is the one place there is room to read
 * it. 240 is about two lines at the lightbox band's measure, which is the
 * space the band can give a description without scrolling.
 */
export const MAX_GALLERY_DESCRIPTION_SHORT = 240;

/**
 * THE LONGEST EDGE OF A STORED IMAGE — 4K (2026-09-02, Josh: "cap max res at
 * 4k"). Was 2000, which was below the resolution of the artwork members
 * actually upload: a 4000px master downscaled to 2000 lost detail that the
 * lightbox, which serves the stored file at full screen, is exactly where you
 * would notice.
 *
 * IT IS A CAP ON PIXELS, AND THEREFORE ON BYTES. Four times the pixel count is
 * roughly four times the WebP, and `storage.rules` rejects an oversized upload
 * with an opaque permission error — see MAX_STORED_BYTES there, which was
 * raised with this and has to stay above whatever this produces.
 */
const MAX_EDGE = 4000;

/**
 * The raw upload ceiling, BEFORE the re-encode above — raised from 25 MB
 * (2026-09-02, Josh: "raise file size limit (images get optimized anyways)").
 * It is not a storage limit: nothing this size is ever stored, because
 * compressGalleryImage() re-encodes every file to a 4K WebP first. It is a
 * decode limit, and the reason there is still a number here at all: an
 * arbitrarily large bitmap is decoded in the browser, and decoded-image memory
 * is what crash-loops iOS Safari (see the SIZES notes in the community cards).
 * 50 MB clears any camera JPEG and any reasonable PNG export while keeping a
 * 200 MB scan from taking the tab down with it.
 */
const MAX_RAW_BYTES = 50 * 1024 * 1024;
const MAX_RAW_MB = Math.round(MAX_RAW_BYTES / (1024 * 1024));

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
   *
   * PORTFOLIO ONLY, since 2026-09-03. It used to travel to the lightbox as
   * well, which is why the lightbox band had to become a scroll container;
   * `descriptionShort` is what goes there now.
   */
  description?: string;
  /**
   * One sentence of the same thing, for everywhere that is not the member's
   * own page: the lightbox band, and anything else that shows an image
   * alongside other images. Optional and independent — a member may write
   * either, both or neither, and nothing derives one from the other (a
   * machine-truncated paragraph is not a summary).
   */
  descriptionShort?: string;
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
      if (typeof raw.descriptionShort === "string" && raw.descriptionShort)
        item.descriptionShort = raw.descriptionShort;
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
    // Derived from the constant, never typed twice: the old copy said "25 MB"
    // as a literal and would have gone on saying it after the limit moved.
    return { ok: false, error: `Image must be under ${MAX_RAW_MB} MB.` };
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
 *
 * The records are a SECONDARY projection, so a failure here must never fail
 * the Save: the array write is the primary and may already have landed, and
 * one stale imageId — a record swept between load and Save, or one that is not
 * this caller's — would take the whole Save down with Promise.all. Each
 * rejection is warned with its imageId and otherwise swallowed.
 */
export async function syncGalleryText(gallery: GalleryItem[]): Promise<void> {
  const items = gallery.filter((item) => item.imageId);
  const results = await Promise.allSettled(
    items.map((item) =>
      updateImageText(item.imageId, {
        caption: item.caption,
        description: item.description,
        descriptionShort: item.descriptionShort,
      }),
    ),
  );
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.warn(`[gallery] text sync skipped for image ${items[i].imageId}:`, result.reason);
    }
  });
}
