import { uploadImage, updateImageText } from "./images.ts";
import {
  decodeImage,
  toWebpBlob,
  dominantColor,
  rejectionCode,
  WEBP_QUALITY,
} from "./image.ts";

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
 * THE PER-IMAGE LINK'S CEILING. Matches `portfolio` in firestore.rules,
 * because it holds the same kind of value: one URL, stored without its scheme.
 */
export const MAX_GALLERY_LINK = 200;

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
 * The raw upload ceiling, BEFORE the re-encode above.
 *
 * It is NOT a storage limit — nothing this size is ever stored, because
 * compressGalleryImage() re-encodes every file to a 4K WebP first, and a 17 MB
 * source measured 0.42 MB by the time it left the browser. It is a DECODE
 * limit, and that is the whole reason a number survives here: the bitmap is
 * decoded in the page before any of that happens, and decoded-image memory is
 * what crash-loops iOS Safari (see the SIZES notes in the community cards). A
 * 25 MB JPEG can expand past a gigabyte of RGBA, and the tab dies with no error
 * anywhere — which the member reads as an upload that simply did nothing.
 *
 * Raised to 50 MB on 2026-09-02 (Josh: "raise file size limit (images get
 * optimized anyways)") and brought back to 25 on 2026-09-03, once a 17 MB file
 * had gone through and made the decode cost concrete. The optimisation is real;
 * it just happens AFTER the expensive part. 25 MB still clears any camera JPEG
 * and any reasonable PNG export.
 */
const MAX_RAW_BYTES = 25 * 1024 * 1024;

/**
 * THE CEILING THE RE-ENCODE MUST ACTUALLY HIT, and the reason the ladders
 * below exist.
 *
 * `storage.rules` refuses a gallery object over 8 MB. Compression bounded
 * DIMENSIONS, not BYTES — a noisy 4000px image encodes well past that at
 * WEBP_QUALITY — and the refusal arrives as `storage/unauthorized`, the SAME
 * code an expired session gives. So the editor could not tell "this file will
 * never fit" from "sign in again", and answered both with "please try again"
 * forever. Guaranteeing the size here is what makes `unauthorized` mean one
 * thing by the time galleryErrorCode() sees it.
 *
 * Under the rules door rather than level with it: the door is on the stored
 * object, and a client that lands exactly on the number has no room for the
 * difference between what it measured and what it sent.
 */
const MAX_UPLOAD_BYTES = 7_800_000;

/**
 * How the re-encode gives ground, in order: quality first at full size,
 * because a 4K master at q0.62 is worth more than a 2400px one at q0.82 —
 * the lightbox serves the stored file at full screen. Size only once quality
 * has run out.
 */
