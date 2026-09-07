import { collection, getDocs, query, where } from "firebase/firestore";
import { uploadImage, updateImageText } from "./images.ts";
import { db, storage } from "./firebase.ts";
import { orderedGalleryItems, type GalleryRecord } from "./galleryRecords.ts";
export { galleryIds } from "./galleryRecords.ts";
import {
  decodeImage,
  toWebpBlob,
  dominantColor,
  rejectionCode,
  WEBP_QUALITY,
} from "./image.ts";

/** The bucket the client SDK is configured for — the same one publicStorageUrl() in images.ts reads. */
function storageBucket(): string {
  return storage.app.options.storageBucket ?? "";
}

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
  /** The images/{imageId} record this item edits. Since 2026-09-07 the stored array holds only these ids; every other field here is read FROM the record — see galleryRecords.ts. */
  imageId: string;
  url: string;
  /**
   * One line. Doubles as the image's alt text and the directory card's
   * accessible name, which is why it stays short — a paragraph read aloud
   * before every other image is worse than no caption at all.
   */
  caption: string;
  /**
   * THE GERMAN CAPTION, OPTIONAL (2026-09-04, Josh: "caption also in german
   * no?" — the same day, right after descriptionDe). `caption` above is read
   * aloud as alt text, so it needs the same per-locale treatment description
   * got: a screen reader on the German page should speak German, not the
   * English line a member happened to write first. Same fallback as
   * descriptionDe — blank means the field above, not silence.
   */
  captionDe?: string;
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
   * THE GERMAN TEXT, OPTIONAL (2026-09-04, Josh: "english and german image
   * descriptions"). `description` above is the default — shown on the English
   * site always, and on the German site too until this field has something in
   * it, the same fallback `useTranslations()` already applies to every UI
   * string (`ui[lang][key] ?? ui.en[key]`). Kept separate from `description`
   * rather than the field itself becoming a `{en, de}` object: existing
   * profiles already have plain-string `description` values, and a shape
   * change would need a migration this field's own history (see `description`
   * above) argues against risking twice in one week.
   */
  descriptionDe?: string;
  /**
   * Where this image lives in the world: the paper it illustrates, the campaign
   * it ran in, the shop that sells the print. This is the useful half of what
   * the withdrawn `projects` feature carried — a link, without a second list to
   * maintain and without a dropdown that could point at a project that is gone.
   *
   * Stored WITHOUT a scheme ("nature.com/articles/…"), matching `portfolio` —
   * the editor shows a fixed `https://` prefix rather than asking anyone to
   * type one, and href() in links.ts puts it back for rendering. Lives on the
   * record since 2026-09-07; capped by validImage at 200.
   */
  link?: string;
}

/**
 * The member's gallery as the editor edits it: the profile's id list joined to
 * the member's own live records (2026-09-07 — the record is the work,
 * documentation/20260907-works-on-the-record-design.md). One query, then the
 * pure join in galleryRecords.ts. An id whose record is gone is dropped here
 * and leaves Firestore on the next array write.
 *
 * Replaces sanitizeGalleryItems(), which stripped withdrawn keys out of a
 * stored array of objects — there are no objects in the array to strip now.
 */
export async function loadGallery(uid: string, stored: unknown): Promise<GalleryItem[]> {
  const snap = await getDocs(
    query(
      collection(db, "images"),
      where("ownerUid", "==", uid),
      where("kind", "==", "gallery"),
      where("status", "==", "live"),
    ),
  );
  const records: GalleryRecord[] = snap.docs.map((d) => ({
    imageId: d.id,
    ...(d.data() as Omit<GalleryRecord, "imageId">),
  }));
  return orderedGalleryItems(uid, stored, records, storageBucket()).slice(0, MAX_GALLERY_IMAGES);
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

export interface GalleryRecordFailure {
  imageId: string;
  /** Position in the gallery, 0-based — the editor says "image 2", not an id. */
  index: number;
  error: unknown;
}

/**
 * Writes every image's words onto its record and REPORTS what failed.
 *
 * Until 2026-09-07 this was syncGalleryText(): best-effort, a console.warn per
 * failure, because the array carried the same text and the page rendered from
 * the array. The array carries nothing now, so a refused record write is the
 * member's caption GONE — and Save must say so rather than print "Changes
 * saved". allSettled, not all: one bad record (swept between load and Save,
 * or not this caller's) must not stop the other seven from landing.
 */
export async function saveGalleryRecords(items: readonly GalleryItem[]): Promise<GalleryRecordFailure[]> {
  const results = await Promise.allSettled(
    items.map((item) =>
      updateImageText(item.imageId, {
        caption: item.caption,
        captionDe: item.captionDe,
        description: item.description,
        descriptionDe: item.descriptionDe,
        link: item.link,
      }),
    ),
  );
  const failures: GalleryRecordFailure[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      failures.push({ imageId: items[index].imageId, index, error: result.reason });
    }
  });
  return failures;
}
