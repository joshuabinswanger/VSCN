// THE JOIN BETWEEN A PROFILE'S ID LIST AND ITS IMAGE RECORDS.
//
// Since 2026-09-07 (Josh: "B looks cleaner, implement it" —
// documentation/20260907-works-on-the-record-design.md) the profile's
// `gallery` array is a list of image ids in display order and NOTHING else.
// Every word about a picture, its geometry and its colour live on
// images/{imageId}. This module turns the two into the GalleryItem shape the
// editor edits and the build renders from.
//
// PURE, AND KEPT THAT WAY. No firebase import, browser or admin: the build
// (firebase-admin, Node) and the editor (client SDK, browser) both call this,
// and the rule "a work is on the site when its id is listed, its record is
// live and its owner matches" must be written down exactly once. It is also
// what makes the rule unit-testable without an emulator.
import type { GalleryItem } from "./gallery.ts";

/** An images/{imageId} document with its id attached. Mirrors ImageDoc in functions/src/types.ts. */
export interface GalleryRecord {
  imageId: string;
  ownerUid: string;
  kind: string;
  status: string;
  storagePath: string;
  width: number;
  height: number;
  color?: string;
  caption?: string;
  captionDe?: string;
  description?: string;
  descriptionDe?: string;
  link?: string;
}

/**
 * The public download URL of a stored object — tokenless, which is what the
 * built pages have always rendered (see stripStorageToken in memberView.ts).
 * Objects under users/ are publicly readable, so no token is needed.
 */
export function storageUrl(bucket: string, storagePath: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

/** What every array write sends: the ids, in the order the member arranged them. */
export function galleryIds(items: readonly { imageId: string }[]): string[] {
  return items.map((item) => item.imageId).filter(Boolean);
}

/**
 * One stored element of the list. A string since 2026-09-07; an object with an
 * `imageId` before. THE OBJECT FORM IS TOLERATED FOR THE MIGRATION WINDOW ONLY:
 * a member who opens the new editor before scripts/migrate-gallery-to-ids.mjs
 * has run must keep their words, so the element's texts and link fill in
 * where the record has none, and the next array write stores ids. Remove the
 * object branch once both environments pass scripts/check-integrity.mjs.
 */
interface LegacyElement {
  imageId?: unknown;
  caption?: unknown;
  captionDe?: unknown;
  description?: unknown;
  descriptionDe?: unknown;
  link?: unknown;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function orderedGalleryItems(
  uid: string,
  stored: unknown,
  records: readonly GalleryRecord[],
  bucket: string,
): GalleryItem[] {
  if (!Array.isArray(stored)) return [];
  const byId = new Map<string, GalleryRecord>();
  for (const rec of records) {
    if (rec.ownerUid === uid && rec.kind === "gallery" && rec.status === "live") byId.set(rec.imageId, rec);
  }
  const seen = new Set<string>();
  const items: GalleryItem[] = [];
  for (const element of stored) {
    const legacy: LegacyElement | null =
      element && typeof element === "object" ? (element as LegacyElement) : null;
    const imageId = typeof element === "string" ? element : str(legacy?.imageId);
    if (!imageId || seen.has(imageId)) continue;
    const rec = byId.get(imageId);
    if (!rec || !(rec.width > 0) || !(rec.height > 0)) continue;
    seen.add(imageId);
    const item: GalleryItem = {
      imageId,
      url: storageUrl(bucket, rec.storagePath),
      caption: str(rec.caption) ?? str(legacy?.caption) ?? "",
      width: rec.width,
      height: rec.height,
    };
    if (rec.color) item.color = rec.color;
    const captionDe = str(rec.captionDe) ?? str(legacy?.captionDe);
    const description = str(rec.description) ?? str(legacy?.description);
    const descriptionDe = str(rec.descriptionDe) ?? str(legacy?.descriptionDe);
    const link = str(rec.link) ?? str(legacy?.link);
    if (captionDe) item.captionDe = captionDe;
    if (description) item.description = description;
    if (descriptionDe) item.descriptionDe = descriptionDe;
    if (link) item.link = link;
    items.push(item);
  }
  return items;
}