const QUALITY_LADDER = [WEBP_QUALITY, 0.72, 0.62];
const EDGE_LADDER = [MAX_EDGE, 3000, 2400, 2000, 1600];

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
   * The long text: what the image is, how it was made, who it was for. Never
   * alt text — the caption is what gets read aloud.
   *
   * THE ONLY DESCRIPTION (2026-09-04, Josh: "we only need one description
   * field for the image"). For one day, 2026-09-03 to 2026-09-04, this was
   * portfolio-only and a second 240-character `descriptionShort` carried a
   * summary to the lightbox and the directory. Two fields asked every member
   * to write the same thing twice and to guess which surface each version
   * would land on, and almost nobody filled in both. The short field is gone;
   * this one travels everywhere again.
   *
   * Old `descriptionShort` values are deliberately NOT merged into this field:
   * doing so would overwrite a member's long text with their one-line summary
   * in exactly the cases where both exist. They are cleared instead, on the
   * owning member's next save — see the sweep in updateImageText.
   */
  description?: string;
  /**
   * Where this image lives in the world: the paper it illustrates, the campaign
   * it ran in, the shop that sells the print. This is the useful half of what
   * the withdrawn `projects` feature carried — a link, without a second list to
   * maintain and without a dropdown that could point at a project that is gone.
   *
   * Stored WITHOUT a scheme ("nature.com/articles/…"), matching `portfolio` —
   * the editor shows a fixed `https://` prefix rather than asking anyone to
   * type one, and href() in links.ts puts it back for rendering. A value that
   * cannot be a URL at all is dropped by the read path rather than rendered as
   * a dead link; see workLink() in links.ts and works() in memberView.ts.
   */
  link?: string;
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
      if (typeof raw.link === "string" && raw.link) item.link = raw.link;
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

/**
 * THE DISTINCT WAYS ONE IMAGE CAN FAIL TO REACH THE GALLERY.
 *
 * This type exists because the editor used to answer every one of them with
 * the same sentence — "Could not upload image. Please try again." — which is
 * useless for most of them and actively misleading for two: a session that has
 * expired and a file that will never fit do not improve on the next attempt.
 * The UI maps each code to its own message, and decides FROM THE CODE ALONE
 * whether offering Retry is honest.
 */
export type GalleryErrorCode =
  /** Bigger than MAX_RAW_BYTES before anything was even decoded. */
  | "tooBig"
  /** An SVG. Refused rather than rasterized — raw SVG serving is an XSS vector. */
  | "svg"
  /** HEIC/HEIF, which canvas cannot decode. */
  | "heic"
  /** Some other type outside ALLOWED_INPUT_TYPES. */
  | "type"
  /** The bytes are not an image this browser can decode: corrupt, or an exotic variant. */
  | "decode"
  /** Re-encoded every way the ladders allow and still over MAX_UPLOAD_BYTES. */
  | "tooLarge"
  /** Storage or the rules said no: the sign-in expired, or the object was refused. */
  | "denied"
  /** The connection went away mid-transfer. The one code that is purely worth retrying. */
  | "network"
  /** The project's Storage bucket is out of room. Nothing the member can do about it. */
  | "quota"
  /** The member pressed Cancel. Not a failure, but carried here so one path handles every ending. */
  | "cancelled"
  | "unknown";

export class GalleryError extends Error {
  constructor(readonly code: GalleryErrorCode) {
    super(code);
    this.name = "GalleryError";
  }
}

/**
 * Reduces anything thrown by the pipeline to one GalleryErrorCode.
 *
 * Firebase reports Storage failures as an object carrying a `code` string, and
 * the mapping is not one-to-one in the direction you would guess: a size
 * rejection by the rules and an expired token BOTH arrive as
 * `storage/unauthorized`. That ambiguity is precisely why compressGalleryImage
 * guarantees the size before anything is uploaded — by the time this function
 * sees `unauthorized`, the session is the only explanation left.
 *
 * Firestore codes travel through here too: the record-first pipeline writes an
 * images/{imageId} row BEFORE the bytes move, so a ruleset that refuses the
 * record fails with `permission-denied` rather than with anything
 * storage-shaped.
 */
export function galleryErrorCode(error: unknown): GalleryErrorCode {
  if (error instanceof GalleryError) return error.code;
  const code =
    typeof error === "object" && error !== null ? String(Reflect.get(error, "code") ?? "") : "";
  switch (code) {
    case "storage/canceled":
      return "cancelled";
    case "storage/unauthorized":
    case "storage/unauthenticated":
    case "permission-denied":
    case "unauthenticated":
      return "denied";
    case "storage/quota-exceeded":
    case "resource-exhausted":
      return "quota";
    case "storage/retry-limit-exceeded":
    case "unavailable":
      return "network";
    // `storage/unknown` is what a dropped connection surfaces as, and a dropped
    // connection is by far the likeliest unknown in a browser upload — so it
    // leans network rather than into the shrug.
    case "storage/unknown":
      return "network";
    default:
      return "unknown";
  }
}

/**
 * The checks that can be made from the File alone, before a byte is decoded.
 *
 * Returns a code rather than a sentence: the caller knows which language the
 * member is reading in, and this module does not. That is the whole change
 * from the old `{ ok, error }` shape, whose English strings were shown
 * verbatim to German members.
 */
export function validateGalleryFile(file: File): GalleryErrorCode | null {
  if (file.size > MAX_RAW_BYTES) return "tooBig";
  return rejectionCode(file);
}

/** Longest edge scaled down to `edge`; never upscales. */
function scaledSize(bitmap: ImageBitmap, edge: number): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  return { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) };
}

/**
 * Resizes to at most MAX_EDGE on the longest side (never upscales) and
 * re-encodes as WebP, STEPPING DOWN quality and then size until the result
 * fits under MAX_UPLOAD_BYTES. Canvas re-encoding also strips EXIF metadata
 * (GPS etc.); decodeImage bakes in the correct rotation first.
 *
 * Throws GalleryError — "decode" for bytes that are not a readable image,
 * "tooLarge" for an image the whole ladder cannot fit. Both name something the
 * member can act on, which is the entire reason they are codes and not one
 * generic failure.
 */
export async function compressGalleryImage(file: File | Blob): Promise<CompressedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decodeImage(file);
  } catch {
    // decodeImage throws a ready-made English sentence, shared with the avatar
    // path. Recast it as a code so the gallery picks its own localized wording
    // instead of surfacing a library's English at a German member.
    throw new GalleryError("decode");
  }

  try {
    let lastSize = "";
    for (const edge of EDGE_LADDER) {
      const { width, height } = scaledSize(bitmap, edge);
      // A source already smaller than the previous rung scales to the same
      // pixels twice, and re-encoding it would burn time producing bytes we
      // have already rejected.
      const size = `${width}x${height}`;
      if (size === lastSize) break;
      lastSize = size;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
      const color = dominantColor(canvas);

      for (const quality of QUALITY_LADDER) {
        const blob = await toWebpBlob(canvas, quality);
        if (blob.size <= MAX_UPLOAD_BYTES) return { blob, width, height, color };
      }
    }
    throw new GalleryError("tooLarge");
  } finally {
    bitmap.close();
  }
}

export interface UploadOptions {
  onProgress?: (pct: number) => void;
  /**
   * Handed the transfer's cancel function as soon as the bytes start moving,
   * so a per-image Cancel button in the queue has something to call.
   */
  onCancellable?: (cancel: () => void) => void;
}

/** Uploads through the record-first pipeline and returns the array item to append. */
export async function uploadGalleryImage(
  uid: string,
  image: CompressedImage,
  options: UploadOptions = {},
): Promise<GalleryItem> {
  const { imageId, url } = await uploadImage(
    uid,
    "gallery",
    image.blob,
    { width: image.width, height: image.height, color: image.color },
    options.onProgress,
    options.onCancellable,
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
      }),
    ),
  );
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.warn(`[gallery] text sync skipped for image ${items[i].imageId}:`, result.reason);
    }
  });
}
